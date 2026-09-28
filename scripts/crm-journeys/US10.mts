// US10 — docs/modules/20-crm-v2.md §1.4: an external AI agent does `GET /deals?stale=true` then `POST /activities`
// with an Idempotency-Key · a `crm.deal.stale` webhook fires to the shop's own system · the owner asks the in-app AI
// "ดีลไหนเสี่ยงเดือนนี้" (which deals are at risk this month) and gets 3 deals + a proposal to create follow-up tasks
// (approval required before anything is written).
//
// DECISION-US10-1 (updated per controller, 28 Sep): the webhook target SSRF guard (`webhookTargetProblem`,
// webhooks/service.ts:108-125) rejects loopback/private targets by design (X8). The controller will restart QC1
// with `WEBHOOK_ALLOW_PRIVATE=1` in its env (QC only) before this runs, and explicitly instructed: do NOT bind a
// listener on the box's public IPv4 — use 127.0.0.1 only. This script stands up a real HTTP listener in its own
// process bound to 127.0.0.1 and registers the webhook against `http://127.0.0.1:<port>/hook`, capturing the REAL
// delivered request (headers + raw body) so US10-9 can verify the ACTUAL signature, not just a well-formed one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lib = (await import("./lib.mts" as string)) as Any;
const { actorFor, drainQuiet, pollUntil } = lib;

/**
 * Controller instruction, 28 Sep: bind ONLY to 127.0.0.1 (never the box's public IPv4) — QC1's server gets
 * `WEBHOOK_ALLOW_PRIVATE=1` in its env for this run so the SSRF guard (webhooks/service.ts:108-125) allows a
 * loopback target. Captures the exact raw body bytes + `X-Shark-Signature` header of the real delivery, so US10-9
 * can recompute the HMAC over what was ACTUALLY sent and compare it to the header that ACTUALLY arrived.
 */
type Captured = { headers: Record<string, string | string[] | undefined>; body: string; at: string };

async function startCaptureServer(): Promise<{ url: string; captured: Captured[]; close: () => Promise<void> }> {
  const http = await import("node:http");
  const captured: Captured[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      captured.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8"), at: new Date().toISOString() });
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
  });
  const port = 20000 + Math.floor(Math.random() * 20000);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return {
    url: `http://127.0.0.1:${port}/hook`,
    captured,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function run(ctx: Any): Promise<void> {
  const { prisma, env } = ctx;
  const P = prisma as any;

  ctx.plan("resolve: owner actor · B2B pipeline first stage (for 3 stale test deals)");
  const { ctx: octx, actor: ownerActor } = await actorFor(prisma, env, "owner");
  const firstOpen = env.pipelines.b2b.stages.find((s: Any) => s.kind === "OPEN")!;

  ctx.plan("SCRIPTED ACTION (real UI, owner): /settings/api → create an API key (crm.operate scope) and a webhook for crm.deal.stale — registered BEFORE any deal goes stale (B2: a webhook only receives events fired AFTER it exists)");
  let apiKeyPlain: string | null = null;
  let webhookId: string | null = null;
  const capture = await startCaptureServer();
  ctx.log(`   capture server listening at ${capture.url}`);
  try {
    if (!ctx.dry) {
      const page = await ctx.loginStaff("owner");
      await page.goto(`${ctx.BASE}/app/sys/${env.SYS}/crm/settings/api`, { waitUntil: "networkidle2", timeout: 30_000 });
      await page.waitForSelector("[data-testid=crm-api-new]", { timeout: 15_000 });
      await page.click("[data-testid=crm-api-new]");
      await page.waitForSelector("[data-testid=crm-api-key-name]", { timeout: 10_000 });
      await page.click("[data-testid=crm-api-key-name]", { clickCount: 3 });
      await page.keyboard.type(`${ctx.tag}-ai-agent`, { delay: 5 });
      // RUNNER FIX (found running against QC1, 28 Sep): a `.` in an attribute VALUE needs quotes in a CSS selector.
      await page.waitForSelector('[data-testid="crm-api-key-bundle-crm.operate"]', { timeout: 5_000 });
      await page.click('[data-testid="crm-api-key-bundle-crm.operate"]').catch((e: unknown) => ctx.log(`⚠️ bundle radio click failed: ${e instanceof Error ? e.message : e}`));
      // RUNNER FIX: clicking the radio then immediately submitting can race React's onChange — verify checked, retry once.
      let bundleChecked = await page.$eval('[data-testid="crm-api-key-bundle-crm.operate"]', (el: any) => el.checked).catch(() => false);
      if (!bundleChecked) {
        await new Promise((r) => setTimeout(r, 300));
        await page.click('[data-testid="crm-api-key-bundle-crm.operate"]').catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
        bundleChecked = await page.$eval('[data-testid="crm-api-key-bundle-crm.operate"]', (el: any) => el.checked).catch(() => false);
      }
      ctx.log(`   crm-api-key-bundle-crm.operate checked=${bundleChecked}`);
      await page.click("[data-testid=crm-api-key-submit]");
      await new Promise((r) => setTimeout(r, 1_200));
      await ctx.shot(page, "01-api-key-created");
      // the plaintext secret is shown once — DECISION-US10-3: no dedicated testid for the shown value in the registry.
      const bodyText = await page.evaluate(() => document.body.innerText);
      const keyMatch = /[A-Za-z0-9_-]{24,}/.exec(bodyText.replace(/\n/g, " "));
      apiKeyPlain = keyMatch?.[0] ?? null;
      const createdKey = await P.apiKey.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, name: `${ctx.tag}-ai-agent` } });
      ctx.own("apiKey", createdKey?.id);
      ctx.check("US10-1", "an ApiKey row was created for this CRM system (crm.operate scope)", true, !!createdKey);
      ctx.log(`   ApiKey.scopesJson = ${JSON.stringify((createdKey as Any)?.scopesJson)}`);

      await page.waitForSelector("[data-testid=crm-api-hook-new]", { timeout: 10_000 });
      await page.click("[data-testid=crm-api-hook-new]");
      await page.waitForSelector("[data-testid=crm-api-hook-url]", { timeout: 10_000 });
      await page.click("[data-testid=crm-api-hook-url]", { clickCount: 3 });
      await page.keyboard.type(capture.url, { delay: 5 });
      const evtField = await page.$('[data-testid="crm-api-hook-event-crm.deal.stale"]');
      if (evtField) {
        await evtField.click();
        // RUNNER FIX (found running against QC1, 28 Sep — screenshot .qc-shots/crm/journeys/US10/02-03-webhook-created.png
        // showed the form's own inline validation "เลือกอย่างน้อย 1 เหตุการณ์ที่ต้องการฟัง": the checkbox click didn't
        // register before submit — same React-controlled-checkbox timing race already fixed once in US2 (contact-convert
        // toggles). Verify .checked and retry via a direct DOM click if the first synthetic click didn't land.
        const checked = await page.$eval('[data-testid="crm-api-hook-event-crm.deal.stale"]', (el: any) => el.checked).catch(() => null);
        if (checked !== true) {
          await page.$eval('[data-testid="crm-api-hook-event-crm.deal.stale"]', (el: any) => el.click());
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      await ctx.shot(page, "02-webhook-form");
      await page.click("[data-testid=crm-api-hook-submit]");
      await new Promise((r) => setTimeout(r, 1_200));
      await ctx.shot(page, "03-webhook-created");
      const hookErr = await page.$eval("[data-testid=crm-api-hook-msg]", (el: any) => el.textContent).catch(() => null);
      await page.close();
      const hook = await P.webhookEndpoint.findFirst({ where: { tenantId: env.tenantId, url: capture.url }, orderBy: { createdAt: "desc" } });
      webhookId = hook?.id ?? null;
      ctx.own("webhookEndpoint", webhookId);
      if (!webhookId) ctx.log(`   ⚠️ webhook registration failed — inline message: ${hookErr}`);
      ctx.check("US10-2", "a WebhookEndpoint was registered for crm.deal.stale, pointed at this run's own capture server (see DECISION-US10-1)", true, !!webhookId);
    }

    ctx.plan("SETUP (facade): 3 deals with expectedCloseAt this month + a real phone+email (positive control for the PII check below) — then markStale()");
    const dealIds: string[] = [];
    if (!ctx.dry) {
      const crm = await import("@/lib/modules/crm");
      const co = await (crm as any).companies.createCompany(octx, ownerActor, { name: `บริษัท US10 ${ctx.tag}` });
      const companyId = co.id ?? co.company?.id ?? co.companyId;
      ctx.own("crmCompany", companyId);
      for (let i = 1; i <= 3; i += 1) {
        // B2 (positive control, controller review 28 Sep): the PII check (US10-10 below) is meaningless if no PII
        // ever exists to leak — give the contact BOTH a phone and an email so a real leak has something to catch.
        const contactRes = await (crm as any).contacts.createContact(octx, ownerActor, {
          firstName: `ผู้ติดต่อ US10-${i} ${ctx.tag}`,
          phone: `03${i}${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
          email: `${ctx.tag}-${i}@example.com`,
          ownerUserId: env.users.owner.userId,
        });
        const contactId = contactRes.contact?.id ?? null;
        ctx.own("crmContact", contactId);
        // RUNNER FIX (see US3.mts for the full trace): createContact's `companyId` param only writes the CACHE
        // column, not the real CrmCompanyContact junction createDeal validates against — use companies.addContact.
        await (crm as any).companies.addContact(octx, ownerActor, companyId, { contactId, isPrimary: true });
        // B2: atRiskDeals (ai-bridges.ts:161-176) requires `expectedCloseAt < start of next Thai month` — markStale
        // alone (stalledAt) is not sufficient for the AI "ดีลไหนเสี่ยงเดือนนี้" query to pick these deals up.
        const deal = await (crm as any).deals.createDeal(octx, ownerActor, { pipelineId: env.pipelines.b2b.id, stageId: firstOpen.id, title: `ดีลเสี่ยง US10-${i} ${ctx.tag}`, contactId, companyId, ownerUserId: env.users.owner.userId, valueSatang: 40_000, expectedCloseAt: new Date() });
        ctx.own("crmDeal", deal.id);
        dealIds.push(deal.id);
        await P.crmDeal.update({ where: { id: deal.id }, data: { lastActivityAt: new Date(Date.now() - 20 * 86_400_000) } });
      }
      await (crm as any).deals.markStale({ now: new Date(), tenantIds: [env.tenantId], systemIds: [env.SYS], deps: { push: async () => ({ ok: true }), email: async () => ({ ok: true }) } });
      const staleCount = await P.crmDeal.count({ where: { id: { in: dealIds }, stalledAt: { not: null } } });
      ctx.log(`   diagnostic: ${staleCount}/${dealIds.length} of this run's deals have stalledAt set after markStale()`);
    }

    ctx.plan("SETUP (real HTTP, external AI agent persona): GET /api/v1/crm/deals?stale=true with the API key");
    if (!ctx.dry && apiKeyPlain) {
      const resp = await fetch(`${ctx.BASE}/api/v1/crm/deals?stale=true`, { headers: { Authorization: `Bearer ${apiKeyPlain}` } }).catch((e: unknown) => { ctx.log(`⚠️ GET /deals?stale=true failed: ${e instanceof Error ? e.message : e}`); return null; });
      const body = await resp?.json().catch(() => null);
      ctx.log(`   GET /deals?stale=true -> HTTP ${resp?.status} body=${JSON.stringify(body).slice(0, 500)}`);
      const items: Any[] = Array.isArray(body?.data?.items) ? body.data.items : Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [];
      const containsOurs = dealIds.every((id) => items.some((it: Any) => it.id === id));
      ctx.check("US10-3", `REST GET /deals?stale=true (the same data the AI panel is built on) returns at least the 3 stale deals just created — HTTP ${resp?.status} returned=${items.length}`, true, resp?.status === 200 && items.length >= 3 && containsOurs);

      ctx.plan("SETUP (real HTTP, external AI agent persona): POST /api/v1/crm/activities with an Idempotency-Key — retry must not duplicate");
      const idem = `${ctx.tag}-activity-${Date.now().toString(36)}`;
      const activityBody = { dealId: dealIds[0], type: "TASK", title: `ติดตามดีลเสี่ยง (${ctx.tag})`, dueAt: new Date(Date.now() + 86_400_000).toISOString() };
      const post1 = await fetch(`${ctx.BASE}/api/v1/crm/activities`, { method: "POST", headers: { Authorization: `Bearer ${apiKeyPlain}`, "content-type": "application/json", "Idempotency-Key": idem }, body: JSON.stringify(activityBody) }).catch(() => null);
      const post2 = await fetch(`${ctx.BASE}/api/v1/crm/activities`, { method: "POST", headers: { Authorization: `Bearer ${apiKeyPlain}`, "content-type": "application/json", "Idempotency-Key": idem }, body: JSON.stringify(activityBody) }).catch(() => null);
      const b1 = await post1?.json().catch(() => null);
      const b2 = await post2?.json().catch(() => null);
      ctx.log(`   POST /activities #1 -> HTTP ${post1?.status} body=${JSON.stringify(b1).slice(0, 500)}`);
      ctx.log(`   POST /activities #2 (same Idempotency-Key) -> HTTP ${post2?.status} body=${JSON.stringify(b2).slice(0, 500)}`);
      const id1 = b1?.data?.activityId ?? b1?.data?.activity?.id ?? b1?.data?.id ?? b1?.id ?? b1?.activity?.id ?? null;
      if (id1) ctx.own("crmActivity", id1);
      ctx.check("US10-4", "POST /activities created a TASK activity (2xx)", true, (post1?.status ?? 0) < 300);
      ctx.check("US10-5", "retrying with the SAME Idempotency-Key returns the SAME id, not a second row", id1, b2?.data?.activityId ?? b2?.data?.activity?.id ?? b2?.data?.id ?? b2?.id ?? b2?.activity?.id ?? null);
      const count = id1 ? await P.crmActivity.count({ where: { id: id1 } }) : 0;
      ctx.check("US10-6", "exactly one CrmActivity row exists for that idempotency key (no duplicate write)", 1, count);
    }

    ctx.plan("assert: webhook delivery for OUR stale deal(s) was attempted, with the REAL delivered signature verified against what our capture server actually received (B2)");
    if (!ctx.dry) {
      // ROUND 3 (controller, reviewer round 2): a null webhookId must fail every dependent check LOUDLY, not skip
      // them silently — round 2 found this exact silent-skip hid a real registration failure behind "9 pass".
      if (!webhookId) {
        ctx.check("US10-7", "a WebhookDelivery row (eventType=crm.deal.stale, payload.dealId ∈ our 3 deals) was created for this endpoint", true, false);
        ctx.check("US10-8b", "our capture server actually received the HTTP delivery for this event (not just a DB row)", true, false);
        ctx.check("US10-8", "WebhookEndpoint.secret is a real, non-empty value (not a placeholder) used to sign deliveries", true, false);
        ctx.check("US10-9", "recomputing hex(hmacSHA256(secret, EXACT delivered body)) matches the X-Shark-Signature header the delivery ACTUALLY carried", true, false);
        ctx.check("US10-10", "the delivered payload (positive control: our contacts have real phone+email) carries ids only — no email/phone PII leaked (X8)", true, false);
      } else {
      await drainQuiet();
      // B2: filter to eventType=crm.deal.stale AND payload.dealId ∈ dealIds — markStale() runs tenant-wide, so this
      // endpoint may also receive deliveries for OTHER stale deals already in the tenant, not just ours.
      const delivery = await pollUntil(async () => {
        const rows = await P.webhookDelivery.findMany({ where: { tenantId: env.tenantId, endpointId: webhookId, eventType: "crm.deal.stale" }, orderBy: { createdAt: "desc" }, take: 50 }).catch(() => []);
        return rows.find((r: Any) => dealIds.includes(String((r.payloadJson as Any)?.dealId ?? ""))) ?? null;
      }, { timeoutMs: 15_000, intervalMs: 1_000 });
      ctx.check("US10-7", "a WebhookDelivery row (eventType=crm.deal.stale, payload.dealId ∈ our 3 deals) was created for this endpoint", true, !!delivery);

      if (delivery) {
        const endpoint = await P.webhookEndpoint.findFirst({ where: { id: webhookId }, select: { secret: true } });
        const { createHmac } = await import("node:crypto");
        // B2: verify the ACTUAL delivered request, not a re-derivation from payloadJson — find the capture-server
        // hit whose raw body JSON-parses to the same dealId as the delivery row we matched above.
        const hit = capture.captured.find((c) => { try { return JSON.parse(c.body)?.dealId === (delivery.payloadJson as Any)?.dealId; } catch { return false; } });
        ctx.check("US10-8b", "our capture server actually received the HTTP delivery for this event (not just a DB row)", true, !!hit);
        if (hit && endpoint?.secret) {
          const sigHeader = String(hit.headers["x-shark-signature"] ?? "");
          const recomputed = createHmac("sha256", endpoint.secret).update(hit.body).digest("hex");
          ctx.check("US10-8", "WebhookEndpoint.secret is a real, non-empty value (not a placeholder) used to sign deliveries", true, typeof endpoint.secret === "string" && endpoint.secret.length >= 16);
          ctx.check("US10-9", "recomputing hex(hmacSHA256(secret, EXACT delivered body)) matches the X-Shark-Signature header the delivery ACTUALLY carried", recomputed, sigHeader);
          const piiLeak = /@[^\s"]+\.[a-z]{2,}|0[689]\d{8}/i.test(hit.body);
          ctx.check("US10-10", "the delivered payload (positive control: our contacts have real phone+email) carries ids only — no email/phone PII leaked (X8)", false, piiLeak);
        } else {
          ctx.check("US10-8", "WebhookEndpoint.secret is a real, non-empty value", true, false);
          ctx.check("US10-9", "signature verified against the actual captured delivery", true, false);
          ctx.check("US10-10", "PII check ran against the actual captured delivery", true, false);
        }
      }
      }
    }

    ctx.plan("SCRIPTED ACTION (real UI, owner — SHARK_AI_MOCK=1 on the QC server, so this is a real deterministic click, not a paid call): CRM home → \"ถามผู้ช่วย\" (ดีลไหนเสี่ยงเดือนนี้) → at-risk table → approve the follow-up-task proposal");
    if (!ctx.dry && dealIds.length) {
      const page = await ctx.loginStaff("owner");
      await page.goto(`${ctx.BASE}/app/sys/${env.SYS}`, { waitUntil: "networkidle2", timeout: 30_000 });
      await page.waitForSelector("[data-testid=crm-ai-home-at-risk]", { timeout: 15_000 });
      await page.click("[data-testid=crm-ai-home-at-risk]");
      await page.waitForSelector("[data-testid=crm-ai-at-risk-table]", { timeout: 20_000 }).catch(() => {});
      await ctx.shot(page, "04-ai-at-risk-table");
      const riskLinks = await page.$$eval('[data-testid^="crm-ai-at-risk-deal-"]', (els: Any[]) => els.map((e) => e.getAttribute("data-testid")));
      const ourRiskLinks = riskLinks.filter((t: string) => dealIds.some((id) => t === `crm-ai-at-risk-deal-${id}`));
      ctx.check("US10-11", "the at-risk table lists at least our 3 stale deals (story: \"ได้ 3 ดีล\")", true, ourRiskLinks.length >= 3);

      // approval-gated: a pending AiProposal must exist and NOTHING should be written yet
      // AiProposal has no systemId column (ai.prisma:46-61) — systemId lives inside `payload` (set by
      // ai-bridges.ts:483's claimProposal call) — filter in JS after a tenant+kind+status query.
      const pendingRows = await P.aiProposal.findMany({ where: { tenantId: env.tenantId, kind: "crm.assist.tasks", status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 10 }).catch(() => []);
      const pendingBefore = pendingRows.find((r: Any) => (r.payload as Any)?.systemId === env.SYS && (r.payload as Any)?.requestedByUserId === env.users.owner.userId) ?? null;
      ctx.own("aiProposal", pendingBefore?.id);
      const tasksBefore = await P.crmActivity.count({ where: { tenantId: env.tenantId, dealId: { in: dealIds }, type: "TASK", title: { contains: "ติดตาม" } } });
      const confirmBtn = await page.$("[data-testid=crm-ai-proposal-confirm]");
      ctx.check("US10-12", "a PENDING AiProposal exists and a confirm control is on screen before anything is written (อนุมัติก่อนทำ)", true, !!pendingBefore && !!confirmBtn);

      if (confirmBtn) {
        await confirmBtn.click();
        await new Promise((r) => setTimeout(r, 1_500));
        await ctx.shot(page, "05-ai-proposal-confirmed");
      }
      await page.close();
      await drainQuiet();

      const proposalAfter = pendingBefore ? await pollUntil(() => P.aiProposal.findFirst({ where: { id: pendingBefore.id }, select: { status: true } }).then((p: Any) => (p?.status && p.status !== "PENDING" ? p : null))) : null;
      ctx.check("US10-13", "the proposal moved out of PENDING after confirm (e.g. EXECUTED)", true, !!proposalAfter && proposalAfter.status !== "PENDING");
      const tasksAfter = await pollUntil(() => P.crmActivity.count({ where: { tenantId: env.tenantId, dealId: { in: dealIds }, type: "TASK", title: { contains: "ติดตาม" } } }).then((n: number) => (n > tasksBefore ? n : null)));
      ctx.check("US10-14", "confirming the proposal created follow-up TASK activities for the at-risk deals (only after confirm, not before)", true, (tasksAfter ?? tasksBefore) > tasksBefore);
    }

    if (ctx.dry) ctx.check("US10-1..14", "dry mode — assertions require real REST calls with a real API key + real webhook registration + a real (mocked) AI click", "skipped in --dry", "skipped in --dry");
  } finally {
    await capture.close().catch(() => {});
  }
}
