// probe-c33fix-review.mts — C3.3-fix money review (27 ก.ย.) SHOULD-FIX S1–S4 · reproduce-then-fixed
//   S1 value-0 deal that HAS a product line (price 0) ⇒ the floating-basis flag must still be set (Σ 500,000 like H1)
//   S2 a clipped period a human REJECTED ⇒ the restored top-up must not auto-approve (PENDING + "เคยถูกปฏิเสธ" note)
//   S3 a uiVersion-1 shop reversing money ⇒ no top-up row / event (restoreClipped is gated like onPaid)
//   S4 WON commission whose HR adjustment is APPROVED but never in a run · deal reopened then re-won ⇒ adjustment withdrawn,
//      row removed, re-win pays the commission again (not 0 with a false "เคยจ่ายแล้ว")
//   B1 (round 2) re-enabled rule: restoreClipped keeps the global F_T cap (Σ never above the full commission)
//   Human decisions are simulated with raw status updates (the paths under test are the hooks, not the approval UI).
// Run: scripts/pending/run-c33fix.sh scripts/pending/probe-c33fix-review.mts <label>  (QC1 only · tenant `qc-c33rev-*` swept in finally)
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
const TAG = `qc-c33rev-${RAND}`;
const TIDS: string[] = [];
const USERS: string[] = [];
const SYSTEMS: string[] = [];
let n = 0;
const nx = () => `${++n}`;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const sum = (rows: Any[]) => rows.reduce((s: bigint, r: Any) => s + BigInt(r.amountSatang), BigInt(0));
const res: string[] = [];
const verdict = (id: string, fixed: boolean, detail: string) => { res.push(`${id}:${fixed ? "FIXED" : "BUG"}`); console.log(`RESULT ${id}: ${fixed ? "FIXED" : "BUG-REPRODUCED"} — ${detail}`); };
try {
  const mkUser = async (s: string) => { const u = await P.user.create({ data: { email: `${TAG}${s}@qc.invalid`, name: `QC ${s} ${TAG}` } }); USERS.push(u.id); return u.id as string; };
  const tid = (await P.tenant.create({ data: { name: `${TAG}-t`, slug: `${TAG}-t` } })).id as string;
  TIDS.push(tid);
  const uO = await mkUser("owner"), uA = await mkUser("rep");
  for (const [u, role] of [[uO, "OWNER"], [uA, "STAFF"]]) await P.membership.create({ data: { userId: u, tenantId: tid, role, unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const setCrm = (id: string, crm: Any) => P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_build_object('crm', $1::jsonb) WHERE "id" = $2`, JSON.stringify(crm), id);
  const mk = async (label: string, commission: Any) => {
    const id = (await sysSvc.createSystem(tid, "CRM", `${label} ${TAG}`)).id as string;
    SYSTEMS.push(id);
    await setCrm(id, { uiVersion: 2, bridgesEnabled: true, commission });
    const pipe = await P.crmPipeline.create({ data: { tenantId: tid, systemId: id, name: `ขาย ${TAG}`, stages: { create: [["ใหม่", "OPEN"], ["ชนะ", "WON"]].map(([name, kind], i) => ({ tenantId: tid, systemId: id, sortOrder: i, name, kind, probability: kind === "WON" ? 100 : 20 })) } }, include: { stages: true } });
    const st = pipe.stages as Any[];
    return { ctx: { tenantId: tid, systemId: id }, id, pipe: pipe.id, OPEN: st.find((x) => x.kind === "OPEN").id, WON: st.find((x) => x.kind === "WON").id };
  };
  const rule = (c: Any, extra: Any = {}) => P.crmCommissionRule.create({ data: { tenantId: tid, systemId: c.id, name: `กฎ ${TAG}-${nx()}`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [], createdAt: new Date(Date.now() - 600_000), ...extra } });
  const mkDeal = async (c: Any, value: number) => {
    const party = await P.party.create({ data: { tenantId: tid, name: `ลูกค้า ${TAG}-${nx()}`, kind: "PERSON" } });
    const ct = await P.crmContact.create({ data: { tenantId: tid, systemId: c.id, name: party.name, firstName: party.name, partyId: party.id, ownerUserId: uA } });
    return P.crmDeal.create({ data: { tenantId: tid, systemId: c.id, contactId: ct.id, pipelineId: c.pipe, stageId: c.OPEN, title: `ดีล ${TAG}`, valueSatang: value, kind: "OPEN", ownerUserId: uA, stageEnteredAt: new Date() } });
  };
  const posPay = async (c: Any, dealId: string, grand: number, vat: number) => {
    const saleId = (await P.posSale.create({ data: { tenantId: tid, unitId: `${TAG}-unit`, systemId: `${TAG}-pos`, idempotencyKey: `${TAG}-sale-${nx()}`, subtotalSatang: grand - vat, vatSatang: vat, grandTotalSatang: grand, status: "PAID", paidAt: new Date() } })).id as string;
    await P.crmDealPayment.create({ data: { tenantId: tid, systemId: c.id, dealId, refType: "POS_SALE", refId: saleId, satang: BigInt(grand), status: "COUNTED", countedAt: new Date() } });
    await CM.afterPaymentCounted(c.ctx, { dealId, refType: "POS_SALE", refId: saleId });
  };
  const rawPay = async (c: Any, dealId: string, satang: number, at: Date) => {
    const refId = `${TAG}-${nx()}`;
    const p = await P.crmDealPayment.create({ data: { tenantId: tid, systemId: c.id, dealId, refType: "PAYMENT", refId, satang: BigInt(satang), status: "COUNTED", countedAt: at } });
    await CM.afterPaymentCounted(c.ctx, { dealId, refType: "PAYMENT", refId });
    return p.id as string;
  };
  const rows = (dealId: string) => P.crmCommission.findMany({ where: { dealId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const show = (rs: Any[]) => j(rs.map((r: Any) => ({ ref: String(r.refId).replace(/^.*#c\d+/, "#c"), amt: r.amountSatang, st: r.status, note: r.note ? "note" : undefined })));
  const voidPay = (id: string) => P.crmDealPayment.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date() } });

  // ── S1 ──
  {
    const c = await mk("S1", { approvalRequired: false, payrollLink: false });
    await rule(c);
    const d = await mkDeal(c, 0);
    await P.crmDealLine.create({ data: { tenantId: tid, dealId: d.id, name: `ของแถม ${TAG}`, unitPriceSatang: 0 } });
    await posPay(c, d.id, 1_070_000, 70_000);
    await P.crmDeal.update({ where: { id: d.id }, data: { valueSatang: 5_000_000 } });
    await posPay(c, d.id, 4_280_000, 280_000);
    const rs = await rows(d.id);
    console.log(`S1 rows ${show(rs)} Σ=${sum(rs)}`);
    verdict("S1", sum(rs) === BigInt(500_000), `value-0 deal with a price-0 line: Σ ${sum(rs)} (expected 500000)`);
  }
  // ── S2 ──
  {
    const c = await mk("S2", { approvalRequired: true, payrollLink: false });
    await rule(c);
    const d = await mkDeal(c, 1_000_000);
    const a = await rawPay(c, d.id, 600_000, new Date(Date.now() - 120_000));
    await rawPay(c, d.id, 600_000, new Date(Date.now() - 60_000));
    const r0 = await rows(d.id); // both PENDING (no chain ⇒ escalated to owner)
    const rowA = r0.find((r: Any) => String(r.refId).startsWith(`${a}#`));
    const rowB = r0.find((r: Any) => !String(r.refId).startsWith(`${a}#`));
    await P.crmCommission.update({ where: { id: rowA.id }, data: { status: "APPROVED", decidedAt: new Date() } }); // owner approves A
    await P.crmCommission.update({ where: { id: rowB.id }, data: { status: "REJECTED", decidedAt: new Date() } }); // owner REJECTS B
    await setCrm(c.id, { uiVersion: 2, bridgesEnabled: true, commission: { approvalRequired: false, payrollLink: false } }); // shop later turns approval off
    await voidPay(a);
    await CM.afterPaymentsReversed(c.ctx, { dealId: d.id });
    const rs = await rows(d.id);
    const top = rs.filter((r: Any) => /#t\d+$/.test(String(r.refId)));
    console.log(`S2 B=${rowB.amountSatang} REJECTED · after void A: rows ${show(rs)}`);
    verdict("S2", top.length === 1 && top[0].status === "PENDING" && !!top[0].note, `top-up of the rejected period: ${top.map((t: Any) => `${t.amountSatang}/${t.status}/${t.note ? "note" : "no-note"}`).join(",") || "none"} (expected PENDING + note, never APPROVED)`);
  }
  // ── S3 ──
  {
    const c = await mk("S3", { approvalRequired: false, payrollLink: false });
    await rule(c);
    const d = await mkDeal(c, 1_000_000);
    const a = await rawPay(c, d.id, 600_000, new Date(Date.now() - 120_000));
    await rawPay(c, d.id, 600_000, new Date(Date.now() - 60_000));
    await setCrm(c.id, { uiVersion: 1, bridgesEnabled: true, commission: { approvalRequired: false, payrollLink: false } }); // shop back on v1
    const evBefore = await P.outboxEvent.count({ where: { tenantId: tid, systemId: c.id, type: "crm.commission.created" } });
    await voidPay(a);
    await CM.afterPaymentsReversed(c.ctx, { dealId: d.id });
    const rs = await rows(d.id);
    const top = rs.filter((r: Any) => /#t\d+$/.test(String(r.refId)));
    const evAfter = await P.outboxEvent.count({ where: { tenantId: tid, systemId: c.id, type: "crm.commission.created" } });
    console.log(`S3 v1 shop after void A: rows ${show(rs)} · created events ${evBefore}→${evAfter}`);
    verdict("S3", top.length === 0 && evAfter === evBefore, `v1 shop: top-up rows ${top.length} · new created events ${evAfter - evBefore} (expected 0/0; the reversal itself still happens)`);
  }
  // ── B1 (round 2) · re-enabled rule keeps the GLOBAL cap: value 100,000 · 10 % · P1 80,000 ⇒ 8,000 · rule re-enabled (createdAt reset) ·
  //    P2 50,000 ⇒ F(130k)−8,000 = 2,000 · P3 5,000 (share 0) reversed ⇒ restoreClipped must NOT top up (Σ stays 10,000 = full; bug = 13,000) ──
  {
    const c = await mk("B1", { approvalRequired: false, payrollLink: false });
    const r = await rule(c);
    const d = await mkDeal(c, 100_000);
    await rawPay(c, d.id, 80_000, new Date(Date.now() - 180_000));
    await P.crmCommissionRule.update({ where: { id: r.id }, data: { createdAt: new Date(Date.now() - 1_000) } }); // = disable + re-enable (updateRule resets createdAt)
    await rawPay(c, d.id, 50_000, new Date());
    const p3 = await rawPay(c, d.id, 5_000, new Date());
    const mid = await rows(d.id);
    await voidPay(p3);
    await CM.afterPaymentsReversed(c.ctx, { dealId: d.id });
    const rs = await rows(d.id);
    const top = rs.filter((x: Any) => /#t\d+$/.test(String(x.refId)));
    console.log(`B1 before void P3: ${show(mid)} Σ=${sum(mid)} · after: ${show(rs)} Σ=${sum(rs)}`);
    verdict("B1", sum(rs) === BigInt(10_000) && top.length === 0, `re-enabled rule, P3 voided: Σ ${sum(rs)} · top-ups ${top.map((t: Any) => t.amountSatang).join(",") || "none"} (expected Σ 10000 = full commission, no top-up; bug = 13000)`);
  }
  // ── S4 ──
  {
    const hr = (await sysSvc.createSystem(tid, "HR", `HR ${TAG}`)).id as string;
    SYSTEMS.push(hr);
    const cHR = { tenantId: tid, systemId: hr };
    const emp = await P.hrEmployee.create({ data: { tenantId: tid, systemId: hr, name: `พนักงาน ${TAG}-${nx()}`, linkedUserId: uA, active: true } });
    await PAY.setSalaryProfile(cHR, { employeeId: emp.id, baseSalarySatang: 3_000_000 });
    const c = await mk("S4", { approvalRequired: false, payrollLink: true });
    await rule(c, { basis: "WON" });
    const d = await mkDeal(c, 1_000_000);
    const win = async (at: Date) => {
      await P.crmDeal.update({ where: { id: d.id }, data: { kind: "WON", stageId: c.WON, closedAt: at } });
      await P.crmDealStageHistory.create({ data: { tenantId: tid, dealId: d.id, fromStageId: c.OPEN, toStageId: c.WON, enteredAt: at } });
      await CM.afterDealMoved(c.ctx, { dealId: d.id, kind: "WON" });
    };
    await win(new Date(Date.now() - 120_000));
    const w1 = (await rows(d.id))[0] as Any;
    const adj = w1 ? ((await P.hrPayAdjustment.findFirst({ where: { crmCommissionId: w1.id } })) as Any) : null;
    if (adj) await PAY.decideAdjustment(cHR, adj.id, "APPROVED", { userId: uO, isOwner: true }); // HR approves · no run yet
    // reopened
    await P.crmDeal.update({ where: { id: d.id }, data: { kind: "OPEN", stageId: c.OPEN, closedAt: null } });
    await P.crmDealStageHistory.create({ data: { tenantId: tid, dealId: d.id, fromStageId: c.WON, toStageId: c.OPEN, enteredAt: new Date(Date.now() - 60_000) } });
    await CM.afterDealMoved(c.ctx, { dealId: d.id, kind: "OPEN" });
    const mid = await rows(d.id);
    const adjMid = adj ? await P.hrPayAdjustment.findUnique({ where: { id: adj.id } }) : null;
    // won again
    await win(new Date());
    await CM.runPayrollSync(new Date(), { tenantIds: [tid] });
    const end = await rows(d.id);
    const live = end.filter((r: Any) => !r.reversedOfId && r.status !== "REJECTED" && !end.some((x: Any) => x.reversedOfId === r.id));
    const adjs = (await P.hrPayAdjustment.findMany({ where: { tenantId: tid, employeeId: emp.id } })) as Any[];
    const hrNet = adjs.reduce((s: number, a: Any) => s + (a.kind === "DEDUCTION" ? -a.amountSatang : a.amountSatang), 0);
    const mine = await CM.mine({ tenantId: tid, systemId: c.id, actorUserId: uA }, { userId: uA, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true, "crm.deal.read": true, "crm.activity.read": true, "crm.report.view": true } }, {}).catch((e: Error) => ({ err: e.message }));
    const rewon = (Array.isArray(mine?.items) ? mine.items : Array.isArray(mine) ? mine : []).filter((x: Any) => x?.rewon).length;
    console.log(`S4 win1 ${show(w1 ? [w1] : [])} adj ${adj ? "APPROVED/run null" : "-"} · after reopen rows ${show(mid)} adj ${adjMid ? `${adjMid.status}/run=${adjMid.runId ? "set" : "null"}` : "withdrawn"} · after re-win rows ${show(end)} · live Σ=${sum(live)} · HR net for rep ${hrNet} (${adjs.map((a: Any) => `${a.kind}:${a.amountSatang}/${a.status}`).join(",")}) · rewon badges ${rewon}`);
    verdict("S4", sum(live) === BigInt(100_000) && hrNet === 100_000 && !adjMid, `re-won deal: live commission ${sum(live)} · HR net ${hrNet} (expected 100000/100000 · first adjustment withdrawn on reopen)`);
  }
} catch (e) {
  console.log(`PROBE-FATAL ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  const payIds: string[] = [];
  for (const t of TIDS) payIds.push(...((await P.crmDealPayment.findMany({ where: { tenantId: t }, select: { id: true } })) as Any[]).map((x) => x.id as string));
  const ruleIds: string[] = [];
  for (const t of TIDS) ruleIds.push(...((await P.crmCommissionRule.findMany({ where: { tenantId: t }, select: { id: true } })) as Any[]).map((x) => x.id as string));
  await P.opsAlertState.deleteMany({ where: { source: { in: payIds.map((x) => `crm.commission.first:${x}`) } } });
  await P.opsAlertState.deleteMany({ where: { source: { in: SYSTEMS.flatMap((s) => [`crm.commission.q1a.cursor:${s}`, `crm.commission.payroll.cursor:${s}`]) } } });
  for (const r of ruleIds) await P.opsAlertState.deleteMany({ where: { source: { startsWith: "crm.commission.nomatch:", endsWith: `:${r}` } } }).catch(() => undefined);
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
  const markers = await P.opsAlertState.count({ where: { OR: [{ source: { in: payIds.map((x) => `crm.commission.first:${x}`) } }, { source: { in: SYSTEMS.flatMap((s) => [`crm.commission.q1a.cursor:${s}`, `crm.commission.payroll.cursor:${s}`]) } }] } });
  console.log(`\n[clean] rows left=${left} tenants=${await P.tenant.count({ where: { id: { in: TIDS } } })} users=${await P.user.count({ where: { id: { in: USERS } } })} markers left=${markers}`);
  console.log(`SUMMARY ${res.join(" ")}`);
  await P.$disconnect();
}
