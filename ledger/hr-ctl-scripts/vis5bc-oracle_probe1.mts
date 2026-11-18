const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;
const NX = await Promise.all(["app-render/work-async-storage.external.js", "app-render/work-unit-async-storage.external.js", "web/spec-extension/cookies.js"].map((p) => import(`next/dist/server/${p}`).catch((e) => { console.log("imp", p, String(e)); return null; }))) as any[];
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
 const [nw, nu, nc] = NX;
 const req = new Request(`http://qc.local${pathname}`, { headers: { cookie } }), jar = new nc.RequestCookies(req.headers);
 const ws = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
 const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
 return nw.workAsyncStorage.run(ws, () => nu.workUnitAsyncStorage.run(unit, fn));
}
try {
 const m: any = await import("next-intl/server");
 const r = await inScope("LOCALE=en", "/x", async () => { const t = await m.getTranslations("hr.inbox"); return t("title"); });
 console.log("OK", r);
} catch (e) { console.log("ERR", String(e).slice(0, 400)); }
