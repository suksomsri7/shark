// probe 3 — year totals: over-withheld opening · December opening · SSO above cap · huge incomes (2^53) · INT ceiling
import { setup, short, T, M } from "./common.mjs";
import { oracleTax, oracleWht } from "../../scripts/qc-hr-h3.4-ytd-lib.mjs";
const X = await setup("hunt-h34y-p3");
const { sys, emp, save, create, item, V } = X;
const log = (k: string, v: unknown) => console.log(`${k}: ${short(v, 300)}`);
const sep = async (name: string, o: Record<string, unknown>, salary = M, pk = "2031-09", sso = 87_500) => {
  const s = await sys(name); const e = await emp(s, `${name}1`, { salary });
  const sv = await save(s, V.owner, e, o, T(pk === "2031-12" ? "2031-12-05T05:00:00Z" : "2031-09-10T05:00:00Z"));
  const r = await create(s, pk);
  const it = await item(r?.id, e);
  return { sv: sv?.ok ?? sv?.code, run: r?.ok ?? r?.code, wht: it?.whtSatang, net: it?.netSatang, gross: it?.grossSatang, ssoE: it?.ssoEmployeeSatang, safe: [it?.whtSatang, it?.netSatang].every((x) => Number.isSafeInteger(Number(x))), sso };
};
try {
  log("over-withheld (wht 2,000,000)", { got: await sep("G", { whtSatang: 2_000_000 }), want: oracleWht(9, { inc: 24_000_000, wht: 2_000_000, sso: 700_000 }) });
  const dec = { asOfDay: "2031-11-30", months: 11, incomeSatang: 33_000_000, whtSatang: 11 * 17_083, ssoSatang: 9 * 87_500 + 2 * 100_000 };
  log("december (11 months opening)", { got: await sep("H", dec, M, "2031-12"), want: oracleWht(12, { inc: dec.incomeSatang, wht: dec.whtSatang, sso: dec.ssoSatang }, M, 100_000) });
  log("SSO 5,000,000 above cap", { got: await sep("I", { ssoSatang: 5_000_000 }), want: 17_084 });
  const big = { asOfDay: "2031-08-31", months: 8, incomeSatang: 2_147_483_647, whtSatang: 0, ssoSatang: 700_000 };
  const salary = 2_000_000_000;
  log("huge (opening INT_MAX · salary 20M ฿/month)", { got: await sep("J", big, salary), want: oracleWht(9, { inc: big.incomeSatang, wht: 0, sso: 700_000 }, salary), tax: oracleTax(big.incomeSatang + 4 * salary, 700_000 + 4 * 87_500) });
  log("INT ceiling: opening 21,474,836.48 ฿", await (async () => { const s = await sys("K"); const e = await emp(s, "K1"); return save(s, V.owner, e, { incomeSatang: 2_147_483_648 }); })());
  // realistic executive: 3,000,000 ฿/month × 8 = 24,000,000 ฿ = 2,400,000,000 satang
  log("executive 3M ฿/month Jan–Aug", await (async () => { const s = await sys("L"); const e = await emp(s, "L1"); return save(s, V.owner, e, { incomeSatang: 2_400_000_000, whtSatang: 600_000_000 }); })());
} catch (e) {
  console.log("ERR", e);
} finally {
  await X.cleanup();
}
