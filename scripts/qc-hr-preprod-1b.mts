// QC — HR V2 · fix ticket HR-PREPROD-1 · review round (controller rulings V1–V9, brief "CONTROLLER RULINGS (review)") · second suite file, shares qc-hr-preprod-1-lib.mts
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-preprod-1b.mts  (--list)
// Registry base = d048c9d48 (all GREEN there); V1b · V8c checks live in scripts/qc-hr-preprod-1c.mts · own tenants qc-hr-pp1-*-{a,b} · 2031 dates · money = integer satang ·
//   numbers: base 3,000,000 st, N = 480 ⇒ 100,000 st per unpaid day, 10,000 st per unpaid tenth of a day (notes §review)
import { type Any, type Base, short, errText, failedKeys, canon, isThai, makeRegistry } from "./qc-hr-lib.mjs";
import { setupPP1, nextScope, bk, dd, nowOf } from "./qc-hr-preprod-1-lib.mjs";

const SUITE = "qc-hr-preprod-1b";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const PAID_TEXT = "เดือนนี้อนุมัติเงินเดือนแล้ว — แก้เวลาย้อนหลังไม่ได้";
const SEV: Record<string, "CRITICAL" | "MAJOR" | "MINOR"> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
Z0|house|C|G|own law rows: none before · 3 inserted
V1.1|V1|C|G|27.0 + 0.3 used, 10–14 Mar ⇒ paid 2.7 exact · USE −2.7 · unpaid:2.3;from:2031-03-12 · split 2.7/2.3 · −30,000 −100,000 −100,000 = −230,000 · balance 0.0
V2.1|V2|C|G|borrowing-branch manager + API-key viewer without pay keys see the leave row without paidDays/unpaidDays
V2.2|V2|M|G|control: home-branch pay viewer sees paidDays 2 / unpaidDays 3 · self sees unpaidDays 3.0
V3.1|V3|C|G|SICK paid=false: within balance no split (USE −5.0 · note null · −500,000 · no split fields) · over balance refused LEAVE_TEXT.balance, no row
V4.1|V4|C|G|race: decide passed the paid-month gate, policy flip paid→unpaid queued first on the row ⇒ never an APPROVED unpaid-policy leave in APPROVED Feb
V5.1|V5|M|G|two approvals race for the last 2.0 ⇒ both APPROVED · Σ paid 2.0 · Σ ledger 0
V5.2|V5|M|G|malformed USE note ⇒ fully paid: no split · no split fields · no UNPAID_LEAVE
V5.3|V5|M|G|half-day AM with 0.0 left ⇒ USE 0.0 · unpaid:0.5;from:2031-03-19 · −50,000
V5.4|V5|M|G|approving a split leave outdates the month's work entries · rebuilt current · split note change outdates them again
V5.5|V5|M|G|payroll page: REFUND_BEHIND row of a u2 employee hidden from the [u1] viewer · shown to owner · in-scope row shown
V7.1|V7b|C|G|(V7b) OT 1 h filed by [u1] viewer for borrowed home-u2 employees: success reply without amount, byte-identical for 45,600 ฿ · 91,200 ฿ · no salary profile ⇒ NON-success fixed Thai text (no digits, ≠ success) · nothing written
V7.4|V7b|M|G|(V7b) pay-neutral refusal passes through: OT into a period with an APPROVED run — [u1] viewer's reply = all-branch viewer's reply, not ok, nothing written
V7.2|V7|M|G|the requester's adjustment list (pay scope [u1]) has none of those rows · page visible text shows no ฿285 / ฿570 · control: in-scope ฿187.50 row listed and found by the same matcher
V7.3|V7|M|G|control: in-scope employee reply "ยื่นแล้ว 187.5 บาท — รออนุมัติ" · all-branch viewer still gets 285 บาท for the borrowed employee
V8.1|V8|C|G|(V8b) January sick leave (28.0) revoked ⇒ March 2/3 re-split: original USE −2.0 kept · appended USE −3.0 'resplit;unpaid:0.0' · split 5/0 · Σ 25.0 · no UNPAID_LEAVE in the March v2 run
V8.2|V8|C|G|positive writer carry-top: 2030 leave (28.0) revoked after 2.0 carried into 2031 (carry max 5) ⇒ carry-top +3.0 ⇒ March 0/5 re-split to 3 / 2 · appended USE −3.0 'resplit;unpaid:2.0;from:2031-03-13' · −200,000 · Σ 2031 0.0 (quota raise writes no ledger row — no V8.2 quota check)
V8.3|V8|C|G|partial return 1.5 ⇒ paid 3.5 / unpaid 1.5 · appended USE −1.5 'resplit;unpaid:1.5;from:2031-03-13' · −50,000 −100,000 = −150,000 · Σ 0.0
V8.4|V8|M|G|control: March run APPROVED ⇒ split unchanged after the return (single USE −2.0 · unpaid:3.0;from:2031-03-12 · Σ 28.0)
V8.5|V8|C|G|two later split leaves re-split in date order: 3.0 back ⇒ March appended −3.0 'resplit;unpaid:0.0' (5/0) · April single USE 0.0 stays 0/5 · Σ 0.0
V8.6|V8b|C|G|append-only: re-splits update/delete no ledger row (every earlier row of the system byte-same) · row count grows
V8.7|V8b|M|G|revoking a re-split leave reverts Σ of its USE rows: use-revert +5.0 · Σ 30.0
V9.1|V9|C|G|leaver (end 31 Oct) refund behind approved Sep with Oct DRAFT ⇒ moved to 2031-10 · Oct run carries REFUND:+50,000 exactly once · approved
Z1|house|C|G|no residue
Z2|house|M|G|no deadlock
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`PP1B-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, finish } = makeRegistry(SUITE, "PP1B-", CHECKS);
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
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage; // before next/*
const { installNetGuard } = (await import("./qc-hr-h4.3-lib.mjs")) as Any;
installNetGuard();
const S = await setupPP1(SUITE);
const { P, tag, rows, safe, adjOf, linesOf, PAY } = S;
const imp = async (s: string) => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const LV = await imp("@/lib/modules/hr/leave"), SV = await imp("@/lib/modules/hr/service"), JG = await imp("@/lib/modules/hr/judge"), WE = await imp("@/lib/modules/hr/work-entries");
const STG = await imp("@/lib/modules/hr/settings"), PV = await imp("@/lib/modules/hr/privacy"), ACT = await imp("@/lib/modules/hr/payroll-actions"), UI = await imp("@/lib/modules/hr/payroll-ui"), SELF = await imp("@/lib/modules/hr/self");
for (const [k, m] of Object.entries({ LV, SV, JG, WE, STG, PV, ACT, UI, SELF })) if (m?.__err) console.log(`  ⚠ import ${k}: ${m.__err}`);
const { underLock } = (await import("./qc-hr-money-2-lib.mjs")) as Any;
const inS = await nextScope();
async function html(node: Any): Promise<string> {
  try { return String(((await import("react-dom/server" as string)) as Any).renderToStaticMarkup(node)); } catch {
    const { prelude } = await ((await import("react-dom/static" as string)) as Any).prerenderToNodeStream(node);
    let h = "";
    for await (const x of prelude) h += String(x);
    return h;
  }
}
const page = (w: Any, s: string): Promise<string> => inS(w.cookie, `/app/sys/${s}/hr/payroll`, async () => html(await UI.PayrollSection({ systemId: s }))).catch((e: unknown) => `THROW ${errText(e)}`);
const deadlocks = async () => Number((await rows(`SELECT deadlocks::bigint AS n FROM pg_stat_database WHERE datname = current_database()`))[0]?.n ?? -1);
const num = (v: unknown) => Number(String(v));
const r1 = (x: number) => Math.round(x * 10) / 10;
const tot = (xs: string[]) => xs.reduce((t, x) => t + Number(x.split(":")[1]!.split("@")[0]), 0);
let crashed = "";
const section = async (name: string, f: () => Promise<void>) => {
  try {
    await f();
  } catch (e) {
    crashed ||= `${name}: ${errText(e)}`;
    console.log(`CRASH ${name} ${errText(e)} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
  }
};
/** leave helpers bound to one kit */
let polN = 0;
function leaveKit(K: Any) {
  const TT = K.TT;
  const pol = async (s: string, category: string, paid: boolean, quota: number | null) =>
    (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category, name: `${category} ${paid ? "p" : "u"} ${quota ?? "∞"} ${++polN} ${tag}`, paid, quotaDays: quota, allowHalfDay: true, allowHours: false } })).id as string;
  const leaveRow = async (s: string, e: string, type: string, from: string, to: string, policyId: string, days: string, status = "PENDING") =>
    (await P.hrLeave.create({ data: { tenantId: TT, systemId: s, employeeId: e, type, fromDate: dd(from), toDate: dd(to), status, policyId, days, reason: `qc ${tag}` } })).id as string;
  /** GRANT 30.0 (2031) + approved January legacy leaves with their USE rows · returns the leave ids */
  const used = async (s: string, e: string, p: string, parts: [string, string, string][]) => {
    await P.hrLeaveBalanceTxn.create({ data: { tenantId: TT, systemId: s, employeeId: e, policyId: p, kind: "GRANT", days: "30.0", leaveYear: 2031, effectiveDate: dd("2031-01-01"), sourceKey: `grant:${e}:${p}:2031` } });
    const ids: string[] = [];
    for (const [from, to, d] of parts) {
      const l = await leaveRow(s, e, "SICK", from, to, p, d, "APPROVED");
      await P.hrLeaveBalanceTxn.create({ data: { tenantId: TT, systemId: s, employeeId: e, policyId: p, kind: "USE", days: `-${d}`, leaveYear: 2031, effectiveDate: dd(from), sourceKey: `use:${l}`, leaveId: l } });
      ids.push(l);
    }
    return ids;
  };
  const req = (s: string, e: string, from: string, to: string, p: string, extra: Any = {}) => safe(() => SV.requestLeave(K.c(s), { employeeId: e, type: "SICK", fromDate: from, toDate: to, reason: "qc ป่วย", actorUserId: K.U.owner.id, policyId: p, ...extra }));
  const dec = (s: string, id: string, to = "APPROVED", from = "PENDING") => safe(() => SV.decideLeave(K.c(s), id, to, K.U.pay1.id, { from }).then(() => ({ ok: true })));
  const reqDec = async (s: string, e: string, from: string, to: string, p: string, extra: Any = {}) => { const r = await req(s, e, from, to, p, extra); const d = r?.id ? await dec(s, r.id) : r; return { id: (r?.id ?? "") as string, r, d }; };
  const uses = async (id: string) => (await rows(`SELECT id, days::text AS d, note FROM "HrLeaveBalanceTxn" WHERE "leaveId" = $1 AND kind::text = 'USE' ORDER BY "createdAt", id`, id)) as Any[];
  const use = async (id: string) => (await rows(`SELECT days::text AS d, note FROM "HrLeaveBalanceTxn" WHERE "sourceKey" = $1`, `use:${id}`))[0];
  const sum = async (e: string, p: string) => num((await rows(`SELECT COALESCE(SUM(days), 0)::text AS n FROM "HrLeaveBalanceTxn" WHERE "employeeId" = $1 AND "policyId" = $2 AND "leaveYear" = 2031`, e, p))[0]?.n);
  const stOf = async (id: string) => (await rows(`SELECT status::text AS s FROM "HrLeave" WHERE id = $1`, id))[0]?.s;
  const split = async (s: string, id: string) => ((await safe(() => LV.leaveSplitOf(K.c(s), [id]))) ?? {})[id] as Any;
  const item = async (s: string, v: Any, id: string) => { const x = await safe(() => PV.leaveItemsForViewer(K.c(s), v)); return [...(x?.history ?? []), ...(x?.pending ?? [])].find((i: Any) => i?.id === id); };
  const rosterDays = async (s: string, sh: string, e: string, days: string[]) => { for (const d of days) await K.roster(s, sh, e, d); };
  const judge = async () => { for (const d of ["2031-03-15", "2031-03-22", "2031-03-29", "2031-04-05"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT })); };
  const unpaid = async (runId: string | undefined, e: string) => (runId ? await linesOf(runId, e) : []).filter((x) => x.startsWith("UNPAID_LEAVE:")).sort();
  const blockers = async (s: string) => (await rows(`SELECT e.code, d.date::text AS d, d.review FROM "HrWorkDay" d JOIN "HrEmployee" e ON e.id = d."employeeId" WHERE d."systemId" = $1 AND cardinality(d.review) > 0 LIMIT 8`, s).catch(() => [])) as Any[];
  return { uses, pol, leaveRow, used, req, dec, reqDec, use, sum, stOf, split, item, rosterDays, judge, unpaid, blockers };
}
const noSplit = (it: Any) => !!it && !("paidDays" in it) && !("unpaidDays" in it);
const MAR = ["2031-03-10", "2031-03-11", "2031-03-12", "2031-03-13", "2031-03-14"];
const JAN28: [string, string, string][] = [["2031-01-02", "2031-01-31", "28.0"]];

const dl0 = await deadlocks();
try {
  ck("Z0", { none: S.lawPresent === 0, inserted: S.lawOk }, "0 present · 3 inserted", `present=${S.lawPresent}`);
  const KA = await S.kit("a", "leave");
  const KB = await S.kit("b", "money");
  const L = leaveKit(KA);
  const ownV = { ...KA.V.owner, userId: KA.U.owner.id };

  // ── V1 + V2 (system s1, March draft) ──
  await section("V1V2", async () => {
    const s = await KA.sys("ป่วยทศนิยม-V1"), sick = await L.pol(s, "SICK", true, 30), sh = await KA.shift(s);
    const [E11, E21] = [await KA.emp(s, "V11"), await KA.emp(s, "V21")];
    await L.used(s, E11, sick, [["2031-01-02", "2031-01-31", "27.0"], ["2031-02-03", "2031-02-03", "0.3"]]);
    await L.used(s, E21, sick, JAN28);
    await L.rosterDays(s, sh, E11, MAR);
    const a = await L.reqDec(s, E11, MAR[0]!, MAR[4]!, sick);
    const b = await L.reqDec(s, E21, MAR[0]!, MAR[4]!, sick);
    await L.judge();
    const mar = await KA.create(s, "2031-03");
    if (mar?.ok !== true) console.log(`  ⚠ V1 run: ${short({ mar, bl: await L.blockers(s) }, 300)}`);
    const u = await L.use(a.id), sp = await L.split(s, a.id), up = await L.unpaid(mar?.id, E11);
    const bal = ((await safe(() => LV.leaveBalances(KA.c(s), KA.V.owner, { employeeId: E11, year: 2031 })))?.items ?? []).find((x: Any) => x.policyId === sick);
    ck("V1.1", { approved: a.d?.ok === true, use: num(u?.d) === -2.7 && u?.note === "unpaid:2.3;from:2031-03-12", split: !!sp && num(sp.paidDays) === 2.7 && num(sp.unpaidDays) === 2.3 && sp.unpaidFrom === "2031-03-12",
      lines: canon(up) === canon(["UNPAID_LEAVE:-100000@2031-03-13", "UNPAID_LEAVE:-100000@2031-03-14", "UNPAID_LEAVE:-30000@2031-03-12"]) && tot(up) === -230_000, balance: bal?.balance === "0.0" && (await L.sum(E11, sick)) === 0 },
      "2.7 / 2.3 · −230,000 · 0.0", short({ d: a.d?.reason ?? a.d, u, sp, up, bal: bal?.balance }, 260));
    // V2: E21 borrowed into u2 for March · u2 manager · API-key shape · u1 pay viewer · self
    await P.hrEmployeeUnit.create({ data: { tenantId: KA.TT, systemId: s, employeeId: E21, unitId: KA.u2, fromDate: dd("2031-03-01"), toDate: dd("2031-03-31") } });
    const mk = (t: string, r: "MANAGER" | "STAFF", ua: string[], pm: Record<string, boolean>) => S.fx.mkUser(KA.TT, `a${t}`, `QPP a${t} ${tag}`, r, ua, pm);
    const [mgr2, payV, me] = [await mk("mgr2", "MANAGER", [KA.u2], {}), await mk("payv", "STAFF", [KA.u1], { "hr.payroll.read": true, "hr.leave.read": true }), await mk("self", "STAFF", [], {})];
    await P.hrEmployee.update({ where: { id: E21 }, data: { linkedUserId: me.id } });
    const V = (w: Any) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id });
    const [im, ik, ip] = [await L.item(s, V(mgr2), b.id), await L.item(s, { role: "STAFF", unitAccess: ["*"], permissions: { "hr.leave.read": true }, userId: "apikey:qcpp1b" }, b.id), await L.item(s, V(payV), b.id)];
    const mine = await safe(() => SELF.myRequests({ tenantId: KA.TT, userId: me.id, role: "STAFF", unitAccess: [], permissions: {} }));
    const mi = (mine?.leaves ?? []).find((x: Any) => x.id === b.id);
    ck("V2.1", { setup: b.d?.ok === true, mgr: noSplit(im), key: noSplit(ik) }, "row without split fields", short({ im, ik }, 260));
    ck("V2.2", { pay: !!ip && num(ip.paidDays) === 2 && num(ip.unpaidDays) === 3, self: mi?.unpaidDays === "3.0" }, "split shown", short({ ip, mi }, 220));
    await P.hrEmployee.update({ where: { id: E21 }, data: { linkedUserId: null } });
  });

  // ── V3: SICK policy with paid = false ──
  await section("V3", async () => {
    const s = await KA.sys("ป่วยไม่รับค่าจ้าง-V3"), sickU = await L.pol(s, "SICK", false, 30), sh = await KA.shift(s);
    const so = await KA.sys("ป่วยไม่รับค่าจ้างเกิน-V3"), sickO = await L.pol(so, "SICK", false, 30);
    const E = await KA.emp(s, "V3"), Eo = await KA.emp(so, "V3o");
    await L.rosterDays(s, sh, E, MAR);
    await L.used(so, Eo, sickO, JAN28);
    const a = await L.reqDec(s, E, MAR[0]!, MAR[4]!, sickU);
    await L.judge();
    const mar = await KA.create(s, "2031-03");
    const u = await L.use(a.id), sp = await L.split(s, a.id), up = await L.unpaid(mar?.id, E), nUse = (await L.uses(a.id)).length;
    const q = await L.req(so, Eo, MAR[0]!, MAR[4]!, sickO);
    const n = (await rows(`SELECT 1 FROM "HrLeave" WHERE "employeeId" = $1 AND "fromDate" = '2031-03-10'::date`, Eo)).length;
    ck("V3.1", { within: a.d?.ok === true && nUse === 1 && num(u?.d) === -5 && u?.note === null && (!sp || !(num(sp.unpaidDays) > 0)) && noSplit(await L.item(s, ownV, a.id)) && tot(up) === -500_000,
      over: !q?.id && q?.__throw?.message === LV.LEAVE_TEXT?.balance && n === 0 }, "no split · over refused", short({ d: a.d?.reason ?? a.d, u, sp, up: tot(up), q: q?.reason ?? q?.id }, 240));
  });

  // ── V4: approval vs paid-flag flip on the policy row ──
  await section("V4", async () => {
    const s = await KA.sys("สลับค่าจ้าง-V4"), pV = await L.pol(s, "VACATION", true, null), E = await KA.emp(s, "V4");
    const feb = await KA.create(s, "2031-02");
    const fa = feb?.id ? await KA.approve(s, feb.id) : feb;
    const l = await L.leaveRow(s, E, "VACATION", "2031-02-18", "2031-02-18", pV, "1.0");
    const u = await underLock(P, { rowSql: `SELECT id FROM "HrLeavePolicy" WHERE id = $1 FOR UPDATE`, args: [pV] }, [() => safe(() => STG.updateLeavePolicy(KA.c(s), KA.V.owner, pV, { paid: false })), () => L.dec(s, l)]);
    const paid = (await rows(`SELECT paid FROM "HrLeavePolicy" WHERE id = $1`, pV))[0]?.paid;
    const st = await L.stOf(l);
    ck("V4.1", { setup: fa?.ok === true, holder: !u.holderErr, waited: u.blocked.every(Boolean), safe: !(st === "APPROVED" && paid === false) }, "not APPROVED + unpaid in a paid month", short({ blocked: u.blocked, res: u.res.map((x: Any) => x?.reason ?? x?.ok), st, paid }, 240));
  });

  // ── V5: race · malformed note · half day · work-entry state ──
  await section("V5", async () => {
    const sh3 = await KA.sys("ลาป่วยแข่ง-V5"), sickH = await L.pol(sh3, "SICK", true, 30), shH = await KA.shift(sh3);
    const [H1, H2] = [await KA.emp(sh3, "H1"), await KA.emp(sh3, "H2")];
    await L.used(sh3, H1, sickH, JAN28);
    await L.used(sh3, H2, sickH, JAN28);
    const [ra, rb] = [await L.req(sh3, H1, "2031-03-17", "2031-03-19", sickH), await L.req(sh3, H1, "2031-03-24", "2031-03-26", sickH)];
    const [da, db] = await Promise.all([L.dec(sh3, ra?.id ?? ""), L.dec(sh3, rb?.id ?? "")]);
    const paidT = -(num((await L.use(ra?.id ?? ""))?.d) + num((await L.use(rb?.id ?? ""))?.d));
    ck("V5.1", { both: da?.ok === true && db?.ok === true, paid: r1(paidT) === 2, ledger: (await L.sum(H1, sickH)) === 0 }, "Σ paid 2.0 · Σ 0", short({ da: da?.reason ?? da, db: db?.reason ?? db, paidT }, 200));
    // work-entry state of H2 (no runs in this system)
    await L.rosterDays(sh3, shH, H2, ["2031-03-24", "2031-03-25", "2031-03-26", "2031-03-27", "2031-03-28"]);
    await safe(() => JG.runAttendanceJobs({ now: bk("2031-03-29"), tenantId: KA.TT }));
    const st = async () => ((await safe(() => WE.workEntryStatesInTx(P, KA.c(sh3), "2031-03", [H2]))) as Any)?.get?.(H2);
    const build = () => safe(() => WE.buildWorkEntrySnapshot(KA.c(sh3), KA.V.owner, { periodKey: "2031-03" }, { now: nowOf("2031-03") }));
    const rh = await L.req(sh3, H2, "2031-03-24", "2031-03-28", sickH);
    await build();
    const s0 = await st();
    const dh = rh?.id ? await L.dec(sh3, rh.id) : rh;
    const s1 = await st();
    await build();
    const s2 = await st();
    await P.$executeRawUnsafe(`UPDATE "HrLeaveBalanceTxn" SET note = 'unpaid:2.0;from:2031-03-27' WHERE "sourceKey" = $1`, `use:${rh?.id ?? ""}`);
    const s3 = await st();
    ck("V5.4", { approved: dh?.ok === true, before: !!s0 && s0 !== "OUTDATED", approve: s1 === "OUTDATED", rebuilt: !!s2 && s2 !== "OUTDATED", note: s3 === "OUTDATED" }, "OUTDATED ×2", short({ s0, s1, s2, s3, dh: dh?.reason ?? dh }, 200));
    // half day + malformed note (own system with a March draft)
    const s = await KA.sys("ลาป่วยครึ่งวัน-V5"), sick = await L.pol(s, "SICK", true, 30), sh = await KA.shift(s);
    const [E13, E15] = [await KA.emp(s, "V13"), await KA.emp(s, "V15")];
    await L.used(s, E13, sick, [["2031-01-02", "2031-01-31", "30.0"]]);
    await L.rosterDays(s, sh, E13, ["2031-03-19"]);
    await L.rosterDays(s, sh, E15, ["2031-03-21"]);
    const h = await L.reqDec(s, E13, "2031-03-19", "2031-03-19", sick, { halfDay: "AM" });
    const m = await L.reqDec(s, E15, "2031-03-21", "2031-03-21", sick);
    await P.$executeRawUnsafe(`UPDATE "HrLeaveBalanceTxn" SET note = 'unpaid:x;from:bad' WHERE "sourceKey" = $1`, `use:${m.id}`);
    await L.judge();
    const mar = await KA.create(s, "2031-03");
    if (mar?.ok !== true) console.log(`  ⚠ V5 run: ${short({ mar, bl: await L.blockers(s) }, 300)}`);
    const sp = await L.split(s, m.id);
    ck("V5.2", { setup: m.d?.ok === true && mar?.ok === true, split: !sp || (num(sp.unpaidDays) === 0 && sp.unpaidFrom === null), dto: noSplit(await L.item(s, ownV, m.id)), lines: (await L.unpaid(mar?.id, E15)).length === 0 }, "fully paid", short({ sp, up: await L.unpaid(mar?.id, E15) }, 160));
    const uh = await L.use(h.id);
    ck("V5.3", { approved: h.d?.ok === true, use: num(uh?.d) === 0 && uh?.note === "unpaid:0.5;from:2031-03-19", lines: canon(await L.unpaid(mar?.id, E13)) === canon(["UNPAID_LEAVE:-50000@2031-03-19"]) }, "−50,000", short({ d: h.d?.reason ?? h.d, uh, up: await L.unpaid(mar?.id, E13) }, 200));
  });

  // ── V8: paid sick days come back ⇒ later open-month split leaves re-split in date order ──
  await section("V8", async () => {
    const s = await KA.sys("คืนวันป่วย-V8"), sick = await L.pol(s, "SICK", true, 30), sickQ = (await P.hrLeavePolicy.create({ data: { tenantId: KA.TT, systemId: s, category: "SICK", name: `SICK carry ${tag}`, paid: true, quotaDays: 30, carryMaxDays: 5, allowHalfDay: true } })).id as string, sh = await KA.shift(s);
    const [E1, E2, E3, E5] = [await KA.emp(s, "V81"), await KA.emp(s, "V82"), await KA.emp(s, "V83"), await KA.emp(s, "V85")];
    const [j1] = await L.used(s, E1, sick, JAN28);
    // E2 (policy carry max 5): 2030 GRANT 30 · 2030 leave 28.0 · 2.0 carried into 2031 · 2031 GRANT 30 · January 2031 leave 32.0 ⇒ 2031 Σ 0.0
    const tx2 = (kind: string, days: string, year: number, eff: string, key: string, leaveId: string | null = null) => P.hrLeaveBalanceTxn.create({ data: { tenantId: KA.TT, systemId: s, employeeId: E2, policyId: sickQ, kind, days, leaveYear: year, effectiveDate: dd(eff), sourceKey: key, leaveId } });
    const j2 = await L.leaveRow(s, E2, "SICK", "2030-06-02", "2030-06-29", sickQ, "28.0", "APPROVED");
    const j2b = await L.leaveRow(s, E2, "SICK", "2031-01-02", "2031-02-02", sickQ, "32.0", "APPROVED");
    await tx2("GRANT", "30.0", 2030, "2030-01-01", `grant:${E2}:${sickQ}:2030`);
    await tx2("USE", "-28.0", 2030, "2030-06-02", `use:${j2}`, j2);
    await tx2("CARRY", "-2.0", 2030, "2030-12-31", `carry-out:${E2}:${sickQ}:2031`);
    await tx2("CARRY", "2.0", 2031, "2031-01-01", `carry:${E2}:${sickQ}:2031`);
    await tx2("GRANT", "30.0", 2031, "2031-01-01", `grant:${E2}:${sickQ}:2031`);
    await tx2("USE", "-32.0", 2031, "2031-01-02", `use:${j2b}`, j2b);
    const [, j3b] = await L.used(s, E3, sick, [["2031-01-02", "2031-01-28", "26.5"], ["2031-01-29", "2031-01-30", "1.5"]]);
    const [, j5b] = await L.used(s, E5, sick, [["2031-01-02", "2031-01-27", "25.0"], ["2031-01-28", "2031-01-30", "3.0"]]);
    for (const e of [E1, E2, E3, E5]) await L.rosterDays(s, sh, e, MAR);
    const [m1, m2, m3, m5] = [await L.reqDec(s, E1, MAR[0]!, MAR[4]!, sick), await L.reqDec(s, E2, MAR[0]!, MAR[4]!, sickQ), await L.reqDec(s, E3, MAR[0]!, MAR[4]!, sick), await L.reqDec(s, E5, MAR[0]!, MAR[4]!, sick)];
    const a5 = await L.reqDec(s, E5, "2031-04-07", "2031-04-11", sick);
    const pre = canon(await Promise.all([m1, m2, m3, m5].map(async (x) => (await L.use(x.id))?.note)));
    const setup = [m1, m2, m3, m5, a5].every((x) => x.d?.ok === true) && pre === canon(["unpaid:3.0;from:2031-03-12", "unpaid:5.0;from:2031-03-10", "unpaid:3.0;from:2031-03-12", "unpaid:3.0;from:2031-03-12"]);
    if (!setup) console.log(`  ⚠ setup V8: ${short({ pre, d: [m1, m2, m3, m5, a5].map((x) => x.d?.reason ?? x.d?.ok) }, 300)}`);
    await L.judge();
    const ledger = async () => (await rows(`SELECT * FROM "HrLeaveBalanceTxn" WHERE "systemId" = $1 ORDER BY id`, s)) as Any[];
    const before = await ledger();
    const rv1 = await L.dec(s, j1, "REJECTED", "APPROVED");
    const q = await L.dec(s, j2, "REJECTED", "APPROVED");
    const top = (await rows(`SELECT days::text AS d, "leaveYear" AS y FROM "HrLeaveBalanceTxn" WHERE "sourceKey" = $1`, `carry-top:${j2}`))[0];
    const rv3 = await L.dec(s, j3b, "REJECTED", "APPROVED");
    const rv5 = await L.dec(s, j5b, "REJECTED", "APPROVED");
    const mar = await KA.create(s, "2031-03");
    if (mar?.ok !== true) console.log(`  ⚠ V8 run: ${short({ mar, bl: await L.blockers(s) }, 300)}`);
    const after = new Map((await ledger()).map((r: Any) => [r.id, canon(r)]));
    ck("V8.6", { setup, grew: after.size > before.length, same: before.every((r: Any) => after.get(r.id) === canon(r)) }, "old rows byte-same", `rows ${before.length}→${after.size} changed=${before.filter((r: Any) => after.get(r.id) !== canon(r)).length}`);
    /** USE rows of a leave (original first) · Σ = paid days · latest note = split */
    const look = async (id: string) => { const us = await L.uses(id), sp = await L.split(s, id), tot5 = r1(-us.reduce((t: number, u: Any) => t + num(u.d), 0)); return { us: us.map((u: Any) => `${num(u.d)}|${u.note}`), sp, paid: tot5, eq: !!sp && tot5 === r1(num(sp.paidDays)) }; };
    {
      const x = await look(m1.id);
      ck("V8.1", { setup, revoke: rv1?.ok === true, use: canon(x.us) === canon(["-2|unpaid:3.0;from:2031-03-12", "-3|resplit;unpaid:0.0"]), split: x.eq && x.paid === 5 && num(x.sp?.unpaidDays) === 0, sum: (await L.sum(E1, sick)) === 25, lines: mar?.ok === true && (await L.unpaid(mar?.id, E1)).length === 0 }, "5 / 0 · Σ 25.0 · no UNPAID_LEAVE", short({ rv1: rv1?.reason ?? rv1, ...x }, 240));
    }
    {
      const x = await look(m2.id);
      const up = await L.unpaid(mar?.id, E2);
      ck("V8.2", { setup, revoke: q?.ok === true, carryTop: num(top?.d) === 3 && Number(top?.y) === 2031, use: canon(x.us) === canon(["0|unpaid:5.0;from:2031-03-10", "-3|resplit;unpaid:2.0;from:2031-03-13"]), split: x.eq && x.paid === 3 && num(x.sp?.unpaidDays) === 2, sum: (await L.sum(E2, sickQ)) === 0,
        lines: canon(up) === canon(["UNPAID_LEAVE:-100000@2031-03-13", "UNPAID_LEAVE:-100000@2031-03-14"]) }, "carry-top +3.0 ⇒ 3 / 2 · −200,000 · Σ 0", short({ q: q?.reason ?? q, top, ...x, up }, 260));
    }
    {
      const x = await look(m3.id), up = await L.unpaid(mar?.id, E3);
      ck("V8.3", { setup, revoke: rv3?.ok === true, use: canon(x.us) === canon(["-2|unpaid:3.0;from:2031-03-12", "-1.5|resplit;unpaid:1.5;from:2031-03-13"]), split: x.eq && x.paid === 3.5 && num(x.sp?.unpaidDays) === 1.5, sum: (await L.sum(E3, sick)) === 0,
        lines: canon(up) === canon(["UNPAID_LEAVE:-100000@2031-03-14", "UNPAID_LEAVE:-50000@2031-03-13"]) && tot(up) === -150_000 }, "3.5 / 1.5 · −150,000 · Σ 0", short({ rv3: rv3?.reason ?? rv3, ...x, up }, 260));
    }
    {
      const x = await look(m5.id), y = await look(a5.id);
      ck("V8.5", { setup, revoke: rv5?.ok === true, march: canon(x.us) === canon(["-2|unpaid:3.0;from:2031-03-12", "-3|resplit;unpaid:0.0"]) && x.eq, april: canon(y.us) === canon(["0|unpaid:5.0;from:2031-04-07"]), sum: (await L.sum(E5, sick)) === 0 && (await L.sum(E5, sick)) >= 0 }, "March 5/0 · April 0/5", short({ rv5: rv5?.reason ?? rv5, m: x.us, a: y.us }, 240));
    }
    { // V8.7: revoke the re-split March leave of E1 (no APPROVED March run here) ⇒ use-revert = Σ of its USE rows
      const rv = await L.dec(s, m1.id, "REJECTED", "APPROVED");
      const back = (await rows(`SELECT days::text AS d FROM "HrLeaveBalanceTxn" WHERE "sourceKey" = $1`, `use-revert:${m1.id}`))[0];
      ck("V8.7", { setup, revoke: rv?.ok === true, back: num(back?.d) === 5, sum: (await L.sum(E1, sick)) === 30 }, "+5.0 · Σ 30.0", short({ rv: rv?.reason ?? rv, back }, 160));
    }
    // control: March run APPROVED before the return
    const sb = await KA.sys("คืนวันป่วยเดือนปิด-V8"), sickB = await L.pol(sb, "SICK", true, 30), shB = await KA.shift(sb);
    const E4 = await KA.emp(sb, "V84");
    const [j4] = await L.used(sb, E4, sickB, JAN28);
    await L.rosterDays(sb, shB, E4, MAR);
    const m4 = await L.reqDec(sb, E4, MAR[0]!, MAR[4]!, sickB);
    await L.judge();
    const mb = await KA.create(sb, "2031-03");
    const mba = mb?.id ? await KA.approve(sb, mb.id) : mb;
    const rv4 = await L.dec(sb, j4, "REJECTED", "APPROVED");
    const u4 = await L.uses(m4.id);
    ck("V8.4", { setup: m4.d?.ok === true && mba?.ok === true, revoke: rv4?.ok === true, use: canon(u4.map((u: Any) => `${num(u.d)}|${u.note}`)) === canon(["-2|unpaid:3.0;from:2031-03-12"]), sum: (await L.sum(E4, sickB)) === 28 }, "unchanged · Σ 28.0", short({ mb: mb?.reason ?? mba, rv4: rv4?.reason ?? rv4, u4 }, 240));
  });

  // ── V7: OT filing reply for borrowed employees (KB) ──
  await section("V7", async () => {
    const K = KB, s = await K.sys("ยื่นโอที-V7");
    const from = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    const eB = await K.emp(s, "V7B", { unit: K.u2, salary: 4_560_000 }), eD = await K.emp(s, "V7D", { unit: K.u2, salary: 9_120_000 }), eN = await K.emp(s, "V7N", { unit: K.u2 }), eA = await K.emp(s, "V7A", { unit: K.u1, salary: 3_000_000 });
    await P.hrSalaryProfile.deleteMany({ where: { employeeId: eN } });
    for (const e of [eB, eD, eN]) await P.hrEmployeeUnit.create({ data: { tenantId: K.TT, systemId: s, employeeId: e, unitId: K.u1, fromDate: dd(from), toDate: null } });
    const file = (w: Any, e: string): Promise<Any> => {
      const f = new FormData();
      for (const [k, v] of Object.entries({ employeeId: e, periodKey: "2031-05", kind: "OT", hours: "1", note: "qc" })) f.set(k, v);
      return inS(w.cookie, `/app/sys/${s}/hr/payroll`, () => ACT.requestAdjustmentAction(s, { status: "idle" }, f)).catch((x: unknown) => ({ __throw: errText(x) }));
    };
    const nOf = async (e: string, pk = "2031-05") => Number((await rows(`SELECT count(*)::int AS n FROM "HrPayAdjustment" WHERE "employeeId" = $1 AND "periodKey" = $2`, e, pk))[0]?.n ?? -1);
    const [rB, rD, rN] = [await file(K.U.lim, eB), await file(K.U.lim, eD), await file(K.U.lim, eN)];
    const msgN = String(rN?.message ?? "");
    ck("V7.1", { success: rB?.status === "ok" && !/\d/.test(String(rB?.message ?? "∅")) && canon(rB) === canon(rD), noProfile: !!rN && rN.status !== "ok" && isThai(msgN) && !/\d/.test(msgN) && msgN !== rB?.message, nothing: (await nOf(eN)) === 0 }, "neutral ok ×2 · fixed refusal", short({ rB, rD, rN }, 300));
    {
      const feb = await K.create(s, "2031-02");
      const fa = feb?.id ? await K.approve(s, feb.id) : feb;
      const fileP = (w: Any, e: string): Promise<Any> => { const f = new FormData(); for (const [k, v] of Object.entries({ employeeId: e, periodKey: "2031-02", kind: "OT", hours: "1", note: "qc" })) f.set(k, v); return inS(w.cookie, `/app/sys/${s}/hr/payroll`, () => ACT.requestAdjustmentAction(s, { status: "idle" }, f)).catch((x: unknown) => ({ __throw: errText(x) })); };
      const n0 = await nOf(eB, "2031-02");
      const [l, a] = [await fileP(K.U.lim, eB), await fileP(K.U.all, eB)];
      ck("V7.4", { setup: fa?.ok === true, same: canon(l) === canon(a), refused: l?.status !== "ok", nothing: (await nOf(eB, "2031-02")) === n0 }, "pass-through", short({ l, a }, 200));
    }
    const rA = await file(K.U.lim, eA); // in-scope row (OT 1 h of 30,000 ฿ = 187.50 ฿) — positive control of the page matcher
    const mine = ((await safe(() => PAY.listAdjustments(K.c(s), undefined, 200, { unitIds: [K.u1] }))) ?? []) as Any[];
    const pg = await page(K.U.lim, s);
    // visible text only (tags, attributes = ids/testids, script payloads removed) · money as rendered: ฿<n>[.dd] or <n>[.dd] บาท, n with th-TH grouping
    const text = pg.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;|\s+/g, " ");
    const money = (satang: number) => { const b = satang / 100, ns = [...new Set([b.toLocaleString("th-TH"), b.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })])].map((x) => x.replace(/[.,]/g, "\\$&"));
      return new RegExp(`(?:฿\\s?(?:${ns.join("|")})(?![\\d.,]*\\d)|(?<![\\d.,])(?:${ns.join("|")})\\s?บาท)`); };
    ck("V7.2", { list: Array.isArray(mine) && !mine.some((x) => [eB, eD, eN].includes(x.employeeId)), rendered: !pg.startsWith("THROW"), hidden: !money(28_500).test(text) && !money(57_000).test(text), control: mine.some((x) => x.employeeId === eA) && money(18_750).test(text) },
      "not shown · in-scope amount shown", short({ n: mine.length, hit: [money(28_500).exec(text)?.[0], money(57_000).exec(text)?.[0], money(18_750).exec(text)?.[0]] }, 160));
    const rAll = await file(K.U.all, eB);
    ck("V7.3", { inScope: rA?.status === "ok" && rA?.message === "ยื่นแล้ว 187.5 บาท — รออนุมัติ", all: rAll?.status === "ok" && /285/.test(String(rAll?.message)) }, "amounts kept", short({ rA, rAll }, 200));
  });

  // ── V5.5 page + V9 leaver refund carried by the October draft (KB) ──
  await section("V9", async () => {
    const K = KB, s = await K.sys("คืนค้างหน้า-V5"), c = K.c(s);
    const e = await K.emp(s, "V5E", { salary: 2_000_000 }), eU = await K.emp(s, "V5U", { salary: 2_000_000, unit: K.u2 });
    const cE = (await K.adj(s, e, "2031-03", "DEDUCTION", 150_000)).id, cU = (await K.adj(s, eU, "2031-03", "DEDUCTION", 150_000)).id;
    const m = await K.create(s, "2031-03");
    const ma = m?.id ? await K.approve(s, m.id) : m;
    const [gE, gU] = [await K.giveBack(s, cE, 50_000, "2031-04"), await K.giveBack(s, cU, 50_000, "2031-04")];
    for (const g of [gE, gU]) if (g?.id) await safe(() => PAY.decideAdjustment(c, g.id, "APPROVED", K.ownA));
    const my = await K.create(s, "2031-05");
    const mya = my?.id ? await K.approve(s, my.id) : my;
    const tid = (id: string) => `hr-payroll-stranded-${id}-move`;
    const [own, lim] = [await page(K.U.owner, s), await page(K.U.lim, s)];
    ck("V5.5", { setup: ma?.ok === true && mya?.ok === true && !!gE?.id && !!gU?.id, owner: own.includes(tid(gU?.id ?? "∅")) && own.includes(tid(gE?.id ?? "∅")), hidden: !lim.includes(tid(gU?.id ?? "∅")), inScope: lim.includes(tid(gE?.id ?? "∅")) }, "hidden from [u1]", short({ own: own.slice(0, 60), lim: lim.slice(0, 60) }, 160));
    // V9 (hunter q2): claim Jul · refund into Aug · Sep approved · Oct DRAFT · employment ends 31 Oct
    const s9 = await K.sys("คืนค้างลาออก-V9"), c9 = K.c(s9);
    const e9 = await K.emp(s9, "V9", { salary: 2_000_000 });
    const cl = (await K.adj(s9, e9, "2031-07", "DEDUCTION", 150_000)).id;
    const jul = await K.create(s9, "2031-07");
    const jula = jul?.id ? await K.approve(s9, jul.id) : jul;
    const g = await K.giveBack(s9, cl, 50_000, "2031-08");
    if (g?.id) await safe(() => PAY.decideAdjustment(c9, g.id, "APPROVED", K.ownA));
    const sep = await K.create(s9, "2031-09");
    const sepa = sep?.id ? await K.approve(s9, sep.id) : sep;
    const oct = await K.create(s9, "2031-10");
    await P.hrEmployee.update({ where: { id: e9 }, data: { endDate: dd("2031-10-31") } });
    const mv = g?.id ? await safe(() => PAY.moveStrandedAdjustment(c9, g.id, K.ownA)) : g;
    const rc = oct?.id ? await safe(() => PAY.recomputeDraftRun(c9, oct.id, { userId: K.U.pay1.id, isOwner: false }, { viewer: K.V.pay1, now: nowOf("2031-10") })) : oct;
    const oa = oct?.id ? await K.approve(s9, oct.id) : oct;
    const lines = oct?.id ? (await linesOf(oct.id, e9)).map((x) => x.replace(/@.*$/, "")).filter((x) => x.startsWith("REFUND")) : [];
    const paidOnce = Number((await rows(`SELECT COALESCE(SUM(a."amountSatang"), 0)::bigint AS n FROM "HrPayAdjustment" a JOIN "HrPayrollRun" r ON r.id = a."runId" WHERE a.id = $1 AND r.status::text IN ('APPROVED','PAID')`, g?.id ?? ""))[0]?.n ?? -1);
    const r9 = await adjOf(g?.id ?? "");
    ck("V9.1", { setup: jula?.ok === true && sepa?.ok === true && !!oct?.id && !!g?.id, moved: mv?.ok === true && mv?.movedTo === "2031-10", approved: oa?.ok === true, line: canon(lines) === canon(["REFUND:50000"]), once: paidOnce === 50_000 && r9?.r === oct?.id && r9?.p === "2031-10" },
      "→ 2031-10 · paid once", short({ mv, rc: rc?.ok ?? rc, oa: oa?.code ?? oa?.ok, lines, paidOnce }, 260));
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
