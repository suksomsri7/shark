// US1 — docs/modules/20-crm-v2.md §1.4: customer fills the shop's public web form (with utm) → new lead lands in the
// CRM system the form targets → round-robin assigned to the ภูเก็ต team → assigned employee is notified → +10 score
// → first-touch source = WEB_FORM with the utm intact.
//
// SETUP (facade calls, not UI — see crm-brief-C4.4.md DECISION-US1-1): the shop's own public web form is built and
// published through the separate `forms` module (`/app/forms/new`), which has no `data-testid`s at all (out of scope
// for the CRM registry this WO's UI gate covers) — the form itself is created via `forms.createForm` directly.
// SCRIPTED ACTION (real UI): the actual story action — a stranger filling `/f/<token>` — IS driven through the real
// public page (src/app/(store)/f/[token]/page.tsx), including the honeypot/min-fill-time spam guard timing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lib = (await import("./lib.mts" as string)) as Any;
const { actorFor, drainQuiet, pollUntil } = lib;

export async function run(ctx: Any): Promise<void> {
  const { prisma, env } = ctx;
  const P = prisma as any;

  ctx.plan(`resolve: CRM system ${env.SYS} · phuket team ${env.teams.phuket} · owner/thana users`);
  const { ctx: fctx, actor: ownerActor } = await actorFor(prisma, env, "owner");
  const thanaId = env.users.thana.userId;

  ctx.plan("setup (facade, no UI — see DECISION-US1-1): create round-robin assignment rule → phuket team, active");
  let ruleId: string | null = null;
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    const rule = await (crm as any).assignment.createRule(fctx, ownerActor, {
      name: `${ctx.tag}-round-robin-phuket`,
      mode: "ROUND_ROBIN",
      teamId: env.teams.phuket,
      conditions: null,
      active: true,
    });
    ruleId = rule.id;
    ctx.own("crmAssignmentRule", ruleId);
  }

  // RUNNER FIX (found running against QC1, 27 Sep): "employee gets notified" is real (AppNotification via the
  // "new-lead" starter rule's NOTIFY_STAFF(to:"owner") action — `to:"owner"` here means the RECORD's owner
  // (`ownerOf()` at automation.ts:841-843 reads `s.contact.ownerUserId` FIRST, only falling back to the tenant
  // owner role if the record has none) — i.e. exactly the round-robin-assigned employee, not the shop owner role.
  // Starter rules ship `enabled: false` (registry: crm-auto-starters db note) — this journey's first run omitted
  // applying+enabling them, so US1-6 failed for a setup reason, not a product reason. Fixed here, not weakened.
  ctx.plan('setup (facade, no UI — same as US4\'s starter-rule setup): apply CRM starter rules, enable "new-lead" (lead ใหม่ — งานต้อนรับ + แจ้งผู้ดูแล)');
  let newLeadRuleId: string | null = null;
  let newLeadRuleWasDisabled = false;
  let starterRuleIdsWeCreated: string[] = [];
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    const before = new Set((await (prisma as any).automationRule.findMany({ where: { tenantId: env.tenantId, crmSystemId: env.SYS, scope: "CRM" }, select: { id: true } })).map((r: Any) => r.id));
    await (crm as any).automation.applyStarterRules(fctx, ownerActor).catch((e: unknown) => ctx.log(`⚠️ applyStarterRules: ${e instanceof Error ? e.message : e}`));
    const afterRows = await (prisma as any).automationRule.findMany({ where: { tenantId: env.tenantId, crmSystemId: env.SYS, scope: "CRM" }, select: { id: true, event: true, enabled: true } });
    starterRuleIdsWeCreated = afterRows.filter((r: Any) => !before.has(r.id)).map((r: Any) => r.id); // starter rules are shared tenant config — only clean up what THIS run actually added
    const newLeadRule = afterRows.find((r: Any) => r.event === "crm.contact.created") ?? null;
    newLeadRuleId = newLeadRule?.id ?? null;
    if (newLeadRule && !newLeadRule.enabled) {
      newLeadRuleWasDisabled = true;
      await (crm as any).automation.toggleRule(fctx, ownerActor, newLeadRule.id, true).catch((e: unknown) => ctx.log(`⚠️ toggleRule: ${e instanceof Error ? e.message : e}`));
    }
  }

  ctx.plan("setup (facade, no UI — see DECISION-US1-1): create a public lead form (name+phone, scoreOnSubmit=10) targeting this CRM system");
  let publicToken: string | null = null;
  let formId: string | null = null;
  if (!ctx.dry) {
    const formsMod = await import("@/lib/modules/forms/service");
    const form = await formsMod.createForm(
      { tenantId: env.tenantId },
      {
        name: `${ctx.tag}-ฟอร์มขอใบเสนอราคา`,
        crmEnabled: true,
        fields: [
          { key: "name", label: "ชื่อ-นามสกุล", type: "text", required: true },
          { key: "phone", label: "เบอร์โทร", type: "phone", required: true },
        ],
      },
    );
    formId = form.id;
    publicToken = form.publicToken;
    ctx.own("formDef", formId);
    await formsMod.updateCrmFormTarget(
      env.tenantId,
      formId,
      { crmSystemId: env.SYS, assignRuleId: ruleId, scoreOnSubmit: 10, utmCapture: true },
      ctx.BASE,
    );
  }

  const phone = `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const customerName = `ลูกค้าทดสอบ US1 ${ctx.tag}`;
  const utm = { utm_source: "facebook", utm_medium: "cpc", utm_campaign: `${ctx.tag}-campaign` };

  ctx.plan(`SCRIPTED ACTION (real UI, anon browser): open /f/${publicToken ?? "<token>"}?utm_source=facebook&utm_medium=cpc&utm_campaign=... and submit name+phone`);
  const t0 = new Date();
  if (!ctx.dry) {
    const page = await ctx.newAnonPage();
    const qs = new URLSearchParams(utm).toString();
    await page.goto(`${ctx.BASE}/f/${publicToken}?${qs}`, { waitUntil: "networkidle2", timeout: 30_000 });
    await ctx.shot(page, "01-public-form-open");
    await page.waitForSelector("[data-testid=form-public-form]", { timeout: 10_000 });
    await page.click("[data-testid=form-public-field-name]", { clickCount: 3 });
    await page.keyboard.type(customerName, { delay: 10 });
    await page.click("[data-testid=form-public-field-phone]", { clickCount: 3 });
    await page.keyboard.type(phone, { delay: 10 });
    // spam guard minSeconds default = 3s (forms/spam-guard.ts FORM_SPAM_GUARD_DEFAULTS) — submitting faster is rejected
    await new Promise((r) => setTimeout(r, 3_200));
    await page.click("[data-testid=form-public-submit]");
    await page.waitForSelector("[data-testid=form-public-done]", { timeout: 15_000 });
    await ctx.shot(page, "02-public-form-done");
    ctx.check("US1-1", "public form shows the thank-you state after submit", true, true);
    await page.close();
    await drainQuiet(); // forms.submission.received → crmBridge(onFormLead) [main] + onScoringEvent [extra]
  }

  ctx.plan("assert: CrmContact created — sourceKind=WEB_FORM, sourceDetail carries utm, ownerUserId in phuket team, score=10");
  if (!ctx.dry) {
    // the outbox consumer that creates this row may still be in flight — see drainQuiet()'s doc comment in lib.mts
    const contact = await pollUntil(() =>
      P.crmContact.findFirst({
        where: { tenantId: env.tenantId, systemId: env.SYS, name: customerName, phone },
        select: { id: true, sourceKind: true, sourceDetail: true, ownerUserId: true, score: true, createdAt: true },
      }),
    );
    ctx.own("crmContact", contact?.id);
    if (formId) {
      const sub = await P.formSubmission.findFirst({ where: { formId, crmContactId: contact?.id ?? undefined }, select: { id: true } }).catch(() => null);
      ctx.own("formSubmission", sub?.id); // SHOULD-FIX (28 Sep): product side-effect row --clean must also remove
    }
    ctx.check("US1-2", "lead exists with sourceKind=WEB_FORM", "WEB_FORM", contact?.sourceKind ?? null);
    const utmOk = !!contact?.sourceDetail && JSON.stringify(contact.sourceDetail).includes(utm.utm_campaign);
    ctx.check("US1-3", "sourceDetail carries the utm_campaign from the form URL", true, utmOk);
    const ownerInPhuket = contact?.ownerUserId
      ? !!(await P.teamMember.findFirst({ where: { teamId: env.teams.phuket, userId: contact.ownerUserId } }))
      : false;
    ctx.check("US1-4", `round-robin assigned the lead to a member of the ภูเก็ต team — ownerUserId=${contact?.ownerUserId}`, true, ownerInPhuket);
    ctx.check("US1-5", "score = 10 (FormDef.scoreOnSubmit) after onScoringEvent ran", 10, contact?.score ?? null);

    ctx.plan("assert: assigned employee was notified (in-app AppNotification — see DECISION-US1-2: LINE channel not implemented yet, C22)");
    const notif = contact?.ownerUserId
      ? await pollUntil(() => P.appNotification.findFirst({ where: { tenantId: env.tenantId, recipientUserId: contact.ownerUserId, createdAt: { gte: t0 } }, orderBy: { createdAt: "desc" } }))
      : null;
    ctx.check("US1-6", "assigned employee got an AppNotification (in-app — LINE is a documented gap, not this oracle's to close)", true, !!notif);
  } else {
    ctx.check("US1-1..6", "dry mode — assertions require the real form submit + drained outbox", "skipped in --dry", "skipped in --dry");
  }

  if (!ctx.dry) {
    ctx.plan("CLEANUP: restore automation rule state — delete starter rules THIS run created, or restore new-lead's enabled flag if it pre-existed disabled");
    const crm = await import("@/lib/modules/crm");
    if (starterRuleIdsWeCreated.length) {
      await (prisma as any).automationRule.deleteMany({ where: { id: { in: starterRuleIdsWeCreated } } }).catch((e: unknown) => ctx.log(`⚠️ starter-rule cleanup: ${e instanceof Error ? e.message : e}`));
    } else if (newLeadRuleId && newLeadRuleWasDisabled) {
      await (crm as any).automation.toggleRule(fctx, ownerActor, newLeadRuleId, false).catch((e: unknown) => ctx.log(`⚠️ restore new-lead disabled: ${e instanceof Error ? e.message : e}`));
    }
  }
}
