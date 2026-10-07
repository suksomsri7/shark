// QC — HR V2 · H0.1 — DRAFT payroll run lifecycle: delete · recompute · approve only the numbers you saw (D2a)
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// requires: nothing seeded — own throwaway tenants `qc-hr-h0.1-<rand>` (+ `-b`), swept in `finally` (every table with tenantId, 4 passes)
//
// Contract (ledger/hr-briefs/hr-brief-H0.1.md §2 on wip/pos-hrv2-plan · base f85f5455 ⊇ hotfix/hr-privacy afcb9bc3):
//   src/lib/modules/hr/payroll.ts
//     deleteDraftRun(ctx, runId, actor)    → { ok, reason? } — same advisory lock as create · FOR UPDATE · only DRAFT with journalEntryId NULL ·
//                                            unbind adjustments (status untouched) · delete run (items cascade) · audit `hr.payroll.delete_draft`
//                                            before {periodKey, totals, itemCount, adjustmentIds} · refusals Thai + returned (not thrown)
//     recomputeDraftRun(ctx, runId, actor) → { ok, reason? } — same lock + DRAFT guard · unbind · delete items · buildRunRows again ·
//                                            same run id + payDate · note "คำนวณใหม่ …" · rebind with count check · audit `hr.payroll.recompute`
//     approveRun(ctx, runId, expect?)      — expect {totalNetSatang, itemCount}: refuse (no status change, no JV) unless the run still has them
//                                            ("ตัวเลขของรอบนี้เปลี่ยนไปแล้ว (มีการคำนวณใหม่) — กรุณาเปิดดูและอนุมัติอีกครั้ง") · no expect = legacy
//   src/lib/modules/hr/payroll-actions.ts  deleteDraftRunAction / recomputeDraftRunAction (hr.payroll.create + canViewPayroll) → { ok, reason }
//   src/lib/modules/hr/payroll-ui.tsx      DRAFT rows: "คำนวณใหม่" + "ลบร่าง" · the approve form posts expect
//   oracle round 3 (CR16–CR19, hunter findings): expect gains itemsDigest = payrollItemsDigest(items) (hidden `expectDigest`) · a DRAFT with a
//                                            journalEntryId is refused DRAFT_HAS_JV · the action refuses a POST without expectNet/expectItems ·
//                                            refused approve/delete/recompute write `*.refused` audit rows {code, seen, actual}
//   FREEZE: payroll-rules.ts · computeItem · the CRM C3.3 blocks of payroll.ts · prisma/schema/payroll.prisma (no schema in this WO)
//
// Groups: S1 delete · X2 cross-scope · S2 recompute · S3 approve guard · S4 static · S5 CRM C3.3 regression · S6 viewer matrix (actions)
//         · X6 races in 2 worker PROCESSES (own pool each) — 5 scenarios × 3 rounds × 10 lanes · Z1 residue.
//
// SKIP convention (same as scripts/qc-hf-o23.mts on this base): while deleteDraftRun/recomputeDraftRun are absent from payroll.ts the suite
//   prints SKIPPED + JSON_SUMMARY {skipped:true} and exits 0 · `QC_FORCE=1` (or `--force-run`) runs everything anyway — on the base every
//   check that needs the new code is RED for the right reason ("MISSING" / approve ignores expect), controls are green, no crash, no residue.
// --list = print every id without touching the DB.
//
// Run (QC4 only): bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.1.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const SUITE = "qc-hr-h0.1";
const THIS_FILE = "scripts/qc-hr-h0.1.mts";
const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const LIST = ARGV.includes("--list");
const WORKER_AT = ARGV.indexOf("--h01-worker");
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const QC4_HOST_MARK = "ep-frosty-lab";

const PAY_FILE = "src/lib/modules/hr/payroll.ts";
const ACT_FILE = "src/lib/modules/hr/payroll-actions.ts";
const UI_FILE = "src/lib/modules/hr/payroll-ui.tsx";
const RULES_FILE = "src/lib/modules/hr/payroll-rules.ts";
const SCHEMA_FILE = "prisma/schema/payroll.prisma";
// hashes taken on the base (f85f5455) — FREEZE (hr-brief-COMMON §C.4/C.5 · H0.1 §4)
const RULES_SHA = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7";
const SCHEMA_SHA = "7f9ab537951e8b58ad127ad9fed3014ae0ea013ee2cea35bc226533295f5f8a7";
const COMPUTE_ITEM_SHA = "b151a83c16eb96cb9adca8d5ed8b622612ebc50c39ad729f6f7966c43a47cd13";
const CRM_BLOCK_SHA = "fcc215391da90dccc285f4f8fdcca41568a1a722c1273a353136d7af5be774b4";
const MARKPAID_BLOCK_SHA = "893a9e4e25add025394a2484feaf3b2aaeb2807c168ff20f9f29a90c4bc853c3";

// ═════════════════════════ registry (id · X-group · title) ═════════════════════════
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`H0.1-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  D("S1.1", "-", "deleteDraftRun(DRAFT) → {ok:true} · run row gone · its items gone (cascade)"),
  D("S1.2", "-", "after delete its adjustments have runId = null with status/kind/amount/period unchanged (APPROVED stays APPROVED)"),
  D("S1.3", "-", "the same period can be created again and the new run picks up those adjustments (bound to the new run · add/deduct/net totals equal the deleted run)"),
  D("S1.4", "-", "APPROVED run → delete refused (returned, Thai \"ลบได้เฉพาะรอบที่ยังเป็นร่าง\") · run/items/JV/adjustments unchanged"),
  D("S1.5", "-", "PAID run → delete refused (returned, Thai) · nothing changed"),
  D("S1.6", "-", "REVERSED run → delete refused (returned, Thai) · nothing changed"),
  D("S1.7", "-", "DRAFT run that already has a journalEntryId (orphan JV, D11) → delete refused · nothing changed"),
  D("S1.8", "-", "unknown runId → {ok:false} with a Thai reason (no throw)"),
  D("S1.9", "-", "audit row hr.payroll.delete_draft (targetId = run) with before {periodKey, totals (net), itemCount, adjustmentIds}"),
  D("X2.1", "X2", "other tenant's ctx (its own HR system) → delete + recompute of our runId refused (returned) · run untouched"),
  D("X2.2", "X2", "same tenant, other HR system → delete + recompute refused (returned) · run untouched"),
  D("X2.3", "X2", "mismatched ctx {other tenant, our systemId} → delete + recompute refused (returned) · approve(expect) not ok · run untouched (DRAFT, no JV)"),
  D("S2.1", "-", "recomputeDraftRun(DRAFT) → {ok:true} · same run id · same payDate + periodKey · still DRAFT · note starts \"คำนวณใหม่\""),
  D("S2.2", "-", "recomputed items = a fresh createPayrollRun on a clone fixture with the final data (field by field incl. snapshot keys, except computedAt)"),
  D("S2.3", "-", "an APPROVED unbound adjustment of the period inserted after the first build is included (bound to the run · in the item add + snapshot)"),
  D("S2.4", "-", "employee whose salary profile was removed disappears from the run · his adjustment returns to unbound APPROVED"),
  D("S2.5", "-", "the changed salary profile (base + deductions) is what the recomputed item uses"),
  D("S2.6", "X4", "after recompute run totals = Σ items for all 7 totals · item count = employees with a profile"),
  D("S2.7", "-", "a second recompute with no data change gives identical items and totals (idempotent, except computedAt)"),
  D("S2.8", "-", "recompute of an APPROVED run refused (returned, Thai) · items/totals/JV unchanged"),
  D("S2.9", "-", "audit row hr.payroll.recompute (targetId = run) with before/after totals (net) and item counts (3 → 2)"),
  D("S3.1", "-", "approveRun with a stale expect.totalNetSatang → refused with \"ตัวเลขของรอบนี้เปลี่ยนไปแล้ว\" · still DRAFT · no JV written"),
  D("S3.2", "-", "approveRun with a stale expect.itemCount → refused · still DRAFT · no JV written"),
  D("S3.3", "-", "approveRun with the right expect → APPROVED + journalEntryId + JV Dr = Cr > 0 (ACCOUNT present)"),
  D("S3.4", "-", "approveRun without expect → legacy behaviour (APPROVED + JV) [control on the base]"),
  D("S3.5", "-", "expect captured before a recompute → approve refused, still DRAFT · fresh expect after recompute → APPROVED with the recomputed numbers"),
  D("S3.6", "X8", "tenant without ACCOUNT: approve with the right expect → APPROVED · no journalEntryId · note says not posted"),
  D("S4.1", "-", "createPayrollRun export signature unchanged · duplicate-period message stays inside createPayrollRun only (once in payroll.ts)"),
  D("S4.2", "-", "FREEZE: payroll-rules.ts sha256 · computeItem body sha256 · prisma/schema/payroll.prisma sha256 (no schema in H0.1)"),
  D("S4.3", "-", "CRM C3.3 blocks of payroll.ts byte-identical (commission entry block + markPaid block, sha256)"),
  D("S4.4", "-", "UI: \"คำนวณใหม่\" + \"ลบร่าง\" wired to recomputeDraftRunAction / deleteDraftRunAction and only reachable for DRAFT rows"),
  D("S4.5", "-", "UI approve form posts expect (net + item count of the rendered row) · approvePayrollRunAction passes a 3rd argument to approveRun"),
  D("S4.6", "-", "deleteDraftRunAction + recomputeDraftRunAction exported · assertHrCan(auth, \"hr.payroll.create\") · return {ok, reason} · actor from session · no e.message"),
  D("S4.7", "-", "reverseRun on a DRAFT names the real button (\"ลบร่าง\" as a button label) instead of \"ลบร่างได้เลย\""),
  D("S5.1", "-", "CRM commission adjustment bound to a DRAFT → deleteDraftRun → adjustmentOfCommission shows runId null, status APPROVED"),
  D("S5.2", "-", "after that delete onPayrollPaid(deleted run) pays 0 · CrmCommission stays APPROVED · no hr.payroll.paid event for that run"),
  D("S5.3", "-", "[control] the same path on a run that is approved + markPaid → onPayrollPaid makes the commission PAID"),
  D("S6.0", "-", "[control] request-scope harness works: OWNER cancelAdjustmentAction in a real session → {ok:true}, row gone"),
  D("S6.1", "-", "deleteDraftRunAction: OWNER and payroll viewer (hr.payroll.read + hr.payroll.create) → {ok:true}, run gone"),
  D("S6.2", "X2", "deleteDraftRunAction refused (Forbidden or {ok:false}) for payroll reader without create · MANAGER without payroll · STAFF with HR keys · plain member · the employee himself · other tenant's OWNER — run untouched"),
  D("S6.3", "-", "recomputeDraftRunAction: OWNER and payroll viewer → {ok:true}, run recomputed (new salary visible, totals = Σ items)"),
  D("S6.4", "X2", "recomputeDraftRunAction refused for the same 6 viewers — run untouched (would change if recomputed)"),
  D("X6.0", "X6", "[control] 2 worker PROCESSES returned every lane of every round (15 rounds × 10 lanes) and started each round together (skew ≤ 2 s)"),
  D("X6.1", "X6", "recompute ∥ approve(expect from before) ×3: one consistent outcome — approve wins ⇒ old numbers + no recompute succeeded; recompute wins ⇒ every approve refused, DRAFT, new numbers"),
  D("X6.2", "X6", "delete ∥ approve(right expect) ×3: exactly one success · deleted ⇒ adjustments unbound · approved ⇒ JV + adjustments bound, run kept"),
  D("X6.3", "X6", "recompute ∥ recompute ×3 (10 lanes): ≥1 ok, no error · final items = one more sequential recompute · every APPROVED adjustment bound to the run"),
  D("X6.4", "X6", "delete ∥ create same period ×3: delete ok once · ≤1 run at the end (= creates ok) · adjustments bound to the surviving run or all unbound"),
  D("X6.5", "X6", "recompute ∥ decideAdjustment(APPROVED) of 5 PENDING rows ×3: every row APPROVED and either in the run (item sums match) or unbound — never lost"),
  D("X6.6", "X6", "global: no adjustment of the tenant points at a missing run · every run's totals = Σ items · each item's add/deduct = Σ its bound adjustments · no bound row without an item"),
  // ── oracle round 2 (7 Oct 2026 · head 65a45626 · CR10–CR15) — additive; ids above unchanged ──
  D("S7.1", "-", "[source] RunRowActions: recompute trigger \"ดึงข้อมูลใหม่\" (CR10) and its dialog still says \"คำนวณใหม่\" · delete trigger \"ลบร่าง\" · op routing approve/delete/recompute → the three actions"),
  D("S7.2", "-", "approve expect with gross (CR11): service net+count+gross right → OK · gross off by 1 → STALE (DRAFT, no JV) · no gross → round-1 behaviour · form: expectGross missing/\"abc\"/\"12.5\" omitted (OK) · wrong gross → STALE · expectNet \"abc\" → refused (fail closed · CR18 text) · no net+items → refused (CR18, oracle round 3)"),
  D("S7.3", "-", "gross changed while net + count stay equal (base raise + compensating deduction, recompute) → stale approve with old net/count/gross refused (DRAFT, no JV) · fresh figures → APPROVED + JV"),
  D("S7.4", "-", "JV throws (ACCOUNT period CLOSED): approveRun → {ok:false, code POST_FAILED} · DRAFT · no journalEntryId · no JV · action reason = fixed Thai (no raw error) · then recompute + delete both {ok:true} with audit rows"),
  D("S7.5", "-", "(H0.2) APPROVED adjustment bound to a DRAFT: cancel with actor = delete + recompute · no-actor cancel refused · CRM withdraw/move refused · approved-bound cancel refused"),
  D("S7.6", "X2", "CR13: Forbidden is inline — 5 viewers without the right (reader-no-create · MANAGER no payroll · STAFF HR keys · plain member · employee self) × approve/recompute/delete actions → {ok:false, reason \"คุณไม่มีสิทธิ์ทำรายการนี้\"} (no throw) · run untouched · [source] try/catch instanceof ForbiddenError, no e.message"),
  D("S7.7", "-", "[source] approvePayrollRunAction returns Promise<{ ok: boolean; reason?: string }> · RunRowActions renders the reason in hr-payroll-run-${periodKey}-error · approve hidden fields expectNet/expectItems/expectGross from row props"),
  D("S7.8", "-", "[source+runtime] payroll.ts H0.1 block uses bkkParts for the recompute note, no hand-rolled +7 h offset · note stamp = Bangkok wall clock of the call (Intl Asia/Bangkok)"),
  D("X7.1", "X6", "recompute ∥ recompute on one run ×3 (in-process): no throw · ≥1 ok · refusals Thai · Σ items = totals · one run row · audit rows = ok count · approved adjustments bound"),
  D("X7.2", "X6", "delete ∥ approve(fresh expect) on one run ×3 (in-process): exactly one ok · loser {ok:false} (no throw) · final = run gone (rows unbound) or APPROVED with balanced JV (rows bound)"),
  // ── oracle round 3 (7 Oct 2026 · head 987d3abd · hunter findings · CR16–CR19) — additive; ids above unchanged (S7.2 sub-cases h/i follow CR18) ──
  D("S8.1", "-", "employee swap with equal pay (hunter P1): A's profile removed, C added at A's base, recompute → net/count/gross equal · approve with the OLD expect (incl. digest) STALE (DRAFT, 0 new JV) · fresh expect incl. new digest → APPROVED + exactly one balanced JV"),
  D("S8.2", "-", "shift between two people (hunter P1b): BONUS 5,000 for A + DEDUCTION 5,000 for B, recompute → old expect STALE (DRAFT, no JV) · fresh expect → APPROVED + one balanced JV"),
  D("S8.3", "-", "payrollItemsDigest (non-\"use server\" module): pure · sha256 hex · order-independent · changes with each of the 7 item numbers and employeeId · hidden field expectDigest rendered (computed server-side in payroll-ui.tsx) and parsed by the action · foreign digest → STALE"),
  D("S8.4", "-", "DRAFT that carries a journalEntryId (hunter Q1): approveRun(expect) and approveRun() → {ok:false, code DRAFT_HAS_JV} · action → fixed Thai text · status DRAFT · journalEntryId unchanged · 0 new JV"),
  D("S8.5", "-", "approvePayrollRunAction without expectNet/expectItems (none · only net · only items) → {ok:false} fixed Thai text (CR18) · run DRAFT · no JV"),
  D("S8.6", "-", "refusal audits (CR19): hr.payroll.approve.refused (STALE · DRAFT_HAS_JV · NOT_DRAFT) · hr.payroll.delete_draft.refused · hr.payroll.recompute.refused — one row each, actor = session user, seen = posted (null when none), actual net/items/gross/digest = DB"),
  D("X8.1", "X6", "approve(old expect) ∥ recompute (same-totals swap) ×3 (in-process): never two JVs · APPROVED only if the digest equals the committed items (recompute refused) · otherwise DRAFT with new items, approve STALE, no JV"),
  D("Z1", "-", "residue: throwaway tenants, every tenantId row, users/sessions are gone"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} checks (id · X · title)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  process.exit(0);
}

// ═════════════════════════ env (QC4 only) ═════════════════════════
process.env.QC_ENV_FILE ??= ".env.qc";
if (process.env.QC_ENV_FILE === ".env") {
  console.error(`🔴 ${SUITE}: QC_ENV_FILE=.env is production — refused`);
  process.exit(4);
}
const { loadLegacyQcEnv } = (await import("./qc-env-guard.mjs" as string)) as Any;
loadLegacyQcEnv(SUITE);
{
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u.includes(QC4_HOST_MARK));
  if (bad.length) {
    console.error(`🔴 ${SUITE}: writes only on QC4 (${QC4_HOST_MARK}) — ${bad.map(([n]) => n).join(", ")} is not (nothing written)`);
    process.exit(4);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const errText = (e: unknown) => `${(e as Any)?.name ?? "Error"}(${(e as Any)?.code ?? "-"}): ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`;

// ═════════════════════════ WORKER MODE (own process = own Prisma pool) ═════════════════════════
//   argv: --h01-worker <startAtMs> <base64url(JSON { tenantId, actor, rounds: { atMs, lanes: { fn, sys, a }[] }[] })>
//   each round: wait until startAt + atMs, run all lanes in parallel · prints `H01WORKER [{ at, res[] }]`
if (WORKER_AT >= 0) {
  const [wStart, wArg] = ARGV.slice(WORKER_AT + 1);
  const PW = ((await import("@/lib/core/db" as string)) as Any).prisma as Any;
  const PAYW = (await import("@/lib/modules/hr/payroll" as string)) as Any;
  const arg = JSON.parse(Buffer.from(String(wArg), "base64url").toString("utf8")) as { tenantId: string; actor: Any; rounds: { atMs: number; lanes: { fn: string; sys: string; a: Any }[] }[] };
  await PW.$queryRaw`SELECT 1`;
  const one = async (c: { fn: string; sys: string; a: Any }): Promise<string> => {
    const ctx = { tenantId: arg.tenantId, systemId: c.sys };
    try {
      if (c.fn === "recompute" || c.fn === "delete") {
        const f = c.fn === "recompute" ? PAYW.recomputeDraftRun : PAYW.deleteDraftRun;
        if (typeof f !== "function") return "MISSING";
        const r = await f(ctx, c.a.runId, arg.actor);
        return r?.ok === true ? "OK" : `NO:${String(r?.reason ?? r?.note ?? "").slice(0, 80)}`;
      }
      if (c.fn === "approve") {
        const r = await PAYW.approveRun(ctx, c.a.runId, c.a.expect);
        return r?.ok === true ? "OK" : `NO:${String(r?.note ?? r?.reason ?? "").slice(0, 80)}`;
      }
      if (c.fn === "create") {
        const r = await PAYW.createPayrollRun(ctx, { periodKey: c.a.periodKey, payDate: new Date(c.a.payDate) });
        return `OK:${r?.id}`;
      }
      if (c.fn === "decide") {
        const r = await PAYW.decideAdjustment(ctx, c.a.id, "APPROVED", { userId: arg.actor?.userId ?? null, isOwner: true });
        return r?.ok === true ? "OK" : `NO:${String(r?.reason ?? "").slice(0, 80)}`;
      }
      return "ERR:unknown-fn";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (c.fn === "create" && /มีรอบจ่ายงวด/.test(msg)) return "NO:dup";
      return `ERR:${errText(e)}`;
    }
  };
  const out: { at: number; res: string[] }[] = [];
  for (const round of arg.rounds) {
    const ms = Number(wStart) + round.atMs - Date.now();
    if (ms > 0) await sleep(ms);
    const at = Date.now();
    out.push({ at, res: await Promise.all(round.lanes.map(one)) });
  }
  console.log(`H01WORKER ${JSON.stringify(out)}`);
  await PW.$disconnect();
  process.exit(0);
}

// ═════════════════════════ SKIP guard ═════════════════════════
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const PAY_SRC = rd(PAY_FILE);
const skipReasons: string[] = [];
if (!/export async function deleteDraftRun\(/.test(PAY_SRC)) skipReasons.push(`${PAY_FILE}: deleteDraftRun absent`);
if (!/export async function recomputeDraftRun\(/.test(PAY_SRC)) skipReasons.push(`${PAY_FILE}: recomputeDraftRun absent`);
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: H0.1 not built yet`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although ${skipReasons.length} prerequisite(s) are missing (expected: RED for the right reason, no crash)`);

// ═════════════════════════ harness ═════════════════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; sev: Sev }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown, sev: Sev = "CRITICAL"): boolean {
  const full = `H0.1-${id}`;
  if (!TITLE.has(full)) throw new Error(`check id not registered: ${id}`);
  results.set(full, { ok: !!ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${ok ? "" : ` — expected ${String(expected)} | actual ${String(actual)}`}`);
  return !!ok;
}
const short = (v: unknown, n = 220) => {
  try {
    const s = typeof v === "string" ? v : (JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) ?? "undefined");
    return s.length > n ? `${s.slice(0, n)}…` : s;
  } catch {
    return String(v).slice(0, n);
  }
};
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => {
    if (typeof x === "bigint") return x.toString();
    if (x instanceof Date) return x.toISOString();
    if (x && typeof x === "object" && !Array.isArray(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Any)[k]]));
    return x;
  }) ?? "undefined";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const squash = (s: string) => s.replace(/\s+/g, " ");
const THAI = /[฀-๿]/;
const seg = (src: string, a: string, b: string, inc: boolean) => {
  const i = src.indexOf(a);
  if (i < 0) return "";
  const j = src.indexOf(b, i + a.length);
  return j < 0 ? "" : src.slice(i, j + (inc ? b.length : 0));
};
/** body of `export async function name(` up to the next top-level `\nexport ` */
function fnBody(src: string, name: string): string {
  const i = src.indexOf(`export async function ${name}(`);
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}

type Res = { kind: "OK" | "NO" | "THROW" | "MISSING"; v?: Any; msg: string; name?: string };
/** service call: {ok:true} = OK · {ok:false} = NO (reason/note) · throw = THROW · function absent = MISSING */
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { kind: "MISSING", msg: "MISSING (function absent)" };
  try {
    const v = await fn(...args);
    return v?.ok === true ? { kind: "OK", v, msg: String(v?.reason ?? v?.note ?? "") } : { kind: "NO", v, msg: String(v?.reason ?? v?.note ?? "") };
  } catch (e) {
    return { kind: "THROW", msg: errText(e), name: (e as Any)?.name };
  }
};
const rs = (r: Res) => `${r.kind}${r.msg ? `:${r.msg.slice(0, 120)}` : ""}`;
const refusedThai = (r: Res, re?: RegExp) => r.kind === "NO" && THAI.test(r.msg) && (!re || re.test(r.msg));

// ── Next request scope (technique of qc-hf-o23 / qc-crm-v1) — lets requireTenant() read cookies in-process ──
//   🔴 must run BEFORE any app module is imported (next/* captures globalThis.AsyncLocalStorage at load time)
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("no Next request scope (next/dist/... not loadable)");
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": SUITE, "x-forwarded-for": "203.0.113.124" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const sys = (await import("@/lib/modules/system/service" as string)) as Any;
const hrSvc = (await import("@/lib/modules/hr/service" as string)) as Any;
const PAY = (await import("@/lib/modules/hr/payroll" as string)) as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "q");
const SLUG = `qc-hr-h0.1-${rand}`;
const OWNER_UID = `qc-h01-owner-${rand}`;
const ACTOR = { userId: OWNER_UID, isOwner: true };
const TENANTS: string[] = [];
const USERS: string[] = [];
const B = (baht: number) => Math.round(baht * 100);
const ADD_KINDS = new Set(["OT", "COMMISSION", "BONUS", "ALLOWANCE"]);
const TOTALS: [string, string][] = [
  ["totalGrossSatang", "grossSatang"],
  ["totalSsoEmployeeSatang", "ssoEmployeeSatang"],
  ["totalSsoEmployerSatang", "ssoEmployerSatang"],
  ["totalWhtSatang", "whtSatang"],
  ["totalNetSatang", "netSatang"],
  ["totalAddSatang", "addSatang"],
  ["totalDeductSatang", "deductSatang"],
];
const ITEM_FIELDS = ["grossSatang", "ssoBaseSatang", "ssoEmployeeSatang", "ssoEmployerSatang", "whtSatang", "netSatang", "addSatang", "deductSatang"];

// ── fixture helpers ──
type Ctx = { tenantId: string; systemId: string };
async function emp(ctx: Ctx, name: string, baht: number, deductions?: { spouse?: boolean; children?: number }): Promise<string> {
  const e = await hrSvc.createEmployee(ctx, { name });
  await PAY.setSalaryProfile(ctx, { employeeId: e.id, baseSalarySatang: B(baht), ssoEligible: true, ...(deductions ? { deductions } : {}) });
  return e.id as string;
}
async function adjApproved(ctx: Ctx, employeeId: string, periodKey: string, kind: string, satang: number, extra: Any = {}): Promise<string> {
  const r = await PAY.requestAdjustment(ctx, { employeeId, periodKey, kind, amountSatang: satang, requestedById: "qc-h01-requester", ...extra });
  if (!r?.ok) throw new Error(`fixture: requestAdjustment ${short(r)}`);
  const d = await PAY.decideAdjustment(ctx, r.id, "APPROVED", { userId: OWNER_UID, isOwner: true });
  if (!d?.ok) throw new Error(`fixture: decideAdjustment ${short(d)}`);
  return r.id as string;
}
// ORACLE-EDIT (H0.2 R2): a period that already has a run refuses new requests — fixtures that need an APPROVED row *after* mkRun insert it directly (same pattern as the S2 "late" row)
async function adjApprovedDirect(ctx: Ctx, employeeId: string, periodKey: string, kind: string, satang: number): Promise<string> {
  const row = await P.hrPayAdjustment.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, periodKey, kind, amountSatang: satang, status: "APPROVED", decidedById: OWNER_UID, decidedAt: new Date(), requestedById: "qc-h01-requester" } });
  return row.id as string;
}
const mkRun = async (ctx: Ctx, periodKey: string, day = 25): Promise<string> => (await PAY.createPayrollRun(ctx, { periodKey, payDate: new Date(`${periodKey}-${String(day).padStart(2, "0")}T00:00:00Z`) })).id as string;
const runRow = (id: string) => P.hrPayrollRun.findUnique({ where: { id } });
const itemsOf = (runId: string) => P.hrPayrollItem.findMany({ where: { runId }, orderBy: { employeeId: "asc" } });
const expectOf = async (runId: string) => {
  const r = await runRow(runId);
  return { totalNetSatang: Number(r?.totalNetSatang ?? 0), itemCount: (await P.hrPayrollItem.count({ where: { runId } })) as number };
};
const normSnap = (s: Any) => {
  const o: Any = { ...(s && typeof s === "object" ? s : {}) };
  delete o.computedAt;
  if (Array.isArray(o.adjustments)) o.adjustments = o.adjustments.map((a: Any) => stable(a)).sort();
  return o;
};
const normItem = (i: Any, key: string) => ({
  key,
  ...Object.fromEntries(ITEM_FIELDS.map((f) => [f, i[f]])),
  snapKeys: Object.keys(i.snapshotJson ?? {}).sort(),
  snap: normSnap(i.snapshotJson),
});
const normItems = async (runId: string, keyOf: (employeeId: string) => string) => (await itemsOf(runId)).map((i: Any) => normItem(i, keyOf(i.employeeId))).sort((a: Any, b: Any) => (a.key < b.key ? -1 : 1));
const sumOk = async (runId: string) => {
  const r = await runRow(runId);
  const items = await itemsOf(runId);
  const bad = TOTALS.filter(([t, f]) => Number(r?.[t]) !== items.reduce((s: number, i: Any) => s + Number(i[f]), 0)).map(([t]) => t);
  return { ok: !!r && bad.length === 0, bad, n: items.length };
};
/** the run's items exactly (ids + money + snapshot) */
const itemsState = async (runId: string) => stable((await itemsOf(runId)).map((i: Any) => ({ id: i.id, employeeId: i.employeeId, ...Object.fromEntries(ITEM_FIELDS.map((f) => [f, i[f]])), snap: i.snapshotJson })));
/** everything a refused operation must leave alone */
const runState = async (runId: string) => {
  const r = await runRow(runId);
  const items = await itemsOf(runId);
  const adj = await P.hrPayAdjustment.findMany({ where: { runId }, select: { id: true, status: true, runId: true, amountSatang: true, periodKey: true }, orderBy: { id: "asc" } });
  return stable({
    run: r ? { status: r.status, journalEntryId: r.journalEntryId, payDate: r.payDate, periodKey: r.periodKey, note: r.note, ...Object.fromEntries(TOTALS.map(([t]) => [t, r[t]])) } : null,
    items: items.map((i: Any) => ({ id: i.id, employeeId: i.employeeId, ...Object.fromEntries(ITEM_FIELDS.map((f) => [f, i[f]])), snap: i.snapshotJson })),
    adj,
  });
};
const jvBalanced = async (entryId: string | null | undefined) => {
  if (!entryId) return { ok: false, dr: 0, cr: 0 };
  const lines = await P.accountJournalLine.findMany({ where: { entryId } });
  const dr = lines.reduce((s: number, l: Any) => s + Number(l.debit), 0);
  const cr = lines.reduce((s: number, l: Any) => s + Number(l.credit), 0);
  return { ok: dr === cr && dr > 0, dr, cr };
};
/** any numeric leaf equal to n under a key whose name contains `count` */
const hasCount = (o: Any, n: number): boolean => {
  if (!o || typeof o !== "object") return false;
  return Object.entries(o).some(([k, v]) => (/count/i.test(k) && Number(v) === n) || (v && typeof v === "object" && hasCount(v, n)));
};
const periods = (startY: number, startM: number, n: number) => Array.from({ length: n }, (_, i) => { const m = startM - 1 + i; return `${startY + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`; });

// ═════════════════════════ S4 static ═════════════════════════
function runStatic(): void {
  const pay = PAY_SRC;
  const act = rd(ACT_FILE);
  const ui = rd(UI_FILE);
  // S4.1
  const create = fnBody(pay, "createPayrollRun");
  const sigOk = squash(create).startsWith("export async function createPayrollRun( ctx: Ctx, input: { periodKey: string; payDate: Date }, ): Promise<{ id: string }> {");
  const dupAll = pay.split("มีรอบจ่ายงวด ${periodKey} อยู่แล้ว").length - 1;
  const dupIn = create.includes("มีรอบจ่ายงวด ${periodKey} อยู่แล้ว");
  chk("S4.1", sigOk && dupAll === 1 && dupIn, "signature unchanged · dup message once, in createPayrollRun", `sig=${sigOk} dupCount=${dupAll} inCreate=${dupIn}`);
  // S4.2
  const rulesSha = sha(rd(RULES_FILE));
  const schemaSha = sha(rd(SCHEMA_FILE));
  const ciSha = sha(seg(pay, "function computeItem(", "\n}\n", true));
  chk("S4.2", rulesSha === RULES_SHA && schemaSha === SCHEMA_SHA && ciSha === COMPUTE_ITEM_SHA, "3 hashes = base", `rules=${rulesSha === RULES_SHA} schema=${schemaSha === SCHEMA_SHA} computeItem=${ciSha === COMPUTE_ITEM_SHA}`);
  // S4.3
  const crmSha = sha(seg(pay, "// CRM C3.3 ▸ ทางเข้าของคอมมิชชัน CRM", "// ◂ CRM C3.3", true));
  const mpSha = sha(seg(pay, "// ── จ่ายแล้ว (APPROVED→PAID) ──", "// ◂ CRM C3.3", true));
  chk("S4.3", crmSha === CRM_BLOCK_SHA && mpSha === MARKPAID_BLOCK_SHA, "both blocks = base", `crmEntry=${crmSha === CRM_BLOCK_SHA} markPaid=${mpSha === MARKPAID_BLOCK_SHA}`);
  // S4.4 — UI: the two buttons, wired, DRAFT only. Candidate files: payroll-ui.tsx + any hr/*.tsx that uses the new actions.
  const hrDir = join(ROOT, "src/lib/modules/hr");
  const tsx = existsSync(hrDir) ? readdirSync(hrDir).filter((f: string) => f.endsWith(".tsx")).map((f: string) => `src/lib/modules/hr/${f}`) : [];
  const users = tsx.filter((f: string) => /\b(deleteDraftRunAction|recomputeDraftRunAction)\b/.test(rd(f)));
  const allTxt = users.map(rd).join("\n");
  const wired = /\bdeleteDraftRunAction\b/.test(allTxt) && /\brecomputeDraftRunAction\b/.test(allTxt) && allTxt.includes("ลบร่าง") && allTxt.includes("คำนวณใหม่");
  // DRAFT segments of payroll-ui.tsx: from each `status === "DRAFT"` to the next `status ===`
  const draftSegs: [number, number][] = [];
  for (let i = ui.indexOf('status === "DRAFT"'); i >= 0; i = ui.indexOf('status === "DRAFT"', i + 1)) {
    const nx = ui.indexOf("status ===", i + 18);
    draftSegs.push([i, nx < 0 ? ui.length : nx]);
  }
  const inDraft = (pos: number) => draftSegs.some(([a, b]) => pos > a && pos < b);
  // what payroll-ui renders for the new buttons: the actions themselves, or the component of another file that uses them
  const comps = users.filter((f: string) => f !== UI_FILE).flatMap((f: string) => [...rd(f).matchAll(/export (?:default )?function (\w+)/g)].map((m) => m[1]!));
  const marks: number[] = [];
  for (const re of [/\b(deleteDraftRunAction|recomputeDraftRunAction)\b/g, ...comps.map((c: string) => new RegExp(`<${c}\\b`, "g"))]) for (const m of ui.matchAll(re)) if (!/^import|^\s*(deleteDraftRunAction|recomputeDraftRunAction),?\s*$/.test(ui.slice(ui.lastIndexOf("\n", m.index!) + 1, ui.indexOf("\n", m.index!)))) marks.push(m.index!);
  const compSelfGuard = users.filter((f: string) => f !== UI_FILE).every((f: string) => /"DRAFT"/.test(rd(f)));
  const draftOnly = marks.length > 0 && marks.every((p) => inDraft(p) || compSelfGuard);
  chk("S4.4", wired && draftOnly, "both buttons wired · rendered only in the DRAFT branch", `files=${users.join(",") || "-"} wired=${wired} marks=${marks.length} inDraft=${marks.filter(inDraft).length} compGuard=${compSelfGuard}`);
  // S4.5 — approve form posts expect + action passes it
  const apUses = [UI_FILE, ...users].filter((f, i, a) => a.indexOf(f) === i).map(rd).filter((s) => /approvePayrollRunAction/.test(s));
  const formPostsExpect = apUses.some((s) => {
    for (const m of s.matchAll(/approvePayrollRunAction/g)) {
      const win = s.slice(m.index!, m.index! + 600);
      const fields = /fields=\{\{([^}]*)\}\}/.exec(win)?.[1] ?? "";
      if (/totalNet|expectNet/i.test(fields) && /items\.length|itemCount|expectItems/i.test(fields)) return true;
    }
    return /type="hidden"[^>]*name="[^"]*(expect|totalNet)[^"]*"/i.test(s) && /type="hidden"[^>]*name="[^"]*(itemCount|expectItems|count)[^"]*"/i.test(s);
  });
  const apAct = fnBody(act, "approvePayrollRunAction");
  const passes = /approveRun\(\s*ctx\s*,\s*runId\s*,\s*[^)\s]/.test(apAct);
  chk("S4.5", formPostsExpect && passes, "form fields carry net + item count · approveRun(ctx, runId, expect)", `form=${formPostsExpect} action=${passes}`);
  // S4.6 — actions
  const sixOk = ["deleteDraftRunAction", "recomputeDraftRunAction"].map((n) => {
    const b = fnBody(act, n);
    const svc = n === "deleteDraftRunAction" ? "deleteDraftRun(" : "recomputeDraftRun(";
    return { n, ok: !!b && /assertHrCan\(auth, "hr\.payroll\.create"\)/.test(b) && /Promise<\{\s*ok: boolean/.test(b) && b.includes(svc) && /auth\.(active\.userId|user\.id)/.test(b) && !/e\.message|err\.message/.test(b), has: !!b };
  });
  chk("S4.6", sixOk.every((x) => x.ok), "both actions: hr.payroll.create · {ok, reason} · session actor · no e.message", short(sixOk));
}

// ═════════════════════════ DB part ═════════════════════════
async function runDb(): Promise<void> {
  const t = await P.tenant.create({ data: { name: "QC HR H0.1", slug: SLUG } });
  TENANTS.push(t.id);
  const T = t.id as string;
  const t2 = await P.tenant.create({ data: { name: "QC HR H0.1 other", slug: `${SLUG}-b` } });
  TENANTS.push(t2.id);
  const T2 = t2.id as string;
  const H = (await sys.createSystem(T, "HR", "HR main")).id as string;
  const HS = (await sys.createSystem(T, "HR", "HR recompute")).id as string;
  const HC = (await sys.createSystem(T, "HR", "HR clone")).id as string;
  const HV = (await sys.createSystem(T, "HR", "HR viewers")).id as string;
  const HX = (await sys.createSystem(T, "HR", "HR races")).id as string;
  const HO = (await sys.createSystem(T, "HR", "HR other")).id as string;
  const ACC = (await sys.createSystem(T, "ACCOUNT", "บัญชี")).id as string;
  const H2 = (await sys.createSystem(T2, "HR", "HR other tenant")).id as string;
  const cH: Ctx = { tenantId: T, systemId: H };
  const cHS: Ctx = { tenantId: T, systemId: HS };
  const cHC: Ctx = { tenantId: T, systemId: HC };
  const cHV: Ctx = { tenantId: T, systemId: HV };
  const cHX: Ctx = { tenantId: T, systemId: HX };
  const cHO: Ctx = { tenantId: T, systemId: HO };
  const cH2: Ctx = { tenantId: T2, systemId: H2 };
  const jvCount = () => P.accountJournalEntry.count({ where: { systemId: ACC } }) as Promise<number>;
  const del = (ctx: Ctx, runId: string) => call(PAY.deleteDraftRun, ctx, runId, ACTOR);
  const rec = (ctx: Ctx, runId: string) => call(PAY.recomputeDraftRun, ctx, runId, ACTOR);

  // ───────── S1 delete ─────────
  console.log("── S1 delete ──");
  const h1 = await emp(cH, "สมชาย ทดสอบ", 30_000);
  const h2 = await emp(cH, "สมหญิง ทดสอบ", 18_000);
  const h3 = await emp(cH, "สมปอง ทดสอบ", 12_500);
  const a1 = await adjApproved(cH, h1, "2031-01", "BONUS", B(1_500));
  const a2 = await adjApproved(cH, h2, "2031-01", "DEDUCTION", B(500));
  const run1 = await mkRun(cH, "2031-01");
  const run1Row = await runRow(run1);
  const run1Items = await itemsOf(run1);
  const d1 = await del(cH, run1);
  const goneRun = !(await runRow(run1));
  const goneItems = (await P.hrPayrollItem.count({ where: { runId: run1 } })) === 0;
  chk("S1.1", d1.kind === "OK" && goneRun && goneItems, "OK · run gone · items 0", `${rs(d1)} runGone=${goneRun} itemsGone=${goneItems}`);
  const aRows = await P.hrPayAdjustment.findMany({ where: { id: { in: [a1, a2] } }, orderBy: { id: "asc" } });
  chk("S1.2", d1.kind === "OK" && aRows.length === 2 && aRows.every((a: Any) => a.runId === null && a.status === "APPROVED" && a.periodKey === "2031-01") && aRows.some((a: Any) => a.id === a1 && a.amountSatang === B(1_500) && a.kind === "BONUS") && aRows.some((a: Any) => a.id === a2 && a.amountSatang === B(500) && a.kind === "DEDUCTION"),
    "2 rows runId null APPROVED unchanged", short(aRows.map((a: Any) => [a.kind, a.status, a.runId, a.amountSatang])));
  let run1b: string | null = null;
  let recreateErr = "";
  try {
    run1b = await mkRun(cH, "2031-01");
  } catch (e) {
    recreateErr = errText(e);
  }
  const r1b = run1b ? await runRow(run1b) : null;
  const aRows2 = await P.hrPayAdjustment.findMany({ where: { id: { in: [a1, a2] } } });
  chk("S1.3", !!r1b && aRows2.every((a: Any) => a.runId === run1b) && r1b.totalAddSatang === run1Row.totalAddSatang && r1b.totalDeductSatang === run1Row.totalDeductSatang && r1b.totalNetSatang === run1Row.totalNetSatang,
    "new run · both bound · totals equal", run1b ? short({ add: [r1b?.totalAddSatang, run1Row.totalAddSatang], net: [r1b?.totalNetSatang, run1Row.totalNetSatang], bound: aRows2.map((a: Any) => a.runId === run1b) }) : `create threw: ${recreateErr}`);
  const runA = run1b ?? run1; // on the base the original still exists
  const NOT_DRAFT = /ลบได้เฉพาะรอบที่ยังเป็นร่าง/;
  await PAY.approveRun(cH, runA);
  const sA = await runState(runA);
  const dA = await del(cH, runA);
  const sA2 = await runState(runA);
  const stA = (await runRow(runA))?.status;
  chk("S1.4", stA === "APPROVED" && refusedThai(dA, NOT_DRAFT) && sA === sA2, "refused ลบได้เฉพาะรอบที่ยังเป็นร่าง · unchanged", `status=${stA} ${rs(dA)} unchanged=${sA === sA2}`);
  await PAY.markPaid(cH, runA);
  const sP = await runState(runA);
  const dP = await del(cH, runA);
  const stP = (await runRow(runA))?.status;
  chk("S1.5", stP === "PAID" && refusedThai(dP, NOT_DRAFT) && sP === (await runState(runA)), "refused · unchanged", `status=${stP} ${rs(dP)}`);
  await PAY.reverseRun(cH, runA, "QC H0.1");
  const sR = await runState(runA);
  const dR = await del(cH, runA);
  const stR = (await runRow(runA))?.status;
  chk("S1.6", stR === "REVERSED" && refusedThai(dR, NOT_DRAFT) && sR === (await runState(runA)), "refused · unchanged", `status=${stR} ${rs(dR)}`);
  const runOrphan = await mkRun(cH, "2031-02");
  await P.hrPayrollRun.update({ where: { id: runOrphan }, data: { journalEntryId: `qc-h01-orphan-${rand}` } });
  const sO = await runState(runOrphan);
  const dO = await del(cH, runOrphan);
  chk("S1.7", refusedThai(dO) && sO === (await runState(runOrphan)), "refused (Thai) · unchanged", `${rs(dO)}`);
  const dN = await del(cH, `qc-h01-nope-${rand}`);
  chk("S1.8", refusedThai(dN), "{ok:false} Thai", rs(dN));
  const au1 = await P.auditLog.findFirst({ where: { tenantId: T, action: "hr.payroll.delete_draft", targetId: run1 } });
  const bj = (au1?.before ?? {}) as Any;
  const idsInBefore = JSON.stringify(bj);
  chk("S1.9", !!au1 && bj.periodKey === "2031-01" && hasCount(bj, run1Items.length) && idsInBefore.includes(a1) && idsInBefore.includes(a2) && idsInBefore.includes(String(run1Row.totalNetSatang)),
    `audit before {periodKey 2031-01, itemCount ${run1Items.length}, ids, net ${run1Row.totalNetSatang}}`, au1 ? short(au1.before, 300) : "no audit row");

  // ───────── X2 cross-scope ─────────
  console.log("── X2 cross-scope ──");
  await emp(cH2, "พนักงาน ร้านอื่น", 20_000);
  await emp(cHO, "พนักงาน ระบบอื่น", 15_000);
  const runX = await mkRun(cH, "2031-03");
  const sX = await runState(runX);
  const x21 = [await del(cH2, runX), await rec(cH2, runX)];
  chk("X2.1", x21.every((r) => r.kind === "NO") && sX === (await runState(runX)), "both NO · untouched", `${x21.map(rs).join(" · ")}`);
  const x22 = [await del(cHO, runX), await rec(cHO, runX)];
  chk("X2.2", x22.every((r) => r.kind === "NO") && sX === (await runState(runX)), "both NO · untouched", `${x22.map(rs).join(" · ")}`);
  const mix: Ctx = { tenantId: T2, systemId: H };
  const x23 = [await del(mix, runX), await rec(mix, runX)];
  const x23a = await call(PAY.approveRun, mix, runX, await expectOf(runX));
  chk("X2.3", x23.every((r) => r.kind === "NO") && x23a.kind !== "OK" && sX === (await runState(runX)), "NO · NO · approve not ok · untouched", `${x23.map(rs).join(" · ")} · approve ${rs(x23a)}`);
  // S4.7 (runtime) — reverseRun hint on a DRAFT
  const rvD = await call(PAY.reverseRun, cH, runX);
  chk("S4.7", rvD.kind === "NO" && /ลบร่าง/.test(rvD.msg) && !/ลบร่างได้เลย/.test(rvD.msg) && /ปุ่ม\s*["“'«]?ลบร่าง|["“'«]ลบร่าง["”'»]/.test(rvD.msg), "note names button \"ลบร่าง\"", rs(rvD), "MINOR");

  // ───────── S2 recompute ─────────
  console.log("── S2 recompute ──");
  const s1 = await emp(cHS, "ก. คำนวณ", 30_000);
  const s2 = await emp(cHS, "ข. คำนวณ", 18_000);
  const s3 = await emp(cHS, "ค. คำนวณ", 12_500);
  const nameOf = new Map<string, string>([[s1, "A"], [s2, "B"], [s3, "C"]]);
  await adjApproved(cHS, s1, "2031-04", "BONUS", B(2_000));
  await adjApproved(cHS, s2, "2031-04", "ALLOWANCE", B(1_200));
  const b3 = await adjApproved(cHS, s3, "2031-04", "ALLOWANCE", B(800));
  const run2 = await mkRun(cHS, "2031-04", 28);
  const run2Before = await runRow(run2);
  // data changes after the first build
  await PAY.setSalaryProfile(cHS, { employeeId: s2, baseSalarySatang: B(21_000), ssoEligible: true, deductions: { spouse: false, children: 1 } });
  await P.hrSalaryProfile.deleteMany({ where: { systemId: HS, employeeId: s3 } });
  const late = await P.hrPayAdjustment.create({ data: { tenantId: T, systemId: HS, employeeId: s1, periodKey: "2031-04", kind: "COMMISSION", amountSatang: 34_567, note: "late", status: "APPROVED", decidedById: OWNER_UID, decidedAt: new Date() } });
  const rc1 = await rec(cHS, run2);
  const run2After = await runRow(run2);
  chk("S2.1", rc1.kind === "OK" && !!run2After && run2After.status === "DRAFT" && run2After.payDate?.toISOString() === run2Before.payDate.toISOString() && run2After.periodKey === "2031-04" && /^คำนวณใหม่/.test(String(run2After.note ?? "")),
    "OK · same id/payDate/period · DRAFT · note คำนวณใหม่…", `${rs(rc1)} ${short({ s: run2After?.status, pd: run2After?.payDate, note: run2After?.note })}`);
  // clone fixture with the final data → fresh createPayrollRun
  const c1 = await emp(cHC, "ก. คำนวณ", 30_000);
  const c2 = await emp(cHC, "ข. คำนวณ", 21_000, { spouse: false, children: 1 });
  const c3 = (await hrSvc.createEmployee(cHC, { name: "ค. คำนวณ" })).id as string; // no profile (removed in HS)
  nameOf.set(c1, "A").set(c2, "B").set(c3, "C");
  await adjApproved(cHC, c1, "2031-04", "BONUS", B(2_000));
  await adjApproved(cHC, c2, "2031-04", "ALLOWANCE", B(1_200));
  await adjApproved(cHC, c3, "2031-04", "ALLOWANCE", B(800));
  await P.hrPayAdjustment.create({ data: { tenantId: T, systemId: HC, employeeId: c1, periodKey: "2031-04", kind: "COMMISSION", amountSatang: 34_567, note: "late", status: "APPROVED", decidedById: OWNER_UID, decidedAt: new Date() } });
  const runC = await mkRun(cHC, "2031-04", 28);
  const key = (e: string) => nameOf.get(e) ?? e;
  const nA = await normItems(run2, key);
  const nC = await normItems(runC, key);
  chk("S2.2", rc1.kind === "OK" && stable(nA) === stable(nC), "items = clone", rc1.kind !== "OK" ? `recompute ${rs(rc1)}` : `run=${short(nA, 300)} clone=${short(nC, 300)}`);
  const lateRow = await P.hrPayAdjustment.findUnique({ where: { id: late.id } });
  const it1 = (await itemsOf(run2)).find((i: Any) => i.employeeId === s1);
  const snapAdj = JSON.stringify((it1?.snapshotJson as Any)?.adjustments ?? []);
  chk("S2.3", rc1.kind === "OK" && lateRow?.runId === run2 && it1?.addSatang === B(2_000) + 34_567 && snapAdj.includes("34567"), "late row bound · add = 2000.00 + 345.67 · in snapshot", `${rs(rc1)} runId=${lateRow?.runId === run2} add=${it1?.addSatang}`);
  const it3 = (await itemsOf(run2)).find((i: Any) => i.employeeId === s3);
  const b3Row = await P.hrPayAdjustment.findUnique({ where: { id: b3 } });
  chk("S2.4", rc1.kind === "OK" && !it3 && b3Row?.runId === null && b3Row?.status === "APPROVED", "no item for C · C's row unbound APPROVED", `${rs(rc1)} item=${!!it3} row=${short([b3Row?.runId, b3Row?.status])}`);
  const it2 = (await itemsOf(run2)).find((i: Any) => i.employeeId === s2);
  const sn2 = (it2?.snapshotJson ?? {}) as Any;
  chk("S2.5", rc1.kind === "OK" && sn2.baseSalarySatang === B(21_000) && sn2.deductions?.children === 1, "base 2,100,000 · children 1", short({ base: sn2.baseSalarySatang, d: sn2.deductions }));
  const so = await sumOk(run2);
  chk("S2.6", rc1.kind === "OK" && so.ok && so.n === 2, "Σ items = totals · 2 items", `${rs(rc1)} bad=${so.bad.join(",") || "-"} n=${so.n}`);
  const before2 = stable({ items: await normItems(run2, key), t: TOTALS.map(([t]) => run2After?.[t]) });
  const rc2 = await rec(cHS, run2);
  const run2Again = await runRow(run2);
  const after2 = stable({ items: await normItems(run2, key), t: TOTALS.map(([t]) => run2Again?.[t]) });
  chk("S2.7", rc1.kind === "OK" && rc2.kind === "OK" && before2 === after2, "identical", `${rs(rc2)} same=${before2 === after2}`);
  const au2 = await P.auditLog.findFirst({ where: { tenantId: T, action: "hr.payroll.recompute", targetId: run2 }, orderBy: { createdAt: "asc" } });
  chk("S2.9", !!au2 && JSON.stringify(au2.before ?? {}).includes(String(run2Before.totalNetSatang)) && JSON.stringify(au2.after ?? {}).includes(String(run2After?.totalNetSatang)) && hasCount(au2.before, 3) && hasCount(au2.after, 2),
    `before net ${run2Before.totalNetSatang} count 3 · after net ${run2After?.totalNetSatang} count 2`, au2 ? short({ b: au2.before, a: au2.after }, 300) : "no audit row");
  const apr2 = await call(PAY.approveRun, cHS, run2, await expectOf(run2));
  const sAp = await runState(run2);
  const rc3 = await rec(cHS, run2);
  chk("S2.8", apr2.kind === "OK" && refusedThai(rc3) && sAp === (await runState(run2)), "approve OK · recompute refused · unchanged", `${rs(apr2)} · ${rs(rc3)}`);

  // ───────── S3 approve guard ─────────
  console.log("── S3 approve guard ──");
  const STALE = /ตัวเลขของรอบนี้เปลี่ยนไปแล้ว/;
  const rA = await mkRun(cH, "2031-05");
  const eA = await expectOf(rA);
  const jv0 = await jvCount();
  const s31 = await call(PAY.approveRun, cH, rA, { totalNetSatang: eA.totalNetSatang + 1, itemCount: eA.itemCount });
  const rA2 = await runRow(rA);
  chk("S3.1", refusedThai(s31, STALE) && rA2?.status === "DRAFT" && !rA2?.journalEntryId && (await jvCount()) === jv0, "refused · DRAFT · no JV", `${rs(s31)} status=${rA2?.status} jv=${!!rA2?.journalEntryId}`);
  const rB = await mkRun(cH, "2031-06");
  const eB = await expectOf(rB);
  const jv1 = await jvCount();
  const s32 = await call(PAY.approveRun, cH, rB, { totalNetSatang: eB.totalNetSatang, itemCount: eB.itemCount + 1 });
  const rB2 = await runRow(rB);
  chk("S3.2", s32.kind === "NO" && rB2?.status === "DRAFT" && !rB2?.journalEntryId && (await jvCount()) === jv1, "refused · DRAFT · no JV", `${rs(s32)} status=${rB2?.status}`);
  const rC = await mkRun(cH, "2031-07");
  const s33 = await call(PAY.approveRun, cH, rC, await expectOf(rC));
  const rC2 = await runRow(rC);
  const jvC = await jvBalanced(rC2?.journalEntryId);
  chk("S3.3", s33.kind === "OK" && rC2?.status === "APPROVED" && jvC.ok, "APPROVED + JV Dr=Cr>0", `${rs(s33)} ${short({ s: rC2?.status, jvC })}`);
  const rD = await mkRun(cH, "2031-08");
  const s34 = await call(PAY.approveRun, cH, rD);
  const rD2 = await runRow(rD);
  chk("S3.4", s34.kind === "OK" && rD2?.status === "APPROVED" && (await jvBalanced(rD2?.journalEntryId)).ok, "APPROVED + JV", `${rs(s34)} s=${rD2?.status}`);
  const rE = await mkRun(cH, "2031-09");
  const eOld = await expectOf(rE);
  await PAY.setSalaryProfile(cH, { employeeId: h3, baseSalarySatang: B(13_000), ssoEligible: true });
  const rcE = await rec(cH, rE);
  const s35a = await call(PAY.approveRun, cH, rE, eOld);
  const stE = (await runRow(rE))?.status;
  const eNew = await expectOf(rE);
  const s35b = stE === "DRAFT" ? await call(PAY.approveRun, cH, rE, eNew) : ({ kind: "NO", msg: "skipped (already approved by the stale expect)" } as Res);
  const rE2 = await runRow(rE);
  chk("S3.5", rcE.kind === "OK" && refusedThai(s35a, STALE) && stE === "DRAFT" && eNew.totalNetSatang !== eOld.totalNetSatang && s35b.kind === "OK" && rE2?.status === "APPROVED" && rE2?.totalNetSatang === eNew.totalNetSatang,
    "stale refused · fresh approved with new net", `rec ${rs(rcE)} · stale ${rs(s35a)} (status ${stE}) · fresh ${rs(s35b)} · net ${eOld.totalNetSatang}→${eNew.totalNetSatang}`);
  await PAY.setSalaryProfile(cH, { employeeId: h3, baseSalarySatang: B(12_500), ssoEligible: true });
  const rT2 = await mkRun(cH2, "2031-01");
  const s36 = await call(PAY.approveRun, cH2, rT2, await expectOf(rT2));
  const rT22 = await runRow(rT2);
  chk("S3.6", s36.kind === "OK" && rT22?.status === "APPROVED" && !rT22?.journalEntryId && /ยังไม่ได้เปิดระบบบัญชี/.test(s36.msg), "APPROVED · no JV · not posted", `${rs(s36)} ${short({ s: rT22?.status, je: rT22?.journalEntryId })}`);

  // ───────── S5 CRM C3.3 regression ─────────
  console.log("── S5 CRM regression ──");
  const CM = (await import("@/lib/modules/crm/commissions" as string).catch(() => ({}))) as Any;
  const mkCommission = async (period: string, tag: string) => {
    const cid = `qch01${rand}${tag}`;
    await P.crmCommission.create({ data: { id: cid, tenantId: T, systemId: `qc-h01-crm-${rand}`, dealId: `qc-h01-deal-${tag}`, ruleId: `qc-h01-rule-${rand}`, userId: `qc-h01-seller-${rand}`, amountSatang: BigInt(50_000), basisSatang: BigInt(500_000), basis: "PAID", status: "APPROVED", periodKey: period } });
    const adjId = await adjApproved(cH, h1, period, "COMMISSION", 50_000, { crmCommissionId: cid });
    await P.crmCommission.update({ where: { id: cid }, data: { hrPayAdjustmentId: adjId } });
    return { cid, adjId };
  };
  const k1 = await mkCommission("2031-10", "a");
  const runK = await mkRun(cH, "2031-10");
  const boundK = (await P.hrPayAdjustment.findUnique({ where: { id: k1.adjId } }))?.runId === runK;
  const dK = await del(cH, runK);
  const refK = await PAY.adjustmentOfCommission(T, k1.cid);
  chk("S5.1", boundK && dK.kind === "OK" && refK?.runId === null && refK?.status === "APPROVED", "bound before · deleted · runId null APPROVED", `bound=${boundK} ${rs(dK)} ref=${short([refK?.runId, refK?.status])}`);
  const paidK = typeof CM.onPayrollPaid === "function" ? await CM.onPayrollPaid({ tenantId: T, hrSystemId: H, runId: runK }) : { paid: -1 };
  const cmK = await P.crmCommission.findUnique({ where: { id: k1.cid } });
  const evK = await P.outboxEvent.count({ where: { tenantId: T, type: "hr.payroll.paid", idempotencyKey: `hr.payroll.paid#${runK}` } });
  chk("S5.2", dK.kind === "OK" && !(await runRow(runK)) && paidK?.paid === 0 && cmK?.status === "APPROVED" && evK === 0, "paid 0 · APPROVED · no event", `${rs(dK)} paid=${paidK?.paid} status=${cmK?.status} events=${evK}`);
  const k2 = await mkCommission("2031-11", "b");
  const runK2 = await mkRun(cH, "2031-11");
  await PAY.approveRun(cH, runK2);
  await PAY.markPaid(cH, runK2);
  const paidK2 = typeof CM.onPayrollPaid === "function" ? await CM.onPayrollPaid({ tenantId: T, hrSystemId: H, runId: runK2 }) : { paid: -1 };
  const cmK2 = await P.crmCommission.findUnique({ where: { id: k2.cid } });
  chk("S5.3", cmK2?.status === "PAID" && paidK2?.paid >= 0, "commission PAID", `paid=${paidK2?.paid} status=${cmK2?.status}`);

  // ───────── S6 viewer matrix (actions in a real request scope) ─────────
  console.log("── S6 viewer matrix ──");
  const ACT = (await import("@/lib/modules/hr/payroll-actions" as string).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
  const coreHash = (await import("@/lib/core/hash" as string)) as Any;
  const DAYMS = 86_400_000;
  const v1 = await emp(cHV, "ดู สิทธิ์ หนึ่ง", 25_000);
  const v2 = await emp(cHV, "ดู สิทธิ์ สอง", 15_000);
  const mkViewer = async (tag: string, tenantId: string, role: string, permissions: Any) => {
    const u = await P.user.create({ data: { email: `${SLUG}-${tag}@qc.invalid`, name: `QC H0.1 ${tag}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    const token = coreHash.randomToken(32) as string;
    await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAYMS), expiresAt: new Date(Date.now() + 90 * DAYMS) } });
    return { tag, uid: u.id as string, cookie: `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tenantId}` };
  };
  const owner = await mkViewer("owner", T, "OWNER", {});
  const pv = await mkViewer("payroll-viewer", T, "STAFF", { "hr.payroll.read": true, "hr.payroll.create": true });
  const refusedViewers = [
    await mkViewer("payroll-reader-no-create", T, "STAFF", { "hr.payroll.read": true }),
    await mkViewer("manager-no-payroll", T, "MANAGER", {}),
    await mkViewer("staff-hr-keys", T, "STAFF", { "hr.employee.create": true, "hr.leave.read": true }),
    await mkViewer("plain-member", T, "STAFF", {}),
    await mkViewer("employee-self", T, "STAFF", {}),
    await mkViewer("other-tenant-owner", T2, "OWNER", {}),
  ];
  await P.hrEmployee.update({ where: { id: v1 }, data: { linkedUserId: refusedViewers[4]!.uid } });
  const PATH = `/app/sys/${HV}/hr/payroll`;
  const act = async (viewer: { cookie: string }, name: string, fields: Record<string, string>): Promise<Res> => {
    const fn = ACT?.[name];
    if (typeof fn !== "function") return { kind: "MISSING", msg: `MISSING ${name}${ACT?.__err ? ` (${ACT.__err})` : ""}` };
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    try {
      const v = await inScope(viewer.cookie, PATH, () => fn(fd));
      return (v as Any)?.ok === true ? { kind: "OK", v, msg: "" } : { kind: "NO", v, msg: String((v as Any)?.reason ?? "") };
    } catch (e) {
      return { kind: "THROW", msg: errText(e), name: (e as Any)?.name };
    }
  };
  const actRefused = (r: Res) => r.kind === "NO" || (r.kind === "THROW" && (r.name === "ForbiddenError" || /ไม่มีสิทธิ์|NEXT_HTTP_ERROR|NEXT_NOT_FOUND/.test(r.msg)));
  const pend = await PAY.requestAdjustment(cHV, { employeeId: v2, periodKey: "2031-12", kind: "BONUS", amountSatang: 10_000, requestedById: "qc-h01-requester" });
  const c60 = await act(owner, "cancelAdjustmentAction", { systemId: HV, id: String(pend?.id) });
  const pendGone = !(await P.hrPayAdjustment.findUnique({ where: { id: String(pend?.id) } }));
  chk("S6.0", c60.kind === "OK" && pendGone, "OK · row gone", `${rs(c60)} gone=${pendGone}`, "MAJOR");
  const rOwn = await mkRun(cHV, "2031-01");
  const rPv = await mkRun(cHV, "2031-02");
  const rQ = await mkRun(cHV, "2031-03");
  const rRec = await mkRun(cHV, "2031-04");
  const a61 = await act(owner, "deleteDraftRunAction", { systemId: HV, runId: rOwn });
  const a61b = await act(pv, "deleteDraftRunAction", { systemId: HV, runId: rPv });
  chk("S6.1", a61.kind === "OK" && a61b.kind === "OK" && !(await runRow(rOwn)) && !(await runRow(rPv)), "both OK · runs gone", `owner ${rs(a61)} · pv ${rs(a61b)}`);
  // salary change ⇒ any recompute of rQ would be visible in its state
  await PAY.setSalaryProfile(cHV, { employeeId: v2, baseSalarySatang: B(16_500), ssoEligible: true });
  const sQ = await runState(rQ);
  const r62: { tag: string; r: Res }[] = [];
  for (const v of refusedViewers) r62.push({ tag: v.tag, r: await act(v, "deleteDraftRunAction", { systemId: HV, runId: rQ }) });
  chk("S6.2", r62.every((x) => actRefused(x.r)) && sQ === (await runState(rQ)), "6× refused · untouched", r62.map((x) => `${x.tag}=${rs(x.r).slice(0, 60)}`).join(" · "));
  const a63 = await act(owner, "recomputeDraftRunAction", { systemId: HV, runId: rRec });
  const a63b = await act(pv, "recomputeDraftRunAction", { systemId: HV, runId: rRec });
  const itV2 = (await itemsOf(rRec)).find((i: Any) => i.employeeId === v2);
  const so63 = await sumOk(rRec);
  chk("S6.3", a63.kind === "OK" && a63b.kind === "OK" && (itV2?.snapshotJson as Any)?.baseSalarySatang === B(16_500) && so63.ok, "both OK · new base · Σ ok", `owner ${rs(a63)} · pv ${rs(a63b)} base=${(itV2?.snapshotJson as Any)?.baseSalarySatang}`);
  const r64: { tag: string; r: Res }[] = [];
  for (const v of refusedViewers) r64.push({ tag: v.tag, r: await act(v, "recomputeDraftRunAction", { systemId: HV, runId: rQ }) });
  chk("S6.4", r64.every((x) => actRefused(x.r)) && sQ === (await runState(rQ)), "6× refused · untouched", r64.map((x) => `${x.tag}=${rs(x.r).slice(0, 60)}`).join(" · "));

  // ───────── X6 races (2 worker processes) ─────────
  console.log("── X6 races (worker processes) ──");
  const x1 = await emp(cHX, "แข่ง หนึ่ง", 28_000);
  const x2 = await emp(cHX, "แข่ง สอง", 17_000);
  const x3 = await emp(cHX, "แข่ง สาม", 13_500);
  const PX = periods(2032, 1, 15);
  const ROUNDS = 3;
  const LANES = 5; // per worker ⇒ 10 lanes per round
  type Sc = { s: number; r: number; period: string; runId: string; stale: { totalNetSatang: number; itemCount: number }; preItems: string; pending: string[] };
  const scs: Sc[] = [];
  for (let s = 0; s < 5; s += 1) {
    for (let r = 0; r < ROUNDS; r += 1) {
      const period = PX[s * ROUNDS + r]!;
      await adjApproved(cHX, x1, period, "BONUS", B(1_000 + s * 10 + r));
      await adjApproved(cHX, x2, period, "DEDUCTION", B(300));
      const pending: string[] = [];
      if (s === 4) {
        for (let i = 0; i < LANES; i += 1) {
          const q = await PAY.requestAdjustment(cHX, { employeeId: i % 2 ? x2 : x1, periodKey: period, kind: "BONUS", amountSatang: B(100 * (i + 1)), requestedById: "qc-h01-requester" });
          pending.push(String(q?.id));
        }
      }
      const runId = await mkRun(cHX, period); // ORACLE-EDIT H0.2: PENDING rows filed before the run (R2 refuses requests into a period with a run)
      scs.push({ s, r, period, runId, stale: await expectOf(runId), preItems: await itemsState(runId), pending });
    }
  }
  await PAY.setSalaryProfile(cHX, { employeeId: x3, baseSalarySatang: B(14_250), ssoEligible: true }); // recompute now changes the net
  const GAP = 8_000;
  const lanesA = (sc: Sc) => Array.from({ length: LANES }, () => (sc.s === 1 || sc.s === 3 ? { fn: "delete", sys: HX, a: { runId: sc.runId } } : { fn: "recompute", sys: HX, a: { runId: sc.runId } }));
  const lanesB = (sc: Sc) =>
    Array.from({ length: LANES }, (_, i) =>
      sc.s === 0 || sc.s === 1 ? { fn: "approve", sys: HX, a: { runId: sc.runId, expect: sc.stale } }
      : sc.s === 2 ? { fn: "recompute", sys: HX, a: { runId: sc.runId } }
      : sc.s === 3 ? { fn: "create", sys: HX, a: { periodKey: sc.period, payDate: `${sc.period}-25T00:00:00Z` } }
      : { fn: "decide", sys: HX, a: { id: sc.pending[i] } });
  const order = [...scs].sort((a, b) => a.r - b.r || a.s - b.s); // interleave scenarios round by round
  const argOf = (lanes: (sc: Sc) => Any[]) => ({ tenantId: T, actor: ACTOR, rounds: order.map((sc, i) => ({ atMs: i * GAP, lanes: lanes(sc) })) });
  const startAt = Date.now() + 25_000;
  const spawnW = (arg: Any) =>
    new Promise<{ out: { at: number; res: string[] }[] | null; tail: string }>((resolve) => {
      const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64url");
      const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--h01-worker", String(startAt), enc], { env: process.env });
      let so = "";
      let se = "";
      ch.stdout.on("data", (d) => (so += String(d)));
      ch.stderr.on("data", (d) => (se = (se + String(d)).slice(-600)));
      const kill = setTimeout(() => ch.kill("SIGKILL"), 25_000 + order.length * GAP + 240_000);
      ch.on("close", () => {
        clearTimeout(kill);
        const line = so.split("\n").find((l) => l.startsWith("H01WORKER "));
        resolve({ out: line ? JSON.parse(line.slice(10)) : null, tail: (se || so).slice(-300) });
      });
    });
  const [wA, wB] = await Promise.all([spawnW(argOf(lanesA)), spawnW(argOf(lanesB))]);
  const complete = !!wA.out && !!wB.out && wA.out.length === order.length && wB.out.length === order.length && wA.out.every((x) => x.res.length === LANES) && wB.out.every((x) => x.res.length === LANES);
  const skews = complete ? order.map((_, i) => Math.abs(wA.out![i]!.at - wB.out![i]!.at)) : [];
  chk("X6.0", complete && skews.every((k) => k <= 2_000), `${order.length} rounds × ${2 * LANES} lanes · skew ≤ 2000 ms`, complete ? `maxSkew=${Math.max(...skews)}ms` : `A=${wA.out?.length ?? "null"} B=${wB.out?.length ?? "null"} · ${wA.tail} | ${wB.tail}`, "MAJOR");
  const resOf = (sc: Sc) => {
    const i = order.indexOf(sc);
    return { A: wA.out?.[i]?.res ?? [], B: wB.out?.[i]?.res ?? [] };
  };
  const clean = (xs: string[]) => xs.length === LANES && xs.every((x) => x === "OK" || x.startsWith("OK:") || x.startsWith("NO"));
  const nOk = (xs: string[]) => xs.filter((x) => x === "OK" || x.startsWith("OK:")).length;
  const adjOfPeriod = (period: string) => P.hrPayAdjustment.findMany({ where: { systemId: HX, periodKey: period }, select: { id: true, employeeId: true, kind: true, amountSatang: true, status: true, runId: true } });
  const evalX = async (s: number, judge: (sc: Sc, A: string[], B: string[]) => Promise<string | null>) => {
    const bad: string[] = [];
    for (const sc of scs.filter((x) => x.s === s)) {
      const { A, B: Bres } = resOf(sc);
      const why = await judge(sc, A, Bres);
      if (why) bad.push(`r${sc.r}: ${why}`);
    }
    return bad;
  };
  const sample = (A: string[], B: string[]) => `A=${short(A, 90)} B=${short(B, 90)}`;
  // X6.1 recompute ∥ approve(stale)
  const b61 = await evalX(0, async (sc, A, Bres) => {
    if (!clean(A) || !clean(Bres)) return `lanes ${sample(A, Bres)}`;
    const run = await runRow(sc.runId);
    const ap = nOk(Bres);
    const rc = nOk(A);
    const so2 = await sumOk(sc.runId);
    if (ap > 1) return `approve ok ×${ap}`;
    if (ap === 1) return run?.status === "APPROVED" && rc === 0 && run.totalNetSatang === sc.stale.totalNetSatang && (await itemsState(sc.runId)) === sc.preItems && (await jvBalanced(run.journalEntryId)).ok ? null : `approve won but rec=${rc} net=${run?.totalNetSatang}/${sc.stale.totalNetSatang} s=${run?.status}`;
    return run?.status === "DRAFT" && rc >= 1 && so2.ok && run.totalNetSatang !== sc.stale.totalNetSatang ? null : `approve lost but s=${run?.status} rec=${rc} net=${run?.totalNetSatang} Σ=${so2.ok}`;
  });
  chk("X6.1", b61.length === 0, "3/3 rounds consistent", b61.join(" · "));
  // X6.2 delete ∥ approve(right expect)
  const b62 = await evalX(1, async (sc, A, Bres) => {
    if (!clean(A) || !clean(Bres)) return `lanes ${sample(A, Bres)}`;
    const run = await runRow(sc.runId);
    const adj = (await adjOfPeriod(sc.period)).filter((a: Any) => a.status === "APPROVED");
    const d = nOk(A);
    const a = nOk(Bres);
    if (d + a !== 1) return `successes del=${d} approve=${a}`;
    if (d === 1) return !run && adj.every((x: Any) => x.runId === null) ? null : `deleted but run=${!!run} bound=${adj.filter((x: Any) => x.runId).length}`;
    return run?.status === "APPROVED" && (await jvBalanced(run.journalEntryId)).ok && adj.every((x: Any) => x.runId === sc.runId) ? null : `approved but s=${run?.status} bound=${adj.filter((x: Any) => x.runId === sc.runId).length}/${adj.length}`;
  });
  chk("X6.2", b62.length === 0, "3/3 rounds exactly one success", b62.join(" · "));
  // X6.3 recompute ∥ recompute
  const b63 = await evalX(2, async (sc, A, Bres) => {
    if (!clean(A) || !clean(Bres) || nOk([...A, ...Bres]) < 1) return `lanes ${sample(A, Bres)}`;
    const kx = (e: string) => e;
    const totalsOf = async () => { const rr = await runRow(sc.runId); return TOTALS.map(([t]) => rr?.[t]); };
    const snapA = stable({ i: await normItems(sc.runId, kx), t: await totalsOf() });
    const again = await rec(cHX, sc.runId);
    const snapB = stable({ i: await normItems(sc.runId, kx), t: await totalsOf() });
    const adj = (await adjOfPeriod(sc.period)).filter((a: Any) => a.status === "APPROVED");
    const run = await runRow(sc.runId);
    return again.kind === "OK" && snapA === snapB && run?.status === "DRAFT" && (await sumOk(sc.runId)).ok && adj.every((x: Any) => x.runId === sc.runId) ? null : `seq ${rs(again)} same=${snapA === snapB} bound=${adj.filter((x: Any) => x.runId === sc.runId).length}/${adj.length}`;
  });
  chk("X6.3", b63.length === 0, "3/3 rounds consistent", b63.join(" · "));
  // X6.4 delete ∥ create same period
  const b64 = await evalX(3, async (sc, A, Bres) => {
    if (!clean(A) || !clean(Bres)) return `lanes ${sample(A, Bres)}`;
    const runs = await P.hrPayrollRun.findMany({ where: { systemId: HX, periodKey: sc.period }, select: { id: true } });
    const adj = (await adjOfPeriod(sc.period)).filter((a: Any) => a.status === "APPROVED");
    const d = nOk(A);
    const c = nOk(Bres);
    if (d !== 1 || runs.length > 1 || c !== runs.length) return `del=${d} create=${c} runs=${runs.length}`;
    const want = runs.length === 1 ? runs[0].id : null;
    return adj.every((x: Any) => x.runId === want) ? null : `adjustments bound ${short(adj.map((x: Any) => x.runId))} want ${want}`;
  });
  chk("X6.4", b64.length === 0, "3/3 rounds: one delete · runs = creates · adjustments follow", b64.join(" · "));
  // X6.5 recompute ∥ decideAdjustment
  const b65 = await evalX(4, async (sc, A, Bres) => {
    if (!clean(A) || !clean(Bres) || nOk(A) < 1) return `lanes ${sample(A, Bres)}`;
    const rows = await P.hrPayAdjustment.findMany({ where: { id: { in: sc.pending } } });
    if (rows.length !== LANES || !rows.every((r: Any) => r.status === "APPROVED" && (r.runId === null || r.runId === sc.runId))) return `rows ${short(rows.map((r: Any) => [r.status, r.runId === sc.runId ? "run" : r.runId]))}`;
    const items = await itemsOf(sc.runId);
    const bound = await P.hrPayAdjustment.findMany({ where: { runId: sc.runId } });
    const badEmp = items.filter((it: Any) => {
      const mine = bound.filter((b: Any) => b.employeeId === it.employeeId);
      return it.addSatang !== mine.filter((b: Any) => ADD_KINDS.has(b.kind)).reduce((s: number, b: Any) => s + b.amountSatang, 0) || it.deductSatang !== mine.filter((b: Any) => !ADD_KINDS.has(b.kind)).reduce((s: number, b: Any) => s + b.amountSatang, 0);
    });
    return badEmp.length === 0 && (await sumOk(sc.runId)).ok ? null : `item sums ≠ bound rows for ${badEmp.length} employee(s)`;
  });
  chk("X6.5", b65.length === 0, "3/3 rounds: rows APPROVED, in run or unbound, sums match", b65.join(" · "));
  // X6.6 global invariant over the whole tenant
  const allRuns = await P.hrPayrollRun.findMany({ where: { tenantId: T }, select: { id: true } });
  const runIds = new Set(allRuns.map((r: Any) => r.id));
  const boundAll = await P.hrPayAdjustment.findMany({ where: { tenantId: T, runId: { not: null } } });
  const dangling = boundAll.filter((a: Any) => !runIds.has(a.runId));
  const g: string[] = [];
  for (const r of allRuns) {
    const so3 = await sumOk(r.id);
    if (!so3.ok) g.push(`Σ ${r.id.slice(-6)} ${so3.bad.join(",")}`);
    const items = await itemsOf(r.id);
    const mine = boundAll.filter((a: Any) => a.runId === r.id);
    for (const it of items) {
      const m = mine.filter((a: Any) => a.employeeId === it.employeeId);
      const add = m.filter((a: Any) => ADD_KINDS.has(a.kind)).reduce((s: number, a: Any) => s + a.amountSatang, 0);
      const ded = m.filter((a: Any) => !ADD_KINDS.has(a.kind)).reduce((s: number, a: Any) => s + a.amountSatang, 0);
      if (it.addSatang !== add || it.deductSatang !== ded) g.push(`item ${r.id.slice(-6)}/${it.employeeId.slice(-6)} add ${it.addSatang}/${add} ded ${it.deductSatang}/${ded}`);
    }
    const emps = new Set(items.map((i: Any) => i.employeeId));
    const orphan = mine.filter((a: Any) => !emps.has(a.employeeId));
    if (orphan.length) g.push(`run ${r.id.slice(-6)}: ${orphan.length} bound row(s) without an item`);
  }
  chk("X6.6", dangling.length === 0 && g.length === 0, "0 dangling · 0 mismatches", `dangling=${dangling.length} ${g.slice(0, 4).join(" · ")}`);

  // ═════════════════════════ S7 / X7 — oracle round 2 (CR10–CR15 on 65a45626 · additive) ═════════════════════════
  //   own HR systems in the same tenant (H7 · H7G) so nothing above changes · periods 2034-01… / 2035-0x are used by nobody else
  console.log("── S7 round 2 ──");
  const H7 = (await sys.createSystem(T, "HR", "HR round2")).id as string;
  const H7G = (await sys.createSystem(T, "HR", "HR round2 gross")).id as string;
  const c7: Ctx = { tenantId: T, systemId: H7 };
  const c7g: Ctx = { tenantId: T, systemId: H7G };
  const RRA_FILE = "src/lib/modules/hr/RunRowActions.tsx";
  const RRA = rd(RRA_FILE);
  const ACT_SRC = rd(ACT_FILE);
  const UI_SRC = rd(UI_FILE);
  const CD_SRC = rd("src/components/ui/ConfirmDialog.tsx");
  const STALE_TH = "ตัวเลขของรอบนี้เปลี่ยนไปแล้ว กรุณาดูยอดใหม่แล้วกดอนุมัติอีกครั้ง"; // CR12 (action text)
  const POST_FAILED_TH = "ลงบัญชีไม่สำเร็จ รอบนี้ยังเป็นร่าง — ลองอนุมัติอีกครั้ง หรือให้ผู้ดูแลบัญชีตรวจสอบ"; // CR12
  const FORBIDDEN_TH = "คุณไม่มีสิทธิ์ทำรายการนี้"; // CR13
  const MISSING_TH = "ไม่พบตัวเลขที่คุณเห็นบนหน้าจอ กรุณาโหลดหน้าใหม่แล้วกดอนุมัติอีกครั้ง"; // CR18 (oracle round 3)
  const CANCEL_BOUND_TH = "รายการนี้เข้ารอบจ่ายแล้ว ลบไม่ได้ (ใช้กลับรายการรอบจ่ายแทน)"; // cancelAdjustment (CR9: untouched in H0.1)
  const fullExpect = async (runId: string) => {
    const r = await runRow(runId);
    return { totalNetSatang: Number(r?.totalNetSatang ?? 0), itemCount: (await P.hrPayrollItem.count({ where: { runId } })) as number, totalGrossSatang: Number(r?.totalGrossSatang ?? 0) };
  };
  const fieldsOf = (sys7: string, runId: string, e: { totalNetSatang: number; itemCount: number; totalGrossSatang: number }) => ({ systemId: sys7, runId, expectNet: String(e.totalNetSatang), expectItems: String(e.itemCount), expectGross: String(e.totalGrossSatang) });
  const draftNoJv = async (runId: string) => { const r = await runRow(runId); return !!r && r.status === "DRAFT" && !r.journalEntryId; };
  const approvedJv = async (runId: string) => { const r = await runRow(runId); return !!r && r.status === "APPROVED" && (await jvBalanced(r.journalEntryId)).ok; };
  /** every `<ConfirmDialog … />` element of a source file */
  const dialogs = (src: string) => [...src.matchAll(/<ConfirmDialog\b[\s\S]*?\n\s*\/>/g)].map((m) => m[0]);
  const e71 = await emp(c7, "รอบสอง หนึ่ง", 30_000);
  const e72 = await emp(c7, "รอบสอง สอง", 18_000);

  // S7.1 (source) — CR10 wording · delete label · routing
  {
    const ds = dialogs(RRA);
    const recD = ds.find((d) => /op:\s*"recompute"/.test(d)) ?? "";
    const delD = ds.find((d) => /op:\s*"delete"/.test(d)) ?? "";
    const recOk = /triggerLabel="ดึงข้อมูลใหม่"/.test(recD) && recD.includes("คำนวณใหม่");
    const delOk = /triggerLabel="ลบร่าง"/.test(delD) && /\bdanger\b/.test(delD);
    const route = /op === "approve"\s*\?\s*await approvePayrollRunAction\(formData\)/.test(RRA) && /op === "delete"\s*\?\s*await deleteDraftRunAction\(formData\)/.test(RRA) && /await recomputeDraftRunAction\(formData\)/.test(RRA);
    chk("S7.1", recOk && delOk && route, "recompute \"ดึงข้อมูลใหม่\" + dialog คำนวณใหม่ · delete \"ลบร่าง\" (danger) · routing", `dialogs=${ds.length} rec=${recOk} del=${delOk} route=${route}`, "MINOR");
  }

  // S7.7 (source) — approve action shape · inline reason · hidden fields from row props
  {
    const apBody = squash(fnBody(ACT_SRC, "approvePayrollRunAction"));
    const sig = apBody.startsWith("export async function approvePayrollRunAction(formData: FormData): Promise<{ ok: boolean; reason?: string }> {");
    const errSpan = /data-testid=\{`hr-payroll-run-\$\{periodKey\}-error`\}[\s\S]{0,240}\{state\.reason\}/.test(RRA);
    const apD = dialogs(RRA).find((d) => /op:\s*"approve"/.test(d)) ?? "";
    const hidden = /expectNet:\s*String\(totalNetSatang\)/.test(apD) && /expectItems:\s*String\(itemCount\)/.test(apD) && /expectGross:\s*String\(totalGrossSatang\)/.test(apD)
      && /testId=\{`hr-payroll-run-\$\{periodKey\}-approve`\}/.test(apD) && /triggerLabel="อนุมัติ"/.test(apD);
    const cdHidden = /type="hidden"\s+name=\{k\}\s+value=\{v\}/.test(CD_SRC);
    const props = /totalNetSatang=\{r\.totalNetSatang\}/.test(UI_SRC) && /totalGrossSatang=\{r\.totalGrossSatang\}/.test(UI_SRC) && /itemCount=\{r\.items\.length\}/.test(UI_SRC);
    chk("S7.7", sig && errSpan && hidden && cdHidden && props, "signature · error span shows state.reason · 3 hidden fields from row props", `sig=${sig} errSpan=${errSpan} approveFields=${hidden} confirmDialogHidden=${cdHidden} uiProps=${props}`, "MAJOR");
  }

  // S7.2 — approve expect incl. gross: service + form parsing (approveExpectFromForm is not exported ⇒ via the real action in a request scope)
  {
    const bad: string[] = [];
    const jvA = await jvCount();
    const ra = await mkRun(c7, "2034-02");
    const sa = await call(PAY.approveRun, c7, ra, await fullExpect(ra));
    if (!(sa.kind === "OK" && (await approvedJv(ra)))) bad.push(`(a) full expect ${rs(sa)}`);
    const rb = await mkRun(c7, "2034-03");
    const eb = await fullExpect(rb);
    const jvB = await jvCount();
    const sb = await call(PAY.approveRun, c7, rb, { ...eb, totalGrossSatang: eb.totalGrossSatang + 1 });
    if (!(refusedThai(sb, STALE) && sb.v?.code === "STALE" && (await draftNoJv(rb)) && (await jvCount()) === jvB)) bad.push(`(b) gross+1 ${rs(sb)} code=${sb.v?.code}`);
    const sc = await call(PAY.approveRun, c7, rb, { totalNetSatang: eb.totalNetSatang, itemCount: eb.itemCount });
    if (!(sc.kind === "OK" && (await approvedJv(rb)))) bad.push(`(c) no gross ${rs(sc)}`);
    // form
    const formCase = async (period: string, tag: string, mut: (f: Record<string, string>) => Record<string, string>, want: "OK" | "STALE") => {
      const r = await mkRun(c7, period);
      const f = mut(fieldsOf(H7, r, await fullExpect(r)));
      const res = await act(owner, "approvePayrollRunAction", f);
      const ok = want === "OK" ? res.kind === "OK" && (await approvedJv(r)) : res.kind === "NO" && res.msg === STALE_TH && (await draftNoJv(r));
      if (!ok) bad.push(`(${tag}) ${rs(res)} want ${want}`);
      return r;
    };
    await formCase("2034-04", "d gross missing", (f) => { const { expectGross: _g, ...rest } = f; return rest; }, "OK");
    await formCase("2034-05", "e gross abc", (f) => ({ ...f, expectGross: "abc" }), "OK");
    await formCase("2034-06", "f gross 12.5", (f) => ({ ...f, expectGross: "12.5" }), "OK");
    const r7 = await formCase("2034-07", "g gross+1", (f) => ({ ...f, expectGross: String(Number(f.expectGross) + 1) }), "STALE");
    // (h) expectNet unreadable ⇒ fail closed — oracle round 3 (CR18 "missing/non-integer"): refused with the CR18 text (was STALE) — same run, still DRAFT
    const e7 = await fullExpect(r7);
    const rh = await act(owner, "approvePayrollRunAction", { ...fieldsOf(H7, r7, e7), expectNet: "abc" });
    if (!(rh.kind === "NO" && rh.msg === MISSING_TH && (await draftNoJv(r7)))) bad.push(`(h) net abc ${rs(rh)} (want CR18 text)`);
    // (i) neither expectNet nor expectItems — oracle round 3 (CR18 flips the round-2 "legacy approve"): refused with the CR18 text · DRAFT · no JV
    const jvI = await jvCount();
    const ri = await act(owner, "approvePayrollRunAction", { systemId: H7, runId: r7, expectGross: String(e7.totalGrossSatang + 1) });
    if (!(ri.kind === "NO" && ri.msg === MISSING_TH && (await draftNoJv(r7)) && (await jvCount()) === jvI)) bad.push(`(i) no net/items ${rs(ri)} → ${(await runRow(r7))?.status} (want CR18 refusal)`);
    chk("S7.2", bad.length === 0, "a OK · b STALE · c OK · d/e/f OK · g STALE · h refused (CR18) · i refused (CR18)", `${bad.join(" · ") || "-"} jv+${(await jvCount()) - jvA}`);
  }

  // S7.3 — gross changes, net + count stay equal
  {
    const g1 = await emp(c7g, "ยอดรวม หนึ่ง", 12_500);
    await emp(c7g, "ยอดรวม สอง", 20_000);
    const rg = await mkRun(c7g, "2034-02");
    const eOld = await fullExpect(rg);
    await PAY.setSalaryProfile(c7g, { employeeId: g1, baseSalarySatang: B(13_000), ssoEligible: true });
    const rc1 = await rec(c7g, rg);
    const dNet = Number((await runRow(rg))?.totalNetSatang ?? 0) - eOld.totalNetSatang; // net gained by the raise
    let rc2: Res = { kind: "NO", msg: "not run (raise did not raise net)" };
    if (rc1.kind === "OK" && dNet > 0) {
      await adjApprovedDirect(c7g, g1, "2034-02", "DEDUCTION", dNet); // ORACLE-EDIT H0.2
      rc2 = await rec(c7g, rg);
    }
    const eNew = await fullExpect(rg);
    const pre = rc1.kind === "OK" && rc2.kind === "OK" && eNew.totalNetSatang === eOld.totalNetSatang && eNew.itemCount === eOld.itemCount && eNew.totalGrossSatang > eOld.totalGrossSatang;
    const jvG = await jvCount();
    const stale = await call(PAY.approveRun, c7g, rg, eOld);
    const staleOk = refusedThai(stale, STALE) && (await draftNoJv(rg)) && (await jvCount()) === jvG;
    const fresh = await call(PAY.approveRun, c7g, rg, eNew);
    const freshOk = fresh.kind === "OK" && (await approvedJv(rg)) && Number((await runRow(rg))?.totalGrossSatang) === eNew.totalGrossSatang;
    console.log(`     S7.3 net ${eOld.totalNetSatang}→${eNew.totalNetSatang} · items ${eOld.itemCount}→${eNew.itemCount} · gross ${eOld.totalGrossSatang}→${eNew.totalGrossSatang} (compensating deduction ${dNet})`);
    chk("S7.3", pre && staleOk && freshOk, "precondition net/count equal, gross up · stale refused · fresh APPROVED", `pre=${pre} net ${eOld.totalNetSatang}→${eNew.totalNetSatang} gross ${eOld.totalGrossSatang}→${eNew.totalGrossSatang} items ${eOld.itemCount}→${eNew.itemCount} · stale ${rs(stale)} · fresh ${rs(fresh)}`);
  }

  // S7.4 + S7.8 runtime — JV step throws (ACCOUNT period of the pay date CLOSED) → DRAFT → recompute → delete
  const bkkClock = (at: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  };
  let noteStampOk = false;
  let noteSeen = "";
  {
    const adj4 = await adjApproved(c7, e71, "2034-01", "BONUS", B(700));
    const r4 = await mkRun(c7, "2034-01");
    await P.accountPeriod.create({ data: { tenantId: T, systemId: ACC, periodKey: "2034-01", status: "CLOSED" } });
    const jv4 = await jvCount();
    const sv = await call(PAY.approveRun, c7, r4, await fullExpect(r4));
    const svOk = sv.kind === "NO" && sv.v?.code === "POST_FAILED" && (await draftNoJv(r4)) && (await jvCount()) === jv4;
    const av = await act(owner, "approvePayrollRunAction", fieldsOf(H7, r4, await fullExpect(r4)));
    const avOk = av.kind === "NO" && av.msg === POST_FAILED_TH && !/ปิดแล้ว|2034-01/.test(av.msg) && (await draftNoJv(r4)) && (await jvCount()) === jv4;
    const t0 = Date.now();
    const rc = await rec(c7, r4);
    const t1 = Date.now();
    noteSeen = String((await runRow(r4))?.note ?? "");
    const stamp = /^คำนวณใหม่ (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/.exec(noteSeen)?.[1] ?? "";
    noteStampOk = rc.kind === "OK" && !!stamp && (stamp === bkkClock(t0) || stamp === bkkClock(t1));
    const auR = await P.auditLog.count({ where: { tenantId: T, action: "hr.payroll.recompute", targetId: r4 } });
    const recOk = rc.kind === "OK" && (await draftNoJv(r4)) && (await sumOk(r4)).ok && auR === 1;
    const dl = await del(c7, r4);
    const auD = await P.auditLog.count({ where: { tenantId: T, action: "hr.payroll.delete_draft", targetId: r4 } });
    const a4 = await P.hrPayAdjustment.findUnique({ where: { id: adj4 } });
    const delOk = dl.kind === "OK" && !(await runRow(r4)) && auD === 1 && a4?.runId === null && a4?.status === "APPROVED";
    chk("S7.4", svOk && avOk && recOk && delOk, "service POST_FAILED DRAFT no JV · action fixed text · recompute ok + audit · delete ok + audit, row unbound", `service ${rs(sv)} code=${sv.v?.code} ok=${svOk} · action ${rs(av)} ok=${avOk} · rec ${rs(rc)} audit=${auR} ok=${recOk} · del ${rs(dl)} audit=${auD} ok=${delOk}`);
  }

  // S7.8 — bkkParts, no hand-rolled offset in the H0.1 block (+ the runtime stamp above)
  {
    const h01 = seg(PAY_SRC, "// ─────────── H0.1 ▸ วงจรรอบร่าง", "// ◂ H0.1", true);
    const imp = /import \{ bkkParts \} from "\.\/service";/.test(PAY_SRC);
    const stampFn = seg(h01, "function bkkStamp(", "\n}\n", true);
    const usesParts = /bkkParts\(/.test(stampFn) && /คำนวณใหม่ \$\{bkkStamp\(new Date\(\)\)\}/.test(fnBody(PAY_SRC, "recomputeDraftRun"));
    const hand = /7\s*\*\s*60\s*\*\s*60\s*\*\s*1000|7\s*\*\s*3_?600\s*\*\s*1_?000|25_?200_?000|getUTCHours\(\)\s*\+\s*7|\.getHours\(|\.getDate\(|\.getDay\(/;
    const clean = !!h01 && !hand.test(h01) && !hand.test(fnBody(PAY_SRC, "approveRun"));
    chk("S7.8", imp && usesParts && clean && noteStampOk, "import bkkParts · bkkStamp uses it · no +7 h by hand · note = Bangkok clock", `import=${imp} usesParts=${usesParts} noHandOffset=${clean} block=${h01.length}ch note="${noteSeen}" stampOk=${noteStampOk}`, "MINOR");
  }

  // S7.5 — ORACLE-EDIT (H0.2 CR-H0.2-1): APPROVED adjustment bound to a DRAFT · cancel WITH actor = delete + recompute in one tx · cancel without actor refused · CRM withdraw/move refused · after approve, cancel refused with the APPROVED text
  {
    const CANCEL_DRAFT_SYSTEM_TH = "รายการนี้อยู่ในรอบจ่ายร่าง — ลบได้จากหน้าเงินเดือนเท่านั้น (ระบบจะคำนวณรอบร่างใหม่ให้)";
    const CANCEL_APPROVED_TH = "รายการนี้อยู่ในรอบจ่ายที่อนุมัติแล้ว ลบไม่ได้ (ใช้กลับรายการรอบจ่ายแทน)";
    const cid = `qch01${rand}r2`;
    await P.crmCommission.create({ data: { id: cid, tenantId: T, systemId: `qc-h01-crm-${rand}`, dealId: `qc-h01-deal-r2`, ruleId: `qc-h01-rule-${rand}`, userId: `qc-h01-seller-${rand}`, amountSatang: BigInt(40_000), basisSatang: BigInt(400_000), basis: "PAID", status: "APPROVED", periodKey: "2034-08" } });
    const aC = await adjApproved(c7, e71, "2034-08", "COMMISSION", 40_000, { crmCommissionId: cid });
    await P.crmCommission.update({ where: { id: cid }, data: { hrPayAdjustmentId: aC } });
    const aB = await adjApproved(c7, e72, "2034-08", "BONUS", 25_000);
    const aD = await adjApproved(c7, e72, "2034-08", "BONUS", 10_000);
    const r5 = await mkRun(c7, "2034-08");
    const before = await runRow(r5);
    const bTot = TOTALS.map(([t]) => Number(before?.[t]));
    const auDel0 = await P.auditLog.count({ where: { tenantId: T, action: "hr.payadjust.delete" } });
    const auRec0 = await P.auditLog.count({ where: { tenantId: T, action: "hr.payroll.recompute", targetId: r5 } });
    const cu1 = await call(PAY.cancelAdjustment, c7, aB, { userId: OWNER_UID, isOwner: true });
    const mid = await runRow(r5);
    const mTot = TOTALS.map(([t]) => Number(mid?.[t]));
    const rowB = await P.hrPayAdjustment.findUnique({ where: { id: aB } });
    const auDel1 = await P.auditLog.count({ where: { tenantId: T, action: "hr.payadjust.delete" } });
    const auRec1 = await P.auditLog.count({ where: { tenantId: T, action: "hr.payroll.recompute", targetId: r5 } });
    const cu1Ok = cu1.kind === "OK" && rowB === null && mid?.status === "DRAFT" && !mid?.journalEntryId
      && Number(mid?.totalAddSatang) === Number(before?.totalAddSatang) - 25_000 && Number(mid?.totalNetSatang) < Number(before?.totalNetSatang)
      && (await sumOk(r5)).ok && auDel1 === auDel0 + 1 && auRec1 === auRec0 + 1;
    const cu2 = await call(PAY.cancelAdjustment, c7, aD);
    const wd = await PAY.withdrawCommissionAdjustment(c7, { adjustmentId: aC, crmCommissionId: cid, statuses: ["PENDING", "APPROVED"] }).catch((e: unknown) => `THROW ${errText(e)}`);
    const mv = await PAY.moveCommissionAdjustmentPeriod(c7, { adjustmentId: aC, crmCommissionId: cid, periodKey: "2036-01" }).catch((e: unknown) => `THROW ${errText(e)}`);
    const rows1 = await P.hrPayAdjustment.findMany({ where: { id: { in: [aC, aD] } } });
    const stillBound = rows1.length === 2 && rows1.every((r: Any) => r.runId === r5 && r.status === "APPROVED" && r.periodKey === "2034-08");
    const rc5 = await rec(c7, r5);
    const after = await runRow(r5);
    const aTot = TOTALS.map(([t]) => Number(after?.[t]));
    const rows2 = await P.hrPayAdjustment.findMany({ where: { id: { in: [aC, aD] } } });
    const keepOk = cu2.kind === "NO" && cu2.msg === CANCEL_DRAFT_SYSTEM_TH && wd === false && mv === false && stillBound
      && rc5.kind === "OK" && stable(aTot) === stable(mTot) && (await sumOk(r5)).ok && rows2.every((r: Any) => r.runId === r5);
    const ap = await call(PAY.approveRun, c7, r5, await fullExpect(r5), ACTOR);
    const cu3 = await call(PAY.cancelAdjustment, c7, aD, { userId: OWNER_UID, isOwner: true });
    const rowD = await P.hrPayAdjustment.findUnique({ where: { id: aD } });
    const apOk = ap.kind === "OK" && (await runRow(r5))?.status === "APPROVED" && cu3.kind === "NO" && cu3.msg === CANCEL_APPROVED_TH && rowD?.runId === r5 && rowD?.status === "APPROVED";
    chk("S7.5", cu1Ok && keepOk && apOk, "actor cancel = delete + recompute (+2 audits) · no-actor refused · withdraw/move false · recompute stable · approved-bound refused", `cu1 ${rs(cu1)} rowB=${rowB === null} add ${Number(before?.totalAddSatang)}→${Number(mid?.totalAddSatang)} audits +${auDel1 - auDel0}/+${auRec1 - auRec0} · cu2 ${rs(cu2)} · withdraw=${wd} move=${mv} bound=${stillBound} · rec ${rs(rc5)} totals ${short(mTot)}→${short(aTot)} · approve ${rs(ap)} cu3 ${rs(cu3)}`);
  }

  // S7.6 — CR13 Forbidden inline, runtime + source
  {
    const r6 = await mkRun(c7, "2034-09");
    await PAY.setSalaryProfile(c7, { employeeId: e72, baseSalarySatang: B(18_750), ssoEligible: true }); // a recompute would show
    const s6 = await runState(r6);
    const e6 = await fullExpect(r6);
    const who = refusedViewers.filter((v) => v.tag !== "other-tenant-owner");
    const out: string[] = [];
    let allOk = true;
    for (const v of who) {
      for (const [name, f] of [["approvePayrollRunAction", fieldsOf(H7, r6, e6)], ["recomputeDraftRunAction", { systemId: H7, runId: r6 }], ["deleteDraftRunAction", { systemId: H7, runId: r6 }]] as [string, Record<string, string>][]) {
        const r = await act(v, name, f);
        const good = r.kind === "NO" && r.msg === FORBIDDEN_TH;
        if (!good) { allOk = false; out.push(`${v.tag}/${name.replace("Action", "")}=${rs(r).slice(0, 70)}`); }
      }
    }
    const untouched = s6 === (await runState(r6));
    const constTh = (body: string) => {
      const m = /instanceof ForbiddenError\)\s*return \{ ok: false, reason: (\w+|"[^"]*") \}/.exec(body);
      if (!m) return false;
      const lit = m[1]!.startsWith('"') ? m[1]! : (new RegExp(`const ${m[1]} = ("[^"]*")`).exec(ACT_SRC)?.[1] ?? "");
      return THAI.test(lit);
    };
    const src = ["approvePayrollRunAction", "recomputeDraftRunAction", "deleteDraftRunAction"].map((n) => {
      const b = fnBody(ACT_SRC, n);
      const iReq = b.indexOf("await requireTenant()");
      const iTry = b.indexOf("try {");
      return { n, ok: !!b && iReq >= 0 && iTry > iReq && constTh(b) && /throw e;/.test(b) && !/e\.message|err\.message/.test(b) };
    });
    chk("S7.6", allOk && untouched && src.every((x) => x.ok), `${who.length}×3 → {ok:false, ${FORBIDDEN_TH}} · untouched · source ok`, `${out.join(" · ") || "runtime ok"} · untouched=${untouched} · src=${short(src)}`);
  }

  // X7.1 — recompute ∥ recompute (in-process, same run)
  {
    const bad: string[] = [];
    for (const [i, period] of ["2034-10", "2034-11", "2034-12"].entries()) {
      await adjApproved(c7, e71, period, "BONUS", B(100 + i));
      const r = await mkRun(c7, period);
      await PAY.setSalaryProfile(c7, { employeeId: e72, baseSalarySatang: B(19_000 + 250 * i), ssoEligible: true });
      const au0 = await P.auditLog.count({ where: { tenantId: T, action: "hr.payroll.recompute", targetId: r } });
      const res = await Promise.all([rec(c7, r), rec(c7, r)]);
      const okN = res.filter((x) => x.kind === "OK").length;
      const clean = res.every((x) => x.kind === "OK" || refusedThai(x));
      const runs = await P.hrPayrollRun.findMany({ where: { systemId: H7, periodKey: period }, select: { id: true } });
      const au1 = await P.auditLog.count({ where: { tenantId: T, action: "hr.payroll.recompute", targetId: r } });
      const adj = (await P.hrPayAdjustment.findMany({ where: { systemId: H7, periodKey: period } })).filter((a: Any) => a.status === "APPROVED");
      const so = await sumOk(r);
      const it2 = (await itemsOf(r)).find((x: Any) => x.employeeId === e72);
      const fine = clean && okN >= 1 && so.ok && runs.length === 1 && runs[0].id === r && au1 - au0 === okN && adj.every((a: Any) => a.runId === r) && (await draftNoJv(r)) && (it2?.snapshotJson as Any)?.baseSalarySatang === B(19_000 + 250 * i);
      if (!fine) bad.push(`${period}: ${res.map(rs).join(" | ")} Σ=${so.ok} runs=${runs.length} audit+${au1 - au0}/${okN} bound=${adj.filter((a: Any) => a.runId === r).length}/${adj.length}`);
    }
    chk("X7.1", bad.length === 0, "3/3 rounds clean", bad.join(" · "));
  }

  // X7.2 — delete ∥ approve(fresh expect) (in-process, same run)
  {
    const bad: string[] = [];
    const wins: string[] = [];
    for (const [i, period] of ["2035-01", "2035-02", "2035-03"].entries()) {
      await adjApproved(c7, e71, period, "BONUS", B(200 + i));
      const r = await mkRun(c7, period);
      const e = await fullExpect(r);
      // start order per round: delete first · approve first · approve 400 ms late (so the "delete wins" branch is exercised too) — same judge
      let d: Res;
      let a: Res;
      if (i === 1) [a, d] = await Promise.all([call(PAY.approveRun, c7, r, e), del(c7, r)]);
      else [d, a] = await Promise.all([del(c7, r), (i === 2 ? sleep(400) : Promise.resolve()).then(() => call(PAY.approveRun, c7, r, e))]);
      const run = await runRow(r);
      const adj = await P.hrPayAdjustment.findMany({ where: { systemId: H7, periodKey: period } });
      const noThrow = d.kind !== "THROW" && a.kind !== "THROW";
      const one = [d, a].filter((x) => x.kind === "OK").length === 1;
      let final = false;
      if (d.kind === "OK") final = !run && adj.every((x: Any) => x.runId === null) && a.kind === "NO";
      else if (a.kind === "OK") final = !!run && run.status === "APPROVED" && (await jvBalanced(run.journalEntryId)).ok && adj.every((x: Any) => x.runId === r) && refusedThai(d);
      const neverBad = !(run && run.status === "DRAFT" && run.journalEntryId);
      wins.push(d.kind === "OK" ? "del" : a.kind === "OK" ? "approve" : "none");
      if (!(noThrow && one && final && neverBad)) bad.push(`${period}: del ${rs(d)} | approve ${rs(a)} | run=${run ? `${run.status}/${run.journalEntryId ? "JV" : "-"}` : "gone"}`);
    }
    chk("X7.2", bad.length === 0, "3/3 rounds: one winner · loser {ok:false} · consistent final state", bad.join(" · ") || `winners ${wins.join(",")}`);
    if (bad.length === 0) console.log(`     X7.2 winners: ${wins.join(", ")}`);
  }
  // ═════════════════════════ S8 / X8 — oracle round 3 (hunter findings · CR16–CR19 on 987d3abd · additive) ═════════════════════════
  //   own HR systems (H8A swap · H8B shift · H8C misc · H8X race) in the same tenant · periods 2036-xx are used by nobody else
  //   digest: the builder's `payrollItemsDigest` (found by grep in src/lib/modules/hr/*.ts, non-"use server") when present ·
  //   until then a local stand-in over the 7 item columns that make the 7 run totals (only used to post a digest the base ignores)
  console.log("── S8 round 3 ──");
  const DRAFT_HAS_JV_TH = "รอบนี้มีเอกสารบัญชีค้างอยู่ ต้องให้ผู้ดูแลตรวจสอบก่อน"; // CR17
  const DIG7 = ["grossSatang", "addSatang", "deductSatang", "ssoEmployeeSatang", "ssoEmployerSatang", "whtSatang", "netSatang"];
  const digestLocal = (items: Any[]) => sha([...items].sort((a, b) => (String(a.employeeId) < String(b.employeeId) ? -1 : String(a.employeeId) > String(b.employeeId) ? 1 : 0)).map((i) => [i.employeeId, ...DIG7.map((f) => Number(i[f]))].join(":")).join("\n"));
  const hrDir8 = join(ROOT, "src/lib/modules/hr");
  const digFile = (existsSync(hrDir8) ? readdirSync(hrDir8) : []).filter((f: string) => /\.ts$/.test(f) && !f.endsWith(".d.ts")).map((f: string) => `src/lib/modules/hr/${f}`)
    .find((f: string) => /export (?:async )?function payrollItemsDigest\b|export const payrollItemsDigest\b/.test(rd(f))) ?? "";
  const digUseServer = !!digFile && /^\s*["']use server["']/.test(rd(digFile));
  let digFn: Any = null;
  let digErr = digFile ? "" : "payrollItemsDigest not exported by any src/lib/modules/hr/*.ts";
  if (digFile) {
    try {
      digFn = ((await import(`@/lib/modules/hr/${digFile.split("/").pop()!.replace(/\.ts$/, "")}` as string)) as Any).payrollItemsDigest;
      if (typeof digFn !== "function") { digErr = `${digFile}: payrollItemsDigest is not a function`; digFn = null; }
    } catch (e) {
      digErr = `import ${digFile}: ${errText(e)}`;
    }
  }
  const digestOf = async (items: Any[]): Promise<string> => (digFn ? String(await digFn(items)) : digestLocal(items));
  type Expect8 = { totalNetSatang: number; itemCount: number; totalGrossSatang: number; itemsDigest: string };
  const expect8 = async (runId: string): Promise<Expect8> => ({ ...(await fullExpect(runId)), itemsDigest: await digestOf(await itemsOf(runId)) });
  const fields8 = (sys8: string, runId: string, e: Expect8) => ({ ...fieldsOf(sys8, runId, e), expectDigest: e.itemsDigest });
  const sameTotals = (a: Expect8, b: Expect8) => a.totalNetSatang === b.totalNetSatang && a.itemCount === b.itemCount && a.totalGrossSatang === b.totalGrossSatang;
  const H8A = (await sys.createSystem(T, "HR", "HR round3 swap")).id as string;
  const H8B = (await sys.createSystem(T, "HR", "HR round3 shift")).id as string;
  const H8C = (await sys.createSystem(T, "HR", "HR round3 misc")).id as string;
  const H8X = (await sys.createSystem(T, "HR", "HR round3 race")).id as string;
  const c8a: Ctx = { tenantId: T, systemId: H8A };
  const c8b: Ctx = { tenantId: T, systemId: H8B };
  const c8c: Ctx = { tenantId: T, systemId: H8C };
  const c8x: Ctx = { tenantId: T, systemId: H8X };
  /** stale approve must be refused STALE (DRAFT, no JV, 0 new JV) · fresh expect (incl. the new digest) → APPROVED + exactly one balanced JV */
  const staleThenFresh = async (ctx: Ctx, runId: string, eOld: Expect8) => {
    const jv0 = await jvCount();
    const stale = await call(PAY.approveRun, ctx, runId, eOld);
    const jvS = await jvCount();
    const staleOk = stale.kind === "NO" && stale.v?.code === "STALE" && THAI.test(stale.msg) && (await draftNoJv(runId)) && jvS === jv0;
    let fresh: Res = { kind: "NO", msg: "not run (stale approve already changed the run)" };
    let freshOk = false;
    if (await draftNoJv(runId)) {
      const eNew = await expect8(runId);
      fresh = await call(PAY.approveRun, ctx, runId, eNew);
      freshOk = fresh.kind === "OK" && (await approvedJv(runId)) && (await jvCount()) === jvS + 1;
    }
    return { staleOk, freshOk, why: `stale ${rs(stale)} code=${stale.v?.code ?? "-"} jv+${jvS - jv0} · fresh ${rs(fresh)}` };
  };

  // S8.1 — employee swap with equal pay (hunter P1): A leaves, C joins at A's base → net/count/gross equal, items differ
  {
    const a = await emp(c8a, "สลับ ก", 22_000);
    await emp(c8a, "สลับ ข", 17_000);
    const c = (await hrSvc.createEmployee(c8a, { name: "สลับ ค" })).id as string;
    const r = await mkRun(c8a, "2036-01");
    const eOld = await expect8(r);
    await P.hrSalaryProfile.deleteMany({ where: { systemId: H8A, employeeId: a } });
    await PAY.setSalaryProfile(c8a, { employeeId: c, baseSalarySatang: B(22_000), ssoEligible: true });
    const rc = await rec(c8a, r);
    const eMid = await expect8(r);
    const emps = (await itemsOf(r)).map((i: Any) => i.employeeId);
    const pre = rc.kind === "OK" && sameTotals(eOld, eMid) && eMid.itemsDigest !== eOld.itemsDigest && emps.includes(c) && !emps.includes(a);
    const sf = await staleThenFresh(c8a, r, eOld);
    console.log(`     S8.1 net ${eOld.totalNetSatang}→${eMid.totalNetSatang} · items ${eOld.itemCount}→${eMid.itemCount} · gross ${eOld.totalGrossSatang}→${eMid.totalGrossSatang} · digest ${eOld.itemsDigest.slice(0, 8)}→${eMid.itemsDigest.slice(0, 8)} (${digFn ? "builder helper" : "local stand-in"})`);
    chk("S8.1", pre && sf.staleOk && sf.freshOk, "precondition (recompute ok · totals equal · digest differs · A out, C in) · old expect STALE · fresh APPROVED + 1 JV", `pre=${pre} rec ${rs(rc)} · ${sf.why}`);
  }

  // S8.2 — shift between two people (hunter P1b): BONUS 5,000 for A + DEDUCTION 5,000 for B → gross/net/count equal
  {
    const a = await emp(c8b, "โยก ก", 21_000);
    const b = await emp(c8b, "โยก ข", 19_000);
    const r = await mkRun(c8b, "2036-01");
    const eOld = await expect8(r);
    const before = await runRow(r);
    await adjApprovedDirect(c8b, a, "2036-01", "BONUS", B(5_000)); // ORACLE-EDIT H0.2
    await adjApprovedDirect(c8b, b, "2036-01", "DEDUCTION", B(5_000));
    const rc = await rec(c8b, r);
    const eMid = await expect8(r);
    const after = await runRow(r);
    const pre = rc.kind === "OK" && sameTotals(eOld, eMid) && eMid.itemsDigest !== eOld.itemsDigest && Number(after?.totalAddSatang) === Number(before?.totalAddSatang) + B(5_000) && Number(after?.totalDeductSatang) === Number(before?.totalDeductSatang) + B(5_000);
    const sf = await staleThenFresh(c8b, r, eOld);
    chk("S8.2", pre && sf.staleOk && sf.freshOk, "precondition (recompute ok · net/count/gross equal · add/deduct +5,000 · digest differs) · old expect STALE · fresh APPROVED + 1 JV", `pre=${pre} rec ${rs(rc)} · ${sf.why}`);
  }

  // S8.3 — the digest helper (pure · order-independent · sensitive) + hidden field rendered + parsed by the action
  {
    const bad: string[] = [];
    if (!digFn) bad.push(`MISSING helper (${digErr})`);
    if (digUseServer) bad.push(`${digFile} is "use server"`);
    if (digFn) {
      const mk = (id: string, k: number) => ({ id: `it-${id}`, runId: "run-x", employeeId: id, grossSatang: 2_000_000 + k, addSatang: 10_000 + k, deductSatang: 5_000 + k, ssoBaseSatang: 1_500_000, ssoEmployeeSatang: 75_000 + k, ssoEmployerSatang: 76_000 + k, whtSatang: 12_000 + k, netSatang: 1_900_000 + k });
      const set = [mk("emp-b", 2), mk("emp-a", 1), mk("emp-c", 3)];
      const frozen = stable(set);
      const d1 = String(await digFn(set));
      const d2 = String(await digFn(set));
      const dRev = String(await digFn([...set].reverse()));
      const dSorted = String(await digFn([...set].sort((x, y) => (x.employeeId < y.employeeId ? -1 : 1))));
      if (!/^[0-9a-f]{64}$/.test(d1)) bad.push(`not sha256 hex: ${d1.slice(0, 70)}`);
      if (d1 !== d2) bad.push("not deterministic");
      if (stable(set) !== frozen) bad.push("mutates its input");
      if (d1 !== dRev || d1 !== dSorted) bad.push("order-dependent");
      for (const f of [...DIG7, "employeeId"]) {
        const m = set.map((x) => ({ ...x }));
        (m[1] as Any)[f] = f === "employeeId" ? "emp-z" : Number((m[1] as Any)[f]) + 1;
        if (String(await digFn(m)) === d1) bad.push(`blind to ${f}`);
      }
    }
    // source: hidden field `expectDigest` on the approve dialog, digest computed server-side (payroll-ui.tsx), parsed by the action
    const apD = dialogs(RRA).find((d) => /op:\s*"approve"/.test(d)) ?? "";
    const rendered = /expectDigest\s*:/.test(apD) || /name="expectDigest"/.test(RRA + UI_SRC);
    const serverSide = /payrollItemsDigest\(/.test(UI_SRC) && !/payrollItemsDigest\(/.test(RRA);
    const parsed = /\.get\(\s*["']expectDigest["']\s*\)/.test(ACT_SRC);
    if (!rendered || !serverSide || !parsed) bad.push(`source rendered=${rendered} serverSide=${serverSide} parsed=${parsed}`);
    // runtime: right net/items/gross but a foreign digest through the real action → STALE text, DRAFT, no JV
    await emp(c8c, "ย่อย ก", 24_000);
    await emp(c8c, "ย่อย ข", 16_000);
    const r = await mkRun(c8c, "2036-02");
    const jv0 = await jvCount();
    const wrong = await act(owner, "approvePayrollRunAction", { ...fields8(H8C, r, await expect8(r)), expectDigest: "0".repeat(64) });
    if (!(wrong.kind === "NO" && wrong.msg === STALE_TH && (await draftNoJv(r)) && (await jvCount()) === jv0)) bad.push(`action foreign digest ${rs(wrong)} (want STALE text, DRAFT, no JV)`);
    chk("S8.3", bad.length === 0, "helper pure/hex/order-free/sensitive to 7 numbers + employeeId · non-\"use server\" · expectDigest rendered + server-side + parsed · foreign digest → STALE", `${bad.join(" · ")} · file=${digFile || "-"}`);
  }

  // S8.4 — DRAFT that already carries a journalEntryId (hunter Q1): never a second JV
  let s84: { runId: string; posted: Record<string, string> } | null = null;
  {
    const bad: string[] = [];
    const r = await mkRun(c8c, "2036-03");
    const ap = await call(PAY.approveRun, c8c, r);
    const jv1 = (await runRow(r))?.journalEntryId as string | null;
    if (!(ap.kind === "OK" && jv1 && (await jvBalanced(jv1)).ok)) bad.push(`precondition approve ${rs(ap)} je=${jv1}`);
    const force = () => P.hrPayrollRun.update({ where: { id: r }, data: { status: "DRAFT", journalEntryId: jv1 } });
    await force();
    const judge = async (tag: string, f: () => Promise<Res>, wantText?: string) => {
      const n0 = await jvCount();
      const res = await f();
      const row = await runRow(r);
      const n1 = await jvCount();
      const ok = res.kind === "NO" && (wantText ? res.msg === wantText : res.v?.code === "DRAFT_HAS_JV" && THAI.test(res.msg)) && row?.status === "DRAFT" && row?.journalEntryId === jv1 && n1 === n0;
      if (!ok) bad.push(`${tag} ${rs(res)} code=${res.v?.code ?? "-"} → ${row?.status}/${row?.journalEntryId === jv1 ? "same JV" : "JV changed"} jv+${n1 - n0}`);
      if (row?.status !== "DRAFT" || row?.journalEntryId !== jv1) await force(); // keep the precondition for the next sub-case
    };
    await judge("approveRun(expect)", async () => call(PAY.approveRun, c8c, r, await expect8(r)));
    await judge("approveRun()", () => call(PAY.approveRun, c8c, r));
    const posted = fields8(H8C, r, await expect8(r));
    s84 = { runId: r, posted };
    await judge("action", () => act(owner, "approvePayrollRunAction", posted), DRAFT_HAS_JV_TH);
    chk("S8.4", bad.length === 0, "approveRun(expect) + approveRun() → {ok:false, code DRAFT_HAS_JV} · action → fixed Thai · DRAFT · same journalEntryId · 0 new JV", bad.join(" · "));
  }

  // S8.5 — the action always carries an expectation (CR18)
  {
    const bad: string[] = [];
    for (const [i, [tag, pick]] of ([["none", [] as string[]], ["net only", ["expectNet"]], ["items only", ["expectItems"]]] as [string, string[]][]).entries()) {
      const r = await mkRun(c8c, `2036-0${4 + i}`);
      const full = fields8(H8C, r, await expect8(r)) as Record<string, string>;
      const f: Record<string, string> = { systemId: H8C, runId: r };
      for (const k of pick) f[k] = full[k]!;
      const jv0 = await jvCount();
      const res = await act(owner, "approvePayrollRunAction", f);
      if (!(res.kind === "NO" && res.msg === MISSING_TH && (await draftNoJv(r)) && (await jvCount()) === jv0)) bad.push(`${tag}: ${rs(res)} → ${(await runRow(r))?.status}`);
    }
    chk("S8.5", bad.length === 0, `no expectNet/expectItems · only one of them → {ok:false, "${MISSING_TH}"} · DRAFT · no JV`, bad.join(" · "));
  }

  // S8.6 — refusal audits with figures (CR19): STALE · DRAFT_HAS_JV (S8.4) · NOT_DRAFT approve · delete + recompute of an APPROVED run
  {
    const bad: string[] = [];
    const rS = await mkRun(c8c, "2036-07");
    const eS = await expect8(rS);
    const postedS = { ...fields8(H8C, rS, eS), expectNet: String(eS.totalNetSatang + 1) };
    const st = await act(owner, "approvePayrollRunAction", postedS);
    if (!(st.kind === "NO" && st.msg === STALE_TH)) bad.push(`STALE approve ${rs(st)}`);
    const rA = await mkRun(c8c, "2036-08");
    await PAY.approveRun(c8c, rA, await expect8(rA));
    const postedA = fields8(H8C, rA, await expect8(rA));
    const nd = await act(owner, "approvePayrollRunAction", postedA);
    const dl = await act(owner, "deleteDraftRunAction", { systemId: H8C, runId: rA });
    const rc = await act(owner, "recomputeDraftRunAction", { systemId: H8C, runId: rA });
    if (!(nd.kind === "NO" && dl.kind === "NO" && rc.kind === "NO")) bad.push(`APPROVED run: approve ${rs(nd)} · delete ${rs(dl)} · recompute ${rs(rc)}`);
    const audit = async (tag: string, action: string, runId: string, code: string | null, posted: Record<string, string> | null) => {
      const rows = await P.auditLog.findMany({ where: { tenantId: T, action, targetId: runId } });
      const mine = rows.filter((x: Any) => x.actorId === owner.uid);
      if (mine.length !== 1) return bad.push(`${tag}: ${action} rows=${rows.length} byActor=${mine.length}`);
      const pl = [mine[0].after, mine[0].before].find((x: Any) => x && typeof x === "object" && "code" in x) as Any;
      if (!pl) return bad.push(`${tag}: no {code, seen, actual} payload (${short({ b: mine[0].before, a: mine[0].after }, 120)})`);
      const why: string[] = [];
      if (code ? pl.code !== code : !(typeof pl.code === "string" && pl.code)) why.push(`code=${pl.code}`);
      if (posted === null) {
        if (pl.seen !== null) why.push(`seen=${short(pl.seen, 60)} want null`);
      } else {
        const s = pl.seen ?? {};
        if (Number(s.net) !== Number(posted.expectNet) || Number(s.items) !== Number(posted.expectItems)) why.push(`seen net/items ${s.net}/${s.items} want ${posted.expectNet}/${posted.expectItems}`);
        if (posted.expectGross !== undefined && Number(s.gross) !== Number(posted.expectGross)) why.push(`seen gross ${s.gross}`);
        if (posted.expectDigest !== undefined && s.digest !== posted.expectDigest) why.push(`seen digest ${String(s.digest).slice(0, 10)}`);
      }
      const db = await runRow(runId);
      const items = await itemsOf(runId);
      const a = pl.actual ?? {};
      if (Number(a.net) !== Number(db?.totalNetSatang) || Number(a.items) !== items.length || Number(a.gross) !== Number(db?.totalGrossSatang) || a.digest !== (await digestOf(items))) why.push(`actual ${short(a, 120)} ≠ DB ${db?.totalNetSatang}/${items.length}/${db?.totalGrossSatang}`);
      if (why.length) bad.push(`${tag}: ${why.join(", ")}`);
    };
    await audit("STALE", "hr.payroll.approve.refused", rS, "STALE", postedS);
    if (s84) await audit("DRAFT_HAS_JV", "hr.payroll.approve.refused", s84.runId, "DRAFT_HAS_JV", s84.posted);
    await audit("NOT_DRAFT", "hr.payroll.approve.refused", rA, "NOT_DRAFT", postedA);
    await audit("delete", "hr.payroll.delete_draft.refused", rA, null, null);
    await audit("recompute", "hr.payroll.recompute.refused", rA, null, null);
    chk("S8.6", bad.length === 0, "5 *.refused rows (1 each) · actor = session user · code · seen = posted (null for delete/recompute) · actual net/items/gross/digest = DB", bad.join(" · "));
  }

  // X8.1 — approve(old expect) ∥ recompute (same-totals swap) ×3 (in-process)
  {
    const bad: string[] = [];
    const wins: string[] = [];
    const a = await emp(c8x, "แข่งสลับ ก", 20_000);
    await emp(c8x, "แข่งสลับ ข", 16_000);
    const c = (await hrSvc.createEmployee(c8x, { name: "แข่งสลับ ค" })).id as string;
    for (const [i, period] of ["2036-09", "2036-10", "2036-11"].entries()) {
      await PAY.setSalaryProfile(c8x, { employeeId: a, baseSalarySatang: B(20_000), ssoEligible: true });
      await P.hrSalaryProfile.deleteMany({ where: { systemId: H8X, employeeId: c } });
      const r = await mkRun(c8x, period);
      const eOld = await expect8(r);
      await P.hrSalaryProfile.deleteMany({ where: { systemId: H8X, employeeId: a } });
      await PAY.setSalaryProfile(c8x, { employeeId: c, baseSalarySatang: B(20_000), ssoEligible: true });
      const n0 = await jvCount();
      // start order per round: recompute first · approve first · approve 400 ms late (recompute should have committed)
      let ap: Res;
      let rc: Res;
      if (i === 1) [ap, rc] = await Promise.all([call(PAY.approveRun, c8x, r, eOld), rec(c8x, r)]);
      else [rc, ap] = await Promise.all([rec(c8x, r), (i === 2 ? sleep(400) : Promise.resolve()).then(() => call(PAY.approveRun, c8x, r, eOld))]);
      const run = await runRow(r);
      const items = await itemsOf(r);
      const dig = await digestOf(items);
      const dJv = (await jvCount()) - n0;
      const noThrow = ap.kind !== "THROW" && rc.kind !== "THROW";
      let fine = false;
      if (run?.status === "APPROVED") fine = ap.kind === "OK" && rc.kind === "NO" && dig === eOld.itemsDigest && dJv === 1 && (await jvBalanced(run.journalEntryId)).ok;
      else fine = run?.status === "DRAFT" && !run?.journalEntryId && rc.kind === "OK" && ap.kind === "NO" && ap.v?.code === "STALE" && dig !== eOld.itemsDigest && dJv === 0;
      wins.push(run?.status === "APPROVED" ? "approve" : "recompute");
      if (!(noThrow && fine && dJv <= 1)) bad.push(`${period}: approve ${rs(ap)} | rec ${rs(rc)} | ${run?.status} jv+${dJv} digest ${dig === eOld.itemsDigest ? "= old" : "≠ old"}`);
    }
    chk("X8.1", bad.length === 0, "3/3 rounds: ≤1 JV · APPROVED only with the old items (digest = seen, recompute refused) · else DRAFT, new items, approve STALE, 0 JV", bad.join(" · ") || `winners ${wins.join(",")}`);
    if (bad.length === 0) console.log(`     X8.1 winners: ${wins.join(", ")}`);
  }
}

// ═════════════════════════ cleanup + residue ═════════════════════════
async function cleanup(): Promise<string[]> {
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* order/FK — next pass */
    }
  };
  if (!ids.length) return [];
  const inList = ids.map((x) => `'${x}'`).join(",");
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
    .map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await d(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
  for (const uid of USERS) {
    await d(() => P.session.deleteMany({ where: { userId: uid } }));
    await d(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    await d(() => P.membership.deleteMany({ where: { userId: uid } }));
    await d(() => P.user.delete({ where: { id: uid } }));
  }
  for (const id of ids) await d(() => P.tenant.delete({ where: { id } }));
  const left: string[] = [];
  for (const t of tables) {
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: -1 }])) as Any[];
    const n = Number(r?.[0]?.n ?? 0);
    if (n !== 0) left.push(`${t}=${n}`);
  }
  return left;
}

let crashed = "";
let left: string[] = ["(cleanup not run)"];
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 4).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    left = await cleanup();
  } catch (e) {
    left = [`cleanup threw: ${errText(e)}`];
  }
}
const leftTenants = (await P.tenant.count({ where: { slug: { startsWith: SLUG } } }).catch(() => -1)) as number;
const leftUsers = USERS.length ? ((await P.user.count({ where: { id: { in: USERS } } }).catch(() => -1)) as number) : 0;
const leftAdj = (await P.hrPayAdjustment.count({ where: { tenantId: { in: TENANTS } } }).catch(() => -1)) as number;
chk("Z1", TENANTS.length > 0 && left.length === 0 && leftTenants === 0 && leftUsers === 0 && leftAdj === 0, "0 rows · 0 tenants · 0 users", `tenants=${TENANTS.length} leftTenants=${leftTenants} users=${leftUsers} adj=${leftAdj} ${left.join(",")}`, "MAJOR");
for (const [id] of CHECKS) if (!results.has(id)) chk(id.slice(5), false, "checked", crashed ? `not reached (harness crashed: ${crashed.slice(0, 100)})` : "not reached");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== passed ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, findings: failed.map((id) => ({ id, sev: results.get(id)!.sev })), skipped: false, forced: FORCE, missing: skipReasons, crashed: crashed ? crashed.slice(0, 160) : null })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
