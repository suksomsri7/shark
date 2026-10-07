// probe — CRM C5.5-authz-sweep: three server-action gaps found by the sweep, through the REAL actions with a real session cookie
//   A1 account connections createApiKeyAction — key scopes outside the account system (crm.* / member.*) were accepted from a crafted form
//      (the page offers only ACCOUNT_SCOPE_KEYS / account bundles) ⇒ a MANAGER minted an ACCOUNT-bound key that account REST turns into a CRM/member
//      viewer (`crmViewerOfApi`), bypassing the CRM key door (crm.api.manage + crmKeyWiderThanCreator) and the member key door (member.api.manage)
//   A2 account connections testWebhookAction — the client `type` was dispatched raw to every endpoint of the shop (fake crm.* / member.* events)
//   A3 CRM v1 addActivityAction — client contactId/dealId written as raw FKs (another shop's contact/deal) and then `include`d by the v1 lists
//   Each: RED shape = the wrong user/tenant succeeds today · GREEN = refused, nothing written · positive controls.
// QC3 ONLY (ep-weathered-river) · throwaway tenants `qc-cf8-*` swept in done() · network blocked (fetch).
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf8/probe-cf8-actions.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-weathered-river/.test(host) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.log(`QC3 only — got ${host}`);
  process.exit(1);
}
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-cf8-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const j = (v: unknown) => JSON.stringify(v);
const cut = (v: unknown, n = 120) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const THAI = /[ก-๙]/;
const USERS: string[] = [];
const TENANTS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const setCrm = (sysId: string, obj: Record<string, unknown>) =>
  P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify(obj),
    sysId,
  );
const mkUser = async (suffix: string) => {
  const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
  USERS.push(u.id);
  return u.id as string;
};
const member = (uid: string, tid: string, role: string, unitAccess: string[] = ["*"], permissions: Record<string, boolean> = {}) =>
  P.membership.create({ data: { userId: uid, tenantId: tid, role, unitAccess, permissions, acceptedAt: new Date() } });
const mkTenant = async (suffix: string) => {
  const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
  TENANTS.push(t.id);
  return t.id as string;
};
// ── Next request scope (technique of probe-fix1 / probe-cf3): server actions run with a real session cookie ──
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf8", "x-forwarded-for": "203.0.113.188" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const afterContext = { after: (_task: Any) => undefined };
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
async function sessionCookie(uid: string, tid: string): Promise<string> {
  const token = coreHash.randomToken(32) as string;
  await P.session.create({ data: { userId: uid, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 86_400_000), expiresAt: new Date(Date.now() + 86_400_000) } });
  return `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tid}`;
}
const fdx = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const call = async (f: () => Promise<Any>): Promise<{ ok: boolean; v?: Any; err?: Any }> => {
  try { return { ok: true, v: await f() }; } catch (err) { return { ok: false, err }; }
};
const errText = (r: { ok: boolean; v?: Any; err?: Any }) => (r.ok ? j(r.v) : `threw ${cut((r.err as Error)?.message ?? r.err, 80)}`);

try {
  // ═══ world: shop A (OWNER · MANAGER branch-limited · STAFF with account.settings.manage + api.key.create) + ACCOUNT book ═══
  const tA = await mkTenant("a");
  const owner = await mkUser("-owner"); await member(owner, tA, "OWNER");
  const mgr = await mkUser("-mgr"); await member(mgr, tA, "MANAGER", ["qc-branch-only"]);
  const A = (await sysSvc.createSystem(tA, "ACCOUNT", `บัญชี ${TAG}`)).id as string;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  await accSvc.saveSettings(tA, A, { orgName: `QC ${TAG}`, taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  const oCookie = await sessionCookie(owner, tA);
  const mCookie = await sessionCookie(mgr, tA);
  const CONN = (await import("@/lib/modules/account/connections-actions" as string)) as Any;
  const cp = `/app/sys/${A}/account/settings/connections`;
  const keysOf = (name: string) => P.apiKey.findMany({ where: { tenantId: tA, name }, select: { id: true, scopesJson: true, systemId: true } });

  // ── A1 createApiKeyAction: foreign scopes ──
  console.log("\n── A1 account page API key scopes ──");
  const a1 = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-crm`, scope: ["account.doc.view", "crm.contact.read", "crm.deal.read"], ttlDays: "30" }))));
  const a1rows = await keysOf(`${TAG}-crm`);
  const a1b = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-crmb`, bundle: "crm.admin", ttlDays: "30" }))));
  const a1brows = await keysOf(`${TAG}-crmb`);
  const a1m = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-mem`, scope: ["member.customer.read"], ttlDays: "30" }))));
  const a1mrows = await keysOf(`${TAG}-mem`);
  chk("CF8-A1.1", a1.ok && a1.v?.ok === false && THAI.test(String(a1.v?.reason)) && a1rows.length === 0 && a1b.v?.ok === false && a1brows.length === 0 && a1m.v?.ok === false && a1mrows.length === 0,
    `branch-limited MANAGER on the account page: scopes [account.doc.view, crm.contact.read, crm.deal.read] → ${errText(a1)} keys=${a1rows.length} ${j(a1rows.map((k: Any) => k.scopesJson))} · bundle crm.admin → ${a1b.v?.ok === false ? "refused" : errText(a1b)} keys=${a1brows.length} · [member.customer.read] → ${a1m.v?.ok === false ? "refused" : errText(a1m)} keys=${a1mrows.length} (want refused, no key)`);
  const a1c = await call(() => inScope(oCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-acc`, bundle: "accountant", ttlDays: "30" }))));
  const a1crows = await keysOf(`${TAG}-acc`);
  const a1d = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-acc2`, scope: ["account.doc.view", "account.contact.manage"], ttlDays: "30" }))));
  const a1drows = await keysOf(`${TAG}-acc2`);
  const accOnly = (rows: Any[]) => rows.length === 1 && rows[0].systemId === A && (rows[0].scopesJson as string[]).length > 0 && (rows[0].scopesJson as string[]).every((s) => s.startsWith("account."));
  chk("CF8-A1.2", a1c.v?.ok === true && typeof a1c.v?.rawKey === "string" && accOnly(a1crows) && a1d.v?.ok === true && accOnly(a1drows) && j(a1drows[0]?.scopesJson) === j(["account.doc.view", "account.contact.manage"]),
    `positive control: OWNER bundle accountant → ${a1c.v?.ok ? "ok" : errText(a1c)} (${(a1crows[0]?.scopesJson as string[] | undefined)?.length ?? 0} account scopes) · MANAGER ticked [account.doc.view, account.contact.manage] → ${a1d.v?.ok ? "ok" : errText(a1d)} stored=${j(a1drows[0]?.scopesJson)}`);

  // ── A2 testWebhookAction: event type ──
  console.log("\n── A2 account page webhook test ──");
  const allEp = await P.webhookEndpoint.create({ data: { tenantId: tA, url: "https://example.com/qc-cf8-all", secret: "x".repeat(48), eventsJson: [], active: true } });
  const delOf = (type: string) => P.webhookDelivery.count({ where: { tenantId: tA, eventType: type } });
  const a2 = await call(() => inScope(oCookie, cp, () => CONN.testWebhookAction(fdx({ systemId: A, type: "crm.deal.won" }))));
  const a2m = await call(() => inScope(oCookie, cp, () => CONN.testWebhookAction(fdx({ systemId: A, type: "member.created" }))));
  const a2x = await call(() => inScope(oCookie, cp, () => CONN.testWebhookAction(fdx({ systemId: A, type: "qc.anything" }))));
  const forged = (await delOf("crm.deal.won")) + (await delOf("member.created")) + (await delOf("qc.anything"));
  // network is blocked ⇒ every delivery FAILS and the action's own ok/"no endpoint" answer cannot tell "refused" from "sent and failed":
  //   the evidence is the WebhookDelivery rows written for the requested type (a row = it was dispatched to the all-events endpoint)
  chk("CF8-A2.1", a2.v?.ok === false && a2m.v?.ok === false && a2x.v?.ok === false && forged === 0,
    `OWNER test with type crm.deal.won → ${errText(a2)} · member.created → ${errText(a2m)} · qc.anything → ${errText(a2x)} · deliveries of those types=${forged} (want refused, 0)`);
  const a2ok = await call(() => inScope(oCookie, cp, () => CONN.testWebhookAction(fdx({ systemId: A, type: "account.document.issued" }))));
  const a2lab = await call(() => inScope(oCookie, cp, () => CONN.testWebhookAction(fdx({ systemId: A, type: "เมื่อบันทึกรับ/จ่ายเงิน" }))));
  const a2def = await call(() => inScope(oCookie, cp, () => CONN.testWebhookAction(fdx({ systemId: A }))));
  const d1 = await delOf("account.document.issued"), d2 = await delOf("account.payment.recorded"), d3 = await delOf("account.document.approved");
  chk("CF8-A2.2", a2ok.ok && a2def.ok && a2lab.ok && d1 >= 1 && d3 >= 1 && d2 >= 1,
    `positive control: account.document.issued → ${errText(a2ok)} (deliveries ${d1}) · no type (default approved) → ${errText(a2def)} (${d3}) · the panel's Thai label of account.payment.recorded → ${errText(a2lab)} (${d2}) — a dispatch row per type = sent (deliveries fail: network blocked)`);
  void allEp;

  // ── A3 CRM v1 addActivityAction: another shop's contact / deal ──
  console.log("\n── A3 CRM v1 add activity ──");
  const S = (await sysSvc.createSystem(tA, "CRM", `CRM ${TAG}`)).id as string;
  await setCrm(S, { uiVersion: 1 });
  const tB = await mkTenant("b");
  const SB = (await sysSvc.createSystem(tB, "CRM", `CRM B ${TAG}`)).id as string;
  const foreignC = await P.crmContact.create({ data: { tenantId: tB, systemId: SB, name: "ลูกค้าลับร้าน B", phone: "0812345678" } });
  const S2 = (await sysSvc.createSystem(tA, "CRM", `CRM2 ${TAG}`)).id as string; // another CRM system of the SAME shop
  const otherSysC = await P.crmContact.create({ data: { tenantId: tA, systemId: S2, name: "ลูกค้าระบบอื่น" } });
  const ownC = await P.crmContact.create({ data: { tenantId: tA, systemId: S, name: "ลูกค้าร้าน A" } });
  const CRMV1 = (await import("@/lib/modules/crm/actions" as string)) as Any;
  const actsOf = (contactId: string) => P.crmActivity.count({ where: { tenantId: tA, contactId } });
  const vp = `/app/sys/${S}/crm`;
  const a3 = await call(() => inScope(oCookie, vp, () => CRMV1.addActivityAction(fdx({ systemId: S, title: "QC งานผูกร้านอื่น", type: "TASK", contactId: foreignC.id }))));
  const a3s = await call(() => inScope(oCookie, vp, () => CRMV1.addActivityAction(fdx({ systemId: S, title: "QC งานผูกระบบอื่น", type: "TASK", contactId: otherSysC.id }))));
  const a3d = await call(() => inScope(oCookie, vp, () => CRMV1.addActivityAction(fdx({ systemId: S, title: "QC งานผูกดีลร้านอื่น", type: "TASK", dealId: "qc-nonexistent-deal" }))));
  const leaked = (await actsOf(foreignC.id)) + (await actsOf(otherSysC.id)) + (await P.crmActivity.count({ where: { tenantId: tA, dealId: "qc-nonexistent-deal" } }));
  chk("CF8-A3.1", leaked === 0,
    `v1 OWNER of shop A: contactId of shop B → ${a3.ok ? "returned" : errText(a3)} · contactId of another CRM system of A → ${a3s.ok ? "returned" : errText(a3s)} · unknown dealId → ${a3d.ok ? "returned" : errText(a3d)} · activities written with those refs=${leaked} (want 0)`);
  const a3ok = await call(() => inScope(oCookie, vp, () => CRMV1.addActivityAction(fdx({ systemId: S, title: "QC งานของร้าน A", type: "TASK", contactId: ownC.id }))));
  const a3none = await call(() => inScope(oCookie, vp, () => CRMV1.addActivityAction(fdx({ systemId: S, title: "QC งานลอย", type: "TASK" }))));
  const own = await actsOf(ownC.id);
  const loose = await P.crmActivity.count({ where: { tenantId: tA, systemId: S, contactId: null, dealId: null, title: "QC งานลอย" } });
  chk("CF8-A3.2", own === 1 && loose === 1, `positive control: own contact → ${a3ok.ok ? "ok" : errText(a3ok)} (${own} row) · no target → ${a3none.ok ? "ok" : errText(a3none)} (${loose} row)`);
} catch (e) {
  chk("CRASH", false, String((e as Error)?.stack ?? e).slice(0, 700));
} finally {
  for (const T of TENANTS) {
    const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0;
    for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    chk(`CLEAN-${T.slice(-6)}`, left === 0 && (await P.tenant.count({ where: { id: T } })) === 0, `tenant rows left=${left}`);
  }
  for (const id of USERS) {
    await P.session.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined);
    await P.user.delete({ where: { id } }).catch(() => undefined);
  }
  const usersLeft = await P.user.count({ where: { email: { startsWith: TAG } } });
  chk("CLEAN-users", usersLeft === 0, `users left=${usersLeft}`);
  await prisma.$disconnect();
}
const passed = res.filter((r) => r.ok).length;
console.log(`\n${passed === res.length ? "🟢" : "🔴"} probe cf8 actions: ${passed}/${res.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: res.length, passed, findings: res.filter((r) => !r.ok).map((r) => r.id) })}`);
process.exit(passed === res.length ? 0 : 1);
