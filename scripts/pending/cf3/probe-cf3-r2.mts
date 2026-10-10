// C5.5-fix3a ROUND 2 probe (builder) — review F1: the allocator's walk path (taken number ≤ 1000 below the floor) ran lock-free in 000002,
//   so a walker could pass the floor between a locked healer's read and its setval(floor) ⇒ the sequence moved back. 000003 takes the
//   advisory lock before the ≤ 1000 / > 1000 split. QC2 only · throwaway tenant `qc-cf3-r2-*` (swept by the fixture) · own function copies
//   cf3r2_alloc_* (dropped) · the system's journal sequences (dropped).
//   R2-DEPLOYED     QC2's account_alloc_journal_no = the 000003 body byte-for-byte · metadata (owner/acl/config/volatility/secdef) like its
//                   sibling account_peek_journal_no · 000002's stored checksum still = sha256 of its file (not edited) · 000003 row finished.
//   R2-WAITS-*      deterministic: another transaction holds the (system, book) advisory lock; the DEPLOYED function, whose first number is
//                   taken g below the floor, must wait (lock_timeout 300 ms ⇒ 55P03) for g = 1, 500, 1000, 1001 and floor-2 and must NOT have moved
//                   the sequence past its one nextval · a free number returns at once (fast path lock-free) · positive control: a copy of the
//                   000002 body returns at once for g = 500 and 1000 (walks lock-free) — the check discriminates.
//   R2-RV3A-*       the reviewer's RV3-A interleaving (healer reads a gap of exactly 1000 · one cashier lands at gap 1000):
//                   ctrl = 000002 copies (must reproduce) · v2 = healer is a copy of the INSTALLED body with the 600 ms window, cashier the
//                   DEPLOYED function · mixed = 000002 healer copy + DEPLOYED cashier (the reviewer's exact set-up) — v2 and mixed ×3 each.
//   R2-RV4B-*       the reviewer's RV4-B interleaving (healer reads gap 1001 · X at gap 1001 · Y at gap 1000): same ctrl / v2 / mixed.
//                   Every round samples the sequence every ~15 ms from another session: "backwards" = a sample whose next value is lower than
//                   the previous sample's. Pass = 0 failures, distinct numbers, all above the floor, 0 backwards moves.
//   R2-REAPPLY      the 000003 file applied twice inside BEGIN … ROLLBACK (idempotent, runs as the QC2 role).
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf3/probe-cf3-r2.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };
const fx = await fixture("r2");
const { P, chk, mkShop, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
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
const bodyOf = (file: string) => { const s = stmtOf(file); const i = s.indexOf("AS $$"); return i < 0 ? "" : s.slice(i + 5, s.lastIndexOf("$$;")); };
const errText = (e: Any) => `${e?.code ?? ""} ${e?.meta?.code ?? ""} ${e?.message ?? e} ${j(e?.meta ?? {})}`;
const errCode = (e: Any) => {
  const s = errText(e);
  if (/55P03|lock timeout|canceling statement due to lock timeout/i.test(s)) return "55P03";
  if (/40P01|deadlock/i.test(s)) return "40P01";
  return String(e?.code ?? e?.meta?.code ?? e?.message ?? e).slice(0, 80);
};
const READ = "EXECUTE format('SELECT last_value, is_called FROM %s', r) INTO v, c;";
const HDR = (name: string) => `CREATE OR REPLACE FUNCTION public.${name}(p_system text, p_book text, p_prefix text, p_width int) RETURNS bigint
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$`;

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
  for (let n = 2; n <= 1601; n += 1) rows.push(row(n, "cf3r2 foreign"));
  for (let i = 0; i < rows.length; i += 500) await P.accountJournalEntry.createMany({ data: rows.slice(i, i + 500) });
  await P.$queryRawUnsafe(`SELECT public.account_jno_ensure($1,'RECEIPTS')::text AS r`, A);
  const seqName = ((await P.$queryRawUnsafe(`SELECT public.account_jno_seq_name($1,'RECEIPTS') AS n`, A)) as Any[])[0].n as string;
  const floorNow = async () => Number(((await P.$queryRawUnsafe(`SELECT public.account_jno_floor($1,'RECEIPTS') AS f`, A)) as Any[])[0].f);
  const seqState = async () => {
    const r = ((await P.$queryRawUnsafe(`SELECT last_value, is_called FROM public.${seqName}`)) as Any[])[0];
    return { last: Number(r.last_value), next: Number(r.last_value) + (r.is_called ? 1 : 0) };
  };
  const setSeq = (v: number) => P.$queryRawUnsafe(`SELECT setval('public.${seqName}', ${v}, true)`);

  // ═════════ R2-DEPLOYED ═════════
  const meta = (await P.$queryRawUnsafe(`SELECT p.proname, p.prosrc, p.proconfig, p.provolatile::text AS provolatile, p.prosecdef, p.prorettype::regtype::text AS rt,
      pg_get_function_identity_arguments(p.oid) AS args, pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('account_alloc_journal_no','account_peek_journal_no')`)) as Any[];
  const d = meta.filter((m) => m.proname === "account_alloc_journal_no");
  const sib = meta.find((m) => m.proname === "account_peek_journal_no");
  const installed = String(d[0]?.prosrc ?? "");
  const v2Body = bodyOf(V2);
  const mig = (await P.$queryRawUnsafe(`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name IN ('20261104000002_account_journal_no_alloc_lock','20261104000003_account_journal_no_alloc_lock_v2') ORDER BY 1`)) as Any[];
  const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
  const m2 = mig.find((m) => m.migration_name.startsWith("20261104000002"));
  const m3 = mig.find((m) => m.migration_name.startsWith("20261104000003"));
  chk("R2-DEPLOYED",
    d.length === 1 && !!v2Body && installed === v2Body && j(d[0].proconfig) === j(["search_path=pg_catalog, public"]) && d[0].provolatile === "v" && d[0].prosecdef === false &&
      d[0].rt === "bigint" && d[0].args === "p_system text, p_book text, p_prefix text, p_width integer" && d[0].owner === sib?.owner && d[0].acl === sib?.acl &&
      !!m2?.finished_at && m2?.checksum === sha(V1) && !!m3?.finished_at && !m3?.rolled_back_at && m3?.checksum === sha(V2),
    `prosrc == 000003 body ${installed === v2Body} · config ${j(d[0]?.proconfig)} · volatile ${d[0]?.provolatile} · secdef ${d[0]?.prosecdef} · returns ${d[0]?.rt} · owner ${d[0]?.owner} (sibling ${sib?.owner}) · acl ${d[0]?.acl} (sibling ${sib?.acl}) · 000002 row finished ${!!m2?.finished_at}, checksum = sha256(file) ${m2?.checksum === sha(V1)} · 000003 row finished ${!!m3?.finished_at}, checksum = sha256(file) ${m3?.checksum === sha(V2)}`);
  if (installed !== v2Body || !installed.includes(READ)) throw new Error("QC2 does not run the 000003 body — stop (apply the migration first)");

  // copies: H2 = the INSTALLED body + 600 ms after its read (healer) · H1 = 000002 body + 600 ms (both + 200 ms after a setval) · W1 = 000002 body (lock-free walker)
  const H2 = `cf3r2_alloc_h2_${rand}`, H1 = `cf3r2_alloc_h1_${rand}`, W1 = `cf3r2_alloc_w1_${rand}`;
  // healers also sleep 200 ms right after a setval, so a backwards move stays visible to the ~15 ms sampler (it is only a window, no logic change)
  const SETVAL = "PERFORM setval(r, f, true);";
  const instr = (b: string) => b.replace(READ, `${READ} PERFORM pg_sleep(0.6);`).replace(SETVAL, `${SETVAL} PERFORM pg_sleep(0.2);`);
  if (!installed.includes(SETVAL)) throw new Error("setval statement not found in the installed body");
  await P.$executeRawUnsafe(`${HDR(H2)}${instr(installed)}$fn$;`);
  FNS.push(H2);
  const b1 = bodyOf(V1);
  if (!b1.includes(READ)) throw new Error("read statement not found in the 000002 file");
  await P.$executeRawUnsafe(`${HDR(H1)}${instr(b1)}$fn$;`);
  FNS.push(H1);
  await P.$executeRawUnsafe(`${HDR(W1)}${b1}$fn$;`);
  FNS.push(W1);
  const DEP = "account_alloc_journal_no";

  // ═════════ R2-WAITS · deterministic: the lock is held elsewhere; a taken number below the floor must wait ═════════
  {
    const f0 = await floorNow();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let held = false;
    const holder = P.$transaction(async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended('account_jno:' || $1, 0))::text AS x`, seqName);
      held = true;
      await gate;
    }, { maxWait: 20_000, timeout: 60_000 });
    for (let k = 0; k < 100 && !held; k += 1) await sleep(20);
    const tryAlloc = async (fn: string, gap: number | "free") => {
      if (gap === "free") await setSeq(f0); else await setSeq(f0 - gap - 1); // first nextval = f0 - gap (taken, `gap` below the floor)
      const t0 = Date.now();
      let out = "";
      try {
        const n = await P.$transaction(async (tx: Any) => {
          await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '300ms'`);
          return Number(((await tx.$queryRawUnsafe(`SELECT public.${fn}($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n);
        }, { maxWait: 20_000, timeout: 20_000 });
        out = `returned ${n}`;
      } catch (e) {
        out = `FAILED ${errCode(e)}`;
      }
      const s = await seqState();
      return { out, ms: Date.now() - t0, next: s.next, gap };
    };
    const dep: Any[] = [];
    for (const g of [1, 500, 1000, 1001, f0 - 2]) dep.push(await tryAlloc(DEP, g)); // f0 - 2 = first number of the foreign block
    const free = await tryAlloc(DEP, "free");
    const old500 = await tryAlloc(W1, 500);
    const old1000 = await tryAlloc(W1, 1000);
    release();
    await holder.catch(() => undefined);
    const fmt = (x: Any) => `gap ${x.gap}: ${x.out} in ${x.ms} ms, next value after ${x.next}`;
    // waited = 55P03 AND the sequence advanced by its one nextval only (next = f0 - gap + 1)
    const waitedOk = dep.every((x) => x.out === "FAILED 55P03" && x.next === f0 - x.gap + 1);
    chk("R2-WAITS-deployed", held && waitedOk,
      `lock held by another transaction ${held} · floor ${f0} · DEPLOYED, first number taken: ${dep.map(fmt).join(" · ")} (want every one 55P03 and the sequence moved by its single nextval only)`);
    chk("R2-WAITS-fast-path-free", /^returned \d+$/.test(free.out) && Number(free.out.split(" ")[1]) === f0 + 1 && free.ms < 1000,
      `DEPLOYED, free number while the lock is held elsewhere: ${fmt(free)} (want ${f0 + 1}, no wait)`);
    chk("R2-WAITS-positive-control-000002", /^returned \d+$/.test(old500.out) && /^returned \d+$/.test(old1000.out),
      `copy of the 000002 body under the same held lock: ${fmt(old500)} · ${fmt(old1000)} (want both returned at once = walked lock-free; shows the check above discriminates)`);
    // the two control allocations left the sequence above the floor; rows were not inserted, so the floor is unchanged
  }

  // ═════════ interleavings ═════════
  const cashier = async (fn: string, startMs: number, holdMs: number) => {
    await sleep(startMs);
    const t0 = Date.now();
    try {
      return await P.$transaction(async (tx: Any) => {
        const n = Number(((await tx.$queryRawUnsafe(`SELECT public.${fn}($1,'RECEIPTS',$2,4) AS n`, A, prefix)) as Any[])[0].n);
        const allocMs = Date.now() - t0;
        await tx.accountJournalEntry.create({ data: row(n, "cf3r2 cashier") });
        await sleep(holdMs);
        return { fn, n, err: "", allocMs };
      }, { maxWait: 60_000, timeout: 60_000 });
    } catch (e) {
      return { fn, n: -1, err: errCode(e), allocMs: Date.now() - t0 };
    }
  };
  const sampled = async <T,>(work: () => Promise<T>) => {
    const s: number[] = [];
    let stop = false;
    const loop = (async () => { while (!stop) { s.push((await seqState()).next); await sleep(15); } })();
    try { return { r: await work(), s }; } finally { stop = true; await loop; s.push((await seqState()).next); }
  };
  const backwards = (s: number[]) => { let k = 0; for (let i = 1; i < s.length; i += 1) if (s[i]! < s[i - 1]!) k += 1; return k; };
  const name = (fn: string) => (fn === DEP ? "deployed" : fn === H2 ? "installed-copy+600ms" : fn === H1 ? "000002-copy+600ms" : fn === W1 ? "000002-copy" : fn);
  const fmt = (x: Any) => `${name(x.fn)} → ${x.err ? `FAILED ${x.err}` : `${x.n} (${x.allocMs} ms)`}`;
  type Res = { bad: boolean; text: string };
  const judge = (f0: number, xs: Any[], s: number[]): Res => {
    const ns = xs.filter((q) => !q.err).map((q) => q.n);
    const fails = xs.filter((q) => q.err).length;
    const back = backwards(s);
    const bad = fails > 0 || ns.length !== new Set(ns).size || ns.some((n) => n <= f0) || back > 0;
    return { bad, text: `floor ${f0} · ${xs.map(fmt).join(" · ")} · failures ${fails} · backwards moves ${back} (${s.length} samples)` };
  };
  const rv3a = async (healer: string, walker: string): Promise<Res> => {
    const f0 = await floorNow();
    await setSeq(f0 - 1002); // healer's nextval = f0-1001 (taken) · reads nv = f0-1000 (gap exactly 1000) · the walker's nextval = f0-1000
    const { r, s } = await sampled(() => Promise.all([cashier(healer, 0, 300), cashier(walker, 200, 1500)]));
    return judge(f0, r, s);
  };
  const rv4b = async (healer: string, walker: string): Promise<Res> => {
    const f0 = await floorNow();
    await setSeq(f0 - 1003); // healer reads gap 1001 · X lands at gap 1001 · Y lands at gap 1000
    const { r, s } = await sampled(() => Promise.all([cashier(healer, 0, 300), cashier(walker, 150, 300), cashier(walker, 300, 1500)]));
    return judge(f0, r, s);
  };
  const series = async (id: string, f: () => Promise<Res>, times: number, wantBad: boolean) => {
    const out: Res[] = [];
    for (let k = 0; k < times; k += 1) out.push(await f());
    const ok = wantBad ? out.every((x) => x.bad) : out.every((x) => !x.bad);
    chk(id, ok, `${wantBad ? "positive control, want REPRODUCED" : "want 0 failures · distinct · above the floor · 0 backwards"} · ${out.map((x, i) => `#${i + 1} ${x.bad ? "REPRODUCED" : "clean"}: ${x.text}`).join(" ‖ ")}`);
  };
  await series("R2-RV3A-ctrl-000002", () => rv3a(H1, W1), 1, true);
  await series("R2-RV3A-v2", () => rv3a(H2, DEP), 3, false);
  await series("R2-RV3A-mixed", () => rv3a(H1, DEP), 3, false);
  await series("R2-RV4B-ctrl-000002", () => rv4b(H1, W1), 1, true);
  await series("R2-RV4B-v2", () => rv4b(H2, DEP), 3, false);
  await series("R2-RV4B-mixed", () => rv4b(H1, DEP), 3, false);

  // ═════════ R2-REAPPLY ═════════
  {
    const file = readFileSync(V2, "utf8");
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
    const after = ((await P.$queryRawUnsafe(`SELECT p.prosrc, pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND proname='account_alloc_journal_no'`)) as Any[]);
    const who = ((await P.$queryRawUnsafe(`SELECT current_user AS u`)) as Any[])[0].u;
    chk("R2-REAPPLY", reapply === "ok" && after.length === 1 && after[0].prosrc === v2Body && after[0].owner === d[0].owner && after[0].acl === d[0].acl && j(after[0].proconfig) === j(d[0].proconfig),
      `000003 file applied twice inside BEGIN…ROLLBACK as ${who} → ${reapply} · afterwards one function, body == 000003 ${after[0]?.prosrc === v2Body}, owner ${after[0]?.owner}, acl unchanged ${after[0]?.acl === d[0].acl}`);
  }
} catch (e) {
  chk("R2-ERR", false, String((e as Error)?.stack ?? e).slice(0, 700));
} finally {
  await done("probe-cf3-r2", async () => {
    for (const f of FNS) await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.${f}(text, text, text, int)`);
    if (A) await P.$queryRawUnsafe(`SELECT public.account_jno_drop($1)::text AS x`, A).catch(() => undefined);
    const fnLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE 'cf3r2_alloc_%'`)) as Any[])[0].n);
    const seqLeft = A ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind = 'S' AND relname LIKE 'acc_jno_' || $1 || '_%'`, A)) as Any[])[0].n) : 0;
    const dd = ((await P.$queryRawUnsafe(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND proname = 'account_alloc_journal_no'`)) as Any[]);
    chk("R2-CLEAN", fnLeft === 0 && seqLeft === 0 && dd.length === 1 && dd[0].prosrc === bodyOf(V2),
      `copies left ${fnLeft} · journal sequences left ${seqLeft} · deployed account_alloc_journal_no still == 000003 file: ${dd.length === 1 && dd[0].prosrc === bodyOf(V2)}`);
  });
}
