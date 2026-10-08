// C5.4-C round-10 hunter probe C (QC2 only · throwaway tenant · deleted at the end)
//   D3b deposit status through deduct → voidDocument(invoice) · then bounce (cheque) vs voidPayment (transfer control) — TB since before pay
//   H2  group head lost update without the journal-number collision: child payments in DIFFERENT months (periodKey) so both commit ×20 (sales) ×10 (purchase)
//   H3  recordGroupPayment (children 1,2) ∥ recordPayment(child 3) same group ×10 — head right? deadlock?
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r10/probe-r10c.mts
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
P.$transaction = async (...a: Any[]) => { try { return await origTx(...a); } catch (e) { rawErrors.push(`${String((e as Any)?.code ?? "")} ${String((e as Any)?.message ?? e).replace(/\s+/g, " ").slice(0, 160)}`); throw e; } };
const TAG = `qc-hunt54dc-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
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
  const lastMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 15));
  const short = (r: Any) => (r?.ok ? `ok` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 100)})`);
  const tb = async (): Promise<Map<string, number>> => {
    const rows = (await P.$queryRawUnsafe(`SELECT a."code" AS code, COALESCE(l."contactId",'-') AS c, sum(l."debit" - l."credit")::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 GROUP BY 1,2`, A)) as Any[];
    return new Map(rows.map((r) => [`${r.code}${r.c === "-" ? "" : r.c === cust.id ? "@cust" : r.c === vend.id ? "@vend" : "@other"}`, Number(r.n)]));
  };
  const tbDiff = (a: Map<string, number>, b: Map<string, number>) => { const out: string[] = []; for (const k of new Set([...a.keys(), ...b.keys()])) { const d = (b.get(k) ?? 0) - (a.get(k) ?? 0); if (d !== 0) out.push(`${k}:${d}`); } return out.sort(); };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true, grandTotal: true } })) as Any;
  const inv = async () => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", issueDate: lastMonth, lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  const expDoc = async () => { const ex = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, issueDate: lastMonth, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 10_000_000 }] }); const r = await exp.issueExpenseDoc(T, A, ex.id); if (!r.ok) throw new Error(`issue exp: ${r.reason}`); return ex.id as string; };
  let seq = 0;
  const chq = () => ({ chequeNo: `C${++seq}-${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: today });
  const row = (amt: number, cheque: Any = null) => ({ paidAt: today, financeAccountId: bank.id, amountSatang: amt, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque });
  const key = () => `k${randomBytes(5).toString("hex")}`;
  const mkDep = async () => {
    const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
    const dep = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "DEPOSIT_RECEIPT", contactId: cust.id, sourceDocId: q.id, vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: 3_000_000 }] });
    await accSvc.issueDocument(T, A, dep.id); return dep.id as string;
  };

  if (on("D3b")) {
    for (const how of ["cheque→bounce", "transfer→voidPayment"] as const) {
      const d = await mkDep(); const b0 = await tb();
      const r = await pay.recordPayments(T, A, d, [row(3_210_000, how === "cheque→bounce" ? chq() : null)], { keyBase: key() });
      const s1 = (await st(d)).status;
      const i = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
      await accSvc.setDocDeposits(T, A, i.id, [{ depositId: d, amountSatang: 3_210_000 }]);
      const is = await accSvc.issueDocument(T, A, i.id); const s2 = (await st(d)).status;
      const vi = await accSvc.voidDocument(T, A, i.id, "undo deduction"); const s3 = (await st(d)).status;
      const p = await P.accountDocumentPayment.findFirst({ where: { documentId: d }, select: { id: true, chequeId: true } });
      const u = how === "cheque→bounce" ? await cheque.bounceCheque(T, A, p.chequeId, "x") : await accSvc.voidPayment(T, A, d, p.id, "x");
      log(`D3b ${how}: pay ${short(r)} dep ${s1} → deduct+issue ${short(is)} dep ${s2} → voidDocument(inv) ${short(vi)} dep ${s3} → ${how.split("→")[1]} ${short(u)} → dep ${JSON.stringify(await st(d))} · TBΔ since before pay ${JSON.stringify(tbDiff(b0, await tb()))} (truth [])`);
    }
  }

  if (on("H2")) {
    const trial = async (side: "IN" | "OUT", mode: "pay∥pay" | "void∥void", n: number) => {
      const tally: Record<string, number> = {}; const bad: string[] = [];
      rawErrors.length = 0;
      for (let i = 0; i < n; i += 1) {
        const kids = side === "IN" ? [await inv(), await inv()] : [await expDoc(), await expDoc()];
        const g = (await grp.createGroupDoc(T, A, { docType: side === "IN" ? "BILLING_NOTE" : "COMBINED_PAYMENT", contactId: side === "IN" ? cust.id : vend.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] })).id;
        const when = [new Date(), lastMonth]; // different periodKey ⇒ no journal-number collision
        const rec = (k: string, at: Date) => side === "IN" ? accSvc.recordPayment(T, A, k, { paidAt: at, channel: "TRANSFER", financeAccountId: bank.id, amount: 10_700_000 }) : exp.recordVendorPayment(T, A, k, { paidAt: at, channel: "TRANSFER", financeAccountId: bank.id, amount: 10_700_000 });
        const vd = (k: string, p: string) => side === "IN" ? accSvc.voidPayment(T, A, k, p, "x") : exp.voidVendorPayment(T, A, k, p, "x");
        let rs: Any[];
        if (mode === "pay∥pay") rs = await Promise.all([rec(kids[0], when[0]), rec(kids[1], when[1])]);
        else { const p0 = await rec(kids[0], when[0]); const p1 = await rec(kids[1], when[1]); rs = await Promise.all([vd(kids[0], p0.paymentId), vd(kids[1], p1.paymentId)]); }
        const h = await st(g); const kidSt = await Promise.all(kids.map(st));
        const truthOut = kidSt.reduce((s: number, k: Any) => s + Math.max(0, k.grandTotal - k.paidTotal), 0);
        const truthPaid = h.grandTotal - truthOut; const truthStatus = truthOut === 0 ? "PAID" : truthPaid > 0 ? "PARTIAL" : "AWAITING_PAYMENT";
        const right = h.paidTotal === truthPaid && h.status === truthStatus;
        const k = `${rs.map((x) => (x.ok ? "ok" : "fail")).join("|")} head ${right ? "right" : "WRONG"}`;
        tally[k] = (tally[k] ?? 0) + 1;
        if (!right && bad.length < 3) bad.push(`head ${h.status}/${h.paidTotal} vs children truth ${truthStatus}/${truthPaid}`);
      }
      log(`H2 ${side} ${mode} ×${n}: ${JSON.stringify(tally)}${bad.length ? ` · e.g. ${bad.join(" ; ")}` : ""}${rawErrors.length ? ` · raw ${[...new Set(rawErrors)].slice(0, 2).join(" ‖ ")}` : ""}`);
    };
    await trial("IN", "pay∥pay", 20); await trial("IN", "void∥void", 20); await trial("OUT", "pay∥pay", 10); await trial("OUT", "void∥void", 10);
  }

  if (on("H3")) {
    const tally: Record<string, number> = {}; rawErrors.length = 0;
    for (let i = 0; i < 10; i += 1) {
      const kids = [await inv(), await inv(), await inv()];
      const g = (await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] })).id;
      // group pays 21,400,000 FIFO (2 of the 3 children) this month · a direct payment hits whichever child the FIFO leaves, last month
      const rs = await Promise.all([
        grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 21_400_000, note: "", feeSatang: 0, wht: [], cheque: null }, { clientKey: key() }),
        accSvc.recordPayment(T, A, kids[2], { paidAt: lastMonth, channel: "TRANSFER", financeAccountId: bank.id, amount: 10_700_000 }),
      ]);
      const h = await st(g); const kidSt = await Promise.all(kids.map(st));
      const truthOut = kidSt.reduce((s: number, k: Any) => s + Math.max(0, k.grandTotal - k.paidTotal), 0);
      const right = h.paidTotal === h.grandTotal - truthOut;
      const k = `${rs.map((x: Any) => (x.ok ? "ok" : /ไม่สำเร็จ/.test(String(x.reason)) ? "GENERIC" : "refused")).join("|")} head ${right ? "right" : "WRONG"}`;
      tally[k] = (tally[k] ?? 0) + 1;
    }
    log(`H3 group(2 children) ∥ direct(child 3) ×10: ${JSON.stringify(tally)}${rawErrors.length ? ` · raw ${[...new Set(rawErrors)].slice(0, 2).join(" ‖ ")}` : ""}`);
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
