import { rd } from "/root/projects/shark-hr-l5/scripts/qc-hr-lib.mjs";
import { bodyOf } from "/root/projects/shark-hr-l5/scripts/qc-hr-priv-2-lib.mjs";
const PAYFILES = ["payroll-actions", "payroll-opening-actions", "work-entries-actions", "stock-charge-actions", "attendance-pay-actions", "payslip-actions", "bank-files/actions", "filings/actions"];
const out: string[] = [];
for (const f of PAYFILES) { const src = rd(`src/lib/modules/hr/${f}.ts`).replace(/\/\/[^\n]*/g, ""); for (const m of src.matchAll(/^export async function (\w+Action)\b/gm)) { const b = bodyOf(src, m[1]!); const ids = /["'](systemId|runId|employeeId|adjustmentId)["']|\bsystemId\s*:|\(\s*systemId\b/.test(b); const g = b.indexOf("hrTargetOwned("); out.push(`${f}:${m[1]} ids=${ids} guard=${g >= 0}`); } }
console.log(out.join("\n"));
