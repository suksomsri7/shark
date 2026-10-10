// probe — CRM C5.5-fix15 (QC run5 triage it6): the QC check for P-it6-2 + P-it6-1 · O-it6-d · O-it6-a · O-it6-b.
//   RED on bd435157 · GREEN on the fix. Own throwaway tenant `qc-cf20-*` on QC3 · CLEAN at the end · network blocked.
//   OUTBOX GUARD (as probe-cf18-outbox / qc-crm-c5.3): every outbox candidate query of THIS process sees only this run's tenant; a control row
//   proves nothing else drains the tenant during the window (no cron on QC; the QC3 gate lock keeps other suites off).
//   Q  P-it6-2 — `createContactAction` (real server action, real session cookie, Next request scope) → its OutboxEvent rows are DONE within
//      5 s WITHOUT any other wake: Q1 the scope's after() task runs at "close" (like Next) · Q2 the task NEVER starts (what run5 saw) ·
//      Q3 the owner pattern: create #1's task never starts, create #2 (ordinary request) 1 s later.
//   A  P-it6-1 — the e-mail thread page renders the attach block (`data.canAttach`) only for a viewer who passes the unmatched gate
//      (`attachToContact` → `assertUnmatchedGate`): unit-scoped MANAGER = hidden · OWNER = shown · the search behind it only returns contacts the
//      viewer can see.
//   F  O-it6-d — CrmFilesBlock on an ARCHIVED custom record (the record page renders archived records with a banner) renders a state instead
//      of throwing ActivitiesError NOT_FOUND inside the server component.
//   M  O-it6-a — deal bulk move counts deals already in the target stage as unchanged, not as moved (service + action).
//   B  O-it6-b — scoring / e-mail thread / CRM webhook messages are role="alert" when they are errors (source check, pattern of the app).
//   D  RVR-6 — deleting a CRM webhook endpoint says 'ลบปลายทางแล้ว' (was 'บันทึกแล้ว') (source check).
//   M also RVR-5: a pure no-op bulk move writes no crm.deal.bulk_move audit row.
// Run (QC3): bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//              bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf20/probe-cf20.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? "")) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf20: QC3 only (host=${host})`);
  process.exit(4);
}
process.env.SHARK_AI_MOCK = "1";
delete process.env.SHARK_AI_KEY;
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async () => {
  throw new Error("probe-cf20: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf20-${rand}`;
const cks: { id: string; ok: boolean; finding: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string, finding = false) => {
  cks.push({ id, ok: !!ok, finding });
  console.log(`  ${ok ? "✅" : "❌"} [${id}]${finding ? " (FINDING)" : " (control)"} ${n}\n        — ACTUAL ${actual}`);
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
const cut = (v: unknown, n = 160) => {
  const s = String(v ?? "").replace(/\s+/g, " ");
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PENDING_KEY = Symbol.for("shark.core.after-drain.pendingSince");
const holder = globalThis as unknown as Record<symbol, unknown>;

type AfterMode = "close" | "never";
/** Next request scope · "close" = after() tasks run once the action returned (setTimeout 0, like the platform on 'close') · "never" = they never start */
async function inScope<T>(cookie: string, pathname: string, phase: "action" | "render", mode: AfterMode, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf20", "x-forwarded-for": "203.0.113.120" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const afterContext = {
    after: (task: Any) => {
      if (mode === "close") setTimeout(() => { void Promise.resolve().then(() => (typeof task === "function" ? task() : task)).catch(() => undefined); }, 0);
    },
  };
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase, implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}
/** depth-first search of a React element tree for the first element whose props satisfy `pred` */
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

try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const CONTACT_ACT = (await import("../../../src/lib/modules/crm/contacts-actions.ts" as string)) as Any;
  const EMAIL_ACT = (await import("../../../src/lib/modules/crm/emails-actions.ts" as string)) as Any;
  const DEAL_ACT = (await import("../../../src/lib/modules/crm/deals-actions.ts" as string)) as Any;

  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  // OUTBOX GUARD
  const OB_DLG = P.outboxEvent;
  const OB_FIND = OB_DLG.findMany;
  OB_DLG.findMany = (a: Any) => OB_FIND.call(OB_DLG, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: T }] } });
  OB_RESTORE = () => { OB_DLG.findMany = OB_FIND; };
  const guardProbe = (await P.outboxEvent.findMany({ where: { status: "PENDING" }, select: { tenantId: true }, take: 20 })) as Any[];
  if (P.outboxEvent.findMany === OB_FIND || !guardProbe.every((r) => r.tenantId === T)) throw new Error("outbox guard not installed — refusing to run");

  const mkUser = async (role: "OWNER" | "MANAGER", unitAccess: string[]) => {
    const u = await P.user.create({ data: { email: `${TAG}-${role.toLowerCase()}@qc.invalid`, name: `QC ${role} ${TAG}` } });
    USERS.push(u.id);
    const m = await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess, permissions: {}, acceptedAt: new Date() } });
    const tok = coreHash.randomToken(32) as string;
    await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(tok), idleExpiresAt: new Date(Date.now() + 86_400_000), expiresAt: new Date(Date.now() + 86_400_000) } });
    return { id: u.id as string, m, cookie: `shark_session=${tok}; __Host-shark_session=${tok}; shark_tenant=${T}`, actor: MEM.toMemberActor(u.id, m) };
  };
  const own = await mkUser("OWNER", ["*"]);
  const mgr = await mkUser("MANAGER", [`${TAG}-unit-b`]); // unit-scoped manager (the QC1 "manager" of run5)
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }),
    S,
  );
  const ctx = { tenantId: T, systemId: S, actorUserId: own.id };
  const mctx = { tenantId: T, systemId: S, actorUserId: mgr.id };

  const rowsSince = async (t0: Date) =>
    (await P.outboxEvent.findMany({ where: { tenantId: T, createdAt: { gte: t0 } }, select: { id: true, type: true, status: true, attempts: true, lastError: true, createdAt: true, processedAt: true } })) as Any[];
  const desc = (rows: Any[]) => j(rows.map((r) => `${r.type}:${r.status}${r.attempts ? `/a${r.attempts}` : ""}${r.lastError ? `!${cut(r.lastError, 40)}` : ""}`));
  /** poll until every row since t0 (filtered) is DONE, or `ms` passed — returns the time it took */
  const waitDone = async (t0: Date, ms: number, filter: (r: Any) => boolean = () => true) => {
    const start = Date.now();
    let rows: Any[] = [];
    for (;;) {
      rows = (await rowsSince(t0)).filter(filter);
      if (rows.length > 0 && rows.every((r) => r.status === "DONE")) return { ok: true, rows, ms: Date.now() - start };
      if (Date.now() - start > ms) return { ok: false, rows, ms: Date.now() - start };
      await sleep(250);
    }
  };

  // ── C0 control: nothing drains this tenant by itself ──
  console.log("\n── C0 control: no background drain ──");
  const ctrl = await P.outboxEvent.create({ data: { tenantId: T, systemId: S, type: `qc.cf20.control.${rand}`, idempotencyKey: `${TAG}-ctrl`, payload: {} } });
  await sleep(6_000);
  const ctrlAfter = await P.outboxEvent.findUnique({ where: { id: ctrl.id }, select: { status: true, attempts: true } });
  chk("C0.1", "control: a row written with no wake stays PENDING (attempts 0) for 6 s — nothing else drains this tenant", ctrlAfter?.status === "PENDING" && Number(ctrlAfter?.attempts) === 0, j(ctrlAfter));
  await P.outboxEvent.delete({ where: { id: ctrl.id } });

  // clock skew (rules out "availableAt (DB clock) later than the drain's roundStart (app clock)")
  {
    const a = Date.now();
    const r = (await P.$queryRawUnsafe(`select (extract(epoch from clock_timestamp()) * 1000)::float8 as ms`)) as Any[];
    const b = Date.now();
    const skew = Number(r?.[0]?.ms ?? 0) - (a + b) / 2;
    info("C0.2", `DB clock − app clock ≈ ${Math.round(skew)} ms (round trip ${b - a} ms) — a drain's candidate query uses the app clock against availableAt = DB now() of the writing tx`);
  }

  const created: string[] = [];
  const create = async (mode: AfterMode, name: string) => {
    const r: Any = await inScope(own.cookie, `/app/sys/${S}/crm/contacts/new`, "action", mode, () => CONTACT_ACT.createContactAction(S, { firstName: name, lastName: rand, phone: null, email: null, tags: [], fields: {} }));
    if (r?.ok && r.id) created.push(r.id);
    return r;
  };
  const isContactRow = (r: Any) => String(r.type).startsWith("crm.contact.");

  // ── Q P-it6-2 ──
  console.log("\n── Q P-it6-2: a created contact's outbox rows are DONE within 5 s without any other wake ──");
  await sub("Q1", async () => {
    holder[PENDING_KEY] = undefined;
    const t0 = new Date();
    const r = await create("close", `ปกติ${rand}`);
    const w = await waitDone(t0, 5_000, isContactRow);
    chk("Q1", "control: createContactAction (after() task runs at close, like Next) ⇒ its rows are DONE within 5 s", r?.ok === true && r.created === true && w.ok, `action=${cut(j(r), 100)} rows=${desc(w.rows)} took=${w.ms} ms`);
    await sleep(1_500);
  });
  await sub("Q2", async () => {
    holder[PENDING_KEY] = undefined;
    const t0 = new Date();
    const r = await create("never", `ไม่เริ่ม${rand}`);
    const w = await waitDone(t0, 5_000, isContactRow);
    chk("Q2", "FINDING: createContactAction whose after() task NEVER starts (run5 P-it6-2) ⇒ its rows are still DONE within 5 s, with no other wake", r?.ok === true && w.ok, `action ok=${r?.ok} rows=${desc(w.rows)} took=${w.ms} ms`, true);
    await sleep(1_500);
  });
  await sub("Q3", async () => {
    holder[PENDING_KEY] = undefined;
    const r1 = await create("never", `แรก${rand}`);
    await sleep(1_000);
    const t1 = new Date();
    const r2 = await create("close", `สอง${rand}`);
    const w = await waitDone(t1, 5_000, isContactRow);
    chk("Q3", "FINDING: owner pattern — create #1's after() task never starts; create #2 (ordinary request) 1 s later ⇒ #2's rows DONE within 5 s",
      r1?.ok === true && r2?.ok === true && w.ok, `#1 ok=${r1?.ok} #2 ok=${r2?.ok} rows of #2=${desc(w.rows)} took=${w.ms} ms`, true);
    await sleep(1_500);
  });
  holder[PENDING_KEY] = undefined;
  await sleep(4_000); // let any fallback timer of Q fire before the next blocks

  // ── A P-it6-1 ──
  console.log("\n── A P-it6-1: attach block only for viewers who pass the unmatched gate ──");
  await sub("A", async () => {
    const coParty = await P.party.create({ data: { tenantId: T, name: `บริษัทจดหมาย ${TAG}`, kind: "COMPANY" } });
    const co = await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: coParty.id, name: `บริษัทจดหมาย ${TAG}`, ownerUserId: mgr.id } });
    const threadKey = randomBytes(16).toString("hex");
    const mail = await P.crmEmailMessage.create({
      data: {
        tenantId: T, systemId: S, contactId: null, companyId: co.id, direction: "IN", messageId: `${S}:${TAG}-a@cust.qc.invalid`, threadKey, fromAddr: `who-${rand}@cust.qc.invalid`,
        toAddrs: [`crm@${TAG}.qc.invalid`], subject: `ไม่รู้ว่าใคร ${TAG}`, bodyText: "สวัสดี", status: "RECEIVED", receivedAt: new Date(), trackTokenHash: randomBytes(12).toString("hex"),
      },
    });
    const k = await CRM.contacts.createContact(ctx, own.actor, { firstName: `ผูกได้${rand}`, ownerUserId: mgr.id });
    const PAGE = (await import("../../../src/app/app/sys/[id]/crm/emails/[threadKey]/page.tsx" as string)) as Any;
    const render = async (who: Any) => {
      try {
        const el = await inScope(who.cookie, `/app/sys/${S}/crm/emails/${threadKey}`, "render", "never", () => PAGE.default({ params: Promise.resolve({ id: S, threadKey }) }));
        const t = findEl(el, (p) => !!p?.data && typeof p.data === "object" && "canAttach" in p.data);
        return t ? { canAttach: t.props.data.canAttach as boolean } : { err: "EmailThread element not found" };
      } catch (e) {
        return { err: e instanceof Error ? `${e.name}: ${cut(e.message, 120)}` : String(e) };
      }
    };
    const pm = await render(mgr);
    const po = await render(own);
    const svcM = await CRM.emails.attachToContact(mctx, mgr.actor, mail.id, k.contact.id).then(() => "attached", (e: Any) => `${e?.code ?? e?.name}`);
    chk("A.1", "control: the service refuses the unit-scoped manager (assertUnmatchedGate) — the rule the page must mirror", svcM === "FORBIDDEN", `attachToContact(manager)=${svcM}`);
    chk("A.2", "FINDING: the thread page does not offer the attach block (search + pick) to the unit-scoped manager who would be refused", pm.canAttach === false, `manager page=${j(pm)}`, true);
    chk("A.3", "control: the OWNER still gets the attach block on the same thread", po.canAttach === true, `owner page=${j(po)}`);
    // the search behind the block: only contacts the viewer may see
    const hidden = await CRM.contacts.createContact(ctx, own.actor, { firstName: `ซ่อน${rand}`, ownerUserId: own.id });
    const sM: Any = await inScope(mgr.cookie, `/app/sys/${S}/crm/emails/${threadKey}`, "action", "never", () => EMAIL_ACT.searchCrmEmailContactsAction(S, rand));
    const ids = (sM?.items ?? []).map((x: Any) => x.id);
    // what the manager may open directly (service rule) — the search must not list more than that
    const opens = await Promise.all(ids.map((id: string) => CRM.contacts.getContact360?.(mctx, mgr.actor, id).then(() => true, () => false) ?? Promise.resolve(null)));
    info("A.4", `manager search "${rand}" ⇒ ${j(sM?.items?.map((x: Any) => x.name))} · owner's own contact listed=${ids.includes(hidden.contact.id)} · each hit openable by the manager=${j(opens)}`);
    const viaWhere = await CRM.emails.attachToContact(ctx, own.actor, mail.id, k.contact.id).then(() => "attached", (e: Any) => `${e?.code ?? e?.name}`);
    chk("A.5", "control: OWNER attach still works", viaWhere === "attached", viaWhere);
  });

  // ── F O-it6-d ──
  console.log("\n── F O-it6-d: CrmFilesBlock on an archived custom record ──");
  await sub("F", async () => {
    const obj = await P.customObject.create({ data: { tenantId: T, systemId: S, key: `qcobj${rand}`, label: "อุปกรณ์", labelPlural: "อุปกรณ์", titleFieldKey: "title", parentType: "NONE" } });
    const live = await P.customRecord.create({ data: { tenantId: T, systemId: S, objectId: obj.id, parentType: "NONE", title: `ใช้งาน ${TAG}`, ownerUserId: own.id } });
    const gone = await P.customRecord.create({ data: { tenantId: T, systemId: S, objectId: obj.id, parentType: "NONE", title: `เก็บแล้ว ${TAG}`, ownerUserId: own.id, archivedAt: new Date() } });
    const BLOCK = (await import("../../../src/components/crm/files/CrmFilesBlock.tsx" as string)) as Any;
    const run = async (id: string) => {
      try {
        const el = await BLOCK.CrmFilesBlock({ ctx, actor: own.actor, entityType: "RECORD", entityId: id });
        return { ok: true, testid: el?.props?.["data-testid"] ?? null, items: Array.isArray(el?.props?.items) ? el.props.items.length : null, text: cut(j(el?.props?.children ?? null), 160) };
      } catch (e) {
        return { ok: false, err: e instanceof Error ? `${e.name} ${(e as Any).code ?? ""}: ${cut(e.message, 100)}` : String(e) };
      }
    };
    const rl = await run(live.id);
    const ra = await run(gone.id);
    chk("F.1", "control: the block renders the files panel for a live record", rl.ok === true && rl.items === 0, j(rl));
    chk("F.2", "FINDING: on an ARCHIVED record (record page renders it with the archived banner) the block renders a state instead of throwing NOT_FOUND inside the RSC", ra.ok === true, j(ra), true);
  });

  // ── M O-it6-a ──
  console.log("\n── M O-it6-a: bulk move counts honestly ──");
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
    const d1 = await CRM.deals.createDeal(ctx, own.actor, { pipelineId: pipe.id, stageId: S0, title: `ดีลหนึ่ง ${TAG}`, contactId: k.contact.id });
    const d2 = await CRM.deals.createDeal(ctx, own.actor, { pipelineId: pipe.id, stageId: S0, title: `ดีลสอง ${TAG}`, contactId: k.contact.id });
    await CRM.deals.moveDeal(ctx, own.actor, d1.id, { stageId: S1 });
    const audits = () => P.auditLog.count({ where: { tenantId: T, action: "crm.deal.bulk_move" } }) as Promise<number>;
    const a0 = await audits();
    const r = await CRM.deals.bulkMove(ctx, own.actor, { ids: [d1.id, d2.id], stageId: S1, confirm: true, reason: "ย้ายดีลทดสอบ" });
    const rows = (await P.crmDeal.findMany({ where: { id: { in: [d1.id, d2.id] } }, select: { stageId: true } })) as Any[];
    chk("M.1", "FINDING: bulkMove of [already in target, in another stage] ⇒ moved 1 · unchanged 1 (not 'moved 2')", r?.ok === 1 && r?.unchanged === 1 && r?.failed?.length === 0 && rows.every((x) => x.stageId === S1), `result=${j(r)} stages=${j(rows.map((x) => x.stageId === S1))}`, true);
    const a1 = await audits();
    const a: Any = await inScope(own.cookie, `/app/sys/${S}/crm/deals`, "action", "close", () => DEAL_ACT.bulkMoveAction(S, { ids: [d1.id, d2.id], stageId: S1, confirm: true, reason: "ย้ายดีลทดสอบ" }));
    const a2 = await audits();
    chk("M.2", "FINDING: bulkMoveAction (the button) reports done 0 · unchanged 2 when both deals are already in the target stage", a?.ok === true && a.done === 0 && a.unchanged === 2, j(a), true);
    chk("M.4", "FINDING (RVR-5): a pure no-op bulk move writes NO crm.deal.bulk_move audit row; the mixed move (1 moved) writes one", a1 - a0 === 1 && a2 - a1 === 0, `audit rows: mixed +${a1 - a0} · no-op +${a2 - a1}`, true);
    const src = readFileSync("src/app/app/sys/[id]/crm/deals/_components/DealTable.tsx", "utf8");
    const honest = src.includes("ไม่มีดีลที่ต้องย้าย — ") && src.includes("อยู่ในขั้นนี้อยู่แล้ว");
    // r2 RV15-6: the text for every case, from the component's own function (no contradiction · registry prefix kept)
    const mixedFail: Any = await inScope(own.cookie, `/app/sys/${S}/crm/deals`, "action", "close", () => DEAL_ACT.bulkMoveAction(S, { ids: [d1.id, `${TAG}-gone`], stageId: S1, confirm: true, reason: "ย้ายดีลทดสอบ" }));
    let texts: Record<string, string> = {};
    try {
      const DT = (await import("../../../src/app/app/sys/[id]/crm/deals/_components/DealTable.tsx" as string)) as Any;
      const t = (r: Any) => String(DT.bulkResultText("ย้ายขั้น", { ok: true, ...r }));
      texts = {
        movedMixed: t({ done: 1, unchanged: 1, failed: 1, reason: "เหตุทดสอบ" }),
        movedOnly: t({ done: 3, unchanged: 0, failed: 0 }),
        noop: t({ done: 0, unchanged: 2, failed: 0 }),
        noneFailed: t({ done: 0, unchanged: 1, failed: 1, reason: mixedFail?.reason ?? null }),
        allFailed: t({ done: 0, unchanged: 0, failed: 2, reason: null }),
      };
    } catch (e) {
      texts = { error: e instanceof Error ? e.message : String(e) };
    }
    const okText =
      /^ย้ายขั้นสำเร็จ [1-9]/.test(texts.movedMixed ?? "") && texts.movedMixed.includes("อยู่ในขั้นนี้อยู่แล้ว 1 ดีล") && texts.movedMixed.includes("ย้ายไม่ได้ 1 ดีล (เหตุทดสอบ)") &&
      /^ย้ายขั้นสำเร็จ [1-9]/.test(texts.movedOnly ?? "") &&
      texts.noop === "ไม่มีดีลที่ต้องย้าย — อยู่ในขั้นนี้อยู่แล้ว 2 ดีล" &&
      !!texts.noneFailed && !texts.noneFailed.includes("ไม่มีดีลที่ต้องย้าย") && !texts.noneFailed.includes("สำเร็จ") && texts.noneFailed.includes("ย้ายไม่ได้ 1 ดีล") && texts.noneFailed.includes("อยู่ในขั้นนี้อยู่แล้ว 1 ดีล") &&
      !!texts.allFailed && !texts.allFailed.includes("ไม่มีดีลที่ต้องย้าย") && !texts.allFailed.includes("สำเร็จ") && texts.allFailed.includes("ย้ายไม่ได้ 2 ดีล");
    chk("M.5", "FINDING (RV15-6): bulk-move text per case — moved>0 keeps the prefix 'ย้ายขั้นสำเร็จ [1-9]' · nothing moved & no failure = 'ไม่มีดีลที่ต้องย้าย —' · nothing moved & failures never says 'ไม่มีดีลที่ต้องย้าย' nor 'สำเร็จ' and names what did not move",
      okText, j(texts), true);
    chk("M.6", "FINDING (RV15-6): bulkMoveAction gives the service's reason when every failure has the same one (here: [already there, unknown id])",
      mixedFail?.ok === true && mixedFail.done === 0 && mixedFail.unchanged === 1 && mixedFail.failed === 1 && typeof mixedFail.reason === "string" && mixedFail.reason.length > 0, j(mixedFail), true);
    chk("M.3", "FINDING: the deals table message is honest — 'ไม่มีดีลที่ต้องย้าย — อยู่ในขั้นนี้อยู่แล้ว N ดีล' when nothing moved, both numbers when mixed", honest, `DealTable.tsx has both texts = ${honest}`, true);
  });

  // ── B O-it6-b ──
  console.log("\n── B O-it6-b: error messages are role=alert ──");
  await sub("B", async () => {
    const sc = readFileSync("src/components/crm/scoring/CrmScoringManager.tsx", "utf8");
    const et = readFileSync("src/components/crm/emails/EmailThread.tsx", "utf8");
    const scoreLine = sc.split("\n").find((l) => l.includes('data-testid="crm-score-msg"')) ?? "";
    const threadLine = et.split("\n").find((l) => l.includes('data-testid="crm-email-thread-msg"')) ?? "";
    const pat = /role=\{msg\.ok \? "status" : "alert"\}/;
    chk("B.1", "FINDING: scoring message (e.g. VALIDATION 'ร้อน ต้องมากกว่า อุ่น') is role=alert when it is an error", pat.test(scoreLine), cut(scoreLine.trim(), 200), true);
    chk("B.2", "FINDING: e-mail thread message (attach refusal) is role=alert when it is an error", pat.test(threadLine), cut(threadLine.trim(), 200), true);
    const api = readFileSync("src/app/app/sys/[id]/crm/settings/api/_components/CrmApiSettings.tsx", "utf8");
    const hookLine = api.split("\n").find((l) => l.includes('data-testid="crm-api-hook-msg"')) ?? "";
    chk("B.3", "FINDING: CRM webhook message is role=alert when it is an error", /role=\{hookMsg\.ok \? "status" : "alert"\}/.test(hookLine), cut(hookLine.trim(), 200), true);
    const delLine = api.split("\n").find((l) => l.includes("crm-api-hook-delete-")) ?? "";
    chk("D.1", "FINDING (RVR-6): deleting a webhook endpoint reports a delete wording ('ลบปลายทางแล้ว'), not 'บันทึกแล้ว'", delLine.includes("ลบปลายทางแล้ว"), cut(delLine.trim(), 200), true);
  });
} finally {
  await sleep(4_000);
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
const controls = cks.filter((c) => !c.finding);
const findings = cks.filter((c) => c.finding);
console.log(`\ncontrols ${controls.filter((c) => c.ok).length}/${controls.length} green · findings GREEN (fixed) ${findings.filter((c) => c.ok).length}/${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "GREEN" : "RED"]) })}`);
process.exit(cks.every((c) => c.ok) ? 0 : 1);
