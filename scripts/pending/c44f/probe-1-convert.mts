// C4.4-fix item 1 (US2): lead → company convert carries the NEW company's taxId + the contact's ROLE in the company
// Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f/probe-1-convert.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture, validTaxId } = (await import("./_fx.mts" as string)) as Any;

const { P, TAG, chk, call, mkShop, done } = await fixture("cv");
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const shop = await mkShop("a");
  const lead = async (name: string) => (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `${name} ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: shop.uid })).contact.id as string;
  const key = () => `${TAG}-${Math.random().toString(36).slice(2)}`;
  const deal = { pipelineId: shop.pipe.id, title: `ดีล ${TAG}`, valueSatang: 5_000_000 };

  // 1.1 new company + taxId + DECISION_MAKER
  const tax = validTaxId(`0105${Date.now()}`.slice(0, 12));
  const c1 = await lead("ลีด1");
  const r1 = await call(() => CRM.contacts.convertContact(shop.ctx, shop.owner, c1, { idempotencyKey: key(), company: { new: { name: `บริษัท หนึ่ง ${TAG}`, taxId: tax }, role: "DECISION_MAKER" }, deal }));
  const co1 = r1.ok ? await P.crmCompany.findFirst({ where: { id: r1.v.companyId }, select: { taxId: true, partyId: true } }) : null;
  const link1 = r1.ok ? await P.crmCompanyContact.findFirst({ where: { companyId: r1.v.companyId, contactId: c1 }, select: { role: true, isPrimary: true } }) : null;
  const party1 = co1 ? await P.party.findFirst({ where: { id: co1.partyId }, select: { kind: true, taxId: true } }) : null;
  chk("1.1", r1.ok && co1?.taxId === tax && link1?.role === "DECISION_MAKER" && link1?.isPrimary === true && party1?.kind === "COMPANY",
    `convert(new company + taxId + role DECISION_MAKER) ⇒ CrmCompany.taxId=${tax} · link role DECISION_MAKER (primary) · Party COMPANY — got ok=${r1.ok} ${r1.ok ? "" : String(r1.err?.message)} taxId=${co1?.taxId} role=${link1?.role} primary=${link1?.isPrimary} party=${JSON.stringify(party1)}`);

  // 1.2 bad taxId ⇒ VALIDATION (calm Thai, same text as createCompany) · nothing written
  const c2 = await lead("ลีด2");
  const before = await P.crmCompany.count({ where: { tenantId: shop.tid } });
  const r2 = await call(() => CRM.contacts.convertContact(shop.ctx, shop.owner, c2, { idempotencyKey: key(), company: { new: { name: `บริษัท สอง ${TAG}`, taxId: "0105561000004" } }, deal }));
  const rc = await call(() => CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัท เทียบ ${TAG}`, taxId: "0105561000004" }));
  const after = await P.crmCompany.count({ where: { tenantId: shop.tid } });
  const c2row = await P.crmContact.findFirst({ where: { id: c2 }, select: { convertedAt: true } });
  chk("1.2", !r2.ok && r2.err?.code === "VALIDATION" && !rc.ok && r2.err?.message === rc.err?.message && /[ก-๙]/.test(String(r2.err?.message)) && after === before && !c2row?.convertedAt,
    `bad checksum taxId ⇒ VALIDATION with createCompany's own Thai text, no company, contact not converted — got ${r2.ok ? "ok" : `${r2.err?.code} "${r2.err?.message}"`} vs createCompany "${rc.ok ? "ok" : rc.err?.message}" companies ${before}→${after}`);

  // 1.3 unknown role ⇒ VALIDATION, nothing written
  const c3 = await lead("ลีด3");
  const r3 = await call(() => CRM.contacts.convertContact(shop.ctx, shop.owner, c3, { idempotencyKey: key(), company: { new: { name: `บริษัท สาม ${TAG}` }, role: "BOSS" }, deal }));
  const after3 = await P.crmCompany.count({ where: { tenantId: shop.tid } });
  chk("1.3", !r3.ok && r3.err?.code === "VALIDATION" && after3 === after, `unknown role ⇒ VALIDATION, nothing written — got ${r3.ok ? "ok" : `${r3.err?.code} "${r3.err?.message}"`} companies ${after}→${after3}`);

  // 1.4 pick an EXISTING company + role ⇒ link carries the role · company taxId untouched
  const existing = await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัท เดิม ${TAG}` });
  const c4 = await lead("ลีด4");
  const r4 = await call(() => CRM.contacts.convertContact(shop.ctx, shop.owner, c4, { idempotencyKey: key(), company: { id: existing.company.id, role: "BILLING" } }));
  const link4 = await P.crmCompanyContact.findFirst({ where: { companyId: existing.company.id, contactId: c4 }, select: { role: true } });
  chk("1.4", r4.ok && link4?.role === "BILLING", `convert(pick existing company, role BILLING) ⇒ link role BILLING — got ok=${r4.ok} ${r4.ok ? "" : r4.err?.message} role=${link4?.role}`);

  // 1.5 no role given ⇒ unchanged default (OTHER) · new company without taxId still works
  const c5 = await lead("ลีด5");
  const r5 = await call(() => CRM.contacts.convertContact(shop.ctx, shop.owner, c5, { idempotencyKey: key(), company: { new: { name: `บริษัท ห้า ${TAG}` } } }));
  const link5 = r5.ok ? await P.crmCompanyContact.findFirst({ where: { companyId: r5.v.companyId, contactId: c5 }, select: { role: true } }) : null;
  const co5 = r5.ok ? await P.crmCompany.findFirst({ where: { id: r5.v.companyId }, select: { taxId: true } }) : null;
  chk("1.5", r5.ok && link5?.role === "OTHER" && co5?.taxId === null, `no taxId/role ⇒ unchanged behaviour (role OTHER, taxId null) — got ok=${r5.ok} role=${link5?.role} taxId=${co5?.taxId}`);

  // 1.6 taxId already held by a live company of this system ⇒ that company is reused (createCompany's dedupe rule) · no 2nd row
  const c6 = await lead("ลีด6");
  const r6 = await call(() => CRM.contacts.convertContact(shop.ctx, shop.owner, c6, { idempotencyKey: key(), company: { new: { name: `ชื่ออื่น ${TAG}`, taxId: tax.replace(/^(\d{1})(\d{3})/, "$1-$2 ") }, role: "INFLUENCER" } }));
  const sameTax = await P.crmCompany.count({ where: { tenantId: shop.tid, taxId: tax } });
  chk("1.6", r6.ok && r1.ok && r6.v.companyId === r1.v.companyId && sameTax === 1,
    `same taxId (typed with dash/space) ⇒ reuses the existing company (1 row) — got ok=${r6.ok} ${r6.ok ? "" : r6.err?.message} company=${r6.ok ? r6.v.companyId : "-"} vs ${r1.ok ? r1.v.companyId : "-"} rows=${sameTax}`);

  // 1.7 replay of the same idempotency key returns the same ids (unchanged contract)
  const c7 = await lead("ลีด7");
  const k7 = key();
  const in7 = { idempotencyKey: k7, company: { new: { name: `บริษัท เจ็ด ${TAG}`, taxId: validTaxId(`0107${Date.now()}`.slice(0, 12)) }, role: "TECHNICAL" } };
  const a7 = await call(() => CRM.contacts.convertContact(shop.ctx, shop.owner, c7, in7));
  const b7 = await call(() => CRM.contacts.convertContact(shop.ctx, shop.owner, c7, in7));
  chk("1.7", a7.ok && b7.ok && b7.v.replayed === true && b7.v.companyId === a7.v.companyId, `replay ⇒ same company, replayed=true — got ${JSON.stringify(a7.ok ? a7.v : a7.err?.message)} / ${JSON.stringify(b7.ok ? b7.v : b7.err?.message)}`);

  // 1.8 REST schema accepts the new fields (contacts.convert op input) and still rejects unknown keys
  const reg = (await import("@/lib/modules/crm/api/ops/contacts" as string)) as Any;
  const ops: Any[] = Object.values(reg).flatMap((v: Any) => (Array.isArray(v) ? v : [v])).filter((o: Any) => o && o.id === "contacts.convert");
  const op = ops[0];
  const okParse = op?.input?.safeParse({ company: { new: { name: "x", taxId: tax }, role: "DECISION_MAKER" } });
  const badParse = op?.input?.safeParse({ company: { new: { name: "x" }, role: "BOSS" } });
  chk("1.8", !!op && okParse?.success === true && badParse?.success === false, `REST contacts.convert input: {new:{name,taxId}, role} accepted · role BOSS refused — got op=${!!op} ok=${okParse?.success} bad=${badParse?.success}`);
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await done("probe-1-convert");
}
