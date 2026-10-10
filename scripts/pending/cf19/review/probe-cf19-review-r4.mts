// REVIEW probe — CRM C5.5-fix14 ROUND 4 (builder tip 7d139755) · independent reviewer.
//   W1  `memberIdsVisibleTo` == member module (`visibleCustomerIds`) for every persona incl. the whole-shop shortcut (OWNER with limited
//       unitAccess, MANAGER limited / "*", STAFF []), with the SQL statements it costs (0 for blind / whole-shop, 1 for branch-limited).
//   W2  CSV export for a branch-limited viewer across > 1,000 linked members: "ผูกแล้ว" exactly on the visible ones; member-statement count.
//   W3  listed carriers (a)–(d): convert result · merge DIFF_MEMBER text · automation dry-run on "เป็นสมาชิก" · consent provenance.
// QC2 ONLY (ep-cool-shadow) · own throwaway tenant `qc-cf19r4-*` swept to 0 rows in finally · network blocked.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf19/review/probe-cf19-review-r4.mts
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
const TAG = `qc-cf19r4-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const info = (msg: string) => console.log(`  ℹ️  ${msg}`);
const j = (v: unknown) => JSON.stringify(v);
const USERS: string[] = [];
const TENANTS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const MS = (await import("@/lib/modules/member/service" as string)) as Any;
const CRM = (await import("@/lib/modules/crm" as string)) as Any;
const memberStmts = () => sqlLog.filter((q) => /"Customer"/.test(q) && !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(q)).length;

try {
  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  TENANTS.push(T);
  const UA = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `A ${TAG}`, slug: `${TAG}-a` } })).id as string;
  const UB = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `B ${TAG}`, slug: `${TAG}-b` } })).id as string;
  const M = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${TAG}`)).id as string;
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  await P.appSystem.update({ where: { id: S }, data: { settings: { crm: { uiVersion: 2 } } } });
  const mkUser = async (name: string, role: string, unitAccess: string[], permissions: Record<string, unknown>) => {
    const uid = (await P.user.create({ data: { email: `${TAG}-${name}@qc.invalid`, name: `QC ${name} ${TAG}` } })).id as string;
    USERS.push(uid);
    await P.membership.create({ data: { userId: uid, tenantId: T, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { userId: uid, role, unitAccess, permissions };
  };
  let seq = 0;
  const mkCust = async (home: string | null, status = "ACTIVE") => {
    seq += 1;
    return (await P.customer.create({ data: { tenantId: T, memberSystemId: M, name: `m${seq} ${TAG}`, memberCode: `M-R4${String(seq).padStart(4, "0")}`, homeUnitId: home, status, phone: `0855${String(seq).padStart(6, "0")}` } })).id as string;
  };

  // ═══ W1 ═══
  console.log("\n── W1 · memberIdsVisibleTo vs visibleCustomerIds + statement cost ──");
  const fx = { homeA: await mkCust(UA), homeB: await mkCust(UB), none: await mkCust(null), posB: await mkCust(null) };
  await P.memberActivity.create({ data: { tenantId: T, customerId: fx.posB, unitId: UB, module: "pos", type: "VISIT", summary: "qc-cf19r4" } });
  const ids = Object.values(fx);
  const a = (role: string, unitAccess: string[], permissions: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ userId: "", role, unitAccess, permissions, ...extra });
  const R = { "member.customer.read": true };
  const personas: [string, Any, number][] = [
    ["OWNER [UB] (whole shop)", a("OWNER", [UB], {}), 0],
    ["MANAGER * (whole shop)", a("MANAGER", ["*"], {}), 0],
    ["MANAGER [UB] (branch-limited)", a("MANAGER", [UB], {}), 1],
    ["STAFF [] read (whole shop)", a("STAFF", [], R), 0],
    ["STAFF [UB] read (branch-limited)", a("STAFF", [UB], R), 1],
    ["STAFF * no member key (blind)", a("STAFF", ["*"], { "crm.contact.read": true }), 0],
    ["CUSTOMER self", a("CUSTOMER", [], {}, { customerId: fx.none }), 1],
  ];
  for (const [name, v, wantStmts] of personas) {
    sqlLog = []; counting = true;
    const got = (await MS.memberIdsVisibleTo(T, v, ids)) as Set<string>;
    counting = false;
    const n = memberStmts();
    const ref = (await MS.visibleCustomerIds(T, M, v, ids)) as Set<string>;
    const same = j([...got].sort()) === j([...ref].sort());
    chk(`W1-${name}`, same && n === wantStmts, `${name}: visible ${got.size}/4 == visibleCustomerIds ${same} · member statements ${n} (want ${wantStmts})`);
  }
  info(`W1 · null/undefined viewer: ${(await MS.memberIdsVisibleTo(T, null, ids)).size}/${(await MS.memberIdsVisibleTo(T, undefined, ids)).size} · "system": ${(await MS.memberIdsVisibleTo(T, "system", ids)).size}`);

  // ═══ W2 · CSV across > 1,000 linked members, branch-limited exporter ═══
  console.log("\n── W2 · CSV export, branch-limited viewer, 1,005 linked contacts ──");
  const exp = await mkUser("exp", "STAFF", [UA], { "crm.contact.read": true, "crm.contact.export": true, ...R });
  const N = 1005;
  const custRows = Array.from({ length: N }, (_, i) => ({ id: `${TAG}-c${i}`.replace(/-/g, "x"), tenantId: T, memberSystemId: M, name: `bulk${i} ${TAG}`, memberCode: `M-B${String(i).padStart(5, "0")}`, homeUnitId: i % 2 === 0 ? UA : UB, status: "ACTIVE", phone: `0844${String(i).padStart(6, "0")}` }));
  await P.customer.createMany({ data: custRows });
  await P.crmContact.createMany({ data: custRows.map((c, i) => ({ id: `${TAG}-k${i}`.replace(/-/g, "y"), tenantId: T, systemId: S, name: `ลูกค้า${i} ${TAG}`, firstName: `ลูกค้า${i}`, ownerUserId: exp.userId, memberCustomerId: c.id })) });
  const visibleWanted = custRows.filter((c) => c.homeUnitId === UA).length;
  sqlLog = []; counting = true;
  const csv = (await CRM.contacts.exportContacts({ tenantId: T, systemId: S, actorUserId: exp.userId }, exp, { confirm: true, reason: "qc review" })) as string;
  counting = false;
  const lines = csv.split("\n").filter((l) => l.includes(TAG) && l.includes("ลูกค้า"));
  const linkedCells = lines.filter((l) => l.includes("ผูกแล้ว")).length;
  chk("W2-csv", lines.length === N && linkedCells === visibleWanted, `rows ${lines.length}/${N} · "ผูกแล้ว" ${linkedCells} (visible to this viewer: ${visibleWanted}) · member statements ${memberStmts()} (2 batches expected)`);

  // ═══ W3 · listed carriers ═══
  console.log("\n── W3 · listed carriers for a member-blind CRM user ──");
  const blind = await mkUser("blind", "STAFF", ["*"], {
    "crm.contact.read": true, "crm.contact.create": true, "crm.contact.update": true, "crm.contact.convert": true, "crm.contact.merge": true, "crm.automation.manage": true,
  });
  const cS = { tenantId: T, systemId: S, actorUserId: blind.userId };
  const mkC = async (name: string, phone: string, memberId: string | null) => {
    const r = await CRM.contacts.createContact(cS, blind, { firstName: `${name} ${TAG}`, phone });
    const id = (r?.contact?.id ?? r?.id) as string;
    if (memberId) await P.crmContact.update({ where: { id }, data: { memberCustomerId: memberId } });
    return id;
  };
  const cLinked = await mkC("ผูกหนึ่ง", "0833000001", fx.homeA);
  const cLinked2 = await mkC("ผูกสอง", "0833000002", fx.homeB);
  const cPlain = await mkC("ไม่ผูก", "0833000003", null);
  // (a) convert with a member target
  const conv = async (id: string) => { try { return await CRM.contacts.convertContact(cS, blind, id, { member: { systemId: M }, idempotencyKey: `${TAG}-${id}` }); } catch (e) { return { error: (e as Error).message.slice(0, 90) }; } };
  const ca = await conv(cLinked);
  const cb = await conv(cPlain);
  info(`(a) convert linked → ${j(ca)} · convert unlinked → ${j(cb)}`);
  res.push({ id: "W3a-convert(INFO)", ok: true });
  // (b) merge two contacts linked to different members
  let mb: unknown;
  try { mb = await CRM.contacts.mergeContacts(cS, blind, { keepId: cLinked, mergeId: cLinked2, confirm: true, reason: "qc review merge" }); } catch (e) { mb = { error: (e as Error).message.slice(0, 120) }; }
  info(`(b) merge [member A] ← [member B] → ${j(mb)}`);
  res.push({ id: "W3b-merge(INFO)", ok: true });
  // (d) automation dry-run on "เป็นสมาชิก"
  let dr: Any;
  try {
    dr = await CRM.automation.dryRun(cS, blind, { name: "probe", trigger: { event: "crm.contact.created" }, conditions: { mode: "AND", items: [{ field: "c.memberCustomerId", op: "exists" }] }, actions: [{ type: "NOTIFY_STAFF", params: { to: "owner", text: "x" } }] });
  } catch (e) { dr = { error: (e as Error).message.slice(0, 120) }; }
  const matchedIds = (dr?.matched ?? []).map((m: Any) => m.contactId);
  const oracle = matchedIds.includes(cLinked2) || matchedIds.includes(cLinked);
  info(`(d) dry-run "c.memberCustomerId exists" as member-blind STAFF: total ${dr?.total} · matched linked ${oracle} · matched unlinked ${matchedIds.includes(cPlain)} · ${dr?.error ?? ""}`);
  res.push({ id: "W3d-dryrun(INFO)", ok: true });
  // RV14-13 · consent provenance for the blind viewer (ruled rule)
  const ch = (await import("@/lib/core/channels" as string)).consentChannels()[0].key as string;
  await P.memberConsent.create({ data: { tenantId: T, customerId: fx.homeB, channel: ch, granted: true, source: "SIGNUP_FORM", grantedAt: new Date("2026-04-04T04:04:04Z") } });
  const branchA = await mkUser("brA", "STAFF", [UA], { "crm.contact.read": true, ...R });
  const owner = await mkUser("owner", "OWNER", ["*"], {});
  await P.crmContact.update({ where: { id: cLinked2 }, data: { ownerUserId: branchA.userId } }).catch(() => undefined);
  const cons = async (v: Any) => { try { const c = await CRM.consents.current({ ...cS, actorUserId: v.userId }, v, cLinked2); return { memberLinked: c.memberLinked, ch0: c.channels.find((x: Any) => x.channel === ch) }; } catch (e) { return { error: (e as Error).message.slice(0, 80) }; } };
  const cBr = await cons(branchA) as Any;
  const cOw = await cons(owner) as Any;
  chk("W3-consent-branch", cBr.ch0?.source === null && cBr.ch0?.at === null && cBr.ch0?.granted === true, `branch-A STAFF (member home B): ${j(cBr)}`);
  chk("W3-consent-owner", cOw.ch0?.source === "SIGNUP_FORM" && !!cOw.ch0?.at, `OWNER unchanged: ${j(cOw)}`);
} catch (e) {
  chk("CRASH", false, String((e as Error)?.stack ?? e).slice(0, 1400));
} finally {
  const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
  for (const T of TENANTS) {
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
  }
  let left = 0;
  for (const T of TENANTS) for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
  chk("CLEAN-tenant", left === 0 && (await P.tenant.count({ where: { id: { in: TENANTS } } })) === 0, `rows left=${left}`);
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
console.log(`\n${passed === res.length ? "🟢" : "🔴"} review probe cf19 r4: ${passed}/${res.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: res.length, passed, findings: res.filter((r) => !r.ok).map((r) => r.id) })}`);
process.exit(passed === res.length ? 0 : 1);
