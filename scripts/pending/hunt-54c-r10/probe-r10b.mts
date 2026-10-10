// C5.4-C round-10 hunter probe B (QC2 only · throwaway tenant · deleted at the end)
//   D2  deposit receipt paid part transfer + part cheque (both orders) → (clear) → bounce: TB since before vs transfer-only control
//   D3  deposit by cheque#1 → bounce → re-pay by cheque#2 → deduct on an invoice → bounce cheque#2 (refused?) → exits
//   L1  service invoice (ON_PAYMENT) paid by cheque → CN on the auto tax invoice (dated yesterday) → policy lock today → bounce? void CN? unlock → exits
//   H1  group head lost update: recordPayment(child1) ∥ recordPayment(child2) ×20 · voidPayment ∥ voidPayment ×20 · purchase twin ×10
//   P2  cash-sale receipt (approveReceiptWithPayments ②): a) by cheque → voidPayment refused? → bounce → TB · b) by transfer → voidPayment → TB
//       c) void the attached cheque payment inside path ② (after issue, before the cheque link) ×8 → what is left
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r10/probe-r10b.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54db-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const on = (k: string) => ONLY.length === 0 || ONLY.includes(k);
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const exp = (await import("@/lib/modules/account/expense" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const pay = (await import("@/lib/modules/account/payment" as string)) as Any;
  const policy = (await import("@/lib/modules/account/policy" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R10", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const vend = await accSvc.createContact({ tenantId: T, systemId: A, kind: "VENDOR", legalType: "COMPANY", name: `ผู้ขาย ${TAG}`, taxId: "0105561222222" });
  const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() + 7 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
  const short = (r: Any) => (r?.ok ? `ok` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 110)})`);
  const tb = async (): Promise<Map<string, number>> => {
    const rows = (await P.$queryRawUnsafe(`SELECT a."code" AS code, COALESCE(l."contactId",'-') AS c, sum(l."debit" - l."credit")::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 GROUP BY 1,2`, A)) as Any[];
    return new Map(rows.map((r) => [`${r.code}${r.c === "-" ? "" : r.c === cust.id ? "@cust" : r.c === vend.id ? "@vend" : "@other"}`, Number(r.n)]));
  };
  const tbDiff = (a: Map<string, number>, b: Map<string, number>) => { const out: string[] = []; for (const k of new Set([...a.keys(), ...b.keys()])) { const d = (b.get(k) ?? 0) - (a.get(k) ?? 0); if (d !== 0) out.push(`${k}:${d}`); } return out.sort(); };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true, grandTotal: true } })) as Any;
  const live = async (id: string) => { const a = await P.accountDocumentPayment.aggregate({ where: { documentId: id, voidedAt: null }, _sum: { amount: true, whtAmountSatang: true } }); return Number(a._sum.amount ?? 0) + Number(a._sum.whtAmountSatang ?? 0); };
  const inv = async (timing: "ON_ISSUE" | "ON_PAYMENT" = "ON_ISSUE", issueDate?: string) => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: timing, ...(issueDate ? { issueDate: new Date(`${issueDate}T00:00:00.000Z`) } : {}), lines: [{ description: "งานบริการ", qty: 1, unitPrice: 10_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  const expDoc = async () => { const ex = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 10_000_000 }] }); const r = await exp.issueExpenseDoc(T, A, ex.id); if (!r.ok) throw new Error(`issue exp: ${r.reason}`); return ex.id as string; };
  let seq = 0;
  const chq = (d = today) => ({ chequeNo: `B${++seq}-${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: d });
  const row = (amt: number, cheque: Any = null, paidAt = today) => ({ paidAt, financeAccountId: bank.id, amountSatang: amt, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque });
  const key = () => `k${randomBytes(5).toString("hex")}`;
  const cqOfDoc = async (id: string) => (await P.accountDocumentPayment.findFirst({ where: { documentId: id, chequeId: { not: null } }, orderBy: { createdAt: "desc" }, select: { chequeId: true } }))?.chequeId as string;
  const mkDep = async (unit = 3_000_000) => {
    const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
    const dep = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "DEPOSIT_RECEIPT", contactId: cust.id, sourceDocId: q.id, vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: unit }] });
    await accSvc.issueDocument(T, A, dep.id); return dep.id as string;
  };

  if (on("D2")) {
    // control: transfer 1,000,000 only (partial deposit)
    { const d = await mkDep(); const b0 = await tb(); const r = await pay.recordPayments(T, A, d, [row(1_000_000)], { keyBase: key() }); log(`D2 control transfer-only partial ${short(r)} → ${JSON.stringify(await st(d))} TBΔ ${JSON.stringify(tbDiff(b0, await tb()))}`); }
    for (const order of ["transfer-first", "cheque-first"] as const) for (const clear of [false, true]) {
      const d = await mkDep(); const b0 = await tb();
      const rows = order === "transfer-first" ? [row(1_000_000), row(2_210_000, chq())] : [row(2_210_000, chq()), row(1_000_000)];
      const r = await pay.recordPayments(T, A, d, rows, { keyBase: key() });
      const cq = await cqOfDoc(d);
      const afterPay = tbDiff(b0, await tb());
      if (clear) { await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq); }
      const afterClear = tbDiff(b0, await tb());
      const b = await cheque.bounceCheque(T, A, cq, "x");
      log(`D2 ${order}${clear ? " + CLEARED" : ""}: pay ${short(r)} → TBΔ ${JSON.stringify(afterPay)}${clear ? ` · after clear ${JSON.stringify(afterClear)} (truth: bank 1010 +3,210,000, 1040 0)` : ""} · bounce ${short(b)} → ${JSON.stringify(await st(d))} live ${await live(d)} · TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (truth ≈ control: only the transfer is real money)`);
    }
  }

  if (on("D3")) {
    const d = await mkDep(); const b0 = await tb();
    const r1 = await pay.recordPayments(T, A, d, [row(3_210_000, chq())], { keyBase: key() }); const c1 = await cqOfDoc(d);
    const bo1 = await cheque.bounceCheque(T, A, c1, "x");
    const r2 = await pay.recordPayments(T, A, d, [row(3_210_000, chq())], { keyBase: key() }); const c2 = await cqOfDoc(d);
    const t2 = tbDiff(b0, await tb());
    const i = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
    const sd = await accSvc.setDocDeposits(T, A, i.id, [{ depositId: d, amountSatang: 3_210_000 }]);
    const is = await accSvc.issueDocument(T, A, i.id);
    const bo2 = await cheque.bounceCheque(T, A, c2, "bank says bounced");
    const vi = await accSvc.voidDocument(T, A, i.id, "to unblock bounce");
    const bo3 = await cheque.bounceCheque(T, A, c2, "bank says bounced");
    log(`D3 cheque#1 ${short(r1)} bounce ${short(bo1)} → re-pay cheque#2 ${short(r2)} TBΔ ${JSON.stringify(t2)} (2110/2200 once?) · deduct on invoice ${short(sd)} issue ${short(is)} → bounce cheque#2 ${short(bo2)} · exit: voidDocument(invoice) ${short(vi)} → bounce again ${short(bo3)} · dep ${JSON.stringify(await st(d))} · TBΔ ${JSON.stringify(tbDiff(b0, await tb()))}`);
  }

  if (on("L1")) {
    const k = await inv("ON_PAYMENT");
    const r = await pay.recordPayments(T, A, k, [row(10_700_000, chq())], { keyBase: key() }); const cq = await cqOfDoc(k);
    const ti = await P.accountDocument.findFirst({ where: { systemId: A, docType: "TAX_INVOICE", sourcePaymentId: { not: null }, sourceDocId: k }, select: { id: true } }) ?? await P.accountDocument.findFirst({ where: { systemId: A, docType: "TAX_INVOICE", status: "ISSUED" }, orderBy: { createdAt: "desc" }, select: { id: true } });
    const cn = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: ti?.id, adjustReason: "ส่วนลด", issueDate: new Date(`${yesterday}T00:00:00.000Z`), vatMode: "EXCLUDE", lines: [{ description: "ส่วนลด", qty: 1, unitPrice: 1_000_000 }] });
    const ci = await accSvc.issueDocument(T, A, cn.id);
    const lk = await policy.savePolicy({ tenantId: T, systemId: A }, { lockBeforeDate: new Date(`${today}T00:00:00.000Z`) });
    const b1 = await cheque.bounceCheque(T, A, cq, "bank");
    const v1 = await accSvc.voidDocument(T, A, cn.id, "to unblock bounce");
    const ul = await policy.savePolicy({ tenantId: T, systemId: A }, { lockBeforeDate: null });
    const v2 = await accSvc.voidDocument(T, A, cn.id, "to unblock bounce");
    const b2 = await cheque.bounceCheque(T, A, cq, "bank");
    log(`L1 pay ${short(r)} · CN (yesterday) on auto TI ${ti ? "" : "(TI not found!) "}${short(ci)} · lock today ${short(lk)} → bounce ${short(b1)} · voidDocument(CN) ${short(v1)} · unlock ${short(ul)} → voidDocument(CN) ${short(v2)} → bounce ${short(b2)} · inv ${JSON.stringify(await st(k))}`);
  }

  if (on("H1")) {
    const trial = async (side: "IN" | "OUT", mode: "pay∥pay" | "void∥void" | "pay∥void", n: number) => {
      const tally: Record<string, number> = {}; const bad: string[] = [];
      for (let i = 0; i < n; i += 1) {
        const kids = side === "IN" ? [await inv(), await inv()] : [await expDoc(), await expDoc()];
        const g = (await grp.createGroupDoc(T, A, { docType: side === "IN" ? "BILLING_NOTE" : "COMBINED_PAYMENT", contactId: side === "IN" ? cust.id : vend.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] })).id;
        const rec = (k: string) => side === "IN" ? accSvc.recordPayment(T, A, k, { channel: "TRANSFER", financeAccountId: bank.id, amount: 10_700_000 }) : exp.recordVendorPayment(T, A, k, { channel: "TRANSFER", financeAccountId: bank.id, amount: 10_700_000 });
        const vd = (k: string, p: string) => side === "IN" ? accSvc.voidPayment(T, A, k, p, "x") : exp.voidVendorPayment(T, A, k, p, "x");
        let rs: Any[] = [];
        if (mode === "pay∥pay") rs = await Promise.all([rec(kids[0]), rec(kids[1])]);
        else {
          const p0 = await rec(kids[0]); const p1 = await rec(kids[1]);
          rs = mode === "void∥void" ? await Promise.all([vd(kids[0], p0.paymentId), vd(kids[1], p1.paymentId)]) : await Promise.all([vd(kids[0], p0.paymentId), rec(kids[0]).then(() => ({ ok: true })).catch(() => ({ ok: false }))]);
        }
        const h = await st(g); const kidSt = await Promise.all(kids.map(st));
        const truthOut = kidSt.reduce((s: number, k: Any) => s + Math.max(0, k.grandTotal - k.paidTotal), 0);
        const truthPaid = h.grandTotal - truthOut; const truthStatus = truthOut === 0 ? "PAID" : truthPaid > 0 ? "PARTIAL" : "AWAITING_PAYMENT";
        const k = `${rs.map((x) => (x.ok ? "ok" : "fail")).join("|")} head ${h.paidTotal === truthPaid && h.status === truthStatus ? "right" : "WRONG"}`;
        tally[k] = (tally[k] ?? 0) + 1;
        if (!(h.paidTotal === truthPaid && h.status === truthStatus) && bad.length < 3) bad.push(`head ${h.status}/${h.paidTotal} vs children truth ${truthStatus}/${truthPaid} (children ${kidSt.map((x: Any) => `${x.status}/${x.paidTotal}`).join(",")})`);
      }
      log(`H1 ${side} ${mode} ×${n}: ${JSON.stringify(tally)}${bad.length ? ` · e.g. ${bad.join(" ; ")}` : ""}`);
    };
    await trial("IN", "pay∥pay", 20); await trial("IN", "void∥void", 20); await trial("OUT", "pay∥pay", 10);
  }

  if (on("P2")) {
    const mkRe = async () => (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 1_000_000 }] })).id as string;
    { // a) by cheque
      const re = await mkRe(); const b0 = await tb();
      const r = await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000, chq())], { keyBase: key() });
      const p = await P.accountDocumentPayment.findFirst({ where: { documentId: re }, select: { id: true, chequeId: true } });
      const v = await accSvc.voidPayment(T, A, re, p.id, "x");
      const b = await cheque.bounceCheque(T, A, p.chequeId, "x");
      log(`P2a cash-sale by cheque ${short(r)} (cheque linked ${!!p.chequeId}) · voidPayment ${short(v)} · bounce ${short(b)} → ${JSON.stringify(await st(re))} · TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (truth: sale stays, customer owes → 1100@cust +1,070,000, 1040 0)`);
    }
    { // b) by transfer → voidPayment
      const re = await mkRe(); const b0 = await tb();
      const r = await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000)], { keyBase: key() });
      const p = await P.accountDocumentPayment.findFirst({ where: { documentId: re }, select: { id: true } });
      const v = await accSvc.voidPayment(T, A, re, p.id, "wrong entry");
      const mid = tbDiff(b0, await tb()); const s1 = await st(re);
      const rp = await accSvc.recordPayment(T, A, re, { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 });
      log(`P2b cash-sale by transfer ${short(r)} → voidPayment ${short(v)} → ${JSON.stringify(s1)} · TBΔ ${JSON.stringify(mid)} (truth: bank 0, 1100@cust +1,070,000 — receipt now shows unpaid) · re-pay ${short(rp)} → TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} (truth: bank +1,070,000 once, 1100 0)`);
    }
    { // c) void inside path ②
      const tally: Record<string, number> = {}; const states: string[] = [];
      for (let i = 0; i < 8; i += 1) {
        const re = await mkRe(); const b0 = await tb();
        let stop = false; let vr: Any = null;
        const poller = (async () => { while (!stop) { const d = await P.accountDocument.findUnique({ where: { id: re }, select: { status: true } }); if (d.status !== "DRAFT") { const p = await P.accountDocumentPayment.findFirst({ where: { documentId: re, voidedAt: null }, select: { id: true, chequeId: true } }); if (p && !p.chequeId) vr = await accSvc.voidPayment(T, A, re, p.id, "window"); return; } } })();
        const r = await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000, chq())], { keyBase: key() });
        stop = true; await poller;
        const p = await P.accountDocumentPayment.findFirst({ where: { documentId: re }, select: { voidedAt: true, chequeId: true } });
        const k = `approve ${short(r).slice(0, 60)} · void ${vr ? short(vr).slice(0, 40) : "none"} · cheque ${p?.chequeId ? "linked" : "none"}`;
        tally[k] = (tally[k] ?? 0) + 1;
        if (vr?.ok && states.length < 2) states.push(`receipt ${JSON.stringify(await st(re))} payment voided ${!!p?.voidedAt} · TBΔ ${JSON.stringify(tbDiff(b0, await tb()))} · retry approve → ${short(await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000, chq())], { keyBase: key() }))}`);
      }
      log(`P2c void inside path ② ×8: ${JSON.stringify(tally)}`);
      for (const s of states) log(`P2c state ${s}`);
    }
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
