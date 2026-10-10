// review probe — CRM C5.5-G1 (independent reviewer). Each check asserts the SECURE / intended property:
//   ✅ = property holds · ❌ = finding reproduced (ids map to ledger/wo-notes/crm-C5.5-G1-review.md) · ℹ️ = evidence, not counted.
//   R*  cross-user conversation history (R1 of the builder note) — does G1 hold in practice?
//   K*  kanban PRIVATE boards through the AI tools (builder: "not verified")
//   S*  scheduled-task system actor — what changes for existing scheduled summaries
//   E*  persona sweep over the whole registry (OWNER/MANAGER regressions · propose-key vs confirm-key divergence)
//   A*  API keys through the real routes (tools/[name] + skills/[id] manifest)
//   U*  branch-limited MANAGER (counts / existence)
//   D*  defence-in-depth (direct execute without actor · system actor literal with OWNER rights)
// Model: scripted provider only (no network · fetch blocked · SHARK_AI_MOCK=1). QC3 only · throwaway tenant swept in finally.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf9/review/probe-cf9-g1-review.mts
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
const TAG = `qc-cf9r-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);
const j = (v: unknown) => JSON.stringify(v);
const cut = (v: unknown, n = 170) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const USERS: string[] = [];
const TENANTS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const tools = (await import("@/lib/ai/tools" as string)) as Any;
const svc = (await import("@/lib/ai/service" as string)) as Any;
const TA = (await import("@/lib/ai/tool-access" as string)) as Any;
const ACT = (await import("@/lib/ai/actor" as string)) as Any;
const rbac = (await import("@/lib/core/rbac" as string)) as Any;
const props = (await import("@/lib/ai/proposals" as string)) as Any;
const mkUser = async (suffix: string) => {
  const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
  USERS.push(u.id);
  return u.id as string;
};
const member = (uid: string, tid: string, role: string, unitAccess: string[], permissions: Record<string, boolean>) =>
  P.membership.create({ data: { userId: uid, tenantId: tid, role, unitAccess, permissions, acceptedAt: new Date() } });
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf9r", "x-forwarded-for": "203.0.113.191" } });
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
class Scripted {
  private i = 0;
  constructor(private steps: Any[]) {}
  async chat(messages: Any[]) {
    const step = this.steps[Math.min(this.i, this.steps.length - 1)];
    this.i += 1;
    if (step.text === "$LAST_TOOL") {
      const last = [...messages].reverse().find((m: Any) => m.role === "tool");
      return { text: `ผลเครื่องมือ: ${last?.content ?? "(ไม่มี)"}`, tokensIn: 10, tokensOut: 10, model: "scripted" };
    }
    if (step.text === "$HISTORY") {
      // a model that simply quotes the earlier turns it was given (what "summarise what we discussed" does)
      const hist = messages.filter((m: Any) => m.role === "assistant").map((m: Any) => String(m.content)).join(" | ");
      return { text: `สรุปที่คุยไว้: ${hist}`, tokensIn: 10, tokensOut: 10, model: "scripted" };
    }
    return { text: step.text ?? "", toolCalls: step.toolCalls, tokensIn: 10, tokensOut: 10, model: "scripted" };
  }
}
const isRefusal = (out: string) => {
  try {
    const o = JSON.parse(out) as Any;
    return typeof o?.error === "string" && /ไม่มีสิทธิ์|ใช้เครื่องมือนี้ไม่ได้|ไม่ทราบว่าใคร/.test(o.error);
  } catch {
    return false;
  }
};
const has = (s: unknown, x: string) => String(s ?? "").includes(x);

try {
  // ═══ world ═══
  const t = await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } });
  const tA = t.id as string;
  TENANTS.push(tA);
  const u1 = (await P.businessUnit.create({ data: { tenantId: tA, type: "SHOP", name: "สาขาหนึ่ง", slug: `${TAG}-u1` } })).id as string;
  const u2 = (await P.businessUnit.create({ data: { tenantId: tA, type: "SHOP", name: "สาขาสอง", slug: `${TAG}-u2` } })).id as string;
  const owner = await mkUser("-owner");
  const mgr = await mkUser("-mgr");
  const staffAi = await mkUser("-ai");
  const staffKb = await mkUser("-kbn");
  const AI = { "ai.chat.send": true };
  const perms: Record<string, Record<string, boolean>> = {
    [owner]: {}, [mgr]: {}, [staffAi]: AI, [staffKb]: { ...AI, "kanban.board.read": true, "kanban.report.view": true },
  };
  await member(owner, tA, "OWNER", ["*"], perms[owner]!);
  await member(mgr, tA, "MANAGER", [u1], perms[mgr]!);
  await member(staffAi, tA, "STAFF", ["*"], perms[staffAi]!);
  await member(staffKb, tA, "STAFF", ["*"], perms[staffKb]!);
  const act = (uid: string) => ACT.aiMemberActor(tA, uid, {
    role: uid === owner ? "OWNER" : uid === mgr ? "MANAGER" : "STAFF",
    unitAccess: uid === mgr ? [u1] : ["*"],
    permissions: perms[uid],
  });
  const M = (await sysSvc.createSystem(tA, "MEMBER", "สมาชิกทดสอบ")).id as string;
  const A = (await sysSvc.createSystem(tA, "ACCOUNT", "บัญชีทดสอบ")).id as string;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  await accSvc.saveSettings(tA, A, { orgName: "QC ร้านทดสอบ", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await sysSvc.createSystem(tA, "POS", "ขายทดสอบ");
  await sysSvc.createSystem(tA, "HR", "พนักงานทดสอบ");
  const K = (await sysSvc.createSystem(tA, "KANBAN", "บอร์ดทดสอบ")).id as string;
  await P.customer.create({ data: { tenantId: tA, memberSystemId: M, name: "สมาชิกสาขาหนึ่ง", phone: "0899000101", homeUnitId: u1, memberCode: "QRA001" } });
  await P.customer.create({ data: { tenantId: tA, memberSystemId: M, name: "สมาชิกสาขาสอง", phone: "0899000102", homeUnitId: u2, memberCode: "QRA002" } });
  await P.aiCreditWallet.create({ data: { tenantId: tA, balanceMicro: 50_000_000, grantedAt: new Date() } });
  const rt = (actor: Any, name: string, args: Any = {}, conversationId?: string) =>
    tools.runTool({ tenantId: tA, actor, ...(conversationId ? { conversationId } : {}) }, name, args) as Promise<string>;

  // ═══ R — cross-user conversation history (builder R1) ═══
  console.log("\n── R cross-user AI conversation history ──");
  const spO = new Scripted([{ toolCalls: [{ id: "o1", name: "customer_search", args: { query: "สมาชิกสาขา" } }] }, { text: "$LAST_TOOL" }]);
  const sO = await svc.sendMessage({ tenantId: tA, actor: act(owner) }, { text: "ขอเบอร์สมาชิกทุกสาขา" }, { provider: spO });
  const ownerConv = sO.conversationId as string;
  info("R0", `OWNER asked (allowed): reply holds full phones = ${has(sO.reply, "0899000102")} → ${cut(sO.reply, 120)}`);
  // direct tool call by the cashier: G1 refuses
  const direct = await rt(act(staffAi), "customer_search", { query: "สมาชิกสาขา" });
  chk("R0.1", isRefusal(direct), `positive control of G1: STAFF ai-only calling customer_search directly → refused → ${cut(direct, 80)}`);
  // (a) web: the AI sheet opens the SHOP's latest conversation
  const AIA = (await import("@/lib/ai/actions" as string)) as Any;
  const ckAi = await sessionCookie(staffAi, tA);
  const load: Any = await inScope(ckAi, "/app", () => AIA.loadAiChatAction()).catch((e: Error) => ({ error: e.message }));
  const loadTxt = j(load);
  chk("R1.1", !has(loadTxt, "0899000102"), `web loadAiChatAction as STAFF ai-only (no member key) must not show answers produced with the OWNER's rights → conv=${load?.conversationId === ownerConv ? "OWNER's" : load?.conversationId} phone shown=${has(loadTxt, "0899000102")}`);
  // (b) mobile: list + read every conversation of the shop
  const mobAuth = (await import("@/lib/mobile/auth" as string)) as Any;
  const tok = (await mobAuth.issueMobileToken(staffAi)).token as string;
  const hdr = { authorization: `Bearer ${tok}`, "x-tenant-id": tA };
  const MCONV = (await import("../../../../src/app/api/mobile/conversations/route.ts" as string)) as Any;
  const MMSG = (await import("../../../../src/app/api/mobile/conversations/[id]/messages/route.ts" as string)) as Any;
  const lr = await MCONV.GET(new Request("http://qc.invalid/api/mobile/conversations", { headers: hdr }));
  const list = (await lr.json()) as Any;
  const listed = (list.conversations ?? []).some((c: Any) => c.id === ownerConv);
  const mr = await MMSG.GET(new Request(`http://qc.invalid/api/mobile/conversations/${ownerConv}/messages`, { headers: hdr }), { params: Promise.resolve({ id: ownerConv }) });
  const mtxt = await mr.text();
  chk("R1.2", !listed && !has(mtxt, "0899000102"), `mobile as STAFF ai-only: OWNER's conversation listed=${listed} · messages ${mr.status} contain the phone=${has(mtxt, "0899000102")}`);
  // (c) continue the OWNER's conversation: history goes back into the prompt → the model can quote it
  const spH = new Scripted([{ text: "$HISTORY" }]);
  const sH = await svc.sendMessage({ tenantId: tA, actor: act(staffAi) }, { conversationId: ownerConv, text: "สรุปที่คุยไว้หน่อย" }, { provider: spH });
  chk("R1.3", !has(sH.reply, "0899000102"), `sendMessage as STAFF ai-only with the OWNER's conversationId → model sees and quotes the OWNER's tool result: ${has(sH.reply, "0899000102")} → ${cut(sH.reply, 110)}`);
  // (d) shop memory (D1 — owner decision): OWNER stores a fact, cashier lists it
  await rt(act(owner), "remember_fact", { content: "ลูกค้า VIP คุณสอง เบอร์ 0899000102" });
  const lm = await rt(act(staffAi), "list_memories");
  info("R1.4", `D1 shop memory: OWNER's remembered fact visible to STAFF ai-only via list_memories (and in every system prompt): ${has(lm, "0899000102")}`);

  // ═══ K — kanban PRIVATE boards ═══
  console.log("\n── K kanban PRIVATE boards through AI tools ──");
  const mkBoard = async (name: string, visibility: string, unitId: string | null, cardTitle: string) => {
    const b = await P.kanbanBoard.create({ data: { tenantId: tA, systemId: K, name, visibility, unitId } });
    const c = await P.kanbanColumn.create({ data: { tenantId: tA, systemId: K, boardId: b.id, name: "ต้องทำ" } });
    await P.kanbanCard.create({ data: { tenantId: tA, systemId: K, boardId: b.id, columnId: c.id, title: cardTitle, assigneeUserId: owner, dueAt: new Date(Date.now() - 3 * 86_400_000) } });
    return b.id as string;
  };
  const bPriv = await mkBoard("บอร์ดลับเจ้าของ", "PRIVATE", null, "งานลับเจ้าของ");
  const bPrivU2 = await mkBoard("บอร์ดลับสาขาสอง", "PRIVATE", u2, "งานลับสาขาสอง");
  await mkBoard("บอร์ดรวมร้าน", "TENANT", null, "งานรวมร้าน");
  await P.kanbanBoardMember.create({ data: { tenantId: tA, boardId: bPriv, userId: owner, role: "ADMIN" } }).catch(() => undefined);
  const kTools: [string, Any][] = [["kanban_list_boards", {}], ["kanban_search_cards", { q: "งาน" }], ["kanban_overdue_report", {}], ["kanban_my_tasks", {}], ["kanban_my_tasks", { assignee: `QC -owner ${TAG}` }], ["kanban_workload_report", {}]];
  const kOut: Record<string, string> = {};
  for (const [n, a] of kTools) kOut[`staff:${n}:${j(a)}`] = await rt(act(staffKb), n, a);
  for (const [n, a] of kTools) kOut[`mgr:${n}:${j(a)}`] = await rt(act(mgr), n, a);
  for (const [n, a] of kTools) kOut[`owner:${n}:${j(a)}`] = await rt(act(owner), n, a);
  const staffLeak = Object.entries(kOut).filter(([k, v]) => k.startsWith("staff:") && /งานลับ|บอร์ดลับ/.test(v)).map(([k]) => k);
  const mgrLeak = Object.entries(kOut).filter(([k, v]) => k.startsWith("mgr:") && /งานลับเจ้าของ|บอร์ดลับเจ้าของ|งานลับสาขาสอง|บอร์ดลับสาขาสอง/.test(v)).map(([k]) => k);
  chk("K1.1", staffLeak.length === 0, `STAFF kanban.board.read+report.view, not a board member: no PRIVATE board/card in ${kTools.length} tools · leaks=${j(staffLeak)}`);
  chk("K1.2", mgrLeak.length === 0, `MANAGER u1: no PRIVATE board without unit / of branch u2 · leaks=${j(mgrLeak)}`);
  const staffSees = Object.entries(kOut).some(([k, v]) => k.startsWith("staff:") && /งานรวมร้าน|บอร์ดรวมร้าน/.test(v));
  const ownerSees = Object.entries(kOut).some(([k, v]) => k.startsWith("owner:") && has(v, "งานลับเจ้าของ")) && Object.entries(kOut).some(([k, v]) => k.startsWith("owner:") && has(v, "งานลับสาขาสอง"));
  chk("K1.3", staffSees && ownerSees, `positive controls: STAFF sees the TENANT board · OWNER sees both PRIVATE boards`);
  const gb = await rt(act(staffKb), "kanban_get_board", { boardId: bPrivU2 });
  chk("K1.4", !/งานลับ|บอร์ดลับ/.test(gb), `kanban_get_board with a known PRIVATE board id (id leaked e.g. from shared history) → not shown → ${cut(gb, 90)}`);
  for (const [k, v] of Object.entries(kOut)) if (k.includes("workload")) info("K1.5", `${k.split(":")[0]} workload → ${cut(v, 140)}`);

  // ═══ S — scheduled-task system actor ═══
  console.log("\n── S scheduled-task actor (least-privileged reader) ──");
  const sysA = ACT.aiSystemActor(tA, "scheduled-task");
  const allNames = (tools.toolRegistry() as Any[]).map((x) => x.def.name as string);
  const offeredSys = TA.toolsOfferedTo(sysA, allNames) as string[];
  info("S1.0", `tools usable by the scheduled job (${offeredSys.length}/${allNames.length}): ${j(offeredSys)}`);
  const sSales = await rt(sysA, "sales_summary", { days: 7 });
  const sFin = await rt(sysA, "financial_summary");
  const sAcc = await rt(sysA, "account_dashboard", {});
  const sMem = await rt(sysA, "member_list", {});
  const sCust = await rt(sysA, "customer_search", { query: "สมาชิก" });
  chk("S1.1", !isRefusal(sSales) && isRefusal(sFin) && isRefusal(sAcc) && isRefusal(sMem) && isRefusal(sCust),
    `scheduled job: sales_summary runs · financial_summary/account_dashboard/member_list/customer_search refused (documented behaviour change) → ${cut(sFin, 70)}`);
  const sLeave = await rt(sysA, "pending_leaves");
  info("S1.2", `scheduled job pending_leaves (employee names + leave type + reason, no hr.leave.read) → ${isRefusal(sLeave) ? "refused" : "ALLOWED"} → ${cut(sLeave, 80)}`);
  // unit-axis tools are OFFERED to the job but its rights have no branch ⇒ do they refuse, or answer "nothing" while rows exist?
  await P.shopOrder.create({ data: { tenantId: tA, unitId: u1, code: "SO-QR1", customerName: "ผู้ซื้อสาขาหนึ่ง", customerPhone: "0822000009", totalSatang: 10_000 } });
  const sShop = await rt(sysA, "shop_pending_orders");
  const oShop = await rt(act(owner), "shop_pending_orders");
  chk("S1.3", has(oShop, "SO-QR1") && (isRefusal(sShop) || has(sShop, "SO-QR1")),
    `scheduled job shop_pending_orders with 1 pending order: must refuse or report it, not answer "none" (published to every member) → job: ${cut(sShop, 90)} | OWNER sees it: ${has(oShop, "SO-QR1")}`);

  // ═══ E — persona sweep over the registry ═══
  console.log("\n── E persona sweep ──");
  const deniedFor = (a: Any) => allNames.filter((n) => !TA.toolVerdict(a, n).ok);
  const dOwner = deniedFor(act(owner));
  chk("E1.1", dOwner.length === 0, `OWNER: no registry tool refused by the access table · refused=${j(dOwner)}`);
  const mgrAll = ACT.aiMemberActor(tA, mgr, { role: "MANAGER", unitAccess: ["*"], permissions: {} });
  info("E1.2", `MANAGER(*) refused (${deniedFor(mgrAll).length}): ${j(deniedFor(mgrAll))}`);
  info("E1.3", `MANAGER(u1) refused (${deniedFor(act(mgr)).length}): ${j(deniedFor(act(mgr)))}`);
  // propose gate (module judge) vs confirm gate (assertCan = core evaluate) for the hand-written proposal kinds
  const diverge: string[] = [];
  for (const [tool, kind] of Object.entries(TA.HAND_ACTION_KIND as Record<string, string>)) {
    const q = props.kindAccessOf(kind);
    if (!q) continue;
    for (const [label, m] of [["MANAGER*", { role: "MANAGER", unitAccess: ["*"], permissions: {} }], ["STAFF+key", { role: "STAFF", unitAccess: ["*"], permissions: { ...AI, [q.action]: true } }]] as const) {
      const propose = TA.toolVerdict(ACT.aiMemberActor(tA, staffAi, m), tool).ok as boolean;
      const confirm = rbac.evaluate(m, q) as boolean;
      if (propose !== confirm) diverge.push(`${tool}/${label}: propose=${propose} confirm=${confirm}`);
    }
  }
  chk("E1.4", diverge.length === 0, `hand proposal tools: propose gate == confirm gate (MANAGER*, STAFF holding exactly the confirm key) · diverge=${j(diverge)}`);
  const unknown = TA.toolVerdict(act(owner), "no_such_tool_x");
  chk("E1.5", unknown.ok === false, `unmapped name → denied by default (${cut(unknown.reason, 50)})`);

  // ═══ A — API keys through the real routes ═══
  console.log("\n── A API keys (real routes) ──");
  const keySvc = (await import("@/lib/api-keys/service" as string)) as Any;
  const kGen = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-gen`, {});
  const kMem = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-mem`, { scopes: ["member.customer.read"], systemId: M });
  const kCrm = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-crm`, { scopes: ["crm.contact.read"] });
  const TOOLS = (await import("../../../../src/app/api/v1/ai/tools/[name]/route.ts" as string)) as Any;
  const SKILL = (await import("../../../../src/app/api/v1/ai/skills/[id]/route.ts" as string)) as Any;
  const post = async (raw: string, name: string, args: Any = {}) => {
    const r = await TOOLS.POST(new Request(`http://qc.invalid/api/v1/ai/tools/${name}`, { method: "POST", headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" }, body: j({ args }) }), { params: Promise.resolve({ name }) });
    return { status: r.status as number, body: await r.text() };
  };
  const pr0 = await P.aiProposal.count({ where: { tenantId: tA } });
  const gMc = await post(kGen.rawKey, "member_create", { name: "จากคีย์", phone: "0890000001" });
  const gPos = await post(kGen.rawKey, "pos_create_sale", { lines: [{ name: "กาแฟ", qty: 1, unitPriceSatang: 5000 }], payType: "CASH" });
  const pr1 = await P.aiProposal.count({ where: { tenantId: tA } });
  info("A1.1", `general key: member_create ${gMc.status} (route-level scope gate, pre-existing) · pos_create_sale ${gPos.status} → proposals ${pr0}→${pr1}`);
  const mList = await post(kMem.rawKey, "member_list", {});
  const mCs = await post(kMem.rawKey, "customer_search", { query: "สมาชิก" });
  chk("A1.2", has(mList.body, "สมาชิกสาขา") && !has(mCs.body, "0899000101"), `member-scoped key bound to M: member_list ${mList.status} has rows · customer_search ${mCs.status} no phone → ${cut(mCs.body, 80)}`);
  const cS = await post(kCrm.rawKey, "crm_search", { q: "x" });
  info("A1.3", `crm-scoped key → crm_search ${cS.status} → ${cut(cS.body, 120)} (no CRM system in this fixture — evidence only)`);
  // manifest vs executor: tools advertised to the general key that the executor refuses
  const skillsMod = (await import("@/lib/ai/skills" as string)) as Any;
  const types = ((await P.appSystem.findMany({ where: { tenantId: tA }, select: { type: true } })) as Any[]).map((s) => s.type);
  const genActor = ACT.aiApiKeyActor({ tenantId: tA, keyId: "x", scopes: [], systemId: null });
  const mismatch: string[] = [];
  for (const s of skillsMod.skillsForTenant(types) as Any[]) {
    const r = await SKILL.GET(new Request(`http://qc.invalid/api/v1/ai/skills/${s.id}`, { headers: { authorization: `Bearer ${kGen.rawKey}` } }), { params: Promise.resolve({ id: s.id }) });
    if (r.status !== 200) continue;
    const body = (await r.json()) as Any;
    for (const tl of body.tools ?? []) if (!TA.toolVerdict(genActor, tl.function.name).ok) mismatch.push(`${s.id}:${tl.function.name}`);
  }
  chk("A1.4", mismatch.length === 0, `GET /api/v1/ai/skills/[id] (general key) advertises only tools the executor runs · advertised-but-refused=${j(mismatch)}`);
  const refusedStatus = await post(kGen.rawKey, "financial_summary");
  info("A1.5", `executor refusal through the route answers HTTP ${refusedStatus.status} (not 403) → ${cut(refusedStatus.body, 90)}`);

  // ═══ U — branch-limited MANAGER ═══
  console.log("\n── U MANAGER limited to u1 ──");
  const mcM = await rt(act(mgr), "member_count");
  info("U1.1", `member_count MANAGER u1 → ${cut(mcM, 60)} (fixture: 1 member in u1, 1 in u2 — builder R2)`);
  const cpHidden = await rt(act(mgr), "customer_points", { query: "สมาชิกสาขาสอง" });
  const cpNone = await rt(act(mgr), "customer_points", { query: "ไม่มีคนนี้แน่นอน" });
  chk("U1.2", cpHidden.split("สมาชิกสาขาสอง").join("Q") === cpNone.split("ไม่มีคนนี้แน่นอน").join("Q"), `customer_points for a member of another branch answers exactly like a non-existent one → ${cut(cpHidden, 70)} | ${cut(cpNone, 70)}`);

  // ═══ D — defence in depth ═══
  console.log("\n── D defence in depth ──");
  const accTool = (tools.toolRegistry() as Any[]).find((x) => x.def.name === "account_dashboard");
  const noActorOut = String(await accTool.execute({ tenantId: tA }, {}).catch((e: Error) => `throw ${e.message}`));
  info("D1.1", `AiTool.execute without actor (bypassing runTool — no product caller today) account_dashboard → ${/"error"/.test(noActorOut) ? "error" : "DATA (adapter falls back to the widest assistant read set)"} → ${cut(noActorOut, 80)}`);
  const forged = { kind: "system", tenantId: tA, job: "scheduled-task", membership: { role: "OWNER", unitAccess: ["*"], permissions: {} } };
  const fOut = await rt(forged, "financial_summary");
  info("D1.2", `system-actor literal carrying OWNER rights (type allows it; runTool does not bind rights to the job) → financial_summary ${isRefusal(fOut) ? "refused" : "ALLOWED"}`);
} catch (e) {
  chk("FATAL", false, `probe crashed: ${cut((e as Error)?.stack ?? e, 500)}`);
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
  const pass = res.filter((r) => r.ok).length;
  console.log(`\nJSON_SUMMARY ${j({ pass, total: res.length, red: res.filter((r) => !r.ok).map((r) => r.id) })}`);
  await prisma.$disconnect();
  process.exit(res.every((r) => r.ok) ? 0 : 1);
}
