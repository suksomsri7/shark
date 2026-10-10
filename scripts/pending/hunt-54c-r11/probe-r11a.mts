// C5.4-C round-11 hunter probe A (QC2 only · throwaway tenant · deleted at the end)
//   Q1   cash-sale receipt paid by transfer: voidPayment refused (nothing written) → voidDocument(receipt) → TB since before approve = 0 · events
//   CAP  group payment 40 children ok / 41 refused before any write (message) — service path (server action + REST call the same recordGroupPayment)
//   Q3   journal-number race under a realistic 3-cashier mix in one month, 2 rounds:
//          S (singles, form path transfer) ×15 · B (5-child cheque batches) ×6 · L (one 40-child cheque batch, then 5 singles)
//        per-operation success rate · the user-visible reasons · raw error classes (P2002 / 40P01 / timeout)
//        + sequential baseline (same ops, no concurrency)
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r11/probe-r11a.mts
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
P.$transaction = async (...a: Any[]) => { try { return await origTx(...a); } catch (e) { rawErrors.push(`${String((e as Any)?.code ?? "")}|${String((e as Any)?.message ?? e).replace(/\s+/g, " ").slice(0, 160)}`); throw e; } };
const cls = (list: string[]) => { const m: Record<string, number> = {}; for (const e of list) { const k = /40P01|deadlock/i.test(e) ? "DEADLOCK" : /P2002/.test(e) ? (/accountJournalEntry/.test(e) ? "P2002 journal no." : "P2002 other") : /P2028|timeout|expired|closed/i.test(e) ? "TX-TIMEOUT" : /[ก-๙]/.test(e.slice(0, 60)) ? "thai-refusal" : `other:${e.slice(0, 70)}`; m[k] = (m[k] ?? 0) + 1; } return m; };
const TAG = `qc-hunt54ea-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const on = (k: string) => ONLY.length === 0 || ONLY.includes(k);
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
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
  const short = (r: Any) => (r?.ok ? `ok${r.recorded !== undefined ? `(${r.recorded})` : ""}` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 150)})`);
  const tb = async (): Promise<Map<string, number>> => {
    const rows = (await P.$queryRawUnsafe(`SELECT a."code" AS code, COALESCE(l."contactId",'-') AS c, sum(l."debit" - l."credit")::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 GROUP BY 1,2`, A)) as Any[];
    return new Map(rows.map((r) => [`${r.code}${r.c === "-" ? "" : "@cust"}`, Number(r.n)]));
  };
  const tbDiff = (a: Map<string, number>, b: Map<string, number>) => { const out: string[] = []; for (const k of new Set([...a.keys(), ...b.keys()])) { const d = (b.get(k) ?? 0) - (a.get(k) ?? 0); if (d !== 0) out.push(`${k}:${d}`); } return out.sort(); };
  const inv = async (unit = 1_000_000) => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: unit }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  const mkGroup = async (kids: string[]) => { const g = await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] }); if (!g.ok) throw new Error(`group: ${g.reason}`); return g.id as string; };
  let seq = 0;
  const chq = () => ({ chequeNo: `A${++seq}-${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: today });
  const key = () => `k${randomBytes(5).toString("hex")}`;

  if (on("Q1")) {
    const re = (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 1_000_000 }] })).id;
    const b0 = await tb(); const ob0 = await P.outboxEvent.count({ where: { tenantId: T } });
    const r = await pay.approveReceiptWithPayments(T, A, re, [{ paidAt: today, financeAccountId: bank.id, amountSatang: 1_070_000, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: null }], { keyBase: key() });
    const p = await P.accountDocumentPayment.findFirst({ where: { documentId: re }, select: { id: true } });
    const b1 = await tb(); const ob1 = await P.outboxEvent.count({ where: { tenantId: T } });
    const v = await pay.voidPaymentAny(T, A, re, p.id, "wrong entry");
    const refusedWrites = `${JSON.stringify(tbDiff(b1, await tb()))} outbox +${(await P.outboxEvent.count({ where: { tenantId: T } })) - ob1}`;
    const vd = await accSvc.voidDocument(T, A, re, "cancel sale");
    const ev = await P.outboxEvent.groupBy({ by: ["type"], where: { tenantId: T, createdAt: { gte: new Date(Date.now() - 600_000) } }, _count: true }).catch(() => []);
    log(`Q1 approve ${short(r)} (TBΔ ${JSON.stringify(tbDiff(b0, b1))}) · voidPaymentAny (UI/REST path) → ${short(v)} · written by the refusal: ${refusedWrites} · voidDocument(receipt) ${short(vd)} → ${JSON.stringify(await P.accountDocument.findUnique({ where: { id: re }, select: { status: true, paidTotal: true } }))} payment voided ${!!(await P.accountDocumentPayment.findUnique({ where: { id: p.id }, select: { voidedAt: true } }))?.voidedAt} · TBΔ since before approve ${JSON.stringify(tbDiff(b0, await tb()))} (expect []) · events since start ${JSON.stringify((ev as Any[]).map((e) => `${e.type}:${e._count}`))} (outbox rows from approve on: +${(await P.outboxEvent.count({ where: { tenantId: T } })) - ob0})`);
  }

  if (on("CAP")) {
    for (const n of [40, 41]) {
      const kids: string[] = []; for (let i = 0; i < n; i += 1) kids.push(await inv());
      const g = await mkGroup(kids);
      const je0 = await P.accountJournalEntry.count({ where: { systemId: A } }); const p0 = await P.accountDocumentPayment.count({ where: { tenantId: T } }); const c0 = await P.accountCheque.count({ where: { systemId: A } });
      const t0 = Date.now();
      const r = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: n * 1_070_000, note: "", feeSatang: 0, wht: [], cheque: chq() }, { clientKey: key() });
      log(`CAP n=${n}: ${short(r)} in ${((Date.now() - t0) / 1000).toFixed(1)} s · written payments +${(await P.accountDocumentPayment.count({ where: { tenantId: T } })) - p0} JE +${(await P.accountJournalEntry.count({ where: { systemId: A } })) - je0} cheques +${(await P.accountCheque.count({ where: { systemId: A } })) - c0}`);
      if (n === 41) { const r2 = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 40 * 1_070_000, note: "", feeSatang: 0, wht: [], cheque: null }, { clientKey: key() }); log(`CAP n=41 group, pay 40 of them → ${short(r2)}`); }
    }
  }

  if (on("Q3")) {
    type Tally = { ok: number; fail: number; reasons: Record<string, number> };
    const mk = (): Tally => ({ ok: 0, fail: 0, reasons: {} });
    const note = (t: Tally, r: Any) => { if (r.ok) t.ok += 1; else { t.fail += 1; const k = String(r.reason).replace(/IV-\d{4}-\d{2}-\d{4}/g, "IV-…").slice(0, 110); t.reasons[k] = (t.reasons[k] ?? 0) + 1; } };
    const single = (k: string) => pay.recordPayments(T, A, k, [{ paidAt: today, financeAccountId: bank.id, amountSatang: 1_070_000, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: null }], { keyBase: key() });
    const batch = (g: string, n: number) => grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: n * 1_070_000, note: "", feeSatang: 0, wht: [], cheque: chq() }, { clientKey: key() });
    const setup = async () => {
      const singles: string[] = []; for (let i = 0; i < 20; i += 1) singles.push(await inv());
      const b5: string[] = []; for (let i = 0; i < 6; i += 1) { const k: string[] = []; for (let j = 0; j < 5; j += 1) k.push(await inv()); b5.push(await mkGroup(k)); }
      const k40: string[] = []; for (let j = 0; j < 40; j += 1) k40.push(await inv());
      return { singles, b5, big: await mkGroup(k40) };
    };
    { // baseline, sequential
      const s = await setup(); const t = { S: mk(), B: mk(), L: mk() };
      for (const k of s.singles.slice(0, 5)) note(t.S, await single(k));
      for (const g of s.b5.slice(0, 2)) note(t.B, await batch(g, 5));
      note(t.L, await batch(s.big, 40));
      log(`Q3 baseline sequential: singles ${t.S.ok}/${t.S.ok + t.S.fail} · 5-child batches ${t.B.ok}/${t.B.ok + t.B.fail} · 40-child ${t.L.ok}/${t.L.ok + t.L.fail}`);
    }
    for (let round = 1; round <= 2; round += 1) {
      const s = await setup(); rawErrors.length = 0;
      const t = { S1: mk(), S2: mk(), B: mk(), L: mk(), LS: mk() };
      const t0 = Date.now();
      await Promise.all([
        (async () => { for (const k of s.singles.slice(0, 8)) note(t.S1, await single(k)); })(),
        (async () => { for (const k of s.singles.slice(8, 15)) note(t.S2, await single(k)); })(),
        (async () => { for (const g of s.b5) note(t.B, await batch(g, 5)); })(),
        (async () => { note(t.L, await batch(s.big, 40)); for (const k of s.singles.slice(15, 20)) note(t.LS, await single(k)); })(),
      ]);
      const sOk = t.S1.ok + t.S2.ok + t.LS.ok, sAll = sOk + t.S1.fail + t.S2.fail + t.LS.fail;
      log(`Q3 round ${round} (${((Date.now() - t0) / 1000).toFixed(0)} s): singles ${sOk}/${sAll} ok · 5-child cheque batches ${t.B.ok}/${t.B.ok + t.B.fail} ok · 40-child cheque batch ${t.L.ok}/1 ok · raw ${JSON.stringify(cls(rawErrors))}`);
      const reasons: Record<string, number> = {}; for (const x of [t.S1, t.S2, t.LS, t.B, t.L]) for (const [k, v] of Object.entries(x.reasons)) reasons[k] = (reasons[k] ?? 0) + v;
      log(`Q3 round ${round} user-visible messages: ${JSON.stringify(reasons)}`);
      const orphan = await P.accountDocumentPayment.count({ where: { tenantId: T, voidedAt: null, channel: "CHEQUE", idempotencyKey: { startsWith: "GRP#" } } });
      const cheques = await P.accountCheque.count({ where: { systemId: A } });
      void orphan; void cheques;
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
