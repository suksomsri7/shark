// probe-h2.mts — C5.4-B round 4 (hunter H2): the ACCOUNT connections actions must not rotate/revoke a CRM key (QC2 only · throwaway tenant, deleted)
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54b/probe-h2.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !String(process.env.DATABASE_URL ?? "").includes("ep-cool-shadow")) { console.log(`REFUSE: not QC2 (${host})`); process.exit(2); }
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, fn: () => Promise<T>): Promise<T> {
  const pathname = "/app/sys/x/account/settings/connections";
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext: { after: () => undefined } };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const hash = (await import("@/lib/core/hash" as string)) as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, "q");
const TAG = `qc-c54b-h2-${rand}`;
const TENANTS: string[] = []; const USERS: string[] = [];
const out: Record<string, unknown> = { tag: TAG };
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const keys = (await import("@/lib/api-keys/service" as string)) as Any;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Any;
  const ACT = (await import(pathToFileURL(resolve("src/lib/modules/account/connections-actions.ts")).href)) as Any;
  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string; TENANTS.push(T);
  const mk = async (label: string, role: string, permissions: Record<string, unknown>) => {
    const u = await P.user.create({ data: { email: `${TAG}-${label}@qc.invalid`, name: `QC ${label}` } }); USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    const tok = hash.randomToken(32) as string;
    await P.session.create({ data: { userId: u.id, tokenHash: hash.sha256(tok), idleExpiresAt: new Date(Date.now() + 86_400_000), expiresAt: new Date(Date.now() + 86_400_000) } });
    return { id: u.id as string, cookie: `shark_session=${tok}; __Host-shark_session=${tok}; shark_tenant=${T}` };
  };
  const owner = await mk("owner", "OWNER", {});
  const acct = await mk("acct", "STAFF", { "account.settings.manage": true, "account.contact.read": true, "api.key.create": true, "api.key.revoke": true });
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `ACC ${TAG}`)).id as string;
  const crmKey = await keys.createApiKey({ tenantId: T }, "owner crm admin", { scopes: scopes.expandBundles(["crm.admin"]), systemId: S, createdById: owner.id });
  const accKey = await keys.createApiKey({ tenantId: T }, "acc key", { scopes: [], systemId: A, createdById: owner.id });
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const call = async (fn: Any, f: FormData) => { try { return await inScope(acct.cookie, () => fn(f)); } catch (e) { return { thrown: String((e as Any)?.digest ?? (e as Error).message).slice(0, 120) }; } };
  out.rotateCrmKey = await call(ACT.rotateApiKeyAction, fd({ systemId: A, id: crmKey.id }));
  out.revokeCrmKey = await call(ACT.revokeApiKeyAction, fd({ systemId: A, id: crmKey.id }));
  out.crmKeyRevoked = !!(await P.apiKey.findUnique({ where: { id: crmKey.id } }))?.revokedAt;
  out.crmKeysForCreatorAcct = await P.apiKey.count({ where: { tenantId: T, createdById: acct.id } });
  // positive control: the account's own key rotates
  const ctl = (await call(ACT.rotateApiKeyAction, fd({ systemId: A, id: accKey.id }))) as Any;
  out.control_rotateAccountKey = ctl?.ok === true ? "ok" : ctl;
  out.VERDICT = (out.rotateCrmKey as Any)?.ok === false && (out.revokeCrmKey as Any)?.ok === false && out.crmKeyRevoked === false && out.crmKeysForCreatorAcct === 0 && out.control_rotateAccountKey === "ok" ? "GREEN" : "RED";
  for (const k of await P.apiKey.findMany({ where: { tenantId: T }, select: { id: true } })) await P.apiKey.delete({ where: { id: k.id } }).catch(() => undefined);
} catch (e) {
  out.fatal = e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 3).join("\n")}` : String(e);
} finally {
  for (let pass = 0; pass < 3; pass += 1) {
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (const tb of tables) for (const id of TENANTS) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id).catch(() => undefined);
  }
  for (const id of TENANTS) { await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined); await P.tenant.delete({ where: { id } }).catch(() => undefined); }
  for (const id of USERS) { await P.session.deleteMany({ where: { userId: id } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined); await P.user.delete({ where: { id } }).catch(() => undefined); }
  out.cleanup = { tenantsLeft: await P.tenant.count({ where: { id: { in: TENANTS } } }), usersLeft: await P.user.count({ where: { id: { in: USERS } } }) };
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}
