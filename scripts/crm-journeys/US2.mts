// US2 — docs/modules/20-crm-v2.md §1.4: employee opens a lead → clicks "แปลง" (convert) → ticks company + deal →
// company (Party COMPANY · taxId) · contact becomes "ผู้ตัดสินใจ" (decision maker) · deal starts at the pipeline's
// first stage → later the deal is WON → a member is auto-created (source CRM).
//
// DECISION-US2-1 (see crm-brief-C4.4.md): `ConvertInput` (src/lib/modules/crm/contacts-shared.ts:239-246) has NO
// `taxId` field and NO contact-role field at all — only `company: {id} | {new:{name}}` and
// `deal: {pipelineId, stageId?, title, valueSatang?}`. The story's "เลขภาษี" and "ผู้ตัดสินใจ" role cannot be set
// through convertContact today. This oracle does NOT invent a workaround for that (would weaken the assertion) —
// it asserts what convertContact actually does (company created + contact linked + deal created) and records the
// taxId/role gap as a finding for the controller.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lib = (await import("./lib.mts" as string)) as Any;
const { actorFor, drainQuiet, pollUntil, withStaffPermissions, validTaxId } = lib;

export async function run(ctx: Any): Promise<void> {
  const { prisma, env } = ctx;
  const P = prisma as any;

  ctx.plan("resolve: thana (STAFF · phuket) as the owning employee · B2B pipeline first OPEN stage · WON stage");
  const { ctx: tctx, actor: thanaActor } = await actorFor(prisma, env, "thana");
  const firstOpen = env.pipelines.b2b.stages.find((s: Any) => s.kind === "OPEN");
  const wonStage = env.pipelines.b2b.stages.find((s: Any) => s.kind === "WON");
  ctx.check("US2-0", `B2B pipeline has both an OPEN and a WON stage (resolved live, no browser) — firstOpen=${firstOpen?.name} wonStage=${wonStage?.name}`, true, !!firstOpen && !!wonStage);

  const leadName = `Lead US2 ${ctx.tag}`;
  const phone = `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

  ctx.plan("setup (facade, no UI — a plain lead capture form is C4.3's territory, not this story's action): create a lead owned by thana");
  let contactId: string | null = null;
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    const res = await (crm as any).contacts.createContact(tctx, thanaActor, {
      firstName: leadName,
      phone,
      sourceKind: "OTHER",
      sourceDetail: { via: ctx.tag },
      ownerUserId: env.users.thana.userId,
    });
    contactId = res.contact?.id ?? null;
    ctx.own("crmContact", contactId);
  }

  const companyName = `บริษัท ทดสอบ US2 จำกัด (${ctx.tag})`;
  const wantTaxId = validTaxId(`0105${Date.now()}`.slice(0, 12)); // ORACLE-EDIT C4.4: computed BEFORE the click so the UI can type it
  const dealTitle = `ดีล US2 ${ctx.tag}`;

  ctx.plan(`SETUP (test-fixture permission elevation, not a product gap — see withStaffPermissions() doc in lib.mts): QC1's seeded thana lacks crm.contact.convert + crm.company.read/create/update (seed-crm-qc.mts:132-137 deliberately scopes thana narrowly for OTHER WOs' boundary tests) — grant for the duration of this journey, restore after`);
  ctx.plan(`SCRIPTED ACTION (real UI, thana): open contact 360, click "แปลง", tick company (new: ${companyName}) + deal (${dealTitle} @ ${firstOpen?.name}), submit`);
  let convertResult: { companyId: string | null; dealId: string | null; customerId: string | null } | null = null;
  if (!ctx.dry) {
    // RUNNER FIX (found via a direct convertContact repro against QC1, not through the UI): convertContact creates the
    // company then immediately re-reads it through companyRefsInTx() -> companyWhere() -> visibleWhere(), which
    // returns NOTHING when the actor lacks `crm.company.read` (visibility.ts:359 — company read is NOT in
    // CRM_IMPLICIT_READ, unlike contact/deal/activity) — so thana couldn't see the company SHE JUST CREATED inside
    // the same transaction, and createDeal's company lookup threw "ไม่พบบริษัทที่เลือก...". Same test-fixture
    // permission-scoping class as crm.contact.convert above, just a key I missed the first pass — not a product bug.
    await withStaffPermissions(prisma, { tenantId: env.tenantId, userId: env.users.thana.userId, keys: ["crm.contact.convert", "crm.company.read", "crm.company.create", "crm.company.update"] }, async () => {
    const page = await ctx.loginStaff("thana");
    await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/contacts/${contactId}`, { waitUntil: "networkidle2", timeout: 30_000 });
    await ctx.shot(page, "01-contact-360");
    await page.waitForSelector("[data-testid=contact-convert-btn]", { timeout: 15_000 });
    await page.click("[data-testid=contact-convert-btn]");
    await page.waitForSelector("[data-testid=contact-convert-modal]", { timeout: 10_000 });
    // RUNNER FIX (found running against QC1, 27 Sep — screenshot evidence in .qc-shots/crm/journeys/US2/01b-*):
    // ALL THREE toggles default to CHECKED (Contact360Actions.tsx:103,105,109 — `useState(true)` for
    // tickMember/tickCompany/tickDeal), not unchecked as this journey originally assumed. Clicking
    // "contact-convert-company"/"-deal" was therefore TURNING THEM OFF (member stayed on, unintended), which is
    // why the deal fields disappeared and the next waitForSelector timed out. Fixed: uncheck member (US2 tests
    // member creation via the LATER deal-WON path, not at convert time — ticking it here would confound that
    // assertion); leave company/deal at their real default (already checked, fields already rendered) and just
    // fill them in — no toggle clicks needed for those two.
    await page.waitForSelector("[data-testid=contact-convert-member]", { timeout: 5_000 });
    await page.click("[data-testid=contact-convert-member]"); // uncheck — defaults to checked, this story creates the member later via WON
    await ctx.shot(page, "01b-after-member-uncheck");
    await page.waitForSelector("[data-testid=contact-convert-company-mode-new]", { timeout: 5_000 }); // already rendered (tickCompany defaults true)
    await page.click("[data-testid=contact-convert-company-name]", { clickCount: 3 });
    await page.keyboard.type(companyName, { delay: 10 });
    // ORACLE-EDIT C4.4 (controller · 28 Sep · builder ORACLE-QUESTION 1+2): the story's "เลขภาษี" + "ผู้ตัดสินใจ" are now
    //   typed/picked in the real modal (they used to be unreachable gaps) — the expected taxId is precomputed below so the
    //   assertion compares what the user TYPED, and the role is picked explicitly (not relying on the UI default).
    await page.click("[data-testid=contact-convert-company-taxid]", { clickCount: 3 });
    await page.keyboard.type(wantTaxId, { delay: 10 });
    await page.select("[data-testid=contact-convert-company-role]", "DECISION_MAKER");
    await page.waitForSelector("[data-testid=contact-convert-deal-pipeline]", { timeout: 5_000 }); // already rendered (tickDeal defaults true)
    await page.select("[data-testid=contact-convert-deal-pipeline]", env.pipelines.b2b.id);
    await page.click("[data-testid=contact-convert-deal-title]", { clickCount: 3 });
    await page.keyboard.type(dealTitle, { delay: 10 });
    await page.click("[data-testid=contact-convert-deal-value]", { clickCount: 3 });
    await page.keyboard.type("50000", { delay: 10 });
    await ctx.shot(page, "02-convert-modal-filled");
    await page.click("[data-testid=contact-convert-submit]");
    await page.waitForFunction(() => !document.querySelector("[data-testid=contact-convert-modal]"), { timeout: 15_000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    await ctx.shot(page, "03-after-convert");
    const convertErrorEl = await page.$("[data-testid=contact-convert-error]").catch(() => null);
    const convertErrorText = convertErrorEl ? await page.$eval("[data-testid=contact-convert-error]", (el: any) => el.textContent).catch(() => null) : null;
    if (convertErrorText) ctx.log(`   ⚠️ convert modal still shows an error after submit: ${convertErrorText}`);
    await page.close();
    });

    const c = await P.crmContact.findFirst({ where: { id: contactId }, select: { companyId: true, convertedAt: true, lifecycleStage: true, memberCustomerId: true } });
    const deal = await P.crmDeal.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, title: dealTitle }, select: { id: true, stageId: true, companyId: true, contactId: true } });
    convertResult = { companyId: c?.companyId ?? null, dealId: deal?.id ?? null, customerId: null };
    ctx.own("crmDeal", deal?.id);
    ctx.own("crmCompany", c?.companyId);

    ctx.check("US2-1", "contact.companyId set (company created by convert)", true, !!c?.companyId);
    ctx.check("US2-2", "contact.convertedAt set", true, !!c?.convertedAt);
    // SHOULD-FIX (controller review 28 Sep): assert the PRE-condition too — memberCustomerId must be null right
    // after convert (member toggle was unchecked on purpose), or US2-7's "member created BY the WON transition"
    // claim later is unproven (it could have already existed for an unrelated reason).
    ctx.check("US2-2b", "contact.memberCustomerId is still null right after convert (member was NOT ticked)", null, c?.memberCustomerId ?? null);
    ctx.check("US2-3", "deal created, linked to the same contact+company, at the pipeline's first OPEN stage", { stageId: firstOpen?.id, contactId, companyId: c?.companyId }, deal ? { stageId: deal.stageId, contactId: deal.contactId, companyId: deal.companyId } : null);

    // Controller ruling 27 Sep: taxId/role are PRODUCT GAPS (C4.4-fix), not weakened assertions — assert what the
    // story actually asks for and let it go red until ConvertInput/linkContactInTx grow the fields.
    const company = c?.companyId ? await P.crmCompany.findFirst({ where: { id: c.companyId }, select: { name: true, taxId: true } }) : null;
    ctx.check(
      "US2-4",
      `the company created by convert carries the "เลขภาษี" the user typed in the convert modal (was PRODUCT GAP DECISION-US2-1 — fixed in C4.4-fix)`,
      wantTaxId,
      company?.taxId ?? null,
    );
    const link = c?.companyId ? await P.crmCompanyContact.findFirst({ where: { companyId: c.companyId, contactId } , select: { role: true } }) : null;
    ctx.check(
      "US2-5",
      `the contact is linked to the new company as "ผู้ตัดสินใจ" (DECISION_MAKER), picked in the convert modal (was PRODUCT GAP DECISION-US2-1 — fixed in C4.4-fix)`,
      "DECISION_MAKER",
      link?.role ?? null,
    );

    ctx.plan(`SCRIPTED ACTION (real UI, thana): move the deal to the WON stage (${wonStage?.name}) — this is what fires crm.deal.won`);
    if (deal?.id) {
      const page2 = await ctx.loginStaff("thana");
      await page2.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/deals/${deal.id}`, { waitUntil: "networkidle2", timeout: 30_000 });
      await page2.waitForSelector(`[data-testid=deal-stage-step-${wonStage!.id}]`, { timeout: 15_000 });
      await page2.click(`[data-testid=deal-stage-step-${wonStage!.id}]`);
      await new Promise((r) => setTimeout(r, 600));
      // WON transitions sometimes open a confirm window per the registry note ("แพ้/เปิดใหม่/เงื่อนไข = หน้าต่าง") — best-effort confirm if one appears
      const confirmBtn = await page2.$("[data-testid=deal-lost-modal] button, [data-testid=deal-menu-panel] [data-testid$=confirm]");
      if (confirmBtn) await confirmBtn.click().catch(() => {});
      await ctx.shot(page2, "04-deal-won");
      await page2.close();
      await drainQuiet(); // crm.deal.won → memberBridge(onCrmDealWon) [main] + stop-sequences/auto-invoice/team-room [extras]

      // the WON-side effect (member creation) lands via the outbox consumer, which can still be a beat behind the
      // stage-move HTTP response — see drainQuiet()'s doc comment in lib.mts
      const contactAfter = await pollUntil(() => P.crmContact.findFirst({ where: { id: contactId }, select: { memberCustomerId: true } }).then((c: Any) => (c?.memberCustomerId ? c : null)));
      ctx.check("US2-6", "deal.stageId moved into the WON-kind stage", wonStage!.id, (await P.crmDeal.findFirst({ where: { id: deal.id }, select: { stageId: true } }))?.stageId ?? null);
      ctx.check("US2-7", "contact.memberCustomerId set (member auto-created, source CRM) after the deal went WON", true, !!contactAfter?.memberCustomerId);
      if (contactAfter?.memberCustomerId) {
        ctx.own("customer", contactAfter.memberCustomerId); // SHOULD-FIX (28 Sep): product side-effect row --clean must also remove
        const cust = await P.customer.findFirst({ where: { id: contactAfter.memberCustomerId }, select: { id: true, phone: true } });
        ctx.check("US2-8", "the auto-created Customer's phone matches the lead's phone", phone, cust?.phone ?? null);
      }
    }
  } else {
    ctx.check("US2-1..8", "dry mode — assertions require the real convert click + WON transition + drained outbox", "skipped in --dry", "skipped in --dry");
  }
}
