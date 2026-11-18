// PRIV-3 hunt — probe B: every exported server action of the HR module (+ platform hr-line) called directly as K/N/S/... with REAL vs UNKNOWN ids;
//   outcome bytes compared, every tenant table digested before/after (writes), AI hr_* tools for the same viewers.
// Run: (cwd lane 5) bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx /tmp/hr-ctl/priv3-hunt/pB-actions.mts
import { writeFileSync } from "node:fs";
import { qc4Env, cleanupFx, residueOf, errText, canon, addDay, srcFiles, rd } from "/root/projects/shark-hr-l5/scripts/qc-hr-lib.mjs";
import { installNetGuard, NET, sweepTenants, sweepResidue, tenantTables } from "/root/projects/shark-hr-l5/scripts/qc-hr-h4.3-lib.mjs";
import { inScope, fd as mkFd } from "/root/projects/shark-hr-l5/scripts/qc-hr-priv-3-lib.mjs";
import { buildFx, tag, unk, PFX, SLUG, D0, MONTH, type Any } from "./fx.mts";

const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
installNetGuard();
process.on("unhandledRejection", () => undefined);
const { P, coreHash } = await qc4Env("h52p-priv3-C");
const imp = async (s: string) => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const M: Record<string, Any> = { sys: await imp("@/lib/modules/system/service"), svc: await imp("@/lib/modules/hr/service"), tools: await imp("@/lib/ai/tools"), actor: await imp("@/lib/ai/actor") };
const FILES = [...srcFiles("src/lib/modules/hr"), "src/lib/platform/hr-line-actions.ts"].filter((f) => f.endsWith(".ts") && /^\s*["']use server["']/.test(rd(f)));
const ACT: { file: string; name: string; fn: Any }[] = [];
for (const f of FILES) {
  const m = await imp(`@/${f.slice(4).replace(/\.ts$/, "")}`);
  if (m?.__err) { console.log(`import ${f}: ${m.__err}`); continue; }
  for (const [n, v] of Object.entries(m)) if (typeof v === "function" && /Action$/.test(n)) ACT.push({ file: f.split("/").slice(-2).join("/"), name: n, fn: v });
}
console.log(`actions: ${ACT.length} from ${FILES.length} files`);
const REAL = { ...console };
const mute = () => Object.assign(console, { log: () => {}, info: () => {}, warn: () => {}, error: () => {} });
const unmute = () => Object.assign(console, REAL);
const OUT: Record<string, Any> = {};
let X: Any = null;
try {
  X = await buildFx(P, coreHash, M);
  const { W, E, HRS, U1, pol, sh } = X;
  const tables = (await tenantTables(P)).filter((t) => !/^(Session|RateLimit)/.test(t));
  const digestSql = tables.map((t) => `SELECT '${t}' AS t, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM "${t}" x WHERE x."tenantId" = $1`).join(" UNION ALL ");
  const digest = async (): Promise<Record<string, string>> => ({ ...Object.fromEntries(((await P.$queryRawUnsafe(digestSql, X.T)) as Any[]).map((r) => [r.t, r.h])), ...Object.fromEntries(((await P.$queryRawUnsafe(digestSql, X.T2)) as Any[]).map((r) => [`T2:${r.t}`, r.h])) });
  const UNK = unk();
  const real = { emp: E.e2.id, leave: X.leave, ot: X.ot, corr: X.corr, adj: X.adj, swap: X.swap, doc: X.doc, note: X.note, run: X.runId, entry: X.RE.e2, att: X.att };
  const fake = Object.fromEntries(Object.keys(real).map((k) => [k, UNK])) as typeof real;
  const idFor = (name: string, t: typeof real) => (/Leave|Attach/.test(name) ? t.leave : /Ot/.test(name) ? t.ot : /Correction|Corr/.test(name) ? t.corr : /Adjust|Consent|Stranded|GiveBack/.test(name) ? t.adj : /Swap/.test(name) ? t.swap : /Doc/.test(name) ? t.doc : /Note/.test(name) ? t.note : /Run|Paid|Pay[A-Z]/.test(name) ? t.run : /Roster|Entry/.test(name) ? t.entry : t.emp);
  const form = (name: string, t: typeof real) => mkFd({
    systemId: HRS, employeeId: t.emp, id: idFor(name, t), leaveId: t.leave, otId: t.ot, requestId: t.ot, correctionId: t.corr, adjustmentId: t.adj, swapId: t.swap, docId: t.doc, noteId: t.note, runId: t.run, entryId: t.entry, attendanceId: t.att, dayId: UNK,
    taskId: UNK, certId: UNK, fileId: UNK, chargeId: UNK, claimId: UNK, keyId: UNK, unitId: U1, name: `QCX ${tag}`, fromDate: addDay(D0, 40), toDate: addDay(D0, 40), date: addDay(D0, 5), day: addDay(D0, -1),
    type: "PERSONAL", policyId: pol, decision: "APPROVED", status: "APPROVED", accept: "true", kind: "BONUS", amountBaht: "100", amount: "100", hours: "1", pin: "1234", reason: "qcx", note: "qcx", periodKey: MONTH, period: MONTH,
    start: "18:00", end: "19:00", shiftId: sh, from: addDay(D0, 7), to: addDay(D0, 8), at: `${addDay(D0, -1)}T09:00`, baseSalaryBaht: "99999", phone: "0800000000", position: "qcx", purpose: "qcx", taxYear: String(D0.slice(0, 4)), report: "time", format: "CSV",
  });
  const argsOf = (a: { name: string; fn: Any }, t: typeof real): unknown[] => {
    const n = a.name;
    if (/^(generateRoster|copyRosterWeek|addRosterEntry|moveRosterEntry|removeRosterEntry|publishRoster)Action$/.test(n)) return [{ systemId: HRS, employeeId: t.emp, entryId: t.entry, date: addDay(D0, 6), shiftId: sh, from: addDay(D0, 7), to: addDay(D0, 8), fromWeek: addDay(D0, -7), toWeek: addDay(D0, 7), unitId: U1 }];
    if (/^(listHrApiKeys|issueHrApiKey|revokeHrApiKey)Action$/.test(n)) return [{ systemId: HRS, name: "qcx", bundle: "hr-read", ttlDays: 30, keyId: UNK }];
    if (n === "decideInboxAction") return [HRS, { type: "LEAVE", id: t.leave, decision: "APPROVED", items: [{ type: "LEAVE", id: t.leave }] }];
    if (n === "setPinAction") return [HRS, t.emp, null, mkFd({ pin: "1234" })];
    if (n === "kioskClockAction") return [HRS, null, mkFd({ employeeId: t.emp, pin: "1234" })];
    if (/^(createPayrollRunAction|requestOtAction|decideOtAction|revokeOtAction|cancelOtAction)$/.test(n)) return [null, form(n, t)];
    if (n === "bulkDecideLeaveAction") return [mkFd({ systemId: HRS, ids: [t.leave], leaveIds: [t.leave], decision: "APPROVED" })];
    if (n === "mySwapTargetsAction") return [t.entry];
    if (/^self(Cancel|Acknowledge)\w*Action$/.test(n)) return [idFor(n, t)];
    if (n === "selfRespondSwapAction") return [t.swap, true];
    if (n === "selfRequestSwapAction") return [{ fromEntryId: X.RE.e1, targetEmployeeId: t.emp, toEntryId: t.entry, reason: "x" }];
    if (n === "selfRequestCorrectionAction") return [{ action: "VOID", attendanceId: t.att, kind: "IN", at: `${addDay(D0, -1)}T09:00`, reason: "x" }];
    if (/^(myLeavePreview|selfClock|selfRequestLeave|selfRequestOt|selfRequestAdvance)Action$/.test(n)) return [{ policyId: pol, fromDate: addDay(D0, 41), toDate: addDay(D0, 41), date: addDay(D0, 5), start: "18:00", end: "19:00", reason: "x", amountBaht: 100, kind: "IN" }];
    if (a.fn.length === 0) return [];
    return [form(n, t)];
  };
  const callAs = async (vk: string, a: Any, t: typeof real) => {
    mute();
    const n0 = NET.attempts.length;
    try {
      const r = await inScope(`${W[vk].cookie}; LOCALE=th`, `/app/sys/${HRS}/hr`, async () => a.fn(...argsOf(a, t)));
      return { ok: true, v: r };
    } catch (e) {
      const d = String((e as Any)?.digest ?? "");
      return { ok: false, v: d ? (d.startsWith("NEXT_REDIRECT") ? `redirect:${d.split(";")[2]}` : d.split(";").slice(0, 2).join(";")) : `throw:${errText(e).slice(0, 140)}` };
    } finally { unmute(); if (NET.attempts.length > n0) OUT.net = [...(OUT.net ?? []), a.name]; }
  };
  const normOut = (x: Any) => { let s = canon(x?.v ?? null); for (const v of [...Object.values(real), UNK, ...Object.values(E as Record<string, Any>).map((e) => e.id)]) if (v) s = s.split(String(v)).join("<ID>"); return s.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<T>").replace(/c[a-z0-9]{24}/g, "<cuid>"); };
  const names = Object.entries(E as Record<string, Any>);
  const VIEW = ["XO"];
  const OWN: Record<string, string[]> = { S: ["e1"], S0: ["e7"], K: ["eK"], X2: ["x2e"] };
  OUT.rows = [];
  // positive control: owner createEmployeeAction writes
  {
    const before = await digest();
    const a = ACT.find((x) => x.name === "createEmployeeAction");
    const r = a ? await callAs("O", a, real) : null;
    const after = await digest();
    OUT.control = { r: normOut(r).slice(0, 120), changed: Object.keys(after).filter((k) => after[k] !== before[k]) };
  }
  let d0 = await digest();
  for (const vk of VIEW) for (const a of ACT) {
    const rr = await callAs(vk, a, real);
    const d1 = await digest();
    const wReal = Object.keys(d1).filter((k) => d1[k] !== d0[k]);
    const ru = await callAs(vk, a, fake);
    const d2 = await digest();
    const wUnk = Object.keys(d2).filter((k) => d2[k] !== d1[k]);
    d0 = d2;
    const sReal = normOut(rr), sUnk = normOut(ru);
    const rawReal = canon(rr?.v ?? null);
    const seen = names.filter(([k, e]) => !(OWN[vk] ?? []).includes(k) && rawReal.includes(e.name)).map(([k]) => k);
    OUT.rows.push({ v: vk, a: `${a.file}:${a.name}`, same: sReal === sUnk, real: sReal.slice(0, 220), unknown: sUnk === sReal ? "=" : sUnk.slice(0, 220), wReal, wUnk, seen });
  }
  OUT.t2rows = await P.hrSalaryProfile.findMany({ where: { tenantId: X.T2 }, select: { systemId: true, employeeId: true } }).catch(() => []);
  // AI tools for the same viewers
  OUT.ai = {};
  for (const vk of VIEW) {
    const w = W[vk];
    const mem = await P.membership.findFirst({ where: { tenantId: w.tenantId, userId: w.id }, select: { role: true, unitAccess: true, permissions: true } });
    const actor = M.actor.aiMemberActor(w.tenantId, w.id, mem);
    for (const [tn, args] of [["hr_who_is_on_today", { day: D0 }], ["hr_late_report", { period: MONTH }], ["hr_leave_balance", { year: Number(D0.slice(0, 4)) }], ["hr_leave_balance", { year: Number(D0.slice(0, 4)), employeeId: E.e2.id }], ["hr_labor_percent", { day: D0 }]] as [string, Any][]) {
      mute();
      let s = "";
      try { s = String(await M.tools.runTool({ tenantId: X.T, actor }, tn, args)); } catch (e) { s = `throw ${errText(e)}`; } finally { unmute(); }
      OUT.ai[`${vk}|${tn}${args.employeeId ? "(e2)" : ""}`] = { seen: names.filter(([k, e]) => !(OWN[vk] ?? []).includes(k) && s.includes(e.name)).map(([k]) => k), s: s.slice(0, 160) };
    }
  }
} catch (e) {
  unmute();
  console.log(`🔴 ${errText(e)} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
  unmute();
  writeFileSync("/tmp/hr-ctl/priv3-hunt/out-C.json", JSON.stringify(OUT, null, 1));
  if (X?.fx) {
    await sweepTenants(P, X.fx.tenants).catch(() => undefined);
    await cleanupFx(P, X.fx, SLUG);
    await P.apiKey?.deleteMany?.({ where: { tenantId: { in: X.fx.tenants } } }).catch(() => undefined);
    const r1 = await sweepResidue(P, X.fx.tenants);
    await residueOf(P, X.fx, SLUG, PFX);
    console.log(`RESIDUE sweep=${r1.join(",") || "none"} tenants(${PFX}*)=${await P.tenant.count({ where: { slug: { startsWith: PFX } } })} OUTBOUND=${NET.attempts.length} ${NET.attempts.join(",")}`);
  }
  process.exit(0);
}
