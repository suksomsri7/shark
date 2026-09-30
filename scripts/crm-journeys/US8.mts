// US8 — docs/modules/20-crm-v2.md §1.4: owner creates a custom object "สัญญา" (contract) bound to companies (1–n) —
// already seeded by C1.9, this journey doesn't recreate it — number/start/end/value/auto-renew fields, a tab on
// company 360, a rule "contract expiring in 30 days → create a renewal deal", and the REST endpoint for records.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lib = (await import("./lib.mts" as string)) as Any;
const { actorFor, drainQuiet, pollUntil } = lib;

export async function run(ctx: Any): Promise<void> {
  const { prisma, env } = ctx;
  const P = prisma as any;

  ctx.plan(`resolve: owner actor · custom object "contract" (${env.objects.contract.id}) · B2B pipeline first stage`);
  const { ctx: octx, actor: ownerActor } = await actorFor(prisma, env, "owner");
  const firstOpen = env.pipelines.b2b.stages.find((s: Any) => s.kind === "OPEN")!;

  const companyName = `บริษัท US8 ${ctx.tag}`;
  let companyId: string | null = null;

  ctx.plan("SETUP (facade): a company to hold the contract, WITH a primary contact (B3: so the rule's skip reason is genuinely about the trigger shape, not just \"no company had a contact at all\")");
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    const co = await (crm as any).companies.createCompany(octx, ownerActor, { name: companyName });
    companyId = co.id ?? co.company?.id ?? co.companyId;
    ctx.own("crmCompany", companyId);
    const contactRes = await (crm as any).contacts.createContact(octx, ownerActor, { firstName: `ผู้ติดต่อหลัก US8 ${ctx.tag}`, phone: `02${Math.floor(1_000_000 + Math.random() * 8_999_999)}`, ownerUserId: env.users.owner.userId });
    const contactId = contactRes.contact?.id ?? null;
    ctx.own("crmContact", contactId);
    await (crm as any).companies.addContact(octx, ownerActor, companyId, { contactId, isPrimary: true });
  }

  ctx.plan("SCRIPTED ACTION (real UI, owner): open the company's \"สัญญา\" tab, create a contract record ending in 25 days, auto-renew on");
  const endsAt = new Date(Date.now() + 25 * 86_400_000);
  const contractNo = `CT-${ctx.tag}`;
  let recordId: string | null = null;
  if (!ctx.dry) {
    const page = await ctx.loginStaff("owner");
    await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/companies/${companyId}`, { waitUntil: "networkidle2", timeout: 30_000 });
    // RUNNER FIX: `crm-object-tab-all-link` (registry) navigates AWAY to the global `/crm/objects/contract` list
    // (all companies) — the company-360 page's OWN tab switcher is `company-360-tab-obj-<objectKey>`
    // (page.tsx:193, `data-testid={company-360-tab-${t.key}}` where t.key="obj-contract"), which sets `?tab=`
    // client-side and renders `<CrmObjectTabPanel>` (page.tsx:214-215) — that's where the real
    // `object-record-new-btn` scoped to THIS company lives. The old selector waited 15s for a button that was
    // never going to appear on the wrong page.
    await page.waitForSelector("[data-testid=company-360-tab-obj-contract]", { timeout: 15_000 });
    await page.click("[data-testid=company-360-tab-obj-contract]");
    await page.waitForSelector("[data-testid=object-record-new-btn]", { timeout: 15_000 });
    await ctx.shot(page, "01-contract-tab");
    await page.click("[data-testid=object-record-new-btn]");
    await page.waitForSelector("[data-testid=object-record-form]", { timeout: 10_000 });
    const fill = async (key: string, value: string) => {
      const sel = `[data-testid=object-record-field-${key}]`;
      const el = await page.$(sel);
      if (!el) { ctx.log(`   ⚠️ field ${key} not found on the record form`); return; }
      // RUNNER FIX (found running against QC1, 28 Sep — screenshot .qc-shots/crm/journeys/US8/03-03-contract-saved.png
      // shows the real inline validation error + garbled "02/02/60928"): a native `<input type="date">` cannot be
      // filled by clicking + `keyboard.type("2026-09-28")` — the browser feeds each keystroke into whichever date
      // SEGMENT has focus instead of parsing the string, scrambling the value. Native date inputs always want their
      // `.value` set directly as "YYYY-MM-DD" regardless of display locale — set it via the DOM and fire
      // input+change so React's controlled-input state picks it up, instead of typing.
      const type = await el.evaluate((node: Any) => node.tagName === "INPUT" ? (node as HTMLInputElement).type : null);
      if (type === "date") {
        await el.evaluate((node: Any, v: string) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
          setter.call(node, v);
          node.dispatchEvent(new Event("input", { bubbles: true }));
          node.dispatchEvent(new Event("change", { bubbles: true }));
        }, value);
        return;
      }
      await el.click({ clickCount: 3 });
      await page.keyboard.type(value, { delay: 5 });
    };
    await fill("contractNo", contractNo);
    await fill("startAt", new Date().toISOString().slice(0, 10));
    await fill("endAt", endsAt.toISOString().slice(0, 10));
    await fill("valueSatang", "1200000");
    const autoRenew = await page.$("[data-testid=object-record-field-autoRenew]");
    if (autoRenew) await autoRenew.click().catch(() => {});
    await ctx.shot(page, "02-contract-form-filled");
    await page.click("[data-testid=object-record-save]");
    await new Promise((r) => setTimeout(r, 1_200));
    await ctx.shot(page, "03-contract-saved");
    await page.close();
    const record = await pollUntil(() => P.customRecord.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, objectId: env.objects.contract.id, parentId: companyId, title: contractNo } }));
    recordId = record?.id ?? null;
    ctx.own("customRecord", recordId);
    ctx.check("US8-1", "contract record created under the company, title = contractNo", true, !!recordId);
  }

  ctx.plan(`SCRIPTED ACTION (real UI, owner): /settings/automation → new rule: trigger custom.record.field_due(object=contract, field=endAt, daysBefore=30) → action create deal`);
  let ruleId: string | null = null;
  if (!ctx.dry) {
    // B3 (controller review 28 Sep): don't swallow select() errors — verify the value actually stuck (React-controlled
    // selects race the same way checkboxes/radios do elsewhere in this RUN) and report failures instead of hiding them.
    const selectAndVerify = async (page: Any, testid: string, value: string): Promise<boolean> => {
      const sel = `[data-testid=${testid}]`;
      const el = await page.$(sel);
      if (!el) { ctx.log(`   ⚠️ select ${testid}: element not found`); return false; }
      try {
        await page.select(sel, value);
      } catch (e) {
        ctx.log(`   ⚠️ select ${testid} -> "${value}" threw: ${e instanceof Error ? e.message : e}`);
        return false;
      }
      await new Promise((r) => setTimeout(r, 200));
      const got = await page.$eval(sel, (n: Any) => n.value).catch(() => null);
      if (got !== value) ctx.log(`   ⚠️ select ${testid}: expected "${value}", DOM shows "${got}"`);
      return got === value;
    };
    const page = await ctx.loginStaff("owner");
    await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/settings/automation`, { waitUntil: "networkidle2", timeout: 30_000 });
    await page.waitForSelector("[data-testid=crm-auto-new]", { timeout: 15_000 });
    await page.click("[data-testid=crm-auto-new]");
    await page.waitForSelector("[data-testid=crm-auto-name]", { timeout: 10_000 });
    await page.click("[data-testid=crm-auto-name]", { clickCount: 3 });
    await page.keyboard.type(`${ctx.tag}-contract-renewal`, { delay: 5 });
    const okTrigger = await selectAndVerify(page, "crm-auto-trigger", "custom.record.field_due");
    // object/field selects are conditionally rendered once trigger=custom.record.field_due — wait for them.
    await page.waitForSelector("[data-testid=crm-auto-param-object]", { timeout: 5_000 }).catch(() => {});
    const okObject = await selectAndVerify(page, "crm-auto-param-object", "contract");
    await page.waitForSelector("[data-testid=crm-auto-param-field]", { timeout: 5_000 }).catch(() => {});
    const okField = await selectAndVerify(page, "crm-auto-param-field", "endAt");
    const daysBefore = await page.$("[data-testid=crm-auto-param-days-before]");
    let okDays = false;
    if (daysBefore) {
      await daysBefore.click({ clickCount: 3 });
      await page.keyboard.type("30", { delay: 5 });
      okDays = (await page.$eval("[data-testid=crm-auto-param-days-before]", (n: Any) => n.value).catch(() => null)) === "30";
    }
    const okAction = await selectAndVerify(page, "crm-auto-action-type", "CREATE_DEAL");
    await page.waitForSelector("[data-testid=crm-auto-action-deal-title]", { timeout: 5_000 }).catch(() => {});
    const dealTitleField = await page.$("[data-testid=crm-auto-action-deal-title]");
    const dealTitleText = `ต่ออายุสัญญา {สัญญา} (${ctx.tag})`;
    if (dealTitleField) { await dealTitleField.click({ clickCount: 3 }); await page.keyboard.type(dealTitleText, { delay: 5 }); }
    const okPipeline = await selectAndVerify(page, "crm-auto-action-pipeline", env.pipelines.b2b.id);
    ctx.log(`   form field verification: trigger=${okTrigger} object=${okObject} field=${okField} daysBefore=${okDays} actionType=${okAction} pipeline=${okPipeline}`);
    await ctx.shot(page, "04-rule-form-filled");
    ctx.check("US8-0b", "every form control needed for the rule actually held its value before saving (B3: no silently-swallowed select() failures)", true, okTrigger && okObject && okField && okDays && okAction && okPipeline);
    await page.click("[data-testid=crm-auto-save]");
    await new Promise((r) => setTimeout(r, 1_200));
    await ctx.shot(page, "05-rule-saved");
    await page.close();
    const rule = await pollUntil(() => P.automationRule.findFirst({ where: { tenantId: env.tenantId, crmSystemId: env.SYS, scope: "CRM", name: `${ctx.tag}-contract-renewal` } }));
    ruleId = rule?.id ?? null;
    ctx.own("automationRule", ruleId);
    // B3: assert the FULL saved shape, not just `event` — trigger.params (objectKey/fieldKey/daysBefore) and the
    // CREATE_DEAL action must all be exactly what was entered, or a later "the rule didn't fire" finding could
    // just as easily mean "the form never actually saved these params".
    const trig = (rule?.trigger ?? {}) as Any;
    const actions = (Array.isArray(rule?.actions) ? rule.actions : []) as Any[];
    const createDealAction = actions.find((a) => a?.type === "CREATE_DEAL");
    ctx.check(
      "US8-2",
      "the automation rule saved with the exact trigger + action this journey entered",
      { event: "custom.record.field_due", objectKey: "contract", fieldKey: "endAt", daysBefore: 30, hasCreateDeal: true, pipelineId: env.pipelines.b2b.id },
      { event: rule?.event ?? null, objectKey: trig?.params?.objectKey ?? null, fieldKey: trig?.params?.fieldKey ?? null, daysBefore: trig?.params?.daysBefore ?? null, hasCreateDeal: !!createDealAction, pipelineId: createDealAction?.params?.pipelineId ?? null },
    );

    // B3-round3 (controller): `crm-auto-rule-toggle` (CrmAutomationBuilder.tsx:539) is NOT id-suffixed — every row's
    // toggle shares the same literal testid, scoped only by its parent `[data-testid=crm-auto-rule-row]` — same fix
    // as US4.mts: match the row by its rule NAME text, click the toggle inside that specific row.
    if (rule && !rule.enabled) {
      await page.close().catch(() => {});
      const page2 = await ctx.loginStaff("owner");
      await page2.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/settings/automation`, { waitUntil: "networkidle2", timeout: 30_000 });
      await page2.waitForSelector('[data-testid="crm-auto-rule-row"]', { timeout: 15_000 }).catch(() => {});
      const clicked = await page2.evaluate((name: string) => {
        const rows = Array.from(document.querySelectorAll('[data-testid="crm-auto-rule-row"]'));
        const row = rows.find((r) => r.textContent?.includes(name));
        const btn = row?.querySelector('[data-testid="crm-auto-rule-toggle"]') as HTMLElement | null;
        if (btn) { btn.click(); return true; }
        return false;
      }, `${ctx.tag}-contract-renewal`);
      ctx.log(`   clicked contract-renewal toggle by row-text match: ${clicked}`);
      await new Promise((r) => setTimeout(r, 800));
      await ctx.shot(page2, "05b-rule-enabled");
      await page2.close();
      const ruleAfter = await pollUntil(() => P.automationRule.findFirst({ where: { id: rule.id }, select: { enabled: true } }).then((r: Any) => (r?.enabled ? r : null)));
      ctx.check("US8-2b", "the rule is enabled via the real UI toggle (not a prisma write)", true, !!ruleAfter?.enabled);
    }
  }

  ctx.plan("SETUP (facade — cron entrypoint, no UI exists, same as US4): automation.runCronTriggers() to fire the field-due rule");
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    await (crm as any).automation.runCronTriggers({ now: new Date(), tenantId: env.tenantId, deps: { push: async () => ({ ok: true }), email: async () => ({ ok: true }) } }).catch((e: unknown) => ctx.log(`⚠️ runCronTriggers: ${e instanceof Error ? e.message : e}`));
    await drainQuiet();
  }

  // TRACE (controller ruling 27 Sep — required before running): automation.ts's scope builder for a company-parented
  // custom-record trigger, read end to end:
  //   1. cronCandidatePages() case "custom.record.field_due" (automation.ts:1513-1541) yields
  //      `payload: { recordId, objectKey, fieldKey, daysBefore }` — no contactId, no dealId, no companyId in the payload.
  //   2. resolveCrmSubject() (automation.ts:646-696) loads `record` from `recordId` (line 671-674). For
  //      `record.parentType === "COMPANY"` it sets `companyId = record.parentId` (line 674) and nothing else.
  //   3. `contactId` (line 677-678) is resolved from `contactRef ?? d?.contactId ?? activity?.contactId ??
  //      (record?.parentType === "CONTACT" ? record.parentId : null)` — parentType "COMPANY" is never checked, so
  //      this is always null for a company-parented record.
  //   4. The `else if (!d && !activity && !record)` company-fallback branch (line 680) that WOULD populate contact
  //      from a bare companyId never runs here either, because `record` is truthy (step 2 loaded it).
  //   ⇒ `s.contact` is ALWAYS null for this trigger shape. automation.ts:909-912's CREATE_DEAL action hard-requires
  //   `s.contact` ("เหตุการณ์นี้ไม่มีผู้ติดต่อ — เปิดดีลให้ไม่ได้") — it will ALWAYS skip. This is confirmed as a PRODUCT
  //   BUG (per the ruling: "red = product bug"), not a maybe — the code path structurally cannot reach CREATE_DEAL
  //   for a company-parented `custom.record.field_due` trigger, which is exactly what US8's "สัญญา" object is.
  ctx.plan("assert: a renewal CrmDeal was created for the company, linked back to the contract's company — AND the rule's actual skip reason if it didn't (B3: assert the reason, don't just guess from a trace)");
  if (!ctx.dry) {
    const deal = await pollUntil(() =>
      P.crmDeal
        .findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, companyId, pipelineId: env.pipelines.b2b.id, title: { contains: contractNo.length ? contractNo : ctx.tag } }, orderBy: { createdAt: "desc" } })
        .then((d: Any) => d ?? P.crmDeal.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, companyId }, orderBy: { createdAt: "desc" } })),
    );
    ctx.own("crmDeal", deal?.id);
    // ROUND 4 cleanup fix: the rule this journey builds is system-wide (every "contract" record whose endAt is due),
    // so it ALSO opens renewal deals for QC1's seeded contracts on other companies — correct product behaviour, but
    // those deals (title carries this story's tag via the rule's title template) were never registered and survived
    // --clean (2 per run: seen from the 30 Sep 10:06 acceptance run and round-4's c44-r4-all). Register every deal
    // THIS run's rule opened. Its own "createdAt ≥ rule.createdAt" bound keeps earlier runs' rows out.
    if (ruleId) {
      const ruleRow = await P.automationRule.findFirst({ where: { id: ruleId }, select: { createdAt: true } });
      const sideDeals = ruleRow ? await P.crmDeal.findMany({ where: { tenantId: env.tenantId, systemId: env.SYS, title: { contains: `(${ctx.tag})` }, createdAt: { gte: ruleRow.createdAt } }, select: { id: true } }) : [];
      for (const d of sideDeals) if (d.id !== deal?.id) ctx.own("crmDeal", d.id);
      ctx.log(`   deals opened by this run's rule (all registered for --clean): ${sideDeals.length}`);
    }
    ctx.check("US8-3", "a renewal deal exists for the company after the field-due rule ran (PRODUCT BUG expected — see TRACE above: automation.ts:671-696,909-912 — CREATE_DEAL structurally cannot fire without s.contact, which is never populated for COMPANY-parented triggers, even with a primary contact on the company)", true, !!deal);
    if (!deal && ruleId) {
      const run = await pollUntil(() => P.automationRun.findFirst({ where: { tenantId: env.tenantId, ruleId }, orderBy: { createdAt: "desc" } }));
      ctx.own("automationRun", run?.id);
      ctx.log(`   AutomationRun for this rule: status=${run?.status} detail=${run?.detail}`);
      ctx.check(
        "US8-3b",
        // ROUND 3 (controller): the RULE run status stays "OK" even when one of its actions individually skips —
        // automation.ts:1322,1328 always finalizes the run row as status=OK; the skip is recorded INSIDE `detail`
        // via summarize() (automation.ts:1190-1195): `"ทำแล้ว 0/1 ขั้น — เปิดดีลใหม่: ข้าม (<skip note>)"`. `status:
        // "SKIPPED"` is a different whole-run dedup/loop-guard case (automation.ts:1311,1319), not this one.
        "when the deal wasn't created, the AutomationRun row's own recorded detail shows the CREATE_DEAL step was individually skipped for the TRACE's predicted reason (run status stays OK; the skip is per-step, not per-run)",
        { status: "OK", detailContainsSkip: true, detailContainsReason: true },
        { status: run?.status ?? null, detailContainsSkip: String(run?.detail ?? "").includes("ข้าม"), detailContainsReason: String(run?.detail ?? "").includes("ผู้ติดต่อ") },
      );
    }
  }

  ctx.plan("SETUP (real UI, owner): /settings/api → create an API key (crm.operate) — then REST GET /objects/contract/records/{id} and assert the field values round-trip correctly (B3)");
  if (!ctx.dry && recordId) {
    const page = await ctx.loginStaff("owner");
    await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/settings/api`, { waitUntil: "networkidle2", timeout: 30_000 });
    await page.waitForSelector("[data-testid=crm-api-new]", { timeout: 15_000 });
    await page.click("[data-testid=crm-api-new]");
    await page.waitForSelector("[data-testid=crm-api-key-name]", { timeout: 10_000 });
    await page.click("[data-testid=crm-api-key-name]", { clickCount: 3 });
    await page.keyboard.type(`${ctx.tag}-rest-check`, { delay: 5 });
    await page.waitForSelector('[data-testid="crm-api-key-bundle-crm.operate"]', { timeout: 5_000 }).catch(() => {});
    await page.click('[data-testid="crm-api-key-bundle-crm.operate"]').catch(() => {});
    await page.click("[data-testid=crm-api-key-submit]");
    await new Promise((r) => setTimeout(r, 1_200));
    const bodyText = await page.evaluate(() => document.body.innerText);
    const apiKeyPlain = /[A-Za-z0-9_-]{24,}/.exec(bodyText.replace(/\n/g, " "))?.[0] ?? null;
    const createdKey = await P.apiKey.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, name: `${ctx.tag}-rest-check` } });
    ctx.own("apiKey", createdKey?.id);
    await page.close();

    if (apiKeyPlain) {
      const resp = await fetch(`${ctx.BASE}/api/v1/crm/objects/contract/records/${recordId}`, { headers: { Authorization: `Bearer ${apiKeyPlain}` } }).catch((e: unknown) => { ctx.log(`⚠️ GET /objects/contract/records/${recordId} failed: ${e instanceof Error ? e.message : e}`); return null; });
      const body = await resp?.json().catch(() => null);
      ctx.log(`   GET /objects/contract/records/${recordId} -> HTTP ${resp?.status} body=${JSON.stringify(body).slice(0, 800)}`);
      // response shape not yet confirmed against a real run — check the plausible nestings and log the raw body
      // above either way so a controller reading the log can see exactly what came back.
      const rec = body?.data?.record ?? body?.data ?? body?.record ?? body ?? {};
      const values = rec?.values ?? rec?.fields ?? {};
      ctx.check(
        "US8-4",
        "REST GET returns this record with the exact field values entered on the form",
        { contractNo, valueSatang: 1_200_000, autoRenew: true },
        { contractNo: values?.contractNo ?? rec?.title ?? null, valueSatang: Number(values?.valueSatang ?? NaN), autoRenew: values?.autoRenew ?? null },
      );
    } else {
      ctx.check("US8-4", "REST GET /objects/contract/records/{id} round-trips the field values", true, false);
    }
  }

  if (ctx.dry) ctx.check("US8-1..4", "dry mode — assertions require the real record-create + rule-save + cron-fire + REST clicks", "skipped in --dry", "skipped in --dry");
}
