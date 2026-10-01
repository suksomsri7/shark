// C5.4-C round-10 hunter probe G (QC2 only · throwaway tenant · deleted at the end)
//   G5  one-tx group payment of 100 service invoices (auto TI) with WHT + cheque — past the 40 s budget? what is written?
//   G6  deadlock pairings ×20 around the group-head sync: bounce(batch 1 on a,b) ∥ recordPayment(c) · bounce(batch 1) ∥ bounce(batch 2 on c,d) ·
//       bounce(batch 1) ∥ voidPayment(c) · recordPayment(a) ∥ recordPayment(b) (different months)
//   H4  credit note on a child: head re-synced? (child 2 fully credited after child 1 paid ⇒ truth PAID)
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r10/probe-r10g.mts
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
P.$transaction = async (...a: Any[]) => { try { return await origTx(...a); } catch (e) { rawErrors.push(`${String((e as Any)?.code ?? "")}|${String((e as Any)?.message ?? e).replace(/\s+/g, " ").slice(0, 140)}`); throw e; } };
const TAG = `qc-hunt54dg-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const on = (k: string) => ONLY.length === 0 || ONLY.includes(k);
const cls = (list: string[]) => { const m: Record<string, number> = {}; for (const e of list) { const k = /40P01|deadlock/i.test(e) ? "DEADLOCK" : /P2002/.test(e) ? "P2002" : /P2028|timeout|expired|closed/i.test(e) ? "TX-TIMEOUT" : /[ก-๙]/.test(e.slice(0, 60)) ? "thai-refusal" : `other:${e.slice(0, 80)}`; m[k] = (m[k] ?? 0) + 1; } return m; };
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R10", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const lastMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 15));
  const short = (r: Any) => (r?.ok ? `ok${r.recorded !== undefined ? `(${r.recorded})` : ""}` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 90)})`);
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true, grandTotal: true } })) as Any;
  const inv = async (timing: "ON_ISSUE" | "ON_PAYMENT" = "ON_ISSUE", issueDate?: Date) => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: timing, ...(issueDate ? { issueDate } : {}), lines: [{ description: "งานบริการ", qty: 1, unitPrice: 1_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  const mkGroup = async (kids: string[]) => { const g = await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] }); if (!g.ok) throw new Error(`group: ${g.reason}`); return g.id as string; };
  let seq = 0;
  const chq = () => ({ chequeNo: `G${++seq}-${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: today });
  const key = () => `k${randomBytes(5).toString("hex")}`;

  if (on("G5")) {
    const n = 100; const kids: string[] = []; for (let i = 0; i < n; i += 1) kids.push(await inv("ON_PAYMENT"));
    const g = await mkGroup(kids); rawErrors.length = 0;
    const je0 = await P.accountJournalEntry.count({ where: { systemId: A } }); const ob0 = await P.outboxEvent.count({ where: { tenantId: T } });
    const t0 = Date.now();
    const r = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: n * 1_070_000, note: "", feeSatang: 0, wht: kids.map((k) => ({ childDocId: k, incomeType: "M40_2", rateBp: 300, amountSatang: 30_000 })), cheque: chq() }, { clientKey: key() });
    const ms = Date.now() - t0;
    log(`G5 n=${n}: ${short(r)} after ${(ms / 1000).toFixed(1)} s · payments ${await P.accountDocumentPayment.count({ where: { documentId: { in: kids } } })} · JE +${(await P.accountJournalEntry.count({ where: { systemId: A } })) - je0} · outbox +${(await P.outboxEvent.count({ where: { tenantId: T } })) - ob0} · head ${JSON.stringify(await st(g))} · raw ${JSON.stringify(cls(rawErrors))}`);
    // the same money as 2 batches of 50 still works?
    const r1 = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 50 * 1_070_000, note: "", feeSatang: 0, wht: [], cheque: chq() }, { clientKey: key() });
    log(`G5 workaround: first 50 only → ${short(r1)}`);
  }

  if (on("G6")) {
    const pairs: [string, (x: Any) => Promise<Any>, (x: Any) => Promise<Any>][] = [
      ["bounce(batch1 a,b) ∥ recordPayment(c)", (x) => cheque.bounceCheque(T, A, x.cq1, "x"), (x) => accSvc.recordPayment(T, A, x.kids[2], { paidAt: lastMonth, channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 })],
      ["bounce(batch1 a,b) ∥ bounce(batch2 c,d)", (x) => cheque.bounceCheque(T, A, x.cq1, "x"), (x) => cheque.bounceCheque(T, A, x.cq2, "x")],
      ["bounce(batch1 a,b) ∥ voidPayment(e transfer)", (x) => cheque.bounceCheque(T, A, x.cq1, "x"), (x) => accSvc.voidPayment(T, A, x.kids[4], x.ePay, "x")],
    ];
    for (const [name, f1, f2] of pairs) {
      rawErrors.length = 0; const tally: Record<string, number> = {};
      for (let i = 0; i < 20; i += 1) {
        const kids = [await inv(), await inv(), await inv(), await inv(), await inv()];
        const g = await mkGroup(kids);
        const x: Any = { kids };
        // batch 1 pays FIFO a,b ; batch 2 pays c,d (needs pay-2 after batch 1 so FIFO moves on) ; e by transfer
        const b1 = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 2_140_000, note: "", feeSatang: 0, wht: [], cheque: chq() }, { clientKey: key() });
        const b2 = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 2_140_000, note: "", feeSatang: 0, wht: [], cheque: chq() }, { clientKey: key() });
        if (!b1.ok || !b2.ok) { tally[`setup fail ${short(b1)} ${short(b2)}`] = (tally[`setup fail`] ?? 0) + 1; continue; }
        const cqOf = async (bk: string) => (await P.accountDocumentPayment.findFirst({ where: { tenantId: T, idempotencyKey: { startsWith: `${bk}#` }, chequeId: { not: null } }, select: { chequeId: true } })).chequeId;
        x.cq1 = await cqOf(b1.batchKey); x.cq2 = await cqOf(b2.batchKey);
        const e = await P.accountDocumentPayment.findFirst({ where: { tenantId: T, idempotencyKey: { startsWith: `${b2.batchKey}#` } }, select: { id: true } });
        x.ePay = (await accSvc.recordPayment(T, A, kids[4], { paidAt: lastMonth, channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 })).paymentId;
        void e;
        const rs = await Promise.all([f1(x), f2(x)]);
        const h = await st(g); const kidSt = await Promise.all(kids.map(st));
        const truthOut = kidSt.reduce((s: number, k: Any) => s + Math.max(0, k.grandTotal - k.paidTotal), 0);
        const right = h.paidTotal === h.grandTotal - truthOut;
        const k = `${rs.map((r: Any) => (r.ok ? "ok" : /ไม่สำเร็จ/.test(String(r.reason)) ? "GENERIC" : "refused")).join("|")} head ${right ? "right" : "WRONG"}`;
        tally[k] = (tally[k] ?? 0) + 1;
        if (!right && (x.eg ??= 0) < 1 && !(globalThis as Any).__eg?.[name]) { ((globalThis as Any).__eg ??= {})[name] = `head ${h.status}/${h.paidTotal} vs truth paid ${h.grandTotal - truthOut} (children ${kidSt.map((c: Any) => `${c.status}/${c.paidTotal}`).join(",")})`; }
      }
      log(`G6 ${name} ×20: ${JSON.stringify(tally)} · raw ${JSON.stringify(cls(rawErrors))}${(globalThis as Any).__eg?.[name] ? ` · e.g. ${(globalThis as Any).__eg[name]}` : ""}`);
    }
  }

  if (on("H4")) {
    const kids = [await inv(), await inv()]; const g = await mkGroup(kids);
    await accSvc.recordPayment(T, A, kids[0], { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 });
    const h1 = await st(g);
    const cn = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: kids[1], adjustReason: "x", vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 1_000_000 }] });
    const ci = await accSvc.issueDocument(T, A, cn.id);
    const h2 = await st(g); const panel = await grp.groupPanelData(T, A, g);
    log(`H4 child 1 paid → head ${JSON.stringify(h1)} · full CN on child 2 ${short(ci)} → head ${JSON.stringify(h2)} (truth PAID/2,140,000 — panel outstanding ${panel?.outstanding}, canRecord ${panel?.canRecord})`);
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
