// US3 — docs/modules/20-crm-v2.md §1.4: a deal with 3 line items → "issue quotation" → a real accounting QUOTATION
// document with lines/tax → customer accepts in the portal → deal auto-advances stage + activity logged + owner
// notified.
//
// DECISION-US3-1 (see crm-brief-C4.4.md): `CrmPipeline.stageOnQuoteAcceptedId` is real and wired
// (src/lib/modules/crm/deals.ts:2089-2095 — respondQuotation moves the deal there on accept) but there is NO UI
// control for it anywhere in the registry (`/settings/pipelines`, `/settings/stages`) — a shop cannot configure it
// today. This journey sets it directly via prisma as a SETUP step (representing "the shop already configured this"),
// then restores the original value in `finally` so the shared seed pipeline isn't left mutated. The blueprint's
// stage name "ตกลง" doesn't exist in the seeded B2B pipeline (stages: ผู้สนใจใหม่/ติดต่อแล้ว/เสนอราคา/ปิดการขายได้/ไม่สำเร็จ)
// — this journey targets "ปิดการขายได้" (WON) as the closest real analogue and asserts against THAT, not a literal
// stage named "ตกลง".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lib = (await import("./lib.mts" as string)) as Any;
const { actorFor, drainQuiet, pollUntil, validTaxId, withStaffPermissions, ensureCrmAccountLink, snapshotSettingsPath } = lib;

export async function run(ctx: Any): Promise<void> {
  const { prisma, env } = ctx;
  const P = prisma as any;

  ctx.plan("resolve: owner actor · manager (portal inviter) · thana (deal owner) · B2B pipeline first stage + WON stage");
  const { ctx: octx, actor: ownerActor } = await actorFor(prisma, env, "owner");
  const firstOpen = env.pipelines.b2b.stages.find((s: Any) => s.kind === "OPEN")!;
  const wonStage = env.pipelines.b2b.stages.find((s: Any) => s.kind === "WON")!;

  ctx.plan("SETUP (real facade — connections.connect(), the same function the ACCOUNT module's own connections-settings button calls; no testid on that page to click it — see ensureCrmAccountLink() doc in lib.mts): link this CRM system to its shop's Account books, persistent config, not undone after");
  if (!ctx.dry) await ensureCrmAccountLink(prisma, env, env.users.owner.userId);

  let origStageOnAccept: string | null | undefined;
  let restorePortalSettings: (() => Promise<void>) | null = null;
  ctx.plan(`SETUP (direct prisma — see DECISION-US3-1, no UI exists for this): set pipeline.stageOnQuoteAcceptedId = ${wonStage.name}`);
  if (!ctx.dry) {
    const row = await P.crmPipeline.findFirst({ where: { id: env.pipelines.b2b.id }, select: { stageOnQuoteAcceptedId: true } });
    origStageOnAccept = row?.stageOnQuoteAcceptedId ?? null;
    // Controller ruling 27 Sep: prisma SETUP is allowed only for data the seed lacks, never to stand in for a
    // control the story asks the USER to press — record that substitution as a red-for-gap check, not a silent one.
    ctx.check(
      "US3-0-GAP",
      "PRODUCT GAP (see crm-brief-C4.4.md DECISION-US3-1): a shop owner should be able to configure \"which stage a deal moves to when its quotation is accepted\" from /settings/pipelines or /settings/stages — no such control exists in either page's registry, so this journey sets CrmPipeline.stageOnQuoteAcceptedId directly via prisma instead of clicking a real control",
      "a UI control for stageOnQuoteAcceptedId exists",
      "no UI control exists — set via prisma SETUP",
      true,
    );
    await P.crmPipeline.update({ where: { id: env.pipelines.b2b.id }, data: { stageOnQuoteAcceptedId: wonStage.id } });
  }

  try {
    const companyName = `บริษัท US3 ${ctx.tag}`;
    const contactName = `ผู้ติดต่อ US3 ${ctx.tag}`;
    const dealTitle = `ดีล US3 ${ctx.tag}`;
    let companyId: string | null = null;
    let contactId: string | null = null;
    let dealId: string | null = null;

    ctx.plan(`SETUP (facade, no UI — company/contact/deal creation is C4.2/C4.3's own button coverage, not this story's action): company "${companyName}" + contact + deal with 3 lines`);
    if (!ctx.dry) {
      const crm = await import("@/lib/modules/crm");
      // RUNNER FIX: a made-up taxId fails companies.ts's mod-11 checksum guard — use a real valid one
      const co = await (crm as any).companies.createCompany(octx, ownerActor, { name: companyName, taxId: validTaxId(`0105${Date.now()}`.slice(0, 12)) });
      companyId = co.id ?? co.company?.id ?? co.companyId;
      ctx.own("crmCompany", companyId);
      const contactRes = await (crm as any).contacts.createContact(octx, ownerActor, { firstName: contactName, phone: `09${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, email: `${ctx.tag}@example.com`, ownerUserId: env.users.thana.userId });
      contactId = contactRes.contact?.id ?? null;
      ctx.own("crmContact", contactId);
      // RUNNER FIX: createContact's `companyId` param only writes CrmContact.companyId (documented as a CACHE of
      // CrmCompanyContact.isPrimary — companies.ts:156 — "เขียนผ่าน companies.setPrimary เท่านั้น"), it does NOT create
      // the actual CrmCompanyContact junction row. createDeal's contact/company validation checks the real
      // junction, not the cache, so a deal created straight after would fail "ผู้ติดต่อคนนี้ไม่ได้อยู่ในบริษัทที่เลือก" — use
      // the real facade (companies.addContact, the same op the company-360 "+เพิ่มผู้ติดต่อ" button calls) instead.
      await (crm as any).companies.addContact(octx, ownerActor, companyId, { contactId, isPrimary: true });
      const deal = await (crm as any).deals.createDeal(octx, ownerActor, {
        pipelineId: env.pipelines.b2b.id,
        stageId: firstOpen.id,
        title: dealTitle,
        contactId,
        companyId,
        ownerUserId: env.users.thana.userId,
        lines: [
          { name: "แพ็กเกจดำน้ำ A", qty: 2, unitPriceSatang: 350_000 },
          { name: "แพ็กเกจดำน้ำ B", qty: 1, unitPriceSatang: 500_000 },
          { name: "อุปกรณ์เช่า", qty: 3, unitPriceSatang: 20_000 },
        ],
      });
      dealId = deal.id;
      ctx.own("crmDeal", dealId);
    }

    ctx.plan("SETUP (test-fixture permission elevation, not a product gap — see withStaffPermissions() doc in lib.mts): QC1's seeded thana lacks crm.deal.update/crm.deal.quote (seed-crm-qc.mts:132-137) — grant for this journey, restore after");
    ctx.plan(`SCRIPTED ACTION (real UI, thana): open deal 360, click "ออกใบเสนอราคา"`);
    let quotationDocId: string | null = null;
    if (!ctx.dry) {
      await withStaffPermissions(prisma, { tenantId: env.tenantId, userId: env.users.thana.userId, keys: ["crm.deal.update", "crm.deal.quote", "crm.company.read"] }, async () => {
        const page = await ctx.loginStaff("thana");
        await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/deals/${dealId}`, { waitUntil: "networkidle2", timeout: 30_000 });
        await ctx.shot(page, "01-deal-360");
        await page.waitForSelector("[data-testid=deal-quote-btn]", { timeout: 15_000 });
        await page.click("[data-testid=deal-quote-btn]");
        await new Promise((r) => setTimeout(r, 1_500));
        await ctx.shot(page, "02-after-issue-quote");
        await page.close();
      });
      const dealRow = await P.crmDeal.findFirst({ where: { id: dealId }, select: { quotationDocId: true } });
      quotationDocId = dealRow?.quotationDocId ?? null;
      ctx.own("accountDocument", quotationDocId);
      ctx.check("US3-1", "deals.issueQuotation created an AccountDocument QUOTATION and stored quotationDocId on the deal", true, !!quotationDocId);

      // SHOULD-FIX (28 Sep, controller review): "US3-1 lines+VAT" — don't stop at "a document exists", verify the
      // 3 lines this deal was created with (700,000+500,000+60,000 = 1,260,000 satang subtotal) actually carried
      // through to the issued document, and that VAT was computed (not silently zeroed).
      if (quotationDocId) {
        const doc = await P.accountDocument.findFirst({ where: { id: quotationDocId }, select: { subTotal: true, vatAmount: true, grandTotal: true, lines: { select: { id: true } } } });
        ctx.check("US3-1b", "quotation carries all 3 deal lines", 3, doc?.lines?.length ?? 0);
        ctx.check("US3-1c", "quotation subTotal matches the 3 lines' sum (700,000+500,000+60,000 satang)", 1_260_000, doc?.subTotal ?? null);
        ctx.check("US3-1d", "quotation has a nonzero VAT amount (default vatRateBp=700=7%, not silently zeroed)", true, (doc?.vatAmount ?? 0) > 0);
        ctx.check("US3-1e", "quotation grandTotal = subTotal + vatAmount (no stray discount/deposit)", (doc?.subTotal ?? 0) + (doc?.vatAmount ?? 0), doc?.grandTotal ?? null);
      }

      // RUNNER FIX: deals.issueQuotation creates the AccountDocument as DRAFT ("ออกใบเสนอราคา (ร่าง) ในระบบบัญชีแล้ว" —
      // the UI's own success toast says so). listPortalDocs (account/index.ts:970) explicitly excludes DRAFT
      // (`status: { notIn: ["DRAFT"] }`) — the customer can't see a draft. A real shop finalizes/sends the
      // document before a customer would ever get a portal invite for it; that finalize step is the ACCOUNT
      // module's own action (issueDocument), out of this registry — same DECISION-US7-1 class as recordPayment.
      if (quotationDocId) {
        const acc = await import("@/lib/modules/account/service");
        const ir = await (acc as any).issueDocument(env.tenantId, env.accountSysId, quotationDocId).catch((e: unknown) => ({ ok: false, reason: String(e) }));
        ctx.log(`   issueDocument(quotation) -> ${JSON.stringify(ir)}`);
        // ROUND 3 (controller): mark facade stand-ins gap:true — this finalize step isn't driven through any UI
        // this journey clicks (ACCOUNT owns its own button coverage, DECISION-US7-1 class).
        ctx.check("US3-1f", "GAP-MARKER (facade stand-in, not UI-driven): ACCOUNT's issueDocument() moved the quotation out of DRAFT", true, (ir as Any)?.ok === true, true);
      }
    }

    // RUNNER FIX: the invite panel itself showed a red warning ("ระบบ CRM นี้ยังไม่ได้เปิดพอร์ทัลลูกค้า") — the customer
    // portal has to be switched on at /settings/portal before any invite works at all. Real UI, one-time shop
    // config, persistent (not undone) — same class as ensureCrmAccountLink.
    ctx.plan("SETUP (real UI, owner): /settings/portal → enable the customer portal, save (one-time shop config)");
    if (!ctx.dry) {
      const page0 = await ctx.loginStaff("owner");
      await page0.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/settings/portal`, { waitUntil: "networkidle2", timeout: 30_000 });
      await page0.waitForSelector("[data-testid=crm-portal-settings-enabled]", { timeout: 15_000 });
      const already = await page0.$eval("[data-testid=crm-portal-settings-enabled]", (el: any) => el.checked ?? el.getAttribute("aria-checked") === "true").catch(() => false);
      if (!already) {
        restorePortalSettings = await snapshotSettingsPath(prisma, env.SYS, ["crm", "portal"]); // ROUND 3: path-scoped restore
        await page0.click("[data-testid=crm-portal-settings-enabled]");
        await page0.click("[data-testid=crm-portal-settings-save]");
        await new Promise((r) => setTimeout(r, 1_000));
      }
      await ctx.shot(page0, "04b-portal-settings-enabled");
      await page0.close();
    }

    ctx.plan("SCRIPTED ACTION (real UI, owner): open company 360, invite the contact to the customer portal");
    let inviteUrl: string | null = null;
    if (!ctx.dry) {
      const page = await ctx.loginStaff("owner");
      await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/companies/${companyId}`, { waitUntil: "networkidle2", timeout: 30_000 });
      await page.waitForSelector("[data-testid=crm-portal-invite]", { timeout: 15_000 });
      await page.click("[data-testid=crm-portal-invite]");
      await page.waitForSelector("[data-testid=crm-portal-invite-contact]", { timeout: 10_000 });
      await ctx.shot(page, "02b-invite-panel-open");
      const contactOptExists = await page.$eval("[data-testid=crm-portal-invite-contact]", (el: any, id: string) => Array.from(el.options).some((o: any) => o.value === id), contactId!).catch(() => null);
      ctx.log(`   crm-portal-invite-contact has option for our contact: ${contactOptExists}`);
      await page.select("[data-testid=crm-portal-invite-contact]", contactId!).catch((e: unknown) => ctx.log(`   ⚠️ select contact failed: ${e instanceof Error ? e.message : e}`));
      // RUNNER FIX: the invite panel also has delivery-channel toggles (crm-portal-invite-email / -line) — without
      // picking at least one, submit silently does nothing (no inline error visible in the small container this
      // journey was reading). Toggle email (the simpler channel — LINE needs OAuth this environment doesn't have).
      await page.click("[data-testid=crm-portal-invite-email]").catch((e: unknown) => ctx.log(`   ⚠️ toggle email channel failed: ${e instanceof Error ? e.message : e}`));
      await page.click("[data-testid=crm-portal-invite-submit]");
      await new Promise((r) => setTimeout(r, 1_000));
      await ctx.shot(page, "02c-after-invite-submit");
      const inviteMsgText = await page.$eval("[data-testid=crm-360-sheet], body", (el: any) => el.textContent ?? "").catch(() => null);
      ctx.log(`   panel text after submit: ${JSON.stringify(inviteMsgText?.slice(0, 500))}`);
      await page.waitForSelector("[data-testid=crm-portal-invite-link]", { timeout: 15_000 });
      inviteUrl = await page.$eval("[data-testid=crm-portal-invite-link]", (el: any) => el.value ?? el.textContent);
      await ctx.shot(page, "03-portal-invite-link");
      await page.close();
      ctx.check("US3-2", "portal.invite() returned an invite link", true, !!inviteUrl);
    }

    ctx.plan("SCRIPTED ACTION (real UI, anon → customer): open the invite link, accept, open the quotation, accept it");
    const t0 = new Date(); // SHOULD-FIX (28 Sep): captured right before the accept-click chain, not a wide 5-min-ago window
    if (!ctx.dry && inviteUrl && quotationDocId) {
      const path = inviteUrl.startsWith("http") ? new URL(inviteUrl).pathname + new URL(inviteUrl).search : inviteUrl;
      const page = await ctx.newAnonPage();
      await page.goto(`${ctx.BASE}${path}`, { waitUntil: "networkidle2", timeout: 30_000 });
      await ctx.shot(page, "04-portal-invite-page");
      const acceptBtn = await page.$("[data-testid=portal-invite-accept]");
      if (acceptBtn) {
        await Promise.all([page.waitForNavigation({ timeout: 8_000 }).catch(() => null), acceptBtn.click()]);
        await new Promise((r) => setTimeout(r, 1_000));
      }
      await ctx.shot(page, "04b-after-invite-accept-click");
      const acceptErrText = await page.$eval("body", (el: any) => el.textContent ?? "").catch(() => "");
      ctx.log(`   after accept click: url=${page.url()} bodyHasErrorText=${/error|ผิดพลาด|ไม่สำเร็จ/i.test(acceptErrText)}`);
      // track any portal/customer session cookie this flow minted so it gets swept even if the story throws after this point
      const cookies = await page.cookies();
      for (const c of cookies) if (/session/i.test(c.name)) ctx.minter.trackPortalToken(c.value);

      const portalSlugRow = await P.tenant.findFirst({ where: { id: env.tenantId }, select: { slug: true } });
      await page.goto(`${ctx.BASE}/b/${encodeURIComponent(portalSlugRow.slug)}/quotations/${quotationDocId}`, { waitUntil: "networkidle2", timeout: 30_000 });
      await ctx.shot(page, "05-portal-quote-detail");
      const respondable = await page.$("[data-testid=portal-quote-accept]");
      // PRODUCT BUG (traced against QC1, 27 Sep — confirmed, not a runner/setup issue): the portal 404s here even
      // with a real, AWAITING_ACCEPT quotation whose linked AccountContact.partyId exactly equals the CRM
      // contact's partyId (verified by direct query). Root cause: deals.ts#dealDocInput (deals.ts:1288-1299) only
      // loads the deal's CONTACT and passes `partyId: contact.partyId` (the INDIVIDUAL's party) into
      // createExternalQuotation/createExternalInvoice — but the B2B portal's document-visibility scope is the
      // COMPANY's party (`portal.ts:434`, `scope()`: `return { ...s, partyId: co.partyId, ... }` — co = the
      // CrmPortalAccess's company, not the contact). `listPortalDocs` (account/index.ts:971) filters
      // `contact: { partyId }` against that COMPANY partyId, which the document never carries. Structurally, NO
      // quotation or invoice issued through deals.issueQuotation/issueInvoice for a company-linked deal can ever
      // be visible in the B2B portal — this blocks this story's entire "customer accepts in portal" beat, not a
      // one-off flake. Fix belongs in dealDocInput: pass the deal's COMPANY partyId (not the contact's) as
      // `partyId` to createExternalQuotation/Invoice, or extend createExternalQuotation to accept both.
      ctx.check("US3-3", "portal shows the quotation as respondable (canRespond)", true, !!respondable);
      if (respondable) {
        await respondable.click();
        await page.waitForSelector("[data-testid=portal-signer-name]", { timeout: 10_000 });
        await page.click("[data-testid=portal-signer-name]", { clickCount: 3 });
        await page.keyboard.type(contactName, { delay: 10 });
        await ctx.shot(page, "06-portal-quote-confirm");
        await page.click("[data-testid=portal-quote-confirm-submit]");
        await new Promise((r) => setTimeout(r, 1_500));
        await ctx.shot(page, "07-portal-quote-accepted");
      }
      await page.close();
      await drainQuiet();
    }

    ctx.plan("assert: quotation ACCEPTED · deal auto-advanced to the configured accept-stage · activity logged · owner notified");
    if (!ctx.dry) {
      const dealAfter = await P.crmDeal.findFirst({ where: { id: dealId }, select: { stageId: true } });
      ctx.check("US3-4", `deal.stageId moved to ${wonStage.name} (respondQuotation → moveCore using CrmPipeline.stageOnQuoteAcceptedId)`, wonStage.id, dealAfter?.stageId ?? null);
      // SHOULD-FIX (28 Sep, controller review): "US3-5/6 t0 before accept + type filter" — t0 now captured right
      // before the accept click chain above (was a 5-min window that could catch unrelated deal/notification
      // activity on this shared QC1 tenant); dealId is already an exact filter on the activity query.
      const activity = await pollUntil(() => P.crmActivity.findFirst({ where: { tenantId: env.tenantId, dealId, createdAt: { gte: t0 } }, orderBy: { createdAt: "desc" } }));
      ctx.check("US3-5", "an activity was logged on the deal around the acceptance", true, !!activity);
      const notif = await pollUntil(() => P.appNotification.findFirst({ where: { tenantId: env.tenantId, recipientUserId: env.users.thana.userId, createdAt: { gte: t0 } }, orderBy: { createdAt: "desc" } }));
      ctx.check("US3-6", "the deal owner (thana) was notified of the acceptance", true, !!notif);
    } else {
      ctx.check("US3-1..6", "dry mode — assertions require the real quote-issue + portal-accept click chain", "skipped in --dry", "skipped in --dry");
    }
  } finally {
    if (!ctx.dry) {
      ctx.plan(`CLEANUP: restore pipeline.stageOnQuoteAcceptedId to its original value (${origStageOnAccept ?? "null"}) — this field is shared seed config, not this story's own row`);
      await P.crmPipeline.update({ where: { id: env.pipelines.b2b.id }, data: { stageOnQuoteAcceptedId: origStageOnAccept ?? null } }).catch((e: unknown) => ctx.log(`⚠️ restore failed: ${e instanceof Error ? e.message : e}`));
      if (restorePortalSettings) {
        ctx.plan("CLEANUP: restore the customer-portal-enabled setting to its original value (shared shop config, not this story's own row)");
        await restorePortalSettings();
      }
    }
  }
}
