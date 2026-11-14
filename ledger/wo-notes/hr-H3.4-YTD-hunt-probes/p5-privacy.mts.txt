// probe 5 — privacy matrix executed: viewers × {list, save, bulk, clear, zero} + own row + unknown/foreign id bytes + side readers (slip history · tax-year · mySlips) + audits
import { setup, short, T, OPEN } from "./common.mjs";
const X = await setup("hunt-h34y-p5");
const { sys, emp, save, create, approve, V, U, OPM, REP, PS, c, safe, P, TT, T2, u2 } = X;
const log = (k: string, v: unknown) => console.log(`${k}: ${short(v, 400)}`);
const now = { now: T("2031-09-10T05:00:00Z") };
try {
  const A = await sys("A");
  const eU1 = await emp(A, "A01");
  const eU2 = await emp(A, "A02", { unit: u2 });
  const eC = await emp(A, "A03", { pay: false });
  const eSelf = await emp(A, "A04", { link: U.self.id });
  const eGO = await emp(A, "A05", { pay: false, link: U.gateOwn.id });
  const B = await sys("B"); const eOtherSys = await emp(B, "B01", { pay: false });
  const XS = await sys("X", true, T2); const eX = await emp(XS, "X01", { pay: false, tid: T2 });
  for (const e of [eU1, eU2, eC, eSelf]) await save(A, V.owner, e, {}, now.now);
  const r = await create(A, "2031-09"); await approve(A, r?.id);
  const VIEW = ["other", "self", "mgr", "readU", "gateU", "gateOwn", "gate", "owner"] as const;
  const bytes = new Map<string, Set<string>>();
  const cell = (op: string, who: string, res: any) => {
    const ok = res?.ok === true;
    const s = ok ? `OK${res?.rows ? `(${res.rows.length} rows)` : res?.rev ? `(rev${res.rev})` : ""}` : `${res?.code}`;
    if (!ok) { const b = JSON.stringify(res); (bytes.get(res?.code) ?? bytes.set(res?.code, new Set()).get(res?.code))!.add(b); }
    return s;
  };
  const M: Record<string, Record<string, string>> = {};
  for (const w of VIEW) {
    const v = V[w];
    M[w] = {
      list: cell("list", w, await safe(() => OPM.listOpeningYtd(c(A), v, { taxYear: 2031 }, now))),
      save: cell("save", w, await save(A, v, eU1, { incomeSatang: 24_000_000 + VIEW.indexOf(w) }, now.now, (await X.liveOf(eU1))[0]?.rev ?? null)),
      bulk: cell("bulk", w, await safe(async () => OPM.saveOpeningYtdBulk(c(A), v, { taxYear: 2031, rows: [{ employeeId: eU2, taxYear: 2031, ...OPEN, expectRev: (await X.liveOf(eU2))[0]?.rev ?? null }] }, now))),
      clear: cell("clear", w, await safe(async () => OPM.clearOpeningYtd(c(A), v, { employeeId: eC, taxYear: 2031, expectRev: (await X.liveOf(eC))[0]?.rev ?? 1 }, now))),
      zero: cell("zero", w, await save(A, v, eU2, { asOfDay: "2031-01-01", months: 0, incomeSatang: 0, whtSatang: 0, ssoSatang: 0 }, now.now, (await X.liveOf(eU2))[0]?.rev ?? null)),
      ownRow: cell("own", w, await save(A, v, w === "self" ? eSelf : eGO, {}, now.now, (await X.liveOf(w === "self" ? eSelf : eGO))[0]?.rev ?? null)),
      unknownId: cell("unk", w, await save(A, v, "zzzzzzzzzzzzzzzzzzzz")),
      otherSysId: cell("osys", w, await save(A, v, eOtherSys)),
      otherTenantId: cell("oten", w, await save(A, v, eX)),
      roleClaim: cell("claim", w, await safe(() => OPM.listOpeningYtd(c(A), { ...v, role: "OWNER" }, { taxYear: 2031 }, now))),
    };
  }
  console.table(M);
  log("distinct refusal bytes per code", Object.fromEntries([...bytes].map(([k, s]) => [k, s.size])));
  log("NO bytes", [...(bytes.get("NO") ?? [])]);
  // own-row in bulk / clear for gateOwn
  log("gateOwn bulk incl own", await safe(() => OPM.saveOpeningYtdBulk(c(A), V.gateOwn, { taxYear: 2031, rows: [{ employeeId: eGO, ...OPEN, expectRev: null }] }, now)));
  // side readers of opening amounts
  const hist = async (w: string, e: string) => { const h = await safe(() => PS.slipHistory(c(A), V[w as keyof typeof V], { employeeId: e, taxYear: 2031 })); return h?.ok ? `OK opening=${h?.year?.opening ? h.year.opening.incomeSatang : "∅"}` : `${h?.code ?? h?.reason}`; };
  log("slipHistory eU1 (u1)", Object.fromEntries(await Promise.all(VIEW.map(async (w) => [w, await hist(w, eU1)]))));
  log("slipHistory eU2 (u2)", Object.fromEntries(await Promise.all(VIEW.map(async (w) => [w, await hist(w, eU2)]))));
  const ty = async (w: string) => { const t = await safe(() => REP.loadReport(c(A), V[w as keyof typeof V], { report: "tax-year", period: "2031" })); return t?.rows ? (t.rows as any[]).map((x) => `${x.values?.code}:${x.values?.income}`).join(",") : `${t?.code}`; };
  log("tax-year report", Object.fromEntries(await Promise.all(VIEW.map(async (w) => [w, await ty(w)]))));
  const my = await safe(() => PS.mySlips({ tenantId: TT, userId: U.self.id, role: "STAFF", unitAccess: [], permissions: {} }));
  log("mySlips self", { ok: my?.ok, opening: my?.years?.find((y: any) => y.taxYear === 2031)?.opening });
  const aud = (await P.auditLog.findMany({ where: { tenantId: TT, action: { startsWith: "hr.payroll.opening" } } })) as any[];
  log("audit keys", [...new Set(aud.map((a) => `${a.action}:${Object.keys(a.after ?? {}).sort().join("+")}`))]);
  log("audit has amount", aud.some((a) => /24000|136664|700000|Satang/.test(JSON.stringify(a.after ?? {}) + JSON.stringify(a.before ?? {}))));
} catch (err) {
  console.log("ERR", err);
} finally {
  await X.cleanup();
}
