// scratch probe (not committed): does createPayrollRunV2 / approveRun work for a roster-less monthly employee on base?
import { type Any, qc4Env, makeFixtures, cleanupFx, residueOf, vOf, dbDate, jsonOf } from "../../scripts/qc-hr-lib.mjs";
const { P, coreHash } = await qc4Env("probe-h34ytd");
const SLUG = `qc-hr-h34y-probe${Date.now()}`;
const fx = makeFixtures(P, coreHash, SLUG);
const FX = jsonOf("scripts/fixtures/hr-h3.4-vectors.json") as Any;
const LK = `qc-ytdp-${Date.now()}`;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
try {
  for (const [k, kind, from, j] of [["sso", "SSO", "2031-01-01", "SSO"], ["sso2", "SSO", "2031-10-01", "SSO_2572"], ["tax", "TAX_BRACKET", "2031-01-01", "TAX_BRACKET"], ["ded", "DEDUCTION", "2031-01-01", "DEDUCTION"]] as const)
    await P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", $3::date, $4::jsonb, 'ACTIVE'::"HrLawStatus", $1, 'probe', 'QC', now())`, `${LK}-${k}`, kind, from, JSON.stringify(FX.law[j]));
  const TT = await fx.newTenant("", "probe");
  const s = (await sysSvc.createSystem(TT, "HR", "probe hr")).id as string;
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{hrPayroll}', '{"engineVersion":2}'::jsonb) WHERE id = $1`, s);
  const owner = await fx.mkUser(TT, "own", "probe owner", "OWNER", [], {});
  const pay1 = await fx.mkUser(TT, "pay1", "probe pay", "STAFF", ["*"], { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true });
  const e = await fx.mkEmp(TT, s, "probe emp", { startDate: "2030-01-01" });
  await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: e, baseSalarySatang: 3000000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
  const ctx = { tenantId: TT, systemId: s };
  for (const [pk, pd, now] of [["2031-09", "2031-09-25", "2031-10-02"], ["2031-10", "2031-10-25", "2031-11-02"]]) {
    const c = await pay.createPayrollRunV2(ctx, vOf(pay1), { periodKey: pk, payDate: new Date(`${pd}T12:00:00+07:00`) }, { now: new Date(`${now}T05:00:00Z`), actor: { userId: pay1.id, isOwner: false } });
    console.log("create", pk, JSON.stringify(c));
    if (!c.ok) break;
    const it = await P.hrPayrollItem.findFirst({ where: { runId: c.id } });
    console.log(" wht", it?.whtSatang, "sso", it?.ssoEmployeeSatang, "ytd", JSON.stringify(it?.ytdJson));
    const pv = await pay.previewPayrollRunV2(ctx, vOf(owner), { runId: c.id });
    console.log(" review", JSON.stringify(pv.review));
    const a = await pay.approveRun(ctx, c.id, undefined, { userId: owner.id, isOwner: true });
    console.log(" approve", JSON.stringify(a), (await P.hrPayrollRun.findUnique({ where: { id: c.id } }))?.stepsJson);
  }
  const s1 = (await sysSvc.createSystem(TT, "HR", "probe v1")).id as string;
  const e1 = await fx.mkEmp(TT, s1, "probe emp v1", { startDate: "2030-01-01" });
  await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s1, employeeId: e1, baseSalarySatang: 3000000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
  const r1 = await pay.createPayrollRun({ tenantId: TT, systemId: s1 }, { periodKey: "2031-09", payDate: new Date("2031-09-25T05:00:00Z") });
  const i1 = await P.hrPayrollItem.findFirst({ where: { runId: r1.id } });
  console.log("v1 wht", i1?.whtSatang, "sso", i1?.ssoEmployeeSatang);
} catch (e) {
  console.log("ERR", e);
} finally {
  await cleanupFx(P, fx, SLUG);
  await P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LK}-%`);
  await residueOf(P, fx, SLUG, SLUG);
  await P.$disconnect();
}
