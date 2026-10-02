// REVIEW probe — CRM C5.5-fix15 (independent reviewer), QC3 only. Own throwaway tenant `qc-cf20rv-*` · outbox guard (this process only
//   sees its own tenant's rows) · network blocked · CLEAN at the end.
//   R  P-it6-2 through the REAL action and Next's REAL `AfterContext` (not a stub): a fake response emitter decides when 'close' happens.
//      R1 close 100 ms after the action (normal) · R2 the response closed BEFORE the action registered (Next never runs the task) ·
//      R3 close 6 s later (slow response: fallback first, the task later) · R4 8 concurrent create requests (bounded drains) ·
//      R5 the fallback warning line.
//   G  P-it6-1 matrix: viewer (OWNER · MANAGER whole shop · MANAGER unit-scoped · STAFF whole shop) × thread (matched · unmatched with a
//      company the viewer sees · unmatched without company): the page's attach block (`canAttach`) must equal "the service would not refuse
//      with FORBIDDEN" — never shown to a refused viewer, never hidden from an allowed one.
//   M  RVR-5 / O-it6-a: mixed batch [moves · already there · refused] by a unit-scoped manager — counts, audit row, no history/outbox rows
//      for the unchanged deal.
// Run (QC3): bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//              bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf20/review/probe-cf20-rv.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? "")) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf20-rv: QC3 only (host=${host})`);
  process.exit(4);
}
process.env.SHARK_AI_MOCK = "1";
delete process.env.SHARK_AI_KEY;
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async () => {
  throw new Error("probe-cf20-rv: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
const nextAfter = (await import("next/dist/server/after/after-context.js" as string)) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf20rv-${rand}`;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual}`);
};
const info = (id: string, s: string) => console.log(`  ℹ️  [${id}] ${s}`);
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 600) : String(e));
  }
};
const j = (v: unknown) => JSON.stringify(v ?? null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PENDING_KEY = Symbol.for("shark.core.after-drain.pendingSince");
const STATE_KEY = Symbol.for("shark.core.after-drain.state");
const holder = globalThis as unknown as Record<symbol, unknown>;

// warnings of after-drain
const warnLines: { at: number; s: string }[] = [];
const realWarn = console.warn;
console.warn = (...a: unknown[]) => {
  const s = a.map(String).join(" ");
  if (s.includes("[after-drain]")) warnLines.push({ at: Date.now(), s });
  else realWarn(...a);
};

/** a request with Next's REAL AfterContext; `res` is the response emitter ('close' decides when after() tasks run) */
function realScope(cookie: string, pathname: string) {
  const res = new EventEmitter();
  const waits: Promise<unknown>[] = [];
  const afterContext = new nextAfter.AfterContext({ waitUntil: (p: Promise<unknown>) => waits.push(p), onClose: (cb: () => void) => res.on("close", cb), onTaskError: () => undefined });
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf20-rv", "x-forwarded-for": "203.0.113.121" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  const run = <T,>(fn: () => Promise<T>): Promise<T> => nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
  return { res, waits, run, close: () => res.emit("close") };
}
/** stub scope (render) for pages */
async function renderScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf20-rv" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext: { after: () => undefined } };
  const unit = { type: "request", phase: "render", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}
function findEl(node: Any, pred: (p: Any) => boolean, depth = 0): Any {
  if (!node || depth > 60) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findEl(n, pred, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const p = node.props;
  if (p && pred(p)) return node;
  return p ? findEl(p.children, pred, depth + 1) : null;
}

let T = "";
const USERS: string[] = [];
let OB_RESTORE: (() => void) | null = null;
let candidateReads = 0;

try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const CONTACT_ACT = (await import("../../../../src/lib/modules/crm/contacts-actions.ts" as string)) as Any;

  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  // OUTBOX GUARD + count of drain candidate reads (drainOnce: where status PENDING + availableAt lte)
  const OB_DLG = P.outboxEvent;
  const OB_FIND = OB_DLG.findMany;
  OB_DLG.findMany = (a: Any) => {
    if (a?.where?.availableAt) candidateReads += 1;
    return OB_FIND.call(OB_DLG, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: T }] } });
  };
  OB_RESTORE = () => {
    OB_DLG.findMany = OB_FIND;
  };
  const guardProbe = (await P.outboxEvent.findMany({ where: { status: "PENDING" }, select: { tenantId: true }, take: 20 })) as Any[];
  if (P.outboxEvent.findMany === OB_FIND || !guardProbe.every((r) => r.tenantId === T)) throw new Error("outbox guard not installed — refusing to run");

  const mkUser = async (label: string, role: "OWNER" | "MANAGER" | "STAFF", unitAccess: string[], permissions: Record<string, unknown> = {}) => {
    const u = await P.user.create({ data: { email: `${TAG}-${label}@qc.invalid`, name: `QC ${label} ${TAG}` } });
    USERS.push(u.id);
    const m = await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess, permissions, acceptedAt: new Date() } });
    const tok = coreHash.randomToken(32) as string;
    await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(tok), idleExpiresAt: new Date(Date.now() + 86_400_000), expiresAt: new Date(Date.now() + 86_400_000) } });
    return { label, id: u.id as string, m, cookie: `shark_session=${tok}; __Host-shark_session=${tok}; shark_tenant=${T}`, actor: MEM.toMemberActor(u.id, m) };
  };
  const own = await mkUser("owner", "OWNER", ["*"]);
  const mgrAll = await mkUser("mgrall", "MANAGER", ["*"]);
  const mgrUnit = await mkUser("mgrunit", "MANAGER", [`${TAG}-unit-b`]);
  const staffAll = await mkUser("staffall", "STAFF", ["*"], { "crm.*": true });
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }),
    S,
  );
  const ctxOf = (u: Any) => ({ tenantId: T, systemId: S, actorUserId: u.id });
  const ctx = ctxOf(own);

  const rowsSince = async (t0: Date) => (await P.outboxEvent.findMany({ where: { tenantId: T, createdAt: { gte: t0 } }, select: { id: true, type: true, status: true, attempts: true } })) as Any[];
  const desc = (rows: Any[]) => j(rows.map((r) => `${r.type}:${r.status}${r.attempts ? `/a${r.attempts}` : ""}`));
  const waitDone = async (t0: Date, ms: number) => {
    const start = Date.now();
    let rows: Any[] = [];
    for (;;) {
      rows = (await rowsSince(t0)).filter((r) => String(r.type).startsWith("crm.contact."));
      if (rows.length > 0 && rows.every((r) => r.status === "DONE")) return { ok: true, rows, ms: Date.now() - start };
      if (Date.now() - start > ms) return { ok: false, rows, ms: Date.now() - start };
      await sleep(100);
    }
  };
  const create = (scope: ReturnType<typeof realScope>, name: string) =>
    scope.run(() => CONTACT_ACT.createContactAction(S, { firstName: name, lastName: rand, phone: null, email: null, tags: [], fields: {} })) as Promise<Any>;
  const settled = (ps: Promise<unknown>[]) => {
    const s = { n: 0 };
    for (const p of ps) void Promise.resolve(p).then(() => { s.n += 1; }, () => { s.n += 1; });
    return s;
  };
  const freshState = () => {
    holder[PENDING_KEY] = undefined;
    holder[STATE_KEY] = undefined;
  };

  // ── C0 control ──
  console.log("\n── C0 control: no background drain of this tenant ──");
  const ctrl = await P.outboxEvent.create({ data: { tenantId: T, systemId: S, type: `qc.cf20rv.control.${rand}`, idempotencyKey: `${TAG}-ctrl`, payload: {} } });
  await sleep(5_000);
  const ctrlAfter = await P.outboxEvent.findUnique({ where: { id: ctrl.id }, select: { status: true, attempts: true } });
  chk("C0", "control: a row written with no wake stays PENDING for 5 s", ctrlAfter?.status === "PENDING" && Number(ctrlAfter?.attempts) === 0, j(ctrlAfter));
  await P.outboxEvent.delete({ where: { id: ctrl.id } });

  // ── R P-it6-2 through Next's real AfterContext ──
  console.log("\n── R P-it6-2 with Next's real AfterContext ──");
  await sub("R1", async () => {
    freshState();
    const sc = realScope(own.cookie, `/app/sys/${S}/crm/contacts/new`);
    const t0 = new Date();
    const r0 = candidateReads;
    const r = await create(sc, `ปกติ${rand}`);
    await sleep(100);
    sc.close();
    const w = await waitDone(t0, 5_000);
    const st = settled(sc.waits);
    await sleep(500);
    chk("R1", "normal: close 100 ms after the action ⇒ rows DONE quickly, waitUntil promises settle, no fallback warning", r?.ok === true && w.ok && w.ms < 2_000 && st.n === sc.waits.length && warnLines.length === 0, `action ok=${r?.ok} rows=${desc(w.rows)} took=${w.ms} ms waitUntil ${st.n}/${sc.waits.length} settled · candidate reads=${candidateReads - r0} · warnings=${warnLines.length}`);
    await sleep(3_500);
    chk("R1.b", "normal: no extra (fallback) drain afterwards", warnLines.length === 0, `warnings=${warnLines.length} candidate reads since=${candidateReads - r0}`);
  });
  await sub("R2", async () => {
    freshState();
    const sc = realScope(own.cookie, `/app/sys/${S}/crm/contacts/new`);
    sc.close(); // the response already closed — a registration on this scope is never run by Next (P2)
    const t0 = new Date();
    const r = await create(sc, `ปิดก่อน${rand}`);
    const w = await waitDone(t0, 6_000);
    chk("R2", "P2 (real Next): the action's after() task can never start ⇒ the fallback drains its rows within ~3 s (≤ 6 s), the action itself succeeds", r?.ok === true && w.ok && w.ms >= 2_000 && w.ms <= 6_000, `action ok=${r?.ok} rows=${desc(w.rows)} took=${w.ms} ms · waitUntil registered=${sc.waits.length}`);
    info("R2", `Next handed waitUntil ${sc.waits.length} promise(s) for that scope; settled: ${settled(sc.waits).n} (the runCallbacksOnClose promise of a closed scope never settles)`);
    chk("R5.1", "the fallback logged exactly one '[after-drain] fallback drain' line", warnLines.length === 1, j(warnLines.map((x) => x.s.slice(0, 100))));
  });
  await sub("R3", async () => {
    holder[PENDING_KEY] = undefined; // keep STATE (warnedAt) — R5.2 checks the per-minute throttle across R2 → R3
    const sc = realScope(own.cookie, `/app/sys/${S}/crm/contacts/new`);
    const t0 = new Date();
    const r = await create(sc, `ช้า${rand}`);
    const w = await waitDone(t0, 5_500);
    const beforeClose = w.ok;
    const r0 = candidateReads;
    await sleep(Math.max(0, 6_000 - (Date.now() - t0.getTime())));
    sc.close();
    await sleep(300);
    const st = settled(sc.waits);
    await sleep(1_000);
    chk("R3", "slow response (close at +6 s): rows DONE before the close (fallback), the late after() task adds no drain and its promise settles", r?.ok === true && beforeClose && w.ms <= 5_500 && st.n === sc.waits.length && candidateReads - r0 === 0, `rows=${desc(w.rows)} took=${w.ms} ms · reads after close=${candidateReads - r0} · waitUntil ${st.n}/${sc.waits.length}`);
    chk("R5.2", "warning throttle: the second fallback within a minute logs no new line", warnLines.length === 1, `warnings=${warnLines.length}`);
  });
  await sub("R4", async () => {
    freshState();
    await sleep(500);
    const t0 = new Date();
    const r0 = candidateReads;
    const scopes = Array.from({ length: 8 }, () => realScope(own.cookie, `/app/sys/${S}/crm/contacts/new`));
    const res = await Promise.all(scopes.map((sc, i) => create(sc, `พร้อม${i}${rand}`).then(async (x) => {
      await sleep(50);
      sc.close();
      return x;
    })));
    const w = await waitDone(t0, 6_000);
    const rows = await rowsSince(t0);
    const regs = scopes.reduce((a, sc) => a + (sc.waits.length > 0 ? 1 : 0), 0);
    await sleep(4_000);
    const reads = candidateReads - r0;
    chk("R4", "8 concurrent create requests ⇒ every contact row DONE within 6 s; drain candidate reads bounded (≤ 2 per request scope that registered)", res.every((x) => x?.ok === true) && w.ok && reads <= 2 * Math.max(1, regs) + 2, `ok=${res.filter((x) => x?.ok).length}/8 rows=${rows.length} all DONE=${w.ok} took=${w.ms} ms · scopes that registered after()=${regs} · candidate reads=${reads} · warnings=${warnLines.length}`);
  });

  // ── G P-it6-1 matrix ──
  console.log("\n── G P-it6-1: attach block vs service, viewer × thread kind ──");
  await sub("G", async () => {
    const PAGE = (await import("../../../../src/app/app/sys/[id]/crm/emails/[threadKey]/page.tsx" as string)) as Any;
    const coParty = await P.party.create({ data: { tenantId: T, name: `บริษัท ${TAG}`, kind: "COMPANY" } });
    const co = await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: coParty.id, name: `บริษัท ${TAG}`, ownerUserId: mgrUnit.id } });
    const kc = await CRM.contacts.createContact(ctx, own.actor, { firstName: `จับคู่${rand}` });
    const mkThread = async (label: string, contactId: string | null, companyId: string | null) => {
      const threadKey = randomBytes(16).toString("hex");
      const m = await P.crmEmailMessage.create({
        data: {
          tenantId: T, systemId: S, contactId, companyId, direction: "IN", messageId: `${S}:${TAG}-${label}@cust.qc.invalid`, threadKey, fromAddr: `${label}-${rand}@cust.qc.invalid`,
          toAddrs: [`crm@${TAG}.qc.invalid`], subject: `${label} ${TAG}`, bodyText: "สวัสดี", status: "RECEIVED", receivedAt: new Date(), trackTokenHash: randomBytes(12).toString("hex"),
        },
      });
      return { label, threadKey, id: m.id as string };
    };
    const threads = [await mkThread("matched", kc.contact.id, null), await mkThread("unmatched-co", null, co.id), await mkThread("unmatched-noco", null, null)];
    const lines: string[] = [];
    let bad = 0;
    for (const v of [own, mgrAll, mgrUnit, staffAll]) {
      for (const t of threads) {
        let page: string;
        let canAttach: boolean | null = null;
        try {
          const el = await renderScope(v.cookie, `/app/sys/${S}/crm/emails/${t.threadKey}`, () => PAGE.default({ params: Promise.resolve({ id: S, threadKey: t.threadKey }) }));
          const hit = findEl(el, (p) => !!p?.data && typeof p.data === "object" && "canAttach" in p.data);
          canAttach = hit ? !!hit.props.data.canAttach : null;
          page = hit ? `canAttach=${canAttach}` : "no EmailThread";
        } catch (e) {
          const d = String((e as Any)?.digest ?? (e as Any)?.message ?? e);
          page = d.includes("NEXT_HTTP_ERROR_FALLBACK;404") || d.includes("NEXT_NOT_FOUND") ? "404" : `ERR ${d.slice(0, 80)}`;
        }
        // service verdict without mutating: a contact id that does not exist ⇒ gate passed = NOT_FOUND (contact), refused = FORBIDDEN
        const svc = await CRM.emails.attachToContact(ctxOf(v), v.actor, t.id, `nope-${rand}`).then(() => "attached?!", (e: Any) => String(e?.code ?? e?.name));
        const gate = await CRM.emails.canUseUnmatchedInbox(ctxOf(v), v.actor);
        // consistency: block shown ⇔ service does not refuse with FORBIDDEN (only meaningful when the page renders an unmatched thread)
        let ok = true;
        if (canAttach === true && svc === "FORBIDDEN") ok = false;
        if (canAttach === false && t.label !== "matched" && svc !== "FORBIDDEN") ok = false;
        if (t.label === "matched" && canAttach === true) ok = false;
        if (canAttach !== null && gate !== (svc !== "FORBIDDEN") && t.label !== "matched") ok = false;
        if (!ok) bad += 1;
        lines.push(`${v.label}×${t.label}: page=${page} service=${svc} gate=${gate}${ok ? "" : " ✗"}`);
      }
    }
    for (const l of lines) info("G", l);
    chk("G", "for every viewer × thread kind the attach block is shown exactly when the service would not refuse (never to a refused viewer, never hidden from an allowed one); matched threads never show it", bad === 0, `${bad} inconsistent · ${lines.join(" | ")}`);
  });

  // ── M RVR-5 / O-it6-a ──
  console.log("\n── M bulk move: mixed batch by a STAFF member (deal visibility OWN by default) ──");
  await sub("M", async () => {
    const pipe = await P.crmPipeline.create({
      data: {
        tenantId: T, systemId: S, name: `ขาย ${TAG}`, isDefault: true,
        stages: { create: ([["ใหม่", "OPEN", 10], ["เสนอราคา", "OPEN", 60], ["ชนะ", "WON", 100], ["แพ้", "LOST", 0]] as const).map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) },
      },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    const [S0, S1] = pipe.stages.map((s: Any) => s.id);
    const k = await CRM.contacts.createContact(ctx, own.actor, { firstName: `ดีล${rand}` });
    const dMove = await CRM.deals.createDeal(ctx, own.actor, { pipelineId: pipe.id, stageId: S0, title: `ย้าย ${TAG}`, contactId: k.contact.id, ownerUserId: staffAll.id });
    const dSame = await CRM.deals.createDeal(ctx, own.actor, { pipelineId: pipe.id, stageId: S1, title: `อยู่แล้ว ${TAG}`, contactId: k.contact.id, ownerUserId: staffAll.id });
    const dHidden = await CRM.deals.createDeal(ctx, own.actor, { pipelineId: pipe.id, stageId: S0, title: `มองไม่เห็น ${TAG}`, contactId: k.contact.id, ownerUserId: own.id });
    const t0 = new Date();
    await sleep(50);
    const mctx = ctxOf(staffAll);
    const visHidden = await CRM.deals.getDeal360(mctx, staffAll.actor, dHidden.id).then(() => "visible", (e: Any) => String(e?.code ?? e?.name));
    const r = await CRM.deals.bulkMove(mctx, staffAll.actor, { ids: [dMove.id, dSame.id, dHidden.id], stageId: S1, confirm: true, reason: "ทดสอบรีวิว" });
    const audit = (await P.auditLog.findMany({ where: { tenantId: T, action: "crm.deal.bulk_move", createdAt: { gte: t0 } } })) as Any[];
    const hist = (await P.crmDealStageHistory.findMany({ where: { dealId: { in: [dSame.id, dHidden.id] }, enteredAt: { gte: t0 } } }).catch(() => null)) as Any[] | null;
    const ev = (await P.outboxEvent.findMany({ where: { tenantId: T, createdAt: { gte: t0 } }, select: { type: true, payload: true } })) as Any[];
    const evFor = (id: string) => ev.filter((e) => j(e.payload).includes(id)).map((e) => e.type);
    const acts = (await P.crmActivity.findMany({ where: { tenantId: T, dealId: { in: [dSame.id, dHidden.id] }, createdAt: { gte: t0 } }, select: { type: true, dealId: true } })) as Any[];
    info("M", `staff sees the owner's deal: ${visHidden} · result=${j(r)} · audit=${j(audit.map((a) => a.after))} · history rows for unchanged/refused=${hist === null ? "n/a" : hist.length} · events unchanged=${j(evFor(dSame.id))} refused=${j(evFor(dHidden.id))} moved=${j(evFor(dMove.id))} · activities unchanged/refused=${acts.length}`);
    const expectHiddenFailed = visHidden !== "visible";
    const expOk = expectHiddenFailed ? 1 : 2;
    chk("M.1", "mixed batch: ok counts only the deals that moved, the deal already in the target is 'unchanged', a refused deal (if the viewer cannot see it) is 'failed'", r?.ok === expOk && r?.unchanged === 1 && r?.failed?.length === (expectHiddenFailed ? 1 : 0), `${j(r)} (refused fixture effective=${expectHiddenFailed})`);
    const histSame = hist === null ? null : hist.filter((h) => h.dealId === dSame.id).length;
    const histHidden = hist === null ? null : hist.filter((h) => h.dealId === dHidden.id).length;
    chk("M.2", "one audit row carrying ok / unchanged / failed; no history, outbox event or activity for the unchanged deal (nor for the refused one)", audit.length === 1 && audit[0]?.after?.unchanged === 1 && audit[0]?.after?.ok === expOk && audit[0]?.after?.failed === (expectHiddenFailed ? 1 : 0) && histSame === 0 && evFor(dSame.id).length === 0 && (!expectHiddenFailed || (histHidden === 0 && evFor(dHidden.id).length === 0)) && acts.filter((x) => x.dealId === dSame.id).length === 0, `audit=${audit.length} histSame=${histSame} histRefused=${histHidden} evSame=${evFor(dSame.id).length} evRefused=${evFor(dHidden.id).length} actsSame=${acts.filter((x) => x.dealId === dSame.id).length} actsAll=${acts.length}`);
    const t1 = new Date();
    await sleep(50);
    const r2 = await CRM.deals.bulkMove(mctx, staffAll.actor, { ids: [dSame.id, dHidden.id], stageId: S1, confirm: true, reason: "ทดสอบรีวิว" });
    const audit2 = (await P.auditLog.count({ where: { tenantId: T, action: "crm.deal.bulk_move", createdAt: { gte: t1 } } })) as number;
    chk("M.3", "[unchanged + refused] (nothing moved, one failure) still writes an audit row (a failure is not a pure no-op)", r2?.ok === 0 && (expectHiddenFailed ? audit2 === 1 : audit2 === 0), `result=${j(r2)} audit rows=${audit2}`);
  });
} finally {
  await sleep(4_000);
  console.warn = realWarn;
  OB_RESTORE?.();
  const leftT: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
    .map((r) => String(r.table_name))
    .filter((t) => /^[A-Za-z_]+$/.test(t));
  if (T) {
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    for (const t of tables) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[];
      if (Number(r?.[0]?.n ?? 0) > 0) leftT.push(`${t}=${r[0].n}`);
    }
  }
  for (const uid of USERS) {
    await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined);
    await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.user.delete({ where: { id: uid } }).catch(() => undefined);
  }
  if (T) chk("CLEAN", "throwaway tenant and users removed (0 rows left)", leftT.length === 0 && (await P.tenant.count({ where: { id: T } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, leftT.join(" · ") || "-");
  await prisma.$disconnect();
}
const ok = cks.filter((c) => c.ok).length;
console.log(`\nREVIEW checks ${ok}/${cks.length} green`);
console.log(`JSON_SUMMARY ${JSON.stringify(cks.map((c) => [c.id, c.ok]))}`);
process.exit(ok === cks.length ? 0 : 1);
