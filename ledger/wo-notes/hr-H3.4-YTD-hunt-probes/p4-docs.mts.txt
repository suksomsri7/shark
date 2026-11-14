// probe 4 — documents agree with an opening (50 ทวิ · ภ.ง.ด.1ก · tax-year · slip history) + every path to change the opening after issue / after void
import { setup, short, T, OPEN } from "./common.mjs";
const X = await setup("hunt-h34y-p4");
const { sys, emp, save, create, approve, V, OPM, FS, REP, PS, c, safe, P, TT } = X;
const log = (k: string, v: unknown) => console.log(`${k}: ${short(v, 320)}`);
const ADDR = { subdistrict: "ทุ่งพญาไท", district: "ราชเทวี", province: "กรุงเทพมหานคร", postcode: "10400" };
const PROFILE = { taxId: "0105555000013", branchNo: "000000", employerName: "บริษัท คิวซี ล่าบั๊ก จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400", deptName: "สำนักงานใหญ่", lto: false, branchType: "", rdUserId: "QCREF00000000000034", rdFormFlag: 1, ssoAccountNo: "9876543210", ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: "นายผู้ลงนาม ทดสอบ", certPrefix: "HR50" };
const NOWC = { now: T("2032-01-05T03:00:00Z") };
try {
  const B = await sys("B");
  const e = await emp(B, "B01");
  const eL = await emp(B, "B02", { end: "2031-10-31" }); // leaver (LEAVER cert during the year)
  await P.hrEmployee.update({ where: { id: e }, data: { nationalId: "1102000123454", ...ADDR } });
  await P.hrEmployee.update({ where: { id: eL }, data: { nationalId: "3100600999991", ...ADDR } });
  await FS.saveFilingProfile(c(B), V.owner, PROFILE);
  for (const [id, n] of [[e, "บีหนึ่ง"], [eL, "บีสอง"]]) await FS.saveFilingPerson(c(B), V.owner, { employeeId: id, title: "นาย", firstName: n, lastName: "ทดสอบ" });
  log("save e", (await save(B, V.owner, e))?.ok);
  log("save eL", (await save(B, V.owner, eL))?.ok);
  for (const pk of ["2031-09", "2031-10", "2031-11", "2031-12"]) { const r = await create(B, pk); const a = await approve(B, r?.id); if (!a?.ok) log(`run ${pk}`, { r: r?.code, a }); }
  // LEAVER cert for eL in Nov 2031 → then edit opening ⇒ CERT_ISSUED?
  const lv = await safe(() => FS.issueTaxCertificate(c(B), V.owner, { employeeId: eL, taxYear: 2031, kind: "LEAVER" }, { now: T("2031-11-15T03:00:00Z") }));
  log("leaver cert", { ok: lv?.ok, code: lv?.code });
  log("leaver edit after cert", await save(B, V.owner, eL, { incomeSatang: 24_000_100 }, T("2031-11-16T03:00:00Z"), 1));
  // annual cert for e
  const is1 = await safe(() => FS.issueTaxCertificate(c(B), V.owner, { employeeId: e, taxYear: 2031, kind: "ANNUAL" }, NOWC));
  const cert = (await P.hrTaxCertificate.findUnique({ where: { id: is1?.certId } }) as any)?.contentJson;
  const p1a = await safe(() => FS.previewFiling(c(B), V.owner, { kind: "PND1A", period: "2031" }));
  const sum = (k: string) => ((p1a?.rows ?? []) as any[]).filter((r) => r.employeeId === e).reduce((t, r) => t + Number(r[k] ?? 0), 0);
  const ty = await safe(() => REP.loadReport(c(B), V.owner, { report: "tax-year", period: "2031" }));
  const tyRow = ((ty?.rows ?? []) as any[]).find((r) => JSON.stringify(r).includes("B01"));
  const hist = await safe(() => PS.slipHistory(c(B), V.owner, { employeeId: e, taxYear: 2031 }));
  log("50ทวิ", { ok: is1?.ok, code: is1?.code, total: cert?.totalSatang, tax: cert?.totalTaxSatang, sso: cert?.funds?.ssoSatang });
  log("1ก", { amount: sum("amountSatang"), tax: sum("taxSatang") });
  log("tax-year", tyRow);
  log("slipHistory", { inc: hist?.year?.incomeSatang, tax: hist?.year?.taxSatang, sso: hist?.year?.ssoSatang, opening: hist?.year?.opening, count: hist?.year?.count });
  // every change path while the cert is live
  const ex = { employeeId: e, taxYear: 2031 };
  log("after-issue save rev2", await save(B, V.owner, e, { incomeSatang: 24_000_100 }, NOWC.now, 1));
  log("after-issue clear", await safe(() => OPM.clearOpeningYtd(c(B), V.owner, { ...ex, expectRev: 1 }, NOWC)));
  log("after-issue bulk", await safe(() => OPM.saveOpeningYtdBulk(c(B), V.owner, { taxYear: 2031, rows: [{ ...ex, ...OPEN, incomeSatang: 1, whtSatang: 0, expectRev: 1 }] }, NOWC)));
  log("after-issue zero", await save(B, V.owner, e, { asOfDay: "2031-01-01", months: 0, incomeSatang: 0, whtSatang: 0, ssoSatang: 0 }, NOWC.now, 1));
  // rehire = second employee row of the same person (same national id) → opening allowed? (Q14 out of scope)
  const eR = await emp(B, "B01R", { start: "2031-12-01" });
  await P.hrEmployee.update({ where: { id: eR }, data: { nationalId: "1102000123454", ...ADDR } }).catch((x: unknown) => log("rehire nid", String(x).slice(0, 80)));
  log("rehire row opening", await save(B, V.owner, eR, { asOfDay: "2031-11-30", months: 11, incomeSatang: 33_000_000, whtSatang: 0, ssoSatang: 0 }, NOWC.now));
  log("live rows of e", (await X.liveOf(e)).map((r: any) => [r.rev, r.i]));
  const lc = await safe(() => FS.listTaxCertificates(c(B), V.owner, { taxYear: 2031 }));
  log("cert list stale", ((lc?.items ?? []) as any[]).map((x) => [x.employeeId === e ? "e" : x.employeeId === eL ? "eL" : "?", x.stale]));
  // void → edit → re-issue
  log("void", (await safe(() => FS.voidTaxCertificate(c(B), V.owner, { certId: is1?.certId, reason: "ทดสอบล่าบั๊ก" }, NOWC)))?.ok);
  log("after-void save", await save(B, V.owner, e, { incomeSatang: 24_000_100 }, NOWC.now, 1));
  const is2 = await safe(() => FS.issueTaxCertificate(c(B), V.owner, { employeeId: e, taxYear: 2031, kind: "ANNUAL" }, NOWC));
  log("reissue total", ((await P.hrTaxCertificate.findUnique({ where: { id: is2?.certId } })) as any)?.contentJson?.totalSatang);
  log("audits ฿?", ((await P.auditLog.findMany({ where: { tenantId: TT, action: { startsWith: "hr.payroll.opening" } } })) as any[]).map((a) => `${a.action}:${Object.keys(a.after ?? {}).join("+")}`));
} catch (err) {
  console.log("ERR", err);
} finally {
  await X.cleanup();
}
