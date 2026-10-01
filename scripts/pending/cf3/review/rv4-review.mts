// C5.5-fix3a REVIEW probe #2 (independent reviewer, restart after the first reviewer's run) — QC2 only, throwaway tenant `qc-cf3-rv4-*`.
//   RV4-A  H2b-3 exact Thai-midnight boundary (16:59:59.999Z / 17:00:00.000Z) incl. the positive control the builder probe lacks
//          (today's deal MUST become overdue at 00:00 Thai the next day) · atRiskDeals with an injected clock vs the board rule.
//   RV4-B  H2b-2 residual, NON-boundary case: the healer reads a gap of 1001 (setval branch, so the `< 1000` vs `<= 1000` off-by-one is
//          not involved); cashier X lands at gap 1001 (slow path, waits on the lock), cashier Y lands at gap 1000 and walks lock-free past
//          the floor ⇒ the healer's setval(floor) moves the sequence back. Healer = instrumented COPY of the 000002 body (600 ms sleep
//          after its read); X and Y = the DEPLOYED function. INFO (records REPRODUCED / not reproduced).
//   RV4-C  counterfactual for the suggested hardening: the same interleaving with a COPY whose advisory lock is taken before the
//          `f - n <= 1000` split (all three callers use that copy) ⇒ want 0 failures, 3 distinct numbers above the floor.
//   RV4-D  migration re-apply inside BEGIN … ROLLBACK (idempotent, runs as the QC2 role) · server version (hashtextextended needs ≥ 11) ·
//          two slow-path allocations of one book in ONE open transaction (re-entrant lock, no self-wait) · lock is the 1-bigint form.
//   RV4-E  INFO mechanism: a transaction that holds a row lock and then allocates on the slow path vs a healer that holds the advisory
//          lock and then wants that row ⇒ Postgres reports 40P01 (the "step 6 never waits" header in account/service.ts no longer holds).
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf3/review/rv4-review.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { readFileSync } from "node:fs";
const { fixture } = (await import("../_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };
const fx = await fixture("rv4");
const { P, chk, mkShop, done, TAG } = fx;
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
const errCode = (e: Any) => String(e?.code ?? e?.meta?.code ?? e?.message ?? e).slice(0, 80);
const deepCode = (e: Any) => {
  const s = `${e?.code ?? ""} ${e?.meta?.code ?? ""} ${e?.message ?? ""} ${JSON.stringify(e?.meta ?? {})}`;
  return /40P01|deadlock/i.test(s) ? "40P01" : errCode(e);
};
try {
  const shop = await mkShop("j", { account: true });
  A = shop.A as string;
  const tid = shop.tid as string;

  // ═════════ RV4-A · Thai-midnight boundary of CLOSE_OVERDUE ═════════
  {
    const bridges = (await import("@/lib/modules/crm/ai-bridges" as string)) as Any;
    const deals = (await import("@/lib/modules/crm/deals" as string)) as Any;
    const contacts = (await import("@/lib/modules/crm/contacts" as string)) as Any;
    const shared = (await import("@/lib/modules/crm/deals-shared" as string)) as Any;
    const c = await contacts.createContact(shop.ctx, shop.owner, { firstName: "ลูกค้า", lastName: TAG.slice(-6) });
    const contactId = c.contact?.id ?? c.id;
    const mkDeal = async (title: string, day: string) => {
      const d = await deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, stageId: shop.stages[0].id, title, contactId, expectedCloseAt: day, forecastCategory: "COMMIT" });
      await P.crmDeal.update({ where: { id: d.id }, data: { nextActivityAt: new Date("2027-06-01T03:00:00Z"), stalledAt: null } });
      return d.id as string;
    };
    const d1 = await mkDeal(`1ต.ค. ${TAG}`, "2026-10-01");
    const d30 = await mkDeal(`30ก.ย. ${TAG}`, "2026-09-30");
    const stored = new Map<string, Date>((await P.crmDeal.findMany({ where: { id: { in: [d1, d30] } }, select: { id: true, expectedCloseAt: true } })).map((r: Any) => [r.id, r.expectedCloseAt]));
    // [label, now, deal, want overdue]
    const cases: [string, string, string, boolean][] = [
      ["30Sep deal @ 23:59:59.999 TH 30 Sep", "2026-09-30T16:59:59.999Z", d30, false],
      ["30Sep deal @ 00:00:00.000 TH 1 Oct", "2026-09-30T17:00:00.000Z", d30, true],
      ["1Oct deal @ 00:00:00.000 TH 1 Oct", "2026-09-30T17:00:00.000Z", d1, false],
      ["1Oct deal @ 06:59:59 TH (old rule flipped at 07:00)", "2026-09-30T23:59:59.000Z", d1, false],
      ["1Oct deal @ 07:00:00 TH", "2026-10-01T00:00:00.000Z", d1, false],
      ["1Oct deal @ 23:59:59.999 TH 1 Oct", "2026-10-01T16:59:59.999Z", d1, false],
      ["1Oct deal @ 00:00:00.000 TH 2 Oct (positive control)", "2026-10-01T17:00:00.000Z", d1, true],
    ];
    const out: string[] = [];
    let good = true;
    for (const [label, iso, id, want] of cases) {
      const now = new Date(iso);
      const r = await bridges.atRiskDeals({ tenantId: tid, systemId: shop.S }, shop.owner, { now });
      const item = r.items.find((x: Any) => x.dealId === id);
      const got = !!item?.reasons.includes("CLOSE_OVERDUE");
      const board = (shared.dayKey(stored.get(id)) ?? "") < shared.thaiToday(now);
      const ok = got === want && got === board && !!item; // item must be present (NO_NEXT_ACTIVITY is false; so present only if a reason exists) — for want=false it may be absent
      const okAbsentAllowed = got === want && got === board;
      good = good && (want ? ok : okAbsentAllowed);
      out.push(`${label}: ${got ? "OVERDUE" : "-"} (board ${board ? "OVERDUE" : "-"})${(want ? ok : okAbsentAllowed) ? "" : " ❌"}`);
    }
    chk("RV4-A-thai-midnight-boundary", good, out.join(" | "));
  }

  // ═════════ shared setup for the allocator checks ═════════
  const bkk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date());
  const ym = `${bkk.slice(0, 4)}-${bkk.slice(5, 7)}`;
  const prefix = `RV-${ym}-`;
  const pad = (n: number) => String(n).padStart(4, "0");
  const row = (n: number, memo: string) => ({ tenantId: tid, systemId: A, docNo: `${prefix}${pad(n)}`, book: "RECEIPTS", journal: "ADJUST", date: new Date(), periodKey: ym, source: "AUTO", memo });
  const rows = [];
  for (let n = 2; n <= 1601; n += 1) rows.push(row(n, "rv4 foreign"));
  for (let i = 0; i < rows.length; i += 500) await P.accountJournalEntry.createMany({ data: rows.slice(i, i + 500) });
  await P.$queryRawUnsafe(`SELECT public.account_jno_ensure($1,'RECEIPTS')::text AS r`, A);
  const seqName = ((await P.$queryRawUnsafe(`SELECT public.account_jno_seq_name($1,'RECEIPTS') AS n`, A)) as Any[])[0].n as string;
  const floorNow = async () => Number(((await P.$queryRawUnsafe(`SELECT public.account_jno_floor($1,'RECEIPTS') AS f`, A)) as Any[])[0].f);
  const lastValue = async () => Number(((await P.$queryRawUnsafe(`SELECT last_value FROM public.${seqName}`)) as Any[])[0].last_value);
  const READ = "EXECUTE format('SELECT last_value, is_called FROM %s', r) INTO v, c;";
  const s0 = stmtOf(NEW);
  if (!s0.includes(READ)) throw new Error("read statement not found in the 000002 file");
  const H = `rv4_alloc_h_${rand}`;
  await P.$executeRawUnsafe(s0.replace("public.account_alloc_journal_no(", `public.${H}(`).replace(READ, `${READ} PERFORM pg_sleep(0.6);`));
  FNS.push(H);
  // hardened copy (suggested fix): lock before the ≤1000 / >1000 split, re-read everything under it, walk when the remaining gap ≤ 1000
  const LOCK = "PERFORM pg_advisory_xact_lock(hashtextextended('account_jno:' || public.account_jno_seq_name(p_system, p_book), 0));";
  const K = `rv4_alloc_k_${rand}`;
  const hardened = (name: string, sleepAfterRead: boolean) => `CREATE OR REPLACE FUNCTION public.${name}(p_system text, p_book text, p_prefix text, p_width int) RETURNS bigint
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE r regclass; n bigint; f bigint; v bigint; c boolean; nv bigint; i int;
BEGIN
  FOR i IN 1..8 LOOP
    r := public.account_jno_ensure(p_system, p_book);
    CONTINUE WHEN r IS NULL;
    n := nextval(r);
    IF NOT EXISTS (SELECT 1 FROM public."AccountJournalEntry" e
                   WHERE e."systemId" = p_system AND e."docNo" = p_prefix || public.account_jno_pad(n, p_width)) THEN
      RETURN n;
    END IF;
    ${LOCK}
    f := public.account_jno_floor(p_system, p_book);
    ${READ}${sleepAfterRead ? " PERFORM pg_sleep(0.6);" : ""}
    nv := CASE WHEN c THEN v + 1 ELSE v END;
    IF nv <= f THEN
      IF f - nv <= 1000 THEN
        WHILE nextval(r) < f LOOP END LOOP;
      ELSE
        PERFORM setval(r, f, true);
      END IF;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'no free number' USING ERRCODE = 'P0001';
END $$;`;
  await P.$executeRawUnsafe(hardened(K, true));
  FNS.push(K);
  const KW = `rv4_alloc_kw_${rand}`; // same hardened body without the injected sleep (the concurrent cashiers)
  await P.$executeRawUnsafe(hardened(KW, false));
  FNS.push(KW);

  const cashier = async (fn: string, startMs: number, holdMs: number) => {
    await sleep(startMs);
    const t0 = Date.now();
    try {
      return await P.$transaction(async (tx: Any) => {
        const n = Number(((await tx.$queryRawUnsafe(`SELECT public.${fn}($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n);
        const allocMs = Date.now() - t0;
        await tx.accountJournalEntry.create({ data: row(n, "rv4 cashier") });
        await sleep(holdMs);
        return { fn, n, err: "", allocMs };
      }, { maxWait: 60_000, timeout: 60_000 });
    } catch (e) {
      return { fn, n: -1, err: errCode(e), allocMs: Date.now() - t0 };
    }
  };
  const fmt = (x: Any) => (x.err ? `FAILED ${x.err}` : `${x.n} (${x.allocMs} ms)`);

  // ═════════ RV4-B · non-boundary residual (gap 1001 at the healer's read; one waiter + one walker) ═════════
  {
    const f0 = await floorNow();
    await P.$queryRawUnsafe(`SELECT setval('public.${seqName}', ${f0 - 1003}, true)`); // healer nextval = f0-1002 (gap 1002) · reads nv = f0-1001 (gap 1001)
    const [h, x, y] = await Promise.all([cashier(H, 0, 300), cashier("account_alloc_journal_no", 150, 300), cashier("account_alloc_journal_no", 300, 1500)]);
    const ns = [h, x, y].filter((q) => !q.err).map((q) => q.n);
    const bad = [h, x, y].some((q) => q.err) || ns.length !== new Set(ns).size;
    chk("RV4-B-nonboundary-residual", true,
      `INFO ${bad ? "REPRODUCED" : "not reproduced"} · floor ${f0} · healer(copy of 000002, 600 ms after its read, reads gap 1001 ⇒ setval branch) → ${fmt(h)} · X(deployed, +150 ms, gap 1001 ⇒ waits on the lock) → ${fmt(x)} · Y(deployed, +300 ms, gap 1000 ⇒ walks lock-free) → ${fmt(y)} · last_value after ${await lastValue()}`);
  }
  // ═════════ RV4-C · same interleaving, hardened copy for all three ⇒ no failure ═════════
  {
    const f0 = await floorNow();
    await P.$queryRawUnsafe(`SELECT setval('public.${seqName}', ${f0 - 1003}, true)`);
    // need the block dense again right below the new floor: the gap is f0-1002 … f0 (all taken: block 2..1601 + previous cashiers' rows)
    const [h, x, y] = await Promise.all([cashier(K, 0, 300), cashier(KW, 150, 300), cashier(KW, 300, 300)]);
    const ns = [h, x, y].filter((q) => !q.err).map((q) => q.n);
    const ok = ns.length === 3 && new Set(ns).size === 3 && ns.every((n) => n > f0);
    chk("RV4-C-hardened-counterfactual", ok,
      `floor ${f0} · healer(hardened copy, 600 ms window) → ${fmt(h)} · X(hardened, +150 ms) → ${fmt(x)} · Y(hardened, +300 ms, gap 1000 — now waits instead of walking) → ${fmt(y)} (want 3 distinct > floor, 0 failures)`);
  }

  // ═════════ RV4-D · re-apply idempotent · version · two slow-path calls in one open transaction · lock form ═════════
  {
    const ver = ((await P.$queryRawUnsafe(`SELECT current_setting('server_version_num')::int AS v, current_user AS u`)) as Any[])[0];
    const file = readFileSync(NEW, "utf8");
    let reapply = "ok";
    try {
      await P.$transaction(async (tx: Any) => {
        await tx.$executeRawUnsafe(file);
        await tx.$executeRawUnsafe(file);
        throw new Error("__rollback__");
      });
    } catch (e) {
      if (String((e as Error)?.message) !== "__rollback__") reapply = errCode(e);
    }
    const s = stmtOf(NEW);
    const body = s.slice(s.indexOf("AS $$") + 5, s.lastIndexOf("$$;"));
    const still = ((await P.$queryRawUnsafe(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND proname='account_alloc_journal_no'`)) as Any[]);
    // two slow-path allocations in ONE transaction: reset the sequence under the block twice
    const f0 = await floorNow();
    let twice = "";
    try {
      twice = await P.$transaction(async (tx: Any) => {
        await tx.$queryRawUnsafe(`SELECT setval('public.${seqName}', 1, true)`);
        const a = Number(((await tx.$queryRawUnsafe(`SELECT public.account_alloc_journal_no($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n);
        await tx.accountJournalEntry.create({ data: row(a, "rv4 same-tx 1") });
        await tx.$queryRawUnsafe(`SELECT setval('public.${seqName}', 1, true)`);
        const b = Number(((await tx.$queryRawUnsafe(`SELECT public.account_alloc_journal_no($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n);
        await tx.accountJournalEntry.create({ data: row(b, "rv4 same-tx 2") });
        const lk = ((await tx.$queryRawUnsafe(`SELECT count(*)::int AS n, min(objsubid)::int AS sub FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory'`)) as Any[])[0];
        return `${a},${b} · advisory lock rows ${lk.n} (objsubid ${lk.sub} = 1-bigint form)`;
      }, { timeout: 30_000 });
    } catch (e) {
      twice = `FAILED ${errCode(e)}`;
    }
    const okTwice = /^\d+,\d+ · advisory lock rows 1 \(objsubid 1/.test(twice) && (() => { const [a, b] = twice.split(" ")[0]!.split(",").map(Number); return a! > f0 && b! > a!; })();
    chk("RV4-D-reapply-version-sametx", reapply === "ok" && ver.v >= 110000 && still.length === 1 && still[0].prosrc === body && okTwice,
      `server_version_num ${ver.v} · role ${ver.u} · file applied twice inside BEGIN…ROLLBACK → ${reapply} · deployed body still == file ${still.length === 1 && still[0].prosrc === body} · two slow-path allocations in one transaction (floor ${f0}) → ${twice}`);
  }

  // ═════════ RV4-E · INFO mechanism: row lock → slow-path allocation vs healer (advisory) → same row ⇒ 40P01 ═════════
  {
    await P.$queryRawUnsafe(`SELECT setval('public.${seqName}', 1, true)`);
    const healer = (async () => {
      try {
        return await P.$transaction(async (tx: Any) => {
          const n = Number(((await tx.$queryRawUnsafe(`SELECT public.account_alloc_journal_no($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n); // heals ⇒ holds the advisory lock
          await tx.accountJournalEntry.create({ data: row(n, "rv4 E healer") });
          await sleep(500);
          await tx.$queryRawUnsafe(`SELECT id FROM "AppSystem" WHERE id = $1 FOR UPDATE`, A); // later step wants a row the other one holds
          return `ok ${n}`;
        }, { timeout: 30_000 });
      } catch (e) {
        return `FAILED ${deepCode(e)}`;
      }
    })();
    const holder = (async () => {
      await sleep(200);
      try {
        return await P.$transaction(async (tx: Any) => {
          await tx.$queryRawUnsafe(`SELECT id FROM "AppSystem" WHERE id = $1 FOR UPDATE`, A); // e.g. a counter row held across the posting
          await tx.$queryRawUnsafe(`SELECT setval('public.${seqName}', 1, true)`); // its own number lands in the block ⇒ slow path ⇒ waits on the healer
          const n = Number(((await tx.$queryRawUnsafe(`SELECT public.account_alloc_journal_no($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n);
          await tx.accountJournalEntry.create({ data: row(n, "rv4 E holder") });
          return `ok ${n}`;
        }, { timeout: 30_000 });
      } catch (e) {
        return `FAILED ${deepCode(e)}`;
      }
    })();
    const [h, o] = await Promise.all([healer, holder]);
    chk("RV4-E-step6-wait-cycle", true,
      `INFO ${/40P01/.test(`${h} ${o}`) ? "DEADLOCK DETECTED (40P01)" : "no deadlock"} · healer (advisory lock, then the row) → ${h} · holder (the row, then a slow-path allocation) → ${o}`);
  }
} catch (e) {
  chk("RV4-ERR", false, String((e as Error)?.stack ?? e).slice(0, 700));
} finally {
  await done("rv4-review", async () => {
    for (const f of FNS) await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.${f}(text, text, text, int)`);
    if (A) await P.$queryRawUnsafe(`SELECT public.account_jno_drop($1)::text AS x`, A).catch(() => undefined);
    const fnLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE 'rv4_alloc_%'`)) as Any[])[0].n);
    const seqLeft = A ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind = 'S' AND relname LIKE 'acc_jno_' || $1 || '_%'`, A)) as Any[])[0].n) : 0;
    const s = stmtOf(NEW);
    const body = s.slice(s.indexOf("AS $$") + 5, s.lastIndexOf("$$;"));
    const d = ((await P.$queryRawUnsafe(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND proname = 'account_alloc_journal_no'`)) as Any[]);
    chk("RV4-CLEAN", fnLeft === 0 && seqLeft === 0 && d.length === 1 && d[0].prosrc === body,
      `copies left ${fnLeft} · journal sequences left ${seqLeft} · deployed account_alloc_journal_no still == 000002 file: ${d.length === 1 && d[0].prosrc === body}`);
  });
}
