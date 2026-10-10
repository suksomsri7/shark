// @ts-nocheck — temporary lane repro (Job C1 · prod walk finding "deal created, no redirect / possible duplicate")
// run: run-iso.sh <log> pnpm exec tsx scripts/pending/parityfix/repro-deal-new.mts <label> [latencyMs=0]
// QC1 only. Creates deals titled "qc-pf-c1 …" as thana, then restores the tenant with scripts/lib/qc-crm-restore.mts (same path as qc-crm-forms).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
const env = await import("../../acc-v2-env.mts");
const { host } = env.loadQcEnv();
if (!host.includes("ep-plain-art")) throw new Error("not QC1");
const { prisma } = await import("@/lib/core/db");
const PrismaNS = (await import("@prisma/client")).Prisma;
const E = JSON.parse(readFileSync("scripts/crm-expected.json", "utf8"));
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const LABEL = process.argv[2] ?? "run";
const LAT = Number(process.argv[3] ?? 0);
const OUT = "/tmp/crm-parityfix/c1"; mkdirSync(OUT, { recursive: true });
const SYS = E.systemId; const TENANT = E.tenantId; const UID = E.users.thana.userId;
const TAG = `qc-pf-c1 ${LABEL} ${Date.now().toString(36)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RM = await import("../../lib/qc-crm-restore.mts");
const R = RM.createRestorer({ prisma, Prisma: PrismaNS, tenantId: TENANT, appendOnlyExtra: ["ApiIdempotency", "OpsEvent", "WebhookDelivery"], log: () => {} });
const snap = await R.takeSnapshot();
console.log(`snapshot ${snap.tables} tables ${snap.rows} rows · BASE ${BASE} · latency ${LAT} ms · tag "${TAG}"`);
const contact = await prisma.crmContact.findFirst({ where: { tenantId: TENANT, systemId: SYS, ownerUserId: UID, archivedAt: null, mergedIntoId: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
if (!contact) throw new Error("no contact owned by thana");
const token = "crmpf" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 30 * 60 * 1000);
const srow = await prisma.session.create({ data: { userId: UID, tokenHash: createHash("sha256").update(token).digest("hex"), userAgent: "qc-visual-crm parityfix-c1", idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
R.protect(srow.id);
const hostName = new URL(BASE).hostname;
const cookies = [{ name: "shark_session", value: token, domain: hostName, path: "/" }, { name: "shark_tenant", value: TENANT, domain: hostName, path: "/" }];
const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js");
const udd = `/tmp/chr-crm-pfc1-${process.pid}`;
const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${udd}`] });
const results = [];
const COLLECT = `(() => { const t0 = performance.now(); window.__s = []; const b = document.querySelector('[data-testid=deal-new-submit]'); let last = '';
  window.__iv = setInterval(() => { const x = document.querySelector('[data-testid=deal-new-submit]'); const st = (x ? (x.disabled ? 'D' : 'E') + ':' + x.textContent.trim() : 'gone') + '|' + location.pathname.split('/').slice(-2).join('/'); if (st !== last) { last = st; window.__s.push([Math.round(performance.now() - t0), st]); } }, 15); })()`;
// scenario = { name, search: text|null, gapMs: wait between typing and submit, typeAfter: keep typing after click, second: try a 2nd click when the button is enabled again }
async function scenario(sc) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCookie(...cookies);
  const posts = []; const t00 = Date.now();
  page.on("request", (r) => { if (r.method() === "POST") posts.push({ t: Date.now() - t00, ev: "req", act: (r.headers()["next-action"] ?? "").slice(0, 8) }); });
  page.on("response", (r) => { if (r.request().method() === "POST") posts.push({ t: Date.now() - t00, ev: "res", act: (r.request().headers()["next-action"] ?? "").slice(0, 8), st: r.status() }); });
  const errs = []; page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160))); page.on("console", (m) => { if (m.type() === "error") errs.push(String(m.text()).slice(0, 160)); });
  if (LAT > 0) { const cdp = await page.createCDPSession(); await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: LAT, downloadThroughput: -1, uploadThroughput: -1 }); }
  await page.goto(`${BASE}/app/sys/${SYS}/crm/deals/new?contactId=${contact.id}`, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.waitForSelector("[data-testid=deal-new-form]", { timeout: 20_000 });
  await sleep(1500); // hydration + initial contact search / companies actions settle
  const title = `${TAG} ${sc.name}`;
  await page.type("[data-testid=deal-new-title]", title, { delay: 5 });
  const selBefore = await page.$eval("[data-testid=deal-new-contact]", (e) => e.value);
  if (sc.search !== null) { await page.type("[data-testid=deal-new-contact-q]", sc.search, { delay: 20 }); if (sc.gapMs) await sleep(sc.gapMs); }
  const selAtSubmit = await page.$eval("[data-testid=deal-new-contact]", (e) => e.value);
  await page.evaluate(COLLECT);
  const tClick = Date.now(); posts.push({ t: tClick - t00, ev: "CLICK" });
  await page.click("[data-testid=deal-new-submit]");
  if (sc.typeAfter) { await page.type("[data-testid=deal-new-contact-q]", sc.typeAfter, { delay: 60 }).catch(() => {}); }
  let secondClicks = 0;
  if (sc.second) {
    // an impatient user: click again every time the button is enabled while we are still on /deals/new (up to 3 extra clicks)
    const until = Date.now() + 20_000;
    while (Date.now() < until && secondClicks < 3) {
      const st = await page.evaluate(`(() => { const x = document.querySelector('[data-testid=deal-new-submit]'); return location.pathname.endsWith('/deals/new') && x ? (x.disabled ? 'D' : 'E') : 'gone'; })()`).catch(() => "nav");
      if (st === "gone" || st === "nav") break;
      if (st === "E" && Date.now() - tClick > 60) { await page.click("[data-testid=deal-new-submit]").catch(() => {}); secondClicks++; posts.push({ t: Date.now() - t00, ev: "CLICK2" }); await sleep(40); } else await sleep(10);
    }
  }
  let navMs = null;
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) { const p = new URL(page.url()).pathname; if (/\/crm\/deals\/(?!new)[^/]+$/.test(p)) { navMs = Date.now() - tClick; break; } await sleep(50); }
  await sleep(1500);
  const samples = await page.evaluate("window.__s || []").catch(() => []);
  const errorBox = await page.$eval("[data-testid=deal-new-error]", (e) => e.textContent).catch(() => null);
  const fieldErr = await page.$$eval("[data-testid$=-error]", (els) => els.map((e) => e.getAttribute("data-testid") + ":" + e.textContent)).catch(() => []);
  const rows = await prisma.crmDeal.count({ where: { tenantId: TENANT, systemId: SYS, title } });
  if (navMs === null) await page.screenshot({ path: `${OUT}/${LABEL}-${sc.name}-stuck.png` });
  const r = { name: sc.name, navMs, rows, secondClicks, selBefore, selAtSubmit, finalUrl: new URL(page.url()).pathname.split("/").slice(-2).join("/"), errorBox, fieldErr, samples, posts: posts.filter((p) => p.t >= tClick - t00 - 3000), errs };
  results.push(r);
  console.log(`\n[${sc.name}] nav=${navMs === null ? "NONE in 40 s" : navMs + " ms"} · deal rows=${rows} · extraClicks=${secondClicks} · contact select before/at-submit=${selBefore ? "set" : "EMPTY"}/${selAtSubmit ? "set" : "EMPTY"} · final=${r.finalUrl} · errBox=${errorBox} · fieldErr=${JSON.stringify(fieldErr)}`);
  console.log(`   button timeline (ms since click): ${samples.map((s) => `${s[0]}:${s[1]}`).join("  →  ")}`);
  console.log(`   POSTs: ${r.posts.map((p) => `${p.t - (tClick - t00)}:${p.ev}${p.act ? "(" + p.act + ")" : ""}${p.st ? "=" + p.st : ""}`).join(" ")}`);
  if (errs.length) console.log(`   console: ${errs.slice(0, 4).join(" | ")}`);
  await page.close();
}
try {
  const q = contact.name.slice(0, 3);
  await scenario({ name: "S0-control", search: null });
  await scenario({ name: "S1-search-settled", search: q, gapMs: 2500 });
  await scenario({ name: "S2-search-then-submit-now", search: q, gapMs: 0 });
  await scenario({ name: "S3-search-inflight", search: q, gapMs: 300 });
  await scenario({ name: "S4-typing-while-saving", search: q, gapMs: 0, typeAfter: "xyz" });
  await scenario({ name: "S5-search-nomatch", search: "zzzzqq", gapMs: 2500 });
  await scenario({ name: "S6-impatient-clicks", search: null, second: true });
  await scenario({ name: "S7-search+impatient", search: q, gapMs: 0, second: true });
} finally {
  await browser.close().catch(() => {});
  rmSync(udd, { recursive: true, force: true });
  writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify(results, null, 1));
  await sleep(1500);
  R.unprotect(srow.id);
  await prisma.session.deleteMany({ where: { id: srow.id } });
  const st = await R.restoreSnapshot("c1-repro");
  const purged = await R.purgeAppendOnlySince();
  const v = await R.verify();
  const left = await prisma.crmDeal.count({ where: { tenantId: TENANT, title: { startsWith: "qc-pf-c1" } } });
  console.log(`\nRESTORE deleted=${st.deleted} updated=${st.updated} recreated=${st.recreated} failed=${st.failed.length} · purged=${JSON.stringify(purged)} · verify identical=${v.identical} changed=${v.changed.length} missing=${v.missing.length} extra=${v.extra.length} leftovers=${JSON.stringify(v.leftoversSince)} · tagged deals left=${left}`);
  await prisma.$disconnect();
}
console.log("\nSUMMARY " + JSON.stringify(results.map((r) => ({ s: r.name, navMs: r.navMs, rows: r.rows, extraClicks: r.secondClicks }))));
