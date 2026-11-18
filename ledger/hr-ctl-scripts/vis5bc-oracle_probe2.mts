const R = "/root/projects/shark-hr";
const L: any = await import(`${R}/scripts/qc-hr-vis-5-lib.mts`);
const Q: any = await import(`${R}/scripts/qc-hr-lib.mts`);
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;
L.installIntl();
const { P, coreHash } = await Q.qc4Env("probe-vis5");
const NX = await Promise.all(["app-render/work-async-storage.external.js", "app-render/work-unit-async-storage.external.js", "web/spec-extension/cookies.js"].map((p) => import(`${R}/node_modules/next/dist/server/${p}`))) as any[];
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
 const [nw, nu, nc] = NX;
 const req = new Request(`http://qc.local${pathname}`, { headers: { cookie } }), jar = new nc.RequestCookies(req.headers);
 const ws = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
 const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
 return nw.workAsyncStorage.run(ws, () => nu.workUnitAsyncStorage.run(unit, fn));
}
console.log("client set", await L.loadClientSet());
const SLUG = `qc-vis5probe-${Date.now()}`, fx = Q.makeFixtures(P, coreHash, SLUG);
try {
 const T = await fx.newTenant("", "probe");
 const sys: any = await import(`${R}/src/lib/modules/system/service.ts`);
 const HRS = (await sys.createSystem(T, "HR", "HR probe")).id;
 const w = await fx.mkUser(T, "own", "probe owner", "OWNER", [], {});
 const pg: any = await import(`${R}/src/app/app/sys/[id]/page.tsx`);
 const r = await inScope(w.cookie, `/app/sys/${HRS}`, async () => L.renderTree(await pg.default({ params: Promise.resolve({ id: HRS }), searchParams: Promise.resolve({}) }), "th"));
 console.log("err", r.err, "len", r.html.length, "client", r.client.map((c: any) => c.name).join(","));
 console.log(r.html.slice(0, 3000));
 console.log("missing", L.CUR.missing.slice(0, 5));
} catch (e) { console.log("ERR", e); }
finally { const H4: any = await import(`${R}/scripts/qc-hr-h4.3-lib.mts`); await H4.sweepTenants(P, fx.tenants); await Q.cleanupFx(P, fx, SLUG); console.log(await Q.residueOf(P, fx, SLUG, "qc-vis5probe-")); await P.$disconnect(); }
