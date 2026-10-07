// C5.5-fix8 probe context (copy of the probe-cf8-actions technique) — QC3 ONLY (ep-weathered-river) · throwaway tenants `qc-cf11-*`
//   swept in done() · network blocked (fetch) · server actions run under a forged Next request scope with a real session cookie.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

export async function ctx(label: string) {
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
  const TAG = `qc-cf11-${label}-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
  const res: { id: string; ok: boolean }[] = [];
  const chk = (id: string, ok: boolean, msg: string) => {
    res.push({ id, ok });
    console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
  };
  const j = (v: unknown) => JSON.stringify(v, (_k, x) => (x instanceof Date ? x.toISOString() : x));
  const cut = (v: unknown, n = 120) => {
    const s = String(v ?? "").replace(/\s+/g, " ");
    return s.length > n ? `${s.slice(0, n)}…` : s;
  };
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
  const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
  const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
  const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
  async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
    const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf11", "x-forwarded-for": "203.0.113.189" } });
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
    try {
      return { ok: true, v: await f() };
    } catch (err) {
      return { ok: false, err };
    }
  };
  const errText = (r: { ok: boolean; v?: Any; err?: Any }) => (r.ok ? j(r.v) : `threw ${cut((r.err as Error)?.message ?? r.err, 100)}`);
  const sub = async (id: string, fn: () => Promise<void>) => {
    console.log(`\n── ${id} ──`);
    try {
      await fn();
    } catch (e) {
      chk(`${id}-CRASH`, false, String((e as Error)?.stack ?? e).slice(0, 900));
    }
  };
  const done = async (name: string) => {
    for (const T of TENANTS) {
      const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
        .map((r) => String(r.table_name))
        .filter((x) => /^[A-Za-z_]+$/.test(x));
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
    const passed = res.filter((r) => r.ok).length;
    console.log(`\n${passed === res.length ? "🟢" : "🔴"} ${name}: ${passed}/${res.length}`);
    console.log(`JSON_SUMMARY ${JSON.stringify({ total: res.length, passed, findings: res.filter((r) => !r.ok).map((r) => r.id) })}`);
    process.exit(passed === res.length ? 0 : 1);
  };
  return { P, prisma, TAG, chk, j, cut, sysSvc, setCrm, mkUser, member, mkTenant, inScope, sessionCookie, fdx, call, errText, sub, done };
}
