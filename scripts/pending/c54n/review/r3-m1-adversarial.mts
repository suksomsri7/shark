// C5.4-N REVIEW round 2 probe R3 (reviewer · QC2 only · own tenants · cleans rows + sequences)
//   H1  concurrent healers over a dense foreign block > 1000 (setval path): 50 rounds × 16 concurrent allocations from a sequence reset
//       below the block — any value handed out twice in a round = the sequence moved BACKWARDS (check-then-setval race)
//   H2  ≤ 1000 path: foreign block of 999 above the sequence — one allocation steps through it (cost) and lands above
//   H3  residual: an OLD-code row still uncommitted at check time — what the cashier sees
//   H4  attempt bound: taken numbers the floor cannot see (another book's rows carrying this book's prefix) — 8 attempts → Thai message
//   H5  setup cost: account_jno_ensure_system on a system that already has its sequences (cold-lambda round trip)
//   E2  migration path: account_jno_create for 500 fake systems in ONE transaction — lock entries + subtransactions (rolled back)
// Run: env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54n/review/r3-m1-adversarial.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("review: network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) ?? "undefined";
const cut = (v: unknown, n = 200) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, name: string, ok: unknown, detail: string) => { res.push({ id, ok: !!ok }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}\n        — ${detail}`); };
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-c54nr3-${rand}`;
const TENANTS: string[] = []; const SYSTEMS: string[] = [];

try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const acc = (await import("@/lib/modules/account/service" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const bkk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date());
  const ym = `${bkk.slice(0, 4)}-${bkk.slice(5, 7)}`;
  const world = async (label: string) => {
    const T = (await P.tenant.create({ data: { name: `${TAG}-${label}`, slug: `${TAG}-${label}` } })).id as string; TENANTS.push(T);
    const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG} ${label}`)).id as string; SYSTEMS.push(A);
    await acc.saveSettings(T, A, { orgName: `QC r3 ${label}`, taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
    await gl.ensureAccounting({ tenantId: T, systemId: A });
    const cust = await acc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
    const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
    const inv = async () => { const d = await acc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "สินค้า", qty: 1, unitPrice: 1_000_000 }] }); const r = await acc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
    const pay = (d: string) => acc.recordPayment(T, A, d, { channel: "TRANSFER", financeAccountId: bank.id, amount: 1_070_000 });
    return { T, A, inv, pay };
  };
  const foreign = async (T: string, A: string, book: string, prefix: string, from: number, to: number) => {
    const rows = []; for (let n = from; n <= to; n += 1) rows.push({ tenantId: T, systemId: A, docNo: `${prefix}${String(n).padStart(4, "0")}`, book, journal: "ADJUST", date: new Date(), periodKey: ym, source: "AUTO", memo: "r3 foreign" });
    for (let i = 0; i < rows.length; i += 500) await P.accountJournalEntry.createMany({ data: rows.slice(i, i + 500) });
  };
  const seqName = async (A: string, b: string) => ((await P.$queryRawUnsafe(`SELECT public.account_jno_seq_name($1,$2) AS n`, A, b)) as Any[])[0].n as string;
  const alloc = async (A: string, b: string, prefix: string) => Number(((await P.$queryRawUnsafe(`SELECT public.account_alloc_journal_no($1,$2,$3,4) AS n`, A, b, prefix)) as Any[])[0].n);

  // ═════ H1 ═════
  {
    console.log("\n── H1 · concurrent healers (setval path, block > 1000) ──");
    const w = await world("h1");
    const prefix = `RV-${ym}-`;
    await foreign(w.T, w.A, "RECEIPTS", prefix, 2, 1601); // dense block 2..1601 (> 1000 above a sequence at 1)
    const name = await seqName(w.A, "RECEIPTS");
    await P.$queryRawUnsafe(`SELECT public.account_jno_ensure($1,'RECEIPTS')::text AS r`, w.A);
    let dupRounds = 0, belowBlock = 0, errs = 0, total = 0; const dupEx: string[] = [];
    const t0 = Date.now();
    for (let round = 0; round < 50; round += 1) {
      await P.$queryRawUnsafe(`SELECT setval('public.${name}', 1, true)`); // simulate a sequence behind a dense foreign block
      const got: number[] = [];
      await Promise.all(Array.from({ length: 16 }, async () => { try { got.push(await alloc(w.A, "RECEIPTS", prefix)); } catch (e) { errs += 1; if (dupEx.length < 3) dupEx.push(cut((e as Any)?.message, 120)); } }));
      total += got.length;
      if (new Set(got).size !== got.length) { dupRounds += 1; if (dupEx.length < 6) dupEx.push(`round ${round}: ${j([...got].sort((a, b) => a - b))}`); }
      belowBlock += got.filter((n) => n >= 2 && n <= 1601).length;
    }
    chk("R3-H1", "16 concurrent allocations × 50 rounds against a sequence behind a dense block of 1600 foreign numbers: every value distinct per round (sequence never moved backwards), none inside the block, no error",
      dupRounds === 0 && belowBlock === 0 && errs === 0, `${total} values in ${Date.now() - t0} ms · rounds with a value handed out twice ${dupRounds} · values inside the block ${belowBlock} · errors ${errs} · ${j(dupEx)}`);
  }

  // ═════ H2 ═════
  {
    console.log("\n── H2 · ≤ 1000 path (nextval stepping) ──");
    const w = await world("h2");
    const d0 = await w.inv(); const p0 = await w.pay(d0); // sequence at 1
    const prefix = `RV-${ym}-`;
    await foreign(w.T, w.A, "RECEIPTS", prefix, 2, 1000); // 999 taken numbers right above
    const d1 = await w.inv(); const t0 = Date.now(); const p1 = await w.pay(d1); const ms = Date.now() - t0;
    const e = await P.accountJournalEntry.findFirst({ where: { systemId: w.A, refType: "AccountDocumentPayment", refId: p1.ok ? p1.paymentId : "-" }, select: { docNo: true } });
    chk("R3-H2", "a payment behind 999 taken numbers steps through them inside one allocation and lands above the block", p0.ok && p1.ok && e?.docNo === `${prefix}1001`, `p1 ${p1.ok ? "ok" : p1.reason} → ${e?.docNo} in ${ms} ms`);
  }

  // ═════ H3 ═════
  {
    console.log("\n── H3 · old-code row still uncommitted at check time ──");
    const w = await world("h3");
    const d0 = await w.inv(); await w.pay(d0); // RV …0001 · sequence at 1
    const prefix = `RV-${ym}-`;
    const d1 = await w.inv();
    let seen = ""; let oldDone = "";
    await Promise.all([
      P.$transaction(async (tx: Any) => { // OLD code: count+1 = 0002, holds its transaction 3 s
        await tx.accountJournalEntry.create({ data: { tenantId: w.T, systemId: w.A, docNo: `${prefix}0002`, book: "RECEIPTS", journal: "ADJUST", date: new Date(), periodKey: ym, source: "AUTO", memo: "r3 old code uncommitted" } });
        await sleep(3_000); oldDone = "committed";
      }, { maxWait: 10_000, timeout: 20_000 }),
      (async () => { await sleep(500); const t0 = Date.now(); const r = await w.pay(d1); seen = r.ok ? `ok after ${Date.now() - t0} ms` : `FAIL "${r.reason}" after ${Date.now() - t0} ms`; })(),
    ]);
    const after = await w.pay(await w.inv());
    chk("R3-H3", "INFO (residual): new-code payment racing an UNCOMMITTED old-code row of the same number — waits for it, then fails once with the generic message; the next payment is fine",
      true, `old ${oldDone} · cashier saw: ${seen} · next payment ${after.ok ? "ok" : after.reason}`);
  }

  // ═════ H4 ═════
  {
    console.log("\n── H4 · attempt bound (taken numbers outside the floor) ──");
    const w = await world("h4");
    const d0 = await w.inv(); await w.pay(d0); // RV …0001
    const prefix = `RV-${ym}-`;
    await foreign(w.T, w.A, "GENERAL", prefix, 2, 20); // another book carrying RV numbers: the RECEIPTS floor cannot see them
    const r = await w.pay(await w.inv());
    const r2 = await w.pay(await w.inv()); const r3 = await w.pay(await w.inv());
    chk("R3-H4", "INFO: 19 taken numbers invisible to the floor — the allocator gives up after 8 (clear Thai message, nothing written) and later attempts advance past them",
      !r.ok && /ออกเลขที่ใบสำคัญไม่ได้/.test(String(r.reason)) , `1st ${r.ok ? "ok" : `FAIL "${cut(r.reason, 90)}"`} · 2nd ${r2.ok ? "ok" : `FAIL "${cut(r2.reason, 60)}"`} · 3rd ${r3.ok ? "ok" : `FAIL "${cut(r3.reason, 60)}"`}`);
  }

  // ═════ H5 ═════
  {
    console.log("\n── H5 · setup call cost ──");
    const A = SYSTEMS[0]!; const xs: number[] = [];
    for (let i = 0; i < 20; i += 1) { const t0 = Date.now(); await P.$queryRawUnsafe(`SELECT public.account_jno_ensure_system($1) AS c`, A); xs.push(Date.now() - t0); }
    const ys: number[] = []; for (let i = 0; i < 20; i += 1) { const t0 = Date.now(); await P.$queryRawUnsafe(`SELECT 1`); ys.push(Date.now() - t0); }
    chk("R3-H5", "INFO: account_jno_ensure_system on an existing system ≈ one round trip", true, `median ${median(xs)} ms (max ${Math.max(...xs)}) vs SELECT 1 median ${median(ys)} ms`);
  }

  // ═════ E2 ═════
  {
    console.log("\n── E2 · migration path locks / subtransactions ──");
    const N = 500; let locks = 0, base = 0, sub = "?"; const t0 = Date.now();
    await P.$transaction(async (tx: Any) => {
      base = Number(((await tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_locks WHERE pid = pg_backend_pid()`)) as Any[])[0].n);
      await tx.$executeRawUnsafe(`DO $$ DECLARE i int; b text; BEGIN FOR i IN 1..${N} LOOP FOREACH b IN ARRAY ARRAY['SALES','PURCHASES','RECEIPTS','PAYMENTS','GENERAL'] LOOP PERFORM public.account_jno_create('zzrvthree${rand}' || i, b, 0); END LOOP; END LOOP; END $$`);
      locks = Number(((await tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_locks WHERE pid = pg_backend_pid()`)) as Any[])[0].n);
      sub = j(await tx.$queryRawUnsafe(`SELECT x.subxact_count, x.subxact_overflowed FROM pg_stat_get_backend_idset() s(id), LATERAL pg_stat_get_backend_subxact(s.id) x WHERE pg_stat_get_backend_pid(s.id) = pg_backend_pid()`).catch((e: Any) => [`n/a ${cut(e?.message, 80)}`]));
      throw new Error("QC-ROLLBACK");
    }, { maxWait: 20_000, timeout: 120_000 }).catch(() => undefined);
    const left = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind='S' AND relname LIKE $1`, `acc_jno_zzrvthree${rand}%`)) as Any[])[0].n);
    chk("R3-E2", "INFO: migration pre-create path (account_jno_create) — locks and subtransactions for 500 systems in one transaction", left === 0,
      `${locks - base} extra locks (${((locks - base) / N).toFixed(2)}/system) · subxacts ${sub} · ${Date.now() - t0} ms · smallest Neon compute 64×112 = 7168 ⇒ ${(100 * (locks - base) / 7168).toFixed(0)} % · rolled back, left ${left}`);
  }
} catch (e) {
  chk("R3-FATAL", "probe ran to the end", false, cut(e instanceof Error ? `${e.message} ${e.stack?.split("\n").slice(1, 4).join(" ")}` : e, 700));
} finally {
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* retried */ } };
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const left: string[] = [];
  if (ids.length) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) { await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } })); await del(() => P.appSystem.deleteMany({ where: { tenantId: id } })); await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } })); await del(() => P.tenant.delete({ where: { id } })); }
    for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); }
  }
  for (const s of SYSTEMS) await del(() => P.$executeRawUnsafe(`SELECT public.account_jno_drop($1)`, s));
  const ids2 = [...SYSTEMS, `zzrvthree${rand}`];
  const seqLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind='S' AND (${ids2.map((_, i) => `relname LIKE '%' || $${i + 1} || '%'`).join(" OR ")})`, ...ids2)) as Any[])[0].n);
  const tLeft = ids.length ? await P.tenant.count({ where: { id: { in: ids } } }) : 0;
  chk("R3-CLEAN", "own tenants and sequences gone", left.length === 0 && tLeft === 0 && seqLeft === 0, `rows ${left.join(" · ") || "0"} · tenants ${tLeft} · sequences ${seqLeft}`);
  await prisma.$disconnect();
}
const passed = res.filter((r) => r.ok).length;
console.log(`\nR3 ${passed}/${res.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: res.length, passed, findings: res.filter((r) => !r.ok).map((r) => r.id) })}`);
