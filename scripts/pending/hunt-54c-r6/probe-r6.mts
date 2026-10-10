// C5.4-C round-6 MONEY HUNTER probe (QC2 only · throwaway tenant `qc-hunt54cr6-*` · deleted at the end) — REAL account service paths.
//   P1 race  voidDocument(INVOICE) ∥ issueDocument(CN on that invoice)                  → G2/G3 TOCTOU
//   P2 race  I→R→TI : voidDocument(R) ∥ issueDocument(CN on TI)  (no shared row lock)   → G2/G3 TOCTOU mid-chain
//   P2c      sequential control: voidDocument(R) with a live CN on TI → refused?
//   P3       ON_PAYMENT invoice → auto TI per payment → CN on that TI → voidPayment cascades TI to VOIDED (G3 bypass)
//   P4       cheque (createCheque documentId=invoice) ignores CN (F-05 family credit bypass)
//   P5       1-satang CNs on a fully credited invoice (cap+1 tolerance, unbounded count)
//   P6       cash-sale RECEIPT (no source) + its TAX_INVOICE: CN on each capped separately (no family cap)
//   P7       INVOICE created with sourceDocId = another INVOICE (REST/AI pass-through) → family pollution
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r6/probe-r6.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
if (/ep-royal-night/.test(String(process.env.DATABASE_URL ?? ""))) { console.log("PROD — abort"); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54cr-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC HUNT54C R6", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });

  const invOf = async (opts: { timing?: string; sourceDocId?: string } = {}) => {
    const inv = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: opts.timing ?? "ON_ISSUE", ...(opts.sourceDocId ? { sourceDocId: opts.sourceDocId } : {}), lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
    const r = await accSvc.issueDocument(T, A, inv.id);
    if (!r.ok) throw new Error(`issue inv: ${r.reason}`);
    return inv.id as string;
  };
  const conv = async (src: string, to: string) => { const r = await accSvc.convertDocument(T, A, src, to); if (!r.ok) throw new Error(`convert ${to}: ${r.reason}`); const i = await accSvc.issueDocument(T, A, r.newId); if (!i.ok) throw new Error(`issue ${to}: ${i.reason}`); return r.newId as string; };
  const cnDraft = async (src: string, unit: number) => (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: src, adjustReason: "รับคืน", vatMode: "EXCLUDE", lines: [{ description: "รับคืน", qty: 1, unitPrice: unit }] })).id as string;
  const cnOf = async (src: string, unit: number) => { const id = await cnDraft(src, unit); const r = await accSvc.issueDocument(T, A, id); return { id, ok: r.ok, reason: r.reason }; };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { docType: true, status: true, grandTotal: true, paidTotal: true } })) as Any;
  const outst = async (id: string) => { const f = await accSvc.paymentTargetOf(T, A, id); return f ? accSvc.paymentOutstandingOf(f.target) : null; };
  const ar1100 = async () => {
    const r = (await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = '1100'`, A)) as Any[];
    return Number(r[0]?.n);
  };
  const short = (r: Any) => (r.ok ? "ok" : `FAIL(${String(r.reason).slice(0, 70)})`);

  // ── P1 ──
  if (process.env.ONLY_CTL !== "1") {
    let both = 0; const lines: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const inv = await invOf();
      const cn = await cnDraft(inv, 2_000_000);
      const r = i % 2 === 0
        ? await Promise.all([accSvc.voidDocument(T, A, inv, "x"), accSvc.issueDocument(T, A, cn)])
        : await Promise.all([accSvc.issueDocument(T, A, cn), accSvc.voidDocument(T, A, inv, "x")]).then((x) => [x[1], x[0]]);
      const si = await st(inv); const sc = await st(cn);
      if (r[0].ok && r[1].ok) both += 1;
      lines.push(`P1.${i} void=${short(r[0])} issueCN=${short(r[1])} → INV=${si.status} CN=${sc.status}`);
    }
    for (const l of lines) log(l);
    log(`P1 SUMMARY both-succeeded=${both}/12 (live CN on VOIDED invoice)`);
  }
  // ── P2 ──
  if (process.env.ONLY_CTL !== "1") {
    let both = 0; const lines: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const inv = await invOf();
      const rc = await conv(inv, "RECEIPT");
      const ti = await conv(rc, "TAX_INVOICE");
      const cn = await cnDraft(ti, 2_000_000);
      const r = i % 2 === 0
        ? await Promise.all([accSvc.voidDocument(T, A, rc, "x"), accSvc.issueDocument(T, A, cn)])
        : await Promise.all([accSvc.issueDocument(T, A, cn), accSvc.voidDocument(T, A, rc, "x")]).then((x) => [x[1], x[0]]);
      const sr = await st(rc); const sc = await st(cn);
      if (r[0].ok && r[1].ok) both += 1;
      lines.push(`P2.${i} voidR=${short(r[0])} issueCN(TI)=${short(r[1])} → R=${sr.status} CN=${sc.status}`);
    }
    for (const l of lines) log(l);
    log(`P2 SUMMARY both-succeeded=${both}/12 (live CN whose chain has a VOIDED receipt)`);
    // control
    const inv = await invOf(); const rc = await conv(inv, "RECEIPT"); const ti = await conv(rc, "TAX_INVOICE");
    const c = await cnOf(ti, 2_000_000);
    log(`P2c control CN on TI=${short(c)} · sequential voidDocument(R) → ${short(await accSvc.voidDocument(T, A, rc, "x"))}`);
  }
  // ── P3 ──
  if (process.env.ONLY_CTL !== "1") {
    const inv = await invOf({ timing: "ON_PAYMENT" });
    const pay = await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 5_350_000 });
    const ti = await P.accountDocument.findFirst({ where: { systemId: A, docType: "TAX_INVOICE", sourcePaymentId: pay.paymentId }, select: { id: true, status: true } });
    log(`P3 pay=${short(pay)} autoTI=${ti?.id ? ti.status : "none"}`);
    if (ti) {
      const c = await cnOf(ti.id, 1_000_000);
      log(`P3 CN on auto-TI → ${short(c)}`);
      const v = await accSvc.voidPayment(T, A, inv, pay.paymentId, "x");
      log(`P3 voidPayment → ${short(v)} · TI=${(await st(ti.id)).status} · CN=${(await st(c.id)).status}  (G3 bypass if TI=VOIDED and CN=ISSUED)`);
      log(`P3 direct voidDocument(TI) control would say: ${short(await accSvc.voidDocument(T, A, ti.id, "x"))}`);
    }
  }
  // ── P4 ──
  if (process.env.ONLY_CTL !== "1") {
    const ar0 = await ar1100();
    const inv = await invOf();
    const c = await cnOf(inv, 5_000_000); // grand 5,350,000
    const before = await outst(inv);
    const cq = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: "0001", bankName: "KBank", chequeDate: new Date(), amount: 10_700_000, documentId: inv });
    const s = await st(inv);
    log(`P4 CN=${short(c)} outstanding-before=${before} · cheque 10,700,000 on invoice → ${short(cq)} · INV=${s.status} paid=${s.paidTotal} grand=${s.grandTotal} · AR1100 Δ=${(await ar1100()) - ar0} (expected 0; negative = over-collected)`);
    // exact-remainder cheque: status stuck?
    const inv2 = await invOf();
    await cnOf(inv2, 5_000_000);
    const cq2 = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: "0002", bankName: "KBank", chequeDate: new Date(), amount: 5_350_000, documentId: inv2 });
    const s2 = await st(inv2);
    log(`P4b cheque for exact remainder 5,350,000 → ${short(cq2)} · INV=${s2.status} paid=${s2.paidTotal} outstanding=${await outst(inv2)} (debt fully settled but status=${s2.status})`);
  }
  // ── P5 ──
  if (process.env.ONLY_CTL !== "1") {
    const ar0 = await ar1100();
    const inv = await invOf();
    const full = await cnOf(inv, 10_000_000);
    let oks = 0;
    for (let i = 0; i < 5; i += 1) { const r = await cnOf(inv, 1); if (r.ok) oks += 1; }
    const live = Number((await P.accountDocument.aggregate({ where: { systemId: A, docType: "CREDIT_NOTE", sourceDocId: inv, status: "ISSUED" }, _sum: { grandTotal: true } }))._sum.grandTotal ?? 0);
    log(`P5 full CN=${short(full)} · extra 1-satang CNs accepted=${oks}/5 · live CN Σ=${live} vs invoice grand=${(await st(inv)).grandTotal} · AR1100 Δ=${(await ar1100()) - ar0}`);
  }
  // ── P6 ──
  if (process.env.ONLY_CTL !== "1") {
    const ar0 = await ar1100();
    const r0 = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 10_000_000 }] });
    const ir = await accSvc.issueDocument(T, A, r0.id);
    const s0 = await st(r0.id);
    log(`P6 cash-sale receipt issue → ${short(ir)} status=${s0.status} grand=${s0.grandTotal} paid=${s0.paidTotal}`);
    if (ir.ok) {
      const ti0 = await conv(r0.id, "TAX_INVOICE");
      const c1 = await cnOf(r0.id, 10_000_000);
      const c2 = await cnOf(ti0, 10_000_000);
      log(`P6 CN on receipt=${short(c1)} · CN on its TI=${short(c2)} · AR1100 Δ=${(await ar1100()) - ar0} (both ok ⇒ 2× sale credited)`);
    }
  }
  // ── P7 ──
  if (process.env.ONLY_CTL !== "1") {
    const invA = await invOf();
    const invB = await invOf({ sourceDocId: invA }); // REST documents.create passes sourceDocId through for INVOICE
    const c = await cnOf(invB, 10_000_000);
    const oA = await outst(invA);
    const pay = await accSvc.recordPayment(T, A, invA, { channel: "TRANSFER", amount: 10_700_000 });
    const cA = await cnOf(invA, 1_000_000);
    const vA = await accSvc.voidDocument(T, A, invA, "x");
    log(`P7 CN on invB=${short(c)} · invA outstanding=${oA} (expected 10700000) · pay invA in full → ${short(pay)} · CN 1,070,000 on invA → ${short(cA)} · void invA → ${short(vA)} · invA=${(await st(invA)).status}`);
  }
  // ── P1c controls (sequential) ──
  {
    const i1 = await invOf(); const c1 = await cnOf(i1, 2_000_000);
    log(`P1c-a CN issued=${short(c1)} then voidDocument(INV) → ${short(await accSvc.voidDocument(T, A, i1, "x"))}`);
    const i2 = await invOf(); const d2 = await cnDraft(i2, 2_000_000);
    const v2 = await accSvc.voidDocument(T, A, i2, "x");
    log(`P1c-b voidDocument(INV)=${short(v2)} then issue CN → ${short(await accSvc.issueDocument(T, A, d2))}`);
    // P1d: consequence — the orphan CN on the voided invoice: GL AR and what the CN cap / CRM see
    const ar0 = await ar1100();
    const i3 = await invOf(); const d3 = await cnDraft(i3, 10_000_000);
    const r = await Promise.all([accSvc.voidDocument(T, A, i3, "x"), accSvc.issueDocument(T, A, d3)]);
    log(`P1d race void=${short(r[0])} issueCN(full)=${short(r[1])} INV=${(await st(i3)).status} CN=${(await st(d3)).status} AR1100 Δ=${(await ar1100()) - ar0} (0 expected; −grand = customer credited for a voided sale)`);
  }
} catch (e) {
  log(`FATAL ${e instanceof Error ? `${e.message}\n${e.stack}` : String(e)}`);
} finally {
  if (T) {
    const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0;
    for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    log(`CLEAN tenant rows left=${left} tenant=${await P.tenant.count({ where: { id: T } })}`);
  }
  await prisma.$disconnect();
}
process.exit(0);
