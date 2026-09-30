// US5 — docs/modules/20-crm-v2.md §1.4: send a quotation email from CRM (sender name = employee, Reply-To per C4
// settings) → customer opens it twice, clicks once → replies → lands in the shop's inbox, same thread → the
// sequence the contact was enrolled in stops itself.
//
// DECISION-US5-1: there is NO UI entry point to start a brand-new OUTBOUND thread from a contact/deal page — the
// registry's only email composer (`crm-email-composer`/`crm-email-send`) lives on `/emails/[threadKey]`, which
// requires a thread to already exist (same constraint visual-crm.mts's own C3.7 screenshot spec works around by
// seeding an inbound message first — see its `C37_THREAD.before()`). This oracle does the same: an inbound "customer
// asks a question" message opens the thread via the real facade (`emails.ingestInbound`, the same code path the
// email PROVIDER webhook uses — not a UI, there is no UI for receiving mail either), and the STORY's actual send
// action (the quotation reply) is then driven through the real `crm-email-send` button. The open/click simulation
// uses the REAL tracking routes (`/t/o/[token]`, `/t/c/[token]`) with tokens parsed out of the message that was
// actually sent — not a call to `emails.trackOpen/trackClick` with a hand-rolled token.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lib = (await import("./lib.mts" as string)) as Any;
const { actorFor, drainQuiet, pollUntil, withStaffPermissions } = lib;

export async function run(ctx: Any): Promise<void> {
  const { prisma, env } = ctx;
  const P = prisma as any;

  ctx.plan("resolve: owner actor (setup) · thana (sender) · email settings (trackOpens/trackClicks must be on)");
  const { ctx: octx, actor: ownerActor } = await actorFor(prisma, env, "owner");

  const contactName = `ผู้ติดต่อ US5 ${ctx.tag}`;
  const contactEmail = `${ctx.tag}@example.com`;
  let contactId: string | null = null;
  let sequenceId: string | null = null;
  let mailboxEmailId: string | null = null; // ROUND 4: the message the customer's mailbox actually received (see SETUP in step 06)

  ctx.plan("SETUP (facade): contact with an email · a sequence (stopOnReply=true) the contact is enrolled in");
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    const contactRes = await (crm as any).contacts.createContact(octx, ownerActor, { firstName: contactName, email: contactEmail, phone: `06${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: env.users.thana.userId });
    contactId = contactRes.contact?.id ?? null;
    ctx.own("crmContact", contactId);
    const seq = await (crm as any).sequences.createSequence(octx, ownerActor, {
      name: `${ctx.tag}-ติดตามใบเสนอราคา`,
      stopOnReply: true,
      stopOnWon: true,
      stopOnLost: true,
      businessDaysOnly: false,
      // ROUND 4: a follow-up sequence that WAITs 3 days before its first e-mail — the old EMAIL-first fixture let the
      // server's minute job ("crm.sequences" runDue) send/advance the enrollment on its own mid-journey, which could
      // change the enrollment's state before the reply and make US5-7 unattributable.
      steps: [{ kind: "WAIT", waitDays: 3 }, { kind: "EMAIL", subject: "ติดตามใบเสนอราคา", body: "เรียนคุณ {{contact.firstName}}" }],
    });
    sequenceId = seq.id;
    ctx.own("crmSequence", sequenceId);
    const enr = await (crm as any).sequences.enroll(octx, ownerActor, { sequenceId, contactId });
    ctx.own("crmSequenceEnrollment", (enr as any).enrollmentId ?? (enr as any).id);
    ctx.log(`   enroll → ${JSON.stringify(enr)}`);
    const settings = await (crm as any).emails.getEmailSettings(octx, ownerActor);
    ctx.check("US5-0", "shop email settings have open/click tracking on (or this journey can't observe opens/clicks)", true, !!settings.trackOpens && !!settings.trackClicks);
  }

  ctx.plan("SETUP (facade — inbound is a provider webhook, not a UI page; opens the thread — see DECISION-US5-1): customer asks a question by email");
  let threadKey: string | null = null;
  if (!ctx.dry) {
    const crm = await import("@/lib/modules/crm");
    const settings = await (crm as any).emails.getEmailSettings(octx, ownerActor);
    const deps = { transport: async () => ({ ok: true, providerId: `${ctx.tag}-${Date.now().toString(36)}` }), put: async () => {}, del: async () => 200 };
    const inbound = await (crm as any).emails.ingestInbound(
      {
        messageId: `<${ctx.tag}-in-${Date.now().toString(36)}@mail.example>`,
        from: `"${contactName}" <${contactEmail}>`,
        to: [settings.inboundAddress],
        subject: `สอบถามราคา (${ctx.tag})`,
        text: "รบกวนขอใบเสนอราคาแพ็กเกจดำน้ำด้วยค่ะ",
        html: "<p>รบกวนขอใบเสนอราคาแพ็กเกจดำน้ำด้วยค่ะ</p>",
        headers: {},
        attachments: [],
      },
      deps,
    );
    ctx.own("crmEmailMessage", inbound?.emailId);
    const row = inbound?.emailId ? await P.crmEmailMessage.findFirst({ where: { id: inbound.emailId }, select: { threadKey: true } }) : null;
    threadKey = row?.threadKey ?? null;
    ctx.check("US5-1", "the inbound message matched the contact and opened a thread", true, !!threadKey);

    // Controller ruling 27 Sep: quote the exact story text before deciding gap vs. correct-workaround. Story
    // (docs/modules/20-crm-v2.md §1.4, US5, verbatim): "ส่งอีเมลใบเสนอราคาจาก CRM (ชื่อผู้ส่ง = พนักงาน · Reply-To
    // ตามตั้งค่า C4) · ลูกค้าเปิด 2 ครั้ง คลิก 1 · ตอบกลับ → เข้ากล่องอีเมลร้าน → thread เดียวกัน · sequence หยุดเอง" —
    // the story OPENS with staff SENDING an email (a fresh outbound), not the customer writing in first. Since no
    // contact/deal page has a "compose new thread" control (only `/emails/[threadKey]` does, which needs a thread
    // to already exist), this is a PRODUCT GAP, not a legitimate inbound-first workaround — recording it as such.
    ctx.check(
      "US5-0-GAP",
      "PRODUCT GAP (see crm-brief-C4.4.md DECISION-US5-1): the story opens with staff SENDING a quotation email from CRM (a fresh outbound to a contact), but no contact/deal page has a \"compose new thread\" control — only replying inside an existing thread is possible; this journey opens the thread with a simulated inbound message so the send/open/click/reply/stop mechanics can still be exercised for real",
      "a compose-new-outbound-thread control exists on the contact/deal page",
      "no such control exists — thread opened via simulated inbound instead",
      true,
    );
  }

  ctx.plan("SETUP (test-fixture permission elevation, not a product gap — see withStaffPermissions() doc in lib.mts): QC1's seeded thana has NO crm.email.* keys at all (seed-crm-qc.mts:132-137) — grant crm.email.read (page gate, C37_GATE in visual-crm.mts) + crm.email.send (KEY_SEND, emails.ts:287) for this journey, restore after");
  ctx.plan("SCRIPTED ACTION (real UI, thana): open the thread, compose+send the quotation reply");
  let sentEmailId: string | null = null;
  if (!ctx.dry && threadKey) {
    await withStaffPermissions(prisma, { tenantId: env.tenantId, userId: env.users.thana.userId, keys: ["crm.email.read", "crm.email.send"] }, async () => {
      const page = await ctx.loginStaff("thana");
      const threadUrl = `${ctx.BASE}/app/sys/${env.SYS}/crm/emails/${encodeURIComponent(threadKey)}`;
      let resp = await page.goto(threadUrl, { waitUntil: "networkidle2", timeout: 30_000 });
      // RUNNER: seen once against QC1 (28 Sep) — this exact URL 404s in the browser even though calling
      // `emails.getThread()` directly with the same actor/permissions/threadKey succeeds immediately (verified via
      // a standalone diagnostic script) — not yet root-caused (not a visibility/permission bug: proven by the direct
      // facade call). Retry once after a short wait in case it's a transient full-route-cache/session-propagation
      // hiccup rather than treating a possibly-transient 404 as a hard failure on the first hit.
      if ((resp?.status() ?? 0) === 404) {
        ctx.log("   ⚠️ thread page 404'd on first navigation (unexplained — getThread() succeeds directly) — retrying once after 2s");
        await new Promise((r) => setTimeout(r, 2_000));
        resp = await page.goto(threadUrl, { waitUntil: "networkidle2", timeout: 30_000 });
      }
      await ctx.shot(page, "01-thread-open");
      await page.waitForSelector("[data-testid=crm-email-send]", { timeout: 15_000 });
      await page.click("[data-testid=crm-email-subject]", { clickCount: 3 });
      await page.keyboard.type(`ใบเสนอราคาแพ็กเกจดำน้ำ (${ctx.tag})`, { delay: 5 });
      await page.click("[data-testid=crm-email-body]");
      await page.keyboard.type("เรียนคุณลูกค้า แนบใบเสนอราคามาให้แล้วนะคะ ดูรายละเอียดได้ที่ https://example.com/quote", { delay: 5 });
      await ctx.shot(page, "02-reply-composed");
      await page.click("[data-testid=crm-email-send]");
      await new Promise((r) => setTimeout(r, 1_500));
      await ctx.shot(page, "03-after-send");
      await page.close();
    });
    const sent = await P.crmEmailMessage.findFirst({ where: { tenantId: env.tenantId, threadKey, direction: "OUT" }, orderBy: { createdAt: "desc" }, select: { id: true, bodyHtml: true, status: true, fromName: true, fromAddr: true, routing: true } });
    sentEmailId = sent?.id ?? null;
    ctx.own("crmEmailMessage", sentEmailId);
    // INFRASTRUCTURE GAP (confirmed on QC1, 28 Sep — screenshot .qc-shots/crm/journeys/US5/*-after-send.png shows
    // the real UI's own "ส่งไม่สำเร็จ" badge on the message we just sent): the compose+send UI flow itself works
    // correctly (subject/body/to filled and submitted for real, CrmEmailMessage row created with the right body) —
    // the send then fails at the REAL provider call because QC1's server has no working RESEND_API_KEY
    // (`src/lib/modules/crm/emails.ts` sendCore's provider call to https://api.resend.com/emails, ~line 820/851).
    // This is not fixable from here (`.env` is off-limits) and is not a product/runner bug — the code does exactly
    // what it should with the credentials it has.
    // ROUND 3 CORRECTION (controller, "prove it before blaming I1"): only US5-2 (and US5-2b/2c, which read fields
    // set before the provider call and so were never actually at risk either) cascade from this. US5-3/5/6/7 do
    // NOT — traced sendCore (emails.ts ~1177-1225): `composeOutgoing()` (and therefore `routing.links`, the real
    // click-tracking data) is computed and stored BEFORE the provider call runs, regardless of its outcome. US5-6/7
    // (reply + sequence-stop) are a SEPARATE `ingestInbound()` call with no dependency on send success at all.
    ctx.check("US5-2", `an OUTBOUND CrmEmailMessage was sent on the same thread (status=${sent?.status}) — if false, see the INFRASTRUCTURE GAP comment above (RESEND_API_KEY); this does NOT block US5-3/5/6/7, see ROUND 3 CORRECTION`, true, sent?.status === "SENT" || sent?.status === "QUEUED");

    // SHOULD-FIX (28 Sep, controller review): "US5 sender/Reply-To" — the row's sender identity and reply-to are
    // set BEFORE the provider call, so these are checkable independent of the RESEND_API_KEY infra gap above.
    const emailSettings = await (await import("@/lib/modules/crm")).emails.getEmailSettings(octx, ownerActor).catch(() => null);
    ctx.check("US5-2b", `sent message's sender name = thana (the employee), not a generic shop name — got fromName=${sent?.fromName}`, true, !!sent?.fromName && sent.fromName.includes(env.users.thana.name ?? "\u0000"));
    const replyTo = (sent?.routing as Any)?.replyTo ?? null;
    ctx.check("US5-2c", `sent message's Reply-To follows the shop's C4 email settings (routing.replyTo=${replyTo})`, true, !!replyTo);

    // ROUND 4 — PRODUCT BUG (click tracking can never apply to a quotation composed in the CRM UI): the body above
    // contains a URL, click tracking is ON (US5-0), yet `routing.links` of the UI-sent message is empty. Traced:
    //   • EmailComposer.tsx:98-103 HTML-escapes the whole textarea into <p> text — a typed URL never becomes <a href>;
    //   • EmailComposer.tsx:48 strips EVERY tag when a template is picked — a template's links are destroyed too;
    //   • composeOutgoing (emails.ts:924-931) only wraps `href="http(s)://…"` ⇒ nothing to wrap ⇒ links: [].
    // (Links DO work for bodies that carry real anchors — REST/API sends — see the SETUP send below.)
    const uiLinks = (sent?.routing as Any)?.links;
    ctx.check("US5-3a", "PRODUCT BUG — the quotation composed in the CRM UI (its body contains a URL, click tracking is on) carries at least one click-tracked link (routing.links); EmailComposer escapes the body to plain text (EmailComposer.tsx:98-103) and strips template tags (:48), so no <a href> ever reaches composeOutgoing (emails.ts:924-931)", ">= 1 tracked link", Array.isArray(uiLinks) && uiLinks.length >= 1 ? ">= 1 tracked link" : `routing.links=${JSON.stringify(uiLinks ?? null)}`);

    // ROUND 4 (controller ruling: "a check that cannot be evaluated may neither stay red forever nor be counted as a
    // pass"): the open pixel + wrapped links exist ONLY in the HTML handed to the mail transport — by design the DB
    // keeps hashes, never tokens (X7, emails.ts:914-919 · trackTokenHash / routing.links[].h) — and on QC the dev
    // fallback of sendEmailRich (src/lib/core/email.ts:128-131) logs the subject and DROPS that HTML. So the mail the
    // UI just sent is unobservable by any "customer" on QC. Stand-in: send the quotation once more through the
    // product's OWN exported `emails.sendEmail` (same sendCore/composeOutgoing as the UI's server action) with an
    // injected transport that captures exactly what the provider would receive = the customer's mailbox. The body
    // carries a real anchor (as a template/API-sent quotation would), pointing at the shop's portal page on QC so
    // the click's redirect never leaves QC (B1 guard stays silent).
    let capturedHtml: string | null = null;
    ctx.plan("SETUP (customer's mailbox stand-in — QC's dev mail fallback discards the composed HTML, email.ts:128-131): thana re-sends the quotation on the same thread via the product's own emails.sendEmail with a capturing transport; body has a real <a href> to the shop portal");
    const tenantRow = await P.tenant.findFirst({ where: { id: env.tenantId }, select: { slug: true } });
    const quoteLinkTarget = `${ctx.BASE}/b/${encodeURIComponent(tenantRow?.slug ?? "-")}/login`;
    await withStaffPermissions(prisma, { tenantId: env.tenantId, userId: env.users.thana.userId, keys: ["crm.email.read", "crm.email.send"] }, async () => {
      const crm = await import("@/lib/modules/crm");
      const { ctx: tctx, actor: thanaActor } = await actorFor(prisma, env, "thana");
      const res = await (crm as any).emails.sendEmail(
        tctx,
        thanaActor,
        {
          contactId,
          subject: `ใบเสนอราคาแพ็กเกจดำน้ำ — ลิงก์ดูออนไลน์ (${ctx.tag})`,
          bodyHtml: `<p>เรียนคุณลูกค้า แนบใบเสนอราคามาให้แล้วนะคะ</p><p><a href="${quoteLinkTarget}">ดูใบเสนอราคาออนไลน์</a></p>`,
          replyToEmailId: sentEmailId,
        },
        { transport: async (msg: Any) => { capturedHtml = String(msg?.html ?? ""); return { ok: true, providerId: `${ctx.tag}-mailbox-${Date.now().toString(36)}` }; } },
      ).catch((e: unknown) => { ctx.log(`⚠️ SETUP sendEmail: ${e instanceof Error ? e.message : e}`); return null; });
      mailboxEmailId = res?.emailId ?? null;
      ctx.own("crmEmailMessage", mailboxEmailId);
      ctx.log(`   SETUP send → status=${res?.status} emailId=${mailboxEmailId} capturedHtml=${capturedHtml ? `${(capturedHtml as string).length} chars` : "none"}`);
    });

    ctx.plan("SCRIPTED ACTION (real HTTP, anon browser with a real mail-client UA = the customer): open the delivered mail twice (its real /t/o pixel loads each time) and click its wrapped link once (real /t/c → 302)");
    // RUNNER FIX (ROUND 4): puppeteer's default UA contains "HeadlessChrome"; BOT_UA_RE (emails-shared.ts:193) treats
    // any "headless" UA as a link scanner and does NOT count it (trackOpen/trackClick) — a correct product rule. The
    // customer's mail client is not headless: use an Apple Mail UA.
    const MAIL_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
    const html = capturedHtml as string | null;
    const pixelM = html ? /<img[^>]+src="([^"]*\/t\/o\/([^"/]+)\.gif)"/.exec(html) : null;
    const linkM = html ? /href="([^"]*\/t\/c\/([^"/]+))"/.exec(html) : null;
    ctx.check("US5-3", `the delivered mail carries the real open pixel (/t/o/<token>.gif) and a click-wrapped link (/t/c/<token>) — pixel=${!!pixelM} link=${!!linkM}`, { pixel: true, link: true }, { pixel: !!pixelM, link: !!linkM });
    let clickLandedOn: string | null = null;
    if (html && pixelM && linkM) {
      // the tracked URLs carry the sender process's APP_URL origin; point them at the QC server under test
      const baseOf = (u: string) => { try { return new URL(u).origin; } catch { return ""; } };
      const composedBase = baseOf(pixelM[1]!);
      const qcOrigin = new URL(ctx.BASE).origin;
      const mailHtml = composedBase && composedBase !== qcOrigin ? html.split(composedBase).join(qcOrigin) : html;
      if (composedBase !== qcOrigin) ctx.log(`   note: tracked URLs were composed with base ${composedBase} — rewritten to the QC server ${qcOrigin}`);
      await new Promise((r) => setTimeout(r, 2_500)); // opens < 2 s after send are ignored by design (OPEN_MIN_AGE_MS, emails.ts:305)
      // each "open" = the mail client renders the message → its <img> fetches the real /t/o pixel. Each open is its
      // own mail-client session (fresh page + context): round-4 run b showed that re-rendering in the SAME page lets
      // Chrome reuse the already-decoded image without a second request (pixel responses [200,-1] → openCount 1),
      // which is a browser-cache artefact, not what two separate openings of a mail do.
      const pixelStatuses: number[] = [];
      let mail: Any = null;
      for (const n of [1, 2]) {
        if (mail) await mail.close();
        mail = await ctx.newAnonPage({ isolated: true });
        await mail.setUserAgent(MAIL_UA);
        const pixelResp = mail.waitForResponse((r: Any) => r.url().includes("/t/o/"), { timeout: 15_000 }).catch(() => null);
        await mail.setContent(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:16px">${mailHtml}</body>`, { waitUntil: "domcontentloaded", timeout: 15_000 });
        const r = await pixelResp;
        pixelStatuses.push(r ? r.status() : -1);
        await new Promise((res) => setTimeout(res, 800));
        await ctx.shot(mail, `06-0${n}-mail-opened-${n}`);
      }
      ctx.log(`   pixel responses for the 2 opens: ${JSON.stringify(pixelStatuses)}`);
      // the click: the customer's mail client opens the wrapped href (a GET of /t/c/<token>, following the 302).
      // Round-4 run b: a synthetic element click inside the setContent (about:blank) document never navigated
      // (url stayed about:blank, clickCount 0) — so request the exact href taken from the rendered anchor.
      const href = String(await mail.$eval('a[href*="/t/c/"]', (a: any) => a.href).catch(() => ""));
      if (href) {
        const resp = await mail.goto(href, { waitUntil: "networkidle2", timeout: 20_000 }).catch((e: unknown) => { ctx.log(`⚠️ click navigation: ${e instanceof Error ? e.message : e}`); return null; });
        const chain = resp ? [...resp.request().redirectChain().map((q: Any) => `${q.response()?.status() ?? "?"} ${q.url()}`), `${resp.status()} ${resp.url()}`] : [];
        ctx.log(`   click redirect chain: ${JSON.stringify(chain)}`);
      }
      clickLandedOn = mail.url();
      await ctx.shot(mail, "06-03-after-click");
      await mail.close();
    }
    ctx.log(`   click landed on: ${clickLandedOn}`);
    ctx.check("US5-3b", "the wrapped link redirected the customer to the ORIGINAL link target (the shop portal page)", quoteLinkTarget, clickLandedOn ? clickLandedOn.split("?")[0] : null);
  }

  ctx.plan("SETUP (facade — inbound is a provider webhook, not a UI): customer replies in the same thread");
  // Thread matching (emails.ts ingestInbound): (1) In-Reply-To/References header → parent's threadKey, else
  // (2) a `+t<short>` tag on the reply-to address, else (3) same contact + normalized subject among recent messages.
  // RUNNER BUG FIXED (ROUND 4, root cause of US5-7): the old reply carried `headers: {}` on the theory that subject
  // matching (3) "is what a real mail client reply does anyway" — false: every real client sends In-Reply-To and
  // References with the Message-ID it received. And only (1) sets `parent` (emails.ts:2074-2083); (2)/(3) set the
  // threadKey but leave parent=null, and the repliedAt flip + `stopSequencesFor(REPLY)` run only when parent is an
  // OUT message (emails.ts:2186-2196) — so the sequence could never stop. The reply now carries the Message-ID the
  // UI-sent quotation actually went out with (`<rfcId>`, emails.ts:1317; stored as `<systemId>:<rfcId>`).
  let enrollmentBeforeReply: string | null = null;
  if (!ctx.dry && threadKey && sentEmailId) {
    const crm = await import("@/lib/modules/crm");
    const settings = await (crm as any).emails.getEmailSettings(octx, ownerActor);
    const sentRow = await P.crmEmailMessage.findFirst({ where: { id: sentEmailId }, select: { subject: true, messageId: true } });
    const stored = String(sentRow?.messageId ?? "");
    const rfcId = stored.includes(":") ? stored.slice(stored.indexOf(":") + 1) : stored;
    const enrBefore = sequenceId && contactId ? await P.crmSequenceEnrollment.findFirst({ where: { tenantId: env.tenantId, sequenceId, contactId }, orderBy: { createdAt: "desc" }, select: { status: true, stoppedReason: true } }) : null;
    enrollmentBeforeReply = enrBefore?.status ?? null;
    ctx.log(`   enrollment before the reply: ${JSON.stringify(enrBefore)} · replying to Message-ID <${rfcId}>`);
    const deps = { transport: async () => ({ ok: true, providerId: `${ctx.tag}-reply-${Date.now().toString(36)}` }), put: async () => {}, del: async () => 200 };
    const reply = await (crm as any).emails.ingestInbound(
      {
        messageId: `<${ctx.tag}-reply-${Date.now().toString(36)}@mail.example>`,
        from: `"${contactName}" <${contactEmail}>`,
        to: [settings.inboundAddress],
        subject: `Re: ${sentRow?.subject ?? `ใบเสนอราคาแพ็กเกจดำน้ำ (${ctx.tag})`}`,
        text: "ขอบคุณค่ะ กำลังดูรายละเอียดอยู่",
        html: "<p>ขอบคุณค่ะ กำลังดูรายละเอียดอยู่</p>",
        headers: rfcId ? { "in-reply-to": `<${rfcId}>`, references: `<${rfcId}>` } : {},
        attachments: [],
      },
      deps,
    ).catch((e: unknown) => { ctx.log(`⚠️ reply ingest: ${e instanceof Error ? e.message : e}`); return null; });
    // RUNNER FIX: this row's id was never captured — --clean left every attempt's reply message stranded in QC1.
    ctx.own("crmEmailMessage", reply?.emailId);
    await drainQuiet();
  }

  ctx.plan("assert: click count · reply landed on the SAME threadKey · sequence auto-stopped on reply");
  if (!ctx.dry) {
    // ROUND 3 (controller): decouple the open/click counters from the reply/sequence-stop assertions — they were
    // previously ONE pollUntil requiring BOTH conditions, so a failure on one side (e.g. no click ever landed)
    // silently reported the OTHER, functionally-unrelated side as failed too, even when the reply genuinely DID
    // land (it's a separate ingestInbound() call above, nothing to do with opens/clicks).
    // ROUND 4: US5-4/5 read the counters of the message the customer actually opened/clicked (the mailbox stand-in
    // above). The old US5-4 was an unconditional pass ("not evaluable" === "not evaluable") — replaced by a real check.
    const outMsg = mailboxEmailId
      ? await pollUntil(() => P.crmEmailMessage.findFirst({ where: { id: mailboxEmailId }, select: { openCount: true, clickCount: true } }).then((m: Any) => (m && m.openCount >= 2 && m.clickCount >= 1 ? m : null)))
          .then(async (m: Any) => m ?? P.crmEmailMessage.findFirst({ where: { id: mailboxEmailId }, select: { openCount: true, clickCount: true } }))
      : null;
    ctx.check("US5-4", "the customer opened the quotation twice → the message counts exactly 2 opens (real /t/o pixel, mail-client UA)", 2, outMsg?.openCount ?? null);
    ctx.check("US5-5", "the customer clicked the link once → the message counts exactly 1 click (real /t/c)", 1, outMsg?.clickCount ?? null);

    const inCount = await pollUntil(() => P.crmEmailMessage.count({ where: { tenantId: env.tenantId, threadKey, direction: "IN" } }).then((n: number) => (n >= 2 ? n : null)));
    ctx.check("US5-6", "the customer's reply landed on the SAME thread (>=2 inbound messages, same threadKey)", true, (inCount ?? 0) >= 2);
    const repliedFlag = sentEmailId ? await P.crmEmailMessage.findFirst({ where: { id: sentEmailId }, select: { repliedAt: true } }) : null;
    ctx.check("US5-6b", "the reply was recognised as a reply TO the sent quotation (quotation.repliedAt set)", true, !!repliedFlag?.repliedAt);
    ctx.check("US5-7a", "precondition: the contact's enrollment was live (ACTIVE) right before the reply — otherwise US5-7 could not be attributed to the reply", "ACTIVE", enrollmentBeforeReply);
    const enrollment = sequenceId && contactId
      ? await pollUntil(() => P.crmSequenceEnrollment.findFirst({ where: { tenantId: env.tenantId, sequenceId, contactId, status: "STOPPED" }, select: { status: true, stoppedReason: true } }))
          .then(async (e: Any) => e ?? P.crmSequenceEnrollment.findFirst({ where: { tenantId: env.tenantId, sequenceId, contactId }, orderBy: { createdAt: "desc" }, select: { status: true, stoppedReason: true } }))
      : null;
    ctx.check("US5-7", "the sequence enrollment stopped itself BECAUSE of the reply (stopOnReply → STOPPED, reason REPLY)", { status: "STOPPED", stoppedReason: "REPLY" }, enrollment ? { status: enrollment.status, stoppedReason: enrollment.stoppedReason } : null);
  } else {
    ctx.check("US5-0..7", "dry mode — assertions require the real send + real pixel/click hits + inbound reply", "skipped in --dry", "skipped in --dry");
  }
}
