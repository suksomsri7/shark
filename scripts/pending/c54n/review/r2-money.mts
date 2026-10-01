// C5.4-N REVIEW probe R2 (reviewer · not an oracle the builder must pass) — QC2 only, own tenants, cleans to 0 rows + drops its sequences
//   A  N7-literal: a transaction that fails AFTER finalizeDocNos stamped TI / WTI / 50 ทวิ numbers burns none (also first-of-period)
//   B  N-1 + Bangkok month: existing shop with already-issued certs continues (no backwards, no collision); a new month where a WTI
//      is issued first starts the 50 ทวิ series at 1; paidAt 00:30 ICT on the 1st numbers WTI / 50 ทวิ / register / JV in the NEW month
//   C  JV sequence hazards: (C1) a count+1 number written by OLD code after the sequence exists ⇒ the next new-code posting fails
//      (no self-heal) · (C2) rollback to OLD code after a gap ⇒ count+1 lands on an existing number every time (book stuck) ·
//      (C3) dropped sequence self-heals from the table max
//   D  brand-new system: 6 concurrent first allocations (creator rolls back) — all succeed, distinct (account_jno_ensure catch path)
//   E  locks held per sequence created in one transaction (bounds the migration DO block: max_locks_per_transaction)
// Run: env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54n/review/r2-money.mts [--only=A,B]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";

const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean).map((s) => s.toUpperCase());
const want = (s: string) => ONLY.length === 0 || ONLY.includes(s);
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("review: network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const cut = (v: unknown, n = 260) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tailNo = (s: string | null | undefined) => { const m = /(\d+)\s*$/.exec(s ?? ""); return m ? Number(m[1]) : NaN; };
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, name: string, ok: unknown, detail: string) => { res.push({ id, ok: !!ok }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}\n        — ${detail}`); };
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-c54nrv-${rand}`;
const TENANTS: string[] = []; const SYSTEMS: string[] = []; const FAKES: string[] = [];

try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const acc = (await import("@/lib/modules/account/service" as string)) as Any;
  const exp = (await import("@/lib/modules/account/expense" as string)) as Any;
  const wht = (await import("@/lib/modules/account/wht" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const dn = (await import("@/lib/modules/account/doc-numbering" as string)) as Any;

  const world = async (label: string) => {
    const T = (await P.tenant.create({ data: { name: `${TAG}-${label}`, slug: `${TAG}-${label}` } })).id as string; TENANTS.push(T);
    const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG} ${label}`)).id as string; SYSTEMS.push(A);
    await acc.saveSettings(T, A, { orgName: `QC review ${label}`, taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
    await gl.ensureAccounting({ tenantId: T, systemId: A });
    const cust = await acc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
    const vend = await acc.createContact({ tenantId: T, systemId: A, kind: "VENDOR", legalType: "COMPANY", name: `ผู้ขาย ${TAG}`, taxId: "0105562222222" });
    const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
    const inv = async (timing: "ON_ISSUE" | "ON_PAYMENT", issueDate?: Date) => {
      const d = await acc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: timing, ...(issueDate ? { issueDate } : {}), lines: [{ description: "งาน", qty: 1, unitPrice: 1_000_000 }] });
      const r = await acc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(`setup issue invoice: ${r.reason}`); return d.id as string;
    };
    const expense = async (issueDate?: Date) => {
      const d = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", ...(issueDate ? { issueDate } : {}), lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 1_000_000 }] });
      const r = await exp.issueExpenseDoc(T, A, d.id); if (!r.ok) throw new Error(`setup issue expense: ${r.reason}`); return d.id as string;
    };
    const cpay = (paidAt?: Date, withType = true) => ({ channel: "TRANSFER", financeAccountId: bank.id, amount: 1_040_000, whtAmountSatang: 30_000, whtRateBp: 300, whtIncomeType: withType ? "M40_2" : null, ...(paidAt ? { paidAt } : {}) });
    return { T, A, ctx: { tenantId: T, systemId: A }, cust, vend, bank, inv, expense, cpay };
  };
  const docOf = async (A: string, docType: string, sourceDocId: string) => (await P.accountDocument.findFirst({ where: { systemId: A, docType, sourceDocId }, select: { docNo: true, issueDate: true } }))?.docNo ?? null;

  // ═════════ A — N7 literal ═════════
  if (want("A")) {
    console.log("\n── A · failure after finalizeDocNos burns no legal number ──");
    for (const variant of ["warm", "first-of-period"] as const) {
      const w = await world(`a-${variant}`);
      const settings = await acc.getSettings(w.T, w.A);
      let prevTi = 0, prevWti = 0, prevWht = 0;
      if (variant === "warm") {
        const s0 = await w.inv("ON_PAYMENT"); const r0 = await acc.recordPayment(w.T, w.A, s0, w.cpay()); if (!r0.ok) throw new Error(`warm pay: ${r0.reason}`);
        const e0 = await w.expense(); const v0 = await exp.recordVendorPayment(w.T, w.A, e0, w.cpay()); if (!v0.ok) throw new Error(`warm vpay: ${v0.reason}`);
        prevTi = tailNo(await docOf(w.A, "TAX_INVOICE", s0)); prevWti = tailNo(await docOf(w.A, "WHT_CERT", s0)); prevWht = tailNo(await docOf(w.A, "WHT_CERT", e0));
      }
      const sF = await w.inv("ON_PAYMENT"); const sOk = await w.inv("ON_PAYMENT"); const eF = await w.expense(); const eOk = await w.expense();
      const inFailed: Record<string, string> = {}; const errs: string[] = [];
      await P.$transaction(async (tx: Any) => {
        dn.openDocNumbering(tx);
        const r = await acc.recordPaymentInTx(tx, w.T, w.A, sF, w.cpay(), settings);
        const nos: Map<string, string> = await dn.finalizeDocNos(tx);
        const ti = await tx.accountDocument.findFirst({ where: { systemId: w.A, docType: "TAX_INVOICE", sourceDocId: sF }, select: { docNo: true } });
        inFailed.ti = ti?.docNo ?? "-"; inFailed.wti = r.whtCertDocId ? nos.get(r.whtCertDocId) ?? "-" : "-";
        throw new Error("QC-INDUCED after finalizeDocNos (customer)");
      }, { maxWait: 20_000, timeout: 60_000 }).catch((e: Any) => errs.push(cut(e?.message, 80)));
      await P.$transaction(async (tx: Any) => {
        dn.openDocNumbering(tx);
        await exp.recordVendorPaymentInTx(tx, w.T, w.A, eF, w.cpay());
        const nos: Map<string, string> = await dn.finalizeDocNos(tx);
        inFailed.wht = [...nos.values()][0] ?? "-";
        throw new Error("QC-INDUCED after finalizeDocNos (vendor)");
      }, { maxWait: 20_000, timeout: 60_000 }).catch((e: Any) => errs.push(cut(e?.message, 80)));
      const leftPay = await P.accountDocumentPayment.count({ where: { documentId: { in: [sF, eF] } } });
      const leftDocs = await P.accountDocument.count({ where: { sourceDocId: { in: [sF, eF] } } });
      const r1 = await acc.recordPayment(w.T, w.A, sOk, w.cpay()); const r2 = await exp.recordVendorPayment(w.T, w.A, eOk, w.cpay());
      const real = { ti: await docOf(w.A, "TAX_INVOICE", sOk), wti: await docOf(w.A, "WHT_CERT", sOk), wht: await docOf(w.A, "WHT_CERT", eOk) };
      const ok = errs.length === 2 && errs.every((e) => /QC-INDUCED/.test(e)) && leftPay === 0 && leftDocs === 0 && r1.ok && r2.ok &&
        inFailed.ti === real.ti && inFailed.wti === real.wti && inFailed.wht === real.wht &&
        tailNo(real.ti) === prevTi + 1 && tailNo(real.wti) === prevWti + 1 && tailNo(real.wht) === prevWht + 1 && r1.whtCertNo === real.wti;
      chk(`R2-A-${variant}`, `${variant}: numbers stamped inside a transaction that then fails are handed to the next real payment (nothing burned)`, ok,
        `errors ${j(errs)} · leftover payments ${leftPay} docs ${leftDocs} · stamped-in-failed ${j(inFailed)} · next real ${j(real)} (recordPayment.whtCertNo ${r1.whtCertNo}) · prev TI/WTI/WHT ${prevTi}/${prevWti}/${prevWht}`);
    }
  }

  // ═════════ B — N-1 on an existing shop + Bangkok month boundary ═════════
  if (want("B")) {
    console.log("\n── B · 50 ทวิ / WTI series on an existing shop and at the month boundary ──");
    const w = await world("b");
    // B1 — existing shop, September: already issued WTI-202609-0001..0003 and (N-1 shape) WHT-2026-09-0004..0005, counters 3 / 5
    const sepDate = new Date("2026-09-15T05:00:00.000Z");
    const mk = (docNo: string, direction: "IN" | "OUT") => P.accountDocument.create({ data: { tenantId: w.T, systemId: w.A, docType: "WHT_CERT", status: "ISSUED", direction, docNo, issueDate: sepDate, contactId: direction === "IN" ? w.vend.id : w.cust.id, note: "review legacy" } });
    for (const n of [1, 2, 3]) await mk(`WTI-202609-${String(n).padStart(4, "0")}`, "OUT");
    for (const n of [4, 5]) await mk(`WHT-2026-09-${String(n).padStart(4, "0")}`, "IN");
    await P.accountDocSequence.create({ data: { tenantId: w.T, systemId: w.A, docType: "WHT_CERT", prefix: "WTI", periodKey: "WTI:2026-09", lastNo: 3 } });
    await P.accountDocSequence.create({ data: { tenantId: w.T, systemId: w.A, docType: "WHT_CERT", prefix: "WHT", periodKey: "2026-09", lastNo: 5 } });
    const sepPaid = new Date("2026-09-20T05:00:00.000Z");
    const e1 = await w.expense(sepPaid); const v1 = await exp.recordVendorPayment(w.T, w.A, e1, w.cpay(sepPaid));
    const s1 = await w.inv("ON_ISSUE", sepPaid); const c1 = await acc.recordPayment(w.T, w.A, s1, w.cpay(sepPaid));
    const e1n = await docOf(w.A, "WHT_CERT", e1); const s1n = await docOf(w.A, "WHT_CERT", s1);
    chk("R2-B1", "existing shop (counter rows already exist, N-1-shaped 50 ทวิ 4..5): new numbers continue the existing counters — no backwards, no collision",
      v1.ok && c1.ok && e1n === "WHT-2026-09-0006" && s1n === "WTI-202609-0004",
      `vendor ${v1.ok ? "ok" : v1.reason} → ${e1n} (expected WHT-2026-09-0006) · customer ${c1.ok ? "ok" : c1.reason} → ${s1n} (expected WTI-202609-0004)`);
    // B2 — the 1st of October 00:30 ICT (= 30 Sep 17:30 UTC), no October rows yet: a WTI first, then a 50 ทวิ (expense path) and a register 50 ทวิ
    const boundary = new Date("2026-09-30T17:30:00.000Z");
    const s2 = await w.inv("ON_ISSUE", boundary); const c2 = await acc.recordPayment(w.T, w.A, s2, w.cpay(boundary));
    const e2 = await w.expense(boundary); const v2 = await exp.recordVendorPayment(w.T, w.A, e2, w.cpay(boundary));
    const e3 = await w.expense(boundary); const v3 = await exp.recordVendorPayment(w.T, w.A, e3, w.cpay(boundary, false));
    const reg = v3.ok ? await wht.issueWhtCert(w.T, w.A, { paymentId: v3.paymentId, whtIncomeType: "M40_2", whtRateBp: 300 }) : { ok: false, reason: "no payment" };
    const n2 = { wti: await docOf(w.A, "WHT_CERT", s2), wht: await docOf(w.A, "WHT_CERT", e2), reg: reg.ok ? reg.docNo : `FAIL ${reg.reason}`, regStored: await docOf(w.A, "WHT_CERT", e3) };
    const jvs = (await P.accountJournalEntry.findMany({ where: { systemId: w.A, refType: "AccountDocumentPayment", refId: { in: [c2.paymentId, v2.paymentId].filter(Boolean) } }, select: { docNo: true, periodKey: true } })) as Any[];
    const rows = (await P.accountDocSequence.findMany({ where: { systemId: w.A, docType: "WHT_CERT" }, select: { periodKey: true, lastNo: true }, orderBy: { periodKey: "asc" } })) as Any[];
    chk("R2-B2", "00:30 ICT on 1 Oct, no October rows: WTI-202610-0001, then 50 ทวิ WHT-2026-10-0001 (N-1: not after the WTI) and the register's 50 ทวิ WHT-2026-10-0002 (same series, Bangkok month); journal numbers carry 2026-10",
      c2.ok && v2.ok && n2.wti === "WTI-202610-0001" && n2.wht === "WHT-2026-10-0001" && n2.reg === "WHT-2026-10-0002" && n2.regStored === n2.reg && jvs.length >= 2 && jvs.every((e) => /-2026-10-/.test(e.docNo) && e.periodKey === "2026-10"),
      `${j(n2)} · JV ${j(jvs)} · counters ${j(rows)}`);
  }

  // ═════════ C — JV sequence hazards ═════════
  if (want("C")) {
    console.log("\n── C · journal sequence vs rows written by OLD code / rollback / drop ──");
    const w = await world("c");
    const settings = await acc.getSettings(w.T, w.A);
    const goods: string[] = []; for (let i = 0; i < 8; i += 1) goods.push(await w.inv("ON_ISSUE"));
    const pay = (d: string) => acc.recordPayment(w.T, w.A, d, { channel: "TRANSFER", financeAccountId: w.bank.id, amount: 1_070_000 });
    const rv = async () => (await P.accountJournalEntry.findMany({ where: { systemId: w.A, book: "RECEIPTS" }, select: { docNo: true, periodKey: true, journal: true }, orderBy: { createdAt: "asc" } })) as Any[];
    // OLD code formula (gl.ts nextJournalNo on 63ea9f45): count of (system, book, period) + 1
    const oldNext = async () => { const e = (await rv()).at(-1); const count = await P.accountJournalEntry.count({ where: { systemId: w.A, book: "RECEIPTS", periodKey: e.periodKey } }); return `RV-${e.periodKey}-${String(count + 1).padStart(4, "0")}`; };
    const oldInsert = async () => { // what OLD code does: INSERT with count+1 — always rolled back here
      const no = await oldNext(); let outcome = "";
      const e = (await rv()).at(-1);
      await P.$transaction(async (tx: Any) => {
        await tx.accountJournalEntry.create({ data: { tenantId: w.T, systemId: w.A, docNo: no, book: "RECEIPTS", journal: e.journal, date: new Date(), periodKey: e.periodKey, source: "AUTO", memo: "review old-code simulation" } });
        outcome = "inserted"; throw new Error("QC-ROLLBACK");
      }).catch((x: Any) => { if (!outcome) outcome = `${x?.code ?? ""} ${cut(x?.message, 60)}`; });
      return { no, outcome };
    };
    const p1 = await pay(goods[0]!); const p2 = await pay(goods[1]!);
    // C1: old code (still deployed between "migration applied" and "code deployed", margin 0) writes count+1 for real
    const c1no = await oldNext();
    const e = (await rv()).at(-1);
    await P.accountJournalEntry.create({ data: { tenantId: w.T, systemId: w.A, docNo: c1no, book: "RECEIPTS", journal: e.journal, date: new Date(), periodKey: e.periodKey, source: "AUTO", memo: "review: written by OLD code in the window" } });
    const p3 = await pay(goods[2]!); const p4 = await pay(goods[3]!);
    // ORACLE-EDIT C5.4-N (controller M1): contract flipped from "hazard shown" (p3 fails once) to the M1 merge condition — allocate-until-free
    const rvC1 = (await rv()).map((x) => x.docNo as string);
    chk("R2-C1", "M1: a count+1 number written by OLD code after the sequence was created (margin 0) — the next new-code postings succeed (the allocator skips the taken number), all RV numbers unique",
      p1.ok && p2.ok && p3.ok && p4.ok && new Set(rvC1).size === rvC1.length && rvC1.filter((n) => n === c1no).length === 1,
      `p1 ${p1.ok} p2 ${p2.ok} · old code wrote ${c1no} · p3 ${p3.ok ? "ok" : `FAIL "${cut(p3.reason, 90)}"`} · p4 ${p4.ok ? "ok" : p4.reason} · RV now ${j((await rv()).map((x) => x.docNo))}`);
    // C2: a gap (a money transaction that fails after its posting) then ROLLBACK TO OLD CODE
    await P.$transaction(async (tx: Any) => { await acc.recordPaymentInTx(tx, w.T, w.A, goods[4]!, { channel: "TRANSFER", financeAccountId: w.bank.id, amount: 1_070_000 }, settings); throw new Error("QC-INDUCED gap"); }).catch(() => undefined);
    const p5 = await pay(goods[5]!);
    const tries = [await oldInsert(), await oldInsert(), await oldInsert()];
    const stuck = tries.every((t) => /P2002|Unique/i.test(t.outcome));
    chk("R2-C2", "INFO/contract: after rollback to OLD code, a book whose month has a gap below count+1 is stuck — every count+1 insert hits an existing number (count never grows)",
      p5.ok && stuck, `RV ${j((await rv()).map((x) => x.docNo))} · old-code attempts ${j(tries)}`);
    // C3: sequence dropped (or never created) — first posting re-creates it from the table max
    const before = Math.max(...(await rv()).map((x) => tailNo(x.docNo)));
    await P.$executeRawUnsafe(`SELECT account_jno_drop($1)`, w.A);
    const p6 = await pay(goods[6]!);
    const after = (await rv()).at(-1);
    chk("R2-C3", "a dropped sequence self-heals: the next posting re-creates it above the highest number in the table", p6.ok && tailNo(after.docNo) === before + 1, `max before ${before} · after drop+post ${after.docNo}`);
  }

  // ═════════ D — brand-new system, concurrent first allocations ═════════
  if (want("D")) {
    console.log("\n── D · concurrent first allocations of a brand-new (system, book) ──");
    for (const creatorFails of [false, true]) {
      const fake = `zzrv${rand}${creatorFails ? "f" : "o"}${Date.now().toString(36)}`; FAKES.push(fake);
      const out: string[] = [];
      await Promise.all([0, 1, 2, 3, 4, 5].map(async (i) => {
        await sleep(i === 0 ? 0 : 300 + i * 30);
        try {
          await P.$transaction(async (tx: Any) => {
            const r = (await tx.$queryRawUnsafe(`SELECT account_next_journal_no($1, 'GENERAL') AS n`, fake)) as Any[];
            out.push(`${i}:${r[0].n}`);
            await sleep(i === 0 ? 2_000 : 200);
            if (i === 0 && creatorFails) throw new Error("QC-INDUCED creator rollback");
          }, { maxWait: 20_000, timeout: 30_000 });
        } catch (e) { out.push(`${i}:ERR ${cut((e as Any)?.message, 90)}`); }
      }));
      // ORACLE-EDIT C5.4-N (controller, review D re-judged): the rolled-back creator's value was never committed — exclude it from the distinct check
      const nums = out.filter((x) => !/ERR/.test(x) && !(creatorFails && x.startsWith("0:"))).map((x) => Number(x.split(":")[1]));
      const errs = out.filter((x) => /ERR/.test(x) && !/QC-INDUCED/.test(x));
      chk(`R2-D-${creatorFails ? "creator-rolls-back" : "creator-commits"}`, "6 concurrent first allocations on a brand-new book — all succeed (the 23505 catch path) with distinct numbers, no NULL",
        errs.length === 0 && new Set(nums).size === nums.length && nums.every((n) => Number.isFinite(n) && n > 0), j(out));
      await P.$executeRawUnsafe(`SELECT account_jno_drop($1)`, fake);
    }
  }

  // ═════════ E — locks per created sequence (migration DO block runs everything in ONE transaction) ═════════
  if (want("E")) {
    console.log("\n── E · lock-table entries held per sequence created in one transaction ──");
    const N = 100; const t0 = Date.now(); let locks = 0, base = 0;
    await P.$transaction(async (tx: Any) => {
      base = Number(((await tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_locks WHERE pid = pg_backend_pid()`)) as Any[])[0].n);
      await tx.$executeRawUnsafe(`DO $$ DECLARE i int; b text; BEGIN FOR i IN 1..${N} LOOP FOREACH b IN ARRAY ARRAY['SALES','PURCHASES','RECEIPTS','PAYMENTS','GENERAL'] LOOP PERFORM account_jno_ensure('zzrvlock${rand}' || i, b, 0); END LOOP; END LOOP; END $$`);
      locks = Number(((await tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_locks WHERE pid = pg_backend_pid()`)) as Any[])[0].n);
      throw new Error("QC-ROLLBACK");
    }, { maxWait: 20_000, timeout: 60_000 }).catch(() => undefined);
    const mlpt = Number(((await P.$queryRawUnsafe(`SELECT current_setting('max_locks_per_transaction')::int AS a, current_setting('max_connections')::int AS b, current_setting('max_prepared_transactions')::int AS c`)) as Any[]).map((r) => r.a * (r.b + r.c))[0]);
    const perSystem = (locks - base) / N;
    const left = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind='S' AND relname LIKE $1`, `acc_jno_zzrvlock${rand}%`)) as Any[])[0].n);
    chk("R2-E", "INFO: lock-table entries held by the migration per system (5 sequences) — capacity = max_locks_per_transaction × (max_connections + max_prepared_transactions)",
      left === 0, `${N} systems → ${locks - base} extra locks (${perSystem.toFixed(2)} per system) in ${Date.now() - t0} ms · QC2 lock table ≈ ${mlpt} ⇒ the DO block alone exhausts it at ≈ ${Math.floor(mlpt / perSystem)} systems (others' locks not counted) · rolled back, left ${left}`);
  }
} catch (e) {
  chk("R2-FATAL", "probe ran to the end", false, cut(e instanceof Error ? `${e.message} ${e.stack?.split("\n").slice(1, 4).join(" ")}` : e, 700));
} finally {
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* retried */ } };
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  let tables: string[] = []; const left: string[] = [];
  if (ids.length) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) { await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } })); await del(() => P.appSystem.deleteMany({ where: { tenantId: id } })); await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } })); await del(() => P.tenant.delete({ where: { id } })); }
    for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); }
  }
  for (const s of [...SYSTEMS, ...FAKES].filter((x) => /^[a-z0-9]+$/i.test(x))) await del(() => P.$executeRawUnsafe(`SELECT account_jno_drop($1)`, s));
  const ids2 = [...SYSTEMS, ...FAKES, `zzrvlock${rand}`];
  const seqLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind='S' AND (${ids2.map((_, i) => `relname LIKE '%' || $${i + 1} || '%'`).join(" OR ")})`, ...ids2)) as Any[])[0].n);
  const tLeft = ids.length ? await P.tenant.count({ where: { id: { in: ids } } }) : 0;
  chk("R2-CLEAN", "own tenants and sequences gone", left.length === 0 && tLeft === 0 && seqLeft === 0, `rows ${left.join(" · ") || "0"} · tenants ${tLeft} · sequences ${seqLeft}`);
  await prisma.$disconnect();
}
const passed = res.filter((r) => r.ok).length;
console.log(`\nR2 ${passed}/${res.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: res.length, passed, findings: res.filter((r) => !r.ok).map((r) => r.id) })}`);
