// H5.2 money hunter p2 — adjustment lifecycle: advance > net (carry) · claim over the s.76 cap (carry) · cancel bound to DRAFT · give-back ·
//   reverse a run that consumed adjustments · re-create · v1 limits
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h52m/p2-adjust.mts
import { type Any, setup, short, errText } from "./common.mjs";

const S = await setup("h52m-p2");
const { P, TT, u1, U, V, c, rows, safe, sys, book, fin, emp, runOf, itemsOf, entries, PAY } = S;
const out = (k: string, v: unknown) => console.log(`${k} ${typeof v === "string" ? v : short(v, 1400)}`);
const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
let crashed = "";
try {
  const sB = await sys("ทีมปรับ");
  const BB = await book("B");
  const own = V.owner;
  const ownA = { userId: U.owner.id, isOwner: true };
  await PAY.setPayrollBook(c(sB), own, { accountSystemId: BB });
  const finB = await fin(BB, "bankB");
  const PK2 = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payadjust.request": true, "hr.payadjust.approve": true };
  await P.membership.updateMany({ where: { userId: U.pay1.id, tenantId: TT }, data: { permissions: PK2 } });
  const VP = { ...V.pay1, permissions: PK2 };
  const e1 = await emp(sB, "P1", { salary: 3_000_000, unit: u1 });
  const e2 = await emp(sB, "P2", { salary: 2_000_000, unit: u1 });
  const nm: Record<string, string> = { [e1]: "e1", [e2]: "e2" };
  const reqA = async (s: string, e: string, per: string, kind: string, amt: number) => {
    const r = await PAY.requestAdjustment(c(s), { employeeId: e, periodKey: per, kind, amountSatang: amt, note: `qc ${kind}`, requestedById: U.pay1.id });
    const d = r?.id ? await PAY.decideAdjustment(c(s), r.id, "APPROVED", ownA) : r;
    if (!d?.ok) out("ERR.adj", { r, d });
    return r.id as string;
  };
  const adv = await reqA(sB, e1, "2031-08", "ADVANCE", 3_500_000);
  const dA = await reqA(sB, e2, "2031-08", "DEDUCTION", 300_000);
  const dB = await reqA(sB, e2, "2031-08", "DEDUCTION", 100_000);
  const label: Record<string, string> = { [adv]: "adv", [dA]: "dA", [dB]: "dB" };
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, sB);
  const NOW8 = bk("2031-09-03");
  const NOW9 = bk("2031-10-03");
  const create = (per: string, pay: Date, now: Date) => safe(() => PAY.createPayrollRunV2(c(sB), VP, { periodKey: per, payDate: pay }, { now, actor: { userId: U.pay1.id, isOwner: false } }));
  const allAdj = async () => (await rows(`SELECT id, "employeeId" AS e, kind::text AS k, "sourceType"::text AS st, status::text AS s, "amountSatang" AS a, "periodKey" AS p, "runId" AS r, "sourceRef" AS ref FROM "HrPayAdjustment" WHERE "systemId" = $1 ORDER BY "createdAt", id`, sB))
    .map((x: Any) => `${nm[x.e]}:${label[x.id] ?? x.st ?? "-"}:${x.k}:${x.s}:${x.a}:${x.p}:${x.r ? x.r.slice(-4) : "free"}`);
  const lines = async (R: string, e: string) => ((await rows(`SELECT "snapshotJson"->'lines' AS l, "snapshotJson"->'carry' AS cy, "snapshotJson"->'flags' AS f FROM "HrPayrollItem" WHERE "runId" = $1 AND "employeeId" = $2`, R, e))[0]) ?? {};
  const showItems = async (R: string) => {
    for (const e of [e1, e2]) {
      const l = await lines(R, e);
      out(`  item.${nm[e]}`, { lines: ((l.l ?? []) as Any[]).map((x) => `${x.code}:${label[x.ref] ?? (String(x.ref).startsWith("cf") ? "carry" : String(x.ref).startsWith("rf") ? "refund" : x.ref)}:${x.amountSatang}${x.requestedSatang !== undefined ? `/${x.requestedSatang}` : ""}`), carry: l.cy, flags: l.f });
    }
    const r = await runOf(R);
    out("  run", { st: r?.status, g: r?.g, n: r?.n, d: r?.d, a: r?.a, se: r?.se });
  };

  // a. Aug draft
  const c1 = await create("2031-08", bk("2031-08-31", "10:00"), NOW8);
  out("a.create", c1);
  const R1 = c1.id as string;
  await showItems(R1);
  // b. cancel dB while bound to the DRAFT
  out("b.cancelBoundDraft", await safe(() => PAY.cancelAdjustment(c(sB), dB, ownA)));
  await showItems(R1);
  out("b.adj", await allAdj());
  // c. approve + pay
  out("c.approve", await safe(() => PAY.approveRun(c(sB), R1, undefined, ownA)));
  out("c.pay", await safe(() => PAY.markPaidRun(c(sB), R1, { financeAccountId: finB, paidOn: "2031-08-31", now: NOW8 })));
  out("c.adj", await allAdj());
  // d. give-back 50,000 of dA into Sept
  out("d.giveBackPeriod", await safe(() => PAY.giveBackPeriodOf(c(sB), dA)));
  const gb = await safe(() => PAY.giveBackClaim(c(sB), { userId: U.owner.id }, { claimId: dA, amountSatang: 50_000, periodKey: "2031-09", note: "คืนบางส่วน qc" }));
  out("d.giveBack", gb);
  if (gb?.id) out("d.approveRefund", await safe(() => PAY.decideAdjustment(c(sB), gb.id, "APPROVED", ownA)));
  const gb2 = await safe(() => PAY.giveBackClaim(c(sB), { userId: U.owner.id }, { claimId: dA, amountSatang: 150_001, periodKey: "2031-09" }));
  out("d.giveBackOverCap(150,001 > 200,000-50,000)", gb2);
  // e. Sept draft binds carry + refund → reverse Aug must refuse
  const c2 = await create("2031-09", bk("2031-09-30", "10:00"), NOW9);
  out("e.createSep", c2);
  if (c2?.id) await showItems(c2.id);
  out("e.reverseAug(withSepDraft)", await safe(() => PAY.reverseRun(c(sB), R1, "qc", ownA)));
  out("e.deleteSep", await safe(() => PAY.deleteDraftRun(c(sB), c2.id, ownA)));
  // f. reverse Aug
  out("f.reverseAug", await safe(() => PAY.reverseRun(c(sB), R1, "qc", ownA)));
  out("f.run", await runOf(R1));
  out("f.adj", await allAdj());
  const en = await entries(R1);
  out("f.entries", en.map((e: Any) => [String(e.k).split("#").pop(), e.status, Number(e.dr)]));
  const revs = await rows(`SELECT count(*)::int AS n FROM "AccountJournalEntry" WHERE "reversalOfId" = ANY($1::text[])`, en.map((e: Any) => e.id));
  out("f.reversals", revs);
  // g. cancel the (now unbound) claim dA — the give-back refund of it is still APPROVED
  out("g.cancelClaim", await safe(() => PAY.cancelAdjustment(c(sB), dA, ownA)));
  out("g.adj", await allAdj());
  // h. re-create Aug (no claim now) · approve · then Sept (refund of a claim that is no longer deducted anywhere)
  const c3 = await create("2031-08", bk("2031-08-31", "10:00"), NOW8);
  out("h.recreateAug", c3);
  if (c3?.id) { await showItems(c3.id); out("h.approveAug", await safe(() => PAY.approveRun(c(sB), c3.id, undefined, ownA))); }
  out("h.adj", await allAdj());
  const c4 = await create("2031-09", bk("2031-09-30", "10:00"), NOW9);
  out("h.createSep", c4);
  if (c4?.id) {
    await showItems(c4.id);
    out("h.approveSep", await safe(() => PAY.approveRun(c(sB), c4.id, undefined, ownA)));
    const e4 = await entries(c4.id);
    for (const e of e4) out(`h.jv.${String(e.k).split("#").pop()}`, await S.linesBy(e.id));
  }
  // net effect for e2 across both months: Σ deducted for claims − Σ refunded
  const net2 = await rows(`SELECT r."periodKey" AS p, r.status::text AS s, i."netSatang" AS n, i."grossSatang" AS g FROM "HrPayrollItem" i JOIN "HrPayrollRun" r ON r.id = i."runId" WHERE i."employeeId" = $1 ORDER BY r."createdAt"`, e2);
  out("h.e2items", net2);
  out("h.liveCarryAdvance", await rows(`SELECT "amountSatang" AS a, status::text AS s, "runId" IS NOT NULL AS bound FROM "HrPayAdjustment" WHERE "employeeId" = $1 AND "sourceType"::text = 'CARRY_FORWARD'`, e1));

  // ── v1: deduction limits ──
  const sV = await sys("ทีมรุ่น1", false);
  const v1a = await emp(sV, "V1", { salary: 1_500_000, unit: u1 });
  const v1b = await emp(sV, "V2", { salary: 1_500_000, unit: u1 });
  await reqA(sV, v1a, "2031-08", "DEDUCTION", 500_000);
  await reqA(sV, v1b, "2031-08", "DEDUCTION", 2_000_000);
  const rv = await safe(() => PAY.createPayrollRun(c(sV), { periodKey: "2031-08", payDate: bk("2031-08-31", "10:00") }));
  out("v1.create", rv);
  if (rv?.id) {
    out("v1.items", (await itemsOf(rv.id)).map((i: Any) => ({ e: i.e === v1a ? "v1a" : "v1b", g: i.g, d: i.d, n: i.n, se: i.se })));
    out("v1.approve", await safe(() => PAY.approveRun(c(sV), rv.id, undefined, ownA)));
  }
} catch (e) {
  crashed = errText(e);
  console.log(`CRASH ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  await S.cleanup();
}
process.exit(crashed ? 1 : 0);
