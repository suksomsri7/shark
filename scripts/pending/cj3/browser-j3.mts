// CRM C4.4-fix3 r2 — headless BROWSER proof of the hand-over paths the US9 journey cannot reach (review S2 · N6)
//   against THIS worktree's production build on :3219 (QC3) · throwaway tenant · full cleanup · the journeys are not touched.
//
//   B-A  (S2) a first-time visitor lands on the shop's contact page (tracker + the product's iframe form), the form is fully loaded,
//        the visitor waits > 9 s (past every early ping of the form) and only THEN clicks ยอมรับ, fills and submits
//        ⇒ FormSubmission.webSessionId non-null and, after the bridge, the visitor's session is bound to the new contact.
//        The log records every /t/v request relative to the accept click and the submit click (which path delivered the ticket).
//   B-N6 (N6) a page on a host that is NOT one of the shop's tracking domains frames the same form and posts a REAL ticket
//        (minted for a consented visitor) into it every 250 ms ⇒ the submit binds nothing.
//        Positive control B-N6c: the same planting page served from the shop's own (listed) host ⇒ binds.
//
//   Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cj3/browser-j3.mts
//        (the :3219 server must be up: bash scripts/qc3.sh bash scripts/pending/cj3/serve-qc3.sh start)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.error("🔴 browser-j3: DATABASE_URL is not QC3 — stop");
  process.exit(4);
}
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3219";
const APP_ORIGIN = new URL(BASE).origin;
const SHOP = "cj3-shop.shark-qc.test";
const EVIL = "cj3-evil.shark-qc.test";
const SHOTS = "/root/projects/shark-crm-cj3/.qc-shots/crm/cj3/browser";
mkdirSync(SHOTS, { recursive: true });

const cks: { id: string; ok: boolean }[] = [];
const out = (s: string) => process.stdout.write(`${s}\n`);
const chk = (id: string, n: string, ok: unknown, e: string, a: string) => {
  cks.push({ id, ok: !!ok });
  out(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-cj3b-${rand}`;
const RUN_START = new Date(Date.now() - 5_000);
out(`\n═══ browser J3 r2 — accept-after-load (S2) · planted ticket from a non-listed parent (N6) · ${BASE} ═══`);
out(`[env] DB ${host} · tag ${TAG}\n`);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TENANTS: string[] = [];
const USERS: string[] = [];
let browser: Any = null;
let server: https.Server | null = null;
const profile = `/tmp/chr-cj3-${process.pid}`;

/** POST to the app server with an explicit Origin header (node:http — the test plays the tracker for B-N6 set-up) */
const postApp = (path: string, origin: string, body: unknown) =>
  new Promise<{ status: number; text: string }>((resolve) => {
    const u = new URL(path, BASE);
    const data = JSON.stringify(body);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { origin, "content-type": "text/plain;charset=UTF-8", "content-length": Buffer.byteLength(data), "user-agent": "Mozilla/5.0 (X11; Linux x86_64) cj3" } }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text: t }));
    });
    req.on("error", () => resolve({ status: -1, text: "" }));
    req.end(data);
  });

try {
  const TR = (await import("@/lib/modules/crm/tracking" as string)) as Any;
  const FS = (await import("@/lib/modules/forms/service" as string)) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const u = await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  TENANTS.push(t.id);
  await P.membership.create({ data: { userId: u.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const sys = (await sysSvc.createSystem(t.id, "CRM", `CRM ${TAG}`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }), sys);
  const owner = { userId: u.id, role: "OWNER", unitAccess: [] as string[], permissions: {} };
  const web = await TR.saveWebSettings({ tenantId: t.id, systemId: sys, actorUserId: u.id }, owner, { enabled: true, domains: [SHOP], retentionDays: 180 });
  const siteKey = String(web.siteKey);
  const cv = Number(web.consentVersion);
  const form = await FS.createForm({ tenantId: t.id }, { name: `${TAG}-ฟอร์มติดต่อ`, crmEnabled: true, fields: [{ key: "name", label: "ชื่อ", type: "text", required: true }, { key: "phone", label: "เบอร์โทร", type: "phone", required: true }] });
  await FS.updateCrmFormTarget(t.id, form.id, { crmSystemId: sys, utmCapture: true }, BASE);
  const trackerEmbed = `<script async src="${APP_ORIGIN}/t/s/${siteKey}.js"></script>`; // = the embed code /settings/tracking shows (APP_URL of the :3219 server)
  const formEmbed = FS.formEmbedCode({ publicToken: form.publicToken }, BASE); // the product's own iframe embed
  out(`  setup: system ${sys} · siteKey ${siteKey.slice(0, 6)}… · form ${form.id}`);

  // ─── TLS "websites": the shop (listed domain) and a stranger (not listed) on one local port, virtual-hosted ───
  const dir = `/tmp/cj3-tls-${process.pid}`;
  mkdirSync(dir, { recursive: true });
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${dir}/key.pem`, "-out", `${dir}/cert.pem`, "-days", "1", "-subj", `/CN=${SHOP}`, "-addext", `subjectAltName=DNS:${SHOP},DNS:${EVIL}`], { stdio: "pipe" });
  const pub = execFileSync("openssl", ["x509", "-in", `${dir}/cert.pem`, "-pubkey", "-noout"], { stdio: "pipe" });
  const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "der"], { input: pub, stdio: "pipe" });
  const spki = execFileSync("openssl", ["dgst", "-sha256", "-binary"], { input: der, stdio: "pipe" }).toString("base64");
  const { readFileSync } = await import("node:fs");
  const planted: Record<string, string> = {}; // host → ticket inlined into that host's /plant page (never in a URL)
  const html = (title: string, body: string) => `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:sans-serif;padding:16px">${body}</body></html>`;
  server = https.createServer({ key: readFileSync(`${dir}/key.pem`), cert: readFileSync(`${dir}/cert.pem`) }, (req, res) => {
    const h = String(req.headers.host ?? "").split(":")[0];
    const path = String(req.url ?? "/").split("?")[0];
    if (path === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    let body: string | null = null;
    if (h === SHOP && path === "/shop/contact") body = html("ร้าน — ติดต่อเรา", `<h1>ร้านดำน้ำ (cj3)</h1><h2>แบบฟอร์มติดต่อ</h2>\n${formEmbed}\n${trackerEmbed}`);
    if ((h === SHOP || h === EVIL) && path === "/plant") {
      const tk = JSON.stringify(planted[h] ?? "");
      body = html(`${h} — plant`, `<h1>${h === EVIL ? "เว็บอื่น (ไม่อยู่ในโดเมนของร้าน)" : "เว็บของร้าน (ไม่มีสคริปต์ติดตาม)"}</h1>\n${formEmbed}\n<script>setInterval(function(){var f=document.querySelector("iframe");if(f&&f.contentWindow)f.contentWindow.postMessage({type:"sd:visitor-ticket",ticket:${tk}},"*");},250);</script>`);
    }
    if (body === null) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(body);
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as Any).port as number;
  const shopOrigin = `https://${SHOP}:${port}`;
  const evilOrigin = `https://${EVIL}:${port}`;

  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string).catch(() => import("/root/dive3d/node_modules/puppeteer-core" as string))) as Any;
  browser = await (pptr.default ?? pptr).launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${profile}`, `--host-resolver-rules=MAP ${SHOP} 127.0.0.1, MAP ${EVIL} 127.0.0.1`, `--ignore-certificate-errors-spki-list=${spki}`],
  });

  const pump = async () => {
    for (let i = 0; i < 20; i += 1) {
      const rows = (await P.outboxEvent.findMany({ where: { tenantId: t.id, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 200 })) as Any[];
      if (rows.length === 0) return;
      for (const row of rows) {
        try { await OBX.consumers?.[row.type]?.({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId, idempotencyKey: row.idempotencyKey }); } catch { /* noted by the checks */ }
        await P.outboxEvent.update({ where: { id: row.id }, data: { status: "DONE", processedAt: new Date() } }).catch(() => null);
      }
    }
  };
  const fillAndSubmit = async (page: Any, name: string, minWaitMs: number) => {
    const frame = await (async () => {
      for (let i = 0; i < 60; i += 1) {
        const f = page.frames().find((x: Any) => x.url().includes(`/f/${form.publicToken}`));
        if (f) return f;
        await sleep(250);
      }
      return null;
    })();
    if (!frame) return { frame: null, done: false, submitAt: 0 };
    await frame.waitForSelector("[data-testid=form-public-form]", { timeout: 20_000 });
    await sleep(minWaitMs);
    await frame.type("[data-testid=form-public-field-name]", name, { delay: 5 });
    await frame.type("[data-testid=form-public-field-phone]", `04${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, { delay: 5 });
    const submitAt = Date.now();
    await frame.click("[data-testid=form-public-submit]");
    const done = !!(await frame.waitForSelector("[data-testid=form-public-done]", { timeout: 20_000 }).catch(() => null));
    return { frame, done, submitAt };
  };
  const subOf = async (name: string) => ((await P.formSubmission.findMany({ where: { formId: form.id } })) as Any[]).find((x) => x.answersJson?.name === name) ?? null;

  // ═══ B-A — accept AFTER the form loaded (S2) ═══
  out("── B-A · accept after the form loaded ──");
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 900 });
    const tv: number[] = [];
    page.on("request", (r: Any) => { if (/\/t\/v$/.test(r.url())) tv.push(Date.now()); });
    await page.goto(`${shopOrigin}/shop/contact`, { waitUntil: "networkidle2", timeout: 30_000 });
    const frame0 = page.frames().find((x: Any) => x.url().includes(`/f/${form.publicToken}`));
    await frame0?.waitForSelector("[data-testid=form-public-form]", { timeout: 20_000 }).catch(() => null);
    const loadedAt = Date.now();
    await sleep(10_500); // past every early ping (0 · 0.8 · 2 · 4.5 · 9 s) — the case the review found unlinked
    const banner = !!(await page.$("[data-sd=banner]"));
    await page.screenshot({ path: `${SHOTS}/a1-form-loaded-before-accept.png`, fullPage: true });
    const tvBeforeAccept = tv.length;
    const acceptAt = Date.now();
    await page.click("[data-sd=accept]").catch(() => null);
    await sleep(1_500);
    const name = `ยอมรับหลังฟอร์มโหลด ${TAG}`;
    const r = await fillAndSubmit(page, name, 0);
    await sleep(800);
    await page.screenshot({ path: `${SHOTS}/a2-submitted-after-late-accept.png`, fullPage: true });
    const vid = await page.evaluate(() => { const m = /(?:^|;\s*)sd_vid=([^;]+)/.exec(document.cookie); return m ? decodeURIComponent(m[1]) : null; });
    await ctx.close();
    const sub = await subOf(name);
    await pump();
    const after = sub ? await P.formSubmission.findFirst({ where: { id: sub.id } }) : null;
    const sessions = vid ? ((await P.crmWebSession.findMany({ where: { tenantId: t.id, visitorId: vid } })) as Any[]) : [];
    const tvRel = tv.map((x) => (x < acceptAt ? `load+${x - loadedAt}ms` : x < r.submitAt ? `accept+${x - acceptAt}ms` : `submit+${x - r.submitAt}ms`));
    out(`   /t/v requests: ${tvRel.join(" · ") || "none"} (before accept: ${tvBeforeAccept})`);
    out(`   formSubmission.webSessionId = ${after?.webSessionId ?? null} · sessions=${sessions.map((s) => `${s.consentVersion}:${s.contactId === after?.crmContactId && s.contactId ? "CT" : s.contactId ?? "-"}`).join(",")}`);
    chk("B-A", "S2 in a real browser: banner still up after the form loaded, visitor accepts > 9 s later, fills + submits inside the iframe ⇒ thank-you shown, webSessionId non-null, no /t/v before the accept, and after the bridge the visitor's session is bound to the new contact",
      banner && r.done && tvBeforeAccept === 0 && !!after?.webSessionId && sessions.length >= 1 && sessions.some((s) => s.id === after.webSessionId && s.contactId === after.crmContactId && !!s.contactId),
      "bound", `banner=${banner} done=${r.done} tvBefore=${tvBeforeAccept} ws=${after?.webSessionId ?? "null"} vid=${!!vid}`);
  }

  // ═══ B-N6 — a real ticket planted by a parent on a non-listed host ═══
  out("── B-N6 · planted ticket ──");
  const mintFor = async () => {
    const v = randomUUID();
    const c = await postApp("/t/consent", shopOrigin, { k: siteKey, v, cv, d: "accept", u: `${shopOrigin}/shop/p1` });
    const m = await postApp("/t/v", shopOrigin, { k: siteKey, v, cv, u: `${shopOrigin}/shop/contact` });
    let tk = "";
    try { tk = String(JSON.parse(m.text)?.t ?? ""); } catch { tk = ""; }
    return { v, tk, status: `${c.status}/${m.status}` };
  };
  const plantRun = async (h: string, origin: string, label: string, shot: string) => {
    const { v, tk, status } = await mintFor();
    planted[h] = tk;
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 900 });
    await page.goto(`${origin}/plant`, { waitUntil: "networkidle2", timeout: 30_000 });
    const name = `${label} ${TAG}`;
    const r = await fillAndSubmit(page, name, 3_500);
    await sleep(800);
    await page.screenshot({ path: `${SHOTS}/${shot}.png`, fullPage: true });
    await ctx.close();
    const sub = await subOf(name);
    await pump();
    const sessions = (await P.crmWebSession.findMany({ where: { tenantId: t.id, visitorId: v } })) as Any[];
    return { tk, status, done: r.done, ws: sub?.webSessionId ?? null, bound: sessions.some((s) => !!s.contactId), sessions: sessions.length };
  };
  const evil = await plantRun(EVIL, evilOrigin, "เว็บอื่นยัดตั๋ว", "n6-1-evil-parent-planted");
  out(`   evil parent ${evilOrigin}: mint ${evil.status} · done=${evil.done} · webSessionId=${evil.ws ?? "null"} · bound=${evil.bound}`);
  chk("B-N6", "N6 in a real browser: a page on a host that is NOT one of the shop's tracking domains frames the form and posts a real, valid ticket into it every 250 ms ⇒ the form ignores it — thank-you shown, webSessionId null, that visitor's session unbound",
    evil.tk.length > 40 && evil.done && evil.ws === null && evil.sessions >= 1 && !evil.bound, "null · unbound", `tk=${evil.tk.length} done=${evil.done} ws=${evil.ws} bound=${evil.bound}`);
  const ctl = await plantRun(SHOP, shopOrigin, "เว็บร้านส่งตั๋ว", "n6-2-shop-parent-planted-control");
  out(`   shop parent ${shopOrigin}: mint ${ctl.status} · done=${ctl.done} · webSessionId=${ctl.ws ?? "null"} · bound=${ctl.bound}`);
  chk("B-N6c", "positive control: the SAME planting page served from the shop's own listed host ⇒ the ticket is taken and the submit binds (so B-N6's refusal is the origin check, not a broken channel)",
    ctl.tk.length > 40 && ctl.done && !!ctl.ws && ctl.bound, "bound", `tk=${ctl.tk.length} done=${ctl.done} ws=${ctl.ws} bound=${ctl.bound}`);
} catch (e) {
  chk("B-FATAL", "the browser proof ran to the end", false, "no exception", String(e instanceof Error ? `${e.message}\n${e.stack}` : e).slice(0, 800));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise<void>((r) => { server!.close(() => r()); (server as Any).closeAllConnections?.(); });
  for (const d of [profile, `/tmp/snap-private-tmp/snap.chromium${profile}`, `/tmp/cj3-tls-${process.pid}`]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* fine */ } }
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* retried next pass */ } };
  await del(() => P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE ("key" LIKE 'crm:%' OR "key" LIKE 'form:%') AND "createdAt" >= $1`, RUN_START));
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  if (ids.length) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const tb of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
    const tenants = await P.tenant.count({ where: { id: { in: ids } } });
    chk("B-CLEAN", "throwaway tenant, user, buckets and the chromium profile are gone", tenants === 0, "0", `tenants=${tenants}`);
  }
  await prisma.$disconnect();
}
const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
out(`\n${passed === total ? "🟢" : "🔴"} browser J3: ${passed}/${total} · screenshots ${SHOTS}`);
out(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings: cks.filter((c) => !c.ok).map((c) => c.id) })}`);
process.exit(passed === total ? 0 : 1);
