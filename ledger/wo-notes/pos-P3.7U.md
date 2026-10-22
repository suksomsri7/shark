# POS P3.7U — builder notes (chat UI: CHAT card with 4 switches + sheet · pay link in chat + chip · UI-13 · PayDone automatic LINE chip)

- **Who / where:** builder, account B, 21 Oct 2026, tree `/root/projects/shark-pos-p11`.
- **Branch:** `wip/pos-p3.7u`, made from `origin/session/pos` e47a7fc4. The product tip is **8c0fc3c4**; everything after it is ledger only. `origin/session/pos` 50efa4dc (ledger only) was merged at 30cec653.
- **Prompt:** `ledger/pos-briefs/pos-prompt-accountB-P3.7U-BUILD.md` (CD-P37U-1…10 confirmed). Spec: `ledger/pos-briefs/pos-spec-P3.7-chat-ui.md`.

## Commits (explicit paths · marker `// POS P3.7U ▸ <CD> ◂`)
| Commit | Step |
|---|---|
| `a1e71f6f` | (1) messages |
| `ea40c36a` | (2) CHAT card + sheet + inventory +6 |
| `1a03839f` | (3) pay-link block + awaiting chip + timeline + inventory +2 |
| `35ff720c` | (4) UI-13 |
| `1aeddcdd` | (5) PayDone chip + register prop |
| `ff923f3f` | (6) harness + spec |
| `30cec653` | (7) merge `origin/session/pos` |

The ledger commit holds this file.

## Components / files (no new server file · CD-P37U-1)
- **New** `src/app/app/sys/[id]/pos/settings/ChatSettingsCard.tsx` (`'use client'`): `ChatSettingsRows` holds the 4 switches, quota, all-off, owner-only, the sheet button and the error. `ChatMessageSettings` is the sheet with the status kinds and pause hours. It imports only `chat-link-actions` · `chat-link-shared` · `settings-shared` · RegisterDialog · shark-ui.
- **New** `src/components/pos/orders/OrderChatBits.tsx` (`'use client'`):
  - `ChatPayBlock`: door A, reasons, results, copy.
  - `isChatOrder`.
  - `MemberTierText`: UI-13 via `registerMemberBenefitsAction`.
- **Hunks:**
  - `SharkSettings.tsx`: import, prop `chat`, and one render line in the card under the facts.
  - Settings `page.tsx`: import of `posChatSettings` and `chatCard = {isOwner, settings}` for the shark tab.
  - `OrderPanel.tsx`: import, `EVENT_TYPES` + `payment_requested`, prop `chatPay`, block after the pending note, member row → `MemberTierText`.
  - `OrdersScreen.tsx`: passes `chatPay`.
  - `QrOrderBits.tsx`: chip on the awaiting card.
  - `PayDone.tsx`: prop, translator, chip.
  - `RegisterScreen.tsx`: prop pass-through.
  - Register `page.tsx`: import + prop.
- **Not touched** (forbidden list): `chat-link*.ts`, `chat-order.ts`, `chat-tag.ts`, `pos-chat-bridges.ts`, `modules/chat/**`, `order*.ts`, `register*.ts`, `receipt-send*.ts`, `service.ts`, `settings-*.ts`, `pos-integrations.ts`, `outbox-consumers.ts`, `settings-tabs.ts`, `api/**`, `prisma/` and every `qc-*.mts`.

## Message keys added (th+en · one insertion per JSON object · 4 hunks per file because the keys live in 4 objects)
- `settings.cards.CHAT.{allOff, sheetOpen, sheetTitle, save, saveFailed}`
- `orders.chatPay.{requested, copy, copied, needPerm}`
- `orders.event.payment_requested`
- `orders.detail.memberTier`
- **Reused:** `cards.CHAT.{quota, ownerOnly, switches.*, botPauseHours, off}` · `shark.cancel` · `saving` · `errors.*` · `orders.chatPay.{send, sent, notSent, duplicated, payBy, errors.*}` · `orders.event.{accepted, ready, cancelled, paid}` (sheet labels) · `chat.notify.receipt` (PayDone chip).

## Testids
- **Settings:** `pos-settings-chat-{rows, row-<key>, owner-only, quota, all-off, open, sheet, kind-<kind>, pause, save, cancel, error}`
- **Orders:** `pos-ord-chatpay` · `pos-ord-chatpay-{send, reason, result, copy}` · `pos-ord-card-chatpay-<ref>` · `pos-ord-member-tier`
- **Register:** `pos-reg-done-line-auto`
- **Inventory (`scripts/pos-ui-inventory.json`, F15.3):** rows 1096 → 1104 (+8 interactive). Settings: `chat-row-*` toggle · `chat-open` · `chat-kind-*` · `chat-pause` · `chat-save` · `chat-cancel`. Orders: `chatpay-send` · `chatpay-copy`. The non-interactive chips have no rows.
- The pre-commit hook enforces the inventory on every commit, so the inventory rows were added in steps 2–3 instead of step 6.

## Deviations per CD
- **CD-P37U-2:** when the card is not LINKED, only "turn on" is blocked (disabled, with title `cards.CHAT.off`). A switch that is already on can still be turned off, so the owner can always stop paying for messages.
  - The "manage link" is the existing card footer: `offPrefix · CHAT.off` + the `pos-settings-card-enable-chat` link. It is not duplicated under the rows.
  - The sheet button stays usable when the card is not LINKED, because status kinds and pause hours do not switch anything on.
  - The sheet has a cancel button, `pos-settings-chat-cancel` (label `shark.cancel`). This testid is not in the prompt list; F15.3a requires a testid on every button.
  - The sheet component is named `ChatMessageSettings`, not `*Sheet`, because the F15.3 heuristic treats `*Sheet` components as interactive.
- **CD-P37U-5:** CHAT ∧ NEW ∧ PENDING_PAYMENT orders are never shown in the NEW column. P2.7U S1 `cardsByColumn` sends them to the awaiting list (`AwaitingPayList`, `QrOrderBits.tsx`). So the `pos-ord-card-chatpay-<ref>` chip sits on the awaiting card, and `OrderCardView` `chatPayNote` (UNPAID chat card) is unchanged.
- **CD-P37U-6:** `MemberTierText` uses `p.chatPay` (systemId/unitId/deviceId) as its target, so the panel gets UI-13 only from the orders screen. The orders screen is the only caller.
- **CD-P37U-7:** in the harness, `receiptAuto` goes back off right after the sale. The chip is already rendered from the page prop when this happens, so it is still in the shot (stricter than "after the shot").

## Fixtures (CD-P37U-10 · harness only · `visual-pos.mts` block `POS P3.7U`)
- **LINE guard:** count `ChatChannelConnection{tenant QC, LINE, CONNECTED}`. If it is > 0, `settings-chat-card-on` and `paydone-line-auto` fail with a `SKIP:` reason, and nothing is switched on.
- **`settings.pos.chat`:** written by a jsonb merge on `{pos,chat}` only. The original value is kept in `settings.pos._qcP37uBefore {had, v}`, so a killed run restores from that key. Off states delete the key (W15 default). `card-on` = receiptAuto + orderStatus. `paydone` = receiptAuto, turned off right after the sale. Restored at the last job, in finally and on signal.
- **Temporary CHAT system:** `แชท (ภาพ QC P3.7U <pid>)` via `system/service.createSystem`. Leftovers from dead pids are swept. It gets a WEBCHAT connection (`ensureWebchatConnection`; sending is a no-op, so no network) and one room from `receiveWebchatInbound`. With the system present, the CHAT card is OFF, which is a real state for a shop without LINE.
- **Orders:** made through `pos/order.ingestOrder` as the owner, on the CHAT channel.
  - `paylink`: room + QC member (UI-13).
  - `nolink`: no room.
  - `sent`: a new order per shot. The harness presses the real `pos-ord-chatpay-send`.
  - `requested`: the latest `sent` order, or, when that state runs alone, a new order + `pos-chat-bridges.requestChatPayment` (root).
- **PromptPay:** `ensureQcPromptPay` (existing P1.7U helper; restored by `cleanupIntents`) also runs for P3.7U orders states.
- **PayDone:** `sale-done-member` flow (real PAID bill tied to the QC member, kept like `sale-done-member`) via the existing `prepMemberFixture`.
- **Cleanup**, at the last P3.7U job, in finally and on signal, in this order:
  1. Restore the chat settings first, so the drain of the reject events sees the switches off.
  2. `rejectOrder` every NEW order of the run. This cancels the intent in the same tx.
  3. Delete the run's order rows: events, lines, intents, outbox (keys containing the ids), audit, ops (since `RUN_STARTED`).
  4. Delete every chat row of the temporary system: read/pref/event/ai/attachment/message/conversation/contact/connection/setting/quick-reply/example, plus outbox `chat.msg.<id>`, AppNotification bodies holding the room id, AppSystemUnit and AppSystem.
- Every state uses a fresh browser context (as P3.4U does). There is no reseed and no snapshot request.

## `--state` list for the controller's QC5 round (one pass at a time: owner th → cashier th → owner en → cashier en)
- **owner** (`--user owner --states`):
  - `settings-chat-card-off`, `settings-chat-card-on`, `settings-chat-sheet`, `settings-chat-sheet-invalid`: 1440/1024/390
  - `orders-detail-chat-paylink`, `orders-detail-chat-nolink`, `orders-detail-chat-sent`, `orders-chat-card-requested`: 1440/1024/390
  - `paydone-line-auto`: 1440 only
  - **25 shots th · 9 shots en (1440)**
- **cashier** (`--user cashier --states`): `settings-chat-card-readonly` and `orders-detail-chat-paylink` (needPerm) at 1440/1024/390. **6 shots th · 2 shots en.**
- `settings-shark` and `orders-mixed` are untouched (not re-shot).
- Command: `bash scripts/iso.sh bash scripts/qc5.sh … visual-pos.mts p3.7u --user <u> --states --base <qc5>` (+ `LOCALE=en`). This is the controller's command; the builder ran only `--dry`.

## OP lines
- §"แจ้งเจ้าของโมดูล Chat" / P3.7 S owner (fix1 F1 · controller B 22 Oct): the "cannot turn a chat switch ON without a LINKED LINE" rule is client-only (UI) today — enforce the LINKED check server-side in `setPosChatSettings` later.
- **§"แจ้งเจ้าของโมดูล Chat":** the bubble style of bot/system rows (`senderUserId null`, `meta.source "pos"`) in chat rooms belongs to the chat module, not POS (CD-P37U-8).
- **Controller follow-up:** a delivery-status reader through the chat seam (auto receipt / status send result) → OP §Chat. The card chip is derived from order state.
- **Owner-ack (derived, no mockup):**
  - the CHAT card switch rows, quota line, all-off note and sheet (statusKinds + pause hours)
  - the 09 pay-link block (button, reasons, results, copy)
  - the awaiting-card chip "ส่งลิงก์ชำระแล้ว · รอชำระ ฿x · ชำระภายใน HH:MM"
  - the UI-13 "name · tier" line
  - the PayDone chip "ส่งใบเสร็จทาง LINE อัตโนมัติ"
  - no bot-reply preview: the reply texts are server tables (CD-P37U-9)

## Gates at product head **30cec653** (dirty=0 · QC4 · POS lock · iso.sh) — `date -u` 21 Oct 22:36–22:58Z
- **typecheck:** `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → head 30cec653, dirty=0, **EXIT 0**.
- **`visual-pos.mts p3.7u --states --dry` (CI=1 via iso.sh), all rc 0:**
  - owner th 25 shots · cashier th 6 · owner en 9 · cashier en 2
  - `--list` rc 0 (270 states)
  - `p3.9u --dry` rc 0 (27 shots, unchanged)
  - `--state orders-chat-card-requested` rc 0 (3)
- **Chat suites, run once by hand (unforced, QC4 command; not in `pos-gates.json`):** `qc-chat-security` 38/38 (findings 0) · `qc-chat-security-scope` 20/20 · `qc-chat-core-v2` 47/47. All EXIT 0, = base.
- **pre-submit (run 1 of ≤ 2):**
```
bash scripts/iso.sh bash scripts/pos-pre-submit.sh /root/projects/shark-pos-p11 --wo qc-pos-p3.7 --env P37_LANE_PIN=8c0fc3c4 --set core,money \
  --also qc-pos-p2.8,qc-pos-p2.13,qc-pos-p2.7,qc-pos-p1.11,qc-pos-p1.12,qc-hf-pos-page-authz
```
  Logs are in `/root/pos-runs/presubmit-shark-pos-p11-20261021T223729Z`.

```
PRESUBMIT-TABLE head=30cec653 tree=/root/projects/shark-pos-p11
suite                        exit pass/total     s  failed
wo-qc-pos-p3.7-run1          1    41/42         74  P3.7-ST3
wo-qc-pos-p3.7-run2          1    41/42         87  P3.7-ST3
wo-qc-pos-p3.7-nodb          1    3/4            3  P3.7-ST3
qc-pos-p1.1                  0    180/180      167
qc-pos-p1.3                  0    128/128      134
qc-pos-p1.6                  0    48/48         41
qc-pos-p1.11                 0    38/38         36
qc-pos-p1.12                 0    72/72         83
qc-pos-p1.18                 0    81/81         40
qc-pos-p2.7                  0    42/42         66
qc-pos-p2.8                  0    61/61         93
qc-pos-p2.13                 0    54/54         78
qc-hf-fu                     1    28/29        111  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-pos-page-authz         0    87/87          4
qc-hf-tx                     0    22/22         24
qc-hf-fu2                    1    30/31         24  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-restaurant-money          0    6/6            4
qc-shop-refund               0    12/12          5
qc-hotel-money               0    5/5            4
qc-ticket-money              0    6/6            4
qc-subscription-money        0    14/14          5
qc-account-cpa               0    107/107       12
qc-acc-v2-pos-lines          1    65/79          8  PL1.1,PL1.2,PL1.3,PL1.4,PL1.6,PL1.7 … [accepted]
fitness-noenv                0    53/53         13
fitness-qc4                  0    53/53         13
fitness-pos                  0    8/8            8
gen-check                    0    -              1
PRESUBMIT head=30cec653 green=21 red=6 expected-lane-pin=2 unexpected-red=wo-qc-pos-p3.7-run1,wo-qc-pos-p3.7-run2,wo-qc-pos-p3.7-nodb,qc-acc-v2-pos-lines · wo: qc-pos-p3.7-run1=41/42 · qc-pos-p3.7-run2=41/42 · qc-pos-p3.7-nodb=3/4 · VERDICT red (2: qc-hf-fu qc-hf-fu2)
```

### Reds explained (none is caused by P3.7U product logic)
- **`qc-pos-p3.7` ST3** = known W21 (controller addition): check `scripts/qc-pos-p3.7.mts:597`, pin `:266` `P37_PIN` 42b823e9. The suite has no LANE_PIN, so `P37_LANE_PIN=8c0fc3c4` does nothing.
  - Offending items: P3-SKEL/P3.6 migrations, plus `pos/{refund-shared,refund,register-shared,register,service}.ts` and outbox-consumers `pos.shift.closed` hunks from other cards.
  - P3.7U touches nothing under `src/lib/modules/pos/` or `prisma/`. The other 41/42 and `--no-db` 3/4 match the base. guardHits 0 · residue 0 · leaks 0.
  - No ORACLE-EDIT (as instructed).
- **`qc-hf-fu` ST1** = lane pin: check `scripts/qc-hf-fu.mts:591`, §4 list `:284–290` (`scripts/visual-pos.mts`, `src/components/pos/register/PayDone.tsx`), LANE_PIN `:233` 85c366dd. U cards that touch visual-pos/PayDone have been re-pinned at merge before (CD-RP6b/RP7).
- **`qc-hf-fu2` ST1** = lane pin: check `scripts/qc-hf-fu2.mts:472`, PINNED_FIXED `:256` (RegisterScreen.tsx = `F.regScreen`), LANE_PIN `:191` 85c366dd. Cause: the `RegisterScreen.tsx` prop pass-through (CD-P37U-7 shell named in the prompt) and P3.7U hunks that carry no HF-FU2 mark. Controller re-pins at merge.
- **`qc-acc-v2-pos-lines`** = accepted in the manifest (QC4 has no acc-v2 seed). Unrelated.

## CONTROLLER-DECISION
- **CD-B-U1 (re-pin at merge):** add `qc-hf-fu` ST1 (visual-pos.mts + PayDone.tsx) and `qc-hf-fu2` ST1 (RegisterScreen.tsx + unmarked P3.7U hunks) to the P3.7U merge re-pin, the same class as CD-RP6b/RP7/RP11.
- **CD-B-U2 (`qc-pos-p3.7` ST3):** stays W21 red (owner W21 pending). No builder action.
- **CD-B-U3 (`pos-gates.json`):** the `qc-chat-*` suites are still not in the manifest. They were run by hand once (green). The controller decides whether to add them.
- **CD-B-U4 (derived layouts, owner-ack in OP):** CD-P37U-2 "turn on blocked / turn off allowed" when not LINKED; awaiting-card placement of the chatpay chip (CD-P37U-5). Accept or require a change.

## Fix round 1 (controller B · 21 Oct 23:0xZ · R1 MERGEABLE)
- **F2 Low** `OrderChatBits.tsx:89` — copy-link button now shows whenever `!res.sent && res.statusUrl` (also for `duplicated` whose first row FAILED/PENDING). F1 accepted UI-only → OP line above. No other change.
