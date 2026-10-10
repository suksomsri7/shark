// review probe — CRM C5.5-authz-sweep (independent reviewer). Two kinds of checks:
//   V-*  VERIFY: the card's fixes hold under variants the builder probe did not try (whitespace/case/wildcard/bundle/pseudo-scope,
//        label/value/case of webhook types, archived/other-system/foreign targets on v1 activities, wildcard ai.* on mobile) — pass = fix holds.
//   X-*  REPRO of reviewer findings outside the card's diff — pass = the gap was REPRODUCED as described in the review note
//        (i.e. a green X-* line is bad news, not good news).
//   R-*  REGRESSION guards for rightly-permitted users (pure registry checks + positive controls).
// QC3 ONLY (ep-weathered-river) · throwaway tenants `qc-cf8r-*` swept in finally · outbound network blocked (fetch).
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh \
//        bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf8/review/probe-cf8-review.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-weathered-river/.test(host) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.log(`QC3 only — got ${host}`);
  process.exit(1);
}
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-cf8r-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const j = (v: unknown) => JSON.stringify(v);
const cut = (v: unknown, n = 160) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const USERS: string[] = [];
const TENANTS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const mkUser = async (suffix: string) => {
  const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
  USERS.push(u.id);
  return u.id as string;
};
const member = (uid: string, tid: string, role: string, unitAccess: string[] = ["*"], permissions: Record<string, boolean> = {}) =>
  P.membership.create({ data: { userId: uid, tenantId: tid, role, unitAccess, permissions, acceptedAt: new Date() } });
const mkTenant = async (suffix: string) => {
  const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
  TENANTS.push(t.id);
  return t.id as string;
};
const setCrm = (sysId: string, obj: Record<string, unknown>) =>
  P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify(obj),
    sysId,
  );
// ── Next request scope (technique of probe-fix1 / probe-cf3 / probe-cf8-actions) ──
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf8-review", "x-forwarded-for": "203.0.113.189" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const afterContext = { after: (_task: Any) => undefined };
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
async function sessionCookie(uid: string, tid: string): Promise<string> {
  const token = coreHash.randomToken(32) as string;
  await P.session.create({ data: { userId: uid, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 86_400_000), expiresAt: new Date(Date.now() + 86_400_000) } });
  return `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tid}`;
}
const fdx = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const call = async (f: () => Promise<Any>): Promise<{ ok: boolean; v?: Any; err?: Any }> => {
  try { return { ok: true, v: await f() }; } catch (err) { return { ok: false, err }; }
};
const errText = (r: { ok: boolean; v?: Any; err?: Any }) => (r.ok ? cut(j(r.v), 120) : `threw ${cut((r.err as Error)?.message ?? r.err, 80)}`);

try {
  // ═══ R1/R2 pure registry checks (no DB) ═══
  console.log("\n── R pure registry ──");
  const SC = (await import("@/lib/api-keys/scopes" as string)) as Any;
  const LB = (await import("@/lib/webhooks/labels" as string)) as Any;
  const accBundles = (SC.API_SCOPE_BUNDLES as Any[]).filter((b) => (b.scopes as string[]).some((s) => s.startsWith("account.")));
  const outside = accBundles.flatMap((b) => (b.scopes as string[]).filter((s) => !(SC.ACCOUNT_SCOPE_KEYS as string[]).includes(s)).map((s) => `${b.id}:${s}`));
  chk("R1", accBundles.length >= 5 && outside.length === 0,
    `every bundle the account page offers (${accBundles.map((b) => b.id).join(",")}) ⊆ ACCOUNT_SCOPE_KEYS (${(SC.ACCOUNT_SCOPE_KEYS as string[]).length} keys) — outside=${j(outside)} · wildcard account.* in list=${(SC.ACCOUNT_SCOPE_KEYS as string[]).includes("account.*")}`);
  const accEv = (LB.WEBHOOK_EVENTS as Any[]).filter((w) => String(w.value).startsWith("account."));
  const labels = accEv.map((w) => w.label);
  const dupLabels = labels.filter((l, i) => labels.indexOf(l) !== i);
  const mapBack = accEv.every((w) => accEv.find((x) => x.value === w.label || x.label === w.label)?.value === w.value);
  const crossLabel = (LB.WEBHOOK_EVENTS as Any[]).filter((w) => !String(w.value).startsWith("account.") && labels.includes(w.label)).map((w) => w.value);
  chk("R2", accEv.length > 0 && dupLabels.length === 0 && mapBack,
    `${accEv.length} account events: duplicate Thai labels=${j(dupLabels)} · every label maps back to its own value=${mapBack} · non-account events sharing an account label=${j(crossLabel)}`);

  // ═══ world ═══
  const tA = await mkTenant("a");
  const owner = await mkUser("-owner"); await member(owner, tA, "OWNER");
  const mgr = await mkUser("-mgr"); await member(mgr, tA, "MANAGER", ["qc-branch-only"]);
  const A = (await sysSvc.createSystem(tA, "ACCOUNT", `บัญชี ${TAG}`)).id as string;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  await accSvc.saveSettings(tA, A, { orgName: `QC ${TAG}`, taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  const M = (await sysSvc.createSystem(tA, "MEMBER", `สมาชิก ${TAG}`)).id as string;
  await P.customer.create({ data: { tenantId: tA, memberSystemId: M, name: "สมาชิกลับ QC", phone: "0899000111", email: `${TAG}-cust@qc.invalid` } });
  const C = (await sysSvc.createSystem(tA, "CRM", `CRM ${TAG}`)).id as string;
  await setCrm(C, { uiVersion: 1 });
  const crmC = await P.crmContact.create({ data: { tenantId: tA, systemId: C, name: "ลีดลับ QC", phone: "0811000222" } });
  const oCookie = await sessionCookie(owner, tA);
  const mCookie = await sessionCookie(mgr, tA);
  const CONN = (await import("@/lib/modules/account/connections-actions" as string)) as Any;
  const cp = `/app/sys/${A}/account/settings/connections`;
  const keysOf = (name: string) => P.apiKey.findMany({ where: { tenantId: tA, name }, select: { id: true, scopesJson: true, systemId: true } });

  // ═══ V1 createApiKeyAction variants (branch-limited MANAGER) ═══
  console.log("\n── V1 account page key scopes — variants ──");
  const variants: [string, Record<string, string | string[]>][] = [
    ["ws", { scope: [" crm.contact.read "] }],
    ["case", { scope: ["CRM.CONTACT.READ"] }],
    ["crmwild", { scope: ["crm.*"] }],
    ["memwild", { scope: ["member.*"] }],
    ["kanwild", { scope: ["kanban.*"] }],
    ["star", { scope: ["*"] }],
    ["mixed", { scope: ["account.doc.view", "member.customer.read"] }],
    ["filter", { scope: ["account.doc.view", "crm.filter.team:abcdefgh12"] }],
    ["bmember", { bundle: "member-admin" }],
    ["bkanban", { bundle: "kanban-admin" }],
    ["bcrmro", { bundle: "crm.readonly" }],
    ["param", { scope: ["account.approve.limit"] }],
  ];
  const v1out: string[] = [];
  let v1bad = 0;
  for (const [k, extra] of variants) {
    const r = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-v1-${k}`, ttlDays: "30", ...extra }))));
    const rows = await keysOf(`${TAG}-v1-${k}`);
    const refused = r.ok && r.v?.ok === false && rows.length === 0;
    if (!refused) v1bad += 1;
    v1out.push(`${k}:${refused ? "refused" : `${errText(r)} rows=${rows.length} ${j(rows.map((x: Any) => x.scopesJson))}`}`);
  }
  chk("V1.1", v1bad === 0, `whitespace/case/wildcards/*/mixed/crm filter pseudo-scope/member+kanban+crm bundles/param key → ${v1out.join(" · ")}`);
  const dup = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-v1-dup`, ttlDays: "30", scope: ["account.doc.view", "account.doc.view"] }))));
  const dupRows = await keysOf(`${TAG}-v1-dup`);
  const mixB = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-v1-mixb`, ttlDays: "30", bundle: "crm.admin", scope: ["account.doc.view"] }))));
  const mixRows = await keysOf(`${TAG}-v1-mixb`);
  chk("V1.2", dup.v?.ok === true && dupRows.length === 1 && j(dupRows[0].scopesJson) === j(["account.doc.view"]) && mixB.v?.ok === true && j(mixRows[0]?.scopesJson) === j(["account.doc.view"]),
    `positive: duplicate account scope → ${dup.v?.ok ? "ok" : errText(dup)} stored=${j(dupRows[0]?.scopesJson)} · bundle crm.admin + ticked account.doc.view (ticked wins) → ${mixB.v?.ok ? "ok" : errText(mixB)} stored=${j(mixRows[0]?.scopesJson)}`);
  const ownerFull = await call(() => inScope(oCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-v1-full`, ttlDays: "0", scope: [...(SC.ACCOUNT_SCOPE_KEYS as string[])] }))));
  const fullRows = await keysOf(`${TAG}-v1-full`);
  chk("R3", ownerFull.v?.ok === true && fullRows.length === 1 && (fullRows[0].scopesJson as string[]).length === (SC.ACCOUNT_SCOPE_KEYS as string[]).length,
    `regression: OWNER ticks the whole ACCOUNT_SCOPE_KEYS list (${(SC.ACCOUNT_SCOPE_KEYS as string[]).length}) → ${ownerFull.v?.ok ? "ok" : errText(ownerFull)} stored ${(fullRows[0]?.scopesJson as string[] | undefined)?.length ?? 0}`);

  // ═══ X1 scope-less key + legacy /api/v1/* routes ignore scopes ═══
  console.log("\n── X1 legacy /api/v1/* routes with an account-page key ──");
  const empty = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-x1-empty`, ttlDays: "30" }))));
  const emptyRows = await keysOf(`${TAG}-x1-empty`);
  const accKey = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-x1-acc`, ttlDays: "30", scope: ["account.doc.view"] }))));
  chk("X1.1", empty.v?.ok === true && emptyRows.length === 1 && (emptyRows[0].scopesJson as string[]).length === 0,
    `REPRO: no scope + no bundle from a crafted form → ${empty.v?.ok ? "minted" : errText(empty)} stored scopes=${j(emptyRows[0]?.scopesJson)} (a "legacy" key, label "อ่าน API กลาง (คีย์รุ่นเดิม)")`);
  const rawAcc = accKey.v?.rawKey as string | undefined;
  const CUST = (await import("../../../../src/app/api/v1/customers/route.ts" as string)) as Any;
  const TOOLS = (await import("../../../../src/app/api/v1/ai/tools/[name]/route.ts" as string)) as Any;
  const bearer = (k: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${k}`, "content-type": "application/json", ...extra });
  let custBody = "", leadsBody = "", custStatus = 0, leadsStatus = 0;
  if (rawAcc) {
    const r1 = await CUST.GET(new Request("http://qc.invalid/api/v1/customers?take=5", { headers: bearer(rawAcc) }));
    custStatus = r1.status; custBody = await r1.text();
    const r2 = await TOOLS.POST(new Request("http://qc.invalid/api/v1/ai/tools/recent_leads", { method: "POST", headers: bearer(rawAcc), body: j({ args: { limit: 5 } }) }), { params: Promise.resolve({ name: "recent_leads" }) });
    leadsStatus = r2.status; leadsBody = await r2.text();
  }
  chk("X1.2", custStatus === 200 && custBody.includes("0899000111"),
    `REPRO: account-page key scoped ONLY [account.doc.view] → GET /api/v1/customers ${custStatus} member phone visible=${custBody.includes("0899000111")} (${cut(custBody, 110)})`);
  chk("X1.3", leadsStatus === 200 && leadsBody.includes("0811000222"),
    `REPRO: same key → POST /api/v1/ai/tools/recent_leads ${leadsStatus} CRM lead phone visible=${leadsBody.includes("0811000222")} (${cut(leadsBody, 110)})`);
  const SK = (await import("@/lib/ai/skills" as string)) as Any;
  const openTools = ["recent_leads", "financial_summary", "kb_auto_save", "remember_fact", "forget_fact"].filter((t) => SK.toolAllowedForApiKey(t, ["account.doc.view"]) && SK.toolAllowedForApiKey(t, []));
  chk("X1.4", openTools.length >= 3, `REPRO: tools callable by an account-only key AND a scope-less key through /api/v1/ai/tools: ${j(openTools)}`);

  // ═══ V2 testWebhookAction variants + X2 REST twin ═══
  console.log("\n── V2 account page webhook test — variants ──");
  await P.webhookEndpoint.create({ data: { tenantId: tA, url: "https://example.com/qc-cf8r-all", secret: "x".repeat(48), eventsJson: [], active: true } });
  const crmEp = await P.webhookEndpoint.create({ data: { tenantId: tA, url: "https://example.com/qc-cf8r-crm", secret: "y".repeat(48), eventsJson: ["crm.deal.won"], active: true } });
  const delOf = (type: string) => P.webhookDelivery.count({ where: { tenantId: tA, eventType: type } });
  const crmLabel = (LB.WEBHOOK_EVENTS as Any[]).find((w) => w.value === "crm.sequence.enrolled")?.label as string;
  const bad = [
    ["upper", "ACCOUNT.DOCUMENT.ISSUED"],
    ["crmlabel", crmLabel],
    ["prefixonly", "account."],
    ["unknownacc", "account.qc.fake"],
  ];
  const v2out: string[] = [];
  let v2bad = 0;
  for (const [k, t] of bad) {
    const r = await call(() => inScope(oCookie, cp, () => CONN.testWebhookAction(fdx({ systemId: A, type: t }))));
    const refused = r.ok && r.v?.ok === false && r.v?.reason === "ยิงทดสอบได้เฉพาะเหตุการณ์ของระบบบัญชี";
    if (!refused) v2bad += 1;
    v2out.push(`${k}:${refused ? "refused" : errText(r)}`);
  }
  const strangeRows = (await delOf("ACCOUNT.DOCUMENT.ISSUED")) + (await delOf(crmLabel)) + (await delOf("account.")) + (await delOf("account.qc.fake")) + (await delOf("crm.sequence.enrolled"));
  chk("V2.1", v2bad === 0 && strangeRows === 0, `${v2out.join(" · ")} · delivery rows of those types=${strangeRows} (want 0)`);
  const ws = await call(() => inScope(oCookie, cp, () => CONN.testWebhookAction(fdx({ systemId: A, type: "  account.period.closed  " }))));
  chk("V2.2", ws.ok && (await delOf("account.period.closed")) >= 1, `positive: value with surrounding spaces → ${errText(ws)} rows=${await delOf("account.period.closed")}`);
  // X2 REST twin: account key with account.settings.manage → POST /api/v1/account/webhooks/{crmEp}/test {event: crm.deal.won}
  const restKey = await call(() => inScope(mCookie, cp, () => CONN.createApiKeyAction(fdx({ systemId: A, name: `${TAG}-x2`, ttlDays: "30", scope: ["account.settings.manage"] }))));
  const ACC = (await import("../../../../src/app/api/v1/account/[...path]/route.ts" as string)) as Any;
  let x2Status = 0, x2Body = "";
  if (restKey.v?.rawKey) {
    const r = await ACC.POST(
      new Request(`http://qc.invalid/api/v1/account/webhooks/${crmEp.id}/test`, { method: "POST", headers: bearer(restKey.v.rawKey, { "idempotency-key": `${TAG}-x2` }), body: j({ event: "crm.deal.won" }) }),
      { params: Promise.resolve({ path: ["webhooks", crmEp.id, "test"] }) },
    );
    x2Status = r.status; x2Body = await r.text();
  }
  const x2rows = await P.webhookDelivery.count({ where: { tenantId: tA, endpointId: crmEp.id, eventType: "crm.deal.won" } });
  chk("X2", x2Status === 200 && x2rows === 1,
    `REPRO: branch-limited MANAGER's account key [account.settings.manage] → REST webhooks.test on a CRM-only endpoint with event crm.deal.won: ${x2Status} ${cut(x2Body, 90)} · delivery rows=${x2rows}`);

  // ═══ V3 CRM v1 addActivityAction variants + completeActivityAction ═══
  console.log("\n── V3 CRM v1 activities — variants ──");
  const crmSvc = (await import("@/lib/modules/crm/service" as string)) as Any;
  const S2 = (await sysSvc.createSystem(tA, "CRM", `CRM2 ${TAG}`)).id as string;
  await setCrm(S2, { uiVersion: 1 });
  const pipe2 = await crmSvc.ensureCrm({ tenantId: tA, systemId: S2 });
  const c2 = await P.crmContact.create({ data: { tenantId: tA, systemId: S2, name: "ลูกค้าระบบ 2" } });
  const deal2 = await P.crmDeal.create({ data: { tenantId: tA, systemId: S2, contactId: c2.id, pipelineId: pipe2.id, stageId: pipe2.stages[0].id, title: "ดีลระบบ 2" } });
  const archived = await P.crmContact.create({ data: { tenantId: tA, systemId: C, name: "ลูกค้าเก็บแล้ว", archivedAt: new Date() } });
  const tB = await mkTenant("b");
  const SB = (await sysSvc.createSystem(tB, "CRM", `CRM B ${TAG}`)).id as string;
  const actB = await P.crmActivity.create({ data: { tenantId: tB, systemId: SB, title: "งานร้าน B" } });
  const CRMV1 = (await import("@/lib/modules/crm/actions" as string)) as Any;
  const vp = `/app/sys/${C}/crm`;
  const add = (o: Record<string, string>) => call(() => inScope(oCookie, vp, () => CRMV1.addActivityAction(fdx({ systemId: C, type: "TASK", ...o }))));
  await add({ title: "QC own+deal2", contactId: crmC.id, dealId: deal2.id });
  await add({ title: "QC deal2 only", dealId: deal2.id });
  const leaked = await P.crmActivity.count({ where: { tenantId: tA, systemId: C, dealId: deal2.id } });
  chk("V3.1", leaked === 0, `own contact + deal of another CRM system of the same shop / that deal alone → activities written=${leaked} (want 0)`);
  await add({ title: "QC ws", contactId: `  ${crmC.id}  ` });
  const wsRows = await P.crmActivity.count({ where: { tenantId: tA, systemId: C, contactId: crmC.id, title: "QC ws" } });
  await add({ title: "QC archived", contactId: archived.id });
  const arch = await P.crmActivity.count({ where: { tenantId: tA, systemId: C, contactId: archived.id } });
  chk("V3.2", wsRows === 1, `positive: own contact id with surrounding spaces → ${wsRows} row · INFO archived contact of this system → ${arch} row (v1 never filtered archived; not a tenant/system leak)`);
  await call(() => inScope(oCookie, vp, () => CRMV1.completeActivityAction(fdx({ systemId: C, activityId: actB.id }))));
  const bDone = (await P.crmActivity.findFirst({ where: { id: actB.id }, select: { doneAt: true } }))?.doneAt;
  chk("V3.3", bDone === null, `v1 completeActivityAction with shop B's activity id from shop A → B row doneAt=${bDone === null ? "null (untouched)" : String(bDone)}`);

  // ═══ V4 mobile: ai.* wildcard + MANAGER branch-limited pass (same evaluate as web assertCan) ═══
  console.log("\n── V4 mobile wildcard / branch-limited ──");
  const mAuth = (await import("@/lib/mobile/auth" as string)) as Any;
  const wild = await mkUser("-wild"); await member(wild, tA, "STAFF", ["*"], { "ai.*": true });
  const mgrTok = (await mAuth.issueMobileToken(mgr)).token as string;
  const wildTok = (await mAuth.issueMobileToken(wild)).token as string;
  const USAGE = (await import("../../../../src/app/api/mobile/usage/route.ts" as string)) as Any;
  const PROPS = (await import("../../../../src/app/api/mobile/proposals/route.ts" as string)) as Any;
  const mreq = (tok: string, qs = "") => new Request(`http://qc.invalid/api/mobile/x${qs}`, { headers: { authorization: `Bearer ${tok}`, "x-tenant-id": tA } });
  const st: number[] = [];
  for (const tok of [wildTok, mgrTok]) {
    const a = await USAGE.GET(mreq(tok)); st.push(a.status); await a.text().catch(() => "");
    const b = await PROPS.GET(mreq(tok, "?conversationId=none")); st.push(b.status); await b.text().catch(() => "");
  }
  chk("V4", st.every((s) => s === 200), `STAFF with "ai.*" and branch-limited MANAGER → usage/proposals statuses ${j(st)} (want 200 — the web assertCan lets both through)`);
} catch (e) {
  chk("CRASH", false, String((e as Error)?.stack ?? e).slice(0, 900));
} finally {
  for (const T of TENANTS) {
    const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0;
    for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    chk(`CLEAN-${T.slice(-6)}`, left === 0 && (await P.tenant.count({ where: { id: T } })) === 0, `tenant rows left=${left}`);
  }
  for (const id of USERS) {
    await P.session.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined);
    await P.user.delete({ where: { id } }).catch(() => undefined);
  }
  const usersLeft = await P.user.count({ where: { email: { startsWith: TAG } } });
  chk("CLEAN-users", usersLeft === 0, `users left=${usersLeft}`);
  await prisma.$disconnect();
}
const passed = res.filter((r) => r.ok).length;
console.log(`\n${passed === res.length ? "🟢" : "🔴"} probe cf8 review: ${passed}/${res.length} (X-* green = finding reproduced)`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: res.length, passed, failed: res.filter((r) => !r.ok).map((r) => r.id) })}`);
process.exit(passed === res.length ? 0 : 1);
