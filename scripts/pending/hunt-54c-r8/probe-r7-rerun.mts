// r8 rerun copy of hunt-54c-r7 (unchanged logic). NOTE: B2a/B2c now expect voidPayment(live cheque pay) REFUSED (B2c ruling r7).
// C5.4-C round-7 MONEY HUNTER probe (QC2 only · throwaway tenant · deleted at the end) — REAL account service paths + real CRM bridge handlers.
// Part A = re-run of hunt-54c-r6/probe-r6.mts against the r6 fixes, with two ORACLE-EDITs (builder questions agreed):
//   ORACLE-EDIT 1 (P7): the INVOICE→INVOICE sourceDocId is now refused at createDocument ⇒ wrap in try/catch and PASS on refusal
//                       (r6 printed FATAL and skipped P1c). Reason: F6 fix moves the refusal earlier; refusal IS the expected result.
//   ORACLE-EDIT 2 (P4): a refused over-cheque leaves the invoice legitimately owed grand − CN ⇒ expected AR Δ = 10,700,000 − 5,350,000
//                       = +5,350,000 (r6 said "expected 0", which only described the pre-fix over-collected state).
//   Races run 30 iterations (was 12).
// Part B = hunt of the r6 code: lock-order pairs (deadlock), cheque event emission / double decrement, F5 cash-sale root edges,
//   F6 legit flows through REST, F7 rounding with VAT.
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r7/probe-r7.mts   (PART=A|B to restrict)
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
if (/ep-royal-night/.test(String(process.env.DATABASE_URL ?? ""))) { console.log("PROD — abort"); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const PART = String(process.env.PART ?? "AB");
const N = Number(process.env.RACE_N ?? 30);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54cs-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
const USERS: string[] = [];
let T = "";
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const MONEY = (await import("@/lib/platform/crm-bridges/money" as string)) as Any;
  const CORE = (await import("@/lib/platform/crm-bridges/core" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const OB = P.outboxEvent; const F = OB.findMany; OB.findMany = (a: Any) => F.call(OB, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: T }] } });
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC HUNT54C R7", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });

  const invOf = async (opts: { timing?: string; sourceDocId?: string; unit?: number } = {}) => {
    const inv = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: opts.timing ?? "ON_ISSUE", ...(opts.sourceDocId ? { sourceDocId: opts.sourceDocId } : {}), lines: [{ description: "งาน", qty: 1, unitPrice: opts.unit ?? 10_000_000 }] });
    const r = await accSvc.issueDocument(T, A, inv.id);
    if (!r.ok) throw new Error(`issue inv: ${r.reason}`);
    return inv.id as string;
  };
  const conv = async (src: string, to: string) => { const r = await accSvc.convertDocument(T, A, src, to); if (!r.ok) throw new Error(`convert ${to}: ${r.reason}`); const i = await accSvc.issueDocument(T, A, r.newId); if (!i.ok) throw new Error(`issue ${to}: ${i.reason}`); return r.newId as string; };
  const cnDraft = async (src: string, unit: number) => (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: src, adjustReason: "รับคืน", vatMode: "EXCLUDE", lines: [{ description: "รับคืน", qty: 1, unitPrice: unit }] })).id as string;
  const cnOf = async (src: string, unit: number) => { const id = await cnDraft(src, unit); const r = await accSvc.issueDocument(T, A, id); return { id, ok: r.ok, reason: r.reason }; };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { docType: true, status: true, grandTotal: true, paidTotal: true } })) as Any;
  const outst = async (id: string) => { const f = await accSvc.paymentTargetOf(T, A, id); return f ? accSvc.paymentOutstandingOf(f.target) : null; };
  const ar1100 = async () => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = '1100'`, A)) as Any[])[0]?.n);
  const livePaid = async (id: string) => { const a = await P.accountDocumentPayment.aggregate({ where: { documentId: id, voidedAt: null }, _sum: { amount: true, whtAmountSatang: true } }); return Number(a._sum.amount ?? 0) + Number(a._sum.whtAmountSatang ?? 0); };
  const short = (r: Any) => (r?.ok ? "ok" : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 80)})`);
  const cq = (docId: string | null, amount: number, extra: Any = {}) => cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `C${randomBytes(3).toString("hex")}`, bankName: "KBank", chequeDate: new Date(), amount, documentId: docId, ...extra });
  const evCount = async (type: string, key?: string) => P.outboxEvent.count({ where: { tenantId: T, type, ...(key ? { idempotencyKey: key } : {}) } });

  if (PART.includes("A")) {
    // ── A/P1 ──
    { let both = 0; for (let i = 0; i < N; i += 1) {
        const inv = await invOf(); const cn = await cnDraft(inv, 2_000_000);
        const r = i % 2 === 0 ? await Promise.all([accSvc.voidDocument(T, A, inv, "x"), accSvc.issueDocument(T, A, cn)]) : await Promise.all([accSvc.issueDocument(T, A, cn), accSvc.voidDocument(T, A, inv, "x")]).then((x) => [x[1], x[0]]);
        if (r[0].ok && r[1].ok) { both += 1; log(`  A-P1.${i} BOTH OK INV=${(await st(inv)).status} CN=${(await st(cn)).status}`); }
        else if (!r[0].ok && !r[1].ok) log(`  A-P1.${i} BOTH FAILED void=${short(r[0])} cn=${short(r[1])}`);
      }
      log(`A-P1 voidINV ∥ issueCN both-succeeded=${both}/${N}`); }
    // ── A/P2 ──
    { let both = 0; for (let i = 0; i < N; i += 1) {
        const inv = await invOf(); const rc = await conv(inv, "RECEIPT"); const ti = await conv(rc, "TAX_INVOICE"); const cn = await cnDraft(ti, 2_000_000);
        const r = i % 2 === 0 ? await Promise.all([accSvc.voidDocument(T, A, rc, "x"), accSvc.issueDocument(T, A, cn)]) : await Promise.all([accSvc.issueDocument(T, A, cn), accSvc.voidDocument(T, A, rc, "x")]).then((x) => [x[1], x[0]]);
        if (r[0].ok && r[1].ok) both += 1;
        else if (!r[0].ok && !r[1].ok) log(`  A-P2.${i} BOTH FAILED void=${short(r[0])} cn=${short(r[1])}`);
      }
      log(`A-P2 voidR ∥ issueCN(TI) both-succeeded=${both}/${N}`); }
    // ── A/P3 ──
    { const inv = await invOf({ timing: "ON_PAYMENT" });
      const pay = await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 5_350_000 });
      const ti = await P.accountDocument.findFirst({ where: { systemId: A, docType: "TAX_INVOICE", sourcePaymentId: pay.paymentId }, select: { id: true } });
      const c = await cnOf(ti.id, 1_000_000);
      const v = await accSvc.voidPayment(T, A, inv, pay.paymentId, "x");
      log(`A-P3 CN on auto-TI=${short(c)} · voidPayment → ${short(v)} · TI=${(await st(ti.id)).status} CN=${(await st(c.id)).status} (expect refused, TI ISSUED)`); }
    // ── A/P4 ── ORACLE-EDIT 2
    { const ar0 = await ar1100(); const inv = await invOf(); const c = await cnOf(inv, 5_000_000);
      const r = await cq(inv, 10_700_000); const s = await st(inv);
      log(`A-P4 CN=${short(c)} · over-cheque 10,700,000 → ${short(r)} · INV=${s.status} paid=${s.paidTotal} · AR1100 Δ=${(await ar1100()) - ar0} (expect refused, Δ=+5350000)`);
      const inv2 = await invOf(); await cnOf(inv2, 5_000_000); const r2 = await cq(inv2, 5_350_000); const s2 = await st(inv2);
      log(`A-P4b exact-remainder cheque → ${short(r2)} · INV=${s2.status} outstanding=${await outst(inv2)} (expect PAID/0)`); }
    // ── A/P5 ──
    { const ar0 = await ar1100(); const inv = await invOf(); const full = await cnOf(inv, 10_000_000); let oks = 0;
      for (let i = 0; i < 5; i += 1) if ((await cnOf(inv, 1)).ok) oks += 1;
      log(`A-P5 full CN=${short(full)} · extra 1-satang CNs accepted=${oks}/5 (expect 0) · AR1100 Δ=${(await ar1100()) - ar0} (expect 0)`); }
    // ── A/P6 ──
    { const ar0 = await ar1100();
      const r0 = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 10_000_000 }] });
      await accSvc.issueDocument(T, A, r0.id); const ti0 = await conv(r0.id, "TAX_INVOICE");
      const c1 = await cnOf(r0.id, 10_000_000); const c2 = await cnOf(ti0, 10_000_000);
      log(`A-P6 CN on cash receipt=${short(c1)} · CN on its TI=${short(c2)} (expect 2nd refused) · AR1100 Δ=${(await ar1100()) - ar0}`); }
    // ── A/P7 ── ORACLE-EDIT 1
    { const invA = await invOf(); let made: string;
      try { await invOf({ sourceDocId: invA }); made = "CREATED (bad)"; } catch (e) { made = `refused: ${String((e as Error).message).slice(0, 70)}`; }
      log(`A-P7 INVOICE with sourceDocId=INVOICE → ${made} · invA outstanding=${await outst(invA)} (expect 10700000)`); }
    // ── A/P1c controls ──
    { const i1 = await invOf(); const c1 = await cnOf(i1, 2_000_000);
      log(`A-P1c-a CN=${short(c1)} then void INV → ${short(await accSvc.voidDocument(T, A, i1, "x"))} (expect refused)`);
      const i2 = await invOf(); const d2 = await cnDraft(i2, 2_000_000); const v2 = await accSvc.voidDocument(T, A, i2, "x");
      log(`A-P1c-b void INV=${short(v2)} then CN → ${short(await accSvc.issueDocument(T, A, d2))} (expect refused)`); }
  }

  if (PART.includes("B")) {
    // ── B1 lock-order pairs: any deadlock / generic failure? ──
    const pairs: [string, () => Promise<[() => Promise<Any>, () => Promise<Any>]>][] = [
      ["issueCN(autoTI) ∥ voidPayment", async () => { const inv = await invOf({ timing: "ON_PAYMENT" }); const p = await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 5_350_000 }); const ti = await P.accountDocument.findFirst({ where: { systemId: A, sourcePaymentId: p.paymentId, docType: "TAX_INVOICE" }, select: { id: true } }); const cn = await cnDraft(ti.id, 1_000_000); return [() => accSvc.issueDocument(T, A, cn), () => accSvc.voidPayment(T, A, inv, p.paymentId, "x")]; }],
      ["issueCN(TI←R←I) ∥ recordPayment(I)", async () => { const inv = await invOf(); const rc = await conv(inv, "RECEIPT"); const ti = await conv(rc, "TAX_INVOICE"); const cn = await cnDraft(ti, 2_000_000); return [() => accSvc.issueDocument(T, A, cn), () => accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 5_000_000 })]; }],
      ["issueCN(I) ∥ cheque(I)", async () => { const inv = await invOf(); const cn = await cnDraft(inv, 5_000_000); return [() => accSvc.issueDocument(T, A, cn), () => cq(inv, 7_000_000)]; }],
      ["issueCN(R) ∥ cheque(I)", async () => { const inv = await invOf(); const rc = await conv(inv, "RECEIPT"); const cn = await cnDraft(rc, 5_000_000); return [() => accSvc.issueDocument(T, A, cn), () => cq(inv, 7_000_000)]; }],
      ["voidCN(TI) ∥ voidPayment(I)", async () => { const inv = await invOf({ timing: "ON_PAYMENT" }); const p = await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 5_350_000 }); const p2 = await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 1_000_000 }); const ti = await P.accountDocument.findFirst({ where: { systemId: A, sourcePaymentId: p.paymentId, docType: "TAX_INVOICE" }, select: { id: true } }); const c = await cnOf(ti.id, 1_000_000); return [() => accSvc.voidDocument(T, A, c.id, "x"), () => accSvc.voidPayment(T, A, inv, p2.paymentId, "x")]; }],
      ["issueCN(TI) ∥ voidCN2(R) same family", async () => { const inv = await invOf(); const rc = await conv(inv, "RECEIPT"); const ti = await conv(rc, "TAX_INVOICE"); const c2 = await cnOf(rc, 1_000_000); const cn = await cnDraft(ti, 1_000_000); return [() => accSvc.issueDocument(T, A, cn), () => accSvc.voidDocument(T, A, c2.id, "x")]; }],
      ["convert I→TI ∥ issueCN(I)", async () => { const inv = await invOf(); const cn = await cnDraft(inv, 2_000_000); return [() => accSvc.issueDocument(T, A, cn), () => accSvc.convertDocument(T, A, inv, "TAX_INVOICE")]; }],
      ["issueCN(I) ∥ bounce(cheque on I)", async () => { const inv = await invOf(); const c = await cq(inv, 5_000_000); const cn = await cnDraft(inv, 2_000_000); return [() => accSvc.issueDocument(T, A, cn), () => cheque.bounceCheque(T, A, c.id, "x")]; }],
    ];
    for (const [name, mk] of pairs) {
      const tally: Record<string, number> = {};
      for (let i = 0; i < 10; i += 1) {
        const [a, b] = await mk();
        const r = await Promise.all([a(), b()]);
        const k = r.map((x: Any) => (x?.ok ? "ok" : /deadlock|40P01|ไม่สำเร็จ$/i.test(String(x?.reason)) ? `GENERIC(${String(x?.reason).slice(0, 40)})` : "refused")).join("|");
        tally[k] = (tally[k] ?? 0) + 1;
      }
      log(`B1 ${name}: ${JSON.stringify(tally)}`);
    }

    // ── B2 cheque restore races: voidPayment ∥ bounce · bounce ∥ bounce ──
    { const rows: string[] = []; let bad = 0;
      for (let i = 0; i < 10; i += 1) {
        const inv = await invOf();
        await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 5_000_000 });
        const c = await cq(inv, 3_000_000);
        const pay = await P.accountDocumentPayment.findFirst({ where: { chequeId: c.id }, select: { id: true } });
        const r = await Promise.all([accSvc.voidPayment(T, A, inv, pay.id, "x"), cheque.bounceCheque(T, A, c.id, "x")]);
        const s = await st(inv); const lp = await livePaid(inv);
        if (s.paidTotal !== lp) bad += 1;
        rows.push(`${short(r[0])}|${short(r[1])} paidTotal=${s.paidTotal} livePayments=${lp}`);
      }
      log(`B2a voidPayment(cheque pay) ∥ bounceCheque: paidTotal≠live-payments in ${bad}/10 · ${[...new Set(rows)].slice(0, 4).join(" ; ")}`);
      let bad2 = 0; const rows2: string[] = [];
      for (let i = 0; i < 10; i += 1) {
        const inv = await invOf();
        await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 5_000_000 });
        const c = await cq(inv, 3_000_000);
        const ar0 = await ar1100();
        const r = await Promise.all([cheque.bounceCheque(T, A, c.id, "x"), cheque.bounceCheque(T, A, c.id, "x")]);
        const s = await st(inv); const lp = await livePaid(inv);
        if (s.paidTotal !== lp || (r[0].ok && r[1].ok)) bad2 += 1;
        rows2.push(`${short(r[0])}|${short(r[1])} paidTotal=${s.paidTotal} live=${lp} AR Δ=${(await ar1100()) - ar0}`);
      }
      log(`B2b bounce ∥ bounce: bad=${bad2}/10 · ${[...new Set(rows2)].slice(0, 4).join(" ; ")}`);
      // sequential control: voidPayment of cheque payment then bounce
      const inv = await invOf(); await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 5_000_000 });
      const ar0 = await ar1100(); const c = await cq(inv, 3_000_000);
      const pay = await P.accountDocumentPayment.findFirst({ where: { chequeId: c.id }, select: { id: true } });
      const v = await accSvc.voidPayment(T, A, inv, pay.id, "x"); const b = await cheque.bounceCheque(T, A, c.id, "x");
      const s = await st(inv);
      log(`B2c seq voidPayment(cheque pay)=${short(v)} then bounce=${short(b)} · INV paid=${s.paidTotal} live=${await livePaid(inv)} outstanding=${await outst(inv)} · AR1100 Δ since cheque=${(await ar1100()) - ar0} (subledger says owed +3,000,000 back; GL Δ should be +3000000)`);
    }

    // ── B3 cheque events + CRM counting ──
    { const users = await P.user.create({ data: { email: `${TAG}-rep@qc.invalid`, name: `rep ${TAG}` } }); USERS.push(users.id);
      await P.membership.create({ data: { userId: users.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
      const S = (await sysSvc.createSystem(T, "CRM", `crm ${TAG}`)).id as string;
      await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, commission: { approvalRequired: false, payrollLink: false } }), S);
      const pipe = await P.crmPipeline.create({ data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, isDefault: true, stages: { create: [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100]].map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) } }, include: { stages: true } });
      const OPEN = (pipe.stages as Any[]).find((x) => x.kind === "OPEN").id as string;
      const party = await P.party.create({ data: { tenantId: T, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
      const k = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: party.id, ownerUserId: users.id } });
      const deal = (invoiceDocId: string) => P.crmDeal.create({ data: { tenantId: T, systemId: S, contactId: k.id, pipelineId: pipe.id, stageId: OPEN, title: `ดีล ${TAG}`, valueSatang: 10_000_000, kind: "OPEN", ownerUserId: users.id, stageEnteredAt: new Date(), invoiceDocId } });
      const HANDLER: Record<string, Any> = { "account.document.issued": CORE.onDocumentIssued, "account.payment.recorded": MONEY.onPaymentRecorded, "account.invoice.paid": MONEY.onInvoicePaid, "account.document.voided": MONEY.onDocumentVoided, "account.payment.voided": MONEY.onPaymentVoided };
      const done = new Set<string>(
        ((await P.outboxEvent.findMany({ where: { tenantId: T }, select: { id: true } })) as Any[]).map((e) => e.id));
      const deliver = async () => { const evs = (await P.outboxEvent.findMany({ where: { tenantId: T, type: { in: Object.keys(HANDLER) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[]; for (const e of evs) if (!done.has(e.id)) { done.add(e.id); await HANDLER[e.type]({ id: e.id, tenantId: T, type: e.type, payload: e.payload, systemId: e.systemId, unitId: null }); } };
      const crm = async (id: string) => { const d = await P.crmDeal.findUnique({ where: { id }, select: { paidSatang: true } }); const rows = await P.crmDealPayment.findMany({ where: { dealId: id, status: "COUNTED" }, select: { refType: true, satang: true } }); return `paid=${Number(d?.paidSatang)} rows=${rows.map((r: Any) => `${r.refType}:${Number(r.satang)}`).join(",")}`; };
      // B3a direct cheque full → bounce → transfer full
      const inv = await invOf(); const d = await deal(inv); await deliver();
      const c = await cq(inv, 10_700_000); await deliver();
      log(`B3a cheque full=${short(c)} · events rec=${await evCount("account.payment.recorded")} paid#=${await evCount("account.invoice.paid", `account.invoice.paid#${inv}`)} · CRM ${await crm(d.id)}`);
      const b = await cheque.bounceCheque(T, A, c.id, "x"); await deliver();
      log(`B3a bounce=${short(b)} · voided events=${await evCount("account.payment.voided")} · INV=${(await st(inv)).status} · CRM ${await crm(d.id)} (expect paid=0)`);
      const p = await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 10_700_000 }); await deliver();
      log(`B3a transfer full=${short(p)} · CRM ${await crm(d.id)} (expect paid=10700000 once)`);
      // B3b form path: recordPayment(channel CHEQUE) + createCheque(paymentId) → one payment.recorded
      const inv2 = await invOf(); const d2 = await deal(inv2); await deliver();
      const before = await evCount("account.payment.recorded");
      const p2 = await accSvc.recordPayment(T, A, inv2, { channel: "CHEQUE", amount: 10_700_000 });
      const c2 = await cq(inv2, 10_700_000, { paymentId: p2.paymentId }); await deliver();
      log(`B3b form cheque: rec=${short(p2)} cheque=${short(c2)} · new payment.recorded=${(await evCount("account.payment.recorded")) - before} (expect 1) · CRM ${await crm(d2.id)}`);
      const b2 = await cheque.bounceCheque(T, A, c2.id, "x"); await deliver();
      const s2 = await st(inv2);
      log(`B3b bounce=${short(b2)} · INV=${s2.status} paid=${s2.paidTotal} live=${await livePaid(inv2)} · CRM ${await crm(d2.id)} (expect paid=0)`);
      // B3c cheque exact remainder with CN → invoice.paid payload + CRM WHT/settle
      const inv3 = await invOf(); const d3 = await deal(inv3); await deliver();
      await cnOf(inv3, 5_000_000); await deliver();
      const c3 = await cq(inv3, 5_350_000); await deliver();
      const ev = (await P.outboxEvent.findFirst({ where: { tenantId: T, idempotencyKey: `account.invoice.paid#${inv3}` }, select: { payload: true } }))?.payload;
      log(`B3c cheque remainder with CN=${short(c3)} · invoice.paid payload=${JSON.stringify(ev)} · CRM ${await crm(d3.id)}`);
    }

    // ── B4 F6 legit flows through REST ──
    { const OPS = (await import("@/lib/modules/account/api/ops/documents-write" as string)) as Any;
      const op = (OPS.DOCUMENTS_WRITE_OPS as Any[]).find((o) => o.id === "documents.create");
      const actor = { kind: "apikey", tenantId: T, systemId: A };
      const line = [{ description: "งาน", qty: 1, unitPriceSatang: 1_000_000 }];
      const call = async (inp: Any) => { try { const r = await op.handler({ actor, input: op.input.parse({ contactId: cust.id, lines: line, ...inp }) }); return `ok(${r?.docType ?? r?.type ?? ""})`; } catch (e) { return `ERR ${(e as Any)?.status ?? ""} ${String((e as Any)?.message ?? e).slice(0, 60)}`; } };
      const inv = await invOf(); const rc = await conv(inv, "RECEIPT"); const ti = await conv(rc, "TAX_INVOICE");
      const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 1_000_000 }] });
      log(`B4 REST CN→INV ${await call({ type: "CREDIT_NOTE", sourceDocId: inv, adjustReason: "x" })} · CN→RECEIPT ${await call({ type: "CREDIT_NOTE", sourceDocId: rc, adjustReason: "x" })} · CN→TI ${await call({ type: "CREDIT_NOTE", sourceDocId: ti, adjustReason: "x" })} · DN→INV ${await call({ type: "DEBIT_NOTE", sourceDocId: inv, adjustReason: "x" })} · INV→QT ${await call({ type: "INVOICE", sourceDocId: q.id })} · DEP→QT ${await call({ type: "DEPOSIT_RECEIPT", sourceDocId: q.id })} · INV no source ${await call({ type: "INVOICE" })}`);
      const cv = await accSvc.convertDocument(T, A, q.id, "INVOICE");
      log(`B4 convert QT→INV (UI/CRM path) → ${short(cv)} · convert INV→RECEIPT/TI already exercised above`);
    }

    // ── B5 F5 cash-sale root edges ──
    { const mkR = async () => { const r0 = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 10_000_000 }] }); await accSvc.issueDocument(T, A, r0.id); return r0.id as string; };
      const r0 = await mkR(); const ti0 = await conv(r0, "TAX_INVOICE");
      const a = await cnOf(r0, 5_000_000); const b = await cnOf(ti0, 5_000_001); const c = await cnOf(ti0, 5_000_000);
      log(`B5a CN R0 half=${short(a)} · CN TI0 half+1sat(net)=${short(b)} · CN TI0 half=${short(c)} (expect ok, refused, ok)`);
      const vr = await accSvc.voidDocument(T, A, r0, "x");
      log(`B5b void R0 with live CN on TI0 → ${short(vr)} (expect refused)`);
      const r1 = await mkR(); const ti1 = await conv(r1, "TAX_INVOICE"); const v1 = await accSvc.voidDocument(T, A, r1, "x"); const c1 = await cnOf(ti1, 1_000_000);
      log(`B5c void R1=${short(v1)} then CN on its TI → ${short(c1)} (expect refused)`);
      const r2 = await mkR(); const ti2 = await conv(r2, "TAX_INVOICE"); const cn2 = await cnDraft(ti2, 2_000_000);
      let both = 0; for (let i = 0; i < 1; i += 1) { const rr = await Promise.all([accSvc.voidDocument(T, A, r2, "x"), accSvc.issueDocument(T, A, cn2)]); if (rr[0].ok && rr[1].ok) both += 1; }
      log(`B5d race void R2 ∥ CN on TI2 both-ok=${both}/1`);
      // paid cash-sale receipt (payments attached): CN on receipt cap vs TI
      const pay = await import("@/lib/modules/account/payment" as string) as Any;
      const r3 = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 10_000_000 }] });
      const ap = await pay.approveReceiptWithPayments(T, A, r3.id, [{ channel: "TRANSFER", amountSatang: 10_700_000, whtAmountSatang: 0, feeSatang: 0, paidAt: new Date().toISOString().slice(0, 10) }], {});
      const ti3 = ap.ok ? await conv(r3.id, "TAX_INVOICE") : null;
      const s3 = await st(r3.id);
      log(`B5e paid cash receipt approve=${short(ap)} paid=${s3.paidTotal} · CN on R3 full → ${short(await cnOf(r3.id, 10_000_000))} · CN on TI3 full → ${ti3 ? short(await cnOf(ti3, 10_000_000)) : "n/a"}`);
    }

    // ── B6 F7 rounding with VAT ──
    { const ar0 = await ar1100();
      const inv = await invOf({ unit: 100 }); // grand 107
      const p = await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 54 }); // remain 53
      const c = await cnOf(inv, 50); // 50 + VAT 3.5 → 54 (or 53)
      const s = await st(inv);
      const extraPay = await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 1 });
      const extraCn = await cnOf(inv, 1);
      const cnSum = Number((await P.accountDocument.aggregate({ where: { systemId: A, docType: "CREDIT_NOTE", sourceDocId: inv, status: "ISSUED" }, _sum: { grandTotal: true } }))._sum.grandTotal ?? 0);
      log(`B6 grand=107 pay54=${short(p)} CN(50+VAT)=${short(c)} grand=${cnSum} INV=${s.status} · extra 1sat pay → ${short(extraPay)} · extra 1sat CN → ${short(extraCn)} · paid+CN−grand=${(await st(inv)).paidTotal + cnSum - 107} (≤1 ok) · AR1100 Δ=${(await ar1100()) - ar0}`);
    }
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
  for (const id of USERS) { await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined); await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined); await P.user.delete({ where: { id } }).catch(() => undefined); }
  await prisma.$disconnect();
}
process.exit(0);
