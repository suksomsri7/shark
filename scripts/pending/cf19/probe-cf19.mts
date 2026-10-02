// probe — CRM C5.5-fix14 (authz-sweep S4): the account contact profile "links" tab showed the MEMBER card (member code · tier) and the
//   POS card (visits · total spend) with no member-viewer check — `contact-profile.ts loadConnections` → `member/service.ts findCustomerByPartyId`.
//   Doors: web server action `loadContactProfileAction` (real action, real session cookie) · the 360 page's loader call
//   (`contactProfile(..., { crmViewer: crmViewerOfSession(...) })`, exactly page.tsx) · account REST `GET /contacts/{id}` (real route, Bearer key).
//   RED shape = STAFF without member read / STAFF limited to another branch / account key without a member scope / no viewer see the card.
//   GREEN = they get the byte-identical DTO of "no member linked" (customer.partyId unset) — no code, tier, visits, spend, id or flag —
//   while OWNER and an entitled STAFF get the byte-identical DTO of the base tree (normalised ids, `--write-base` on the RED run).
// QC2 ONLY (ep-cool-shadow) · own throwaway tenant `qc-cf19-*` swept to 0 rows in finally · network blocked.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf19/probe-cf19.mts [--write-base]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.log(`QC2 only — got ${host}`);
  process.exit(2);
}
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;

// SQL counter (same technique as qc-acc-v2-contact-profile Q8) — INFO only
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
let sqlLog: string[] = [];
let counting = false;
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: [{ emit: "event", level: "query" }] });
(client as unknown as { $on: (e: string, cb: (ev: { query: string }) => void) => void }).$on("query", (ev) => {
  if (counting) sqlLog.push(ev.query);
});
(globalThis as unknown as { prisma?: PrismaClient }).prisma = client;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const WRITE_BASE = process.argv.includes("--write-base");
const BASE_FILE = "scripts/pending/cf19/base-dto.json";
const TAG = `qc-cf19-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const j = (v: unknown) => JSON.stringify(v);
const cut = (v: unknown, n = 160) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const USERS: string[] = [];
const TENANTS: string[] = [];
const ACCS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const mkUser = async (suffix: string) => {
  const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
  USERS.push(u.id);
  return u.id as string;
};
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf19", "x-forwarded-for": "203.0.113.190" } });
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

try {
  // ═══ world: one shop · branches UA (member's home) + UB · ACCOUNT book + MEMBER system · one Party linking an account contact and a member ═══
  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  TENANTS.push(T);
  const UA = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `สาขา A ${TAG}`, slug: `${TAG}-a` } })).id as string;
  const UB = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `สาขา B ${TAG}`, slug: `${TAG}-b` } })).id as string;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${TAG}`)).id as string;
  ACCS.push(A);
  const M = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${TAG}`)).id as string;
  const pty = await P.party.create({ data: { tenantId: T, name: `คุณซีเอฟ ${TAG}`, kind: "PERSON" } });
  const contact = await P.accountContact.create({ data: { tenantId: T, systemId: A, name: `คุณซีเอฟ ${TAG}`, kind: "CUSTOMER", partyId: pty.id } });
  const CODE = "M-CF19X";
  const cust = await P.customer.create({ data: { tenantId: T, memberSystemId: M, name: `คุณซีเอฟ ${TAG}`, memberCode: CODE, tier: "GOLD", totalSpentSatang: 123_450, visitCount: 3, homeUnitId: UA, partyId: pty.id, status: "ACTIVE" } });

  // viewers (web): every STAFF holds account.contact.manage (the profile's own key) — only the member side differs
  const ACC = { "account.contact.manage": true };
  const V: Record<string, { uid: string; role: string; unitAccess: string[]; permissions: Record<string, boolean> }> = {};
  const mk = async (name: string, role: string, unitAccess: string[], permissions: Record<string, boolean>) => {
    const uid = await mkUser(`-${name}`);
    await P.membership.create({ data: { userId: uid, tenantId: T, role, unitAccess, permissions, acceptedAt: new Date() } });
    V[name] = { uid, role, unitAccess, permissions };
  };
  await mk("owner", "OWNER", ["*"], {});
  await mk("staffNoMember", "STAFF", ["*"], { ...ACC });
  await mk("staffOtherBranch", "STAFF", [UB], { ...ACC, "member.customer.read": true });
  await mk("staffEntitled", "STAFF", ["*"], { ...ACC, "member.customer.read": true });
  await mk("staffHomeBranch", "STAFF", [UA], { ...ACC, "member.customer.read": true });
  const cookies: Record<string, string> = {};
  for (const [k, v] of Object.entries(V)) cookies[k] = await sessionCookie(v.uid, T);

  // API keys (account REST): account-only (what the account page can mint) · account + member.customer.read (service-minted, mechanism control)
  const ak = (await import("@/lib/api-keys/service" as string)) as Any;
  const kAcc = await ak.createApiKey({ tenantId: T }, `${TAG} acc`, { scopes: ["account.doc.view", "account.contact.manage"], systemId: A });
  const kAccMem = await ak.createApiKey({ tenantId: T }, `${TAG} accmem`, { scopes: ["account.doc.view", "account.contact.manage", "member.customer.read"], systemId: A });
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Any;
  const rest = async (key: string, path: string) => {
    const req = new Request(`http://x/api/v1/account${path}`, { method: "GET", headers: { authorization: `Bearer ${key}` } });
    const r = await route.GET(req, { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const text = await r.text();
    let body: Any = null; try { body = JSON.parse(text); } catch { body = { _raw: text }; }
    return { status: r.status, body };
  };

  const ACT = (await import("@/lib/modules/account/actions" as string)) as Any;
  const CP = (await import("@/lib/modules/account/contact-profile" as string)) as Any;
  const CL = (await import("@/lib/modules/account/contact-links" as string)) as Any;
  const ASOF = new Date("2026-09-30T12:00:00+07:00");
  const pagePath = `/app/sys/${A}/account/contacts/${contact.id}`;
  const norm = (v: unknown) => {
    let s = j(v);
    for (const [id, tok] of [[contact.id, "<CONTACT>"], [cust.id, "<CUSTOMER>"], [pty.id, "<PARTY>"], [A, "<ACC>"], [M, "<MEM>"], [T, "<TENANT>"], [UA, "<UA>"], [UB, "<UB>"], [TAG, "<TAG>"]] as const) s = s.split(id).join(tok);
    return s;
  };
  // web action (tab links) · the page's loader call (default tab info → links via the same function) · REST
  const webAction = (who: string) => inScope(cookies[who]!, pagePath, () => ACT.loadContactProfileAction(A, contact.id, { tab: "links" }));
  const pageLoader = (who: string) => {
    const v = V[who]!;
    return CP.contactProfile({ tenantId: T, systemId: A }, contact.id, { base: `/app/sys/${A}/account`, tab: "links", asOf: ASOF, crmViewer: CL.crmViewerOfSession(v.uid, { role: v.role, unitAccess: v.unitAccess, permissions: v.permissions }) });
  };
  const bare = (viewer: Any) => CP.contactProfile({ tenantId: T, systemId: A }, contact.id, { base: `/app/sys/${A}/account`, tab: "links", asOf: ASOF, ...(viewer === "omit" ? {} : { crmViewer: viewer }) });
  const restGet = async (key: string) => (await rest(key, `/contacts/${contact.id}`));
  // the action has no asOf (uses now) — KPI/year fields are identical between the two snapshots of one run; the base compare uses pageLoader (fixed asOf)

  type Snap = Record<string, string>;
  const snapshot = async (): Promise<Snap> => {
    const s: Snap = {};
    for (const who of Object.keys(V)) {
      s[`web:${who}`] = norm(await webAction(who));
      s[`page:${who}`] = norm(await pageLoader(who));
    }
    s["bare:omit"] = norm(await bare("omit"));
    s["bare:null"] = norm(await bare(null));
    const ra = await restGet(kAcc.rawKey);
    const rm = await restGet(kAccMem.rawKey);
    // envelope `requestId` differs per call (req_<random>) — compare status + data/error only
    s["rest:acc"] = norm({ status: ra.status, body: { data: ra.body?.data, error: ra.body?.error } });
    s["rest:accmem"] = norm({ status: rm.status, body: { data: rm.body?.data, error: rm.body?.error } });
    return s;
  };

  console.log("\n── snapshot 1: member linked to the contact's Party ──");
  const linked = await snapshot();
  console.log("\n── snapshot 2: the same contact with NO member linked (customer.partyId cleared) ──");
  await P.customer.update({ where: { id: cust.id }, data: { partyId: null } });
  const unlinked = await snapshot();
  await P.customer.update({ where: { id: cust.id }, data: { partyId: pty.id } });

  const cards = (s: string) => {
    const o = JSON.parse(s);
    const c = o?.linksTab?.cards ?? [];
    return { member: c.find((x: Any) => x.key === "member"), pos: c.find((x: Any) => x.key === "pos") };
  };
  const leaks = (s: string) => [CODE, "<CUSTOMER>", "GOLD", "ซื้อหน้าร้าน", "1,234.50"].filter((x) => s.includes(x));

  // ═══ RED → GREEN: no member card, no existence signal ═══
  console.log("\n── denied viewers: byte-identical to 'no member linked' ──");
  const denied: [string, string, string][] = [
    ["CF19-D1", "web:staffNoMember", "web action · STAFF with account.contact.manage, no member key"],
    ["CF19-D2", "page:staffNoMember", "360 page loader · STAFF with no member key"],
    ["CF19-D3", "web:staffOtherBranch", "web action · STAFF with member.customer.read limited to branch B (member's home = A, no visit in B)"],
    ["CF19-D4", "page:staffOtherBranch", "360 page loader · STAFF limited to branch B"],
    ["CF19-D5", "bare:omit", "loader with no viewer (crmViewer omitted)"],
    ["CF19-D6", "bare:null", "loader with viewer null"],
    ["CF19-D7", "rest:acc", "account REST GET /contacts/{id} · key [account.doc.view, account.contact.manage] (no member scope)"],
  ];
  for (const [id, k, label] of denied) {
    const L = linked[k]!, U = unlinked[k]!;
    const extra = k.startsWith("rest:") ? `links=${j(JSON.parse(L)?.body?.data?.links)}` : `member=${cut(j(cards(L).member), 140)} pos=${cut(j(cards(L).pos), 90)}`;
    chk(id, L === U && leaks(L).length === 0 && !L.includes("\"member\":true"),
      `${label}: DTO == no-member DTO ${L === U} · leaked tokens ${j(leaks(L))} · ${extra}`);
  }

  // ═══ positive controls: entitled viewers keep the identical card ═══
  console.log("\n── entitled viewers: identical card ──");
  const expMember = `#${CODE} · ระดับ GOLD`;
  const expPos = "ซื้อหน้าร้าน 3 ครั้ง · ฿1,234.50";
  const openCard = (s: string) => {
    const c = cards(s);
    return c.member?.linked === true && c.member?.detail === expMember && c.member?.actionLabel === "แยก" && c.pos?.detail === expPos && c.pos?.linked === true;
  };
  for (const [id, who] of [["CF19-E1", "owner"], ["CF19-E2", "staffEntitled"], ["CF19-E3", "staffHomeBranch"]] as const) {
    chk(id, openCard(linked[`web:${who}`]!) && openCard(linked[`page:${who}`]!) && linked[`web:${who}`] !== unlinked[`web:${who}`],
      `${who}: web action + page loader show member ${j(cards(linked[`page:${who}`]!).member?.detail)} · pos ${j(cards(linked[`page:${who}`]!).pos?.detail)}`);
  }
  const rm = JSON.parse(linked["rest:accmem"]!);
  chk("CF19-E4", rm.status === 200 && rm.body?.data?.links?.member === true,
    `REST key holding member.customer.read (service-minted — the account page refuses member scopes since S1) → links.member=${j(rm.body?.data?.links?.member)} (mechanism: the key's scopes are its member viewer)`);

  // byte-compare against the base tree (RED run writes it)
  const baseKeys = ["page:owner", "page:staffEntitled", "page:staffHomeBranch", "rest:accmem"];
  const cur: Record<string, string> = Object.fromEntries(baseKeys.map((k) => [k, linked[k]!]));
  if (WRITE_BASE) {
    writeFileSync(BASE_FILE, JSON.stringify(cur, null, 1));
    console.log(`  ℹ️  base written → ${BASE_FILE}`);
  }
  if (existsSync(BASE_FILE)) {
    const base = JSON.parse(readFileSync(BASE_FILE, "utf8")) as Record<string, string>;
    const diff = baseKeys.filter((k) => base[k] !== cur[k]);
    chk("CF19-E5", diff.length === 0, `entitled DTOs byte-identical to the base tree (${baseKeys.join(", ")}) — differing: ${j(diff)}`);
  } else chk("CF19-E5", false, `no ${BASE_FILE} — run the base tree with --write-base first`);
  chk("CF19-E6", linked["web:owner"] === linked["web:staffEntitled"] && linked["page:owner"] === linked["page:staffEntitled"], "OWNER and entitled STAFF see the same DTO (no CRM system in this shop ⇒ nothing else viewer-dependent)");

  // ═══ INFO ═══
  console.log("\n── INFO ──");
  for (const [label, viewer] of [["no viewer", "omit"], ["OWNER", CL.crmViewerOfSession(V.owner!.uid, { role: "OWNER", unitAccess: ["*"], permissions: {} })], ["STAFF no member", CL.crmViewerOfSession(V.staffNoMember!.uid, { role: "STAFF", unitAccess: ["*"], permissions: ACC })], ["STAFF home branch (unit-scoped, entitled)", CL.crmViewerOfSession(V.staffHomeBranch!.uid, { role: "STAFF", unitAccess: V.staffHomeBranch!.unitAccess, permissions: V.staffHomeBranch!.permissions })]] as const) {
    sqlLog = []; counting = true;
    await bare(viewer);
    counting = false;
    const n = sqlLog.filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(q)).length;
    console.log(`  ℹ️  links tab SQL statements (${label}): ${n}`);
  }
  const list = await rest(kAcc.rawKey, "/contacts?group=all");
  const row = (list.body?.data ?? []).find((r: Any) => r.id === contact.id);
  console.log(`  ℹ️  sibling NOT fixed here (listed in the note): REST GET /contacts row badges for the account-only key = ${j(row?.badges)} (listPartyIdsWithCustomer has no viewer)`);
} catch (e) {
  chk("CRASH", false, String((e as Error)?.stack ?? e).slice(0, 900));
} finally {
  for (const A of ACCS) await P.$executeRawUnsafe(`SELECT account_jno_drop($1)`, A).catch(() => undefined);
  for (const T of TENANTS) {
    const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0;
    for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    chk(`CLEAN-tenant`, left === 0 && (await P.tenant.count({ where: { id: T } })) === 0, `tenant rows left=${left}`);
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
console.log(`\n${passed === res.length ? "🟢" : "🔴"} probe cf19: ${passed}/${res.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: res.length, passed, findings: res.filter((r) => !r.ok).map((r) => r.id) })}`);
process.exit(passed === res.length ? 0 : 1);
