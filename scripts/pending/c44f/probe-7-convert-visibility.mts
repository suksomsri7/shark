// C4.4-fix round 2 · M2/S2 (item 1): convert-with-taxId must respect company visibility; reuse is never silent
//   7.1 STAFF who cannot see company X types X's taxId ⇒ whole convert refused (calm Thai, no name/id leak), nothing written
//   7.2 same with a deal ticked ⇒ same refusal, never "ไม่พบบริษัทที่เลือก"
//   7.3 STAFF without company read, NEW company + deal ⇒ refusal message is about permission, not "ไม่พบบริษัทที่เลือก"; nothing written
//   7.4 owner types the taxId of a VISIBLE company with another name ⇒ reused + result names it (reusedCompany)
// Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f/probe-7-convert-visibility.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture, validTaxId } = (await import("./_fx.mts" as string)) as Any;
const { P, TAG, chk, call, mkShop, mkUser, done } = await fixture("cvv");
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const shop = await mkShop("a");
  const mkStaff = async (suffix: string, permissions: Record<string, unknown>) => {
    const id = await mkUser(suffix);
    await P.membership.create({ data: { userId: id, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    return { actor: { userId: id, role: "STAFF", unitAccess: ["*"], permissions }, ctx: { ...shop.ctx, actorUserId: id } };
  };
  const s1 = await mkStaff("-s1", { "crm.*": true });
  const T = validTaxId(`0105${Date.now()}`.slice(0, 12));
  const hidden = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `ลับ ${TAG}`, taxId: T, ownerUserId: shop.uid })).company;
  const vis = await CRM.companies.liveCompanyRefs(s1.ctx, s1.actor, [hidden.id]);
  const lead = async (s: Any, n: string) => (await CRM.contacts.createContact(s.ctx, s.actor, { firstName: `${n} ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: s.actor.userId })).contact.id as string;
  const counts = async () => ({ links: await P.crmCompanyContact.count({ where: { tenantId: shop.tid } }), deals: await P.crmDeal.count({ where: { tenantId: shop.tid } }), cos: await P.crmCompany.count({ where: { tenantId: shop.tid } }) });

  const L1 = await lead(s1, "ลีด1");
  const c0 = await counts();
  const r1 = await call(() => CRM.contacts.convertContact(s1.ctx, s1.actor, L1, { idempotencyKey: `${TAG}-1`, company: { new: { name: `พิมพ์ ${TAG}`, taxId: T }, role: "DECISION_MAKER" } }));
  const c1 = await counts();
  const msg1 = String(r1.err?.message ?? "");
  chk("7.1", vis.length === 0 && !r1.ok && /ยังไม่มีสิทธิ์เห็นบริษัทนั้น/.test(msg1) && !msg1.includes(hidden.name) && !msg1.includes(hidden.id) && JSON.stringify(c1) === JSON.stringify(c0) && !(await P.crmContact.findFirst({ where: { id: L1 }, select: { convertedAt: true } }))?.convertedAt,
    `hidden company by taxId ⇒ refused, no leak, nothing written — got ${r1.ok ? JSON.stringify(r1.v) : `${r1.err?.code} "${msg1}"`} counts ${JSON.stringify(c0)}→${JSON.stringify(c1)}`);

  const r2 = await call(() => CRM.contacts.convertContact(s1.ctx, s1.actor, L1, { idempotencyKey: `${TAG}-2`, company: { new: { name: `พิมพ์ ${TAG}`, taxId: T } }, deal: { pipelineId: shop.pipe.id, title: `ดีล ${TAG}` } }));
  const c2 = await counts();
  chk("7.2", !r2.ok && /ยังไม่มีสิทธิ์เห็นบริษัทนั้น/.test(String(r2.err?.message)) && !/ไม่พบบริษัทที่เลือก/.test(String(r2.err?.message)) && JSON.stringify(c2) === JSON.stringify(c0),
    `…with a deal ticked ⇒ same refusal, not "ไม่พบบริษัทที่เลือก" — got ${r2.ok ? "ok" : `${r2.err?.code} "${r2.err?.message}"`}`);

  const s2 = await mkStaff("-s2", { "crm.contact.read": true, "crm.contact.create": true, "crm.contact.update": true, "crm.contact.convert": true, "crm.deal.read": true, "crm.deal.create": true, "crm.deal.update": true });
  const L2 = await lead(s2, "ลีด2");
  const c3a = await counts();
  const r3 = await call(() => CRM.contacts.convertContact(s2.ctx, s2.actor, L2, { idempotencyKey: `${TAG}-3`, company: { new: { name: `ใหม่ ${TAG}` } }, deal: { pipelineId: shop.pipe.id, title: `ดีล2 ${TAG}` } }));
  const c3 = await counts();
  chk("7.3", r3.ok || (!/ไม่พบบริษัทที่เลือก/.test(String(r3.err?.message)) && /สิทธิ์/.test(String(r3.err?.message)) && JSON.stringify(c3) === JSON.stringify(c3a)),
    `STAFF without company read · new company + deal ⇒ ok, or a permission message (never "ไม่พบบริษัทที่เลือก") with nothing written — got ${r3.ok ? JSON.stringify(r3.v) : `${r3.err?.code} "${r3.err?.message}"`} counts ${JSON.stringify(c3a)}→${JSON.stringify(c3)}`);

  const L3 = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ลีด3 ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: shop.uid })).contact.id;
  const r4 = await call(() => CRM.contacts.convertContact(shop.ctx, shop.owner, L3, { idempotencyKey: `${TAG}-4`, company: { new: { name: `ชื่ออื่น ${TAG}`, taxId: T } } }));
  chk("7.4", r4.ok && r4.v.companyId === hidden.id && r4.v.reusedCompany?.id === hidden.id && r4.v.reusedCompany?.name === hidden.name,
    `visible company with that taxId ⇒ reused AND named in the result — got ${r4.ok ? JSON.stringify(r4.v) : r4.err?.message}`);
  // 7.5 (round 3 nit) archived company with that taxId: a user who cannot see it gets the SAME hidden-company refusal (no hint
  //     that an archived company exists) · a user who can see it keeps the restore message
  const T3 = validTaxId(`0107${Date.now()}`.slice(0, 12));
  const arch = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `เก็บ ${TAG}`, taxId: T3, ownerUserId: shop.uid })).company;
  await CRM.companies.archiveCompany(shop.ctx, shop.owner, arch.id, { confirm: true, reason: "ทดสอบเก็บถาวร" });
  const L5 = await lead(s1, "ลีด5");
  const r5 = await call(() => CRM.contacts.convertContact(s1.ctx, s1.actor, L5, { idempotencyKey: `${TAG}-5`, company: { new: { name: `x ${TAG}`, taxId: T3 } } }));
  const L6 = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ลีด6 ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: shop.uid })).contact.id;
  const r6 = await call(() => CRM.contacts.convertContact(shop.ctx, shop.owner, L6, { idempotencyKey: `${TAG}-6`, company: { new: { name: `x ${TAG}`, taxId: T3 } } }));
  chk("7.5", !r5.ok && /ยังไม่มีสิทธิ์เห็นบริษัทนั้น/.test(String(r5.err?.message)) && !/เก็บถาวร/.test(String(r5.err?.message)) && r5.err?.field === "taxId" && !r6.ok && /เก็บถาวร/.test(String(r6.err?.message)) && r6.err?.field === "taxId",
    `archived same-taxId company: hidden user ⇒ hidden refusal (no archive hint) · owner ⇒ restore message, both under taxId — got staff=${r5.ok ? "ok" : `${r5.err?.field}:${r5.err?.message}`} owner=${r6.ok ? "ok" : `${r6.err?.field}:${r6.err?.message}`}`);
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await done("probe-7-convert-visibility");
}
