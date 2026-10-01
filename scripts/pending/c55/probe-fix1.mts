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
async function rest(method: string, path: string, key: string, body?: unknown, idem?: string): Promise<{ status: number; body: Any }> {
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
  return { status: res.status, body: parsed };
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

    // (B) control: transient error proven BEFORE the handler started ⇒ claim released, the retry runs, exactly one row
    {
      let runs = 0;
      const k = `${TAG}-B`;
      const runB = async (ctl?: Any) => {
        runs += 1;
        if (runs === 1) {
          if (ctl?.beforeHandler) await ctl.beforeHandler(async () => { throw transient("P1001"); });
          else throw transient("P1001");
        }
        await write("b");
        return { status: 200, body: { data: { ok: true } } };
      };
      const b1 = await withIdempotency(actor, mkReq(k), op, "{}", "req-b1", {}, runB);
      const e1 = await errOf(b1);
      const afterFirst = await claim(k);
      const b2 = await withIdempotency(actor, mkReq(k), op, "{}", "req-b2", {}, runB);
      const n = await rows("b");
      chk("H1-B(control)", b1.status === 503 && e1.code === "upstream_unavailable" && !afterFirst && b2.status === 200 && runs === 2 && n === 1,
        `transient before the handler: first ${b1.status}/${e1.code} · claim after first=${afterFirst ? "KEPT" : "released"} · retry ${b2.status} · runs=${runs} rows=${n}`);
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
      { type: "ISSUE_VOUCHER", params: { templateId: "tpl" }, keys: ["member.promo.issue"], label: /ออก voucher/ },
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
