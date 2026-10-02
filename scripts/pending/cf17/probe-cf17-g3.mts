// probe — CRM C5.5-G3 (shop memory · contact-data guard · support push targeting · OWNER latest room · LIKE escape).
//   ✅ = the secure / intended property holds · ❌ = leak or regression reproduced · ℹ️ = evidence, not counted.
//   M* AI memory through the real tools (remember_fact / list_memories / forget_fact) and the real prompt (sendMessage + a model that
//      echoes its system prompt) · K* kb_auto_save → kb_search · P* support reply push (fetch to Expo captured) · L* OWNER web sheet
//      latest room (loadAiChatAction under a session cookie) · E* LIKE escape of the creator prefix.
//   Same file on both trees (608204d3 for RED). Scripted model only; fetch to Expo captured, everything else blocked. QC3 only.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf17/probe-cf17-g3.mts
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
// Expo push requests are captured (tokens only); every other network call is blocked
const PUSHED: string[] = [];
globalThis.fetch = (async (url: Any, init?: Any) => {
  if (String(url).includes("exp.host")) {
    const msgs = JSON.parse(String(init?.body ?? "[]")) as Any[];
    for (const m of msgs) PUSHED.push(`${m.to}|${m.body ?? ""}`);
    return new Response(JSON.stringify({ data: msgs.map(() => ({ status: "ok", id: "qc" })) }), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error("network blocked");
}) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-cf17-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);
const j = (v: unknown) => JSON.stringify(v);
const cut = (v: unknown, n = 140) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const has = (s: unknown, x: string) => (typeof s === "string" ? s : j(s)).includes(x);
const USERS: string[] = [];
const TENANTS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const svc = (await import("@/lib/ai/service" as string)) as Any;
const tools = (await import("@/lib/ai/tools" as string)) as Any;
const ACT = (await import("@/lib/ai/actor" as string)) as Any;
const CO = (await import("@/lib/ai/conversation-owner" as string)) as Any;
const AIA = (await import("@/lib/ai/actions" as string)) as Any;
const support = (await import("@/lib/platform/support" as string)) as Any;
const keySvc = (await import("@/lib/api-keys/service" as string)) as Any;
const TOOLS_ROUTE = (await import("../../../src/app/api/v1/ai/tools/[name]/route.ts" as string)) as Any;
const mkUser = async (suffix: string, id?: string) => {
  const u = await P.user.create({ data: { ...(id ? { id } : {}), email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
  USERS.push(u.id);
  return u.id as string;
};
const ROLE: Record<string, string> = {};
const PERMS: Record<string, Record<string, boolean>> = {};
const member = async (uid: string, tid: string, role: string, permissions: Record<string, boolean>) => {
  ROLE[`${tid}:${uid}`] = role;
  PERMS[`${tid}:${uid}`] = permissions;
  await P.membership.create({ data: { userId: uid, tenantId: tid, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
};
const act = (tid: string, uid: string) => ACT.aiMemberActor(tid, uid, { role: ROLE[`${tid}:${uid}`], unitAccess: ["*"], permissions: PERMS[`${tid}:${uid}`] });
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf17", "x-forwarded-for": "203.0.113.197" } });
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
    if (step.text === "$SYSTEM") return { text: `system: ${messages.find((m: Any) => m.role === "system")?.content ?? ""}`, tokensIn: 1, tokensOut: 1, model: "scripted" };
    return { text: step.text ?? "", toolCalls: step.toolCalls, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}
const thaiId = (b: string) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(b[i]) * (13 - i); return b + String((11 - (s % 11)) % 10); };
const isErr = (out: string) => { try { return typeof (JSON.parse(out) as Any)?.error === "string"; } catch { return false; } };

try {
  // ═══ world ═══
  const tA = (await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } })).id as string;
  const tB = (await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } })).id as string;
  TENANTS.push(tA, tB);
  const owner = await mkUser("-owner");
  const staffA = await mkUser("-sa");
  const staffB = await mkUser("-sb");
  const demo = await mkUser("-demoted");
  const dual = await mkUser("-dual"); // STAFF of A, OWNER of B
  const staffOfB = await mkUser("-bstaff");
  const AI = { "ai.chat.send": true };
  await member(owner, tA, "OWNER", {});
  await member(staffA, tA, "STAFF", AI);
  await member(staffB, tA, "STAFF", AI);
  await member(demo, tA, "OWNER", {});
  await member(dual, tA, "STAFF", AI);
  await member(dual, tB, "OWNER", {});
  await member(staffOfB, tB, "STAFF", AI);
  for (const t of [tA, tB]) await P.aiCreditWallet.create({ data: { tenantId: t, balanceMicro: 50_000_000, grantedAt: new Date() } });
  const rt = (tid: string, uid: string, name: string, args: Any = {}) => tools.runTool({ tenantId: tid, actor: act(tid, uid) }, name, args) as Promise<string>;
  const prompt = async (tid: string, uid: string) => String((await svc.sendMessage({ tenantId: tid, actor: act(tid, uid) }, { text: "สวัสดี" }, { provider: new Scripted([{ text: "$SYSTEM" }]) })).reply);
  const memIds = async (tid: string) => ((await P.aiMemory.findMany({ where: { tenantId: tid }, select: { id: true, content: true } })) as Any[]);

  // ═══ M1 shared memories (written by an OWNER) — contact-data guard ═══
  console.log("\n── M1 OWNER shop facts + contact-data guard ──");
  const PHONE = "0899000102";
  const r1 = await rt(tA, owner, "remember_fact", { content: `ลูกค้าประจำ คุณสอง โทร ${PHONE}` });
  const pS = await prompt(tA, staffA);
  const lS = await rt(tA, staffA, "list_memories");
  chk("M1.1", !has(pS, PHONE) && !has(lS, PHONE) && isErr(r1), `[= review X7.1] OWNER remember_fact with a phone → refused (${cut(r1, 90)}) · STAFF prompt has it=${has(pS, PHONE)} · STAFF list_memories=${has(lS, PHONE)}`);
  const tid13 = thaiId("110370234567");
  const contact = [
    "089-900-0102", "089 900 0103", "๐๘๙๙๐๐๐๑๐๔", "+66 89 900 0105", "+66899000106", "02-123-4567", "(02) 123 4568", "โทร.0899000107",
    "somchai.qc@example.co.th", `บัตร ${tid13}`, `บัตร ${tid13.slice(0, 1)}-${tid13.slice(1, 5)}-${tid13.slice(5, 10)}-${tid13.slice(10, 12)}-${tid13.slice(12)}`,
  ];
  const before = (await memIds(tA)).length;
  const refused: string[] = [];
  for (const c of contact) if (isErr(await rt(tA, owner, "remember_fact", { content: `ลูกค้า ${c}` }))) refused.push(c);
  const after = (await memIds(tA)).length;
  chk("M1.2", refused.length === contact.length && after === before, `OWNER shop fact with phone / e-mail / Thai ID (Thai digits, separators, +66, landline, checksum ID) → refused ${refused.length}/${contact.length} · rows ${before}→${after} · not refused: ${j(contact.filter((c) => !refused.includes(c)))}`);
  const benign = ["ออเดอร์ SO-2026-0001 ส่งพรุ่งนี้", "เลขที่ใบเสร็จ INV-20261002-0042", "ราคากาแฟ 1,250.50 บาท", "เปิด 09:00-18:00 น.", "หยุดวันที่ 02/10/2026", "เริ่ม 2026-10-02", "ยอดเป้า 125000 บาท", "บาร์โค้ด 8850999220017"];
  const stored: string[] = [];
  for (const b of benign) if (!isErr(await rt(tA, owner, "remember_fact", { content: b }))) stored.push(b);
  const pS2 = await prompt(tA, staffA);
  chk("M1.3", stored.length === benign.length && benign.every((b) => pS2.includes(b)), `positive (false-positive controls): order numbers, prices, times, dates, barcode remembered by the OWNER ${stored.length}/${benign.length} and in the STAFF prompt=${benign.every((b) => pS2.includes(b))}`);

  // ═══ M2 private memories (written by a non-OWNER) ═══
  console.log("\n── M2 private memories ──");
  const PRIV = "ลูกค้าของฉัน คุณหนึ่ง 0811111111";
  const rP = await rt(tA, staffA, "remember_fact", { content: PRIV });
  const pA = await prompt(tA, staffA);
  const lA = await rt(tA, staffA, "list_memories");
  chk("M2.1", !isErr(rP) && pA.includes(PRIV) && has(lA, PRIV), `positive: STAFF A's own memory (contact data allowed — private) is stored, in A's prompt and A's list (${cut(rP, 60)})`);
  const pB = await prompt(tA, staffB);
  const lB = await rt(tA, staffB, "list_memories");
  const pO = await prompt(tA, owner);
  const lO = await rt(tA, owner, "list_memories");
  chk("M2.2", !pB.includes(PRIV) && !has(lB, PRIV) && !pO.includes(PRIV) && !has(lO, PRIV), `STAFF A's private memory reaches STAFF B prompt=${pB.includes(PRIV)} list=${has(lB, PRIV)} · OWNER prompt=${pO.includes(PRIV)} list=${has(lO, PRIV)}`);
  const privRow = (await memIds(tA)).find((m) => m.content === PRIV);
  const fB = await rt(tA, staffB, "forget_fact", { id: privRow?.id });
  const fB2 = await rt(tA, staffB, "forget_fact", { contentContains: "คุณหนึ่ง" });
  const fO = await rt(tA, owner, "forget_fact", { id: privRow?.id });
  const still = await P.aiMemory.count({ where: { id: privRow?.id ?? "none" } });
  chk("M2.3", Boolean(privRow) && still === 1 && isErr(fB) && isErr(fB2) && isErr(fO), `STAFF B / OWNER forget STAFF A's private memory (by id / by text) → refused, row kept=${still === 1}`);
  // ═══ M3 roles and tenants ═══
  console.log("\n── M3 roles / tenants ──");
  const F1 = `ข้อเท็จจริงร้านจากเจ้าของ ${TAG}`;
  await rt(tA, demo, "remember_fact", { content: F1 });
  await P.membership.updateMany({ where: { userId: demo, tenantId: tA }, data: { role: "STAFF", permissions: AI } });
  ROLE[`${tA}:${demo}`] = "STAFF";
  PERMS[`${tA}:${demo}`] = AI;
  const F2 = `บันทึกส่วนตัวหลังถูกลดสิทธิ์ ${TAG}`;
  await rt(tA, demo, "remember_fact", { content: F2 });
  const pS3 = await prompt(tA, staffA);
  const pO3 = await prompt(tA, owner);
  chk("M3.1", pS3.includes(F1) && !pO3.includes(F2) && !pS3.includes(F2), `OWNER demoted to STAFF: the fact written as OWNER stays a shop fact (STAFF sees=${pS3.includes(F1)}) · what they write after the demotion is private (OWNER sees=${pO3.includes(F2)} · STAFF sees=${pS3.includes(F2)})`);
  const FB = `ข้อเท็จจริงร้านบี ${TAG}`;
  const PA = `บันทึกของ dual ในร้านเอ ${TAG}`;
  await rt(tB, dual, "remember_fact", { content: FB });
  await rt(tA, dual, "remember_fact", { content: PA });
  const pDualA = await prompt(tA, dual);
  const pDualB = await prompt(tB, dual);
  const pBstaff = await prompt(tB, staffOfB);
  const pAstaff = await prompt(tA, staffA);
  chk("M3.2", pDualA.includes(PA) && !pDualA.includes(FB) && pDualB.includes(FB) && !pDualB.includes(PA) && pBstaff.includes(FB) && !pBstaff.includes(PA) && !pAstaff.includes(PA) && !pAstaff.includes(FB),
    `same user STAFF in A / OWNER in B: A prompt has own A note=${pDualA.includes(PA)} B fact=${pDualA.includes(FB)} · B prompt has B fact=${pDualB.includes(FB)} A note=${pDualB.includes(PA)} · B staff sees B fact=${pBstaff.includes(FB)} · A staff sees neither=${!pAstaff.includes(PA) && !pAstaff.includes(FB)}`);

  // ═══ M4 legacy (plain id) shop memories ═══
  console.log("\n── M4 legacy memories ──");
  const LCLEAN = `ร้านหยุดทุกวันจันทร์ ${TAG}`;
  const LCONT = "ลูกค้า VIP เก่า โทร 0899000177";
  const lc = await P.aiMemory.create({ data: { tenantId: tA, content: LCLEAN } });
  const lx = await P.aiMemory.create({ data: { tenantId: tA, content: LCONT } });
  const pS4 = await prompt(tA, staffA);
  const lS4 = await rt(tA, staffA, "list_memories");
  const pO4 = await prompt(tA, owner);
  const lO4 = await rt(tA, owner, "list_memories");
  chk("M4.1", pS4.includes(LCLEAN) && has(lS4, LCLEAN) && !pS4.includes("0899000177") && !has(lS4, "0899000177"), `legacy shop memories for STAFF: clean fact shown=${pS4.includes(LCLEAN)} · fact with contact data hidden (prompt=${pS4.includes("0899000177")} list=${has(lS4, "0899000177")})`);
  chk("M4.2", pO4.includes(LCLEAN) && pO4.includes("0899000177") && has(lO4, "0899000177"), `positive: OWNER still sees both legacy facts (prompt + list)`);
  const fS = await rt(tA, staffA, "forget_fact", { id: lc.id });
  const keptL = await P.aiMemory.count({ where: { id: lc.id } });
  const fOL = await rt(tA, owner, "forget_fact", { id: lx.id });
  const goneL = await P.aiMemory.count({ where: { id: lx.id } });
  chk("M4.3", isErr(fS) && keptL === 1 && !isErr(fOL) && goneL === 0, `STAFF forgets a shop fact → refused (kept=${keptL === 1}) · OWNER forgets the legacy fact with contact data → ${cut(fOL, 50)}`);
  const fA = await rt(tA, staffA, "forget_fact", { id: privRow?.id });
  chk("M4.4", !isErr(fA) && (await P.aiMemory.count({ where: { id: privRow?.id ?? "none" } })) === 0, `positive: STAFF A forgets own private memory → ${cut(fA, 50)}`);

  // ═══ M5 memories written by an internal job ═══
  const SYSF = `งานประจำจำไว้ ${TAG}`;
  const sysOut = await tools.runTool({ tenantId: tA, actor: ACT.aiSystemActor(tA, "scheduled-task") }, "remember_fact", { content: SYSF });
  if (isErr(sysOut)) info("M5.1", `scheduled-task actor cannot call remember_fact (${cut(sysOut, 70)}) — no system-written memories to test`);
  else {
    const lS5 = await rt(tA, staffA, "list_memories");
    const lO5 = await rt(tA, owner, "list_memories");
    chk("M5.1", !has(lS5, SYSF) && has(lO5, SYSF), `memory written by the scheduled job: STAFF list=${has(lS5, SYSF)} · OWNER list=${has(lO5, SYSF)} (OWNER only)`);
  }

  // ═══ K kb_auto_save ═══
  console.log("\n── K kb_auto_save ──");
  const k1 = await rt(tA, owner, "kb_auto_save", { title: `ลูกค้า VIP ${TAG}`, content: `ติดต่อ ${PHONE}` });
  const ks = await rt(tA, staffA, "kb_search", { query: `ลูกค้า VIP ${TAG}` });
  const k2 = await rt(tA, owner, "kb_auto_save", { title: `นโยบายคืนสินค้า ${TAG}`, content: "คืนได้ภายใน 7 วัน ราคา 1,250 บาท ใบเสร็จ INV-20261002-0042" });
  chk("K1.1", isErr(k1) && !has(ks, PHONE), `kb_auto_save with a phone → refused (${cut(k1, 80)}) · STAFF kb_search sees it=${has(ks, PHONE)}`);
  chk("K1.2", !isErr(k2), `positive: kb_auto_save without contact data (price, receipt number) → saved (${cut(k2, 60)})`);

  // ═══ P support reply push ═══
  console.log("\n── P support push ──");
  const staffConv = (await svc.sendMessage({ tenantId: tA, actor: act(tA, staffA) }, { text: "เครื่องพิมพ์เสีย" }, { provider: new Scripted([{ text: "รับเรื่อง" }]) })).conversationId as string;
  const legacyConv = (await P.aiConversation.create({ data: { tenantId: tA, title: "ห้องเดิม" } })).id as string;
  const tok = (u: string) => `ExponentPushToken[${TAG}-${u.slice(-6)}]`;
  for (const u of [owner, staffA, staffB]) await P.pushDevice.create({ data: { userId: u, tenantId: tA, expoToken: tok(u), platform: "ios" } });
  const mkCase = async (conversationId: string, n: number) => (await P.supportCase.create({ data: { tenantId: tA, caseNo: 900000 + n, openedByUserId: staffA, subject: "qc", conversationId } })).id as string;
  const pu = { id: `${TAG}-pu`, email: "qc@qc.invalid", role: "SUPPORT" };
  PUSHED.length = 0;
  await support.addPlatformMessage(pu, await mkCase(staffConv, 1), "แก้ให้แล้ว ลองพิมพ์ใหม่");
  const sent1 = [...PUSHED];
  chk("P1.1", sent1.length === 1 && sent1[0]!.startsWith(tok(staffA)), `support reply in STAFF A's room → pushed to ${sent1.length} device(s) · STAFF A only=${sent1.length === 1 && sent1[0]!.startsWith(tok(staffA))} · body carried="${cut(sent1[0]?.split("|")[1], 40)}"`);
  PUSHED.length = 0;
  await support.addPlatformMessage(pu, await mkCase(legacyConv, 2), "ตอบห้องเดิม");
  const sent2 = [...PUSHED];
  chk("P1.2", sent2.length === 1 && sent2[0]!.startsWith(tok(owner)), `support reply in a legacy room → pushed to ${sent2.length} device(s) · OWNER only=${sent2.length === 1 && sent2[0]!.startsWith(tok(owner))}`);

  // ═══ L OWNER's web sheet: latest room ═══
  console.log("\n── L latest room ──");
  const ckO = await sessionCookie(owner, tA);
  const ownRoom = (await svc.sendMessage({ tenantId: tA, actor: act(tA, owner) }, { text: "ห้องของเจ้าของ" }, { provider: new Scripted([{ text: "ตอบ" }]) })).conversationId as string;
  const kGen = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-gen`, {});
  const kr = await TOOLS_ROUTE.POST(new Request("http://qc.invalid/api/v1/ai/tools/schedule_task", { method: "POST", headers: { authorization: `Bearer ${kGen.rawKey}`, "content-type": "application/json" }, body: j({ args: { instruction: "คีย์", hourBkk: 4 } }) }), { params: Promise.resolve({ name: "schedule_task" }) });
  const keyRoom = ((await kr.json()) as Any).conversationId as string;
  const sysRoom = (await svc.sendMessage({ tenantId: tA, actor: ACT.aiSystemActor(tA, "scheduled-task") }, { text: "สรุป" }, { provider: new Scripted([{ text: "สรุปแล้ว" }]) })).conversationId as string;
  const lo: Any = await inScope(ckO, "/app", () => AIA.loadAiChatAction());
  chk("L1.1", lo.conversationId === ownRoom, `OWNER opens the sheet after a key room and a scheduled room were created → ${lo.conversationId === ownRoom ? "own room" : lo.conversationId === keyRoom ? "the KEY room" : lo.conversationId === sysRoom ? "the SCHEDULED room" : lo.conversationId}`);
  const freshOwner = await mkUser("-ownerb2"); // an OWNER of B who has never chatted (the earlier prompts opened rooms for `dual`)
  await member(freshOwner, tB, "OWNER", {});
  const ckD = await sessionCookie(freshOwner, tB);
  const kB = await keySvc.createApiKey({ tenantId: tB }, `${TAG}-genb`, {});
  const krB = await TOOLS_ROUTE.POST(new Request("http://qc.invalid/api/v1/ai/tools/schedule_task", { method: "POST", headers: { authorization: `Bearer ${kB.rawKey}`, "content-type": "application/json" }, body: j({ args: { instruction: "คีย์บี", hourBkk: 4 } }) }), { params: Promise.resolve({ name: "schedule_task" }) });
  const keyRoomB = ((await krB.json()) as Any).conversationId as string;
  const lb: Any = await inScope(ckD, "/app", () => AIA.loadAiChatAction());
  const listB = (await inScope(ckD, "/app", () => AIA.listPendingProposalsAction(keyRoomB))) as Any[];
  chk("L1.2", lb.conversationId === null && listB.length === 1, `an OWNER with no room of their own but a key room → sheet opens a new room (conv=${lb.conversationId === keyRoomB ? "the KEY room" : lb.conversationId}) · the key room stays reachable by id (cards=${listB.length})`);

  // ═══ E LIKE escape of the creator prefix ═══
  console.log("\n── E LIKE escape ──");
  const uWild = await mkUser("-w", `${TAG.replace(/-/g, "x")}a_c`);
  const uNear = await mkUser("-n", `${TAG.replace(/-/g, "x")}abc`);
  await member(uWild, tB, "STAFF", AI);
  await member(uNear, tB, "STAFF", AI);
  await P.aiConversation.create({ data: { id: `u~${uNear}~e1`, tenantId: tB, title: "near" } });
  await P.aiConversation.create({ data: { id: `u~${uWild}~e2`, tenantId: tB, title: "own" } });
  const rows = (await P.aiConversation.findMany({ where: { tenantId: tB, ...CO.visibleConversationWhere(CO.sightOf({ tenantId: tB, actor: act(tB, uWild) })) }, select: { id: true } })) as Any[];
  chk("E1.1", rows.length === 1 && rows[0].id === `u~${uWild}~e2`, `DB filter for a user id containing "_" returns only that user's rooms (no wildcard match on a near id) → ${rows.length} row(s)`);
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
    await P.pushDevice.deleteMany({ where: { userId: id } }).catch(() => undefined);
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
