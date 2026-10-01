// C5.4-N probe — legal-document counters under concurrency (QC2 only · throwaway tenant · deleted at the end · NO src edits)
//   Question: do tax-invoice / receipt / WHT-cert (WTI customer side + 50 ทวิ vendor side) / purchase-TI numbers COLLIDE or GAP
//             under 3 concurrent issuers today, and how long is a legal counter held inside a long money transaction?
//   M  mechanism, isolated from the journal-number race (no posting):
//        M1 doc-numbering.issueDocNo (the `INSERT … ON CONFLICT DO UPDATE` counter used by service.ts / expense.ts) — 3 actors ×20,
//           each in its own transaction, 1 in 4 rolled back on purpose; the first call of the run also races the FIRST row of the period
//        M2 the Prisma `accountDocSequence.upsert({ update: { lastNo: { increment: 1 } } })` shape of wht.ts:216 / wht.ts:314 /
//           product.ts:676 (same shape, private period key so no product counter is touched) — same load
//   P  product paths, 3 actors ×20 each, one kind at a time:
//        P1 TAX_INVOICE create+issueDocument · P2 RECEIPT approveReceiptWithPayments · P3 WTI via recordPayment(WHT) on ON_ISSUE invoices ·
//        P4 auto TAX_INVOICE via recordPayment on ON_PAYMENT service invoices · P5 50 ทวิ via recordVendorPayment(WHT) ·
//        P6 PURCHASE_TAX_INVOICE via issueExpenseDoc (EXPENSE, vatPurchaseMode AWAITING)
//        → ok/fail · raw error classes · numbers unique? gapless per series? ISSUED rows without a number? counter lastNo = max?
//   H  hold time: one 40-child ON_PAYMENT cheque batch (40 auto tax invoices in one transaction); 2 s after it starts:
//        (i) a bare transaction `SELECT … FROM "AccountDocSequence" … FOR UPDATE` on the TAX_INVOICE counter row — how long it waits
//        (ii) a single recordPayment on another ON_PAYMENT invoice — duration, result, raw class
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54n/probe-legal-counters.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rawErrors: string[] = [];
const origTx = P.$transaction.bind(P);
P.$transaction = async (...a: Any[]) => { try { return await origTx(...a); } catch (e) { rawErrors.push(`${String((e as Any)?.code ?? "")}|${String((e as Any)?.meta?.modelName ?? "")}|${String((e as Any)?.message ?? e).replace(/\s+/g, " ").slice(0, 200)}`); throw e; } };
const cls = (list: string[]) => { const m: Record<string, number> = {}; for (const e of list) { const k = /INDUCED/.test(e) ? "induced-rollback" : /40P01|deadlock/i.test(e) ? "DEADLOCK" : /P2002/.test(e) ? (/JournalEntry|docNo.*systemId|systemId.*docNo/i.test(e) && !/DocSequence/i.test(e) ? `P2002 ${/AccountDocument\b|accountDocument\./.test(e) ? "document no." : "journal no."}` : /DocSequence/i.test(e) ? "P2002 counter row" : `P2002 other:${e.slice(0, 80)}`) : /P2028|P2034|timeout|expired|Transaction already closed/i.test(e) ? "TX-TIMEOUT/CONFLICT" : /[ก-๙]/.test(e.slice(0, 80)) ? "thai-refusal" : `other:${e.slice(0, 90)}`; m[k] = (m[k] ?? 0) + 1; } return m; };
const TAG = `qc-c54np-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const on = (k: string) => ONLY.length === 0 || ONLY.includes(k);
const tail = (s: string | null | undefined) => { const m = /(\d+)\s*$/.exec(s ?? ""); return m ? Number(m[1]) : NaN; };
const seriesOf = (s: string) => s.replace(/(\d+)\s*$/, "");
/** numbers per series: unique? contiguous from 1? */
const audit = (nos: (string | null)[]) => {
  const by = new Map<string, number[]>(); let nulls = 0;
  for (const n of nos) { if (!n) { nulls += 1; continue; } const k = seriesOf(n); by.set(k, [...(by.get(k) ?? []), tail(n)]); }
  const out: string[] = [];
  for (const [k, list] of by) {
    const s = [...list].sort((a, b) => a - b); const dup = s.filter((x, i) => i > 0 && x === s[i - 1]).length;
    const missing: number[] = []; for (let i = 1, j = 0; i <= (s[s.length - 1] ?? 0) && missing.length < 15; i += 1) { while (j < s.length && s[j]! < i) j += 1; if (s[j] !== i) missing.push(i); }
    out.push(`${k}… n=${s.length} max=${s[s.length - 1]} dup=${dup} gaps=${missing.length ? `[${missing.join(",")}]` : "none"}`);
  }
  return { text: `${out.join(" | ") || "(none)"}${nulls ? ` · ${nulls} without number` : ""}`, nulls };
};
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const exp = (await import("@/lib/modules/account/expense" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
  const pay = (await import("@/lib/modules/account/payment" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const numbering = (await import("@/lib/modules/account/doc-numbering" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC C5.4-N", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const vend = await accSvc.createContact({ tenantId: T, systemId: A, kind: "VENDOR", legalType: "COMPANY", name: `ผู้ขาย ${TAG}`, taxId: "0105562222222" });
  const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const key = () => `k${randomBytes(5).toString("hex")}`;
  let seq = 0;
  const chq = () => ({ chequeNo: `N${++seq}-${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: today });
  const inv = async (timing: "ON_ISSUE" | "ON_PAYMENT") => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: timing, lines: [{ description: timing === "ON_PAYMENT" ? "งานบริการ" : "สินค้า", qty: 1, unitPrice: 1_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(`issue invoice: ${r.reason}`); return d.id as string; };
  const draft = (amount: number, wht = 0) => ({ paidAt: today, financeAccountId: bank.id, amountSatang: amount, whtAmountSatang: wht, whtRateBp: wht ? 300 : null, whtIncomeType: wht ? "M40_2" : null, feeSatang: 0, note: "", cheque: null });
  /** 3 actors, each runs its 20 items one after another; all 3 in parallel */
  const three = async <X,>(items: X[], fn: (x: X) => Promise<Any>) => {
    const tally = { ok: 0, fail: 0, reasons: {} as Record<string, number>, ms: [] as number[] };
    const per = Math.ceil(items.length / 3);
    await Promise.all([0, 1, 2].map(async (a) => { for (const x of items.slice(a * per, (a + 1) * per)) { const t0 = Date.now(); let r: Any; try { r = await fn(x); } catch (e) { r = { ok: false, reason: `THROW ${(e as Error)?.message ?? e}` }; } tally.ms.push(Date.now() - t0); if (r?.ok) tally.ok += 1; else { tally.fail += 1; const k = String(r?.reason ?? r).replace(/[A-Z]{2,4}-?\d{4,6}-?\d{0,2}-?\d{3,5}/g, "#").slice(0, 90); tally.reasons[k] = (tally.reasons[k] ?? 0) + 1; } } }));
    return tally;
  };
  const tl = (t: Any) => `ok ${t.ok}/${t.ok + t.fail}${t.fail ? ` · user-visible ${JSON.stringify(t.reasons)}` : ""} · p50 ${[...t.ms].sort((a: number, b: number) => a - b)[Math.floor(t.ms.length / 2)] ?? 0} ms max ${Math.max(0, ...t.ms)} ms`;
  const counters = async (docType: string) => (await P.accountDocSequence.findMany({ where: { systemId: A, docType }, select: { periodKey: true, prefix: true, lastNo: true } })).map((r: Any) => `${r.prefix}@${r.periodKey}=${r.lastNo}`).join(",");
  const docsOf = async (docType: string) => (await P.accountDocument.findMany({ where: { systemId: A, docType, status: { notIn: ["DRAFT"] } }, select: { docNo: true } })).map((r: Any) => r.docNo as string | null);

  if (on("M")) {
    // M1 — issueDocNo, the shared counter of service.ts/expense.ts (TAX_INVOICE · fresh system ⇒ the first call races the first row)
    for (const [name, docType, reserve] of [
      ["M1 issueDocNo(TAX_INVOICE)", "TAX_INVOICE", (tx: Any) => numbering.issueDocNo(tx, { tenantId: T, systemId: A, docType: "TAX_INVOICE", fallbackPrefix: "TX", date: new Date() })],
      ["M2 prisma upsert+increment (wht.ts/product.ts shape)", "WHT_CERT", async (tx: Any) => { const s = await tx.accountDocSequence.upsert({ where: { systemId_docType_periodKey: { systemId: A, docType: "WHT_CERT", periodKey: `QCP:${TAG}` } }, create: { tenantId: T, systemId: A, docType: "WHT_CERT", prefix: "QCP", periodKey: `QCP:${TAG}`, lastNo: 1 }, update: { lastNo: { increment: 1 } } }); return `QCP-${String(s.lastNo).padStart(4, "0")}`; }],
    ] as [string, string, (tx: Any) => Promise<string>][]) {
      rawErrors.length = 0;
      const committed: string[] = []; let induced = 0; let other = 0;
      const t0 = Date.now();
      await Promise.all([0, 1, 2].map(async (a) => {
        for (let i = 0; i < 20; i += 1) {
          const roll = (a * 20 + i) % 4 === 3;
          try {
            const no = await P.$transaction(async (tx: Any) => { const n = await reserve(tx); await sleep(40); if (roll) throw new Error("INDUCED rollback after the number was reserved"); return n; });
            committed.push(no);
          } catch (e) { if (/INDUCED/.test(String((e as Error)?.message))) induced += 1; else other += 1; }
        }
      }));
      const row = docType === "WHT_CERT" ? (await P.accountDocSequence.findFirst({ where: { systemId: A, periodKey: `QCP:${TAG}` }, select: { lastNo: true } }))?.lastNo : await counters(docType);
      log(`${name}: ${committed.length} committed · ${induced} induced rollbacks · ${other} other failures in ${Date.now() - t0} ms · raw ${JSON.stringify(cls(rawErrors))} · numbers ${audit(committed).text} · counter row ${row}`);
    }
    // M3 — the counter row is a lock held to commit: a holder that keeps its transaction open 3 s makes the next issuer wait ~3 s
    const h0 = Date.now(); let waited = -1;
    await Promise.all([
      P.$transaction(async (tx: Any) => { await numbering.issueDocNo(tx, { tenantId: T, systemId: A, docType: "TAX_INVOICE", fallbackPrefix: "TX", date: new Date() }); await sleep(3_000); throw new Error("INDUCED holder rollback"); }).catch(() => undefined),
      (async () => { await sleep(300); const t0 = Date.now(); await P.$transaction(async (tx: Any) => { await numbering.issueDocNo(tx, { tenantId: T, systemId: A, docType: "TAX_INVOICE", fallbackPrefix: "TX", date: new Date() }); throw new Error("INDUCED waiter rollback"); }).catch(() => undefined); waited = Date.now() - t0; })(),
    ]);
    log(`M3 counter held 3 s by an open transaction → the next issuer of the same docType waited ${waited} ms (total ${Date.now() - h0} ms) · counter now ${await counters("TAX_INVOICE")}`);
    // put the TAX_INVOICE counter back to the committed reality so P1/P4 series start from M1's numbers (counter rows are tenant-scoped; nothing else read them)
  }

  if (on("P")) {
    // P1 — standalone tax invoices
    { const ids: string[] = []; for (let i = 0; i < 60; i += 1) ids.push((await accSvc.createDocument({ tenantId: T, systemId: A, docType: "TAX_INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขาย", qty: 1, unitPrice: 100_000 }] })).id);
      rawErrors.length = 0; const t = await three(ids, (id) => accSvc.issueDocument(T, A, id));
      log(`P1 TAX_INVOICE issueDocument ×3×20: ${tl(t)} · raw ${JSON.stringify(cls(rawErrors))} · numbers ${audit(await docsOf("TAX_INVOICE")).text} · counter ${await counters("TAX_INVOICE")}`); }
    // P2 — cash-sale receipts (approve = attach payment + issue)
    { const ids: string[] = []; for (let i = 0; i < 60; i += 1) ids.push((await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 100_000 }] })).id);
      rawErrors.length = 0; const t = await three(ids, (id) => pay.approveReceiptWithPayments(T, A, id, [draft(107_000)], { keyBase: key() }));
      log(`P2 RECEIPT approveReceiptWithPayments ×3×20: ${tl(t)} · raw ${JSON.stringify(cls(rawErrors))} · numbers ${audit(await docsOf("RECEIPT")).text} · counter ${await counters("RECEIPT")}`); }
    // P3 — WTI certificates (customer withholds 3 %) on ON_ISSUE invoices (no auto TI)
    { const ids: string[] = []; for (let i = 0; i < 60; i += 1) ids.push(await inv("ON_ISSUE"));
      rawErrors.length = 0; const t = await three(ids, (id) => accSvc.recordPayment(T, A, id, { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_040_000, whtAmountSatang: 30_000, whtRateBp: 300, whtIncomeType: "M40_2" }));
      const wti = (await docsOf("WHT_CERT")).filter((n: string | null) => !n || /^WTI/.test(n)); // ORACLE-EDIT C5.4-N: type annotation only (TS7006 broke pnpm typecheck; present on 96a4c28f) — probe logic unchanged
      log(`P3 WTI cert via recordPayment(WHT) ×3×20: ${tl(t)} · raw ${JSON.stringify(cls(rawErrors))} · numbers ${audit(wti).text} · counter ${await counters("WHT_CERT")}`); }
    // P4 — auto tax invoice per payment on ON_PAYMENT service invoices
    { const ids: string[] = []; for (let i = 0; i < 60; i += 1) ids.push(await inv("ON_PAYMENT"));
      rawErrors.length = 0; const t = await three(ids, (id) => accSvc.recordPayment(T, A, id, { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 }));
      log(`P4 auto TAX_INVOICE via recordPayment(ON_PAYMENT) ×3×20: ${tl(t)} · raw ${JSON.stringify(cls(rawErrors))} · numbers (all TIs incl. P1) ${audit(await docsOf("TAX_INVOICE")).text} · counter ${await counters("TAX_INVOICE")}`); }
    // P5 — 50 ทวิ on vendor payments with WHT
    { const ids: string[] = [];
      for (let i = 0; i < 60; i += 1) { const d = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 1_000_000 }] }); const r = await exp.issueExpenseDoc(T, A, d.id); if (!r.ok) throw new Error(`issue expense: ${r.reason}`); ids.push(d.id); }
      rawErrors.length = 0; const t = await three(ids, (id) => exp.recordVendorPayment(T, A, id, { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_040_000, whtAmountSatang: 30_000, whtRateBp: 300, whtIncomeType: "M40_2" }));
      const whts = (await docsOf("WHT_CERT")).filter((n: string | null) => !n || !/^WTI/.test(n)); // ORACLE-EDIT C5.4-N: type annotation only (TS7006 broke pnpm typecheck; present on 96a4c28f) — probe logic unchanged
      log(`P5 50 ทวิ via recordVendorPayment(WHT) ×3×20: ${tl(t)} · raw ${JSON.stringify(cls(rawErrors))} · numbers ${audit(whts).text} · counter ${await counters("WHT_CERT")}`); }
    // P6 — purchase tax invoices opened when an AWAITING-VAT expense is issued
    { const ids: string[] = []; for (let i = 0; i < 60; i += 1) ids.push((await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: "AWAITING", lines: [{ description: "ค่าบริการ รอใบกำกับ", qty: 1, unitPrice: 500_000 }] })).id);
      rawErrors.length = 0; const t = await three(ids, (id) => exp.issueExpenseDoc(T, A, id));
      log(`P6 PURCHASE_TAX_INVOICE via issueExpenseDoc(AWAITING) ×3×20: ${tl(t)} · raw ${JSON.stringify(cls(rawErrors))} · numbers ${audit(await docsOf("PURCHASE_TAX_INVOICE")).text} · counter ${await counters("PURCHASE_TAX_INVOICE")} · expense docs numbered ${audit((await docsOf("EXPENSE"))).text}`); }
  }

  if (on("H")) {
    const kids: string[] = []; for (let i = 0; i < 40; i += 1) kids.push(await inv("ON_PAYMENT"));
    const other = await inv("ON_PAYMENT");
    const g = await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] });
    if (!g.ok) throw new Error(`group: ${g.reason}`);
    // make sure the period's TAX_INVOICE counter row exists before the batch (P4/M1 normally created it)
    const pk = `${today.slice(0, 7)}`;
    rawErrors.length = 0;
    const t0 = Date.now(); let batchMs = 0; let batchRes: Any; let rowWait = -1; let rowNote = ""; let singleMs = 0; let singleRes: Any;
    await Promise.all([
      (async () => { batchRes = await grp.recordGroupPayment(T, A, g.id, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 40 * 1_070_000, note: "", feeSatang: 0, wht: [], cheque: chq() }, { clientKey: key() }); batchMs = Date.now() - t0; })(),
      (async () => { await sleep(2_000); const s0 = Date.now(); try { const rows = await P.$transaction(async (tx: Any) => tx.$queryRawUnsafe(`SELECT "lastNo" FROM "AccountDocSequence" WHERE "systemId" = $1 AND "docType" = 'TAX_INVOICE' AND "periodKey" = $2 FOR UPDATE`, A, pk), { maxWait: 20_000, timeout: 60_000 }); rowNote = `row ${JSON.stringify(rows)}`; } catch (e) { rowNote = `err ${String((e as Error)?.message).slice(0, 80)}`; } rowWait = Date.now() - s0; })(),
      (async () => { await sleep(2_000); const s0 = Date.now(); singleRes = await accSvc.recordPayment(T, A, other, { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 }); singleMs = Date.now() - s0; })(),
    ]);
    log(`H 40-child ON_PAYMENT cheque batch: ${batchRes?.ok ? "ok" : `FAIL(${String(batchRes?.reason).slice(0, 90)})`} in ${(batchMs / 1000).toFixed(1)} s · bare FOR UPDATE on the TAX_INVOICE counter row started at +2 s waited ${(rowWait / 1000).toFixed(1)} s (${rowNote}) · concurrent single ON_PAYMENT recordPayment started at +2 s: ${singleRes?.ok ? "ok" : `FAIL(${String(singleRes?.reason).slice(0, 90)})`} in ${(singleMs / 1000).toFixed(1)} s · raw ${JSON.stringify(cls(rawErrors))} · TI numbers ${audit(await docsOf("TAX_INVOICE")).text}`);
    // control: what the same single costs with nobody else running
    const s0 = Date.now(); const ctl = await accSvc.recordPayment(T, A, await inv("ON_PAYMENT"), { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 });
    log(`H control: a single ON_PAYMENT recordPayment alone: ${ctl.ok ? "ok" : `FAIL(${ctl.reason})`} in ${((Date.now() - s0) / 1000).toFixed(1)} s`);
  }
} catch (e) { log(`FATAL ${e instanceof Error ? e.stack : String(e)}`); }
finally {
  if (T) { const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined); await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0; for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    log(`CLEAN left=${left} tenant=${await P.tenant.count({ where: { id: T } })}`); }
  await prisma.$disconnect();
}
process.exit(0);
