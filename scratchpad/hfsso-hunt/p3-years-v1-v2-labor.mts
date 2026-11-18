// probe 3 — YEAR BOUNDARIES v1 vs v2 (own ACTIVE dated law rows) + probe 6 — H4.2 labour estimate per day 2025 vs 2026 dates
import { setup, short, T, B } from "./common.mjs";
const X = await setup("hunt-hfsso-p3");
const { sys, emp, c, safe, runOf, itemsOf, PAY, LAB, V, ownerA, payA, withLaw, u1 } = X;
const log = (k: string, v: unknown) => console.log(`${k}: ${short(v, 700)}`);
const SEED = (await import("../../scripts/hr-seed-law-draft.mts" as string)) as any;
const PERIODS: [string, string][] = [["2025-12", "2026-01-05"], ["2026-01", "2026-01-30"], ["2028-12", "2029-01-05"], ["2029-01", "2029-01-31"], ["2031-12", "2032-01-05"], ["2032-01", "2032-01-30"]];
const pd = (d: string) => T(`${d}T05:00:00Z`);
const nowAfter = (d: string) => new Date(Date.parse(`${d}T05:00:00Z`) + 2 * 86_400_000);
try {
  await withLaw((SEED.LAW_V1_ROWS as any[]).filter((r) => r.kind !== "OT"));
  const S1 = await sys("V1");
  const S2 = await sys("V2", true);
  const ids: Record<string, Record<string, string>> = { v1: {}, v2: {} };
  for (const [k, s] of [["v1", S1], ["v2", S2]] as const) {
    ids[k]!.X = await emp(s, "X", { salary: B(50_000) });
    ids[k]!.Y = await emp(s, "Y", { salary: B(20_000) });
  }
  const out: Record<string, unknown>[] = [];
  for (const [pk, day] of PERIODS) {
    const r1 = await safe(() => PAY.createPayrollRun(c(S1), { periodKey: pk, payDate: pd(day) }));
    const r2 = await safe(() => PAY.createPayrollRunV2(c(S2), V.pay1, { periodKey: pk, payDate: pd(day) }, { now: nowAfter(day), actor: payA }));
    const a2 = r2?.ok ? await safe(() => PAY.approveRun(c(S2), r2.id, undefined, ownerA)) : null;
    const i1 = r1?.id ? await itemsOf(r1.id) : [];
    const i2 = r2?.ok ? await itemsOf(r2.id) : [];
    const pick = (its: any[], e: string) => { const i = its.find((x) => x.e === e); return i ? `${i.se}/${i.w}` : "∅"; };
    const ytd = r2?.ok ? await X.rows(`SELECT "employeeId" AS e, "ytdJson" AS y, "lawRowIds" AS l FROM "HrPayrollItem" WHERE "runId" = $1`, r2.id) : [];
    out.push({ pk, pay: day, v1X: pick(i1, ids.v1!.X!), v2X: pick(i2, ids.v2!.X!), v1Y: pick(i1, ids.v1!.Y!), v2Y: pick(i2, ids.v2!.Y!), marker: r1?.id ? (await runOf(r1.id)).marker?.maxBaseSatang : r1, v2: r2?.ok ? "ok" : r2, a2: a2?.ok ?? a2?.code ?? null });
    log(`v2 ytd ${pk}`, ytd.find((x: any) => x.e === ids.v2!.X)?.y);
  }
  for (const o of out) log("row", o);

  // ── H4.2 labour estimate per day (no runs in S3) ──
  const S3 = await sys("LAB");
  await emp(S3, "L1", { salary: B(20_000) });
  await emp(S3, "L2", { salary: B(50_000) });
  for (const d of ["2025-12-15", "2026-01-15", "2026-02-15", "2029-01-15"]) {
    const r = await safe(() => LAB.laborDay(c(S3), V.owner, { unitId: u1, day: d }, { now: T("2032-06-01T05:00:00Z") }));
    log(`laborDay ${d}`, { ok: r?.ok, code: r?.code, basis: r?.basis, money: r?.money, flags: r?.flags });
  }
  const m = await safe(() => LAB.laborMonth(c(S3), V.owner, { unitId: u1, periodKey: "2026-02" }, { now: T("2032-06-01T05:00:00Z") }));
  log("laborMonth 2026-02 (estimate)", { ok: m?.ok, code: m?.code, basis: m?.basis, cost: m?.costSatang, flags: m?.flags });
} catch (e) {
  console.log("CRASH", (e as Error)?.stack?.slice(0, 800));
} finally {
  await X.cleanup();
  await X.P.$disconnect?.();
}
