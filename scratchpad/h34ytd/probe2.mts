// scratch probe (not committed): base calls used by group B / S3.14 work without openings
import { type Any, qc4Env, makeFixtures, cleanupFx, residueOf, vOf, jsonOf, canon, short } from "../../scripts/qc-hr-lib.mjs";
const { P, coreHash } = await qc4Env("probe2-h34ytd");
const SLUG = `qc-hr-h34y-probe${Date.now()}`;
const fx = makeFixtures(P, coreHash, SLUG);
const FX = jsonOf("scripts/fixtures/hr-h3.4-vectors.json") as Any;
const LK = `qc-ytdp-${Date.now()}`;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const FS = (await import("@/lib/modules/hr/filings/service")) as Any;
const REP = (await import("@/lib/modules/hr/reports")) as Any;
try {
  for (const [k, kind, from, j] of [["sso", "SSO", "2031-01-01", "SSO"], ["sso2", "SSO", "2031-10-01", "SSO_2572"], ["tax", "TAX_BRACKET", "2031-01-01", "TAX_BRACKET"], ["ded", "DEDUCTION", "2031-01-01", "DEDUCTION"]] as const)
    await P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", $3::date, $4::jsonb, 'ACTIVE'::"HrLawStatus", $1, 'probe', 'QC', now())`, `${LK}-${k}`, kind, from, JSON.stringify(FX.law[j]));
  const TT = await fx.newTenant("", "probe");
  const s = (await sysSvc.createSystem(TT, "HR", "probe hr")).id as string;
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{hrPayroll}', '{"engineVersion":2}'::jsonb) WHERE id = $1`, s);
  const owner = await fx.mkUser(TT, "own", "probe owner", "OWNER", [], {});
  const pay1 = await fx.mkUser(TT, "pay1", "probe pay", "STAFF", ["*"], { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true });
  const e = await fx.mkEmp(TT, s, "probe emp", { startDate: "2030-01-01", code: "B01" });
  await P.hrEmployee.update({ where: { id: e }, data: { nationalId: "1102000123454", subdistrict: "ทุ่งพญาไท", district: "ราชเทวี", province: "กรุงเทพมหานคร", postcode: "10400" } });
  await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: e, baseSalarySatang: 3000000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
  const ctx = { tenantId: TT, systemId: s };
  const ids: string[] = [];
  for (const [pk, pd, now] of [["2031-09", "2031-09-25", "2031-10-02"], ["2031-10", "2031-10-25", "2031-11-02"]]) {
    const c = await pay.createPayrollRunV2(ctx, vOf(pay1), { periodKey: pk, payDate: new Date(`${pd}T05:00:00Z`) }, { now: new Date(`${now}T05:00:00Z`), actor: { userId: pay1.id, isOwner: false } });
    ids.push(c.id);
    console.log("approve", (await pay.approveRun(ctx, c.id, undefined, { userId: owner.id, isOwner: true }))?.ok);
  }
  const PROFILE = { taxId: "0105555000013", branchNo: "000000", employerName: "บริษัท คิวซี ยอดยกมา จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400", deptName: "สำนักงานใหญ่", lto: false, branchType: "", rdUserId: "QCREF00000000000034", rdFormFlag: 1, ssoAccountNo: "9876543210", ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: "นายผู้ลงนาม ทดสอบ", certPrefix: "HR50" };
  console.log("profile", short(await FS.saveFilingProfile(ctx, vOf(owner), PROFILE)));
  console.log("person", short(await FS.saveFilingPerson(ctx, vOf(owner), { employeeId: e, title: "นาย", firstName: "บีหนึ่ง", lastName: "ทดสอบ" })));
  const NOWC = { now: new Date("2032-01-05T03:00:00Z") };
  const is = await FS.issueTaxCertificate(ctx, vOf(owner), { employeeId: e, taxYear: 2031, kind: "ANNUAL" }, NOWC);
  console.log("issue", short(is), short((await P.hrTaxCertificate.findUnique({ where: { id: is.certId } }))?.contentJson, 300));
  console.log("p1a", short(await FS.previewFiling(ctx, vOf(owner), { kind: "PND1A", period: "2031" }), 300));
  console.log("pnd8", short(await FS.previewFiling(ctx, vOf(owner), { kind: "PND1", period: "2031-08" }), 200));
  const g = await FS.generateFiling(ctx, vOf(owner), { kind: "PND1", period: "2031-09" }, NOWC);
  const g2 = await FS.generateFiling(ctx, vOf(owner), { kind: "PND1", period: "2031-09" }, NOWC);
  console.log("pnd9", g?.ok, g?.code, g?.reason, g?.ok && Buffer.from(g.bytes).equals(Buffer.from(g2.bytes)));
  const h = await FS.generateFiling(ctx, vOf(owner), { kind: "SSO110", runId: ids[0] }, NOWC);
  console.log("sso", h?.ok, h?.code, h?.reason);
  const ty = await REP.loadReport(ctx, vOf(owner), { report: "tax-year", period: "2031" });
  console.log("ty", short(ty?.rows, 300), ty?.notes);
  console.log("tm", short((await REP.loadReport(ctx, vOf(owner), { report: "tax-month", period: "2031-09" }))?.rows, 200));
  console.log("cand", short(await FS.listCertCandidates(ctx, vOf(owner), { taxYear: 2031 })));
  console.log("void", short(await FS.voidTaxCertificate(ctx, vOf(owner), { certId: is.certId, reason: "ทดสอบ" }, NOWC)));
  void canon;
} catch (e) {
  console.log("ERR", e);
} finally {
  await cleanupFx(P, fx, SLUG);
  const inList = `'${fx.tenants.join("','")}'`;
  for (let i = 0; i < 3; i++) for (const t of ["HrTaxCertificate", "HrFilingFile", "HrFilingPerson", "HrFilingProfile", "DocSequence", "HrWorkDay", "HrPayrollItem", "HrPayrollRun", "AuditLog"]) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => null);
  await cleanupFx(P, fx, SLUG);
  await P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LK}-%`);
  await residueOf(P, fx, SLUG, SLUG);
  await P.$disconnect();
}
