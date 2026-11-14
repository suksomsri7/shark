// QC — HR V2 · fix ticket HR-MONEY-2 — fixture + race helpers for scripts/qc-hr-money-2.mts (brief ledger/hr-briefs/hr-brief-MONEY-2.md)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Adapted from the H5.2 money hunter's scratch fixture (ledger/wo-notes/hr-H5.2-money-probes/common.mts.txt): own tenant (slug qc-hr-money2-*) ·
//   own ACTIVE law rows (sourceKey qc-hr-money2-<tag>-*, json = scripts/fixtures/hr-h3.4-vectors.json: SSO 5 % max base 17,500 ฿ from 2031-01-01) —
//   the suite refuses to start when any qc-hr-money2-* law row is already present, and removes its own rows in `finally` · full residue check.
import { type Any, qc4Env, makeFixtures, vOf, jsonOf, tagOf, errText, sleep } from "./qc-hr-lib.mjs";

export const PREFIX = "qc-hr-money2-";
export const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
export const dd = (day: string) => new Date(`${day}T00:00:00Z`);
export const PAYDAY: Record<string, Date> = { "2031-07": bk("2031-07-31", "10:00"), "2031-08": bk("2031-08-29", "10:00"), "2031-09": bk("2031-09-30", "10:00") };
export const NOW: Record<string, Date> = { "2031-07": bk("2031-08-03"), "2031-08": bk("2031-09-03"), "2031-09": bk("2031-10-03") };

export async function setupMoney2(suite: string) {
  const { P, coreHash } = await qc4Env(suite);
  const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
  const SLUG = `${PREFIX}${Date.now()}${tag}`;
  const LAW_KEY = `${PREFIX}${tag}`;
  const fx = makeFixtures(P, coreHash, SLUG);
  const LAWJ = (jsonOf("scripts/fixtures/hr-h3.4-vectors.json")?.law ?? {}) as Any;
  const n = async (sql: string, ...a: unknown[]) => Number((((await P.$queryRawUnsafe(sql, ...a)) as Any[])[0]?.n) ?? -1);
  const lawPresent = await n(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${PREFIX}%`);
  const actBefore = await n(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`);
  let lawInserted = 0;
  if (lawPresent === 0) {
    for (const [k, kind, from, j] of [["sso", "SSO", "2031-01-01", "SSO"], ["tax", "TAX_BRACKET", "2031-01-01", "TAX_BRACKET"], ["ded", "DEDUCTION", "2031-01-01", "DEDUCTION"]] as const) {
      await P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", $3::date, $4::jsonb, 'ACTIVE'::"HrLawStatus", $1, 'qc hr money-2', 'QC', now())`, `${LAW_KEY}-${k}`, kind, from, JSON.stringify(LAWJ[j] ?? {}));
      lawInserted += 1;
    }
  }
  const PAY = (await import("@/lib/modules/hr/payroll")) as Any;
  const SYS = (await import("@/lib/modules/system/service")) as Any;
  const TT = await fx.newTenant("", "QC HR MONEY-2");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const RP = { "hr.payroll.read": true };
  const PK2 = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payadjust.request": true, "hr.payadjust.approve": true };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(TT, t, `QM2 ${t} ${tag}`, r as Any, ua, p);
  const U = { owner: await mk("owner", "OWNER", [], {}), pay1: await mk("pay1", "STAFF", ["*"], PK2), payU1: await mk("payu1", "STAFF", [u1], RP), payU2: await mk("payu2", "STAFF", [u2], RP) };
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w as Any)])) as Record<keyof typeof U, Any>;
  const ownA = { userId: U.owner.id, isOwner: true };
  const payA = { userId: U.pay1.id, isOwner: false };
  const c = (s: string) => ({ tenantId: TT, systemId: s });
  const setV2 = (id: string) => P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, id);
  const sys = async (name: string, v2 = true) => {
    const id = (await SYS.createSystem(TT, "HR", `${name} ${tag}`)).id as string;
    if (v2) await setV2(id);
    return id;
  };
  const book = async (name: string) => (await SYS.createSystem(TT, "ACCOUNT", `บัญชี ${name} ${tag}`)).id as string;
  const ADDR = { subdistrict: "ทุ่งพญาไท", district: "ราชเทวี", province: "กรุงเทพมหานคร", postcode: "10400" };
  const emp = async (s: string, code: string, o: { unit?: string; salary?: number; linkedUserId?: string } = {}) => {
    const id = await fx.mkEmp(TT, s, `${code} ${tag}`, { startDate: "2030-01-01", unitId: o.unit ?? u1, code, ...(o.linkedUserId ? { linkedUserId: o.linkedUserId } : {}) });
    await P.hrEmployee.update({ where: { id }, data: { ...ADDR, bankName: "KBank", bankAccountNo: "0123456789", bankAccountName: `QM2 ${code}` } });
    await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: id, baseSalarySatang: o.salary ?? 2_000_000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
    return id;
  };
  const rows = async (sql: string, ...p: unknown[]) => ((await P.$queryRawUnsafe(sql, ...p)) as Any[]) ?? [];
  const safe = <R,>(f: () => Promise<R>) => f().catch((e: unknown) => ({ ok: false, code: "THROW", reason: errText(e), __throw: e }) as Any);
  const create = (s: string, pk: string) => safe(() => PAY.createPayrollRunV2(c(s), V.pay1, { periodKey: pk, payDate: PAYDAY[pk] }, { now: NOW[pk], actor: payA }));
  const approve = (s: string, id: string) => safe(() => PAY.approveRun(c(s), id, undefined, ownA));
  const reverse = (s: string, id: string) => safe(() => PAY.reverseRun(c(s), id, "qc hr money-2", ownA));
  const adj = async (s: string, e: string, pk: string, kind: string, amt: number) => {
    const r = await PAY.requestAdjustment(c(s), { employeeId: e, periodKey: pk, kind, amountSatang: amt, note: `qc ${kind}`, requestedById: U.pay1.id });
    const d = r?.id ? await PAY.decideAdjustment(c(s), r.id, "APPROVED", ownA) : r;
    return { id: (r?.id ?? "") as string, ok: !!r?.id && d?.ok !== false };
  };
  const giveBack = (s: string, claimId: string, amt: number, pk: string) => safe(() => PAY.giveBackClaim(c(s), { userId: U.owner.id }, { claimId, amountSatang: amt, periodKey: pk, note: "คืนเงิน qc" }));
  const runOf = async (id: string) => (await rows(`SELECT id, status::text AS status, "periodKey" AS p, "inputDigest" AS dg, "totalGrossSatang" AS g, "totalNetSatang" AS n, "totalSsoEmployerSatang" AS sr FROM "HrPayrollRun" WHERE id = $1`, id))[0];
  const adjOf = async (id: string) => (await rows(`SELECT id, status::text AS s, "runId" AS r, "amountSatang" AS a, kind::text AS k FROM "HrPayAdjustment" WHERE id = $1`, id))[0];
  const itemOf = async (runId: string, e: string) => (await rows(`SELECT id, "grossSatang" AS g, "netSatang" AS n, "ssoEmployerSatang" AS sr, "snapshotJson" AS j FROM "HrPayrollItem" WHERE "runId" = $1 AND "employeeId" = $2`, runId, e))[0];
  const linesOf = async (runId: string, e: string) => ((((await itemOf(runId, e))?.j?.lines ?? []) as Any[]).map((l) => `${l.code}:${l.amountSatang}`));
  const flagsOf = async (runId: string, e: string) => ((((await itemOf(runId, e))?.j?.flags ?? []) as Any[]).map(String));
  const auditOf = (target: string, action: string) => rows(`SELECT action, after FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2 AND action = $3 ORDER BY "createdAt"`, TT, target, action);
  const liveRuns = async (s: string) => Number((await rows(`SELECT count(*)::int AS n FROM "HrPayrollRun" WHERE "systemId" = $1 AND status <> 'REVERSED'::"PayrollRunStatus"`, s))[0]?.n ?? -1);
  const lawOk = lawPresent === 0 && lawInserted === 3;

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
    if (lawInserted) await P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LAW_KEY}-%`).catch(() => null); // only the rows this run inserted
    const lawLeft = await n(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LAW_KEY}-%`);
    const actAfter = await n(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`);
    const tLeft = await n(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, `${PREFIX}%`);
    const uLeft = await n(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `${PREFIX}%`);
    if (lawLeft !== 0) left.push(`law=${lawLeft}`);
    if (actAfter !== actBefore) left.push(`ACTIVE ${actBefore}->${actAfter}`);
    if (tLeft !== 0) left.push(`tenant=${tLeft}`);
    if (uLeft !== 0) left.push(`user=${uLeft}`);
    console.log(`RESIDUE ${left.length ? left.join(",") : "none"} (tenants=${fx.tenants.length} users=${fx.users.length} activeLaw=${actBefore}->${actAfter})`);
    return left;
  }
  return { P, fx, tag, TT, u1, u2, U, V, ownA, payA, c, sys, setV2, book, emp, rows, safe, create, approve, reverse, adj, giveBack, runOf, adjOf, itemOf, linesOf, flagsOf, auditOf, liveRuns, cleanup, PAY, lawOk, lawPresent };
}

/**
 * Hold a lock in its own tx (advisory key, or a row lock via `rowSql`), start `calls` one at a time — each next call starts only after the
 * previous one is observed waiting (pg_blocking_pids on the holder, or transitively behind an earlier waiter) or after a bounded wait — then
 * release. Returns results + which calls were seen blocked. (hunter H5.2 p3 helper)
 */
export async function underLock<R>(P: Any, lock: { key: string } | { rowSql: string; args: unknown[] }, calls: (() => Promise<R>)[]): Promise<{ res: R[]; blocked: boolean[]; holderErr: string }> {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held: (pid: number) => void = () => {};
  const heldP = new Promise<number>((r) => (held = r));
  let holderErr = "";
  const holder = P.$transaction(async (tx: Any) => {
    const pid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid() AS p`)) as Any[])[0]?.p ?? -1);
    if ("key" in lock) await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))::text AS x`, lock.key);
    else await tx.$queryRawUnsafe(lock.rowSql, ...lock.args);
    held(pid);
    await gate;
  }, { maxWait: 20_000, timeout: 180_000 }).catch((e: unknown) => ((holderErr = errText(e)), held(-1)));
  const pid = await heldP;
  const running: Promise<R>[] = [];
  const blocked: boolean[] = [];
  const nDirect = async () => Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))`, pid).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
  const nChain = async () => Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0 AND NOT ($1::int = ANY(pg_blocking_pids(pid)))`, pid).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
  for (let k = 0; k < calls.length; k++) {
    const d0 = await nDirect();
    const c0 = await nChain();
    let done = false;
    const p = calls[k]!().finally(() => (done = true));
    running.push(p);
    let b = false;
    for (let i = 0; i < 100 && !done; i++) {
      await sleep(150);
      if ((await nDirect()) > d0 || (k > 0 && (await nChain()) > c0)) {
        b = true;
        break;
      }
    }
    blocked.push(b);
  }
  release();
  await holder;
  const res = await Promise.all(running);
  return { res, blocked, holderErr };
}
