# HUNT H2.7 + H2.8 — quota ledger · races · privacy (hunter, 12 Nov 2026)

> Tree `/root/projects/shark-hr-l3` · `wip/hr-h2.7` @ 7fdecbba7 · lane DB via `iso.sh → qc-hr.sh → with-gate-lock.sh` only · own tenants `qc-hr-h27hunt-*` · dates 2030–2032
> 6 probes (`scripts/_hunt-h27-{1..6}.mts` + shared lib) — all deleted; `git status --short` shows only the reviewer's `hr-H2.7-review.md`. RESIDUE none ×6.
> **Verdict: FIX FIRST** — 2 MAJOR (carry/expire arithmetic lets Σ quota be overspent / go negative), 1 MEDIUM (attachment capability laundering), 2 MINOR.

## P1 — carry vs Y−1 spending after the CARRY row exists — **FINDING MAJOR**
Tried: policy VACATION quota 10, carryMax 5, expiry 06-30. A: 2030 uses 5 → `runLeaveYearJob(asOf 2031-01-05)` → back-dated 2030 leave 5 d (requested + approved in 2031) → 2031 leave 15 d. B: 2030 uses 5 + 5 d PENDING at job time → approved after the job → 2031 leave 15 d.
Observed:
`RESULT A Σ2030=0.0 [GRANT2030:10.0 USE2030:-5.0 USE2030:-5.0] · Σ2031=0.0 [CARRY2031:5.0 GRANT2031:10.0 USE2031:-15.0] · granted 20.0 · used 25.0 → OVERSPENT 5.0`
`RESULT B Σ2030=0.0 [... same ...] · Σ2031=0.0 [CARRY2031:5.0 GRANT2031:10.0 USE2031:-15.0] · granted 20.0 · used 25.0 → OVERSPENT 5.0`
Cause: CARRY is a one-sided +c in Y; Y−1 keeps its balance, so the same days are spendable twice (Y−1 back-dated/pending + Y). Builder listed "D-H27-carry-late" as a debt, but the effect is double spending, not just a stale carry. Pending Y−1 days are also not subtracted at carry time.
Smallest fix: write the carry as a transfer — in the same tx add `carry-out:<emp>:<pol>:<Y>` (kind CARRY, −c, leaveYear Y−1) next to `carry:<emp>:<pol>:<Y>` (+c, leaveYear Y), and compute c = carryDays(Σledger(Y−1) − pending(Y−1)). Y−1 then refuses the back-dated leave (balance) and the pending one at decide (`balanceDecide`).
```ts
// regression (oracle style): A uses 5 in 2030 → job 2031-01-05 → back-dated 2030 5 d must be refused
const a = await rq(U.A, E.A, "2030-06-03", "2030-06-07", { policyId: PL.c }); await decide(idv(a), "APPROVED", U.mgrAll);
await lvMod.runLeaveYearJob({ tenantId: TT, systemId: sA.id, asOf: "2031-01-05" });
const back = await rq(U.A, E.A, "2030-12-23", "2030-12-27", { policyId: PL.c });
const bd = back.ok ? await decide(idv(back), "APPROVED", U.mgrAll) : back;
const p = await rq(U.B, E.B, "2030-11-04", "2030-11-08", { policyId: PL.c });   // pending at job time (run job after this line)
const pd = await decide(idv(p), "APPROVED", U.mgrAll);
const s = async (e: string, y: number) => sum(await txOf({ employeeId: e, policyId: PL.c, leaveYear: y }));
const grants = sum(await txOf({ employeeId: E.A, policyId: PL.c, kind: "GRANT" }));
const used = -Number(sum(await txOf({ employeeId: E.A, policyId: PL.c, kind: "USE" })));
ck("H-1", { backRefused: !bd.ok, pendRefused: !pd.ok, notOverspent: used <= Number(grants), y30: Number(await s(E.A, 2030)) >= 0 }, "carry is a transfer");
```

## P2 — EXPIRE vs leave date — **FINDING MAJOR** (2 shapes)
Tried: quota 10, carryMax 5, expiry 03-31; job 2030-02-01 + 2031-01-02 (GRANT + CARRY 5). (a) A books 15 d in Oct 2031 in January (before expiry) → approved. (b) B uses 5 d in Feb 2031 (consumes carry) → expiry job ×3 in parallel at 2031-04-01 → manager revokes B's Feb leave.
Observed:
`job 2031-04-01 ×3 parallel → [{"expired":2},{"expired":0},{"expired":0}] · EXPIRE rows = 2` (idempotency HELD)
`RESULT A Σ2031=-5.0 [CARRY2031:5.0 EXPIRE2031:-5.0 GRANT2031:10.0 USE2031:-15.0] → NEGATIVE BALANCE` (myLeaveBalances shows balance/available −5.0)
`RESULT B Σ2031=15.0 [ADJUST2031:5.0 CARRY2031:5.0 EXPIRE2031:0.0 GRANT2031:10.0 USE2031:-5.0] · independent 10.0 → carry survives expiry (+5.0)`
Cause: (a) request/decide treat unexpired carry as spendable for days after the expiry date; EXPIRE then counts only USE with effectiveDate ≤ expiry. (b) `use-revert` after the EXPIRE row was written gives back carry days that the expiry already "saw" as used; first-write-wins never re-evaluates.
Smallest fix: (a) in `reserveLeaveInTx` and `leaveBalanceCoversInTx`, when `from > carryExpiryOf(year)`, available = Σledger − max(0, Σcarry − usedUpToExpiry − Σexpire) (i.e. unexpired carry is not spendable after expiry); (b) in `leaveLedgerInTx` revert path, if `expire:<emp>:<pol>:<y>` exists and `row.fromDate ≤ expiry`, add `expire-late:<leaveId>` = −(expireDays(carried, usedNow) − alreadyExpired) clamped ≥ 0. A floor clamp on EXPIRE alone fixes (a)'s negative but still lets carry be spent after expiry.
```ts
// regression: carry 5 (expiry 03-31) · 15 d in October booked in January must be refused · revoke-after-expiry must not resurrect carry
await lvMod.runLeaveYearJob({ tenantId: TT, systemId: sA.id, asOf: "2030-02-01" });
await lvMod.runLeaveYearJob({ tenantId: TT, systemId: sA.id, asOf: "2031-01-02" });
const oct = await rq(U.A, E.A, "2031-10-01", "2031-10-15", { policyId: PL.x });          // 10 grant + 5 carry
const feb = await rq(U.B, E.B, "2031-02-03", "2031-02-07", { policyId: PL.x }); await decide(idv(feb), "APPROVED", U.mgrAll);
await lvMod.runLeaveYearJob({ tenantId: TT, systemId: sA.id, asOf: "2031-04-01" });
await decide(idv(feb), "REJECTED", U.mgrAll, "APPROVED");
const sA31 = Number(sum(await txOf({ employeeId: E.A, policyId: PL.x, leaveYear: 2031 })));
const sB31 = Number(sum(await txOf({ employeeId: E.B, policyId: PL.x, leaveYear: 2031 })));
ck("H-2", { octRefused: !oct.ok, aNotNegative: sA31 >= 0, bNoResurrect: sB31 === 10 }, "expiry is honoured by date");
```

## P3 — policy edited between decisions — **FINDING MINOR** (a) · HELD (c, d)
(a) Approve 2 d on 2031-02-10 under yearStartMonth 1 → owner sets yearStartMonth 4 → revoke.
`RESULT a Σ2031=1.0 [GRANT2031:3.0 USE2031:-2.0] · Σ2030=2.0 [ADJUST2030:2.0]` — the revert lands in another leave year; 2031 is permanently short 2 d, 2030 has a +2 orphan.
Fix: in `leaveLedgerInTx` revert, select `{ days, leaveYear, policyId }` from the `use:<id>` row and reuse its `leaveYear`/`policyId` (do not recompute from the current policy). Optional: `updateLeavePolicy` refuses a yearStartMonth change once ledger rows exist (MINOR, owner action; (b) shows the edit opens a fresh 2030 year: `ledger [GRANT2030:3.0 GRANT2031:3.0 USE2030:-3.0 USE2031:-3.0]`, used 6 within Feb–May for quota 3).
```ts
const r = await rq(U.A, E.A, "2031-02-10", "2031-02-11", { policyId: PL.y }); await decide(idv(r), "APPROVED", U.mgrAll);
await settings.updateLeavePolicy(ctx, ov, PL.y, { yearStartMonth: 4 });
await decide(idv(r), "REJECTED", U.mgrAll, "APPROVED");
const rv = await txOf({ sourceKey: `use-revert:${idv(r)}` });
ck("H-3", { year: rv[0]?.leaveYear === 2031, back: sum(await txOf({ employeeId: E.A, policyId: PL.y, leaveYear: 2031 })) === "3.0" }, "revert = USE row's year");
```
(c) `RESULT c foreign-system policyId: refused "ไม่พบประเภทการลานี้ …" HELD`. (d) quota 5→unlimited→approve→5→revoke: `Σ=5.0 [ADJUST2031:5.0 GRANT2031:5.0 USE2031:-5.0]` HELD.

## P4 — races on one balance (≤5 lanes, 90 s bound each) — **HELD**
`RESULT a owner-auto×5 (quota 3, 5 different days): ok=3 refused=balance×2 · APPROVED=3 · Σ=0.0 · events=3`
`RESULT b 3 PENDING + ADJUST −2 → decide(mgr) ∥ decide(mgr2) ∥ bulk(mgr) ∥ decide(mgr2): balanceDecide · balanceDecide · bulk done=1 · stale · APPROVED=1 USE=1 Σ=0.0`
`RESULT c revoke×3 ∥ job: ok=1 reverts=1 Σ=1.0 (want 1.0)`
`RESULT d owner cancel ∥ manager revoke ∥ cancel: status=CANCELLED reverts=1 events(this leave)=2 (APPROVED+CANCELLED) Σ=1.0`
No hang, no deadlock; Σ never below 0; ledger rows = decisions.

## P5 — privacy / attachments — **FINDING MEDIUM** (a) · MINOR (b) · HELD (c, d)
(a) A private ATTACHMENT pdf of the tenant that belongs to another module (`t/<T>/private/dorm-lease-….pdf`, not uploaded by A or for HR) → A attaches it to her own leave → `leaveAttachmentLink` as A.
`RESULT a A attaches a private file of another module (not uploaded by A/HR)=ACCEPTED · link=MINTED /api/files/<id>?…` — any staff who learns a FileAsset id (lease scan, payment slip, CRM file) can launder it into a viewer-bound link for herself (and for every reason viewer of her leave). Other-tenant file refused (`fileBad`), peer → `attachNotYours` (HELD).
Fix: accept only files uploaded for HR leave — e.g. require `path` under `t/<tenant>/private/hr-leave/` (upload path set by the future upload action) or a per-upload owner record; until the upload UI exists (D-H27-attach), the action could be disabled.
(b) Same file attached to a leave in HR system 2 of another employee: `ACCEPTED · link=MINTED` — `fileUsableInTx` counts uses via system-scoped `tx`. Fix: count with `tenantDb({ tenantId })` (tenant-wide).
```ts
const f = await mkFile(TT, `t/${TT}/private/dorm-lease-${tag}.pdf`);             // not an HR upload
const a = await lv("attachLeaveFile", ctx, vOf(U.A), idv(leaveA), { fileId: f });
const b = await lv("attachLeaveFile", ctx2, vOf(U.S2u), idv(leaveS2), { fileId: f2 /* already on a sys-A leave */ });
ck("H-5", { foreignRefused: said(a, T.fileBad), reuseRefused: said(b, T.fileBad) }, "only HR uploads · unused tenant-wide");
```
(c) matrix on A's leave (reason "HUNT-SECRET-REASON"): `peer/pay/member/other-tenant: detail=no link=no bal=balNo · mgrU2: detail=no link=no bal="พนักงานคนนี้อยู่สาขาอื่น" (H1.1, by design) · dec/decAll: detail=row link=no bal=rows · owner: REASON link=MINTED` · `distinct refusal texts: detail=1 link=1` · no attachmentKey in any DTO — HELD.
(d) forged ids across systems: `A→C2 detail=no link=no` · `myLeaveBalances` = own only — HELD.

## P6 — arithmetic · legacy · holidays — **HELD**
`RESULT a 02AM ok · 02PM ok · 02AM overlap · 02F overlap · 03AM 04PM 05AM 06PM ok · 09AM balance · Σ=0.0 · independent 3.0−3.0=0.0`
`RESULT b Mon–Sun, PUBLIC Tue · shopOpen SHOP Thu · template off Wed+Sun → days=3.0 (independent Mon Fri Sat = 3.0)` · `AM on day off = zeroDays · 7h=0.8 · 8h hoursBad · "2.5"h hoursBad`
`RESULT c crossYear refused · 367 d (legacy) tooLong`
`RESULT d legacy OTHER (no policy, no actorUserId): ok 3.0 d, ledger 0/0 after approve · overlap refused · holiday-only zeroDays · past endDate outOfEmployment · PM next to approved AM accepted (Q13)`
`RESULT e preset BE2569 {added 14, skipped 1} · CE2026 again {added 0, skipped 15} · 2028 presetNone · own SHOP row kept`

## Not tested
Chain path (`applyLeaveDecision`) under parallel delivery / after cancel — covered by oracle S5.7/S8.3/S9.1, not re-probed. Leave decide ∥ swap apply ∥ roster moveEntry/publish (roster/swap take no hr-leave/emp keys ⇒ no cycle by reading; S9.4 covers the swap case). AI tools (`pending_leaves`, `upcoming_schedule`) and exports — unchanged by this WO, not probed. Hourly leave is not reachable from the UI (only via a direct row update in P6). The HTTP `/api/files/<id>` route was not called; P5 stops at the minted URL.
