// US9 — docs/modules/20-crm-v2.md §1.4: `tracking.web.enabled` on → the shop's site loads `shark.js` → a cookie
// consent banner appears → visitor accepts → visits 3 pages → fills a form → all 3 page views retroactively bind to
// the resulting contact · a visitor who declines gets nothing recorded.
//
// DECISION-US9-1: this app has no public multi-page storefront of its own to embed `shark.js` on (a real shop
// embeds it on ITS OWN website, which this test environment doesn't have). This oracle injects the real tracker
// script (`page.addScriptTag({ url: BASE + "/t/s/" + siteKey })`) into the one stable public page this app does
// serve (`/b/[slug]/login`), navigated 4 times with distinct query strings: visit 1 shows the real consent banner
// and clicks the real "ยอมรับ" button (no page-view fires on this load — the script's own `start()` only calls
// `send("page")` when consent was ALREADY accepted on a previous load); visits 2–4 each auto-fire a real page view
// once the consent cookie is present, giving exactly 3 CrmWebEvent PAGEVIEW rows — matching "เปิด 3 หน้า" via the
// script's own real logic. Same-origin cookies (`sd_vid`) then carry naturally into the `/f/[token]` public lead
// form (a different real page under the same origin), which is how the retroactive binding actually works
// (`submitPublicFormGuarded` reads the `sd_vid` cookie itself — see actions.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lib = (await import("./lib.mts" as string)) as Any;
const { actorFor, drainQuiet, pollUntil, snapshotSettingsPath } = lib;

export async function run(ctx: Any): Promise<void> {
  const { prisma, env } = ctx;
  const P = prisma as any;

  ctx.plan("resolve: owner actor · tenant slug (portal login page is the stable public page used to host the tracker script)");
  const { ctx: octx, actor: ownerActor } = await actorFor(prisma, env, "owner");
  const tenant = ctx.dry ? null : await P.tenant.findFirst({ where: { id: env.tenantId }, select: { slug: true } });

  ctx.plan("SCRIPTED ACTION (real UI, owner): /settings/tracking → enable web tracking, save → read the real siteKey from the embed code shown");
  let siteKey: string | null = null;
  let restoreTrackingSettings: (() => Promise<void>) | null = null;
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
    const embed = await page.$eval("[data-testid=crm-track-embed-code]", (el: any) => el.value ?? el.textContent).catch(() => "");
    const m = /\/t\/s\/([A-Za-z0-9_-]+)/.exec(String(embed ?? ""));
    siteKey = m?.[1] ?? null;
    await page.close();
    ctx.check("US9-1", "web tracking enabled and a real siteKey issued", true, !!siteKey);
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

  const loginPath = `/b/${encodeURIComponent(tenant?.slug ?? "-")}/login`;
  const t0 = new Date();

  ctx.plan("SCRIPTED ACTION (real UI + real tracker script, anon visitor who ACCEPTS): visit 1 shows the banner, click ยอมรับ; visits 2–4 each auto-record a real page view");
  let acceptVisitorId: string | null = null;
  let us9AcceptWorked = false; // ROUND 3 (controller): US9-4 (decline) is only a MEANINGFUL negative control once
  // US9-2 (accept) proves the mechanism records something at all — otherwise "declining visitor got 0 rows" is
  // vacuously true (nothing is being recorded for ANYONE, e.g. while I2/trackerOrigin blocks every beacon).
  if (!ctx.dry && siteKey) {
    const page = await ctx.newAnonPage();
    for (let i = 1; i <= 4; i += 1) {
      await page.goto(`${ctx.BASE}${loginPath}?p=${i}`, { waitUntil: "networkidle2", timeout: 20_000 });
      await page.addScriptTag({ url: `${ctx.BASE}/t/s/${siteKey}.js` }).catch((e: unknown) => ctx.log(`⚠️ addScriptTag: ${e instanceof Error ? e.message : e}`));
      // RUNNER FIX: a fixed 600ms sleep wasn't always enough for the injected <script src> to fetch+parse+run under
      // QC1's real multi-lane load — wait for the script's OWN effect (the banner it renders) instead of a timer;
      // one retry (re-inject) if the first wait comes up empty, matching the addScriptTag-then-wait pattern
      // elsewhere in this harness (pollUntil).
      if (i === 1) {
        let bannerEl = await page.waitForSelector("[data-sd=banner]", { timeout: 4_000 }).catch(() => null);
        if (!bannerEl) {
          ctx.log("⚠️ consent banner did not appear within 4s on first try — re-injecting the tracker script once");
          await page.addScriptTag({ url: `${ctx.BASE}/t/s/${siteKey}.js` }).catch(() => {});
          bannerEl = await page.waitForSelector("[data-sd=banner]", { timeout: 4_000 }).catch(() => null);
        }
        await ctx.shot(page, "02-consent-banner");
        const accept = await page.$("[data-sd=accept]");
        if (accept) { await accept.click(); await new Promise((r) => setTimeout(r, 500)); }
        else ctx.log("⚠️ consent banner button [data-sd=accept] still not found after retry — tracker script did not render it (see screenshot)");
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    acceptVisitorId = await page.evaluate(() => { const m = /(?:^|;\s*)sd_vid=([^;]+)/.exec(document.cookie); return m ? decodeURIComponent(m[1]) : null; });
    await ctx.shot(page, "03-after-3-pageviews");
    // RUNNER FIX: a null visitorId (banner/accept never happened) crashes crmWebSession.findFirst — that field is a
    // required (non-nullable) String column, and Prisma rejects `null` as a filter value for it with a validation
    // error, not a clean "not found". Report it as a real, informative check failure instead of an uncaught crash
    // that also aborts every check after it (including the batch's other story, US10, in a combined run).
    if (!acceptVisitorId) {
      ctx.check("US9-0-FATAL-GUARD", "the tracker script set a visitorId cookie (sd_vid) on the accepting visitor — without it, none of the session/page-view assertions can even be queried", true, false);
      await page.close();
      return;
    }

    ctx.plan("SCRIPTED ACTION (real UI, same anon visitor): fill and submit the public lead form on the SAME origin (sd_vid cookie carries over)");
    await page.goto(`${ctx.BASE}/f/${publicToken}`, { waitUntil: "networkidle2", timeout: 30_000 });
    await page.waitForSelector("[data-testid=form-public-form]", { timeout: 10_000 });
    const leadName = `ผู้เข้าชมเว็บ US9 ${ctx.tag}`;
    const phone = `04${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    await page.click("[data-testid=form-public-field-name]", { clickCount: 3 });
    await page.keyboard.type(leadName, { delay: 5 });
    await page.click("[data-testid=form-public-field-phone]", { clickCount: 3 });
    await page.keyboard.type(phone, { delay: 5 });
    await new Promise((r) => setTimeout(r, 3_200));
    await page.click("[data-testid=form-public-submit]");
    await page.waitForSelector("[data-testid=form-public-done]", { timeout: 15_000 });
    await ctx.shot(page, "04-form-submitted");
    await page.close();
    await drainQuiet();

    ctx.plan("assert: CrmWebSession(visitorId) has 3 page views AND is bound to the new contact (retroactive linking)");
    // the contact-side lead creation and the session→contact binding both go through the same form-submit outbox
    // consumer as US1 — see drainQuiet()'s doc comment in lib.mts
    const contact = await pollUntil(() => P.crmContact.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, name: leadName, phone }, select: { id: true } }));
    ctx.own("crmContact", contact?.id);
    if (formId) {
      const sub = await P.formSubmission.findFirst({ where: { formId, crmContactId: contact?.id ?? undefined }, select: { id: true } }).catch(() => null);
      ctx.own("formSubmission", sub?.id); // SHOULD-FIX (28 Sep): product side-effect row --clean must also remove
    }
    const session = await pollUntil(() => P.crmWebSession.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, visitorId: acceptVisitorId }, select: { id: true, pageViews: true, contactId: true } }).then((s: Any) => (s?.contactId ? s : null))).then(async (s: Any) => s ?? P.crmWebSession.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, visitorId: acceptVisitorId }, select: { id: true, pageViews: true, contactId: true } }));
    ctx.own("crmWebSession", session?.id);
    ctx.check("US9-2", "the accepting visitor's session recorded 3 page views", 3, session?.pageViews ?? null);
    ctx.check("US9-3", "the session is bound to the contact the form created (retroactive linking)", contact?.id ?? "<no contact created>", session?.contactId ?? null);
    us9AcceptWorked = session?.pageViews === 3;
  }

  ctx.plan("SCRIPTED ACTION (real UI + real tracker script, negative control, anon visitor who DECLINES): must record nothing");
  if (!ctx.dry && siteKey && !us9AcceptWorked) {
    // ROUND 3 (controller): don't report a vacuous green — the accept path itself isn't proven to record anything
    // yet (US9-2 failed), so "decline recorded nothing" would be indistinguishable from "nothing works at all".
    ctx.check("US9-4", "a visitor who declined has ZERO recorded session/page views — SKIPPED AS MEANINGLESS: the accept-path positive control (US9-2) did not pass, so a zero-row result here would be vacuous, not evidence the decline path itself is correct", "US9-2 must pass first", "US9-2 did not pass — this negative control was not evaluated");
  } else if (!ctx.dry && siteKey && us9AcceptWorked) {
    const page = await ctx.newAnonPage();
    await page.goto(`${ctx.BASE}${loginPath}?p=decline`, { waitUntil: "networkidle2", timeout: 20_000 });
    await page.addScriptTag({ url: `${ctx.BASE}/t/s/${siteKey}.js` }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    const decline = await page.$("[data-sd=decline]");
    if (decline) await decline.click();
    await new Promise((r) => setTimeout(r, 500));
    const declineVisitorId = await page.evaluate(() => { const m = /(?:^|;\s*)sd_vid=([^;]+)/.exec(document.cookie); return m ? decodeURIComponent(m[1]) : null; });
    await page.goto(`${ctx.BASE}${loginPath}?p=decline2`, { waitUntil: "networkidle2", timeout: 20_000 });
    await page.addScriptTag({ url: `${ctx.BASE}/t/s/${siteKey}.js` }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    await ctx.shot(page, "05-declined-visitor");
    await page.close();
    const declinedSession = declineVisitorId ? await P.crmWebSession.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, visitorId: declineVisitorId } }) : null;
    ctx.own("crmWebSession", declinedSession?.id);
    ctx.check("US9-4", "a visitor who declined has ZERO recorded session/page views (collect() requires an accepted session)", null, declinedSession);
  }

  if (restoreTrackingSettings) {
    ctx.plan("CLEANUP: restore settings.crm.tracking to its original value (shared shop config, not this story's own row)");
    await restoreTrackingSettings();
  }

  if (ctx.dry) ctx.check("US9-1..4", "dry mode — assertions require the real tracker script running in a browser + real form submit", "skipped in --dry", "skipped in --dry");
}
