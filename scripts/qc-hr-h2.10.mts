// QC — HR V2 · H2.10 "ของฉัน" self-service — one self-scoped facade (hr/self.ts) · IDOR matrix · rules through the facade · advance · nav · UI
// Brief: ledger/hr-briefs/hr-brief-H2.10.md (DRAFT · Q1–Q14 defaults) · base b40c53138 · branch wip/hr-h2.10 · PRIVACY/IDOR WO.
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// CONTRACT (brief R2–R11): actor = { tenantId, userId, role, unitAccess, permissions } · opts { now? } last · refusals { ok:false, reason } (Thai, byte-exact)
//   readers: mySelf · myToday · myWeek(actor,{week}) · myRequests · myBalances(actor,{year}) · myLeaveForm · myLeavePreview(actor,input) ·
//            mySwapTargets(actor,{fromEntryId}) · myCorrectablePunches(actor,{from,to}) · myDocuments
//   writers: selfClock · selfRequestLeave · selfCancelLeave · selfRequestOt · selfCancelOt · selfRequestSwap · selfRespondSwap(actor,id,accept) ·
//            selfCancelSwap · selfRequestCorrection · selfCancelCorrection · selfRequestAdvance · selfCancelAdvance · selfAcknowledgeNote
//   resolveSelf(actor) · SELF_TEXT · hr/nav.ts hrNavFilter(items, viewer, {linked})
// SKIP while hr/self.ts is absent (exit 0) · QC_FORCE=1 / --force-run runs anyway · --list prints the ids.
// Own tenants `qc-hr-h210-*`, June 2031 (Mon 9 … Sun 15; "today" = Tue 10), `opts.now` injected, swept in finally (Z1).
// Run (lane DB): bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.10.mts
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Any, type Def, type Who, ROOT, rd, short, errText, textOf, srt, failedKeys, stripComments, sha, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase,
  diffHunks, changedVsBase, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, vOf, dbDate, importsOf, flat, jsonOf, testidsOf, loadOpt, modState, msgParity,
  tokensOnly, useServerFile, clientImports, canon, keysDeep, tagOf, fileAt, HR_FORBIDDEN_DTO_KEYS,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h2.10";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h210-";
const H = "src/lib/modules/hr/";
const ME = "src/app/app/me/hr";
const F = {
  self: `${H}self.ts`, acts: `${H}self-actions.ts`, ui: `${H}self-ui.tsx`, nav: `${H}nav.ts`, hrUi: `${H}ui.tsx`, layout: "src/app/app/layout.tsx",
  profile: "src/app/app/sys/[id]/hr/employees/[employeeId]/page.tsx", th: "src/messages/th/common.json", en: "src/messages/en/common.json",
  inv: "scripts/hr-ui-inventory.json", visual: "scripts/visual-hr.mts",
};
const PAGES = ["layout.tsx", "page.tsx", "week/page.tsx", "requests/page.tsx", "pay/page.tsx", "profile/page.tsx"].map((p) => `${ME}/${p}`);
const FROZEN = [
  ...["service.ts", "clock.ts", "correction.ts", "swap.ts", "ot.ts", "leave.ts", "lifecycle.ts", "roster.ts", "roster-board.ts", "judge.ts", "privacy.ts", "privacy-shared.ts",
    "payroll.ts", "payroll-rules-v2.ts", "pos-seam.ts", "pos-seam-read.ts", "actions.ts", "clock-actions.ts", "correction-actions.ts", "swap-actions.ts", "ot-actions.ts",
    "lifecycle-actions.ts", "payroll-actions.ts", "roster-actions.ts", "attendance-actions.ts", "settings-actions.ts"].map((f) => H + f),
  "src/lib/modules/approval/service.ts", "src/lib/approval-effects.ts", "src/lib/outbox-consumers.ts", "scripts/seed-hr-qc.mts", "scripts/hr-qc-env.mts",
];
const T = {
  noEmployee: "บัญชีของคุณยังไม่ได้ผูกกับรายชื่อพนักงานของร้านนี้ — ขอให้ผู้จัดการผูกบัญชีให้ก่อน",
  inactive: "สถานะพนักงานของคุณปิดอยู่ — ติดต่อผู้จัดการ",
  notFound: "ไม่พบรายการนี้ในคำขอของคุณ — เปิดหน้าใหม่แล้วลองอีกครั้ง",
  advAmount: "ระบุยอดเบิกเป็นบาทเต็ม ตั้งแต่ 1 ถึง 50,000 บาท",
  advOpen: "มีคำขอเบิกล่วงหน้าที่รออนุมัติอยู่แล้ว — ยกเลิกคำขอเดิมก่อน",
  advNote: "หมายเหตุยาวเกินไป (ไม่เกิน 200 ตัวอักษร)",
  advClosed: "ยังยื่นเบิกล่วงหน้าไม่ได้ — งวดเดือนนี้และเดือนหน้าปิดรอบจ่ายแล้ว",
};
const READERS = ["mySelf", "myToday", "myWeek", "myRequests", "myBalances", "myLeaveForm", "myLeavePreview", "mySwapTargets", "myCorrectablePunches", "myDocuments"];
const WRITERS = ["selfClock", "selfRequestLeave", "selfCancelLeave", "selfRequestOt", "selfCancelOt", "selfRequestSwap", "selfRespondSwap", "selfCancelSwap", "selfRequestCorrection", "selfCancelCorrection", "selfRequestAdvance", "selfCancelAdvance", "selfAcknowledgeNote"];
const K = {
  self: "active,name,ok,position,unitName", today: "clock,colleagues,day,ok,shift", shift: "breakMin,crossesMidnight,endMin,shiftName,startMin,unitName",
  mate: "endMin,name,position,shiftName,startMin", week: "days,ok,weekStart", day: "date,entries,holiday,leave", entry: "crossesMidnight,endMin,shiftName,startMin,unitName",
  reqs: "advances,corrections,leaves,ok,ot,swaps", leave: "canCancel,createdAt,days,fromDate,halfDay,hours,id,policyName,status,statusText,toDate,type",
  ot: "amountSatang,canCancel,date,end,id,minutes,start,status,timing", swap: "canCancel,canRespond,fromDate,fromShiftName,id,peerName,role,status,toDate,toShiftName",
  corr: "action,canCancel,day,id,kind,proposedAt,status", adv: "amountSatang,canCancel,createdAt,id,periodKey,status",
  docs: "certificate,myRequestsSlot,notes,ok,payslips", slip: "href,netSatang,periodKey,runId,status", note: "acknowledgedAt,body,createdAt,id,kind,periodLabel,score,title",
  target: "employeeId,entryId,name,position,shiftName",
};
const UI_IDS = ["page", "tabbar", "tab-today", "tab-week", "tab-requests", "tab-pay", "tab-profile", "empty", "ended", "shift", "clock", "clock-btn", "break-btn", "gps", "colleagues", "week",
  "actions", "act-leave", "act-ot", "act-swap", "act-correction", "act-advance", "act-slip", "balances", "req-list", "form-leave", "form-ot", "form-swap", "form-correction", "form-advance",
  "submit", "leave-impact", "notes", "payslips", "cert-slot", "myreq-slot"].map((s) => `hr-self-${s}`);
const UI_DYN = ["day", "bal", "req", "req-cancel", "note", "note-ack", "slip"].map((s) => `hr-self-${s}-*`);

const SEV: Record<string, Def[2]> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS: readonly Def[] = `
S1.1|R2|C|R|[static] self.ts: server module (no "use server") · exports resolveSelf + SELF_TEXT + 10 readers + 13 writers
S1.2|R2|C|R|[static] every exported self function calls resolveSelf · resolveSelf calls employeeOfUser
S1.3|R2|C|R|[static] self.ts never reads employeeId/userId/systemId/tenantId/linkedUserId from input (targetEmployeeId only)
S1.4|R3|C|R|[static] self-actions: use server · wrappers only · requireTenant · no id form fields · no DB · no now:
S1.5|R3|C|R|[static] me/hr pages exist · import only the self facade/actions/ui + shell/ui libs · no now:
S1.6|§5|C|R|[static] "use client" files of the feature reach no prisma module
S1.7|§3|M|R|SELF_TEXT byte-exact (7 texts)
S2.1|R4|M|R|mySelf: keys · name/position/unit of the linked row
S2.2|R4|C|R|myToday: own published shift · clock = myClockState verbatim · keys
S2.3|R4|M|R|myWeek: Mon–Sun · published only · own leave · holiday · week normalised
S2.4|R4|C|R|myRequests: own items only · exact keys per kind
S2.5|R4|M|R|myBalances = myLeaveBalances of the linked row
S2.6|R4|C|R|myDocuments: own APPROVED/PAID slips only · visible notes only · slots null · keys
S2.7|R4|M|R|myLeaveForm/myLeavePreview: policies · own shifts in range only
S3.1|R4/Q6|C|R|colleagues = same day · unit · overlap · published · active · not on leave · keys exact
S3.2|R8|C|R|reader outputs: no forbidden keys · no employee/user ids · no other person's name beyond colleague/peer
S3.3|R9|C|R|mySwapTargets: same unit/day active peers · foreign fromEntryId ⇒ notFound
S4.1|R2|C|R|[idor] injected ids in input/actor ⇒ rows for the linked employee in its own system only (leave · OT · correction · advance)
S4.2|R2|C|R|[idor] same-branch peer's objects: 7 actions ⇒ notFound bytes · nothing changed
S4.3|R2|C|R|[idor] other-branch objects ⇒ notFound bytes · nothing changed
S4.4|R2|C|R|[idor] other-tenant objects ⇒ notFound bytes · nothing changed
S4.5|R2|C|R|[idor] ENDED employee's objects + unknown ids ⇒ notFound bytes · nothing changed
S4.6|R11|C|R|[idor] ENDED actor: writers ⇒ inactive · no row · mySelf.active=false
S4.7|R2|C|R|[idor] unlinked actor: all 23 exports ⇒ noEmployee · no throw · no row
S4.8|R2|C|R|[idor] linked user acting in another tenant ⇒ noEmployee everywhere
S4.9|R2/R9|C|R|[idor] correction on a peer's punch · swap from a peer's entry · swap to an out-of-list target ⇒ refused · no row
S5.1|R5|C|R|leave via facade: plain STAFF files without key · balance refusal = service text · nothing written
S5.2|R10|M|R|owner who is an employee: own leave auto-APPROVED through the facade
S5.3|R5|M|R|OT via facade: window refusal = service text · PENDING · cancel
S5.4|R5|M|R|correction via facade: future/too-old/reason = service texts · PENDING · cancel
S5.5|R5|M|R|swap via facade: give-away → peer accepts (facade) → PENDING · cancel
S5.6|R5|C|R|clock via facade: no GPS = service text · in radius ⇒ MOBILE row · no coordinates in result
S5.7|R5|M|R|notes via facade: ack own visible once (first wins) · hidden ⇒ notFound
S6.1|R6|M|R|advance validation texts (0 · 1.5 · 50,001 · note 201)
S6.2|R6|C|R|advance ok ⇒ PENDING ADVANCE · first open period · requestedById · audit without amount/note
S6.3|R6|M|R|advance: second ⇒ advOpen · cancel own ⇒ deleted + audit · again ⇒ notFound
S6.4|R6|M|R|advance: both months closed ⇒ advClosed · nothing written
S6.5|R6|C|R|[race] advance ×2 ⇒ exactly 1 row · 1 advOpen
S7.1|R7|C|R|hrNavFilter: owner/manager/key holder/kiosk/payroll/plain staff/member × linked
S7.2|R7|M|R|[static] layout case HR wraps hrNavFilter · literal labels as base · marked hunk · drawer item
S7.3|R7|M|R|[static] hrTabs byte-identical · hrTabsFor exists · HR pages use hrTabsFor
S7.4|R7|M|R|[static] own profile ⇒ redirect /app/me/hr/profile (marked hunk)
S8.1|§5|M|R|[static] testids + tokens only + 44 px
S8.2|§5|M|R|[static] inventory rows ⇄ testids (wo H2.10)
S8.3|§5|M|R|[static] hr.self th = en
S8.4|§5|M|R|[static] visual SPECS["2.10"] (staff · member · owner on /app/me/hr)
S10.1|r2-1|C|R|[race] advance: 10 parallel self requests ∥ owner approving loop × 6 rounds ⇒ never > 1 non-rejected advance
S10.2|r2-1|C|R|advance: 10 parallel, no approver ⇒ exactly 1 row · cancel own pending ok · cancel after approval refused (row stays APPROVED)
S10.3|r2-1|C|R|advance approval guard: manager-path duplicates can never both be approved (decideAdjustment ADVANCE under hr:advance lock)
S10.4|r2-1|C|R|[static] advance writes live in payroll.ts (marked HR H2.10 block · decideAdjustment hunk) · self.ts writes no hrPayAdjustment
S10.5|r2-2|C|R|[static] fitness-hr F16.3: my* reader counts as guard only under src/app/app/me/hr (page elsewhere calling only mySelf ⇒ unguarded)
S10.6|r2-3|C|R|swap targets = people the swap service accepts (linked · active · not on approved leave · unit) · ENDED caller refused · leavePeer neutral · no 500 cap
S10.7|r2-4|M|R|[static] nav: "ของฉัน" once (top-level drawer only) · linked evaluated per HR system (layout + hrTabsFor)
S10.8|r2-5/6/7|M|R|[static] resolveSelf cached per request · reason not cut · cancel flags / ranges from services · ENDED quick actions not links
S9.1|frozen|C|G|[static] payroll-rules sha · frozen files without H2.10 hunks (other WOs' marked hunks tolerated)
S9.2|frozen|M|G|[static] no migration vs base · seed/env unchanged
Z1|house|C|G|no residue
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H2.10-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Def[3], t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H2.10-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.self))) skipReasons.push(`${F.self} absent (H2.10 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const BASE = baseRef("QC_H210_BASE");
const IN_BASE = pathInBase(F.self, BASE);
const files = (dir: string, out: string[] = []): string[] => {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const n of readdirSync(join(ROOT, dir))) {
    const p = `${dir}/${n}`;
    if (statSync(join(ROOT, p)).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
};
const fnBodies = (src: string) => [...src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([\s\S]*?)(?=\nexport\s|$)/g)].map((m) => ({ name: m[1], body: m[2] }));
const block = (src: string, at: string) => (src.indexOf(at) >= 0 ? src.slice(src.indexOf(at), src.indexOf("];", src.indexOf(at))) : "");
const labels = (s: string) => [...s.matchAll(/label:\s*["']([^"']+)["']/g)].map((m) => m[1]);

// ═════════════════════════ statics ═════════════════════════
async function runStatic(): Promise<void> {
  const s = stripComments(rd(F.self));
  {
    const ex = new Set([...s.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map((m) => m[1]));
    const want = ["resolveSelf", "SELF_TEXT", ...READERS, ...WRITERS];
    const miss = want.filter((w) => !ex.has(w));
    ck("S1.1", { file: !!s, notUseServer: !/^\s*["']use server["']/.test(rd(F.self)), exports: !miss.length }, "contract", miss.join(","));
  }
  {
    const fns = fnBodies(s).filter((f) => [...READERS, ...WRITERS].includes(f.name));
    const noRes = fns.filter((f) => !/resolveSelf\(/.test(f.body)).map((f) => f.name);
    const res = s.slice(Math.max(0, s.search(/function\s+resolveSelf/)), Math.max(0, s.search(/function\s+resolveSelf/)) + 1500);
    ck("S1.2", { fns: fns.length === READERS.length + WRITERS.length, each: !noRes.length, resolver: /employeeOfUser\(/.test(res) }, "all via resolveSelf", `${fns.length} · ${noRes.join(",")}`);
  }
  {
    const bad = [...s.matchAll(/\b(input|args|params|body|form\w*|fd|req)\??\.(employeeId|userId|systemId|tenantId|linkedUserId)\b|\[\s*["'](employeeId|userId|systemId|tenantId)["']\s*\]|get\(\s*["'](employeeId|userId|systemId|tenantId)["']/g)].map((m) => m[0]);
    const spread = /\.\.\.\s*(input|args|params|body)\b/.test(s);
    ck("S1.3", { file: !!s, noRead: !bad.length, noSpread: !spread }, "no foreign id read", bad.slice(0, 4).join(" "));
  }
  {
    const a = stripComments(rd(F.acts));
    const u = useServerFile(a, [], [/requireTenant\(/]);
    const fields = [...a.matchAll(/get\(\s*["'](employeeId|userId|systemId|tenantId|linkedUserId)["']/g)].map((m) => m[1]);
    const noDb = !importsOf(a).some((i) => !i.type && /core\/db|@prisma\/client/.test(i.spec));
    const viaSelf = importsOf(a).some((i) => /\/self$|\.\/self$/.test(i.spec));
    ck("S1.4", { file: !!a, ...u.r, fields: !fields.length, noDb, viaSelf, noNow: !/\bnow\s*:/.test(a), member: /requireMembership\(/.test(a) }, "wrappers", `${u.got.length} fns ${fields.join(",")}`);
  }
  {
    const fs = files(ME);
    // ORACLE-EDIT (H3.6 builder, 13 Nov — brief hr-brief-H3.6 R14/R15 put the self 50 Tawi card on /app/me/hr/pay and a route under /app/me/hr/tax-cert):
    //   + exactly the two H3.6 self entry points (filings/ui#MyTaxCertCard · filings/download-route#myTaxCertGet) — both resolve the user through H2.10 resolveSelf
    // ORACLE-EDIT (H4.5 builder, 14 Nov — brief hr-brief-H4.5 R10/R11 put the "LINE ของฉัน" card on /app/me/hr/profile):
    //   + exactly the H4.5 self entry points (line-link#myLineStatus via resolveSelf · line-actions · line-ui · platform/hr-line-actions#issueMyLineCodeAction passed as a prop)
    const allowedH45 = (spec: string) => /^@\/lib\/modules\/hr\/line-(link|actions|ui)$/.test(spec) || spec === "@/lib/platform/hr-line-actions"; // ORACLE-EDIT (H4.5 builder)
    const allowed = (spec: string) => /^(react|next\/|next-intl)/.test(spec) || /^@\/components\//.test(spec) || /^@\/lib\/ui\//.test(spec) || spec === "@/lib/core/context" || /^@\/lib\/modules\/hr\/(self|self-actions|self-ui)$/.test(spec) || /^@\/lib\/modules\/hr\/filings\/(ui|download-route)$/.test(spec) || /^\.{1,2}\//.test(spec) || allowedH45(spec); // ORACLE-EDIT (H4.5 builder): + allowedH45
    const bad = fs.flatMap((f) => importsOf(stripComments(rd(f))).filter((i) => !i.type && !allowed(i.spec)).map((i) => `${f.slice(ME.length + 1)}:${i.spec}`));
    const now = fs.filter((f) => /\bnow\s*:/.test(stripComments(rd(f))));
    ck("S1.5", { pages: PAGES.every((p) => existsSync(join(ROOT, p))), imports: fs.length > 0 && !bad.length, noNow: !now.length }, "6 files · facade only", `${PAGES.filter((p) => !existsSync(join(ROOT, p))).length} missing · ${bad.slice(0, 3).join(" ")}`);
  }
  {
    const cl = [F.ui, ...files(ME)].filter((f) => /^\s*["']use client["']/.test(rd(f)));
    const reach = cl.flatMap((f) => clientImports(rd(f), () => true, /self-actions/).dbReach.map((d) => `${f}:${d}`));
    const hrImp = cl.flatMap((f) => importsOf(rd(f)).filter((i) => !i.type && /modules\/hr\/(?!self-actions|self-ui)/.test(i.spec)).map((i) => `${f}:${i.spec}`));
    ck("S1.6", { ui: /^\s*["']use client["']/.test(rd(F.ui)), reach: !reach.length, hr: !hrImp.length }, "clean", [...reach, ...hrImp].slice(0, 3).join(" "));
  }
  {
    const src = rd(F.self);
    const miss = Object.entries(T).filter(([k, v]) => k !== "inactive" && !src.includes(v)).map(([k]) => k);
    ck("S1.7", { file: !!src, texts: !miss.length }, "7 texts", miss.join(","));
  }
  // ── nav (static) ──
  {
    const L = rd(F.layout);
    // ORACLE-EDIT (H2.11 lands second · controller r3): the marked `HR H2.11` tab line ("คำขอ" — gated by hrNavFilter) is not part of H2.10's label set ◂
    const no211 = (x: string) => x.split("\n").filter((l) => !/HR H2\.11\b/.test(l)).join("\n");
    const cur = no211(block(L, 'case "HR":'));
    const base = no211(block(fileAt(BASE, F.layout) ?? "", 'case "HR":'));
    const hunks = IN_BASE ? null : diffHunks(BASE, F.layout);
    const mine = (hunks ?? []).filter((h) => /HR H2\.10 ▸/.test(h.added.join("\n")));
    const foreign = (hunks ?? []).filter((h) => !/▸/.test(h.added.join("\n")));
    // ORACLE-EDIT (H2.12 sweep): "labels = base" describes H2.10's own diff — n/a once H2.10 (me/hr self page) is in the base (later WOs / main syncs may add nav labels) · non-empty still checked
    ck("S7.2", { wrap: /hrNavFilter\(/.test(cur), labels: (IN_BASE || srt(labels(cur)) === srt(labels(base))) && labels(cur).length > 0, marked: IN_BASE || (mine.length >= 1 && !foreign.length), drawer: /\/app\/me\/hr/.test(L) }, "wrap · labels · hunk", IN_BASE ? "in base" : `${hunks?.length}/${mine.length}`);
  }
  {
    // ORACLE-EDIT (H2.11 lands second · controller r3): hrTabs = base except the one marked `HR H2.11` line ◂
    const tabs = (src: string) => block(src, "export function hrTabs(").split("\n").filter((l) => !/HR H2\.11\b/.test(l)).join("\n");
    const cur = rd(F.hrUi);
    const pages = files("src/app/app/sys/[id]/hr").filter((f) => /hrTabs\(/.test(stripComments(rd(f))));
    // ORACLE-EDIT (H2.12 sweep): "hrTabs = base" is n/a once H2.10 is in the base (later WOs may add tabs) · non-empty + hrTabsFor still checked
    ck("S7.3", { same: (IN_BASE || tabs(cur) === tabs(fileAt(BASE, F.hrUi) ?? "")) && tabs(cur).length > 0, forFn: /export\s+(async\s+)?function\s+hrTabsFor\(/.test(cur), pages: !pages.length, hub: !/<ModuleTabs items=\{hrTabs\(/.test(cur) }, "hrTabs kept · hrTabsFor used", pages.join(","));
  }
  {
    const p = rd(F.profile);
    ck("S7.4", { redirect: /redirect\(\s*["'`]\/app\/me\/hr\/profile["'`]\s*\)/.test(p), marked: /HR H2\.10 ▸/.test(p) }, "redirect hunk");
  }
  // ── UI ──
  {
    const src = [F.ui, ...files(ME)].map((f) => rd(f)).join("\n");
    const ids = testidsOf(src, "hr-self-");
    const miss = [...UI_IDS, ...UI_DYN].filter((t) => !ids.has(t));
    ck("S8.1", { some: ids.size > 0, ids: !miss.length, ...tokensOnly(stripComments(src)), h44: /min-h-\[44px\]|min-h-11\b|h-11\b/.test(src) }, "ids · tokens · 44 px", miss.slice(0, 6).join(","));
    const rows = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((r) => String(r.testid ?? "").startsWith("hr-self-") && r.wo !== "H4.5"); // ORACLE-EDIT (H4.5 builder, 14 Nov): hr-self-line-* rows belong to H4.5 (oracle qc-hr-h4.5 S1.13) — excluded here
    const rowIds = new Set(rows.map((r) => String(r.testid)));
    const want = [...UI_IDS, ...UI_DYN];
    ck("S8.2", { some: rows.length > 0, codeRow: want.every((t) => rowIds.has(t)), rowCode: [...rowIds].every((t) => ids.has(t)), meta: rows.length > 0 && rows.every((r) => r.wo === "H2.10" && r.oracle === SUITE) }, "rows", `rows=${rows.length}`);
    const th = flat(jsonOf(F.th)?.hr?.self ?? {});
    const en = flat(jsonOf(F.en)?.hr?.self ?? {});
    ck("S8.3", msgParity(th, en, []), "hr.self th=en", `th=${Object.keys(th).length} en=${Object.keys(en).length}`);
    const v = rd(F.visual);
    const sp = v.slice(Math.max(0, v.indexOf('"2.10"')), Math.max(0, v.indexOf('"2.10"')) + 3000);
    ck("S8.4", { spec: v.includes('"2.10"'), me: /\/app\/me\/hr/.test(sp), users: ["staff", "member", "owner"].every((u) => sp.includes(`"${u}"`)) }, "SPECS 2.10");
  }
  // ── r2 fix round (controller 12 Nov) ──
  {
    const pay = rd(`${H}payroll.ts`);
    const mark = pay.indexOf("HR H2.10 ▸");
    const dec = pay.slice(pay.indexOf("export async function decideAdjustment("), pay.indexOf("\nexport", pay.indexOf("export async function decideAdjustment(") + 10));
    const sx = stripComments(rd(F.self));
    const r = {
      block: mark >= 0 && /export async function requestSelfAdvance\(/.test(pay) && /export async function cancelSelfAdvance\(/.test(pay) && /hr:advance:\$\{/.test(pay),
      decide: /HR H2\.10/.test(dec) && /ADVANCE/.test(dec),
      selfNoWrite: !/hrPayAdjustment\.(create|createMany|delete|deleteMany|update|updateMany|upsert)\b/.test(sx) && /requestSelfAdvance\(/.test(sx) && /cancelSelfAdvance\(/.test(sx),
    };
    ck("S10.4", r, "payroll.ts block · self.ts no writes");
  }
  {
    const fh = (await import("./fitness-hr.mjs" as string)) as Any;
    const dir = mkdtempSync(join(tmpdir(), "qc-h210-f163-"));
    const fake = join(dir, "page.tsx");
    writeFileSync(fake, 'import { mySelf } from "@/lib/modules/hr/self";\nexport default async function P() { const r = await mySelf({ tenantId: "t", userId: "u", role: "STAFF", unitAccess: [], permissions: {} }); return r.ok ? null : null; }\n');
    let outside: Any = null;
    let inside: Any = null;
    try {
      outside = fh.pageGuard?.(ROOT, fake);
      inside = fh.pageGuard?.(ROOT, join(ROOT, `${ME}/page.tsx`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    ck("S10.5", { fn: typeof fh.pageGuard === "function", outside: outside?.guarded === false, inside: inside?.guarded === true }, "outside unguarded · me/hr guarded", `${outside?.detail ?? "∅"} | ${inside?.detail ?? "∅"}`);
  }
  {
    const L = rd(F.layout);
    const hrCase = L.slice(L.indexOf('case "HR":'), L.indexOf('case "INVENTORY":'));
    const ui = rd(F.hrUi);
    const tf = ui.slice(ui.indexOf("function hrTabsFor("), ui.indexOf("function hrTabsFor(") + 1200);
    const r = { once: /HR_SELF_HREF/.test(hrCase) && /\/app\/me\/hr/.test(L), perSystem: /===\s*slugOrId|slugOrId\s*===/.test(hrCase), tabs: /===\s*systemId|systemId\s*===/.test(tf) };
    ck("S10.7", r, "once · per system");
  }
  {
    const sx = stripComments(rd(F.self));
    const ux = stripComments(rd(F.ui));
    const acts = ux.slice(ux.indexOf("export function SelfActions("), ux.indexOf("export function SelfBalances("));
    const r = {
      cache: importsOf(sx).some((i) => i.spec === "react") && /\bcache\(/.test(sx),
      reason: !/reason[^\n]*\.slice\(/.test(sx),
      range: !/\b62\b/.test(sx) && !/-35\b/.test(sx),
      cancel: !/status === "PENDING"/.test(sx) && /CancelOpen\(/.test(sx),
      ended: acts.length > 0 && !/pointer-events-none|aria-disabled/.test(acts) && /canWrite \?/.test(acts),
    };
    ck("S10.8", r, "cache · no cut · service flags · no ENDED links");
  }
  // ── frozen ──
  {
    const bad: string[] = [];
    for (const f of FROZEN) {
      if (IN_BASE) break;
      const h = diffHunks(BASE, f);
      if (h === null) continue;
      // ORACLE-EDIT r2 (controller fix-round ruling 12 Nov): payroll.ts (atomic self advance + ADVANCE approval guard), swap.ts (eligibility reader),
      //   service.ts / ot.ts / correction.ts (cancel-gate predicates) may carry PURE-ADDITION hunks marked `HR H2.10 ▸` — nothing removed, nothing unmarked ◂
      const r2ok = ["payroll.ts", "swap.ts", "service.ts", "ot.ts", "correction.ts"].includes(f.replace(H, ""));
      if (h.some((x) => (/HR H2\.10/.test(x.added.join("\n")) && !(r2ok && x.removed.length === 0)) || !/▸/.test(x.added.join("\n")))) bad.push(f.replace(H, ""));
    }
    const sh = sha(rd(PAYROLL_RULES_FILE));
    chk("S9.1", sh === PAYROLL_RULES_SHA && !bad.length, `${PAYROLL_RULES_SHA.slice(0, 12)} · frozen`, `${sh.slice(0, 12)} · ${bad.join(",") || (IN_BASE ? "n/a in base" : "unchanged")}`);
    const mig = IN_BASE ? "n/a" : changedVsBase(BASE, ["prisma"]);
    const seed = IN_BASE ? "n/a" : changedVsBase(BASE, ["scripts/seed-hr-qc.mts", "scripts/hr-qc-env.mts", "scripts/hr-expected.json"]);
    chk("S9.2", (IN_BASE || mig === "unchanged") && (IN_BASE || seed === "unchanged"), "prisma + seed unchanged", `${mig} · ${seed}`);
  }
}

// ═════════════════════════ DB ═════════════════════════
type RO = { ok: boolean; text: string; value: Any };
async function callMod(Mo: Any, file: string, fn: string, args: unknown[]): Promise<RO> {
  const mo = Mo && !Mo.__err ? Mo : null;
  if (typeof mo?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(Mo, file)})`, value: undefined };
  try {
    const v = (await mo[fn](...args)) as Any;
    const ok = v !== null && v !== undefined && !(typeof v === "object" && v.ok === false);
    return { ok, text: ok ? "" : textOf(v), value: v };
  } catch (e) {
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  }
}
const shown = (r: RO) => (r.ok ? "ok" : `"${short(r.text, 44)}"`);
const keysOf = (o: Any) => (o && typeof o === "object" ? srt(Object.keys(o)) : "∅");
const arr = (v: Any): Any[] => (Array.isArray(v) ? v : []);

const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const S = await loadOpt(F.self, "@/lib/modules/hr/self");
const NAV = await loadOpt(F.nav, "@/lib/modules/hr/nav");
console.log(`[${SUITE}] self=${modState(S, F.self)} · nav=${modState(NAV, F.nav)} · base=${BASE.slice(0, 9)}${IN_BASE ? " (H2.10 in base)" : ""}`);
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const hr = (await import("@/lib/modules/hr/service")) as Any;
const lv = (await import("@/lib/modules/hr/leave")) as Any;
const clk = (await import("@/lib/modules/hr/clock")) as Any;
const corr = (await import("@/lib/modules/hr/correction")) as Any;
const ot = (await import("@/lib/modules/hr/ot")) as Any;
const settings = (await import("@/lib/modules/hr/settings")) as Any;
const cset = (await import("@/lib/modules/hr/clock-settings")) as Any;
const rb = (await import("@/lib/modules/hr/roster-board")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const call = (fn: string, ...a: unknown[]) => callMod(S, F.self, fn, a);
const bkk = (day: string, hm = "10:00") => new Date(`${day}T${hm}:00+07:00`);
const DAY = "2031-06-10";
const NOW = bkk(DAY, "08:52");
const O1 = { now: NOW };
const CEN = { lat: 12.5684, lng: 99.9577 };

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR H2.10 ของฉัน");
  const T2 = await fx.newTenant("-other", "QC HR H2.10 ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const v1 = await fx.newUnit(T2, `สาขาอื่น ${tag}`, "v1");
  const sys = async (n: string, t = TT) => (await sysSvc.createSystem(t, "HR", `${n} ${tag}`)).id as string;
  const sA = await sys("ทีม A");
  const sB = await sys("ทีม B");
  const sO = await sys("ทีมอื่น", T2);
  const cA = { tenantId: TT, systemId: sA };
  const cO = { tenantId: T2, systemId: sO };
  const mk = (t: string, r: Who["role"], ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC210 ${t} ${tag}`, r, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", [], {}), a: await mk("a", "STAFF", [], {}), b: await mk("b", "STAFF", [], {}), c: await mk("c", "STAFF", [], {}), d: await mk("d", "STAFF", [], {}),
    x: await mk("x", "STAFF", [], {}), l: await mk("l", "STAFF", [], {}), s: await mk("s", "STAFF", [], {}), n: await mk("n", "STAFF", [], {}), o: await mk("o", "STAFF", [], {}, T2),
    ownerO: await mk("ownero", "OWNER", [], {}, T2),
  };
  const ACT = (w: Who, tid = TT, extra: Any = {}) => ({ tenantId: tid, ...vOf(w), ...extra });
  const nm = (k: string) => `QC210 ${k} ${tag}`;
  const emp = (s: string, k: string, w: Who | null, o: Any = {}, tid = TT) => fx.mkEmp(tid, s, nm(k), { linkedUserId: w?.id ?? null, unitId: u1, startDate: "2031-01-05", status: "ACTIVE", position: `ตำแหน่ง ${k}`, ...o });
  const E = {
    A: await emp(sA, "A", U.a), B: await emp(sA, "B", U.b), C: await emp(sA, "C", U.c), D: await emp(sA, "D", U.d, { unitId: u2 }), X: await emp(sA, "X", U.x, { status: "ENDED", active: false, endDate: "2031-05-31" }),
    L: await emp(sA, "L", U.l), Up: await emp(sA, "Up", null), W: await emp(sA, "W", U.owner), Sx: await emp(sB, "S", U.s), O: await emp(sO, "O", U.o, { unitId: v1 }, T2),
  };
  const ov = vOf(U.owner);
  const ovO = vOf(U.ownerO);
  // ── fixtures (service where it is the public way; raw rows for foreign objects) ──
  const shiftOf = async (c: Any, n: string, a: number, b: number) => (await P.hrShift.create({ data: { tenantId: c.tenantId, systemId: c.systemId, name: `${n} ${tag}`, startMin: a, endMin: b, breakMin: 60, crossesMidnight: false } })).id as string;
  const SM = await shiftOf(cA, "เช้า", 540, 1020);
  const SE = await shiftOf(cA, "ค่ำ", 1080, 1380);
  const SO = await shiftOf(cO, "เช้าโอ", 540, 1020);
  const ent = async (c: Any, e: string, day: string, sh: string, unitId: string, pub = true, a = 540, b = 1020) =>
    (await P.hrRosterEntry.create({ data: { tenantId: c.tenantId, systemId: c.systemId, employeeId: e, date: dbDate(day), shiftId: sh, unitId, startMin: a, endMin: b, breakMin: 60, crossesMidnight: false, published: pub, publishedAt: pub ? new Date("2031-06-01T00:00:00Z") : null, source: "MANUAL" } })).id as string;
  for (const k of ["A", "B", "X", "L"] as const) await ent(cA, E[k], DAY, SM, u1);
  await ent(cA, E.C, DAY, SE, u1, true, 1080, 1380);
  await ent(cA, E.D, DAY, SM, u2);
  await ent(cA, E.Up, DAY, SM, u1, false);
  await ent(cA, E.A, "2031-06-11", SM, u1, false);
  await ent(cA, E.A, "2031-06-13", SM, u1);
  const FD = "2031-06-21";
  const eAF = await ent(cA, E.A, FD, SM, u1);
  const eBF = await ent(cA, E.B, "2031-06-22", SM, u1);
  const eDF = await ent(cA, E.D, "2031-06-22", SM, u2);
  const eXF = await ent(cA, E.X, "2031-05-20", SM, u1);
  const eOF = await ent(cO, E.O, "2031-06-22", SO, v1);
  await P.hrLeave.create({ data: { tenantId: TT, systemId: sA, employeeId: E.L, type: "PERSONAL", fromDate: dbDate(DAY), toDate: dbDate(DAY), days: 1, status: "APPROVED" } });
  await P.hrLeave.create({ data: { tenantId: TT, systemId: sA, employeeId: E.A, type: "PERSONAL", fromDate: dbDate("2031-06-14"), toDate: dbDate("2031-06-14"), days: 1, status: "APPROVED" } });
  const pol = async (c: Any, v: Any, cat: string, n: string, q: number | null) => {
    const r = await settings.createLeavePolicy(c, v, { unitId: null, category: cat, name: `${n} ${tag}`, quotaDays: q });
    if (!r?.ok) throw new Error(`fixture policy ${n}: ${r?.reason}`);
    return r.id as string;
  };
  const PL = { pers: await pol(cA, ov, "PERSONAL", "กิจ", 3), sick: await pol(cA, ov, "SICK", "ป่วย", 30), persO: await pol(cO, ovO, "PERSONAL", "กิจโอ", 3) };
  const hol = await settings.upsertHoliday(cA, ov, { unitId: null, date: "2031-06-15", name: `QC210 วันหยุด ${tag}`, kind: "PUBLIC", shopOpen: false });
  if (!hol?.ok) throw new Error(`fixture holiday: ${hol?.reason}`);
  const site = await cset.saveClockSite(cA, ov, { unitId: u1, mobileEnabled: true, gpsRequired: true, centerLat: CEN.lat, centerLng: CEN.lng, radiusM: 150, minAccuracyM: 100, photoRequired: false, acceptPdpaNotice: true });
  if (!site?.ok) throw new Error(`fixture site: ${site?.reason}`);
  for (const [c, e] of [[cA, E.A], [cA, E.B], [cA, E.D], [cA, E.W], [cO, E.O]] as const) await P.hrSalaryProfile.create({ data: { tenantId: c.tenantId, systemId: c.systemId, employeeId: e, baseSalarySatang: 1_800_000 } });
  const attA = (await P.hrAttendance.create({ data: { tenantId: TT, systemId: sA, employeeId: E.A, kind: "IN", at: bkk("2031-06-09", "09:02"), source: "KIOSK" } })).id as string;
  await P.hrAttendance.create({ data: { tenantId: TT, systemId: sA, employeeId: E.A, kind: "OUT", at: bkk("2031-06-09", "17:00"), source: "KIOSK" } });
  const attB = (await P.hrAttendance.create({ data: { tenantId: TT, systemId: sA, employeeId: E.B, kind: "IN", at: bkk("2031-06-09", "09:05"), source: "KIOSK" } })).id as string;
  const run = async (s: string, period: string, status: string, items: [string, number][], tid = TT) => {
    const r = (await P.hrPayrollRun.create({ data: { tenantId: tid, systemId: s, periodKey: period, payDate: dbDate(`${period}-28`), status } })).id as string;
    for (const [e, net] of items) await P.hrPayrollItem.create({ data: { tenantId: tid, systemId: s, runId: r, employeeId: e, grossSatang: net, ssoBaseSatang: 0, ssoEmployeeSatang: 0, ssoEmployerSatang: 0, whtSatang: 0, netSatang: net } });
    return r;
  };
  const rPaid = await run(sA, "2031-05", "PAID", [[E.A, 1_712_345], [E.B, 1_500_000]]);
  await run(sA, "2031-06", "DRAFT", [[E.A, 1_700_000]]);
  await run(sB, "2031-06", "APPROVED", []);
  await run(sB, "2031-07", "DRAFT", []);
  const noteV = (await P.hrReviewNote.create({ data: { tenantId: TT, systemId: sA, employeeId: E.A, kind: "VERBAL_WARNING", title: `เตือน ${tag}`, body: "มาสาย", visibleToEmployee: true } })).id as string;
  const noteH = (await P.hrReviewNote.create({ data: { tenantId: TT, systemId: sA, employeeId: E.A, kind: "NOTE", title: `ซ่อน ${tag}`, body: "ลับ", visibleToEmployee: false } })).id as string;
  // foreign objects: same-branch B · other-branch D · other-tenant O · ENDED X
  const FO: Record<string, Record<string, string>> = {};
  const foreign = async (k: string, c: Any, e: string, entry: string, w: Who) => {
    const t = { tenantId: c.tenantId, systemId: c.systemId };
    FO[k] = {
      leave: (await P.hrLeave.create({ data: { ...t, employeeId: e, type: "PERSONAL", fromDate: dbDate("2031-07-01"), toDate: dbDate("2031-07-01"), days: 1, status: "PENDING", filedById: w.id } })).id,
      ot: (await P.hrOtRequest.create({ data: { ...t, employeeId: e, date: dbDate("2031-06-12"), startAt: bkk("2031-06-12", "18:00"), endAt: bkk("2031-06-12", "19:00"), minutes: 60, timing: "BEFORE", status: "PENDING", requestedByUserId: w.id } })).id,
      corr: (await P.hrTimeCorrection.create({ data: { ...t, employeeId: e, action: "ADD", kind: "IN", proposedAt: bkk("2031-06-09", "09:00"), reason: "qc ลืม", status: "PENDING", requestedByUserId: w.id } })).id,
      swap: (await P.hrShiftSwapRequest.create({ data: { ...t, requesterEmployeeId: e, fromEntryId: entry, targetEmployeeId: k === "B" ? E.A : null, status: "AWAITING_PEER", requestedByUserId: w.id } })).id,
      adv: (await P.hrPayAdjustment.create({ data: { ...t, employeeId: e, periodKey: "2031-07", kind: "ADVANCE", amountSatang: 100_000, requestedById: w.id } })).id,
      note: (await P.hrReviewNote.create({ data: { ...t, employeeId: e, kind: "VERBAL_WARNING", title: `เตือน ${k} ${tag}`, body: "x", visibleToEmployee: true } })).id,
    };
  };
  await foreign("B", cA, E.B, eBF, U.b);
  await foreign("D", cA, E.D, eDF, U.d);
  await foreign("O", cO, E.O, eOF, U.o);
  await foreign("X", cA, E.X, eXF, U.x);
  const snap = async () => canon({
    l: await P.hrLeave.findMany({ where: { id: { in: Object.values(FO).map((f) => f.leave) } }, select: { id: true, status: true } }),
    o: await P.hrOtRequest.findMany({ where: { id: { in: Object.values(FO).map((f) => f.ot) } }, select: { id: true, status: true } }),
    c: await P.hrTimeCorrection.findMany({ where: { id: { in: Object.values(FO).map((f) => f.corr) } }, select: { id: true, status: true } }),
    s: await P.hrShiftSwapRequest.findMany({ where: { id: { in: Object.values(FO).map((f) => f.swap) } }, select: { id: true, status: true } }),
    a: await P.hrPayAdjustment.findMany({ where: { id: { in: Object.values(FO).map((f) => f.adv) } }, select: { id: true, status: true } }),
    n: await P.hrReviewNote.findMany({ where: { id: { in: Object.values(FO).map((f) => f.note) } }, select: { id: true, acknowledgedAt: true } }),
  });
  const rowCount = async () => {
    const w = { tenantId: { in: [TT, T2] } };
    return [await P.hrLeave.count({ where: w }), await P.hrOtRequest.count({ where: w }), await P.hrTimeCorrection.count({ where: w }), await P.hrShiftSwapRequest.count({ where: w }), await P.hrPayAdjustment.count({ where: w }), await P.hrAttendance.count({ where: w })].join(":");
  };
  const aA = ACT(U.a);

  // ── S2 readers ──
  {
    const r = await call("mySelf", aA);
    ck("S2.1", { ok: r.ok, keys: keysOf(r.value) === K.self, name: r.value?.name === nm("A"), pos: r.value?.position === "ตำแหน่ง A", unit: r.value?.unitName === `สาขาเหนือ ${tag}`, active: r.value?.active === true }, K.self, `${shown(r)} ${keysOf(r.value)}`);
  }
  const today = await call("myToday", aA, O1);
  {
    const sh = today.value?.shift;
    const direct = await clk.myClockState({ tenantId: TT, userId: U.a.id }, O1).catch((e: unknown) => ({ err: errText(e) }));
    const r = { ok: today.ok, keys: keysOf(today.value) === K.today, day: today.value?.day === DAY, shift: keysOf(sh) === K.shift && sh?.startMin === 540 && sh?.endMin === 1020 && sh?.shiftName === `เช้า ${tag}`, clock: canon(today.value?.clock) === canon(direct) };
    ck("S2.2", r, "own shift · clock verbatim", `${shown(today)} ${keysOf(today.value)} ${keysOf(sh)}`);
  }
  {
    const w = await call("myWeek", aA, { week: "2031-06-12" }, O1);
    const days = arr(w.value?.days);
    const at = (d: string) => days.find((x) => x?.date === d);
    const r = {
      ok: w.ok, keys: keysOf(w.value) === K.week, start: w.value?.weekStart === "2031-06-09", seven: days.length === 7 && days.every((d) => keysOf(d) === K.day),
      pub: arr(at(DAY)?.entries).length === 1 && keysOf(at(DAY)?.entries?.[0]) === K.entry && arr(at("2031-06-11")?.entries).length === 0 && arr(at("2031-06-13")?.entries).length === 1,
      leave: !!at("2031-06-14")?.leave && !at(DAY)?.leave, holiday: at("2031-06-15")?.holiday === `QC210 วันหยุด ${tag}`,
    };
    ck("S2.3", r, "week", `${shown(w)} ${days.map((d) => `${String(d?.date).slice(8)}:${arr(d?.entries).length}`).join(",")}`);
  }
  {
    const b = await call("myBalances", aA, { year: 2031 });
    const d = await lv.myLeaveBalances(cA, vOf(U.a), { year: 2031 }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    ck("S2.5", { ok: b.ok && d?.ok, same: canon(arr(b.value?.items)) === canon(arr(d?.items)) && arr(d?.items).length > 0 }, "= myLeaveBalances", `${shown(b)} ${arr(b.value?.items).length}/${arr(d?.items).length}`);
  }
  {
    const r = await call("myDocuments", aA);
    const sl = arr(r.value?.payslips);
    const nts = arr(r.value?.notes);
    const x = {
      ok: r.ok, keys: keysOf(r.value) === K.docs, slips: sl.length === 1 && keysOf(sl[0]) === K.slip && sl[0]?.runId === rPaid && sl[0]?.netSatang === 1_712_345 && String(sl[0]?.href).includes(rPaid),
      notes: nts.length === 1 && nts[0]?.id === noteV && keysOf(nts[0]) === K.note, slots: r.value?.certificate === null && r.value?.myRequestsSlot === null,
    };
    ck("S2.6", x, "1 slip · 1 note · slots", `${shown(r)} slips=${sl.length} notes=${nts.length}`);
  }
  {
    const f = await call("myLeaveForm", aA, O1);
    const pv = await call("myLeavePreview", aA, { policyId: PL.pers, fromDate: "2031-06-12", toDate: "2031-06-13", employeeId: E.B }, O1);
    const sh = arr(pv.value?.shifts);
    const x = {
      form: f.ok && arr(f.value?.policies).some((p) => p?.id === PL.pers) && arr(f.value?.policies).every((p) => keysOf(p) === "allowHalfDay,allowHours,category,id,name"),
      prev: pv.ok && sh.length === 1 && sh[0]?.date === "2031-06-13" && keysOf(pv.value) === "availableAfter,days,ok,shifts",
    };
    ck("S2.7", x, "policies · own shifts", `${shown(f)} ${shown(pv)} ${sh.map((s) => s?.date).join(",")}`);
  }
  {
    const mates = arr(today.value?.colleagues);
    const r = { ok: today.ok, set: mates.length === 1 && mates[0]?.name === nm("B"), keys: mates.every((m) => keysOf(m) === K.mate) && mates.length > 0 };
    ck("S3.1", r, "[B]", mates.map((m) => short(m?.name, 20)).join(",") || shown(today));
  }

  // ── S5 rules through the facade (also creates A's own objects for S2.4) ──
  const c0 = await rowCount();
  {
    const big = { policyId: PL.pers, fromDate: "2031-07-07", toDate: "2031-07-18" };
    const f = await call("selfRequestLeave", aA, big);
    let direct = "";
    try {
      await hr.requestLeave(cA, { employeeId: E.A, actorUserId: U.a.id, type: "PERSONAL", ...big });
      direct = "ACCEPTED";
    } catch (e) {
      direct = lv.leaveRefusalText(e) ?? (e instanceof hr.HrLeaveRequestError ? (e as Error).message : `THROW ${errText(e)}`);
    }
    const n0 = await P.hrLeave.count({ where: { employeeId: E.A, fromDate: dbDate("2031-07-07") } });
    const ok1 = await call("selfRequestLeave", aA, { policyId: PL.pers, fromDate: "2031-07-21", toDate: "2031-07-21", reason: "ธุระ" });
    const row = await P.hrLeave.findFirst({ where: { employeeId: E.A, fromDate: dbDate("2031-07-21") } });
    ck("S5.1", { refused: !f.ok && f.text === direct && direct !== "ACCEPTED" && !direct.startsWith("THROW"), none: n0 === 0, ok: ok1.ok, row: row?.status === "PENDING" && row?.systemId === sA }, "balance text · PENDING", `${shown(f)} direct="${short(direct, 60)}" ${shown(ok1)} ${row?.status}`);
  }
  {
    const r = await call("selfRequestLeave", ACT(U.owner), { policyId: PL.pers, fromDate: "2031-07-22", toDate: "2031-07-22" });
    const row = await P.hrLeave.findFirst({ where: { employeeId: E.W, fromDate: dbDate("2031-07-22") } });
    chk("S5.2", r.ok && row?.status === "APPROVED", "APPROVED", `${shown(r)} ${row?.status}`);
  }
  let otId = "";
  {
    const far = { date: "2031-08-30", start: "18:00", end: "20:00" };
    const f = await call("selfRequestOt", aA, far, O1);
    const d = await ot.requestOt(cA, vOf(U.a), far, O1).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const g = await call("selfRequestOt", aA, { date: "2031-06-11", start: "18:00", end: "20:00", reason: "ปิดสต็อก" }, O1);
    const row = await P.hrOtRequest.findFirst({ where: { employeeId: E.A, date: dbDate("2031-06-11") } });
    otId = row?.id ?? "";
    ck("S5.3", { refused: !f.ok && !d?.ok && f.text === d?.reason, ok: g.ok, row: row?.status === "PENDING" && row?.requestedByUserId === U.a.id }, "window text · PENDING", `${shown(f)} direct="${short(d?.reason, 50)}" ${shown(g)} ${row?.status}`);
  }
  let corrId = "";
  {
    const fut = { action: "ADD", kind: "IN", at: bkk(DAY, "12:00"), reason: "ลืมกดเข้างาน" };
    const old = { action: "ADD", kind: "IN", at: bkk("2031-04-01", "09:00"), reason: "ลืมกดเข้างาน" };
    const nor = { action: "CHANGE", attendanceId: attA, at: bkk("2031-06-09", "09:00"), reason: "" };
    const texts: string[] = [];
    let same = true;
    for (const i of [fut, old, nor]) {
      const f = await call("selfRequestCorrection", aA, i, O1);
      const d = await corr.requestCorrection(cA, vOf(U.a), i, O1).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
      texts.push(`${shown(f)}/d="${short(d?.reason, 40)}"`);
      same &&= !f.ok && !d?.ok && f.text === d?.reason;
    }
    const g = await call("selfRequestCorrection", aA, { action: "CHANGE", attendanceId: attA, at: bkk("2031-06-09", "09:00"), reason: "กดช้าไป 2 นาที" }, O1);
    const row = await P.hrTimeCorrection.findFirst({ where: { employeeId: E.A, attendanceId: attA } });
    corrId = row?.id ?? "";
    ck("S5.4", { same, ok: g.ok, row: row?.status === "PENDING" }, "3 texts · PENDING", `${texts.join(" ")} ${shown(g)}`);
  }
  let swapId = "";
  {
    const t = await call("mySwapTargets", aA, { fromEntryId: eAF }, O1);
    const items = arr(t.value?.items);
    const bad = await call("mySwapTargets", aA, { fromEntryId: eBF }, O1);
    ck("S3.3", { ok: t.ok, set: items.some((i) => i?.employeeId === E.B && i?.entryId === null), noD: !items.some((i) => [E.D, E.X, E.O].includes(i?.employeeId)), keys: items.length > 0 && items.every((i) => keysOf(i) === K.target), foreign: !bad.ok && bad.text === T.notFound }, "u1 peers · notFound", `${shown(t)} n=${items.length} ${shown(bad)}`);
    const r = await call("selfRequestSwap", aA, { fromEntryId: eAF, targetEmployeeId: E.B, reason: "ไปงานบวช" });
    const row = await P.hrShiftSwapRequest.findFirst({ where: { fromEntryId: eAF } });
    swapId = row?.id ?? "";
    const acc = await call("selfRespondSwap", ACT(U.b), swapId, true);
    const mid = await P.hrShiftSwapRequest.findFirst({ where: { id: swapId || "∅" } });
    const cancel = await call("selfCancelSwap", aA, swapId);
    const end = await P.hrShiftSwapRequest.findFirst({ where: { id: swapId || "∅" } });
    ck("S5.5", { req: r.ok && row?.status === "AWAITING_PEER" && row?.requesterEmployeeId === E.A, acc: acc.ok && mid?.status === "PENDING", cancel: cancel.ok && end?.status === "CANCELLED" }, "AWAITING_PEER → PENDING → CANCELLED", `${shown(r)} ${shown(acc)} ${mid?.status} ${shown(cancel)} ${end?.status}`);
  }
  {
    const f = await call("selfClock", aA, { kind: "NEXT" }, O1);
    const d = await clk.mobileClock({ tenantId: TT, userId: U.a.id }, { kind: "NEXT" }, O1).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const g = await call("selfClock", aA, { kind: "NEXT", latitude: CEN.lat + 0.0002, longitude: CEN.lng, accuracy: 20, deviceId: "qc-dev", employeeId: E.B }, O1);
    const row = await P.hrAttendance.findFirst({ where: { employeeId: E.A, source: "MOBILE" }, orderBy: { at: "desc" } });
    const rowB = await P.hrAttendance.count({ where: { employeeId: E.B, source: "MOBILE" } });
    const ks = [...keysDeep(g.value)];
    ck("S5.6", { refused: !f.ok && !d?.ok && f.text === d?.reason, ok: g.ok, row: row?.kind === "IN", noB: rowB === 0, noCoords: !ks.some((k) => /^(lat|latitude|lng|longitude|accuracyM?)$/.test(k)) }, "no-GPS text · MOBILE IN", `${shown(f)} direct="${short(d?.reason, 40)}" ${shown(g)} ${row?.kind} ${ks.join(",")}`);
  }
  {
    const a1 = await call("selfAcknowledgeNote", aA, noteV, O1);
    const t1 = (await P.hrReviewNote.findUnique({ where: { id: noteV } }))?.acknowledgedAt?.getTime();
    const a2 = await call("selfAcknowledgeNote", aA, noteV, { now: bkk("2031-06-11") });
    const t2 = (await P.hrReviewNote.findUnique({ where: { id: noteV } }))?.acknowledgedAt?.getTime();
    const h = await call("selfAcknowledgeNote", aA, noteH, O1);
    const th = (await P.hrReviewNote.findUnique({ where: { id: noteH } }))?.acknowledgedAt;
    ck("S5.7", { first: a1.ok && !!t1, kept: t2 === t1, hidden: !h.ok && h.text === T.notFound && !th }, "first wins · hidden notFound", `${shown(a1)} ${shown(a2)} ${shown(h)}`);
  }

  // ── S6 advance ──
  {
    const r = [await call("selfRequestAdvance", aA, { amountBaht: 0 }, O1), await call("selfRequestAdvance", aA, { amountBaht: 1.5 }, O1), await call("selfRequestAdvance", aA, { amountBaht: 50_001 }, O1), await call("selfRequestAdvance", aA, { amountBaht: 500, note: "ก".repeat(201) }, O1)];
    const want = [T.advAmount, T.advAmount, T.advAmount, T.advNote];
    const n = await P.hrPayAdjustment.count({ where: { employeeId: E.A } });
    ck("S6.1", { texts: r.every((x, i) => !x.ok && x.text === want[i]), none: n === 0 }, "texts", r.map(shown).join(" "));
  }
  let advId = "";
  {
    const a0 = await P.auditLog.count({ where: { tenantId: TT, action: "hr.payadjust.request" } });
    const r = await call("selfRequestAdvance", aA, { amountBaht: 2500, note: "ค่าเทอมลูก", employeeId: E.B }, O1);
    const row = await P.hrPayAdjustment.findFirst({ where: { employeeId: E.A, kind: "ADVANCE" } });
    advId = row?.id ?? "";
    const au = await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.payadjust.request" } });
    const s = JSON.stringify(au.map((x: Any) => x.after ?? {}));
    const x = {
      ok: r.ok, row: row?.status === "PENDING" && row?.amountSatang === 250_000 && row?.periodKey === "2031-07" && row?.requestedById === U.a.id && row?.systemId === sA && row?.runId === null,
      audit: au.length === a0 + 1 && !/amount|"note"|ค่าเทอม/i.test(s) && s.includes(advId || "∅"), noB: (await P.hrPayAdjustment.count({ where: { employeeId: E.B, kind: "ADVANCE" } })) === 1,
    };
    ck("S6.2", x, "PENDING · 2031-07 · clean audit", `${shown(r)} ${row?.periodKey}/${row?.amountSatang} au=${au.length - a0}`);
  }
  {
    const again = await call("selfRequestAdvance", aA, { amountBaht: 100 }, O1);
    const d0 = await P.auditLog.count({ where: { tenantId: TT, action: "hr.payadjust.delete" } });
    const c = await call("selfCancelAdvance", aA, advId);
    const gone = !(await P.hrPayAdjustment.findUnique({ where: { id: advId || "∅" } }));
    const d1 = await P.auditLog.count({ where: { tenantId: TT, action: "hr.payadjust.delete" } });
    const c2 = await call("selfCancelAdvance", aA, advId);
    ck("S6.3", { open: !again.ok && again.text === T.advOpen, cancel: c.ok && gone && d1 === d0 + 1, twice: !c2.ok && c2.text === T.notFound }, "advOpen · deleted · notFound", `${shown(again)} ${shown(c)} ${shown(c2)}`);
  }
  {
    const r = await call("selfRequestAdvance", ACT(U.s), { amountBaht: 300 }, O1);
    const n = await P.hrPayAdjustment.count({ where: { employeeId: E.Sx } });
    chk("S6.4", !r.ok && r.text === T.advClosed && n === 0, "advClosed", `${shown(r)} n=${n}`);
  }
  {
    const aC = ACT(U.c);
    const rs = await Promise.all([call("selfRequestAdvance", aC, { amountBaht: 700 }, O1), call("selfRequestAdvance", aC, { amountBaht: 700 }, O1)]);
    const n = await P.hrPayAdjustment.count({ where: { employeeId: E.C, kind: "ADVANCE" } });
    chk("S6.5", n === 1 && rs.filter((x) => x.ok).length === 1 && rs.some((x) => x.text === T.advOpen), "1 row · 1 advOpen", `${rs.map(shown).join(" ")} n=${n}`);
  }

  // ── S2.4 + S3.2 (after A's own objects exist) ──
  {
    const r = await call("myRequests", { ...aA, employeeId: E.B }, O1);
    const v = r.value ?? {};
    const ids = (k: string) => arr(v[k]).map((x) => x?.id);
    const foreignIds = Object.values(FO).flatMap((f) => Object.values(f));
    const x = {
      ok: r.ok, keys: keysOf(v) === K.reqs,
      lk: arr(v.leaves).length >= 2 && arr(v.leaves).every((i) => keysOf(i) === K.leave), ok2: arr(v.ot).some((i) => i?.id === otId) && arr(v.ot).every((i) => keysOf(i) === K.ot),
      sw: arr(v.swaps).some((i) => i?.id === swapId) && arr(v.swaps).every((i) => keysOf(i) === K.swap), co: arr(v.corrections).some((i) => i?.id === corrId) && arr(v.corrections).every((i) => keysOf(i) === K.corr),
      adv: arr(v.advances).every((i) => keysOf(i) === K.adv),
      // the peer's swap row targeting A (FO.B.swap) is A's own business (A = target) — allowed in swaps; every other foreign id is not
      noForeign: ![...ids("leaves"), ...ids("ot"), ...ids("corrections"), ...ids("advances")].some((i) => foreignIds.includes(i)) && !ids("swaps").some((i) => [FO.D.swap, FO.O.swap, FO.X.swap].includes(i)),
    };
    ck("S2.4", x, "own only · keys", `${shown(r)} ${["leaves", "ot", "swaps", "corrections", "advances"].map((k) => `${k}=${arr(v[k]).length}`).join(" ")}`);
    const outs = [
      (await call("mySelf", aA)).value, today.value, (await call("myWeek", aA, { week: DAY }, O1)).value, v, (await call("myBalances", aA, { year: 2031 })).value,
      (await call("myDocuments", aA)).value, (await call("myLeaveForm", aA, O1)).value,
    ];
    const keys = new Set<string>();
    for (const o of outs) keysDeep(o, keys);
    const forb = [...HR_FORBIDDEN_DTO_KEYS, "employeeId", "userId", "requestedByUserId", "filedById", "systemId", "tenantId", "unitId", "latitude", "longitude"].filter((k) => keys.has(k));
    const json = JSON.stringify(outs);
    const leak = ["C", "D", "X", "L", "Up", "O"].filter((k) => json.includes(nm(k)));
    ck("S3.2", { some: outs.every((o) => o && typeof o === "object" && o.ok !== false), keys: !forb.length, names: !leak.length }, "clean", `forbidden=${forb.join(",")} leak=${leak.join(",")}`);
  }

  // ── S4 IDOR ──
  {
    const inj = { employeeId: E.B, userId: U.b.id, systemId: sO, tenantId: T2, linkedUserId: U.b.id };
    const aJ = ACT(U.a, TT, { employeeId: E.B, systemId: sO });
    const l = await call("selfRequestLeave", aJ, { policyId: PL.pers, fromDate: "2031-07-23", toDate: "2031-07-23", ...inj });
    const o = await call("selfRequestOt", aJ, { date: "2031-06-12", start: "18:00", end: "19:00", ...inj }, O1);
    const c = await call("selfRequestCorrection", aJ, { action: "ADD", kind: "IN", at: bkk("2031-06-08", "09:00"), reason: "ลืมกดเข้างาน", ...inj }, O1);
    await P.hrPayAdjustment.deleteMany({ where: { employeeId: E.A, kind: "ADVANCE" } });
    const a = await call("selfRequestAdvance", aJ, { amountBaht: 400, ...inj }, O1);
    const rows = {
      l: await P.hrLeave.findFirst({ where: { fromDate: dbDate("2031-07-23"), tenantId: { in: [TT, T2] } } }), o: await P.hrOtRequest.findFirst({ where: { date: dbDate("2031-06-12"), employeeId: { not: E.B }, tenantId: TT, status: "PENDING", requestedByUserId: U.a.id } }),
      c: await P.hrTimeCorrection.findFirst({ where: { proposedAt: bkk("2031-06-08", "09:00") } }), a: await P.hrPayAdjustment.findFirst({ where: { amountSatang: 40_000, kind: "ADVANCE" } }),
    };
    const own = (r: Any) => r?.employeeId === E.A && r?.systemId === sA && r?.tenantId === TT;
    ck("S4.1", { calls: l.ok && o.ok && c.ok && a.ok, rows: own(rows.l) && own(rows.o) && own(rows.c) && own(rows.a) }, "4 rows · all A/sA", `${[l, o, c, a].map(shown).join(" ")}`);
    await P.hrPayAdjustment.deleteMany({ where: { employeeId: E.A, kind: "ADVANCE" } });
  }
  const ops: [string, (id: string) => Promise<RO>][] = [
    ["leave", (id) => call("selfCancelLeave", aA, id)], ["ot", (id) => call("selfCancelOt", aA, id)], ["corr", (id) => call("selfCancelCorrection", aA, id)],
    ["swapC", (id) => call("selfCancelSwap", aA, id)], ["swapR", (id) => call("selfRespondSwap", aA, id, false)], ["adv", (id) => call("selfCancelAdvance", aA, id)], ["note", (id) => call("selfAcknowledgeNote", aA, id, O1)],
  ];
  const keyOf = (k: string) => (k.startsWith("swap") ? "swap" : k);
  const matrix = async (id: string, owner: string, extraIds: string[] = []) => {
    const before = await snap();
    const bad: string[] = [];
    for (const [k, fn] of ops) {
      // B's swap targets A ⇒ A may respond to it (the peer path) — its row is the one same-branch object A legitimately reaches
      if (owner === "B" && k === "swapR") continue;
      for (const oid of [FO[owner]?.[keyOf(k)] ?? "∅", ...extraIds]) {
        const r = await fn(oid);
        if (r.ok || r.text !== T.notFound) bad.push(`${k}:${shown(r)}`);
      }
    }
    const after = await snap();
    ck(id, { refused: !bad.length, unchanged: before === after }, "notFound × all · unchanged", bad.slice(0, 3).join(" ") || "ok");
  };
  await matrix("S4.2", "B");
  await matrix("S4.3", "D");
  await matrix("S4.4", "O");
  await matrix("S4.5", "X", ["cl0000000000000000000000x"]);
  {
    const aX = ACT(U.x);
    const c0x = await rowCount();
    const ws = [
      await call("selfClock", aX, { kind: "NEXT", latitude: CEN.lat, longitude: CEN.lng, accuracy: 10 }, O1), await call("selfRequestLeave", aX, { policyId: PL.pers, fromDate: "2031-07-24", toDate: "2031-07-24" }),
      await call("selfRequestOt", aX, { date: "2031-06-12", start: "18:00", end: "19:00" }, O1), await call("selfRequestCorrection", aX, { action: "ADD", kind: "IN", at: bkk("2031-05-20", "09:00"), reason: "ลืมกดเข้างาน" }, O1),
      await call("selfRequestAdvance", aX, { amountBaht: 100 }, O1), await call("selfRequestSwap", aX, { fromEntryId: eXF, targetEmployeeId: E.B }),
    ];
    const me = await call("mySelf", aX);
    ck("S4.6", { inactive: ws.every((r) => !r.ok && r.text === T.inactive), none: (await rowCount()) === c0x, self: me.ok && me.value?.active === false }, "inactive × 6 · mySelf inactive", ws.map(shown).join(" "));
  }
  const allExports = (a: Any): Promise<RO>[] => [
    call("mySelf", a), call("myToday", a, O1), call("myWeek", a, {}, O1), call("myRequests", a, O1), call("myBalances", a, {}), call("myLeaveForm", a, O1), call("myLeavePreview", a, { policyId: PL.pers, fromDate: DAY, toDate: DAY }, O1),
    call("mySwapTargets", a, { fromEntryId: eAF }, O1), call("myCorrectablePunches", a, { from: "2031-06-01", to: DAY }, O1), call("myDocuments", a),
    call("selfClock", a, { kind: "NEXT", latitude: CEN.lat, longitude: CEN.lng, accuracy: 10 }, O1), call("selfRequestLeave", a, { policyId: PL.pers, fromDate: "2031-07-25", toDate: "2031-07-25" }), call("selfCancelLeave", a, FO.B.leave),
    call("selfRequestOt", a, { date: "2031-06-12", start: "18:00", end: "19:00" }, O1), call("selfCancelOt", a, FO.B.ot), call("selfRequestSwap", a, { fromEntryId: eAF, targetEmployeeId: E.B }),
    call("selfRespondSwap", a, FO.B.swap, true), call("selfCancelSwap", a, FO.B.swap), call("selfRequestCorrection", a, { action: "CHANGE", attendanceId: attA, at: bkk("2031-06-09", "08:58"), reason: "ลืมกดเข้างาน" }, O1),
    call("selfCancelCorrection", a, FO.B.corr), call("selfRequestAdvance", a, { amountBaht: 100 }, O1), call("selfCancelAdvance", a, FO.B.adv), call("selfAcknowledgeNote", a, FO.B.note, O1),
  ];
  for (const [id, a] of [["S4.7", ACT(U.n)], ["S4.8", ACT(U.a, T2)]] as const) {
    const before = `${await rowCount()}|${await snap()}`;
    const rs = await Promise.all(allExports(a));
    const bad = rs.map((r, i) => [r, i] as const).filter(([r]) => r.ok || r.text !== T.noEmployee).map(([r, i]) => `${i}:${shown(r)}`);
    ck(id, { n: rs.length === 23, all: !bad.length, none: `${await rowCount()}|${await snap()}` === before }, "noEmployee × 23 · nothing written", bad.slice(0, 3).join(" ") || "ok");
  }
  {
    const before = await rowCount();
    const c = await call("selfRequestCorrection", aA, { action: "CHANGE", attendanceId: attB, at: bkk("2031-06-09", "09:00"), reason: "แก้ของเพื่อน" }, O1);
    const s1 = await call("selfRequestSwap", aA, { fromEntryId: eBF, targetEmployeeId: E.C });
    const s2 = await call("selfRequestSwap", aA, { fromEntryId: eAF, targetEmployeeId: E.D });
    const dTarget = await corr.requestCorrection(cA, vOf(U.a), { action: "CHANGE", attendanceId: attB, at: bkk("2031-06-09", "09:00"), reason: "แก้ของเพื่อน" }, O1).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    ck("S4.9", { corr: !c.ok && c.text === dTarget?.reason, swapFrom: !s1.ok && s1.text === T.notFound, swapTo: !s2.ok && s2.text === T.notFound, none: (await rowCount()) === before }, "refused · nothing", `${shown(c)} direct="${short(dTarget?.reason, 40)}" ${shown(s1)} ${shown(s2)}`);
  }
  void c0;

  // ── S7 nav ──
  {
    const s = "SYS";
    const items = ["", "/hr/attendance", "/hr/roster", "/hr/kiosk", "/hr/leave", "/hr/employees", "/hr/payroll", "/hr/settings", "/hr/settings/law"].map((p, i) => ({ href: `/app/sys/${s}${p}`, label: `L${i}` }));
    const V = (role: Who["role"], ua: string[], p: Record<string, boolean>) => ({ role, unitAccess: ua, permissions: p, userId: "u" });
    const viewers: [string, Any][] = [
      ["owner", V("OWNER", [], {})], ["mgr", V("MANAGER", ["*"], {})], ["key", V("STAFF", [], { "hr.employee.create": true })], ["kiosk", V("STAFF", [], { "hr.attendance.clock": true })],
      ["pay", V("STAFF", ["*"], { "hr.payroll.read": true })], ["staff", V("STAFF", [], {})],
    ];
    const bad: string[] = [];
    for (const [n, v] of viewers)
      for (const linked of [true, false]) {
        const want = items.filter((it) => {
          const p = it.href.slice(`/app/sys/${s}`.length);
          if (p === "/hr/roster") return rb.canReadRoster(v);
          if (p === "/hr/kiosk") return cset.canRunKiosk(v);
          if (p === "/hr/settings" || p === "/hr/settings/law") return settings.canManageHrSettings(v);
          if (p === "/hr/attendance") return rb.canReadRoster(v) || linked;
          return true;
        }).map((x) => x.href);
        if (linked) want.push("/app/me/hr");
        const r = await callMod(NAV, F.nav, "hrNavFilter", [items, v, { linked }]);
        const got = arr(r.value).map((x) => x?.href);
        if (canon(got) !== canon(want)) bad.push(`${n}/${linked ? "L" : "-"}:${r.ok ? got.length : short(r.text, 30)}`);
      }
    chk("S7.1", !bad.length, "12 viewer×link combos = page gates", bad.slice(0, 4).join(" ") || "ok");
  }

  // ── r2 fix round ──
  const pay = (await import("@/lib/modules/hr/payroll")) as Any;
  const own = { userId: U.owner.id, isOwner: true };
  const advOf = (e: string) => P.hrPayAdjustment.findMany({ where: { employeeId: e, kind: "ADVANCE" }, select: { id: true, status: true, runId: true } }) as Promise<Any[]>;
  {
    const aL = ACT(U.l);
    const worst: number[] = [];
    for (let round = 0; round < 6; round++) {
      let stop = false;
      const approver = (async () => {
        for (let i = 0; i < 40 && !stop; i++) {
          for (const r of (await advOf(E.L)).filter((x) => x.status === "PENDING")) await pay.decideAdjustment(cA, r.id, "APPROVED", own).catch(() => null);
          await new Promise((res) => setTimeout(res, 5));
        }
      })();
      await Promise.all(Array.from({ length: 10 }, (_, i) => call("selfRequestAdvance", aL, { amountBaht: 300 + round * 10 + i }, O1)));
      stop = true;
      await approver;
      for (const r of (await advOf(E.L)).filter((x) => x.status === "PENDING")) await pay.decideAdjustment(cA, r.id, "APPROVED", own).catch(() => null);
      worst.push((await advOf(E.L)).filter((x) => x.status !== "REJECTED").length);
    }
    chk("S10.1", worst.every((n) => n <= 1) && worst[0] === 1, "≤ 1 non-rejected every round", worst.join(","));
  }
  {
    const aW = ACT(U.owner);
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => call("selfRequestAdvance", aW, { amountBaht: 200 + i }, O1)));
    const rows = await advOf(E.W);
    const one = rows.length === 1 && rs.filter((x) => x.ok).length === 1 && rs.filter((x) => x.text === T.advOpen).length === 9;
    const c1 = await call("selfCancelAdvance", aW, rows[0]?.id ?? "∅");
    const gone = (await advOf(E.W)).length === 0;
    const again = await call("selfRequestAdvance", aW, { amountBaht: 250 }, O1);
    const id2 = (again.value as Any)?.id ?? "∅";
    const ap = await pay.decideAdjustment(cA, id2, "APPROVED", { userId: U.c.id, isOwner: false }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const c2 = await call("selfCancelAdvance", aW, id2);
    const st = (await P.hrPayAdjustment.findUnique({ where: { id: id2 } }))?.status;
    ck("S10.2", { one, cancel: c1.ok && gone, approved: !!ap?.ok, refused: !c2.ok && c2.text === T.notFound && st === "APPROVED" }, "1 row · cancel · cancel-after-approve refused", `${rs.filter((x) => x.ok).length} ok · ${rows.length} rows · ${shown(c1)} · ${ap?.reason ?? "ok"} · ${shown(c2)} ${st}`);
  }
  {
    const mk = async (period: string) => (await pay.requestAdjustment(cA, { employeeId: E.D, periodKey: period, kind: "ADVANCE", amountSatang: 50_000, requestedById: U.owner.id }))?.id as string;
    const d2 = await mk("2031-08");
    const a1 = await pay.decideAdjustment(cA, FO.D.adv, "APPROVED", own);
    const a2 = await pay.decideAdjustment(cA, d2, "APPROVED", own);
    const both = (await advOf(E.D)).filter((x) => x.status === "APPROVED").length;
    await pay.decideAdjustment(cA, d2, "REJECTED", own);
    const a3 = await pay.decideAdjustment(cA, FO.D.adv, "APPROVED", own);
    const d3 = await mk("2031-09");
    const a4 = await pay.decideAdjustment(cA, d3, "APPROVED", own);
    const approved = (await advOf(E.D)).filter((x) => x.status === "APPROVED").length;
    ck("S10.3", { dupRefused: !a1?.ok && !a2?.ok && both === 0, single: !!a3?.ok, unsettled: !a4?.ok, one: approved === 1 }, "never two approved", `${a1?.ok}/${a2?.ok}/${a3?.ok}/${a4?.ok} approved=${approved}`);
  }
  {
    await P.hrLeave.create({ data: { tenantId: TT, systemId: sA, employeeId: E.C, type: "PERSONAL", fromDate: dbDate(FD), toDate: dbDate(FD), days: 1, status: "APPROVED" } });
    const t = await call("mySwapTargets", aA, { fromEntryId: eAF }, O1);
    const ids = arr(t.value?.items).map((i) => i?.employeeId);
    const x = await call("mySwapTargets", ACT(U.x), { fromEntryId: eXF }, O1);
    const sx = stripComments(rd(F.self));
    const r = {
      ok: t.ok && ids.includes(E.B), noUnlinked: !ids.includes(E.Up), noLeave: !ids.includes(E.C), noEnded: !ids.includes(E.X) && !ids.includes(E.D),
      ended: !x.ok && x.text === T.inactive, neutral: /leavePeer/.test(sx), noCap: !/take:\s*500\b/.test(sx),
    };
    ck("S10.6", r, "service-eligible only", `${ids.length} ${shown(x)}`);
  }
}

// ═════════════════════════ run ═════════════════════════
let crashed = "";
try {
  await runStatic();
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  const MINE = ["HrReviewNote", "HrOnboardingTask", "HrClockSite", "HrAttendanceDay", "HrHoliday"];
  for (const tid of fx.tenants) for (const t of MINE) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => null);
  await cleanupFx(P, fx, SLUG);
  const left = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  for (const tid of fx.tenants)
    for (const t of MINE) {
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      if (r && Number(r[0]?.n) !== 0) left.push(`${t}=${r[0]?.n}`);
    }
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
