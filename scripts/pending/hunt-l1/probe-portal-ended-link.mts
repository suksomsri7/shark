// hunt-l1 probe (C5.2 · lens L1) — QC2 only · throwaway tenant `qc-hunt-l1-*` · cleans up after itself
// Question: after staff REMOVE a contact from a company (CrmCompanyContact.endedAt set), does that contact's portal access
// for the company keep working (existing session + a brand-new session)?
// Run: bash scripts/qc2.sh pnpm exec tsx scripts/pending/hunt-l1/probe-portal-ended-link.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!String(process.env.DATABASE_URL ?? "").includes("ep-cool-shadow")) {
  console.log("REFUSE: not QC2");
  process.exit(2);
}
const P = ((await import("@/lib/core/db" as string)) as Any).prisma as Any;
const CS = (await import("@/lib/modules/member/customer-session" as string)) as Any;
const portal = (await import("@/lib/modules/crm/portal" as string)) as Any;
const companies = (await import("@/lib/modules/crm/companies" as string)) as Any;
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-hunt-l1-${rand}`;
const TENANTS: string[] = [];
const USERS: string[] = [];
const out: Record<string, unknown> = { host };
try {
  const u = await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  TENANTS.push(t.id);
  await P.membership.create({ data: { userId: u.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const crm = (await P.appSystem.create({ data: { tenantId: t.id, type: "CRM", name: `CRM ${TAG}` } })).id;
  const acc = (await P.appSystem.create({ data: { tenantId: t.id, type: "ACCOUNT", name: `ACC ${TAG}` } })).id;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_build_object('crm', $1::jsonb) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true, portal: { enabled: true, loginMethods: ["EMAIL_OTP"], showDeals: false, allowIssue: true } }),
    crm,
  );
  const party = await P.party.create({ data: { tenantId: t.id, name: `Co ${TAG}`, kind: "COMPANY" } });
  const ac = await P.accountContact.create({ data: { tenantId: t.id, systemId: acc, kind: "CUSTOMER", legalType: "COMPANY", name: `Co ${TAG}`, partyId: party.id } });
  const co = await P.crmCompany.create({ data: { tenantId: t.id, systemId: crm, partyId: party.id, name: `Co ${TAG}`, accountContactId: ac.id } });
  const pp = await P.party.create({ data: { tenantId: t.id, name: `Ex-employee ${TAG}`, kind: "PERSON" } });
  const ct = await P.crmContact.create({ data: { tenantId: t.id, systemId: crm, name: `Ex-employee ${TAG}`, firstName: "Ex", email: `${TAG}-ex@qc.invalid`, partyId: pp.id, ownerUserId: u.id, companyId: co.id } });
  await P.crmCompanyContact.create({ data: { tenantId: t.id, companyId: co.id, contactId: ct.id, isPrimary: true } });
  await P.accountDocument.create({ data: { tenantId: t.id, systemId: acc, docType: "QUOTATION", docNo: `${TAG}-Q1`, status: "AWAITING_ACCEPT", direction: "OUT", contactId: ac.id, subTotal: 5_000_000, grandTotal: 5_000_000, validUntil: new Date(Date.now() + 30 * 86_400_000) } });
  const access = await P.crmPortalAccess.create({ data: { tenantId: t.id, systemId: crm, companyId: co.id, contactId: ct.id, role: "APPROVE", invitedById: u.id, acceptedAt: new Date(), loginMethods: ["EMAIL_OTP"] } });

  const s1 = await CS.mintPortalSession(access.id, {});
  out.before_quotes = (await portal.listQuotations(s1.token)).items.length;

  // staff removes the contact from the company (the normal "left the company" action)
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  await companies.removeContact({ tenantId: t.id, systemId: crm, actorUserId: u.id }, owner, co.id, ct.id);
  const link = await P.crmCompanyContact.findFirst({ where: { companyId: co.id, contactId: ct.id }, select: { endedAt: true } });
  out.link_endedAt_set = !!link?.endedAt;

  // (a) the session minted before the removal
  out.after_old_session_valid = !!(await CS.getPortalSession(s1.token));
  out.after_old_session_quotes = await portal.listQuotations(s1.token).then((r: Any) => r.items.length).catch((e: Any) => `ERR ${e?.code ?? e?.message}`);
  // (b) a brand-new session (what OTP/LINE login would mint)
  const s2 = await CS.mintPortalSession(access.id, {}).catch((e: Any) => ({ err: String(e?.message ?? e) }));
  out.after_new_session_minted = !!(s2 as Any).token;
  if ((s2 as Any).token) out.after_new_session_quotes = await portal.listQuotations((s2 as Any).token).then((r: Any) => r.items.length).catch((e: Any) => `ERR ${e?.code ?? e?.message}`);
  // (c) staff listAccess still shows ACTIVE
  out.staff_listAccess_status = (await portal.listAccess({ tenantId: t.id, systemId: crm, actorUserId: u.id }, owner, { companyId: co.id })).items.map((r: Any) => r.status);
  // (d) portal contacts list of the company still shows the ex-employee (to any other portal user of the company)
  out.portal_contacts_after = (await portal.listContacts(s1.token).catch(() => ({ items: [] }))).items.map((c: Any) => c.id === ct.id ? "EX-EMPLOYEE" : "other");
} catch (e) {
  out.fatal = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
} finally {
  const ids = TENANTS;
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* retried next pass */ } };
  if (ids.length) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const tb of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    let left = 0;
    for (const tb of tables) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
      left += Number(r?.[0]?.n ?? 0);
    }
    out.cleanup_rows_left = left;
    out.cleanup_tenant_left = await P.tenant.count({ where: { id: { in: ids } } });
  }
  for (const uid of USERS) await del(() => P.session.deleteMany({ where: { userId: uid } }));
  for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
  console.log(`PROBE ${JSON.stringify(out)}`);
  await P.$disconnect().catch(() => undefined);
  process.exit(0);
}
