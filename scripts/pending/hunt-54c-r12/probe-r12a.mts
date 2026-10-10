// C5.4-C round-12 hunter probe A (QC2 only · throwaway tenant · deleted at the end)
//   N1  path ② attach+cheque committed, issue not done (DRAFT, live ON_HAND cheque) → user approves AGAIN with a NEW keyBase (page reload) — second payment set on top?
//   N2  same with a transfer attach (no cheque)
//   P1  partial deposit by cheque (NONE-kind line): a) ON_HAND bounce · b) CLEARED bounce · c) CLEARED then completed by transfer then bounce — TB 0 / JE counts
//   P2  cash-sale receipt, cheque CLEARED → voidDocument (PAYMENT_VOID) → TB 0 · second voidDocument · later bounce of that still-CLEARED cheque → TB 0? · voidDocument(DRAFT) with a CLEARED cheque
//   E1  cash-sale events: recorded/voided per payment (transfer + cheque), approve retried after a committed attach → recorded not duplicated
//   C1  receipt converted from an invoice: voidDocument keeps the status rule (issued receipt, invoice paid) — nothing posted by the receipt void, invoice untouched
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r12/probe-r12a.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54fa-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const on = (k: string) => ONLY.length === 0 || ONLY.includes(k);
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const pay = (await import("@/lib/modules/account/payment" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R12", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const d0 = new Date(`${today}T00:00:00.000Z`);
  const short = (r: Any) => (r?.ok ? `ok` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 110)})`);
  const tb = async (): Promise<Map<string, number>> => {
    const rows = (await P.$queryRawUnsafe(`SELECT a."code" AS code, COALESCE(l."contactId",'-') AS c, sum(l."debit" - l."credit")::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 GROUP BY 1,2`, A)) as Any[];
    return new Map(rows.map((r) => [`${r.code}${r.c === "-" ? "" : "@cust"}`, Number(r.n)]));
  };
  const tbDiff = (a: Map<string, number>, b: Map<string, number>) => { const out: string[] = []; for (const k of new Set([...a.keys(), ...b.keys()])) { const d = (b.get(k) ?? 0) - (a.get(k) ?? 0); if (d !== 0) out.push(`${k}:${d}`); } return out.sort(); };
  const unbalanced = async () => Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM (SELECT e."id" FROM "AccountJournalEntry" e JOIN "AccountJournalLine" l ON l."entryId" = e."id" WHERE e."systemId" = $1 GROUP BY e."id" HAVING sum(l."debit") <> sum(l."credit")) x`, A)) as Any[])[0]?.n);
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, docNo: true, paidTotal: true, grandTotal: true } })) as Any;
  let seq = 0;
  const chq = () => ({ chequeNo: `F${++seq}-${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: today });
  const key = () => `k${randomBytes(5).toString("hex")}`;
  const row = (amt: number, cheque: Any = null) => ({ paidAt: today, financeAccountId: bank.id, amountSatang: amt, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque });
  const mkRe = async () => (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 1_000_000 }] })).id as string;
  const cqOf = async (doc: string) => (await P.accountDocumentPayment.findFirst({ where: { documentId: doc, chequeId: { not: null } }, orderBy: { createdAt: "desc" }, select: { chequeId: true } }))?.chequeId as string;
  const attachOnly = async (re: string, kb: string, withCheque: boolean) => cheque.attachReceiptPaymentsWithChequesInOneTx(T, A, re, [{ paidAt: d0, channel: withCheque ? "CHEQUE" : "TRANSFER", financeAccountId: withCheque ? null : bank.id, amount: 1_070_000, whtAmountSatang: 0, whtRateBp: null, feeAmount: 0, note: null, createdById: null, idempotencyKey: `${kb}:0`, cheque: withCheque ? { chequeNo: `N${++seq}`, bankName: "KBank", chequeDate: d0 } : null, chequeFinanceAccountId: bank.id }]);
  const evCount = async (docId: string) => { const pays = ((await P.accountDocumentPayment.findMany({ where: { documentId: docId }, select: { id: true } })) as Any[]).map((p) => p.id); const rec = await P.outboxEvent.count({ where: { tenantId: T, type: "account.payment.recorded", idempotencyKey: { in: pays.map((p) => `account.payment.recorded#${p}`) } } }); const vd = await P.outboxEvent.count({ where: { tenantId: T, type: "account.payment.voided", idempotencyKey: { in: pays.map((p) => `account.payment.voided#${p}`) } } }); return `payments ${pays.length} recorded ${rec} voided ${vd}`; };

  if (on("N1") || on("N2")) {
    for (const withCheque of [true, false]) {
      const re = await mkRe(); const b0 = await tb();
      const a = await attachOnly(re, key(), withCheque);
      const r = await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000, withCheque ? chq() : null)], { keyBase: key() });
      const live = await P.accountDocumentPayment.count({ where: { documentId: re, voidedAt: null } });
      log(`${withCheque ? "N1 cheque" : "N2 transfer"} attach ${short(a)} (issue not done) → approve again with a NEW keyBase ${short(r)} → receipt ${JSON.stringify(await st(re))} · live payments ${live} (expect 1) · cheques ${await P.accountCheque.count({ where: { systemId: A } })} · unbalanced JEs ${await unbalanced()} · TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (expect one sale: ${withCheque ? "1040" : "1010-01"} +1,070,000 · 4000 −1,000,000 · 2200 −70,000) · ${await evCount(re)}`);
    }
  }

  const mkDep = async () => {
    const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
    const dep = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "DEPOSIT_RECEIPT", contactId: cust.id, sourceDocId: q.id, vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: 3_000_000 }] });
    await accSvc.issueDocument(T, A, dep.id); return dep.id as string;
  };
  const jeOf = async (doc: string) => P.accountJournalEntry.count({ where: { systemId: A, refType: "AccountDocument", refId: doc } });
  if (on("P1")) {
    { const d = await mkDep(); const b0 = await tb();
      await pay.recordPayments(T, A, d, [row(2_210_000, chq())], { keyBase: key() }); const b = await cheque.bounceCheque(T, A, await cqOf(d), "x");
      log(`P1a partial deposit by cheque ON_HAND → bounce ${short(b)} → ${JSON.stringify(await st(d))} TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (expect []) · deposit JEs ${await jeOf(d)}`); }
    { const d = await mkDep(); const b0 = await tb();
      await pay.recordPayments(T, A, d, [row(2_210_000, chq())], { keyBase: key() }); const cq = await cqOf(d); await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq);
      const mid = tbDiff(b0, await tb()); const b = await cheque.bounceCheque(T, A, cq, "x");
      log(`P1b partial deposit by cheque CLEARED (TBΔ ${JSON.stringify(mid)}) → bounce ${short(b)} → TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (expect []) · unbalanced ${await unbalanced()}`); }
    { const d = await mkDep(); const b0 = await tb();
      await pay.recordPayments(T, A, d, [row(2_210_000, chq())], { keyBase: key() }); const cq = await cqOf(d); await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq);
      const c = await pay.recordPayments(T, A, d, [row(1_000_000)], { keyBase: key() }); const mid = tbDiff(b0, await tb()); const j1 = await jeOf(d);
      const b = await cheque.bounceCheque(T, A, cq, "x");
      log(`P1c partial by cheque CLEARED → completed by transfer ${short(c)} → ${JSON.stringify(await st(d))} TBΔ ${JSON.stringify(mid)} (expect bank +3,210,000 · 2110 −3,000,000 · 2200 −210,000 · 1040 0; deposit JEs ${j1}) → bounce ${short(b)} → ${JSON.stringify(await st(d))} TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (design R11-4: partial deposit unposted ⇒ [])`); }
  }

  if (on("P2")) {
    { const re = await mkRe(); const b0 = await tb();
      const r = await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000, chq())], { keyBase: key() }); const cq = await cqOf(re);
      await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq);
      const v1 = await accSvc.voidDocument(T, A, re, "goods returned, refunded"); const t1 = tbDiff(b0, await tb());
      const v2 = await accSvc.voidDocument(T, A, re, "again");
      const reg1 = (await P.accountCheque.findUnique({ where: { id: cq }, select: { status: true } })).status;
      const pv = await P.accountJournalEntry.count({ where: { systemId: A, refType: "AccountCheque", refId: cq, idempotencyKey: { contains: "PAYMENT_VOID" } } });
      const b = await cheque.bounceCheque(T, A, cq, "bank returned it after all");
      log(`P2a cash-sale by cheque CLEARED ${short(r)} → voidDocument ${short(v1)} TBΔ ${JSON.stringify(t1)} (expect []) · register ${reg1} · PAYMENT_VOID entries ${pv} · second voidDocument ${short(v2)} · later bounce of the CLEARED cheque ${short(b)} → TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (the bank takes the money back that was already refunded ⇒ truth: bank −1,070,000? or refused) · unbalanced ${await unbalanced()} · ${await evCount(re)}`); }
    { const re = await mkRe(); const b0 = await tb();
      await attachOnly(re, key(), true); const cq = await cqOf(re); await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq);
      const v = await accSvc.voidDocument(T, A, re, "x");
      log(`P2b DRAFT receipt, cheque CLEARED → voidDocument ${short(v)} → ${JSON.stringify(await st(re))} TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (expect []) · ${await evCount(re)}`); }
  }

  if (on("E1")) {
    for (const withCheque of [false, true]) {
      const re = await mkRe(); const kb = key();
      await attachOnly(re, kb, withCheque); // committed first step, issue "failed"
      const r = await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000, withCheque ? chq() : null)], { keyBase: kb });
      const e1 = await evCount(re);
      const v = withCheque ? await cheque.bounceCheque(T, A, await cqOf(re), "x") : await accSvc.voidDocument(T, A, re, "x");
      const payload = (await P.outboxEvent.findFirst({ where: { tenantId: T, type: "account.payment.recorded", payload: { path: ["documentId"], equals: re } }, select: { payload: true } }))?.payload;
      log(`E1 ${withCheque ? "cheque" : "transfer"}: attach → retry approve same key ${short(r)} → ${e1} (expect recorded 1) → ${withCheque ? "bounce" : "voidDocument"} ${short(v)} → ${await evCount(re)} (expect voided 1) · payload ${JSON.stringify(payload)}`);
    }
  }

  if (on("C1")) {
    const i = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 1_000_000 }] });
    await accSvc.issueDocument(T, A, i.id);
    const cv = await accSvc.convertDocument(T, A, i.id, "RECEIPT");
    const b0 = await tb();
    const ap = cv.ok ? await pay.approveReceiptWithPayments(T, A, cv.newId, [row(1_070_000)], { keyBase: key() }) : cv;
    const mid = tbDiff(b0, await tb());
    const v1 = cv.ok ? await accSvc.voidDocument(T, A, cv.newId, "x") : null;
    const invPay = await P.accountDocumentPayment.findFirst({ where: { documentId: i.id }, select: { id: true } });
    const vp = invPay ? await pay.voidPaymentAny(T, A, i.id, invPay.id, "x") : null;
    const v2 = cv.ok ? await accSvc.voidDocument(T, A, cv.newId, "x") : null;
    log(`C1 converted receipt ${short(cv)} approve ${short(ap)} → TBΔ ${JSON.stringify(mid)} · invoice ${JSON.stringify(await st(i.id))} · voidDocument(receipt) ${short(v1)} · voidPayment(invoice) ${short(vp)} · voidDocument(receipt) ${short(v2)} → receipt ${JSON.stringify(cv.ok ? await st(cv.newId) : null)} invoice ${JSON.stringify(await st(i.id))} · TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (expect [] after both)`);
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
