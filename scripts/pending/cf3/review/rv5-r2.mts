// C5.5-fix3a REVIEW round 2 probe (independent reviewer) — migration 20261104000003 (allocator v2) on QC2 only · throwaway tenant `qc-cf3-rv5-*`.
//   rv3-jno.mts / rv4-review.mts assert "deployed == 000002" and are stale by design since 000003; they are NOT edited (history). This file
//   checks the body in force.
//   RV5-A  deployed = 000003 body byte-for-byte · metadata like the sibling · _prisma_migrations checksums of 000002 / 000003 = sha256(file).
//   RV5-B  the builder's deviation from review RV4-C (no lock for a taken number AT/ABOVE the book floor): while another transaction holds the
//          (system, book) advisory lock, (1) a taken number exactly AT the floor returns at once (no wait, sequence only forward), (2) a taken
//          number ABOVE the book floor (a same-docNo row in ANOTHER book — invisible to the floor, visible to the existence check) returns at
//          once, (3) a taken number 1000 below the floor waits (55P03 under lock_timeout) — the walk path is locked now.
//   RV5-C  RV3-A and RV4-B interleavings against the installed body (healer = copy of 000003 with a 600 ms window after its read; cashiers =
//          the DEPLOYED function) ⇒ 0 failures, distinct, above the floor.
//   RV5-D  stress, DEPLOYED function only: 6 rounds × 24 cashiers with random start 0–300 ms, the sequence reset to a random gap 1..1599 below
//          the floor each round, plus a sampler session (every ~10 ms) ⇒ 0 failures, 0 duplicates, 0 backwards samples.
//   RV5-E  INFO residual of the header: lock-free nextval calls (stand-in for free-number allocations) consuming > the remaining gap inside the
//          healer's read→setval window ⇒ does setval(floor) move the sequence back? (healer = 000003 copy with the 600 ms window; the
//          "allocations" are 1200 raw nextval in one statement from another session — a deliberately extreme stand-in, not an app flow).
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf3/review/rv5-r2.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const { fixture } = (await import("../_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };
const fx = await fixture("rv5");
const { P, chk, mkShop, done, TAG } = fx;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = TAG.slice(-8);
const FNS: string[] = [];
let A = "";
const V1 = "prisma/migrations/20261104000002_account_journal_no_alloc_lock/migration.sql";
const V2 = "prisma/migrations/20261104000003_account_journal_no_alloc_lock_v2/migration.sql";
const stmtOf = (file: string) => {
  const t = readFileSync(file, "utf8");
  const i = t.indexOf("CREATE OR REPLACE FUNCTION public.account_alloc_journal_no(");
  return i < 0 ? "" : t.slice(i, t.indexOf("END $$;", i) + "END $$;".length);
};
const bodyOf = (file: string) => { const s = stmtOf(file); return s.slice(s.indexOf("AS $$") + 5, s.lastIndexOf("$$;")); };
const errCode = (e: Any) => {
  const s = `${e?.code ?? ""} ${e?.meta?.code ?? ""} ${e?.message ?? e} ${JSON.stringify(e?.meta ?? {})}`;
  if (/55P03|lock timeout/i.test(s)) return "55P03";
  if (/40P01|deadlock/i.test(s)) return "40P01";
  if (/P2002|23505|Unique constraint/i.test(s)) return "P2002";
  return String(e?.code ?? e?.meta?.code ?? e?.message ?? e).slice(0, 80);
};
try {
  const shop = await mkShop("j", { account: true });
  A = shop.A as string;
  const tid = shop.tid as string;
  const bkk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date());
  const ym = `${bkk.slice(0, 4)}-${bkk.slice(5, 7)}`;
  const prefix = `RV-${ym}-`;
  const pad = (n: number) => String(n).padStart(4, "0");
  const row = (n: number, memo: string, book = "RECEIPTS") => ({ tenantId: tid, systemId: A, docNo: `${prefix}${pad(n)}`, book, journal: "ADJUST", date: new Date(), periodKey: ym, source: "AUTO", memo });
  const rows = [];
  for (let n = 2; n <= 1601; n += 1) rows.push(row(n, "rv5 foreign"));
  for (let i = 0; i < rows.length; i += 500) await P.accountJournalEntry.createMany({ data: rows.slice(i, i + 500) });
  await P.$queryRawUnsafe(`SELECT public.account_jno_ensure($1,'RECEIPTS')::text AS r`, A);
  const seqName = ((await P.$queryRawUnsafe(`SELECT public.account_jno_seq_name($1,'RECEIPTS') AS n`, A)) as Any[])[0].n as string;
  const floorNow = async () => Number(((await P.$queryRawUnsafe(`SELECT public.account_jno_floor($1,'RECEIPTS') AS f`, A)) as Any[])[0].f);
  const seqNext = async () => { const r = ((await P.$queryRawUnsafe(`SELECT last_value, is_called FROM public.${seqName}`)) as Any[])[0]; return Number(r.last_value) + (r.is_called ? 1 : 0); };
  const setSeq = (v: number) => P.$queryRawUnsafe(`SELECT setval('public.${seqName}', ${v}, true)`);

  // ═════════ RV5-A ═════════
  const installed = String(((await P.$queryRawUnsafe(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND proname='account_alloc_journal_no'`)) as Any[])[0]?.prosrc ?? "");
  const meta = (await P.$queryRawUnsafe(`SELECT p.proname, p.proconfig, pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname IN ('account_alloc_journal_no','account_peek_journal_no')`)) as Any[];
  const dm = meta.find((m) => m.proname === "account_alloc_journal_no");
  const sm = meta.find((m) => m.proname === "account_peek_journal_no");
  const mig = (await P.$queryRawUnsafe(`SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" WHERE migration_name LIKE '2026110400000%' ORDER BY 1`)) as Any[];
  const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
  const c2 = mig.find((m) => m.migration_name.startsWith("20261104000002"))?.checksum === sha(V1);
  const c3 = mig.find((m) => m.migration_name.startsWith("20261104000003"))?.checksum === sha(V2);
  chk("RV5-A-deployed-000003", installed === bodyOf(V2) && JSON.stringify(dm?.proconfig) === JSON.stringify(["search_path=pg_catalog, public"]) && dm?.owner === sm?.owner && dm?.acl === sm?.acl && c2 && c3,
    `prosrc == 000003 ${installed === bodyOf(V2)} · config ${JSON.stringify(dm?.proconfig)} · owner/acl = sibling ${dm?.owner === sm?.owner && dm?.acl === sm?.acl} · checksums 000002 ${c2} 000003 ${c3} · rows ${mig.map((m) => `${m.migration_name.slice(8, 14)}${m.finished_at ? "✓" : "…"}`).join(" ")}`);
  if (installed !== bodyOf(V2)) throw new Error("QC2 does not run 000003");

  // ═════════ RV5-B · deviation: at/above-floor taken numbers do not lock; below-floor walk does ═════════
  {
    const f0 = await floorNow(); // 1601
    // a same-docNo row in ANOTHER book, above the RECEIPTS floor ⇒ taken for the existence check, invisible to the RECEIPTS floor
    await P.accountJournalEntry.create({ data: row(f0 + 50, "rv5 other-book", "GENERAL") });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let held = false;
    const holder = P.$transaction(async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended('account_jno:' || $1, 0))::text AS x`, seqName);
      held = true;
      await gate;
    }, { maxWait: 20_000, timeout: 60_000 });
    for (let k = 0; k < 100 && !held; k += 1) await sleep(20);
    const tryAt = async (firstValue: number) => {
      await setSeq(firstValue - 1);
      const t0 = Date.now();
      let out = "";
      try {
        out = `returned ${await P.$transaction(async (tx: Any) => {
          await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '300ms'`);
          return Number(((await tx.$queryRawUnsafe(`SELECT public.account_alloc_journal_no($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n);
        }, { maxWait: 20_000, timeout: 20_000 })}`;
      } catch (e) { out = `FAILED ${errCode(e)}`; }
      return { out, ms: Date.now() - t0, next: await seqNext() };
    };
    const atFloor = await tryAt(f0);          // 1601 taken, f == n ⇒ no lock ⇒ 1602
    const aboveFloor = await tryAt(f0 + 50);  // 1651 taken in GENERAL, RECEIPTS floor 1601 < n ⇒ no lock ⇒ 1652
    const below = await tryAt(f0 - 1000);     // gap 1000 ⇒ must wait now (000002 walked lock-free here)
    release();
    await holder.catch(() => undefined);
    const ok = atFloor.out === `returned ${f0 + 1}` && atFloor.ms < 300 && aboveFloor.out === `returned ${f0 + 51}` && aboveFloor.ms < 300 &&
      below.out === "FAILED 55P03" && below.next === f0 - 999;
    chk("RV5-B-deviation-at-above-floor", ok,
      `lock held elsewhere · taken AT floor → ${atFloor.out} in ${atFloor.ms} ms · taken ABOVE book floor (other-book row) → ${aboveFloor.out} in ${aboveFloor.ms} ms · taken 1000 below → ${below.out} after ${below.ms} ms, sequence next ${below.next} (moved by its one nextval only)`);
    await P.accountJournalEntry.deleteMany({ where: { systemId: A, book: "GENERAL" } });
  }

  // instrumented copy of the installed body: 600 ms after its read under the lock
  const READ = "EXECUTE format('SELECT last_value, is_called FROM %s', r) INTO v, c;";
  if (!stmtOf(V2).includes(READ)) throw new Error("read statement not found in 000003");
  const H = `rv5_alloc_h_${rand}`;
  await P.$executeRawUnsafe(stmtOf(V2).replace("public.account_alloc_journal_no(", `public.${H}(`).replace(READ, `${READ} PERFORM pg_sleep(0.6);`));
  FNS.push(H);
  const cashier = async (fn: string, startMs: number, holdMs: number) => {
    await sleep(startMs);
    const t0 = Date.now();
    try {
      return await P.$transaction(async (tx: Any) => {
        const n = Number(((await tx.$queryRawUnsafe(`SELECT public.${fn}($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n);
        const ms = Date.now() - t0;
        await tx.accountJournalEntry.create({ data: row(n, "rv5 cashier") });
        await sleep(holdMs);
        return { n, err: "", ms };
      }, { maxWait: 60_000, timeout: 60_000 });
    } catch (e) {
      return { n: -1, err: errCode(e), ms: Date.now() - t0 };
    }
  };
  const fmt = (x: Any) => (x.err ? `FAILED ${x.err}` : `${x.n}`);

  // ═════════ RV5-C · RV3-A / RV4-B against the installed body ═════════
  {
    const out: string[] = [];
    let good = true;
    for (const shape of ["RV3-A", "RV4-B"] as const) {
      const f0 = await floorNow();
      // pad the block so the gap below the new floor is dense again (previous cashiers took f0..)
      await setSeq(shape === "RV3-A" ? f0 - 1002 : f0 - 1003);
      const runs = shape === "RV3-A"
        ? [cashier(H, 0, 300), cashier("account_alloc_journal_no", 200, 1500)]
        : [cashier(H, 0, 300), cashier("account_alloc_journal_no", 150, 300), cashier("account_alloc_journal_no", 300, 1500)];
      const rs = await Promise.all(runs);
      const ns = rs.filter((r) => !r.err).map((r) => r.n);
      const ok = rs.every((r) => !r.err) && new Set(ns).size === ns.length && ns.every((n) => n > f0);
      good = good && ok;
      out.push(`${shape} floor ${f0}: ${rs.map(fmt).join(" · ")}${ok ? "" : " ❌"}`);
    }
    chk("RV5-C-review-interleavings-closed", good, out.join(" | "));
  }

  // ═════════ RV5-D · stress on the deployed function with a sampler ═════════
  {
    let stop = false;
    let backwards = 0;
    let samples = 0;
    let prev = 0;
    let prevEpoch = -1;
    let epoch = 0;
    let resetting = false;
    const sampler = (async () => {
      while (!stop) {
        const e0 = epoch;
        const busy0 = resetting;
        const v = await seqNext();
        if (!busy0 && !resetting && e0 === epoch) {
          if (prevEpoch === e0 && v < prev) backwards += 1;
          prev = v;
          prevEpoch = e0;
        }
        samples += 1;
        await sleep(10);
      }
    })();
    const fails: string[] = [];
    let dups = 0;
    let below = 0;
    for (let round = 0; round < 6; round += 1) {
      const f0 = await floorNow();
      const gap = 1 + Math.floor(Math.random() * 1599);
      resetting = true;
      epoch += 1;
      await setSeq(Math.max(1, f0 - gap - 1));
      epoch += 1;
      resetting = false;
      const rs = await Promise.all(Array.from({ length: 24 }, () => cashier("account_alloc_journal_no", Math.floor(Math.random() * 300), 50 + Math.floor(Math.random() * 250))));
      const ns = rs.filter((r) => !r.err).map((r) => r.n);
      for (const r of rs) if (r.err) fails.push(r.err);
      dups += ns.length - new Set(ns).size;
      below += ns.filter((n) => n <= f0).length;
    }
    stop = true;
    await sampler;
    chk("RV5-D-stress-deployed", fails.length === 0 && dups === 0 && below === 0 && backwards === 0,
      `6 rounds × 24 cashiers (random gap 1..1599 below the floor each round) · failures ${JSON.stringify(fails)} · duplicates ${dups} · at/below floor ${below} · sampler ${samples} samples, backwards ${backwards}`);
  }

  // ═════════ RV5-E · INFO residual: > gap lock-free nextvals inside the healer's window ═════════
  {
    const f0 = await floorNow();
    await setSeq(f0 - 1003); // healer: nextval f0-1002 (taken) ⇒ lock ⇒ reads nv f0-1001 (gap 1001 ⇒ setval branch) ⇒ sleeps 600 ms
    const healer = cashier(H, 0, 300);
    await sleep(250);
    await P.$queryRawUnsafe(`SELECT max(nextval('public.${seqName}')) AS m FROM generate_series(1, 1200)`); // stand-in for > 1000 free-number allocations
    const peak = await seqNext();
    const h = await healer;
    const after = await seqNext();
    const backwardsMove = after < peak;
    chk("RV5-E-residual-info", true,
      `INFO ${backwardsMove ? "BACKWARDS MOVE (residual is real under an extreme stand-in)" : "no backwards move"} · floor ${f0} · next value after 1200 lock-free nextvals ${peak} · healer → ${fmt(h)} · next value after the healer ${after}`);
  }
} catch (e) {
  chk("RV5-ERR", false, String((e as Error)?.stack ?? e).slice(0, 700));
} finally {
  await done("rv5-r2", async () => {
    for (const f of FNS) await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.${f}(text, text, text, int)`);
    if (A) await P.$queryRawUnsafe(`SELECT public.account_jno_drop($1)::text AS x`, A).catch(() => undefined);
    const fnLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE 'rv5_alloc_%'`)) as Any[])[0].n);
    const seqLeft = A ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind = 'S' AND relname LIKE 'acc_jno_' || $1 || '_%'`, A)) as Any[])[0].n) : 0;
    const d = ((await P.$queryRawUnsafe(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND proname = 'account_alloc_journal_no'`)) as Any[]);
    chk("RV5-CLEAN", fnLeft === 0 && seqLeft === 0 && d.length === 1 && d[0].prosrc === bodyOf(V2),
      `copies left ${fnLeft} · journal sequences left ${seqLeft} · deployed account_alloc_journal_no still == 000003 file: ${d.length === 1 && d[0].prosrc === bodyOf(V2)}`);
  });
}
