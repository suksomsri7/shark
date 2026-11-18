// scratch probe (not committed): positive control of the lib's underLock (pg_blocking_pids) on the known locks
import { type Any, qc4Env, makeFixtures, cleanupFx, residueOf, vOf, jsonOf, short } from "../../scripts/qc-hr-lib.mjs";
import { underLock } from "../../scripts/qc-hr-h3.4-ytd-lib.mjs";
const { P, coreHash } = await qc4Env("probe3-h34ytd");
const SLUG = `qc-hr-h34y-probe${Date.now()}`;
const fx = makeFixtures(P, coreHash, SLUG);
const FX = jsonOf("scripts/fixtures/hr-h3.4-vectors.json") as Any;
const LK = `qc-ytdp-${Date.now()}`;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const FS = (await import("@/lib/modules/hr/filings/service")) as Any;
try {
  for (const [k, kind, from, j] of [["sso", "SSO", "2031-01-01", "SSO"], ["tax", "TAX_BRACKET", "2031-01-01", "TAX_BRACKET"], ["ded", "DEDUCTION", "2031-01-01", "DEDUCTION"]] as const)
    await P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", $3::date, $4::jsonb, 'ACTIVE'::"HrLawStatus", $1, 'probe', 'QC', now())`, `${LK}-${k}`, kind, from, JSON.stringify(FX.law[j]));
  const TT = await fx.newTenant("", "probe");
  const s = (await sysSvc.createSystem(TT, "HR", "probe hr")).id as string;
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{hrPayroll}', '{"engineVersion":2}'::jsonb) WHERE id = $1`, s);
  const owner = await fx.mkUser(TT, "own", "probe owner", "OWNER", [], {});
  const pay1 = await fx.mkUser(TT, "pay1", "probe pay", "STAFF", ["*"], { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true });
  const e = await fx.mkEmp(TT, s, "probe emp", { startDate: "2030-01-01" });
  await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: e, baseSalarySatang: 3000000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
  const ctx = { tenantId: TT, systemId: s };
  const o1 = await underLock<Any>(P, `hr:payroll:run:${s}:2031-09`, 0, 1, [() => pay.createPayrollRunV2(ctx, vOf(pay1), { periodKey: "2031-09", payDate: new Date("2031-09-25T05:00:00Z") }, { now: new Date("2031-10-02T05:00:00Z"), actor: { userId: pay1.id, isOwner: false } })]);
  console.log("period lock: blocked", o1.blocked, short(o1.res), o1.holderErr);
  const o2 = await underLock<Any>(P, `hr50:${s}:${e}:2031`, 36, 1, [() => FS.issueTaxCertificate(ctx, vOf(owner), { employeeId: e, taxYear: 2031, kind: "ANNUAL" }, { now: new Date("2032-01-05T03:00:00Z") })]);
  console.log("hr50 lock: blocked", o2.blocked, short(o2.res), o2.holderErr);
  const o3 = await underLock<Any>(P, `hr50:${s}:${e}:2031`, 0, 1, [() => FS.issueTaxCertificate(ctx, vOf(owner), { employeeId: e, taxYear: 2031, kind: "ANNUAL" }, { now: new Date("2032-01-05T03:00:00Z") })]);
  console.log("negative control (seed 0): blocked", o3.blocked);
} catch (e) {
  console.log("ERR", e);
} finally {
  const inList = `'${fx.tenants.join("','")}'`;
  for (let i = 0; i < 3; i++) for (const t of ["HrWorkDay", "HrPayrollItem", "HrPayrollRun", "AuditLog"]) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => null);
  await cleanupFx(P, fx, SLUG);
  await P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LK}-%`);
  await residueOf(P, fx, SLUG, SLUG);
  await P.$disconnect();
}
