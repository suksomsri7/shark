// C5.4-C round-8 hunter probe (QC2 only · throwaway tenant · deleted at the end) — attacks the r7 cheque locks.
//   G  group (billing note) payment by cheque: voidGroupPayment with a live cheque (partial write? B2c bypass?) · bounce of the group cheque
//   D  concurrent pairs on the same invoice/cheque (deadlock / generic error / paidTotal ≠ live payments)
//   E  events exactly once under bounce retries · bounce after a partial CN
//   V  vendor (OUT) cheque parity: voidCheque ∥ voidCheque · voidCheque ∥ voidVendorPayment
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r8/probe-r8.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54cu-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const exp = (await import("@/lib/modules/account/expense" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R8", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const vend = await accSvc.createContact({ tenantId: T, systemId: A, kind: "VENDOR", legalType: "COMPANY", name: `ผู้ขาย ${TAG}`, taxId: "0105561222222" });
  const inv = async () => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true, grandTotal: true } })) as Any;
  const live = async (id: string) => { const a = await P.accountDocumentPayment.aggregate({ where: { documentId: id, voidedAt: null }, _sum: { amount: true, whtAmountSatang: true } }); return Number(a._sum.amount ?? 0) + Number(a._sum.whtAmountSatang ?? 0); };
  const ledger = async (code: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = $2`, A, code)) as Any[])[0]?.n);
  const short = (r: Any) => (r?.ok ? "ok" : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 70)})`);
  const cqIn = (docId: string | null, amount: number) => cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `C${randomBytes(3).toString("hex")}`, bankName: "KBank", chequeDate: new Date(), amount, documentId: docId });
  const outSum = async (ids: string[]) => { let s = 0; for (const id of ids) { const f = await accSvc.paymentTargetOf(T, A, id); s += accSvc.paymentOutstandingOf(f.target); } return s; };
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

  // ── G: group payment by cheque ──
  const mkGroup = async () => {
    const i1 = await inv(); const i2 = await inv();
    const g = await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: [i1, i2], createdById: null, source: "MANUAL", tags: [] });
    if (!g.ok) throw new Error(`group: ${g.reason}`);
    const ar0 = await ledger("1100");
    const r = await grp.recordGroupPayment(T, A, g.id, { paidAt: today, financeAccountId: null, tieOffSatang: 21_400_000, note: "", feeSatang: 0, wht: [], cheque: { chequeNo: `G${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: today } }, { clientKey: randomBytes(6).toString("hex") });
    if (!r.ok) throw new Error(`group pay: ${r.reason}`);
    const pays = await P.accountDocumentPayment.findMany({ where: { documentId: { in: [i1, i2] } }, select: { id: true, documentId: true, chequeId: true, amount: true } });
    const cqId = pays.find((p: Any) => p.chequeId)?.chequeId as string;
    const chq = await P.accountCheque.findUnique({ where: { id: cqId }, select: { amount: true, status: true } });
    return { g, i1, i2, r, pays, cqId, chq, ar0 };
  };
  {
    const x = await mkGroup();
    log(`G0 group cheque: cheque amount=${x.chq.amount} · child payments=${x.pays.length} linked-to-cheque=${x.pays.filter((p: Any) => p.chequeId).length}`);
    const v = await grp.voidGroupPayment(T, A, x.g.id, x.r.batchKey, "x");
    log(`G1 voidGroupPayment with live cheque → ${short(v)} · i1=${JSON.stringify(await st(x.i1))} i2=${JSON.stringify(await st(x.i2))} (partial write if one child voided and the other not)`);
    const vDirect = await accSvc.voidPayment(T, A, x.pays.find((p: Any) => !p.chequeId)?.documentId ?? x.i2, x.pays.find((p: Any) => !p.chequeId)?.id, "x");
    log(`G2 voidPayment on the NON-linked child cheque payment while cheque ON_HAND → ${short(vDirect)} (B2c bypass if ok)`);
  }
  {
    const x = await mkGroup();
    const b = await cheque.bounceCheque(T, A, x.cqId, "x");
    const o = await outSum([x.i1, x.i2]);
    log(`G3 bounce group cheque (21,400,000) → ${short(b)} · i1=${JSON.stringify(await st(x.i1))} i2=${JSON.stringify(await st(x.i2))} · subledger outstanding Σ=${o} (true 21400000) · GL AR Δ since before payment=${(await ledger("1100")) - x.ar0} (should equal subledger Σ − 21400000 + 21400000 = +0 vs start)`);
  }

  // ── D: concurrent pairs ──
  const bad: string[] = [];
  const check = async (name: string, ids: string[]) => { for (const id of ids) { const s = await st(id); const l = await live(id); if (s.paidTotal !== l) bad.push(`${name}: paidTotal ${s.paidTotal} ≠ live ${l}`); } };
  const pairs: [string, () => Promise<[string[], () => Promise<Any>, () => Promise<Any>]>][] = [
    ["bounce(A) ∥ voidPayment(transfer) same inv", async () => { const i = await inv(); const p = await accSvc.recordPayment(T, A, i, { channel: "TRANSFER", amount: 3_000_000 }); const c = await cqIn(i, 3_000_000); return [[i], () => cheque.bounceCheque(T, A, c.id, "x"), () => accSvc.voidPayment(T, A, i, p.paymentId, "x")]; }],
    ["bounce ∥ recordPayment same inv", async () => { const i = await inv(); const c = await cqIn(i, 3_000_000); return [[i], () => cheque.bounceCheque(T, A, c.id, "x"), () => accSvc.recordPayment(T, A, i, { channel: "TRANSFER", amount: 7_700_000 })]; }],
    ["bounce ∥ issueCN same inv", async () => { const i = await inv(); const c = await cqIn(i, 5_000_000); const cn = (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: i, adjustReason: "x", vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 5_000_000 }] })).id; return [[i], () => cheque.bounceCheque(T, A, c.id, "x"), () => accSvc.issueDocument(T, A, cn)]; }],
    ["clear ∥ bounce same cheque", async () => { const i = await inv(); const c = await cqIn(i, 3_000_000); return [[i], () => cheque.clearCheque(T, A, c.id), () => cheque.bounceCheque(T, A, c.id, "x")]; }],
    ["deposit ∥ bounce same cheque", async () => { const i = await inv(); const c = await cqIn(i, 3_000_000); return [[i], () => cheque.depositCheque(T, A, c.id), () => cheque.bounceCheque(T, A, c.id, "x")]; }],
    ["bounce(A) ∥ bounce(B) same inv", async () => { const i = await inv(); const a = await cqIn(i, 3_000_000); const b = await cqIn(i, 2_000_000); return [[i], () => cheque.bounceCheque(T, A, a.id, "x"), () => cheque.bounceCheque(T, A, b.id, "x")]; }],
    ["bounce ∥ createCheque same inv", async () => { const i = await inv(); const a = await cqIn(i, 3_000_000); return [[i], () => cheque.bounceCheque(T, A, a.id, "x"), () => cqIn(i, 7_700_000)]; }],
    ["form-cheque: bounce ∥ voidPayment(same pay)", async () => { const i = await inv(); const p = await accSvc.recordPayment(T, A, i, { channel: "CHEQUE", amount: 3_000_000 }); const c = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `F${randomBytes(2).toString("hex")}`, bankName: "B", chequeDate: new Date(), amount: 3_000_000, documentId: i, paymentId: p.paymentId }); return [[i], () => cheque.bounceCheque(T, A, c.id, "x"), () => accSvc.voidPayment(T, A, i, p.paymentId, "x")]; }],
  ];
  for (const [name, mk] of pairs) {
    const tally: Record<string, number> = {};
    for (let k = 0; k < 10; k += 1) {
      const [ids, a, b] = await mk();
      const r = await Promise.all([a(), b()]);
      const key = r.map((x: Any) => (x?.ok ? "ok" : /deadlock|40P01|P2034|ไม่สำเร็จ$/i.test(String(x?.reason)) ? `GENERIC(${String(x?.reason).slice(0, 50)})` : "refused")).join("|");
      tally[key] = (tally[key] ?? 0) + 1;
      await check(name, ids);
    }
    log(`D ${name}: ${JSON.stringify(tally)}`);
  }
  log(`D invariant paidTotal == Σ live payments: ${bad.length === 0 ? "held for all" : bad.slice(0, 5).join(" ; ")}`);

  // ── E: events once + bounce after partial CN ──
  {
    const i = await inv(); const c = await cqIn(i, 3_000_000);
    const pay = await P.accountDocumentPayment.findFirst({ where: { chequeId: c.id }, select: { id: true } });
    const r = await Promise.all([1, 2, 3].map(() => cheque.bounceCheque(T, A, c.id, "x")));
    const r2 = await cheque.bounceCheque(T, A, c.id, "retry");
    const ev = await P.outboxEvent.count({ where: { tenantId: T, type: "account.payment.voided", idempotencyKey: `account.payment.voided#${pay.id}` } });
    const bj = await P.accountJournalEntry.count({ where: { systemId: A, refType: "AccountCheque", refId: c.id } }).catch(() => "?");
    log(`E1 3× concurrent bounce ${r.map(short).join("|")} · retry → ${short(r2)} · payment.voided events=${ev} (expect 1) · cheque journal entries=${bj} (expect 2) · INV=${JSON.stringify(await st(i))} live=${await live(i)}`);
    const i2 = await inv();
    const cn = (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: i2, adjustReason: "x", vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 5_000_000 }] })).id;
    await accSvc.issueDocument(T, A, cn);
    const c2 = await cqIn(i2, 5_350_000); const s1 = await st(i2);
    const paidEv = await P.outboxEvent.count({ where: { tenantId: T, idempotencyKey: `account.invoice.paid#${i2}` } });
    const b2 = await cheque.bounceCheque(T, A, c2.id, "x"); const s2 = await st(i2);
    const f = await accSvc.paymentTargetOf(T, A, i2);
    log(`E2 CN 5,350,000 + cheque remainder → INV=${s1.status} invoice.paid=${paidEv} · bounce=${short(b2)} → INV=${s2.status} paid=${s2.paidTotal} outstanding=${accSvc.paymentOutstandingOf(f.target)} (expect AWAITING_PAYMENT / 5350000)`);
  }

  // ── V: vendor side parity ──
  {
    const vt: Record<string, number> = {}; const vbad: string[] = [];
    for (let k = 0; k < 8; k += 1) {
      const d = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 1_000_000 }] });
      const is = await exp.issueExpenseDoc(T, A, d.id); if (!is.ok) throw new Error(`issue exp: ${is.reason}`);
      const c = await cheque.createCheque({ tenantId: T, systemId: A, direction: "OUT", chequeNo: `V${randomBytes(2).toString("hex")}`, bankName: "B", chequeDate: new Date(), amount: 1_070_000, documentId: d.id });
      if (!c.ok) throw new Error(`vendor cheque: ${c.reason}`);
      const pay = await P.accountDocumentPayment.findFirst({ where: { chequeId: c.id }, select: { id: true } });
      const r = k % 2 === 0 ? await Promise.all([cheque.voidCheque(T, A, c.id, "x"), cheque.voidCheque(T, A, c.id, "x")]) : await Promise.all([cheque.voidCheque(T, A, c.id, "x"), exp.voidVendorPayment(T, A, d.id, pay.id, "x")]);
      const key = `${k % 2 === 0 ? "void∥void" : "voidCheque∥voidVendorPayment"} ${r.map((x: Any) => (x.ok ? "ok" : /ไม่สำเร็จ$|deadlock/i.test(String(x.reason)) ? "GENERIC" : "refused")).join("|")}`;
      vt[key] = (vt[key] ?? 0) + 1;
      const s = await st(d.id); const l = await live(d.id); if (s.paidTotal !== l) vbad.push(`paid ${s.paidTotal} live ${l}`);
    }
    log(`V vendor: ${JSON.stringify(vt)} · paidTotal==live: ${vbad.length === 0 ? "held" : vbad.join(";")}`);
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
