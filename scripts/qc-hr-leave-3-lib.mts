// QC HR-LEAVE-3 fixtures + race/action helpers for scripts/qc-hr-leave-3.mts (from shark-hr/scratchpad/h53l/common.mts) · ⚠️ ORACLE-EDIT only
// own tenant qc-hr-leave3-* · own ACTIVE law rows (sourceKey qc-hr-leave3-<tag>-*) removed in cleanup
import { sweepTenants, sweepResidue } from "./qc-hr-h4.3-lib.mjs";
import { type Any, qc4Env, makeFixtures, vOf, jsonOf, tagOf, errText, sleep, textOf } from "./qc-hr-lib.mjs";

export const PREFIX = "qc-hr-leave3-";
export const bk = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+07:00`);
export const dd = (day: string) => new Date(`${day}T00:00:00Z`);
export const dist = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {})).map(([k, n]) => `${k}×${n}`).join(" | ");

export async function setupLeave3(suite: string) {
 const { P, coreHash } = await qc4Env(suite);
 const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
 const SLUG = `${PREFIX}${Date.now()}${tag}`;
 const LAW_KEY = `${PREFIX}${tag}`;
 const fx = makeFixtures(P, coreHash, SLUG);
 const n = async (sql: string, ...a: unknown[]) => Number((((await P.$queryRawUnsafe(sql, ...a)) as Any[])[0]?.n) ?? -1);
 const LAWJ = (jsonOf("scripts/fixtures/hr-h3.4-vectors.json")?.law ?? {}) as Any;
 const lawPresent = await n(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${PREFIX}%`);
 const actBefore = await n(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`);
 let lawInserted = 0;
 if (lawPresent === 0)
  for (const [k, kind, j] of [["sso", "SSO", "SSO"], ["tax", "TAX_BRACKET", "TAX_BRACKET"], ["ded", "DEDUCTION", "DEDUCTION"]] as const) {
   await P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", '2031-01-01'::date, $3::jsonb, 'ACTIVE'::"HrLawStatus", $1, 'qc hr leave-3', 'QC', now())`, `${LAW_KEY}-${k}`, kind, JSON.stringify(LAWJ[j] ?? {}));
   lawInserted += 1;
  }
 const SYS = (await import("@/lib/modules/system/service")) as Any;
 const TT = await fx.newTenant("", "QC HR LEAVE-3");
 const u1 = await fx.newUnit(TT, `สาขา ${tag}`, "u1");
 const HRK = { "hr.leave.decide": true, "hr.leave.read": true, "hr.leave.request": true, "hr.employee.create": true };
 const PK2 = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payadjust.request": true };
 const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(TT, t, `QL3 ${t} ${tag}`, r as Any, ua, p);
 const U = {
  owner: await mk("owner", "OWNER", [], {}),
  owner2: await mk("owner2", "OWNER", [], {}),
  mgr: await mk("mgr", "MANAGER", [u1], HRK),
  mgr2: await mk("mgr2", "MANAGER", [u1], HRK),
  staff: await mk("staff", "STAFF", [u1], { "hr.leave.request": true }),
  staff2: await mk("staff2", "STAFF", [u1], { "hr.leave.request": true }),
  pay: await mk("pay", "STAFF", ["*"], PK2),
 };
 const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w as Any)])) as Record<keyof typeof U, Any>;
 const sys = async (name: string, v2 = false) => {
  const id = (await SYS.createSystem(TT, "HR", `${name} ${tag}`)).id as string;
  if (v2) await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, id);
  return id;
 };
 const rows = async (sql: string, ...p: unknown[]) => ((await P.$queryRawUnsafe(sql, ...p)) as Any[]) ?? [];
 const safe = <R,>(f: () => Promise<R>) => f().catch((e: unknown) => ({ ok: false, code: "THROW", reason: errText(e) }) as Any);
 const c = (s: string) => ({ tenantId: TT, systemId: s });
 async function cleanup(): Promise<string[]> {
  await sweepTenants(P, fx.tenants);
  const left = await sweepResidue(P, fx.tenants);
  await P.tenant.deleteMany({ where: { id: { in: fx.tenants } } }).catch(() => null);
  const extra = ((await P.user.findMany({ where: { email: { startsWith: `${SLUG}-` } }, select: { id: true } }).catch(() => [])) as Any[]).map((u) => u.id as string);
  for (const uid of [...new Set([...fx.users, ...extra])]) {
   await P.session.deleteMany({ where: { userId: uid } }).catch(() => null);
   await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => null);
   await P.membership.deleteMany({ where: { userId: uid } }).catch(() => null);
   await P.user.deleteMany({ where: { id: uid } }).catch(() => null);
  }
  if (lawInserted) await P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LAW_KEY}-%`).catch(() => null);
  const lawLeft = await n(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${PREFIX}%`);
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
 return { P, fx, tag, TT, u1, U, V, sys, rows, safe, c, cleanup, lawOk: lawPresent === 0 && lawInserted === 3 };
}

/** hold a row/advisory lock; start calls one by one, each after the previous is seen waiting (direct or chained); release (money-2 lib) */
export async function underLock<R>(P: Any, lock: { rowSql: string; args: unknown[] }, calls: (() => Promise<R>)[]): Promise<{ res: R[]; blocked: boolean[]; holderErr: string }> {
 let release: () => void = () => {};
 const gate = new Promise<void>((r) => (release = r));
 let held: (pid: number) => void = () => {};
 const heldP = new Promise<number>((r) => (held = r));
 let holderErr = "";
 const holder = P.$transaction(async (tx: Any) => {
  const pid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid() AS p`)) as Any[])[0]?.p ?? -1);
  await tx.$queryRawUnsafe(lock.rowSql, ...lock.args);
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
   if ((await nDirect()) > d0 || (k > 0 && (await nChain()) > c0)) { b = true; break; }
  }
  blocked.push(b);
 }
 release();
 await holder;
 return { res: await Promise.all(running), blocked, holderErr };
}

// ── Next request scope for server actions (technique of qc-hr-h0.7 inScope) ──
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
export async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
 if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("no Next request scope (next/dist/... not loadable)");
 const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "qc-hr-leave-3", "x-forwarded-for": "203.0.113.143" } });
 const jar = new nextCookies.RequestCookies(req.headers);
 const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
 const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
 return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}
export type ActOut = { threw: boolean; value: Any; text: string };
/** server action (fd) or (prev, fd) under the caller's session cookie */
export async function callAct(who: { cookie: string }, fn: Any, form: Record<string, string | string[]>, path = "/app/approvals"): Promise<ActOut> {
 if (typeof fn !== "function") return { threw: true, value: undefined, text: "∅fn" };
 const fd = new FormData();
 for (const [k, v] of Object.entries(form)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
 try {
  const v = await inScope(who.cookie, path, () => (fn.length >= 2 ? fn({ status: "idle" }, fd) : fn(fd)));
  return { threw: false, value: v, text: textOf(v) || (v && typeof v === "object" ? JSON.stringify(v) : String(v ?? "")) };
 } catch (e) {
  return { threw: true, value: undefined, text: e instanceof Error ? e.message : String(e) };
 }
}
export const shiftOf = async (P: Any, tenantId: string, systemId: string, name: string, startMin: number, endMin: number) =>
 (await P.hrShift.create({ data: { tenantId, systemId, name, startMin, endMin, crossesMidnight: false, graceMin: 5 } })).id as string;
export const entryOf = async (P: Any, tenantId: string, systemId: string, employeeId: string, day: string, shiftId: string, unitId: string, win: [number, number]) =>
 (await P.hrRosterEntry.create({ data: { tenantId, systemId, employeeId, date: dd(day), shiftId, unitId, startMin: win[0], endMin: win[1], breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date("2031-03-01T00:00:00Z"), source: "MANUAL" } })).id as string;
