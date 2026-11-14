// QC — HR V2 · H4.2 labour cost % vs sales (ค่าแรงต่อยอดขาย) + staffing demand · brief ledger/hr-briefs/hr-brief-H4.2.md (+ CONTROLLER RULINGS · ruling Q4b 13 Nov)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 Goldens are hand-derived in ledger/wo-notes/hr-H4.2-oracle.md §2 — never computed by the code under test.
// Contract fixed here where the brief names a function but not its arguments (note §1):
//   labor-rules.ts  monthlyShare({baseSatang, day, startDate?, endDate?}) · dayWage({payType, baseSatang, dailySatang, hourlySatang, day, paidMin, normalMin, startDate?, endDate?})
//                   holidayPremium({payType, rateSatang, paidMin, normalMin, kind, holidayWorkPaidBp|null}) · ssoEstimate({wageSatang, daysInMonth, rateBp, maxBaseSatang})
//                   largestRemainder(total, weights[]) (tie → lower index) · hourSlots({day, startMin, endMin, crossesMidnight, cutoffMin}) → [{date, hour, minutes}]
//                   forecastHour({day, today, valueOf(date)}) · pctTenths(cost, sales) · needed({forecastSatang, splhSatang, minStaff}) · scheduledAt([{employeeId, hour, minutes}], hour)
//   labor.ts        laborDay(ctx, v, {unitId?, day}, {now?, locale?}) · laborWeek(ctx, v, {unitId?, week: Monday}, opts) · laborMonth(ctx, v, {unitId?, periodKey}, opts) ·
//                   getLaborSettings(ctx, v) · setLaborSettings(ctx, v, {targetTenths, splhSatang, minStaff})
//   pos/index.ts    salesFacts.salesByHour({tenantId, unitId}, actor, {from, to}, client?)
// Tenants qc-hr-h42-<stamp> · HrLawTable rows sourceKey qc-hr-h42-<stamp>-* (ACTIVE from 2026-12-01, removed in finally) · SKIP while hr/labor-rules.ts is absent (QC_FORCE=1 runs) · --list
// Statics compare with baseRef("QC_H42_BASE") (merge-base HEAD origin/session/hr), or merge-base(HEAD, session/hr) when newer · in-base guard = labor-rules.ts present in the base
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h4.2.mts
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  type Any, type Base, type Sev, ROOT, rd, short, errText, sleep, failedKeys, stripComments, canon, srcFiles, keysDeep, jsonOf, loadOpt, modState, isThai, importsOf,
  baseRef, commitInBase, pathInBase, changedVsBase, diffHunks, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, vOf, fitnessNoEnv, tagOf, dbDate,
  HR_FORBIDDEN_DTO_KEYS, testidsOf, inventoryParity, msgParity, tokensOnly,
} from "./qc-hr-lib.mjs";
import { runPure, runStatic, baseOf, LAW, F, H } from "./qc-hr-h4.2-lib.mjs";

const SUITE = "qc-hr-h4.2";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h42-";
const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|§8|C|R|[static] new files labor-rules.ts · labor.ts · labor-actions.ts · labor-ui.tsx exist
S1.2|R1|C|R|[static] POS seam: pos/reports.ts exports salesByHour · pos/index.ts exports salesFacts = { salesByHour } · pos/** diff ⊆ {reports.ts, index.ts} · every pos hunk marked HR H4.2 · no removed line in reports.ts
S1.3|R2|C|R|[static] fitness ALLOWED_EDGES has "hr→pos" · the only hr/** importer of @/lib/modules/pos is labor.ts, via await import("@/lib/modules/pos") (no static import, no subpath) · no posSale/PosSale in hr/**
S1.4|R3|C|R|[static] labor-rules.ts pure: imports type-only or ./*-rules · no prisma/tenantDb/clock/random/env/await/"use server"
S1.5|R6|C|R|[static] setLaborSettings: lockHrSettings + writeHrSettingsKeys({hrLabor}) + canManageHrSettings + audit "hr.labor.settings" · no own appSystem write in labor*.ts · labor.ts: every core/db value import is exactly import { tenantDb } from "@/lib/core/db" (per statement · R5 review), no @prisma/client, no dynamic core/db and reads Membership (DB gate)
S1.6|§8|C|G|[static] [control] frozen files unchanged vs base (other pos/** · payroll* · law.ts · work-entries* · roster.ts · roster-rules.ts · roster-board* · reports* · privacy* · scope.ts · settings-lock.ts · inbox* · account/approval/core · prisma/ · qc-hr-lib.mts · other oracles · package.json)
S1.7|§8|C|R|[static] marked hunks: every hunk vs base in pos/reports.ts · pos/index.ts · fitness.mts · overview-ui.tsx · roster-ui.tsx · roster + settings page.tsx · visual-hr.mts carries "HR H4.2" · reports.ts/index.ts/fitness/overview/roster-ui each ≥ 1 hunk (in base: every hunk carries some ticket mark)
S1.8|§7|M|R|[static] UI: testids (card · pct · cost · forecast · sofar · hours · shift-* · month · note · roster demand-* · labor-foot · demand-panel · settings · save) · inventory rows wo H4.2 · th/en hr.labor parity incl. estimateNote/smallGroup + "ยอดขายสุทธิตามรายงาน POS" · visual-hr "4.2" · tokens · ?msg= not free text
S2.1|D4|C|R|[pure] monthlyShare full month: Σ days = base for D 28/29/30/31 · 1,000,000 Jan ⇒ days 1–2 = 32,259, rest 32,258 · 2028-02-29 (D=29) day 29 = 34,482
S2.2|Q4b|C|R|[pure] ruling Q4b partial month: joiner 2027-03-11 1,550,000 ⇒ engine 1,085,000 over 21 days (51,667 ×14 then 51,666) · leaver 2027-03-20 1,000,000 ⇒ 666,667 over 20 days (33,334 ×7 then 33,333) · joiner 2027-01-02 ⇒ min(base) 1,550,000 over 30 days · 0 outside
S2.3|D4|C|R|[pure] dayWage DAILY 40,000 m=420 ⇒ 35,000 · m=600 ⇒ 40,000 (min N) · HOURLY 6,000 m=480 ⇒ 48,000 · MONTHLY = monthlyShare
S2.4|D4|C|R|[pure] holidayPremium PUBLIC DAILY m=480 ⇒ 40,000 (day = 80,000) · SHOP DAILY ⇒ 0 · MONTHLY 3,000,000 PUBLIC m=480 ⇒ 100,000 · MONTHLY SHOP m=300 ⇒ 62,500 · HOURLY PUBLIC ⇒ 48,000 · bp null ⇒ 0
S2.5|D4|C|R|[pure] DAY_WAGE / HOUR_WAGE / HOLIDAY_WORK equal computeRunItemV2 lines on 7 vectors
S2.6|D5|C|R|[pure] ssoEstimate 500 bp cap 1,750,000: 50,000 ⇒ 2,500 · 100,000 ⇒ 2,823 · 40,000 ⇒ 2,000 · 48,000 ⇒ 2,400 · Feb 55,358 (D=28) ⇒ 2,768
S2.7|D7 D8|C|R|[pure] largestRemainder: 52,500/8 ⇒ 6,563 ×4 + 6,562 ×4 · 42,000/9 ⇒ 4,667 ×6 + 4,666 ×3 · 10/[1,1,1] ⇒ 4,3,3 · 100,001/[240,240] ⇒ 50,001,50,000 · 7/[3,1] ⇒ 5,2 · Σ preserved
S2.8|D1|C|R|[pure] hourSlots: 07:00–15:00 ⇒ 8 × 60 · 07:30–09:15 ⇒ 30/60/15 · 20:00–02:00 cutoff 0 ⇒ d 20–23 + d+1 0–1 · cutoff 240 ⇒ d 20–25
S2.9|D11|C|R|[pure] forecastHour: 4 latest same weekdays strictly before today (d−7k ≥ today skipped) · 01-23 at today 01-16 ⇒ 400,000 (01-16 value ignored) · halfUp · missing = 0
S2.10|D12 D13|C|R|[pure] pctTenths 247,723/1,000,000 ⇒ 248 · sales 0 ⇒ null · needed 400,000/150,000 ⇒ 3 · minStaff floor · f ≤ 0 ⇒ 0 · splh null ⇒ null · scheduledAt ≥ 30 min per employee
S2.11|R3|m|R|[pure] LABOR_DEFAULTS {280, null, 1} · LABOR_TEXT/LABOR_TEXT_EN same keys, non-empty, TH Thai · laborTextFor("en") = EN, else TH
S3.1|R1|C|R|[db] salesFacts.salesByHour = reportHourly per hour (U1 2027-01-16) and Σ days = reportDailySales over 44 days · sparse · cutoffMin 0 · today = bkkBusinessDate(now)
S3.2|R1 X8|C|R|[db] salesByHour: unit without POS ⇒ {ok:true, connected:false} · actor without pos.report.view ⇒ PERMISSION_DENIED refusal · 46 days ⇒ VALIDATION · 45 days ok
S3.3|R1|C|G|[db] [control] existing POS reports on the fixture: reportDailySales net 1,000,000 (void · deposit · tip out, refund −50,000) · reportHourly hours 12/18/19 + forecast 400,000
S3.4|D1|C|R|[db] salesByHour cutoff 240: U4 2027-01-31 ⇒ cutoffMin 240 · hour 25 = 100,000 / 1 bill
S4.1|S3|C|R|[db] worked example U1 Sat 2027-01-16 (now 01-17 10:00): cost 247,723 = wage 238,000 + SSO 9,723 · sales 1,000,000 · pct 248 · target 280 · sales "OK"
S4.2|S3 D8|C|R|[db] hours: 07 = 6,563 · 11 = 12 = 11,229 · 15 = 10,967 · 19 = 10,966 · 22 = 6,300 · Σ hours 144,900 + unallocated 102,823 = cost · sales hour 12/18/19 = 600,000/450,000/−50,000
S4.3|R4|M|R|[db] shifts: A 52,500 · sales 600,000 · 88 ‰ · B 42,000 · 1,000,000 · 42 · C 50,400 · 400,000 · 126
S4.4|D13|C|R|[db] demand: splh unset ⇒ demand null · splh 150,000 ⇒ hour 12 scheduled 2 needed 3 · hour 8 scheduled 1 needed 0 · peak 12
S4.5|D10 D11|C|R|[db] forecast: 01-23 at now 01-16 10:00 ⇒ sales 400,000 (pct 388) · at now 01-17 ⇒ 552,500 · today (now 01-16 12:30) ⇒ sales 400,000 · soFar 600,000 · pct 619
S4.6|Q13|C|R|[db] draft vs published: laborDay U1 01-15 = 155,323 (draft F out) · laborWeek 2027-01-11 footer paidMinutes 1,800 · cost 1,216,411 (F in) · day 01-16 scheduled/needed at peak 2/3
S4.7|D7|C|R|[db] split across 2 branches (G 2027-01-26, 240/240 min): U1 + U2 = 50,425 · lower unit id gets 25,213
S4.8|D1 X7|C|R|[db] Bangkok boundaries: U1 01-31 cost 193,123 sales 70,000 · U1 02-01 cost 171,966 sales 100,000 · U4 (cutoff 240) 01-31 cost 37,800 hours 24/25 = 6,300 · hour 25 sales 100,000 · U4 02-01 cost 0 · U1 2028-02-29 cost 166,033
S4.9|D4|C|R|[db] holidays (U4 DAILY 40,000 m=480): PUBLIC 2027-01-20 ⇒ 82,000 · SHOP 2027-01-21 ⇒ 42,000
S4.10|Q4b X8|C|R|[db] U3 (no POS) March: 03-05 35,001 · 03-16 89,250 · 03-21 54,250 · 03-31 54,249 · sales "NO_POS" · pct null · cost shown
S4.11|D9 S4|C|R|[db] month: U1 2027-01 actual 1,391,667 (REVERSED ignored) · sales 1,870,000 · pct 744 · U2 695,833 · U1 2027-02 ESTIMATE 4,815,004 · prev 1,391,667 · U3 2027-03 ESTIMATE 1,839,250
S4.12|R5|M|R|[db] no unitId = all units in scope (owner 01-16 = 281,594 incl. leaver N at U3) · tenant with 21 units ⇒ UNIT_REQUIRED
S4.13|P4|C|R|[db] no per-person money: owner day/week/month carry no employee id/name, no "employeeId"/"name" key, none of HR_FORBIDDEN_DTO_KEYS
S4.14|R3 review|C|R|[db] current-month % = completed days only (U5: 30,000 ฿/month from 04-01, 10,000 ฿ sales/day): now 2027-04-16 10:00 ⇒ (15 × 102,917) ÷ (15 × 1,000,000) ⇒ 103 · now 04-01 ⇒ null + label "ยังไม่มีข้อมูลครบวัน" · past month (now 05-10) ⇒ 3,087,510 ÷ 16,000,000 ⇒ 193
S4.15|R4 review|M|R|[db] row caps never understate silently: opts.__takeCap 2 (H3.9 seam) ⇒ day/week/month carry truncated:true · without the seam no truncated · labor-ui.tsx renders a truncated warning
S5.1|P1|C|R|[db] owner + payroll all-branch: day/week/month money · demand · settings read
S5.2|R1 review|C|R|[db] payroll [U2] (ruling R1 replaces P2/Q9): U1 ⇒ NO · money only from home-U2 staff (K, L): 01-12 J alone ⇒ cost 0 · excludedHeadcount 1 · partial · no J numbers (also no unitId) · 01-13 ⇒ 73,500 (Σ hours = cost) · pct 70 partial · 01-19 K ⇒ 36,750 not partial · week 01-11 footer 73,500 excl 1 · month Jan actual (E) 0 excl 1 · Feb estimate (J) 0 excl 1
S5.3|Q10|C|R|[db] manager without payroll: money null · no *Satang/*Tenths key on day/week/month · demand hour 12 = 2/3
S5.4|P3|C|R|[db] payroll viewer without pos.report.view: cost 247,723 · sales "NO_PERMISSION" · pct null · hour sales/forecast null · needed null · scheduled 2
S5.5|P5|C|R|[db] refusals (HR-key staff · plain member · employee self · other tenant · role spoof · [U2] on U1/unknown/other-tenant unit) on day/week/month = one identical Thai {ok:false, code:"NO", reason} · no ids/numbers · permission spoof read from DB
S5.6|P1|M|R|[db] unitAccess [] payroll manager = all branches (U1 247,723 · U2 01-19 36,750)
S5.7|R2 review|C|R|[db] outsider-pay invariance for payroll [U2]: J daily ×2, G hourly ×2, E run item ×2 ⇒ canon of day U2 01-12/13/19/26 · day no-unit 01-12 · week U2 01-11/01-25 · month U2 Jan (actual) / Feb (estimate) byte-identical · positive control: owner U2 outputs change
S5.8|R2 review|C|R|[db] manager without payroll key: every pay ×2 (all profiles + run item) ⇒ day U1 01-16 · U2 01-13 · week U1/U2 · month U1 Jan/Feb byte-identical (or identical NO) · positive control: owner U1 01-16 changes
S6.1|R6|C|R|[db] settings: owner · payroll MANAGER · STAFF with hr.employee.create save + read · HR-key staff · member · self · other tenant refused, nothing written
S6.2|R4|C|R|[db] bounds: targetTenths 50–600 · splhSatang null or 10,000–100,000,000 · minStaff 0–20 · integers only · refusal writes nothing
S6.3|R6|M|R|[db] audit: one "hr.labor.settings" row per successful save · none for refusals or reads
S6.4|R6|C|R|[db] lock race: raw tx holding hr:clockpolicy (A) / AppSystem row FOR UPDATE (B) blocks setLaborSettings (pg_blocking_pids) · stale write + marker committed first · hrLabor + marker survive (×2 each)
S6.5|S8|C|R|[db] 10 lanes × 3 setLaborSettings ∥ 10 saveClockPolicy ⇒ all ok · hrLabor + hrClock both survive with written values
S7.1|FIX1-a|C|R|[db] ORACLE-EDIT (H4.2-FIX1 via H4.3 · controller ruling) open month with a finalized run (U6 June, R 30,000 ฿/month, run 30,750 ฿): now 06-28 ⇒ month-to-date basis: cost 27 × 102,917 = 2,778,759 · sales 27,000,000 · pct 103 · throughDay 06-27 (not ACTUAL 3,075,000 ÷ 28,000,000 = 110) · now 07-05 ⇒ ACTUAL 3,075,000 · 28,000,000 · 110 · throughDay null
S7.2|FIX1-b|M|R|[db+static] payroll [U2] month Feb: excludedHeadcount 1 + partial on the month and on prev (Jan) · labor-ui shows the excluded-pay note per figure (month.partial/excludedHeadcount · month.prev.partial/excludedHeadcount)
S7.3|FIX1-c|M|R|[db+static] day 1 (U5 now 04-01): month costSatang null with pctTenths null · 201 borrowings on K ⇒ laborDay U2 01-19 truncated:true, cost 36,750 · labor-ui MTD label day through formatThaiDate/formatShortDate of @/lib/ui/date
X1|X12|M|G|[run] fitness + fitness-hr without env ⇒ exit 0
Z1|house|C|G|no residue (PosSale · HrWorkDay · HrLawTable qc-hr-h42-* included)
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H42-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H42-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.rules))) skipReasons.push(`${F.rules} absent (H4.2 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);

const { BASE, IN_BASE } = baseOf();
// ═════════════════════════ db ═════════════════════════
const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const M = {
  rules: await loadOpt(F.rules, "@/lib/modules/hr/labor-rules"), svc: await loadOpt(F.svc, "@/lib/modules/hr/labor"),
  pos: (await import("@/lib/modules/pos").catch((e: unknown) => ({ __err: errText(e) }))) as Any, rep: (await import("@/lib/modules/pos/reports").catch((e: unknown) => ({ __err: errText(e) }))) as Any,
  clock: (await import("@/lib/modules/hr/clock-settings").catch((e: unknown) => ({ __err: errText(e) }))) as Any, eng: (await import("@/lib/modules/hr/payroll-run-rules").catch((e: unknown) => ({ __err: errText(e) }))) as Any,
};
console.log(`modules: labor-rules ${modState(M.rules, F.rules)} · labor ${modState(M.svc, F.svc)} · salesFacts ${typeof M.pos?.salesFacts?.salesByHour === "function" ? "loaded" : "∅"}`);
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const REAL = { log: console.log, info: console.info, warn: console.warn, error: console.error };
async function call(m: Any, fn: string, ...a: unknown[]): Promise<Any> {
  if (typeof m?.[fn] !== "function") return { __throw: `∅${fn}` };
  const mute = () => {};
  Object.assign(console, { log: mute, info: mute, warn: mute, error: mute });
  try {
    return await m[fn](...a);
  } catch (e) {
    return { __throw: errText(e) };
  } finally {
    Object.assign(console, REAL);
  }
}
const okR = (r: Any) => !!r && !r.__throw && r.ok === true;
const why = (r: Any) => short(r?.__throw ?? r?.code ?? r?.reason ?? r, 60);
const NOW = new Date("2027-01-17T03:00:00Z"); // 10:00 BKK
const O = (now = NOW) => ({ now, locale: "th" });
const mon = (r: Any) => r?.money ?? null;
const hr = (r: Any, h: number) => (mon(r)?.hours ?? []).find((x: Any) => x?.hour === h) ?? {};
const mv = (r: Any, k: string) => (r?.[k] !== undefined ? r[k] : r?.money?.[k]);
const bkkUtc = (day: string, hm: string) => new Date(Date.parse(`${day}T${hm}:00+07:00`));
const settingsOf = async (id: string): Promise<Any> => ((await P.appSystem.findFirst({ where: { id }, select: { settings: true } }))?.settings ?? {}) as Any;
const labOf = (r: Any) => r?.settings ?? r?.hrLabor ?? r ?? {};
const lawKeys: string[] = [];
const within = <R,>(p: Promise<R>, ms = 90_000) => Promise.race([p, sleep(ms).then(() => ({ __throw: "TIMEOUT" }) as Any)]);

async function runDb(): Promise<void> {
  const T = await fx.newTenant("", "QC HR H4.2");
  const T2 = await fx.newTenant("-t2", "QC HR H4.2 อื่น");
  const U1 = await fx.newUnit(T, "QC H42 สาขาหนึ่ง", "u1");
  const U2 = await fx.newUnit(T, "QC H42 สาขาสอง", "u2");
  const U3 = await fx.newUnit(T, "QC H42 สาขาไม่มี POS", "u3");
  const U4 = await fx.newUnit(T, "QC H42 สาขาตัดวันตีสี่", "u4");
  const U5 = await fx.newUnit(T, "QC H42 สาขาเดือนเมษา", "u5"); // ORACLE-EDIT (H4.2 review · controller ruling) R3 ◂
  const U6 = await fx.newUnit(T, "QC H42 สาขามิถุนา", "u6"); // ORACLE-EDIT (H4.2-FIX1 via H4.3 · controller ruling) FIX1-a ◂
  const UX = await fx.newUnit(T2, "QC H42 ร้านอื่น", "ux");
  const HRS = (await sysSvc.createSystem(T, "HR", `HR ${tag}`)).id as string;
  const HRX = (await sysSvc.createSystem(T2, "HR", `HR2 ${tag}`)).id as string;
  const POSA = (await sysSvc.createSystem(T, "POS", `POS A ${tag}`)).id as string;
  const POSB = (await sysSvc.createSystem(T, "POS", `POS B ${tag}`)).id as string;
  for (const u of [U1, U2, U3, U4]) await sysSvc.linkUnit(T, HRS, u);
  await sysSvc.linkUnit(T2, HRX, UX);
  for (const u of [U1, U2, U5]) await sysSvc.linkUnit(T, POSA, u); // ORACLE-EDIT (H4.2 review · controller ruling) R3: + U5 ◂
  await sysSvc.linkUnit(T, HRS, U5);
  for (const s6 of [HRS, POSA]) await sysSvc.linkUnit(T, s6, U6); // ORACLE-EDIT (H4.2-FIX1 via H4.3 · controller ruling) FIX1-a ◂
  await sysSvc.linkUnit(T, POSB, U4);
  await P.appSystem.update({ where: { id: POSB }, data: { settings: { pos: { reports: { dayCutoffMinutes: 240 } } } } });
  const ctx = { tenantId: T, systemId: HRS };
  // ── law rows (global · ACTIVE from 2026-12-01 · own sourceKey) ──
  const lawFrom = dbDate("2026-12-01");
  const OTJ = { workdayMultiplierBp: 15_000, daysPerMonth: 30, hoursPerDay: 8, holidayWorkPaidBp: 10_000, holidayWorkUnpaidBp: 20_000, holidayOtBp: 30_000 };
  const { wageComponents: _w, ...SSO } = LAW.SSO ?? {};
  for (const [k, j] of [["SSO", SSO], ["TAX_BRACKET", LAW.TAX_BRACKET], ["DEDUCTION", LAW.DEDUCTION], ["OT", OTJ]] as const) {
    const key = `${SLUG}-${k}`;
    lawKeys.push(key);
    await P.hrLawTable.create({ data: { kind: k, effectiveFrom: lawFrom, json: j, status: "ACTIVE", sourceKey: key, note: "qc h4.2", approvedByName: "QC", approvedAt: new Date() } });
  }
  const foreign = (await P.hrLawTable.findMany({ where: { status: "ACTIVE", kind: { in: ["SSO", "OT"] }, sourceKey: { notIn: lawKeys }, effectiveFrom: { gte: lawFrom, lte: dbDate("2028-02-29") } }, select: { sourceKey: true } })) as Any[];
  console.log(`law precondition: SSO rateBp ${SSO.rateBp} cap ${SSO.maxBaseSatang} · foreign ACTIVE rows in 2026-12..2028-02: ${foreign.map((r) => r.sourceKey).join(",") || "none"}`);
  // ── users ──
  const mk = (tn: string, t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(tn, t, `QC H42 ${t} ${tag}`, r, ua, p);
  const W = {
    owner: await mk(T, "owner", "OWNER", [], {}), payAll: await mk(T, "payall", "MANAGER", ["*"], { "hr.payroll.read": true }), payEmpty: await mk(T, "payempty", "MANAGER", [], { "hr.payroll.read": true }),
    payU2: await mk(T, "payu2", "MANAGER", [U2], { "hr.payroll.read": true }), mgr: await mk(T, "mgr", "MANAGER", ["*"], {}),
    payNoPos: await mk(T, "paynopos", "STAFF", ["*"], { "hr.payroll.read": true, "hr.employee.create": true }), staffHr: await mk(T, "staffhr", "STAFF", ["*"], { "hr.leave.read": true }),
    member: await mk(T, "member", "STAFF", [], {}), self: await mk(T, "self", "STAFF", [], {}), other: await mk(T2, "other", "OWNER", [], {}),
  };
  const V = Object.fromEntries(Object.entries(W).map(([k, w]) => [k, vOf(w)])) as Record<keyof typeof W, Any>;
  // ── shifts + employees + profiles + roster ──
  const shift = async (n: string, s: number, e: number, b: number, x = false) => (await P.hrShift.create({ data: { tenantId: T, systemId: HRS, name: `${n} ${tag}`, startMin: s, endMin: e, breakMin: b, crossesMidnight: x } })).id as string;
  const SH = { A: await shift("เช้า", 420, 900, 60), B: await shift("กลาง", 660, 1200, 60), C: await shift("บ่าย", 900, 1380, 0), F: await shift("F", 540, 1020, 60), X: await shift("X", 600, 1080, 60), P: await shift("P", 600, 1080, 0), N: await shift("ดึก", 1200, 120, 0, true), G1: await shift("G1", 480, 720, 0), G2: await shift("G2", 780, 1020, 0) };
  const shRow = new Map<string, Any>();
  for (const id of Object.values(SH)) shRow.set(id, await P.hrShift.findFirst({ where: { id } }));
  const empNames: string[] = [];
  const emp = async (n: string, unitId: string, pay: [string, number] | null, o: Any = {}) => {
    const nm = `QC H42 ${n} ${tag}`;
    empNames.push(nm);
    const id = await fx.mkEmp(T, HRS, nm, { unitId, ...o });
    if (pay) await P.hrSalaryProfile.create({ data: { tenantId: T, systemId: HRS, employeeId: id, payType: pay[0], baseSalarySatang: pay[0] === "MONTHLY" ? pay[1] : 0, dailyRateSatang: pay[0] === "DAILY" ? pay[1] : null, hourlyRateSatang: pay[0] === "HOURLY" ? pay[1] : null, ssoEligible: true } });
    return id;
  };
  const EM = {
    A: await emp("A", U1, ["MONTHLY", 1_550_000], { linkedUserId: W.self.id }), B: await emp("B", U1, ["DAILY", 40_000]), C: await emp("C", U1, ["HOURLY", 6_000]), D: await emp("D", U1, ["MONTHLY", 3_100_000]),
    E: await emp("E", U1, null), F: await emp("F", U1, ["DAILY", 40_000]), G: await emp("G", U1, ["HOURLY", 6_003]), H2: await emp("H2", U1, ["HOURLY", 6_000]), J: await emp("J", U1, ["DAILY", 40_000]),
    K: await emp("K", U2, ["DAILY", 40_000]), L: await emp("L", U2, ["DAILY", 40_000]), Mj: await emp("M", U3, ["MONTHLY", 1_550_000], { startDate: "2027-03-11" }),
    Nl: await emp("N", U3, ["MONTHLY", 1_000_000], { endDate: "2027-03-20", active: false }), H: await emp("H", U4, ["HOURLY", 6_000]), Pd: await emp("P", U4, ["DAILY", 40_000]), Q: await emp("Q", U5, ["MONTHLY", 3_000_000], { startDate: "2027-04-01" }), // ORACLE-EDIT (H4.2 review · controller ruling) R3 ◂

  };
  const entry = async (e: string, date: string, sh: string, unitId: string, published = true) => {
    const s = shRow.get(sh);
    await P.hrRosterEntry.create({ data: { tenantId: T, systemId: HRS, employeeId: e, date: dbDate(date), shiftId: sh, unitId, startMin: s.startMin, endMin: s.endMin, breakMin: s.breakMin, crossesMidnight: s.crossesMidnight, published, publishedAt: published ? new Date() : null } });
  };
  await entry(EM.A, "2027-01-16", SH.A, U1);
  await entry(EM.B, "2027-01-16", SH.B, U1);
  await entry(EM.C, "2027-01-16", SH.C, U1);
  await entry(EM.F, "2027-01-15", SH.F, U1, false);
  await entry(EM.G, "2027-01-26", SH.G1, U1);
  await entry(EM.G, "2027-01-26", SH.G2, U2);
  await entry(EM.H2, "2027-01-31", SH.N, U1);
  await entry(EM.H, "2027-01-31", SH.N, U4);
  await entry(EM.J, "2027-01-12", SH.X, U2);
  for (const e of [EM.J, EM.K, EM.L]) await entry(e, "2027-01-13", SH.X, U2);
  await entry(EM.K, "2027-01-19", SH.X, U2);
  await entry(EM.Pd, "2027-01-20", SH.P, U4);
  await entry(EM.Pd, "2027-01-21", SH.P, U4);
  await entry(EM.J, "2027-02-10", SH.X, U2); // ORACLE-EDIT (H4.2 review · controller ruling) R2: outsider in an ESTIMATE month at U2 ◂
  await P.hrHoliday.create({ data: { tenantId: T, systemId: HRS, unitId: null, date: dbDate("2027-01-20"), name: `QC วันหยุดราชการ ${tag}`, kind: "PUBLIC" } });
  await P.hrHoliday.create({ data: { tenantId: T, systemId: HRS, unitId: U4, date: dbDate("2027-01-21"), name: `QC วันหยุดร้าน ${tag}`, kind: "SHOP" } });
  // ── payroll runs + work days (E) ──
  const run = async (status: string, gross: number, er: number) => {
    const r = await P.hrPayrollRun.create({ data: { tenantId: T, systemId: HRS, periodKey: "2027-01", payDate: new Date("2027-01-31T00:00:00Z"), status, engineVersion: 2, stepsJson: { finalized: true }, totalGrossSatang: gross, totalSsoEmployerSatang: er } });
    await P.hrPayrollItem.create({ data: { tenantId: T, systemId: HRS, runId: r.id, employeeId: EM.E, grossSatang: gross, ssoBaseSatang: 1_750_000, ssoEmployeeSatang: er, ssoEmployerSatang: er, whtSatang: 0, netSatang: gross - er } });
  };
  await run("APPROVED", 2_000_000, 87_500);
  await run("REVERSED", 5_000_000, 87_500);
  const wd = (date: string, unitId: string) => ({ tenantId: T, systemId: HRS, employeeId: EM.E, date: dbDate(date), periodKey: "2027-01", unitId, dayClass: "WORKDAY", dayStatus: "WORKED", plannedMin: 600, workMin: 600, sourcesJson: {}, inputHash: "qc", digest: "qc", engineVersion: 2, builtAt: new Date() });
  await P.hrWorkDay.createMany({ data: [...Array.from({ length: 10 }, (_, i) => wd(`2027-01-${String(4 + i).padStart(2, "0")}`, U1)), ...Array.from({ length: 5 }, (_, i) => wd(`2027-01-${String(18 + i).padStart(2, "0")}`, U2))] });
  // ── POS sales ──
  let n = 0;
  const sale = async (unitId: string, systemId: string, at: Date, grand: number, o: Any = {}) =>
    (await P.posSale.create({ data: { tenantId: T, unitId, systemId, idempotencyKey: `${SLUG}-${++n}`, status: "PAID", docType: "SALE", subtotalSatang: grand, grandTotalSatang: grand, createdAt: at, paidAt: at, ...o } })).id as string;
  await sale(U1, POSA, bkkUtc("2027-01-16", "12:10"), 600_000, { tipSatang: 5_000 });
  await sale(U1, POSA, bkkUtc("2027-01-16", "13:00"), 300_000, { status: "VOIDED" });
  await sale(U1, POSA, bkkUtc("2027-01-16", "14:00"), 200_000, { sourceModule: "POS_DEPOSIT" });
  const s450 = await sale(U1, POSA, bkkUtc("2027-01-16", "18:30"), 450_000);
  await sale(U1, POSA, bkkUtc("2027-01-16", "19:05"), 50_000, { docType: "REFUND", refSaleId: s450 });
  for (const [d, v] of [["2027-01-09", 380_000], ["2027-01-02", 420_000], ["2026-12-26", 410_000], ["2026-12-19", 390_000]] as const) await sale(U1, POSA, bkkUtc(d, "12:10"), v);
  await sale(U1, POSA, bkkUtc("2027-01-31", "23:59"), 70_000);
  await sale(U1, POSA, bkkUtc("2027-02-01", "01:30"), 100_000);
  await sale(U4, POSB, bkkUtc("2027-02-01", "01:30"), 100_000);
  // ORACLE-EDIT (H4.2 review · controller ruling) R1/R3: U2 sales 01-13 (pct of the limited viewer) · U5 10,000 ฿ every day 04-01..04-16 (04-16 09:00 = today at now 10:00) ◂
  await sale(U2, POSA, bkkUtc("2027-01-13", "12:00"), 1_050_000);
  for (let i = 1; i <= 16; i++) await sale(U5, POSA, bkkUtc(`2027-04-${String(i).padStart(2, "0")}`, i === 16 ? "09:00" : "12:00"), 1_000_000);
  // ORACLE-EDIT (H4.2-FIX1 via H4.3 · controller ruling) FIX1-a: R (MONTHLY 3,000,000 from 2027-06-01, home U6) · finalized APPROVED run 2027-06 (gross 3,000,000 + ssoEr 75,000) · 10,000 ฿ sales 06-01..06-28 (06-28 09:00) ◂
  const R6 = await emp("R", U6, ["MONTHLY", 3_000_000], { startDate: "2027-06-01" });
  {
    const r6 = await P.hrPayrollRun.create({ data: { tenantId: T, systemId: HRS, periodKey: "2027-06", payDate: new Date("2027-06-30T00:00:00Z"), status: "APPROVED", engineVersion: 2, stepsJson: { finalized: true }, totalGrossSatang: 3_000_000, totalSsoEmployerSatang: 75_000 } });
    await P.hrPayrollItem.create({ data: { tenantId: T, systemId: HRS, runId: r6.id, employeeId: R6, grossSatang: 3_000_000, ssoBaseSatang: 1_750_000, ssoEmployeeSatang: 75_000, ssoEmployerSatang: 75_000, whtSatang: 0, netSatang: 2_925_000 } });
    for (let i = 1; i <= 28; i++) await sale(U6, POSA, bkkUtc(`2027-06-${String(i).padStart(2, "0")}`, i === 28 ? "09:00" : "12:00"), 1_000_000);
  }

  // ═══ S3 POS seam ═══
  const actor = (w: Any) => ({ userId: w.id, role: w.role, unitAccess: w.unitAccess, permissions: w.permissions });
  const SBH = M.pos?.salesFacts?.salesByHour;
  const fac = (unitId: string, a: Any, from: string, to: string) => (typeof SBH === "function" ? call(M.pos.salesFacts, "salesByHour", { tenantId: T, unitId }, a, { from, to }) : Promise.resolve({ __throw: "∅salesFacts.salesByHour" }));
  const repH = await call(M.rep, "reportHourly", { tenantId: T, systemId: POSA, unitId: U1 }, actor(W.owner), { from: "2027-01-16", to: "2027-01-16" });
  const repD = await call(M.rep, "reportDailySales", { tenantId: T, systemId: POSA, unitId: U1 }, actor(W.owner), { from: "2027-01-16", to: "2027-01-16" });
  const repD44 = await call(M.rep, "reportDailySales", { tenantId: T, systemId: POSA, unitId: U1 }, actor(W.owner), { from: "2026-12-19", to: "2027-01-31" });
  {
    const rows = (repH?.report?.rows ?? []) as Any[];
    const h = (k: number) => rows.find((x) => x.hour === k) ?? {};
    const t = repD?.report?.totals ?? {};
    const r = {
      daily: t.netSalesSatang === 1_000_000 && t.billCount === 2 && t.voidCount === 1 && t.refundTotalSatang === 50_000 && t.tipSatang === 5_000,
      hourly: h(12).netSalesSatang === 600_000 && h(12).billCount === 1 && h(18).netSalesSatang === 450_000 && h(19).netSalesSatang === -50_000 && h(19).billCount === 0 && h(12).forecastSatang === 400_000,
      d44: repD44?.report?.totals?.netSalesSatang === 2_670_000,
    };
    ck("S3.3", r, "POS reports unchanged on fixture", `daily=${short(t, 120)}`);
  }
  {
    const before = M.rep?.bkkBusinessDate?.(new Date(), 0);
    const f1 = await fac(U1, actor(W.owner), "2027-01-16", "2027-01-16");
    const after = M.rep?.bkkBusinessDate?.(new Date(), 0);
    const nz = (hs: Any[]) => canon(hs.filter((x) => x.netSalesSatang !== 0 || x.billCount !== 0).map((x) => [x.hour, x.netSalesSatang, x.billCount]).sort((a, b) => a[0] - b[0]));
    const repNz = nz(((repH?.report?.rows ?? []) as Any[]).map((x) => ({ hour: x.hour, netSalesSatang: x.netSalesSatang, billCount: x.billCount })));
    const d0 = (f1?.days ?? [])[0];
    const f44 = await fac(U1, actor(W.owner), "2026-12-19", "2027-01-31");
    const sum44 = ((f44?.days ?? []) as Any[]).reduce((a, d) => a + (d.hours ?? []).reduce((b: number, x: Any) => b + x.netSalesSatang, 0), 0);
    const dRows = new Map(((repD44?.report?.rows ?? []) as Any[]).map((x) => [x.businessDate, x.netSalesSatang]));
    const perDay = ((f44?.days ?? []) as Any[]).every((d) => dRows.get(d.date) === (d.hours ?? []).reduce((b: number, x: Any) => b + x.netSalesSatang, 0));
    const r = {
      ok: f1?.ok === true && f1?.connected === true, cutoff: f1?.cutoffMin === 0, today: f1?.today === before || f1?.today === after,
      sameHours: (f1?.days ?? []).length === 1 && d0?.date === "2027-01-16" && nz(d0?.hours ?? []) === repNz && JSON.parse(repNz).length === 3, // ORACLE-EDIT (H4.2 · oracle author + controller ruling) (a): repNz is a canon string ◂
      sparse: (d0?.hours ?? []).length <= 24 && !(f44?.days ?? []).some((d: Any) => d.date === "2027-01-10"),
      sum44: f44?.ok === true && sum44 === 2_670_000 && perDay,
    };
    ck("S3.1", r, "facade = reportHourly/reportDailySales", `f1=${short(f1, 120)}`);
  }
  {
    const noPos = await fac(U3, actor(W.owner), "2027-01-16", "2027-01-16");
    const noPerm = await fac(U1, actor(W.staffHr), "2027-01-16", "2027-01-16");
    const d46 = await fac(U1, actor(W.owner), "2026-12-17", "2027-01-31");
    const d45 = await fac(U1, actor(W.owner), "2026-12-18", "2027-01-31");
    const r = {
      noPos: noPos?.ok === true && noPos?.connected === false && !("days" in (noPos ?? {})),
      noPerm: noPerm?.ok === false && noPerm?.code === "PERMISSION_DENIED" && !JSON.stringify(noPerm).includes("600000"),
      d46: d46?.ok === false && d46?.code === "VALIDATION", d45: d45?.ok === true,
    };
    ck("S3.2", r, "refusals", `noPos=${short(noPos, 60)} noPerm=${why(noPerm)} d46=${why(d46)}`);
  }
  {
    const f = await fac(U4, actor(W.owner), "2027-01-31", "2027-01-31");
    const h25 = ((f?.days ?? [])[0]?.hours ?? []).find((x: Any) => x.hour === 25);
    ck("S3.4", { ok: f?.ok === true && f?.cutoffMin === 240, date: (f?.days ?? [])[0]?.date === "2027-01-31", h25: h25?.netSalesSatang === 100_000 && h25?.billCount === 1 }, "hour 25", short(f, 120));
  }

  // ═══ S4 figures (owner) ═══
  const day = (v: Any, unitId: string | undefined, d: string, now = NOW) => call(M.svc, "laborDay", ctx, v, unitId ? { unitId, day: d } : { day: d }, O(now));
  const week = (v: Any, unitId: string, w = "2027-01-11") => call(M.svc, "laborWeek", ctx, v, { unitId, week: w }, O());
  const month = (v: Any, unitId: string, p: string) => call(M.svc, "laborMonth", ctx, v, { unitId, periodKey: p }, O());
  const cost = (r: Any) => mon(r)?.costSatang;
  const owner = V.owner;
  const d16pre = await day(owner, U1, "2027-01-16");
  const set0 = await call(M.svc, "setLaborSettings", ctx, owner, { targetTenths: 280, splhSatang: 150_000, minStaff: 1 });
  const d16 = await day(owner, U1, "2027-01-16");
  {
    const m = mon(d16) ?? {};
    ck("S4.1", { ok: okR(d16), cost: m.costSatang === 247_723, wage: m.wageSatang === 238_000, sso: m.ssoSatang === 9_723, sales: m.salesSatang === 1_000_000, pct: m.pctTenths === 248, target: m.targetTenths === 280, pos: d16?.sales === "OK" }, "worked example", `money=${short(m, 160)} ${why(d16)}`);
    const hs = (m.hours ?? []) as Any[];
    const sumH = hs.reduce((a, x) => a + (x.costSatang ?? 0), 0);
    ck("S4.2", {
      h7: hr(d16, 7).costSatang === 6_563, h10: hr(d16, 10).costSatang === 6_563, h11: hr(d16, 11).costSatang === 11_229, h12: hr(d16, 12).costSatang === 11_229, h15: hr(d16, 15).costSatang === 10_967, h19: hr(d16, 19).costSatang === 10_966, h22: hr(d16, 22).costSatang === 6_300,
      sum: sumH === 144_900 && m.unallocatedSatang === 102_823 && sumH + m.unallocatedSatang === m.costSatang, sales: hr(d16, 12).salesSatang === 600_000 && hr(d16, 18).salesSatang === 450_000 && hr(d16, 19).salesSatang === -50_000,
      fc: hr(d16, 12).forecastSatang === 400_000,
    }, "hour split", `h12=${short(hr(d16, 12), 80)} Σ=${sumH} un=${m.unallocatedSatang}`);
    const sh = (id: string) => ((m.shifts ?? []) as Any[]).find((x) => x.shiftId === id) ?? {};
    ck("S4.3", { a: sh(SH.A).costSatang === 52_500 && sh(SH.A).salesSatang === 600_000 && sh(SH.A).pctTenths === 88, b: sh(SH.B).costSatang === 42_000 && sh(SH.B).salesSatang === 1_000_000 && sh(SH.B).pctTenths === 42, c: sh(SH.C).costSatang === 50_400 && sh(SH.C).salesSatang === 400_000 && sh(SH.C).pctTenths === 126 }, "shift cells", short(m.shifts, 160));
    const dh = (r: Any, h: number) => ((r?.demand?.hours ?? []) as Any[]).find((x) => x.hour === h) ?? {};
    const pk = d16?.demand?.peak;
    ck("S4.4", { unset: okR(d16pre) && (d16pre?.demand === null || d16pre?.demand === undefined), set: okR(set0), h12: dh(d16, 12).scheduled === 2 && dh(d16, 12).needed === 3, h8: dh(d16, 8).scheduled === 1 && dh(d16, 8).needed === 0, peak: pk === 12 || pk?.hour === 12 }, "demand", `pre=${short(d16pre?.demand, 40)} set=${why(set0)} h12=${short(dh(d16, 12), 60)} peak=${short(pk, 40)}`);
  }
  {
    const a = await day(owner, U1, "2027-01-23", new Date("2027-01-16T03:00:00Z"));
    const b = await day(owner, U1, "2027-01-23");
    const c = await day(owner, U1, "2027-01-16", new Date("2027-01-16T05:30:00Z"));
    ck("S4.5", {
      skip: mon(a)?.salesSatang === 400_000 && mon(a)?.pctTenths === 388 && cost(a) === 155_323, incl: mon(b)?.salesSatang === 552_500,
      today: mon(c)?.salesSatang === 400_000 && mon(c)?.soFarSatang === 600_000 && mon(c)?.pctTenths === 619 && cost(c) === 247_723,
    }, "forecast + today", `a=${mon(a)?.salesSatang} b=${mon(b)?.salesSatang} c=${mon(c)?.salesSatang}/${mon(c)?.soFarSatang}/${mon(c)?.pctTenths}`);
  }
  const wk = await week(owner, U1);
  {
    const d15 = await day(owner, U1, "2027-01-15");
    const wd16 = ((wk?.days ?? []) as Any[]).find((x) => x.day === "2027-01-16") ?? {};
    ck("S4.6", { pub: cost(d15) === 155_323, foot: wk?.footer?.paidMinutes === 1_800 && wk?.footer?.costSatang === 1_216_411, d16: wd16.scheduledAtPeak === 2 && wd16.neededAtPeak === 3, days: (wk?.days ?? []).length === 7 }, "Q13", `d15=${cost(d15)} foot=${short(wk?.footer, 100)} ${why(wk)}`);
  }
  {
    const g1 = await day(owner, U1, "2027-01-26");
    const g2 = await day(owner, U2, "2027-01-26");
    const gU1 = (cost(g1) ?? NaN) - 155_323;
    const gU2 = cost(g2);
    const low = U1 < U2 ? gU1 : gU2;
    ck("S4.7", { total: gU1 + gU2 === 50_425, tie: low === 25_213 }, "paid-minute split", `U1=${gU1} U2=${gU2}`);
  }
  {
    const a = await day(owner, U1, "2027-01-31");
    const b = await day(owner, U1, "2027-02-01");
    const c = await day(owner, U4, "2027-01-31");
    const d = await day(owner, U4, "2027-02-01");
    const e = await day(owner, U1, "2028-02-29");
    ck("S4.8", {
      u1a: cost(a) === 193_123 && mon(a)?.salesSatang === 70_000, u1b: cost(b) === 171_966 && mon(b)?.salesSatang === 100_000,
      u4a: cost(c) === 37_800 && hr(c, 24).costSatang === 6_300 && hr(c, 25).costSatang === 6_300 && hr(c, 25).salesSatang === 100_000, u4b: cost(d) === 0, leap: cost(e) === 166_033,
    }, "BKK day/hour boundaries", `${cost(a)}/${mon(a)?.salesSatang} ${cost(b)}/${mon(b)?.salesSatang} ${cost(c)} ${cost(d)} ${cost(e)}`);
  }
  {
    const a = await day(owner, U4, "2027-01-20");
    const b = await day(owner, U4, "2027-01-21");
    ck("S4.9", { pub: cost(a) === 82_000, shop: cost(b) === 42_000 }, "holiday premium", `${cost(a)} ${cost(b)}`);
  }
  {
    const r = await Promise.all(["2027-03-05", "2027-03-16", "2027-03-21", "2027-03-31"].map((d) => day(owner, U3, d)));
    ck("S4.10", { costs: canon(r.map(cost)) === canon([35_001, 89_250, 54_250, 54_249]), noPos: r.every((x) => x?.sales === "NO_POS" && mon(x)?.pctTenths === null) }, "Q4b + X8", `costs=${r.map(cost).join(",")} sales=${r[0]?.sales}`);
  }
  {
    const j1 = await month(owner, U1, "2027-01");
    const j2 = await month(owner, U2, "2027-01");
    const f1 = await month(owner, U1, "2027-02");
    const m3 = await month(owner, U3, "2027-03");
    ck("S4.11", {
      jan: mv(j1, "costSatang") === 1_391_667 && mv(j1, "basis") !== "ESTIMATE" && mv(j1, "salesSatang") === 1_870_000 && mv(j1, "pctTenths") === 744, u2: mv(j2, "costSatang") === 695_833,
      feb: mv(f1, "costSatang") === 4_815_004 && mv(f1, "basis") === "ESTIMATE" && mv(f1, "prev")?.costSatang === 1_391_667, mar: mv(m3, "costSatang") === 1_839_250 && mv(m3, "basis") === "ESTIMATE",
    }, "month", `jan=${short(j1, 100)} feb=${mv(f1, "costSatang")} mar=${mv(m3, "costSatang")}`);
  }
  {
    const all = await day(owner, undefined, "2027-01-16");
    const T3 = await fx.newTenant("-t3", "QC HR H4.2 21 สาขา");
    const H3 = (await sysSvc.createSystem(T3, "HR", `HR3 ${tag}`)).id as string;
    await P.businessUnit.createMany({ data: Array.from({ length: 21 }, (_, i) => ({ tenantId: T3, type: "SHOP", name: `QC H42 b${i}`, slug: `${SLUG}-b${i}` })) });
    const o3 = await mk(T3, "owner3", "OWNER", [], {});
    const r21 = await call(M.svc, "laborDay", { tenantId: T3, systemId: H3 }, vOf(o3), { day: "2027-01-16" }, O());
    // ORACLE-EDIT (H4.2 · oracle author + controller ruling) (b): all units on 01-16 include leaver N at U3 (D2: endDate 2027-03-20 ≥ d; Jan full month 1,000,000/31 ⇒ 32,258 + SSO 1,613) ⇒ 247,723 + 33,871 ◂
    ck("S4.12", { all: okR(all) && cost(all) === 281_594, unitRequired: r21?.ok === false && r21?.code === "UNIT_REQUIRED" }, "R5", `all=${cost(all)} r21=${why(r21)}`);
  }
  {
    const empIds = Object.values(EM);
    const blobs = [d16, wk, await month(owner, U1, "2027-01")].map((x) => JSON.stringify(x ?? null));
    const keys = new Set([d16, wk].flatMap((x) => [...keysDeep(x)]));
    const bad = [...empIds.filter((id) => blobs.some((b) => b.includes(id))).map(() => "empId"), ...empNames.filter((nm) => blobs.some((b) => b.includes(nm))).map((nm) => `name:${nm.slice(7, 10)}`), ...["employeeId", "name", ...HR_FORBIDDEN_DTO_KEYS].filter((k) => keys.has(k))];
    chk("S4.13", okR(d16) && okR(wk) && bad.length === 0, "no per-person money", `${bad.join(",") || "no leak"} day=${why(d16)} week=${why(wk)}`);
  }
  // ORACLE-EDIT (H4.2 review · controller ruling) R3: current month % on completed days only · R4: caps flag truncation ◂
  {
    const mo = (now: Date) => call(M.svc, "laborMonth", ctx, owner, { unitId: U5, periodKey: "2027-04" }, O(now));
    const mid = await mo(new Date("2027-04-16T03:00:00Z"));
    const d1 = await mo(new Date("2027-04-01T03:00:00Z"));
    const past = await mo(new Date("2027-05-10T03:00:00Z"));
    const lbl = JSON.stringify(jsonOf(F.th)?.hr?.labor ?? {}) + JSON.stringify(M.rules?.LABOR_TEXT ?? {});
    ck("S4.14", { mid: okR(mid) && mv(mid, "pctTenths") === 103, day1: okR(d1) && mv(d1, "pctTenths") === null, label: lbl.includes("ยังไม่มีข้อมูลครบวัน"), past: okR(past) && mv(past, "pctTenths") === 193 && mv(past, "costSatang") === 3_087_510 && mv(past, "salesSatang") === 16_000_000 }, "completed days", `mid=${mv(mid, "pctTenths")} d1=${mv(d1, "pctTenths")} past=${mv(past, "costSatang")}/${mv(past, "salesSatang")}/${mv(past, "pctTenths")}`);
    const tr = (r: Any) => r?.truncated === true || r?.flags?.truncated === true || r?.money?.truncated === true || r?.footer?.truncated === true;
    const cap = { ...O(), __takeCap: 2 };
    const t = [await call(M.svc, "laborDay", ctx, owner, { unitId: U1, day: "2027-01-16" }, cap), await call(M.svc, "laborWeek", ctx, owner, { unitId: U1, week: "2027-01-11" }, cap), await call(M.svc, "laborMonth", ctx, owner, { unitId: U1, periodKey: "2027-02" }, cap)];
    ck("S4.15", { capped: t.every((x) => okR(x) && tr(x)), plain: !tr(d16) && !tr(wk), ui: /\btruncated\b/.test(stripComments(rd(F.ui))) }, "truncated flag", t.map((x) => `${why(x)}:${tr(x)}`).join(" "));
  }

  // ═══ S5 privacy matrix ═══
  {
    const pa = V.payAll;
    const r = await Promise.all([day(pa, U1, "2027-01-16"), week(pa, U1), month(pa, U1, "2027-01"), call(M.svc, "getLaborSettings", ctx, pa), call(M.svc, "getLaborSettings", ctx, owner), month(owner, U1, "2027-01")]);
    ck("S5.1", { day: cost(r[0]) === 247_723 && r[0]?.sales === "OK", demand: !!r[0]?.demand, week: r[1]?.footer?.costSatang === 1_216_411, month: mv(r[2], "costSatang") === 1_391_667, get: okR(r[3]) && labOf(r[3]).splhSatang === 150_000 && okR(r[4]), ownerMonth: mv(r[5], "costSatang") === 1_391_667 }, "P1", r.map(why).join(" "));
  }
  const NOs: [string, Any][] = [];
  {
    const u = V.payU2;
    const out = await day(u, U1, "2027-01-16");
    NOs.push(["payU2:U1", out]);
    // ORACLE-EDIT (H4.2 review · controller ruling) R1: money only from employees whose pay [U2] may see (home U2: K, L) · outsiders (J, E, G — home U1) = 0 + excludedHeadcount · no threshold hiding ◂
    const xh = (r: Any, ...ks: string[]) => ks.map((k) => (k === "footer" ? r?.footer : k === "money" ? r?.money : r)).find((o) => o && o.excludedHeadcount !== undefined)?.excludedHeadcount;
    const part = (r: Any) => r?.money?.partial ?? r?.footer?.partial ?? r?.partial;
    const jAlone = await day(u, U2, "2027-01-12");
    const jAll = await day(u, undefined, "2027-01-12");
    const three = await day(u, U2, "2027-01-13");
    const home1 = await day(u, U2, "2027-01-19");
    const own12 = await day(owner, U2, "2027-01-12");
    const own13 = await day(owner, U2, "2027-01-13");
    const wU2 = await week(u, U2);
    const mU2 = await month(u, U2, "2027-01");
    const fU2 = await month(u, U2, "2027-02");
    const noJ = (r: Any) => !/\b(36750|35000|1750|4594|4593)\b/.test(JSON.stringify(r ?? null));
    const sumH = (r: Any) => ((mon(r)?.hours ?? []) as Any[]).reduce((x, h) => x + (h.costSatang ?? NaN), 0) + (mon(r)?.unallocatedSatang ?? 0);
    ck("S5.2", {
      u1: out?.ok === false && out?.code === "NO", owner: cost(own12) === 36_750 && cost(own13) === 110_250 && mon(own13)?.pctTenths === 105,
      alone: okR(jAlone) && cost(jAlone) === 0 && xh(jAlone, "money", "top") === 1 && part(jAlone) === true && mon(jAlone)?.pctTenths === null && noJ(jAlone),
      aloneAll: okR(jAll) && cost(jAll) === 0 && xh(jAll, "money", "top") === 1 && noJ(jAll),
      three: cost(three) === 73_500 && sumH(three) === 73_500 && hr(three, 10).costSatang === 9_188 && mon(three)?.pctTenths === 70 && xh(three, "money", "top") === 1 && part(three) === true,
      home1: cost(home1) === 36_750 && (xh(home1, "money", "top") ?? 0) === 0 && !part(home1),
      week: wU2?.footer?.costSatang === 73_500 && xh(wU2, "footer", "top") === 1,
      month: okR(mU2) && mv(mU2, "costSatang") === 0 && xh(mU2, "top", "money") === 1 && !/695833|2087500/.test(JSON.stringify(mU2)),
      monthEst: okR(fU2) && mv(fU2, "costSatang") === 0 && xh(fU2, "top", "money") === 1 && noJ(fU2),
    }, "R1 visible-pay set only", `alone=${short(mon(jAlone), 70)} three=${cost(three)}/${mon(three)?.pctTenths} week=${short(wU2?.footer, 60)} month=${mv(mU2, "costSatang")}/${mv(fU2, "costSatang")}`);
    NOs.push(["payU2:unknown", await day(u, "c0000000000000000000000000", "2027-01-16")], ["payU2:UX", await day(u, UX, "2027-01-16")], ["payU2:weekU1", await week(u, U1)], ["payU2:monthU1", await month(u, U1, "2027-01")]);
  }
  {
    const g = V.mgr;
    const r = [await day(g, U1, "2027-01-16"), await week(g, U1), await month(g, U1, "2027-01")];
    const keys = r.flatMap((x) => [...keysDeep(x)]).filter((k) => /Satang$|Tenths$/.test(k));
    const dh = ((r[0]?.demand?.hours ?? []) as Any[]).find((x) => x.hour === 12) ?? {};
    const spoof = await day({ ...g, permissions: { "hr.payroll.read": true } }, U1, "2027-01-16");
    ck("S5.3", { day: okR(r[0]) && (r[0]?.money ?? null) === null, keys: keys.length === 0, demand: dh.scheduled === 2 && dh.needed === 3, month: r[2]?.ok === false || mv(r[2], "costSatang") === undefined, spoof: okR(spoof) && (spoof?.money ?? null) === null }, "Q10 headcounts only", `keys=${[...new Set(keys)].join(",") || "0"} ${r.map(why).join(" ")}`);
  }
  {
    const r = await day(V.payNoPos, U1, "2027-01-16");
    const w = await week(V.payNoPos, U1);
    const m = mon(r) ?? {};
    const dh = ((r?.demand?.hours ?? []) as Any[]).find((x) => x.hour === 12) ?? {};
    ck("S5.4", {
      cost: m.costSatang === 247_723, sales: r?.sales === "NO_PERMISSION" && m.salesSatang == null && m.pctTenths === null, hours: ((m.hours ?? []) as Any[]).length > 0 && (m.hours as Any[]).every((h) => h.salesSatang == null && h.forecastSatang == null),
      needed: ((r?.demand?.hours ?? []) as Any[]).length > 0 && (r.demand.hours as Any[]).every((h) => h.needed == null) && dh.scheduled === 2, week: ((w?.days ?? []) as Any[]).length === 7 && (w.days as Any[]).every((d) => d.neededAtPeak == null),
    }, "P3", `sales=${r?.sales} money=${short(m, 80)}`);
  }
  {
    for (const k of ["staffHr", "member", "self"] as const) NOs.push([`${k}:day`, await day(V[k], U1, "2027-01-16")], [`${k}:week`, await week(V[k], U1)], [`${k}:month`, await month(V[k], U1, "2027-01")]);
    NOs.push(["other:day", await day(V.other, U1, "2027-01-16")], ["other:own", await call(M.svc, "laborDay", { tenantId: T2, systemId: HRS }, V.other, { unitId: U1, day: "2027-01-16" }, O())], ["spoofOwner", await day({ ...V.member, role: "OWNER" }, U1, "2027-01-16")], ["noUser", await day({ role: "OWNER", unitAccess: [], permissions: {} }, U1, "2027-01-16")]);
    const first = NOs[0]?.[1];
    const ids = [T, T2, HRS, U1, U2, U3, U4, UX, ...Object.values(EM)];
    const bad = NOs.filter(([, r]) => !(r?.ok === false && r?.code === "NO" && typeof r?.reason === "string" && isThai(r.reason) && canon(r) === canon(first) && !ids.some((id) => JSON.stringify(r).includes(id)) && !/\d{3,}/.test(JSON.stringify(r)))).map(([k, r]) => `${k}:${why(r)}`);
    chk("S5.5", bad.length === 0 && NOs.length >= 15, `${NOs.length} refusals identical`, bad.join(" ") || "ok");
  }
  {
    const a = await day(V.payEmpty, U1, "2027-01-16");
    const b = await day(V.payEmpty, U2, "2027-01-19");
    ck("S5.6", { u1: cost(a) === 247_723, u2: cost(b) === 36_750 }, "[] = all branches", `${cost(a)} ${cost(b)}`);
  }
  // ORACLE-EDIT (H4.2 review · controller ruling) R2: nothing withheld may be derivable — outsider pay changes no byte of what the viewer gets (reader DTOs = the client props of 01/03) ◂
  {
    const outsiders = async (k: number) => {
      await P.hrSalaryProfile.updateMany({ where: { employeeId: EM.J }, data: { dailyRateSatang: 40_000 * k } });
      await P.hrSalaryProfile.updateMany({ where: { employeeId: EM.G }, data: { hourlyRateSatang: 6_003 * k } });
      await P.hrPayrollItem.updateMany({ where: { employeeId: EM.E, grossSatang: { in: [2_000_000, 4_000_000] } }, data: { grossSatang: 2_000_000 * k, ssoEmployerSatang: 87_500 * k } });
    };
    const lim = async (v: Any) => canon([await day(v, U2, "2027-01-12"), await day(v, U2, "2027-01-13"), await day(v, U2, "2027-01-19"), await day(v, U2, "2027-01-26"), await day(v, undefined, "2027-01-12"), await week(v, U2), await week(v, U2, "2027-01-25"), await month(v, U2, "2027-01"), await month(v, U2, "2027-02")]);
    const a1 = await lim(V.payU2);
    const o1 = await lim(owner);
    await outsiders(2);
    const a2 = await lim(V.payU2);
    const o2 = await lim(owner);
    await outsiders(1);
    const okAll = /"ok":true/.test(a1) && !/__throw/.test(a1);
    ck("S5.7", { readers: okAll, identical: a1 === a2, control: o1 !== o2 && !/__throw/.test(o1) }, "outsider pay invisible", `len=${a1.length}/${a2.length} ${short(a1, 80)}`);
    const all = async (k: 1 | 2) => {
      const op = k === 2 ? "* 2" : "/ 2";
      await P.$executeRawUnsafe(`UPDATE "HrSalaryProfile" SET "baseSalarySatang" = "baseSalarySatang" ${op}, "dailyRateSatang" = "dailyRateSatang" ${op}, "hourlyRateSatang" = "hourlyRateSatang" ${op} WHERE "tenantId" = $1`, T);
      await P.hrPayrollItem.updateMany({ where: { employeeId: EM.E, grossSatang: { in: [2_000_000, 4_000_000] } }, data: { grossSatang: 2_000_000 * k, ssoEmployerSatang: 87_500 * k } });
    };
    const g = V.mgr;
    const rd2 = async (v: Any) => canon([await day(v, U1, "2027-01-16"), await day(v, U2, "2027-01-13"), await week(v, U1), await week(v, U2), await month(v, U1, "2027-01"), await month(v, U1, "2027-02")]);
    const m1 = await rd2(g);
    const c1 = canon(await day(owner, U1, "2027-01-16"));
    await all(2);
    const m2 = await rd2(g);
    const c2 = canon(await day(owner, U1, "2027-01-16"));
    await all(1);
    const c3 = canon(await day(owner, U1, "2027-01-16"));
    ck("S5.8", { readers: /"ok":true/.test(m1) && !/__throw/.test(m1), identical: m1 === m2, control: c1 !== c2 && c1 === c3 }, "no money for non-payroll", `len=${m1.length}/${m2.length}`);
  }

  // ORACLE-EDIT (H4.2-FIX1 via H4.3 · controller ruling) FIX1-a/b/c ◂
  {
    const mo6 = (now: Date) => call(M.svc, "laborMonth", ctx, owner, { unitId: U6, periodKey: "2027-06" }, O(now));
    const open = await mo6(new Date("2027-06-28T03:00:00Z"));
    const done = await mo6(new Date("2027-07-05T03:00:00Z"));
    ck("S7.1", {
      open: okR(open) && mv(open, "basis") !== "ACTUAL" && mv(open, "costSatang") === 2_778_759 && mv(open, "salesSatang") === 27_000_000 && mv(open, "pctTenths") === 103 && mv(open, "throughDay") === "2027-06-27",
      ended: okR(done) && mv(done, "basis") === "ACTUAL" && mv(done, "costSatang") === 3_075_000 && mv(done, "salesSatang") === 28_000_000 && mv(done, "pctTenths") === 110 && (mv(done, "throughDay") ?? null) === null,
    }, "MTD while the month is open, actual after", `open=${mv(open, "basis")}/${mv(open, "costSatang")}/${mv(open, "salesSatang")}/${mv(open, "pctTenths")}/${mv(open, "throughDay")} done=${mv(done, "basis")}/${mv(done, "costSatang")}/${mv(done, "pctTenths")}`);
    const f2 = await month(V.payU2, U2, "2027-02");
    const ui = stripComments(rd(F.ui));
    ck("S7.2", {
      month: okR(f2) && mv(f2, "excludedHeadcount") === 1 && mv(f2, "partial") === true,
      prev: f2?.prev?.excludedHeadcount === 1 && f2?.prev?.partial === true && f2?.prev?.periodKey === "2027-01",
      ui: /\bmonth\??\.(partial|excludedHeadcount)\b/.test(ui) && /\bprev\??\.(partial|excludedHeadcount)\b/.test(ui),
    }, "partial/excluded per figure", `month=${mv(f2, "excludedHeadcount")}/${mv(f2, "partial")} prev=${short(f2?.prev, 80)}`);
    const d1 = await call(M.svc, "laborMonth", ctx, owner, { unitId: U5, periodKey: "2027-04" }, O(new Date("2027-04-01T03:00:00Z")));
    await P.hrEmployeeUnit.createMany({ data: Array.from({ length: 201 }, (_, i) => ({ tenantId: T, systemId: HRS, employeeId: EM.K, unitId: U1, fromDate: dbDate(`2030-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`), toDate: dbDate(`2030-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`) })) });
    const k19 = await day(owner, U2, "2027-01-19");
    await P.hrEmployeeUnit.deleteMany({ where: { tenantId: T, employeeId: EM.K } });
    const trK = k19?.flags?.truncated === true || k19?.money?.truncated === true || k19?.truncated === true;
    const lbl = /\bt\(\s*["']monthToDate["']\s*,\s*\{[^}]*\bday\s*:\s*(formatThaiDate|formatShortDate)\s*\(/.test(ui) && /import\s*\{[^}]*\b(formatThaiDate|formatShortDate)\b[^}]*\}\s*from\s*["']@\/lib\/ui\/date["']/.test(rd(F.ui));
    ck("S7.3", { day1: okR(d1) && mv(d1, "costSatang") === null && mv(d1, "pctTenths") === null, units200: okR(k19) && cost(k19) === 36_750 && trK, label: lbl }, "null on day 1 · nested cap · Thai date label", `d1=${mv(d1, "costSatang")}/${mv(d1, "pctTenths")} k19=${cost(k19)}/${trK}`);
  }
  // ═══ S6 settings ═══
  const audits = () => P.auditLog.count({ where: { tenantId: T, action: "hr.labor.settings" } });
  const SETV = (v: Any, i: Any) => call(M.svc, "setLaborSettings", ctx, v, i);
  const good = { targetTenths: 300, splhSatang: 150_000, minStaff: 1 };
  {
    const a0 = await audits();
    const r: Record<string, boolean> = {};
    for (const [k, v, t] of [["owner", V.owner, 301], ["payAll", V.payAll, 302], ["payNoPos", V.payNoPos, 303]] as const) {
      const s = await SETV(v, { ...good, targetTenths: t });
      const g = await call(M.svc, "getLaborSettings", ctx, v);
      r[k] = okR(s) && okR(g) && labOf(g).targetTenths === t;
    }
    const before = canon((await settingsOf(HRS)).hrLabor);
    for (const k of ["staffHr", "member", "self"] as const) r[k] = (await SETV(V[k], { ...good, targetTenths: 550 }))?.ok === false;
    r.other = (await call(M.svc, "setLaborSettings", { tenantId: T2, systemId: HRS }, V.other, { ...good, targetTenths: 550 }))?.ok === false && (await SETV(V.other, { ...good, targetTenths: 550 }))?.ok === false;
    r.getNo = (await call(M.svc, "getLaborSettings", ctx, V.member))?.ok === false;
    r.unchanged = canon((await settingsOf(HRS)).hrLabor) === before && before !== canon(undefined);
    const a1 = await audits();
    // bounds
    const before2 = canon((await settingsOf(HRS)).hrLabor);
    const badIn: Any[] = [{ targetTenths: 49 }, { targetTenths: 601 }, { targetTenths: 280.5 }, { splhSatang: 9_999 }, { splhSatang: 100_000_001 }, { minStaff: -1 }, { minStaff: 21 }, { minStaff: 1.5 }, { targetTenths: "abc" }];
    const refused = [];
    for (const b of badIn) refused.push((await SETV(V.owner, { ...good, ...b }))?.ok === false);
    const unchanged2 = canon((await settingsOf(HRS)).hrLabor) === before2;
    const a2 = await audits();
    const goodIn: Any[] = [{ targetTenths: 50 }, { targetTenths: 600 }, { splhSatang: null }, { splhSatang: 10_000 }, { splhSatang: 100_000_000 }, { minStaff: 0 }, { minStaff: 20 }];
    const accepted = [];
    for (const b of goodIn) {
      const s = await SETV(V.owner, { ...good, ...b });
      const g = labOf(await call(M.svc, "getLaborSettings", ctx, V.owner));
      accepted.push(okR(s) && Object.entries(b).every(([k, v]) => g[k] === v));
    }
    const a3 = await audits();
    await day(V.owner, U1, "2027-01-16");
    await call(M.svc, "getLaborSettings", ctx, V.owner);
    const a4 = await audits();
    ck("S6.1", r, "save/read matrix");
    ck("S6.2", { refused: refused.every(Boolean), unchanged: unchanged2, accepted: accepted.every(Boolean) }, "bounds", `refused=${refused.map(Number).join("")} accepted=${accepted.map(Number).join("")}`);
    ck("S6.3", { saves: a1 - a0 === 3, refusals: a2 === a1, goods: a3 - a2 === goodIn.length, reads: a4 === a3 }, "audit per save", `Δ=${a1 - a0}/${a2 - a1}/${a3 - a2}/${a4 - a3}`);
  }
  // S6.4 deterministic lock race (pattern qc-hr-set-1 S2)
  {
    const MARKER = "qcH42Marker";
    const out: string[] = [];
    let all = true;
    let k = 0;
    for (const mode of ["A", "B"] as const)
      for (let rep = 0; rep < 2; rep++, k++) {
        let settled = false;
        let p: Promise<Any> | null = null;
        let blocked = false;
        let err = "";
        try {
          await P.$transaction(async (tx: Any) => {
            if (mode === "A") await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, `hr:clockpolicy:${HRS}`);
            const rows = (await tx.$queryRawUnsafe(`SELECT "settings", pg_backend_pid() AS "pid" FROM "AppSystem" WHERE "id" = $1${mode === "B" ? " FOR UPDATE" : ""}`, HRS)) as Any[];
            const stale = (rows[0]?.settings ?? {}) as Any;
            const pid = Number(rows[0]?.pid);
            p = SETV(V.owner, { ...good, targetTenths: 400 + k }).then((x) => ((settled = true), x));
            let seen = false;
            for (let i = 0; i < 160 && !settled && !seen; i++) {
              await sleep(50);
              const w = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))`, pid).catch(() => null)) as Any[] | null;
              seen = Number(w?.[0]?.n ?? 0) > 0;
            }
            await sleep(400);
            blocked = seen && !settled;
            await tx.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = $1::jsonb WHERE "id" = $2`, JSON.stringify({ ...stale, [MARKER]: k }), HRS);
          }, { timeout: 30_000, maxWait: 10_000 });
        } catch (e) {
          err = errText(e);
        }
        const res = p ? await (p as Promise<Any>) : null;
        const s = await settingsOf(HRS);
        const g = labOf(await call(M.svc, "getLaborSettings", ctx, V.owner));
        const good1 = okR(res) && blocked && !!s.hrLabor && g.targetTenths === 400 + k && s[MARKER] === k && !err;
        if (!good1) all = false;
        out.push(`${mode}${rep}:${good1 ? "ok" : `blocked=${blocked} res=${why(res)} key=${g.targetTenths === 400 + k} marker=${s[MARKER] === k}${err ? ` err=${err.slice(0, 40)}` : ""}`}`);
      }
    chk("S6.4", all, "A·B ×2 blocked · hrLabor + marker survive", out.join(" "));
  }
  // S6.5 10 lanes × 3 ∥ clock writer
  {
    const written = new Set<number>();
    const lanes = Array.from({ length: 10 }, (_, l) => (async () => {
      const rs: Any[] = [];
      for (let i = 0; i < 3; i++) {
        const t = 100 + l * 3 + i;
        written.add(t);
        rs.push(await SETV(V.owner, { ...good, targetTenths: t }));
      }
      return rs;
    })());
    const clocks = (async () => {
      const rs: Any[] = [];
      for (let i = 0; i < 10; i++) rs.push(await call(M.clock, "saveClockPolicy", ctx, V.owner, { earlyInMin: 10 + i }));
      return rs;
    })();
    const res = (await within(Promise.all([...lanes, clocks]))) as Any;
    const flat = Array.isArray(res) ? (res as Any[][]).flat() : [res];
    const s = await settingsOf(HRS);
    const g = labOf(await call(M.svc, "getLaborSettings", ctx, V.owner));
    ck("S6.5", { allOk: flat.length === 40 && flat.every(okR), labor: !!s.hrLabor && written.has(g.targetTenths), clock: s.hrClock?.earlyInMin === 19 }, "both keys survive", `bad=${flat.filter((x) => !okR(x)).map(why).slice(0, 3).join(" ") || "0"} t=${g.targetTenths} clock=${s.hrClock?.earlyInMin}`);
  }
}

// ═════════════════════════ main ═════════════════════════
let crashed = "";
runStatic(chk, ck, BASE, IN_BASE);
await runPure(M.rules ?? {}, M.eng, chk, ck);
try {
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  for (const t of fx.tenants) {
    await P.posSale.deleteMany({ where: { tenantId: t } }).catch((e: unknown) => console.log(`  ⚠ cleanup posSale: ${errText(e)}`));
    await P.hrWorkDay.deleteMany({ where: { tenantId: t } }).catch((e: unknown) => console.log(`  ⚠ cleanup hrWorkDay: ${errText(e)}`));
  }
  if (lawKeys.length) await P.hrLawTable.deleteMany({ where: { sourceKey: { in: lawKeys } } }).catch((e: unknown) => console.log(`  ⚠ cleanup law: ${errText(e)}`));
  await cleanupFx(P, fx, SLUG);
}
{
  const f = await fitnessNoEnv();
  chk("X1", f.ok, "exit 0 ×2", f.note);
}
{
  const residue = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  const extra: string[] = [];
  for (const t of fx.tenants) {
    const a = await P.posSale.count({ where: { tenantId: t } }).catch(() => -1);
    const b = await P.hrWorkDay.count({ where: { tenantId: t } }).catch(() => -1);
    if (a) extra.push(`posSale=${a}`);
    if (b) extra.push(`hrWorkDay=${b}`);
  }
  const law = await P.hrLawTable.count({ where: { sourceKey: { startsWith: SLUG_PREFIX } } }).catch(() => -1);
  if (law) extra.push(`hrLawTable=${law}`);
  chk("Z1", residue.length === 0 && extra.length === 0, "none", [...residue, ...extra].join(",") || "none");
}
const code0 = finish({ forced: FORCE && skipReasons.length > 0, crashed, missing: [M.rules ? "" : F.rules, M.svc ? "" : F.svc, typeof M.pos?.salesFacts?.salesByHour === "function" ? "" : "salesFacts.salesByHour"].filter(Boolean) });
await P.$disconnect?.();
process.exit(code0);
