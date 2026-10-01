// C5.4-C round-10 hunter probe E (QC2 only · throwaway tenant · deleted at the end)
//   I4  CRM end to end on REAL account documents: deal ↔ invoice (invoiceDocId) · commission rule 10 % on PAID ·
//       pay by cheque → bounce → re-collect by transfer (no WHT / WHT 3 %) · group cheque of 2 invoices (2 deals) → bounce → re-collect by group transfer
//       after every step the tenant's OWN outbox rows are delivered to the registered consumers (never the global drain)
//       expect: deal paid / commission counted exactly once at the end, 0 after the bounce · events exactly once per real change
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r10/probe-r10e.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54de-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = ""; const USERS: string[] = [];
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const pay = (await import("@/lib/modules/account/payment" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const { consumers } = (await import("@/lib/outbox-consumers" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const u = await P.user.create({ data: { email: `${TAG}-rep@qc.invalid`, name: `rep ${TAG}` } }); USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const actor = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R10", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  // CRM system (same shape as probe-cn mk())
  const S = (await sysSvc.createSystem(T, "CRM", `crm ${TAG}`)).id as string;
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, commission: { approvalRequired: false, payrollLink: false } }), S);
  const pipe = await P.crmPipeline.create({ data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, isDefault: true, stages: { create: [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100]].map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) } }, include: { stages: true } });
  const party = await P.party.create({ data: { tenantId: T, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
  const kContact = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: party.id, ownerUserId: u.id } });
  await P.crmCommissionRule.create({ data: { tenantId: T, systemId: S, name: `กฎ ${TAG}`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [] } });
  const OPEN = (pipe.stages as Any[]).find((x) => x.kind === "OPEN").id;
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };
  const deal = async (invoiceDocId: string) => (await P.crmDeal.create({ data: { tenantId: T, systemId: S, contactId: kContact.id, pipelineId: pipe.id, stageId: OPEN, title: `ดีล ${TAG}`, valueSatang: 10_000_000, kind: "OPEN", ownerUserId: u.id, stageEnteredAt: new Date(), invoiceDocId } })).id as string;
  const delivered: Record<string, number> = {}; const errs: string[] = [];
  const drain = async () => {
    for (let loop = 0; loop < 10; loop += 1) {
      const rows = (await P.outboxEvent.findMany({ where: { tenantId: T, status: "PENDING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 200 })) as Any[];
      if (rows.length === 0) return;
      for (const r of rows) {
        const h = consumers[r.type];
        try { if (h) await h(r); delivered[r.type] = (delivered[r.type] ?? 0) + 1; } catch (e) { errs.push(`${r.type}: ${String((e as Error).message).slice(0, 80)}`); }
        await P.outboxEvent.update({ where: { id: r.id }, data: { status: "DONE", processedAt: new Date() } });
      }
    }
  };
  const state = async (dealId: string) => {
    const d = await P.crmDeal.findUnique({ where: { id: dealId }, select: { paidSatang: true, wonValueSatang: true, kind: true } });
    let comm = 0;
    try { const r = await CRM.commissions.report(ctx, actor, { periodKey: month }); comm = Number((r.rows as Any[]).find((x) => x.userId === u.id)?.netSatang ?? 0); } catch (e) { comm = -1; errs.push(`report: ${String((e as Error).message).slice(0, 60)}`); }
    const rows = (await P.crmDealPayment.findMany({ where: { dealId }, select: { refType: true, status: true, satang: true } })) as Any[];
    return { paid: Number(d?.paidSatang ?? 0), won: d?.wonValueSatang == null ? null : Number(d.wonValueSatang), kind: d?.kind, commAll: comm, rows: rows.map((r) => `${r.refType}:${r.status}:${Number(r.satang)}`).join(",") };
  };
  const inv = async () => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  let seq = 0;
  const chq = () => ({ chequeNo: `E${++seq}-${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: today });
  const short = (r: Any) => (r?.ok ? "ok" : `FAIL(${String(r?.reason ?? r).slice(0, 80)})`);
  const evCount = async (docIds: string[]) => {
    const pays = ((await P.accountDocumentPayment.findMany({ where: { documentId: { in: docIds } }, select: { id: true } })) as Any[]).map((p) => p.id);
    const rec = await P.outboxEvent.count({ where: { tenantId: T, type: "account.payment.recorded", idempotencyKey: { in: pays.map((p) => `account.payment.recorded#${p}`) } } });
    const vd = await P.outboxEvent.count({ where: { tenantId: T, type: "account.payment.voided", idempotencyKey: { in: pays.map((p) => `account.payment.voided#${p}`) } } });
    const paid = await P.outboxEvent.count({ where: { tenantId: T, type: "account.invoice.paid", idempotencyKey: { in: docIds.map((d) => `account.invoice.paid#${d}`) } } });
    return `payments ${pays.length} · recorded ${rec} · voided ${vd} · invoice.paid ${paid}`;
  };
  await drain();

  for (const wht of [false, true]) {
    const k = await inv(); const d = await deal(k); await drain(); const c0 = await state(d);
    const cash = wht ? 10_400_000 : 10_700_000;
    const f = await pay.recordPayments(T, A, k, [{ paidAt: today, financeAccountId: bank.id, amountSatang: cash, whtAmountSatang: wht ? 300_000 : 0, whtRateBp: wht ? 300 : null, whtIncomeType: wht ? "M40_2" : null, feeSatang: 0, note: "", cheque: chq() }], { keyBase: `e${randomBytes(4).toString("hex")}` });
    await drain(); const s1 = await state(d);
    const cq = (await P.accountDocumentPayment.findFirst({ where: { documentId: k, chequeId: { not: null } }, select: { chequeId: true } })).chequeId;
    const b = await cheque.bounceCheque(T, A, cq, "x"); await drain(); const s2 = await state(d);
    const rc = await pay.recordPayments(T, A, k, [{ paidAt: today, financeAccountId: bank.id, amountSatang: cash, whtAmountSatang: wht ? 300_000 : 0, whtRateBp: wht ? 300 : null, whtIncomeType: wht ? "M40_2" : null, feeSatang: 0, note: "", cheque: null }], { keyBase: `e${randomBytes(4).toString("hex")}` });
    await drain(); const s3 = await state(d);
    await drain(); const s4 = await state(d); // redelivery no-op
    log(`I4 single ${wht ? "WHT" : "noWHT"}: before ${JSON.stringify(c0)}`);
    log(`I4   cheque pay ${short(f)} → ${JSON.stringify(s1)}`);
    log(`I4   bounce ${short(b)} → ${JSON.stringify(s2)} (expect paid 0 · commission back to 0)`);
    log(`I4   re-collect ${short(rc)} → ${JSON.stringify(s3)} (expect paid 10,700,000 · commission 1,000,000 once) · second drain identical ${JSON.stringify(s3) === JSON.stringify(s4)} · events ${await evCount([k])}`);
  }
  { // group of 2 invoices, 2 deals
    const kids = [await inv(), await inv()]; const deals = [await deal(kids[0]), await deal(kids[1])]; await drain();
    const g = (await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] })).id;
    const r = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 21_400_000, note: "", feeSatang: 0, wht: [], cheque: chq() }, { clientKey: `eg${randomBytes(3).toString("hex")}` });
    await drain(); const s1 = await Promise.all(deals.map(state));
    const cq = (await P.accountDocumentPayment.findFirst({ where: { documentId: { in: kids }, chequeId: { not: null } }, select: { chequeId: true } })).chequeId;
    const b = await cheque.bounceCheque(T, A, cq, "x"); await drain(); const s2 = await Promise.all(deals.map(state));
    const r2 = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 21_400_000, note: "", feeSatang: 0, wht: [], cheque: null }, { clientKey: `eg${randomBytes(3).toString("hex")}` });
    await drain(); const s3 = await Promise.all(deals.map(state));
    log(`I4 group×2 cheque ${short(r)} → deals ${JSON.stringify(s1.map((s) => [s.paid, s.won]))} · bounce ${short(b)} → ${JSON.stringify(s2.map((s) => [s.paid, s.won]))} (expect 0,0) · group re-collect ${short(r2)} → ${JSON.stringify(s3.map((s) => [s.paid, s.won, s.rows]))} · commission (all deals, whole tenant) ${s3[1].commAll} · events ${await evCount(kids)}`);
  }
  log(`I4 delivered ${JSON.stringify(delivered)} · consumer errors ${errs.length ? errs.slice(0, 5).join(" ; ") : "none"}`);
} catch (e) { log(`FATAL ${e instanceof Error ? e.stack : String(e)}`); }
finally {
  if (T) { const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined); await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    for (const id of USERS) await P.user.delete({ where: { id } }).catch(() => undefined);
    let left = 0; for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    const u = await P.user.count({ where: { id: { in: USERS } } }).catch(() => 0);
    log(`CLEAN left=${left} users=${u}`); }
  await prisma.$disconnect();
}
process.exit(0);
