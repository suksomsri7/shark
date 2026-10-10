// C5.4-C round-10 hunter probe D (QC2 only · throwaway tenant · deleted at the end)
//   G1  one-tx group payment size: 20 and 50 service invoices (ON_PAYMENT auto TI) each with WHT (WTI cert) + one cheque — ok? seconds?
//   G2  R9-7 inside the one-tx batch: 3 "cashiers" in the same month — A: group payment of 5 children ×10 · B, C: single recordPayment loops — abort rate
//   G3  deadlock pairings ×20 vs recordGroupPayment(children a,b by cheque): recordPayment(a) · issue CN on a · voidDocument(b) · bounce of another batch on the same group
//   G4  same clientKey fired twice while the first is in flight ×8 → both ok? one recorded, one duplicate? cheques = 1
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r10/probe-r10d.mts
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
const TAG = `qc-hunt54dd-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const on = (k: string) => ONLY.length === 0 || ONLY.includes(k);
const cls = (list: string[]) => { const m: Record<string, number> = {}; for (const e of list) { const k = /40P01|deadlock/i.test(e) ? "DEADLOCK" : /P2002/.test(e) ? "P2002(journal/doc no.)" : /P2028|timeout|expired|Transaction already closed/i.test(e) ? "TX-TIMEOUT" : /P2034/.test(e) ? "P2034(write conflict)" : /[ก-๙]/.test(e.slice(0, 60)) ? "thai-refusal" : `other:${e.slice(0, 60)}`; m[k] = (m[k] ?? 0) + 1; } return m; };
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
  const short = (r: Any) => (r?.ok ? `ok${r.recorded !== undefined ? `(${r.recorded})` : ""}` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 90)})`);
  const inv = async (timing: "ON_ISSUE" | "ON_PAYMENT" = "ON_ISSUE") => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: timing, lines: [{ description: "งานบริการ", qty: 1, unitPrice: 1_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  const mkGroup = async (kids: string[]) => { const g = await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] }); if (!g.ok) throw new Error(`group: ${g.reason}`); return g.id as string; };
  let seq = 0;
  const chq = () => ({ chequeNo: `D${++seq}-${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: today });
  const key = () => `k${randomBytes(5).toString("hex")}`;
  const payGroup = (g: string, tieOff: number, opts: { cheque?: boolean; wht?: Any[]; clientKey?: string } = {}) => grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: tieOff, note: "", feeSatang: 0, wht: opts.wht ?? [], cheque: opts.cheque ? chq() : null }, { clientKey: opts.clientKey ?? key() });

  if (on("G1")) {
    for (const n of [20, 50]) {
      const kids: string[] = []; for (let i = 0; i < n; i += 1) kids.push(await inv("ON_PAYMENT"));
      const g = await mkGroup(kids);
      rawErrors.length = 0;
      const t0 = Date.now();
      const r = await payGroup(g, n * 1_070_000, { cheque: true, wht: kids.map((k) => ({ childDocId: k, incomeType: "M40_2", rateBp: 300, amountSatang: 30_000 })) });
      const ms = Date.now() - t0;
      const tis = await P.accountDocument.count({ where: { systemId: A, docType: "TAX_INVOICE", sourceDocId: { in: kids } } }).catch(() => -1);
      const certs = await P.accountDocumentPayment.count({ where: { documentId: { in: kids }, whtCertDocId: { not: null } } });
      log(`G1 n=${n}: ${short(r)} in ${(ms / 1000).toFixed(1)} s · payments ${await P.accountDocumentPayment.count({ where: { documentId: { in: kids } } })} · WHT certs ${certs} · auto TIs ${tis} · raw ${JSON.stringify(cls(rawErrors))}`);
    }
  }

  if (on("G2")) {
    rawErrors.length = 0;
    const res = { groupOk: 0, groupFail: 0, singleOk: 0, singleFail: 0 };
    const reasons: Record<string, number> = {};
    const groups: string[] = []; for (let i = 0; i < 10; i += 1) { const kids: string[] = []; for (let j = 0; j < 5; j += 1) kids.push(await inv()); groups.push(await mkGroup(kids)); }
    const singles: string[] = []; for (let i = 0; i < 30; i += 1) singles.push(await inv());
    let stop = false;
    const cashier = async (list: string[]) => { for (const k of list) { if (stop) return; const r = await accSvc.recordPayment(T, A, k, { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 }); if (r.ok) res.singleOk += 1; else res.singleFail += 1; } };
    const groupCashier = (async () => { for (const g of groups) { const r = await payGroup(g, 5 * 1_070_000, { cheque: true }); if (r.ok) res.groupOk += 1; else { res.groupFail += 1; const k = String(r.reason).slice(0, 50); reasons[k] = (reasons[k] ?? 0) + 1; } } stop = true; })();
    await Promise.all([groupCashier, cashier(singles.slice(0, 15)), cashier(singles.slice(15))]);
    const leftovers = await P.accountDocumentPayment.count({ where: { tenantId: T, voidedAt: null, chequeId: null, channel: "CHEQUE" } });
    log(`G2 3 cashiers same month: group batches ok ${res.groupOk}/${res.groupOk + res.groupFail} (fail reasons ${JSON.stringify(reasons)}) · single payments ok ${res.singleOk}/${res.singleOk + res.singleFail} · raw ${JSON.stringify(cls(rawErrors))} · orphan CHEQUE payments without cheque ${leftovers}`);
  }

  if (on("G3")) {
    const pairs: [string, (x: Any) => Promise<Any>][] = [
      ["recordPayment(a)", (x) => accSvc.recordPayment(T, A, x.kids[0], { channel: "TRANSFER", financeAccountId: bank.id, amount: 500_000 })],
      ["issue CN on a", (x) => accSvc.issueDocument(T, A, x.cn)],
      ["voidDocument(b)", (x) => accSvc.voidDocument(T, A, x.kids[1], "x")],
      ["bounce other batch cheque", (x) => cheque.bounceCheque(T, A, x.otherCq, "x")],
      ["voidPayment(other batch child c, transfer)", (x) => accSvc.voidPayment(T, A, x.kids[2], x.cPay, "x")],
    ];
    for (const [name, fn] of pairs) {
      rawErrors.length = 0; const tally: Record<string, number> = {};
      for (let i = 0; i < 20; i += 1) {
        const kids = [await inv(), await inv(), await inv(), await inv()];
        const g = await mkGroup(kids);
        const x: Any = { kids };
        // other batch on the same group: child d by cheque (FIFO would pick the first — so pay d directly via group? use a separate cheque on d via form-like createCheque{documentId})
        const oc = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `O${++seq}`, bankName: "B", chequeDate: new Date(), amount: 1_070_000, documentId: kids[3] });
        x.otherCq = oc.id;
        x.cPay = (await accSvc.recordPayment(T, A, kids[2], { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 })).paymentId;
        x.cn = (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: kids[0], adjustReason: "x", vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 100_000 }] })).id;
        const rs = await Promise.all([payGroup(g, 1_070_000 + 500_000, { cheque: true }), fn(x)]);
        const k = rs.map((r: Any) => (r.ok ? "ok" : /ไม่สำเร็จ/.test(String(r.reason)) ? "GENERIC" : "refused")).join("|");
        tally[k] = (tally[k] ?? 0) + 1;
      }
      log(`G3 group(a,b by cheque) ∥ ${name} ×20: ${JSON.stringify(tally)} · raw ${JSON.stringify(cls(rawErrors))}`);
    }
  }

  if (on("G4")) {
    const tally: Record<string, number> = {};
    for (let i = 0; i < 8; i += 1) {
      const kids = [await inv(), await inv(), await inv()];
      const g = await mkGroup(kids); const ck = key();
      const rs = await Promise.all([payGroup(g, 3 * 1_070_000, { cheque: true, clientKey: ck }), new Promise((r) => setTimeout(r, 80)).then(() => payGroup(g, 3 * 1_070_000, { cheque: true, clientKey: ck }))]);
      const pays = await P.accountDocumentPayment.count({ where: { documentId: { in: kids } } });
      const cqs = await P.accountDocumentPayment.count({ where: { documentId: { in: kids }, chequeId: { not: null } } });
      const k = `${rs.map((r: Any) => short(r).slice(0, 40)).join(" | ")} · payments ${pays} · linked cheques ${cqs}`;
      tally[k] = (tally[k] ?? 0) + 1;
    }
    log(`G4 in-flight retry ×8: ${JSON.stringify(tally)}`);
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
