// C5.4-C round-11 hunter probe C (QC2 only · throwaway tenant · deleted at the end)
//   U1  path ② attach+cheque committed, issue not done (DRAFT receipt) → bounce: receipt status / docNo after the bounce?
//       then each exit on a fresh copy: issueDocument · approve again (same keyBase) · recordPayment by transfer · voidDocument — TB since before attach
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r11/probe-r11c.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54ec-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
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
  const short = (r: Any) => (r?.ok ? `ok` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 110)})`);
  const tb = async (): Promise<Map<string, number>> => {
    const rows = (await P.$queryRawUnsafe(`SELECT a."code" AS code, COALESCE(l."contactId",'-') AS c, sum(l."debit" - l."credit")::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 GROUP BY 1,2`, A)) as Any[];
    return new Map(rows.map((r) => [`${r.code}${r.c === "-" ? "" : "@cust"}`, Number(r.n)]));
  };
  const tbDiff = (a: Map<string, number>, b: Map<string, number>) => { const out: string[] = []; for (const k of new Set([...a.keys(), ...b.keys()])) { const d = (b.get(k) ?? 0) - (a.get(k) ?? 0); if (d !== 0) out.push(`${k}:${d}`); } return out.sort(); };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, docNo: true, paidTotal: true } })) as Any;
  let seq = 0;
  const setup = async () => {
    const re = (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 1_000_000 }] })).id as string;
    const kb = `k${randomBytes(5).toString("hex")}`; const b0 = await tb();
    const a = await cheque.attachReceiptPaymentsWithChequesInOneTx(T, A, re, [{ paidAt: new Date(`${today}T00:00:00.000Z`), channel: "CHEQUE", financeAccountId: null, amount: 1_070_000, whtAmountSatang: 0, whtRateBp: null, feeAmount: 0, note: null, createdById: null, idempotencyKey: `${kb}:0`, cheque: { chequeNo: `U${++seq}`, bankName: "KBank", chequeDate: new Date(`${today}T00:00:00.000Z`) }, chequeFinanceAccountId: bank.id }]);
    const s0 = await st(re);
    const cq = (await P.accountDocumentPayment.findFirst({ where: { documentId: re }, select: { chequeId: true } })).chequeId;
    const b = await cheque.bounceCheque(T, A, cq, "bank returned");
    return { re, kb, b0, a, s0, b, s1: await st(re) };
  };
  const row = { paidAt: today, financeAccountId: bank.id, amountSatang: 1_070_000, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: null };
  { const x = await setup(); log(`U1 attach ${short(x.a)} → receipt ${JSON.stringify(x.s0)} → bounce ${short(x.b)} → receipt ${JSON.stringify(x.s1)} (a never-issued receipt should stay DRAFT) · TBΔ ${JSON.stringify(tbDiff(x.b0, await tb()))}`);
    const i = await accSvc.issueDocument(T, A, x.re); log(`U1 exit issueDocument → ${short(i)} → ${JSON.stringify(await st(x.re))} · TBΔ ${JSON.stringify(tbDiff(x.b0, await tb()))}`); }
  { const x = await setup(); const r = await pay.approveReceiptWithPayments(T, A, x.re, [row], { keyBase: `n${randomBytes(4).toString("hex")}` }); log(`U1 exit approve again (new payment by transfer) → ${short(r)} → ${JSON.stringify(await st(x.re))} · TBΔ ${JSON.stringify(tbDiff(x.b0, await tb()))}`); }
  { const x = await setup(); const r = await accSvc.recordPayment(T, A, x.re, { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 }); log(`U1 exit recordPayment(transfer) on the bounced draft → ${short(r)} → ${JSON.stringify(await st(x.re))} · TBΔ ${JSON.stringify(tbDiff(x.b0, await tb()))} (truth if it counts as a sale: bank +1,070,000 · 4000 · 2200 ; AR 0)`); }
  { const x = await setup(); const v = await accSvc.voidDocument(T, A, x.re, "x"); log(`U1 exit voidDocument → ${short(v)} → ${JSON.stringify(await st(x.re))} · TBΔ ${JSON.stringify(tbDiff(x.b0, await tb()))} (expect [])`); }
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
