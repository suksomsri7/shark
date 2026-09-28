// C4.4-fix item 3 (US3): a company-linked deal's quotation/invoice carries the COMPANY party ⇒ visible in the B2B portal,
//   on company 360 (listDocsByParty) and the company gets its accountContactId · an individual deal is unchanged
// Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f/probe-3-company-doc-party.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture, validTaxId } = (await import("./_fx.mts" as string)) as Any;

const { P, TAG, chk, call, mkShop, done } = await fixture("dp");
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const ACC = (await import("@/lib/modules/account" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const shop = await mkShop("a", { account: true, portal: true });
  const open = shop.stages[0];
  const lines = [
    { name: "แพ็กเกจ A", qty: 2, unitPriceSatang: 350_000 },
    { name: "แพ็กเกจ B", qty: 1, unitPriceSatang: 500_000 },
  ];
  const tax = validTaxId(`0105${Date.now()}`.slice(0, 12));
  const co = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัท ${TAG}`, taxId: tax })).company;
  const phone = `09${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const k = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ผู้ติดต่อ ${TAG}`, phone, email: `${TAG}@example.com`, ownerUserId: shop.uid })).contact;
  await CRM.companies.addContact(shop.ctx, shop.owner, co.id, { contactId: k.id, isPrimary: true });
  const d = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: open.id, title: `ดีลบริษัท ${TAG}`, contactId: k.id, companyId: co.id, ownerUserId: shop.uid, lines });

  const q = await call(() => CRM.deals.issueQuotation(shop.ctx, shop.owner, d.id));
  const qDoc = q.ok ? await P.accountDocument.findFirst({ where: { id: q.v.docId }, select: { status: true, contact: { select: { partyId: true, taxId: true, name: true, legalType: true } } } }) : null;
  chk("3.1", q.ok && qDoc?.contact?.partyId === co.partyId && qDoc?.contact?.taxId === tax,
    `company deal → quotation's AccountContact = the COMPANY party (${co.partyId}) with the company taxId — got ok=${q.ok} ${q.ok ? "" : q.err?.message} contact=${JSON.stringify(qDoc?.contact)} contactParty(person)=${k.partyId}`);

  const iss = q.ok ? await accSvc.issueDocument(shop.tid, shop.A, q.v.docId) : null;
  const pdocs = await ACC.listPortalDocs(shop.tid, co.partyId, { docTypes: ["QUOTATION"] });
  chk("3.2", iss?.ok === true && pdocs.some((x: Any) => x.id === (q.ok ? q.v.docId : "")), `issued quotation is in listPortalDocs(company party) — the B2B portal scope — got issue=${JSON.stringify(iss)} portalDocs=${pdocs.length}`);

  // the REAL portal lane: invite → accept → listQuotations / getQuotation with the customer session
  let portalSeen = "not run";
  const inv = await call(() => CRM.portal.invite(shop.ctx, shop.owner, { companyId: co.id, contactId: k.id, loginMethods: ["EMAIL_OTP"] }));
  if (inv.ok) {
    const token = /([A-Za-z0-9_-]{40,})/.exec(inv.v.inviteUrl)?.[1] ?? "";
    const sess = await call(() => CRM.portal.acceptInvite(shop.slug, { token }, { ip: "10.9.9.9", userAgent: "qc" }));
    const st = sess.ok ? (typeof sess.v === "string" ? sess.v : sess.v?.token) : null;
    if (st) {
      const lq = await call(() => CRM.portal.listQuotations(st));
      const gq = await call(() => CRM.portal.getQuotation(st, q.ok ? q.v.docId : ""));
      portalSeen = `list=${lq.ok ? lq.v.items.length : lq.err?.message} get=${gq.ok ? "ok" : gq.err?.message}`;
      chk("3.3", lq.ok && lq.v.items.some((x: Any) => x.id === (q.ok ? q.v.docId : "")) && gq.ok, `customer session (portal.listQuotations/getQuotation) sees the quotation — ${portalSeen}`);
    } else chk("3.3", false, `portal acceptInvite failed: ${sess.ok ? JSON.stringify(sess.v) : sess.err?.message}`);
  } else chk("3.3", false, `portal.invite failed: ${inv.err?.message}`);

  const c360 = await call(() => CRM.companies.getCompany360(shop.ctx, shop.owner, co.id));
  const coRow = await P.crmCompany.findFirst({ where: { id: co.id }, select: { accountContactId: true } });
  const acOfParty = await P.accountContact.findFirst({ where: { systemId: shop.A, partyId: co.partyId }, select: { id: true } });
  const docs360 = c360.ok ? JSON.stringify(c360.v?.docs ?? c360.v?.documents ?? []) : "";
  chk("3.4", c360.ok && q.ok && docs360.includes(q.v.docId) && !!acOfParty && coRow?.accountContactId === acOfParty.id,
    `company 360 lists the quotation (listDocsByParty) and CrmCompany.accountContactId now points at the company's AccountContact — got 360=${c360.ok ? "ok" : c360.err?.message} hasDoc=${q.ok && docs360.includes(q.v.docId)} accountContactId=${coRow?.accountContactId} acOfParty=${acOfParty?.id}`);

  // invoice path (from an ISSUED quotation = convert; and from lines of a second company deal = createExternalInvoice)
  const inv1 = await call(() => CRM.deals.issueInvoice(shop.ctx, shop.owner, d.id));
  const inv1Doc = inv1.ok ? await P.accountDocument.findFirst({ where: { id: inv1.v.docId }, select: { contact: { select: { partyId: true } } } }) : null;
  const d2 = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: open.id, title: `ดีลบริษัท 2 ${TAG}`, contactId: k.id, companyId: co.id, ownerUserId: shop.uid, lines });
  const inv2 = await call(() => CRM.deals.issueInvoice(shop.ctx, shop.owner, d2.id));
  const inv2Doc = inv2.ok ? await P.accountDocument.findFirst({ where: { id: inv2.v.docId }, select: { contact: { select: { partyId: true } } } }) : null;
  chk("3.5", inv1.ok && inv2.ok && inv1Doc?.contact?.partyId === co.partyId && inv2Doc?.contact?.partyId === co.partyId,
    `invoices (converted from the quotation · created from lines) carry the company party — got ${inv1.ok ? inv1Doc?.contact?.partyId : inv1.err?.message} / ${inv2.ok ? inv2Doc?.contact?.partyId : inv2.err?.message}`);

  // individual deal (no company) — unchanged: the contact's own party
  const solo = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `บุคคล ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: shop.uid })).contact;
  const d3 = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: open.id, title: `ดีลบุคคล ${TAG}`, contactId: solo.id, ownerUserId: shop.uid, lines });
  const q3 = await call(() => CRM.deals.issueQuotation(shop.ctx, shop.owner, d3.id));
  const q3Doc = q3.ok ? await P.accountDocument.findFirst({ where: { id: q3.v.docId }, select: { contact: { select: { partyId: true } } } }) : null;
  const soloRow = await P.crmContact.findFirst({ where: { id: solo.id }, select: { partyId: true } });
  chk("3.6", q3.ok && !!soloRow?.partyId && q3Doc?.contact?.partyId === soloRow.partyId, `individual deal → the contact's own party (unchanged) — got ${q3.ok ? q3Doc?.contact?.partyId : q3.err?.message} vs ${soloRow?.partyId}`);

  // the person's phone/email must NOT have been attached to the company's AccountContact (no cross-match)
  const acCo = await P.accountContact.findFirst({ where: { systemId: shop.A, partyId: co.partyId }, select: { phone: true, email: true } });
  chk("3.7", acCo && acCo.phone !== phone && acCo.email !== `${TAG}@example.com`, `company AccountContact carries no personal phone/e-mail of the contact — got ${JSON.stringify(acCo)}`);

  // payments path still maps the invoice to the deal (dealIdForDoc walks refs, not party): pay + recordDocPayment
  const pay = inv2.ok ? await P.accountDocumentPayment.create({ data: { tenantId: shop.tid, systemId: shop.A, documentId: inv2.v.docId, amount: 100_000, whtAmountSatang: 0 } }) : null;
  const rp = pay ? await call(() => CRM.payments.recordDocPayment(shop.ctx, { documentId: inv2.v.docId, paymentId: pay.id, amountSatang: 100_000 })) : null;
  const d2row = await P.crmDeal.findFirst({ where: { id: d2.id }, select: { paidSatang: true } });
  chk("3.8", !!rp?.ok && Number(d2row?.paidSatang ?? 0) === 100_000, `money bridge still credits the company deal (ref-based, party-agnostic) — got ${rp?.ok ? "ok" : rp?.err?.message} paid=${d2row?.paidSatang}`);
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await done("probe-3-company-doc-party");
}
