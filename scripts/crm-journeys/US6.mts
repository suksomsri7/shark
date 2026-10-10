// US6 — docs/modules/20-crm-v2.md §1.4: a STAFF on the กระบี่ team opens a ภูเก็ต-team deal → 404 (not 403 — see
// COMMON brief "404-not-403") → the ภูเก็ต team lead reassigns the deal to the กระบี่ team → now visible + an event
// fired.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lib = (await import("./lib.mts" as string)) as Any;
const { actorFor, drainQuiet, pollUntil } = lib;

export async function run(ctx: Any): Promise<void> {
  const { prisma, env } = ctx;
  const P = prisma as any;

  ctx.plan("resolve: manager = ภูเก็ต team lead (owns the deal) · nok = กระบี่ team STAFF (must 404, then must see it)");
  const { ctx: mctx, actor: managerActor } = await actorFor(prisma, env, "manager");
  const firstOpen = env.pipelines.b2b.stages.find((s: Any) => s.kind === "OPEN")!;

  const companyName = `บริษัท US6 ${ctx.tag}`;
  const dealTitle = `ดีล US6 ${ctx.tag}`;
  let contactId: string | null = null;
  let dealId: string | null = null;

  ctx.plan("SETUP (facade): company/contact/deal owned by the manager (ภูเก็ต team)");
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    const co = await (crm as any).companies.createCompany(mctx, managerActor, { name: companyName });
    const companyId = co.id ?? co.company?.id ?? co.companyId;
    ctx.own("crmCompany", companyId);
    const contactRes = await (crm as any).contacts.createContact(mctx, managerActor, { firstName: `ผู้ติดต่อ US6 ${ctx.tag}`, phone: `07${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: env.users.manager.userId });
    contactId = contactRes.contact?.id ?? null;
    ctx.own("crmContact", contactId);
    // RUNNER FIX (see US3.mts for the full trace): createContact's `companyId` param only writes the CACHE column,
    // not the real CrmCompanyContact junction createDeal validates against — use companies.addContact for real.
    await (crm as any).companies.addContact(mctx, managerActor, companyId, { contactId, isPrimary: true });
    const deal = await (crm as any).deals.createDeal(mctx, managerActor, { pipelineId: env.pipelines.b2b.id, stageId: firstOpen.id, title: dealTitle, contactId, companyId, ownerUserId: env.users.manager.userId, valueSatang: 30_000 });
    dealId = deal.id;
    ctx.own("crmDeal", dealId);
  }

  ctx.plan("SCRIPTED ACTION (real UI, nok — กระบี่ STAFF): open /deals/{id} of the ภูเก็ต deal → expect 404, not a 403/permission page");
  if (!ctx.dry) {
    const page = await ctx.loginStaff("nok");
    const resp = await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/deals/${dealId}`, { waitUntil: "networkidle2", timeout: 30_000 });
    await ctx.shot(page, "01-nok-sees-404");
    const status = resp?.status() ?? 0;
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
    await page.close();
    // SHOULD-FIX (28 Sep, controller review): "US6-1 status 404" — require the ACTUAL HTTP status, not an OR with
    // a text match that could false-positive if "ไม่พบ"/"404" appears anywhere on an unrelated error page.
    ctx.check("US6-1", `nok (out-of-team STAFF) gets a genuine 404 for the ภูเก็ต deal, never a 403/forbidden page — HTTP ${status}, body hint matched=${/ไม่พบ|404/.test(bodyText)}`, 404, status);
  }

  ctx.plan(`SCRIPTED ACTION (real UI, manager — ภูเก็ต lead): open the deal, reassign the owner to nok (deal-owner-select) — crosses into the กระบี่ team`);
  const t0 = new Date(); // SHOULD-FIX (28 Sep): captured right before the reassign click, not a wide 5-min-ago window
  if (!ctx.dry) {
    const page = await ctx.loginStaff("manager");
    await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/deals/${dealId}`, { waitUntil: "networkidle2", timeout: 30_000 });
    await page.waitForSelector("[data-testid=deal-owner-select]", { timeout: 15_000 });
    await ctx.shot(page, "02-before-reassign");
    await page.select("[data-testid=deal-owner-select]", env.users.nok.userId);
    await new Promise((r) => setTimeout(r, 1_200));
    await ctx.shot(page, "03-after-reassign");
    await page.close();
    await drainQuiet();
  }

  ctx.plan("assert: deal.ownerUserId = nok · outbox event crm.deal.reassigned fired · nok can now see the deal (real UI 200)");
  if (!ctx.dry) {
    const dealAfter = await P.crmDeal.findFirst({ where: { id: dealId }, select: { ownerUserId: true } });
    ctx.check("US6-2", "deal.ownerUserId reassigned to nok", env.users.nok.userId, dealAfter?.ownerUserId ?? null);
    // SHOULD-FIX (28 Sep, controller review): "US6-3 filter deal id" — a bare type+time filter could match some
    // OTHER deal's reassignment/update event that happened to land in the same window on this shared QC1 tenant.
    const evt = await P.outboxEvent.findFirst({ where: { tenantId: env.tenantId, type: { in: ["crm.deal.reassigned", "crm.deal.updated"] }, createdAt: { gte: t0 }, payload: { path: ["dealId"], equals: dealId } }, orderBy: { createdAt: "desc" } }).catch(() => null);
    ctx.check("US6-3", "an outbox event for the reassignment fired (crm.deal.reassigned or crm.deal.updated carrying THIS dealId)", true, !!evt);

    const page = await ctx.loginStaff("nok");
    const resp = await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/deals/${dealId}`, { waitUntil: "networkidle2", timeout: 30_000 });
    await ctx.shot(page, "04-nok-now-sees-it");
    const status = resp?.status() ?? 0;
    const visible = await page.$("[data-testid=deal-back-link]");
    await page.close();
    ctx.check("US6-4", `nok can now open the deal for real (200 + deal 360 renders) — HTTP ${status}`, true, status === 200 && !!visible);
  } else {
    ctx.check("US6-1..4", "dry mode — assertions require the real 404 hit + reassign click + 200 re-visit", "skipped in --dry", "skipped in --dry");
  }
}
