// C5.5-fix1 ROUND 2 — independent review probe (read-only on src/). QC3 only · throwaway tenants `qc-c55-rv2-*` (swept in done()) · network blocked.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c55/review-r2/probe-review-r2.mts
//   R2-I1  RV-1 stale claim: two concurrent same-key retries + the original owner finishing late ⇒ never runs, one CAS winner, owner cannot overwrite
//          (run 1 aged a live owner's claim by editing createdAt — that also changed the owner's CAS key, so run 2 inserts the aged claim directly)
//   R2-I2  RV-6 differential: for each approval-policy shape, verdict exported to CRM (manualAdjustVerdict / manualIssueVerdict) vs the REAL manual door
//          (adjustWithApproval / voucher issue) by the same MANAGER — APPROVAL ⇔ door went pending, DIRECT ⇔ door applied
//   R2-I3  account connections page: events filtered to account.* — what is stored when the request names only non-account events
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
const { fixture } = (await import("../_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("rv2");
const { P, chk, mkShop, mkUser, setCrm, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(`${id}-ERR`, false, String((e as Error)?.stack ?? e).slice(0, 700));
  }
};
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-c55-rv2", "x-forwarded-for": "203.0.113.158" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext: { after: (_t: Any) => undefined } };
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

try {
  // ═══════════════ R2-I1 · RV-1 stale claim under concurrency ═══════════════
  await sub("R2-I1", async () => {
    const shop = await mkShop("i1");
    const { withIdempotency } = (await import("@/lib/api/idempotency" as string)) as Any;
    const actor = { kind: "apikey", tenantId: shop.tid, keyId: `${TAG}-k`, module: "crm" };
    const op = { id: "qc.rv2.idem", method: "POST", path: "/qc", kind: "write", idempotency: "required" };
    const req = (k: string) => new Request("http://qc.invalid/api/v1/crm/qc", { method: "POST", headers: { "idempotency-key": k, "content-type": "application/json" }, body: "{}" });
    const codeOf = async (r: Response) => { try { return String(JSON.parse(await r.clone().text())?.error?.code ?? ""); } catch { return "?"; } };
    // the claim row exactly as the owner's INSERT leaves it (status NULL), but created 10 min ago (owner lambda died)
    const hash = (await import("node:crypto")).createHash("sha256").update("POST /api/v1/crm/qc\n{}").digest("hex");
    const mkClaim = async (k: string, ageMin: number) =>
      (await P.apiIdempotency.create({ data: { tenantId: shop.tid, keyId: actor.keyId, idemKey: k, requestHash: hash, expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(Date.now() - ageMin * 60_000) }, select: { id: true, createdAt: true } })) as { id: string; createdAt: Date };
    const k = `${TAG}-stale`;
    const own = await mkClaim(k, 10);
    let retryRuns = 0;
    const retry = (kk: string) => withIdempotency(actor, req(kk), op, "{}", `rq-${Math.random()}`, {}, async () => { retryRuns += 1; return { status: 200, body: { data: { ok: true } } }; });
    const [a, b] = (await Promise.all([retry(k), retry(k)])) as Response[];
    const ca = await codeOf(a), cb = await codeOf(b);
    const replayedCount = [a, b].filter((r) => r.headers.get("Idempotent-Replayed") === "true").length;
    // the owner wakes up late and writes its result with ITS ownership predicate (idempotency.ts ownWhere) ⇒ must be a no-op
    const late = await P.apiIdempotency.updateMany({ where: { id: own.id, status: null, createdAt: own.createdAt }, data: { status: 200, responseJson: { data: { owner: true } } } });
    const row = await P.apiIdempotency.findFirst({ where: { tenantId: shop.tid, idemKey: k }, select: { status: true, expiresAt: true } });
    const c = (await retry(k)) as Response;
    const cc = await codeOf(c);
    const nRows = await P.apiIdempotency.count({ where: { tenantId: shop.tid, idemKey: k } });
    const ttl = row ? (row.expiresAt.getTime() - Date.now()) / 3_600_000 : -1;
    chk("R2-I1-concurrent-stale", a.status === 409 && b.status === 409 && ca === "idempotency_outcome_unknown" && cb === "idempotency_outcome_unknown" && replayedCount === 1 && retryRuns === 0
      && late.count === 0 && row?.status === 409 && ttl > 23 && c.status === 409 && cc === "idempotency_outcome_unknown" && c.headers.get("Idempotent-Replayed") === "true" && nRows === 1,
      `claim NULL aged 10 min · 2 concurrent retries → ${a.status} ${ca} / ${b.status} ${cb} (replayed=${replayedCount}, want exactly 1 CAS winner) · retry runs=${retryRuns} (want 0) · owner's late result write count=${late.count} (want 0) · row status ${row?.status} ttl≈${ttl.toFixed(1)} h · 3rd retry ${c.status} ${cc} replayed=${c.headers.get("Idempotent-Replayed")} · rows=${nRows}`);
    // positive control: a claim younger than 6 min is NOT converted (still in progress) and its owner can still write
    const k2 = `${TAG}-young`;
    const own2 = await mkClaim(k2, 5);
    const y = (await retry(k2)) as Response;
    const cy = await codeOf(y);
    const rowY = await P.apiIdempotency.findFirst({ where: { tenantId: shop.tid, idemKey: k2 }, select: { status: true } });
    const late2 = await P.apiIdempotency.updateMany({ where: { id: own2.id, status: null, createdAt: own2.createdAt }, data: { status: 200, responseJson: { data: { owner: true } } } });
    chk("R2-I1-young(control)", y.status === 409 && cy === "idempotency_in_progress" && rowY?.status === null && late2.count === 1 && retryRuns === 0,
      `claim aged 5 min: retry → ${y.status} ${cy} (want in_progress) · row still NULL=${rowY?.status === null} · owner write count=${late2.count} (want 1)`);
    await P.apiIdempotency.deleteMany({ where: { tenantId: shop.tid } });
  });

  // ═══════════════ R2-I2 · RV-6 differential: CRM verdict vs the real manual door ═══════════════
  await sub("R2-I2", async () => {
    const shop = await mkShop("i2");
    const { tid } = shop;
    const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
    const unit = await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `สาขา ${TAG}`, slug: `${TAG}-u` } });
    const MSYS = (await sysSvc.createSystem(tid, "MEMBER", `สมาชิก ${TAG}`)).id as string;
    const PSYS = (await sysSvc.createSystem(tid, "POINT", `แต้ม ${TAG}`)).id as string;
    await sysSvc.linkUnit(tid, MSYS, unit.id);
    await sysSvc.linkUnit(tid, PSYS, unit.id);
    await P.pointSettings.upsert({ where: { tenantId: tid }, create: { tenantId: tid, adjustApprovalOver: 500 }, update: { adjustApprovalOver: 500 } });
    const muid = await mkUser("-i2mgr");
    await P.membership.create({ data: { userId: muid, tenantId: tid, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    const mgr = { userId: muid, role: "MANAGER", unitAccess: ["*"], permissions: {} };
    const cust = await P.customer.create({ data: { tenantId: tid, memberSystemId: MSYS, name: `ลูกค้า ${TAG}` } });
    const tpl = await P.voucherTemplate.create({ data: { tenantId: tid, systemId: MSYS, name: "ใหญ่", kind: "FIXED", value: 2_000_000, config: {}, validDays: 30, origin: "COMPENSATION" } });
    const point = (await import("@/lib/modules/point" as string)) as Any;
    const voucher = (await import("@/lib/modules/voucher" as string)) as Any;
    const mkPolicy = async (entityType: string, extra: Record<string, unknown>) =>
      (await P.approvalPolicy.create({ data: { tenantId: tid, name: `qc ${TAG} ${entityType}`, entityType, active: true, ...extra, steps: { create: [{ tenantId: tid, order: 1, approverRole: "OWNER" }] } } })).id as string;
    const lines: string[] = [];
    let mismatches = 0;
    let n = 0;
    const pointCase = async (label: string, policy: Record<string, unknown> | null) => {
      const pid = policy ? await mkPolicy("member.point.adjust", policy) : null;
      const verdict = await point.manualAdjustVerdict(tid, mgr, 600);
      const r = await point.adjustWithApproval({ tenantId: tid, systemId: PSYS, memberSystemId: MSYS, actorUserId: muid }, mgr, { customerId: cust.id, delta: 600, reason: `qc ${TAG} ${++n}` });
      const door = r?.pending ? "APPROVAL" : r?.applied ? "DIRECT" : "?";
      if (door !== verdict) mismatches += 1;
      lines.push(`pts ${label}: verdict=${verdict} door=${door}`);
      if (pid) await P.approvalPolicy.delete({ where: { id: pid } });
    };
    const voucherCase = async (label: string, policy: Record<string, unknown> | null) => {
      const pid = policy ? await mkPolicy("member.voucher.issue", policy) : null;
      const verdict = await voucher.manualIssueVerdict(tid, mgr, tpl.id, 1);
      const r = await voucher.issue({ tenantId: tid, systemId: MSYS, actorUserId: muid }, mgr, { customerIds: [cust.id], templateId: tpl.id, origin: "COMPENSATION", reason: `qc ${TAG} ${++n}` });
      const door = r?.pending ? "APPROVAL" : Array.isArray(r?.vouchers) && r.vouchers.length > 0 ? "DIRECT" : `?${j(r).slice(0, 60)}`;
      if (door !== verdict) mismatches += 1;
      lines.push(`vch ${label}: verdict=${verdict} door=${door}`);
      if (pid) await P.approvalPolicy.delete({ where: { id: pid } });
    };
    await pointCase("none", null);
    await pointCase("global", {});
    await pointCase("system=POINT", { systemId: PSYS });
    await pointCase("system=MEMBER", { systemId: MSYS });
    await pointCase("unit", { unitId: unit.id });
    await pointCase("threshold=1", { thresholdSatang: 1 });
    await pointCase("inactive", { active: false });
    await voucherCase("none", null);
    await voucherCase("global", {});
    await voucherCase("system=MEMBER", { systemId: MSYS });
    await voucherCase("system=POINT", { systemId: PSYS });
    await voucherCase("unit", { unitId: unit.id });
    await voucherCase("threshold=total+1", { thresholdSatang: 2_000_001 });
    await voucherCase("threshold=total", { thresholdSatang: 2_000_000 });
    const seenBoth = lines.some((l) => l.includes("verdict=APPROVAL")) && lines.some((l) => l.includes("verdict=DIRECT"));
    chk("R2-I2-verdict-equals-door", mismatches === 0 && seenBoth && lines.length === 14, `${lines.join(" · ")} · mismatches=${mismatches}`);
  });

  // ═══════════════ R2-I3 · account connections: non-account events requested ═══════════════
  await sub("R2-I3", async () => {
    const CONN = (await import("@/lib/modules/account/connections-actions" as string)) as Any;
    const fdx = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x); return f; };
    const out: string[] = [];
    let widened = 0;
    for (const [label, v2] of [["v1", false], ["v2", true]] as const) {
      const shop = await mkShop(`i3${label}`, { account: true });
      if (!v2) await setCrm(shop.S, { uiVersion: 1 });
      const cookie = await sessionCookie(shop.uid, shop.tid); // the OWNER (passes every guard)
      const path = `/app/sys/${shop.A}/account/settings/connections`;
      for (const [nm, evs] of [["crm", ["crm.deal.won"]], ["member", ["member.created"]], ["acc(control)", ["account.document.issued"]]] as const) {
        const url = `https://example.com/${TAG}-${label}-${nm.replace(/\W/g, "")}`;
        const r: Any = await inScope(cookie, path, () => CONN.createWebhookAction(fdx({ systemId: shop.A!, url, events: [...evs] })));
        const row = await P.webhookEndpoint.findFirst({ where: { tenantId: shop.tid, url }, select: { eventsJson: true } });
        const stored = j(row?.eventsJson ?? null);
        if (nm !== "acc(control)" && stored === "[]") widened += 1;
        out.push(`${label} ${nm} ${j(evs)} → ${r?.ok ? "ok" : `refused`} stored=${stored}`);
      }
    }
    // assert the SAFE behaviour (a request naming only non-account events must not become an all-events endpoint) — red = finding
    chk("R2-I3-no-silent-widening", widened === 0, `${out.join(" · ")} · requests widened to ALL events=${widened}`);
  });
} catch (e) {
  chk("RV2-ERR", false, String((e as Error)?.stack ?? e).slice(0, 800));
} finally {
  await P.session.deleteMany({ where: { userId: { in: SESS_USERS } } }).catch(() => undefined);
  await done("probe-review-r2");
}
