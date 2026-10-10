// probe — CRM C5.5-G2 "AI conversations belong to their creator". Each check asserts the SECURE / intended property:
//   ✅ = property holds · ❌ = leak / regression reproduced · ℹ️ = evidence, not counted.
//   Doors are driven through their REAL entry points whose signatures did not change in this card (so the same file runs on the
//   base tree for RED): web server actions under a session cookie · mobile route handlers with a Bearer token · REST
//   `POST /api/v1/ai/tools/[name]` with real API keys · member-assistant server actions · `sendMessage` · `executeProposal`.
//   W* web · M* mobile · S* model context (sendMessage) · K* REST API keys · A* member assistant · Y* scheduled (system) ·
//   O* ops counts · F* shop memory (finding, evidence only) · R1.x = the reviewer's G1 F1 scenarios.
// Model: scripted provider or the built-in mock (SHARK_AI_MOCK=1) — no network (fetch blocked). QC3 only · throwaway tenant swept.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf14/probe-cf14-g2.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
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
const TAG = `qc-cf14-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);
const j = (v: unknown) => JSON.stringify(v);
const cut = (v: unknown, n = 150) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const has = (s: unknown, x: string) => (typeof s === "string" ? s : j(s)).includes(x);
const USERS: string[] = [];
const TENANTS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const svc = (await import("@/lib/ai/service" as string)) as Any;
const ACT = (await import("@/lib/ai/actor" as string)) as Any;
const props = (await import("@/lib/ai/proposals" as string)) as Any;
const AIA = (await import("@/lib/ai/actions" as string)) as Any;
const MAA = (await import("@/lib/modules/member/assistant-actions" as string)) as Any;
const mobAuth = (await import("@/lib/mobile/auth" as string)) as Any;
const keySvc = (await import("@/lib/api-keys/service" as string)) as Any;
const drip = (await import("@/lib/platform/onboarding-drip" as string)) as Any;
const R = {
  conv: (await import("../../../src/app/api/mobile/conversations/route.ts" as string)) as Any,
  convId: (await import("../../../src/app/api/mobile/conversations/[id]/route.ts" as string)) as Any,
  msgs: (await import("../../../src/app/api/mobile/conversations/[id]/messages/route.ts" as string)) as Any,
  read: (await import("../../../src/app/api/mobile/conversations/[id]/read/route.ts" as string)) as Any,
  welcome: (await import("../../../src/app/api/mobile/chat/welcome/route.ts" as string)) as Any,
  send: (await import("../../../src/app/api/mobile/chat/send/route.ts" as string)) as Any,
  props: (await import("../../../src/app/api/mobile/proposals/route.ts" as string)) as Any,
  pConfirm: (await import("../../../src/app/api/mobile/proposals/confirm/route.ts" as string)) as Any,
  pReject: (await import("../../../src/app/api/mobile/proposals/reject/route.ts" as string)) as Any,
  plConfirm: (await import("../../../src/app/api/mobile/plans/confirm/route.ts" as string)) as Any,
  plReject: (await import("../../../src/app/api/mobile/plans/reject/route.ts" as string)) as Any,
  tools: (await import("../../../src/app/api/v1/ai/tools/[name]/route.ts" as string)) as Any,
};
const mkUser = async (suffix: string) => {
  const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
  USERS.push(u.id);
  return u.id as string;
};
const member = (uid: string, tid: string, role: string, permissions: Record<string, boolean>) =>
  P.membership.create({ data: { userId: uid, tenantId: tid, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf14", "x-forwarded-for": "203.0.113.194" } });
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
      // a model that quotes every earlier turn it was given ("summarise what we discussed")
      const hist = messages.filter((m: Any) => m.role === "assistant" || m.role === "user").map((m: Any) => String(m.content)).join(" | ");
      return { text: `สรุปที่คุยไว้: ${hist}`, tokensIn: 10, tokensOut: 10, model: "scripted" };
    }
    if (step.text === "$SYSTEM") {
      const sys = messages.find((m: Any) => m.role === "system");
      return { text: `system: ${sys?.content ?? ""}`, tokensIn: 10, tokensOut: 10, model: "scripted" };
    }
    return { text: step.text ?? "", toolCalls: step.toolCalls, tokensIn: 10, tokensOut: 10, model: "scripted" };
  }
}
const PHONE = "0899000102"; // only the OWNER's tool result contains it
const LEGACY = "0899000177"; // only the legacy (no creator) conversation contains it

try {
  // ═══ world ═══
  const tA = (await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } })).id as string;
  TENANTS.push(tA);
  const owner = await mkUser("-owner");
  const owner2 = await mkUser("-owner2");
  const staffAi = await mkUser("-ai");
  const staffMem = await mkUser("-mem");
  const perms: Record<string, Record<string, boolean>> = {
    [owner]: {}, [owner2]: {},
    [staffAi]: { "ai.chat.send": true, "ai.schedule.create": true },
    [staffMem]: { "ai.chat.send": true, "ai.schedule.create": true, "member.customer.read": true },
  };
  const roleOf = (u: string) => (u === owner || u === owner2 ? "OWNER" : "STAFF");
  for (const u of [owner, owner2, staffAi, staffMem]) await member(u, tA, roleOf(u), perms[u]!);
  const act = (uid: string) => ACT.aiMemberActor(tA, uid, { role: roleOf(uid), unitAccess: ["*"], permissions: perms[uid] });
  const M = (await sysSvc.createSystem(tA, "MEMBER", "สมาชิกทดสอบ")).id as string;
  await P.customer.create({ data: { tenantId: tA, memberSystemId: M, name: "สมาชิกคนที่สอง", phone: PHONE, memberCode: "QRB002" } });
  await P.aiCreditWallet.create({ data: { tenantId: tA, balanceMicro: 50_000_000, grantedAt: new Date() } });
  const msgCount = (cid: string) => P.aiMessage.count({ where: { tenantId: tA, conversationId: cid } }) as Promise<number>;
  const status = async (model: "aiProposal" | "aiPlan", id: string) => String((await P[model].findUnique({ where: { id } }))?.status);
  const ck: Record<string, string> = {};
  for (const u of [owner, owner2, staffAi, staffMem]) ck[u] = await sessionCookie(u, tA);
  const tok: Record<string, string> = {};
  for (const u of [owner, owner2, staffAi, staffMem]) tok[u] = (await mobAuth.issueMobileToken(u)).token as string;
  const mreq = (u: string, path: string, method = "GET", body?: unknown) =>
    new Request(`http://qc.invalid${path}`, { method, headers: { authorization: `Bearer ${tok[u]}`, "x-tenant-id": tA, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: j(body) } : {}) });
  const pid = (id: string) => ({ params: Promise.resolve({ id }) });
  const mList = async (u: string) => (((await (await R.conv.GET(mreq(u, "/api/mobile/conversations"))).json()) as Any).conversations ?? []).map((c: Any) => c.id as string) as string[];
  const mMsgs = async (u: string, id: string) => { const r = await R.msgs.GET(mreq(u, `/api/mobile/conversations/${id}/messages`), pid(id)); return { status: r.status as number, text: await r.text() }; };
  const web = (u: string, fn: () => Promise<Any>): Promise<Any> => inScope(ck[u]!, "/app", fn);

  // ── fixtures: the OWNER's conversation (tool result with a phone + a pending proposal + a pending plan) ──
  const sO = await svc.sendMessage({ tenantId: tA, actor: act(owner) }, { text: "ขอเบอร์สมาชิกทุกคน" }, { provider: new Scripted([{ toolCalls: [{ id: "o1", name: "customer_search", args: { query: "สมาชิก" } }] }, { text: "$LAST_TOOL" }]) });
  const ownerConv = sO.conversationId as string;
  info("FIX", `OWNER conversation ${ownerConv} · reply holds the phone=${has(sO.reply, PHONE)}`);
  const sched = (n: number) => ({ id: `p${n}`, name: "schedule_task", args: { instruction: `สรุปยอด ${TAG} ${n}`, hourBkk: 3 } });
  await svc.sendMessage({ tenantId: tA, actor: act(owner) }, { conversationId: ownerConv, text: "ตั้งงานประจำ 4 งาน" }, { provider: new Scripted([{ toolCalls: [sched(1), sched(2), sched(3), sched(4), sched(5)] }, { text: "เสนอแล้ว" }]) });
  await svc.sendMessage({ tenantId: tA, actor: act(owner) }, { conversationId: ownerConv, text: "ทำเป็นแผน" }, { provider: new Scripted([{ toolCalls: [{ id: "pl", name: "propose_plan", args: { title: `แผน ${TAG}`, steps: [{ kind: "ai_schedule_task", summary: "ตั้งงาน", payload: { instruction: `แผน ${TAG}`, hourBkk: 4 } }] } }] }, { text: "เสนอแผนแล้ว" }]) });
  const oProps = ((await P.aiProposal.findMany({ where: { tenantId: tA, conversationId: ownerConv }, orderBy: { createdAt: "asc" } })) as Any[]).map((p) => p.id as string);
  const oPlan = ((await P.aiPlan.findFirst({ where: { tenantId: tA, conversationId: ownerConv } })) as Any)?.id as string;
  info("FIX", `OWNER proposals in own conversation=${oProps.length} · plan=${Boolean(oPlan)}`);
  const ownerMsgs0 = await msgCount(ownerConv);
  // ── legacy conversation (written before this card: no creator) ──
  const legacy = (await P.aiConversation.create({ data: { tenantId: tA, title: "ห้องเดิมก่อนใบนี้" } })).id as string;
  await P.aiMessage.create({ data: { tenantId: tA, conversationId: legacy, role: "USER", content: "เบอร์ลูกค้าเก่า" } });
  await P.aiMessage.create({ data: { tenantId: tA, conversationId: legacy, role: "ASSISTANT", content: `ลูกค้าเก่า ${LEGACY}` } });
  const legacyProp = (await props.createProposal({ tenantId: tA }, { conversationId: legacy, kind: "ai_schedule_task", summary: "ห้องเดิม", payload: { instruction: `เดิม ${TAG}`, hourBkk: 5 } })).id as string;

  // ═══ W — web (session cookie) ═══
  console.log("\n── W web ──");
  const wLoad: Any = await web(staffAi, () => AIA.loadAiChatAction()).catch((e: Error) => ({ error: e.message }));
  chk("W1.1", wLoad?.conversationId !== ownerConv && wLoad?.conversationId !== legacy && !has(wLoad, PHONE) && !has(wLoad, LEGACY),
    `[= R1.1] STAFF ai-only opens the AI sheet (loadAiChatAction) → not the OWNER's / legacy conversation · conv=${wLoad?.conversationId === ownerConv ? "OWNER's" : wLoad?.conversationId === legacy ? "legacy" : wLoad?.conversationId} phone=${has(wLoad, PHONE)} legacy=${has(wLoad, LEGACY)}`);
  const wPr = await web(staffAi, () => AIA.listPendingProposalsAction(ownerConv));
  const wPl = await web(staffAi, () => AIA.loadPlansAction(ownerConv));
  const wPrL = await web(staffAi, () => AIA.listPendingProposalsAction(legacy));
  chk("W1.2", wPr.length === 0 && wPl.length === 0 && wPrL.length === 0, `STAFF lists the OWNER's pending proposals/plans by conversation id → ${wPr.length}/${wPl.length} · legacy proposals → ${wPrL.length}`);
  const wC = await web(staffAi, () => AIA.confirmProposalAction(oProps[0]));
  const wR = await web(staffAi, () => AIA.rejectProposalAction(oProps[0]));
  const wPC = await web(staffAi, () => AIA.confirmPlanAction(oPlan));
  const wPR = await web(staffAi, () => AIA.rejectPlanAction(oPlan));
  chk("W1.3", !wC.ok && !wR.ok && !wPC.ok && !wPR.ok && (await status("aiProposal", oProps[0]!)) === "PENDING" && (await status("aiPlan", oPlan)) === "PENDING",
    `STAFF holding the confirm key (ai.schedule.create) confirms/rejects the OWNER's proposal and plan → all refused, rows stay PENDING · confirm=${cut(wC.note, 50)} reject=${cut(wR.note, 40)} plan=${cut(wPC.note, 40)}`);
  const wLC = await web(staffAi, () => AIA.confirmProposalAction(legacyProp));
  chk("W1.4", !wLC.ok && (await status("aiProposal", legacyProp)) === "PENDING", `STAFF confirms a proposal of a legacy (creator unknown) conversation → refused · ${cut(wLC.note, 60)}`);
  const wS = await web(staffAi, () => AIA.sendAiMessageAction({ text: `สวัสดีจากพนักงาน ${TAG}` }));
  const wL2: Any = await web(staffAi, () => AIA.loadAiChatAction());
  chk("W2.1", wS.ok && wL2.conversationId === wS.conversationId && has(wL2.messages, `สวัสดีจากพนักงาน ${TAG}`), `positive: STAFF's own chat — send then reopen the sheet → own conversation with own messages (${wS.ok ? "sent" : wS.message})`);
  const staffConv = wS.conversationId as string;
  const wO: Any = await web(owner, () => AIA.loadAiChatAction());
  chk("W2.2", wO.conversationId !== staffConv && !has(wO.messages, `สวัสดีจากพนักงาน ${TAG}`), `OWNER opens the sheet after STAFF chatted → not the STAFF's conversation (creator only, also for the OWNER) · conv=${wO.conversationId === staffConv ? "STAFF's" : wO.conversationId === ownerConv ? "own" : wO.conversationId === legacy ? "legacy" : wO.conversationId}`);
  const wO2: Any = await web(owner2, () => AIA.loadAiChatAction());
  chk("W2.3", wO2.conversationId !== ownerConv && !has(wO2, PHONE), `a second OWNER opens the sheet → not the first OWNER's conversation · conv=${wO2.conversationId === ownerConv ? "OWNER-1's" : wO2.conversationId === legacy ? "legacy" : wO2.conversationId}`);
  const wOL = await web(owner, () => AIA.listPendingProposalsAction(legacy));
  const wOP = await web(owner, () => AIA.listPendingProposalsAction(ownerConv));
  chk("W2.4", wOL.some((p: Any) => p.id === legacyProp) && wOP.length >= 4, `positive: OWNER lists proposals of the legacy conversation (${wOL.length}) and of own conversation (${wOP.length})`);
  const wOC = await web(owner, () => AIA.confirmProposalAction(oProps[0]));
  chk("W2.5", wOC.ok && (await status("aiProposal", oProps[0]!)) === "EXECUTED", `positive: OWNER confirms own proposal → ${wOC.ok ? "EXECUTED" : wOC.note}`);

  // ═══ M — mobile (Bearer) ═══
  console.log("\n── M mobile ──");
  const sList = await mList(staffAi);
  const mO = await mMsgs(staffAi, ownerConv);
  const mL = await mMsgs(staffAi, legacy);
  chk("M1.1", !sList.includes(ownerConv) && !sList.includes(legacy) && !has(mO.text, PHONE) && !has(mL.text, LEGACY),
    `[= R1.2] STAFF list has OWNER's=${sList.includes(ownerConv)} legacy=${sList.includes(legacy)} · messages(OWNER's) ${mO.status} phone=${has(mO.text, PHONE)} · messages(legacy) ${mL.status} secret=${has(mL.text, LEGACY)}`);
  const ren = (await (await R.convId.PATCH(mreq(staffAi, `/api/mobile/conversations/${ownerConv}`, "PATCH", { title: "แฮ็ก" }), pid(ownerConv))).json()) as Any;
  const del = (await (await R.convId.DELETE(mreq(staffAi, `/api/mobile/conversations/${ownerConv}`, "DELETE"), pid(ownerConv))).json()) as Any;
  const rd = (await (await R.read.POST(mreq(staffAi, `/api/mobile/conversations/${ownerConv}/read`, "POST", {}), pid(ownerConv))).json()) as Any;
  const oRow = (await P.aiConversation.findUnique({ where: { id: ownerConv } })) as Any;
  chk("M1.2", ren.ok === false && del.ok === false && rd.ok === false && oRow.title !== "แฮ็ก" && !oRow.deletedAt, `STAFF rename/delete/mark-read the OWNER's conversation → ${ren.ok}/${del.ok}/${rd.ok} (same answer as a missing id) · title kept=${oRow.title !== "แฮ็ก"} deleted=${Boolean(oRow.deletedAt)}`);
  const mPr = (await (await R.props.GET(mreq(staffAi, `/api/mobile/proposals?conversationId=${encodeURIComponent(ownerConv)}`))).json()) as Any;
  const mPC = (await (await R.pConfirm.POST(mreq(staffAi, "/api/mobile/proposals/confirm", "POST", { id: oProps[1] }))).json()) as Any;
  const mPR = (await (await R.pReject.POST(mreq(staffAi, "/api/mobile/proposals/reject", "POST", { id: oProps[1] }))).json()) as Any;
  const mPlC = (await (await R.plConfirm.POST(mreq(staffAi, "/api/mobile/plans/confirm", "POST", { id: oPlan }))).json()) as Any;
  const mPlR = (await (await R.plReject.POST(mreq(staffAi, "/api/mobile/plans/reject", "POST", { id: oPlan }))).json()) as Any;
  chk("M1.3", (mPr.proposals ?? []).length === 0 && !mPC.ok && !mPR.ok && !mPlC.ok && !mPlR.ok && (await status("aiProposal", oProps[1]!)) === "PENDING" && (await status("aiPlan", oPlan)) === "PENDING",
    `STAFF (confirm key held) via mobile: list=${(mPr.proposals ?? []).length} confirm=${mPC.ok} reject=${mPR.ok} plan confirm=${mPlC.ok} plan reject=${mPlR.ok} · rows PENDING`);
  const created = (await (await R.conv.POST(mreq(staffAi, "/api/mobile/conversations", "POST", { title: "ห้องพนักงาน" }))).json()) as Any;
  const sList2 = await mList(staffAi);
  const oList = await mList(owner);
  const renOwn = (await (await R.convId.PATCH(mreq(staffAi, `/api/mobile/conversations/${created.id}`, "PATCH", { title: "ห้องพนักงาน 2" }), pid(created.id))).json()) as Any;
  const mOwn = await mMsgs(staffAi, staffConv);
  chk("M2.1", sList2.includes(created.id) && sList2.includes(staffConv) && renOwn.ok === true && mOwn.status === 200 && has(mOwn.text, `สวัสดีจากพนักงาน ${TAG}`),
    `positive: STAFF creates, lists, renames and reads own conversations (web + mobile) · listed=${sList2.includes(created.id)}/${sList2.includes(staffConv)} rename=${renOwn.ok}`);
  chk("M2.2", oList.includes(ownerConv) && oList.includes(legacy) && !oList.includes(created.id) && !oList.includes(staffConv),
    `OWNER list: own=${oList.includes(ownerConv)} legacy=${oList.includes(legacy)} (positive) · STAFF's rooms=${oList.includes(created.id) || oList.includes(staffConv)} (must be false)`);
  const mOL = await mMsgs(owner, legacy);
  chk("M2.3", has(mOL.text, LEGACY), `positive: OWNER reads the legacy conversation (no recorded creator ⇒ OWNER only) → ${mOL.status}`);
  const wM = (await (await R.welcome.POST(mreq(staffMem, "/api/mobile/chat/welcome", "POST", {}))).json()) as Any;
  const wM2 = (await (await R.welcome.POST(mreq(staffMem, "/api/mobile/chat/welcome", "POST", {}))).json()) as Any;
  const wMO = (await (await R.welcome.POST(mreq(owner, "/api/mobile/chat/welcome", "POST", {}))).json()) as Any;
  const memList = await mList(staffMem);
  chk("M3.1", wM.existing === false && typeof wM.conversationId === "string" && memList.includes(wM.conversationId) && wM2.existing === true && wMO.existing === true,
    `welcome: a STAFF with no room of their own gets their own welcome room (the shop's other rooms are not "existing" for them) → ${j({ first: wM.existing, again: wM2.existing, owner: wMO.existing })}`);
  const sse = await (await R.send.POST(mreq(staffAi, "/api/mobile/chat/send", "POST", { conversationId: ownerConv, text: "ต่อห้องเจ้าของ" }))).text();
  const done = (sse as string).split("\n").filter((l: string) => l.startsWith("data: ")).map((l: string) => JSON.parse(l.slice(6)) as Any).find((e: Any) => e.type === "done");
  chk("M3.2", done && done.result.conversationId !== ownerConv && (await msgCount(ownerConv)) === ownerMsgs0,
    `mobile chat/send as STAFF with the OWNER's conversationId → answered in a NEW conversation of the STAFF; OWNER's conversation untouched (${ownerMsgs0}→${await msgCount(ownerConv)} messages)`);

  // ═══ S — model context (sendMessage) ═══
  console.log("\n── S model context ──");
  const sH = await svc.sendMessage({ tenantId: tA, actor: act(staffAi) }, { conversationId: ownerConv, text: "สรุปที่คุยไว้หน่อย" }, { provider: new Scripted([{ text: "$HISTORY" }]) });
  chk("S1.1", !has(sH.reply, PHONE) && sH.conversationId !== ownerConv && (await msgCount(ownerConv)) === ownerMsgs0,
    `[= R1.3] STAFF sendMessage with the OWNER's conversationId + a model that quotes history → phone=${has(sH.reply, PHONE)} · same conversation=${sH.conversationId === ownerConv}`);
  const sHL = await svc.sendMessage({ tenantId: tA, actor: act(staffAi) }, { conversationId: legacy, text: "สรุปห้องเดิม" }, { provider: new Scripted([{ text: "$HISTORY" }]) });
  chk("S1.2", !has(sHL.reply, LEGACY) && sHL.conversationId !== legacy, `STAFF continues the legacy conversation → secret=${has(sHL.reply, LEGACY)} same=${sHL.conversationId === legacy}`);
  const sO2 = await svc.sendMessage({ tenantId: tA, actor: act(owner2) }, { conversationId: ownerConv, text: "สรุปหน่อย" }, { provider: new Scripted([{ text: "$HISTORY" }]) });
  chk("S1.3", !has(sO2.reply, PHONE) && sO2.conversationId !== ownerConv, `a second OWNER continues the first OWNER's conversation → phone=${has(sO2.reply, PHONE)} (creator only)`);
  const sOL = await svc.sendMessage({ tenantId: tA, actor: act(owner) }, { conversationId: legacy, text: "สรุปห้องเดิม" }, { provider: new Scripted([{ text: "$HISTORY" }]) });
  const sOO = await svc.sendMessage({ tenantId: tA, actor: act(owner) }, { conversationId: ownerConv, text: "สรุปของฉัน" }, { provider: new Scripted([{ text: "$HISTORY" }]) });
  chk("S2.1", has(sOL.reply, LEGACY) && sOL.conversationId === legacy && has(sOO.reply, PHONE) && sOO.conversationId === ownerConv, `positive: OWNER continues the legacy conversation and own conversation with full history`);
  const sSS = await svc.sendMessage({ tenantId: tA, actor: act(staffAi) }, { conversationId: staffConv, text: "สรุปของฉัน" }, { provider: new Scripted([{ text: "$HISTORY" }]) });
  chk("S2.2", sSS.conversationId === staffConv && has(sSS.reply, `สวัสดีจากพนักงาน ${TAG}`), `positive: STAFF continues own conversation with own history`);

  // ═══ K — REST API keys ═══
  console.log("\n── K REST API keys ──");
  const kGen = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-gen`, {});
  const kGen2 = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-gen2`, {});
  const post = async (raw: string, name: string, args: Any, conversationId?: string) => {
    const r = await R.tools.POST(new Request(`http://qc.invalid/api/v1/ai/tools/${name}`, { method: "POST", headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" }, body: j({ args, ...(conversationId ? { conversationId } : {}) }) }), { params: Promise.resolve({ name }) });
    return { status: r.status as number, body: (await r.json()) as Any };
  };
  const k1 = await post(kGen.rawKey, "schedule_task", { instruction: `คีย์ ${TAG}`, hourBkk: 6 });
  const keyConv = k1.body.conversationId as string;
  const keyProp = ((await P.aiProposal.findFirst({ where: { tenantId: tA, conversationId: keyConv } })) as Any)?.id as string;
  const oList2 = await mList(owner);
  const sList3 = await mList(staffAi);
  const wOK = await web(owner, () => AIA.listPendingProposalsAction(keyConv));
  chk("K1.1", k1.status === 200 && Boolean(keyProp) && oList2.includes(keyConv) && wOK.some((p: Any) => p.id === keyProp) && !sList3.includes(keyConv),
    `positive (documented flow "the owner confirms in the app"): key proposal ${k1.status} → OWNER lists the key's conversation=${oList2.includes(keyConv)} and its card=${wOK.length} · STAFF lists it=${sList3.includes(keyConv)}`);
  const pBefore = await P.aiProposal.count({ where: { tenantId: tA, conversationId: ownerConv } });
  const k2 = await post(kGen.rawKey, "schedule_task", { instruction: `แทรก ${TAG}`, hourBkk: 6 }, ownerConv);
  const pAfter = await P.aiProposal.count({ where: { tenantId: tA, conversationId: ownerConv } });
  chk("K1.2", k2.status === 404 && pAfter === pBefore, `REST key passes the OWNER's conversationId → ${k2.status} (not found) · proposals dropped into the OWNER's conversation ${pBefore}→${pAfter}`);
  const k3 = await post(kGen2.rawKey, "schedule_task", { instruction: `คีย์สอง ${TAG}`, hourBkk: 6 }, keyConv);
  const k5 = await post(kGen.rawKey, "schedule_task", { instruction: `ห้องเดิม ${TAG}`, hourBkk: 6 }, legacy);
  chk("K1.3", k3.status === 404 && k5.status === 404, `another key with this key's conversationId → ${k3.status} · key with a legacy conversationId → ${k5.status}`);
  const k4 = await post(kGen.rawKey, "schedule_task", { instruction: `ต่อห้องตัวเอง ${TAG}`, hourBkk: 7 }, keyConv);
  chk("K1.4", k4.status === 200 && k4.body.conversationId === keyConv, `positive: the key continues its own conversation → ${k4.status}`);
  const wOKC = await web(owner, () => AIA.confirmProposalAction(keyProp));
  const keyProp2 = ((await P.aiProposal.findFirst({ where: { tenantId: tA, conversationId: keyConv, status: "PENDING" } })) as Any)?.id as string;
  const wSKC = await web(staffAi, () => AIA.confirmProposalAction(keyProp2));
  chk("K1.5", wOKC.ok && !wSKC.ok, `OWNER confirms the key's proposal → ${wOKC.ok ? "ok" : wOKC.note} (positive) · STAFF with the confirm key → ${wSKC.ok ? "EXECUTED" : "refused"}`);

  // ═══ A — member-assistant page (session) ═══
  console.log("\n── A member assistant ──");
  const aS: Any = await web(staffMem, () => MAA.sendMemberAssistantAction(M, ownerConv, "สรุปให้หน่อย"));
  chk("A1.1", aS.ok && aS.data.conversationId !== ownerConv && !has(aS.data, PHONE), `STAFF (member read) sends on the member assistant with the OWNER's conversation id → state of OWNER's conversation=${aS.data?.conversationId === ownerConv} phone=${has(aS.data, PHONE)} ${aS.ok ? "" : aS.reason}`);
  const aC: Any = await web(staffMem, () => MAA.confirmMemberProposalAction(M, ownerConv, oProps[2], false));
  const aX: Any = await web(staffMem, () => MAA.cancelMemberProposalAction(M, ownerConv, oProps[2]));
  chk("A1.2", !aC.ok && !aX.ok && (await status("aiProposal", oProps[2]!)) === "PENDING" && !has(aC.state, PHONE), `STAFF confirm/cancel the OWNER's proposal through the member assistant → ${aC.ok}/${aX.ok} · row ${await status("aiProposal", oProps[2]!)}`);
  const aN: Any = await web(staffMem, () => MAA.sendMemberAssistantAction(M, null, `สวัสดี ${TAG}`));
  const aN2: Any = aN.ok ? await web(staffMem, () => MAA.sendMemberAssistantAction(M, aN.data.conversationId, "ต่อ")) : aN;
  chk("A2.1", aN.ok && aN2.ok && aN2.data.conversationId === aN.data.conversationId && aN2.data.messages.length === 4, `positive: STAFF's own member-assistant conversation continues (${aN2.data?.messages?.length} messages)`);

  // ═══ Y — scheduled task (system actor) ═══
  console.log("\n── Y scheduled ──");
  const yS = await svc.sendMessage({ tenantId: tA, actor: ACT.aiSystemActor(tA, "scheduled-task") }, { text: `สรุปประจำวัน ${TAG}` }, { provider: new Scripted([{ text: "สรุปแล้ว" }]) });
  const yO = await mList(owner);
  const yST = await mList(staffAi);
  chk("Y1.1", yS.ok && yO.includes(yS.conversationId) && !yST.includes(yS.conversationId), `scheduled-task conversation: OWNER lists it=${yO.includes(yS.conversationId)} (no human creator ⇒ OWNER) · STAFF lists it=${yST.includes(yS.conversationId)}`);

  // ═══ O — ops counts ═══
  const checklist = (await drip.onboardingChecklist({ tenantId: tA })) as Any[];
  chk("O1.1", checklist.find((x) => x.key === "triedAi")?.done === true, `positive: onboarding "tried AI" (a count over the shop's conversations) still true`);

  // ═══ F — shop memory (D1) — evidence ═══
  console.log("\n── F shop memory ──");
  await svc.sendMessage({ tenantId: tA, actor: act(owner) }, { text: "จำลูกค้าคนนี้ไว้" }, { provider: new Scripted([{ toolCalls: [{ id: "f1", name: "customer_search", args: { query: "สมาชิก" } }] }, { toolCalls: [{ id: "f2", name: "remember_fact", args: { content: `ลูกค้าประจำ คุณสอง โทร ${PHONE}` } }] }, { text: "จำแล้ว" }]) });
  const fS = await svc.sendMessage({ tenantId: tA, actor: act(staffAi) }, { text: "ร้านเรามีอะไรบ้าง" }, { provider: new Scripted([{ text: "$SYSTEM" }]) });
  info("F1.1", `FINDING (not this card): the OWNER's model stored a tool-derived phone with remember_fact → it is in the STAFF's system prompt = ${has(fS.reply, PHONE)} (AiMemory is per shop, injected into every prompt; list_memories is open)`);
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
  const pass = res.filter((r) => r.ok).length;
  console.log(`\nJSON_SUMMARY ${j({ pass, total: res.length, red: res.filter((r) => !r.ok).map((r) => r.id) })}`);
  await prisma.$disconnect();
  process.exit(res.every((r) => r.ok) ? 0 : 1);
}
