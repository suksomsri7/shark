// C5.5-fix3a probe — RED/GREEN for six small fixes (fix1 review round 2: R2-1 · R2-2 · R2-3 · import.run 429 · hunt 2b: H2b-2 · H2b-3)
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf3-*` (swept in done()) · own journal sequences dropped · own instrumented copies of the
// allocator (cf3_alloc_*) dropped · own rate-limit bucket deleted · network blocked (fetch) — DNS of example.com is used by the SSRF check.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf3/probe-cf3.mts [--only=R21,R22,R23,IMP,JNO,AR]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean).map((s) => s.toUpperCase());
const want = (s: string) => ONLY.length === 0 || ONLY.includes(s);
const fx = await fixture("p");
const { P, chk, call, mkShop, mkUser, setCrm, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 160) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const THAI = /[ก-๙]/;
const sub = async (id: string, fn: () => Promise<void>) => {
  if (!want(id)) return;
  console.log(`\n── ${id} ──`);
  try {
    await fn();
  } catch (e) {
    chk(`${id}-ERR`, false, String((e as Error)?.stack ?? e).slice(0, 700));
  }
};

// ── Next request scope (technique of probe-fix1 / qc-crm-c5.3): server actions run with a real session cookie ──
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf3", "x-forwarded-for": "203.0.113.158" } });
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
const fdx = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
// ── REST in-process ──
const AK = (await import("@/lib/api-keys/service" as string)) as Any;
let seq = 0;
async function restOf(mod: "crm" | "account", method: string, path: string, key: string, body?: unknown, idem?: string) {
  const ROUTE = (await import((mod === "crm" ? "@/app/api/v1/crm/[...path]/route" : "@/app/api/v1/account/[...path]/route") as string)) as Any;
  const headers: Record<string, string> = { authorization: `Bearer ${key}` };
  if (method !== "GET") headers["idempotency-key"] = idem ?? `${TAG}-${(seq += 1)}`;
  let b: string | undefined;
  if (body !== undefined && method !== "GET") {
    b = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  const res: Response = await ROUTE[method](new Request(`http://qc.invalid/api/v1/${mod}${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
  const text = await res.text();
  let parsed: Any = null;
  try { parsed = JSON.parse(text); } catch { parsed = { _raw: text.slice(0, 200) }; }
  return { status: res.status, body: parsed, replayed: res.headers.get("Idempotent-Replayed") };
}
const ACC_SYSTEMS: string[] = [];
const BUCKETS: string[] = [];
const FNS: string[] = [];
const rand = TAG.slice(-8);

// a shop with CRM (v2 unless told otherwise) + linked ACCOUNT + a MANAGER without CRM whole-shop rights (crm.api.manage)
const mkWorld = async (label: string, crmV2: boolean) => {
  const shop = await mkShop(label, { account: true });
  ACC_SYSTEMS.push(shop.A);
  if (!crmV2) await setCrm(shop.S, { uiVersion: 1 });
  const mid = await mkUser(`-${label}m`);
  await P.membership.create({ data: { userId: mid, tenantId: shop.tid, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  return { ...shop, mid, mCookie: await sessionCookie(mid, shop.tid), oCookie: await sessionCookie(shop.uid, shop.tid) };
};
const epRow = (tid: string, url: string) => P.webhookEndpoint.findFirst({ where: { tenantId: tid, url }, select: { id: true, eventsJson: true, active: true } });

try {
  const WH = (await import("@/lib/webhooks/actions" as string)) as Any;
  const CONN = (await import("@/lib/modules/account/connections-actions" as string)) as Any;
  const v1 = await mkWorld("w1", false);
  const v2 = await mkWorld("w2", true);
  const connPath = (A: string) => `/app/sys/${A}/account/settings/connections`;

  // ═══════════════════════ R2-1 · a request naming only foreign/unknown events must not become an all-events endpoint ═══════════════════════
  await sub("R21", async () => {
    const cp = connPath(v1.A);
    const a1: Any = await inScope(v1.oCookie, cp, () => CONN.createWebhookAction(fdx({ systemId: v1.A, url: "https://example.com/qc-cf3-a1", events: ["crm.deal.won"] })));
    const a2: Any = await inScope(v1.oCookie, cp, () => CONN.createWebhookAction(fdx({ systemId: v1.A, url: "https://example.com/qc-cf3-a2", events: ["member.created"] })));
    const a1row = await epRow(v1.tid, "https://example.com/qc-cf3-a1");
    const a2row = await epRow(v1.tid, "https://example.com/qc-cf3-a2");
    chk("R21-account-refuse", a1?.ok === false && THAI.test(String(a1?.reason)) && !a1row && a2?.ok === false && !a2row,
      `account connections page, OWNER (CRM v1 shop): ["crm.deal.won"] → ${a1?.ok ? `ok stored=${j(a1row?.eventsJson)}` : `refused "${cut(a1?.reason, 70)}"`} · ["member.created"] → ${a2?.ok ? `ok stored=${j(a2row?.eventsJson)}` : "refused"} (want refused, nothing stored)`);
    const a3: Any = await inScope(v1.oCookie, cp, () => CONN.createWebhookAction(fdx({ systemId: v1.A, url: "https://example.com/qc-cf3-a3", events: ["account.document.issued", "pos.sale.paid"] })));
    const a4: Any = await inScope(v1.oCookie, cp, () => CONN.createWebhookAction(fdx({ systemId: v1.A, url: "https://example.com/qc-cf3-a4" })));
    const a3row = await epRow(v1.tid, "https://example.com/qc-cf3-a3");
    const a4row = await epRow(v1.tid, "https://example.com/qc-cf3-a4");
    chk("R21-account-control", a3?.ok === true && j(a3row?.eventsJson) === j(["account.document.issued"]) && a4?.ok === true && j(a4row?.eventsJson) === j([]),
      `control: [account.*, pos.*] → ${a3?.ok ? "ok" : a3?.reason} stored=${j(a3row?.eventsJson)} (filtered as before) · no events → ${a4?.ok ? "ok" : a4?.reason} stored=${j(a4row?.eventsJson)} (= all events, the page's stated meaning)`);
    // platform page: a crafted form naming only unknown events
    const p1: Any = await inScope(v1.oCookie, "/app/settings/webhooks", () => WH.createEndpointAction({ status: "idle" }, fdx({ url: "https://example.com/qc-cf3-p1", events: ["bogus.event"] })));
    const p1row = await epRow(v1.tid, "https://example.com/qc-cf3-p1");
    const p3: Any = await inScope(v1.oCookie, "/app/settings/webhooks", () => WH.createEndpointAction({ status: "idle" }, fdx({ url: "https://example.com/qc-cf3-p3", events: ["bogus.event", "account.document.issued"] })));
    const p3row = await epRow(v1.tid, "https://example.com/qc-cf3-p3");
    const p2: Any = p3row ? await inScope(v1.oCookie, "/app/settings/webhooks", () => WH.updateEndpointEventsAction({ status: "idle" }, fdx({ id: p3row.id, events: ["bogus.event"] }))) : null;
    const p2row = p3row ? await P.webhookEndpoint.findUnique({ where: { id: p3row.id }, select: { eventsJson: true } }) : null;
    chk("R21-platform-refuse", p1?.status === "error" && !p1row && p2?.status === "error" && j(p2row?.eventsJson) === j(["account.document.issued"]),
      `platform /app/settings/webhooks: create ["bogus.event"] → ${p1?.status} ${p1?.status === "ok" ? `stored=${j(p1row?.eventsJson)}` : cut(p1?.message, 60)} · update events ["bogus.event"] → ${p2?.status} stored=${j(p2row?.eventsJson)} (want error · unchanged)`);
    chk("R21-platform-control", p3?.status === "ok" && j(p3row?.eventsJson) === j(["account.document.issued"]), `control: create [bogus, account.*] → ${p3?.status} stored=${j(p3row?.eventsJson)}`);
    // account REST doors: verified to have no such hole (unknown → 422, foreign known events are stored as named, never widened)
    const key = (await AK.createApiKey({ tenantId: v1.tid }, `${TAG} acc`, { scopes: ["account.settings.manage"], systemId: v1.A, createdById: v1.uid })).rawKey as string;
    const r1 = await restOf("account", "POST", "/webhooks", key, { url: "https://example.com/qc-cf3-r1", events: ["bogus.event"] });
    const r2 = await restOf("account", "POST", "/webhooks", key, { url: "https://example.com/qc-cf3-r2", events: ["crm.deal.won"] });
    const r2row = await epRow(v1.tid, "https://example.com/qc-cf3-r2");
    const r3 = r2row ? await restOf("account", "PATCH", `/webhooks/${r2row.id}`, key, { events: ["bogus.event"] }) : { status: 0, body: null };
    const r3row = r2row ? await P.webhookEndpoint.findUnique({ where: { id: r2row.id }, select: { eventsJson: true } }) : null;
    chk("R21-account-rest-no-hole", r1.status === 422 && !(await epRow(v1.tid, "https://example.com/qc-cf3-r1")) && r2.status === 200 && j(r2row?.eventsJson) === j(["crm.deal.won"]) && r3.status === 422 && j(r3row?.eventsJson) === j(["crm.deal.won"]),
      `account REST (OWNER key, CRM v1 shop): POST [bogus] → ${r1.status} · POST [crm.deal.won] → ${r2.status} stored=${j(r2row?.eventsJson)} (as named, CRM guard decides on v2) · PATCH [bogus] → ${r3.status} stored=${j(r3row?.eventsJson)}`);
  });

  // ═══════════════════════ R2-3 · a refused toggle-on answers through the action's result, never throws ═══════════════════════
  await sub("R23", async () => {
    const mk = (tid: string, url: string) => P.webhookEndpoint.create({ data: { tenantId: tid, url, secret: "x".repeat(48), eventsJson: [], active: false } });
    const e2 = await mk(v2.tid, "https://example.com/qc-cf3-t2");
    const t1 = await call(() => inScope(v2.mCookie, "/app/settings/webhooks", () => WH.toggleEndpointAction(fdx({ id: e2.id, active: "true" }))));
    const t1a = (await P.webhookEndpoint.findUnique({ where: { id: e2.id } }))?.active;
    const t2 = await call(() => inScope(v2.mCookie, connPath(v2.A), () => CONN.updateWebhookAction(fdx({ systemId: v2.A, id: e2.id, op: "on" }))));
    const t2a = (await P.webhookEndpoint.findUnique({ where: { id: e2.id } }))?.active;
    const d = (r: Any) => (r.ok ? `returned ${j(r.v)}` : `THREW ${cut((r.err as Error)?.name, 30)}: ${cut((r.err as Error)?.message, 60)}`);
    chk("R23-refused-returns-reason", t1.ok && t1.v?.ok === false && THAI.test(String(t1.v?.reason)) && t1a === false && t2.ok && t2.v?.ok === false && THAI.test(String(t2.v?.reason)) && t2a === false,
      `CRM v2 shop · MANAGER without crm.api.manage · all-events endpoint: platform toggle-on → ${d(t1)} active=${t1a} · account connections toggle-on → ${d(t2)} active=${t2a} (want {ok:false, Thai reason}, still inactive)`);
    const e1 = await mk(v1.tid, "https://example.com/qc-cf3-t1");
    const c1 = await call(() => inScope(v1.mCookie, "/app/settings/webhooks", () => WH.toggleEndpointAction(fdx({ id: e1.id, active: "true" }))));
    const c1a = (await P.webhookEndpoint.findUnique({ where: { id: e1.id } }))?.active;
    await P.webhookEndpoint.update({ where: { id: e1.id }, data: { active: false } });
    const c2 = await call(() => inScope(v1.mCookie, connPath(v1.A), () => CONN.updateWebhookAction(fdx({ systemId: v1.A, id: e1.id, op: "on" }))));
    const c2a = (await P.webhookEndpoint.findUnique({ where: { id: e1.id } }))?.active;
    chk("R23-control-no-v2", c1.ok && c1.v?.ok === true && c1a === true && c2.ok && c2.v?.ok === true && c2a === true,
      `CRM v1 shop · same MANAGER role: platform toggle-on → ${d(c1)} active=${c1a} · account toggle-on → ${d(c2)} active=${c2a} (unchanged behaviour)`);
    const src = readFileSync("src/app/app/settings/webhooks/page.tsx", "utf8");
    chk("R23-page-uses-result", /<WebhookToggleButton\b/.test(src) && !/<form action=\{toggleEndpointAction\}/.test(src),
      `platform page renders the client toggle that shows the reason: ${/<WebhookToggleButton\b/.test(src)} · bare <form action={toggleEndpointAction}> left: ${/<form action=\{toggleEndpointAction\}/.test(src)}`);
  });

  // ═══════════════════════ R2-2 · empty guard registry fails CLOSED for CRM / all-events endpoints ═══════════════════════
  await sub("R22", async () => {
    const child = (args: string[]) => {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/pending/cf3/noroot-child.mts", ...args], { encoding: "utf8", env: process.env, timeout: 180_000 });
      const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("CHILD_JSON "));
      return line ? (JSON.parse(line.slice(11)) as Any) : { error: cut(`${r.status} ${r.stderr}`, 400) };
    };
    // (a) service imported WITHOUT the composition root: the first guarded call loads it ⇒ the CRM guard runs (CRM v2 shop, limited MANAGER)
    const e = await P.webhookEndpoint.create({ data: { tenantId: v2.tid, url: "https://example.com/qc-cf3-g1", secret: "x".repeat(48), eventsJson: ["account.document.issued"], active: true } });
    const a = child(["noroot", v2.tid, e.id, v2.mid]);
    const aRow = await P.webhookEndpoint.findUnique({ where: { id: e.id }, select: { eventsJson: true } });
    chk("R22-root-loaded-by-service", a.rootBefore === false && /^WebhookGuardError: /.test(String(a.allEvents)) && !/ยังไม่พร้อม/.test(String(a.allEvents)) && j(aRow?.eventsJson) === j(["account.document.issued"]),
      `child imports only @/lib/webhooks/service (root loaded before the call: ${a.rootBefore}, after: ${a.rootAfter}) · set events [] by MANAGER on a CRM v2 shop → ${cut(a.allEvents ?? a.error, 110)} · stored ${j(aRow?.eventsJson)}`);
    // (b) composition root replaced by an EMPTY module ⇒ registry empty after the import (CRM v1 shop: a registered guard would pass everything)
    const e2 = await P.webhookEndpoint.create({ data: { tenantId: v1.tid, url: "https://example.com/qc-cf3-g2", secret: "x".repeat(48), eventsJson: [], active: false } });
    const b = child(["empty", v1.tid, e2.id]);
    const closed = (x: unknown) => /^WebhookGuardError: .*ยังไม่พร้อม/.test(String(x));
    const bRow = await P.webhookEndpoint.findUnique({ where: { id: e2.id }, select: { eventsJson: true, active: true } });
    const created = await epRow(v1.tid, "https://example.com/qc-cf3-empty");
    chk("R22-empty-registry-fails-closed", !b.error && closed(b.toggleOnAll) && closed(b.allEvents) && closed(b.crm) && closed(b.customRecord) && closed(b.team) && closed(b.createAll) && !created,
      `empty registry: toggle-on of an all-events endpoint → ${cut(b.toggleOnAll ?? b.error, 60)} · set [] → ${cut(b.allEvents, 40)} · [crm.*] → ${cut(b.crm, 40)} · [custom.record.*] → ${cut(b.customRecord, 40)} · [team.*] → ${cut(b.team, 40)} · create [] → ${cut(b.createAll, 40)} (created row: ${!!created})`);
    chk("R22-empty-registry-others-pass", b.toggleOff === "ok" && b.member === "ok" && b.noBy === "ok" && bRow?.active === false && j(bRow?.eventsJson) === j(["member.created"]),
      `same child: toggle-off → ${cut(b.toggleOff, 40)} · set [member.created] → ${cut(b.member, 40)} · author-less script call → ${cut(b.noBy, 40)} · stored ${j(bRow?.eventsJson)} active=${bRow?.active}`);
    const svc = (await import("@/lib/webhooks/service" as string)) as Any;
    const crmEv = (await import("@/lib/modules/crm/api/webhook-events" as string)) as Any;
    chk("R22-prefixes-in-sync", j(svc.WEBHOOK_GUARDED_EVENT_PREFIXES) === j(crmEv.CRM_EVENT_PREFIXES), `platform copy ${j(svc.WEBHOOK_GUARDED_EVENT_PREFIXES)} vs CRM_EVENT_PREFIXES ${j(crmEv.CRM_EVENT_PREFIXES)}`);
    // static: every src/ call of the three writers passes the author (probe-fix1 WB-static, re-run here on QC2)
    const fs = await import("node:fs");
    const pathM = await import("node:path");
    const files: string[] = [];
    const walk = (dir: string) => { for (const x of fs.readdirSync(dir, { withFileTypes: true })) { const f = pathM.join(dir, x.name); if (x.isDirectory()) walk(f); else if (/\.(ts|tsx)$/.test(x.name)) files.push(f); } };
    walk("src");
    const bad: string[] = [];
    let n = 0;
    for (const f of files) {
      if (f.endsWith("src/lib/webhooks/service.ts")) continue;
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/\b(createEndpoint|setEndpointActive|setEndpointEvents)\(/g)) {
        const start = (m.index ?? 0) + m[0].length;
        let depth = 1, i = start, commas = 0;
        for (; i < src.length && depth > 0; i += 1) { const ch = src[i]; if ("([{".includes(ch!)) depth += 1; else if (")]}".includes(ch!)) depth -= 1; else if (ch === "," && depth === 1) commas += 1; }
        const args = src.slice(start, i - 1);
        if (/^\s*$/.test(args)) continue;
        n += 1;
        const ok = m[1] === "createEndpoint" ? /\bby\s*:/.test(args) : commas >= 3;
        if (!ok) bad.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    chk("R22-static-all-doors-pass-author", n >= 13 && bad.length === 0, `src/ calls of the 3 writers = ${n} · without author: [${bad.join(", ")}]`);
  });

  // ═══════════════════════ IMP · account import.run 429 (per-book limit) is released: a same-key retry after the window runs ═══════════════════════
  await sub("IMP", async () => {
    const bucket = `acc:import:${v1.A}`;
    BUCKETS.push(bucket);
    const key = (await AK.createApiKey({ tenantId: v1.tid }, `${TAG} imp`, { scopes: ["account.import"], systemId: v1.A, createdById: v1.uid })).rawKey as string;
    const keyRow = await P.apiKey.findFirst({ where: { tenantId: v1.tid, name: `${TAG} imp` }, select: { id: true } });
    await P.chatRateBucket.upsert({ where: { key: bucket }, create: { key: bucket, count: 20, windowStart: new Date() }, update: { count: 20, windowStart: new Date() } });
    const body = { kind: "contacts", text: `ชื่อ\nลูกค้า ${TAG}`, mapping: { name: 0 } };
    const idem = `${TAG}-imp`;
    const contacts0 = await P.accountContact.count({ where: { systemId: v1.A } });
    const first = await restOf("account", "POST", "/import/run", key, body, idem);
    const contacts1 = await P.accountContact.count({ where: { systemId: v1.A } });
    const rows1 = await P.apiIdempotency.count({ where: { keyId: keyRow?.id ?? "-", idemKey: idem } });
    await P.chatRateBucket.update({ where: { key: bucket }, data: { windowStart: new Date(Date.now() - 2 * 3_600_000) } }); // the hour has passed
    const retry = await restOf("account", "POST", "/import/run", key, body, idem);
    const contacts2 = await P.accountContact.count({ where: { systemId: v1.A } });
    chk("IMP-429-released", first.status === 429 && first.body?.error?.code === "rate_limited" && contacts1 === contacts0 && rows1 === 0,
      `1st call with the per-book import bucket full → ${first.status} ${first.body?.error?.code} · contacts ${contacts0}→${contacts1} (nothing written) · idempotency rows for the key after the 429: ${rows1} (want 0 = released)`);
    chk("IMP-same-key-retry-runs", retry.status === 200 && retry.replayed !== "true" && contacts2 === contacts1 + 1,
      `same Idempotency-Key after the window → ${retry.status} replayed=${retry.replayed} ${retry.status === 200 ? j(retry.body?.data) : j(retry.body?.error?.code)} · contacts ${contacts1}→${contacts2} (want 200, not replayed, 1 created)`);
    const src = readFileSync("src/lib/modules/account/api/ops/import.ts", "utf8");
    const h = src.slice(src.indexOf('id: "import.run"'));
    const firstStmt = h.slice(h.indexOf("async handler"), h.indexOf("async handler") + 200);
    chk("IMP-guard-is-first-statement", /async handler\(\{ actor, input \}\) \{\s*const rate = await accountRateGuard\("import", actor\.systemId\);\s*if \(!rate\.ok\) rateLimited\(rate\.reason\);/.test(firstStmt),
      `import.run handler starts with the rate guard (only write before the 429 = the bucket counter): ${cut(firstStmt.replace(/\s+/g, " "), 150)}`);
  });

  // ═══════════════════════ JNO · H2b-2 allocator slow path (gap > 1000) serialised per (system, book) ═══════════════════════
  await sub("JNO", async () => {
    const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
    const acc = (await import("@/lib/modules/account/service" as string)) as Any;
    const A = (await sysSvc.createSystem(v1.tid, "ACCOUNT", `acc ${TAG} jno`)).id as string;
    ACC_SYSTEMS.push(A);
    await acc.saveSettings(v1.tid, A, { orgName: `QC cf3 jno`, taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
    const bkk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date());
    const ym = `${bkk.slice(0, 4)}-${bkk.slice(5, 7)}`;
    const prefix = `RV-${ym}-`;
    const pad = (n: number) => String(n).padStart(4, "0");
    const rows = [];
    for (let n = 2; n <= 1601; n += 1) rows.push({ tenantId: v1.tid, systemId: A, docNo: `${prefix}${pad(n)}`, book: "RECEIPTS", journal: "ADJUST", date: new Date(), periodKey: ym, source: "AUTO", memo: "cf3 foreign" });
    for (let i = 0; i < rows.length; i += 500) await P.accountJournalEntry.createMany({ data: rows.slice(i, i + 500) });
    await P.$queryRawUnsafe(`SELECT public.account_jno_ensure($1,'RECEIPTS')::text AS r`, A);
    const seqName = ((await P.$queryRawUnsafe(`SELECT public.account_jno_seq_name($1,'RECEIPTS') AS n`, A)) as Any[])[0].n as string;
    // instrumented copies (own names, dropped at the end): a 400 ms sleep right after the slow path reads the sequence ⇒ the interleaving of H2b-2
    const stmtOf = (file: string) => {
      const t = readFileSync(file, "utf8");
      const i = t.indexOf("CREATE OR REPLACE FUNCTION public.account_alloc_journal_no(");
      return i < 0 ? "" : t.slice(i, t.indexOf("END $$;", i) + "END $$;".length);
    };
    const mkCopy = async (label: string, file: string, readStmt: string) => {
      const s0 = stmtOf(file);
      const name = `cf3_alloc_${label}_${rand}`;
      if (!s0 || !s0.includes(readStmt)) return { name: "", why: `${file}: statement/read not found` };
      const s1 = s0.replace("public.account_alloc_journal_no(", `public.${name}(`).replace(readStmt, `${readStmt} PERFORM pg_sleep(0.4);`);
      await P.$executeRawUnsafe(s1);
      FNS.push(name);
      return { name, why: "" };
    };
    const OLD = "prisma/migrations/20261104000001_account_journal_no_sequence/migration.sql";
    // round 2 (review F1): the allocator in force is the 000003 body (lock before the ≤ 1000 / > 1000 split); 000002 stays as applied.
    //   "new" = the latest file, so JNO-new-forced-window copies it and JNO-deployed-is-new compares QC2 with it.
    const NEW = "prisma/migrations/20261104000003_account_journal_no_alloc_lock_v2/migration.sql";
    const oldCopy = await mkCopy("old", OLD, "EXECUTE format('SELECT last_value FROM %s', r) INTO v;");
    const newCopy = await mkCopy("new", NEW, "EXECUTE format('SELECT last_value, is_called FROM %s', r) INTO v, c;");
    // one "cashier" = a money transaction: allocate · insert its journal row · hold the transaction (row uncommitted) · commit
    const cashier = async (fn: string, startMs: number, holdMs: number) => {
      await sleep(startMs);
      try {
        return await P.$transaction(async (tx: Any) => {
          const n = Number(((await tx.$queryRawUnsafe(`SELECT public.${fn}($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n);
          await tx.accountJournalEntry.create({ data: { tenantId: v1.tid, systemId: A, docNo: `${prefix}${pad(n)}`, book: "RECEIPTS", journal: "ADJUST", date: new Date(), periodKey: ym, source: "AUTO", memo: "cf3 cashier" } });
          await sleep(holdMs);
          return { n, err: "" };
        }, { maxWait: 60_000, timeout: 60_000 });
      } catch (e) {
        return { n: -1, err: String((e as Any)?.code ?? (e as Any)?.meta?.code ?? (e as Error)?.message).slice(0, 80) };
      }
    };
    const round = async (fn: string, k: number, stagger: number, hold: number) => {
      await P.$queryRawUnsafe(`SELECT setval('public.${seqName}', 1, true)`); // the sequence behind a dense foreign block (restore/import shape)
      const floor0 = Number(((await P.$queryRawUnsafe(`SELECT public.account_jno_floor($1,'RECEIPTS') AS f`, A)) as Any[])[0].f);
      const got = await Promise.all(Array.from({ length: k }, (_, i) => cashier(fn, i * stagger, hold)));
      const ns = got.filter((g) => !g.err).map((g) => g.n);
      const errs = got.filter((g) => g.err).map((g) => g.err);
      const last = Number(((await P.$queryRawUnsafe(`SELECT last_value FROM public.${seqName}`)) as Any[])[0].last_value);
      return { ns, errs, dup: ns.length - new Set(ns).size, inBlock: ns.filter((n) => n <= floor0).length, behind: ns.filter((n) => n > last).length, floor0, last };
    };
    // positive control: the OLD slow path (copy of 20261104000001, same delay) reproduces the race — sequence moved back ⇒ the same number twice
    if (oldCopy.name) {
      const r = await round(oldCopy.name, 2, 150, 900);
      chk("JNO-old-race-reproduced", r.errs.length + r.dup > 0, `INFO positive control · old slow path with a 400 ms window, 2 cashiers 150 ms apart: values ${j(r.ns)} · failures ${j(r.errs)} · duplicates ${r.dup} (want ≥ 1 failure/duplicate = the backwards setval)`);
    } else chk("JNO-old-race-reproduced", false, oldCopy.why);
    // the NEW slow path (copy of the latest allocator file (000003 since round 2), same injected delay): serialised, re-read under the lock
    if (newCopy.name) {
      const r = await round(newCopy.name, 2, 150, 900);
      const r8 = await round(newCopy.name, 8, 100, 300);
      chk("JNO-new-forced-window", r.errs.length === 0 && r.dup === 0 && r.inBlock === 0 && r.behind === 0 && r8.errs.length === 0 && r8.dup === 0 && r8.inBlock === 0 && r8.behind === 0,
        `new slow path, same 400 ms window: 2 cashiers → ${j(r.ns)} fail ${j(r.errs)} · 8 cashiers 100 ms apart → ${j(r8.ns)} fail ${j(r8.errs)} · duplicates ${r.dup}/${r8.dup} · inside block ${r.inBlock}/${r8.inBlock} · above the sequence ${r.behind}/${r8.behind} (want all 0)`);
    } else chk("JNO-new-forced-window", false, newCopy.why);
    // the DEPLOYED function on QC2 must be the new one (byte-equal body + pinned search_path)
    const fileBody = (() => { const s = stmtOf(NEW); const i = s.indexOf("AS $$"); return i < 0 ? "" : s.slice(i + 5, s.lastIndexOf("$$;")); })();
    const db = ((await P.$queryRawUnsafe(`SELECT p.prosrc, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'account_alloc_journal_no'`)) as Any[])[0];
    chk("JNO-deployed-is-new", !!fileBody && db?.prosrc === fileBody && j(db?.proconfig) === j(["search_path=pg_catalog, public"]) && /pg_advisory_xact_lock/.test(String(db?.prosrc)),
      `QC2 account_alloc_journal_no: body equals ${NEW.split("/")[2]} → ${!!fileBody && db?.prosrc === fileBody} · proconfig ${j(db?.proconfig)} · advisory lock in body ${/pg_advisory_xact_lock/.test(String(db?.prosrc))}`);
    // deployed function under concurrency (no injected delay): 16 cashiers × 6 rounds, every round from the slow path
    let dups = 0, errs = 0, inBlock = 0, behind = 0, total = 0;
    const ex: string[] = [];
    for (let k = 0; k < 6; k += 1) {
      const r = await round("account_alloc_journal_no", 16, 0, 200);
      dups += r.dup; errs += r.errs.length; inBlock += r.inBlock; behind += r.behind; total += r.ns.length;
      if ((r.dup || r.errs.length) && ex.length < 3) ex.push(`${j(r.ns)} ${j(r.errs)}`);
    }
    chk("JNO-deployed-parallel", dups === 0 && errs === 0 && inBlock === 0 && behind === 0 && total === 96,
      `deployed allocator, 16 parallel cashiers × 6 rounds forced into the slow path (sequence reset to 1 under a dense block ≥ 1600): ${total}/96 numbers · duplicates ${dups} · failures ${errs} · inside block ${inBlock} · above the sequence ${behind} ${j(ex)}`);
    // fast path stays lock-free: a free number takes no advisory lock; the slow path holds exactly one until commit
    const locksAfter = async (reset: boolean) => P.$transaction(async (tx: Any) => {
      if (reset) await tx.$queryRawUnsafe(`SELECT setval('public.${seqName}', 1, true)`);
      await tx.$queryRawUnsafe(`SELECT public.account_alloc_journal_no($1,'RECEIPTS',$2,4) AS n`, A, prefix);
      return Number(((await tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory'`)) as Any[])[0].n);
    });
    const fast = await locksAfter(false);
    const slow = await locksAfter(true);
    chk("JNO-fast-path-lock-free", fast === 0 && slow === 1, `advisory locks held after one allocation: free number (fast path) ${fast} · behind the block (slow path) ${slow} (want 0 · 1)`);
  });

  // ═══════════════════════ AR · H2b-3 at-risk "เลยวันคาดว่าจะปิด" = Thai day before today (same rule as the deal board) ═══════════════════════
  await sub("AR", async () => {
    const bridges = (await import("@/lib/modules/crm/ai-bridges" as string)) as Any;
    const deals = (await import("@/lib/modules/crm/deals" as string)) as Any;
    const contacts = (await import("@/lib/modules/crm/contacts" as string)) as Any;
    const shared = (await import("@/lib/modules/crm/deals-shared" as string)) as Any;
    const c = await contacts.createContact(v2.ctx, v2.owner, { firstName: "ลูกค้า", lastName: TAG.slice(-6) });
    const contactId = c.contact?.id ?? c.id;
    const stage = v2.stages[0].id;
    const mkDeal = async (title: string, day: string) => {
      const d = await deals.createDeal(v2.ctx, v2.owner, { pipelineId: v2.pipe.id, stageId: stage, title, contactId, expectedCloseAt: day, forecastCategory: "COMMIT" });
      await P.crmDeal.update({ where: { id: d.id }, data: { nextActivityAt: new Date("2027-06-01T03:00:00Z"), stalledAt: null } });
      return d.id as string;
    };
    const dToday = await mkDeal(`วันนี้ ${TAG}`, "2026-10-01");
    const dYest = await mkDeal(`เมื่อวาน ${TAG}`, "2026-09-30");
    const rowsBy = new Map<string, Date>((await P.crmDeal.findMany({ where: { id: { in: [dToday, dYest] } }, select: { id: true, expectedCloseAt: true } })).map((r: Any) => [r.id, r.expectedCloseAt]));
    const nows: [string, string][] = [["00:30 TH 1 Oct", "2026-09-30T17:30:00Z"], ["07:01 TH", "2026-10-01T00:01:00Z"], ["10:00 TH", "2026-10-01T03:00:00Z"], ["23:59 TH", "2026-10-01T16:59:00Z"]];
    const out: string[] = [];
    let good = true;
    for (const [label, iso] of nows) {
      const now = new Date(iso);
      const r = await bridges.atRiskDeals({ tenantId: v2.tid, systemId: v2.S }, v2.owner, { now });
      const over = (id: string) => !!r.items.find((x: Any) => x.dealId === id)?.reasons.includes("CLOSE_OVERDUE");
      const board = (id: string) => (shared.dayKey(rowsBy.get(id)) ?? "") < shared.thaiToday(now); // DealBoard: expectedCloseAt < nowKey (nowKey = thaiToday())
      const ok = !over(dToday) && over(dYest) && over(dToday) === board(dToday) && over(dYest) === board(dYest);
      good = good && ok;
      out.push(`${label}: today ${over(dToday) ? "OVERDUE" : "-"} · yesterday ${over(dYest) ? "OVERDUE" : "-"}${ok ? "" : " ❌"}`);
    }
    chk("AR-fixed-clock", good, `deal closing 2026-10-01 vs 2026-09-30 (fresh next activity, COMMIT): ${out.join(" | ")} (want today never overdue, yesterday always, = board)`);
    // real clock through the REST door (tool crm_deals_at_risk = GET /deals/at-risk) — today's Thai day vs yesterday's
    const realToday = shared.thaiToday(new Date());
    const realYest = shared.thaiToday(new Date(Date.now() - 86_400_000));
    const rToday = await mkDeal(`วันนี้จริง ${TAG}`, realToday);
    const rYest = await mkDeal(`เมื่อวานจริง ${TAG}`, realYest);
    const key = (await AK.createApiKey({ tenantId: v2.tid }, `${TAG} crm`, { scopes: ["crm.deal.read"], systemId: v2.S, createdById: v2.uid })).rawKey as string;
    const res = await restOf("crm", "GET", "/deals/at-risk", key);
    const items: Any[] = res.body?.data?.items ?? [];
    const o = (id: string) => !!items.find((x) => x.dealId === id)?.reasons?.includes("CLOSE_OVERDUE");
    chk("AR-rest-real-clock", res.status === 200 && !o(rToday) && o(rYest), `GET /deals/at-risk at ${new Date().toISOString()} (Thai day ${realToday}): today's deal ${o(rToday) ? "OVERDUE" : "not overdue"} · yesterday's (${realYest}) ${o(rYest) ? "OVERDUE" : "not overdue"} · status ${res.status}`);
    // one rule for every surface: home table, tool and task proposals all read atRiskDeals; the reason is computed in one place
    const src = readFileSync("src/lib/modules/crm/ai-bridges.ts", "utf8");
    const pushes = (src.match(/reasons\.push\("CLOSE_OVERDUE"\)/g) ?? []).length;
    const home = readFileSync("src/components/crm/ai/CrmAiHomeAtRisk.tsx", "utf8");
    const op = readFileSync("src/lib/modules/crm/api/ops/assist.ts", "utf8");
    chk("AR-one-source", pushes === 1 && /atRiskDeals\(/.test(op) && /risk = await atRiskDeals\(/.test(src) && /atRiskDeals|runAssist/.test(home),
      `CLOSE_OVERDUE computed at ${pushes} place(s) · REST/tool op → atRiskDeals ${/atRiskDeals\(/.test(op)} · task proposals (runAssist) → atRiskDeals ${/risk = await atRiskDeals\(/.test(src)}`);
  });
} catch (e) {
  chk("PROBE-ERR", false, String((e as Error)?.stack ?? e).slice(0, 800));
} finally {
  await done("probe-cf3", async () => {
    for (const f of FNS) await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.${f}(text, text, text, int)`);
    for (const A of ACC_SYSTEMS) await P.$queryRawUnsafe(`SELECT public.account_jno_drop($1)::text AS x`, A).catch(() => undefined);
    for (const b of BUCKETS) await P.chatRateBucket.deleteMany({ where: { key: b } });
    await P.session.deleteMany({ where: { userId: { in: SESS_USERS } } }).catch(() => undefined);
    const fnLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE 'cf3_alloc_%'`)) as Any[])[0].n);
    const seqLeft = ACC_SYSTEMS.length ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind = 'S' AND (${ACC_SYSTEMS.map((_, i) => `relname LIKE 'acc_jno_' || $${i + 1} || '_%'`).join(" OR ")})`, ...ACC_SYSTEMS)) as Any[])[0].n) : 0;
    const bLeft = await P.chatRateBucket.count({ where: { key: { in: BUCKETS.length ? BUCKETS : ["-"] } } });
    chk("CLEAN-db-objects", fnLeft === 0 && seqLeft === 0 && bLeft === 0, `instrumented functions left ${fnLeft} · journal sequences left ${seqLeft} · rate buckets left ${bLeft}`);
  });
}
