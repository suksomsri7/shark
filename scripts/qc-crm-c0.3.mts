// QC — CRM v2 WO C0.3: the facades CRM needs in OTHER modules
//      A account · B chat · C hr · D inventory · E party · F approval registry
// Fable oracle (oracle writer) · the C0.3 builders must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c0.3.mts
// requires: crm-seed
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE PROVES (brief: ledger/crm-briefs/crm-brief-C0.3.md + its "Controller addendum 2026-09-17")
//
//   SA  account — the GOLDEN check (SA.1–SA.6) and the `lines[]` precedence (SA.8c: valueSatang is ignored): after `createExternalQuotation` grows optional
//       `lines[]`, a LEGACY-SHAPED call must still produce a byte-identical `AccountDocument` +
//       `AccountDocumentLine`. The expectation is a FROZEN TABLE of every column that matters,
//       hand-computed from the code as it stands on session/crm @ C0.2 — not "it didn't throw",
//       not "the row exists". Three independent anchors (see GOLDEN_DOC below).
//       Then: 3-line totals/VAT/discount, convert→invoice with `sourceDocId`, `respondQuotation`
//       status guard + signer evidence, `docLinkInfo` chain, `ensureAccountContact`.
//   SB  chat — `sendLineToParty` never throws and answers `{ok:false}` with DIFFERENT reasons for
//       "this party has no LINE contact" vs "the LINE contact was found but the shop has no
//       connected LINE account" (a constant refusal cannot pass) · `listConversationsByParty` is
//       SHOP-WIDE across every CHAT system of the tenant (controller decision 6) and still honours
//       the unit gate (`canAccessConvUnit`): a conversation the actor may not see must be ABSENT,
//       a conversation with `unitId = null` must be PRESENT, and every row is tagged with its own systemId.
//   SC  hr — new facade: signatures + `employeeOfUser` + `isOnLeave` (incl. the Thai-date trap).
//   SD  inventory — new facade: signatures + `searchItems` (name/sku/barcode, archived excluded, take clamp).
//   SE  party — `updateContactInfo` (normalise phone · merge candidates instead of failing · tx passthrough).
//   SF  approval — the 4 CRM entity types + the missing `AccountDocument` in the allowlist,
//       a policy really can be created/resolved/submitted for each of the 5.
//   X1  scope — every new read/write refuses a foreign tenant (returns nothing/false, never a foreign row).
//   X3  `ensureAccountContact` ≥10 truly parallel calls, repeated rounds → exactly ONE row: once
//       in-process (12 at a time) and once across 4 separate worker PROCESSES (separate PrismaClients,
//       separate pools, one shared release instant) — an in-process mutex passes the first and fails the second.
//   X8  PDPA — no phone / e-mail written into any log, AuditLog, OpsEvent or NEW outbox payload
//       that the new functions touch (see the X8 block for the pre-existing-debt exclusion).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// HOUSE RULES HONOURED (crm-brief-COMMON.md §"Oracle house style")
//   1) SKIP guard — nothing of C0.3 exists yet ⇒ print SKIPPED + JSON_SUMMARY {skipped:true} + exit 0
//      WITHOUT opening a database connection.
//   2) chk(id, title, ok, expected, actual, sev) with ids `C0.3-S<A..F>.<n>` / `C0.3-X<k>.<n>`.
//   3) 🔴 DATA SAFETY: this file writes ACCOUNT data, so it NEVER touches the shared QC books.
//      Everything happens inside TWO THROWAWAY TENANTS (`qc-c03-<rand>` / `…-b`) created here and
//      deleted in `finally` — every table that has a `tenantId` column is swept (4 passes, FK-safe),
//      then the tenants themselves. C0.3-CLEAN proves 0 rows are left behind.
//   4) last line = `JSON_SUMMARY {...}`.
//   5) modules that may not exist yet are imported with `await import("…" as string)`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard (rule 1) — the deliverables of C0.3. No DB connection is opened above this line.
// Guarded on the two things that cannot exist before the work order is built:
//   · the hr facade file (part C creates it)          · `ensureAccountContact` + `docLinkInfo` (part A)
// ═══════════════════════════════════════════════════════════════════════════════════
const ACC_FACADE_FILE = "src/lib/modules/account/index.ts";
const accFacadeSrc = existsSync(ACC_FACADE_FILE) ? readFileSync(ACC_FACADE_FILE, "utf8") : "";
const MISSING: string[] = [];
if (!existsSync("src/lib/modules/hr/index.ts")) MISSING.push("src/lib/modules/hr/index.ts");
if (!existsSync("src/lib/modules/inventory/index.ts")) MISSING.push("src/lib/modules/inventory/index.ts");
if (!/\bensureAccountContact\b/.test(accFacadeSrc)) MISSING.push("account facade: ensureAccountContact");
if (!/\bdocLinkInfo\b/.test(accFacadeSrc)) MISSING.push("account facade: docLinkInfo");
if (MISSING.length > 0) {
  console.log(`⚠️  SKIPPED — WO C0.3 not built yet (${MISSING.join(" · ")})`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();

// ═══════════════════════════════════════════════════════════════════════════════════
// X3 WORKER MODE — this same file re-invoked as a child process (see C0.3-X3.2).
//   argv: --x3-worker <tenantId> <accSystemId> <partyId> <name> <startAtMs> <calls>
//   Each worker = its OWN process = its OWN PrismaClient = its OWN pool = real separate connections.
//   All workers sleep until the same wall-clock instant, then fire `calls` calls at once.
// ═══════════════════════════════════════════════════════════════════════════════════
const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--x3-worker");
/** contact id out of whatever shape `ensureAccountContact` returns (the brief does not fix one) */
const idOf = (r: Any): string =>
  typeof r === "string" ? r : (r?.id ?? r?.contactId ?? r?.contact?.id ?? `?${JSON.stringify(r ?? null)}`);
if (WORKER_AT >= 0) {
  const [wTenant, wSystem, wParty, wName, wStart, wCalls] = ARGV.slice(WORKER_AT + 1);
  const ACCW = (await import("@/lib/modules/account")) as Any;
  const waitMs = Number(wStart) - Date.now();
  if (waitMs > 0) await new Promise<void>((r) => setTimeout(r, waitMs));
  const out = await Promise.all(
    Array.from({ length: Number(wCalls) }, () =>
      ACCW.ensureAccountContact({ tenantId: wTenant, systemId: wSystem }, { partyId: wParty, name: wName, legalType: "COMPANY" })
        .then((r: Any) => idOf(r))
        .catch((e: Any) => `ERR:${e instanceof Error ? e.message : String(e)}`),
    ),
  );
  console.log(`X3WORKER ${JSON.stringify(out)}`);
  const dbw = (await import("@/lib/core/db")) as Any;
  await dbw.prisma.$disconnect();
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
const cut = (s: string, n = 260) => (s.length > n ? `${s.slice(0, n)}…` : s);
/** JSON that survives BigInt / Decimal / Date (Prisma rows carry all three) */
const j = (v: Any): string =>
  JSON.stringify(v, (_k, x) =>
    typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x?.toFixed && x?.s !== undefined ? x.toString() : x,
  );
const thai = (s: unknown) => typeof s === "string" && s.trim().length > 0 && /[ก-๙]/.test(s);
/** call anything without letting a missing/throwing function abort the whole file */
const call = async (fn: Any, ...args: Any[]): Promise<{ ok: boolean; v: Any; err: string }> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "ไม่มีฟังก์ชันนี้บน facade" };
  try {
    return { ok: true, v: await fn(...args), err: "" };
  } catch (e) {
    return { ok: false, v: undefined, err: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
};

// ─────────── evidence recorder (X8) ───────────
// `watch(label, fn)` runs one NEW-function call with console captured, then harvests every
// AuditLog / OpsEvent / OutboxEvent row our two tenants gained during that window.
type Evidence = { label: string; logs: string[]; audits: Any[]; ops: Any[]; outbox: Any[] };
const EVIDENCE: Evidence[] = [];
let TENANTS: string[] = [];
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
    const where = { tenantId: { in: TENANTS }, createdAt: { gte: t0 } };
    const audits = TENANTS.length ? await P.auditLog.findMany({ where }).catch(() => []) : [];
    const ops = TENANTS.length ? await P.opsEvent.findMany({ where }).catch(() => []) : [];
    const outbox = TENANTS.length ? await P.outboxEvent.findMany({ where }).catch(() => []) : [];
    EVIDENCE.push({ label, logs, audits, ops, outbox });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// 🔒 THE GOLDEN EXPECTATION (C0.3-SA.1/SA.2) — frozen from the code on session/crm @ C0.2
//
// A LEGACY call (no `lines`, no `discountAmount`, no `validUntil`, no `note`, no `createdById`)
//     createExternalQuotation({tenantId, sourceSystemId=<CRM>, sourceKind:"CRM", refType:"CrmDeal",
//                              refId, title, valueSatang: 123456, customer:{name,phone,email}, partyId})
// travels: findAccountLinkFor → findDocByRef → findOrCreateCustomerContact → createDocument(
//     {docType:"QUOTATION", contactId, lines:[{description:title, qty:1, unitPrice:valueSatang}]})
// → setDocExternalRef(docId, {refSystemId, refType, refId}).
//
// Everything below is what `createDocument` (service.ts:1873) writes for that input when the book is
// VAT-registered at 7 % (this file creates the AccountSettings row itself, so nothing depends on a seed):
//   subTotal   = incomeNet + docDiscount = 123456 + 0          = 123456
//   vatAmount  = round(123456 × 0.07)    = round(8641.92)      =   8642
//   grandTotal = 123456 + 8642                                  = 132098
//   the ONE line: qty 1 · unitPrice 123456 · discount 0 · vatRateBp = settings.vatRateBp (700) ·
//                 amount = lineAmount = 1×123456 − 0 = 123456 · unitName/productId/accountId null
//   the document: status DRAFT · direction OUT · source MANUAL (createExternalQuotation does NOT set
//                 source:"CRM" today — a builder who "improves" that breaks byte-equality) · tags [] ·
//                 vatMode EXCLUDE · vatTiming/taxPointBasis ON_ISSUE · docNo null (not issued) ·
//                 discountAmount 0 · depositDeducted 0 · paidTotal 0 · whtAmount 0 ·
//                 validUntil/dueDate/note/createdById/sourceDocId null · etaxStatus NOT_SENT
// Two more anchors so that "both sides changed together" cannot fake it:
//   SA.3 every OTHER column of the row must still be null/[]  (catches a newly written column)
//   SA.4 relational: a direct `createDocument` call with the legacy shape must produce the same projection
// ═══════════════════════════════════════════════════════════════════════════════════
const GOLD_VALUE = 123_456; // satang
const GOLDEN_DOC: Record<string, Any> = {
  docType: "QUOTATION",
  status: "DRAFT",
  direction: "OUT",
  docNo: null,
  vatMode: "EXCLUDE",
  vatTiming: "ON_ISSUE",
  taxPointBasis: "ON_ISSUE",
  subTotal: 123_456,
  discountAmount: 0,
  vatAmount: 8_642,
  whtAmount: 0,
  depositDeducted: 0,
  grandTotal: 132_098,
  paidTotal: 0,
  sourceDocId: null,
  sourcePaymentId: null,
  validUntil: null,
  dueDate: null,
  note: null,
  internalNote: null,
  adjustReason: null,
  createdById: null,
  source: "MANUAL",
  tags: [],
  priceMode: null,
  discountMode: null,
  salesUserId: null,
  reference: null,
  autoTaxInvoice: null,
  contactSnapshot: null,
  categoryId: null,
  etaxStatus: "NOT_SENT",
  etaxMeta: null,
  pdfUrl: null,
  publicToken: null,
  acceptedAt: null,
  approvedById: null,
  replacedById: null,
  voidedAt: null,
  voidReason: null,
  whtIncomeType: null,
  whtRateBp: null,
  whtFiledPeriodKey: null,
  adjustAccountCode: null,
};
const GOLDEN_LINE: Record<string, Any> = {
  sortOrder: 0,
  qty: 1,
  unitName: null,
  unitPrice: 123_456,
  discount: 0,
  vatRateBp: 700,
  amount: 123_456,
  productId: null,
  accountId: null,
  whtIncomeType: null,
  whtRateBp: null,
  unitCost: null,
};
// columns that legitimately differ per run (SA.3 ignores them)
const DOC_FREE = new Set(["id", "tenantId", "systemId", "contactId", "refSystemId", "refType", "refId", "issueDate", "createdAt", "updatedAt"]);

// ═══ 3-line expectation (C0.3-SA.7/SA.8) — hand-computed from totals.computeTotals ═══
//   every number below is SATANG.
//   lines (vatMode EXCLUDE · book VAT 7 %):
//     L1 qty 2   × 150000  discount 0      vatRateBp omitted → book default 700 → base 300000
//     L2 qty 2.5 × 100000  discount 50000  vatRateBp 0                         → base 200000
//     L3 qty 1   × 200000  discount 0      vatRateBp −1 (exempt)               → base 200000
//   baseSum 700000 · doc-level discount 50000 → allocateProportional over [300000,200000,200000]
//     raw 21428.57 / 14285.71 / 14285.71 → floors 21428/14285/14285 (=49998) + 2 by largest remainder
//     → [21428, 14286, 14286]   (which of L2/L3 gets the spare satang cannot move the totals: both
//                                are 0 %-rated, so vatAmount/grandTotal are identical either way)
//   afterBase 278572 / 185714 / 185714
//     L1 vat = round(278572 × 0.07) = round(19500.04) = 19500 · L2 and L3 rate 0 → vat 0
//   incomeNet 650000 → subTotal = 650000 + 50000 = 700000 · vatAmount = 19500
//   grandTotal = (278572 + 19500) + 185714 + 185714 = 669500
const LINES_IN = [
  { description: "งานติดตั้ง", qty: 2, unitPrice: 150_000, vatRateBp: undefined as number | undefined, discount: 0, unitName: "ชุด" },
  { description: "ค่าบริการรายเดือน", qty: 2.5, unitPrice: 100_000, vatRateBp: 0, discount: 50_000, unitName: "เดือน" },
  { description: "ค่าเดินทาง (ยกเว้น VAT)", qty: 1, unitPrice: 200_000, vatRateBp: -1, discount: 0, unitName: null as string | null },
];
const LINES_DOC_DISCOUNT = 50_000;
const LINES_EXPECT = { subTotal: 700_000, vatAmount: 19_500, grandTotal: 669_500 };
const LINES_EXPECT_ROWS = [
  { sortOrder: 0, qty: 2, unitPrice: 150_000, discount: 0, vatRateBp: 700, amount: 300_000, unitName: "ชุด" },
  { sortOrder: 1, qty: 2.5, unitPrice: 100_000, discount: 50_000, vatRateBp: 0, amount: 200_000, unitName: "เดือน" },
  { sortOrder: 2, qty: 1, unitPrice: 200_000, discount: 0, vatRateBp: -1, amount: 200_000, unitName: null },
];

// ─────────────────────────── state ───────────────────────────
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c03-${rand}`;
// 🔴 PDPA sentinels (X8): these two strings must never show up in a log / audit / OpsEvent /
//    NEW outbox payload. This file itself never prints them.
const SENT_PHONE = `08${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
const SENT_EMAIL = `${TAG}-contact@qc.local`;
const FAKE_USER = `${TAG}-user`;
const T0 = new Date(Date.now() - 1000);
let tidA = "";
let tidB = "";

console.log(`\n═══ QC CRM v2 · C0.3 — facades in other modules ═══`);
console.log(`[env] DB ${host} · tag ${TAG}\n`);

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — two throwaway tenants (A = subject · B = the foreign shop for every X1 check)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  const ACC = (await import("@/lib/modules/account")) as Any;
  const accSvc = (await import("@/lib/modules/account/service")) as Any;
  const accEvents = (await import("@/lib/modules/account/events")) as Any;
  const totals = (await import("@/lib/modules/account/totals")) as Any;
  const PARTY = (await import("@/lib/modules/party")) as Any;
  const CHAT = (await import("@/lib/modules/chat")) as Any;
  const chatSvc = (await import("@/lib/modules/chat/service")) as Any;
  const apprSvc = (await import("@/lib/modules/approval/service")) as Any;
  const apprLabels = (await import("@/lib/modules/approval/labels")) as Any;
  const effects = (await import("@/lib/approval-effects")) as Any;
  const hooks = (await import("@/lib/webhooks/labels")) as Any;
  const HR = (await import("@/lib/modules/hr" as string).catch(() => null)) as Any;
  const INV = (await import("@/lib/modules/inventory" as string).catch(() => null)) as Any;

  const tA = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tidA = tA.id;
  const tB = await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } });
  tidB = tB.id;
  TENANTS = [tidA, tidB];
  const unitA = await P.businessUnit.create({ data: { tenantId: tidA, type: "SHOP", name: "สาขา A", slug: `${TAG}-ua` } });
  const unitB = await P.businessUnit.create({ data: { tenantId: tidA, type: "SHOP", name: "สาขา B", slug: `${TAG}-ub` } });
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const accSys = await mk(tidA, "ACCOUNT", "บัญชี");
  const crmSys = await mk(tidA, "CRM", "CRM");
  const crmSysNoLink = await mk(tidA, "CRM", "CRM ไม่เชื่อมบัญชี");
  const chatSys = await mk(tidA, "CHAT", "แชท");
  const chatSys2 = await mk(tidA, "CHAT", "แชท 2");
  const hrSys = await mk(tidA, "HR", "บุคคล");
  const invSys = await mk(tidA, "INVENTORY", "คลัง");
  const memSys = await mk(tidA, "MEMBER", "สมาชิก");
  const accSysB = await mk(tidB, "ACCOUNT", "บัญชี-B");
  const crmSysB = await mk(tidB, "CRM", "CRM-B");
  const chatSysB = await mk(tidB, "CHAT", "แชท-B");
  const hrSysB = await mk(tidB, "HR", "บุคคล-B");
  const invSysB = await mk(tidB, "INVENTORY", "คลัง-B");
  // the money settings the GOLDEN numbers are computed from (VAT-registered, 7 %, tax point on issue)
  for (const [tid, sid] of [[tidA, accSys], [tidB, accSysB]] as const)
    await P.accountSettings.create({ data: { tenantId: tid, systemId: sid, orgName: TAG, vatRegistered: true, vatRateBp: 700, vatTiming: "ON_ISSUE" } });
  await P.accountSystemLink.create({ data: { tenantId: tidA, systemId: accSys, linkedKind: "CRM", linkedId: crmSys } });
  await P.accountSystemLink.create({ data: { tenantId: tidB, systemId: accSysB, linkedKind: "CRM", linkedId: crmSysB } });
  const ctxA = { tenantId: tidA, systemId: accSys };
  const ctxB = { tenantId: tidB, systemId: accSysB };
  console.log(`[setup] tenant A ${tidA} · tenant B ${tidB}\n`);

  const docWithLines = (id: string) => P.accountDocument.findFirst({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  /** docId of a create result — never `undefined` (a `where: {id: undefined}` would match an arbitrary row) */
  const ID = (r: Any): string => (typeof r?.docId === "string" && r.docId ? r.docId : `${TAG}-no-such-doc`);
  const legacyQuotation = async (refId: string, extra: Record<string, Any> = {}): Promise<Any> => {
    try {
      return await ACC.createExternalQuotation({
        tenantId: tidA,
        sourceSystemId: crmSys,
        sourceKind: "CRM",
        refType: "CrmDeal",
        refId,
        title: `งานของดีล ${refId}`,
        valueSatang: GOLD_VALUE,
        customer: { name: `บริษัท ${TAG} จำกัด`, phone: SENT_PHONE, email: SENT_EMAIL },
        ...extra,
      });
    } catch (e) {
      return { ok: false, reason: `THREW ${e instanceof Error ? e.message : String(e)}` };
    }
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ A — account facade ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── A · account ──");
  const A_NEW = ["convertQuotationToInvoice", "respondQuotation", "createPaymentRequestForDoc", "outstandingByContacts", "mergeContacts", "ensureAccountContact", "docLinkInfo"];
  const A_OLD = ["createExternalQuotation", "listDocsByParty", "writeAudit", "getPublicPaymentPage"];
  const missNew = A_NEW.filter((n) => typeof ACC[n] !== "function");
  const missOld = A_OLD.filter((n) => typeof ACC[n] !== "function");
  chk("C0.3-SA.0", `account facade exports the 7 new functions (${A_NEW.join(", ")}) and still exports the 4 old ones`,
    missNew.length === 0 && missOld.length === 0, "all present", `missing new: ${missNew.join(",") || "-"} · missing old: ${missOld.join(",") || "-"}`);

  // ─── SA.1–SA.3 · THE GOLDEN legacy quotation ───
  const refGold = `${TAG}-gold`;
  const gRes = await watch("createExternalQuotation(legacy)", () => legacyQuotation(refGold));
  const gDoc = gRes?.ok ? await docWithLines(ID(gRes)) : null;
  chk("C0.3-SA.1a", "legacy createExternalQuotation returns {ok:true, docId, created:true} (shape unchanged)",
    gRes?.ok === true && typeof gRes?.docId === "string" && gRes?.created === true && Object.keys(gRes).sort().join(",") === "created,docId,ok",
    '{ok:true,docId,created:true}', cut(j(gRes)));
  {
    const diffs: string[] = [];
    for (const [k, want] of Object.entries(GOLDEN_DOC)) {
      const got = (gDoc ?? {})[k];
      const same = Array.isArray(want) ? Array.isArray(got) && got.length === want.length : got instanceof Date ? false : got === want;
      if (!same) diffs.push(`${k}: ${j(got)}≠${j(want)}`);
    }
    // the ref-back columns + the resolved contact must be filled, the issue date must be "now"
    const refOk = gDoc?.refSystemId === crmSys && gDoc?.refType === "CrmDeal" && gDoc?.refId === refGold;
    const contactOk = typeof gDoc?.contactId === "string" && gDoc.contactId.length > 0;
    const dateOk = gDoc?.issueDate instanceof Date && gDoc.issueDate >= T0 && gDoc.issueDate <= new Date(Date.now() + 60_000);
    chk("C0.3-SA.1", "🔒 GOLDEN — the legacy one-line quotation is byte-identical: every documented AccountDocument column matches the frozen table (subTotal 123456 · vat 8642 · grand 132098 · DRAFT · source MANUAL · tags [] · EXCLUDE/ON_ISSUE · docNo null) + refSystemId/refType/refId + a resolved contactId + issueDate = now",
      diffs.length === 0 && refOk && contactOk && dateOk, "all columns as frozen",
      cut(`${diffs.join(" · ") || "cols ok"} | ref=${refOk} contact=${contactOk} date=${dateOk}`));
  }
  {
    const lines = (gDoc?.lines ?? []) as Any[];
    const l0 = lines[0] ?? {};
    const diffs: string[] = [];
    for (const [k, want] of Object.entries(GOLDEN_LINE)) {
      const got = k === "qty" ? Number(l0[k]) : l0[k];
      if (got !== want) diffs.push(`${k}: ${j(got)}≠${j(want)}`);
    }
    if (l0.description !== `งานของดีล ${refGold}`) diffs.push(`description: ${j(l0.description)}`);
    chk("C0.3-SA.2", "🔒 GOLDEN — exactly ONE AccountDocumentLine, every column identical (description = title · qty 1 · unitPrice = valueSatang · discount 0 · vatRateBp 700 = book default · amount 123456 · unitName/productId/accountId null)",
      lines.length === 1 && diffs.length === 0, "1 line, frozen columns", cut(`${lines.length} lines · ${diffs.join(" · ") || "ok"}`));
  }
  {
    // completeness guard: nothing OUTSIDE the frozen table may be written
    const colRows = (await P.$queryRawUnsafe(`select column_name from information_schema.columns where table_schema='public' and table_name='AccountDocument'`)) as Any[];
    const extra = colRows
      .map((r) => r.column_name as string)
      .filter((c) => !DOC_FREE.has(c) && !(c in GOLDEN_DOC))
      .filter((c) => {
        const v = (gDoc ?? {})[c];
        return !(v === null || v === undefined || (Array.isArray(v) && v.length === 0));
      });
    chk("C0.3-SA.3", "🔒 GOLDEN completeness — no AccountDocument column outside the frozen table is written (a column the legacy path never filled must still be null/[])",
      !!gDoc && extra.length === 0, "no extra column written", extra.map((c) => `${c}=${j((gDoc ?? {})[c])}`).join(" · ") || (gDoc ? "-" : "no document"));
  }
  {
    // relational anchor: the same document built straight through createDocument
    const direct = await accSvc.createDocument({
      tenantId: tidA, systemId: accSys, docType: "QUOTATION", contactId: gDoc?.contactId ?? null,
      lines: [{ description: `งานของดีล ${refGold}`, qty: 1, unitPrice: GOLD_VALUE }],
    });
    const dRow = await docWithLines(direct.id);
    const project = (d: Any) => {
      const o: Record<string, Any> = {};
      for (const k of Object.keys(GOLDEN_DOC)) o[k] = d?.[k] instanceof Date ? "date" : d?.[k];
      o.lines = (d?.lines ?? []).map((l: Any) => {
        const x: Record<string, Any> = {};
        for (const k of Object.keys(GOLDEN_LINE)) x[k] = k === "qty" ? Number(l[k]) : l[k];
        x.description = l.description;
        return x;
      });
      return j(o);
    };
    chk("C0.3-SA.4", "🔒 GOLDEN relational anchor — createExternalQuotation(legacy) and a direct createDocument() with the same legacy shape produce an identical projection (document + lines)",
      !!gDoc && !!dRow && project(gDoc) === project(dRow), "identical projection", cut(`facade=${project(gDoc)} | direct=${project(dRow)}`, 400));
    await P.accountDocumentLine.deleteMany({ where: { documentId: direct.id } });
    await P.accountDocument.delete({ where: { id: direct.id } });
  }
  {
    // idempotency per (systemId, QUOTATION, refType, refId) must survive the new parameters
    const before = j(await docWithLines(ID(gRes)));
    const again = await legacyQuotation(refGold, { title: "ชื่ออื่นที่ไม่ควรมีผล", valueSatang: 999_999 });
    const after = j(await docWithLines(ID(gRes)));
    const count = await P.accountDocument.count({ where: { systemId: accSys, docType: "QUOTATION", refType: "CrmDeal", refId: refGold } });
    chk("C0.3-SA.5", "idempotent per (systemId, QUOTATION, refType, refId): the second call returns {created:false} with the SAME docId, creates no second document and does not mutate a single column of the first",
      again?.ok === true && again?.created === false && again?.docId === ID(gRes) && count === 1 && before === after,
      "created:false · same docId · 1 row · unchanged", cut(`${j(again)} · rows=${count} · changed=${before !== after}`));
  }
  {
    const refUnlinked = `${TAG}-unlinked`;
    const r = await call(ACC.createExternalQuotation, {
      tenantId: tidA, sourceSystemId: crmSysNoLink, sourceKind: "CRM", refType: "CrmDeal", refId: refUnlinked,
      title: "ดีลของระบบที่ยังไม่เชื่อมบัญชี", valueSatang: 50_000, customer: { name: `ลูกค้า ${TAG}` },
    });
    const rows = await P.accountDocument.count({ where: { tenantId: tidA, refId: refUnlinked } });
    chk("C0.3-SA.6", "a CRM system with no AccountSystemLink still answers {ok:false, reason ภาษาไทย} and never throws — and writes no document",
      r.ok && r.v?.ok === false && thai(r.v?.reason) && rows === 0, "{ok:false,reason ไทย} · 0 rows", cut(`${r.err || j(r.v)} · rows=${rows}`));
  }

  // ─── SA.7–SA.9 · the new lines[] path ───
  const refLines = `${TAG}-lines`;
  const validUntil = new Date(Date.UTC(2026, 11, 31, 5, 0, 0));
  const lRes = await watch("createExternalQuotation(lines)", () =>
    legacyQuotation(refLines, {
      valueSatang: LINES_EXPECT.grandTotal, // ignored when `lines` is given — the line assertions decide
      lines: LINES_IN.map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, unitName: l.unitName, ...(l.vatRateBp === undefined ? {} : { vatRateBp: l.vatRateBp }) })),
      discountAmount: LINES_DOC_DISCOUNT,
      validUntil,
      note: `หมายเหตุ ${TAG}`,
      createdById: FAKE_USER,
    }),
  );
  const lDoc = lRes?.ok ? await docWithLines(ID(lRes)) : null;
  {
    const rows = (lDoc?.lines ?? []) as Any[];
    const diffs: string[] = [];
    LINES_EXPECT_ROWS.forEach((want, i) => {
      const got = rows[i] ?? {};
      for (const [k, v] of Object.entries(want)) {
        const g = k === "qty" ? Number(got[k]) : got[k];
        if (g !== v) diffs.push(`L${i + 1}.${k}: ${j(g)}≠${j(v)}`);
      }
      if (got.description !== LINES_IN[i].description) diffs.push(`L${i + 1}.description: ${j(got.description)}`);
    });
    chk("C0.3-SA.7", "3-line quotation: every LineInput field reaches the row unchanged — qty Decimal(2.5) not rounded · per-line discount kept · vatRateBp 700 / 0 / −1 (exempt) kept · unitName kept · amount = qty×unitPrice−discount · sortOrder = input order",
      rows.length === 3 && diffs.length === 0, "3 rows exactly as given", cut(`${rows.length} rows · ${diffs.join(" · ") || "ok"}`));
  }
  {
    const control = totals.computeTotals({
      lines: LINES_IN.map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, vatRateBp: l.vatRateBp ?? 700 })),
      discountAmount: LINES_DOC_DISCOUNT, depositDeducted: 0, vatMode: "EXCLUDE", vatRegistered: true, vatRateBp: 700,
    });
    const gotT = { subTotal: lDoc?.subTotal, vatAmount: lDoc?.vatAmount, grandTotal: lDoc?.grandTotal };
    const ctrlOk = control.subTotal === LINES_EXPECT.subTotal && control.vatAmount === LINES_EXPECT.vatAmount && control.grandTotal === LINES_EXPECT.grandTotal;
    chk("C0.3-SA.8", `3-line totals exact against the HAND-COMPUTED constants (subTotal ${LINES_EXPECT.subTotal} · vat ${LINES_EXPECT.vatAmount} · grand ${LINES_EXPECT.grandTotal}) — doc-level discount allocated proportionally, 0 % and exempt lines carry no VAT`,
      j(gotT) === j(LINES_EXPECT), j(LINES_EXPECT), j(gotT));
    chk("C0.3-SA.8b", "[positive control] the same constants are what account/totals.computeTotals returns for this input (if this one is red the oracle's arithmetic — not the builder — is wrong)",
      ctrlOk, j(LINES_EXPECT), j({ subTotal: control.subTotal, vatAmount: control.vatAmount, grandTotal: control.grandTotal }), "MAJOR");
  }
  {
    // 🔴 Controller decision 2 (brief §"Controller decisions on the oracle's open questions", 2026-09-17):
    //    when `lines` is supplied the totals come from the lines and `valueSatang` is IGNORED — callers may
    //    still pass it and it must not move a single column. Here we pass a deliberately absurd 1 satang.
    const refIgnore = `${TAG}-ignores-value`;
    const iRes = await watch("createExternalQuotation(lines, wrong valueSatang)", () =>
      legacyQuotation(refIgnore, {
        valueSatang: 1,
        lines: LINES_IN.map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, unitName: l.unitName, ...(l.vatRateBp === undefined ? {} : { vatRateBp: l.vatRateBp }) })),
        discountAmount: LINES_DOC_DISCOUNT,
      }),
    );
    const iDoc = iRes?.ok ? await docWithLines(ID(iRes)) : null;
    const rows = (iDoc?.lines ?? []) as Any[];
    const gotT = { subTotal: iDoc?.subTotal, vatAmount: iDoc?.vatAmount, grandTotal: iDoc?.grandTotal };
    const numbers = [iDoc?.subTotal, iDoc?.vatAmount, iDoc?.grandTotal, iDoc?.discountAmount, ...rows.map((l) => l.amount), ...rows.map((l) => l.unitPrice)];
    chk("C0.3-SA.8c", "🔒 `lines[]` WINS: the very same quotation sent with a deliberately wrong `valueSatang` of 1 satang produces exactly the same totals as the lines dictate (700000 / 19500 / 669500), 3 lines, and NOT ONE column carries the value 1 — a builder who 'reconciles' the two numbers, or lets valueSatang override the computed grand total, or appends an extra line for it, goes red here",
      j(gotT) === j(LINES_EXPECT) && rows.length === 3 && !numbers.includes(1),
      `${j(LINES_EXPECT)} · 3 lines · no column = 1`, cut(`${j(gotT)} · lines=${rows.length} · numbers=${j(numbers)}`));
  }
  chk("C0.3-SA.9", "the other new optional inputs land on the document: discountAmount · validUntil · note · createdById (and the document stays DRAFT with no docNo)",
    lDoc?.discountAmount === LINES_DOC_DISCOUNT && lDoc?.validUntil instanceof Date && lDoc.validUntil.toISOString() === validUntil.toISOString() &&
      lDoc?.note === `หมายเหตุ ${TAG}` && lDoc?.createdById === FAKE_USER && lDoc?.status === "DRAFT" && lDoc?.docNo === null,
    `discount ${LINES_DOC_DISCOUNT} · validUntil ${validUntil.toISOString()} · note · createdById · DRAFT`,
    cut(j({ discountAmount: lDoc?.discountAmount, validUntil: lDoc?.validUntil, note: lDoc?.note, createdById: lDoc?.createdById, status: lDoc?.status, docNo: lDoc?.docNo })));

  // ─── SA.10–SA.16 · convert + respond ───
  const refChain = `${TAG}-chain`;
  const qChain = await legacyQuotation(refChain);
  const qChainId = ID(qChain);
  const issued = await accSvc.issueDocument(tidA, accSys, qChainId);
  chk("C0.3-SA.10a", "[setup] the chain quotation can be issued (status AWAITING_ACCEPT + docNo) — the pre-condition respondQuotation demands",
    issued?.ok === true, "{ok:true,docNo}", cut(j(issued)), "MAJOR");
  const signer = { name: `คุณผู้เซ็น ${TAG}`, ipHash: `iphash-${TAG}`, userAgent: `qc-agent/${TAG}` };
  const respondOk = await watch("respondQuotation(accept)", () => call(ACC.respondQuotation, ctxA, qChainId, true, { by: "PORTAL", signer }));
  const qChainRow = await P.accountDocument.findFirst({ where: { id: qChainId } });
  chk("C0.3-SA.13", "respondQuotation(accepted) on an AWAITING_ACCEPT quotation → ok:true · status ACCEPTED · acceptedAt set",
    respondOk.ok && respondOk.v?.ok === true && qChainRow?.status === "ACCEPTED" && qChainRow?.acceptedAt instanceof Date,
    "ok:true · ACCEPTED · acceptedAt", cut(`${respondOk.err || j(respondOk.v)} · status=${qChainRow?.status} · acceptedAt=${j(qChainRow?.acceptedAt)}`));
  {
    const audits = (await P.auditLog.findMany({ where: { tenantId: tidA, targetId: qChainId, createdAt: { gte: T0 } } })) as Any[];
    const blob = audits.map((a) => j({ action: a.action, targetType: a.targetType, before: a.before, after: a.after })).join("\n");
    chk("C0.3-SA.14", "respondQuotation records the SIGNER EVIDENCE in an audit row of this document (signer name + ipHash + userAgent + by=PORTAL) — an accept from the portal must be attributable",
      audits.length > 0 && blob.includes(signer.name) && blob.includes(signer.ipHash) && blob.includes(signer.userAgent) && /PORTAL/.test(blob),
      "1 audit row containing name+ipHash+userAgent+PORTAL", cut(`${audits.length} rows · ${blob}`, 300));
  }
  {
    const again = await call(ACC.respondQuotation, ctxA, qChainId, false, { by: "STAFF" });
    const row = await P.accountDocument.findFirst({ where: { id: qChainId } });
    chk("C0.3-SA.15", "respondQuotation REQUIRES AWAITING_ACCEPT — answering an already-ACCEPTED quotation is refused (ok:false, Thai reason) and the status/acceptedAt do not move",
      again.ok && again.v?.ok === false && thai(again.v?.reason) && row?.status === "ACCEPTED" && row?.acceptedAt instanceof Date,
      "{ok:false,reason ไทย} · still ACCEPTED", cut(`${again.err || j(again.v)} · status=${row?.status}`));
  }
  const refDraft = `${TAG}-draft`;
  const qDraft = await legacyQuotation(refDraft);
  const qDraftId = ID(qDraft);
  {
    const r = await call(ACC.respondQuotation, ctxA, qDraftId, true, { by: "STAFF" });
    const row = await P.accountDocument.findFirst({ where: { id: qDraftId } });
    chk("C0.3-SA.12", "respondQuotation REQUIRES AWAITING_ACCEPT — a DRAFT quotation is refused (ok:false, Thai reason), stays DRAFT and gets no acceptedAt (the wrapper must not bypass setQuotationResponse's guard)",
      r.ok && r.v?.ok === false && thai(r.v?.reason) && row?.status === "DRAFT" && row?.acceptedAt === null,
      "{ok:false,reason ไทย} · still DRAFT", cut(`${r.err || j(r.v)} · status=${row?.status} acceptedAt=${j(row?.acceptedAt)}`));
  }
  {
    const r = await call(ACC.convertQuotationToInvoice, ctxA, qDraftId, {});
    const made = await P.accountDocument.count({ where: { systemId: accSys, docType: "INVOICE", sourceDocId: qDraftId } });
    chk("C0.3-SA.11", "convertQuotationToInvoice refuses a DRAFT source (\"ต้องออกเอกสารต้นทางก่อน\") and creates no invoice",
      r.ok && r.v?.ok === false && thai(r.v?.reason) && made === 0, "{ok:false,reason ไทย} · 0 invoices", cut(`${r.err || j(r.v)} · invoices=${made}`));
  }
  let invoiceId = "";
  {
    const r = await watch("convertQuotationToInvoice", () => call(ACC.convertQuotationToInvoice, ctxA, qChainId, { createdById: FAKE_USER }));
    const inv = await P.accountDocument.findFirst({ where: { systemId: accSys, docType: "INVOICE", sourceDocId: qChainId }, include: { lines: true } });
    invoiceId = inv?.id ?? "";
    const q = await P.accountDocument.findFirst({ where: { id: qChainId } });
    chk("C0.3-SA.10", "convertQuotationToInvoice on an ACCEPTED quotation creates exactly ONE INVOICE whose sourceDocId points back at the quotation, with the same contact, the same grandTotal, the same lines, status DRAFT and the createdById we passed",
      r.ok && r.v?.ok !== false && !!inv && inv.sourceDocId === qChainId && inv.contactId === q?.contactId &&
        inv.grandTotal === q?.grandTotal && inv.lines.length === 1 && inv.status === "DRAFT" && inv.createdById === FAKE_USER,
      "1 INVOICE · sourceDocId = quotation · same contact/total/lines", cut(`${r.err || j(r.v)} · inv=${j({ id: inv?.id, src: inv?.sourceDocId, contact: inv?.contactId, grand: inv?.grandTotal, lines: inv?.lines?.length, status: inv?.status, by: inv?.createdById })}`));
  }
  const refRej = `${TAG}-reject`;
  {
    const qRej = await legacyQuotation(refRej);
    const qRejId = ID(qRej);
    await accSvc.issueDocument(tidA, accSys, qRejId);
    const r = await watch("respondQuotation(reject)", () => call(ACC.respondQuotation, ctxA, qRejId, false, { by: "STAFF" }));
    const row = await P.accountDocument.findFirst({ where: { id: qRejId } });
    chk("C0.3-SA.16", "respondQuotation(accepted=false, by STAFF, no signer) → ok:true · status REJECTED · acceptedAt stays null",
      r.ok && r.v?.ok === true && row?.status === "REJECTED" && row?.acceptedAt === null,
      "ok:true · REJECTED · acceptedAt null", cut(`${r.err || j(r.v)} · status=${row?.status} acceptedAt=${j(row?.acceptedAt)}`));
  }

  // ─── SA.17–SA.19 · docLinkInfo ───
  const DOC_LINK_KEYS = ["docId", "systemId", "docType", "status", "docNo", "contactId", "partyId", "sourceDocId", "refSystemId", "refType", "refId", "grandTotal", "paidTotal"];
  {
    const r = await watch("docLinkInfo(quotation)", () => call(ACC.docLinkInfo, tidA, qChainId));
    const v = r.v;
    const row = await P.accountDocument.findFirst({ where: { id: qChainId } });
    const contact = row?.contactId ? await P.accountContact.findFirst({ where: { id: row.contactId } }) : null;
    const keysOk = !!v && DOC_LINK_KEYS.every((k) => k in v);
    const valOk = !!v && v.docId === qChainId && v.systemId === accSys && v.docType === "QUOTATION" && v.status === "ACCEPTED" &&
      v.docNo === row?.docNo && v.contactId === row?.contactId && v.partyId === (contact?.partyId ?? null) &&
      v.sourceDocId === null && v.refSystemId === crmSys && v.refType === "CrmDeal" && v.refId === refChain &&
      v.grandTotal === row?.grandTotal && v.paidTotal === row?.paidTotal;
    chk("C0.3-SA.17", `docLinkInfo(tenantId, docId) returns all 13 documented fields with the right values for the quotation (${DOC_LINK_KEYS.join(",")}) — CRM consumers only get a documentId from account events, so every field here has a caller`,
      keysOk && valOk, "13 fields, values match the row", cut(`keys=${keysOk} · ${j(v)}`));
  }
  {
    const r = await call(ACC.docLinkInfo, tidA, invoiceId || `${TAG}-no-such-doc`);
    const v = r.v;
    chk("C0.3-SA.18", "🔗 docLinkInfo PROVES THE CHAIN: for the converted invoice, sourceDocId is the quotation's id (not null, not the invoice's own id) and docType/status describe the invoice — this is the only way CRM can walk quotation→invoice",
      !!v && v.docId === invoiceId && v.sourceDocId === qChainId && v.docType === "INVOICE" && v.status === "DRAFT" && v.systemId === accSys,
      `sourceDocId = ${qChainId}`, cut(j(v)));
  }
  {
    const unknown = await call(ACC.docLinkInfo, tidA, `${TAG}-no-such-doc`);
    chk("C0.3-SA.19", "docLinkInfo of an unknown document id → null (no throw)",
      unknown.ok && unknown.v === null, "null", cut(`${unknown.err || j(unknown.v)}`));
  }

  // ─── SA.20–SA.22 · outstandingByContacts · mergeContacts · createPaymentRequestForDoc ───
  {
    // 🔴 the invoice status is set directly (not via issueDocument): this check is about the
    //    aggregation of outstanding amounts, and issuing would post GL in a throwaway book.
    if (invoiceId) await P.accountDocument.update({ where: { id: invoiceId }, data: { status: "AWAITING_PAYMENT", paidTotal: 10_000 } });
    const inv = await P.accountDocument.findFirst({ where: { id: invoiceId || `${TAG}-no-such-doc` } });
    const r = await watch("outstandingByContacts", () => call(ACC.outstandingByContacts, tidA, accSys, [inv?.contactId ?? ""]));
    const m = r.v;
    const got = m instanceof Map ? m.get(inv?.contactId ?? "") : undefined;
    chk("C0.3-SA.20", "outstandingByContacts(tenantId, systemId, contactIds) returns a Map contactId → Σ(grandTotal − paidTotal) of AWAITING_PAYMENT/PARTIAL documents",
      !!inv && m instanceof Map && got === inv.grandTotal - inv.paidTotal, `Map · ${(inv?.grandTotal ?? 0) - (inv?.paidTotal ?? 0)}`, cut(`${r.err || `${m?.constructor?.name} ${j(got)}`}`));
    if (invoiceId) await P.accountDocument.update({ where: { id: invoiceId }, data: { status: "DRAFT", paidTotal: 0 } });
  }
  {
    const primary = await accSvc.createContact({ tenantId: tidA, systemId: accSys, kind: "CUSTOMER", name: `ตัวหลัก ${TAG}` });
    const secondary = await accSvc.createContact({ tenantId: tidA, systemId: accSys, kind: "CUSTOMER", name: `ตัวรอง ${TAG}` });
    const doc = await accSvc.createDocument({ tenantId: tidA, systemId: accSys, docType: "QUOTATION", contactId: secondary.id, lines: [{ description: "ของตัวรอง", qty: 1, unitPrice: 1_000 }] });
    const r = await watch("mergeContacts", () => call(ACC.mergeContacts, ctxA, { primaryId: primary.id, secondaryId: secondary.id }));
    const moved = await P.accountDocument.findFirst({ where: { id: doc.id } });
    const sec = await P.accountContact.findFirst({ where: { id: secondary.id } });
    chk("C0.3-SA.21", "mergeContacts through the facade really merges: the secondary's document is re-pointed at the primary and the secondary gets mergedIntoId",
      r.ok && r.v?.ok === true && moved?.contactId === primary.id && sec?.mergedIntoId === primary.id,
      "documents moved · mergedIntoId set", cut(`${r.err || j(r.v)} · doc.contact=${moved?.contactId === primary.id} · mergedInto=${sec?.mergedIntoId === primary.id}`));
  }
  {
    const r1 = await watch("createPaymentRequestForDoc(draft)", () => call(ACC.createPaymentRequestForDoc, ctxA, invoiceId || `${TAG}-no-such-doc`, { financeId: `${TAG}-nofinance` }));
    chk("C0.3-SA.22", "createPaymentRequestForDoc reaches the REAL createPaymentRequest guards: a DRAFT invoice is refused with the status reason (not a throw, not a stub constant)",
      r1.ok && r1.v?.ok === false && thai(r1.v?.reason) && /สถานะ/.test(String(r1.v?.reason)),
      "{ok:false} reason mentions สถานะ", cut(`${r1.err || j(r1.v)}`));
  }

  // ─── SA.23–SA.24 · ensureAccountContact (sequential behaviour; the race is X3) ───
  const partySeq = (await PARTY.findOrCreate(tidA, { name: `บจก. ตัวตนกลาง ${TAG}`, taxId: "0105561000099" })).id as string;
  {
    const r1 = await watch("ensureAccountContact(new)", () => call(ACC.ensureAccountContact, ctxA, { partyId: partySeq, name: `บจก. ตัวตนกลาง ${TAG}`, taxId: "0105561000099", branchCode: "00000", phone: SENT_PHONE, email: SENT_EMAIL, legalType: "COMPANY" }));
    const r2 = await call(ACC.ensureAccountContact, ctxA, { partyId: partySeq, name: "ชื่อที่ต่างออกไป", legalType: "COMPANY" });
    const rows = (await P.accountContact.findMany({ where: { systemId: accSys, partyId: partySeq } })) as Any[];
    chk("C0.3-SA.23", "ensureAccountContact creates the account contact for a Party (partyId/name/taxId/branchCode/legalType written) and a second sequential call returns the SAME contact instead of a duplicate",
      r1.ok && r2.ok && rows.length === 1 && rows[0].partyId === partySeq && rows[0].taxId === "0105561000099" && rows[0].legalType === "COMPANY" && idOf(r1.v) === rows[0].id && idOf(r2.v) === rows[0].id,
      "1 row · both calls same id", cut(`${r1.err || r2.err} · rows=${rows.length} · ${j(rows.map((x) => ({ id: x.id, party: x.partyId, tax: x.taxId, legal: x.legalType })))}`));
  }
  {
    // a contact that already exists for this party through another route (createExternalQuotation) is reused
    const gContact = await P.accountContact.findFirst({ where: { id: gDoc?.contactId ?? `${TAG}-no-such-contact` } });
    if (!gContact) {
      chk("C0.3-SA.24", "ensureAccountContact reuses a contact that another route (createExternalQuotation) already linked to that Party", false, "the golden quotation's contact", "no contact (the golden quotation was not created)");
    } else {
      const pid = gContact.partyId ?? ((await PARTY.findOrCreate(tidA, { name: `บจก. เดิม ${TAG}`, phone: SENT_PHONE })).id as string);
      if (!gContact.partyId) await P.accountContact.update({ where: { id: gContact.id }, data: { partyId: pid } });
      const r = await call(ACC.ensureAccountContact, ctxA, { partyId: pid, name: `บริษัท ${TAG} จำกัด`, legalType: "COMPANY" });
      const rows = await P.accountContact.count({ where: { systemId: accSys, partyId: pid } });
      chk("C0.3-SA.24", "ensureAccountContact reuses a contact that another route (createExternalQuotation) already linked to that Party — one Party = one account contact per book",
        r.ok && rows === 1 && idOf(r.v) === gContact.id, "1 row · id of the existing contact", cut(`${r.err} · rows=${rows} · id=${idOf(r.v)} vs ${gContact.id}`));
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ B — chat facade ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── B · chat ──");
  chk("C0.3-SB.1", "chat facade exports sendLineToParty + listConversationsByParty and still exports pushToContact",
    typeof CHAT.sendLineToParty === "function" && typeof CHAT.listConversationsByParty === "function" && typeof CHAT.pushToContact === "function",
    "3 functions", `send=${typeof CHAT.sendLineToParty} list=${typeof CHAT.listConversationsByParty} push=${typeof CHAT.pushToContact}`);

  const partyNoChat = (await PARTY.findOrCreate(tidA, { name: `ลูกค้าไม่มีแชท ${TAG}`, phone: "0800000001" })).id as string;
  const partyWebOnly = (await PARTY.findOrCreate(tidA, { name: `ลูกค้าเว็บแชท ${TAG}`, phone: "0800000002" })).id as string;
  const partyLine = (await PARTY.findOrCreate(tidA, { name: `ลูกค้าไลน์ ${TAG}`, phone: "0800000003" })).id as string;
  const partyB = (await PARTY.findOrCreate(tidB, { name: `ลูกค้าร้านอื่น ${TAG}`, phone: "0800000004" })).id as string;
  const mkChatContact = async (tid: string, sid: string, channel: string, partyId: string | null, n: string) =>
    (await P.chatContact.create({ data: { tenantId: tid, systemId: sid, channel, externalUserId: `${TAG}-${n}`, displayName: `ผู้ติดต่อ ${n}`, partyId } })).id as string;
  const mkConv = async (tid: string, sid: string, contactId: string, channel: string, unitId: string | null, status = "OPEN") =>
    (await P.chatConversation.create({ data: { tenantId: tid, systemId: sid, channel, contactId, unitId, status, lastMessageAt: new Date() } })).id as string;

  const cWeb = await mkChatContact(tidA, chatSys, "WEBCHAT", partyWebOnly, "web");
  const cLine1 = await mkChatContact(tidA, chatSys, "LINE", partyLine, "line1");
  const cLine2 = await mkChatContact(tidA, chatSys, "LINE", partyLine, "line2");
  const cNull = await mkChatContact(tidA, chatSys, "LINE", partyLine, "line3");
  // the SAME customer also talks to the shop's SECOND chat system (controller decision 6: the list is shop-wide)
  const cS2a = await mkChatContact(tidA, chatSys2, "LINE", partyLine, "sys2a");
  const cS2b = await mkChatContact(tidA, chatSys2, "LINE", partyLine, "sys2b");
  const cOther = await mkChatContact(tidB, chatSysB, "LINE", partyB, "lineB");
  const convUnitA = await mkConv(tidA, chatSys, cLine1, "LINE", unitA.id);
  const convUnitB = await mkConv(tidA, chatSys, cLine2, "LINE", unitB.id);
  const convNoUnit = await mkConv(tidA, chatSys, cNull, "LINE", null);
  const convSys2A = await mkConv(tidA, chatSys2, cS2a, "LINE", unitA.id);
  const convSys2B = await mkConv(tidA, chatSys2, cS2b, "LINE", unitB.id);
  await mkConv(tidA, chatSys2, cWeb, "WEBCHAT", unitA.id); // another party entirely — must never appear below
  const convB = await mkConv(tidB, chatSysB, cOther, "LINE", null);
  const chatCtxA = { tenantId: tidA, systemId: chatSys, actorUserId: FAKE_USER };

  const sendNone = await watch("sendLineToParty(no contact)", () => call(CHAT.sendLineToParty, chatCtxA, { partyId: partyNoChat, text: "สวัสดีครับ" }));
  chk("C0.3-SB.2", "sendLineToParty for a Party with NO chat contact at all → {ok:false} with a Thai reason and NO throw (callers are batch senders that must keep going)",
    sendNone.ok && sendNone.v?.ok === false && thai(sendNone.v?.reason), "{ok:false,reason ไทย} · no throw", cut(`${sendNone.err || j(sendNone.v)}`));
  const sendWeb = await watch("sendLineToParty(webchat only)", () => call(CHAT.sendLineToParty, chatCtxA, { partyId: partyWebOnly, text: "สวัสดีครับ" }));
  chk("C0.3-SB.3", "a Party whose only chat contact is WEBCHAT is NOT treated as a LINE recipient → {ok:false} (it must resolve the newest LINE contact, not just any contact)",
    sendWeb.ok && sendWeb.v?.ok === false, "{ok:false}", cut(`${sendWeb.err || j(sendWeb.v)}`));
  const sendLine = await watch("sendLineToParty(line contact)", () => call(CHAT.sendLineToParty, chatCtxA, { partyId: partyLine, text: "สวัสดีครับ" }));
  chk("C0.3-SB.4", "a Party WITH a LINE contact gets a DIFFERENT refusal than a Party without one (the shop has no connected LINE account here) — proves the contact really was resolved and the transport really was reached, so a constant {ok:false} cannot pass",
    sendLine.ok && sendLine.v?.ok === false && thai(sendLine.v?.reason) && String(sendLine.v?.reason) !== String(sendNone.v?.reason),
    "two different Thai reasons", cut(`with=${j(sendLine.v)} · without=${j(sendNone.v)}`));

  const listAll = await watch("listConversationsByParty(*)", () => call(CHAT.listConversationsByParty, chatCtxA, partyLine, { take: 50, unitAccess: ["*"] }));
  const listGated = await watch("listConversationsByParty(unitA)", () => call(CHAT.listConversationsByParty, chatCtxA, partyLine, { take: 50, unitAccess: [unitA.id] }));
  const ids = (v: Any) => (Array.isArray(v) ? v.map((r: Any) => r.conversationId).sort() : ["NOT-AN-ARRAY"]);
  chk("C0.3-SB.5", "listConversationsByParty rows carry exactly the documented shape {conversationId, systemId, channel, lastMessageAt, status, href}",
    Array.isArray(listAll.v) && listAll.v.length > 0 && listAll.v.every((r: Any) => ["conversationId", "systemId", "channel", "lastMessageAt", "status", "href"].every((k) => k in r)),
    "6 keys per row", cut(`${listAll.err || j(listAll.v?.[0])}`));
  chk("C0.3-SB.6", "🔒 SHOP-WIDE + the unit gate really bites (controller decision 6): the customer's conversations in BOTH chat systems of the shop come back with unitAccess=['*'] (5 rows — a builder who scopes to ctx.systemId silently loses the second system and goes red), and with unitAccess=[สาขา A] exactly the rows of สาขา A plus the unit-less one survive in BOTH systems while both สาขา B rows are ABSENT (unitId null = shop-wide, per canAccessConvUnit)",
    ids(listAll.v).join(",") === [convUnitA, convUnitB, convNoUnit, convSys2A, convSys2B].sort().join(",") &&
      ids(listGated.v).join(",") === [convUnitA, convNoUnit, convSys2A].sort().join(","),
    `all=[sys1:A,B,null · sys2:A,B] · gated=[sys1:A,null · sys2:A]`,
    cut(`all=${j(ids(listAll.v))} gated=${j(ids(listGated.v))} (sys1 A=${convUnitA} B=${convUnitB} null=${convNoUnit} · sys2 A=${convSys2A} B=${convSys2B})`));
  chk("C0.3-SB.6b", "every row carries the systemId it really came from — the two chat systems are both represented in the unrestricted answer (the `systemId` field only earns its place if more than one system can appear)",
    Array.isArray(listAll.v) && new Set(listAll.v.map((r: Any) => r.systemId)).size === 2 &&
      listAll.v.every((r: Any) => (r.conversationId === convSys2A || r.conversationId === convSys2B ? r.systemId === chatSys2 : r.systemId === chatSys)),
    "2 distinct systemIds, each row tagged with its own", cut(j(Array.isArray(listAll.v) ? listAll.v.map((r: Any) => [r.conversationId, r.systemId]) : listAll.v)));
  {
    const one = await call(CHAT.listConversationsByParty, chatCtxA, partyLine, { take: 1, unitAccess: ["*"] });
    const huge = await call(CHAT.listConversationsByParty, chatCtxA, partyLine, { take: 999, unitAccess: ["*"] });
    chk("C0.3-SB.7", "take is honoured and clamped at 50 (take:1 → 1 row · take:999 → ≤50 rows, never an unbounded read)",
      Array.isArray(one.v) && one.v.length === 1 && Array.isArray(huge.v) && huge.v.length <= 50,
      "1 row · ≤50 rows", cut(`one=${one.v?.length} huge=${huge.v?.length}`));
  }
  {
    // ChatContact.partyId must be written when the contact is linked to a member
    const cust = await P.customer.create({ data: { tenantId: tidA, memberSystemId: memSys, name: `สมาชิก ${TAG}`, phone: "0800000005", partyId: (await PARTY.findOrCreate(tidA, { name: `สมาชิก ${TAG}`, phone: "0800000005" })).id } });
    await P.chatSetting.create({ data: { tenantId: tidA, systemId: chatSys, memberSystemId: memSys } });
    const cLink = await mkChatContact(tidA, chatSys, "LINE", null, "link");
    const r = await watch("chat.linkCustomer", () => call(chatSvc.linkCustomer, { tenantId: tidA, systemId: chatSys, contactId: cLink, actorUserId: FAKE_USER, customerId: cust.id, unitAccess: ["*"] }));
    const row = await P.chatContact.findFirst({ where: { id: cLink } });
    chk("C0.3-SB.8", "linking a chat contact to a member writes ChatContact.partyId = the member's partyId (the column exists since WO 3.1 but nothing ever wrote it)",
      r.ok && r.v?.ok === true && row?.customerId === cust.id && row?.partyId === cust.partyId && !!cust.partyId,
      `partyId = ${cust.partyId}`, cut(`${r.err || j(r.v)} · partyId=${row?.partyId} customerId=${row?.customerId}`));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ C — hr facade (new file) ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── C · hr ──");
  const HR_FNS = ["requestAdjustment", "cancelAdjustment", "employeeOfUser", "isOnLeave"];
  const hrMiss = HR ? HR_FNS.filter((n) => typeof HR[n] !== "function") : HR_FNS;
  chk("C0.3-SC.1", `hr facade (src/lib/modules/hr/index.ts) exports ${HR_FNS.join(", ")}`,
    hrMiss.length === 0, "4 functions", `missing: ${hrMiss.join(",") || "-"}`);
  chk("C0.3-SC.8", "[static] the hr facade is a thin re-export — it does not open its own DB access (no `@/lib/core/db` / PrismaClient import): no second engine, the logic stays in payroll.ts/service.ts",
    !/@\/lib\/core\/db|new PrismaClient/.test(read("src/lib/modules/hr/index.ts")), "no prisma import", cut(read("src/lib/modules/hr/index.ts").split("\n").filter((l) => /core\/db|PrismaClient/.test(l)).join(" · ") || "-"), "MAJOR");

  const empUser = `${FAKE_USER}-emp`;
  const emp = await P.hrEmployee.create({ data: { tenantId: tidA, systemId: hrSys, name: `พนักงาน ${TAG}`, linkedUserId: empUser, active: true } });
  await P.hrEmployee.create({ data: { tenantId: tidB, systemId: hrSysB, name: `พนักงานร้านอื่น ${TAG}`, linkedUserId: `${FAKE_USER}-empb`, active: true } }); // the foreign shop's employee (X1.10)
  const hrCtxA = { tenantId: tidA, systemId: hrSys };
  {
    const r = await watch("hr.requestAdjustment", () => call(HR?.requestAdjustment, hrCtxA, { employeeId: emp.id, periodKey: "2026-09", kind: "COMMISSION", amountSatang: 250_00, note: `คอมมิชชัน ${TAG}`, requestedById: FAKE_USER }));
    const row = r.v?.id ? await P.hrPayAdjustment.findFirst({ where: { id: r.v.id } }) : null;
    chk("C0.3-SC.2", "requestAdjustment through the facade creates a PENDING HrPayAdjustment (kind COMMISSION · periodKey YYYY-MM · amount in satang) — this is how CRM will book a commission",
      r.ok && r.v?.ok === true && row?.status === "PENDING" && row?.kind === "COMMISSION" && row?.amountSatang === 250_00 && row?.periodKey === "2026-09",
      "PENDING COMMISSION 25000 satang", cut(`${r.err || j(r.v)} · ${j({ st: row?.status, k: row?.kind, a: row?.amountSatang, p: row?.periodKey })}`));
    const c = await call(HR?.cancelAdjustment, hrCtxA, r.v?.id);
    const gone = r.v?.id ? await P.hrPayAdjustment.count({ where: { id: r.v.id } }) : -1;
    chk("C0.3-SC.3", "cancelAdjustment through the facade removes the pending row",
      c.ok && c.v?.ok === true && gone === 0, "ok:true · 0 rows", cut(`${c.err || j(c.v)} · left=${gone}`));
  }
  {
    const r = await watch("hr.employeeOfUser", () => call(HR?.employeeOfUser, tidA, empUser));
    const miss = await call(HR?.employeeOfUser, tidA, `${FAKE_USER}-nobody`);
    chk("C0.3-SC.4", "employeeOfUser(tenantId, userId) → {employeeId, systemId, name} for a linked user · null for a user with no employee row",
      r.ok && r.v?.employeeId === emp.id && r.v?.systemId === hrSys && r.v?.name === emp.name && miss.ok && miss.v === null,
      "{employeeId,systemId,name} · null", cut(`${r.err || j(r.v)} · miss=${j(miss.v)}`));
  }
  {
    // approved leave 2026-09-10 → 2026-09-12 (dates are @db.Date = midnight UTC)
    const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
    const bkkNoon = (s: string) => new Date(`${s}T05:00:00.000Z`); // 12:00 +07:00
    await P.hrLeave.create({ data: { tenantId: tidA, systemId: hrSys, employeeId: emp.id, type: "PERSONAL", fromDate: d("2026-09-10"), toDate: d("2026-09-12"), status: "APPROVED" } });
    const inside = await watch("hr.isOnLeave(inside)", () => call(HR?.isOnLeave, tidA, empUser, bkkNoon("2026-09-11")));
    const outside = await call(HR?.isOnLeave, tidA, empUser, bkkNoon("2026-10-11"));
    chk("C0.3-SC.5", "isOnLeave(tenantId, userId, at) is true for a day inside an APPROVED leave range and false for a day outside it",
      inside.ok && inside.v === true && outside.ok && outside.v === false, "true / false", cut(`${inside.err || j(inside.v)} / ${j(outside.v)}`));
    const emp2 = await P.hrEmployee.create({ data: { tenantId: tidA, systemId: hrSys, name: `พนักงานรออนุมัติ ${TAG}`, linkedUserId: `${FAKE_USER}-emp2`, active: true } });
    await P.hrLeave.create({ data: { tenantId: tidA, systemId: hrSys, employeeId: emp2.id, type: "PERSONAL", fromDate: d("2026-09-10"), toDate: d("2026-09-12"), status: "PENDING" } });
    const emp3 = await P.hrEmployee.create({ data: { tenantId: tidA, systemId: hrSys, name: `พนักงานถูกปฏิเสธ ${TAG}`, linkedUserId: `${FAKE_USER}-emp3`, active: true } });
    await P.hrLeave.create({ data: { tenantId: tidA, systemId: hrSys, employeeId: emp3.id, type: "PERSONAL", fromDate: d("2026-09-10"), toDate: d("2026-09-12"), status: "REJECTED" } });
    const pend = await call(HR?.isOnLeave, tidA, `${FAKE_USER}-emp2`, bkkNoon("2026-09-11"));
    const rej = await call(HR?.isOnLeave, tidA, `${FAKE_USER}-emp3`, bkkNoon("2026-09-11"));
    chk("C0.3-SC.6", "isOnLeave counts APPROVED leave only — a PENDING or REJECTED leave covering the same day is false (C2.3 will use this to skip assigning work to people who are away)",
      pend.ok && pend.v === false && rej.ok && rej.v === false, "false / false", cut(`pending=${j(pend.v)} rejected=${j(rej.v)}`));
    const emp4 = await P.hrEmployee.create({ data: { tenantId: tidA, systemId: hrSys, name: `พนักงานลาวันเดียว ${TAG}`, linkedUserId: `${FAKE_USER}-emp4`, active: true } });
    await P.hrLeave.create({ data: { tenantId: tidA, systemId: hrSys, employeeId: emp4.id, type: "PERSONAL", fromDate: d("2026-09-20"), toDate: d("2026-09-20"), status: "APPROVED" } });
    const oneDay = await call(HR?.isOnLeave, tidA, `${FAKE_USER}-emp4`, bkkNoon("2026-09-20"));
    chk("C0.3-SC.7", "🕐 Thai-date trap: a ONE-DAY approved leave (from = to = 20 Sep) must answer true when asked at 12:00 +07:00 of that day — a naive `toDate >= at` comparison against the midnight-UTC Date column answers false and silently assigns work to someone who is on leave",
      oneDay.ok && oneDay.v === true, "true", cut(`${oneDay.err || j(oneDay.v)}`));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ D — inventory facade (new file) ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── D · inventory ──");
  const INV_FNS = ["listItems", "listServices", "getItem", "searchItems"];
  const invMiss = INV ? INV_FNS.filter((n) => typeof INV[n] !== "function") : INV_FNS;
  chk("C0.3-SD.1", `inventory facade (src/lib/modules/inventory/index.ts) exports ${INV_FNS.join(", ")}`,
    invMiss.length === 0, "4 functions", `missing: ${invMiss.join(",") || "-"}`);
  chk("C0.3-SD.7", "[static] the inventory facade is a thin re-export — no own DB access (`@/lib/core/db` / PrismaClient)",
    !/@\/lib\/core\/db|new PrismaClient/.test(read("src/lib/modules/inventory/index.ts")), "no prisma import",
    cut(read("src/lib/modules/inventory/index.ts").split("\n").filter((l) => /core\/db|PrismaClient/.test(l)).join(" · ") || "-"), "MAJOR");

  const invCtxA = { tenantId: tidA, systemId: invSys };
  const itemProd = await P.invItem.create({ data: { tenantId: tidA, systemId: invSys, sku: `${TAG}-SKU-1`, barcode: `${TAG}-BAR-1`, name: `ไฟฉายดำน้ำ ${TAG}`, kind: "PRODUCT", priceSatang: 150_000 } });
  const itemSvc = await P.invItem.create({ data: { tenantId: tidA, systemId: invSys, sku: `${TAG}-SKU-2`, name: `คอร์สดำน้ำ ${TAG}`, kind: "SERVICE", priceSatang: 900_000 } });
  const itemArch = await P.invItem.create({ data: { tenantId: tidA, systemId: invSys, sku: `${TAG}-SKU-3`, name: `ของเลิกขาย ${TAG}`, kind: "PRODUCT", archivedAt: new Date() } });
  await P.invItem.create({ data: { tenantId: tidB, systemId: invSysB, sku: `${TAG}-SKU-B`, name: `ของร้านอื่น ${TAG}`, kind: "PRODUCT" } }); // the foreign shop's item (X1.12)
  await P.invItem.createMany({
    data: Array.from({ length: 55 }, (_, i) => ({ tenantId: tidA, systemId: invSys, sku: `${TAG}-BULK-${i}`, name: `สินค้าชุดใหญ่ ${TAG}bulk ${i}`, kind: "PRODUCT", priceSatang: 100 + i })),
  });
  {
    const items = await watch("inventory.listItems", () => call(INV?.listItems, invCtxA, 200));
    const svcs = await call(INV?.listServices, invCtxA, 200);
    const idsP = Array.isArray(items.v) ? items.v.map((x: Any) => x.id) : [];
    const idsS = Array.isArray(svcs.v) ? svcs.v.map((x: Any) => x.id) : [];
    chk("C0.3-SD.2", "listItems returns PRODUCTs only — the SERVICE row and the archived row are excluded",
      idsP.includes(itemProd.id) && !idsP.includes(itemSvc.id) && !idsP.includes(itemArch.id), "product only", cut(`prod=${idsP.includes(itemProd.id)} svc=${idsP.includes(itemSvc.id)} arch=${idsP.includes(itemArch.id)}`));
    chk("C0.3-SD.3", "listServices returns SERVICEs only (CRM deal lines pick services from here; InvItem has no VAT column — price = priceSatang)",
      idsS.includes(itemSvc.id) && !idsS.includes(itemProd.id), "service only", cut(`svc=${idsS.includes(itemSvc.id)} prod=${idsS.includes(itemProd.id)}`));
  }
  {
    const got = await watch("inventory.getItem", () => call(INV?.getItem, invCtxA, itemProd.id));
    const arch = await call(INV?.getItem, invCtxA, itemArch.id);
    const none = await call(INV?.getItem, invCtxA, `${TAG}-no-item`);
    chk("C0.3-SD.4", "getItem returns the item (with priceSatang) · an archived item and an unknown id → null",
      got.ok && got.v?.id === itemProd.id && got.v?.priceSatang === 150_000 && arch.v === null && none.v === null,
      "item · null · null", cut(`${got.err || j({ id: got.v?.id, price: got.v?.priceSatang })} arch=${j(arch.v)} none=${j(none.v)}`));
  }
  {
    const byName = await watch("inventory.searchItems", () => call(INV?.searchItems, invCtxA, "ไฟฉายดำน้ำ", 50));
    const bySku = await call(INV?.searchItems, invCtxA, `${TAG}-SKU-1`, 50);
    const byBar = await call(INV?.searchItems, invCtxA, `${TAG}-BAR-1`, 50);
    const archQ = await call(INV?.searchItems, invCtxA, `ของเลิกขาย ${TAG}`, 50);
    const has = (r: Any, id: string) => Array.isArray(r.v) && r.v.some((x: Any) => x.id === id);
    chk("C0.3-SD.5", "searchItems finds an item by name, by sku and by barcode, and never returns an archived item",
      has(byName, itemProd.id) && has(bySku, itemProd.id) && has(byBar, itemProd.id) && Array.isArray(archQ.v) && !has(archQ, itemArch.id),
      "found ×3 · archived excluded", cut(`name=${has(byName, itemProd.id)} sku=${has(bySku, itemProd.id)} bar=${has(byBar, itemProd.id)} arch=${has(archQ, itemArch.id)} err=${byName.err}`));
    const big = await call(INV?.searchItems, invCtxA, `${TAG}bulk`, 999);
    const five = await call(INV?.searchItems, invCtxA, `${TAG}bulk`, 5);
    chk("C0.3-SD.6", "searchItems clamps take at 50 (55 matching rows exist · take:999 → ≤50) and honours a smaller take (take:5 → 5)",
      Array.isArray(big.v) && big.v.length <= 50 && big.v.length > 0 && Array.isArray(five.v) && five.v.length === 5,
      "≤50 · 5", cut(`big=${big.v?.length} five=${five.v?.length} err=${big.err}`));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ E — party facade ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── E · party ──");
  const E_OLD = ["normalizePartyPhone", "safeFindOrCreate", "recordMergeCandidates", "findDuplicateCandidates", "listBriefsByIds"];
  chk("C0.3-SE.1", `party facade exports updateContactInfo and still exports ${E_OLD.join(", ")}`,
    typeof PARTY.updateContactInfo === "function" && E_OLD.every((n) => typeof PARTY[n] === "function"),
    "updateContactInfo + 5 old", `new=${typeof PARTY.updateContactInfo} · missing old=${E_OLD.filter((n) => typeof PARTY[n] !== "function").join(",") || "-"}`);
  const pE = (await PARTY.findOrCreate(tidA, { name: `คุณอี ${TAG}`, phone: "0811110001", email: `${TAG}-e@qc.local` })).id as string;
  {
    const before = await P.party.findFirst({ where: { id: pE } });
    const r = await watch("party.updateContactInfo(name)", () => call(PARTY.updateContactInfo, tidA, pE, { name: `คุณอีชื่อใหม่ ${TAG}` }));
    const after = await P.party.findFirst({ where: { id: pE } });
    chk("C0.3-SE.2", "updateContactInfo({name}) changes only the name — phone/phoneNorm/email/taxId are untouched (a partial update must not blank the rest)",
      r.ok && after?.name === `คุณอีชื่อใหม่ ${TAG}` && after?.phone === before?.phone && after?.phoneNorm === before?.phoneNorm && after?.email === before?.email && after?.taxId === before?.taxId,
      "name changed, rest identical", cut(`${r.err || ""} ${j({ name: after?.name, phone: after?.phone, email: after?.email })}`));
  }
  {
    const r = await watch("party.updateContactInfo(phone)", () => call(PARTY.updateContactInfo, tidA, pE, { phone: "+66 (0)81 111 0002" }));
    const after = await P.party.findFirst({ where: { id: pE } });
    chk("C0.3-SE.3", "updateContactInfo({phone}) normalises the phone the same way as normalizePartyPhone (+66 (0)81 111 0002 → 0811110002) and writes phoneNorm — phoneNorm is the key every duplicate check uses",
      r.ok && after?.phoneNorm === PARTY.normalizePartyPhone("+66 (0)81 111 0002") && !!after?.phoneNorm && after?.phone === "+66 (0)81 111 0002".trim(),
      `phoneNorm = ${PARTY.normalizePartyPhone("+66 (0)81 111 0002")}`, cut(`${r.err || ""} ${j({ phone: after?.phone, norm: after?.phoneNorm })}`), "MAJOR");
    const r2 = await call(PARTY.updateContactInfo, tidA, pE, { email: `${TAG}-e2@qc.local` });
    const after2 = await P.party.findFirst({ where: { id: pE } });
    chk("C0.3-SE.4", "updateContactInfo({email}) writes the new e-mail",
      r2.ok && after2?.email === `${TAG}-e2@qc.local`, "email updated", cut(`${r2.err || ""} ${j(after2?.email)}`));
  }
  {
    const pOther = (await PARTY.findOrCreate(tidA, { name: `คุณชนเบอร์ ${TAG}`, phone: "0811110099" })).id as string;
    const r = await watch("party.updateContactInfo(collision)", () => call(PARTY.updateContactInfo, tidA, pE, { phone: "0811110099" }));
    const cand = await P.partyMergeCandidate.findMany({ where: { tenantId: tidA, OR: [{ partyAId: pE, partyBId: pOther }, { partyAId: pOther, partyBId: pE }] } });
    const after = await P.party.findFirst({ where: { id: pE } });
    chk("C0.3-SE.5", "a phone that now collides with another Party of the same shop does NOT fail the update — it records a PartyMergeCandidate for the pair (the shop resolves duplicates on the merge screen; a hard failure would block the CRM edit form)",
      r.ok && cand.length === 1 && after?.phoneNorm === PARTY.normalizePartyPhone("0811110099"),
      "1 merge candidate · phone written", cut(`${r.err || ""} candidates=${cand.length} norm=${after?.phoneNorm}`));
  }
  {
    const snapshot = (await P.party.findFirst({ where: { id: pE } }))?.name;
    await prisma.$transaction(async (tx) => {
      await PARTY.updateContactInfo(tidA, pE, { name: `ชื่อใน tx ที่ต้องหาย ${TAG}` }, tx);
      throw new Error("rollback-on-purpose");
    }).catch(() => null);
    const afterRollback = (await P.party.findFirst({ where: { id: pE } }))?.name;
    const okTx = await prisma.$transaction(async (tx) => {
      await PARTY.updateContactInfo(tidA, pE, { name: `ชื่อใน tx ที่ต้องอยู่ ${TAG}` }, tx);
      return true;
    }).catch(() => false);
    const afterCommit = (await P.party.findFirst({ where: { id: pE } }))?.name;
    chk("C0.3-SE.6", "the optional `tx` argument really joins the caller's transaction: a write inside a rolled-back transaction leaves the row untouched, the same write inside a committed one lands (callers wire this into their own atomic writes)",
      afterRollback === snapshot && okTx === true && afterCommit === `ชื่อใน tx ที่ต้องอยู่ ${TAG}`,
      "rollback = unchanged · commit = changed", cut(`rollback=${afterRollback === snapshot} commit=${afterCommit}`));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ F — approval registry ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── F · approval ──");
  const CRM_ENTITY_TYPES = ["crm.discount", "crm.commission", "crm.reassign", "crm.portal_request"];
  const ALL_F_TYPES = [...CRM_ENTITY_TYPES, "AccountDocument"];
  {
    const defs = (apprLabels.ENTITY_TYPES ?? []) as Any[];
    const byValue = new Map(defs.map((d: Any) => [d.value, d.label]));
    const missing = CRM_ENTITY_TYPES.filter((t) => !byValue.has(t) || !thai(byValue.get(t)));
    chk("C0.3-SF.1", `approval/labels.ts declares the 4 CRM entity types with Thai labels (${CRM_ENTITY_TYPES.join(", ")}) and keeps the 7 old ones`,
      missing.length === 0 && ["PurchaseOrder", "HrLeave", "member.merge", "member.tier.manual", "member.erase", "member.point.adjust", "member.voucher.issue"].every((t) => byValue.has(t)),
      "4 new with Thai labels + 7 old", `missing/label-less: ${missing.join(",") || "-"}`);
  }
  {
    const src = read("src/lib/modules/approval/actions.ts");
    const setLine = /const\s+ENTITY_TYPES\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/.exec(src)?.[1] ?? "";
    const values = [...setLine.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
    const missing = ALL_F_TYPES.filter((t) => !values.includes(t));
    chk("C0.3-SF.2", "[static] the allowlist `ENTITY_TYPES` in approval/actions.ts contains the 4 CRM types AND \"AccountDocument\" — AccountDocument was the pre-existing bug: approval-cap.ts submits it while the settings screen refused to create a policy for it",
      missing.length === 0, ALL_F_TYPES.join(","), `missing: ${missing.join(",") || "-"} · found: ${values.join(",")}`);
  }
  {
    const results: string[] = [];
    for (const t of ALL_F_TYPES) {
      const pol = await apprSvc.createPolicy({ tenantId: tidA }, { name: `${TAG} ${t}`, entityType: t, steps: [{ order: 1, approverRole: "MANAGER" }] }).catch((e: Any) => ({ err: String(e?.message ?? e) }));
      const resolved = await apprSvc.resolvePolicy({ tenantId: tidA }, { entityType: t, systemId: crmSys }).catch(() => null);
      const sub = await watch(`approval.submit(${t})`, () => apprSvc.submitForApproval({ tenantId: tidA }, { entityType: t, entityId: `${TAG}-${t}-1`, systemId: crmSys, requestedById: FAKE_USER }).catch((e: Any) => ({ err: String(e?.message ?? e) })));
      const ok = !!(pol as Any)?.id && !!resolved && !!(sub as Any)?.requestId;
      results.push(`${t}:${ok ? "ok" : j({ pol, resolved: !!resolved, sub })}`);
    }
    chk("C0.3-SF.3", `a policy can really be created, resolved and submitted against for each of the 5 entity types (${ALL_F_TYPES.join(", ")}) — not just listed in a label file`,
      results.every((r) => r.endsWith(":ok")), "5 × ok", cut(results.join(" · "), 320));
  }
  {
    const src = read("src/lib/approval-effects.ts");
    const missing = CRM_ENTITY_TYPES.filter((t) => !src.includes(t));
    const before = await P.auditLog.count({ where: { tenantId: tidA } });
    const r = await watch("applyApprovalEffect(crm.*)", () => call(effects.applyApprovalEffect, { tenantId: tidA, type: "approval.request.approved", payload: { entityType: "crm.discount", entityId: `${TAG}-nonexistent`, requestId: `${TAG}-req` } }));
    const after = await P.auditLog.count({ where: { tenantId: tidA } });
    chk("C0.3-SF.4", "[static+run] approval-effects.ts has a branch for each of the 4 CRM entity types (each later work order fills its own) and applying an approved crm.* decision today is a silent NO-OP: it neither throws nor writes anything",
      missing.length === 0 && r.ok && before === after, "4 branches · no throw · no writes", cut(`missing=${missing.join(",") || "-"} err=${r.err} audits ${before}→${after}`));
  }
  {
    // regression guard for the allowlist edit: the pre-existing AccountDocument effect must still work
    const doc = await accSvc.createDocument({ tenantId: tidA, systemId: accSys, docType: "QUOTATION", lines: [{ description: `รออนุมัติ ${TAG}`, qty: 1, unitPrice: 1_000 }] });
    await P.accountDocument.update({ where: { id: doc.id }, data: { status: "AWAITING_APPROVAL" } });
    await call(effects.applyApprovalEffect, { tenantId: tidA, type: "approval.request.approved", payload: { entityType: "AccountDocument", entityId: doc.id, requestId: `${TAG}-req2` } });
    const row = await P.accountDocument.findFirst({ where: { id: doc.id } });
    chk("C0.3-SF.5", "the existing AccountDocument effect still works after the allowlist edit (AWAITING_APPROVAL → APPROVED) — additive only, zero behaviour change",
      row?.status === "APPROVED", "APPROVED", `${row?.status}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ X1 — scope (every new read/write refuses a foreign tenant) ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  {
    const r = await call(ACC.convertQuotationToInvoice, ctxB, qChainId, {});
    const made = await P.accountDocument.count({ where: { docType: "INVOICE", sourceDocId: qChainId } });
    chk("C0.3-X1.1", "convertQuotationToInvoice with ANOTHER shop's ctx refuses tenant A's quotation (ok:false) and creates no extra invoice",
      r.ok && r.v?.ok === false && made === 1, "{ok:false} · still 1 invoice", cut(`${r.err || j(r.v)} · invoices=${made}`));
  }
  {
    const before = await P.accountDocument.findFirst({ where: { id: qDraftId } });
    const r = await call(ACC.respondQuotation, ctxB, qDraftId, true, { by: "STAFF" });
    const after = await P.accountDocument.findFirst({ where: { id: qDraftId } });
    chk("C0.3-X1.2", "respondQuotation with another shop's ctx refuses (ok:false) and leaves tenant A's quotation untouched",
      r.ok && r.v?.ok === false && before?.status === after?.status && after?.acceptedAt === null, "{ok:false} · unchanged", cut(`${r.err || j(r.v)} · ${before?.status}→${after?.status}`));
  }
  {
    const r = await call(ACC.docLinkInfo, tidB, qChainId);
    chk("C0.3-X1.3", "docLinkInfo(anotherTenantId, docId) → null — never another shop's document row",
      r.ok && r.v === null, "null", cut(`${r.err || j(r.v)}`));
  }
  {
    const contactId = (await P.accountDocument.findFirst({ where: { id: invoiceId || `${TAG}-no-such-doc` } }))?.contactId ?? "";
    const r = await call(ACC.outstandingByContacts, tidB, accSysB, [contactId]);
    chk("C0.3-X1.4", "outstandingByContacts scoped to another shop never reports tenant A's contact",
      r.ok && r.v instanceof Map && !r.v.has(contactId), "no key for the foreign contact", cut(`${r.err || j([...(r.v?.keys?.() ?? [])])}`));
  }
  {
    const a = await accSvc.createContact({ tenantId: tidA, systemId: accSys, kind: "CUSTOMER", name: `ตัวหลักข้ามร้าน ${TAG}` });
    const b = await accSvc.createContact({ tenantId: tidA, systemId: accSys, kind: "CUSTOMER", name: `ตัวรองข้ามร้าน ${TAG}` });
    const r = await call(ACC.mergeContacts, ctxB, { primaryId: a.id, secondaryId: b.id });
    const rowB = await P.accountContact.findFirst({ where: { id: b.id } });
    chk("C0.3-X1.5", "mergeContacts with another shop's ctx refuses (ok:false, Thai reason) and merges nothing",
      r.ok && r.v?.ok === false && thai(r.v?.reason) && rowB?.mergedIntoId === null, "{ok:false} · nothing merged", cut(`${r.err || j(r.v)} · mergedInto=${j(rowB?.mergedIntoId)}`));
  }
  {
    const before = await P.accountContact.count({ where: { systemId: accSys, partyId: partySeq } });
    const r = await call(ACC.ensureAccountContact, ctxB, { partyId: partySeq, name: `บจก. ตัวตนกลาง ${TAG}`, legalType: "COMPANY" });
    const inA = await P.accountContact.count({ where: { systemId: accSys, partyId: partySeq } });
    const inB = await P.accountContact.count({ where: { systemId: accSysB, partyId: partySeq } });
    chk("C0.3-X1.6", "ensureAccountContact is scoped per book: the same partyId asked for in another shop's account system creates that shop's OWN contact and never returns (or touches) tenant A's row",
      r.ok && inA === before && inB === 1 && idOf(r.v) !== (await P.accountContact.findFirst({ where: { systemId: accSys, partyId: partySeq } }))?.id,
      "A unchanged · B gets its own row", cut(`${r.err} A:${before}→${inA} B:${inB}`));
  }
  {
    const r = await call(ACC.createPaymentRequestForDoc, ctxB, invoiceId || `${TAG}-no-such-doc`, { financeId: `${TAG}-x` });
    chk("C0.3-X1.7", "createPaymentRequestForDoc with another shop's ctx answers \"ไม่พบเอกสาร\" (404-style, no information about the foreign document)",
      r.ok && r.v?.ok === false && /ไม่พบเอกสาร/.test(String(r.v?.reason)), "ไม่พบเอกสาร", cut(`${r.err || j(r.v)}`));
  }
  {
    const foreign = await call(CHAT.listConversationsByParty, chatCtxA, partyB, { take: 50, unitAccess: ["*"] });
    const mineIds = Array.isArray(listAll.v) ? listAll.v.map((r: Any) => r.conversationId) : [];
    const rows = mineIds.length ? ((await P.chatConversation.findMany({ where: { id: { in: mineIds } }, select: { id: true, tenantId: true } })) as Any[]) : [];
    // shop-wide (decision 6) must still mean "this shop": every systemId reported has to be a CHAT system of tenant A
    const chatSystemsOfA = new Set(((await P.appSystem.findMany({ where: { tenantId: tidA, type: "CHAT" }, select: { id: true } })) as Any[]).map((x) => x.id as string));
    const systemsOk = Array.isArray(listAll.v) && listAll.v.length > 0 && listAll.v.every((r: Any) => chatSystemsOfA.has(r.systemId));
    chk("C0.3-X1.8", "listConversationsByParty never leaves the shop: a Party that only has conversations in another tenant returns [] · every row returned for our own Party belongs to this tenant · and every systemId reported is one of THIS tenant's CHAT systems (shop-wide must not become platform-wide)",
      Array.isArray(foreign.v) && foreign.v.length === 0 && rows.length > 0 && rows.every((r) => r.tenantId === tidA) && !mineIds.includes(convB) && systemsOk,
      "[] for the foreign party · all rows tenant A · all systemIds are tenant A's CHAT systems",
      cut(`foreign=${j(foreign.v)} mine=${rows.map((r) => r.tenantId === tidA).join(",")} systems=${systemsOk}`));
  }
  {
    const r = await call(CHAT.sendLineToParty, chatCtxA, { partyId: partyB, text: "ไม่ควรส่งได้" });
    chk("C0.3-X1.9", "sendLineToParty refuses a Party whose LINE contact lives in another shop (ok:false) — the resolver must be tenant-scoped",
      r.ok && r.v?.ok === false, "{ok:false}", cut(`${r.err || j(r.v)}`));
  }
  {
    const e = await call(HR?.employeeOfUser, tidB, empUser);
    const l = await call(HR?.isOnLeave, tidB, empUser, new Date("2026-09-11T05:00:00.000Z"));
    chk("C0.3-X1.10", "employeeOfUser / isOnLeave asked with another shop's tenantId → null / false (never tenant A's employee or leave)",
      e.ok && e.v === null && l.ok && l.v === false, "null · false", cut(`${e.err || j(e.v)} · ${j(l.v)}`));
  }
  {
    const r = await call(HR?.requestAdjustment, { tenantId: tidB, systemId: hrSysB }, { employeeId: emp.id, periodKey: "2026-09", kind: "COMMISSION", amountSatang: 100_00, requestedById: FAKE_USER });
    const rows = await P.hrPayAdjustment.count({ where: { employeeId: emp.id } });
    chk("C0.3-X1.11", "requestAdjustment with another shop's ctx cannot book a commission against tenant A's employee (ok:false, no row)",
      r.ok && r.v?.ok === false && rows === 0, "{ok:false} · 0 rows", cut(`${r.err || j(r.v)} · rows=${rows}`));
  }
  {
    const g = await call(INV?.getItem, { tenantId: tidB, systemId: invSysB }, itemProd.id);
    const g2 = await call(INV?.getItem, { tenantId: tidA, systemId: invSysB }, itemProd.id);
    const s = await call(INV?.searchItems, { tenantId: tidB, systemId: invSysB }, `${TAG}bulk`, 50);
    const l = await call(INV?.listItems, { tenantId: tidB, systemId: invSysB }, 200);
    const sawA = (r: Any) => Array.isArray(r.v) && r.v.some((x: Any) => x.tenantId === tidA);
    chk("C0.3-X1.12", "inventory facade is scoped by BOTH tenant and system: getItem across shops → null · getItem with our tenant but another shop's systemId → null · searchItems/listItems of the other shop never contain tenant A's items",
      g.v === null && g2.v === null && !sawA(s) && !sawA(l) && Array.isArray(s.v) && Array.isArray(l.v),
      "null · null · no foreign rows", cut(`g=${j(g.v)} g2=${j(g2.v)} s=${s.v?.length} l=${l.v?.length}`));
  }
  {
    const before = j(await P.party.findFirst({ where: { id: pE } }));
    const r = await call(PARTY.updateContactInfo, tidB, pE, { name: `ห้ามเปลี่ยนได้ ${TAG}`, phone: "0899999999" });
    const after = j(await P.party.findFirst({ where: { id: pE } }));
    chk("C0.3-X1.13", "updateContactInfo with another shop's tenantId does not touch tenant A's Party (row byte-identical before/after)",
      before === after, "row unchanged", cut(`changed=${before !== after}`));
  }
  {
    const resolved = await apprSvc.resolvePolicy({ tenantId: tidB }, { entityType: "crm.discount", systemId: crmSys }).catch(() => "throw");
    chk("C0.3-X1.14", "an approval policy created for the CRM types in tenant A does not resolve for another tenant",
      resolved === null, "null", cut(j(resolved)));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ X3 — ensureAccountContact under real concurrency ▓▓
  //   half 1: 12 concurrent calls through the module's own pooled client · 3 rounds, fresh Party each round
  //   half 2: 4 separate PROCESSES × 3 calls, all released at the same wall-clock instant · 2 rounds
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · ensureAccountContact in parallel ──");
  {
    const rounds: string[] = [];
    let okRows = true;
    let okSameId = true;
    for (let r = 0; r < 3; r += 1) {
      const pid = (await PARTY.findOrCreate(tidA, { name: `บจก. แข่งกัน ${TAG}-${r}`, taxId: `010556100${String(r).padStart(4, "0")}` })).id as string;
      const got = await Promise.all(
        Array.from({ length: 12 }, () =>
          ACC.ensureAccountContact({ tenantId: tidA, systemId: accSys }, { partyId: pid, name: `บจก. แข่งกัน ${TAG}-${r}`, legalType: "COMPANY" })
            .then((x: Any) => idOf(x))
            .catch((e: Any) => `ERR:${e instanceof Error ? e.message : String(e)}`),
        ),
      );
      const rows = await P.accountContact.count({ where: { systemId: accSys, partyId: pid } });
      const uniq = [...new Set(got)];
      if (rows !== 1) okRows = false;
      if (uniq.length !== 1 || uniq[0].startsWith("ERR:") || uniq[0].startsWith("?")) okSameId = false;
      rounds.push(`รอบ${r + 1}: rows=${rows} ids=${uniq.length}`);
    }
    chk("C0.3-X3.1", "12 ensureAccountContact calls fired at once for the SAME new Party (3 rounds, a fresh Party each round — in-process, so the module pool really hands out several connections) leave exactly ONE AccountContact row — find-then-create without a lock/atomic insert produces duplicates that quietly split a customer's documents in two",
      okRows, "1 row every round", rounds.join(" · "));
    chk("C0.3-X3.2", "…and every one of the 12 concurrent callers gets the SAME contact id back (deleting duplicates afterwards is not good enough — the loser already handed a dead id to its caller)",
      okSameId, "1 distinct id every round", rounds.join(" · "));
  }
  {
    const rounds: string[] = [];
    let ok = true;
    let spawnedOk = true;
    for (let r = 0; r < 2; r += 1) {
      const pid = (await PARTY.findOrCreate(tidA, { name: `บจก. แข่งข้ามโพรเซส ${TAG}-${r}`, taxId: `010556101${String(r).padStart(4, "0")}` })).id as string;
      // 🔴 spawnSync inside a Promise executor would run the four children one after another —
      //    the race would be fake. Spawn asynchronously and let a shared wall-clock instant release them.
      const startAt = Date.now() + 30_000;
      const outs = await Promise.all(
        Array.from({ length: 4 }, () =>
          new Promise<string>((resolve) => {
            const ch = spawn("pnpm", ["exec", "tsx", "scripts/qc-crm-c0.3.mts", "--x3-worker", tidA, accSys, pid, `บจก. แข่งข้ามโพรเซส ${TAG}-${r}`, String(startAt), "3"], { env: process.env });
            let out = "";
            const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* already gone */ } }, 300_000);
            ch.stdout.on("data", (d: Any) => { out += String(d); });
            ch.stderr.on("data", (d: Any) => { out += String(d); });
            ch.on("error", (e: Any) => { clearTimeout(to); resolve(`SPAWN-ERROR ${String(e)}`); });
            ch.on("close", () => { clearTimeout(to); resolve(out); });
          }),
        ),
      );
      const ids = outs.flatMap((o) => {
        const m = /X3WORKER (\[.*\])/.exec(o);
        return m ? (JSON.parse(m[1]) as string[]) : ["NO-OUTPUT"];
      });
      const rows = await P.accountContact.count({ where: { systemId: accSys, partyId: pid } });
      const uniq = [...new Set(ids)];
      if (ids.includes("NO-OUTPUT") || ids.length !== 12) spawnedOk = false;
      if (rows !== 1 || uniq.length !== 1) ok = false;
      rounds.push(`รอบ${r + 1}: calls=${ids.length} rows=${rows} ids=${uniq.length}`);
    }
    chk("C0.3-X3.3a", "[positive control] the 4 worker PROCESSES really ran and answered (12 calls per round) — if this is red, X3.3 below proves nothing",
      spawnedOk, "12 answers per round", rounds.join(" · "), "MAJOR");
    chk("C0.3-X3.3", "the same race across 4 SEPARATE PROCESSES (separate PrismaClients, separate pools, synchronised start, 2 rounds) still leaves exactly ONE row and one id — an in-process lock (a JS mutex/Map) would pass X3.1 and fail here",
      ok, "1 row · 1 id every round", rounds.join(" · "));
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ X8 — PDPA: no phone / e-mail in logs, audit, OpsEvent or NEW outbox payloads ▓▓
  //   🔴 Scope (RESOLUTIONS R-C 17: "the X8 payload scan applies to events ADDED OR CHANGED by
  //      this run"): `account.contact.created/updated` already carry phone+email today
  //      (events.ts:296 `contactPayload`) — that is the account module's pre-existing debt and is
  //      NOT this work order's. So the payload scan skips event types that already exist in
  //      ACCOUNT_EVENT_TYPES, and X8.1 proves this work order introduced no new event type at all.
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA ──");
  const PREEXISTING = new Set<string>([
    ...((accEvents.ACCOUNT_EVENT_TYPES ?? []) as string[]),
    ...((hooks.WEBHOOK_EVENTS ?? []) as Any[]).map((e: Any) => e.value as string),
    "approval.request.submitted", "approval.request.approved", "approval.request.rejected",
  ]);
  const allOutbox = EVIDENCE.flatMap((e) => e.outbox);
  {
    const types = [...new Set(allOutbox.map((o: Any) => o.type as string))];
    const unknown = types.filter((t) => !PREEXISTING.has(t));
    chk("C0.3-X8.1", "C0.3 is additive: the new facade functions emit NO new outbox event type (every type produced during the watched calls is one that already existed and is already registered). A new type would need a consumer + a label registry entry in this same work order",
      unknown.length === 0, "no unknown event type", `unknown: ${unknown.join(",") || "-"} · seen: ${types.join(",") || "-"}`);
  }
  {
    const offenders: string[] = [];
    for (const ev of EVIDENCE) {
      for (const o of ev.outbox) {
        if (PREEXISTING.has(o.type)) continue; // pre-existing debt, see the note above
        const blob = j(o.payload);
        if (blob.includes(SENT_PHONE) || blob.includes(SENT_EMAIL)) offenders.push(`${ev.label} → outbox ${o.type}`);
      }
    }
    chk("C0.3-X8.2", "no outbox payload emitted by a NEW function carries the customer's phone or e-mail (payloads carry ids only)",
      offenders.length === 0, "none", offenders.join(" · ") || "-");
  }
  {
    const offenders: string[] = [];
    for (const ev of EVIDENCE) {
      for (const a of ev.audits) {
        const blob = j({ action: a.action, targetType: a.targetType, targetId: a.targetId, before: a.before, after: a.after });
        if (blob.includes(SENT_PHONE) || blob.includes(SENT_EMAIL)) offenders.push(`${ev.label} → AuditLog ${a.action}`);
      }
      for (const o of ev.ops) {
        const blob = j({ message: o.message, detail: o.detail });
        if (blob.includes(SENT_PHONE) || blob.includes(SENT_EMAIL)) offenders.push(`${ev.label} → OpsEvent`);
      }
    }
    chk("C0.3-X8.3", "no AuditLog row (including respondQuotation's signer evidence) and no OpsEvent written by the new functions contains the customer's phone or e-mail",
      offenders.length === 0, "none", offenders.join(" · ") || "-");
  }
  {
    const offenders = EVIDENCE.filter((ev) => ev.logs.some((l) => l.includes(SENT_PHONE) || l.includes(SENT_EMAIL))).map((ev) => ev.label);
    chk("C0.3-X8.4", "nothing the new functions print to the console (including their error paths) contains the customer's phone or e-mail",
      offenders.length === 0, "none", offenders.join(" · ") || "-");
  }
  chk("C0.3-X8.0", "[positive control] the evidence recorder actually captured something (audit/outbox rows and console output were harvested) — otherwise X8.1–X8.4 would be vacuously green",
    EVIDENCE.length >= 10 && EVIDENCE.some((e) => e.outbox.length > 0 || e.audits.length > 0),
    "≥10 watched calls with rows", `windows=${EVIDENCE.length} rows=${EVIDENCE.reduce((n, e) => n + e.outbox.length + e.audits.length, 0)}`, "MAJOR");
} catch (e) {
  chk("C0.3-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 400));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — the QC books must be exactly as found. Everything this file created lives in the
  // two throwaway tenants, so we sweep EVERY table that has a `tenantId` column (4 passes so that
  // FK children go before their parents), then the units/systems/tenants themselves.
  // ═════════════════════════════════════════════════════════════════════════════
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
    // proof: nothing of ours is left anywhere
    try {
      const left: string[] = [];
      for (const t of tables) {
        const rows = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(rows?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      chk("C0.3-CLEAN", "the oracle gives the QC database back exactly as it found it — the two throwaway tenants and every row that belonged to them are gone (the shared QC books were never touched: this file writes ACCOUNT data only inside its own tenants)",
        left.length === 0 && tenants === 0, "0 rows · 0 tenants", `${left.join(" · ") || "-"} · tenants=${tenants}`, "MAJOR");
    } catch (e) {
      chk("C0.3-CLEAN", "the oracle gives the QC database back exactly as it found it", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C0.3: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
