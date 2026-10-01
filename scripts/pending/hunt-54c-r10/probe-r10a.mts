// C5.4-C round-10 hunter probe A (QC2 only · throwaway tenant · deleted at the end)
//   Q1   r9a T1/T1s rerun with the CORRECTED 2210 expectation (one net collection moves 2210 by the VAT once: +1,400,000 / +700,000)
//   M*   chequeUnwindLines matrix — after bounce (IN) / voidCheque (OUT) the FULL trial balance by (account, contact) since before the payment must be 0,
//        every journal entry of the tenant must balance, and the bounce/void JV's AR/AP lines must carry the document's contact.
//        shapes: sales/purchase × WHT/no × ON_HAND/DEPOSITED/CLEARED × single (form path) / group of 3 / registered cheque (createCheque{documentId})
//                × deposit receipt / deposit payment × legacy earlier-voided linked payment (simulated: unwindPaymentInTx VOID = what main's voidPayment did)
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r10/probe-r10a.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54da-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const on = (k: string) => ONLY.length === 0 || ONLY.some((o) => k.startsWith(o));
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
  if (!bank?.ok) throw new Error(`bank: ${bank?.reason}`);
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const short = (r: Any) => (r?.ok ? `ok${r.recorded !== undefined ? `(recorded ${r.recorded})` : ""}` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 100)})`);
  const bal = async (code: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = $2`, A, code)) as Any[])[0]?.n);
  const tb = async (): Promise<Map<string, number>> => {
    const rows = (await P.$queryRawUnsafe(`SELECT a."code" AS code, COALESCE(l."contactId",'-') AS c, sum(l."debit" - l."credit")::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 GROUP BY 1,2`, A)) as Any[];
    return new Map(rows.map((r) => [`${r.code}${r.c === "-" ? "" : r.c === cust.id ? "@cust" : r.c === vend.id ? "@vend" : "@other"}`, Number(r.n)]));
  };
  const tbDiff = (a: Map<string, number>, b: Map<string, number>) => { const out: string[] = []; for (const k of new Set([...a.keys(), ...b.keys()])) { const d = (b.get(k) ?? 0) - (a.get(k) ?? 0); if (d !== 0) out.push(`${k}:${d}`); } return out.sort(); };
  const unbalanced = async () => Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM (SELECT e."id" FROM "AccountJournalEntry" e JOIN "AccountJournalLine" l ON l."entryId" = e."id" WHERE e."systemId" = $1 GROUP BY e."id" HAVING sum(l."debit") <> sum(l."credit")) x`, A)) as Any[])[0]?.n);
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true, grandTotal: true } })) as Any;
  const live = async (id: string) => { const a = await P.accountDocumentPayment.aggregate({ where: { documentId: id, voidedAt: null }, _sum: { amount: true, whtAmountSatang: true } }); return Number(a._sum.amount ?? 0) + Number(a._sum.whtAmountSatang ?? 0); };
  const i1 = async (ids: string[]) => { const bad: string[] = []; for (const id of ids) { const s = await st(id); const l = await live(id); if (s.paidTotal !== l) bad.push(`${id.slice(-4)} paid ${s.paidTotal}≠live ${l}`); } return bad; };
  const inv = async (timing: "ON_ISSUE" | "ON_PAYMENT" = "ON_ISSUE") => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: timing, lines: [{ description: "งานบริการ", qty: 1, unitPrice: 10_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  const expDoc = async (docType = "EXPENSE") => { const ex = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType, contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 10_000_000 }] }); const r = await exp.issueExpenseDoc(T, A, ex.id); if (!r.ok) throw new Error(`issue ${docType}: ${r.reason}`); return ex.id as string; };
  let seq = 0;
  const chq = () => ({ chequeNo: `Q${++seq}-${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: today });
  const cqOfDocs = async (ids: string[]) => (await P.accountDocumentPayment.findFirst({ where: { documentId: { in: ids }, chequeId: { not: null } }, orderBy: { createdAt: "desc" }, select: { chequeId: true } }))?.chequeId as string | undefined;
  const bounceJvLines = async (cqId: string) => (await P.accountJournalLine.findMany({ where: { entry: { systemId: A, refType: "AccountCheque", refId: cqId, idempotencyKey: { contains: "BOUNCE" } } }, select: { debit: true, credit: true, contactId: true, account: { select: { code: true } } } }).catch(() => [])) as Any[];
  const voidJvLines = async (cqId: string) => (await P.accountJournalLine.findMany({ where: { entry: { systemId: A, refType: "AccountCheque", refId: cqId, idempotencyKey: { contains: "VOID" } } }, select: { debit: true, credit: true, contactId: true, account: { select: { code: true } } } }).catch(() => [])) as Any[];
  const lineStr = (ls: Any[]) => ls.map((l) => `${l.account.code}${l.contactId ? (l.contactId === cust.id ? "@c" : l.contactId === vend.id ? "@v" : "@?") : ""}${l.debit ? `+${l.debit}` : `-${l.credit}`}`).join(" ");
  const results: string[] = []; let red = 0;
  const judge = async (name: string, before: Map<string, number>, docs: string[], extra = "", expect: string[] = []) => {
    const d = tbDiff(before, await tb()); const ub = await unbalanced(); const bad = await i1(docs);
    const unexpected = d.filter((x) => !expect.includes(x));
    const ok = unexpected.length === 0 && ub === 0 && bad.length === 0;
    if (!ok) red += 1;
    results.push(`${ok ? "OK " : "RED"} ${name}: TBΔ ${JSON.stringify(d)}${expect.length ? ` (allowed ${JSON.stringify(expect)})` : ""} · unbalanced JEs ${ub} · I1 ${JSON.stringify(bad)} ${extra}`);
  };

  // ── Q1: T1 / T1s rerun with corrected expectation ──
  if (on("Q1")) {
    const kids = [await inv("ON_PAYMENT"), await inv("ON_PAYMENT")];
    const g = (await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] })).id;
    const v0 = await bal("2200"); const u0 = await bal("2210");
    const r = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 21_400_000, note: "", feeSatang: 0, wht: [], cheque: chq() }, { clientKey: `q1${randomBytes(3).toString("hex")}` });
    const cq = await cqOfDocs(kids);
    const b = await cheque.bounceCheque(T, A, cq, "x");
    const vb = (await bal("2200")) - v0; const ub = (await bal("2210")) - u0;
    for (const k of kids) await accSvc.recordPayment(T, A, k, { channel: "TRANSFER", financeAccountId: bank.id, amount: 10_700_000 });
    const tis = await P.accountDocument.count({ where: { systemId: A, docType: "TAX_INVOICE", sourcePaymentId: { not: null }, status: { notIn: ["VOIDED", "CANCELLED"] }, relationsTo: undefined } }).catch(() => -1);
    log(`Q1 T1 group ${short(r)} bounce ${short(b)} → after bounce 2200 Δ ${vb} 2210 Δ ${ub} (expect 0 / 0) · after re-collect 2200 Δ ${(await bal("2200")) - v0} (expect −1,400,000) · 2210 Δ ${(await bal("2210")) - u0} (expect +1,400,000 — one net collection) · live auto TIs in book ${tis}`);
    const k = await inv("ON_PAYMENT"); const v1 = await bal("2200"); const u1 = await bal("2210");
    const f = await pay.recordPayments(T, A, k, [{ paidAt: today, financeAccountId: null, amountSatang: 10_700_000, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: chq() }], { keyBase: `q1s${randomBytes(3).toString("hex")}` });
    const b2 = await cheque.bounceCheque(T, A, await cqOfDocs([k]), "x");
    await accSvc.recordPayment(T, A, k, { channel: "TRANSFER", financeAccountId: bank.id, amount: 10_700_000 });
    log(`Q1 T1s form ${short(f)} bounce ${short(b2)} → re-collect 2200 Δ ${(await bal("2200")) - v1} (expect −700,000) · 2210 Δ ${(await bal("2210")) - u1} (expect +700,000)`);
  }

  // ── M: matrix ──
  const salesSingle = async (wht: boolean, statusTo: "ON_HAND" | "DEPOSITED" | "CLEARED", timing: "ON_ISSUE" | "ON_PAYMENT" = "ON_ISSUE") => {
    const k = await inv(timing); const before = await tb();
    const amt = wht ? 10_400_000 : 10_700_000;
    const f = await pay.recordPayments(T, A, k, [{ paidAt: today, financeAccountId: bank.id, amountSatang: amt, whtAmountSatang: wht ? 300_000 : 0, whtRateBp: wht ? 300 : null, whtIncomeType: wht ? "M40_2" : null, feeSatang: 0, note: "", cheque: chq() }], { keyBase: `m${randomBytes(4).toString("hex")}` });
    const cq = await cqOfDocs([k]);
    if (statusTo !== "ON_HAND") await cheque.depositCheque(T, A, cq);
    if (statusTo === "CLEARED") { const c = await cheque.clearCheque(T, A, cq); if (!c.ok) results.push(`clear failed ${short(c)}`); }
    const b = await cheque.bounceCheque(T, A, cq, "x");
    await judge(`sales single ${wht ? "WHT" : "noWHT"} ${statusTo} ${timing}`, before, [k], `pay ${short(f)} bounce ${short(b)} · JV ${lineStr(await bounceJvLines(cq!))}`);
  };
  const salesGroup = async (whtOn: number[], statusTo: "ON_HAND" | "CLEARED", timing: "ON_ISSUE" | "ON_PAYMENT" = "ON_ISSUE") => {
    const kids = [await inv(timing), await inv(timing), await inv(timing)];
    const g = (await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] })).id;
    const before = await tb();
    const r = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 32_100_000, note: "", feeSatang: 0, wht: whtOn.map((i) => ({ childDocId: kids[i], incomeType: "M40_2", rateBp: 300, amountSatang: 300_000 })), cheque: chq() }, { clientKey: `mg${randomBytes(4).toString("hex")}` });
    const cq = await cqOfDocs(kids);
    if (statusTo === "CLEARED") { await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq); }
    const b = await cheque.bounceCheque(T, A, cq, "x");
    await judge(`sales group×3 WHT on [${whtOn}] ${statusTo} ${timing}`, before, kids, `pay ${short(r)} bounce ${short(b)} · head ${JSON.stringify(await st(g))} · JV ${lineStr(await bounceJvLines(cq!))}`);
  };
  const salesRegistered = async (statusTo: "ON_HAND" | "CLEARED") => {
    const k = await inv(); const before = await tb();
    const c = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `R${++seq}`, bankName: "B", chequeDate: new Date(), amount: 5_000_000, financeAccountId: bank.id, documentId: k });
    if (statusTo === "CLEARED") { await cheque.depositCheque(T, A, c.id); await cheque.clearCheque(T, A, c.id); }
    const b = await cheque.bounceCheque(T, A, c.id, "x");
    await judge(`sales registered cheque ${statusTo}`, before, [k], `create ${short(c)} bounce ${short(b)} · JV ${lineStr(await bounceJvLines(c.id))}`);
  };
  const purchSingle = async (wht: boolean) => {
    const k = await expDoc(); const before = await tb();
    const amt = wht ? 10_400_000 : 10_700_000;
    const f = await pay.recordPayments(T, A, k, [{ paidAt: today, financeAccountId: bank.id, amountSatang: amt, whtAmountSatang: wht ? 300_000 : 0, whtRateBp: wht ? 300 : null, whtIncomeType: wht ? "M40_2" : null, feeSatang: 0, note: "", cheque: chq() }], { keyBase: `p${randomBytes(4).toString("hex")}` });
    const cq = await cqOfDocs([k]);
    const v = await cheque.voidCheque(T, A, cq, "x");
    await judge(`purchase single ${wht ? "WHT" : "noWHT"} ISSUED`, before, [k], `pay ${short(f)} voidCheque ${short(v)} · JV ${lineStr(await voidJvLines(cq!))}`);
  };
  const purchGroup = async (whtOn: number[]) => {
    const kids = [await expDoc(), await expDoc(), await expDoc()];
    const g = (await grp.createGroupDoc(T, A, { docType: "COMBINED_PAYMENT", contactId: vend.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] })).id;
    const before = await tb();
    const r = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 32_100_000, note: "", feeSatang: 0, wht: whtOn.map((i) => ({ childDocId: kids[i], incomeType: "M40_2", rateBp: 300, amountSatang: 300_000 })), cheque: chq() }, { clientKey: `pg${randomBytes(4).toString("hex")}` });
    const cq = await cqOfDocs(kids);
    const v = await cheque.voidCheque(T, A, cq, "x");
    await judge(`purchase group×3 WHT on [${whtOn}]`, before, kids, `pay ${short(r)} voidCheque ${short(v)} · head ${JSON.stringify(await st(g))} · JV ${lineStr(await voidJvLines(cq!))}`);
  };
  const depReceipt = async (statusTo: "ON_HAND" | "CLEARED") => {
    const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
    const dep = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "DEPOSIT_RECEIPT", contactId: cust.id, sourceDocId: q.id, vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: 3_000_000 }] });
    await accSvc.issueDocument(T, A, dep.id);
    const before = await tb();
    const f = await pay.recordPayments(T, A, dep.id, [{ paidAt: today, financeAccountId: bank.id, amountSatang: 3_210_000, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: chq() }], { keyBase: `d${randomBytes(4).toString("hex")}` });
    const cq = await cqOfDocs([dep.id]);
    if (statusTo === "CLEARED") { await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq); }
    const b = await cheque.bounceCheque(T, A, cq, "x");
    await judge(`deposit receipt by cheque ${statusTo}`, before, [dep.id], `pay ${short(f)} → ${JSON.stringify(await st(dep.id))} bounce ${short(b)} · JV ${lineStr(await bounceJvLines(cq!))}`);
  };
  const depPayment = async () => {
    let id = "";
    try { id = await expDoc("DEPOSIT_PAYMENT"); } catch (e) { results.push(`SKIP deposit payment: ${String((e as Error).message).slice(0, 80)}`); return; }
    const before = await tb(); const g = await st(id);
    const f = await pay.recordPayments(T, A, id, [{ paidAt: today, financeAccountId: bank.id, amountSatang: g.grandTotal, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: chq() }], { keyBase: `dp${randomBytes(4).toString("hex")}` });
    const cq = await cqOfDocs([id]);
    const v = await cheque.voidCheque(T, A, cq, "x");
    await judge(`deposit payment by cheque ISSUED`, before, [id], `pay ${short(f)} voidCheque ${short(v)} · JV ${lineStr(await voidJvLines(cq!))}`);
  };
  const legacy = async (statusTo: "ON_HAND" | "CLEARED") => {
    const kids = [await inv(), await inv(), await inv()];
    const g = (await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] })).id;
    const before = await tb();
    const r = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 32_100_000, note: "", feeSatang: 0, wht: [], cheque: chq() }, { clientKey: `lg${randomBytes(4).toString("hex")}` });
    const linked = await P.accountDocumentPayment.findFirst({ where: { documentId: { in: kids }, chequeId: { not: null } }, select: { id: true, chequeId: true, documentId: true } });
    const sib = await P.accountDocumentPayment.findFirst({ where: { documentId: { in: kids }, chequeId: null, voidedAt: null }, orderBy: { documentId: "desc" }, select: { id: true } });
    // legacy (main): voidPayment had no cheque rule ⇒ simulate the linked payment + one sibling voided with VOID-mode unwind (JV reversed)
    await P.$transaction(async (tx: Any) => { await accSvc.unwindPaymentInTx(tx, { tenantId: T, systemId: A }, linked.id, "legacy", "VOID"); await accSvc.unwindPaymentInTx(tx, { tenantId: T, systemId: A }, sib.id, "legacy", "VOID"); });
    if (statusTo === "CLEARED") { await cheque.depositCheque(T, A, linked.chequeId); await cheque.clearCheque(T, A, linked.chequeId); }
    const b = await cheque.bounceCheque(T, A, linked.chequeId, "x");
    await judge(`legacy group×3 (linked + 1 sibling voided earlier) ${statusTo}`, before, kids, `pay ${short(r)} bounce ${short(b)} · JV ${lineStr(await bounceJvLines(linked.chequeId))}`);
  };
  if (on("M")) {
    for (const w of [false, true]) for (const s of ["ON_HAND", "DEPOSITED", "CLEARED"] as const) await salesSingle(w, s);
    await salesSingle(true, "CLEARED", "ON_PAYMENT");
    await salesGroup([], "ON_HAND"); await salesGroup([1], "ON_HAND"); await salesGroup([0, 2], "CLEARED"); await salesGroup([0, 1, 2], "CLEARED", "ON_PAYMENT");
    await salesRegistered("ON_HAND"); await salesRegistered("CLEARED");
    await purchSingle(false); await purchSingle(true); await purchGroup([]); await purchGroup([0, 2]);
    await depReceipt("ON_HAND"); await depReceipt("CLEARED"); await depPayment();
    await legacy("ON_HAND"); await legacy("CLEARED");
    for (const r of results) log(`M ${r}`);
    log(`M summary red ${red}/${results.filter((r) => /^(OK|RED)/.test(r)).length}`);
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
