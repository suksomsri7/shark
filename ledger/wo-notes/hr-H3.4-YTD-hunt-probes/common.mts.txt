// scratch (hunter H3.4-YTD) — shared fixture: own tenant(s) · own ACTIVE law rows (source key qc-ytdh-<tag>-*) · full cleanup + residue
import { type Any, qc4Env, makeFixtures, vOf, jsonOf, tagOf, errText } from "../../scripts/qc-hr-lib.mjs";

export { vOf, errText };
export type { Any };
export const M = 3_000_000;
export const OPEN = { asOfDay: "2031-08-31", months: 8, incomeSatang: 24_000_000, whtSatang: 136_664, ssoSatang: 700_000 } as const;
export const T = (iso: string) => new Date(iso);
export const MONTHS: Record<string, [string, string]> = {
  "2031-01": ["2031-01-25T05:00:00Z", "2031-02-02T05:00:00Z"], "2031-02": ["2031-02-25T05:00:00Z", "2031-03-02T05:00:00Z"], "2031-03": ["2031-03-25T05:00:00Z", "2031-04-02T05:00:00Z"],
  "2031-08": ["2031-08-25T05:00:00Z", "2031-09-02T05:00:00Z"],
  "2031-09": ["2031-09-25T05:00:00Z", "2031-10-02T05:00:00Z"], "2031-10": ["2031-10-25T05:00:00Z", "2031-11-02T05:00:00Z"],
  "2031-11": ["2031-11-25T05:00:00Z", "2031-12-02T05:00:00Z"], "2031-12": ["2031-12-25T05:00:00Z", "2032-01-02T05:00:00Z"],
};

export async function setup(suite: string) {
  const { P, coreHash } = await qc4Env(suite);
  const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
  const SLUG = `qc-hr-h34yh-${Date.now()}${tag}`;
  const LAW_KEY = `qc-ytdh-${tag}`;
  const fx = makeFixtures(P, coreHash, SLUG);
  const LAWJ = (jsonOf("scripts/fixtures/hr-h3.4-vectors.json")?.law ?? {}) as Any;
  const actBefore = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`)) as Any[])[0]?.n ?? -1);
  for (const [k, kind, from, j] of [["sso", "SSO", "2031-01-01", "SSO"], ["sso2", "SSO", "2031-10-01", "SSO_2572"], ["tax", "TAX_BRACKET", "2031-01-01", "TAX_BRACKET"], ["ded", "DEDUCTION", "2031-01-01", "DEDUCTION"]] as const)
    await P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", $3::date, $4::jsonb, 'ACTIVE'::"HrLawStatus", $1, 'qc h3.4-ytd hunter', 'QC', now())`, `${LAW_KEY}-${k}`, kind, from, JSON.stringify(LAWJ[j] ?? {}));
  const PAY = (await import("@/lib/modules/hr/payroll")) as Any;
  const OPM = (await import("@/lib/modules/hr/payroll-opening")) as Any;
  const FS = (await import("@/lib/modules/hr/filings/service")) as Any;
  const REP = (await import("@/lib/modules/hr/reports")) as Any;
  const PS = (await import("@/lib/modules/hr/payslip")) as Any;
  const SYS = (await import("@/lib/modules/system/service")) as Any;
  const TT = await fx.newTenant("", "QC hunter ยอดยกมา");
  const T2 = await fx.newTenant("-other", "QC hunter ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const RP = { "hr.payroll.read": true, "hr.payroll.pay": true };
  const PK = { ...RP, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.reverse": true };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QCH ${t} ${tag}`, r as Any, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", [], {}), pay1: await mk("pay1", "STAFF", ["*"], PK), gate: await mk("gate", "STAFF", [], RP), gateU: await mk("gateu", "STAFF", [u1], RP),
    readU: await mk("readu", "STAFF", [u1], { "hr.payroll.read": true }), mgr: await mk("mgr", "MANAGER", [u1], {}), self: await mk("self", "STAFF", [], {}),
    gateOwn: await mk("gateown", "STAFF", [], RP), other: await mk("other", "OWNER", [], {}, T2),
  };
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w as Any)])) as Record<keyof typeof U, Any>;
  const ownerA = { userId: U.owner.id, isOwner: true };
  const payA = { userId: U.pay1.id, isOwner: false };
  const sys = async (n: string, v2 = true, tid = TT) => {
    const id = (await SYS.createSystem(tid, "HR", `${n} ${tag}`)).id as string;
    if (v2) await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, id);
    return id;
  };
  const emp = async (s: string, n: string, o: { pay?: boolean; start?: string; end?: string; link?: string; unit?: string; salary?: number; tid?: string } = {}) => {
    const tid = o.tid ?? TT;
    const id = await fx.mkEmp(tid, s, `${n} ${tag}`, { startDate: o.start ?? "2030-01-01", unitId: o.unit ?? u1, code: n, ...(o.end ? { endDate: o.end } : {}), ...(o.link ? { linkedUserId: o.link } : {}) });
    if (o.pay !== false) await P.hrSalaryProfile.create({ data: { tenantId: tid, systemId: s, employeeId: id, baseSalarySatang: o.salary ?? M, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
    return id;
  };
  const rows = async (sql: string, ...p: unknown[]) => ((await P.$queryRawUnsafe(sql, ...p)) as Any[]) ?? [];
  const safe = <R,>(f: () => Promise<R>) => f().catch((e: unknown) => ({ ok: false, code: "THROW", reason: errText(e) }) as Any);
  const c = (s: string, tid = TT) => ({ tenantId: tid, systemId: s });
  const save = (s: string, who: Any, e: string, o: Record<string, unknown> = {}, now = T("2031-09-10T05:00:00Z"), expectRev: number | null = null) =>
    safe(() => OPM.saveOpeningYtd(c(s), who, { employeeId: e, taxYear: 2031, ...OPEN, expectRev, ...o }, { now }));
  const create = (s: string, pk: string, payIso = MONTHS[pk]![0], nowIso = MONTHS[pk]![1]) => safe(() => PAY.createPayrollRunV2(c(s), V.pay1, { periodKey: pk, payDate: T(payIso) }, { now: T(nowIso), actor: payA }));
  const createV1 = (s: string, pk: string, payIso = MONTHS[pk]![0]) => safe(() => PAY.createPayrollRun(c(s), { periodKey: pk, payDate: T(payIso) }));
  const approve = (s: string, id: string) => safe(() => PAY.approveRun(c(s), id, undefined, ownerA));
  const item = async (runId: string | undefined, e: string) => (runId ? (await rows(`SELECT * FROM "HrPayrollItem" WHERE "runId" = $1 AND "employeeId" = $2`, runId, e))[0] : undefined);
  const openRows = (e: string) => rows(`SELECT id, rev, "asOfDay"::text AS a, "incomeSatang" AS i, "whtSatang" AS w, "supersededAt" AS s, "createdAt" AS c FROM "HrPayrollOpeningYtd" WHERE "employeeId" = $1 ORDER BY rev`, e);
  const liveOf = async (e: string) => (await openRows(e)).filter((r: Any) => !r.s);
  async function cleanup(): Promise<string[]> {
    const left: string[] = [];
    const inList = fx.tenants.map((x: string) => `'${x}'`).join(",");
    if (inList) {
      const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema = current_schema() and column_name='tenantId'`).catch(() => [])) as Any[])
        .map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
      for (let pass = 0; pass < 4; pass += 1) {
        await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" IN (${inList})`).catch(() => null);
        for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => null);
      }
      for (const t of tables) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: -1 }])) as Any[];
        if (Number(r?.[0]?.n ?? 0) !== 0) left.push(`${t}=${r?.[0]?.n}`);
      }
      await P.tenant.deleteMany({ where: { id: { in: fx.tenants } } }).catch(() => null);
    }
    for (const uid of fx.users) {
      await P.session.deleteMany({ where: { userId: uid } }).catch(() => null);
      await P.membership.deleteMany({ where: { userId: uid } }).catch(() => null);
      await P.user.deleteMany({ where: { id: uid } }).catch(() => null);
    }
    await P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LAW_KEY}-%`).catch(() => null);
    const lawLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE "sourceKey" LIKE 'qc-ytdh-%'`)) as Any[])[0]?.n ?? -1);
    const actAfter = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`)) as Any[])[0]?.n ?? -1);
    const tLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE 'qc-hr-h34yh-%'`)) as Any[])[0]?.n ?? -1);
    const uLeft = fx.users.length ? await P.user.count({ where: { id: { in: fx.users } } }) : 0;
    if (lawLeft !== 0) left.push(`law=${lawLeft}`);
    if (actAfter !== actBefore) left.push(`ACTIVE ${actBefore}->${actAfter}`);
    if (tLeft !== 0) left.push(`tenant=${tLeft}`);
    if (uLeft !== 0) left.push(`user=${uLeft}`);
    console.log(`RESIDUE ${left.length ? left.join(",") : "none"} (tenants=${fx.tenants.length} users=${fx.users.length} activeLaw=${actBefore}->${actAfter})`);
    await P.$disconnect?.().catch?.(() => {});
    return left;
  }
  return { P, fx, tag, TT, T2, u1, u2, U, V, ownerA, payA, sys, emp, rows, safe, c, save, create, createV1, approve, item, openRows, liveOf, cleanup, PAY, OPM, FS, REP, PS, LAWJ };
}

/** hold an advisory xact lock in its own tx; run calls; wait until ≥ want backends are blocked by the holder (pg_blocking_pids); release */
export async function underLock<R>(P: Any, key: string, seed: number, want: number, calls: (() => Promise<R>)[]): Promise<{ res: R[]; blocked: number }> {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held: (pid: number) => void = () => {};
  const heldP = new Promise<number>((r) => (held = r));
  const holder = P.$transaction(async (tx: Any) => {
    const pid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid() AS p`)) as Any[])[0]?.p ?? -1);
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, $2::int))::text AS x`, key, seed);
    held(pid);
    await gate;
  }, { maxWait: 20_000, timeout: 120_000 }).catch(() => held(-1));
  const pid = await heldP;
  const running = calls.map((c) => c());
  let blocked = 0;
  for (let i = 0; i < 130 && blocked < want && pid > 0; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))`, pid).catch(() => null)) as Any[] | null;
    blocked = Math.max(blocked, Number(r?.[0]?.n ?? 0));
  }
  release();
  await holder;
  const res = await Promise.all(running);
  return { res, blocked };
}
export const short = (v: unknown, n = 200) => {
  const s = JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x));
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
};
