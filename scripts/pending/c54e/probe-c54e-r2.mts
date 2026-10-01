// C5.4-E round 2 builder probe — review SF-1..SF-4 + controller rulings (1 Oct 2026)
//   R1   SF-1 contact merge: DROP live logs +30/−40 (score 0) + KEEP +50 ⇒ KEEP score = Σ live logs = 40 (reconcile, not KEEP+DROP)
//   R2a  SF-2 company merge: KEEP's row for X revoked, DROP's live+accepted ⇒ X keeps a LIVE accepted access on KEEP, no "closed" warning
//   R2b  SF-2 company merge: both rows live ⇒ DROP's revoked, KEEP's stays live, warning says the person keeps access via KEEP
//   R3a  SF-3 import of 20 rows by a STAFF (owner = importer) ⇒ 0 lead.assigned notices to that STAFF
//   R3b  SF-3 bulk reassign of 15 leads to nok ⇒ exactly ONE lead.assigned notice to nok, count 15 · control: a single assignContact ⇒ one more
//   R4   SF-4 sanitizeHtml: the reviewer's 12 vectors × 3 passes (± allowImages) ⇒ pass1 = pass2 = pass3, no javascript:/data:/vbscript:
//        href/src, no on* attribute in any tag · C2.5-S9.10 fixtures byte-identical
//   R6   ruling (1) company lifecycle correction: OWNER CUSTOMER → PROSPECT ok (audit correction:true) · STAFF refused · CUSTOMER → LEAD refused
//   R2-1a/b/c (round 3) portal rank usable > pending > revoked on company merge · R2-2 correction refused while a WON deal remains ·
//   R2-2s STAFF who can see the company ⇒ FORBIDDEN
//   R7   ruling (4) company import with a free-mail domain ⇒ row imported WITHOUT the domain + one row warning (no error)
// Run (QC3): bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54e/probe-c54e-r2.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const { fixture } = (await import("./_fx.mts" as string)) as Any;
const { P, TAG, chk, call, mkShop, mkUser, done } = await fixture("r2");
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const SAN = (await import("@/lib/core/sanitize" as string)) as Any;
  const OC = (await import("@/lib/outbox-consumers" as string)) as Any;
  const drain = async (tid: string) => {
    const OB = P.outboxEvent; const OB_FIND = OB.findMany;
    OB.findMany = (a: Any) => OB_FIND.call(OB, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: tid }] } });
    try { await OC.drainAll(); await OC.drainAll(); } finally { OB.findMany = OB_FIND; }
  };
  const mkContact = async (shop: Any, firstName: string, extra: Any = {}) => {
    const party = await P.party.create({ data: { tenantId: shop.tid, name: `${firstName} ${TAG}`, kind: "PERSON" } });
    return P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name: `${firstName} ${TAG}`, firstName, partyId: party.id, ownerUserId: shop.uid, ...extra } });
  };

  // ═══════════ R1 · SF-1 merged score = Σ live logs ═══════════
  {
    const shop = await mkShop("r1");
    const keep = await mkContact(shop, "เก็บ", { score: 50 });
    const drop = await mkContact(shop, "รวม", { score: 0 });
    await P.crmScoreLog.create({ data: { tenantId: shop.tid, contactId: keep.id, points: 50, reason: "กรอกฟอร์ม" } });
    await P.crmScoreLog.create({ data: { tenantId: shop.tid, contactId: drop.id, points: 30, reason: "เปิดอีเมล" } });
    await P.crmScoreLog.create({ data: { tenantId: shop.tid, contactId: drop.id, points: -40, reason: "เงียบหาย" } });
    const mg = await call(() => CRM.contacts.mergeContacts(shop.ctx, shop.owner, { keepId: keep.id, mergeId: drop.id, confirm: true, reason: `รวม ${TAG}` }));
    const k = await P.crmContact.findUnique({ where: { id: keep.id }, select: { score: true, scoreBand: true } });
    const logs = (await P.crmScoreLog.findMany({ where: { contactId: keep.id }, select: { points: true } })) as Any[];
    chk("R1", mg.ok && k?.score === 40 && logs.length === 3, `merge=${mg.ok ? "ok" : String(mg.err)} keepScore=${k?.score} band=${k?.scoreBand} logsOnKeep=${j(logs.map((l) => l.points))} (expected 40 = 50+30−40)`);
  }

  // ═══════════ R2 · SF-2 company merge portal access ═══════════
  const portalCase = async (label: string, keepRow: "revoked" | "live") => {
    const shop = await mkShop(label, { portal: true });
    const ck = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทเก็บ ${TAG} ${label}` })).company.id as string;
    const cm = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทรวม ${TAG} ${label}` })).company.id as string;
    const x = await mkContact(shop, `พอร์ทัล ${label}`, { email: `${TAG}-${label}@qc.invalid` });
    await CRM.companies.addContact(shop.ctx, shop.owner, ck, { contactId: x.id });
    await CRM.companies.addContact(shop.ctx, shop.owner, cm, { contactId: x.id });
    const now = new Date();
    await P.crmPortalAccess.create({ data: { tenantId: shop.tid, systemId: shop.S, companyId: ck, contactId: x.id, acceptedAt: new Date(now.getTime() - 86_400_000), ...(keepRow === "revoked" ? { revokedAt: new Date(now.getTime() - 3_600_000) } : {}) } });
    await P.crmPortalAccess.create({ data: { tenantId: shop.tid, systemId: shop.S, companyId: cm, contactId: x.id, acceptedAt: now, role: "ADMIN" } });
    const mc = await call(() => CRM.companies.mergeCompanies(shop.ctx, shop.owner, { keepId: ck, mergeId: cm, confirm: true, reason: `รวมบริษัท ${TAG}` }));
    const rows = (await P.crmPortalAccess.findMany({ where: { tenantId: shop.tid, contactId: x.id }, select: { companyId: true, revokedAt: true, acceptedAt: true, role: true } })) as Any[];
    const live = rows.filter((r) => r.companyId === ck && !r.revokedAt && r.acceptedAt);
    return { mc, rows: rows.map((r) => `${r.companyId === ck ? "KEEP" : r.companyId === cm ? "DROP" : "?"}:${r.revokedAt ? "revoked" : "live"}:${r.acceptedAt ? "accepted" : "pending"}:${r.role}`), live, warnings: (mc.ok ? mc.v.warnings : []) as string[] };
  };
  {
    const a = await portalCase("r2a", "revoked");
    chk("R2a", a.mc.ok && a.live.length === 1 && a.live[0].role === "ADMIN" && !a.warnings.some((w) => /ถูกปิด|ยังอยู่/.test(w)), `merge=${a.mc.ok ? "ok" : String(a.mc.err)} rows=${j(a.rows)} warnings=${j(a.warnings)}`);
    const b = await portalCase("r2b", "live");
    chk("R2b", b.mc.ok && b.live.length === 1 && b.rows.some((r) => r.startsWith("DROP:revoked")) && b.warnings.some((w) => /บริษัทที่เก็บไว้/.test(w) && /1/.test(w)), `merge=${b.mc.ok ? "ok" : String(b.mc.err)} rows=${j(b.rows)} warnings=${j(b.warnings)}`);
  }

  // ═══════════ R2-1 (round 3) · rank usable > pending > revoked — never replace KEEP's row with a worse DROP row ═══════════
  type St = "usable" | "pending" | "revoked";
  const rowData = (st: St, now: Date) =>
    st === "usable" ? { acceptedAt: new Date(now.getTime() - 86_400_000) }
      : st === "pending" ? { acceptedAt: null, inviteTokenHash: `${TAG}-${Math.random().toString(36).slice(2)}`, inviteExpiresAt: new Date(now.getTime() + 3 * 86_400_000) }
        : { acceptedAt: new Date(now.getTime() - 5 * 86_400_000), revokedAt: new Date(now.getTime() - 86_400_000) };
  const rankCase = async (label: string, keepSt: St, dropSt: St) => {
    const shop = await mkShop(label, { portal: true });
    const ck = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทเก็บ ${TAG} ${label}` })).company.id as string;
    const cm = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทรวม ${TAG} ${label}` })).company.id as string;
    const x = await mkContact(shop, `อันดับ ${label}`, { email: `${TAG}-${label}@qc.invalid` });
    await CRM.companies.addContact(shop.ctx, shop.owner, ck, { contactId: x.id });
    await CRM.companies.addContact(shop.ctx, shop.owner, cm, { contactId: x.id });
    const now = new Date();
    const kr = await P.crmPortalAccess.create({ data: { tenantId: shop.tid, systemId: shop.S, companyId: ck, contactId: x.id, role: "VIEW", ...rowData(keepSt, now) } });
    const dr = await P.crmPortalAccess.create({ data: { tenantId: shop.tid, systemId: shop.S, companyId: cm, contactId: x.id, role: "ADMIN", ...rowData(dropSt, now) } });
    const mc = await call(() => CRM.companies.mergeCompanies(shop.ctx, shop.owner, { keepId: ck, mergeId: cm, confirm: true, reason: `รวมบริษัท ${TAG}` }));
    const onKeep = (await P.crmPortalAccess.findMany({ where: { tenantId: shop.tid, contactId: x.id, companyId: ck }, select: { id: true, revokedAt: true, acceptedAt: true } })) as Any[];
    const audits = (await P.auditLog.findMany({ where: { tenantId: shop.tid, targetType: "CrmPortalAccess", targetId: { in: [kr.id, dr.id] } }, select: { action: true, targetId: true } })) as Any[];
    return { mc, keptId: onKeep[0]?.id ?? null, kr: kr.id, dr: dr.id, onKeep: onKeep.length, audits, warnings: (mc.ok ? mc.v.warnings : []) as string[] };
  };
  {
    const a = await rankCase("k1", "pending", "revoked");
    chk("R2-1a", a.mc.ok && a.onKeep === 1 && a.keptId === a.kr, `KEEP pending + DROP revoked ⇒ KEEP's invite survives — merge=${a.mc.ok ? "ok" : String(a.mc.err)} keptOnKeep=${a.keptId === a.kr ? "KEEP" : a.keptId === a.dr ? "DROP" : a.keptId} audits=${j(a.audits)}`);
    const b = await rankCase("k2", "revoked", "usable");
    chk("R2-1b", b.mc.ok && b.onKeep === 1 && b.keptId === b.dr && b.audits.some((x: Any) => x.targetId === b.kr), `KEEP revoked + DROP usable ⇒ DROP's moved + an audit row for the deleted KEEP row — merge=${b.mc.ok ? "ok" : String(b.mc.err)} keptOnKeep=${b.keptId === b.dr ? "DROP" : b.keptId === b.kr ? "KEEP" : b.keptId} audits=${j(b.audits)}`);
    const c = await rankCase("k3", "pending", "pending");
    chk("R2-1c", c.mc.ok && c.onKeep === 1 && c.keptId === c.kr, `both pending ⇒ KEEP's kept — merge=${c.mc.ok ? "ok" : String(c.mc.err)} keptOnKeep=${c.keptId === c.kr ? "KEEP" : c.keptId === c.dr ? "DROP" : c.keptId} audits=${j(c.audits)}`);
  }

  // ═══════════ R3 · SF-3 import / bulk reassign notices ═══════════
  {
    const shop = await mkShop("r3");
    const perms = { "crm.contact.read": true, "crm.contact.create": true, "crm.contact.update": true, "crm.contact.import": true };
    const imp = await mkUser("-imp");
    await P.membership.create({ data: { userId: imp, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions: perms, acceptedAt: new Date() } });
    const nok = await mkUser("-nok");
    await P.membership.create({ data: { userId: nok, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true }, acceptedAt: new Date() } });
    const impActor = { userId: imp, role: "STAFF", unitAccess: ["*"], permissions: perms };
    const rows = Array.from({ length: 20 }, (_, i) => ({ ชื่อ: `นำเข้า ${i} ${TAG}`, เบอร์: `08${String(70000000 + i).padStart(8, "0")}` }));
    const ir = await call(() => CRM.contacts.importContacts({ ...shop.ctx, actorUserId: imp }, impActor, { rows, mapping: { ชื่อ: "firstName", เบอร์: "phone" }, options: { onDuplicate: "skip", source: "IMPORT" } }));
    await drain(shop.tid);
    const notesOf = async (uid: string) => ((await P.appNotification.findMany({ where: { tenantId: shop.tid, recipientUserId: uid }, select: { body: true } })) as Any[]).filter((n) => String(n.body).includes("n=lead.assigned&"));
    const selfN = await notesOf(imp);
    chk("R3a", ir.ok && ir.v.result.created === 20 && selfN.length === 0, `import=${ir.ok ? j(ir.v.result) : String(ir.err)} selfNotices=${selfN.length}`);
    const ids = ((await P.crmContact.findMany({ where: { tenantId: shop.tid, systemId: shop.S, ownerUserId: imp }, select: { id: true }, take: 15 })) as Any[]).map((r) => r.id);
    const ba = await call(() => CRM.contacts.bulkAssign(shop.ctx, shop.owner, { ids, userId: nok, confirm: true, reason: `โอนให้นก ${TAG}` }));
    await drain(shop.tid);
    const nokN = await notesOf(nok);
    const single = await mkContact(shop, "เดี่ยว");
    const sa = await call(() => CRM.contacts.assignContact(shop.ctx, shop.owner, single.id, { userId: nok }));
    await drain(shop.tid);
    const nokN2 = await notesOf(nok);
    chk("R3b", ba.ok && ba.v.updated === 15 && nokN.length === 1 && /15/.test(String(nokN[0]?.body)) && sa.ok && nokN2.length === 2,
      `bulk=${ba.ok ? ba.v.updated : String(ba.err)} nokAfterBulk=${nokN.length} body=${nokN[0]?.body ?? "-"} · single=${sa.ok} nokAfterSingle=${nokN2.length}`);
  }

  // ═══════════ R4 · SF-4 sanitize idempotence (reviewer's 12 vectors) ═══════════
  {
    const S = ["http", "https", "mailto", "tel"];
    const V = [
      `<a href="https://a.com/&lt;a href=&quot;javascript:alert(1)&quot;&gt;">x</a>`,
      `<a href="https://a.com/&lt;a href=javascript:alert(1)&gt;">x</a>`,
      `<a href="https://a.com/&gt;&lt;a href=javascript:alert(1)&gt;q">x</a>`,
      `<a href="https://a.com/&#39;&gt;&lt;a href=javascript:alert(1) x=&#39;">x</a>`,
      `<a href='https://a.com/&gt;&lt;a href=javascript:alert(1)&gt;'>x</a>`,
      `<a href="https://a.com/&lt;img src=x onerror=alert(1)&gt;">x</a>`,
      `<a href="https://a.com/&lt;script&gt;alert(1)&lt;/script&gt;">x</a>`,
      `<a href="https://a.com/&lt;/a&gt;&lt;a href=&#106;avascript:alert(1)&gt;y">x</a>`,
      `<a href="https://a.com/" title="&lt;a href=javascript:alert(1)&gt;">x</a>`,
      `<a title="&gt;&lt;a href=javascript:alert(1)&gt;" href="https://a.com/">x</a>`,
      `<a href=https://a.com/&gt;&lt;a&#32;href=javascript:alert(1)&gt;>x</a>`,
      `<p>t</p><a href="https://a.com/?&lt;p onclick=alert(1)&gt;">x</a>`,
    ];
    const bad: string[] = [];
    for (const [i, v] of V.entries()) {
      for (const opts of [{ allowLinkSchemes: S }, { allowImages: true, allowLinkSchemes: S }]) {
        const p1 = SAN.sanitizeHtml(v, opts); const p2 = SAN.sanitizeHtml(p1, opts); const p3 = SAN.sanitizeHtml(p2, opts);
        // real attributes only (names outside quotes; values entity-decoded the way a browser reads them) — a quoted, escaped value that
        //   merely CONTAINS the text "href=javascript:" is inert text, not an attribute
        const dec = (v: string) => v.replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);?/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        const attrsOf = (tag: string) => [...tag.replace(/^<\/?[A-Za-z0-9]+/, "").matchAll(/\s+([^\s=>\/"']+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map((m) => ({ name: m[1]!.toLowerCase(), value: dec(m[3] ?? m[4] ?? m[5] ?? "") }));
        const tags = [...p3.matchAll(/<[A-Za-z\/][^>]*>/g)].map((m) => m[0]);
        const unsafe = tags.some((t) => attrsOf(t).some((a) => a.name.startsWith("on") || ((a.name === "href" || a.name === "src") && /^\s*(javascript|data|vbscript):/i.test(a.value.replace(/[\u0000-\u0020]+/g, "")))));
        if (!(p1 === p2 && p2 === p3) || unsafe) bad.push(`#${i + 1}${opts.allowImages ? "img" : ""} p1=${p1} p2=${p2}`);
      }
    }
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
    const s910 = FIX.map((f) => SAN.sanitizeHtml(f)).every((o: string, i: number) => o === BASE[i]);
    // positive control of the attribute checker: raw (unsanitised) hostile tags MUST be flagged
    const dec2 = (v: string) => v.replace(/&#(\d+);?/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
    const flag = (html: string) => [...html.matchAll(/<[A-Za-z\/][^>]*>/g)].some((m) => [...m[0].replace(/^<\/?[A-Za-z0-9]+/, "").matchAll(/\s+([^\s=>\/"']+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].some((a) => a[1]!.toLowerCase().startsWith("on") || ((a[1]!.toLowerCase() === "href" || a[1]!.toLowerCase() === "src") && /^\s*(javascript|data|vbscript):/i.test(dec2(a[3] ?? a[4] ?? a[5] ?? "")))));
    const ctl = flag(`<a href="&#106;avascript:alert(1)">x</a>`) && flag(`<img src=x onerror=alert(1)>`) && !flag(`<a href="https://a.com/&lt;a href=javascript:alert(1)&gt;">x</a>`);
    chk("R4", bad.length === 0 && s910 && ctl, `vectors=12×2 bad=${bad.length} ${bad.slice(0, 3).join(" ‖ ")} · S9.10 fixtures byte-identical=${s910} · checker control=${ctl}`);
  }

  // ═══════════ R6 · ruling (1) company lifecycle correction ═══════════
  {
    const shop = await mkShop("r6");
    const stf = await mkUser("-r6s");
    const sp = { "crm.company.read": true, "crm.company.update": true };
    await P.membership.create({ data: { userId: stf, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions: sp, acceptedAt: new Date() } });
    const co = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทแก้ ${TAG}` })).company.id as string;
    await P.crmCompany.update({ where: { id: co }, data: { lifecycleStage: "CUSTOMER" } });
    const fn = CRM.companies.setCompanyLifecycle;
    const st = typeof fn === "function" ? await call(() => fn({ ...shop.ctx, actorUserId: stf }, { userId: stf, role: "STAFF", unitAccess: ["*"], permissions: sp }, co, "PROSPECT")) : { ok: false, err: "setCompanyLifecycle missing" };
    const toLead = typeof fn === "function" ? await call(() => fn(shop.ctx, shop.owner, co, "LEAD")) : { ok: false, err: "missing" };
    const own = typeof fn === "function" ? await call(() => fn(shop.ctx, shop.owner, co, "PROSPECT")) : { ok: false, err: "missing" };
    const row = await P.crmCompany.findUnique({ where: { id: co }, select: { lifecycleStage: true } });
    const aud = await P.auditLog.findFirst({ where: { tenantId: shop.tid, targetId: co, action: "crm.company.lifecycle" }, select: { after: true } });
    chk("R6", !st.ok && !toLead.ok && own.ok && row?.lifecycleStage === "PROSPECT" && aud?.after?.correction === true,
      `staff=${st.ok ? "accepted" : String(st.err?.code ?? st.err)} toLead=${toLead.ok ? "accepted" : String(toLead.err?.code ?? toLead.err)} owner=${own.ok ? "ok" : String(own.err)} stage=${row?.lifecycleStage} audit=${j(aud?.after)}`);
  }

  // ═══════════ R2-2 (round 3) · correction refused while a WON deal remains · STAFF who CAN see the company ⇒ FORBIDDEN ═══════════
  {
    const shop = await mkShop("r6b");
    const co = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทยังชนะ ${TAG}` })).company.id as string;
    const k = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ผู้ซื้อ ${TAG}`, phone: "0861112233" })).contact.id as string;
    await CRM.companies.addContact(shop.ctx, shop.owner, co, { contactId: k, isPrimary: true });
    const won = shop.stages.find((x: Any) => x.kind === "WON");
    const d = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, title: `ดีลชนะ ${TAG}`, contactId: k, companyId: co, valueSatang: 100_000 });
    await CRM.deals.moveDeal(shop.ctx, shop.owner, d.id, { stageId: won.id });
    const r = await call(() => CRM.companies.setCompanyLifecycle(shop.ctx, shop.owner, co, "PROSPECT"));
    const row = await P.crmCompany.findUnique({ where: { id: co }, select: { lifecycleStage: true } });
    chk("R2-2", !r.ok && /VALIDATION/.test(String(r.err?.code ?? r.err)) && String(r.err?.message ?? "").includes("ยังมีดีลที่ชนะอยู่") && row?.lifecycleStage === "CUSTOMER",
      `withWonDeal=${r.ok ? "accepted" : `${r.err?.code} ${r.err?.message}`} stage=${row?.lifecycleStage}`);
    // N-R2-1: a STAFF who can see the company (its owner) ⇒ the role gate answers FORBIDDEN (not NOT_FOUND)
    const stf = await mkUser("-r6v");
    const sp = { "crm.company.read": true, "crm.company.update": true };
    await P.membership.create({ data: { userId: stf, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions: sp, acceptedAt: new Date() } });
    const co2 = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทของพนักงาน ${TAG}` })).company.id as string;
    await P.crmCompany.update({ where: { id: co2 }, data: { lifecycleStage: "CUSTOMER", ownerUserId: stf } });
    const sa = { userId: stf, role: "STAFF", unitAccess: ["*"], permissions: sp };
    const seen = await call(() => CRM.companies.getCompany360({ ...shop.ctx, actorUserId: stf }, sa, co2));
    const st = await call(() => CRM.companies.setCompanyLifecycle({ ...shop.ctx, actorUserId: stf }, sa, co2, "PROSPECT"));
    chk("R2-2s", seen.ok && !st.ok && /FORBIDDEN/.test(String(st.err?.code ?? st.err)), `staffSeesCompany=${seen.ok ? "yes" : String(seen.err?.code ?? seen.err)} staffCorrect=${st.ok ? "accepted" : `${st.err?.code} ${st.err?.message}`}`);
  }

  // ═══════════ R7 · ruling (4) company import with a free-mail domain ═══════════
  {
    const shop = await mkShop("r7");
    const csv = `name,emailDomain,industry\nร้านจีเมล ${TAG},gmail.com,ค้าปลีก\nร้านโดเมน ${TAG},acme-r7.co.th,ค้าปลีก\n`;
    const fn = CRM.companies.importCompanies;
    const r = await call(() => fn(shop.ctx, shop.owner, { csv }));
    const rows = (await P.crmCompany.findMany({ where: { tenantId: shop.tid, systemId: shop.S, name: { contains: TAG } }, select: { name: true, emailDomain: true } })) as Any[];
    const g = rows.find((x) => String(x.name).startsWith("ร้านจีเมล"));
    chk("R7", r.ok && r.v.created === 2 && (r.v.errors ?? []).length === 0 && (r.v.warnings ?? []).length === 1 && g && g.emailDomain === null && rows.some((x) => x.emailDomain === "acme-r7.co.th"),
      `import=${r.ok ? j(r.v) : String(r.err)} rows=${j(rows)}`);
  }
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await done("probe-c54e-r2");
}
