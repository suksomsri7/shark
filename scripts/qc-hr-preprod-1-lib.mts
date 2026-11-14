// QC — HR V2 · fix ticket HR-PREPROD-1 — fixtures for scripts/qc-hr-preprod-1.mts (brief ledger/hr-briefs/hr-brief-PREPROD-1.md)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Own tenants qc-hr-pp1-<stamp><tag>-* · own ACTIVE law rows (sourceKey qc-hr-pp1-<tag>-*, hr-h3.4-vectors.json) — refuses if any exist, removed in cleanup ·
//   cleanup deletes only rows of the tenants/users/law keys this run created
import { type Any, qc4Env, makeFixtures, vOf, jsonOf, tagOf, errText, canon } from "./qc-hr-lib.mjs";

export const PREFIX = "qc-hr-pp1-";
export const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
export const dd = (day: string) => new Date(`${day}T00:00:00Z`);
const nextPk = (pk: string) => { const [y, m] = pk.split("-").map(Number); return m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, "0")}`; };
export const payDay = (pk: string) => bk(`${pk}-25`, "10:00");
export const nowOf = (pk: string) => bk(`${nextPk(pk)}-03`);
const RP = { "hr.payroll.read": true };
const PK2 = { ...RP, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payroll.reverse": true, "hr.payadjust.request": true, "hr.payadjust.approve": true, "hr.payadjust.reject": true };
/** R4 viewers: payroll reader + adjustment approver/requester — limited to [u1] or all branches */
const LIM = { ...RP, "hr.payadjust.request": true, "hr.payadjust.approve": true, "hr.payadjust.reject": true };

export async function setupPP1(suite: string) {
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
    for (const [k, kind] of [["sso", "SSO"], ["tax", "TAX_BRACKET"], ["ded", "DEDUCTION"]] as const) {
      await P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", '2031-01-01'::date, $3::jsonb, 'ACTIVE'::"HrLawStatus", $1, 'qc hr preprod-1', 'QC', now())`, `${LAW_KEY}-${k}`, kind, JSON.stringify(LAWJ[kind] ?? {}));
      lawInserted += 1;
    }
  }
  const PAY = (await import("@/lib/modules/hr/payroll")) as Any;
  const SYS = (await import("@/lib/modules/system/service")) as Any;
  const rows = async (sql: string, ...p: unknown[]) => ((await P.$queryRawUnsafe(sql, ...p)) as Any[]) ?? [];
  const safe = <R,>(f: () => Promise<R>) => f().catch((e: unknown) => ({ ok: false, code: "THROW", reason: errText(e), __throw: e }) as Any);
  const ADDR = { subdistrict: "ทุ่งพญาไท", district: "ราชเทวี", province: "กรุงเทพมหานคร", postcode: "10400" };

  /** one tenant: units u1/u2 · owner · pay1 (all branches, run + adjustments) · lim ([u1]) / all (["*"]) adjustment approvers */
  async function kit(sfx: string, label: string) {
    const TT = await fx.newTenant(`-${sfx}`, `QC PREPROD-1 ${label}`);
    const u1 = await fx.newUnit(TT, `สาขาหนึ่ง ${sfx} ${tag}`, `${sfx}u1`);
    const u2 = await fx.newUnit(TT, `สาขาสอง ${sfx} ${tag}`, `${sfx}u2`);
    const mk = (t: string, r: "OWNER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(TT, `${sfx}${t}`, `QPP ${sfx}${t} ${tag}`, r, ua, p);
    const U = { owner: await mk("owner", "OWNER", [], {}), pay1: await mk("pay1", "STAFF", ["*"], PK2), lim: await mk("lim", "STAFF", [u1], LIM), all: await mk("all", "STAFF", ["*"], LIM) };
    const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w as Any)])) as Record<keyof typeof U, Any>;
    const ownA = { userId: U.owner.id, isOwner: true };
    const c = (s: string) => ({ tenantId: TT, systemId: s });
    const setV2 = (id: string) => P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, id);
    const sys = async (name: string, v2 = true) => {
      const id = (await SYS.createSystem(TT, "HR", `${name} ${tag}`)).id as string;
      if (v2) await setV2(id);
      return id;
    };
    const book = async (name: string) => (await SYS.createSystem(TT, "ACCOUNT", `บัญชี ${name} ${tag}`)).id as string;
    const emp = async (s: string, code: string, o: { unit?: string | null; salary?: number; linkedUserId?: string; endDate?: string } = {}) => {
      const id = await fx.mkEmp(TT, s, `${code} ${tag}`, { startDate: "2030-01-01", unitId: o.unit === undefined ? u1 : o.unit, code, ...(o.linkedUserId ? { linkedUserId: o.linkedUserId } : {}), ...(o.endDate ? { endDate: o.endDate } : {}) });
      await P.hrEmployee.update({ where: { id }, data: { ...ADDR, bankName: "KBank", bankAccountNo: "0123456789", bankAccountName: `QPP ${code}` } });
      await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: id, baseSalarySatang: o.salary ?? 3_000_000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
      return id;
    };
    const create = (s: string, pk: string) => safe(() => PAY.createPayrollRunV2(c(s), V.pay1, { periodKey: pk, payDate: payDay(pk) }, { now: nowOf(pk), actor: { userId: U.pay1.id, isOwner: false } }));
    const createV1 = (s: string, pk: string) => safe(() => PAY.createPayrollRun(c(s), { periodKey: pk, payDate: payDay(pk) }));
    const approve = (s: string, id: string) => safe(() => PAY.approveRun(c(s), id, undefined, ownA));
    const reverse = (s: string, id: string) => safe(() => PAY.reverseRun(c(s), id, "qc hr preprod-1", ownA));
    const adj = async (s: string, e: string, pk: string, kind: string, amt: number, decide = true) => {
      const r = await PAY.requestAdjustment(c(s), { employeeId: e, periodKey: pk, kind, amountSatang: amt, note: `qc ${kind}`, requestedById: U.pay1.id });
      const d = r?.id && decide ? await PAY.decideAdjustment(c(s), r.id, "APPROVED", ownA) : r;
      return { id: (r?.id ?? "") as string, ok: !!r?.id && d?.ok !== false };
    };
    const giveBack = (s: string, claimId: string, amt: number, pk: string) => safe(() => PAY.giveBackClaim(c(s), { userId: U.owner.id }, { claimId, amountSatang: amt, periodKey: pk, note: "คืนเงิน qc" }));
    const shift = async (s: string) => (await P.hrShift.create({ data: { tenantId: TT, systemId: s, name: `เช้า ${tag}`, startMin: 540, endMin: 1020, crossesMidnight: false, graceMin: 0 } })).id as string;
    const roster = async (s: string, sh: string, e: string, d: string) => (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: s, employeeId: e, date: dd(d), shiftId: sh, unitId: u1, startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date("2030-12-01T00:00:00Z"), source: "MANUAL" } })).id as string;
    const punch = async (s: string, e: string, re: string, d: string, inHm: string) => {
      for (const [k, hm] of [["IN", inHm], ["OUT", "17:00"]] as const) await P.hrAttendance.create({ data: { tenantId: TT, systemId: s, employeeId: e, kind: k, at: bk(d, hm), rosterEntryId: re, source: "KIOSK" } });
    };
    return { TT, u1, u2, U, V, ownA, c, setV2, sys, book, emp, create, createV1, approve, reverse, adj, giveBack, shift, roster, punch };
  }
  const runOf = async (id: string) => (await rows(`SELECT id, status::text AS status, "periodKey" AS p, "journalEntryId" AS jv, "accountSystemId" AS book, "stepsJson" AS st FROM "HrPayrollRun" WHERE id = $1`, id))[0];
  const adjOf = async (id: string) => (await rows(`SELECT id, status::text AS s, "runId" AS r, "amountSatang" AS a, kind::text AS k, "periodKey" AS p, "sourceType"::text AS src, "consentAt" AS ca FROM "HrPayAdjustment" WHERE id = $1`, id))[0];
  const itemOf = async (runId: string, e: string) => (await rows(`SELECT id, "grossSatang" AS g, "deductSatang" AS d, "snapshotJson" AS j FROM "HrPayrollItem" WHERE "runId" = $1 AND "employeeId" = $2`, runId, e))[0];
  const linesOf = async (runId: string, e: string) => ((((await itemOf(runId, e))?.j?.lines ?? []) as Any[]).map((l) => `${l.code}:${l.amountSatang}${l.day ? `@${String(l.day).slice(0, 10)}` : ""}`));
  const auditN = async (tenantId: string) => Number((await rows(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1`, tenantId))[0]?.n ?? -1);
  const snapRow = async (table: string, id: string) => canon((await rows(`SELECT * FROM "${table}" WHERE id = $1`, id))[0] ?? null);
  const lawOk = lawPresent === 0 && lawInserted === 3;

  async function cleanup(): Promise<string[]> {
    const left: string[] = [];
    const inList = fx.tenants.filter((x: string) => /^[A-Za-z0-9_-]+$/.test(x)).map((x: string) => `'${x}'`).join(",");
    if (inList) {
      const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema = current_schema() and column_name='tenantId'`).catch(() => [])) as Any[])
        .map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
      for (let pass = 0; pass < 5; pass += 1) {
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
    if (lawInserted) await P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LAW_KEY}-%`).catch(() => null);
    const lawLeft = await n(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LAW_KEY}-%`);
    const actAfter = await n(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`);
    const tLeft = await n(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, `${SLUG}%`);
    const uLeft = await n(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `${SLUG}%`);
    if (lawLeft !== 0) left.push(`law=${lawLeft}`);
    if (actAfter !== actBefore) left.push(`ACTIVE ${actBefore}->${actAfter}`);
    if (tLeft !== 0) left.push(`tenant=${tLeft}`);
    if (uLeft !== 0) left.push(`user=${uLeft}`);
    console.log(`RESIDUE ${left.length ? left.join(",") : "none"} (tenants=${fx.tenants.length} users=${fx.users.length} activeLaw=${actBefore}->${actAfter})`);
    return left;
  }
  return { P, fx, tag, kit, rows, safe, runOf, adjOf, itemOf, linesOf, auditN, snapRow, cleanup, PAY, lawOk, lawPresent };
}

/** Next request scope for server actions (same mechanism as qc-hr-priv-2) */
export async function nextScope(): Promise<<T,>(cookie: string, pathname: string, fn: () => Promise<T>) => Promise<T>> {
  const NX = (await Promise.all(["app-render/work-async-storage.external.js", "app-render/work-unit-async-storage.external.js", "web/spec-extension/cookies.js"].map((p) => import(`next/dist/server/${p}` as string).catch(() => null)))) as Any[];
  return async <T,>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> => {
    const [nw, nu, nc] = NX;
    if (!nw?.workAsyncStorage || !nu?.workUnitAsyncStorage || !nc?.RequestCookies) throw new Error("no Next request scope");
    const req = new Request(`http://qc.local${pathname}`, { headers: { cookie } }), jar = new nc.RequestCookies(req.headers);
    const ws = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
    const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
    return nw.workAsyncStorage.run(ws, () => nu.workUnitAsyncStorage.run(unit, fn));
  };
}

/** [paid, unpaid] from any value that carries both (keys …paid… / …unpaid…) — Map, array or object, depth ≤ 6 */
export function splitIn(v: unknown, d = 0): [unknown, unknown] | null {
  if (d > 6 || v === null || typeof v !== "object") return null;
  if (v instanceof Map) { for (const x of v.values()) { const r = splitIn(x, d + 1); if (r) return r; } return null; }
  if (Array.isArray(v)) { for (const x of v) { const r = splitIn(x, d + 1); if (r) return r; } return null; }
  const ks = Object.keys(v as object);
  const uk = ks.find((k) => /unpaid/i.test(k));
  const pk = ks.find((k) => /paid/i.test(k) && !/unpaid/i.test(k));
  if (uk && pk) return [(v as Any)[pk], (v as Any)[uk]];
  for (const k of ks) { const r = splitIn((v as Any)[k], d + 1); if (r) return r; }
  return null;
}
/** a day count given as number, "d.d" text or tenths */
export const daysEq = (x: unknown, want: number) => { const n = Number(String(x)); return Number.isFinite(n) && (n === want || n === want * 10); };
