// C4.4-fix round 2 · M1 layer (b): account findOrCreateCustomerContact — a caller that passes a partyId gets the contact of
//   THAT party first, and never a tax/phone/name+email match that belongs to ANOTHER party · callers without partyId unchanged
//   · layer (a): a company-deal document's AccountContact carries no phone/e-mail (the company's own phone is not sent)
// Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f/probe-6-account-party-match.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture, validTaxId } = (await import("./_fx.mts" as string)) as Any;
const { P, TAG, chk, mkShop, done } = await fixture("am");
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const shop = await mkShop("a", { account: true });
  const ctx = { tenantId: shop.tid, systemId: shop.A };
  const pQ = await P.party.create({ data: { tenantId: shop.tid, name: `Q ${TAG}`, kind: "COMPANY" } });
  const pP = await P.party.create({ data: { tenantId: shop.tid, name: `P ${TAG}`, kind: "PERSON" } });
  const phone = `09${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const tax = validTaxId(`0105${Date.now()}`.slice(0, 12));
  const email = `${TAG}@example.com`;
  const q = await acc.ensureAccountContact(ctx, { partyId: pQ.id, name: `Q ${TAG}`, phone, email, taxId: tax });
  // 6.1 phone of Q, caller = party P ⇒ NOT Q's contact; a contact of P
  const a = await acc.findOrCreateCustomerContact(ctx, { name: `P ${TAG}`, phone, partyId: pP.id });
  const aRow = await P.accountContact.findFirst({ where: { id: a.id }, select: { partyId: true } });
  chk("6.1", a.id !== q.id && aRow?.partyId === pP.id, `phone match of another party refused ⇒ own contact for P — got same=${a.id === q.id} party=${aRow?.partyId}`);
  // 6.2 second call for P ⇒ same contact (resolved by partyId first)
  const a2 = await acc.findOrCreateCustomerContact(ctx, { name: `P ${TAG}`, phone, partyId: pP.id });
  chk("6.2", a2.id === a.id, `partyId resolves first ⇒ same contact on repeat — got ${a2.id} vs ${a.id}`);
  // 6.3 tax / name+email of Q with caller party P2 ⇒ not Q's
  const pP2 = await P.party.create({ data: { tenantId: shop.tid, name: `Q ${TAG}`, kind: "COMPANY" } });
  const b = await acc.findOrCreateCustomerContact(ctx, { name: `Q ${TAG}`, email, taxId: tax, partyId: pP2.id });
  chk("6.3", b.id !== q.id, `tax + name/e-mail match of another party refused — got same=${b.id === q.id}`);
  // 6.4 no partyId ⇒ unchanged: phone match returns Q's contact
  const c = await acc.findOrCreateCustomerContact(ctx, { name: `ใครก็ได้ ${TAG}`, phone });
  chk("6.4", c.id === q.id, `caller WITHOUT partyId: phone match unchanged (returns the existing contact) — got same=${c.id === q.id}`);
  // 6.5 the caller's own party, tax match with the SAME party ⇒ accepted (no duplicate)
  const d = await acc.findOrCreateCustomerContact(ctx, { name: `Q ${TAG}`, taxId: tax, partyId: pQ.id });
  chk("6.5", d.id === q.id, `same party ⇒ its own contact — got same=${d.id === q.id}`);
  // 6.6 layer (a): company with phone+email ⇒ the company deal's AccountContact has no phone/e-mail sent by CRM
  const co = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บจก ${TAG}`, phone: `02${Math.floor(1_000_000 + Math.random() * 8_999_999)}`, email: `co-${TAG}@example.com` })).company;
  const k = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `คน ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: shop.uid })).contact;
  await CRM.companies.addContact(shop.ctx, shop.owner, co.id, { contactId: k.id, isPrimary: true });
  const dl = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: shop.stages[0].id, title: `ดีล ${TAG}`, contactId: k.id, companyId: co.id, ownerUserId: shop.uid, valueSatang: 100_000 });
  const qd = await CRM.deals.issueQuotation(shop.ctx, shop.owner, dl.id);
  const ac = await P.accountDocument.findFirst({ where: { id: qd.docId }, select: { contact: { select: { partyId: true, phone: true, email: true } } } });
  chk("6.6", ac?.contact?.partyId === co.partyId && !ac?.contact?.phone && !ac?.contact?.email, `company doc contact = company party, no phone/e-mail sent — got ${JSON.stringify(ac?.contact)}`);
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await done("probe-6-account-party-match");
}
