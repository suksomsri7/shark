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
    { // E7 (round 6 · F6) REST documents.create: INVOICE with sourceDocId = another INVOICE ⇒ 422 validation (Thai) · with a QUOTATION ⇒ ok
      const OPS = (await import("@/lib/modules/account/api/ops/documents-write" as string)) as Any;
      const op = (OPS.DOCUMENTS_WRITE_OPS as Any[]).find((o) => o.id === "documents.create");
      const actor = { kind: "apikey", tenantId: T, systemId: A };
      const ivA = await invOf();
      const line = [{ description: "งาน", qty: 1, unitPriceSatang: 10_000_000 }];
      let bad: Any = null;
      try { await op.handler({ actor, input: op.input.parse({ type: "INVOICE", contactId: cust.id, sourceDocId: ivA, lines: line }) }); bad = { ok: true }; } catch (e) { bad = { status: (e as Any)?.status, code: (e as Any)?.code, msg: String((e as Any)?.message_th ?? (e as Any)?.message ?? e) }; }
      const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
      let good: Any = null;
      try { good = await op.handler({ actor, input: op.input.parse({ type: "INVOICE", contactId: cust.id, sourceDocId: q.id, lines: line }) }); } catch (e) { good = { err: String((e as Any)?.message ?? e) }; }
      let svc: Any = null;
      try { await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, sourceDocId: ivA, lines: [{ description: "งาน", qty: 1, unitPrice: 1 }] }); svc = "created"; } catch (e) { svc = String((e as Any)?.message ?? e); }
      chk("E7", bad?.status === 422 && bad?.code === "validation" && /ใบเสนอราคา/.test(String(bad?.msg)) && !good?.err && /ใบเสนอราคา/.test(String(svc)),
        `REST INVOICE→INVOICE source ⇒ 422 validation (Thai) · INVOICE→QUOTATION ok · service path refuses too — got bad=${JSON.stringify(bad)} good=${JSON.stringify(good?.err ? good : "ok")} svc=${svc}`);
    }
    { // F (round 7 · N1) cheque lifecycle races — lock order cheque → document → payment (CAS) · 5 rounds each · invariant paidTotal = Σ live payments
      const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
      const exp = (await import("@/lib/modules/account/expense" as string)) as Any;
      const liveSum = async (docId: string) => Number((await P.accountDocumentPayment.aggregate({ where: { documentId: docId, voidedAt: null }, _sum: { amount: true } }))._sum.amount ?? 0);
      const bounceEntries = async (cid: string) => P.accountJournalEntry.count({ where: { systemId: A, refType: "AccountCheque", refId: cid } });
      const out: string[] = [];
      let bad = 0;
      let n = 0;
      const vend = await accSvc.createContact({ tenantId: T, systemId: A, kind: "VENDOR", legalType: "COMPANY", name: `ผู้ขาย ${TAG}`, taxId: "0105562222222" });
      for (let i = 0; i < 5; i += 1) {
        // F1 bounce ∥ bounce
        { const iv = await invOf(); await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: 5_000_000 });
          const c1 = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `BB${i}`, bankName: "B", chequeDate: new Date(), amount: 3_000_000, documentId: iv });
          const r = await Promise.all([cheque.bounceCheque(T, A, c1.id, "x"), cheque.bounceCheque(T, A, c1.id, "x")]);
          const s = await docSt(iv); const live = await liveSum(iv); const ok = r.filter((q: Any) => q.ok).length;
          n += 1; if (!(ok === 1 && s.paidTotal === live && live === 5_000_000 && (await bounceEntries(c1.id)) === 2)) bad += 1;
          if (i === 0) out.push(`bounce∥bounce ${r.map((q: Any) => (q.ok ? "ok" : q.reason)).join("|")} paid=${s.paidTotal} live=${live}`); }
        // F2 clear ∥ bounce
        { const iv = await invOf();
          const c1 = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `CB${i}`, bankName: "B", chequeDate: new Date(), amount: 3_000_000, documentId: iv });
          const r = i % 2 === 0 ? await Promise.all([cheque.clearCheque(T, A, c1.id), cheque.bounceCheque(T, A, c1.id, "x")]) : (await Promise.all([cheque.bounceCheque(T, A, c1.id, "x"), cheque.clearCheque(T, A, c1.id)])).reverse();
          const s = await docSt(iv); const live = await liveSum(iv); const cs = (await P.accountCheque.findUnique({ where: { id: c1.id }, select: { status: true } }))?.status;
          const consistent = r[1].ok ? cs === "BOUNCED" && live === 0 : cs === "CLEARED" && live === 3_000_000;
          n += 1; if (!(r[1].ok || r[0].ok) || !consistent || s.paidTotal !== live) bad += 1;
          if (i < 2) out.push(`clear∥bounce ${r.map((q: Any) => (q.ok ? "ok" : q.reason)).join("|")} cheque=${cs} paid=${s.paidTotal} live=${live}`); }
        // F3 voidPayment(cheque payment) ∥ bounce
        { const iv = await invOf(); await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: 5_000_000 });
          const c1 = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `VB${i}`, bankName: "B", chequeDate: new Date(), amount: 3_000_000, documentId: iv });
          const cp = await P.accountDocumentPayment.findFirst({ where: { chequeId: c1.id }, select: { id: true } });
          const r = await Promise.all([accSvc.voidPayment(T, A, iv, cp.id, "x"), cheque.bounceCheque(T, A, c1.id, "x")]);
          const s = await docSt(iv); const live = await liveSum(iv);
          n += 1; if (!(s.paidTotal === live && live === 5_000_000)) bad += 1;
          if (i === 0) out.push(`voidPayment∥bounce ${r.map((q: Any) => (q.ok ? "ok" : q.reason)).join("|")} paid=${s.paidTotal} live=${live}`); }
        // F4 voidCheque ∥ voidCheque and voidCheque ∥ voidVendorPayment (OUT cheque on an expense)
        { const ex = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 10_000_000 }] });
          await exp.issueExpenseDoc(T, A, ex.id);
          const c1 = await cheque.createCheque({ tenantId: T, systemId: A, direction: "OUT", chequeNo: `VO${i}`, bankName: "B", chequeDate: new Date(), amount: 3_000_000, documentId: ex.id });
          const cp = await P.accountDocumentPayment.findFirst({ where: { chequeId: c1.id }, select: { id: true } });
          const r = i % 2 === 0 ? await Promise.all([cheque.voidCheque(T, A, c1.id, "x"), cheque.voidCheque(T, A, c1.id, "x")]) : await Promise.all([cheque.voidCheque(T, A, c1.id, "x"), exp.voidVendorPayment(T, A, ex.id, cp.id, "x")]);
          const s = await docSt(ex.id); const live = await liveSum(ex.id);
          n += 1; if (!(c1.ok && s.paidTotal === live && live === 0 && (i % 2 === 1 || r.filter((q: Any) => q.ok).length === 1))) bad += 1;
          if (i < 2) out.push(`${i % 2 === 0 ? "voidCheque∥voidCheque" : "voidCheque∥voidVendorPayment"} ${r.map((q: Any) => (q.ok ? "ok" : q.reason)).join("|")} paid=${s.paidTotal} live=${live}`); }
      }
      { // F2 (round 7 · ruling B2c) sequential: voidPayment on a live-cheque payment REFUSED (nothing written) → bounce → sub-ledger = GL
        const ar = async () => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = '1100'`, A)) as Any[])[0]?.n);
        const iv = await invOf(); await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: 5_000_000 });
        const c1 = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: "B2C", bankName: "B", chequeDate: new Date(), amount: 3_000_000, documentId: iv });
        const cp = await P.accountDocumentPayment.findFirst({ where: { chequeId: c1.id }, select: { id: true } });
        const ar0 = await ar(); const s0 = await docSt(iv);
        const vp = await accSvc.voidPayment(T, A, iv, cp.id, "x");
        const s1 = await docSt(iv); const pv = await P.accountDocumentPayment.findUnique({ where: { id: cp.id }, select: { voidedAt: true } });
        const b = await cheque.bounceCheque(T, A, c1.id, "x");
        const s2 = await docSt(iv); const live = await liveSum(iv); const arD = (await ar()) - ar0;
        const out2 = accSvc.paymentOutstandingOf((await accSvc.paymentTargetOf(T, A, iv)).target);
        const vAfter = await accSvc.voidPayment(T, A, iv, cp.id, "x"); // cheque now BOUNCED + payment already voided ⇒ harmless refusal
        // purchase side: voidVendorPayment on a live OUT cheque refused
        const ex = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 10_000_000 }] });
        await exp.issueExpenseDoc(T, A, ex.id);
        const co = await cheque.createCheque({ tenantId: T, systemId: A, direction: "OUT", chequeNo: "B2CO", bankName: "B", chequeDate: new Date(), amount: 3_000_000, documentId: ex.id });
        const cop = await P.accountDocumentPayment.findFirst({ where: { chequeId: co.id }, select: { id: true } });
        const vvp = await exp.voidVendorPayment(T, A, ex.id, cop.id, "x");
        // non-cheque payment still voidable
        const iv2 = await invOf(); const tp = await accSvc.recordPayment(T, A, iv2, { channel: "TRANSFER", amount: 1_000_000 });
        const vt = await accSvc.voidPayment(T, A, iv2, tp.paymentId, "x");
        chk("F2", vp?.ok === false && /ทะเบียนเช็ค/.test(String(vp?.reason)) && s1.paidTotal === s0.paidTotal && pv?.voidedAt === null && b?.ok === true && s2.paidTotal === live && live === 5_000_000 && out2 === 5_700_000 && arD === 3_000_000 && vAfter?.ok === false
          && vvp?.ok === false && /ทะเบียนเช็ค/.test(String(vvp?.reason)) && vt?.ok === true,
          `B2c: voidPayment(live cheque) refused, nothing written · bounce ok ⇒ paid 5,000,000 = live · outstanding 5,700,000 · GL AR Δ +3,000,000 (= sub-ledger) · voidVendorPayment(live OUT cheque) refused · plain transfer still voidable — got vp=${JSON.stringify(vp)} paid ${s0.paidTotal}→${s1.paidTotal}→${s2.paidTotal} live=${live} out=${out2} arΔ=${arD} vAfter=${JSON.stringify(vAfter)} vvp=${JSON.stringify(vvp)} vt=${JSON.stringify(vt)}`);
      }
      { // F3 legacy refusal phrases kept (qc-acc-v2-wht-cheque T14.3/.5/.7/.9/.10 wording)
        const ci = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: "LG1", bankName: "B", chequeDate: new Date(), amount: 100_000 });
        const b1 = await cheque.bounceCheque(T, A, ci.id, "x");
        const cl = await cheque.clearCheque(T, A, ci.id); const b2 = await cheque.bounceCheque(T, A, ci.id, "x");
        const co = await cheque.createCheque({ tenantId: T, systemId: A, direction: "OUT", chequeNo: "LG2", bankName: "B", chequeDate: new Date(), amount: 100_000 });
        const v1 = await cheque.voidCheque(T, A, co.id, "ยกเลิกทดสอบ"); const v2 = await cheque.voidCheque(T, A, co.id, "ยกเลิกทดสอบ");
        const wrongVoid = await cheque.voidCheque(T, A, ci.id, "ยกเลิกทดสอบ"); const wrongBounce = await cheque.bounceCheque(T, A, co.id, "x");
        chk("F3", b1.ok && /นำฝากก่อน/.test(String(cl.reason)) && /สถานะเช็คไม่รองรับการทำเด้ง/.test(String(b2.reason)) && v1.ok && /ยกเลิกได้เฉพาะเช็คจ่ายที่ยังไม่ถูกเรียกเก็บ/.test(String(v2.reason))
          && /ยกเลิกได้เฉพาะเช็คจ่าย/.test(String(wrongVoid.reason)) && /เด้งได้เฉพาะเช็ครับ/.test(String(wrongBounce.reason)),
          `legacy phrases kept — clear(BOUNCED)=${cl.reason} · bounce twice=${b2.reason} · void twice=${v2.reason} · void IN=${wrongVoid.reason} · bounce OUT=${wrongBounce.reason}`);
      }
      { // G (round 8b · R8-1 option a) group payment by ONE cheque — the cheque is linked to the FIRST child payment only (chequeId is UNIQUE);
        //   the other child payments of the same batch are found through the idempotency key `GRP#<group>#<client>#<child>`.
        //   G1b sales ×2 · G1c sales ×3 + sibling void · G1d purchase ×2/×3 · G1e transfer batch unaffected · G1f two cheque batches on one group ·
        //   G1g concurrency ×10 (bounce ∥ voidPayment(sibling) · bounce ∥ voidGroupPayment · bounce ∥ bounce) + purchase ×5 pairs
        const grp = (await import("@/lib/modules/account/group" as string)) as Any;
        const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
        const bal = async (code: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = $2`, A, code)) as Any[])[0]?.n);
        const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
        const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
        if (!bank?.ok) throw new Error(`bank: ${bank?.reason}`);
        const expOf = async () => {
          const ex = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 10_000_000 }] });
          const r = await exp.issueExpenseDoc(T, A, ex.id); if (!r.ok) throw new Error(`issue exp: ${r.reason}`);
          return ex.id as string;
        };
        let gseq = 0;
        const payGrp = async (x: Any, how: "CHEQUE" | "TRANSFER", tieOff: number) => {
          gseq += 1;
          const r = await grp.recordGroupPayment(T, A, x.g.id, { paidAt: today, financeAccountId: bank.id, tieOffSatang: tieOff, note: "", feeSatang: 0, wht: [], cheque: how === "CHEQUE" ? { chequeNo: `GC${gseq}`, bankName: "KBank", chequeDate: today } : null }, { clientKey: `k${gseq}_${randomBytes(3).toString("hex")}` });
          if (!r.ok) throw new Error(`group pay: ${r.reason}`);
          const pays = (await P.accountDocumentPayment.findMany({ where: { tenantId: T, systemId: A, idempotencyKey: { startsWith: `${r.batchKey}#` } }, orderBy: [{ documentId: "asc" }], select: { id: true, documentId: true, chequeId: true } })) as Any[];
          return { r, batchKey: r.batchKey as string, pays, cq: (pays.find((p) => p.chequeId)?.chequeId ?? null) as string | null };
        };
        const mkGrp = async (side: "IN" | "OUT", n: number, how: "CHEQUE" | "TRANSFER" | null) => {
          const ar0 = await bal("1100"); const ap0 = -(await bal("2100"));
          const kids: string[] = []; for (let i = 0; i < n; i += 1) kids.push(side === "IN" ? await invOf() : await expOf());
          const g = await grp.createGroupDoc(T, A, { docType: side === "IN" ? "BILLING_NOTE" : "COMBINED_PAYMENT", contactId: side === "IN" ? cust.id : vend.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] });
          if (!g.ok) throw new Error(`group: ${g.reason}`);
          const x: Any = { side, g, kids, ar0, ap0, b: null };
          if (how) x.b = await payGrp(x, how, n * 10_700_000);
          return x;
        };
        const outOf = async (x: Any) => { let o = 0; for (const id of x.kids) { if (x.side === "IN") o += accSvc.paymentOutstandingOf((await accSvc.paymentTargetOf(T, A, id)).target); else { const s = await docSt(id); o += s.grandTotal - s.paidTotal; } } return o; };
        // GL: AR (1100 Dr) or AP (2100 Cr) movement since before the children were issued = Σ outstanding (true debt) when every payment is undone
        const glDelta = async (x: Any) => (x.side === "IN" ? (await bal("1100")) - x.ar0 : -(await bal("2100")) - x.ap0);
        const inv = async (x: Any) => { const bad: string[] = []; for (const id of x.kids) { const s = await docSt(id); const l = await liveSum(id); if (s.paidTotal !== l) bad.push(`${id.slice(-4)} paid ${s.paidTotal} ≠ live ${l}`); } return bad; };
        const snap = async (x: Any) => JSON.stringify({
          je: await P.accountJournalEntry.count({ where: { systemId: A } }),
          ob: await P.outboxEvent.count({ where: { tenantId: T } }),
          voided: await P.accountDocumentPayment.count({ where: { documentId: { in: x.kids }, voidedAt: { not: null } } }),
          docs: await Promise.all(x.kids.map((id: string) => docSt(id))),
        });
        const sib = (x: Any) => x.b.pays.find((p: Any) => !p.chequeId) as Any; // a child payment NOT carrying the chequeId
        const lastSib = (x: Any) => [...x.b.pays].reverse().find((p: Any) => !p.chequeId) as Any;
        const allZero = async (x: Any) => (await Promise.all(x.kids.map((id: string) => docSt(id)))).every((d: Any) => d.paidTotal === 0 && d.status === "AWAITING_PAYMENT");
        const J = (v: Any) => JSON.stringify(v?.ok ? { ok: true, ...(v.voided !== undefined ? { voided: v.voided } : {}) } : v);

        { // G1b (i)+(ii-sales)+(iv) sales ×2 — linked 1/2 · voidGroupPayment with live cheque refused, ZERO writes · bounce restores BOTH · Σ outstanding = true debt = GL AR Δ
          const x = await mkGrp("IN", 2, "CHEQUE");
          const linked = x.b.pays.filter((p: Any) => p.chequeId === x.b.cq).length;
          const s0 = await snap(x);
          const v = await grp.voidGroupPayment(T, A, x.g.id, x.b.batchKey, "x");
          const s1 = await snap(x);
          const b = await cheque.bounceCheque(T, A, x.b.cq, "x");
          const o = await outOf(x); const gd = await glDelta(x); const bad = await inv(x);
          chk("G1b", linked === 1 && x.b.pays.length === 2 && v?.ok === false && /ทะเบียนเช็ค/.test(String(v?.reason)) && s0 === s1 && b?.ok === true && (await allZero(x)) && o === 21_400_000 && gd === 21_400_000 && bad.length === 0,
            `sales group cheque ×2: linked ${linked}/${x.b.pays.length} (by design) · voidGroupPayment(live) → ${J(v)} · zero writes ${s0 === s1} · bounce → ${J(b)} both AWAITING_PAYMENT paid 0 · Σ outstanding ${o} = true debt 21,400,000 = GL AR Δ ${gd} · paid==live ${bad.join(";") || "held"}`);
        }
        { // G1c (i)+(iii) sales ×3 — voidPayment on a NON-linked sibling while the cheque is live ⇒ refused, nothing written · bounce restores ALL 3 · after bounce ⇒ calm "already voided"
          const x = await mkGrp("IN", 3, "CHEQUE");
          const p = lastSib(x);
          const s0 = await snap(x);
          const vp = await accSvc.voidPayment(T, A, p.documentId, p.id, "x");
          const s1 = await snap(x);
          const b = await cheque.bounceCheque(T, A, x.b.cq, "x");
          const o = await outOf(x); const gd = await glDelta(x); const bad = await inv(x);
          const vAfter = await accSvc.voidPayment(T, A, p.documentId, p.id, "x");
          chk("G1c", vp?.ok === false && /ทะเบียนเช็ค/.test(String(vp?.reason)) && s0 === s1 && b?.ok === true && (await allZero(x)) && o === 32_100_000 && gd === 32_100_000 && bad.length === 0
            && vAfter?.ok === false && /ถูกยกเลิกแล้ว/.test(String(vAfter?.reason)),
            `sales group cheque ×3: voidPayment(sibling, live cheque) → ${J(vp)} · zero writes ${s0 === s1} · bounce → ${J(b)} · all 3 restored ${await allZero(x)} · Σ outstanding ${o} = true debt 32,100,000 = GL AR Δ ${gd} · paid==live ${bad.join(";") || "held"} · voidPayment(sibling) after bounce → ${J(vAfter)}`);
        }
        { // G1d (v) purchase ×2 and ×3 — voidVendorPayment(sibling) refused + voidGroupPayment refused (zero writes) · voidCheque restores ALL · Σ outstanding = true debt = GL AP Δ
          const msgs: string[] = []; let ok = true;
          for (const n of [2, 3]) {
            const x = await mkGrp("OUT", n, "CHEQUE");
            const linked = x.b.pays.filter((p: Any) => p.chequeId === x.b.cq).length;
            const p = lastSib(x);
            const s0 = await snap(x);
            const vp = await exp.voidVendorPayment(T, A, p.documentId, p.id, "x");
            const vg = await grp.voidGroupPayment(T, A, x.g.id, x.b.batchKey, "x");
            const s1 = await snap(x);
            const vc = await cheque.voidCheque(T, A, x.b.cq, "x");
            const o = await outOf(x); const gd = await glDelta(x); const bad = await inv(x);
            const vAfter = await exp.voidVendorPayment(T, A, p.documentId, p.id, "x");
            const want = n * 10_700_000;
            const good = linked === 1 && vp?.ok === false && /ทะเบียนเช็ค/.test(String(vp?.reason)) && vg?.ok === false && /ทะเบียนเช็ค/.test(String(vg?.reason)) && s0 === s1
              && vc?.ok === true && (await allZero(x)) && o === want && gd === want && bad.length === 0 && vAfter?.ok === false && /ถูกยกเลิกแล้ว/.test(String(vAfter?.reason));
            ok &&= good;
            msgs.push(`×${n}: linked ${linked}/${n} · voidVendorPayment(sibling) → ${J(vp)} · voidGroupPayment → ${J(vg)} · zero writes ${s0 === s1} · voidCheque → ${J(vc)} · all restored ${await allZero(x)} · Σ outstanding ${o} = GL AP Δ ${gd} (true ${want}) · paid==live ${bad.join(";") || "held"} · after → ${J(vAfter)}`);
          }
          chk("G1d", ok, `purchase group cheque: ${msgs.join(" ‖ ")}`);
        }
        { // G1e (vi) transfer batch (no cheque) — voidPayment of one child still works · voidGroupPayment voids the rest
          const x = await mkGrp("IN", 2, "TRANSFER");
          const p = x.b.pays[1];
          const vp = await accSvc.voidPayment(T, A, p.documentId, p.id, "x");
          const one = await docSt(p.documentId);
          const vg = await grp.voidGroupPayment(T, A, x.g.id, x.b.batchKey, "x");
          const o = await outOf(x); const gd = await glDelta(x); const bad = await inv(x);
          chk("G1e", x.b.cq === null && vp?.ok === true && one.paidTotal === 0 && vg?.ok === true && vg.voided === 1 && (await allZero(x)) && o === 21_400_000 && gd === 21_400_000 && bad.length === 0,
            `transfer batch: voidPayment(child 2) → ${J(vp)} (paid ${one.paidTotal}) · voidGroupPayment → ${J(vg)} · all restored · Σ outstanding ${o} = GL AR Δ ${gd} · paid==live ${bad.join(";") || "held"}`);
        }
        { // G1f (vii) two cheque batches on the same group (16,050,000 each over 3 invoices) — bouncing batch 1 must not touch batch 2's payments (and vice versa)
          const x = await mkGrp("IN", 3, null);
          const b1 = await payGrp(x, "CHEQUE", 16_050_000);
          const b2 = await payGrp(x, "CHEQUE", 16_050_000);
          const shared = b1.pays.filter((p: Any) => b2.pays.some((q: Any) => q.documentId === p.documentId)).length;
          const r1 = await cheque.bounceCheque(T, A, b1.cq, "x");
          const st = async (ids: string[]) => P.accountDocumentPayment.findMany({ where: { id: { in: ids } }, select: { voidedAt: true } });
          const b1v = (await st(b1.pays.map((p: Any) => p.id))).every((p: Any) => p.voidedAt !== null);
          const b2l = (await st(b2.pays.map((p: Any) => p.id))).every((p: Any) => p.voidedAt === null);
          const o1 = await outOf(x); const g1 = await glDelta(x); const bad1 = await inv(x);
          const sb = b2.pays.find((p: Any) => !p.chequeId);
          const vp = await accSvc.voidPayment(T, A, sb.documentId, sb.id, "x"); // batch 2's cheque still live ⇒ refused
          const r2 = await cheque.bounceCheque(T, A, b2.cq, "x");
          const o2 = await outOf(x); const g2 = await glDelta(x); const bad2 = await inv(x);
          chk("G1f", b1.batchKey !== b2.batchKey && b1.cq !== b2.cq && shared === 1 && r1?.ok === true && b1v && b2l && o1 === 16_050_000 && g1 === 16_050_000 && bad1.length === 0
            && vp?.ok === false && /ทะเบียนเช็ค/.test(String(vp?.reason)) && r2?.ok === true && (await allZero(x)) && o2 === 32_100_000 && g2 === 32_100_000 && bad2.length === 0,
            `two cheque batches (${b1.pays.length}+${b2.pays.length} payments, ${shared} invoice shared): bounce #1 → ${J(r1)} · batch1 all voided ${b1v} · batch2 all live ${b2l} · Σ outstanding ${o1} = GL AR Δ ${g1} (want 16,050,000) · voidPayment(batch2 sibling) → ${J(vp)} · bounce #2 → ${J(r2)} · Σ ${o2} = GL ${g2} (want 32,100,000) · paid==live ${[...bad1, ...bad2].join(";") || "held"}`);
        }
        { // G1g (viii) concurrency — no deadlock / generic error · paidTotal = Σ live · Σ outstanding = GL Δ = true debt · exactly one bounce wins
          const kind = (q: Any) => (q?.ok ? "ok" : /deadlock|40P01|P2034|ไม่สำเร็จ$/i.test(String(q?.reason)) ? `GENERIC(${String(q?.reason).slice(0, 60)})` : "refused");
          const tally: Record<string, number> = {}; const badG: string[] = [];
          const run = async (name: string, rounds: number, side: "IN" | "OUT", race: (x: Any) => Promise<Any[]>, extra?: (x: Any, r: Any[]) => Promise<string | null>) => {
            for (let k = 0; k < rounds; k += 1) {
              const x = await mkGrp(side, 2, "CHEQUE");
              x.round = k; x.je0 = await P.accountJournalEntry.count({ where: { systemId: A, refType: "AccountCheque", refId: x.b.cq } });
              const r = await race(x);
              const key = `${name}: ${r.map(kind).join("|")}`; tally[key] = (tally[key] ?? 0) + 1;
              const bad = await inv(x); const o = await outOf(x); const gd = await glDelta(x);
              if (r.some((q: Any) => kind(q).startsWith("GENERIC"))) badG.push(`${name}#${k} generic ${r.map((q: Any) => q?.reason ?? "ok").join("|")}`);
              if (bad.length) badG.push(`${name}#${k} ${bad.join(";")}`);
              if (!(await allZero(x)) || o !== 21_400_000 || gd !== 21_400_000) badG.push(`${name}#${k} not fully restored: Σ ${o} GL ${gd}`);
              const e = extra ? await extra(x, r) : null; if (e) badG.push(`${name}#${k} ${e}`);
            }
          };
          // odd rounds: the cheque side starts ~120 ms late so the other side can take the cheque lock first (both orders exercised)
          const late = <R,>(x: Any, f: () => Promise<R>) => (x.round % 2 === 1 ? new Promise<R>((ok, no) => setTimeout(() => f().then(ok, no), 120)) : f());
          // exactly ONE new cheque journal entry per race (a payment-linked group cheque has no REGISTER entry — its GL lives on the payments)
          const oneEntry = async (x: Any) => (await P.accountJournalEntry.count({ where: { systemId: A, refType: "AccountCheque", refId: x.b.cq } })) - x.je0;
          await run("bounce∥voidPayment(sibling)", 10, "IN", (x) => { const p = sib(x); return Promise.all([late(x, () => cheque.bounceCheque(T, A, x.b.cq, "x")), accSvc.voidPayment(T, A, p.documentId, p.id, "x")]); },
            async (x, r) => (r[0]?.ok !== true || r[1]?.ok !== false ? "bounce must win, sibling void must be refused" : (await oneEntry(x)) !== 1 ? `cheque entries +${await oneEntry(x)}` : null));
          await run("bounce∥voidGroupPayment", 10, "IN", (x) => Promise.all([late(x, () => cheque.bounceCheque(T, A, x.b.cq, "x")), grp.voidGroupPayment(T, A, x.g.id, x.b.batchKey, "x")]),
            async (x, r) => (r[0]?.ok !== true || (r[1]?.ok === true && r[1].voided !== 0) ? "bounce must win; group void may only be refused or a no-op" : (await oneEntry(x)) !== 1 ? `cheque entries +${await oneEntry(x)}` : null));
          await run("bounce∥bounce", 10, "IN", (x) => Promise.all([cheque.bounceCheque(T, A, x.b.cq, "x"), cheque.bounceCheque(T, A, x.b.cq, "x")]),
            async (x, r) => { const wins = r.filter((q: Any) => q?.ok).length; const d = await oneEntry(x); return wins !== 1 || d !== 1 ? `wins=${wins} cheque entries +${d}` : null; });
          await run("voidCheque∥voidVendorPayment(sibling)", 6, "OUT", (x) => { const p = sib(x); return Promise.all([late(x, () => cheque.voidCheque(T, A, x.b.cq, "x")), exp.voidVendorPayment(T, A, p.documentId, p.id, "x")]); },
            async (x, r) => (r[0]?.ok !== true || r[1]?.ok !== false ? "voidCheque must win, sibling void must be refused" : (await oneEntry(x)) !== 1 ? `cheque entries +${await oneEntry(x)}` : null));
          await run("voidCheque∥voidGroupPayment", 6, "OUT", (x) => Promise.all([late(x, () => cheque.voidCheque(T, A, x.b.cq, "x")), grp.voidGroupPayment(T, A, x.g.id, x.b.batchKey, "x")]),
            async (x, r) => (r[0]?.ok !== true || (r[1]?.ok === true && r[1].voided !== 0) ? "voidCheque must win; group void may only be refused or a no-op" : (await oneEntry(x)) !== 1 ? `cheque entries +${await oneEntry(x)}` : null));
          chk("G1g", badG.length === 0, `group-cheque races: ${JSON.stringify(tally)} · problems ${badG.length}${badG.length ? ` — ${badG.slice(0, 6).join(" ; ")}` : ""}`);
        }
      }
      { // R10 (round 10 · controller rulings A/B/C on hunter r9) — only what probe-r9{a..f} do not cover:
        //   R10-F3 bounce refused (nothing written) while a live CN sits on an auto tax invoice of the batch · then ok after the CN is voided
        //   R10-LEG / R10-LEGC legacy: a linked payment already voided before the bounce (pre-B2c data) is not posted again (not cleared / cleared)
        //   R10-FEE bank fee stays on the first FIFO child (not the smallest id) now that children run in ↑documentId
        //   R10-2ND second cheque batch after a bounce: head re-synced, links, restores
        //   R10-PD purchase deposit (DEPOSIT_PAYMENT) paid by cheque → voidCheque: every delta 0 · re-pay not doubled
        //   R10-DR sales deposit re-pay after bounce: 2110/2200 not doubled
        const grp = (await import("@/lib/modules/account/group" as string)) as Any;
        const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
        const byCode = async (code: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = $2`, A, code)) as Any[])[0]?.n);
        const byAcc = async (accountId: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" WHERE e."systemId" = $1 AND l."accountId" = $2`, A, accountId)) as Any[])[0]?.n);
        const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
        const bk = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `กระแสรายวัน ${TAG}`, bankName: "กรุงเทพ" });
        if (!bk?.ok) throw new Error(`bank: ${bk?.reason}`);
        const bankLedger = (await P.accountFinance.findUnique({ where: { id: bk.id }, select: { ledgerAccountId: true } }))?.ledgerAccountId as string;
        const J = (v: Any) => JSON.stringify(v?.ok ? { ok: true, ...(v.recorded !== undefined ? { recorded: v.recorded } : {}) } : v);
        const i1 = async (ids: string[]) => { const b: string[] = []; for (const id of ids) { const s0 = await docSt(id); const l = await liveSum(id); if (s0.paidTotal !== l) b.push(`${id.slice(-4)} ${s0.paidTotal}≠${l}`); } return b; };
        const outAR = async (ids: string[]) => { let o = 0; for (const id of ids) o += accSvc.paymentOutstandingOf((await accSvc.paymentTargetOf(T, A, id)).target); return o; };
        const invTiming = async (timing: "ON_ISSUE" | "ON_PAYMENT") => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: timing, lines: [{ description: "บริการ", qty: 1, unitPrice: 10_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
        const mkBn = async (kids: string[]) => { const g = await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] }); if (!g.ok) throw new Error(`group: ${g.reason}`); return g.id as string; };
        let hs = 0;
        const payBn = async (g: string, tieOff: number, how: "CHEQUE" | "TRANSFER", fee = 0) => {
          hs += 1;
          const r = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bk.id, tieOffSatang: tieOff, note: "", feeSatang: fee, wht: [], cheque: how === "CHEQUE" ? { chequeNo: `R10-${hs}`, bankName: "KBank", chequeDate: today } : null }, { clientKey: `r10_${hs}_${randomBytes(3).toString("hex")}` });
          if (!r.ok) throw new Error(`group pay: ${r.reason}`);
          const pays = (await P.accountDocumentPayment.findMany({ where: { tenantId: T, systemId: A, idempotencyKey: { startsWith: `${r.batchKey}#` } }, orderBy: [{ documentId: "asc" }], select: { id: true, documentId: true, chequeId: true, feeAmount: true } })) as Any[];
          return { r, pays, cq: (pays.find((p) => p.chequeId)?.chequeId ?? null) as string | null };
        };
        const snapAll = async (ids: string[]) => JSON.stringify({ je: await P.accountJournalEntry.count({ where: { systemId: A } }), ob: await P.outboxEvent.count({ where: { tenantId: T } }), docs: await Promise.all(ids.map((id) => docSt(id))), voided: await P.accountDocumentPayment.count({ where: { documentId: { in: ids }, voidedAt: { not: null } } }), cq: await P.accountCheque.findMany({ where: { systemId: A }, select: { status: true }, orderBy: { id: "asc" } }) });

        const sub = async (id: string, f: () => Promise<void>) => { try { await f(); } catch (e) { chk(id, false, `FATAL ${e instanceof Error ? e.message : String(e)}`); } };
        await sub("R10-F3", async () => { // R10-F3
          const kids = [await invTiming("ON_PAYMENT"), await invTiming("ON_PAYMENT")];
          const g = await mkBn(kids);
          const v0 = await byCode("2200"); const u0 = await byCode("2210"); const ar0 = await byCode("1100");
          const x = await payBn(g, 21_400_000, "CHEQUE");
          const ti = await P.accountDocument.findFirst({ where: { systemId: A, docType: "TAX_INVOICE", sourcePaymentId: x.pays[1].id }, select: { id: true } });
          const cn = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: ti?.id, adjustReason: "x", vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 1_000_000 }] });
          const ci = await accSvc.issueDocument(T, A, cn.id);
          const s0 = await snapAll(kids);
          const b1 = await cheque.bounceCheque(T, A, x.cq, "x");
          const s1 = await snapAll(kids);
          const vc = await accSvc.voidDocument(T, A, cn.id, "x");
          const b2 = await cheque.bounceCheque(T, A, x.cq, "x");
          const liveTis = await P.accountDocument.count({ where: { systemId: A, docType: "TAX_INVOICE", sourcePaymentId: { in: x.pays.map((p: Any) => p.id) }, status: { notIn: ["VOIDED", "CANCELLED"] } } });
          const d22 = (await byCode("2200")) - v0; const d221 = (await byCode("2210")) - u0; const o = await outAR(kids); const arD = (await byCode("1100")) - ar0; const bad = await i1(kids);
          chk("R10-F3", !!ti && ci?.ok === true && b1?.ok === false && /ใบลดหนี้/.test(String(b1?.reason)) && s0 === s1 && vc?.ok === true && b2?.ok === true && liveTis === 0 && d22 === 0 && d221 === 0 && o === 21_400_000 && arD === 0 && bad.length === 0,
            `live CN on an auto TI of the batch: CN ${J(ci)} · bounce → ${J(b1)} (nothing written ${s0 === s1}) · void CN ${J(vc)} · bounce → ${J(b2)} · live auto TIs ${liveTis} · 2200 Δ ${d22} · 2210 Δ ${d221} (both 0 since before pay) · Σ out ${o} (true debt) · GL AR Δ since before pay ${arD} (= sub-ledger Δ 0) · paid==live ${bad.join(";") || "held"}`);
        });
        await sub("R10-LEG", async () => { // R10-LEG / R10-LEGC — pre-B2c data: the LINKED payment was voided while the cheque was live
          const res: string[] = []; let ok = true;
          for (const cleared of [false, true]) {
            const kids = [await invTiming("ON_ISSUE"), await invTiming("ON_ISSUE")];
            const g = await mkBn(kids);
            const ar0 = await byCode("1100"); const t0 = await byCode("1040"); const bk0 = await byAcc(bankLedger);
            const x = await payBn(g, 21_400_000, "CHEQUE");
            if (cleared) { await cheque.depositCheque(T, A, x.cq); await cheque.clearCheque(T, A, x.cq); }
            const st0 = (await P.accountCheque.findUnique({ where: { id: x.cq }, select: { status: true } })).status;
            const linked = x.pays.find((p: Any) => p.chequeId);
            await P.accountCheque.update({ where: { id: x.cq }, data: { status: "BOUNCED" } }); // simulate the pre-B2c world for one call
            const lv = await accSvc.voidPayment(T, A, linked.documentId, linked.id, "legacy");
            await P.accountCheque.update({ where: { id: x.cq }, data: { status: st0 } });
            const b = await cheque.bounceCheque(T, A, x.cq, "x");
            const bj = await P.accountJournalEntry.findFirst({ where: { systemId: A, refType: "AccountCheque", refId: x.cq, idempotencyKey: `AccountCheque#${x.cq}#BOUNCE` }, include: { lines: { include: { account: { select: { code: true } } } } } });
            const arLeg = (bj?.lines ?? []).filter((l: Any) => l.account.code === "1100").reduce((s: number, l: Any) => s + l.debit - l.credit, 0);
            const o = await outAR(kids); const arD = (await byCode("1100")) - ar0; const tD = (await byCode("1040")) - t0; const bD = (await byAcc(bankLedger)) - bk0; const bad = await i1(kids);
            const good = lv?.ok === true && b?.ok === true && arLeg === 10_700_000 && o === 21_400_000 && arD === 0 && tD === 0 && bD === 0 && bad.length === 0;
            ok &&= good;
            res.push(`${cleared ? "CLEARED" : "ON_HAND"}: legacy void ${J(lv)} · bounce ${J(b)} · bounce AR leg ${arLeg} (only the sibling, 10,700,000) · Σ out ${o} · GL AR Δ since before pay ${arD} (0) · 1040 Δ ${tD} · bank Δ ${bD} · paid==live ${bad.join(";") || "held"}`);
          }
          chk("R10-LEG", ok, `already-voided linked payment is not posted again — ${res.join(" ‖ ")}`);
        });
        await sub("R10-FEE", async () => { // R10-FEE — fee lands on the first FIFO child (due first), which here has the LARGER id
          const a = await invTiming("ON_ISSUE"); const b = await invTiming("ON_ISSUE");
          await P.accountDocument.update({ where: { id: a }, data: { dueDate: new Date(Date.now() + 30 * 86_400_000) } });
          await P.accountDocument.update({ where: { id: b }, data: { dueDate: new Date(Date.now() + 1 * 86_400_000) } });
          const g = await mkBn([a, b]);
          const x = await payBn(g, 21_400_000, "TRANSFER", 1_000);
          const feeA = x.pays.find((p: Any) => p.documentId === a)?.feeAmount; const feeB = x.pays.find((p: Any) => p.documentId === b)?.feeAmount;
          chk("R10-FEE", a < b && feeB === 1_000 && feeA === 0 && x.pays.length === 2, `FIFO first child = b (due first, id larger: ${a < b}) · fee on b ${feeB} · on a ${feeA}`);
        });
        await sub("R10-2ND", async () => { // R10-2ND — second cheque batch after a bounce
          const kids = [await invTiming("ON_ISSUE"), await invTiming("ON_ISSUE")];
          const g = await mkBn(kids);
          const ar0 = await byCode("1100");
          const x1 = await payBn(g, 21_400_000, "CHEQUE");
          const b1 = await cheque.bounceCheque(T, A, x1.cq, "x");
          const h1 = await docSt(g);
          const x2 = await payBn(g, 21_400_000, "CHEQUE");
          const h2 = await docSt(g);
          const linked2 = x2.pays.filter((p: Any) => p.chequeId === x2.cq).length;
          const b2 = await cheque.bounceCheque(T, A, x2.cq, "x");
          const h3 = await docSt(g); const o = await outAR(kids); const arD = (await byCode("1100")) - ar0; const bad = await i1(kids);
          chk("R10-2ND", b1?.ok === true && h1.status === "AWAITING_PAYMENT" && h1.paidTotal === 0 && x2.r.recorded === 2 && h2.status === "PAID" && linked2 === 1 && x2.cq !== x1.cq && b2?.ok === true && h3.status === "AWAITING_PAYMENT" && h3.paidTotal === 0 && o === 21_400_000 && arD === 0 && bad.length === 0,
            `bounce #1 ${J(b1)} → head ${JSON.stringify(h1)} · batch #2 recorded ${x2.r.recorded} → head ${JSON.stringify(h2)} · linked ${linked2}/2 · bounce #2 ${J(b2)} → head ${JSON.stringify(h3)} · Σ out ${o} · GL AR Δ since before pay ${arD} (0) · paid==live ${bad.join(";") || "held"}`);
        });
        await sub("R10-PD", async () => { // R10-PD — purchase deposit paid by cheque (form path) → voidCheque → re-pay by transfer
          const codes = ["1130", "1150", "2300", "2100"];
          const snapC = async () => Object.fromEntries(await Promise.all(codes.map(async (c) => [c, await byCode(c)])));
          const dlt = (a: Any, b: Any) => Object.fromEntries(codes.map((c) => [c, b[c] - a[c]]));
          const dp = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "DEPOSIT_PAYMENT", contactId: vend.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: 1_000_000 }] });
          const di = await exp.issueExpenseDoc(T, A, dp.id);
          const c0 = await snapC();
          const p = await exp.recordVendorPayment(T, A, dp.id, { paidAt: new Date(), channel: "CHEQUE", financeAccountId: null, amount: 1_070_000 });
          const c = await cheque.createCheque({ tenantId: T, systemId: A, direction: "OUT", chequeNo: "R10PD", bankName: "B", chequeDate: new Date(), amount: 1_070_000, documentId: dp.id, paymentId: p.paymentId });
          const v = await cheque.voidCheque(T, A, c.id, "x");
          const d1 = dlt(c0, await snapC()); const st1 = await docSt(dp.id);
          const rp = await exp.recordVendorPayment(T, A, dp.id, { paidAt: new Date(), channel: "TRANSFER", financeAccountId: bk.id, amount: 1_070_000 });
          const d2 = dlt(c0, await snapC());
          chk("R10-PD", di?.ok === true && p?.ok === true && p.status === "AWAITING_DEDUCT" && c?.ok === true && v?.ok === true && Object.values(d1).every((n) => n === 0) && st1.status === "AWAITING_PAYMENT" && st1.paidTotal === 0
            && rp?.ok === true && d2["1130"] === 1_000_000 && d2["1150"] === 70_000 && d2["2300"] === 0,
            `DEPOSIT_PAYMENT by cheque ${J(p)} (${p?.status}) · voidCheque ${J(v)} → Δ since before pay ${JSON.stringify(d1)} (all 0) · doc ${JSON.stringify(st1)} · re-pay by transfer ${J(rp)} → Δ ${JSON.stringify(d2)} (1130 +1,000,000 · 1150 +70,000 once)`);
        });
        await sub("R10-DR", async () => { // R10-DR — sales deposit re-pay after bounce (hunter R9-2 UNVERIFIED follow-on)
          const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
          const dep = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "DEPOSIT_RECEIPT", contactId: cust.id, sourceDocId: q.id, vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: 3_000_000 }] });
          await accSvc.issueDocument(T, A, dep.id);
          const codes = ["1100", "2110", "2200", "1040"];
          const snapC = async () => Object.fromEntries(await Promise.all(codes.map(async (c) => [c, await byCode(c)])));
          const dlt = (a: Any, b: Any) => Object.fromEntries(codes.map((c) => [c, b[c] - a[c]]));
          const c0 = await snapC();
          const p = await accSvc.recordPayment(T, A, dep.id, { channel: "CHEQUE", amount: 3_210_000 });
          const c = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: "R10DR", bankName: "B", chequeDate: new Date(), amount: 3_210_000, documentId: dep.id, paymentId: p.paymentId });
          const b = await cheque.bounceCheque(T, A, c.id, "x");
          const d1 = dlt(c0, await snapC());
          const rp = await accSvc.recordPayment(T, A, dep.id, { channel: "TRANSFER", financeAccountId: bk.id, amount: 3_210_000 });
          const d2 = dlt(c0, await snapC()); const st2 = await docSt(dep.id);
          chk("R10-DR", b?.ok === true && Object.values(d1).every((n) => n === 0) && rp?.ok === true && st2.status === "AWAITING_DEDUCT" && d2["2110"] === -3_000_000 && d2["2200"] === -210_000 && d2["1100"] === 0 && d2["1040"] === 0,
            `deposit receipt by cheque → bounce ${J(b)} Δ ${JSON.stringify(d1)} (all 0) · re-pay by transfer ${J(rp)} → ${st2.status} Δ ${JSON.stringify(d2)} (2110 −3,000,000 · 2200 −210,000 once · AR 0 · 1040 0)`);
        });
      }
      { // R11 (round 11 · hunter r10 rulings) — only what probe-r10{a..g} do not cover:
        //   R11-RCPT  cash-sale receipt: REST payments.void refused with guidance, nothing written · voidDocument(receipt) ⇒ full TB Δ 0 · same after a cheque bounce
        //   R11-DEP2  deposit deducted by TWO invoices: void one ⇒ AWAITING_DEDUCT, unwind still refused (other deductor live) · void both ⇒ bounce ok, TB Δ 0 ·
        //             twin without the void ⇒ refused with the existing message · CN (not void) on the deducting invoice ⇒ reported state
        //   R11-SHAPE deposit transfer + cheque: NEW-shape JV has per-payment legs (clear ⇒ bank +3,210,000, 1040 0) · bounce ⇒ TB Δ 0 ·
        //             OLD-shape JV (single cash line — simulated by rewriting the posted legs) · clear + bounce ⇒ TB Δ 0
        //   R11-CAP   > 40 children refused before any write on service + REST (same message) · panel/action wired to the same rule (static)
        //   R11-CN    CN issue/void on a child re-syncs the group head
        const grp = (await import("@/lib/modules/account/group" as string)) as Any;
        const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
        const pay = (await import("@/lib/modules/account/payment" as string)) as Any;
        const PW = (await import("@/lib/modules/account/api/ops/payments-write" as string)) as Any;
        const { readFileSync } = await import("node:fs");
        const vend2 = await accSvc.createContact({ tenantId: T, systemId: A, kind: "VENDOR", legalType: "COMPANY", name: `ผู้ขาย R11 ${TAG}`, taxId: "0105563333333" });
        const bk = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `บัญชี R11 ${TAG}`, bankName: "ไทยพาณิชย์" });
        if (!bk?.ok) throw new Error(`bank: ${bk?.reason}`);
        const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
        const tb = async (): Promise<Map<string, number>> => {
          const rows = (await P.$queryRawUnsafe(`SELECT a."code" AS code, COALESCE(l."contactId",'-') AS c, sum(l."debit" - l."credit")::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 GROUP BY 1,2`, A)) as Any[];
          return new Map(rows.map((r) => [`${r.code}${r.c === "-" ? "" : r.c === cust.id ? "@cust" : "@other"}`, Number(r.n)]));
        };
        const tbDiff = (a: Map<string, number>, b: Map<string, number>) => { const out: string[] = []; for (const k of new Set([...a.keys(), ...b.keys()])) { const d = (b.get(k) ?? 0) - (a.get(k) ?? 0); if (d !== 0) out.push(`${k}:${d}`); } return out.sort(); };
        const byAcc = async (accountId: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" WHERE e."systemId" = $1 AND l."accountId" = $2`, A, accountId)) as Any[])[0]?.n);
        const byAccCode = async (code: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = $2`, A, code)) as Any[])[0]?.n);
        const bankLedger = (await P.accountFinance.findUnique({ where: { id: bk.id }, select: { ledgerAccountId: true } }))?.ledgerAccountId as string;
        const J = (v: Any) => JSON.stringify(v?.ok ? { ok: true } : v);
        let ks = 0; const key = () => `r11k${++ks}_${randomBytes(3).toString("hex")}`;
        const chqD = () => ({ chequeNo: `R11-${++ks}`, bankName: "KBank", chequeDate: today });
        const row = (amt: number, cheque: Any = null) => ({ paidAt: today, financeAccountId: bk.id, amountSatang: amt, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque });
        const sub = async (id: string, f: () => Promise<void>) => { try { await f(); } catch (e) { chk(id, false, `FATAL ${e instanceof Error ? e.message : String(e)}`); } };

        await sub("R11-RCPT", async () => {
          const mkRe = async () => (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 1_000_000 }] })).id as string;
          const op = (PW.PAYMENTS_WRITE_OPS as Any[]).find((o) => o.id === "payments.void");
          const actor = { kind: "apikey", tenantId: T, systemId: A, keyId: "probe-r11" };
          // a) transfer: REST void refused (guidance), nothing written · voidDocument ⇒ TB Δ 0
          const re = await mkRe(); const b0 = await tb();
          const ap = await pay.approveReceiptWithPayments(T, A, re, [row(1_070_000)], { keyBase: key() });
          const p = await P.accountDocumentPayment.findFirst({ where: { documentId: re }, select: { id: true } });
          const mid0 = await tb(); const je0 = await P.accountJournalEntry.count({ where: { systemId: A } });
          let rest: Any = null;
          try { await op.handler({ actor, params: { paymentId: p.id }, input: op.input.parse({ documentId: re, reason: "ลูกค้ายกเลิกการซื้อ" }) }); rest = { ok: true }; } catch (e) { rest = { status: (e as Any)?.status, msg: String((e as Any)?.message_th ?? (e as Any)?.message ?? e) }; }
          const nothing = tbDiff(mid0, await tb()).length === 0 && (await P.accountJournalEntry.count({ where: { systemId: A } })) === je0 && (await P.accountDocumentPayment.findUnique({ where: { id: p.id }, select: { voidedAt: true } })).voidedAt === null;
          const vd = await accSvc.voidDocument(T, A, re, "ยกเลิกการขาย");
          const dA = tbDiff(b0, await tb()); const stA = await docSt(re); const pv = (await P.accountDocumentPayment.findUnique({ where: { id: p.id }, select: { voidedAt: true } })).voidedAt !== null;
          // b) cheque → bounce (customer owes) → voidDocument ⇒ TB Δ 0 (RECEIPT_VOID moves the claim back)
          const re2 = await mkRe(); const c0 = await tb();
          const ap2 = await pay.approveReceiptWithPayments(T, A, re2, [row(1_070_000, chqD())], { keyBase: key() });
          const p2 = await P.accountDocumentPayment.findFirst({ where: { documentId: re2 }, select: { id: true, chequeId: true } });
          const vdLive = await accSvc.voidDocument(T, A, re2, "x"); // live cheque ⇒ refused
          const b = await cheque.bounceCheque(T, A, p2.chequeId, "x");
          const afterB = tbDiff(c0, await tb());
          const vd2 = await accSvc.voidDocument(T, A, re2, "ยกเลิกการขาย");
          const dB = tbDiff(c0, await tb());
          chk("R11-RCPT", ap?.ok === true && rest?.ok !== true && /ยกเลิกใบเสร็จแทน/.test(String(rest?.msg)) && nothing && vd?.ok === true && dA.length === 0 && stA.status === "VOIDED" && pv
            && ap2?.ok === true && !!p2?.chequeId && vdLive?.ok === false && /เช็ค/.test(String(vdLive?.reason)) && b?.ok === true && afterB.join() === `1100@cust:1070000,2200:-70000,4000:-1000000` && vd2?.ok === true && dB.length === 0,
            `transfer: REST payments.void → ${JSON.stringify(rest)} · nothing written ${nothing} · voidDocument(receipt) ${J(vd)} → ${stA.status}, payment voided ${pv}, TBΔ ${JSON.stringify(dA)} (want []) ‖ cheque: approve ${J(ap2)} · void receipt with live cheque ${J(vdLive)} · bounce ${J(b)} → TBΔ ${JSON.stringify(afterB)} · voidDocument ${J(vd2)} → TBΔ ${JSON.stringify(dB)} (want [])`);
        });

        await sub("R11-DEP2", async () => {
          const mkDep = async () => {
            const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
            const dep = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "DEPOSIT_RECEIPT", contactId: cust.id, sourceDocId: q.id, vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: 3_000_000 }] });
            await accSvc.issueDocument(T, A, dep.id); return dep.id as string;
          };
          const mkInvDeduct = async (dep: string, amt: number) => {
            const i = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
            const sd = await accSvc.setDocDeposits(T, A, i.id, [{ depositId: dep, amountSatang: amt }]);
            if (!sd.ok) throw new Error(`deduct: ${sd.reason}`);
            const is = await accSvc.issueDocument(T, A, i.id); if (!is.ok) throw new Error(`issue: ${is.reason}`);
            return i.id as string;
          };
          const d = await mkDep(); const b0 = await tb();
          const r = await pay.recordPayments(T, A, d, [row(3_210_000, chqD())], { keyBase: key() });
          const cq = (await P.accountDocumentPayment.findFirst({ where: { documentId: d }, select: { chequeId: true } })).chequeId;
          const i1 = await mkInvDeduct(d, 2_000_000); const i2 = await mkInvDeduct(d, 1_210_000);
          const s0 = (await docSt(d)).status;
          const v1 = await accSvc.voidDocument(T, A, i1, "x"); const s1 = (await docSt(d)).status;
          const bRef = await cheque.bounceCheque(T, A, cq, "x"); // i2 still deducts ⇒ refused
          const v2 = await accSvc.voidDocument(T, A, i2, "x"); const s2 = (await docSt(d)).status;
          const bOk = await cheque.bounceCheque(T, A, cq, "x");
          const dT = tbDiff(b0, await tb()); const s3 = await docSt(d);
          // twin: invoice NOT voided ⇒ refused with the existing message
          const dT2 = await mkDep();
          const r2 = await pay.recordPayments(T, A, dT2, [row(3_210_000)], { keyBase: key() });
          await mkInvDeduct(dT2, 3_210_000);
          const pT = await P.accountDocumentPayment.findFirst({ where: { documentId: dT2 }, select: { id: true } });
          const vT = await accSvc.voidPayment(T, A, dT2, pT.id, "x");
          // CN (not void) on the deducting invoice: report what happens
          const dC = await mkDep();
          await pay.recordPayments(T, A, dC, [row(3_210_000)], { keyBase: key() });
          const iC = await mkInvDeduct(dC, 3_210_000);
          const cn = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: iC, adjustReason: "x", vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 1_000_000 }] });
          const ci = await accSvc.issueDocument(T, A, cn.id);
          const pC = await P.accountDocumentPayment.findFirst({ where: { documentId: dC }, select: { id: true } });
          const vC = await accSvc.voidPayment(T, A, dC, pC.id, "x");
          chk("R11-DEP2", r?.ok === true && s0 === "DEDUCTED" && v1?.ok === true && s1 === "AWAITING_DEDUCT" && bRef?.ok === false && /ถูกหักในเอกสารอื่นแล้ว/.test(String(bRef?.reason)) && v2?.ok === true && s2 === "AWAITING_DEDUCT"
            && bOk?.ok === true && dT.length === 0 && s3.status === "AWAITING_PAYMENT" && s3.paidTotal === 0 && r2?.ok === true && vT?.ok === false && /ถูกหักในเอกสารอื่นแล้ว/.test(String(vT?.reason)),
            `two deductors: dep ${s0} → void inv1 ${J(v1)} → ${s1} · bounce while inv2 deducts ${J(bRef)} · void inv2 → ${s2} · bounce ${J(bOk)} → dep ${JSON.stringify(s3)} TBΔ ${JSON.stringify(dT)} (want []) ‖ twin (invoice live) voidPayment ${J(vT)} ‖ REPORT CN 1,070,000 on the deducting invoice ${J(ci)} → deposit ${(await docSt(dC)).status} · voidPayment(deposit) ${J(vC)}`);
        });

        await sub("R11-SHAPE", async () => {
          const res: string[] = []; let ok = true;
          for (const shape of ["NEW", "OLD"] as const) {
            const q = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "QUOTATION", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] });
            const dep = (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "DEPOSIT_RECEIPT", contactId: cust.id, sourceDocId: q.id, vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: 3_000_000 }] })).id as string;
            await accSvc.issueDocument(T, A, dep);
            const b0 = await tb(); const t0 = await byAccCode("1040"); const k0 = await byAcc(bankLedger);
            const p1 = await pay.recordPayments(T, A, dep, [row(1_000_000)], { keyBase: key() });            // transfer first
            const p2 = await pay.recordPayments(T, A, dep, [row(2_210_000, chqD())], { keyBase: key() });   // cheque completes it
            const je = await P.accountJournalEntry.findFirst({ where: { systemId: A, refType: "AccountDocument", refId: dep, status: "POSTED", reversalOfId: null }, include: { lines: true } });
            const transitId = (await P.accountLedger.findFirst({ where: { systemId: A, code: "1040" }, select: { id: true } }))?.id;
            const legs = (je?.lines ?? []).filter((l: Any) => l.debit > 0).map((l: Any) => `${l.accountId === bankLedger ? "bank" : l.accountId === transitId ? "1040" : "other"}:${l.debit}`).sort().join(",");
            if (shape === "OLD") { // legacy posting: whole cash side on the FIRST payment's account (the bank)
              const tl = (je?.lines ?? []).find((l: Any) => l.accountId === transitId && l.debit > 0);
              if (tl) await P.accountJournalLine.update({ where: { id: tl.id }, data: { accountId: bankLedger } });
            }
            const cq = (await P.accountDocumentPayment.findFirst({ where: { documentId: dep, chequeId: { not: null } }, select: { chequeId: true } })).chequeId;
            await cheque.depositCheque(T, A, cq); await cheque.clearCheque(T, A, cq);
            const afterClear = { bank: (await byAcc(bankLedger)) - k0, t1040: (await byAccCode("1040")) - t0 };
            const b = await cheque.bounceCheque(T, A, cq, "x");
            const d = tbDiff(b0, await tb()); const st = await docSt(dep);
            const good = p1?.ok === true && p2?.ok === true && (shape === "OLD" || (legs === "1040:2210000,bank:1000000" && afterClear.bank === 3_210_000 && afterClear.t1040 === 0)) && b?.ok === true && d.length === 0 && st.status === "PARTIAL" && st.paidTotal === 1_000_000;
            ok &&= good;
            res.push(`${shape}: deposit JV cash legs ${shape === "NEW" ? legs : "(rewritten to bank only)"} · after clear bank Δ ${afterClear.bank} / 1040 Δ ${afterClear.t1040} · bounce ${J(b)} → dep ${st.status} paid ${st.paidTotal} · TBΔ since before pay ${JSON.stringify(d)} (want [] — partial deposits post nothing)`);
          }
          chk("R11-SHAPE", ok, res.join(" ‖ "));
        });

        await sub("R11-CAP", async () => {
          const kids: string[] = []; for (let i = 0; i < 41; i += 1) kids.push(await invOf());
          const g = await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] });
          if (!g.ok) throw new Error(`group: ${g.reason}`);
          const je0 = await P.accountJournalEntry.count({ where: { systemId: A } }); const pay0 = await P.accountDocumentPayment.count({ where: { documentId: { in: kids } } }); const ob0 = await P.outboxEvent.count({ where: { tenantId: T } });
          const svc = await grp.recordGroupPayment(T, A, g.id, { paidAt: today, financeAccountId: bk.id, tieOffSatang: 41 * 10_700_000, note: "", feeSatang: 0, wht: [], cheque: null }, { clientKey: key() });
          const op = (PW.PAYMENTS_WRITE_OPS as Any[]).find((o) => o.id === "payments.record-group");
          let rest: Any = null;
          try { await op.handler({ actor: { kind: "apikey", tenantId: T, systemId: A, keyId: "probe-r11" }, idempotencyKey: key(), requestId: key(), input: op.input.parse({ groupId: g.id, paidAt: today, financeAccountId: bk.id, tieOffSatang: 41 * 10_700_000 }) }); rest = { ok: true }; } catch (e) { rest = { status: (e as Any)?.status, msg: String((e as Any)?.message_th ?? (e as Any)?.message ?? e) }; }
          const nothing = (await P.accountJournalEntry.count({ where: { systemId: A } })) === je0 && (await P.accountDocumentPayment.count({ where: { documentId: { in: kids } } })) === pay0 && (await P.outboxEvent.count({ where: { tenantId: T } })) === ob0;
          const svc40 = await grp.recordGroupPayment(T, A, g.id, { paidAt: today, financeAccountId: bk.id, tieOffSatang: 40 * 10_700_000, note: "", feeSatang: 0, wht: [], cheque: null }, { clientKey: key() });
          const panel = readFileSync("src/components/account-v2/GroupPaymentPanel.tsx", "utf8"); const action = readFileSync("src/lib/modules/account/group-actions.ts", "utf8");
          const uiWired = /GROUP_PAYMENT_MAX_CHILDREN/.test(panel) && /groupPaymentTooManyChildrenMsg\(/.test(panel);
          const actionWired = /recordGroupPayment\(/.test(action) && !/GROUP_PAYMENT_MAX_CHILDREN\s*=/.test(action);
          const msg41 = "บันทึกได้ครั้งละไม่เกิน 40 ใบ";
          chk("R11-CAP", svc?.ok === false && String(svc?.reason).includes(msg41) && rest?.ok !== true && String(rest?.msg).includes(msg41) && nothing && svc40?.ok === true && svc40.recorded === 40 && uiWired && actionWired,
            `41 children: service ${J(svc)} · REST record-group ${JSON.stringify(rest)} (same message ${String(rest?.msg) === String(svc?.reason)}) · nothing written by the two refusals ${nothing} · 40 children → ${J(svc40)} recorded ${svc40?.recorded} · panel uses the shared rule ${uiWired} · server action goes through recordGroupPayment ${actionWired}`);
        });

        await sub("R11-CN", async () => {
          const kids = [await invOf(), await invOf()];
          const g = await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] });
          if (!g.ok) throw new Error(`group: ${g.reason}`);
          await grp.recordGroupPayment(T, A, g.id, { paidAt: today, financeAccountId: bk.id, tieOffSatang: 10_700_000, note: "", feeSatang: 0, wht: [], cheque: null }, { clientKey: key() });
          const h0 = await docSt(g.id);
          const cn = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: kids[1], adjustReason: "x", vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 10_000_000 }] });
          const ci = await accSvc.issueDocument(T, A, cn.id); const h1 = await docSt(g.id);
          const vc = await accSvc.voidDocument(T, A, cn.id, "x"); const h2 = await docSt(g.id);
          chk("R11-CN", h0.status === "PARTIAL" && h0.paidTotal === 10_700_000 && ci?.ok === true && h1.status === "PAID" && h1.paidTotal === 21_400_000 && vc?.ok === true && h2.status === "PARTIAL" && h2.paidTotal === 10_700_000,
            `head after paying child 1 ${JSON.stringify(h0)} · full CN on child 2 ${J(ci)} → head ${JSON.stringify(h1)} (want PAID/21,400,000) · void CN ${J(vc)} → head ${JSON.stringify(h2)} (want PARTIAL/10,700,000)`);
        });
      }
      { // R12 (round 12 · hunter r11 rulings) — exits probe-r11{a..d} do not cover:
        //   R12-DRAFT  "worst remaining state" of path ② (attach + cheque committed, issue never ran): the receipt stays DRAFT on bounce, and EVERY exit ends at TB Δ [] —
        //              bounce → approve again (same key ⇒ calm refusal · new key ⇒ issues once) · bounce → cancel · cleared → bounce → cancel · cleared → cancel (register stays CLEARED)
        //   R12-CLEARED issued cash-sale receipt whose cheque CLEARED ⇒ voidDocument allowed, TB Δ [], register CLEARED, payment.recorded 1 / payment.voided 1
        //   R12-EVT    event symmetry + CRM: transfer and cheque cash-sale receipts, attach → issue → void ⇒ recorded 1 · voided 1 each · CRM deal paid/commission unchanged
        const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
        const pay = (await import("@/lib/modules/account/payment" as string)) as Any;
        const bk = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `บัญชี R12 ${TAG}`, bankName: "กรุงไทย" });
        if (!bk?.ok) throw new Error(`bank: ${bk?.reason}`);
        const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
        const tb = async (): Promise<Map<string, number>> => {
          const rows = (await P.$queryRawUnsafe(`SELECT a."code" AS code, COALESCE(l."contactId",'-') AS c, sum(l."debit" - l."credit")::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 GROUP BY 1,2`, A)) as Any[];
          return new Map(rows.map((r) => [`${r.code}${r.c === "-" ? "" : r.c === cust.id ? "@cust" : "@other"}`, Number(r.n)]));
        };
        const tbDiff = (a: Map<string, number>, b: Map<string, number>) => { const out: string[] = []; for (const k of new Set([...a.keys(), ...b.keys()])) { const d = (b.get(k) ?? 0) - (a.get(k) ?? 0); if (d !== 0) out.push(`${k}:${d}`); } return out.sort(); };
        const J = (v: Any) => JSON.stringify(v?.ok ? { ok: true } : v);
        let ks = 0; const kb = () => `r12k${++ks}_${randomBytes(3).toString("hex")}`;
        const mkRe = async () => (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 1_000_000 }] })).id as string;
        const chqDFake = () => ({ chequeNo: `R12-retry-${ks}`, bankName: "KBank", chequeDate: today });
        const row = (cheque: Any = null) => ({ paidAt: today, financeAccountId: bk.id, amountSatang: 1_070_000, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque });
        const sub = async (id: string, f: () => Promise<void>) => { try { await f(); } catch (e) { chk(id, false, `FATAL ${e instanceof Error ? e.message : String(e)}`); } };
        const recEvents = async (pid: string) => ({
          rec: await P.outboxEvent.count({ where: { tenantId: T, idempotencyKey: `account.payment.recorded#${pid}` } }),
          voi: await P.outboxEvent.count({ where: { tenantId: T, type: "account.payment.voided", idempotencyKey: { contains: pid } } }),
        });
        // the committed attach + cheque of path ② WITHOUT the issue step (= the state left when issueDocument fails)
        const worst = async () => {
          const re = await mkRe(); const key = kb();
          const r = await cheque.attachReceiptPaymentsWithChequesInOneTx(T, A, re, [{ paidAt: new Date(`${today}T00:00:00Z`), channel: "CHEQUE", financeAccountId: null, amount: 1_070_000, whtAmountSatang: 0, whtRateBp: null, feeAmount: 0, note: null, createdById: null, idempotencyKey: `${key}:0`, cheque: { chequeNo: `R12-${ks}`, bankName: "KBank", chequeDate: new Date(`${today}T00:00:00Z`) }, chequeFinanceAccountId: bk.id }]);
          if (!r.ok) throw new Error(`attach: ${r.reason}`);
          const p = await P.accountDocumentPayment.findFirst({ where: { documentId: re }, select: { id: true, chequeId: true } });
          return { re, key, pid: p.id as string, cq: p.chequeId as string };
        };

        await sub("R12-DRAFT", async () => {
          const out: string[] = []; let ok = true;
          { // a) bounce → approve again: same key ⇒ refused · new key ⇒ issued once
            const b0 = await tb(); const w = await worst();
            const b = await cheque.bounceCheque(T, A, w.cq, "x"); const s1 = await docSt(w.re); const d1 = tbDiff(b0, await tb());
            const again = await pay.approveReceiptWithPayments(T, A, w.re, [row(chqDFake())], { keyBase: w.key });
            const fresh = await pay.approveReceiptWithPayments(T, A, w.re, [row()], { keyBase: kb() });
            const s2 = await P.accountDocument.findUnique({ where: { id: w.re }, select: { status: true, docNo: true } }); const d2 = tbDiff(b0, await tb());
            const bankCode = d2.find((x) => x.startsWith("10") && !x.startsWith("1040"));
            const good = b?.ok === true && s1.status === "DRAFT" && s1.paidTotal === 0 && d1.length === 0 && again?.ok === false && /ถูกยกเลิกไปแล้ว/.test(String(again?.reason)) && fresh?.ok === true && s2.status === "PAID" && !!s2.docNo
              && d2.length === 3 && d2.includes("2200:-70000") && d2.includes("4000:-1000000") && bankCode?.endsWith(":1070000");
            ok &&= !!good; out.push(`a) bounce ${J(b)} → ${s1.status}/${s1.paidTotal} TBΔ ${JSON.stringify(d1)} · approve same key ${J(again)} · approve new key ${J(fresh)} → ${s2.status} ${s2.docNo} TBΔ ${JSON.stringify(d2)}`);
          }
          { // b) bounce → cancel the draft
            const b0 = await tb(); const w = await worst();
            const b = await cheque.bounceCheque(T, A, w.cq, "x");
            const v = await accSvc.voidDocument(T, A, w.re, "ยกเลิกร่าง"); const s = await docSt(w.re); const d = tbDiff(b0, await tb());
            const rv = await P.accountJournalEntry.count({ where: { systemId: A, refType: "AccountCheque", refId: w.cq } });
            const good = b?.ok === true && v?.ok === true && s.status === "CANCELLED" && d.length === 0 && rv === 0;
            ok &&= good; out.push(`b) bounce → cancel ${J(v)} → ${s.status} · cheque JEs ${rv} (want 0) · TBΔ ${JSON.stringify(d)}`);
          }
          { // c) cleared → bounce → cancel
            const b0 = await tb(); const w = await worst();
            await cheque.depositCheque(T, A, w.cq); await cheque.clearCheque(T, A, w.cq); const dc = tbDiff(b0, await tb());
            const b = await cheque.bounceCheque(T, A, w.cq, "x"); const d1 = tbDiff(b0, await tb()); const s1 = await docSt(w.re);
            const v = await accSvc.voidDocument(T, A, w.re, "ยกเลิกร่าง"); const d2 = tbDiff(b0, await tb());
            const good = dc.length === 2 && b?.ok === true && d1.length === 0 && s1.status === "DRAFT" && v?.ok === true && d2.length === 0;
            ok &&= good; out.push(`c) clear → TBΔ ${JSON.stringify(dc)} · bounce ${J(b)} → ${s1.status} TBΔ ${JSON.stringify(d1)} · cancel ${J(v)} → TBΔ ${JSON.stringify(d2)}`);
          }
          { // d) cleared → cancel (no bounce): money in the bank, register stays CLEARED
            const b0 = await tb(); const w = await worst();
            await cheque.depositCheque(T, A, w.cq); await cheque.clearCheque(T, A, w.cq);
            const v = await accSvc.voidDocument(T, A, w.re, "ยกเลิกร่าง"); const d = tbDiff(b0, await tb()); const s = await docSt(w.re);
            const cs = (await P.accountCheque.findUnique({ where: { id: w.cq }, select: { status: true } })).status;
            const ev = await recEvents(w.pid);
            const good = v?.ok === true && s.status === "CANCELLED" && d.length === 0 && cs === "CLEARED" && ev.rec === 1 && ev.voi === 1;
            ok &&= good; out.push(`d) clear → cancel ${J(v)} → ${s.status} · register ${cs} · events recorded/voided ${ev.rec}/${ev.voi} · TBΔ ${JSON.stringify(d)}`);
          }
          { // e) live cheque → cancel refused (guidance) · approve again with the same key ⇒ issued
            const b0 = await tb(); const w = await worst();
            const v = await accSvc.voidDocument(T, A, w.re, "x");
            const again = await pay.approveReceiptWithPayments(T, A, w.re, [row(chqDFake())], { keyBase: w.key });
            const s = await P.accountDocument.findUnique({ where: { id: w.re }, select: { status: true, docNo: true } }); const d = tbDiff(b0, await tb());
            const good = v?.ok === false && /เช็ค/.test(String(v?.reason)) && again?.ok === true && s.status === "PAID" && d.includes("1040:1070000") && d.includes("4000:-1000000");
            ok &&= good; out.push(`e) live cheque: cancel ${J(v)} · approve same key ${J(again)} → ${s.status} ${s.docNo} TBΔ ${JSON.stringify(d)}`);
          }
          chk("R12-DRAFT", ok, out.join(" ‖ "));
        });

        await sub("R12-CLEARED", async () => {
          const b0 = await tb(); const re = await mkRe();
          const ap = await pay.approveReceiptWithPayments(T, A, re, [row({ chequeNo: `R12C-${++ks}`, bankName: "KBank", chequeDate: today })], { keyBase: kb() });
          const p = await P.accountDocumentPayment.findFirst({ where: { documentId: re }, select: { id: true, chequeId: true } });
          await cheque.depositCheque(T, A, p.chequeId); const cl = await cheque.clearCheque(T, A, p.chequeId);
          const v = await accSvc.voidDocument(T, A, re, "ลูกค้าคืนสินค้า");
          const d = tbDiff(b0, await tb()); const s = await docSt(re);
          const cs = (await P.accountCheque.findUnique({ where: { id: p.chequeId }, select: { status: true } })).status;
          const ev = await recEvents(p.id);
          chk("R12-CLEARED", ap?.ok === true && cl?.ok === true && v?.ok === true && s.status === "VOIDED" && d.length === 0 && cs === "CLEARED" && ev.rec === 1 && ev.voi === 1,
            `cash-sale by cheque ${J(ap)} → clear ${J(cl)} → voidDocument ${J(v)} → ${s.status} · register ${cs} (no fake bounce) · TBΔ ${JSON.stringify(d)} (want []) · events recorded/voided ${ev.rec}/${ev.voi} (want 1/1)`);
        });

        await sub("R12-EVT", async () => {
          const c = await mk("R12");
          const res: string[] = []; let ok = true;
          for (const how of ["transfer", "cheque"] as const) {
            const re = await mkRe();
            const d = await deal(c, { invoiceDocId: re });
            const s0 = await state(c, d.id);
            const ap = await pay.approveReceiptWithPayments(T, A, re, [row(how === "cheque" ? { chequeNo: `R12E-${++ks}`, bankName: "KBank", chequeDate: today } : null)], { keyBase: kb() });
            await deliver(); const s1 = await state(c, d.id);
            const p = await P.accountDocumentPayment.findFirst({ where: { documentId: re }, select: { id: true, chequeId: true } });
            if (how === "cheque") { await cheque.depositCheque(T, A, p.chequeId); await cheque.clearCheque(T, A, p.chequeId); }
            const v = await accSvc.voidDocument(T, A, re, "ยกเลิกการขาย");
            await deliver(); const s2 = await state(c, d.id);
            const ev = await recEvents(p.id);
            const good = ap?.ok === true && v?.ok === true && ev.rec === 1 && ev.voi === 1 && s1.paid === s0.paid && s1.comm === s0.comm && s2.paid === s0.paid && s2.comm === s0.comm;
            ok &&= good;
            res.push(`${how}: approve ${J(ap)} → deal ${JSON.stringify(s1)} · void ${J(v)} → deal ${JSON.stringify(s2)} (before ${JSON.stringify(s0)}) · events recorded/voided ${ev.rec}/${ev.voi}`);
          }
          chk("R12-EVT", ok, `cash-sale receipts are not deal money (CRM counts INVOICE/DEPOSIT_RECEIPT) — symmetric events, nothing counted, nothing reversed: ${res.join(" ‖ ")}`);
        });
      }
      { // R13 (round 13 · hunter r12 R12-1) — draft receipt that already holds live payments (attach committed, issue failed), user comes back:
        //   second attach refused · approve with a NEW key and EQUAL rows ⇒ issued once · DIFFERENT rows ⇒ refused, nothing written · EMPTY rows ⇒ issued with the attached ones
        const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
        const pay = (await import("@/lib/modules/account/payment" as string)) as Any;
        const bk = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `บัญชี R13 ${TAG}`, bankName: "ออมสิน" });
        if (!bk?.ok) throw new Error(`bank: ${bk?.reason}`);
        const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
        const day = new Date(`${today}T00:00:00Z`);
        let ks = 0; const kb = () => `r13k${++ks}_${randomBytes(3).toString("hex")}`;
        const mkRe = async () => (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 1_000_000 }] })).id as string;
        const J = (v: Any) => JSON.stringify(v?.ok ? { ok: true } : v);
        const counts = async (re: string) => ({
          live: await P.accountDocumentPayment.count({ where: { documentId: re, voidedAt: null } }),
          cheques: await P.accountDocumentPayment.count({ where: { documentId: re, chequeId: { not: null } } }),
          rec: await P.outboxEvent.count({ where: { tenantId: T, type: "account.payment.recorded", payload: { path: ["documentId"], equals: re } } }),
          je: await P.accountJournalEntry.count({ where: { systemId: A } }),
          doc: await P.accountDocument.findUnique({ where: { id: re }, select: { status: true, docNo: true, paidTotal: true } }),
        });
        // attach committed, issue never ran (= the state a failed issue leaves)
        const worst = async (how: "cheque" | "transfer") => {
          const re = await mkRe(); const key = kb(); const chequeNo = `R13-${ks}`;
          const r = await cheque.attachReceiptPaymentsWithChequesInOneTx(T, A, re, [{ paidAt: day, channel: how === "cheque" ? "CHEQUE" : "TRANSFER", financeAccountId: how === "cheque" ? null : bk.id, amount: 1_070_000, whtAmountSatang: 0, whtRateBp: null, feeAmount: 0, note: null, createdById: null, idempotencyKey: `${key}:0`, cheque: how === "cheque" ? { chequeNo, bankName: "KBank", chequeDate: day } : null, chequeFinanceAccountId: bk.id }]);
          if (!r.ok) throw new Error(`attach: ${r.reason}`);
          return { re, chequeNo };
        };
        const row = (amt: number, chequeNo: string | null) => ({ paidAt: today, financeAccountId: bk.id, amountSatang: amt, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: chequeNo ? { chequeNo, bankName: "KBank", chequeDate: today } : null });
        const sub = async (id: string, f: () => Promise<void>) => { try { await f(); } catch (e) { chk(id, false, `FATAL ${e instanceof Error ? e.message : String(e)}`); } };
        await sub("R13-RETRY", async () => {
          const out: string[] = []; let ok = true;
          for (const how of ["cheque", "transfer"] as const) {
            // second attach refused (service guard)
            const w0 = await worst(how);
            const again = await cheque.attachReceiptPaymentsWithChequesInOneTx(T, A, w0.re, [{ paidAt: day, channel: "TRANSFER", financeAccountId: bk.id, amount: 1_070_000, whtAmountSatang: 0, whtRateBp: null, feeAmount: 0, note: null, createdById: null, idempotencyKey: `${kb()}:0`, cheque: null, chequeFinanceAccountId: bk.id }]);
            // EQUAL rows, new key ⇒ issued once
            const w1 = await worst(how);
            const eq = await pay.approveReceiptWithPayments(T, A, w1.re, [row(1_070_000, how === "cheque" ? w1.chequeNo : null)], { keyBase: kb() });
            const c1 = await counts(w1.re);
            // DIFFERENT rows, new key ⇒ refused, nothing written
            const w2 = await worst(how); const b2 = await counts(w2.re);
            const diffRow = how === "cheque" ? row(1_070_000, `${w2.chequeNo}-X`) : row(1_070_000, "NEW-CHQ"); // other cheque no. / other channel
            const diff = await pay.approveReceiptWithPayments(T, A, w2.re, [diffRow], { keyBase: kb() });
            const a2 = await counts(w2.re);
            // EMPTY rows, new key ⇒ issued with the attached payments
            const w3 = await worst(how);
            const empty = await pay.approveReceiptWithPayments(T, A, w3.re, [], { keyBase: kb() });
            const c3 = await counts(w3.re);
            const good = c1.cheques === (how === "cheque" ? 1 : 0) && again?.ok === false && /มีรายการรับชำระอยู่แล้ว/.test(String(again?.reason))
              && eq?.ok === true && c1.live === 1 && c1.rec === 1 && c1.doc.status === "PAID" && !!c1.doc.docNo && c1.doc.paidTotal === 1_070_000
              && diff?.ok === false && /มีรายการรับชำระอยู่แล้ว/.test(String(diff?.reason)) && JSON.stringify(a2) === JSON.stringify(b2) && a2.doc.status === "DRAFT"
              && empty?.ok === true && c3.live === 1 && c3.rec === 1 && c3.doc.status === "PAID" && c3.doc.paidTotal === 1_070_000;
            ok &&= good;
            out.push(`${how}: 2nd attach ${J(again)} · equal rows ${J(eq)} → live ${c1.live} rec ${c1.rec} ${c1.doc.status} ${c1.doc.docNo} paid ${c1.doc.paidTotal} · different rows ${J(diff)} → nothing written ${JSON.stringify(a2) === JSON.stringify(b2)} (${a2.doc.status}) · empty rows ${J(empty)} → live ${c3.live} rec ${c3.rec} ${c3.doc.status} paid ${c3.doc.paidTotal}`);
          }
          chk("R13-RETRY", ok, out.join(" ‖ "));
        });
      }
      chk("F1", bad === 0, `cheque races (bounce∥bounce · clear∥bounce · voidPayment∥bounce · voidCheque∥voidCheque/voidVendorPayment) × 5: paidTotal = Σ live payments, one bounce entry, no double decrement — bad=${bad}/${n} · ${out.join(" · ")}`);
    }
    // D3 · Q2: dashboard "paid" bucket (revenue) = grand − live CN of each PAID invoice ⇒ inv 107,000 + inv2 (107,000 − 10,700) = 203,300
    const dash = (await import("@/lib/modules/account/dashboard" as string)) as Any;
    const yr = Number(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 4));
    const ser = await dash.monthlyStatusSeries({ tenantId: T, systemId: A }, "revenue", yr);
    const tot = ser?.total ?? {};
    // round 12: same document scope as the dashboard (SALES_WHERE: INVOICE · cash-sale RECEIPT without source · TAX_INVOICE_ABB) — probes above now leave issued cash-sale receipts PAID
    const allPaid = (await P.accountDocument.findMany({ where: { tenantId: T, systemId: A, direction: "OUT", status: "PAID", OR: [{ docType: "INVOICE" }, { docType: "RECEIPT", sourceDocId: null }, { docType: "TAX_INVOICE_ABB" }] }, select: { id: true, grandTotal: true } })) as Any[];
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
