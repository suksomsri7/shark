// H5.2 privacy hunt — probe 2: stale authority on a pending AI proposal (hr_draft_roster) + confirm by an unpermitted user.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { qc4Env, makeFixtures, cleanupFx, residueOf, tagOf, errText, canon, addDay, dbDate } from "../../scripts/qc-hr-lib.mjs";
import { installNetGuard, NET, sweepTenants, sweepResidue } from "../../scripts/qc-hr-h4.3-lib.mjs";

const SLUG_PREFIX = "qc-h52p-";
installNetGuard();
const { P, coreHash } = await qc4Env("h52p-stale-ai");
const sys = (await import("@/lib/modules/system/service")) as Any;
const tools = (await import("@/lib/ai/tools")) as Any;
const actorM = (await import("@/lib/ai/actor")) as Any;
const conv = (await import("@/lib/ai/conversation-owner")) as Any;
const props = (await import("@/lib/ai/proposals")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const REAL = { ...console };
const q = async (f: () => Promise<unknown>) => { Object.assign(console, { log() {}, info() {}, warn() {}, error() {} }); try { return await f(); } catch (e) { return { __throw: errText(e) }; } finally { Object.assign(console, REAL); } };
const out: Record<string, Any> = {};
try {
  const T = await fx.newTenant("", "QC H52P ai");
  const U1 = await fx.newUnit(T, `QC52 u1 ${tag}`, "u1"), U2 = await fx.newUnit(T, `QC52 u2 ${tag}`, "u2");
  const HRS = (await sys.createSystem(T, "HR", `HR ${tag}`)).id as string;
  for (const u of [U1, U2]) await sys.linkUnit(T, HRS, u);
  const W = {
    owner: await fx.mkUser(T, "owner", `QC52 owner ${tag}`, "OWNER", [], {}),
    mgr: await fx.mkUser(T, "mgr", `QC52 mgr ${tag}`, "STAFF", [U1], { "hr.employee.create": true }),
    ro: await fx.mkUser(T, "ro", `QC52 ro ${tag}`, "STAFF", [], { "hr.roster.read": true }),
  };
  const e1 = await fx.mkEmp(T, HRS, `QC52 e1 ${tag}`, { unitId: U1, startDate: "2025-01-01" });
  const sh = (await P.hrShift.create({ data: { tenantId: T, systemId: HRS, unitId: U1, name: `S ${tag}`, startMin: 480, endMin: 1020, breakMin: 60 } })).id;
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const day = addDay(today, 2);
  const mem = async (w: Any) => P.membership.findFirst({ where: { tenantId: T, userId: w.id }, select: { role: true, unitAccess: true, permissions: true } });
  const actorOf = async (w: Any) => actorM.aiMemberActor(T, w.id, await mem(w));
  const a = await actorOf(W.mgr);
  const cid = (await P.aiConversation.create({ data: { id: conv.newConversationId({ tenantId: T, actor: a }), tenantId: T, title: "h52p" } })).id;
  out.propose = String(await q(() => tools.runTool({ tenantId: T, actor: a, conversationId: cid }, "hr_draft_roster", { from: day, to: day, unitId: U1, entries: [{ employeeId: e1, date: day, shiftId: sh }] }))).slice(0, 400);
  const p = await P.aiProposal.findFirst({ where: { tenantId: T }, orderBy: { createdAt: "desc" } });
  out.proposal = p ? { kind: p.kind, status: p.status, summary: p.summary, payload: p.payload } : null;
  const nEntries = () => P.hrRosterEntry.count({ where: { tenantId: T, employeeId: e1, date: dbDate(day) } });
  if (p) {
    const memOld = await mem(W.mgr);
    // 1) unpermitted other user confirms → refused, stays pending
    out.byRosterReader = { r: canon(await q(async () => props.executeProposal(await mem(W.ro), { tenantId: T }, p.id, { userId: W.ro.id }))).slice(0, 300), status: (await P.aiProposal.findFirst({ where: { id: p.id } }))?.status, entries: await nEntries() };
    // 2) proposer moved to branch U2 → confirm (fresh membership) refused
    await P.membership.updateMany({ where: { tenantId: T, userId: W.mgr.id }, data: { unitAccess: [U2] } });
    out.afterNarrowFresh = { r: canon(await q(async () => props.executeProposal(await mem(W.mgr), { tenantId: T }, p.id, { userId: W.mgr.id }))).slice(0, 300), status: (await P.aiProposal.findFirst({ where: { id: p.id } }))?.status, entries: await nEntries() };
    // 3) same, but the caller passes the OLD membership object (stale session cache)
    out.afterNarrowStaleMem = { r: canon(await q(() => props.executeProposal(memOld, { tenantId: T }, p.id, { userId: W.mgr.id }))).slice(0, 300), status: (await P.aiProposal.findFirst({ where: { id: p.id } }))?.status, entries: await nEntries() };
    // 4) membership removed entirely
    await P.membership.deleteMany({ where: { tenantId: T, userId: W.mgr.id } });
    out.afterRemoved = { r: canon(await q(() => props.executeProposal(memOld, { tenantId: T }, p.id, { userId: W.mgr.id }))).slice(0, 300), status: (await P.aiProposal.findFirst({ where: { id: p.id } }))?.status, entries: await nEntries() };
    // 5) owner confirms → executes (positive control)
    out.ownerConfirm = { r: canon(await q(async () => props.executeProposal(await mem(W.owner), { tenantId: T }, p.id, { userId: W.owner.id }))).slice(0, 300), status: (await P.aiProposal.findFirst({ where: { id: p.id } }))?.status, entries: await nEntries() };
  }
  out.audit = (await P.auditLog.findMany({ where: { tenantId: T }, select: { action: true, after: true } })).map((r: Any) => `${r.action} ${JSON.stringify(r.after).slice(0, 200)}`);
} catch (e) {
  console.log(`🔴 ${errText(e)}`);
} finally {
  console.log(JSON.stringify(out, null, 1));
  await sweepTenants(P, fx.tenants).catch(() => undefined);
  await cleanupFx(P, fx, SLUG);
  const r1 = await sweepResidue(P, fx.tenants);
  await residueOf(P, fx, SLUG, SLUG_PREFIX);
  console.log(`RESIDUE sweep=${r1.join(",") || "none"} tenants(${SLUG_PREFIX}*)=${await P.tenant.count({ where: { slug: { startsWith: SLUG_PREFIX } } })} OUTBOUND=${NET.attempts.length}`);
}
