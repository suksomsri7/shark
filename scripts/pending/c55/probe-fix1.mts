// C5.5-fix1 probe — RED/GREEN for the controller rulings on the C5.5 hunt part 1 (H55-1 · H55-2 · L55-3 · L55-4).
// QC3 only · throwaway tenants `qc-c55-fix1-*` (swept in done()) · network blocked.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c55/probe-fix1.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("fix1");
const { P, chk, call, mkShop, mkUser, setCrm, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(`${id}-ERR`, false, String((e as Error)?.stack ?? e).slice(0, 700));
  }
};

// ── Next request scope (technique of probe-c54d-r2 / qc-crm-c5.3): server actions run with a real session cookie ──
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-c55-fix1", "x-forwarded-for": "203.0.113.157" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const afterContext = { after: (_task: Any) => undefined }; // drains are not needed here (no consumer is asserted)
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
// ── REST in-process (technique of qc-crm-c1.10 callRoute) ──
const ROUTE = (await import("@/app/api/v1/crm/[...path]/route" as string)) as Any;
let seq = 0;
async function rest(method: string, path: string, key: string, body?: unknown, idem?: string): Promise<{ status: number; body: Any; replayed: string | null }> {
  const headers: Record<string, string> = { authorization: `Bearer ${key}` };
  if (method !== "GET") headers["idempotency-key"] = idem ?? `${TAG}-${(seq += 1)}`;
  let b: string | undefined;
  if (body !== undefined && method !== "GET") {
    b = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  const res: Response = await ROUTE[method](new Request(`http://qc.invalid/api/v1/crm${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
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

try {
  // ═══════════════════════ H55-1 · idempotency: outcome unknown is never re-run ═══════════════════════
  await sub("H1", async () => {
    const shop = await mkShop("i");
    const { withIdempotency } = (await import("@/lib/api/idempotency" as string)) as Any;
    const { mapError } = (await import("@/lib/api/respond" as string)) as Any;
    const actor = { kind: "apikey", module: "crm", tenantId: shop.tid, systemId: shop.S, keyId: `${TAG}-key`, keyName: "probe", userId: shop.uid, scopes: [], membership: { role: "STAFF", unitAccess: ["*"], permissions: {} } };
    const op = { id: "probe.write", method: "POST", path: "/probe", kind: "write", action: "crm.contact.create" };
    const mkReq = (k: string) => new Request("https://shark.invalid/api/v1/crm/probe", { method: "POST", headers: { "idempotency-key": k, "content-type": "application/json" }, body: "{}" });
    const write = (label: string) => P.appNotification.create({ data: { tenantId: shop.tid, recipientUserId: shop.uid, title: `qc.c55f.${label}`, body: TAG } });
    const rows = (label: string) => P.appNotification.count({ where: { tenantId: shop.tid, title: `qc.c55f.${label}` } });
    const claim = (k: string) => P.apiIdempotency.findFirst({ where: { tenantId: shop.tid, idemKey: k } });
    const transient = (code = "P2024") => Object.assign(new Error("Timed out fetching a new connection from the connection pool."), { code, name: "PrismaClientKnownRequestError" });
    const errOf = async (r: Response) => {
      const b = JSON.parse(await r.text());
      return { code: String(b?.error?.code ?? ""), th: String(b?.error?.message_th ?? ""), en: String(b?.error?.message_en ?? "") };
    };
    const NOT_SAVED_TH = /ยังไม่ได้บันทึก|ไม่ได้บันทึก/;
    const NOT_SAVED_EN = /nothing was saved|not saved/i;

    // (A) the write committed, then a transient error on the follow-up read — first answer, retry with the SAME key, rows
    for (const code of ["P2024", "P1017", "ECONNRESET"]) {
      let runs = 0;
      const k = `${TAG}-A-${code}`;
      const runA = async () => {
        runs += 1;
        await write(`a${code}`);
        throw transient(code);
      };
      const a1 = await withIdempotency(actor, mkReq(k), op, "{}", "req-a1", {}, runA);
      const e1 = await errOf(a1);
      const a2 = await withIdempotency(actor, mkReq(k), op, "{}", "req-a2", {}, runA);
      const e2 = await errOf(a2);
      const n = await rows(`a${code}`);
      const row = await claim(k);
      const ttlH = row ? (row.expiresAt.getTime() - Date.now()) / 3_600_000 : -1;
      chk(`H1-A-${code}`, n === 1 && runs === 1 && e1.code === "idempotency_outcome_unknown" && e2.code === "idempotency_outcome_unknown" && a1.status === a2.status && a1.status === 409 && a2.headers.get("Idempotent-Replayed") === "true",
        `write committed then ${code}: status ${a1.status}/${a2.status} code ${e1.code}/${e2.code} replayed2=${a2.headers.get("Idempotent-Replayed")} · handler runs=${runs} (want 1) · rows=${n} (want 1)`);
      chk(`H1-A-${code}-msg`, !NOT_SAVED_TH.test(e1.th) && !NOT_SAVED_EN.test(e1.en) && /ใหม่/.test(e1.th) && /new/i.test(e1.en), `first answer does not claim "nothing saved" and tells to check then use a NEW key: th="${e1.th.slice(0, 120)}" en="${e1.en.slice(0, 120)}"`);
      chk(`H1-A-${code}-ttl`, !!row && row.status === 409 && ttlH > 23 && ttlH <= 24.01, `claim kept in outcome-unknown state with the normal TTL: status=${row?.status} ttl≈${ttlH.toFixed(2)} h`);
    }

    // (B) r2 · REAL DOORS — a transient error BEFORE the handler stays retryable with the same key (claim released / never made)
    {
      const RESP = (await import("@/lib/api/respond" as string)) as Any;
      const key = (await AK.createApiKey({ tenantId: shop.tid }, `${TAG} h1b`, { scopes: ["crm.contact.read", "crm.contact.create"], systemId: shop.S, createdById: shop.uid })).rawKey as string;
      // (B1) real CRM route: the API-key lookup (auth phase, before any claim) hits P1001 once
      const origFind = P.apiKey.findUnique;
      let fired = false;
      P.apiKey.findUnique = async (a: Any) => {
        if (!fired) { fired = true; throw transient("P1001"); }
        return origFind.call(P.apiKey, a);
      };
      const kb = `${TAG}-B1`;
      const name = `H1B ${TAG}`;
      let r1: Any;
      try { r1 = await rest("POST", "/contacts", key, { firstName: name }, kb); } finally { P.apiKey.findUnique = origFind; }
      const claimAfter = await claim(kb);
      const r2 = await rest("POST", "/contacts", key, { firstName: name }, kb);
      const nC = await P.crmContact.count({ where: { tenantId: shop.tid, firstName: name } });
      chk("H1-B-route", fired && r1.status === 503 && r1.body?.error?.code === "upstream_unavailable" && !claimAfter && r2.status === 200 && nC === 1,
        `real route POST /contacts, key lookup P1001 once: first ${r1.status} ${r1.body?.error?.code} · claim=${claimAfter ? "KEPT" : "none"} · same-key retry ${r2.status} · contacts=${nC} (want 1)`);
      // (B2) real core dispatch + withIdempotency + runOpAsActor: the scope check inside the claim (ctl.beforeHandler) hits P1001 once
      const { dispatch: coreDispatch } = (await import("@/lib/api/dispatch" as string)) as Any;
      const { CRM_API_CONFIG } = (await import("@/lib/modules/crm/api/config" as string)) as Any;
      const { z } = (await import("zod" as string)) as Any;
      let firedIn = false;
      let hRuns = 0;
      const synth: Any = { id: "probe.synth", method: "POST", path: "/probe-synth", kind: "write", input: z.object({}).strict(), summary: "probe", label: "probe", test: "probe",
        async handler() { hRuns += 1; await write("synth"); return { ok: true }; } };
      Object.defineProperty(synth, "action", { get() { if (!firedIn && (new Error().stack ?? "").includes("runOpAsActor")) { firedIn = true; throw transient("P1001"); } return "crm.contact.create"; } });
      const sreq = (k: string) => new Request("http://qc.invalid/api/v1/crm/probe-synth", { method: "POST", headers: { authorization: `Bearer ${key}`, "idempotency-key": k, "content-type": "application/json" }, body: "{}" });
      const ks = `${TAG}-B2`;
      const d1: Response = await coreDispatch([synth], "POST", sreq(ks), { path: ["probe-synth"] }, CRM_API_CONFIG);
      const d1b = JSON.parse(await d1.text());
      const claimD = await claim(ks);
      const d2: Response = await coreDispatch([synth], "POST", sreq(ks), { path: ["probe-synth"] }, CRM_API_CONFIG);
      const nS = await rows("synth");
      chk("H1-B-dispatch", firedIn && d1.status === 503 && d1b?.error?.code === "upstream_unavailable" && !claimD && d2.status === 200 && hRuns === 1 && nS === 1,
        `core dispatch, P1001 inside ctl.beforeHandler (scope check): first ${d1.status} ${d1b?.error?.code} · claim=${claimD ? "KEPT" : "released"} · retry ${d2.status} · handler runs=${hRuns} rows=${nS}`);

      // (S) r2 · RV-1 stale takeover never runs the handler: claim NULL 7 min (first attempt committed then died)
      const kst = `${TAG}-stale`;
      await write("stale");
      await P.apiIdempotency.create({ data: { tenantId: shop.tid, keyId: actor.keyId, idemKey: kst, requestHash: (await import("node:crypto")).createHash("sha256").update("POST /api/v1/crm/probe\n{}").digest("hex"), expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(Date.now() - 7 * 60_000) } });
      let sRuns = 0;
      const runS = async () => { sRuns += 1; await write("stale"); return { status: 200, body: { data: { ok: true } } }; };
      const s1 = await withIdempotency(actor, mkReq(kst), op, "{}", "req-s1", {}, runS);
      const es1 = await errOf(s1);
      const s2 = await withIdempotency(actor, mkReq(kst), op, "{}", "req-s2", {}, runS);
      const es2 = await errOf(s2);
      const rowS = await claim(kst);
      const ttlS = rowS ? (rowS.expiresAt.getTime() - Date.now()) / 3_600_000 : -1;
      chk("H1-stale", sRuns === 0 && (await rows("stale")) === 1 && s1.status === 409 && es1.code === "idempotency_outcome_unknown" && s2.status === 409 && es2.code === "idempotency_outcome_unknown" && s2.headers.get("Idempotent-Replayed") === "true" && rowS?.status === 409 && ttlS > 23,
        `stale NULL claim (7 min) after a committed write: ${s1.status} ${es1.code} → ${s2.status} ${es2.code} replayed=${s2.headers.get("Idempotent-Replayed")} · handler runs=${sRuns} (want 0) · claim status=${rowS?.status} ttl≈${ttlS.toFixed(1)} h`);

      // (F) r2 · RV-2 a thrown 409 is released ONLY when the thrower flags "nothing written"
      let fRuns = 0;
      const kf1 = `${TAG}-F1`;
      const runF1 = async () => { fRuns += 1; await write("f1"); throw new RESP.ApiError(409, "approval_required", "ส่งคำขออนุมัติแล้ว", "Approval required."); };
      const f1a = await withIdempotency(actor, mkReq(kf1), op, "{}", "req-f1a", {}, runF1);
      const f1b = await withIdempotency(actor, mkReq(kf1), op, "{}", "req-f1b", {}, runF1);
      chk("H1-flag-unflagged-kept", f1a.status === 409 && f1b.status === 409 && f1b.headers.get("Idempotent-Replayed") === "true" && fRuns === 1 && (await rows("f1")) === 1,
        `unflagged ApiError 409 after a write: ${f1a.status}/${f1b.status} replayed=${f1b.headers.get("Idempotent-Replayed")} runs=${fRuns} (want 1)`);
      let gRuns = 0;
      const kf2 = `${TAG}-F2`;
      const flag = typeof RESP.nothingWritten === "function" ? RESP.nothingWritten : (e: Any) => e;
      const runF2 = async () => { gRuns += 1; if (gRuns === 1) throw flag(new RESP.ApiError(409, "state_conflict", "สถานะไม่พร้อม", "Not ready.")); await write("f2"); return { status: 200, body: { data: { ok: true } } }; };
      const f2a = await withIdempotency(actor, mkReq(kf2), op, "{}", "req-f2a", {}, runF2);
      const f2b = await withIdempotency(actor, mkReq(kf2), op, "{}", "req-f2b", {}, runF2);
      chk("H1-flag-flagged-released(control)", f2a.status === 409 && f2b.status === 200 && gRuns === 2 && (await rows("f2")) === 1, `flagged nothing-written 409 before any write: ${f2a.status} then same-key retry ${f2b.status} · runs=${gRuns}`);
    }

    // (C) control: an ordinary (non-transient) error after the write is still stored and replayed — one row
    {
      let runs = 0;
      const k = `${TAG}-C`;
      const runC = async () => {
        runs += 1;
        await write("c");
        throw new Error("unexpected");
      };
      const c1 = await withIdempotency(actor, mkReq(k), op, "{}", "req-c1", {}, runC);
      const c2 = await withIdempotency(actor, mkReq(k), op, "{}", "req-c2", {}, runC);
      chk("H1-C(control)", c1.status === 422 && c2.status === 422 && c2.headers.get("Idempotent-Replayed") === "true" && runs === 1 && (await rows("c")) === 1, `ordinary error after write: ${c1.status}/${c2.status} replayed=${c2.headers.get("Idempotent-Replayed")} runs=${runs}`);
    }

    // (D) control: a handler that answers 503 itself (declared, e.g. DBD not configured) is still released (C5.4 L3-m1 unchanged)
    {
      let runs = 0;
      const k = `${TAG}-D`;
      const runD = async () => {
        runs += 1;
        return runs === 1 ? { status: 503, body: { error: { code: "upstream_unavailable" } } } : { status: 200, body: { data: { ok: true } } };
      };
      const d1 = await withIdempotency(actor, mkReq(k), op, "{}", "req-d1", {}, runD);
      const d2 = await withIdempotency(actor, mkReq(k), op, "{}", "req-d2", {}, runD);
      chk("H1-D(control)", d1.status === 503 && d2.status === 200 && runs === 2, `declared 503 then retry: ${d1.status}/${d2.status} runs=${runs}`);
    }

    // (E) the shared mapper (reads, key-less optional lane, outer catch) no longer promises "nothing was saved"
    const m = mapError(transient("P2024"));
    chk("H1-E", m.status === 503 && !NOT_SAVED_TH.test(m.message_th) && !NOT_SAVED_EN.test(m.message_en), `mapError(P2024) → ${m.status} ${m.code} th="${m.message_th}" en="${m.message_en}"`);

    // (F) the four REST guides document the new code
    const docs = ["CRM", "MEMBER", "KANBAN", "ACCOUNT"].map((n) => [n, readFileSync(`docs/api/${n}-API.md`, "utf8").includes("idempotency_outcome_unknown")] as const);
    chk("H1-F", docs.every(([, ok]) => ok), `docs/api/*-API.md mention idempotency_outcome_unknown: ${docs.map(([n, ok]) => `${n}=${ok}`).join(" ")}`);
    // (R) r2 · real door of RV-2: REST deals.reassign over the daily cap files ONE approval request and the same-key retry REPLAYS
    {
      const mUid = await mkUser("-h1mgr");
      await P.membership.create({ data: { userId: mUid, tenantId: shop.tid, role: "MANAGER", unitAccess: ["*"], permissions: { "crm.api.manage": true, "crm._maxReassignPerDay": 0 }, acceptedAt: new Date() } });
      const tA = await P.team.create({ data: { tenantId: shop.tid, name: `A ${TAG}` } });
      const tB = await P.team.create({ data: { tenantId: shop.tid, name: `B ${TAG}` } });
      const other = await mkUser("-h1rep");
      await P.membership.create({ data: { userId: other, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
      await P.teamMember.create({ data: { tenantId: shop.tid, teamId: tB.id, userId: other } });
      const pol = await P.approvalPolicy.create({ data: { tenantId: shop.tid, name: `qc ${TAG}`, entityType: "crm.reassign", active: true, steps: { create: [{ tenantId: shop.tid, order: 1, approverRole: "OWNER" }] } } });
      void pol;
      const crmF = (await import("@/lib/modules/crm" as string)) as Any;
      const c = await crmF.contacts.createContact(shop.ctx, shop.owner, { firstName: `R ${TAG}` });
      const open0 = shop.stages.find((x: Any) => x.kind === "OPEN");
      const d = await crmF.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: open0.id, title: `ดีล ${TAG}`, contactId: c.contact?.id ?? c.id });
      await P.crmDeal.update({ where: { id: d.id }, data: { teamId: tA.id } });
      const kRe = (await AK.createApiKey({ tenantId: shop.tid }, `${TAG} reassign`, { scopes: ["crm.deal.read", "crm.deal.update", "crm.deal.reassign"], systemId: shop.S, createdById: mUid })).rawKey as string;
      const kr = `${TAG}-reassign`;
      const a1 = await rest("PUT", `/deals/${d.id}/owner`, kRe, { ownerUserId: other }, kr);
      const a2 = await rest("PUT", `/deals/${d.id}/owner`, kRe, { ownerUserId: other }, kr);
      const reqs = await P.approvalRequest.count({ where: { tenantId: shop.tid, entityType: "crm.reassign" } });
      chk("H1-reassign-replay", a1.status === 409 && a1.body?.error?.code === "approval_required" && a2.status === 409 && a2.replayed === "true" && reqs === 1,
        `REST PUT /deals/{id}/owner over crm._maxReassignPerDay=0 (policy crm.reassign): ${a1.status} ${a1.body?.error?.code} → same key ${a2.status} replayed=${a2.replayed} · approval requests=${reqs} (want 1)`);
    }
    await P.apiIdempotency.deleteMany({ where: { tenantId: shop.tid } });
  });

  // ═══════════════════════ H55-2 · you cannot automate what you cannot do by hand ═══════════════════════
  await sub("H2", async () => {
    const shop = await mkShop("a");
    const { tid, S } = shop;
    await setCrm(S, { visibility: { STAFF: "ALL" } }); // the STAFF actors below see every record — only the KEY differs per check
    const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
    const K = (await sysSvc.createSystem(tid, "KANBAN", `บอร์ด ${TAG}`)).id as string;
    const board = await P.kanbanBoard.create({ data: { tenantId: tid, systemId: K, name: "ลับ", visibility: "PRIVATE", createdById: shop.uid } });
    await P.kanbanColumn.create({ data: { tenantId: tid, systemId: K, boardId: board.id, name: "รอทำ", sortOrder: 0, position: "a0" } });
    const stage = shop.stages.find((s: Any) => s.kind === "OPEN");
    // r1b: a member system + voucher templates (small ≤ staff cap · mid > staff cap ≤ approval ceiling · big > approval ceiling)
    const MSYS = (await sysSvc.createSystem(tid, "MEMBER", `สมาชิก ${TAG}`)).id as string;
    const mkTpl = async (name: string, value: number) => (await P.voucherTemplate.create({ data: { tenantId: tid, systemId: MSYS, name, kind: "FIXED", value, config: {}, validDays: 30, origin: "COMPENSATION" } })).id as string;
    const tplSmall = await mkTpl("เล็ก", 10_000);
    const tplMid = await mkTpl("กลาง", 200_000);
    const tplBig = await mkTpl("ใหญ่", 2_000_000);
    const auto = (await import("@/lib/modules/crm/automation" as string)) as Any;
    const ACT = (await import("@/app/app/sys/[id]/crm/settings/automation/actions" as string)) as Any;

    // every key some action's manual door needs (the "full" author holds all of them)
    const FULL: Record<string, true> = {
      "crm.automation.manage": true, "crm.deal.move": true, "crm.deal.update": true, "crm.deal.reassign": true, "crm.deal.create": true,
      "crm.contact.update": true, "crm.activity.create": true, "crm.email.send": true, "crm.sequence.enroll": true, "crm.score.manage": true,
      "crm.api.manage": true, "webhook.endpoint.create": true, "chat.message.send": true, "member.point.adjust": true, "member.promo.issue": true,
      "kanban.board.read": true,
    };
    const uid = await mkUser("-author");
    await P.membership.create({ data: { userId: uid, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: FULL, acceptedAt: new Date() } });
    await P.kanbanBoardMember.create({ data: { tenantId: tid, boardId: board.id, userId: uid, role: "EDITOR" } });
    const cookie = await sessionCookie(uid, tid);
    const sctx = { tenantId: tid, systemId: S, actorUserId: uid };
    const setPerms = async (perms: Record<string, true>, unitAccess: string[] = ["*"]) => {
      await P.membership.updateMany({ where: { userId: uid, tenantId: tid }, data: { permissions: perms, unitAccess } });
      return { userId: uid, role: "STAFF", unitAccess, permissions: perms };
    };
    const without = (keys: string[]) => Object.fromEntries(Object.entries(FULL).filter(([k]) => !keys.includes(k))) as Record<string, true>;

    type Case = { type: string; params: Record<string, unknown>; keys: string[]; label: RegExp };
    const CASES: Case[] = [
      { type: "MOVE_STAGE", params: { stageId: stage.id }, keys: ["crm.deal.move"], label: /ย้ายดีลไปขั้น/ },
      { type: "ASSIGN", params: { userId: shop.uid }, keys: ["crm.deal.reassign"], label: /มอบหมายผู้ดูแล/ },
      { type: "ASSIGN", params: { userId: shop.uid }, keys: ["crm.contact.update"], label: /มอบหมายผู้ดูแล/ },
      { type: "CREATE_ACTIVITY", params: { type: "TASK", title: "โทรกลับ" }, keys: ["crm.activity.create"], label: /สร้างงานติดตาม/ },
      { type: "CREATE_DEAL", params: { pipelineId: shop.pipe.id, titleTpl: "ดีล {ชื่อ}" }, keys: ["crm.deal.create"], label: /เปิดดีลใหม่/ },
      { type: "OPEN_KANBAN_CARD", params: { boardId: board.id, title: "การ์ด" }, keys: ["crm.activity.create"], label: /เปิดการ์ดในบอร์ดงาน/ },
      { type: "SEND_EMAIL", params: { subject: "สวัสดี", template: "ข้อความ" }, keys: ["crm.email.send"], label: /ส่งอีเมล/ },
      { type: "SEND_LINE", params: { template: "ข้อความ" }, keys: ["chat.message.send"], label: /ส่ง LINE/ },
      { type: "ENROLL_SEQUENCE", params: {}, keys: ["crm.sequence.enroll"], label: /ลงทะเบียน sequence/ },
      { type: "STOP_SEQUENCE", params: {}, keys: ["crm.sequence.enroll"], label: /หยุด sequence/ },
      { type: "SET_FIELD", params: { objectKey: "contact", key: "qcNote", value: "x" }, keys: ["crm.contact.update"], label: /ตั้งค่าฟิลด์/ },
      { type: "SET_FIELD", params: { objectKey: "deal", key: "qcNote", value: "x" }, keys: ["crm.deal.update"], label: /ตั้งค่าฟิลด์/ },
      { type: "ADD_TAG", params: { tag: "vip" }, keys: ["crm.contact.update"], label: /ติดแท็ก/ },
      { type: "REMOVE_TAG", params: { tag: "vip" }, keys: ["crm.contact.update"], label: /เอาแท็กออก/ },
      { type: "ADJUST_SCORE", params: { points: 5 }, keys: ["crm.score.manage"], label: /ปรับคะแนน/ },
      { type: "WEBHOOK", params: { url: "https://example.com/qc-c55-hook" }, keys: ["webhook.endpoint.create"], label: /ส่ง webhook/ },
      { type: "WEBHOOK", params: { url: "https://example.com/qc-c55-hook" }, keys: ["crm.api.manage"], label: /ส่ง webhook/ },
      { type: "ISSUE_VOUCHER", params: { templateId: tplSmall }, keys: ["member.promo.issue"], label: /ออก voucher/ },
      { type: "GIVE_POINTS", params: { points: 100 }, keys: ["member.point.adjust"], label: /ให้แต้ม/ },
      { type: "WAIT_THEN", params: { days: 2, thenActions: [{ type: "GIVE_POINTS", params: { points: 100 } }] }, keys: ["member.point.adjust"], label: /ให้แต้ม/ },
    ];
    const ruleOf = (c: Case, name: string) => ({ name, trigger: { event: "crm.contact.updated" }, conditions: { mode: "AND", items: [] }, actions: [{ type: c.type, params: c.params }] });
    const errText = (r: Any) => String(r?.error ?? r?.err?.message ?? "");
    let n = 0;
    for (const c of CASES) {
      const tagId = `${c.type}-${c.keys.join("+")}`;
      // UI door (server action, real session) — lacking the manual right
      await setPerms(without(c.keys));
      const uiNo: Any = await inScope(cookie, `/app/sys/${S}/crm/settings/automation`, () => ACT.createCrmRuleAction(S, ruleOf(c, `${TAG} ui-no ${++n}`)));
      // service door (same rule, the actor object)
      const svcNo = await call(() => auto.createRule(sctx, { userId: uid, role: "STAFF", unitAccess: ["*"], permissions: without(c.keys) }, ruleOf(c, `${TAG} svc-no ${++n}`)));
      // holding the right
      await setPerms(FULL);
      const uiYes: Any = await inScope(cookie, `/app/sys/${S}/crm/settings/automation`, () => ACT.createCrmRuleAction(S, ruleOf(c, `${TAG} ui-yes ${++n}`)));
      chk(`H2-${tagId}`, uiNo?.ok === false && c.label.test(errText(uiNo)) && !svcNo.ok && uiYes?.ok === true,
        `UI without ${c.keys.join("+")} → ${uiNo?.ok ? "ACCEPTED" : `refused "${errText(uiNo).slice(0, 110)}"`} · service → ${svcNo.ok ? "ACCEPTED" : `refused ${svcNo.err?.code}`} · UI with it → ${uiYes?.ok ? "accepted" : `refused "${errText(uiYes).slice(0, 110)}"`}`);
    }
    // actions that need nothing beyond the automation key (internal notices) — accepted for the bare author (control)
    await setPerms({ "crm.automation.manage": true });
    for (const c of [{ type: "NOTIFY_STAFF", params: { to: "owner", text: "แจ้ง {ชื่อ}" } }, { type: "SEND_PUSH", params: { template: "แจ้ง" } }]) {
      const r: Any = await inScope(cookie, `/app/sys/${S}/crm/settings/automation`, () => ACT.createCrmRuleAction(S, ruleOf(c as unknown as Case, `${TAG} bare ${++n}`)));
      chk(`H2-${c.type}(control)`, r?.ok === true, `bare author (only crm.automation.manage) saves ${c.type} → ${r?.ok ? "accepted" : `refused "${errText(r).slice(0, 110)}"`}`);
    }
    // the kanban board: not a member of the private board / only a VIEWER ⇒ refused (manual door = visible + EDITOR)
    await setPerms(FULL);
    await P.kanbanBoardMember.updateMany({ where: { boardId: board.id, userId: uid }, data: { role: "VIEWER" } });
    const viewer: Any = await inScope(cookie, `/app/sys/${S}/crm/settings/automation`, () => ACT.createCrmRuleAction(S, ruleOf(CASES[5]!, `${TAG} viewer ${++n}`)));
    await P.kanbanBoardMember.deleteMany({ where: { boardId: board.id, userId: uid } });
    const stranger: Any = await inScope(cookie, `/app/sys/${S}/crm/settings/automation`, () => ACT.createCrmRuleAction(S, ruleOf(CASES[5]!, `${TAG} stranger ${++n}`)));
    chk("H2-board", viewer?.ok === false && stranger?.ok === false, `OPEN_KANBAN_CARD on the private board as VIEWER → ${viewer?.ok ? "ACCEPTED" : "refused"} · as non-member → ${stranger?.ok ? "ACCEPTED" : "refused"} (${errText(stranger).slice(0, 90)})`);
    await P.kanbanBoardMember.create({ data: { tenantId: tid, boardId: board.id, userId: uid, role: "EDITOR" } });
    // visibility: the same keys but the author sees only his team ⇒ record actions refused; branch-limited ⇒ refused
    await setCrm(S, { visibility: { STAFF: "TEAM" } });
    const teamOnly: Any = await inScope(cookie, `/app/sys/${S}/crm/settings/automation`, () => ACT.createCrmRuleAction(S, ruleOf(CASES[0]!, `${TAG} team ${++n}`)));
    await setCrm(S, { visibility: { STAFF: "ALL" } });
    await setPerms(FULL, ["unit-qc-x"]);
    const branch: Any = await inScope(cookie, `/app/sys/${S}/crm/settings/automation`, () => ACT.createCrmRuleAction(S, ruleOf(CASES[12]!, `${TAG} branch ${++n}`)));
    await setPerms(FULL);
    chk("H2-visibility", teamOnly?.ok === false && branch?.ok === false, `MOVE_STAGE by an author who sees TEAM only → ${teamOnly?.ok ? "ACCEPTED" : `refused "${errText(teamOnly).slice(0, 100)}"`} · ADD_TAG by a branch-limited author → ${branch?.ok ? "ACCEPTED" : "refused"}`);

    // edit + enable doors: a rule written by the OWNER (disabled) — the bare author may not edit it into / switch on a rule he could not do by hand
    const pointsRule = { name: `${TAG} owner points`, trigger: { event: "crm.contact.updated" }, conditions: { mode: "AND", items: [] }, actions: [{ type: "GIVE_POINTS", params: { points: 500 } }], enabled: false };
    const own = await auto.createRule(shop.ctx, shop.owner, pointsRule);
    await setPerms(without(["member.point.adjust"]));
    const tOn: Any = await inScope(cookie, `/app/sys/${S}/crm/settings/automation`, () => ACT.toggleCrmRuleAction(S, own.id, true));
    const ed: Any = await inScope(cookie, `/app/sys/${S}/crm/settings/automation`, () => ACT.updateCrmRuleAction(S, own.id, { ...pointsRule, enabled: false, name: `${TAG} renamed` }));
    const stillOff = await P.automationRule.findUnique({ where: { id: own.id }, select: { enabled: true, name: true } });
    await P.automationRule.update({ where: { id: own.id }, data: { enabled: true } });
    const tOff: Any = await inScope(cookie, `/app/sys/${S}/crm/settings/automation`, () => ACT.toggleCrmRuleAction(S, own.id, false));
    await setPerms(FULL);
    const tOn2: Any = await inScope(cookie, `/app/sys/${S}/crm/settings/automation`, () => ACT.toggleCrmRuleAction(S, own.id, true));
    chk("H2-enable-edit", tOn?.ok === false && ed?.ok === false && stillOff?.enabled === false && stillOff?.name === pointsRule.name && tOff?.ok === true && tOn2?.ok === true,
      `author without member.point.adjust: enable → ${tOn?.ok ? "ACCEPTED" : "refused"} · edit → ${ed?.ok ? "ACCEPTED" : "refused"} · row ${j(stillOff)} · disable → ${tOff?.ok ? "allowed" : "refused"} · with the key enable → ${tOn2?.ok ? "accepted" : "refused"}`);

    // ── r1b · approval ceilings of money-like grants (at save / enable) ──
    await P.pointSettings.upsert({ where: { tenantId: tid }, create: { tenantId: tid, adjustApprovalOver: 500 }, update: { adjustApprovalOver: 500 } });
    const staffA = { userId: uid, role: "STAFF", unitAccess: ["*"], permissions: FULL };
    const muid = await mkUser("-mgr");
    await P.membership.create({ data: { userId: muid, tenantId: tid, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    const mgrA = { userId: muid, role: "MANAGER", unitAccess: ["*"], permissions: {} };
    const mctx = { tenantId: tid, systemId: S, actorUserId: muid };
    await setPerms(FULL);
    const ruleG = (type: string, params: Record<string, unknown>, enabled = true) => ({ name: `${TAG} grant ${++n}`, trigger: { event: "crm.contact.updated" }, conditions: { mode: "AND", items: [] }, actions: [{ type, params }], enabled });
    const ok = (r: Any) => (r.ok ? "ok" : `${r.err?.code}`);
    const mkPolicy = async (entityType: string) => (await P.approvalPolicy.create({ data: { tenantId: tid, name: `qc ${TAG} ${entityType}`, entityType, active: true, steps: { create: [{ tenantId: tid, order: 1, approverRole: "OWNER" }] } } })).id as string;
    // no approval policy: a MANAGER over the cap is auto-approved by hand (RV-6) ⇒ DIRECT; STAFF over the cap is refused by hand
    const g1 = await call(() => auto.createRule(sctx, staffA, ruleG("GIVE_POINTS", { points: 400 })));
    const g2 = await call(() => auto.createRule(sctx, staffA, ruleG("GIVE_POINTS", { points: 600 })));
    const g3 = await call(() => auto.createRule(mctx, mgrA, ruleG("GIVE_POINTS", { points: 600 })));
    const polP = await mkPolicy("member.point.adjust");
    const g3p = await call(() => auto.createRule(mctx, mgrA, ruleG("GIVE_POINTS", { points: 600 })));
    const g4 = await call(() => auto.createRule(shop.ctx, shop.owner, ruleG("GIVE_POINTS", { points: 600 })));
    const g5 = await call(() => auto.createRule(mctx, mgrA, ruleG("WAIT_THEN", { days: 1, thenActions: [{ type: "GIVE_POINTS", params: { points: 600 } }] })));
    chk("H2-ceiling-points", g1.ok && !g2.ok && g3.ok && !g3p.ok && g4.ok && !g5.ok && g2.err?.code === "FORBIDDEN" && g3p.err?.code === "FORBIDDEN",
      `adjustApprovalOver=500: STAFF 400 → ${ok(g1)} · STAFF 600 → ${ok(g2)} (manual: refused) · MANAGER 600 no policy → ${ok(g3)} (manual: auto-approved) · MANAGER 600 with policy → ${ok(g3p)} (manual: approval) · OWNER 600 → ${ok(g4)} · MANAGER WAIT_THEN›600 with policy → ${ok(g5)}`);
    const v1 = await call(() => auto.createRule(sctx, staffA, ruleG("ISSUE_VOUCHER", { templateId: tplSmall })));
    const v2 = await call(() => auto.createRule(sctx, staffA, ruleG("ISSUE_VOUCHER", { templateId: tplMid })));
    const v3 = await call(() => auto.createRule(mctx, mgrA, ruleG("ISSUE_VOUCHER", { templateId: tplMid })));
    const v4 = await call(() => auto.createRule(mctx, mgrA, ruleG("ISSUE_VOUCHER", { templateId: tplBig })));
    const polV = await mkPolicy("member.voucher.issue");
    const v4p = await call(() => auto.createRule(mctx, mgrA, ruleG("ISSUE_VOUCHER", { templateId: tplBig })));
    const v5 = await call(() => auto.createRule(shop.ctx, shop.owner, ruleG("ISSUE_VOUCHER", { templateId: tplBig })));
    const v6 = await call(() => auto.createRule(mctx, mgrA, ruleG("ISSUE_VOUCHER", { templateId: `${TAG}-none` })));
    chk("H2-ceiling-voucher", v1.ok && !v2.ok && v3.ok && v4.ok && !v4p.ok && v5.ok && !v6.ok && v4p.err?.code === "FORBIDDEN",
      `STAFF ฿100 → ${ok(v1)} · STAFF ฿2,000 (> staff cap) → ${ok(v2)} · MANAGER ฿2,000 → ${ok(v3)} · MANAGER ฿20,000 no policy → ${ok(v4)} (manual: auto-approved) · with policy → ${ok(v4p)} · OWNER ฿20,000 → ${ok(v5)} · MANAGER unknown template → ${ok(v6)}`);
    const offBig = await auto.createRule(shop.ctx, shop.owner, ruleG("GIVE_POINTS", { points: 600 }, false));
    const en1 = await call(() => auto.toggleRule(mctx, mgrA, offBig.id, true));
    await P.approvalPolicy.update({ where: { id: polP }, data: { active: false } });
    const en2 = await call(() => auto.toggleRule(mctx, mgrA, offBig.id, true));
    void polV;
    chk("H2-ceiling-enable", !en1.ok && en2.ok, `MANAGER enables the owner's 600-point rule (cap 500): policy active → ${ok(en1)} · policy switched off → ${ok(en2)}`);

    // REST + AI tool doors: no op / tool writes an automation rule (list + dry-run only) ⇒ nothing to bypass
    const key = await AK.createApiKey({ tenantId: tid }, `${TAG} admin`, { scopes: ["crm.automation.manage", "crm.contact.read"], systemId: S, createdById: shop.uid });
    const post = await rest("POST", "/automation/rules", key.rawKey, ruleOf(CASES[18]!, `${TAG} rest`));
    const patch = await rest("PATCH", `/automation/rules/${own.id}`, key.rawKey, { enabled: true });
    const reg = (await import("@/lib/modules/crm/api/registry" as string)) as Any;
    const ops: Any[] = reg.CRM_OPS ?? [];
    const autoWrites = ops.filter((o) => String(o.path).startsWith("/automation") && o.kind !== "read").map((o) => o.id);
    const tools = (await import("@/lib/modules/crm/api/tools" as string)) as Any;
    const toolWrites = (tools.crmToolInfos() as Any[]).filter((t) => /^automation\./.test(t.opId) && t.write).map((t) => t.name);
    const rulesAfter = await P.automationRule.count({ where: { tenantId: tid, name: `${TAG} rest` } });
    chk("H2-rest-tool", [404, 405].includes(post.status) && [404, 405].includes(patch.status) && autoWrites.length === 0 && toolWrites.length === 0 && rulesAfter === 0,
      `REST POST /automation/rules → ${post.status} · PATCH → ${patch.status} · write ops under /automation: [${autoWrites.join(",")}] · AI write tools: [${toolWrites.join(",")}] · rows=${rulesAfter}`);
  });

  // ═══════════════════════ H55-2 (sequences) · the step editor must be able to do each step by hand ═══════════════════════
  await sub("H2S", async () => {
    const shop = await mkShop("s");
    const { tid, S } = shop;
    const SEQ = (await import("@/lib/modules/crm/sequences" as string)) as Any;
    const uid = await mkUser("-seqeditor");
    await P.membership.create({ data: { userId: uid, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    const sctx = { tenantId: tid, systemId: S, actorUserId: uid };
    const FULL: Record<string, true> = { "crm.sequence.manage": true, "crm.email.send": true, "chat.message.send": true, "crm.activity.create": true };
    const actorOf = (drop: string[]) => ({ userId: uid, role: "STAFF", unitAccess: ["*"], permissions: Object.fromEntries(Object.entries(FULL).filter(([k]) => !drop.includes(k))) });
    const STEPS: Record<string, Any> = {
      EMAIL: { kind: "EMAIL", subject: "สวัสดี", body: "ข้อความ" },
      LINE: { kind: "LINE", body: "ข้อความ" },
      TASK: { kind: "TASK", taskTitle: "โทรหา" },
    };
    const KEY: Record<string, string> = { EMAIL: "crm.email.send", LINE: "chat.message.send", TASK: "crm.activity.create" };
    let n = 0;
    for (const kind of ["EMAIL", "LINE", "TASK"]) {
      const no = await call(() => SEQ.createSequence(sctx, actorOf([KEY[kind]!]), { name: `${TAG} no ${++n}`, steps: [STEPS[kind], { kind: "WAIT", waitDays: 1 }] }));
      const yes = await call(() => SEQ.createSequence(sctx, actorOf([]), { name: `${TAG} yes ${++n}`, steps: [STEPS[kind], { kind: "WAIT", waitDays: 1 }] }));
      chk(`H2S-${kind}`, !no.ok && no.err?.code === "FORBIDDEN" && yes.ok, `createSequence with a ${kind} step: editor without ${KEY[kind]} → ${no.ok ? "ACCEPTED" : `${no.err?.code} "${String(no.err?.message).slice(0, 90)}"`} · with it → ${yes.ok ? "accepted" : yes.err?.code}`);
    }
    const waitOnly = await call(() => SEQ.createSequence(sctx, actorOf(["crm.email.send", "chat.message.send", "crm.activity.create"]), { name: `${TAG} wait ${++n}`, steps: [{ kind: "WAIT", waitDays: 1 }] }));
    // re-opening for new enrolments (active:true, no steps sent) checks the steps of the current version
    const own = await SEQ.createSequence(shop.ctx, shop.owner, { name: `${TAG} owner ${++n}`, active: false, steps: [STEPS.EMAIL] });
    const reopenNo = await call(() => SEQ.updateSequence(sctx, actorOf(["crm.email.send"]), own.id, { active: true }));
    const closeOk = await call(() => SEQ.updateSequence(sctx, actorOf(["crm.email.send"]), own.id, { name: `${TAG} renamed` }));
    const reopenYes = await call(() => SEQ.updateSequence(sctx, actorOf([]), own.id, { active: true }));
    chk("H2S-reopen", waitOnly.ok && !reopenNo.ok && closeOk.ok && reopenYes.ok, `WAIT-only by a bare editor → ${waitOnly.ok ? "ok" : waitOnly.err?.code} · re-open EMAIL sequence without crm.email.send → ${reopenNo.ok ? "ACCEPTED" : reopenNo.err?.code} · rename → ${closeOk.ok ? "ok" : closeOk.err?.code} · re-open with the key → ${reopenYes.ok ? "ok" : reopenYes.err?.code}`);
    // REST door (sequences.create): a key holding crm.sequence.manage but not crm.email.send
    const k1 = (await AK.createApiKey({ tenantId: tid }, `${TAG} seq`, { scopes: ["crm.sequence.manage"], systemId: S, createdById: shop.uid })).rawKey as string;
    const k2 = (await AK.createApiKey({ tenantId: tid }, `${TAG} seq+mail`, { scopes: ["crm.sequence.manage", "crm.email.send"], systemId: S, createdById: shop.uid })).rawKey as string;
    const r1 = await rest("POST", "/sequences", k1, { name: `${TAG} rest1`, steps: [STEPS.EMAIL] });
    const r2 = await rest("POST", "/sequences", k2, { name: `${TAG} rest2`, steps: [STEPS.EMAIL] });
    chk("H2S-rest", r1.status === 403 && r2.status === 200, `REST POST /sequences (EMAIL step): key{manage} → ${r1.status} ${j(r1.body?.error?.code)} (want 403) · key{manage+email.send} → ${r2.status} ${r2.status === 200 ? "" : j(r2.body?.error)}`);
  });

  // ═══════════════════════ r1b · platform webhooks page: CRM events need the CRM "sees all" rule ═══════════════════════
  await sub("PW", async () => {
    const WH = (await import("@/lib/webhooks/actions" as string)) as Any;
    const LBL = (await import("@/lib/webhooks/labels" as string)) as Any;
    const nonCrm = (LBL.WEBHOOK_EVENTS as Any[]).map((e) => String(e.value)).find((v) => !/^(crm\.|custom\.record\.|team\.)/.test(v))!;
    const fd = (o: Record<string, string | string[]>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
      return f;
    };
    const create = (cookie: string, events: string[]) => inScope(cookie, "/app/settings/webhooks", () => WH.createEndpointAction({ status: "idle" }, fd({ url: "https://example.com/qc-c55-pw", events }))) as Promise<Any>;
    const update = (cookie: string, id: string, events: string[]) => inScope(cookie, "/app/settings/webhooks", () => WH.updateEndpointEventsAction({ status: "idle" }, fd({ id, events }))) as Promise<Any>;
    const st = (r: Any) => `${r?.status}${r?.status === "error" ? ` "${String(r?.message).slice(0, 70)}"` : ""}`;
    // shop with CRM v2 · a MANAGER without crm.api.manage (platform webhook keys pass for MANAGER)
    const shop = await mkShop("pw");
    const mid = await mkUser("-pwmgr");
    await P.membership.create({ data: { userId: mid, tenantId: shop.tid, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    const mc = await sessionCookie(mid, shop.tid);
    const oc = await sessionCookie(shop.uid, shop.tid);
    const all = await create(mc, []);
    const crmOnly = await create(mc, ["crm.deal.won"]);
    const plain = await create(mc, [nonCrm]);
    const ownerAll = await create(oc, []);
    const plainEp = await P.webhookEndpoint.findFirst({ where: { tenantId: shop.tid, eventsJson: { equals: [nonCrm] } }, select: { id: true } });
    const upAll = plainEp ? await update(mc, plainEp.id, []) : null;
    const upCrm = plainEp ? await update(mc, plainEp.id, [nonCrm, "crm.contact.created"]) : null;
    const upPlain = plainEp ? await update(mc, plainEp.id, [nonCrm]) : null;
    await P.membership.updateMany({ where: { userId: mid, tenantId: shop.tid }, data: { permissions: { "crm.api.manage": true } } });
    const wideAll = await create(mc, []);
    const n = await P.webhookEndpoint.count({ where: { tenantId: shop.tid } });
    chk("PW-crm-v2", all?.status === "error" && crmOnly?.status === "error" && plain?.status === "ok" && ownerAll?.status === "ok" && upAll?.status === "error" && upCrm?.status === "error" && upPlain?.status === "ok" && wideAll?.status === "ok" && n === 3,
      `tenant with CRM v2 · MANAGER w/o crm.api.manage: all-events → ${st(all)} · crm.deal.won → ${st(crmOnly)} · ${nonCrm} → ${st(plain)} · update→all ${st(upAll)} · update+crm ${st(upCrm)} · update non-CRM ${st(upPlain)} · OWNER all → ${st(ownerAll)} · MANAGER +crm.api.manage all → ${st(wideAll)} · endpoints=${n}`);
    // control: tenants WITHOUT a CRM v2 system (none · v1 only) behave exactly as before
    const t1 = await P.tenant.create({ data: { name: `${TAG}-pw-nocrm`, slug: `${TAG}-pw-nocrm` } });
    const v1shop = await mkShop("pwv1");
    await setCrm(v1shop.S, { uiVersion: 1 });
    const t2 = { id: v1shop.tid, slug: v1shop.slug };
    const out: string[] = [];
    let good = true;
    for (const t of [t1, t2]) {
      const u = await mkUser(`-pw-${t.id.slice(-4)}`);
      await P.membership.create({ data: { userId: u, tenantId: t.id, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
      const c = await sessionCookie(u, t.id);
      const a = await create(c, []);
      const b = await create(c, ["crm.deal.won"]);
      out.push(`${t.slug.slice(-6)}: all → ${st(a)} · crm.deal.won → ${st(b)}`);
      good = good && a?.status === "ok" && b?.status === "ok";
      if (t.id === t1.id) {
        // sweep the CRM-less tenant ourselves (mkShop tenants are swept by done())
        const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
        for (let pass = 0; pass < 3; pass += 1) for (const tb of tbs) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, t1.id).catch(() => undefined);
        await P.tenant.delete({ where: { id: t1.id } }).catch(() => undefined);
      }
    }
    const left = await P.tenant.count({ where: { id: t1.id } });
    out.push(`crm-less tenant left=${left}`);
    good = good && left === 0;
    chk("PW-control-no-v2", good, out.join(" | "));
  });

  // ═══════════════════════ r2 · webhook choke point: every door that writes an endpoint runs the CRM guard ═══════════════════════
  await sub("WB", async () => {
    const WH = (await import("@/lib/webhooks/actions" as string)) as Any;
    const CONN = (await import("@/lib/modules/account/connections-actions" as string)) as Any;
    const AROUTE = (await import("@/app/api/v1/account/[...path]/route" as string)) as Any;
    const arest = async (method: string, path: string, key: string, body: unknown) => {
      const res: Response = await AROUTE[method](new Request(`http://qc.invalid/api/v1/account${path}`, { method, headers: { authorization: `Bearer ${key}`, "idempotency-key": `${TAG}-${(seq += 1)}`, "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ path: path.split("/").filter(Boolean) }) });
      const t = await res.text();
      let b: Any = null;
      try { b = JSON.parse(t); } catch { b = { _raw: t.slice(0, 200) }; }
      return { status: res.status, body: b };
    };
    const fdx = (o: Record<string, string | string[]>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
      return f;
    };
    const run = async (label: string, crmV2: boolean) => {
      const shop = await mkShop(label, { account: true });
      if (!crmV2) await setCrm(shop.S, { uiVersion: 1 });
      const mid = await mkUser(`-${label}m`);
      await P.membership.create({ data: { userId: mid, tenantId: shop.tid, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
      const mc = await sessionCookie(mid, shop.tid);
      // an all-events endpoint made by the OWNER, then paused
      const ownerAll = await P.webhookEndpoint.create({ data: { tenantId: shop.tid, url: "https://example.com/qc-c55-all", secret: "x".repeat(48), eventsJson: [], active: false } });
      const out: Record<string, string> = {};
      // platform toggle (re-activation of an all-events endpoint)
      const pt = await call(() => inScope(mc, "/app/settings/webhooks", () => WH.toggleEndpointAction(fdx({ id: ownerAll.id, active: "true" }))));
      out.platformToggleOn = `${pt.ok ? "returned" : "threw"} active=${(await P.webhookEndpoint.findUnique({ where: { id: ownerAll.id } }))?.active}`;
      await P.webhookEndpoint.update({ where: { id: ownerAll.id }, data: { active: false } });
      // account connections page: create (crm event ⇒ filtered away ⇒ empty = all · and [] directly) · create account-only · toggle on
      const path = `/app/sys/${shop.A}/account/settings/connections`;
      const c1: Any = await inScope(mc, path, () => CONN.createWebhookAction(fdx({ systemId: shop.A!, url: "https://example.com/qc-c55-c1", events: ["crm.deal.won"] })));
      const c2: Any = await inScope(mc, path, () => CONN.createWebhookAction(fdx({ systemId: shop.A!, url: "https://example.com/qc-c55-c2", events: ["account.document.issued"] })));
      const c2row = await P.webhookEndpoint.findFirst({ where: { tenantId: shop.tid, url: "https://example.com/qc-c55-c2" }, select: { eventsJson: true } });
      const c3: Any = await inScope(mc, path, () => CONN.createWebhookAction(fdx({ systemId: shop.A!, url: "https://example.com/qc-c55-c3", events: ["account.document.issued", "pos.sale.paid"] })));
      const c3row = await P.webhookEndpoint.findFirst({ where: { tenantId: shop.tid, url: "https://example.com/qc-c55-c3" }, select: { eventsJson: true } });
      const ct: Any = await call(() => inScope(mc, path, () => CONN.updateWebhookAction(fdx({ systemId: shop.A!, id: ownerAll.id, op: "on" }))));
      const ctActive = (await P.webhookEndpoint.findUnique({ where: { id: ownerAll.id } }))?.active;
      await P.webhookEndpoint.update({ where: { id: ownerAll.id }, data: { active: false } });
      // account REST with a key created by the limited MANAGER
      const key = (await AK.createApiKey({ tenantId: shop.tid }, `${TAG} acc ${label}`, { scopes: ["account.settings.manage"], systemId: shop.A, createdById: mid })).rawKey as string;
      const r1 = await arest("POST", "/webhooks", key, { url: "https://example.com/qc-c55-r1", events: [] });
      const r2 = await arest("POST", "/webhooks", key, { url: "https://example.com/qc-c55-r2", events: ["crm.deal.won"] });
      const r3 = await arest("POST", "/webhooks", key, { url: "https://example.com/qc-c55-r3", events: ["account.document.issued"] });
      const r3id = r3.body?.data?.id as string | undefined;
      const r4 = r3id ? await arest("PATCH", `/webhooks/${r3id}`, key, { events: [] }) : { status: 0, body: null };
      const r5 = await arest("PATCH", `/webhooks/${ownerAll.id}`, key, { active: true });
      const r5Active = (await P.webhookEndpoint.findUnique({ where: { id: ownerAll.id } }))?.active;
      return { out, c1, c2, c2row, c3, c3row, ct, ctActive, r1, r2, r3, r4, r5, r5Active };
    };
    // static: every src/ call of the three writers passes the author (the deprecated no-`by` createEndpoint overload exists only for an untouchable oracle)
    {
      const fs = await import("node:fs");
      const pathM = await import("node:path");
      const files: string[] = [];
      const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = pathM.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(ts|tsx)$/.test(e.name)) files.push(f); } };
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
      chk("WB-static", n >= 13 && bad.length === 0, `src/ calls of createEndpoint/setEndpointActive/setEndpointEvents = ${n} · without author: [${bad.join(", ")}]`);
    }
    const v2 = await run("wb2", true);
    chk("WB-crm-v2-refused", v2.out.platformToggleOn.includes("active=false") && v2.c1?.ok === false && v2.c2?.ok === true && j(v2.c2row?.eventsJson) === j(["account.document.issued"]) && v2.c3?.ok === true && j(v2.c3row?.eventsJson) === j(["account.document.issued"]) && v2.ctActive === false
      && v2.r1.status === 403 && v2.r2.status === 403 && v2.r3.status === 200 && v2.r4.status === 403 && v2.r5.status === 403 && v2.r5Active === false,
      `tenant with CRM v2 · MANAGER w/o crm.api.manage: platform toggle-on(all events) → ${v2.out.platformToggleOn} · connections create [crm.deal.won] → ${v2.c1?.ok ? "ok" : `refused "${String(v2.c1?.reason).slice(0, 50)}"`} · [account.*] → ${v2.c2?.ok ? "ok" : v2.c2?.reason} stored=${j(v2.c2row?.eventsJson)} · [account.*,pos.*] stored=${j(v2.c3row?.eventsJson)} (filtered) · connections toggle on → active=${v2.ctActive} · REST create [] → ${v2.r1.status} · [crm.deal.won] → ${v2.r2.status} · [account.*] → ${v2.r3.status} · PATCH events [] → ${v2.r4.status} · PATCH active(all-events) → ${v2.r5.status} active=${v2.r5Active}`);
    const v1 = await run("wb1", false);
    chk("WB-control-no-v2", v1.out.platformToggleOn.includes("active=true") && v1.c2?.ok === true && v1.ctActive === true && v1.r1.status === 200 && v1.r3.status === 200 && v1.r4.status === 200 && v1.r5.status === 200,
      `tenant with CRM v1 only (no v2): platform toggle-on → ${v1.out.platformToggleOn} · connections toggle on → active=${v1.ctActive} · REST create [] → ${v1.r1.status} · [account.*] → ${v1.r3.status} · PATCH events [] → ${v1.r4.status} · PATCH active → ${v1.r5.status} (unchanged behaviour)`);
  });

  // ═══════════════════════ L55-3 · activity reschedule / delete: one key per operation ═══════════════════════
  await sub("L3", async () => {
    const shop = await mkShop("l3");
    const { tid, S } = shop;
    const ACTS = (await import("@/lib/modules/crm/activities" as string)) as Any;
    const contacts = (await import("@/lib/modules/crm/contacts" as string)) as Any;
    const UI = (await import("@/app/app/sys/[id]/crm/activities/_components/actions" as string)) as Any;
    const uid = await mkUser("-l3staff");
    await P.membership.create({ data: { userId: uid, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    const cookie = await sessionCookie(uid, tid);
    const setPerms = (perms: Record<string, true>) => P.membership.updateMany({ where: { userId: uid, tenantId: tid }, data: { permissions: perms } });
    const c = await contacts.createContact(shop.ctx, shop.owner, { firstName: "ลูกค้า", lastName: TAG.slice(-6), ownerUserId: uid });
    const contactId = c.contact?.id ?? c.id;
    // REST keys act as their creator (the OWNER) ⇒ their activities belong to the OWNER · the UI rows belong to the STAFF (assertEditor = owner of the row or manager)
    const mkAct = async (ownerUserId: string = uid) => (await ACTS.logActivity(shop.ctx, shop.owner, { type: "TASK", title: "งาน", contactId, dueAt: new Date(Date.now() + 86_400_000) }, { ownerUserId })).id as string;
    const when = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const mkKey = async (scopes: string[]) => (await AK.createApiKey({ tenantId: tid }, `${TAG} ${scopes.join(",")}`, { scopes, systemId: S, createdById: shop.uid })).rawKey as string;
    const kCreate = await mkKey(["crm.activity.read", "crm.activity.create"]);
    const kComplete = await mkKey(["crm.activity.read", "crm.activity.complete"]);
    const kDelete = await mkKey(["crm.activity.read", "crm.activity.delete"]);
    const a0 = await mkAct(shop.uid);
    const a1 = await mkAct();
    const r1 = await rest("PUT", `/activities/${a0}/schedule`, kCreate, { dueAt: when });
    const r2 = await rest("PUT", `/activities/${a0}/schedule`, kComplete, { dueAt: when });
    chk("L3-rest-reschedule", r1.status === 403 && r2.status === 200, `REST reschedule: key{create} → ${r1.status} (want 403) · key{complete} → ${r2.status} ${r2.status === 200 ? "" : j(r2.body?.error)} (want 200)`);
    await setPerms({ "crm.activity.complete": true });
    const u1: Any = await inScope(cookie, `/app/sys/${S}/crm/activities`, () => UI.rescheduleActivityAction(S, a1, { dueAt: when }));
    await setPerms({ "crm.activity.create": true });
    const u2: Any = await inScope(cookie, `/app/sys/${S}/crm/activities`, () => UI.rescheduleActivityAction(S, a1, { dueAt: when }));
    chk("L3-ui-reschedule", u1?.ok === true && u2?.ok === false, `UI reschedule: {complete} → ${u1?.ok ? "ok" : u1?.code} (want ok) · {create} → ${u2?.ok ? "ok" : u2?.code} (want refused)`);
    const a2 = await mkAct();
    const a3 = await mkAct(shop.uid);
    await setPerms({ "crm.activity.create": true });
    const d1: Any = await inScope(cookie, `/app/sys/${S}/crm/activities`, () => UI.deleteActivityAction(S, a2, { confirm: true, reason: "ทดสอบการลบ" }));
    await setPerms({ "crm.activity.delete": true });
    const d2: Any = await inScope(cookie, `/app/sys/${S}/crm/activities`, () => UI.deleteActivityAction(S, a2, { confirm: true, reason: "ทดสอบการลบ" }));
    const rd = await rest("DELETE", `/activities/${a3}`, kDelete, { confirm: true, reason: "ทดสอบการลบ" });
    const rc = await rest("DELETE", `/activities/${a3}`, kCreate, { confirm: true, reason: "ทดสอบการลบ" });
    chk("L3-delete", d1?.ok === false && d2?.ok === true && rd.status === 200 && rc.status === 403, `UI delete {create} → ${d1?.ok ? "ok" : d1?.code} (want refused) · UI {delete} → ${d2?.ok ? "ok" : d2?.code} (want ok) · REST key{delete} → ${rd.status} ${rd.status === 200 ? "" : j(rd.body?.error)} · REST key{create} on another → ${rc.status} (want 403)`);
  });

  // ═══════════════════════ L55-4 · CRM webhook endpoint: creator must see all records ═══════════════════════
  await sub("L4", async () => {
    const shop = await mkShop("l4");
    const { tid, S } = shop;
    const API = (await import("@/app/app/sys/[id]/crm/settings/api/actions" as string)) as Any;
    const uid = await mkUser("-l4mgr");
    await P.membership.create({ data: { userId: uid, tenantId: tid, role: "MANAGER", unitAccess: ["*"], permissions: { "crm.api.manage": true }, acceptedAt: new Date() } });
    const cookie = await sessionCookie(uid, tid);
    const fd = (o: Record<string, string | string[]>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
      return f;
    };
    const create = () => inScope(cookie, `/app/sys/${S}/crm/settings/api`, () => API.createCrmWebhookAction(fd({ systemId: S, url: "https://example.com/qc-c55-l4", events: ["crm.deal.won"] }))) as Promise<Any>;
    const okAll: Any = await create(); // MANAGER · whole shop · default visibility ALL ⇒ accepted
    await P.membership.updateMany({ where: { userId: uid, tenantId: tid }, data: { unitAccess: ["unit-qc-x"] } });
    const branch: Any = await create();
    await P.membership.updateMany({ where: { userId: uid, tenantId: tid }, data: { unitAccess: ["*"] } });
    await setCrm(S, { visibility: { MANAGER: "TEAM" } });
    const team: Any = await create();
    // activating an endpoint is an update: the narrow manager may switch an endpoint off, not on
    const epId = okAll?.id as string | undefined;
    const off: Any = epId ? await inScope(cookie, `/app/sys/${S}/crm/settings/api`, () => API.toggleCrmWebhookAction(fd({ systemId: S, endpointId: epId, active: "false" }))) : null;
    const on: Any = epId ? await inScope(cookie, `/app/sys/${S}/crm/settings/api`, () => API.toggleCrmWebhookAction(fd({ systemId: S, endpointId: epId, active: "true" }))) : null;
    const activeNow = epId ? (await P.webhookEndpoint.findUnique({ where: { id: epId }, select: { active: true } }))?.active : null;
    await setCrm(S, { visibility: { MANAGER: "ALL" } });
    const on2: Any = epId ? await inScope(cookie, `/app/sys/${S}/crm/settings/api`, () => API.toggleCrmWebhookAction(fd({ systemId: S, endpointId: epId, active: "true" }))) : null;
    const n = await P.webhookEndpoint.count({ where: { tenantId: tid } });
    chk("L4", okAll?.ok === true && branch?.ok === false && team?.ok === false && off?.ok === true && on?.ok === false && activeNow === false && on2?.ok === true && n === 1,
      `create: whole-shop ALL → ${okAll?.ok ? "ok" : okAll?.reason} · branch-limited → ${branch?.ok ? "ACCEPTED" : "refused"} · TEAM visibility → ${team?.ok ? "ACCEPTED" : `refused "${String(team?.reason ?? "").slice(0, 90)}"`} · narrowed: off → ${off?.ok ? "ok" : "refused"} · on → ${on?.ok ? "ACCEPTED" : "refused"} (active=${activeNow}) · widened again: on → ${on2?.ok ? "ok" : "refused"} · endpoints=${n}`);
  });
} catch (e) {
  chk("FIX1-ERR", false, String((e as Error)?.stack ?? e).slice(0, 800));
} finally {
  await P.session.deleteMany({ where: { userId: { in: SESS_USERS } } }).catch(() => undefined);
  await done("probe-fix1");
}
