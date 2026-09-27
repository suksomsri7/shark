// QC — CRM v2 WO C3.5: B2B customer portal at `/b/[slug]/*` (decisions C7 · C15 · RESOLUTIONS R-C.5 / R-E.13) — invite (single-use
//      hashed token · 7 days · e-mail/LINE) · login EMAIL_OTP / LINE on the sibling table `PortalSession` (customer-session logic reused,
//      not forked) · company switcher · quotations respond (→ account.respondQuotation by PORTAL + signer → `account.quotation.responded`
//      → deal stage through the existing consumer) · invoices + existing `/pay/<token>` link + PRIVATE slip upload · receipts · documents
//      (portalVisible custom records of OWN company, portalVisible fields only · portalEditable edits become requests) · requests (ISSUE →
//      kanban card + status map · CONTACT/PROFILE_CHANGE → approval `crm.portal_request`) · contacts of the company · staff invite/revoke/
//      last login · revoke ⇒ sessions dead immediately · events crm.portal.viewed / .quote.responded / .request.created.
// Oracle writer · the C3.5 builder must NOT touch this file · QC database only (the env loader of scripts/acc-v2-env.mts; run on QC3)
// Run: bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.5.mts
//      `--force-run` = run every check while `crm/portal.ts` is absent — C3.5 checks red for the right reason ("MISSING_FUNCTION" /
//                      no rows / static file absent), fixtures + positive controls + CLEAN green, no crash
//      `--x3-worker …` = internal worker mode (own PrismaClient = own pool) — see the WORKER block
// requires: crm-seed   (house style — this oracle reads NO seeded row: everything lives in throwaway tenants `qc-c35-<rand>-*`)
//
// SOURCES: crm-brief-C3.5.md (+ its "Addendum (oracle author)") · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-C.5 PortalSession ·
//   R-C.8 `#` keys · R-C.10 `crm.portal_request` · R-D `crm-bridges/portal.ts` · R-E.2 private files · R-E.13 status map · R-E.14 uiVersion)
//   · crm-brief-C3.0.md addendum 5–6 (PortalSession.ipHash · inviteTokenHash unique + inviteExpiresAt 7 d · loginMethods · revokedAt ·
//   cascade FKs) · CRM-RUN §2 "C3.5" (S1 5 · S2 4 · S3 4 · S4 5 · S5 4 · S6 2 · S7 6 = 30) · MASTER-PLAN §4 (X1 X3 X4 X7 X8 X9 X10) ·
//   blueprint §3.13 · §5.9 portal.ts · §6.4 · §7.1 (portal events) · §11.8 · §15 C15/C17 · mockup ledger/design-crm/12-portal-b2b.png ·
//   code: member/customer-session.ts (requestOtp/verifyOtp buckets `customer-otp:target:<tid>:<CH>:<target>` · `customer-otp:ip:<ip>` ·
//   `customer-otp:verify:ip:<ip>` · devOtp under QC_OTP_PREVIEW=1 · cs_ tokens sha256) · customer-cookie.ts · account/index.ts
//   (respondQuotation {by:"PORTAL", signer} · createPaymentRequestForDoc → `/pay/<token>`) · storage/private-links.ts (viewer-bound
//   HMAC links) · app/api/files/[id]/route.ts · kanban/links.createCardFromExternal · approval/service (submitForApproval · decide).
//
// ══════════════════════════════════ CONTRACT (oracle-proposed — details in the brief addendum) ══════════════════════════════════
//   A. `src/lib/modules/crm/portal.ts` (namespace `portal` in crm/index.ts, block `// CRM C3.5 ▸ … ◂`) — customer entry points take the
//      RAW session token first (every call re-resolves the session ⇒ revoke is immediate); staff entry points take (ctx, actor).
//      public: portalShopBySlug(slug) · acceptInvite(slug,{token},meta) · requestOtp(slug,{email|phone},{ip}) · verifyOtp({otpId,code},meta)
//        · loginWithLine(slug,{lineUserId,email?,phone?,inviteToken?},meta) · switchCompany(token,companyId,meta) · logout(token)
//      session (here or in customer-session.ts): PORTAL_TOKEN_PREFIX · isPortalToken · portalCookieName · mintPortalSession(accessId,meta)
//        · getPortalSession(token) → {sessionId,tenantId,crmSystemId,portalAccessId,companyId,crmContactId,role,expiresAt} | null
//        · revokeAllPortalSessions(accessId)
//      customer: home · listQuotations · getQuotation · respondQuotation(token,id,{accept,reason?,signerName},meta) · listInvoices ·
//        getInvoice · payLink(token,invoiceId) · uploadSlip(token,{invoiceId,filename,contentType,data},deps?) · listReceipts ·
//        listDocuments · getRecord · requestRecordChange(token,recordId,{fieldKey,value}) · listRequests · getRequest ·
//        createRequest(token,{kind,title,body?,payload?}) · listContacts
//      staff: invite(ctx,actor,{companyId,contactId,role?,loginMethods?}) → {accessId,inviteUrl,expiresAt} · revoke(ctx,actor,{accessId,
//        reason?}) · listAccess(ctx,actor,{companyId}) · decideRequest(ctx,actor,{requestId,approve,reason?}) · eraseContact(ctx,contactId)
//   B. errors: `.code` ∈ NOT_FOUND | VALIDATION | FORBIDDEN | UNAUTHORIZED | RATE_LIMITED (+ CustomerAuthError / CustomerRateLimitError of
//      customer-session) with a Thai message that never blames the user.
//   C. private file viewer `{ kind: "PORTAL", id: PortalSession.id }` (storage/private-links.ts grows a third kind).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY: S0 4 (structure) · T0 2 (fixture self-tests, green before the build) · S1 5 · S2 4 · S3 4 · S4 5 · S5 4 · S6 2 · S7 6 (S1–S7 = the 30 of CRM-RUN §2) · X1 7 · X3 4 (+4
//   worker controls) · X4 1 · X7 5 · X8 4 · X9 1 · X10 4 · CLEAN  (C3.5-FATAL only when something throws)
//   n/a: X2 (portal REST ops are C3.8's key/tool matrix; the portal lane here is a customer session, never an API key — X1.5 proves a
//   portal token cannot reach a staff op) · X5 (no lease job) · X6 (slip mime/size = the existing C0.4/C1.6 allowlist, reused).
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants swept in `finally` (every table with tenantId, 4 passes) + users +
//   the ChatRateBucket rows this run created (keys carrying our tenant ids / our private IP prefix) · NO global drainOutbox — our own
//   events are hand-delivered to the consumer map by id · Bunny/Resend/LINE are never contacted (fetch stubbed, storage `put` injected) ·
//   every expected value is computed here from the fixture (never by the service) · races run in worker PROCESSES · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { needsRegistryRow } from "./lib/crm-testid-scan.mjs"; // ORACLE-EDIT (sweep 27 Sep, C4.1 registry policy)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const PORTAL_FILE = "src/lib/modules/crm/portal.ts";
const PORTAL_SHARED_FILE = "src/lib/modules/crm/portal-shared.ts";
const PORTAL_SPEC = "@/lib/modules/crm/portal";
const PORTAL_SHARED_SPEC = "@/lib/modules/crm/portal-shared";
const CS_FILE = "src/lib/modules/member/customer-session.ts";
const CS_SPEC = "@/lib/modules/member/customer-session";
const COOKIE_FILE = "src/lib/modules/member/customer-cookie.ts";
const BRIDGE_FILE = "src/lib/platform/crm-bridges/portal.ts";
const INDEX_FILE = "src/lib/modules/crm/index.ts";
const LABELS_FILE = "src/lib/automation/labels.ts";
const WEBHOOK_LABELS = "src/lib/webhooks/labels.ts";
const CONSUMERS_FILE = "src/lib/outbox-consumers.ts";
const PRIVATE_LINKS_FILE = "src/lib/storage/private-links.ts";
const FILE_ROUTE_FILE = "src/app/api/files/[id]/route.ts";
const FILE_ROUTE_SPEC = "@/app/api/files/[id]/route";
const CRM_ROUTE_SPEC = "@/app/api/v1/crm/[...path]/route";
const B_DIR = "src/app/b/[slug]";
const P_DIR = "src/app/p/[slug]";
const COMP_DIR = "src/components/crm/portal";
const INVENTORY = "scripts/crm-ui-inventory.json";
const SCHEMA_DIR = "prisma/schema";
const MIG_DIR = "prisma/migrations";
const C30_MIG = "20261102000000_crm_v2_c";
const THIS_FILE = "scripts/qc-crm-c3.5.mts";
const EVENTS = ["crm.portal.viewed", "crm.portal.quote.responded", "crm.portal.request.created"];

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
const FORCE = ARGV.includes("--force-run");
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir: string, re = /\.(ts|tsx)$/): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, re));
    else if (re.test(name)) out.push(p);
  }
  return out.sort();
};

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — crm/portal.ts absent (or its C3.0 tables absent) ⇒ SKIPPED, no DB connection.
// ═══════════════════════════════════════════════════════════════════════════════════
const BUILT = read(PORTAL_FILE).length > 0;
const schemaAll = existsSync(SCHEMA_DIR) ? readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".prisma")).map((f) => read(join(SCHEMA_DIR, f))).join("\n") : "";
const C30 = /model\s+PortalSession\s*\{/.test(schemaAll) && /inviteTokenHash/.test(schemaAll) && existsSync(join(MIG_DIR, C30_MIG));
if (WORKER_AT < 0 && !FORCE && (!BUILT || !C30)) {
  const why = !BUILT ? `WO C3.5 not built yet (${PORTAL_FILE} absent)${C30 ? "" : " — and its prerequisite C3.0 (PortalSession · *_crm_v2_c) is absent too"}` : "prerequisite C3.0 absent: PortalSession / CrmPortalAccess.inviteTokenHash / prisma/migrations/*_crm_v2_c not in the tree";
  console.log(`⚠️  SKIPPED — ${why} (run with --force-run to exercise the fixtures, the controls and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ═══════════════════════════════════════════════════════════════════════════════════
// Environment BEFORE any app module loads: OTP preview (QC), fake mail key (so the mail path is really taken — the stub answers),
// fake storage identity (Bunny is never reachable).
// ═══════════════════════════════════════════════════════════════════════════════════
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c35-${rand}`;
const CDN = `https://${TAG}-cdn.invalid`;
const BUNNY_STORAGE_HOST = "storage.bunnycdn.com";
process.env.QC_OTP_PREVIEW = "1";
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_qc_c35_stub";
process.env.SHARK_BUNNY_CDN = CDN;
process.env.SHARK_BUNNY_ZONE = `${TAG}-zone`;
process.env.SHARK_BUNNY_KEY = `qc-c35-access-key-${rand}`;
delete process.env.BUNNY_ACCOUNT_KEY;

// ═══════════════════════════════════════════════════════════════════════════════════
// fetch stub — Resend (captured + optional delay) · LINE · Bunny storage (PUT/GET served from memory) · anything else external = stub 200
// ═══════════════════════════════════════════════════════════════════════════════════
type Mail = { to: string; subject: string; body: string };
const MAILS: Mail[] = [];
const LINE_CALLS: string[] = [];
const EXTERNAL: string[] = [];
const OBJECTS = new Map<string, { bytes: Uint8Array; contentType: string }>();
let emailDelayMs = 0;
const realFetch = globalThis.fetch.bind(globalThis);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  const method = String(init?.method ?? input?.method ?? "GET").toUpperCase();
  if (/api\.resend\.com/i.test(url)) {
    const raw = typeof init?.body === "string" ? init.body : "";
    let to = "";
    let subject = "";
    try { const b = JSON.parse(raw); to = Array.isArray(b?.to) ? b.to.join(",") : String(b?.to ?? ""); subject = String(b?.subject ?? ""); } catch { /* raw kept */ }
    MAILS.push({ to, subject, body: raw });
    if (emailDelayMs > 0) await sleep(emailDelayMs);
    return new Response(JSON.stringify({ id: `${TAG}-mail` }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (/api\.line\.me/i.test(url)) {
    LINE_CALLS.push(`${method} ${url} ${typeof init?.body === "string" ? init.body : ""}`);
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes(BUNNY_STORAGE_HOST) || url.startsWith(CDN) || url.includes("bunny.net")) {
    if (method === "PUT") {
      const zoneAt = url.indexOf(`/${process.env.SHARK_BUNNY_ZONE}/`);
      const path = zoneAt >= 0 ? url.slice(zoneAt + String(process.env.SHARK_BUNNY_ZONE).length + 2) : url;
      const bytes = init?.body ? new Uint8Array(await new Response(init.body as Any).arrayBuffer()) : new Uint8Array();
      OBJECTS.set(path, { bytes, contentType: String(init?.headers?.["Content-Type"] ?? init?.headers?.["content-type"] ?? "application/octet-stream") });
      return new Response("{}", { status: 201 });
    }
    for (const [path, obj] of OBJECTS) {
      if (url.includes(path)) return new Response(obj.bytes.slice().buffer as ArrayBuffer, { status: 200, headers: { "content-type": obj.contentType, "content-length": String(obj.bytes.length) } });
    }
    return new Response("not found", { status: 404 });
  }
  if (/^https?:\/\//i.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/i.test(url) && !/neon\.tech|neon\.build/i.test(url)) {
    EXTERNAL.push(`${method} ${url}`);
    return new Response(JSON.stringify({ stub: "qc-c35" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const nm of names) {
    let v: Any = mod;
    for (const p of nm.split(".")) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const codeOf = (e: Any) => String(e?.code ?? "-");

// ═══════════════════════════════════════════════════════════════════════════════════
// WORKER MODE — this file re-invoked as a child process (own PrismaClient = own pool, synchronised start per round).
//   argv: --x3-worker <startAtMs> <base64url(JSON { ipBase, rounds: { atMs, calls: { ph, fn, a, n }[] }[] })>
//   fn: respond (portal.respondQuotation) · accept (portal.acceptInvite) · view (portal.home)
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const PW = ((await import("@/lib/core/db")) as Any).prisma as Any;
  const PMw = (await import(PORTAL_SPEC as string).catch(() => ({}))) as Any;
  const arg = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8")) as { ipBase: string; rounds: { atMs: number; calls: { ph: string; fn: string; a: Any; n: number }[] }[] };
  let ipn = 0;
  const err = (e: unknown) => `ERR:${codeOf(e)}:${(e instanceof Error ? e.message : String(e)).slice(0, 100)}`;
  const one = async (c: { fn: string; a: Any }): Promise<string> => {
    try {
      if (c.fn === "respond") {
        const f = fnOf(PMw, "respondQuotation");
        if (typeof f !== "function") return "ERR:MISSING_FUNCTION";
        const v = await f(c.a.token, c.a.docId, { accept: c.a.accept, reason: c.a.reason, signerName: c.a.signer }, { ip: `${arg.ipBase}.${(ipn += 1)}`, userAgent: "qc-c35-worker" });
        return v && v.ok === false ? `NO:${String(v.reason ?? "").slice(0, 60)}` : "OK";
      }
      if (c.fn === "accept") {
        const f = fnOf(PMw, "acceptInvite");
        if (typeof f !== "function") return "ERR:MISSING_FUNCTION";
        const v = await f(c.a.slug, { token: c.a.token }, { ip: `${arg.ipBase}.${(ipn += 1)}`, userAgent: "qc-c35-worker" });
        return typeof v?.token === "string" && v.token ? "OK:session" : `NO:${JSON.stringify(v ?? null).slice(0, 60)}`;
      }
      if (c.fn === "view") {
        const f = fnOf(PMw, "home");
        if (typeof f !== "function") return "ERR:MISSING_FUNCTION";
        await f(c.a.token);
        return "OK";
      }
      return "ERR:unknown-fn";
    } catch (e) { return err(e); }
  };
  const out: string[] = [];
  for (const round of arg.rounds) {
    const ms = Number(wStart) + round.atMs - Date.now();
    if (ms > 0) await sleep(ms);
    const jobs = round.calls.flatMap((c) => Array.from({ length: c.n }, () => c));
    out.push(...(await Promise.all(jobs.map(async (c) => `${c.ph}:${await one(c)}`))));
  }
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  await PW.$disconnect();
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════════════════
// A real Next request scope, so a route handler that calls `cookies()`/`headers()` works in-process (same technique as qc-crm-c0.4).
// ═══════════════════════════════════════════════════════════════════════════════════
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
async function withRequestScope<T>(req: Request, route: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) return fn();
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null };
  const unit = {
    type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar,
    userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {},
    url: { pathname: new URL(req.url).pathname, search: new URL(req.url).search },
  };
  try {
    return await nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
  } catch (e) {
    if (/AsyncLocalStorage accessed in runtime/.test(String((e as Error)?.message ?? ""))) return fn();
    throw e;
  }
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, nm: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${nm}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, k = 240) => { const s = String(v ?? ""); return s.length > k ? `${s.slice(0, k)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const thai = (s: unknown) => /[ก-๙]/.test(String(s ?? ""));
const BLAME = /คุณ(ทำ|กรอก|ใส่|เลือก)?ผิด|ผู้ใช้ผิด|ความผิดของคุณ|โง่|ผิดพลาดของคุณ/;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
type Res = { ok: boolean; v: Any; err: string; code: string; name: string; msg: string };
const MISSING: Res = { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", name: "", msg: "" };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return MISSING;
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", name: "", msg: "" };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), name: String(x?.name ?? ""), msg };
  }
};
/** a result that "did the thing": resolved and not `{ ok:false }` */
const good = (r: Res) => r.ok && !(r.v && typeof r.v === "object" && r.v.ok === false);
const refused = (r: Res) => r.code !== "MISSING_FUNCTION" && ((!r.ok && thai(r.msg) && !BLAME.test(r.msg)) || (r.ok && r.v?.ok === false && thai(r.v?.reason ?? r.v?.message) && !BLAME.test(String(r.v?.reason ?? r.v?.message))));
const isNF = (r: Res) => refused(r) && (r.code === "NOT_FOUND" || /NotFound/i.test(r.name) || r.v?.code === "NOT_FOUND");
const isVal = (r: Res) => refused(r) && (r.code === "VALIDATION" || r.v?.code === "VALIDATION");
const isFB = (r: Res) => refused(r) && (r.code === "FORBIDDEN" || /Forbidden/i.test(r.name));
const isRL = (r: Res) => !r.ok && (r.name === "CustomerRateLimitError" || r.code === "RATE_LIMITED" || /RateLimit/i.test(r.name));
const rs = (r: Res) => (r.ok ? `ok ${cut(j(r.v), 160)}` : r.err);
const itemsOf = (v: Any): Any[] => (Array.isArray(v) ? v : ((v?.items ?? v?.rows ?? []) as Any[]));
const idsOf = (v: Any) => itemsOf(v).map((r) => String(r?.id)).sort();
const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
const tokOf = (url: unknown): string => {
  if (typeof url !== "string" || !url) return "";
  try {
    const u = new URL(url, "http://qc.invalid");
    return u.searchParams.get("token") ?? u.pathname.split("/").filter(Boolean).pop() ?? "";
  } catch { return ""; }
};
const DAY = 86_400_000;
const ABSENT = BUILT ? "" : " · [crm/portal.ts ABSENT]";

console.log(`\n═══ QC CRM v2 · C3.5 — B2B customer portal /b/[slug] ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && (!BUILT || !C30) ? ` · --force-run with ${!BUILT ? "C3.5 ABSENT" : "C3.0 ABSENT"} (C3.5 checks expected red; controls + CLEAN green)` : ""}\n`);

const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <S extends string>(s: S): S => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
const IPB = 1 + Math.floor(Math.random() * 240);
const IP_PREFIXES = [`10.35.${IPB}.`, `10.36.${IPB}.`, `10.37.${IPB}.`];
let ipn = 0;
const ipOf = () => { ipn += 1; return `${IP_PREFIXES[Math.floor(ipn / 240) % 2]}${(ipn % 240) + 1}`; };
const UA = `QC-C35-Browser/1.0 (${TAG})`;
const consumerErr: string[] = [];
const RUN_START = new Date();
const rateKeysBefore = new Set<string>();
let CSmod: Any = {};

try {
  for (const r of (await P.chatRateBucket.findMany({ select: { key: true } })) as Any[]) rateKeysBefore.add(String(r.key));

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static + runtime shape)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  const PM = (await import(PORTAL_SPEC as string).catch(() => ({}))) as Any;
  const PSH = (await import(PORTAL_SHARED_SPEC as string).catch(() => ({}))) as Any;
  const CS = (await import(CS_SPEC as string).catch(() => ({}))) as Any;
  CSmod = CS;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const STORE = (await import("@/lib/storage/service" as string).catch(() => ({}))) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const pick = (portalNames: string[], csNames: string[] = []) => fnOf(PM, ...portalNames) ?? fnOf(CRM?.portal, ...portalNames) ?? fnOf(CS, ...csNames);
  const F = {
    shopBySlug: pick(["portalShopBySlug", "shopBySlug"]),
    invite: pick(["invite"]), revoke: pick(["revoke"]), listAccess: pick(["listAccess"]), decideRequest: pick(["decideRequest"]), eraseContact: pick(["eraseContact"]),
    acceptInvite: pick(["acceptInvite"]),
    requestOtp: pick(["requestOtp", "requestPortalOtp"], ["requestPortalOtp"]),
    verifyOtp: pick(["verifyOtp", "verifyPortalOtp"], ["verifyPortalOtp"]),
    loginWithLine: pick(["loginWithLine", "loginPortalWithLine"], ["loginPortalWithLine"]),
    switchCompany: pick(["switchCompany"]), logout: pick(["logout"]),
    mint: pick(["mintPortalSession"], ["mintPortalSession"]), getSession: pick(["getPortalSession"], ["getPortalSession"]),
    revokeAll: pick(["revokeAllPortalSessions"], ["revokeAllPortalSessions"]),
    cookieName: pick(["portalCookieName"], ["portalCookieName"]), isPortalToken: pick(["isPortalToken"], ["isPortalToken"]),
    home: pick(["home"]), listQuotations: pick(["listQuotations"]), getQuotation: pick(["getQuotation"]), respondQuotation: pick(["respondQuotation"]),
    listInvoices: pick(["listInvoices"]), getInvoice: pick(["getInvoice"]), payLink: pick(["payLink"]), uploadSlip: pick(["uploadSlip"]),
    listReceipts: pick(["listReceipts"]), listDocuments: pick(["listDocuments"]), getRecord: pick(["getRecord"]), requestRecordChange: pick(["requestRecordChange"]),
    listRequests: pick(["listRequests"]), getRequest: pick(["getRequest"]), createRequest: pick(["createRequest"]), listContacts: pick(["listContacts"]),
  };
  const PREFIX: string = String(PM.PORTAL_TOKEN_PREFIX ?? CS.PORTAL_TOKEN_PREFIX ?? "");
  {
    const missing = Object.entries(F).filter(([, f]) => typeof f !== "function").map(([k]) => k);
    const sh = read(PORTAL_SHARED_FILE);
    const impure = /from\s+["'](@prisma\/client|@\/lib\/core\/db|next\/[^"']+|server-only|\.\/db|\.\/portal)["']/.test(sh);
    chk("C3.5-S0.1", `crm/portal.ts (or customer-session.ts for the session helpers) exports the ${Object.keys(F).length} portal entry points of the addendum + PORTAL_TOKEN_PREFIX; crm/portal-shared.ts is pure (no prisma/next/server-only) and holds the ONE base-path constant PORTAL_BASE_PATH = "/b"`,
      BUILT && missing.length === 0 && PREFIX.length >= 2 && sh.length > 0 && !impure && PSH.PORTAL_BASE_PATH === "/b",
      "all fns · prefix · pure shared · /b", `built=${BUILT} missing=${cut(missing.join(","), 300) || "-"} prefix=${j(PREFIX)} shared=${sh.length > 0} impure=${impure} base=${j(PSH.PORTAL_BASE_PATH)}${ABSENT}`);
  }
  {
    const idx = read(INDEX_FILE);
    const block = /CRM C3\.5 ▸[\s\S]*?◂/.exec(idx)?.[0] ?? "";
    const ok = /export\s+\*\s+as\s+portal\s+from\s+["']\.\/portal["']/.test(block);
    const bridge = read(BRIDGE_FILE);
    chk("C3.5-S0.2", "facade: crm/index.ts exports the `portal` namespace inside a `// CRM C3.5 ▸ … ◂` block · R-D: the bridge file src/lib/platform/crm-bridges/portal.ts exists (C3.5 is its only owner) [static + runtime]",
      ok && typeof CRM?.portal?.invite === "function" && bridge.length > 0, "block · runtime · bridge", `block=${block.length > 0} static=${ok} runtime=${typeof CRM?.portal?.invite} bridge=${bridge.length > 0}${ABSENT}`, "MAJOR");
  }
  {
    const lab = read(LABELS_FILE) + "\n" + read(WEBHOOK_LABELS);
    const per = EVENTS.map((ev) => ({ ev, count: (lab.match(new RegExp(`value:\\s*["']${ev.replace(/\./g, "\\.")}["']`, "g")) ?? []).length, consumer: typeof CONS?.[ev] === "function" }));
    const block = /CRM C3\.5 ▸/.test(read(CONSUMERS_FILE));
    chk("C3.5-S0.3", "3 registries (a new event without a consumer stalls the whole queue): crm.portal.viewed · crm.portal.quote.responded · crm.portal.request.created are each declared EXACTLY ONCE across automation/labels.ts + webhooks/labels.ts and each has a consumer in outbox-consumers.ts (block `// CRM C3.5 ▸`)",
      per.every((x) => x.count === 1 && x.consumer) && block, "3 × (1 label · consumer)", `${per.map((x) => `${x.ev}:${x.count}/${x.consumer}`).join(" ")} block=${block}${ABSENT}`, "MAJOR");
  }
  {
    const migs = existsSync(MIG_DIR) ? readdirSync(MIG_DIR).filter((d) => d > C30_MIG && /Portal|portal/.test(read(join(MIG_DIR, d, "migration.sql")))) : [];
    const portalSrc = walk("src/lib/modules/crm").filter((f) => /\/portal[^/]*\.ts$/.test(f)).map((f) => read(f)).join("\n");
    const forked = /otpCode\s*\(|customerOtp\s*\.\s*(create|update|updateMany|findUnique|findFirst)\b|["'`](portal|crm-portal)-otp[:"'`]/.test(portalSrc);
    const reuses = /from\s+["']@\/lib\/modules\/member(\/customer-session)?["']/.test(portalSrc) || /mintPortalSession|getPortalSession/.test(read(CS_FILE));
    const csNames = ["requestOtp", "verifyOtp", "loginWithLine", "mintCustomerSession", "getCustomerSession", "revokeCustomerSession", "revokeAllCustomerSessions", "requireCustomer", "isCustomerToken", "customerCookieName", "__resetCustomerOtpLimit", "sweepCustomerAuth"];
    const csMissing = csNames.filter((n) => typeof CS[n] !== "function");
    chk("C3.5-S0.4", "no second customer-login engine (R-C.5 · MASTER-PLAN §2.8): C3.5 ships NO migration touching the portal tables · the portal source never mints/stores OTPs itself (no otpCode(), no CustomerOtp writes, no private `portal-otp` bucket) and reaches the shared customer-session helpers · every member customer-session export still exists (the member lane is untouched)",
      migs.length === 0 && portalSrc.length > 0 && !forked && reuses && csMissing.length === 0 && CS.CUSTOMER_TOKEN_PREFIX === "cs_",
      "no migration · no fork · reuse · member API intact", `newMigrations=${migs.join(",") || "-"} portalSrc=${portalSrc.length > 0} forked=${forked} reuses=${reuses} csMissing=${csMissing.join(",") || "-"} cs_=${j(CS.CUSTOMER_TOKEN_PREFIX)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — throwaway tenants A (everything) · T (another shop) · V (uiVersion 1) · D (portal switched off)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const finance = (await import("@/lib/modules/account/finance" as string).catch(() => ({}))) as Any;
  const APV = (await import("@/lib/modules/approval/service" as string)) as Any;
  const FIX: string[] = [];
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: pii(`${TAG}${suffix}@qc.invalid`), name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    return { id: t.id as string, slug: t.slug as string };
  };
  const member = (tid: string, userId: string, role: string, permissions: Record<string, unknown> = {}) =>
    P.membership.create({ data: { userId, tenantId: tid, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const uO = await mkUser("");
  const uTH = await mkUser("-thana");
  const SALES = { "crm.contact.read": true, "crm.company.read": true, "crm.deal.read": true };
  const owner = { userId: uO, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const thana = { userId: uTH, role: "STAFF", unitAccess: ["*"] as string[], permissions: SALES as Record<string, unknown> };

  const TA = await mkTenant("a");
  const TT = await mkTenant("t");
  const TV = await mkTenant("v");
  const TD = await mkTenant("d");
  for (const t of [TA, TT, TV, TD]) await member(t.id, uO, "OWNER");
  await member(TA.id, uTH, "STAFF", SALES);
  const tidA = TA.id;
  const slugA = TA.slug;
  const crmA = await mk(tidA, "CRM", "CRM");
  const accA = await mk(tidA, "ACCOUNT", "บัญชี");
  const kanA = await mk(tidA, "KANBAN", "บอร์ดงาน");
  const memA = await mk(tidA, "MEMBER", "สมาชิก");
  const crmT = await mk(TT.id, "CRM", "CRM-T");
  const accT = await mk(TT.id, "ACCOUNT", "บัญชี-T");
  const crmV = await mk(TV.id, "CRM", "CRM-V1");
  const crmD = await mk(TD.id, "CRM", "CRM-D");
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: uO };
  await P.accountSystemLink.create({ data: { tenantId: tidA, systemId: accA, linkedKind: "CRM", linkedId: crmA } }).catch((e: Any) => FIX.push(`accountSystemLink ${cut(e?.message, 80)}`));

  // kanban board for ISSUE requests: 3 columns (first = เปิด · middle = กำลังทำ · done/last = เสร็จ — R-E.13)
  const boardA = (await P.kanbanBoard.create({ data: { tenantId: tidA, systemId: kanA, name: `แจ้งเรื่องลูกค้า ${TAG}`, createdById: uO } })).id as string;
  const colIds: string[] = [];
  for (const [i, n] of ["รับเรื่อง", "กำลังดำเนินการ", "เรียบร้อย"].entries()) {
    colIds.push((await P.kanbanColumn.create({ data: { tenantId: tidA, systemId: kanA, boardId: boardA, name: n, sortOrder: i, position: `a${i}`, isDoneColumn: i === 2 } })).id as string);
  }
  const PORTAL_ON = { enabled: true, loginMethods: ["EMAIL_OTP", "LINE"], showDeals: false, allowIssue: true, issueBoardId: boardA };
  await setCrm(crmA, { uiVersion: 2, bridgesEnabled: true, portal: PORTAL_ON });
  await setCrm(crmT, { uiVersion: 2, bridgesEnabled: true, portal: { ...PORTAL_ON, issueBoardId: null } });
  await setCrm(crmV, { uiVersion: 1, bridgesEnabled: true, portal: { ...PORTAL_ON, issueBoardId: null } });
  await setCrm(crmD, { uiVersion: 2, bridgesEnabled: true, portal: { ...PORTAL_ON, enabled: false, issueBoardId: null } });
  await APV.createPolicy({ tenantId: tidA }, { name: `คำขอจากพอร์ทัล ${TAG}`, entityType: "crm.portal_request", systemId: crmA, steps: [{ order: 1, approverRole: "OWNER" }] })
    .catch((e: Any) => FIX.push(`createPolicy ${cut(e?.message, 80)}`));
  const finR = await call(finance.createFinanceAccount, { tenantId: tidA, systemId: accA, type: "BANK", name: `ธนาคารรับเงิน ${TAG}`, promptpayId: "0812345678", useForReceive: true });
  if (!good(finR)) FIX.push(`createFinanceAccount ${rs(finR)}`);

  // companies ⇄ Party COMPANY ⇄ AccountContact (docs of a company = docs whose AccountContact belongs to the company's party)
  type Co = { id: string; partyId: string; acId: string; name: string };
  const mkCompany = async (tid: string, sys: string, accSys: string, name: string): Promise<Co> => {
    const nm = `${name} ${TAG}-${nx()}`;
    const party = await P.party.create({ data: { tenantId: tid, name: nm, kind: "COMPANY" } });
    const ac = await P.accountContact.create({ data: { tenantId: tid, systemId: accSys, kind: "CUSTOMER", legalType: "COMPANY", name: nm, partyId: party.id } });
    const co = await P.crmCompany.create({ data: { tenantId: tid, systemId: sys, partyId: party.id, name: nm, accountContactId: ac.id } });
    return { id: co.id as string, partyId: party.id as string, acId: ac.id as string, name: nm };
  };
  type Ct = { id: string; name: string; email: string; phone: string };
  let phoneSeq = 0;
  const mkContact = async (tid: string, sys: string, label: string, companies: Co[], extra: Record<string, unknown> = {}): Promise<Ct> => {
    const name = pii(`${label} ${TAG}-${nx()}`);
    const email = pii(`${TAG}-${label.replace(/[^a-z]/gi, "").toLowerCase() || "c"}${nx()}@qc-portal.example`);
    const phone = pii(`089${String(4_000_000 + Math.floor(Math.random() * 999_000) + (phoneSeq += 1)).slice(-7)}`);
    const party = await P.party.create({ data: { tenantId: tid, name, kind: "PERSON" } });
    const c = await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, email, phone, partyId: party.id, ownerUserId: uO, companyId: companies[0]?.id ?? null, ...extra } });
    for (const [i, co] of companies.entries()) await P.crmCompanyContact.create({ data: { tenantId: tid, companyId: co.id, contactId: c.id, isPrimary: i === 0, jobTitle: "ฝ่ายจัดซื้อ" } });
    return { id: c.id as string, name, email, phone };
  };
  const mkAccess = async (tid: string, sys: string, co: Co, ct: Ct, extra: Record<string, unknown> = {}) =>
    (await P.crmPortalAccess.create({ data: { tenantId: tid, systemId: sys, companyId: co.id, contactId: ct.id, role: "APPROVE", invitedById: uO, acceptedAt: new Date(), loginMethods: ["EMAIL_OTP", "LINE"], ...extra } })).id as string;
  const mkDoc = async (tid: string, accSys: string, docType: string, acId: string, status: string, grand: number, extra: Record<string, unknown> = {}) =>
    (await P.accountDocument.create({
      data: { tenantId: tid, systemId: accSys, docType, docNo: status === "DRAFT" ? null : `${TAG}-${docType.slice(0, 3)}-${nx()}`, status, direction: "OUT", contactId: acId, subTotal: grand, grandTotal: grand, ...extra },
    })).id as string;

  const coA = await mkCompany(tidA, crmA, accA, "โรงแรมภูเก็ตแซนด์");
  const coB = await mkCompany(tidA, crmA, accA, "บีบี ทัวร์");
  const coC = await mkCompany(tidA, crmA, accA, "ซีซี ไม่มีสิทธิ์");
  const wanna = await mkContact(tidA, crmA, "วรรณา", [coA, coB]);
  const cara = await mkContact(tidA, crmA, "Cara", [coA]);
  const bob = await mkContact(tidA, crmA, "Bob", [coB]);
  const suspCust = await P.customer.create({ data: { tenantId: tidA, memberSystemId: memA, name: `สมาชิกถูกระงับ ${TAG}`, email: `${TAG}-dave-m@qc-portal.example`, status: "SUSPENDED" } });
  const dave = await mkContact(tidA, crmA, "Dave", [coA], { memberCustomerId: suspCust.id });
  const eve = await mkContact(tidA, crmA, "Eve", [coA]);
  const fay = await mkContact(tidA, crmA, "Fay", [coA]);
  const gus = await mkContact(tidA, crmA, "Gus", [coA], { archivedAt: new Date() });
  const hank = await mkContact(tidA, crmA, "Hank", [coA]);
  const kim = await mkContact(tidA, crmA, "Kim", [coA]);
  const ivy = await mkContact(tidA, crmA, "Ivy", [coA]);
  const jon = await mkContact(tidA, crmA, "Jon", [coA]);
  const lee = await mkContact(tidA, crmA, "Lee", [coA]);
  const otto = await mkContact(tidA, crmA, "Otto", [coA]);
  const pia = await mkContact(tidA, crmA, "Pia", [coA]);
  const quinn = await mkContact(tidA, crmA, "Quinn", [coA]);
  const vic = await mkContact(tidA, crmA, "Vic", [coA]);
  const mona = await P.customer.create({ data: { tenantId: tidA, memberSystemId: memA, name: `สมาชิกปกติ ${TAG}`, email: pii(`${TAG}-mona@qc-portal.example`), status: "ACTIVE" } });
  const accBob = await mkAccess(tidA, crmA, coB, bob);
  const accDave = await mkAccess(tidA, crmA, coA, dave);
  const accGus = await mkAccess(tidA, crmA, coA, gus);
  const accIvy = await mkAccess(tidA, crmA, coA, ivy);
  const accJon = await mkAccess(tidA, crmA, coA, jon);
  const accLee = await mkAccess(tidA, crmA, coA, lee);
  const accOtto = await mkAccess(tidA, crmA, coA, otto);
  const accPia = await mkAccess(tidA, crmA, coA, pia);
  const accVic = await mkAccess(tidA, crmA, coA, vic);
  void accOtto; void accPia;

  // pipeline with quote stages + two deals linked to quotations (internal data that must never reach a portal DTO)
  const STD = [{ name: "ผู้สนใจ", kind: "OPEN", probability: 10 }, { name: "ต่อรองราคา", kind: "OPEN", probability: 40 }, { name: "ลูกค้าตอบรับ", kind: "OPEN", probability: 80 }, { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 }];
  const pipe = (await P.crmPipeline.create({ data: { tenantId: tidA, systemId: crmA, name: `ขายห้องจัดเลี้ยง ${TAG}`, stages: { create: STD.map((s, i) => ({ tenantId: tidA, systemId: crmA, sortOrder: i, ...s })) } }, include: { stages: true } })) as Any;
  const st = [...(pipe.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string);
  await P.crmPipeline.update({ where: { id: pipe.id }, data: { stageOnQuoteAcceptedId: st[2], stageOnQuoteRejectedId: st[1] } });

  // accounting documents (raw rows — portal reads them through the account facade; status/amount/validity are all this oracle needs)
  const QA1 = await mkDoc(tidA, accA, "QUOTATION", coA.acId, "AWAITING_ACCEPT", 7_500_000, { validUntil: new Date(Date.now() + 30 * DAY) });
  const QA2x = await mkDoc(tidA, accA, "QUOTATION", coA.acId, "AWAITING_ACCEPT", 1_820_000, { validUntil: new Date(Date.now() - DAY) });
  const QA3 = await mkDoc(tidA, accA, "QUOTATION", coA.acId, "AWAITING_ACCEPT", 3_300_000, { validUntil: new Date(Date.now() + 30 * DAY) });
  const QX1 = await mkDoc(tidA, accA, "QUOTATION", coA.acId, "AWAITING_ACCEPT", 1_111_100, { validUntil: new Date(Date.now() + 30 * DAY) });
  const QX2 = await mkDoc(tidA, accA, "QUOTATION", coA.acId, "AWAITING_ACCEPT", 2_222_200, { validUntil: new Date(Date.now() + 30 * DAY) });
  const QAd = await mkDoc(tidA, accA, "QUOTATION", coA.acId, "DRAFT", 999_900);
  const QB1 = await mkDoc(tidA, accA, "QUOTATION", coB.acId, "AWAITING_ACCEPT", 4_400_000, { validUntil: new Date(Date.now() + 30 * DAY) });
  const IA1 = await mkDoc(tidA, accA, "INVOICE", coA.acId, "AWAITING_PAYMENT", 2_450_000, { dueDate: new Date(Date.now() + 10 * DAY) });
  const IA2 = await mkDoc(tidA, accA, "INVOICE", coA.acId, "PARTIAL", 1_820_000, { paidTotal: 500_000, dueDate: new Date(Date.now() + 5 * DAY) });
  const IAd = await mkDoc(tidA, accA, "INVOICE", coA.acId, "DRAFT", 777_700);
  const IB1 = await mkDoc(tidA, accA, "INVOICE", coB.acId, "AWAITING_PAYMENT", 999_900, { dueDate: new Date(Date.now() + 10 * DAY) });
  const RA1 = await mkDoc(tidA, accA, "RECEIPT", coA.acId, "PAID", 3_100_000, { paidTotal: 3_100_000 });
  const TA1 = await mkDoc(tidA, accA, "TAX_INVOICE", coA.acId, "ISSUED", 3_100_000);
  const RB1 = await mkDoc(tidA, accA, "RECEIPT", coB.acId, "PAID", 555_500, { paidTotal: 555_500 });
  const DEAL_TITLE = pii(`ดีลภายในห้ามลูกค้าเห็น ${TAG}`);
  const DEAL_VALUE = 7_654_321;
  const mkDeal = async (quotationDocId: string, contact: Ct) => {
    const d = await P.crmDeal.create({ data: { tenantId: tidA, systemId: crmA, contactId: contact.id, companyId: coA.id, pipelineId: pipe.id, stageId: st[1], title: DEAL_TITLE, valueSatang: DEAL_VALUE, kind: "OPEN", ownerUserId: uO, quotationDocId, stageEnteredAt: new Date(Date.now() - DAY) } });
    await P.crmDealStageHistory.create({ data: { tenantId: tidA, dealId: d.id, fromStageId: null, toStageId: st[1], enteredAt: new Date(Date.now() - DAY), leftAt: null } });
    return d.id as string;
  };
  const dA1 = await mkDeal(QA1, wanna);
  const dA3 = await mkDeal(QA3, wanna);

  // custom objects: "สัญญา" (portalVisible, parent COMPANY) with a visible · a hidden · an editable field · plus a NON-portal object
  const OBJ_KEY = `qc35contract${rand}`;
  const OBJ_HIDDEN = `qc35internal${rand}`;
  const objC = (await P.customObject.create({ data: { tenantId: tidA, systemId: crmA, key: OBJ_KEY, label: "สัญญา", labelPlural: "สัญญา", parentType: "COMPANY", titleFieldKey: "contract_no", portalVisible: true } })).id as string;
  const objH = (await P.customObject.create({ data: { tenantId: tidA, systemId: crmA, key: OBJ_HIDDEN, label: "บันทึกภายใน", labelPlural: "บันทึกภายใน", parentType: "COMPANY", titleFieldKey: "memo", portalVisible: false } })).id as string;
  const secC = await P.memberSection.create({ data: { tenantId: tidA, systemId: crmA, objectKey: OBJ_KEY, key: `s${rand}`, label: "ข้อมูลสัญญา" } });
  const secH = await P.memberSection.create({ data: { tenantId: tidA, systemId: crmA, objectKey: OBJ_HIDDEN, key: `h${rand}`, label: "ภายใน" } });
  const mkField = async (sectionId: string, objectKey: string, key: string, label: string, portalVisible: boolean, portalEditable: boolean) =>
    (await P.memberField.create({ data: { tenantId: tidA, systemId: crmA, sectionId, objectKey, key, label, type: "TEXT", portalVisible, portalEditable } })).id as string;
  const fNo = await mkField(secC.id, OBJ_KEY, "contract_no", "เลขที่สัญญา", true, false);
  const fNote = await mkField(secC.id, OBJ_KEY, "internal_note", "หมายเหตุภายใน", false, false);
  const fSite = await mkField(secC.id, OBJ_KEY, "site_contact", "ผู้ประสานงานหน้างาน", true, true);
  const fMemo = await mkField(secH.id, OBJ_HIDDEN, "memo", "บันทึก", true, false);
  const CONTRACT_A = `CN-2569-A-${rand}`;
  const CONTRACT_B = `CN-2569-B-${rand}`;
  const SECRET_NOTE = `ลับภายใน-ห้ามลูกค้าเห็น-${rand}`;
  const SITE_A = `คุณสมใจ ${rand}`;
  const HIDDEN_MEMO = `บันทึกภายในลับ-${rand}`;
  const mkRecord = async (tid: string, sys: string, objectId: string, parentId: string, title: string) =>
    (await P.customRecord.create({ data: { tenantId: tid, systemId: sys, objectId, parentType: "COMPANY", parentId, title } })).id as string;
  const setVal = (recordId: string, fieldId: string, valueText: string) => P.customRecordValue.create({ data: { tenantId: tidA, recordType: "CUSTOM", recordId, fieldId, valueText } });
  const RA = await mkRecord(tidA, crmA, objC, coA.id, CONTRACT_A);
  await setVal(RA, fNo, CONTRACT_A); await setVal(RA, fNote, SECRET_NOTE); await setVal(RA, fSite, SITE_A);
  const RB = await mkRecord(tidA, crmA, objC, coB.id, CONTRACT_B);
  await setVal(RB, fNo, CONTRACT_B);
  const RI = await mkRecord(tidA, crmA, objH, coA.id, HIDDEN_MEMO);
  await setVal(RI, fMemo, HIDDEN_MEMO);
  // files: one on the portalVisible record RA (shared) · one COMPANY-level internal file of coA (never in the portal)
  const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
  const mkPrivateAsset = async (tid: string, name: string) => {
    const hex = createHash("sha1").update(`${TAG}-${name}-${nx()}`).digest("hex");
    const path = `t/${tid}/private/${hex}.pdf`;
    OBJECTS.set(path, { bytes: Buffer.from(`%PDF-1.4 ${TAG} ${name}`), contentType: "application/pdf" });
    return (await P.fileAsset.create({ data: { tenantId: tid, kind: "ATTACHMENT", path, cdnUrl: `private://${path}`, contentType: "application/pdf", bytes: 20 } })).id as string;
  };
  const FILE_REC_NAME = `สัญญาลงนาม-${rand}.pdf`;
  const FILE_CO_NAME = `ภายในบริษัท-${rand}.pdf`;
  const faRec = await mkPrivateAsset(tidA, "rec");
  const faCo = await mkPrivateAsset(tidA, "co");
  await P.crmFileLink.create({ data: { tenantId: tidA, systemId: crmA, entityType: "RECORD", entityId: RA, fileId: faRec, name: FILE_REC_NAME, size: 20, mime: "application/pdf", uploadedById: uO } });
  await P.crmFileLink.create({ data: { tenantId: tidA, systemId: crmA, entityType: "COMPANY", entityId: coA.id, fileId: faCo, name: FILE_CO_NAME, size: 20, mime: "application/pdf", uploadedById: uO } });
  // a request of company B (cross-company probe)
  const reqB = (await P.crmPortalRequest.create({ data: { tenantId: tidA, systemId: crmA, companyId: coB.id, contactId: bob.id, kind: "ISSUE", payload: { title: `เรื่องของบริษัทบี ${rand}` } } })).id as string;

  // tenant T (another shop): same shapes, all ids must be 404 from an A session
  const coT = await mkCompany(TT.id, crmT, accT, "ร้านอื่น");
  const tina = await mkContact(TT.id, crmT, "Tina", [coT]);
  const QT = await mkDoc(TT.id, accT, "QUOTATION", coT.acId, "AWAITING_ACCEPT", 1_000_000, { validUntil: new Date(Date.now() + 30 * DAY) });
  const IT = await mkDoc(TT.id, accT, "INVOICE", coT.acId, "AWAITING_PAYMENT", 1_000_000);
  const objT = (await P.customObject.create({ data: { tenantId: TT.id, systemId: crmT, key: OBJ_KEY, label: "สัญญา", labelPlural: "สัญญา", parentType: "COMPANY", titleFieldKey: "contract_no", portalVisible: true } })).id as string;
  const RT = await mkRecord(TT.id, crmT, objT, coT.id, `สัญญาร้านอื่น ${rand}`);
  const reqT = (await P.crmPortalRequest.create({ data: { tenantId: TT.id, systemId: crmT, companyId: coT.id, contactId: tina.id, kind: "ISSUE", payload: { title: "ร้านอื่น" } } })).id as string;
  // tenant V (uiVersion 1) and D (portal switched off): an access that would otherwise be usable
  const coV = await mkCompany(TV.id, crmV, await mk(TV.id, "ACCOUNT", "บัญชี-V"), "ร้าน v1");
  const vera = await mkContact(TV.id, crmV, "Vera", [coV]);
  const TOK_V = `${TAG}v${"x".repeat(30)}`;
  const accV = await mkAccess(TV.id, crmV, coV, vera, { acceptedAt: null, inviteTokenHash: sha(TOK_V), inviteExpiresAt: new Date(Date.now() + 7 * DAY) });
  const coD = await mkCompany(TD.id, crmD, await mk(TD.id, "ACCOUNT", "บัญชี-D"), "ร้านปิดพอร์ทัล");
  const dora = await mkContact(TD.id, crmD, "Dora", [coD]);
  const TOK_D = `${TAG}d${"y".repeat(30)}`;
  const accD = await mkAccess(TD.id, crmD, coD, dora, { acceptedAt: null, inviteTokenHash: sha(TOK_D), inviteExpiresAt: new Date(Date.now() + 7 * DAY) });
  if (FIX.length) console.log(`  [fixture notes] ${cut(FIX.join(" | "), 500)}`);

  // ─── outbox: hand-deliver OUR events by id (a foreign drainer may have claimed them) ───
  const seen = new Set<string>();
  const deliver = async (e: Any) => {
    const r = await call(CONS?.[e.type], { id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId });
    if (!r.ok && r.code !== "MISSING_FUNCTION" && consumerErr.length < 12) consumerErr.push(`${e.type}: ${r.err}`);
    return r;
  };
  const settle = async (tid: string) => {
    for (let round = 0; round < 10; round += 1) {
      const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tid }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[]).filter((e) => !seen.has(e.id));
      if (evs.length === 0) break;
      for (const e of evs) { seen.add(e.id); await deliver(e); }
      await P.outboxEvent.updateMany({ where: { id: { in: evs.map((e) => e.id) }, status: "PENDING" }, data: { status: "DONE", processedAt: new Date() } });
    }
  };
  const evCount = async (tid: string, type: string, needle?: string) =>
    ((await P.outboxEvent.findMany({ where: { tenantId: tid, type } })) as Any[]).filter((e) => !needle || j(e.payload).includes(needle) || String(e.idempotencyKey).includes(needle)).length;
  const respEvents = async (docId: string) => (await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "account.quotation.responded", idempotencyKey: { startsWith: `account.quotation.responded#${docId}#` } } })) as Any[];
  const sessionsOf = async (accessId: string) => (await P.portalSession.findMany({ where: { portalAccessId: accessId } })) as Any[];
  const accessOf = async (accessId: string) => (await P.crmPortalAccess.findUnique({ where: { id: accessId } })) as Any;
  const invite = (ct: Ct, co: Co, a: Any = owner, ctx: Any = cA) => call(F.invite, ctx, a, { companyId: co.id, contactId: ct.id, role: "APPROVE", loginMethods: ["EMAIL_OTP", "LINE"] });
  const meta = () => ({ ip: ipOf(), userAgent: UA });
  const mint = async (accessId: string) => { const r = await call(F.mint, accessId, meta()); return String(r.v?.token ?? ""); };
  const DTOS: { label: string; blob: string }[] = []; // every DTO an A-session saw (X8 / X10 / X1.4 scans)
  const see = (label: string, r: Res) => { if (r.ok) DTOS.push({ label, blob: j(r.v) }); return r; };
  const SIGNER = "วรรณา ผู้มีอำนาจลงนาม";

  // ═════════════════════════════════════════════════════════════════════════════
  // T0 — fixture self-tests (green before the build: a red S/X check can never be a fixture bug)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── T0 · fixture self-tests ──");
  {
    const tz = `${TAG}-tzero@qc-portal.example`;
    const key = `customer-otp:target:${tidA}:EMAIL:${tz}`;
    const r = await call(CS.requestOtp, slugA, { email: tz }, { ip: ipOf() });
    const b = (await P.chatRateBucket.findUnique({ where: { key } })) as Any;
    const docs = (await P.accountDocument.count({ where: { tenantId: tidA, contact: { partyId: coA.partyId } } })) as number;
    chk("C3.5-T0.1", "[fixture] the member OTP path writes the bucket `customer-otp:target:<tenant>:EMAIL:<email>` that X7.1 expects the portal to share (count 1 after one request) · company A owns exactly 11 account documents through its party (6 quotations incl. 1 draft · 3 invoices incl. 1 draft · 1 receipt · 1 tax invoice)",
      good(r) && Number(b?.count) === 1 && docs === 11, "bucket 1 · 11 docs", `otp=${rs(r).slice(0, 40)} bucket=${b?.count ?? "-"} docsA=${docs}`, "MAJOR");
  }
  {
    const zed = await mkContact(tidA, crmA, "Zed", [coA]);
    const acc = await mkAccess(tidA, crmA, coA, zed);
    await P.portalSession.create({ data: { tenantId: tidA, portalAccessId: acc, crmContactId: zed.id, crmSystemId: crmA, tokenHash: sha(`${TAG}-zed`), expiresAt: new Date(Date.now() + DAY) } });
    await P.crmPortalRequest.create({ data: { tenantId: tidA, systemId: crmA, companyId: coA.id, contactId: zed.id, kind: "ISSUE", payload: { title: "zed" } } });
    const n0 = [await P.crmPortalAccess.count({ where: { contactId: zed.id } }), await P.portalSession.count({ where: { crmContactId: zed.id } }), await P.crmPortalRequest.count({ where: { contactId: zed.id } })];
    await P.crmCompanyContact.deleteMany({ where: { contactId: zed.id } });
    await P.crmContact.delete({ where: { id: zed.id } });
    const n1 = [await P.crmPortalAccess.count({ where: { contactId: zed.id } }), await P.portalSession.count({ where: { crmContactId: zed.id } }), await P.crmPortalRequest.count({ where: { contactId: zed.id } })];
    chk("C3.5-T0.2", "[fixture] crm_v2_c cascade chain works on QC: deleting a contact removes its CrmPortalAccess → PortalSession and its CrmPortalRequest (1/1/1 → 0/0/0) — the schema half of the PDPA proof in X8.3",
      n0.join("/") === "1/1/1" && n1.join("/") === "0/0/0", "1/1/1 → 0/0/0", `${n0.join("/")} → ${n1.join("/")}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — invite · accept · OTP · LINE · switcher (5)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · invite / OTP / LINE → session ──");
  const mails0 = MAILS.length;
  const t0 = Date.now();
  const rInvW = await invite(wanna, coA);
  await sleep(500);
  const tokW = tokOf(rInvW.v?.inviteUrl);
  const accW = String(rInvW.v?.accessId ?? ((await P.crmPortalAccess.findFirst({ where: { companyId: coA.id, contactId: wanna.id } })) as Any)?.id ?? "");
  const accW0 = accW ? await accessOf(accW) : null;
  {
    const path = (() => { try { return new URL(String(rInvW.v?.inviteUrl ?? ""), "http://x").pathname; } catch { return ""; } })();
    const mail = MAILS.slice(mails0).find((m) => m.to.toLowerCase().includes(wanna.email.toLowerCase()));
    const exp = accW0?.inviteExpiresAt ? new Date(accW0.inviteExpiresAt).getTime() : 0;
    const audits = accW ? await P.auditLog.count({ where: { tenantId: tidA, action: "crm.portal.invite", targetId: accW } }) : 0;
    chk("C3.5-S1.1", "staff invite (OWNER): CrmPortalAccess(coA, wanna) with inviteTokenHash = sha256(token of the returned inviteUrl) · inviteExpiresAt = now + 7 days (±5 min) · invitedById = the owner · loginMethods ⊇ EMAIL_OTP · the invite URL lives under /b/<slug>/ · the invite e-mail went to the contact's address and carries the link · audit crm.portal.invite",
      good(rInvW) && tokW.length >= 22 && accW0?.inviteTokenHash === sha(tokW) && Math.abs(exp - (t0 + 7 * DAY)) < 5 * 60_000 && accW0?.invitedById === uO && (accW0?.loginMethods ?? []).includes("EMAIL_OTP") && path.startsWith(`/b/${slugA}/`) && !!mail && mail.body.includes(tokW) && audits >= 1,
      "hash · 7d · /b/<slug>/ · mail · audit", `${rs(rInvW)} tok=${tokW.length} hashOk=${accW0?.inviteTokenHash === sha(tokW)} expΔ=${exp ? Math.round((exp - t0 - 7 * DAY) / 60_000) : "-"}min by=${accW0?.invitedById === uO} path=${path || "-"} mail=${!!mail}/${mail ? mail.body.includes(tokW) : "-"} audit=${audits}${ABSENT}`);
  }
  const rAccW = await call(F.acceptInvite, slugA, { token: tokW }, meta());
  const tA = String(rAccW.v?.token ?? "");
  const sessA = tA ? ((await P.portalSession.findFirst({ where: { tokenHash: sha(tA) } })) as Any) : null;
  {
    const acc = accW ? await accessOf(accW) : null;
    const info = await call(F.getSession, tA);
    chk("C3.5-S1.2", "acceptInvite(slug, {token}) mints a PortalSession: token carries PORTAL_TOKEN_PREFIX · row keyed by sha256(token) with portalAccessId/crmContactId/crmSystemId/tenantId of the invite · access.acceptedAt set and inviteTokenHash CLEARED (single-use) · getPortalSession(token) answers companyId = coA, crmContactId = wanna",
      good(rAccW) && !!PREFIX && tA.startsWith(PREFIX) && sessA?.portalAccessId === accW && sessA?.crmContactId === wanna.id && sessA?.crmSystemId === crmA && sessA?.tenantId === tidA && !!acc?.acceptedAt && acc?.inviteTokenHash === null && info.v?.companyId === coA.id && info.v?.crmContactId === wanna.id,
      "session row · single-use", `${rs(rAccW)} row=${!!sessA} acc=${sessA?.portalAccessId === accW} contact=${sessA?.crmContactId === wanna.id} sys=${sessA?.crmSystemId === crmA} accepted=${!!acc?.acceptedAt} hashCleared=${acc?.inviteTokenHash === null} info=${rs(info)}${ABSENT}`);
  }
  {
    const acc0 = accW ? await accessOf(accW) : null;
    await sleep(20);
    const rq = await call(F.requestOtp, slugA, { email: wanna.email }, { ip: ipOf() });
    const code = String(rq.v?.devOtp ?? "");
    const wrong = code ? await call(F.verifyOtp, { otpId: rq.v.otpId, code: code === "000000" ? "111111" : "000000" }, meta()) : MISSING;
    const sessWrong = accW ? (await sessionsOf(accW)).length : 0;
    const rv = code ? await call(F.verifyOtp, { otpId: rq.v.otpId, code }, meta()) : MISSING;
    const tOtp = String(rv.v?.token ?? "");
    const row = tOtp ? ((await P.portalSession.findFirst({ where: { tokenHash: sha(tOtp) } })) as Any) : null;
    const otp = rq.v?.otpId ? ((await P.customerOtp.findUnique({ where: { id: String(rq.v.otpId) } })) as Any) : null;
    const acc1 = accW ? await accessOf(accW) : null;
    const lastOk = !!acc1?.lastLoginAt && (!acc0?.lastLoginAt || new Date(acc1.lastLoginAt).getTime() > new Date(acc0.lastLoginAt).getTime());
    chk("C3.5-S1.3", "EMAIL_OTP: requestOtp(slug, {email}) answers {otpId, expiresAt, maskedTo (masked), devOtp (QC)} and writes the SHARED CustomerOtp table (tenant A, codeHash ≠ code) · a wrong code mints nothing · the right code mints a PortalSession for wanna's access · the OTP is marked used · access.lastLoginAt moves",
      good(rq) && code.length === 6 && String(rq.v?.maskedTo ?? "").includes("*") && !!otp && otp.tenantId === tidA && otp.codeHash !== code && refused(wrong) && sessWrong === 1 && good(rv) && row?.crmContactId === wanna.id && row?.portalAccessId === accW && !!otp && (await P.customerOtp.findUnique({ where: { id: otp.id } }))?.usedAt && lastOk,
      "otp → session", `req=${rs(rq)} otpRow=${!!otp} wrong=${rs(wrong)} sessAfterWrong=${sessWrong} verify=${rs(rv)} row=${!!row} lastLogin=${lastOk}${ABSENT}`);
  }
  {
    const rH = await invite(hank, coA);
    const tokH = tokOf(rH.v?.inviteUrl);
    const lineOk = await call(F.loginWithLine, slugA, { lineUserId: `U${rand}hank`, email: hank.email, inviteToken: tokH }, meta());
    const rowH = lineOk.v?.token ? ((await P.portalSession.findFirst({ where: { tokenHash: sha(String(lineOk.v.token)) } })) as Any) : null;
    const rK = await invite(kim, coA);
    const tokK = tokOf(rK.v?.inviteUrl);
    const accK = String(rK.v?.accessId ?? "");
    const lineBad = await call(F.loginWithLine, slugA, { lineUserId: `U${rand}kim`, email: `someone-else-${rand}@qc-portal.example`, phone: "0990000001", inviteToken: tokK }, meta());
    const reqK = (await P.crmPortalRequest.findMany({ where: { contactId: kim.id } })) as Any[];
    const sessK = accK ? (await sessionsOf(accK)).length : -1;
    const accKRow = accK ? await accessOf(accK) : null;
    chk("C3.5-S1.4", "LINE (identity verified by the route, passed in): a LINE e-mail equal to the invited contact's e-mail ⇒ PortalSession for that contact · a LINE identity matching NEITHER the contact's e-mail NOR phone ⇒ NO session (no token in the answer, 0 PortalSession rows, invite not accepted) and ONE staff request (CrmPortalRequest PENDING for that contact) — result `{ pendingApproval: true, requestId }`",
      good(lineOk) && rowH?.crmContactId === hank.id && good(lineBad) && !lineBad.v?.token && lineBad.v?.pendingApproval === true && reqK.length === 1 && reqK[0]?.status === "PENDING" && String(lineBad.v?.requestId ?? "") === reqK[0]?.id && sessK === 0 && !accKRow?.acceptedAt,
      "match → session · mismatch → request, no session", `match=${rs(lineOk)} row=${rowH?.crmContactId === hank.id} mismatch=${rs(lineBad)} requests=${reqK.length}/${reqK[0]?.status ?? "-"} sessions=${sessK} accepted=${!!accKRow?.acceptedAt}${ABSENT}`);
  }
  const rInvWB = await invite(wanna, coB);
  const accWB = String(rInvWB.v?.accessId ?? ((await P.crmPortalAccess.findFirst({ where: { companyId: coB.id, contactId: wanna.id } })) as Any)?.id ?? "");
  const rSw = await call(F.switchCompany, tA, coB.id, meta());
  const tB = String(rSw.v?.token ?? "");
  {
    const infoB = await call(F.getSession, tB);
    const rSwC = await call(F.switchCompany, tA, coC.id, meta());
    const sessC = (await P.portalSession.count({ where: { tenantId: tidA, crmContactId: wanna.id, portalAccess: { companyId: coC.id } } })) as number;
    const home = see("home(A)", await call(F.home, tA));
    const coIds = itemsOf(home.v?.companies).map((c) => String(c?.id ?? c?.companyId));
    chk("C3.5-S1.5", "company switcher: one contact ↔ two companies — home(A).companies lists coA + coB (not coC) · switchCompany(token, coB) returns a session whose companyId = coB and portalAccessId = wanna's coB access · switching to a company without an access (coC) ⇒ NOT_FOUND and no session is minted for it",
      good(rSw) && infoB.v?.companyId === coB.id && infoB.v?.portalAccessId === accWB && isNF(rSwC) && sessC === 0 && good(home) && coIds.includes(coA.id) && coIds.includes(coB.id) && !coIds.includes(coC.id),
      "switch B ok · C 404", `switch=${rs(rSw)} infoB=${rs(infoB)} C=${rs(rSwC)} sessC=${sessC} companies=${coIds.length}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — quotations respond (4)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · quotations ──");
  {
    const lq = see("listQuotations(A)", await call(F.listQuotations, tA));
    const exp = [QA1, QA2x, QA3, QX1, QX2];
    const byId = new Map(itemsOf(lq.v).map((q) => [String(q?.id), q]));
    chk("C3.5-S2.1", "listQuotations(A) = exactly the non-draft quotations of company A (5) — no draft, nothing of company B · the expired one (validUntil yesterday) carries canRespond = false, a live one canRespond = true",
      good(lq) && same(idsOf(lq.v), exp) && !byId.has(QAd) && !byId.has(QB1) && byId.get(QA2x)?.canRespond === false && byId.get(QA1)?.canRespond === true,
      `ids ${exp.length} · canRespond false/true`, `${good(lq) ? `ids=${idsOf(lq.v).length} same=${same(idsOf(lq.v), exp)} draft=${byId.has(QAd)} B=${byId.has(QB1)} expired.canRespond=${j(byId.get(QA2x)?.canRespond)} live=${j(byId.get(QA1)?.canRespond)}` : rs(lq)}${ABSENT}`);
  }
  const ipR = ipOf();
  const rAccept = await call(F.respondQuotation, tA, QA1, { accept: true, signerName: SIGNER }, { ip: ipR, userAgent: UA });
  {
    const doc = (await P.accountDocument.findUnique({ where: { id: QA1 } })) as Any;
    const evs = await respEvents(QA1);
    const pev = await evCount(tidA, "crm.portal.quote.responded", QA1);
    const aud = (await P.auditLog.findFirst({ where: { tenantId: tidA, targetId: QA1, action: "account.quotation.accept" } })) as Any;
    const sg = aud?.after?.signer ?? {};
    chk("C3.5-S2.2", "respondQuotation(accept) on the portal → account.respondQuotation by PORTAL: the quotation is ACCEPTED · exactly ONE account.quotation.responded (accepted) · ONE crm.portal.quote.responded · the account audit row keeps the simple signature {name = signer, ipHash ≠ raw IP, userAgent} and by = PORTAL (no raw IP anywhere in it)",
      good(rAccept) && doc?.status === "ACCEPTED" && evs.length === 1 && String(evs[0]?.idempotencyKey).endsWith("#true") && pev === 1 && aud?.after?.by === "PORTAL" && sg.name === SIGNER && typeof sg.ipHash === "string" && sg.ipHash.length >= 16 && !sg.ipHash.includes(ipR) && !j(aud?.after).includes(ipR) && sg.userAgent === UA,
      "ACCEPTED · 1 event · signer", `${rs(rAccept)} status=${doc?.status} events=${evs.length} portalEv=${pev} by=${aud?.after?.by ?? "-"} signer=${cut(j(sg), 120)}${ABSENT}`);
  }
  await settle(tidA);
  {
    const d = (await P.crmDeal.findUnique({ where: { id: dA1 } })) as Any;
    const h = (await P.crmDealStageHistory.count({ where: { dealId: dA1, toStageId: st[2] } })) as number;
    chk("C3.5-S2.3", "the stage moves through the EXISTING consumer (account.quotation.responded → crm deals.applyQuotationResponse): the deal whose quotationDocId is the accepted quotation sits in pipeline.stageOnQuoteAcceptedId with exactly ONE history row into it",
      d?.stageId === st[2] && h === 1, `stage ${st[2].slice(-6)} · 1 row`, `stage=${String(d?.stageId).slice(-6)} rows=${h}${ABSENT}`);
  }
  {
    const noReason = await call(F.respondQuotation, tA, QA3, { accept: false, signerName: SIGNER }, meta());
    const mid = (await P.accountDocument.findUnique({ where: { id: QA3 } })) as Any;
    const REASON = `ราคาสูงกว่างบประมาณไตรมาสนี้ ${rand}`;
    const rej = await call(F.respondQuotation, tA, QA3, { accept: false, reason: REASON, signerName: SIGNER }, meta());
    await settle(tidA);
    const doc = (await P.accountDocument.findUnique({ where: { id: QA3 } })) as Any;
    const d3 = (await P.crmDeal.findUnique({ where: { id: dA3 } })) as Any;
    const kept = j(await P.auditLog.findMany({ where: { tenantId: tidA, targetId: QA3 } })).includes(REASON) || j(await P.crmActivity.findMany({ where: { tenantId: tidA } })).includes(REASON);
    chk("C3.5-S2.4", "reject needs a reason: without one ⇒ VALIDATION (Thai) and the quotation stays AWAITING_ACCEPT · with one ⇒ REJECTED, the reason kept on the shop side (account audit of the document or a PORTAL activity) · the deal moves to stageOnQuoteRejectedId through the same consumer",
      isVal(noReason) && mid?.status === "AWAITING_ACCEPT" && good(rej) && doc?.status === "REJECTED" && kept && d3?.stageId === st[1] && (await respEvents(QA3)).length === 1,
      "VALIDATION → REJECTED + reason + stage", `noReason=${rs(noReason)} mid=${mid?.status} rej=${rs(rej)} status=${doc?.status} reasonKept=${kept} stage=${String(d3?.stageId).slice(-6)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — invoices · pay link · slip · receipts (4)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · invoices / pay link / slip / receipts ──");
  {
    const li = see("listInvoices(A)", await call(F.listInvoices, tA));
    const byId = new Map(itemsOf(li.v).map((x) => [String(x?.id), x]));
    const expOut = new Map([[IA1, 2_450_000], [IA2, 1_820_000 - 500_000]]);
    const home = see("home(A)#2", await call(F.home, tA));
    const sum = 2_450_000 + 1_320_000;
    const perOk = [...expOut].every(([id, o]) => Number(byId.get(id)?.outstandingSatang) === o);
    chk("C3.5-S3.1", `listInvoices(A) = exactly the issued invoices of company A {IA1, IA2} (no draft, nothing of B) with outstandingSatang = grandTotal − paidTotal per row · home(A).outstandingSatang = ${sum} (Σ of company A's open invoices only)`,
      good(li) && same(idsOf(li.v), [IA1, IA2]) && !byId.has(IAd) && !byId.has(IB1) && perOk && Number(home.v?.outstandingSatang) === sum,
      `ids 2 · per-row · Σ ${sum}`, `${rs(li).slice(0, 80)} ids=${idsOf(li.v).length} perRow=${perOk} home=${j(home.v?.outstandingSatang)}${ABSENT}`);
  }
  {
    const p1 = await call(F.payLink, tA, IA1);
    const rows1 = (await P.accountPaymentRequest.findMany({ where: { documentId: IA1 } })) as Any[];
    const p2 = await call(F.payLink, tA, IA1);
    const rows2 = (await P.accountPaymentRequest.findMany({ where: { documentId: IA1 } })) as Any[];
    const pB = await call(F.payLink, tA, IB1);
    const rowsB = (await P.accountPaymentRequest.count({ where: { documentId: IB1 } })) as number;
    const url = String(p1.v?.url ?? "");
    chk("C3.5-S3.2", "payLink = the EXISTING money path: account.createPaymentRequestForDoc — one AccountPaymentRequest for the invoice, amount = outstanding (2,450,000), the URL is its public page `/pay/<token>` · asking again returns the SAME link (still one row) · an invoice of company B ⇒ NOT_FOUND and no row",
      good(p1) && rows1.length === 1 && Number(rows1[0]?.amountSatang) === 2_450_000 && url.endsWith(`/pay/${rows1[0]?.token}`) && good(p2) && String(p2.v?.url) === url && rows2.length === 1 && isNF(pB) && rowsB === 0,
      "1 row · /pay/<token> · idempotent · B 404", `p1=${rs(p1)} rows=${rows1.length}/${rows2.length} amount=${rows1[0]?.amountSatang ?? "-"} urlOk=${url.endsWith(`/pay/${rows1[0]?.token}`)} same=${String(p2.v?.url) === url} B=${rs(pB)} rowsB=${rowsB}${ABSENT}`);
  }
  const putLog: string[] = [];
  const put = async (path: string, data: Uint8Array, contentType: string) => { putLog.push(path); OBJECTS.set(path, { bytes: data, contentType }); };
  const slipA = await call(F.uploadSlip, tA, { invoiceId: IA1, filename: "slip-โอนเงิน.png", contentType: "image/png", data: PNG }, { put });
  const slipUrlA = String(slipA.v?.url ?? "");
  {
    const atts = (await P.accountAttachment.findMany({ where: { documentId: IA1 } })) as Any[];
    const assets = (await P.fileAsset.findMany({ where: { tenantId: tidA, path: { contains: "/private/" } } })) as Any[];
    const fresh = assets.filter((a) => a.id !== faRec && a.id !== faCo);
    const linkOk = /\/api\/files\/[a-z0-9]{16,40}\?exp=\d+&sig=[0-9a-f]{64}$/i.test(slipUrlA);
    const blob = j(slipA.v);
    chk("C3.5-S3.3", "slip upload → a PRIVATE file (FileAsset under t/<tenant>/private/) fed into accounting's existing slip flow (AccountAttachment on the invoice, fileUrl not a fetchable URL) · the DTO carries only a signed expiring `/api/files/<id>?exp=&sig=` link — no CDN URL, no `private://`, no storage path",
      good(slipA) && fresh.length === 1 && String(fresh[0]?.path).startsWith(`t/${tidA}/private/`) && atts.length === 1 && !/^https?:\/\//i.test(String(atts[0]?.fileUrl)) && !String(atts[0]?.fileUrl).includes(CDN) && linkOk && !blob.includes("private://") && !blob.includes(CDN) && !blob.includes("/private/"),
      "private asset · attachment · signed link", `${rs(slipA)} assets=${fresh.length} path=${cut(fresh[0]?.path, 50)} attachments=${atts.length} fileUrl=${cut(atts[0]?.fileUrl, 50)} link=${linkOk}${ABSENT}`);
  }
  {
    const lr = see("listReceipts(A)", await call(F.listReceipts, tA));
    chk("C3.5-S3.4", "listReceipts(A) = exactly company A's receipt + tax invoice {RA1, TA1} — company B's receipt never",
      good(lr) && same(idsOf(lr.v), [RA1, TA1]), "2 ids", `${rs(lr).slice(0, 80)} ids=${idsOf(lr.v).length}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — documents · portalVisible custom records · cross-company 404 (5)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · documents ──");
  {
    const ld = see("listDocuments(A)", await call(F.listDocuments, tA));
    const blob = j(ld.v);
    chk("C3.5-S4.1", "listDocuments(A) contains the portalVisible record of company A (and its shared file) — never company B's record, never a record of a NON-portal object, never a COMPANY-level internal file",
      good(ld) && blob.includes(RA) && blob.includes(FILE_REC_NAME) && !blob.includes(RB) && !blob.includes(CONTRACT_B) && !blob.includes(RI) && !blob.includes(HIDDEN_MEMO) && !blob.includes(FILE_CO_NAME),
      "RA + file · not RB/RI/company file", `${rs(ld).slice(0, 60)} RA=${blob.includes(RA)} recFile=${blob.includes(FILE_REC_NAME)} RB=${blob.includes(RB)} RI=${blob.includes(RI)} coFile=${blob.includes(FILE_CO_NAME)}${ABSENT}`);
  }
  {
    const gr = see("getRecord(A,RA)", await call(F.getRecord, tA, RA));
    const blob = j(gr.v);
    const keys = itemsOf(gr.v?.fields).map((f) => String(f?.key));
    const fileLinks = (blob.match(/\/api\/files\/[a-z0-9]+\?exp=\d+&sig=[0-9a-f]{64}/gi) ?? []).length;
    chk("C3.5-S4.2", "getRecord(A, RA) shows ONLY portalVisible fields: contract_no + site_contact values present, internal_note key and value ABSENT · its file comes as a signed /api/files link",
      good(gr) && blob.includes(CONTRACT_A) && blob.includes(SITE_A) && !blob.includes(SECRET_NOTE) && !keys.includes("internal_note") && keys.includes("contract_no") && fileLinks >= 1 && !blob.includes("private://"),
      "visible fields only · signed file", `${rs(gr).slice(0, 60)} no=${blob.includes(CONTRACT_A)} site=${blob.includes(SITE_A)} secret=${blob.includes(SECRET_NOTE)} keys=${keys.join(",")} links=${fileLinks}${ABSENT}`);
  }
  {
    const r1 = await call(F.getRecord, tA, RB);
    const r2 = await call(F.getQuotation, tA, QB1);
    const r3 = await call(F.getInvoice, tA, IB1);
    const leak = [r1, r2, r3].some((r) => r.msg.includes(coB.name) || r.msg.includes(CONTRACT_B));
    chk("C3.5-S4.3", "cross-company from a company-A session: getRecord(RB) · getQuotation(QB1) · getInvoice(IB1) ⇒ NOT_FOUND (Thai, not FORBIDDEN) and the message names nothing of company B",
      isNF(r1) && isNF(r2) && isNF(r3) && !leak, "3 × NOT_FOUND", `${rs(r1)} | ${rs(r2)} | ${rs(r3)} leak=${leak}${ABSENT}`);
  }
  {
    const b1 = await call(F.getRecord, tB, RB);
    const b2 = await call(F.getRecord, tB, RA);
    const b3 = await call(F.getQuotation, tB, QA1);
    const lb = await call(F.listDocuments, tB);
    const a1 = await call(F.getRecord, tA, RB);
    const blob = j(lb.v);
    chk("C3.5-S4.4", "the SAME contact linked to both companies: the session on coB sees RB and gets NOT_FOUND for RA / QA1 · the session on coA still gets NOT_FOUND for RB (the switcher position, not the person, decides)",
      good(b1) && j(b1.v).includes(CONTRACT_B) && isNF(b2) && isNF(b3) && good(lb) && blob.includes(RB) && !blob.includes(RA) && isNF(a1),
      "B sees B only · A sees A only", `B.RB=${rs(b1).slice(0, 40)} B.RA=${rs(b2)} B.QA1=${rs(b3)} B.list=${blob.includes(RB)}/${blob.includes(RA)} A.RB=${rs(a1)}${ABSENT}`);
  }
  {
    const before = (await P.crmPortalRequest.count({ where: { tenantId: tidA } })) as number;
    const NEWV = `คุณสมหญิง ${rand}`;
    const ok1 = await call(F.requestRecordChange, tA, RA, { fieldKey: "site_contact", value: NEWV });
    const bad1 = await call(F.requestRecordChange, tA, RA, { fieldKey: "contract_no", value: "CN-HACK" });
    const bad2 = await call(F.requestRecordChange, tA, RA, { fieldKey: "internal_note", value: "x" });
    const after = (await P.crmPortalRequest.count({ where: { tenantId: tidA } })) as number;
    const req = ok1.v?.requestId ? ((await P.crmPortalRequest.findUnique({ where: { id: String(ok1.v.requestId) } })) as Any) : null;
    const val = (await P.customRecordValue.findFirst({ where: { recordId: RA, fieldId: fSite } })) as Any;
    const valNo = (await P.customRecordValue.findFirst({ where: { recordId: RA, fieldId: fNo } })) as Any;
    chk("C3.5-S4.5", "a portalEditable field edit becomes a REQUEST (CrmPortalRequest of wanna/coA, PENDING, payload names the record + field) and the stored value is UNCHANGED · a visible-but-not-editable field and a hidden field ⇒ refused (Thai), no request, no change",
      good(ok1) && !!req && req.companyId === coA.id && req.contactId === wanna.id && req.status === "PENDING" && j(req.payload).includes(RA) && j(req.payload).includes("site_contact") && val?.valueText === SITE_A && refused(bad1) && refused(bad2) && after === before + 1 && valNo?.valueText === CONTRACT_A,
      "request · value unchanged · 2 refusals", `ok=${rs(ok1)} req=${req?.kind ?? "-"}/${req?.status ?? "-"} value=${val?.valueText === SITE_A} bad1=${rs(bad1)} bad2=${rs(bad2)} Δrequests=${after - before}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — requests → kanban card / approval (4)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · requests ──");
  const ISSUE_TITLE = `ขอเลื่อนวันดำน้ำกรุ๊ป ${rand}`;
  const rIssue = await call(F.createRequest, tA, { kind: "ISSUE", title: ISSUE_TITLE, body: "ลูกค้าขอเลื่อนเป็นสัปดาห์หน้า" });
  const reqIId = String(rIssue.v?.id ?? rIssue.v?.requestId ?? "");
  const reqI = reqIId ? ((await P.crmPortalRequest.findUnique({ where: { id: reqIId } })) as Any) : null;
  const cardI = reqI?.kanbanCardId ? ((await P.kanbanCard.findUnique({ where: { id: reqI.kanbanCardId } })) as Any) : null;
  const progressOf = (r: Res) => String(r.v?.progressLabel ?? r.v?.statusLabel ?? "");
  {
    await sleep(50);
    const ev = reqIId ? await evCount(tidA, "crm.portal.request.created", reqIId) : 0;
    const lr = see("listRequests(A)", await call(F.listRequests, tA));
    const mine = itemsOf(lr.v).find((x) => String(x?.id) === reqIId);
    chk("C3.5-S5.1", "ISSUE with settings.crm.portal.issueBoardId set ⇒ CrmPortalRequest (PENDING) + ONE kanban card on that board in its FIRST column, linked by kanbanCardId · ONE crm.portal.request.created · listRequests shows it with progress เปิด",
      good(rIssue) && reqI?.kind === "ISSUE" && reqI?.companyId === coA.id && cardI?.boardId === boardA && cardI?.columnId === colIds[0] && ev === 1 && !!mine && String(mine?.progressLabel ?? mine?.statusLabel) === "เปิด",
      "request · card col0 · event · เปิด", `${rs(rIssue)} kind=${reqI?.kind ?? "-"} card=${!!cardI} board=${cardI?.boardId === boardA} col=${cardI?.columnId === colIds[0]} events=${ev} listed=${!!mine}/${mine?.progressLabel ?? mine?.statusLabel ?? "-"}${ABSENT}`);
  }
  {
    const labels: string[] = [];
    if (cardI) await P.kanbanCard.update({ where: { id: cardI.id }, data: { columnId: colIds[1] } });
    labels.push(progressOf(await call(F.getRequest, tA, reqIId)));
    if (cardI) await P.kanbanCard.update({ where: { id: cardI.id }, data: { columnId: colIds[2] } });
    labels.push(progressOf(await call(F.getRequest, tA, reqIId)));
    chk("C3.5-S5.2", "status map (R-E.13): card in the middle column ⇒ กำลังทำ · card in the done/last column ⇒ เสร็จ — the customer sees progress from the card's column",
      labels[0] === "กำลังทำ" && labels[1] === "เสร็จ", "กำลังทำ → เสร็จ", `${labels.join(" → ")}${ABSENT}`, "MAJOR");
  }
  const rCC = await call(F.createRequest, tA, { kind: "CONTACT_CHANGE", title: "ขอเปลี่ยนเบอร์ผู้ติดต่อ", payload: { phone: "0811111111" } });
  const reqCId = String(rCC.v?.id ?? rCC.v?.requestId ?? "");
  const aprC = reqCId ? ((await P.approvalRequest.findFirst({ where: { tenantId: tidA, entityType: "crm.portal_request", entityId: reqCId } })) as Any) : null;
  {
    const req = reqCId ? ((await P.crmPortalRequest.findUnique({ where: { id: reqCId } })) as Any) : null;
    chk("C3.5-S5.3", "CONTACT_CHANGE ⇒ approval: ApprovalRequest(entityType `crm.portal_request`, entityId = the request) PENDING, request.approvalRequestId = it, no kanban card",
      good(rCC) && !!req && req.kind === "CONTACT_CHANGE" && aprC?.status === "PENDING" && req.approvalRequestId === aprC?.id && !req.kanbanCardId,
      "approval PENDING · linked · no card", `${rs(rCC)} kind=${req?.kind ?? "-"} approval=${aprC?.status ?? "-"} linked=${req?.approvalRequestId === aprC?.id} card=${req?.kanbanCardId ?? "-"}${ABSENT}`);
  }
  {
    const d = aprC ? await call(APV.decide, { userId: uO, role: "OWNER", unitAccess: [], permissions: {} }, { tenantId: tidA }, aprC.id, { decision: "APPROVED", note: `อนุมัติโดยข้อสอบ ${TAG}` }) : MISSING;
    await settle(tidA);
    const req = reqCId ? ((await P.crmPortalRequest.findUnique({ where: { id: reqCId } })) as Any) : null;
    const gr = await call(F.getRequest, tA, reqCId);
    chk("C3.5-S5.4", "approving that ApprovalRequest (approval.request.approved delivered to the consumers) ⇒ the portal request becomes APPROVED with decidedAt · the customer sees APPROVED",
      good(d) && req?.status === "APPROVED" && !!req?.decidedAt && String(gr.v?.status) === "APPROVED",
      "APPROVED", `decide=${rs(d)} status=${req?.status ?? "-"} decidedAt=${!!req?.decidedAt} customer=${gr.v?.status ?? rs(gr)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7.6 (runtime) — staff side: company 360 portal block data (who has access · last login · status)
  // ═════════════════════════════════════════════════════════════════════════════
  const accessList = await call(F.listAccess, cA, owner, { companyId: coA.id });

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — isolation through EVERY portal read (company · tenant · deals · REST · file route · uiVersion)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · isolation ──");
  const bobT = await mint(accBob);
  const slipB = await call(F.uploadSlip, bobT, { invoiceId: IB1, filename: "slip-b.png", contentType: "image/png", data: PNG }, { put });
  const slipUrlB = String(slipB.v?.url ?? "");
  const snapB = async () => j({
    q: await P.accountDocument.findMany({ where: { id: { in: [QB1, QT, IB1, IT] } }, select: { id: true, status: true }, orderBy: { id: "asc" } }),
    pr: await P.accountPaymentRequest.count({ where: { documentId: { in: [IB1, IT] } } }),
    at: await P.accountAttachment.count({ where: { documentId: { in: [IB1, IT] } } }),
    rq: await P.crmPortalRequest.count({ where: { OR: [{ tenantId: TT.id }, { companyId: coB.id }] } }),
    ev: await P.outboxEvent.count({ where: { tenantId: { in: [tidA, TT.id] }, type: "account.quotation.responded" } }),
  });
  const probeAll = async (token: string, ids: { q: string; i: string; r: string; req: string }) => {
    const out: [string, Res][] = [];
    out.push(["getQuotation", await call(F.getQuotation, token, ids.q)]);
    out.push(["respondQuotation", await call(F.respondQuotation, token, ids.q, { accept: true, signerName: SIGNER }, meta())]);
    out.push(["getInvoice", await call(F.getInvoice, token, ids.i)]);
    out.push(["payLink", await call(F.payLink, token, ids.i)]);
    out.push(["uploadSlip", await call(F.uploadSlip, token, { invoiceId: ids.i, filename: "x.png", contentType: "image/png", data: PNG }, { put })]);
    out.push(["getRecord", await call(F.getRecord, token, ids.r)]);
    out.push(["requestRecordChange", await call(F.requestRecordChange, token, ids.r, { fieldKey: "site_contact", value: "x" })]);
    out.push(["getRequest", await call(F.getRequest, token, ids.req)]);
    return out;
  };
  {
    const before = await snapB();
    const res = await probeAll(tA, { q: QB1, i: IB1, r: RB, req: reqB });
    const after = await snapB();
    const bad = res.filter(([, r]) => !isNF(r) || r.msg.includes(coB.name));
    chk("C3.5-X1.1", "CRITICAL — cross-COMPANY (same shop, same person linked to both, switcher on A): getQuotation · respondQuotation · getInvoice · payLink · uploadSlip · getRecord · requestRecordChange · getRequest on company B's ids ⇒ NOT_FOUND every time, no B name in the message, and NOTHING written (B's documents, pay requests, attachments, requests, events unchanged)",
      bad.length === 0 && after === before, "8 × NOT_FOUND · no write", `${bad.map(([n, r]) => `${n}:${rs(r)}`).join(" | ") || "all NF"} unchanged=${after === before}${ABSENT}`);
  }
  {
    const before = await snapB();
    const res = await probeAll(tA, { q: QT, i: IT, r: RT, req: reqT });
    const staffX = await call(F.invite, { tenantId: TT.id, systemId: crmA, actorUserId: uO }, owner, { companyId: coA.id, contactId: cara.id });
    const after = await snapB();
    const bad = res.filter(([, r]) => !isNF(r));
    chk("C3.5-X1.2", "CRITICAL — cross-TENANT: the same 8 reads/writes with ids of another shop ⇒ NOT_FOUND, nothing written · a staff invite whose ctx pairs another tenant with this CRM system ⇒ NOT_FOUND",
      bad.length === 0 && after === before && isNF(staffX), "8 × NOT_FOUND · staff NF", `${bad.map(([n, r]) => `${n}:${rs(r)}`).join(" | ") || "all NF"} unchanged=${after === before} staff=${rs(staffX)}${ABSENT}`);
  }
  {
    const lists = [
      see("home", await call(F.home, tA)), see("listQuotations", await call(F.listQuotations, tA)), see("listInvoices", await call(F.listInvoices, tA)),
      see("listReceipts", await call(F.listReceipts, tA)), see("listDocuments", await call(F.listDocuments, tA)), see("listRequests", await call(F.listRequests, tA)),
      see("listContacts", await call(F.listContacts, tA)),
    ];
    const blob = lists.map((r) => j(r.v)).join("\n");
    const foreign = [QB1, IB1, RB1, RB, reqB, QT, IT, RT, reqT, coB.name, coT.name, bob.name];
    const hit = foreign.filter((x) => blob.includes(x));
    const contacts = idsOf(lists[6].v);
    chk("C3.5-X1.3", "CRITICAL — every LIST of a company-A session (home · quotations · invoices · receipts · documents · requests · contacts) contains no id/name of company B or of another shop · listContacts(A) = colleagues of coA (cara in, bob out)",
      lists.every((r) => good(r)) && hit.length === 0 && contacts.includes(cara.id) && !contacts.includes(bob.id),
      "no foreign id · cara in · bob out", `ok=${lists.map((r) => (good(r) ? 1 : 0)).join("")} foreign=${hit.length ? cut(hit.join(","), 120) : "-"} cara=${contacts.includes(cara.id)} bob=${contacts.includes(bob.id)}${ABSENT}`);
  }
  {
    const extra = [see("getQuotation(QA1)", await call(F.getQuotation, tA, QA1)), see("getInvoice(IA1)", await call(F.getInvoice, tA, IA1))];
    const blob = DTOS.map((d) => d.blob).join("\n");
    const hits = [dA1, dA3, DEAL_TITLE, String(DEAL_VALUE), pipe.id].filter((x) => blob.includes(x));
    const dealKeys = /"(deal|deals|dealId|dealIds|pipeline|pipelineId|stageId)"\s*:/.test(blob);
    chk("C3.5-X1.4", "CRITICAL — showDeals = false (default): no portal DTO seen in this run (home · lists · gets · records) carries a deal id, deal title, deal value, pipeline/stage id or any deal/pipeline key",
      extra.every((r) => good(r)) && DTOS.length >= 8 && hits.length === 0 && !dealKeys, "no deal data", `dtos=${DTOS.length} hits=${hits.length} keys=${dealKeys}${ABSENT}`);
  }
  const CRM_ROUTE = (await import(CRM_ROUTE_SPEC as string).catch(() => ({}))) as Any;
  type Resp = { status: number; body: Any };
  const rest = async (path: string, token: string | null, method = "GET", body?: unknown): Promise<Resp> => {
    const fn = CRM_ROUTE?.[method];
    if (typeof fn !== "function") return { status: 0, body: null };
    const headers: Record<string, string> = { "x-forwarded-for": ipOf(), ...(token ? { authorization: `Bearer ${token}` } : {}) };
    if (body !== undefined) { headers["content-type"] = "application/json"; headers["idempotency-key"] = `${TAG}-${nx()}`; }
    try {
      const res: Response = await fn(new Request(`http://qc.invalid/api/v1/crm${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { params: Promise.resolve({ path: (path.split("?")[0] ?? "").split("/").filter(Boolean) }) });
      const text = await res.text();
      let parsed: Any = null;
      try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
      return { status: res.status, body: parsed };
    } catch (e) { return { status: -1, body: { error: String(e) } }; }
  };
  {
    const csTok = String((await call(CS.mintCustomerSession, mona.id, meta())).v?.token ?? "");
    const own = await rest("/portal/quotations", tA);
    const ownIds = itemsOf(own.body?.data).map((x) => String(x?.id)).sort();
    const cross = await rest(`/portal/quotations/${QB1}`, tA);
    const crossT = await rest(`/portal/invoices/${IT}`, tA);
    const staffOp = await rest("/contacts", tA);
    const anon = await rest("/portal/quotations", null);
    const member = await rest("/portal/quotations", csTok || "cs_none");
    chk("C3.5-X1.5", "CRITICAL — REST customer lane /api/v1/crm/portal/* (route handler in-process, Bearer = the portal token): own list 200 with exactly company A's quotations · B's quotation and another shop's invoice by id ⇒ 404 · a staff op (/contacts) with a portal token ⇒ 401/403, never 200 · no token ⇒ 401 · a MEMBER cs_ token on the portal lane ⇒ 401/403",
      own.status === 200 && same(ownIds, [QA1, QA2x, QA3, QX1, QX2]) && cross.status === 404 && crossT.status === 404 && [401, 403].includes(staffOp.status) && anon.status === 401 && [401, 403].includes(member.status),
      "200 own · 404 · 401/403", `own=${own.status}/${ownIds.length} B=${cross.status} T=${crossT.status} staffOp=${staffOp.status} anon=${anon.status} member=${member.status}${ABSENT}`);
  }
  const FILE_ROUTE = (await import(FILE_ROUTE_SPEC as string).catch(() => ({}))) as Any;
  const cookieName = String((await call(F.cookieName)).v ?? "shark_portal");
  const fileGet = async (url: string, token: string): Promise<{ status: number; bytes: number }> => {
    const fn = FILE_ROUTE?.GET;
    if (typeof fn !== "function" || !url) return { status: 0, bytes: 0 };
    const u = new URL(url, "http://qc.invalid");
    const id = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    const req = new Request(u.href, { headers: { cookie: `${cookieName}=${token}`, "user-agent": UA, "x-forwarded-for": ipOf() } });
    try {
      const res: Response = await withRequestScope(req, "/api/files/[id]", () => fn(req, { params: Promise.resolve({ id }) }));
      return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()).length };
    } catch (e) {
      const m = /NEXT_HTTP_ERROR_FALLBACK;(\d+)/.exec(String((e as Any)?.digest ?? ""));
      return { status: m ? Number(m[1]) : -1, bytes: 0 };
    }
  };
  {
    const ownA = await fileGet(slipUrlA, tA);
    const ownB = await fileGet(slipUrlB, bobT);
    const crossAB = await fileGet(slipUrlB, tA);
    const crossBA = await fileGet(slipUrlA, bobT);
    chk("C3.5-X1.6", "CRITICAL — file route /api/files/[id] with the PORTAL cookie: each slip link opens for the portal session it was minted for (200 + bytes — both directions as positive controls) and is refused (403/404) when presented by the other company's session",
      ownA.status === 200 && ownA.bytes === PNG.length && ownB.status === 200 && [403, 404].includes(crossAB.status) && [403, 404].includes(crossBA.status),
      "own 200 · cross 403/404", `ownA=${ownA.status}/${ownA.bytes} ownB=${ownB.status} A→B=${crossAB.status} B→A=${crossBA.status}${ABSENT}`);
  }
  {
    const shopA = await call(F.shopBySlug, slugA);
    const shopV = await call(F.shopBySlug, TV.slug);
    const shopD = await call(F.shopBySlug, TD.slug);
    const accV1 = await call(F.acceptInvite, TV.slug, { token: TOK_V }, meta());
    const accD1 = await call(F.acceptInvite, TD.slug, { token: TOK_D }, meta());
    const mV = await call(F.mint, accV, meta());
    const mD = await call(F.mint, accD, meta());
    const oV = await call(F.requestOtp, TV.slug, { email: vera.email }, { ip: ipOf() });
    const vV = oV.v?.devOtp ? await call(F.verifyOtp, { otpId: oV.v.otpId, code: oV.v.devOtp }, meta()) : MISSING;
    const sess = (await P.portalSession.count({ where: { tenantId: { in: [TV.id, TD.id] } } })) as number;
    chk("C3.5-X1.7", "uiVersion 1 (R-E.14) and portal.enabled = false: portalShopBySlug ⇒ null for both (the /b/<slug> layout 404s) while the live shop resolves · acceptInvite with a VALID token, mintPortalSession and OTP verify are all refused — 0 PortalSession rows in both tenants",
      good(shopA) && String(shopA.v?.tenantId ?? shopA.v?.id ?? "") !== "" && shopV.ok && shopV.v == null && shopD.ok && shopD.v == null && !good(accV1) && !good(accD1) && !good(mV) && !good(mD) && !good(vV) && sess === 0 && accV1.code !== "MISSING_FUNCTION",
      "null · refused · 0 sessions", `A=${rs(shopA).slice(0, 50)} V=${rs(shopV)} D=${rs(shopD)} acceptV=${rs(accV1)} acceptD=${rs(accD1)} mintV=${rs(mV)} otpV=${rs(vV)} sessions=${sess}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X7 — public entry points: shared limiter · no enumeration · invite token hygiene · expired/replayed answers
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X7 · public endpoints ──");
  {
    const key = `customer-otp:target:${tidA}:EMAIL:${otto.email.toLowerCase()}`;
    const bucket = async () => Number(((await P.chatRateBucket.findUnique({ where: { key } })) as Any)?.count ?? 0);
    const keysBefore = new Set(((await P.chatRateBucket.findMany({ select: { key: true } })) as Any[]).map((r) => String(r.key)));
    const p1 = await call(F.requestOtp, slugA, { email: otto.email }, { ip: ipOf() });
    const c1 = await bucket();
    const m1 = await call(CS.requestOtp, slugA, { email: otto.email }, { ip: ipOf() });
    const c2 = await bucket();
    const p2 = await call(F.requestOtp, slugA, { email: otto.email }, { ip: ipOf() });
    const p3 = await call(F.requestOtp, slugA, { email: otto.email }, { ip: ipOf() });
    const fresh = ((await P.chatRateBucket.findMany({ select: { key: true } })) as Any[]).map((r) => String(r.key)).filter((k) => !keysBefore.has(k));
    const foreignKeys = fresh.filter((k) => !k.startsWith("customer-otp:"));
    chk("C3.5-X7.1", "CRITICAL — ONE limiter (R-C.5 · MASTER-PLAN §2.8): a portal OTP request counts in the member path's DB bucket `customer-otp:target:<tenant>:EMAIL:<email>` (1 → member request 2 → portal 3) and the 4th request in the window (portal) is refused RATE_LIMITED · every bucket the portal OTP path created is a `customer-otp:*` bucket (no second limiter)",
      good(p1) && c1 === 1 && good(m1) && c2 === 2 && good(p2) && isRL(p3) && foreignKeys.length === 0,
      "1 → 2 → 3 → 429 · customer-otp:* only", `p1=${rs(p1).slice(0, 40)} c1=${c1} member=${rs(m1).slice(0, 30)} c2=${c2} p2=${rs(p2).slice(0, 30)} p3=${rs(p3)} foreign=${foreignKeys.join(",") || "-"}${ABSENT}`);
  }
  {
    emailDelayMs = 1200;
    const mails1 = MAILS.length;
    const tk0 = Date.now();
    const known = await call(F.requestOtp, slugA, { email: pia.email }, { ip: ipOf() });
    const dtKnown = Date.now() - tk0;
    const tu0 = Date.now();
    const unknown = await call(F.requestOtp, slugA, { email: `${TAG}-nobody@qc-portal.example` }, { ip: ipOf() });
    const dtUnknown = Date.now() - tu0;
    await sleep(1600);
    emailDelayMs = 0;
    const sent = MAILS.slice(mails1).filter((m) => m.to.toLowerCase().includes(pia.email.toLowerCase())).length;
    const sentUnknown = MAILS.slice(mails1).filter((m) => m.to.includes("nobody")).length;
    const kk = Object.keys(known.v ?? {}).sort().join(",");
    const ku = Object.keys(unknown.v ?? {}).sort().join(",");
    chk("C3.5-X7.2", "no enumeration: an unknown e-mail gets the SAME answer shape as a known contact (same keys, masked target) and the same timing class — with the mail provider slowed to 1200 ms the known request returns < 600 ms and within 400 ms of the unknown one (mail sent off the request path) · the known contact really gets the mail, the unknown one none",
      good(known) && good(unknown) && kk === ku && kk.length > 0 && dtKnown < 600 && Math.abs(dtKnown - dtUnknown) < 400 && sent >= 1 && sentUnknown === 0,
      "same keys · <600 ms · Δ<400 · mail", `keys=${kk}|${ku} known=${dtKnown}ms unknown=${dtUnknown}ms sent=${sent}/${sentUnknown}${ABSENT}`);
  }
  {
    const rF = await invite(fay, coA);
    const tokF = tokOf(rF.v?.inviteUrl);
    const accF = String(rF.v?.accessId ?? "");
    if (accF) await P.crmPortalAccess.update({ where: { id: accF }, data: { inviteExpiresAt: new Date(Date.now() - 60_000) } });
    const expired = await call(F.acceptInvite, slugA, { token: tokF }, meta());
    const reused = await call(F.acceptInvite, slugA, { token: tokW }, meta());
    const unknown = await call(F.acceptInvite, slugA, { token: `${"Z".repeat(22)}${rand}` }, meta());
    const sessF = accF ? (await sessionsOf(accF)).length : -1;
    const sessWCount = accW ? (await sessionsOf(accW)).length : -1;
    const tokens = [tokW, tokF].filter(Boolean);
    const stores = j({
      acc: await P.crmPortalAccess.findMany({ where: { tenantId: tidA } }),
      aud: await P.auditLog.findMany({ where: { tenantId: tidA } }),
      ops: await P.opsEvent.findMany({ where: { tenantId: tidA } }),
      obx: await P.outboxEvent.findMany({ where: { tenantId: tidA } }),
      act: await P.crmActivity.findMany({ where: { tenantId: tidA } }),
      req: await P.crmPortalRequest.findMany({ where: { tenantId: tidA } }),
    });
    const leaked = tokens.filter((t) => stores.includes(t));
    const msgs = new Set([expired, reused, unknown].map((r) => r.msg || String(r.v?.reason ?? "")));
    chk("C3.5-X7.3", "CRITICAL — invite token: ≥ 128 bits (≥ 22 base64url chars) · stored ONLY as a hash (the plaintext appears in no CrmPortalAccess/AuditLog/OpsEvent/OutboxEvent/CrmActivity/CrmPortalRequest row) · expired (> 7 days), already used and unknown tokens get the SAME calm Thai refusal and mint nothing",
      tokW.length >= 22 && tokF.length >= 22 && leaked.length === 0 && refused(expired) && refused(reused) && refused(unknown) && msgs.size === 1 && sessF === 0 && sessWCount >= 1,
      "hash only · 3 × same refusal · 0 sessions", `lens=${tokW.length}/${tokF.length} leaked=${leaked.length} expired=${rs(expired)} reused=${rs(reused)} unknown=${rs(unknown)} messages=${msgs.size} sessF=${sessF}${ABSENT}`);
  }
  {
    const rQ = await invite(quinn, coA);
    const tokQ = tokOf(rQ.v?.inviteUrl);
    const accQ = String(rQ.v?.accessId ?? "");
    const ipX = ipOf();
    const stepStart = new Date(Date.now() - 1000);
    for (let i = 0; i < 10; i += 1) await call(F.acceptInvite, slugA, { token: `${"W".repeat(22)}${rand}${i}` }, { ip: ipX, userAgent: UA });
    const blocked = await call(F.acceptInvite, slugA, { token: tokQ }, { ip: ipX, userAgent: UA });
    const accQ1 = accQ ? await accessOf(accQ) : null;
    const sessQ1 = accQ ? (await sessionsOf(accQ)).length : -1;
    const hot = ((await P.chatRateBucket.findMany({ where: { updatedAt: { gte: stepStart } } })) as Any[]).filter((b) => Number(b.count) >= 10);
    const later = await call(F.acceptInvite, slugA, { token: tokQ }, meta());
    chk("C3.5-X7.4", "invite-accept is limited by the DB limiter (checkRateLimitDb): after 10 wrong tokens from one IP the next attempt from that IP — even with a VALID token — is refused RATE_LIMITED, nothing accepted, a ChatRateBucket row counted ≥ 10 · the same valid token from another IP then works",
      isRL(blocked) && !accQ1?.acceptedAt && sessQ1 === 0 && hot.length >= 1 && good(later) && !!later.v?.token,
      "429 · bucket · other IP ok", `blocked=${rs(blocked)} accepted=${!!accQ1?.acceptedAt} sessions=${sessQ1} hotBuckets=${hot.length} later=${rs(later).slice(0, 60)}${ABSENT}`);
  }
  {
    const ex = await call(F.respondQuotation, tA, QA2x, { accept: true, signerName: SIGNER }, meta());
    const dx = (await P.accountDocument.findUnique({ where: { id: QA2x } })) as Any;
    const replay = await call(F.respondQuotation, tA, QA1, { accept: true, signerName: SIGNER }, meta());
    const flip = await call(F.respondQuotation, tA, QA1, { accept: false, reason: "เปลี่ยนใจ", signerName: SIGNER }, meta());
    const d1 = (await P.accountDocument.findUnique({ where: { id: QA1 } })) as Any;
    const e1 = await respEvents(QA1);
    const pe = await evCount(tidA, "crm.portal.quote.responded", QA1);
    chk("C3.5-X7.5", "an EXPIRED quotation (validUntil passed) cannot be answered: calm Thai refusal, still AWAITING_ACCEPT, no event · replaying accept on an accepted quotation is idempotent (ok or calm refusal) and a later reject cannot flip it — still ACCEPTED, still exactly ONE account.quotation.responded and ONE crm.portal.quote.responded",
      refused(ex) && dx?.status === "AWAITING_ACCEPT" && (await respEvents(QA2x)).length === 0 && (good(replay) || refused(replay)) && refused(flip) && d1?.status === "ACCEPTED" && e1.length === 1 && pe === 1,
      "expired refused · replay idempotent", `expired=${rs(ex)} status=${dx?.status} replay=${rs(replay)} flip=${rs(flip)} QA1=${d1?.status} events=${e1.length}/${pe}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA ──");
  {
    const blob = DTOS.map((d) => d.blob).join("\n");
    const staffNeedles = [`${TAG}@qc.invalid`, `${TAG}-thana@qc.invalid`];
    const foreign = [bob.email, bob.phone, bob.name, tina.email, tina.phone, ...staffNeedles].filter((x) => blob.includes(x));
    const cont = DTOS.filter((d) => d.label === "listContacts").map((d) => d.blob).join("");
    chk("C3.5-X8.1", "portal DTOs carry no other company's person (bob's name/phone/e-mail · another shop's contact) and no staff e-mail · the colleagues list of company A is the only place a colleague's contact data appears",
      DTOS.length >= 8 && foreign.length === 0 && cont.includes(cara.id), "no foreign/staff PII", `dtos=${DTOS.length} hits=${foreign.length} contactsListed=${cont.includes(cara.id)}${ABSENT}`);
  }
  {
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: { in: EVENTS } } })) as Any[]);
    const allowed = ["companyId", "contactId", "accessId", "portalAccessId", "docId", "documentId", "action", "accepted", "requestId", "kind", "systemId", "day"];
    const badKeys = evs.filter((e) => Object.keys(e.payload ?? {}).some((k) => !allowed.includes(k))).map((e) => `${e.type}:${Object.keys(e.payload ?? {}).join("/")}`);
    const blob = j(evs.map((e) => e.payload));
    const leak = PII.filter((x) => blob.includes(x));
    const types = new Set(evs.map((e) => String(e.type)));
    const sess = ((await P.portalSession.findMany({ where: { tenantId: tidA } })) as Any[]);
    const ipBad = sess.filter((s) => !s.ipHash || IP_PREFIXES.some((p) => String(s.ipHash).includes(p)) || /^\d+\.\d+\.\d+\.\d+$/.test(String(s.ipHash)));
    const probe = sess.find((s) => s.id === sessA?.id);
    const unsalted = probe ? [...Array(250).keys()].some((n) => IP_PREFIXES.some((p) => sha(`${p}${n + 1}`) === probe.ipHash)) : false;
    chk("C3.5-X8.2", "payloads of crm.portal.viewed / .quote.responded / .request.created are ids only (whitelisted keys — no reason text, no name/phone/e-mail) and all three were emitted · every PortalSession keeps an ipHash that is neither the raw IP nor an unsalted sha256 of it",
      evs.length >= 3 && types.size === 3 && badKeys.length === 0 && leak.length === 0 && sess.length > 0 && ipBad.length === 0 && !unsalted,
      "ids only · salted ipHash", `events=${evs.length} types=${[...types].join(",") || "-"} badKeys=${cut(badKeys.join(" "), 120) || "-"} leaks=${leak.length} sessions=${sess.length} ipBad=${ipBad.length} unsalted=${unsalted}${ABSENT}`, "MAJOR");
  }
  {
    const tIvy = await mint(accIvy);
    const tJon = await mint(accJon);
    if (tIvy) await call(F.createRequest, tIvy, { kind: "ISSUE", title: "เรื่องของไอวี่" });
    if (tJon) await call(F.createRequest, tJon, { kind: "ISSUE", title: "เรื่องของจอน" });
    const cnt = async (contactId: string) => ({
      a: (await P.crmPortalAccess.count({ where: { contactId } })) as number,
      s: (await P.portalSession.count({ where: { crmContactId: contactId } })) as number,
      r: (await P.crmPortalRequest.count({ where: { contactId } })) as number,
    });
    const ivy0 = await cnt(ivy.id);
    const wanna0 = await cnt(wanna.id);
    const er = await call(F.eraseContact, cA, ivy.id);
    const ivy1 = await cnt(ivy.id);
    const wanna1 = await cnt(wanna.id);
    const jon0 = await cnt(jon.id);
    await P.crmCompanyContact.deleteMany({ where: { contactId: jon.id } });
    await P.crmContact.delete({ where: { id: jon.id } }).catch((e: Any) => FIX.push(`delete jon ${cut(e?.message, 80)}`));
    const jon1 = await cnt(jon.id);
    const tIvyDead = tIvy ? (await call(F.getSession, tIvy)).v == null : false;
    chk("C3.5-X8.3", "PDPA erase: portal.eraseContact(ctx, contactId) (the hook C3.9 calls) removes that contact's portal access, sessions and requests (counts before > 0 → 0; the old token is dead) and touches nobody else · deleting a contact row cascades the same three (FK proof of crm_v2_c)",
      good(er) && ivy0.a > 0 && ivy0.s > 0 && ivy0.r > 0 && ivy1.a === 0 && ivy1.s === 0 && ivy1.r === 0 && tIvyDead && j(wanna0) === j(wanna1) && jon0.a > 0 && jon0.s > 0 && jon1.a === 0 && jon1.s === 0 && jon1.r === 0,
      "hook → 0/0/0 · cascade → 0/0/0", `erase=${rs(er)} ivy ${j(ivy0)}→${j(ivy1)} dead=${tIvyDead} wanna ${j(wanna0) === j(wanna1) ? "untouched" : "CHANGED"} jon ${j(jon0)}→${j(jon1)}${ABSENT}`);
  }
  {
    const mDave = await call(F.mint, accDave, meta());
    const mGus = await call(F.mint, accGus, meta());
    const oD = await call(F.requestOtp, slugA, { email: dave.email }, { ip: ipOf() });
    const vD = oD.v?.devOtp ? await call(F.verifyOtp, { otpId: oD.v.otpId, code: oD.v.devOtp }, meta()) : MISSING;
    const raw = `${PREFIX || "cp_"}${TAG}preexisting${"q".repeat(20)}`;
    await P.portalSession.create({ data: { tenantId: tidA, portalAccessId: accDave, crmContactId: dave.id, crmSystemId: crmA, tokenHash: sha(raw), expiresAt: new Date(Date.now() + DAY) } });
    const gDave = await call(F.getSession, raw);
    const hDave = await call(F.home, raw);
    const sessGus = (await sessionsOf(accGus)).length;
    chk("C3.5-X8.4", "a contact whose member account is SUSPENDED, and an ARCHIVED contact, cannot enter: mintPortalSession refused · OTP verify with the right code refused (same calm answer as a wrong code) · a session that already existed stops working at once (getPortalSession ⇒ null, home refused)",
      !good(mDave) && mDave.code !== "MISSING_FUNCTION" && !good(mGus) && good(oD) && !good(vD) && vD.code !== "MISSING_FUNCTION" && gDave.ok && gDave.v == null && !good(hDave) && hDave.code !== "MISSING_FUNCTION" && sessGus === 0,
      "all refused", `mintDave=${rs(mDave)} mintGus=${rs(mGus)} otp=${rs(oD).slice(0, 30)} verify=${rs(vD)} getSession=${rs(gDave)} home=${rs(hDave)} sessGus=${sessGus}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — races on SEPARATE connections (3 worker processes × 4 in parallel per round)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · races (worker processes) ──");
  const rE = await invite(eve, coA);
  const tokE = tokOf(rE.v?.inviteUrl);
  const accE = String(rE.v?.accessId ?? "");
  const tVic = await mint(accVic);
  const spawnWorkers = async (arg: Any, workers: number, startInMs: number): Promise<{ answers: string[]; raw: string[] }> => {
    const startAt = Date.now() + startInMs;
    const runs = await Promise.all(Array.from({ length: workers }, (_x, w) => new Promise<string>((resolve) => {
      const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", String(startAt), Buffer.from(JSON.stringify({ ...arg, ipBase: `10.37.${IPB}.${w}` }), "utf8").toString("base64url")], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      let buf = "";
      ch.stdout?.on("data", (d: Buffer) => { buf += d.toString(); });
      ch.stderr?.on("data", (d: Buffer) => { buf += d.toString(); });
      ch.on("close", () => resolve(buf));
      ch.on("error", (e: Error) => resolve(`SPAWN_ERR ${e.message}`));
    })));
    const answers: string[] = [];
    for (const out of runs) {
      const line = out.split("\n").find((l) => l.startsWith("X3WORKER "));
      if (line) answers.push(...(JSON.parse(line.slice(9)) as string[]));
    }
    return { answers, raw: runs.map((r) => cut(r.replace(/\s+/g, " "), 200)) };
  };
  const race = await spawnWorkers({
    rounds: [
      { atMs: 0, calls: [{ ph: "A", fn: "respond", a: { token: tA, docId: QX1, accept: true, signer: SIGNER }, n: 4 }] },
      { atMs: 3000, calls: [{ ph: "B", fn: "respond", a: { token: tA, docId: QX2, accept: true, signer: SIGNER }, n: 2 }, { ph: "B", fn: "respond", a: { token: tA, docId: QX2, accept: false, reason: "งบไม่พอ", signer: SIGNER }, n: 2 }] },
      { atMs: 6000, calls: [{ ph: "C", fn: "accept", a: { slug: slugA, token: tokE }, n: 4 }] },
      { atMs: 9000, calls: [{ ph: "D", fn: "view", a: { token: tVic }, n: 4 }] },
    ],
  }, 3, 40_000);
  const ph = (p: string) => race.answers.filter((a) => a.startsWith(`${p}:`)).map((a) => a.slice(p.length + 1));
  {
    const a = ph("A");
    chk("C3.5-X3.1a", "[control] 12 parallel accepts of one quotation really ran in 3 worker processes and reached the portal function", a.length === 12 && a.every((x) => !x.startsWith("ERR:MISSING")), "12 answers", `${a.length} ${cut(a.slice(0, 3).join(" | "), 160)} ${a.length === 0 ? cut(race.raw.join(" || "), 300) : ""}${ABSENT}`, "MAJOR");
    const evs = await respEvents(QX1);
    const pe = await evCount(tidA, "crm.portal.quote.responded", QX1);
    const d = (await P.accountDocument.findUnique({ where: { id: QX1 } })) as Any;
    chk("C3.5-X3.1", "CRITICAL — 12 parallel accepts of ONE quotation on separate connections ⇒ ACCEPTED, exactly ONE account.quotation.responded and ONE crm.portal.quote.responded · at least one caller got OK, none got a 500-style error",
      d?.status === "ACCEPTED" && evs.length === 1 && pe === 1 && a.some((x) => x === "OK") && a.every((x) => x === "OK" || x.startsWith("NO:") || /ERR:(VALIDATION|CONFLICT|NOT_FOUND)/.test(x)),
      "1 · 1", `status=${d?.status} events=${evs.length} portalEvents=${pe} answers=${cut([...new Set(a)].join(" | "), 160)}${ABSENT}`);
  }
  {
    const b = ph("B");
    chk("C3.5-X3.2a", "[control] 6 accepts + 6 rejects of another quotation ran in parallel", b.length === 12 && b.every((x) => !x.startsWith("ERR:MISSING")), "12 answers", `${b.length} ${cut([...new Set(b)].join(" | "), 120)}${ABSENT}`, "MAJOR");
    const evs = await respEvents(QX2);
    const d = (await P.accountDocument.findUnique({ where: { id: QX2 } })) as Any;
    const acceptedEv = evs.length === 1 && String(evs[0].idempotencyKey).endsWith("#true");
    const consistent = evs.length === 1 && ((acceptedEv && d?.status === "ACCEPTED") || (!acceptedEv && d?.status === "REJECTED"));
    chk("C3.5-X3.2", "CRITICAL — accept and reject racing on one quotation ⇒ exactly ONE answer wins: ONE account.quotation.responded in total and the document status matches it (never ACCEPTED then REJECTED)",
      consistent && (await evCount(tidA, "crm.portal.quote.responded", QX2)) === 1, "1 event · consistent", `events=${evs.map((e) => String(e.idempotencyKey).split("#").pop()).join(",") || "-"} status=${d?.status}${ABSENT}`);
  }
  {
    const c = ph("C");
    chk("C3.5-X3.3a", "[control] 12 parallel invite accepts with the same token ran (the invite existed)", c.length === 12 && !!accE && c.every((x) => !x.startsWith("ERR:MISSING")), "12 answers", `${c.length} accE=${!!accE}${ABSENT}`, "MAJOR");
    const sess = accE ? await sessionsOf(accE) : [];
    const acc = accE ? await accessOf(accE) : null;
    chk("C3.5-X3.3", "CRITICAL — 12 parallel acceptInvite with ONE token ⇒ exactly ONE success, ONE PortalSession, acceptedAt set once and the token hash cleared; the other 11 get a calm refusal",
      c.filter((x) => x === "OK:session").length === 1 && sess.length === 1 && !!acc?.acceptedAt && acc?.inviteTokenHash === null,
      "1 session", `ok=${c.filter((x) => x === "OK:session").length} sessions=${sess.length} accepted=${!!acc?.acceptedAt} hash=${acc?.inviteTokenHash === null ? "cleared" : "kept"} ${cut([...new Set(c)].join(" | "), 120)}${ABSENT}`);
  }
  {
    const d = ph("D");
    chk("C3.5-X3.4a", "[control] 12 parallel home() views of one session ran", d.length === 12 && d.every((x) => x === "OK"), "12 OK", `${d.length} ${cut([...new Set(d)].join(" | "), 120)}${ABSENT}`, "MAJOR");
    const n = accVic ? await evCount(tidA, "crm.portal.viewed", accVic) || await evCount(tidA, "crm.portal.viewed", vic.id) : 0;
    chk("C3.5-X3.4", "12 parallel views by one person on one Thai day ⇒ exactly ONE crm.portal.viewed (first view per day — idempotency key, not read-then-write)",
      n === 1, "1", `${n}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — revoke ⇒ sessions dead immediately (2)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · revoke ──");
  {
    const aliveB = await call(F.getSession, tB);
    const rv = await call(F.revoke, cA, owner, { accessId: accWB, reason: "เลิกเป็นผู้ติดต่อของบริษัทนี้" });
    const infoB = await call(F.getSession, tB);
    const readB = await call(F.listQuotations, tB);
    const rows = accWB ? await sessionsOf(accWB) : [];
    const acc = accWB ? await accessOf(accWB) : null;
    const stillA = await call(F.listQuotations, tA);
    chk("C3.5-S6.1", "staff revoke of wanna's coB access ⇒ access.revokedAt set · every session of THAT access dead at once (getPortalSession ⇒ null, reads refused, rows revoked/removed) · her coA session keeps working",
      aliveB.v != null && good(rv) && !!acc?.revokedAt && infoB.ok && infoB.v == null && !good(readB) && readB.code !== "MISSING_FUNCTION" && rows.every((s) => !!s.revokedAt) && good(stillA),
      "B dead · A alive", `before=${aliveB.v != null} revoke=${rs(rv)} revokedAt=${!!acc?.revokedAt} info=${rs(infoB)} read=${rs(readB)} rows=${rows.length}/${rows.filter((s) => s.revokedAt).length} A=${good(stillA)}${ABSENT}`);
  }
  {
    const tLee = await mint(accLee);
    const alive = await call(F.home, tLee);
    await P.crmPortalAccess.update({ where: { id: accLee }, data: { revokedAt: new Date() } });
    const info = await call(F.getSession, tLee);
    const h = await call(F.home, tLee);
    const again = await call(F.mint, accLee, meta());
    const oL = await call(F.requestOtp, slugA, { email: lee.email }, { ip: ipOf() });
    const vL = oL.v?.devOtp ? await call(F.verifyOtp, { otpId: oL.v.otpId, code: oL.v.devOtp }, meta()) : MISSING;
    chk("C3.5-S6.2", "revokedAt is read on EVERY request (not only by the revoke function): an access revoked by any path kills its live session immediately (getPortalSession null, home refused) and no new session can be minted for it (mint and OTP verify refused)",
      good(alive) && info.ok && info.v == null && !good(h) && h.code !== "MISSING_FUNCTION" && !good(again) && again.code !== "MISSING_FUNCTION" && !good(vL),
      "dead · no re-mint", `alive=${good(alive)} info=${rs(info)} home=${rs(h)} mint=${rs(again)} otp=${rs(vL)}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — every event of the tenant delivered twice + twice in parallel ⇒ nothing changes
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4 · replay ──");
  await settle(tidA);
  {
    const snap = async () => j({
      h: await P.crmDealStageHistory.findMany({ where: { tenantId: tidA }, orderBy: { id: "asc" }, select: { id: true, dealId: true, toStageId: true } }),
      d: await P.crmDeal.findMany({ where: { tenantId: tidA }, orderBy: { id: "asc" }, select: { id: true, stageId: true } }),
      a: await P.crmActivity.count({ where: { tenantId: tidA } }),
      r: await P.crmPortalRequest.findMany({ where: { tenantId: tidA }, orderBy: { id: "asc" }, select: { id: true, status: true, kanbanCardId: true, approvalRequestId: true } }),
      k: await P.kanbanCard.count({ where: { tenantId: tidA } }),
      p: await P.approvalRequest.count({ where: { tenantId: tidA } }),
      n: await P.appNotification.count({ where: { tenantId: tidA } }),
      o: await P.outboxEvent.count({ where: { tenantId: tidA } }),
    });
    const before = await snap();
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tidA }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[]);
    for (const e of evs) { await deliver(e); await deliver(e); }
    for (const e of evs) await Promise.all([deliver(e), deliver(e)]);
    await settle(tidA);
    const after = await snap();
    const types = [...new Set(evs.map((e) => String(e.type)))].sort();
    chk("C3.5-X4.1", `X4 — EVERY event of the tenant (${evs.length}: ${cut(types.join(" · "), 200)}) delivered to its consumer twice in a row and twice in parallel ⇒ stage history, deal stages, activities, requests, kanban cards, approval requests, notifications and the outbox itself are byte-identical (no second move, card, approval or event)`,
      evs.length > 0 && types.includes("account.quotation.responded") && after === before, "unchanged", `events=${evs.length} unchanged=${after === before}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — audits + permission gate on the staff side
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X9 · audit / staff gate ──");
  {
    const rC2 = await call(F.createRequest, tA, { kind: "CONTACT_CHANGE", title: "ขอเพิ่มผู้ติดต่อใหม่", payload: { name: "ผู้ติดต่อใหม่" } });
    const r2 = String(rC2.v?.id ?? rC2.v?.requestId ?? "");
    const dec = await call(F.decideRequest, cA, owner, { requestId: r2, approve: false, reason: "ข้อมูลไม่ตรงกับหนังสือรับรอง" });
    const row = r2 ? ((await P.crmPortalRequest.findUnique({ where: { id: r2 } })) as Any) : null;
    const accCount0 = (await P.crmPortalAccess.count({ where: { contactId: cara.id } })) as number;
    const thInv = await call(F.invite, cA, thana, { companyId: coA.id, contactId: cara.id });
    const thRev = await call(F.revoke, cA, thana, { accessId: accW, reason: "ลองถอดสิทธิ์" });
    const accCount1 = (await P.crmPortalAccess.count({ where: { contactId: cara.id } })) as number;
    const wAcc = accW ? await accessOf(accW) : null;
    const aud = async (action: string, targetId: string) => (targetId ? ((await P.auditLog.count({ where: { tenantId: tidA, action, targetId } })) as number) : 0);
    const nInv = await aud("crm.portal.invite", accW);
    const nRev = await aud("crm.portal.revoke", accWB);
    const nDec = await aud("crm.portal.request.decide", r2);
    chk("C3.5-X9.1", "audits: crm.portal.invite (access) · crm.portal.revoke (access) · crm.portal.request.decide (request — staff decideRequest ⇒ REJECTED + decidedAt) · a STAFF without crm.portal.manage is FORBIDDEN to invite and to revoke and nothing changes",
      nInv >= 1 && nRev >= 1 && nDec >= 1 && good(dec) && row?.status === "REJECTED" && !!row?.decidedAt && isFB(thInv) && isFB(thRev) && accCount1 === accCount0 && !wAcc?.revokedAt,
      "3 audits · 2 × FORBIDDEN", `invite=${nInv} revoke=${nRev} decide=${nDec}/${rs(dec)} status=${row?.status ?? "-"} thanaInvite=${rs(thInv)} thanaRevoke=${rs(thRev)} Δaccess=${accCount1 - accCount0} wannaRevoked=${!!wAcc?.revokedAt}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X10 — secrets & files · cookie · no new money path · member lane untouched
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X10 · secrets / files / cookie ──");
  {
    const blob = DTOS.map((d) => d.blob).join("\n") + j(slipA.v);
    const bad = ["private://", CDN, "publicToken", `t/${tidA}/private/`, "inviteTokenHash", "tokenHash", "codeHash"].filter((x) => blob.includes(x));
    const u = (() => { try { return new URL(slipUrlA, "http://x"); } catch { return null; } })();
    const fileId = u ? decodeURIComponent(u.pathname.split("/").pop() ?? "") : "";
    const exp = u?.searchParams.get("exp") ?? null;
    const sig = u?.searchParams.get("sig") ?? null;
    const sessBob = bobT ? ((await P.portalSession.findFirst({ where: { tokenHash: sha(bobT) } })) as Any) : null;
    const okOwn = typeof STORE.privateFileSignatureOk === "function" && !!sessA ? STORE.privateFileSignatureOk(fileId, exp, sig, { kind: "PORTAL", id: sessA.id }) === true : false;
    const okOther = typeof STORE.privateFileSignatureOk === "function" && !!sessBob ? STORE.privateFileSignatureOk(fileId, exp, sig, { kind: "PORTAL", id: sessBob.id }) === true : true;
    let okCust = true;
    try { okCust = typeof STORE.privateFileSignatureOk === "function" ? STORE.privateFileSignatureOk(fileId, exp, sig, { kind: "CUSTOMER", id: sessA?.id ?? "x" }) === true : true; } catch { okCust = false; }
    chk("C3.5-X10.1", "CRITICAL — no DTO of the run carries `private://`, the CDN host, publicToken, a storage path or any *Hash column · the slip link is bound to the PORTAL session it was issued to: the HMAC verifies for {kind:\"PORTAL\", id: that PortalSession.id} and NOT for another portal session nor for a CUSTOMER viewer with the same id",
      bad.length === 0 && okOwn && !okOther && !okCust, "clean DTOs · viewer-bound", `bad=${bad.join(",") || "-"} own=${okOwn} otherSession=${okOther} asCustomer=${okCust}${ABSENT}`);
  }
  {
    const name = String((await call(F.cookieName)).v ?? "");
    const isPortal = (await call(F.isPortalToken, tA)).v === true;
    const isCust = typeof CS.isCustomerToken === "function" ? CS.isCustomerToken(tA) === true : true;
    const custSees = (await call(CS.getCustomerSession, tA)).v;
    const authSrc = walk(B_DIR).map((f) => read(f)).join("\n") + walk("src/lib/modules/crm").filter((f) => /\/portal[^/]*\.ts$/.test(f)).map((f) => read(f)).join("\n");
    const usesOptions = /customerCookieOptions\s*\(/.test(authSrc);
    const selfFlags = /httpOnly\s*:\s*(true|false)/.test(authSrc.replace(/customerCookieOptions[\s\S]{0,40}/g, ""));
    chk("C3.5-X10.2", "session token & cookie: portal token has its own prefix (≠ cs_) · isPortalToken ✓ / isCustomerToken ✗ · the member lane does not accept it (getCustomerSession ⇒ null) · cookie name is the portal one (shark_portal / __Host-shark_portal, distinct from shark_customer) · every place that sets it uses customerCookieOptions (no hand-rolled flags)",
      !!PREFIX && PREFIX !== "cs_" && tA.startsWith(PREFIX) && isPortal && !isCust && custSees == null && /^(__Host-)?shark_portal$/.test(name) && usesOptions && !selfFlags,
      "own prefix · own cookie · shared options", `prefix=${j(PREFIX)} isPortal=${isPortal} isCustomer=${isCust} memberLane=${j(custSees)} cookie=${name || "-"} options=${usesOptions} selfFlags=${selfFlags}${ABSENT}`);
  }
  {
    const portalSrc = walk("src/lib/modules/crm").filter((f) => /\/portal[^/]*\.ts$/.test(f)).map((f) => read(f)).join("\n");
    const bPay = walk(B_DIR).filter((f) => /\/pay\//.test(f));
    const newMoney = /recordPayment\s*\(|accountDocumentPayment\s*\.\s*create|accountPaymentRequest\s*\.\s*create|beamAdapter/.test(portalSrc);
    const usesExisting = /createPaymentRequestForDoc/.test(portalSrc);
    const links = read(PRIVATE_LINKS_FILE);
    const route = read(FILE_ROUTE_FILE);
    chk("C3.5-X10.3", "no new money path: the portal pays only through account.createPaymentRequestForDoc (`/pay/<token>`) — no payment/charge rows written by portal code, no pay route under /b · private links: storage/private-links.ts knows a PORTAL viewer and /api/files resolves it from the portal cookie [static]",
      portalSrc.length > 0 && usesExisting && !newMoney && bPay.length === 0 && /["']PORTAL["']/.test(links) && /PORTAL/.test(route) && /portal/i.test(route),
      "existing path only · PORTAL viewer", `src=${portalSrc.length > 0} existing=${usesExisting} newMoney=${newMoney} bPay=${bPay.length} linksPORTAL=${/["']PORTAL["']/.test(links)} routePORTAL=${/PORTAL/.test(route)}${ABSENT}`, "MAJOR");
  }
  {
    const r = await call(CS.requestOtp, slugA, { email: mona.email }, { ip: ipOf() });
    const v = r.v?.devOtp ? await call(CS.verifyOtp, { otpId: r.v.otpId, code: r.v.devOtp }, meta()) : MISSING;
    const csTok = String(v.v?.token ?? "");
    const row = csTok ? ((await P.customerSession.findFirst({ where: { tokenHash: sha(csTok) } })) as Any) : null;
    const portalView = await call(F.getSession, csTok);
    const portalRows = (await P.portalSession.count({ where: { tokenHash: sha(csTok || "x") } })) as number;
    const portalReads = await call(F.listQuotations, csTok);
    chk("C3.5-X10.4", "[regression guard] the MEMBER login still works exactly as before in the same shop (OTP → CustomerSession with a cs_ token) and the two subjects never cross: getPortalSession(cs_ token) ⇒ null, no PortalSession row, portal reads with it refused",
      good(v) && csTok.startsWith("cs_") && row?.customerId === mona.id && portalView.ok && portalView.v == null && portalRows === 0 && !good(portalReads) && portalReads.code !== "MISSING_FUNCTION",
      "member ok · no crossing", `member=${rs(v).slice(0, 50)} row=${!!row} portalView=${rs(portalView)} rows=${portalRows} reads=${rs(portalReads)}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — shell · branding · LIFF · pages · testids · staff block (6)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S7 · shell / pages / UI ──");
  {
    const sh = read(PORTAL_SHARED_FILE);
    const pLayout = existsSync(P_DIR) && walk(P_DIR).length > 0;
    const hard = walk("src").filter((f) => !f.startsWith(PORTAL_SHARED_FILE) && !f.startsWith("src/app/b/")).filter((f) => /["'`]\/b\/\$\{/.test(read(f)) || /["'`]\/b\/["'`]\s*\+/.test(read(f)));
    chk("C3.5-S7.1", "ONE base-path constant (the owner may rename /b): PORTAL_BASE_PATH lives in crm/portal-shared.ts and no other src file hard-codes a `/b/${…}` URL · the PAGES route /p/[slug] still exists (C15 — not taken over)",
      /PORTAL_BASE_PATH\s*=\s*["']\/b["']/.test(sh) && hard.length === 0 && pLayout, "1 constant · /p intact", `constant=${/PORTAL_BASE_PATH/.test(sh)} hardcoded=${hard.join(",") || "-"} p=${pLayout}${ABSENT}`, "MAJOR");
  }
  {
    const need = ["layout.tsx", "page.tsx", "login/page.tsx", "invite/[token]/page.tsx", "quotations/page.tsx", "quotations/[id]/page.tsx", "invoices/page.tsx", "invoices/[id]/page.tsx", "documents/page.tsx", "documents/[id]/page.tsx", "requests/page.tsx", "contacts/page.tsx"];
    const missing = need.filter((p) => !existsSync(join(B_DIR, p)));
    const guarded = need.filter((p) => !/^(layout|login|invite)/.test(p)).filter((p) => !/requirePortal\s*\(/.test(read(join(B_DIR, p))));
    const idPages = need.filter((p) => p.includes("[id]")).filter((p) => !/notFound\s*\(/.test(read(join(B_DIR, p))));
    chk("C3.5-S7.2", "pages under /b/[slug]: layout · home · login · invite/[token] · quotations(+[id]) · invoices(+[id]) · documents(+[id]) · requests · contacts — every signed-in page goes through requirePortal(slug) and every [id] page answers notFound() for an id it may not see [static]",
      missing.length === 0 && guarded.length === 0 && idPages.length === 0, "12 pages · guarded · 404", `missing=${missing.join(",") || "-"} unguarded=${guarded.join(",") || "-"} no404=${idPages.join(",") || "-"}${ABSENT}`, "MAJOR");
  }
  {
    const lay = read(join(B_DIR, "layout.tsx"));
    const brand = /getBrandingTokens|getBranding|brandingTokens|branding\//.test(lay);
    const nf = /notFound\s*\(/.test(lay) && /portalShopBySlug|shopBySlug/.test(lay);
    const staffNav = /AppShell|components\/app\/|Sidebar|MNav/.test(lay);
    const viewport = /export\s+const\s+viewport/.test(lay);
    chk("C3.5-S7.3", "shell: /b/[slug]/layout.tsx applies the shop branding (branding tokens), 404s through portalShopBySlug when the shop has no live portal, exports a viewport (mobile-first — used inside LINE) and pulls in NO staff navigation (no rail / staff menu — mockup 12) [static]",
      brand && nf && !staffNav && viewport, "branding · 404 · no staff nav · viewport", `brand=${brand} notFound=${nf} staffNav=${staffNav} viewport=${viewport}${ABSENT}`, "MAJOR");
  }
  {
    const line = read(join(B_DIR, "auth/line/route.ts"));
    chk("C3.5-S7.4", "LIFF/LINE: /b/[slug]/auth/line/route.ts verifies the LINE id_token with LINE (api.line.me … verify) before calling loginWithLine, and sets the portal cookie through customerCookieOptions [static]",
      line.length > 0 && /api\.line\.me/.test(line) && /verify/i.test(line) && /loginWithLine|loginPortalWithLine/.test(line) && /customerCookieOptions/.test(line),
      "verify · login · cookie options", `file=${line.length > 0} lineVerify=${/api\.line\.me/.test(line)} login=${/loginWithLine|loginPortalWithLine/.test(line)} options=${/customerCookieOptions/.test(line)}${ABSENT}`, "MAJOR");
  }
  {
    const src = walk(B_DIR, /\.tsx?$/).map((f) => read(f)).join("\n") + walk(COMP_DIR, /\.tsx?$/).map((f) => read(f)).join("\n") + walk("src/components/portal", /\.tsx?$/).map((f) => read(f)).join("\n");
    const ids = ["portal-login-email", "portal-otp-request", "portal-otp-code", "portal-otp-submit", "portal-line-login", "portal-company-switcher", "portal-quote-accept", "portal-quote-reject", "portal-reject-reason", "portal-pay-promptpay", "portal-slip-upload", "portal-request-new", "portal-request-submit", "crm-portal-invite", "crm-portal-revoke"];
    const inCode = ids.filter((t) => src.includes(`"${t}`) || src.includes(`\`${t}`) || src.includes(`'${t}`));
    let inv: Any = {};
    try { inv = JSON.parse(read(INVENTORY) || "{}"); } catch { inv = {}; }
    const rows: Any[] = Array.isArray(inv?.rows) ? inv.rows : [];
    const invIds = new Set(rows.map((r) => String(r?.testid ?? "").replace(/\*$/, "")));
    // ORACLE-EDIT C3.5-S7.5 (sweep 27 Sep, C4.1 registry policy): a row is demanded for each id on an interactive element per the F14.1
    //   scanner (absent ⇒ strict); a non-interactive one counts as covered only because inCode (above) still demands it in the code
    const inInv = ids.filter((t) => !needsRegistryRow(t, src) || [...invIds].some((x) => x === t || t.startsWith(x) || x.startsWith(t)));
    const portalRows = rows.filter((r) => String(r?.page ?? "").startsWith("/b/[slug]")).length;
    chk("C3.5-S7.5", `D8: the ${ids.length} portal/staff testids exist in the code (login · OTP · LINE · switcher · accept/reject+reason · PromptPay · slip · request · invite · revoke) and each has a row in scripts/crm-ui-inventory.json (≥ 1 row with page "/b/[slug]…")`,
      inCode.length === ids.length && inInv.length === ids.length && portalRows >= 1, `${ids.length}/${ids.length}`, `code=${inCode.length}/${ids.length} inventory=${inInv.length}/${ids.length} portalRows=${portalRows} missingCode=${ids.filter((t) => !inCode.includes(t)).join(",") || "-"}${ABSENT}`, "MINOR");
  }
  {
    const items = itemsOf(accessList.v);
    const w = items.find((x) => String(x?.contactId) === wanna.id);
    const blob = j(accessList.v);
    const thList = await call(F.listAccess, cA, thana, { companyId: coA.id });
    const company360 = walk("src/app/app/sys/[id]/crm/companies").map((f) => read(f)).join("\n") + walk("src/components/crm/companies", /\.tsx?$/).map((f) => read(f)).join("\n");
    chk("C3.5-S7.6", "staff side (company 360 portal block): listAccess(coA) lists who can enter with role, acceptedAt and lastLoginAt (wanna has logged in) and never a token/hash · a STAFF without crm.portal.manage is refused · the company 360 page renders the portal block",
      good(accessList) && !!w && !!w.lastLoginAt && !!w.acceptedAt && !/tokenHash|inviteTokenHash/.test(blob) && refused(thList) && /crm-portal-invite|components\/crm\/portal/.test(company360),
      "list · lastLogin · no hash · gated · 360", `${rs(accessList).slice(0, 60)} wanna=${!!w} lastLogin=${!!w?.lastLoginAt} hash=${/tokenHash/.test(blob)} thana=${rs(thList)} page=${/crm-portal-invite|components\/crm\/portal/.test(company360)}${ABSENT}`, "MAJOR");
  }
  if (consumerErr.length) console.log(`  [info] consumer errors while delivering our events (first ${consumerErr.length}): ${cut(consumerErr.join(" || "), 600)}`);
  if (EXTERNAL.length) console.log(`  [info] external calls answered by the stub: ${cut([...new Set(EXTERNAL)].join(" | "), 300)}`);
  if (FIX.length) console.log(`  [fixture notes] ${cut(FIX.join(" | "), 500)}`);
  void QAd; void IAd; void RB1; void putLog; void LINE_CALLS; void fNote; void coC;
} catch (e) {
  chk("C3.5-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 700));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — every row of the throwaway tenants (4 passes over every table with tenantId), systems/tenants, users, and the
  // ChatRateBucket rows this run created. No global drainOutbox. No seeded row was touched.
  // ═════════════════════════════════════════════════════════════════════════════
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  try { if (typeof CSmod.__resetCustomerOtpLimit === "function") await CSmod.__resetCustomerOtpLimit(); } catch { /* best effort */ }
  const ourKey = (k: string) => ids.some((t) => k.includes(t)) || IP_PREFIXES.some((p) => k.includes(p)) || k.includes(TAG);
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1)
      for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    for (const uid of USERS) await del(() => P.session.deleteMany({ where: { userId: uid } }));
    for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
    const fresh = ((await P.chatRateBucket.findMany({ select: { key: true } }).catch(() => [])) as Any[]).map((r) => String(r.key)).filter((k) => !rateKeysBefore.has(k) && ourKey(k));
    for (const k of fresh) await del(() => P.chatRateBucket.delete({ where: { key: k } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const c = Number(r?.[0]?.n ?? 0);
        if (c > 0) left.push(`${t}=${c}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      const buckets = ((await P.chatRateBucket.findMany({ select: { key: true } })) as Any[]).map((r) => String(r.key)).filter((k) => !rateKeysBefore.has(k) && ourKey(k)).length;
      const audits = (await P.auditLog.count({ where: { tenantId: null, action: { startsWith: "crm.portal." }, createdAt: { gte: RUN_START } } }).catch(() => 0)) as number;
      chk("C3.5-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant and every row it owned (portal access/sessions/requests · OTPs · documents · pay requests · attachments · files · kanban · approvals · outbox · audit), the throwaway users and the rate-limit buckets this run created are gone",
        left.length === 0 && tenants === 0 && users === 0 && buckets === 0 && audits === 0, "0 rows · 0 tenants · 0 users · 0 buckets", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} buckets=${buckets} orphanAudits=${audits}`, "MAJOR");
    } catch (e) {
      chk("C3.5-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C3.5: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
