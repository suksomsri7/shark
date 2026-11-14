// QC — HR V2 · HR-LEAVE-3 part b (CONTROLLER RULINGS r3: W1–W7) · brief ledger/hr-briefs/hr-brief-LEAVE-3.md · notes ledger/wo-notes/hr-LEAVE-3-oracle.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit. Shares scripts/qc-hr-leave-3-lib.mts · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-leave-3b.mts
// Registry re-based to 979674412 (RED: W3.1 W4.2 · was 7 RED on ed06b0514)
import { type Any, type Base, errText, canon, makeRegistry, failedKeys, textOf } from "./qc-hr-lib.mjs";
import { setupLeave3, underLock, callAct, shiftOf, entryOf, bk, dist } from "./qc-hr-leave-3-lib.mjs";

const SUITE = "qc-hr-leave-3b";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SEV: Record<string, "CRITICAL" | "MAJOR" | "MINOR"> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
W1|R3|C|G|edit [M,O]→[M] ∥ decide(expectedStep 1) under held request row, both orders ⇒ never at a missing step · edit ok ⇒ APPROVED + effect once · edit refused ⇒ PENDING@2 steps [1,2]
W2|R2|C|G|AI approval_decide by requestSummary: proposal stores requestId + expectedStep · confirm after another manager advanced ⇒ nothing decided, refused
W3.1|R1|M|R|OT on an approved AM+PM pair day ⇒ requestOt refused with the full-day text · OT filed before the 2nd half, approved after ⇒ decideOtRequest refused · PENDING
W3.2|R1|m|G|control: full-day leave refuses OT (text) · single AM half allows OT
W4.1|R1|M|G|pair day stored HrAttendanceDay.leaveHalf null (LEAVE, fraction 1.0)
W4.2|R1|M|R|myWeek shows the pair day as full-day leave (half null)
W4.3|R1|m|G|control: single AM half ⇒ stored leaveHalf AM · myWeek half AM
W5|R4|M|G|cancelMyRequestAction returns the HR result: not-mine / decided / no-system ⇒ {ok:false, Thai reason} · own pending ⇒ {ok:true}
W6|R2|M|G|listPending hides a step-2 request from the MANAGER who decided step 1 · other MANAGER sees it · OWNER who decided step 1 still sees it
W7|R1|M|G|late second half (approved after the day was judged) is picked up like a late single leave: STALE in the build · recompute ⇒ LEAVE (neither is auto-recomputed)
Z1|house|C|G|no residue · own law rows
`.trim().split("\n").map((l) => {
 const [id, g, sv, b, t] = l.split("|");
 return [`LEAVE-3b-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, finish } = makeRegistry(SUITE, "LEAVE-3b-", CHECKS);
if (ARGV.includes("--list")) { printList(); process.exit(0); }
const ck = (id: string, r: Record<string, unknown>, extra = "") => chk(id, Object.values(r).every(Boolean), "title", `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);

const S = await setupLeave3(SUITE);
const { P, tag, TT, U, V, c, rows, safe, sys, fx } = S;
const ctxA = { tenantId: TT };
const own = V.owner;
let crashed = "";
const AP_ = (await import("@/lib/modules/approval/service")) as Any;
const ACT = (await import("@/lib/modules/approval/actions").catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const EFF = (await import("@/lib/approval-effects")) as Any;
const SV = (await import("@/lib/modules/hr/service")) as Any;
const JG = (await import("@/lib/modules/hr/judge")) as Any;
const WE = (await import("@/lib/modules/hr/work-entries")) as Any;
const OT = (await import("@/lib/modules/hr/ot")) as Any;
const SELF = (await import("@/lib/modules/hr/self")) as Any;
const TOOLS = (await import("@/lib/ai/tools").catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const PROP = (await import("@/lib/ai/proposals").catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const missing = Object.entries({ ACT, TOOLS, PROP }).filter(([, m]) => m.__err).map(([k, m]) => `${k}: ${m.__err}`);

let dayN = 0;
const nextDay = () => new Date(Date.UTC(2031, 0, 6) + dayN++ * 86_400_000).toISOString().slice(0, 10);
type W = { s: string; pol: string; e: string; apId: string };
type F = { leaveId: string; reqId: string };
const MO = [{ order: 1, approverRole: "MANAGER" }, { order: 2, approverRole: "OWNER" }];
const MM = [{ order: 1, approverRole: "MANAGER" }, { order: 2, approverRole: "MANAGER" }];
const world = async (name: string, steps: Any[]): Promise<W> => {
 const s = await sys(name);
 const pol = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category: "VACATION", name: `พักร้อน ${tag}`, quotaDays: 300, paid: true } })).id as string;
 const e = await fx.mkEmp(TT, s, `พนง ${name} ${tag}`, { startDate: "2030-01-01", unitId: S.u1 });
 return { s, pol, e, apId: (await AP_.createPolicy(ctxA, { name: `สาย ${name}`, entityType: "HrLeave", systemId: s, steps })).id as string };
};
const file = async (w: W): Promise<F> => {
 const d = nextDay();
 const r = await SV.requestLeave(c(w.s), { employeeId: w.e, type: "VACATION", policyId: w.pol, fromDate: d, toDate: d, actorUserId: U.staff.id });
 return { leaveId: r.id as string, reqId: (await rows(`SELECT id FROM "ApprovalRequest" WHERE "entityId" = $1`, r.id))[0]?.id as string };
};
const reqRow = async (id: string) => (await rows(`SELECT status::text AS s, "currentStepOrder" AS o FROM "ApprovalRequest" WHERE id = $1`, id))[0] ?? {};
const decN = async (id: string) => (await rows(`SELECT id FROM "ApprovalDecision" WHERE "requestId" = $1`, id)).length;
const useN = async (id: string) => (await rows(`SELECT id FROM "HrLeaveBalanceTxn" WHERE "leaveId" = $1 AND kind::text = 'USE'`, id)).length;
const stepsOf = async (apId: string) => (await rows(`SELECT "order" AS o FROM "ApprovalStep" WHERE "policyId" = $1 ORDER BY "order"`, apId)).map((x: Any) => x.o).join(",");
const decide = (who: keyof typeof V, reqId: string, expectedStep?: number) => safe(() => AP_.decide(V[who], ctxA, reqId, { decision: "APPROVED", ...(expectedStep === undefined ? {} : { expectedStep }) }));
const deliver = async (f: F) => {
 const r = await reqRow(f.reqId);
 if (r.s === "APPROVED" || r.s === "REJECTED") await EFF.applyApprovalEffect({ tenantId: TT, type: `approval.request.${r.s === "APPROVED" ? "approved" : "rejected"}`, payload: { requestId: f.reqId, entityType: "HrLeave", entityId: f.leaveId } });
};
const lockReq = (id: string) => ({ rowSql: `SELECT id FROM "ApprovalRequest" WHERE id = $1 FOR UPDATE`, args: [id] });

try {
 { // W1 — R3 race: step edit vs a decision that read the old steps
  const w = await world("W1", MO);
  const o: string[] = [];
  for (let i = 0; i < 6; i++) {
   await AP_.updatePolicy(ctxA, w.apId, { name: "สาย W1", systemId: w.s, steps: MO }).catch(() => null);
   const f = await file(w);
   let edit = "∅";
   const dec = () => decide("mgr", f.reqId, 1);
   const ed = async () => { edit = await AP_.updatePolicy(ctxA, w.apId, { name: "สาย W1 ขั้นเดียว", systemId: w.s, steps: [{ order: 1, approverRole: "MANAGER" }] }).then(() => "ok", () => "refused"); return null; };
   const order = i % 2 ? "editFirst" : "decideFirst";
   await underLock(P, lockReq(f.reqId), i % 2 ? [ed, dec] : [dec, ed]);
   await deliver(f); await deliver(f);
   const r = await reqRow(f.reqId), st = await stepsOf(w.apId), u = await useN(f.leaveId);
   const good = r.s === "PENDING" ? st.split(",").includes(String(r.o)) && edit === "refused" && r.o === 2 && st === "1,2" : r.s === "APPROVED" && edit === "ok" && u === 1;
   o.push(`${order}·edit=${edit}·${r.s}@${r.o}·steps=[${st}]·use${u}·${good ? "OK" : "BAD"}`);
   if (r.s === "PENDING") await P.approvalRequest.updateMany({ where: { id: f.reqId, status: "PENDING" }, data: { status: "CANCELLED" } }); // reset (next edit back to [M,O])
  }
  ck("W1", { all: o.every((x) => x.endsWith("OK")) }, dist(o));
 }
 { // W2 — AI by summary: proposal-time capture
  const w = await world("W2", MM);
  const f = await file(w);
  const actor = { kind: "member" as const, tenantId: TT, userId: U.mgr2.id, membership: { role: "MANAGER" as const, unitAccess: V.mgr2.unitAccess, permissions: V.mgr2.permissions } };
  const CO = (await import("@/lib/ai/conversation-owner")) as Any;
  const conv = await P.aiConversation.create({ data: { id: CO.newConversationId({ tenantId: TT, actor }), tenantId: TT, title: `qc l3b ${tag}` } });
  const t = TOOLS.runTool ? await TOOLS.runTool({ tenantId: TT, conversationId: conv.id, actor }, "approval_decide", { requestSummary: f.leaveId, decision: "APPROVED" }) : "{}";
  const pid = (() => { try { return JSON.parse(t).proposalId as string; } catch { return ""; } })();
  const pay = pid ? ((await P.aiProposal.findUnique({ where: { id: pid } }))?.payload ?? {}) as Any : {};
  const a = await decide("mgr", f.reqId); // someone else advances to step 2
  const x = pid ? await PROP.executeProposal(V.mgr2, ctxA, pid, { userId: U.mgr2.id }).catch((e: unknown) => ({ ok: false, note: errText(e) })) : { ok: false, note: "∅proposal" };
  const r = await reqRow(f.reqId);
  ck("W2", { proposed: !!pid, captured: pay.requestId === f.reqId && pay.expectedStep === 1, advanced: a.ok === true, refused: x?.ok !== true, nothing: r.s === "PENDING" && r.o === 2 && (await decN(f.reqId)) === 1 }, `tool=${t.slice(0, 60)} payload=${canon(pay).slice(0, 90)} exec=${canon(x).slice(0, 90)} req=${r.s}@${r.o}`);
 }
 // ── R1 world (W3 · W4 · W7) ──
 const s = await sys("W3-W7 คู่ครึ่งวัน", true);
 const sh = await shiftOf(P, TT, s, "เช้า", 540, 1020);
 const polP = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category: "SICK", name: `ป่วย ${tag}`, paid: true, quotaDays: 30, allowHalfDay: true } })).id as string;
 const polU = (await P.hrLeavePolicy.create({ data: { tenantId: TT, systemId: s, category: "PERSONAL", name: `กิจ ${tag}`, paid: false, quotaDays: 30, allowHalfDay: true } })).id as string;
 const emp = async (code: string, linkedUserId?: string) => {
  const e = await fx.mkEmp(TT, s, `พนง ${code} ${tag}`, { startDate: "2030-01-01", unitId: S.u1, code, ...(linkedUserId ? { linkedUserId } : {}) });
  await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: e, baseSalarySatang: 3_000_000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
  return e;
 };
 const leave = async (e: string, day: string, extra: Any = {}, approve = true, paid = true) => {
  const r = await SV.requestLeave(c(s), { employeeId: e, type: paid ? "SICK" : "PERSONAL", policyId: paid ? polP : polU, fromDate: day, toDate: day, actorUserId: U.staff.id, ...extra });
  if (approve) await SV.decideLeave(c(s), r.id, "APPROVED", U.owner.id, { from: "PENDING" });
  return r.id as string;
 };
 const approveL = (id: string) => safe(() => SV.decideLeave(c(s), id, "APPROVED", U.owner.id, { from: "PENDING" }).then(() => ({ ok: true })));
 const att = (e: string, day: string) => rows(`SELECT id, status::text AS st, "leaveHalf"::text AS h, "leaveFraction"::text AS fr FROM "HrAttendanceDay" WHERE "employeeId" = $1 AND date = $2::date`, e, day);
 const selfU = await fx.mkUser(TT, "s1", `QL3 s1 ${tag}`, "STAFF" as Any, [S.u1], {});
 const eP = await emp("P", selfU.id), eS = await emp("S"), eQ = await emp("Q"), eO = await emp("O");
 for (const [e, d] of [[eP, "2031-08-05"], [eP, "2031-08-06"], [eS, "2031-08-07"], [eQ, "2031-08-07"]] as const) await entryOf(P, TT, s, e, d, sh, S.u1, [540, 1020]);
 await leave(eP, "2031-08-05", { halfDay: "AM" }); await leave(eP, "2031-08-05", { halfDay: "PM" }, true, false);
 await leave(eP, "2031-08-06", { halfDay: "AM" });
 await leave(eQ, "2031-08-07", { halfDay: "AM" });
 const qPm = await leave(eQ, "2031-08-07", { halfDay: "PM" }, false);
 for (const d of ["2031-08-09", "2031-08-16"]) await safe(() => JG.runAttendanceJobs({ now: bk(d), tenantId: TT }));
 { // W4
  const a5 = await att(eP, "2031-08-05"), a6 = await att(eP, "2031-08-06");
  const wk = await safe(() => SELF.myWeek({ tenantId: TT, userId: selfU.id, role: "STAFF", unitAccess: [S.u1], permissions: {} }, { week: "2031-08-04" }, { now: bk("2031-08-04", "08:00") }));
  const day = (d: string) => ((wk?.days ?? []) as Any[]).find((x) => x.date === d)?.leave;
  ck("W4.1", { one: a5.length === 1, leave: a5[0]?.st === "LEAVE" && a5[0]?.fr === "1.0", half: a5[0]?.h === null }, canon(a5.map(({ id: _i, ...x }) => x)));
  ck("W4.2", { week: wk?.ok === true, full: !!day("2031-08-05") && day("2031-08-05").half === null }, canon(day("2031-08-05") ?? wk?.reason ?? null));
  ck("W4.3", { stored: a6.length === 1 && a6[0]?.h === "AM", week: day("2031-08-06")?.half === "AM" }, `${canon(a6.map(({ id: _i, ...x }) => x))} ${canon(day("2031-08-06") ?? null)}`);
 }
 { // W7 — late second half vs late single leave (both after the day was judged)
  const NOW = bk("2031-08-16");
  const before = { s: canon((await att(eS, "2031-08-07")).map((x) => x.st)), q: canon((await att(eQ, "2031-08-07")).map((x) => `${x.st}:${x.fr}`)) };
  const sL = await leave(eS, "2031-08-07", {}, false);
  const ap = [await approveL(sL), await approveL(qPm)];
  await safe(() => JG.runAttendanceJobs({ now: bk("2031-08-17"), tenantId: TT }));
  const auto = { s: canon((await att(eS, "2031-08-07")).map((x) => x.st)), q: canon((await att(eQ, "2031-08-07")).map((x) => `${x.st}:${x.fr}`)) };
  const needs = await safe(() => JG.attendanceNeedsRecompute(c(s), own, { now: NOW }));
  const nd = (e: string) => ((needs?.days ?? []) as Any[]).some((x) => x.employeeId === e);
  await safe(() => WE.buildWorkEntrySnapshot(c(s), own, { periodKey: "2031-08" }, { now: NOW }));
  const rv = async (e: string) => ((await rows(`SELECT review FROM "HrWorkDay" WHERE "employeeId" = $1 AND date = '2031-08-07'::date`, e))[0]?.review ?? []) as string[];
  const stale = { s: (await rv(eS)).includes("STALE"), q: (await rv(eQ)).includes("STALE") };
  for (const e of [eS, eQ]) for (const r of await att(e, "2031-08-07")) await safe(() => JG.recomputeAttendanceDay(c(s), own, { dayId: r.id, reason: "qc leave-3b ใบลาอนุมัติหลังปิดวัน" }, { now: NOW }));
  const after = { s: (await att(eS, "2031-08-07")).map((x) => x.st), q: (await att(eQ, "2031-08-07")).map((x) => x.st) };
  const sig = (k: "s" | "q", e: string) => `auto=${auto[k] !== before[k]}·needs=${nd(e)}·stale=${stale[k]}`;
  console.log(`  W7 signals single ${sig("s", eS)} · pair ${sig("q", eQ)} · before ${before.s} ${before.q} · after ${canon(after)}`);
  ck("W7", { approved: ap.every((x) => x?.ok === true), same: sig("s", eS) === sig("q", eQ), staleBoth: stale.s && stale.q, recomputed: after.s.every((x) => x === "LEAVE") && after.q.length === 1 && after.q[0] === "LEAVE" }, `single ${sig("s", eS)} pair ${sig("q", eQ)} after=${canon(after)}`);
 }
 { // W3 — OT on a pair day (now = the day, 08:00 · OT 18:00–20:00)
  const ot = (d: string) => safe(() => OT.requestOt(c(s), { role: "OWNER", unitAccess: [], permissions: {}, userId: U.owner.id }, { employeeId: eO, date: d, start: "18:00", end: "20:00", reason: "qc" }, { now: bk(d, "08:00") }));
  await leave(eO, "2031-09-02", { halfDay: "AM" }); await leave(eO, "2031-09-02", { halfDay: "PM" });
  await leave(eO, "2031-09-03");
  await leave(eO, "2031-09-04", { halfDay: "AM" });
  await leave(eO, "2031-09-05", { halfDay: "AM" }); const pm5 = await leave(eO, "2031-09-05", { halfDay: "PM" }, false);
  const [pair, full, half, pre] = [await ot("2031-09-02"), await ot("2031-09-03"), await ot("2031-09-04"), await ot("2031-09-05")];
  const pm = await approveL(pm5);
  const dOt = pre?.id ? await safe(() => OT.decideOtRequest(c(s), own, pre.id, "APPROVED", { now: bk("2031-09-05", "09:00") })) : null;
  const preSt = pre?.id ? (await rows(`SELECT status::text AS s FROM "HrOtRequest" WHERE id = $1`, pre.id))[0]?.s : "∅";
  ck("W3.1", { request: pair?.ok === false && !!full?.reason && pair.reason === full.reason, approval: pm?.ok === true && dOt?.ok === false && dOt.reason === full?.reason && preSt === "PENDING" }, `pair=${textOf(pair) || pair?.ok} decide=${textOf(dOt) || dOt?.ok} st=${preSt}`);
  ck("W3.2", { full: full?.ok === false && /[฀-๿]/.test(full?.reason ?? ""), half: half?.ok === true, preFiled: pre?.ok === true }, `full=${textOf(full)} half=${textOf(half) || half?.ok} pre=${textOf(pre) || pre?.ok}`);
 }
 { // W5 — action returns the HR result
  const w = await world("W5", MO);
  const cx = ACT.cancelMyRequestAction;
  const f1 = await file(w), f2 = await file(w), f3 = await file(w);
  await decide("mgr", f2.reqId); await decide("owner", f2.reqId); await deliver(f2);
  const ns = { requestId: (await P.approvalRequest.create({ data: { tenantId: TT, policyId: w.apId, entityType: "HrLeave", entityId: `lv-${tag}-nosys`, systemId: null, requestedById: U.staff.id, currentStepOrder: 1, idempotencyKey: `qc-l3b-${tag}-nosys` } })).id as string }; // legacy row without system
  const v = { notMine: await callAct(U.staff2, cx, { requestId: f1.reqId }), decided: await callAct(U.staff, cx, { requestId: f2.reqId }), noSystem: await callAct(U.staff, cx, { requestId: ns.requestId }), mine: await callAct(U.staff, cx, { requestId: f3.reqId }) };
  const refused = (x: Any) => !x.threw && x.value?.ok === false && /[฀-๿]/.test(String(x.value?.reason ?? ""));
  ck("W5", { notMine: refused(v.notMine) && (await reqRow(f1.reqId)).s === "PENDING", decided: refused(v.decided) && (await reqRow(f2.reqId)).s === "APPROVED", noSystem: refused(v.noSystem) && (await reqRow(ns.requestId)).s === "PENDING", mine: v.mine.value?.ok === true && (await reqRow(f3.reqId)).s === "CANCELLED" },
   Object.entries(v).map(([k, x]) => `${k}=${x.threw ? `throw ${x.text.slice(0, 40)}` : canon(x.value ?? null).slice(0, 60)}`).join(" "));
 }
 { // W6 — listPending after an earlier step
  const w = await world("W6a", MM), x = await world("W6b", MO);
  const f = await file(w), g = await file(x);
  await decide("mgr", f.reqId); await decide("owner", g.reqId);
  const has = async (who: keyof typeof V, id: string) => ((await AP_.listPending(ctxA, V[who])) as Any[]).some((r) => r.id === id);
  const r = { mgrHidden: !(await has("mgr", f.reqId)), mgr2Sees: await has("mgr2", f.reqId), ownerSees: await has("owner", g.reqId), at2: (await reqRow(f.reqId)).o === 2 && (await reqRow(g.reqId)).o === 2 };
  ck("W6", r);
 }
} catch (x) {
 crashed = errText(x);
 console.log(`CRASH ${crashed} ${(x as Error)?.stack?.split("\n").slice(1, 5).join(" | ")}`);
}
const left = await S.cleanup().catch((e: unknown) => [`cleanup ${errText(e)}`]);
chk("Z1", left.length === 0 && S.lawOk, "residue none · law 3", `${left.join(",") || "none"} law=${S.lawOk}`);
process.exit(finish({ forced: FORCE, crashed, missing }));
