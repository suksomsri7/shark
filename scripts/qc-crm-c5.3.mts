// QC — CRM v2 WO C5.3 "verify & pin": every C5.2 hunter finding that the oracle writer re-traced and could reproduce, pinned as a
//      check that is RED on the tree it was written against (main d60ab051) for the reason stated in the finding, and that turns GREEN
//      when the minimal CONTRACT printed with each check is met (the contract states behaviour, never an implementation).
// Oracle writer · the fix builders must NOT edit this file (ORACLE-EDIT through the controller only) · QC2 database only
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c5.3.mts
//      `--only=L1,L3` = run only those sections (K + CLEAN always run) · the default runs every section
// requires: none   (no seed is read · every row lives in the throwaway tenant `qc-c53-<rand>` (+ ChatRateBucket keys / API keys / minute-job
//                   state rows named after this run) and is deleted in finally — the CLEAN check proves it)
// 🔴 NEVER drains the global outbox and NEVER runs a real cron job: sequences.runDue / purgeBodies / runExportJobs are called with
//    tenantIds=[mine]; the outbox lease test (L3-M3) drains through a process-local shim that narrows the candidate query to this run's
//    tenant AND its private event type (verified before use — refused otherwise); the minute-job test clears the in-process registry
//    and registers two fake jobs named after this run.
//
// SOURCES: ledger/wo-notes/crm-C5.2-L1.md · -L2.md · -L3.md · -L4.md · -L5.md (hunter reports) + their probes in scripts/pending/hunt-l*/ ·
//   verdict table + ORACLE-EDIT proposals + prod exposure in ledger/wo-notes/crm-C5.3.md · house style qc-crm-c3.9 / qc-crm-v1 (server-action
//   scope harness) / qc-crm-c3.8 (REST route harness).
//
// CHECK INVENTORY (ids `C5.3-L<lens>-<M|m><n>` · MAJOR = hunter MAJOR the writer verified · MINOR = hunter MINOR marked CONFIRMED + verified):
//   K.1 harness · L1: M1 M2 M3 m1 m2 m3 m4 m5 · L2: M1 M2 M3 m1 m2 m4 · L3: M1 M1b M1c M2 M3 M4 m1 m2 m4 · L4: M1 M2 M3(objective part) m1 m2 m3 ·
//   L5: M1 M2 M3 M4 m3 m5 m6 m7 · L6: M1 M2 M3 M4 M5 m1 m2 m3 m4 m5 m6 m7 m8 m11 · X1 cross-surface money consistency · CLEAN   (54)
//   NOT pinned (see crm-C5.3.md): L1-m6 L2-m3 L3-m3 L4-m4 L4-m5 L4-m6 L5-m1 m2 m4 m8 m9 (PLAUSIBLE / design) · L4-M3 destination policy (owner) ·
//   L1-m1 second half ("key outlives its creator" — platform-wide API-key design, owner question) · L6-m9 L6-m10 (UI-only: confirm dialog /
//   tap targets — belong to the visual/parity suite, not an in-process oracle) · L6-M5 company SCORE (undefined — owner defines or hides)
//   SOURCE (not behavioural) checks, each says why: L3-M1c (a false kernel comment) · L6-M4 for the 3 cron-driven templates only
//   OUTBOX GUARD: this process's outbox candidate query is narrowed to the run's tenant for the WHOLE run (see OUTBOX GUARD) — any drain a
//   product write wakes (L3-M1b) or a check runs (L3-M3, L6-M4) can only touch this tenant's rows.
//
// MONEY BASIS (X1, L2-M2/M3): the controller's default is WON VALUE = BEFORE VAT (owner question Q14 pending). If the owner rules
//   VAT-inclusive, flip WON_BASIS below — every expected figure is derived from it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomBytes } from "node:crypto";

const WON_BASIS: "PRE_VAT" | "VAT_INCL" = "PRE_VAT"; // Q14 pending — controller default
const ARGV = process.argv.slice(2);
const ONLY = (ARGV.find((a) => a.startsWith("--only=")) ?? "").slice("--only=".length).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const want = (sec: string) => ONLY.length === 0 || ONLY.includes(sec);
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir: string, re = /\.(ts|tsx|mts)$/): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, re));
    else if (re.test(name)) out.push(p);
  }
  return out.sort();
};
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.log(`🔴 C5.3 runs on QC2 only (ep-cool-shadow) — got ${host}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 1, passed: 0, findings: [{ id: "C5.3-ENV", sev: "CRITICAL" }] })}`);
  process.exit(1);
}
// no real network from this oracle (webhook / inbound attachment fetches are injected per check)
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async () => { throw new Error("C5.3: network blocked (inject a fetch)"); }) as typeof fetch;

// ─── Next request scope (technique of qc-crm-v1 / C1.9 / C1.11) — lets `requireTenant()` of a server action read our cookie ───
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
let SCOPE_RUNS = 0;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) return fn();
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "qc-crm-c5.3", "x-forwarded-for": "203.0.113.153" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  // afterContext emulates the platform's `after()` (runs the task once the action returned) — without it `after()` throws and callers fall back
  const afterContext = { after: (task: Any) => { setTimeout(() => { void Promise.resolve().then(() => (typeof task === "function" ? task() : task)).catch(() => undefined); }, 0); } };
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  try {
    const out = await nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
    SCOPE_RUNS += 1;
    return out;
  } catch (e) {
    if (/AsyncLocalStorage accessed in runtime/.test(String((e as Error)?.message ?? ""))) return fn();
    throw e;
  }
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-c53-${rand}`;
const IP = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
const DAY = 86_400_000;

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "MAJOR") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : `\n        — CONTRACT ${e}\n        — ACTUAL   ${a}`}`);
};
const cut = (v: unknown, n = 260) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const B = (v: Any) => (v === null || v === undefined ? null : Number(v));
type Res = { ok: boolean; v: Any; err: string; code: string; msg: string };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", msg: "" };
  try { return { ok: true, v: await fn(...args), err: "", code: "", msg: "" }; } catch (e) {
    const x = e as Any; const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), msg };
  }
};
const desc = (r: Res) => (r.ok ? `ok ${cut(j(r.v), 120)}` : r.err);
/** a section that threw marks every id it still owed red (with the exception text) — never silently skipped */
const section = async (name: string, ids: string[], sev: Record<string, Sev>, body: (done: Set<string>) => Promise<void>) => {
  if (!want(name)) { console.log(`\n── ${name} · skipped (--only) ──`); return; }
  console.log(`\n── ${name} ──`);
  const done = new Set<string>();
  const before = cks.length;
  try { await body(done); } catch (e) {
    for (let i = before; i < cks.length; i += 1) done.add(cks[i]!.id);
    for (const id of ids) if (!done.has(id)) chk(id, `${name} section ran`, false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n")[1] ?? ""}` : String(e), 400), sev[id] ?? "MAJOR");
  }
};

/** one finding's block: an exception reds only the id(s) of that block (a fix that changes a signature cannot take its neighbours down) */
const sub = async (ids: string | string[], body: () => Promise<void>) => {
  const list = Array.isArray(ids) ? ids : [ids];
  const before = cks.length;
  try { await body(); } catch (e) {
    const done = new Set(cks.slice(before).map((c) => c.id));
    for (const id of list) if (!done.has(id)) chk(id, "check ran", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e), 400), /-m\d/.test(id) ? "MINOR" : "MAJOR");
  }
};

const TENANTS: string[] = [];
const USERS: string[] = [];
const KEY_IDS: string[] = [];
const RATE_KEYS: string[] = [];
const JOB_NAMES = [`${TAG}-slow`, `${TAG}-tail`];
const SVIX_SECRET = `whsec_${Buffer.from(randomBytes(24)).toString("base64")}`;
const OLD_SVIX = process.env.RESEND_WEBHOOK_SECRET;
const OLD_ALLOW_PRIVATE = process.env.WEBHOOK_ALLOW_PRIVATE;
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;
/** extra narrowing of the process-local outbox guard (see OUTBOX GUARD) — a check sets it around its own drain */
const OUTBOX_EXTRA: { where: Record<string, unknown> } = { where: {} };

console.log(`\n═══ QC CRM v2 · C5.3 — verify & pin the C5.2 hunter findings (L1 authz · L2 money · L3 queues · L4 public · L5 PDPA · X cross-surface) ═══`);
console.log(`[env] DB ${host} · tag ${TAG} · won-value basis ${WON_BASIS} (Q14 pending)${ONLY.length ? ` · only ${ONLY.join(",")}` : ""}\n`);

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const coreHash = (await import("@/lib/core/hash" as string)) as Any;
  const ACCESS = (await import("@/lib/modules/crm/access" as string)) as Any;
  const STAFF_KEYS = Object.fromEntries(((ACCESS.CRM_ROLE_DEFAULTS?.STAFF ?? []) as string[]).map((k) => [k, true]));

  // ═════ orphan sweep: a previous run killed mid-way leaves `qc-c53-*` tenants/users and fake minute-job state rows — remove them first ═════
  //   only rows OLDER than 30 min (a concurrent run of this suite keeps its own) and job-state rows whose lease has expired
  {
    const OLD = new Date(Date.now() - 30 * 60_000);
    const orphans = ((await P.tenant.findMany({ where: { slug: { startsWith: "qc-c53-" }, createdAt: { lt: OLD } }, select: { id: true } })) as Any[]).map((r) => String(r.id)).filter((x) => /^[a-z0-9]+$/i.test(x));
    if (orphans.length) {
      const inList = orphans.map((x) => `'${x}'`).join(",");
      const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
      for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => undefined);
      for (const id of orphans) {
        await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
        await P.tenant.delete({ where: { id } }).catch(() => undefined);
      }
    }
    const ou = ((await P.user.findMany({ where: { email: { contains: "qc-c53-" }, createdAt: { lt: OLD } }, select: { id: true } })) as Any[]).map((r) => String(r.id));
    for (const id of ou) {
      await P.session.deleteMany({ where: { userId: id } }).catch(() => undefined);
      await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined);
      await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined);
      await P.user.delete({ where: { id } }).catch(() => undefined);
    }
    // minute-job state: `minute-job:{lease|run|ok}:<name>` — a fake job's rows go only when its lease row is released/expired (lastAlertAt ≤ now)
    const js = ((await P.opsAlertState.findMany({ where: { source: { contains: "qc-c53-" } }, select: { source: true, lastAlertAt: true } })) as Any[]);
    const nameOf = (src: string) => src.replace(/^minute-job:(lease|run|ok):/, "");
    const liveNames = new Set(js.filter((r) => String(r.source).startsWith("minute-job:lease:") && new Date(r.lastAlertAt).getTime() > Date.now()).map((r) => nameOf(String(r.source))));
    const deadSources = js.map((r) => String(r.source)).filter((src) => !liveNames.has(nameOf(src)));
    const oj = deadSources.length ? await P.opsAlertState.deleteMany({ where: { source: { in: deadSources } } }).catch(() => ({ count: 0 })) : { count: 0 };
    if (orphans.length || ou.length || oj.count) console.log(`[orphans] removed tenants=${orphans.length} users=${ou.length} jobState=${oj.count}`);
  }

  // ═════ shared fixture: ONE throwaway tenant · users · helpers ═════
  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  TENANTS.push(T);
  // OUTBOX GUARD (process-local, whole run): every outbox candidate query of THIS process — product drains woken by our own writes
  //   included — sees only this run's tenant (+ OUTBOX_EXTRA narrowing set by a check). Verified below before any drain happens.
  const OB_DLG = P.outboxEvent;
  const OB_FIND = OB_DLG.findMany;
  OB_DLG.findMany = (a: Any) => OB_FIND.call(OB_DLG, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: T }, OUTBOX_EXTRA.where] } });
  const guardProbe = (await (await import("@/lib/core/db" as string)).prisma.outboxEvent.findMany({ where: { status: "PENDING" }, select: { tenantId: true }, take: 20 })) as Any[];
  const GUARD_OK = P.outboxEvent.findMany !== OB_FIND && guardProbe.every((r) => r.tenantId === T);
  if (!GUARD_OK) throw new Error("outbox guard could not be installed — refusing to run (a drain could touch other tenants)");
  type Who = { userId: string; role: string; cookie: string; actor: Any; email: string };
  const mkUser = async (label: string, role: string, permissions: Record<string, unknown> = {}, unitAccess: string[] = ["*"], email?: string): Promise<Who> => {
    const mail = email ?? `${TAG}-${label}@qc.invalid`;
    const u = await P.user.create({ data: { email: mail, name: `QC ${label} ${TAG}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess, permissions, acceptedAt: new Date() } });
    const token = coreHash.randomToken(32) as string;
    await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
    return { userId: u.id, role, email: mail, cookie: `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${T}`, actor: { userId: u.id, role, unitAccess, permissions } };
  };
  const owner = await mkUser("owner", "OWNER");
  const thana = await mkUser("thana", "STAFF", { ...STAFF_KEYS });      // STAFF · default CRM keys · no team ⇒ sees OWN only (default TEAM)
  const rep = await mkUser("rep", "STAFF", { ...STAFF_KEYS });          // deal owner of the money fixtures
  const mgr = await mkUser("mgr", "MANAGER", { "crm.api.manage": true }); // MANAGER the owner granted crm.api.manage (only that)
  const bookkeeper = await mkUser("bookkeeper", "STAFF", { "account.contact.manage": true, "account.contact.read": true }); // no CRM key at all

  let sysSeq = 0;
  const setCrm = (S: string, crm: Record<string, unknown>) =>
    P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify(crm), S);
  const mkCrm = async (label: string, crm: Record<string, unknown> = {}, pipe: { autoWon?: boolean } = {}) => {
    const S = (await sysSvc.createSystem(T, "CRM", `${label} ${TAG} ${++sysSeq}`)).id as string;
    await setCrm(S, { uiVersion: 2, bridgesEnabled: true, commission: { approvalRequired: false, payrollLink: false }, ...crm });
    const p = await P.crmPipeline.create({
      data: {
        tenantId: T, systemId: S, name: `ขาย ${TAG}`, isDefault: true, autoWonOnPaid: !!pipe.autoWon,
        stages: { create: [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100], ["แพ้", "LOST", 0]].map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) },
      },
      include: { stages: true },
    });
    const st = p.stages as Any[];
    const ctx = { tenantId: T, systemId: S, actorUserId: owner.userId };
    return { S, ctx, pipe: p.id as string, OPEN: st.find((x) => x.kind === "OPEN").id as string, WON: st.find((x) => x.kind === "WON").id as string, LOST: st.find((x) => x.kind === "LOST").id as string };
  };
  type Sys = Awaited<ReturnType<typeof mkCrm>>;
  const mkContact = async (c: Sys, label: string, extra: Any = {}) => {
    const party = await P.party.create({ data: { tenantId: T, name: `${label} ${TAG}`, kind: "PERSON" } });
    return P.crmContact.create({ data: { tenantId: T, systemId: c.S, name: `${label} ${TAG}`, firstName: label, partyId: party.id, ownerUserId: owner.userId, ...extra } });
  };
  const grantEmail = (c: Sys, contactId: string) =>
    P.crmContactConsent.create({ data: { tenantId: T, systemId: c.S, contactId, channel: "EMAIL", granted: true, source: "STAFF", createdAt: new Date(Date.now() - 120_000) } });
  const mkDeal = (c: Sys, contactId: string, value: number, extra: Any = {}) =>
    P.crmDeal.create({ data: { tenantId: T, systemId: c.S, contactId, pipelineId: c.pipe, stageId: c.OPEN, title: `ดีล ${TAG}`, valueSatang: value, kind: "OPEN", ownerUserId: owner.userId, stageEnteredAt: new Date(), ...extra } });
  const ACC = `${TAG}-acc`; // account system id used by hand-built AccountDocument rows (the CRM reads them through the account facade)
  const doc = (data: Any) => P.accountDocument.create({ data: { tenantId: T, systemId: ACC, discountAmount: 0, ...data } });
  const pay = (documentId: string, amount: number) => P.accountDocumentPayment.create({ data: { tenantId: T, systemId: ACC, documentId, amount } });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const period = { from: `${month}-01`, to: today };
  const sentMail: Any[] = [];
  const transport = async (msg: Any) => { sentMail.push(msg); return { ok: true, providerId: `${TAG}-prov-${sentMail.length}-${randomBytes(3).toString("hex")}` }; };
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  type AR = { ok: boolean; code: string; msg: string; v: Any };
  const act = async (who: Who, fn: Any, ...args: Any[]): Promise<AR> => {
    if (typeof fn !== "function") return { ok: false, code: "MISSING_FUNCTION", msg: "missing", v: undefined };
    try {
      const v = await inScope(who.cookie, "/app/sys/x/crm", () => fn(...args));
      if (v && typeof v === "object" && "ok" in v) return { ok: (v as Any).ok === true, code: String((v as Any).code ?? ""), msg: String((v as Any).error ?? (v as Any).reason ?? ""), v };
      return { ok: true, code: "", msg: "", v };
    } catch (e) {
      const digest = String((e as Any)?.digest ?? "");
      if (digest.startsWith("NEXT_REDIRECT")) return { ok: true, code: "REDIRECT", msg: digest, v: null };
      const m = /NEXT_HTTP_ERROR_FALLBACK;(\d+)/.exec(digest);
      if (m) return { ok: false, code: m[1] === "404" ? "NOT_FOUND" : `HTTP_${m[1]}`, msg: "", v: null };
      return { ok: false, code: String((e as Any)?.code ?? (e as Any)?.name ?? "THROWN"), msg: e instanceof Error ? e.message : String(e), v: null };
    }
  };
  const aDesc = (r: AR) => (r.ok ? `ok${r.code ? `(${r.code})` : ""}` : `${r.code}:${cut(r.msg, 90)}`);

  // K.1 — the harness itself works (server-action scope + a CRM v2 system) — a red here means every later red is suspect
  {
    const c = await mkCrm("K");
    const ui = await call(CRM.crmUiVersion, { tenantId: T, systemId: c.S });
    const ctxMod = (await import("@/lib/core/context" as string)) as Any;
    const who = await act(thana, ctxMod.requireTenant);
    chk("C5.3-K.1", "harness: throwaway tenant + CRM system at uiVersion 2 + a staff cookie session resolves through requireTenant() inside the Next request scope",
      ui.ok && ui.v === 2 && who.ok && who.v?.active?.tenantId === T && SCOPE_RUNS > 0, "uiVersion 2 · requireTenant → this tenant", `ui=${desc(ui)} requireTenant=${aDesc(who)} tenant=${who.v?.active?.tenantId === T} scopeRuns=${SCOPE_RUNS}`, "CRITICAL");
  }

  // ═════════════════════════════════════════ L1 · AUTHORIZATION & SCOPE ═════════════════════════════════════════
  await section("L1", ["C5.3-L1-M1", "C5.3-L1-M2", "C5.3-L1-M3", "C5.3-L1-m1", "C5.3-L1-m2", "C5.3-L1-m3", "C5.3-L1-m4", "C5.3-L1-m5"],
    { "C5.3-L1-m1": "MINOR", "C5.3-L1-m2": "MINOR", "C5.3-L1-m3": "MINOR", "C5.3-L1-m4": "MINOR", "C5.3-L1-m5": "MINOR" }, async () => {
    // ── L1-M1 · v1 server actions on a uiVersion-2 system bypass visibility / v2 rules ──
    await sub("C5.3-L1-M1", async () => {
      const V1 = (await import(pathToFileURL(resolve("src/lib/modules/crm/actions.ts")).href)) as Any;
      const c = await mkCrm("L1-M1");
      const k = await mkContact(c, "ลูกค้าทีมอื่น");
      const d = await mkDeal(c, k.id, 500_000);
      const a = await P.crmActivity.create({ data: { tenantId: T, systemId: c.S, contactId: k.id, dealId: d.id, type: "TASK", title: `งาน ${TAG}`, ownerUserId: owner.userId, dueAt: new Date() } });
      // positive control: thana cannot see the deal through the v2 service
      const v2 = await call(CRM.deals.moveDeal, { ...c.ctx, actorUserId: thana.userId }, thana.actor, d.id, { stageId: c.LOST });
      const actsBefore = (await P.crmActivity.count({ where: { tenantId: T, systemId: c.S, dealId: d.id } })) as number;
      const rMove = await act(thana, V1.moveDealAction, fd({ systemId: c.S, dealId: d.id, stageId: c.LOST }));
      const rDone = await act(thana, V1.completeActivityAction, fd({ systemId: c.S, activityId: a.id }));
      const rAdd = await act(thana, V1.addActivityAction, fd({ systemId: c.S, title: `แทรก ${TAG}`, type: "NOTE", dealId: d.id, contactId: k.id }));
      const dNow = await P.crmDeal.findUnique({ where: { id: d.id }, select: { kind: true, stageId: true, lostReasonId: true } });
      const aNow = await P.crmActivity.findUnique({ where: { id: a.id }, select: { doneAt: true } });
      const actsAfter = (await P.crmActivity.count({ where: { tenantId: T, systemId: c.S, dealId: d.id } })) as number;
      const fixture = !v2.ok && /NOT_FOUND/.test(v2.err);
      chk("C5.3-L1-M1", "v1 server actions (crm/actions.ts) on a uiVersion-2 system: a STAFF (default keys, OWN/TEAM scope) who cannot see a deal/activity gets NOTHING done through moveDealAction (→ LOST without a lost reason) / completeActivityAction / addActivityAction",
        fixture && dNow?.kind === "OPEN" && dNow?.stageId === c.OPEN && !aNow?.doneAt && actsAfter === actsBefore,
        "fixture: v2 moveDeal as thana = NOT_FOUND · each v1 action on the v2 system is refused (FORBIDDEN Thai / redirect to v2) and changes 0 rows: deal stays OPEN, activity stays open, no new activity",
        `fixture(v2 moveDeal thana)=${desc(v2)} · move=${aDesc(rMove)} deal=${j(dNow)} · complete=${aDesc(rDone)} doneAt=${aNow?.doneAt ? "SET" : "null"} · add=${aDesc(rAdd)} activities ${actsBefore}→${actsAfter}`);
    });

    // ── L1-M2 · portal access survives "remove contact from company" ──
    await sub("C5.3-L1-M2", async () => {
      const CS = (await import("@/lib/modules/member/customer-session" as string)) as Any;
      const c = await mkCrm("L1-M2", { portal: { enabled: true, loginMethods: ["EMAIL_OTP"], showDeals: false, allowIssue: true } });
      const accSys = (await sysSvc.createSystem(T, "ACCOUNT", `ACC L1-M2 ${TAG}`)).id as string;
      const party = await P.party.create({ data: { tenantId: T, name: `บริษัท ${TAG}`, kind: "COMPANY" } });
      const ac = await P.accountContact.create({ data: { tenantId: T, systemId: accSys, kind: "CUSTOMER", legalType: "COMPANY", name: `บริษัท ${TAG}`, partyId: party.id } });
      const co = await P.crmCompany.create({ data: { tenantId: T, systemId: c.S, partyId: party.id, name: `บริษัท ${TAG}`, accountContactId: ac.id } });
      const ex = await mkContact(c, "อดีตพนักงาน", { email: `${TAG}-ex@qc.invalid`, companyId: co.id });
      const cur = await mkContact(c, "พนักงานปัจจุบัน", { email: `${TAG}-cur@qc.invalid`, companyId: co.id });
      for (const x of [ex, cur]) await P.crmCompanyContact.create({ data: { tenantId: T, companyId: co.id, contactId: x.id, isPrimary: x.id === cur.id } });
      await P.accountDocument.create({ data: { tenantId: T, systemId: accSys, docType: "QUOTATION", docNo: `${TAG}-Q1`, status: "AWAITING_ACCEPT", direction: "OUT", contactId: ac.id, subTotal: 5_000_000, grandTotal: 5_000_000, validUntil: new Date(Date.now() + 30 * DAY) } });
      const accEx = await P.crmPortalAccess.create({ data: { tenantId: T, systemId: c.S, companyId: co.id, contactId: ex.id, role: "APPROVE", invitedById: owner.userId, acceptedAt: new Date(), loginMethods: ["EMAIL_OTP"] } });
      const accCur = await P.crmPortalAccess.create({ data: { tenantId: T, systemId: c.S, companyId: co.id, contactId: cur.id, role: "VIEW", invitedById: owner.userId, acceptedAt: new Date(), loginMethods: ["EMAIL_OTP"] } });
      const s1 = await call(CS.mintPortalSession, accEx.id, {});
      const before = s1.ok ? await call(CRM.portal.listQuotations, s1.v.token) : s1;
      const rm = await call(CRM.companies.removeContact, c.ctx, owner.actor, co.id, ex.id);
      const link = await P.crmCompanyContact.findFirst({ where: { companyId: co.id, contactId: ex.id }, select: { endedAt: true } });
      const oldSess = s1.ok ? await call(CS.getPortalSession, s1.v.token) : s1;
      const s2 = await call(CS.mintPortalSession, accEx.id, {});
      const sCur = await call(CS.mintPortalSession, accCur.id, {});
      const lc = sCur.ok ? await call(CRM.portal.listContacts, sCur.v.token) : sCur;
      const listsEx = lc.ok && (lc.v?.items ?? []).some((x: Any) => x.id === ex.id);
      const fixture = s1.ok && before.ok && (before.v?.items?.length ?? 0) === 1 && rm.ok && !!link?.endedAt && sCur.ok && lc.ok;
      chk("C5.3-L1-M2", "portal access ends with the company link: after staff remove a contact from the company (CrmCompanyContact.endedAt set) the contact's existing portal session is dead, a new one cannot be minted, and the company's contact list no longer shows the ex-employee to other portal users",
        fixture && !oldSess.v && !s2.ok && !listsEx,
        "fixture: session reads 1 quotation · removeContact ok · endedAt set · then getPortalSession(old) = null · mintPortalSession refused · listContacts (co-worker's session) excludes the ex-employee",
        `fixture: s1=${s1.ok} quotes=${before.ok ? before.v?.items?.length : before.err} remove=${desc(rm)} endedAt=${!!link?.endedAt} · oldSession=${oldSess.ok ? (oldSess.v ? "VALID" : "null") : oldSess.err} · newMint=${s2.ok ? "MINTED" : s2.err} · listContacts shows ex=${listsEx}`);
    });

    // ── L1-M3 · account module reads/rewires CRM contacts with no CRM key and no visibility ──
    await sub("C5.3-L1-M3", async () => {
      const ACCA = (await import(pathToFileURL(resolve("src/lib/modules/account/actions.ts")).href)) as Any;
      // findLinkedSystemIds picks the FIRST CRM system of the tenant ⇒ this check runs in its own tenant-level context: use the oldest CRM system (K)
      const firstCrm = (await P.appSystem.findFirst({ where: { tenantId: T, type: "CRM" }, orderBy: { createdAt: "asc" }, select: { id: true } }))!.id as string;
      const accSys = (await sysSvc.createSystem(T, "ACCOUNT", `ACC L1-M3 ${TAG}`)).id as string;
      const phone = `08${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
      const pOrig = await P.party.create({ data: { tenantId: T, name: `ลูกค้า CRM ${TAG}`, kind: "PERSON" } });
      const crmC = await P.crmContact.create({ data: { tenantId: T, systemId: firstCrm, name: `ลูกค้า CRM ${TAG}`, firstName: "ลูกค้า", phone, partyId: pOrig.id, ownerUserId: owner.userId } });
      const pOther = await P.party.create({ data: { tenantId: T, name: `ผู้ติดต่อบัญชี ${TAG}`, kind: "PERSON" } });
      const accC = await P.accountContact.create({ data: { tenantId: T, systemId: accSys, kind: "CUSTOMER", legalType: "PERSON", name: `ผู้ติดต่อบัญชี ${TAG}`, partyId: pOther.id } });
      const sug = await act(bookkeeper, ACCA.suggestContactLinksAction, accSys, { phone });
      const crmRows = sug.ok ? (sug.v?.crm ?? []) : [];
      const link = await act(bookkeeper, ACCA.linkContactAction, accSys, { contactId: accC.id, target: "crm", targetId: crmC.id });
      const after = await P.crmContact.findUnique({ where: { id: crmC.id }, select: { partyId: true } });
      const crmCanRead = ACCESS.crmCan(bookkeeper.actor, "crm.contact.read");
      chk("C5.3-L1-M3", "account → CRM facade honours CRM authz: a bookkeeper with account.contact.manage and NO CRM key gets no CRM contact rows from suggestContactLinksAction and cannot rewire CrmContact.partyId through linkContactAction(target crm)",
        crmCanRead === false && sug.ok && crmRows.length === 0 && after?.partyId === pOrig.id,
        "fixture: crmCan(bookkeeper, crm.contact.read) = false · suggestions carry 0 CRM rows · link to crm refused (ok:false Thai) and CrmContact.partyId unchanged (also: a different existing partyId is never overwritten silently)",
        `crmCan=${crmCanRead} · suggest=${aDesc(sug)} crmRows=${j(crmRows.map((r: Any) => r.label))} · link=${aDesc(link)} partyId ${after?.partyId === pOrig.id ? "unchanged" : after?.partyId === pOther.id ? "OVERWRITTEN→account party" : after?.partyId}`);
    });

    // ── L1-m1 · crm.api.manage holder mints a crm.admin key (escalation) ──
    await sub("C5.3-L1-m1", async () => {
      const APIACT = (await import(pathToFileURL(resolve("src/app/app/sys/[id]/crm/settings/api/actions.ts")).href)) as Any;
      const c = await mkCrm("L1-m1");
      const r = await act(mgr, APIACT.createCrmApiKeyAction, fd({ systemId: c.S, name: `escalate ${TAG}`, bundle: "crm.admin" }));
      const keys = (await P.apiKey.findMany({ where: { tenantId: T, systemId: c.S }, select: { id: true, scopesJson: true } })) as Any[];
      for (const k of keys) KEY_IDS.push(k.id);
      const adminKey = keys.some((k) => j(k.scopesJson).includes("crm.visibility.manage"));
      const fixture = ACCESS.crmCan(mgr.actor, "crm.api.manage") === true && ACCESS.crmCan(mgr.actor, "crm.visibility.manage") === false;
      chk("C5.3-L1-m1", "a MANAGER who was granted only crm.api.manage cannot mint a key wider than his own CRM keys (crm.admin carries the 5 owner-only settings keys + ALL visibility)",
        fixture && !r.ok && !adminKey,
        "fixture: crmCan(mgr, crm.api.manage)=true · crmCan(mgr, crm.visibility.manage)=false · createCrmApiKeyAction(bundle crm.admin) refused (ok:false Thai) and no key row carrying crm.visibility.manage exists (crm.admin only for OWNER, or bundle ⊆ creator's keys)",
        `fixture=${fixture} · action=${aDesc(r)} · adminKeyCreated=${adminKey}`, "MINOR");
    });

    // ── L1-m2 · team-filtered API key reads the whole "unmatched" mailbox ──
    await sub("C5.3-L1-m2", async () => {
      const ACT = (await import("@/lib/modules/crm/api/actor" as string)) as Any;
      const SC = (await import("@/lib/api-keys/scopes" as string)) as Any;
      const B32 = "abcdefghijklmnopqrstuvwxyz234567";
      const KEY = Array.from(randomBytes(8)).map((b) => B32[b % 32]).join("");
      const c = await mkCrm("L1-m2", { email: { inboundKey: KEY, inboundEnabled: true, bccCaptureEnabled: true, strangerToLead: false, fromMode: "SHARK", replyToMode: "SHARK", copyMode: "NONE" } });
      const team = await P.team.create({ data: { tenantId: T, name: `ทีม m2 ${TAG}` } });
      const ing = await call(CRM.emails.ingestInbound, { messageId: `<${TAG}-m2@stranger.example>`, from: `stranger-${rand}@stranger.example`, to: [`crm+${KEY}@shark.in.th`], cc: [], subject: `ข้อมูลภายใน ${TAG}`, text: "สัญญาลับ", html: "<p>สัญญาลับ</p>", headers: {}, attachments: [] });
      const bundle = (id: string) => [...((SC.API_SCOPE_BUNDLES as Any[]).find((b) => b.id === id)?.scopes ?? [])] as string[];
      const own = await call(CRM.emails.listThreads, c.ctx, owner.actor, { unmatched: true });
      const fixture = ing.ok && ing.v?.handled === true && own.ok && (own.v?.items?.length ?? 0) >= 1;
      const out: string[] = [];
      let leaks = 0; let keysOk = true;
      // both key shapes the hunter traced: an admin key (actor role MANAGER ⇒ early return) and an operate key (API actor ⇒ visibility ALL)
      for (const b of ["crm.admin", "crm.operate"]) {
        const keyActor = ACT.crmActorForKey({ keyId: `${TAG}-k-${b}`, scopes: [...bundle(b), `crm.filter.team:${team.id}`], createdById: owner.userId });
        const canRead = ACCESS.crmCan(keyActor, "crm.email.read");
        if (!canRead) keysOk = false;
        const r = await call(CRM.emails.listThreads, { ...c.ctx, actorUserId: null }, keyActor, { unmatched: true });
        const n = r.ok ? (r.v?.items?.length ?? 0) : 0;
        if (n > 0) leaks += 1;
        out.push(`${b}+team-filter (email.read=${canRead}): ${r.ok ? `${n} unmatched thread(s)` : r.err}`);
      }
      chk("C5.3-L1-m2", "an API key narrowed by crm.filter.team: (R-C.3 \"narrow only\") cannot open the system-wide \"unmatched\" mailbox",
        fixture && keysOk && leaks === 0,
        "fixture: a stranger's inbound mail is unmatched (owner sees it) · both team-filtered keys hold crm.email.read · listThreads({unmatched:true}) as either key = FORBIDDEN (or 0 items)",
        `fixture: ingest=${desc(ing)} ownerUnmatched=${own.ok ? own.v?.items?.length : own.err} · ${out.join(" · ")}`, "MINOR");
    });

    // ── L1-m3 · STAFF can set his "from" override to a customer's address ──
    await sub("C5.3-L1-m3", async () => {
      const c = await mkCrm("L1-m3");
      const cust = await mkContact(c, "ลูกค้าจีเมล", { email: `buyer-${rand}@gmail-like.example` });
      const r = await call(CRM.emails.setUserSetting, { ...c.ctx, actorUserId: thana.userId }, thana.actor, { fromAddr: cust.email });
      const row = await P.crmEmailUserSetting.findFirst({ where: { systemId: c.S, userId: thana.userId }, select: { fromAddr: true } });
      chk("C5.3-L1-m3", "a STAFF cannot set his personal From override to an address that is not on a VERIFIED sending domain of the shop (here: a CRM contact's own gmail) — otherwise that customer's genuine replies are stored as OUT \"sent by staff\"",
        !r.ok && /VALIDATION|FORBIDDEN/.test(r.err) && !row?.fromAddr,
        "setUserSetting({fromAddr: <contact's e-mail on an unverified domain>}) refused (VALIDATION Thai) and nothing stored",
        `setUserSetting=${desc(r)} stored=${row?.fromAddr ?? "-"}`, "MINOR");
    });

    // ── L1-m4 · automation NOTIFY_STAFF ignores the recipient's visibility ──
    await sub("C5.3-L1-m4", async () => {
      const c = await mkCrm("L1-m4");
      const K = (await sysSvc.createSystem(T, "KANBAN", `KB L1-m4 ${TAG}`)).id as string;
      const board = await P.kanbanBoard.create({ data: { tenantId: T, systemId: K, name: `บอร์ดทีม ${TAG}` } });
      await P.kanbanColumn.create({ data: { tenantId: T, systemId: K, boardId: board.id, name: "ToDo" } });
      const x = await mkContact(c, `ความลับ${rand}`);
      const rule = await call(CRM.automation.createRule, c.ctx, owner.actor, { name: `แจ้ง ${TAG}`, trigger: { event: "crm.contact.updated" },
        actions: [{ type: "NOTIFY_STAFF", params: { userIds: [thana.userId, owner.userId], text: "lead ใหม่ {ชื่อ}" } }, { type: "OPEN_KANBAN_CARD", params: { boardId: board.id, title: "โทรหา {ชื่อ}" } }], enabled: true });
      const seeThana = await call(CRM.visibility.canSee, c.ctx, thana.actor, "CONTACT", x.id);
      const fired = await call(CRM.automation.runForCrmEvent, { tenantId: T, systemId: c.S, type: "crm.contact.updated", payload: { contactId: x.id, changedKeys: ["tags"] }, id: `${TAG}-m4`, idempotencyKey: `crm.contact.updated#${x.id}#${rand}` });
      const notesOf = async (uid: string) => ((await P.appNotification.findMany({ where: { tenantId: T, recipientUserId: uid, body: { contains: c.S } }, select: { title: true, body: true } })) as Any[]);
      const leaked = (await notesOf(thana.userId)).filter((n) => String(n.title).includes(`ความลับ${rand}`));
      const ownerGot = (await notesOf(owner.userId)).length; // positive control: a recipient who CAN see the contact is still notified
      const cards = (await P.kanbanCard.findMany({ where: { tenantId: T, systemId: K }, select: { title: true } })) as Any[];
      const cardLeak = cards.filter((k) => String(k.title).includes(`ความลับ${rand}`)).length;
      chk("C5.3-L1-m4", "automation output respects CRM visibility (C2.10 \"ผู้รับถูกกรอง ไม่ใช่เชื่อ\"): NOTIFY_STAFF gives a named recipient who cannot see the contact no notification carrying its name (a recipient who can see it still gets one), and OPEN_KANBAN_CARD does not render the contact's name into a card title on a shared board",
        rule.ok && fired.ok && seeThana.ok && seeThana.v === false && ownerGot >= 1 && cards.length >= 1 && leaked.length === 0 && cardLeak === 0,
        "fixture: rule (NOTIFY_STAFF → [thana, owner] + OPEN_KANBAN_CARD) · canSee(thana, contact)=false · control: owner notified, card opened ⇒ thana has 0 notifications rendering {ชื่อ} · 0 card titles with the name (link/ids instead — owner may rule a visibility-aware alternative)",
        `rule=${desc(rule)} canSee=${desc(seeThana)} fired=${desc(fired)} · ownerNotified=${ownerGot} · thana notifications with the name=${leaked.length} ${cut(j(leaked.map((n) => n.title)), 100)} · cards=${cards.length} withName=${cardLeak}`, "MINOR");
    });

    // ── L1-m5 · customer-facing member history shows internal CRM deal data (PROD NOW: bridge has no uiVersion gate) ──
    await sub("C5.3-L1-m5", async () => {
      const MB = (await import("@/lib/member-bridges" as string)) as Any;
      const ACTV = (await import("@/lib/modules/member/activity" as string)) as Any;
      const CS = (await import("@/lib/modules/member/customer-session" as string)) as Any;
      const M = (await sysSvc.createSystem(T, "MEMBER", `MEM ${TAG}`)).id as string;
      const c = await mkCrm("L1-m5", { uiVersion: 1 }); // a v1 shop — what every prod shop is today
      const pty = await P.party.create({ data: { tenantId: T, name: `สมาชิก ${TAG}`, kind: "PERSON" } });
      const cust = await P.customer.create({ data: { tenantId: T, memberSystemId: M, name: `สมาชิก ${TAG}`, partyId: pty.id, status: "ACTIVE" } });
      const k = await P.crmContact.create({ data: { tenantId: T, systemId: c.S, name: `สมาชิก ${TAG}`, partyId: pty.id, ownerUserId: owner.userId } });
      const d = await mkDeal(c, k.id, 12_345_600, { title: `ดีลภายใน-กำไร40%-${rand}`, kind: "WON", stageId: c.WON, closedAt: new Date() });
      const br = await call(MB.onCrmDealWon, { id: `${TAG}-won`, tenantId: T, type: "crm.deal.won", payload: { dealId: d.id }, systemId: c.S });
      const rows = await P.memberActivity.count({ where: { tenantId: T, customerId: cust.id, module: "crm" } });
      const list = await call(ACTV.listActivity, { tenantId: T, systemId: M, actorUserId: null }, CS.customerActor(cust.id), cust.id, { take: 30 });
      const leaks = list.ok ? (list.v.items as Any[]).filter((i) => i.module === "crm" || i.module === "crm.object" || String(i.summary).includes(`กำไร40%-${rand}`)) : [];
      chk("C5.3-L1-m5", "the customer-facing member timeline (/m/[slug]/history → listActivity with the CUSTOMER actor) shows no internal CRM rows (deal title / value / stage names / custom-record titles)",
        br.ok && rows >= 1 && list.ok && leaks.length === 0,
        "fixture: the real crm.deal.won member bridge wrote its DEAL_WON row · the CUSTOMER read returns 0 items of module crm / crm.object (or a customer-safe summary without title/value)",
        `bridge=${desc(br)} crmRows=${rows} · customer read=${list.ok ? `${leaks.length} leak(s) ${cut(j(leaks.map((l: Any) => l.summary)), 140)}` : list.err}`, "MINOR");
    });
  });

  // ═════════════════════════════════════════ L2 · MONEY & NUMBERS ═════════════════════════════════════════
  await section("L2", ["C5.3-L2-M1", "C5.3-L2-M2", "C5.3-L2-M3", "C5.3-L2-m1", "C5.3-L2-m2", "C5.3-L2-m4"], { "C5.3-L2-m1": "MINOR", "C5.3-L2-m2": "MINOR", "C5.3-L2-m4": "MINOR" }, async () => {
    const PAYS = CRM.payments;
    const CORE = (await import("@/lib/platform/crm-bridges/core" as string)) as Any;
    // ── L2-M1 · reps "commission" = gross (clawback row dropped) ──
    await sub("C5.3-L2-M1", async () => {
      const c = await mkCrm("L2-M1");
      const k = await mkContact(c, "ลูกค้า M1");
      const d = await mkDeal(c, k.id, 5_000_000, { ownerUserId: rep.userId });
      const rule = await P.crmCommissionRule.create({ data: { tenantId: T, systemId: c.S, name: `กฎ ${TAG}`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [] } });
      // the exact rows commissions.reverseRows leaves behind when the payment behind a PAID row is voided (commissions.ts:717-735)
      const orig = await P.crmCommission.create({ data: { tenantId: T, systemId: c.S, dealId: d.id, ruleId: rule.id, userId: rep.userId, amountSatang: BigInt(500_000), basisSatang: BigInt(5_000_000), basis: "PAID", status: "PAID", periodKey: month, refType: "DEAL_PAYMENT", refId: `${TAG}-pay#c1` } });
      await P.crmCommission.create({ data: { tenantId: T, systemId: c.S, dealId: d.id, ruleId: rule.id, userId: rep.userId, amountSatang: BigInt(-500_000), basisSatang: BigInt(-5_000_000), basis: "PAID", status: "REVERSED", periodKey: month, refType: "REVERSAL", refId: orig.id, reversedOfId: orig.id, decidedAt: new Date() } });
      const r = await call(CRM.reports.reps, c.ctx, owner.actor, period);
      const cr = await call(CRM.commissions.report, c.ctx, owner.actor, { periodKey: month });
      const repRow = r.ok ? (r.v.rows as Any[]).find((x) => x.key === rep.userId) : null;
      const netRow = cr.ok ? (cr.v.rows as Any[]).find((x) => x.userId === rep.userId) : null;
      chk("C5.3-L2-M1", "reports.reps commissionSatang is NET of clawbacks and equals commissions.report netSatang for the same rep and period (also feeds the reps CSV and scheduled report mails)",
        r.ok && cr.ok && netRow?.netSatang === 0 && repRow?.commissionSatang === netRow?.netSatang,
        "fixture: rep has PAID 500,000 + its REVERSED −500,000 clawback · commissions.report net = 0 · reports.reps commissionSatang = 0 (same definition)",
        `reps.commissionSatang=${repRow ? repRow.commissionSatang : r.ok ? "no row" : r.err} · commissions.report net=${netRow ? netRow.netSatang : cr.ok ? "no row" : cr.err}`);
    });

    // ── L2-M2 / M3 · deposit deduction understates won value · credit note invisible ──
    await sub(["C5.3-L2-M2","C5.3-L2-M3"], async () => {
      const c = await mkCrm("L2-M2");
      const k = await mkContact(c, "ลูกค้า M2");
      const Q = await doc({ docType: "QUOTATION", status: "ACCEPTED", subTotal: 10_000_000, vatAmount: 700_000, grandTotal: 10_700_000 });
      const DR = await doc({ docType: "DEPOSIT_RECEIPT", status: "AWAITING_PAYMENT", sourceDocId: Q.id, subTotal: 3_000_000, vatAmount: 210_000, grandTotal: 3_210_000 });
      // account totals.ts:125 — an invoice that deducts the deposit carries grand = grandBeforeDeposit − depositDeducted
      const INV = await doc({ docType: "INVOICE", status: "AWAITING_PAYMENT", sourceDocId: Q.id, subTotal: 10_000_000, vatAmount: 700_000, depositDeducted: 3_210_000, grandTotal: 7_490_000 });
      const d = await mkDeal(c, k.id, 10_000_000, { quotationDocId: Q.id, ownerUserId: rep.userId });
      await P.crmCommissionRule.create({ data: { tenantId: T, systemId: c.S, name: `กฎ M3 ${TAG}`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [] } });
      const pDR = await pay(DR.id, 3_210_000);
      const r1 = await call(PAYS.recordDocPayment, c.ctx, { documentId: DR.id, paymentId: pDR.id, amountSatang: 3_210_000 });
      const s1 = await P.crmDeal.findUnique({ where: { id: d.id }, select: { paidSatang: true, wonValueSatang: true } });
      const ln = await call(CRM.deals.linkInvoiceFromBridge, c.ctx, { quotationDocId: Q.id, invoiceDocId: INV.id });
      const pINV = await pay(INV.id, 7_490_000);
      const r2 = await call(PAYS.recordDocPayment, c.ctx, { documentId: INV.id, paymentId: pINV.id, amountSatang: 7_490_000 });
      const mv = await call(CRM.deals.moveDeal, c.ctx, owner.actor, d.id, { stageId: c.WON });
      const s3 = await P.crmDeal.findUnique({ where: { id: d.id }, select: { kind: true, paidSatang: true, wonValueSatang: true } });
      const fixture = r1.ok && r1.v?.counted && ln.ok && r2.ok && r2.v?.counted && mv.ok && s3?.kind === "WON" && B(s3?.paidSatang) === 10_700_000;
      const won = B(s3?.wonValueSatang);
      chk("C5.3-L2-M2", "won value is not understated by a deducted deposit: quotation 107,000 → deposit 32,100 paid → invoice (deposit deducted, grand 74,900) paid → WON ⇒ wonValueSatang is the full deal on ONE basis (pre-VAT 10,000,000 or VAT-incl 10,700,000 — basis ruled by Q14 / checked in X1), never 7,490,000",
        fixture && (won === 10_000_000 || won === 10_700_000),
        "fixture: both payments counted · WON · paid 10,700,000 ⇒ wonValueSatang ∈ {10,000,000 (pre-VAT), 10,700,000 (VAT-incl)}",
        `fixture: dr=${desc(r1)} afterDeposit won=${B(s1?.wonValueSatang)} link=${desc(ln)} inv=${desc(r2)} move=${mv.ok ? "ok" : mv.err} kind=${s3?.kind} paid=${B(s3?.paidSatang)} · wonValueSatang=${won}`);

      // L2-M3 · credit note 1,070,000 (1,000,000 + VAT) on the paid invoice, delivered through the real account.document.issued consumer
      const CN = await doc({ docType: "CREDIT_NOTE", status: "ISSUED", sourceDocId: INV.id, subTotal: 1_000_000, vatAmount: 70_000, grandTotal: 1_070_000 });
      const [yy, mm] = month.split("-").map(Number) as [number, number];
      const nextMonth = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
      const commNet = async () => {
        let n = 0;
        for (const pk of [month, nextMonth]) { const r = await CRM.commissions.report(c.ctx, owner.actor, { periodKey: pk }); n += Number((r.rows as Any[]).find((x) => x.userId === rep.userId)?.netSatang ?? 0); }
        return n;
      };
      const before = await P.crmDeal.findUnique({ where: { id: d.id }, select: { paidSatang: true, wonValueSatang: true } });
      const commBefore = await commNet();
      const br = await call(CORE.onDocumentIssued, { id: `${TAG}-cn`, tenantId: T, type: "account.document.issued", payload: { documentId: CN.id } });
      const s4 = await P.crmDeal.findUnique({ where: { id: d.id }, select: { paidSatang: true, wonValueSatang: true } });
      const commAfter = await commNet();
      const paidDrop = (B(before?.paidSatang) ?? 0) - (B(s4?.paidSatang) ?? 0);
      const wonDrop = (B(before?.wonValueSatang) ?? 0) - (B(s4?.wonValueSatang) ?? 0);
      const EXP_WON_DROP = WON_BASIS === "PRE_VAT" ? 1_000_000 : 1_070_000;
      chk("C5.3-L2-M3", "ONE credit-note rule (controller SF1): a CREDIT_NOTE issued against a deal's invoice lowers paid by its grand (1,070,000) AND won value by its basis part AND claws back the PAID-basis commission on its pre-VAT part (10 % × 1,000,000 = 100,000); quota follows paid (X1)",
        br.ok && fixture && commBefore === 1_000_000 && paidDrop === 1_070_000 && wonDrop === EXP_WON_DROP && commBefore - commAfter === 100_000,
        `fixture: PAID 10 % rule gave 1,000,000 commission (this + next period) ⇒ after account.document.issued(CREDIT_NOTE): paid −1,070,000 · won −${EXP_WON_DROP} (${WON_BASIS}, Q14) · commission net −100,000 (voiding the credit note reverses all three)`,
        `bridge=${desc(br)} · paid ${B(before?.paidSatang)}→${B(s4?.paidSatang)} · won ${B(before?.wonValueSatang)}→${B(s4?.wonValueSatang)} · commission ${commBefore}→${commAfter} (unchanged = credit note invisible)`);
    });

    // ── L2-m1 · home "weighted" counts OMITTED deals ──
    await sub("C5.3-L2-m1", async () => {
      const c = await mkCrm("L2-m1");
      const k = await mkContact(c, "ลูกค้า m1");
      // values that are NOT multiples of 100: 20 % of 1,000,003 = 200,000.6 ⇒ per-deal rounding (board/reports) gives 400,002; rounding once gives 400,001
      await mkDeal(c, k.id, 1_000_003, { forecastCategory: "OMITTED" });
      await mkDeal(c, k.id, 1_000_003);
      await mkDeal(c, k.id, 1_000_003);
      const kp = await call(CRM.home.kpis, c.ctx, owner.actor, {});
      const ov = await call(CRM.reports.overview, c.ctx, owner.actor, {});
      const bd = await call(CRM.deals.getBoard, c.ctx, owner.actor, {});
      const boardW = bd.ok ? (bd.v.columns as Any[]).reduce((s, x) => s + Number(x.weightedSatang ?? 0), 0) : null;
      const home = kp.ok ? kp.v.weighted?.valueSatang : null;
      chk("C5.3-L2-m1", "home KPI \"ถ่วงน้ำหนัก\" equals the board and reports.overview weighted pipeline (OMITTED deals excluded everywhere, same rounding)",
        kp.ok && ov.ok && bd.ok && ov.v.weightedSatang === 400_002 && boardW === 400_002 && home === 400_002,
        "fixture: open 1,000,003 OMITTED + 2 × open 1,000,003 normal, all 20 % ⇒ board = reports = home = 400,002 (OMITTED excluded, rounded per deal)",
        `home=${kp.ok ? home : kp.err} reports=${ov.ok ? ov.v.weightedSatang : ov.err} board=${bd.ok ? boardW : bd.err}`, "MINOR");
    });

    // ── L2-m2 · autoWonOnPaid compares VAT-incl cash with pre-VAT value ──
    await sub("C5.3-L2-m2", async () => {
      const c = await mkCrm("L2-m2", {}, { autoWon: true });
      const k = await mkContact(c, "ลูกค้า m2");
      const INV = await doc({ docType: "INVOICE", status: "AWAITING_PAYMENT", subTotal: 10_000_000, vatAmount: 700_000, grandTotal: 10_700_000 });
      const d = await mkDeal(c, k.id, 10_000_000, { invoiceDocId: INV.id });
      const p1 = await pay(INV.id, 10_000_000);
      const r = await call(PAYS.recordDocPayment, c.ctx, { documentId: INV.id, paymentId: p1.id, amountSatang: 10_000_000 });
      const s = await P.crmDeal.findUnique({ where: { id: d.id }, select: { kind: true, paidSatang: true } });
      // positive control: the remaining 700,000 arrives ⇒ now the invoice is paid in full and autoWon must fire
      const p2 = await pay(INV.id, 700_000);
      const r2 = await call(PAYS.recordDocPayment, c.ctx, { documentId: INV.id, paymentId: p2.id, amountSatang: 700_000 });
      const s2 = await P.crmDeal.findUnique({ where: { id: d.id }, select: { kind: true, paidSatang: true } });
      chk("C5.3-L2-m2", "autoWonOnPaid moves a deal to WON only when the anchor document is paid in full: invoice 107,000 (100,000 + VAT) with a first instalment of 100,000 leaves the deal OPEN (7,000 still owed); the remaining 7,000 makes it WON",
        r.ok && r.v?.counted && B(s?.paidSatang) === 10_000_000 && s?.kind === "OPEN" && r2.ok && s2?.kind === "WON",
        "fixture: payment counted (paid 10,000,000) ⇒ deal OPEN · control: + 700,000 (paid 10,700,000 = invoice total) ⇒ WON (owner rules the exact comparison — Q14)",
        `record#1=${desc(r)} paid=${B(s?.paidSatang)} kind=${s?.kind} · record#2=${r2.ok ? "ok" : r2.err} paid=${B(s2?.paidSatang)} kind=${s2?.kind}`, "MINOR");
    });

    // ── L2-m4 · REST line schema rejects vatRateBp −1 (VAT exempt) that the service accepts ──
    await sub("C5.3-L2-m4", async () => {
      const OPS = (await import("@/lib/modules/crm/api/ops/deals" as string)) as Any;
      const DS = (await import("@/lib/modules/crm/deals-shared" as string)) as Any;
      const op = (OPS.DEALS_OPS as Any[]).find((o) => o.id === "deals.lines.set");
      const line = { name: `ยกเว้นภาษี ${TAG}`, qty: 1, unitPriceSatang: 100_000, vatRateBp: -1 };
      const parsed = op?.input?.safeParse({ lines: [line] });
      const svc = typeof DS.checkDealLines === "function" ? DS.checkDealLines([line], null) : null;
      const svcOk = svc === null ? null : svc.ok === true;
      chk("C5.3-L2-m4", "the REST/AI line schema accepts what the service and the screen accept: vatRateBp −1 (ยกเว้นภาษี) passes deals.lines.set input validation",
        !!op && parsed?.success === true,
        "fixture: service line check accepts −1 · REST schema deals.lines.set parses {vatRateBp:-1}",
        `op=${op ? op.id : "missing"} · schema=${parsed?.success ? "accepts" : `rejects ${cut(j(parsed?.error?.issues?.map((i: Any) => i.message)), 100)}`} · service=${svcOk === null ? "n/a" : svcOk ? "accepts" : `rejects ${cut(svc?.error, 80)}`}`, "MINOR");
    });
  });

  // ═════════════════════════════════════════ L3 · QUEUES · CRON · REDELIVERY · RACES ═════════════════════════════════════════
  await section("L3", ["C5.3-L3-M1", "C5.3-L3-M1b", "C5.3-L3-M1c", "C5.3-L3-M2", "C5.3-L3-M3", "C5.3-L3-M4", "C5.3-L3-m1", "C5.3-L3-m2", "C5.3-L3-m4"], { "C5.3-L3-m1": "MINOR", "C5.3-L3-m2": "MINOR", "C5.3-L3-m4": "MINOR" }, async () => {
    const SEQ = CRM.sequences;
    const BR = (await import("@/lib/platform/crm-bridges/sequences" as string)) as Any;
    const OPENW = { businessDaysOnly: false, sendWindow: null };
    const EMAIL = (subject: string) => ({ kind: "EMAIL", subject, body: "เรียนคุณ {{contact.firstName}}" });
    const enrollOne = async (c: Sys, name: string, contactId: string, dealId?: string) => {
      const s = await SEQ.createSequence(c.ctx, owner.actor, { name: `${name} ${TAG}`, stopOnReply: true, stopOnWon: true, stopOnLost: true, ...OPENW, steps: [EMAIL("ขั้นที่หนึ่ง"), EMAIL("ขั้นที่สอง")] });
      const seqId = (s?.id ?? s?.sequence?.id) as string;
      const r = await SEQ.enroll(c.ctx, owner.actor, { sequenceId: seqId, contactId, ...(dealId ? { dealId } : {}) });
      return ((r?.enrollmentId ?? r?.enrollment?.id ?? r?.id) as string | undefined) ?? ((await P.crmSequenceEnrollment.findFirst({ where: { sequenceId: seqId, contactId }, select: { id: true } }))?.id as string);
    };
    const enr = (id: string) => P.crmSequenceEnrollment.findUnique({ where: { id }, select: { status: true, stepIndex: true, stoppedReason: true, stats: true } });

    // ── L3-M1 · no send-time WON/LOST guard (event not drained · bridges off) ──
    await sub("C5.3-L3-M1", async () => {
      const out: string[] = [];
      let bad = 0;
      let fixtureOk = true;
      for (const bridges of [true, false]) {
        const c = await mkCrm(`L3-M1-${bridges ? "on" : "off"}`, { bridgesEnabled: bridges });
        const k = await mkContact(c, bridges ? "ต่อดีลB" : "ต่อดีลC", { email: `${TAG}-m1-${bridges ? "b" : "c"}@qc.invalid` });
        await grantEmail(c, k.id);
        const d = await mkDeal(c, k.id, 100_000);
        const eid = await enrollOne(c, `ดีล ${bridges}`, k.id, d.id);
        const mv = await call(CRM.deals.moveDeal, c.ctx, owner.actor, d.id, { stageId: c.WON });
        const ev = await P.outboxEvent.findFirst({ where: { tenantId: T, systemId: c.S, type: "crm.deal.won" }, select: { id: true, status: true, payload: true, systemId: true, unitId: true } });
        if (!bridges && ev) await call(BR.onDealWonStopSequences, { id: ev.id, tenantId: T, type: "crm.deal.won", payload: ev.payload, systemId: ev.systemId, unitId: ev.unitId });
        const sent: Any[] = [];
        const rec = async (r: Any) => { sent.push(r.channel); return { ok: true }; };
        const run = await call(SEQ.runDue, new Date(Date.now() + 1_000), { deps: { email: rec, line: rec, sms: rec }, tenantIds: [T], systemIds: [c.S] });
        const e = await enr(eid);
        if (!(mv.ok && ev && run.ok)) fixtureOk = false;
        if (sent.length > 0 || e?.stoppedReason !== "WON") bad += 1;
        out.push(`bridges=${bridges}: move=${mv.ok ? "ok" : mv.err} wonEvent=${ev?.status ?? "none"} sent=${sent.length} enrollment=${j({ status: e?.status, step: e?.stepIndex, stoppedReason: e?.stoppedReason })}`);
      }
      chk("C5.3-L3-M1", "a stopOnWon sequence sends NOTHING after its deal was WON — checked at send time, not only by the crm.deal.won consumer (event still PENDING) and not gated by bridgesEnabled (consumer ran, bridges off)",
        fixtureOk && bad === 0,
        "fixture: deal moved to WON · crm.deal.won exists · runDue(tenant) ⇒ 0 sends and the enrollment is STOPPED with reason WON, in both cases",
        out.join(" · "));
    });

    // ── L3-M1b · CRM writes never wake the outbox (behaviour) · L3-M1c the kernel comment "hourly cron picks up" (source) ──
    await sub(["C5.3-L3-M1b", "C5.3-L3-M1c"], async () => {
      const hourlySrc = stripComments(read("src/app/api/cron/hourly/route.ts"));
      const hourlyDrains = /\b(scheduleDrain|drainAll|drainOutbox)\s*\(/.test(hourlySrc);
      const DA = (await import(pathToFileURL(resolve("src/lib/modules/crm/deals-actions.ts")).href)) as Any;
      const ROUTE = (await import("@/app/api/v1/crm/[...path]/route" as string)) as Any;
      const AK = (await import("@/lib/api-keys/service" as string)) as Any;
      const SC = (await import("@/lib/api-keys/scopes" as string)) as Any;
      const c = await mkCrm("L3-M1b");
      const k = await mkContact(c, "ปลุกคิว");
      const dA = await mkDeal(c, k.id, 100_000, { title: `ผ่าน action ${TAG}` });
      const dR = await mkDeal(c, k.id, 100_000, { title: `ผ่าน REST ${TAG}` });
      const key = await AK.createApiKey({ tenantId: T }, `${TAG} m1b`, { scopes: [...((SC.API_SCOPE_BUNDLES as Any[]).find((x) => x.id === "crm.operate")?.scopes ?? [])], systemId: c.S, createdById: owner.userId });
      KEY_IDS.push(key.id);
      OUTBOX_EXTRA.where = { systemId: c.S }; // a drain woken by these writes may only see this system's events
      const waitDone = async (dealId: string) => {
        for (let i = 0; i < 30; i += 1) {
          const ev = (await P.outboxEvent.findMany({ where: { systemId: c.S, type: "crm.deal.won" }, select: { status: true, payload: true } })) as Any[];
          const mine = ev.find((e) => (e.payload as Any)?.dealId === dealId);
          if (mine && mine.status !== "PENDING") return String(mine.status);
          if (i === 29) return mine ? String(mine.status) : "none";
          await new Promise((r) => setTimeout(r, 500));
        }
        return "none";
      };
      let actS = "not-run"; let restS = "not-run"; let viaAct: AR | null = null; let restStatus = 0;
      try {
        viaAct = await act(owner, DA.moveDealAction, c.S, dA.id, { stageId: c.WON });
        actS = await waitDone(dA.id);
        const res: Response = await ROUTE.PUT(new Request(`http://qc.invalid/api/v1/crm/deals/${dR.id}/stage`, { method: "PUT", headers: { authorization: `Bearer ${key.rawKey}`, "content-type": "application/json", "idempotency-key": `${TAG}-m1b`, "x-forwarded-for": "203.0.113.153" }, body: JSON.stringify({ stageId: c.WON }) }), { params: Promise.resolve({ path: ["deals", dR.id, "stage"] }) });
        restStatus = res.status;
        restS = await waitDone(dR.id);
        await new Promise((r) => setTimeout(r, 2_000)); // let a woken drain finish its last (empty) round under the guard
      } finally { OUTBOX_EXTRA.where = {}; }
      const wrote = !!viaAct?.ok && restStatus >= 200 && restStatus < 300;
      chk("C5.3-L3-M1b", "a CRM write gets its outbox event processed promptly: a stage move to WON through the v2 server action AND through REST is drained within 15 s (the write path wakes the queue)",
        wrote && actS === "DONE" && restS === "DONE",
        "fixture: moveDealAction + REST PUT /deals/{id}/stage succeed ⇒ both crm.deal.won events DONE within 15 s — the write path wakes the queue (a minute-cron drain also satisfies production, but only an immediate wake is observable in-process · the hourly route is C5.3-L3-M1c) · any drain this process wakes only sees this system's events (OUTBOX GUARD)",
        `action=${viaAct ? aDesc(viaAct) : "-"} event=${actS} · REST=${restStatus} event=${restS} · hourlyDrains=${hourlyDrains}`);
      const outboxSrc = read("src/lib/core/outbox.ts");
      const consumersSrc = read("src/lib/outbox-consumers.ts");
      // outbox.ts:148/:193 + the scheduleDrain() doc comment in outbox-consumers.ts ("…ค้างในคิวจนกว่า cron รายชั่วโมงจะมาเก็บ")
      const falseClaim = /cron รายชั่วโมงเก็บตก|cron ก็กวาดรายชั่วโมง/.test(outboxSrc) || /cron รายชั่วโมงจะมาเก็บ/.test(consumersSrc);
      chk("C5.3-L3-M1c", "(SOURCE — the claim lives in a comment) the kernel's statement that the hourly cron picks up what a drain left is TRUE or REMOVED: /api/cron/hourly drains the outbox, or core/outbox.ts no longer says \"cron รายชั่วโมงเก็บตก / กวาดรายชั่วโมง\" (PROD NOW: platform-wide)",
        hourlyDrains || !falseClaim,
        "hourly route calls drainAll/drainOutbox/scheduleDrain, OR the claims at outbox.ts:148/:193 and in the scheduleDrain() doc comment (outbox-consumers.ts) are corrected",
        `hourlyDrains=${hourlyDrains} · outbox.ts still claims hourly pickup=${falseClaim}`);
    });

    // ── L3-M2 · failed step send is logged "will retry" but skipped ──
    await sub("C5.3-L3-M2", async () => {
      const c = await mkCrm("L3-M2");
      const k = await mkContact(c, "ส่งล้ม", { email: `${TAG}-m2@qc.invalid` });
      await grantEmail(c, k.id);
      const eid = await enrollOne(c, "ตัวส่งล้ม", k.id);
      const calls: string[] = [];
      const failing = async (r: Any) => { calls.push(`fail:${r.channel}`); return { ok: false, error: "ส่งอีเมลไม่สำเร็จ — ระบบจะลองขั้นนี้อีกครั้งในรอบถัดไป" }; };
      const okSender = async (r: Any) => { calls.push(`ok:${r.channel}`); return { ok: true }; };
      const r1 = await call(SEQ.runDue, new Date(Date.now() + 1_000), { deps: { email: failing, line: failing, sms: failing }, tenantIds: [T], systemIds: [c.S] });
      const a1 = await enr(eid);
      const r2 = await call(SEQ.runDue, new Date(Date.now() + 40 * 60_000), { deps: { email: okSender, line: okSender, sms: okSender }, tenantIds: [T], systemIds: [c.S] });
      const a2 = await enr(eid);
      const log = (row: Any) => (Array.isArray(row?.stats?.log) ? row.stats.log : []).map((x: Any) => `${x.index}:${x.outcome}`);
      const step0Sent = log(a2).includes("0:SENT") || calls.filter((x) => x.startsWith("ok:")).length >= 1;
      chk("C5.3-L3-M2", "a sequence step whose sender answers {ok:false} (Resend 429/5xx shape) is NOT skipped: the enrollment stays on that step and a later run (after backoff) sends it — or the message stops promising a retry and the enrollment is STOPPED FAILED",
        r1.ok && r2.ok && ((a1?.stepIndex === 0 && step0Sent) || (a1?.status === "STOPPED" && !/ลองขั้นนี้อีกครั้ง/.test(j(a1?.stats)))),
        "run#1 with a failing sender leaves stepIndex 0 (no advance) · run#2 40 min later with a healthy sender sends step 0",
        `run1=${desc(r1)} after1=${j({ status: a1?.status, step: a1?.stepIndex, log: log(a1) })} · run2=${desc(r2)} after2=${j({ status: a2?.status, step: a2?.stepIndex, log: log(a2) })} · calls=${calls.join(",")}`);
    });

    // ── L3-M3 · outbox lease computed from the round-start clock ⇒ later claims are born expired ──
    await sub("C5.3-L3-M3", async () => {
      const OB = (await import("@/lib/core/outbox" as string)) as Any;
      const TYPE = `qc.c53.${rand}.slow`;
      // decoy: a PENDING row of this tenant with ANOTHER type — the narrowed drain must leave it untouched (SF11)
      const decoy = await P.outboxEvent.create({ data: { tenantId: T, type: `qc.c53.${rand}.decoy`, payload: { decoy: true }, idempotencyKey: `${TYPE}#decoy`, availableAt: new Date(Date.now() - 2_000) } });
      OUTBOX_EXTRA.where = { type: TYPE };
      const obs: Any[] = [];
      let isolated = false;
      try {
        const probe = (await (await import("@/lib/core/db" as string)).prisma.outboxEvent.findMany({ where: { status: "PENDING" }, select: { tenantId: true, type: true }, take: 50 })) as Any[];
        isolated = probe.every((r) => r.tenantId === T && r.type === TYPE);
        if (isolated) {
          await P.outboxEvent.create({ data: { tenantId: T, type: TYPE, payload: { n: 1 }, idempotencyKey: `${TYPE}#1`, availableAt: new Date(Date.now() - 1_000) } });
          await P.outboxEvent.create({ data: { tenantId: T, type: TYPE, payload: { n: 2 }, idempotencyKey: `${TYPE}#2`, availableAt: new Date(Date.now() - 500) } });
          const consumers = {
            [TYPE]: async (evt: Any) => {
              const row = await P.outboxEvent.findUnique({ where: { id: evt.id }, select: { availableAt: true } });
              obs.push({ n: evt.payload?.n, leaseLeftMs: row ? row.availableAt.getTime() - Date.now() : null });
              if (evt.payload?.n === 1) await new Promise((r) => setTimeout(r, 62_000)); // a slow handler (webhook timeout × N in real life)
            },
          };
          await OB.drainOutbox(consumers, { limit: 50 });
        }
      } finally { OUTBOX_EXTRA.where = {}; }
      const d2 = await P.outboxEvent.findUnique({ where: { id: decoy.id }, select: { status: true, attempts: true, lastError: true, availableAt: true } });
      const decoyUntouched = d2?.status === "PENDING" && d2.attempts === 0 && !d2.lastError && d2.availableAt.getTime() === decoy.availableAt.getTime();
      const first = obs.find((o) => o.n === 1); const second = obs.find((o) => o.n === 2);
      chk("C5.3-L3-M3", "every outbox claim carries a lease counted from the moment of THAT claim: an event claimed after a 62 s handler in the same round holds (almost) the same remaining lease as the first one had — not a lease born expired (and not fixable by just raising LEASE_MS)",
        isolated && decoyUntouched && obs.length === 2 && typeof first?.leaseLeftMs === "number" && typeof second?.leaseLeftMs === "number" && second.leaseLeftMs >= first.leaseLeftMs - 5_000,
        "fixture: drain narrowed to this tenant + private type (probe sees only it · a decoy PENDING row of another type stays untouched: same status/attempts/lastError/availableAt) · 2 events in one round, handler#1 sleeps 62 s ⇒ lease left seen by handler#2 ≥ lease left seen by handler#1 − 5 s",
        `isolated=${isolated} decoyUntouched=${decoyUntouched} ${j({ status: d2?.status, attempts: d2?.attempts, lastError: d2?.lastError })} · observed=${j(obs)}`);
    });

    // ── L3-M4 · one shared 20 s budget per cadence: daily tail jobs starve in the single daily run ──
    await sub("C5.3-L3-M4", async () => {
      const MJ = (await import("@/lib/platform/minute-jobs" as string)) as Any;
      const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, unknown> | undefined;
      const saved = reg ? new Map(reg) : null;
      let tailRan = 0;
      let res: Any = null;
      const BUDGET = Number(MJ.MINUTE_JOB_BUDGET_MS ?? 20_000);
      if (reg) {
        reg.clear(); // this process only — the real jobs never run here
        MJ.registerMinuteJob({ name: JOB_NAMES[0], everyMinutes: 1440, cadence: "daily", run: () => new Promise((r) => setTimeout(r, BUDGET + 600)) });
        MJ.registerMinuteJob({ name: JOB_NAMES[1], everyMinutes: 1440, cadence: "daily", run: async () => { tailRan += 1; } });
        try {
          res = await call(MJ.runMinuteJobs, new Date(), { cadence: "daily", entry: "vps" });
          await MJ.settleOutstandingMinuteJobs(5_000).catch(() => undefined);
        } finally {
          reg.clear();
          for (const [k2, v] of saved!) reg.set(k2, v);
        }
      }
      const outcomes = res?.ok ? Object.fromEntries((res.v.results as Any[]).map((x) => [String(x.name).replace(TAG, "<tag>"), x.outcome])) : res?.err;
      chk("C5.3-L3-M4", "one daily (or hourly) invocation of the CRM job runner executes every due job of that cadence even when an earlier job eats the whole budget — the tail (PDPA purges / retention) is never starved for the window",
        !!reg && res?.ok && tailRan >= 1,
        `fixture: registry swapped for [slow = MINUTE_JOB_BUDGET_MS(${BUDGET}) + 600 ms, tail] daily jobs · one runMinuteJobs(daily) ⇒ tail ran (per-job budget or the runner loops until nothing is due · a fix that only loops in scripts/crm-cron.mts needs an ORACLE-EDIT to that entry)`,
        `registry=${!!reg} run=${j(outcomes)} tailRan=${tailRan}`);
    });

    // ── L3-m1 · REST idempotency: abandoned claim sticks 24 h · transient 5xx replayed 24 h ──
    await sub("C5.3-L3-m1", async () => {
      const IDEM = (await import("@/lib/api/idempotency" as string)) as Any;
      const actor = { kind: "apikey", tenantId: T, keyId: `${TAG}-idem`, module: "crm" };
      const op = { id: "qc.c53.idem", method: "POST", path: "/qc", kind: "write", idempotency: "required" };
      const reqOf = (key: string) => new Request("http://qc.invalid/api/v1/crm/qc", { method: "POST", headers: { "idempotency-key": key, "content-type": "application/json" }, body: "{}" });
      // (a) a claim whose lambda died (status NULL) — made by a run() that never returns, then aged 10 minutes
      const kA = `${TAG}-a`;
      void IDEM.withIdempotency(actor, reqOf(kA), op, "{}", "rq-a", {}, () => new Promise(() => undefined));
      await new Promise((r) => setTimeout(r, 1_500));
      const aged = await P.apiIdempotency.updateMany({ where: { tenantId: T, idemKey: kA }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
      let ranA = 0;
      const resA: Response = await IDEM.withIdempotency(actor, reqOf(kA), op, "{}", "rq-a2", {}, async () => { ranA += 1; return { status: 200, body: { ok: true } }; });
      // (b) a transient 503 must not be replayed as final
      const kB = `${TAG}-b`;
      let ranB = 0;
      const b1: Response = await IDEM.withIdempotency(actor, reqOf(kB), op, "{}", "rq-b1", {}, async () => { ranB += 1; return { status: 503, body: { error: { code: "unavailable" } } }; });
      const b2: Response = await IDEM.withIdempotency(actor, reqOf(kB), op, "{}", "rq-b2", {}, async () => { ranB += 1; return { status: 200, body: { ok: true } }; });
      chk("C5.3-L3-m1", "REST idempotency recovers: a NULL-status claim older than ~2 min is taken over (the retry runs), and a transient 5xx/429 is not stored — the retry with the same key runs again",
        aged.count === 1 && resA.status === 200 && ranA === 1 && b1.status === 503 && b2.status === 200 && ranB === 2,
        "fixture: abandoned claim aged 10 min · retry ⇒ 200 and run() executed once · 503 then retry ⇒ 200 and run() executed twice",
        `aged=${aged.count} · retryA=${resA.status} ran=${ranA} · b1=${b1.status} b2=${b2.status}${b2.headers.get("idempotent-replayed") ? " (REPLAYED)" : ""} ranB=${ranB}`, "MINOR");
    });

    // ── L3-m2 · complaint webhook: after-commit steps lost for good on replay ──
    await sub("C5.3-L3-m2", async () => {
      process.env.RESEND_WEBHOOK_SECRET = SVIX_SECRET;
      const c = await mkCrm("L3-m2");
      const k = await mkContact(c, "แจ้งสแปม", { email: `${TAG}-cmp@qc.invalid` });
      await grantEmail(c, k.id);
      const sendR = await call(CRM.emails.sendEmail, c.ctx, owner.actor, { contactId: k.id, subject: `ทักทาย ${TAG}`, bodyHtml: "<p>สวัสดี</p>" }, { transport });
      const msg = sendR.ok ? await P.crmEmailMessage.findUnique({ where: { id: sendR.v.emailId }, select: { id: true, providerId: true } }) : null;
      const eid = await enrollOne(c, "ติดตามแจ้งสแปม", k.id);
      const svixId = `msg_${TAG}_${randomBytes(4).toString("hex")}`;
      // the state a crash right after the complaint transaction committed leaves behind (event row + opt-out flag), before consents.set / stop ran
      await P.crmEmailEvent.create({ data: { tenantId: T, emailId: msg!.id, kind: "COMPLAINT", providerEventId: svixId } });
      await P.crmContact.update({ where: { id: k.id }, data: { emailOptOut: true } });
      const body = JSON.stringify({ type: "email.complained", data: { email_id: msg!.providerId } });
      const ts = String(Math.floor(Date.now() / 1000));
      const key = Buffer.from(SVIX_SECRET.slice("whsec_".length), "base64");
      const sig = createHmac("sha256", key).update(`${svixId}.${ts}.${body}`).digest("base64");
      const wh = await call(CRM.emails.providerWebhook, { rawBody: body, headers: { "svix-id": svixId, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } });
      const withdrawn = (await P.crmContactConsent.count({ where: { tenantId: T, contactId: k.id, channel: "EMAIL", granted: false } })) as number;
      const e = await enr(eid);
      chk("C5.3-L3-m2", "a Resend complaint that is redelivered after a crash between its transaction and the after-steps still ends with the consent-withdrawal row written and running sequences stopped (after-steps idempotent + re-run on replay, or moved inside the tx / an outbox consumer)",
        sendR.ok && !!msg?.providerId && wh.ok && wh.v?.status === 200 && withdrawn >= 1 && e?.status === "STOPPED",
        "fixture: mail sent (providerId) · enrollment ACTIVE · event row + flag present (crash state) · signed complaint webhook replay ⇒ EMAIL consent row granted=false exists AND the enrollment is STOPPED",
        `send=${sendR.ok ? "ok" : sendR.err} · webhook=${desc(wh)} · withdrawalRows=${withdrawn} · enrollment=${j({ status: e?.status, stoppedReason: e?.stoppedReason })}`, "MINOR");
    });

    // ── L3-m4 · v1 automation re-runs on every retry of the same outbox event (core engine — PROD NOW) ──
    await sub("C5.3-L3-m4", async () => {
      const ENG = (await import("@/lib/automation/engine" as string)) as Any;
      const EVT = "crm.quota.reached";
      await P.automationRule.create({ data: { tenantId: T, name: `แจ้งซ้ำ ${TAG}`, event: EVT, enabled: true, actionType: "NOTIFY", actionConfig: { title: `ถึงเป้า ${TAG}` } } });
      const evt = { tenantId: T, type: EVT, payload: { quotaId: `${TAG}-q`, threshold: 100 }, id: `${TAG}-evt-m4`, systemId: null };
      const f1 = await call(ENG.runForEvent, evt);
      const f2 = await call(ENG.runForEvent, evt); // what withAutomation does when the main handler threw and the queue retries the SAME event
      const n = (await P.appNotification.count({ where: { tenantId: T, title: `ถึงเป้า ${TAG}` } })) as number;
      chk("C5.3-L3-m4", "one outbox event (same id) fires a v1 automation rule at most once — a retry of the event after its main handler failed does not create a second notification / webhook POST",
        f1.ok && f2.ok && n === 1,
        "runForEvent twice with the same event id ⇒ exactly 1 AppNotification (key v1 runs on (ruleId, event id), or skip automation on attempts > 0 — then this check moves to the consumer level, ORACLE-EDIT)",
        `run1=${desc(f1)} run2=${desc(f2)} notifications=${n}`, "MINOR");
    });
  });

  // ═════════════════════════════════════════ L4 · PUBLIC SURFACE ═════════════════════════════════════════
  await section("L4", ["C5.3-L4-M1", "C5.3-L4-M2", "C5.3-L4-m1", "C5.3-L4-m2", "C5.3-L4-m3"], { "C5.3-L4-m1": "MINOR", "C5.3-L4-m2": "MINOR", "C5.3-L4-m3": "MINOR" }, async () => {
    // ── L4-M1 · inbound "staff BCC capture" accepts a forged From ──
    await sub("C5.3-L4-M1", async () => {
      const B32 = "abcdefghijklmnopqrstuvwxyz234567";
      const KEY = Array.from(randomBytes(8)).map((b) => B32[b % 32]).join("");
      const VER = `${rand}-shop.example`;
      const ownerV = await mkUser("owner-verified", "OWNER", {}, ["*"], `boss-${rand}@${VER}`);
      const staffG = await mkUser("sales-gmail", "STAFF", { ...STAFF_KEYS }, ["*"], `sales-${rand}@gmail-like.example`);
      const c = await mkCrm("L4-M1", { email: { inboundKey: KEY, inboundEnabled: true, bccCaptureEnabled: true, strangerToLead: false, fromMode: "SHARK", replyToMode: "SHARK", copyMode: "NONE" } });
      await P.emailDomain.create({ data: { tenantId: T, domain: VER, status: "VERIFIED", verifiedAt: new Date() } });
      const victim = await mkContact(c, "เหยื่อ", { email: `victim-${rand}@cust.example` });
      const mail = (from: string, headers: Record<string, string>) => ({ messageId: `<${TAG}-${randomBytes(4).toString("hex")}@attacker.example>`, from, to: [victim.email, `crm+${KEY}@shark.in.th`], cc: [], subject: "ยืนยันส่วนลด 50%", text: "ยืนยันส่วนลด 50%", html: "<p>ยืนยันส่วนลด 50%</p>", headers, attachments: [] });
      const dirOf = async (r: Res) => (r.ok && r.v?.emailId ? ((await P.crmEmailMessage.findUnique({ where: { id: r.v.emailId }, select: { direction: true } }))?.direction ?? "?") : r.ok ? `not-stored(${r.v?.reason})` : r.err);
      const A = await call(CRM.emails.ingestInbound, mail(`"เจ้าของร้าน" <${ownerV.email}>`, {}));
      const Bf = await call(CRM.emails.ingestInbound, mail(staffG.email, { "authentication-results": "attacker.example; dkim=pass header.d=gmail-like.example" }));
      const Cx = await call(CRM.emails.ingestInbound, mail(staffG.email, { "x-authentication-results": "x; spf=pass smtp.mailfrom=gmail-like.example" }));
      const ctl = await call(CRM.emails.ingestInbound, mail(staffG.email, {}));
      // positive control (SF9): a GENUINE staff BCC copy carrying our own MTA's verdict stays OUT. Trusted authserv-id configured as
      //   CRM_INBOUND_AUTHSERV_ID=mx.shark.in.th (the hunter's proposed name — ORACLE-EDIT if the builder names the setting differently)
      process.env.CRM_INBOUND_AUTHSERV_ID = "mx.shark.in.th";
      const good = await call(CRM.emails.ingestInbound, mail(staffG.email, { "authentication-results": "mx.shark.in.th; dkim=pass header.d=gmail-like.example; spf=pass smtp.mailfrom=gmail-like.example; dmarc=pass header.from=gmail-like.example" }));
      const dA = await dirOf(A); const dB = await dirOf(Bf); const dC = await dirOf(Cx); const dCtl = await dirOf(ctl); const dGood = await dirOf(good);
      chk("C5.3-L4-M1", "inbound mail is stored as OUT \"sent by staff\" only on evidence the attacker cannot write: a VERIFIED sending domain alone, an Authentication-Results from a foreign authserv-id, or any X-Authentication-Results ⇒ IN (stranger rules); a genuine staff copy with our MTA's dkim+dmarc pass stays OUT",
        dCtl === "IN" && dGood === "OUT" && dA !== "OUT" && dB !== "OUT" && dC !== "OUT",
        "controls: no evidence = IN · genuine copy (A-R authserv-id mx.shark.in.th = CRM_INBOUND_AUTHSERV_ID, dkim/spf/dmarc pass for the From domain) = OUT ⇒ (A) From owner@<verified domain>, no headers · (B) forged A-R authserv-id attacker.example · (C) forged X-A-R: none stored as OUT",
        `control(no evidence)=${dCtl} · control(genuine)=${dGood} · A(verified domain)=${dA} · B(forged A-R)=${dB} · C(X-A-R)=${dC}`);
    });

    // ── L4-M2 · webhook SSRF guard bypass (core webhooks service — used by every module's endpoints: PROD NOW) ──
    await sub("C5.3-L4-M2", async () => {
      delete process.env.WEBHOOK_ALLOW_PRIVATE;
      const WH = (await import("@/lib/webhooks/service" as string)) as Any;
      const noDns = { lookup: async () => null };
      const lit = ["http://[::ffff:7f00:1]/", "http://[::ffff:a9fe:a9fe]/latest/meta-data/", "http://[::ffff:a00:1]/", "http://[::7f00:1]/", "http://[64:ff9b::7f00:1]/", "http://[fec0::1]/"];
      const verdicts: string[] = [];
      let allowed = 0;
      for (const u of lit) { const p = await WH.webhookTargetProblem(u, noDns); if (!p) allowed += 1; verdicts.push(`${new URL(u).hostname}=${p ? "blocked" : "ALLOWED"}`); }
      const ctl1 = await WH.webhookTargetProblem("http://127.0.0.1/", noDns);
      // DNS that fails with the real resolver (no injected lookup) ⇒ must not be treated as "public"
      const dnsFail = await WH.webhookTargetProblem(`http://${rand}-nx.invalid/hook`);
      // redirect following: an endpoint on a public-looking host answers 302 → loopback; the injected fetch behaves like the platform fetch
      const ep = await P.webhookEndpoint.create({ data: { tenantId: T, url: `https://hooks-${rand}.example/in`, secret: `sec-${rand}`, eventsJson: [], active: true } });
      const hops: string[] = [];
      const fakeFetch = (async (url: string, init: Any) => {
        hops.push(String(url));
        if (String(url).includes("hooks-") && (init?.redirect ?? "follow") === "follow") { hops.push("http://127.0.0.1:9001/2018-06-01/runtime"); return new Response("internal", { status: 200 }); }
        if (String(url).includes("hooks-")) return new Response(null, { status: 302, headers: { Location: "http://127.0.0.1:9001/2018-06-01/runtime" } });
        return new Response("?", { status: 200 });
      }) as Any;
      const tr = await call(WH.testEndpoint, { tenantId: T }, ep.id, "crm.contact.created", { fetch: fakeFetch, lookup: async () => ["93.184.216.34"] });
      const reachedInternal = hops.some((h) => h.includes("127.0.0.1"));
      // positive control (SF9): a clean public endpoint answering 200 still delivers
      const epOk = await P.webhookEndpoint.create({ data: { tenantId: T, url: `https://ok-${rand}.example/in`, secret: `sec2-${rand}`, eventsJson: [], active: true } });
      const okFetch = (async (_url: string, _init: Any) => new Response("ok", { status: 200 })) as Any;
      const trOk = await call(WH.testEndpoint, { tenantId: T }, epOk.id, "crm.contact.created", { fetch: okFetch, lookup: async () => ["93.184.216.34"] });
      const pubLit = await WH.webhookTargetProblem("https://93.184.216.34/hook", noDns);
      chk("C5.3-L4-M2", "the outgoing-webhook SSRF guard holds: IPv4-mapped / compatible / NAT64 / site-local IPv6 literals of private targets are blocked, a failed DNS lookup is not \"public\", and a 3xx to an internal address is never followed (delivery = failure) — while a clean public endpoint still delivers",
        !!ctl1 && !pubLit && trOk.ok && trOk.v?.delivered === true && allowed === 0 && !!dnsFail && tr.ok && !reachedInternal && (tr.v?.delivered === true || tr.v?.delivered === false), // ORACLE-EDIT C5.3-L4-M2 (controller · 28 Sep · SF1 of C5.4-A review: a 3xx counts as DELIVERED-with-warning so Google Apps Script /exec gets no duplicates; the SSRF contract is "no internal hop is ever fetched")
        "controls: 127.0.0.1 blocked · public IPv4 literal allowed · clean public endpoint (200) delivered=true ⇒ 0 of the 6 literals allowed · NXDOMAIN (real resolver) blocked · 302→127.0.0.1: no internal hop is fetched (delivered may be true with a redirect warning — ruling SF1)",
        `control127=${ctl1 ? "blocked" : "ALLOWED"} publicLiteral=${pubLit ? "BLOCKED" : "allowed"} cleanEndpoint=${desc(trOk)} · ${verdicts.join(" ")} · nxdomain=${dnsFail ? "blocked" : "ALLOWED"} · test=${desc(tr)} hops=${hops.join(" → ")}`);
    });

    // shared: one sent CRM e-mail with a Thai-path link (tracked) and its unsubscribe token
    const c4 = await mkCrm("L4-mail");
    const k4 = await mkContact(c4, "ผู้รับลิงก์", { email: `${TAG}-link@qc.invalid` });
    await grantEmail(c4, k4.id);
    const THAI_URL = `https://shop-${rand}.example/สินค้า/เสื้อ?utm_source=crm`;
    const before = sentMail.length;
    const sr = await call(CRM.emails.sendEmail, c4.ctx, owner.actor, { contactId: k4.id, subject: `โปรโมชัน ${TAG}`, bodyHtml: `<p>ดู <a href="${THAI_URL}">สินค้า</a></p>` }, { transport });
    const sentMsg = sentMail[before] ?? null;
    const html = String(sentMsg?.html ?? "");
    const clickTok = (/\/t\/c\/([^"'\s<>]+)/.exec(html) ?? [])[1] ?? "";
    const unsubTok = (/\/u\/([^"'\s<>/]+)\/one-click/.exec(j(sentMsg?.headers ?? {}) + html) ?? /\/u\/([^"'\s<>/]+)/.exec(html) ?? [])[1] ?? "";

    // ── L4-m1 · /t/c with a non-Latin-1 destination sends the customer to the SHARK homepage ──
    await sub("C5.3-L4-m1", async () => {
      const RT = (await import(pathToFileURL(resolve("src/app/t/c/[token]/route.ts")).href)) as Any;
      let loc = ""; let status = 0;
      if (clickTok) {
        const res: Response = await RT.GET(new Request(`http://qc.invalid/t/c/${clickTok}`, { headers: { "x-forwarded-for": IP, "user-agent": "Mozilla/5.0 qc" } }), { params: Promise.resolve({ token: clickTok }) });
        status = res.status; loc = res.headers.get("location") ?? "";
      }
      for (const kk of CRM.emails.trackRateKeys("c", { ip: IP, token: clickTok })) RATE_KEYS.push(kk);
      const decoded = (() => { try { return decodeURI(loc); } catch { return loc; } })();
      chk("C5.3-L4-m1", "a tracked click on a link whose destination has a Thai path redirects to that destination (percent-encoded Location, like /l does with headerSafe), not to the SHARK homepage",
        sr.ok && !!clickTok && status === 302 && decoded.startsWith(`https://shop-${rand}.example/สินค้า/`),
        "fixture: CRM mail sent with <a href=\"…/สินค้า/เสื้อ\"> wrapped as /t/c/<token> · GET ⇒ 302 Location = encodeURI(destination)",
        `send=${sr.ok ? "ok" : sr.err} token=${clickTok ? "found" : "MISSING"} · status=${status} location=${cut(loc, 120)}`, "MINOR");
    });

    // ── L4-m2 · RFC 8058 one-click unsubscribe silently dropped when the per-IP bucket is full ──
    await sub("C5.3-L4-m2", async () => {
      const RT = (await import(pathToFileURL(resolve("src/app/u/[token]/one-click/route.ts")).href)) as Any;
      const ip2 = `198.51.100.${Math.floor(Math.random() * 30) + 225 > 254 ? 250 : Math.floor(Math.random() * 30) + 225}`;
      const keys = CRM.emails.trackRateKeys("u", { ip: ip2, token: unsubTok }) as string[];
      for (const kk of keys) RATE_KEYS.push(kk);
      // the provider's shared egress IP is already over 60/min (other tenants' campaigns)
      await P.chatRateBucket.upsert({ where: { key: keys[0] }, create: { key: keys[0], count: 999, windowStart: new Date() }, update: { count: 999, windowStart: new Date() } });
      let st = 0;
      if (unsubTok) {
        const res: Response = await RT.POST(new Request(`http://qc.invalid/u/${unsubTok}/one-click`, { method: "POST", headers: { "x-forwarded-for": ip2, "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }), { params: Promise.resolve({ token: unsubTok }) });
        st = res.status;
      }
      const ct = await P.crmContact.findUnique({ where: { id: k4.id }, select: { emailOptOut: true } });
      // positive control: the same token from a fresh IP (bucket empty) does opt the contact out ⇒ the token itself is good
      const ip3c = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
      for (const kk of CRM.emails.trackRateKeys("u", { ip: ip3c, token: unsubTok }) as string[]) RATE_KEYS.push(kk);
      let ctl = false;
      if (unsubTok && ct?.emailOptOut !== true) {
        await RT.POST(new Request(`http://qc.invalid/u/${unsubTok}/one-click`, { method: "POST", headers: { "x-forwarded-for": ip3c, "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }), { params: Promise.resolve({ token: unsubTok }) });
        ctl = (await P.crmContact.findUnique({ where: { id: k4.id }, select: { emailOptOut: true } }))?.emailOptOut === true;
      } else ctl = ct?.emailOptOut === true;
      chk("C5.3-L4-m2", "a VALID one-click unsubscribe token is honoured even when the caller's per-IP bucket is full (Gmail/Yahoo post from a small shared pool) — only unknown tokens are rate-limited (refines ruling F8 · ORACLE-EDIT C2.5-S10.8)",
        !!unsubTok && st === 200 && ct?.emailOptOut === true && ctl,
        "fixture: token from the List-Unsubscribe of a real CRM send · IP bucket at 999 · POST /u/<token>/one-click ⇒ 200 AND contact.emailOptOut = true (control: same token from an empty-bucket IP opts out)",
        `token=${unsubTok ? "found" : "MISSING"} status=${st} emailOptOut(full bucket)=${ct?.emailOptOut} · control(fresh IP)=${ctl}`, "MINOR");
    });

    // ── L4-m3 · the rate gate writes a token bucket row even when the IP is already over the limit ──
    await sub("C5.3-L4-m3", async () => {
      const ip3 = `198.51.100.${(Number(IP.split(".")[3]) + 1) % 200 + 20}`;
      const ipKey = (CRM.emails.trackRateKeys("o", { ip: ip3 }) as string[])[0]!;
      RATE_KEYS.push(ipKey);
      await P.chatRateBucket.upsert({ where: { key: ipKey }, create: { key: ipKey, count: 999, windowStart: new Date() }, update: { count: 999, windowStart: new Date() } });
      const toks = Array.from({ length: 5 }, () => `${randomBytes(6).toString("hex")}~${randomBytes(24).toString("base64url")}`);
      const tokKeys = toks.map((t) => (CRM.emails.trackRateKeys("o", { ip: ip3, token: t }) as string[])[1]!);
      for (const kk of tokKeys) RATE_KEYS.push(kk);
      const verdicts: boolean[] = [];
      for (const t of toks) verdicts.push(await CRM.emails.trackGate("o", { ip: ip3, token: t }));
      const rows = (await P.chatRateBucket.count({ where: { key: { in: tokKeys } } })) as number;
      chk("C5.3-L4-m3", "a request from an IP that is already over its limit writes nothing more: no per-token ChatRateBucket row is created for fresh tokens (the per-IP limit bounds DB writes, not only counting)",
        verdicts.every((v) => v === false) && rows === 0,
        "IP bucket at 999 · 5 fresh /t/o tokens through trackGate ⇒ all refused AND 0 token-bucket rows",
        `verdicts=${verdicts.join(",")} tokenRowsWritten=${rows}`, "MINOR");
    });
  });

  // ── L4-M3 (objective part only) · the platform kill-switch (tenant SUSPENDED/CLOSED) does not stop the tenant's /l/<code> redirector ──
  await section("L4", ["C5.3-L4-M3"], {}, async () => {
    await sub("C5.3-L4-M3", async () => {
      const RT = (await import(pathToFileURL(resolve("src/app/l/[code]/route.ts")).href)) as Any;
      const c = await mkCrm("L4-M3");
      const code = `QcL${rand}`;
      const lk = await call(CRM.tracking.createLink, c.ctx, owner.actor, { url: `https://phish-${rand}.example/login`, name: `abuse ${TAG}`, code });
      const hit = async () => {
        const res: Response = await RT.GET(new Request(`http://qc.invalid/l/${code}`, { headers: { "x-forwarded-for": IP, "user-agent": "Mozilla/5.0 qc" } }), { params: Promise.resolve({ code }) });
        return res.headers.get("location") ?? "";
      };
      const TRK = (await import("@/lib/modules/crm/tracking" as string)) as Any;
      RATE_KEYS.push(`crm:l:${String(TRK.ipHashFor(IP, new Date())).slice(0, 32)}`);
      const active = lk.ok ? await hit() : "";
      const out: string[] = [];
      let bad = 0;
      for (const st of ["SUSPENDED", "CLOSED"]) {
        await P.tenant.update({ where: { id: T }, data: { status: st } });
        try { const loc = await hit(); if (loc.includes(`phish-${rand}`)) bad += 1; out.push(`${st}→${cut(loc, 60)}`); }
        finally { await P.tenant.update({ where: { id: T }, data: { status: "ACTIVE" } }); }
      }
      chk("C5.3-L4-M3", "(objective part of L4-M3 — the destination policy itself is an OWNER decision) a tenant the platform has SUSPENDED or CLOSED (TenantStatus: \"login ไม่ได้ + storefront 410\") no longer redirects shark.in.th/l/<code> to its destination — the abuse kill-switch works on the redirector",
        lk.ok && active.includes(`phish-${rand}`) && bad === 0,
        "fixture: link created and redirects while ACTIVE · tenant SUSPENDED / CLOSED ⇒ /l/<code> answers the unknown-code fallback (no Location to the tenant's URL)",
        `create=${lk.ok ? "ok" : lk.err} active→${cut(active, 60)} · ${out.join(" · ")}`);
    });
  });

  // ═════════════════════════════════════════ L5 · PDPA & DATA LEAKAGE ═════════════════════════════════════════
  await section("L5", ["C5.3-L5-M1", "C5.3-L5-M2", "C5.3-L5-M3", "C5.3-L5-M4", "C5.3-L5-m3", "C5.3-L5-m5", "C5.3-L5-m6", "C5.3-L5-m7"],
    { "C5.3-L5-m3": "MINOR", "C5.3-L5-m5": "MINOR", "C5.3-L5-m6": "MINOR", "C5.3-L5-m7": "MINOR" }, async () => {
    // ── L5-M1/M2/M3 · erase leaves the name in deal titles · automation kanban cards · team-room posts ──
    await sub(["C5.3-L5-M1","C5.3-L5-M2","C5.3-L5-M3"], async () => {
      const FIRST = `สมหญิง${rand}`;
      const LAST = `ทดสอบลบ${rand}`;
      const FULL = `${FIRST} ${LAST}`;
      const K = (await sysSvc.createSystem(T, "KANBAN", `KB ${TAG}`)).id as string;
      const M = (await sysSvc.createSystem(T, "MEETING", `MT ${TAG}`)).id as string;
      const team = await P.team.create({ data: { tenantId: T, name: `ทีม L5 ${TAG}` } });
      const channel = await P.meetingChannel.create({ data: { tenantId: T, systemId: M, name: `room-${rand}`, createdByUserId: owner.userId } });
      const c = await mkCrm("L5-erase", { teamRooms: { [team.id]: { meetingSystemId: M, channelId: channel.id } } });
      const board = await P.kanbanBoard.create({ data: { tenantId: T, systemId: K, name: `บอร์ด ${TAG}` } });
      await P.kanbanColumn.create({ data: { tenantId: T, systemId: K, boardId: board.id, name: "ToDo" } });
      const created = await call(CRM.contacts.createContact, c.ctx, owner.actor, { firstName: FIRST, lastName: LAST, phone: "0891234567" });
      const X = created.v?.row?.id ?? created.v?.contact?.id ?? created.v?.id;
      await P.crmContact.update({ where: { id: X }, data: { teamId: team.id, score: 90 } });
      const dealA = await call(CRM.deals.createDeal, c.ctx, owner.actor, { pipelineId: c.pipe, stageId: c.OPEN, title: `ดีล ${FULL}`, contactId: X });
      // nextStep + lostReason carrying the name too (AI can write nextStep; staff write the lost note)
      if (dealA.ok) await P.crmDeal.update({ where: { id: dealA.v.id ?? dealA.v.deal?.id }, data: { nextStep: `โทรหา ${FULL} วันจันทร์`, lostReason: `${FULL} เลือกเจ้าอื่น` } });
      const rule = await call(CRM.automation.createRule, c.ctx, owner.actor, { name: `กฎ L5 ${TAG}`, trigger: { event: "crm.contact.updated" }, actions: [{ type: "OPEN_KANBAN_CARD", params: { boardId: board.id, title: "โทรหา {ชื่อ}" } }, { type: "CREATE_DEAL", params: { pipelineId: c.pipe, titleTpl: "ดีลอัตโนมัติ {ชื่อ}" } }], enabled: true });
      const fired = await call(CRM.automation.runForCrmEvent, { tenantId: T, systemId: c.S, type: "crm.contact.updated", payload: { contactId: X, changedKeys: ["tags"] }, id: `${TAG}-l5`, idempotencyKey: `crm.contact.updated#${X}#l5${rand}` });
      const hot = await call(CRM.aiBridges.onHotLeadTeamRoom, { id: `${TAG}-hot`, tenantId: T, type: "crm.score.threshold", payload: { contactId: X, band: "HOT" }, systemId: c.S });
      await call(CRM.activities.logActivity, c.ctx, owner.actor, { type: "TASK", title: `โทรหา ${FULL}`, contactId: X, dueAt: new Date() });
      const has = (s: unknown) => String(s ?? "").includes(FIRST) || String(s ?? "").includes(LAST);
      const snap = async () => ({
        deals: ((await P.crmDeal.findMany({ where: { tenantId: T, systemId: c.S }, select: { title: true } })) as Any[]).filter((d) => has(d.title)).length,
        dealTexts: ((await P.crmDeal.findMany({ where: { tenantId: T, systemId: c.S }, select: { nextStep: true, lostReason: true } })) as Any[]).reduce((n, d) => n + (has(d.nextStep) ? 1 : 0) + (has(d.lostReason) ? 1 : 0), 0),
        cards: ((await P.kanbanCard.findMany({ where: { tenantId: T, systemId: K }, select: { title: true } })) as Any[]).filter((d) => has(d.title)).length,
        cardsTotal: (await P.kanbanCard.count({ where: { tenantId: T, systemId: K } })) as number,
        posts: ((await P.meetingMessage.findMany({ where: { tenantId: T }, select: { body: true } })) as Any[]).filter((m) => has(m.body)).length,
        postsTotal: (await P.meetingMessage.count({ where: { tenantId: T } })) as number,
        acts: ((await P.crmActivity.findMany({ where: { tenantId: T, contactId: X }, select: { title: true } })) as Any[]).filter((a) => has(a.title)).length,
      });
      const pre = await snap();
      const er = await call(CRM.privacy.eraseContact, c.ctx, owner.actor, { contactId: X, confirm: true, reason: `ทดสอบ C5.3 ${TAG}` });
      const post = await snap();
      const control = pre.acts > 0 && post.acts === 0 && er.ok;
      const fx = `create=${created.ok ? "ok" : created.err} dealA=${dealA.ok ? "ok" : dealA.err} rule=${rule.ok ? "ok" : rule.err} fired=${desc(fired)} hot=${hot.ok ? "ok" : hot.err} erase=${er.ok ? "ok" : er.err} · before=${j(pre)} after=${j(post)} · positive control (activity masked)=${control}`;
      chk("C5.3-L5-M1", "erase removes the person's name from CrmDeal.title / nextStep / lostReason of their deals (convert-sheet default \"ดีล <name>\", automation CREATE_DEAL {ชื่อ}, a next step and a lost note naming them); numbers, stage and owner stay",
        control && pre.deals >= 2 && pre.dealTexts >= 2 && post.deals === 0 && post.dealTexts === 0, "fixture: 2 deal titles + nextStep + lostReason carry the name · positive control masked ⇒ 0 deal titles / nextSteps / lostReasons contain the name after eraseContact", fx);
      chk("C5.3-L5-M2", "erase reaches automation-made kanban cards: OPEN_KANBAN_CARD \"โทรหา {ชื่อ}\" is linked to the contact (or found through the run's sourceKey) and masked",
        control && post.cardsTotal >= 1 && post.cards === 0, "fixture: the rule engine opened ≥ 1 card (name-free from the start also passes — L1-m4) ⇒ 0 card titles with the name after erase", fx);
      chk("C5.3-L5-M3", "team-room posts carry no customer name (link + score only) or erase masks them: the hot-lead post exists and no MeetingMessage body contains the erased person's name",
        control && hot.ok && post.postsTotal >= 1 && post.posts === 0, "fixture: onHotLeadTeamRoom posted (≥ 1 MeetingMessage stays after erase — positive control) ⇒ 0 bodies with the name after erase", fx);
    });

    // ── L5-M4 · "don't track me" has no writer; merge drops it ──
    await sub("C5.3-L5-M4", async () => {
      const c = await mkCrm("L5-M4");
      const a = await mkContact(c, "ไม่ให้ติดตาม", { email: `${TAG}-nt@qc.invalid` });
      const b = await mkContact(c, "ตัวหลัก", { email: `${TAG}-keep@qc.invalid` });
      const tries: string[] = [];
      let set = false;
      // writer detection by BEHAVIOUR: every exported function of contacts/consents/tracking whose name speaks of tracking opt-out, with the
      //   plausible argument shapes, plus the generic writers (consents.set channel TRACKING · updateContact patch) — success = the flag flips
      const cands: [string, Any, Any[]][] = [];
      for (const [mod, M] of [["contacts", CRM.contacts], ["consents", CRM.consents], ["tracking", CRM.tracking]] as [string, Any][]) {
        for (const name of Object.keys(M ?? {}).filter((n) => /track.*opt|opt.*out.*track|do.?not.?track|no.?track/i.test(n) && typeof M[n] === "function")) {
          cands.push([`${mod}.${name}(id,true)`, M[name], [c.ctx, owner.actor, a.id, true]]);
          cands.push([`${mod}.${name}(id,{optOut})`, M[name], [c.ctx, owner.actor, a.id, { optOut: true, trackingOptOut: true, reason: `ลูกค้าขอไม่ให้ติดตาม ${TAG}` }]]);
          cands.push([`${mod}.${name}({contactId})`, M[name], [c.ctx, owner.actor, { contactId: a.id, optOut: true, trackingOptOut: true, reason: `ลูกค้าขอไม่ให้ติดตาม ${TAG}` }]]);
        }
      }
      cands.push(["consents.set{TRACKING}", CRM.consents.set, [c.ctx, owner.actor, a.id, { channel: "TRACKING", granted: false, source: "STAFF", note: `ขอไม่ให้ติดตาม ${TAG}` }]]);
      cands.push(["contacts.updateContact{trackingOptOut}", CRM.contacts.updateContact, [c.ctx, owner.actor, a.id, { trackingOptOut: true }]]);
      for (const [label, fn, args] of cands) {
        const r = await call(fn, ...args);
        const now = await P.crmContact.findUnique({ where: { id: a.id }, select: { trackingOptOut: true } });
        tries.push(`${label}=${r.ok ? "ok" : r.code || "err"}→${now?.trackingOptOut}`);
        if (r.ok && now?.trackingOptOut === true) { set = true; break; }
      }
      const audit = set ? ((await P.auditLog.count({ where: { tenantId: T, targetId: a.id } })) as number) : 0;
      if (!set) await P.crmContact.update({ where: { id: a.id }, data: { trackingOptOut: true } }); // so the merge half still measures merge
      const mg = await call(CRM.contacts.mergeContacts, c.ctx, owner.actor, { keepId: b.id, mergeId: a.id, confirm: true, reason: `รวม C5.3 ${TAG}` });
      const kept = await P.crmContact.findUnique({ where: { id: b.id }, select: { trackingOptOut: true } });
      chk("C5.3-L5-M4", "a customer's \"don't track me\" can be recorded through an audited staff service path (blueprint 20-crm-v2.md:736), and merge keeps the strictest value",
        set && audit >= 1 && mg.ok && kept?.trackingOptOut === true,
        "some service writer sets CrmContact.trackingOptOut=true with an AuditLog row · mergeContacts(keep B, merge A opted-out) ⇒ B.trackingOptOut = true",
        `${tries.join(" · ")} · audit=${audit} · merge=${mg.ok ? "ok" : mg.err} keptOptOut=${kept?.trackingOptOut}`);
    });

    // ── L5-m3 · AI assistant receives raw phone / e-mail / LINE id ──
    await sub("C5.3-L5-m3", async () => {
      const SER = (await import("@/lib/modules/crm/api/serialize" as string)) as Any;
      const out = SER.present({ kind: "assistant", module: "crm", tenantId: T, systemId: "x", scopes: [], membership: {} }, { contact: { name: "คุณเอ", phone: "0812345678", email: `a-${rand}@mail.example`, lineUserId: "Uabcdef0123456789", previousEmails: [`old-${rand}@mail.example`] } });
      const s = j(out);
      chk("C5.3-L5-m3", "what the AI assistant receives from CRM reads (crm_contact_360 → present()) carries no raw phone / e-mail / LINE id (same masking as the e-mail ops and the ai-bridges rule \"prompt has no phone/e-mail\")",
        !s.includes("0812345678") && !s.includes(`a-${rand}@mail.example`) && !s.includes(`old-${rand}@`) && !s.includes("Uabcdef0123456789"),
        "present(assistant, contact with phone/e-mail/LINE/previousEmails) ⇒ none of the raw values appear", `out=${cut(s, 200)}`, "MINOR");
    });

    // ── L5-m5 · no retention for e-mail open/click events ──
    await sub("C5.3-L5-m5", async () => {
      const c = await mkCrm("L5-m5", { email: { retentionDays: 30 } });
      const k = await mkContact(c, "เปิดอ่าน", { email: `${TAG}-open@qc.invalid` });
      await grantEmail(c, k.id);
      const sr = await call(CRM.emails.sendEmail, c.ctx, owner.actor, { contactId: k.id, subject: `เก่า ${TAG}`, bodyHtml: "<p>เก่า</p>" }, { transport });
      const old = new Date(Date.now() - 400 * DAY);
      if (sr.ok) {
        await P.crmEmailMessage.update({ where: { id: sr.v.emailId }, data: { sentAt: old, createdAt: old } });
        await P.crmEmailEvent.create({ data: { tenantId: T, emailId: sr.v.emailId, kind: "OPEN", at: old, userAgent: "Mozilla/5.0 (iPhone) qc" } });
        await P.crmEmailEvent.create({ data: { tenantId: T, emailId: sr.v.emailId, kind: "CLICK", at: old, url: `https://shop-${rand}.example/private`, userAgent: "Mozilla/5.0 (iPhone) qc" } });
      }
      const pg = await call(CRM.emails.purgeBodies, new Date(), { tenantIds: [T], systemIds: [c.S] });
      const msg = sr.ok ? await P.crmEmailMessage.findUnique({ where: { id: sr.v.emailId }, select: { purgedAt: true } }) : null;
      const left = sr.ok ? ((await P.crmEmailEvent.count({ where: { emailId: sr.v.emailId, at: { lte: new Date(Date.now() - 31 * DAY) } } })) as number) : -1;
      chk("C5.3-L5-m5", "the e-mail retention run also removes open/click events (url · user agent · time per person) older than email.retentionDays — not only the bodies",
        sr.ok && pg.ok && !!msg?.purgedAt && left === 0,
        "fixture: mail + OPEN event 400 days old, retention 30 · purgeBodies(tenant) purges the body AND leaves 0 events older than 31 days",
        `send=${sr.ok ? "ok" : sr.err} purge=${desc(pg)} bodyPurged=${!!msg?.purgedAt} oldEventsLeft=${left}`, "MINOR");
    });

    // ── L5-m6 · web tracking: firstUrl in the crm.web.identified payload · raw pageUrl query kept in sourceDetail ──
    await sub("C5.3-L5-m6", async () => {
      const c = await mkCrm("L5-m6");
      const k = await mkContact(c, "ผู้เข้าชม");
      const visitor = `${randomBytes(4).toString("hex")}-0000-4000-8000-${randomBytes(6).toString("hex")}`;
      await P.crmWebSession.create({ data: { tenantId: T, systemId: c.S, visitorId: visitor, consentVersion: 1, consentAt: new Date(), firstUrl: `https://shop-${rand}.example/private/รักษาโรค`, startedAt: new Date(), lastSeenAt: new Date(), pageViews: 3 } });
      const idf = await call(CRM.tracking.identify, { tenantId: T, systemId: c.S }, { visitorId: visitor, contactId: k.id, by: "FORM" });
      const ev = await P.outboxEvent.findFirst({ where: { tenantId: T, systemId: c.S, type: "crm.web.identified" }, select: { payload: true } });
      const cc = await call(CRM.contacts.createContact, c.ctx, owner.actor, { firstName: `ฟอร์ม${rand}`, phone: "0899999999", sourceDetail: { pageUrl: `https://shop-${rand}.example/lp?email=victim%40mail.example&phone=0811111111&utm_source=fb` } });
      const cid = cc.v?.row?.id ?? cc.v?.contact?.id ?? cc.v?.id;
      const sd = cid ? (await P.crmContact.findUnique({ where: { id: cid }, select: { sourceDetail: true } }))?.sourceDetail : null;
      const pageUrl = String((sd as Any)?.pageUrl ?? "");
      chk("C5.3-L5-m6", "web-tracking data stays ids-only / query-clean: the crm.web.identified outbox payload (→ webhooks, automation, WebhookDelivery) has no firstUrl, and a REST/staff sourceDetail.pageUrl is stored without non-utm query parameters",
        idf.ok && !!ev && !("firstUrl" in ((ev.payload ?? {}) as object)) && cc.ok && !/email=|phone=/.test(pageUrl),
        "fixture: identify binds a consented session ⇒ event payload without firstUrl · createContact(sourceDetail.pageUrl with ?email=&phone=&utm_source=) ⇒ stored pageUrl keeps utm_* only",
        `identify=${desc(idf)} payload=${cut(j(ev?.payload), 160)} · create=${cc.ok ? "ok" : cc.err} pageUrl=${cut(pageUrl, 120)}`, "MINOR");
    });

    // ── L5-m7 · whole-system export needs no confirm + reason ──
    await sub("C5.3-L5-m7", async () => {
      const c = await mkCrm("L5-m7");
      const r = await call(CRM.privacy.exportTenant, c.ctx, owner.actor, { format: "CSV" });
      const jobs = (await P.crmImportJob.count({ where: { tenantId: T, systemId: c.S } })) as number;
      chk("C5.3-L5-m7", "the whole-system CRM export (every visible contact's phone/e-mail/note + all tables) requires the same confirm + reason gate as the contacts CSV export (X9)",
        !r.ok && /VALIDATION/.test(r.err) && jobs === 0,
        "exportTenant(owner, {format:CSV}) without confirm/reason ⇒ VALIDATION (Thai) and no export job queued",
        `exportTenant=${desc(r)} jobs=${jobs}`, "MINOR");
    });
  });

  // ═════════════════════════════════════════ L6 · UI/UX & BUSINESS CORRECTNESS ═════════════════════════════════════════
  await section("L6", ["C5.3-L6-M1", "C5.3-L6-M2", "C5.3-L6-M3", "C5.3-L6-M4", "C5.3-L6-M5", "C5.3-L6-m1", "C5.3-L6-m2", "C5.3-L6-m3", "C5.3-L6-m4", "C5.3-L6-m5", "C5.3-L6-m6", "C5.3-L6-m7", "C5.3-L6-m8", "C5.3-L6-m11"], {}, async () => {
    const MEM = (await import("@/lib/modules/member" as string)) as Any;
    const idOf = (r: Any) => r?.id ?? r?.row?.id ?? r?.contact?.id ?? r?.company?.id ?? r?.deal?.id ?? r?.contactId ?? r?.companyId;
    const mkPipe = async (c: Sys, label: string) => {
      const p = await CRM.pipelines.createPipeline(c.ctx, owner.actor, { name: `${label} ${TAG}`, stages: [{ name: "ใหม่", kind: "OPEN", probability: 10 }, { name: "เสนอราคา", kind: "OPEN", probability: 50 }, { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 }] });
      return { id: p.id as string, st: Object.fromEntries((p.stages as Any[]).map((s) => [s.name, s.id])) as Record<string, string> };
    };

    // ── L6-M1 / M2 · stage requirements: typed-as-text values refused · archiving a required field locks the stage ──
    await sub(["C5.3-L6-M1", "C5.3-L6-M2"], async () => {
      const c = await mkCrm("L6-M1");
      const pp = await mkPipe(c, "ขั้นมีเงื่อนไข");
      const fctx = { ...c.ctx, objectKey: "deal", actor: owner.actor };
      const sec = await MEM.fields.createSection(fctx, { key: `qcL6${rand}`, label: "ข้อมูลดีล L6" });
      await MEM.fields.createField(fctx, { sectionId: sec.id, key: "qcAmt", label: "งบประมาณ", type: "NUMBER" });
      await MEM.fields.createField(fctx, { sectionId: sec.id, key: "qcKind", label: "ประเภทลูกค้า", type: "SELECT", options: { choices: [{ value: "option", label: "โรงงาน" }, { value: "option_2", label: "ร้านค้า" }] } });
      await MEM.fields.createField(fctx, { sectionId: sec.id, key: "qcVip", label: "ลูกค้าวีไอพี", type: "BOOLEAN" });
      const upd = await call(CRM.pipelines.updateStage, c.ctx, owner.actor, pp.st["เสนอราคา"], { requireFields: ["qcAmt", "qcKind", "qcVip"] });
      const k = await mkContact(c, "ลูกค้า L6");
      const mkD = async (t: string) => idOf(await CRM.deals.createDeal(c.ctx, owner.actor, { pipelineId: pp.id, title: `${t} ${TAG}`, contactId: k.id }));
      const d1 = await mkD("ดีลกรอกข้อความ");
      const dCtl = await mkD("ดีลควบคุม");
      // control: typed values the field engine wants
      const ctl = await call(CRM.deals.moveDeal, c.ctx, owner.actor, dCtl, { stageId: pp.st["เสนอราคา"], requireFieldsValues: { qcAmt: 50000, qcKind: "option", qcVip: true } });
      // what DealMoveDialogs.tsx sends: one <input type=text> per missing key ⇒ strings (labels as the user sees them)
      const asText = await call(CRM.deals.moveDeal, c.ctx, owner.actor, d1, { stageId: pp.st["เสนอราคา"], requireFieldsValues: { qcAmt: "50000", qcKind: "โรงงาน", qcVip: "ใช่" } });
      chk("C5.3-L6-M1", "the stage-requirements dialog can satisfy non-text custom fields: the values it sends (text typed into the dialog — \"50000\" for NUMBER, the option LABEL for SELECT, \"ใช่\" for BOOLEAN) move the deal (server coerces by field type, or the dialog renders typed controls — then ORACLE-EDIT to the typed payload)",
        upd.ok && ctl.ok && asText.ok,
        "fixture: stage requires NUMBER + SELECT + BOOLEAN · control with typed values moves · moveDeal with the dialog's string payload moves too (no \"ต้องเป็นตัวเลข\" / internal option codes in the message)",
        `updateStage=${upd.ok ? "ok" : upd.err} · control=${ctl.ok ? "moved" : ctl.err} · dialog-strings=${asText.ok ? "moved" : asText.err}`);
      // M2: dCtl already holds qcAmt=50000; take it back, archive the required field, move again
      const back = await call(CRM.deals.moveDeal, c.ctx, owner.actor, dCtl, { stageId: pp.st["ใหม่"] });
      const layout = await MEM.fields.listLayout(fctx);
      const amt = (layout.sections as Any[]).flatMap((s) => s.fields).find((f: Any) => f.key === "qcAmt");
      const arch = await call(MEM.fields.archiveField, fctx, amt?.id);
      const again = arch.ok ? await call(CRM.deals.moveDeal, c.ctx, owner.actor, dCtl, { stageId: pp.st["เสนอราคา"] }) : arch;
      chk("C5.3-L6-M2", "archiving a deal field that a stage requires never locks the stage: either archiveField is refused (naming the stages that require it) or the archived key stops being required — a deal that holds every live value can still enter",
        ctl.ok && back.ok && (arch.ok ? again.ok : /^[A-Za-z]*Error\((VALIDATION|CONFLICT)\)/.test(arch.err) && arch.msg.includes("เสนอราคา")),
        "fixture: control deal entered the stage with all values, moved back · archiveField(qcAmt) refused with the stage name, OR accepted and the move into the stage succeeds",
        `back=${back.ok ? "ok" : back.err} · archive=${arch.ok ? "accepted" : arch.err} · moveAfterArchive=${arch.ok ? (again.ok ? "moved" : again.err) : "n/a"}`);
    });

    // ── L6-M3 · merge leaves dependents on the merged-away row ──
    await sub("C5.3-L6-M3", async () => {
      const c = await mkCrm("L6-M3", { portal: { enabled: true, loginMethods: ["EMAIL_OTP"], showDeals: false, allowIssue: true } });
      const keep = await mkContact(c, "เก็บ", { email: `${TAG}-keep6@qc.invalid` });
      const drop = await mkContact(c, "รวมทิ้ง", { email: `${TAG}-drop6@qc.invalid` });
      await grantEmail(c, drop.id);
      const seq = await CRM.sequences.createSequence(c.ctx, owner.actor, { name: `ติดตาม L6 ${TAG}`, businessDaysOnly: false, sendWindow: null, steps: [{ kind: "TASK", taskTitle: "โทรติดตาม" }, { kind: "WAIT", waitDays: 1 }, { kind: "TASK", taskTitle: "โทรรอบสอง" }] });
      const en = await call(CRM.sequences.enroll, c.ctx, owner.actor, { sequenceId: seq?.id ?? seq?.sequence?.id, contactId: drop.id });
      const sm = await call(CRM.emails.sendEmail, c.ctx, owner.actor, { contactId: drop.id, subject: `สอบถาม ${TAG}`, bodyHtml: "<p>สอบถามราคา</p>" }, { transport });
      await P.crmScoreLog.create({ data: { tenantId: T, contactId: drop.id, points: 30, reason: "เปิดอีเมล" } });
      await P.crmContact.update({ where: { id: drop.id }, data: { score: 30 } });
      await P.crmWebSession.create({ data: { tenantId: T, systemId: c.S, visitorId: `v-${rand}`, contactId: drop.id } });
      const mg = await call(CRM.contacts.mergeContacts, c.ctx, owner.actor, { keepId: keep.id, mergeId: drop.id, confirm: true, reason: `รวม L6 ${TAG}` });
      const on = async (m: string) => {
        const rows = (await (P as Any)[m].findMany({ where: { tenantId: T, contactId: { in: [keep.id, drop.id] } }, select: { contactId: true } })) as Any[];
        return { keep: rows.filter((r) => r.contactId === keep.id).length, drop: rows.filter((r) => r.contactId === drop.id).length };
      };
      const enr = (await P.crmSequenceEnrollment.findMany({ where: { tenantId: T, contactId: { in: [keep.id, drop.id] } }, select: { contactId: true, status: true } })) as Any[];
      const emails = await on("crmEmailMessage");
      const logs = await on("crmScoreLog");
      const webs = await on("crmWebSession");
      const kScore = (await P.crmContact.findUnique({ where: { id: keep.id }, select: { score: true } }))?.score ?? 0;
      // company merge: file link + accepted portal access on the dropped company
      const ck = idOf(await CRM.companies.createCompany(c.ctx, owner.actor, { name: `บริษัทเก็บ ${TAG}` }));
      const cm = idOf(await CRM.companies.createCompany(c.ctx, owner.actor, { name: `บริษัทรวม ${TAG}` }));
      const px = await mkContact(c, "พอร์ทัล", { email: `${TAG}-px@qc.invalid` });
      await call(CRM.companies.addContact, c.ctx, owner.actor, cm, { contactId: px.id });
      await P.crmFileLink.create({ data: { tenantId: T, systemId: c.S, entityType: "COMPANY", entityId: cm, fileId: `f-${rand}`, name: "สัญญาเช่า.pdf", size: 1000, mime: "application/pdf" } });
      await P.crmPortalAccess.create({ data: { tenantId: T, systemId: c.S, companyId: cm, contactId: px.id, acceptedAt: new Date() } });
      const mc = await call(CRM.companies.mergeCompanies, c.ctx, owner.actor, { keepId: ck, mergeId: cm, confirm: true, reason: `รวมบริษัท L6 ${TAG}` });
      const fileOnKeep = (await P.crmFileLink.count({ where: { tenantId: T, entityType: "COMPANY", entityId: ck } })) as number;
      const pa = (await P.crmPortalAccess.findMany({ where: { tenantId: T, contactId: px.id }, select: { companyId: true, revokedAt: true } })) as Any[];
      const portalOk = pa.some((r) => r.companyId === ck && !r.revokedAt) || (pa.every((r) => r.revokedAt) && (mc.v?.warnings ?? []).length > 0);
      const fixture = en.ok && sm.ok && mg.ok && mc.ok;
      chk("C5.3-L6-M3", "merge moves every dependent to the kept row (blueprint §11.1/§5.2): contact merge — enrollment (one ACTIVE on keep), e-mails, score logs (+ score recomputed), web sessions; company merge — file links and portal access (moved, or revoked with a staff warning)",
        fixture && enr.some((r) => r.contactId === keep.id && r.status === "ACTIVE") && !enr.some((r) => r.contactId === drop.id && r.status === "ACTIVE") && emails.drop === 0 && emails.keep >= 1 && logs.drop === 0 && webs.drop === 0 && kScore >= 30 && fileOnKeep === 1 && portalOk,
        "after mergeContacts: 0 dependents left on DROP, 1 ACTIVE enrollment on KEEP, KEEP score ≥ 30 · after mergeCompanies: file link on KEEP, portal access on KEEP (or revoked + warning)",
        `enroll=${en.ok ? "ok" : en.err} send=${sm.ok ? "ok" : sm.err} merge=${mg.ok ? j({ warnings: mg.v?.warnings }) : mg.err} · enrollments=${j(enr.map((r) => `${r.contactId === keep.id ? "KEEP" : "DROP"}:${r.status}`))} emails=${j(emails)} scoreLogs=${j(logs)} web=${j(webs)} keepScore=${kScore} · companyMerge=${mc.ok ? j({ warnings: mc.v?.warnings }) : mc.err} fileOnKeep=${fileOnKeep} portal=${j(pa.map((r) => `${r.companyId === ck ? "KEEP" : r.companyId === cm ? "DROP" : "?"}${r.revokedAt ? ":revoked" : ""}`))}`);
    });

    // ── L6-M4 · 7 of 11 staff-notification templates never sent (behaviour: lead.assigned · deal.closed · customer.replied · invoice.paid · SOURCE: the rest) ──
    await sub("C5.3-L6-M4", async () => {
      const NS = (await import("@/lib/modules/crm/notifications-shared" as string)) as Any;
      const OC = (await import("@/lib/outbox-consumers" as string)) as Any;
      const B32 = "abcdefghijklmnopqrstuvwxyz234567";
      const KEY = Array.from(randomBytes(8)).map((b) => B32[b % 32]).join("");
      const c = await mkCrm("L6-M4", { email: { inboundKey: KEY, inboundEnabled: true, bccCaptureEnabled: true, strangerToLead: false, fromMode: "SHARK", replyToMode: "SHARK", copyMode: "NONE" } });
      const fx: string[] = [];
      // lead.assigned — assignment
      const k = await mkContact(c, "lead ใหม่");
      const as = await call(CRM.contacts.assignContact, c.ctx, owner.actor, k.id, { userId: thana.userId });
      fx.push(`assign=${as.ok ? "ok" : as.err}`);
      // deal.closed — thana's deal moved to WON by the owner
      const k2 = await mkContact(c, "ลูกค้าปิดดีล", { ownerUserId: thana.userId, email: `${TAG}-reply@qc.invalid` });
      const dW = await mkDeal(c, k2.id, 300_000, { ownerUserId: thana.userId, title: `ดีลปิด ${TAG}` });
      const mv = await call(CRM.deals.moveDeal, c.ctx, owner.actor, dW.id, { stageId: c.WON });
      fx.push(`won=${mv.ok ? "ok" : mv.err}`);
      // customer.replied — thana's contact writes back to the shop's CRM address
      const ing = await call(CRM.emails.ingestInbound, { messageId: `<${TAG}-reply@cust.example>`, from: k2.email, to: [`crm+${KEY}@shark.in.th`], cc: [], subject: "Re: ใบเสนอราคา", text: "ตกลงครับ", html: "<p>ตกลงครับ</p>", headers: {}, attachments: [] });
      fx.push(`inbound=${ing.ok ? (ing.v?.handled ? "stored" : ing.v?.reason) : ing.err}`);
      // invoice.paid — the account module's event for the invoice anchored on thana's deal
      const INV = await doc({ docType: "INVOICE", status: "PAID", subTotal: 300_000, vatAmount: 21_000, grandTotal: 321_000, paidTotal: 321_000 });
      const dI = await mkDeal(c, k2.id, 300_000, { ownerUserId: thana.userId, invoiceDocId: INV.id, title: `ดีลใบแจ้งหนี้ ${TAG}` });
      void dI;
      const evI = await P.outboxEvent.create({ data: { tenantId: T, systemId: ACC, type: "account.invoice.paid", payload: { documentId: INV.id, docNo: `${TAG}-INV`, grandTotal: 321_000 }, idempotencyKey: `account.invoice.paid#${INV.id}` } });
      // process THIS system's events (and that one account event) through the real consumers — the OUTBOX GUARD keeps the drain on this tenant
      OUTBOX_EXTRA.where = { OR: [{ systemId: c.S }, { id: evI.id }] };
      try { const dr = await call(OC.drainAll); fx.push(`drain=${dr.ok ? j(dr.v) : dr.err}`); } finally { OUTBOX_EXTRA.where = {}; }
      // positive control: the notification channel itself reaches thana on this system (a template that IS sent today)
      const ctlN = await call(CRM.notifications.notifyStaff, { tenantId: T, systemId: c.S, actorUserId: null }, { key: "commission.status", userIds: [thana.userId], refType: "QcControl", refId: `${TAG}-ctl`, vars: { count: 1 } });
      const got = (await P.appNotification.findMany({ where: { tenantId: T, recipientUserId: thana.userId, body: { contains: c.S } }, select: { body: true } })) as Any[];
      const sent = (key: string) => got.some((n) => new RegExp(`n=${key.replace(/\./g, "\\.")}(?:&|\\s|$)`).test(String(n.body)));
      const BEH = ["lead.assigned", "deal.closed", "customer.replied", "invoice.paid"];
      const behMissing = BEH.filter((key) => !sent(key));
      const keys = ((NS.CRM_NOTIF_KEYS ?? []) as string[]).map(String).filter(Boolean);
      const src = [...walk("src/lib"), ...walk("src/app")].filter((f) => !/notifications-shared\.ts$/.test(f)).map((f) => stripComments(read(f))).join("\n");
      // a real sender call site: notifyStaff(...) whose argument text carries `key: "<k>"` (not any object literal that mentions the key)
      const callArgs = [...src.matchAll(/\bnotifyStaff\s*\(([\s\S]{0,600}?)\)\s*[;,)]/g)].map((m) => m[1] ?? "").join("\n");
      const srcMissing = keys.filter((key) => !BEH.includes(key)).filter((key) => !new RegExp(`key:\\s*["'\`]${key.replace(/\./g, "\\.")}["'\`]`).test(callArgs));
      // control for the scanner itself: the 4 templates that ARE sent today are found at their notifyStaff call sites
      const LIVE = ["deal.stale.digest", "commission.status", "quota.progress", "commission.pending"];
      const scannerOk = LIVE.every((key) => new RegExp(`key:\\s*["'\`]${key.replace(/\./g, "\\.")}["'\`]`).test(callArgs));
      chk("C5.3-L6-M4", "every staff-notification template the settings page offers is actually sent (US1/§7.4) — by BEHAVIOUR for lead.assigned · deal.closed · customer.replied · invoice.paid (real writes + this system's events through the real consumers), by SOURCE for tasks.today · activity.reminder · lead.hot (hourly digest / reminder / score consumers are cron-driven)",
        as.ok && mv.ok && ing.ok && ctlN.ok && sent("commission.status") && scannerOk && keys.length === 11 && behMissing.length === 0 && srcMissing.length === 0,
        "control: notifyStaff(commission.status → thana) delivers on this system ⇒ thana (owner of the lead/deal/contact) receives AppNotifications whose link carries ?n=lead.assigned, ?n=deal.closed, ?n=customer.replied, ?n=invoice.paid · every other template key has a `key: \"<k>\"` sender outside notifications-shared.ts (hiding dead rows instead ⇒ ORACLE-EDIT)",
        `${fx.join(" ")} · control(notifyStaff commission.status)=${ctlN.ok ? (sent("commission.status") ? "delivered" : `not delivered ${j(ctlN.v)}`) : ctlN.err} · thana notifications on this system=${got.length} · behaviour missing=${behMissing.join(",") || "-"} · scanner control (4 live senders found)=${scannerOk} · source missing=${srcMissing.join(",") || "-"}`);
    });

    // ── L6-M5 · company lifecycle never written ──
    await sub("C5.3-L6-M5", async () => {
      const c = await mkCrm("L6-M5");
      const pp = await mkPipe(c, "บริษัทชนะ");
      const co = idOf(await CRM.companies.createCompany(c.ctx, owner.actor, { name: `บริษัทชนะ ${TAG}` }));
      const k = idOf(await CRM.contacts.createContact(c.ctx, owner.actor, { firstName: `สมชาย${rand}`, lastName: "ใจดี", phone: "0812345679" }));
      await call(CRM.companies.addContact, c.ctx, owner.actor, co, { contactId: k, isPrimary: true });
      const d = idOf(await CRM.deals.createDeal(c.ctx, owner.actor, { pipelineId: pp.id, title: `ดีลบริษัท ${TAG}`, contactId: k, companyId: co, valueSatang: 5_000_000 }));
      const won = await call(CRM.deals.moveDeal, c.ctx, owner.actor, d, { stageId: pp.st["ชนะ"] });
      const row = await P.crmCompany.findUnique({ where: { id: co }, select: { lifecycleStage: true, score: true, wonValueSatang: true } });
      const ctl = await P.crmContact.findUnique({ where: { id: k }, select: { lifecycleStage: true } });
      chk("C5.3-L6-M5", "a company whose deal is WON is a customer: CrmCompany.lifecycleStage moves forward to CUSTOMER (the list badge, 360 header and the automation condition \"ขั้นของบริษัท\" read it) · score: owner must define it or hide it (not pinned)",
        won.ok && ctl?.lifecycleStage === "CUSTOMER" && B(row?.wonValueSatang) === 5_000_000 && row?.lifecycleStage === "CUSTOMER",
        "fixture: deal WON · company cache wonValue 5,000,000 · contact CUSTOMER (positive control) ⇒ company lifecycleStage CUSTOMER",
        `won=${won.ok ? "ok" : won.err} · company=${j({ ...row, wonValueSatang: B(row?.wonValueSatang) })} · contact(control)=${ctl?.lifecycleStage}`);
    });

    // ── L6-m1 · "overdue" means two things across web / mobile / widget ──
    await sub("C5.3-L6-m1", async () => {
      const now = new Date();
      const thMin = ((now.getUTCHours() + 7) % 24) * 60 + now.getUTCMinutes();
      const c = await mkCrm("L6-m1");
      const k = await mkContact(c, "งานค้าง");
      const W = (await import("@/lib/modules/crm/widgets" as string)) as Any;
      const la = await call(CRM.activities.logActivity, c.ctx, owner.actor, { type: "TASK", title: `โทรหาลูกค้า ${TAG}`, contactId: k.id, dueAt: new Date(now.getTime() - 60_000) });
      const wo = await call(CRM.activities.listActivities, c.ctx, owner.actor, { status: "overdue" });
      const wt = await call(CRM.activities.listActivities, c.ctx, owner.actor, { status: "today" });
      const mob = await call(CRM.mobile.todayTasks, c.ctx, owner.actor, now);
      const wid = await call(W.todayTasks, c.ctx, owner.actor, { now });
      const webO = wo.ok ? (wo.v.items?.length ?? 0) : -1;
      const webT = wt.ok ? (wt.v.items?.length ?? 0) : -1;
      const fixture = thMin >= 3 && la.ok && wo.ok && wt.ok && mob.ok && wid.ok;
      chk("C5.3-L6-m1", "one definition of today/overdue on every surface: a task due 60 s ago is listed in exactly one of the web tabs, and the mobile and widget counters say the same",
        fixture && webO + webT === 1 && mob.v.counts.overdue === webO && wid.v.counts.overdue === webO,
        "fixture (not in the first 3 min of the Thai day) · web overdue + today = 1 · mobile.counts.overdue = widget.counts.overdue = web overdue",
        `thaiMinute=${thMin} log=${la.ok ? "ok" : la.err} · web overdue=${webO} today=${webT} · mobile=${mob.ok ? j(mob.v.counts) : mob.err} · widget=${wid.ok ? j(wid.v.counts) : wid.err}`, "MINOR");
    });

    // ── L6-m2 · custom DATE accepts a Buddhist-era year in ISO shape ──
    await sub("C5.3-L6-m2", async () => {
      const c = await mkCrm("L6-m2");
      const k = await mkContact(c, "สัญญา");
      const cf = { ...c.ctx, objectKey: "contact", actor: owner.actor };
      const sec = await MEM.fields.createSection(cf, { key: `qcL6c${rand}`, label: "สัญญา" });
      await MEM.fields.createField(cf, { sectionId: sec.id, key: "qcEnd", label: "วันหมดสัญญา", type: "DATE" });
      const r = await call(MEM.fields.setFieldValues, cf, k.id, { qcEnd: "2569-12-31" }, { via: "STAFF", byUserId: owner.userId });
      const v = (await P.customRecordValue.findFirst({ where: { tenantId: T, recordId: k.id, valueDate: { not: null } }, select: { valueDate: true } }))?.valueDate as Date | undefined;
      const year = v ? v.getUTCFullYear() : null;
      chk("C5.3-L6-m2", "a custom DATE never stores a Buddhist-era year as AD: \"2569-12-31\" is refused with a Thai hint (พ.ศ. → ค.ศ.) or converted to 2026-12-31",
        (!r.ok && /\((VALIDATION|INPUT|-)\)|MemberInputError/.test(r.err) && /พ\.ศ\.|ค\.ศ\./.test(r.msg)) || (r.ok && year === 2026),
        "setFieldValues({qcEnd:\"2569-12-31\"}) ⇒ refused, or stored year 2026", `set=${r.ok ? "accepted" : r.err} storedYear=${year}`, "MINOR");
    });

    // ── L6-m3 · Thai collation (sort) and decomposed sara am (search) ──
    await sub("C5.3-L6-m3", async () => {
      const c = await mkCrm("L6-m3");
      const names = ["ไพโรจน์", "กมล", "เอกชัย", "สมชาย", "โชคดี", "ขวัญใจ", "แก้วตา", "อรุณ"];
      for (const n of names) await P.crmContact.create({ data: { tenantId: T, systemId: c.S, name: n, firstName: n, ownerUserId: owner.userId } });
      const decomposed = `น\u0E49\u0E4D\u0E32ผึ้ง${rand}`; // น้ + ํ + า (how some keyboards / pasted text store "น้ำ")
      const dc = await call(CRM.contacts.createContact, c.ctx, owner.actor, { firstName: decomposed, phone: "0823456789" });
      const lst = await call(CRM.contacts.listContacts, c.ctx, owner.actor, { sort: "name", pageSize: 50 });
      const got = lst.ok ? (lst.v.items as Any[]).map((x) => String(x.name)).filter((n) => names.includes(n)) : [];
      const icu = ((await P.$queryRawUnsafe(`SELECT n FROM unnest($1::text[]) AS n ORDER BY n COLLATE "th-TH-x-icu"`, names).catch(() => [])) as Any[]).map((r) => String(r.n));
      const sr = await call(CRM.contacts.listContacts, c.ctx, owner.actor, { q: `น้ำผึ้ง${rand}` });
      const found = sr.ok && (sr.v.items as Any[]).length >= 1;
      chk("C5.3-L6-m3", "Thai names sort like a Thai dictionary (leading vowels เ แ โ ใ ไ ignored, not after ฮ) and a name stored with decomposed sara am (ํ + า) is found by a search typed with ำ",
        icu.length === names.length && lst.ok && j(got) === j(icu) && dc.ok && found,
        "fixture: th-TH-x-icu order computed by the DB · listContacts(sort name) = that order · listContacts(q \"น้ำผึ้ง…\") finds the decomposed contact",
        `icu=${icu.join(",")} · list=${got.join(",")} · create=${dc.ok ? "ok" : dc.err} search=${sr.ok ? (sr.v.items as Any[]).length : sr.err}`, "MINOR");
    });

    // ── L6-m4 / m7 · legacy (v1 / public form) contact creation: honorific as first name · phone moved into a hidden note ──
    await sub(["C5.3-L6-m4", "C5.3-L6-m7"], async () => {
      const c = await mkCrm("L6-m4", { uiVersion: 1 });
      const a = await call(CRM.contacts.createContactFromLegacy, c.ctx, { name: "นาย สมชาย ใจดี" });
      const b = await call(CRM.contacts.createContactFromLegacy, c.ctx, { name: "นางสาวสมหญิง ใจงาม" });
      const rows = await P.crmContact.findMany({ where: { id: { in: [a.v?.id, b.v?.id].filter(Boolean) } }, select: { id: true, firstName: true, titleTh: true } });
      const fa = rows.find((r: Any) => r.id === a.v?.id); const fb = rows.find((r: Any) => r.id === b.v?.id);
      chk("C5.3-L6-m4", "a Thai honorific is never the first name: \"นาย สมชาย ใจดี\" → firstName สมชาย (titleTh นาย) · \"นางสาวสมหญิง ใจงาม\" → firstName สมหญิง ({{contact.firstName}} in mail = \"เรียนคุณสมชาย\")",
        a.ok && b.ok && fa?.firstName === "สมชาย" && fb?.firstName === "สมหญิง",
        "createContactFromLegacy (v1 add form · public form · bridge leads) strips known prefixes into titleTh before splitting",
        `a=${j({ firstName: fa?.firstName, titleTh: fa?.titleTh })} b=${j({ firstName: fb?.firstName, titleTh: fb?.titleTh })}`, "MINOR");
      const p1 = await call(CRM.contacts.createContactFromLegacy, c.ctx, { name: `ต่อสาย ${rand}`, phone: "02-123-4567 ต่อ 12" });
      const p2 = await call(CRM.contacts.createContactFromLegacy, c.ctx, { name: `เลขไทย ${rand}`, phone: "๐๘๑๒๓๔๕๖๗๘" });
      const p3 = await call(CRM.contacts.createContactFromLegacy, c.ctx, { name: `สองอีเมล ${rand}`, email: `somchai.${rand}@gmail.com, somsri.${rand}@hotmail.com` });
      const ph = await P.crmContact.findMany({ where: { id: { in: [p1.v?.id, p2.v?.id, p3.v?.id].filter(Boolean) } }, select: { id: true, phone: true, email: true } });
      const x1 = ph.find((r: Any) => r.id === p1.v?.id)?.phone ?? null; const x2 = ph.find((r: Any) => r.id === p2.v?.id)?.phone ?? null;
      const x3 = ph.find((r: Any) => r.id === p3.v?.id)?.email ?? null;
      chk("C5.3-L6-m7", "v1 regression: contact data the v1 form accepted stays in its column — \"02-123-4567 ต่อ 12\" kept in phone (raw or normalised with its extension), Thai numerals \"๐๘๑…\" normalised to 0812345678, and an e-mail field holding two addresses keeps (at least) the first one in email",
        p1.ok && p2.ok && p3.ok && !!x1 && /21234567/.test(String(x1).replace(/\D/g, "")) && String(x2 ?? "").replace(/\D/g, "") === "0812345678" && String(x3 ?? "").toLowerCase().includes(`somchai.${rand}@gmail.com`),
        "createContactFromLegacy keeps phone and e-mail in CrmContact.phone / .email (not only in the note the v1 UI never shows)", `extension=${x1} · thaiDigits=${x2} · email=${x3}`, "MINOR");
    });

    // ── L6-m5 · a mistaken WON makes the contact a customer for good ──
    await sub("C5.3-L6-m5", async () => {
      const c = await mkCrm("L6-m5");
      const pp = await mkPipe(c, "ชนะผิด");
      const lr = await call(CRM.lostReasons.createLostReason, c.ctx, owner.actor, { label: `ราคาสูง ${rand}` });
      const k = idOf(await CRM.contacts.createContact(c.ctx, owner.actor, { firstName: `ชนะผิด${rand}`, phone: "0834567890" }));
      const d = idOf(await CRM.deals.createDeal(c.ctx, owner.actor, { pipelineId: pp.id, title: `ดีลกดผิด ${TAG}`, contactId: k }));
      const w = await call(CRM.deals.moveDeal, c.ctx, owner.actor, d, { stageId: pp.st["ชนะ"] });
      const mid = (await P.crmContact.findUnique({ where: { id: k }, select: { lifecycleStage: true } }))?.lifecycleStage;
      const l = await call(CRM.deals.moveDeal, c.ctx, owner.actor, d, { stageId: pp.st["แพ้"], lostReasonId: lr.v?.id });
      const after = (await P.crmContact.findUnique({ where: { id: k }, select: { lifecycleStage: true } }))?.lifecycleStage;
      const fixed = after !== "CUSTOMER" ? { ok: true, err: "" } : await call(CRM.contacts.setLifecycle, c.ctx, owner.actor, k, "PROSPECT");
      chk("C5.3-L6-m5", "a mistaken WON can be undone for the contact: after WON → LOST (no other WON deal) the contact steps back from CUSTOMER, or the owner can correct it (setLifecycle PROSPECT with a reason)",
        w.ok && mid === "CUSTOMER" && l.ok && fixed.ok,
        "fixture: WON made the contact CUSTOMER · WON→LOST with a reason · then lifecycle ≠ CUSTOMER, or setLifecycle(owner, PROSPECT) succeeds",
        `won=${w.ok ? "ok" : w.err} mid=${mid} lost=${l.ok ? "ok" : l.err} after=${after} ownerCorrect=${after !== "CUSTOMER" ? "n/a" : fixed.ok ? "ok" : fixed.err}`, "MINOR");
    });

    // ── L6-m6 · skipping the business template leaves zero lost reasons ──
    await sub("C5.3-L6-m6", async () => {
      const TPL = (await import("@/lib/modules/crm/templates" as string)) as Any;
      const c = await mkCrm("L6-m6");
      const before = (await P.crmLostReason.count({ where: { tenantId: T, systemId: c.S } })) as number;
      const sk = await call(TPL.skipBusinessTemplate, c.ctx);
      const after = (await P.crmLostReason.count({ where: { tenantId: T, systemId: c.S, active: true } }).catch(async () => P.crmLostReason.count({ where: { tenantId: T, systemId: c.S } }))) as number;
      chk("C5.3-L6-m6", "a CRM that skipped the business template can still close deals as lost: skipBusinessTemplate (and the first v2 switch) seeds the system lost reasons",
        before === 0 && sk.ok && after >= 1, "fixture: fresh v2 system has 0 lost reasons · after skipBusinessTemplate ≥ 1 active lost reason", `before=${before} skip=${desc(sk)} after=${after}`, "MINOR");
    });

    // ── L6-m8 · a free-mail company domain captures every stranger from that provider ──
    await sub("C5.3-L6-m8", async () => {
      const B32 = "abcdefghijklmnopqrstuvwxyz234567";
      const KEY = Array.from(randomBytes(8)).map((b) => B32[b % 32]).join("");
      const c = await mkCrm("L6-m8", { email: { inboundKey: KEY, inboundEnabled: true, bccCaptureEnabled: true, strangerToLead: true, fromMode: "SHARK", replyToMode: "SHARK", copyMode: "NONE" } });
      const cr = await call(CRM.companies.createCompany, c.ctx, owner.actor, { name: `ร้านจีเมล ${TAG}`, emailDomain: "gmail.com" });
      const co = cr.ok ? idOf(cr.v) : null;
      let filed: string | null = null;
      if (cr.ok) {
        const ing = await call(CRM.emails.ingestInbound, { messageId: `<${TAG}-fm@gmail.com>`, from: `somebody.${rand}@gmail.com`, to: [`crm+${KEY}@shark.in.th`], cc: [], subject: "สอบถาม", text: "สนใจสินค้า", html: "<p>สนใจสินค้า</p>", headers: {}, attachments: [] });
        filed = ing.ok && ing.v?.emailId ? (await P.crmEmailMessage.findUnique({ where: { id: ing.v.emailId }, select: { companyId: true } }))?.companyId ?? null : `ingest:${ing.ok ? ing.v?.reason : ing.err}`;
      }
      chk("C5.3-L6-m8", "a free-mail domain (gmail.com …) is never a company's e-mail domain for matching: creating it is refused, or an unknown sender from that provider is not filed under the company",
        (!cr.ok && /VALIDATION/.test(cr.err)) || (cr.ok && filed !== co && !String(filed).startsWith("ingest:")),
        "createCompany({emailDomain:\"gmail.com\"}) ⇒ VALIDATION, or a stranger@gmail.com inbound is stored without that companyId",
        `create=${cr.ok ? "accepted" : cr.err} · inboundFiledUnderCompany=${cr.ok ? filed === co : "n/a"} (${filed})`, "MINOR");
    });

    // ── L6-m11 · a saved view breaks for everyone once a filtered field is archived ──
    await sub("C5.3-L6-m11", async () => {
      const c = await mkCrm("L6-m11");
      const cf = { ...c.ctx, objectKey: "contact", actor: owner.actor };
      const sec = await MEM.fields.createSection(cf, { key: `qcL6v${rand}`, label: "กลุ่ม" });
      const fld = await MEM.fields.createField(cf, { sectionId: sec.id, key: "qcSeg", label: "กลุ่มลูกค้า", type: "TEXT", filterable: true });
      const k = await mkContact(c, "ในมุมมอง");
      await MEM.fields.setFieldValues(cf, k.id, { qcSeg: "vip" }, { via: "STAFF", byUserId: owner.userId });
      const tv = await P.team.create({ data: { tenantId: T, name: `ทีมมุมมอง ${TAG}` } });
      const v = await call(CRM.views.createView, c.ctx, owner.actor, { objectKey: "contact", name: `VIP ${TAG}`, scope: "TEAM", teamId: tv.id, filters: { f: { qcSeg: "vip" } } });
      const before = v.ok ? await call(CRM.contacts.listContacts, c.ctx, owner.actor, { savedViewId: v.v.id }) : v;
      const arch = await call(MEM.fields.archiveField, cf, fld.id);
      const after = v.ok ? await call(CRM.contacts.listContacts, c.ctx, owner.actor, { savedViewId: v.v.id }) : v;
      chk("C5.3-L6-m11", "a shared saved view keeps working after a field it filters on is archived: the dead filter is skipped (with a note) — or archiving is refused while views use the field",
        v.ok && before.ok && (before.v.items as Any[]).length >= 1 && ((arch.ok && after.ok) || (!arch.ok && /VALIDATION|CONFLICT/.test(arch.err))),
        "fixture: TEAM view on qcSeg=vip lists 1 contact · archiveField ⇒ listContacts(savedViewId) still answers (rows, no VALIDATION), or archive refused",
        `view=${v.ok ? "ok" : v.err} before=${before.ok ? (before.v.items as Any[]).length : before.err} archive=${arch.ok ? "ok" : arch.err} after=${after.ok ? `${(after.v.items as Any[]).length} rows` : after.err}`, "MINOR");
    });
  });

  // ═════════════════════════════════════════ X · CROSS-SURFACE MONEY CONSISTENCY (L2 meta-point) ═════════════════════════════════════════
  await section("X", ["C5.3-X1"], {}, async () => {
    const PAYS = CRM.payments;
    const CORE = (await import("@/lib/platform/crm-bridges/core" as string)) as Any;
    const c = await mkCrm("X");
    const rule = await P.crmCommissionRule.create({ data: { tenantId: T, systemId: c.S, name: `กฎ X ${TAG}`, basis: "PAID", kind: "PCT", config: { pctBp: 1_000 }, productIds: [] } });
    void rule;
    const kW = await mkContact(c, "ลูกค้า W");
    const kV = await mkContact(c, "ลูกค้า V");
    const kO = await mkContact(c, "ลูกค้า O");
    // W: quotation 107,000 (100,000 + VAT) → deposit 32,100 paid → invoice (deposit deducted) 74,900 paid → WON → credit note 10,700 (10,000 + VAT)
    const Q = await doc({ docType: "QUOTATION", status: "ACCEPTED", subTotal: 10_000_000, vatAmount: 700_000, grandTotal: 10_700_000 });
    const DR = await doc({ docType: "DEPOSIT_RECEIPT", status: "AWAITING_PAYMENT", sourceDocId: Q.id, subTotal: 3_000_000, vatAmount: 210_000, grandTotal: 3_210_000 });
    const INV = await doc({ docType: "INVOICE", status: "AWAITING_PAYMENT", sourceDocId: Q.id, subTotal: 10_000_000, vatAmount: 700_000, depositDeducted: 3_210_000, grandTotal: 7_490_000 });
    const W = await mkDeal(c, kW.id, 10_000_000, { quotationDocId: Q.id, ownerUserId: rep.userId, title: `ดีล W ${TAG}` });
    const fx: string[] = [];
    const note = (label: string, r: Res) => { fx.push(`${label}=${r.ok ? "ok" : r.err}`); return r; };
    const pDR = await pay(DR.id, 3_210_000);
    note("W.dr", await call(PAYS.recordDocPayment, c.ctx, { documentId: DR.id, paymentId: pDR.id, amountSatang: 3_210_000 }));
    note("W.link", await call(CRM.deals.linkInvoiceFromBridge, c.ctx, { quotationDocId: Q.id, invoiceDocId: INV.id }));
    const pINV = await pay(INV.id, 7_490_000);
    note("W.inv", await call(PAYS.recordDocPayment, c.ctx, { documentId: INV.id, paymentId: pINV.id, amountSatang: 7_490_000 }));
    note("W.won", await call(CRM.deals.moveDeal, c.ctx, owner.actor, W.id, { stageId: c.WON }));
    const CN = await doc({ docType: "CREDIT_NOTE", status: "ISSUED", sourceDocId: INV.id, subTotal: 1_000_000, vatAmount: 70_000, grandTotal: 1_070_000 });
    note("W.cn", await call(CORE.onDocumentIssued, { id: `${TAG}-xcn`, tenantId: T, type: "account.document.issued", payload: { documentId: CN.id } }));
    // V: invoice 10,700 (10,000 + VAT) paid → commission approved → WON → payment voided ⇒ clawback row (REVERSED −1,000)
    const INV2 = await doc({ docType: "INVOICE", status: "AWAITING_PAYMENT", subTotal: 1_000_000, vatAmount: 70_000, grandTotal: 1_070_000 });
    const V = await mkDeal(c, kV.id, 1_000_000, { invoiceDocId: INV2.id, ownerUserId: rep.userId, title: `ดีล V ${TAG}` });
    const pV = await pay(INV2.id, 1_070_000);
    note("V.pay", await call(PAYS.recordDocPayment, c.ctx, { documentId: INV2.id, paymentId: pV.id, amountSatang: 1_070_000 }));
    note("V.won", await call(CRM.deals.moveDeal, c.ctx, owner.actor, V.id, { stageId: c.WON }));
    const commBefore = (await P.crmCommission.findMany({ where: { tenantId: T, systemId: c.S }, select: { dealId: true, status: true, amountSatang: true } })) as Any[];
    note("V.void", await call(PAYS.reverseDocPayment, c.ctx, { documentId: INV2.id, paymentId: pV.id, reason: `ยกเลิก ${TAG}` }));
    // O: an open 2,000,000 at 20 % + an OMITTED open 1,000,000 at 20 %
    await mkDeal(c, kO.id, 2_000_000, { ownerUserId: rep.userId, title: `ดีล O ${TAG}` });
    await mkDeal(c, kO.id, 1_000_000, { ownerUserId: rep.userId, forecastCategory: "OMITTED", title: `ดีล O2 ${TAG}` });
    const comm = (await P.crmCommission.findMany({ where: { tenantId: T, systemId: c.S }, select: { dealId: true, status: true, amountSatang: true, periodKey: true } })) as Any[];
    const rows = (await P.crmDeal.findMany({ where: { tenantId: T, systemId: c.S }, select: { id: true, kind: true, valueSatang: true, paidSatang: true, wonValueSatang: true } })) as Any[];
    const fixture = fx.every((x) => x.endsWith("=ok")) && rows.filter((r) => r.kind === "WON").length === 2 && commBefore.length >= 2 && comm.some((x) => x.status === "REVERSED");

    // expected on the controller's basis (Q14 pending)
    const EXP_WON = WON_BASIS === "PRE_VAT" ? 10_000_000 - 1_000_000 + 1_000_000 : 10_700_000 - 1_070_000 + 1_070_000; // W net of CN + V (won without money ⇒ its value)
    // SF2: commission basis is decoupled from WON_BASIS — the pre-VAT part of each payment (W 3,000,000 + 7,000,000 − CN 1,000,000; V clawed back) × 10 %
    const EXP_COMM = 900_000;
    // SF1: a credit note lowers paid by its grand ⇒ W 10,700,000 − 1,070,000; V's only payment voided ⇒ 0 · quota follows paid
    const EXP_PAID = 9_630_000;
    const EXP_WEIGHTED = 400_000;

    // surfaces
    const S: Record<string, Record<string, number | null | string>> = {};
    const kp = await call(CRM.home.kpis, c.ctx, owner.actor, {});
    S.home = kp.ok ? { won: kp.v.won?.valueSatang, weighted: kp.v.weighted?.valueSatang } : { err: kp.err };
    const bd = await call(CRM.deals.getBoard, c.ctx, owner.actor, {});
    S.board = bd.ok ? { weighted: (bd.v.columns as Any[]).reduce((s, x) => s + Number(x.weightedSatang ?? 0), 0) } : { err: bd.err };
    const fc = await call(CRM.deals.forecast, c.ctx, owner.actor, {});
    S.forecast = fc.ok ? { weighted: (fc.v?.rows as Any[] ?? []).reduce((s: number, r: Any) => s + Number(r.weightedSatang ?? 0), 0) } : { err: fc.err };
    const ov = await call(CRM.reports.overview, c.ctx, owner.actor, period);
    S.reportsOverview = ov.ok ? { won: ov.v.wonValueSatang, paid: ov.v.paidSatang, weighted: ov.v.weightedSatang } : { err: ov.err };
    const rp = await call(CRM.reports.reps, c.ctx, owner.actor, period);
    const repRow = rp.ok ? (rp.v.rows as Any[]).find((x) => x.key === rep.userId) : null;
    S.reportsReps = rp.ok ? { won: repRow?.wonValueSatang, paid: repRow?.paidSatang, commission: repRow?.commissionSatang } : { err: rp.err };
    const cr = await call(CRM.commissions.report, c.ctx, owner.actor, { periodKey: month });
    const netRow = cr.ok ? (cr.v.rows as Any[]).find((x) => x.userId === rep.userId) : null;
    S.commissionsReport = cr.ok ? { commission: netRow?.netSatang } : { err: cr.err };
    // quota (SF1: quota attainment follows paid) — the rep's USER progress for this period
    const qp = await call(CRM.quotas.progress, c.ctx, owner.actor, { ownerType: "USER", ownerId: rep.userId, periodKey: month });
    S.quota = qp.ok ? { paid: qp.v.paid } : { err: qp.err };
    // clawbacks land in the next free period (C3.3) ⇒ the deal-set's commission truth = this period + the next one
    const [yy, mm] = month.split("-").map(Number) as [number, number];
    const nextMonth = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
    const cr2 = await call(CRM.commissions.report, c.ctx, owner.actor, { periodKey: nextMonth });
    const net2 = cr2.ok ? ((cr2.v.rows as Any[]).find((x) => x.userId === rep.userId)?.netSatang ?? 0) : null;
    S.commissionsAllPeriods = cr.ok && cr2.ok ? { commissionAll: Number(netRow?.netSatang ?? 0) + Number(net2) } : { err: cr2.ok ? cr.err : cr2.err };
    // CSV (reports export lane, this tenant only)
    const csvOf = async (tab: string) => {
      const st = await call(CRM.reports.startExport, c.ctx, owner.actor, { tab, filters: period });
      if (!st.ok) return { err: st.err };
      await call(CRM.reports.runExportJobs, { tenantIds: [T], systemIds: [c.S] });
      const job = await P.crmImportJob.findUnique({ where: { id: st.v.jobId }, select: { status: true, result: true, error: true } });
      return job?.status === "DONE" ? { csv: String((job.result as Any)?.csv ?? "") } : { err: `${job?.status} ${job?.error ?? ""}` };
    };
    const satangOfBaht = (s: string) => Math.round(Number(String(s).replace(/[",\s]/g, "")) * 100);
    const csvRows = (csv: string) => csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.replace(/^"|"$/g, "")));
    const ovCsv = await csvOf("overview");
    if ("csv" in ovCsv) {
      const rr = csvRows(ovCsv.csv!);
      const hi = rr.findIndex((r) => r.includes("มูลค่าที่ชนะ (บาท)"));
      const h = rr[hi] ?? []; const v = rr[hi + 1] ?? [];
      S.csvOverview = { won: satangOfBaht(v[h.indexOf("มูลค่าที่ชนะ (บาท)")] ?? "NaN"), paid: satangOfBaht(v[h.indexOf("รับชำระแล้ว (บาท)")] ?? "NaN"), weighted: satangOfBaht(v[h.indexOf("มูลค่าถ่วงน้ำหนัก (บาท)")] ?? "NaN") };
    } else S.csvOverview = { err: ovCsv.err! };
    const rpCsv = await csvOf("reps");
    if ("csv" in rpCsv) {
      const rr = csvRows(rpCsv.csv!);
      const hi = rr.findIndex((r) => r.some((x) => /คอมมิชชัน/.test(x)));
      const h = rr[hi] ?? [];
      const row = rr.slice(hi + 1).find((r) => r[0] && r[0].includes(`rep ${TAG}`)) ?? rr[hi + 1] ?? [];
      const col = (re: RegExp) => h.findIndex((x) => re.test(x));
      S.csvReps = { won: satangOfBaht(row[col(/มูลค่า.*ชนะ/)] ?? "NaN"), paid: satangOfBaht(row[col(/รับชำระ/)] ?? "NaN"), commission: satangOfBaht(row[col(/คอมมิชชัน/)] ?? "NaN") };
    } else S.csvReps = { err: rpCsv.err! };
    // REST (the real route, an admin key of this system)
    const AK = (await import("@/lib/api-keys/service" as string)) as Any;
    const SC = (await import("@/lib/api-keys/scopes" as string)) as Any;
    const ROUTE = (await import("@/app/api/v1/crm/[...path]/route" as string)) as Any;
    const k = await AK.createApiKey({ tenantId: T }, `${TAG} x-admin`, { scopes: [...((SC.API_SCOPE_BUNDLES as Any[]).find((b) => b.id === "crm.admin")?.scopes ?? [])], systemId: c.S, createdById: owner.userId });
    KEY_IDS.push(k.id);
    const rest = async (path: string) => {
      const pathOnly = path.split("?")[0] ?? "";
      const res: Response = await ROUTE.GET(new Request(`http://qc.invalid/api/v1/crm${path}`, { headers: { authorization: `Bearer ${k.rawKey}`, "user-agent": TAG, "x-forwarded-for": "203.0.113.153" } }), { params: Promise.resolve({ path: pathOnly.split("/").filter(Boolean) }) });
      const t = await res.text();
      try { return { status: res.status, body: JSON.parse(t) }; } catch { return { status: res.status, body: { _raw: cut(t, 100) } }; }
    };
    const rOv = await rest(`/reports/overview?from=${period.from}&to=${period.to}`);
    const od = rOv.body?.data ?? rOv.body;
    S.restOverview = rOv.status === 200 ? { won: od?.wonValueSatang, paid: od?.paidSatang, weighted: od?.weightedSatang } : { err: `${rOv.status} ${cut(j(rOv.body), 80)}` };
    // REST deal 360: every WON deal must expose its own won value and paid as numbers (SF3 — no fallback to valueSatang, a gap is an ERROR)
    let restWon = 0; let restPaid = 0; const restErr: string[] = [];
    for (const d of rows.filter((r) => r.kind === "WON")) {
      const g = await rest(`/deals/${d.id}`);
      const dd = g.body?.data?.deal ?? g.body?.deal ?? null;
      if (g.status !== 200 || !dd) { restErr.push(`${d.id.slice(-6)}:${g.status}`); continue; }
      if (typeof dd.wonValueSatang !== "number") restErr.push(`${d.id.slice(-6)}.wonValueSatang=${j(dd.wonValueSatang)}`); else restWon += dd.wonValueSatang;
      if (typeof dd.paidSatang !== "number") restErr.push(`${d.id.slice(-6)}.paidSatang=${j(dd.paidSatang)}`); else restPaid += dd.paidSatang;
    }
    S.restDeals = restErr.length ? { err: restErr.join(",") } : { won: restWon, paid: restPaid };

    // agreement per metric
    // SF3: a surface that answers but lacks the field (undefined / null / NaN / non-number) is an ERROR, never skipped
    const bad: string[] = [];
    for (const [sn, v] of Object.entries(S)) for (const [m, x] of Object.entries(v)) if (m !== "err" && (typeof x !== "number" || !Number.isFinite(x))) bad.push(`${sn}.${m}=${j(x)}`);
    const metric = (m: string) => Object.entries(S).filter(([, v]) => m in v).map(([s, v]) => [s, v[m]] as [string, number | null | string]);
    const same = (m: string, expected: number | null) => {
      const vs = metric(m);
      const nums = vs.map(([, v]) => v);
      return { ok: vs.length > 0 && nums.every((v) => typeof v === "number" && v === nums[0]) && (expected === null || nums[0] === expected), vs };
    };
    const won = same("won", EXP_WON);
    const paid = same("paid", EXP_PAID);
    const commission = same("commission", null);
    const commissionAll = same("commissionAll", EXP_COMM);
    const weighted = same("weighted", EXP_WEIGHTED);
    const errs = [...Object.entries(S).filter(([, v]) => "err" in v).map(([s, v]) => `${s}:${v.err}`), ...bad];
    const fmt = (name: string, r: { ok: boolean; vs: [string, Any][] }, exp: number | null) => `${r.ok ? "✓" : "✗"} ${name}${exp === null ? "" : ` (exp ${exp})`}: ${r.vs.map(([s, v]) => `${s}=${v}`).join(" ")}`;
    chk("C5.3-X1", `one money truth across EVERY surface — home · board · forecast · reports overview · reps · CSV (overview+reps) · REST (overview + deal 360) · commissions report · quota agree on won value, paid, commission net and weighted pipeline for a fixture with VAT + deposit deduction + credit note + clawback (won basis ${WON_BASIS}, Q14 pending · commission = pre-VAT part of each payment · credit note lowers paid, won and commission · quota follows paid)`,
      fixture && errs.length === 0 && won.ok && paid.ok && commission.ok && commissionAll.ok && weighted.ok,
      `fixture ok · no surface errors and no missing/non-number field · won = ${EXP_WON} everywhere · paid = ${EXP_PAID} everywhere incl. quota · commission net of this period equal on reps = CSV = commissions report, and this + next period (where clawbacks land) = ${EXP_COMM} · weighted = ${EXP_WEIGHTED} (OMITTED excluded)`,
      `fixture=${fixture} [${fx.join(" ")} commRows=${j(comm.map((x) => `${x.status}:${B(x.amountSatang)}@${x.periodKey}`))}] · ${fmt("won", won, EXP_WON)} | ${fmt("paid", paid, EXP_PAID)} | ${fmt("commission(this period)", commission, null)} | ${fmt("commission(all periods)", commissionAll, EXP_COMM)} | ${fmt("weighted", weighted, EXP_WEIGHTED)}${errs.length ? ` | errors: ${errs.join(" ; ")}` : ""}`);
  });
} catch (e) {
  chk("C5.3-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600), "CRITICAL");
} finally {
  if (OLD_SVIX === undefined) delete process.env.RESEND_WEBHOOK_SECRET; else process.env.RESEND_WEBHOOK_SECRET = OLD_SVIX;
  if (OLD_ALLOW_PRIVATE !== undefined) process.env.WEBHOOK_ALLOW_PRIVATE = OLD_ALLOW_PRIVATE;
  if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID; else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
  globalThis.fetch = REAL_FETCH;
  await new Promise((r) => setTimeout(r, 1_500));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (RATE_KEYS.length) await del(() => P.chatRateBucket.deleteMany({ where: { key: { in: RATE_KEYS } } }));
  await del(() => P.chatRateBucket.deleteMany({ where: { key: { contains: TAG } } }));
  for (const id of KEY_IDS) await del(() => P.apiKey.delete({ where: { id } }));
  for (const n of JOB_NAMES) await del(() => P.opsAlertState.deleteMany({ where: { source: { contains: n } } }));
  await del(() => P.opsEvent.deleteMany({ where: { OR: [{ message: { contains: TAG } }, { tenantId: { in: TENANTS } }] } }));
  let tables: string[] = [];
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
  }
  for (const uid of USERS) await del(() => P.session.deleteMany({ where: { userId: uid } }));
  for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
  for (const uid of USERS) await del(() => P.membership.deleteMany({ where: { userId: uid } }));
  for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
  try {
    const left: string[] = [];
    if (ids.length) {
      const inList = ids.map((x) => `'${x}'`).join(",");
      for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); }
    }
    const tenants = ids.length ? await P.tenant.count({ where: { id: { in: ids } } }) : 0;
    const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
    const keys = KEY_IDS.length ? await P.apiKey.count({ where: { id: { in: KEY_IDS } } }) : 0;
    const buckets = RATE_KEYS.length ? await P.chatRateBucket.count({ where: { key: { in: RATE_KEYS } } }) : 0;
    const jobs = await P.opsAlertState.count({ where: { OR: JOB_NAMES.map((n) => ({ source: { contains: n } })) } });
    chk("C5.3-CLEAN", "the oracle gives QC2 back exactly as found — the throwaway tenant (every tenant-scoped row), users, sessions, API keys, rate buckets and fake minute-job state rows of this run are gone",
      left.length === 0 && tenants === 0 && users === 0 && keys === 0 && buckets === 0 && jobs === 0, "0 rows", `${left.join(" · ") || "-"} tenants=${tenants} users=${users} keys=${keys} buckets=${buckets} jobState=${jobs}`, "MAJOR");
  } catch (e) { chk("C5.3-CLEAN", "the oracle gives QC2 back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR"); }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C5.3: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
