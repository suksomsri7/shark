// C5.4-C round-11 hunter probe B (QC2 only · throwaway tenant · deleted at the end)
//   R1  "worst remaining state": path ② attach+cheque committed, issue never happened (DRAFT receipt, cheque ON_HAND) — exits:
//         a) approve again (same keyBase) → issued? b) voidDocument(draft) refused → bounce → voidDocument → TB 0?
//         c) cheque deposited + CLEARED while the receipt is still DRAFT → bounce → TB 0?  d) CLEARED then approve again → TB right?
//   R2  issued cash-sale receipt, cheque CLEARED: voidDocument? only exit = bounce? → TB 0
//   R3  cash-sale by cheque → bounce → re-collect by transfer → voidDocument (refused?) → void re-collect → voidDocument → TB 0 · events
//   D1  deposit with WHT paid by cheque (new per-payment shape) → bounce → TB 0 ; deposit paid 50 % transfer + later 50 % cheque → JE count / shape → bounce → TB
//   D2  deposit mixed transfer+cheque, cheque CLEARED, then voidPayment(transfer) → allowed? TB vs control (partial deposit paid only by the same cleared cheque)
//   D3  deposit 3,210,000 deducted by A (2,000,000) + B (1,210,000) → void A → deposit status / deductible again / void deposit payment refused (B live)
//   D4  CN fully crediting the invoice that deducted the deposit → deposit refundable? stuck?
//   HV  voidGroupPayment(batch 1) ∥ recordPayment(child c, other month) ×20 — the post-tx syncGroupStatus (no lock) vs the in-tx head sync
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r11/probe-r11b.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54eb-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const on = (k: string) => ONLY.length === 0 || ONLY.includes(k);
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
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
  const lastMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 15));
  const short = (r: Any) => (r?.ok ? `ok` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 110)})`);
  const tb = async (): Promise<Map<string, number>> => {
    const rows = (await P.$queryRawUnsafe(`SELECT a."code" AS code, COALESCE(l."contactId",'-') AS c, sum(l."debit" - l."credit")::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 GROUP BY 1,2`, A)) as Any[];
    return new Map(rows.map((r) => [`${r.code}${r.c === "-" ? "" : "@cust"}`, Number(r.n)]));
  };
  const tbDiff = (a: Map<string, number>, b: Map<string, number>) => { const out: string[] = []; for (const k of new Set([...a.keys(), ...b.keys()])) { const d = (b.get(k) ?? 0) - (a.get(k) ?? 0); if (d !== 0) out.push(`${k}:${d}`); } return out.sort(); };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true, grandTotal: true } })) as Any;
  let seq = 0;
  const chq = () => ({ chequeNo: `R${++seq}-${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: today });
  const key = () => `k${randomBytes(5).toString("hex")}`;
  const row = (amt: number, cheque: Any = null, wht = 0) => ({ paidAt: today, financeAccountId: bank.id, amountSatang: amt, whtAmountSatang: wht, whtRateBp: wht ? 300 : null, whtIncomeType: wht ? "M40_2" : null, feeSatang: 0, note: "", cheque });
  const mkRe = async () => (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 1_000_000 }] })).id as string;
  const cqOf = async (doc: string) => (await P.accountDocumentPayment.findFirst({ where: { documentId: doc, chequeId: { not: null } }, orderBy: { createdAt: "desc" }, select: { chequeId: true } }))?.chequeId as string;
  // the committed first step of path ② (attach + cheque + link in one tx) without the issue step = "issue failed afterwards"
  const attachOnly = async (re: string, kb: string) => cheque.attachReceiptPaymentsWithChequesInOneTx(T, A, re, [{ paidAt: new Date(`${today}T00:00:00.000Z`), channel: "CHEQUE", financeAccountId: null, amount: 1_070_000, whtAmountSatang: 0, whtRateBp: null, feeAmount: 0, note: null, createdById: null, idempotencyKey: `${kb}:0`, cheque: { chequeNo: `D${++seq}`, bankName: "KBank", chequeDate: new Date(`${today}T00:00:00.000Z`) }, chequeFinanceAccountId: bank.id }]);

  if (on("R1")) {
    { // a) approve again
      const re = await mkRe(); const kb = key(); const b0 = await tb();
      const a = await attachOnly(re, kb);
      const r = await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000, chq())], { keyBase: kb });
      log(`R1a draft receipt with ON_HAND cheque (attach ${short(a)}) → approve again same keyBase ${short(r)} → ${JSON.stringify(await st(re))} · cheques linked ${await P.accountDocumentPayment.count({ where: { documentId: re, chequeId: { not: null } } })} · TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (expect 1040 +1,070,000 · 4000 · 2200)`);
    }
    { // b) void draft refused → bounce → void
      const re = await mkRe(); const b0 = await tb();
      await attachOnly(re, key()); const cq = await cqOf(re);
      const v1 = await accSvc.voidDocument(T, A, re, "x");
      const b = await cheque.bounceCheque(T, A, cq, "x");
      const v2 = await accSvc.voidDocument(T, A, re, "x");
      log(`R1b draft + ON_HAND cheque: voidDocument ${short(v1)} → bounce ${short(b)} → voidDocument ${short(v2)} → ${JSON.stringify(await st(re))} · TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (expect [])`);
    }
    { // c) cleared while draft → bounce
      const re = await mkRe(); const b0 = await tb();
      await attachOnly(re, key()); const cq = await cqOf(re);
      const d = await cheque.depositCheque(T, A, cq); const c = await cheque.clearCheque(T, A, cq);
      const mid = tbDiff(b0, await tb());
      const b = await cheque.bounceCheque(T, A, cq, "x");
      const after = tbDiff(b0, await tb());
      const v = await accSvc.voidDocument(T, A, re, "x");
      log(`R1c draft receipt, cheque deposit ${short(d)} clear ${short(c)} → TBΔ ${JSON.stringify(mid)} → bounce ${short(b)} → TBΔ ${JSON.stringify(after)} (expect []) → voidDocument(draft) ${short(v)} → TBΔ ${JSON.stringify(tbDiff(b0, await tb()))}`);
    }
    { // d) cleared while draft → approve again
      const re = await mkRe(); const kb = key(); const b0 = await tb();
      await attachOnly(re, kb); const cq = await cqOf(re);
      await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq);
      const r = await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000, chq())], { keyBase: kb });
      log(`R1d draft receipt, cheque CLEARED, then approve ${short(r)} → TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (expect bank +1,070,000 · 4000 · 2200, 1040 0)`);
    }
  }

  if (on("R2")) {
    const re = await mkRe(); const b0 = await tb();
    const r = await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000, chq())], { keyBase: key() });
    const cq = await cqOf(re); await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq);
    const v1 = await accSvc.voidDocument(T, A, re, "customer returned goods");
    const b = await cheque.bounceCheque(T, A, cq, "not really bounced — only way out");
    const v2 = await accSvc.voidDocument(T, A, re, "x");
    log(`R2 issued cash-sale, cheque CLEARED ${short(r)} → voidDocument ${short(v1)} → (exit) bounce a cleared cheque ${short(b)} → voidDocument ${short(v2)} → TBΔ ${JSON.stringify(tbDiff(b0, await tb()))}`);
  }

  if (on("R3")) {
    const re = await mkRe(); const b0 = await tb(); const ob0 = await P.outboxEvent.count({ where: { tenantId: T } });
    await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000, chq())], { keyBase: key() });
    const cq = await cqOf(re);
    const b = await cheque.bounceCheque(T, A, cq, "x");
    const rc = await accSvc.recordPayment(T, A, re, { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 });
    const v1 = await accSvc.voidDocument(T, A, re, "x");
    const vp = await pay.voidPaymentAny(T, A, re, rc.paymentId, "x");
    const v2 = await accSvc.voidDocument(T, A, re, "x");
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: T }, orderBy: { createdAt: "asc" }, skip: ob0, select: { type: true } })) as Any[]).map((e) => e.type);
    const cnt: Record<string, number> = {}; for (const e of evs) cnt[e] = (cnt[e] ?? 0) + 1;
    log(`R3 cash-sale cheque → bounce ${short(b)} → re-collect ${short(rc)} → voidDocument ${short(v1)} → voidPayment(re-collect) ${short(vp)} → voidDocument ${short(v2)} · TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (expect []) · events ${JSON.stringify(cnt)}`);
  }

  const mkDep = async (unit = 3_000_000) => {
    const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
    const dep = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "DEPOSIT_RECEIPT", contactId: cust.id, sourceDocId: q.id, vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: unit }] });
    await accSvc.issueDocument(T, A, dep.id); return dep.id as string;
  };
  const jeOf = async (doc: string) => P.accountJournalEntry.count({ where: { systemId: A, refType: "AccountDocument", refId: doc, reversalOfId: null } });

  if (on("D1")) {
    { const d = await mkDep(); const b0 = await tb();
      const r = await pay.recordPayments(T, A, d, [row(3_120_000, chq(), 90_000)], { keyBase: key() }); const mid = tbDiff(b0, await tb());
      const cq = await cqOf(d); await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq);
      const b = await cheque.bounceCheque(T, A, cq, "x");
      log(`D1a deposit 3,210,000 by cheque 3,120,000 + WHT 90,000 ${short(r)} → TBΔ ${JSON.stringify(mid)} · clear + bounce ${short(b)} → ${JSON.stringify(await st(d))} TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (expect [])`); }
    { const d = await mkDep(); const b0 = await tb();
      const r1 = await pay.recordPayments(T, A, d, [row(1_605_000)], { keyBase: key() }); const m1 = tbDiff(b0, await tb()); const j1 = await jeOf(d);
      const r2 = await pay.recordPayments(T, A, d, [row(1_605_000, chq())], { keyBase: key() }); const m2 = tbDiff(b0, await tb()); const j2 = await jeOf(d);
      const b = await cheque.bounceCheque(T, A, await cqOf(d), "x");
      log(`D1b deposit 50 % transfer ${short(r1)} (TBΔ ${JSON.stringify(m1)}, deposit JEs ${j1}) → later 50 % cheque ${short(r2)} → ${JSON.stringify(await st(d))} TBΔ ${JSON.stringify(m2)} (deposit JEs ${j2}; expect bank +1,605,000 · 1040 +1,605,000 · 2110 −3,000,000 · 2200 −210,000) → bounce ${short(b)} → ${JSON.stringify(await st(d))} TBΔ ${JSON.stringify(tbDiff(b0, await tb()))}`); }
  }

  if (on("D2")) {
    { const d = await mkDep(); const b0 = await tb();
      await pay.recordPayments(T, A, d, [row(2_210_000, chq())], { keyBase: key() }); const cq = await cqOf(d);
      await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq);
      log(`D2 control: partial deposit paid only by a CLEARED cheque 2,210,000 → ${JSON.stringify(await st(d))} TBΔ ${JSON.stringify(tbDiff(b0, await tb()))}`); }
    { const d = await mkDep(); const b0 = await tb();
      await pay.recordPayments(T, A, d, [row(1_000_000), row(2_210_000, chq())], { keyBase: key() }); const cq = await cqOf(d);
      await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq); const mid = tbDiff(b0, await tb());
      const tp = await P.accountDocumentPayment.findFirst({ where: { documentId: d, chequeId: null, voidedAt: null }, select: { id: true } });
      const v = await accSvc.voidPayment(T, A, d, tp.id, "transfer entered by mistake");
      log(`D2 mixed transfer 1,000,000 + cheque 2,210,000 CLEARED → TBΔ ${JSON.stringify(mid)} → voidPayment(transfer) ${short(v)} → ${JSON.stringify(await st(d))} TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (compare with control)`); }
  }

  if (on("D3")) {
    const d = await mkDep();
    await pay.recordPayments(T, A, d, [row(3_210_000)], { keyBase: key() });
    const mkI = async (amt: number) => { const i = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] }); const s = await accSvc.setDocDeposits(T, A, i.id, [{ depositId: d, amountSatang: amt }]); const is = await accSvc.issueDocument(T, A, i.id); return { id: i.id as string, s, is }; };
    const ia = await mkI(2_000_000); const ib = await mkI(1_210_000); const s1 = (await st(d)).status;
    const va = await accSvc.voidDocument(T, A, ia.id, "x"); const s2 = (await st(d)).status;
    const list = await accSvc.listDeductibleDeposits(T, A, cust.id).catch((e: Any) => String(e));
    const p = await P.accountDocumentPayment.findFirst({ where: { documentId: d }, select: { id: true } });
    const vp = await accSvc.voidPayment(T, A, d, p.id, "x");
    const ic = await mkI(2_000_000); const s3 = (await st(d)).status;
    log(`D3 deductors A ${short(ia.is)} B ${short(ib.is)} → dep ${s1} → void A ${short(va)} → dep ${s2} (expect AWAITING_DEDUCT) · deductible list ${JSON.stringify(Array.isArray(list) ? list.map((x: Any) => x.remaining ?? x.remainingSatang ?? x.available ?? x) : list).slice(0, 200)} · voidPayment(deposit) ${short(vp)} (expect refused, B live) · deduct 2,000,000 on C ${short(ic.s)} ${short(ic.is)} → dep ${s3}`);
  }

  if (on("D4")) {
    const d = await mkDep();
    await pay.recordPayments(T, A, d, [row(3_210_000)], { keyBase: key() });
    const i = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
    await accSvc.setDocDeposits(T, A, i.id, [{ depositId: d, amountSatang: 3_210_000 }]); await accSvc.issueDocument(T, A, i.id);
    const inv = await st(i.id);
    const cn = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: i.id, adjustReason: "ยกเลิกงาน", vatMode: "EXCLUDE", lines: [{ description: "ยกเลิกงานทั้งหมด", qty: 1, unitPrice: Math.round((inv.grandTotal) / 1.07) }] });
    const ci = await accSvc.issueDocument(T, A, cn.id);
    const rf = await accSvc.refundDeposit(T, A, d, "customer cancelled");
    const p = await P.accountDocumentPayment.findFirst({ where: { documentId: d }, select: { id: true } });
    const vp = await accSvc.voidPayment(T, A, d, p.id, "x");
    const vi = await accSvc.voidDocument(T, A, i.id, "x");
    log(`D4 invoice ${JSON.stringify(inv)} deducts deposit 3,210,000 · CN for the whole remaining ${short(ci)} → invoice ${JSON.stringify(await st(i.id))} · refund deposit ${short(rf)} · voidPayment(deposit) ${short(vp)} · voidDocument(invoice) ${short(vi)} → dep ${JSON.stringify(await st(d))}`);
  }

  if (on("HV")) {
    const tally: Record<string, number> = {}; const eg: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const kids: string[] = []; for (let j = 0; j < 3; j += 1) { const x = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", issueDate: lastMonth, lines: [{ description: "งาน", qty: 1, unitPrice: 1_000_000 }] }); await accSvc.issueDocument(T, A, x.id); kids.push(x.id); }
      const g = (await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] })).id;
      const b1 = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 2_140_000, note: "", feeSatang: 0, wht: [], cheque: null }, { clientKey: key() });
      const rs = await Promise.all([grp.voidGroupPayment(T, A, g, b1.batchKey, "x"), accSvc.recordPayment(T, A, kids[2], { paidAt: lastMonth, channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 })]);
      const h = await st(g); const ks = await Promise.all(kids.map(st));
      const truth = ks.reduce((s: number, k: Any) => s + Math.min(k.grandTotal, k.paidTotal), 0);
      const right = h.paidTotal === truth;
      const k = `${rs.map((r: Any) => (r.ok ? "ok" : "fail")).join("|")} head ${right ? "right" : "WRONG"}`;
      tally[k] = (tally[k] ?? 0) + 1;
      if (!right && eg.length < 2) eg.push(`head ${h.status}/${h.paidTotal} vs truth ${truth}`);
    }
    log(`HV voidGroupPayment ∥ recordPayment(other child) ×20: ${JSON.stringify(tally)}${eg.length ? ` · e.g. ${eg.join(" ; ")}` : ""}`);
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
