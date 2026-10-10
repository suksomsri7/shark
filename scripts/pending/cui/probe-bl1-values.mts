// CRM C4.2-fix r2 ▸ BL-1 + SF-1 service probe (review 30 Sep) — contact-controlled values substituted into a rule / sequence
//   step / composer body must NEVER become links (open redirect through /t/c), are rendered as escaped text, and
//   routing.links holds exactly the author-typed URLs · SF-1: a 1 MB adversarial bodyText is refused fast (cap BEFORE
//   converting) and a 400 KB worst case converts well under 1 s ◂
// Real paths: automation.runForCrmEvent (rule SEND_EMAIL → CRM adapter → default e-mail sender) · sequences.runDue scoped
//   to the throwaway tenant (EMAIL step → SEQ adapter → default sender) · emails.sendEmail (composer payload = bodyText).
// Writes: only a throwaway tenant `qc-cui-bl1-*` on QC1 (swept by done()). Network blocked by the fixture.
// Run: bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cui/probe-bl1-values.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture } = (await import("./_fx.mts" as string)) as Any;
const { P, TAG, chk, call, mkShop, done } = await fixture("bl1");
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const AUTO = (await import("@/lib/modules/crm/automation" as string)) as Any;
  const SEQ = (await import("@/lib/modules/crm/sequences" as string)) as Any;
  const shop = await mkShop("a");
  const EVIL1 = "https://evil.example/x";
  const EVIL2 = `"><a href="https://evil2.example/y">z</a>`;
  const AUTHOR = "https://shop.test/promo?a=1&b=2";
  const mk = async (first: string, last: string, company: string) => {
    const r = await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: first, lastName: last, email: `${TAG}-${Math.random().toString(36).slice(2, 7)}@example.com`, phone: `06${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: shop.uid });
    const id = r.contact.id as string;
    // `company` (free text) = the {{contact.companyName}} value of sequences
    await P.crmContact.update({ where: { id }, data: { company } });
    await CRM.consents.set(shop.ctx, shop.owner, id, { channel: "EMAIL", granted: true, source: "STAFF" });
    return id;
  };
  const cA = await mk(EVIL1, EVIL2, EVIL2);
  const msgs = async (contactId: string) => P.crmEmailMessage.findMany({ where: { tenantId: shop.tid, contactId, direction: "OUT" }, select: { id: true, subject: true, bodyHtml: true, bodyText: true, routing: true } });
  const linksOf = (m: Any) => (((m?.routing as Any)?.links ?? []) as Any[]).map((l) => String(l.url));
  const judge = (id: string, what: string, m: Any) => {
    const links = linksOf(m);
    const html = String(m?.bodyHtml ?? "");
    const evilLinked = links.some((u) => /evil/.test(u)) || /<a [^>]*href="[^"]*evil/i.test(html);
    const textShown = html.includes("https://evil.example/x") && /&lt;a href=|&quot;&gt;&lt;a/.test(html + "&lt;a href=");
    chk(id, !!m && !evilLinked && links.length === 1 && links[0] === AUTHOR && !/<a [^>]*href="https:\/\/evil/i.test(html),
      `${what}: routing.links = only the author URL · contact values never linked — msg=${!!m} links=${JSON.stringify(links)} evilLinked=${evilLinked} html=${html.slice(0, 320)}`);
    chk(`${id}b`, !!m && html.includes("https://evil.example/x") && !html.includes(EVIL2) && (html.includes("&quot;&gt;&lt;a") || html.includes('"&gt;&lt;a') ),
      `${what}: the values are shown as escaped text (URL visible as text · the "><a …> value escaped) — textShown=${textShown}`);
  };

  // ── automation SEND_EMAIL: "{ชื่อ}" = contactName = "<first> <last>" ──
  const deal = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, title: `ดีล ${TAG}`, contactId: cA, valueSatang: 100_000 });
  const dealId = (deal?.deal?.id ?? deal?.id) as string;
  await AUTO.createRule(shop.ctx, shop.owner, {
    name: `BL1 ${TAG}`,
    trigger: { event: "crm.deal.updated" },
    actions: [{ type: "SEND_EMAIL", params: { subject: `สวัสดี {ชื่อ} ${TAG}`, template: `สวัสดีคุณ {ชื่อ}\nดูโปรได้ที่ ${AUTHOR} ค่ะ`, to: "contact" } }],
  });
  const run = await call(() => AUTO.runForCrmEvent({ tenantId: shop.tid, systemId: shop.S, type: "crm.deal.updated", payload: { dealId }, idempotencyKey: `${TAG}-evt` }));
  const autoMsg = (await msgs(cA)).find((m: Any) => String(m.subject).startsWith("สวัสดี"));
  chk("BL1.A0", run.ok && !!autoMsg, `rule ran and sent through the real default e-mail sender — run=${run.ok ? JSON.stringify(run.v) : String(run.err?.message)} msg=${!!autoMsg}`);
  judge("BL1.A1", "automation SEND_EMAIL", autoMsg);

  // ── sequence EMAIL step: {{contact.firstName}} + {{contact.companyName}} ──
  const seq = await SEQ.createSequence(shop.ctx, shop.owner, {
    name: `BL1 seq ${TAG}`, stopOnReply: true, stopOnWon: true, stopOnLost: true, businessDaysOnly: false,
    steps: [{ kind: "EMAIL", subject: `ติดตาม ${TAG}`, body: `เรียน {{contact.firstName}} ({{contact.companyName}})\nรายละเอียด ${AUTHOR}` }],
  });
  const cS = await mk(EVIL1, "", EVIL2);
  await SEQ.enroll(shop.ctx, shop.owner, { sequenceId: seq.id, contactId: cS });
  // send window: force "now" to a weekday 10:00 Bangkok so the step is due and inside the window
  await P.crmSequenceEnrollment.updateMany({ where: { tenantId: shop.tid, contactId: cS }, data: { nextAt: new Date(Date.now() - 60_000) } });
  const due = await call(() => SEQ.runDue(new Date(), { tenantIds: [shop.tid] }));
  const seqMsg = (await msgs(cS)).find((m: Any) => String(m.subject).startsWith("ติดตาม"));
  chk("BL1.S0", due.ok && !!seqMsg, `sequence step ran (runDue scoped to the throwaway tenant) — ${due.ok ? JSON.stringify(due.v) : String(due.err?.message)} msg=${!!seqMsg}`);
  judge("BL1.S1", "sequence EMAIL step", seqMsg);

  // ── composer: staff text with a placeholder + an author URL (composer never renders values → placeholder stays literal) ──
  const sent: Any[] = [];
  const deps = { transport: async (m: Any) => { sent.push(m); return { ok: true, providerId: `${TAG}-c` }; }, put: async () => {}, del: async () => 200 };
  const rc = await call(() => CRM.emails.sendEmail(shop.ctx, shop.owner, { contactId: cA, subject: `คอมโพส ${TAG}`, bodyText: `เรียน {{contact.firstName}}\nดูที่ ${AUTHOR}` }, deps));
  const cm = rc.ok ? await P.crmEmailMessage.findFirst({ where: { id: rc.v.emailId }, select: { routing: true, bodyHtml: true } }) : null;
  chk("BL1.C1", rc.ok && JSON.stringify(linksOf(cm)) === JSON.stringify([AUTHOR]), `composer: only the author URL is tracked — ${rc.ok ? JSON.stringify(linksOf(cm)) : String(rc.err?.message)}`);

  // ── SF-1: cap BEFORE conversion + linear conversion ──
  const worst = (n: number) => ("https://a" + ")".repeat(2030) + " ").repeat(Math.ceil(n / 2041)).slice(0, n);
  let t0 = Date.now();
  const big = await call(() => CRM.emails.sendEmail(shop.ctx, shop.owner, { contactId: cA, subject: `ใหญ่ ${TAG}`, bodyText: worst(1024 * 1024) }, deps));
  const bigMs = Date.now() - t0;
  chk("SF1.1", !big.ok && big.err?.code === "VALIDATION" && /ยาวเกิน/.test(String(big.err?.message)) && bigMs < 1500, `1 MB adversarial bodyText refused with the calm Thai size message, fast — ok=${big.ok} code=${big.err?.code} ${bigMs} ms msg=${String(big.err?.message ?? "").slice(0, 90)}`);
  t0 = Date.now();
  const mid = await call(() => CRM.emails.sendEmail(shop.ctx, shop.owner, { contactId: cA, subject: `กลาง ${TAG}`, bodyText: worst(400 * 1024) }, deps));
  const midMs = Date.now() - t0;
  chk("SF1.2", midMs < 3000, `400 KB worst case (≈200 URLs of 2030 ")") handled in ${midMs} ms end-to-end (send incl. DB) — ok=${mid.ok} ${mid.ok ? "" : String(mid.err?.message ?? "").slice(0, 80)}`);
} catch (e) {
  chk("BL1.FATAL", false, String((e as Error)?.stack ?? e).slice(0, 600));
}
await done("BL-1 / SF-1 probe");
