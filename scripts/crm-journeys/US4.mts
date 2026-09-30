// US4 — docs/modules/20-crm-v2.md §1.4: a deal with no activity for 14 days → cron tags it "stale" → the starter rule
// creates a follow-up task + notifies the team's managers → the employee calls (call log + recording → AI summary) →
// the stale tag clears.
//
// ROUND 4: DECISION-US4-1 below is superseded (SHARK_AI_MOCK=1 on QC) — see the ROUND 4 block above step 06 for why
// the transcribe button still cannot appear (no STT provider, no settings UI) and how US4-5b is now recorded.
// DECISION-US4-1 (historical): the AI transcribe/summarize buttons (`crm-call-ai-transcribe`/`-accept`) call a real model and
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

  // ROUND 4 (controller diagnosis 1, verified): the "ถอดเสียง" fieldset of CrmCallLogModal.tsx is rendered ONLY after
  // the call is saved (`{saved && …}`, line 227) and the transcribe button ONLY when `aiState === "READY"` (line 230).
  // The old runner looked for the button BEFORE saving and attached no recording (transcribeCall refuses a CALL
  // without `recordingFileId`, calls.ts:411-413) — so it could never have appeared. This step now drives the modal's
  // real order: fill → attach a recording (`crm-call-recording-input`) → save → the transcribe section.
  // `aiState` comes from `calls.callAiStatus` (calls.ts:350-358, read server-side by deals/[dealId]/page.tsx:82):
  //   OFF         ⇐ settings.crm.ai.callTranscribe !== true — and NO UI can set it: `setCrmAiKey` (settings.ts:67) has
  //                 no caller anywhere in src/, and the CRM settings index has no "ผู้ช่วย AI" section even though the
  //                 OFF message (calls-shared.ts:147) tells staff to go to "ตั้งค่า CRM → ผู้ช่วย AI".
  //   NO_PROVIDER ⇐ getCrmTranscriber() === null — transcriber.ts:53 returns null unless registerCrmTranscriber() was
  //                 called, and nothing in src/ calls it (transcriber.ts:3-4: "RUN นี้ไม่มีผู้ให้บริการ STT").
  //                 SHARK_AI_MOCK=1 mocks only the chat model (src/lib/ai/provider.ts:211), not speech-to-text.
  // So on the QC server the button cannot appear: US4-5b is a PRODUCT GAP, recorded red-for-gap. If a later build
  // ships an STT provider + settings toggle, the READY branch below drives transcribe → accept for real and US4-5b
  // becomes a normal pass/fail check on the CALL activity's aiSummary.
  // ROUND 5 (R4-S2): the SETUP below turns `callTranscribe` on through the module because no UI can. So that a future
  // STT provider can't turn US4 green through that SETUP alone, the missing settings control is its own red-for-gap
  // check, driven by looking at the real settings UI (index + integrations) for a control labelled ถอดเสียง/transcri*.
  ctx.plan("SCRIPTED CHECK (real UI, owner): the CRM settings expose a control to turn call transcription on (settings index + integrations page)");
  if (!ctx.dry) {
    const page = await ctx.loginStaff("owner");
    const scanned: { path: string; status: number | null; hits: string[] }[] = [];
    for (const path of ["settings", "settings/integrations"]) {
      const resp = await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/${path}`, { waitUntil: "networkidle2", timeout: 30_000 }).catch(() => null);
      const hits: string[] = await page.evaluate(() => {
        const re = /ถอดเสียง|transcri/i;
        const ctrls = Array.from(document.querySelectorAll('input[type=checkbox], [role=switch], select, button, a'));
        return ctrls
          .filter((el) => re.test(((el.closest("label, section, li, div") as HTMLElement | null)?.innerText ?? (el as HTMLElement).innerText ?? "").slice(0, 400)))
          .map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}]`)
          .slice(0, 5);
      }).catch(() => []);
      scanned.push({ path, status: resp?.status() ?? null, hits });
      await ctx.shot(page, `00-settings-${path.replace("/", "-")}`);
    }
    await page.close();
    const found = scanned.some((s) => s.hits.length > 0);
    ctx.check(
      "US4-5d",
      `PRODUCT GAP — a CRM settings control exists to turn call transcription on (settings.crm.ai.callTranscribe; setCrmAiKey settings.ts:67 has no caller in src/; the OFF message calls-shared.ts:147 points to a "ผู้ช่วย AI" section that doesn't exist) — scanned ${JSON.stringify(scanned)}`,
      "a call-transcription control in the CRM settings UI",
      found ? "a call-transcription control in the CRM settings UI" : "none found on the settings index or integrations page",
      !found,
    );
  }

  let restoreAiSettings: (() => Promise<void>) | null = null;
  ctx.plan("SETUP (no UI exists — part of the US4-5b gap): settings.crm.ai.callTranscribe=true via the module's own setCrmAiKey (settings.ts:67), path-scoped restore after — so the modal shows the NEXT blocker (transcriber) rather than stopping at OFF");
  if (!ctx.dry) {
    restoreAiSettings = await lib.snapshotSettingsPath(prisma, env.SYS, ["crm", "ai"]);
    const settingsMod = (await import("@/lib/modules/crm/settings" as string)) as Any;
    await settingsMod.setCrmAiKey({ tenantId: env.tenantId, systemId: env.SYS }, "callTranscribe", true);
  }

  try { // restore settings.crm.ai even if a step below throws (shared QC1 config)
  let aiUiState = "not-reached";
  let aiUiText: string | null = null;
  let aiSummaryInUi: string | null = null;
  let saveError: string | null = null;
  ctx.plan("SCRIPTED ACTION (real UI, thana): open deal 360, log a call (outcome/note) + attach the call recording → save — clears the stale flag; then the ถอดเสียง section (transcribe → accept if the button exists)");
  if (!ctx.dry) {
    // a real (tiny) recording: 1 s of 8 kHz 8-bit mono PCM silence as a standard RIFF/WAVE file (audio/wav is on
    // CRM_RECORDING_MIME_ALLOWLIST, calls-shared.ts:28)
    const { writeFileSync } = await import("node:fs");
    const samples = 8000;
    const wav = Buffer.alloc(44 + samples, 0x80);
    wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples, 4); wav.write("WAVE", 8); wav.write("fmt ", 12);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(samples, 40);
    const wavPath = `${ctx.outDir}/qc-jrn-us4-call.wav`;
    writeFileSync(wavPath, wav);

    const page = await ctx.loginStaff("thana");
    await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/deals/${dealId}`, { waitUntil: "networkidle2", timeout: 30_000 });
    await page.waitForSelector("[data-testid=crm-call-log-open]", { timeout: 15_000 });
    await page.click("[data-testid=crm-call-log-open]");
    await page.waitForSelector("[data-testid=crm-call-save]", { timeout: 10_000 });
    const outcomeSel = await page.$("[data-testid=crm-call-outcome]");
    if (outcomeSel) await page.select("[data-testid=crm-call-outcome]", await page.$eval("[data-testid=crm-call-outcome] option:not([value=''])", (o: any) => o.value)).catch(() => {});
    await page.click("[data-testid=crm-call-note]");
    await page.keyboard.type("โทรติดตามดีลที่นิ่ง — ลูกค้าขอคิดอีก 3 วัน (qc-jrn-us4)", { delay: 5 });
    const fileInput = await page.$("[data-testid=crm-call-recording-input]");
    if (fileInput) await fileInput.uploadFile(wavPath);
    else ctx.log("   ⚠️ crm-call-recording-input not found in the modal");
    await page.waitForSelector("[data-testid=crm-call-recording-player]", { timeout: 5_000 }).catch(() => ctx.log("   ⚠️ recording preview player did not appear after picking the file"));
    await ctx.shot(page, "03-call-log-filled");
    await page.click("[data-testid=crm-call-save]");
    await page.waitForSelector("[data-testid=crm-call-saved], [data-testid=crm-call-error]", { timeout: 20_000 }).catch(() => {});
    saveError = await page.$eval("[data-testid=crm-call-error]", (el: any) => el.textContent).catch(() => null);
    if (saveError) ctx.log(`   ⚠️ call-log save error shown inline: ${saveError}`);
    await ctx.shot(page, "04-after-call-save-transcribe-section");
    const aiBtn = await page.$("[data-testid=crm-call-ai-transcribe]");
    if (aiBtn) {
      aiUiState = "READY";
      await aiBtn.click();
      await page.waitForSelector("[data-testid=crm-call-ai-card], [data-testid=crm-call-ai-error]", { timeout: 30_000 }).catch(() => {});
      await ctx.shot(page, "04b-call-ai-proposal");
      aiUiText = await page.$eval("[data-testid=crm-call-ai-error]", (el: any) => el.textContent).catch(() => null);
      aiSummaryInUi = await page.$eval("[data-testid=crm-call-ai-summary]", (el: any) => el.value || el.textContent).catch(() => null);
      const acceptBtn = await page.$("[data-testid=crm-call-ai-accept]");
      if (acceptBtn) {
        await acceptBtn.click();
        await page.waitForFunction(() => !document.querySelector("[data-testid=crm-call-ai-card]"), { timeout: 15_000 }).catch(() => {});
        await ctx.shot(page, "04c-call-ai-accepted");
      }
    } else {
      const unavailable = await page.$eval("[data-testid=crm-call-ai-unavailable]", (el: any) => el.textContent).catch(() => null);
      aiUiState = unavailable !== null ? "UNAVAILABLE" : "SECTION-ABSENT";
      aiUiText = unavailable;
    }
    ctx.log(`   ถอดเสียง section: state=${aiUiState} text=${JSON.stringify(aiUiText)} summaryInUi=${JSON.stringify(aiSummaryInUi)}`);
    await page.close();
  }

  ctx.plan("assert: CrmActivity(type=CALL) recorded with its recording · AI summary on the CALL (gap if no transcriber) · deal.stalledAt cleared");
  if (!ctx.dry) {
    const call = await pollUntil(() => P.crmActivity.findFirst({ where: { tenantId: env.tenantId, dealId, type: "CALL" }, orderBy: { createdAt: "desc" } }));
    ctx.check("US4-5", "a CALL activity was recorded on the deal", true, !!call);
    ctx.own("fileAsset", call?.recordingFileId);
    if (call?.recordingFileId) {
      // ROUND 5 (N5): standing list of every recording FileAsset this journey ever created — the leftover probe
      // verifies each one is gone from the DB after cleanup (FileAsset has no tag-bearing column to search by)
      const { appendFileSync } = await import("node:fs");
      appendFileSync(`${ctx.outDir}/../us4-recording-fileassets.log`, `${new Date().toISOString()} ${call.recordingFileId}\n`);
    }
    ctx.check("US4-5c", `the call recording picked in the modal was stored on the CALL activity (recordingFileId set; inline save error: ${JSON.stringify(saveError)})`, true, !!call?.recordingFileId);
    if (aiUiState === "READY") {
      ctx.check("US4-5b", "the AI transcript/summary proposal was accepted in the modal and landed on the CALL activity (story: \"AI ถอด/สรุป\")", true, !!call?.aiSummary);
    } else {
      // ROUND 5 (R4-S1): the known gap has exactly ONE signature — section present, state UNAVAILABLE, text ===
      // CRM_TRANSCRIBER_MISSING_MSG (calls-shared.ts:145). Section missing after save, not reached, or the OFF text
      // (= the SETUP above did nothing) is a regression, reported as a plain ❌, never as the known gap.
      const shared = (await import("@/lib/modules/crm/calls-shared" as string)) as Any;
      const missingMsg = String(shared.CRM_TRANSCRIBER_MISSING_MSG ?? "");
      const isKnownGap = aiUiState === "UNAVAILABLE" && !!missingMsg && String(aiUiText ?? "").trim() === missingMsg.trim();
      ctx.check(
        "US4-5b",
        isKnownGap
          ? "PRODUCT GAP — story \"AI ถอด/สรุป\": after saving a call WITH a recording, the modal's ถอดเสียง section offers no transcribe button because no speech-to-text provider is registered in the server process (transcriber.ts:53 getCrmTranscriber() → null; registerCrmTranscriber has no caller in src/; SHARK_AI_MOCK only mocks the chat model, provider.ts:211). The AI summary never reaches the CALL activity"
          : "REGRESSION (not the known gap) — after saving a call with a recording, the ถอดเสียง section must show either the transcribe button (READY) or exactly the 'transcriber missing' notice; it showed neither",
        { section: "READY (crm-call-ai-transcribe shown)", activityAiSummary: "non-empty" },
        { section: `${aiUiState}: ${aiUiText ?? "<none>"}`, activityAiSummary: call?.aiSummary ?? null },
        isKnownGap,
      );
    }
    const dealAfter = await P.crmDeal.findFirst({ where: { id: dealId }, select: { stalledAt: true } });
    ctx.check("US4-6", `deal.stalledAt cleared after the logged activity touched the deal (was: ${dealAfter?.stalledAt ?? "null"})`, null, dealAfter?.stalledAt ?? null);

    ctx.plan("CLEANUP: remove the call recording through the product's own removeRecording (deletes the stored object + FileAsset) · restore settings.crm.ai");
    if (call?.recordingFileId) {
      const { ctx: tctx, actor: thanaActor } = await actorFor(prisma, env, "thana");
      const callsMod = (await import("@/lib/modules/crm/calls" as string)) as Any;
      await callsMod.removeRecording(tctx, thanaActor, call.id, { confirm: true, reason: "qc-jrn-us4 cleanup of the test recording" }).catch((e: unknown) => ctx.log(`⚠️ removeRecording cleanup: ${e instanceof Error ? e.message : e} — FileAsset id kept in created.json for --clean`));
    }
  } else {
    ctx.check("US4-1..6", "dry mode — assertions require markStale + cron trigger + real call-log click", "skipped in --dry", "skipped in --dry");
  }
  } finally {
    if (restoreAiSettings) await restoreAiSettings();
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
