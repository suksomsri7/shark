// C5.4-C round-11 hunter probe D (QC2 only · throwaway tenant · deleted at the end)
//   U2  how often does approveReceiptWithPayments (path ②, one cheque) stop after the committed attach+cheque step — leaving a DRAFT receipt that
//       holds a live cheque (the U1 starting state) — while two other cashiers post single payments in the same month? ×12 approvals
//       + does the documented retry (approve again, same keyBase) recover each of them?
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r11/probe-r11d.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54ed-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const pay = (await import("@/lib/modules/account/payment" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R11", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const inv = async () => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 1_000_000 }] }); await accSvc.issueDocument(T, A, d.id); return d.id as string; };
  const res: string[] = []; const reasons: Record<string, number> = {};
  const receipts: { re: string; kb: string }[] = []; for (let i = 0; i < 12; i += 1) receipts.push({ re: (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 1_000_000 }] })).id, kb: `k${randomBytes(5).toString("hex")}` });
  const singles: string[] = []; for (let i = 0; i < 24; i += 1) singles.push(await inv());
  const draftRow = (i: number) => ({ paidAt: today, financeAccountId: bank.id, amountSatang: 1_070_000, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: { chequeNo: `U2-${i}`, bankName: "KBank", chequeDate: today } });
  const single = (k: string) => pay.recordPayments(T, A, k, [{ paidAt: today, financeAccountId: bank.id, amountSatang: 1_070_000, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: null }], { keyBase: `s${randomBytes(4).toString("hex")}` });
  await Promise.all([
    (async () => { for (let i = 0; i < receipts.length; i += 1) { const r = await pay.approveReceiptWithPayments(T, A, receipts[i].re, [draftRow(i)], { keyBase: receipts[i].kb }); res.push(r.ok ? "ok" : "fail"); if (!r.ok) reasons[String(r.reason).slice(0, 80)] = (reasons[String(r.reason).slice(0, 80)] ?? 0) + 1; } })(),
    (async () => { for (const k of singles.slice(0, 12)) await single(k); })(),
    (async () => { for (const k of singles.slice(12)) await single(k); })(),
  ]);
  const stuck: string[] = [];
  for (const x of receipts) { const d = await P.accountDocument.findUnique({ where: { id: x.re }, select: { status: true } }); const c = await P.accountDocumentPayment.count({ where: { documentId: x.re, chequeId: { not: null } } }); if (d.status === "DRAFT" && c > 0) stuck.push(x.re); }
  log(`U2 approvals with a cheque while 2 cashiers post: ok ${res.filter((r) => r === "ok").length}/${res.length} · reasons ${JSON.stringify(reasons)} · left as DRAFT receipt holding a live cheque: ${stuck.length}`);
  let rec = 0; for (const re of stuck) { const x = receipts.find((r) => r.re === re)!; const r = await pay.approveReceiptWithPayments(T, A, re, [draftRow(99)], { keyBase: x.kb }); if (r.ok) rec += 1; }
  log(`U2 documented retry (approve again, same keyBase, no contention): recovered ${rec}/${stuck.length}`);
} catch (e) { log(`FATAL ${e instanceof Error ? e.stack : String(e)}`); }
finally {
  if (T) { const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined); await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0; for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    log(`CLEAN left=${left}`); }
  await prisma.$disconnect();
}
process.exit(0);
