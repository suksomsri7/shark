// US4 — docs/modules/20-crm-v2.md §1.4: a deal with no activity for 14 days → cron tags it "stale" → the starter rule
// creates a follow-up task + notifies the team's managers → the employee calls (call log + recording → AI summary) →
// the stale tag clears.
//
// DECISION-US4-1: the AI transcribe/summarize buttons (`crm-call-ai-transcribe`/`-accept`) call a real model and
// spend AI credits (see registry: `AiCreditTxn(source=CRM_ASSIST)`), the same reason other WOs' journeys avoid
// pressing AI buttons (visual-crm.mts C3.4 notes: "ไม่กดปุ่ม AI"). This oracle fills the call-log fields directly
// (outcome/duration/note) instead of exercising the AI path — the assertion that matters for this story (call log →
// stale flag clears) does not depend on AI at all.
// DECISION-US4-2: "cron marks the deal stale" and "the cron trigger engine fires the starter rule" have no UI
// trigger (no "run cron now" button exists anywhere) — this journey calls the real cron entrypoints
// (`deals.markStale`, `automation.runCronTriggers`) directly, exactly like visual-crm.mts's own C2.10 setup block
// already does for screenshots. Everything downstream of that (starter-rule creation/toggle, the call log) IS real UI.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lib = (await import("./lib.mts" as string)) as Any;
const { actorFor, drainQuiet, pollUntil } = lib;

export async function run(ctx: Any): Promise<void> {
  const { prisma, env } = ctx;
  const P = prisma as any;

  ctx.plan("resolve: owner actor · thana (deal owner, phuket) · manager (phuket lead, should get the notify)");
  const { ctx: octx, actor: ownerActor } = await actorFor(prisma, env, "owner");
  const firstOpen = env.pipelines.b2b.stages.find((s: Any) => s.kind === "OPEN")!;

  const companyName = `บริษัท US4 ${ctx.tag}`;
  const contactName = `ผู้ติดต่อ US4 ${ctx.tag}`;
  const dealTitle = `ดีล US4 ${ctx.tag}`;
  let contactId: string | null = null;
  let dealId: string | null = null;

  ctx.plan("SETUP (facade): company + contact + deal owned by thana, backdated lastActivityAt 20 days ago (no UI for backdating time)");
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    const co = await (crm as any).companies.createCompany(octx, ownerActor, { name: companyName });
    const companyId = co.id ?? co.company?.id ?? co.companyId;
    ctx.own("crmCompany", companyId);
    const contactRes = await (crm as any).contacts.createContact(octx, ownerActor, { firstName: contactName, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: env.users.thana.userId });
    contactId = contactRes.contact?.id ?? null;
    ctx.own("crmContact", contactId);
    // RUNNER FIX (see US3.mts for the full trace): createContact's `companyId` param only writes the CACHE column,
    // not the real CrmCompanyContact junction createDeal validates against — use companies.addContact for real.
    await (crm as any).companies.addContact(octx, ownerActor, companyId, { contactId, isPrimary: true });
    const deal = await (crm as any).deals.createDeal(octx, ownerActor, { pipelineId: env.pipelines.b2b.id, stageId: firstOpen.id, title: dealTitle, contactId, companyId, ownerUserId: env.users.thana.userId, valueSatang: 80_000 });
    dealId = deal.id;
    ctx.own("crmDeal", dealId);
    const old = new Date(Date.now() - 20 * 86_400_000);
    await P.crmDeal.update({ where: { id: dealId }, data: { lastActivityAt: old } });
  }

  ctx.plan("SETUP (facade — cron entrypoint, no UI exists): deals.markStale() over this tenant/system");
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    await (crm as any).deals.markStale({ now: new Date(), tenantIds: [env.tenantId], systemIds: [env.SYS], deps: { push: async () => ({ ok: true }), email: async () => ({ ok: true }) } });
    const deal = await P.crmDeal.findFirst({ where: { id: dealId }, select: { stalledAt: true } });
    ctx.check("US4-1", "markStale tagged the deal (stalledAt set)", true, !!deal?.stalledAt);
  }

  let staleRuleId: string | null = null;
  let staleRuleWasDisabled = false;
  let staleStarterIdsWeCreated: string[] = [];
  ctx.plan("SCRIPTED ACTION (real UI, owner): /settings/automation → \"ใช้ชุดกฎเริ่มต้น\" → enable \"ดีลนิ่ง 14 วัน — งานติดตาม + แจ้งหัวหน้าทีม\"");
  if (!ctx.dry) {
    const before = new Set((await P.automationRule.findMany({ where: { tenantId: env.tenantId, crmSystemId: env.SYS, scope: "CRM" }, select: { id: true } })).map((r: Any) => r.id));
    const page = await ctx.loginStaff("owner");
    await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/settings/automation`, { waitUntil: "networkidle2", timeout: 30_000 });
    await page.waitForSelector("[data-testid=crm-auto-starters]", { timeout: 15_000 });
    await page.click("[data-testid=crm-auto-starters]");
    await new Promise((r) => setTimeout(r, 1_200));
    await ctx.shot(page, "01-starters-applied");
    const afterRows = await P.automationRule.findMany({ where: { tenantId: env.tenantId, crmSystemId: env.SYS, scope: "CRM" }, select: { id: true } });
    staleStarterIdsWeCreated = afterRows.filter((r: Any) => !before.has(r.id)).map((r: Any) => r.id); // shared tenant config — only clean up what THIS run added
    // RUNNER FIX: applyStarterRules (crm-auto-starters click) can take a beat to actually commit/become queryable
    // under QC1 contention (this box runs many parallel lanes) — the old code read `rule` once, ~1.2s after the
    // click, which could still be null on a busy server, silently skipping the whole enable-toggle block below and
    // leaving deal-stale-14 disabled for the rest of the run (same race class as drainQuiet() — see lib.mts doc).
    const rule = await pollUntil(() => P.automationRule.findFirst({ where: { tenantId: env.tenantId, crmSystemId: env.SYS, scope: "CRM", event: "crm.deal.stale", name: "ดีลนิ่ง 14 วัน — งานติดตาม + แจ้งหัวหน้าทีม" }, select: { id: true, enabled: true, name: true } }));
    staleRuleId = rule?.id ?? null;
    if (rule && !rule.enabled) {
      staleRuleWasDisabled = true;
      // RUNNER FIX (found running against QC1, 27-28 Sep — screenshot evidence 04-02-stale-rule-enabled.png shows
      // the toggle still OFF): `crm-auto-rule-toggle` (CrmAutomationBuilder.tsx:539) is NOT suffixed with the rule
      // id — every row's toggle button shares the exact same literal testid, scoped only by its parent
      // `[data-testid=crm-auto-rule-row]` (line 530). The old selector `crm-auto-rule-toggle-${rule.id}` never
      // matched anything (on either the direct click or the dispatch fallback), so the rule was NEVER actually
      // enabled and everything downstream (US4-3/4) cascaded from that. Fixed: find the row by its rule NAME text,
      // click the toggle inside that specific row.
      const clicked = await page.evaluate((name: string) => {
        const rows = Array.from(document.querySelectorAll('[data-testid="crm-auto-rule-row"]'));
        const row = rows.find((r) => r.textContent?.includes(name));
        const btn = row?.querySelector('[data-testid="crm-auto-rule-toggle"]') as HTMLElement | null;
        if (btn) { btn.click(); return true; }
        return false;
      }, rule.name ?? "ดีลนิ่ง 14 วัน — งานติดตาม + แจ้งหัวหน้าทีม");
      ctx.log(`   clicked deal-stale-14 toggle by row-text match: ${clicked}`);
      await new Promise((r) => setTimeout(r, 800));
    }
    await ctx.shot(page, "02-stale-rule-enabled");
    await page.close();
    const ruleAfter = rule ? await pollUntil(() => P.automationRule.findFirst({ where: { id: rule.id, enabled: true }, select: { enabled: true } })) : null;
    ctx.check("US4-2", `starter rule "deal-stale-14" exists and is enabled (found rule: ${!!rule})`, true, ruleAfter?.enabled === true);
  }

  ctx.plan("SETUP (facade — cron entrypoint, no UI exists): automation.runCronTriggers() to fire the now-enabled stale rule");
  // SHOULD-FIX (28 Sep, controller review): "US4-4 t0 after markStale + filter by rule" — capture t0 right before
  // the actual trigger (runCronTriggers, which is what fires NOTIFY_STAFF), not before markStale/starter-rule setup
  // minutes earlier; NOTIFY_STAFF's body is `กฎอัตโนมัติ "<rule name>" · เปิดดู <link>` (automation.ts ~line 964) — filter on it.
  const t0 = new Date();
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    await (crm as any).automation.runCronTriggers({ now: new Date(), tenantId: env.tenantId, deps: { push: async () => ({ ok: true }), email: async () => ({ ok: true }) } }).catch((e: unknown) => ctx.log(`⚠️ runCronTriggers: ${e instanceof Error ? e.message : e}`));
    await drainQuiet();
    const task = await pollUntil(() => P.crmActivity.findFirst({ where: { tenantId: env.tenantId, dealId, type: "TASK" }, orderBy: { createdAt: "desc" } }));
    ctx.check("US4-3", "starter rule created a follow-up TASK activity on the stale deal", true, !!task);
    const ruleName = "ดีลนิ่ง 14 วัน — งานติดตาม + แจ้งหัวหน้าทีม";
    const notif = await pollUntil(() => P.appNotification.findFirst({ where: { tenantId: env.tenantId, recipientUserId: env.users.manager.userId, createdAt: { gte: t0 }, body: { contains: ruleName } }, orderBy: { createdAt: "desc" } }));
    ctx.check("US4-4", `the phuket team's manager was notified BY THIS RULE (NOTIFY_STAFF to=managers, body contains "${ruleName}")`, true, !!notif);
  }

  ctx.plan("SCRIPTED ACTION (real UI, thana): open deal 360, log a call (outcome/duration/note) — clears the stale flag");
  if (!ctx.dry) {
    const page = await ctx.loginStaff("thana");
    await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/deals/${dealId}`, { waitUntil: "networkidle2", timeout: 30_000 });
    await page.waitForSelector("[data-testid=crm-call-log-open]", { timeout: 15_000 });
    await page.click("[data-testid=crm-call-log-open]");
    await page.waitForSelector("[data-testid=crm-call-save]", { timeout: 10_000 });
    const outcomeSel = await page.$("[data-testid=crm-call-outcome]");
    if (outcomeSel) await page.select("[data-testid=crm-call-outcome]", await page.$eval("[data-testid=crm-call-outcome] option:not([value=''])", (o: any) => o.value)).catch(() => {});
    await page.click("[data-testid=crm-call-note]");
    await page.keyboard.type("โทรติดตามดีลที่นิ่ง — ลูกค้าขอคิดอีก 3 วัน (qc-jrn-us4)", { delay: 5 });
    // ROUND 3 (controller): SHARK_AI_MOCK=1 is confirmed on the QC server — the AI transcribe/summarize step is now
    // free and deterministic, so drive it for real instead of the earlier DECISION-US4-1 (avoid real model cost).
    const aiBtn = await page.$("[data-testid=crm-call-ai-transcribe]");
    let aiSummaryFilled = false;
    if (aiBtn) {
      await aiBtn.click();
      await page.waitForSelector("[data-testid=crm-call-ai-accept]", { timeout: 15_000 }).catch(() => {});
      await ctx.shot(page, "03b-call-ai-proposal");
      const acceptBtn = await page.$("[data-testid=crm-call-ai-accept]");
      if (acceptBtn) {
        await acceptBtn.click();
        await new Promise((r) => setTimeout(r, 800));
        aiSummaryFilled = !!(await page.$eval("[data-testid=crm-call-ai-summary]", (el: any) => el.value || el.textContent).catch(() => null));
      }
    }
    ctx.log(`   AI transcribe/accept (SHARK_AI_MOCK=1): button present=${!!aiBtn} summaryFilled=${aiSummaryFilled}`);
    await ctx.shot(page, "03-call-log-filled");
    await page.click("[data-testid=crm-call-save]");
    await new Promise((r) => setTimeout(r, 1_200));
    await ctx.shot(page, "04-after-call-log");
    await page.close();
  }

  ctx.plan("assert: CrmActivity(type=CALL) recorded · deal.stalledAt cleared");
  if (!ctx.dry) {
    const call = await P.crmActivity.findFirst({ where: { tenantId: env.tenantId, dealId, type: "CALL" }, orderBy: { createdAt: "desc" } });
    ctx.check("US4-5", "a CALL activity was recorded on the deal", true, !!call);
    ctx.check("US4-5b", "the AI (SHARK_AI_MOCK=1) transcript/summary proposal was accepted and landed on the CALL activity (story: \"AI ถอด/สรุป\")", true, !!call?.aiSummary);
    const dealAfter = await P.crmDeal.findFirst({ where: { id: dealId }, select: { stalledAt: true } });
    ctx.check("US4-6", `deal.stalledAt cleared after the logged activity touched the deal (was: ${dealAfter?.stalledAt ?? "null"})`, null, dealAfter?.stalledAt ?? null);
  } else {
    ctx.check("US4-1..6", "dry mode — assertions require markStale + cron trigger + real call-log click", "skipped in --dry", "skipped in --dry");
  }

  if (!ctx.dry) {
    ctx.plan("CLEANUP: restore automation rule state — delete starter rules THIS run created, or restore deal-stale-14's enabled flag if it pre-existed disabled");
    const crm = await import("@/lib/modules/crm");
    const { ctx: octx2, actor: ownerActor2 } = await actorFor(prisma, env, "owner");
    if (staleStarterIdsWeCreated.length) {
      await P.automationRule.deleteMany({ where: { id: { in: staleStarterIdsWeCreated } } }).catch((e: unknown) => ctx.log(`⚠️ starter-rule cleanup: ${e instanceof Error ? e.message : e}`));
    } else if (staleRuleId && staleRuleWasDisabled) {
      await (crm as any).automation.toggleRule(octx2, ownerActor2, staleRuleId, false).catch((e: unknown) => ctx.log(`⚠️ restore deal-stale-14 disabled: ${e instanceof Error ? e.message : e}`));
    }
  }
}
