// C4.4-fix item 4 (US8): CREATE_DEAL on a COMPANY-parented `custom.record.field_due` trigger opens the deal for the
//   company's PRIMARY contact (linked to the company) · no primary contact ⇒ step skipped with a clear reason (run detail)
// Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f/probe-4-automation-company-deal.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture } = (await import("./_fx.mts" as string)) as Any;

const { P, TAG, chk, call, mkShop, done } = await fixture("au");
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const shop = await mkShop("a");
  const { tid, S } = shop;
  const DAY = 86_400_000;
  const thaiYmd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const now = new Date();

  const obj = await P.customObject.create({ data: { tenantId: tid, systemId: S, key: "contract", label: "สัญญา", labelPlural: "สัญญา", icon: "doc", parentType: "COMPANY", titleFieldKey: "contractNo", showAsTab: true, sortOrder: 0 } });
  const sec = await P.memberSection.create({ data: { tenantId: tid, systemId: S, objectKey: "contract", key: "main", label: "สัญญา", columns: 2, sortOrder: 0, isSystem: false } });
  const fNo = await P.memberField.create({ data: { tenantId: tid, systemId: S, sectionId: sec.id, objectKey: "contract", key: "contractNo", label: "เลขที่", type: "TEXT", sortOrder: 0 } });
  const fEnd = await P.memberField.create({ data: { tenantId: tid, systemId: S, sectionId: sec.id, objectKey: "contract", key: "endAt", label: "วันสิ้นสุด", type: "DATE", sortOrder: 1, filterable: true } });
  const mkRecord = async (companyId: string, no: string) => {
    const rec = await P.customRecord.create({ data: { tenantId: tid, systemId: S, objectId: obj.id, parentType: "COMPANY", parentId: companyId, title: no, ownerUserId: shop.uid, createdById: shop.uid } });
    await P.customRecordValue.create({ data: { tenantId: tid, recordType: "CUSTOM", recordId: rec.id, fieldId: fNo.id, valueText: no } });
    await P.customRecordValue.create({ data: { tenantId: tid, recordType: "CUSTOM", recordId: rec.id, fieldId: fEnd.id, valueDate: new Date(`${thaiYmd(new Date(now.getTime() + 25 * DAY))}T00:00:00.000Z`) } });
    return rec.id as string;
  };

  // company A: primary contact (owned by a SECOND member) + a non-primary contact · company B: no contact at all
  const coA = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัท A ${TAG}` })).company;
  const coB = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัท B ${TAG}` })).company;
  const kOther = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `รอง ${TAG}`, phone: `02${Math.floor(1_000_000 + Math.random() * 8_999_999)}`, ownerUserId: shop.uid })).contact;
  const kPrim = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `หลัก ${TAG}`, phone: `02${Math.floor(1_000_000 + Math.random() * 8_999_999)}`, ownerUserId: shop.uid })).contact;
  await CRM.companies.addContact(shop.ctx, shop.owner, coA.id, { contactId: kOther.id, isPrimary: false });
  await CRM.companies.addContact(shop.ctx, shop.owner, coA.id, { contactId: kPrim.id, isPrimary: true });
  const recA = await mkRecord(coA.id, `CT-A-${TAG}`);
  const recB = await mkRecord(coB.id, `CT-B-${TAG}`);

  const rule = await CRM.automation.createRule(shop.ctx, shop.owner, {
    name: `ต่ออายุ ${TAG}`,
    trigger: { event: "custom.record.field_due", params: { objectKey: "contract", fieldKey: "endAt", daysBefore: 30 } },
    actions: [{ type: "CREATE_DEAL", params: { pipelineId: shop.pipe.id, titleTpl: `ต่ออายุสัญญา ${TAG}` } }],
    enabled: true,
  });
  await P.automationRule.update({ where: { id: rule.id }, data: { enabled: true } });
  const cr = await call(() => CRM.automation.runCronTriggers({ now, tenantId: tid, deps: { push: async () => ({ ok: true }), email: async () => ({ ok: true }) } }));

  const dealA = await P.crmDeal.findFirst({ where: { tenantId: tid, systemId: S, companyId: coA.id }, select: { id: true, contactId: true, companyId: true, pipelineId: true, title: true, ownerUserId: true } });
  chk("4.1", cr.ok && dealA?.contactId === kPrim.id && dealA?.companyId === coA.id && dealA?.pipelineId === shop.pipe.id,
    `company-parented contract due in 25 d ⇒ renewal deal for company A with its PRIMARY contact, linked to the company — got cron=${cr.ok ? JSON.stringify(cr.v) : cr.err?.message} deal=${JSON.stringify(dealA)} primary=${kPrim.id} other=${kOther.id}`);

  const runs = await P.automationRun.findMany({ where: { tenantId: tid, ruleId: rule.id }, select: { status: true, detail: true, eventKey: true } });
  const runB = runs.find((r: Any) => String(r.eventKey).includes(recB));
  const runA = runs.find((r: Any) => String(r.eventKey).includes(recA));
  const dealB = await P.crmDeal.count({ where: { tenantId: tid, companyId: coB.id } });
  chk("4.2", !!runB && dealB === 0 && /ข้าม/.test(String(runB.detail)) && /ผู้ติดต่อหลัก/.test(String(runB.detail)),
    `company B has no primary contact ⇒ no deal, the run records the skip + reason (not a crash, not a silent success) — got deals=${dealB} run=${JSON.stringify(runB)}`);
  chk("4.3", !!runA && !/ข้าม/.test(String(runA.detail)), `company A's run records the step as done — got ${JSON.stringify(runA)}`);

  // re-running the cron is idempotent (same key per record/day) — no second deal
  await call(() => CRM.automation.runCronTriggers({ now, tenantId: tid, deps: { push: async () => ({ ok: true }), email: async () => ({ ok: true }) } }));
  const nA = await P.crmDeal.count({ where: { tenantId: tid, companyId: coA.id } });
  chk("4.4", nA === 1, `cron again ⇒ still one renewal deal — got ${nA}`);

  // a contact-triggered CREATE_DEAL is unchanged (subject contact, no company forced)
  const kSolo = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `เดี่ยว ${TAG}`, phone: `02${Math.floor(1_000_000 + Math.random() * 8_999_999)}`, ownerUserId: shop.uid })).contact;
  const r2 = await CRM.automation.createRule(shop.ctx, shop.owner, { name: `ติดต่อ ${TAG}`, trigger: { event: "crm.contact.updated" }, actions: [{ type: "CREATE_DEAL", params: { pipelineId: shop.pipe.id, titleTpl: `ดีลติดต่อ ${TAG}` } }], enabled: true });
  await P.automationRule.update({ where: { id: r2.id }, data: { enabled: true } });
  await CRM.automation.runForCrmEvent({ tenantId: tid, systemId: S, type: "crm.contact.updated", payload: { contactId: kSolo.id }, id: `${TAG}-e1` }, { now });
  const dSolo = await P.crmDeal.findFirst({ where: { tenantId: tid, contactId: kSolo.id }, select: { companyId: true } });
  chk("4.5", !!dSolo && dSolo.companyId === null, `contact-subject CREATE_DEAL unchanged (deal for that contact, no company) — got ${JSON.stringify(dSolo)}`);
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await done("probe-4-automation-company-deal");
}
