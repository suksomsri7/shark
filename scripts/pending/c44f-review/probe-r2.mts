// C4.4-fix REVIEW round 2 — account findOrCreateCustomerContact (M1 b) edge cases
// Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f-review/probe-r2.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture } = (await import("../c44f/_fx.mts" as string)) as Any;
const { P, TAG, chk, mkShop, done } = await fixture("r2");
try {
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const party = (await import("@/lib/modules/party" as string)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const shop = await mkShop("a", { account: true });
  const ctx = { tenantId: shop.tid, systemId: shop.A };
  const rnd = () => `09${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const mkParty = (name: string, phone: string | null) => P.party.create({ data: { tenantId: shop.tid, kind: "PERSON", name, phone, phoneNorm: phone } });
  const mkAc = async (name: string, phone: string, partyId: string | null) => {
    const r = await accSvc.createContact({ tenantId: shop.tid, systemId: shop.A, kind: "CUSTOMER", name, phone, ...(partyId ? { partyId } : {}) });
    const id = r?.id ?? r?.contact?.id;
    if (!partyId) await P.accountContact.update({ where: { id }, data: { partyId: null } });
    return id as string;
  };

  // A — merged-away party: contact belongs to Pm; Pm merged INTO Pk; caller asks Pk (the survivor) with the same phone
  const phA = rnd();
  const Pm = await mkParty(`คนเดิม ${TAG}`, phA);
  const Pk = await mkParty(`คนเดิม ${TAG}`, null);
  const acA = await mkAc(`คนเดิม ${TAG}`, phA, Pm.id);
  await party.mergeParties(shop.tid, Pk.id, Pm.id);
  const gotA = await accSvc.findOrCreateCustomerContact(ctx, { name: `คนเดิม ${TAG}`, phone: phA, partyId: Pk.id });
  const nA = await P.accountContact.count({ where: { systemId: shop.A, phone: phA } });
  console.log(`  A  existing contact(Pm)=${acA} · got=${gotA.id} · contacts with that phone now=${nA}`);
  chk("A", gotA.id === acA, "after Pm→Pk party merge, asking for Pk reuses the contact of Pm (same person) instead of creating a 2nd contact");

  // B — backfill flip-flop: legacy unpartied contact · an OLDER party owns the same phone · caller's party is a newer duplicate
  const phB = rnd();
  const Pold = await mkParty(`สมชาย ${TAG}`, phB);
  await new Promise((r) => setTimeout(r, 20));
  const Pa = await mkParty(`สมชาย ใจดี ${TAG}`, phB); // duplicate-phone party (party.updateContactInfo allows this by design)
  const acB = await mkAc(`สมชาย (เก่า) ${TAG}`, phB, null);
  const b1 = await accSvc.findOrCreateCustomerContact(ctx, { name: `สมชาย ใจดี ${TAG}`, phone: phB, partyId: Pa.id });
  const acBrow = await P.accountContact.findFirst({ where: { id: acB }, select: { partyId: true } });
  const b2 = await accSvc.findOrCreateCustomerContact(ctx, { name: `สมชาย ใจดี ${TAG}`, phone: phB, partyId: Pa.id });
  console.log(`  B  call1=${b1.id} (legacy=${acB}; its partyId after backfill=${acBrow?.partyId} · Pold=${Pold.id} · Pa=${Pa.id}) · call2=${b2.id}`);
  chk("B", b1.id === b2.id, "two identical calls for the same party return the same contact (no split between call 1 and call 2)");

  // C — concurrency: 6 parallel first calls for a brand-new party, no contact yet ⇒ exactly one contact
  const Pc = await mkParty(`พร้อมกัน ${TAG}`, null);
  const rs = await Promise.all(Array.from({ length: 6 }, () => accSvc.findOrCreateCustomerContact(ctx, { name: `พร้อมกัน ${TAG}`, email: `${TAG}@x.invalid`, partyId: Pc.id })));
  const nC = await P.accountContact.count({ where: { systemId: shop.A, partyId: Pc.id } });
  chk("C", new Set(rs.map((r: Any) => r.id)).size === 1 && nC === 1, `6 concurrent calls, new party ⇒ 1 contact — got ids=${new Set(rs.map((r: Any) => r.id)).size} rows=${nC}`);

  // D — real CRM lane for A: contact X (phone) gets a quotation ⇒ AC(PX); contact Y (no phone) merged with X keeping Y; Y's next quotation
  const phD = rnd();
  const X = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `เอ็กซ์ ${TAG}`, phone: phD, ownerUserId: shop.uid })).contact;
  const dX = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: shop.stages[0].id, title: `X ${TAG}`, contactId: X.id, ownerUserId: shop.uid, valueSatang: 100_000 });
  const qX = await CRM.deals.issueQuotation(shop.ctx, shop.owner, dX.id);
  const Y = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `วาย ${TAG}`, email: `${TAG}-y@x.invalid`, ownerUserId: shop.uid })).contact;
  let mergeInfo = "";
  try {
    const mr = await CRM.contacts.mergeContacts(shop.ctx, shop.owner, { keepId: Y.id, mergeId: X.id, reason: "ซ้ำกัน ทดสอบ", confirm: true, fieldChoices: { phone: "merge" } });
    mergeInfo = JSON.stringify(mr).slice(0, 120);
  } catch (e) { mergeInfo = `merge threw ${(e as Error).message}`; }
  const yRow = await P.crmContact.findFirst({ where: { id: Y.id }, select: { partyId: true, phone: true } });
  const dY = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: shop.stages[0].id, title: `Y ${TAG}`, contactId: Y.id, ownerUserId: shop.uid, valueSatang: 200_000 });
  const qY = await CRM.deals.issueQuotation(shop.ctx, shop.owner, dY.id);
  const cX = await P.accountDocument.findFirst({ where: { id: qX.docId }, select: { contactId: true } });
  const cY = await P.accountDocument.findFirst({ where: { id: qY.docId }, select: { contactId: true } });
  console.log(`  D  merge=${mergeInfo} · keep Y party=${yRow?.partyId} phone=${yRow?.phone} · X doc contact=${cX?.contactId} · Y doc contact=${cY?.contactId}`);
  chk("D", !!cX && !!cY && cX.contactId === cY.contactId, "after merging CRM contacts, the survivor's next quotation lands on the same accounting contact as the merged one's earlier quotation");
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await done("review-probe-r2");
}
