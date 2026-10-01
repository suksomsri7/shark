// C5.5-fix1 INDEPENDENT REVIEW probe (read-only on src/) — QC3 only · throwaway tenants `qc-c55-rv-*` (swept in done()) · network blocked
// except the stubbed webhook host. Run:
//   env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c55/review/probe-review.mts
// Each check states what a GREEN means. Checks prefixed "HOLE-" are expected RED while the hole exists (they assert the SAFE behaviour).
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
const { fixture } = (await import("../_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("rv");
const { P, chk, call, mkShop, mkUser, setCrm, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(`${id}-ERR`, false, String((e as Error)?.stack ?? e).slice(0, 700));
  }
};

// ── webhook host stub (the fixture blocks every other fetch) ──
const HOOK_HOST = `${TAG}-hook.invalid`;
const HOOKS: { url: string; headers: Record<string, string>; body: string }[] = [];
const blocked = globalThis.fetch;
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  if (url.includes(HOOK_HOST)) {
    const h: Record<string, string> = {};
    const hs = init?.headers ?? {};
    if (hs instanceof Headers) hs.forEach((v, k) => { h[k.toLowerCase()] = v; });
    else for (const [k, v] of Object.entries(hs as Record<string, string>)) h[k.toLowerCase()] = String(v);
    HOOKS.push({ url, headers: h, body: String(init?.body ?? "") });
    return new Response("ok", { status: 200 });
  }
  return blocked(input, init);
}) as typeof fetch;
const appEnvBefore = process.env.APP_ENV;
if (appEnvBefore !== "test" && appEnvBefore !== "development") process.env.APP_ENV = "test"; // webhook sender uses global fetch only in dev/test

// ── Next request scope for server actions (technique of probe-fix1 / probe-c54d-r2) ──
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-c55-review", "x-forwarded-for": "203.0.113.158" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const afterContext = { after: (_task: Any) => undefined };
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
const SESS_USERS: string[] = [];
async function sessionCookie(uid: string, tid: string): Promise<string> {
  SESS_USERS.push(uid);
  const token = coreHash.randomToken(32) as string;
  await P.session.create({ data: { userId: uid, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 86_400_000), expiresAt: new Date(Date.now() + 86_400_000) } });
  return `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tid}`;
}
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
// ── REST in-process (technique of qc-crm-c1.10 callRoute) ──
const ROUTE = (await import("@/app/api/v1/crm/[...path]/route" as string)) as Any;
async function rest(method: string, path: string, key: string, body: unknown, idem: string): Promise<{ status: number; body: Any; replayed: string | null }> {
  const headers: Record<string, string> = { authorization: `Bearer ${key}`, "idempotency-key": idem, "content-type": "application/json" };
  const res: Response = await ROUTE[method](new Request(`http://qc.invalid/api/v1/crm${path}`, { method, headers, body: JSON.stringify(body) }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
  const text = await res.text();
  let parsed: Any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, body: parsed, replayed: res.headers.get("Idempotent-Replayed") };
}
const AK = (await import("@/lib/api-keys/service" as string)) as Any;
const crm = (await import("@/lib/modules/crm" as string)) as Any;
const auto = (await import("@/lib/modules/crm/automation" as string)) as Any;

try {
  // ═══════════ RV-I · H55-1 idempotency — what the fix does NOT cover / costs ═══════════
  await sub("RV-I", async () => {
    const shop = await mkShop("i");
    const { withIdempotency } = (await import("@/lib/api/idempotency" as string)) as Any;
    const { ApiError } = (await import("@/lib/api/respond" as string)) as Any;
    const actor = { kind: "apikey", module: "crm", tenantId: shop.tid, systemId: shop.S, keyId: `${TAG}-key`, keyName: "probe", userId: shop.uid, scopes: [], membership: { role: "STAFF", unitAccess: ["*"], permissions: {} } };
    const op = { id: "probe.write", method: "POST", path: "/probe", kind: "write", action: "crm.contact.create" };
    const mkReq = (k: string) => new Request("https://shark.invalid/api/v1/crm/probe", { method: "POST", headers: { "idempotency-key": k, "content-type": "application/json" }, body: "{}" });
    const write = (label: string) => P.appNotification.create({ data: { tenantId: shop.tid, recipientUserId: shop.uid, title: `qc.c55rv.${label}`, body: TAG } });
    const rows = (label: string) => P.appNotification.count({ where: { tenantId: shop.tid, title: `qc.c55rv.${label}` } });

    // (1) stale takeover: the first owner COMMITTED and was then killed before storing the outcome (lambda timeout under DB pressure —
    //     the same moment H55-1 is about). A retry after 6 min re-runs the handler. SAFE = the retry does NOT run the write again.
    {
      const k = `${TAG}-stale`;
      await write("stale"); // what the killed first attempt committed
      await P.apiIdempotency.create({ data: { tenantId: shop.tid, keyId: actor.keyId, idemKey: k, requestHash: (await import("node:crypto")).createHash("sha256").update("POST /api/v1/crm/probe\n{}").digest("hex"), expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(Date.now() - 7 * 60_000) } });
      let runs = 0;
      const r = await withIdempotency(actor, mkReq(k), op, "{}", "req-stale", {}, async () => {
        runs += 1;
        await write("stale");
        return { status: 200, body: { data: { ok: true } } };
      });
      const n = await rows("stale");
      chk("HOLE-RV-I1-stale-takeover", runs === 0 && n === 1, `claim left NULL 7 min ago by a killed first attempt that committed 1 row → retry status ${r.status} · handler runs=${runs} (safe: 0) · rows=${n} (safe: 1) — pre-existing C5.4 L3-m1, same class as H55-1`);
    }

    // (2) handler-DECLARED 409 after a committed write (shape of crm deals.reassignDeal over the daily cap: ApprovalRequest + audit
    //     committed, then APPROVAL_REQUIRED → 409 approval_required) releases the claim ⇒ the same-key retry writes again.
    {
      const k = `${TAG}-decl409`;
      let runs = 0;
      const run = async () => {
        runs += 1;
        await write("decl409");
        throw new ApiError(409, "approval_required", "ส่งคำขออนุมัติแล้ว", "Approval required.");
      };
      const a = await withIdempotency(actor, mkReq(k), op, "{}", "req-d1", {}, run);
      const b = await withIdempotency(actor, mkReq(k), op, "{}", "req-d2", {}, run);
      const n = await rows("decl409");
      chk("HOLE-RV-I2-declared409-after-write", runs === 1 && n === 1, `write committed then ApiError 409 approval_required: ${a.status}/${b.status} replayed=${b.headers.get("Idempotent-Replayed")} · handler runs=${runs} (safe: 1) · rows=${n} (safe: 1) — pre-existing C5.4, kept by the fix1 ruling`);
    }

    // (3) FAITHFUL end-to-end through the real CRM REST route (dispatch → withIdempotency → op → service): a write that is ROLLED BACK
    //     by a transient tx error (interactive tx 30 s timeout while another connection holds the contact row lock → P2028).
    //     Records the cost of the conservative ruling: nothing was saved, yet the key answers 409 outcome_unknown for 24 h.
    {
      const c = await crm.contacts.createContact(shop.ctx, shop.owner, { firstName: `RV ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}` });
      const cid = c.contact.id as string;
      const key = (await AK.createApiKey({ tenantId: shop.tid }, `${TAG} rv`, { scopes: ["crm.contact.read", "crm.contact.update"], systemId: shop.S, createdById: shop.uid })).rawKey as string;
      const k = `${TAG}-p2028`;
      const hold = P.$transaction(async (tx: Any) => {
        await tx.$queryRawUnsafe(`SELECT "id" FROM "CrmContact" WHERE "id" = $1 FOR UPDATE`, cid);
        await sleep(36_000); // > the platform interactive-tx timeout (db.ts transactionOptions.timeout = 30 s) ⇒ the handler's tx expires (P2028)
      }, { timeout: 60_000, maxWait: 10_000 });
      await sleep(400);
      const t = Date.now();
      const r1 = await rest("PATCH", `/contacts/${cid}`, key, { firstName: `RV changed ${TAG}` }, k);
      const ms = Date.now() - t;
      await hold.catch(() => undefined);
      const r2 = await rest("PATCH", `/contacts/${cid}`, key, { firstName: `RV changed ${TAG}` }, k);
      const after = await P.crmContact.findUnique({ where: { id: cid }, select: { firstName: true } });
      const unchanged = after?.firstName === `RV ${TAG}`;
      const claimRow = await P.apiIdempotency.findFirst({ where: { tenantId: shop.tid, idemKey: k }, select: { status: true, expiresAt: true } });
      if (r1.status === 200) chk("RV-I3-route-p2028(injection)", false, `fault injection ineffective: the PATCH committed after ${ms} ms`);
      else chk("RV-I3-route-p2028", r1.status === 409 && r1.body?.error?.code === "idempotency_outcome_unknown" && r2.status === 409 && r2.replayed === "true" && unchanged,
        `real route, tx rolled back after ${ms} ms: first ${r1.status} ${r1.body?.error?.code} · same-key retry ${r2.status} replayed=${r2.replayed} · contact unchanged=${unchanged} · claim status=${claimRow?.status} ttl≈${claimRow ? ((claimRow.expiresAt.getTime() - Date.now()) / 3_600_000).toFixed(1) : "-"} h (NOTE: before fix1 this was 503 + same-key retry succeeded; now the client must check and use a new key)`);
    }

    // (4) the "not started" 503 branch is reachable only through ctl.beforeHandler — no production door calls it
    {
      const fs = await import("node:fs");
      const files = ["src/lib/api/dispatch.ts", "src/lib/modules/crm/api/dispatch.ts"].filter((f) => fs.existsSync(f));
      const users = files.filter((f) => fs.readFileSync(f, "utf8").includes("beforeHandler"));
      chk("RV-I4-beforeHandler-wired", users.length > 0, `doors that call ctl.beforeHandler: [${users.join(",")}] of [${files.join(",")}] (empty ⇒ the 503 "not started — retry same key" branch is dead code; builder note says dispatch wraps actorCan)`);
    }
    await P.apiIdempotency.deleteMany({ where: { tenantId: shop.tid } });
  });

  // ═══════════ RV-A · H55-2 — other doors that enable/disable/delete a CRM rule ═══════════
  await sub("RV-A", async () => {
    const shop = await mkShop("a");
    const { tid, S } = shop;
    const PA = (await import("@/lib/automation/actions" as string)) as Any;
    // OWNER writes a money-like rule and leaves it OFF; a member journey row exists (member module = prod-live)
    const rule = await auto.createRule(shop.ctx, shop.owner, { name: `${TAG} owner points`, trigger: { event: "crm.contact.updated" }, conditions: { mode: "AND", items: [] }, actions: [{ type: "GIVE_POINTS", params: { points: 100_000 } }], enabled: false });
    const victim = await auto.createRule(shop.ctx, shop.owner, { name: `${TAG} owner notify`, trigger: { event: "crm.contact.updated" }, conditions: { mode: "AND", items: [] }, actions: [{ type: "NOTIFY_STAFF", params: { to: "owner", text: "x" } }], enabled: true });
    const journey = await P.automationRule.create({ data: { tenantId: tid, scope: "MEMBER_JOURNEY", kind: "RULE", name: `${TAG} journey`, event: "member.created", actionType: "NOTIFY", actionConfig: {}, enabled: true } }).catch((e: Any) => ({ err: String(e?.message ?? e).slice(0, 160) }));
    // a STAFF with NO permission keys at all
    const uid = await mkUser("-nokeys");
    await P.membership.create({ data: { userId: uid, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    const cookie = await sessionCookie(uid, tid);
    const crmDoor = await call(() => auto.toggleRule({ tenantId: tid, systemId: S, actorUserId: uid }, { userId: uid, role: "STAFF", unitAccess: ["*"], permissions: {} }, rule.id, true));
    const t1 = await call(() => inScope(cookie, "/app/settings/automation", () => PA.toggleRuleAction(fd({ id: rule.id, enabled: "true" }))));
    const on = await P.automationRule.findUnique({ where: { id: rule.id }, select: { enabled: true } });
    const d1 = await call(() => inScope(cookie, "/app/settings/automation", () => PA.deleteRuleAction(fd({ id: victim.id }))));
    const gone = (await P.automationRule.count({ where: { id: victim.id } })) === 0;
    let jGone: boolean | string = "n/a";
    if (journey && !(journey as Any).err) {
      await call(() => inScope(cookie, "/app/settings/automation", () => PA.deleteRuleAction(fd({ id: (journey as Any).id }))));
      jGone = (await P.automationRule.count({ where: { id: (journey as Any).id } })) === 0;
    }
    chk("HOLE-RV-A1-platform-toggle", !crmDoor.ok && on?.enabled === false && !gone && jGone !== true,
      `STAFF with no keys: CRM door toggleRule → ${crmDoor.ok ? "ACCEPTED" : `refused ${crmDoor.err?.code ?? crmDoor.err?.name}`} · platform /app/settings/automation toggleRuleAction(CRM GIVE_POINTS 100,000 rule) → ${t1.ok ? "returned" : `threw ${String(t1.err?.message).slice(0, 60)}`} · enabled now=${on?.enabled} (safe: false) · deleteRuleAction(CRM rule) gone=${gone} (safe: false) · deleteRuleAction(member journey) gone=${jGone} (safe: false) ${(journey as Any)?.err ? `journey fixture err=${(journey as Any).err}` : ""}`);
    if (on?.enabled) await P.automationRule.update({ where: { id: rule.id }, data: { enabled: false } });

    // usability: what can a MANAGER (all CRM keys by role) automate when branch-limited (unitAccess [x]) or when visibility = TEAM?
    const board = null;
    void board;
    const muid = await mkUser("-mgr");
    await P.membership.create({ data: { userId: muid, tenantId: tid, role: "MANAGER", unitAccess: ["unit-qc-x"], permissions: { "member.point.adjust": true, "member.promo.issue": true, "chat.message.send": true }, acceptedAt: new Date() } });
    const stage = shop.stages.find((s: Any) => s.kind === "OPEN");
    const TYPES: [string, Record<string, unknown>][] = [
      ["MOVE_STAGE", { stageId: stage.id }], ["ASSIGN", { userId: shop.uid }], ["CREATE_ACTIVITY", { type: "TASK", title: "t" }], ["CREATE_DEAL", { pipelineId: shop.pipe.id, titleTpl: "d" }],
      ["SEND_EMAIL", { subject: "s", template: "b" }], ["SEND_LINE", { template: "b" }], ["SEND_PUSH", { template: "b" }], ["ENROLL_SEQUENCE", {}], ["SET_FIELD", { objectKey: "contact", key: "k", value: "v" }],
      ["ADD_TAG", { tag: "vip" }], ["ADJUST_SCORE", { points: 5 }], ["NOTIFY_STAFF", { to: "owner", text: "x" }], ["WEBHOOK", { url: "https://example.com/qc-c55-rv" }], ["GIVE_POINTS", { points: 10 }],
    ];
    const tryAll = async (actor: Any) => {
      const okT: string[] = [];
      for (const [type, params] of TYPES) {
        const r = await call(() => auto.createRule({ tenantId: tid, systemId: S, actorUserId: muid }, actor, { name: `${TAG} mgr ${type} ${Math.random().toString(36).slice(2, 6)}`, trigger: { event: "crm.contact.updated" }, conditions: { mode: "AND", items: [] }, actions: [{ type, params }], enabled: false }));
        if (r.ok) okT.push(type);
      }
      return okT;
    };
    const branchMgr = await tryAll({ userId: muid, role: "MANAGER", unitAccess: ["unit-qc-x"], permissions: { "member.point.adjust": true, "member.promo.issue": true, "chat.message.send": true } });
    await P.membership.updateMany({ where: { userId: muid, tenantId: tid }, data: { unitAccess: ["*"] } });
    await setCrm(S, { visibility: { MANAGER: "TEAM" } });
    const teamMgr = await tryAll({ userId: muid, role: "MANAGER", unitAccess: ["*"], permissions: { "member.point.adjust": true, "member.promo.issue": true, "chat.message.send": true } });
    await setCrm(S, { visibility: { MANAGER: "ALL" } });
    const allMgr = await tryAll({ userId: muid, role: "MANAGER", unitAccess: ["*"], permissions: { "member.point.adjust": true, "member.promo.issue": true, "chat.message.send": true } });
    chk("RV-A2-manager-scope(info)", allMgr.length >= branchMgr.length, `MANAGER accepted action types · branch-limited: [${branchMgr.join(",")}] · TEAM visibility: [${teamMgr.join(",")}] · whole-shop ALL: [${allMgr.join(",")}]`);
  });

  // ═══════════ RV-W · S7.2 question: does CRM webhook delivery work on v2? (own events only — consumers called directly) ═══════════
  await sub("RV-W", async () => {
    const shop = await mkShop("w");
    const WH = (await import("@/lib/webhooks/service" as string)) as Any;
    const OBC = (await import("@/lib/outbox-consumers" as string)) as Any;
    const ep = await WH.createEndpoint({ tenantId: shop.tid }, { url: `https://${HOOK_HOST}/crm`, events: ["crm.deal.won", "crm.contact.created"] });
    const t0 = new Date(Date.now() - 1000);
    const c = await crm.contacts.createContact(shop.ctx, shop.owner, { firstName: `RVW ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}` });
    const open = shop.stages.find((s: Any) => s.kind === "OPEN");
    const won = shop.stages.find((s: Any) => s.kind === "WON");
    const d = await crm.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: open.id, title: `RVW deal ${TAG}`, contactId: c.contact.id, valueSatang: 10_000 });
    const mv = await call(() => crm.deals.moveDeal(shop.ctx, shop.owner, d.id, { stageId: won.id }));
    // keep other drainers off our rows, then run the real consumers on OUR events only
    await P.outboxEvent.updateMany({ where: { tenantId: shop.tid, status: "PENDING" }, data: { availableAt: new Date(Date.now() + 86_400_000) } });
    const evts = (await P.outboxEvent.findMany({ where: { tenantId: shop.tid, type: { in: ["crm.deal.won", "crm.contact.created"] }, createdAt: { gte: t0 } }, orderBy: { createdAt: "asc" } })) as Any[];
    const before = HOOKS.length;
    const errs: string[] = [];
    for (const e of evts) {
      const r = await call(() => OBC.consumers[e.type](e));
      if (!r.ok) errs.push(`${e.type}: ${String(r.err?.message ?? r.err).slice(0, 80)}`);
    }
    await P.outboxEvent.updateMany({ where: { id: { in: evts.map((e) => e.id) } }, data: { status: "DONE", processedAt: new Date() } });
    const mine = HOOKS.slice(before);
    const types = mine.map((h) => { try { return String(JSON.parse(h.body).type); } catch { return "?"; } });
    const sigOk = mine.length > 0 && mine.every((h) => h.headers["x-shark-signature"] === createHmac("sha256", ep.secret).update(h.body).digest("hex") &&
      h.headers["x-shark-signature-v2"] === createHmac("sha256", ep.secret).update(`${h.headers["x-shark-timestamp"]}.${h.body}`).digest("hex"));
    const okRows = await P.webhookDelivery.count({ where: { tenantId: shop.tid, endpointId: ep.id, status: "OK" } });
    const wonBody = mine.map((h) => JSON.parse(h.body)).find((b: Any) => b?.type === "crm.deal.won");
    const nCreated = evts.filter((e) => e.type === "crm.contact.created").length;
    chk("RV-W1-crm-webhook-delivery", mv.ok && types.includes("crm.deal.won") && types.includes("crm.contact.created") && sigOk && okRows >= 2 && j(wonBody?.payload).includes(d.id) && errs.length === 0,
      `CRM v2 shop · endpoint {crm.deal.won, crm.contact.created} · createContact + moveDeal→WON (${mv.ok ? "ok" : String(mv.err?.message).slice(0, 80)}) · events=${evts.map((e) => e.type).join(",")} · delivered=${types.join(",")} · signatures ok=${sigOk} · WebhookDelivery OK=${okRows} · consumer errors=${errs.join(" | ") || "-"} · crm.contact.created events for ONE create=${nCreated}`);
  });
} catch (e) {
  chk("RV-ERR", false, String((e as Error)?.stack ?? e).slice(0, 800));
} finally {
  await P.session.deleteMany({ where: { userId: { in: SESS_USERS } } }).catch(() => undefined);
  if (appEnvBefore === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = appEnvBefore;
  await done("probe-review");
}
