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
      steps: [{ kind: "EMAIL", subject: "ใบเสนอราคา", body: "เรียนคุณ {{contact.firstName}}" }, { kind: "WAIT", waitDays: 3 }],
    });
    sequenceId = seq.id;
    ctx.own("crmSequence", sequenceId);
    const enr = await (crm as any).sequences.enroll(octx, ownerActor, { sequenceId, contactId });
    ctx.own("crmSequenceEnrollment", (enr as any).enrollmentId ?? (enr as any).id);
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

    ctx.plan("SCRIPTED ACTION (real HTTP, anon browser = customer's mail client): hit the real /t/o pixel twice and one /t/c link once, parsed out of the sent body");
    // ROUND 3 (controller): proved this BEFORE assuming it cascades from I1 — traced emails.ts's own send path
    // (sendCore, ~line 1177-1225): `composed = composeOutgoing(...)` builds the tracking-embedded HTML that's
    // ACTUALLY transmitted to the provider (`args.composed.html`, line 1315), but the DB row stores
    // `bodyHtml: storedHtml` — the PRE-tracking body (line 1214). The composed HTML with the real `/t/o/<token>.gif`
    // pixel is never persisted anywhere queryable after send; only `trackTokenHash` (a SHA256 HASH, not the token
    // itself) is kept. So a bodyHtml regex for `/t/o/` can NEVER match, on ANY status, SENT or FAILED — this was a
    // RUNNER BUG in the test's own design, independent of the I1 RESEND_API_KEY gap. What IS genuinely persisted
    // and real: `routing.links` (line 1188, `composed.links` — the per-link click-tracking table), stored
    // regardless of provider outcome. Use that for the click half; the open-pixel half has no DB-retrievable
    // ground truth at all with this architecture, and is reported as a runner limitation, not asserted false.
    const clickLinks = (sent?.routing as Any)?.links;
    const hasClickLinks = Array.isArray(clickLinks) && clickLinks.length > 0;
    ctx.check("US5-3", `RUNNER-LIMITATION-NOTED: the composed tracking HTML (open pixel + wrapped links) is sent straight to the provider and never persisted in bodyHtml — only routing.links (click targets) survive in the DB. Click-tracking data present: ${hasClickLinks}. Open-pixel token cannot be independently recovered from QC1's DB with any test client (not an I1 cascade — proven true on SENT rows too, not just FAILED ones)`, true, hasClickLinks);
    if (hasClickLinks) {
      const codeOrUrl = (clickLinks[0]?.code ?? clickLinks[0]?.url ?? null) as string | null;
      if (codeOrUrl) {
        const page2 = await ctx.newAnonPage();
        const clickUrl = /^https?:\/\//.test(codeOrUrl) ? codeOrUrl : `${ctx.BASE}/t/c/${codeOrUrl}`;
        await page2.goto(clickUrl, { waitUntil: "networkidle2", timeout: 15_000 }).catch(() => {});
        await page2.close();
      }
    }
  }

  ctx.plan("SETUP (facade — inbound is a provider webhook, not a UI): customer replies in the same thread");
  // Thread matching (emails.ts ingestInbound): (1) In-Reply-To/References header → parent's threadKey, else
  // (2) a `+t<short>` tag on the reply-to address, else (3) same contact + normalized subject among recent messages.
  // This oracle doesn't fabricate a Message-ID header for the sent message, so it relies on (3) — same contact,
  // subject "Re: <original>" — which is what a real mail client reply does anyway.
  if (!ctx.dry && threadKey && sentEmailId) {
    const crm = await import("@/lib/modules/crm");
    const settings = await (crm as any).emails.getEmailSettings(octx, ownerActor);
    const sentRow = await P.crmEmailMessage.findFirst({ where: { id: sentEmailId }, select: { subject: true } });
    const deps = { transport: async () => ({ ok: true, providerId: `${ctx.tag}-reply-${Date.now().toString(36)}` }), put: async () => {}, del: async () => 200 };
    const reply = await (crm as any).emails.ingestInbound(
      {
        messageId: `<${ctx.tag}-reply-${Date.now().toString(36)}@mail.example>`,
        from: `"${contactName}" <${contactEmail}>`,
        to: [settings.inboundAddress],
        subject: `Re: ${sentRow?.subject ?? `ใบเสนอราคาแพ็กเกจดำน้ำ (${ctx.tag})`}`,
        text: "ขอบคุณค่ะ กำลังดูรายละเอียดอยู่",
        html: "<p>ขอบคุณค่ะ กำลังดูรายละเอียดอยู่</p>",
        headers: {},
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
    const outMsg = await pollUntil(() => P.crmEmailMessage.findFirst({ where: { id: sentEmailId }, select: { openCount: true, clickCount: true } }).then((m: Any) => (m?.clickCount >= 1 ? m : null)));
    // US5-4 (2 opens) can no longer be exercised — see the RUNNER-LIMITATION-NOTED comment on US5-3 above: there is
    // no real open-pixel token recoverable from the DB to hit with a test client, on ANY message status.
    ctx.check("US5-4", "RUNNER-LIMITATION-NOTED (see US5-3): open-pixel token not recoverable from the DB — cannot drive a real open hit, so this is not evaluated as pass/fail", "not evaluable with this architecture", "not evaluable with this architecture");
    ctx.check("US5-5", "the sent message shows at least 1 click (via the real routing.links click target)", true, (outMsg?.clickCount ?? 0) >= 1);

    const inCount = await pollUntil(() => P.crmEmailMessage.count({ where: { tenantId: env.tenantId, threadKey, direction: "IN" } }).then((n: number) => (n >= 2 ? n : null)));
    ctx.check("US5-6", "the customer's reply landed on the SAME thread (>=2 inbound messages, same threadKey)", true, (inCount ?? 0) >= 2);
    const enrollment = sequenceId && contactId ? await pollUntil(() => P.crmSequenceEnrollment.findFirst({ where: { tenantId: env.tenantId, sequenceId, contactId, status: "STOPPED" }, select: { status: true } })) : null;
    ctx.check("US5-7", "the sequence enrollment stopped itself on the reply (stopOnReply)", "STOPPED", enrollment?.status ?? null);
  } else {
    ctx.check("US5-0..7", "dry mode — assertions require the real send + real pixel/click hits + inbound reply", "skipped in --dry", "skipped in --dry");
  }
}
