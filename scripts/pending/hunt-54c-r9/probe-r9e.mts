// C5.4-C round-9 hunter probe E (QC2 only · throwaway tenant · deleted at the end)
//   D1  DEPOSIT_RECEIPT paid in full by the form path (recordPayment CHEQUE + createCheque{paymentId}) → bounce: 2110 deposit liability / 1100 AR / 1040 / doc status
//   D1v control: same deposit paid by TRANSFER → voidPayment (the path B2c now forbids for cheques) → 2110 / 1100
//   X1r orphan group batch (createCheque refused after commit) → voidGroupPayment recovers? 1040 back to 0?
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r9/probe-r9e.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54cz-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R9", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true, grandTotal: true } })) as Any;
  const bal = async (code: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = $2`, A, code)) as Any[])[0]?.n);
  const short = (r: Any) => (r?.ok ? `ok${r.recorded !== undefined ? `(recorded ${r.recorded})` : ""}${r.voided !== undefined ? `(voided ${r.voided})` : ""}` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 90)})`);
  const snap = async () => ({ ar: await bal("1100"), dep: await bal("2110"), vat: await bal("2200"), transit: await bal("1040"), bankL: 0 });
  const d = (a: Any, b: Any) => JSON.stringify(Object.fromEntries(Object.keys(a).map((k) => [k, b[k] - a[k]])));
  const mkDep = async () => {
    const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
    const dep = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "DEPOSIT_RECEIPT", contactId: cust.id, sourceDocId: q.id, vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: 3_000_000 }] });
    const is = await accSvc.issueDocument(T, A, dep.id);
    return { id: dep.id as string, issue: is };
  };
  { // D1
    const dep = await mkDep();
    const s0 = await snap();
    const p = await accSvc.recordPayment(T, A, dep.id, { channel: "CHEQUE", amount: 3_210_000 });
    const c = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `D${randomBytes(2).toString("hex")}`, bankName: "B", chequeDate: new Date(), amount: 3_210_000, documentId: dep.id, paymentId: p.paymentId });
    const s1 = await snap(); const st1 = await st(dep.id);
    const b = await cheque.bounceCheque(T, A, c.id, "x");
    const s2 = await snap(); const st2 = await st(dep.id);
    log(`D1 deposit receipt issue ${short(dep.issue)} · cheque pay ${short(p)} link ${short(c)} → ${JSON.stringify(st1)} Δ ${d(s0, s1)} · bounce ${short(b)} → ${JSON.stringify(st2)} Δ since before pay ${d(s0, s2)} (expect all 0: no deposit, no AR, no VAT, nothing in transit)`);
    const vp = await accSvc.voidPayment(T, A, dep.id, p.paymentId, "x");
    log(`D1 after bounce: voidPayment → ${short(vp)} · Δ ${d(s0, await snap())}`);
  }
  { // D1v control
    const dep = await mkDep();
    const s0 = await snap();
    const p = await accSvc.recordPayment(T, A, dep.id, { channel: "TRANSFER", financeAccountId: bank.id, amount: 3_210_000 });
    const v = await accSvc.voidPayment(T, A, dep.id, p.paymentId, "x");
    log(`D1v control transfer deposit pay ${short(p)} → voidPayment ${short(v)} · ${JSON.stringify(await st(dep.id))} Δ ${d(s0, await snap())} (1040 n/a)`);
  }
  { // X1r
    const inv = async () => { const x = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] }); await accSvc.issueDocument(T, A, x.id); return x.id as string; };
    const kids = [await inv(), await inv()];
    const g = (await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] })).id;
    const s0 = await snap(); const ck = `x1r_${randomBytes(3).toString("hex")}`;
    const r = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 21_400_000, note: "", feeSatang: 0, wht: [], cheque: { chequeNo: "X1R", bankName: "", chequeDate: today } }, { clientKey: ck });
    const s1 = await snap();
    const v = await grp.voidGroupPayment(T, A, g, grp.groupBatchKey(g, ck), "recover");
    log(`X1r orphan batch ${short(r)} Δ ${d(s0, s1)} · voidGroupPayment ${short(v)} → docs ${JSON.stringify(await Promise.all(kids.map(st)))} Δ ${d(s0, await snap())} · head ${JSON.stringify(await st(g))}`);
  }
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
