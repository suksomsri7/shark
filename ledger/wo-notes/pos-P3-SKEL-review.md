# P3-SKEL S — R1 + hunter (account B · 21 Oct 2026 20:1xZ · head e05a7cec · base 71c49221)

MERGEABLE-AFTER-FIXES — P3-SKEL S @ e05a7cec (base 71c49221) · R1 + hunter · read-only · pure probes (secret-box, verifySharkSignature, agent isLanHost) under iso.sh 2G

## R1 (reviewer)
F1 (Medium · CD-SKEL-B1) `pos/secret-box.ts:22-24` — the production special-case has no independent justification: no product caller ever passes `deps` (`integration-creds-actions.ts:52-62`; inbound `dispatch.ts:99` → `platformInboundCreds(ch)`), so in production it guards nothing reachable. It also changes the contract: under `NODE_ENV=production` an explicit `{key:null}` (meant as "no key on purpose", `:19`) quietly falls back to the env key (probe: `nullProd → ENVKEY`). That contradicts the oracle names table ("key = deps.key if given"), and the header `:6` does not mention it. The rule exists only to make a broken harness pass. Fix: revert `:23` to `!!deps && hasOwnProperty(deps,"key")` and ORACLE-EDIT `qc-pos-p3-skel.mts:1242-1243` `undefined` → `{}` in its own test(pos) commit. Probe: `{}` with no env gives `null` ⇒ NOT_CONFIGURED, so SK3 stays green against the reverted product.
F2 (Low · CD-SKEL-B2) REST `GET /sales/{id}` now returns `slips`, but `docs/api/POS-API.md` never mentions it (grep "slip" only finds the `reference` field). gen-check is 0 because it reads op metadata only. The payload itself is safe: `billSlips` (`payment-slip.ts:327-329`) selects id+status, `thumbUrl` is always null, and there is no fileId/path/transRef/note/amount. The public receipt (`receipt.ts`) does not use billDetail. Fix: add one line to POS-API.md (controller or the U/API card).
F3 (Low) The unique index (tenantId,kind,provider,scopeKey) with scopeKey `"system"` (`migration.sql:94`, `integration-creds.ts:125,:197`) means a second POS system in the same tenant can never save SLIP_VERIFY/ETAX: the save answers NOT_FOUND. Fix: `scopeKey = "system:"+systemId`.
F4 (Low) Inbound route: every unauthenticated request with a bad signature writes one OpsEvent WARN (`dispatch.ts:101-107`). There is no rate limit or dedupe, so anyone holding a webhook URL can flood the ops log. Fix: reuse the `memo` — at most 1 WARN per channel per minute.
F5 (Low) After a key rotation or mismatch, the box fails to open and the inbound route answers 503 NOT_CONFIGURED for every channel without any signal (`integration-creds.ts:298-299`). There is no `keyVersion` column (re-paste path documented at `PLATFORM-SETUP.md:11`). Fix: one ops WARN per channel per hour when open fails.
F6 (Low · scheduler) `minute-jobs.ts:476-483` ignores `budgetMs`/`ctrl`. Purge runs first (≤200 sequential storage deletes) and expire runs after, so a cut-off starves `expirePrintJobs`. Fix: run expire first and stop the purge loop at `ctrl.deadline`.
F7 (Low · functional) `print-relay.ts:235` picks the printer by `p.name === target` ("kitchen"/"receipt"). Printer names are free text (`PLATFORM-SETUP.md:56`), so kitchen tickets fall back to `printers[0]`. Fix: add `target` per printer, or have the job carry the printer name.
Verified OK:
- Boundaries: `pos/api/**`, `app/api/v1/**`, `lib/payment`, `modules/account/**`, register*/tender*/refund*, service, payment-intent, order, kds, channel, outbox-consumers, pos-sale-contract.json and pos-integrations.ts are byte-identical (empty diff --stat). The prisma schema only adds lines. The migration is CREATE TABLE/INDEX only with `lock_timeout`. The oracle (`qc-pos-p3-skel.mts`) is unchanged since 5d3a84af. The ORACLE-EDIT for pos-gates.json is its own commit 9e93b8f0.
- hf-fu2 "unmarked" list: all 10 hunks in the 8 modified files carry P3-SKEL markers.
  - Block form: `scope.ts:99-105`, `device-shared.ts:56-61`, `minute-jobs.ts:472-485`.
  - Inline: `bills.ts:28`, `bills.ts:582`, `order-adapters.ts:8`, `order-adapters.ts:37`.
  - JSDoc: `bills-shared.ts:191`.
  - messages th/en: JSON appended.
  - The "+22" are the 21 new files plus prisma.
  - ST1 is red only because the literal `HF-FU2` is missing against LANE_PIN bafdf89f (identical to 71c49221 for src/prisma). That is a lane-pin issue, not an unmarked product hunk.
- Vault: AES-256-GCM with a random 12 B IV and 16 B tag, labelled SHA-256 key, env only, no fallback. Without a key the save is refused NOT_CONFIGURED (`:184-185`) and nothing is ever stored in plaintext. Audit logs field names only (`:240`). Logs carry `e.name` only. Errors echo field names, never values. No REST, outbox or ops exposure. Save is OWNER-only; reads use READ_PERM per unit (`:257`). The "use server" files export async functions only, catch with `unstable_rethrow`, never throw, and use boolean `gateOk`.
- Inbound: HMAC over raw bytes with `timingSafeEqual`. 256 KB streamed cap ⇒ 413. Tenant comes from the channel row, not the payload. No outbound URL. Skeleton writes nothing (503 ADAPTER_PENDING); 2xx/4xx semantics are documented only in the route header (`route.ts:3-5`), not in PLATFORM-SETUP.
- Slips:
  - jpeg/png/webp with a magic-byte check, ≤5 MB, ≤3 per target, private `t/<tenant>/private/<40 hex>`, fixed filename `slip.<ext>`.
  - Retention 1825 days, clamp 90–3650; the file is purged and the row kept.
  - Confirm needs `pos.shift.manage` and not the uploader (SLIP_SELF_CONFIRM, OWNER exempt), audited once.
  - transRef race is caught by the unique backstop ⇒ SLIP_DUPLICATE.
  - No money effect.
- Reconcile: read-only, unit-scoped, satang integers, BKK day, ≤92 days, CSV formula-injection guard.
- e-Tax: seam only, no provider call. ACCOUNT is read only. `render.ts` is pure and deterministic (escapes, integer baht); hash pin = CD-SKEL-B3.
- Print relay: token `spa_`+32 B, sha256 at rest, Bearer header only, revoke ⇒ 401. Claim uses `FOR UPDATE SKIP LOCKED`. Bytes are nulled at DONE/FAILED/EXPIRED. `AGENT_REVOKED`/`UNAUTHORIZED` texts exist in th/en.
- Code rules: th/en `pos.platform.*` key parity 40/40, and every messageKey the code uses exists. The `pos-gates.json` entry is present. Notes are complete (CD-B1–B4, pre-submit table, lane-pin reds with file:line).

## Hunter (security/money)
H1 (Medium · money-evidence) A slip amount is never compared with the money it is supposed to prove. In `payment-reconcile.ts:95-102` any CONFIRMED slip counts as evidence if it matches the intent by intentId **or** sits on any payment row of the same sale, and that clears NEEDS_CHECK. `amountSatang` is optional at attach (`payment-slip.ts:155`) and confirm never checks it. Input: a MANUAL PROMPTPAY_STATIC intent of 10,000 ฿ is consumed into a sale; a 100 ฿ slip is attached to that sale's TRANSFER row and confirmed by a second manager ⇒ flag OK. Also, a refund after reconcile does not show (sale status is not read). Fix: count the slip only when it is tied to that intent and `amountSatang === intent.amountSatang`; otherwise NEEDS_CHECK, or a new AMOUNT_MISMATCH flag.
H2 (Low) Idempotency replay is looked up tenant-wide (`payment-slip.ts:194,:221`; `print-relay.ts:181`). A key reused from unit B returns B's slip view (saleId, transRef, amount, note) or B's job to a user in unit A. Fix: also match unitId and target; on mismatch answer VALIDATION.
H3 (Low) The same image can be attached to two bills when no transRef is given (no content hash). Fix: store sha256(bytes) and refuse or flag a repeat within the tenant.
H4 (Low · PDPA/W19) `purgeAfter` is fixed at attach (`:212`), so raising `slipRetentionDays` later (the W19 answer) does not extend existing slips. There is no dispute or legal-hold flag, and no PDPA erase path reaches slips: the 5 years win silently and nothing is logged. Fix: recompute the date from the current setting at purge time, and add an OP line for hold/erase precedence.
H5 (Low) Vault: the length of `POS_CREDENTIALS_KEY` is never checked — probe key `"a"` seals fine (`secret-box.ts:25`). Fix: require ≥32 chars, else `keyConfigured:false`.
H6 (Low · for P3.1-real) The signature has no timestamp or nonce (`types.ts:52-68`), so a captured signed body replays forever. Harmless today (503, no write), but a real adapter must add a time window plus X1 dedupe on externalRef. Probes:
- Re-ordered JSON keys / `ก`-escaped body ⇒ false (raw-bytes HMAC, as intended).
- Uppercase hex or a `sha256=` prefix ⇒ false (Info; check against the platform format).
- Surrounding spaces ⇒ accepted (trim).
H7 (Low) Print relay: the server accepts any host and port (`print-relay.ts:57-73`). Any `pos.sale.create` user can push arbitrary bytes (≤256 KB) as raw TCP to whatever host:port a device manager registered. The agent allows 127/8 and 169.254/16 (probe: `169.254.169.254 ⇒ true`). Fix: allow only ports 9100-9102 (+515) on server and agent, and drop 169.254 from `isLanHost`.
H8 (Info · cost) Each agent long-poll holds a function for 25 s and runs about 25 claim UPDATEs (`jobs/route.ts:22-30`), i.e. about 1 query/s per agent around the clock. Consider a slower poll interval or backoff.
Verified safe:
- Vault: same plaintext twice ⇒ different ciphertext. Tampered tag, wrong key or a non-object JSON ⇒ null, never thrown and never plaintext. Concurrent saves are serialised by an advisory lock (last writer wins, each save audited).
- Webhook: duplicate delivery or a "test" event ⇒ no write. A payload naming another tenant's unit is ignored. Oversized body ⇒ 413.
- Slips:
  - Path traversal is impossible (fixed filename, random key).
  - A polyglot with a valid image header plus trailing data is accepted. Info only: it stays private and is served as an image.
  - A duplicate transRef across units is refused.
- Print relay:
  - The token never appears in a URL or log. The agent reads it from env, not argv.
  - A foreign agent cannot claim or ack another agent's jobs (404).
  - A replayed ack is idempotent.
  - Jobs hold receipt bytes only, no credentials.
- Scheduler: nothing polls NOT_CONFIGURED providers. There is only the hourly purge/expire (bounded take 200 / indexed updateMany), and dispatch INFO is deduped to 1 per (channel, method) per hour.

## Controller rulings (B · 21 Oct 20:1xZ) — fix round 1 on `wip/pos-p3-skel` tree b
- **F1 (CD-SKEL-B1 confirmed)**: revert `pos/secret-box.ts:23` to `!!deps && hasOwnProperty(deps,"key")` (no NODE_ENV special-case); ORACLE-EDIT `qc-pos-p3-skel.mts:1242–1243` `undefined` → `{}` in its own test(pos) commit (SK3 stays green per the reviewer's probe).
- **F2**: add the `slips` field (id + status only, thumbUrl null) to `docs/api/POS-API.md` for `GET /sales/{id}`; regen if the generator covers it.
- **F3**: `scopeKey = "system:" + systemId` for SLIP_VERIFY/ETAX (migration already applied on QC4 — add a follow-up migration only if the unique index needs it; otherwise key change is data-level).
- **F4**: inbound bad-signature WARN ≤ 1 per channel per minute (reuse `memo`). **F5**: box-open failure WARN ≤ 1 per channel per hour. **F6**: `minute-jobs` run `expirePrintJobs` first, purge loop stops at `ctrl.deadline`. **F7**: printer `target` (kitchen/receipt) per printer or job carries the printer name.
- **H1 (Medium)**: a slip is evidence only when tied to the same intent **and** `amountSatang === intent.amountSatang`; otherwise the bill stays NEEDS_CHECK (or new flag AMOUNT_MISMATCH); reconcile also reads sale status so a refund after reconcile shows.
- **H2**: idempotency lookup also matches unitId (+ target); mismatch ⇒ VALIDATION. **H3**: store sha256(bytes); a repeat within the tenant ⇒ `SLIP_DUPLICATE`. **H4**: compute purge date from the current `slipRetentionDays` at purge time; OP line (W19 follow-up: legal hold / PDPA erase precedence). **H5**: `POS_CREDENTIALS_KEY` < 32 chars ⇒ `keyConfigured:false`. **H6**: no code now — OP line for P3.1-real (timestamp/nonce window + externalRef dedupe). **H7**: server + agent allow only ports 9100–9102 and 515; agent `isLanHost` drops 169.254/16. **H8**: info — OP line (poll backoff later).
- Gates fix1 (exception: one more pre-submit + one typecheck): `qc-pos-p3-skel` forced ×2 `PSK_PIN=71c49221` + `--no-db` · `pos-pre-submit.sh --set core --also qc-pos-p1.18,qc-pos-p2.13,qc-pos-p1.7,qc-pos-p1.9` · typecheck at the final head. Then R2 = reviewer re-check F1–F7 + H1–H5, H7.
