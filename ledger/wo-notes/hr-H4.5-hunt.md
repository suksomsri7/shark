# H4.5 — bug hunt (security · privacy · race) · 14 Nov 2026

Tree `/root/projects/shark-hr` · branch `wip/hr-h4.5` · head e7023d07c · hunter: Claude Opus 5.5 (nothing under src/prisma/scripts/ledger/hr-briefs edited; no commit).
Probe: `scratchpad/h45-hunt/hunt.mts` (P1–P6 in one process, one run). Lane DB only, via
`bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h45-hunt/hunt.mts` (host check: ep-nameless-sea, QC ✓).
LINE = oracle fake (`startFake()`), `lineApiBase() === fake.base` checked before the first send. Outside fetch blocked: **0 blocked calls, 42 requests, all to the fake**.
Jobs called with `tenantId` = the probe tenant only. Residue: `RESIDUE none` + HR/chat/settings/rate-bucket tables 0 for the probe tenant.

## Findings
| # | sev | title |
|---|---|---|
| F1 | MAJOR | Account reassigned ⇒ the new account sees the previous holder's LINE name (stale ACTIVE link) |
| F2 | MINOR | Event switched OFF does not stop queued retries (FAILED/HELD still pushed) |
| F3 | MINOR | LINE switched OFF in DIGEST mode: queued notices stay HELD forever (never SKIPPED/OFF), then sent as a digest when re-enabled weeks later |
| F4 | MINOR | Suspended tenant keeps pushing (retries) and serving the `hr.menu` |
| F5 | MINOR (read only) | Sender does not re-check lease ownership before the push; a batch longer than the 2-min lease is re-claimed and pushed twice (retry key absorbs it at LINE) |

### F1 MAJOR — stale ACTIVE link after the employee row is re-linked to another account
Cause: `src/lib/modules/hr/line-link.ts:239-244` `myLineStatus` returns the ACTIVE link's `ChatContact.displayName` without checking `issuedForUserId === me.userId`;
nothing ends HR LINE links when `HrEmployee.linkedUserId` changes (`src/lib/staff/service.ts:501` link / `:674` revoke have no hook; `endLineLinks` callers = offboard consumer, sender, LINE postback only).
The link is ended only lazily by the notice precheck (`line-notify.ts:227`) at the next send. Same gap in `activeLinkOfContact` (`line-link.ts:107-116`, no employee/user check) ⇒ the previous holder's LINE keeps getting the `hr.menu`; admin chip shows ACTIVE.
Repro (P1b): link E1 (user s1) to LINE contact; set `linkedUserId` null then to new user sX (what revoke + link do); `myLineStatus(sX)`.
Evidence: `P1b newAccount myLineStatus={"ok":true,"state":"ACTIVE",…,"displayName":"ไลน์ลับatt…"}` · `newAccountSeesPrevLINEName=true adminChip=ACTIVE prevLINEstillGetsMenu=true`.
Impact: PDPA — another person's LINE display name (Q14 says only the employee sees their own) + new holder is told they are linked when they are not. Fix idea: filter ACTIVE by `issuedForUserId = me.userId` (and Membership) in myLineStatus/employeeLineStatus/activeLinkOfContact, or end links (ACCOUNT) on link/revoke.

### F2 MINOR — per-event toggle not re-checked before a retry
Cause: precheck `line-notify.ts:222` checks only `policy.enabled`, not `policy.events[eventOfKind(kind)]`. Brief R9 "Off ⇒ queued → SKIPPED(OFF)".
Repro (P4b): IMMEDIATE, roster notice, fake scripted 500 ⇒ FAILED; owner saves ROSTER=false; `runHrLineJobs(+6 min)`.
Evidence: `P4b afterFirst=FAILED · ROSTER off ⇒ retry pushes=1 final=SENT:-` (expected 0 pushes, SKIPPED/OFF). Costs an OA push the owner switched off.

### F3 MINOR — DIGEST + OFF strands HELD rows; re-enable resurrects them
Cause: job claim's HELD-null branch excludes systems whose mode is DIGEST (`line-notify.ts:193-194`), and `buildLineDigests` skips `!policy.enabled` (`line-notify.ts:302`); `saveLineNotifyPolicy` skips nothing. Nothing ever moves them to SKIPPED(OFF).
Repro (P4a): DIGEST on, roster ⇒ HELD; save enabled=false (DIGEST); job 18:00 BKK ⇒ 0 pushes, row `ROSTER:HELD:-`; save enabled=true; job 41 days later at 18:00.
Evidence: `afterOff=ROSTER:HELD:- · re-enabled +41d ⇒ pushes=1 rows=ROSTER:SENT,DIGEST:SENT text=คุณมีแจ้งเตือนใหม่ 1 รายการ`.

### F4 MINOR — tenant SUSPENDED not gated
Cause: precheck (`line-notify.ts:209-233`), `sendClaimed` (`hr-line.ts:107-158`), `onHrPostback` (`hr-line.ts:256-272`) never read `Tenant.status`; the cross-tenant minute job keeps sending.
Repro (P5): FAILED notice (500), `tenant.status = SUSPENDED`, job +6 min, then `hr.menu` postback.
Evidence: `P5 SUSPENDED ⇒ retry pushes=1 final=SENT menuServed=true`. Links need login (blocked for suspended shops) so content risk is low; it spends OA quota of a suspended shop. Platform-wide pattern (notify-customer same) — controller may rule out of scope.

### F5 MINOR (read only, not executed)
`claimLineNotices` sets a 2-min lease (`line-notify.ts:179/188`); `sendAll` (`hr-line.ts:160-168`) pushes each claimed row without re-checking it still owns the lease. A job batch of 50 rows × up to 10 s LINE timeout (500 s) outlives the lease; a later job re-claims the not-yet-sent rows and both workers push. Same retry key ⇒ LINE 409 ⇒ one delivery, but double `lineAttempts`/requests. Not executable deterministically without editing src (send path not exported separately).

## Probes (executed)
- **P1 takeover + reassignment** — attacker types the victim's fresh code from another LINE ⇒ ACTIVE, old link ENDED/RELINK; victim gets +1 in-app "LINE linked" note and sees the attacker's LINE name on own page (can unlink); the old LINE gets no message. Evidence `links=["ENDED/RELINK","ACTIVE/-"] victimInApp+1 oldLINEtold=0 victimSeesName=true`. By design (Q2/Q14) — INFO, not a bug; note the replaced LINE is not told. Reassignment ⇒ **F1**.
- **P2 code limits** — 8 parallel `issueHrLineCode` ⇒ `ok=5 rate=3 PENDING=1` (atomic count-first, no bypass). Code = 8 chars of 31 (≈39.6 bits). Two contacts consuming the same code concurrently ⇒ `ACTIVE=1`, one linked reply + one `LINK_FAILED_TEXT`. Guess-limit sub-probe **inconclusive**: my wrong codes contained `0` (not in the alphabet) so the route treated them as chat text, not guesses (`wrong=0`); 11th-guess cell = oracle S3.7. Read: limit key is per contact `chat-link:<tenant>:<contact>` (`chat/link-code.ts:161`) — no per-OA/tenant ceiling; with 39.6 bits and 10-min TTL not practical — INFO.
- **P3 cap race** — cap 1, two senders blocked on held `hr:linecap:<sys>` (2 waiters seen in pg_stat_activity), released ⇒ `lines=CAP,SENT pushes=1`. Correct.
- **P4 OFF with queued** ⇒ **F3**, **F2**.
- **P5 lifecycle** ⇒ **F4**.
- **P6 matrix + byte scan** — branch manager (u2) on an u1 employee vs unknown id ⇒ byte-identical refusal; own branch ⇒ keys `linkedAt,ok,state` only; plain employee on own id ⇒ refused; `myLineStatus` with forged `employeeId` ⇒ own data. Sentinel scan (all names, unit names, tenant/system/employee/contact ids, LINE ids, slug) over all 42 fake request bodies and all in-app rows ⇒ 0 hits; push altTexts only `ตารางกะของคุณมีการอัปเดต` / `คุณมีแจ้งเตือนใหม่ 1 รายการ`.

## Cells executed vs read only
Executed: takeover via code · reassignment leak · issue-rate parallel · double consume · cap race (held lock) · event-off / shop-off(DIGEST) with queue · suspended tenant · admin matrix (branch/unknown/plain employee/self forged) · body+in-app sentinel scan (ROSTER th, DIGEST th, link/menu replies).
Read only (covered by oracle or code reading): guess limit 11th (S3.7) · shop A code in shop B OA (S3.5) · expired/consumed (S3.4) · 2 drains under row lock (S7.2) · stale SENDING resend (S5.6) · 429/5xx/hang schedule (S5.1–S5.4) · offboard/membership (S6.*) · re-hire (links ENDED stay; nothing reactivates — no code path sets ACTIVE except completeLineLink) · bodies of all kinds × th/en (S2.2/S2.3 pure, S4.* pushes) · link targets as logged-out/other employee/left employee (no HTTP server run; links carry no token, pages self-gated by resolveSelf — not executed) · contact-reuse race between two employees (second tx hits the `(tenantId, chatContactId)` ACTIVE unique ⇒ generic LINK_FAILED, code consumed — acceptable) · F5.
