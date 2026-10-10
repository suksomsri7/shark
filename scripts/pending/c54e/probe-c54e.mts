// C5.4-E (FB-UX) builder probe — collected items E1–E3 + behaviours of the L6 fixes that the pinned C5.3-L6 checks do not cover
//   E1.1 core sanitizeHtml is idempotent on a link with 3 query params (1 pass = 2 passes = 3 passes, `&amp;` exactly once)
//   E1.2 control: entity-encoded `javascript:` hrefs still stripped · C2.5-S9.10 fixtures byte-identical
//   E1.3 template (saved = sanitised once) sent by templateId (sanitised again) ⇒ tracked link destination = the original URL
//   E1.4 REST-style bodyHtml that was already sanitised once ⇒ tracked link destination = the original URL
//   E2.1 plain text from the composer with {{contact.firstName}} in subject + body ⇒ substituted (no "{{" left) · author URL still tracked
//   E2.2 a contact whose first name is a URL ⇒ the value is escaped text, never a link
//   E2.3 control: plain text without placeholders ⇒ stored HTML byte-identical to crmPlainTextToEmailHtml(text) (old behaviour)
//   E3.1 control: a 500 failure ⇒ no shop notice
//   E3.2 401/403/429 failures ⇒ exactly ONE in-app notice per OWNER/MANAGER per Thai day (STAFF none) + one OpsEvent flag
//   V1.1 uiVersion-1 legacy create (v1 add form · public form path) — stored columns printed (RED and GREEN logs must match)
//   M2.x stage re-saved with an archived required key ⇒ saved · field restored ⇒ required again (deal without value refused)
//   M3.x the same sequence live on both contacts ⇒ KEEP keeps its ACTIVE, DROP's stops REPLACED and moves as history
//   m8.x a company that already stores gmail.com can still edit another field (free-mail refused only when the domain changes)
//   M4.x self-assignment ⇒ no lead.assigned · the person who closes a deal is not told about it · tasks.today = 1 per owner per day
// Run (QC3): bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54e/probe-c54e.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const { fixture } = (await import("./_fx.mts" as string)) as Any;
const { P, TAG, chk, call, mkShop, mkUser, done } = await fixture("srv");
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const SAN = (await import("@/lib/core/sanitize" as string)) as Any;
  const ES = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const okTransport = async () => ({ ok: true, providerId: `${TAG}-p-${Math.random().toString(36).slice(2, 8)}` });
  const mkContact = async (shop: Any, firstName: string, extra: Any = {}) => {
    const party = await P.party.create({ data: { tenantId: shop.tid, name: `${firstName} ${TAG}`, kind: "PERSON" } });
    const email = `${TAG}-${Math.random().toString(36).slice(2, 8)}@qc.invalid`;
    const k = await P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name: `${firstName} ${TAG}`, firstName, partyId: party.id, ownerUserId: shop.uid, email, ...extra } });
    await P.crmContactConsent.create({ data: { tenantId: shop.tid, systemId: shop.S, contactId: k.id, channel: "EMAIL", granted: true, source: "STAFF", createdAt: new Date(Date.now() - 120_000) } });
    return k;
  };
  const linksOf = async (emailId: string) => {
    const row = await P.crmEmailMessage.findUnique({ where: { id: emailId }, select: { routing: true, bodyHtml: true, subject: true } });
    const links = ((row?.routing?.links ?? []) as Any[]).map((l) => String(l.url));
    return { links, bodyHtml: String(row?.bodyHtml ?? ""), subject: String(row?.subject ?? "") };
  };

  // ═══════════ E1 · sanitizeHtml idempotent on hrefs ═══════════
  const URL3 = "https://shop.example/p?a=1&b=2&c=%E0%B8%81";
  const x = `<p>ดู <a href="${URL3}">รายละเอียด</a></p>`;
  const s1 = SAN.sanitizeHtml(x);
  const s2 = SAN.sanitizeHtml(s1);
  const s3 = SAN.sanitizeHtml(s2);
  chk("E1.1", s1 === s2 && s2 === s3 && s1.includes(`href="https://shop.example/p?a=1&amp;b=2&amp;c=%E0%B8%81"`), `pass1=${s1} | pass2=${s2} | pass3=${s3}`);
  const js = SAN.sanitizeHtml(`<p><a href="&#106;avascript:alert(1)">x</a><a href="java&#x73;cript:alert(2)">y</a><a href="https://ok.example/?q=1&amp;r=2">ok</a></p>`);
  const FIX = [
    `<p onclick="x()">สวัสดี <b>ครับ</b><img src="https://t.example/p.gif" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><a href="https://ok.example/a?b=1">ok</a></p>`,
    `<div style="color:red"><h1>หัว</h1><iframe src="https://e.example"></iframe><ul><li>1</li></ul></div>`,
    `<table><tr><td>a</td></tr></table><blockquote>q</blockquote><svg onload="x()"><circle/></svg>`,
  ];
  const BASE = [
    `<p>สวัสดี <b>ครับ</b>x</a><a href="https://ok.example/a?b=1" rel="noopener" target="_blank">ok</a></p>`,
    `<h1>หัว</h1><ul><li>1</li></ul>`,
    `a<blockquote>q</blockquote>`,
  ];
  const s910 = FIX.map((f) => SAN.sanitizeHtml(f));
  chk("E1.2", !/javascript|&#106;|&#x73;/i.test(js) && (js.match(/href=/g) ?? []).length === 1 && js.includes(`href="https://ok.example/?q=1&amp;r=2"`) && s910.every((o: string, i: number) => o === BASE[i]),
    `entity-js=${js} · S9.10 fixtures=${s910.map((o: string, i: number) => (o === BASE[i] ? "=" : `≠ ${o}`)).join(" | ")}`);

  const shop = await mkShop("e1");
  const kE = await mkContact(shop, "สมศรี");
  const tpl = await CRM.emails.saveTemplate(shop.ctx, shop.owner, { name: `แม่แบบ ${TAG}`, subject: `ข้อเสนอ ${TAG}`, bodyHtml: x });
  const r13 = await call(() => CRM.emails.sendEmail(shop.ctx, shop.owner, { contactId: kE.id, templateId: tpl.id }, { transport: okTransport }));
  const l13 = r13.ok ? await linksOf(r13.v.emailId) : { links: [], bodyHtml: "", subject: "" };
  const tplRow = await P.crmEmailTemplate.findUnique({ where: { id: tpl.id }, select: { bodyHtml: true } });
  chk("E1.3", r13.ok && l13.links.length === 1 && l13.links[0] === URL3, `send=${r13.ok ? r13.v.status : String(r13.err)} storedTemplate=${tplRow?.bodyHtml} trackedUrl=${j(l13.links)}`);
  const r14 = await call(() => CRM.emails.sendEmail(shop.ctx, shop.owner, { contactId: kE.id, subject: `REST ${TAG}`, bodyHtml: s1 }, { transport: okTransport }));
  const l14 = r14.ok ? await linksOf(r14.v.emailId) : { links: [] };
  chk("E1.4", r14.ok && l14.links.length === 1 && l14.links[0] === URL3, `send=${r14.ok ? r14.v.status : String(r14.err)} trackedUrl=${j(l14.links)}`);

  // ═══════════ E2 · composer placeholders ═══════════
  const URL2 = "https://shop.example/q?x=1&y=2";
  const text = `เรียนคุณ {{contact.firstName}}\n\nรายละเอียดอยู่ที่ ${URL2} ครับ`;
  const r21 = await call(() => CRM.emails.sendEmail(shop.ctx, shop.owner, { contactId: kE.id, subject: `ใบเสนอราคาสำหรับคุณ {{contact.firstName}}`, bodyText: text }, { transport: okTransport }));
  const l21 = r21.ok ? await linksOf(r21.v.emailId) : { links: [], bodyHtml: "", subject: "" };
  chk("E2.1", r21.ok && !l21.bodyHtml.includes("{{") && l21.bodyHtml.includes("เรียนคุณ สมศรี") && l21.subject === "ใบเสนอราคาสำหรับคุณ สมศรี" && l21.links.includes(URL2),
    `send=${r21.ok ? r21.v.status : String(r21.err)} subject=${l21.subject} body=${l21.bodyHtml.slice(0, 160)} links=${j(l21.links)}`);
  const kEvil = await mkContact(shop, "https://evil.example/login");
  const r22 = await call(() => CRM.emails.sendEmail(shop.ctx, shop.owner, { contactId: kEvil.id, subject: `ทักทาย ${TAG}`, bodyText: "สวัสดีคุณ {{contact.firstName}}" }, { transport: okTransport }));
  const l22 = r22.ok ? await linksOf(r22.v.emailId) : { links: [], bodyHtml: "" };
  chk("E2.2", r22.ok && !l22.links.some((u: string) => u.includes("evil.example")) && !/href="[^"]*evil/.test(l22.bodyHtml) && l22.bodyHtml.includes("https://evil.example/login"),
    `send=${r22.ok ? r22.v.status : String(r22.err)} links=${j(l22.links)} body=${l22.bodyHtml.slice(0, 200)}`);
  const plain = `สวัสดีครับ\nดูที่ ${URL2}`;
  const r23 = await call(() => CRM.emails.sendEmail(shop.ctx, shop.owner, { contactId: kE.id, subject: `ธรรมดา ${TAG}`, bodyText: plain }, { transport: okTransport }));
  const row23 = r23.ok ? await P.crmEmailMessage.findUnique({ where: { id: r23.v.emailId }, select: { bodyHtml: true } }) : null;
  chk("E2.3", r23.ok && row23?.bodyHtml === ES.crmPlainTextToEmailHtml(plain), `stored=${row23?.bodyHtml} expected=${ES.crmPlainTextToEmailHtml(plain)}`);

  // ═══════════ E3 · shop-wide e-mail outage notice ═══════════
  const shop3 = await mkShop("e3");
  const mgr = await mkUser("-mgr");
  const stf = await mkUser("-stf");
  await P.membership.create({ data: { userId: mgr, tenantId: shop3.tid, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: stf, tenantId: shop3.tid, role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const k3 = await mkContact(shop3, "ล่ม");
  const failWith = (code: string) => async () => ({ ok: false, error: code });
  const notices = async () => (await P.appNotification.findMany({ where: { tenantId: shop3.tid, title: { contains: "ระบบส่งอีเมล" } }, select: { recipientUserId: true, body: true } })) as Any[];
  const r31 = await call(() => CRM.emails.sendEmail(shop3.ctx, shop3.owner, { contactId: k3.id, subject: `ห้าร้อย ${TAG}`, bodyText: "ทดสอบ" }, { transport: failWith("PROVIDER_500") }));
  const n31 = await notices();
  chk("E3.1", r31.ok && r31.v.status === "FAILED" && n31.length === 0, `send=${r31.ok ? r31.v.status : String(r31.err)} notices=${n31.length}`);
  const outs: string[] = [];
  for (const code of ["PROVIDER_403", "PROVIDER_401", "PROVIDER_429", "PROVIDER_403"]) {
    const r = await call(() => CRM.emails.sendEmail(shop3.ctx, shop3.owner, { contactId: k3.id, subject: `${code} ${TAG} ${outs.length}`, bodyText: "ทดสอบ" }, { transport: failWith(code) }));
    outs.push(`${code}:${r.ok ? r.v.status : "err"}`);
  }
  const n32 = await notices();
  const per = (uid: string) => n32.filter((n) => n.recipientUserId === uid).length;
  const flags = (await P.opsEvent.count({ where: { tenantId: shop3.tid, source: "crm.email.outage" } })) as number;
  chk("E3.2", per(shop3.uid) === 1 && per(mgr) === 1 && per(stf) === 0 && flags === 1 && n32.every((n) => !n.body.includes("@") && n.body.includes(`/app/sys/${shop3.S}/crm/settings/email`)),
    `sends=${outs.join(",")} owner=${per(shop3.uid)} manager=${per(mgr)} staff=${per(stf)} flags=${flags} body=${n32[0]?.body ?? "-"}`);

  // ═══════════ V1 · legacy create on a uiVersion-1 CRM (v1 add form / public form) ═══════════
  const shopV1 = await mkShop("v1");
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set("settings", '{crm,uiVersion}', '1'::jsonb, true) WHERE "id" = $1`, shopV1.S);
  const legacy = [
    { name: "สมชาย ใจดี", phone: "081-234-5678", email: `v1a.${TAG}@qc.invalid` },
    { name: "น้ำผึ้ง รักดี", phone: "0823456789" },
    { name: "Acme Buyer", email: `v1c.${TAG}@qc.invalid`, source: "WEB" },
  ];
  const v1rows: string[] = [];
  for (const L of legacy) {
    const r = await call(() => CRM.contacts.createContactFromLegacy({ tenantId: shopV1.tid, systemId: shopV1.S }, L));
    const row = r.ok ? await P.crmContact.findUnique({ where: { id: r.v.id }, select: { name: true, firstName: true, lastName: true, titleTh: true, phone: true, email: true, note: true, lifecycleStage: true } }) : null;
    v1rows.push(r.ok ? j({ ...row, email: row?.email ? String(row.email).replace(TAG, "<TAG>") : null }) : `err ${String(r.err)}`);
  }
  chk("V1.1", v1rows.every((r) => !r.startsWith("err")), `legacy rows (must match between RED and GREEN logs): ${v1rows.join(" · ")}`);

  // ═══════════ M2 · archived required key: stage re-save + restore ═══════════
  {
    const shopM = await mkShop("m2");
    const fctx = { ...shopM.ctx, objectKey: "deal", actor: shopM.owner };
    const sec = await MEM.fields.createSection(fctx, { key: `qcE${TAG.slice(-4)}`, label: "ดีล E" });
    const fld = await MEM.fields.createField(fctx, { sectionId: sec.id, key: "qcBud", label: "งบ", type: "NUMBER" });
    const st = shopM.stages.find((s: Any) => s.name === "เสนอราคา");
    await CRM.pipelines.updateStage(shopM.ctx, shopM.owner, st.id, { requireFields: ["qcBud"] });
    await MEM.fields.archiveField(fctx, fld.id);
    const resave = await call(() => CRM.pipelines.updateStage(shopM.ctx, shopM.owner, st.id, { requireFields: ["qcBud"] }));
    const k = await mkContact(shopM, "งบ");
    const d = await CRM.deals.createDeal(shopM.ctx, shopM.owner, { pipelineId: shopM.pipe.id, title: `ดีล M2 ${TAG}`, contactId: k.id });
    const mv1 = await call(() => CRM.deals.moveDeal(shopM.ctx, shopM.owner, d.id, { stageId: st.id }));
    const back = await call(() => CRM.deals.moveDeal(shopM.ctx, shopM.owner, d.id, { stageId: shopM.stages[0].id }));
    await MEM.fields.restoreField(fctx, fld.id);
    const mv2 = await call(() => CRM.deals.moveDeal(shopM.ctx, shopM.owner, d.id, { stageId: st.id }));
    chk("M2.x", resave.ok && mv1.ok && back.ok && !mv2.ok && /STAGE_REQUIREMENTS/.test(String(mv2.err?.code ?? mv2.err)) && String(mv2.err?.message ?? "").includes("งบ"),
      `resave=${resave.ok ? "ok" : String(resave.err)} moveWhileArchived=${mv1.ok ? "moved" : String(mv1.err)} back=${back.ok} afterRestore=${mv2.ok ? "moved" : `${mv2.err?.code} ${mv2.err?.message}`}`);
  }

  // ═══════════ M3 · same sequence live on both contacts ═══════════
  {
    const shopS = await mkShop("m3");
    const keep = await mkContact(shopS, "เก็บ");
    const drop = await mkContact(shopS, "รวม");
    const seq = await CRM.sequences.createSequence(shopS.ctx, shopS.owner, { name: `ติดตาม ${TAG}`, businessDaysOnly: false, sendWindow: null, steps: [{ kind: "TASK", taskTitle: "โทร" }, { kind: "WAIT", waitDays: 1 }, { kind: "TASK", taskTitle: "โทรอีก" }] });
    const sid = seq?.id ?? seq?.sequence?.id;
    await CRM.sequences.enroll(shopS.ctx, shopS.owner, { sequenceId: sid, contactId: keep.id });
    await CRM.sequences.enroll(shopS.ctx, shopS.owner, { sequenceId: sid, contactId: drop.id });
    const mg = await call(() => CRM.contacts.mergeContacts(shopS.ctx, shopS.owner, { keepId: keep.id, mergeId: drop.id, confirm: true, reason: `รวม ${TAG}` }));
    const rows = (await P.crmSequenceEnrollment.findMany({ where: { tenantId: shopS.tid, sequenceId: sid }, select: { contactId: true, status: true, stoppedReason: true } })) as Any[];
    const onKeep = rows.filter((r) => r.contactId === keep.id);
    chk("M3.x", mg.ok && rows.length === 2 && onKeep.length === 2 && onKeep.filter((r) => r.status === "ACTIVE").length === 1 && onKeep.some((r) => r.status === "STOPPED" && r.stoppedReason === "REPLACED"),
      `merge=${mg.ok ? "ok" : String(mg.err)} rows=${j(rows.map((r) => `${r.contactId === keep.id ? "KEEP" : "DROP"}:${r.status}:${r.stoppedReason ?? "-"}`))}`);
  }

  // ═══════════ m8 · changed-only free-mail rule ═══════════
  {
    const cp = await P.party.create({ data: { tenantId: shop.tid, name: `ร้านเก่า ${TAG}`, kind: "COMPANY" } });
    const co = await P.crmCompany.create({ data: { tenantId: shop.tid, systemId: shop.S, partyId: cp.id, name: `ร้านเก่า ${TAG}`, emailDomain: "gmail.com" } }); // stored before C5.4-E (raw row)
    const up = await call(() => CRM.companies.updateCompany(shop.ctx, shop.owner, co.id, { industry: "ค้าปลีก", emailDomain: "gmail.com" }));
    const ch = await call(() => CRM.companies.updateCompany(shop.ctx, shop.owner, co.id, { emailDomain: "hotmail.com" }));
    const own = await call(() => CRM.companies.updateCompany(shop.ctx, shop.owner, co.id, { emailDomain: "acme-e.co.th" }));
    chk("m8.x", up.ok && !ch.ok && /VALIDATION/.test(String(ch.err?.code ?? ch.err)) && own.ok, `editOther=${up.ok ? "ok" : String(ch.err)} changeToHotmail=${ch.ok ? "accepted" : `${ch.err?.code} ${ch.err?.message}`} ownDomain=${own.ok ? "ok" : String(own.err)}`);
  }

  // ═══════════ M4 · senders: self-assign · mover excluded · tasks.today once per day ═══════════
  {
    const shopN = await mkShop("m4");
    const st2 = await mkUser("-n2");
    const perms = { "crm.contact.read": true, "crm.contact.create": true, "crm.deal.read": true, "crm.deal.create": true, "crm.deal.move": true, "crm.activity.read": true };
    await P.membership.create({ data: { userId: st2, tenantId: shopN.tid, role: "STAFF", unitAccess: ["*"], permissions: perms, acceptedAt: new Date() } });
    const staffActor = { userId: st2, role: "STAFF", unitAccess: ["*"], permissions: perms };
    const sctx = { ...shopN.ctx, actorUserId: st2 };
    // self-created lead (owner = creator) ⇒ no lead.assigned
    const self = await call(() => CRM.contacts.createContact(sctx, staffActor, { firstName: `ตัวเอง ${TAG}`, phone: "0891112233" }));
    // deal owned by st2, moved to WON by st2 ⇒ st2 not told (mover) · owner (not involved) not told either
    const kN = await mkContact(shopN, "ปิด", { ownerUserId: st2 });
    const dN = await CRM.deals.createDeal(sctx, staffActor, { pipelineId: shopN.pipe.id, title: `ดีลปิดเอง ${TAG}`, contactId: kN.id });
    const won = shopN.stages.find((s: Any) => s.kind === "WON");
    const mv = await call(() => CRM.deals.moveDeal(sctx, staffActor, dN.id, { stageId: won.id }));
    // tasks: st2 has one overdue + one today
    await P.crmActivity.create({ data: { tenantId: shopN.tid, systemId: shopN.S, type: "TASK", title: `ค้าง ${TAG}`, ownerUserId: st2, contactId: kN.id, dueAt: new Date(Date.now() - 3 * 86_400_000) } });
    await P.crmActivity.create({ data: { tenantId: shopN.tid, systemId: shopN.S, type: "TASK", title: `วันนี้ ${TAG}`, ownerUserId: st2, contactId: kN.id, dueAt: new Date(Date.now() + 60_000) } });
    const OC = (await import("@/lib/outbox-consumers" as string)) as Any;
    const OB = P.outboxEvent; const OB_FIND = OB.findMany;
    OB.findMany = (a: Any) => OB_FIND.call(OB, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: shopN.tid }] } });
    try { await OC.drainAll(); } finally { OB.findMany = OB_FIND; }
    const late = new Date(); // digest hour default 08:00 Thai — use a time after it today (Thai 23:00) if now is earlier
    const thNow = new Date(late.getTime() + 7 * 3_600_000);
    const at = thNow.getUTCHours() >= 8 ? late : new Date(Date.UTC(thNow.getUTCFullYear(), thNow.getUTCMonth(), thNow.getUTCDate(), 23 - 7, 0));
    const d1 = await call(() => CRM.notifySenders.tasksTodayDigest(at, { tenantIds: [shopN.tid] }));
    const d2 = await call(() => CRM.notifySenders.tasksTodayDigest(at, { tenantIds: [shopN.tid] }));
    const notes = (await P.appNotification.findMany({ where: { tenantId: shopN.tid }, select: { recipientUserId: true, body: true, title: true } })) as Any[];
    const has = (uid: string, key: string) => notes.filter((n) => n.recipientUserId === uid && String(n.body).includes(`n=${key}&`)).length;
    chk("M4.x", self.ok && mv.ok && d1.ok && d2.ok && has(st2, "lead.assigned") === 0 && has(st2, "deal.closed") === 0 && has(shopN.uid, "deal.closed") === 0 && has(st2, "tasks.today") === 1 && /งานวันนี้ 2 รายการ/.test(notes.find((n) => n.recipientUserId === st2 && String(n.body).includes("n=tasks.today&"))?.title ?? ""),
      `self=${self.ok} move=${mv.ok ? "ok" : String(mv.err)} digest=${d1.ok ? j(d1.v) : String(d1.err)}/${d2.ok ? j(d2.v) : String(d2.err)} · st2: assigned=${has(st2, "lead.assigned")} closed=${has(st2, "deal.closed")} tasks=${has(st2, "tasks.today")} · owner closed=${has(shopN.uid, "deal.closed")} · titles=${j(notes.map((n) => n.title))}`);
  }
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await done("probe-c54e");
}
