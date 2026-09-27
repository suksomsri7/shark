// probe-l2-money.mts — C5.2 HUNTER lens L2 (money & numbers) · NOT an oracle · QC2 ONLY (ep-cool-shadow)
// Run: bash scripts/qc2.sh pnpm exec tsx scripts/pending/hunt-l2/probe-l2-money.mts
// Throwaway tenant `qc-hunt-l2-<rand>-a` · every row with that tenantId + the tenant/users is deleted in finally.
//   L2-1 reports.reps "commission" ignores clawback rows (status REVERSED) ⇒ gross ≠ commissions.report net
//   L2-2 wonValueSatang anchors on the invoice grandTotal which is NET of the deducted deposit ⇒ won value understated
//   L2-3 credit note issued on a paid invoice: nothing in CRM moves (paid/wonValue unchanged)
//   L2-4 home KPI "weighted" counts OMITTED deals; board / reports overview do not
//   L2-5 autoWonOnPaid fires when VAT-inclusive cash ≥ pre-VAT deal value (invoice still partially unpaid)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-cool-shadow/.test(host)) { console.log(`not QC2 (${host}) — refuse`); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, "q");
const TAG = `qc-hunt-l2-${rand}`;
const out: Record<string, unknown> = { db: host.replace(/:.*@/, "@"), tag: TAG };
const TENANTS: string[] = [];
const USERS: string[] = [];
const safe = async <T,>(label: string, f: () => Promise<T>): Promise<T | string> => { try { return await f(); } catch (e) { const x = e as Any; return `ERR ${label}: ${x?.name ?? ""}(${x?.code ?? "-"}) ${String(x?.message ?? e).slice(0, 300)}`; } };
const B = (v: Any) => (v === null || v === undefined ? null : Number(v));

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const REP = (await import("@/lib/modules/crm/reports" as string)) as Any;
  const HOME = (await import("@/lib/modules/crm/home-data" as string)) as Any;
  const CM = (await import("@/lib/modules/crm/commissions" as string)) as Any;
  const PAYS = (await import("@/lib/modules/crm/payments" as string)) as Any;
  const DEALS = (await import("@/lib/modules/crm/deals" as string)) as Any;
  const CORE = (await import("@/lib/platform/crm-bridges/core" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  void CRM;

  const t = await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } });
  TENANTS.push(t.id);
  const T = t.id as string;
  const mkUser = async (role: string) => {
    const u = await P.user.create({ data: { email: `${TAG}-${role.toLowerCase()}-${USERS.length}@qc.invalid`, name: `QC ${role} ${TAG}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    return { userId: u.id as string, role, unitAccess: ["*"], permissions: {} };
  };
  const owner = await mkUser("OWNER");
  const rep = await mkUser("STAFF");
  const mkSys = async (label: string, autoWon = false) => {
    const S = (await sysSvc.createSystem(T, "CRM", `${label} ${TAG}`)).id as string;
    await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = '{"crm":{"uiVersion":2,"bridgesEnabled":true,"commission":{"approvalRequired":false,"payrollLink":false}}}'::jsonb WHERE "id" = $1`, S);
    const pipe = await P.crmPipeline.create({
      data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, isDefault: true, autoWonOnPaid: autoWon, stages: { create: [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100]].map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) } },
      include: { stages: true },
    });
    const st = pipe.stages as Any[];
    return { ctx: { tenantId: T, systemId: S, actorUserId: owner.userId }, S, pipe: pipe.id as string, OPEN: st.find((x) => x.kind === "OPEN").id as string, WON: st.find((x) => x.kind === "WON").id as string };
  };
  const mkDeal = async (c: Any, value: number, extra: Any = {}) => {
    const party = await P.party.create({ data: { tenantId: T, name: `ลูกค้า ${TAG}-${Math.random().toString(36).slice(2, 6)}`, kind: "PERSON" } });
    const ct = await P.crmContact.create({ data: { tenantId: T, systemId: c.S, name: party.name, firstName: party.name, partyId: party.id, ownerUserId: rep.userId } });
    return P.crmDeal.create({ data: { tenantId: T, systemId: c.S, contactId: ct.id, pipelineId: c.pipe, stageId: c.OPEN, title: `ดีล ${TAG}`, valueSatang: value, kind: "OPEN", ownerUserId: rep.userId, stageEnteredAt: new Date(), ...extra } });
  };
  const ACC = `${TAG}-acc`;
  const doc = (data: Any) => P.accountDocument.create({ data: { tenantId: T, systemId: ACC, discountAmount: 0, ...data } });
  const pay = (documentId: string, amount: number) => P.accountDocumentPayment.create({ data: { tenantId: T, systemId: ACC, documentId, amount } });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  // ── L2-1 · reports.reps commission vs commissions.report net ─────────────────────────────────────────────
  {
    const c = await mkSys("L2-1");
    const d = await mkDeal(c, 5_000_000);
    const rule = await P.crmCommissionRule.create({ data: { tenantId: T, systemId: c.S, name: `กฎ ${TAG}`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [] } });
    const orig = await P.crmCommission.create({ data: { tenantId: T, systemId: c.S, dealId: d.id, ruleId: rule.id, userId: rep.userId, amountSatang: BigInt(500_000), basisSatang: BigInt(5_000_000), basis: "PAID", status: "PAID", periodKey: month, refType: "DEAL_PAYMENT", refId: `${TAG}-pay#c1` } });
    // exactly what commissions.reverseRows writes when the payment behind a PAID row is voided (commissions.ts:717-735)
    await P.crmCommission.create({ data: { tenantId: T, systemId: c.S, dealId: d.id, ruleId: rule.id, userId: rep.userId, amountSatang: BigInt(-500_000), basisSatang: BigInt(-5_000_000), basis: "PAID", status: "REVERSED", periodKey: month, refType: "REVERSAL", refId: orig.id, reversedOfId: orig.id, decidedAt: new Date() } });
    const r = await safe("reports.reps", () => REP.reps(c.ctx, owner, { from: `${month}-01`, to: today }));
    const cr = await safe("commissions.report", () => CM.report(c.ctx, owner, { periodKey: month }));
    const repRow = typeof r === "string" ? r : (r as Any).rows.find((x: Any) => x.key === rep.userId);
    const netRow = typeof cr === "string" ? cr : (cr as Any).rows.find((x: Any) => x.userId === rep.userId);
    out.L2_1 = { repsCommissionSatang: repRow?.commissionSatang ?? repRow, commissionsReportNet: netRow?.netSatang ?? netRow, reversed: netRow?.reversedSatang };
    out.L2_1_verdict = repRow?.commissionSatang === 500_000 && netRow?.netSatang === 0 ? "BUG-REPRODUCED" : "no-bug";
  }

  // ── L2-2 / L2-3 · deposit receipt + invoice with the deposit deducted ⇒ wonValueSatang ───────────────────
  {
    const c = await mkSys("L2-2");
    const Q = await doc({ docType: "QUOTATION", status: "ACCEPTED", subTotal: 10_000_000, vatAmount: 700_000, grandTotal: 10_700_000 }).catch(() => doc({ docType: "QUOTATION", subTotal: 10_000_000, vatAmount: 700_000, grandTotal: 10_700_000 }));
    const DR = await doc({ docType: "DEPOSIT_RECEIPT", status: "AWAITING_PAYMENT", sourceDocId: Q.id, subTotal: 3_000_000, vatAmount: 210_000, grandTotal: 3_210_000 });
    const INV = await doc({ docType: "INVOICE", status: "AWAITING_PAYMENT", sourceDocId: Q.id, subTotal: 10_000_000, vatAmount: 700_000, depositDeducted: 3_210_000, grandTotal: 7_490_000 });
    const d = await mkDeal(c, 10_000_000, { quotationDocId: Q.id });
    const pDR = await pay(DR.id, 3_210_000);
    const r1 = await safe("record DR", () => PAYS.recordDocPayment(c.ctx, { documentId: DR.id, paymentId: pDR.id, amountSatang: 3_210_000 }));
    const s1 = await P.crmDeal.findUnique({ where: { id: d.id }, select: { paidSatang: true, wonValueSatang: true } });
    const linked = await safe("linkInvoiceFromBridge", () => DEALS.linkInvoiceFromBridge(c.ctx, { quotationDocId: Q.id, invoiceDocId: INV.id }));
    const pINV = await pay(INV.id, 7_490_000);
    const r2 = await safe("record INV", () => PAYS.recordDocPayment(c.ctx, { documentId: INV.id, paymentId: pINV.id, amountSatang: 7_490_000 }));
    const s2 = await P.crmDeal.findUnique({ where: { id: d.id }, select: { paidSatang: true, wonValueSatang: true } });
    const mv = await safe("moveDeal WON", () => DEALS.moveDeal(c.ctx, owner, d.id, { stageId: c.WON }));
    const s3 = await P.crmDeal.findUnique({ where: { id: d.id }, select: { kind: true, paidSatang: true, wonValueSatang: true } });
    const ov = await safe("reports.overview", () => REP.overview(c.ctx, owner, { from: `${month}-01`, to: today }));
    out.L2_2 = {
      afterDeposit: { rec: r1, paid: B(s1?.paidSatang), won: B(s1?.wonValueSatang) },
      linked,
      afterInvoice: { rec: r2, paid: B(s2?.paidSatang), won: B(s2?.wonValueSatang) },
      move: typeof mv === "string" ? mv : "ok",
      afterWon: { kind: s3?.kind, paid: B(s3?.paidSatang), won: B(s3?.wonValueSatang) },
      overview: typeof ov === "string" ? ov : { wonValueSatang: (ov as Any).wonValueSatang, paidSatang: (ov as Any).paidSatang, avgWonSatang: (ov as Any).avgWonSatang },
      expected: "customer paid 10,700,000 (= quotation grand incl. VAT) · wonValue should be 10,700,000",
    };
    out.L2_2_verdict = B(s3?.wonValueSatang) === 7_490_000 && B(s3?.paidSatang) === 10_700_000 ? "BUG-REPRODUCED" : "no-bug";

    // L2-3 · credit note 1,070,000 on the paid invoice ⇒ CRM reaction?
    const CN = await doc({ docType: "CREDIT_NOTE", status: "ISSUED", sourceDocId: INV.id, subTotal: 1_000_000, vatAmount: 70_000, grandTotal: 1_070_000 });
    const br = await safe("bridge onDocumentIssued(CN)", () => CORE.onDocumentIssued({ tenantId: T, type: "account.document.issued", payload: { documentId: CN.id } }));
    const s4 = await P.crmDeal.findUnique({ where: { id: d.id }, select: { paidSatang: true, wonValueSatang: true } });
    const comm = await P.crmCommission.count({ where: { dealId: d.id } });
    out.L2_3 = { bridge: br ?? "ok", paidAfterCN: B(s4?.paidSatang), wonAfterCN: B(s4?.wonValueSatang), commissionRows: comm, note: "revenue reduced by 1,070,000 in the book; CRM unchanged" };
    out.L2_3_verdict = B(s4?.paidSatang) === 10_700_000 ? "BUG-REPRODUCED (no reaction)" : "no-bug";
  }

  // ── L2-4 · home KPI weighted includes OMITTED; reports overview / board exclude ─────────────────────────
  {
    const c = await mkSys("L2-4");
    await mkDeal(c, 1_000_000, { forecastCategory: "OMITTED" });
    await mkDeal(c, 1_000_000);
    const k = await safe("home.kpis", () => HOME.kpis(c.ctx, owner, {}));
    const ov = await safe("reports.overview", () => REP.overview(c.ctx, owner, {}));
    const bd = await safe("deals.getBoard", () => DEALS.getBoard(c.ctx, owner, {}));
    const boardW = typeof bd === "string" ? bd : (bd as Any).columns.reduce((s: number, x: Any) => s + x.weightedSatang, 0);
    out.L2_4 = { homeWeighted: typeof k === "string" ? k : (k as Any).weighted?.valueSatang, reportsWeighted: typeof ov === "string" ? ov : (ov as Any).weightedSatang, boardWeighted: boardW };
    out.L2_4_verdict = typeof k !== "string" && (k as Any).weighted?.valueSatang === 400_000 && typeof ov !== "string" && (ov as Any).weightedSatang === 200_000 ? "BUG-REPRODUCED" : "no-bug";
  }

  // ── L2-5 · autoWonOnPaid: VAT-inclusive cash ≥ pre-VAT value ⇒ WON while the invoice is still PARTIAL ─────
  {
    const c = await mkSys("L2-5", true);
    const INV = await doc({ docType: "INVOICE", status: "AWAITING_PAYMENT", subTotal: 10_000_000, vatAmount: 700_000, grandTotal: 10_700_000 });
    const d = await mkDeal(c, 10_000_000, { invoiceDocId: INV.id });
    const p1 = await pay(INV.id, 10_000_000);
    const r = await safe("record partial", () => PAYS.recordDocPayment(c.ctx, { documentId: INV.id, paymentId: p1.id, amountSatang: 10_000_000 }));
    const s = await P.crmDeal.findUnique({ where: { id: d.id }, select: { kind: true, paidSatang: true } });
    out.L2_5 = { rec: r, kind: s?.kind, paid: B(s?.paidSatang), invoiceGrand: 10_700_000, outstanding: 700_000 };
    out.L2_5_verdict = s?.kind === "WON" ? "BUG-REPRODUCED (auto-WON with 700,000 still unpaid)" : "no-bug";
  }
} catch (e) {
  out.fatal = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
} finally {
  await new Promise((r) => setTimeout(r, 3000));
  for (let pass = 0; pass < 4; pass += 1) {
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (const tb of tables) for (const id of TENANTS) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id).catch(() => undefined);
  }
  for (const id of TENANTS) { await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined); await P.tenant.delete({ where: { id } }).catch(() => undefined); }
  for (const id of USERS) { await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined); await P.user.delete({ where: { id } }).catch(() => undefined); }
  out.cleanup = {
    tenantsLeft: await P.tenant.count({ where: { id: { in: TENANTS } } }),
    usersLeft: await P.user.count({ where: { id: { in: USERS } } }),
    outboxLeft: await P.outboxEvent.count({ where: { tenantId: { in: TENANTS } } }),
    dealsLeft: await P.crmDeal.count({ where: { tenantId: { in: TENANTS } } }),
    docsLeft: await P.accountDocument.count({ where: { tenantId: { in: TENANTS } } }),
  };
  console.log(JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  await prisma.$disconnect();
  process.exit(0);
}
