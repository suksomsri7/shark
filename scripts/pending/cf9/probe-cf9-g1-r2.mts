// probe — CRM C5.5-G1 round 2 (review findings F2 · F4 · F5 · F6 · F7) — RED on fdf3cd36 (round-1 tree), GREEN after round 2.
//   F2  an actor with no usable branch (the scheduled job; a STAFF with unitAccess []) is REFUSED and NOT OFFERED the branch tools and
//       approvals_pending — "no access" must never look like "no data" (the job publishes to every member)
//   F4  the REST skill manifest lists only what the executor runs for that key; a refused call answers 403 like the route's other refusals
//   F5  a hand-written `{ kind: "system", membership: OWNER }` object gets nothing — only aiSystemActor() builds a system actor
//   F6  AiTool.execute without an actor refuses in every adapter (no widest-read-set / cookie fallback); an API-key actor never borrows
//       the request cookie (CRM read under an OWNER session cookie)
//   F7  member_count refused to a branch-limited caller, shop-wide callers unchanged
// Same file runs on both trees (plain actor objects; aiSystemActor exists on both). G* counted · P* positive controls · I* info.
// QC3 ONLY · throwaway tenant `qc-cf9r2-*` swept in finally · fetch blocked · SHARK_AI_MOCK=1.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh \
//        bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf9/probe-cf9-g1-r2.mts
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
const TAG = `qc-cf9r2-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
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
const ACT = (await import("@/lib/ai/actor" as string)) as Any;
const mkUser = async (suffix: string) => {
  const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
  USERS.push(u.id);
  return u.id as string;
};
const setCrm = (sysId: string, obj: Record<string, unknown>) =>
  P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify(obj),
    sysId,
  );
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf9-r2", "x-forwarded-for": "203.0.113.191" } });
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
  calls: { tools: string[]; system: string }[] = [];
  private i = 0;
  constructor(private steps: Any[]) {}
  async chat(messages: Any[], opts?: { tools?: { name: string }[] }) {
    this.calls.push({ tools: (opts?.tools ?? []).map((t) => t.name), system: String(messages.find((m: Any) => m.role === "system")?.content ?? "") });
    const step = this.steps[Math.min(this.i, this.steps.length - 1)];
    this.i += 1;
    if (step.text === "$LAST_TOOL") {
      const last = [...messages].reverse().find((m: Any) => m.role === "tool");
      return { text: `ผลเครื่องมือ: ${last?.content ?? "(ไม่มี)"}`, tokensIn: 10, tokensOut: 10, model: "scripted" };
    }
    return { text: step.text ?? "", toolCalls: step.toolCalls, tokensIn: 10, tokensOut: 10, model: "scripted" };
  }
}
const isRefusal = (out: string) => {
  try {
    const o = JSON.parse(out) as Any;
    return typeof o?.error === "string" && /ไม่มีสิทธิ์|ใช้เครื่องมือนี้ไม่ได้|ไม่ทราบว่าใคร|แยกตามสาขา|ตอบแทนไม่ได้|ดูตัวเลขนี้ไม่ได้/.test(o.error);
  } catch {
    return false;
  }
};

let tA = "";
try {
  const t = await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } });
  tA = t.id;
  TENANTS.push(tA);
  const u1 = (await P.businessUnit.create({ data: { tenantId: tA, type: "SHOP", name: "สาขาหนึ่ง", slug: `${TAG}-u1` } })).id as string;
  const u2 = (await P.businessUnit.create({ data: { tenantId: tA, type: "SHOP", name: "สาขาสอง", slug: `${TAG}-u2` } })).id as string;
  const owner = await mkUser("-owner");
  const mgr = await mkUser("-mgr");
  const staffAi = await mkUser("-ai");
  const staffNoUnit = await mkUser("-nounit");
  const staffMem = await mkUser("-mem");
  const AI = { "ai.chat.send": true };
  const rows: [string, string, string[], Record<string, boolean>][] = [
    [owner, "OWNER", ["*"], {}], [mgr, "MANAGER", [u1], {}], [staffAi, "STAFF", ["*"], AI], [staffNoUnit, "STAFF", [], AI], [staffMem, "STAFF", ["*"], { ...AI, "member.customer.read": true }],
  ];
  for (const [uid, role, unitAccess, permissions] of rows) await P.membership.create({ data: { userId: uid, tenantId: tA, role, unitAccess, permissions, acceptedAt: new Date() } });
  const act = (uid: string) => {
    const r = rows.find((x) => x[0] === uid)!;
    return { kind: "member", tenantId: tA, userId: uid, membership: { role: r[1], unitAccess: r[2], permissions: r[3] } };
  };
  const A = (await sysSvc.createSystem(tA, "ACCOUNT", "บัญชีทดสอบ")).id as string;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  await accSvc.saveSettings(tA, A, { orgName: "QC ร้านทดสอบ", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  const M = (await sysSvc.createSystem(tA, "MEMBER", "สมาชิกทดสอบ")).id as string;
  await sysSvc.createSystem(tA, "KANBAN", "บอร์ดทดสอบ");
  await sysSvc.createSystem(tA, "BOOKING", "นัดทดสอบ");
  const C = (await sysSvc.createSystem(tA, "CRM", "CRM ทดสอบ")).id as string;
  await setCrm(C, { uiVersion: 2 });
  await P.crmContact.create({ data: { tenantId: tA, systemId: C, name: "ลีดคุกกี้", phone: "0811000777", ownerUserId: owner } });
  await P.customer.create({ data: { tenantId: tA, memberSystemId: M, name: "สมาชิกสาขาหนึ่ง", phone: "0899000201", homeUnitId: u1, memberCode: "QCR001" } });
  await P.customer.create({ data: { tenantId: tA, memberSystemId: M, name: "สมาชิกสาขาสอง", phone: "0899000202", homeUnitId: u2, memberCode: "QCR002" } });
  await P.shopOrder.create({ data: { tenantId: tA, unitId: u1, code: "SO-R21", customerName: "ผู้ซื้อหนึ่ง", customerPhone: "0822000201", totalSatang: 10_000 } });
  await P.shopOrder.create({ data: { tenantId: tA, unitId: u2, code: "SO-R22", customerName: "ผู้ซื้อสอง", customerPhone: "0822000202", totalSatang: 20_000 } });
  await P.aiCreditWallet.create({ data: { tenantId: tA, balanceMicro: 50_000_000, grantedAt: new Date() } });
  const conv = await P.aiConversation.create({ data: { tenantId: tA, title: "QC G1 r2" } });
  const rt = (actor: Any, name: string, args: Any = {}) => tools.runTool({ tenantId: tA, actor, conversationId: conv.id }, name, args) as Promise<string>;
  const sysA = ACT.aiSystemActor(tA, "scheduled-task");

  // ═══ F2 — no usable branch = refused + not offered ═══
  console.log("\n── F2 branch tools for actors with no branch ──");
  const oShop = await rt(act(owner), "shop_pending_orders");
  const sShop = await rt(sysA, "shop_pending_orders");
  chk("R2.1", oShop.includes("SO-R21") && isRefusal(sShop), `scheduled-task actor: shop_pending_orders → refusal while the OWNER sees SO-R21 → ${cut(sShop, 120)}`);
  const sAppr = await rt(sysA, "approvals_pending");
  chk("R2.2", isRefusal(sAppr), `scheduled-task actor: approvals_pending → refusal (no approver identity) → ${cut(sAppr, 110)}`);
  const nShop = await rt(act(staffNoUnit), "shop_pending_orders");
  const nAppts = await rt(act(staffNoUnit), "today_appointments");
  chk("R2.3", isRefusal(nShop) && isRefusal(nAppts), `STAFF with unitAccess [] (web requireUnit opens no branch page) → refusal, not an empty list → ${cut(nShop, 110)}`);
  const aShop = await rt(act(staffAi), "shop_pending_orders");
  const mShop = await rt(act(mgr), "shop_pending_orders");
  const nAppr = await rt(act(staffNoUnit), "approvals_pending");
  chk("P2.1", aShop.includes("SO-R21") && aShop.includes("SO-R22") && mShop.includes("SO-R21") && !mShop.includes("SO-R22") && !isRefusal(nAppr),
    `positive: STAFF * sees both · MANAGER u1 sees u1 only · a human with no branch keeps approvals_pending (rows waiting on them) → ${cut(nAppr, 70)}`);
  const branchTools = ["today_appointments", "queue_waiting", "shop_pending_orders", "rental_active", "restaurant_today", "ticket_event_sales", "approvals_pending"];
  const spS = new Scripted([{ toolCalls: [{ id: "l1", name: "load_skill", args: { skills: ["booking", "approvals", "shop", "restaurant", "rental", "ticket"] } }] }, { text: "จบ" }]);
  await svc.sendMessage({ tenantId: tA, actor: sysA }, { text: "สรุปออเดอร์และนัดวันนี้" }, { provider: spS });
  const offered = new Set(spS.calls.flatMap((c) => c.tools));
  const sysIdx = spS.calls[0]?.system ?? "";
  chk("R2.4", branchTools.every((n) => !offered.has(n)) && !/- booking:|- approvals:/.test(sysIdx),
    `scheduled-task actor is not offered ${branchTools.length} branch/approver tools, and the skill index drops booking/approvals → offered∩=${j(branchTools.filter((n) => offered.has(n)))}`);
  const sched = (await import("@/lib/ai/scheduled" as string)) as Any;
  const busy = new Set(((await P.aiScheduledTask.findMany({ where: { active: true }, select: { hourBkk: true } })) as Any[]).map((r) => r.hourBkk as number));
  const hour = [...Array(24).keys()].find((h) => !busy.has(h));
  if (hour === undefined) chk("R2.5", false, "no free hour for the scheduled-task check");
  else {
    await P.aiScheduledTask.create({ data: { tenantId: tA, instruction: "สรุปออเดอร์รอชำระ", hourBkk: hour } });
    const now = new Date(Date.UTC(2031, 0, 16, (hour + 24 - 7) % 24, 5));
    const spT = new Scripted([{ toolCalls: [{ id: "s1", name: "shop_pending_orders", args: {} }] }, { text: "$LAST_TOOL" }]);
    const ran = await sched.runScheduledTasks(now, { provider: spT });
    const note = await P.appNotification.findFirst({ where: { tenantId: tA, title: "งานประจำจากผู้ช่วย AI" }, orderBy: { createdAt: "desc" } });
    const body = String(note?.body ?? "");
    chk("R2.5", ran >= 1 && !/"ออเดอร์รอชำระ":\[\]/.test(body) && /ไม่ได้แปลว่าไม่มีข้อมูล|แยกตามสาขา|ไม่มีสิทธิ์/.test(body),
      `scheduled job notification says "no access", never an empty order list (ran=${ran}) → ${cut(body, 140)}`);
  }

  // ═══ F6 — no actor = refused in every adapter · API key never borrows the request cookie ═══
  console.log("\n── F6 execute without actor ──");
  const kb0 = await P.kbArticle.count({ where: { tenantId: tA } });
  const reg = tools.toolRegistry() as Any[];
  const byName = (n: string) => reg.find((x) => x.def.name === n);
  const TACC = (await import("@/lib/ai/tools-account" as string)) as Any;
  const TKAN = (await import("@/lib/ai/tools-kanban" as string)) as Any;
  const TMEM = (await import("@/lib/ai/tools-member" as string)) as Any;
  const TCRM = (await import("@/lib/ai/tools-crm" as string)) as Any;
  const direct: Record<string, string> = {};
  const noActor = { tenantId: tA, conversationId: conv.id };
  for (const n of ["account_dashboard", "kanban_list_boards", "kanban_my_tasks", "member_list", "crm_search", "shop_pending_orders", "kb_auto_save", "financial_summary"]) {
    direct[`reg:${n}`] = String(await byName(n).execute(noActor, n === "kb_auto_save" ? { title: "x", content: "y" } : n === "crm_search" ? { q: "ลีด" } : {}).catch((e: Error) => `threw ${e.message}`));
  }
  direct["mod:account_dashboard"] = String(await (TACC.accountTools() as Any[]).find((x) => x.def.name === "account_dashboard").execute(noActor, {}));
  direct["mod:kanban_list_boards"] = String(await (TKAN.kanbanTools() as Any[]).find((x) => x.def.name === "kanban_list_boards").execute(noActor, {}));
  direct["mod:member_list"] = String(await (TMEM.memberTools() as Any[]).find((x) => x.def.name === "member_list").execute(noActor, {}));
  direct["mod:crm_search"] = String(await (TCRM.crmTools() as Any[]).find((x) => x.def.name === "crm_search").execute(noActor, { q: "ลีด" }));
  const notRefused = Object.entries(direct).filter(([, v]) => !isRefusal(v)).map(([k]) => k);
  const kb1 = await P.kbArticle.count({ where: { tenantId: tA } });
  chk("R6.1", notRefused.length === 0 && kb1 === kb0 && !Object.values(direct).some((v) => v.includes("สมาชิกสาขา") || v.includes("0811000777")),
    `AiTool.execute without an actor (registry + the 4 module adapters directly) → all refused, no data, KB ${kb0}→${kb1} · not refused=${j(notRefused)}`);
  const withActor = String(await byName("account_dashboard").execute({ tenantId: tA, actor: act(owner) }, {}));
  chk("P6.1", !/"error"/.test(withActor), `positive: the same execute with the OWNER actor → data → ${cut(withActor, 80)}`);
  const ckOwner = await sessionCookie(owner, tA);
  const keyCrm = { kind: "apiKey", tenantId: tA, keyId: `${TAG}-k`, scopes: ["crm.contact.read"], systemId: null };
  const underCookie = await inScope(ckOwner, "/api/v1/ai/tools/crm_search", () => rt(keyCrm, "crm_search", { q: "ลีด" }));
  chk("R6.2", !underCookie.includes("ลีดคุกกี้"), `API-key actor (crm.contact.read) inside a request carrying the OWNER's session cookie → no CRM data borrowed from the cookie → ${cut(underCookie, 110)}`);

  // ═══ F5 — forged system actor ═══
  console.log("\n── F5 forged system actor ──");
  const forged = { kind: "system", tenantId: tA, job: "scheduled-task", membership: { role: "OWNER", unitAccess: ["*"], permissions: {} } };
  const fFin = await rt(forged, "financial_summary");
  const fList = await rt(forged, "list_systems");
  const fShop = await rt(forged, "shop_pending_orders");
  chk("R5.1", isRefusal(fFin) && isRefusal(fShop) && isRefusal(fList), `object-literal system actor with OWNER rights → refused everything (financial_summary · shop_pending_orders · list_systems) → ${cut(fFin, 90)}`);
  const gList = await rt(sysA, "list_systems");
  const gFin = await rt(sysA, "financial_summary");
  chk("P5.1", !isRefusal(gList) && isRefusal(gFin), `positive: aiSystemActor(scheduled-task) → list_systems ok, financial_summary refused (least-privileged)`);

  // ═══ F4 — REST manifest = executor ═══
  console.log("\n── F4 REST manifest and refusals ──");
  const keySvc = (await import("@/lib/api-keys/service" as string)) as Any;
  const kGen = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-gen`, {});
  const SK = (await import("../../../src/app/api/v1/ai/skills/route.ts" as string)) as Any;
  const SKID = (await import("../../../src/app/api/v1/ai/skills/[id]/route.ts" as string)) as Any;
  const TOOLS = (await import("../../../src/app/api/v1/ai/tools/[name]/route.ts" as string)) as Any;
  const hdr = { authorization: `Bearer ${kGen.rawKey}`, "content-type": "application/json" };
  const listR = await SK.GET(new Request("http://qc.invalid/api/v1/ai/skills", { headers: hdr }));
  const list = (await listR.json()) as Any;
  const advertised: string[] = [...((list?.core?.tools ?? []) as string[]).map((n) => `core:${n}`)];
  for (const s of (list?.skills ?? []) as Any[]) {
    const r = await SKID.GET(new Request(`http://qc.invalid/api/v1/ai/skills/${s.id}`, { headers: hdr }), { params: Promise.resolve({ id: s.id }) });
    if (r.status !== 200) continue;
    for (const tl of ((await r.json()) as Any).tools ?? []) advertised.push(`${s.id}:${tl.function.name}`);
  }
  const gk = { kind: "apiKey", tenantId: tA, keyId: kGen.id, scopes: [], systemId: null };
  const mismatch: string[] = [];
  for (const a of advertised) {
    const n = a.split(":")[1]!;
    const out = await rt(gk, n, {});
    if (isRefusal(out)) mismatch.push(a);
  }
  chk("R4.1", advertised.length > 0 && mismatch.length === 0, `general key: GET /skills + /skills/[id] advertise only tools the executor runs (${advertised.length} advertised) · advertised-but-refused=${j(mismatch)}`);
  const conv0 = await P.aiConversation.count({ where: { tenantId: tA } });
  const post = async (name: string, args: Any = {}) => {
    const r = await TOOLS.POST(new Request(`http://qc.invalid/api/v1/ai/tools/${name}`, { method: "POST", headers: hdr, body: j({ args }) }), { params: Promise.resolve({ name }) });
    return { status: r.status as number, body: await r.text() };
  };
  const pFin = await post("financial_summary");
  const pExp = await post("record_expense", { note: "ค่าน้ำ", amountBaht: 100 });
  const conv1 = await P.aiConversation.count({ where: { tenantId: tA } });
  chk("R4.2", pFin.status === 403 && pExp.status === 403 && conv1 === conv0, `refused by the executor → HTTP 403 (route's other refusals are 403) · no empty conversation opened (${conv0}→${conv1}) → ${pFin.status}/${pExp.status} ${cut(pExp.body, 80)}`);
  const pList = await post("list_systems");
  chk("P4.1", pList.status === 200 && /ระบบที่เปิดใช้/.test(pList.body), `positive: general key list_systems → 200`);

  // ═══ F7 — member_count ═══
  console.log("\n── F7 member_count ──");
  const mcM = await rt(act(mgr), "member_count");
  const mcS = await rt(act(staffMem), "member_count");
  const mcO = await rt(act(owner), "member_count");
  chk("R7.1", isRefusal(mcM), `MANAGER limited to u1 → refused (count is shop-wide) → ${cut(mcM, 100)}`);
  chk("P7.1", /"จำนวนสมาชิก":2/.test(mcS) && /"จำนวนสมาชิก":2/.test(mcO), `positive: STAFF * with member.customer.read and OWNER → 2 (unchanged)`);
  info("I.ROUND1", "round-1 behaviour is re-checked by probe-cf9-g1 in the same verification run");
} catch (e) {
  chk("FATAL", false, `probe crashed: ${cut((e as Error)?.stack ?? e, 400)}`);
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
