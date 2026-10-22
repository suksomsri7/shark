# POS P5.2 — fix round 1 (authz / public-endpoint findings of the red-before oracle)

Builder · account B · 22 Oct 2026 02:02Z–(see end) (`date -u`) · tree `/root/projects/shark-pos-b` · branch `wip/pos-p5.2` from `wip/pos-p5.2-oracle` **7e1ee345** (oracle on session/pos 2fb1fe8e).
Prompt: `ledger/pos-briefs/pos-prompt-accountB-P5.2-FIX1-BUILD.md` (rulings CD-P52-F1…F5). Oracle notes: `ledger/wo-notes/pos-P5.2-oracle.md`.

## Commits (in order)
| sha | kind | finding |
|---|---|---|
| 4d858d94 | fix | CD-P52-F1 AI settings reader gated |
| 81270851 | fix | CD-P52-F5 permission before validation/lock (R3) |
| eec1d20f | fix | CD-P52-F4 table QR token generator 128 bits |
| 059d4bc3 | fix | CD-P52-F3 per-IP read limit on /q doors (+ new `pos/public-rate.ts`) |
| 9497c875 | fix | CD-P52-F2 per-IP limit on /r POS branch + public receipt actions |
| d02e5a39 | test | ORACLE-EDIT P2 (F4) · generator override getPosAiSettingsAction (F1) · page notes (F2–F4) · matrix `--write` |

## Per finding (file:line before → after)
### CD-P52-F1 (H1 · R1/R2)
- `src/lib/modules/pos/ai-settings-actions.ts:31–36` (before: no gate; `requireTenant` → read `settings` incl. `brief.email` / `managerUserIds`) → `:31–37` after: `role !== "OWNER" || !can(pos.settings.manage)` ⇒ PERMISSION_DENIED **before** the DB read (`:36`).
- Rule chosen: the ruling's fallback "gate the whole reader with the manage permission" — the only client caller is `SharkSettings.tsx:124–130` (`if (!aiOwner) return` · `aiOwner = ai?.isOwner`, from `settings/page.tsx:117–123 aiCard.isOwner = m.role === "OWNER"`). So the reader uses exactly the writer's gate (`:51–53`). No redaction path needed; no UI change.
- ORACLE-EDIT (d02e5a39): `scripts/pos-authz-matrix-gen.mts` OVERRIDES row → MANAGER/CASHIER/STAFF_NOPERM deny (MANAGER was allow), notes cite CD-P52-F1. R1/R2 check code unchanged (they already expected deny for CASHIER/NOPERM).

### CD-P52-F5 (H5 · R3)
- `src/lib/modules/pos/receipt-settings.ts:159` (before: patch/link VALIDATION at :159–165, permission at :169) → `:161–162` after: `evaluate(pos.device.manage, unitId)` right after the unitId shape check; old line kept (`:171`).
- `src/lib/modules/pos/settings-actions.ts:106` (before: `SETTINGS_SECTION_LOCKED` for anyone without a settings key) → `:106–107` returns `DENIED` (PERMISSION_DENIED). A MANAGER with the key still gets SECTION_LOCKED from the writer (`payment-settings.ts:292`) — qc-pos-p1.18 PP2 unchanged · client `GeneralSettings.tsx:171` handles both codes.
- `src/lib/pos-board-bridges.ts:524` (before: row VALIDATION first, unit gate :525) → `:517–518` shop-level `pos.report.view` + `pos.report.anomaly` before the row check; per-unit gate unchanged (`:527`).

### CD-P52-F4 (H4 · P2)
- `src/lib/modules/restaurant/table.ts:42–51` (before: `restaurantTable.create` without qrToken → `@default(cuid())` ≈ 41 random bits) · `:76` rotate `qr_<uuid32>` → after `:32–38` `TABLE_QR_TOKEN_BYTES = 16` · `newTableQrToken() = qr_ + randomBytes(16).toString("base64url")` (128 bits, 25 chars, fits `QR_TABLE_TOKEN_RE [A-Za-z0-9_-]{8,64}`), `:53` createTable sets it, `:83–84` rotateQr uses it.
- Prisma schema / column untouched; existing printed tokens (cuid and qr_<hex32>) stay valid; no UI. Only one creator exists in `src/lib` (oracle P2 now walks all of `src/lib`).
- ORACLE-EDIT P2 (`scripts/qc-pos-p5.2.mts` P2 block): judge the generator on the creation path (every `restaurantTable.create*` sets `qrToken: <gen>()`; gen = crypto `randomBytes(N)`, no Math.random, N×8 ≥ 60; rotateQr uses gen). Old rule kept in the comment.
- **Delete-probes** (each a temporary edit, `--no-db`, then `git checkout`): `TABLE_QR_TOKEN_BYTES = 7` → P2 ❌ "randomBytes(7) = 56 บิต" · remove `qrToken:` from createTable → P2 ❌ "ไม่ตั้ง qrToken: restaurant/table.ts" · `Math.random()` in the generator → P2 ❌ "0 บิต". Restored: 17/17.

### CD-P52-F3 (H3 · P6)
- New `src/lib/modules/pos/public-rate.ts` (`posPublicRateGuard(family, ip)` → `checkRateLimitDb("pos:pub:<family>:<ip>")` = same ChatRateBucket single-statement bucket as P2.13 / `submitGuard`; `posPublicClientIp()` = first x-forwarded-for hop, dynamic `next/headers`).
- `src/lib/modules/pos/qr-order.ts:121–131` `readGuard(family, meta)`; doors before → after: tableDoor `:300 → :312` (+`:314`), tablePoll `:309 → :323` (+`:325`), tableBill `:524 → :540` (+`:542`), linkDoor `:563 → :581` (+`:583`), orderStatus `:713 → :733` (+`:735`). New optional last param `meta?: {ip}`; guard runs before the token lookup ⇒ a limited answer is identical for real and unknown tokens (RATE_LIMITED + retryAfterSec); unknown tokens keep TOKEN_INVALID (P4 green). No meta (internal callers, QC scripts) = not counted.
- Callers: `(store)/q/actions.ts:58,71,116` pass `{ip: await clientIp()}`; pages `q/t/[qrToken]/page.tsx:31,32,41` · `q/[linkToken]/page.tsx:31` · `q/o/[orderToken]/page.tsx:30` pass `{ip: await posPublicClientIp()}`. English comments only under `(store)/q/**` (p2.7 ST4).
- **Budgets** (per IP per minute, computed in code from the client poll constants, ×3 headroom):
  - `qrTable` (door + poll + bill share one bucket) = 3 × (60000/QR_TABLE_POLL_MS 8000 → 8 polls + 8 bill refreshes worst case + door 1 + SSR bill 1) = **54**
  - `qrOrder` = 3 × (60000/QR_STATUS_POLL_MS 5000 → 12 polls + page 1) = **39**
  - `qrLink` (page load only, no poll) = **30**
- The one bucket upsert is the only write a read now makes when meta is passed (shop data still 0 writes; p2.7 TB1 green).

### CD-P52-F2 (H2 · P5)
- `src/app/(store)/r/[token]/page.tsx:76` (before: `publicReceipt(posToken)` with no limit; comment said "ไม่ผ่านเพดาน IP") → `:78–79` `posPublicRateGuard("receiptRead", posPublicClientIp())` before the lookup; limited = `PosReceiptUnavailable` (same for every token). Accounting branch (`:84–` `accountRateGuard`) byte-identical.
- `src/app/(store)/r/[token]/pos-receipt-actions.ts:25–29` `receiptRateGuard(family)` (no `next/headers` in the file — p1.11 ST6), used at `:34` publicReceiptAction (receiptRead), `:46` issue, `:61` tax-request, `:73` review (receiptSubmit). Limited = `{ok:false, code:"RATE_LIMITED", message, retryAfterSec}` (message = `RECEIPT_ONLINE_MESSAGES.RATE_LIMITED`; no new i18n key).
- **Budgets**: `receiptRead` **60**/min/IP (= ACCOUNT_RATE.publicToken; ≥ 30 so a receipt opened/printed many times or a shop PC opening many receipts does not trip) · `receiptSubmit` **30**/min/IP on top of the per-bill service limits (issue 3/bill/24h · 1 open tax request · 1 review/bill).
- "429 with Retry-After": a server-component page cannot set HTTP 429 → page shows the unavailable card; actions carry `retryAfterSec` (the REST-429 equivalent of the data refusal). See CD-P52-F1b below.

## Gates
- `qc-pos-p5.2` forced (full, standalone 02:15–02:19Z): **33/33** exit 0 · guardHits 0 · residue 0. `--no-db` **17/17**. N1–N4 self-tests green (judges still red on flipped input).
- `pos-oracle-check.sh … qc-pos-p5.2 --base 2fb1fe8e`: **VERDICT green** (red 0 · warn 0 · ORACLE-EDIT 2 · probe 6).
- `--no-db` extra: qc-pos-p1.11 7/7 · qc-pos-p2.7 4/4 · qc-pos-p1.6 48/48.
- pre-submit run 1 (02:19–03:15Z · logs `/root/pos-runs/presubmit-shark-pos-b-20261022T021912Z`):

```
PRESUBMIT-TABLE head=d02e5a39 tree=/root/projects/shark-pos-b
suite                        exit pass/total     s  failed
wo-qc-pos-p5.2-run1          0    33/33        269
wo-qc-pos-p5.2-run2          0    33/33        240
wo-qc-pos-p5.2-nodb          0    17/17         49
qc-pos-p1.1                  0    180/180      276
qc-pos-p1.3                  0    128/128      260
qc-pos-p1.6                  0    48/48        103
qc-pos-p1.7                  0    33/33        170
qc-pos-p1.13                 0    33/33        125
qc-pos-p1.18                 0    81/81        226
qc-pos-p2.4                  0    50/50        173
qc-pos-p2.7                  0    42/42        163
qc-pos-p2.13                 0    54/54        286
qc-pos-p3.9                  1    47/48        193  P3.9-Z2
qc-hf-fu                     1    28/29        202  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-pos-page-authz         0    87/87        115
qc-hf-reports-authz          0    79/79        145
qc-hf-tx                     0    22/22        161
qc-hf-fu2                    1    30/31         58  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
fitness-noenv                0    53/53         21
fitness-qc4                  0    53/53         93
fitness-pos                  0    8/8           11
gen-check                    0    -              5
PRESUBMIT head=d02e5a39 green=19 red=3 expected-lane-pin=2 unexpected-red=qc-pos-p3.9 · wo: qc-pos-p5.2-run1=33/33 · qc-pos-p5.2-run2=33/33 · qc-pos-p5.2-nodb=17/17 · VERDICT red (3: qc-pos-p3.9 qc-hf-fu qc-hf-fu2)
```
- `qc-chat-security` and `qc-chat-security-scope` are not in `pos-gates.json` (pre-submit `MISSING`) → run separately (below).
- Lane-pin reds (file:line):
  - HF-FU-ST1 (base c3c52ef1): `src/lib/modules/restaurant` changed — already red on base (2fb1fe8e has 5 restaurant files vs c3c52ef1, e.g. pos-qr.ts, pos-qr-readers.ts); this round adds `restaurant/table.ts:1,32–38,53,83–84` (CD-P52-F4, ruled).
  - HF-FU2-ST1 (pin 72669941): unmarked hunks — every session hunk since the pin (+36), incl. this round's `(store)/q/**` and `(store)/r/**` hunks (marked `POS P5.2 ▸ … ◂`, not `HF-FU2`).
- P3.9-Z2 (unexpected-red): see rerun below.
- Reruns (standalone, POS lock, 03:15–03:19Z): **qc-pos-p3.9 48/48** exit 0 (Z2 green — the run-1 Z2 diff was `AppNotification 2767→2790 · AuditLog 3888→3899` *outside* the temp tenants = concurrent writes of other lanes on QC4; this round writes no AppNotification/AuditLog on those paths) · **qc-chat-security 38/38** (findings []) · **qc-chat-security-scope 20/20** (findings []).
- Typecheck at code head d02e5a39 (03:20–03:23Z): `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → **exit 0 · tsc --noEmit · 0 errors**.
- Notes commit after it is ledger-only (no code change).

## CONTROLLER-DECISION / owner items
1. **W27 (owner, for the controller to write):** "QR โต๊ะที่พิมพ์ไว้แล้วยังเป็นโทเคนเดิม (cuid ≈ 41 บิตสุ่ม หรือ qr_<hex32>) — ใช้ต่อได้ตามปกติ · โต๊ะใหม่และการกด 'เปลี่ยน QR' ตั้งแต่ P5.2 ได้โทเคน 128 บิต · จะให้หมุน QR ที่พิมพ์ไว้ทั้งหมด (ต้องพิมพ์สติกเกอร์ใหม่ทุกโต๊ะ) หรือไม่ = เจ้าของร้านตัดสิน · ระบบไม่ได้เพิ่มปุ่มใหม่" — EN: printed table QR codes keep their old token and keep working; new tables and every "rotate QR" now get 128-bit tokens; whether to rotate all printed codes (reprint every sticker) is the owner's call; nothing new in the UI.
2. **CD-P52-F1 applied as the fallback branch** (reader = writer gate, OWNER + pos.settings.manage) because the UI never reads for non-owners. If a future card needs the read for managers/cashiers, switch to read-with-redaction then.
3. **429 on the /r page:** a server-component page cannot return HTTP 429/Retry-After; the POS branch shows the existing "receipt unavailable" card for every token when limited (same as the accounting branch's "invalid link" behaviour). Actions return `RATE_LIMITED` + `retryAfterSec`. A real 429 would need middleware (out of scope) — confirm acceptable.
4. **Shared-IP risk (NAT / shop Wi-Fi) for `qrTable` 54/min/IP:** the budget is per phone ×3 as ruled; a restaurant whose guests all sit on the shop's Wi-Fi (one public IP) with > ~3 polling phones would see `RATE_LIMITED` on polls (the page retries on the next tick; ordering writes are separate buckets). Options for the controller: keep · raise the table bucket · key reads on IP+token for hits and IP-only for misses (needs a peek on the bucket).
5. **Receipt issue form message:** a per-IP `RATE_LIMITED` on `reportReceiptIssueAction` shows the existing per-bill text ("แจ้งปัญหาบิลนี้ครบ 3 ครั้ง…") via `receiptRefusalMessageKey` — no new key added (messages unchanged rule). A dedicated key would be a UI/i18n follow-up.
6. **Reads count only with meta {ip}:** the module doors skip the limit when called without meta (internal callers / QC scripts); every public caller under `(store)/q/**` passes it. A new public caller must pass `{ip}` — a hunter/oracle could pin this (e.g. static check that every `(store)/q` call site of the 5 doors passes a meta arg).
7. **qc-chat-security / qc-chat-security-scope** are named in the prompt's `--also` but are not in `pos-gates.json`; ran them standalone (green). Add to the manifest if they should ride pre-submit.

## Visual states for the controller (no UI change in this round)
None required (server-only; the limited paths reuse existing cards `pos-qr-invalid` / `PosReceiptUnavailable`). Optional spot check: `/q/t/<token>` and `/r/<token>` still render normally.

## Fix round 2 (controller B: R1 = MERGEABLE-AFTER-FIXES · ruling CD-P52-F3b) — 22 Oct 03:2xZ–04:0xZ
Commits on top of fb82257c: be1de206 (item 1 fix) · 951b313c (item 2 fix) · 021496c8 (test ORACLE-EDIT P6 + new P9) · this notes commit.

### Item 1 (F1+F2 High · CD-P52-F3b) — `/q` guessing guard in one place
- `src/lib/modules/pos/qr-order.ts:87–112` `qrGuard(name, body, gate?: {meta, token, family?})`: no meta = internal caller = uncounted (`chat-link.ts:277 linkDoor(token)` unchanged). (a) `:96` peek miss bucket (read-only) before the body → full ⇒ `TOKEN_INVALID()` (the miss shape, valid tokens too); (b) `:99–101` result TOKEN_INVALID ⇒ `qrCountMiss` (write doors included: tableCtx/linkCtx/exists misses at placeTableRound/tableServiceRequest/tableNotifyPaid/placePreorder/claimPaid now count before submitGuard is reached); (c) `:103–106` valid token + family ⇒ `qrHitGuard` per (ip, sha256(token)[0..16]) ⇒ RATE_LIMITED.
- All 12 doors pass the gate at their closing `}, { meta, token, family? })` (reads tableDoor/tablePoll/tableBill/linkDoor/orderStatus + quotes with family; writes without — submitGuard keeps per-token + per-IP submit limits). `quoteTableCart` `:343` / `quotePreorderCart` `:606` gained `meta?`; `(store)/q/actions.ts:61,92` pass `{ip}`.
- Removed fix1's per-IP success counting: `readGuard` + the 5 `readGuard` calls in the doors; `POS_PUBLIC_RATE` qrTable/qrOrder/qrLink rows (receipt rows stay — F2 is per IP by ruling).
- `src/lib/modules/pos/public-rate.ts:40–75`: `QR_MISS_PER_IP_PER_MIN` · `QR_HIT_RATE` · `qrMissExhausted` (`prisma.chatRateBucket.findUnique`, fail-open) · `qrCountMiss` · `qrHitGuard` (key hashes the token — ChatRateBucket rows live 24 h).
- **Final budgets**: misses **30/min per IP** (full ⇒ every token from that IP = TOKEN_INVALID until the window ends) · per (ip, token) per minute: **qrTable 54** (3 × (8 polls + 8 bills + 2)) · **qrOrder 39** (3 × (12 + 1)) · **qrLink 30** · **qrQuote 90** (3 × 30 cart edits/min; useQrQuote fires 250 ms after the last edit) · receipts unchanged (receiptRead 60/IP · receiptSubmit 30/IP).
- Shared-IP item 4 of fix1 is resolved by keying hits on (ip, token): guests on one Wi-Fi each read their own table/order token.

### Item 2 (F4 Low)
- `src/lib/modules/pos/receipt-settings.ts:158–159`: tenant-level `evaluate(m, {module:"pos", action:"pos.device.manage"})` (no unitId = tenant level) before the input/unitId shape check (was `:160` VALIDATION first). Per-unit gate still right after the shape check (`:164`).

### Item 3 (F3 legacy `/s/[t]/[u]/restaurant/t/[qrToken]`) — **not included**, left for the hunters
- Reason: routing `legacyTableQrRedirect` (`qr-order.ts:~800`) through the miss counter is small, but it does not close the oracle — when the redirect returns null the page falls through to the legacy `resolveTableSession` (restaurant module, page `:28`), which answers valid/invalid itself (and opens a session) with no limit. Closing it means limiting the legacy restaurant door = D11 / out-of-scope legacy module, not a ≤ 10-line change.

### ORACLE-EDIT (021496c8)
- P6 (static) now judges: qrGuard peek-before-body + miss count on TOKEN_INVALID + hit count via qrHitGuard · findUnique peek · hashed hit key · gate on all 12 doors (family on reads/quotes) · every call of those doors under `src/app/(store)/q/**` passes a meta with `ip` (paren-matched grep; 20 call sites).
- P9 (new, DB self-test): two real order links of temp tenant A; IP A reads link 1 `QR_HIT_RATE.qrLink` (30) times ok, 31st = RATE_LIMITED; IP B on link 1 = ok; IP A on link 2 = ok; no meta = ok; 30 misses from IP M → link 2 from IP M = TOKEN_INVALID, from IP B = ok. Buckets `pos:pub:%:qc-p52-<RAND>-%` deleted in finally, counted in Z1.
- **Red-before / probes**: new oracle on fix1 product code (qr-order.ts · public-rate.ts · (store)/q/actions.ts from fb82257c, temporarily, then `git checkout`) → **32/34, failed P6 + P9** (P9: "IP A × ลิงก์ 2 = RATE_LIMITED · ลิงก์จริงจาก IP M = RATE_LIMITED"). Static probe: drop `{ip}` from one call site → P6 ❌ "q/actions.ts … quoteTableCart(…) ไม่ส่ง meta {ip}".

### Gates (head 021496c8 code)
- `qc-pos-p5.2` forced **34/34** (03:37–03:43Z · guardHits 0 · residue 0) · `--no-db` **17/17**
- qc-pos-p1.6 48/48 · qc-pos-p1.3 128/128 · qc-pos-p2.7 42/42 · qc-pos-p2.13 54/54 · qc-hf-pos-page-authz 87/87 · qc-pos-p1.18 81/81 · qc-chat-security 38/38 · qc-chat-security-scope 20/20 (all exit 0)
- `pos-oracle-check.sh … qc-pos-p5.2 --base 2fb1fe8e` → VERDICT green (red 0 · warn 0)
- Typecheck (2nd of this card, 03:55–03:58Z): `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → **exit 0 · 0 errors**
