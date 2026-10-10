# crm-C5.5-fix9 — hunt-3 H3-2 (person export truncates) · H3-3 (erase stops at caps) · fixed-`take` sweep

Tree `/root/projects/shark-crm-c54d` branch `wip/crm-cf12` from 8cc1778a (= 53d88b71 + hunt-3 note/probe) · QC3 only · 2026-10-01, finished 23:28 UTC.
Probe `scripts/pending/cf12/probe-cf12.mts` (own tenant `qc-cf12-*`, CLEAN 0 rows) · verify `scripts/pending/cf12/run-verify.sh` (run as a /tmp copy).
`ingestInbound` / `crm/emails.ts` not touched (H3-1 lane).

## RED → GREEN
| run | controls | finding checks |
|---|---|---|
| probe-cf12 on 8cc1778a (unfixed) | 7/7 green | **10/12 RED** (X1–X5, E1, E3, E4, E5, F1, F2 RED; E2 green — see note) |
| probe-cf12 on the fix | 7/7 green | **12/12 GREEN** |
| hunt probe `probe-hunt3` on the fix | 6/6 green | X1.1 flipped → "not reproduced" · S1.2/S1.3/S1.6 still REPRODUCED (H3-1, other lane — expected) |

E2 (portal-request cards beyond 5,000) passed on unfixed code because the unordered `take: 5_000` happened to include the 5 token rows;
E5 (added) makes the same defect deterministic: on unfixed code the erase follow-up held 4,995 of 5,000 approval ids, on the fix 5,000.

## 1 · H3-2 LOW — person export (`privacy.ts` `exportContact` ~1075-1300)
- What: every table is read in keyset pages (`id < cursor`, ORDER BY id DESC, page 1,000) until a short page — `readAllPages`. Web events
  are read through the session relation (`session: {tenantId, contactId}`), not an id list, so they no longer depend on the session subset;
  file links of ALL visible activities (activity ids paged, links per page) + contact/record links, merged newest-id first (`fileLinksOf`).
  Small unbounded tables (company links, consents, deals, portal access/requests, enrollments, records, values) keep no cap and got a
  stable `orderBy`. Forms: facade `submissionsOfCrmContacts` is now one page (`{take, beforeId}`, id DESC) + new `countSubmissionsOfCrmContacts`.
- Design (delivery): the bundle goes back as one JSON string from a server action (`exportContactAction` → browser Blob); there is no stream
  path. So a per-table ceiling stays — `PERSON_EXPORT_TABLE_MAX = 50,000` (10× the old 5,000; 2.5× the old web-event 20,000) — but it is
  explicit: memory ≤ ceiling + 1 page per table; a table over it keeps its newest rows and the bundle carries `complete: false` +
  `truncated: { <table>: { exported, total } }` (total = `count()` with the same where). Complete exports carry `complete: true` and no
  `truncated` key. Audit `crm.contact.export.person` now records `tables` (exported counts) + `complete` + `truncated` (exported AND total).
  `ContactExportBundle` (privacy-shared) gained `complete` / `truncated?` (additive). The action returns `complete`/`truncated` and the
  360 privacy block shows a warning naming the cut tables instead of the plain "downloaded" text. `exportContact(…, opts?)` takes
  `{tableMax, page}` for tests only (clamped to the defaults; the action never passes it).
- Deterministic: same rows, same order twice (X2 byte-identical tables; X6 page 3 vs default identical).
- Evidence: X1 5,100/5,100 score logs + complete:true (unfixed 5,000, no marker) · X3 audit 5,100 · X4 ceiling 100 → `{exported:100,total:5100}`,
  the 100 = first 100 of the full export · X5 audit records both counts.
- Not an API op (no REST surface for the person export) ⇒ CRM docs unchanged; `gen-crm-api-docs --check` green.

## 2 · H3-3 — erase loops until done
- kanban `links.ts` (~467-640): `MASK_CARDS_MAX` removed. `maskCardsLinkedInTx` pages link rows (id ASC) and masks each page's not-yet-seen
  cards; `maskCardsInTx` pages cards, then comments and history per card page (all keyset id ASC); `redactCardsInTx` takes any number of
  ids (chunks of `batch`; old titles/descriptions of the whole list are read first so a comment quoting another card's title is still
  replaced); `maskCardsBySourcePrefixInTx` takes any number of prefixes (500 per OR query). New optional `{ batch }` (default 2,000 = old cap,
  clamped 1..2,000). Still the only writer of kanban tables; crm calls it only through `@/lib/modules/kanban/links` as before (F2 green).
- portal `portal.ts`: `eraseContactInTx` pages requests (id ASC, `batch` default 5,000), redacts each page's cards BEFORE the request rows
  are deleted, collects every approval id; sessions deleted via the `portalAccess` relation (the 1,000-access id list is gone). The legacy
  `portal.eraseContact` pages its request read the same way and drops its 1,000-access cap.
- forms `service.ts` `eraseCrmContactSubmissions`: loops pages (id ASC, `batch` default 5,000) — identity collected from every row,
  `updateMany` per page (was: first 5,000 unordered rows, rest silently untouched).
- privacy `eraseInTx`: `PrivacyDeps.batch` (tests) → every loop (kanban ×3, portal, forms, audit, automation runs). Audit-trail scrub
  (sweep find, see §3): pass 1 pages all rows (id ASC) keeping only ids + former identity, pass 2 scrubs by id chunks — the old code
  scrubbed the first 5,000 by createdAt and its WARN said "erase again to continue", but a re-erase took the same 5,000 again.
- Design: the erase stays ONE transaction (existing design: commit = erased); each loop runs to a short page inside it; masking is
  idempotent so a failed tx rolls back whole and the retry (re-erase / resweep) redoes everything. Bound: memory per page; time is the
  60 s `TX_OPTS` timeout — a person with very large sets fails loudly (rollback, error to the caller), never "erased" with rows left.
  Measured: erase with 2,005 linked cards + 5,005 portal requests + 5,005 audit rows + 5,005 form rows committed inside the 60 s tx
  (whole call 169 s, most of it the post-commit cancel of 5,000 approval ids in `completeErasure`, 1 query each).
- Evidence: E1 (cards beyond 2,000: title/comment/history) · E3 (audit rows beyond 5,000) · E4 (forms beyond 5,000) · E5 (all 5,000 approval
  ids) · F1 redactCardsInTx 2,000 unknown ids + 3 real → 3 redacted · F2 2,000 prefixes + real → masked · B1/B2/F3 batch 3 over 7/6-row
  sets: 0 left, resweep idempotent.

## 3 · Sweep — fixed `take` / LIMIT on export, erase, person helpers, consent lists, erase call-outs
| where (fix tree) | cap | verdict |
|---|---|---|
| privacy.ts exportContact (7 tables + file links) | 5,000 / 20,000 unordered | FIXED (§1) |
| privacy.ts audit trail scrub `AUDIT_SCRUB_MAX` | 5,000, re-erase repeats same rows | FIXED (§2) → `AUDIT_SCRUB_PAGE` page size |
| privacy.ts `notThePerson` holders `LIMIT 200` (~425) | (holder, address) pairs | FIXED: the "address held by someone else" set is a DISTINCT-address query without LIMIT; LIMIT kept only on the WARN holder list (≤ 20 per address). Old effect: a shared address could fall out of the set ⇒ masked in OTHER people's mail (over-erasure). Code-read, not executed |
| privacy.ts `onMemberErased` 50 rounds × 100 (~1031-1066) | 5,000 linked contacts | FIXED: a full last round ⇒ throw (event retried, erased ones skipped) instead of returning success. Not executed |
| forms `eraseCrmContactSubmissions` / `submissionsOfCrmContacts` | 5,000 | FIXED (§1/§2) |
| kanban `maskCardsLinkedInTx` / `redactCardsInTx` / `maskCardsBySourcePrefixInTx` / `maskCardsInTx` | 2,000 | FIXED (§2) |
| portal `eraseContactInTx` / legacy `eraseContact` requests 5,000 · accesses 1,000 | | FIXED (§2) |
| privacy.ts `mergedChain` 20 levels / 1,000 per level (~338) | merged chain | KEPT: not silent (OpsEvent WARN with ids, review C3.9 N3 decision); the rest are separate contacts erasable directly; > 1,000 merges into one person per level is not realistic |
| privacy.ts `SECOND_SET_MAX` 500 (~394, 637) | unlinked mails with his address | KEPT: deliberate all-or-nothing (B1(c) decision) + WARN; > 500 hits means the address is probably not his alone |
| privacy.ts `buildTenantExport` `tenantExportRowsPerTable` (~1353) | whole-system export | KEPT, out of scope: a business export with a documented hard cap, not a data-subject export. Note for C6: it has no truncation marker either |
| privacy.ts `retentionLeads` LIMIT 200 × 50 rounds · `purgeExports` 100 × 20 rounds · `runExportJobs` LIMIT 1 · `listMyExports` 5 | | KEPT: per-run budgets of daily jobs (next run continues; skipped ids WARN) / UI list |
| consents.ts `latestCrmStates` 500 · `history` 200 | | KEPT: hunt-3 already sound (send path fails closed) / UI history newest-first; the person export reads consents without a cap |
| party `countPartyHolders` · meeting `maskSystemMessagesInTx` · approval `cancelRequest` | none | sound |
| emails.ts `shopMailAddressesInTx` `take: 50` systems · `take: 2,000` user settings (emails.ts:450/456) | | NOT EDITED (emails.ts belongs to the H3-1 lane): > 2,000 per-user mail settings ⇒ some shop addresses are not recognised as shop ⇒ masked/stripped in mails during an erase (over-erasure of shop addresses, not a leak). For the other lane / C6 |

## 4 · INFO for the other lane — forged inbound mail still moves last-activity (not changed here)
- `src/lib/modules/crm/emails.ts:2592-2603` (fix tree = 53d88b71): inside the ingest tx, `activities.recordSystemActivityInTx(tx, ctx, { contactId,
  companyId, … })` is called for every IN mail with a contact — `unverifiedFrom` (computed at :2532) is not passed/checked.
- `src/lib/modules/crm/activities.ts:1375` → `touchLastActivity` `:462-470`: `companies.touchLastActivityInTx` + `UPDATE "CrmContact" SET
  "lastActivityAt" = GREATEST(…)` unconditionally.
- Privacy side effect worth knowing: the lead-retention anchor is `GREATEST(COALESCE(lastActivityAt, createdAt), createdAt)`
  (`privacy.ts` `retentionLeads`) ⇒ forged mail in a lead's name can also postpone that lead's retention erase/warning.

## Verification (QC3, `/tmp/cf12-logs/v1.summary`, each step iso.sh + gate lock)
- `pnpm typecheck` exit 0 · probe-cf12 7/7 + 12/12 · probe-hunt3 controls 6/6, X1.1 flipped.
- qc-crm-c3.9 (C3.9 privacy/PDPA) 49/49 · qc-crm-c3.5 (portal incl. requests/erase) 67/67 · qc-form 10/10.
- qc-kanban-k3.1 (links) 19/20 — red K3.1-S6.3 = "≥ 3 screenshots in `.qc-shots/kanban/3.1`"; that gitignored folder does not exist in this
  worktree (file-count check, independent of code) ⇒ same at 53d88b71.
- qc-crm-c5.3 not run: the suite refuses anything but QC2 (`C5.3-ENV`), and this card is QC3-only.
- fitness 39/39 with env and 39/39 without env.
- docs `--check`: crm green · member / kanban / account red only because the gitignored `.claude/skills/shark-*-api/references/endpoints.md`
  files are absent in this worktree (0 bytes on disk); not created/deleted.

## Also on prod main (929c39ce)?
Same caps exist on main (`take: 5_000` in privacy.ts, `MASK_CARDS_MAX`, `SUBMISSION_ERASE_MAX`, `AUDIT_SCRUB_MAX`, portal 5,000/1,000,
`LIMIT 200`) — all on the CRM v2 export/erase paths, which are not reachable on prod today (as hunt-3 found).

## Not verified
- UI: the 360 privacy block warning text was not rendered in a browser (no visual QC).
- `notThePerson` and `onMemberErased` changes: code-read + typecheck + suites only (no probe at 200+/5,000+ scale).
- A real person over the 50,000-row export ceiling (ceiling path proven with an injected 100); erase above ~60 s of work (would roll back, by design).
- qc-crm-c5.3 (QC2-only suite).

---

# Round 2 — review M1 · M2 · M3 · L2 · I2 (review note `crm-C5.5-fix9-review.md`, tip 268c7716)

Probe `scripts/pending/cf12/probe-cf12-r2.mts` (own tenant `qc-cf12r2-*`, CLEAN) · verify `scripts/pending/cf12/run-verify-r2.sh` (run as a
/tmp copy, summary `/tmp/cf12-logs/r2v1.summary`). Not in this round: L1 (byte ceiling / file lane), L3/L4 (other lane's files).

## RED → GREEN
| run | controls | finding checks |
|---|---|---|
| probe-cf12-r2 on 268c7716 (unfixed) | 4/5 (T4 red on old code by construction: the old erase ignores the injected timeout and succeeds at once, so the "retry" was a resweep — T4 was then changed to "contact erased after the retry", which holds on both) | **10/10 RED** |
| probe-cf12-r2 on the fix | 5/5 | **10/10 GREEN** |
| reviewer `probe-cf12-review.mts` | 17/17 | **T2 NOT-REPRODUCED · U1 NOT-REPRODUCED** (were REPRODUCED) |
| reviewer `probe-cf12-review-chain.mts` | CLEAN | **C1 NOT-REPRODUCED** (was REPRODUCED) |
| reviewer `probe-cf12-review-scale.mts 500` | CLEAN | 1,500 kanban rows changed in 15.7 s = 10.5 ms/row ⇒ ≈ 5,700 rows / 60 s |
| round-1 probe-cf12 | 7/7 | 12/12 (E erase now 46.5 s for the whole call, was 169 s — approvals bulk) |
| hunt probe | 6/6 | X1.1 stays "not reproduced" · S1.* REPRODUCED (H3-1, other lane) |

## M1 — export honesty (privacy.ts `exportContact`, `withheldByVisibility`, `fileLinksOf`)
- (b) merged chain = BUG, fixed: the export resolves the chain with the erase's own `mergedChain` and reads every table for
  `[id, ...chain]` (score logs, forms, consents, activities, mails, web sessions/events, clicks, portal, enrollments, records + values,
  file links). `scope.mergedContactIds` lists the absorbed ids; a chain over the merge caps sets `scope.mergedChainIncomplete` and
  `complete:false`. Probe C1: forms 4/4 · scores 4/4 · consents 2/2 · `complete:true`.
- (a) requester visibility = NOT widened. After reading, numbers only: activities/deals of the chain in this system minus what the
  requester's `activityWhere`/`dealWhere` returns, file links of hidden activities, sensitive custom values for non-owners. Any > 0 ⇒
  file `complete:false` + `scope: { limitedByRequesterVisibility: true, withheldTables: [...] }` (table names only — no withheld counts
  or rows in the file); audit row gets `withheld: { table: n }` + `scope`. OWNER (sees all) ⇒ unaffected (probe V1). Note: a non-owner
  always gets `complete:false` once the person has any sensitive custom value (by-design omission, now stated). Probe V2/V3.
- UI (`ContactPrivacyBlock.tsx`): the warning lists the reason(s): rows cut at the file size ceiling (newest kept), rows outside the
  requester's visibility "ให้เจ้าของร้านเป็นผู้ส่งออก" if a full file is needed, merged chain over the cap; ends "แจ้งเจ้าของข้อมูลด้วยว่าไฟล์ไม่ครบ".
- Owner/legal question (open): should a PDPA access export ignore the requester's visibility (owner/explicit PDPA key with full scope)?

## M2 — erase over the transaction limit (privacy.ts `eraseContact`, `isTxTimeout`)
- The single transaction stays (all-or-nothing). Its failure by time (`P2028` / "Transaction already closed" / "expired transaction";
  not "Unable to start a transaction" = pool wait) now: (1) `logOps("ERROR", "crm.privacy", …)` — ERROR level = the ops alert path
  of `logOps` (throttled mail to the team), detail = `{contactId, systemId, source, elapsedMs, timeoutMs}` only; (2) audit row
  `crm.contact.erase.failed` (actor = clicker or SYSTEM, `after = {systemId, source, failure:"TIMEOUT", elapsedMs, timeoutMs}` — no
  reason text/name/phone; not the "erased" flag action); (3) `PrivacyError("TOO_LARGE")` — new code in `PrivacyErrorCode` — Thai
  message "ข้อมูลของผู้ติดต่อนี้มีมากเกินกว่าจะลบให้เสร็จในครั้งเดียว — ระบบยกเลิกการลบทั้งหมด (ยังไม่มีข้อมูลใดถูกลบ) และแจ้งทีมงานแล้ว ·
  การกดลบซ้ำจะไม่ช่วย", shown as-is by the action's `failOf`. Test seam `PrivacyDeps.txTimeoutMs` (≤ 60 s; the action never passes it).
  Probe T1–T4; reviewer T (real 60 s limit, lock held 75 s): now `PrivacyError TOO_LARGE` after 73.6 s, OpsEvent written (T2 flipped).
- **Regression window (for the owner):** before this card the caps bounded the work, so a person whose data exceeded the caps but whose
  CAPPED work fit in 60 s WAS erased — with leftovers beyond the caps (+ WARN for the audit part only). Now the erase covers everything,
  so the same person may exceed 60 s and NOTHING is erased (rollback) until someone acts. Budget measured from this host: ≈ 10.5–10.6 ms
  per changed row ⇒ ≈ 5,600–5,700 identity-bearing rows per erase (reviewer scale probe 500 cards → 1,500 rows in 15.7 s). Also
  measured: the round-1 E fixture (2,005 links + 5,005 requests + 5,005 audit + 5,005 form rows, only ~25 rows changing) spends ≈ 45 s
  of the 60 s even unfixed (the same 45 s on 8cc1778a) — fixed per-erase cost on large tenants/sets is not only "changed rows". Prod
  latency per statement is lower (not measured). Decision needed: is a resumable multi-step erase card wanted? (not built here).

## M3 — approval cancels (approval `cancelRequests`, portal `cancelErasedApprovals`, privacy `eraseContact`)
- `approval/service.ts#cancelRequests(ctx, ids)` + facade export: `updateMany where id IN chunk(1,000) AND status = PENDING` →
  `CANCELLED` + `decidedAt` — the exact semantics of `cancelRequest` (it has no events/notifications; checked), idempotent and
  resumable (only still-pending rows). `cancelErasedApprovals` uses it (1,500 ids: 69 ms, was 35.8 s).
- `eraseContact`: commit = erased. The inline post-commit step runs only when the follow-up has ≤ 100 files
  (`INLINE_FOLLOWUP_FILES_MAX`; files are deleted one storage call each); above that the answer is `followUp:"PENDING"` at once and
  the existing `crm.contact.erased` outbox consumer (`onContactErased` → `completeErasure`, retried until it succeeds, every step
  idempotent) finishes. Errors in the inline step still answer `erased:true, followUp:"PENDING"` (unchanged). No new queue.
  Probe A1–A4 (erase with 1,203 approval ids: 0.96 s, was 28.2 s).
- Remaining (not in this card): `completeErasure` still deletes files one call each — a person with thousands of files can still
  exceed one outbox delivery (60 s) and re-start from the first file on redelivery (each delete is idempotent, so it converges only if
  a delivery finishes); noted for C6.

## L2 — truncation decided by paging (privacy.ts `readAllPages`)
- `cut` = a row beyond the ceiling was actually read; `total = max(count(), rowsRead)`. Seam `ContactExportOpts.beforeCount` (tests only)
  deletes 5 rows between paging and the count: marker kept `{exported:10,total:11}`, `complete:false` (probe L1). A pure race cannot be
  reproduced on the old code (L1 is RED there only because the seam does not exist).

## I2 — UI text
- Removed "ติดต่อทีม SHARK เพื่อขอส่วนที่เหลือ" (no such procedure). Now: "ดาวน์โหลดไฟล์แล้ว แต่ไฟล์นี้ยังไม่ใช่ข้อมูลทั้งหมดของผู้ติดต่อนี้ — <reasons> ·
  แจ้งเจ้าของข้อมูลด้วยว่าไฟล์ไม่ครบ" where <reasons> ∈ { "บางตารางมีข้อมูลมากเกินกว่าจะใส่ในไฟล์เดียว ไฟล์จึงมีเฉพาะแถวใหม่สุด (<table> n จาก N แถว …)",
  "บางรายการอยู่นอกสิทธิ์การมองเห็นของบัญชีคุณจึงไม่อยู่ในไฟล์ (<tables>) — ถ้าต้องการไฟล์ที่ครบ ให้เจ้าของร้านเป็นผู้ส่งออก",
  "ผู้ติดต่อที่ถูกรวมเข้ามามีจำนวนมากเกินเพดาน ไฟล์จึงยังไม่รวมทุกคน" }.

## Verification (QC3 · iso.sh + gate lock)
- `pnpm typecheck` (5120 MB) exit 0 · fitness 39/39 with env and 39/39 without env ·
  `gen-crm-api-docs --check` green (no REST op changed).
- qc-crm-c3.9 49/49 · qc-crm-c3.5 67/67 · qc-form 10/10 · qc-approval (incl. AP-4.2 cancel) 16/16.

## Owner / legal questions (open)
1. PDPA access export limited by the requester's visibility (now stated in the file) or full scope regardless of requester?
2. Erase contract: all-or-nothing in one 60 s transaction (now loud: ERROR + failed audit + TOO_LARGE) or a resumable multi-step erase card?
3. (L1, not this round) big person exports through the private-file export lane instead of one JSON string.

## Not verified (round 2)
- UI warning rendering (no browser); the real 60 s timeout path was exercised only by the reviewer's lock probe (mine uses the 3 s seam);
  the `> 100 files` inline-skip branch (code path only, A3 had 0 files); MANAGER/TEAM visibility variants (STAFF/OWN only); prod latency.

## Controller merge gate record (main tree, 2026-10-02 02:12 UTC)

Patch `scripts/pending/c55merge/fix9.patch` (= wip/crm-cf12 `8cc1778a..3e9930ec`) applied with `patch -p1 --fuzz=3` on session/crm after G1; only `src/lib/modules/crm/portal.ts` differs from the commit (fix3b edit), changed lines identical.
Independent review: 2 rounds, MERGEABLE (`crm-C5.5-fix9-review.md`); R2-1 (per-row erase writes) / R2-3 / R2-4 → card fix11; R2-2 + export scope = owner/legal questions (C6 register).
Gate unit `crm-main-fix9` (`scripts/pending/run-main-fix9.sh`, log `.qc-shots/crm/main-fix9.log`, QC3): all 15 steps exit 0 — typecheck, docs ×4, fitness ×2, probe-cf12-r2, probe-cf12, probe-cf12-review-r2, probe-cf12-review-chain, c3.9, c3.5, qc-form, qc-approval.
