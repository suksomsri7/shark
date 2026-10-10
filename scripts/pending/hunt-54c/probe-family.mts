// C5.4-C MONEY HUNTER probe (QC2 only · throwaway tenant `qc-hunt54c-*` · deleted at the end) — REAL account paths + real CRM bridge handlers.
//   H1 CN on the TAX_INVOICE of an UNPAID invoice (UI allows INVOICE/RECEIPT/TAX_INVOICE as CN source) → outstanding / payment accepted / status / CRM
//   H2 full refund after full payment: CN on the RECEIPT of a PAID invoice → CRM paid / won / commission
//   H2b CN on the PAID invoice itself (the only source the CREDIT_NOTE money row watches) → refused?
//   H3 over-credit: CN on invoice + CN on its tax invoice
//   H4 WHT: pay cash+WHT → CN rest → void CN → re-issue CN → CRM paid each step + invoice.paid count
//   R  races: 2 CNs for the same remainder · pay ∥ CN ∥ CN · voidPayment ∥ voidDocument(CN) ∥ issue CN2
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c/probe-hunt.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54c-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const out: string[] = [];
const log = (s: string) => { out.push(s); console.log(s); };
const B = (v: Any) => (v === null || v === undefined ? null : Number(v));
const USERS: string[] = [];
let T = "";
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const MONEY = (await import("@/lib/platform/crm-bridges/money" as string)) as Any;
  const CORE = (await import("@/lib/platform/crm-bridges/core" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const OB = P.outboxEvent; const F = OB.findMany; OB.findMany = (a: Any) => F.call(OB, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: T }] } });
  const u = await P.user.create({ data: { email: `${TAG}-rep@qc.invalid`, name: `rep ${TAG}` } }); USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const actor = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const month = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7);
  const [yy, mm] = month.split("-").map(Number) as [number, number];
  const next = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
  const S = (await sysSvc.createSystem(T, "CRM", `crm ${TAG}`)).id as string;
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, commission: { approvalRequired: false, payrollLink: false } }), S);
  const pipe = await P.crmPipeline.create({ data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, isDefault: true, stages: { create: [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100]].map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) } }, include: { stages: true } });
  const OPEN = (pipe.stages as Any[]).find((x) => x.kind === "OPEN").id as string;
  const party = await P.party.create({ data: { tenantId: T, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
  const k = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: party.id, ownerUserId: u.id } });
  await P.crmCommissionRule.create({ data: { tenantId: T, systemId: S, name: `กฎ ${TAG}`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [] } });
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };
  const deal = (invoiceDocId: string) => P.crmDeal.create({ data: { tenantId: T, systemId: S, contactId: k.id, pipelineId: pipe.id, stageId: OPEN, title: `ดีล ${TAG}`, valueSatang: 10_000_000, kind: "OPEN", ownerUserId: u.id, stageEnteredAt: new Date(), invoiceDocId } });
  const commOf = async (dealId: string) => Number((await P.crmCommission.aggregate({ where: { tenantId: T, dealId, status: { in: ["APPROVED", "PAID", "REVERSED", "PENDING"] } }, _sum: { amountSatang: true } }))._sum.amountSatang ?? 0);
  const crm = async (id: string) => {
    const d = await P.crmDeal.findUnique({ where: { id }, select: { paidSatang: true, wonValueSatang: true, kind: true } });
    const rows = await P.crmDealPayment.findMany({ where: { dealId: id, status: "COUNTED" }, select: { refType: true, satang: true } });
    return { kind: d?.kind, paid: B(d?.paidSatang), won: B(d?.wonValueSatang), comm: await commOf(id), rows: rows.map((r: Any) => `${r.refType}:${B(r.satang)}`).join(",") };
  };
  void CRM; void actor; void next;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC HUNT54C", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
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
  const conv = async (src: string, to: string) => { const r = await accSvc.convertDocument(T, A, src, to); if (!r.ok) throw new Error(`convert ${to}: ${r.reason}`); const i = await accSvc.issueDocument(T, A, r.newId); if (!i.ok) throw new Error(`issue ${to}: ${i.reason}`); return r.newId as string; };
  const cnDraft = async (src: string, unit: number) => (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: src, adjustReason: "รับคืน", vatMode: "EXCLUDE", lines: [{ description: "รับคืน", qty: 1, unitPrice: unit }] })).id as string;
  const cnOf = async (src: string, unit: number) => { const id = await cnDraft(src, unit); const r = await accSvc.issueDocument(T, A, id); return { id, ok: r.ok, reason: r.reason }; };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, grandTotal: true, paidTotal: true } })) as Any;
  const paidEvt = async (id: string) => P.outboxEvent.count({ where: { tenantId: T, type: "account.invoice.paid", idempotencyKey: `account.invoice.paid#${id}` } });
  const outst = async (id: string) => { const f = await accSvc.paymentTargetOf(T, A, id); return f ? accSvc.paymentOutstandingOf(f.target) : null; };
  const liveCn = async (ids: string[]) => Number((await P.accountDocument.aggregate({ where: { systemId: A, docType: "CREDIT_NOTE", sourceDocId: { in: ids }, status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } }, _sum: { grandTotal: true } }))._sum.grandTotal ?? 0);
  const ar1100 = async () => {
    const r = (await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = '1100'`, A).catch((e: Any) => [{ n: `ERR ${String(e.message).slice(0, 80)}` }])) as Any[];
    return String(r[0]?.n);
  };

  const AR = async () => Number((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE l."systemId" = $1 AND a."code" = '1100'`, A) as Any[])[0]?.n ?? 0);
  const mkDoc = async (docType: string, unit: number, extra: Any = {}) => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType, contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: docType, qty: 1, unitPrice: unit }], ...extra }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(`issue ${docType}: ${r.reason}`); return d.id as string; };
  const dealQ = (quotationDocId: string) => P.crmDeal.create({ data: { tenantId: T, systemId: S, contactId: k.id, pipelineId: pipe.id, stageId: OPEN, title: `ดีล ${TAG}`, valueSatang: 10_000_000, kind: "OPEN", ownerUserId: u.id, stageEnteredAt: new Date(), quotationDocId } });
  const J = (x: Any) => JSON.stringify(x);
  const rs = (r: Any) => (r.ok ? "ok" : `REFUSED(${String(r.reason).slice(0, 60)})`);
  // ── N1 · 3-level chain Q → IV → RC → TI, deal anchored on the quotation ──
  {
    const ar0 = await AR();
    const q = await mkDoc("QUOTATION", 10_000_000); const d = await dealQ(q); await deliver();
    const iv = await conv(q, "INVOICE"); await deliver();
    const p = await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: 10_700_000 }); await deliver();
    const rc = await conv(iv, "RECEIPT"); await deliver();
    const ti = await conv(rc, "TAX_INVOICE"); await deliver();
    const c0 = await crm(d.id);
    const cn1 = await cnOf(ti, 5_000_000); await deliver();
    const c1 = await crm(d.id);
    const cn2 = await cnOf(rc, 6_000_000); await deliver();
    const cn3 = await cnOf(iv, 1_000_000); await deliver();
    const cn4 = await cnOf(q, 1_000_000); await deliver();
    const dl = await P.crmDeal.findUnique({ where: { id: d.id }, select: { invoiceDocId: true } });
    log(`N1 Q→IV→RC→TI deal.invoiceDocId=${dl?.invoiceDocId === iv ? "IV" : dl?.invoiceDocId} pay ${rs(p)} crm0=${J(c0)} · CN 53,500 on TI(depth3) ${rs(cn1)} → IV ${J(await st(iv))} crm=${J(c1)} · CN 64,200 on RC ${rs(cn2)} · CN 10,700 on IV ${rs(cn3)} · CN 10,700 on Q ${rs(cn4)} · final crm=${J(await crm(d.id))} outstanding=${await outst(iv)} ARΔ=${(await AR()) - ar0}`);
  }
  // ── N2a · CN on the TAX_INVOICE of a DEPOSIT_RECEIPT, then the final invoice deducts the deposit ──
  {
    const ar0 = await AR();
    const q = await mkDoc("QUOTATION", 10_000_000); const d = await dealQ(q); await deliver();
    const dep = await mkDoc("DEPOSIT_RECEIPT", 2_000_000, { sourceDocId: q });
    const pd = await accSvc.recordPayment(T, A, dep, { channel: "TRANSFER", amount: 2_140_000 }); await deliver();
    const dti = await conv(dep, "TAX_INVOICE"); await deliver();
    const cn = await cnOf(dti, 2_000_000); await deliver();
    const depSt = await st(dep); const c1 = await crm(d.id);
    let iv = "", ivInfo: Any = null;
    try { iv = await mkDoc("INVOICE", 10_000_000, { sourceDocId: q, depositReceiptId: dep }); ivInfo = await P.accountDocument.findUnique({ where: { id: iv }, select: { grandTotal: true, depositDeducted: true } }); } catch (e: Any) { ivInfo = `ERR ${e.message}`; }
    await deliver();
    const o = iv ? await outst(iv) : null;
    const pi = iv ? await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: Number(o ?? 0) || 1 }) : null; await deliver();
    log(`N2a dep 21,400 paid ${rs(pd)} → dep TI → CN 21,400 on dep-TI ${rs(cn)} · dep ${J(depSt)} crm=${J(c1)} · final IV ${J(ivInfo)} outstanding=${o} pay ${pi ? rs(pi) : "-"} · cash in=${2_140_000 + Number(o ?? 0)} for sale 10,700,000 less CN 2,140,000 · final crm=${J(await crm(d.id))} ARΔ=${(await AR()) - ar0}`);
  }
  // ── N2b · IV that deducts a deposit → TI → IV paid → CN (refund) on the TI ──
  {
    const ar0 = await AR();
    const q = await mkDoc("QUOTATION", 10_000_000); const d = await dealQ(q); await deliver();
    const dep = await mkDoc("DEPOSIT_RECEIPT", 2_000_000, { sourceDocId: q });
    await accSvc.recordPayment(T, A, dep, { channel: "TRANSFER", amount: 2_140_000 }); await deliver();
    const iv = await mkDoc("INVOICE", 10_000_000, { sourceDocId: q, depositReceiptId: dep }); await deliver();
    const ivs = await st(iv);
    const ti = await conv(iv, "TAX_INVOICE"); await deliver();
    const pi = await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: ivs.grandTotal }); await deliver();
    const c0 = await crm(d.id);
    const tiS = await P.accountDocument.findUnique({ where: { id: ti }, select: { grandTotal: true, subTotal: true } });
    const cnBig = await cnOf(ti, 9_000_000); await deliver();
    const cn = await cnOf(ti, 8_000_000); await deliver();
    log(`N2b IV ${J(ivs)} TI ${J(tiS)} pay ${rs(pi)} crm0=${J(c0)} · CN 96,300 on TI ${rs(cnBig)} · CN 85,600 on TI ${rs(cn)} · IV ${J(await st(iv))} · crm=${J(await crm(d.id))} ARΔ=${(await AR()) - ar0}`);
  }
  // ── N3 · void a RECEIPT that carries a refund CN; then CN on a VOIDED receipt; void an INVOICE carrying a CN ──
  {
    const ar0 = await AR();
    const iv = await invOf(); const d = await deal(iv); await deliver();
    await accSvc.recordPayment(T, A, iv, { channel: "TRANSFER", amount: 10_700_000 }); await deliver();
    const rc = await conv(iv, "RECEIPT"); await deliver();
    const cn = await cnOf(rc, 10_000_000); await deliver();
    const c1 = await crm(d.id);
    const vr = await accSvc.voidDocument(T, A, rc, "x"); await deliver();
    const c2 = await crm(d.id); const s2 = await st(iv);
    const vc = await accSvc.voidDocument(T, A, cn.id, "x"); await deliver();
    const c3 = await crm(d.id); const s3 = await st(iv);
    const cnOnVoided = await cnOf(rc, 10_000_000); await deliver();
    log(`N3 IV paid → RC → CN 107,000 on RC ${rs(cn)} crm=${J(c1)} · void RC ${rs(vr)} IV ${J(s2)} crm=${J(c2)} · void CN ${rs(vc)} IV ${J(s3)} crm=${J(c3)} · new CN on VOIDED RC ${rs(cnOnVoided)} IV ${J(await st(iv))} crm=${J(await crm(d.id))} ARΔ=${(await AR()) - ar0}`);
    const ar1 = await AR();
    const iv2 = await invOf(); const d2 = await deal(iv2); await deliver();
    const cnx = await cnOf(iv2, 10_000_000); await deliver();
    const vi = await accSvc.voidDocument(T, A, iv2, "x"); await deliver();
    log(`N4 IV unpaid + CN 107,000 on IV ${rs(cnx)} → void IV ${rs(vi)} IV ${J(await st(iv2))} liveCN=${await liveCn([iv2])} crm=${J(await crm(d2.id))} ARΔ=${(await AR()) - ar1}`);
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
