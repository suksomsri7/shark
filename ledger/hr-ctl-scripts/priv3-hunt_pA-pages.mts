// PRIV-3 hunt — probe A: every HR page / layout / route handler / API op × viewer; refusal bytes vs unknown system / unknown employee
// Run: (cwd lane 5) bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx /tmp/hr-ctl/priv3-hunt/pA-pages.mts
import { writeFileSync } from "node:fs";
import { qc4Env, cleanupFx, residueOf, errText, canon, srcFiles } from "/root/projects/shark-hr-l5/scripts/qc-hr-lib.mjs";
import { installNetGuard, NET, sweepTenants, sweepResidue } from "/root/projects/shark-hr-l5/scripts/qc-hr-h4.3-lib.mjs";
import { installIntl, loadClientSet, renderPage, renderEl, inScope, h, textOfHtml, type Rendered } from "/root/projects/shark-hr-l5/scripts/qc-hr-priv-3-lib.mjs";
import { buildFx, tag, unk, PFX, SLUG, D0, MONTH, PREV, NAMEPFX, type Any } from "./fx.mts";

const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
installNetGuard();
process.on("unhandledRejection", () => undefined);
const { P, coreHash } = await qc4Env("h52p-priv3-A");
installIntl();
const imp = async (s: string) => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
console.log(`client comps: ${await loadClientSet([...srcFiles("src/lib/modules/hr"), ...srcFiles("src/components/ui"), "src/components/module-tabs.tsx", "src/app/app/approvals/BulkApprovals.tsx"])}`);
const PG = "@/app/app/sys/[id]/hr/";
const M: Record<string, Any> = {
  sys: await imp("@/lib/modules/system/service"), svc: await imp("@/lib/modules/hr/service"), AK: await imp("@/lib/api-keys/service"),
  hub: await imp("@/app/app/sys/[id]/page"), att: await imp(`${PG}attendance/page`), roster: await imp(`${PG}roster/page`), kiosk: await imp(`${PG}kiosk/page`), req: await imp(`${PG}requests/page`),
  rep: await imp(`${PG}reports/page`), set: await imp(`${PG}settings/page`), law: await imp(`${PG}settings/law/page`), emp: await imp(`${PG}employees/page`), prof: await imp(`${PG}employees/[employeeId]/page`),
  leave: await imp(`${PG}leave/page`), pay: await imp(`${PG}payroll/page`), slip: await imp("@/app/app/sys/[id]/payroll/[runId]/slip/[employeeId]/page"),
  meL: await imp("@/app/app/me/hr/layout"), me: await imp("@/app/app/me/hr/page"), meWeek: await imp("@/app/app/me/hr/week/page"), mePay: await imp("@/app/app/me/hr/pay/page"), mePayRun: await imp("@/app/app/me/hr/pay/[runId]/page"),
  meProf: await imp("@/app/app/me/hr/profile/page"), meReq: await imp("@/app/app/me/hr/requests/page"), appr: await imp("@/app/app/approvals/page"), appL: await imp("@/app/app/layout"),
  exp: await imp(`${PG}reports/export/route`), bank: await imp(`${PG}payroll/bank-file/[fileId]/route`), fil: await imp(`${PG}payroll/filing/[fileId]/route`), cert: await imp(`${PG}payroll/salary-cert/[certId]/route`), tax: await imp(`${PG}payroll/tax-cert/[certId]/route`),
  mePdf: await imp("@/app/app/me/hr/pay/[runId]/pdf/route"), meCert: await imp("@/app/app/me/hr/salary-cert/[certId]/route"), meTax: await imp("@/app/app/me/hr/tax-cert/[certId]/route"), api: await imp("@/app/api/v1/hr/[...path]/route"),
};
const bad = Object.entries(M).filter(([, m]) => m?.__err).map(([k, m]) => `${k}:${m.__err}`);
if (bad.length) console.log(`import problems: ${bad.join(" | ")}`);
const REAL = { ...console };
const mute = () => Object.assign(console, { log: () => {}, info: () => {}, warn: () => {}, error: () => {} });
const unmute = () => Object.assign(console, REAL);

const OUT: Record<string, Any> = { rows: [] as Any[] };
let X: Any = null;
try {
  X = await buildFx(P, coreHash, M);
  const { W, E, HRS, HRS2, HRX, runId, doc } = X;
  console.log(`fixture ok svcLeave=${String(X.svcLeave).slice(0, 60)} swap=${String(X.swap).slice(0, 40)}`);
  const UNK = unk();
  const VK = Object.keys(W);
  // what a viewer may legitimately see of names: own linked employee
  const OWN: Record<string, string[]> = { S: ["e1"], S0: ["e7"], K: ["eK"], X2: ["x2e"] };
  const names = Object.entries(E as Record<string, Any>);
  const seen = (s: string, vk: string) => names.filter(([k, e]) => !(OWN[vk] ?? []).includes(k) && (s.includes(e.name) || s.includes(e.id))).map(([k]) => k);
  const kind = (r: Rendered) => (r.digest ? (r.digest.startsWith("NEXT_REDIRECT") ? `redirect:${r.digest.split(";")[2] ?? "?"}` : r.digest.split(";").slice(0, 2).join(";")) : r.err ? `err:${r.err.slice(0, 60)}` : "ok");
  const norm = (s: string) => s.replace(new RegExp(HRS, "g"), "<SYS>").replace(new RegExp(UNK, "g"), "<SYS>");
  type Rt = { n: string; mod: Any; path: (sys: string) => string; params: (sys: string) => Record<string, string>; sp?: Record<string, string>; layoutChild?: boolean };
  const sysP = (sys: string) => ({ id: sys });
  const ROUTES: Rt[] = [
    { n: "hub", mod: M.hub, path: (s) => `/app/sys/${s}`, params: sysP },
    { n: "attendance", mod: M.att, path: (s) => `/app/sys/${s}/hr/attendance`, params: sysP },
    { n: "attendance?month&employee=e2", mod: M.att, path: (s) => `/app/sys/${s}/hr/attendance`, params: sysP, sp: { view: "month", employee: "" } },
    { n: "attendance?corrections", mod: M.att, path: (s) => `/app/sys/${s}/hr/attendance`, params: sysP, sp: { view: "corrections" } },
    { n: "roster", mod: M.roster, path: (s) => `/app/sys/${s}/hr/roster`, params: sysP },
    { n: "kiosk", mod: M.kiosk, path: (s) => `/app/sys/${s}/hr/kiosk`, params: sysP },
    { n: "requests", mod: M.req, path: (s) => `/app/sys/${s}/hr/requests`, params: sysP },
    { n: "reports", mod: M.rep, path: (s) => `/app/sys/${s}/hr/reports`, params: sysP },
    { n: "reports?leave", mod: M.rep, path: (s) => `/app/sys/${s}/hr/reports`, params: sysP, sp: { report: "leave", period: D0.slice(0, 4) } },
    { n: "settings", mod: M.set, path: (s) => `/app/sys/${s}/hr/settings`, params: sysP },
    { n: "law", mod: M.law, path: (s) => `/app/sys/${s}/hr/settings/law`, params: sysP },
    { n: "employees", mod: M.emp, path: (s) => `/app/sys/${s}/hr/employees`, params: sysP },
    { n: "employees/[e2]", mod: M.prof, path: (s) => `/app/sys/${s}/hr/employees/x`, params: (s) => ({ id: s, employeeId: E.e2.id }) },
    { n: "employees/[e5 ended]", mod: M.prof, path: (s) => `/app/sys/${s}/hr/employees/x`, params: (s) => ({ id: s, employeeId: E.e5.id }) },
    { n: "employees/[x2o other sys]", mod: M.prof, path: (s) => `/app/sys/${s}/hr/employees/x`, params: (s) => ({ id: s, employeeId: E.x2o.id }) },
    { n: "employees/[unknown]", mod: M.prof, path: (s) => `/app/sys/${s}/hr/employees/x`, params: (s) => ({ id: s, employeeId: UNK }) },
    { n: "leave", mod: M.leave, path: (s) => `/app/sys/${s}/hr/leave`, params: sysP },
    { n: "payroll", mod: M.pay, path: (s) => `/app/sys/${s}/hr/payroll`, params: sysP },
    { n: "slip[e2]", mod: M.slip, path: (s) => `/app/sys/${s}/payroll/r/slip/e`, params: (s) => ({ id: s, runId, employeeId: E.e2.id }) },
    { n: "slip[unknown]", mod: M.slip, path: (s) => `/app/sys/${s}/payroll/r/slip/e`, params: (s) => ({ id: s, runId, employeeId: UNK }) },
  ];
  // other-HR-system variant: same pages on HRS2 for X2 vs everyone (cross-system)
  const ME: [string, Any, Record<string, string>][] = [["me", M.me, {}], ["me/week", M.meWeek, {}], ["me/pay", M.mePay, {}], ["me/pay/[run]", M.mePayRun, { runId }], ["me/profile", M.meProf, {}], ["me/requests", M.meReq, {}], ["approvals", M.appr, {}]];
  const unknownCache = new Map<string, string>();
  for (const vk of VK) {
    const w = W[vk];
    for (const rt of ROUTES) {
      const sp = { ...(rt.sp ?? {}) };
      if ("employee" in sp) sp.employee = E.e2.id;
      mute();
      let r: Rendered, ru: Rendered;
      try {
        r = await renderPage(rt.mod, w.cookie, rt.path(HRS), rt.params(HRS), sp);
        const uk = `${vk}|${rt.n}`;
        ru = await renderPage(rt.mod, w.cookie, rt.path(UNK), rt.params(UNK), sp);
        unknownCache.set(uk, kind(ru));
      } finally { unmute(); }
      const txt = r.html + "\u0001" + r.clientText;
      const row: Any = { route: rt.n, v: vk, kind: kind(r), unknownSys: kind(ru!), len: r.html.length, seen: seen(txt, vk), sameAsUnknown: kind(r) === kind(ru!) && norm(r.html) === norm(ru!.html) && r.client.length === ru!.client.length };
      // cross-system: X2 / everyone on HRS2
      if (["employees", "leave", "payroll", "hub", "attendance", "requests", "reports"].includes(rt.n)) {
        mute();
        try { const r2 = await renderPage(rt.mod, w.cookie, rt.path(HRS2), rt.params(HRS2), sp); row.sys2 = kind(r2); row.sys2seen = seen(r2.html + r2.clientText, vk); } finally { unmute(); }
      }
      if (row.kind === "ok" && row.seen.length === 0) row.text = textOfHtml(r.html).slice(0, 160);
      OUT.rows.push(row);
    }
    for (const [n, mod, params] of ME) {
      mute();
      let r: Rendered;
      try {
        r = await renderPage(mod, w.cookie, n === "approvals" ? "/app/approvals" : `/app/${n}`, params); // page only (SelfShell/sidebar need the client router pathname)
      } finally { unmute(); }
      OUT.rows.push({ route: n, v: vk, kind: kind(r!), len: r!.html.length, seen: seen(r!.html + r!.clientText, vk), text: textOfHtml(r!.html).slice(0, 120) });
    }
    // app layout (sidebar) — HR items and any name/count
    mute();
    try { const r = await renderEl(w.cookie, `/app/sys/${HRS}`, () => M.appL.default({ children: null })); OUT.rows.push({ route: "app-layout(sidebar)", v: vk, kind: kind(r), seen: seen(r.html + r.clientText, vk), hrLinks: [...new Set([...(r.html + r.clientText).matchAll(/\/hr\/[a-z/]+/g)].map((m) => m[0]))].sort().join(",") }); } finally { unmute(); }
  }
  // ── route handlers (status + bytes vs unknown system / unknown file) ──
  const call = async (vk: string, mod: Any, url: string, params: Record<string, string>) => {
    mute();
    try {
      return await inScope(`${W[vk].cookie}; LOCALE=th`, new URL(url).pathname, async () => {
        const res: Response = await mod.GET(new Request(url, { headers: { cookie: W[vk].cookie } }), { params: Promise.resolve(params) });
        const b = Buffer.from(await res.arrayBuffer());
        return { status: res.status, ct: res.headers.get("content-type") ?? "", loc: res.headers.get("location") ?? "", body: b.toString("utf8").slice(0, 300), len: b.length };
      });
    } catch (e) { return { status: -1, err: errText(e).slice(0, 120), digest: String((e as Any)?.digest ?? "") }; } finally { unmute(); }
  };
  const RH: [string, Any, (s: string) => string, (s: string) => Record<string, string>][] = [
    ["export(time)", M.exp, (s) => `http://qc.local/app/sys/${s}/hr/reports/export?report=time&period=${MONTH}&format=CSV`, (s) => ({ id: s })],
    ["export(payroll-month)", M.exp, (s) => `http://qc.local/app/sys/${s}/hr/reports/export?report=payroll-month&period=${PREV}&format=CSV`, (s) => ({ id: s })],
    ["bank-file", M.bank, (s) => `http://qc.local/app/sys/${s}/hr/payroll/bank-file/f1`, (s) => ({ id: s, fileId: UNK })],
    ["filing", M.fil, (s) => `http://qc.local/app/sys/${s}/hr/payroll/filing/f1`, (s) => ({ id: s, fileId: UNK })],
    ["salary-cert", M.cert, (s) => `http://qc.local/app/sys/${s}/hr/payroll/salary-cert/c1`, (s) => ({ id: s, certId: UNK })],
    ["tax-cert", M.tax, (s) => `http://qc.local/app/sys/${s}/hr/payroll/tax-cert/c1`, (s) => ({ id: s, certId: UNK })],
    ["me/pay/pdf", M.mePdf, () => `http://qc.local/app/me/hr/pay/${runId}/pdf`, () => ({ runId })],
    ["me/salary-cert", M.meCert, () => `http://qc.local/app/me/hr/salary-cert/c1`, () => ({ certId: UNK })],
    ["me/tax-cert", M.meTax, () => `http://qc.local/app/me/hr/tax-cert/c1`, () => ({ certId: UNK })],
  ];
  OUT.handlers = [];
  for (const vk of VK) for (const [n, mod, url, params] of RH) {
    const a = await call(vk, mod, url(HRS), params(HRS));
    const b = await call(vk, mod, url(UNK), params(UNK));
    const strip = (x: Any) => canon({ ...x, body: String(x.body ?? "").replace(/req_[a-f0-9]+/g, "") });
    OUT.handlers.push({ h: n, v: vk, real: `${a.status} ${a.ct} ${a.len ?? ""}`, unknown: `${b.status} ${b.ct} ${b.len ?? ""}`, same: strip({ ...a, body: String(a.body).replace(new RegExp(HRS, "g"), "S") }) === strip({ ...b, body: String(b.body).replace(new RegExp(UNK, "g"), "S") }), seen: seen(String(a.body ?? ""), vk), body: a.status === 200 ? String(a.body).slice(0, 120) : "" });
  }
  // ── API: keys without rights ──
  const key = async (label: string, scopes: string[], sys: string | null = HRS) => { try { const k = await M.AK.createApiKey({ tenantId: X.T }, `H5 ${label} ${tag}`, { scopes, systemId: sys ?? undefined, createdById: W.O.id }); return k.rawKey as string; } catch (e) { return `ERR ${errText(e).slice(0, 60)}`; } };
  const K = { reqOnly: await key("req", ["hr.leave.request"]), pos: await key("pos", ["pos.sale.read"], null), sys2: await key("sys2", ["hr.employee.read"], HRS2) };
  const api = async (raw: string, path: string) => {
    mute();
    try { const res: Response = await M.api.GET(new Request(`http://x/api/v1/hr${path}`, { headers: { authorization: `Bearer ${raw}` } }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) }); const t = await res.text(); return `${res.status} ${t.replace(/req_[a-f0-9]+/g, "")}`; } catch (e) { return `THROW ${errText(e)}`; } finally { unmute(); }
  };
  OUT.api = {};
  for (const [kn, raw] of Object.entries(K)) {
    if (raw.startsWith("ERR")) { OUT.api[kn] = raw; continue; }
    const real = await api(raw, `/employees/${E.e2.id}`), un = await api(raw, `/employees/${UNK}`), list = await api(raw, `/employees`), lv = await api(raw, `/leaves?status=PENDING`), other = await api(raw, `/employees/${E.x2o.id}`);
    OUT.api[kn] = { realVsUnknownSame: real === un, real: real.slice(0, 200), list: list.slice(0, 200), leaves: lv.slice(0, 160), otherSys: other.slice(0, 160), seenList: seen(list, "-") };
  }
} catch (e) {
  unmute();
  console.log(`🔴 ${errText(e)} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  unmute();
  writeFileSync("/tmp/hr-ctl/priv3-hunt/out-A.json", JSON.stringify(OUT, null, 1));
  if (X?.fx) {
    await sweepTenants(P, X.fx.tenants).catch(() => undefined);
    await cleanupFx(P, X.fx, SLUG);
    await P.apiKey?.deleteMany?.({ where: { tenantId: { in: X.fx.tenants } } }).catch(() => undefined);
    const r1 = await sweepResidue(P, X.fx.tenants);
    await residueOf(P, X.fx, SLUG, PFX);
    console.log(`RESIDUE sweep=${r1.join(",") || "none"} tenants(${PFX}*)=${await P.tenant.count({ where: { slug: { startsWith: PFX } } })} OUTBOUND=${NET.attempts.length} ${NET.attempts.join(",")}`);
  }
  process.exit(0);
}
