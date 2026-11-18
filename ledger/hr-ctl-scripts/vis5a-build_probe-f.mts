// scratch I1: is the reverse control rendered for a branch-limited payroll viewer, and does reverseRunV2Action refuse them? (cwd = tree under test)
const S = "/root/projects/shark-hr-l3/scripts/";
const { createRequire } = await import("node:module"); const RQ = createRequire(process.cwd() + "/package.json");
const { errText, qc4Env, makeFixtures, cleanupFx, tagOf } = await import(S + "qc-hr-lib.mjs") as any;
const { installNetGuard, sweepTenants } = await import(S + "qc-hr-h4.3-lib.mjs") as any;
const { installIntlShim, idsIn } = await import(S + "qc-hr-vis-5a-lib.mjs") as any;
const { v2Item } = await import(S + "qc-hr-h3.8-lib.mjs") as any;
const { AsyncLocalStorage } = await import("node:async_hooks"); (globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;
installNetGuard(); installIntlShim();
const { P, coreHash } = await qc4Env("qc-hr-vis-5a-probe");
const sys = await import("@/lib/modules/system/service") as any;
const pageMod = await import("@/app/app/sys/[id]/hr/payroll/page") as any;
const acts = await import("@/lib/modules/hr/payroll-actions") as any;
const NX = await Promise.all(["app-render/work-async-storage.external.js", "app-render/work-unit-async-storage.external.js", "web/spec-extension/cookies.js"].map((p) => import(RQ.resolve(`next/dist/server/${p}`)))) as any[];
const st = await import(RQ.resolve("react-dom/static")) as any;
const render = async (n: any) => { const { prelude } = await st.prerenderToNodeStream(n); let h = ""; for await (const c of prelude) h += String(c); return h; };
async function inScope(cookie: string, pathname: string, fn: () => Promise<any>) {
  const [nw, nu, nc] = NX; const req = new Request(`http://qc.local${pathname}`, { headers: { cookie } }), jar = new nc.RequestCookies(req.headers);
  const ws = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nw.workAsyncStorage.run(ws, () => nu.workUnitAsyncStorage.run(unit, fn));
}
const tag = tagOf(String(Date.now())) + "zp";
const SLUG = `qc-hr-vis5a-${Date.now()}${tag}`, fx = makeFixtures(P, coreHash, SLUG);
const TREE = (process.env.TSX_TSCONFIG_PATH ?? "").includes("vis5a-base") ? "BASE 09713f430" : "HEAD";
try {
  const TA = await fx.newTenant("", "QC VIS5A I1");
  const U1 = await fx.newUnit(TA, `I1 U1 ${tag}`, "u1"), U2 = await fx.newUnit(TA, `I1 U2 ${tag}`, "u2");
  const HRS = (await sys.createSystem(TA, "HR", `HR ${tag}`)).id;
  for (const u of [U1, U2]) await sys.linkUnit(TA, HRS, u).catch(() => undefined);
  const s0 = (await P.appSystem.findUnique({ where: { id: HRS } }))?.settings ?? {};
  await P.appSystem.update({ where: { id: HRS }, data: { settings: { ...s0, hrPayroll: { engineVersion: 2 } } } });
  const sc = { tenantId: TA, systemId: HRS };
  const full = { "hr.payroll.read": true, "hr.payroll.reverse": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payroll.create": true };
  const V: any = { pbRead: await fx.mkUser(TA, "pbr", `pbr ${tag}`, "STAFF", [U1], { "hr.payroll.read": true }), pbKeys: await fx.mkUser(TA, "pbk", `pbk ${tag}`, "STAFF", [U1], full), allKeysStaff: await fx.mkUser(TA, "pak", `pak ${tag}`, "STAFF", ["*"], full) };
  const E: string[] = [];
  for (const [i, u] of [U1, U1, U2].entries()) { const id = await fx.mkEmp(TA, HRS, `I1 E${i} ${tag}`, { code: `I${i}`, startDate: "2025-01-01", position: "B", unitId: u }); await P.hrSalaryProfile.create({ data: { ...sc, employeeId: id, payType: "MONTHLY", baseSalarySatang: 2_000_000, ssoEligible: true } }); E.push(id); }
  const pk = "2026-09";
  const run = await P.hrPayrollRun.create({ data: { ...sc, periodKey: pk, payDate: new Date(`${pk}-28T12:00:00+07:00`), status: "PAID", engineVersion: 2, stepsJson: { finalized: true }, totalGrossSatang: 6_000_000, totalSsoEmployeeSatang: 225_000, totalSsoEmployerSatang: 225_000, totalWhtSatang: 0, totalNetSatang: 5_775_000, totalAddSatang: 0 } });
  for (const e of E) await P.hrPayrollItem.create({ data: { ...sc, runId: run.id, employeeId: e, ...v2Item([{ code: "BASE", ref: "profile", day: null, minutes: null, amountSatang: 2_000_000 }], { ssoBase: 1_500_000, ee: 75_000, wht: 0, whtIncome: 2_000_000 }) } });
  const mk = async (pk2: string, status: string, v: number) => { const r = await P.hrPayrollRun.create({ data: { ...sc, periodKey: pk2, payDate: new Date(`${pk2}-28T12:00:00+07:00`), status, engineVersion: v, totalGrossSatang: 6_000_000, totalSsoEmployeeSatang: 225_000, totalSsoEmployerSatang: 225_000, totalWhtSatang: 0, totalNetSatang: 5_775_000, totalAddSatang: 0 } }); for (const e of E) await P.hrPayrollItem.create({ data: { ...sc, runId: r.id, employeeId: e, ...v2Item([{ code: "BASE", ref: "profile", day: null, minutes: null, amountSatang: 2_000_000 }], { ssoBase: 1_500_000, ee: 75_000, wht: 0, whtIncome: 2_000_000 }) } }); return r; };
  await mk("2026-06", "DRAFT", 2); await mk("2026-07", "REVERSED", 2); await mk("2026-05", "PAID", 1);
  const W2: any = { owner: await fx.mkUser(TA, "own", `own ${tag}`, "OWNER", [], {}), mAll: await fx.mkUser(TA, "mall", `mall ${tag}`, "MANAGER", ["*"], {}), mU1: await fx.mkUser(TA, "mu1", `mu1 ${tag}`, "MANAGER", [U1], {}) };
  const { textOfHtml } = await import(S + "qc-hr-vis-5a-lib.mjs") as any;
  const path = `/app/sys/${HRS}/hr/payroll`;
  for (const [k, w, q] of [["owner", W2.owner, "2026-07"], ["owner", W2.owner, "2026-05"], ["owner", W2.owner, "2026-09"], ["mAll", W2.mAll, "2026-06"], ["mU1", W2.mU1, "2026-06"]] as any) {
    const h = await inScope(`${w.cookie}; NEXT_LOCALE=th`, path, async () => render(await pageMod.default({ params: Promise.resolve({ id: HRS }), searchParams: Promise.resolve({ period: q }) })));
    const ids = [...idsIn(h).keys()].filter((i: string) => i.startsWith("hr-run2") && !i.startsWith("hr-run2-row") && !i.startsWith("hr-run2-lines"));
    const m = /data-testid="hr-run2-banner"[^>]*>([\s\S]{0,400})/.exec(h);
    console.log(`F ${k} ${q}: ids=${ids.join(",")} | banner=${m ? textOfHtml(m[1]).slice(0, 140) : "-"} | rowsStatus=${(textOfHtml(h).match(/ต้องตรวจ|พร้อม|จ่ายแล้ว|กลับรายการแล้ว/g) ?? []).slice(0, 6).join("/")} | createBlock=${/สร้างรอบจ่ายใหม่ของงวด/.test(textOfHtml(h))} | empty=${/ยังไม่มีรอบจ่ายของงวด/.test(textOfHtml(h))}`);
  }
} catch (e) { console.log("ERR", errText(e), (e as Error)?.stack?.split("\n").slice(0, 4).join(" | ")); }
finally { try { await sweepTenants(P, fx.tenants); } catch (e) { console.log("sweep", errText(e)); } await cleanupFx(P, fx, SLUG); console.log("left", await P.tenant.count({ where: { slug: { startsWith: "qc-hr-vis5a-" } } })); await P.$disconnect?.(); }
process.exit(0);
