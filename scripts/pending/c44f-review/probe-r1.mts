// C4.4-fix REVIEW probe — R1 (convert+taxId bypasses company visibility) · R2 (company/person doc cross-match by phone)
// Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f-review/probe-r1.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture, validTaxId } = (await import("../c44f/_fx.mts" as string)) as Any;
const { P, TAG, chk, call, mkShop, mkUser, done } = await fixture("rv");
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const ACC = (await import("@/lib/modules/account" as string)) as Any;
  // ── R1 ──
  const shop = await mkShop("a", { account: true, portal: true });
  const sid = await mkUser("-staff");
  await P.membership.create({ data: { userId: sid, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions: { "crm.*": true }, acceptedAt: new Date() } });
  const staff = { userId: sid, role: "STAFF", unitAccess: ["*"], permissions: { "crm.*": true } };
  const T = validTaxId(`0105${Date.now()}`.slice(0, 12));
  const hidden = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `ลับ ${TAG}`, taxId: T, ownerUserId: shop.uid })).company;
  const sctx = { ...shop.ctx, actorUserId: sid };
  const vis = await CRM.companies.liveCompanyRefs(sctx, staff, [hidden.id]);
  const L1 = (await CRM.contacts.createContact(sctx, staff, { firstName: `ลีด ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: sid })).contact.id;
  const L2 = (await CRM.contacts.createContact(sctx, staff, { firstName: `ลีด2 ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: sid })).contact.id;
  const pick = await call(() => CRM.contacts.convertContact(sctx, staff, L1, { idempotencyKey: `${TAG}-a`, company: { id: hidden.id } }));
  const viaTax = await call(() => CRM.contacts.convertContact(sctx, staff, L2, { idempotencyKey: `${TAG}-b`, company: { new: { name: `ชื่อที่พิมพ์ ${TAG}`, taxId: T }, role: "DECISION_MAKER" } }));
  const link = await P.crmCompanyContact.findFirst({ where: { companyId: hidden.id, contactId: L2 }, select: { role: true, isPrimary: true } });
  const dl = viaTax.ok && viaTax.v.dealId ? await P.crmDeal.findFirst({ where: { id: viaTax.v.dealId }, select: { companyId: true } }) : null;
  console.log(`  R1 staff sees hidden company? ${vis.length} · pick path: ${pick.ok ? "ok" : pick.err?.code + " " + pick.err?.message}`);
  console.log(`  R1 taxId path: ${viaTax.ok ? JSON.stringify(viaTax.v) : viaTax.err?.code + " " + viaTax.err?.message} · link=${JSON.stringify(link)} · deal.companyId=${dl?.companyId}`);
  chk("R1", !(viaTax.ok && viaTax.v.companyId === hidden.id), `STAFF who cannot see company X (pick path refused) must not be able to attach lead+deal to X by typing X's taxId`);

  // ── R2a: company deal doc lands on the PERSON's AccountContact when company phone == person phone ──
  const ph = `09${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const person = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `เจ้าของ ${TAG}`, phone: ph, ownerUserId: shop.uid })).contact;
  const dSolo = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: shop.stages[0].id, title: `ส่วนตัว ${TAG}`, contactId: person.id, ownerUserId: shop.uid, valueSatang: 100_000 });
  const qSolo = await CRM.deals.issueQuotation(shop.ctx, shop.owner, dSolo.id);
  const co = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บจก ${TAG}`, phone: ph })).company;
  await CRM.companies.addContact(shop.ctx, shop.owner, co.id, { contactId: person.id, isPrimary: true });
  const dCo = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: shop.stages[0].id, title: `บริษัท ${TAG}`, contactId: person.id, companyId: co.id, ownerUserId: shop.uid, valueSatang: 200_000 });
  const qCo = await CRM.deals.issueQuotation(shop.ctx, shop.owner, dCo.id);
  const docCo = await P.accountDocument.findFirst({ where: { id: qCo.docId }, select: { contact: { select: { id: true, partyId: true, name: true } } } });
  const personRow = await P.crmContact.findFirst({ where: { id: person.id }, select: { partyId: true } });
  console.log(`  R2a solo doc ok=${qSolo.ok} · company doc contact=${JSON.stringify(docCo?.contact)} · company party=${co.partyId} · person party=${personRow?.partyId}`);
  chk("R2a", docCo?.contact?.partyId === co.partyId, `company-deal quotation carries the company party even when the company phone equals the person's phone`);

  // ── R2b: reverse — company AccountContact exists (company phone); a NEW person with that phone buys individually ──
  const ph2 = `09${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const co2 = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บจก2 ${TAG}`, phone: ph2 })).company;
  const emp = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `พนักงาน ${TAG}`, email: `${TAG}-e@example.com`, ownerUserId: shop.uid })).contact;
  await CRM.companies.addContact(shop.ctx, shop.owner, co2.id, { contactId: emp.id, isPrimary: true });
  const dCo2 = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: shop.stages[0].id, title: `บริษัท2 ${TAG}`, contactId: emp.id, companyId: co2.id, ownerUserId: shop.uid, valueSatang: 300_000 });
  const qCo2 = await CRM.deals.issueQuotation(shop.ctx, shop.owner, dCo2.id);
  const owner2 = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `คนซื้อส่วนตัว ${TAG}`, phone: ph2, ownerUserId: shop.uid })).contact;
  const dPriv = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: shop.stages[0].id, title: `ของส่วนตัว ${TAG}`, contactId: owner2.id, ownerUserId: shop.uid, valueSatang: 400_000 });
  const qPriv = await CRM.deals.issueQuotation(shop.ctx, shop.owner, dPriv.id);
  const docPriv = await P.accountDocument.findFirst({ where: { id: qPriv.docId }, select: { contact: { select: { id: true, partyId: true, name: true } } } });
  console.log("  issue:", JSON.stringify(await accSvc.issueDocument(shop.tid, shop.A, qPriv.docId)));
  const portalDocs = await ACC.listPortalDocs(shop.tid, co2.partyId, { docTypes: ["QUOTATION"] });
  const c360 = await CRM.companies.getCompany360(shop.ctx, shop.owner, co2.id);
  console.log("  R2b company 360 docs:", JSON.stringify(c360?.docs ?? c360?.documents ?? null).slice(0, 400), " qPriv=", qPriv.docId);
  console.log(`  R2b company doc ok=${qCo2.ok} · private doc contact=${JSON.stringify(docPriv?.contact)} · co2 party=${co2.partyId} · company portal lists private doc? ${portalDocs.some((x: Any) => x.id === qPriv.docId)}`);
  chk("R2b", !portalDocs.some((x: Any) => x.id === qPriv.docId), `an individual (no-company) quotation of a person must not show in company B2B portal because the person's phone equals the company phone`);
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await done("review-probe-r1");
}
