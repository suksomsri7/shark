// prod-walk-run.mjs — the browser walk of C6.3 on PRODUCTION (5 roles × 2 viewports + the simulated B2B story).
//   bash scripts/iso.sh node scripts/pending/c6/prod-walk-run.mjs --stage pages            # every page · every staff role · both viewports · NO write (POST aborted in the browser)
//   bash scripts/iso.sh node scripts/pending/c6/prod-walk-run.mjs --stage scenario         # the qc-prod- story through the UI (writes; every created id → manifest)
//   bash scripts/iso.sh node scripts/pending/c6/prod-walk-run.mjs --stage pages-after      # pages again with data + the 360 pages + visibility matrix
//   bash scripts/iso.sh node scripts/pending/c6/prod-walk-run.mjs --stage portal           # customer session on /b/<slug>/* (needs setup --stage portal)
//   options: --roles owner,manager,lead,staff · --plan (print the page × role matrix and the scenario steps, open nothing)
// 🔴 Refuses to start without a manifest written by `prod-walk-setup.cjs --apply`. BASE is hard-coded (https://shark.in.th).
// 🔴 Never prints a cookie/token. Requests to any other origin are aborted. In read stages every non-GET request is aborted before it leaves the browser.
// 🔴 Abort rules (exit 4, then the controller runs cleanup): any same-origin 5xx · a POST outside an armed scenario step · a DB assertion that fails ·
//    a row of the walk found under another tenant · an outbound-send indicator (CrmEmailMessage / WebhookDelivery / Customer / AccountDocument / KanbanCard delta).
// 🔴 Never pressed (see prod-walk-PLAN.md §b): template chooser, e-mail send, sequence enrol, AI buttons, quotation/invoice, convert-to-member, portal invite,
//    PDPA erase, API key / webhook create, file upload, open-task-card, tracking/forms save, commission approve, import.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { C, connect, guard, readManifest, manifestAdd, writeManifest, nowIso, tokenFor } = require("./prod-walk-lib.cjs");

const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const STAGE = argOf("--stage") || "pages";
const PLAN_ONLY = args.includes("--plan");
const SYS = C.CRM_SYSTEM_ID;
const HOME = `/app/sys/${SYS}`;
const CRM = `${HOME}/crm`;
const PB = `/b/${C.TENANT_SLUG}`;
const SHOTS = `${C.DIR}/shots`;
const VIEWPORTS = [{ key: "1440", width: 1440, height: 900, isMobile: false }, { key: "390", width: 390, height: 844, isMobile: true }];
// walk role → role name used by scripts/crm-ui-inventory.json (the button registry)
const REG_ROLE = { owner: "owner", manager: "manager", lead: "nok", staff: "thana", customer: "customer" };
const ROLES = (argOf("--roles") || "owner,manager,lead,staff").split(",");

// ───────────── page list (blueprint docs/modules/20-crm-v2.md §3 · route tree src/app/app/sys/[id]/crm/** · /b/*) ─────────────
const REPORT_TABS = ["overview", "forecast", "funnel", "reps", "activities", "lost", "sources", "scores"]; // src/lib/modules/crm/reports-shared.ts:12
const STATIC_PAGES = [
  ["home", HOME, "/app/sys/[id]"],
  ["contacts", `${CRM}/contacts`, "/contacts"], ["contacts-new", `${CRM}/contacts/new`, "/contacts/new"], ["contacts-import", `${CRM}/contacts/import`, "/contacts/import"], ["contacts-duplicates", `${CRM}/contacts/duplicates`, "/contacts/duplicates"],
  ["companies", `${CRM}/companies`, "/companies"], ["companies-new", `${CRM}/companies/new`, "/companies/new"], ["companies-duplicates", `${CRM}/companies/duplicates`, "/companies/duplicates"],
  ["deals-board", `${CRM}/deals`, "/deals"], ["deals-table", `${CRM}/deals?view=table`, "/deals"], ["deals-new", `${CRM}/deals/new`, "/deals/new"], ["pipelines", `${CRM}/pipelines`, "/pipelines"],
  ["activities", `${CRM}/activities`, "/activities"], ["calendar", `${CRM}/calendar`, "/calendar"], ["emails", `${CRM}/emails`, "/emails"],
  ["objects", `${CRM}/objects`, "/objects"], ["commissions", `${CRM}/commissions`, "/commissions"],
  ["reports", `${CRM}/reports`, "/reports"], ...REPORT_TABS.map((t) => [`reports-${t}`, `${CRM}/reports/${t}`, "/reports"]),
  ["settings", `${CRM}/settings`, "/settings"],
  ...["pipelines", "stages", "lost-reasons", "visibility", "objects", "api", "automation", "sequences", "holidays", "assignment", "scoring", "notifications", "quotas", "commissions", "portal", "tracking", "forms", "integrations", "email"]
    .map((s) => [`settings-${s}`, `${CRM}/settings/${s}`, `/settings/${s}`]),
  ["teams", "/app/settings/teams", "/app/settings/teams"],
];
// GET of /settings/email mints settings.crm.email.inboundKey on first open (crm/emails.ts:491-510) — cleanup restores the AppSystem row byte-for-byte.
const PORTAL_PAGES = [["portal-home", PB, "/b/[slug]"], ["portal-quotations", `${PB}/quotations`, "/b/[slug]/quotations"], ["portal-invoices", `${PB}/invoices`, "/b/[slug]/invoices"], ["portal-documents", `${PB}/documents`, "/b/[slug]/documents"], ["portal-requests", `${PB}/requests`, "/b/[slug]/requests"], ["portal-contacts", `${PB}/contacts`, "/b/[slug]"]];
// known by-design 404s (C5.5-fix2 it4 F1: no crm.company.read ⇒ 404 for the QC staff roles)
const HARD_404 = { lead: ["companies", "companies-new", "companies-duplicates"], staff: ["companies", "companies-new", "companies-duplicates"] };

const registry = JSON.parse(fs.readFileSync(new URL("../../crm-ui-inventory.json", import.meta.url), "utf8")).rows;
/** exact (non-pattern) testids the registry says this role must see on this page */
const expectIds = (regPage, role) => registry.filter((r) => r.page === regPage && !r.system && r.roles.includes(REG_ROLE[role]) && !r.testid.includes("*") && !r.query).map((r) => r.testid);
const hiddenIds = (regPage, role) => registry.filter((r) => r.page === regPage && !r.system && (r.hiddenFor || []).includes(REG_ROLE[role]) && !r.testid.includes("*")).map((r) => r.testid);
/** expectation from the registry: the role has controls on the page ⇒ 200 · none ⇒ "gated" (404 or a page without controls — recorded, compared with QC evidence) */
const expectOf = (key, regPage, role) => (HARD_404[role]?.includes(key) ? "404" : registry.some((r) => r.page === regPage && !r.system && r.roles.includes(REG_ROLE[role])) ? "200" : "gated");

// ───────────── scenario (the qc-prod- B2B dive-trip story) — each step: who · what · DB assertion ─────────────
const STORY = [
  ["S01", "owner", "create company qc-prod-Andaman Corporate Travel (no tax id, no phone/e-mail)", "CrmCompany +1 · Party(COMPANY) +1 marked · AccountContact 0"],
  ["S02", "owner", "create contact qc-prod-Wanna Buyer (e-mail @qc-prod.invalid, no phone) linked to the company, owner = owner", "CrmContact +1 · CrmCompanyContact +1 · Party(PERSON) +1"],
  ["S03", "manager", "create lead qc-prod-Somchai Lead (NO phone, NO e-mail) and assign it to the staff user", "CrmContact.ownerUserId = staff · AppNotification(lead.assigned) for the temp staff only"],
  ["S04", "staff", "visibility: sees S03 lead (own) · GET of the S02 contact ⇒ 404 (owner's record, policy STAFF=TEAM)", "HTTP 200 / 404"],
  ["S05", "staff", "open deal qc-prod-Corporate dive trip 20 pax (180,000 ฿) on the S03 lead", "CrmDeal +1 owner = staff · stage = first OPEN stage · history +1"],
  ["S06", "staff", "log a CALL activity on the deal (no due date, no reminder, no @mention)", "CrmActivity +1 · deal.lastActivityAt set"],
  ["S07", "lead", "team visibility: opens the staff's deal (same team) and moves it ผู้สนใจใหม่ → ติดต่อแล้ว → เสนอราคา", "CrmDealStageHistory +2 · stageId = เสนอราคา"],
  ["S08", "manager", "adds 2 deal lines (20 × 8,000 · 1 × 20,000), no discount", "CrmDealLine = 2 · value recomputed"],
  ["S09", "manager", "moves the deal to ปิดการขายได้ (WON)", "kind WON · closedAt set · crm.deal.won DONE · Customer 0 (contact has no phone/e-mail) · AccountDocument 0"],
  ["S10", "lead", "opens deal qc-prod-Liveaboard charter (95,000 ฿) on the S03 lead; staff marks it LOST with the first lost reason + note", "kind LOST · lostReasonId set · crm.deal.lost DONE"],
  ["S11", "owner", "opens deal qc-prod-Annual corporate contract (400,000 ฿) on the S02 contact (company deal, owner = owner)", "CrmDeal +1 companyId set"],
  ["S12", "all", "visibility matrix on the 3 deals / 2 contacts / company 360 (owner 200 · manager 200 · lead/staff: team deals 200, owner's deal 404, company 404)", "HTTP status per role"],
  ["S13", "manager", "reports reflect the story: overview / funnel / lost / reps tabs render; DB: won 180,000 · lost 1 · open 1", "SQL sums"],
  ["S20", "owner", "2b: add lost reason qc-prod-…", "CrmLostReason +1 (marker)"],
  ["S21", "owner/manager", "2b: custom object qcprodcontract (not bound) + one record by the manager", "CustomObject +1 · CustomRecord +1"],
  ["S22", "manager", "2b: sequence definition with a single WAIT step — nobody enrolled", "CrmSequence +1 · enrolments 0"],
  ["S23", "manager", "2b: monthly quota 500,000 ฿ for the temp staff user", "CrmQuota +1"],
  ["S24", "manager", "2b: assignment rule (staff only) created then switched off", "CrmAssignmentRule +1 active=false"],
  ["S25", "manager", "2b: score rule (1 point) created inactive", "CrmScoreRule inactive"],
  ["S26", "staff", "2b: private saved view on contacts?q=qc-prod", "MemberSavedView +1"],
  ["S14", "owner", "portal: enable settings.crm.portal (UI) → setup --stage portal → customer walks /b/<slug>/* → customer cannot open /app/* → owner disables portal", "PortalSession valid · pages 200 · /app 307→/login · settings restored"],
];

if (PLAN_ONLY) {
  console.log(`pages × roles (expectation from scripts/crm-ui-inventory.json; 5xx always aborts):`);
  for (const [key, , regPage] of STATIC_PAGES) console.log(`  ${key.padEnd(24)} ${ROLES.map((r) => `${r}:${expectOf(key, regPage, r)}`).join("  ")}`);
  console.log(`\nportal pages (customer): ${PORTAL_PAGES.map((p) => p[0]).join(", ")}`);
  console.log(`\nscenario:`); for (const s of STORY) console.log(`  ${s[0]} [${s[1]}] ${s[2]}  ⇒  ${s[3]}`);
  console.log(`\ncounts: static pages ${STATIC_PAGES.length} × roles ${ROLES.length} × viewports 2 = ${STATIC_PAGES.length * ROLES.length * 2} page loads (+ 360 pages after the scenario, + portal ${PORTAL_PAGES.length} × 2)`);
  process.exit(0);
}

// ───────────── start-up guards ─────────────
const m = readManifest();
if (!m || !m.setupDoneAt || !m.sessions?.owner) { console.error(`REFUSE: no manifest from prod-walk-setup --apply at ${C.MANIFEST}`); process.exit(1); }
if (new Date(m.sessionExpiresAt).getTime() - Date.now() < 10 * 60_000) { console.error("REFUSE: the minted sessions expire in < 10 minutes — clean up and set up again"); process.exit(1); }
if (STAGE === "portal" && !m.sessions.customer) { console.error("REFUSE: no customer session — run prod-walk-setup --stage portal --apply first"); process.exit(1); }
fs.mkdirSync(SHOTS, { recursive: true });
const RESULT = `${C.DIR}/result-${STAGE}-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}.json`;
const result = { stage: STAGE, startedAt: nowIso(), pages: [], steps: [], findings: [], aborted: null };
const save = () => fs.writeFileSync(RESULT, JSON.stringify(result, null, 1));
class Abort extends Error {}
const finding = (text) => { result.findings.push(text); console.log(`  FINDING ${text}`); };

// read-only DB handle for assertions (BEGIN READ ONLY per query batch; no SET)
const { client: db } = await connect();
const g0 = await (async () => { await db.query("BEGIN READ ONLY"); try { return await guard(db); } finally { await db.query("ROLLBACK"); } })();
const sql = async (text, params = []) => { await db.query("BEGIN READ ONLY"); try { return (await db.query(text, params)).rows; } finally { await db.query("ROLLBACK"); } };
const T = C.TENANT_ID;
/** indicators that something left the CRM (must stay flat through the whole walk) */
const sideEffects = async () => (await sql(`SELECT
  (SELECT count(*)::int FROM "CrmEmailMessage" WHERE "tenantId" = $1) AS emails, (SELECT count(*)::int FROM "Customer" WHERE "tenantId" = $1) AS customers,
  (SELECT count(*)::int FROM "AccountDocument" WHERE "tenantId" = $1) AS documents, (SELECT count(*)::int FROM "AccountContact" WHERE "tenantId" = $1) AS account_contacts,
  (SELECT count(*)::int FROM "KanbanCard" WHERE "tenantId" = $1) AS cards, (SELECT count(*)::int FROM "WebhookDelivery" WHERE "tenantId" = $1 AND ("eventType" LIKE 'crm.%' OR "eventType" LIKE 'custom.%' OR "eventType" LIKE 'team.%')) AS crm_webhooks,
  (SELECT count(*)::int FROM "AutomationRun" WHERE "tenantId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')) AS automation_runs, (SELECT count(*)::int FROM "AiCreditTxn" WHERE "tenantId" = $1) AS ai_txns,
  (SELECT count(*)::int FROM "CrmSequenceEnrollment" WHERE "tenantId" = $1) AS enrollments,
  (SELECT count(*)::int FROM "AppNotification" WHERE "tenantId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC') AND ("recipientUserId" = $3 OR "recipientUserId" IS NULL) AND (title LIKE '%qc-prod-%' OR body LIKE '%qc-prod-%')) AS owner_notifications`, [T, m.startedAt, m.ownerUserId]))[0];
const SE0 = await sideEffects();
const checkSideEffects = async (where) => {
  const now = await sideEffects();
  const diff = Object.keys(SE0).filter((k) => now[k] !== SE0[k]);
  if (diff.length) throw new Abort(`side-effect indicator moved after ${where}: ${diff.map((k) => `${k} ${SE0[k]}→${now[k]}`).join(" · ")}`);
};
const waitOutboxDrained = async (label) => {
  for (let i = 0; i < 30; i += 1) {
    const r = await sql(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND status::text = 'PENDING'`, [T]);
    if (!r[0].n) return;
    await new Promise((res) => setTimeout(res, 2000));
  }
  finding(`${label}: OutboxEvent still PENDING after 60 s (cron backstop will drain; cleanup must wait)`);
};

// ───────────── browser ─────────────
const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const profile = `/tmp/chr-c63-walk-${process.pid}`;
const browser = await pptr.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${profile}`] });
const reqLog = fs.createWriteStream(`${C.DIR}/requests-${STAGE}.log`, { flags: "a" });
let armed = null; // name of the scenario step that may POST right now

async function sessionPage(role, vp) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.isMobile, hasTouch: vp.isMobile, deviceScaleFactor: 1 });
  await page.setUserAgent(`${await browser.userAgent()} ${C.UA}`);
  const cookies = role === "customer"
    ? [{ name: "__Host-shark_portal", value: tokenFor(m.sessions.customer, "cp_"), url: C.BASE, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]
    : [{ name: "__Host-shark_session", value: tokenFor(m.sessions[role]), url: C.BASE, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }, { name: "shark_tenant", value: T, url: C.BASE, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }];
  await page.setCookie(...cookies);
  const st = { errors: [], five: [], posts: [] };
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = new URL(req.url());
    const sameOrigin = u.origin === C.BASE;
    const method = req.method();
    if (!sameOrigin && !["data:", "blob:"].includes(u.protocol)) return void req.abort("blockedbyclient"); // nothing leaves for a third party
    if (sameOrigin && (/^\/(t|l|f|u)\//.test(u.pathname) || u.pathname.startsWith("/api/cron"))) return void req.abort("blockedbyclient"); // tracking / unsubscribe / cron routes write on GET
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      reqLog.write(`${nowIso()} ${role} ${armed ? `ARMED:${armed}` : "BLOCKED"} ${method} ${u.pathname}${u.search} next-action=${(req.headers()["next-action"] || "").slice(0, 12)}\n`);
      if (!armed) { st.posts.push(`${method} ${u.pathname}`); return void req.abort("blockedbyclient"); }
    }
    return void req.continue();
  });
  page.on("response", (res) => { if (res.url().startsWith(C.BASE) && res.status() >= 500) st.five.push(`${res.status()} ${new URL(res.url()).pathname}`); });
  page.on("pageerror", (e) => st.errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on("console", (msg) => { if (msg.type() === "error") { const t = msg.text(); if (!/ERR_BLOCKED_BY_CLIENT|Failed to load resource: net::ERR_FAILED/.test(t)) st.errors.push(`console: ${t.slice(0, 200)}`); } });
  return { ctx, page, st };
}

async function visit(s, role, vp, key, path, regPage, expected) {
  s.st.errors.length = 0; s.st.posts.length = 0;
  const res = await s.page.goto(`${C.BASE}${path}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch((e) => ({ _err: String(e.message).slice(0, 120) }));
  const status = res?._err ? 0 : res?.status() ?? 0;
  const finalPath = new URL(s.page.url()).pathname;
  await new Promise((r) => setTimeout(r, 400));
  const dom = await s.page.evaluate(() => ({
    ids: Array.from(document.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid")),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    title: document.title, textLen: document.body?.innerText?.length ?? 0,
    notFound: !!document.querySelector("[data-testid=not-found]") || /ไม่พบหน้า|404/.test(document.title),
  })).catch(() => ({ ids: [], overflow: 0, title: "", textLen: 0, notFound: false }));
  const want = regPage ? expectIds(regPage, role) : [];
  const present = want.filter((id) => dom.ids.includes(id));
  const leaked = regPage ? hiddenIds(regPage, role).filter((id) => dom.ids.includes(id)) : [];
  const shot = `${SHOTS}/${STAGE}-${role}-${vp.key}-${key}.png`;
  await s.page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  const row = { role, vp: vp.key, key, path, status, finalPath, expected, testids: dom.ids.length, regWant: want.length, regPresent: present.length, overflowPx: dom.overflow, errors: [...s.st.errors], blockedPosts: [...s.st.posts], leaked, shot };
  result.pages.push(row); save();
  console.log(`  ${role.padEnd(8)} ${vp.key.padEnd(4)} ${key.padEnd(26)} ${String(status).padEnd(3)} exp ${String(expected).padEnd(5)} ids ${String(dom.ids.length).padStart(3)} reg ${present.length}/${want.length} ovf ${dom.overflow}${s.st.errors.length ? ` err ${s.st.errors.length}` : ""}${leaked.length ? ` LEAK ${leaked.length}` : ""}`);
  if (s.st.five.length || status >= 500) throw new Abort(`5xx on ${role} ${path}: ${s.st.five.join(", ") || status}`);
  if (finalPath === "/login" && role !== "customer") throw new Abort(`session of ${role} was not accepted (redirected to /login) at ${path}`);
  if (expected === "200" && status !== 200) finding(`${role}/${vp.key} ${key}: HTTP ${status}, expected 200`);
  if (expected === "404" && status !== 404) finding(`${role}/${vp.key} ${key}: HTTP ${status}, expected 404 (by design)`);
  if (expected === "200" && status === 200 && want.length && present.length === 0) finding(`${role}/${vp.key} ${key}: none of ${want.length} registry controls present`);
  if (dom.overflow > 1) finding(`${role}/${vp.key} ${key}: horizontal overflow ${dom.overflow}px`);
  if (leaked.length) finding(`${role}/${vp.key} ${key}: hiddenFor controls visible: ${leaked.slice(0, 5).join(", ")}`);
  if (s.st.errors.length) finding(`${role}/${vp.key} ${key}: ${s.st.errors.length} console/page error(s): ${s.st.errors[0]}`);
  if (s.st.posts.length) finding(`${role}/${vp.key} ${key}: page tried ${s.st.posts.length} non-GET request(s) on load (aborted): ${s.st.posts[0]}`);
  return row;
}

// ───────────── UI helpers for the scenario ─────────────
const tid = (id) => `[data-testid="${id}"]`;
const type = async (page, id, text) => { await page.waitForSelector(tid(id), { visible: true, timeout: 20_000 }); await page.click(tid(id), { clickCount: 3 }); await page.type(tid(id), text, { delay: 5 }); };
const click = async (page, id) => { await page.waitForSelector(tid(id), { visible: true, timeout: 20_000 }); await page.click(tid(id)); };
const pick = async (page, id, value) => { await page.waitForSelector(tid(id), { timeout: 20_000 }); await page.waitForFunction((sel, v) => Array.from(document.querySelector(sel)?.options ?? []).some((o) => o.value === v), { timeout: 20_000 }, tid(id), value); await page.select(tid(id), value); };
const idFromUrl = async (page, prefix) => { await page.waitForFunction((p) => new RegExp(`${p}/[a-z0-9]{20,}`).test(location.pathname), { timeout: 30_000 }, prefix); return new URL(page.url()).pathname.split("/").filter(Boolean).pop(); };
const one = async (text, params) => (await sql(text, params))[0];
/** after a UI create: the new row must be in THIS tenant + pilot system and carry the marker — else abort (row written somewhere unexpected) */
async function adopt(table, id, markCol) {
  const r = await one(`SELECT "tenantId", "systemId", ${markCol} AS mark FROM "${table}" WHERE id = $1`, [id]);
  if (!r) throw new Abort(`${table} ${id} not found after create`);
  if (r.tenantId !== T || r.systemId !== SYS) throw new Abort(`${table} ${id} was written under another tenant/system`);
  if (!String(r.mark).startsWith(C.MARK)) throw new Abort(`${table} ${id} has no ${C.MARK} marker`);
  manifestAdd(m, table, id, { phase: "walk" });
}
async function step(code, role, fn) {
  const meta = STORY.find((s) => s[0] === code);
  console.log(`\n${code} [${role}] ${meta[2]}`);
  const s = await sessionPage(role, VIEWPORTS[0]);
  const rec = { code, role, what: meta[2], at: nowIso(), ok: false };
  const win = { code, role, at: rec.at, end: null };
  m.ui.push(win); writeManifest(m); // intent on disk BEFORE the first write of the step
  try {
    armed = code;
    await fn(s.page, rec);
    armed = null;
    if (s.st.five.length) throw new Abort(`5xx during ${code}: ${s.st.five.join(", ")}`);
    await waitOutboxDrained(code);
    await checkSideEffects(code);
    await s.page.screenshot({ path: `${SHOTS}/scenario-${code}-${role}.png`, fullPage: true }).catch(() => {});
    rec.ok = true;
  } catch (e) {
    rec.error = String(e.message).slice(0, 300);
    await s.page.screenshot({ path: `${SHOTS}/scenario-${code}-${role}-FAILED.png`, fullPage: true }).catch(() => {});
    rec.domIds = await s.page.evaluate(() => Array.from(document.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid")).slice(0, 150)).catch(() => []);
    rec.url = s.page.url().replace(C.BASE, "");
    throw e;
  } finally { armed = null; win.end = nowIso(); rec.end = win.end; writeManifest(m); result.steps.push(rec); save(); await s.ctx.close().catch(() => {}); }
}
const touch = (...paths) => { m.touchedSettingsPaths = Array.from(new Set([...(m.touchedSettingsPaths ?? []), ...paths])); writeManifest(m); };
/** adopt rows a step created in `table` under the pilot system since the step began (rule: only inside an armed step window) */
async function adoptNew(table, sinceIso, where = "") {
  const rows = await sql(`SELECT id FROM "${table}" WHERE "tenantId" = $1 AND "systemId" = $2 AND "createdAt" >= ($3::timestamptz AT TIME ZONE 'UTC') - interval '2 seconds' ${where}`, [T, SYS, sinceIso]);
  for (const r of rows) manifestAdd(m, table, r.id, { phase: "walk" });
  return rows.map((r) => r.id);
}
const DONE = new Set((m.done ?? []));
const ONLY = argOf("--only") ? new Set(argOf("--only").split(",")) : null;
/** run one scenario step unless it already passed (resume after a selector fix) — a failed OPTIONAL step is recorded and the walk goes on */
async function runStep(code, role, fn, { optional = false, key = code } = {}) {
  if (ONLY && !ONLY.has(key)) return;
  if (DONE.has(key)) { console.log(`\n${key} already passed — skipped`); return; }
  try { await step(code, role, fn); DONE.add(key); m.done = [...DONE]; writeManifest(m); }
  catch (e) { if (!optional || (e instanceof Abort && /5xx|side-effect|another tenant/.test(e.message))) throw e; finding(`${key} NOT COMPLETED: ${String(e.message).slice(0, 200)}`); }
}
/** create a deal through /deals/new; tolerant of the "created but no redirect" behaviour seen on prod at S05 (recorded as a finding) and idempotent on retry */
async function createDealUi(page, { title, contactId, value, typeQ }) {
  const existing = await sql(`SELECT id FROM "CrmDeal" WHERE "tenantId" = $1 AND "systemId" = $2 AND title = $3`, [T, SYS, title]);
  if (existing.length === 1) { console.log(`  (deal "${title}" already exists from an earlier attempt — adopted, not re-created)`); return existing[0].id; }
  must(existing.length === 0, `no duplicate deals titled ${title}`);
  await page.goto(`${C.BASE}${CRM}/deals/new?contactId=${contactId}`, { waitUntil: "networkidle2" });
  await type(page, "deal-new-title", title);
  if (typeQ) { await type(page, "deal-new-contact-q", typeQ); await new Promise((r) => setTimeout(r, 1500)); }
  await pick(page, "deal-new-contact", contactId);
  await type(page, "deal-new-value", String(value));
  await new Promise((r) => setTimeout(r, 1200));
  await click(page, "deal-new-submit");
  const navigated = await page.waitForFunction((p) => new RegExp(`${p}/[a-z0-9]{20,}`).test(location.pathname), { timeout: 15_000 }, `${CRM}/deals`).then(() => true).catch(() => false);
  const rows = await sql(`SELECT id FROM "CrmDeal" WHERE "tenantId" = $1 AND "systemId" = $2 AND title = $3`, [T, SYS, title]);
  must(rows.length === 1, `exactly one deal titled ${title} after submit (found ${rows.length})`);
  if (!navigated) finding(`deals/new: deal "${title}" was created but the form did not navigate to the deal page within 15 s (typeQ=${!!typeQ})`);
  return rows[0].id;
}
const must = (cond, msg) => { if (!cond) throw new Abort(`assertion failed: ${msg}`); };

async function scenario() {
  const st = await sql(`SELECT id, name, kind::text AS kind, "sortOrder" FROM "CrmStage" WHERE "tenantId" = $1 AND "systemId" = $2 ORDER BY "sortOrder"`, [T, SYS]);
  const open = st.filter((x) => x.kind === "OPEN"), won = st.find((x) => x.kind === "WON");
  must(open.length >= 3 && won, "default pipeline has ≥3 OPEN stages + WON");
  const ids = m.story || (m.story = {}); writeManifest(m);

  await runStep("S01", "owner", async (page, rec) => {
    await page.goto(`${C.BASE}${CRM}/companies/new`, { waitUntil: "networkidle2" });
    await type(page, "company-new-name", "qc-prod-Andaman Corporate Travel");
    await type(page, "company-new-industry", "qc-prod- ท่องเที่ยว/ทัวร์ (ทดสอบ)");
    await click(page, "company-new-submit");
    ids.company = await idFromUrl(page, `${CRM}/companies`); await adopt("CrmCompany", ids.company, "name"); writeManifest(m);
    const r = await one(`SELECT c."partyId", p.name AS pname, c."accountContactId" FROM "CrmCompany" c LEFT JOIN "Party" p ON p.id = c."partyId" WHERE c.id = $1`, [ids.company]);
    must(r.partyId && String(r.pname).startsWith(C.MARK) && !r.accountContactId, "company has its own qc-prod- Party and no account contact");
    rec.db = r;
  });
  await runStep("S02", "owner", async (page, rec) => {
    await page.goto(`${C.BASE}${CRM}/contacts/new`, { waitUntil: "networkidle2" });
    await type(page, "contact-new-firstName", "qc-prod-Wanna"); await type(page, "contact-new-lastName", "Buyer");
    await type(page, "contact-new-email", `qc-prod-buyer@${C.EMAIL_DOMAIN}`); await type(page, "contact-new-jobTitle", "ผู้จัดการฝ่ายกิจกรรม (ทดสอบ)");
    await type(page, "contact-pick-company-q", "qc-prod-Andaman"); await pick(page, "contact-pick-company-select", ids.company);
    await click(page, "contact-new-submit");
    ids.contactA = await idFromUrl(page, `${CRM}/contacts`); await adopt("CrmContact", ids.contactA, "name"); writeManifest(m);
    const r = await one(`SELECT (SELECT count(*)::int FROM "CrmCompanyContact" WHERE "contactId" = $1 AND "companyId" = $2 AND "endedAt" IS NULL) AS links, (SELECT "memberCustomerId" FROM "CrmContact" WHERE id = $1) AS member`, [ids.contactA, ids.company]);
    must(r.links === 1 && !r.member, "contact linked to the company, not linked to a member"); rec.db = r;
  });
  await runStep("S03", "manager", async (page, rec) => {
    await page.goto(`${C.BASE}${CRM}/contacts/new`, { waitUntil: "networkidle2" });
    await type(page, "contact-new-firstName", "qc-prod-Somchai"); await type(page, "contact-new-lastName", "Lead");
    await pick(page, "contact-new-ownerUserId", m.users.staff);
    await click(page, "contact-new-submit");
    ids.contactB = await idFromUrl(page, `${CRM}/contacts`); await adopt("CrmContact", ids.contactB, "name"); writeManifest(m);
    const r = await one(`SELECT "ownerUserId", phone, email FROM "CrmContact" WHERE id = $1`, [ids.contactB]);
    must(r.ownerUserId === m.users.staff && !r.phone && !r.email, "lead owned by staff, no phone/e-mail (⇒ a WON deal cannot enrol a member, member-bridges.ts:616-690)"); rec.db = r;
  });
  await runStep("S04", "staff", async (page, rec) => {
    const a = await page.goto(`${C.BASE}${CRM}/contacts/${ids.contactB}`, { waitUntil: "networkidle2" });
    const b = await page.goto(`${C.BASE}${CRM}/contacts/${ids.contactA}`, { waitUntil: "networkidle2" });
    rec.http = { own: a.status(), ownersRecord: b.status() };
    must(a.status() === 200, "staff opens its own lead"); must(b.status() === 404, "staff gets 404 on the owner's contact");
  });
  await runStep("S05", "staff", async (page, rec) => {
    ids.deal1 = await createDealUi(page, { title: "qc-prod-Corporate dive trip 20 pax", contactId: ids.contactB, value: 180000, typeQ: "qc-prod-Somchai" }); await adopt("CrmDeal", ids.deal1, "title"); writeManifest(m);
    const r = await one(`SELECT "ownerUserId", "stageId", "valueSatang"::text AS v, kind::text AS kind FROM "CrmDeal" WHERE id = $1`, [ids.deal1]);
    must(r.ownerUserId === m.users.staff && r.stageId === open[0].id && r.kind === "OPEN", "deal owned by staff in the first OPEN stage"); rec.db = r;
  });
  await runStep("S06", "staff", async (page, rec) => {
    await page.goto(`${C.BASE}${CRM}/activities`, { waitUntil: "networkidle2" });
    await click(page, "activities-new");
    await type(page, "activity-log-target-q", "qc-prod-Corporate"); await click(page, "activity-log-target-option");
    await click(page, "activity-log-type-CALL");
    await type(page, "activity-log-title", "qc-prod- โทรแนะนำแพ็กเกจองค์กร"); await type(page, "activity-log-body", "qc-prod- ทดสอบระบบ: ลูกค้าสนใจทริป 20 คน ขอใบเสนอราคา");
    await click(page, "activity-log-submit");
    await page.waitForFunction(() => !document.querySelector('[data-testid="activity-log-submit"]') || !!document.querySelector('[data-testid="activity-log-notice"]'), { timeout: 30_000 }).catch(() => {});
    const r = await sql(`SELECT id, type::text AS type, "dueAt", "remindAt" FROM "CrmActivity" WHERE "tenantId" = $1 AND "dealId" = $2`, [T, ids.deal1]);
    must(r.length >= 1, "activity row exists on the deal");
    for (const a of r) { manifestAdd(m, "CrmActivity", a.id, { phase: "walk" }); must(!a.remindAt, "no reminder set (reminders push to the owner, reminders.ts:156-163)"); }
    rec.db = r.length;
  });
  await runStep("S07", "lead", async (page, rec) => {
    const res = await page.goto(`${C.BASE}${CRM}/deals/${ids.deal1}`, { waitUntil: "networkidle2" });
    must(res.status() === 200, "team lead opens the staff's deal (team visibility)");
    for (const sgt of [open[1], open[2]]) {
      await click(page, `deal-stage-step-${sgt.id}`);
      await page.waitForFunction(() => !!document.querySelector('[data-testid="deal-move-toast"]') || !!document.querySelector('[data-testid="deal-req-submit"]'), { timeout: 20_000 }).catch(() => {});
      if (await page.$(tid("deal-req-submit"))) throw new Abort("stage requires extra fields — not expected on the default pipeline");
      await new Promise((r) => setTimeout(r, 1200));
    }
    const r = await one(`SELECT d."stageId", (SELECT count(*)::int FROM "CrmDealStageHistory" h WHERE h."dealId" = d.id) AS hist FROM "CrmDeal" d WHERE d.id = $1`, [ids.deal1]);
    must(r.stageId === open[2].id, "deal is in เสนอราคา"); rec.db = r;
  });
  await runStep("S08", "manager", async (page, rec) => {
    await page.goto(`${C.BASE}${CRM}/deals/${ids.deal1}?tab=lines`, { waitUntil: "networkidle2" });
    await click(page, "deal-line-add"); await type(page, "deal-line-name-0", "qc-prod- ทริปดำน้ำ 1 วัน (ต่อคน)"); await type(page, "deal-line-qty-0", "20"); await type(page, "deal-line-price-0", "8000");
    await click(page, "deal-line-add"); await type(page, "deal-line-name-1", "qc-prod- ค่าเรือเหมาลำ"); await type(page, "deal-line-qty-1", "1"); await type(page, "deal-line-price-1", "20000");
    await click(page, "deal-lines-save"); await new Promise((r) => setTimeout(r, 2500));
    const r = await one(`SELECT (SELECT count(*)::int FROM "CrmDealLine" WHERE "dealId" = $1) AS lines, (SELECT count(*)::int FROM "ApprovalRequest" WHERE "tenantId" = $2 AND "createdAt" >= ($3::timestamptz AT TIME ZONE 'UTC')) AS approvals`, [ids.deal1, T, m.startedAt]);
    must(r.lines === 2 && r.approvals === 0, "2 deal lines, no approval request"); rec.db = r;
  });
  await runStep("S09", "manager", async (page, rec) => {
    await page.goto(`${C.BASE}${CRM}/deals/${ids.deal1}`, { waitUntil: "networkidle2" });
    await click(page, `deal-stage-step-${won.id}`);
    await new Promise((r) => setTimeout(r, 2500));
    if (await page.$(tid("deal-req-submit"))) throw new Abort("WON requires extra fields — not expected on the default pipeline");
    const r = await one(`SELECT kind::text AS kind, "closedAt" IS NOT NULL AS closed, (SELECT count(*)::int FROM "Customer" WHERE "tenantId" = $2) AS customers FROM "CrmDeal" WHERE id = $1`, [ids.deal1, T]);
    must(r.kind === "WON" && r.closed && r.customers === SE0.customers, "deal WON, no member enrolled"); rec.db = r;
  });
  await runStep("S10", "lead", async (page, rec) => {
    ids.deal2 = await createDealUi(page, { title: "qc-prod-Liveaboard charter", contactId: ids.contactB, value: 95000, typeQ: null }); await adopt("CrmDeal", ids.deal2, "title"); writeManifest(m);
    rec.db = await one(`SELECT "ownerUserId" FROM "CrmDeal" WHERE id = $1`, [ids.deal2]);
  });
  await runStep("S10", "staff", async (page, rec) => {
    const res = await page.goto(`${C.BASE}${CRM}/deals/${ids.deal2}`, { waitUntil: "networkidle2" });
    must(res.status() === 200, "staff opens the team lead's deal (same team)");
    await click(page, "deal-lost-btn");
    await page.waitForSelector(tid("deal-lost-reason"), { timeout: 20_000 });
    const v = await page.$eval(tid("deal-lost-reason"), (el) => Array.from(el.options).map((o) => o.value).find((x) => x) ?? "");
    await page.select(tid("deal-lost-reason"), v); await type(page, "deal-lost-note", "qc-prod- ทดสอบระบบ: งบไม่พอ");
    await click(page, "deal-lost-confirm"); await new Promise((r) => setTimeout(r, 2500));
    const r = await one(`SELECT kind::text AS kind, "lostReasonId" IS NOT NULL AS reason FROM "CrmDeal" WHERE id = $1`, [ids.deal2]);
    must(r.kind === "LOST" && r.reason, "deal LOST with a reason"); rec.db = r;
  }, { key: "S10b" });
  await runStep("S11", "owner", async (page, rec) => {
    ids.deal3 = await createDealUi(page, { title: "qc-prod-Annual corporate contract", contactId: ids.contactA, value: 400000, typeQ: null }); await adopt("CrmDeal", ids.deal3, "title"); writeManifest(m);
    const r = await one(`SELECT "companyId", "ownerUserId" FROM "CrmDeal" WHERE id = $1`, [ids.deal3]);
    must(r.companyId === ids.company && r.ownerUserId === m.ownerUserId, "company deal owned by the owner"); rec.db = r;
  });
  // S12 — visibility matrix (GET only)
  const matrix = { owner: [200, 200, 200, 200, 200, 200], manager: [200, 200, 200, 200, 200, 200], lead: [200, 200, 404, 404, 200, 404], staff: [200, 200, 404, 404, 200, 404] };
  const targets = [`deals/${ids.deal1}`, `deals/${ids.deal2}`, `deals/${ids.deal3}`, `contacts/${ids.contactA}`, `contacts/${ids.contactB}`, `companies/${ids.company}`];
  for (const role of ["owner", "manager", "lead", "staff"]) {
    const s = await sessionPage(role, VIEWPORTS[0]);
    const got = [];
    for (const t of targets) got.push((await s.page.goto(`${C.BASE}${CRM}/${t}`, { waitUntil: "domcontentloaded" })).status());
    await s.ctx.close();
    result.steps.push({ code: "S12", role, got, want: matrix[role], ok: JSON.stringify(got) === JSON.stringify(matrix[role]) }); save();
    console.log(`S12 [${role}] ${got.join(" ")}  (want ${matrix[role].join(" ")})`);
    if (got.some((x) => x >= 500)) throw new Abort(`5xx in the visibility matrix for ${role}`);
    if (JSON.stringify(got) !== JSON.stringify(matrix[role])) finding(`S12 visibility ${role}: got ${got.join(",")} want ${matrix[role].join(",")}`);
  }
  // S13 — reports reflect the story (DB truth; the pages themselves are shot in pages-after)
  const rep = await one(`SELECT COALESCE(sum("valueSatang") FILTER (WHERE kind::text = 'WON'), 0)::text AS won, count(*) FILTER (WHERE kind::text = 'LOST')::int AS lost, count(*) FILTER (WHERE kind::text = 'OPEN')::int AS open FROM "CrmDeal" WHERE "tenantId" = $1 AND "systemId" = $2`, [T, SYS]);
  result.steps.push({ code: "S13", db: rep, ok: rep.lost === 1 && rep.open === 1 }); save();
  console.log(`S13 deals: won ${rep.won} satang · lost ${rep.lost} · open ${rep.open}`);
  // ── phase 2b (controller order B): SAFE-WITH-CLEANUP settings objects — each optional: a selector miss is recorded, not forced ──
  await runStep("S20", "owner", async (page, rec) => {
    const t0 = nowIso();
    await page.goto(`${C.BASE}${CRM}/settings/lost-reasons`, { waitUntil: "networkidle2" });
    await type(page, "lr-new-label", "qc-prod-เหตุผลทดสอบระบบ"); await click(page, "lr-new-submit"); await new Promise((r) => setTimeout(r, 2500));
    const r = await sql(`SELECT id FROM "CrmLostReason" WHERE "tenantId" = $1 AND "systemId" = $2 AND label LIKE $3`, [T, SYS, `${C.MARK}%`]);
    must(r.length === 1, "one qc-prod- lost reason exists"); manifestAdd(m, "CrmLostReason", r[0].id, { phase: "walk" }); rec.db = { rows: r.length, t0 };
  }, { optional: true });
  await runStep("S21", "owner", async (page, rec) => {
    const t0 = nowIso();
    await page.goto(`${C.BASE}${CRM}/settings/objects`, { waitUntil: "networkidle2" });
    await type(page, "object-add-singular", "qc-prod-สัญญาทดสอบ"); await type(page, "object-add-plural", "qc-prod-สัญญาทดสอบ"); await type(page, "object-add-key", "qcprodcontract");
    await click(page, "object-add-parent-none");
    const tf = await page.$(tid("object-add-title-field"));
    if (tf && (await tf.evaluate((el) => el.tagName)) === "INPUT") await type(page, "object-add-title-field", "name");
    await click(page, "object-add-create");
    await page.waitForFunction(() => /object=qcprodcontract/.test(location.search), { timeout: 30_000 });
    const o = await adoptNew("CustomObject", t0);
    must(o.length === 1, "one CustomObject created"); ids.object = o[0];
    const f = await sql(`SELECT count(*)::int AS n FROM "MemberField" WHERE "tenantId" = $1 AND "systemId" = $2 AND "objectKey" = 'qcprodcontract'`, [T, SYS]);
    rec.db = { object: o[0], fields: f[0].n }; writeManifest(m);
  }, { optional: true });
  await runStep("S21", "manager", async (page, rec) => {
    const t0 = nowIso();
    const res = await page.goto(`${C.BASE}${CRM}/objects/qcprodcontract`, { waitUntil: "networkidle2" });
    must(res.status() === 200, "manager opens the custom object list");
    await click(page, "object-record-new-btn");
    await page.waitForSelector(tid("object-record-form"), { timeout: 20_000 });
    const first = await page.$('[data-testid^="object-record-field-"]');
    if (first) { await first.click({ clickCount: 3 }); await first.type("qc-prod-สัญญาเช่าเรือ 2026", { delay: 5 }); } else rec.note = "object has no fields yet (field designer not exercised) — saving an empty record";
    await click(page, "object-record-save"); await new Promise((r) => setTimeout(r, 3000));
    const r = await adoptNew("CustomRecord", t0);
    must(r.length === 1, "one CustomRecord created"); rec.db = { record: r[0] };
  }, { optional: true, key: "S21b" });
  await runStep("S22", "manager", async (page, rec) => {
    const t0 = nowIso();
    await page.goto(`${C.BASE}${CRM}/settings/sequences`, { waitUntil: "networkidle2" });
    await click(page, "crm-seq-new");
    await type(page, "crm-seq-new-name", "qc-prod-ลำดับติดตามทดสอบ");
    await page.select(tid("crm-seq-step-kind-new"), "WAIT"); // first step WAIT ⇒ even an accidental enrolment could not send anything
    await click(page, "crm-seq-new-submit");
    await page.waitForFunction(() => /settings\/sequences\/[a-z0-9]{20,}/.test(location.pathname), { timeout: 30_000 });
    const r = await sql(`SELECT s.id, (SELECT count(*)::int FROM "CrmSequenceEnrollment" e WHERE e."sequenceId" = s.id) AS enrolled, (SELECT string_agg(st.kind::text, ',') FROM "CrmSequenceStep" st WHERE st."sequenceId" = s.id) AS kinds FROM "CrmSequence" s WHERE s."tenantId" = $1 AND s."systemId" = $2 AND s.name LIKE $3`, [T, SYS, `${C.MARK}%`]);
    must(r.length === 1 && r[0].enrolled === 0 && r[0].kinds === "WAIT", "one sequence, WAIT step only, nobody enrolled"); manifestAdd(m, "CrmSequence", r[0].id, { phase: "walk" }); rec.db = r[0];
  }, { optional: true });
  await runStep("S23", "manager", async (page, rec) => {
    const t0 = nowIso();
    await page.goto(`${C.BASE}${CRM}/settings/quotas`, { waitUntil: "networkidle2" });
    await type(page, `crm-quota-target-USER-${m.users.staff}`, "500000");
    await click(page, "crm-quota-save"); await new Promise((r) => setTimeout(r, 3000));
    const r = await adoptNew("CrmQuota", t0);
    const q1 = await sql(`SELECT "ownerType"::text AS t, "ownerId" FROM "CrmQuota" WHERE id = ANY($1)`, [r]);
    must(r.length === 1 && q1[0].ownerId === m.users.staff, "one quota row for the temp staff user"); rec.db = q1[0];
  }, { optional: true });
  await runStep("S24", "manager", async (page, rec) => {
    const t0 = nowIso(); touch("crm.assignment");
    await page.goto(`${C.BASE}${CRM}/settings/assignment`, { waitUntil: "networkidle2" });
    await click(page, "crm-assign-rule-new"); await type(page, "crm-assign-rule-name", "qc-prod-กฎแจกลีดทดสอบ");
    await click(page, `crm-assign-rule-user-${m.users.staff}`);
    await click(page, "crm-assign-rule-save"); await new Promise((r) => setTimeout(r, 3000));
    const r = await adoptNew("CrmAssignmentRule", t0);
    must(r.length === 1, "one assignment rule created");
    await page.reload({ waitUntil: "networkidle2" });
    await click(page, `crm-assign-rule-toggle-${r[0]}`); await new Promise((x) => setTimeout(x, 2500));
    const a = await one(`SELECT active, name FROM "CrmAssignmentRule" WHERE id = $1`, [r[0]]);
    must(a.active === false && a.name.startsWith(C.MARK), "rule switched OFF right after creation (no real lead can be routed to a temp user)"); rec.db = a;
  }, { optional: true });
  await runStep("S25", "manager", async (page, rec) => {
    const t0 = nowIso(); touch("crm.scoring");
    await page.goto(`${C.BASE}${CRM}/settings/scoring`, { waitUntil: "networkidle2" });
    await click(page, "crm-score-rule-new"); await type(page, "crm-score-rule-name", "qc-prod-กฎคะแนนทดสอบ"); await type(page, "crm-score-rule-points", "1");
    if (await page.$eval(tid("crm-score-rule-active"), (el) => el.checked)) await click(page, "crm-score-rule-active");
    await click(page, "crm-score-rule-save"); await new Promise((r) => setTimeout(r, 3000));
    const r = await adoptNew("CrmScoreRule", t0);
    const a = await sql(`SELECT name, active, points, "isSystem" FROM "CrmScoreRule" WHERE id = ANY($1)`, [r]);
    must(a.length >= 1 && a.some((x) => x.name.startsWith(C.MARK) && x.active === false), "inactive qc-prod- score rule exists"); rec.db = a;
    const logs = await one(`SELECT count(*)::int AS n FROM "CrmScoreLog" WHERE "tenantId" = $1`, [T]); rec.scoreLogs = logs.n;
  }, { optional: true });
  await runStep("S26", "staff", async (page, rec) => {
    await page.goto(`${C.BASE}${CRM}/contacts?q=qc-prod`, { waitUntil: "networkidle2" });
    await click(page, "crm-view-save-open"); await type(page, "crm-view-name", "qc-prod-มุมมองทดสอบ"); await click(page, "crm-view-save"); await new Promise((r) => setTimeout(r, 3000));
    const r = await sql(`SELECT id, "ownerUserId" FROM "MemberSavedView" WHERE "tenantId" = $1 AND "systemId" = $2 AND name LIKE $3`, [T, SYS, `${C.MARK}%`]);
    must(r.length === 1 && r[0].ownerUserId === m.users.staff, "one private saved view of the staff user"); manifestAdd(m, "MemberSavedView", r[0].id, { phase: "walk" }); rec.db = r[0];
  }, { optional: true });
  console.log(`\nscenario done. next: --stage portal-on, then node scripts/pending/c6/prod-walk-setup.cjs --stage portal --company ${ids.company} --contact ${ids.contactA}   (dry-run, then --apply)`);
}

async function pagesStage(after) {
  const dyn = [];
  if (after && m.story) {
    const s = m.story;
    dyn.push(["deal-360-won", `${CRM}/deals/${s.deal1}`, "/deals/[dealId]"], ["deal-360-lost", `${CRM}/deals/${s.deal2}`, "/deals/[dealId]"], ["deal-360-company", `${CRM}/deals/${s.deal3}`, "/deals/[dealId]"],
      ["contact-360-lead", `${CRM}/contacts/${s.contactB}`, "/contacts/[contactId]"], ["contact-360-buyer", `${CRM}/contacts/${s.contactA}`, "/contacts/[contactId]"], ["company-360", `${CRM}/companies/${s.company}`, "/companies/[companyId]"]);
  }
  for (const role of ROLES) for (const vp of VIEWPORTS) {
    const s = await sessionPage(role, vp);
    try {
      for (const [key, path, regPage] of STATIC_PAGES) {
        if (key === "settings-email") { if (role === "owner") { result.pages.push({ role, vp: vp.key, key, skipped: "controller decision 5: owner does not open /settings/email" }); continue; } touch("crm.email"); }
        await visit(s, role, vp, key, path, regPage, expectOf(key, regPage, role));
      }
      for (const [key, path, regPage] of dyn) await visit(s, role, vp, key, path, regPage, "data"); // status judged by the S12 matrix
    } finally { await s.ctx.close().catch(() => {}); }
    await checkSideEffects(`pages ${role}/${vp.key}`);
  }
}

async function portalSwitch(on) {
  touch("crm.portal");
  await step("S14", "owner", async (page, rec) => {
    await page.goto(`${C.BASE}${CRM}/settings/portal`, { waitUntil: "networkidle2" });
    const cur = await page.$eval(tid("crm-portal-settings-enabled"), (el) => (el.checked ?? el.getAttribute("aria-checked") === "true"));
    if (cur !== on) await click(page, "crm-portal-settings-enabled");
    await click(page, "crm-portal-settings-save"); await new Promise((r) => setTimeout(r, 3000));
    const r = await one(`SELECT settings->'crm'->'portal'->>'enabled' AS enabled, settings->'crm'->'portal'->>'issueBoardId' AS board FROM "AppSystem" WHERE id = $1`, [SYS]);
    must(r.enabled === String(on) && !r.board, `portal enabled = ${on}, no issue board`); rec.db = r;
    m.portalWindow = { ...(m.portalWindow ?? {}), [on ? "on" : "off"]: nowIso() }; writeManifest(m);
    console.log(`  portal ${on ? "ON" : "OFF"} at ${nowIso()}`);
  });
}

async function portalStage() {
  for (const vp of VIEWPORTS) {
    const s = await sessionPage("customer", vp);
    try {
      for (const [key, path, regPage] of PORTAL_PAGES) await visit(s, "customer", vp, key, path, regPage, "200");
      const app = await s.page.goto(`${C.BASE}${CRM}/contacts`, { waitUntil: "domcontentloaded" });
      const where = new URL(s.page.url()).pathname;
      result.steps.push({ code: "S14", role: "customer", vp: vp.key, appStatus: app.status(), landed: where, ok: where === "/login" }); save();
      if (where !== "/login") finding(`customer session reached ${where} when opening a staff page (expected redirect to /login)`);
    } finally { await s.ctx.close().catch(() => {}); }
  }
  await checkSideEffects("portal");
}

let code = 0;
try {
  console.log(`prod-walk-run · stage ${STAGE} · ${C.BASE} · tenant ${C.TENANT_SLUG} · system ${SYS} · temp memberships ${g0.tempMemberships} · ${nowIso()}`);
  if (STAGE === "pages") await pagesStage(false);
  else if (STAGE === "scenario") await scenario();
  else if (STAGE === "pages-after") await pagesStage(true);
  else if (STAGE === "portal-on") await portalSwitch(true);
  else if (STAGE === "portal-off") await portalSwitch(false);
  else if (STAGE === "portal") { try { await portalStage(); } finally { await portalSwitch(false).catch((e) => { finding(`PORTAL STILL ON — switch-off failed: ${String(e.message).slice(0, 160)}`); }); } }
  else throw new Error(`unknown stage ${STAGE}`);
  await checkSideEffects("end of stage");
} catch (e) {
  code = e instanceof Abort ? 4 : 1;
  result.aborted = String(e.message);
  console.error(`\n${e instanceof Abort ? "ABORT" : "ERR"}: ${e.message}\n→ stop here, run prod-walk-cleanup (dry-run first), report.`);
} finally {
  result.finishedAt = nowIso(); result.sideEffectsStart = SE0; save();
  await browser.close().catch(() => {});
  reqLog.end();
  for (const d of [profile, `/tmp/snap-private-tmp/snap.chromium${profile}`]) fs.rmSync(d, { recursive: true, force: true }); // chromium profiles filled the disk once (memory: reference_snap_chromium_headless)
  await db.end().catch(() => {});
  console.log(`\nresult → ${RESULT} · pages ${result.pages.length} · steps ${result.steps.length} · findings ${result.findings.length} · shots ${SHOTS}`);
}
process.exit(code);
