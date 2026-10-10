# C4.4 oracle round 4 — independent review (read-only)

**Verdict: NOT MERGEABLE (R4-B1)** — plus SHOULD-FIX R4-S1..S4 before the next acceptance run.

Scope: `git diff 0fa2a00c 7e67abd4 -- scripts/crm-journeys` (HEAD b54eed11 has the same journey files), author notes
"Round 4 (30 Sep)", `.qc-shots/crm/c44-r4/all-journeys.log` (JSON_SUMMARY 89/92, 0 B1 aborts), screenshots US4/US5/US9.
Nothing run, nothing edited except this file.

---

## BLOCKER

**R4-B1 — US9-3 (retroactive binding) passes only because of the harness setup. The product's own setup would fail.**
`US9.mts:43` (shop page links to `/f/<token>` on the **shop host**) + `US9.mts:54-60` (forwarder serves the whole SHARK
app under the shop host). The author says so in `US9.mts:18-19` ("the form must be on the same host … because the
binding reads the first-party `sd_vid` cookie of the FORM request").
- Verified in the code: the tracker writes `sd_vid` as a host-only first-party cookie on the shop page (`tracking.ts:1455` `put()`,
  no `Domain=`). The form action reads `sd_vid` only from its own request's cookies (`(store)/f/[token]/actions.ts:19-25`).
  The tracker never passes the visitor id to form links or iframes: `tracking.ts:1520-1537` only has `sd_ct` for mail tickets.
- The form embed code the product gives the shop (`forms/service.ts:390-394`, shown as "โค้ดฝังบนเว็บของร้าน" in
  `FormTargetsTable.tsx:164-166`) is `<iframe src="<APP_URL>/f/<token>">`. That request goes to shark.in.th with
  shark.in.th cookies, so it never carries the shop's `sd_vid`. A plain link to shark.in.th/f/… behaves the same.
  Custom domains (`proxy.ts:39-42`) don't help either. SHARK doesn't serve the shop's own pages, so no supported
  topology puts the tracked pages and `/f/` on one host.
- Result: in production, retroactive linking never happens for any shop that follows the product's instructions. US9-3
  reports ✅ for the story's core promise, which is a false green. Author observation 5 calls this "design". It is a
  product bug.
- Change: the shop page must paste the form embed code **read from the UI** (`crm-forms-embed-<formId>`) verbatim, i.e.
  an iframe to QC BASE, and drop the `/f/` forwarding. Evaluate US9-3 on that page, expected ❌ PRODUCT BUG. File it as
  a BUG (HIGH) in the fix list, not an OBSERVATION. If the same-host variant is useful as a diagnostic, keep it as a
  separately-named check marked informational/not-a-story-pass.

## SHOULD-FIX

**R4-S1 — `US4.mts:199,212-221`: every non-READY state is recorded as 🟧 GAP.** That includes `SECTION-ABSENT` (the
section is missing after save) and `not-reached`, plus `UNAVAILABLE` showing the **OFF** text (i.e. the SETUP
`setCrmAiKey` did nothing). A regression in the modal or the SETUP would show as the known gap. Change: record a gap
only when `aiUiState==="UNAVAILABLE" && aiUiText === CRM_TRANSCRIBER_MISSING_MSG` (`calls-shared.ts:145`). Every other
non-READY state should be a plain ❌.

**R4-S2 — `US4.mts:139-144` SETUP `setCrmAiKey` would hide half of the gap later.** The SETUP is acceptable today: no
check passes because of it, and US4-5/5c don't depend on it. But once an STT provider is registered, the READY branch
would turn US4-5b green while there is still **no UI** to turn `settings.crm.ai.callTranscribe` on (verified:
`setCrmAiKey` has no caller in `src/`, and the CRM settings index has no AI section). At that point the SETUP would be
doing the product's job. Change: add a separate red-for-gap check, e.g. US4-5d "the CRM settings expose a call-transcription
toggle", driven by looking for it in the UI.

**R4-S3 — `US8.mts:214-224`: the rule-opened side deals are registered once, but the system-wide field_due rule stays
enabled until `--clean`.** Only `ctx.own("automationRule")` exists (`US8.mts:146`). Nothing disables or deletes the
rule in the journey. Any later `runCronTriggers` on QC1 (other suites, other lanes) before `--clean` opens more
`(qc-jrn-us8)` renewal deals that no manifest holds, which is the same leak class this round fixed. Change: disable or
delete the rule in a `finally` at the end of US8, then take the side-deal snapshot. Also let `--clean` sweep
`crmDeal.title contains "(qc-jrn-us8)"` as a fallback.

**R4-S4 — `lib.mts:263-264`: `--ignore-certificate-errors` is browser-wide and on every launch, even when US9 isn't
selected.** Today it doesn't widen what can leave the machine: B1 still aborts every non-allowed origin. But it removes
a second barrier on the one harness that already had a prod-posting incident. Anything B1 cannot intercept (browser
background traffic, keepalive after unload) would also skip TLS validation. Change: generate the shop key/cert at
launch and use `--ignore-certificate-errors-spki-list=<spki sha256>`. Add both flags only when US9 is in the selected
set.

## NOTE

- **N1 `US9.mts:217-219`** decline counts are read right after `page.close()` with no settle/poll. `/t/e` writes
  synchronously (`t/e/route.ts:53`), so the risk is small. A late keepalive write could still be missed and give a
  vacuous 0. Add a ~2 s settle, or re-read until two reads agree.
- **N2 `US9.mts:193-194`** US9-2b checks only the **events** half of the US9-4 query. The **sessions** half
  (`firstUrl contains marker`) has no control. `recordConsent` does set `firstUrl=url` with utm kept
  (`tracking.ts:~934/946`), so it works today. Add "≥1 session with the `-accept` marker" to US9-2b.
- **N3 US5-3/3b/4/5** run on the SETUP message, whose body has a hand-written anchor. That is legitimate: same
  `sendEmail → sendCore → composeOutgoing → deliver` as the UI action (`emails-actions.ts:~85`, `emails.ts:1412`),
  real `/t/o` and `/t/c` routes, and the runner's `appUrl()` equals the QC origin (no rewrite logged). But the check
  names should say "API/template-shaped mail". Consider a US5-3a variant that picks a template containing a link
  (`EmailComposer.tsx:48`), which is stronger evidence than a typed URL.
- **N4 obs 4 severity (suspected, not verified)**: `deliver()` sets `Message-ID: <rfcId>` and `core/email.ts` forwards
  headers to Resend. If Resend replaces a custom Message-ID, every real reply falls through to the `+t` / subject match
  (`emails.ts:2084-2106`), which never sets `parent`. Then no `repliedAt` and no stop-on-reply in prod
  (`emails.ts:2186-2196`), while QC's stubbed transport shows US5-6b/US5-7 green. Needs one check against a real
  Resend send. The product fix is cheap either way: a `+t` match can take the thread's latest OUT as parent.
- **N5** `all-leftover.log` / `us8-leftover.log` show `fileAsset:-1`: the probe query errored, so "0 rows from round 4"
  is unverified for FileAsset. `all-clean.log:24 fileAsset -0` only means `removeRecording` had already run. Fix the
  probe (`FileAsset.path` ~ `t/<tenantId>/…`). Also note the `--clean` fallback deletes the DB row only, not the stored
  object.
- **N6** Stale screenshots from earlier runs share the story folders (US4 `06-*`, US9 `04-*`, `05-04-form-submitted`).
  Wipe each story's folder per run so reviewers can't mix up rounds.
- **N7** After the restore, `crm.tracking.web.enabled=true` (leftover probe). Confirm this was the baseline before
  C4.4 and not a leak from rounds 1-2, which ran before the path-scoped restore.
- **N8** 45 unmanifested `qc-jrn-*` rows from 28 Sep (1 sequence, 2 formDefs, …) still pollute QC1. That's the
  controller's call, but US5/US9 lookups by name/tag could collide with them.

---

## Answers by question

**Q1 — can the new assertions fail?** (verified by reading code/logs)
- US9-4: the control uses the same query shape on events against a different marker/visitor (`-accept` vs `-decline`,
  isolated contexts at `US9.mts:143,206`). A real control for events. Sessions are uncontrolled (N2). Timing: N1.
  `declineClicked` and `bannerOnNextPage` are asserted, so "script never ran" can't pass.
- US5-4/5: exact counts (2/1) on the id the capture returned. A null id gives null≠2, which fails. Not vacuous. The
  pixel responses were `[200,200]` and the redirect chain was `302 → 200 /b/<slug>/login` (log 143-147).
- US5-7a/7: 7a reads the DB status before ingest. 7 pins `stoppedReason: "REPLY"`, and only the parent path produces
  that (`emails.ts:2186-2196`). Real.
- US4-5c: the CALL is looked up on this run's own deal (`US4.mts:49`). Real. US4-5b gap routing: R4-S1.
- US9-1b: the domain add persists through a server action (`TrackingSettingsForm.tsx:180-186` → `saveTrackingWeb`), so
  `stored:false` is meaningful. The inline error could in theory be left over from the earlier save click. Minor.

**Q2 — does SETUP do the product's job?**
- (a) US5 re-send: no. Same composition and routes. It only swaps the body for one the UI can't produce (N3).
- (b) US9 TLS shop + forwarder: Origin, Host and cookies are **not** rewritten (`US9.mts:55`). Only
  `x-forwarded-proto` is added. Beacons go straight from the page to QC `/t/e` with the real https Origin, so the
  tracker, `/t/e` and `/t/consent` are proven. **But the `/f/` forwarding creates a same-host form topology the product
  doesn't offer, so US9-3 passes where production fails → R4-B1.**
- (c) `setCrmAiKey`: fine today, R4-S2 for the future.
- (d) In-Reply-To/References injection: legitimate, since real clients send them and the id is the one `deliver()`
  put in `Message-ID`. Caveat N4.

**Q3 — safety** (verified): B1 only adds `extraAllowedOrigins` (`lib.mts:538`). The one exception is
`https://qc-jrn-shop…test:<ephemeral port>`. It is added after the server listens (`US9.mts:134-135`) and removed in
`finally` (`US9.mts:223-226`), which also covers the early `return` at :160. The forwarder's destination is hard-wired
to `qc.hostname:qc.port`, with no upgrade handler and no DNS. `--host-resolver-rules` maps only `SHOP_HOST`, and `.test`
never resolves publicly. Staff pages share the exception, but no staff page is open while the shop runs (owner page
closed at :114). Even if one were, the exception reaches only the forwarder, i.e. QC. 0 B1 aborts in the log. The only
weakening is the global cert flag (R4-S4).

**Q5 — cleanup** (mostly verified): US4 `crm.ai` and US9 `crm.tracking` have path-scoped restores in `try/finally`, and
the probe shows `crm.ai=null` and `domains=null`. The recording is removed by the product's `removeRecording`, with a
DB-only fallback in `--clean`. US8 side deals and their activities cascade (`crm.prisma` CrmActivity.deal
`onDelete: Cascade`), and rule runs cascade via `journeyId`. Gaps: R4-S3 (the live rule until `--clean`), N5 (FileAsset
probe broken), N7.

**Q6 — green journeys**: nothing weakened. `newAnonPage()` without `isolated` is unchanged, and the B1 set is empty
outside US9. `CLEAN_ORDER` only gained `fileAsset` (no FK from crmActivity). The only side effect on other stories is the
global chromium flags (R4-S4), and no other journey loads https.

## Q4 — classification
- **US5-3a = real product bug (verified).** `EmailComposer.tsx:98-103` HTML-escapes the textarea into `<p>` text,
  `:48` strips every tag from a picked template, and `composeOutgoing` (`emails.ts:921-931`) wraps only
  `href="http(s)…"`. No linkify step exists anywhere in crm or core (grep). Severity MED: typed URLs are still
  clickable (autolinked, untracked) in most mail clients, but template links are destroyed.
- **US4-5b = product gap (verified).** `registerCrmTranscriber` and `setCrmAiKey` have no caller in `src/`,
  `callAiStatus` returns OFF or NO_PROVIDER (`calls.ts:350-353`), and the screenshot `US4/07-04` shows the
  "ยังไม่ได้เชื่อมบริการถอดเสียง" state after a saved call with a recording. US5-0-GAP (no "compose new thread" UI, the
  composer lives only in `EmailThread.tsx:193`) is also correctly a gap.
- **Author observations:** 3 (`CRM_CALL_AI_OFF_MSG`, `calls-shared.ts:147`, points to "ตั้งค่า CRM → ผู้ช่วย AI",
  which doesn't exist) is real, LOW. 4 (a reply matched only by `+t` or subject never sets `parent`, so no
  `repliedAt` and no sequence stop) is real in code, and its severity depends on N4: LOW if Resend keeps Message-ID,
  HIGH if not. 5 is real and **understated**: it is a HIGH product bug that kills US9's retroactive linking for every
  documented embed, and US9-3 must report it (R4-B1).
