// probe — CRM C5.5-fix14 (authz-sweep S4): the account contact profile "links" tab showed the MEMBER card (member code · tier) and the
//   POS card (visits · total spend) with no member-viewer check — `contact-profile.ts loadConnections` → `member/service.ts findCustomerByPartyId`.
//   Doors: web server action `loadContactProfileAction` (real action, real session cookie) · the 360 page's loader call
//   (`contactProfile(..., { crmViewer: crmViewerOfSession(...) })`, exactly page.tsx) · account REST `GET /contacts/{id}` (real route, Bearer key).
//   RED shape = STAFF without member read / STAFF limited to another branch / account key without a member scope / no viewer see the card.
//   GREEN = they get the byte-identical DTO of "no member linked" (customer.partyId unset) — no code, tier, visits, spend, id or flag —
//   while OWNER and an entitled STAFF get the byte-identical DTO of the base tree (normalised ids, `--write-base` on the RED run).
// Round 2 (controller rulings): the contacts list (member count · `source:member` filter · per-row badge, web + REST `contacts.list`) and the
//   merge page's member-code label get the same viewer rule; the links tab must stay ≤ 12 SQL statements for OWNER / no member read /
//   branch-limited STAFF (Q1–Q3); V1 shows the by-party rule agrees with the member module's own visibility (visibleCustomerIds).
//   RED for round 2 = run on 4aa42ad2 with --write-base (base-dto-r2.json).
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
const BASE_FILE = "scripts/pending/cf19/base-dto-r3.json"; // round 1 base (f5e6485b) = base-dto-r1.json · round 2 (4aa42ad2) = base-dto-r2.json · round 3 = 80f776a9
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
  const contact = await P.accountContact.create({ data: { tenantId: T, systemId: A, name: `คุณซีเอฟ ${TAG}`, kind: "CUSTOMER", partyId: pty.id, phone: "0812345679", phoneNorm: "0812345679" } });
  // round 2: a duplicate with the same phone (merge page pair, reason PHONE) — not linked to any member
  const contact2 = await P.accountContact.create({ data: { tenantId: T, systemId: A, name: `คุณซีเอฟ สาขาสอง ${TAG}`, kind: "CUSTOMER", phone: "081-234-5679", phoneNorm: "0812345679" } });
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
    for (const [id, tok] of [[contact.id, "<CONTACT>"], [contact2.id, "<CONTACT2>"], [cust.id, "<CUSTOMER>"], [pty.id, "<PARTY>"], [A, "<ACC>"], [M, "<MEM>"], [T, "<TENANT>"], [UA, "<UA>"], [UB, "<UB>"], [TAG, "<TAG>"]] as const) s = s.split(id).join(tok);
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
  // round 2 doors: contacts list (sidebar counts · source:member filter · per-row badge) and the merge page (memberLinkLabel)
  const CLIST = (await import("@/lib/modules/account/contacts-list" as string)) as Any;
  const CMERGE = (await import("@/lib/modules/account/contact-merge" as string)) as Any;
  const ctxA = { tenantId: T, systemId: A };
  const viewerOf = (who: string) => { const v = V[who]!; return CL.crmViewerOfSession(v.uid, { role: v.role, unitAccess: v.unitAccess, permissions: v.permissions }); };
  // = contacts-ui.tsx ContactsPage: loadContactsSidebar(ctx, undefined, crmViewer) then listContactsPage(ctx, input, sidebar)
  const listSummary = async (viewer: Any) => {
    const sb = await CLIST.loadContactsSidebar(ctxA, undefined, viewer === "omit" ? undefined : viewer);
    const all = await CLIST.listContactsPage(ctxA, { group: "all", pageSize: 100 }, sb);
    const mem = await CLIST.listContactsPage(ctxA, { group: "source:member", pageSize: 100 }, sb);
    return { counts: sb.counts, sourceMember: [...sb.sourceSets.member].sort(), rows: all.rows.map((r: Any) => ({ id: r.id, badges: r.badges })), memTotal: mem.total, memRows: mem.rows.map((r: Any) => r.id) };
  };
  // = merge/page.tsx: listMergeCandidates(ctx, crmViewerOfSession(...)) — full DTO for linked-vs-unlinked; projection (no createdAt) for the cross-run base
  const mergeFull = (viewer: Any) => CMERGE.listMergeCandidates(ctxA, viewer === "omit" ? undefined : viewer);
  const mergeProj = (rows: Any[]) => rows.map((m: Any) => ({ key: m.key, reason: m.reason, a: { id: m.a.id, name: m.a.name, memberLinkLabel: m.a.memberLinkLabel }, b: { id: m.b.id, name: m.b.name, memberLinkLabel: m.b.memberLinkLabel } }));
  const restList = async (key: string) => {
    const all = await rest(key, "/contacts?group=all&pageSize=100");
    const mem = await rest(key, "/contacts?group=source:member&pageSize=100");
    return { status: [all.status, mem.status], rows: (all.body?.data ?? []).map((r: Any) => ({ id: r.id, badges: r.badges })), summary: all.body?.summary, memTotal: mem.body?.page?.total, memRows: (mem.body?.data ?? []).map((r: Any) => r.id) };
  };
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
    for (const who of Object.keys(V)) {
      s[`list:${who}`] = norm(await listSummary(viewerOf(who)));
      const mf = await mergeFull(viewerOf(who));
      s[`merge:${who}`] = norm(mf);
      s[`mergeP:${who}`] = norm(mergeProj(mf));
    }
    s["list:omit"] = norm(await listSummary("omit"));
    s["merge:omit"] = norm(await mergeFull("omit"));
    s["restlist:acc"] = norm(await restList(kAcc.rawKey));
    s["restlist:accmem"] = norm(await restList(kAccMem.rawKey));
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

  // ═══ round 2 RED → GREEN: contacts list (count · source:member filter · badge) and merge page label ═══
  console.log("\n── round 2 · denied viewers: list + merge byte-identical to 'no member linked' ──");
  const denied2: [string, string, string][] = [
    ["CF19-L1", "list:staffNoMember", "contacts list · STAFF without member key"],
    ["CF19-L2", "list:staffOtherBranch", "contacts list · STAFF with member.customer.read limited to branch B"],
    ["CF19-L3", "list:omit", "contacts list · no viewer"],
    ["CF19-L4", "restlist:acc", "REST GET /contacts (group=all + group=source:member) · account-only key"],
    ["CF19-M1", "merge:staffNoMember", "merge page candidates · STAFF without member key"],
    ["CF19-M2", "merge:staffOtherBranch", "merge page candidates · STAFF limited to branch B"],
    ["CF19-M3", "merge:omit", "merge candidates · no viewer"],
  ];
  for (const [id, k, label] of denied2) {
    const L = linked[k]!, U = unlinked[k]!;
    const o = JSON.parse(L);
    const sig = k.startsWith("merge") ? `labels=${j((o as Any[]).flatMap((m: Any) => [m.a.memberLinkLabel, m.b.memberLinkLabel]))}` : `member count=${j(o.counts?.source?.member)} memTotal=${j(o.memTotal)} badge(contact)=${j((o.rows ?? []).find((r: Any) => r.id === "<CONTACT>")?.badges)}`;
    chk(id, L === U && leaks(L).length === 0 && !L.includes("\"member\":true") && (k.startsWith("merge") || !L.includes("<PARTY>")), `${label}: == no-member ${L === U} · leaked ${j(leaks(L))} · ${sig}`);
  }
  console.log("\n── round 2 · entitled viewers: list + merge show the member ──");
  for (const [id, who] of [["CF19-L5", "owner"], ["CF19-L6", "staffEntitled"], ["CF19-L7", "staffHomeBranch"]] as const) {
    const o = JSON.parse(linked[`list:${who}`]!);
    const mg = JSON.parse(linked[`merge:${who}`]!) as Any[];
    const lab = mg.flatMap((m: Any) => [m.a, m.b]).find((c: Any) => c.id === "<CONTACT>")?.memberLinkLabel;
    chk(id, o.counts?.source?.member === 1 && o.memTotal === 1 && j(o.memRows) === j(["<CONTACT>"]) && o.rows.find((r: Any) => r.id === "<CONTACT>")?.badges?.member === true && lab === `#${CODE}`,
      `${who}: member count ${o.counts?.source?.member} · source:member ${j(o.memRows)} · badge ${j(o.rows.find((r: Any) => r.id === "<CONTACT>")?.badges)} · merge label ${j(lab)}`);
  }
  const rl = JSON.parse(linked["restlist:accmem"]!);
  chk("CF19-L8", rl.memTotal === 1 && rl.rows.find((r: Any) => r.id === "<CONTACT>")?.badges?.member === true, `REST list · key with member.customer.read: source:member total ${rl.memTotal} · badge ${j(rl.rows.find((r: Any) => r.id === "<CONTACT>")?.badges)}`);

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

  chk("CF19-E6", linked["web:owner"] === linked["web:staffEntitled"] && linked["page:owner"] === linked["page:staffEntitled"], "OWNER and entitled STAFF see the same DTO (no CRM system in this shop ⇒ nothing else viewer-dependent)");


  // ═══ query budget (WO 3.4 ceiling 12) — links tab, real SQL statements ═══
  console.log("\n── query budget: links tab ≤ 12 ──");
  const sqlOf = async (viewer: Any) => {
    sqlLog = []; counting = true;
    await bare(viewer);
    counting = false;
    return sqlLog.filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(q)).length;
  };
  const nOwner = await sqlOf(viewerOf("owner"));
  const nNoRead = await sqlOf(viewerOf("staffNoMember"));
  const nBranch = await sqlOf(viewerOf("staffHomeBranch"));
  chk("CF19-Q1", nOwner <= 12, `OWNER: ${nOwner} statements`);
  chk("CF19-Q2", nNoRead <= 12, `STAFF without member read: ${nNoRead} statements`);
  chk("CF19-Q3", nBranch <= 12, `branch-limited entitled STAFF: ${nBranch} statements (was 14 at 4aa42ad2: briefFor loaded points)`);

  // ═══ ROUND 3 (controller rulings on the review) — RED on 80f776a9 ═══
  const r3: Record<string, string> = {};
  const loc = (v: unknown, extra: [string, string][]) => { let x = norm(v); for (const [id, tok] of extra) x = x.split(id).join(tok); return x; };

  // ── RV14-1 · CRM contact 360 'member' block (by CrmContact.memberCustomerId) + CRM REST contacts.get (same call) ──
  console.log("\n── round 3 · RV14-1 CRM contact 360 member block ──");
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  await P.appSystem.update({ where: { id: S }, data: { settings: { crm: { uiVersion: 2 } } } });
  await mk("crmNoMember", "STAFF", ["*"], { "crm.contact.read": true });
  await mk("crmOtherBranch", "STAFF", [UB], { "crm.contact.read": true, "member.customer.read": true });
  await mk("crmHomeBranch", "STAFF", [UA], { "crm.contact.read": true, "member.customer.read": true });
  const crmWho = ["owner", "crmNoMember", "crmOtherBranch", "crmHomeBranch"] as const;
  const ccOf: Record<string, string> = {};
  for (const who of crmWho) {
    // each viewer owns its own CRM contact (CRM STAFF default visibility = own rows) — all linked to the same member
    ccOf[who] = (await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `ซีอาร์เอ็ม ${who} ${TAG}`, ownerUserId: V[who]!.uid, memberCustomerId: cust.id } })).id as string;
  }
  const ccTok: [string, string][] = [[S, "<CRM>"], ...crmWho.map((w) => [ccOf[w]!, `<CC-${w}>`] as [string, string]), ...Object.entries(V).map(([w, v]) => [v.uid, `<U-${w}>`] as [string, string])];
  const c360 = async (who: string) => {
    const d = await CRM.contacts.getContact360({ tenantId: T, systemId: S, actorUserId: V[who]!.uid }, viewerOf(who), ccOf[who]);
    // timestamps dropped: the linked/unlinked switch itself bumps updatedAt, and the fixtures are fresh per run (base compare across runs)
    const { createdAt: _c, updatedAt: _u, assignedAt: _a, lastActivityAt: _l, ...contactNoTime } = (d.contact ?? {}) as Record<string, unknown>;
    return { proj: loc({ member: d.member, contact: contactNoTime }, ccTok), consent: loc(d.consent, ccTok) };
  };
  const kCrm = await ak.createApiKey({ tenantId: T }, `${TAG} crm`, { scopes: ["crm.contact.read"], systemId: S });
  const kCrmMem = await ak.createApiKey({ tenantId: T }, `${TAG} crmmem`, { scopes: ["crm.contact.read", "member.customer.read"], systemId: S });
  const crmRoute = (await import("@/app/api/v1/crm/[...path]/route" as string)) as Any;
  const crmRest = async (key: string, id: string) => {
    const req = new Request(`http://x/api/v1/crm/contacts/${id}`, { method: "GET", headers: { authorization: `Bearer ${key}` } });
    const r = await crmRoute.GET(req, { params: Promise.resolve({ path: ["contacts", id] }) });
    const text = await r.text();
    let body: Any = null; try { body = JSON.parse(text); } catch { body = { _raw: text.slice(0, 200) }; }
    return loc({ status: r.status, member: body?.data?.member, memberCustomerId: body?.data?.contact?.memberCustomerId, error: body?.error?.code }, ccTok);
  };
  const snap360 = async () => {
    const o: Record<string, { proj: string; consent: string }> = {};
    for (const who of crmWho) o[who] = await c360(who);
    o["rest:crm"] = { proj: await crmRest(kCrm.rawKey, ccOf.owner!), consent: "" };
    o["rest:crmmem"] = { proj: await crmRest(kCrmMem.rawKey, ccOf.owner!), consent: "" };
    return o;
  };
  const L3 = await snap360();
  await P.crmContact.updateMany({ where: { tenantId: T, systemId: S }, data: { memberCustomerId: null } });
  const U3 = await snap360();
  for (const who of crmWho) await P.crmContact.update({ where: { id: ccOf[who] }, data: { memberCustomerId: cust.id } });
  for (const [id, k, label] of [["CF19-C1", "crmNoMember", "STAFF with crm.contact.read, no member key"], ["CF19-C2", "crmOtherBranch", "STAFF crm + member read limited to branch B (member home A)"], ["CF19-C5", "rest:crm", "CRM REST GET /contacts/{id} · key [crm.contact.read]"]] as const) {
    const l = L3[k]!.proj, u = U3[k]!.proj;
    chk(id, l === u && leaks(l).length === 0 && !l.includes("<CUSTOMER>"), `${label}: {member, contact} == not-linked ${l === u} · leaked ${j(leaks(l))} · ${cut(l, 200)}`);
  }
  for (const [id, k, label] of [["CF19-C3", "owner", "OWNER"], ["CF19-C4", "crmHomeBranch", "STAFF crm + member read of the member's home branch"]] as const) {
    const o = JSON.parse(L3[k]!.proj);
    chk(id, o.member?.memberCode === CODE && o.member?.customerId === "<CUSTOMER>" && o.contact?.memberCustomerId === "<CUSTOMER>" && L3[k]!.proj !== U3[k]!.proj, `${label}: member block ${j(o.member)} · contact.memberCustomerId ${j(o.contact?.memberCustomerId)}`);
  }
  const rcm = JSON.parse(L3["rest:crmmem"]!.proj);
  chk("CF19-C6", rcm.status === 200 && rcm.member?.memberCode === CODE, `CRM REST · key [crm.contact.read, member.customer.read] → ${j(rcm)}`);
  for (const k of ["owner", "crmHomeBranch", "rest:crmmem"]) r3[`crm360:${k}`] = L3[k]!.proj;
  const nOwnerCrm = await sqlOf(viewerOf("owner"));
  console.log(`  ℹ️  RV14-4 (known debt, not fixed): with a CRM system in the shop the OWNER's links tab costs ${nOwnerCrm} statements (CRM contact + deal lookups) — Q1–Q3 above are measured before the CRM system exists`);
  console.log(`  ℹ️  consent block (NOT gated — listed, owner question): STAFF without member key linked==unlinked ${L3.crmNoMember!.consent === U3.crmNoMember!.consent} · linked ${cut(L3.crmNoMember!.consent, 160)}`);

  // ── RV14-2 · account AI tools: the asker's own member viewer (OWNER sees the truth, member-blind = not linked) ──
  console.log("\n── round 3 · RV14-2 account AI assistant ──");
  const TA = (await import("@/lib/ai/tools-account" as string)) as Any;
  const AIA = (await import("@/lib/ai/actor" as string)) as Any;
  const aiTool = (name: string) => (TA.accountTools() as Any[]).find((t) => t.def.name === name);
  const aiActorOf = (who: string) => (who === "key" ? AIA.aiApiKeyActor({ tenantId: T, keyId: kAcc.id, scopes: ["account.doc.view", "account.contact.manage"], systemId: A }) : AIA.aiMemberActor(T, V[who]!.uid, V[who]!));
  const aiRun = async (who: string) => {
    const ctxAi = { tenantId: T, systemId: A, actor: aiActorOf(who) };
    let g = await aiTool("account_get_contact").execute(ctxAi, { id: contact.id });
    if (String(g).includes("error")) g = await aiTool("account_get_contact").execute(ctxAi, { contactId: contact.id });
    const l = await aiTool("account_search_contacts").execute(ctxAi, { group: "source:member" });
    return { get: norm(JSON.parse(g)), list: norm(JSON.parse(l)) };
  };
  // the account tools need an account read key (account.doc.view) — STAFF viewers of this section hold it; only the member side differs
  await mk("aiEntitled", "STAFF", ["*"], { "account.doc.view": true, "member.customer.read": true });
  await mk("aiNoMember", "STAFF", ["*"], { "account.doc.view": true });
  await mk("aiOtherBranch", "STAFF", [UB], { "account.doc.view": true, "member.customer.read": true });
  const aiWho = ["owner", "aiEntitled", "aiNoMember", "aiOtherBranch", "key"];
  const aiL: Record<string, Any> = {}, aiU: Record<string, Any> = {};
  for (const w of aiWho) aiL[w] = await aiRun(w);
  await P.customer.update({ where: { id: cust.id }, data: { partyId: null } });
  for (const w of aiWho) aiU[w] = await aiRun(w);
  await P.customer.update({ where: { id: cust.id }, data: { partyId: pty.id } });
  for (const [id, w] of [["CF19-A1", "owner"], ["CF19-A2", "aiEntitled"]] as const) {
    chk(id, aiL[w].get !== aiU[w].get && aiL[w].list !== aiU[w].list && aiL[w].list.includes("<CONTACT>") && !aiU[w].list.includes("<CONTACT>"),
      `${w} through AI: get linked≠unlinked ${aiL[w].get !== aiU[w].get} · source:member list has the contact (linked ${aiL[w].list.includes("<CONTACT>")}, unlinked ${aiU[w].list.includes("<CONTACT>")}) · ${cut(aiL[w].get, 120)}`);
  }
  for (const [id, w] of [["CF19-A3", "aiNoMember"], ["CF19-A4", "aiOtherBranch"], ["CF19-A5", "key"]] as const) {
    chk(id, !aiL[w].get.includes("\"error\"") && aiL[w].get === aiU[w].get && aiL[w].list === aiU[w].list && leaks(aiL[w].get + aiL[w].list).length === 0, `${w} through AI: linked == unlinked (get ${aiL[w].get === aiU[w].get} · list ${aiL[w].list === aiU[w].list}) · ${cut(aiL[w].get, 120)}`);
  }
  r3["ai:owner:get"] = aiL.owner.get;

  // ── RV14-3 · merge by a member-blind STAFF: the member link of the merged-away Party follows the survivor ──
  console.log("\n── round 3 · RV14-3 merge keeps the member reachable ──");
  await mk("staffMerger", "STAFF", ["*"], { ...ACC, "account.contact.merge": true });
  const mergerCookie = await sessionCookie(V.staffMerger!.uid, T);
  const mkPair = async (tag: string, phone: string, aMember: string | null, bMember: string | null) => {
    const pa = await P.party.create({ data: { tenantId: T, name: `คู่${tag}ก ${TAG}`, kind: "PERSON" } });
    const pb = await P.party.create({ data: { tenantId: T, name: `คู่${tag}ข ${TAG}`, kind: "PERSON" } });
    const ca = await P.accountContact.create({ data: { tenantId: T, systemId: A, name: `คู่${tag}ก ${TAG}`, kind: "CUSTOMER", partyId: pa.id, phone, phoneNorm: phone } });
    const cb = await P.accountContact.create({ data: { tenantId: T, systemId: A, name: `คู่${tag}ข ${TAG}`, kind: "CUSTOMER", partyId: pb.id, phone, phoneNorm: phone } });
    const ma = aMember ? await P.customer.create({ data: { tenantId: T, memberSystemId: M, name: `คู่${tag}ก`, memberCode: aMember, homeUnitId: UA, partyId: pa.id, status: "ACTIVE" } }) : null;
    const mb = bMember ? await P.customer.create({ data: { tenantId: T, memberSystemId: M, name: `คู่${tag}ข`, memberCode: bMember, homeUnitId: UA, partyId: pb.id, status: "ACTIVE" } }) : null;
    return { pa: pa.id, pb: pb.id, ca: ca.id, cb: cb.id, ma: ma?.id ?? null, mb: mb?.id ?? null };
  };
  const mergeAs = (primaryId: string, secondaryId: string, fieldChoices?: Record<string, string>): Promise<Any> =>
    inScope<Any>(mergerCookie, `/app/sys/${A}/account/contacts/merge`, () => ACT.mergeContactsAction(A, { primaryId, secondaryId, ...(fieldChoices ? { fieldChoices } : {}) }));
  const ownerCard = async (cid: string) => {
    const pr = await CP.contactProfile({ tenantId: T, systemId: A }, cid, { base: "", tab: "links", asOf: ASOF, crmViewer: viewerOf("owner") });
    return pr?.linksTab?.cards?.find((c: Any) => c.key === "member") ?? null;
  };
  // (1) member on the secondary · blind merger keeps the unlinked contact as primary (default choices)
  const x1 = await mkPair("1", "0811110001", null, "M-CF19M");
  const blindLabels = ((await CMERGE.listMergeCandidates(ctxA, viewerOf("staffMerger"))) as Any[]).filter((m: Any) => [m.a.id, m.b.id].includes(x1.ca)).flatMap((m: Any) => [m.a.memberLinkLabel, m.b.memberLinkLabel]);
  const m1 = await mergeAs(x1.ca, x1.cb);
  const card1 = await ownerCard(x1.ca);
  const cust1 = await P.customer.findFirst({ where: { id: x1.mb }, select: { partyId: true } });
  chk("CF19-G1", m1?.ok === true && card1?.linked === true && card1?.detail === "#M-CF19M · ระดับ MEMBER" && cust1?.partyId === x1.pa,
    `blind STAFF (labels on the merge page ${j(blindLabels)}) merges [no member] ← [member M-CF19M] with default choices → ok ${m1?.ok} · OWNER card on the survivor ${j(card1?.detail)} linked ${card1?.linked} · member now on the survivor's Party ${cust1?.partyId === x1.pa}`);
  chk("CF19-G2", m1?.ok === true && j(Object.keys(m1).sort()) === j(["moved", "ok", "partyMerged", "primaryId", "secondaryId"]) && j(Object.keys(m1.moved).sort()) === j(["documents", "groupsDeduped", "groupsMoved", "journalLines", "recurringRules"]),
    `merge result to the blind user carries no member hint: keys ${j(Object.keys(m1 ?? {}).sort())} · moved ${j(m1?.moved)}`);
  // (2) both sides hold a member → nothing moves (no member merge) · the survivor keeps its own member
  const x2 = await mkPair("2", "0811110002", "M-CF19Z", "M-CF19W");
  const m2 = await mergeAs(x2.ca, x2.cb);
  const [z2, w2] = await Promise.all([P.customer.findFirst({ where: { id: x2.ma }, select: { partyId: true } }), P.customer.findFirst({ where: { id: x2.mb }, select: { partyId: true } })]);
  const card2 = await ownerCard(x2.ca);
  chk("CF19-G3", m2?.ok === true && z2?.partyId === x2.pa && w2?.partyId === x2.pb && card2?.detail === "#M-CF19Z · ระดับ MEMBER",
    `both sides members (M-CF19Z ← M-CF19W): survivor's member stays ${z2?.partyId === x2.pa} · secondary's member stays on its own Party ${w2?.partyId === x2.pb} (no member merge) · OWNER card ${j(card2?.detail)}`);
  // (3) the user keeps the SECONDARY's Party: the primary's member follows to it
  const x3 = await mkPair("3", "0811110003", "M-CF19Q", null);
  const m3 = await mergeAs(x3.ca, x3.cb, { partyId: "secondary" });
  const card3 = await ownerCard(x3.ca);
  const surv3 = await P.accountContact.findFirst({ where: { id: x3.ca }, select: { partyId: true } });
  const cust3 = await P.customer.findFirst({ where: { id: x3.ma }, select: { partyId: true } });
  chk("CF19-G4", m3?.ok === true && surv3?.partyId === x3.pb && cust3?.partyId === x3.pb && card3?.detail === "#M-CF19Q · ระดับ MEMBER",
    `keep the secondary's Party: survivor Party = secondary's ${surv3?.partyId === x3.pb} · primary's member followed ${cust3?.partyId === x3.pb} · OWNER card ${j(card3?.detail)}`);
  console.log("  ℹ️  no un-merge / restore path exists for account contacts (grep: none in account/ or party/) — nothing to keep consistent");

  // ═══ byte-compare against the base tree (RED run on 80f776a9 writes it) ═══
  const baseKeys = ["page:owner", "page:staffEntitled", "page:staffHomeBranch", "rest:accmem", "list:owner", "list:staffEntitled", "list:staffHomeBranch", "restlist:accmem", "mergeP:owner", "mergeP:staffEntitled", "mergeP:staffHomeBranch", "crm360:owner", "crm360:crmHomeBranch", "crm360:rest:crmmem"];
  const cur: Record<string, string> = Object.fromEntries(baseKeys.map((k) => [k, linked[k] ?? r3[k]!]));
  if (WRITE_BASE) {
    writeFileSync(BASE_FILE, JSON.stringify(cur, null, 1));
    console.log(`  ℹ️  base written → ${BASE_FILE}`);
  }
  if (existsSync(BASE_FILE)) {
    const base = JSON.parse(readFileSync(BASE_FILE, "utf8")) as Record<string, string>;
    const diff = baseKeys.filter((k) => base[k] !== cur[k]);
    chk("CF19-E5", diff.length === 0, `entitled DTOs byte-identical to the base tree (${baseKeys.join(", ")}) — differing: ${j(diff)}`);
  } else chk("CF19-E5", false, `no ${BASE_FILE} — run the base tree with --write-base first`);

  // ═══ rule equivalence: the branch rule is the member module's own (homeUnit OR a visit-type activity in the branch) ═══
  console.log("\n── branch rule == member module (assertVisible / visibleCustomerIds) ──");
  const MS = (await import("@/lib/modules/member/service" as string)) as Any;
  const vOther = viewerOf("staffOtherBranch");
  const probeRule = async () => ({ card: !!(await MS.findCustomerByPartyId(T, M, pty.id, vOther)), set: (await MS.listPartyIdsWithCustomer(T, M, [pty.id], vOther)).size, codes: (await MS.findMemberCodesByPartyIds(T, M, [pty.id], vOther)).size, brief: (await MS.visibleCustomerIds(T, M, vOther, [cust.id])).size });
  const r0 = await probeRule();
  await P.memberActivity.create({ data: { tenantId: T, customerId: cust.id, unitId: UB, module: "crm", type: "NOTE", summary: "qc-cf19 non-visit activity in branch B" } });
  const r1 = await probeRule();
  await P.memberActivity.create({ data: { tenantId: T, customerId: cust.id, unitId: UB, module: "pos", type: "VISIT", summary: "qc-cf19 visit in branch B" } });
  const r2 = await probeRule();
  await P.memberActivity.deleteMany({ where: { tenantId: T, customerId: cust.id, summary: { startsWith: "qc-cf19" } } });
  const same = (r: Any, want: number) => r.card === (want === 1) && r.set === want && r.codes === want && r.brief === want;
  chk("CF19-V1", same(r0, 0) && same(r1, 0) && same(r2, 1),
    `STAFF of branch B: no activity ${j(r0)} · a crm (non-visit) activity in B ${j(r1)} · a pos visit in B ${j(r2)} — the three by-party lookups agree with visibleCustomerIds (briefFor/assertVisible) each time`);

  console.log("\n── INFO ──");
  console.log(`  ℹ️  links tab SQL statements: OWNER ${nOwner} · no member read ${nNoRead} · branch-limited entitled ${nBranch}`);
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
