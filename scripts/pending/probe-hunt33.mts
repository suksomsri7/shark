// probe-hunt33.mts — money bug hunt on C3.3 (ff2cb5fb) · H1 value 0→set freezes T · H2 clipped share never topped up after
//   an earlier payment is reversed · H3 deposit-deducted invoice inflates the pre-VAT ratio · H4 commission marked PAID although the
//   employee (no salary profile) got no payroll item
// Run: scripts/pending/run-hunt33.sh (QC1 only · throwaway tenants `qc-hunt33-<rand>-*` · swept in finally incl. OpsAlertState markers)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
console.log(`[env] ${host}`);
if (!host.includes("ep-plain-art")) throw new Error("not QC1 — refuse");
const P = ((await import("@/lib/core/db" as string)) as Any).prisma as Any;
const CM = (await import("@/lib/modules/crm/commissions" as string)) as Any;
const PAY = (await import("@/lib/modules/hr/payroll" as string)) as Any;
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const RAND = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-hunt33-${RAND}`;
const TIDS: string[] = [];
const USERS: string[] = [];
const RULES: string[] = [];
const SYSTEMS: string[] = [];
let n = 0;
const nx = () => `${++n}`;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const sum = (rows: Any[]) => rows.reduce((s: bigint, r: Any) => s + BigInt(r.amountSatang), BigInt(0));
const res: string[] = [];
const verdict = (id: string, bug: boolean, detail: string) => { res.push(`${id}:${bug ? "BUG-REPRODUCED" : "no-bug"}`); console.log(`RESULT ${id}: ${bug ? "BUG-REPRODUCED" : "no-bug"} — ${detail}`); };
const ago = (ms: number) => new Date(Date.now() - ms);
try {
  const mkUser = async (s: string) => { const u = await P.user.create({ data: { email: `${TAG}${s}@qc.invalid`, name: `QC ${s} ${TAG}` } }); USERS.push(u.id); return u.id as string; };
  const mkTenant = async (suffix: string) => { const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } }); TIDS.push(t.id); return t.id as string; };
  const uO = await mkUser("owner"), uA = await mkUser("rep"), uX = await mkUser("other");
  const tid = await mkTenant("a");
  for (const [u, role] of [[uO, "OWNER"], [uA, "STAFF"], [uX, "STAFF"]]) await P.membership.create({ data: { userId: u, tenantId: tid, role, unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const mk = async (label: string, commission: Any) => {
    const id = (await sysSvc.createSystem(tid, "CRM", `${label} ${TAG}`)).id as string;
    SYSTEMS.push(id);
    await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_build_object('crm', $1::jsonb) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, commission }), id);
    const pipe = await P.crmPipeline.create({ data: { tenantId: tid, systemId: id, name: `ขาย ${TAG}`, stages: { create: [["ใหม่", "OPEN"], ["ชนะ", "WON"]].map(([name, kind], i) => ({ tenantId: tid, systemId: id, sortOrder: i, name, kind, probability: kind === "WON" ? 100 : 20 })) } }, include: { stages: true } });
    const st = pipe.stages as Any[];
    return { ctx: { tenantId: tid, systemId: id }, pipe: pipe.id, OPEN: st.find((x) => x.kind === "OPEN").id };
  };
  const rule = async (c: Any, extra: Any = {}) => { const r = await P.crmCommissionRule.create({ data: { tenantId: tid, systemId: c.ctx.systemId, name: `กฎ ${TAG}-${nx()}`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [], createdAt: ago(600_000), ...extra } }); RULES.push(r.id); return r; };
  const mkDeal = async (c: Any, value: number, owner = uA, extra: Any = {}) => {
    const party = await P.party.create({ data: { tenantId: tid, name: `ลูกค้า ${TAG}-${nx()}`, kind: "PERSON" } });
    const ct = await P.crmContact.create({ data: { tenantId: tid, systemId: c.ctx.systemId, name: party.name, firstName: party.name, partyId: party.id, ownerUserId: owner } });
    return P.crmDeal.create({ data: { tenantId: tid, systemId: c.ctx.systemId, contactId: ct.id, pipelineId: c.pipe, stageId: c.OPEN, title: `ดีล ${TAG}`, valueSatang: value, kind: "OPEN", ownerUserId: owner, stageEnteredAt: new Date(), ...extra } });
  };
  const sale = async (grand: number, vat: number) => (await P.posSale.create({ data: { tenantId: tid, unitId: `${TAG}-unit`, systemId: `${TAG}-pos`, idempotencyKey: `${TAG}-sale-${nx()}`, subtotalSatang: grand - vat, vatSatang: vat, grandTotalSatang: grand, status: "PAID", paidAt: new Date() } })).id as string;
  const posPay = async (c: Any, dealId: string, grand: number, vat: number, at = new Date()) => {
    const saleId = await sale(grand, vat);
    await P.crmDealPayment.create({ data: { tenantId: tid, systemId: c.ctx.systemId, dealId, refType: "POS_SALE", refId: saleId, satang: BigInt(grand), status: "COUNTED", countedAt: at } });
    await CM.afterPaymentCounted(c.ctx, { dealId, refType: "POS_SALE", refId: saleId });
    return saleId;
  };
  const rawPay = async (c: Any, dealId: string, satang: number, refId = `${TAG}-${nx()}`, at = new Date()) => {
    const p = await P.crmDealPayment.create({ data: { tenantId: tid, systemId: c.ctx.systemId, dealId, refType: "PAYMENT", refId, satang: BigInt(satang), status: "COUNTED", countedAt: at } });
    await CM.afterPaymentCounted(c.ctx, { dealId, refType: "PAYMENT", refId });
    return p;
  };
  const rows = (dealId: string) => P.crmCommission.findMany({ where: { dealId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const show = (rs: Any[]) => j(rs.map((r: Any) => ({ amt: r.amountSatang, T: r.basisSatang, st: r.status })));
  const AUTO = { approvalRequired: false, payrollLink: false };

  // ── H1 · deal value 0 → POS deposit → value filled in (deal still OPEN) → next POS sale ─────────────────────────
  console.log("\n=== H1 — value-0 deal: POS 10,700 (net 10,000) → set deal value 50,000 → POS 42,800 (net 40,000) · PCT 10% ===");
  const c1 = await mk("H1", AUTO);
  await rule(c1);
  const d1 = await mkDeal(c1, 0);
  await posPay(c1, d1.id, 1_070_000, 70_000);
  const h1a = await rows(d1.id);
  await P.crmDeal.update({ where: { id: d1.id }, data: { valueSatang: 5_000_000 } }); // = deals.updateDeal on an OPEN deal (valueSatang only)
  await posPay(c1, d1.id, 4_280_000, 280_000);
  await CM.runPayrollSync(new Date(), { tenantIds: [tid] });
  const h1 = await rows(d1.id);
  const flags1 = await P.opsAlertState.count({ where: { source: { startsWith: "crm.commission.nomatch:", endsWith: `:${RULES[RULES.length - 1]}` } } });
  // control: identical deal whose value is never filled in
  const d1c = await mkDeal(c1, 0);
  await posPay(c1, d1c.id, 1_070_000, 70_000);
  await posPay(c1, d1c.id, 4_280_000, 280_000);
  const h1c = await rows(d1c.id);
  console.log(`[arith] T = value 5,000,000 (or pre-VAT Σ 5,000,000) · full = 500,000 · after sale 1 = 100,000 · expected Σ = 500,000`);
  console.log(`after sale 1: ${show(h1a)} · after value set + sale 2 + minute job: ${show(h1)} Σ=${sum(h1)} · nomatch flags=${flags1}`);
  console.log(`control (value never set): ${show(h1c)} Σ=${sum(h1c)}`);
  verdict("H1", sum(h1) === BigInt(100_000) && sum(h1c) === BigInt(500_000), `filling in the deal value costs the rep ${Number(sum(h1c) - sum(h1))} satang`);

  // ── H2 · overpaid deal: A 6,000 + B 6,000 on T 10,000 → cancel A ⇒ B stays clipped ─────────────────────────────
  console.log("\n=== H2 — value 1,000,000 · PCT 10% · A 600,000 (60,000) + B 600,000 (clipped 40,000) · cancel A ===");
  const c2 = await mk("H2", AUTO);
  await rule(c2);
  const d2 = await mkDeal(c2, 1_000_000);
  const A = await rawPay(c2, d2.id, 600_000, `${TAG}-A`, ago(20_000));
  await rawPay(c2, d2.id, 600_000, `${TAG}-B`, ago(10_000));
  const h2a = await rows(d2.id);
  await P.crmDealPayment.update({ where: { id: A.id }, data: { status: "REVERSED", reversedAt: new Date() } });
  await CM.afterPaymentsReversed(c2.ctx, { dealId: d2.id });
  await CM.runPayrollSync(new Date(), { tenantIds: [tid] });
  const h2 = await rows(d2.id);
  const counted2 = await P.crmDealPayment.findMany({ where: { dealId: d2.id, status: "COUNTED" }, select: { satang: true } });
  console.log(`[arith] after cancel: counted = ${j(counted2.map((x: Any) => x.satang))} = 600,000 ⇒ F_T(600,000) = 60,000 expected net`);
  console.log(`before cancel: ${show(h2a)} Σ=${sum(h2a)} · after cancel + revisit + minute job: ${show(h2)} Σ=${sum(h2)}`);
  verdict("H2", sum(h2) === BigInt(40_000), `net ${sum(h2)} for 600,000 still collected (expected 60,000)`);

  // ── H3 · invoice with a deposit deducted: ratio = net / (grand − deposit) ─────────────────────────────────────
  console.log("\n=== H3 — invoice net 100,000 + VAT 7,000, deposit 32,100 deducted ⇒ grand 74,900 · pay half (37,450) · PCT 10% on value 100,000 ===");
  const c3 = await mk("H3", AUTO);
  await rule(c3);
  const doc = await P.accountDocument.create({ data: { tenantId: tid, systemId: `${TAG}-acc`, docType: "INVOICE", status: "AWAITING_PAYMENT", subTotal: 10_000_000, discountAmount: 0, vatAmount: 700_000, depositDeducted: 3_210_000, grandTotal: 7_490_000 } })
    .catch(async () => P.accountDocument.create({ data: { tenantId: tid, systemId: `${TAG}-acc`, docType: "INVOICE", subTotal: 10_000_000, discountAmount: 0, vatAmount: 700_000, depositDeducted: 3_210_000, grandTotal: 7_490_000 } }));
  const adp = await P.accountDocumentPayment.create({ data: { tenantId: tid, systemId: `${TAG}-acc`, documentId: doc.id, amount: 3_745_000 } });
  const d3 = await mkDeal(c3, 10_000_000, uA, { invoiceDocId: doc.id });
  await rawPay(c3, d3.id, 3_745_000, adp.id);
  const h3 = await rows(d3.id);
  console.log(`[arith] 37,450 cash = 35,000 pre-VAT (×100/107) ⇒ expected 350,000 satang · code ratio = 10,000,000 / 7,490,000 ⇒ 3,745,000 × ratio = 5,000,000 ⇒ 500,000`);
  console.log(`rows: ${show(h3)} Σ=${sum(h3)}`);
  verdict("H3", sum(h3) === BigInt(500_000), `credited ${sum(h3)} for 35,000 baht pre-VAT collected (expected 350,000) — over by ${Number(sum(h3)) - 350_000}`);

  // ── H4 · employee linked + active but no salary profile ⇒ run skips the employee, adjustment still bound, commission PAID ──
  console.log("\n=== H4 — rep has an active linked HR employee WITHOUT salary profile · commission 100,000 → HR approve → run → approve → markPaid ===");
  const tidB = await mkTenant("b");
  for (const [u, role] of [[uO, "OWNER"], [uA, "STAFF"], [uX, "STAFF"]]) await P.membership.create({ data: { userId: u, tenantId: tidB, role, unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const hr = (await sysSvc.createSystem(tidB, "HR", `HR ${TAG}`)).id as string;
  SYSTEMS.push(hr);
  const cHR = { tenantId: tidB, systemId: hr };
  const empA = await P.hrEmployee.create({ data: { tenantId: tidB, systemId: hr, name: `พนักงานคอมล้วน ${TAG}`, linkedUserId: uA, active: true } });
  const empX = await P.hrEmployee.create({ data: { tenantId: tidB, systemId: hr, name: `พนักงานเงินเดือน ${TAG}`, linkedUserId: uX, active: true } });
  await PAY.setSalaryProfile(cHR, { employeeId: empX.id, baseSalarySatang: 3_000_000 });
  const crm4 = (await sysSvc.createSystem(tidB, "CRM", `H4 ${TAG}`)).id as string;
  SYSTEMS.push(crm4);
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_build_object('crm', $1::jsonb) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, commission: { approvalRequired: false, payrollLink: true } }), crm4);
  const pipe4 = await P.crmPipeline.create({ data: { tenantId: tidB, systemId: crm4, name: `ขาย ${TAG}`, stages: { create: [{ tenantId: tidB, systemId: crm4, sortOrder: 0, name: "ใหม่", kind: "OPEN", probability: 20 }] } }, include: { stages: true } });
  const r4 = await P.crmCommissionRule.create({ data: { tenantId: tidB, systemId: crm4, name: `กฎ ${TAG}-h4`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [], createdAt: ago(600_000) } });
  RULES.push(r4.id);
  const party4 = await P.party.create({ data: { tenantId: tidB, name: `ลูกค้า ${TAG}-h4`, kind: "PERSON" } });
  const ct4 = await P.crmContact.create({ data: { tenantId: tidB, systemId: crm4, name: party4.name, firstName: party4.name, partyId: party4.id, ownerUserId: uA } });
  const d4 = await P.crmDeal.create({ data: { tenantId: tidB, systemId: crm4, contactId: ct4.id, pipelineId: pipe4.id, stageId: pipe4.stages[0].id, title: `ดีล ${TAG}`, valueSatang: 1_000_000, kind: "OPEN", ownerUserId: uA, stageEnteredAt: new Date() } });
  const ref4 = `${TAG}-h4pay`;
  await P.crmDealPayment.create({ data: { tenantId: tidB, systemId: crm4, dealId: d4.id, refType: "PAYMENT", refId: ref4, satang: BigInt(1_000_000), status: "COUNTED", countedAt: new Date() } });
  await CM.afterPaymentCounted({ tenantId: tidB, systemId: crm4 }, { dealId: d4.id, refType: "PAYMENT", refId: ref4 });
  const c4 = (await rows(d4.id))[0];
  const adj = c4 ? await P.hrPayAdjustment.findFirst({ where: { crmCommissionId: c4.id } }) : null;
  console.log(`commission ${show(c4 ? [c4] : [])} · HR adj ${j(adj ? { emp: adj.employeeId === empA.id ? "empA(no profile)" : adj.employeeId, period: adj.periodKey, status: adj.status, amt: adj.amountSatang } : null)}`);
  if (adj) {
    const dec = await PAY.decideAdjustment(cHR, adj.id, "APPROVED", { userId: uO, isOwner: true });
    const run = await PAY.createPayrollRun(cHR, { periodKey: adj.periodKey, payDate: new Date() });
    const ap = await PAY.approveRun(cHR, run.id);
    const mp = await PAY.markPaid(cHR, run.id);
    const paid = await CM.onPayrollPaid({ tenantId: tidB, hrSystemId: hr, runId: run.id });
    const items = await P.hrPayrollItem.findMany({ where: { runId: run.id }, select: { employeeId: true, addSatang: true, netSatang: true } });
    const adjAfter = await P.hrPayAdjustment.findUnique({ where: { id: adj.id } });
    const c4After = await P.crmCommission.findUnique({ where: { id: c4.id } });
    console.log(`decide=${j(dec)} approveRun=${j(ap)} markPaid=${j(mp)} onPayrollPaid=${j(paid)}`);
    console.log(`run items: ${j(items.map((i: Any) => ({ emp: i.employeeId === empA.id ? "empA" : i.employeeId === empX.id ? "empX" : i.employeeId, add: i.addSatang, net: i.netSatang })))} · adj.runId=${adjAfter?.runId === run.id ? "this run" : adjAfter?.runId} · commission status=${c4After?.status}`);
    verdict("H4", c4After?.status === "PAID" && !items.some((i: Any) => i.employeeId === empA.id) && adjAfter?.runId === run.id, "commission PAID + adjustment bound to the paid run, yet the run has no item for the employee (0 satang paid)");
  } else verdict("H4", false, "no HR adjustment was created — could not run");

  // ── H5 · HR creates the month's run, THEN approves the pending commission adjustment (stranded APPROVED) → payment voided ⇒
  //        commission never paid, yet a DEDUCTION of the full amount is filed and taken in the next run ──
  console.log("\n=== H5 — rep with salary profile · commission 100,000 · run(P) created while adj PENDING · HR approves adj · payment voided ===");
  const d5 = await P.crmDeal.create({ data: { tenantId: tidB, systemId: crm4, contactId: ct4.id, pipelineId: pipe4.id, stageId: pipe4.stages[0].id, title: `ดีล ${TAG}-h5`, valueSatang: 1_000_000, kind: "OPEN", ownerUserId: uX, stageEnteredAt: new Date() } });
  const ref5 = `${TAG}-h5pay`;
  const pay5 = await P.crmDealPayment.create({ data: { tenantId: tidB, systemId: crm4, dealId: d5.id, refType: "PAYMENT", refId: ref5, satang: BigInt(1_000_000), status: "COUNTED", countedAt: new Date() } });
  await CM.afterPaymentCounted({ tenantId: tidB, systemId: crm4 }, { dealId: d5.id, refType: "PAYMENT", refId: ref5 });
  const c5 = (await rows(d5.id))[0];
  const adj5 = c5 ? await P.hrPayAdjustment.findFirst({ where: { crmCommissionId: c5.id } }) : null;
  if (adj5) {
    const runP = await PAY.createPayrollRun(cHR, { periodKey: adj5.periodKey, payDate: new Date() }); // HR runs the month first …
    const dec5 = await PAY.decideAdjustment(cHR, adj5.id, "APPROVED", { userId: uO, isOwner: true }); // … then approves what was pending
    await CM.runPayrollSync(new Date(), { tenantIds: [tidB] }); // sweeper: PENDING only ⇒ leaves it
    await PAY.approveRun(cHR, runP.id);
    await PAY.markPaid(cHR, runP.id);
    await CM.onPayrollPaid({ tenantId: tidB, hrSystemId: hr, runId: runP.id });
    const itemP = await P.hrPayrollItem.findFirst({ where: { runId: runP.id, employeeId: empX.id }, select: { addSatang: true, deductSatang: true } });
    const adj5b = await P.hrPayAdjustment.findUnique({ where: { id: adj5.id } });
    // the customer's payment is voided afterwards
    await P.crmDealPayment.update({ where: { id: pay5.id }, data: { status: "REVERSED", reversedAt: new Date() } });
    await CM.afterPaymentsReversed({ tenantId: tidB, systemId: crm4 }, { dealId: d5.id });
    const rs5 = await rows(d5.id);
    const rev5 = rs5.find((r: Any) => r.reversedOfId === c5.id);
    const ded = rev5 ? await P.hrPayAdjustment.findFirst({ where: { crmCommissionId: rev5.id } }) : null;
    let itemN: Any = null;
    if (ded) {
      await PAY.decideAdjustment(cHR, ded.id, "APPROVED", { userId: uO, isOwner: true });
      const runN = await PAY.createPayrollRun(cHR, { periodKey: ded.periodKey, payDate: new Date() });
      itemN = await P.hrPayrollItem.findFirst({ where: { runId: runN.id, employeeId: empX.id }, select: { addSatang: true, deductSatang: true } });
    }
    console.log(`adj ${adj5.periodKey} decide=${j(dec5)} · after run(P) paid: adj.status=${adj5b?.status} adj.runId=${adj5b?.runId ?? null} · run(P) item for rep ${j(itemP)} · commission=${(await P.crmCommission.findUnique({ where: { id: c5.id } }))?.status}`);
    console.log(`after void: rows ${show(rs5)} · DEDUCTION ${j(ded ? { period: ded.periodKey, kind: ded.kind, amt: ded.amountSatang, status: ded.status } : null)} · next run item for rep ${j(itemN)}`);
    verdict("H5", !adj5b?.runId && Number(itemP?.addSatang ?? 0) === 0 && !!ded && ded.kind === "DEDUCTION" && ded.amountSatang === 100_000 && Number(itemN?.deductSatang ?? 0) === 100_000,
      "commission 100,000 never reached any payroll item, yet 100,000 is deducted from the rep's next salary");
  } else verdict("H5", false, "no HR adjustment was created — could not run");
} catch (e) {
  console.log(`PROBE-FATAL ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  const payIds: string[] = [];
  for (const t of TIDS) payIds.push(...((await P.crmDealPayment.findMany({ where: { tenantId: t }, select: { id: true } })) as Any[]).map((x) => x.id as string));
  await P.opsAlertState.deleteMany({ where: { source: { in: payIds.map((x) => `crm.commission.first:${x}`) } } });
  await P.opsAlertState.deleteMany({ where: { source: { in: SYSTEMS.map((s) => `crm.commission.q1a.cursor:${s}`) } } });
  for (const r of RULES) await P.opsAlertState.deleteMany({ where: { source: { startsWith: "crm.commission.nomatch:", endsWith: `:${r}` } } }).catch(() => undefined);
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((x) => x.table_name as string);
  for (const t0 of TIDS) {
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, t0).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: t0 } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: t0 } }).catch(() => undefined);
  }
  for (const u of USERS) await P.appNotification.deleteMany({ where: { recipientUserId: u } }).catch(() => undefined);
  let left = 0;
  for (const t0 of TIDS) for (const t of tables) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, t0)) as Any[])[0].n);
  for (const u of USERS) await P.user.delete({ where: { id: u } }).catch(() => undefined);
  const markers = await P.opsAlertState.count({ where: { OR: [{ source: { in: payIds.map((x) => `crm.commission.first:${x}`) } }, { source: { in: SYSTEMS.map((s) => `crm.commission.q1a.cursor:${s}`) } }, ...RULES.map((r) => ({ source: { endsWith: `:${r}` } }))] } });
  console.log(`\n[clean] rows left=${left} tenants=${await P.tenant.count({ where: { id: { in: TIDS } } })} users=${await P.user.count({ where: { id: { in: USERS } } })} crm.commission markers left=${markers}`);
  console.log(`SUMMARY ${res.join(" ")}`);
  await P.$disconnect();
}
