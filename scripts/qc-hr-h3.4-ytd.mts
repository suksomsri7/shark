// QC — HR V2 · H3.4-YTD opening year-to-date per employee (pay of THIS employer before its first SHARK run of the tax year) ·
//      v2 projection · missing-opening warning (Q15) · 50 ทวิ / ภ.ง.ด.1ก / tax-year · brief ledger/hr-briefs/hr-brief-H3.4-YTD.md (+ CONTROLLER RULINGS)
//      list ledger/wo-notes/hr-H3.4-YTD-oracle.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 Every amount is hand arithmetic of brief §6 (lib LIT/OPEN), re-derived by the lib's own formula in S2.0 — never by the code under test.
// Product functions are loaded dynamically: absent ⇒ the group is RED "missing …" (no crash). H3.8 slip history is NOT here (ruling Q12).
// Lock contract assumed (brief R4 + H3.6): save/clear take hr50:<sys>:<emp>:<year> with hashtextextended(key, 36) — the key issueOne already uses.
//    The hr:ytd seed is not specified, so races hold the KNOWN neighbour locks (period lock seed 0 · hr50 seed 36) and detect waiting with
//    pg_blocking_pids (lib underLock) — no sleep-based luck.
// Tenants qc-hr-h34y-<stamp> · 2031 · opts.now injected · QC-only law rows qc-ytd-<tag>-* (H3.4 values) deleted at the end · SKIP while the pure file is absent.
// Base for statics = QC_H34Y_BASE, else merge-base(HEAD, session/hr) when it descends from merge-base(HEAD, origin/session/hr) (as qc-hr-h3.7).
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-h3.4-ytd.mts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  type Any, type Base, type Sev, type Who, ROOT, errText, short, canon, isThai, srt, loadOpt, modState, baseRef, commitInBase, pathInBase, makeRegistry, qc4Env,
  makeFixtures, cleanupFx, residueOf, vOf, fitnessNoEnv, tagOf, jsonOf, HR_FORBIDDEN_DTO_KEYS,
} from "./qc-hr-lib.mjs";
import { F, OPEN, LIT, M, runStatics, runPure, underLock, deepSome } from "./qc-hr-h3.4-ytd-lib.mjs";

const SUITE = "qc-hr-h3.4-ytd";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h34y-";
const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|R1|C|R|[static] migration 20270110000001_hr_opening_ytd: table · CHECK wht ≤ income · year(asOf) = taxYear · months 0–12 · year 2000–2400 · ≥ 0 · rev ≥ 1 · UNIQUE (sys, emp, year, rev) · partial unique live · FK RESTRICT · additive
S1.2|R1|C|R|[static] schema model HrPayrollOpeningYtd · hr.prisma back-relation · core/scope.ts sys() · hr-qc-env delete order
S1.3|R2|C|R|[static] pure payroll-opening-rules.ts: type-only imports · no db/clock/random · exports OPENING_TEXT parseOpening withOpening openingMissing openingFilingItem
S1.4|§5|C|R|[static] every hunk outside the new files carries "HR H3.4-YTD" (messages/inventory additive) · payroll.ts + filings/service.ts + reports.ts touched
S1.5|§5|C|G|[static] [control] frozen files identical vs base · other oracles only ORACLE-EDIT H3.4-YTD hunks (h3.7 · h0.1 · h3.8) · payroll-rules sha
S1.6|R4|C|R|[static] save/clear lock hr50 (seed 36) then hr:ytd · payroll.ts and 50 ทวิ issue take hr:ytd · tx client only inside $transaction
S1.7|R9 R11|C|R|[static] opening code: no ID/bank fields · no account import (no JV) · no outbox · not in AI tools/outbox consumers · actions "use server"
S1.8|§4|m|R|[static] UI testids hr-ytd-* · role=alert · review YTD_OPENING links #hr-ytd-card · payroll page card · hr.ytd th=en · inventory wo H3.4-YTD · tokens · 44 px
S1.9|X12|M|G|[run] [control] fitness + fitness-hr without env ⇒ exit 0
S2.0|fix|C|G|[pure] [control] worked example re-derived (205,000 · 17,083 · 136,664 · 17,084 · 22,779/22,779/22,778 · 51,250) + base whtYtdV2 agrees
S2.1|A1 A2 A5 A9|C|R|[pure] withOpening → whtYtdV2 Sept: no opening 0 · opening 17,084 · WHT-0 opening 51,250 · SSO 1,000,000 still 17,084
S2.2|R2 A8|C|R|[pure] withOpening adds only same tax year ∧ asOf < onDay · BKK 2031-12-31T16:59:59Z in / T17:00Z out · input untouched
S2.3|R2 A9|C|R|[pure] parseOpening vectors (FIELDS · WHT_OVER · AS_OF · months ≤ month(asOf) · safe ints) · reason = OPENING_TEXT
S2.4|Q15|C|R|[pure] openingMissing vectors (unknown start warns · never in January · start ≥ P-01 no · opening / earlier run no)
S2.5|R2 R6|C|R|[pure] openingFilingItem = FilingItem {runId "opening:<id>", v2, APPROVED, payDate asOf, income, tax = wht, ssoEmployee = sso, other 0}
S3.0|fix|C|G|[db] [control] fixture: tenants · v2/v1 HR systems · employees · profiles · QC law rows ACTIVE
S3.1|A3|C|R|[db] opening saved → v2 Sept run: WHT 17,084 · snapshot ytdOpening {id, rev 1} · ytdJson prior = opening · no YTD_OPENING review · approve ok
S3.2|A3 Q3 Q15|C|R|[db] no opening: create not refused · WHT 0 · ytdOpening "MISSING" · review {employeeId, name, day null, YTD_OPENING} (not for a 09-01 starter) · list state MISSING · approve ok · review kept after approve
S3.3|A4|C|R|[db] catch-up: opening saved after Sept approved at 0 · Oct 22,779 · Nov 22,779 · Dec 22,778 · year WHT 205,000 · Sept item unchanged
S3.4|A5|C|R|[db] opening WHT 0 ⇒ Sept WHT 51,250
S3.5|A6|C|R|[db] DRAFT Sept then opening ⇒ approve INPUTS_CHANGED (still DRAFT, item unchanged) · rebuild ⇒ 17,084 + marker · approve ok
S3.6|A6 Q3|C|R|[db] ORACLE-EDIT (H3.4-YTD fix round · controller ruling 1a/1b/2): zero opening on a DRAFT: YTD_OPENING gone · YTD_REBUILD shown · approve INPUTS_CHANGED · rebuild ⇒ marker = zero row · approve ok · after approve no YTD_OPENING · row months 0 / amounts 0
S3.7|A7 Q5|C|R|[db] OVERLAP vs DRAFT and APPROVED Sept (payDay 09-25 ≤ asOf 09-30) · REVERSED does not count · v2 and v1 create ⇒ OPENING_OVERLAP, no run · refused audits {code}
S3.8|A8|C|R|[db] BKK boundary in DB: payDate 2031-12-31T16:59:59Z uses the 2031 opening · T17:00:00Z does not · asOf 2032-01-01 / future asOf ⇒ AS_OF, nothing written
S3.9|A9|C|R|[db] FIELDS (negative · non-int · string) · WHT_OVER · months > month(asOf) ⇒ FIELDS · year ⇒ YEAR · nothing written · SSO 1,000,000 saved + SSO_HIGH
S3.10|A10 Q10|C|R|[db] rev history: edit ⇒ rev 2, rev 1 intact + superseded · stale expectRev ⇒ REV_CHANGED · clear ⇒ no live row + audit · DB partial unique + CHECK hold
S3.11|A11 Q4|C|R|[db] 50 ทวิ = items + opening (36,000,000 / 205,000 / SSO) · not stale · candidate · live cert ⇒ save CERT_ISSUED + locked · void ⇒ save ok ⇒ re-issue 36,000,100
S3.12|A12 Q6|C|R|[db] ภ.ง.ด.1ก 2031 includes the opening · opening-only leaver listed (1ก + candidates) · ภ.ง.ด.1 2031-08 / 2031-09 and สปส.1-10 bytes identical with and without openings
S3.13|A13 Q7|C|R|[db] tax-year = items + opening (income · wht · SSO · months 12) + one extra note · without ⇒ items only · tax-month / payroll-year identical with and without
S3.14|A14 Q2|C|R|[db] engine-v1 shop: save ok · v1 WHT 17,083 (golden) · 50 ทวิ and 1ก include the opening (27,000,000 / 153,747)
S3.15|A15 R8|C|R|[db] viewer matrix list/save/bulk/clear: owner + gate holder ([] read+pay) ok · unit list · no pay · manager · staff HR key · member · the employee · other tenant · role claim ≠ DB ⇒ NO identical, nothing written · own row ⇒ OWN
S3.16|A16 R9|C|R|[db] DTO keys exact · no sensitive keys · manager preview without YTD_OPENING / opening amounts · no outbox event
S3.17|A17 R10|C|R|[db] audits save {employeeId, taxYear, rev, by ONE|BULK} · clear {employeeId, taxYear, rev} · refused {code} · no ฿ in any opening audit · refused bulk writes none
S3.19|Q12|C|R|[db] ORACLE-EDIT (H3.4-YTD · controller ruling Q12): H3.8 slip history 2031 = 50 ทวิ (income · tax · SSO incl. the opening) · one "opening" line (asOf · months · amounts) · slips/count/net unchanged · payroll reader ✓ · manager / member / other tenant refused · never on a single slip · no key without an opening · gone after clear
S2.6|fix 4 · hunt P3|C|R|[pure] ORACLE-EDIT (H3.4-YTD fix round · controller ruling 4/8): parseOpening asOf before startDay ⇒ FIELDS (= start ok) · over-withheld opening ⇒ whtYtdV2 0 (never negative)
S3.20|fix 1b 2|C|R|[db] ORACLE-EDIT (H3.4-YTD fix round · controller ruling 1b/2): DRAFT + revision of same amounts (months/asOf) ⇒ YTD_REBUILD · approve INPUTS_CHANGED · clear on DRAFT ⇒ YTD_REBUILD · rebuild ⇒ marker = live rev · approve ok · approved marker names the live rev
S3.21|fix 3|C|R|[db] ORACLE-EDIT (H3.4-YTD fix round · controller ruling 3): bulk unchanged rows ⇒ no new rev/audit · own unchanged row passes (changed own row ⇒ OWN, nothing written) · 301 changed ⇒ FIELDS · 300 changed ⇒ ok < 20 s (timed) · list > 500 ⇒ truncated + 500 rows
S3.22|fix 4|C|R|[db] ORACLE-EDIT (H3.4-YTD fix round · controller ruling 4): asOf before the employee's start date ⇒ FIELDS, nothing written · asOf = start date ok
S3.18|Q9|C|R|[db] bulk: all-or-nothing (one bad row ⇒ nothing) · 301 rows refused · 2 rows ⇒ 2 live rows rev 1
S4.1|A19|C|R|[race] save ∥ create: period lock held ⇒ save first ⇒ item holds {id, rev} · hr50 held ⇒ create first ⇒ approve INPUTS_CHANGED · free run ⇒ one of the two
S4.2|A20|C|R|[race] save ∥ 50 ทวิ issue (both wait on hr50): cert includes the opening, or save ⇒ CERT_ISSUED
S4.3|A21|C|R|[race] two saves, same expectRev, both waiting ⇒ one ok · one REV_CHANGED · one live row
S4.4|A22|C|R|[race] bulk ∥ single on a shared employee, both waiting ⇒ serial, no deadlock · exactly one wins · all-or-nothing kept
Z1|house|C|G|no residue · QC law rows removed · ACTIVE law count restored
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H3.4Y-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H3.4Y-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.pure))) skipReasons.push(`${F.pure} absent (H3.4-YTD not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") =>
  chk(id, Object.values(r).every(Boolean), exp, `${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "all"}${extra ? ` ${extra}` : ""}`);
const BASE0 = baseRef("QC_H34Y_BASE");
const LOCAL_MB = (() => {
  try {
    return execFileSync("git", ["merge-base", "HEAD", "session/hr"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
})();
const BASE = !process.env.QC_H34Y_BASE && LOCAL_MB && LOCAL_MB !== BASE0 && (!BASE0 || commitInBase(BASE0, LOCAL_MB)) ? LOCAL_MB : BASE0;
const IN_BASE = !!BASE && pathInBase(F.pure, BASE); // in-base guard: once H3.4-YTD is merged the diff statics have nothing left to judge
const GROUP_FAIL: string[] = [];
async function blk(ids: string[], fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    GROUP_FAIL.push(`${ids[0]}: ${errText(e)}`);
    for (const id of ids) chk(id, false, "checked", `group: ${errText(e).slice(0, 150)}`);
  }
}

const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const R = await loadOpt(F.pure, "@/lib/modules/hr/payroll-opening-rules");
const OPM = await loadOpt(F.svc, "@/lib/modules/hr/payroll-opening");
const V2 = (await import("@/lib/modules/hr/payroll-rules-v2")) as Any;
const PAY = (await import("@/lib/modules/hr/payroll")) as Any;
const FS = (await import("@/lib/modules/hr/filings/service")) as Any;
const REP = (await import("@/lib/modules/hr/reports")) as Any;
const RR = (await import("@/lib/modules/hr/reports-rules")) as Any;
const SYS = (await import("@/lib/modules/system/service")) as Any;
const PS = (await import("@/lib/modules/hr/payslip").catch(() => ({}))) as Any; // ORACLE-EDIT (H3.4-YTD · controller ruling Q12): H3.8 slip history ◂
console.log(`[${SUITE}] pure=${modState(R, F.pure)} · svc=${modState(OPM, F.svc)} · base=${BASE.slice(0, 9)}${IN_BASE ? " (H3.4-YTD in base)" : ""}`);
const LAWJ = (jsonOf("scripts/fixtures/hr-h3.4-vectors.json")?.law ?? {}) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const LAW_KEY = `qc-ytd-${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const rows = async (sql: string, ...p: unknown[]) => (await fx.rawRows(sql, ...p)) ?? [];
let actBefore = -1;
let crashed = "";

// ── calls ──
const has = (...n: string[]) => n.filter((x) => typeof OPM?.[x] !== "function");
const need = (...n: string[]) => {
  const m = has(...n);
  if (m.length) throw new Error(`missing ${m.join(",")} (${modState(OPM, F.svc)})`);
};
const op = (fn: string, ...a: unknown[]): Promise<Any> => (typeof OPM?.[fn] === "function" ? Promise.resolve().then(() => OPM[fn](...a)).catch((e: unknown) => ({ ok: false, code: "THROW", reason: errText(e) })) : Promise.resolve({ ok: false, code: "MISSING" }));
const T = (iso: string) => new Date(iso);
const N = { sep10: T("2031-09-10T05:00:00Z"), oct3: T("2031-10-03T05:00:00Z"), jan5: T("2032-01-05T03:00:00Z") };
const MONTHS: Record<string, [string, string]> = { "2031-09": ["2031-09-25T05:00:00Z", "2031-10-02T05:00:00Z"], "2031-10": ["2031-10-25T05:00:00Z", "2031-11-02T05:00:00Z"], "2031-11": ["2031-11-25T05:00:00Z", "2031-12-02T05:00:00Z"], "2031-12": ["2031-12-25T05:00:00Z", "2032-01-02T05:00:00Z"] };
const isCode = (x: Any, c: string) => x?.ok === false && x?.code === c;
const textOk = (x: Any) => Object.values((R?.OPENING_TEXT ?? {}) as Record<string, unknown>).includes(x?.reason) && isThai(String(x?.reason));

async function runDb(): Promise<void> {
  actBefore = Number((await rows(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`))[0]?.n ?? -1);
  for (const [k, kind, from, j] of [["sso", "SSO", "2031-01-01", "SSO"], ["sso2", "SSO", "2031-10-01", "SSO_2572"], ["tax", "TAX_BRACKET", "2031-01-01", "TAX_BRACKET"], ["ded", "DEDUCTION", "2031-01-01", "DEDUCTION"]] as const)
    await P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", $3::date, $4::jsonb, 'ACTIVE'::"HrLawStatus", $1, 'qc h3.4-ytd fixture', 'QC', now())`, `${LAW_KEY}-${k}`, kind, from, JSON.stringify(LAWJ[j] ?? {}));
  const TT = await fx.newTenant("", "QC HR H3.4-YTD ยอดยกมา");
  const T2 = await fx.newTenant("-other", "QC HR H3.4-YTD ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const RP = { "hr.payroll.read": true, "hr.payroll.pay": true };
  const PK = { ...RP, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.reverse": true };
  const mk = (t: string, r: Who["role"], ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC34Y ${t} ${tag}`, r, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", [], {}), pay1: await mk("pay1", "STAFF", ["*"], PK), gate: await mk("gate", "STAFF", [], RP), gateU: await mk("gateu", "STAFF", [u1], RP),
    readOnly: await mk("readonly", "STAFF", ["*"], { "hr.payroll.read": true }), mgr: await mk("mgr", "MANAGER", [u1], {}), staffHr: await mk("staffhr", "STAFF", [u1], { "hr.employee.create": true }),
    member: await mk("member", "STAFF", [], {}), self: await mk("self", "STAFF", [], {}), gateOwn: await mk("gateown", "STAFF", [], RP), other: await mk("other", "OWNER", [], {}, T2),
  };
  const V = Object.fromEntries(Object.entries(U).map(([k, w]) => [k, vOf(w)])) as Record<keyof typeof U, Any>;
  const ownerA = { userId: U.owner.id, isOwner: true };
  const payA = { userId: U.pay1.id, isOwner: false };
  const sys = async (n: string, v2 = true) => {
    const id = (await SYS.createSystem(TT, "HR", `${n} ${tag}`)).id as string;
    if (v2) await P.$executeRawUnsafe(`UPDATE "AppSystem" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{hrPayroll}', COALESCE(settings->'hrPayroll', '{}'::jsonb) || '{"engineVersion": 2}'::jsonb) WHERE id = $1`, id);
    return id;
  };
  const S: Record<string, string> = {};
  for (const n of ["A", "B", "C", "D", "E", "F", "H1", "H2", "R1", "R2", "R3", "G", "BK"]) S[n] = await sys(`ทีม ${n}`); // ORACLE-EDIT (H3.4-YTD fix round · controller ruling): + G (rebuild) · BK (bulk 300/501) ◂
  for (const n of ["V", "V2"]) S[n] = await sys(`ทีม ${n} รุ่น1`, false);
  const c = (n: string) => ({ tenantId: TT, systemId: S[n]! });
  const ADDR = { subdistrict: "ทุ่งพญาไท", district: "ราชเทวี", province: "กรุงเทพมหานคร", postcode: "10400" };
  const emp = async (s: string, n: string, o: { pay?: boolean; nid?: string; start?: string; end?: string; link?: string } = {}) => {
    const id = await fx.mkEmp(TT, S[s]!, `${n} ${tag}`, { startDate: o.start ?? "2030-01-01", unitId: u1, code: n, ...(o.end ? { endDate: o.end } : {}), ...(o.link ? { linkedUserId: o.link } : {}) });
    if (o.nid) await P.hrEmployee.update({ where: { id }, data: { nationalId: o.nid, ...ADDR } });
    if (o.pay !== false) await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: S[s]!, employeeId: id, baseSalarySatang: M, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
    return id;
  };
  const no = { pay: false };
  const E = {
    eA: await emp("A", "A01"), eA2: await emp("A", "A02", no), eA3: await emp("A", "A03", { pay: false, link: U.self.id }), eA4: await emp("A", "A04", no), eA5: await emp("A", "A05", no),
    eA6: await emp("A", "A06", no), eA7: await emp("A", "A07", no), eA8: await emp("A", "A08", no), eG: await emp("A", "A09", { pay: false, link: U.gateOwn.id }),
    eB: await emp("B", "B01", { nid: "1102000123454" }), eB2: await emp("B", "B02", { nid: "3100600999991" }), eB3: await emp("B", "B03", { start: "2031-09-01" }),
    eL: await emp("B", "B04", { pay: false, nid: "1500100123451", end: "2031-05-31" }),
    eC: await emp("C", "C01"), eD: await emp("D", "D01"), eE: await emp("E", "E01"), eF: await emp("F", "F01"), eH1: await emp("H1", "H01"), eH1b: await emp("H1", "H02", no), eH2: await emp("H2", "H03"),
    eG1: await emp("G", "G01"), eG2: await emp("G", "G02"), // ORACLE-EDIT (H3.4-YTD fix round · controller ruling) ◂
    eV: await emp("V", "V01", { nid: "3900100123453" }), eV2: await emp("V2", "V02"), eR1: await emp("R1", "R01"), eR2: await emp("R2", "R02"), eR3: await emp("R3", "R03"),
  };
  const act = Number((await rows(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE' AND "sourceKey" LIKE $1`, `${LAW_KEY}-%`))[0]?.n ?? 0);
  ck("S3.0", { tenants: fx.tenants.length === 2, systems: Object.keys(S).length === 15 /* ORACLE-EDIT (H3.4-YTD fix round · controller ruling) ◂ */, law: act === 4, emps: Object.values(E).every(Boolean) }, "fixture", `law=${act}`);

  // ── helpers ──
  const save = (s: string, who: Any, e: string, o: Record<string, unknown> = {}, now = N.sep10, expectRev: number | null = null) =>
    op("saveOpeningYtd", c(s), who, { employeeId: e, taxYear: 2031, ...OPEN, expectRev, ...o }, { now });
  const openRows = async (e: string) => rows(`SELECT * FROM "HrPayrollOpeningYtd" WHERE "employeeId" = $1 ORDER BY rev`, e);
  const liveOf = async (e: string) => (await openRows(e)).filter((r: Any) => !r.supersededAt);
  const create = (s: string, pk: string, payIso = MONTHS[pk]![0], nowIso = MONTHS[pk]![1]) =>
    PAY.createPayrollRunV2(c(s), V.pay1, { periodKey: pk, payDate: T(payIso) }, { now: T(nowIso), actor: payA }).catch((e: unknown) => ({ ok: false, code: "THROW", reason: errText(e) }));
  const approve = (s: string, id: string) => PAY.approveRun(c(s), id, undefined, ownerA).catch((e: unknown) => ({ ok: false, code: "THROW", note: errText(e) }));
  const item = async (runId: string | undefined, e: string) => (runId ? (await rows(`SELECT * FROM "HrPayrollItem" WHERE "runId" = $1 AND "employeeId" = $2`, runId, e))[0] : undefined);
  const runOf = async (id: string | undefined) => (id ? (await rows(`SELECT id, status::text AS status, "inputDigest" AS d, "stepsJson" AS s FROM "HrPayrollRun" WHERE id = $1`, id))[0] : undefined);
  const preview = (s: string, who: Any, runId: string) => PAY.previewPayrollRunV2(c(s), who, { runId }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  const ytdRev = (x: Any, e: string) => (Array.isArray(x?.review) ? x.review : []).some((r: Any) => r?.employeeId === e && r?.code === "YTD_OPENING" && r?.day === null && typeof r?.name === "string" && r.name.length > 0);
  const marker = (it: Any) => it?.snapshotJson?.ytdOpening;
  const prior = (it: Any) => it?.ytdJson?.prior ?? {};
  const audits = async (action: string, e?: string) => ((await P.auditLog.findMany({ where: { tenantId: TT, action }, orderBy: { createdAt: "asc" } })) as Any[]).filter((a) => !e || a.after?.employeeId === e);
  const listRows = (x: Any): Any[] => (Array.isArray(x) ? x : Array.isArray(x?.rows) ? x.rows : Array.isArray(x?.items) ? x.items : []);
  const NOWC = { now: N.jan5 };
  const PROFILE = { taxId: "0105555000013", branchNo: "000000", employerName: "บริษัท คิวซี ยอดยกมา จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400", deptName: "สำนักงานใหญ่", lto: false, branchType: "", rdUserId: "QCREF00000000000034", rdFormFlag: 1, ssoAccountNo: "9876543210", ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: "นายผู้ลงนาม ทดสอบ", certPrefix: "HR50" };
  const filingSetup = async (s: string, people: [string, string][]) => {
    await FS.saveFilingProfile(c(s), V.owner, PROFILE);
    for (const [e, n] of people) await FS.saveFilingPerson(c(s), V.owner, { employeeId: e, title: "นาย", firstName: n, lastName: "ทดสอบ" });
  };
  const issue = (s: string, e: string) => FS.issueTaxCertificate(c(s), V.owner, { employeeId: e, taxYear: 2031, kind: "ANNUAL" }, NOWC).catch((x: unknown) => ({ ok: false, code: "THROW", reason: errText(x) }));
  const certOf = async (id: string | undefined) => (id ? ((await P.hrTaxCertificate.findUnique({ where: { id } })) as Any)?.contentJson : null);
  const itemSums = async (s: string, e: string) => {
    const r = await rows(`SELECT i."whtSatang" AS w, i."ssoEmployeeSatang" AS s, i."snapshotJson" AS j FROM "HrPayrollItem" i JOIN "HrPayrollRun" r ON r.id = i."runId" WHERE r."systemId" = $1 AND i."employeeId" = $2 AND r.status::text IN ('APPROVED','PAID')`, S[s], e);
    return { n: r.length, inc: r.reduce((t: number, x: Any) => t + Number(x.j?.whtIncomeSatang ?? 0), 0), wht: r.reduce((t: number, x: Any) => t + Number(x.w), 0), sso: r.reduce((t: number, x: Any) => t + Number(x.s), 0) };
  };

  // ── S3.1 A3 with the opening ──
  const runA: Record<string, string> = {};
  await blk(["S3.1"], async () => {
    need("saveOpeningYtd");
    const sv = await save("A", V.owner, E.eA);
    const live = (await liveOf(E.eA))[0];
    const cr = await create("A", "2031-09");
    runA.sep = cr?.id;
    const it = await item(cr?.id, E.eA);
    const pv = await preview("A", V.owner, cr?.id);
    const ap = await approve("A", cr?.id);
    ck("S3.1", {
      saved: sv?.ok === true && sv?.rev === 1 && !!live, created: cr?.ok === true, wht: it?.whtSatang === LIT.a2, marker: marker(it)?.id === live?.id && marker(it)?.rev === 1,
      prior: prior(it).incomeSatang === OPEN.incomeSatang && prior(it).whtSatang === OPEN.whtSatang && prior(it).ssoSatang === OPEN.ssoSatang, noReview: pv?.ok === true && !ytdRev(pv, E.eA), approved: ap?.ok === true,
    }, "17,084 · {id, rev 1}", short({ sv, cr, wht: it?.whtSatang, m: marker(it), ap: ap?.note }, 300));
  });

  // ── S3.2 · S3.3 · S3.11 · S4.2 · S3.12 · S3.13 (system B: one year) ──
  const runB: Record<string, string> = {};
  await blk(["S3.2", "S3.3", "S3.11", "S4.2", "S3.12", "S3.13", "S3.19"], async () => { // ORACLE-EDIT (H3.4-YTD · controller ruling Q12): + S3.19 ◂
    need("saveOpeningYtd", "listOpeningYtd", "clearOpeningYtd");
    const cr = await create("B", "2031-09");
    runB["2031-09"] = cr?.id;
    const it = await item(cr?.id, E.eB);
    const pv0 = await preview("B", V.owner, cr?.id);
    const ls0 = listRows(await op("listOpeningYtd", c("B"), V.owner, { taxYear: 2031 }));
    const ap = await approve("B", cr?.id);
    const pv1 = await preview("B", V.owner, cr?.id);
    ck("S3.2", {
      created: cr?.ok === true, wht: it?.whtSatang === 0, marker: marker(it) === "MISSING", review: ytdRev(pv0, E.eB), starter: pv0?.ok === true && !ytdRev(pv0, E.eB3),
      listed: ls0.some((r) => r?.employeeId === E.eB && r?.state === "MISSING" && r?.opening === null), approved: ap?.ok === true, kept: ytdRev(pv1, E.eB),
    }, "warn, never block", short({ cr, m: marker(it), rv: pv0?.review, ap: ap?.note }, 300));
    // S3.3 catch-up
    const sept0 = canon([it?.whtSatang, it?.grossSatang, it?.snapshotJson]);
    const sv = await save("B", V.owner, E.eB, {}, N.oct3);
    const got: number[] = [];
    const oks: boolean[] = [];
    for (const pk of ["2031-10", "2031-11", "2031-12"]) {
      const r = await create("B", pk);
      runB[pk] = r?.id;
      got.push(Number((await item(r?.id, E.eB))?.whtSatang ?? -1));
      oks.push(r?.ok === true && (await approve("B", r?.id))?.ok === true);
    }
    const ys = await itemSums("B", E.eB);
    const it9 = await item(cr?.id, E.eB);
    ck("S3.3", { saved: sv?.ok === true, oct: got[0] === LIT.oct, nov: got[1] === LIT.nov, dec: got[2] === LIT.dec, approved: oks.every(Boolean), year: ys.wht + OPEN.whtSatang === LIT.annual, septSame: canon([it9?.whtSatang, it9?.grossSatang, it9?.snapshotJson]) === sept0 },
      "22,779 · 22,779 · 22,778 · Σ 205,000", `${got.join("/")} sv=${short(sv, 80)}`);
    // S3.11 50 ทวิ
    await filingSetup("B", [[E.eB, "บีหนึ่ง"], [E.eB2, "บีสอง"], [E.eL, "แอลออก"]]);
    const is1 = await issue("B", E.eB);
    const c1 = await certOf(is1?.certId);
    const lc = await FS.listTaxCertificates(c("B"), V.owner, { taxYear: 2031 });
    const cand = await FS.listCertCandidates(c("B"), V.owner, { taxYear: 2031 });
    const blocked = await save("B", V.owner, E.eB, { incomeSatang: 24_000_100 }, N.jan5, 1);
    const locked = listRows(await op("listOpeningYtd", c("B"), V.owner, { taxYear: 2031 })).find((r) => r?.employeeId === E.eB)?.locked === true;
    const refAud = (await audits("hr.payroll.opening.refused")).some((a) => canon(a.after) === canon({ code: "CERT_ISSUED" }));
    const vd = await FS.voidTaxCertificate(c("B"), V.owner, { certId: is1?.certId, reason: "ทดสอบแก้ยอดยกมา" }, NOWC);
    const ed = await save("B", V.owner, E.eB, { incomeSatang: 24_000_100 }, N.jan5, 1);
    const is2 = await issue("B", E.eB);
    const c2 = await certOf(is2?.certId);
    ck("S3.11", {
      issued: is1?.ok === true, total: c1?.totalSatang === 12 * M && c1?.totalTaxSatang === LIT.annual && c1?.funds?.ssoSatang === OPEN.ssoSatang + ys.sso,
      notStale: (lc?.items ?? []).some((x: Any) => x.id === is1?.certId && x.stale === false), candidate: (cand?.items ?? []).some((x: Any) => x.employeeId === E.eB),
      certIssued: isCode(blocked, "CERT_ISSUED") && textOk(blocked), locked, refusedAudit: refAud, voided: vd?.ok === true, edited: ed?.ok === true && ed?.rev === 2,
      reissued: is2?.ok === true && c2?.totalSatang === 12 * M + 100 && c2?.totalTaxSatang === LIT.annual,
    }, "50 ทวิ = items + opening", short({ is1, t1: [c1?.totalSatang, c1?.totalTaxSatang, c1?.funds], blocked, ed, t2: [c2?.totalSatang] }, 400));
    // S4.2 A20 save ∥ issue on eB2 — both take hr50:<sys>:<emp>:<year> (seed 36)
    {
      const inc2 = (await itemSums("B", E.eB2)).inc;
      const o = await underLock<Any>(P, `hr50:${S.B}:${E.eB2}:2031`, 36, 2, [() => issue("B", E.eB2), () => save("B", V.owner, E.eB2, {}, N.jan5)]);
      const [is, sv2] = o.res;
      const tot = (await certOf(is?.certId))?.totalSatang;
      ck("S4.2", { blocked: o.blocked >= 2, issued: is?.ok === true, invariant: (sv2?.ok === true && tot === inc2 + OPEN.incomeSatang) || (isCode(sv2, "CERT_ISSUED") && tot === inc2) },
        "cert includes it XOR CERT_ISSUED", short({ blocked: o.blocked, sv2, tot, inc2, h: o.holderErr }, 240));
    }
    // S3.12 / S3.13 — with openings, then without (void live certs, clear every live opening of system B)
    const svL = await save("B", V.owner, E.eL, { asOfDay: "2031-05-31", months: 5, incomeSatang: 15_000_000, whtSatang: 0, ssoSatang: 437_500 }, N.jan5);
    const snap = async () => {
      const bytes = async (req: Any) => {
        const g = await FS.generateFiling(c("B"), V.owner, req, NOWC);
        return g?.ok ? Buffer.from(g.bytes).toString("base64") : `✗${g?.code}`;
      };
      const rep = async (report: string, period: string) => REP.loadReport(c("B"), V.owner, { report, period });
      return {
        p1a: await FS.previewFiling(c("B"), V.owner, { kind: "PND1A", period: "2031" }), cand: await FS.listCertCandidates(c("B"), V.owner, { taxYear: 2031 }),
        pnd8: canon(await FS.previewFiling(c("B"), V.owner, { kind: "PND1", period: "2031-08" })), pnd9: await bytes({ kind: "PND1", period: "2031-09" }), sso9: await bytes({ kind: "SSO110", runId: runB["2031-09"] }),
        ty: await rep("tax-year", "2031"), tm: canon((await rep("tax-month", "2031-09"))?.rows), py: canon((await rep("payroll-year", "2031"))?.rows),
      };
    };
    const W = await snap();
    // ORACLE-EDIT (H3.4-YTD · controller ruling Q12) ▸ S3.19 slip history (H3.8) carries the opening once and equals the live 50 ทวิ
    const hist = (v: Any, e: string) => (typeof PS.slipHistory === "function" ? PS.slipHistory(c("B"), v, { employeeId: e, taxYear: 2031 }).catch((x: unknown) => ({ ok: false, code: "THROW", reason: errText(x) })) : Promise.resolve({ ok: false, code: "MISSING" }));
    const hB = await hist(V.owner, E.eB);
    const liveCert = ((await P.hrTaxCertificate.findFirst({ where: { tenantId: TT, systemId: S.B, employeeId: E.eB, taxYear: 2031, voidedAt: null } })) as Any)?.contentJson;
    const hR = await hist(V.readOnly, E.eB);
    const hRefused = [await hist(V.mgr, E.eB), await hist(V.member, E.eB), await hist(V.other, E.eB)];
    const hB3 = await hist(V.owner, E.eB3);
    const one = typeof PS.slipForViewer === "function" ? await PS.slipForViewer(c("B"), V.owner, { runId: runB["2031-10"], employeeId: E.eB }).catch(() => null) : null;
    const yB = hB?.year ?? {};
    const q12 = {
      fifty: hB?.ok === true && !!liveCert && yB.incomeSatang === liveCert.totalSatang && yB.taxSatang === liveCert.totalTaxSatang && yB.ssoSatang === liveCert.funds?.ssoSatang,
      line: canon(yB.opening) === canon({ asOfDay: OPEN.asOfDay, months: OPEN.months, incomeSatang: OPEN.incomeSatang + 100, taxSatang: OPEN.whtSatang, ssoSatang: OPEN.ssoSatang }),
      once: JSON.stringify(hB ?? {}).split('"opening"').length === 2 && yB.count === 4 && (yB.slips ?? []).length === 4,
      reader: hR?.ok === true && canon(hR?.year?.opening) === canon(yB.opening),
      refused: hRefused.every((x: Any) => x?.ok === false && !JSON.stringify(x).includes(String(OPEN.incomeSatang + 100))),
      notOnSlip: one?.ok === true && !JSON.stringify(one).includes("opening") && !JSON.stringify(one).includes(String(OPEN.incomeSatang + 100)),
      absent: hB3?.ok === true && !("opening" in (hB3?.year ?? {})),
    };
    // ◂ ORACLE-EDIT (H3.4-YTD · controller ruling Q12)
    for (const x of ((await P.hrTaxCertificate.findMany({ where: { tenantId: TT, systemId: S.B, voidedAt: null } })) as Any[])) await FS.voidTaxCertificate(c("B"), V.owner, { certId: x.id, reason: "ทดสอบล้างยอดยกมา" }, NOWC);
    const clr: Any[] = [];
    const liveBefore = (await liveOf(E.eB)).length + (await liveOf(E.eB2)).length + (await liveOf(E.eL)).length; // ORACLE-EDIT (H3.4-YTD · controller ruling OE-1): live openings right before the clear step (eB2 depends on the S4.2 race) ◂
    for (const e of [E.eB, E.eB2, E.eL]) for (const r of await liveOf(e)) clr.push(await op("clearOpeningYtd", c("B"), V.owner, { employeeId: e, taxYear: 2031, expectRev: r.rev }, NOWC));
    const O = await snap();
    const hO = await hist(V.owner, E.eB); // ORACLE-EDIT (H3.4-YTD · controller ruling Q12) ▸ after clear: no opening line, items only ◂
    ck("S3.19", { ...q12, cleared: hO?.ok === true && !("opening" in (hO?.year ?? {})) && hO?.year?.incomeSatang === 12 * M - OPEN.incomeSatang }, "slip history = 50 ทวิ · one opening line · gated", short({ y: { ...yB, slips: undefined }, cert: [liveCert?.totalSatang, liveCert?.totalTaxSatang] }, 300)); // ORACLE-EDIT (H3.4-YTD · controller ruling Q12) ◂
    const sumOf = (p: Any, e: string, k: string) => ((p?.rows ?? []) as Any[]).filter((r) => r.employeeId === e).reduce((t, r) => t + Number(r[k] ?? 0), 0);
    ck("S3.12", {
      leaverSaved: svL?.ok === true, p1a: sumOf(W.p1a, E.eB, "amountSatang") === 12 * M + 100 && sumOf(W.p1a, E.eB, "taxSatang") === LIT.annual, leaver: sumOf(W.p1a, E.eL, "amountSatang") === 15_000_000,
      leaverCand: (W.cand?.items ?? []).some((x: Any) => x.employeeId === E.eL), cleared: liveBefore >= 2 && clr.length === liveBefore && clr.every((x) => x?.ok === true) /* ORACLE-EDIT (H3.4-YTD · controller ruling OE-1) ◂ */, without: sumOf(O.p1a, E.eB, "amountSatang") === 12 * M - OPEN.incomeSatang,
      pnd8: W.pnd8 === O.pnd8, pnd9: !W.pnd9.startsWith("✗") && W.pnd9 === O.pnd9, sso9: !W.sso9.startsWith("✗") && W.sso9 === O.sso9,
    }, "1ก with opening · monthly bytes identical", short({ p1a: (W.p1a?.rows ?? []).map((r: Any) => [r.employeeId === E.eB ? "B" : r.employeeId === E.eL ? "L" : "o", r.amountSatang]), pnd9: W.pnd9.slice(0, 12), sso9: W.sso9.slice(0, 12), clr }, 400));
    const tyRow = (x: Any) => ((x?.rows ?? []) as Any[]).find((r) => r.employeeId === E.eB)?.values ?? {};
    const b = (n: number) => RR.bahtText(n);
    const notesW = (W.ty?.notes ?? []) as string[];
    const notesO = (O.ty?.notes ?? []) as string[];
    ck("S3.13", {
      with: tyRow(W.ty).income === b(12 * M + 100) && tyRow(W.ty).wht === b(LIT.annual) && tyRow(W.ty).ssoEmployee === b(OPEN.ssoSatang + ys.sso) && tyRow(W.ty).months === "12",
      without: tyRow(O.ty).income === b(4 * M) && tyRow(O.ty).months === "4", note: notesW.length === notesO.length + 1 && notesO.every((n) => notesW.includes(n)) && notesW.some((n) => !notesO.includes(n) && isThai(n)),
      taxMonth: W.tm === O.tm && W.tm !== canon(undefined), payrollYear: W.py === O.py && W.py !== canon(undefined),
    }, "tax-year only", short({ w: tyRow(W.ty), o: tyRow(O.ty), notesW }, 300));
  });

  // ── S3.4 A5 · S3.5 A6 · S3.6 A6 zero ──
  await blk(["S3.4"], async () => {
    need("saveOpeningYtd");
    const sv = await save("C", V.owner, E.eC, { whtSatang: 0 });
    const cr = await create("C", "2031-09");
    chk("S3.4", sv?.ok === true && Number((await item(cr?.id, E.eC))?.whtSatang) === LIT.a5, "51,250", short({ sv, cr }, 160));
  });
  await blk(["S3.5"], async () => {
    need("saveOpeningYtd");
    const cr = await create("D", "2031-09");
    const it0 = await item(cr?.id, E.eD);
    const sv = await save("D", V.owner, E.eD, {}, N.oct3);
    const a1 = await approve("D", cr?.id);
    const r1 = await runOf(cr?.id);
    const it1 = await item(cr?.id, E.eD);
    const rb = await PAY.recomputeDraftRun(c("D"), cr?.id, payA, { viewer: V.pay1, now: T("2031-10-03T06:00:00Z") }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const it2 = await item(cr?.id, E.eD);
    const live = (await liveOf(E.eD))[0];
    const a2 = await approve("D", cr?.id);
    ck("S3.5", {
      first: it0?.whtSatang === 0, saved: sv?.ok === true, changed: a1?.ok === false && a1?.code === "INPUTS_CHANGED", untouched: r1?.status === "DRAFT" && r1?.s?.finalized !== true && it1?.id === it0?.id && it1?.whtSatang === 0,
      rebuilt: rb?.ok === true && it2?.whtSatang === LIT.a2 && marker(it2)?.id === live?.id, approved: a2?.ok === true,
    }, "INPUTS_CHANGED → rebuild 17,084 → ok", short({ a1, rb, w: it2?.whtSatang, a2: a2?.note }, 300));
  });
  await blk(["S3.6"], async () => { // ORACLE-EDIT (H3.4-YTD fix round · controller ruling) 1a/1b/2: a zero opening is an opening — on a DRAFT it demands a rebuild; after approve no YTD_OPENING ◂
    need("saveOpeningYtd");
    const cr = await create("E", "2031-09");
    const pv0 = await preview("E", V.owner, cr?.id);
    const sv = await save("E", V.owner, E.eE, { months: 0, incomeSatang: 0, whtSatang: 0, ssoSatang: 0 }, N.oct3);
    const pv1 = await preview("E", V.owner, cr?.id);
    const a1 = await approve("E", cr?.id);
    const rb = await PAY.recomputeDraftRun(c("E"), cr?.id, payA, { viewer: V.pay1, now: T("2031-10-03T06:00:00Z") }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const pv2 = await preview("E", V.owner, cr?.id);
    const ap = await approve("E", cr?.id);
    const pv3 = await preview("E", V.owner, cr?.id);
    const r = await runOf(cr?.id);
    const row = (await liveOf(E.eE))[0];
    const it = await item(cr?.id, E.eE);
    const codes = (x: Any) => (Array.isArray(x?.review) ? x.review : []).filter((v: Any) => v?.employeeId === E.eE).map((v: Any) => v.code);
    ck("S3.6", {
      warned: ytdRev(pv0, E.eE), saved: sv?.ok === true, gone: pv1?.ok === true && !ytdRev(pv1, E.eE), rebuildShown: codes(pv1).includes("YTD_REBUILD"), changed: isCode({ ok: a1?.ok, code: a1?.code }, "INPUTS_CHANGED"),
      rebuilt: rb?.ok === true && marker(it)?.id === row?.id && marker(it)?.rev === row?.rev && codes(pv2).length === 0, approved: ap?.ok === true && r?.status === "APPROVED", noWarnAfter: pv3?.ok === true && codes(pv3).length === 0,
      row: !!row && row.months === 0 && Number(row.incomeSatang) === 0 && Number(row.whtSatang) === 0 && Number(row.ssoSatang) === 0,
    }, "zero opening = opening: rebuild, then quiet", short({ c1: codes(pv1), a1: a1?.code, c2: codes(pv2), c3: codes(pv3), m: marker(it) }, 240));
  });
  // ── ORACLE-EDIT (H3.4-YTD fix round · controller ruling) ▸ S3.20 (1b · 2): revision identity is part of the run's inputs ──
  await blk(["S3.20"], async () => {
    need("saveOpeningYtd", "clearOpeningYtd");
    const s1 = await save("G", V.owner, E.eG1);
    const s2 = await save("G", V.owner, E.eG2);
    const cr = await create("G", "2031-09");
    const codes = (x: Any, e: string) => (Array.isArray(x?.review) ? x.review : []).filter((v: Any) => v?.employeeId === e).map((v: Any) => v.code);
    const pv0 = await preview("G", V.owner, cr?.id);
    const d0 = (await runOf(cr?.id))?.d;
    const e1 = await save("G", V.owner, E.eG1, { months: 5, asOfDay: "2031-08-15" }, N.oct3, 1);
    const cl = await op("clearOpeningYtd", c("G"), V.owner, { employeeId: E.eG2, taxYear: 2031, expectRev: 1 }, { now: N.oct3 });
    const pv1 = await preview("G", V.owner, cr?.id);
    const a1 = await approve("G", cr?.id);
    const r1 = await runOf(cr?.id);
    const rb = await PAY.recomputeDraftRun(c("G"), cr?.id, payA, { viewer: V.pay1, now: T("2031-10-03T06:00:00Z") }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const pv2 = await preview("G", V.owner, cr?.id);
    const a2 = await approve("G", cr?.id);
    const it1 = await item(cr?.id, E.eG1);
    const live1 = (await liveOf(E.eG1))[0];
    ck("S3.20", {
      setup: s1?.ok === true && s2?.ok === true && cr?.ok === true && codes(pv0, E.eG1).length === 0 && codes(pv0, E.eG2).length === 0,
      revSameAmounts: e1?.ok === true && e1?.rev === 2 && codes(pv1, E.eG1).includes("YTD_REBUILD"), clearedDraft: cl?.ok === true && codes(pv1, E.eG2).includes("YTD_REBUILD"),
      refused: a1?.ok === false && a1?.code === "INPUTS_CHANGED" && r1?.status === "DRAFT" && r1?.d === d0,
      rebuilt: rb?.ok === true && !codes(pv2, E.eG1).includes("YTD_REBUILD") && !codes(pv2, E.eG2).includes("YTD_REBUILD") && codes(pv2, E.eG2).includes("YTD_OPENING"),
      approvedLive: a2?.ok === true && marker(it1)?.id === live1?.id && marker(it1)?.rev === 2 && it1?.whtSatang === LIT.a2,
    }, "any new rev ⇒ rebuild before approve", short({ c1: [codes(pv1, E.eG1), codes(pv1, E.eG2)], a1: a1?.code, c2: [codes(pv2, E.eG1), codes(pv2, E.eG2)], m: marker(it1) }, 300));
  });
  // ── ORACLE-EDIT (H3.4-YTD fix round · controller ruling) ▸ S3.22 (4): asOf before the start date ──
  await blk(["S3.22"], async () => {
    need("saveOpeningYtd");
    const before = await save("B", V.owner, E.eB3, { asOfDay: "2031-08-31", months: 8, incomeSatang: 100, whtSatang: 0, ssoSatang: 0 }, N.sep10);
    const none = (await openRows(E.eB3)).length === 0;
    const onStart = await save("B", V.owner, E.eB3, { asOfDay: "2031-09-01", months: 0, incomeSatang: 0, whtSatang: 0, ssoSatang: 0 }, N.sep10);
    ck("S3.22", { refused: isCode(before, "FIELDS") && textOk(before), none, onStart: onStart?.ok === true }, "asOf < start ⇒ FIELDS", short({ before, onStart }, 200));
    if (onStart?.ok === true) await op("clearOpeningYtd", c("B"), V.owner, { employeeId: E.eB3, taxYear: 2031, expectRev: onStart.rev }, { now: N.sep10 });
  });

  // ── S3.7 A7 overlap ──
  await blk(["S3.7"], async () => {
    need("saveOpeningYtd");
    const O9 = { asOfDay: "2031-09-30", months: 9, incomeSatang: 27_000_000, whtSatang: 153_747, ssoSatang: 787_500 };
    const cr = await create("F", "2031-09");
    const s1 = await save("F", V.owner, E.eF, O9, N.oct3);
    await approve("F", cr?.id);
    const s2 = await save("F", V.owner, E.eF, O9, N.oct3);
    const rv = await PAY.reverseRun(c("F"), cr?.id, "qc h3.4-ytd", ownerA).catch((e: unknown) => ({ ok: false, note: errText(e) }));
    const s3 = await save("F", V.owner, E.eF, O9, N.oct3);
    const c2 = await create("F", "2031-09");
    const live9 = Number((await rows(`SELECT count(*)::int AS n FROM "HrPayrollRun" WHERE "systemId" = $1 AND status::text <> 'REVERSED'`, S.F))[0]?.n ?? -1);
    const sv1 = await save("V2", V.owner, E.eV2, O9, N.oct3);
    let v1 = "";
    try {
      const r = await PAY.createPayrollRun(c("V2"), { periodKey: "2031-09", payDate: T(MONTHS["2031-09"]![0]) });
      v1 = isCode(r, "OPENING_OVERLAP") ? "refused" : `created ${short(r, 60)}`;
    } catch (e) {
      v1 = (e as Any)?.code === "OPENING_OVERLAP" || textOk({ reason: (e as Error)?.message }) ? "refused" : `threw ${errText(e)}`;
    }
    const v1runs = Number((await rows(`SELECT count(*)::int AS n FROM "HrPayrollRun" WHERE "systemId" = $1`, S.V2))[0]?.n ?? -1);
    const aud = (await audits("hr.payroll.opening.refused")).filter((a) => canon(a.after) === canon({ code: "OVERLAP" })).length;
    ck("S3.7", {
      draft: isCode(s1, "OVERLAP") && textOk(s1), approved: isCode(s2, "OVERLAP"), reversed: rv?.ok === true && s3?.ok === true, v2: isCode(c2, "OPENING_OVERLAP") && live9 === 0,
      v1: sv1?.ok === true && v1 === "refused" && v1runs === 0, audit: aud >= 2,
    }, "OVERLAP · OPENING_OVERLAP v1+v2", short({ s1, s2, rv: rv?.note, s3, c2, v1, aud }, 400));
  });

  // ── S3.8 A8 BKK boundary + AS_OF ──
  await blk(["S3.8"], async () => {
    need("saveOpeningYtd");
    const sa = await save("H1", V.owner, E.eH1);
    const sb = await save("H2", V.owner, E.eH2);
    const r1 = await create("H1", "2031-12", "2031-12-31T16:59:59Z");
    const r2 = await create("H2", "2031-12", "2031-12-31T17:00:00Z");
    const i1 = await item(r1?.id, E.eH1);
    const i2 = await item(r2?.id, E.eH2);
    const a1 = await save("H1", V.owner, E.eH1b, { asOfDay: "2032-01-01", months: 12 }, N.jan5);
    const a2 = await save("H1", V.owner, E.eH1b, { asOfDay: "2031-09-15", months: 9 }, N.sep10);
    ck("S3.8", {
      saved: sa?.ok === true && sb?.ok === true, in: r1?.ok === true && prior(i1).incomeSatang === OPEN.incomeSatang && !!marker(i1)?.id, out: r2?.ok === true && Number(prior(i2).incomeSatang ?? -1) === 0 && !marker(i2)?.id,
      asOfYear: isCode(a1, "AS_OF"), future: isCode(a2, "AS_OF"), none: (await openRows(E.eH1b)).length === 0,
    }, "16:59:59Z in · 17:00Z out · AS_OF", short({ p1: prior(i1), p2: prior(i2), a1, a2 }, 300));
  });

  // ── S3.9 A9 · S3.10 A10 (eA2) ──
  await blk(["S3.9", "S3.10"], async () => {
    need("saveOpeningYtd", "clearOpeningYtd");
    const bad: [Record<string, unknown>, string][] = [[{ incomeSatang: -1 }, "FIELDS"], [{ incomeSatang: 1.5 }, "FIELDS"], [{ incomeSatang: "24000000" }, "FIELDS"], [{ whtSatang: 24_000_001 }, "WHT_OVER"], [{ months: 9 }, "FIELDS"], [{ taxYear: 1999, asOfDay: "1999-08-31" }, "YEAR"]];
    const got = await Promise.all(bad.map(([o]) => save("A", V.owner, E.eA2, o)));
    const wrong = bad.filter(([, cd], i) => !isCode(got[i], cd) || !textOk(got[i])).map(([o, cd], i) => `${short(o, 30)}→${got[i]?.code}≠${cd}`);
    const none = (await openRows(E.eA2)).length === 0 && (await audits("hr.payroll.opening.save", E.eA2)).length === 0;
    const hi = await save("A", V.owner, E.eA2, { ssoSatang: 1_000_000 });
    const r1 = (await openRows(E.eA2))[0];
    ck("S3.9", { refusals: wrong.length === 0, none, saved: hi?.ok === true && Number(r1?.ssoSatang) === 1_000_000, warn: JSON.stringify(hi?.warnings ?? "").includes("SSO_HIGH") }, "refusals · SSO_HIGH", wrong.join(" ") || short(hi, 120));
    const e2 = await save("A", V.owner, E.eA2, { ssoSatang: 700_000 }, N.sep10, 1);
    const all = await openRows(E.eA2);
    const old = all.find((r: Any) => r.rev === 1);
    const stale = await save("A", V.owner, E.eA2, { ssoSatang: 600_000 }, N.sep10, 1);
    const cl = await op("clearOpeningYtd", c("A"), V.owner, { employeeId: E.eA2, taxYear: 2031, expectRev: 2 }, { now: N.sep10 });
    const liveN = (await liveOf(E.eA2)).length;
    const clAud = (await audits("hr.payroll.opening.clear", E.eA2)).some((a) => canon(a.after) === canon({ employeeId: E.eA2, taxYear: 2031, rev: 2 }));
    const again = await save("A", V.owner, E.eA2);
    const ins = (rev: number, wht: number) => P.$executeRawUnsafe(`INSERT INTO "HrPayrollOpeningYtd" ("id","tenantId","systemId","employeeId","taxYear","asOfDay","months","incomeSatang","whtSatang","ssoSatang","rev","createdById","createdAt") VALUES ($1,$2,$3,$4,2031,'2031-08-31'::date,8,100,$5,0,$6,$7,now())`, `qc34y${tag}${rev}`, TT, S.A, E.eA2, wht, rev, U.owner.id).then(() => "inserted", (e: unknown) => `refused ${errText(e).slice(0, 40)}`);
    const dup = await ins(99, 0);
    const chkWht = await ins(98, 200);
    await P.$executeRawUnsafe(`DELETE FROM "HrPayrollOpeningYtd" WHERE id LIKE $1`, `qc34y${tag}%`).catch(() => null);
    ck("S3.10", {
      edit: e2?.ok === true && e2?.rev === 2, history: all.length === 2 && !!old?.supersededAt && Number(old?.ssoSatang) === 1_000_000 && all.filter((r: Any) => !r.supersededAt).length === 1,
      stale: isCode(stale, "REV_CHANGED"), cleared: cl?.ok === true && liveN === 0, clAud, again: again?.ok === true, partialUnique: dup.startsWith("refused"), check: chkWht.startsWith("refused"),
    }, "append-only revs · DB guards", short({ e2, stale, cl, dup, chkWht }, 300));
  });

  // ── S3.14 A14 engine v1 ──
  await blk(["S3.14"], async () => {
    need("saveOpeningYtd");
    const sv = await save("V", V.owner, E.eV);
    const r = await PAY.createPayrollRun(c("V"), { periodKey: "2031-09", payDate: T(MONTHS["2031-09"]![0]) });
    const it = await item(r?.id, E.eV);
    const ap = await PAY.approveRun(c("V"), r?.id);
    await filingSetup("V", [[E.eV, "วีหนึ่ง"]]);
    const is = await issue("V", E.eV);
    const ct = await certOf(is?.certId);
    const p1a = await FS.previewFiling(c("V"), V.owner, { kind: "PND1A", period: "2031" });
    const row = ((p1a?.rows ?? []) as Any[]).filter((x) => x.employeeId === E.eV);
    const want = [OPEN.incomeSatang + M, OPEN.whtSatang + LIT.v1Monthly];
    ck("S3.14", {
      saved: sv?.ok === true, v1: it?.whtSatang === LIT.v1Monthly, approved: ap?.ok === true, cert: ct?.totalSatang === want[0] && ct?.totalTaxSatang === want[1],
      pnd1a: row.reduce((t, x) => t + x.amountSatang, 0) === want[0] && row.reduce((t, x) => t + x.taxSatang, 0) === want[1],
    }, "17,083 · 27,000,000 / 153,747", short({ sv, w: it?.whtSatang, is, t: [ct?.totalSatang, ct?.totalTaxSatang] }, 300));
  });

  // ── S3.15 A15 viewer matrix (eA3) · S3.16 DTO · S3.18 bulk · S3.17 audits ──
  await blk(["S3.15", "S3.16"], async () => {
    need("saveOpeningYtd", "saveOpeningYtdBulk", "listOpeningYtd", "clearOpeningYtd");
    const row = { employeeId: E.eA3, ...OPEN, expectRev: null };
    const refused: Record<string, Any> = { gateU: V.gateU, readOnly: V.readOnly, mgr: V.mgr, staffHr: V.staffHr, member: V.member, self: V.self, other: V.other, claim: { ...V.gate, role: "OWNER" } };
    const outs: string[] = [];
    const a0 = (await P.auditLog.count({ where: { tenantId: TT, action: { startsWith: "hr.payroll.opening" } } })) as number;
    for (const v of Object.values(refused)) {
      outs.push(canon(await op("listOpeningYtd", c("A"), v, { taxYear: 2031 })));
      outs.push(canon(await op("saveOpeningYtd", c("A"), v, { taxYear: 2031, ...row }, { now: N.sep10 })));
      outs.push(canon(await op("saveOpeningYtdBulk", c("A"), v, { taxYear: 2031, rows: [row] }, { now: N.sep10 })));
    }
    const nothing = (await openRows(E.eA3)).length === 0;
    const own = await save("A", V.owner, E.eA3);
    for (const v of Object.values(refused)) outs.push(canon(await op("clearOpeningYtd", c("A"), v, { employeeId: E.eA3, taxYear: 2031, expectRev: 1 }, { now: N.sep10 })));
    const stillLive = (await liveOf(E.eA3)).length === 1;
    const a1 = (await P.auditLog.count({ where: { tenantId: TT, action: { startsWith: "hr.payroll.opening" } } })) as number;
    const gl = await op("listOpeningYtd", c("A"), V.gate, { taxYear: 2031 });
    const gs = await save("A", V.gate, E.eA3, { ssoSatang: 600_000 }, N.sep10, 1);
    const og = await save("A", V.gateOwn, E.eG);
    const ogC = await op("clearOpeningYtd", c("A"), V.gateOwn, { employeeId: E.eG, taxYear: 2031, expectRev: null }, { now: N.sep10 });
    const one = new Set(outs);
    const first = JSON.parse(outs[0] ?? "{}");
    ck("S3.15", {
      identical: one.size === 1 && first.ok === false && first.code === "NO" && isThai(String(first.reason)) && !/\d/.test(String(first.reason)), nothing, ownerOk: own?.ok === true, stillLive, noAudit: a1 === a0 + 1,
      gate: listRows(gl).length > 0 && gs?.ok === true && gs?.rev === 2, ownRow: isCode(og, "OWN") && (isCode(ogC, "OWN") || isCode(ogC, "NO")) && (await openRows(E.eG)).length === 0,
    }, "gate on DB membership · identical NO · OWN", short({ variants: one.size, first, own, gs, og }, 300));
    // S3.16 DTO · manager preview · outbox
    const ol = listRows(await op("listOpeningYtd", c("A"), V.owner, { taxYear: 2031 }));
    const r3 = ol.find((r) => r?.employeeId === E.eA3);
    const ROW_KEYS = srt(["employeeId", "name", "code", "startDay", "state", "opening", "locked"]);
    const OPEN_KEYS = srt(["asOfDay", "months", "incomeSatang", "whtSatang", "ssoSatang", "rev"]);
    const forb = HR_FORBIDDEN_DTO_KEYS.filter((k) => deepSome(ol, (o) => k in o));
    const mB = runB["2031-09"] ? await preview("B", V.mgr, runB["2031-09"]) : { ok: false };
    const mA = runA.sep ? await preview("A", V.mgr, runA.sep) : { ok: false };
    const mj = JSON.stringify([mA, mB]);
    const ids = ((await rows(`SELECT id FROM "HrPayrollOpeningYtd" WHERE "tenantId" = $1`, TT)) as Any[]).map((x) => String(x.id));
    const ob = JSON.stringify(await P.outboxEvent.findMany({ where: { tenantId: TT } }));
    ck("S3.16", {
      rowKeys: ol.length > 0 && ol.every((r) => srt(Object.keys(r ?? {})) === ROW_KEYS), openingKeys: srt(Object.keys(r3?.opening ?? {})) === OPEN_KEYS, forbidden: forb.length === 0,
      mgrPreview: mA?.ok === true && mB?.ok === true && !mj.includes("YTD_OPENING") && !mj.includes(String(OPEN.incomeSatang)) && !mj.includes(String(OPEN.whtSatang)),
      outbox: !/opening/i.test(ob) && ids.length > 0 && ids.every((id) => !ob.includes(id)),
    }, "DTO exact · nothing for managers / outbox", short({ keys: Object.keys(ol[0] ?? {}), forb }, 200));
  });
  await blk(["S3.18", "S3.17"], async () => {
    need("saveOpeningYtdBulk");
    const r = (e: string, o: Record<string, unknown> = {}) => ({ employeeId: e, ...OPEN, expectRev: null, ...o });
    const bad = await op("saveOpeningYtdBulk", c("A"), V.owner, { taxYear: 2031, rows: [r(E.eA6), r(E.eA7, { whtSatang: 99_000_000 })] }, { now: N.sep10 });
    const big = await op("saveOpeningYtdBulk", c("A"), V.owner, { taxYear: 2031, rows: Array.from({ length: 301 }, () => r(E.eA6)) }, { now: N.sep10 });
    const n0 = (await openRows(E.eA6)).length + (await openRows(E.eA7)).length;
    const a0 = (await audits("hr.payroll.opening.save")).filter((a) => [E.eA6, E.eA7].includes(a.after?.employeeId)).length;
    const good = await op("saveOpeningYtdBulk", c("A"), V.owner, { taxYear: 2031, rows: [r(E.eA6), r(E.eA7)] }, { now: N.sep10 });
    const live = [...(await liveOf(E.eA6)), ...(await liveOf(E.eA7))];
    ck("S3.18", { badRefused: bad?.ok === false, bigRefused: big?.ok === false, nothing: n0 === 0 && a0 === 0, good: good?.ok === true && live.length === 2 && live.every((x: Any) => x.rev === 1) }, "all-or-nothing · ≤ 300", short({ bad, big, good }, 240));
    // S3.17 audits
    const sv = await audits("hr.payroll.opening.save");
    const k4 = srt(["employeeId", "taxYear", "rev", "by"]);
    const one = sv.filter((a) => a.after?.employeeId === E.eA);
    const bulk = sv.filter((a) => [E.eA6, E.eA7].includes(a.after?.employeeId));
    const allOpen = ((await P.auditLog.findMany({ where: { tenantId: TT, action: { startsWith: "hr.payroll.opening" } } })) as Any[]);
    // ORACLE-EDIT (H3.4-YTD fix round · controller ruling S3.17) ▸ (a) no audit KEY matches the money pattern · (b) no VALUE anywhere (deep · numbers and numeric strings) equals an opening amount of this fixture (satang or baht) · (c) no number other than taxYear/rev
    const SENT = [OPEN.incomeSatang, OPEN.incomeSatang + 100, OPEN.whtSatang, OPEN.ssoSatang, 1_000_000, 600_000, 650_000, 640_000, 15_000_000, 437_500, 27_000_000, 153_747, 787_500];
    const sentinel = new Set(SENT.flatMap((n) => [String(n), String(n / 100), (n / 100).toFixed(2)]));
    const valuesOf = (v: unknown): unknown[] => (Array.isArray(v) ? v.flatMap(valuesOf) : v && typeof v === "object" ? Object.values(v as Record<string, unknown>).flatMap(valuesOf) : [v]);
    const keysOf = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(keysOf) : v && typeof v === "object" ? Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => [k, ...keysOf(x)]) : []);
    const money = allOpen.filter((a) => /satang|income|wht|sso|amount/i.test(keysOf([a.before, a.after]).join(" ")) || valuesOf([a.before, a.after]).some((v) => (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))) && sentinel.has(String(v))) || Object.values(a.after ?? {}).some((v) => typeof v === "number" && v !== a.after?.taxYear && v !== a.after?.rev)); // ◂ ORACLE-EDIT (H3.4-YTD fix round · controller ruling S3.17)
    ck("S3.17", {
      one: one.length === 1 && srt(Object.keys(one[0]?.after ?? {})) === k4 && one[0]?.after?.by === "ONE" && one[0]?.after?.rev === 1 && one[0]?.after?.taxYear === 2031,
      bulk: bulk.length === 2 && bulk.every((a) => srt(Object.keys(a.after ?? {})) === k4 && a.after?.by === "BULK"), noMoney: allOpen.length > 0 && money.length === 0,
      refusedShape: allOpen.filter((a) => a.action === "hr.payroll.opening.refused").every((a) => srt(Object.keys(a.after ?? {})) === "code" && ["OVERLAP", "CERT_ISSUED"].includes(a.after?.code)),
    }, "audit shapes · no ฿", short({ one: one.map((a) => a.after), money: money.map((a) => a.action) }, 240));
  });

  // ── ORACLE-EDIT (H3.4-YTD fix round · controller ruling) ▸ S3.21 (3): bulk saves only changed rows · 300 changed rows fast · list never cut silently ──
  await blk(["S3.21"], async () => {
    need("saveOpeningYtdBulk", "listOpeningYtd");
    const bulkOf = (v: Any, rows: Any[]) => op("saveOpeningYtdBulk", c("A"), v, { taxYear: 2031, rows }, { now: N.sep10 });
    const same = (e: string, rev: number, o: Record<string, unknown> = {}) => ({ employeeId: e, ...OPEN, expectRev: rev, ...o });
    const revs = async (e: string) => (await openRows(e)).length;
    const saveAud = async () => (await audits("hr.payroll.opening.save")).length;
    // (a) unchanged rows ⇒ no new revision, no audit
    const r7 = (await liveOf(E.eA7))[0];
    const n7 = await revs(E.eA7);
    const a0 = await saveAud();
    const un = await bulkOf(V.owner, [same(E.eA7, Number(r7?.rev))]);
    const unchanged = un?.ok === true && (un?.saved ?? []).length === 0 && (await revs(E.eA7)) === n7 && (await saveAud()) === a0;
    // (b) a non-owner's own row: unchanged passes, changed ⇒ OWN (all-or-nothing)
    const og = await save("A", V.owner, E.eG);
    const r6 = (await liveOf(E.eA6))[0];
    const nG = await revs(E.eG);
    const ownSame = await bulkOf(V.gateOwn, [same(E.eG, Number(og?.rev)), same(E.eA6, Number(r6?.rev), { ssoSatang: 650_000 })]);
    const r6b = (await liveOf(E.eA6))[0];
    const n6 = await revs(E.eA6);
    const ownChanged = await bulkOf(V.gateOwn, [same(E.eG, Number(og?.rev), { ssoSatang: 650_000 }), same(E.eA6, Number(r6b?.rev), { ssoSatang: 640_000 })]);
    const ownOk = og?.ok === true && ownSame?.ok === true && r6b?.rev === Number(r6?.rev) + 1 && (await revs(E.eG)) === nG && isCode(ownChanged, "OWN") && (await revs(E.eA6)) === n6 && (await revs(E.eG)) === nG;
    // (c) 301 changed ⇒ FIELDS · 300 changed ⇒ ok, timed · (d) 501 employees ⇒ list truncated at 500
    await P.$executeRawUnsafe(`INSERT INTO "HrEmployee" ("id", "tenantId", "systemId", "name", "updatedAt") SELECT 'qc34ybk' || $3 || lpad(g::text, 4, '0'), $1, $2, 'BK ' || g, now() FROM generate_series(1, 501) AS g`, TT, S.BK, tag);
    const bk = ((await rows(`SELECT "id" FROM "HrEmployee" WHERE "systemId" = $1 ORDER BY "id"`, S.BK)) as Any[]).map((x) => String(x.id));
    const rowsN = (n: number) => bk.slice(0, n).map((e) => ({ employeeId: e, ...OPEN, expectRev: null }));
    const bkOp = (rs: Any[]) => op("saveOpeningYtdBulk", c("BK"), V.owner, { taxYear: 2031, rows: rs }, { now: N.sep10 });
    const over = await bkOp(rowsN(301));
    const none301 = Number((await rows(`SELECT count(*)::int AS n FROM "HrPayrollOpeningYtd" WHERE "systemId" = $1`, S.BK))[0]?.n ?? -1) === 0;
    const t0 = Date.now();
    const b300 = await bkOp(rowsN(300));
    const ms = Date.now() - t0;
    const live300 = Number((await rows(`SELECT count(*)::int AS n FROM "HrPayrollOpeningYtd" WHERE "systemId" = $1 AND "supersededAt" IS NULL`, S.BK))[0]?.n ?? -1);
    const ls = await op("listOpeningYtd", c("BK"), V.owner, { taxYear: 2031 }, { now: N.sep10 });
    console.log(`[S3.21] bulk 300 changed rows: ${ms} ms`);
    ck("S3.21", {
      unchanged, ownOk, over301: isCode(over, "FIELDS") && none301, b300: b300?.ok === true && (b300?.saved ?? []).length === 300 && live300 === 300, fast: ms < 20_000,
      truncated: ls?.ok === true && ls?.truncated === true && listRows(ls).length === 500, notTruncated: (await op("listOpeningYtd", c("A"), V.owner, { taxYear: 2031 }))?.truncated === false,
    }, "changed rows only · ≤ 300 · fast · truncated flag", short({ un, ownSame, ownChanged, over, ms, b300: b300?.ok ?? b300 }, 300));
  });

  // ── races ──
  await blk(["S4.1"], async () => {
    need("saveOpeningYtd");
    const sep = MONTHS["2031-09"]!;
    // (1) period lock held ⇒ create waits; save (no period lock) finishes first ⇒ create sees it
    const o1 = await underLock<Any>(P, `hr:payroll:run:${S.R1}:2031-09`, 0, 1, [() => create("R1", "2031-09"), () => save("R1", V.owner, E.eR1)], [1]);
    const i1 = await item(o1.res[0]?.id, E.eR1);
    const l1 = (await liveOf(E.eR1))[0];
    // (2) hr50 held ⇒ save waits; create (no hr50) finishes first ⇒ save ok, then approve sees INPUTS_CHANGED
    const o2 = await underLock<Any>(P, `hr50:${S.R2}:${E.eR2}:2031`, 36, 1, [() => save("R2", V.owner, E.eR2, {}, T(sep[1])), () => create("R2", "2031-09")], [1]);
    const ap2 = await approve("R2", o2.res[1]?.id);
    // (3) free run
    const [s3, c3] = await Promise.all([save("R3", V.owner, E.eR3, {}, T(sep[1])), create("R3", "2031-09")]);
    const i3 = await item(c3?.id, E.eR3);
    const l3 = (await liveOf(E.eR3))[0];
    const ap3 = await approve("R3", c3?.id);
    const free = s3?.ok === true && c3?.ok === true && ((marker(i3)?.id === l3?.id && i3?.whtSatang === LIT.a2 && ap3?.ok === true) || (marker(i3) === "MISSING" && isCode(ap3, "INPUTS_CHANGED")));
    ck("S4.1", {
      saveFirst: o1.blocked >= 1 && o1.res[1]?.ok === true && o1.res[0]?.ok === true && marker(i1)?.id === l1?.id && marker(i1)?.rev === 1 && i1?.whtSatang === LIT.a2,
      createFirst: o2.blocked >= 1 && o2.res[1]?.ok === true && o2.res[0]?.ok === true && isCode(ap2, "INPUTS_CHANGED"), free,
    }, "item holds {id, rev} or INPUTS_CHANGED", short({ b: [o1.blocked, o2.blocked], r1: o1.res, ap2, s3, m3: marker(i3), ap3 }, 400));
  });
  await blk(["S4.3"], async () => {
    need("saveOpeningYtd");
    const o = await underLock<Any>(P, `hr50:${S.A}:${E.eA4}:2031`, 36, 2, [() => save("A", V.owner, E.eA4), () => save("A", V.owner, E.eA4)]);
    const okN = o.res.filter((x) => x?.ok === true).length;
    ck("S4.3", { blocked: o.blocked >= 2, one: okN === 1 && o.res.some((x) => isCode(x, "REV_CHANGED")), live: (await liveOf(E.eA4)).length === 1 }, "1 ok · 1 REV_CHANGED", short({ b: o.blocked, r: o.res }, 240));
  });
  await blk(["S4.4"], async () => {
    need("saveOpeningYtd", "saveOpeningYtdBulk");
    const [lo, hi] = [E.eA5, E.eA8].sort();
    const row = (e: string) => ({ employeeId: e, ...OPEN, expectRev: null });
    const t0 = Date.now();
    const o = await underLock<Any>(P, `hr50:${S.A}:${hi}:2031`, 36, 2, [() => op("saveOpeningYtdBulk", c("A"), V.owner, { taxYear: 2031, rows: [row(lo!), row(hi!)] }, { now: N.sep10 }), () => save("A", V.owner, hi!)]);
    const [bk, sg] = o.res;
    const liveLo = (await liveOf(lo!)).length;
    const liveHi = (await liveOf(hi!)).length;
    const settled = o.res.every((x) => x && x.code !== "TIMEOUT" && x.code !== "THROW") && Date.now() - t0 < 90_000;
    ck("S4.4", { blocked: o.blocked >= 2, settled, oneWins: (bk?.ok === true) !== (sg?.ok === true), liveHi: liveHi === 1, allOrNothing: liveLo === (bk?.ok === true ? 1 : 0) }, "serial · no deadlock", short({ b: o.blocked, bk, sg }, 300));
  });
}

// ═════════════ run ═════════════
async function cleanup(): Promise<string[]> {
  const left: string[] = [];
  if (fx.tenants.length) {
    const inList = fx.tenants.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema = current_schema() and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) {
      await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" IN (${inList})`).catch(() => null);
      for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => null);
    }
    for (const t of tables) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: -1 }])) as Any[];
      if (Number(r?.[0]?.n ?? 0) !== 0) left.push(`${t}=${r?.[0]?.n}`);
    }
  }
  await P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${LAW_KEY}-%`).catch(() => null);
  const lawLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE "sourceKey" LIKE 'qc-ytd-%'`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
  const actAfter = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
  if (lawLeft !== 0) left.push(`HrLawTable(qc-ytd)=${lawLeft}`);
  if (actBefore >= 0 && actAfter !== actBefore) left.push(`ACTIVE law ${actBefore}→${actAfter}`);
  return left;
}
try {
  runStatics({ BASE, IN_BASE, ck, fitness: await fitnessNoEnv() });
  runPure({ ck, R, V2, LAW: LAWJ });
  { // ORACLE-EDIT (H3.4-YTD fix round · controller ruling) ▸ S2.6 (4 · hunt P3): asOf before the start date · over-withheld opening never makes a negative WHT
    const po = (patch: Record<string, unknown>, startDay: string | null) => { try { return R?.parseOpening?.({ ...OPEN, ...patch }, { taxYear: 2031, todayBkk: "2031-10-01", startDay }); } catch (e) { return { __throw: errText(e) }; } };
    const w = (() => { try { return V2.whtYtdV2({ monthIndex: 9, currentIncomeSatang: M, regularMonthlySatang: M, ...((p) => ({ priorIncomeSatang: p.incomeSatang, priorWhtSatang: p.whtSatang, priorSsoSatang: p.ssoSatang }))(R.withOpening({ incomeSatang: 0, whtSatang: 0, ssoSatang: 0 }, { ...OPEN, whtSatang: 2_000_000 }, { onDay: "2031-09-25" })), currentSsoSatang: 87_500, regularSsoSatang: 87_500 }, LAWJ.TAX_BRACKET, LAWJ.DEDUCTION)?.whtSatang; } catch (e) { return errText(e); } })();
    chk("S2.6", po({}, "2031-09-01")?.code === "FIELDS" && po({ asOfDay: "2031-03-10", months: 3 }, "2031-03-10")?.ok === true && po({}, "2030-01-01")?.ok === true && w === 0, "start rule · over-withheld ⇒ 0", short({ a: po({}, "2031-09-01"), w }, 160));
  }
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  let left: string[] = [];
  try {
    left = await cleanup();
  } catch (e) {
    left = [`cleanup threw: ${errText(e)}`];
  }
  await cleanupFx(P, fx, SLUG);
  left.push(...(await residueOf(P, fx, SLUG, SLUG_PREFIX)));
  chk("Z1", left.length === 0, "none", left.join(",") || "clean");
}
if (GROUP_FAIL.length) console.log(`GROUP-THROWS ${GROUP_FAIL.length}: ${GROUP_FAIL.map((g) => g.slice(0, 120)).join(" | ")}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
