// review probe — CRM C5.5-G2 (independent reviewer): AI conversations belong to their creator.
//   ✅ = property holds · ❌ = finding · ℹ️ = evidence (not counted)
//   X1  LIKE wildcards / prefix confusion in the id prefix filter (user ids are opaque strings to the rule)
//   X2  nobody can make a conversation with a chosen id (sendMessage / mobile send / mobile create / member assistant / REST)
//   X3  same userId in two shops · role change (OWNER demoted) · member re-added
//   X4  key proposals: MANAGER cannot see/confirm, OWNER can; a non-viewer confirming a plan does not burn it (G1 R5)
//   X5  "invisible id" answers byte-identical to a missing id (mobile messages · proposals · REST 404 · confirm note)
//   X6  stale screen: N sends with someone else's id → N new rooms (evidence)
//   X7  remaining cross-user channels for tool-derived data: shop memory (F1.1) and kb_auto_save → kb_search
// Model: scripted (no network) · QC3 only · throwaway tenants swept in finally.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf14/review/probe-cf14-g2-review.mts
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
process.env.SHARK_AI_MOCK = "1";
delete process.env.SHARK_AI_KEY;
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-cf14r-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);
const j = (v: unknown) => JSON.stringify(v);
const cut = (v: unknown, n = 170) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const has = (s: unknown, x: string) => (typeof s === "string" ? s : j(s)).includes(x);
const USERS: string[] = [];
const TENANTS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const svc = (await import("@/lib/ai/service" as string)) as Any;
const tools = (await import("@/lib/ai/tools" as string)) as Any;
const ACT = (await import("@/lib/ai/actor" as string)) as Any;
const CO = (await import("@/lib/ai/conversation-owner" as string)) as Any;
const MCONV = (await import("@/lib/mobile/conversations" as string)) as Any;
const props = (await import("@/lib/ai/proposals" as string)) as Any;
const plans = (await import("@/lib/ai/plans" as string)) as Any;
const mobAuth = (await import("@/lib/mobile/auth" as string)) as Any;
const R = {
  conv: (await import("../../../../src/app/api/mobile/conversations/route.ts" as string)) as Any,
  msgs: (await import("../../../../src/app/api/mobile/conversations/[id]/messages/route.ts" as string)) as Any,
  send: (await import("../../../../src/app/api/mobile/chat/send/route.ts" as string)) as Any,
  props: (await import("../../../../src/app/api/mobile/proposals/route.ts" as string)) as Any,
  tools: (await import("../../../../src/app/api/v1/ai/tools/[name]/route.ts" as string)) as Any,
};
const mkUser = async (suffix: string) => {
  const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
  USERS.push(u.id);
  return u.id as string;
};
class Scripted {
  private i = 0;
  constructor(private steps: Any[]) {}
  async chat(messages: Any[]) {
    const step = this.steps[Math.min(this.i, this.steps.length - 1)];
    this.i += 1;
    if (step.text === "$SYSTEM") return { text: `system: ${messages.find((m: Any) => m.role === "system")?.content ?? ""}`, tokensIn: 1, tokensOut: 1, model: "scripted" };
    if (step.text === "$LAST_TOOL") return { text: `ผล: ${[...messages].reverse().find((m: Any) => m.role === "tool")?.content ?? ""}`, tokensIn: 1, tokensOut: 1, model: "scripted" };
    return { text: step.text ?? "", toolCalls: step.toolCalls, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}
const PHONE = "0899000102";

try {
  const tA = (await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } })).id as string;
  const tB = (await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } })).id as string;
  TENANTS.push(tA, tB);
  const owner = await mkUser("-owner");
  const mgr = await mkUser("-mgr");
  const staff = await mkUser("-staff");
  const perm = { "ai.chat.send": true, "pos.sale.create": true, "kb.article.create": true };
  await P.membership.create({ data: { userId: owner, tenantId: tA, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: mgr, tenantId: tA, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: staff, tenantId: tA, role: "STAFF", unitAccess: ["*"], permissions: perm, acceptedAt: new Date() } });
  // the same STAFF user is OWNER of shop B
  await P.membership.create({ data: { userId: staff, tenantId: tB, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const act = (uid: string, t = tA, role?: string) => ACT.aiMemberActor(t, uid, { role: role ?? (uid === owner ? "OWNER" : uid === mgr ? "MANAGER" : "STAFF"), unitAccess: ["*"], permissions: uid === staff && t === tA ? perm : {} });
  const M = (await sysSvc.createSystem(tA, "MEMBER", "สมาชิกทดสอบ")).id as string;
  await sysSvc.createSystem(tA, "POS", "ขายทดสอบ");
  await P.customer.create({ data: { tenantId: tA, memberSystemId: M, name: "สมาชิกคนที่สอง", phone: PHONE, memberCode: "QRC002" } });
  await P.aiCreditWallet.create({ data: { tenantId: tA, balanceMicro: 50_000_000, grantedAt: new Date() } });
  const sO = await svc.sendMessage({ tenantId: tA, actor: act(owner) }, { text: "ขอเบอร์สมาชิก" }, { provider: new Scripted([{ toolCalls: [{ id: "o1", name: "customer_search", args: { query: "สมาชิก" } }] }, { text: "$LAST_TOOL" }]) });
  const ownerConv = sO.conversationId as string;
  info("FIX", `OWNER conversation id = ${ownerConv.replace(owner, "<owner>")} · reply has phone=${has(sO.reply, PHONE)}`);

  // ═══ X1 — LIKE wildcards / prefix confusion ═══
  console.log("\n── X1 id prefix filter ──");
  const mk = (id: string) => P.aiConversation.create({ data: { id, tenantId: tA, title: `t-${id.slice(0, 12)}` } });
  await mk(`u~aXc~${randomBytes(4).toString("hex")}`); // victim "aXc"
  await mk(`u~abcd~${randomBytes(4).toString("hex")}`); // victim "abcd"
  await mk(`u~a%z~${randomBytes(4).toString("hex")}`);
  const raw = (await P.aiConversation.findMany({ where: { tenantId: tA, id: { startsWith: "u~a_c~" } }, select: { id: true } })) as Any[];
  info("X1.0", `Prisma startsWith("u~a_c~") raw matches: ${raw.length} (${raw.length ? "NOT escaped — wildcard live, JS re-check required" : "escaped"})`);
  const leaks: string[] = [];
  for (const uid of ["a_c", "abc", "a%", "%", "_", "a"]) {
    const v = ACT.aiMemberActor(tA, uid, { role: "STAFF", unitAccess: ["*"], permissions: { "ai.chat.send": true } });
    const list = (await MCONV.listConversations({ tenantId: tA, actor: v })) as Any[];
    const latest = await svc.latestConversation({ tenantId: tA, actor: v });
    const bad = [...list.map((r) => r.id), latest?.id].filter((id) => id && !String(id).startsWith(`u~${uid}~`));
    if (bad.length) leaks.push(`${uid}: ${j(bad)}`);
  }
  chk("X1.1", leaks.length === 0, `viewers with userIds a_c / abc / a% / % / _ / a see only their own exact prefix (list + latest) · leaks=${j(leaks)}`);
  let threw = false;
  try { CO.newConversationId({ tenantId: tA, actor: ACT.aiMemberActor(tA, "x~y", { role: "OWNER", unitAccess: ["*"], permissions: {} }) }); } catch { threw = true; }
  chk("X1.2", threw && CO.canSeeConversationId(CO.sightOf({ tenantId: tA, actor: ACT.aiMemberActor(tA, "x~y", { role: "OWNER", unitAccess: ["*"], permissions: {} }) }), "u~x~y~1") === false,
    `a userId containing "~" gets no prefix (cannot address "u~x~…") and cannot create a room`);

  // ═══ X2 — chosen ids ═══
  console.log("\n── X2 nobody chooses the id ──");
  const victimShaped = `u~${owner}~${"0".repeat(24)}`;
  const sA = await svc.sendMessage({ tenantId: tA, actor: act(staff) }, { conversationId: victimShaped, text: "ห้องของเจ้าของ?" }, { provider: new Scripted([{ text: "ok" }]) });
  const sB = await svc.sendMessage({ tenantId: tA, actor: act(staff) }, { conversationId: ownerConv, text: "ต่อห้องเจ้าของ" }, { provider: new Scripted([{ text: "ok" }]) });
  const exists = await P.aiConversation.count({ where: { id: victimShaped } });
  chk("X2.1", sA.conversationId.startsWith(`u~${staff}~`) && sB.conversationId.startsWith(`u~${staff}~`) && exists === 0,
    `STAFF sendMessage with an owner-shaped id that does not exist / with the OWNER's id → new STAFF rooms, owner-shaped row created=${exists}`);
  const tok = (await mobAuth.issueMobileToken(staff)).token as string;
  const mh = (body?: unknown, t = tA) => ({ method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${tok}`, "x-tenant-id": t, "content-type": "application/json" }, ...(body === undefined ? {} : { body: j(body) }) });
  const cr = (await (await R.conv.POST(new Request("http://qc.invalid/api/mobile/conversations", mh({ id: victimShaped, title: "x" })))).json()) as Any;
  chk("X2.2", String(cr.id).startsWith(`u~${staff}~`) && cr.id !== victimShaped, `mobile POST conversations with a body id → ignored, server-minted ${String(cr.id).slice(0, 4)}…`);
  const keySvc = (await import("@/lib/api-keys/service" as string)) as Any;
  const kGen = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-gen`, {});
  const kGen2 = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-gen2`, {});
  const post = async (raw: string, name: string, args: Any, conversationId?: string) => {
    const r = await R.tools.POST(new Request(`http://qc.invalid/api/v1/ai/tools/${name}`, { method: "POST", headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" }, body: j({ args, ...(conversationId ? { conversationId } : {}) }) }), { params: Promise.resolve({ name }) });
    return { status: r.status as number, body: (await r.json().catch(() => ({}))) as Any };
  };
  const sale = { lines: [{ name: "กาแฟ", qty: 1, unitPriceSatang: 5000 }], payType: "CASH" };
  const k1 = await post(kGen.rawKey, "pos_create_sale", sale);
  const keyConv = String(k1.body.conversationId ?? "");
  const k2 = await post(kGen2.rawKey, "pos_create_sale", sale, keyConv);
  const k3 = await post(kGen.rawKey, "pos_create_sale", sale, `k~${kGen.id ?? "x"}~${"0".repeat(24)}`);
  const k4 = await post(kGen.rawKey, "pos_create_sale", sale, "no-such-conversation");
  chk("X2.3", k1.status === 200 && keyConv.startsWith("k~") && k2.status === 404 && k3.status === 404 && k4.status === 404 && j(k2.body) === j(k4.body),
    `REST: own room k~… · other key's room 404 · key-shaped non-existent id 404 · missing id 404 · bodies identical=${j(k2.body) === j(k4.body)}`);

  // ═══ X3 — two shops · role change ═══
  console.log("\n── X3 tenancy and role changes ──");
  const bConv = (await svc.sendMessage({ tenantId: tB, actor: act(staff, tB, "OWNER") }, { text: "ร้านบี" }, { provider: new Scripted([{ text: "ร้านบีตอบ" }]) })).conversationId as string;
  const staffAinA = (await MCONV.listConversations({ tenantId: tA, actor: act(staff) })) as Any[];
  const msgsBfromA = (await svc.listMessages({ tenantId: tA, actor: act(staff) }, bConv)) as Any[];
  chk("X3.1", !staffAinA.some((r) => r.id === bConv) && msgsBfromA.length === 0, `same user in shop B (OWNER) and shop A (STAFF): shop-B room not listed/readable from shop A (tenant scope beats the shared prefix)`);
  const demoted = ACT.aiMemberActor(tA, owner, { role: "STAFF", unitAccess: ["*"], permissions: { "ai.chat.send": true } });
  const dList = ((await MCONV.listConversations({ tenantId: tA, actor: demoted })) as Any[]).map((r) => r.id);
  info("X3.2", `OWNER demoted to STAFF: still sees own room=${dList.includes(ownerConv)} · key room=${dList.includes(keyConv)} (OWNER-only extras dropped)`);

  // ═══ X4 — key proposals & plan burning ═══
  console.log("\n── X4 key proposals · plans ──");
  const keyProp = await P.aiProposal.findFirst({ where: { tenantId: tA, conversationId: keyConv, status: "PENDING" } });
  const mgrList = (await props.listPendingProposals({ tenantId: tA, actor: act(mgr) }, keyConv)) as Any[];
  const mgrEx = await props.executeProposal({ role: "MANAGER", unitAccess: ["*"], permissions: {} }, { tenantId: tA }, keyProp.id, { userId: mgr });
  const stEx = await props.executeProposal({ role: "STAFF", unitAccess: ["*"], permissions: perm }, { tenantId: tA }, keyProp.id, { userId: staff });
  const ownList = (await props.listPendingProposals({ tenantId: tA, actor: act(owner) }, keyConv)) as Any[];
  const after = (await P.aiProposal.findUnique({ where: { id: keyProp.id } }))?.status;
  chk("X4.1", mgrList.length === 0 && mgrEx.ok === false && stEx.ok === false && ownList.some((p) => p.id === keyProp.id) && after === "PENDING",
    `key proposal: MANAGER lists 0 / confirm refused (${cut(mgrEx.note, 40)}) · STAFF holding pos.sale.create refused · OWNER lists it · row ${after}`);
  // a plan in the OWNER's room confirmed by a non-viewer must stay PENDING (before: claimed RUNNING → FAILED)
  const plan = await P.aiPlan.create({ data: { tenantId: tA, conversationId: ownerConv, title: "แผนทดสอบ", stepsJson: [{ kind: "pos_create_sale", summary: "ขาย", payload: sale, status: "PENDING" }], expiresAt: new Date(Date.now() + 86_400_000) } });
  const pex = await plans.executePlan({ role: "STAFF", unitAccess: ["*"], permissions: perm }, { tenantId: tA }, plan.id, { userId: staff });
  const pst = (await P.aiPlan.findUnique({ where: { id: plan.id } }))?.status;
  chk("X4.2", pex.ok === false && pex.doneCount === 0 && pst === "PENDING", `STAFF (holds the step key) confirms the OWNER's plan → refused, plan stays ${pst} (not burned)`);
  const noUser = await props.executeProposal({ role: "STAFF", unitAccess: ["*"], permissions: perm }, { tenantId: tA }, keyProp.id, {});
  info("X4.3", `executeProposal without userId (non-OWNER) → ${noUser.ok ? "RAN" : "refused"} (${cut(noUser.note, 40)})`);

  // ═══ X5 — invisible = missing (byte-identical) ═══
  console.log("\n── X5 invisible answers like missing ──");
  const missing = `u~${staff}~${"f".repeat(24)}`;
  const mm = async (id: string) => (await R.msgs.GET(new Request(`http://qc.invalid/api/mobile/conversations/${id}/messages`, mh()), { params: Promise.resolve({ id }) })).text();
  const mp = async (id: string) => (await R.props.GET(new Request(`http://qc.invalid/api/mobile/proposals?conversationId=${encodeURIComponent(id)}`, mh()))).text();
  const [a1, a2, b1, b2] = [await mm(ownerConv), await mm(missing), await mp(ownerConv), await mp(missing)];
  const ex1 = await props.executeProposal({ role: "STAFF", unitAccess: ["*"], permissions: perm }, { tenantId: tA }, keyProp.id, { userId: staff });
  const ex2 = await props.executeProposal({ role: "STAFF", unitAccess: ["*"], permissions: perm }, { tenantId: tA }, "no-such-proposal", { userId: staff });
  chk("X5.1", a1 === a2 && b1 === b2 && ex1.note === ex2.note, `mobile messages / proposals / confirm note for someone else's room == for a missing id (${a1.length}B, ${b1.length}B, "${cut(ex1.note, 30)}")`);

  // ═══ X6 — stale screen spam ═══
  console.log("\n── X6 stale screen ──");
  const before = await P.aiConversation.count({ where: { tenantId: tA, id: { startsWith: `u~${staff}~` } } });
  for (let i = 0; i < 3; i += 1) await svc.sendMessage({ tenantId: tA, actor: act(staff) }, { conversationId: ownerConv, text: `ซ้ำ ${i}` }, { provider: new Scripted([{ text: "ok" }]) });
  const afterN = await P.aiConversation.count({ where: { tenantId: tA, id: { startsWith: `u~${staff}~` } } });
  info("X6.1", `3 sends with the OWNER's conversation id (stale app screen) → STAFF rooms ${before}→${afterN} (one new room per send; no data reaches the OWNER's room)`);
  chk("X6.2", (await P.aiMessage.count({ where: { conversationId: ownerConv, content: { startsWith: "ซ้ำ" } } })) === 0, `none of those sends was written into the OWNER's room`);

  // ═══ X7 — remaining channels ═══
  console.log("\n── X7 shop memory / KB ──");
  await svc.sendMessage({ tenantId: tA, actor: act(owner) }, { conversationId: ownerConv, text: "จำไว้" }, { provider: new Scripted([{ toolCalls: [{ id: "r1", name: "remember_fact", args: { content: `ลูกค้าประจำ โทร ${PHONE}` } }] }, { text: "จำแล้ว" }]) });
  const sSys = await svc.sendMessage({ tenantId: tA, actor: act(staff) }, { text: "สวัสดี" }, { provider: new Scripted([{ text: "$SYSTEM" }]) });
  const lm = await tools.runTool({ tenantId: tA, actor: act(staff) }, "list_memories", {});
  chk("X7.1", !has(sSys.reply, PHONE) && !has(lm, PHONE), `F1.1: the OWNER's tool-derived phone stored by remember_fact reaches the STAFF (system prompt=${has(sSys.reply, PHONE)} · list_memories=${has(lm, PHONE)})`);
  await svc.sendMessage({ tenantId: tA, actor: act(owner) }, { conversationId: ownerConv, text: "เก็บความรู้" }, { provider: new Scripted([{ toolCalls: [{ id: "k1", name: "kb_auto_save", args: { title: "ลูกค้า VIP", content: `ติดต่อ ${PHONE}` } }] }, { text: "เก็บแล้ว" }]) });
  const ks = await tools.runTool({ tenantId: tA, actor: act(staff) }, "kb_search", { query: "ลูกค้า VIP" });
  info("X7.2", `kb_auto_save by the OWNER's model (phone in the article) → STAFF kb_search sees it=${has(ks, PHONE)} (KB is shop-readable by design; same class as memory)`);
} catch (e) {
  chk("FATAL", false, `probe crashed: ${cut((e as Error)?.stack ?? e, 600)}`);
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
  const pass = res.filter((x) => x.ok).length;
  console.log(`\nJSON_SUMMARY ${j({ pass, total: res.length, red: res.filter((x) => !x.ok).map((x) => x.id) })}`);
  await prisma.$disconnect();
  process.exit(res.every((x) => x.ok) ? 0 : 1);
}
