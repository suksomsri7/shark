// C5.4-N round 2 builder probe (QC2 only · own tenants · cleans rows + its sequences/squat tables)
//   M1  allocate-until-free: journal numbers written OUTSIDE the sequence (old count+1 code after the migration · import · restore ·
//       a dropped sequence) never surface as a failed payment — the allocator skips taken numbers and moves the sequence above the table
//   S   setup-time creation: a system set up through the autocommit path (saveSettings / ensureAccounting without tx) has its 5 sequences
//       BEFORE any money transaction, and its first payment performs no DDL (sequence pg_class xmin unchanged) · lazy in-tx creation still
//       works as a fallback · a failing fallback surfaces a clear Thai message (not "บันทึกชำระไม่สำเร็จ") and writes nothing
//   SEAM  allocateJournalNo: NULL from the database → throws (never stores "…-null") · privilege error (42501) → Thai message
// Run: env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54n/probe-m1.mts [--only=M,S,SEAM]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";

const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean).map((s) => s.toUpperCase());
const want = (s: string) => ONLY.length === 0 || ONLY.includes(s);
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("probe-m1: network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rawErrors: string[] = [];
const origTx = P.$transaction.bind(P);
P.$transaction = async (...a: Any[]) => { try { return await origTx(...a); } catch (e) { rawErrors.push(`${String((e as Any)?.code ?? "")}|${String((e as Any)?.message ?? e).replace(/\s+/g, " ").slice(0, 200)}`); throw e; } };
const p2002 = () => rawErrors.filter((e) => /P2002|Unique constraint|23505/.test(e)).length;
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const cut = (v: unknown, n = 220) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const tailNo = (s: string | null | undefined) => { const m = /(\d+)\s*$/.exec(s ?? ""); return m ? Number(m[1]) : NaN; };
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, name: string, ok: unknown, detail: string) => { res.push({ id, ok: !!ok }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}\n        — ${detail}`); };
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-c54nm1-${rand}`;
const TENANTS: string[] = []; const SYSTEMS: string[] = []; const SQUATS: string[] = [];
const GENERIC = /^บันทึกชำระไม่สำเร็จ$/;

try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const acc = (await import("@/lib/modules/account/service" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;

  const seqName = (A: string, book: string) => `acc_jno_${A}_${book.toLowerCase()}`;
  const seqState = async (A: string) => (await P.$queryRawUnsafe(
    `SELECT c.relname, c.xmin::text AS xmin FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S' AND c.relname LIKE $1 ORDER BY 1`,
    `acc_jno_${A}_%`)) as { relname: string; xmin: string }[];

  /** tenant + ACCOUNT system; setup = the product's autocommit setup path (saveSettings + ensureAccounting without a tx) */
  const world = async (label: string) => {
    const T = (await P.tenant.create({ data: { name: `${TAG}-${label}`, slug: `${TAG}-${label}` } })).id as string; TENANTS.push(T);
    const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG} ${label}`)).id as string; SYSTEMS.push(A);
    const afterCreate = await seqState(A);
    await acc.saveSettings(T, A, { orgName: `QC m1 ${label}`, taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
    await gl.ensureAccounting({ tenantId: T, systemId: A });
    const cust = await acc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
    const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
    const inv = async () => {
      const d = await acc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "สินค้า", qty: 1, unitPrice: 1_000_000 }] });
      const r = await acc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(`setup issue invoice: ${r.reason}`); return d.id as string;
    };
    const pay = (d: string) => acc.recordPayment(T, A, d, { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 });
    const rv = async () => (await P.accountJournalEntry.findMany({ where: { systemId: A, book: "RECEIPTS" }, select: { docNo: true, periodKey: true, journal: true }, orderBy: { createdAt: "asc" } })) as Any[];
    /** a row written OUTSIDE the sequence (old count+1 code / import / restore) with the given number in the current RV series */
    const foreign = async (n: number, memo: string) => {
      const e = (await rv()).at(-1); if (!e) throw new Error("foreign(): needs one RV entry first");
      const docNo = `RV-${e.periodKey}-${String(n).padStart(4, "0")}`;
      await P.accountJournalEntry.create({ data: { tenantId: T, systemId: A, docNo, book: "RECEIPTS", journal: e.journal, date: new Date(), periodKey: e.periodKey, source: "AUTO", memo } });
      return docNo;
    };
    const oldNext = async () => { const e = (await rv()).at(-1); return 1 + (await P.accountJournalEntry.count({ where: { systemId: A, book: "RECEIPTS", periodKey: e.periodKey } })); };
    return { T, A, afterCreate, inv, pay, rv, foreign, oldNext };
  };

  // ═════════ M — allocate-until-free ═════════
  if (want("M")) {
    console.log("\n── M · journal numbers written outside the sequence ──");
    // M1a — R2-C1 shape, three rows: old code (count+1) writes the next numbers after the sequence exists
    {
      const w = await world("m1a"); const docs: string[] = []; for (let i = 0; i < 6; i += 1) docs.push(await w.inv());
      const p1 = await w.pay(docs[0]!); const p2 = await w.pay(docs[1]!);
      const olds: string[] = []; for (let i = 0; i < 3; i += 1) olds.push(await w.foreign(await w.oldNext(), "probe-m1: OLD code count+1 after the migration"));
      rawErrors.length = 0;
      const ps = [await w.pay(docs[2]!), await w.pay(docs[3]!), await w.pay(docs[4]!)];
      const all = (await w.rv()).map((x) => x.docNo as string);
      const fresh = all.slice(-3);
      chk("M1a", "old code wrote count+1 numbers 3..5 after the sequence (at 2) existed — the next 3 payments all succeed with numbers above them, no duplicate, no raw P2002",
        p1.ok && p2.ok && ps.every((p) => p.ok) && p2002() === 0 && new Set(all).size === all.length && fresh.every((n) => tailNo(n) > Math.max(...olds.map(tailNo))),
        `old ${j(olds)} · payments ${j(ps.map((p) => (p.ok ? "ok" : `FAIL ${cut(p.reason, 80)}`)))} · RV ${j(all)} · raw P2002 ${p2002()}`);
    }
    // M1b — imported/manual numbers: the very next candidate is taken AND one far above (0900)
    {
      const w = await world("m1b"); const docs: string[] = []; for (let i = 0; i < 5; i += 1) docs.push(await w.inv());
      const p1 = await w.pay(docs[0]!);
      const nextCand = tailNo((await w.rv()).at(-1).docNo) + 1;
      const imp = [await w.foreign(nextCand, "probe-m1: imported (next candidate)"), await w.foreign(nextCand + 1, "probe-m1: imported (next+1)"), await w.foreign(900, "probe-m1: imported far above")];
      rawErrors.length = 0;
      const ps = [await w.pay(docs[1]!), await w.pay(docs[2]!)];
      const all = (await w.rv()).map((x) => x.docNo as string);
      const fresh = all.slice(-2).map(tailNo);
      chk("M1b", "imported numbers at the next candidate, next+1 and 0900 — payments succeed; the allocator skips to above the table max (0901, 0902), no raw P2002",
        p1.ok && ps.every((p) => p.ok) && p2002() === 0 && new Set(all).size === all.length && fresh[0] === 901 && fresh[1] === 902,
        `imported ${j(imp)} · payments ${j(ps.map((p) => (p.ok ? "ok" : `FAIL ${cut(p.reason, 80)}`)))} · new ${j(fresh)} · raw P2002 ${p2002()}`);
    }
    // M1c — dropped (missing) sequence while the table holds a high number: re-created from the floor, continues above it
    {
      const w = await world("m1c"); const docs: string[] = []; for (let i = 0; i < 3; i += 1) docs.push(await w.inv());
      const p1 = await w.pay(docs[0]!);
      await P.$executeRawUnsafe(`SELECT account_jno_drop($1)`, w.A);
      const hi = await w.foreign(950, "probe-m1: restored row");
      rawErrors.length = 0;
      const p2 = await w.pay(docs[1]!);
      const last = (await w.rv()).at(-1).docNo as string;
      chk("M1c", "sequence dropped + a row 0950 in the table — the next payment re-creates the sequence above the max and gets 0951",
        p1.ok && p2.ok && tailNo(last) === 951 && p2002() === 0, `row ${hi} · payment ${p2.ok ? "ok" : `FAIL ${cut(p2.reason, 80)}`} · got ${last} · raw P2002 ${p2002()}`);
    }
    // M1d — concurrency: 3 cashiers × 8 payments while foreign rows keep landing a few numbers ahead of the sequence
    {
      const w = await world("m1d"); const docs: string[] = []; for (let i = 0; i < 25; i += 1) docs.push(await w.inv());
      const p0 = await w.pay(docs[0]!);
      rawErrors.length = 0;
      const queue = docs.slice(1); const results: Any[] = []; let stop = false; const injected: string[] = [];
      const injector = (async () => {
        while (!stop && injected.length < 6) {
          const top = Math.max(...(await w.rv()).map((x) => tailNo(x.docNo)));
          try { injected.push(await w.foreign(top + 4, "probe-m1: concurrent foreign row")); } catch { /* the number was taken meanwhile */ }
          await new Promise((r) => setTimeout(r, 400));
        }
      })();
      await Promise.all([0, 1, 2].map(async () => { for (;;) { const d = queue.shift(); if (!d) return; results.push(await w.pay(d)); } }));
      stop = true; await injector;
      const all = (await w.rv()).map((x) => x.docNo as string);
      chk("M1d", "3 cashiers × 8 payments while 6 foreign rows land 4 numbers ahead of the sequence — every payment succeeds, all numbers unique, no raw P2002",
        p0.ok && results.length === 24 && results.every((r) => r.ok) && p2002() === 0 && new Set(all).size === all.length,
        `ok ${results.filter((r) => r.ok).length}/24 · fails ${j(results.filter((r) => !r.ok).map((r) => cut(r.reason, 60)))} · injected ${injected.length} · RV ${all.length} unique ${new Set(all).size} · raw ${j(rawErrors.slice(0, 3))}`);
    }
  }

  // ═════════ S — setup-time creation · fallback · fallback failure ═════════
  if (want("S")) {
    console.log("\n── S · sequences created at setup, outside money transactions ──");
    {
      const w = await world("s1");
      const before = await seqState(w.A);
      const d = await w.inv(); rawErrors.length = 0;
      const p = await w.pay(d);
      const after = await seqState(w.A);
      const rvNo = (await w.rv()).at(-1)?.docNo;
      chk("S1", "new system: createSystem has none; after setup (saveSettings + ensureAccounting, autocommit) all 5 sequences exist BEFORE any money transaction; the first payment performs no DDL (pg_class xmin unchanged) and gets …-0001",
        w.afterCreate.length === 0 && before.length === 5 && p.ok && j(after) === j(before) && tailNo(rvNo) === 1,
        `after createSystem ${w.afterCreate.length} · after setup ${before.length} ${j(before.map((s) => s.xmin))} · payment ${p.ok ? "ok" : `FAIL ${cut(p.reason, 80)}`} · after ${j(after.map((s) => s.xmin))} · ${rvNo}`);
    }
    {
      const w = await world("s2"); const d1 = await w.inv(); const d2 = await w.inv();
      const p1 = await w.pay(d1);
      await P.$executeRawUnsafe(`SELECT account_jno_drop($1)`, w.A);
      rawErrors.length = 0;
      const p2 = await w.pay(d2);
      const after = await seqState(w.A);
      const nos = (await w.rv()).map((x) => tailNo(x.docNo));
      chk("S2", "fallback kept: sequences missing at the first posting (dropped) — the money transaction creates the one it needs (lazy) and continues above the table max",
        p1.ok && p2.ok && after.some((s) => s.relname === seqName(w.A, "RECEIPTS")) && j(nos) === j([1, 2]), `payments ${p1.ok}/${p2.ok} · sequences now ${j(after.map((s) => s.relname.slice(-9)))} · RV ${j(nos)}`);
    }
    {
      const w = await world("s3"); const d = await w.inv();
      await P.$executeRawUnsafe(`SELECT account_jno_drop($1)`, w.A);
      const squat = seqName(w.A, "RECEIPTS"); SQUATS.push(squat);
      await P.$executeRawUnsafe(`CREATE TABLE public."${squat}" (x int)`);
      rawErrors.length = 0;
      const p = await w.pay(d);
      const left = await P.accountDocumentPayment.count({ where: { documentId: d } });
      const reason = p.ok ? "" : String(p.reason);
      chk("S3", "fallback fails (the sequence cannot be created/used) — the payment is refused with a clear Thai message about the journal number (not the generic 'บันทึกชำระไม่สำเร็จ'), nothing written",
        !p.ok && /[ก-๙]/.test(reason) && !GENERIC.test(reason) && /เลขที่ใบสำคัญ/.test(reason) && left === 0, `reason "${cut(reason, 160)}" · leftover payments ${left} · raw ${j(rawErrors.slice(0, 1))}`);
    }
  }

  // ═════════ SEAM — allocateJournalNo guards ═════════
  if (want("SEAM")) {
    console.log("\n── SEAM · allocateJournalNo guards ──");
    const ctx = { tenantId: "t-seam", systemId: "sseam" };
    const date = new Date();
    const fakeTx = (impl: () => Promise<unknown>) => ({ $queryRawUnsafe: impl, $queryRaw: impl, $executeRawUnsafe: impl }) as Any;
    let nullOut = ""; try { nullOut = `RETURNED ${await gl.allocateJournalNo(ctx, "GENERAL", date, fakeTx(async () => [{ n: null }]))}`; } catch (e) { nullOut = `THREW ${cut((e as Error).message, 160)}`; }
    chk("SEAM-null", "the database returns NULL for the number — allocateJournalNo throws a Thai error instead of returning '…-null'",
      /^THREW/.test(nullOut) && /[ก-๙]/.test(nullOut) && !/null/i.test(nullOut.replace(/^THREW /, "")), nullOut);
    const permErr = Object.assign(new Error("Raw query failed. Code: `42501`. Message: `ERROR: permission denied for schema public`"), { code: "P2010", meta: { code: "42501", message: "ERROR: permission denied for schema public" } });
    let permOut = ""; try { permOut = `RETURNED ${await gl.allocateJournalNo(ctx, "GENERAL", date, fakeTx(async () => { throw permErr; }))}`; } catch (e) { permOut = `THREW ${cut((e as Error).message, 200)}`; }
    chk("SEAM-42501", "a privilege error while creating/using the sequence becomes a clear Thai message (journal number · tell the administrator), not the raw English error",
      /^THREW/.test(permOut) && /เลขที่ใบสำคัญ/.test(permOut) && !/permission denied/i.test(permOut), permOut);
  }
} catch (e) {
  chk("M1-FATAL", "probe ran to the end", false, cut(e instanceof Error ? `${e.message} ${e.stack?.split("\n").slice(1, 4).join(" ")}` : e, 700));
} finally {
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* retried */ } };
  for (const s of SQUATS.filter((x) => /^[a-z0-9_]+$/.test(x))) await del(() => P.$executeRawUnsafe(`DROP TABLE IF EXISTS public."${s}"`));
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const left: string[] = [];
  if (ids.length) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) { await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } })); await del(() => P.appSystem.deleteMany({ where: { tenantId: id } })); await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } })); await del(() => P.tenant.delete({ where: { id } })); }
    for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); }
  }
  for (const s of SYSTEMS.filter((x) => /^[a-z0-9]+$/i.test(x))) await del(() => P.$executeRawUnsafe(`SELECT account_jno_drop($1)`, s));
  const seqLeft = SYSTEMS.length ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relname = ANY($1::text[])`, SYSTEMS.flatMap((s) => ["SALES", "PURCHASES", "RECEIPTS", "PAYMENTS", "GENERAL"].map((b) => `acc_jno_${s}_${b.toLowerCase()}`)))) as Any[])[0].n) : 0;
  const tLeft = ids.length ? await P.tenant.count({ where: { id: { in: ids } } }) : 0;
  chk("M1-CLEAN", "own tenants, rows, sequences and squat tables gone", left.length === 0 && tLeft === 0 && seqLeft === 0, `rows ${left.join(" · ") || "0"} · tenants ${tLeft} · relations ${seqLeft}`);
  await prisma.$disconnect();
}
const passed = res.filter((r) => r.ok).length;
console.log(`\nM1 ${passed}/${res.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: res.length, passed, findings: res.filter((r) => !r.ok).map((r) => r.id) })}`);
