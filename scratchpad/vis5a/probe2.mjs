import { satArith, minus, elById, payrollParams, idMatch, textOfHtml, THAI } from "../../scripts/qc-hr-vis-5a-lib.mts";
import { rd } from "../../scripts/qc-hr-lib.mts";
const rem = ['<td className="text-right tabular-nums">{baht(r.grossSatang + r.deductSatang - r.addSatang)}</td>', '<td>{baht(-r.deductSatang)}</td>'];
const add = ['<td className="x">{baht(r.grossSatang + r.deductSatang - r.addSatang)}</td> {/* HR VIS-5a ◂ */}', '<td>{baht(-r.deductSatang)}</td>', '{baht(totals.netSatang - totals.whtSatang)}', 'const ot = rows.reduce((a, r) => a + r.otSatang, 0);'];
console.log("rem", satArith(rem)); console.log("extra", minus(satArith(add), satArith(rem)));
console.log(elById('<div><section data-testid="a"><div>x<div>y</div></div><input data-testid="b"/></section><p>z</p></div>', "a"));
for (const f of ["bank-files/actions.ts","filings/actions.ts","payroll-opening-actions.ts","stock-charge-actions.ts","payslip-actions.ts"]) console.log(f, payrollParams(rd("src/lib/modules/hr/"+f)).join(","));
console.log(idMatch("hr-run2-doclink-*","hr-run2-doclink-x"), THAI.test("฿1"), THAI.test("ก"));
