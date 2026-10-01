// C5.5-fix3a REVIEW probe (independent reviewer) — H2b-2 allocator lock (migration 20261104000002) on QC2 only.
//   RV3-A  boundary interleaving: a lock-holding healer (instrumented COPY of the 000002 body, 600 ms sleep after it reads the sequence)
//          vs ONE concurrent cashier on the DEPLOYED function whose first nextval lands exactly 1000 below the floor ⇒ that cashier walks
//          the ≤ 1000 path lock-free past the floor; the healer's later setval(floor) moves the sequence back ⇒ same number twice (P2002).
//   RV3-B  control: same healer copy, cashier far below the floor ⇒ it takes the slow path, waits on the lock, re-reads ⇒ 0 failures.
//   RV3-C  normal operation is not serialised: while a healer (deployed fn) holds its advisory lock until commit, a free-number allocation
//          on the SAME book returns immediately.
//   RV3-D  deployed function = the 000002 file byte-for-byte · metadata (rettype/volatility/security/owner/acl/config) like its siblings.
//   RV3-E  _prisma_migrations order on QC2 (read-only).
// Own objects: tenant `qc-cf3-rv-*` (swept by the fixture) · function copies rv3_alloc_* (dropped) · journal sequences of the system (dropped).
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf3/review/rv3-jno.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { readFileSync } from "node:fs";
const { fixture } = (await import("../_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };
const fx = await fixture("rv");
const { P, chk, mkShop, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = TAG.slice(-8);
const FNS: string[] = [];
let A = "";
const NEW = "prisma/migrations/20261104000002_account_journal_no_alloc_lock/migration.sql";
const stmtOf = (file: string) => {
  const t = readFileSync(file, "utf8");
  const i = t.indexOf("CREATE OR REPLACE FUNCTION public.account_alloc_journal_no(");
  return i < 0 ? "" : t.slice(i, t.indexOf("END $$;", i) + "END $$;".length);
};
try {
  const shop = await mkShop("j", { account: true });
  A = shop.A as string;
  const tid = shop.tid as string;
  const bkk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date());
  const ym = `${bkk.slice(0, 4)}-${bkk.slice(5, 7)}`;
  const prefix = `RV-${ym}-`;
  const pad = (n: number) => String(n).padStart(4, "0");
  const row = (n: number, memo: string) => ({ tenantId: tid, systemId: A, docNo: `${prefix}${pad(n)}`, book: "RECEIPTS", journal: "ADJUST", date: new Date(), periodKey: ym, source: "AUTO", memo });
  const rows = [];
  for (let n = 2; n <= 1601; n += 1) rows.push(row(n, "rv3 foreign"));
  for (let i = 0; i < rows.length; i += 500) await P.accountJournalEntry.createMany({ data: rows.slice(i, i + 500) });
  await P.$queryRawUnsafe(`SELECT public.account_jno_ensure($1,'RECEIPTS')::text AS r`, A);
  const seqName = ((await P.$queryRawUnsafe(`SELECT public.account_jno_seq_name($1,'RECEIPTS') AS n`, A)) as Any[])[0].n as string;
  const floorNow = async () => Number(((await P.$queryRawUnsafe(`SELECT public.account_jno_floor($1,'RECEIPTS') AS f`, A)) as Any[])[0].f);
  const lastValue = async () => Number(((await P.$queryRawUnsafe(`SELECT last_value FROM public.${seqName}`)) as Any[])[0].last_value);

  // instrumented copy of the NEW body: sleep 600 ms right after the slow path reads (last_value, is_called) UNDER the lock
  const READ = "EXECUTE format('SELECT last_value, is_called FROM %s', r) INTO v, c;";
  const s0 = stmtOf(NEW);
  const H = `rv3_alloc_h_${rand}`;
  if (!s0.includes(READ)) throw new Error("read statement not found in the 000002 file");
  await P.$executeRawUnsafe(s0.replace("public.account_alloc_journal_no(", `public.${H}(`).replace(READ, `${READ} PERFORM pg_sleep(0.6);`));
  FNS.push(H);

  const cashier = async (fn: string, startMs: number, holdMs: number) => {
    await sleep(startMs);
    const t0 = Date.now();
    try {
      return await P.$transaction(async (tx: Any) => {
        const n = Number(((await tx.$queryRawUnsafe(`SELECT public.${fn}($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n);
        const allocMs = Date.now() - t0;
        await tx.accountJournalEntry.create({ data: row(n, "rv3 cashier") });
        await sleep(holdMs);
        return { fn, n, err: "", allocMs };
      }, { maxWait: 60_000, timeout: 60_000 });
    } catch (e) {
      return { fn, n: -1, err: String((e as Any)?.code ?? (e as Any)?.meta?.code ?? (e as Error)?.message).slice(0, 80), allocMs: Date.now() - t0 };
    }
  };

  // ── RV3-A · boundary: healer reads nv = floor-1000 (setval branch), a deployed-fn cashier walks the ≤1000 path past the floor meanwhile
  {
    const f0 = await floorNow(); // 1601
    await P.$queryRawUnsafe(`SELECT setval('public.${seqName}', ${f0 - 1002}, true)`); // healer's nextval = f0-1001 (taken, gap 1001 ⇒ slow path)
    const [h, b] = await Promise.all([cashier(H, 0, 300), cashier("account_alloc_journal_no", 200, 1500)]);
    const last = await lastValue();
    const ns = [h, b].filter((x) => !x.err).map((x) => x.n);
    const dupOrFail = !!h.err || !!b.err || ns.length !== new Set(ns).size;
    chk("RV3-A-boundary-residual", true,
      `INFO ${dupOrFail ? "REPRODUCED" : "not reproduced"} · floor ${f0} · healer(copy, 600 ms window) → ${h.err ? `FAILED ${h.err}` : h.n} · cashier(deployed, starts +200 ms, walks ≤1000 path lock-free) → ${b.err ? `FAILED ${b.err}` : `${b.n} in ${b.allocMs} ms`} · sequence last_value after ${last}`);
    (globalThis as Any).__rv3A = { dupOrFail, h, b };
  }
  // ── RV3-B · control: cashier far below the floor ⇒ slow path ⇒ waits on the healer's lock ⇒ no failure
  {
    const f0 = await floorNow();
    await P.$queryRawUnsafe(`SELECT setval('public.${seqName}', 1, true)`);
    const [h, b] = await Promise.all([cashier(H, 0, 300), cashier("account_alloc_journal_no", 200, 300)]);
    const ns = [h, b].filter((x) => !x.err).map((x) => x.n);
    const ok = !h.err && !b.err && ns.length === 2 && new Set(ns).size === 2 && ns.every((n) => n > f0);
    chk("RV3-B-control-slow-path-serialised", ok,
      `floor ${f0} · healer(copy) → ${h.err || h.n} · cashier(deployed, +200 ms, gap > 1000) → ${b.err || b.n} after ${b.allocMs} ms (want both > floor, distinct, cashier waited for the healer's commit)`);
  }
  // ── RV3-C · a healer (deployed fn) holds its lock 1.5 s; a free-number allocation on the SAME book in that time is not blocked
  {
    await P.$queryRawUnsafe(`SELECT setval('public.${seqName}', 1, true)`);
    const hp = cashier("account_alloc_journal_no", 0, 1500);
    await sleep(400);
    const held = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted AND objid = (hashtextextended('account_jno:' || $1, 0) & 4294967295)::bigint::oid`, seqName)) as Any[])[0].n);
    const t0 = Date.now();
    const fast = Number(((await P.$queryRawUnsafe(`SELECT public.account_alloc_journal_no($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n);
    const fastMs = Date.now() - t0;
    const h = await hp;
    chk("RV3-C-fast-path-not-serialised", held === 1 && !h.err && fastMs < 300 && fast !== h.n,
      `healer → ${h.err || h.n} (lock held while it holds its transaction: ${held}) · free-number allocation on the same book during that hold → ${fast} in ${fastMs} ms (want lock held = 1, < 300 ms)`);
  }
  // ── RV3-D · deployed function = file; metadata like the sibling functions of 000001
  {
    const s = stmtOf(NEW);
    const body = s.slice(s.indexOf("AS $$") + 5, s.lastIndexOf("$$;"));
    const meta = (await P.$queryRawUnsafe(`SELECT p.proname, p.prosrc, p.proconfig, p.provolatile::text AS provolatile, p.prosecdef, p.prorettype::regtype::text AS rt,
        pg_get_function_identity_arguments(p.oid) AS args, pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('account_alloc_journal_no','account_jno_floor','account_peek_journal_no')`)) as Any[];
    const by = (n: string) => meta.find((m) => m.proname === n);
    const d = by("account_alloc_journal_no");
    const sib = by("account_peek_journal_no");
    const ok = meta.filter((m) => m.proname === "account_alloc_journal_no").length === 1 && d?.prosrc === body && j(d?.proconfig) === j(["search_path=pg_catalog, public"]) &&
      d?.provolatile === "v" && d?.prosecdef === false && d?.rt === "bigint" && d?.args === "p_system text, p_book text, p_prefix text, p_width integer" &&
      d?.owner === sib?.owner && d?.acl === sib?.acl;
    chk("RV3-D-deployed-equals-file", ok,
      `prosrc == 000002 body ${d?.prosrc === body} · config ${j(d?.proconfig)} · volatile ${d?.provolatile} · secdef ${d?.prosecdef} · returns ${d?.rt} · args (${d?.args}) · owner ${d?.owner} (sibling ${sib?.owner}) · acl ${d?.acl} (sibling ${sib?.acl})`);
  }
  // ── RV3-E · migration rows (read-only)
  {
    const m = (await P.$queryRawUnsafe(`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name >= '20261103' ORDER BY migration_name`)) as Any[];
    const later = m.filter((r) => r.migration_name > "20261104000002_account_journal_no_alloc_lock");
    chk("RV3-E-migrations", m.some((r) => r.migration_name === "20261104000002_account_journal_no_alloc_lock" && r.finished_at),
      `INFO QC2 rows ≥ 20261103: ${m.map((r) => `${r.migration_name.slice(0, 14)}@${r.finished_at ? new Date(r.finished_at).toISOString().slice(5, 16) : "unfinished"}`).join(" · ")} · names after 000002: ${later.length}`);
  }
} catch (e) {
  chk("RV3-ERR", false, String((e as Error)?.stack ?? e).slice(0, 700));
} finally {
  await done("rv3-jno", async () => {
    for (const f of FNS) await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.${f}(text, text, text, int)`);
    if (A) await P.$queryRawUnsafe(`SELECT public.account_jno_drop($1)::text AS x`, A).catch(() => undefined);
    const fnLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE 'rv3_alloc_%'`)) as Any[])[0].n);
    const seqLeft = A ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind = 'S' AND relname LIKE 'acc_jno_' || $1 || '_%'`, A)) as Any[])[0].n) : 0;
    const s = stmtOf(NEW);
    const body = s.slice(s.indexOf("AS $$") + 5, s.lastIndexOf("$$;"));
    const d = ((await P.$queryRawUnsafe(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND proname = 'account_alloc_journal_no'`)) as Any[]);
    chk("RV3-CLEAN", fnLeft === 0 && seqLeft === 0 && d.length === 1 && d[0].prosrc === body,
      `copies left ${fnLeft} · journal sequences left ${seqLeft} · deployed account_alloc_journal_no still == 000002 file: ${d.length === 1 && d[0].prosrc === body}`);
  });
}
