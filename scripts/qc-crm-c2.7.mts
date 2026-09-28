// QC — CRM v2 WO C2.7: Account & POS bridges — THE MONEY PATH (decisions C3 · C29 · R-C.4 · blueprint §7.2 · §9 rows ACCOUNT/POS)
//      `deals.issueQuotation` with real lines through `account.createExternalQuotation` · `issueInvoice` via
//      `convertQuotationToInvoice` · `pipeline.autoInvoiceOnWon` · "ต่างจากใบเสนอราคา" badge ·
//      consumers: `account.quotation.responded` → stage + activity + notify owner · `account.document.issued` → `invoiceDocId` ·
//      **`account.payment.recorded` → CrmDealPayment(PAYMENT) FIRST, then atomic `paidSatang` / `wonValueSatang` / lifecycle
//      CUSTOMER / company cache** · `account.payment.voided` + `account.document.voided` → reverse ONLY what was counted + the
//      "document voided" flag · POS: `linkSaleToDeal` + the deal select next to the member select + `pos.sale.paid` counts a LINKED
//      row + `pos.sale.voided` reverses + optional auto-WON · account document page → "ดีล" link (`dealForDoc`).
// Oracle writer · the C2.7 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
// Run:  bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.7.mts
//       `--force-run` = run every check while the C2.7 artefacts are absent — C2.7 checks go red for the right reason ("missing"),
//       the positive controls and CLEAN go green: proves the fixtures, the worker processes and the cleanup.
//       Without the flag and without src/lib/modules/crm/payments.ts (or without the C2.0 tables) ⇒ SKIPPED (no DB connection).
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c27-<rand>-*`)
//
// 🔴 THIS IS THE MONEY PATH. The lesson of the member fix-run is the whole exam: **flag first, then increment; reverse only what was
//    counted; the CRM consumer is an EXTRA that must never block accounting, POS, stamps, points or the member bridge.** Every
//    counter is therefore checked twice: once for "counted exactly once under duplicate + parallel delivery" and once for
//    "nothing was subtracted that was never added" — each with a positive control next to it.
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (D4 · CRM-RUN §0 rule 2 — not re-implemented here): every `qc-acc-v2-*` · every
//   `qc-account-api-*` · `qc-pos-account` · `qc-pos-register` · `qc-pos-products` · `qc-pos-inventory` · `qc-pos-closeday` ·
//   `qc-pos-coupon` · `qc-acc-v2-pos-lines` · `qc-restaurant*` · `qc-member-m2.8` · `qc-member-fix-s2` · `qc-kanban-k3.3` ·
//   `qc-crm-c1.5` · `qc-crm-c1.8` · `qc-crm-v1`.  Group S7 below proves the INVARIANTS those suites protect (byte-identical POS /
//   account transaction code, no new PosSale column, the consumer chain of `pos.sale.paid` unchanged with CRM appended LAST, the
//   member/stamp steps still running when the CRM extra throws) so that a regression is caught before the suites are even started.
//
// SOURCES: crm-brief-C2.7.md · crm-brief-COMMON.md ("Oracle house style" · "Account events carry NO partyId and NO sourceDocId") ·
//   crm-brief-RESOLUTIONS.md (**R-C.1 exactly three migrations ⇒ C2.7 has NO migration and NO `PosSale.dealId`** · R-C.4
//   `CrmDealPayment.refType ∈ "PAYMENT" | "POS_SALE"` · R-C.8 `#` idempotency keys · R-D `crm-bridges/money.ts` is C2.7's file ·
//   R-E.7 `wonValueSatang` / `paidSatang` definitions · R-E.8 sums in SQL as bigint · R-E.14 uiVersion 1) · CRM-RUN §2 "C2.7"
//   (S1 4 · S2 3 · S3 4 · S4 2 · S5 4 · S6 2 · S7 6 · S8 3 = 28) + §4 PERMANENT RULE (uiVersion-1 case) + §4 18 Sep
//   ("ผู้อนุมัติไม่เห็นบรรทัด → C2.7") · MASTER-PLAN §3 · §4 X1 X3 X4 X6 X8 X9 · blueprint §7.2 · §11.3 · mockup 03 · 06.
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   A. SERVICE `src/lib/modules/crm/payments.ts` (+ `export * as payments from "./payments"` in crm/index.ts inside
//      `// CRM C2.7 ▸ … ◂`).  Money is **integer satang** everywhere; every stored money column of this work order is BigInt and
//      every sum is computed by the database (R-E.8) — no float, no JS accumulation over an unbounded set.
//      INTERNAL (called by the bridge · no human actor · the caller decided the gate):
//        recordDocPayment(ctx: { tenantId; systemId }, input: { documentId; paymentId; amountSatang: number; docType?: string },
//          opts?: { now?: Date }) → { counted: boolean; dealId: string | null; skipped?: "V1" | "NO_DEAL" | "DUPLICATE" | "NOT_FOUND" }
//          ORDER (AUDIT-CLASS X4 · lesson H5/M10): advisory lock per deal → INSERT `CrmDealPayment(dealId, "PAYMENT", paymentId,
//          satang, status "COUNTED", countedAt)` **first** (unique `(dealId, refType, refId)` is the flag) → only when the insert
//          really happened: `paidSatang { increment }`, `wonValueSatang` recomputed per R-E.7, contact `lifecycleStage` → CUSTOMER
//          (never downgraded), company `wonValueSatang` cache, `crm.deal.updated` in the SAME transaction · the deal is found from
//          the document through `account.docLinkInfo` — the invoice of the deal (`CrmDeal.invoiceDocId`), its quotation
//          (`quotationDocId`) or any document whose `sourceDocId` chain reaches one of them (receipt / tax invoice)
//        reverseDocPayment(ctx, input: { documentId?; paymentId; amountSatang?; reason? }) → { reversed: boolean; dealId: string | null }
//          only a row with status "COUNTED" becomes "REVERSED" (`reversedAt`) and only then is `paidSatang` decremented by the
//          amount that was counted (never by the amount in the event) · a "LINKED" (never counted) row is marked REVERSED and
//          NOTHING is subtracted · a second void changes nothing
//        flagDocumentVoided(ctx, input: { documentId; reason? }) → { deals: number }  — marks every deal of that document:
//          `CrmDeal.tags` gains DEAL_VOIDED_TAG (idempotent) + ONE AUTO activity (Thai title, no PII) + every COUNTED payment of
//          that document reversed.  **No column is added (R-C.1): the flag is the tag + the activity** (oracle-proposed — see report)
//        countPosSale(ctx, input: { saleId }) → { counted: boolean; dealId: string | null }   — a "LINKED" row of that sale becomes
//          "COUNTED" and `paidSatang` grows by the row's satang, once; no row (the cashier picked no deal, or the link is a
//          millisecond late) ⇒ nothing, and that is not an error
//        reversePosSale(ctx, input: { saleId }) → { reversed: boolean; dealId: string | null } — as reverseDocPayment
//      STAFF (ctx + actor · system re-resolved (id + tenantId + type CRM) else NOT_FOUND · assertCrmV2 FIRST (uiVersion 1 ⇒
//      CrmV2DisabledError, nothing written) · `visibleWhere`/`dealWhere` on every read · AuditLog on every mutation ·
//      errors carry `.code` ∈ NOT_FOUND | FORBIDDEN | VALIDATION | CONFIRM_REQUIRED with a Thai message that never blames the user):
//        linkSaleToDeal(ctx, actor, input: { dealId; saleId }) → { ok: true; paymentId: string; counted: boolean }
//          key `crm.deal.update` · the sale must belong to ctx.tenantId · the deal must be visible AND open · writes
//          `CrmDealPayment(dealId, "POS_SALE", saleId, satang = PosSale.grandTotalSatang, status "LINKED")` · 🔴 **if the sale is
//          ALREADY `PAID` when the link is written (the normal order: the cashier confirms the bill, then the action links it) the
//          SAME transaction counts it** — otherwise `pos.sale.paid` has already been consumed and the money is lost. Whichever of
//          the two paths arrives first counts, the other one is a no-op (same unique key) · audit `crm.deal.pos.link`
//        openDealsForParty(ctx, actor, partyId) → { id; title; valueSatang: number; stageName; ownerUserId: string | null }[]
//          OPEN deals of that Party's contact/company in ctx.systemId, visible to the actor only, ≤ 20, newest first · an actor
//          without `crm.deal.read` gets `[]` (never an exception — the POS screen must keep selling)
//        dealForDoc(tenantId: string, docId: string, actor?: MemberActor | null) → { dealId; systemId; title; path } | null
//          null for another tenant's document, a document with no deal, or a deal the actor cannot see (the brief writes
//          `crm.dealForDoc(docId)`; the tenant argument is mandatory for X1 — oracle-proposed, see report)
//        dealMoney(ctx, actor, dealId) → { paidSatang: number; wonValueSatang: number; documentVoided: boolean;
//          payments: { id; refType: "PAYMENT" | "POS_SALE"; refId; satang: number; status: "LINKED" | "COUNTED" | "REVERSED";
//          countedAt: Date | null }[] }
//      CONSTANTS (exported from payments.ts or a `payments-shared.ts`): DEAL_VOIDED_TAG = "เอกสารถูกยกเลิก" ·
//        POS_LINK_LIMIT = 20 · MONEY_REF_TYPES = ["PAYMENT", "POS_SALE"]
//   B. BRIDGE `src/lib/platform/crm-bridges/money.ts` (R-D: C2.7 owns this file; nothing else in that folder is touched) —
//      `onPaymentRecorded` · `onInvoicePaid` · `onPaymentVoided` · `onDocumentVoided` · `onPosSalePaid` · `onPosSaleVoided`,
//      each `(evt: BridgeEvent) => Promise<void>`, exported through `crm-bridges/index.ts`.  Each one: reads the payload ids only,
//      resolves the open CRM systems of `evt.tenantId` (`openCrmSystems` — uiVersion 2 + bridgesEnabled), reads the document /
//      sale through the OWNING module's facade (`account.docLinkInfo`, `pos` facade / PosSale read), then calls the service above.
//      They are registered in `src/lib/outbox-consumers.ts` INSIDE `// CRM C2.7 ▸ … ◂` as compose EXTRAS, appended LAST so that
//      `posSalePaid` (accounting), `stampFromSale` and `memberSaleBridge` keep running first and unchanged.
//   C. DEALS `src/lib/modules/crm/deals.ts` (additions only):
//        issueQuotation / issueInvoice keep their C1.5 signatures · `autoInvoiceOnWon` of the pipeline issues the invoice when a
//        deal enters WON, exactly once per deal (idempotent under parallel moves and redelivery), audited `crm.deal.invoice.auto`
//        · `autoWonOnPaid` moves the deal to the pipeline's WON stage when Σ COUNTED ≥ the anchor document total (after deposit
//        correction, net of live credit notes) for a deal with a document anchor; deal value otherwise (Q14 decides the basis) — ORACLE-EDIT 5
//        (C5.4-C · controller ruling 5) · was "when Σ COUNTED ≥ deal value" — exactly once, audited
//        `crm.deal.won.auto` (actorType SYSTEM) · `applyQuotationResponse` additionally writes ONE AUTO activity per (document,
//        answer) and ONE `AppNotification` for the deal owner (Thai, ids only, no PII) — both under the existing X4 flag
//        · `quotationDiffers(ctx, actor, dealId) → boolean` and `Deal360.quotationDiffers` / `Deal360.documentVoided`
//   D. POS (one hunk each — `pos/service.ts` and every account transaction stay BYTE-IDENTICAL):
//        `src/lib/modules/pos/register-ui.tsx` — a "ดีล" select right next to the member select, filled from
//        `openDealsForParty` of the selected member's Party; testids `pos-deal-select` · `pos-deal-hint`; hidden when the list is
//        empty or the cashier has no `crm.deal.read`
//        `src/lib/actions/pos.ts#registerSaleAction` — `SaleInput.dealId?: string` and, right after a successful `createSale`,
//        `crm.payments.linkSaleToDeal(...)` wrapped so that a CRM failure NEVER fails the sale (the bill is already paid): the
//        cashier sees the receipt, the failure is a WARN OpsEvent
//        `src/lib/modules/pos/register.ts` — the read that fills the select (edge `pos→crm`, facade `@/lib/modules/crm` only,
//        with an `ALLOWED_EDGES` entry + reason in `scripts/fitness.mts`)
//   E. ACCOUNT DOCUMENT PAGE — the "ดีล" link through `crm.dealForDoc` (existing `account→crm` edge), testid `acc-doc-crm-deal`,
//      and a row in `scripts/crm-ui-inventory.json` with wo "C2.7" for every new testid.
//   F. NO new outbox event type, NO new table, NO new column, NO migration (R-C.1 · C29). The money path emits only
//      already-registered types (`crm.deal.updated`, `crm.deal.stage.changed`, `crm.deal.won`, …) — each of which already has a
//      consumer and a label. The commission hook is a NO-OP until C3.3.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS FILE PROVES (**63 checks**): S0 structure (6) · S1–S8 of CRM-RUN §2 (28) · **S9 the controller's ruling round 2
//   (8)** · U PERMANENT RULE (uiVersion 1 · 4) · X1 (3) · X3 (4 — in-process AND worker PROCESSES) · X4 (4) · X6 (1) ·
//   X8 (2) · X9 (2) · CLEAN (1).  (C2.7-FATAL only ever fires on an unexpected exception.)
// ══════ S9 — ORACLE-EDIT of the oracle author (24 Sep · the controller's binding ruling round 2 · brief §"รอบ 2") ══════
//   S9.1 (CRITICAL · B1) ONE bill is ONE piece of money: a PAID sale counted on deal A cannot be linked to deal B
//     (CONFLICT · Thai · B untouched), two cashiers racing the same bill onto two deals leave exactly ONE row (the unique
//     key is per DEAL, so only a lock on the BILL can decide it), and the void gives everything back over BOTH deals.
//   S9.2 (CRITICAL · B2) the gate may stop COUNTING but never REVERSING: `uiVersion 2 + bridgesEnabled false` refuses
//     `linkSaleToDeal` and writes nothing, while money counted before the shop closed the bridge — or fell back to
//     uiVersion 1 — is still reversed by `pos.sale.voided` / `account.payment.voided` (else the deal keeps phantom money).
//   S9.3 (MAJOR · SF-1) voiding the INVOICE reverses only that document's rows: the deposit receipt of the same deal keeps
//     its money, the invoice's row is REVERSED and the deal is tagged exactly once.
//   S9.4 (MAJOR · SF-2) withholding tax: `account.payment.recorded` carries the CASH only, accounting ties off cash + WHT
//     and calls the invoice PAID ⇒ ONE `DOC_SETTLE#<docId>` row closes the document to its grand total (idempotent under
//     replay and parallel delivery) and `autoWonOnPaid` fires exactly once.
//   S9.5 (MAJOR · SF-3) 20 rounds of `moveDeal` OPEN→OPEN racing `recordDocPayment` on separate connections: reading the
//     counted won value outside the deal's lock would overwrite it with null — `wonValueSatang` must never be null or
//     regress once money has been counted.
//   S9.6 (MINOR · SF-4) two deals claiming the same quotation/invoice: the oldest is credited ONCE and a WARN OpsEvent
//     (Thai · ids only) records the ambiguity · the void flags BOTH deals but only un-counts the one that was counted.
//   S9.7 (MINOR · SF-5) only `INVOICE` / `DEPOSIT_RECEIPT` are attributable: a `BILLING_NOTE` payment writes no deal money
//     and leaves a WARN (one billing note can cover invoices of several deals — the debt belongs to C3).
//   S9.8 (MINOR · N3 · N1 · N4) a gift-card bill is never deal revenue (Thai refusal · never counted even with a LINKED
//     row) · the sell screen's deal list is EMPTY for a cashier without `crm.deal.update` and the link answers FORBIDDEN
//     without writing a row (an offered select whose button always fails is a silent trap) · a pre-existing LINKED row that
//     finally gets counted emits `crm.deal.updated`.
//   X8.1 additionally sweeps those new WARN rows (and a WARN written without a tenantId) for PII; C2.7-S8.3 additionally
//   demands a `crm-ui-inventory.json` row with wo C2.7 for `pos-deal-select` and `pos-deal-hint`, not only the doc link.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ORACLE-EDIT C2.7-fix ▸ (26 Sep · controller lane "C2.7-fix") + F1 = 16 checks (F1.1 · F1.2a · F1.2 · F1.2b · F1.3 · F1.4 · F1.5 ·
//   F1.6 · round 2: F1.7 · F1.8 · F1.9 · F1.10 · F1.11 · round 3: F1.12 · F1.13 · F1.14) ⇒ 79: the document money must not depend on the ORDER `account.payment.recorded` / `account.invoice.paid` are consumed in
//   (they are written by ONE emitOutboxMany with the same createdAt) · `pump` orders by (createdAt, id) · worker mode `deliverRounds` ◂
//   N/A with reasons: X2 (C2.7 adds no REST op and no AI tool — the money ops/tools are C2.11 and C3.4, which carry X2) ·
//   X5 (C2.7 registers no scheduled job: every effect is an outbox consumer, and "two overlapping runs" is exercised as the
//   twice-in-parallel delivery of X4.1–X4.4) · X7 (no public endpoint) · X10 (no file, no secret, no cookie).
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants swept in `finally` (every table with a tenantId, 4 passes) +
//   users · a trigger LAB tenant for the compose contract (triggers named `qc_c27_*`, dropped immediately) · EVERY outbound fetch
//   stubbed · worker processes re-invoke THIS file with `--x3-worker` · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { needsRegistryRow } from "./lib/crm-testid-scan.mjs"; // ORACLE-EDIT (sweep 27 Sep, C4.1 registry policy)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const PAYS = "src/lib/modules/crm/payments.ts";
const CRM_INDEX = "src/lib/modules/crm/index.ts";
const DEALS = "src/lib/modules/crm/deals.ts";
const BR_DIR = "src/lib/platform/crm-bridges";
const BR_MONEY = `${BR_DIR}/money.ts`;
const BR_INDEX = `${BR_DIR}/index.ts`;
const CONS_FILE = "src/lib/outbox-consumers.ts";
const LABELS = ["src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts"];
const POS_SVC = "src/lib/modules/pos/service.ts";
const POS_UI = "src/lib/modules/pos/register-ui.tsx";
const POS_REG = "src/lib/modules/pos/register.ts";
const POS_ACT = "src/lib/actions/pos.ts";
const ACC_SVC = "src/lib/modules/account/service.ts";
const FITNESS = "scripts/fitness.mts";
const INVENTORY = "scripts/crm-ui-inventory.json";
const SCHEMA_DIR = "prisma/schema";
const THIS_FILE = "scripts/qc-crm-c2.7.mts";

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
const FORCE = ARGV.includes("--force-run");
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const o: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) o.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(n)) o.push(p);
  }
  return o.sort();
};

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — C2.7 not built or C2.0 tables absent ⇒ SKIPPED, no DB connection opened.
// ═══════════════════════════════════════════════════════════════════════════════════
const BUILT = existsSync(PAYS);
const schemaAll = existsSync(SCHEMA_DIR) ? readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".prisma")).map((f) => read(join(SCHEMA_DIR, f))).join("\n") : "";
const C20 = /model\s+CrmDealPayment\s*\{/.test(schemaAll) && (existsSync("prisma/migrations") ? readdirSync("prisma/migrations").some((d) => /_crm_v2_b$/.test(d)) : false);
if (WORKER_AT < 0 && !FORCE && (!BUILT || !C20)) {
  const why = !BUILT ? `WO C2.7 not built yet (${PAYS} missing)` : "prerequisite C2.0 absent: model CrmDealPayment / prisma/migrations/*_crm_v2_b not in the tree";
  console.log(`⚠️  SKIPPED — ${why} (run with --force-run to exercise the fixtures, the workers and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ─── nothing reaches the network (set AFTER loadQcEnv so the fakes win) ───
process.env.RESEND_API_KEY = "re_qc_c27_fake";
for (const k of Object.keys(process.env)) if (/^(OPENROUTER|OPENAI|ANTHROPIC|SHARK_AI_KEY|AI_API_KEY|BEAM_)/.test(k)) delete process.env[k];
const FETCHES: string[] = [];
globalThis.fetch = (async (input: Any): Promise<Response> => {
  FETCHES.push(typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? ""));
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

// ═══════════════════════════════════════════════════════════════════════════════════
// X3/X4 WORKER MODE — this file re-invoked as a child process (own PrismaClient = own pool, synchronised start).
//   argv: --x3-worker <mode> <startAtMs> <base64url(JSON arg)>
//     pay     : { tenantId, accSys, docId, n, amount }  → n parallel account.recordPayment (own connections)
//     consume : { eventId, n }                          → n parallel deliveries of the SAME outbox row to the consumer map
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const [mode, wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const arg = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8"));
  const PW = ((await import("@/lib/core/db")) as Any).prisma as Any;
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const out: string[] = [];
  const err = (e: unknown) => `ERR:${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`;
  if (mode === "pay") {
    const acc = (await import("@/lib/modules/account/service" as string).catch(() => ({}))) as Any;
    out.push(...(await Promise.all(Array.from({ length: Number(arg.n) }, async () => {
      try {
        if (typeof acc.recordPayment !== "function") return "ERR:recordPayment missing";
        const r = await acc.recordPayment(arg.tenantId, arg.accSys, arg.docId, { amount: Number(arg.amount), channel: "CASH" });
        return r?.ok ? "OK" : `NO:${String(r?.reason ?? "?").slice(0, 60)}`;
      } catch (e) { return err(e); }
    }))));
  } else if (mode === "consume") {
    const obx = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
    const row = await PW.outboxEvent.findFirst({ where: { id: arg.eventId } });
    out.push(...(await Promise.all(Array.from({ length: Number(arg.n) }, async () => {
      try {
        const h = obx?.consumers?.[row?.type];
        if (typeof h !== "function") return "ERR:consumer missing";
        await h({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
        return "OK";
      } catch (e) { return err(e); }
    }))));
  }
  // ORACLE-EDIT C2.7-fix ▸ deliverRounds : { ids: string[]; t0: number; gapMs: number; skewMs?: number[] } → outbox row ids[r]
  //   delivered ONCE to the consumer map at t0 + r·gapMs + skewMs[r] (rows prefetched before t0). Two of these workers — one holding the `account.invoice.paid` rows,
  //   the other the `account.payment.recorded` rows of the SAME payments — race the two events of one payment on two processes
  //   (own pools, own connections) round after round. An answer "LATE:<ms>" = that round was not synchronised (positive control F1.2a).
  else if (mode === "deliverRounds") {
    const obx = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
    const ids: string[] = Array.isArray(arg.ids) ? arg.ids.map(String) : [];
    const rows = await Promise.all(ids.map((id) => PW.outboxEvent.findFirst({ where: { id } })));
    for (let r = 0; r < ids.length; r += 1) {
      const row = rows[r];
      const skew = Array.isArray(arg.skewMs) ? Number(arg.skewMs[r] ?? 0) : 0;
      const wait = Number(arg.t0) + r * Number(arg.gapMs) + skew - Date.now();
      if (wait > 0) await new Promise<void>((res) => setTimeout(res, wait));
      try {
        const h = obx?.consumers?.[row?.type];
        if (!row || typeof h !== "function") { out.push("ERR:consumer/row missing"); continue; }
        await h({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
        out.push(wait < -80 ? `LATE:${Math.round(-wait)}` : "OK");
      } catch (e) { out.push(err(e)); }
    }
  }
  // ◂ ORACLE-EDIT C2.7-fix
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  await PW.$disconnect();
  process.exit(0);
}

// ─── harness ───
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const out = (s: string) => process.stdout.write(`${s}\n`);
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  out(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const LOGS: string[] = [];
{
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  const j0 = (x: unknown) => { try { return typeof x === "string" ? x : x instanceof Error ? `${x.name}: ${x.message}` : JSON.stringify(x); } catch { return String(x); } };
  for (const k of Object.keys(orig) as (keyof typeof orig)[]) {
    console[k] = ((...a: unknown[]) => { LOGS.push(a.map(j0).join(" ")); orig[k](...a); }) as Any;
  }
}
const cut = (v: unknown, n = 240) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const thai = (s: unknown) => /[ก-๙]/.test(String(s ?? ""));
const blames = (s: unknown) => /คุณ(ทำ|ใส่|กรอก|เลือก)[^\s]*ผิด|ความผิดของคุณ|ผู้ใช้ผิด/.test(String(s ?? ""));
type Res = { ok: boolean; v: Any; err: string; code: string; msg: string; name: string };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", msg: "", name: "" };
  try { return { ok: true, v: await fn(...args), err: "", code: "", msg: "", name: "" }; } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), msg, name: String(x?.name ?? "") };
  }
};
const refused = (r: Res, code?: string | string[]) =>
  !r.ok && r.code !== "MISSING_FUNCTION" && thai(r.msg) && !blames(r.msg) && (!code || (Array.isArray(code) ? code.includes(r.code) : r.code === code));
const isV1Refusal = (r: Res, msg: string) => !r.ok && r.code !== "MISSING_FUNCTION" && (r.name === "CrmV2DisabledError" || r.code === "CRM_V2_DISABLED" || (!!msg && r.msg === msg));
const rd = (r: Res) => (r.ok ? "ok" : r.err);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const B = (v: unknown) => Number(v ?? 0); // BigInt | number | null → number (satang; safe far below 2^53)

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "q");
const TAG = `qc-c27-${rand}`;
const RUN_START = new Date(Date.now() - 5_000);
const TRIG = `qc_c27_${rand}`;
out(`\n═══ QC CRM v2 · C2.7 — account & POS bridges (the money path) ═══`);
out(`[env] DB ${host} · tag ${TAG}${FORCE && (!BUILT || !C20) ? ` · --force-run with ${!BUILT ? "C2.7 ABSENT" : "C2.0 tables ABSENT"} (C2.7 checks expected red; controls + CLEAN green)` : ""}\n`);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
const FIXTURE_NOTES: string[] = [];
const TRIG_TABLES = new Set<string>();

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // modules (dynamic — they may not exist yet)
  // ═════════════════════════════════════════════════════════════════════════════
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const PAY = (await import("@/lib/modules/crm/payments" as string).catch(() => ({}))) as Any;
  const MONEY = (await import("@/lib/platform/crm-bridges/money" as string).catch(() => ({}))) as Any;
  const BRIDGES = (await import("@/lib/platform/crm-bridges" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const ACC = (await import("@/lib/modules/account" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const finance = (await import("@/lib/modules/account/finance" as string).catch(() => ({}))) as Any;
  const POS = (await import("@/lib/modules/pos" as string)) as Any;
  const UIV = (await import("@/lib/modules/crm/ui-version" as string).catch(() => ({}))) as Any;
  const AUTO_LABELS = (await import("@/lib/automation/labels" as string).catch(() => ({}))) as Any;
  const WH_LABELS = (await import("@/lib/webhooks/labels" as string).catch(() => ({}))) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const V1MSG: string = UIV.CRM_V2_DISABLED_MSG ?? "";
  const VOID_TAG: string = String(PAY.DEAL_VOIDED_TAG ?? "เอกสารถูกยกเลิก");

  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure
  // ═════════════════════════════════════════════════════════════════════════════
  out("── S0 · structure ──");
  const paySrc = read(PAYS);
  const moneySrc = read(BR_MONEY);
  const consSrc = read(CONS_FILE);
  const dealsSrc = read(DEALS);
  {
    const need = ["recordDocPayment", "reverseDocPayment", "flagDocumentVoided", "countPosSale", "reversePosSale", "linkSaleToDeal", "openDealsForParty", "dealForDoc", "dealMoney"];
    const missing = need.filter((f) => typeof PAY?.[f] !== "function");
    chk("C2.7-S0.1", `crm/payments.ts exports the ${need.length} contract functions · crm/index.ts \`export * as payments\` (the SAME bindings) · DEAL_VOIDED_TAG exported`,
      paySrc.length > 0 && missing.length === 0 && /export\s+\*\s+as\s+payments\s+from\s+["']\.\/payments["']/.test(read(CRM_INDEX)) &&
        CRM?.payments?.recordDocPayment === PAY.recordDocPayment && typeof PAY.DEAL_VOIDED_TAG === "string",
      "all + facade", `exists=${paySrc.length > 0} missing=${missing.join(",") || "-"} facade=${CRM?.payments?.recordDocPayment === PAY.recordDocPayment} tag=${typeof PAY.DEAL_VOIDED_TAG}`);
  }
  {
    const need = ["onPaymentRecorded", "onInvoicePaid", "onPaymentVoided", "onDocumentVoided", "onPosSalePaid", "onPosSaleVoided"];
    const missing = need.filter((f) => typeof MONEY?.[f] !== "function");
    const viaIndex = need.filter((f) => BRIDGES?.[f] !== MONEY?.[f]);
    chk("C2.7-S0.2", "crm-bridges/money.ts exports the 6 money handlers and crm-bridges/index.ts re-exports exactly those bindings (R-D: C2.7 owns money.ts only)",
      moneySrc.length > 0 && missing.length === 0 && viaIndex.length === 0, "6 handlers via index",
      `exists=${moneySrc.length > 0} missing=${missing.join(",") || "-"} notReexported=${viaIndex.join(",") || "-"}`);
  }
  {
    const EVTS = ["account.payment.recorded", "account.invoice.paid", "account.payment.voided", "account.document.voided", "pos.sale.paid", "pos.sale.voided"];
    const inBlock = /CRM C2\.7 ▸[\s\S]*?◂/.test(consSrc);
    const wired = EVTS.filter((t) => typeof CONS[t] === "function");
    // the CRM extra must be the LAST step of pos.sale.paid (accounting → stamp → member → CRM)
    const posLine = /"pos\.sale\.paid":([^\n]*)/.exec(consSrc)?.[1] ?? "";
    const crmLast = /crmBridge\(\s*["']onPosSalePaid["']\s*\)\s*\)*\s*,?\s*$/.test(posLine.trim()) || /memberSaleBridge\([^)]*\)[\s\S]*crmBridge\(\s*["']onPosSalePaid["']/.test(posLine);
    chk("C2.7-S0.3", "outbox-consumers.ts wires the 6 money events inside `// CRM C2.7 ▸ … ◂` with a dynamic import of crm-bridges, and the CRM step of pos.sale.paid is appended LAST (after accounting · stamps · member)",
      inBlock && wired.length === EVTS.length && /import\(\s*["']@\/lib\/platform\/crm-bridges["']\s*\)/.test(consSrc) && crmLast,
      "block + 6 consumers + CRM last", `block=${inBlock} wired=${wired.length}/${EVTS.length} crmLast=${crmLast} line=${cut(posLine, 160)}`);
  }
  {
    // F — no new event type, no schema change, no migration (R-C.1 · C29)
    const names: string[] = [
      ...((AUTO_LABELS.AUTOMATION_EVENTS ?? []) as Any[]).map((x: Any) => String(x?.value ?? x)),
      ...((WH_LABELS.WEBHOOK_EVENTS ?? []) as Any[]).map((x: Any) => String(x?.value ?? x)),
    ];
    const newInMoney = Array.from(new Set([...moneySrc.matchAll(/["'](crm\.[a-z0-9_.]+)["']/g)].map((m) => m[1] as string)))
      .filter((t) => !names.includes(t));
    const posCols = (await P.$queryRawUnsafe(`select column_name from information_schema.columns where table_schema='public' and table_name='PosSale'`).catch(() => [])) as Any[];
    const hasDealId = posCols.some((c) => String(c.column_name) === "dealId");
    const migs = existsSync("prisma/migrations") ? readdirSync("prisma/migrations") : [];
    // ORACLE-EDIT C2.7-S0.4 (26 ก.ย. · ผู้คุมงาน): `crm_v2_c` เป็นของ C3.0 ตาม R-C.1 (ชื่อข้อเองก็บอกไว้) — พอ C3.0 ลง ข้อนี้แดงหลอก
    // ⇒ นับเฉพาะ migration ที่ไม่มีใครในแผนเป็นเจ้าของ (crm_v2_d ขึ้นไป)
    const extraMig = migs.filter((d) => /crm_v2_[d-z]$/.test(d));
    chk("C2.7-S0.4", "C2.7 adds NO new outbox type (every crm.* name the money bridge emits is already in the registries and has a consumer), NO `PosSale.dealId` column (C29) and NO migration of its own (R-C.1: crm_v2_a · b · c only, and c is C3.0's)",
      newInMoney.length === 0 && !hasDealId && extraMig.length === 0, "no new type · no column · no migration",
      `newTypes=${newInMoney.join(",") || "-"} PosSale.dealId=${hasDealId} migrations=${extraMig.join(",") || "-"}`);
  }
  {
    const src = [paySrc, moneySrc].join("\n");
    const miss = ["X1", "X3", "X4", "X8", "X9"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(src));
    chk("C2.7-S0.5", "implementation sites marked `// AUDIT-CLASS X1 X3 X4 X8 X9` in crm/payments.ts + crm-bridges/money.ts [static]",
      miss.length === 0, "5 markers", miss.join(",") || "-", "MINOR");
  }
  {
    const fit = read(FITNESS);
    const edgeOk = /"pos→crm"/.test(fit) && /pos→crm/.test(fit.split("ALLOWED_EDGES")[1]?.slice(0, 6000) ?? "");
    const deepFromPos = [POS_UI, POS_REG, POS_ACT, POS_SVC].filter((f) => /from\s+["']@\/lib\/modules\/crm\/(?!index)/.test(read(f)));
    chk("C2.7-S0.6", "fitness: `pos→crm` is in ALLOWED_EDGES (with a reason) and POS reaches CRM only through the facade `@/lib/modules/crm` — never a deep import [static]",
      edgeOk && deepFromPos.length === 0, "edge + facade only", `edge=${edgeOk} deep=${deepFromPos.join(",") || "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — A (main: 2 CRM · account · POS) · B (foreign) · V (uiVersion 1) · L (compose lab)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const userA = await mkUser("");
  const userM = await mkUser("-mgr");
  const userS = await mkUser("-staff");     // cashier: POS keys + crm.deal.read, own-only visibility
  const userS2 = await mkUser("-staff2");   // another sales person (X1: his deal must stay invisible)
  const STAFF_PERMS = { "crm.deal.read": true, "crm.contact.read": true, "pos.sale.create": true };
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    const m = (userId: string, role: string, permissions: Record<string, unknown>) =>
      P.membership.create({ data: { userId, tenantId: t.id, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    await m(userA, "OWNER", {});
    await m(userM, "MANAGER", {});
    await m(userS, "STAFF", STAFF_PERMS);
    await m(userS2, "STAFF", STAFF_PERMS);
    return t.id as string;
  };
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);

  const tidA = await mkTenant("a");
  const crmA = await mk(tidA, "CRM", "CRM");
  await sleep(30);
  const crmA2 = await mk(tidA, "CRM", "CRM สอง");
  const accA = await mk(tidA, "ACCOUNT", "บัญชี");
  const posA = await mk(tidA, "POS", "หน้าร้าน");
  const tidB = await mkTenant("b");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const accB = await mk(tidB, "ACCOUNT", "บัญชี-B");
  const posB = await mk(tidB, "POS", "หน้าร้าน-B");
  const tidV = await mkTenant("v1");
  const crmV = await mk(tidV, "CRM", "CRM-V1");
  const accV = await mk(tidV, "ACCOUNT", "บัญชี-V1");
  const posV = await mk(tidV, "POS", "หน้าร้าน-V1");
  const tidL = await mkTenant("lab");
  const crmL = await mk(tidL, "CRM", "CRM-LAB");
  const accL = await mk(tidL, "ACCOUNT", "บัญชี-LAB");
  const posL = await mk(tidL, "POS", "หน้าร้าน-LAB");
  for (const s of [crmA, crmA2, crmB, crmL]) await setCrm(s, { uiVersion: 2, bridgesEnabled: true });
  await setCrm(crmV, { uiVersion: 1, bridgesEnabled: true });
  const owner = { userId: userA, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const manager = { userId: userM, role: "MANAGER", unitAccess: ["*"] as string[], permissions: {} as Record<string, unknown> };
  const cashier = { userId: userS, role: "STAFF", unitAccess: ["*"] as string[], permissions: STAFF_PERMS as Record<string, unknown> };
  const cA: Any = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cA2: Any = { tenantId: tidA, systemId: crmA2, actorUserId: userA };
  const cB: Any = { tenantId: tidB, systemId: crmB, actorUserId: userA };
  const cV: Any = { tenantId: tidV, systemId: crmV, actorUserId: userA };
  const cL: Any = { tenantId: tidL, systemId: crmL, actorUserId: userA };

  // account ⇄ CRM links (createExternalQuotation refuses without one — "ยังไม่เชื่อมระบบบัญชี")
  const linkAcc = async (tid: string, accSys: string, crmSys: string) =>
    P.accountSystemLink.create({ data: { tenantId: tid, systemId: accSys, linkedKind: "CRM", linkedId: crmSys } }).catch(() => null);
  await linkAcc(tidA, accA, crmA);
  await linkAcc(tidA, accA, crmA2);
  await linkAcc(tidB, accB, crmB);
  await linkAcc(tidV, accV, crmV);
  await linkAcc(tidL, accL, crmL);
  // a POS unit per tenant (createSale needs one) + finance accounts for the real payments
  const mkUnit = async (tid: string, sys: string, name: string) => {
    const u = await P.businessUnit.create({ data: { tenantId: tid, name: `${name} ${TAG}` } }).catch(() => null);
    if (u) await P.appSystemUnit.create({ data: { tenantId: tid, systemId: sys, unitId: u.id } }).catch(() => null);
    return (u?.id ?? "") as string;
  };
  const unitA = await mkUnit(tidA, posA, "สาขา A");
  const unitB = await mkUnit(tidB, posB, "สาขา B");
  const unitV = await mkUnit(tidV, posV, "สาขา V1");
  const unitL = await mkUnit(tidL, posL, "สาขา LAB");
  for (const [tid, pos, acc, unit] of [[tidA, posA, accA, unitA], [tidB, posB, accB, unitB], [tidV, posV, accV, unitV], [tidL, posL, accL, unitL]] as const) {
    await P.appSystemUnit.create({ data: { tenantId: tid, systemId: acc, unitId: unit } }).catch(() => null);
    void pos;
  }
  const mkFinance = async (tid: string, accSys: string) => {
    const r = await call(finance.createFinanceAccount, { tenantId: tid, systemId: accSys, type: "CASH", name: `เงินสด ${TAG}` });
    const id = String(r.v?.id ?? "");
    if (!id) FIXTURE_NOTES.push(`createFinanceAccount(${accSys}) ${rd(r)} → payments without a finance account`);
    return id;
  };
  const finA = await mkFinance(tidA, accA);
  const finV = await mkFinance(tidV, accV);
  const finL = await mkFinance(tidL, accL);

  // ─── pipelines: pQuote (quote stages) · pAutoInv (autoInvoiceOnWon) · pAutoWon (autoWonOnPaid) · pPlain ───
  type Pipe = { id: string; st: string[] };
  const STD = [
    { name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10 },
    { name: "ต่อรอง", kind: "OPEN", probability: 40 },
    { name: "ตอบรับใบเสนอราคา", kind: "OPEN", probability: 80 },
    { name: "ชนะ", kind: "WON", probability: 100 },
    { name: "แพ้", kind: "LOST", probability: 0 },
  ];
  const mkPipe = async (tid: string, sys: string, name: string, opts: { quote?: boolean; autoInv?: boolean; autoWon?: boolean } = {}): Promise<Pipe> => {
    const p = (await P.crmPipeline.create({
      data: { tenantId: tid, systemId: sys, name: `${name} ${TAG}`, stages: { create: STD.map((s, i) => ({ tenantId: tid, systemId: sys, sortOrder: i, ...s })) } },
      include: { stages: true },
    })) as Any;
    const st = [...(p.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string);
    const data: Record<string, unknown> = {};
    if (opts.quote) { data.stageOnQuoteAcceptedId = st[2]; data.stageOnQuoteRejectedId = st[4]; }
    if (opts.autoInv) data.autoInvoiceOnWon = true;
    if (opts.autoWon) data.autoWonOnPaid = true;
    if (Object.keys(data).length) await P.crmPipeline.update({ where: { id: p.id }, data }).catch(() => null);
    return { id: p.id as string, st };
  };
  const pQuote = await mkPipe(tidA, crmA, "ขายโครงการ", { quote: true });
  const pPlain = await mkPipe(tidA, crmA, "ขายปลีก");
  const pAutoInv = await mkPipe(tidA, crmA, "ออกใบแจ้งหนี้อัตโนมัติ", { quote: true, autoInv: true });
  const pAutoWon = await mkPipe(tidA, crmA, "ชนะเมื่อจ่าย", { autoWon: true });
  const pA2 = await mkPipe(tidA, crmA2, "ระบบสอง", { quote: true });
  const pB = await mkPipe(tidB, crmB, "ร้านอื่น", { quote: true });
  const pV = await mkPipe(tidV, crmV, "ร้าน v1", { quote: true, autoInv: true, autoWon: true });
  const pL = await mkPipe(tidL, crmL, "ห้องทดลอง", { quote: true });

  // ─── contacts / deals ───
  type Ct = { id: string; partyId: string; name: string };
  const mkContact = async (tid: string, sys: string, label: string, ownerUserId: string): Promise<Ct> => {
    const name = pii(`${label} ${TAG}-${nx()}`);
    const p = await P.party.create({ data: { tenantId: tid, name, kind: "PERSON" } });
    const row = await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone: pii(`08${String(Math.floor(Math.random() * 9e7) + 1e7)}`), email: pii(`${TAG}-${nx()}@qc-crm.example`), partyId: p.id, ownerUserId } });
    return { id: row.id as string, partyId: p.id as string, name };
  };
  type Line = { name: string; qty: number; unitPriceSatang: number; discountBp?: number; vatRateBp?: number };
  const LINES: Line[] = [
    { name: "ทัวร์ดำน้ำ 3 วัน", qty: 2, unitPriceSatang: 1_250_00, discountBp: 0, vatRateBp: 700 },
    { name: "เช่าอุปกรณ์", qty: 3, unitPriceSatang: 333_33, discountBp: 500, vatRateBp: 700 },
    { name: "ค่าเดินทาง", qty: 1, unitPriceSatang: 87_77, discountBp: 0, vatRateBp: 0 },
  ];
  const mkDeal = async (ctx: Any, ct: Ct, pipe: Pipe, opts: { stage?: number; lines?: Line[]; ownerUserId?: string; value?: number } = {}) => {
    const title = `ดีล ${TAG}-${nx()}`;
    let id = "";
    const r = await call(CRM.deals?.createDeal, ctx, owner, { contactId: ct.id, pipelineId: pipe.id, title, valueSatang: opts.value ?? 0, ownerUserId: opts.ownerUserId ?? ctx.actorUserId });
    id = String(r.v?.id ?? "");
    if (!id) {
      const row = await P.crmDeal.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, contactId: ct.id, pipelineId: pipe.id, stageId: pipe.st[opts.stage ?? 0], title, valueSatang: opts.value ?? 0, ownerUserId: opts.ownerUserId ?? ctx.actorUserId } });
      id = row.id as string;
      FIXTURE_NOTES.push(`createDeal ${rd(r)} → raw row`);
    }
    if (opts.lines?.length) {
      const sl = await call(CRM.deals?.setLines ?? CRM.deals?.lines?.set, ctx, owner, id, { lines: opts.lines });
      if (!sl.ok) {
        let sort = 0;
        for (const l of opts.lines) {
          await P.crmDealLine.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, dealId: id, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, discountBp: l.discountBp ?? 0, vatRateBp: l.vatRateBp ?? null, sortOrder: sort } }).catch(() => null);
          sort += 1;
        }
        FIXTURE_NOTES.push(`setLines ${rd(sl)} → raw lines`);
      }
    }
    if (opts.stage !== undefined && opts.stage > 0) await P.crmDeal.update({ where: { id }, data: { stageId: pipe.st[opts.stage] } }).catch(() => null);
    return id;
  };
  const dealRow = async (id: string): Promise<Any> => (id ? await P.crmDeal.findFirst({ where: { id } }) : null);
  const paysOf = async (dealId: string): Promise<Any[]> => { try { return (await P.crmDealPayment.findMany({ where: { dealId }, orderBy: { createdAt: "asc" } })) ?? []; } catch { return []; } };
  const docRow = async (id: string): Promise<Any> => (id ? await P.accountDocument.findFirst({ where: { id }, include: { lines: true } }) : null);
  // ORACLE-EDIT C2.7-S3.1/S9.5 (C5.4-C · won basis = before VAT · Q14): the won value of a document anchor on the product's single basis constant
  //   (PRE_VAT = subTotal − discountAmount · VAT_INCL = grandTotal + depositDeducted) minus live credit notes of that document (none in these fixtures)
  const WON_BASIS = String(((await import("@/lib/modules/crm/payments-shared" as string)) as Any).WON_VALUE_BASIS ?? "PRE_VAT");
  const wonBasisOf = async (id: string): Promise<number> => {
    const d = await docRow(id);
    if (!d) return -1;
    const cn = await P.accountDocument.findMany({ where: { tenantId: d.tenantId, docType: "CREDIT_NOTE", sourceDocId: id, status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } }, select: { subTotal: true, discountAmount: true, grandTotal: true } });
    return WON_BASIS === "VAT_INCL"
      ? Number(d.grandTotal) + Number(d.depositDeducted ?? 0) - cn.reduce((a: number, c: Any) => a + Number(c.grandTotal), 0)
      : Number(d.subTotal) - Number(d.discountAmount) - cn.reduce((a: number, c: Any) => a + Number(c.subTotal) - Number(c.discountAmount), 0);
  };

  // ─── outbox pump / single delivery ───
  const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
  const consume = (evt: Any) => call(CONS?.[evt?.type], evt);
  const pump = async (tids: string[], rounds = 25) => {
    await sleep(250); // let any drain the product code scheduled itself finish first (createSale drains after commit)
    for (let i = 0; i < rounds; i += 1) {
      // ORACLE-EDIT C2.7-fix ▸ deterministic order: rows written by ONE emitOutboxMany share createdAt to the microsecond, so
      //   `createdAt` alone left the tie to the planner and could hide (or show) an order bug by luck — the id breaks the tie ◂
      const rows = (await P.outboxEvent.findMany({ where: { tenantId: { in: tids }, status: "PENDING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 200 })) as Any[];
      if (rows.length === 0) { await sleep(150); return true; }
      for (const row of rows) {
        await consume(evtOf(row));
        await P.outboxEvent.update({ where: { id: row.id }, data: { status: "DONE", processedAt: new Date() } }).catch(() => null);
      }
    }
    return false;
  };
  const eventsOf = async (tid: string, type: string): Promise<Any[]> => (await P.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "asc" } })) as Any[];
  const lastEvent = async (tid: string, type: string, needle?: string): Promise<Any> => {
    const rows = await eventsOf(tid, type);
    const f = needle ? rows.filter((r) => j(r.payload).includes(needle)) : rows;
    return f[f.length - 1] ?? null;
  };

  // ─── the real money helpers (account + POS) ───
  const issueDoc = (tid: string, accSys: string, docId: string) => call(accSvc.issueDocument, tid, accSys, docId);
  const payDoc = (tid: string, accSys: string, docId: string, amount: number, fin: string, extra: Record<string, unknown> = {}) =>
    call(accSvc.recordPayment, tid, accSys, docId, { amount, channel: "CASH", ...(fin ? { financeAccountId: fin } : {}), ...extra });
  const voidPay = (tid: string, accSys: string, docId: string, paymentId: string, reason: string) => call(accSvc.voidPayment, tid, accSys, docId, paymentId, reason);
  /** a REAL account document (createDocument → issueDocument): lines, totals and GL accounts exist, so recordPayment behaves
   *  exactly as it does for a shop's own invoice — a hand-inserted AccountDocument row would fail at the posting step */
  const mkDocReal = async (tid: string, accSys: string, docType: string, satang: number, extra: Record<string, unknown> = {}) => {
    const r = await call(accSvc.createDocument, {
      tenantId: tid, systemId: accSys, docType, lines: [{ description: `รายการ ${TAG}-${nx()}`, qty: 1, unitPrice: satang }], ...extra,
    });
    const id = String(r.v?.id ?? "");
    if (!id) { FIXTURE_NOTES.push(`createDocument(${docType}) ${rd(r)}`); return { id: "", grand: 0 }; }
    await issueDoc(tid, accSys, id);
    const row = await docRow(id);
    return { id, grand: Number(row?.grandTotal ?? 0) };
  };
  /** one real POS bill — the engine decides the grand total (VAT/discount settings of that shop), so every expectation below
   *  uses the total the bill really carries, never the price we typed in */
  const sell = async (tid: string, unitId: string, sysId: string, satang: number, memberId?: string) => {
    const r = await call(POS.createSale, {
      tenantId: tid, unitId, systemId: sysId, idempotencyKey: `${TAG}-sale-${nx()}`, sourceModule: "POS",
      lines: [{ name: `สินค้า ${TAG}`, qty: 1, unitPriceSatang: satang }],
      payMethods: [{ type: "CASH", amountSatang: satang }], ...(memberId ? { memberId } : {}),
    });
    if (!r.ok) FIXTURE_NOTES.push(`createSale(${satang}) ${rd(r)}`);
    return { r, ok: r.ok, saleId: String(r.v?.saleId ?? ""), grand: Number(r.v?.grandTotalSatang ?? 0) };
  };
  const saleRow = async (id: string): Promise<Any> => (id ? await P.posSale.findFirst({ where: { id } }) : null);

  // ─── trigger lab (compose contract — same pattern as qc-crm-c1.8) ───
  const dropTriggers = async () => {
    for (const t of TRIG_TABLES) await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG}_${t.toLowerCase()} ON "${t}"`).catch(() => 0);
    TRIG_TABLES.clear();
    await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIG}_fn() CASCADE`).catch(() => 0);
  };
  const failWrites = async (labTenant: string, table: string, op: "INSERT" | "UPDATE" | "INSERT OR UPDATE" = "INSERT") => {
    await P.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${TRIG}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tenantId" = '${labTenant}' THEN RAISE EXCEPTION 'qc-c27 forced failure'; END IF; RETURN NEW; END $$`);
    await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG}_${table.toLowerCase()} ON "${table}"`).catch(() => 0);
    await P.$executeRawUnsafe(`CREATE TRIGGER ${TRIG}_${table.toLowerCase()} BEFORE ${op} ON "${table}" FOR EACH ROW EXECUTE FUNCTION ${TRIG}_fn()`);
    TRIG_TABLES.add(table);
  };
  {
    const stale = (await P.$queryRawUnsafe(`SELECT t.tgname, c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.tgname LIKE 'qc_c27_%'`).catch(() => [])) as Any[];
    for (const s of stale) {
      const n = String(s.tgname);
      const rel = String(s.relname);
      if (/^qc_c27_[a-z0-9]+_[a-z]+$/.test(n) && /^[A-Za-z]+$/.test(rel)) await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${n} ON "${rel}"`).catch(() => 0);
    }
  }

  // ─── worker spawn (X3: separate connections) ───
  const spawnWorkers = async (mode: string, arg: Any, workers: number, startInMs = 900): Promise<{ spawned: boolean; answers: string[] }> => {
    const startAt = Date.now() + startInMs;
    const payload = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
    const runs = await Promise.all(Array.from({ length: workers }, () => new Promise<string>((resolve) => {
      const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x3-worker", mode, String(startAt), payload], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      let buf = "";
      ch.stdout?.on("data", (d: Buffer) => { buf += d.toString(); });
      ch.stderr?.on("data", (d: Buffer) => { buf += d.toString(); });
      ch.on("close", () => resolve(buf));
      ch.on("error", (e: Error) => resolve(`SPAWN_ERR ${e.message}`));
    })));
    const answers: string[] = [];
    let spawned = true;
    for (const r of runs) {
      const m = /X3WORKER (\[.*\])/.exec(r);
      if (!m) { spawned = false; continue; }
      try { answers.push(...(JSON.parse(m[1] as string) as string[])); } catch { spawned = false; }
    }
    return { spawned, answers };
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — quotation from real deal lines: document lines · tax · totals exact
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S1 · ใบเสนอราคาจากบรรทัดของดีล ──");
  const ctMain = await mkContact(tidA, crmA, "คุณลูกค้า", userA);
  const dQuote = await mkDeal(cA, ctMain, pQuote, { lines: LINES });
  const q1 = await call(CRM.deals?.issueQuotation, cA, owner, dQuote, {});
  const qDocId = String(q1.v?.docId ?? "");
  {
    const doc = await docRow(qDocId);
    const deal = await dealRow(dQuote);
    const lines: Any[] = doc?.lines ?? [];
    const sameCount = lines.length === LINES.length;
    const byName = LINES.every((l) => lines.some((x) => String(x.description ?? x.name) === l.name && Math.round(Number(x.unitPrice)) === l.unitPriceSatang));
    const intMoney = [doc?.subTotal, doc?.vatAmount, doc?.grandTotal].every((v) => v === null || v === undefined || Number.isInteger(Number(v)));
    chk("C2.7-S1.1", `issueQuotation sends the deal's ${LINES.length} lines to account.createExternalQuotation: ONE QUOTATION with the same ${LINES.length} lines (name + unit price byte-exact), integer-satang subTotal/VAT/grandTotal, deal.quotationDocId stored, audit crm.deal.quote`,
      q1.ok && !!doc && sameCount && byName && intMoney && deal?.quotationDocId === qDocId &&
        (await P.auditLog.count({ where: { tenantId: tidA, action: "crm.deal.quote", targetId: dQuote } })) >= 1,
      "1 doc · lines 1:1 · satang", `${rd(q1)} lines=${lines.length}/${LINES.length} byName=${byName} int=${intMoney} totals=${j({ sub: doc?.subTotal, vat: doc?.vatAmount, grand: doc?.grandTotal })} quotationDocId=${deal?.quotationDocId === qDocId}`);
  }
  {
    // the money on the document is the ACCOUNT engine's arithmetic — CRM must not recompute it with its own rounding
    const doc = await docRow(qDocId);
    const grand = Number(doc?.grandTotal ?? -1);
    const lineSum = (doc?.lines ?? []).reduce((n: number, l: Any) => n + Math.round(Number(l.amount ?? l.lineTotal ?? 0)), 0);
    chk("C2.7-S1.2", "the document totals come from the account engine and stay integer satang (Σ line amounts and grandTotal are whole numbers and consistent) — no float arithmetic anywhere on the money path",
      grand > 0 && Number.isInteger(grand) && Number.isInteger(lineSum) && Math.abs(grand - lineSum) <= Math.max(1, Math.round(grand * 0.08)),
      "integers, consistent", `grand=${grand} Σlines=${lineSum}`, "MAJOR");
  }
  {
    // idempotent + parallel (X3 on the quotation itself)
    const again = await call(CRM.deals?.issueQuotation, cA, owner, dQuote, {});
    const par = await Promise.all(Array.from({ length: 10 }, () => call(CRM.deals?.issueQuotation, cA, owner, dQuote, {})));
    const docs = await P.accountDocument.count({ where: { systemId: accA, docType: "QUOTATION", refType: "CrmDeal", refId: dQuote } });
    chk("C2.7-S1.3", "issueQuotation is idempotent per deal: a second call and 10 parallel calls all answer the SAME docId (created false) and the book holds exactly ONE quotation for that deal",
      again.ok && again.v?.docId === qDocId && again.v?.created === false && par.every((r) => r.ok && r.v?.docId === qDocId) && docs === 1,
      "1 document", `again=${rd(again)}:${again.v?.created} parallel=${par.filter((r) => r.ok && r.v?.docId === qDocId).length}/10 docs=${docs}`);
  }
  let invDocId = "";
  {
    await issueDoc(tidA, accA, qDocId); // a DRAFT quotation cannot be converted (account guard) — issue it first
    const inv = await call(CRM.deals?.issueInvoice, cA, owner, dQuote);
    invDocId = String(inv.v?.docId ?? "");
    const doc = await docRow(invDocId);
    const q = await docRow(qDocId);
    const deal = await dealRow(dQuote);
    const parInv = await Promise.all(Array.from({ length: 6 }, () => call(CRM.deals?.issueInvoice, cA, owner, dQuote)));
    const invCount = await P.accountDocument.count({ where: { systemId: accA, docType: "INVOICE", sourceDocId: qDocId } });
    chk("C2.7-S1.4", "issueInvoice converts the ISSUED quotation (sourceDocId = quotation · same grandTotal · same line count), stores invoiceDocId, and 6 parallel calls still leave exactly ONE invoice",
      inv.ok && !!doc && doc.sourceDocId === qDocId && Number(doc.grandTotal) === Number(q?.grandTotal) && (doc.lines ?? []).length === (q?.lines ?? []).length &&
        deal?.invoiceDocId === invDocId && parInv.every((r) => r.ok && r.v?.docId === invDocId) && invCount === 1,
      "1 invoice from the quotation", `${rd(inv)} src=${doc?.sourceDocId === qDocId} grand=${doc?.grandTotal}/${q?.grandTotal} invoiceDocId=${deal?.invoiceDocId === invDocId} invoices=${invCount}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — quotation responded → stage per pipeline settings + activity + notify owner
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S2 · ลูกค้าตอบใบเสนอราคา ──");
  const respond = async (tid: string, accSys: string, docId: string, accepted: boolean) =>
    call(ACC.respondQuotation, { tenantId: tid, systemId: accSys }, docId, accepted, { by: "PORTAL", signer: { name: `ผู้เซ็น ${TAG}`, ipHash: sha(`ip-${TAG}`), userAgent: "qc-agent" } });
  {
    const ct = await mkContact(tidA, crmA, "คุณตอบรับ", userM);
    const d = await mkDeal(cA, ct, pQuote, { lines: LINES, ownerUserId: userM });
    const qr = await call(CRM.deals?.issueQuotation, cA, owner, d, {});
    const doc = String(qr.v?.docId ?? "");
    await issueDoc(tidA, accA, doc);
    const t0 = new Date();
    const rr = await respond(tidA, accA, doc, true);
    await pump([tidA]);
    const deal = await dealRow(d);
    const acts = (await P.crmActivity.findMany({ where: { dealId: d, source: "AUTO" } })) as Any[];
    const notes = (await P.appNotification.findMany({ where: { tenantId: tidA, recipientUserId: userM, createdAt: { gte: t0 } } })) as Any[];
    const noPii = !notes.some((n) => PII.some((s) => s.length > 5 && j(n).includes(s)));
    chk("C2.7-S2.1", "customer ACCEPTS: the deal moves to pipeline.stageOnQuoteAcceptedId, ONE stage-history row is opened, ONE AUTO activity is written, and the deal OWNER gets ONE Thai notification with ids only (no name/phone/e-mail)",
      rr.ok && deal?.stageId === pQuote.st[2] && acts.length === 1 && thai(acts[0]?.title) && notes.length === 1 && thai(notes[0]?.title ?? notes[0]?.body) && noPii &&
        (await P.crmDealStageHistory.count({ where: { dealId: d, leftAt: null } })) === 1,
      "stage 3 · 1 activity · 1 notification", `${rd(rr)} stage=${deal?.stageId === pQuote.st[2]} acts=${acts.length} notes=${notes.length} pii=${!noPii}`);
  }
  {
    const ct = await mkContact(tidA, crmA, "คุณปฏิเสธ", userM);
    const d = await mkDeal(cA, ct, pQuote, { lines: LINES, ownerUserId: userM });
    const qr = await call(CRM.deals?.issueQuotation, cA, owner, d, {});
    const doc = String(qr.v?.docId ?? "");
    await issueDoc(tidA, accA, doc);
    await respond(tidA, accA, doc, false);
    await pump([tidA]);
    const deal = await dealRow(d);
    // a pipeline WITHOUT the two settings must not move anything and must not be an error
    const ct2 = await mkContact(tidA, crmA, "คุณไม่มีตั้งค่า", userM);
    const d2 = await mkDeal(cA, ct2, pPlain, { lines: LINES, ownerUserId: userM });
    const qr2 = await call(CRM.deals?.issueQuotation, cA, owner, d2, {});
    const doc2 = String(qr2.v?.docId ?? "");
    await issueDoc(tidA, accA, doc2);
    const rr2 = await respond(tidA, accA, doc2, true);
    const pumped = await pump([tidA]);
    const deal2 = await dealRow(d2);
    chk("C2.7-S2.2", "customer REJECTS ⇒ the deal moves to stageOnQuoteRejectedId (kind LOST) · a pipeline with neither setting ⇒ the deal does NOT move, the event still completes (no stuck queue) and nothing is written",
      deal?.stageId === pQuote.st[4] && deal?.kind === "LOST" && rr2.ok && pumped && deal2?.stageId === pPlain.st[0] &&
        (await P.crmActivity.count({ where: { dealId: d2, source: "AUTO" } })) === 0,
      "LOST · no move without settings", `rejected=${deal?.stageId === pQuote.st[4]}/${deal?.kind} plainStage=${deal2?.stageId === pPlain.st[0]} queueDrained=${pumped}`);
  }
  {
    // X4 — the same responded event twice, then 4× in parallel
    const ct = await mkContact(tidA, crmA, "คุณส่งซ้ำ", userM);
    const d = await mkDeal(cA, ct, pQuote, { lines: LINES, ownerUserId: userM });
    const qr = await call(CRM.deals?.issueQuotation, cA, owner, d, {});
    const doc = String(qr.v?.docId ?? "");
    await issueDoc(tidA, accA, doc);
    const t0 = new Date();
    await respond(tidA, accA, doc, true);
    const ev = await lastEvent(tidA, "account.quotation.responded", doc);
    const r1 = await consume(evtOf(ev ?? {}));
    const r2 = await consume(evtOf(ev ?? {}));
    const par = await Promise.all(Array.from({ length: 4 }, () => consume(evtOf(ev ?? {}))));
    const hist = await P.crmDealStageHistory.count({ where: { dealId: d } });
    const acts = await P.crmActivity.count({ where: { dealId: d, source: "AUTO" } });
    const notes = await P.appNotification.count({ where: { tenantId: tidA, recipientUserId: userM, createdAt: { gte: t0 } } });
    chk("C2.7-S2.3", "X4 the responded event delivered twice in a row and 4× in parallel ⇒ ONE move (stage history unchanged after the first), ONE activity, ONE notification",
      !!ev && r1.ok && r2.ok && par.every((r) => r.ok) && acts === 1 && notes === 1 && hist <= 2,
      "once", `ev=${!!ev} acts=${acts} notes=${notes} history=${hist} answers=${[r1, r2, ...par].map((r) => (r.ok ? "ok" : r.err.slice(0, 24))).join(",")}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — payment recorded / invoice paid → CrmDealPayment · paidSatang · wonValueSatang · lifecycle · company cache
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S3 · รับเงิน → paidSatang · wonValue · lifecycle ──");
  const mkCompanyDeal = async () => {
    const ct = await mkContact(tidA, crmA, "คุณจ่ายเงิน", userA);
    // ORACLE-EDIT (controller · 24 Sep): CrmCompany.partyId is mandatory (prisma/schema/crm.prisma:386 + @@unique([systemId, partyId])) — the fixture threw PrismaClientValidationError ⇒ C2.7-FATAL before S3
    const coName = pii(`บริษัท ${TAG}-${nx()}`);
    const coParty = await P.party.create({ data: { tenantId: tidA, name: coName, kind: "COMPANY" } });
    const co = await P.crmCompany.create({ data: { tenantId: tidA, systemId: crmA, partyId: coParty.id, name: coName, ownerUserId: userA } });
    await P.crmCompanyContact.create({ data: { tenantId: tidA, systemId: crmA, companyId: co.id, contactId: ct.id, isPrimary: true } }).catch(() => null);
    const d = await mkDeal(cA, ct, pQuote, { lines: LINES });
    await P.crmDeal.update({ where: { id: d }, data: { companyId: co.id } }).catch(() => null);
    const qr = await call(CRM.deals?.issueQuotation, cA, owner, d, {});
    const qd = String(qr.v?.docId ?? "");
    await issueDoc(tidA, accA, qd);
    await respond(tidA, accA, qd, true);
    const iv = await call(CRM.deals?.issueInvoice, cA, owner, d);
    const id = String(iv.v?.docId ?? "");
    await issueDoc(tidA, accA, id);
    await pump([tidA]);
    return { ct, co: co.id as string, d, qd, inv: id, grand: Number((await docRow(id))?.grandTotal ?? 0) };
  };
  const F = await mkCompanyDeal();
  {
    const part = Math.max(100, Math.round(F.grand * 0.4));
    const pr = await payDoc(tidA, accA, F.inv, part, finA);
    await pump([tidA]);
    const deal = await dealRow(F.d);
    const rows = await paysOf(F.d);
    const ct = await P.crmContact.findFirst({ where: { id: F.ct.id } });
    const co = await P.crmCompany.findFirst({ where: { id: F.co } });
    const wonF = await wonBasisOf(F.inv); // ORACLE-EDIT C2.7-S3.1/S9.5 (C5.4-C · won basis = before VAT · Q14) · was F.grand (VAT-incl grand total)
    chk("C2.7-S3.1", `a real partial payment of the deal's invoice ⇒ ONE CrmDealPayment(refType PAYMENT · refId = paymentId · status COUNTED · countedAt) · paidSatang = the amount · wonValueSatang = the invoice's won value on the ${WON_BASIS} basis (R-E.7 · ORACLE-EDIT C5.4-C) · contact lifecycleStage CUSTOMER · company cache updated`,
      pr.ok && pr.v?.ok === true && rows.length === 1 && rows[0]?.refType === "PAYMENT" && rows[0]?.status === "COUNTED" && !!rows[0]?.countedAt &&
        B(rows[0]?.satang) === part && B(deal?.paidSatang) === part && wonF > 0 && B(deal?.wonValueSatang) === wonF && ct?.lifecycleStage === "CUSTOMER" && B(co?.wonValueSatang) >= wonF,
      `1 COUNTED row · paid ${part} · won ${wonF} (${WON_BASIS}) · CUSTOMER`,
      `${rd(pr)} rows=${j(rows.map((r) => ({ t: r.refType, s: r.status, v: B(r.satang) })))} paid=${B(deal?.paidSatang)} won=${B(deal?.wonValueSatang)} life=${ct?.lifecycleStage} coWon=${B(co?.wonValueSatang)}`);
  }
  {
    const before = B((await dealRow(F.d))?.paidSatang);
    const rest = F.grand - before;
    const pr = await payDoc(tidA, accA, F.inv, rest, finA);
    await pump([tidA]);
    const deal = await dealRow(F.d);
    const doc = await docRow(F.inv);
    const rows = await paysOf(F.d);
    const sum = rows.filter((r) => r.status === "COUNTED").reduce((n, r) => n + B(r.satang), 0);
    chk("C2.7-S3.2", "the remaining payment makes the invoice PAID: paidSatang is the EXACT sum of the counted rows (no float, no double count) and `account.invoice.paid` adds nothing on top of `account.payment.recorded`",
      pr.ok && doc?.status === "PAID" && rows.length === 2 && B(deal?.paidSatang) === F.grand && sum === F.grand,
      `paid ${F.grand} · 2 rows`, `${rd(pr)} status=${doc?.status} rows=${rows.length} paid=${B(deal?.paidSatang)} Σcounted=${sum}`);
  }
  {
    // a document that belongs to NO deal, and a deal of another CRM system of the same tenant
    const stray = await mkDocReal(tidA, accA, "INVOICE", 500_00);
    const before = (await P.crmDealPayment.count({ where: { systemId: crmA } }).catch(() => 0)) as number;
    const pr = await payDoc(tidA, accA, stray.id, 100_00, finA);
    await pump([tidA]);
    const after = (await P.crmDealPayment.count({ where: { systemId: crmA } }).catch(() => 0)) as number;
    // chain: a RECEIPT whose sourceDocId points at the deal's invoice still counts on the deal (the event carries no sourceDocId)
    // ORACLE-EDIT C2.7-S3.3 (controller · 24 Sep): an issued RECEIPT is already PAID (account/service.ts ISSUE_STATUS.RECEIPT) ⇒ recordPayment refuses it and no
    //   account.payment.recorded is ever emitted — the intent (a payable document attributable only through the sourceDocId chain) needs a payable type
    const rc = await mkDocReal(tidA, accA, "DEPOSIT_RECEIPT", 200_00, { sourceDocId: F.inv });
    const paidBefore = B((await dealRow(F.d))?.paidSatang);
    const pr2 = await payDoc(tidA, accA, rc.id, 200_00, finA);
    await pump([tidA]);
    const paidAfter = B((await dealRow(F.d))?.paidSatang);
    chk("C2.7-S3.3", "a payment of a document that reaches NO deal writes nothing (negative) · a payment of a RECEIPT whose sourceDocId chain reaches the deal's invoice IS counted (positive control — the account event carries no sourceDocId, the bridge must walk the chain through docLinkInfo)",
      pr.ok && after === before && pr2.ok && paidAfter === paidBefore + 200_00,
      "0 rows for the stray · +20000 for the chain", `${rd(pr)} rows ${before}→${after} chain=${rd(pr2)} paid ${paidBefore}→${paidAfter}`);
  }
  {
    // odd satang, three payments — the sum must be exact (no rounding, no float)
    const G = await mkCompanyDeal();
    const parts = [33_33, 33_33, 33_34];
    for (const p of parts) await payDoc(tidA, accA, G.inv, p, finA);
    await pump([tidA]);
    const deal = await dealRow(G.d);
    const rows = await paysOf(G.d);
    const sql = (await P.$queryRawUnsafe(`SELECT COALESCE(SUM("satang"),0)::bigint AS s FROM "CrmDealPayment" WHERE "dealId" = $1 AND "status" = 'COUNTED'`, G.d).catch(() => [{ s: 0 }])) as Any[];
    const want = parts.reduce((n, x) => n + x, 0); // 100000 satang = ฿1,000.00 exactly
    chk("C2.7-S3.4", `three payments of 333.33 / 333.33 / 333.34 baht: paidSatang = ${want} satang exactly, equal to the bigint SUM computed by the database (R-E.8) — integer satang, never a float`,
      B(deal?.paidSatang) === want && rows.filter((r) => r.status === "COUNTED").length === 3 && Number(sql[0]?.s ?? -1) === want,
      `${want} satang`, `paid=${B(deal?.paidSatang)} rows=${rows.length} sqlSum=${String(sql[0]?.s)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — voided → reverse only what was counted + the "document voided" flag
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S4 · ยกเลิกการชำระ / ยกเลิกเอกสาร ──");
  {
    const H = await mkCompanyDeal();
    const amt = Math.max(100, Math.round(H.grand * 0.5));
    const pr = await payDoc(tidA, accA, H.inv, amt, finA);
    await pump([tidA]);
    const paid1 = B((await dealRow(H.d))?.paidSatang);
    const payId = String(pr.v?.paymentId ?? "");
    const vr = await voidPay(tidA, accA, H.inv, payId, `ยกเลิกทดสอบ ${TAG}`);
    await pump([tidA]);
    const paid2 = B((await dealRow(H.d))?.paidSatang);
    const row = (await paysOf(H.d)).find((r) => r.refId === payId);
    // re-void / redeliver ⇒ no further change
    const ev = await lastEvent(tidA, "account.payment.voided", payId);
    await consume(evtOf(ev ?? {}));
    await consume(evtOf(ev ?? {}));
    await Promise.all([consume(evtOf(ev ?? {})), consume(evtOf(ev ?? {}))]);
    const paid3 = B((await dealRow(H.d))?.paidSatang);
    chk("C2.7-S4.1", "voiding a COUNTED payment marks its row REVERSED (reversedAt) and subtracts EXACTLY that amount once · redelivering the void twice and twice in parallel changes nothing more (M10: reverse only what was counted)",
      pr.ok && !!payId && vr.ok && paid1 === amt && paid2 === 0 && row?.status === "REVERSED" && !!row?.reversedAt && paid3 === 0,
      "paid → 0, once", `paid ${paid1}→${paid2}→${paid3} row=${row?.status}/${!!row?.reversedAt} void=${rd(vr)}`);
  }
  {
    const I = await mkCompanyDeal();
    const t0 = new Date();
    const vr = await call(accSvc.voidDocument, tidA, accA, I.inv, `ยกเลิกใบแจ้งหนี้ ${TAG}`);
    await pump([tidA]);
    const deal = await dealRow(I.d);
    const tags: string[] = Array.isArray(deal?.tags) ? deal.tags : [];
    const acts = (await P.crmActivity.findMany({ where: { dealId: I.d, source: "AUTO", createdAt: { gte: t0 } } })) as Any[];
    // redelivery must not duplicate the tag or the activity
    const ev = await lastEvent(tidA, "account.document.voided", I.inv);
    await consume(evtOf(ev ?? {}));
    await Promise.all([consume(evtOf(ev ?? {})), consume(evtOf(ev ?? {}))]);
    const deal2 = await dealRow(I.d);
    const tags2: string[] = Array.isArray(deal2?.tags) ? deal2.tags : [];
    const acts2 = await P.crmActivity.count({ where: { dealId: I.d, source: "AUTO", createdAt: { gte: t0 } } });
    const money = await call(PAY.dealMoney, cA, owner, I.d);
    chk("C2.7-S4.2", `a voided document flags the deal exactly once: tag "${VOID_TAG}" appears once, ONE AUTO activity (Thai, no PII), dealMoney().documentVoided true — redelivery adds nothing`,
      (vr.ok || vr.v?.ok === true) && tags.filter((t) => t === VOID_TAG).length === 1 && acts.length === 1 && thai(acts[0]?.title) &&
        tags2.filter((t) => t === VOID_TAG).length === 1 && acts2 === 1 && money.v?.documentVoided === true,
      "1 tag · 1 activity", `void=${rd(vr)} tags=${j(tags)} acts=${acts.length}→${acts2} documentVoided=${money.ok ? money.v?.documentVoided : rd(money)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S5 — POS: link a sale to a deal · count on pos.sale.paid · reverse on pos.sale.voided · the deal select
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S5 · POS ⇄ ดีล ──");
  {
    const ct = await mkContact(tidA, crmA, "คุณหน้าร้าน", userA);
    const d = await mkDeal(cA, ct, pQuote, { value: 900_00 });
    const s = await sell(tidA, unitA, posA, 400_00);
    const saleId = s.saleId;
    // the sale is already PAID when the cashier's action links it ⇒ linkSaleToDeal has to count it (see CONTRACT A)
    const lr = await call(PAY.linkSaleToDeal, cA, owner, { dealId: d, saleId });
    const rows = await paysOf(d);
    const deal = await dealRow(d);
    const again = await call(PAY.linkSaleToDeal, cA, owner, { dealId: d, saleId });
    const rows2 = await paysOf(d);
    const foreignSale = await sell(tidB, unitB, posB, 100_00);
    const xSale = await call(PAY.linkSaleToDeal, cA, owner, { dealId: d, saleId: foreignSale.saleId || "-" });
    const xDeal = await call(PAY.linkSaleToDeal, cB, owner, { dealId: d, saleId });
    chk("C2.7-S5.1", "linkSaleToDeal writes ONE CrmDealPayment(POS_SALE · refId = saleId · satang = the bill's grand total) and — because the bill is already PAID when the cashier's action runs — counts it in the same transaction · calling it twice keeps one row · a sale of another tenant or a deal of another system ⇒ NOT_FOUND (X1)",
      lr.ok && rows.length === 1 && rows[0]?.refType === "POS_SALE" && B(rows[0]?.satang) === s.grand && rows[0]?.status === "COUNTED" && B(deal?.paidSatang) === s.grand &&
        rows2.length === 1 && refused(xSale, "NOT_FOUND") && refused(xDeal, "NOT_FOUND"),
      "1 row · counted once · 404 across scopes", `${rd(lr)} rows=${j(rows.map((r) => ({ t: r.refType, s: r.status, v: B(r.satang) })))} twice=${rows2.length} paid=${B(deal?.paidSatang)} foreignSale=${rd(xSale)} foreignDeal=${rd(xDeal)}`);
  }
  {
    // the other order: the LINK exists first (deal picked before confirming) and `pos.sale.paid` does the counting
    const ct = await mkContact(tidA, crmA, "คุณผูกก่อน", userA);
    const d = await mkDeal(cA, ct, pQuote, { value: 900_00 });
    const s = await sell(tidA, unitA, posA, 250_00);
    const saleId = s.saleId;
    await P.posSale.update({ where: { id: saleId }, data: { status: "PAID" } }).catch(() => null);
    await P.crmDealPayment?.create?.({ data: { tenantId: tidA, systemId: crmA, dealId: d, refType: "POS_SALE", refId: saleId, satang: BigInt(s.grand), status: "LINKED" } }).catch(() => null);
    const ev = await lastEvent(tidA, "pos.sale.paid", saleId);
    const r1 = await consume(evtOf(ev ?? {}));
    const paid1 = B((await dealRow(d))?.paidSatang);
    const r2 = await consume(evtOf(ev ?? {}));
    const par = await Promise.all(Array.from({ length: 4 }, () => consume(evtOf(ev ?? {}))));
    const paid2 = B((await dealRow(d))?.paidSatang);
    const rows = await paysOf(d);
    // a sale with no link at all ⇒ nothing (negative, control above)
    const s2 = await sell(tidA, unitA, posA, 700_00);
    const ev2 = await lastEvent(tidA, "pos.sale.paid", s2.saleId);
    const before = (await P.crmDealPayment.count({ where: { systemId: crmA } }).catch(() => 0)) as number;
    await consume(evtOf(ev2 ?? {}));
    const after = (await P.crmDealPayment.count({ where: { systemId: crmA } }).catch(() => 0)) as number;
    chk("C2.7-S5.2", "the pos.sale.paid consumer counts a LINKED row exactly once (twice in a row + 4× in parallel ⇒ paidSatang counted once, status COUNTED) · a paid bill with no linked deal writes nothing",
      r1.ok && r2.ok && par.every((r) => r.ok) && paid1 === s.grand && paid2 === s.grand && rows.length === 1 && rows[0]?.status === "COUNTED" && after === before,
      "counted once · nothing for unlinked bills", `paid ${paid1}/${paid2} rows=${rows.length}:${rows[0]?.status} unlinked ${before}→${after}`);
  }
  {
    // void before paid (LINKED, never counted) vs void after paid
    const ct = await mkContact(tidA, crmA, "คุณยกเลิกบิล", userA);
    const dNever = await mkDeal(cA, ct, pQuote, { value: 900_00 });
    const sN = await sell(tidA, unitA, posA, 120_00);
    const saleN = sN.saleId;
    await P.crmDealPayment?.create?.({ data: { tenantId: tidA, systemId: crmA, dealId: dNever, refType: "POS_SALE", refId: saleN, satang: BigInt(sN.grand), status: "LINKED" } }).catch(() => null);
    const vN = await call(POS.voidSale, tidA, unitA, saleN);
    await pump([tidA]);
    const dealN = await dealRow(dNever);
    const rowN = (await paysOf(dNever)).find((r) => r.refId === saleN);
    const dPaid = await mkDeal(cA, ct, pQuote, { value: 900_00 });
    const sP = await sell(tidA, unitA, posA, 310_00);
    const saleP = sP.saleId;
    await call(PAY.linkSaleToDeal, cA, owner, { dealId: dPaid, saleId: saleP });
    await pump([tidA]);
    const paidBefore = B((await dealRow(dPaid))?.paidSatang);
    await call(POS.voidSale, tidA, unitA, saleP);
    await pump([tidA]);
    const paidAfter = B((await dealRow(dPaid))?.paidSatang);
    const evV = await lastEvent(tidA, "pos.sale.voided", saleP);
    await Promise.all([consume(evtOf(evV ?? {})), consume(evtOf(evV ?? {}))]);
    const paidAfter2 = B((await dealRow(dPaid))?.paidSatang);
    const rowP = (await paysOf(dPaid)).find((r) => r.refId === saleP);
    chk("C2.7-S5.3", "void BEFORE the bill was ever counted (status LINKED) ⇒ the row becomes REVERSED and NOTHING is subtracted (paidSatang stays 0) · void AFTER it was counted ⇒ subtracted exactly once, and a redelivered void changes nothing",
      vN.ok && B(dealN?.paidSatang) === 0 && rowN?.status === "REVERSED" && paidBefore === sP.grand && paidAfter === 0 && paidAfter2 === 0 && rowP?.status === "REVERSED",
      "0 subtracted · then exactly once", `never: paid=${B(dealN?.paidSatang)} row=${rowN?.status} · counted: ${paidBefore}→${paidAfter}→${paidAfter2} row=${rowP?.status}`);
  }
  {
    // the deal select of the sell screen + auto-WON when paid ≥ value
    const ct = await mkContact(tidA, crmA, "คุณเลือกดีล", userS);
    const mine = await mkDeal(cA, ct, pQuote, { value: 500_00, ownerUserId: userS });
    const other = await mkDeal(cA, ct, pQuote, { value: 500_00, ownerUserId: userS2 });
    // no visibility settings are written: a STAFF actor's default scope is "own" (C1.7) — the cashier must not see userS2's deal
    const listOwner = await call(PAY.openDealsForParty, cA, owner, ct.partyId);
    const listCashier = await call(PAY.openDealsForParty, cA, cashier, ct.partyId);
    const noKeys = { userId: userS, role: "STAFF", unitAccess: ["*"], permissions: {} as Record<string, unknown> };
    const listNoKey = await call(PAY.openDealsForParty, cA, noKeys, ct.partyId);
    const ids = (r: Res) => (Array.isArray(r.v) ? r.v.map((x: Any) => String(x.id)) : []);
    // auto-WON: a pipeline with autoWonOnPaid, paid in full through POS
    const ctW = await mkContact(tidA, crmA, "คุณจ่ายครบ", userA);
    const dW = await mkDeal(cA, ctW, pAutoWon, { value: 300_00 });
    const sW = await sell(tidA, unitA, posA, 300_00);
    await call(PAY.linkSaleToDeal, cA, owner, { dealId: dW, saleId: sW.saleId });
    await pump([tidA]);
    const dealW = await dealRow(dW);
    const auditW = await P.auditLog.count({ where: { tenantId: tidA, targetId: dW, action: { in: ["crm.deal.won.auto", "crm.deal.move"] } } });
    const uiSrc = read(POS_UI);
    const actSrc = read(POS_ACT);
    chk("C2.7-S5.4", "openDealsForParty lists only OPEN deals the actor may see (owner: both · cashier with own-only visibility: only his own · an actor without crm.deal.read: [] and never an exception) · a fully paid deal on an autoWonOnPaid pipeline becomes WON with an audit row · the sell screen renders the deal select next to the member select",
      ids(listOwner).length >= 2 && ids(listCashier).includes(mine) && !ids(listCashier).includes(other) && listNoKey.ok && ids(listNoKey).length === 0 &&
        dealW?.kind === "WON" && auditW >= 1 && /pos-deal-select/.test(uiSrc) && /pos-member-select/.test(uiSrc) && /dealId/.test(actSrc),
      "scoped list · auto-WON · testids", `owner=${ids(listOwner).length} cashier=${j(ids(listCashier))} mine=${mine} noKey=${rd(listNoKey)}:${ids(listNoKey).length} won=${dealW?.kind} audit=${auditW} ui=${/pos-deal-select/.test(uiSrc)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — autoInvoiceOnWon
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S6 · autoInvoiceOnWon ──");
  {
    const ct = await mkContact(tidA, crmA, "คุณชนะแล้วออกบิล", userA);
    const d = await mkDeal(cA, ct, pAutoInv, { lines: LINES });
    const mv = await call(CRM.deals?.moveDeal, cA, owner, d, { stageId: pAutoInv.st[3] });
    await pump([tidA]);
    const deal = await dealRow(d);
    const invoices = await P.accountDocument.count({ where: { systemId: accA, docType: "INVOICE", refType: "CrmDeal", refId: d } });
    const conv = await P.accountDocument.count({ where: { systemId: accA, docType: "INVOICE", sourceDocId: deal?.quotationDocId ?? "-" } });
    const audits = await P.auditLog.count({ where: { tenantId: tidA, targetId: d, action: { in: ["crm.deal.invoice.auto", "crm.deal.invoice"] } } });
    // moving to WON again (reopen → win) and a redelivered crm.deal.won must not issue a second invoice
    const ev = await lastEvent(tidA, "crm.deal.won", d);
    if (ev) { await consume(evtOf(ev)); await Promise.all([consume(evtOf(ev)), consume(evtOf(ev))]); }
    const invoices2 = (await P.accountDocument.count({ where: { systemId: accA, docType: "INVOICE", refType: "CrmDeal", refId: d } })) + (await P.accountDocument.count({ where: { systemId: accA, docType: "INVOICE", sourceDocId: deal?.quotationDocId ?? "-" } }));
    chk("C2.7-S6.1", "a deal entering WON on an autoInvoiceOnWon pipeline gets exactly ONE invoice (invoiceDocId stored, audited) and redelivering crm.deal.won twice / twice in parallel does not issue a second one",
      mv.ok && !!deal?.invoiceDocId && invoices + conv === 1 && audits >= 1 && invoices2 === 1,
      "1 invoice", `${rd(mv)} invoiceDocId=${!!deal?.invoiceDocId} docs=${invoices}+${conv} after=${invoices2} audits=${audits}`);
  }
  {
    const ct = await mkContact(tidA, crmA, "คุณไม่ออกบิลอัตโนมัติ", userA);
    const d = await mkDeal(cA, ct, pQuote, { lines: LINES });
    await call(CRM.deals?.moveDeal, cA, owner, d, { stageId: pQuote.st[3] });
    await pump([tidA]);
    const deal = await dealRow(d);
    const invoices = await P.accountDocument.count({ where: { systemId: accA, docType: "INVOICE", refType: "CrmDeal", refId: d } });
    // accounting unavailable (no link) must not block the WIN — the invoice is an extra
    const ctL = await mkContact(tidL, crmL, "คุณห้องทดลอง", userA);
    const dL = await mkDeal(cL, ctL, pL, { lines: LINES });
    await P.accountSystemLink.deleteMany({ where: { tenantId: tidL } }).catch(() => null);
    await P.crmPipeline.update({ where: { id: pL.id }, data: { autoInvoiceOnWon: true } }).catch(() => null);
    const mvL = await call(CRM.deals?.moveDeal, cL, owner, dL, { stageId: pL.st[3] });
    await pump([tidL]);
    const dealL = await dealRow(dL);
    await linkAcc(tidL, accL, crmL);
    chk("C2.7-S6.2", "autoInvoiceOnWon false ⇒ NO invoice is issued on WON (negative; S6.1 is the positive control) · with the pipeline switch ON but accounting not linked, the deal still becomes WON and only the invoice is missing (the money path never blocks the sale)",
      deal?.kind === "WON" && !deal?.invoiceDocId && invoices === 0 && mvL.ok && dealL?.kind === "WON" && !dealL?.invoiceDocId,
      "won without invoice", `plain: kind=${deal?.kind} invoice=${deal?.invoiceDocId ?? "none"} docs=${invoices} · unlinked: ${rd(mvL)} kind=${dealL?.kind}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — the invariants the POS / account / kanban / member regression suites protect (the suites themselves are D4)
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S7 · ถอยหลัง: สิ่งที่ต้องไม่เปลี่ยน ──");
  {
    const posSvc = read(POS_SVC);
    const fn = /export async function createSale\([\s\S]*?\n}\n/.exec(posSvc)?.[0] ?? "";
    const emits = /type: "pos\.sale\.paid"[\s\S]{0,200}idempotencyKey: `PosSale#\$\{sale\.id\}#PAID`/.test(posSvc);
    chk("C2.7-S7.1", "`pos/service.ts` is untouched by C2.7: `createSale` still owns the money transaction and still emits `pos.sale.paid` with the key `PosSale#<id>#PAID` (no dealId written inside the tx) [static]",
      fn.length > 0 && emits && !/crm/i.test(fn), "unchanged", `createSaleFound=${fn.length > 0} emitOk=${emits} mentionsCrm=${/crm/i.test(fn)}`);
  }
  {
    const accSrc = read(ACC_SVC);
    const rp = /export async function recordPayment\([\s\S]*?\n}\n/.exec(accSrc)?.[0] ?? "";
    const vp = /export async function voidPayment\([\s\S]*?\n}\n/.exec(accSrc)?.[0] ?? "";
    chk("C2.7-S7.2", "account transactions are untouched: `recordPayment` / `voidPayment` contain no CRM call (CRM only listens to their events) and still emit `account.payment.recorded` / `account.payment.voided` inside the transaction [static]",
      rp.length > 0 && vp.length > 0 && !/modules\/crm/.test(rp) && !/modules\/crm/.test(vp) && /account\.payment\.recorded/.test(rp),
      "no CRM inside", `recordPayment=${rp.length > 0}/${/modules\/crm/.test(rp)} voidPayment=${vp.length > 0}/${/modules\/crm/.test(vp)}`);
  }
  {
    const cols = (await P.$queryRawUnsafe(`select column_name from information_schema.columns where table_schema='public' and table_name in ('PosSale','AccountDocument','AccountDocumentPayment')`).catch(() => [])) as Any[];
    const names = cols.map((c) => String(c.column_name));
    chk("C2.7-S7.3", "no column was added to PosSale / AccountDocument / AccountDocumentPayment for this work order (C29 · R-C.1): the link lives in CrmDealPayment only [information_schema]",
      !names.includes("dealId") && !names.includes("crmDealId"), "no deal column", `suspicious=${names.filter((n) => /deal/i.test(n)).join(",") || "-"}`);
  }
  {
    const uiSrc = read(POS_UI);
    const actSrc = read(POS_ACT);
    const memberSelect = /pos-member-select/.test(uiSrc);
    const memberPayload = /memberId/.test(actSrc) && /memberChoices/.test(actSrc);
    const saleWrapped = /linkSaleToDeal/.test(actSrc) && /(catch|logOps|WARN)/.test(actSrc);
    chk("C2.7-S7.4", "the sell screen keeps its member select and its member payload (memberId + memberChoices), and the new `linkSaleToDeal` call after a successful sale is WRAPPED so that a CRM failure never fails the bill (the customer has already paid) [static]",
      memberSelect && memberPayload && saleWrapped, "member intact · CRM call guarded",
      `memberSelect=${memberSelect} memberPayload=${memberPayload} guarded=${saleWrapped}`);
  }
  {
    const posLine = /"pos\.sale\.paid":([^\n]*)/.exec(read(CONS_FILE))?.[1] ?? "";
    const voidLine = /"pos\.sale\.voided":([\s\S]{0,400}?)\n\s*(\/\/|")/.exec(read(CONS_FILE))?.[1] ?? "";
    const keptPaid = ["posSalePaid", "stampFromSale", "memberSaleBridge"].every((s) => posLine.includes(s));
    const keptVoid = ["posSaleVoided", "kanbanBridge", "stampVoidForSale", "memberSaleBridge"].every((s) => voidLine.includes(s));
    chk("C2.7-S7.5", "the consumer chains of `pos.sale.paid` / `pos.sale.voided` keep every existing step (accounting · stamps · kanban · member bridge) with the CRM step only APPENDED [static]",
      keptPaid && keptVoid, "all previous steps kept", `paid=${keptPaid} voided=${keptVoid} paidLine=${cut(posLine, 120)}`);
  }
  {
    // compose contract, proven by execution: the CRM extra throws ⇒ the base steps of pos.sale.paid still happened
    const ctL = await mkContact(tidL, crmL, "คุณคอมโพส", userA);
    const dL = await mkDeal(cL, ctL, pL, { value: 500_00 });
    const sL = await sell(tidL, unitL, posL, 150_00);
    // ORACLE-EDIT C2.7-S7.6 (controller · 24 Sep): pos.createSale schedules a tenant-unscoped background drain — settle it before the trigger lab so the hand-delivered event is the only delivery that can count
    await pump([tidL]);
    const saleL = sL.saleId;
    await P.crmDealPayment?.create?.({ data: { tenantId: tidL, systemId: crmL, dealId: dL, refType: "POS_SALE", refId: saleL, satang: BigInt(sL.grand), status: "LINKED" } }).catch(() => null);
    const ev = await lastEvent(tidL, "pos.sale.paid", saleL);
    const t0 = new Date(Date.now() - 500);
    let r: Res = { ok: false, v: undefined, err: "not run", code: "", msg: "", name: "" };
    try { await failWrites(tidL, "CrmDealPayment", "INSERT OR UPDATE"); r = await consume(evtOf(ev ?? {})); } finally { await dropTriggers(); }
    const accDocs = await P.accountDocument.count({ where: { tenantId: tidL, systemId: accL } });
    const warns = (await P.opsEvent.findMany({ where: { tenantId: tidL, createdAt: { gte: t0 } } }).catch(() => [])) as Any[];
    const paidL = B((await dealRow(dL))?.paidSatang);
    // and the other direction: the accounting base fails ⇒ the CRM extra still runs
    let r2: Res = { ok: false, v: undefined, err: "not run", code: "", msg: "", name: "" };
    const s2 = await sell(tidL, unitL, posL, 220_00);
    await pump([tidL]);  // same reason as above (the second bill of this lab case)
    const sale2 = s2.saleId;
    await P.crmDealPayment?.create?.({ data: { tenantId: tidL, systemId: crmL, dealId: dL, refType: "POS_SALE", refId: sale2, satang: BigInt(s2.grand), status: "LINKED" } }).catch(() => null);
    const ev2 = await lastEvent(tidL, "pos.sale.paid", sale2);
    try { await failWrites(tidL, "AccountDocument", "INSERT OR UPDATE"); r2 = await consume(evtOf(ev2 ?? {})); } finally { await dropTriggers(); }
    const paidAfter = B((await dealRow(dL))?.paidSatang);
    chk("C2.7-S7.6", "compose contract, proven by execution: the CRM money extra THROWS ⇒ the event is not failed by it, a WARN is logged and the accounting side of the bill still happened · the accounting base FAILS ⇒ the CRM extra still counted the linked sale",
      r.ok && warns.length >= 1 && paidL === 0 && accDocs >= 0 && paidAfter === s2.grand,
      "extra fails silently · base failure does not starve the extra", `extraThrew=${r.ok ? "event ok" : r.err.slice(0, 40)} warns=${warns.length} paidAfterExtraFail=${paidL} baseFail=${r2.ok ? "event ok" : r2.err.slice(0, 40)} paidAfterBaseFail=${paidAfter}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — "ต่างจากใบเสนอราคา" badge + the deal link on the account document page
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S8 · ป้ายต่างจากใบเสนอราคา · ลิงก์ดีลบนเอกสาร ──");
  {
    const ct = await mkContact(tidA, crmA, "คุณแก้บรรทัด", userA);
    const d = await mkDeal(cA, ct, pQuote, { lines: LINES });
    const qr = await call(CRM.deals?.issueQuotation, cA, owner, d, {});
    const before = await call(CRM.deals?.quotationDiffers, cA, owner, d);
    const d360a = await call(CRM.deals?.getDeal360, cA, owner, d);
    await call(CRM.deals?.setLines ?? CRM.deals?.lines?.set, cA, owner, d, { lines: [...LINES, { name: "เพิ่มรายการ", qty: 1, unitPriceSatang: 500_00, vatRateBp: 700 }] });
    const after = await call(CRM.deals?.quotationDiffers, cA, owner, d);
    const d360b = await call(CRM.deals?.getDeal360, cA, owner, d);
    chk("C2.7-S8.1", "\"ต่างจากใบเสนอราคา\": right after issuing, quotationDiffers is false and Deal360.quotationDiffers is false (positive control) · after a line is added it is true on both",
      qr.ok && before.ok && before.v === false && d360a.v?.quotationDiffers === false && after.ok && after.v === true && d360b.v?.quotationDiffers === true,
      "false → true", `issue=${rd(qr)} before=${before.ok ? before.v : before.err} dto=${d360a.v?.quotationDiffers} after=${after.ok ? after.v : after.err} dtoAfter=${d360b.v?.quotationDiffers}`);
    const inv = await call(CRM.deals?.issueInvoice, cA, owner, d);
    chk("C2.7-S8.2", "while the lines differ from the issued quotation, issueInvoice is refused with a Thai reason that does not blame the user (C1.5 behaviour kept) — and re-issuing the quotation clears the badge",
      refused(inv, "VALIDATION") && (await call(CRM.deals?.issueQuotation, cA, owner, d, {})).ok === true,
      "refused then cleared", `invoice=${rd(inv)}`, "MAJOR");
  }
  {
    const dfd = await call(PAY.dealForDoc, tidA, invDocId, owner);
    const dfdForeign = await call(PAY.dealForDoc, tidB, invDocId, owner);
    const dfdNone = await call(PAY.dealForDoc, tidA, `${TAG}-nope`, owner);
    const dfdBlind = await call(PAY.dealForDoc, tidA, invDocId, { userId: userS2, role: "STAFF", unitAccess: ["*"], permissions: {} });
    const pageFiles = walk("src/app/app/sys/[id]/account").filter((f) => /acc-doc-crm-deal|dealForDoc/.test(read(f)));
    let invRows: Any[] = [];
    try { invRows = JSON.parse(read(INVENTORY) || "{}").rows ?? []; } catch { invRows = []; }
    // ORACLE-EDIT (oracle author · 24 Sep · ruling round 2): every testid this work order adds must be registered with
    //   wo "C2.7" — the sell screen's deal control (`pos-deal-select` · `pos-deal-hint`) as well as the document link,
    //   otherwise the visual/parity runner never opens the new POS control at all.
    const NEED_TESTIDS = ["acc-doc-crm-deal", "pos-deal-select", "pos-deal-hint"];
    // ORACLE-EDIT C2.7-S8.3 (sweep 27 Sep, C4.1 registry policy): a wo C2.7 row is required for each of these that sits on an interactive
    //   element per the F14.1 scanner (absent ⇒ strict); a non-interactive one (the `pos-deal-hint` <span>, row removed by C4.1) must
    //   still EXIST as a data-testid in the account document page / the POS sell screen
    const tidSrc = [...pageFiles.map(read), read(POS_UI)].join("\n");
    const invMissing = NEED_TESTIDS.filter((t) => needsRegistryRow(t, tidSrc) && !invRows.some((r: Any) => r?.wo === "C2.7" && String(r?.testid).includes(t)));
    const nonControl = NEED_TESTIDS.filter((t) => !needsRegistryRow(t, tidSrc));
    const invHas = invMissing.length === 0;
    chk("C2.7-S8.3", "dealForDoc(tenantId, docId, actor): the deal of the invoice for the owner · null for another tenant, for an unknown document and for an actor who cannot see the deal · the account document page renders the \"ดีล\" link · crm-ui-inventory.json carries a wo C2.7 row for EVERY new testid (acc-doc-crm-deal · pos-deal-select · pos-deal-hint)",
      dfd.ok && dfd.v?.dealId === dQuote && dfdForeign.v === null && dfdNone.v === null && dfdBlind.v === null && pageFiles.length > 0 && invHas,
      "deal · 3× null · page + inventory (3 testids)", `own=${dfd.ok ? dfd.v?.dealId === dQuote : dfd.err} foreign=${j(dfdForeign.v)} unknown=${j(dfdNone.v)} blind=${j(dfdBlind.v)} page=${pageFiles.join(",") || "-"} inventoryMissing=${invMissing.join(",") || "-"} nonControl=${nonControl.join(",") || "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — CONTROLLER RULING ROUND 2 (24 Sep · Fable · binding): B1 one bill = one deal · B2 the gate may stop
  //   COUNTING but never REVERSING · SF-1 a voided document reverses only ITS OWN rows · SF-2 withholding tax
  //   (`DOC_SETTLE#<docId>`) · SF-3 the won value read under the lock · SF-4 one document claimed by several deals ·
  //   SF-5 only INVOICE / DEPOSIT_RECEIPT are attributable · N1 no deal select without `crm.deal.update` ·
  //   N3 a gift-card bill is not deal revenue · N4 a pre-existing LINKED row that gets counted emits `crm.deal.updated`
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── S9 · มติรอบ 2: บิลเดียวดีลเดียว · ประตูห้ามหยุดการถอนคืน · ภาษีหัก ณ ที่จ่าย · เอกสารซ้ำดีล ──");
  /** a refusal that is NOT a missing function: Thai, never blaming the user (the code differs per gate — see the act string) */
  const gateRefused = (r: Res) => !r.ok && r.code !== "MISSING_FUNCTION" && thai(r.msg) && !blames(r.msg);
  /** the money rows of one POS bill / one payment, whichever deal they ended up on (B1: the sweep must be per ref, not per deal) */
  const rowsOfRef = async (sysId: string, refType: string, refId: string): Promise<Any[]> => {
    try { return (await P.crmDealPayment.findMany({ where: { systemId: sysId, refType, refId }, orderBy: { createdAt: "asc" } })) ?? []; } catch { return []; }
  };
  /** a real account document that belongs to a deal the way C1.5 stores it (refSystemId/refType/refId + invoiceDocId) */
  const mkDocForDeal = async (tid: string, accSys: string, crmSys: string, dealId: string, docType: string, satang: number, extra: Record<string, unknown> = {}) => {
    const doc = await mkDocReal(tid, accSys, docType, satang, extra);
    if (doc.id) {
      await P.accountDocument.update({ where: { id: doc.id }, data: { refSystemId: crmSys, refType: "CrmDeal", refId: dealId } }).catch(() => null);
      await P.crmDeal.update({ where: { id: dealId }, data: { invoiceDocId: doc.id } }).catch(() => null);
    }
    return doc;
  };
  {
    // B1 — one bill is ONE piece of money: it may be counted by exactly one deal, and the void must give all of it back
    const ct = await mkContact(tidA, crmA, "คุณบิลเดียวดีลเดียว", userA);
    const dA = await mkDeal(cA, ct, pQuote, { value: 900_00 });
    await sleep(30);
    const dB = await mkDeal(cA, ct, pQuote, { value: 900_00 });
    const s1 = await sell(tidA, unitA, posA, 260_00);
    await pump([tidA]);
    const l1 = await call(PAY.linkSaleToDeal, cA, owner, { dealId: dA, saleId: s1.saleId });
    const l2 = await call(PAY.linkSaleToDeal, cA, owner, { dealId: dB, saleId: s1.saleId });
    const rowsB = await paysOf(dB);
    const paidB0 = B((await dealRow(dB))?.paidSatang);
    // two cashiers pressing "ผูกดีล" for the same bill on two different deals at the same instant (the unique key is per
    // deal, so only a lock on the BILL can decide this): exactly one wins, exactly one row exists for that bill
    const s2 = await sell(tidA, unitA, posA, 130_00);
    await pump([tidA]);
    const par = await Promise.all([
      call(PAY.linkSaleToDeal, cA, owner, { dealId: dA, saleId: s2.saleId }),
      call(PAY.linkSaleToDeal, cA, owner, { dealId: dB, saleId: s2.saleId }),
    ]);
    const parOk = par.filter((r) => r.ok).length;
    const parRows = await rowsOfRef(crmA, "POS_SALE", s2.saleId);
    const paidBoth = B((await dealRow(dA))?.paidSatang) + B((await dealRow(dB))?.paidSatang);
    // both bills voided ⇒ every row of those bills is REVERSED once and the money over BOTH deals is back to zero
    await call(POS.voidSale, tidA, unitA, s1.saleId);
    await call(POS.voidSale, tidA, unitA, s2.saleId);
    await pump([tidA]);
    const ev1 = await lastEvent(tidA, "pos.sale.voided", s1.saleId);
    await consume(evtOf(ev1 ?? {}));
    await Promise.all([consume(evtOf(ev1 ?? {})), consume(evtOf(ev1 ?? {}))]);
    const after = [...(await rowsOfRef(crmA, "POS_SALE", s1.saleId)), ...(await rowsOfRef(crmA, "POS_SALE", s2.saleId))];
    const paidEnd = B((await dealRow(dA))?.paidSatang) + B((await dealRow(dB))?.paidSatang);
    chk("C2.7-S9.1", "B1 — a PAID bill counted on deal A cannot be linked to deal B: the second linkSaleToDeal is refused (CONFLICT · Thai · B untouched) and two cashiers linking the SAME bill to two deals at the same instant produce exactly ONE row · voiding the bills reverses each row once and the money summed over BOTH deals is 0",
      l1.ok && l1.v?.counted === true && refused(l2, "CONFLICT") && rowsB.length === 0 && paidB0 === 0 &&
        parOk === 1 && parRows.length === 1 && paidBoth === s1.grand + s2.grand &&
        after.length === 2 && after.every((r) => r.status === "REVERSED" && !!r.reversedAt) && paidEnd === 0,
      "1 deal per bill · 0 after the void",
      `link=${rd(l1)}:${l1.v?.counted} second=${rd(l2)} B=${rowsB.length}/${paidB0} parallelOk=${parOk} parallelRows=${parRows.length} paid=${paidBoth}→${paidEnd} rows=${j(after.map((r) => r.status))}`);
  }
  {
    // B2 — the gate (uiVersion / bridgesEnabled) may stop COUNTING, but a shop that closes the bridge (or falls back to
    //   v1) after money was counted must still get it back: otherwise the deal carries phantom money for ever.
    //   The whole case runs in the LAB tenant so that flipping the gate can never disturb another check.
    let closedLink: Res = { ok: false, v: undefined, err: "not run", code: "", msg: "", name: "" };
    let closedRows = -1;
    let posClosed = [-1, -1];
    let posV1 = [-1, -1];
    let accClosed = [-1, -1];
    let accV1 = [-1, -1];
    let gateBack = false;
    try {
      const ctG = await mkContact(tidL, crmL, "คุณประตูสะพาน", userA);
      // (1) v2 but the bridge is closed ⇒ linking (= counting) is refused and NOTHING is written
      await setCrm(crmL, { uiVersion: 2, bridgesEnabled: false });
      const dClosed = await mkDeal(cL, ctG, pL, { value: 900_00 });
      const sClosed = await sell(tidL, unitL, posL, 110_00);
      await pump([tidL]);
      closedLink = await call(PAY.linkSaleToDeal, cL, owner, { dealId: dClosed, saleId: sClosed.saleId });
      closedRows = (await P.crmDealPayment.count({ where: { systemId: crmL, refId: sClosed.saleId } }).catch(() => -1)) as number;
      // (2) counted with the bridge open, then the bridge is closed and the bill is voided ⇒ the money comes back
      const reverseCase = async (closeWith: Record<string, unknown>, satang: number): Promise<number[]> => {
        await setCrm(crmL, { uiVersion: 2, bridgesEnabled: true });
        const d = await mkDeal(cL, ctG, pL, { value: 900_00 });
        const s = await sell(tidL, unitL, posL, satang);
        await pump([tidL]);
        await call(PAY.linkSaleToDeal, cL, owner, { dealId: d, saleId: s.saleId });
        const before = B((await dealRow(d))?.paidSatang);
        await setCrm(crmL, closeWith);
        await call(POS.voidSale, tidL, unitL, s.saleId);
        await pump([tidL]);
        return [before, B((await dealRow(d))?.paidSatang)];
      };
      posClosed = await reverseCase({ bridgesEnabled: false }, 170_00);
      posV1 = await reverseCase({ uiVersion: 1 }, 210_00);
      // (3) the same for the ACCOUNT side: a counted payment, then the gate is closed, then the payment is voided
      const accCase = async (closeWith: Record<string, unknown>, satang: number): Promise<number[]> => {
        await setCrm(crmL, { uiVersion: 2, bridgesEnabled: true });
        const d = await mkDeal(cL, ctG, pL, { value: 900_00 });
        const doc = await mkDocForDeal(tidL, accL, crmL, d, "INVOICE", satang);
        const half = Math.max(100, Math.round(doc.grand / 2));
        const pr = await payDoc(tidL, accL, doc.id, half, finL);
        await pump([tidL]);
        const before = B((await dealRow(d))?.paidSatang);
        await setCrm(crmL, closeWith);
        await voidPay(tidL, accL, doc.id, String(pr.v?.paymentId ?? ""), `ยกเลิกงวด ${TAG}`);
        await pump([tidL]);
        return [before, B((await dealRow(d))?.paidSatang), half];
      };
      accClosed = await accCase({ bridgesEnabled: false }, 300_00);
      accV1 = await accCase({ uiVersion: 1 }, 400_00);
    } finally {
      await setCrm(crmL, { uiVersion: 2, bridgesEnabled: true });
      const s = (await P.appSystem.findFirst({ where: { id: crmL } }).catch(() => null)) as Any;
      const crmS = (s?.settings?.crm ?? {}) as Any;
      gateBack = crmS?.uiVersion === 2 && crmS?.bridgesEnabled === true;
    }
    chk("C2.7-S9.2", "B2 — the gate stops COUNTING but never REVERSING: with uiVersion 2 + bridgesEnabled false linkSaleToDeal is refused and nothing is written · money counted while the bridge was open is given back in full when `pos.sale.voided` / `account.payment.voided` arrive after the shop closed the bridge AND after it fell back to uiVersion 1 (a deal must never keep phantom money)",
      gateRefused(closedLink) && closedRows === 0 &&
        posClosed[0]! > 0 && posClosed[1] === 0 && posV1[0]! > 0 && posV1[1] === 0 &&
        accClosed[0] === accClosed[2] && accClosed[1] === 0 && accV1[0] === accV1[2] && accV1[1] === 0 && gateBack,
      "refused while closed · reversed to 0 in all 4 cases",
      `closedLink=${rd(closedLink)} rows=${closedRows} pos(bridge)=${j(posClosed)} pos(v1)=${j(posV1)} acc(bridge)=${j(accClosed)} acc(v1)=${j(accV1)} gateRestored=${gateBack}`);
  }
  {
    // SF-1 — voiding the invoice must reverse ONLY the invoice's own money: the deposit receipt of the same deal keeps its.
    const ct = await mkContact(tidA, crmA, "คุณมัดจำสองใบ", userA);
    const d = await mkDeal(cA, ct, pQuote, { value: 0 });
    const inv = await mkDocForDeal(tidA, accA, crmA, d, "INVOICE", 10_000_00);
    const dep = await mkDocReal(tidA, accA, "DEPOSIT_RECEIPT", 2_000_00, { sourceDocId: inv.id });
    const prDep = await payDoc(tidA, accA, dep.id, dep.grand, finA);
    const prInv = await payDoc(tidA, accA, inv.id, inv.grand, finA);
    await pump([tidA]);
    const paidBoth = B((await dealRow(d))?.paidSatang);
    // accounting refuses to void a document that still carries a live payment, so the payment is voided first — but the
    //   CRM must NOT see `account.payment.voided` here, otherwise the reversal below would be that path's work and this
    //   check would no longer prove what `flagDocumentVoided` reverses (SF-1 is exactly about its scope).
    const payId = String(prInv.v?.paymentId ?? "");
    const vp = await voidPay(tidA, accA, inv.id, payId, `ยกเลิกงวด ${TAG}`);
    const evPv = await lastEvent(tidA, "account.payment.voided", payId);
    if (evPv) await P.outboxEvent.update({ where: { id: evPv.id }, data: { status: "DONE", processedAt: new Date() } }).catch(() => null);
    const paidPre = B((await dealRow(d))?.paidSatang);
    const vd = await call(accSvc.voidDocument, tidA, accA, inv.id, `ยกเลิกใบแจ้งหนี้ ${TAG}`);
    await pump([tidA]);
    const deal = await dealRow(d);
    const rows = await paysOf(d);
    const depRow = rows.find((r) => r.refId === String(prDep.v?.paymentId ?? ""));
    const invRow = rows.find((r) => r.refId === payId);
    const tags: string[] = Array.isArray(deal?.tags) ? deal.tags : [];
    chk("C2.7-S9.3", `SF-1 — a deal that received a ฿2,000 deposit (through the sourceDocId chain) and a ฿10,000 invoice keeps the deposit when the INVOICE is voided: deal money = the deposit alone, the deposit row stays COUNTED, the invoice's row is REVERSED and the tag "${VOID_TAG}" is added exactly once`,
      prDep.ok && prInv.ok && inv.grand > 0 && dep.grand > 0 && paidBoth === dep.grand + inv.grand && vp.ok && (vd.ok || vd.v?.ok === true) &&
        paidPre === dep.grand + inv.grand && B(deal?.paidSatang) === dep.grand && depRow?.status === "COUNTED" && invRow?.status === "REVERSED" &&
        tags.filter((t) => t === VOID_TAG).length === 1,
      `deposit ${dep.grand} kept · invoice ${inv.grand} reversed`,
      `${rd(prDep)}/${rd(prInv)} paid=${paidBoth}→${paidPre}→${B(deal?.paidSatang)} deposit=${depRow?.status} invoice=${invRow?.status} void=${rd(vd)} tags=${j(tags)}`, "MAJOR");
  }
  {
    // SF-2 — withholding tax: `account.payment.recorded` carries only the CASH that arrived (no WHT) while accounting
    //   ties off cash + WHT and declares the invoice PAID ⇒ without the settle row the deal is short for ever and
    //   `autoWonOnPaid` never fires. One `DOC_SETTLE#<docId>` row closes the document to its grand total, idempotently.
    const ct = await mkContact(tidA, crmA, "คุณหักภาษี", userA);
    const d = await mkDeal(cA, ct, pAutoWon, { value: 100_00 });
    const inv = await mkDocForDeal(tidA, accA, crmA, d, "INVOICE", 5_000_00);
    const wht = Math.round(inv.grand * 0.03);
    const net = inv.grand - wht;
    const pr = await payDoc(tidA, accA, inv.id, net, finA, { whtAmountSatang: wht, whtRateBp: 300 });
    await pump([tidA]);
    const doc = await docRow(inv.id);
    /** the settle row of ONE document — `DOC_SETTLE#<docId>` as the ruling writes it, i.e. refType DOC_SETTLE + refId = the document (or that key as the refId) */
    const isSettle = (r: Any) => `${r?.refType}#${r?.refId}` === `DOC_SETTLE#${inv.id}` || String(r?.refId) === `DOC_SETTLE#${inv.id}`;
    const rows = await paysOf(d);
    const settle = rows.filter(isSettle);
    const counted = rows.filter((r) => r.status === "COUNTED").reduce((n, r) => n + B(r.satang), 0);
    // replay: the same `account.invoice.paid` twice in a row and twice in parallel ⇒ still ONE settle row, same money
    const ev = await lastEvent(tidA, "account.invoice.paid", inv.id);
    await consume(evtOf(ev ?? {}));
    await consume(evtOf(ev ?? {}));
    await Promise.all([consume(evtOf(ev ?? {})), consume(evtOf(ev ?? {}))]);
    const rows2 = await paysOf(d);
    const deal = await dealRow(d);
    const wonAudit = (await P.auditLog.count({ where: { tenantId: tidA, targetId: d, action: "crm.deal.won.auto" } }).catch(() => -1)) as number;
    const wonHist = (await P.crmDealStageHistory.count({ where: { dealId: d, toStageId: pAutoWon.st[3] } }).catch(() => -1)) as number;
    chk("C2.7-S9.4", "SF-2 — an invoice with 3% withholding tax paid net (accounting marks it PAID): the deal is credited the FULL grand total of that document = the cash row + ONE `DOC_SETTLE#<docId>` row worth exactly the WHT · redelivering `account.invoice.paid` twice and twice in parallel adds no second row · autoWonOnPaid moves the deal to WON exactly once (audit crm.deal.won.auto once · one history row into the WON stage)",
      pr.ok && doc?.status === "PAID" && wht > 0 && settle.length === 1 && B(settle[0]?.satang) === wht &&
        counted === inv.grand && B(deal?.paidSatang) === inv.grand && rows2.filter(isSettle).length === 1 && rows2.length === rows.length &&
        deal?.kind === "WON" && wonAudit === 1 && wonHist === 1,
      `paid ${inv.grand} = ${net} cash + ${wht} WHT · WON once`,
      `${rd(pr)} status=${doc?.status} settle=${settle.length}:${B(settle[0]?.satang)} Σcounted=${counted}/${inv.grand} paid=${B(deal?.paidSatang)} rows=${rows.length}→${rows2.length} kind=${deal?.kind} wonAudit=${wonAudit} wonHistory=${wonHist}`, "MAJOR");
  }
  {
    // SF-3 — `moveDeal` recomputes `wonValueSatang` from the money rows; reading that outside the deal's lock is a
    //   TOCTOU: money counted while the move waits for the lock gets overwritten with null. 20 rounds, both sides on
    //   their own pool connection (two interactive transactions racing for the same row lock).
    const W = await mkCompanyDeal();
    const rounds = 20;
    const each = 1_00;
    let bad = "";
    let counted = 0;
    let moves = 0;
    let lastWon = 0;
    const wonW = await wonBasisOf(W.inv); // ORACLE-EDIT C2.7-S3.1/S9.5 (C5.4-C · won basis = before VAT · Q14) · was W.grand
    for (let i = 0; i < rounds; i += 1) {
      const [mv, rp] = await Promise.all([
        call(CRM.deals?.moveDeal, cA, owner, W.d, { stageId: pQuote.st[i % 2] }),
        call(PAY.recordDocPayment, { tenantId: tidA, systemId: crmA }, { documentId: W.inv, paymentId: `${TAG}-sf3-${i}`, amountSatang: each, docType: "INVOICE" }),
      ]);
      if (mv.ok) moves += 1;
      if (rp.ok && rp.v?.counted === true) counted += 1;
      const deal = await dealRow(W.d);
      const won = deal?.wonValueSatang;
      if (counted > 0) {
        if (won === null || won === undefined) bad = bad || `round ${i}: wonValue null after ${counted} counted`;
        else if (B(won) < lastWon) bad = bad || `round ${i}: wonValue regressed ${lastWon}→${B(won)}`;
        else if (B(won) !== wonW) bad = bad || `round ${i}: wonValue ${B(won)} ≠ anchor ${wonW}`; // ORACLE-EDIT C2.7-S3.1/S9.5 (C5.4-C · won basis = before VAT · Q14)
        lastWon = Math.max(lastWon, B(won));
      }
      if (!mv.ok && !bad && mv.code !== "CONFLICT") bad = bad || `round ${i}: move ${mv.err.slice(0, 40)}`;
    }
    const deal = await dealRow(W.d);
    chk("C2.7-S9.5", `SF-3 — ${rounds} rounds of \`moveDeal\` OPEN→OPEN racing \`recordDocPayment\` on separate connections: \`wonValueSatang\` is never null and never regresses once money has been counted (it stays the anchor document's won value on the single product basis — ORACLE-EDIT C5.4-C), and paidSatang ends at the exact sum of the payments that were counted`,
      counted >= rounds - 1 && moves >= rounds - 1 && bad === "" && B(deal?.paidSatang) === counted * each && wonW > 0 && B(deal?.wonValueSatang) === wonW, // ORACLE-EDIT C2.7-S3.1/S9.5 (C5.4-C · won basis = before VAT · Q14)
      `won stable at ${wonW} (${WON_BASIS}) · paid = ${rounds} × ${each}`,
      `counted=${counted}/${rounds} moves=${moves}/${rounds} paid=${B(deal?.paidSatang)} won=${j(deal?.wonValueSatang)} ${bad || "no anomaly"}`, "MAJOR");
  }
  {
    // SF-4 — one document claimed by TWO deals (a duplicate/mis-merged deal): the money may land once only, on the
    //   oldest deal, and the shop must be able to SEE that it happened (WARN with ids only — never a silent guess).
    const ct = await mkContact(tidA, crmA, "คุณเอกสารซ้ำ", userA);
    const dOld = await mkDeal(cA, ct, pQuote, { lines: LINES });
    await sleep(30);
    const dNew = await mkDeal(cA, ct, pQuote, { value: 0 });
    const qr = await call(CRM.deals?.issueQuotation, cA, owner, dOld, {});
    const qd = String(qr.v?.docId ?? "");
    await issueDoc(tidA, accA, qd);
    const inv = await mkDocReal(tidA, accA, "INVOICE", 400_00, { sourceDocId: qd });
    // the malformed data the ruling describes: both deals point at the SAME quotation and the same invoice
    await P.crmDeal.updateMany({ where: { id: { in: [dOld, dNew] } }, data: { quotationDocId: qd, invoiceDocId: inv.id } }).catch(() => null);
    const t0 = new Date(Date.now() - 500);
    const pr = await payDoc(tidA, accA, inv.id, inv.grand, finA);
    await pump([tidA]);
    const paidOld = B((await dealRow(dOld))?.paidSatang);
    const paidNew = B((await dealRow(dNew))?.paidSatang);
    const warns = ((await P.opsEvent.findMany({ where: { tenantId: tidA, level: "WARN", createdAt: { gte: t0 } } }).catch(() => [])) as Any[])
      .filter((w) => `${w.message} ${w.detail ?? ""}`.includes(inv.id));
    const warnClean = warns.length > 0 && !warns.some((w) => PII.some((s) => s.length > 5 && `${w.message} ${w.detail ?? ""}`.includes(s)));
    const warnThai = warns.length > 0 && thai(warns[0]?.message);
    // voiding the invoice: BOTH deals are flagged, only the one that was counted gives money back
    const payId = String(pr.v?.paymentId ?? "");
    await voidPay(tidA, accA, inv.id, payId, `ยกเลิกงวด ${TAG}`);
    const evPv = await lastEvent(tidA, "account.payment.voided", payId);
    if (evPv) await P.outboxEvent.update({ where: { id: evPv.id }, data: { status: "DONE", processedAt: new Date() } }).catch(() => null);
    const vd = await call(accSvc.voidDocument, tidA, accA, inv.id, `ยกเลิก ${TAG}`);
    await pump([tidA]);
    const oldRow = await dealRow(dOld);
    const newRow = await dealRow(dNew);
    const tagsOld: string[] = Array.isArray(oldRow?.tags) ? oldRow.tags : [];
    const tagsNew: string[] = Array.isArray(newRow?.tags) ? newRow.tags : [];
    chk("C2.7-S9.6", "SF-4 — two deals pointing at the same quotation/invoice: the payment is counted ONCE, for the OLDEST deal, and a WARN OpsEvent (Thai · ids only · no name/phone/e-mail) records the ambiguity · voiding that document flags BOTH deals and gives the money back only where it was counted",
      pr.ok && paidOld === inv.grand && paidNew === 0 && warns.length >= 1 && warnThai && warnClean && (vd.ok || vd.v?.ok === true) &&
        B(oldRow?.paidSatang) === 0 && B(newRow?.paidSatang) === 0 &&
        tagsOld.filter((t) => t === VOID_TAG).length === 1 && tagsNew.filter((t) => t === VOID_TAG).length === 1 &&
        (await paysOf(dNew)).length === 0,
      "oldest counted · WARN · both flagged",
      `paid old=${paidOld}→${B(oldRow?.paidSatang)} new=${paidNew}→${B(newRow?.paidSatang)} warns=${warns.length}:${warnThai}/${warnClean} tags=${j([tagsOld.length, tagsNew.length])} void=${rd(vd)}`, "MINOR");
  }
  {
    // SF-5 — only INVOICE / DEPOSIT_RECEIPT are attributable. A ใบวางบิล (BILLING_NOTE) collects several invoices of
    //   possibly several deals, so its money must NOT be guessed onto a deal (C3 owns that). The account book itself
    //   refuses to take a payment on a group document (`PAYABLE_DOC_TYPES` of account/payment.ts → the money always
    //   arrives at the CHILD invoices), so the only way such an event can exist is an import/integration — which is
    //   exactly the case this rule defends: the event is therefore hand-delivered to the consumer here, with the BN's
    //   chain pointing at the deal's invoice so that nothing but the doc-type rule can stop the attribution.
    const ct = await mkContact(tidA, crmA, "คุณใบวางบิล", userA);
    const d = await mkDeal(cA, ct, pQuote, { value: 0 });
    const inv = await mkDocForDeal(tidA, accA, crmA, d, "INVOICE", 700_00);
    const bn = await mkDocReal(tidA, accA, "BILLING_NOTE", 700_00, { sourceDocId: inv.id });
    const t0 = new Date(Date.now() - 500);
    const rBn = await consume({ id: `${TAG}-bn`, tenantId: tidA, type: "account.payment.recorded", payload: { documentId: bn.id, paymentId: `${TAG}-bn-pay`, amountSatang: Math.max(1, bn.grand), docType: "BILLING_NOTE" }, systemId: accA, unitId: null });
    const bnRows = (await P.crmDealPayment.count({ where: { systemId: crmA, refId: `${TAG}-bn-pay` } }).catch(() => -1)) as number;
    const paidBn = B((await dealRow(d))?.paidSatang);
    const warns = ((await P.opsEvent.findMany({ where: { tenantId: tidA, level: "WARN", createdAt: { gte: t0 } } }).catch(() => [])) as Any[])
      .filter((w) => `${w.message} ${w.detail ?? ""}`.includes(bn.id));
    const warnOk = warns.length >= 1 && thai(warns[0]?.message) && !warns.some((w) => PII.some((s) => s.length > 5 && `${w.message} ${w.detail ?? ""}`.includes(s)));
    // positive control: the INVOICE of that deal and a DEPOSIT_RECEIPT of its chain DO count
    const half = Math.max(100, Math.round(inv.grand / 2));
    const prInv = await payDoc(tidA, accA, inv.id, half, finA);
    const dep = await mkDocReal(tidA, accA, "DEPOSIT_RECEIPT", 300_00, { sourceDocId: inv.id });
    const prDep = await payDoc(tidA, accA, dep.id, dep.grand, finA);
    await pump([tidA]);
    const paidEnd = B((await dealRow(d))?.paidSatang);
    const kinds = (await paysOf(d)).filter((r) => r.status === "COUNTED").length;
    chk("C2.7-S9.7", "SF-5 — a payment of a ใบวางบิล (BILLING_NOTE) is never turned into deal money (one billing note can cover invoices of several deals): nothing is written and a Thai WARN OpsEvent with ids only records it · the INVOICE of the same deal and a DEPOSIT_RECEIPT of its chain are counted (positive control)",
      rBn.ok && bnRows === 0 && paidBn === 0 && warnOk && prInv.ok && prDep.ok && paidEnd === half + dep.grand && kinds === 2,
      "0 for the billing note · counted for invoice + deposit",
      `bn=${rd(rBn)} rows=${bnRows} paid=${paidBn}→${paidEnd} (want ${half + dep.grand}) counted=${kinds} warns=${warns.length}:${warnOk}`, "MINOR");
  }
  {
    // N3 — a gift-card bill is money received IN ADVANCE, not deal revenue (the accounting module books it on 2110)
    const ct = await mkContact(tidA, crmA, "คุณบัตรกำนัล", userS);
    const dGift = await mkDeal(cA, ct, pQuote, { value: 500_00, ownerUserId: userS });
    const sg = await sell(tidA, unitA, posA, 500_00);
    await pump([tidA]);
    // the M2.6 flag of such a bill (a plain column, no FK — the giftcard module sets it inside the sale's transaction)
    await P.posSale.update({ where: { id: sg.saleId }, data: { giftCardId: `${TAG}-gc` } }).catch(() => null);
    const lg = await call(PAY.linkSaleToDeal, cA, owner, { dealId: dGift, saleId: sg.saleId });
    // even a row linked before the flag existed must never be counted by the consumer
    await P.crmDealPayment?.create?.({ data: { tenantId: tidA, systemId: crmA, dealId: dGift, refType: "POS_SALE", refId: sg.saleId, satang: BigInt(sg.grand), status: "LINKED" } }).catch(() => null);
    const evG = await lastEvent(tidA, "pos.sale.paid", sg.saleId);
    const rG = await consume(evtOf(evG ?? {}));
    const giftRow = (await paysOf(dGift)).find((r) => r.refId === sg.saleId);
    const paidGift = B((await dealRow(dGift))?.paidSatang);
    // N1 — the select of the sell screen must not be offered to a cashier who cannot link (no `crm.deal.update`):
    //   an offered select whose button always fails is a silent trap. The data behind the select is `posOpenDeals`.
    const REG = (await import("@/lib/modules/pos/register" as string).catch(() => ({}))) as Any;
    const cust = await P.customer.create({ data: { tenantId: tidA, memberSystemId: `${TAG}-mem`, name: pii(`สมาชิกบัตร ${TAG}-${nx()}`), partyId: ct.partyId } }).catch(() => null);
    const canLink = { userId: userS, role: "STAFF", unitAccess: ["*"], permissions: { ...STAFF_PERMS, "crm.deal.update": true } as Record<string, unknown> };
    const listNoUpdate = await call(REG.posOpenDeals, tidA, cashier, String(cust?.id ?? ""));
    const listCanLink = await call(REG.posOpenDeals, tidA, canLink, String(cust?.id ?? ""));
    const sNo = await sell(tidA, unitA, posA, 100_00);
    await pump([tidA]);
    const linkNoKey = await call(PAY.linkSaleToDeal, cA, cashier, { dealId: dGift, saleId: sNo.saleId });
    const rowsNoKey = (await P.crmDealPayment.count({ where: { systemId: crmA, refId: sNo.saleId } }).catch(() => -1)) as number;
    // N4 — a LINKED row written before the bill was paid must emit `crm.deal.updated` when it is finally counted
    const dLate = await mkDeal(cA, ct, pQuote, { value: 900_00 });
    const sLate = await sell(tidA, unitA, posA, 240_00);
    await pump([tidA]);
    await P.crmDealPayment?.create?.({ data: { tenantId: tidA, systemId: crmA, dealId: dLate, refType: "POS_SALE", refId: sLate.saleId, satang: BigInt(sLate.grand), status: "LINKED" } }).catch(() => null);
    const t0 = new Date(Date.now() - 500);
    const evL = await lastEvent(tidA, "pos.sale.paid", sLate.saleId);
    const rL = await consume(evtOf(evL ?? {}));
    const updated = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.deal.updated", createdAt: { gte: t0 } } }).catch(() => [])) as Any[])
      .filter((e) => j(e.payload).includes(dLate));
    const paidLate = B((await dealRow(dLate))?.paidSatang);
    const ids = (r: Res) => (Array.isArray(r.v) ? r.v.map((x: Any) => String(x.id)) : []);
    chk("C2.7-S9.8", "N3 · N1 · N4 — a gift-card bill is refused with a Thai reason and is never counted even when a LINKED row exists · the sell screen's deal list is EMPTY for a cashier without `crm.deal.update` (and linkSaleToDeal answers FORBIDDEN without writing a row) while the same cashier WITH the key sees the deal (positive control) · a pre-existing LINKED row that finally gets counted emits `crm.deal.updated`",
      refused(lg, "VALIDATION") && rG.ok && giftRow?.status === "LINKED" && paidGift === 0 &&
        listNoUpdate.ok && ids(listNoUpdate).length === 0 && listCanLink.ok && ids(listCanLink).includes(dGift) &&
        refused(linkNoKey, "FORBIDDEN") && rowsNoKey === 0 &&
        rL.ok && paidLate === sLate.grand && updated.length >= 1,
      "gift card 0 · no select without the key · crm.deal.updated emitted",
      `gift=${rd(lg)} row=${giftRow?.status} paid=${paidGift} · list noUpdate=${rd(listNoUpdate)}:${ids(listNoUpdate).length} canLink=${ids(listCanLink).length} · link=${rd(linkNoKey)} rows=${rowsNoKey} · late paid=${paidLate} updated=${updated.length}`, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — parallel money on SEPARATE connections (in-process AND worker processes)
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X3 · ยิงเงินพร้อมกัน ──");
  {
    const K = await mkCompanyDeal();
    const each = 50_00;
    const n = 10;
    const rs = await Promise.all(Array.from({ length: n }, () => payDoc(tidA, accA, K.inv, each, finA)));
    const okPays = rs.filter((r) => r.ok && r.v?.ok === true).map((r) => String(r.v.paymentId));
    await pump([tidA]);
    const deal = await dealRow(K.d);
    const rows = await paysOf(K.d);
    const counted = rows.filter((r) => r.status === "COUNTED");
    const sql = (await P.$queryRawUnsafe(`SELECT COALESCE(SUM("satang"),0)::bigint AS s FROM "CrmDealPayment" WHERE "dealId" = $1 AND "status" = 'COUNTED'`, K.d).catch(() => [{ s: 0 }])) as Any[];
    chk("C2.7-X3.1", `${n} different payments of one invoice fired in PARALLEL ⇒ one CrmDealPayment per accepted payment and paidSatang = the exact bigint sum (Σ = ${okPays.length} × ${each} satang) — read-modify-write anywhere on this path shows up here`,
      okPays.length >= 2 && counted.length === okPays.length && B(deal?.paidSatang) === okPays.length * each && Number(sql[0]?.s ?? -1) === okPays.length * each,
      "exact sum", `accepted=${okPays.length}/${n} counted=${counted.length} paid=${B(deal?.paidSatang)} sqlSum=${String(sql[0]?.s)}`);
  }
  {
    const L2 = await mkCompanyDeal();
    const each = 20_00;
    const w = await spawnWorkers("pay", { tenantId: tidA, accSys: accA, docId: L2.inv, n: 5, amount: each }, 2);
    const okCount = w.answers.filter((a) => a === "OK").length;
    chk("C2.7-X3.2a", "[positive control] 2 worker PROCESSES ran and answered 10 payment attempts — if red, X3.2 proves nothing",
      w.spawned && w.answers.length === 10, "10 answers", `${w.answers.length} ${cut(w.answers.filter((a) => a !== "OK").join(","), 120)}`);
    await pump([tidA]);
    const deal = await dealRow(L2.d);
    const counted = (await paysOf(L2.d)).filter((r) => r.status === "COUNTED");
    chk("C2.7-X3.2", "2 PROCESSES × 5 parallel payments (own pools, own connections) ⇒ paidSatang = the exact sum of the payments the book accepted and exactly one CrmDealPayment per payment",
      okCount >= 2 && counted.length === okCount && B(deal?.paidSatang) === okCount * each,
      "exact", `okPayments=${okCount} counted=${counted.length} paid=${B(deal?.paidSatang)}`);
  }
  {
    // the same event delivered by two PROCESSES at the same instant
    const M2 = await mkCompanyDeal();
    const pr = await payDoc(tidA, accA, M2.inv, 40_00, finA);
    const ev = await lastEvent(tidA, "account.payment.recorded", String(pr.v?.paymentId ?? ""));
    const w = await spawnWorkers("consume", { eventId: String(ev?.id ?? ""), n: 3 }, 2);
    await pump([tidA]);
    const deal = await dealRow(M2.d);
    const rows = await paysOf(M2.d);
    chk("C2.7-X3.3", "the SAME `account.payment.recorded` row delivered by 2 PROCESSES × 3 parallel deliveries ⇒ ONE CrmDealPayment and paidSatang counted exactly once (the unique key is the flag, not an in-process guard)",
      w.spawned && rows.length === 1 && B(deal?.paidSatang) === 40_00, "once", `answers=${w.answers.length} rows=${rows.length} paid=${B(deal?.paidSatang)} ${cut(w.answers.filter((a) => a !== "OK").join(","), 100)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — every money consumer twice AND twice in parallel · the void matrix
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X4 · ส่งซ้ำทุกตัวรับ ──");
  const twice = async (ev: Any) => {
    const a = await consume(evtOf(ev ?? {}));
    const b = await consume(evtOf(ev ?? {}));
    const par = await Promise.all([consume(evtOf(ev ?? {})), consume(evtOf(ev ?? {}))]);
    return [a, b, ...par];
  };
  {
    const N = await mkCompanyDeal();
    const pr = await payDoc(tidA, accA, N.inv, 60_00, finA);
    const evPay = await lastEvent(tidA, "account.payment.recorded", String(pr.v?.paymentId ?? ""));
    const evPaid = await lastEvent(tidA, "account.invoice.paid", N.inv);
    const rs = [...(await twice(evPay)), ...(evPaid ? await twice(evPaid) : [])];
    const deal = await dealRow(N.d);
    const rows = await paysOf(N.d);
    chk("C2.7-X4.1", "`account.payment.recorded` and `account.invoice.paid` delivered twice in a row and twice in parallel ⇒ ONE row, paidSatang counted ONCE, every delivery resolves",
      rs.every((r) => r.ok) && rows.length === 1 && B(deal?.paidSatang) === 60_00, "once", `answers=${rs.map((r) => (r.ok ? "ok" : r.err.slice(0, 20))).join(",")} rows=${rows.length} paid=${B(deal?.paidSatang)}`);
  }
  {
    const O = await mkCompanyDeal();
    const pr = await payDoc(tidA, accA, O.inv, 80_00, finA);
    await pump([tidA]);
    const payId = String(pr.v?.paymentId ?? "");
    await voidPay(tidA, accA, O.inv, payId, `ยกเลิก ${TAG}`);
    const evV = await lastEvent(tidA, "account.payment.voided", payId);
    const rs = await twice(evV);
    const deal = await dealRow(O.d);
    const row = (await paysOf(O.d)).find((r) => r.refId === payId);
    chk("C2.7-X4.2", "`account.payment.voided` twice + twice in parallel ⇒ subtracted ONCE (paidSatang 0), the row is REVERSED once, no negative balance ever appears",
      rs.every((r) => r.ok) && B(deal?.paidSatang) === 0 && row?.status === "REVERSED" && B(deal?.paidSatang) >= 0,
      "0, once", `paid=${B(deal?.paidSatang)} row=${row?.status}`);
  }
  {
    // void an event that was NEVER counted (a payment of a document with no deal) ⇒ nothing anywhere
    const stray2 = await mkDocReal(tidA, accA, "INVOICE", 300_00);
    const pr = await payDoc(tidA, accA, stray2.id, Math.max(1, stray2.grand), finA);
    await pump([tidA]);
    const before = (await P.crmDealPayment.count({ where: { systemId: crmA } }).catch(() => 0)) as number;
    await voidPay(tidA, accA, stray2.id, String(pr.v?.paymentId ?? ""), `ยกเลิก ${TAG}`);
    const evV = await lastEvent(tidA, "account.payment.voided", String(pr.v?.paymentId ?? ""));
    const rs = await twice(evV);
    const after = (await P.crmDealPayment.count({ where: { systemId: crmA } }).catch(() => 0)) as number;
    const negative = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "CrmDeal" WHERE "systemId" = $1 AND "paidSatang" < 0`, crmA).catch(() => [{ n: -1 }])) as Any[];
    chk("C2.7-X4.3", "voiding a payment that CRM never counted (its document reaches no deal) writes nothing and subtracts nothing anywhere — no deal of the shop ends up with a negative paidSatang",
      rs.every((r) => r.ok) && after === before && Number(negative[0]?.n ?? -1) === 0, "no change · no negative", `rows ${before}→${after} negatives=${String(negative[0]?.n)}`);
  }
  {
    const Q = await mkCompanyDeal();
    const evD = await (async () => {
      await call(accSvc.voidDocument, tidA, accA, Q.inv, `ยกเลิก ${TAG}`);
      return lastEvent(tidA, "account.document.voided", Q.inv);
    })();
    const rsD = await twice(evD);
    const ct = await mkContact(tidA, crmA, "คุณโพสซ้ำ", userA);
    const d = await mkDeal(cA, ct, pQuote, { value: 900_00 });
    const s = await sell(tidA, unitA, posA, 90_00);
    await call(PAY.linkSaleToDeal, cA, owner, { dealId: d, saleId: s.saleId });
    const evS = await lastEvent(tidA, "pos.sale.paid", s.saleId);
    const rsS = await twice(evS);
    await call(POS.voidSale, tidA, unitA, s.saleId);
    const evSV = await lastEvent(tidA, "pos.sale.voided", s.saleId);
    const rsSV = await twice(evSV);
    const deal = await dealRow(d);
    const dealQ = await dealRow(Q.d);
    const tagsQ: string[] = Array.isArray(dealQ?.tags) ? dealQ.tags : [];
    chk("C2.7-X4.4", "`account.document.voided`, `pos.sale.paid` and `pos.sale.voided` each delivered twice + twice in parallel ⇒ one flag, one count, one reversal (paidSatang 0 · the voided tag exactly once)",
      [...rsD, ...rsS, ...rsSV].every((r) => r.ok) && B(deal?.paidSatang) === 0 && tagsQ.filter((t) => t === VOID_TAG).length === 1,
      "idempotent everywhere", `paid=${B(deal?.paidSatang)} tags=${j(tagsQ)} answers=${[...rsD, ...rsS, ...rsSV].filter((r) => !r.ok).length} failed`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ORACLE-EDIT C2.7-fix ▸ F1 — the document money must NOT depend on the ORDER the two account events are consumed in
  //   (26 Sep · controller lane "C2.7-fix" · found by the C3.2 builder, wo-notes crm-C3.2 §7 CRITICAL)
  //   `account/service.ts` recordPayment writes `account.payment.recorded` + `account.invoice.paid` in ONE `emitOutboxMany` ⇒ both
  //   rows carry the SAME createdAt and nothing guarantees which one is consumed first (a tie in ORDER BY createdAt, two drainers
  //   claiming one row each, a retry after a failed first attempt). When `invoice.paid` wins, `onInvoiceFullyPaid` settles the
  //   document before the payment row exists and the payment is then counted AGAIN on top ⇒ paidSatang > the document.
  //   Every check below takes the two events away from every drainer (status DONE right after the REAL payment) and delivers
  //   them itself — the order is chosen by the test, never by chance:
  //   F1.1 (CRITICAL) invoice.paid BEFORE payment.recorded ⇒ paidSatang = grand total exactly · one COUNTED row per payment ·
  //        ≤ 1 DOC_SETTLE row · Σ COUNTED ≤ grand total at every step (also right after the first delivery) · auto-WON once
  //   F1.2 (CRITICAL) the two events of one payment delivered in PARALLEL by 2 worker PROCESSES × 10 rounds ⇒ the F1.1 invariant
  //        every round (half of the rounds carry 3 % WHT). With a zero kick-off skew `payment.recorded` always reaches the deal
  //        lock first (the invoice.paid consumer does more reads before it locks), so the start of payment.recorded is swept
  //        −150…+390 ms relative to invoice.paid across the rounds · F1.2a positive control: every delivery answered, and the
  //        lock was won by EACH side in at least one WHT round (read from the xmin order of the settle / payment rows — round 2)
  //   F1.2b (CRITICAL) the same in-process on separate pool connections (Promise.all + the same skew sweep) × 10 rounds
  //   F1.3 (CRITICAL) replay: pay→paid, paid→pay, both in parallel ×2 ⇒ rows byte-identical, still exactly the grand total
  //   F1.4 (CRITICAL) WHT: partial P1 counted · P2 (rest net of 3 % WHT) makes the invoice PAID · invoice.paid delivered first,
  //        then P2 ⇒ paidSatang = grand total exactly
  //   F1.5 (MAJOR) order independence of the ROWS: after the reversed order every payment row holds its CASH and the settle
  //        row holds only the WHT remainder (0 / absent without WHT) — row-for-row what the in-order delivery produces
  //   F1.6 (MAJOR) voiding P2 after the reversed order ⇒ paidSatang back to P1 exactly · P2 and the settle row REVERSED · no negative
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── F1 · ลำดับ event ของการจ่ายเงิน (C2.7-fix) ──");
  {
    type F1Ev = { id: string; type: string } & Record<string, Any>;
    const f1Fixture = async (label: string, satang: number, pipe: Pipe = pPlain, value = 100_00) => {
      const ct = await mkContact(tidA, crmA, label, userA);
      const d = await mkDeal(cA, ct, pipe, { value });
      const inv = await mkDocForDeal(tidA, accA, crmA, d, "INVOICE", satang);
      return { d, inv: inv.id, grand: inv.grand };
    };
    /** a REAL payment through the book, then the events it emitted are CLAIMED (status DONE) before any drainer of any lane can
     *  consume them — from here on only this oracle decides the delivery order. `claimed` = every emitted row was still ours */
    const f1Pay = async (docId: string, amount: number, extra: Record<string, unknown> = {}) => {
      const pr = await payDoc(tidA, accA, docId, amount, finA, extra);
      const pid = String(pr.v?.paymentId ?? "");
      const keys = [`account.payment.recorded#${pid}`, `account.invoice.paid#${docId}`];
      // round 2: only rows still PENDING belong to THIS payment (`account.invoice.paid#<doc>` is written once per document for
      //   ever — a re-payment after a void finds the old DONE row, which is not ours to deliver)
      const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, idempotencyKey: { in: keys }, status: "PENDING" } })) ?? []) as F1Ev[];
      const claim = evs.length ? await P.outboxEvent.updateMany({ where: { id: { in: evs.map((e) => e.id) }, status: "PENDING" }, data: { status: "DONE", processedAt: new Date() } }) : { count: 0 };
      const pay = evs.find((e) => e.type === "account.payment.recorded") ?? null;
      const paid = evs.find((e) => e.type === "account.invoice.paid") ?? null;
      return { pr, pid, pay, paid, claimed: pr.ok && pr.v?.ok !== false && !!pid && !!pay && Number(claim.count) === evs.length };
    };
    const f1State = async (d: string, docId: string) => {
      const deal = await dealRow(d);
      const rows = await paysOf(d);
      const counted = rows.filter((r) => r.status === "COUNTED");
      const sum = counted.reduce((n, r) => n + B(r.satang), 0);
      const settle = rows.filter((r) => r.refType === "DOC_SETTLE" && r.refId === docId);
      const pays = rows.filter((r) => r.refType === "PAYMENT");
      return { deal, rows, paid: B(deal?.paidSatang), sum, settle, pays };
    };
    const f1Inv = (s: Awaited<ReturnType<typeof f1State>>, grand: number, pids: string[]) =>
      grand > 0 && s.paid === grand && s.sum === grand && s.settle.length <= 1 && s.pays.length === pids.length &&
      pids.every((pid) => s.pays.filter((r) => r.refId === pid && r.status === "COUNTED").length === 1);
    const f1Show = (s: Awaited<ReturnType<typeof f1State>>) =>
      `paid=${s.paid} Σcounted=${s.sum} rows=${j(s.rows.map((r) => `${r.refType}:${r.status}:${B(r.satang)}`))}`;
    /** row-for-row order independence: every payment row = its cash · settle = the WHT remainder only (0 / absent without WHT) */
    const f1Rows = (s: Awaited<ReturnType<typeof f1State>>, cash: Record<string, number>, wht: number) =>
      Object.entries(cash).every(([pid, v]) => s.pays.some((r) => r.refId === pid && r.status === "COUNTED" && B(r.satang) === v)) &&
      (wht > 0 ? s.settle.length === 1 && s.settle[0]?.status === "COUNTED" && B(s.settle[0]?.satang) === wht : s.settle.every((r) => B(r.satang) === 0 || r.status !== "COUNTED"));

    // F1.11 tracker (C3.3/C3.2 contract): a row that is COUNTED in two consecutive snapshots keeps its satang — commissions and
    //   quota progress hang off COUNTED rows, so a COUNTED amount that moves afterwards silently corrupts both
    //   round 3 (controller ruling B1): the ONE allowed exception is a settle row re-derived from the book — it must pass through
    //   REVERSED with its own events, so a COUNTED→COUNTED amount change is accepted only when a `reverse-doc_settle-<doc>-…`
    //   crm.deal.updated event of that deal was written after the previous snapshot (database clock on both sides)
    //   round 4 (controller ruling ข้อ 4 · C3.3 key `<id>#c<countedAt ms>`): every COUNTED settle row has a `docsettle-…` event whose
    //   payload is its life {rowId, countedAt, satang = the row's amount} · reversedAt is null after a wake · a settle row whose
    //   countedAt moved must have moved strictly forward AND have a `reverse-doc_settle-…` event whose payload carries the OLD
    //   countedAt and the OLD amount · a PAYMENT row's countedAt never changes while COUNTED
    const SEEN = new Map<string, { status: string; satang: number; where: string; t: Date; countedMs: number | null }>();
    const VIOL: string[] = [];
    const VIA_REVERSE: string[] = [];
    const LIFE: string[] = [];
    const isoOf = (x: unknown) => (x ? new Date(String(x instanceof Date ? x.toISOString() : x)).toISOString() : null);
    let steps = 0;
    const dbNow = async (): Promise<Date> => new Date(String(((await P.$queryRawUnsafe(`SELECT now() AS t`)) as Any[])[0]?.t));
    const track = async (d: string, where: string) => {
      steps += 1;
      const t = await dbNow();
      for (const r of await paysOf(d)) {
        const prev = SEEN.get(String(r.id));
        if (prev && prev.status === "COUNTED" && r.status === "COUNTED" && prev.satang !== B(r.satang)) {
          const passedReverse = r.refType === "DOC_SETTLE" && ((await P.outboxEvent.count({
            where: { tenantId: tidA, idempotencyKey: { startsWith: `crm.deal.updated#${d}#reverse-doc_settle-${r.refId}-` }, createdAt: { gt: prev.t } },
          }).catch(() => 0)) as number) > 0;
          (passedReverse ? VIA_REVERSE : VIOL).push(`${r.refType} ${prev.satang}→${B(r.satang)} (${prev.where} → ${where})`);
        }
        const countedMs = r.countedAt ? new Date(r.countedAt).getTime() : null;
        if (prev && prev.status === "COUNTED" && r.status === "COUNTED" && prev.countedMs !== countedMs) {
          if (r.refType !== "DOC_SETTLE") LIFE.push(`${r.refType} countedAt moved while COUNTED (${where})`);
          else if (!(countedMs !== null && prev.countedMs !== null && countedMs > prev.countedMs)) LIFE.push(`DOC_SETTLE countedAt not strictly later ${prev.countedMs}→${countedMs} (${where})`);
        }
        if (r.refType === "DOC_SETTLE" && r.status === "COUNTED") {
          if (r.reversedAt) LIFE.push(`DOC_SETTLE COUNTED with reversedAt set (${where})`);
          const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, idempotencyKey: { startsWith: `crm.deal.updated#${d}#` } }, select: { idempotencyKey: true, payload: true } }).catch(() => [])) ?? []) as Any[];
          const setEv = evs.find((e) => String(e.idempotencyKey).includes(`#docsettle-${r.refId}-`) && e.payload?.rowId === r.id && e.payload?.countedAt === isoOf(r.countedAt));
          if (!setEv || B(setEv.payload?.satang) !== B(r.satang)) LIFE.push(`no docsettle payload {rowId, countedAt ${isoOf(r.countedAt)}, satang ${B(r.satang)}} (${where})`);
          if (prev && prev.status === "COUNTED" && prev.countedMs !== null && prev.countedMs !== countedMs) {
            const revEv = evs.find((e) => String(e.idempotencyKey).includes(`#reverse-doc_settle-${r.refId}-`) && e.payload?.rowId === r.id &&
              e.payload?.countedAt === new Date(prev.countedMs as number).toISOString() && B(e.payload?.satang) === prev.satang);
            if (!revEv) LIFE.push(`no reverse-doc_settle payload {rowId, old countedAt, old satang ${prev.satang}} (${where})`);
          }
        }
        SEEN.set(String(r.id), { status: String(r.status), satang: B(r.satang), where, t, countedMs });
      }
    };

    // F1.1 · F1.3 · F1.5(a) — invoice.paid delivered FIRST, then payment.recorded (full payment, no WHT)
    const A1 = await f1Fixture("คุณลำดับกลับ", 1_000_00, pAutoWon, 100_00);
    const a1 = await f1Pay(A1.inv, A1.grand);
    const r1 = await consume(evtOf(a1.paid ?? {}));
    await track(A1.d, "F1.1 paid");
    const mid = await f1State(A1.d, A1.inv);
    const r2 = await consume(evtOf(a1.pay ?? {}));
    await track(A1.d, "F1.1 pay");
    const s1 = await f1State(A1.d, A1.inv);
    const won1 = (await P.auditLog.count({ where: { tenantId: tidA, targetId: A1.d, action: "crm.deal.won.auto" } }).catch(() => -1)) as number;
    chk("C2.7-F1.1", "`account.invoice.paid` consumed BEFORE `account.payment.recorded` of the same (full) payment ⇒ paidSatang = the invoice grand total EXACTLY (not twice) · exactly one COUNTED row for the payment · at most one DOC_SETTLE row · Σ COUNTED never above the grand total (also right after the first delivery) · autoWonOnPaid once",
      a1.claimed && !!a1.paid && r1.ok && r2.ok && mid.sum <= A1.grand && f1Inv(s1, A1.grand, [a1.pid]) && s1.sum <= A1.grand && won1 === 1,
      `paid ${A1.grand} · 1 PAYMENT row · ≤1 settle · WON once`,
      `claimed=${a1.claimed} answers=${rd(r1)}/${rd(r2)} afterFirst Σ=${mid.sum}/${A1.grand} · ${f1Show(s1)} wonAudit=${won1}`);
    {
      const snap = (s: Awaited<ReturnType<typeof f1State>>) => j(s.rows.map((r) => [r.id, r.refType, r.refId, r.status, B(r.satang)]));
      const before = snap(s1);
      const rs: Res[] = [];
      rs.push(await consume(evtOf(a1.pay ?? {})), await consume(evtOf(a1.paid ?? {})));
      rs.push(await consume(evtOf(a1.paid ?? {})), await consume(evtOf(a1.pay ?? {})));
      for (let k = 0; k < 2; k += 1) rs.push(...(await Promise.all([consume(evtOf(a1.pay ?? {})), consume(evtOf(a1.paid ?? {})), consume(evtOf(a1.paid ?? {})), consume(evtOf(a1.pay ?? {}))])));
      await track(A1.d, "F1.3 replays");
      const s3 = await f1State(A1.d, A1.inv);
      chk("C2.7-F1.3", "replaying BOTH events of the F1.1 payment in both orders and in parallel (×2) changes nothing: the rows are byte-identical, paidSatang is still exactly the grand total, every delivery resolves",
        rs.every((r) => r.ok) && snap(s3) === before && f1Inv(s3, A1.grand, [a1.pid]),
        `unchanged · paid ${A1.grand}`, `answers=${rs.filter((r) => !r.ok).length} failed · same=${snap(s3) === before} · ${f1Show(s3)}`);
    }

    // F1.4 · F1.5(b) · F1.6 — WHT: partial P1 counted in order · P2 = the rest net of 3 % WHT · invoice.paid FIRST, then P2
    const W1 = await f1Fixture("คุณหักภาษีลำดับกลับ", 5_000_00);
    const p1Amt = Math.round(W1.grand * 0.4);
    const wht = Math.round(W1.grand * 0.03);
    const p2Amt = W1.grand - p1Amt - wht;
    const w1 = await f1Pay(W1.inv, p1Amt);
    const rw1 = await consume(evtOf(w1.pay ?? {}));
    await track(W1.d, "F1.4 P1");
    const w2 = await f1Pay(W1.inv, p2Amt, { whtAmountSatang: wht, whtRateBp: 300 });
    const rw2 = await consume(evtOf(w2.paid ?? {}));
    await track(W1.d, "F1.4 paid");
    const midW = await f1State(W1.d, W1.inv);
    const rw3 = await consume(evtOf(w2.pay ?? {}));
    await track(W1.d, "F1.4 P2");
    const sW = await f1State(W1.d, W1.inv);
    const docW = await docRow(W1.inv);
    chk("C2.7-F1.4", "WHT: partial P1 counted · P2 (the rest, net of 3 % WHT) makes the invoice PAID · `invoice.paid` consumed BEFORE P2's `payment.recorded` ⇒ paidSatang = the grand total EXACTLY · one COUNTED row per payment · ≤ 1 DOC_SETTLE · Σ COUNTED never above the grand total",
      w1.claimed && w2.claimed && !!w2.paid && docW?.status === "PAID" && wht > 0 && [rw1, rw2, rw3].every((r) => r.ok) && midW.sum <= W1.grand && f1Inv(sW, W1.grand, [w1.pid, w2.pid]),
      `paid ${W1.grand} = ${p1Amt} + ${p2Amt} + WHT ${wht}`,
      `claimed=${w1.claimed}/${w2.claimed} status=${docW?.status} afterPaid Σ=${midW.sum}/${W1.grand} · ${f1Show(sW)}`);
    // round 2 (controller ruling on the money review): restated — payment rows == cash and settle == WHT exactly, in EVERY order
    chk("C2.7-F1.5", "in every delivery order the payment rows hold exactly their CASH and the settle row exactly the WHT (F1.4: P1 · P2 · settle = WHT) — no settle row worth anything without WHT (F1.1) — the settle is computed from the book (grand − Σ non-voided payments), never from which CRM rows happen to exist yet",
      f1Rows(s1, { [a1.pid]: A1.grand }, 0) && f1Rows(sW, { [w1.pid]: p1Amt, [w2.pid]: p2Amt }, wht),
      `F1.1 payment=${A1.grand} settle 0/absent · F1.4 ${p1Amt}/${p2Amt} settle=${wht}`, `F1.1 ${f1Show(s1)} · F1.4 ${f1Show(sW)}`, "MAJOR");
    {
      const vp = await voidPay(tidA, accA, W1.inv, w2.pid, `ยกเลิก ${TAG}`);
      await pump([tidA]);
      await track(W1.d, "F1.6 void P2");
      const sV = await f1State(W1.d, W1.inv);
      const p2Row = sV.pays.find((r) => r.refId === w2.pid);
      const negative = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "CrmDeal" WHERE "systemId" = $1 AND "paidSatang" < 0`, crmA).catch(() => [{ n: -1 }])) as Any[];
      chk("C2.7-F1.6", "voiding P2 after the reversed order gives back exactly what it brought: paidSatang = P1 exactly · P2's row and the settle row REVERSED · P1 still COUNTED · no negative paidSatang in the shop",
        vp.ok && sV.paid === p1Amt && sV.sum === p1Amt && p2Row?.status === "REVERSED" && sV.settle.every((r) => r.status === "REVERSED") &&
          sV.pays.some((r) => r.refId === w1.pid && r.status === "COUNTED") && Number(negative[0]?.n ?? -1) === 0,
        `paid ${p1Amt}`, `void=${rd(vp)} ${f1Show(sV)} negatives=${String(negative[0]?.n)}`, "MAJOR");
    }

    // F1.2 — the two events of ONE payment raced by two worker PROCESSES, 10 rounds (odd rounds carry 3 % WHT)
    const ROUNDS = 10;
    type F1Round = { d: string; inv: string; grand: number; pid: string; cash: number; wht: number; paidEv: string; payEv: string; claimed: boolean };
    const mkRound = async (r: number, label: string): Promise<F1Round> => {
      const f = await f1Fixture(`${label} ${r}`, 700_00 + r * 11_00);
      const w = r % 2 === 1 ? Math.round(f.grand * 0.03) : 0;
      const p = await f1Pay(f.inv, f.grand - w, w > 0 ? { whtAmountSatang: w, whtRateBp: 300 } : {});
      return { d: f.d, inv: f.inv, grand: f.grand, pid: p.pid, cash: f.grand - w, wht: w, paidEv: String(p.paid?.id ?? ""), payEv: String(p.pay?.id ?? ""), claimed: p.claimed && !!p.paid };
    };
    /** who reached the deal lock first — round 2: the settle amount no longer depends on the order (it is the WHT read from the
     *  book), so the winner is read from the transaction ids: both money transactions take only ADVISORY locks before the deal
     *  lock, and their first xid-assigning statement (SELECT … FOR UPDATE of the deal rows) comes right after it ⇒ the xmin of the
     *  settle row vs the payment row orders the two lock acquisitions. A round without a settle row (no WHT) is "?" */
    const winnerOf = async (x: F1Round): Promise<"PAID" | "PAY" | "?"> => {
      const rows = ((await P.$queryRawUnsafe(`SELECT "refType", "refId", (xmin::text)::bigint AS x FROM "CrmDealPayment" WHERE "dealId" = $1`, x.d).catch(() => [])) ?? []) as Any[];
      const st = rows.find((r) => r.refType === "DOC_SETTLE" && r.refId === x.inv);
      const py = rows.find((r) => r.refType === "PAYMENT" && r.refId === x.pid);
      if (!st || !py) return "?";
      return BigInt(st.x) < BigInt(py.x) ? "PAID" : "PAY";
    };
    // round 2: the sweep straddles zero (payment.recorded first … invoice.paid well ahead) so both lock orders occur
    const SKEW = Array.from({ length: 10 }, (_v, r) => r * 60 - 150);
    const judge = async (rs: F1Round[]) => {
      const bad: string[] = [];
      for (const [i, x] of rs.entries()) {
        const s = await f1State(x.d, x.inv);
        if (!(x.claimed && f1Inv(s, x.grand, [x.pid]) && f1Rows(s, { [x.pid]: x.cash }, x.wht))) bad.push(`r${i}:${x.claimed ? "" : "UNCLAIMED "}grand=${x.grand} wht=${x.wht} ${f1Show(s)}`);
      }
      return bad;
    };
    {
      const rs: F1Round[] = [];
      for (let r = 0; r < ROUNDS; r += 1) rs.push(await mkRound(r, "คุณแข่งโพรเซส"));
      const t0 = Date.now() + 25_000;
      const gapMs = 2_000;
      const [wa, wb] = await Promise.all([
        spawnWorkers("deliverRounds", { ids: rs.map((x) => x.paidEv), t0, gapMs }, 1),
        spawnWorkers("deliverRounds", { ids: rs.map((x) => x.payEv), t0, gapMs, skewMs: SKEW.slice(0, ROUNDS) }, 1),
      ]);
      const answers = [...wa.answers, ...wb.answers];
      const wins = await Promise.all(rs.map(winnerOf));
      chk("C2.7-F1.2a", `[positive control] 2 worker PROCESSES delivered ${ROUNDS} rounds each (invoice.paid ∥ payment.recorded of the same payment · payment kick-off swept ${SKEW[0]}…${SKEW[ROUNDS - 1]} ms relative to invoice.paid), every delivery answered, and EACH side won the deal lock in ≥ 1 round — if red, F1.2 proves nothing`,
        wa.spawned && wb.spawned && answers.length === 2 * ROUNDS && answers.every((a) => a === "OK" || a.startsWith("LATE:")) && rs.every((x) => x.claimed) &&
          wins.includes("PAID") && wins.includes("PAY"),
        `${2 * ROUNDS} answers · both orders seen`, `spawned=${wa.spawned}/${wb.spawned} answers=${j(answers)} claimed=${rs.filter((x) => x.claimed).length}/${ROUNDS} lockWinner=${j(wins)}`);
      const bad = await judge(rs);
      chk("C2.7-F1.2", `the two events of one payment delivered in PARALLEL by 2 PROCESSES (own pools · own connections) × ${ROUNDS} rounds — every round: paidSatang = the grand total exactly, one COUNTED row for the payment, ≤ 1 settle row holding only the WHT`,
        bad.length === 0 && answers.length === 2 * ROUNDS, `${ROUNDS}/${ROUNDS} exact`, `${ROUNDS - bad.length}/${ROUNDS} exact · ${cut(bad.join(" | "), 900)}`);
    }
    {
      const rs: F1Round[] = [];
      for (let r = 0; r < ROUNDS; r += 1) rs.push(await mkRound(r, "คุณแข่งในโพรเซส"));
      const answers: Res[] = [];
      for (const [i, x] of rs.entries()) {
        const evPaid = await P.outboxEvent.findFirst({ where: { id: x.paidEv } });
        const evPay = await P.outboxEvent.findFirst({ where: { id: x.payEv } });
        const sk = SKEW[i] ?? 0;
        answers.push(...(await Promise.all([sleep(Math.max(0, -sk)).then(() => consume(evtOf(evPaid ?? {}))), sleep(Math.max(0, sk)).then(() => consume(evtOf(evPay ?? {})))])));
      }
      const bad = await judge(rs);
      const wins = await Promise.all(rs.map(winnerOf));
      chk("C2.7-F1.2b", `the same race in-process on separate pool connections (Promise.all · payment kick-off swept ${SKEW[0]}…${SKEW[ROUNDS - 1]} ms relative to invoice.paid) × ${ROUNDS} rounds ⇒ every round exact (lock winners are reported)`,
        bad.length === 0 && answers.every((r) => r.ok), `${ROUNDS}/${ROUNDS} exact`, `${ROUNDS - bad.length}/${ROUNDS} exact · failed=${answers.filter((r) => !r.ok).length} · lockWinner=${j(wins)} · ${cut(bad.join(" | "), 900)}`);
    }

    // ── round 2 (controller ruling on the money review of the C2.7-fix · 26 Sep): voids, re-payments, late events ──
    const f1Claim = async (keys: string[]) => {
      const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, idempotencyKey: { in: keys }, status: "PENDING" } })) ?? []) as F1Ev[];
      const claim = evs.length ? await P.outboxEvent.updateMany({ where: { id: { in: evs.map((e) => e.id) }, status: "PENDING" }, data: { status: "DONE", processedAt: new Date() } }) : { count: 0 };
      return { evs, claimed: evs.length === keys.length && Number(claim.count) === evs.length };
    };
    const f1Void = async (docId: string, pid: string) => {
      const vp = await voidPay(tidA, accA, docId, pid, `ยกเลิก ${TAG}`);
      const c = await f1Claim([`account.payment.voided#${pid}`]);
      return { vp, ev: c.evs[0] ?? null, claimed: vp.ok && vp.v?.ok !== false && c.claimed };
    };
    {
      // F1.7 — P1 (half) counted · P1 voided in the book · P1' (the full grand total) makes the invoice PAID · the void of P1 is
      //   delivered LAST, after P1' + invoice.paid in both orders ⇒ the deal holds exactly P1' (= the grand total)
      const run = async (order: "PAY_FIRST" | "PAID_FIRST") => {
        const F = await f1Fixture(`คุณจ่ายใหม่ ${order}`, 10_000_00);
        const p1Amt = Math.round(F.grand / 2);
        const a = await f1Pay(F.inv, p1Amt);
        const rs: Res[] = [await consume(evtOf(a.pay ?? {}))];
        await track(F.d, `F1.7 ${order} P1`);
        const v = await f1Void(F.inv, a.pid);
        const b = await f1Pay(F.inv, F.grand);
        for (const e of order === "PAY_FIRST" ? [b.pay, b.paid] : [b.paid, b.pay]) { rs.push(await consume(evtOf(e ?? {}))); await track(F.d, `F1.7 ${order} ${e?.type}`); }
        rs.push(await consume(evtOf(v.ev ?? {})));
        await track(F.d, `F1.7 ${order} void P1 (last)`);
        const s = await f1State(F.d, F.inv);
        const doc = await docRow(F.inv);
        const ok = a.claimed && v.claimed && b.claimed && !!b.paid && doc?.status === "PAID" && rs.every((r) => r.ok) && s.paid === F.grand && s.sum === F.grand &&
          s.pays.some((r) => r.refId === b.pid && r.status === "COUNTED" && B(r.satang) === F.grand) && s.pays.some((r) => r.refId === a.pid && r.status === "REVERSED");
        return { ok, show: `${order}: claimed=${a.claimed}/${v.claimed}/${b.claimed} status=${doc?.status} grand=${F.grand} P1=${p1Amt} P1'=${F.grand} → ${f1Show(s)}` };
      };
      const x = await run("PAY_FIRST");
      const y = await run("PAID_FIRST");
      chk("C2.7-F1.7", "P1 (half) counted · P1 voided · P1' = the grand total makes the invoice PAID · P1's void delivered LAST after P1' and invoice.paid in BOTH orders ⇒ the deal = the grand total exactly (P1' row = its cash · P1 row REVERSED) — a cap computed from CRM rows that the void has not reached yet must not shave P1'",
        x.ok && y.ok, "grand total in both orders", `${x.show} | ${y.show}`);
    }
    {
      // F1.8 — WHT: P1 = grand − 3 % paid net (PAID) ⇒ grand · void P1 ⇒ 0 · P1'' = the same net again (PAID again — the book does NOT
      //   emit account.invoice.paid a second time: its key is per document) ⇒ grand again, the SAME settle row reactivated, WON once
      const F = await f1Fixture("คุณจ่าย-ยกเลิก-จ่ายใหม่", 10_000_00, pAutoWon, 100_00);
      const wht = Math.round(F.grand * 0.03);
      const net = F.grand - wht;
      const a = await f1Pay(F.inv, net, { whtAmountSatang: wht, whtRateBp: 300 });
      const rs: Res[] = [await consume(evtOf(a.pay ?? {})), await consume(evtOf(a.paid ?? {}))];
      await track(F.d, "F1.8 P1+paid");
      const sA = await f1State(F.d, F.inv);
      const v = await f1Void(F.inv, a.pid);
      rs.push(await consume(evtOf(v.ev ?? {})));
      await track(F.d, "F1.8 void P1");
      const sV = await f1State(F.d, F.inv);
      const c = await f1Pay(F.inv, net, { whtAmountSatang: wht, whtRateBp: 300 });
      rs.push(await consume(evtOf(c.pay ?? {})));
      await track(F.d, "F1.8 P1''");
      const sR = await f1State(F.d, F.inv);
      const doc = await docRow(F.inv);
      const won = (await P.auditLog.count({ where: { tenantId: tidA, targetId: F.d, action: "crm.deal.won.auto" } }).catch(() => -1)) as number;
      const settleId = sA.settle[0]?.id;
      chk("C2.7-F1.8", "WHT: P1 (net of 3 % WHT) ⇒ deal = grand · void P1 ⇒ deal = 0 (settle REVERSED) · P1'' (same net + WHT) makes the invoice PAID again WITHOUT a second `account.invoice.paid` ⇒ deal = grand again: the SAME settle row reactivated to exactly the WHT · autoWonOnPaid fired once overall",
        a.claimed && !!a.paid && v.claimed && c.claimed && !c.paid && doc?.status === "PAID" && rs.every((r) => r.ok) &&
          sA.paid === F.grand && sV.paid === 0 && sV.settle.every((r) => r.status === "REVERSED") &&
          sR.paid === F.grand && sR.sum === F.grand && sR.settle.length === 1 && sR.settle[0]?.id === settleId && sR.settle[0]?.status === "COUNTED" && B(sR.settle[0]?.satang) === wht && won === 1,
        `${F.grand} → 0 → ${F.grand} · settle ${wht} reactivated · WON once`,
        `claimed=${a.claimed}/${v.claimed}/${c.claimed} secondPaidEvent=${!!c.paid} status=${doc?.status} grand=${F.grand} net=${net} wht=${wht} · after P1 ${sA.paid} · after void ${sV.paid} · after P1'' ${f1Show(sR)} · sameSettle=${sR.settle[0]?.id === settleId} wonAudit=${won}`);
    }
    {
      // F1.9 — a LATE payment.recorded: (a) the payment was voided before its event arrived · (b) payment voided + document voided
      const F = await f1Fixture("คุณมาช้า", 3_000_00);
      const part = Math.round(F.grand * 0.3);
      const a = await f1Pay(F.inv, part);
      const v = await f1Void(F.inv, a.pid);
      const rs: Res[] = [await consume(evtOf(v.ev ?? {})), await consume(evtOf(a.pay ?? {})), await consume(evtOf(v.ev ?? {}))];
      await track(F.d, "F1.9a late pay");
      const sa = await f1State(F.d, F.inv);
      const G = await f1Fixture("คุณเอกสารยกเลิก", 3_000_00);
      const partG = Math.round(G.grand * 0.3);
      const b = await f1Pay(G.inv, partG);
      const vb = await f1Void(G.inv, b.pid);
      const vd = await call(accSvc.voidDocument, tidA, accA, G.inv, `ยกเลิก ${TAG}`);
      const cd = await f1Claim([`account.document.voided#${G.inv}`]);
      rs.push(await consume(evtOf(vb.ev ?? {})), await consume(evtOf(cd.evs[0] ?? {})), await consume(evtOf(b.pay ?? {})));
      await track(G.d, "F1.9b late pay");
      const sb = await f1State(G.d, G.inv);
      const docG = await docRow(G.inv);
      const rowA = sa.pays.find((r) => r.refId === a.pid);
      const rowB = sb.pays.find((r) => r.refId === b.pid);
      chk("C2.7-F1.9", "a LATE `payment.recorded` whose payment is already voided (a) — or whose payment AND document are voided (b) — writes its row as REVERSED and counts nothing: the deal stays at 0 and a redelivered void changes nothing",
        a.claimed && v.claimed && b.claimed && vb.claimed && cd.claimed && docG?.status === "VOIDED" && rs.every((r) => r.ok) &&
          sa.paid === 0 && sa.sum === 0 && rowA?.status === "REVERSED" && sb.paid === 0 && sb.sum === 0 && rowB?.status === "REVERSED",
        "REVERSED rows · deals 0", `claimed=${a.claimed}/${v.claimed}/${b.claimed}/${vb.claimed}/${cd.claimed} docVoid=${rd(vd)}:${docG?.status} · (a) ${f1Show(sa)} · (b) ${f1Show(sb)}`);
    }
    {
      // F1.10 — a LATE void of a payment that was already replaced: P1 (WHT) PAID + settled · P1 voided in the book · P1'' re-pays
      //   (PAID again) and is delivered BEFORE P1's void ⇒ the late void takes P1 back but keeps the settle (the book is still PAID)
      const F = await f1Fixture("คุณยกเลิกช้า", 10_000_00);
      const wht = Math.round(F.grand * 0.03);
      const net = F.grand - wht;
      const a = await f1Pay(F.inv, net, { whtAmountSatang: wht, whtRateBp: 300 });
      const rs: Res[] = [await consume(evtOf(a.pay ?? {})), await consume(evtOf(a.paid ?? {}))];
      await track(F.d, "F1.10 P1+paid");
      const v = await f1Void(F.inv, a.pid);
      const c = await f1Pay(F.inv, net, { whtAmountSatang: wht, whtRateBp: 300 });
      rs.push(await consume(evtOf(c.pay ?? {})));
      await track(F.d, "F1.10 P1''");
      rs.push(await consume(evtOf(v.ev ?? {})));
      await track(F.d, "F1.10 late void P1");
      rs.push(await consume(evtOf(v.ev ?? {})));
      const s = await f1State(F.d, F.inv);
      const doc = await docRow(F.inv);
      chk("C2.7-F1.10", "a LATE void of an already-replaced payment (P1'' re-paid and counted first) takes back only P1: the settle row stays COUNTED at the WHT because the book is still PAID ⇒ deal = the grand total = P1'' cash + WHT",
        a.claimed && v.claimed && c.claimed && doc?.status === "PAID" && rs.every((r) => r.ok) && s.paid === F.grand && s.sum === F.grand &&
          s.settle.length === 1 && s.settle[0]?.status === "COUNTED" && B(s.settle[0]?.satang) === wht &&
          s.pays.some((r) => r.refId === a.pid && r.status === "REVERSED") && s.pays.some((r) => r.refId === c.pid && r.status === "COUNTED" && B(r.satang) === net),
        `deal ${F.grand} = ${net} + WHT ${wht}`, `claimed=${a.claimed}/${v.claimed}/${c.claimed} status=${doc?.status} ${f1Show(s)}`);
    }
    // ── round 3 (controller ruling on the second money review): the settle is RE-DERIVED from the book ──
    const settleKeys = async (d: string, inv: string) => {
      const ks = (((await P.outboxEvent.findMany({ where: { tenantId: tidA, idempotencyKey: { startsWith: `crm.deal.updated#${d}#` } }, select: { idempotencyKey: true } }).catch(() => [])) ?? []) as Any[]).map((r) => String(r.idempotencyKey));
      return { rev: ks.filter((k) => k.includes(`#reverse-doc_settle-${inv}-`)).length, set: ks.filter((k) => k.includes(`#docsettle-${inv}`)).length };
    };
    {
      // F1.12 — B1: void + re-pay with a DIFFERENT WHT (3 % → 1 %, 3 % → 0) in both orders of the late void, plus a partial-first
      //   variant ⇒ the deal = grand exactly and the settle = the NEW WHT (a stale COUNTED settle is re-derived through REVERSED)
      const variant = async (label: string, newBp: number, order: "VOID_FIRST" | "VOID_LAST", partialFirst: boolean, minSet = 1) => {
        const F = await f1Fixture(`คุณเปลี่ยนภาษี ${label}`, 10_000_00);
        const rs: Res[] = [];
        const p0 = partialFirst ? Math.round(F.grand * 0.4) : 0;
        let c0 = true;
        if (p0 > 0) {
          const a0 = await f1Pay(F.inv, p0);
          c0 = a0.claimed;
          rs.push(await consume(evtOf(a0.pay ?? {})));
          await track(F.d, `F1.12 ${label} P0`);
        }
        const rest = F.grand - p0;
        const w1 = Math.round(rest * 0.03);
        const a = await f1Pay(F.inv, rest - w1, { whtAmountSatang: w1, whtRateBp: 300 });
        rs.push(await consume(evtOf(a.pay ?? {})), await consume(evtOf(a.paid ?? {})));
        await track(F.d, `F1.12 ${label} P1+paid`);
        const v = await f1Void(F.inv, a.pid);
        const w2 = Math.round((rest * newBp) / 10_000);
        const b = await f1Pay(F.inv, rest - w2, w2 > 0 ? { whtAmountSatang: w2, whtRateBp: newBp } : {});
        const seq = order === "VOID_FIRST" ? [v.ev, b.pay] : [b.pay, v.ev];
        for (const e of seq) { rs.push(await consume(evtOf(e ?? {}))); await track(F.d, `F1.12 ${label} ${e?.type}`); }
        const s = await f1State(F.d, F.inv);
        const k = await settleKeys(F.d, F.inv);
        const doc = await docRow(F.inv);
        const settleOk = w2 > 0
          ? s.settle.length === 1 && s.settle[0]?.status === "COUNTED" && B(s.settle[0]?.satang) === w2
          : s.settle.every((r) => r.status !== "COUNTED" || B(r.satang) === 0);
        const ok = c0 && a.claimed && !!a.paid && v.claimed && b.claimed && doc?.status === "PAID" && rs.every((r) => r.ok) &&
          s.paid === F.grand && s.sum === F.grand && settleOk && k.rev >= 1 && k.set >= minSet;
        return { ok, show: `${label}: grand=${F.grand} P0=${p0} P1=${rest - w1}+${w1} → P2=${rest - w2}+${w2} → ${f1Show(s)} events rev=${k.rev} set=${k.set}` };
      };
      const vs = [
        await variant("3→1 void-first", 100, "VOID_FIRST", false),
        await variant("3→1 void-last", 100, "VOID_LAST", false, 2),
        await variant("3→0 void-first", 0, "VOID_FIRST", false),
        await variant("3→0 void-last", 0, "VOID_LAST", false),
        await variant("partial 3→1 void-first", 100, "VOID_FIRST", true),
        await variant("partial 3→1 void-last", 100, "VOID_LAST", true, 2),
      ];
      chk("C2.7-F1.12", "B1 — void + re-pay with a DIFFERENT withholding tax (3 %→1 %, 3 %→0 %, and a partial-payment-first variant), the void delivered before OR after the re-payment ⇒ deal = the grand total exactly · the settle row = the NEW WHT (none worth anything at 0 %) · the stale settle was taken back through REVERSED with its own events (a `reverse-doc_settle-…` and a `docsettle-…` crm.deal.updated exist · the 3→1 void-last variants show TWO `docsettle-…` = the one-transaction reverse→wake path)",
        vs.every((x) => x.ok), "6/6 exact", `${vs.filter((x) => x.ok).length}/6 · ${cut(vs.filter((x) => !x.ok).map((x) => x.show).join(" | ") || vs.map((x) => x.show).join(" | "), 1400)}`);
    }
    {
      // F1.13 — N1-deposit: WHT deducted on a DEPOSIT_RECEIPT is settled too (per-document settle row keyed by the receipt) —
      //   the book never emits account.invoice.paid for a deposit, so only the CRM-side trigger can close it
      const ct = await mkContact(tidA, crmA, "คุณมัดจำหักภาษี", userA);
      const d = await mkDeal(cA, ct, pPlain, { value: 100_00 });
      const dep = await mkDocForDeal(tidA, accA, crmA, d, "DEPOSIT_RECEIPT", 5_000_00);
      const wht = Math.round(dep.grand * 0.03);
      const a = await f1Pay(dep.id, dep.grand - wht, { whtAmountSatang: wht, whtRateBp: 300 });
      const r = await consume(evtOf(a.pay ?? {}));
      await track(d, "F1.13 deposit");
      const s = await f1State(d, dep.id);
      const doc = await docRow(dep.id);
      chk("C2.7-F1.13", "a DEPOSIT_RECEIPT paid net of 3 % WHT (no account.invoice.paid exists for deposits) ⇒ the deal = the receipt's grand total: the cash row + ONE settle row keyed by the receipt worth exactly the WHT",
        a.claimed && r.ok && dep.grand > 0 && s.paid === dep.grand && s.sum === dep.grand && s.settle.length === 1 && s.settle[0]?.status === "COUNTED" && B(s.settle[0]?.satang) === wht,
        `paid ${dep.grand} = ${dep.grand - wht} + WHT ${wht}`, `claimed=${a.claimed} ${rd(r)} status=${doc?.status} paidTotal=${B(doc?.paidTotal)} grand=${dep.grand} · ${f1Show(s)}`);
    }
    {
      // F1.14 — N3/N9: the book cannot be read (round 4: the ledger reader is a dependency — `deps.ledger`, default = the account
      //   facade — so the oracle hands in one that throws; no test marker in src/) ⇒ the settle path touches NOTHING and leaves a
      //   WARN (ids only) · the cash is still counted (the void event would take it back) · positive control: the real reader settles
      const F = await f1Fixture("คุณสมุดอ่านไม่ได้", 5_000_00);
      const wht = Math.round(F.grand * 0.03);
      const cash = F.grand - wht;
      const t0 = await dbNow();
      const a = await f1Pay(F.inv, cash, { whtAmountSatang: wht, whtRateBp: 300 });
      const boom = async () => { throw new Error("qc ledger unreadable"); };
      const ctxA = { tenantId: tidA, systemId: crmA };
      const rs: Res[] = [
        await call(PAY.recordDocPayment, ctxA, { documentId: F.inv, paymentId: a.pid, amountSatang: cash }, { ledger: boom }),
        await call(PAY.onInvoiceFullyPaid, ctxA, { documentId: F.inv }, { ledger: boom }),
      ];
      await track(F.d, "F1.14 ledger unreadable");
      const s = await f1State(F.d, F.inv);
      const warns = ((await P.opsEvent.findMany({ where: { tenantId: tidA, level: "WARN", createdAt: { gte: t0 } } }).catch(() => [])) as Any[])
        .filter((w) => `${w.message} ${w.detail ?? ""}`.includes(F.inv));
      const leak = warns.filter((w) => PII.some((x) => `${w.message} ${w.detail ?? ""}`.includes(x)));
      const rc = await call(PAY.onInvoiceFullyPaid, ctxA, { documentId: F.inv });
      await track(F.d, "F1.14 ledger readable again");
      const s2 = await f1State(F.d, F.inv);
      chk("C2.7-F1.14", "the book cannot be read (the ledger reader throws — injected through `deps.ledger`) ⇒ no settle row is written or changed, the deal keeps only the cash, and a WARN OpsEvent (Thai · ids only) names the document · [positive control] the same `onInvoiceFullyPaid` with the real reader settles exactly the WHT",
        a.claimed && rs.every((r) => r.ok) && s.settle.length === 0 && s.paid === cash &&
          warns.length >= 1 && leak.length === 0 && warns.every((w) => thai(w.message)) && rc.ok && s2.paid === F.grand && s2.settle.length === 1 && B(s2.settle[0]?.satang) === wht,
        `unreadable: settle 0 · paid ${cash} · WARN · readable: paid ${F.grand}`,
        `answers=${rs.map(rd).join("/")} unreadable: ${f1Show(s)} warns=${warns.length} leak=${leak.length} · readable: ${rd(rc)} ${f1Show(s2)}`);
    }
    chk("C2.7-F1.11", "C3.3/C3.2 contract across the whole F1 fixture: a CrmDealPayment row that is COUNTED in two consecutive snapshots keeps its satang and its countedAt (commissions key on `<id>#c<countedAt ms>`) · every COUNTED settle row has a `docsettle-…` event carrying {rowId, countedAt, satang} · reversedAt null after a wake · a re-derived settle's countedAt moves strictly forward and its `reverse-doc_settle-…` event carries the OLD countedAt and amount — the ONLY amount exception is a settle row re-derived from the book, which must have passed through REVERSED with its own `reverse-doc_settle-…` event in between — snapshots after every delivery step of F1.1 · F1.3 · F1.4 · F1.6 · F1.7–F1.10 · F1.12–F1.14",
      VIOL.length === 0 && LIFE.length === 0 && steps >= 15 && SEEN.size > 0, "0 unexplained amount/countedAt changes · every settle life has its events",
      `steps=${steps} rows=${SEEN.size} violations=${cut(VIOL.join(" | "), 500) || "-"} · life=${cut(LIFE.join(" | "), 600) || "-"} · via REVERSED=${VIA_REVERSE.length}`);
  }
  // ◂ ORACLE-EDIT C2.7-fix

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope: cross tenant · cross CRM system of the same tenant · cross visibility
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X1 · ขอบเขต ──");
  {
    const ctB = await mkContact(tidB, crmB, "คุณร้านอื่น", userA);
    const dB = await mkDeal(cB, ctB, pB, { lines: LINES });
    const qB = await call(CRM.deals?.issueQuotation, cB, owner, dB, {});
    const docB = String(qB.v?.docId ?? "");
    await issueDoc(tidB, accB, docB);
    const ivB = await call(CRM.deals?.issueInvoice, cB, owner, dB);
    const invB = String(ivB.v?.docId ?? "");
    await issueDoc(tidB, accB, invB);
    // shop A's bridge fed with shop B's document (a forged / mis-routed event) must write nothing
    const forged = { id: `${TAG}-forged`, tenantId: tidA, type: "account.payment.recorded", payload: { documentId: invB, paymentId: `${TAG}-fake`, amountSatang: 100_00, docType: "INVOICE" }, systemId: accA, unitId: null };
    const r = await consume(forged);
    const rowsB = await paysOf(dB);
    const rowsA = (await P.crmDealPayment.count({ where: { systemId: crmA, refId: `${TAG}-fake` } }).catch(() => 0)) as number;
    chk("C2.7-X1.1", "an event of shop A carrying shop B's documentId writes NOTHING in either shop (ids from the payload are always looked up with the event's tenantId)",
      r.ok && rowsB.length === 0 && rowsA === 0, "0 rows", `${rd(r)} B=${rowsB.length} A=${rowsA}`);
  }
  {
    // the deal lives in crmA; a real payment must never land on a deal of crmA2 (same tenant, other CRM system)
    const ct2 = await mkContact(tidA, crmA2, "คุณระบบสอง", userA);
    const d2 = await mkDeal(cA2, ct2, pA2, { lines: LINES });
    const R = await mkCompanyDeal();
    await payDoc(tidA, accA, R.inv, 70_00, finA);
    await pump([tidA]);
    const rows2 = await paysOf(d2);
    const deal2 = await dealRow(d2);
    const deal1 = await dealRow(R.d);
    chk("C2.7-X1.2", "cross-CRM-system inside ONE shop: the payment lands only on the deal of the system that owns the document — the other CRM system's deal keeps paidSatang 0 and gets no row",
      rows2.length === 0 && B(deal2?.paidSatang) === 0 && B(deal1?.paidSatang) === 70_00, "only the owning system",
      `crmA2 rows=${rows2.length} paid=${B(deal2?.paidSatang)} crmA paid=${B(deal1?.paidSatang)}`);
  }
  {
    const ct = await mkContact(tidA, crmA, "คุณมองไม่เห็น", userS2);
    const dOther = await mkDeal(cA, ct, pQuote, { value: 400_00, ownerUserId: userS2 });
    const s = await sell(tidA, unitA, posA, 100_00);
    const asCashier = await call(PAY.linkSaleToDeal, cA, cashier, { dealId: dOther, saleId: s.saleId });
    const asOwner = await call(PAY.linkSaleToDeal, cA, owner, { dealId: dOther, saleId: s.saleId });
    const money = await call(PAY.dealMoney, cA, cashier, dOther);
    chk("C2.7-X1.3", "a cashier who cannot see that deal gets NOT_FOUND (not 403, no data in the message) from linkSaleToDeal and dealMoney · the owner may link it (positive control)",
      refused(asCashier, "NOT_FOUND") && !PII.some((p) => p.length > 5 && asCashier.msg.includes(p)) && asOwner.ok && refused(money, "NOT_FOUND"),
      "404 for the blind actor, ok for the owner", `cashier=${rd(asCashier)} owner=${rd(asOwner)} money=${rd(money)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 / X8 / X9 — dangerous input · PDPA · danger + audit
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── X6 · X8 · X9 ──");
  {
    const S2 = await mkCompanyDeal();
    const bad = [
      { documentId: S2.inv, paymentId: `${TAG}-neg`, amountSatang: -500_00, docType: "INVOICE" },
      { documentId: S2.inv, paymentId: `${TAG}-float`, amountSatang: 12.34, docType: "INVOICE" },
      { documentId: S2.inv, paymentId: `${TAG}-huge`, amountSatang: Number.MAX_SAFE_INTEGER, docType: "INVOICE" },
      { documentId: S2.inv, paymentId: "", amountSatang: 100, docType: "INVOICE" },
    ];
    const rs: Res[] = [];
    for (const payload of bad) rs.push(await consume({ id: `${TAG}-bad`, tenantId: tidA, type: "account.payment.recorded", payload, systemId: accA, unitId: null }));
    const rows = await paysOf(S2.d);
    const deal = await dealRow(S2.d);
    const okPay = await payDoc(tidA, accA, S2.inv, 100_00, finA);
    await pump([tidA]);
    const dealOk = await dealRow(S2.d);
    chk("C2.7-X6.1", "hostile money payloads (negative · fractional satang · MAX_SAFE_INTEGER · empty paymentId) are refused without writing anything and never move paidSatang; a well-formed payment of the same invoice is still counted (positive control)",
      rows.length === 0 && B(deal?.paidSatang) === 0 && okPay.ok && B(dealOk?.paidSatang) === 100_00 && rs.every((r) => r.ok || r.code !== "MISSING_FUNCTION"),
      "nothing written, control counted", `rows=${rows.length} paid=${B(deal?.paidSatang)}→${B(dealOk?.paidSatang)} answers=${rs.map((r) => (r.ok ? "ok" : r.err.slice(0, 18))).join(",")}`);
  }
  {
    // ORACLE-EDIT (oracle author · 24 Sep · ruling round 2): the sweep now covers EVERY throwaway tenant of this run and
    //   the WARN rows the new rules write (SF-4 "one document, several deals" · SF-5 "billing note" · the wrapped
    //   `linkSaleToDeal` failure of `registerSaleAction`) — those messages carry document/deal/sale ids and are the newest
    //   PII surface of the money path. A WARN written WITHOUT a tenantId is swept too (source "crm"): it is still a log
    //   line an owner/ops person reads. The count of WARN rows is asserted as well, so the sweep can never pass vacuously.
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: { in: TENANTS }, createdAt: { gte: RUN_START } } })) as Any[])
      .filter((e) => String(e.type).startsWith("crm."));
    const blob = evs.map((e) => j(e.payload)).join("\n");
    const opsRows = ((await P.opsEvent.findMany({
      where: { createdAt: { gte: RUN_START }, OR: [{ tenantId: { in: TENANTS } }, { AND: [{ tenantId: null }, { source: "crm" }] }] },
    }).catch(() => [])) as Any[]);
    const warnRows = opsRows.filter((o) => String(o.level) === "WARN");
    const ops = opsRows.map((o) => `${o.message} ${j(o.detail)}`).join("\n");
    const logs = LOGS.join("\n");
    const leak = PII.filter((s) => s.length > 5 && (blob.includes(s) || ops.includes(s) || logs.includes(s)));
    chk("C2.7-X8.1", "no name, phone or e-mail of this run appears in any crm.* outbox payload, OpsEvent row (including every WARN the money path writes — ambiguous document, billing note, a failed link after a paid bill) or log line: ids and satang only",
      leak.length === 0 && warnRows.length >= 1, "no PII · WARN rows actually present",
      leak.length ? cut(leak.map((s) => s.slice(0, 10)).join(","), 140) : `events=${evs.length} ops=${opsRows.length} warns=${warnRows.length} (${ops.length}B swept)`);
  }
  {
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, createdAt: { gte: RUN_START } } })) as Any[]).filter((e) => String(e.type).startsWith("crm."));
    const keys = evs.map((e) => String(e.idempotencyKey ?? ""));
    const shaped = keys.every((k) => k === "" || /^crm\.[a-z0-9_.]+#/.test(k));
    const dup = keys.filter((k, i) => k !== "" && keys.indexOf(k) !== i);
    chk("C2.7-X8.2", "every crm.* event the money path emitted uses the `crm.<type>#<id>#<seq>` key shape (R-C.8) and no key was written twice",
      shaped && dup.length === 0, "keys shaped, unique", `events=${evs.length} bad=${cut(keys.filter((k) => k !== "" && !/^crm\.[a-z0-9_.]+#/.test(k)).join(","), 100) || "-"} dup=${dup.length}`, "MAJOR");
  }
  {
    const T2 = await mkCompanyDeal();
    const pr = await payDoc(tidA, accA, T2.inv, 55_00, finA);
    await pump([tidA]);
    const audits = ((await P.auditLog.findMany({ where: { tenantId: tidA, targetId: T2.d, createdAt: { gte: RUN_START } } })) as Any[]).map((a) => String(a.action));
    const ct = await mkContact(tidA, crmA, "คุณผูกบิล", userA);
    const d = await mkDeal(cA, ct, pQuote, { value: 500_00 });
    const s = await sell(tidA, unitA, posA, 100_00);
    await call(PAY.linkSaleToDeal, cA, owner, { dealId: d, saleId: s.saleId });
    const linkAudit = await P.auditLog.count({ where: { tenantId: tidA, targetId: d, action: "crm.deal.pos.link" } });
    chk("C2.7-X9.1", "every money mutation leaves an audit row: the automatic payment path audits the deal (actorType SYSTEM) and `linkSaleToDeal` writes `crm.deal.pos.link` for the cashier who pressed it",
      pr.ok && audits.length >= 1 && linkAudit === 1, "audited", `paymentAudits=${cut(audits.join(","), 120) || "-"} linkAudit=${linkAudit}`);
  }
  {
    const ct = await mkContact(tidA, crmA, "คุณชนะอัตโนมัติ", userA);
    const d = await mkDeal(cA, ct, pAutoWon, { value: 100_00 });
    const s = await sell(tidA, unitA, posA, 100_00);
    await call(PAY.linkSaleToDeal, cA, owner, { dealId: d, saleId: s.saleId });
    await pump([tidA]);
    const deal = await dealRow(d);
    const rows = ((await P.auditLog.findMany({ where: { tenantId: tidA, targetId: d } })) as Any[]);
    const autoAudit = rows.filter((a) => /won|move/i.test(String(a.action)));
    const systemActor = autoAudit.some((a) => String(a.actorType ?? "") === "SYSTEM" || a.actorId === null);
    chk("C2.7-X9.2", "the automatic transitions are attributable: auto-WON (paid ≥ value) and auto-invoice write an audit row whose actor is the SYSTEM, never a random user",
      deal?.kind === "WON" && autoAudit.length >= 1 && systemActor, "audited as SYSTEM",
      `kind=${deal?.kind} audits=${cut(autoAudit.map((a) => `${a.action}/${a.actorType ?? "-"}`).join(","), 140) || "-"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U — PERMANENT RULE: a shop still on uiVersion 1 (every real shop today) must not change by one byte
  // ═════════════════════════════════════════════════════════════════════════════
  out("\n── U · uiVersion 1 ──");
  {
    const ctV = await mkContact(tidV, crmV, "คุณร้าน v1", userA);
    const dV = await mkDeal(cV, ctV, pV, { value: 400_00 });
    const docV = await mkDocReal(tidV, accV, "INVOICE", 400_00);
    await P.accountDocument.update({ where: { id: docV.id }, data: { refSystemId: crmV, refType: "CrmDeal", refId: dV } }).catch(() => null);
    await P.crmDeal.update({ where: { id: dV }, data: { invoiceDocId: docV.id } }).catch(() => null);
    const pr = await payDoc(tidV, accV, docV.id, Math.max(1, docV.grand), finV);
    const drained = await pump([tidV]);
    const deal = await dealRow(dV);
    const rows = await paysOf(dV);
    const ct = await P.crmContact.findFirst({ where: { id: ctV.id } });
    chk("C2.7-U.1", "uiVersion 1: a real payment of a v1 shop's invoice leaves the CRM side untouched (no CrmDealPayment, paidSatang 0, lifecycle unchanged) while accounting completes normally and the queue still drains",
      pr.ok && pr.v?.ok === true && drained && rows.length === 0 && B(deal?.paidSatang) === 0 && ct?.lifecycleStage !== "CUSTOMER" && !!deal?.invoiceDocId,
      "accounting yes · CRM no", `pay=${rd(pr)} drained=${drained} rows=${rows.length} paid=${B(deal?.paidSatang)} life=${ct?.lifecycleStage}`);
    // the v1 shop's POS bill must behave exactly as before: the sale itself, its accounting and its member steps run; CRM does not
    const sV = await sell(tidV, unitV, posV, 150_00);
    const drained2 = await pump([tidV]);
    const saleV = await saleRow(sV.saleId);
    const rows2 = (await P.crmDealPayment.count({ where: { systemId: crmV } }).catch(() => 0)) as number;
    chk("C2.7-U.3", "uiVersion 1: a POS bill of that shop is sold, posted and drained exactly as before C2.7 — and CRM wrote nothing for it (the pilot switch is the only thing that turns the money bridge on)",
      sV.ok && saleV?.status === "PAID" && drained2 && rows2 === 0, "sale ok · 0 CRM rows",
      `sale=${rd(sV.r)} status=${saleV?.status} drained=${drained2} crmRows=${rows2}`);
    const lr = await call(PAY.linkSaleToDeal, cV, owner, { dealId: dV, saleId: sV.saleId });
    const od = await call(PAY.openDealsForParty, cV, owner, ctV.partyId);
    const dfd = await call(PAY.dealForDoc, tidV, docV.id, owner);
    chk("C2.7-U.2", "uiVersion 1: linkSaleToDeal is refused with CrmV2DisabledError and nothing is written · openDealsForParty answers [] · dealForDoc answers null (no v2 surface leaks into a v1 shop)",
      isV1Refusal(lr, V1MSG) && (await P.crmDealPayment.count({ where: { systemId: crmV } }).catch(() => 0)) === 0 &&
        od.ok && Array.isArray(od.v) && od.v.length === 0 && dfd.ok && dfd.v === null,
      "refused · [] · null", `link=${rd(lr)} open=${od.ok ? (od.v ?? []).length : od.err} dealForDoc=${dfd.ok ? j(dfd.v) : dfd.err}`);
    // positive control: the same shop switched to 2 counts the NEXT payment (and the v1-era payment stays uncounted — see the report)
    await setCrm(crmV, { uiVersion: 2 });
    const doc2 = await mkDocReal(tidV, accV, "INVOICE", 200_00);
    await P.accountDocument.update({ where: { id: doc2.id }, data: { refSystemId: crmV, refType: "CrmDeal", refId: dV } }).catch(() => null);
    await P.crmDeal.update({ where: { id: dV }, data: { invoiceDocId: doc2.id } }).catch(() => null);
    const pay2 = Math.max(1, doc2.grand);
    const pr2 = await payDoc(tidV, accV, doc2.id, pay2, finV);
    await pump([tidV]);
    const dealNow = await dealRow(dV);
    const rowsNow = await paysOf(dV);
    await setCrm(crmV, { uiVersion: 1 });
    chk("C2.7-U.4", "[positive control] the same shop switched to uiVersion 2 counts the NEXT payment immediately (the gate is read live, not cached) — so U.1's silence is the gate, not a broken fixture. The payment that arrived while the shop was on v1 is NOT counted retroactively (documented semantics — controller decision in the report)",
      pr2.ok && rowsNow.length === 1 && B(dealNow?.paidSatang) === pay2,
      "counted after the switch", `pay=${rd(pr2)} rows=${rowsNow.length} paid=${B(dealNow?.paidSatang)}`);
  }

  if (FIXTURE_NOTES.length) out(`  ℹ️  ${FIXTURE_NOTES.join(" · ")}`);
  if (FETCHES.length) out(`  ℹ️  outbound fetch attempts stubbed: ${FETCHES.length} (${cut(Array.from(new Set(FETCHES)).join(" · "), 160)})`);
} catch (e) {
  chk("C2.7-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — the lab triggers first (they would break the deletes), then every row of the throwaway tenants
  //   (4 passes over every table with a tenantId), the systems/units/tenants and the throwaway users. No drainOutbox.
  // ═════════════════════════════════════════════════════════════════════════════
  try {
    for (const t of TRIG_TABLES) await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG}_${t.toLowerCase()} ON "${t}"`).catch(() => 0);
    await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIG}_fn() CASCADE`).catch(() => 0);
  } catch { /* ignore */ }
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(r?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      const trig = ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'qc_c27_%'`).catch(() => [{ n: 0 }])) as Any[])?.[0]?.n ?? 0;
      chk("C2.7-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant, every row it owned, the throwaway users and the lab triggers are gone",
        left.length === 0 && tenants === 0 && users === 0 && Number(trig) === 0, "0 rows · 0 tenants · 0 users · 0 triggers",
        `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} triggers=${trig}`, "MAJOR");
    } catch (e) {
      chk("C2.7-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
out(`\n${passed === total ? "🟢" : "🔴"} C2.7: ${passed}/${total}`);
out(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
