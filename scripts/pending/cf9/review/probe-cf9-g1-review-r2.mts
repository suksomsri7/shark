// review probe — CRM C5.5-G1 round 2 (independent reviewer). ✅ = property holds · ❌ = finding · ℹ️ = evidence (not counted).
//   W*  F6: the actor gate on EVERY registry tool and on the four adapter factories called directly (no actor · other shop ·
//       hand-written system literal · a spread copy of a genuine system actor · unknown kind) — exhaustive, not sampled
//   S*  F5: genuine system actor (frozen, rights from the job name) still works; copies do not
//   B*  F2: "no usable branch" per persona vs the web door `requireUnit` (same session, same unit) — parity, not just refusal
//   K*  API-key viewer for the member runner: never wider than the key (each member read tool: AI outcome vs REST `memberScopesCan`)
//   H*  F4: 403 body vs the hotfix's 403 body (evidence for the merge)
// Model: none needed (executor + routes) · fetch blocked · QC3 only · throwaway tenant swept in finally.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf9/review/probe-cf9-g1-review-r2.mts
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
const TAG = `qc-cf9rr-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
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
const TA = (await import("@/lib/ai/tool-access" as string)) as Any;
const ACT = (await import("@/lib/ai/actor" as string)) as Any;
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
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf9rr", "x-forwarded-for": "203.0.113.192" } });
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
const GATE = /ไม่ทราบว่าใครเป็นผู้ใช้เครื่องมือนี้/;
const isGate = (out: string) => {
  try {
    const o = JSON.parse(out) as Any;
    return typeof o?.error === "string" && GATE.test(o.error);
  } catch {
    return false;
  }
};
const isRefusal = (out: string) => {
  try {
    const o = JSON.parse(out) as Any;
    return typeof o?.error === "string" && /ไม่มีสิทธิ์|ใช้เครื่องมือนี้ไม่ได้|ไม่ทราบว่าใคร/.test(o.error);
  } catch {
    return false;
  }
};

try {
  const t = await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } });
  const tA = t.id as string;
  TENANTS.push(tA);
  const u1 = (await P.businessUnit.create({ data: { tenantId: tA, type: "SHOP", name: "สาขาหนึ่ง", slug: `${TAG}-u1` } })).id as string;
  const u2 = (await P.businessUnit.create({ data: { tenantId: tA, type: "SHOP", name: "สาขาสอง", slug: `${TAG}-u2` } })).id as string;
  const owner = await mkUser("-owner");
  const mgr = await mkUser("-mgr");
  const staffNone = await mkUser("-none");
  const staffAll = await mkUser("-all");
  const AI = { "ai.chat.send": true };
  await member(owner, tA, "OWNER", ["*"], {});
  await member(mgr, tA, "MANAGER", [u1], {});
  await member(staffNone, tA, "STAFF", [], { ...AI, "member.customer.read": true });
  await member(staffAll, tA, "STAFF", ["*"], { ...AI, "member.customer.read": true });
  const M = (await sysSvc.createSystem(tA, "MEMBER", "สมาชิกทดสอบ")).id as string;
  await sysSvc.createSystem(tA, "POS", "ขายทดสอบ");
  await P.customer.create({ data: { tenantId: tA, memberSystemId: M, name: "สมาชิกเลขเจ็ด", phone: "0899000777", homeUnitId: u1, memberCode: "QRR001" } });
  const ownerA = ACT.aiMemberActor(tA, owner, { role: "OWNER", unitAccess: ["*"], permissions: {} });
  const all = tools.toolRegistry() as Any[];
  const names = all.map((x) => x.def.name as string);

  // ═══ W — F6 gate on every registry tool (exhaustive) ═══
  console.log("\n── W actor gate on every registered tool (direct execute) ──");
  const genuine = ACT.aiSystemActor(tA, "scheduled-task");
  const variants: [string, Any][] = [
    ["none", undefined],
    ["other-shop", { ...ownerA, tenantId: "some-other-tenant" }],
    ["system-literal-OWNER", { kind: "system", tenantId: tA, job: "scheduled-task", membership: { role: "OWNER", unitAccess: ["*"], permissions: {} } }],
    ["spread-of-genuine", { ...genuine }],
    ["unknown-kind", { kind: "platform", tenantId: tA, membership: { role: "OWNER", unitAccess: ["*"], permissions: {} } }],
  ];
  const kb0 = await P.kbArticle.count({ where: { tenantId: tA } });
  const mem0 = await P.aiMemory.count({ where: { tenantId: tA } });
  const pr0 = await P.aiProposal.count({ where: { tenantId: tA } });
  for (const [label, actor] of variants) {
    const notGated: string[] = [];
    for (const tl of all) {
      const ctx: Any = { tenantId: tA, conversationId: "conv-x", ...(actor === undefined ? {} : { actor }) };
      const out = String(await tl.execute(ctx, {}).catch((e: Error) => `THROW ${e.message}`));
      if (!isGate(out)) notGated.push(tl.def.name);
    }
    chk(`W1.${label}`, notGated.length === 0, `execute() of all ${all.length} registry tools with actor=${label} → gate refusal · not gated=${j(notGated.slice(0, 12))}`);
  }
  const kb1 = await P.kbArticle.count({ where: { tenantId: tA } });
  const mem1 = await P.aiMemory.count({ where: { tenantId: tA } });
  const pr1 = await P.aiProposal.count({ where: { tenantId: tA } });
  chk("W1.writes", kb1 === kb0 && mem1 === mem0 && pr1 === pr0, `no write happened during ${variants.length * all.length} gated calls (KB ${kb0}→${kb1} · memory ${mem0}→${mem1} · proposals ${pr0}→${pr1})`);
  // adapter factories called directly (not through toolRegistry): each must self-gate
  const facts: [string, string][] = [["crmTools", "@/lib/ai/tools-crm"], ["memberTools", "@/lib/ai/tools-member"], ["accountTools", "@/lib/ai/tools-account"], ["kanbanTools", "@/lib/ai/tools-kanban"]];
  const ungatedAdapters: string[] = [];
  let adapterCount = 0;
  for (const [fn, mod] of facts) {
    const list = ((await import(mod as string)) as Any)[fn]() as Any[];
    for (const tl of list) {
      adapterCount += 1;
      const out = String(await tl.execute({ tenantId: tA, conversationId: "conv-x" }, {}).catch((e: Error) => `THROW ${e.message}`));
      if (!isGate(out)) ungatedAdapters.push(`${fn}:${tl.def.name}`);
    }
  }
  chk("W2.1", ungatedAdapters.length === 0, `${adapterCount} adapter tools from the 4 factories, executed directly without actor → gate refusal · not gated=${j(ungatedAdapters.slice(0, 12))}`);
  const unwrapped = names.length - new Set(names).size;
  info("W2.2", `registry ${names.length} tools, duplicate names=${unwrapped} · tool objects are module-private except the 4 factories (grep: no other importer) · no tool calls another tool's execute`);

  // ═══ S — F5 genuine system actor ═══
  console.log("\n── S genuine system actor ──");
  let mutated = false;
  try {
    (genuine as Any).tenantId = "x";
    (genuine as Any).job = "y";
    mutated = genuine.tenantId === "x" || genuine.job === "y";
  } catch {
    mutated = false;
  }
  const gSales = await tools.runTool({ tenantId: tA, actor: genuine }, "sales_summary", { days: 7 });
  const gShop = await tools.runTool({ tenantId: tA, actor: genuine }, "shop_pending_orders", {});
  chk("S1.1", !mutated && Object.isFrozen(genuine) && !isRefusal(gSales) && isRefusal(gShop),
    `aiSystemActor: frozen (mutation ignored=${!mutated}) · sales_summary runs · branch tool refused, wording → ${cut(gShop, 120)}`);
  chk("S1.2", "membership" in genuine === false, `system actor carries no rights field (keys: ${j(Object.keys(genuine))})`);

  // ═══ B — F2 branch rule vs the web door requireUnit ═══
  console.log("\n── B 'no usable branch' vs web requireUnit ──");
  const ctxMod = (await import("@/lib/core/context" as string)) as Any;
  const persona: [string, string, Any][] = [
    ["STAFF []", staffNone, ACT.aiMemberActor(tA, staffNone, { role: "STAFF", unitAccess: [], permissions: { ...AI, "member.customer.read": true } })],
    ["STAFF *", staffAll, ACT.aiMemberActor(tA, staffAll, { role: "STAFF", unitAccess: ["*"], permissions: { ...AI, "member.customer.read": true } })],
    ["MANAGER [u1]", mgr, ACT.aiMemberActor(tA, mgr, { role: "MANAGER", unitAccess: [u1], permissions: {} })],
    ["OWNER", owner, ownerA],
  ];
  const branchTools = ["today_appointments", "queue_waiting", "shop_pending_orders", "rental_active", "restaurant_today", "ticket_event_sales"];
  const mismatch: string[] = [];
  for (const [label, uid, actor] of persona) {
    const ck = await sessionCookie(uid, tA);
    const web: Record<string, boolean> = {};
    for (const [u, slug] of [[u1, `${TAG}-u1`], [u2, `${TAG}-u2`]] as const) {
      web[u] = await inScope(ck, `/app/u/${slug}`, async () => {
        try {
          await ctxMod.requireUnit(slug);
          return true;
        } catch {
          return false;
        }
      });
    }
    const webAny = web[u1] || web[u2];
    const offered = TA.toolsOfferedTo(actor, branchTools) as string[];
    const aiAny = offered.length === branchTools.length;
    const aiNone = offered.length === 0;
    if (!(webAny ? aiAny : aiNone)) mismatch.push(`${label}: web u1=${web[u1]} u2=${web[u2]} · AI offered ${offered.length}/6`);
    info("B1.x", `${label}: web requireUnit u1=${web[u1]} u2=${web[u2]} · AI branch tools offered ${offered.length}/6 · actorBranches=${j(TA.actorBranches(actor))}`);
  }
  chk("B1.1", mismatch.length === 0, `AI branch tools offered ⇔ web opens at least one branch page (same session) · mismatches=${j(mismatch)}`);
  const mcNone = await tools.runTool({ tenantId: tA, actor: persona[0]![2] }, "member_count", {});
  const mcAll = await tools.runTool({ tenantId: tA, actor: persona[1]![2] }, "member_count", {});
  info("B1.2", `member_count: STAFF [] + member.customer.read → ${cut(mcNone, 90)} · STAFF * → ${cut(mcAll, 60)}`);

  // ═══ K — API-key viewer for the member runner never wider than the key ═══
  console.log("\n── K API-key viewer (member runner) vs REST scope check ──");
  const memberApiActor = (await import("@/lib/modules/member/api/actor" as string)) as Any;
  const memberTools = (await import("@/lib/modules/member/api/tools" as string)) as Any;
  const readTools = (memberTools.memberToolInfos() as Any[]).filter((i) => !i.write).map((i) => i.name as string);
  const scopeSets: string[][] = [["member.customer.read"], ["member.point.read"], ["member.tier.read"], ["member.review.read"]];
  const wider: string[] = [];
  let compared = 0;
  for (const scopes of scopeSets) {
    const key = ACT.aiApiKeyActor({ tenantId: tA, keyId: `${TAG}-k`, scopes, systemId: M });
    for (const n of readTools) {
      const action = memberTools.memberToolScope(n) as string | null;
      if (!action) continue;
      const rest = memberApiActor.memberScopesCan(scopes, action) as boolean;
      const out = String(await tools.runTool({ tenantId: tA, actor: key, systemId: M }, n, {}));
      const ran = !isRefusal(out) && !/ไม่มีสิทธิ์|ไม่ได้รับสิทธิ์/.test(out);
      compared += 1;
      if (ran && !rest) wider.push(`${j(scopes)}→${n}(${action})`);
    }
  }
  chk("K1.1", wider.length === 0, `member read tools × 4 narrow keys (${compared} pairs): never runs where REST memberScopesCan refuses · wider=${j(wider.slice(0, 10))}`);
  // cookie of an OWNER session around an API-key call must not widen anything (member runner)
  const ckOwner = await sessionCookie(owner, tA);
  const narrowKey = ACT.aiApiKeyActor({ tenantId: tA, keyId: `${TAG}-k2`, scopes: ["member.tier.read"], systemId: M });
  const underCookie = String(await inScope(ckOwner, "/api/v1/ai/tools/member_list", () => tools.runTool({ tenantId: tA, actor: narrowKey, systemId: M }, "member_list", {})));
  chk("K1.2", !underCookie.includes("0899000777"), `key [member.tier.read] inside a request carrying the OWNER's cookie → member_list shows no phone → ${cut(underCookie, 100)}`);

  // ═══ H — F4 403 body vs hotfix body ═══
  console.log("\n── H tools route 403 shape ──");
  const keySvc = (await import("@/lib/api-keys/service" as string)) as Any;
  const kGen = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-gen`, {});
  const TOOLS = (await import("../../../../src/app/api/v1/ai/tools/[name]/route.ts" as string)) as Any;
  const r = await TOOLS.POST(new Request("http://qc.invalid/api/v1/ai/tools/financial_summary", { method: "POST", headers: { authorization: `Bearer ${kGen.rawKey}`, "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({ name: "financial_summary" }) });
  const body = await r.text();
  info("H1.1", `general key → financial_summary ${r.status} body keys=${j(Object.keys(JSON.parse(body)))} (hotfix 403 = {error, error_en, code:"key_not_general"})`);
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
  const pass = res.filter((x) => x.ok).length;
  console.log(`\nJSON_SUMMARY ${j({ pass, total: res.length, red: res.filter((x) => !x.ok).map((x) => x.id) })}`);
  await prisma.$disconnect();
  process.exit(res.every((x) => x.ok) ? 0 : 1);
}
