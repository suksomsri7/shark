// REVIEW probe — CRM C5.5-fix14 (authz-sweep S4) · independent reviewer · does NOT reuse the builder's probe.
//   A  rule equivalence: memberLinkScope (via the 3 by-party lookups) vs the member module's own gates
//      (visibleCustomerIds = canReadMember + briefFor/assertVisible; listMembers = the member list page) over a persona × fixture matrix.
//   B  doors the builder did not exercise: REST merge-candidates / contact-groups / link-suggestions / list search by member code,
//      AI account tools (account_get_contact, account_search_contacts) — denied == "no member linked"; OWNER regressions surfaced.
//   C  timing: SQL statement count of the links tab, linked vs unlinked, per viewer (no data-dependent query).
//   D  merge by a member-blind viewer: what happens to the member link of the surviving contact.
//   E  API key scopes: which member.* scope makes an account key a member viewer.
// QC2 ONLY (ep-cool-shadow) · own throwaway tenant `qc-cf19r-*` swept to 0 rows in finally · network blocked.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf19/review/probe-cf19-review.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.log(`QC2 only — got ${host}`);
  process.exit(2);
}
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;

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
const TAG = `qc-cf19r-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean; sev?: string }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const info = (msg: string) => console.log(`  ℹ️  ${msg}`);
const j = (v: unknown) => JSON.stringify(v);
const USERS: string[] = [];
const TENANTS: string[] = [];
const ACCS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;

try {
  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  TENANTS.push(T);
  const UA = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `A ${TAG}`, slug: `${TAG}-a` } })).id as string;
  const UB = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `B ${TAG}`, slug: `${TAG}-b` } })).id as string;
  const UC = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `C ${TAG}`, slug: `${TAG}-c` } })).id as string;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${TAG}`)).id as string;
  ACCS.push(A);
  const M = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${TAG}`)).id as string;

  // ═══ fixtures: one Party per member (+ one Party holding two members) ═══
  const mkParty = async (n: string) => (await P.party.create({ data: { tenantId: T, name: `${n} ${TAG}`, kind: "PERSON" } })).id as string;
  let seq = 0;
  const mkCust = async (key: string, o: { home?: string | null; status?: string; party?: string; createdAt?: Date }) => {
    seq += 1;
    const partyId = o.party ?? (await mkParty(key));
    const c = await P.customer.create({
      data: {
        tenantId: T, memberSystemId: M, name: `${key} ${TAG}`, memberCode: `M-R${String(seq).padStart(3, "0")}`, tier: "GOLD",
        totalSpentSatang: 1000 * seq, visitCount: seq, homeUnitId: o.home ?? null, partyId, status: o.status ?? "ACTIVE",
        ...(o.createdAt ? { createdAt: o.createdAt } : {}),
      },
    });
    return { id: c.id as string, partyId, code: c.memberCode as string, key };
  };
  const act = (customerId: string, unitId: string, module: string) =>
    P.memberActivity.create({ data: { tenantId: T, customerId, unitId, module, type: "VISIT", summary: `qc-cf19r ${module}` } });
  const F: Record<string, { id: string; partyId: string; code: string; key: string }> = {};
  F.homeA = await mkCust("homeA", { home: UA });
  F.noHomePosB = await mkCust("noHomePosB", { home: null });
  await act(F.noHomePosB.id, UB, "pos");
  F.noHomeCrmB = await mkCust("noHomeCrmB", { home: null });
  await act(F.noHomeCrmB.id, UB, "crm");
  F.homeABookingB = await mkCust("homeABookingB", { home: UA });
  await act(F.homeABookingB.id, UB, "booking");
  F.homeCRestB = await mkCust("homeCRestB", { home: UC });
  await act(F.homeCRestB.id, UB, "restaurant");
  F.mergedHomeB = await mkCust("mergedHomeB", { home: UB, status: "MERGED" });
  F.closedHomeB = await mkCust("closedHomeB", { home: UB, status: "CLOSED" });
  F.noHomeNoAct = await mkCust("noHomeNoAct", { home: null });
  F.homeB = await mkCust("homeB", { home: UB });
  const sharedParty = await mkParty("shared");
  F.sharedOldA = await mkCust("sharedOldA", { home: UA, party: sharedParty, createdAt: new Date("2026-01-01T00:00:00Z") });
  F.sharedNewB = await mkCust("sharedNewB", { home: UB, party: sharedParty, createdAt: new Date("2026-02-01T00:00:00Z") });
  await P.customer.update({ where: { id: F.mergedHomeB.id }, data: { mergedIntoId: F.homeA.id } });
  const singles = Object.values(F).filter((f) => f.partyId !== sharedParty);

  // ═══ personas ═══
  const CL = (await import("@/lib/modules/account/contact-links" as string)) as Any;
  const MS = (await import("@/lib/modules/member/service" as string)) as Any;
  const ML = (await import("@/lib/modules/member/list" as string)) as Any;
  const actor = (role: string, unitAccess: string[], permissions: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ userId: `u-${randomBytes(3).toString("hex")}`, role, unitAccess, permissions, ...extra });
  const keyActor = (scopes: string[]) => CL.crmViewerOfApi({ kind: "apikey", userId: null, scopes, membership: null, keyId: "k" });
  const R = { "member.customer.read": true };
  const personas: [string, Any][] = [
    ["OWNER *", actor("OWNER", ["*"], {})],
    ["OWNER [UB]", actor("OWNER", [UB], {})],
    ["MANAGER *", actor("MANAGER", ["*"], {})],
    ["MANAGER [UB] no member keys", actor("MANAGER", [UB], {})],
    ["MANAGER []", actor("MANAGER", [], {})],
    ["STAFF [] read", actor("STAFF", [], R)],
    ["STAFF [UA,UB] read", actor("STAFF", [UA, UB], R)],
    ["STAFF [UB] stamp-only (implicit read)", actor("STAFF", [UB], { "member.loyalty.stamp": true })],
    ["STAFF [UB] member.*", actor("STAFF", [UB], { "member.*": true })],
    ["STAFF [UB] read=false", actor("STAFF", [UB], { "member.customer.read": false })],
    ["STAFF [UB] read='true' (string)", actor("STAFF", [UB], { "member.customer.read": "true" })],
    ["STAFF [*,UB] read", actor("STAFF", ["*", UB], R)],
    ["STAFF [foreign unit] read", actor("STAFF", ["cxforeignunitxxxxxxxxxxxx"], R)],
    ["STAFF [UB] read", actor("STAFF", [UB], R)],
    ["STAFF [UC] read", actor("STAFF", [UC], R)],
    ["STAFF * no member", actor("STAFF", ["*"], { "account.contact.manage": true })],
    ["key acc+member.customer.read", keyActor(["account.doc.view", "member.customer.read"])],
    ["key acc+member.review.read", keyActor(["account.doc.view", "member.review.read"])],
    ["key acc only", keyActor(["account.doc.view", "account.contact.manage"])],
    ["CUSTOMER self=homeB", actor("CUSTOMER", [], {}, { customerId: F.homeB.id })],
    ["CUSTOMER no id", actor("CUSTOMER", [], {})],
    ["assistant actor → crmViewerOfApi", CL.crmViewerOfApi({ kind: "assistant", scopes: ["account.doc.view"], membership: { role: "STAFF", unitAccess: ["*"], permissions: {} } })],
  ];

  // ═══ A · equivalence ═══
  console.log("\n── A · memberLinkScope vs member module gates (persona × 11 fixtures) ──");
  const allParties = [...new Set(Object.values(F).map((f) => f.partyId))];
  const listCtx = { tenantId: T, systemId: M, actorUserId: null };
  for (const [name, v] of personas) {
    const set = (await MS.listPartyIdsWithCustomer(T, M, allParties, v ?? undefined)) as Set<string>;
    const codes = (await MS.findMemberCodesByPartyIds(T, M, allParties, v ?? undefined)) as Map<string, string>;
    const ref: Set<string> = v ? await MS.visibleCustomerIds(T, M, v, Object.values(F).map((f) => f.id)) : new Set();
    let listIds = new Set<string>();
    try {
      if (v) listIds = new Set(((await ML.listMembers(listCtx, v, { take: 100 })).items as Any[]).map((r) => r.id));
    } catch { /* denied */ }
    const mism: string[] = [];
    const listMism: string[] = [];
    for (const f of singles) {
      const gate = set.has(f.partyId);
      const gateCode = codes.has(f.partyId);
      const card = !!(await MS.findCustomerByPartyId(T, M, f.partyId, v ?? undefined));
      const want = ref.has(f.id);
      if (gate !== want || gateCode !== want || card !== want) mism.push(`${f.key}: gate=${gate}/${gateCode}/${card} ref=${want}`);
      if (gate !== listIds.has(f.id)) listMism.push(`${f.key}:gate=${gate},list=${listIds.has(f.id)}`);
    }
    // shared Party: oldest VISIBLE row (member module order) — card id + code
    const card = await MS.findCustomerByPartyId(T, M, sharedParty, v ?? undefined);
    const visShared = [F.sharedOldA, F.sharedNewB].filter((f) => ref.has(f.id));
    const wantShared = visShared[0]?.id ?? null;
    if ((card?.id ?? null) !== wantShared) mism.push(`shared: card=${card?.id === F.sharedOldA.id ? "old" : card?.id === F.sharedNewB.id ? "new" : card?.id ?? null} want=${wantShared === F.sharedOldA.id ? "old" : wantShared === F.sharedNewB.id ? "new" : null}`);
    if (set.has(sharedParty) !== visShared.length > 0) mism.push(`shared set=${set.has(sharedParty)}`);
    const sharedCode = codes.get(sharedParty) ?? null;
    if (visShared.length > 0 && !visShared.some((f) => f.code === sharedCode)) mism.push(`shared code ${sharedCode} not a visible row's code`);
    if (visShared.length === 0 && sharedCode !== null) mism.push(`shared code ${sharedCode} while none visible`);
    chk(`A-${name}`, mism.length === 0, `${name}: visible ${ref.size}/11 · gate==visibleCustomerIds ${mism.length === 0 ? "yes" : j(mism)} · vs listMembers (excl. MERGED by default): ${listMism.length ? j(listMism) : "same"}`);
  }
  for (const [name, v] of [["undefined", undefined], ["null", null]] as const) {
    const n = (await MS.listPartyIdsWithCustomer(T, M, allParties, v)).size + (await MS.findMemberCodesByPartyIds(T, M, allParties, v)).size + (await MS.findCustomerByPartyId(T, M, F.homeA.partyId, v) ? 1 : 0);
    chk(`A-${name}`, n === 0, `viewer ${name}: rows ${n}`);
  }
  const nSys = (await MS.listPartyIdsWithCustomer(T, M, allParties, "system")).size;
  chk("A-system", nSys === allParties.length, `"system": ${nSys}/${allParties.length} parties (unchanged pre-fix behaviour)`);

  // ═══ world for the doors: account contacts on two of the parties ═══
  const owner = await (async () => {
    const uid = (await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC owner ${TAG}` } })).id as string;
    USERS.push(uid);
    await P.membership.create({ data: { userId: uid, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    return { uid, m: { role: "OWNER", unitAccess: ["*"], permissions: {} } };
  })();
  const staffNo = await (async () => {
    const uid = (await P.user.create({ data: { email: `${TAG}-staff@qc.invalid`, name: `QC staff ${TAG}` } })).id as string;
    USERS.push(uid);
    const m = { role: "STAFF", unitAccess: ["*"], permissions: { "account.contact.manage": true, "account.doc.view": true, "account.contact.merge": true } };
    await P.membership.create({ data: { userId: uid, tenantId: T, ...m, acceptedAt: new Date() } });
    return { uid, m };
  })();
  const vOwner = CL.crmViewerOfSession(owner.uid, owner.m);
  const vNo = CL.crmViewerOfSession(staffNo.uid, staffNo.m);
  const target = F.homeA; // member at home A, code M-R001
  const contact = await P.accountContact.create({ data: { tenantId: T, systemId: A, name: `คุณรีวิว ${TAG}`, kind: "CUSTOMER", partyId: target.partyId, phone: "0899990001", phoneNorm: "0899990001" } });
  const twinParty = await mkParty("twin");
  const contact2 = await P.accountContact.create({ data: { tenantId: T, systemId: A, name: `คุณรีวิว สอง ${TAG}`, kind: "CUSTOMER", partyId: twinParty, phone: "089-999-0001", phoneNorm: "0899990001" } });
  await P.customer.update({ where: { id: target.id }, data: { phone: "0899990001" } });

  const ak = (await import("@/lib/api-keys/service" as string)) as Any;
  const kAcc = await ak.createApiKey({ tenantId: T }, `${TAG} acc`, { scopes: ["account.doc.view", "account.contact.manage", "account.contact.merge"], systemId: A });
  const kWh = await ak.createApiKey({ tenantId: T }, `${TAG} wh`, { scopes: ["account.doc.view", "account.contact.manage", "member.review.read"], systemId: A });
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Any;
  const rest = async (key: string, path: string) => {
    const req = new Request(`http://x/api/v1/account${path}`, { method: "GET", headers: { authorization: `Bearer ${key}` } });
    const r = await route.GET(req, { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const text = await r.text();
    let body: Any = null; try { body = JSON.parse(text); } catch { body = { _raw: text }; }
    return { status: r.status, data: body?.data ?? null, page: body?.page ?? null, error: body?.error ?? null };
  };
  const AIO = (await import("@/lib/ai/account-ops" as string)) as Any;
  const ai = async (name: string, args: Record<string, unknown>, m: Any) => AIO.runAccountTool(T, name, args, { systemId: A, viewer: m });
  const aiGet = async (m: Any) => {
    let r = await ai("account_get_contact", { id: contact.id }, m);
    if (r.mode === "error") r = await ai("account_get_contact", { contactId: contact.id }, m);
    return r;
  };
  const CP = (await import("@/lib/modules/account/contact-profile" as string)) as Any;
  const ASOF = new Date("2026-09-30T12:00:00+07:00");
  const links = (viewer: Any) => CP.contactProfile({ tenantId: T, systemId: A }, contact.id, { base: `/app/sys/${A}/account`, tab: "links", asOf: ASOF, crmViewer: viewer });
  const sqlOf = async (viewer: Any) => {
    sqlLog = []; counting = true;
    await links(viewer);
    counting = false;
    return sqlLog.filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(q));
  };
  const norm = (v: unknown) => {
    let s = j(v);
    for (const [id, tok] of [[contact.id, "<C1>"], [contact2.id, "<C2>"], [target.id, "<CUST>"], [target.partyId, "<PTY>"], [twinParty, "<PTY2>"], [A, "<A>"], [M, "<M>"], [T, "<T>"], [TAG, "<TAG>"]] as const) s = s.split(id).join(tok);
    return s.replace(/"requestId":"[^"]*"/g, "").replace(/ai-[a-z0-9]+/g, "ai-x");
  };

  type Snap = Record<string, string>;
  const snapshot = async (): Promise<Snap> => {
    const s: Snap = {};
    s["rest:merge-candidates"] = norm(await rest(kAcc.rawKey, "/contacts/merge-candidates"));
    s["rest:contact-groups"] = norm(await rest(kAcc.rawKey, "/contact-groups"));
    s["rest:link-suggestions"] = norm(await rest(kAcc.rawKey, `/contacts/${contact.id}/link-suggestions`));
    s["rest:list-q-code"] = norm(await rest(kAcc.rawKey, `/contacts?q=${encodeURIComponent(target.code)}&group=all`));
    s["rest:list-q-phone"] = norm(await rest(kAcc.rawKey, `/contacts?q=0899990001&group=all`));
    s["rest:wh:get"] = norm(await rest(kWh.rawKey, `/contacts/${contact.id}`));
    s["ai:owner:get"] = norm(await aiGet(owner.m));
    s["ai:owner:list"] = norm(await ai("account_search_contacts", { group: "source:member" }, owner.m));
    s["ai:staffNo:get"] = norm(await aiGet(staffNo.m));
    s["ai:staffNo:list"] = norm(await ai("account_search_contacts", { group: "source:member" }, staffNo.m));
    const qNo = await sqlOf(vNo);
    const qOwner = await sqlOf(vOwner);
    s["sql:no"] = String(qNo.length);
    s["sql:owner"] = String(qOwner.length);
    s["sqlshape:no"] = qNo.map((q) => q.replace(/\$\d+/g, "$").slice(0, 120)).join("\n");
    return s;
  };
  console.log("\n── B/C · snapshot linked ──");
  const L = await snapshot();
  await P.customer.update({ where: { id: target.id }, data: { partyId: null } });
  const U = await snapshot();
  await P.customer.update({ where: { id: target.id }, data: { partyId: target.partyId } });

  console.log("\n── B · other doors: account-only key / member-blind user == 'no member linked' ──");
  for (const k of ["rest:merge-candidates", "rest:contact-groups", "rest:link-suggestions", "rest:list-q-code", "rest:list-q-phone", "ai:staffNo:get", "ai:staffNo:list"]) {
    chk(`B-${k}`, L[k] === U[k] && !L[k]!.includes(target.code), `${k}: linked==unlinked ${L[k] === U[k]} · code leaked ${L[k]!.includes(target.code)} · ${L[k]!.slice(0, 150)}`);
  }
  // E · key with an unrelated member.* scope is a member viewer (member module H1 rule — any member.* = implicit read)
  const whLinked = JSON.parse(L["rest:wh:get"]!);
  info(`E · account key + member.review.read → REST links.member=${j(whLinked?.data?.links?.member)} (linked) / ${j(JSON.parse(U["rest:wh:get"]!)?.data?.links?.member)} (unlinked)`);
  // OWNER via the AI assistant: member signal before/after
  const ownerAiShowsMember = L["ai:owner:get"] !== U["ai:owner:get"] || L["ai:owner:list"] !== U["ai:owner:list"];
  info(`B · OWNER through AI tools: linked differs from unlinked = ${ownerAiShowsMember} (false ⇒ the assistant never sees membership, even for OWNER)`);
  info(`B · ai:owner:get (linked) ${L["ai:owner:get"]!.slice(0, 400)}`);
  info(`B · ai:owner:list (linked) ${L["ai:owner:list"]!.slice(0, 300)}`);
  res.push({ id: "B-ai-owner-member-visible(INFO)", ok: true });

  console.log("\n── C · timing: links tab SQL statements, linked vs unlinked ──");
  // statements of a Promise.all race in the log order — compare as a multiset (sorted); print any statement that differs
  const shapeL = L["sqlshape:no"]!.split("\n").sort(), shapeU = U["sqlshape:no"]!.split("\n").sort();
  const onlyL = shapeL.filter((x) => !shapeU.includes(x)), onlyU = shapeU.filter((x) => !shapeL.includes(x));
  chk("C-denied", L["sql:no"] === U["sql:no"] && j(shapeL) === j(shapeU), `member-blind STAFF: ${L["sql:no"]} vs ${U["sql:no"]} statements · same statements (as a set) ${j(shapeL) === j(shapeU)} · in-order identical ${L["sqlshape:no"] === U["sqlshape:no"]} · only-linked ${j(onlyL)} · only-unlinked ${j(onlyU)} · no statement touches "Customer": ${!L["sqlshape:no"]!.includes('"Customer"')}`);
  chk("C-owner", L["sql:owner"] === U["sql:owner"], `OWNER: ${L["sql:owner"]} vs ${U["sql:owner"]} statements (entitled: card shown — not a side channel)`);

  // ═══ D · a member-blind viewer merges the pair ═══
  console.log("\n── D · merge by a member-blind viewer ──");
  const CM = (await import("@/lib/modules/account/contact-merge" as string)) as Any;
  const cands = await CM.listMergeCandidates({ tenantId: T, systemId: A }, vNo);
  const pair = (cands as Any[]).find((c) => [c.a.id, c.b.id].includes(contact.id) && [c.a.id, c.b.id].includes(contact2.id));
  const labelsBlind = pair ? [pair.a.memberLinkLabel, pair.b.memberLinkLabel] : null;
  const pairOwner = ((await CM.listMergeCandidates({ tenantId: T, systemId: A }, vOwner)) as Any[]).find((c) => c.key === pair?.key);
  info(`D · merge page labels: member-blind ${j(labelsBlind)} · OWNER ${j(pairOwner ? [pairOwner.a.memberLinkLabel, pairOwner.b.memberLinkLabel] : null)}`);
  // blind viewer picks contact2 as primary (both rows read "— ยังไม่เชื่อม"), default field choices (= keep primary's Party)
  const mr = await CM.mergeContacts({ tenantId: T, systemId: A }, { primaryId: contact2.id, secondaryId: contact.id, actorId: staffNo.uid });
  const after = await CP.contactProfile({ tenantId: T, systemId: A }, contact2.id, { base: "", tab: "links", asOf: ASOF, crmViewer: vOwner });
  const ownerCard = after?.linksTab?.cards?.find((c: Any) => c.key === "member");
  const custAfter = await P.customer.findFirst({ where: { id: target.id }, select: { partyId: true } });
  const ptyAfter = await P.party.findFirst({ where: { id: target.partyId }, select: { mergedIntoId: true } });
  info(`D · merge ok=${mr.ok} partyMerged=${mr.partyMerged} · member.partyId still the dropped Party=${custAfter?.partyId === target.partyId} (Party.mergedIntoId → survivor's Party ${ptyAfter?.mergedIntoId === twinParty}) · OWNER card on the surviving contact: linked=${ownerCard?.linked} detail=${j(ownerCard?.detail)}`);
  res.push({ id: "D-merge(INFO)", ok: true });

  // ═══ F · sibling outside the builder's sweep: CRM contact 360 member block (by CrmContact.memberCustomerId) ═══
  console.log("\n── F · CRM contact 360 'member' block for viewers the member module would refuse ──");
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  await P.appSystem.update({ where: { id: S }, data: { settings: { crm: { uiVersion: 2 } } } });
  const oA = { userId: owner.uid, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const cS = { tenantId: T, systemId: S, actorUserId: owner.uid };
  // each viewer is a real user who OWNS its own CRM contact (CRM STAFF default visibility = own rows), every contact linked to member M-R001 (home A)
  const mkCrmViewer = async (name: string, role: string, unitAccess: string[], permissions: Record<string, unknown>) => {
    const uid = (await P.user.create({ data: { email: `${TAG}-crm-${name}@qc.invalid`, name: `QC ${name} ${TAG}` } })).id as string;
    USERS.push(uid);
    await P.membership.create({ data: { userId: uid, tenantId: T, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { userId: uid, role, unitAccess, permissions };
  };
  const crmViewers: [string, Any][] = [
    ["OWNER", oA],
    ["STAFF * crm read, no member key", await mkCrmViewer("nomem", "STAFF", ["*"], { "crm.contact.read": true, "crm.contact.create": true })],
    ["STAFF [UB] crm read + member read (member home = A, no visit in B)", await mkCrmViewer("ub", "STAFF", [UB], { "crm.contact.read": true, "crm.contact.create": true, ...R })],
  ];
  let n = 0;
  for (const [name, v] of crmViewers) {
    n += 1;
    const cc = await CRM.contacts.createContact({ ...cS, actorUserId: v.userId }, v, { firstName: `คุณซีอาร์เอ็ม${n} ${TAG}`, phone: `08999900${10 + n}` });
    const ccId = (cc?.contact?.id ?? cc?.id) as string;
    await P.crmContact.update({ where: { id: ccId }, data: { memberCustomerId: target.id, ownerUserId: v.userId } });
    let out: Any;
    try {
      const d = await CRM.contacts.getContact360({ ...cS, actorUserId: v.userId }, v, ccId);
      out = d?.member ?? null;
    } catch (e) { out = `ERR ${(e as Error).message.slice(0, 80)}`; }
    const memberRead = (await MS.visibleCustomerIds(T, M, v, [target.id])).has(target.id);
    const leaks = typeof out === "object" && out !== null && (out.memberCode === target.code || !!out.customerId);
    chk(`F-${name}`, memberRead || !leaks, `${name}: member module would show this member = ${memberRead} · CRM 360 member block ${j(out)}`);
  }
} catch (e) {
  chk("CRASH", false, String((e as Error)?.stack ?? e).slice(0, 1200));
} finally {
  for (const A of ACCS) await P.$executeRawUnsafe(`SELECT account_jno_drop($1)`, A).catch(() => undefined);
  for (const T of TENANTS) {
    const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0;
    for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    chk("CLEAN-tenant", left === 0 && (await P.tenant.count({ where: { id: T } })) === 0, `tenant rows left=${left}`);
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
console.log(`\n${passed === res.length ? "🟢" : "🔴"} review probe cf19: ${passed}/${res.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: res.length, passed, findings: res.filter((r) => !r.ok).map((r) => r.id) })}`);
process.exit(passed === res.length ? 0 : 1);
