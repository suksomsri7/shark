// scratch (hunter H5.2m) — own tenant(s) slug qc-h52m-* · own ACTIVE law rows (sourceKey qc-h52m-<tag>-*) · full cleanup + residue
// adapted from scratchpad/h34ytd-hunt/common.mts (same law-row pattern as scripts/qc-hr-h3.4.mts / qc-hr-h3.4-ytd.mts)
import { type Any, qc4Env, makeFixtures, vOf, jsonOf, tagOf, errText } from "../../scripts/qc-hr-lib.mjs";

export { vOf, errText };
export type { Any };
export const OPEN = { asOfDay: "2031-08-31", months: 8, incomeSatang: 24_000_000, whtSatang: 136_664, ssoSatang: 700_000 } as const;
export const T = (iso: string) => new Date(iso);
export const MONTHS: Record<string, [string, string]> = {
  "2031-09": ["2031-09-25T05:00:00Z", "2031-10-02T05:00:00Z"], "2031-10": ["2031-10-25T05:00:00Z", "2031-11-02T05:00:00Z"],
  "2031-11": ["2031-11-25T05:00:00Z", "2031-12-02T05:00:00Z"], "2031-12": ["2031-12-25T05:00:00Z", "2032-01-02T05:00:00Z"],
};
export const PREFIX = "qc-h52m-";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const short = (v: unknown, n = 220) => {
  const s = JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x instanceof Uint8Array ? `<${x.length} bytes>` : x));
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
};
/** "12,345.67" → 1234567 satang */
export const satOf = (s: unknown) => {
  const t = String(s ?? "").replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const neg = t.startsWith("-");
  const [a, b = ""] = t.replace("-", "").split(".");
  return (neg ? -1 : 1) * (Number(a) * 100 + Number((b + "00").slice(0, 2)));
};

export async function setup(suite: string) {
  const { P, coreHash } = await qc4Env(suite);
  const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
  const SLUG = `${PREFIX}${Date.now()}${tag}`;
  const LAW_KEY = `${PREFIX}${tag}`;
  const fx = makeFixtures(P, coreHash, SLUG);
  const LAWJ = (jsonOf("scripts/fixtures/hr-h3.4-vectors.json")?.law ?? {}) as Any;
  const actBefore = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`)) as Any[])[0]?.n ?? -1);
  for (const [k, kind, from, j] of [["sso", "SSO", "2031-01-01", "SSO"], ["sso2", "SSO", "2031-10-01", "SSO_2572"], ["tax", "TAX_BRACKET", "2031-01-01", "TAX_BRACKET"], ["ded", "DEDUCTION", "2031-01-01", "DEDUCTION"]] as const)
    await P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", $3::date, $4::jsonb, 'ACTIVE'::"HrLawStatus", $1, 'qc h5.2m hunter', 'QC', now())`, `${LAW_KEY}-${k}`, kind, from, JSON.stringify(LAWJ[j] ?? {}));
  const PAY = (await import("@/lib/modules/hr/payroll")) as Any;
  const OPM = (await import("@/lib/modules/hr/payroll-opening")) as Any;
  const FS = (await import("@/lib/modules/hr/filings/service")) as Any;
  const BK = (await import("@/lib/modules/hr/bank-files/service")) as Any;
  const REP = (await import("@/lib/modules/hr/reports")) as Any;
  const PS = (await import("@/lib/modules/hr/payslip")) as Any;
  const SYS = (await import("@/lib/modules/system/service")) as Any;
  const TT = await fx.newTenant("", "QC hunter H5.2m");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const RP = { "hr.payroll.read": true, "hr.payroll.pay": true };
  const PK = { ...RP, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.reverse": true };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `Q52 ${t} ${tag}`, r as Any, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", [], {}), pay1: await mk("pay1", "STAFF", ["*"], PK),
    payU1: await mk("payu1", "STAFF", [u1], RP), mgr: await mk("mgr", "MANAGER", [u1], {}), mgrAll: await mk("mgrall", "MANAGER", ["*"], {}),
  };
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w as Any)])) as Record<keyof typeof U, Any>;
  const ownerA = { userId: U.owner.id, isOwner: true };
  const payA = { userId: U.pay1.id, isOwner: false };
  const sys = async (n: string, v2 = true, tid = TT) => {
    const id = (await SYS.createSystem(tid, "HR", `${n} ${tag}`)).id as string;
    if (v2) await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, id);
    return id;
  };
  const book = async (n: string) => (await SYS.createSystem(TT, "ACCOUNT", `บัญชี ${n} ${tag}`)).id as string;
  const fin = async (b: string, n: string) => ((await P.accountFinance.create({ data: { tenantId: TT, systemId: b, type: "BANK", name: `Q52 ${n} ${tag}`, ledgerAccountId: (await P.accountLedger.findFirst({ where: { systemId: b, code: "1010" } }))?.id ?? null } })) as Any).id as string;
  const ADDR = { subdistrict: "ทุ่งพญาไท", district: "ราชเทวี", province: "กรุงเทพมหานคร", postcode: "10400" };
  const emp = async (s: string, n: string, o: { start?: string; end?: string; unit?: string; salary?: number; nid?: string; payType?: string } = {}) => {
    const id = await fx.mkEmp(TT, s, `${n} ${tag}`, { startDate: o.start ?? "2030-01-01", unitId: o.unit ?? u1, code: n, ...(o.end ? { endDate: o.end } : {}) });
    await P.hrEmployee.update({ where: { id }, data: { nationalId: o.nid ?? null, ...ADDR, bankName: "KBank", bankAccountNo: "0123456789", bankAccountName: `Q52 ${n}` } });
    await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: id, baseSalarySatang: o.salary ?? 3_000_000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 }, ...(o.payType ? { payType: o.payType, dailyRateSatang: 50_000 } : {}) } });
    return id;
  };
  const rows = async (sql: string, ...p: unknown[]) => ((await P.$queryRawUnsafe(sql, ...p)) as Any[]) ?? [];
  const safe = <R,>(f: () => Promise<R>) => f().catch((e: unknown) => ({ ok: false, code: "THROW", reason: errText(e) }) as Any);
  const c = (s: string) => ({ tenantId: TT, systemId: s });
  const create = (s: string, pk: string) => safe(() => PAY.createPayrollRunV2(c(s), V.pay1, { periodKey: pk, payDate: T(MONTHS[pk]![0]) }, { now: T(MONTHS[pk]![1]), actor: payA }));
  const approve = (s: string, id: string) => safe(() => PAY.approveRun(c(s), id, undefined, ownerA));
  const pay = (s: string, id: string, pk: string, financeAccountId?: string) => safe(() => PAY.markPaidRun(c(s), id, { ...(financeAccountId ? { financeAccountId } : {}), paidOn: MONTHS[pk]![0].slice(0, 10), now: T(MONTHS[pk]![1]) }));
  const reverse = (s: string, id: string) => safe(() => PAY.reverseRun(c(s), id, "qc h5.2m hunter", ownerA));
  const runOf = async (id: string) => (await rows(`SELECT id, status::text AS status, "accountSystemId" AS book, "journalEntryId" AS j, "totalGrossSatang" AS g, "totalNetSatang" AS n, "totalWhtSatang" AS w, "totalSsoEmployeeSatang" AS se, "totalSsoEmployerSatang" AS sr, "totalAddSatang" AS a, "totalDeductSatang" AS d, "stepsJson"->>'finalized' AS fin FROM "HrPayrollRun" WHERE id = $1`, id))[0];
  const itemsOf = (id: string) => rows(`SELECT "employeeId" AS e, "grossSatang" AS g, "netSatang" AS n, "whtSatang" AS w, "ssoBaseSatang" AS sb, "ssoEmployeeSatang" AS se, "ssoEmployerSatang" AS sr, "addSatang" AS a, "deductSatang" AS d, ("snapshotJson"->>'whtIncomeSatang')::bigint AS inc, ("snapshotJson"->>'ssoWageSatang')::bigint AS sw FROM "HrPayrollItem" WHERE "runId" = $1 ORDER BY "employeeId"`, id);
  const entries = (runId: string) => rows(`SELECT e.id, e."systemId" AS book, e.journal::text AS journal, e.status::text AS status, e."idempotencyKey" AS k, e."reversalOfId" AS rof, (SELECT coalesce(sum(l.debit),0)::bigint FROM "AccountJournalLine" l WHERE l."entryId" = e.id) AS dr, (SELECT coalesce(sum(l.credit),0)::bigint FROM "AccountJournalLine" l WHERE l."entryId" = e.id) AS cr FROM "AccountJournalEntry" e WHERE e."refId" = $1 ORDER BY e."createdAt", e.id`, runId);
  const linesBy = (entryId: string) => rows(`SELECT a.code, l.debit::bigint AS dr, l.credit::bigint AS cr FROM "AccountJournalLine" l JOIN "AccountLedger" a ON a.id = l."accountId" WHERE l."entryId" = $1 ORDER BY a.code`, entryId);
  async function cleanup(): Promise<string[]> {
    const left: string[] = [];
    const inList = fx.tenants.filter((x: string) => /^[A-Za-z0-9_-]+$/.test(x)).map((x: string) => `'${x}'`).join(",");
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
    const extra = ((await P.user.findMany({ where: { email: { startsWith: `${SLUG}-` } }, select: { id: true } }).catch(() => [])) as Any[]).map((u) => u.id as string);
    for (const uid of [...new Set([...fx.users, ...extra])]) {
      await P.session.deleteMany({ where: { userId: uid } }).catch(() => null);
      await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => null);
      await P.membership.deleteMany({ where: { userId: uid } }).catch(() => null);
      await P.user.deleteMany({ where: { id: uid } }).catch(() => null);
    }
    await P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LAW_KEY}-%`).catch(() => null);
    const lawLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${PREFIX}%`)) as Any[])[0]?.n ?? -1);
    const actAfter = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`)) as Any[])[0]?.n ?? -1);
    const tLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, `${PREFIX}%`)) as Any[])[0]?.n ?? -1);
    const uLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `${PREFIX}%`)) as Any[])[0]?.n ?? -1);
    if (lawLeft !== 0) left.push(`law=${lawLeft}`);
    if (actAfter !== actBefore) left.push(`ACTIVE ${actBefore}->${actAfter}`);
    if (tLeft !== 0) left.push(`tenant=${tLeft}`);
    if (uLeft !== 0) left.push(`user=${uLeft}`);
    console.log(`RESIDUE ${left.length ? left.join(",") : "none"} (tenants=${fx.tenants.length} users=${fx.users.length} activeLaw=${actBefore}->${actAfter})`);
    return left;
  }
  return { P, fx, tag, TT, u1, u2, U, V, ownerA, payA, sys, book, fin, emp, rows, safe, c, create, approve, pay, reverse, runOf, itemsOf, entries, linesBy, cleanup, PAY, OPM, FS, BK, REP, PS, SYS, LAWJ };
}

/**
 * Hold a lock in its own tx (advisory key/seed, or a row lock via `rowSql`), start `calls` one at a time — each next call starts only after
 * the previous one is observed blocked by the holder (pg_blocking_pids) or finished — then release. Returns results + how many were blocked.
 */
export async function underLock<R>(P: Any, lock: { key: string; seed: number } | { rowSql: string; args: unknown[] }, calls: (() => Promise<R>)[], expectBlocked: boolean[] = calls.map(() => true)): Promise<{ res: R[]; blocked: boolean[]; holderErr: string }> {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held: (pid: number) => void = () => {};
  const heldP = new Promise<number>((r) => (held = r));
  let holderErr = "";
  const holder = P.$transaction(async (tx: Any) => {
    const pid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid() AS p`)) as Any[])[0]?.p ?? -1);
    if ("key" in lock) await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, $2::int))::text AS x`, lock.key, lock.seed);
    else await tx.$queryRawUnsafe(lock.rowSql, ...lock.args);
    held(pid);
    await gate;
  }, { maxWait: 20_000, timeout: 180_000 }).catch((e: unknown) => ((holderErr = errText(e)), held(-1)));
  const pid = await heldP;
  const running: Promise<R>[] = [];
  const blocked: boolean[] = [];
  const nBlocked = async () => Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))`, pid).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
  for (let k = 0; k < calls.length; k++) {
    const before = await nBlocked();
    let done = false;
    const p = calls[k]!().finally(() => (done = true));
    running.push(p);
    let b = false;
    for (let i = 0; i < (expectBlocked[k] ? 100 : 40) && !done; i++) {
      await sleep(150);
      // any chain counts: blocked directly by the holder OR transitively behind an earlier blocked call
      if ((await nBlocked()) > before) { b = true; break; }
      const chain = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0 AND NOT ($1::int = ANY(pg_blocking_pids(pid)))`, pid).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
      if (k > 0 && chain > 0) { b = true; break; }
    }
    blocked.push(b);
  }
  release();
  await holder;
  const res = await Promise.all(running);
  return { res, blocked, holderErr };
}
