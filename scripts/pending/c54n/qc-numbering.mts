// QC — CRM C5.4-N "journal-voucher numbering race" (hunter R9-7 / R10-9 / R11-2) — oracle written BEFORE the fix (test author · no product code)
//   RED on 63ea9f45 for the finding's own reason (gl.ts nextJournalNo = count+1 with no lock ⇒ P2002 on "AccountJournalEntry"(systemId, docNo)
//   inside money transactions under concurrency) · GREEN once the design in ledger/wo-notes/crm-C5.4-N.md is built.
//   The contracts state behaviour, never an implementation — except where the design note's owner decision P20 is the behaviour
//   (JV numbers MAY have gaps · legal document numbers MUST NOT).
// Oracle writer · the builder must NOT edit this file (ORACLE-EDIT through the controller only) · QC2 database only
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54n/qc-numbering.mts
//      `--only=N1,N6` = run only those sections (N2 / N4a / N3-numbers / CLEAN are computed over whatever ran)
// requires: none (no seed is read · every row lives in the throwaway tenants `qc-c54n-<rand>-{a,b}` and is deleted in finally — CLEAN proves it)
//
// CHECK INVENTORY
//   N1a  3 cashiers, goods (ON_ISSUE) — hunter Q3 mix: 15+5 singles (form path) · six 5-child cheque batches · one 40-child cheque batch
//   N1b  the same mix for a service shop: ON_PAYMENT invoices (auto tax invoice per payment) + 3 % WHT on every child/single (WTI cert)
//   N2   journal numbers: unique per system · display format `<SV|PV|RV|PY|JV>-<yyyy>-<mm>-<n ≥4 digits>` with prefix = book and
//        yyyy-mm = the entry's period · monotonic per allocation (inside one transaction strictly increasing; across transactions
//        never decreasing once >1 s apart) · gaps allowed (reported)
//   N3   legal documents issued by 3 concurrent actors ×20 — tax invoice · receipt · WTI cert · 50 ทวิ · purchase tax invoice: every
//        operation ok (N3-ops) · every issued legal document numbered, unique, gapless per series from 1, counter = max (N3-numbers)
//   N4a  rows created before the concurrent phases keep their numbers (journal + documents)
//   N4b  a book whose existing rows already use numbers above its row count (rows that existed before the new numbering / were
//        imported / were deleted) — new postings succeed and never reuse an existing number
//   N5   readers show the stored number in the documented format: journal list search (exactly 1 hit) · REST journalRow/journalDetail ·
//        general ledger · finance statement · document JV tab · the manual-JV modal preview does not consume a number
//   N6   a concurrent single payment during a 40-child service batch (40 auto tax invoices + 40 WTI certs) waits < 2 s more than the
//        same payment alone — goods single and service+WHT single · batch ok · every single ok
//   N7   a transaction that fails after reserving legal numbers consumes none (next tax invoice / WTI / 50 ทวิ = previous + 1) ·
//        it MAY consume journal numbers (reported, allowed by P20)
//   N8   CLEAN
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const ARGV = process.argv.slice(2);
const ONLY = (ARGV.find((a) => a.startsWith("--only=")) ?? "").slice("--only=".length).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const want = (sec: string) => ONLY.length === 0 || ONLY.includes(sec);

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.log(`🔴 C5.4-N runs on QC2 only (ep-cool-shadow) — got ${host}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 1, passed: 0, findings: [{ id: "C5.4-N-ENV", sev: "CRITICAL" }] })}`);
  process.exit(1);
}
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async () => { throw new Error("C5.4-N: network blocked"); }) as typeof fetch;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
// raw errors at the transaction boundary (what the user's request actually died of) — the user only sees the Thai wrapper
const rawErrors: string[] = [];
const origTx = P.$transaction.bind(P);
P.$transaction = async (...a: Any[]) => { try { return await origTx(...a); } catch (e) { rawErrors.push(`${String((e as Any)?.code ?? "")}|${String((e as Any)?.meta?.modelName ?? "")}|${String((e as Any)?.message ?? e).replace(/\s+/g, " ").slice(0, 220)}`); throw e; } };
const klass = (e: string) => /QC-INDUCED/.test(e) ? "induced" : /40P01|deadlock/i.test(e) ? "DEADLOCK" : /P2002/.test(e) ? (/DocSequence/i.test(e) ? "P2002 counter" : /AccountDocument\b|accountDocument\./.test(e) && !/JournalEntry/i.test(e) ? "P2002 document no." : "P2002 journal no.") : /P2028|P2034|timeout|expired|Transaction already closed|Unable to start a transaction/i.test(e) ? "TX-TIMEOUT" : /[ก-๙]/.test(e.slice(0, 90)) ? "thai-refusal" : `other:${e.slice(0, 70)}`;
const cls = (list: string[]) => { const m: Record<string, number> = {}; for (const e of list) { const k = klass(e); m[k] = (m[k] ?? 0) + 1; } return m; };
const badRaw = (m: Record<string, number>) => Object.entries(m).filter(([k]) => /P2002|DEADLOCK|TX-TIMEOUT|other:/.test(k)).reduce((s, [, v]) => s + v, 0);

const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-c54n-${rand}`;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "MAJOR") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? `\n        — ${a}` : `\n        — CONTRACT ${e}\n        — ACTUAL   ${a}`}`);
};
const cut = (v: unknown, n = 300) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const sub = async (ids: string | string[], body: () => Promise<void>) => {
  const list = Array.isArray(ids) ? ids : [ids];
  const before = cks.length;
  try { await body(); } catch (e) {
    const done = new Set(cks.slice(before).map((c) => c.id));
    for (const id of list) if (!done.has(id)) chk(id, "check ran", false, "no exception (setup or a product call threw)", cut(e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e), 500));
  }
};

// ── number helpers ──
const BOOK_PREFIX: Record<string, string> = { SALES: "SV", PURCHASES: "PV", RECEIPTS: "RV", PAYMENTS: "PY", GENERAL: "JV" };
const JV_FORMAT = /^(SV|PV|RV|PY|JV)-(\d{4})-(\d{2})-(\d{4,})$/;
const tailNo = (s: string | null | undefined) => { const m = /(\d+)\s*$/.exec(s ?? ""); return m ? Number(m[1]) : NaN; };
const seriesOf = (s: string) => s.replace(/(\d+)\s*$/, "");
const LEGAL = ["TAX_INVOICE", "RECEIPT", "WHT_CERT", "PURCHASE_TAX_INVOICE"] as const;

const TENANTS: string[] = [];
const SYSTEMS: string[] = [];
let NOW_MS = 0;
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const exp = (await import("@/lib/modules/account/expense" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
  const pay = (await import("@/lib/modules/account/payment" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const jv = (await import("@/lib/modules/account/journal-v2" as string)) as Any;
  const serGl = (await import("@/lib/modules/account/api/serialize-gl" as string)) as Any;
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const key = () => `k${randomBytes(5).toString("hex")}`;
  let chqSeq = 0;
  const chq = () => ({ chequeNo: `N${++chqSeq}-${randomBytes(2).toString("hex")}`, bankName: "KBank", chequeDate: today });

  /** one throwaway tenant + ACCOUNT system; `beforeFirstPosting` runs before settings/chart exist (N4b legacy rows) */
  const world = async (label: string, beforeFirstPosting?: (T: string, A: string) => Promise<void>) => {
    const T = (await P.tenant.create({ data: { name: `${TAG}-${label}`, slug: `${TAG}-${label}` } })).id as string;
    TENANTS.push(T);
    const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG} ${label}`)).id as string;
    SYSTEMS.push(A);
    if (beforeFirstPosting) await beforeFirstPosting(T, A);
    await accSvc.saveSettings(T, A, { orgName: `QC C5.4-N ${label}`, taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
    await gl.ensureAccounting({ tenantId: T, systemId: A });
    const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
    const vend = await accSvc.createContact({ tenantId: T, systemId: A, kind: "VENDOR", legalType: "COMPANY", name: `ผู้ขาย ${TAG}`, taxId: "0105562222222" });
    const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
    const ctx = { tenantId: T, systemId: A };
    const inv = async (timing: "ON_ISSUE" | "ON_PAYMENT") => {
      const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: timing, lines: [{ description: timing === "ON_PAYMENT" ? "งานบริการ" : "สินค้า", qty: 1, unitPrice: 1_000_000 }] });
      const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(`setup: issue invoice → ${r.reason}`); return d.id as string;
    };
    const mkGroup = async (kids: string[]) => { const g = await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] }); if (!g.ok) throw new Error(`setup: group → ${g.reason}`); return g.id as string; };
    const expense = async (mode: "CLAIM" | "AWAITING", issue: boolean) => {
      const d = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: mode, lines: [{ description: mode === "AWAITING" ? "ค่าบริการ รอใบกำกับ" : "ค่าบริการ", qty: 1, unitPrice: 1_000_000 }] });
      if (issue) { const r = await exp.issueExpenseDoc(T, A, d.id); if (!r.ok) throw new Error(`setup: issue expense → ${r.reason}`); }
      return d.id as string;
    };
    const draft = (wht: boolean) => ({ paidAt: today, financeAccountId: bank.id, amountSatang: wht ? 1_040_000 : 1_070_000, whtAmountSatang: wht ? 30_000 : 0, whtRateBp: wht ? 300 : null, whtIncomeType: wht ? "M40_2" : null, feeSatang: 0, note: "", cheque: null });
    /** the form path (payment panel) — what a cashier presses */
    const single = (docId: string, wht: boolean) => pay.recordPayments(T, A, docId, [draft(wht)], { keyBase: key() });
    const batch = (groupId: string, kids: string[], wht: boolean) => grp.recordGroupPayment(T, A, groupId, { paidAt: today, financeAccountId: bank.id, tieOffSatang: kids.length * 1_070_000, note: "", feeSatang: 0, wht: wht ? kids.map((k) => ({ childDocId: k, incomeType: "M40_2", rateBp: 300, amountSatang: 30_000 })) : [], cheque: chq() }, { clientKey: key() });
    return { T, A, ctx, cust, vend, bank, inv, mkGroup, expense, single, batch };
  };
  type W = Awaited<ReturnType<typeof world>>;

  /** user-visible verdict of one operation (what the cashier sees) */
  type Op = { who: string; kind: string; ok: boolean; seen: string; t0: number; ms: number };
  const runOp = async (who: string, kind: string, fn: () => Promise<Any>, judge: (r: Any) => Promise<string | null>): Promise<Op> => {
    const t0 = Date.now(); let r: Any;
    try { r = await fn(); } catch (e) { r = { ok: false, reason: `THROW ${(e as Error)?.message ?? e}` }; }
    const ms = Date.now() - t0;
    if (!r?.ok) return { who, kind, ok: false, seen: cut(String(r?.reason ?? j(r)).replace(/\s+/g, " "), 120), t0, ms };
    const bad = await judge(r);
    return { who, kind, ok: !bad, seen: bad ?? "ok", t0, ms };
  };
  const tally = (ops: Op[]) => { const m: Record<string, string> = {}; for (const k of [...new Set(ops.map((o) => o.kind))]) { const xs = ops.filter((o) => o.kind === k); m[k] = `${xs.filter((o) => o.ok).length}/${xs.length}`; } return m; };
  const seenFails = (ops: Op[]) => { const m: Record<string, number> = {}; for (const o of ops.filter((x) => !x.ok)) { const k = `${o.kind}: ${o.seen.replace(/(IV|RV|SV|TX|RE|WTI|WHT|PX|EX)-[\d-]+/g, "#")}`; m[k] = (m[k] ?? 0) + 1; } return m; };

  const judgeSingle = (w: W, docId: string, wht: boolean) => async (r: Any) => {
    if (r.status !== "PAID") return `status ${r.status} (expected PAID)`;
    if (wht) {
      if (!Array.isArray(r.certNos) || r.certNos.length !== 1 || !r.certNos[0]) return `certNos ${j(r.certNos)} (expected the WTI number)`;
      const cert = await P.accountDocument.findFirst({ where: { systemId: w.A, docType: "WHT_CERT", sourceDocId: docId }, select: { docNo: true } });
      if (cert?.docNo !== r.certNos[0]) return `WTI shown ${r.certNos[0]} ≠ stored ${cert?.docNo ?? null}`;
    }
    return null;
  };
  const judgeBatch = (w: W, kids: string[]) => async (r: Any) => {
    if (r.duplicate) return "duplicate (nothing recorded)";
    if (r.recorded !== kids.length) return `recorded ${r.recorded} of ${kids.length}`;
    const paid = await P.accountDocument.count({ where: { id: { in: kids }, status: "PAID" } });
    return paid === kids.length ? null : `${paid}/${kids.length} children PAID`;
  };

  let A: W | null = null;
  const snapshot = { jv: new Map<string, string>(), docs: new Map<string, string>() };

  // ═════════════════════ N4 pre-phase (sequential) — rows that exist before any concurrent phase ═════════════════════
  console.log("\n── setup + N4 pre-phase ──");
  A = await world("a");
  {
    const w = A;
    const g1 = await w.inv("ON_ISSUE"); await w.single(g1, false);
    const g2 = await w.inv("ON_ISSUE"); await w.single(g2, false);
    const s1 = await w.inv("ON_PAYMENT"); await w.single(s1, true); // auto TI + WTI
    const e1 = await w.expense("CLAIM", true); await exp.recordVendorPayment(w.T, w.A, e1, { channel: "TRANSFER", financeAccountId: w.bank.id, amount: 1_040_000, whtAmountSatang: 30_000, whtRateBp: 300, whtIncomeType: "M40_2" }); // 50 ทวิ
    await w.expense("AWAITING", true); // purchase TI
    const re = (await accSvc.createDocument({ tenantId: w.T, systemId: w.A, docType: "RECEIPT", contactId: w.cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 100_000 }] })).id;
    await pay.approveReceiptWithPayments(w.T, w.A, re, [{ paidAt: today, financeAccountId: w.bank.id, amountSatang: 107_000, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: null }], { keyBase: key() });
    for (const e of await P.accountJournalEntry.findMany({ where: { systemId: w.A }, select: { id: true, docNo: true } })) snapshot.jv.set(e.id, e.docNo);
    for (const d of await P.accountDocument.findMany({ where: { systemId: w.A, docNo: { not: null } }, select: { id: true, docNo: true } })) snapshot.docs.set(d.id, d.docNo);
    console.log(`  pre-phase: ${snapshot.jv.size} journal entries · ${snapshot.docs.size} numbered documents (books ${j([...new Set((await P.accountJournalEntry.findMany({ where: { systemId: w.A }, select: { book: true } })).map((x: Any) => x.book))])})`);
  }

  // ═════════════════════ N1 — 3 cashiers, hunter Q3 mix ═════════════════════
  const round = async (id: string, label: string, timing: "ON_ISSUE" | "ON_PAYMENT", wht: boolean) => {
    const w = A!;
    const singles: string[] = []; for (let i = 0; i < 20; i += 1) singles.push(await w.inv(timing));
    const b5: { g: string; kids: string[] }[] = []; for (let i = 0; i < 6; i += 1) { const kids: string[] = []; for (let k = 0; k < 5; k += 1) kids.push(await w.inv(timing)); b5.push({ g: await w.mkGroup(kids), kids }); }
    const k40: string[] = []; for (let k = 0; k < 40; k += 1) k40.push(await w.inv(timing));
    const big = await w.mkGroup(k40);
    const p0 = await P.accountDocumentPayment.count({ where: { tenantId: w.T, voidedAt: null } });
    rawErrors.length = 0;
    const ops: Op[] = [];
    const t0 = Date.now();
    await Promise.all([
      (async () => { for (const d of singles.slice(0, 8)) ops.push(await runOp("cashier-1", "single", () => w.single(d, wht), judgeSingle(w, d, wht))); })(),
      (async () => { for (const d of singles.slice(8, 15)) ops.push(await runOp("cashier-2", "single", () => w.single(d, wht), judgeSingle(w, d, wht))); })(),
      (async () => { for (const b of b5) ops.push(await runOp("cashier-3", "5-child cheque batch", () => w.batch(b.g, b.kids, wht), judgeBatch(w, b.kids))); })(),
      (async () => { ops.push(await runOp("cashier-4", "40-child cheque batch", () => w.batch(big, k40, wht), judgeBatch(w, k40))); for (const d of singles.slice(15)) ops.push(await runOp("cashier-4", "single", () => w.single(d, wht), judgeSingle(w, d, wht))); })(),
    ]);
    const raw = cls(rawErrors);
    const added = (await P.accountDocumentPayment.count({ where: { tenantId: w.T, voidedAt: null } })) - p0;
    const allOk = ops.every((o) => o.ok);
    chk(id, `${label}: 3 cashiers + a batch cashier in one month (hunter Q3 mix) — every operation succeeds and shows the right result; no duplicate-number, deadlock or timeout error underneath`,
      allOk && ops.length === 27 && badRaw(raw) === 0 && added === 90,
      "27/27 operations ok (20 singles PAID" + (wht ? " each with its WTI number" : "") + " · 6 five-child batches recorded 5 · the 40-child batch recorded 40) · raw P2002/40P01/timeout = 0 · +90 payments",
      `${((Date.now() - t0) / 1000).toFixed(0)} s · ok ${j(tally(ops))} · user-visible failures ${j(seenFails(ops))} · raw ${j(raw)} · payments +${added}`, "MAJOR");
  };
  if (want("N1")) {
    console.log("\n── N1 ──");
    await sub("C5.4-N-N1a", () => round("C5.4-N-N1a", "goods shop (ON_ISSUE invoices, transfer singles, cheque batches)", "ON_ISSUE", false));
    await sub("C5.4-N-N1b", () => round("C5.4-N-N1b", "service shop (ON_PAYMENT invoices ⇒ an auto tax invoice per payment · 3 % WHT ⇒ a WTI cert per payment)", "ON_PAYMENT", true));
  }

  // ═════════════════════ N3 — legal documents, 3 concurrent actors ×20 per kind ═════════════════════
  if (want("N3")) {
    console.log("\n── N3 ──");
    await sub("C5.4-N-N3-ops", async () => {
      const w = A!;
      const three = async (kind: string, items: string[], fn: (x: string) => Promise<Any>, judge: (x: string, r: Any) => Promise<string | null>) => {
        const ops: Op[] = [];
        await Promise.all([0, 1, 2].map(async (a) => { for (const x of items.slice(a * 20, a * 20 + 20)) ops.push(await runOp(`actor-${a + 1}`, kind, () => fn(x), (r) => judge(x, r))); }));
        return ops;
      };
      const all: Op[] = [];
      rawErrors.length = 0;
      // tax invoices (standalone)
      { const ids: string[] = []; for (let i = 0; i < 60; i += 1) ids.push((await accSvc.createDocument({ tenantId: w.T, systemId: w.A, docType: "TAX_INVOICE", contactId: w.cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขาย", qty: 1, unitPrice: 100_000 }] })).id);
        all.push(...await three("tax invoice", ids, (id) => accSvc.issueDocument(w.T, w.A, id), async (id) => ((await P.accountDocument.findUnique({ where: { id }, select: { docNo: true } }))?.docNo ? null : "issued without a number"))); }
      // receipts (cash sale: approve = attach the payment + issue)
      { const ids: string[] = []; for (let i = 0; i < 60; i += 1) ids.push((await accSvc.createDocument({ tenantId: w.T, systemId: w.A, docType: "RECEIPT", contactId: w.cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 100_000 }] })).id);
        all.push(...await three("receipt", ids, (id) => pay.approveReceiptWithPayments(w.T, w.A, id, [{ paidAt: today, financeAccountId: w.bank.id, amountSatang: 107_000, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: null }], { keyBase: key() }), async (id, r) => { const d = await P.accountDocument.findUnique({ where: { id }, select: { docNo: true } }); return d?.docNo && d.docNo === r.docNo ? null : `receipt number shown ${r.docNo} stored ${d?.docNo ?? null}`; })); }
      // WTI certificates (customer withholds) on goods invoices
      { const ids: string[] = []; for (let i = 0; i < 60; i += 1) ids.push(await w.inv("ON_ISSUE"));
        all.push(...await three("WTI cert", ids, (id) => w.single(id, true), (id, r) => judgeSingle(w, id, true)(r))); }
      // 50 ทวิ (we withhold the vendor)
      { const ids: string[] = []; for (let i = 0; i < 60; i += 1) ids.push(await w.expense("CLAIM", true));
        all.push(...await three("50 ทวิ", ids, (id) => exp.recordVendorPayment(w.T, w.A, id, { channel: "TRANSFER", financeAccountId: w.bank.id, amount: 1_040_000, whtAmountSatang: 30_000, whtRateBp: 300, whtIncomeType: "M40_2" }), async (id) => ((await P.accountDocument.findFirst({ where: { systemId: w.A, docType: "WHT_CERT", sourceDocId: id }, select: { docNo: true } }))?.docNo ? null : "no numbered 50 ทวิ"))); }
      // purchase tax invoices (AWAITING-VAT expense issued ⇒ purchase TI register row)
      { const ids: string[] = []; for (let i = 0; i < 60; i += 1) ids.push(await w.expense("AWAITING", false));
        all.push(...await three("purchase TI", ids, (id) => exp.issueExpenseDoc(w.T, w.A, id), async (id) => ((await P.accountDocument.findFirst({ where: { systemId: w.A, docType: "PURCHASE_TAX_INVOICE", sourceDocId: id }, select: { docNo: true } }))?.docNo ? null : "no numbered purchase TI"))); }
      const raw = cls(rawErrors);
      chk("C5.4-N-N3-ops", "legal documents issued by 3 concurrent actors ×20 per kind (tax invoice · receipt · WTI cert · 50 ทวิ · purchase tax invoice) — every operation succeeds and the document carries its number",
        all.length === 300 && all.every((o) => o.ok) && badRaw(raw) === 0, "300/300 ok · raw P2002/40P01/timeout = 0",
        `ok ${j(tally(all))} · user-visible failures ${j(seenFails(all))} · raw ${j(raw)}`);
    });
  }

  // ═════════════════════ N7 — a failing transaction consumes no legal number ═════════════════════
  if (want("N7")) {
    console.log("\n── N7 ──");
    await sub("C5.4-N-N7", async () => {
      const w = A!;
      const settings = await accSvc.getSettings(w.T, w.A);
      const maxOf = async (docType: string, re: RegExp) => Math.max(0, ...(await P.accountDocument.findMany({ where: { systemId: w.A, docType, docNo: { not: null } }, select: { docNo: true } })).map((d: Any) => d.docNo as string).filter((n: string) => re.test(n)).map(tailNo));
      const jvMax = async (book: string) => Math.max(0, ...(await P.accountJournalEntry.findMany({ where: { systemId: w.A, book }, select: { docNo: true } })).map((e: Any) => tailNo(e.docNo)));
      const before = { ti: await maxOf("TAX_INVOICE", /./), wti: await maxOf("WHT_CERT", /^WTI/), wht: await maxOf("WHT_CERT", /^(?!WTI)/), rv: await jvMax("RECEIPTS") };
      const sFail = await w.inv("ON_PAYMENT"); const sOk = await w.inv("ON_PAYMENT");
      const eFail = await w.expense("CLAIM", true); const eOk = await w.expense("CLAIM", true);
      const induced: string[] = [];
      await P.$transaction(async (tx: Any) => { await accSvc.recordPaymentInTx(tx, w.T, w.A, sFail, { channel: "TRANSFER", financeAccountId: w.bank.id, amount: 1_040_000, whtAmountSatang: 30_000, whtRateBp: 300, whtIncomeType: "M40_2" }, settings); throw new Error("QC-INDUCED failure after the payment, its tax invoice and its WTI were written"); }, { maxWait: 20_000, timeout: 60_000 }).catch((e: Any) => induced.push(cut(e?.message, 90)));
      await P.$transaction(async (tx: Any) => { await exp.recordVendorPaymentInTx(tx, w.T, w.A, eFail, { channel: "TRANSFER", financeAccountId: w.bank.id, amount: 1_040_000, whtAmountSatang: 30_000, whtRateBp: 300, whtIncomeType: "M40_2" }); throw new Error("QC-INDUCED failure after the vendor payment and its 50 ทวิ were written"); }, { maxWait: 20_000, timeout: 60_000 }).catch((e: Any) => induced.push(cut(e?.message, 90)));
      const left = await P.accountDocumentPayment.count({ where: { documentId: { in: [sFail, eFail] } } });
      const r1 = await accSvc.recordPayment(w.T, w.A, sOk, { channel: "TRANSFER", financeAccountId: w.bank.id, amount: 1_040_000, whtAmountSatang: 30_000, whtRateBp: 300, whtIncomeType: "M40_2" });
      const r2 = await exp.recordVendorPayment(w.T, w.A, eOk, { channel: "TRANSFER", financeAccountId: w.bank.id, amount: 1_040_000, whtAmountSatang: 30_000, whtRateBp: 300, whtIncomeType: "M40_2" });
      const ti = await P.accountDocument.findFirst({ where: { systemId: w.A, docType: "TAX_INVOICE", sourceDocId: sOk }, select: { docNo: true } });
      const wti = await P.accountDocument.findFirst({ where: { systemId: w.A, docType: "WHT_CERT", sourceDocId: sOk }, select: { docNo: true } });
      const wht = await P.accountDocument.findFirst({ where: { systemId: w.A, docType: "WHT_CERT", sourceDocId: eOk }, select: { docNo: true } });
      const rvNew = (await P.accountJournalEntry.findMany({ where: { systemId: w.A, book: "RECEIPTS", refType: "AccountDocumentPayment", refId: r1.ok ? r1.paymentId : "-" }, select: { docNo: true } })).map((e: Any) => tailNo(e.docNo));
      const jvGap = rvNew.length ? Math.min(...rvNew) - before.rv - 1 : NaN;
      chk("C5.4-N-N7", "a transaction that fails after its payment, tax invoice, WTI and 50 ทวิ were written leaves nothing and consumes no legal number — the next real payment gets previous + 1 for each (journal numbers MAY be consumed: P20)",
        induced.length === 2 && left === 0 && r1.ok && r2.ok && tailNo(ti?.docNo) === before.ti + 1 && tailNo(wti?.docNo) === before.wti + 1 && tailNo(wht?.docNo) === before.wht + 1,
        `both induced transactions rolled back (no payment rows) · next TI = ${before.ti + 1} · next WTI = ${before.wti + 1} · next 50 ทวิ = ${before.wht + 1}`,
        `induced ${j(induced)} · leftover payments ${left} · real payments ${r1.ok ? "ok" : `FAIL(${r1.reason})`} / ${r2.ok ? "ok" : `FAIL(${r2.reason})`} · TI ${ti?.docNo ?? null} · WTI ${wti?.docNo ?? null} · 50 ทวิ ${wht?.docNo ?? null} · (info, allowed) journal numbers skipped in RV by the failed transaction: ${jvGap}`);
    });
  }

  // ═════════════════════ N6 — wait of a concurrent single during a 40-child service batch ═════════════════════
  if (want("N6")) {
    console.log("\n── N6 ──");
    await sub("C5.4-N-N6", async () => {
      const w = A!;
      const k40: string[] = []; for (let k = 0; k < 40; k += 1) k40.push(await w.inv("ON_PAYMENT"));
      const big = await w.mkGroup(k40);
      const goods: string[] = []; for (let i = 0; i < 24; i += 1) goods.push(await w.inv("ON_ISSUE"));
      const svc: string[] = []; for (let i = 0; i < 24; i += 1) svc.push(await w.inv("ON_PAYMENT"));
      // baseline: the same single alone (3 each, sequential)
      const base = { goods: [] as number[], svc: [] as number[] };
      for (let i = 0; i < 3; i += 1) { const a = await runOp("base", "goods", () => w.single(goods.shift()!, false), async () => null); base.goods.push(a.ms); const b = await runOp("base", "svc", () => w.single(svc.shift()!, true), async () => null); base.svc.push(b.ms); }
      const bGoods = median(base.goods); const bSvc = median(base.svc);
      rawErrors.length = 0;
      const ops: Op[] = []; let batchOp: Op | null = null; let running = true; let rowWait = -1;
      const tB = Date.now();
      await Promise.all([
        (async () => { batchOp = await runOp("batch", "40-child service batch", () => w.batch(big, k40, true), judgeBatch(w, k40)); running = false; })(),
        (async () => { await sleep(1_500); while (running && goods.length) { const d = goods.shift()!; ops.push(await runOp("cashier-goods", "goods single", () => w.single(d, false), judgeSingle(w, d, false))); } })(),
        (async () => { await sleep(1_700); while (running && svc.length) { const d = svc.shift()!; ops.push(await runOp("cashier-svc", "service+WHT single", () => w.single(d, true), judgeSingle(w, d, true))); } })(),
        (async () => { await sleep(3_000); if (!running) return; const s0 = Date.now(); await P.$transaction(async (tx: Any) => tx.$queryRawUnsafe(`SELECT "lastNo" FROM "AccountDocSequence" WHERE "systemId" = $1 AND "docType" = 'TAX_INVOICE' FOR UPDATE`, w.A), { maxWait: 20_000, timeout: 60_000 }).catch(() => undefined); rowWait = Date.now() - s0; })(),
      ]);
      const batchMs = Date.now() - tB;
      const during = ops.filter((o) => o.t0 < tB + batchMs);
      const waitOf = (o: Op) => o.ms - (o.kind === "goods single" ? bGoods : bSvc);
      const maxWait = { goods: Math.max(-1, ...during.filter((o) => o.kind === "goods single").map(waitOf)), svc: Math.max(-1, ...during.filter((o) => o.kind === "service+WHT single").map(waitOf)) };
      const raw = cls(rawErrors);
      const bo = batchOp as Op | null;
      chk("C5.4-N-N6", "nothing holds a book-wide lock for longer than one allocation: while a 40-child service batch (40 auto tax invoices + 40 WTI certs, one transaction) runs, a goods single and a service+WHT single each wait < 2 s more than the same payment alone, and every operation succeeds",
        !!bo?.ok && during.length >= 2 && during.some((o) => o.kind === "goods single") && during.some((o) => o.kind === "service+WHT single") && during.every((o) => o.ok) && maxWait.goods < 2_000 && maxWait.svc < 2_000 && badRaw(raw) === 0,
        "batch ok · ≥1 single of each kind started during the batch · all ok · max(latency − alone) < 2000 ms for both kinds · raw P2002/40P01/timeout = 0",
        `batch ${bo ? `${bo.ok ? "ok" : `FAIL(${bo.seen})`} in ${(batchMs / 1000).toFixed(1)} s` : "?"} · alone p50 goods ${bGoods} ms / service ${bSvc} ms · during the batch: ${j(tally(during))} · max extra wait goods ${maxWait.goods} ms / service ${maxWait.svc} ms · failures ${j(seenFails(during))} · raw ${j(raw)} · (info) a bare FOR UPDATE on the tax-invoice counter row at +3 s waited ${rowWait} ms`);
    });
  }

  // ═════════════════════ N5 — readers show the stored number in the documented format ═════════════════════
  if (want("N5")) {
    console.log("\n── N5 ──");
    await sub(["C5.4-N-N5", "C5.4-N-N5-preview"], async () => {
      const w = A!;
      const d = await w.inv("ON_ISSUE");
      const r = await accSvc.recordPayment(w.T, w.A, d, { channel: "TRANSFER", financeAccountId: w.bank.id, amount: 600_000 });
      if (!r.ok) throw new Error(`setup payment: ${r.reason}`);
      const v = await accSvc.voidPayment(w.T, w.A, d, r.paymentId, "QC N5 reversal");
      if (!v.ok) throw new Error(`setup void: ${v.reason}`);
      const payE = await P.accountJournalEntry.findFirst({ where: { systemId: w.A, refType: "AccountDocumentPayment", refId: r.paymentId, reversalOfId: null }, select: { id: true, docNo: true } });
      const revE = await P.accountJournalEntry.findFirst({ where: { systemId: w.A, reversalOfId: payE?.id ?? "-" }, select: { id: true, docNo: true } });
      // manual JV + the modal preview (journal/page.tsx computes the preview with whatever function it calls on "GENERAL")
      const page = readFileSync("src/app/app/sys/[id]/account/journal/page.tsx", "utf8");
      const call = /await\s+([A-Za-z_]\w*)\(\s*ctx\s*,\s*"GENERAL"/.exec(page)?.[1] ?? "";
      const from = call ? new RegExp(`import\\s*\\{[^}]*\\b${call}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`).exec(page)?.[1] ?? "" : "";
      const modPath = from.startsWith("@/") ? from : "";
      const previewFn = modPath ? ((await import(modPath as string)) as Any)[call] : undefined;
      const cash = await gl.resolveMapping(w.ctx, "CASH");
      const bankLedger = (await P.accountFinance.findUnique({ where: { id: w.bank.id }, select: { ledgerAccountId: true } }))?.ledgerAccountId as string;
      const previews: string[] = [];
      if (typeof previewFn === "function") for (let i = 0; i < 3; i += 1) previews.push(String(await previewFn(w.ctx, "GENERAL", new Date())));
      const man = await jv.createManualEntry(w.ctx, { dateKey: today, book: "GENERAL", memo: `QC N5 ${TAG}`, lines: [{ accountId: cash, debit: 12_300, credit: 0 }, { accountId: bankLedger, debit: 0, credit: 12_300 }] });
      chk("C5.4-N-N5-preview", "the manual-JV modal preview (the function journal/page.tsx calls) consumes no number: three previews then a post → the post gets the previewed number",
        typeof previewFn === "function" && man.ok && previews.length === 3 && new Set(previews).size === 1 && previews[0] === man.docNo,
        "preview function found via the page's import · 3 identical previews · posted docNo = preview",
        `page calls ${call || "?"} from ${from || "?"} · previews ${j(previews)} · posted ${man.ok ? man.docNo : `FAIL(${man.reason})`}`, "MINOR");
      const targets = [["payment JV", payE], ["reversal JV", revE], ["manual JV", man.ok ? { id: man.entryId, docNo: man.docNo } : null]] as [string, { id: string; docNo: string } | null][];
      const bad: string[] = [];
      for (const [name, e] of targets) {
        if (!e) { bad.push(`${name}: missing`); continue; }
        if (!JV_FORMAT.test(e.docNo)) bad.push(`${name}: stored ${e.docNo} not in format`);
        const list = await jv.listJournalPaged(w.ctx, { q: e.docNo });
        if (list.total !== 1 || list.rows[0]?.docNo !== e.docNo) bad.push(`${name}: search "${e.docNo}" → total ${list.total} first ${list.rows[0]?.docNo}`);
        const row = list.rows.find((x: Any) => x.id === e.id);
        if (row && serGl.journalRow(row).journalNo !== e.docNo) bad.push(`${name}: REST journalRow.journalNo ${serGl.journalRow(row).journalNo}`);
      }
      const det = payE ? await jv.journalEntryDetail(w.ctx, payE.id) : null;
      const dv = det ? serGl.journalDetail(det) : null;
      if (!dv || dv.journalNo !== payE?.docNo || dv.reversal?.journalNo !== revE?.docNo) bad.push(`REST journalDetail ${j({ no: dv?.journalNo, rev: dv?.reversal?.journalNo })} vs ${payE?.docNo}/${revE?.docNo}`);
      const gled = await jv.generalLedger(w.ctx, { accountId: bankLedger, from: new Date(Date.now() - 3 * 86_400_000), to: new Date(Date.now() + 3 * 86_400_000) });
      const gNos = new Set((gled.rows ?? []).map((x: Any) => x.docNo));
      for (const e of [payE, revE]) if (e && !gNos.has(e.docNo)) bad.push(`general ledger lacks ${e.docNo}`);
      const st = await fin.financeStatement(w.T, w.A, w.bank.id);
      const sNos = new Set((st?.rows ?? []).map((x: Any) => x.docNo));
      for (const e of [payE, revE]) if (e && !sNos.has(e.docNo)) bad.push(`finance statement lacks ${e.docNo}`);
      const docTab = await gl.listJournalEntriesForDocument(w.A, d, [r.paymentId]);
      const tNos = new Set(docTab.map((x: Any) => x.docNo));
      for (const e of [payE, revE]) if (e && !tNos.has(e.docNo)) bad.push(`document JV tab lacks ${e.docNo}`);
      const shown = [...gNos, ...sNos, ...tNos].filter((n) => !JV_FORMAT.test(String(n)));
      if (shown.length) bad.push(`readers show numbers outside the format: ${j(shown.slice(0, 5))}`);
      chk("C5.4-N-N5", "readers show the stored journal number in the documented format — journal list search finds exactly that entry · REST journalRow / journalDetail (+ reversal) · general ledger · finance statement · document JV tab",
        bad.length === 0, `format ${JV_FORMAT} · every reader returns the stored docNo`, bad.length ? bad.join(" · ") : `payment ${payE?.docNo} · reversal ${revE?.docNo} · manual ${man.ok ? man.docNo : "-"}`);
    });
  }

  // ═════════════════════ N4b — a book whose existing numbers run above its row count ═════════════════════
  if (want("N4")) {
    console.log("\n── N4b ──");
    await sub("C5.4-N-N4b", async () => {
      const ym = today.slice(0, 7); const [yy, mm] = ym.split("-");
      const prev = new Date(Date.UTC(Number(yy), Number(mm) - 2, 15, 5)); const pk = prev.toISOString().slice(0, 7);
      const legacy: { book: string; docNo: string; periodKey: string; date: Date }[] = [
        { book: "RECEIPTS", docNo: `RV-${yy}-${mm}-0002`, periodKey: ym, date: new Date() },
        { book: "SALES", docNo: `SV-${yy}-${mm}-0003`, periodKey: ym, date: new Date() },
        { book: "SALES", docNo: `SV-${pk.slice(0, 4)}-${pk.slice(5, 7)}-0041`, periodKey: pk, date: prev },
        { book: "GENERAL", docNo: `JV-${yy}-${mm}-0001`, periodKey: ym, date: new Date() },
      ];
      const B = await world("b", async (T, Aid) => {
        for (const l of legacy) await P.accountJournalEntry.create({ data: { tenantId: T, systemId: Aid, docNo: l.docNo, book: l.book, journal: "ADJUST", date: l.date, periodKey: l.periodKey, source: "MANUAL", memo: `QC legacy row ${TAG}` } });
      });
      const legacyRows = await P.accountJournalEntry.findMany({ where: { systemId: B.A, memo: `QC legacy row ${TAG}` }, select: { id: true, docNo: true } });
      rawErrors.length = 0;
      const res: string[] = [];
      for (let i = 0; i < 4; i += 1) { const d = await accSvc.createDocument({ tenantId: B.T, systemId: B.A, docType: "INVOICE", contactId: B.cust.id, vatMode: "EXCLUDE", lines: [{ description: "สินค้า", qty: 1, unitPrice: 100_000 }] }); const r1 = await accSvc.issueDocument(B.T, B.A, d.id); const r2 = r1.ok ? await accSvc.recordPayment(B.T, B.A, d.id, { channel: "TRANSFER", financeAccountId: B.bank.id, amount: 107_000 }) : { ok: false, reason: "not issued" }; res.push(`${r1.ok ? "ok" : "FAIL"}/${r2.ok ? "ok" : "FAIL"}`); }
      const cash = await gl.resolveMapping(B.ctx, "CASH"); const bankLedger = (await P.accountFinance.findUnique({ where: { id: B.bank.id }, select: { ledgerAccountId: true } }))?.ledgerAccountId as string;
      const m = await jv.createManualEntry(B.ctx, { dateKey: today, book: "GENERAL", memo: "QC N4b", lines: [{ accountId: cash, debit: 1_000, credit: 0 }, { accountId: bankLedger, debit: 0, credit: 1_000 }] });
      res.push(`manual ${m.ok ? "ok" : `FAIL(${cut(m.reason, 60)})`}`);
      const all = await P.accountJournalEntry.findMany({ where: { systemId: B.A }, select: { id: true, docNo: true } });
      const after = new Map(all.map((e: Any) => [e.id, e.docNo]));
      const legacyKept = legacyRows.every((l: Any) => after.get(l.id) === l.docNo);
      const dup = all.length - new Set(all.map((e: Any) => e.docNo)).size;
      const raw = cls(rawErrors);
      chk("C5.4-N-N4b", "a book whose existing rows already use numbers above its row count (rows from before the new numbering, imported or partly deleted) — new postings succeed and never reuse an existing number; the old rows keep theirs",
        res.slice(0, 4).every((x) => x === "ok/ok") && m.ok && legacyKept && dup === 0 && badRaw(raw) === 0,
        "4 × (issue invoice ok / payment ok) + manual JV ok · legacy rows unchanged · no duplicate number · raw P2002 = 0",
        `legacy ${j(legacy.map((l) => l.docNo))} · results ${j(res)} · legacy kept ${legacyKept} · dup ${dup} · raw ${j(raw)} · new numbers ${j(all.filter((e: Any) => !legacyRows.some((l: Any) => l.id === e.id)).map((e: Any) => e.docNo).sort())}`);
    });
  }

  // ═════════════════════ final audits over everything that ran ═════════════════════
  console.log("\n── N2 / N3-numbers / N4a ──");
  await sub("C5.4-N-N2", async () => {
    const bad: string[] = []; let gaps = 0; let entries = 0; let inv = 0; let intra = 0;
    for (const T of TENANTS) {
      const rows = await P.accountJournalEntry.findMany({ where: { tenantId: T }, select: { id: true, systemId: true, docNo: true, book: true, periodKey: true, createdAt: true, refType: true, refId: true, memo: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const fresh = rows.filter((r: Any) => r.memo !== `QC legacy row ${TAG}`);
      entries += fresh.length;
      const bySys = new Map<string, Any[]>(); for (const r of rows) bySys.set(r.systemId, [...(bySys.get(r.systemId) ?? []), r]);
      for (const [, list] of bySys) { const d = list.length - new Set(list.map((r: Any) => r.docNo)).size; if (d) bad.push(`${d} duplicate numbers in one system`); }
      for (const r of fresh) {
        const m = JV_FORMAT.exec(r.docNo);
        if (!m) { bad.push(`format ${r.docNo}`); continue; }
        if (m[1] !== BOOK_PREFIX[r.book]) bad.push(`prefix ${r.docNo} for book ${r.book}`);
        if (`${m[2]}-${m[3]}` !== r.periodKey) bad.push(`period ${r.docNo} for period ${r.periodKey}`);
      }
      // monotonic per allocation: never decreasing once two entries of a book are >1 s apart · strictly increasing inside one operation
      const byBook = new Map<string, Any[]>(); for (const r of fresh) byBook.set(`${r.systemId}:${r.book}`, [...(byBook.get(`${r.systemId}:${r.book}`) ?? []), r]);
      for (const [, list] of byBook) {
        let lo = 0; let maxOld = -Infinity;
        for (let i = 0; i < list.length; i += 1) {
          const t = new Date(list[i].createdAt).getTime();
          while (lo < i && new Date(list[lo].createdAt).getTime() < t - 1_000) { maxOld = Math.max(maxOld, tailNo(list[lo].docNo)); lo += 1; }
          if (tailNo(list[i].docNo) <= maxOld) inv += 1;
        }
        const nums = [...list.map((r: Any) => tailNo(r.docNo))].sort((a, b) => a - b);
        for (let i = 1; i < nums.length; i += 1) if (nums[i]! - nums[i - 1]! > 1) gaps += nums[i]! - nums[i - 1]! - 1;
        // inside one operation: entries of the same payment ref in creation order must go up
        const byRef = new Map<string, Any[]>(); for (const r of list) if (r.refId) byRef.set(`${r.refType}:${r.refId}`, [...(byRef.get(`${r.refType}:${r.refId}`) ?? []), r]);
        for (const [, rs] of byRef) for (let i = 1; i < rs.length; i += 1) if (tailNo(rs[i].docNo) <= tailNo(rs[i - 1].docNo) && new Date(rs[i].createdAt).getTime() > new Date(rs[i - 1].createdAt).getTime()) intra += 1;
      }
    }
    if (inv) bad.push(`${inv} entries numbered below an entry of the same book created >1 s earlier`);
    if (intra) bad.push(`${intra} entries of one operation numbered out of creation order`);
    chk("C5.4-N-N2", "journal numbers: unique per system · `<SV|PV|RV|PY|JV>-<yyyy>-<mm>-<n≥4 digits>` with prefix = book and yyyy-mm = the entry's period · monotonic per allocation · gaps allowed (P20, reported)",
      entries > 0 && bad.length === 0, "0 violations", `${entries} entries checked · ${bad.length ? cut(bad.slice(0, 8).join(" · "), 600) : "no violation"} · (info, allowed) numbers skipped: ${gaps}`);
  });
  await sub("C5.4-N-N3-numbers", async () => {
    if (!A) throw new Error("no world");
    const bad: string[] = []; const seen: string[] = [];
    const docs = await P.accountDocument.findMany({ where: { systemId: A.A, docType: { in: [...LEGAL] }, status: { not: "DRAFT" } }, select: { id: true, docType: true, docNo: true, status: true } });
    const none = docs.filter((d: Any) => !d.docNo);
    if (none.length) bad.push(`${none.length} issued legal documents without a number (${j([...new Set(none.map((d: Any) => d.docType))])})`);
    const series = new Map<string, number[]>(); for (const d of docs) if (d.docNo) series.set(`${d.docType}:${seriesOf(d.docNo)}`, [...(series.get(`${d.docType}:${seriesOf(d.docNo)}`) ?? []), tailNo(d.docNo)]);
    for (const [k, list] of series) {
      const s = [...list].sort((a, b) => a - b); const dup = s.filter((x, i) => i > 0 && x === s[i - 1]).length;
      const missing: number[] = []; for (let i = 1, p = 0; i <= s[s.length - 1]! && missing.length < 10; i += 1) { while (p < s.length && s[p]! < i) p += 1; if (s[p] !== i) missing.push(i); }
      seen.push(`${k} 1..${s[s.length - 1]} (${s.length})`);
      if (dup) bad.push(`${k} ${dup} duplicates`); if (missing.length) bad.push(`${k} gaps ${j(missing)}`);
    }
    for (const c of await P.accountDocSequence.findMany({ where: { systemId: A.A, docType: { in: [...LEGAL] } }, select: { docType: true, prefix: true, periodKey: true, lastNo: true } })) {
      const nums = docs.filter((d: Any) => d.docType === c.docType && d.docNo && String(d.docNo).startsWith(`${c.prefix}-`)).map((d: Any) => tailNo(d.docNo));
      const mx = nums.length ? Math.max(...nums) : 0;
      if (mx !== c.lastNo) bad.push(`counter ${c.docType}/${c.prefix}@${c.periodKey} lastNo ${c.lastNo} ≠ highest issued ${mx}`);
    }
    chk("C5.4-N-N3-numbers", "every issued legal document of the run (tax invoice · receipt · WTI · 50 ทวิ · purchase TI — N1/N3/N6/N7 included) has a number, unique and gapless per series from 1, and each counter equals the highest number issued (no burned number)",
      docs.length > 0 && bad.length === 0, "0 violations", `${docs.length} documents · ${bad.length ? cut(bad.join(" · "), 600) : seen.join(" · ")}`);
  });
  await sub("C5.4-N-N4a", async () => {
    if (!A) throw new Error("no world");
    const jvNow = new Map((await P.accountJournalEntry.findMany({ where: { systemId: A.A, id: { in: [...snapshot.jv.keys()] } }, select: { id: true, docNo: true } })).map((e: Any) => [e.id, e.docNo]));
    const dNow = new Map((await P.accountDocument.findMany({ where: { systemId: A.A, id: { in: [...snapshot.docs.keys()] } }, select: { id: true, docNo: true } })).map((e: Any) => [e.id, e.docNo]));
    const changed = [...snapshot.jv].filter(([id, n]) => jvNow.get(id) !== n).map(([id, n]) => `${n}→${jvNow.get(id)}`).concat([...snapshot.docs].filter(([id, n]) => dNow.get(id) !== n).map(([id, n]) => `${n}→${dNow.get(id)}`));
    chk("C5.4-N-N4a", "rows created before the concurrent phases keep their numbers (journal entries + documents · nothing renumbered)",
      snapshot.jv.size > 0 && changed.length === 0, "0 changed", `${snapshot.jv.size} entries + ${snapshot.docs.size} documents · changed ${j(changed.slice(0, 6))}`);
  });
  NOW_MS = Date.now();
} catch (e) {
  chk("C5.4-N-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600), "CRITICAL");
} finally {
  globalThis.fetch = REAL_FETCH;
  void NOW_MS;
  await new Promise((r) => setTimeout(r, 1_000));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  let tables: string[] = [];
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
  }
  try {
    const left: string[] = [];
    if (ids.length) { const inList = ids.map((x) => `'${x}'`).join(","); for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); } }
    const tenants = ids.length ? await P.tenant.count({ where: { id: { in: ids } } }) : 0;
    // a sequence-based design creates database objects per SYSTEM (named after the system id) — drop this run's, then prove none is left
    const sysIds = SYSTEMS.filter((x) => /^[a-z0-9]+$/i.test(x));
    const findSeqs = async () => (sysIds.length ? ((await P.$queryRawUnsafe(`SELECT relname FROM pg_class WHERE relkind = 'S' AND (${sysIds.map((_, i) => `relname ILIKE '%' || $${i + 1} || '%'`).join(" OR ")})`, ...sysIds).catch(() => [])) as Any[]).map((r) => String(r.relname)) : []);
    for (const n of await findSeqs()) if (/^[a-z0-9_]+$/i.test(n)) await del(() => P.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "${n}"`));
    const seqs = (await findSeqs()).length;
    chk("C5.4-N-N8", "CLEAN — the throwaway tenants (every tenant-scoped row) are gone and no per-run database object is left behind",
      left.length === 0 && tenants === 0 && seqs === 0, "0 rows · 0 tenants · 0 sequences named after this run's system ids", `${left.join(" · ") || "-"} tenants=${tenants} · sequences left ${seqs}`, "MAJOR");
  } catch (e) { chk("C5.4-N-N8", "CLEAN", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR"); }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C5.4-N: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
