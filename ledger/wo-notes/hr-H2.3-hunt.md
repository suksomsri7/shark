# H2.3 hunt — wip/hr-h2.3 @ 9dd5120d9 (11 Nov 2026)

6 probes on QC4 (`iso.sh → qc4.sh → with-gate-lock.sh`), each in its own tenant `qc-hr-h23hunt-<p>-…`, swept in `finally`.
Every probe printed `RESIDUE none`. Probe scripts were `scripts/_hunt-h23-{lib,1..6}.mts` and have been deleted.
Aimed at gaps in the 73 oracle checks (S9.2 publishes a *different* unpublished row; nothing builds 500+ rows; nothing tests apply codes ENDED/LEAVE/BRANCH; S6.3 has no swap whose FROM and TO are in different branches).

Verdict: **FIX FIRST** (F1 MEDIUM; F2/F3 can go in the same round).

## P1 — swap on an edited, not-yet-republished row, then a routine publish → **FINDING F1 MEDIUM**
Tried: the row is published, then the manager runs `moveEntry` to change its shift (row becomes `published=false` with `publishedAt` kept). A requests GIVE→B, B accepts, the manager publishes the week, then mgrAll approves.
```
P1a control: decide=ok status=APPROVED holder=B
P1b move=ok published=false publishedAt=set
P1b request on draft row=ok
P1b accept=ok publish=1 decide="กะนี้เพิ่งถูกแก้ไข — กรุณารีเฟรชแล้วลองใหม่" status=CANCELLED holder=A applyRefused=ENTRY_CHANGED
P1c request=ok accept-after-publish=ok decide="กะนี้เพิ่งถูกแก้ไข — …" status=CANCELLED holder=A
```
Cause: `checkInTx` gates only on `publishedAt === null`. `publishRoster` then writes `published/publishedAt` on that row, which bumps `updatedAt` past `swap.createdAt`, and `reassignEntriesInTx` reads that as "changed since request". This needs no unusual timing: create, accept and the in-chain wait all succeed, and then the manager's ordinary "เผยแพร่" silently kills a request that the peer accepted (P1c shows a re-validated accept after the publish). The same thing happens through the chain: the effect returns CANCELLED and the ApprovalRequest stays APPROVED.
Smallest fix (pick one): (a) in `checkInTx`, at create and accept, refuse a row with `published === false` using the existing `T.unpublished` text ("ขอสลับได้หลังผู้จัดการเผยแพร่ตาราง"). This matches R6 "still published". Or (b) in `reassignEntriesInTx`, compare the H2.1 snapshot fields (shift/date/times/unit/employee) instead of `updatedAt`. (a) is one line.
```ts
// regression core (P1b) — expect: request refused T.unpublished, OR decide ok + holder=B
const a1 = await add(E.A, S.m, d1); await publish(d1, d1);
await R.moveEntry(ctx, v(U.owner), a1, { shiftId: S.e });          // published=false, publishedAt kept
const r1 = await SW.requestSwap(ctx, v(U.A), { fromEntryId: a1, targetEmployeeId: E.B });
if (r1.ok) {
  await SW.respondSwap(ctx, v(U.B), r1.id, { accept: true });
  await publish(d1, d1);                                            // routine publish of the edit
  const x1 = await SW.decideSwap(ctx, v(U.mgrAll), r1.id, { decision: "APPROVED" });
  chk(x1.ok && (await holder(a1)) === E.B);                         // today: ENTRY_CHANGED · CANCELLED
} else chk(r1.reason === SWAP_REFUSAL.unpublished);
```

## P2 — direct∥direct approve, approve∥reject, forged and replayed effect → **HELD**
```
round0 APPROVED∥APPROVED: ok | "สถานะคำขอเปลี่ยนไปแล้ว…" status=APPROVED a=B b=A applyAudit=1 event=1
round1 APPROVED∥REJECTED: stale | ok status=REJECTED a=A b=B applyAudit=0 event=0   (rounds 2–3 same shape)
forged: X(foreign requestId)={"applied":false} X=PENDING · Y(approved=false on APPROVED req)={"applied":false} · Y(forged systemId)={"applied":false}
effect×3 parallel: ok,ok,ok Y=APPROVED applyAudit=1 event=1
```

## P3 — state changes between accept and decision → **HELD**, plus **F3 MINOR** (wording)
```
P3a target ENDED: "ไม่พบเพื่อนร่วมงานคนนี้ หรือพ้นสภาพแล้ว" CANCELLED holder=A code=ENDED
P3b target leave: "เพื่อนร่วมงาน ลาอนุมัติแล้ว…" CANCELLED code=LEAVE
P3c borrow withdrawn: "สลับได้เฉพาะคนในสาขาเดียวกัน…" CANCELLED code=BRANCH
P3d requester endDate before to-day: "ไม่พบเพื่อนร่วมงานคนนี้ หรือพ้นสภาพแล้ว" CANCELLED a=A b=C code=ENDED
P3e chain + leave → effect=no-throw status=CANCELLED req=APPROVED code=LEAVE
```
F3 MINOR: in P3d the requester is the one who ended, yet the decider is told the *colleague* ended. Fix: `applyCodeText` should map ENDED on the requester side to `T.toBad` (or a neutral text), the way `checkInTx` already does at create.

## P4 — FROM in u1, TO in u2 (both via borrowing); scope and privacy → **FINDING F2 MINOR**, the rest HELD
```
mgrU1(decider,[u1]): sees=true reason="hunt-secret-reason" toSide=2032-03-02 720-1200 a preview="…อยู่สาขาอื่น…"
mgrU1 decide(REJECTED)="พนักงานคนนี้อยู่สาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ" status=PENDING
mgrRole([u1],no key): sees=true reason=null · bystander: list refused, listMySwaps items=0 · mgrAll: reason + preview ok
refusals: respond(existing)="คำขอนี้ไม่ได้ส่งถึงคุณ" respond(random)=stale · cancel(existing)="ขอสลับได้เฉพาะกะของคุณเอง" cancel(random)=stale
```
F2: Q18 says reason goes to "in-scope deciders", and Q9 defines in scope as *both* entries. `listSwapsForManager` uses `showReason: () => decider` scoped by FROM only. So a u1 decider who cannot decide or preview this swap still reads the free-text reason. Fix: `showReason: (r) => decider && unitVisible(viewer, fromUnit) && unitVisible(viewer, toUnit)`: select `toEntryId`'s unit in the reader, or reuse `unitRefusal` for both entries. The TO-side times showing to u1 readers is allowed by ruling (R10 scopes by fromEntry). Existing id vs random id gives different refusal texts; R7 specifies these texts and ids are cuids, so I accept that.
```ts
// regression core — expect: reason absent for mgrU1 on a u1→u2 swap
await P.hrEmployeeUnit.create({ data: { …, employeeId: E.D, unitId: u1, fromDate: dbDate(d), toDate: dbDate(d) } });
await P.hrEmployeeUnit.create({ data: { …, employeeId: E.A, unitId: u2, fromDate: dbDate(d2), toDate: dbDate(d2) } });
const r = await SW.requestSwap(ctx, v(U.A), { fromEntryId: aU1, targetEmployeeId: E.D, toEntryId: bU2, reason: "secret" });
await SW.respondSwap(ctx, v(U.D), r.id, { accept: true });
const it = (await SW.listSwapsForManager(ctx, v(U.mgrU1), {})).items.find((i) => i.id === r.id);
chk(it && !("reason" in it) && !(await SW.decideSwap(ctx, v(U.mgrU1), r.id, { decision: "REJECTED" })).ok);
```

## P5 — `listSwapsForManager` takes 500 rows before filtering by branch → **FINDING F2b MINOR→MEDIUM**
Tried: 1 open u1 swap, then 500 newer terminal (REJECTED) u2 swap rows.
```
mgrU1 sees it before=true
after 500 u2 rows: mgrU1 sees u1 swap=false (items=0) · with status=AWAITING_PEER filter=true · mgrAll items=500
```
A branch manager's default list goes empty, and even the all-branch view drops the oldest *open* request once history passes 500 rows. Open swaps are the decider's work queue, so they become invisible without a status filter. Fix: push the branch filter into the query (`where: { …status, fromEntry: { unitId: { in: scope.unitIds } } }` when scope ≠ "*"). Then either list open statuses first, or page with a cursor and say the result is truncated.
```ts
// regression core
const r = await SW.requestSwap(ctx, v(U.A), { fromEntryId: aU1, targetEmployeeId: E.B });
await P.hrShiftSwapRequest.createMany({ data: Array.from({ length: 500 }, (_, i) => ({ tenantId: TT, systemId: ctx.systemId,
  requesterEmployeeId: E.D, fromEntryId: dU2, targetEmployeeId: E.C, status: "REJECTED", createdAt: new Date(Date.now() + 1000 + i) })) });
const l = await SW.listSwapsForManager(ctx, v(U.mgrU1), {});
chk(l.ok && l.items.some((i) => i.id === r.id));                  // today: false (items=0)
```

## P6 — races on the TO entry (30 s timeout on each call) → **HELD**
```
decide∥removeEntry(to) ×3: decide=stale remove=ok status=CANCELLED a=A b=GONE  (no half-swap, no hang)
accept∥moveEntry(to) ×3: accept=stale move=ok status=CANCELLED pendingReq=0
decide∥copyWeek(dup for target) ×2: decide=ok status=APPROVED B rows on (d,m)=1
```
In every run, remove and move won the race (I did not force an interleaving with an advisory-lock holder). Locks are taken in a fixed order: `hr-swap` first, then roster keys, and H2.1 paths take roster keys only. Read alongside S4.6/S4.8/S9.1, I see no deadlock path.

## Not tested
- Leave approval racing a swap apply. The leave effect takes no roster key, so `onLeave` is check-then-act. The same race exists for H2.1 roster writes, so it is outside H2.3.
- R7 asks for the decider scope to be checked with `unitTargetOf` for both employees on both dates. The code checks the entries' `unitId`. Apply re-checks BRANCH, so the outcome is safe (P3c), but the wording differs from the brief.
- The UI / server-action layer, beyond reading `swap-actions.ts`: tenant comes from the session, systemId from the form, and the service filters on (tenant, system).
