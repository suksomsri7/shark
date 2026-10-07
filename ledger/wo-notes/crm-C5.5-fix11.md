# crm-C5.5-fix11 — erase writes set-based (review fix9-r2 R2-1) · expired-transaction classification (R2-3) · re-erase finishes the follow-up (R2-4)

Tree `/root/projects/shark-crm-c54d` branch `wip/crm-cf15` from 3e9930ec (fix9 r2 review state) · QC3 only · 2026-10-02 (finished 02:40 UTC).
Probes `scripts/pending/cf15/probe-cf15.mts` (+ `probe-cf15-scale.mts`) · base dump `scripts/pending/cf15/eq-base.json` · verify
`scripts/pending/cf15/run-verify.sh` (run as a /tmp copy; summary `/tmp/cf12-logs/f11v1.summary`). Export scope (R2-2) not touched
(owner decision). `emails.ts` not touched. No migration.

## RED → GREEN
| run | controls | finding checks |
|---|---|---|
| probe-cf15 on 3e9930ec (`base`) | 6/6 | **5/5 RED** — G1 slope 8.77 ms/row · G2 t(n)=7.4 s, t(4n)=25.8 s · G3 5,005 audit + 1,001 cards → TOO_LARGE after 60.1 s · C1 classifier absent (old code: every P2028 = "too large") · R1 re-erase deleted 0 of 3 leftover files |
| probe-cf15 on the fix (`fix`, compared with `base`) | 7/7 incl. **Q1 end state byte-identical** | **5/5 GREEN** — slope 0.03 ms/row · t(n)=1.34 s, t(4n)=1.40 s · 5,005 + 1,001 + 1,001 rows in 1.64 s · classifier [T,T,F,F,F,F,F] · re-erase deleted 3/3, next re-erase 0 calls |

## 1 · R2-1 MED — one statement per page instead of one per row
- privacy.ts: generic `writeRows(tx, table, tenantId, cols, rows, extra?)` = `UPDATE "<T>" x SET col = v.col … FROM unnest($ids::text[],
  $col1::text[] | jsonb[] | boolean[] …) AS v(…) WHERE x.id = v.id AND x."tenantId" = $t`, ≤ 1,000 rows per statement. Every new value is
  still computed in JS exactly as before (same mask functions, same conditions, same rows); values travel only as array parameters;
  table/column names are code constants checked against `^[A-Za-z]+$`; `text[]` columns travel as jsonb arrays and are rebuilt in
  order (`jsonb_array_elements_text … WITH ORDINALITY ORDER BY`), JSON values as `JSON.stringify` → `jsonb` (null/undefined → SQL NULL =
  the old `Prisma.DbNull`). `@updatedAt` columns (CrmEmailMessage, CrmDeal, KanbanCard) are set in the statement because Prisma `update`
  set them. Sites converted: linked mails (set 1, `writeMails` with `providerError = NULL`, QUEUED → FAILED + scheduledAt/leaseUntil NULL,
  clear ⇒ attachments NULL + purgedAt), set-2 mails (providerError kept), activities (all rows, as before), deals (changed only), stage
  notes, deal-level activities, member timeline, audit-trail scrub (changed only; `auditScrubbed` = rows updated).
- kanban/links.ts (writes stay in the kanban module): `writeCardsInTx` (title, description, updatedAt) · `writeCommentsInTx` (body) ·
  `writeActivitiesInTx` (data jsonb) — one statement per ≤ 1,000 changed rows of each page in `maskCardsInTx`.
- Portal / forms erase loops had no per-row writes left (forms = `updateMany` per page; portal = facade + `deleteMany`).
- Left per-item loops (bounded by the person, not by data volume): per identity token (`AiProposal`/`AppNotification`/`AiMessage`/
  `AiConversation`/`MeetingMessage` replace — one set-based statement per token), per merged-chain person (`anonymizeContactInTx`, chain
  audit rows), per Party (holder count + anonymise).
- **Equivalence:** `probe-cf15 Q` builds one fixture touching every write site (REQUEST erase: linked IN/QUEUED/SENT mails, set-2 mail of
  another contact and an unlinked QUEUED mail he sent, activity with recording + plain one, deal changed/unchanged, stage notes, deal
  activities, member timeline, legacy audit rows incl. nested arrays / null `before` / an unchanged `(เปลี่ยน)` row, kanban card linked to
  him with comments + history, card linked to his deal, portal-request card with old-title quotes, untouched control card; plus a
  RETENTION erase of a second person — masked-not-cleared branch). Dump (ids/tenant/user/request normalised, timestamps → "changed after
  the erase started" flags) on the base code = `eq-base.json` (447 lines); on the fix = **identical** (Q1, run twice).
- **Measured (this host → QC3):** E fixture of fix9 round 1 (2,005 links + 5,005 requests + 5,005 audit + 5,005 forms) 46.5–49.8 s →
  **2.1 s** · probe G: slope **0.03 ms per rewritten row** (was 8.8) · scale probe: **70,000 rewritten rows (50,000 audit + 10,000 cards
  + 10,000 comments) erased in 6.1 s** ⇒ ≈ 680,000 rewritten rows per 60 s at that mix (extrapolated; measured up to 70,000). The
  practical limit is now read volume / process memory (ids and identity lists are held per erase), not round trips.

## 2 · R2-3 LOW — expired transaction only
- `privacy-shared.ts#isExpiredTransactionError` (pure, duck-typed): P2028 AND message "… cannot be executed on an expired transaction"
  (query or commit after the timeout — the transaction manager's message in `@prisma/client/runtime/client.js`). Transaction not found /
  rolled back / committed / internal ("Closed transaction found in active transactions map") / "Unable to start a transaction" (pool
  wait) / other codes ⇒ false ⇒ rethrown ⇒ the action's generic "ทำรายการไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว — ลองใหม่อีกครั้ง" (retryable; the
  rollback means nothing was erased). Probe C1 (7 constructed errors) + C2 (real expiry through the seam still → TOO_LARGE).

## 3 · R2-4 LOW — re-erase finishes the recorded follow-up
- The resweep branch of `eraseContact` now also runs `completeErasure` (reads `followUp` of the erase audit row: files, approvals, member
  requests — every step idempotent: deleted file = no row = success, cancels only PENDING, member requests by recorded id / since). Fails
  ⇒ its existing WARN + `followUp: "PENDING"` in the answer (was `null`); success ⇒ `"DONE"`. Probe R0–R2.
- Exhausted consumer → OpsEvent: **already exists generically** — `core/outbox.ts:287-295` marks the event `FAILED` after 5 attempts and
  `platform/cron.ts:360-372` (`outbox-health`, after every cron drain) raises `logOps("ERROR", "outbox-health", "… ล้มถาวร N ใบ …")`
  (e-mail alert, throttled 60 min/source) while any FAILED row exists; plus `completeErasure`'s own WARN (ids) on every failed attempt.
  No new code. (It is a count, not per event; per-event detail is the WARN rows.)
- Note: a resweep now pays the follow-up inline (one file-register read per recorded file, already-deleted ones included).

## Verification (QC3 · iso.sh + gate lock · `/tmp/cf12-logs/f11v1.summary`)
- `pnpm typecheck` (5120 MB) exit 0 · fitness 39/39 with env and 39/39 without env · `gen-crm-api-docs --check` green.
- probe-cf15 controls 7/7 (Q1 identical to `eq-base.json`) · findings 5/5 GREEN · probe-cf15-scale 50,000: 70,000 rows in 6.1 s, CLEAN.
- cf12 probes: probe-cf12 7/7 + 12/12 (E erase 2.1 s, was 46.5–49.8 s) · probe-cf12-r2 5/5 + 10/10 · reviewer `probe-cf12-review`
  17/17, T2/U1 NOT-REPRODUCED · `-chain` C1 NOT-REPRODUCED · `-scale 500` 2.3 s (was 15.2 s; now mostly fixed per-erase cost) ·
  `-review-r2` 10/10 — its instrumented P block: **165 statements, wall 2.4 s** (was 5,168 statements, 53.4 s).
- hunt probe controls 6/6 (X1.1 not reproduced; S1.* = H3-1, other lane).
- qc-crm-c3.9 49/49 · qc-crm-c3.5 67/67 · qc-form 10/10 · qc-approval 16/16 · qc-kanban-k3.1 19/20 — the red K3.1-S6.3 counts
  screenshots in the gitignored `.qc-shots/kanban/3.1`, absent in this worktree (file count, independent of code ⇒ red at base too;
  same as fix9 round 1).

## Not verified
- Prod latency (all timings from this host); memory at sizes beyond 70,000 rewritten rows; UI (no UI change in this card); the outbox
  FAILED → `outbox-health` path end-to-end (code-read); a real "Transaction not found" from the engine (classification proven on
  constructed errors with the runtime's exact messages).

## Controller merge gate record (main tree, 2026-10-02 03:43 UTC)

Patch `scripts/pending/c55merge/fix11.patch` (= wip/crm-cf15 `3e9930ec..d6338fa2`) applied with `patch -p1 --fuzz=3` on session/crm after fix9; every file identical to the commit.
Independent review: MERGEABLE (`crm-C5.5-fix11-review.md`; raw-read equivalence dump base vs tip identical). L1/L2 in the C6 register.
Gate unit `crm-main-fix11` (`scripts/pending/run-main-fix11.sh`, log `.qc-shots/crm/main-fix11.log`, QC3): all 16 steps exit 0 — typecheck, docs ×4, fitness ×2, probe-cf15, probe-cf15-review, probe-cf12, probe-cf12-r2, probe-cf12-review-r2, c3.9, c3.5, qc-form, qc-approval.
