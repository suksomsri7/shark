// scratch (hunter HF-SSO-2569) — own tenant(s) slug qc-hfssohunt-* · optional own ACTIVE law rows (sourceKey qc-hfssohunt-<tag>-*) · full cleanup + residue
// adapted from scratchpad/h310-hunt/common.mts (law-row pattern of scripts/qc-hr-h3.4.mts) — law rows inserted ONLY by withLaw(), after a foreign-ACTIVE check
import { type Any, qc4Env, makeFixtures, vOf, tagOf, errText } from "../../scripts/qc-hr-lib.mjs";

export { vOf, errText };
export type { Any };
export const T = (iso: string) => new Date(iso);
export const PREFIX = "qc-hfssohunt-";
export const B = (baht: number) => Math.round(baht * 100);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const short = (v: unknown, n = 260) => {
  const s = JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x instanceof Uint8Array ? `<${x.length} bytes>` : x));
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
};
export const ADDR = { subdistrict: "ทุ่งพญาไท", district: "ราชเทวี", province: "กรุงเทพมหานคร", postcode: "10400" };
export const PROFILE = { taxId: "0105555000013", branchNo: "000000", employerName: "บริษัท คิวซี ล่าบั๊ก จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400", deptName: "สำนักงานใหญ่", lto: false, branchType: "", rdUserId: "QCREF00000000000034", rdFormFlag: 1, ssoAccountNo: "9876543210", ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: "นายผู้ลงนาม ทดสอบ", certPrefix: "HR50" };
// valid Thai national ids (mod-11 check digit)
export function nid(seed: number): string {
  const d = String(1100000000000 + seed * 7919).slice(0, 12).split("").map(Number);
  const s = d.reduce((a, x, i) => a + x * (13 - i), 0);
  return d.join("") + String((11 - (s % 11)) % 10);
}

export async function setup(suite: string) {
  const { P, coreHash } = await qc4Env(suite);
  const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
  const SLUG = `${PREFIX}${Date.now()}${tag}`;
  const LAW_KEY = `${PREFIX}${tag}`;
  const fx = makeFixtures(P, coreHash, SLUG);
  const actBefore = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`)) as Any[])[0]?.n ?? -1);
  console.log(`ACTIVE law rows before = ${actBefore}`);
  /** insert own ACTIVE rows — STOP (throw) if any ACTIVE row that is not ours exists */
  async function withLaw(rows: { kind: string; effectiveFrom: string; json: unknown }[]): Promise<void> {
    const foreign = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE' AND "sourceKey" NOT LIKE $1`, `${LAW_KEY}-%`)) as Any[])[0]?.n ?? -1);
    if (foreign !== 0) throw new Error(`STOP: ${foreign} foreign ACTIVE law rows present — not inserting`);
    let k = 0;
    for (const r of rows)
      await P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", $3::date, $4::jsonb, 'ACTIVE'::"HrLawStatus", $1, 'qc hf-sso hunter', 'QC', now())`, `${LAW_KEY}-${k++}`, r.kind, r.effectiveFrom, JSON.stringify(r.json));
  }
  const PAY = (await import("@/lib/modules/hr/payroll")) as Any;
  const R = (await import("@/lib/modules/hr/payroll-rules")) as Any;
  const S = (await import("@/lib/modules/hr/payroll-rules-sso")) as Any;
  const OPM = (await import("@/lib/modules/hr/payroll-opening")) as Any;
  const FS = (await import("@/lib/modules/hr/filings/service")) as Any;
  const BK = (await import("@/lib/modules/hr/bank-files/service")) as Any;
  const REP = (await import("@/lib/modules/hr/reports")) as Any;
  const PS = (await import("@/lib/modules/hr/payslip")) as Any;
  const LAB = (await import("@/lib/modules/hr/labor")) as Any;
  const GL = (await import("@/lib/modules/account/gl")) as Any;
  const DG = (await import("@/lib/modules/hr/payroll-digest")) as Any;
  const SYS = (await import("@/lib/modules/system/service")) as Any;
  const TT = await fx.newTenant("", "QC hunter HF-SSO");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const RP = { "hr.payroll.read": true, "hr.payroll.pay": true };
  const PK = { ...RP, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.reverse": true };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(TT, t, `QCH ${t} ${tag}`, r as Any, ua, p);
  const U = { owner: await mk("owner", "OWNER", [], {}), pay1: await mk("pay1", "STAFF", ["*"], PK) };
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w as Any)])) as Record<keyof typeof U, Any>;
  const ownerA = { userId: U.owner.id, isOwner: true };
  const payA = { userId: U.pay1.id, isOwner: false };
  const sys = async (n: string, v2 = false) => {
    const id = (await SYS.createSystem(TT, "HR", `${n} ${tag}`)).id as string;
    if (v2) await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, id);
    return id;
  };
  const book = async (n: string) => (await SYS.createSystem(TT, "ACCOUNT", `บัญชี ${n} ${tag}`)).id as string;
  let seq = 0;
  const emp = async (s: string, n: string, o: { start?: string; end?: string; salary: number; sso?: boolean; spouse?: boolean; children?: number }) => {
    const id = await fx.mkEmp(TT, s, `${n} ${tag}`, { startDate: o.start ?? "2024-01-01", unitId: u1, code: n, ...(o.end ? { endDate: o.end } : {}) });
    await P.hrEmployee.update({ where: { id }, data: { nationalId: nid(++seq + Math.floor(Math.random() * 1000)), ...ADDR, bankName: "KBank", bankAccountNo: "0123456789", bankAccountName: `QCH ${n}` } });
    await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: id, baseSalarySatang: o.salary, ssoEligible: o.sso ?? true, personalDeductionJson: { spouse: !!o.spouse, children: o.children ?? 0 } } });
    return id;
  };
  const rows = async (sql: string, ...p: unknown[]) => ((await P.$queryRawUnsafe(sql, ...p)) as Any[]) ?? [];
  const safe = <X,>(f: () => Promise<X>) => f().catch((e: unknown) => ({ ok: false, code: "THROW", reason: errText(e) }) as Any);
  const c = (s: string) => ({ tenantId: TT, systemId: s });
  const runOf = async (id: string) => (await rows(`SELECT id, "periodKey" AS pk, status::text AS status, "engineVersion" AS ev, "journalEntryId" AS j, "totalGrossSatang" AS g, "totalNetSatang" AS n, "totalWhtSatang" AS w, "totalSsoEmployeeSatang" AS se, "totalSsoEmployerSatang" AS sr, "stepsJson"->'ssoLaw' AS marker FROM "HrPayrollRun" WHERE id = $1`, id))[0];
  const itemsOf = (id: string) => rows(`SELECT "employeeId" AS e, "grossSatang" AS g, "netSatang" AS n, "whtSatang" AS w, "ssoBaseSatang" AS sb, "ssoEmployeeSatang" AS se, "ssoEmployerSatang" AS sr, "addSatang" AS a, "deductSatang" AS d FROM "HrPayrollItem" WHERE "runId" = $1 ORDER BY "employeeId"`, id);
  const entries = (runId: string) => rows(`SELECT e.id, e.status::text AS status, e."idempotencyKey" AS k, e."reversalOfId" AS rof, (SELECT coalesce(sum(l.debit),0)::bigint FROM "AccountJournalLine" l WHERE l."entryId" = e.id) AS dr FROM "AccountJournalEntry" e WHERE e."refId" = $1 ORDER BY e."createdAt", e.id`, runId);
  const linesBy = (entryId: string) => rows(`SELECT a.code, sum(l.debit)::bigint AS dr, sum(l.credit)::bigint AS cr FROM "AccountJournalLine" l JOIN "AccountLedger" a ON a.id = l."accountId" WHERE l."entryId" = $1 GROUP BY a.code ORDER BY a.code`, entryId);
  /** rewrite a run's rows to what the OLD code (292bc5b7e) stored: frozen ssoContribution (15,000 cap) + frozen monthlyWhtSatang (9,000 allowance cap) · no marker */
  async function toPreFix(runId: string): Promise<void> {
    const items = (await P.hrPayrollItem.findMany({ where: { runId } })) as Any[];
    for (const it of items) {
      const snap = (it.snapshotJson ?? {}) as Any;
      const base = Number(snap.baseSalarySatang);
      const sso = snap.ssoEligible === false ? { baseSatang: 0, employeeSatang: 0, employerSatang: 0 } : R.ssoContribution(base);
      const wht = R.monthlyWhtSatang({ monthlySalarySatang: base, ssoEmployeeYearSatang: sso.employeeSatang * 12, deductions: snap.deductions });
      const net = it.grossSatang - sso.employeeSatang - wht;
      const s2 = { ...snap, ssoEmployeeYearSatang: sso.employeeSatang * 12 };
      await P.$executeRawUnsafe(`UPDATE "HrPayrollItem" SET "ssoBaseSatang" = $2, "ssoEmployeeSatang" = $3, "ssoEmployerSatang" = $3, "whtSatang" = $4, "netSatang" = $5, "snapshotJson" = $6::jsonb WHERE id = $1`, it.id, sso.baseSatang, sso.employeeSatang, wht, net, JSON.stringify(s2));
    }
    await P.$executeRawUnsafe(
      `UPDATE "HrPayrollRun" r SET "totalSsoEmployeeSatang" = x.se, "totalSsoEmployerSatang" = x.sr, "totalWhtSatang" = x.w, "totalNetSatang" = x.n, "stepsJson" = NULL
         FROM (SELECT sum("ssoEmployeeSatang")::int se, sum("ssoEmployerSatang")::int sr, sum("whtSatang")::int w, sum("netSatang")::int n FROM "HrPayrollItem" WHERE "runId" = $1) x WHERE r.id = $1`,
      runId,
    );
  }
  /** the OLD approve with a book: claim APPROVED → postPayrollV1KeyedJV(totals) → journalEntryId (same calls as 292bc5b7e approveRun) */
  async function oldApprove(s: string, acct: string, runId: string): Promise<string> {
    await P.hrPayrollRun.update({ where: { id: runId }, data: { status: "APPROVED" } });
    const run = (await P.hrPayrollRun.findUnique({ where: { id: runId } })) as Any;
    const { entryId } = await GL.postPayrollV1KeyedJV({ tenantId: TT, systemId: acct }, runId, { payDate: run.payDate, periodKey: run.periodKey, grossSatang: run.totalGrossSatang, ssoEmployeeSatang: run.totalSsoEmployeeSatang, ssoEmployerSatang: run.totalSsoEmployerSatang, whtSatang: run.totalWhtSatang, netSatang: run.totalNetSatang });
    await P.hrPayrollRun.update({ where: { id: runId }, data: { journalEntryId: entryId, note: "อนุมัติและลงบัญชีแล้ว" } });
    return entryId;
  }
  const expectOf = async (runId: string) => {
    const items = (await P.hrPayrollItem.findMany({ where: { runId }, select: DG.PAYROLL_DIGEST_SELECT })) as Any[];
    return { totalNetSatang: items.reduce((a, i) => a + i.netSatang, 0), itemCount: items.length, totalGrossSatang: items.reduce((a, i) => a + i.grossSatang, 0), itemsDigest: DG.payrollItemsDigest(items) };
  };
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
  return { P, fx, tag, TT, u1, U, V, ownerA, payA, sys, book, emp, rows, safe, c, runOf, itemsOf, entries, linesBy, toPreFix, oldApprove, expectOf, cleanup, withLaw, PAY, R, S, OPM, FS, BK, REP, PS, LAB, GL, DG, SYS };
}

/** hold an advisory/row lock in its own tx, start calls one by one (each after the previous is observed blocked), then release */
export async function underLock<X>(P: Any, lock: { key: string; seed: number } | { rowSql: string; args: unknown[] }, calls: (() => Promise<X>)[]): Promise<{ res: X[]; blocked: boolean[]; holderErr: string }> {
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
  const running: Promise<X>[] = [];
  const blocked: boolean[] = [];
  const nWaiting = async () => Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
  for (let k = 0; k < calls.length; k++) {
    const before = await nWaiting();
    let done = false;
    const p = calls[k]!().finally(() => (done = true));
    running.push(p);
    let b = false;
    for (let i = 0; i < 100 && !done; i++) {
      await sleep(150);
      if ((await nWaiting()) > before) { b = true; break; }
    }
    blocked.push(b);
  }
  release();
  await holder;
  return { res: await Promise.all(running), blocked, holderErr };
}
