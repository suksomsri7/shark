// QC — HR V2 · fix ticket HR-PREPROD-1 · delta review (rulings V1b · V8c + year-job carry trigger) · third suite file, shares qc-hr-preprod-1-lib.mts
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-preprod-1c.mts  (--list)
// Registry base = d048c9d48 (RED there: V8d.1–V8d.3) · own tenants qc-hr-pp1-*-{c,d} · base 3,000,000 st, N 480 ⇒ 100,000 st per unpaid day, 10,000 per unpaid tenth
import { type Any, type Base, short, errText, failedKeys, canon, makeRegistry } from "./qc-hr-lib.mjs";
import { setupPP1, bk, dd } from "./qc-hr-preprod-1-lib.mjs";

const SUITE = "qc-hr-preprod-1c";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SEV: Record<string, "CRITICAL" | "MAJOR" | "MINOR"> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
Z0|house|C|G|own law rows: none before · 3 inserted
V1b.1|V1b|C|G|10–14 Mar paid 2.0 / unpaid 3.0, then 13 Mar becomes a holiday (roster removed) ⇒ counted 10,11,12,14 · UNPAID_LEAVE 12 + 14 = −200,000 · split 2 / 2 from 12 Mar (reader + DTO) · ledger untouched
V1b.2|V1b|C|G|27.3 used, 10–14 Mar paid 2.7 / unpaid 2.3, roster of 13 Mar removed ⇒ 12 Mar 0.3 unpaid (−30,000) + 14 Mar (−100,000) = −130,000 · split 2.7 / 1.3 · ledger untouched
V1b.3|V1b|C|G|day off 12 Mar inside 10–14 Mar (4.0 counted, paid 2 / unpaid 2) becomes a working day ⇒ paid stays Σ USE 2.0 (10, 11) · unpaid 12–14 = −300,000 · split 2 / 3 · ledger untouched
V8c.1|V8c|C|G|v2 run reversed (no-book path): March approved −300,000 · January revoked (March skipped) · reverse ⇒ appended USE −3.0 'resplit;unpaid:0.0' · Σ 25.0 · re-run no UNPAID_LEAVE
V8c.2|V8c|C|G|leave 27 Feb–3 Mar spanning APPROVED Feb: January revoked ⇒ untouched (control) · Feb run reversed ⇒ appended −3.0 'resplit;unpaid:0.0' · Σ 25.0
V8c.3|V8c|C|G|engine v1 run with JV reversed (reverseRun path) ⇒ March leave re-split (appended −3.0 'resplit;unpaid:0.0') · Σ 25.0
V8c.4|V8c|M|G|year job writes carry +5.0 into 2031 ⇒ March 0/5 leave re-split (appended −5.0 'resplit;unpaid:0.0') · Σ 2031 0.0
V8c.5|V8c|C|G|v2 booked run reversed (H3.7 book path) ⇒ March leave re-split (appended −3.0 'resplit;unpaid:0.0') · Σ 25.0 · re-run no UNPAID_LEAVE
V1b.4|V1b|m|G|(accepted, debt) surplus: fully paid 10–14 Mar (USE −5.0), 13 Mar becomes a holiday ⇒ all remaining days paid · unpaid 0 · no UNPAID_LEAVE · ledger unchanged
V8d.1|V8d|C|R|missed re-split (employee not in the reversed run) ⇒ creating the March v2 draft re-splits first (appended −3.0 'resplit;unpaid:0.0') · draft has no UNPAID_LEAVE for that employee
V8d.2|V8d|C|R|same through recompute of an existing draft
V8d.3|V8d|M|R|idempotent: second recompute and delete + re-create append no ledger row · still no UNPAID_LEAVE
V8d.4|V8d|M|G|a leave with a day in APPROVED Feb stays untouched by the March draft (single USE row) · draft deducts Mar 1–3 = −300,000
Z1|house|C|G|no residue
Z2|house|M|G|no deadlock
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`PP1C-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, finish } = makeRegistry(SUITE, "PP1C-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
if (!process.env.DATABASE_URL) {
  console.log("🔴 DATABASE_URL unset — refusing to run (use scripts/qc-hr.sh)");
  process.exit(finish({ forced: FORCE, crashed: "DATABASE_URL unset", missing: [] }));
}
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const { installNetGuard } = (await import("./qc-hr-h4.3-lib.mjs")) as Any;
installNetGuard();
const S = await setupPP1(SUITE);
const { P, tag, rows, safe, linesOf } = S;
const imp = async (s: string) => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const LV = await imp("@/lib/modules/hr/leave"), SV = await imp("@/lib/modules/hr/service"), JG = await imp("@/lib/modules/hr/judge"), PV = await imp("@/lib/modules/hr/privacy");
for (const [k, m] of Object.entries({ LV, SV, JG, PV })) if (m?.__err) console.log(`  ⚠ import ${k}: ${m.__err}`);
const deadlocks = async () => Number((await rows(`SELECT deadlocks::bigint AS n FROM pg_stat_database WHERE datname = current_database()`))[0]?.n ?? -1);
const num = (v: unknown) => Number(String(v));
const tot = (xs: string[]) => xs.reduce((t, x) => t + Number(x.split(":")[1]!.split("@")[0]), 0);
const MAR = ["2031-03-10", "2031-03-11", "2031-03-12", "2031-03-13", "2031-03-14"];
let crashed = "";
const section = async (name: string, f: () => Promise<void>) => {
  try {
    await f();
  } catch (e) {
    crashed ||= `${name}: ${errText(e)}`;
    console.log(`CRASH ${name} ${errText(e)} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
  }
};
let polN = 0;
function kitL(K: Any) {
  const TT = K.TT;
  const pol = async (s: string, carry = 0) => (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category: "SICK", name: `SICK ${++polN} ${tag}`, paid: true, quotaDays: 30, carryMaxDays: carry, allowHalfDay: true } })).id as string;
  const txn = (s: string, e: string, p: string, kind: string, days: string, year: number, eff: string, key: string, leaveId: string | null = null) =>
    P.hrLeaveBalanceTxn.create({ data: { tenantId: TT, systemId: s, employeeId: e, policyId: p, kind, days, leaveYear: year, effectiveDate: dd(eff), sourceKey: key, leaveId } });
  const leaveRow = async (s: string, e: string, from: string, to: string, p: string, days: string) =>
    (await P.hrLeave.create({ data: { tenantId: TT, systemId: s, employeeId: e, type: "SICK", fromDate: dd(from), toDate: dd(to), status: "APPROVED", policyId: p, days, reason: `qc ${tag}` } })).id as string;
  /** GRANT 2031 30.0 + one approved January leave of `used` days · returns that leave id */
  const used = async (s: string, e: string, p: string, d: string) => {
    await txn(s, e, p, "GRANT", "30.0", 2031, "2031-01-01", `grant:${e}:${p}:2031`);
    const l = await leaveRow(s, e, "2031-01-02", "2031-01-31", p, d);
    await txn(s, e, p, "USE", `-${d}`, 2031, "2031-01-02", `use:${l}`, l);
    return l;
  };
  const reqDec = async (s: string, e: string, from: string, to: string, p: string) => {
    const r = await safe(() => SV.requestLeave(K.c(s), { employeeId: e, type: "SICK", fromDate: from, toDate: to, reason: "qc ป่วย", actorUserId: K.U.owner.id, policyId: p }));
    const d = r?.id ? await dec(s, r.id) : r;
    return { id: (r?.id ?? "") as string, d };
  };
  const dec = (s: string, id: string, to = "APPROVED", from = "PENDING") => safe(() => SV.decideLeave(K.c(s), id, to, K.U.pay1.id, { from }).then(() => ({ ok: true })));
  const uses = async (id: string) => ((await rows(`SELECT days::text AS d, note FROM "HrLeaveBalanceTxn" WHERE "leaveId" = $1 AND kind::text = 'USE' ORDER BY "createdAt", id`, id)) as Any[]).map((u) => `${num(u.d)}|${u.note}`);
  const ledger = async (s: string) => canon(await rows(`SELECT * FROM "HrLeaveBalanceTxn" WHERE "systemId" = $1 ORDER BY id`, s));
  const sum = async (e: string, p: string, y = 2031) => num((await rows(`SELECT COALESCE(SUM(days), 0)::text AS n FROM "HrLeaveBalanceTxn" WHERE "employeeId" = $1 AND "policyId" = $2 AND "leaveYear" = $3`, e, p, y))[0]?.n);
  const split = async (s: string, id: string) => ((await safe(() => LV.leaveSplitOf(K.c(s), [id]))) ?? {})[id] as Any;
  const dto = async (s: string, id: string) => { const x = await safe(() => PV.leaveItemsForViewer(K.c(s), { ...K.V.owner, userId: K.U.owner.id })); return [...(x?.history ?? []), ...(x?.pending ?? [])].find((i: Any) => i?.id === id); };
  const roster = async (s: string, sh: string, e: string, days: string[]) => { for (const d of days) await K.roster(s, sh, e, d); };
  const judge = async () => { for (const d of ["2031-03-15", "2031-03-22", "2031-03-29", "2031-04-05"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT })); };
  const unpaid = async (runId: string | undefined, e: string) => (runId ? await linesOf(runId, e) : []).filter((x) => x.startsWith("UNPAID_LEAVE:")).sort();
  const blockers = async (s: string) => (await rows(`SELECT e.code, d.date::text AS d, d.review FROM "HrWorkDay" d JOIN "HrEmployee" e ON e.id = d."employeeId" WHERE d."systemId" = $1 AND cardinality(d.review) > 0 LIMIT 8`, s).catch(() => [])) as Any[];
  return { pol, txn, leaveRow, used, reqDec, dec, uses, ledger, sum, split, dto, roster, judge, unpaid, blockers };
}

const dl0 = await deadlocks();
try {
  ck("Z0", { none: S.lawPresent === 0, inserted: S.lawOk }, "0 present · 3 inserted", `present=${S.lawPresent}`);
  const KC = await S.kit("c", "recount");
  const KD = await S.kit("d", "v1 book");
  const L = kitL(KC);

  // ── V1b: split anchored on Σ USE, walked over the currently counted days ──
  await section("V1b", async () => {
    const sA = await KC.sys("วันหยุดในใบลา-A"), pA = await L.pol(sA), shA = await KC.shift(sA);
    const sB = await KC.sys("นับวันใหม่-B"), pB = await L.pol(sB), shB = await KC.shift(sB);
    const A2 = await KC.emp(sA, "WA2");
    const A = await KC.emp(sA, "WA"), [B, C] = [await KC.emp(sB, "WB"), await KC.emp(sB, "WC")];
    await L.used(sA, A, pA, "28.0");
    await L.txn(sB, B, pB, "GRANT", "30.0", 2031, "2031-01-01", `grant:${B}:${pB}:2031`);
    for (const [from, to, d] of [["2031-01-02", "2031-01-31", "27.0"], ["2031-02-03", "2031-02-03", "0.3"]] as const) { const l = await L.leaveRow(sB, B, from, to, pB, d); await L.txn(sB, B, pB, "USE", `-${d}`, 2031, from, `use:${l}`, l); }
    await L.used(sB, C, pB, "28.0");
    await L.roster(sA, shA, A, MAR);
    await L.roster(sA, shA, A2, MAR);
    await L.roster(sB, shB, B, MAR);
    await L.roster(sB, shB, C, ["2031-03-10", "2031-03-11", "2031-03-13", "2031-03-14"]); // 12 Mar = day off in a rostered week
    const [a, b, cc] = [await L.reqDec(sA, A, MAR[0]!, MAR[4]!, pA), await L.reqDec(sB, B, MAR[0]!, MAR[4]!, pB), await L.reqDec(sB, C, MAR[0]!, MAR[4]!, pB)];
    const a2 = await L.reqDec(sA, A2, MAR[0]!, MAR[4]!, pA);
    const u0 = [await L.uses(a.id), await L.uses(b.id), await L.uses(cc.id)];
    const setup = [a, b, cc].every((x) => x.d?.ok === true) && canon(u0) === canon([["-2|unpaid:3.0;from:2031-03-12"], ["-2.7|unpaid:2.3;from:2031-03-12"], ["-2|unpaid:2.0;from:2031-03-13"]]);
    if (!setup) console.log(`  ⚠ setup V1b: ${short({ u0, d: [a, b, cc].map((x) => x.d?.reason ?? x.d?.ok) }, 300)}`);
    const [gA, gB] = [await L.ledger(sA), await L.ledger(sB)];
    // after approval: 13 Mar holiday + roster removed (A) · roster of 13 removed (B) · roster added on 12 (C) — then judge
    await P.hrHoliday.create({ data: { tenantId: KC.TT, systemId: sA, unitId: null, date: dd("2031-03-13"), name: `วันหยุด qc ${tag}`, kind: "SHOP" } });
    await P.hrRosterEntry.deleteMany({ where: { employeeId: { in: [A, A2, B] }, date: dd("2031-03-13") } });
    await L.roster(sB, shB, C, ["2031-03-12"]);
    await L.judge();
    const [mA, mB] = [await KC.create(sA, "2031-03"), await KC.create(sB, "2031-03")];
    for (const [m, s] of [[mA, sA], [mB, sB]] as const) if (m?.ok !== true) console.log(`  ⚠ V1b run: ${short({ m, bl: await L.blockers(s) }, 300)}`);
    const look = async (s: string, id: string, e: string, m: Any) => ({ sp: await L.split(s, id), it: await L.dto(s, id), up: await L.unpaid(m?.id, e) });
    const sp = (x: Any, p: number, u: number) => !!x.sp && num(x.sp.paidDays) === p && num(x.sp.unpaidDays) === u && x.sp.unpaidFrom === "2031-03-12" && !!x.it && num(x.it.paidDays) === p && num(x.it.unpaidDays) === u;
    {
      const x = await look(sA, a.id, A, mA);
      ck("V1b.1", { setup, run: mA?.ok === true, lines: canon(x.up) === canon(["UNPAID_LEAVE:-100000@2031-03-12", "UNPAID_LEAVE:-100000@2031-03-14"]) && tot(x.up) === -200_000, split: sp(x, 2, 2), ledger: (await L.ledger(sA)) === gA }, "−200,000 · 2 / 2", short(x, 260));
    }
    {
      const x = await look(sA, a2.id, A2, mA), us = await L.uses(a2.id);
      ck("V1b.4", { setup: a2.d?.ok === true, run: mA?.ok === true, unpaid: (!x.sp || num(x.sp.unpaidDays) === 0) && !(num(x.it?.unpaidDays) > 0), lines: x.up.length === 0, ledger: canon(us) === canon(["-5|null"]) && (await L.ledger(sA)) === gA }, "all paid · ledger same", short({ x, us }, 220));
    }
    const gB1 = await L.ledger(sB);
    {
      const x = await look(sB, b.id, B, mB);
      ck("V1b.2", { setup, run: mB?.ok === true, lines: canon(x.up) === canon(["UNPAID_LEAVE:-100000@2031-03-14", "UNPAID_LEAVE:-30000@2031-03-12"]) && tot(x.up) === -130_000, split: sp(x, 2.7, 1.3), ledger: gB1 === gB }, "−130,000 · 2.7 / 1.3", short(x, 260));
    }
    {
      const x = await look(sB, cc.id, C, mB);
      ck("V1b.3", { setup, run: mB?.ok === true, lines: canon(x.up) === canon(["UNPAID_LEAVE:-100000@2031-03-12", "UNPAID_LEAVE:-100000@2031-03-13", "UNPAID_LEAVE:-100000@2031-03-14"]) && tot(x.up) === -300_000, split: sp(x, 2, 3), ledger: gB1 === gB }, "−300,000 · 2 / 3", short(x, 260));
    }
  });

  // ── V8c: run reversal re-splits the period's split sick leaves ──
  const reversal = async (K: Any, LL: Any, v1: boolean, label: string, book?: string) => {
    const s = await K.sys(label, !v1), p = await LL.pol(s), sh = await K.shift(s), E = await K.emp(s, "R8");
    const bk2 = book ? await safe(() => S.PAY.setPayrollBook(K.c(s), K.V.owner, { accountSystemId: book })) : null;
    if (book && bk2?.ok !== true) console.log(`  ⚠ book: ${short(bk2, 160)}`);
    const j = await LL.used(s, E, p, "28.0");
    await LL.roster(s, sh, E, MAR);
    const m = await LL.reqDec(s, E, MAR[0]!, MAR[4]!, p);
    await LL.judge();
    const run = v1 ? await K.createV1(s, "2031-03") : await K.create(s, "2031-03");
    const ra = run?.id ? await K.approve(s, run.id) : run;
    const up0 = v1 ? [] : await LL.unpaid(run?.id, E);
    const rv = await LL.dec(s, j, "REJECTED", "APPROVED");
    const skipped = canon(await LL.uses(m.id)) === canon(["-2|unpaid:3.0;from:2031-03-12"]);
    const rr = run?.id ? await K.reverse(s, run.id) : run;
    const after = await LL.uses(m.id);
    const re = v1 ? null : await K.create(s, "2031-03");
    const setup = m.d?.ok === true && ra?.ok === true && rv?.ok === true && (v1 || tot(up0) === -300_000);
    if (!setup) console.log(`  ⚠ setup V8c ${label}: ${short({ m: m.d?.reason ?? m.d, run: run?.reason ?? run?.id, ra, rv, up0 }, 300)}`);
    return { setup, skipped, reversed: rr?.ok === true, resplit: canon(after) === canon(["-2|unpaid:3.0;from:2031-03-12", "-3|resplit;unpaid:0.0"]), sum: (await LL.sum(E, p)) === 25, rerun: v1 || (re?.ok === true && (await LL.unpaid(re?.id, E)).length === 0), info: short({ rr: rr?.note ?? rr?.reason ?? rr, after }, 200) };
  };
  await section("V8c", async () => {
    { const r = await reversal(KC, L, false, "กลับรอบ-V8c1"); ck("V8c.1", { setup: r.setup, skipped: r.skipped, reversed: r.reversed, resplit: r.resplit, sum: r.sum, rerun: r.rerun }, "re-split on reverse", r.info); }
    {
      const s = await KC.sys("คร่อมเดือน-V8c2"), p = await L.pol(s), E = await KC.emp(s, "SP");
      const j = await L.used(s, E, p, "28.0");
      const feb = await KC.create(s, "2031-02");
      const fa = feb?.id ? await KC.approve(s, feb.id) : feb;
      const m = await L.reqDec(s, E, "2031-02-27", "2031-03-03", p);
      const u0 = await L.uses(m.id);
      const rv = await L.dec(s, j, "REJECTED", "APPROVED");
      const kept = canon(await L.uses(m.id)) === canon(u0);
      const rr = feb?.id ? await KC.reverse(s, feb.id) : feb;
      const after = await L.uses(m.id);
      ck("V8c.2", { setup: fa?.ok === true && m.d?.ok === true && canon(u0) === canon(["-2|unpaid:3.0;from:2031-03-01"]) && rv?.ok === true, control: kept, reversed: rr?.ok === true, resplit: canon(after) === canon(["-2|unpaid:3.0;from:2031-03-01", "-3|resplit;unpaid:0.0"]), sum: (await L.sum(E, p)) === 25 },
        "untouched → re-split", short({ u0, rr: rr?.note ?? rr, after }, 220));
    }
    {
      const bookD = await KD.book("D");
      const r = await reversal(KD, kitL(KD), true, "กลับรอบรุ่นหนึ่ง-V8c3");
      ck("V8c.3", { setup: r.setup, skipped: r.skipped, reversed: r.reversed, resplit: r.resplit, sum: r.sum }, "re-split on v1 reverse", r.info);
      const r5 = await reversal(KD, kitL(KD), false, "กลับรอบมีสมุด-V8c5", bookD);
      ck("V8c.5", { setup: r5.setup, skipped: r5.skipped, reversed: r5.reversed, resplit: r5.resplit, sum: r5.sum, rerun: r5.rerun }, "re-split on booked reverse", r5.info);
    }
    { // year job carry: 2030 leftover 5.0 (carry max 5) · 2031 Σ 0 · March 0/5
      const s = await KC.sys("ยกวันลา-V8c4"), p = await L.pol(s, 5), E = await KC.emp(s, "YC");
      await L.txn(s, E, p, "GRANT", "30.0", 2030, "2030-01-01", `grant:${E}:${p}:2030`);
      const l30 = await L.leaveRow(s, E, "2030-06-02", "2030-06-26", p, "25.0");
      await L.txn(s, E, p, "USE", "-25.0", 2030, "2030-06-02", `use:${l30}`, l30);
      await L.used(s, E, p, "30.0");
      const m = await L.reqDec(s, E, MAR[0]!, MAR[4]!, p);
      const u0 = await L.uses(m.id);
      const job = await safe(() => LV.runLeaveYearJob({ tenantId: KC.TT, systemId: s, asOf: "2031-03-20" }));
      const carry = (await rows(`SELECT days::text AS d FROM "HrLeaveBalanceTxn" WHERE "sourceKey" = $1`, `carry:${E}:${p}:2031`))[0];
      const after = await L.uses(m.id);
      ck("V8c.4", { setup: m.d?.ok === true && canon(u0) === canon(["0|unpaid:5.0;from:2031-03-10"]), carry: num(carry?.d) === 5, resplit: canon(after) === canon(["0|unpaid:5.0;from:2031-03-10", "-5|resplit;unpaid:0.0"]), sum: (await L.sum(E, p)) === 0 },
        "carry ⇒ re-split", short({ job, carry, u0, after }, 220));
    }
  });
  // ── V8d: draft create / recompute re-splits first (retry of a missed V8c) ──
  await section("V8d", async () => {
    const s = await KC.sys("ร่างแบ่งใหม่-V8d"), c = KC.c(s), p = await L.pol(s), sh = await KC.shift(s);
    const [E, F, G] = [await KC.emp(s, "DE"), await KC.emp(s, "DF"), await KC.emp(s, "DG")];
    await P.hrSalaryProfile.deleteMany({ where: { employeeId: { in: [E, F] } } }); // E, F are not in the March run that gets reversed
    const prof = (e: string) => P.hrSalaryProfile.create({ data: { tenantId: KC.TT, systemId: s, employeeId: e, baseSalarySatang: 3_000_000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
    const [jE, jF] = [await L.used(s, E, p, "28.0"), await L.used(s, F, p, "28.0")];
    for (const e of [E, F]) await L.roster(s, sh, e, MAR);
    const [mE, mF] = [await L.reqDec(s, E, MAR[0]!, MAR[4]!, p), await L.reqDec(s, F, MAR[0]!, MAR[4]!, p)];
    await L.judge();
    const run = await KC.create(s, "2031-03");
    const ra = run?.id ? await KC.approve(s, run.id) : run;
    const [rvE, rvF] = [await L.dec(s, jE, "REJECTED", "APPROVED"), await L.dec(s, jF, "REJECTED", "APPROVED")];
    const rr = run?.id ? await KC.reverse(s, run.id) : run;
    const ONE = canon(["-2|unpaid:3.0;from:2031-03-12"]), TWO = canon(["-2|unpaid:3.0;from:2031-03-12", "-3|resplit;unpaid:0.0"]);
    const missed = canon(await L.uses(mE.id)) === ONE && canon(await L.uses(mF.id)) === ONE;
    const setup = mE.d?.ok === true && mF.d?.ok === true && ra?.ok === true && rvE?.ok === true && rvF?.ok === true && rr?.ok === true && missed;
    if (!setup) console.log(`  ⚠ setup V8d: ${short({ run: run?.reason ?? run?.id, ra, rvE, rvF, rr: rr?.note ?? rr, e: await L.uses(mE.id) }, 300)}`);
    await prof(E);
    const d1 = await KC.create(s, "2031-03");
    ck("V8d.1", { setup, draft: d1?.ok === true, resplit: canon(await L.uses(mE.id)) === TWO, lines: d1?.ok === true && (await L.unpaid(d1.id, E)).length === 0, sum: (await L.sum(E, p)) === 25 }, "create re-splits", short({ d1: d1?.reason ?? d1?.ok, u: await L.uses(mE.id), up: await L.unpaid(d1?.id, E) }, 240));
    await prof(F);
    const rc = (id: string) => safe(() => S.PAY.recomputeDraftRun(c, id, { userId: KC.U.pay1.id, isOwner: false }, { viewer: KC.V.pay1, now: bk("2031-04-03") }));
    const r1 = d1?.id ? await rc(d1.id) : d1;
    ck("V8d.2", { setup, recompute: r1?.ok === true, resplit: canon(await L.uses(mF.id)) === TWO, lines: !!d1?.id && (await L.unpaid(d1.id, F)).length === 0 }, "recompute re-splits", short({ r1: r1?.reason ?? r1?.ok, u: await L.uses(mF.id), up: await L.unpaid(d1?.id, F) }, 240));
    const n0 = (await L.ledger(s)).length, g0 = await L.ledger(s);
    const r2 = d1?.id ? await rc(d1.id) : d1;
    const del = d1?.id ? await safe(() => S.PAY.deleteDraftRun(c, d1.id, KC.ownA)) : d1;
    const d2 = await KC.create(s, "2031-03");
    ck("V8d.3", { setup, ran: r2?.ok === true && del?.ok === true && d2?.ok === true, same: (await L.ledger(s)) === g0, lines: d2?.ok === true && (await L.unpaid(d2.id, E)).length === 0 && (await L.unpaid(d2.id, F)).length === 0 }, "no new rows", short({ n0, r2: r2?.reason ?? r2?.ok, del, d2: d2?.reason ?? d2?.ok }, 200));
    // (d) leave with a day in APPROVED Feb
    const sd = await KC.sys("ร่างข้ามเดือนปิด-V8d"), pd = await L.pol(sd), H = await KC.emp(sd, "DH");
    const jH = await L.used(sd, H, pd, "28.0");
    const feb = await KC.create(sd, "2031-02");
    const fa = feb?.id ? await KC.approve(sd, feb.id) : feb;
    const mH = await L.reqDec(sd, H, "2031-02-27", "2031-03-03", pd);
    const rvH = await L.dec(sd, jH, "REJECTED", "APPROVED");
    const dH = await KC.create(sd, "2031-03");
    const upH = await L.unpaid(dH?.id, H);
    ck("V8d.4", { setup: fa?.ok === true && mH.d?.ok === true && rvH?.ok === true, draft: dH?.ok === true, untouched: canon(await L.uses(mH.id)) === canon(["-2|unpaid:3.0;from:2031-03-01"]), lines: tot(upH) === -300_000 }, "untouched · −300,000", short({ dH: dH?.reason ?? dH?.ok, u: await L.uses(mH.id), upH }, 220));
  });
} catch (e) {
  crashed ||= errText(e);
  console.log(`CRASH ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  const dl1 = await deadlocks();
  chk("Z2", dl1 === dl0 && dl0 >= 0, "0 new deadlocks", `${dl0}→${dl1}`);
  const left = await S.cleanup().catch((e: unknown) => [`cleanup threw ${errText(e)}`]);
  chk("Z1", left.length === 0, "none", left.join(","));
}
process.exit(finish({ forced: FORCE, crashed, missing: [] }));
