// probe-c33fix-race.mts — C3.3-fix follow-up (27 ก.ย.): withdraw of an HR-APPROVED commission adjustment (runId null) racing createPayrollRun
//   Per round: rep with employee + salary profile · commission 100,000 APPROVED · its HR adjustment APPROVED in period P (no run yet) ·
//   the payment is voided, then 12 callers fire at once on separate pool connections: 6 × HR createPayrollRun(P) + 6 × CRM afterPaymentsReversed
//   (reverse → handoffReversal: withdraw-or-DEDUCTION). Invariant (no over-pay, no under-pay):
//     exactly ONE run of P · exactly ONE reversal row (−100,000) ·
//     EITHER the adjustment was bound to the run (runId = run · item addSatang includes 100,000) AND exactly ONE DEDUCTION of 100,000
//     OR the adjustment was withdrawn (row gone · item addSatang 0) AND ZERO DEDUCTION  ⇒  paid-in-run − deducted = 0 for every round
// RACE_SLOW_MS (default 2500): a tenant-scoped BEFORE INSERT trigger on "HrPayrollRun" sleeps that long — it widens the gap between
//   createPayrollRun's read of the APPROVED adjustments and its runId bind so the reversal lands INSIDE it (even rounds: reversal +300 ms ·
//   odd rounds: reversal first, run +1500 ms ⇒ the "withdrawn" outcome). Trigger + function are DROPPED in finally.
// Run: scripts/pending/run-c33fix.sh scripts/pending/probe-c33fix-race.mts probe-race (QC1 only · throwaway tenant `qc-c33race-*` swept in finally)
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
const TAG = `qc-c33race-${RAND}`;
const ROUNDS = Number(process.env.RACE_ROUNDS ?? 8);
const SLOW_MS = Number(process.env.RACE_SLOW_MS ?? 2500);
const TRG = `qc_c33race_${RAND}_slow`;
const TIDS: string[] = [];
const USERS: string[] = [];
const SYSTEMS: string[] = [];
let n = 0;
const nx = () => `${++n}`;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let allOk = true;
const outcomes: string[] = [];
try {
  const mkUser = async (s: string) => { const u = await P.user.create({ data: { email: `${TAG}${s}@qc.invalid`, name: `QC ${s} ${TAG}` } }); USERS.push(u.id); return u.id as string; };
  const tid = (await P.tenant.create({ data: { name: `${TAG}-t`, slug: `${TAG}-t` } })).id as string;
  TIDS.push(tid);
  if (SLOW_MS > 0) {
    await P.$executeRawUnsafe(`CREATE FUNCTION "${TRG}"() RETURNS trigger AS $f$ BEGIN IF NEW."tenantId" = '${tid}' THEN PERFORM pg_sleep(${SLOW_MS / 1000}); END IF; RETURN NEW; END $f$ LANGUAGE plpgsql`);
    await P.$executeRawUnsafe(`CREATE TRIGGER "${TRG}" BEFORE INSERT ON "HrPayrollRun" FOR EACH ROW EXECUTE FUNCTION "${TRG}"()`);
    console.log(`[trigger] ${TRG} sleeps ${SLOW_MS} ms on HrPayrollRun INSERT of this tenant only`);
  }
  const uO = await mkUser("owner");
  await P.membership.create({ data: { userId: uO, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const COMM = { approvalRequired: false, payrollLink: true };
  for (let r = 0; r < ROUNDS; r += 1) {
    const uR = await mkUser(`rep${r}`);
    await P.membership.create({ data: { userId: uR, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    // one HR system + one CRM system per round (a payroll run is per (HR system, period))
    const hr = (await sysSvc.createSystem(tid, "HR", `HR ${TAG}-${r}`)).id as string;
    SYSTEMS.push(hr);
    const cHR = { tenantId: tid, systemId: hr };
    const emp = await P.hrEmployee.create({ data: { tenantId: tid, systemId: hr, name: `พนักงาน ${TAG}-${nx()}`, linkedUserId: uR, active: true } });
    await PAY.setSalaryProfile(cHR, { employeeId: emp.id, baseSalarySatang: 3_000_000 });
    const crm = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}-${r}`)).id as string;
    SYSTEMS.push(crm);
    await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_build_object('crm', $1::jsonb) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, commission: COMM }), crm);
    const ctx = { tenantId: tid, systemId: crm };
    const pipe = await P.crmPipeline.create({ data: { tenantId: tid, systemId: crm, name: `ขาย ${TAG}`, stages: { create: [["ใหม่", "OPEN"], ["ชนะ", "WON"]].map(([name, kind], i) => ({ tenantId: tid, systemId: crm, sortOrder: i, name, kind, probability: kind === "WON" ? 100 : 20 })) } }, include: { stages: true } });
    await P.crmCommissionRule.create({ data: { tenantId: tid, systemId: crm, name: `กฎ ${TAG}-${nx()}`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [], createdAt: new Date(Date.now() - 600_000) } });
    const party = await P.party.create({ data: { tenantId: tid, name: `ลูกค้า ${TAG}-${nx()}`, kind: "PERSON" } });
    const ct = await P.crmContact.create({ data: { tenantId: tid, systemId: crm, name: party.name, firstName: party.name, partyId: party.id, ownerUserId: uR } });
    const deal = await P.crmDeal.create({ data: { tenantId: tid, systemId: crm, contactId: ct.id, pipelineId: pipe.id, stageId: (pipe.stages as Any[]).find((x) => x.kind === "OPEN").id, title: `ดีล ${TAG}`, valueSatang: 1_000_000, kind: "OPEN", ownerUserId: uR, stageEnteredAt: new Date() } });
    const refId = `${TAG}-${nx()}`;
    const pay = await P.crmDealPayment.create({ data: { tenantId: tid, systemId: crm, dealId: deal.id, refType: "PAYMENT", refId, satang: BigInt(1_000_000), status: "COUNTED", countedAt: new Date() } });
    await CM.afterPaymentCounted(ctx, { dealId: deal.id, refType: "PAYMENT", refId });
    const orig = (await P.crmCommission.findMany({ where: { dealId: deal.id, reversedOfId: null } }))[0] as Any;
    const adj0 = orig ? ((await P.hrPayAdjustment.findFirst({ where: { crmCommissionId: orig.id } })) as Any) : null;
    if (!orig || orig.status !== "APPROVED" || !adj0) {
      allOk = false;
      console.log(`ROUND ${r} SETUP-FAIL orig=${orig?.status ?? "-"} adj=${adj0 ? adj0.status : "-"}`);
      continue;
    }
    const dec = await PAY.decideAdjustment(cHR, adj0.id, "APPROVED", { userId: uO, isOwner: true });
    const pk = String(((await P.hrPayAdjustment.findUnique({ where: { id: adj0.id } })) as Any).periodKey);
    await P.crmDealPayment.update({ where: { id: pay.id }, data: { status: "REVERSED", reversedAt: new Date() } });
    // 12-way race · alternate who gets a head start (0/10 ms) so both orders happen
    const runFirst = r % 2 === 0;
    const hrCall = async (k: number) => {
      if (!runFirst) await sleep(1_500 + k);
      try { await PAY.createPayrollRun(cHR, { periodKey: pk, payDate: new Date("2026-09-30T03:00:00Z") }); return "RUN"; } catch (e) { return `RUN-ERR:${(e as Error).message.slice(0, 40)}`; }
    };
    const crmCall = async (k: number) => {
      if (runFirst) await sleep(300 + k);
      try { await CM.afterPaymentsReversed(ctx, { dealId: deal.id }); return "REV"; } catch (e) { return `REV-ERR:${(e as Error).message.slice(0, 40)}`; }
    };
    const calls = await Promise.all([...Array.from({ length: 6 }, (_, k) => hrCall(k)), ...Array.from({ length: 6 }, (_, k) => crmCall(k))]);
    // settle: a late handoff of the reversal row (as the minute job would)
    await CM.runPayrollSync(new Date(), { tenantIds: [tid] });
    const runs = (await P.hrPayrollRun.findMany({ where: { tenantId: tid, systemId: hr, periodKey: pk } })) as Any[];
    const item = runs.length === 1 ? ((await P.hrPayrollItem.findFirst({ where: { runId: runs[0].id, employeeId: emp.id } })) as Any) : null;
    const adj1 = (await P.hrPayAdjustment.findUnique({ where: { id: adj0.id } })) as Any;
    const revs = (await P.crmCommission.findMany({ where: { reversedOfId: orig.id } })) as Any[];
    const deds = revs.length ? ((await P.hrPayAdjustment.findMany({ where: { crmCommissionId: { in: revs.map((x) => x.id) }, kind: "DEDUCTION" } })) as Any[]) : [];
    const paidInRun = Number(item?.addSatang ?? 0);
    const deducted = deds.reduce((s, d) => s + Number(d.amountSatang), 0);
    const bound = !!adj1 && runs.length === 1 && adj1.runId === runs[0].id;
    const withdrawn = !adj1;
    const ok = runs.length === 1 && revs.length === 1 && Number(revs[0].amountSatang) === -100_000
      && ((bound && paidInRun === 100_000 && deds.length === 1 && deducted === 100_000) || (withdrawn && paidInRun === 0 && deds.length === 0))
      && paidInRun - deducted === 0;
    allOk = allOk && ok;
    const outcome = bound ? "BOUND→DEDUCTION" : withdrawn ? "WITHDRAWN" : "INCONSISTENT";
    outcomes.push(outcome);
    console.log(`ROUND ${r} ${ok ? "OK" : "OVERPAY/INCONSISTENT"} · head start ${runFirst ? "createPayrollRun" : "reversal"} · decide=${dec?.ok} · period ${pk} · runs=${runs.length} · item.add=${paidInRun} · adj=${adj1 ? `${adj1.status}/run=${adj1.runId ? "bound" : "null"}` : "withdrawn"} · reversal rows=${revs.length} · DEDUCTION=${deds.length}/${deducted} · net to rep=${paidInRun - deducted} · ${outcome} · calls=${j(calls.reduce((m: Any, c) => ((m[c] = (m[c] ?? 0) + 1), m), {}))}`);
  }
} catch (e) {
  allOk = false;
  console.log(`PROBE-FATAL ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${TRG}" ON "HrPayrollRun"`).catch((e: Error) => console.log(`[trigger] drop failed ${e.message}`));
  await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${TRG}"()`).catch((e: Error) => console.log(`[trigger] drop fn failed ${e.message}`));
  const trgLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = $1`, TRG)) as Any[])[0].n);
  console.log(`[trigger] left=${trgLeft}`);
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
  const dist = outcomes.reduce((m: Record<string, number>, o) => ((m[o] = (m[o] ?? 0) + 1), m), {});
  console.log(`SUMMARY race ${allOk ? "PASS" : "FAIL"} rounds=${ROUNDS} outcomes=${j(dist)}`);
  console.log(`🔎 JSON_SUMMARY ${j({ pass: allOk, rounds: ROUNDS, outcomes: dist })}`);
  await P.$disconnect();
  process.exit(allOk ? 0 : 1);
}
