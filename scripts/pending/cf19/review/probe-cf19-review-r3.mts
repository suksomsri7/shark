// REVIEW probe — CRM C5.5-fix14 ROUND 3 (builder tip 7c151cc8) · independent reviewer · does not reuse the builder's probe.
//   R-B  member `briefFor` now refuses without `canReadMember`: every actor that passes a member key/role still gets its briefs; key-holders of
//        `member.promo.issue` (voucher.issue's own gate) always pass canReadMember (no voucher regression).
//   R-Q  owner questions Q4/Q5 measured: for a member-blind CRM viewer — 360 member block + contact.memberCustomerId (fixed) vs consent block
//        (`memberLinked`, member consent source/at), CRM list DTO `memberCustomerId` (web badge "สมาชิก"), CSV column "รหัสสมาชิกที่ผูก".
//   R-A  `ApiActor.asker`: real tool wrapper (`accountTools()`) per AI actor kind; tool args cannot smuggle an asker; forged system actor refused.
//   R-F  `followPartyMerge` edges: tenant isolation, two member systems, MERGED/CLOSED rows, SQL-injection-shaped ids, CRM/chat refs unchanged.
// QC2 ONLY (ep-cool-shadow) · own throwaway tenants `qc-cf19r3-*` swept to 0 rows in finally · network blocked.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf19/review/probe-cf19-review-r3.mts
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

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-cf19r3-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
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
const MS = (await import("@/lib/modules/member/service" as string)) as Any;
const MP = (await import("@/lib/modules/member/profile" as string)) as Any;
const MA = (await import("@/lib/modules/member/access" as string)) as Any;
const MKA = (await import("@/lib/modules/member/api/actor" as string)) as Any;
const CRM = (await import("@/lib/modules/crm" as string)) as Any;
const AIA = (await import("@/lib/ai/actor" as string)) as Any;
const TA = (await import("@/lib/ai/tools-account" as string)) as Any;
const AIO = (await import("@/lib/ai/account-ops" as string)) as Any;
const CH = (await import("@/lib/core/channels" as string)) as Any;

try {
  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  TENANTS.push(T);
  const UA = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `A ${TAG}`, slug: `${TAG}-a` } })).id as string;
  const UB = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `B ${TAG}`, slug: `${TAG}-b` } })).id as string;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${TAG}`)).id as string;
  ACCS.push(A);
  const M = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${TAG}`)).id as string;
  const mkParty = async (n: string, tid = T) => (await P.party.create({ data: { tenantId: tid, name: `${n} ${TAG}`, kind: "PERSON" } })).id as string;
  let seq = 0;
  const mkCust = async (o: { sys?: string; tid?: string; party: string | null; home?: string | null; status?: string; createdAt?: Date }) => {
    seq += 1;
    return (await P.customer.create({
      data: {
        tenantId: o.tid ?? T, memberSystemId: o.sys ?? M, name: `m${seq} ${TAG}`, memberCode: `M-R3${String(seq).padStart(3, "0")}`, tier: "GOLD",
        homeUnitId: o.home ?? null, partyId: o.party, status: o.status ?? "ACTIVE", phone: `0877${String(seq).padStart(6, "0")}`,
        ...(o.createdAt ? { createdAt: o.createdAt } : {}),
      },
    })).id as string;
  };
  const mkUser = async (name: string, role: string, unitAccess: string[], permissions: Record<string, unknown>) => {
    const uid = (await P.user.create({ data: { email: `${TAG}-${name}@qc.invalid`, name: `QC ${name} ${TAG}` } })).id as string;
    USERS.push(uid);
    await P.membership.create({ data: { userId: uid, tenantId: T, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { userId: uid, role, unitAccess, permissions };
  };
  const pTarget = await mkParty("target");
  const target = await mkCust({ party: pTarget, home: UA });
  const targetCode = (await P.customer.findFirst({ where: { id: target }, select: { memberCode: true } })).memberCode as string;

  // ═══ R-B · briefFor refusal ═══
  console.log("\n── R-B · member briefFor refuses without canReadMember — legitimate actors unaffected ──");
  const bctx = { tenantId: T, systemId: M, actorUserId: null };
  const a = (role: string, unitAccess: string[], permissions: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ userId: "", role, unitAccess, permissions, ...extra });
  const cases: [string, Any, boolean][] = [
    ["OWNER", a("OWNER", ["*"], {}), true],
    ["MANAGER no keys", a("MANAGER", [], {}), true],
    ["STAFF stamp-only", a("STAFF", ["*"], { "member.loyalty.stamp": true }), true],
    ["STAFF promo.issue-only", a("STAFF", ["*"], { "member.promo.issue": true }), true],
    ["STAFF member.*", a("STAFF", ["*"], { "member.*": true }), true],
    ["STAFF [UB] member read (home A)", a("STAFF", [UB], { "member.customer.read": true }), false],
    ["STAFF crm-only", a("STAFF", ["*"], { "crm.contact.read": true }), false],
    ["STAFF no keys", a("STAFF", ["*"], {}), false],
    ["CUSTOMER self", a("CUSTOMER", [], {}, { customerId: target }), true],
    ["CUSTOMER other", a("CUSTOMER", [], {}, { customerId: "cxother" }), false],
    ["member key member.customer.read", MKA.memberActorForKey({ keyId: "k1", scopes: ["member.customer.read"] }), true],
    ["member key member.loyalty.stamp", MKA.memberActorForKey({ keyId: "k2", scopes: ["member.loyalty.stamp"] }), true],
    ["key account-only", MKA.memberActorForKey({ keyId: "k3", scopes: ["account.doc.view"] }), false],
  ];
  for (const [name, actor, want] of cases) {
    const got = (await MP.briefFor(bctx, actor, [target])).length === 1;
    const vis = (await MS.visibleCustomerIds(T, M, actor, [target])).has(target);
    chk(`B-${name}`, got === want && got === vis, `${name}: briefFor ${got} (want ${want}) · visibleCustomerIds ${vis}`);
  }
  // voucher.issue gate (`hasMemberPerm(actor, "member.promo.issue")`) ⇒ canReadMember, for every actor shape above
  const viol = cases.filter(([, act]) => MA.hasMemberPerm(act, "member.promo.issue") && !MA.canReadMember(act)).map(([n]) => n);
  chk("B-voucher-gate-implies-read", viol.length === 0, `actors passing voucher.issue's gate but failing canReadMember: ${j(viol)}`);

  // ═══ R-Q · Q4 / Q5 ═══
  console.log("\n── R-Q · CRM: member-blind viewer — 360 block (fixed) vs consent block (Q4) · list DTO / CSV (Q5) ──");
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  await P.appSystem.update({ where: { id: S }, data: { settings: { crm: { uiVersion: 2 } } } });
  const blind = await mkUser("blind", "STAFF", ["*"], { "crm.contact.read": true, "crm.contact.create": true, "crm.contact.export": true });
  const cS = { tenantId: T, systemId: S, actorUserId: blind.userId };
  const cc = await CRM.contacts.createContact(cS, blind, { firstName: `คุณคิวห้า ${TAG}`, phone: "0866660001" });
  const ccId = (cc?.contact?.id ?? cc?.id) as string;
  const ch = CH.consentChannels()[0].key as string;
  await P.memberConsent.create({ data: { tenantId: T, customerId: target, channel: ch, granted: true, source: "SIGNUP_FORM", grantedAt: new Date("2026-03-03T03:03:03Z") } });
  const snapCrm = async () => {
    const d = await CRM.contacts.getContact360(cS, blind, ccId);
    const list = await CRM.contacts.listContacts(cS, blind, {});
    let csv = "";
    try { csv = await CRM.contacts.exportContacts(cS, blind, { confirm: true, reason: "qc review" }); } catch (e) { csv = `ERR ${(e as Error).message.slice(0, 60)}`; }
    const cons = await CRM.consents.current(cS, blind, ccId);
    return {
      member360: d?.member ?? null,
      contact360MemberId: d?.contact?.memberCustomerId ?? null,
      consent: { memberLinked: cons.memberLinked, ch0: cons.channels.find((c: Any) => c.channel === ch) },
      listMemberId: (list.items as Any[]).find((r) => r.id === ccId)?.memberCustomerId ?? null,
      csvRow: csv.split("\n").find((l) => l.includes("คิวห้า")) ?? csv.slice(0, 60),
    };
  };
  const unlinked = await snapCrm();
  await P.crmContact.update({ where: { id: ccId }, data: { memberCustomerId: target } });
  const linked = await snapCrm();
  chk("Q-360-fixed", linked.member360 === null && linked.contact360MemberId === null, `360 member block ${j(linked.member360)} · contact.memberCustomerId ${j(linked.contact360MemberId)} (round-3 fix)`);
  // R4-UPDATE (reviewer, after the round-4 ruling on RV14-13): the ruled rule = member provenance (`source`/`at`) null for a refused viewer,
  //   `granted` (decides sends) + `memberLinked` (edit lock) kept. The residual boolean is owner question Q4 (reported as INFO, not asserted equal).
  const c0 = linked.consent.ch0 as Any;
  chk("Q4-consent", linked.consent.memberLinked === true && c0?.granted === true && c0?.source === null && c0?.at === null,
    `consent block (ruled rule: source/at null · granted+memberLinked kept) linked ${j(linked.consent)} · unlinked ${j(unlinked.consent)}`);
  info(`Q4 residual (owner question): memberLinked linked=${j(linked.consent.memberLinked)} vs unlinked=${j(unlinked.consent.memberLinked)}`);
  chk("Q5-list-dto", linked.listMemberId === unlinked.listMemberId, `CRM list DTO memberCustomerId linked ${j(linked.listMemberId)} vs unlinked ${j(unlinked.listMemberId)} (web list renders badge "สมาชิก" from it)  [red = Q5]`);
  chk("Q5-csv", linked.csvRow === unlinked.csvRow, `CSV row linked ${j(linked.csvRow)} · unlinked ${j(unlinked.csvRow)}  [red = Q5]`);
  info(`Q · member-module verdict for this viewer: visibleCustomerIds ${(await MS.visibleCustomerIds(T, M, blind, [target])).size}`);

  // ═══ R-A · ApiActor.asker ═══
  console.log("\n── R-A · account AI tools: asker per AI actor kind; no smuggling ──");
  const owner = await mkUser("owner", "OWNER", ["*"], {});
  const accBlind = await mkUser("accblind", "STAFF", ["*"], { "account.doc.view": true, "account.contact.manage": true });
  const accMem = await mkUser("accmem", "STAFF", ["*"], { "account.doc.view": true, "account.contact.manage": true, "member.customer.read": true });
  const acct = await P.accountContact.create({ data: { tenantId: T, systemId: A, name: `คุณเอไอ ${TAG}`, kind: "CUSTOMER", partyId: pTarget } });
  const tool = (TA.accountTools() as Any[]).find((t) => t.def.name === "account_get_contact");
  const getLinksMember = async (actor: Any, args: Record<string, unknown> = {}) => {
    const out = await tool.execute({ tenantId: T, systemId: A, actor }, { contactId: acct.id, ...args });
    try {
      const o = JSON.parse(out);
      if (o.error) return `ERR ${String(o.error).slice(0, 60)}`;
      const links = o.links ?? o["ลิงก์"] ?? Object.values(o).find((v: Any) => v && typeof v === "object" && "member" in v);
      return (links as Any)?.member ?? `?${out.slice(0, 80)}`;
    } catch { return `RAW ${out.slice(0, 80)}`; }
  };
  const ak = AIA.aiApiKeyActor;
  const aiCases: [string, Any, unknown][] = [
    ["member OWNER", AIA.aiMemberActor(T, owner.userId, owner), true],
    ["member STAFF acc+member read", AIA.aiMemberActor(T, accMem.userId, accMem), true],
    ["member STAFF acc only", AIA.aiMemberActor(T, accBlind.userId, accBlind), false],
    ["apiKey acc only", ak({ tenantId: T, keyId: "kx", scopes: ["account.doc.view"], systemId: A }), false],
    ["apiKey acc+member.customer.read", ak({ tenantId: T, keyId: "ky", scopes: ["account.doc.view", "member.customer.read"], systemId: A }), true],
    ["system scheduled-task", AIA.aiSystemActor(T, "scheduled-task"), "ERR-or-false"],
  ];
  for (const [name, actor, want] of aiCases) {
    const got = await getLinksMember(actor);
    const ok = want === "ERR-or-false" ? got === false || String(got).startsWith("ERR") : got === want;
    chk(`A-${name}`, ok, `${name}: links.member ${j(got)} (want ${j(want)})`);
  }
  const forged = await getLinksMember({ kind: "system", tenantId: T, job: "scheduled-task" });
  chk("A-forged-system", String(forged).startsWith("ERR"), `hand-written system actor: ${j(forged)}`);
  const smuggle = await getLinksMember(AIA.aiMemberActor(T, accBlind.userId, accBlind), { asker: { userId: owner.userId, role: "OWNER", unitAccess: ["*"], permissions: {} } });
  chk("A-args-smuggle", smuggle === false || String(smuggle).startsWith("ERR"), `blind STAFF passing an OWNER 'asker' in tool args: ${j(smuggle)}`);
  const direct = await AIO.runAccountTool(T, "account_get_contact", { contactId: acct.id, asker: { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: owner.userId } }, { systemId: A, viewer: accBlind });
  chk("A-runAccountTool-args", direct.mode === "error" || !j(direct).includes(targetCode) && !/"member":true/.test(j(direct)), `runAccountTool with asker inside args (no opts.asker): mode ${direct.mode} ${j(direct).slice(0, 120)}`);

  // ═══ R-F · followPartyMerge ═══
  console.log("\n── R-F · followPartyMerge edges ──");
  const M2 = await sysSvc.createSystem(T, "MEMBER", `สมาชิก 2 ${TAG}`).then((s: Any) => s.id as string).catch(async () => (await P.appSystem.create({ data: { tenantId: T, type: "MEMBER", name: `สมาชิก 2 ${TAG}` } })).id as string);
  const T2 = (await P.tenant.create({ data: { name: `${TAG}-t2`, slug: `${TAG}-t2` } })).id as string;
  TENANTS.push(T2);
  const M2t = (await sysSvc.createSystem(T2, "MEMBER", `สมาชิก t2 ${TAG}`)).id as string;
  const drop = await mkParty("drop");
  const keep = await mkParty("keep");
  const dActive = await mkCust({ party: drop });                       // system M, survivor has none in M → moves
  const dMerged = await mkCust({ party: drop, status: "MERGED" });     // system M, MERGED → R4: stays on the dropped Party (RV14-14 ruling)
  const d2 = await mkCust({ sys: M2, party: drop });                   // system M2, survivor's only M2 member is CLOSED → R4: moves
  const k2 = await mkCust({ sys: M2, party: keep, status: "CLOSED" }); // survivor's only M2 member is CLOSED
  let foreign: string | null = null;
  try { foreign = await mkCust({ tid: T2, sys: M2t, party: drop }); } catch (e) { info(`cross-tenant fixture refused by DB: ${(e as Error).message.slice(0, 80)}`); }
  const crmRef = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `อ้างอิง ${TAG}`, firstName: "อ้างอิง", memberCustomerId: dActive } });
  const inj = await prisma.$transaction(async (tx: Any) => MS.followPartyMerge(tx, T, `${drop}' OR '1'='1`, keep));
  chk("F-injection-shaped-id", inj === 0, `fromPartyId "${drop}' OR '1'='1" moved ${inj} rows`);
  const wrongTenant = await prisma.$transaction(async (tx: Any) => MS.followPartyMerge(tx, T2, drop, keep));
  chk("F-wrong-tenant-arg", wrongTenant === (foreign ? 1 : 0), `called with tenant T2: moved ${wrongTenant} (only T2's own row may move)`);
  if (foreign) await P.customer.update({ where: { id: foreign }, data: { partyId: drop } }); // undo T2 move for the real call below
  const n = await prisma.$transaction(async (tx: Any) => MS.followPartyMerge(tx, T, drop, keep));
  const rows = await P.customer.findMany({ where: { id: { in: [dActive, dMerged, d2, k2, ...(foreign ? [foreign] : [])] } }, select: { id: true, partyId: true, tenantId: true } });
  const pid = (id: string) => rows.find((r: Any) => r.id === id)?.partyId;
  // R4-UPDATE (reviewer, after the round-4 RV14-14 ruling, which I agree with): MERGED/CLOSED rows neither move nor block a move.
  chk("F-moves", n === 2 && pid(dActive) === keep && pid(dMerged) === drop, `moved ${n}: active→keep ${pid(dActive) === keep} · MERGED row stays on the dropped Party ${pid(dMerged) === drop}`);
  chk("F-per-system", pid(d2) === keep && pid(k2) === keep, `system M2: the survivor's only member is CLOSED ⇒ the dropped ACTIVE member moves ${pid(d2) === keep}`);
  chk("F-tenant-isolation", !foreign || pid(foreign) === drop, `other tenant's row with the same partyId untouched ${!foreign || pid(foreign) === drop}`);
  const crmAfter = await P.crmContact.findFirst({ where: { id: crmRef.id }, select: { memberCustomerId: true } });
  chk("F-crm-ref", crmAfter?.memberCustomerId === dActive, `CRM contact.memberCustomerId still → same member row`);
  info(`F · survivor card now: ${j(await MS.findCustomerByPartyId(T, M, keep, "system"))} (oldest row on the survivor Party after the move; the MERGED row moved along with it)`);
} catch (e) {
  chk("CRASH", false, String((e as Error)?.stack ?? e).slice(0, 1400));
} finally {
  for (const A of ACCS) await P.$executeRawUnsafe(`SELECT account_jno_drop($1)`, A).catch(() => undefined);
  const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
  for (const T of TENANTS) {
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
  }
  let left = 0;
  for (const T of TENANTS) for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
  chk("CLEAN-tenants", left === 0 && (await P.tenant.count({ where: { id: { in: TENANTS } } })) === 0, `rows left=${left} over ${TENANTS.length} tenants`);
  for (const id of USERS) {
    await P.session.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined);
    await P.user.delete({ where: { id } }).catch(() => undefined);
  }
  chk("CLEAN-users", (await P.user.count({ where: { email: { startsWith: TAG } } })) === 0, "users left 0");
  await prisma.$disconnect();
}
const passed = res.filter((r) => r.ok).length;
console.log(`\n${passed === res.length ? "🟢" : "🔴"} review probe cf19 r3: ${passed}/${res.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: res.length, passed, findings: res.filter((r) => !r.ok).map((r) => r.id) })}`);
process.exit(passed === res.length ? 0 : 1);
