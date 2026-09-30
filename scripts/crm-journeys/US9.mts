// US9 — docs/modules/20-crm-v2.md §1.4: `tracking.web.enabled` on → the shop's site loads `shark.js` → a cookie
// consent banner appears → visitor accepts → visits 3 pages → fills a form → all 3 page views retroactively bind to
// the resulting contact · a visitor who declines gets nothing recorded.
//
// ROUND 4 — why the old runner could never record a page view (controller diagnosis 2, verified + extended):
//   • the event/consent endpoints accept a beacon only if its Origin is **https** AND its host is one of the shop's
//     tracking domains (`originAllowed`, tracking-shared.ts:161-176 → tracking.ts:626/756), and the page URL `u` must
//     be on those domains too (`urlHostAllowed`, tracking.ts:628/761);
//   • a tracking domain must be a dotted hostname — `normalizeDomain` (tracking-shared.ts:146-156) rejects IPs,
//     ports and `localhost`, so the settings page can never accept the QC host `127.0.0.1` (US9-1b records this).
//   ⇒ a tracker running on the plain-http QC origin (the old `/b/<slug>/login` + injected script) is dropped by design,
//     whatever the domain list says. That is correct production behaviour (X7), not a product bug.
// DECISION-US9-1 (ROUND 5 — replaces round 4's same-host shim, reviewer R4-B1): the shop has its own website
//   https://<SHOP_HOST>:<port> (lib.mts SHOP_HOST, reserved `.test`, resolved to loopback only in this harness's
//   browser; its key/cert is generated at launch and SPKI-pinned — lib.mts launchBrowser, R4-S4). A local TLS server
//   (SETUP, test infrastructure) serves ONLY the shop's own pages — /shop/p1..p3 and /shop/contact — each with the
//   EXACT tracker embed code from /settings/tracking; /shop/contact also carries the EXACT form embed code from
//   /settings/forms (`crm-forms-embed-<formId>` = `<iframe src="<APP_URL>/f/<token>">`, forms/service.ts:390-394).
//   Nothing is forwarded: the form loads from the QC origin in an iframe, exactly as in production. Round 4 forwarded
//   /f/ onto the shop host, which let the shop's host-only `sd_vid` cookie reach the form action — a topology the
//   product doesn't offer (false green, R4-B1).
// IDENTIFY-TICKET MAP (for the product-fix lane, ROUND 5):
//   exists  · emailClickTicket (tracking.ts:158) → appendIdentifyTicket (tracking.ts:210, only if the target is on the
//             shop's domains) — sole caller ticketedClickUrl (tracking.ts:1380-1417) ← /t/c e-mail clicks
//           · tracker reads ?sd_ct from location.search and sends t:"identify" (tracking.ts:1522-1537) → collect()
//             (tracking.ts:870-877) → readIdentifyTicket + consumeIdentifyTicket (one-shot) → identify(by EMAIL_CLICK)
//           · form path: f/[token]/actions.ts:19-25 reads sd_vid ONLY from the form request's own cookies (caller-
//             supplied ids deliberately dropped, :9-12) → forms/service.ts:370-371 submissionWebSessionId →
//             crm-bridges/forms.ts:190-197 identify(by FORM)
//   missing · the tracker never decorates links or iframes (no querySelectorAll/iframe handling in trackerScript);
//           · no signed ticket for FORM: nothing hands the visitor id (or a ticket) to the /f/ iframe or link;
//           · IDENTIFY_BY "PORTAL" and "LINK" (tracking-shared.ts:70) have no producer anywhere in src/.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lib = (await import("./lib.mts" as string)) as Any;
const { drainQuiet, pollUntil, snapshotSettingsPath, SHOP_HOST } = lib;

type ShopSite = { origin: string; close: () => Promise<void> };

/** SETUP (test infrastructure): the shop's own website — serves ONLY the shop's pages, forwards nothing. */
async function startShopSite(ctx: Any, trackerEmbed: string, formEmbed: string): Promise<ShopSite> {
  const https = await import("node:https");
  const tls = lib.shopTls();
  if (!tls) throw new Error("shop TLS material missing — launchBrowser must be called with { shopSite: true } when US9 is selected (R4-S4)");
  const page = (n: string, extra = "") => `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ร้านดำน้ำตัวอย่าง — ${n}</title>
</head><body style="font-family:sans-serif;padding:16px"><h1>ร้านดำน้ำตัวอย่าง (qc-jrn-us9)</h1><p>หน้า ${n} — แพ็กเกจดำน้ำ</p><p><a href="/shop/contact" data-qc="contact-link">ติดต่อเรา / ขอใบเสนอราคา</a></p>
${extra}
${trackerEmbed}
</body></html>`; // both embed codes pasted verbatim, before </body>, as the settings pages instruct
  const server = https.createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
    const path = String(req.url ?? "/");
    const m = /^\/shop\/(p[0-9]|contact)(?:\?|$)/.exec(path);
    if (path === "/favicon.ico") { res.writeHead(204); res.end(); return; } // the shop has no icon — avoid a noise 404 in the log
    if (!m) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(m[1] === "contact" ? page("ติดต่อเรา", `<h2>แบบฟอร์มติดต่อ</h2>\n${formEmbed}`) : page(m[1]!));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as Any).port as number;
  return {
    origin: `https://${SHOP_HOST}:${port}`,
    close: () => new Promise<void>((r) => { server.close(() => r()); (server as Any).closeAllConnections?.(); }),
  };
}

export async function run(ctx: Any): Promise<void> {
  const { prisma, env } = ctx;
  const P = prisma as any;
  const runTag = `${ctx.tag}-${Date.now().toString(36)}`; // unique utm_content marker for THIS run's visits

  ctx.plan("resolve: owner actor");

  ctx.plan(`SCRIPTED ACTION (real UI, owner): /settings/tracking → enable web tracking · try the QC host 127.0.0.1 as a domain (must be refused inline) · add the shop's own domain ${SHOP_HOST} · read the real embed code`);
  let siteKey: string | null = null;
  let embedCode = "";
  let restoreTrackingSettings: (() => Promise<void>) | null = null;
  let shop: ShopSite | null = null;
  try {
    if (!ctx.dry) {
      restoreTrackingSettings = await snapshotSettingsPath(prisma, env.SYS, ["crm", "tracking"]); // ROUND 3: path-scoped restore, not the whole settings blob
      const page = await ctx.loginStaff("owner");
      await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/settings/tracking`, { waitUntil: "networkidle2", timeout: 30_000 });
      await page.waitForSelector("[data-testid=crm-track-web-enabled]", { timeout: 15_000 });
      const checked = await page.$eval("[data-testid=crm-track-web-enabled]", (el: any) => el.checked ?? el.getAttribute("aria-checked") === "true").catch(() => false);
      if (!checked) await page.click("[data-testid=crm-track-web-enabled]");
      await page.click("[data-testid=crm-track-save]").catch(() => {});
      await new Promise((r) => setTimeout(r, 1_000));
      await ctx.shot(page, "01-tracking-enabled");

      // (a) the QC host itself — what a tester would try first; normalizeDomain refuses IPs (tracking-shared.ts:152)
      await page.click("[data-testid=crm-track-domain-input]", { clickCount: 3 });
      await page.keyboard.type("127.0.0.1", { delay: 5 });
      await page.click("[data-testid=crm-track-domain-add]");
      const ipErr = await page.waitForSelector("[data-testid=crm-track-error]", { timeout: 8_000 }).then(() => page.$eval("[data-testid=crm-track-error]", (el: any) => el.textContent)).catch(() => null);
      await ctx.shot(page, "02-ip-domain-refused");
      const domainsAfterIp = (await P.appSystem.findFirst({ where: { id: env.SYS }, select: { settings: true } }))?.settings?.crm?.tracking?.web?.domains ?? [];
      ctx.check("US9-1b", `the settings UI refuses the plain QC host 127.0.0.1 as a tracking domain with an inline message and stores nothing (X7: IP/port/localhost never allowed) — this is why the oracle needs a real https shop domain; message=${JSON.stringify(ipErr)}`, { inlineError: true, stored: false }, { inlineError: !!ipErr, stored: Array.isArray(domainsAfterIp) && domainsAfterIp.includes("127.0.0.1") });

      // (b) the shop's own domain
      await page.click("[data-testid=crm-track-domain-input]", { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.keyboard.type(SHOP_HOST, { delay: 5 });
      await page.click("[data-testid=crm-track-domain-add]");
      await page.waitForSelector(`[data-testid="crm-track-domain-remove-${SHOP_HOST}"]`, { timeout: 10_000 }).catch(() => ctx.log(`⚠️ domain chip for ${SHOP_HOST} did not appear`));
      await new Promise((r) => setTimeout(r, 800));
      await ctx.shot(page, "03-shop-domain-added");
      embedCode = String((await page.$eval("[data-testid=crm-track-embed-code]", (el: any) => el.value ?? el.textContent).catch(() => "")) ?? "");
      const m = /\/t\/s\/([A-Za-z0-9_-]+)\.js/.exec(embedCode);
      siteKey = m?.[1] ?? null;
      await page.close();
      const web = (await P.appSystem.findFirst({ where: { id: env.SYS }, select: { settings: true } }))?.settings?.crm?.tracking?.web ?? {};
      ctx.check("US9-1", `web tracking enabled, a real siteKey issued, and the shop domain ${SHOP_HOST} saved through the UI`, { enabled: true, siteKey: true, domain: true }, { enabled: web.enabled === true, siteKey: !!siteKey && web.siteKey === siteKey, domain: Array.isArray(web.domains) && web.domains.includes(SHOP_HOST) });
      ctx.log(`   embed code shown to the owner: ${embedCode}`);
    }

    ctx.plan("SETUP (facade, no UI — a plain lead capture form is not this story's action, same as US1): a public lead form targeting this CRM system");
    let publicToken: string | null = null;
    let formId: string | null = null;
    if (!ctx.dry) {
      const formsMod = await import("@/lib/modules/forms/service");
      const form = await formsMod.createForm({ tenantId: env.tenantId }, { name: `${ctx.tag}-ฟอร์มติดต่อ`, crmEnabled: true, fields: [{ key: "name", label: "ชื่อ", type: "text", required: true }, { key: "phone", label: "เบอร์โทร", type: "phone", required: true }] });
      publicToken = form.publicToken;
      formId = form.id;
      ctx.own("formDef", form.id);
      await formsMod.updateCrmFormTarget(env.tenantId, form.id, { crmSystemId: env.SYS, utmCapture: true }, ctx.BASE);
    }

    ctx.plan("SCRIPTED ACTION (real UI, owner): /settings/forms → read the form's embed code exactly as the product gives it to the shop");
    let formEmbed = "";
    if (!ctx.dry && formId) {
      const page = await ctx.loginStaff("owner");
      await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/settings/forms`, { waitUntil: "networkidle2", timeout: 30_000 });
      await page.waitForSelector(`[data-testid="crm-forms-embed-${formId}"]`, { timeout: 15_000 }).catch(() => ctx.log(`⚠️ crm-forms-embed-${formId} not found on /settings/forms`));
      formEmbed = String((await page.$eval(`[data-testid="crm-forms-embed-${formId}"]`, (el: any) => el.value ?? el.textContent).catch(() => "")) ?? "");
      await ctx.shot(page, "03b-form-embed-code");
      await page.close();
      ctx.log(`   form embed code shown to the owner: ${formEmbed}`);
      ctx.check("US9-1c", "the form embed code read from /settings/forms is the product's iframe to this form on the app origin", true, /<iframe[^>]+src="[^"]*\/f\//.test(formEmbed) && formEmbed.includes(`/f/${publicToken}`));
    }

    ctx.plan(`SETUP (test infrastructure, DECISION-US9-1 ROUND 5): the shop's own website https://${SHOP_HOST} — serves only /shop/p1..p3 + /shop/contact with both embed codes verbatim; forwards nothing`);
    if (!ctx.dry && siteKey && formEmbed) {
      shop = await startShopSite(ctx, embedCode, formEmbed);
      ctx.extraAllowedOrigins.add(shop.origin);
      ctx.log(`   shop site at ${shop.origin} (B1 guard: this origin allowed — it serves static shop pages only)`);
    }

    ctx.plan("SCRIPTED ACTION (real UI + real tracker script, anon visitor who ACCEPTS): p1 shows the banner → ยอมรับ; p2, p3 and the contact page each auto-record a real page view (= 3)");
    let acceptVisitorId: string | null = null;
    let us9AcceptWorked = false; // ROUND 3: US9-4 (decline) is only a MEANINGFUL negative control once the accept path records something
    if (!ctx.dry && shop) {
      const page = await ctx.newAnonPage({ isolated: true }); // visitor A: own cookie jar
      for (const p of ["p1", "p2", "p3"]) {
        await page.goto(`${shop.origin}/shop/${p}?utm_source=qc&utm_content=${runTag}-accept`, { waitUntil: "networkidle2", timeout: 20_000 });
        if (p === "p1") {
          const bannerEl = await page.waitForSelector("[data-sd=banner]", { timeout: 8_000 }).catch(() => null);
          await ctx.shot(page, "04-consent-banner");
          const accept = bannerEl ? await page.$("[data-sd=accept]") : null;
          if (accept) { await accept.click(); await new Promise((r) => setTimeout(r, 800)); }
          else ctx.log("⚠️ consent banner [data-sd=banner] did not render on the shop page — the embedded tracker script did not run (see screenshot / HTTP warnings above)");
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      acceptVisitorId = await page.evaluate(() => { const m = /(?:^|;\s*)sd_vid=([^;]+)/.exec(document.cookie); return m ? decodeURIComponent(m[1]) : null; });
      if (!acceptVisitorId) {
        ctx.check("US9-0-FATAL-GUARD", "the tracker script set a visitorId cookie (sd_vid) on the accepting visitor — without it, none of the session/page-view assertions can even be queried", true, false);
        await page.close();
        return;
      }

      ctx.plan("SCRIPTED ACTION (real UI, same anon visitor): the shop's contact page (3rd page view) — fill and submit the product's embedded form INSIDE its iframe (loaded from the QC origin, as in production)");
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => null), page.click("a[data-qc=contact-link]")]);
      const frame = await pollUntil(async () => page.frames().find((f: Any) => f.url().includes(`/f/${publicToken}`)) ?? null, { timeoutMs: 15_000, intervalMs: 300 });
      ctx.log(`   form iframe url: ${frame?.url() ?? "<no iframe frame>"}`);
      const leadName = `ผู้เข้าชมเว็บ US9 ${ctx.tag}`;
      const phone = `04${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
      let submitted = false;
      if (frame) {
        await frame.waitForSelector("[data-testid=form-public-form]", { timeout: 15_000 });
        await frame.click("[data-testid=form-public-field-name]", { clickCount: 3 });
        await page.keyboard.type(leadName, { delay: 5 });
        await frame.click("[data-testid=form-public-field-phone]", { clickCount: 3 });
        await page.keyboard.type(phone, { delay: 5 });
        await new Promise((r) => setTimeout(r, 3_200));
        await frame.click("[data-testid=form-public-submit]");
        submitted = !!(await frame.waitForSelector("[data-testid=form-public-done]", { timeout: 15_000 }).catch(() => null));
      }
      await ctx.shot(page, "06-form-submitted-in-iframe");
      await page.close();
      await drainQuiet();

      ctx.plan("assert: CrmWebSession(visitorId) has 3 page views AND is bound to the contact the embedded form created (retroactive linking)");
      const contact = await pollUntil(() => P.crmContact.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, name: leadName, phone }, select: { id: true } }));
      ctx.own("crmContact", contact?.id);
      if (formId) {
        const sub = await P.formSubmission.findFirst({ where: { formId, crmContactId: contact?.id ?? undefined }, select: { id: true, webSessionId: true } }).catch(() => null);
        ctx.own("formSubmission", sub?.id);
        ctx.log(`   formSubmission.webSessionId = ${sub?.webSessionId ?? null} (null ⇒ the form request carried no sd_vid)`);
      }
      ctx.check("US9-3a", "the embedded form (iframe from the app origin) was submitted and created the lead contact", { submitted: true, contact: true }, { submitted, contact: !!contact });
      const sessionSel = { id: true, pageViews: true, contactId: true };
      const session = await pollUntil(() => P.crmWebSession.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, visitorId: acceptVisitorId }, select: sessionSel }).then((s: Any) => (s?.contactId ? s : null)), { timeoutMs: 12_000 })
        .then(async (s: Any) => s ?? P.crmWebSession.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, visitorId: acceptVisitorId }, select: sessionSel }));
      ctx.own("crmWebSession", session?.id);
      ctx.check("US9-2", "the accepting visitor's session recorded 3 page views (p2, p3, contact)", 3, session?.pageViews ?? null);
      ctx.check(
        "US9-3",
        "PRODUCT BUG (if red) — retroactive linking: the visitor's session is bound to the contact the product's embedded form created. The tracker's sd_vid is a host-only cookie on the SHOP's domain (tracking.ts put(), ~:1455); the form embed is an iframe to APP_URL (forms/service.ts:390-394) whose request never carries it; the form action reads sd_vid only from its own request's cookies (f/[token]/actions.ts:19-25) and the tracker never hands the visitor id or a ticket to form iframes/links (see IDENTIFY-TICKET MAP in the header)",
        contact?.id ?? "<no contact created>",
        session?.contactId ?? null,
      );
      // positive control for BOTH halves of the utm-marker query US9-4 relies on (N2): sessions (firstUrl) AND events
      const acceptEvents = await P.crmWebEvent.count({ where: { tenantId: env.tenantId, session: { systemId: env.SYS }, url: { contains: `${runTag}-accept` } } });
      const acceptSessions = await P.crmWebSession.count({ where: { tenantId: env.tenantId, systemId: env.SYS, firstUrl: { contains: `${runTag}-accept` } } });
      ctx.check("US9-2b", `positive control: the utm marker queries find the accepting visitor's rows (sessions=${acceptSessions}, events=${acceptEvents})`, { sessions: true, events: true }, { sessions: acceptSessions >= 1, events: acceptEvents >= 3 });
      us9AcceptWorked = session?.pageViews === 3 && acceptEvents >= 3 && acceptSessions >= 1;
    }

    ctx.plan("SCRIPTED ACTION (real UI + real tracker script, negative control, anon visitor who DECLINES): banner → ปฏิเสธ → another page; must record nothing");
    if (!ctx.dry && shop && !us9AcceptWorked) {
      ctx.check("US9-4", "a visitor who declined has ZERO recorded session/page views — SKIPPED AS MEANINGLESS: the accept-path positive control (US9-2/2b) did not pass, so a zero-row result here would be vacuous, not evidence the decline path itself is correct", "US9-2 must pass first", "US9-2 did not pass — this negative control was not evaluated");
    } else if (!ctx.dry && shop && us9AcceptWorked) {
      // ROUND 4 RUNNER FIX: the old check looked the decliner up by its sd_vid cookie — but declining never creates
      // sd_vid (`consent("decline")` sends a throwaway uuid, tracker script), so the lookup was `null === null`, a
      // vacuous pass. Now: count every session/event of this system whose URL carries this run's decline marker
      // (utm_* survive the product's URL cleaning), with US9-2b as the positive control for the same query.
      const page = await ctx.newAnonPage({ isolated: true }); // visitor B: a different person — must NOT inherit A's consent cookie
      await page.goto(`${shop.origin}/shop/p1?utm_source=qc&utm_content=${runTag}-decline`, { waitUntil: "networkidle2", timeout: 20_000 });
      const banner = await page.waitForSelector("[data-sd=banner]", { timeout: 8_000 }).catch(() => null);
      const decline = banner ? await page.$("[data-sd=decline]") : null;
      if (decline) await decline.click();
      await new Promise((r) => setTimeout(r, 800));
      await page.goto(`${shop.origin}/shop/p2?utm_source=qc&utm_content=${runTag}-decline`, { waitUntil: "networkidle2", timeout: 20_000 });
      await new Promise((r) => setTimeout(r, 1_000));
      const bannerAgain = !!(await page.$("[data-sd=banner]"));
      await ctx.shot(page, "07-declined-visitor");
      await page.close();
      // N1: let any late keepalive beacon land, then read until two consecutive reads agree
      const readDecline = async () => ({
        sessions: await P.crmWebSession.findMany({ where: { tenantId: env.tenantId, systemId: env.SYS, firstUrl: { contains: `${runTag}-decline` } }, select: { id: true } }),
        events: await P.crmWebEvent.count({ where: { tenantId: env.tenantId, session: { systemId: env.SYS }, url: { contains: `${runTag}-decline` } } }),
      });
      await new Promise((r) => setTimeout(r, 2_000));
      let prev = await readDecline();
      for (let i = 0; i < 5; i += 1) {
        await new Promise((r) => setTimeout(r, 1_000));
        const cur = await readDecline();
        const same = cur.sessions.length === prev.sessions.length && cur.events === prev.events;
        prev = cur;
        if (same) break;
      }
      const sessions = prev.sessions;
      for (const s of sessions) ctx.own("crmWebSession", s.id);
      const events = prev.events;
      ctx.check("US9-4", "a visitor who declined (banner shown, ปฏิเสธ clicked, then browsed another page with no banner) has ZERO recorded sessions/events", { declineClicked: true, bannerOnNextPage: false, sessions: 0, events: 0 }, { declineClicked: !!decline, bannerOnNextPage: bannerAgain, sessions: sessions.length, events });
    }
  } finally {
    if (shop) {
      ctx.extraAllowedOrigins.delete(shop.origin);
      await shop.close().catch(() => {});
    }
    if (restoreTrackingSettings) {
      ctx.plan("CLEANUP: restore settings.crm.tracking to its original value (shared shop config, not this story's own row) · stop the shop site");
      await restoreTrackingSettings();
    }
  }

  if (ctx.dry) ctx.check("US9-1..4", "dry mode — assertions require the real tracker script running in a browser + real form submit", "skipped in --dry", "skipped in --dry");
}
