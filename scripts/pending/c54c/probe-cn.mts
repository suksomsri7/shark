// C5.4-C builder self-probe (QC2 only · throwaway tenant `qc-c54c-*`) — credit-note paths the C5.3 oracle does not drive:
//   A. CN issued BEFORE payment (the real account flow: CN cap = grand − paid − CN) → customer pays the rest
//   B. CN after full payment (C5.3 fixture) → CN VOIDED through the real money bridge → paid / won / commission restored
//   C. CN first + payment with WHT (paidTotal maintained like the account) → DOC_SETTLE tops up the WHT, not the CN · commission EXACT (no 1-satang loss)
//   D. REAL account paths (createDocument · issueDocument · recordPayment · voidDocument · agingReport) + every account.* event of the
//      tenant delivered to the real CRM bridge handlers — reviewer B1 numbers: 107,000 / CN 10,700 / pay 96,300 → PAID → void CN →
//      PARTIAL · AR aging 10,700 · recordPayment 10,700 accepted → PAID · and a CN that covers the remainder flips the source to PAID
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54c/probe-cn.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-c54c-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean; msg: string }[] = [];
const chk = (id: string, ok: boolean, msg: string) => { res.push({ id, ok, msg }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`); };
const B = (v: Any) => (v === null || v === undefined ? null : Number(v));
const USERS: string[] = [];
let T = "";
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const MONEY = (await import("@/lib/platform/crm-bridges/money" as string)) as Any;
  const CORE = (await import("@/lib/platform/crm-bridges/core" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const OB = P.outboxEvent; const F = OB.findMany; OB.findMany = (a: Any) => F.call(OB, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: T }] } });
  const u = await P.user.create({ data: { email: `${TAG}-rep@qc.invalid`, name: `rep ${TAG}` } }); USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const actor = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const month = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7);
  const [yy, mm] = month.split("-").map(Number) as [number, number];
  const next = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
  const ACC = `${TAG}-acc`;
  const doc = (data: Any) => P.accountDocument.create({ data: { tenantId: T, systemId: ACC, discountAmount: 0, ...data } });
  const pay = (documentId: string, amount: number, wht = 0) => P.accountDocumentPayment.create({ data: { tenantId: T, systemId: ACC, documentId, amount, whtAmountSatang: wht } });
  let seq = 0;
  const mk = async (label: string) => {
    const S = (await sysSvc.createSystem(T, "CRM", `${label} ${TAG} ${++seq}`)).id as string;
    await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, commission: { approvalRequired: false, payrollLink: false } }), S);
    const p = await P.crmPipeline.create({ data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, isDefault: true, stages: { create: [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100]].map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) } }, include: { stages: true } });
    const party = await P.party.create({ data: { tenantId: T, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
    const k = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: party.id, ownerUserId: u.id } });
    await P.crmCommissionRule.create({ data: { tenantId: T, systemId: S, name: `กฎ ${TAG}`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [] } });
    return { S, ctx: { tenantId: T, systemId: S, actorUserId: u.id }, pipe: p.id as string, OPEN: (p.stages as Any[]).find((x) => x.kind === "OPEN").id as string, contactId: k.id as string };
  };
  const deal = (c: Any, extra: Any) => P.crmDeal.create({ data: { tenantId: T, systemId: c.S, contactId: c.contactId, pipelineId: c.pipe, stageId: c.OPEN, title: `ดีล ${TAG}`, valueSatang: 10_000_000, kind: "OPEN", ownerUserId: u.id, stageEnteredAt: new Date(), ...extra } });
  const state = async (c: Any, id: string) => {
    const d = await P.crmDeal.findUnique({ where: { id }, select: { paidSatang: true, wonValueSatang: true } });
    let comm = 0;
    for (const pk of [month, next]) { const r = await CRM.commissions.report(c.ctx, actor, { periodKey: pk }); comm += Number((r.rows as Any[]).find((x) => x.userId === u.id)?.netSatang ?? 0); }
    return { paid: B(d?.paidSatang), won: B(d?.wonValueSatang), comm };
  };
  const evt = (type: string, documentId: string) => ({ id: `${TAG}-${type}-${documentId}`, tenantId: T, type, payload: { documentId }, systemId: null, unitId: null });

  // A · CN before payment
  {
    const c = await mk("A");
    const INV = await doc({ docType: "INVOICE", status: "AWAITING_PAYMENT", subTotal: 10_000_000, vatAmount: 700_000, grandTotal: 10_700_000 });
    const d = await deal(c, { invoiceDocId: INV.id });
    const CN = await doc({ docType: "CREDIT_NOTE", status: "ISSUED", sourceDocId: INV.id, subTotal: 1_000_000, vatAmount: 70_000, grandTotal: 1_070_000 });
    await CORE.onDocumentIssued(evt("account.document.issued", CN.id));
    const s0 = await state(c, d.id);
    const p1 = await pay(INV.id, 9_630_000);
    await CRM.payments.recordDocPayment(c.ctx, { documentId: INV.id, paymentId: p1.id, amountSatang: 9_630_000 });
    const s1 = await state(c, d.id);
    const rows = await P.crmDealPayment.findMany({ where: { dealId: d.id }, select: { refType: true, status: true, satang: true } });
    chk("A.1", s0.paid === 0 && s0.won === null, `CN before any money: nothing counted, won untouched (paid=${s0.paid} won=${s0.won})`);
    chk("A.2", s1.paid === 9_630_000 && s1.won === 9_000_000 && s1.comm === 900_000 && !rows.some((r: Any) => r.refType === "CREDIT_NOTE" && r.status === "COUNTED"),
      `then 96,300 paid ⇒ paid 9,630,000 · won 9,000,000 (pre-VAT − CN) · commission 900,000 · no refund row — got paid=${s1.paid} won=${s1.won} comm=${s1.comm} rows=${JSON.stringify(rows.map((r: Any) => `${r.refType}:${r.status}:${B(r.satang)}`))}`);
  }
  // B · CN after full payment, then CN voided through the real bridge
  {
    const c = await mk("B");
    const INV = await doc({ docType: "INVOICE", status: "AWAITING_PAYMENT", subTotal: 10_000_000, vatAmount: 700_000, grandTotal: 10_700_000 });
    const d = await deal(c, { invoiceDocId: INV.id });
    const p1 = await pay(INV.id, 10_700_000);
    await CRM.payments.recordDocPayment(c.ctx, { documentId: INV.id, paymentId: p1.id, amountSatang: 10_700_000 });
    const s0 = await state(c, d.id);
    const CN = await doc({ docType: "CREDIT_NOTE", status: "ISSUED", sourceDocId: INV.id, subTotal: 1_000_000, vatAmount: 70_000, grandTotal: 1_070_000 });
    await CORE.onDocumentIssued(evt("account.document.issued", CN.id));
    const s1 = await state(c, d.id);
    await CORE.onDocumentIssued(evt("account.document.issued", CN.id)); // redelivery
    const s1b = await state(c, d.id);
    await P.accountDocument.update({ where: { id: CN.id }, data: { status: "VOIDED" } });
    await MONEY.onDocumentVoided(evt("account.document.voided", CN.id));
    const s2 = await state(c, d.id);
    const tag = await P.crmDeal.findUnique({ where: { id: d.id }, select: { tags: true } });
    chk("B.1", s0.paid === 10_700_000 && s0.won === 10_000_000 && s0.comm === 1_000_000, `full payment ⇒ paid 10,700,000 · won 10,000,000 · comm 1,000,000 — got ${JSON.stringify(s0)}`);
    chk("B.2", s1.paid === 9_630_000 && s1.won === 9_000_000 && s1.comm === 900_000 && JSON.stringify(s1b) === JSON.stringify(s1), `CN after full payment ⇒ paid 9,630,000 · won 9,000,000 · comm 900,000 · redelivery idempotent — got ${JSON.stringify(s1)} / ${JSON.stringify(s1b)}`);
    chk("B.3", s2.paid === 10_700_000 && s2.won === 10_000_000 && s2.comm === 1_000_000 && !(tag?.tags ?? []).includes("เอกสารถูกยกเลิก"), `CN voided ⇒ all three restored, deal NOT tagged "document voided" — got ${JSON.stringify(s2)} tags=${JSON.stringify(tag?.tags)}`);
  }
  // C · CN first, then payment with WHT 3 % of the pre-VAT remainder (account keeps paidTotal = cash + WHT)
  {
    const c = await mk("C");
    const INV = await doc({ docType: "INVOICE", status: "AWAITING_PAYMENT", subTotal: 10_000_000, vatAmount: 700_000, grandTotal: 10_700_000 });
    const d = await deal(c, { invoiceDocId: INV.id });
    const CN = await doc({ docType: "CREDIT_NOTE", status: "ISSUED", sourceDocId: INV.id, subTotal: 1_000_000, vatAmount: 70_000, grandTotal: 1_070_000 });
    await CORE.onDocumentIssued(evt("account.document.issued", CN.id));
    const p1 = await pay(INV.id, 9_360_000, 270_000);
    await P.accountDocument.update({ where: { id: INV.id }, data: { paidTotal: 9_630_000, status: "PAID" } });
    await CRM.payments.recordDocPayment(c.ctx, { documentId: INV.id, paymentId: p1.id, amountSatang: 9_360_000 });
    await CRM.payments.onInvoiceFullyPaid(c.ctx, { documentId: INV.id });
    const s = await state(c, d.id);
    const rows = await P.crmDealPayment.findMany({ where: { dealId: d.id, status: "COUNTED" }, select: { refType: true, satang: true } });
    chk("C.1", s.paid === 9_630_000 && s.won === 9_000_000 && s.comm === 900_000 && rows.some((r: Any) => r.refType === "DOC_SETTLE" && B(r.satang) === 270_000),
      `CN + cash 93,600 + WHT 2,700 ⇒ DOC_SETTLE 270,000 (the WHT, not the CN) · paid 9,630,000 · won 9,000,000 · commission EXACTLY 900,000 (one rounding per ratio — was 899,999) — got ${JSON.stringify(s)} rows=${JSON.stringify(rows.map((r: Any) => `${r.refType}:${B(r.satang)}`))}`);
  }
  // D · real account paths
  {
    const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
    const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
    const rep = (await import("@/lib/modules/account/reports" as string)) as Any;
    const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
    await accSvc.saveSettings(T, A, { orgName: "QC C54C", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
    await gl.ensureAccounting({ tenantId: T, systemId: A });
    const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
    const done = new Set<string>();
    const HANDLER: Record<string, Any> = {
      "account.document.issued": CORE.onDocumentIssued, "account.payment.recorded": MONEY.onPaymentRecorded, "account.invoice.paid": MONEY.onInvoicePaid,
      "account.document.voided": MONEY.onDocumentVoided, "account.payment.voided": MONEY.onPaymentVoided,
    };
    const deliver = async () => {
      const evs = (await P.outboxEvent.findMany({ where: { tenantId: T, type: { in: Object.keys(HANDLER) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[];
      for (const e of evs) if (!done.has(e.id)) { done.add(e.id); await HANDLER[e.type]({ id: e.id, tenantId: T, type: e.type, payload: e.payload, systemId: e.systemId, unitId: null }); }
    };
    const invOf = async () => {
      const inv = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
      await accSvc.issueDocument(T, A, inv.id);
      return inv.id as string;
    };
    const cnDraft = async (src: string, unit = 1_000_000) => (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: src, adjustReason: "รับคืนบางส่วน", vatMode: "EXCLUDE", lines: [{ description: "รับคืน", qty: 1, unitPrice: unit }] })).id as string;
    const cnOf = async (src: string, unit = 1_000_000) => {
      const id = await cnDraft(src, unit);
      const r = await accSvc.issueDocument(T, A, id);
      return { id, r };
    };
    const docSt = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, grandTotal: true, paidTotal: true } })) as Any;
    const paidEvt = async (id: string) => P.outboxEvent.count({ where: { tenantId: T, type: "account.invoice.paid", idempotencyKey: `account.invoice.paid#${id}` } });
    const c = await mk("D");
    // D1 · CN before payment → pay 96,300 → PAID → void CN → PARTIAL → aging 10,700 → pay 10,700 accepted
    const inv = await invOf();
    const d = await deal(c, { invoiceDocId: inv });
    await deliver();
    const cn = await cnOf(inv);
    await deliver();
    const st0 = await docSt(inv);
    const p1 = await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 9_630_000 });
    await deliver();
    const st1 = await docSt(inv);
    const s1 = await state(c, d.id);
    const ev1 = await paidEvt(inv);
    const ev1p = ((await P.outboxEvent.findFirst({ where: { tenantId: T, idempotencyKey: `account.invoice.paid#${inv}` }, select: { payload: true } })) as Any)?.payload ?? {};
    const v = await accSvc.voidDocument(T, A, cn.id, "ออกใบลดหนี้ผิด");
    await deliver();
    const st2 = await docSt(inv);
    const s2 = await state(c, d.id);
    const ag = await rep.agingReport({ tenantId: T, systemId: A }, { direction: "OUT" });
    const p2 = await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 1_070_000 });
    await deliver();
    const st3 = await docSt(inv);
    const s3 = await state(c, d.id);
    chk("D1.1", st0?.grandTotal === 10_700_000 && cn.r?.ok !== false && st0?.status === "AWAITING_PAYMENT", `invoice 107,000 issued · CN 10,700 issued before payment · invoice still AWAITING_PAYMENT — got ${JSON.stringify(st0)} cn=${JSON.stringify(cn.r)}`);
    chk("D1.2p", ev1p.paidTotalSatang === 9_630_000 && ev1p.creditNoteSatang === 1_070_000 && ev1p.grandTotalSatang === 10_700_000, `account.invoice.paid payload carries paidTotalSatang 9,630,000 + creditNoteSatang 1,070,000 (additive) — got ${JSON.stringify(ev1p)}`);
    chk("D1.2", p1?.ok === true && st1?.status === "PAID" && ev1 === 1 && s1.paid === 9_630_000 && s1.won === 9_000_000 && s1.comm === 900_000,
      `recordPayment 96,300 ⇒ invoice PAID + account.invoice.paid · CRM paid 9,630,000 · won 9,000,000 · commission 900,000 — got pay=${JSON.stringify(p1)} doc=${JSON.stringify(st1)} evt=${ev1} crm=${JSON.stringify(s1)}`);
    chk("D1.3", v?.ok === true && st2?.status === "PARTIAL" && st2?.paidTotal === 9_630_000 && s2.won === 10_000_000 && s2.paid === 9_630_000,
      `voidDocument(CN) ⇒ invoice PAID → PARTIAL (paid 96,300 < 107,000) · CRM won back to 10,000,000 · paid unchanged — got void=${JSON.stringify(v)} doc=${JSON.stringify(st2)} crm=${JSON.stringify(s2)}`);
    chk("D1.4", Number(ag?.grand?.totalSatang) === 1_070_000, `AR aging (OUT) outstanding = 10,700 — got ${ag?.grand?.totalSatang}`);
    chk("D1.5", p2?.ok === true && st3?.status === "PAID" && s3.paid === 10_700_000 && s3.won === 10_000_000 && s3.comm === 1_000_000,
      `recordPayment 10,700 accepted ⇒ PAID · CRM paid 10,700,000 · won 10,000,000 · commission 1,000,000 — got pay=${JSON.stringify(p2)} doc=${JSON.stringify(st3)} crm=${JSON.stringify(s3)}`);
    // D2 · paid 96,300 first (PARTIAL) → CN 10,700 covering the remainder ⇒ source PAID (same rule as recordPayment)
    const inv2 = await invOf();
    const d2 = await deal(c, { invoiceDocId: inv2 });
    await deliver();
    const q1 = await accSvc.recordPayment(T, A, inv2, { channel: "TRANSFER", amount: 9_630_000 });
    await deliver();
    const u1 = await docSt(inv2);
    const cn2 = await cnOf(inv2);
    await deliver();
    const u2 = await docSt(inv2);
    const e2 = await paidEvt(inv2);
    const t2 = await state(c, d2.id);
    chk("D2.1", q1?.ok === true && u1?.status === "PARTIAL" && cn2.r?.ok !== false && u2?.status === "PAID" && e2 === 1 && t2.paid === 9_630_000 && t2.won === 9_000_000,
      `pay 96,300 ⇒ PARTIAL · CN 10,700 covering the rest ⇒ PAID + account.invoice.paid · CRM paid 9,630,000 · won 9,000,000 — got pay=${JSON.stringify(q1)} before=${JSON.stringify(u1)} after=${JSON.stringify(u2)} evt=${e2} crm=${JSON.stringify(t2)}`);
    // D4 · (round 3 · 1) a CN that credits an UNPAID invoice in full ⇒ PAID (no debt left) but NO account.invoice.paid (no money received)
    const inv4 = await invOf();
    const d4 = await deal(c, { invoiceDocId: inv4 });
    await deliver();
    const cn4 = await cnOf(inv4, 10_000_000);
    await deliver();
    const w4 = await docSt(inv4);
    const e4 = await paidEvt(inv4);
    const t4 = await P.crmDeal.findUnique({ where: { id: d4.id }, select: { kind: true, paidSatang: true, wonValueSatang: true } });
    chk("D4.1", cn4.r?.ok !== false && w4?.status === "PAID" && w4?.paidTotal === 0 && e4 === 0 && t4?.kind === "OPEN" && B(t4?.paidSatang) === 0,
      `CN 107,000 on an unpaid invoice ⇒ PAID · paidTotal 0 · NO invoice.paid event · CRM deal untouched (OPEN · paid 0) — got cn=${JSON.stringify(cn4.r)} doc=${JSON.stringify(w4)} evt=${e4} deal=${JSON.stringify({ kind: t4?.kind, paid: B(t4?.paidSatang) })}`);
    // D5 · (round 3 · 2) CN racing a payment for the same remainder (10,700): exactly one wins, never paid + CN > grand — 4 rounds, alternating who starts
    const race: string[] = [];
    let raceOk = true;
    for (let i = 0; i < 4; i += 1) {
      const inv5 = await invOf();
      await accSvc.recordPayment(T, A, inv5, { channel: "TRANSFER", amount: 9_630_000 });
      const draft = await cnDraft(inv5);
      // alternate which side starts first (odd rounds: the CN issue is fired first)
      const payP = () => accSvc.recordPayment(T, A, inv5, { channel: "TRANSFER", amount: 1_070_000 });
      const cnP = () => accSvc.issueDocument(T, A, draft);
      const [rp, rc] = i % 2 === 0 ? await Promise.all([payP(), cnP()]) : (await Promise.all([cnP(), payP()])).reverse();
      const doc5 = await docSt(inv5);
      const cn5 = Number((await P.accountDocument.aggregate({ where: { systemId: A, docType: "CREDIT_NOTE", sourceDocId: inv5, status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } }, _sum: { grandTotal: true } }))._sum.grandTotal ?? 0);
      const wins = (rp?.ok === true ? 1 : 0) + (rc?.ok === true ? 1 : 0);
      const ok = wins === 1 && doc5.paidTotal + cn5 === doc5.grandTotal && doc5.status === "PAID";
      raceOk &&= ok;
      race.push(`r${i}: pay=${rp?.ok ? "ok" : "refused"} cn=${rc?.ok ? "ok" : "refused"} paid=${doc5.paidTotal} cn=${cn5} ${doc5.status}`);
    }
    await deliver();
    chk("D5.1", raceOk, `CN ∥ payment for the same last 10,700 (source row locked before the CN cap is read): exactly one accepted, paid + CN = grand, PAID — ${race.join(" · ")}`);
    // E · round 4 (money hunt) — invoice family (CN on RECEIPT/TAX_INVOICE) · real refund path · F5 · F3 deadlock
    const conv = async (src: string, to: string) => { const r = await accSvc.convertDocument(T, A, src, to); if (!r.ok) throw new Error(`convert ${to}: ${r.reason}`); const i = await accSvc.issueDocument(T, A, r.newId); if (!i.ok) throw new Error(`issue ${to}: ${i.reason}`); return r.newId as string; };
    const outst = async (id: string) => { const f = await accSvc.paymentTargetOf(T, A, id); return f ? accSvc.paymentOutstandingOf(f.target) : null; };
    { // E1 (F1) CN on the TI of an UNPAID invoice ⇒ outstanding 96,300 · paying 107,000 refused · paying 96,300 ⇒ PAID
      const iv = await invOf(); await deliver();
      const ti = await conv(iv, "TAX_INVOICE"); await deliver();
      const cn = await cnOf(ti); await deliver();
      const o = await outst(iv);
      const over = await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: 10_700_000 });
      const ok = await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: 9_630_000 }); await deliver();
      const s1 = await docSt(iv);
      chk("E1", cn.r?.ok !== false && o === 9_630_000 && over?.ok === false && ok?.ok === true && s1?.status === "PAID", `CN 10,700 on the TAX_INVOICE of an unpaid IV ⇒ outstanding 96,300 · 107,000 refused · 96,300 ⇒ PAID — got cn=${JSON.stringify(cn.r)} outstanding=${o} over=${JSON.stringify(over)} ok=${JSON.stringify(ok)} IV=${JSON.stringify(s1)}`);
    }
    { // E2 (F4) CN 107,000 on IV ⇒ a second CN 107,000 on its TI is refused (family cap)
      const iv = await invOf(); await deliver();
      const ti = await conv(iv, "TAX_INVOICE"); await deliver();
      const a = await cnOf(iv, 10_000_000); const b = await cnOf(ti, 10_000_000); await deliver();
      chk("E2", a.r?.ok === true && b.r?.ok === false, `family cap: CN 107,000 on IV accepted · CN 107,000 on its TI refused — got a=${JSON.stringify(a.r)} b=${JSON.stringify(b.r)}`);
    }
    { // E3 (F2) real refund after full payment: CN 107,000 on the RECEIPT ⇒ CRM CREDIT_NOTE −10,700,000 · paid 0 · won 0 · commission clawed back 1,000,000
      const iv = await invOf(); const dd = await deal(c, { invoiceDocId: iv }); await deliver();
      await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: 10_700_000 }); await deliver();
      const b0 = await state(c, dd.id);
      const rc = await conv(iv, "RECEIPT"); await deliver();
      const cn = await cnOf(rc, 10_000_000); await deliver();
      const b1 = await state(c, dd.id);
      const rows = (await P.crmDealPayment.findMany({ where: { dealId: dd.id, status: "COUNTED" }, select: { refType: true, satang: true } })) as Any[];
      const comm = Number((await P.crmCommission.aggregate({ where: { tenantId: T, dealId: dd.id, status: { in: ["APPROVED", "PAID", "REVERSED"] } }, _sum: { amountSatang: true } }))._sum.amountSatang ?? 0);
      chk("E3", cn.r?.ok === true && b1.paid === 0 && b1.won === 0 && comm === 0 && rows.some((r) => r.refType === "CREDIT_NOTE" && B(r.satang) === -10_700_000),
        `full refund via CN on the RECEIPT ⇒ CREDIT_NOTE −10,700,000 · paid 0 · won 0 · deal commission net 0 (clawback 1,000,000) — before ${JSON.stringify(b0)} · got cn=${JSON.stringify(cn.r)} crm=${JSON.stringify(b1)} dealComm=${comm} rows=${JSON.stringify(rows.map((r) => `${r.refType}:${B(r.satang)}`))}`);
    }
    { // E4 (F5) CN on a DEPOSIT_RECEIPT is refused in Thai
      const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
      await accSvc.issueDocument(T, A, q.id);
      const dep = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "DEPOSIT_RECEIPT", contactId: cust.id, sourceDocId: q.id, vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: 3_000_000 }] });
      await accSvc.issueDocument(T, A, dep.id);
      const r = await cnOf(dep.id, 100_000);
      chk("E4", r.r?.ok === false && /ใบลดหนี้ของเงินมัดจำ/.test(String(r.r?.reason ?? "")), `CN on a DEPOSIT_RECEIPT refused with the deposit-specific Thai reason (round 5 · G1 refuse) — got ${JSON.stringify(r.r)}`);
    }
    { // E5 (F3) voidDocument(CN1) ∥ issueDocument(CN2) and ∥ recordPayment — no deadlock, state = receivableStatusOf · 3 rounds each
      const res: string[] = [];
      let good = true;
      for (let i = 0; i < 6; i += 1) {
        const iv = await invOf();
        await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: 5_350_000 });
        const cn1 = await cnOf(iv, 1_000_000);
        const r = i < 3
          ? await Promise.all([accSvc.voidDocument(T, A, cn1.id, "ผิด"), accSvc.issueDocument(T, A, await cnDraft(iv, 1_000_000))])
          : await Promise.all([accSvc.voidDocument(T, A, cn1.id, "ผิด"), accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: 1_000_000 })]);
        const sx = await docSt(iv);
        const cnx = Number((await P.accountDocument.aggregate({ where: { systemId: A, docType: "CREDIT_NOTE", sourceDocId: iv, status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } }, _sum: { grandTotal: true } }))._sum.grandTotal ?? 0);
        const exp = accSvc.receivableStatusOf(sx.grandTotal, sx.paidTotal, cnx);
        const dead = r.some((q: Any) => q?.ok === false && /deadlock|40P01|ไม่สำเร็จ/.test(String(q?.reason ?? "")));
        good &&= r.every((q: Any) => q?.ok === true) && !dead && sx.status === exp;
        res.push(`${i < 3 ? "void∥issue" : "void∥pay"}#${i}: ${r.map((q: Any) => (q?.ok ? "ok" : String(q?.reason).slice(0, 30))).join("|")} IV=${sx.status}/${exp}`);
      }
      chk("E5", good, `CN void racing a 2nd CN issue / a payment on the same IV: both succeed, no deadlock, status = receivableStatusOf — ${res.join(" · ")}`);
    }
    { // E6 (round 5 · G2/G3) CN on a VOIDED receipt refused · voiding an invoice that carries a live CN refused (void the CN first ⇒ ok)
      const iv = await invOf(); await deliver();
      await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: 10_700_000 });
      const rc = await conv(iv, "RECEIPT");
      const vrc = await accSvc.voidDocument(T, A, rc, "ออกผิด");
      const onVoided = await cnOf(rc, 1_000_000);
      const iv2 = await invOf();
      const cn = await cnOf(iv2, 1_000_000);
      const v1 = await accSvc.voidDocument(T, A, iv2, "ยกเลิก");
      const vcn = await accSvc.voidDocument(T, A, cn.id, "ยกเลิกใบลดหนี้");
      const v2 = await accSvc.voidDocument(T, A, iv2, "ยกเลิก");
      await deliver();
      chk("E6", vrc?.ok === true && onVoided.r?.ok === false && /ยกเลิก/.test(String(onVoided.r?.reason)) && v1?.ok === false && /ยกเลิกใบลดหนี้ก่อน/.test(String(v1?.reason)) && vcn?.ok === true && v2?.ok === true,
        `G2: CN on a voided RECEIPT refused · G3: void IV with a live CN refused, void CN then IV ok — got voidRC=${JSON.stringify(vrc)} cnOnVoided=${JSON.stringify(onVoided.r)} voidIV=${JSON.stringify(v1)} voidCN=${JSON.stringify(vcn)} voidIVafter=${JSON.stringify(v2)}`);
    }
    // D3 · Q2: dashboard "paid" bucket (revenue) = grand − live CN of each PAID invoice ⇒ inv 107,000 + inv2 (107,000 − 10,700) = 203,300
    const dash = (await import("@/lib/modules/account/dashboard" as string)) as Any;
    const yr = Number(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 4));
    const ser = await dash.monthlyStatusSeries({ tenantId: T, systemId: A }, "revenue", yr);
    const tot = ser?.total ?? {};
    const allPaid = (await P.accountDocument.findMany({ where: { tenantId: T, systemId: A, docType: "INVOICE", status: "PAID" }, select: { id: true, grandTotal: true } })) as Any[];
    let expPaid = 0;
    for (const x of allPaid) expPaid += Math.max(0, x.grandTotal - Number((await P.accountDocument.aggregate({ where: { systemId: A, docType: "CREDIT_NOTE", sourceDocId: { in: await accSvc.docFamilyIds(P, A, x.id) }, status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } }, _sum: { grandTotal: true } }))._sum.grandTotal ?? 0));
    chk("D3.1", tot.paid === expPaid && tot.paidCount === allPaid.length && tot.grand === tot.paid + tot.awaiting + tot.overdue,
      `dashboard revenue paid bucket = Σ (grand − live CN) of PAID invoices = ${expPaid} (${allPaid.length} invoices) and paid+awaiting+overdue = grand — got ${JSON.stringify(tot)}`);
  }
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  if (T) {
    const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0;
    for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    chk("CLEAN", left === 0 && (await P.tenant.count({ where: { id: T } })) === 0, `tenant rows left=${left}`);
  }
  for (const id of USERS) { await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined); await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined); await P.user.delete({ where: { id } }).catch(() => undefined); }
  await prisma.$disconnect();
}
const passed = res.filter((r) => r.ok).length;
console.log(`\n${passed === res.length ? "🟢" : "🔴"} probe-cn: ${passed}/${res.length}`);
process.exit(passed === res.length ? 0 : 1);
