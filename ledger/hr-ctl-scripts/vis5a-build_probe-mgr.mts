// scratch: which sections does a MANAGER / branch-limited payroll viewer see on base /hr/payroll ?
const S = "/root/projects/shark-hr-l3/scripts/";
const { createRequire } = await import("node:module"); const RQ = createRequire("/root/projects/shark-hr-l3/package.json");
const { errText, qc4Env, makeFixtures, cleanupFx, tagOf } = await import(S + "qc-hr-lib.mjs") as any;
const { installNetGuard, sweepTenants } = await import(S + "qc-hr-h4.3-lib.mjs") as any;
const { installIntlShim, idsIn, LOC } = await import(S + "qc-hr-vis-5a-lib.mjs") as any;
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;
installNetGuard(); installIntlShim();
const { P, coreHash } = await qc4Env("qc-hr-vis-5a-probe");
const sys = await import("@/lib/modules/system/service") as any;
const pageMod = await import("@/app/app/sys/[id]/hr/payroll/page") as any;
const NX = await Promise.all(["app-render/work-async-storage.external.js", "app-render/work-unit-async-storage.external.js", "web/spec-extension/cookies.js"].map((p) => import(RQ.resolve(`next/dist/server/${p}`)))) as any[];
async function inScope(cookie: string, pathname: string, fn: () => Promise<any>) {
  const [nw, nu, nc] = NX; const req = new Request(`http://qc.local${pathname}`, { headers: { cookie } }), jar = new nc.RequestCookies(req.headers);
  const ws = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "render", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nw.workAsyncStorage.run(ws, () => nu.workUnitAsyncStorage.run(unit, fn));
}
const tag = tagOf(String(Date.now())) + "zq";
const SLUG = `qc-hr-vis5a-${Date.now()}${tag}`, fx = makeFixtures(P, coreHash, SLUG);
try {
  const TA = await fx.newTenant("", "QC VIS5A probe");
  const U1 = await fx.newUnit(TA, `P U1 ${tag}`, "u1"), U2 = await fx.newUnit(TA, `P U2 ${tag}`, "u2");
  const HRS = (await sys.createSystem(TA, "HR", `HR ${tag}`)).id;
  for (const u of [U1, U2]) await sys.linkUnit(TA, HRS, u).catch(() => undefined);
  const s0 = (await P.appSystem.findUnique({ where: { id: HRS } }))?.settings ?? {};
  await P.appSystem.update({ where: { id: HRS }, data: { settings: { ...s0, hrPayroll: { engineVersion: 2 } } } });
  const W: any = { owner: await fx.mkUser(TA, "owner", `o ${tag}`, "OWNER", [], {}), payU1: await fx.mkUser(TA, "payu1", `p ${tag}`, "STAFF", [U1], { "hr.payroll.read": true }), mgr: await fx.mkUser(TA, "mgr", `m ${tag}`, "MANAGER", [U1], {}) };
  await fx.mkEmp(TA, HRS, `QCV5 Anna ${tag}`, { code: "V1", startDate: "2025-01-01", position: "B", unitId: U1 });
  const st = await import(RQ.resolve("react-dom/static")) as any;
  const renderToStaticMarkup = async (n: any) => { const { prelude } = await st.prerenderToNodeStream(n); let h = ""; for await (const c of prelude) h += String(c); return h; };
  for (const [k, w] of Object.entries(W) as any) {
    const h = await inScope(`${w.cookie}; NEXT_LOCALE=th`, `/app/sys/${HRS}/hr/payroll`, async () => await renderToStaticMarkup(await pageMod.default({ params: Promise.resolve({ id: HRS }), searchParams: Promise.resolve({}) })));
    const ids = [...idsIn(h).keys()];
    const sec = ["hr-run2", "hr-we-panel", "hr-stock", "hr-bank", "hr-filing", "hr-salarycert", "hr-ytd-card", "hr-salary-ot-rate", "hr-payroll-create"].map((p) => `${p}:${ids.some((i: string) => i === p || i.startsWith(p + "-")) ? "Y" : "-"}`);
    console.log(k, sec.join(" "), "| noAccessNotice:", h.includes("ข้อมูลเงินเดือนจำกัดเฉพาะ") ? "Y" : "-", "| len", h.length);
  }
} catch (e) { console.log("ERR", errText(e), (e as Error)?.stack?.split("\n").slice(0, 4).join(" | ")); }
finally { try { await sweepTenants(P, fx.tenants); } catch (e) { console.log("sweep", errText(e)); } await cleanupFx(P, fx, SLUG); console.log("left", await P.tenant.count({ where: { slug: { startsWith: "qc-hr-vis5a-" } } })); await P.$disconnect?.(); }
process.exit(0);
