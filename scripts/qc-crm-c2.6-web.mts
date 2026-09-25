// QC — CRM v2 WO C2.6 (companion, HEADLESS BROWSER): the BROWSER half of `shark.js` — a real page on a real shop domain loads the
//      served tracker, a real consent banner is clicked, real browser cookies are written/read, real cross-origin POSTs leave the
//      browser, and the rows that appear (or must NOT appear) are read back from the QC database.
// Oracle writer · the C2.6 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
//
// WHY THIS FILE EXISTS (controller ruling 23 Sep 2569, brief C2.6 "Controller ruling"): `scripts/qc-crm-c2.6.mts` proves the SERVER
//   half of CRM-RUN §2 "S3" plus static properties of the served script body. It cannot prove that the script RUNS: that the banner
//   renders and is clickable, that `document.cookie` really receives `sd_vid`/`sd_consent` with the right flags, that a decline
//   leaves exactly ONE cookie, that CORS is enforced by the browser, that the honeypot field is really invisible, or that the
//   `/f/*` iframe embed is not killed by `X-Frame-Options`. C2.6 is NOT accepted on the server-side exam alone.
//
// Run:  bash scripts/acc-v2-serve.sh                                     # production build + QC server on :3215 (.env.qc)
//       bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.6-web.mts
//       bash scripts/acc-v2-serve.sh stop
//       `--force-run` = run everything while the C2.6 artefacts are absent (C2.6 checks go red for the right reason; the harness
//       controls S0.* and CLEAN go green — proves the proxy, the browser, the fixtures and the cleanup).
//       QC_BASE overrides http://127.0.0.1:3215.
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c26w-<rand>-*`)
//
// 🔴 A production build is mandatory (`next dev` does not hydrate in headless — lesson 13 Aug) and the build must contain the C2.6
//    routes; the exam checks the SERVED artefacts, never the source tree, except where a check says [static].
//
// HOW THE BROWSER REACHES A REAL SHOP DOMAIN (copied from the repo's harnesses: launch flags + chromium path + user-data-dir of
//   `scripts/visual-crm.mts`; server assumptions of `scripts/acc-v2-serve.sh` — QC server, .env.qc, port 3215, production build):
//   the tracker only writes when the page Origin is `https://<an allowed domain>` (`originAllowed` is https-only), so the page cannot
//   be served from 127.0.0.1. This exam therefore starts ONE local TLS front door and points the whole browser at it with
//   `--host-resolver-rules=MAP * 127.0.0.1:<port>` + `--ignore-certificate-errors`:
//     · `https://<shop domain>/<page>`  → the fixture HTML this file writes (a real page of the shop)
//     · every other host, and any `/t/* /f/* /l/* /api/* /_next/*` of a shop host → REVERSE-PROXIED to the QC server with
//       `x-forwarded-for` (a fake 10.x client ip we control), `x-forwarded-proto: https`, `x-forwarded-host: <host the browser asked
//       for>` (Next compares the server-action Origin against the forwarded host) and every other header byte-identical.
//   Nothing is mocked inside the browser: CORS, cookie attributes, mixed-content rules, `X-Frame-Options` and the 302 of `/l/<code>`
//   are enforced by chromium itself. Every request the browser makes is logged by the proxy ⇒ "zero rows" checks can prove that the
//   POST really left the browser (a broken transport must never read as a pass).
//
// SOURCES: crm-brief-C2.6.md (incl. the 13 addendum items ACCEPTED 23 Sep) · crm-brief-COMMON.md ("Oracle house style") ·
//   crm-brief-RESOLUTIONS.md (R-A purge · R-C.7 paths · R-E.14 uiVersion 1) · CRM-RUN §2 "C2.6" (**S3 is the group that literally
//   says "shark.js บน headless": 6 items** — plus the browser halves of S1 · S4 · S6 · S7) · §4 PERMANENT RULE (uiVersion-1 case) ·
//   MASTER-PLAN §3 D7 (no horizontal overflow is `visual-crm.mts`' job, not this file's) · §4 X1 X3 X4 X6 X7 X8 ·
//   scripts/qc-crm-c2.6.mts (CONTRACT A–G — authoritative; this file adds only the BROWSER-OBSERVABLE parts below).
//
// ══════════════════ CONTRACT — the browser-observable part (additive to CONTRACT A–G of scripts/qc-crm-c2.6.mts) ══════════════════
//   W1. The served tracker defines a GLOBAL function `sd` (`window.sd`) with the 4 commands of contract C: `sd("page")` ·
//       `sd("event", <name>)` · `sd("identify")` · `sd("revoke")`. Calling a command before a consent decision must not throw.
//       `sd` may return a Promise; the exam never relies on the return value (it waits for the POST to arrive at the proxy).
//   W2. CONSENT BANNER (no decision stored yet): the script appends ONE banner to the page, built with textContent (contract C),
//       carrying the shop's `consentText` VISIBLY and two clickable controls. To make the banner addressable the buttons carry
//       `data-sd="accept"` / `data-sd="decline"` and the banner root `data-sd="banner"` (**oracle-proposed naming — see the report;
//       the exam falls back to matching the visible Thai text ยอมรับ / ปฏิเสธ, so a text-only banner still passes**). After a
//       decision the banner is removed from the DOM and does NOT come back on reload.
//   W3. COOKIES, as seen in the real jar of the shop origin:
//         accept  ⇒ `sd_vid` (uuid v4 shape) + `sd_consent`, both `secure: true`, `httpOnly: false` (the script must read them),
//                   `sameSite` Lax or Strict, expiry ≈ 180 d (VISITOR_COOKIE_MAX_AGE_SEC ± 1 d), scoped to the shop host, path "/".
//         decline ⇒ EXACTLY ONE cookie on the shop origin and it is `sd_consent` (a declined visitor gets no visitor id at all).
//         revoke  ⇒ `sd_consent` states the revocation (its value changes) and no new row is ever written for that visitor.
//       `/l/<code>` sets `sd_u` with `httpOnly: true`, `secure: true`, `path: /l/<code>` (addendum item 5, accepted).
//   W4. `sd_ct` PICK-UP: on a page whose URL carries `?sd_ct=<ticket>` the tracker posts `t:"identify"` with that ticket by itself
//       (that is the whole point of the ticket appended by `/t/c` — the customer only clicks a link in an e-mail). The exam ALSO
//       accepts an explicit `window.sd("identify")` (recorded in the evidence of `C2.6W-S4.1`, MAJOR if only the explicit form works).
//   W5. The tracker posts to an ABSOLUTE `https://<app origin>/t/e` baked into the served body (a relative `/t/e` would 404 on the
//       shop's own domain in production). `C2.6W-S0.4` checks this on the served bytes; the harness keeps working either way.
//   W6. FORM PAGE `/f/<token>` in a real browser: the honeypot input (`FORM_HONEYPOT_FIELD`) is present and REALLY invisible
//       (computed style `display:none` / `visibility:hidden` / zero box / off-screen) and out of the tab order (`tabindex="-1"` or
//       hidden), `autocomplete="off"`; the start token is a hidden input; a refusal is shown INLINE in Thai (never `alert()`, never
//       a blank page); submitting twice fast writes exactly one row.
//   W7. `/f/*` may be framed (the proxy edit of addendum item 10) while `/app/*` may NOT — proven by chromium, not by a header regex.
//   W8. The tracker never reads form fields: nothing the user types into a form on the page may appear in ANY request body the
//       browser sends (the proxy records every body) nor in any row.
//   W9. USER AGENT (added 25 ก.ย. after the first real run): the exam drives every page with a REALISTIC DESKTOP user agent
//       (chromium's own, with `HeadlessChrome` rewritten to `Chrome`), because C2.5's single bot engine (`isTrackingBot` ·
//       `BOT_UA_RE` matches `headless`) makes `/l/<code>` redirect WITHOUT counting for a headless UA — correct in production,
//       fatal for an exam that pretends to be a customer. `C2.6W-S1.3` is the negative control: ONE page keeps the untouched
//       headless UA and must still be redirected while NOTHING is counted. No product behaviour is waived by this.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS FILE PROVES: S0 harness controls · S1 browser half of CRM-RUN S1 (302 · real cookie jar · unique clicks) · S3 the SIX
//   headless items of CRM-RUN S3 · S4 browser half of identify · S6 browser half of the forms/spam-guard items · S7 allowed domains
//   as enforced by the browser · U the uiVersion-1 case + its v2 positive control · X1 X3 X4 X6 X7 X8 · CLEAN.
//   N/A here: X5 (the purge job has no browser surface — `C2.6-X5.1` in the server exam) · X9 (this file drives no danger mutation —
//   `C2.6-X9.1/X9.2`) · X2 · X10 (N/A for C2.6 as a whole, per the controller's ruling of 23 Sep).
// HOUSE RULES: SKIP guard (C2.6 absent · C2.0 tables absent · QC server unreachable · chromium/puppeteer/openssl absent) before any
//   DB connection · throwaway tenants swept in `finally` (every table with a tenantId, 4 passes) + users + this run's limiter buckets ·
//   the chromium profile and the TLS material live in one temp dir that is deleted in `finally` (lesson: a leftover chromium profile
//   once filled the disk to 99%) · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const TRACK = "src/lib/modules/crm/tracking.ts";
const SCHEMA_DIR = "prisma/schema";
const CHROME = "/usr/bin/chromium-browser";
const PPTR = "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const DAY = 86_400_000;

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guards — never a silent pass: each one prints exactly what is missing.
// ═══════════════════════════════════════════════════════════════════════════════════
const skip = (why: string): never => {
  console.log(`⚠️  SKIPPED — ${why}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
};
const schemaAll = existsSync(SCHEMA_DIR)
  ? readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".prisma")).map((f) => read(join(SCHEMA_DIR, f))).join("\n")
  : "";
const BUILT = existsSync(TRACK);
const C20 = /model\s+CrmWebSession\s*\{/.test(schemaAll) && (existsSync("prisma/migrations") ? readdirSync("prisma/migrations").some((d) => /_crm_v2_b$/.test(d)) : false);
if (!FORCE && !BUILT) skip(`WO C2.6 not built yet (${TRACK} missing) — run with --force-run to exercise the browser harness and the cleanup`);
if (!FORCE && !C20) skip("prerequisite C2.0 absent: model CrmWebSession / prisma/migrations/*_crm_v2_b not in the tree");
if (!existsSync(CHROME)) skip(`headless chromium not found at ${CHROME} (same binary as scripts/visual-crm.mts)`);
if (!existsSync(PPTR)) skip(`puppeteer-core not found at ${PPTR} (same copy as scripts/visual-crm.mts)`);
{
  const v = spawnSync("openssl", ["version"], { encoding: "utf8" });
  if (v.status !== 0) skip("`openssl` is required to mint the throwaway TLS certificate of the local front door (the shop page must be https)");
}
{
  // the QC server must answer BEFORE anything else happens (never hang, never pass silently)
  const ping = await fetch(`${BASE}/login`, { method: "GET" }).then((r) => r.status).catch((e: unknown) => `ERR ${e instanceof Error ? e.message : String(e)}`);
  if (typeof ping !== "number" || ping >= 500) {
    skip(`no QC server on ${BASE} (got ${ping}) — start it first: bash scripts/acc-v2-serve.sh  (production build on .env.qc, port 3215)`);
  }
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host: dbHost } = accEnv.loadQcEnv();
process.env.RESEND_API_KEY = "re_qc_c26w_fake";
delete process.env.TURNSTILE_SECRET_KEY;

// ─── harness ───
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const out = (s: string) => process.stdout.write(`${s}\n`);
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  out(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, n = 240) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
type Res = { ok: boolean; v: Any; err: string; code: string; msg: string };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", msg: "" };
  try { return { ok: true, v: await fn(...args), err: "", code: "", msg: "" }; } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 140)}`, code: String(x?.code ?? ""), msg };
  }
};
const rd = (r: Res) => (r.ok ? "ok" : r.err);
const thaiYmd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "q");
const TAG = `qc-c26w-${rand}`;
const RUN_START = new Date(Date.now() - 5_000);
const TMP = `/tmp/${TAG}`;
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };

out(`\n═══ QC CRM v2 · C2.6-web — the browser half of shark.js (real page · real banner · real cookies) ═══`);
out(`[env] DB ${dbHost} · app ${BASE} · tag ${TAG}${FORCE && (!BUILT || !C20) ? ` · --force-run with ${!BUILT ? "C2.6 ABSENT" : "C2.0 tables ABSENT"} (C2.6 checks expected red; harness controls + CLEAN green)` : ""}\n`);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TENANTS: string[] = [];
const USERS: string[] = [];
let seq = 0;
const nx = () => `${++seq}`;

// domains of the throwaway shops (never resolved on the real internet — the browser maps every host to our front door)
const DOM_A = `shop-${rand}.example.com`;
const DOM_B = `other-${rand}.example.com`;
const DOM_V = `v1-${rand}.example.com`;
const OR_A = `https://${DOM_A}`;
const OR_B = `https://${DOM_B}`;
const OR_V = `https://${DOM_V}`;
const SHOP_HOSTS = new Set([DOM_A, DOM_B, DOM_V]);

// ── the fake client ip the proxy stamps · rotating by default so that one check never eats another check's DB limiter bucket ──
let ipSeq = 0;
let STICKY_IP: string | null = null;
const ipNew = () => { ipSeq += 1; return `10.26.${(ipSeq >> 8) & 255}.${ipSeq & 255}`; };
const currentIp = () => STICKY_IP ?? ipNew();

// ── the pages our front door serves for the shop hosts (filled after the fixtures exist) ──
const PAGES = new Map<string, string>();
type ReqLog = { method: string; host: string; path: string; status: number; origin: string; body: string; setCookie: string; xfo: string };
const LOG: ReqLog[] = [];
const postsTo = (p: string) => LOG.filter((r) => r.path === p && r.method === "POST");
const waitForPosts = async (p: string, n: number, timeoutMs = 15_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (postsTo(p).length >= n) return true;
    await sleep(120);
  }
  return false;
};

let browser: Any = null;
let server: Any = null;
const FIXTURE_NOTES: string[] = [];

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // modules (dynamic — they may not exist yet)
  // ═════════════════════════════════════════════════════════════════════════════
  const TR = (await import("@/lib/modules/crm/tracking" as string).catch(() => ({}))) as Any;
  const TSH = (await import("@/lib/modules/crm/tracking-shared" as string).catch(() => ({}))) as Any;
  const SG = (await import("@/lib/modules/forms/spam-guard" as string).catch(() => ({}))) as Any;
  const VISITOR_COOKIE = String(TSH.VISITOR_COOKIE ?? "sd_vid");
  const CONSENT_COOKIE = String(TSH.CONSENT_COOKIE ?? "sd_consent");
  const COOKIE_MAX_AGE = Number(TSH.VISITOR_COOKIE_MAX_AGE_SEC ?? 15_552_000);
  const MAXB = Number(TSH.TRACKING_PAYLOAD_MAX_BYTES ?? 8192);
  const PER_IP = Number(TSH.TRACKING_RATE_LIMITS?.collectPerIp?.limit ?? 60);
  const HP = String(SG.FORM_HONEYPOT_FIELD ?? "website");
  const MIN_SEC = Number(SG.FORM_SPAM_GUARD_DEFAULTS?.minSeconds ?? 3);

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — throwaway tenants: A (v2 · tracking on DOM_A · form) · B (v2 · DOM_B) · V (uiVersion 1 · DOM_V)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const userA = await mkUser("");
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    await P.membership.create({ data: { userId: userA, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    return t.id as string;
  };
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);

  const tidA = await mkTenant("a");
  const crmA = await mk(tidA, "CRM", "CRM");
  const tidB = await mkTenant("b");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const tidV = await mkTenant("v1");
  const crmV = await mk(tidV, "CRM", "CRM-V1");
  for (const s of [crmA, crmB]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmV, { uiVersion: 1, bridgesEnabled: true });
  const owner = { userId: userA, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: userA };

  // consent text carries Thai + a hostile payload (X6: it is baked into a <script> body and printed into the DOM)
  const CONSENT_TXT = `เว็บไซต์นี้ใช้คุกกี้เพื่อจดจำการเข้าชม ${TAG} </script><img src=x onerror="window.__sdPwn=1"> "' `;
  const SITE: Record<string, string> = {};
  const enableWeb = async (c: Any, sysId: string, domains: string[]) => {
    const r = await call(TR.saveWebSettings, c, owner, { enabled: true, domains, consentText: CONSENT_TXT, retentionDays: 180 });
    let key = String(r.v?.siteKey ?? "");
    if (!r.ok || !key) {
      key = `${TAG}-${sysId.slice(-6)}`;
      await setCrm(sysId, { tracking: { web: { enabled: true, domains, consentText: CONSENT_TXT, consentVersion: 1, retentionDays: 180, siteKey: key } } });
      FIXTURE_NOTES.push(`saveWebSettings(${sysId}) ${rd(r)} → raw settings`);
    }
    SITE[sysId] = key;
  };
  await enableWeb(cA, crmA, [DOM_A]);
  await enableWeb(cB, crmB, [DOM_B]);
  const KEY_V = `${TAG}-v1key`;
  await setCrm(crmV, { tracking: { web: { enabled: true, domains: [DOM_V], consentText: CONSENT_TXT, consentVersion: 1, retentionDays: 180, siteKey: KEY_V } } });
  SITE[crmV] = KEY_V;
  const CV = Number(((await P.appSystem.findFirst({ where: { id: crmA } }))?.settings?.crm?.tracking?.web?.consentVersion) ?? 1);

  // contact of shop A (identify target) + a tracked link + a public form
  const cName = pii(`คุณเว็บ ${TAG}`);
  const cMail = pii(`${TAG}-web@qc-crm.example`);
  const party = await P.party.create({ data: { tenantId: tidA, name: cName, kind: "PERSON" } });
  const contact = await P.crmContact.create({ data: { tenantId: tidA, systemId: crmA, name: cName, firstName: cName, phone: pii("0812345678"), email: cMail, partyId: party.id, ownerUserId: userA } });
  const LINK_URL = `${OR_A}/promo/summer?utm_source=print&utm_medium=qr`;
  const linkRes = await call(TR.createLink, cA, owner, { url: LINK_URL, name: `ลิงก์ ${TAG}`, channel: "QR" });
  const LINK: Any = linkRes.v ?? {};
  const linkV = await call(TR.createLink, { tenantId: tidV, systemId: crmV, actorUserId: userA }, owner, { url: `${OR_V}/print`, name: "v1" });
  let LINK_V_CODE = String(linkV.v?.code ?? "");
  let LINK_V_ID = String(linkV.v?.id ?? "");
  if (!LINK_V_CODE) {
    // uiVersion 1 refuses createLink (C2.6-U.1) — a PRINTED link of a v1 shop still has to redirect, so seed the row directly
    const row = await P.crmTrackedLink?.create?.({ data: { tenantId: tidV, systemId: crmV, code: `${TAG}v1`.slice(0, 24), url: `${OR_V}/print`, name: "v1 printed", active: true } }).catch(() => null);
    LINK_V_CODE = String(row?.code ?? "");
    LINK_V_ID = String(row?.id ?? "");
    if (row) FIXTURE_NOTES.push("v1 tracked link seeded directly (createLink is refused for uiVersion 1 — by design)");
  }
  const FORM_FIELDS = [
    { key: "name", label: "ชื่อ", type: "text", required: true },
    { key: "email", label: "อีเมล", type: "email", required: false },
    { key: "phone", label: "โทร", type: "phone", required: false },
  ];
  const form: Any = await P.formDef.create({
    data: { tenantId: tidA, name: `ฟอร์มเว็บ ${TAG}`, publicToken: `${TAG}-form-${nx()}`.replace(/[^A-Za-z0-9_-]/g, "x"), crmEnabled: true, fieldsJson: FORM_FIELDS },
  });
  // crmSystemId exists only after C2.0 (crm_v2_b) — set it separately so the fixture also works in --force-run
  await P.formDef.update({ where: { id: form.id }, data: { crmSystemId: crmA } }).catch(() => null);
  const FORM_URL_APP = `${BASE}/f/${form.publicToken}`;

  // ═════════════════════════════════════════════════════════════════════════════
  // FRONT DOOR — one TLS server: fixture pages for the shop hosts · reverse proxy for everything else
  // ═════════════════════════════════════════════════════════════════════════════
  mkdirSync(TMP, { recursive: true });
  const KEYF = join(TMP, "key.pem");
  const CRTF = join(TMP, "cert.pem");
  {
    const args = ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", KEYF, "-out", CRTF, "-days", "2", "-subj", "/CN=qc-c26w"];
    let r = spawnSync("openssl", [...args, "-addext", `subjectAltName=DNS:${DOM_A},DNS:${DOM_B},DNS:${DOM_V},DNS:shark.in.th,DNS:localhost`], { encoding: "utf8" });
    if (r.status !== 0) r = spawnSync("openssl", args, { encoding: "utf8" });
    // 🔴 never process.exit() from inside the try: the throwaway tenants already exist and the cleanup lives in `finally`
    if (r.status !== 0 || !existsSync(CRTF)) throw new Error(`openssl could not mint the throwaway certificate: ${cut(r.stderr ?? r.stdout, 200)}`);
  }
  const httpsMod = (await import("node:https" as string)) as Any;
  const httpMod = (await import("node:http" as string)) as Any;
  const APP = new URL(BASE);
  const upstream = APP.protocol === "https:" ? httpsMod : httpMod;
  const appHeaderHost = APP.host;

  const shell = (title: string, siteKey: string | null, extra = "") => `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>${title}</title></head><body>
<h1 data-qc="title">${title}</h1>
<form id="qcform" onsubmit="return false"><label>อีเมล <input name="email" id="qcemail" value=""></label>
<label>โทร <input name="phone" id="qcphone" value=""></label><button id="qcsend" type="submit">ส่ง</button></form>
${extra}
${siteKey ? `<script src="${"__SCRIPT_ORIGIN__"}/t/s/${siteKey}.js"></script>` : ""}
</body></html>`;

  const serveFixture = (host: string, path: string): string | null => {
    const exact = PAGES.get(`${host}${path}`);
    if (exact) return exact;
    const anyPage = PAGES.get(`${host}*`);
    return anyPage ?? null;
  };
  server = httpsMod.createServer({ key: readFileSync(KEYF), cert: readFileSync(CRTF) }, (req: Any, res: Any) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const rawHost = String(req.headers.host ?? "");
      const host = rawHost.split(":")[0] ?? "";
      const url = String(req.url ?? "/");
      const path = url.split("?")[0] ?? "/";
      const origin = String(req.headers.origin ?? "");
      const appPath = /^\/(t|f|l|u|api|_next|__nextjs)(\/|$)/.test(path);
      if (SHOP_HOSTS.has(host) && !appPath) {
        const html = serveFixture(host, path);
        const payload = html ?? shell(`${host}${path}`, null);
        LOG.push({ method: String(req.method), host, path, status: 200, origin, body: body.toString("utf8").slice(0, 2048), setCookie: "", xfo: "" });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(payload);
        return;
      }
      const ip = currentIp();
      const headers: Record<string, Any> = { ...req.headers };
      headers.host = appHeaderHost;
      headers["x-forwarded-for"] = ip;
      headers["x-forwarded-proto"] = "https";
      headers["x-forwarded-host"] = rawHost;
      delete headers["content-length"];
      const preq = upstream.request(
        { host: APP.hostname, port: APP.port || (APP.protocol === "https:" ? 443 : 80), method: req.method, path: url, headers, rejectUnauthorized: false },
        (pres: Any) => {
          const outChunks: Buffer[] = [];
          pres.on("data", (c: Buffer) => outChunks.push(c));
          pres.on("end", () => {
            const buf = Buffer.concat(outChunks);
            const sc = pres.headers["set-cookie"];
            LOG.push({
              method: String(req.method), host, path, status: Number(pres.statusCode ?? 0), origin,
              body: body.toString("utf8").slice(0, 2048), setCookie: Array.isArray(sc) ? sc.join(" || ") : String(sc ?? ""),
              xfo: String(pres.headers["x-frame-options"] ?? ""),
            });
            const oh: Record<string, Any> = { ...pres.headers };
            delete oh["content-length"];
            delete oh["transfer-encoding"];
            res.writeHead(Number(pres.statusCode ?? 502), oh);
            res.end(buf);
          });
        },
      );
      preq.on("error", (e: Any) => {
        LOG.push({ method: String(req.method), host, path, status: -1, origin, body: `UPSTREAM ${e?.message ?? e}`, setCookie: "", xfo: "" });
        res.writeHead(502, { "content-type": "text/plain" });
        res.end("upstream error");
      });
      if (body.length > 0) preq.write(body);
      preq.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const PROXY_PORT = Number((server.address() as Any).port);

  // the origin the served tracker posts to (from the served bytes — never guessed)
  const servedScript = await fetch(`${BASE}/t/s/${SITE[crmA]}.js`).then(async (r) => ({ status: r.status, ct: r.headers.get("content-type") ?? "", body: await r.text() })).catch((e: unknown) => ({ status: -1, ct: "", body: `ERR ${e instanceof Error ? e.message : String(e)}` }));
  const absPost = /(https?:\/\/[^\s"'`)]+?)\/t\/e\b/.exec(servedScript.body)?.[1] ?? "";
  const SCRIPT_ORIGIN = absPost || "https://shark.in.th";
  const page = (title: string, sys: string, extra = "") => shell(title, SITE[sys], extra).replace(/__SCRIPT_ORIGIN__/g, SCRIPT_ORIGIN);
  PAGES.set(`${DOM_A}/`, page(`หน้าแรก ${TAG}`, crmA));
  PAGES.set(`${DOM_A}/courses`, page(`คอร์ส ${TAG}`, crmA));
  PAGES.set(`${DOM_A}/team`, page(`ทีม ${TAG}`, crmA));
  PAGES.set(`${DOM_A}/contact`, page(`ติดต่อ ${TAG}`, crmA));
  PAGES.set(`${DOM_A}/landing`, page(`ปลายทางอีเมล ${TAG}`, crmA));
  PAGES.set(`${DOM_A}/embed`, page(`ฝังฟอร์ม ${TAG}`, crmA,
    `<iframe id="fi" src="https://shark.in.th/f/${form.publicToken}" width="400" height="300"></iframe><iframe id="fa" src="https://shark.in.th/app" width="200" height="120"></iframe>`));
  PAGES.set(`${DOM_A}*`, page(`หน้าอื่น ${TAG}`, crmA));
  PAGES.set(`${DOM_B}/`, page(`เว็บร้านอื่น (คีย์ของร้าน A) ${TAG}`, crmA)); // X1/S7: A's script on a domain A never allowed
  PAGES.set(`${DOM_B}/own`, page(`เว็บร้านอื่น (คีย์ของตัวเอง) ${TAG}`, crmB));
  PAGES.set(`${DOM_B}*`, page(`หน้าอื่นร้านอื่น ${TAG}`, crmA));
  PAGES.set(`${DOM_V}/`, page(`ร้าน v1 ${TAG}`, crmV));
  PAGES.set(`${DOM_V}*`, page(`ร้าน v1 อื่น ${TAG}`, crmV));

  // ═════════════════════════════════════════════════════════════════════════════
  // BROWSER — same binary/flags as scripts/visual-crm.mts + the front-door mapping of this exam
  // ═════════════════════════════════════════════════════════════════════════════
  const pptr = (await import(PPTR as string)) as Any;
  browser = await pptr.default.launch({
    executablePath: CHROME,
    acceptInsecureCerts: true,
    args: [
      "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
      `--user-data-dir=${join(TMP, "chr")}`,
      `--host-resolver-rules=MAP * 127.0.0.1:${PROXY_PORT}, EXCLUDE localhost, EXCLUDE 127.0.0.1`,
      "--ignore-certificate-errors",
      "--allow-running-insecure-content",
      "--disable-features=Translate,BackForwardCache,OptimizationHints",
    ],
  });
  // ── USER AGENT (ORACLE-EDIT 25 ก.ย.): chromium headless announces itself as `HeadlessChrome/…`, and C2.5's single bot engine
  //    (`isTrackingBot` · `emails-shared.BOT_UA_RE` = /(bot|spider|crawl|preview|curl\/|wget\/|python-requests|headless)/i) treats
  //    every `headless` UA as a machine ⇒ `/l/<code>` redirects WITHOUT counting (`resolveLinkHit`, by design — the PRODUCT is right:
  //    in production a headless UA IS a bot). A real customer's browser is not headless, so the exam presents a realistic desktop UA
  //    on every page it opens; `C2.6W-S1.3` keeps the bot rule itself under test by driving ONE page with the untouched headless UA.
  const RAW_UA = String(await browser.userAgent().catch(() => "")) ||
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  const DESKTOP_UA = RAW_UA.replace(/HeadlessChrome/g, "Chrome").replace(/\s*Headless\s*/g, " ").replace(/\s+/g, " ").trim();
  const BOT_UA = /Headless/i.test(RAW_UA) ? RAW_UA : RAW_UA.replace("Chrome/", "HeadlessChrome/");
  const isBotUa = (ua: string): boolean => (typeof TSH.isBotUserAgent === "function" ? !!TSH.isBotUserAgent(ua) : /headless/i.test(ua));
  // ── `__name` SHIM (ORACLE-EDIT 25 ก.ย.): tsx/esbuild compiles this file with keep-names, so every inner named function of an
  //    `evaluate` body is emitted as `__name(fn, "fn")`. `__name` is an esbuild helper of THIS module — it does not exist inside the
  //    page, so any evaluate body holding an inner `const f = () => …` died with `ReferenceError: __name is not defined`
  //    (X7.2 · X7.3 · the FATAL at X3). Declaring it as a no-op in every document — and re-asserting it before every
  //    function-valued `evaluate`, for documents that were already loaded — is a pure harness fix: nothing of the product changes.
  const NAME_SHIM = "globalThis.__name = globalThis.__name || function (f) { return f; };";
  type Ctx = { ctx: Any; pages: Any[]; errors: string[]; console: string[] };
  const CTXS: Ctx[] = [];
  const newCtx = async (): Promise<Ctx> => {
    const maker = browser.createBrowserContext ?? browser.createIncognitoBrowserContext;
    const ctx = await maker.call(browser);
    const holder: Ctx = { ctx, pages: [], errors: [], console: [] };
    CTXS.push(holder);
    return holder;
  };
  const openPage = async (holder: Ctx, ua: string = DESKTOP_UA) => {
    const pg = await holder.ctx.newPage();
    await pg.setUserAgent(ua).catch(() => null);                        // never `HeadlessChrome` unless a check asks for it
    await pg.evaluateOnNewDocument(NAME_SHIM).catch(() => null);        // every future document of this page (and its frames)
    const rawEval = pg.evaluate.bind(pg);
    pg.evaluate = async (fn: Any, ...args: Any[]) => {                  // and the document that is already open
      if (typeof fn === "function") await rawEval(NAME_SHIM).catch(() => null);
      return rawEval(fn, ...args);
    };
    await pg.setViewport({ width: 1280, height: 800 });
    pg.on("pageerror", (e: Error) => holder.errors.push(cut(e.message, 160)));
    pg.on("console", (m: Any) => { const t = String(m.text()); holder.console.push(`${m.type()}:${cut(t, 200)}`); });
    holder.pages.push(pg);
    return pg;
  };
  const go = async (pg: Any, url: string) => {
    const r = await pg.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e: unknown) => ({ status: () => -1, _err: String(e) }));
    await sleep(700);
    return r;
  };
  const cookiesOf = async (pg: Any, url: string): Promise<Any[]> => {
    try {
      const cdp = await pg.createCDPSession();
      const r = await cdp.send("Network.getCookies", { urls: [url] });
      await cdp.detach().catch(() => null);
      return (r?.cookies ?? []) as Any[];
    } catch { return []; }
  };
  const cookieNamed = (cs: Any[], name: string) => cs.find((c) => c.name === name) ?? null;
  /** click the banner's accept/decline control — `data-sd` first (contract W2), visible Thai text as the fallback */
  const clickBanner = async (pg: Any, what: "accept" | "decline"): Promise<string> => {
    const label = what === "accept" ? "ยอมรับ" : "ปฏิเสธ";
    const viaAttr = await pg.$(`[data-sd="${what}"]`);
    if (viaAttr) { await viaAttr.click().catch(() => null); return "data-sd"; }
    const hit = await pg.evaluate((lbl: string) => {
      const nodes = Array.from(document.querySelectorAll("button,a,[role=button],div,span"));
      const el = nodes.find((n) => (n.textContent ?? "").trim() === lbl) as HTMLElement | undefined;
      if (!el) return false;
      el.click();
      return true;
    }, label).catch(() => false);
    return hit ? "text" : "not-found";
  };
  const bannerSeen = (pg: Any) => pg.evaluate((txt: string) => {
    const root = document.querySelector('[data-sd="banner"]');
    const body = document.body?.innerText ?? "";
    return { root: !!root, text: body.includes(txt), pwn: !!(window as Any).__sdPwn, imgs: document.querySelectorAll("img[onerror], img[src=x]").length };
  }, `เพื่อจดจำการเข้าชม ${TAG}`).catch(() => ({ root: false, text: false, pwn: false, imgs: -1 }));
  const sd = async (pg: Any, cmd: string, arg?: unknown) => pg.evaluate((c: string, a: unknown) => {
    const f = (window as Any).sd;
    if (typeof f !== "function") return "NO_SD";
    try { const r = a === undefined ? f(c) : f(c, a); return r && typeof r.then === "function" ? "promise" : "sync"; } catch (e) { return `THREW ${String(e)}`; }
  }, cmd, arg ?? undefined).catch((e: unknown) => `EVAL ${String(e)}`);

  // ─── DB readers ───
  const safeMany = async (model: string, args: Any): Promise<Any[]> => { try { return (await P[model]?.findMany?.(args)) ?? []; } catch { return []; } };
  const sessionsOf = (tid: string, visitorId: string) => safeMany("crmWebSession", { where: { tenantId: tid, visitorId }, orderBy: [{ startedAt: "asc" }, { id: "asc" }] });
  const rowsOf = async (tid: string, visitorId: string) => {
    const s = await sessionsOf(tid, visitorId);
    const e = s.length ? await safeMany("crmWebEvent", { where: { sessionId: { in: s.map((x) => x.id) } } }) : [];
    return { s, e, pv: e.filter((x) => x.kind === "PAGEVIEW").length, pageViews: s.reduce((n, x) => n + Number(x.pageViews ?? 0), 0) };
  };
  const allSessions = (tid: string) => safeMany("crmWebSession", { where: { tenantId: tid } });
  const vidOf = async (pg: Any, origin: string) => String(cookieNamed(await cookiesOf(pg, origin), VISITOR_COOKIE)?.value ?? "");

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — harness controls (if these are red, every "zero rows" check below proves nothing)
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S0 · harness controls ──");
  const c0 = await newCtx();
  const p0 = await openPage(c0);
  const r0 = await go(p0, `${OR_A}/`);
  const sdType = await p0.evaluate(() => typeof (window as Any).sd).catch(() => "eval-failed");
  chk("C2.6W-S0.1", `a real page on https://${DOM_A} loads the served tracker and window.sd is a function (browser · TLS front door · host-resolver mapping all work)`,
    (r0 as Any)?.status?.() === 200 && sdType === "function", "200 + function",
    `status=${(r0 as Any)?.status?.() ?? "-"} sd=${sdType} scriptOrigin=${SCRIPT_ORIGIN} served=${servedScript.status}/${cut(servedScript.ct, 40)}/${servedScript.body.length}B`);
  chk("C2.6W-S0.2", "[positive control] the browser really reached the app through the front door: the script GET is in the proxy log with 200 (every ZERO-ROWS check below depends on this transport)",
    LOG.some((r) => r.path === `/t/s/${SITE[crmA]}.js` && r.status === 200), "GET /t/s/<key>.js 200",
    cut(LOG.filter((r) => r.path.startsWith("/t/")).map((r) => `${r.method} ${r.path}→${r.status}`).join(" · ") || "no /t/* request", 200));
  chk("C2.6W-S0.3", "the tracker runs clean in a real browser: no uncaught page error, no console error, no sub-request ≥ 400 from the page",
    c0.errors.length === 0 && c0.console.filter((l) => l.startsWith("error:")).length === 0 && !LOG.some((r) => r.host === DOM_A && r.status >= 400),
    "no errors", `pageerrors=${cut(c0.errors.join(" | "), 120) || "-"} console=${cut(c0.console.filter((l) => l.startsWith("error:")).join(" | "), 140) || "-"} http4xx=${LOG.filter((r) => r.host === DOM_A && r.status >= 400).map((r) => `${r.path}:${r.status}`).join(",") || "-"}`);
  chk("C2.6W-S0.4", "the served tracker posts to an ABSOLUTE https URL of the app (a relative `/t/e` would hit the shop's own domain in production) [static on the served bytes]",
    /^https:\/\//.test(absPost), "absolute https", absPost || "relative or not found", "MAJOR");

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — the SIX headless items of CRM-RUN §2 "C2.6 · S3"
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S3 · shark.js in a real browser (CRM-RUN S3, 6 items) ──");
  {
    const b = await bannerSeen(p0);
    const cs = await cookiesOf(p0, OR_A);
    chk("C2.6W-S3.1", "first visit, no decision yet: the consent banner is IN the page with the shop's Thai consent text and a clickable ยอมรับ / ปฏิเสธ · no cookie yet · zero sessions",
      (b.root || b.text) && b.text && cs.length === 0 && (await allSessions(tidA)).length === 0, "banner + 0 cookies + 0 sessions",
      `bannerRoot=${b.root} textShown=${b.text} cookies=${cs.map((c) => c.name).join(",") || "-"} sessions=${(await allSessions(tidA)).length}`);
  }
  {
    const before = postsTo("/t/e").length;
    await sd(p0, "page");
    await sd(p0, "event", "cta");
    await sleep(1200);
    const arrived = postsTo("/t/e").length - before;
    const rows = (await allSessions(tidA)).length;
    chk("C2.6W-S3.2", "no consent decision: the page may call sd('page')/sd('event') — nothing is stored (ZERO sessions/events) · the POSTs did leave the browser (control: S3.3 writes rows through the very same transport)",
      rows === 0, "0 rows", `sessions=${rows} postsArrived=${arrived} answers=${postsTo("/t/e").slice(-2).map((r) => r.status).join(",") || "-"}`);
  }
  let vidA = "";
  {
    const how = await clickBanner(p0, "accept");
    const ok = await waitForPosts("/t/consent", 1, 12_000);
    await sleep(900);
    const cs = await cookiesOf(p0, OR_A);
    vidA = String(cookieNamed(cs, VISITOR_COOKIE)?.value ?? "");
    const vc = cookieNamed(cs, VISITOR_COOKIE);
    const cc = cookieNamed(cs, CONSENT_COOKIE);
    const maxAgeOk = (c: Any) => !!c && Number(c.expires) > 0 && Math.abs((Number(c.expires) * 1000 - Date.now()) - COOKIE_MAX_AGE * 1000) < 2 * DAY;
    const rows = await rowsOf(tidA, vidA || "none");
    const s: Any = rows.s[0] ?? {};
    const consentEv = rows.e.filter((e) => e.kind === "CONSENT").length;
    const after = await bannerSeen(p0);
    chk("C2.6W-S3.3", `clicking ยอมรับ writes the REAL cookies (${VISITOR_COOKIE} uuid + ${CONSENT_COOKIE}: secure, NOT httpOnly, SameSite set, ~180 d) and ONE CrmWebSession (consentVersion ${CV} · consentAt · ipHash) + ONE CONSENT event · the banner is gone`,
      how !== "not-found" && ok && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vidA) &&
        !!vc && vc.secure === true && vc.httpOnly === false && !!vc.sameSite && maxAgeOk(vc) &&
        !!cc && cc.secure === true && cc.httpOnly === false && rows.s.length === 1 && s.consentVersion === CV && !!s.consentAt &&
        typeof s.ipHash === "string" && s.ipHash.length >= 32 && consentEv === 1 && !after.root,
      "cookies + 1 session + 1 CONSENT", `click=${how} vid=${cut(vidA, 20)} cookies=${j(cs.map((c) => ({ n: c.name, s: c.secure, h: c.httpOnly, ss: c.sameSite, exp: Math.round((Number(c.expires) * 1000 - Date.now()) / DAY) })))} sessions=${rows.s.length} cv=${s.consentVersion} consentEv=${consentEv} bannerBack=${after.root}`);
  }
  {
    const p1 = await openPage(c0);
    await go(p1, `${OR_A}/courses?utm_source=facebook&utm_medium=cpc&utm_campaign=q4&email=${encodeURIComponent(pii(`${TAG}-leak@qc-crm.example`))}#frag`);
    await go(p1, `${OR_A}/team?utm_source=facebook`);
    await go(p1, `${OR_A}/contact`);
    await waitForPosts("/t/e", 3, 15_000);
    await sleep(900);
    const rows = await rowsOf(tidA, vidA);
    const s: Any = rows.s[0] ?? {};
    const urls = rows.e.filter((e) => e.kind === "PAGEVIEW").map((e) => String(e.url ?? ""));
    const first = urls.find((u) => u.includes("/courses")) ?? "";
    const utm = s.utm ?? {};
    const b2 = await bannerSeen(p1);
    chk("C2.6W-S3.4", "three real page loads on the consented visitor ⇒ pageViews 3 + 3 PAGEVIEW rows · urls keep only utm_* (the e-mail in the query and the #fragment are dropped) · utm { facebook, cpc, q4 } · the banner does NOT come back after a reload",
      rows.pv === 3 && Number(s.pageViews) === 3 && first !== "" && /utm_source=facebook/.test(first) && !/email=|%40|@|#frag/.test(first) &&
        utm.source === "facebook" && utm.medium === "cpc" && utm.campaign === "q4" && !b2.root,
      "3 page views · clean urls", `pv=${rows.pv}/${s.pageViews} first=${cut(first, 120)} utm=${j(utm)} bannerBack=${b2.root}`);
    await p1.close().catch(() => null);
  }
  {
    const cd = await newCtx();
    const pd = await openPage(cd);
    await go(pd, `${OR_A}/`);
    const how = await clickBanner(pd, "decline");
    await waitForPosts("/t/consent", 2, 12_000);
    await sleep(900);
    await sd(pd, "page");
    await sleep(1200);
    const cs = await cookiesOf(pd, OR_A);
    const before = (await allSessions(tidA)).length;
    const vidD = String(cookieNamed(cs, VISITOR_COOKIE)?.value ?? "");
    const rows = vidD ? await rowsOf(tidA, vidD) : { s: [], e: [], pv: 0, pageViews: 0 };
    chk("C2.6W-S3.5", `clicking ปฏิเสธ leaves EXACTLY ONE cookie on ${DOM_A} — the consent cookie, never a visitor id — and writes ZERO rows; a later sd('page') still writes nothing`,
      how !== "not-found" && cs.length === 1 && cs[0]?.name === CONSENT_COOKIE && !vidD && rows.s.length === 0,
      `1 cookie (${CONSENT_COOKIE}) · 0 rows`, `click=${how} cookies=${cs.map((c) => c.name).join(",") || "-"} sessionsOfShop=${before} sessionsOfVisitor=${rows.s.length}`);
  }
  {
    const pv0 = (await rowsOf(tidA, vidA)).pv;
    await sd(p0, "revoke");
    await waitForPosts("/t/consent", 3, 12_000);
    await sleep(900);
    const p2 = await openPage(c0);
    await go(p2, `${OR_A}/courses`);
    await sleep(1200);
    const rows = await rowsOf(tidA, vidA);
    chk("C2.6W-S3.6", "sd('revoke') from the page: consentVersion becomes null on every session of that visitor and later real page loads add NOTHING (positive control: the page views before the revoke were counted)",
      pv0 >= 3 && rows.pv === pv0 && rows.s.length > 0 && rows.s.every((s) => s.consentVersion === null),
      "stops collecting", `pv ${pv0}→${rows.pv} cv=${rows.s.map((s) => String(s.consentVersion)).join(",") || "-"}`);
    await p2.close().catch(() => null);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — tracked links in a real browser (browser half of CRM-RUN S1)
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S1 · /l/<code> in a real browser ──");
  const linkRow = async (id: string) => { try { return (await P.crmTrackedLink?.findFirst?.({ where: { id } })) ?? null; } catch { return null; } };
  {
    const cl = await newCtx();
    const pl = await openPage(cl);
    const code = String(LINK.code ?? `${TAG}-missing`);
    await go(pl, `https://shark.in.th/l/${code}`);
    const finalUrl = String(pl.url());
    const row: Any = LINK.id ? await linkRow(LINK.id) : null;
    const clicks = LINK.id ? (await safeMany("crmTrackedClick", { where: { linkId: LINK.id } })).length : -1;
    const su = cookieNamed(await cookiesOf(pl, `https://shark.in.th/l/${code}`), "sd_u");
    chk("C2.6W-S1.1", "a real navigation to /l/<code> lands the BROWSER on the stored url (byte-exact, query included) · ONE click row · clicks 1 · uniqueClicks 1 · the sd_u cookie is in the jar with HttpOnly + Secure + Path=/l/<code>",
      finalUrl === LINK_URL && Number(row?.clicks) === 1 && Number(row?.uniqueClicks) === 1 && clicks === 1 &&
        !!su && su.httpOnly === true && su.secure === true && String(su.path) === `/l/${code}`,
      "stored url + counted once", `final=${cut(finalUrl, 120)} row=${row?.clicks}/${row?.uniqueClicks} clickRows=${clicks} sd_u=${su ? j({ h: su.httpOnly, s: su.secure, p: su.path }) : "absent"}`);
    // same browser again (cookie present) vs a FRESH profile (no cookie) — the unique-click rule, proven by two real cookie jars
    await go(pl, `https://shark.in.th/l/${code}`);
    const row2: Any = LINK.id ? await linkRow(LINK.id) : null;
    const cl2 = await newCtx();
    const pl2 = await openPage(cl2);
    await go(pl2, `https://shark.in.th/l/${code}`);
    const row3: Any = LINK.id ? await linkRow(LINK.id) : null;
    chk("C2.6W-S1.2", "second visit from the SAME browser ⇒ clicks 2, uniqueClicks stays 1 · a fresh browser context (empty jar) ⇒ clicks 3, uniqueClicks 2 (positive control for the cookie rule)",
      Number(row2?.clicks) === 2 && Number(row2?.uniqueClicks) === 1 && Number(row3?.clicks) === 3 && Number(row3?.uniqueClicks) === 2,
      "2/1 then 3/2", `same=${row2?.clicks}/${row2?.uniqueClicks} fresh=${row3?.clicks}/${row3?.uniqueClicks}`);
    // [negative control of the bot rule] the SAME link opened by a HeadlessChrome UA: still redirects, counts NOTHING.
    //   This is why every other page of this exam presents a realistic desktop UA — without this control a UA bug in the harness
    //   would make S1.1/S1.2 unprovable (they went red exactly that way on the first run, 24 ก.ย.).
    const cb = await newCtx();
    const pb = await openPage(cb, BOT_UA);
    await go(pb, `https://shark.in.th/l/${code}`);
    const rowB: Any = LINK.id ? await linkRow(LINK.id) : null;
    const clicksB = LINK.id ? (await safeMany("crmTrackedClick", { where: { linkId: LINK.id } })).length : -1;
    chk("C2.6W-S1.3", "[negative control] the same /l/<code> opened with a HeadlessChrome user agent still lands the browser on the stored url but counts NOTHING (C2.5's one bot filter, judged from a real browser) — and the UA this exam uses everywhere else is NOT a bot",
      String(pb.url()) === LINK_URL && Number(rowB?.clicks) === 3 && Number(rowB?.uniqueClicks) === 2 && clicksB === 3 &&
        isBotUa(BOT_UA) && !isBotUa(DESKTOP_UA),
      "redirects · clicks stay 3/2", `final=${cut(String(pb.url()), 90)} row=${rowB?.clicks}/${rowB?.uniqueClicks} clickRows=${clicksB} botUa=${isBotUa(BOT_UA)} desktopUaIsBot=${isBotUa(DESKTOP_UA)} ua=${cut(DESKTOP_UA, 70)}`);
    await pb.close().catch(() => null);
    // X6 — the redirect target can never be influenced by the request
    await go(pl2, `https://shark.in.th/l/${code}?url=https://evil-${rand}.test/&next=https://evil-${rand}.test/&u=/etc/passwd`);
    chk("C2.6W-X6.1", "X6 open redirect, judged by the browser's final URL: /l/<code>?url=&next=&u= still ends on the STORED url",
      String(pl2.url()) === LINK_URL, "stored url", cut(String(pl2.url()), 140));
    await pl.close().catch(() => null);
    await pl2.close().catch(() => null);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — identify from a real e-mail landing (browser half)
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S4 · identify in a real browser ──");
  {
    const tRes = await call(TR.emailClickTicket, { tenantId: tidA, systemId: crmA, emailId: `${TAG}-mail`, contactId: contact.id }, new Date());
    const ticket = String(tRes.v ?? "");
    const ci = await newCtx();
    const pi = await openPage(ci);
    await go(pi, `${OR_A}/`);
    await clickBanner(pi, "accept");
    await sleep(1200);
    const vidI = await vidOf(pi, OR_A);
    await go(pi, `${OR_A}/landing?sd_ct=${encodeURIComponent(ticket)}`);
    await sleep(1500);
    let auto = true;
    let bound = await sessionsOf(tidA, vidI || "none");
    if (!bound.some((s) => s.contactId === contact.id)) {
      auto = false;
      await sd(pi, "identify");
      await sleep(1500);
      bound = await sessionsOf(tidA, vidI || "none");
    }
    const acts = await safeMany("crmActivity", { where: { contactId: contact.id, type: "WEB" } });
    const evts = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.web.identified" } })) as Any[]).filter((e) => j(e.payload).includes(contact.id));
    chk("C2.6W-S4.1", "a real landing on ?sd_ct=<ticket> binds the visitor's sessions to the e-mail's contact (identifiedBy EMAIL_CLICK) + ONE WEB activity of this Thai day + ONE crm.web.identified — the page never sends an address, only the opaque ticket",
      !!ticket && bound.length > 0 && bound.every((s) => s.contactId === contact.id && s.identifiedBy === "EMAIL_CLICK") && acts.length === 1 &&
        String(acts[0]?.sourceRef ?? "").includes(thaiYmd(new Date())) && evts.length === 1 &&
        !postsTo("/t/e").some((r) => r.body.includes(cMail) || r.body.includes(contact.id)),
      "bound once + 1 activity + 1 event", `ticket=${ticket ? "minted" : rd(tRes)} autoPickup=${auto} sessions=${bound.map((s) => `${s.contactId === contact.id ? "bound" : String(s.contactId)}:${s.identifiedBy}`).join(",") || "-"} acts=${acts.length} events=${evts.length}`,
      auto ? "CRITICAL" : "MAJOR");
    // X4 — (a) the same landing AGAIN with the same ticket · (b) a DIFFERENT visitor replaying that already-burnt ticket ·
    //      (c) two independent browsers identifying in PARALLEL, each carrying its OWN fresh ticket.
    // 🔴 ORACLE-EDIT (25 ก.ย. · ผู้คุมงาน "ruling round 2", S2): an identify ticket now carries a `jti` that is BURNT on first use
    //    (TTL 15 นาที · `consumeIdentifyTicket`) — "one ticket ⇒ ONE binding" is the ruled behaviour, so the extra visitors of X4
    //    must carry tickets of their own (in production each of them clicked a link in their own e-mail). The replay of a used
    //    ticket is not assumed to be harmless: it is asserted to bind NOTHING, which puts the round-2 fix itself under test.
    await go(pi, `${OR_A}/landing?sd_ct=${encodeURIComponent(ticket)}`);       // (a) same visitor, same (burnt) ticket
    await sleep(1200);
    const cr = await newCtx();                                                 // (b) another visitor replaying the burnt ticket
    const pr = await openPage(cr);
    await go(pr, `${OR_A}/`);
    await clickBanner(pr, "accept");
    await sleep(1000);
    const vidR = await vidOf(pr, OR_A);
    await go(pr, `${OR_A}/landing?sd_ct=${encodeURIComponent(ticket)}`);
    await sd(pr, "identify");
    await sleep(1500);
    const replaySessions = await sessionsOf(tidA, vidR || "none");
    const replayBound = replaySessions.some((s) => s.contactId === contact.id);
    const par = await Promise.all([newCtx(), newCtx()]);                        // (c) two browsers · one FRESH ticket each · parallel
    const pps = await Promise.all(par.map((c) => openPage(c)));
    const freshTickets = await Promise.all(pps.map((_p, i) =>
      call(TR.emailClickTicket, { tenantId: tidA, systemId: crmA, emailId: `${TAG}-mail-p${i}`, contactId: contact.id }, new Date())));
    await Promise.all(pps.map(async (pp, i) => {
      await go(pp, `${OR_A}/`);
      await clickBanner(pp, "accept");
      await sleep(900);
      await go(pp, `${OR_A}/landing?sd_ct=${encodeURIComponent(String(freshTickets[i]?.v ?? ""))}`);
      await sd(pp, "identify");
    }));
    await sleep(2500);
    const acts2 = await safeMany("crmActivity", { where: { contactId: contact.id, type: "WEB" } });
    const evts2 = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.web.identified" } })) as Any[]).filter((e) => j(e.payload).includes(contact.id));
    const boundSessions = (await safeMany("crmWebSession", { where: { tenantId: tidA, contactId: contact.id } })).length;
    chk("C2.6W-X4.1", "X4 identify twice in a row and twice in PARALLEL from two independent browsers (each with its own ticket) ⇒ still ONE WEB activity for this Thai day and ONE crm.web.identified · every one of those visitors' sessions is bound · and a visitor replaying an ALREADY-USED ticket binds nothing (single-use jti · ruling round 2 S2)",
      acts2.length === 1 && evts2.length === 1 && boundSessions >= 3 && replayBound === false && replaySessions.length >= 1,
      "1 activity · 1 event · 3 bound visitors · replay binds 0",
      `acts=${acts2.length} events=${evts2.length} boundSessions=${boundSessions} replayVisitorSessions=${replaySessions.length} replayBound=${replayBound} freshTickets=${freshTickets.map((t) => (t.v ? "minted" : rd(t))).join(",")}`);
    await pi.close().catch(() => null);
    await pr.close().catch(() => null);
    for (const pp of pps) await pp.close().catch(() => null);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 / X7 — allowed domains and CORS as enforced by chromium · payload cap · flood
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S7 / X7 · domains · CORS · caps (browser side) ──");
  {
    const cf = await newCtx();
    const pf = await openPage(cf);
    await go(pf, `${OR_B}/`); // shop A's siteKey served on a domain shop A never allowed
    const how = await clickBanner(pf, "accept");
    await sleep(1200);
    await sd(pf, "page");
    await sleep(1500);
    const csB = await cookiesOf(pf, OR_B);
    const vidB = String(cookieNamed(csB, VISITOR_COOKIE)?.value ?? "");
    const rowsB = vidB ? await rowsOf(tidA, vidB) : { s: [], e: [], pv: 0, pageViews: 0 };
    const answers = LOG.filter((r) => r.origin === OR_B && (r.path === "/t/e" || r.path === "/t/consent"));
    // positive control: the SAME script on the allowed domain did write (S3.3/S3.4) — referenced in the evidence
    chk("C2.6W-S7.1", `shop A's tracker running on ${DOM_B} (not in A's allowed domains): every answer is 204 with an empty body and ZERO rows land for that visitor — positive control: the identical tracker on ${DOM_A} wrote a session in C2.6W-S3.3`,
      rowsB.s.length === 0 && (answers.length === 0 || answers.every((r) => r.status === 204 || r.status === 403)),
      "0 rows", `banner=${how} requests=${answers.map((r) => `${r.path}:${r.status}`).join(",") || "none-left-browser"} sessions=${rowsB.s.length}`);
    const corsProbe = await pf.evaluate(async (base: string, key: string) => {
      const body = JSON.stringify({ k: key, v: "00000000-0000-4000-8000-000000000000", cv: 1, t: "page", u: `${location.origin}/x` });
      try {
        const r = await fetch(`${base}/t/e`, { method: "POST", body, headers: { "content-type": "text/plain;charset=UTF-8" } });
        return `status ${r.status} acao ${r.headers.get("access-control-allow-origin") ?? "-"}`;
      } catch (e) { return `blocked ${String(e).slice(0, 80)}`; }
    }, SCRIPT_ORIGIN, SITE[crmA]).catch((e: unknown) => `eval ${String(e)}`);
    const acaoForeign = LOG.filter((r) => r.origin === OR_B && r.path === "/t/e").slice(-1)[0];
    chk("C2.6W-X7.1", "CORS is decided by the browser: a fetch to /t/e from a NON-allowed origin is blocked or answered without Access-Control-Allow-Origin, and writes nothing",
      /blocked/.test(String(corsProbe)) || /acao -/.test(String(corsProbe)), "blocked / no ACAO",
      `probe=${cut(corsProbe, 120)} lastForeignAnswer=${acaoForeign ? acaoForeign.status : "-"}`);
    await pf.close().catch(() => null);
  }
  {
    // oversize vs near-cap, both from the allowed page through the real browser
    const cz = await newCtx();
    const pz = await openPage(cz);
    await go(pz, `${OR_A}/`);
    await clickBanner(pz, "accept");
    await sleep(1200);
    const vidZ = await vidOf(pz, OR_A);
    const probe = await pz.evaluate(async (base: string, key: string, v: string, cv: number, big: number, near: number) => {
      const mk = (n: number) => JSON.stringify({ k: key, v, cv, t: "page", u: `${location.origin}/big`, ti: "x".repeat(Math.max(1, n)) });
      const send = async (raw: string) => {
        try { const r = await fetch(`${base}/t/e`, { method: "POST", body: raw, headers: { "content-type": "text/plain;charset=UTF-8" } }); return `${r.status}:${(await r.text()).length}`; } catch (e) { return `blocked:${String(e).slice(0, 40)}`; }
      };
      return { over: await send(mk(big)), near: await send(mk(near)) };
    }, SCRIPT_ORIGIN, SITE[crmA], vidZ, CV, MAXB * 2, 200).catch((e: unknown) => ({ over: `eval ${String(e)}`, near: "" }));
    await sleep(1200);
    const rows = await rowsOf(tidA, vidZ);
    const bigStored = rows.e.some((e) => String(e.title ?? "").length > MAXB);
    chk("C2.6W-X7.2", `payload cap seen from the browser: a ${MAXB * 2} B body is refused (413/204, nothing stored) while a small body from the same page IS stored (positive control)`,
      !bigStored && rows.pv >= 1 && /^(413|204|400|blocked)/.test(String((probe as Any).over)), "refused + control stored",
      `over=${cut((probe as Any).over, 40)} near=${cut((probe as Any).near, 40)} pageViews=${rows.pv} oversizeStored=${bigStored}`);
    // flood from ONE ip (sticky) — the DB limiter must cap the rows, every answer identical
    STICKY_IP = "10.99.77.5";
    const n = Math.min(PER_IP + 6, 80);
    const before = rows.pv;
    const flood = await pz.evaluate(async (base: string, key: string, v: string, cv: number, count: number) => {
      const one = (i: number) => fetch(`${base}/t/e`, {
        method: "POST", headers: { "content-type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ k: key, v, cv, t: "page", u: `${location.origin}/flood?i=${i}` }),
      }).then((r) => `${r.status}`).catch(() => "blocked");
      return Promise.all(Array.from({ length: count }, (_x, i) => one(i)));
    }, SCRIPT_ORIGIN, SITE[crmA], vidZ, CV, n).catch(() => [] as string[]);
    await sleep(1800);
    STICKY_IP = null;
    const rowsF = await rowsOf(tidA, vidZ);
    const added = rowsF.pv - before;
    const uniq = Array.from(new Set(flood as string[]));
    chk("C2.6W-X7.3", `flood of ${n} parallel /t/e posts from ONE browser and ONE ip: every answer is the same status and the DB limiter caps what is stored at collectPerIp.limit (${PER_IP})`,
      (flood as string[]).length === n && uniq.length === 1 && added <= PER_IP && added >= 1, `${n} identical answers · ≤ ${PER_IP} stored`,
      `answers=${uniq.join(",") || "-"} stored=${added}`);
    await pz.close().catch(() => null);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — real browser concurrency (separate contexts = separate connections), two rounds
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X3 · parallel page views from real browsers ──");
  {
    const cx = await newCtx();
    const px = await openPage(cx);
    await go(px, `${OR_A}/`);
    await clickBanner(px, "accept");
    await sleep(1200);
    const vidX = await vidOf(px, OR_A);
    const burst = async (pg: Any, count: number, tagn: string) => pg.evaluate(async (base: string, key: string, v: string, cv: number, n: number, t: string) => {
      const one = (i: number) => fetch(`${base}/t/e`, {
        method: "POST", headers: { "content-type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ k: key, v, cv, t: "page", u: `${location.origin}/x3?r=${t}-${i}` }),
      }).then((r) => r.status).catch(() => -1);
      return Promise.all(Array.from({ length: n }, (_x, i) => one(i)));
    }, SCRIPT_ORIGIN, SITE[crmA], vidX, CV, count, tagn);
    const c2 = await newCtx();
    const px2 = await openPage(c2);
    await go(px2, `${OR_A}/`);
    // the second browser posts for the SAME visitor id (a shared device / two tabs) — cookie injected through CDP
    {
      const cdp = await px2.createCDPSession();
      await cdp.send("Network.setCookie", { name: VISITOR_COOKIE, value: vidX, domain: DOM_A, path: "/", secure: true }).catch(() => null);
      await cdp.detach().catch(() => null);
    }
    const before = (await rowsOf(tidA, vidX)).pv;
    for (const round of ["r1", "r2"]) {
      const res = await Promise.all([burst(px, 12, round), burst(px2, 12, round)]);
      void res;
      await sleep(1500);
    }
    await sleep(1500);
    const after = await rowsOf(tidA, vidX);
    const added = after.pv - before;
    const sumPv = after.s.reduce((n2, s) => n2 + Number(s.pageViews ?? 0), 0);
    chk("C2.6W-X3.1", "2 browser contexts × 12 parallel posts × 2 rounds for ONE visitor ⇒ exactly 48 PAGEVIEW rows and Σ session.pageViews matches the rows (atomic increments, no lost update across real connections)",
      added === 48 && sumPv === after.pv, "48 · Σ = rows", `added=${added} rows=${after.pv} ΣpageViews=${sumPv} sessions=${after.s.length}`);
    await px.close().catch(() => null);
    await px2.close().catch(() => null);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — the script must never read what the customer types · cookie hygiene · no raw ip
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X8 · PDPA in the browser ──");
  {
    const SECRET_MAIL = pii(`${TAG}-typed@qc-crm.example`);
    const SECRET_PHONE = pii("0899999123");
    const cy = await newCtx();
    const py = await openPage(cy);
    await go(py, `${OR_A}/contact`);
    await clickBanner(py, "accept");
    await sleep(1200);
    const vidY = await vidOf(py, OR_A);
    await py.click("#qcemail");
    await py.keyboard.type(SECRET_MAIL, { delay: 12 });
    await py.click("#qcphone");
    await py.keyboard.type(SECRET_PHONE, { delay: 12 });
    await py.click("#qcsend").catch(() => null);
    await sd(py, "page");
    await sd(py, "event", "submit");
    await sleep(1800);
    const bodies = LOG.filter((r) => r.method === "POST" && /^\/t\//.test(r.path)).map((r) => r.body).join("\n");
    const rows = await rowsOf(tidA, vidY);
    const blob = j({ s: rows.s, e: rows.e });
    chk("C2.6W-X8.1", "the tracker never collects form values: an e-mail and a phone typed into a form on the page appear in NO request body the browser sent to /t/* and in NO session/event row (proven on real keystrokes, not on a regex over the source)",
      !bodies.includes(SECRET_MAIL) && !bodies.includes(SECRET_PHONE) && !blob.includes(SECRET_MAIL) && !blob.includes(SECRET_PHONE) && rows.pv >= 1,
      "never sent, never stored", `inBodies=${bodies.includes(SECRET_MAIL) || bodies.includes(SECRET_PHONE)} inRows=${blob.includes(SECRET_MAIL) || blob.includes(SECRET_PHONE)} pageViews=${rows.pv}`);
    STICKY_IP = "10.99.77.9";
    const cz2 = await newCtx();
    const pz2 = await openPage(cz2);
    await go(pz2, `${OR_A}/`);
    await clickBanner(pz2, "accept");
    await sleep(1400);
    const vidS = await vidOf(pz2, OR_A);
    const sRow: Any = (await sessionsOf(tidA, vidS || "none"))[0] ?? {};
    const expHash = typeof TR.ipHashFor === "function" ? String(TR.ipHashFor(STICKY_IP, new Date())) : "";
    const ipUsed = String(STICKY_IP);
    STICKY_IP = null;
    const everything = j(await allSessions(tidA)) + j(await safeMany("crmWebEvent", { where: { tenantId: tidA } })) + j(await safeMany("crmTrackedClick", { where: { tenantId: tidA } }));
    chk("C2.6W-X8.2", "no raw client ip anywhere: the session written for a known client ip stores ipHashFor(ip) (never the ip, never sha256(ip)) and no row of this run contains the address",
      !!sRow.ipHash && (!expHash || sRow.ipHash === expHash) && sRow.ipHash !== sha(ipUsed) && !everything.includes(ipUsed),
      "ipHash only", `ipHash=${cut(sRow.ipHash, 16)} expected=${cut(expHash, 16)} rawFound=${everything.includes(ipUsed)}`);
    await py.close().catch(() => null);
    await pz2.close().catch(() => null);
  }
  {
    // X6 · the hostile consent text is baked into a <script> body and printed into a real DOM
    const b = await bannerSeen(p0);
    chk("C2.6W-X6.2", "consent text containing `</script>`, quotes, U+2028 and an onerror payload: the tracker still parses and runs in the browser, the text is shown as TEXT and no <img onerror> ever executes",
      b.pwn === false && Number(b.imgs) === 0 && c0.errors.length === 0, "no injection, no page error",
      `pwned=${b.pwn} imgs=${b.imgs} pageErrors=${cut(c0.errors.join("|"), 100) || "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — one visitor id, two shops: never the same session, never a cross-shop binding
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X1 · scope in the browser ──");
  {
    const cq = await newCtx();
    const pq = await openPage(cq);
    await go(pq, `${OR_B}/own`);
    await clickBanner(pq, "accept");
    await sleep(1200);
    const vidOwn = String(cookieNamed(await cookiesOf(pq, OR_B), VISITOR_COOKIE)?.value ?? "");
    // force shop A's visitor id onto shop B's site (shared device / copied cookie)
    {
      const cdp = await pq.createCDPSession();
      await cdp.send("Network.setCookie", { name: VISITOR_COOKIE, value: vidA, domain: DOM_B, path: "/", secure: true }).catch(() => null);
      await cdp.detach().catch(() => null);
    }
    await go(pq, `${OR_B}/own`);
    await sd(pq, "page");
    await sleep(1600);
    const inB = await sessionsOf(tidB, vidA);
    const inA = await sessionsOf(tidA, vidA);
    chk("C2.6W-X1.1", "the SAME visitor id used on two different shops ⇒ two separate session sets (one per tenant/system) · shop B never sees shop A's contact binding · shop B's own visitor still collects (positive control)",
      inA.length > 0 && inB.every((s) => s.tenantId === tidB && s.systemId === crmB && s.contactId === null) && !!vidOwn,
      "separate sessions, no leak", `A=${inA.length} B=${inB.length} bContacts=${inB.map((s) => String(s.contactId)).join(",") || "-"} ownVisitor=${vidOwn ? "ok" : "none"}`);
    await pq.close().catch(() => null);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — the public form page in a real browser (browser half of CRM-RUN S6 + C24)
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S6 · /f/<token> in a real browser ──");
  const subsOf = async () => (await safeMany("formSubmission", { where: { formId: form.id }, orderBy: { createdAt: "asc" } }));
  {
    const cff = await newCtx();
    const pff = await openPage(cff);
    const r = await go(pff, FORM_URL_APP);
    const field = await pff.evaluate((hp: string) => {
      const el = document.querySelector(`[name="${hp}"]`) as HTMLElement | null;
      if (!el) return { present: false, hidden: false, tab: false, ac: false };
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const hidden = cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0" || (box.width === 0 && box.height === 0) ||
        box.right < -100 || box.bottom < -100 || (el as HTMLInputElement).type === "hidden";
      return { present: true, hidden, tab: el.getAttribute("tabindex") === "-1" || hidden, ac: (el.getAttribute("autocomplete") ?? "").toLowerCase() !== "on" };
    }, HP).catch(() => ({ present: false, hidden: false, tab: false, ac: false }));
    const startTok = await pff.evaluate(() => Array.from(document.querySelectorAll("input[type=hidden]")).map((i) => (i as HTMLInputElement).name).join(",")).catch(() => "");
    // a correct submit AFTER the minimum fill time — the positive control for both refusal checks below
    await sleep((MIN_SEC + 1.5) * 1000);
    const goodName = pii(`คุณฟอร์มเบราว์เซอร์ ${TAG}`);
    await pff.evaluate((n: string, m: string) => {
      const set = (sel: string, v: string) => { const el = document.querySelector(sel) as HTMLInputElement | null; if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); } };
      set('[name="name"]', n);
      set('[name="email"]', m);
    }, goodName, pii(`${TAG}-formok@qc-crm.example`)).catch(() => null);
    await pff.evaluate(() => (document.querySelector("form button[type=submit], form [type=submit], form button") as HTMLElement | null)?.click()).catch(() => null);
    await sleep(2500);
    const subs = await subsOf();
    chk("C2.6W-S6.1", `the real /f/<token> page carries an INVISIBLE honeypot (${HP}: hidden by computed style, out of the tab order, autocomplete off) and a hidden start token · a correct submit after ${MIN_SEC}s writes exactly ONE FormSubmission (positive control for S6.2/S6.3)`,
      (r as Any)?.status?.() === 200 && field.present && field.hidden && field.tab && field.ac && /st|start/i.test(startTok) && subs.length === 1,
      "invisible honeypot + 1 row", `status=${(r as Any)?.status?.() ?? "-"} field=${j(field)} hidden=${startTok || "-"} rows=${subs.length}`);
    await pff.close().catch(() => null);
  }
  {
    const cff = await newCtx();
    const pff = await openPage(cff);
    await go(pff, FORM_URL_APP);
    const dialogs: string[] = [];
    pff.on("dialog", async (d: Any) => { dialogs.push(String(d.message())); await d.dismiss().catch(() => null); });
    await pff.evaluate((n: string) => {
      const el = document.querySelector('[name="name"]') as HTMLInputElement | null;
      if (el) { el.value = n; el.dispatchEvent(new Event("input", { bubbles: true })); }
      (document.querySelector("form button[type=submit], form [type=submit], form button") as HTMLElement | null)?.click();
    }, pii(`คุณเร็วเกิน ${TAG}`)).catch(() => null);
    await sleep(2500);
    const subs = await subsOf();
    const inline = await pff.evaluate(() => {
      const txt = document.body?.innerText ?? "";
      const thaiErr = /(เร็วเกินไป|ลองอีกครั้ง|ไม่สำเร็จ|รอสักครู่|กรอกอีกครั้ง)/.test(txt);
      return { thaiErr, len: txt.length };
    }).catch(() => ({ thaiErr: false, len: 0 }));
    chk("C2.6W-S6.2", `submitting faster than the minimum fill time (${MIN_SEC}s) is refused INLINE in Thai (never alert(), never a blank page) and writes NOTHING (still 1 row — the one from S6.1)`,
      subs.length === 1 && dialogs.length === 0 && inline.thaiErr, "inline Thai refusal · no new row",
      `rows=${subs.length} dialogs=${dialogs.length} inlineThai=${inline.thaiErr} bodyLen=${inline.len}`);
    await pff.close().catch(() => null);
  }
  {
    const cff = await newCtx();
    const pff = await openPage(cff);
    await go(pff, FORM_URL_APP);
    await sleep((MIN_SEC + 1.5) * 1000);
    const HONEY = `bot-${rand}`;
    const shown = await pff.evaluate((hp: string, n: string, honey: string) => {
      const set = (sel: string, v: string) => { const el = document.querySelector(sel) as HTMLInputElement | null; if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); } };
      set('[name="name"]', n);
      set(`[name="${hp}"]`, honey);
      (document.querySelector("form button[type=submit], form [type=submit], form button") as HTMLElement | null)?.click();
      return true;
    }, HP, pii(`บอท ${TAG}`), HONEY).catch(() => false);
    await sleep(2500);
    const subs = await subsOf();
    const blob = j(subs);
    const success = await pff.evaluate(() => /(ขอบคุณ|ส่งแล้ว|เรียบร้อย|สำเร็จ)/.test(document.body?.innerText ?? "")).catch(() => false);
    chk("C2.6W-S6.3", "a bot that fills the honeypot sees SUCCESS on screen but nothing is written (still 1 row, no answer of this run contains the honeypot value) — the guard never tells the bot it was caught",
      shown && subs.length === 1 && !blob.includes(HONEY) && success, "fake success · 0 new rows",
      `rows=${subs.length} honeyStored=${blob.includes(HONEY)} successShown=${success}`);
    // double submit, fast — one row (X3 at the browser level)
    const cdd = await newCtx();
    const pdd = await openPage(cdd);
    await go(pdd, FORM_URL_APP);
    await sleep((MIN_SEC + 1.5) * 1000);
    await pdd.evaluate((n: string) => {
      const el = document.querySelector('[name="name"]') as HTMLInputElement | null;
      if (el) { el.value = n; el.dispatchEvent(new Event("input", { bubbles: true })); }
      const btn = document.querySelector("form button[type=submit], form [type=submit], form button") as HTMLElement | null;
      btn?.click();
      btn?.click();
    }, pii(`คุณกดสองที ${TAG}`)).catch(() => null);
    await sleep(3000);
    const subs2 = await subsOf();
    chk("C2.6W-S6.4", "clicking ส่ง twice in the same tick writes exactly ONE submission (2 rows in total for this form: S6.1 and this one)",
      subs2.length === 2, "2 rows total", `rows=${subs2.length}`);
    await pff.close().catch(() => null);
    await pdd.close().catch(() => null);
  }
  {
    // W7 — /f/* may be framed, /app/* may not (enforced by chromium, not by a header regex)
    const ce = await newCtx();
    const pe = await openPage(ce);
    await go(pe, `${OR_A}/embed`);
    await sleep(2500);
    const frames = pe.frames().map((f: Any) => String(f.url()));
    const formFrame = pe.frames().find((f: Any) => String(f.url()).includes(`/f/${form.publicToken}`));
    const inputs = formFrame ? await formFrame.evaluate(() => document.querySelectorAll("input").length).catch(() => -1) : -1;
    // 🔴 ORACLE-EDIT (25 ก.ย.): the verdict is chromium's OUTCOME, not a console string. A cross-origin iframe is an
    //   out-of-process frame, so its "Refused to display … X-Frame-Options" entry is logged on the IFRAME's own target session and
    //   never reaches `page.on("console")` of the embedding page (`refusals` came back empty on the first real run while the frame
    //   was in fact refused). What the browser DOES show is unambiguous: the refused frame ends on `chrome-error://chromewebdata/`
    //   and never renders `/app` (or the `/login` it redirects to), while the `/f/<token>` frame renders its inputs.
    //   The response headers the front door saw name the REASON (evidence only — the pass/fail is the browser's).
    const frameUrls: string[] = (frames as string[]).map((u) => String(u));
    const appRendered = frameUrls.some((u) => /shark\.in\.th\/(app|login)/.test(u));
    const appErrored = frameUrls.some((u) => /^chrome-error:/i.test(u));
    const xfoOfLast = (re: RegExp) => { const r = LOG.filter((x) => re.test(x.path) && x.method === "GET").slice(-1)[0]; return r ? `${r.path}:${r.status}:${r.xfo || "none"}` : "-"; };
    const xfoForm = LOG.filter((r) => r.path === `/f/${form.publicToken}`).slice(-1)[0]?.xfo ?? "";
    const xfoApp = LOG.filter((r) => /^\/(app|login)(\/|$)/.test(r.path)).map((r) => r.xfo).filter(Boolean);
    const refusals = ce.console.filter((l) => /Refused to display|X-Frame-Options|frame-ancestors/i.test(l));
    chk("C2.6W-S6.5", "the embed really works in a browser: an iframe of /f/<token> renders its inputs (the proxy stops sending X-Frame-Options DENY for /f/* only) while an iframe of /app is still REFUSED by chromium — it never renders and lands on an error page (positive/negative pair from the same page)",
      Number(inputs) > 0 && !/DENY|SAMEORIGIN/i.test(xfoForm) && !appRendered && appErrored && xfoApp.some((v) => /DENY/i.test(v)),
      "form framed (no XFO) · /app refused (XFO DENY · error frame)",
      `frames=${cut(frames.join(" | "), 160)} inputsInFrame=${inputs} appRendered=${appRendered} appErrorFrame=${appErrored} xfoForm=${xfoForm || "none"} xfoApp=${xfoApp.join(",") || "-"} lastApp=${xfoOfLast(/^\/(app|login)(\/|$)/)} consoleRefusals=${cut(refusals.join(" | "), 100) || "- (out-of-process frame: not delivered to the embedder)"}`);
    await pe.close().catch(() => null);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U — PERMANENT RULE: a shop still on uiVersion 1 (every real shop today) + the v2 positive control
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── U · uiVersion 1 in a real browser ──");
  {
    const cv1 = await newCtx();
    const pv1 = await openPage(cv1);
    const r = await go(pv1, `${OR_V}/`);
    await sleep(1200);
    const b = await bannerSeen(pv1);
    const cs = await cookiesOf(pv1, OR_V);
    const sdKind = await pv1.evaluate(() => typeof (window as Any).sd).catch(() => "?");
    await sd(pv1, "page");
    await sleep(1500);
    const rows = (await allSessions(tidV)).length;
    chk("C2.6W-U.1", "a shop on uiVersion 1 serves the no-op script: NO banner is rendered, NO cookie is written on its domain, and nothing is stored even when the page calls sd('page') — the v1 page is byte-identical for the customer",
      (r as Any)?.status?.() === 200 && !b.root && !b.text && cs.length === 0 && rows === 0 && cv1.errors.length === 0,
      "no banner · no cookie · 0 rows", `banner=${b.root}/${b.text} cookies=${cs.map((c) => c.name).join(",") || "-"} sd=${sdKind} sessions=${rows} pageErrors=${cut(cv1.errors.join("|"), 80) || "-"}`);
    // the printed QR link of a v1 shop must still work (addendum item 6) and must count nothing
    if (LINK_V_CODE) {
      const pv2 = await openPage(cv1);
      await go(pv2, `https://shark.in.th/l/${LINK_V_CODE}`);
      const row: Any = LINK_V_ID ? await linkRow(LINK_V_ID) : null;
      const clicks = LINK_V_ID ? (await safeMany("crmTrackedClick", { where: { linkId: LINK_V_ID } })).length : -1;
      chk("C2.6W-U.2", "a PRINTED tracked link of a uiVersion-1 shop still redirects the browser to its stored url, and counts nothing (clicks 0 · no click row)",
        String(pv2.url()) === `${OR_V}/print` && Number(row?.clicks ?? -1) === 0 && clicks === 0, "redirects · counts 0",
        `final=${cut(String(pv2.url()), 100)} clicks=${row?.clicks} clickRows=${clicks}`);
      await pv2.close().catch(() => null);
    } else {
      chk("C2.6W-U.2", "a PRINTED tracked link of a uiVersion-1 shop still redirects the browser to its stored url, and counts nothing", false, "a v1 link fixture", "could not create/seed CrmTrackedLink for the v1 shop");
    }
    // positive control: flip that same shop to uiVersion 2 ⇒ the banner appears and rows are written (the gate is read live, not cached)
    await setCrm(crmV, { uiVersion: 2 });
    const cv2 = await newCtx();
    const pv3 = await openPage(cv2);
    await go(pv3, `${OR_V}/`);
    await sleep(1200);
    const b2 = await bannerSeen(pv3);
    const how = await clickBanner(pv3, "accept");
    await sleep(1600);
    const cs2 = await cookiesOf(pv3, OR_V);
    const rows2 = (await allSessions(tidV)).length;
    await setCrm(crmV, { uiVersion: 1 });
    chk("C2.6W-U.3", "[positive control] the same shop switched to uiVersion 2 immediately serves the real tracker: the banner appears, ยอมรับ writes the cookies and ONE session — so U.1's silence is the gate, not a broken fixture",
      (b2.root || b2.text) && how !== "not-found" && cs2.length >= 1 && rows2 === 1, "banner + 1 session",
      `banner=${b2.root}/${b2.text} click=${how} cookies=${cs2.map((c) => c.name).join(",") || "-"} sessions=${rows2}`);
    await pv1.close().catch(() => null);
    await pv3.close().catch(() => null);
  }

  if (FIXTURE_NOTES.length) out(`  ℹ️  ${FIXTURE_NOTES.join(" · ")}`);
  out(`  ℹ️  proxy saw ${LOG.length} requests · /t/e ${postsTo("/t/e").length} · /t/consent ${postsTo("/t/consent").length} · script origin ${SCRIPT_ORIGIN}`);
  {
    const leaked = PII.filter((s) => s.length > 5 && LOG.some((r) => r.path.startsWith("/t/") && r.body.includes(s)));
    chk("C2.6W-X8.3", "no name, phone or e-mail of this run ever appears in a /t/* request body sent by the browser (the tracker carries ids, urls and the opaque ticket only)",
      leaked.length === 0, "no PII on the wire", leaked.length ? cut(leaked.map((s) => s.slice(0, 8)).join(","), 120) : "-");
  }
} catch (e) {
  chk("C2.6W-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — browser, front door, temp dir (chromium profile + TLS material: a leftover profile once filled the disk),
  //   then every row of the throwaway tenants (4 passes over every table with a tenantId), the users and this run's limiter buckets.
  // ═════════════════════════════════════════════════════════════════════════════
  try { if (browser) await browser.close(); } catch { /* ignore */ }
  try { if (server) await new Promise<void>((r) => server.close(() => r())); } catch { /* ignore */ }
  try { rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  await del(() => P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE ("key" LIKE 'crm:%' OR "key" LIKE 'form:%') AND "createdAt" >= $1`, RUN_START));
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(r?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      const buckets = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE ("key" LIKE 'crm:%' OR "key" LIKE 'form:%') AND "createdAt" >= $1`, RUN_START).catch(() => [{ n: 0 }])) as Any[])?.[0]?.n ?? 0);
      chk("C2.6W-CLEAN", "the oracle gives the QC database and the machine back exactly as found — throwaway tenants, rows, users, limiter buckets, the chromium profile and the TLS material are gone",
        left.length === 0 && tenants === 0 && users === 0 && buckets === 0 && !existsSync(TMP), "0 rows · 0 tenants · 0 users · 0 buckets · no temp dir",
        `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} buckets=${buckets} tmp=${existsSync(TMP)}`, "MAJOR");
    } catch (e) {
      chk("C2.6W-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
out(`\n${passed === total ? "🟢" : "🔴"} C2.6-web: ${passed}/${total}`);
out(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
