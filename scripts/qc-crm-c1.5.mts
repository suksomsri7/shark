// QC — CRM v2 WO C1.5: Deals v2 — `src/lib/modules/crm/deals.ts` (+ `deals-shared.ts`) · `lost-reasons.ts` · `pipelines.ts` ·
//      draggable deal board (shared pointer-drag hook extracted from kanban BoardView) · deal 360 · pipeline settings
//      events crm.deal.created / stage.changed / won / lost / reopened / reassigned / updated
// Oracle writer · the C1.5 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.5.mts
//      (`--force-run` = run every check even while deals.ts is absent — all red, CLEAN green; proves fixtures, workers, cleanup)
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c15-<rand>`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented here): qc-crm · qc-crm-activity (v1 createDeal/moveDeal/
//   forecast/getBoard/issueQuotation through the facade) · qc-kanban-k1.5 (the only kanban suite covering drag) · qc-kanban-k2.1
//   (+ the qc-kanban-k2.* board suites) · qc-acc-v2-editor · qc-account-api-write-docs · qc-approval · qc-approval-edit ·
//   qc-approval-wiring · qc-automation · qc-webhook · qc-crm-c1.1 … qc-crm-c1.4 (C1.4's convert idempotency + rollback must still
//   hold after convertContact is refactored onto deals.createDeal) · qc-member-m2.8 (crm.deal.won → member bridge) ·
//   qc-member-m1.9 (30/15/10/5 — every win/move of this file happens in a THROWAWAY tenant with its own CRM + MEMBER systems).
//
// SOURCES: crm-brief-C1.5.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A price badge / cross-pipeline / archive ·
//   R-C.8 keys · R-C.10 `crm.discount` · R-E.7 wonValueSatang · R-E.8 SQL sums) · CRM-RUN §2 "C1.5" (S1–S8 = 32) + §4 debts
//   (C1.2a: expectedCloseAt = engine UTC-midnight DATE · C1.3: lock company row before deal row · seed lesson) · MASTER-PLAN §2 §4
//   §6 row C1.5 · blueprint §5.4 §3.2 §3.3 §11.3 §7.1 · decision C28 (valueSatang ≤ ฿20,000,000) · mockups 02/03 (panel names only).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   import * as D from "@/lib/modules/crm/deals"  · caps in "@/lib/modules/crm/deals-shared" (client-safe; re-export tolerated)
//   import * as PL from "@/lib/modules/crm/pipelines" · import * as LR from "@/lib/modules/crm/lost-reasons"
//   ctx = { tenantId, systemId /* CRM system of that tenant — re-resolved (type CRM), never trusted */, actorUserId } · actor = MemberActor
//   errors: thrown, `.code` ∈ NOT_FOUND | VALIDATION | STAGE_REQUIREMENTS (+ `.missing[]`) | APPROVAL_REQUIRED | CONFIRM_REQUIRED |
//           CONFLICT | FORBIDDEN · Thai message that never blames the user · foreign ids ⇒ NOT_FOUND, message never echoes foreign data
//   caps: DEAL_VALUE_MAX_SATANG = 2_000_000_000 (C28) · DEAL_BULK_MAX = 200 · DEAL_REASON_MIN = 5 · DEAL_TITLE_MAX ≤ 200 ·
//         DEAL_NOTE_MAX ≤ 5000 · DEAL_LINES_MAX ≤ 200 · DEAL_LINE_QTY_MAX ≤ 999_999_999 · DEAL_TAGS_MAX ≤ 50 · DEAL_TAG_MAX ≤ 64 ·
//         DEAL_DISCOUNT_CAP_BP_DEFAULT = 1000 (used while `crm._maxDealDiscountBp` is absent from the actor's permissions)
//   D.createDeal(ctx, actor, { pipelineId, stageId?, title, contactId, companyId?, valueSatang?, lines?, discountBp?,
//        expectedCloseAt? /* "YYYY-MM-DD" | Date */, ownerUserId?, collaboratorUserIds?, forecastCategory?, probabilityOverride?,
//        nextStep?, sourceKind?, sourceDetail?, fields?, tags? }, tx?) → DealDto { id, … }   [tolerated: { deal: { id } }]
//     · no stageId ⇒ first OPEN stage by sortOrder · stage must belong to the pipeline · pipeline / contact / company of the ctx system
//     · companyId given ⇒ the contact must hold a current CrmCompanyContact link to it (else VALIDATION) · no companyId ⇒ contact.companyId
//     · owner defaults to the actor · opens CrmDealStageHistory (fromStageId null, leftAt null) · value 0…DEAL_VALUE_MAX_SATANG
//     · expectedCloseAt stored as UTC midnight of the THAI calendar day (engine DATE convention; Date input = Thai day of that instant)
//     · company caches openDealCount / wonValueSatang exact after commit · lock order CrmCompany row → CrmContact row → CrmDeal row
//     · emits crm.deal.created INSIDE the tx · key `crm.deal.created#<dealId>#<seq>` · payload ids only
//   D.moveDeal(ctx, actor, id, { stageId, note?, lostReasonId?, lostNote?, requireFieldsValues? }) → DealDto
//     · target stage must be in the deal's pipeline · requirements of the TARGET stage: requireFields (system columns or custom `deal`
//       field keys, after applying requireFieldsValues) · requireLines · requireQuotation ⇒ `.code STAGE_REQUIREMENTS`, `.missing` names
//       every missing field key + "LINES" + "QUOTATION"; nothing written · LOST needs an ACTIVE lostReasonId of this system
//     · closes the open history row (leftAt, durationSec whole seconds), opens a new one · kind/closedAt via rules.dealStateForStage ·
//       stageEnteredAt = now · stalledAt cleared · WON ⇒ contact lifecycle via rules.lifecycleAfterDealWon · same stage ⇒ no-op
//     · WON/LOST → OPEN stage = reopen: MANAGER+ only (STAFF ⇒ FORBIDDEN), reopenedCount + 1
//     · emits crm.deal.stage.changed {dealId, fromStageId, toStageId, …} + crm.deal.won (exactly once per transition into WON; key
//       `crm.deal.won#<id>` or `…#<seq>`) / crm.deal.lost {dealId, lostReasonId}
//     · serialised per deal (row lock): parallel moves ⇒ exactly ONE open history row, a consistent from→to chain
//   D.reopenDeal(ctx, actor, id, { stageId?, confirm, reason ≥ 5 }) MANAGER+ · crm.deal.reopened
//   D.reassignDeal(ctx, actor, id, { ownerUserId }) (member of the shop, else VALIDATION) · crm.deal.reassigned
//   D.setForecastCategory(ctx, actor, id, cat) · D.setNextStep(ctx, actor, id, text) · D.setCollaborators(ctx, actor, id, userIds[]) ·
//   D.updateDeal(ctx, actor, id, { title?, expectedCloseAt?, valueSatang? /* refused while the deal has lines */, probabilityOverride?,
//        tags?, fields? }) · each emits crm.deal.updated
//   D.setLines(ctx, actor, dealId, { lines: [{ name, qty, unitPriceSatang, discountBp?, productId?, vatRateBp?, note? }], discountBp? })
//        [tolerated: D.lines.set]  value = Σ round(qty × unit × (10000 − bp) / 10000) − round(subtotal × dealBp / 10000) (net, pre-VAT)
//     · rows replaced atomically (parallel calls ⇒ exactly one of the sets, never a mix) · Σ > DEAL_VALUE_MAX_SATANG ⇒ VALIDATION
//     · any line bp or the deal bp > cap (permissionValue(actor, "crm._maxDealDiscountBp") ?? 1000) ⇒ approval.submitForApproval(
//       entityType "crm.discount"): policy present ⇒ APPROVAL_REQUIRED (returned `{ status: "APPROVAL_REQUIRED", approvalRequestId }`
//       or thrown `.code`) with deal.pendingLines + pendingApprovalRequestId stored, CrmDealLine rows and valueSatang untouched ·
//       no policy ⇒ applied · a second over-cap request on the SAME deal must open a NEW request (the approval idempotency key is
//       per entityId — do not reuse the bare dealId)
//     · src/lib/approval-effects.ts branch "crm.discount": approved ⇒ pending applied once (idempotent) · rejected ⇒ pending cleared
//   D.issueQuotation(ctx, actor, dealId, { validDays?, note? }) → { docId, created } — lines → account.createExternalQuotation({ lines,
//        discountAmount }) · deal.quotationDocId · idempotent · D.issueInvoice(ctx, actor, dealId) → { docId } · deal.invoiceDocId
//   D.getDeal360(ctx, actor, id) → { deal, stages[], lines[] (+ priceChanged when productId's inventory price ≠ snapshot),
//        history[], company, contact, collaborators, docs, timeline[] }
//   D.listDeals(ctx, actor, { pipelineId?, owner?, team?, stage?, closeFrom?, closeTo? /* Thai dates, inclusive */, stale?, tag?, q?,
//        companyId?, f?: Record<fieldKey,string>, savedViewId? /* MemberSavedView objectKey "deal" */, sort?, cursor?, pageSize? })
//        → { items, nextCursor }
//   D.getBoard(ctx, actor, { pipelineId, …list filters }) → { pipeline, columns: [{ stageId, count, sumSatang, weightedSatang, cards[] }] }
//        card = title · company name · valueSatang · owner · expectedCloseAt · stale flag · score · next activity
//   D.forecast(ctx, actor, { pipelineId?, groupBy: "month"|"owner"|"team", category?, from?, to? }) → { rows: [{ key, valueSatang,
//        weightedSatang, count }] } · OPEN only · OMITTED excluded · weighted = value × (probabilityOverride ?? stage.probability) / 100 ·
//        month = "YYYY-MM" of expectedCloseAt (no date ⇒ one non-month key) · aggregated in SQL (R-E.8) through dealWhere
//   D.bulkMove(ctx, actor, { ids ≤ 200, stageId, confirm, reason ≥ 5 }) · D.bulkReassign(ctx, actor, { ids ≤ 200, ownerUserId, confirm,
//        reason }) · D.bulkTag(ctx, actor, { ids, tag }) · D.exportDeals(ctx, actor, filters) → CSV string, every line via `csvRow` ·
//        D.deleteDeal(ctx, actor, id, { confirm, reason }) [tolerated archiveDeal] — gone from 360/list/board, caches exact, audit keeps reason
//   D.changePipeline(ctx, actor, id, { pipelineId }) [tolerated moveToPipeline] MANAGER+ · first OPEN stage of the target · history row
//   PL.createPipeline(ctx, actor, { name, stages[] }) · PL.updateStage(ctx, actor, stageId, patch) · PL.archivePipeline(ctx, actor, id,
//        { confirm, reason }) — refused (Thai) while it holds OPEN deals · LR.listLostReasons / createLostReason / updateLostReason
//   events: the 7 crm.deal.* types in outbox-consumers + automation OR webhooks labels (declared once) · idempotent consumers
//   v1 `service.ts` createDeal(ctx, input) · moveDeal(ctx, dealId, stageId) · issueQuotation(ctx, dealId) keep their signatures and delegate
//   C1.4 debt: contacts.convertContact creates its deal through D.createDeal(…, tx) ⇒ exactly one crm.deal.created in the convert tx
//   reads: every deal read through where.ts `dealWhere(ctx, actor)` (C1.7 replaces its internals)
//   pages: crm/deals/{page.tsx (board|table|forecast, reads companyId → new-deal prefill), [dealId]/page.tsx (notFound()), new/page.tsx} ·
//          crm/pipelines/page.tsx · crm/settings/{pipelines,stages,lost-reasons}/page.tsx · every non-param path in crm/nav.ts
//   drag: one shared hook (e.g. src/components/shared/usePointerBoardDrag.ts) used by kanban BoardView.tsx AND the deal board
//
// WHAT THIS FILE PROVES: S0 structure · S1 create/move/history (6) · S2 requirements (4) · S3 LOST reason (2) · S4 lines + cap →
//   approval (5) · S5 quotation from lines (3) · S6 forecast (4) · S7 board (3) · S8 pages/drag/testids/prefill (5, static) ·
//   S9 brief extras (events registry · events in tx · convert → createDeal · v1 facade · Thai date · governed engine keys · reassign ·
//   cross-pipeline · pipelines/lost reasons · 360 · list filters · invoice · price badge) · X1 · X3 (in-process + worker processes:
//   merge/recompute ∥ moves, parallel wins, parallel setLines) · X4 7 consumers + approval effect · X6 · X8 · X9
//   X2 n/a (no op/tool — C1.10) · X5 n/a (markStale cron is C2.10) · X7 n/a (no public endpoint) · X10 n/a (no files/secrets).
// HOUSE RULES: SKIP guard (no DB before it) · throwaway tenants `qc-c15-<rand>` (+ `-b`) swept in `finally` · no drainOutbox ·
//   seeded QC data never read or written · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const D_FILE = "src/lib/modules/crm/deals.ts";
const SHARED_FILE = "src/lib/modules/crm/deals-shared.ts";
const PL_FILE = "src/lib/modules/crm/pipelines.ts";
const LR_FILE = "src/lib/modules/crm/lost-reasons.ts";
const SERVICE_FILE = "src/lib/modules/crm/service.ts";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const CRM_PAGES = "src/app/app/sys/[id]/crm";
const D_SPEC = "@/lib/modules/crm/deals";
const CO_SPEC = "@/lib/modules/crm/companies";
const THIS_FILE = "scripts/qc-crm-c1.5.mts";

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
const FORCE = ARGV.includes("--force-run");

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — nothing of C1.5 exists yet ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
if (!existsSync(D_FILE) && WORKER_AT < 0 && !FORCE) {
  console.log(`⚠️  SKIPPED — WO C1.5 not built yet (${D_FILE} missing)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

const ownerActor = (userId: string) => ({ userId, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> });
const managerActor = (userId: string) => ({ userId, role: "MANAGER", unitAccess: ["*"] as string[], permissions: {} as Record<string, unknown> });
const staffActor = (userId: string, perms: Record<string, unknown> = { "crm.*": true }) => ({ userId, role: "STAFF", unitAccess: ["*"] as string[], permissions: perms });
const fnOf = (mod: Any, ...names: string[]): Any => {
  for (const n of names) {
    const parts = n.split(".");
    let v: Any = mod;
    for (const p of parts) v = v?.[p];
    if (typeof v === "function") return v;
  }
  return undefined;
};
const codeOf = (e: Any) => String(e?.code ?? "-");

// ═══════════════════════════════════════════════════════════════════════════════════
// X3 WORKER MODE — this same file re-invoked as a child process (own PrismaClient = own pool, synchronised start).
//   argv: --x3-worker <mode> <tenantId> <crmSystemId> <userId> <startAtMs> <base64url(JSON arg)>
//     move      : { deals[], stages[], rounds, finalWon?: { dealId, stageId } } → rounds × parallel moveDeal (+ final win)
//     win       : { dealId, stageId } → 3 parallel moveDeal into WON
//     merge     : { keepId, mergeId, delayMs } → companies.mergeCompanies once, then recomputeCaches(keep) ×2
//     recompute : { ids[] } → 3 rounds × parallel companies.recomputeCaches
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [mode, wT, wS, wU, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const DW = (await import(D_SPEC as string).catch(() => ({}))) as Any;
  const COW = (await import(CO_SPEC as string).catch(() => ({}))) as Any;
  const dbw = (await import("@/lib/core/db")) as Any;
  const PW = dbw.prisma as Any;
  const ctx = { tenantId: wT, systemId: wS, actorUserId: wU };
  const actor = ownerActor(wU);
  const arg = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8"));
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const run = async (f: () => Promise<unknown>): Promise<string> => {
    try {
      await f();
      return "OK";
    } catch (e) {
      return `ERR:${codeOf(e)}:${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`;
    }
  };
  const move = fnOf(DW, "moveDeal");
  const mv = (dealId: string, stageId: string) => run(async () => {
    if (!move) throw Object.assign(new Error("moveDeal missing"), { code: "MISSING_FUNCTION" });
    await move(ctx, actor, dealId, { stageId });
  });
  const out: string[] = [];
  if (mode === "move") {
    for (let r = 0; r < Number(arg.rounds ?? 3); r += 1)
      out.push(...(await Promise.all((arg.deals as string[]).map((d, i) => mv(d, arg.stages[(r + i) % arg.stages.length])))));
    if (arg.finalWon) out.push(await mv(arg.finalWon.dealId, arg.finalWon.stageId));
  } else if (mode === "win") {
    out.push(...(await Promise.all([0, 1, 2].map(() => mv(arg.dealId, arg.stageId)))));
  } else if (mode === "merge") {
    await new Promise<void>((r) => setTimeout(r, Number(arg.delayMs ?? 0)));
    out.push(await run(async () => {
      if (typeof COW.mergeCompanies !== "function") throw Object.assign(new Error("mergeCompanies missing"), { code: "MISSING_FUNCTION" });
      await COW.mergeCompanies(ctx, actor, { keepId: arg.keepId, mergeId: arg.mergeId, confirm: true, reason: "รวมบริษัทซ้ำระหว่างทดสอบ" });
    }));
    for (let i = 0; i < 2; i += 1) out.push(await run(() => COW.recomputeCaches(ctx, arg.keepId)));
  } else if (mode === "recompute") {
    for (let r = 0; r < 3; r += 1) out.push(...(await Promise.all((arg.ids as string[]).map((id) => run(() => COW.recomputeCaches(ctx, id))))));
  }
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  await PW.$disconnect();
  process.exit(0);
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const cut = (v: string | undefined | null, n = 260) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const thai = (s: unknown) => typeof s === "string" && s.trim().length > 0 && /[ก-๙]/.test(s);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
type Res = { ok: boolean; v: Any; err: string; code: string; status: number; msg: string; e: Any };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", status: 0, msg: "", e: null };
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", status: 0, msg: "", e: null };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), status: Number(x?.status ?? 0), msg, e: x };
  }
};
const isNotFound = (r: Res) => !r.ok && (r.code === "NOT_FOUND" || r.status === 404);
const isValidation = (r: Res) => !r.ok && (r.code === "VALIDATION" || r.code === "BAD_INPUT" || r.status === 400);
const isRefused = (r: Res) => !r.ok && r.code !== "MISSING_FUNCTION" && ["VALIDATION", "BAD_INPUT", "CONFIRM_REQUIRED", "CONFLICT", "NOT_FOUND", "FORBIDDEN", "STAGE_REQUIREMENTS"].includes(r.code);
const isScopeRefusal = (r: Res) => isNotFound(r) || isValidation(r);
const isForbidden = (r: Res) => !r.ok && (r.code === "FORBIDDEN" || r.code === "NOT_FOUND" || r.status === 403);
const itemsOf = (r: Any): Any[] => (Array.isArray(r) ? r : (r?.items ?? r?.rows ?? r?.deals ?? []));
const num = (v: Any): number => (v === null || v === undefined ? NaN : Number(v));
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
};

// ─────────────────────────── state ───────────────────────────
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c15-${rand}`;
const TRIG = `qc_c15_${rand}`;
const NONE = `${TAG}-none`;
const did = (v: Any): string => {
  const x = typeof v === "string" ? v : (v?.deal?.id ?? v?.dealId ?? v?.id ?? "");
  return typeof x === "string" && x ? x : NONE;
};
let phoneSeq = 0;
const phoneOf = (): string => `08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`;
const mailOf = (s: string) => `${TAG}-${s}@qc-crm.example`;
const SENT_PHONE = phoneOf();
const SENT_EMAIL = mailOf("secret-buyer");
const SENT_NAME = `ผู้ซื้อลับ${rand}`;
const FOREIGN_TITLE = `ดีลลับร้านอื่น${rand}`;
let tidA = "";
let tidB = "";
let TENANTS: string[] = [];
const USERS: string[] = [];

type Evidence = { label: string; logs: string[]; ops: Any[] };
const EVIDENCE: Evidence[] = [];
async function watch<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = new Date(Date.now() - 200);
  const logs: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const cap = (k: keyof typeof orig) => (...a: Any[]) => {
    logs.push(a.map((x) => (typeof x === "string" ? x : j(x))).join(" "));
    orig[k](...a);
  };
  console.log = cap("log"); console.warn = cap("warn"); console.error = cap("error"); console.info = cap("info");
  try {
    return await fn();
  } finally {
    console.log = orig.log; console.warn = orig.warn; console.error = orig.error; console.info = orig.info;
    const ops = TENANTS.length ? await P.opsEvent.findMany({ where: { tenantId: { in: TENANTS }, createdAt: { gte: t0 } } }).catch(() => []) : [];
    EVIDENCE.push({ label, logs, ops });
  }
}
const dropTriggers = async () => {
  await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG} ON "OutboxEvent"`).catch(() => 0);
  await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIG}_fn()`).catch(() => 0);
};
/** make an OutboxEvent INSERT of tenant A fail when `cond` holds (proves the write sits in ONE transaction with its event) */
const mkTrigger = async (cond: string) => {
  await dropTriggers();
  await P.$executeRawUnsafe(
    `CREATE FUNCTION ${TRIG}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tenantId" = '${tidA}' AND ${cond} THEN RAISE EXCEPTION 'qc-c15 forced failure'; END IF; RETURN NEW; END $$`,
  );
  await P.$executeRawUnsafe(`CREATE TRIGGER ${TRIG} AFTER INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION ${TRIG}_fn()`);
};

console.log(`\n═══ QC CRM v2 · C1.5 — deals v2 ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !existsSync(D_FILE) ? " · --force-run with deals.ts ABSENT (every functional check below is expected red)" : ""}\n`);

try {
  {
    const stale = (await P.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'qc_c15_%'`).catch(() => [])) as Any[];
    for (const s of stale) {
      const n = String(s.tgname);
      if (/^qc_c15_[a-z]+$/.test(n)) {
        await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${n} ON "OutboxEvent"`).catch(() => 0);
        await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${n}_fn()`).catch(() => 0);
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure (static)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  let importErr = "";
  const D = (await import(D_SPEC as string).catch((e: Any) => { importErr = e instanceof Error ? e.message : String(e); return {}; })) as Any;
  const SH = (await import("@/lib/modules/crm/deals-shared" as string).catch(() => null)) as Any;
  const PL = (await import("@/lib/modules/crm/pipelines" as string).catch(() => ({}))) as Any;
  const LR = (await import("@/lib/modules/crm/lost-reasons" as string).catch(() => ({}))) as Any;
  const CO = (await import(CO_SPEC as string).catch(() => ({}))) as Any;
  const CT = (await import("@/lib/modules/crm/contacts" as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => null)) as Any;
  const MEM = (await import("@/lib/modules/member" as string).catch(() => null)) as Any;
  const SVC = (await import("@/lib/modules/crm/service" as string).catch(() => null)) as Any;
  const APR = (await import("@/lib/modules/approval/service" as string).catch(() => null)) as Any;
  const F = (MEM?.fields ?? null) as Any;
  const dSrcAll = existsSync("src/lib/modules/crm")
    ? readdirSync("src/lib/modules/crm").filter((f) => /^deals.*\.tsx?$/.test(f)).map((f) => read(join("src/lib/modules/crm", f))).join("\n")
    : "";
  const dSrc = read(D_FILE);
  const sharedSrc = read(SHARED_FILE);
  const capOf = (k: string): number => num(SH?.[k] ?? D?.[k]);
  const fns = {
    create: fnOf(D, "createDeal"),
    move: fnOf(D, "moveDeal"),
    reopen: fnOf(D, "reopenDeal"),
    reassign: fnOf(D, "reassignDeal"),
    setCat: fnOf(D, "setForecastCategory"),
    setNext: fnOf(D, "setNextStep"),
    setCollab: fnOf(D, "setCollaborators"),
    update: fnOf(D, "updateDeal"),
    setLines: fnOf(D, "setLines", "lines.set", "setDealLines"),
    quote: fnOf(D, "issueQuotation"),
    invoice: fnOf(D, "issueInvoice"),
    get360: fnOf(D, "getDeal360"),
    list: fnOf(D, "listDeals"),
    board: fnOf(D, "getBoard"),
    forecast: fnOf(D, "forecast"),
    bulkMove: fnOf(D, "bulkMove", "bulkMoveDeals"),
    bulkReassign: fnOf(D, "bulkReassign", "bulkReassignDeals"),
    bulkTag: fnOf(D, "bulkTag", "bulkTagDeals"),
    exp: fnOf(D, "exportDeals"),
    del: fnOf(D, "deleteDeal", "archiveDeal"),
    changePipe: fnOf(D, "changePipeline", "moveToPipeline", "moveDealToPipeline"),
    plCreate: fnOf(PL, "createPipeline"),
    plUpdateStage: fnOf(PL, "updateStage"),
    plArchive: fnOf(PL, "archivePipeline"),
    lrList: fnOf(LR, "listLostReasons", "list"),
    lrCreate: fnOf(LR, "createLostReason", "create"),
    lrUpdate: fnOf(LR, "updateLostReason", "update"),
  };
  chk("C1.5-S0.0", "deals.ts exists and loads (module import does not throw)", existsSync(D_FILE) && !importErr, "loads", importErr ? cut(importErr) : existsSync(D_FILE) ? "-" : "file missing");
  {
    const want: [string, Any][] = Object.entries(fns).filter(([k]) => !/^(pl|lr)/.test(k));
    const miss = want.filter(([, f]) => !f).map(([k]) => k);
    chk("C1.5-S0.1", "deals.ts exports the §5.4 surface: create/move/reopen/reassign/forecast-category/next-step/collaborators/update · setLines · issueQuotation/issueInvoice · getDeal360/listDeals/getBoard/forecast · bulkMove/bulkReassign/bulkTag · exportDeals · deleteDeal · changePipeline",
      miss.length === 0, "all present", miss.join(",") || "-");
  }
  {
    const miss = ["plCreate", "plUpdateStage", "plArchive", "lrList", "lrCreate", "lrUpdate"].filter((k) => !(fns as Any)[k]);
    chk("C1.5-S0.2", "pipelines.ts (createPipeline · updateStage · archivePipeline) and lost-reasons.ts (list · create · update) exist with their surface",
      existsSync(PL_FILE) && existsSync(LR_FILE) && miss.length === 0, "2 files + 6 functions", `pl=${existsSync(PL_FILE)} lr=${existsSync(LR_FILE)} missing=${miss.join(",") || "-"}`, "MAJOR");
  }
  {
    const caps = { value: capOf("DEAL_VALUE_MAX_SATANG"), bulk: capOf("DEAL_BULK_MAX"), reason: capOf("DEAL_REASON_MIN"), title: capOf("DEAL_TITLE_MAX"),
      note: capOf("DEAL_NOTE_MAX"), lines: capOf("DEAL_LINES_MAX"), qty: capOf("DEAL_LINE_QTY_MAX"), tags: capOf("DEAL_TAGS_MAX"), tag: capOf("DEAL_TAG_MAX"),
      disc: capOf("DEAL_DISCOUNT_CAP_BP_DEFAULT") };
    chk("C1.5-S0.3", "named caps (deals-shared.ts): value ฿20,000,000 (2,000,000,000 satang — C28) · bulk 200 · reason ≥ 5 · title ≤ 200 · note ≤ 5000 · lines ≤ 200 · qty ≤ 999,999,999 · tags ≤ 50 (≤ 64 chars) · default discount cap 1000 bp",
      caps.value === 2_000_000_000 && caps.bulk === 200 && caps.reason === 5 && caps.title > 0 && caps.title <= 200 && caps.note > 0 && caps.note <= 5000 &&
        caps.lines > 0 && caps.lines <= 200 && caps.qty > 0 && caps.qty <= 999_999_999 && caps.tags > 0 && caps.tags <= 50 && caps.tag > 0 && caps.tag <= 64 && caps.disc === 1000,
      "caps", j(caps), "MAJOR");
  }
  chk("C1.5-S0.4", "deals-shared.ts is client-safe (the board / 360 / new-deal client components import caps from it): no prisma / core db / server-only import",
    sharedSrc.length > 0 && !/from\s+["'](@prisma\/client|@\/lib\/core\/db|server-only|next\/headers)["']/.test(sharedSrc) && !/from\s+["']\.\/deals["']/.test(sharedSrc),
    "exists · no server import", sharedSrc ? cut(sharedSrc.match(/from\s+["'][^"']+["']/g)?.join(" ") ?? "-") : "missing", "MINOR");
  chk("C1.5-S0.5", "CSV export is built with the shared `csvRow` of @/lib/core/csv (no second CSV engine) [static]",
    /import\s*\{[^}]*\bcsvRow\b[^}]*\}\s*from\s*["']@\/lib\/core\/csv["']/.test(dSrcAll), "import { csvRow } from core/csv", "-", "MAJOR");
  chk("C1.5-S0.6", "cross-module calls only through facades (account · inventory · approval · member · party via @/lib/modules/<m>) — no deep import into another module [static]",
    dSrcAll.length > 0 && /["']@\/lib\/modules\/account["']/.test(dSrcAll) && /["']@\/lib\/modules\/approval["']/.test(dSrcAll) &&
      !/["']@\/lib\/modules\/(account|party|member|inventory|approval|kanban)\/[^"']+["']/.test(dSrcAll) && !/from\s+["']\.\.\/(account|party|member|inventory|approval)\//.test(dSrcAll),
    "facades only", cut(dSrcAll.match(/["'][^"']*modules\/(account|party|member|inventory|approval|kanban)[^"']*["']/g)?.join(" ") ?? "-"), "MAJOR");
  {
    const svc = read(SERVICE_FILE);
    const body = (name: string) => new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}`).exec(svc)?.[0] ?? "";
    const c = body("createDeal");
    const m = body("moveDeal");
    const q = body("issueQuotation");
    const ok = /createDeal\s*\(\s*ctx\s*:\s*Ctx\s*,\s*input\s*:\s*CreateDealInput\s*\)/.test(c) && !/crmDeal\s*\.\s*create\s*\(/.test(c) &&
      /moveDeal\s*\(\s*ctx\s*:\s*Ctx\s*,\s*dealId\s*:\s*string\s*,\s*stageId\s*:\s*string\s*\)/.test(m) && !/crmDeal\s*\.\s*update\s*\(/.test(m) &&
      q.length > 0 && !/crmDeal\s*\.\s*update\s*\(/.test(q);
    chk("C1.5-S0.7", "v1 service.ts createDeal(ctx, input) · moveDeal(ctx, dealId, stageId) · issueQuotation(ctx, dealId) keep their signatures and are thin wrappers over deals.ts (no own crmDeal.create/update) [static]",
      ok, "wrappers", cut(`${c.slice(0, 90)} | ${m.slice(0, 90)}`), "MAJOR");
  }
  {
    const GOV = ["valueSatang", "stageId", "pipelineId", "kind", "closedAt", "ownerUserId", "discountBp", "pendingLines", "pendingApprovalRequestId",
      "wonValueSatang", "forecastCategory", "lostReasonId", "reopenedCount", "stageEnteredAt", "quotationDocId", "invoiceDocId", "collaboratorUserIds"];
    const writes = (src: string) => {
      const re = /crmDeal\s*\.\s*(update|updateMany|create|createMany|upsert)\s*\(/g;
      let m: RegExpExecArray | null;
      const hits: string[] = [];
      while ((m = re.exec(src))) {
        const seg = src.slice(m.index, m.index + 900);
        for (const g of GOV) if (new RegExp(`\\b${g}\\s*:`).test(seg)) hits.push(g);
      }
      if (/UPDATE\s+"CrmDeal"[\s\S]{0,400}?"(valueSatang|stageId|kind|ownerUserId|discountBp|closedAt)"\s*=/.test(src)) hits.push("raw");
      return hits;
    };
    const off = walk("src")
      .filter((f) => !/\/crm\/deals[^/]*\.ts$/.test(f) && !/\/member\/fields\.ts$/.test(f))
      .map((f) => ({ f, w: writes(read(f)) }))
      .filter((x) => x.w.length > 0);
    chk("C1.5-S0.8", "governed CrmDeal columns (value · stage · pipeline · kind · closedAt · owner · discounts · pending lines · won/forecast · lost reason · reopen · docs · collaborators) are written only by deals*.ts [static]",
      existsSync(D_FILE) && off.length === 0, "deals only", off.map((x) => `${x.f}:${[...new Set(x.w)].join("/")}`).join(", ") || (existsSync(D_FILE) ? "-" : "deals.ts missing"), "MAJOR");
  }
  {
    const whereSrc = read("src/lib/modules/crm/where.ts");
    const fnBody = (name: string) => new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}`).exec(dSrc)?.[0] ?? "";
    const readers = ["getDeal360", "listDeals", "getBoard", "forecast"];
    const bad = readers.filter((n) => !/\bdealWhere\b/.test(fnBody(n)) && !/\bscopeOf|\bdealScope|\bvisible/.test(fnBody(n)));
    chk("C1.5-S0.9", "every deal read goes through where.ts `dealWhere(ctx, actor)` (R-A — C1.7 rewrites its internals): getDeal360 / listDeals / getBoard / forecast reference it, deals.ts uses it ≥ 4× [static]",
      /export\s+function\s+dealWhere\b/.test(whereSrc) && (dSrc.match(/\bdealWhere\b/g) ?? []).length >= 4 && bad.length === 0,
      "dealWhere everywhere", `uses=${(dSrc.match(/\bdealWhere\b/g) ?? []).length} readersWithout=${bad.join(",") || "-"}`, "MAJOR");
  }
  chk("C1.5-S0.10", "implementation sites are marked `// AUDIT-CLASS X1` / `X3` / `X6` / `X8` / `X9` in deals*.ts [static]",
    ["X1", "X3", "X6", "X8", "X9"].every((x) => new RegExp(`AUDIT-CLASS ${x}\\b`).test(dSrcAll)), "5 markers",
    ["X1", "X3", "X6", "X8", "X9"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(dSrcAll)).join(",") || "-", "MINOR");
  {
    const eff = read("src/lib/approval-effects.ts");
    const blk = /if\s*\(\s*entityType\s*===\s*"crm\.discount"\s*\)\s*\{([\s\S]*?)\n  \}/.exec(eff)?.[1] ?? "";
    chk("C1.5-S0.11", "the crm facade exposes the deal service (`deals.*`) and approval-effects' \"crm.discount\" branch is no longer a no-op (it calls into the crm facade) [static]",
      typeof CRM?.deals?.createDeal === "function" && blk.trim().length > 0 && !/^\s*return;\s*$/.test(blk) && /crm/.test(blk),
      "exported · branch wired", `deals=${typeof CRM?.deals} branch=${cut(blk.trim(), 80) || "-"}`, "MAJOR");
  }
  {
    const ctAll = existsSync("src/lib/modules/crm") ? readdirSync("src/lib/modules/crm").filter((f) => /^contacts.*\.ts$/.test(f)).map((f) => read(join("src/lib/modules/crm", f))).join("\n") : "";
    chk("C1.5-S0.12", "C1.4 debt: contacts*.ts no longer writes CrmDeal itself — convertContact calls deals.createDeal(…, tx) [static]",
      ctAll.length > 0 && !/crmDeal\s*\.\s*create\s*\(/.test(ctAll) && /createDeal\s*\(/.test(ctAll), "via deals.createDeal",
      `contacts=${ctAll.length > 0} ownCreate=${/crmDeal\s*\.\s*create\s*\(/.test(ctAll)} callsCreateDeal=${/createDeal\s*\(/.test(ctAll)}`);
  }
  {
    const st = read("src/lib/modules/crm/settings.ts");
    const rmw = walk("src/lib/modules/crm").filter((f) => /appSystem\s*\.\s*update(Many)?\s*\([\s\S]{0,300}?settings\s*:/.test(read(f)));
    chk("C1.5-S0.13", "R-A: settings.ts gains a writer using a single-statement `jsonb_set` (no read-modify-write of AppSystem.settings anywhere in crm/) [static]",
      /jsonb_set/.test(st) && /export\s+async\s+function\s+set\w*/.test(st) && rmw.length === 0, "jsonb_set writer", `jsonb=${/jsonb_set/.test(st)} rmw=${rmw.join(",") || "-"}`, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — tenant A (crmA · crmA2 · memA · accA · invA) · tenant B (crmB · memB) · users owner/manager/sales (A), stranger (B)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string)) as Any;
  const CONS: Any = OBX.consumers;
  const tA = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tidA = tA.id;
  const tB = await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } });
  tidB = tB.id;
  TENANTS = [tidA, tidB];
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const userA = await mkUser("");
  const userMgr = await mkUser("-mgr");
  const userSales = await mkUser("-sales");
  const userStranger = await mkUser("-stranger");
  const member = (userId: string, tenantId: string, role: string, permissions: Record<string, unknown> = {}) =>
    P.membership.create({ data: { userId, tenantId, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
  await member(userA, tidA, "OWNER");
  await member(userA, tidB, "OWNER");
  await member(userMgr, tidA, "MANAGER");
  await member(userSales, tidA, "STAFF", { "crm.*": true });
  await member(userStranger, tidB, "STAFF", { "crm.*": true });
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const crmA = await mk(tidA, "CRM", "CRM");
  const crmA2 = await mk(tidA, "CRM", "CRM สอง");
  const memA = await mk(tidA, "MEMBER", "สมาชิก");
  const accA = await mk(tidA, "ACCOUNT", "บัญชี");
  const invA = await mk(tidA, "INVENTORY", "คลัง");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  await mk(tidB, "MEMBER", "สมาชิก-B");
  await P.accountSettings.create({ data: { tenantId: tidA, systemId: accA, orgName: TAG, vatRegistered: true, vatRateBp: 700, vatTiming: "ON_ISSUE" } });
  await P.accountSystemLink.create({ data: { tenantId: tidA, systemId: accA, linkedKind: "CRM", linkedId: crmA } });
  const owner = ownerActor(userA);
  const mgr = managerActor(userMgr);
  const sales = staffActor(userSales);
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cA2 = { tenantId: tidA, systemId: crmA2, actorUserId: userA };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: userA };
  const cSales = { ...cA, actorUserId: userSales };
  const cMgr = { ...cA, actorUserId: userMgr };

  type St = { name: string; kind: string; probability: number; requireFields?: string[]; requireLines?: boolean; requireQuotation?: boolean };
  const mkPipe = async (tid: string, sys: string, name: string, stages: St[]) => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `${name} ${TAG}`, stages: { create: stages.map((s, i) => ({ tenantId: tid, systemId: sys, sortOrder: i, ...s })) } },
      include: { stages: true },
    })) as Any;
    const st = [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string);
    return { id: p.id as string, st };
  };
  const STD: St[] = [
    { name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10 }, { name: "เจรจา", kind: "OPEN", probability: 50 },
    { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 },
  ];
  const pA = await mkPipe(tidA, crmA, "ขายองค์กร", STD);
  const [S0, S1, SW, SL] = pA.st;
  const pA2 = await mkPipe(tidA, crmA2, "ขายสอง", STD);
  const pB = await mkPipe(tidB, crmB, "ขายร้านอื่น", STD);
  const pReq = await mkPipe(tidA, crmA, "มีเงื่อนไข", [
    { name: "เริ่ม", kind: "OPEN", probability: 10 },
    { name: "ต้องกรอก", kind: "OPEN", probability: 40, requireFields: ["expectedCloseAt", "qcBudget"] },
    { name: "ต้องมีรายการและใบเสนอราคา", kind: "OPEN", probability: 60, requireLines: true, requireQuotation: true },
    { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 },
  ]);
  const pF = await mkPipe(tidA, crmA, "พยากรณ์", [
    { name: "F1", kind: "OPEN", probability: 20 }, { name: "F2", kind: "OPEN", probability: 50 },
    { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 },
  ]);
  const pX = await mkPipe(tidA, crmA, "แข่ง", [
    { name: "X0", kind: "OPEN", probability: 10 }, { name: "X1", kind: "OPEN", probability: 30 }, { name: "X2", kind: "OPEN", probability: 60 },
    { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 },
  ]);
  const lrA = (await P.crmLostReason.create({ data: { tenantId: tidA, systemId: crmA, key: `price-${rand}`, label: "ราคาสูงไป" } })).id as string;
  const lrOff = (await P.crmLostReason.create({ data: { tenantId: tidA, systemId: crmA, key: `old-${rand}`, label: "เลิกใช้", active: false } })).id as string;
  const lrA2 = (await P.crmLostReason.create({ data: { tenantId: tidA, systemId: crmA2, key: `other-${rand}`, label: "ของระบบอื่น" } })).id as string;

  const mkParty = async (tid: string, name: string, kind: string, extra: Record<string, Any> = {}) =>
    (await P.party.create({ data: { tenantId: tid, name, kind, ...extra } })).id as string;
  const rawContact = async (tid: string, sys: string, name: string, extra: Record<string, Any> = {}) => {
    const phone = (extra.phone as string | undefined) ?? phoneOf();
    const partyId = await mkParty(tid, name, "PERSON", { phone });
    return (await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone, partyId, ...extra } })).id as string;
  };
  const fxCompany = async (c: Any, name: string): Promise<string> => {
    const r = await call(CO.createCompany, c, owner, { name });
    const id = String(r.v?.company?.id ?? r.v?.id ?? "");
    if (id && (await P.crmCompany.findFirst({ where: { id } }))) return id;
    const partyId = await mkParty(c.tenantId, name, "COMPANY");
    return (await P.crmCompany.create({ data: { tenantId: c.tenantId, systemId: c.systemId, name, partyId } })).id as string;
  };
  const link = async (c: Any, companyId: string, contactId: string, isPrimary = true) => {
    const r = await call(CO.addContact, c, owner, companyId, { contactId, isPrimary });
    if (!r.ok && !(await P.crmCompanyContact.findFirst({ where: { companyId, contactId, endedAt: null } }))) {
      await P.crmCompanyContact.create({ data: { tenantId: c.tenantId, companyId, contactId, role: "OTHER", isPrimary } });
      if (isPrimary) await P.crmContact.update({ where: { id: contactId }, data: { companyId } });
    }
  };
  const dealRow = (id: string) => P.crmDeal.findFirst({ where: { id: id || NONE } }) as Promise<Any>;
  const hist = (id: string) => P.crmDealStageHistory.findMany({ where: { dealId: id || NONE }, orderBy: [{ enteredAt: "asc" }, { leftAt: { sort: "asc", nulls: "last" } }] }) as Promise<Any[]>;
  const evOf = async (type: string, id: string) =>
    (await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, type, idempotencyKey: { startsWith: `${type}#${id}` } }, orderBy: { createdAt: "asc" } })) as Any[];
  const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
  const consume = async (row: Any) => call(CONS?.[row.type], evtOf(row));
  /** company cache vs the truth computed from CrmDeal rows (same formula as companies.recomputeCachesInTx) */
  const cacheState = async (companyId: string) => {
    const co = await P.crmCompany.findFirst({ where: { id: companyId || NONE } });
    const t = (await P.$queryRawUnsafe(
      `SELECT count(*) FILTER (WHERE d."kind" = 'OPEN')::int AS open, COALESCE(sum(d."wonValueSatang") FILTER (WHERE d."kind" = 'WON'), 0)::text AS won
         FROM "CrmDeal" d WHERE d."companyId" = $1 AND d."systemId" = $2`, companyId || NONE, co?.systemId ?? NONE)) as Any[];
    const open = Number(t?.[0]?.open ?? -1);
    const won = String(t?.[0]?.won ?? "-1");
    return { ok: !!co && co.openDealCount === open && String(co.wonValueSatang) === won, info: `cache ${co?.openDealCount}/${String(co?.wonValueSatang)} truth ${open}/${won}`, open };
  };
  /** deal fixture: the service first; raw fallback (row + first history row) so a broken create never cascades into other groups */
  const fxDeal = async (input: Record<string, Any>, c: Any = cA, who: Any = owner): Promise<string> => {
    const r = await call(fns.create, c, who, input);
    const id = did(r.v);
    if (id !== NONE && (await dealRow(id))) return id;
    const pipe = await P.crmPipeline.findFirst({ where: { id: input.pipelineId }, include: { stages: { orderBy: { sortOrder: "asc" } } } });
    const stageId = (input.stageId as string | undefined) ?? pipe?.stages?.find((s: Any) => s.kind === "OPEN")?.id;
    const st = pipe?.stages?.find((s: Any) => s.id === stageId);
    const ec = typeof input.expectedCloseAt === "string" ? new Date(`${input.expectedCloseAt}T00:00:00.000Z`) : (input.expectedCloseAt ?? null);
    const d = await P.crmDeal.create({ data: {
      tenantId: c.tenantId, systemId: c.systemId, contactId: input.contactId, companyId: input.companyId ?? null, pipelineId: input.pipelineId, stageId,
      title: input.title, valueSatang: input.valueSatang ?? 0, kind: st?.kind ?? "OPEN", ownerUserId: input.ownerUserId ?? who.userId,
      expectedCloseAt: ec, forecastCategory: input.forecastCategory ?? "PIPELINE", probabilityOverride: input.probabilityOverride ?? null, tags: input.tags ?? [],
    } });
    await P.crmDealStageHistory.create({ data: { tenantId: c.tenantId, dealId: d.id, toStageId: stageId } });
    return d.id as string;
  };
  const move = (id: string, stageId: string, extra: Record<string, Any> = {}, who: Any = owner, c: Any = cA) => call(fns.move, c, who, id, { stageId, ...extra });

  // custom fields of objectKey "deal" (C1.2a engine) — one required by a stage, one filterable
  const fctx = { ...cA, objectKey: "deal", actor: owner };
  const sec = await call(F?.createSection, fctx, { key: "qcDealExtra", label: "ข้อมูลดีลเพิ่ม" });
  const fBudget = await call(F?.createField, fctx, { sectionId: sec.v?.id, key: "qcBudget", label: "งบประมาณลูกค้า", type: "TEXT" });
  const fRegion = await call(F?.createField, fctx, { sectionId: sec.v?.id, key: "qcRegion", label: "ภูมิภาค", type: "TEXT", filterable: true });
  chk("C1.5-SETUP.1", "[prerequisite C1.2a] the field engine accepts objectKey \"deal\" custom fields (qcBudget · qcRegion) — if red, S2/S9.12 are red for C1.2a's reason",
    sec.ok && fBudget.ok && fRegion.ok, "ok", `${sec.err}${fBudget.err}${fRegion.err}`, "MAJOR");

  const coMain = await fxCompany(cA, `บริษัทหลัก ${rand}`);
  const kMain = await rawContact(tidA, crmA, `ผู้ติดต่อหลัก ${rand}`, { email: mailOf("main") });
  await link(cA, coMain, kMain);
  const kPlain = await rawContact(tidA, crmA, `ผู้ติดต่อเดี่ยว ${rand}`);
  console.log(`[setup] tenant A ${tidA} · tenant B ${tidB} · crmA ${crmA} · crmA2 ${crmA2} · memA ${memA} · accA ${accA}\n`);

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — create · move · history (durationSec) · WON · reopen
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S1 · create / move / history ──");
  const r1 = await watch("createDeal S1.1", () => call(fns.create, cA, owner, { pipelineId: pA.id, title: `ดีลแรก ${rand}`, contactId: kMain, companyId: coMain, valueSatang: 5_000_000 }));
  const d1 = did(r1.v);
  {
    const row = await dealRow(d1);
    const h = await hist(d1);
    const ev = await evOf("crm.deal.created", d1);
    const keyRe = new RegExp(`^crm\\.deal\\.created#${d1}#[^#\\s]+$`);
    const cache = await cacheState(coMain);
    chk("C1.5-S1.1", "createDeal (no stageId) ⇒ first OPEN stage by sortOrder · contact/company/value · kind OPEN · owner = actor · forecast PIPELINE · ONE open history row (from null) · ONE crm.deal.created (key crm.deal.created#<id>#<seq>, payload dealId/contactId/pipelineId/stageId) · company openDealCount exact",
      r1.ok && row?.stageId === S0 && row?.systemId === crmA && row?.contactId === kMain && row?.companyId === coMain && row?.valueSatang === 5_000_000 && row?.kind === "OPEN" &&
        row?.ownerUserId === userA && row?.forecastCategory === "PIPELINE" && h.length === 1 && h[0].fromStageId === null && h[0].toStageId === S0 && !h[0].leftAt &&
        ev.length === 1 && keyRe.test(ev[0].idempotencyKey) && ev[0].payload?.dealId === d1 && ev[0].payload?.contactId === kMain && ev[0].payload?.pipelineId === pA.id && ev[0].payload?.stageId === S0 &&
        cache.ok && cache.open === 1,
      "row · history · event · cache", `${r1.err} stage=${row?.stageId === S0} owner=${row?.ownerUserId === userA} hist=${h.length} events=${ev.length} ${cut(ev[0]?.idempotencyKey, 80)} ${cache.info}`);
  }
  {
    await P.crmDealStageHistory.updateMany({ where: { dealId: d1, leftAt: null }, data: { enteredAt: new Date(Date.now() - 3 * 86_400_000) } });
    await P.crmDeal.update({ where: { id: d1 }, data: { stalledAt: new Date() } }).catch(() => 0);
    const t0 = new Date(Date.now() - 1000);
    const r = await move(d1, S1, { note: "ลูกค้าขอเจรจาราคา" });
    const row = await dealRow(d1);
    const h = await hist(d1);
    const open = h.filter((x) => !x.leftAt);
    const ev = await evOf("crm.deal.stage.changed", d1);
    chk("C1.5-S1.2", "moveDeal S0→S1 ⇒ previous history row closed (leftAt), a new open row from S0 to S1, exactly ONE open row · deal.stageId S1 · one crm.deal.stage.changed {fromStageId S0, toStageId S1}",
      r.ok && row?.stageId === S1 && h.length === 2 && !!h[0].leftAt && open.length === 1 && open[0].fromStageId === S0 && open[0].toStageId === S1 &&
        ev.length === 1 && ev[0].payload?.fromStageId === S0 && ev[0].payload?.toStageId === S1 && ev[0].payload?.dealId === d1,
      "closed + opened + event", `${r.err} stage=${row?.stageId === S1} hist=${h.length} open=${open.length} events=${ev.length} payload=${cut(j(ev[0]?.payload), 120)}`);
    const dur = Number(h[0]?.durationSec);
    chk("C1.5-S1.3", "durationSec of the closed row = whole seconds spent (3 days back-dated ⇒ 259,200 s … +120) · stageEnteredAt reset to now · stalledAt cleared by the move",
      dur >= 259_200 && dur <= 259_320 && Number.isInteger(dur) && !!row?.stageEnteredAt && new Date(row.stageEnteredAt) >= t0 && row?.stalledAt === null,
      "259200 · now · null", `dur=${h[0]?.durationSec} entered=${j(row?.stageEnteredAt)} stalled=${j(row?.stalledAt)}`);
  }
  {
    const h0 = (await hist(d1)).length;
    const e0 = (await evOf("crm.deal.stage.changed", d1)).length;
    const same = await move(d1, S1);
    const h1 = (await hist(d1)).length;
    const e1 = (await evOf("crm.deal.stage.changed", d1)).length;
    const back = await move(d1, S0, { note: "ย้อนกลับไปคัดกรองใหม่" });
    const h = await hist(d1);
    chk("C1.5-S1.4", "moving to the SAME stage is a no-op (no history row, no event) · moving BACKWARDS S1→S0 is allowed and recorded (3 rows, one open, kind OPEN)",
      same.ok && h1 === h0 && e1 === e0 && back.ok && h.length === h0 + 1 && h.filter((x) => !x.leftAt).length === 1 && (await dealRow(d1))?.stageId === S0,
      "no-op · backwards", `${same.err}${back.err} rows ${h0}→${h1}→${h.length} events ${e0}→${e1}`);
  }
  {
    const r = await watch("moveDeal WON", () => move(d1, SW));
    const row = await dealRow(d1);
    const k = await P.crmContact.findFirst({ where: { id: kMain } });
    const won = await evOf("crm.deal.won", d1);
    const cache = await cacheState(coMain);
    chk("C1.5-S1.5", "move into WON ⇒ kind WON · closedAt set · contact lifecycle CUSTOMER (rules.lifecycleAfterDealWon) · exactly ONE crm.deal.won · company openDealCount/wonValueSatang exact (0 open)",
      r.ok && row?.kind === "WON" && !!row?.closedAt && k?.lifecycleStage === "CUSTOMER" && won.length === 1 && won[0].payload?.dealId === d1 && cache.ok && cache.open === 0,
      "won", `${r.err} kind=${row?.kind} closed=${!!row?.closedAt} lifecycle=${k?.lifecycleStage} won=${won.length} ${cache.info}`);
  }
  {
    const snap = j(await dealRow(d1));
    const st = await move(d1, S0, {}, sales, cSales);
    const unchanged = j(await dealRow(d1)) === snap;
    const r = await call(fns.reopen, cA, owner, d1, { stageId: S1, confirm: true, reason: "ลูกค้ากลับมาขอแก้สัญญา" });
    const row = await dealRow(d1);
    const ev = await evOf("crm.deal.reopened", d1);
    const cache = await cacheState(coMain);
    chk("C1.5-S1.6", "reopen (§11.3): a STAFF moving WON → OPEN ⇒ FORBIDDEN, deal unchanged · OWNER reopenDeal(confirm, reason) ⇒ OPEN stage, kind OPEN, closedAt null, reopenedCount 1, one crm.deal.reopened, cache exact (1 open)",
      isForbidden(st) && unchanged && r.ok && row?.kind === "OPEN" && row?.stageId === S1 && row?.closedAt === null && row?.reopenedCount === 1 && ev.length === 1 && cache.ok && cache.open === 1,
      "refused · reopened", `staff=${st.err || "accepted"} unchanged=${unchanged} ${r.err} kind=${row?.kind} reopened=${row?.reopenedCount} events=${ev.length} ${cache.info}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — stage requirements (STAGE_REQUIREMENTS + missing[])
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · stage requirements ──");
  const [R0, R1, R2, RW] = pReq.st;
  const dR = await fxDeal({ pipelineId: pReq.id, title: `ดีลมีเงื่อนไข ${rand}`, contactId: kPlain, valueSatang: 1_000_000 });
  const missingOf = (r: Res): string => j(r.e?.missing ?? r.v?.missing ?? null);
  {
    const h0 = (await hist(dR)).length;
    const e0 = (await evOf("crm.deal.stage.changed", dR)).length;
    const r = await move(dR, R1);
    const row = await dealRow(dR);
    const m = missingOf(r);
    chk("C1.5-S2.1", "target stage requireFields [expectedCloseAt, qcBudget] both empty ⇒ `.code STAGE_REQUIREMENTS` (Thai) with `.missing` naming BOTH keys · deal still at R0 · no history row · no event",
      !r.ok && r.code === "STAGE_REQUIREMENTS" && thai(r.msg) && m.includes("expectedCloseAt") && m.includes("qcBudget") && row?.stageId === R0 &&
        (await hist(dR)).length === h0 && (await evOf("crm.deal.stage.changed", dR)).length === e0,
      "STAGE_REQUIREMENTS + 2 keys", `${r.err || "accepted"} missing=${cut(m, 160)} stage=${row?.stageId === R0 ? "R0" : row?.stageId}`);
  }
  {
    const r = await move(dR, R2);
    const m = missingOf(r).toUpperCase();
    chk("C1.5-S2.2", "target stage requireLines + requireQuotation, deal without lines/quotation ⇒ STAGE_REQUIREMENTS · `.missing` names LINES and QUOTATION · deal unmoved",
      !r.ok && r.code === "STAGE_REQUIREMENTS" && /LINE/.test(m) && /QUOT/.test(m) && (await dealRow(dR))?.stageId === R0, "LINES + QUOTATION", `${r.err || "accepted"} missing=${cut(m, 160)}`);
  }
  {
    const r = await move(dR, R1, { requireFieldsValues: { expectedCloseAt: "2026-11-30", qcBudget: "งบ 5 แสน" } });
    const row = await dealRow(dR);
    const v = await P.customRecordValue.count({ where: { tenantId: tidA, recordType: "DEAL", recordId: dR } });
    chk("C1.5-S2.3", "the same move with requireFieldsValues {expectedCloseAt, qcBudget} ⇒ passes · expectedCloseAt stored (2026-11-30 UTC midnight) · qcBudget written through the engine (CustomRecordValue DEAL)",
      r.ok && row?.stageId === R1 && j(row?.expectedCloseAt) === "\"2026-11-30T00:00:00.000Z\"" && v >= 1, "moved + values", `${r.err} stage=${row?.stageId === R1} close=${j(row?.expectedCloseAt)} values=${v}`);
  }
  {
    await call(fns.setLines, cA, owner, dR, { lines: [{ name: "คอร์สดำน้ำ", qty: 1, unitPriceSatang: 1_000_000 }] });
    const q = await call(fns.quote, cA, owner, dR, {});
    if (!(await dealRow(dR))?.quotationDocId) await P.crmDeal.update({ where: { id: dR }, data: { quotationDocId: `${TAG}-fake-quote` } });
    const lines = await P.crmDealLine.count({ where: { dealId: dR } });
    const r = await move(dR, R2);
    chk("C1.5-S2.4", "after lines exist and a quotation is issued, requireLines + requireQuotation are satisfied ⇒ the move passes",
      lines > 0 && r.ok && (await dealRow(dR))?.stageId === R2, "moved", `lines=${lines} quote=${q.err || "ok"} move=${r.err || "ok"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — LOST needs a reason
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · LOST ──");
  const dL = await fxDeal({ pipelineId: pA.id, title: `ดีลจะแพ้ ${rand}`, contactId: kMain, companyId: coMain, valueSatang: 700_000 });
  {
    const a = await move(dL, SL);
    const b = await move(dL, SL, { lostReasonId: lrOff });
    const c = await move(dL, SL, { lostReasonId: lrA2 });
    const row = await dealRow(dL);
    chk("C1.5-S3.1", "move into LOST without lostReasonId ⇒ VALIDATION (Thai) · an inactive reason or a reason of another CRM system ⇒ refused · deal stays OPEN",
      isValidation(a) && thai(a.msg) && isScopeRefusal(b) && isScopeRefusal(c) && row?.kind === "OPEN" && (await evOf("crm.deal.lost", dL)).length === 0,
      "refused ×3", `${a.err || "accepted"} | ${b.err || "accepted"} | ${c.err || "accepted"} kind=${row?.kind}`);
  }
  {
    const r = await move(dL, SL, { lostReasonId: lrA, lostNote: "ลูกค้าเลือกเจ้าอื่น" });
    const row = await dealRow(dL);
    const ev = await evOf("crm.deal.lost", dL);
    const cache = await cacheState(coMain);
    chk("C1.5-S3.2", "with an active reason ⇒ kind LOST · lostReasonId saved · closedAt set · one crm.deal.lost {dealId, lostReasonId} · company cache exact",
      r.ok && row?.kind === "LOST" && row?.lostReasonId === lrA && !!row?.closedAt && ev.length === 1 && ev[0].payload?.lostReasonId === lrA && cache.ok,
      "lost", `${r.err} kind=${row?.kind} reason=${row?.lostReasonId === lrA} events=${ev.length} ${cache.info}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — lines · valueSatang · discount cap → approval (crm.discount)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · lines + discount approval ──");
  const SET_A = [
    { name: "คอร์ส Open Water", qty: 2, unitPriceSatang: 150_000, discountBp: 500 },
    { name: "ชุดอุปกรณ์เช่า", qty: 1, unitPriceSatang: 500_000, discountBp: 0 },
    { name: "ประกันดำน้ำ", qty: 3, unitPriceSatang: 10_000, discountBp: 500 },
  ];
  const VAL_A = 797_230; // (285,000 + 500,000 + 28,500) = 813,500 − 2 % deal discount 16,270
  const SET_B = [
    { name: "แพ็กเกจทริป", qty: 4, unitPriceSatang: 250_000, discountBp: 0 },
    { name: "ค่าเดินทาง", qty: 1, unitPriceSatang: 120_000, discountBp: 1000 },
  ];
  const VAL_B = 1_108_000;
  const AMT_A = [285_000, 500_000, 28_500];
  const lineRows = (id: string) => P.crmDealLine.findMany({ where: { dealId: id || NONE }, orderBy: { sortOrder: "asc" } }) as Promise<Any[]>;
  const lineAmt = (l: Any) => Math.round((Number(l.qty) * l.unitPriceSatang * (10_000 - (l.discountBp ?? 0))) / 10_000);
  const dLn = await fxDeal({ pipelineId: pA.id, title: `ดีลมีรายการ ${rand}`, contactId: kMain, companyId: coMain, valueSatang: 0 });
  {
    const r = await call(fns.setLines, cA, owner, dLn, { lines: SET_A, discountBp: 200 });
    const rows = await lineRows(dLn);
    const row = await dealRow(dLn);
    chk("C1.5-S4.1", "setLines 3 lines + deal discount 2 % ⇒ 3 CrmDealLine rows in order (qty · unit · bp) · valueSatang = Σ round(qty×unit×(1−bp)) − deal discount = 797,230 · discountBp 200 stored",
      r.ok && rows.length === 3 && rows.map((x) => x.name).join("|") === SET_A.map((x) => x.name).join("|") && rows.map(lineAmt).join(",") === AMT_A.join(",") &&
        row?.valueSatang === VAL_A && row?.discountBp === 200,
      "3 rows · 797,230", `${r.err} rows=${rows.length} amts=${rows.map(lineAmt).join(",")} value=${row?.valueSatang} bp=${row?.discountBp}`);
  }
  {
    const r = await call(fns.setLines, cA, owner, dLn, { lines: SET_B, discountBp: 0 });
    const rows = await lineRows(dLn);
    const up = await call(fns.update, cA, owner, dLn, { valueSatang: 5 });
    const row = await dealRow(dLn);
    chk("C1.5-S4.2", "a second setLines REPLACES the set (2 rows, value 1,108,000) · updateDeal({valueSatang}) on a deal WITH lines ⇒ refused and the value stays Σ lines (§11.3)",
      r.ok && rows.length === 2 && row?.valueSatang === VAL_B && isRefused(up), "replaced · manual value refused", `${r.err} rows=${rows.length} value=${row?.valueSatang} manual=${up.err || "accepted"}`);
  }
  const pol = await call(APR?.createPolicy, { tenantId: tidA }, { name: `ส่วนลดเกินเพดาน ${TAG}`, entityType: "crm.discount", steps: [{ order: 1, approverRole: "OWNER" }] });
  const approverM = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: userA };
  const OVER = [{ name: "แพ็กเกจลดพิเศษ", qty: 1, unitPriceSatang: 1_000_000, discountBp: 1500 }];
  let req1 = "";
  {
    const ok = await call(fns.setLines, cSales, sales, dLn, { lines: SET_A, discountBp: 200 });
    const vOk = (await dealRow(dLn))?.valueSatang;
    const r = await call(fns.setLines, cSales, sales, dLn, { lines: OVER, discountBp: 0 });
    const row = await dealRow(dLn);
    const rows = await lineRows(dLn);
    const req = row?.pendingApprovalRequestId ? await P.approvalRequest.findFirst({ where: { id: row.pendingApprovalRequestId } }) : null;
    req1 = String(req?.id ?? "");
    const flagged = (!r.ok && r.code === "APPROVAL_REQUIRED") || (r.ok && (r.v?.status === "APPROVAL_REQUIRED" || r.v?.pending === true || r.v?.approvalRequired === true));
    chk("C1.5-S4.3", "STAFF (default cap 1000 bp): lines within the cap apply at once (797,230) · a line at 15 % ⇒ APPROVAL_REQUIRED · ApprovalRequest(crm.discount, PENDING) · deal.pendingLines + pendingApprovalRequestId set · CrmDealLine rows and valueSatang untouched",
      pol.ok && ok.ok && vOk === VAL_A && flagged && !!req && req.entityType === "crm.discount" && req.status === "PENDING" && row?.pendingLines != null &&
        rows.length === 3 && row?.valueSatang === VAL_A,
      "applied · pending", `policy=${pol.err || "ok"} within=${ok.err || vOk} over=${r.err || j(r.v)} req=${req?.entityType}/${req?.status} pending=${row?.pendingLines != null} rows=${rows.length} value=${row?.valueSatang}`);
  }
  {
    const d = await call(APR?.decide, approverM, { tenantId: tidA }, req1 || NONE, { decision: "APPROVED" });
    const ev = (await P.outboxEvent.findMany({ where: { tenantId: tidA, idempotencyKey: `approval.request.approved#${req1 || NONE}` } })) as Any[];
    const c = ev[0] ? await consume(ev[0]) : ({ ok: false, err: "no event" } as Res);
    const row = await dealRow(dLn);
    const rows = await lineRows(dLn);
    chk("C1.5-S4.4", "the approver approves ⇒ approval.request.approved consumer (approval-effects \"crm.discount\") applies the pending lines: 1 row at 850,000 · valueSatang 850,000 · pendingLines / pendingApprovalRequestId cleared",
      d.ok && c.ok && rows.length === 1 && rows[0].discountBp === 1500 && row?.valueSatang === 850_000 && row?.pendingLines == null && row?.pendingApprovalRequestId == null,
      "applied", `${d.err}${c.err} rows=${rows.length} value=${row?.valueSatang} pending=${j(row?.pendingLines)}`);
  }
  {
    const r = await call(fns.setLines, cSales, sales, dLn, { lines: SET_B, discountBp: 1500 });
    const row = await dealRow(dLn);
    const req2 = String(row?.pendingApprovalRequestId ?? "");
    const d = await call(APR?.decide, approverM, { tenantId: tidA }, req2 || NONE, { decision: "REJECTED", note: "ส่วนลดสูงเกินไป" });
    const ev = (await P.outboxEvent.findMany({ where: { tenantId: tidA, idempotencyKey: `approval.request.rejected#${req2 || NONE}` } })) as Any[];
    const c = ev[0] ? await consume(ev[0]) : ({ ok: false, err: "no event" } as Res);
    const after = await dealRow(dLn);
    const rows = await lineRows(dLn);
    chk("C1.5-S4.5", "a deal-level discount of 15 % on the SAME deal opens a NEW request (≠ the approved one) · rejected ⇒ pending cleared, lines and value stay the approved set (1 row · 850,000)",
      !!req2 && req2 !== req1 && d.ok && c.ok && after?.pendingLines == null && after?.pendingApprovalRequestId == null && rows.length === 1 && after?.valueSatang === 850_000,
      "new request · rejected · unchanged", `${r.err || j(r.v)} req2=${req2 ? (req2 === req1 ? "SAME" : "new") : "none"} ${d.err}${c.err} pending=${j(after?.pendingLines)} rows=${rows.length} value=${after?.valueSatang}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — quotation from lines
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S5 · quotation ──");
  const dQ = await fxDeal({ pipelineId: pA.id, title: `ดีลออกใบเสนอราคา ${rand}`, contactId: kMain, companyId: coMain, valueSatang: 0 });
  await call(fns.setLines, cA, owner, dQ, { lines: SET_A, discountBp: 200 });
  const q1 = await call(fns.quote, cA, owner, dQ, { validDays: 30 });
  const qDocId = String(q1.v?.docId ?? (await dealRow(dQ))?.quotationDocId ?? "");
  const qDoc = qDocId ? ((await P.accountDocument.findFirst({ where: { id: qDocId }, include: { lines: { orderBy: { sortOrder: "asc" } } } })) as Any) : null;
  {
    const dl = (qDoc?.lines ?? []) as Any[];
    const same = dl.length === 3 && dl.every((l, i) => l.description === SET_A[i].name && Number(l.qty) === SET_A[i].qty && l.unitPrice === SET_A[i].unitPriceSatang && l.amount === AMT_A[i]);
    chk("C1.5-S5.1", "issueQuotation ⇒ one AccountDocument QUOTATION (refType CrmDeal, refId = deal) whose 3 lines equal the deal lines (description · qty · unit price · amount after line discount)",
      q1.ok && qDoc?.docType === "QUOTATION" && qDoc?.refType === "CrmDeal" && qDoc?.refId === dQ && same, "3 matching lines",
      `${q1.err} type=${qDoc?.docType} ref=${qDoc?.refType}/${qDoc?.refId === dQ} lines=${cut(j(dl.map((l) => [l.description, Number(l.qty), l.unitPrice, l.amount])), 200)}`);
  }
  {
    const row = await dealRow(dQ);
    chk("C1.5-S5.2", "deal.quotationDocId = the document · document subTotal − discountAmount = deal.valueSatang (797,230 — the deal-level discount travels as the bill discount)",
      row?.quotationDocId === qDocId && !!qDoc && qDoc.subTotal - qDoc.discountAmount === VAL_A, "linked · totals match", `link=${row?.quotationDocId === qDocId} sub=${qDoc?.subTotal} disc=${qDoc?.discountAmount}`);
  }
  {
    const q2 = await call(fns.quote, cA, owner, dQ, {});
    const n = await P.accountDocument.count({ where: { tenantId: tidA, docType: "QUOTATION", refId: dQ } });
    chk("C1.5-S5.3", "issuing again is idempotent: same docId, still ONE quotation for the deal", q2.ok && String(q2.v?.docId ?? "") === qDocId && n === 1, "same doc", `${q2.err} doc=${q2.v?.docId === qDocId} count=${n}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — forecast (weighted · override · category · month with Thai dates) — pipeline pF
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · forecast ──");
  const [F1, F2, FW, FL] = pF.st;
  const coF = await fxCompany(cA, `บริษัทพยากรณ์ ${rand}`);
  const kF = await rawContact(tidA, crmA, `ผู้ติดต่อพยากรณ์ ${rand}`);
  await link(cA, coF, kF);
  const base = { pipelineId: pF.id, contactId: kF, companyId: coF };
  const f1 = await fxDeal({ ...base, stageId: F1, title: `F-f1 ${rand}`, valueSatang: 1_000_000, expectedCloseAt: "2026-10-31", forecastCategory: "PIPELINE", tags: ["vip"] });
  const f2 = await fxDeal({ ...base, stageId: F2, title: `F-f2 ${rand}`, valueSatang: 2_000_000, expectedCloseAt: "2026-10-01", forecastCategory: "COMMIT" });
  const f3 = await fxDeal({ ...base, stageId: F2, title: `F-f3 ${rand}`, valueSatang: 3_000_000, expectedCloseAt: "2026-11-01", forecastCategory: "BEST_CASE", probabilityOverride: 10, ownerUserId: userSales });
  const f4 = await fxDeal({ ...base, stageId: F1, title: `F-f4 ${rand}`, valueSatang: 500_000, forecastCategory: "PIPELINE" });
  const f5 = await fxDeal({ ...base, stageId: F2, title: `F-f5 ${rand}`, valueSatang: 4_000_000, expectedCloseAt: "2026-10-15", forecastCategory: "OMITTED" });
  const f6 = await fxDeal({ ...base, stageId: F2, title: `F-f6 ${rand}`, valueSatang: 7_000_000, expectedCloseAt: "2026-10-20" });
  const f7 = await fxDeal({ ...base, stageId: F1, title: `F-f7 ${rand}`, valueSatang: 900_000, expectedCloseAt: "2026-10-05" });
  await move(f6, FW);
  await move(f7, FL, { lostReasonId: lrA });
  await P.crmDeal.update({ where: { id: f1 }, data: { stalledAt: new Date() } });
  const rowsOf = (v: Any): Any[] => (Array.isArray(v) ? v : (v?.rows ?? v?.items ?? v?.groups ?? []));
  const keyOf = (r: Any) => r?.key ?? r?.month ?? r?.period ?? r?.ownerUserId ?? r?.owner ?? r?.teamId ?? r?.category ?? null;
  const wOf = (r: Any) => num(r?.weightedSatang ?? r?.weighted);
  const vOf = (r: Any) => num(r?.valueSatang ?? r?.value ?? r?.sumSatang);
  const sum = (rs: Any[], f: (r: Any) => number) => rs.reduce((a, r) => a + (Number.isFinite(f(r)) ? f(r) : 0), 0);
  const fc = async (o: Record<string, Any>) => { const r = await call(fns.forecast, cA, owner, { pipelineId: pF.id, ...o }); return { r, rows: rowsOf(r.v) }; };
  const byMonth = await fc({ groupBy: "month" });
  chk("C1.5-S6.1", "forecast (groupBy month) over OPEN deals only: Σ weighted = 1,600,000 (20 %·1M + 50 %·2M + override 10 %·3M + 20 %·0.5M) · Σ value 6,500,000 — WON, LOST and OMITTED excluded",
    byMonth.r.ok && sum(byMonth.rows, wOf) === 1_600_000 && sum(byMonth.rows, vOf) === 6_500_000, "1,600,000 / 6,500,000",
    `${byMonth.r.err} w=${sum(byMonth.rows, wOf)} v=${sum(byMonth.rows, vOf)} rows=${cut(j(byMonth.rows), 200)}`);
  {
    const o = await fc({ groupBy: "owner" });
    const s = o.rows.find((r) => keyOf(r) === userSales || j(r).includes(userSales));
    const a = o.rows.find((r) => keyOf(r) === userA || (j(r).includes(userA) && !j(r).includes(userSales)));
    chk("C1.5-S6.2", "probabilityOverride wins over the stage probability: groupBy owner ⇒ sales = 300,000 (10 % of 3M, not 50 %) · owner = 1,300,000",
      o.r.ok && wOf(s) === 300_000 && wOf(a) === 1_300_000, "300,000 · 1,300,000", `${o.r.err} sales=${wOf(s)} owner=${wOf(a)}`);
  }
  {
    const c1 = await fc({ groupBy: "month", category: "COMMIT" });
    const c2 = await fc({ groupBy: "month", category: "BEST_CASE" });
    const c3 = await fc({ groupBy: "month", category: "OMITTED" });
    chk("C1.5-S6.3", "category filter: COMMIT ⇒ 1,000,000 · BEST_CASE ⇒ 300,000 · OMITTED ⇒ 0 (never counted)",
      c1.r.ok && sum(c1.rows, wOf) === 1_000_000 && sum(c2.rows, wOf) === 300_000 && sum(c3.rows, wOf) === 0, "1M · 300k · 0", `${c1.r.err} ${sum(c1.rows, wOf)} · ${sum(c2.rows, wOf)} · ${sum(c3.rows, wOf)}`);
  }
  {
    const m = (k: string) => byMonth.rows.find((r) => String(keyOf(r)) === k);
    const other = byMonth.rows.filter((r) => !/^\d{4}-\d{2}$/.test(String(keyOf(r))));
    chk("C1.5-S6.4", "month buckets use the Thai calendar day (UTC-midnight DATE): 2026-10 = 1,200,000 (value 3M; 31 Oct stays October) · 2026-11 = 300,000 (1 Nov never slides into October) · one \"no date\" bucket = 100,000",
      wOf(m("2026-10")) === 1_200_000 && vOf(m("2026-10")) === 3_000_000 && wOf(m("2026-11")) === 300_000 && other.length === 1 && wOf(other[0]) === 100_000,
      "Oct · Nov · none", `oct=${wOf(m("2026-10"))}/${vOf(m("2026-10"))} nov=${wOf(m("2026-11"))} other=${cut(j(other), 100)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — board: per-column count / sum / weighted · cards
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S7 · board ──");
  const bd = await call(fns.board, cA, owner, { pipelineId: pF.id });
  const cols = (bd.v?.columns ?? bd.v?.stages ?? []) as Any[];
  const colOf = (sid: string) => cols.find((c) => (c?.stageId ?? c?.stage?.id ?? c?.id) === sid);
  const cardsOf = (c: Any): Any[] => (c?.cards ?? c?.deals ?? c?.items ?? []) as Any[];
  const cnt = (c: Any) => num(c?.count ?? c?.total ?? cardsOf(c).length);
  const sm = (c: Any) => num(c?.sumSatang ?? c?.valueSatang ?? c?.sum);
  chk("C1.5-S7.1", "getBoard: one column per stage in sortOrder · F1 = 2 deals / 1,500,000 · F2 = 3 / 9,000,000 · WON = 1 / 7,000,000",
    bd.ok && cols.length === 4 && cnt(colOf(F1)) === 2 && sm(colOf(F1)) === 1_500_000 && cnt(colOf(F2)) === 3 && sm(colOf(F2)) === 9_000_000 && cnt(colOf(FW)) === 1 && sm(colOf(FW)) === 7_000_000 && !!colOf(FL),
    "counts + sums", `${bd.err} cols=${cols.length} F1=${cnt(colOf(F1))}/${sm(colOf(F1))} F2=${cnt(colOf(F2))}/${sm(colOf(F2))} W=${cnt(colOf(FW))}/${sm(colOf(FW))}`);
  {
    const w1 = num(colOf(F1)?.weightedSatang ?? colOf(F1)?.weighted);
    const w2 = num(colOf(F2)?.weightedSatang ?? colOf(F2)?.weighted);
    chk("C1.5-S7.2", "per-column weighted: F1 = 300,000 (20 % of 1.5M) · F2 = 1,300,000 (50 % of 2M + override 10 % of 3M; 3,300,000 tolerated if OMITTED counts on the board)",
      w1 === 300_000 && (w2 === 1_300_000 || w2 === 3_300_000), "300,000 · 1,300,000", `F1=${w1} F2=${w2}`);
  }
  {
    const card = cardsOf(colOf(F1)).find((x) => did(x) === f1);
    const t = j(card ?? null);
    const all = cols.flatMap(cardsOf).map((x) => did(x));
    chk("C1.5-S7.3", "card DTO carries the 8 mockup-02 elements (title · company name · value · owner · expected close 2026-10-31 · stale flag · score · next activity) · the board only holds this pipeline's deals",
      !!card && t.includes(`F-f1 ${rand}`) && t.includes(`บริษัทพยากรณ์ ${rand}`) && t.includes("1000000") && /owner/i.test(t) && t.includes("2026-10-31") &&
        /"(stale|stalled|isStale|stalledAt)"\s*:\s*(true|"20)/.test(t) && /"\w*[sS]core\w*"\s*:/.test(t) && /"next\w*"\s*:/i.test(t) && !all.includes(d1) && all.includes(f4),
      "8 elements", `card=${cut(t, 240)} foreign=${all.includes(d1)}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — pages · drag hook · testids · prefill · visual spec (static; screenshots = controller gate D7)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · pages / drag / testids ──");
  {
    const pg = (p: string) => join(CRM_PAGES, p, "page.tsx");
    const list = read(pg("deals"));
    const p360 = read(pg("deals/[dealId]"));
    const req = ["deals/new", "pipelines", "settings/pipelines", "settings/stages", "settings/lost-reasons"];
    const missing = req.filter((p) => !existsSync(pg(p)));
    const nav = read(NAV_FILE);
    const navMiss = ["/crm/deals", ...req.map((p) => `/crm/${p}`)].filter((p) => !nav.includes(`"${p}"`));
    chk("C1.5-S8.1", "pages: /deals (v2 — listDeals/getBoard/forecast or deals-actions; view=board|table|forecast) · /deals/[dealId] (notFound() — 404-not-403) · /deals/new · /pipelines · /settings/{pipelines,stages,lost-reasons} · every non-param path listed in crm/nav.ts",
      /getBoard|listDeals|deals-actions|["']@\/lib\/modules\/crm\/deals["']/.test(list) && /board/.test(list) && /forecast/.test(list) && /\bnotFound\s*\(/.test(p360) && missing.length === 0 && navMiss.length === 0,
      "pages + nav", `listV2=${/getBoard|listDeals|deals-actions/.test(list)} 360notFound=${/\bnotFound\s*\(/.test(p360)} missing=${missing.join(",") || "-"} nav=${navMiss.join(",") || "-"}`, "MAJOR");
  }
  const dealUi = [...walk("src/components/crm/deal"), ...walk(join(CRM_PAGES, "deals"))];
  const dealUiSrc = dealUi.map(read).join("\n");
  {
    const bv = read("src/components/kanban/BoardView.tsx");
    const hookFiles = [...walk("src/components/shared"), ...walk("src/lib/ui")].filter((f) => /use\w*Drag\w*\.tsx?$/.test(f));
    const hookName = hookFiles.length ? (/export\s+function\s+(use\w+)/.exec(read(hookFiles[0]))?.[1] ?? "") : "";
    const bvUses = !!hookName && new RegExp(`\\b${hookName}\\b`).test(bv);
    const dealUses = !!hookName && new RegExp(`\\b${hookName}\\b`).test(dealUiSrc);
    chk("C1.5-S8.2", "the kanban pointer-drag logic lives in ONE shared hook (src/components/shared/use*Drag*.ts): BoardView.tsx and the deal board both use it · BoardView no longer defines beginCardDrag/targetAt itself · pointer events only (no HTML5 draggable)",
      !!hookName && bvUses && dealUses && !/const\s+beginCardDrag\s*=/.test(bv) && !/const\s+targetAt\s*=/.test(bv) && /onPointerDown|setPointerCapture|pointerdown/.test(read(hookFiles[0]) + dealUiSrc) && !/draggable=\{?true|onDragStart=/.test(dealUiSrc),
      "shared hook", `hook=${hookFiles[0] ?? "-"}:${hookName || "-"} kanban=${bvUses} deals=${dealUses} bvStillDefines=${/const\s+beginCardDrag\s*=/.test(bv)}`, "MAJOR");
  }
  {
    const inv = JSON.parse(read("scripts/crm-ui-inventory.json") || "{}") as Any;
    const rows = ((inv?.rows ?? []) as Any[]).filter((r) => String(r?.page ?? "").startsWith("/deals"));
    const tids = ["deal-board", "deal-card", "deal-column"];
    const inSrc = tids.filter((t) => new RegExp(`data-testid=\\{?[\\\`"']${t}`).test(dealUiSrc));
    const mobile = /data-testid=\{?[`"']deal-(stage|column)-(tab|swipe|pager|nav)/.test(dealUiSrc);
    const dragRows = rows.filter((r) => r?.kind === "drag");
    chk("C1.5-S8.3", "drag testids: deal-board · deal-card-* · deal-column-* + a mobile swipe-per-stage control (deal-stage-tab/swipe/pager) in the deal board · crm-ui-inventory.json has /deals rows incl. ≥ 1 kind \"drag\" (D8 · parity owner/thana × 1440/390 = D7)",
      inSrc.length === 3 && mobile && rows.length > 0 && dragRows.length >= 1, "testids + inventory", `src=${inSrc.join(",") || "-"} mobile=${mobile} rows=${rows.length} drag=${dragRows.length}`, "MAJOR");
  }
  {
    const list = read(join(CRM_PAGES, "deals", "page.tsx"));
    const nw = read(join(CRM_PAGES, "deals", "new", "page.tsx"));
    chk("C1.5-S8.4", "C1.3's company-360 \"เปิดดีลใหม่\" → /crm/deals?companyId=<id> pre-fills the company: /deals reads companyId (forwards to /deals/new?companyId= or opens the new-deal form) and /deals/new reads searchParams.companyId and passes it as the form's default (re-resolved server-side) [static]",
      /companyId/.test(list) && (/deals\/new/.test(list) || /NewDeal|DealForm/.test(list)) && /searchParams/.test(nw) && /companyId/.test(nw),
      "prefill", `list=${/companyId/.test(list)} new=${/searchParams/.test(nw) && /companyId/.test(nw)}`, "MAJOR");
  }
  {
    const vis = read("scripts/visual-crm.mts");
    chk("C1.5-S8.5", "visual-crm.mts has v2 deal specs (board /deals, deal 360 /deals/<id>, /deals/new, /pipelines) runnable for owner and thana at 1440/390 (controller shoots them for D7) [static]",
      /crm-v2-deals|deals-board|deal-360/.test(vis) && /\/deals\/new/.test(vis) && /pipelines/.test(vis), "specs", `board=${/crm-v2-deals|deals-board/.test(vis)} new=${/\/deals\/new/.test(vis)} pipelines=${/pipelines/.test(vis)}`, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — brief extras
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S9 · brief extras ──");
  const EVTS = ["crm.deal.created", "crm.deal.stage.changed", "crm.deal.won", "crm.deal.lost", "crm.deal.reopened", "crm.deal.reassigned", "crm.deal.updated"];
  {
    const autoL = (await import("@/lib/automation/labels")) as Any;
    const hookL = (await import("@/lib/webhooks/labels")) as Any;
    const hook = new Set(((hookL.WEBHOOK_EVENTS ?? []) as Any[]).map((e) => e.value));
    const missing = EVTS.filter((t) => typeof CONS?.[t] !== "function" || !hook.has(t));
    const srcA = read("src/lib/automation/labels.ts");
    const srcW = read("src/lib/webhooks/labels.ts");
    const decl = (src: string, t: string) => (src.match(new RegExp(`value:\\s*"${t.replace(/\./g, "\\.")}"`, "g")) ?? []).length;
    const dupDecl = EVTS.filter((t) => decl(srcA, t) + decl(srcW, t) !== 1);
    chk("C1.5-S9.1", "the 7 crm.deal.* events are in all 3 registries — consumer in outbox-consumers.ts + label reachable from WEBHOOK_EVENTS, declared exactly once",
      missing.length === 0 && dupDecl.length === 0, "7 × 3", `missing=${missing.join(",") || "-"} declCount≠1=${dupDecl.join(",") || "-"}`);
  }
  {
    const T = `ดีลย้อนสร้าง ${rand}`;
    let cr: Res;
    try { await mkTrigger(`NEW.type = 'crm.deal.created'`); cr = await call(fns.create, cA, owner, { pipelineId: pA.id, title: T, contactId: kMain, companyId: coMain, valueSatang: 10_000 }); } finally { await dropTriggers(); }
    const left = await P.crmDeal.count({ where: { tenantId: tidA, title: T } });
    const dm = await fxDeal({ pipelineId: pA.id, title: `ดีลย้อนย้าย ${rand}`, contactId: kMain, companyId: coMain, valueSatang: 20_000 });
    const before = { row: j(await dealRow(dm)), h: (await hist(dm)).length, cache: (await cacheState(coMain)).info };
    let mv: Res;
    try { await mkTrigger(`NEW."idempotencyKey" LIKE 'crm.deal.stage.changed#${dm}%'`); mv = await move(dm, SW); } finally { await dropTriggers(); }
    const after = { row: j(await dealRow(dm)), h: (await hist(dm)).length, cache: (await cacheState(coMain)).info };
    chk("C1.5-S9.2", "events are INSIDE the write transaction: a failing crm.deal.created ⇒ no deal row · a failing crm.deal.stage.changed ⇒ deal, history and company cache untouched",
      !cr.ok && cr.code !== "MISSING_FUNCTION" && left === 0 && !mv.ok && mv.code !== "MISSING_FUNCTION" && after.row === before.row && after.h === before.h && after.cache === before.cache,
      "both rolled back", `create=${cr.ok ? "succeeded" : "failed"} rows=${left} move=${mv.ok ? "succeeded" : "failed"} same=${after.row === before.row}/${after.h === before.h}/${after.cache === before.cache}`);
  }
  {
    const k = await rawContact(tidA, crmA, `แปลงเป็นดีล ${rand}`, { email: mailOf("cv") });
    const r = await call(CT.convertContact, cA, owner, k, { idempotencyKey: `${TAG}-cv`, member: { systemId: memA }, deal: { pipelineId: pA.id, title: `ดีลจากแปลง ${rand}`, valueSatang: 300_000 } });
    const dId = String(r.v?.dealId ?? "");
    const ev = await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.deal.created", payload: { path: ["contactId"], equals: k } } });
    const h = await hist(dId);
    chk("C1.5-S9.3", "C1.4 debt: convertContact with a deal tick ⇒ the deal is created by deals.createDeal — exactly ONE crm.deal.created (payload dealId = the convert's dealId) + its first history row at the pipeline's first OPEN stage",
      r.ok && !!dId && ev.length === 1 && (ev[0] as Any).payload?.dealId === dId && h.length === 1 && h[0].toStageId === S0, "1 event + history",
      `${r.err} deal=${!!dId} events=${ev.length} hist=${h.length}`);
  }
  {
    const k = await rawContact(tidA, crmA, `แปลงย้อน ${rand}`, { email: mailOf("cvrb") });
    const party = (await P.crmContact.findFirst({ where: { id: k } }))?.partyId;
    const before = j(await P.crmContact.findFirst({ where: { id: k } }));
    let r: Res;
    try {
      await mkTrigger(`NEW.type = 'crm.deal.created' AND NEW.payload->>'contactId' = '${k}'`);
      r = await call(CT.convertContact, cA, owner, k, { idempotencyKey: `${TAG}-cvrb`, member: { systemId: memA }, company: { new: { name: `บริษัทแปลงย้อน ${rand}` } }, deal: { pipelineId: pA.id, title: `ดีลแปลงย้อน ${rand}` } });
    } finally { await dropTriggers(); }
    const cust = await P.customer.count({ where: { memberSystemId: memA, partyId: party ?? NONE } });
    const deals = await P.crmDeal.count({ where: { contactId: k } });
    const cos = await P.crmCompany.count({ where: { tenantId: tidA, name: `บริษัทแปลงย้อน ${rand}` } });
    const conv = await P.outboxEvent.count({ where: { tenantId: tidA, type: "crm.contact.converted", idempotencyKey: { startsWith: `crm.contact.converted#${k}` } } });
    chk("C1.5-S9.4", "convert rollback still holds after the refactor: crm.deal.created cannot be written ⇒ NOTHING persists (no member, company, deal, converted event; contact byte-identical)",
      !r.ok && r.code !== "MISSING_FUNCTION" && cust === 0 && deals === 0 && cos === 0 && conv === 0 && j(await P.crmContact.findFirst({ where: { id: k } })) === before,
      "rolled back", `call=${r.ok ? "succeeded" : r.err} members=${cust} deals=${deals} companies=${cos} converted=${conv}`);
  }
  {
    const v1 = await call(SVC?.createDeal, { tenantId: tidA, systemId: crmA }, { contactId: kPlain, pipelineId: pA.id, stageId: S0, title: `ดีลรุ่นเก่า ${rand}`, valueSatang: 250_000 });
    const id = String(v1.v?.id ?? "");
    const h0 = await hist(id);
    const c0 = await evOf("crm.deal.created", id);
    const m = await call(SVC?.moveDeal, { tenantId: tidA, systemId: crmA }, id || NONE, SW);
    const row = await dealRow(id);
    chk("C1.5-S9.5", "v1 facade keeps working through deals.ts: crm.createDeal(ctx, input) ⇒ {id} + first history row + crm.deal.created · crm.moveDeal(ctx, id, wonStage) ⇒ WON, 2 history rows, exactly one crm.deal.won",
      v1.ok && !!id && h0.length === 1 && c0.length === 1 && m.ok && row?.kind === "WON" && (await hist(id)).length === 2 && (await evOf("crm.deal.won", id)).length === 1,
      "v1 → v2", `${v1.err}${m.err} hist=${h0.length} created=${c0.length} kind=${row?.kind}`);
  }
  {
    const a = await fxDeal({ pipelineId: pA.id, title: `วันไทย ก ${rand}`, contactId: kPlain, expectedCloseAt: new Date("2026-12-31T00:30:00+07:00") });
    const b = await fxDeal({ pipelineId: pA.id, title: `วันไทย ข ${rand}`, contactId: kPlain, expectedCloseAt: "2026-12-31" });
    const u = await call(fns.update, cA, owner, b, { expectedCloseAt: "2027-01-01" });
    const bad = await call(fns.update, cA, owner, b, { expectedCloseAt: "2026-02-30" });
    const g = await call(fns.get360, cA, owner, b);
    chk("C1.5-S9.6", "expectedCloseAt (C1.2a debt): 00:30 Thai time on 31 Dec and \"2026-12-31\" both store 2026-12-31T00:00:00Z (Thai calendar day, UTC-midnight DATE) · update \"2027-01-01\" round-trips (360 shows 2027-01-01) · \"2026-02-30\" ⇒ VALIDATION",
      j((await dealRow(a))?.expectedCloseAt) === "\"2026-12-31T00:00:00.000Z\"" && j((await dealRow(b))?.expectedCloseAt) === "\"2027-01-01T00:00:00.000Z\"" && u.ok && isValidation(bad) && g.ok && j(g.v).includes("2027-01-01"),
      "same calendar day", `a=${j((await dealRow(a))?.expectedCloseAt)} b=${j((await dealRow(b))?.expectedCloseAt)} ${u.err} bad=${bad.err || "accepted"} 360=${j(g.v).includes("2027-01-01")}`);
  }
  {
    const before = j(await dealRow(dQ));
    const a = await call(F?.setFieldValues, fctx, dQ, { valueSatang: 5 }, { via: "STAFF" });
    const b = await call(F?.setFieldValues, fctx, dQ, { ownerUserId: userSales }, { via: "STAFF" });
    const c = await call(F?.setFieldValues, fctx, dQ, { qcRegion: "ภาคใต้" }, { via: "STAFF" });
    const row = await dealRow(dQ);
    chk("C1.5-S9.7", "the field engine (objectKey deal) refuses GOVERNED_CRM_SYSTEM_KEYS.deal (valueSatang · ownerUserId) — deal row unchanged, value still Σ lines (797,230) · a plain custom key is accepted",
      !a.ok && !b.ok && c.ok && row?.valueSatang === VAL_A && row?.ownerUserId === userA && JSON.parse(before)?.valueSatang === VAL_A,
      "refused ×2 · plain ok", `${a.err || "accepted"} | ${b.err || "accepted"} | ${c.err || "ok"} value=${row?.valueSatang} owner=${row?.ownerUserId === userA}`);
  }
  {
    const dx = await fxDeal({ pipelineId: pA.id, title: `ดีลโอน ${rand}`, contactId: kMain, companyId: coMain, valueSatang: 40_000 });
    const u0 = (await evOf("crm.deal.updated", dx)).length;
    const a = await call(fns.reassign, cA, owner, dx, { ownerUserId: userSales });
    const bad = await call(fns.reassign, cA, owner, dx, { ownerUserId: userStranger });
    const c = await call(fns.setCat, cA, owner, dx, "COMMIT");
    const n = await call(fns.setNext, cA, owner, dx, "นัดสาธิตสินค้าวันพฤหัส");
    const co = await call(fns.setCollab, cA, owner, dx, [userMgr]);
    const coBad = await call(fns.setCollab, cA, owner, dx, [userStranger]);
    const row = await dealRow(dx);
    const ra = await evOf("crm.deal.reassigned", dx);
    const up = (await evOf("crm.deal.updated", dx)).length - u0;
    chk("C1.5-S9.8", "reassignDeal ⇒ owner + one crm.deal.reassigned; another shop's user ⇒ VALIDATION · setForecastCategory COMMIT · setNextStep · setCollaborators (shop members only) · each ⇒ crm.deal.updated",
      a.ok && isValidation(bad) && row?.ownerUserId === userSales && ra.length === 1 && c.ok && row?.forecastCategory === "COMMIT" && n.ok && row?.nextStep === "นัดสาธิตสินค้าวันพฤหัส" &&
        co.ok && sameSet(row?.collaboratorUserIds ?? [], [userMgr]) && isValidation(coBad) && up >= 3,
      "all applied", `${a.err}${c.err}${n.err}${co.err} bad=${bad.err || "accepted"} collabBad=${coBad.err || "accepted"} owner=${row?.ownerUserId === userSales} reassigned=${ra.length} updated=${up}`, "MAJOR");
  }
  {
    const dx = await fxDeal({ pipelineId: pA.id, stageId: S1, title: `ดีลย้ายไปป์ไลน์ ${rand}`, contactId: kPlain, valueSatang: 30_000 });
    const s = await call(fns.changePipe, cSales, sales, dx, { pipelineId: pX.id });
    const o = await call(fns.changePipe, cA, owner, dx, { pipelineId: pX.id });
    const row = await dealRow(dx);
    const open = (await hist(dx)).filter((h) => !h.leftAt);
    const cross = await move(dx, S0);
    chk("C1.5-S9.9", "cross-pipeline move (R-A): STAFF ⇒ FORBIDDEN · OWNER ⇒ pipeline pX at its FIRST OPEN stage, one open history row there · afterwards a stage of the OLD pipeline is refused by moveDeal",
      isForbidden(s) && o.ok && row?.pipelineId === pX.id && row?.stageId === pX.st[0] && open.length === 1 && open[0].toStageId === pX.st[0] && isScopeRefusal(cross),
      "manager+ · first stage", `staff=${s.err || "accepted"} ${o.err} pipe=${row?.pipelineId === pX.id} stage=${row?.stageId === pX.st[0]} open=${open.length} cross=${cross.err || "accepted"}`, "MAJOR");
  }
  {
    const np = await call(fns.plCreate, cA, owner, { name: `ไปป์ไลน์ใหม่ ${rand}`, stages: [{ name: "เริ่ม", kind: "OPEN", probability: 10 }, { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 }] });
    const npId = String(np.v?.id ?? np.v?.pipeline?.id ?? "");
    const stg = npId ? await P.crmStage.findFirst({ where: { pipelineId: npId, kind: "OPEN" } }) : null;
    const us = await call(fns.plUpdateStage, cA, owner, stg?.id ?? NONE, { requireFields: ["nextStep"], staleDays: 7 });
    const stg2 = stg ? await P.crmStage.findFirst({ where: { id: stg.id } }) : null;
    const busy = await call(fns.plArchive, cA, owner, pA.id, { confirm: true, reason: "เลิกใช้ไปป์ไลน์นี้แล้ว" });
    const free = await call(fns.plArchive, cA, owner, npId || NONE, { confirm: true, reason: "เลิกใช้ไปป์ไลน์นี้แล้ว" });
    const lc = await call(fns.lrCreate, cA, owner, { label: `งบไม่ผ่าน ${rand}` });
    const lrId = String(lc.v?.id ?? "");
    const lu = await call(fns.lrUpdate, cA, owner, lrId || NONE, { active: false });
    const ll = await call(fns.lrList, cA, owner);
    chk("C1.5-S9.10", "pipelines.ts: createPipeline (stages in order) · updateStage writes requireFields/staleDays · archivePipeline refused (Thai) while OPEN deals remain, allowed when none · lost-reasons.ts: create · deactivate · list",
      np.ok && !!stg && us.ok && j(stg2?.requireFields) === "[\"nextStep\"]" && stg2?.staleDays === 7 && isRefused(busy) && thai(busy.msg) && !(await P.crmPipeline.findFirst({ where: { id: pA.id } }))?.archivedAt &&
        free.ok && !!(await P.crmPipeline.findFirst({ where: { id: npId || NONE } }))?.archivedAt && lc.ok && lu.ok && (await P.crmLostReason.findFirst({ where: { id: lrId || NONE } }))?.active === false && ll.ok && j(ll.v).includes(lrId),
      "settings services", `${np.err}${us.err}${free.err}${lc.err}${lu.err}${ll.err} busy=${busy.err || "accepted"}`, "MAJOR");
  }
  {
    const g = await call(fns.get360, cA, owner, dQ);
    const d = g.v ?? {};
    const t = j(d);
    chk("C1.5-S9.11", "getDeal360 DTO (mockup 03 panels): deal header · stages stepper (4, current marked) · lines (3) · stage history · company · contact · docs (the quotation) · timeline[]",
      g.ok && did(d.deal ?? d) === dQ && (d.stages ?? []).length === 4 && (d.lines ?? []).length === 3 && Array.isArray(d.history) && t.includes(coMain) && t.includes(kMain) &&
        t.includes(qDocId || NONE) && Array.isArray(d.timeline),
      "panels", `${g.err} stages=${(d.stages ?? []).length} lines=${(d.lines ?? []).length} history=${Array.isArray(d.history)} company=${t.includes(coMain)} doc=${t.includes(qDocId || NONE)} timeline=${Array.isArray(d.timeline)}`, "MAJOR");
  }
  const FXS = [f1, f2, f3, f4, f5, f6, f7];
  const ls = async (flt: Record<string, Any>) => {
    const r = await call(fns.list, cA, owner, { pipelineId: pF.id, pageSize: 200, ...flt });
    return { r, ids: itemsOf(r.v).map(did).filter((x) => FXS.includes(x)).sort().join(",") };
  };
  const ex = (xs: string[]) => [...xs].sort().join(",");
  await call(F?.setFieldValues, fctx, f2, { qcRegion: "ภาคใต้" }, { via: "STAFF" });
  {
    const o = await ls({ owner: userSales });
    const s = await ls({ stage: F1 });
    const c = await ls({ closeFrom: "2026-10-01", closeTo: "2026-10-31" });
    const st = await ls({ stale: true });
    const tg = await ls({ tag: "vip" });
    const q = await ls({ q: `F-f3 ${rand}` });
    const f = await ls({ f: { qcRegion: "ภาคใต้" } });
    const co = await ls({ companyId: coF });
    chk("C1.5-S9.12", "listDeals filters: owner ⇒ f3 · stage F1 ⇒ f1,f4 · close 1–31 Oct (Thai dates, inclusive) ⇒ f1,f2,f5,f6,f7 · stale ⇒ f1 · tag vip ⇒ f1 · q ⇒ f3 · f.qcRegion ⇒ f2 · companyId ⇒ all 7",
      o.r.ok && o.ids === ex([f3]) && s.ids === ex([f1, f4]) && c.ids === ex([f1, f2, f5, f6, f7]) && st.ids === ex([f1]) && tg.ids === ex([f1]) && q.ids === ex([f3]) && f.ids === ex([f2]) && co.ids === ex(FXS),
      "8 filters", `${o.r.err} owner=${o.ids.split(",").length} stage=${s.ids.split(",").filter(Boolean).length} close=${c.ids.split(",").filter(Boolean).length} stale=${st.ids.split(",").filter(Boolean).length} tag=${tg.ids.split(",").filter(Boolean).length} q=${q.ids.split(",").filter(Boolean).length} f=${f.ids.split(",").filter(Boolean).length} co=${co.ids.split(",").filter(Boolean).length}`, "MAJOR");
  }
  {
    const view = await P.memberSavedView.create({ data: { tenantId: tidA, systemId: crmA, ownerUserId: userA, scope: "PRIVATE", name: `มุมมองดีล ${TAG}`, objectKey: "deal", filters: { stage: F2 } } });
    const wrong = await P.memberSavedView.create({ data: { tenantId: tidA, systemId: crmA2, ownerUserId: userA, scope: "PRIVATE", name: `มุมมองระบบอื่น ${TAG}`, objectKey: "deal", filters: {} } });
    const v = await ls({ savedViewId: view.id });
    const w = await ls({ savedViewId: wrong.id });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let err = "";
    do {
      const r = await call(fns.list, cA, owner, { pipelineId: pF.id, pageSize: 3, ...(cursor ? { cursor } : {}) });
      if (!r.ok) { err = r.err; break; }
      seen.push(...itemsOf(r.v).map(did));
      cursor = (r.v?.nextCursor ?? null) as string | null;
      pages += 1;
    } while (cursor && pages < 10);
    chk("C1.5-S9.13", "savedViewId (objectKey deal, this system) applies its filters ⇒ f2,f3,f5 · a view of another CRM system is refused or yields nothing · cursor pagination (pageSize 3) walks all 7 without duplicates and ends with null",
      v.r.ok && v.ids === ex([f2, f3, f5]) && (isScopeRefusal(w.r) || (w.r.ok && w.ids === "")) && !err && sameSet(seen.filter((x) => FXS.includes(x)), FXS) && new Set(seen).size === seen.length && cursor === null,
      "view · pages", `${v.r.err} view=${v.ids.split(",").filter(Boolean).length} wrong=${w.r.err || w.ids.length} ${err} seen=${seen.length} pages=${pages}`, "MAJOR");
  }
  {
    const r = await call(fns.invoice, cA, owner, dQ);
    const row = await dealRow(dQ);
    const inv = row?.invoiceDocId ? await P.accountDocument.findFirst({ where: { id: row.invoiceDocId } }) : null;
    chk("C1.5-S9.14", "issueInvoice ⇒ an INVOICE document of the linked book · deal.invoiceDocId = it", r.ok && inv?.docType === "INVOICE", "invoice", `${r.err} doc=${inv?.docType}`, "MAJOR");
  }
  {
    const item = await P.invItem.create({ data: { tenantId: tidA, systemId: invA, sku: `${TAG}-sku`, name: `คอร์สในคลัง ${rand}`, kind: "SERVICE", priceSatang: 100_000 } });
    const dp = await fxDeal({ pipelineId: pA.id, title: `ดีลราคาเปลี่ยน ${rand}`, contactId: kPlain });
    await call(fns.setLines, cA, owner, dp, { lines: [{ name: "คอร์สในคลัง", qty: 1, unitPriceSatang: 100_000, productId: item.id }] });
    const g0 = await call(fns.get360, cA, owner, dp);
    await P.invItem.update({ where: { id: item.id }, data: { priceSatang: 120_000 } });
    const g1 = await call(fns.get360, cA, owner, dp);
    const flag = (v: Any) => { const l = (v?.lines ?? [])[0]; return !!l && (l.priceChanged === true || (Number.isFinite(num(l.currentPriceSatang)) && num(l.currentPriceSatang) !== l.unitPriceSatang)); };
    chk("C1.5-S9.15", "R-A price badge: a line whose inventory item price changed after the snapshot is flagged in getDeal360 (priceChanged) — and not flagged before the change",
      g0.ok && !flag(g0.v) && g1.ok && flag(g1.v), "flag after change only", `${g0.err}${g1.err} before=${flag(g0.v)} after=${flag(g1.v)}`, "MINOR");
  }
  {
    await call(fns.setLines, cA, owner, dQ, { lines: SET_B, discountBp: 0 });
    const g = await call(fns.get360, cA, owner, dQ);
    const t = j(g.v ?? {});
    chk("C1.5-S9.16", "§11.3: lines changed after the quotation was issued ⇒ getDeal360 flags \"ต่างจากใบเสนอราคา\" (a truthy quote-differs flag)",
      g.ok && /"(quotation|quote)\w*(Differs|Stale|Changed|Mismatch|Outdated)"\s*:\s*true/i.test(t), "flag", cut(t.match(/"(quotation|quote)\w*"\s*:\s*[^,}]+/gi)?.join(" ") ?? "-", 160), "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope: other tenant · OTHER CRM system · stage/pipeline mismatch · contact↔company · ctx re-resolved
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  const kA2 = await rawContact(tidA, crmA2, `ผู้ติดต่อระบบสอง ${rand}`);
  const kB = await rawContact(tidB, crmB, `ผู้ติดต่อร้านอื่น ${rand}`);
  const coA2 = await fxCompany(cA2, `บริษัทระบบสอง ${rand}`);
  const dA2 = (await P.crmDeal.create({ data: { tenantId: tidA, systemId: crmA2, contactId: kA2, pipelineId: pA2.id, stageId: pA2.st[0], title: `${FOREIGN_TITLE} ระบบสอง`, valueSatang: 111 } })).id as string;
  const dB = (await P.crmDeal.create({ data: { tenantId: tidB, systemId: crmB, contactId: kB, pipelineId: pB.id, stageId: pB.st[0], title: `${FOREIGN_TITLE} ร้านบี`, valueSatang: 222 } })).id as string;
  const snapF = async () => j([await dealRow(dA2), await dealRow(dB), await lineRows(dA2), await lineRows(dB)]);
  const snapF0 = await snapF();
  chk("C1.5-X1.0", "[positive control] the foreign deals exist (crmA2 of tenant A · crmB of tenant B)", !!(await dealRow(dA2)) && !!(await dealRow(dB)), "2 rows", `${dA2} ${dB}`, "MAJOR");
  {
    const a = await call(fns.get360, cA, owner, dA2);
    const b = await call(fns.get360, cA, owner, dB);
    chk("C1.5-X1.1", "getDeal360 of another CRM system's / another shop's deal ⇒ NOT_FOUND, the error never echoes their data",
      isNotFound(a) && isNotFound(b) && !a.msg.includes(FOREIGN_TITLE) && !b.msg.includes(FOREIGN_TITLE), "404 ×2", `${a.err || "returned"} | ${b.err || "returned"}`);
  }
  {
    const rs = [
      await move(dA2, pA2.st[1]), await move(dB, pB.st[1]), await call(fns.update, cA, owner, dA2, { title: "ข้าม" }),
      await call(fns.setLines, cA, owner, dB, { lines: SET_B }), await call(fns.reassign, cA, owner, dA2, { ownerUserId: userSales }),
      await call(fns.quote, cA, owner, dA2, {}), await call(fns.reopen, cA, owner, dB, { confirm: true, reason: "ข้ามร้านนะ" }),
      await call(fns.del, cA, owner, dA2, { confirm: true, reason: "ข้ามระบบนะ" }), await call(fns.setCat, cA, owner, dB, "COMMIT"),
    ];
    chk("C1.5-X1.2", "move / update / setLines / reassign / issueQuotation / reopen / delete / setForecastCategory on a foreign deal ⇒ NOT_FOUND each · both foreign deals untouched",
      rs.every(isNotFound) && (await snapF()) === snapF0, "404 ×9", rs.map((r) => r.code || "ok").join(","));
  }
  {
    const cases: [string, Record<string, Any>][] = [
      ["pipeline of another CRM system", { pipelineId: pA2.id, contactId: kMain }],
      ["pipeline of another shop", { pipelineId: pB.id, contactId: kMain }],
      ["stage of another pipeline", { pipelineId: pA.id, stageId: pF.st[0], contactId: kMain }],
      ["contact of another CRM system", { pipelineId: pA.id, contactId: kA2 }],
      ["contact of another shop", { pipelineId: pA.id, contactId: kB }],
      ["company of another CRM system", { pipelineId: pA.id, contactId: kMain, companyId: coA2 }],
      ["lostReason / owner of another shop", { pipelineId: pA.id, contactId: kMain, ownerUserId: userStranger }],
    ];
    const out: string[] = [];
    let allOk = true;
    for (const [label, part] of cases) {
      const T = `ดีลข้าม ${out.length} ${rand}`;
      const r = await call(fns.create, cA, owner, { title: T, valueSatang: 1_000, ...part });
      const n = await P.crmDeal.count({ where: { title: T } });
      const ok = isScopeRefusal(r) && n === 0;
      allOk &&= ok;
      out.push(`${label}:${ok ? "refused" : r.err || "ACCEPTED"}`);
    }
    chk("C1.5-X1.3", "createDeal with a pipeline of another system/shop · a stage of another pipeline · a contact or company of another system/shop · an owner from another shop ⇒ NOT_FOUND/VALIDATION each, no row",
      allOk, "refused ×7", cut(out.join(" · "), 420));
  }
  {
    const dx = await fxDeal({ pipelineId: pA.id, title: `ดีลขั้นผิด ${rand}`, contactId: kMain, companyId: coMain });
    const r = await move(dx, pF.st[1]);
    const coOther = await fxCompany(cA, `บริษัทไม่เกี่ยว ${rand}`);
    const T = `ดีลบริษัทไม่ตรง ${rand}`;
    const bad = await call(fns.create, cA, owner, { pipelineId: pA.id, title: T, contactId: kMain, companyId: coOther });
    const T2 = `ดีลบริษัทตามผู้ติดต่อ ${rand}`;
    const auto = await call(fns.create, cA, owner, { pipelineId: pA.id, title: T2, contactId: kMain });
    const autoRow = await P.crmDeal.findFirst({ where: { title: T2 } });
    chk("C1.5-X1.4", "moveDeal to a stage of ANOTHER pipeline ⇒ refused, deal unmoved · contact↔company consistency: a company the contact is not linked to ⇒ VALIDATION (no row) · no companyId ⇒ the contact's company",
      isScopeRefusal(r) && (await dealRow(dx))?.pipelineId === pA.id && isValidation(bad) && (await P.crmDeal.count({ where: { title: T } })) === 0 && auto.ok && autoRow?.companyId === coMain,
      "refused · consistent", `move=${r.err || "accepted"} badCompany=${bad.err || "accepted"} autoCompany=${autoRow?.companyId === coMain}`);
  }
  {
    const r1 = await call(fns.create, { tenantId: tidA, systemId: crmB, actorUserId: userA }, owner, { pipelineId: pB.id, title: `ctx ร้านอื่น ${rand}`, contactId: kB });
    const r2 = await call(fns.create, { tenantId: tidA, systemId: memA, actorUserId: userA }, owner, { pipelineId: pA.id, title: `ctx ระบบสมาชิก ${rand}`, contactId: kMain });
    const r3 = await call(fns.board, { tenantId: tidA, systemId: crmB, actorUserId: userA }, owner, { pipelineId: pB.id });
    const n = await P.crmDeal.count({ where: { title: { in: [`ctx ร้านอื่น ${rand}`, `ctx ระบบสมาชิก ${rand}`] } } });
    chk("C1.5-X1.5", "ctx.systemId is re-resolved against the tenant (type CRM): another shop's CRM system or a MEMBER system in ctx ⇒ refused (create and getBoard), no row",
      isScopeRefusal(r1) && isScopeRefusal(r2) && isScopeRefusal(r3) && n === 0, "refused ×3", `${r1.err || "accepted"} | ${r2.err || "accepted"} | ${r3.err || "returned"} rows=${n}`);
  }
  {
    const l1 = await call(fns.list, cA, owner, { pageSize: 200 });
    const l2 = await call(fns.list, cA, owner, { q: FOREIGN_TITLE, pageSize: 200 });
    const b = await call(fns.board, cA, owner, { pipelineId: pA2.id });
    const fcx = await call(fns.forecast, cA, owner, { groupBy: "month" });
    const e = await call(fns.exp, cA, owner, {});
    const txt = typeof e.v === "string" ? e.v : String(e.v?.csv ?? "");
    const ids = itemsOf(l1.v).map(did);
    chk("C1.5-X1.6", "listDeals (with/without the foreign title) · getBoard of another system's pipeline · forecast · exportDeals never include another system's or shop's deal",
      l1.ok && !ids.includes(dA2) && !ids.includes(dB) && l2.ok && itemsOf(l2.v).length === 0 && isScopeRefusal(b) && fcx.ok && !j(fcx.v).includes(dA2) &&
        e.ok && !txt.includes(FOREIGN_TITLE) && txt.includes(`F-f1 ${rand}`),
      "own only", `${l1.err}${l2.err}${fcx.err}${e.err} list=${ids.includes(dA2) || ids.includes(dB)} q=${itemsOf(l2.v).length} board=${b.err || "returned"} export=${txt.includes(FOREIGN_TITLE)}`);
  }
  {
    const dx = await fxDeal({ pipelineId: pA.id, title: `ดีลเหตุผลข้าม ${rand}`, contactId: kMain, companyId: coMain });
    const r = await move(dx, SL, { lostReasonId: lrA2 });
    const u1 = await call(fns.plUpdateStage, cA, owner, pA2.st[0], { staleDays: 1 });
    const u2 = await call(fns.plArchive, cA, owner, pB.id, { confirm: true, reason: "ข้ามร้านนะ" });
    const u3 = await call(fns.lrUpdate, cA, owner, lrA2, { active: false });
    const itemB = await P.invItem.create({ data: { tenantId: tidB, systemId: (await P.appSystem.findFirst({ where: { tenantId: tidB, type: "MEMBER" } }))?.id ?? NONE, sku: `${TAG}-skub`, name: "ของร้านอื่น", priceSatang: 1 } }).catch(() => null);
    const l = itemB ? await call(fns.setLines, cA, owner, dx, { lines: [{ name: "ของร้านอื่น", qty: 1, unitPriceSatang: 1, productId: itemB.id }] }) : ({ ok: false, code: "NOT_FOUND", err: "no fixture" } as Res);
    chk("C1.5-X1.7", "a lost reason of another system · updateStage / archivePipeline / updateLostReason on another system's or shop's rows · a line productId of another shop ⇒ refused each, nothing changed",
      isScopeRefusal(r) && isNotFound(u1) && isNotFound(u2) && isNotFound(u3) && isScopeRefusal(l) && (await dealRow(dx))?.kind === "OPEN" &&
        (await P.crmLostReason.findFirst({ where: { id: lrA2 } }))?.active === true && (await P.crmStage.findFirst({ where: { id: pA2.st[0] } }))?.staleDays == null,
      "refused ×5", `${r.err || "ok"} | ${u1.err || "ok"} | ${u2.err || "ok"} | ${u3.err || "ok"} | ${l.err || "ok"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — races: parallel moves (history) · parallel wins (one won event) · setLines never mixes · caches ∥ merge/recompute (processes)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · races ──");
  const [X0, X1s, X2s, XW] = pX.st;
  const runWorkers = async (jobs: [string, Any][]): Promise<{ outs: string[][]; spawned: boolean }> => {
    const startAt = Date.now() + 45_000;
    const outs = await Promise.all(
      jobs.map(([mode, arg]) =>
        new Promise<string>((resolve) => {
          const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
          const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", mode, tidA, crmA, userA, String(startAt), enc], { env: process.env });
          let out = "";
          const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* already gone */ } }, 300_000);
          ch.stdout.on("data", (d: Any) => { out += String(d); });
          ch.stderr.on("data", (d: Any) => { out += String(d); });
          ch.on("error", (e: Any) => { clearTimeout(to); resolve(`SPAWN-ERROR ${String(e)}`); });
          ch.on("close", () => { clearTimeout(to); resolve(out); });
        }),
      ),
    );
    const parsed = outs.map((o) => { const m = /X3WORKER (\[.*\])/.exec(o); return m ? (JSON.parse(m[1]) as string[]) : ["NO-OUTPUT"]; });
    return { outs: parsed, spawned: parsed.every((p) => !p.includes("NO-OUTPUT")) };
  };
  const DEAD = /40P01|deadlock|P2034|write conflict/i;
  const chainOk = (h: Any[]) => h.filter((x) => !x.leftAt).length === 1 && h.every((x, i) => i === 0 || x.fromStageId === h[i - 1].toStageId) &&
    h.filter((x) => x.leftAt).every((x) => Number.isInteger(x.durationSec) && x.durationSec >= 0);
  const coX = await fxCompany(cA, `บริษัทแข่ง ${rand}`);
  const kX = await rawContact(tidA, crmA, `ผู้ติดต่อแข่ง ${rand}`);
  await link(cA, coX, kX);
  const bx = { pipelineId: pX.id, contactId: kX, companyId: coX };
  {
    const dr = await fxDeal({ ...bx, title: `แข่งย้าย ${rand}`, valueSatang: 10_000 });
    const rounds: string[] = [];
    let ok = true;
    for (let round = 0; round < 3; round += 1) {
      const res = await Promise.all(Array.from({ length: 10 }, (_x, i) => move(dr, [X0, X1s, X2s][(round + i) % 3])));
      const h = await hist(dr);
      const row = await dealRow(dr);
      const open = h.filter((x) => !x.leftAt);
      const sane = res.every((r) => r.ok || (r.code === "CONFLICT" && thai(r.msg)));
      const good = sane && open.length === 1 && row?.stageId === open[0]?.toStageId && row?.kind === "OPEN" && chainOk(h);
      ok &&= good;
      rounds.push(`r${round + 1}: ok=${res.filter((r) => r.ok).length} open=${open.length} chain=${chainOk(h)} ${res.find((r) => !r.ok && r.code !== "CONFLICT")?.err ?? ""}`);
    }
    chk("C1.5-X3.1", "10 parallel moveDeal on ONE deal (3 rounds) ⇒ every call ok or a calm Thai CONFLICT · exactly ONE open history row · deal.stageId = that row · a gap-free from→to chain with whole-second durations",
      ok, "1 open row · chain", cut(rounds.join(" · "), 400));
  }
  {
    const dw = await fxDeal({ ...bx, title: `แข่งชนะ ${rand}`, valueSatang: 20_000 });
    const res = await Promise.all(Array.from({ length: 10 }, () => move(dw, XW)));
    const won = await evOf("crm.deal.won", dw);
    const into = (await hist(dw)).filter((x) => x.toStageId === XW);
    const cache = await cacheState(coX);
    chk("C1.5-X3.2", "10 parallel moves into WON on one deal ⇒ exactly ONE crm.deal.won · ONE history row into WON · company caches exact",
      res.every((r) => r.ok || r.code === "CONFLICT") && won.length === 1 && into.length === 1 && cache.ok, "1 won", `ok=${res.filter((r) => r.ok).length} won=${won.length} rows=${into.length} ${cache.info}`);
  }
  {
    const dw2 = await fxDeal({ ...bx, title: `แข่งชนะหลายโปรเซส ${rand}`, valueSatang: 30_000 });
    const w = await runWorkers([0, 1, 2, 3].map(() => ["win", { dealId: dw2, stageId: XW }] as [string, Any]));
    const flat = w.outs.flat();
    const won = await evOf("crm.deal.won", dw2);
    chk("C1.5-X3.3a", "[positive control] 4 worker PROCESSES ran the win race (12 calls) — if red, X3.3 proves nothing", w.spawned && flat.length === 12, "12", `${flat.length} ${cut(flat.filter((o) => o !== "OK").slice(0, 2).join(" | "), 200)}`, "MAJOR");
    chk("C1.5-X3.3", "the same win from 4 SEPARATE PROCESSES ⇒ exactly ONE crm.deal.won, one history row into WON, no deadlock (an in-process mutex would pass X3.2 and fail here)",
      flat.length === 12 && !flat.some((o) => DEAD.test(o)) && won.length === 1 && (await hist(dw2)).filter((x) => x.toStageId === XW).length === 1 && (await cacheState(coX)).ok,
      "1 won", `won=${won.length} dead=${flat.filter((o) => DEAD.test(o)).length}`);
  }
  {
    const dl = await fxDeal({ ...bx, title: `แข่งรายการ ${rand}`, valueSatang: 0 });
    const setB2 = SET_B.map((l) => ({ ...l }));
    const valueA = VAL_A;
    const rounds: string[] = [];
    let ok = true;
    for (let round = 0; round < 3; round += 1) {
      const res = await Promise.all(Array.from({ length: 10 }, (_x, i) => call(fns.setLines, cA, owner, dl, i % 2 === 0 ? { lines: SET_A, discountBp: 200 } : { lines: setB2, discountBp: 0 })));
      const rows = await lineRows(dl);
      const row = await dealRow(dl);
      const names = rows.map((x) => x.name).join("|");
      const isA = names === SET_A.map((x) => x.name).join("|") && row?.valueSatang === valueA && row?.discountBp === 200;
      const isB = names === SET_B.map((x) => x.name).join("|") && row?.valueSatang === VAL_B && row?.discountBp === 0;
      const good = res.every((r) => r.ok || r.code === "CONFLICT") && (isA || isB);
      ok &&= good;
      rounds.push(`r${round + 1}: ok=${res.filter((r) => r.ok).length} rows=${rows.length} value=${row?.valueSatang} ${isA ? "A" : isB ? "B" : "MIX"}`);
    }
    chk("C1.5-X3.4", "10 parallel setLines alternating two line sets (3 rounds) ⇒ the rows are exactly ONE of the sets and valueSatang/discountBp belong to that same set — never a mix",
      ok, "A or B", cut(rounds.join(" · "), 400));
  }
  {
    const ids = await Promise.all(Array.from({ length: 10 }, (_x, i) => call(fns.create, cA, owner, { ...bx, title: `แข่งสร้าง ${i} ${rand}`, valueSatang: 1_000 * (i + 1) })));
    const created = ids.map((r) => did(r.v)).filter((x) => x !== NONE);
    const mix = await Promise.all([
      ...created.slice(0, 5).map((d) => move(d, XW)),
      ...created.slice(5).map((d, i) => move(d, [X1s, X2s][i % 2])),
      ...Array.from({ length: 5 }, () => call(CO.recomputeCaches, cA, coX)),
    ]);
    const cache = await cacheState(coX);
    chk("C1.5-X3.5", "company caches under ≥ 10 parallel writers: 10 parallel createDeal on one company, then 10 parallel moves (5 wins) interleaved with 5 recomputeCaches ⇒ openDealCount / wonValueSatang exact, no deadlock",
      created.length === 10 && !mix.some((r) => DEAD.test(r.err)) && cache.ok, "exact", `created=${created.length} errors=${cut(mix.filter((r) => !r.ok).map((r) => r.err).slice(0, 2).join(" | "), 160)} ${cache.info}`);
  }
  {
    // lock order (C1.3 debt): mergeCompanies / recomputeCaches in parallel with deal moves on those companies — separate processes
    const K = await fxCompany(cA, `บริษัทล็อก K ${rand}`);
    const M = await fxCompany(cA, `บริษัทล็อก M ${rand}`);
    const kK = await rawContact(tidA, crmA, `ผู้ติดต่อ K ${rand}`);
    const kM = await rawContact(tidA, crmA, `ผู้ติดต่อ M ${rand}`);
    await link(cA, K, kK);
    await link(cA, M, kM);
    const dk = await Promise.all([1, 2, 3].map((i) => fxDeal({ pipelineId: pX.id, contactId: kK, companyId: K, title: `ล็อก K${i} ${rand}`, valueSatang: 10_000 * i })));
    const dm = await Promise.all([1, 2].map((i) => fxDeal({ pipelineId: pX.id, contactId: kM, companyId: M, title: `ล็อก M${i} ${rand}`, valueSatang: 50_000 * i })));
    const w = await runWorkers([
      ["move", { deals: [dk[0], dk[1]], stages: [X1s, X2s, X0], rounds: 3, finalWon: { dealId: dk[0], stageId: XW } }],
      ["move", { deals: [dm[0], dm[1]], stages: [X2s, X1s, X0], rounds: 3, finalWon: { dealId: dm[1], stageId: XW } }],
      ["merge", { keepId: K, mergeId: M, delayMs: 150 }],
      ["recompute", { ids: [K, M] }],
    ]);
    const flat = w.outs.flat();
    const dead = flat.filter((o) => DEAD.test(o));
    const moves = [...w.outs[0], ...w.outs[1]];
    const mergeOk = w.outs[2]?.[0] === "OK";
    const all = (await P.crmDeal.findMany({ where: { id: { in: [...dk, ...dm] } } })) as Any[];
    const ck = await cacheState(K);
    const cm = await P.crmCompany.findFirst({ where: { id: M } });
    chk("C1.5-X3.6a", "[positive control] the 4 lock-order worker processes ran (7 + 7 moves · merge + 2 recomputes · 6 recomputes = 23 calls)", w.spawned && flat.length === 23, "23", `${flat.length}`, "MAJOR");
    chk("C1.5-X3.6", "companies.mergeCompanies(K ← M) and recomputeCaches ∥ deal moves/wins on both companies across 4 PROCESSES ⇒ no deadlock (40P01/P2034) · merge OK · moves OK or CONFLICT · every deal now on K · K's openDealCount/wonValueSatang exact · M holds 0 open",
      flat.length === 23 && dead.length === 0 && mergeOk && moves.every((o) => o === "OK" || o.startsWith("ERR:CONFLICT")) && all.every((d) => d.companyId === K) && ck.ok && cm?.openDealCount === 0,
      "0 deadlocks · exact", `dead=${dead.length} merge=${w.outs[2]?.[0]} movesBad=${cut(moves.filter((o) => o !== "OK").slice(0, 2).join(" | "), 160)} onK=${all.filter((d) => d.companyId === K).length}/5 ${ck.info} M.open=${cm?.openDealCount}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — the 7 deal consumers + the crm.discount approval effect: twice · 5× in parallel ⇒ no extra effect
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4 · redelivery ──");
  const tenantTables = ((await P.$queryRawUnsafe(
    `select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`,
  ).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
  const IGNORE = new Set(["OutboxEvent", "OpsEvent", "AuditLog"]);
  const footprint = async () => {
    const parts: string[] = [];
    for (const t of tenantTables) {
      if (IGNORE.has(t)) continue;
      const rows = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tidA).catch(() => [{ n: 0 }])) as Any[];
      parts.push(`${t}=${rows?.[0]?.n ?? 0}`);
    }
    return parts.join(";");
  };
  const redeliver = async (ev: Any) => {
    const first = ev ? await consume(ev) : ({ ok: false, err: "no event" } as Res);
    const fp1 = await footprint();
    const again = ev ? [await consume(ev), ...(await Promise.all(Array.from({ length: 5 }, () => consume(ev))))] : [];
    const fp2 = await footprint();
    const diff = fp1.split(";").filter((x, n) => x !== fp2.split(";")[n]);
    return { ok: !!ev && first.ok && again.every((r) => r.ok) && diff.length === 0, info: `${first.err}${again.find((r) => !r.ok)?.err ?? ""} diff=${cut(diff.join(" "), 160)}` };
  };
  {
    const ours = (await P.outboxEvent.findMany({ where: { tenantId: tidA, type: { in: EVTS } }, orderBy: { createdAt: "asc" } })) as Any[];
    const pick = EVTS.map((t) => ours.find((o) => o.type === t) ?? null);
    chk("C1.5-X4.0", "[positive control] this run produced an event of each of the 7 deal types", pick.every(Boolean), "7 types", EVTS.filter((_t, i) => !pick[i]).join(",") || "-", "MAJOR");
    for (let i = 0; i < EVTS.length; i += 1) {
      const x = await redeliver(pick[i]);
      chk(`C1.5-X4.${i + 1}`, `${EVTS[i]} consumer: delivered once, then again, then 5× in parallel ⇒ every delivery resolves and no tenant table changes after the first (idempotent)`,
        x.ok, "0 extra rows", x.info, EVTS[i] === "crm.deal.won" ? "CRITICAL" : "MAJOR");
    }
  }
  {
    const ev = (await P.outboxEvent.findFirst({ where: { tenantId: tidA, idempotencyKey: `approval.request.approved#${req1 || NONE}` } })) as Any;
    const before = j(await lineRows(dLn));
    const v0 = (await dealRow(dLn))?.valueSatang;
    const x = await redeliver(ev);
    chk("C1.5-X4.8", "re-processing the approval.request.approved event of the crm.discount request (twice + 5× parallel) applies the discount ONCE: deal lines (ids included) and valueSatang unchanged, no table grows",
      !!ev && x.ok && j(await lineRows(dLn)) === before && (await dealRow(dLn))?.valueSatang === v0, "applied once", `${ev ? "" : "no event "}${x.info}`);
  }
  {
    const types = ((await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS } }, select: { type: true }, distinct: ["type"] })) as Any[]).map((x) => x.type as string);
    const orphan = types.filter((t) => typeof CONS?.[t] !== "function");
    chk("C1.5-X4.9", "every event type emitted by this run has a consumer (no queue-stalling orphan)", types.includes("crm.deal.created") && orphan.length === 0, "0 orphans", `types=${types.length} orphans=${orphan.join(",") || "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — dangerous input: value cap (C28) · line bounds · text caps · CSV
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X6 · dangerous input ──");
  {
    const T = `ดีลเกินเพดาน ${rand}`;
    const over = await call(fns.create, cA, owner, { pipelineId: pA.id, title: T, contactId: kPlain, valueSatang: 2_000_000_001 });
    const neg = await call(fns.create, cA, owner, { pipelineId: pA.id, title: T, contactId: kPlain, valueSatang: -1 });
    const n = await P.crmDeal.count({ where: { title: T } });
    const atCap = await call(fns.create, cA, owner, { pipelineId: pA.id, title: `ดีลเต็มเพดาน ${rand}`, contactId: kPlain, valueSatang: 2_000_000_000 });
    const dc = did(atCap.v);
    const up = await call(fns.update, cA, owner, dc, { valueSatang: 2_000_000_001 });
    chk("C1.5-X6.1", "C28: valueSatang 2,000,000,001 ⇒ VALIDATION with a Thai message (no row) · negative ⇒ VALIDATION · exactly ฿20,000,000 accepted · updateDeal above the cap ⇒ VALIDATION, value unchanged",
      isValidation(over) && thai(over.msg) && isValidation(neg) && n === 0 && atCap.ok && isValidation(up) && (await dealRow(dc))?.valueSatang === 2_000_000_000,
      "refused · cap ok", `${over.err || "accepted"} | ${neg.err || "accepted"} rows=${n} cap=${atCap.err || "ok"} up=${up.err || "accepted"}`);
  }
  {
    const dx = await fxDeal({ pipelineId: pA.id, title: `ดีลรายการเสีย ${rand}`, contactId: kPlain });
    await call(fns.setLines, cA, owner, dx, { lines: SET_B, discountBp: 0 });
    const snap = j([await lineRows(dx), (await dealRow(dx))?.valueSatang]);
    const LM = Number.isFinite(capOf("DEAL_LINES_MAX")) ? capOf("DEAL_LINES_MAX") : 200;
    const QM = Number.isFinite(capOf("DEAL_LINE_QTY_MAX")) ? capOf("DEAL_LINE_QTY_MAX") : 999_999_999;
    const L = (o: Record<string, Any>) => ({ lines: [{ name: "รายการ", qty: 1, unitPriceSatang: 1_000, discountBp: 0, ...o }] });
    const bad: [string, Any][] = [
      ["Σ over ฿20M", { lines: [{ name: "แพง", qty: 3, unitPriceSatang: 1_000_000_000 }] }],
      ["qty 0", L({ qty: 0 })], ["qty −1", L({ qty: -1 })], ["qty Infinity", L({ qty: Number.POSITIVE_INFINITY })], ["qty > max", L({ qty: QM + 1 })],
      ["unit −1", L({ unitPriceSatang: -1 })], ["unit 1.5", L({ unitPriceSatang: 1.5 })], ["bp −1", L({ discountBp: -1 })], ["bp 10001", L({ discountBp: 10_001 })],
      ["empty name", L({ name: "  " })], ["deal bp 10001", { ...L({}), discountBp: 10_001 }],
      ["lines > max", { lines: Array.from({ length: LM + 1 }, (_x, i) => ({ name: `บรรทัด ${i}`, qty: 1, unitPriceSatang: 1 })) }],
    ];
    const out: string[] = [];
    let ok = true;
    for (const [label, input] of bad) {
      const r = await call(fns.setLines, cA, owner, dx, input);
      const good = isValidation(r);
      ok &&= good;
      out.push(`${label}:${good ? "refused" : r.err || "ACCEPTED"}`);
    }
    chk("C1.5-X6.2", "line bounds: Σ over the ฿20M cap · qty ≤ 0 / Infinity / > DEAL_LINE_QTY_MAX · unit < 0 or fractional · bp outside 0–10000 (line and deal) · empty name · > DEAL_LINES_MAX lines ⇒ VALIDATION each, lines and value unchanged",
      ok && j([await lineRows(dx), (await dealRow(dx))?.valueSatang]) === snap, "refused ×12", cut(out.filter((x) => !x.endsWith("refused")).join(" · ") || "all refused", 400));
  }
  {
    const TM = Number.isFinite(capOf("DEAL_TITLE_MAX")) ? capOf("DEAL_TITLE_MAX") : 200;
    const NM = Number.isFinite(capOf("DEAL_NOTE_MAX")) ? capOf("DEAL_NOTE_MAX") : 5000;
    const GM = Number.isFinite(capOf("DEAL_TAGS_MAX")) ? capOf("DEAL_TAGS_MAX") : 50;
    const long = await call(fns.create, cA, owner, { pipelineId: pA.id, title: "ด".repeat(TM + 1), contactId: kPlain });
    const empty = await call(fns.create, cA, owner, { pipelineId: pA.id, title: "   ", contactId: kPlain });
    const dx = await fxDeal({ pipelineId: pA.id, title: `ดีลข้อความยาว ${rand}`, contactId: kPlain });
    await call(fns.setNext, cA, owner, dx, "น".repeat(NM + 1000));
    const pr = await call(fns.update, cA, owner, dx, { probabilityOverride: 101 });
    const tg = await call(fns.update, cA, owner, dx, { tags: Array.from({ length: GM + 5 }, (_x, i) => `t${i}`) });
    const row = await dealRow(dx);
    chk("C1.5-X6.3", "text caps: title > DEAL_TITLE_MAX or blank ⇒ VALIDATION · a nextStep beyond DEAL_NOTE_MAX is never stored · probabilityOverride 101 ⇒ VALIDATION · tags never exceed DEAL_TAGS_MAX",
      isValidation(long) && isValidation(empty) && String(row?.nextStep ?? "").length <= NM && isValidation(pr) && (row?.tags ?? []).length <= GM && (tg.ok || isValidation(tg)),
      "capped", `long=${long.err || "accepted"} empty=${empty.err || "accepted"} next=${String(row?.nextStep ?? "").length} prob=${pr.err || "accepted"} tags=${(row?.tags ?? []).length}`, "MAJOR");
  }
  {
    const csvLib = (await import("@/lib/core/csv")) as Any;
    await fxDeal({ pipelineId: pA.id, title: `=HYPERLINK("http://evil.test","x") ${rand}`, contactId: kPlain });
    await fxDeal({ pipelineId: pA.id, title: `@cmd ${rand}`, contactId: kPlain });
    const ex2 = await call(fns.exp, cA, owner, { pipelineId: pA.id });
    const text = typeof ex2.v === "string" ? ex2.v : String(ex2.v?.csv ?? ex2.v?.text ?? "");
    const table = csvLib.parseCsv(text) as { headers: string[]; rows: string[][] };
    const cells = [...(table.headers ?? []), ...(table.rows ?? []).flat()];
    const dangerous = cells.filter((c) => /^[\t\r\n ]*[=+\-@]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c));
    chk("C1.5-X6.4", "exportDeals CSV: no cell starts with = + - @ (neutralised by csvRow) — the =HYPERLINK / @cmd titles come out as '…",
      ex2.ok && text.length > 0 && dangerous.length === 0 && cells.includes(`'@cmd ${rand}`), "0 dangerous", `${ex2.err} dangerous=${cut(dangerous.join(" | "), 160)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA: ids-only payloads · console/OpsEvent clean
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA ──");
  const kPii = await rawContact(tidA, crmA, SENT_NAME, { phone: SENT_PHONE, email: SENT_EMAIL, firstName: SENT_NAME });
  const dPii = did((await watch("createDeal X8", () => call(fns.create, cA, owner, { pipelineId: pA.id, title: `ดีล PII ${rand}`, contactId: kPii, valueSatang: 90_000 }))).v);
  await watch("moveDeal X8", () => move(dPii, S1));
  await watch("setLines X8", () => call(fns.setLines, cA, owner, dPii, { lines: SET_B }));
  await watch("quote X8", () => call(fns.quote, cA, owner, dPii, {}));
  await watch("lost X8", () => move(dPii, SL, { lostReasonId: lrA, lostNote: `โทรหา ${SENT_PHONE} ไม่ติด` }));
  {
    const X8T = EVTS.filter((t) => t !== "crm.deal.won"); // crm.deal.won payload cleanup is C1.8's (MASTER-PLAN §6 row C1.8)
    const ours = (await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, type: { in: X8T } } })) as Any[];
    const sentinels = [SENT_PHONE, SENT_EMAIL, SENT_NAME, SENT_PHONE.slice(1)];
    const offenders = ours.filter((o) => sentinels.some((s) => j(o.payload).includes(s))).map((o) => o.type);
    chk("C1.5-X8.0", "[positive control] crm.deal.created and crm.deal.lost exist for the PII contact's deal",
      ours.some((o) => o.type === "crm.deal.created" && o.payload?.dealId === dPii) && ours.some((o) => o.type === "crm.deal.lost" && o.payload?.dealId === dPii), "2", `events=${ours.length}`, "MAJOR");
    chk("C1.5-X8.1", "no crm.deal.* payload (created/stage.changed/lost/reopened/reassigned/updated) carries the contact's phone (any form), e-mail or name — nor the lost note that quotes a phone",
      ours.length > 0 && offenders.length === 0, "none", `events=${ours.length} offenders=${offenders.slice(0, 4).join(",")}`);
    const strings = (v: Any): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
    const prose = ours.flatMap((o) => strings(o.payload).filter((s) => /\s|[ก-๙@]/.test(s) || s.length > 64).map((s) => `${o.type}:${cut(s, 30)}`));
    chk("C1.5-X8.2", "payloads are ids/keys only: no string with spaces, Thai text or '@' (deal titles, notes and names never travel)", ours.length > 0 && prose.length === 0, "ids only", cut(prose.slice(0, 4).join(" | "), 200), "MAJOR");
  }
  {
    const offenders: string[] = [];
    for (const ev of EVIDENCE) {
      for (const o of ev.ops) if ([SENT_PHONE, SENT_EMAIL, SENT_NAME].some((s) => j({ m: o.message, d: o.detail }).includes(s))) offenders.push(`${ev.label} → OpsEvent`);
      if (ev.logs.some((l) => [SENT_PHONE, SENT_EMAIL, SENT_NAME].some((s) => l.includes(s)))) offenders.push(`${ev.label} → console`);
    }
    chk("C1.5-X8.3", "no OpsEvent and no console line produced by create/move/won/lines/quote/lost contains the contact's phone, e-mail or name",
      !!fns.create && EVIDENCE.length >= 5 && offenders.length === 0, "none", offenders.join(" · ") || (fns.create ? "-" : "service missing"));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — danger ops: delete · bulk move · bulk reassign · reopen ⇒ confirm + reason ≥ 5 · bulk ≤ 200 · audit
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X9 · danger ops ──");
  const delReason = "ลูกค้ายกเลิกโครงการทั้งหมด";
  {
    const dx = await fxDeal({ pipelineId: pA.id, title: `ดีลจะลบ ${rand}`, contactId: kMain, companyId: coMain, valueSatang: 12_000 });
    const a1 = await call(fns.del, cA, owner, dx, {});
    const a2 = await call(fns.del, cA, owner, dx, { confirm: true, reason: "ลบ" });
    const a3 = await call(fns.del, cA, owner, dx, { reason: delReason });
    const live = !!(await call(fns.get360, cA, owner, dx)).ok;
    const ok = await call(fns.del, cA, owner, dx, { confirm: true, reason: delReason });
    const g = await call(fns.get360, cA, owner, dx);
    const l = await call(fns.list, cA, owner, { q: `ดีลจะลบ ${rand}` });
    const cache = await cacheState(coMain);
    const aud = (await P.auditLog.findMany({ where: { tenantId: tidA, targetId: dx } })) as Any[];
    chk("C1.5-X9.1", "deleteDeal without confirm / reason < 5 / reason without confirm ⇒ refused ×3 (still readable) · with both ⇒ gone from 360 (NOT_FOUND) and the list · company cache exact · an audit row keeps the reason",
      isRefused(a1) && isRefused(a2) && isRefused(a3) && live && ok.ok && isNotFound(g) && itemsOf(l.v).length === 0 && cache.ok && aud.some((x) => j({ b: x.before, a: x.after }).includes(delReason)),
      "refused ×3 · deleted", `${a1.err || "ok"} | ${a2.err || "ok"} | ${a3.err || "ok"} | ${ok.err} 360=${g.err || "returned"} ${cache.info} audit=${aud.length}`);
  }
  const bulkReason = "ย้ายดีลทั้งชุดหลังประชุมทีม";
  {
    const ids = await Promise.all([0, 1, 2].map((i) => fxDeal({ pipelineId: pA.id, title: `ย้ายกลุ่ม ${i} ${rand}`, contactId: kMain, companyId: coMain })));
    const BM = Number.isFinite(capOf("DEAL_BULK_MAX")) ? capOf("DEAL_BULK_MAX") : 200;
    const b1 = await call(fns.bulkMove, cA, owner, { ids, stageId: S1 });
    const b2 = await call(fns.bulkMove, cA, owner, { ids, stageId: S1, confirm: true, reason: "ย้าย" });
    const over = await call(fns.bulkMove, cA, owner, { ids: [...ids, ...Array.from({ length: BM - 2 }, (_x, i) => `${TAG}-fake-${i}`)], stageId: S1, confirm: true, reason: bulkReason });
    const untouched = (await Promise.all(ids.map(dealRow))).every((r) => r?.stageId === S0);
    const ok = await call(fns.bulkMove, cA, owner, { ids, stageId: S1, confirm: true, reason: bulkReason });
    const rows = await Promise.all(ids.map(dealRow));
    const ev = (await Promise.all(ids.map((id) => evOf("crm.deal.stage.changed", id)))).map((x) => x.length);
    const hs = await Promise.all(ids.map(hist));
    chk("C1.5-X9.2", `bulkMove: no confirm / reason < 5 ⇒ refused · ${BM + 1} ids (cap + 1) ⇒ refused before any write · 3 ids with confirm + reason ⇒ moved with a history row and a crm.deal.stage.changed each`,
      isRefused(b1) && isRefused(b2) && isValidation(over) && untouched && ok.ok && rows.every((r) => r?.stageId === S1) && ev.every((n) => n === 1) && hs.every((h) => h.length === 2),
      "refused ×3 · 3 moved", `${b1.err || "ok"} | ${b2.err || "ok"} | over=${over.err || "accepted"} untouched=${untouched} ok=${ok.err || "ok"} events=${ev.join(",")}`);
    const r1 = await call(fns.bulkReassign, cA, owner, { ids, ownerUserId: userSales });
    const r2 = await call(fns.bulkReassign, cA, owner, { ids: [...ids, ...Array.from({ length: BM - 2 }, (_x, i) => `${TAG}-fake-${i}`)], ownerUserId: userSales, confirm: true, reason: bulkReason });
    const r3 = await call(fns.bulkReassign, cA, owner, { ids, ownerUserId: userSales, confirm: true, reason: bulkReason });
    const owners = (await Promise.all(ids.map(dealRow))).map((r) => r?.ownerUserId === userSales);
    const ra = (await Promise.all(ids.map((id) => evOf("crm.deal.reassigned", id)))).map((x) => x.length);
    chk("C1.5-X9.3", "bulkReassign: no confirm ⇒ refused · cap + 1 ids ⇒ refused · with confirm + reason ⇒ all 3 reassigned + one crm.deal.reassigned each",
      isRefused(r1) && isValidation(r2) && r3.ok && owners.every(Boolean) && ra.every((n) => n === 1), "refused ×2 · 3 reassigned", `${r1.err || "ok"} | ${r2.err || "ok"} | ${r3.err || "ok"} owners=${owners.join(",")} events=${ra.join(",")}`);
  }
  {
    const dx = await fxDeal({ pipelineId: pA.id, title: `ดีลเปิดใหม่ ${rand}`, contactId: kMain, companyId: coMain, valueSatang: 5_000 });
    await move(dx, SW);
    const a = await call(fns.reopen, cA, owner, dx, {});
    const b = await call(fns.reopen, cA, owner, dx, { confirm: true, reason: "ขอ" });
    const c = await call(fns.reopen, cSales, sales, dx, { confirm: true, reason: "ลูกค้าเปลี่ยนใจกลับมา" });
    const m = await call(fns.reopen, cMgr, mgr, dx, { confirm: true, reason: "ลูกค้าเปลี่ยนใจกลับมา" });
    const row = await dealRow(dx);
    chk("C1.5-X9.4", "reopenDeal without confirm / reason < 5 ⇒ refused · a STAFF with confirm ⇒ FORBIDDEN · a MANAGER with confirm + reason ⇒ OPEN, reopenedCount 1",
      isRefused(a) && isRefused(b) && isForbidden(c) && m.ok && row?.kind === "OPEN" && row?.reopenedCount === 1, "refused ×3 · reopened", `${a.err || "ok"} | ${b.err || "ok"} | ${c.err || "ok"} | ${m.err || "ok"} kind=${row?.kind}`);
  }
  {
    const aud1 = (await P.auditLog.findMany({ where: { tenantId: tidA, targetId: d1 } })) as Any[];
    const audQ = (await P.auditLog.findMany({ where: { tenantId: tidA, targetId: dQ } })) as Any[];
    const all = (await P.auditLog.findMany({ where: { tenantId: tidA } })) as Any[];
    const kept = (reason: string) => all.some((x) => j({ b: x.before, a: x.after }).includes(reason));
    chk("C1.5-X9.5", "AuditLog with the actor: d1 create + moves + won + reopen (≥ 5 rows, actorId set) · dQ lines + quotation (≥ 3) · the reopen and bulk reasons are kept",
      aud1.length >= 5 && aud1.every((x) => x.actorId === userA) && audQ.length >= 3 && kept("ลูกค้ากลับมาขอแก้สัญญา") && kept(bulkReason),
      "audit rows", `d1=${aud1.length} dQ=${audQ.length} reopen=${kept("ลูกค้ากลับมาขอแก้สัญญา")} bulk=${kept(bulkReason)}`, "MAJOR");
  }
} catch (e) {
  chk("C1.5-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — trigger first, then every row of the two throwaway tenants (4 passes), systems/units/tenants, users.
  // No drainOutbox (not tenant-scoped) — our PENDING events go with the tenant sweep.
  // ═════════════════════════════════════════════════════════════════════════════
  await dropTriggers();
  const ids = [tidA, tidB].filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(
      `select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`,
    ).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1)
      for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const rows = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(rows?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      const trig = ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = '${TRIG}'`).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0;
      chk("C1.5-CLEAN", "the oracle gives the QC database back exactly as found — the two throwaway tenants, every row they owned, the throwaway users and the test trigger are gone",
        left.length === 0 && tenants === 0 && users === 0 && Number(trig) === 0, "0 rows · 0 tenants · 0 users · 0 triggers", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} trig=${trig}`, "MAJOR");
    } catch (e) {
      chk("C1.5-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C1.5: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
