// scratch (outside repo) — ruling (1): what does a STAFF with hr.leave.* (no pay key) see on /hr/payroll today?
const R = "/root/projects/shark-hr-l5/scripts/";
const L: any = await import(R + "qc-hr-lib.mts");
const H4: any = await import(R + "qc-hr-h4.3-lib.mts");
const Z: any = await import(R + "qc-hr-priv-3-lib.mts");
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;
H4.installNetGuard();
const { P, coreHash } = await L.qc4Env("qc-hr-priv-3", {});
Z.installIntl();
await Z.loadClientSet([...L.srcFiles("src/lib/modules/hr"), ...L.srcFiles("src/components/ui"), "src/components/module-tabs.tsx"]);
const sys: any = await import("@/lib/modules/system/service");
const pay: any = await import("@/app/app/sys/[id]/hr/payroll/page");
const tag = L.tagOf(String(Date.now())) + "scr";
const SLUG = `qc-hr-priv3-${Date.now()}${tag}`, fx = L.makeFixtures(P, coreHash, SLUG);
try {
  const T = await fx.newTenant("", "QC PRIV3 scratch");
  const U1 = await fx.newUnit(T, `QCP3 u1 ${tag}`, "u1");
  const HRS = (await sys.createSystem(T, "HR", `HR ${tag}`)).id;
  await sys.linkUnit(T, HRS, U1).catch(() => undefined);
  await fx.mkEmp(T, HRS, `QCP3 e1 ${tag}`, { code: "P30", startDate: "2024-02-01", unitId: U1 });
  const W: any = {
    SD: await fx.mkUser(T, "sd", `QCP3 SD ${tag}`, "STAFF", ["*"], { "hr.leave.request": true, "hr.leave.read": true, "hr.leave.decide": true }),
    K: await fx.mkUser(T, "k", `QCP3 K ${tag}`, "STAFF", ["*"], { "hr.attendance.clock": true }),
    N: await fx.mkUser(T, "n", `QCP3 N ${tag}`, "STAFF", [], {}),
    S: await fx.mkUser(T, "s", `QCP3 S ${tag}`, "STAFF", ["*"], { "hr.leave.request": true }),
  };
  for (const k of Object.keys(W)) {
    const r = await Z.renderPage(pay, W[k].cookie, `/app/sys/${HRS}/hr/payroll`, { id: HRS });
    const html = r.html.replace(/<nav[\s\S]*?<\/nav>/g, "");
    console.log(`=== ${k} digest=${r.digest} err=${r.err}`);
    console.log(`testids: ${Z.testids(r.html).join(",")}`);
    console.log(`client: ${r.client.map((c: any) => c.name).join(",")}`);
    console.log(`text: ${Z.textOfHtml(html).slice(0, 1500)}`);
  }
} finally {
  await L.cleanupFx(P, fx, SLUG);
  console.log("residue", (await L.residueOf(P, fx, SLUG, "qc-hr-priv3-")).join(",") || "none");
  process.exit(0);
}
