// probe 6 — bulk form: 300 valid (time vs tx timeout) · 300 with row 299 invalid (pre-tx) · 300 with row 299 failing inside the tx · 301 · duplicate · two concurrent overlapping bulks
import { setup, short, T, OPEN, underLock } from "./common.mjs";
const X = await setup("hunt-h34y-p6");
const { sys, V, OPM, c, safe, P, TT, rows } = X;
const log = (k: string, v: unknown) => console.log(`${k}: ${short(v, 300)}`);
const now = { now: T("2031-09-10T05:00:00Z") };
try {
  const A = await sys("A");
  const mkMany = async (s: string, n: number, pre: string) => {
    await P.hrEmployee.createMany({ data: Array.from({ length: n }, (_, i) => ({ tenantId: TT, systemId: s, name: `${pre}${String(i).padStart(3, "0")} ${X.tag}`, code: `${pre}${String(i).padStart(3, "0")}`, startDate: new Date("2030-01-01T00:00:00Z") })) });
    return ((await P.hrEmployee.findMany({ where: { tenantId: TT, systemId: s }, select: { id: true }, orderBy: { code: "asc" } })) as any[]).map((e) => e.id as string);
  };
  const ids = await mkMany(A, 301, "E");
  const row = (e: string, o: Record<string, unknown> = {}) => ({ employeeId: e, ...OPEN, expectRev: null, ...o });
  const count = async () => Number((await rows(`SELECT count(*)::int AS n FROM "HrPayrollOpeningYtd" WHERE "systemId" = $1`, A))[0]?.n);
  const auds = async () => Number(await P.auditLog.count({ where: { tenantId: TT, action: "hr.payroll.opening.save" } }));
  const bulk = (rs: unknown[], s = A) => safe(() => OPM.saveOpeningYtdBulk(c(s), V.owner, { taxYear: 2031, rows: rs }, now));
  // a) 301 rows / duplicate
  log("a.301", await bulk(ids.map((e) => row(e))));
  log("a.dup", await bulk([row(ids[0]!), row(ids[0]!)]));
  // b) row 299 invalid (pre-tx) — WHT > income
  log("b.299 invalid", await bulk(ids.slice(0, 300).map((e, i) => row(e, i === 298 ? { whtSatang: OPEN.incomeSatang + 1 } : {}))));
  log("b.rows/audits", [await count(), await auds()]);
  // c) row 299 fails inside the tx (live rev exists, expectRev null ⇒ REV_CHANGED) — sorted by id, so pick the 299th id in sort order
  const sorted = [...ids.slice(0, 300)].sort();
  const victim = sorted[298]!;
  log("c.seed victim", (await X.save(A, V.owner, victim))?.ok);
  const t0 = Date.now();
  const rc = await bulk(ids.slice(0, 300).map((e) => row(e)));
  log("c.299 in-tx fail", { res: rc, ms: Date.now() - t0, rows: await count(), audits: await auds() });
  // d) 300 valid rows (victim with expectRev 1) — duration vs TX timeout 30 s
  const t1 = Date.now();
  const rd = await bulk(ids.slice(0, 300).map((e) => row(e, e === victim ? { expectRev: 1 } : {})));
  log("d.300 valid", { ok: rd?.ok, code: rd?.code, saved: rd?.saved?.length, reason: String(rd?.reason ?? "").slice(0, 160), ms: Date.now() - t1, rows: await count() });
  // e) two concurrent overlapping bulks on a fresh system, both blocked on hr:ytd
  const B = await sys("B");
  const bIds = await mkMany(B, 60, "F");
  const b1 = bIds.slice(0, 40).map((e) => row(e));
  const b2 = bIds.slice(20, 60).map((e) => row(e));
  const o = await underLock<any>(P, `hr:ytd:${B}:2031`, 0, 1, [() => bulk(b1, B), () => bulk(b2, B)]);
  const live = (await rows(`SELECT "employeeId", count(*)::int AS n FROM "HrPayrollOpeningYtd" WHERE "systemId" = $1 AND "supersededAt" IS NULL GROUP BY 1`, B)) as any[];
  log("e.concurrent", { blocked: o.blocked, r1: o.res[0]?.ok ?? o.res[0]?.code, n1: o.res[0]?.saved?.length, r2: o.res[1]?.ok ?? o.res[1]?.code, n2: o.res[1]?.saved?.length, liveEmps: live.length, maxPerEmp: Math.max(...live.map((x) => x.n)), allRows: (await rows(`SELECT count(*)::int AS n FROM "HrPayrollOpeningYtd" WHERE "systemId" = $1`, B))[0]?.n });
} catch (err) {
  console.log("ERR", err);
} finally {
  await X.cleanup();
}
