// review probe — CRM C6.0 (merge of origin/main hotfixes into session/crm) · independent reviewer
//   Adversarial checks of the MERGED /api/v1/ai/* and mobile AI conversation routes (both sides' guards together):
//   A  /api/v1/ai/* — general key (allowed path) · scoped key · system-bound key (header mismatch) · malformed scopesJson ·
//      general key on another key's / a member's / a legacy / another shop's room · G1 refusals · "denied = nothing written"
//   M  /api/mobile/* — STAFF without ai.chat.send (every AI door) · STAFF+ai.chat.send own room vs someone else's room (G2) ·
//      OWNER sees key rooms but not staff rooms · token user not a member of X-Tenant-Id
//   ✅ = property holds · ❌ = finding · ℹ️ = evidence only (not counted)
// QC3 only (host checked) · scripted/no network · throwaway tenants swept in finally.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c60/review/probe-c60-review.mts
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
const TAG = `qc-c60r-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);
const j = (v: unknown) => JSON.stringify(v);
const cut = (v: unknown, n = 160) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const USERS: string[] = [];
const TENANTS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const keySvc = (await import("@/lib/api-keys/service" as string)) as Any;
const scopesMod = (await import("@/lib/api-keys/scopes" as string)) as Any;
const ACT = (await import("@/lib/ai/actor" as string)) as Any;
const TA = (await import("@/lib/ai/tool-access" as string)) as Any;
const mobAuth = (await import("@/lib/mobile/auth" as string)) as Any;
const R = {
  skills: (await import("../../../../src/app/api/v1/ai/skills/route.ts" as string)) as Any,
  skill: (await import("../../../../src/app/api/v1/ai/skills/[id]/route.ts" as string)) as Any,
  tools: (await import("../../../../src/app/api/v1/ai/tools/[name]/route.ts" as string)) as Any,
  convs: (await import("../../../../src/app/api/mobile/conversations/route.ts" as string)) as Any,
  conv: (await import("../../../../src/app/api/mobile/conversations/[id]/route.ts" as string)) as Any,
  msgs: (await import("../../../../src/app/api/mobile/conversations/[id]/messages/route.ts" as string)) as Any,
  read: (await import("../../../../src/app/api/mobile/conversations/[id]/read/route.ts" as string)) as Any,
  send: (await import("../../../../src/app/api/mobile/chat/send/route.ts" as string)) as Any,
  welcome: (await import("../../../../src/app/api/mobile/chat/welcome/route.ts" as string)) as Any,
  props: (await import("../../../../src/app/api/mobile/proposals/route.ts" as string)) as Any,
  usage: (await import("../../../../src/app/api/mobile/usage/route.ts" as string)) as Any,
};
type Res = { status: number; text: string; body: Any };
const toRes = async (r: Response): Promise<Res> => {
  const text = await r.text().catch(() => "");
  let body: Any = {};
  try { body = JSON.parse(text); } catch { /* stream / not JSON */ }
  return { status: r.status, text, body };
};
const kh = (key?: string, extra: Record<string, string> = {}) => ({ ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json", ...extra });
const listSkills = async (key: string) => toRes(await R.skills.GET(new Request("http://qc.invalid/api/v1/ai/skills", { headers: kh(key) })));
const oneSkill = async (key: string, id: string) => toRes(await R.skill.GET(new Request(`http://qc.invalid/api/v1/ai/skills/${id}`, { headers: kh(key) }), { params: Promise.resolve({ id }) }));
const tool = async (key: string | undefined, name: string, body: Any = {}, extra: Record<string, string> = {}) =>
  toRes(await R.tools.POST(new Request(`http://qc.invalid/api/v1/ai/tools/${name}`, { method: "POST", headers: kh(key, extra), body: j(body) }), { params: Promise.resolve({ name }) }));
const skillIds = (r: Res): string[] => ((r.body?.skills ?? []) as Any[]).map((s) => String(s.id));
const coreOf = (r: Res): string[] => ((r.body?.core?.tools ?? []) as string[]);
const toolNames = (r: Res): string[] => ((r.body?.tools ?? []) as Any[]).map((t) => String(t?.function?.name));

try {
  // ── fixtures ──
  const tA = (await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } })).id as string;
  const tB = (await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } })).id as string;
  TENANTS.push(tA, tB);
  await P.businessUnit.create({ data: { tenantId: tA, type: "SHOP", name: "สาขา A", slug: `${TAG}-ua` } });
  await sysSvc.createSystem(tA, "POS", "ขาย A");
  const k1 = (await sysSvc.createSystem(tA, "KANBAN", "บอร์ด 1")).id as string;
  const k2 = (await sysSvc.createSystem(tA, "KANBAN", "บอร์ด 2")).id as string;
  const acc = (await sysSvc.createSystem(tA, "ACCOUNT", "สมุด")).id as string;
  await sysSvc.createSystem(tB, "POS", "ขาย B");
  const mkUser = async (k: string, role: string, permissions: Record<string, boolean>, tenantId = tA) => {
    const u = await P.user.create({ data: { email: `${TAG}-${k}@qc.invalid`, name: `QC ${k}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    return { id: u.id as string, tok: (await mobAuth.issueMobileToken(u.id)).token as string };
  };
  const U = {
    owner: await mkUser("owner", "OWNER", {}),
    staff: await mkUser("staff", "STAFF", {}),
    staffAi: await mkUser("staffai", "STAFF", { "ai.chat.send": true }),
    staffAi2: await mkUser("staffai2", "STAFF", { "ai.chat.send": true }),
    ownerB: await mkUser("ownerb", "OWNER", {}, tB),
  };
  await P.aiCreditWallet.create({ data: { tenantId: tA, balanceMicro: 50_000_000, grantedAt: new Date() } }).catch(() => undefined);
  const mk = async (tenantId: string, name: string, opts: Any = {}) => (await keySvc.createApiKey({ tenantId }, `${TAG} ${name}`, opts)) as { id: string; rawKey: string };
  const K = {
    gen: await mk(tA, "gen"),
    gen2: await mk(tA, "gen2"),
    scoped: await mk(tA, "kanban-read", { scopes: scopesMod.expandBundles(["kanban-read"]) }),
    kbBound: await mk(tA, "kb1-bound", { systemId: k1, scopes: scopesMod.expandBundles(["kanban-read"]) }),
    accBound: await mk(tA, "acc-bound-empty", { systemId: acc, scopes: [] }),
    malformed: await mk(tA, "malformed"),
    genB: await mk(tB, "genB"),
  };
  await P.apiKey.update({ where: { id: K.malformed.id }, data: { scopesJson: "account.doc.view" } });
  const countConv = async (t = tA) => (await P.aiConversation.count({ where: { tenantId: t } })) as number;
  const countMem = async (t = tA) => (await P.aiMemory.count({ where: { tenantId: t } }).catch(() => -1)) as number;

  // ═══ A1 general key — allowed path ═══
  console.log("\n── A1 general key (allowed path) ──");
  const gL = await listSkills(K.gen.rawKey);
  chk("A1.1", gL.status === 200 && skillIds(gL).includes("sales"), `general key /skills 200 lists sales → ${gL.status} ${skillIds(gL).join(",")}`);
  info("A1.1i", `general key core = ${coreOf(gL).join(",")}`);
  const gS = await oneSkill(K.gen.rawKey, "sales");
  chk("A1.2", gS.status === 200 && toolNames(gS).includes("sales_summary"), `general key /skills/sales 200 has sales_summary → ${gS.status} ${toolNames(gS).join(",")}`);
  const gT = await tool(K.gen.rawKey, "sales_summary");
  chk("A1.3", gT.status === 200 && gT.body.tool === "sales_summary" && "result" in gT.body, `general key tools/sales_summary → 200 result · ${gT.status} ${cut(gT.text, 90)}`);
  const writeTool = ((gS.body?.tools ?? []) as Any[]).find((t) => t.write)?.function?.name as string | undefined;
  info("A1.4i", `write tool offered to general key in sales skill: ${writeTool ?? "(none)"}`);
  let keyRoom = "";
  if (writeTool) {
    const w1 = await tool(K.gen.rawKey, writeTool, { args: {} });
    keyRoom = String(w1.body.conversationId ?? "");
    chk("A1.4", w1.status === 200 && w1.body.pendingConfirmation === true && keyRoom.startsWith(`k~${K.gen.id}~`), `general key write tool ${writeTool} → 200 pending + room stamped with the key (${w1.status} ${keyRoom.replace(K.gen.id, "<gen>")})`);
    const w2 = await tool(K.gen.rawKey, "sales_summary", { conversationId: keyRoom });
    chk("A1.5", w2.status === 200, `same key continues its own room → ${w2.status}`);
  } else {
    chk("A1.4", false, "no write tool listed for the general key — cannot open a key room");
  }

  // ═══ A2 room ownership (G2) on the merged route ═══
  console.log("\n── A2 rooms of others ──");
  const legacyRoom = (await P.aiConversation.create({ data: { tenantId: tA, title: "ห้องเดิม" } })).id as string;
  const ownerRoom = String((await toRes(await R.convs.POST(new Request("http://qc.invalid/api/mobile/conversations", { method: "POST", headers: { authorization: `Bearer ${U.owner.tok}`, "x-tenant-id": tA, "content-type": "application/json" }, body: j({ title: "ห้องเจ้าของ" }) })))).body.id ?? "");
  const roomMsgs = async (id: string) => ((await P.aiMessage.count({ where: { conversationId: id } })) as number) + ((await P.aiProposal.count({ where: { conversationId: id } }).catch(() => 0)) as number);
  const before = { key: keyRoom ? await roomMsgs(keyRoom) : 0, owner: await roomMsgs(ownerRoom) };
  for (const [label, key, room] of [
    ["gen2 → gen's key room", K.gen2.rawKey, keyRoom],
    ["gen → OWNER's member room", K.gen.rawKey, ownerRoom],
    ["gen → legacy creator-less room", K.gen.rawKey, legacyRoom],
    ["genB (other shop) → gen's key room", K.genB.rawKey, keyRoom],
  ] as const) {
    if (!room) continue;
    const r1 = await tool(key, "sales_summary", { conversationId: room });
    const r2 = writeTool ? await tool(key, writeTool, { args: {}, conversationId: room }) : r1;
    chk(`A2.${label.slice(0, 5)}`, r1.status === 404 && r1.body.code === "conversation_not_found" && r2.status === 404, `${label}: read+write tool → 404 conversation_not_found (${r1.status}/${r2.status})`);
  }
  const after = { key: keyRoom ? await roomMsgs(keyRoom) : 0, owner: await roomMsgs(ownerRoom) };
  chk("A2.nowrite", before.key === after.key && before.owner === after.owner, `nothing written into foreign rooms ${j(before)} → ${j(after)}`);

  // ═══ A3 scoped / bound / malformed keys ═══
  console.log("\n── A3 scoped · bound · malformed ──");
  const convBefore = await countConv();
  const memBefore = await countMem();
  for (const [label, key] of [["scoped kanban-read", K.scoped.rawKey], ["bound ACCOUNT scopes []", K.accBound.rawKey], ["bound KANBAN kanban-read", K.kbBound.rawKey], ["malformed scopesJson", K.malformed.rawKey]] as const) {
    const L = await listSkills(key);
    const S = await oneSkill(key, "sales");
    const T = await tool(key, "sales_summary");
    const Tw = writeTool ? await tool(key, writeTool, { args: {} }) : T;
    const Tr = keyRoom ? await tool(key, "sales_summary", { conversationId: keyRoom }) : T;
    chk(`A3.${label.split(" ")[0]}-list`, L.status === 200 && !skillIds(L).includes("sales") && coreOf(L).length === 0, `${label}: /skills hides sales, core [] → ${skillIds(L).join(",")} core=${coreOf(L).length}`);
    chk(`A3.${label.split(" ")[0]}-skill`, S.status === 404, `${label}: /skills/sales → 404 (${S.status})`);
    chk(`A3.${label.split(" ")[0]}-run`, T.status === 403 && T.body.code === "key_not_general" && Tw.status === 403, `${label}: tools/sales_summary + ${writeTool} → 403 key_not_general (${T.status} ${T.body.code}/${Tw.status})`);
    chk(`A3.${label.split(" ")[0]}-order`, Tr.status === 403, `${label}: with a foreign conversationId → 403 before the room lookup (no 404 existence oracle) (${Tr.status})`);
  }
  // system-bound key: header naming another system
  const kbMis = await tool(K.kbBound.rawKey, "kanban_list_boards", {}, { "x-shark-system": k2 });
  chk("A3.bound-mismatch", kbMis.status === 403, `bound KANBAN key + X-Shark-System of another board → 403 (${kbMis.status} ${cut(kbMis.text, 80)})`);
  const kbOk = await tool(K.kbBound.rawKey, "kanban_list_boards", {}, { "x-shark-system": k1 });
  const kbNo = await tool(K.kbBound.rawKey, "kanban_list_boards");
  chk("A3.bound-ok", kbOk.status === 200 && kbNo.status === 200, `positive control: bound key on its own board (header / no header) → 200 (${kbOk.status}/${kbNo.status})`);
  const kbWrite = await tool(K.scoped.rawKey, "kanban_create_card", { args: {} });
  chk("A3.scope-403", kbWrite.status === 403 && kbWrite.body.code !== "key_not_general", `kanban-read key → kanban_create_card 403 scope (not key_not_general) (${kbWrite.status} ${kbWrite.body.code ?? ""})`);
  const malMod = await tool(K.malformed.rawKey, "kanban_list_boards");
  info("A3.mal-mod", `malformed key → module tool kanban_list_boards ${malMod.status} ${cut(malMod.text, 90)} (module scope logic is main's, unchanged by the merge)`);
  // second line (699800d6): the executor itself refuses a malformed general-looking key
  const malActor = ACT.aiApiKeyActor({ tenantId: tA, keyId: "x", scopes: [], systemId: null, scopesMalformed: true });
  const genActor = ACT.aiApiKeyActor({ tenantId: tA, keyId: "y", scopes: [], systemId: null });
  chk("A3.actor", !ACT.isGeneralKeyActor(malActor) && ACT.isGeneralKeyActor(genActor) && !TA.toolVerdict(malActor, "sales_summary").ok && TA.toolVerdict(genActor, "sales_summary").ok,
    `isGeneralKeyActor/toolVerdict: malformed → refused, clean [] → allowed`);
  // G1 refusals for the general key (policy, not merge)
  const rf = await tool(K.gen.rawKey, "remember_fact", { args: { fact: `${TAG} secret` } });
  const fs = await tool(K.gen.rawKey, "financial_summary");
  chk("A3.g1", rf.status === 403 && fs.status === 403 && rf.body.code !== "key_not_general", `general key → remember_fact / financial_summary 403 (G1 rule) (${rf.status}/${fs.status})`);
  const convAfter = await countConv();
  const memAfter = await countMem();
  chk("A3.nowrite", convAfter === convBefore && memAfter === memBefore, `denied key calls opened no AI room / wrote no memory (conv ${convBefore}→${convAfter} · mem ${memBefore}→${memAfter})`);
  const unk = await tool(K.gen.rawKey, "no_such_tool_x");
  const noAuth = await tool(undefined, "sales_summary");
  chk("A3.misc", unk.status === 404 && noAuth.status === 401, `unknown tool 404 · no key 401 (${unk.status}/${noAuth.status})`);

  // ═══ M mobile ═══
  console.log("\n── M mobile AI doors ──");
  const mreq = (who: { tok: string }, method: string, body?: unknown, tenant = tA, path = "/api/mobile/x") =>
    new Request(`http://qc.invalid${path}`, { method, headers: { authorization: `Bearer ${who.tok}`, "x-tenant-id": tenant, "content-type": "application/json" }, body: body === undefined ? undefined : j(body) });
  const p = (id: string) => ({ params: Promise.resolve({ id }) });
  const st = async (pr: Promise<Response>) => { try { const r = await pr; const s = r.status; await r.text().catch(() => ""); return s; } catch (e) { return `throw:${cut((e as Error).message, 40)}`; } };
  const aiRoom = String((await toRes(await R.convs.POST(mreq(U.staffAi, "POST", { title: "ห้อง staffAi" })))).body.id ?? "");
  chk("M1.0", aiRoom.startsWith(`u~${U.staffAi.id}~`), `STAFF+ai.chat.send opens a room stamped with its user (${aiRoom.replace(U.staffAi.id, "<staffAi>")})`);
  await P.aiMessage.create({ data: { tenantId: tA, conversationId: aiRoom, role: "USER", content: `${TAG} ข้อความลับ` } });
  const no = {
    list: await st(R.convs.GET(mreq(U.staff, "GET"))),
    create: await st(R.convs.POST(mreq(U.staff, "POST", { title: "x" }))),
    rename: await st(R.conv.PATCH(mreq(U.staff, "PATCH", { title: "hacked" }), p(aiRoom))),
    del: await st(R.conv.DELETE(mreq(U.staff, "DELETE"), p(aiRoom))),
    msgs: await st(R.msgs.GET(mreq(U.staff, "GET"), p(aiRoom))),
    read: await st(R.read.POST(mreq(U.staff, "POST"), p(aiRoom))),
    send: await st(R.send.POST(mreq(U.staff, "POST", { text: "" }))),
    welcome: await st(R.welcome.POST(mreq(U.staff, "POST", {}))),
    props: await st(R.props.GET(mreq(U.staff, "GET", undefined, tA, `/api/mobile/proposals?conversationId=${encodeURIComponent(aiRoom)}`))),
    usage: await st(R.usage.GET(mreq(U.staff, "GET"))),
  };
  chk("M1.1", Object.values(no).every((s) => s === 403), `STAFF without ai.chat.send → 403 on every AI door ${j(no)}`);
  const ok = {
    list: await st(R.convs.GET(mreq(U.staffAi, "GET"))),
    send: await st(R.send.POST(mreq(U.staffAi, "POST", { text: "" }))),
    usage: await st(R.usage.GET(mreq(U.staffAi, "GET"))),
    props: await st(R.props.GET(mreq(U.staffAi, "GET", undefined, tA, `/api/mobile/proposals?conversationId=${encodeURIComponent(aiRoom)}`))),
  };
  chk("M1.2", Object.values(ok).every((s) => s === 200), `positive control STAFF+ai.chat.send → 200 ${j(ok)}`);
  // G2: another STAFF+ai cannot see/touch it
  const l2 = await toRes(await R.convs.GET(mreq(U.staffAi2, "GET")));
  const ids2 = ((l2.body.conversations ?? []) as Any[]).map((c) => String(c.id));
  const m2 = await toRes(await R.msgs.GET(mreq(U.staffAi2, "GET"), p(aiRoom)));
  const pa = await toRes(await R.conv.PATCH(mreq(U.staffAi2, "PATCH", { title: "hacked" }), p(aiRoom)));
  const de = await toRes(await R.conv.DELETE(mreq(U.staffAi2, "DELETE"), p(aiRoom)));
  const rd = await toRes(await R.read.POST(mreq(U.staffAi2, "POST"), p(aiRoom)));
  const row = await P.aiConversation.findUnique({ where: { id: aiRoom } });
  chk("M2.1", !ids2.includes(aiRoom) && ((m2.body.messages ?? []) as Any[]).length === 0 && pa.body.ok === false && de.body.ok === false && rd.body.ok === false && row?.title === "ห้อง staffAi" && row?.deletedAt == null,
    `other STAFF+ai: list hides it · messages [] · rename/delete/read ok:false · row unchanged (${j({ inList: ids2.includes(aiRoom), msgs: (m2.body.messages ?? []).length, pa: pa.body.ok, de: de.body.ok, rd: rd.body.ok, title: row?.title, del: row?.deletedAt })})`);
  const lo = await toRes(await R.convs.GET(mreq(U.owner, "GET")));
  const idsO = ((lo.body.conversations ?? []) as Any[]).map((c) => String(c.id));
  const lA = await toRes(await R.convs.GET(mreq(U.staffAi, "GET")));
  const idsA = ((lA.body.conversations ?? []) as Any[]).map((c) => String(c.id));
  chk("M2.2", (!keyRoom || idsO.includes(keyRoom)) && !idsO.includes(aiRoom) && idsA.includes(aiRoom) && (!keyRoom || !idsA.includes(keyRoom)),
    `OWNER sees the key room, not the staff room · staff sees own room, not the key room (owner: key=${idsO.includes(keyRoom)} staff=${idsO.includes(aiRoom)} · staffAi: own=${idsA.includes(aiRoom)} key=${idsA.includes(keyRoom)})`);
  const cross = await st(R.convs.GET(mreq(U.staffAi, "GET", undefined, tB)));
  const crossB = await st(R.convs.GET(mreq(U.ownerB, "GET", undefined, tA)));
  chk("M3.1", cross !== 200 && crossB !== 200, `token user not a member of X-Tenant-Id → refused (${cross}/${crossB})`);
  const delOwn = await toRes(await R.conv.DELETE(mreq(U.staffAi, "DELETE"), p(aiRoom)));
  chk("M3.2", delOwn.status === 200 && delOwn.body.ok === true && (await P.aiConversation.findUnique({ where: { id: aiRoom } }))?.deletedAt != null, `positive control: creator deletes own room → ok`);
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
