# Brief — P3.12 ข้อสอบไขว้ทุกระบบ + parity + HANDOVER-P3 (ปิดเฟส 3) · lane S (tooling/ledger/oracle-edits; no money writes ⇒ R1, hunter only if §10.6 adds product code) · DRAFT by brief drafter (account B) 22 Oct 2026 01:2xZ — controller rules in §10

Read-only survey of `session/pos` **74484db5** (product tip **a58122fc**; `git diff --name-only a58122fc 74484db5` = 3 ledger files · working tree clean = ledger only). Every path:line is at 74484db5. Plan row `POS-MASTER-PLAN.md:94` ("P3.12 ข้อสอบไขว้ทุกระบบ + parity + HANDOVER-P3"); precedent = P2.14 (`HANDOVER-2026-10-16-POS-P2.md` §2–§3, `scripts/qc-pos-p2.14.mts` G1–G4 · V1–V4 · H1–H3 `:114–126`). Counter 51/55 (`POS-RESUME.md:2054`). Notes → `ledger/wo-notes/pos-P3.12.md`.

⚠️ Prompt-vs-code (read first):
1. **P3.12 cannot start before P3.6U and P3-SKEL U merge.** P3.6U builder is running (tree p11, `POS-RESUME.md:2055`); P3-SKEL U has only a prompt (`pos-prompt-accountB-P3-SKEL-U-BUILD.md`). Both add sweep rows + owner-ack W-items that this card collects.
2. **The counter does not close.** 51 + remaining cards (P3.6U · P3-SKEL U · P3.12 · P4 ×3 · P5 ×3 · P6 ×2 = 11) = 62 ≠ 55. P0–P2 plan rows = 36 (`POS-MASTER-PLAN.md:40–92`), P3–P6 = 20, but the counter stood at 44 when P2 closed (it counts U merges). §10.9 asks for one counting rule.
3. **W21 is still unanswered** (`POS-OWNER-PENDING.md:309`). Four known reds remain in every full gate run: `qc-pos-p3.4` ST2 · `qc-pos-p3.7` ST3 · `qc-pos-p3.8` ST2+ST3 (gates120 `POS-RESUME.md:2043`). The earlier ORACLE-EDIT draft was refused by the Claude Code permission filter ("Security Test Removal"), so the fix must **re-base the assertion, not delete it** (§4 e).
4. **Many P3 OP lines live only in wo-notes.** OP has §ACCOUNT/HR/Inventory/AI/Kanban/Meeting (`POS-OWNER-PENDING.md:48–73, :316–321`) but no §Chat, §CRM, §platform/payment, §app-shell, §settings/staff. The drafted lines are at `wo-notes/pos-P3.7.md:68–73`, `pos-P3.7U.md:89–100`, `pos-P3.6.md:137–147, :224–230`, `pos-P3-SKEL.md:41–45, :137–141`, `pos-P3.9U.md:51–53`.
5. **`qc-pos-p1.6` R2 scans only `src/lib/modules/pos`** (`scripts/qc-pos-p1.6.mts:484`). Three POS action files sit outside it: `src/lib/pos-board-actions.ts` · `pos-board-ui-actions.ts` · `pos-integrations-actions.ts` (the third one is from P1.18, not only P3.8U — `pos-P3.8U-review.md:26` names two).
6. **Integration facts still point at P3** (and shops see it: `SharkSettings.tsx:211, :259` SoonChip "เร็ว ๆ นี้ · {phase}" (`th/pos.json:2694`) + `:281` prints `f.phase` beside each fact). The same class of stale label exists in `products/ProductPanel.tsx:38, :264` ("P2.3" literal). `src/lib/pos-integrations.ts:53` voucherPayment "P3" · `:55` promptpayReconcile "P3.10" · `:57` lowStockReorder "P3" · `:59` bigBillDeal "P3.x" · `:62` couponAfterPurchase "P3" · `:63` callQueueFromTable/advanceBookingBill "P3". P2.14 K1 pins three of them (`qc-pos-p2.14.mts:399–401`). After P3 closes, "P3" is a closed-phase label (the K1 rule `:110`).
7. **The machine is full.** The build on tree d needs heap 10240 / ISO_MEM 13500M + swap ≥ 12G + ≥ 12 GB free RAM (`POS-RESUME.md:2012`, LANE-RULES 🔴 23:25Z). The qc:all run on a Neon branch must not overlap the build.

## 1. Scope / goal
Close P3 the way P2.14 closed P2, with no new product features:
(a) one cross-system run: the POS gate set on QC4 plus the whole-repo `qc:all` once on a throw-away Neon branch;
(b) a P3 parity sweep plus one owner-ack table;
(c) `ledger/HANDOVER-2026-10-2x-POS-P3.md`;
(d) triage of every P3 follow-up;
(e) the controller ORACLE-EDIT batch: p1.6 scan set · W21 re-base · K1 labels · lane-pin freeze.
Product code is touched only for the facts relabel (§10.6) and for parity fix-now items (a U fix round, as in P2.14 U2).

## 2. What exists today (verified)
- **Gate runner** `scripts/pos-gates-all.sh` + manifest `scripts/pos-gates.json`: 105 suites + 8 commands = **113** (gates120 "SET 113/113", `POS-RESUME.md:2043`). The runner rules are in `$runner` (iso.sh → qc4.sh → `GATE_LOCK_FILE=/tmp/shark-gate-pos.lock` → with-gate-lock; never export CI). There are 12 `accepted` rows (acc-v2/account-api seed · served build · member seed crash), each with a `match`.
- **Cross-module suites already in the set**: `qc-crm-c3.3` · `qc-hr` ×5 · `qc-payroll` ×2 · `qc-booking-hours-hr` · `qc-account-api-*` ×19 · `qc-acc-v2-pos-lines` · `qc-member-m1.7/m2.6–2.8` · money set · `qc-pages` · `qc-nav-functions`.
- **qc:all precedent (16 Oct)**: QC6 = Neon branch `wo-pos-qcall` cut from QC4 (host `ep-fancy-star`), wrapper `/root/pos-runs/ctl-scripts-2026-10-09/qc6.sh`. The wrapper refuses prod/QC1–QC5 hosts and sets `GATE_LOCK_FILE=/tmp/shark-gate-qcall.lock`. Driver `qcall-c.sh` (`env ISO_MEM=7G … iso.sh … qc6.sh pnpm qc:all` on tree c at a pinned head). Result `qcall-c-20261016T151116Z`: **288/420**, and all 132 reds were explained by class (HANDOVER-P2 `:55`):
  - POS/HF 36 = the "QC4-only" write gates, by design;
  - acc-v2 29 + account-api 5 = seed self-check;
  - schema drift (P2.2 NULLS NOT DISTINCT + HR columns);
  - CRM raw SQL S9;
  - crm 18 + member 36 = seed/oracle on an empty DB;
  - kanban-k2.3 needs a server;
  - ai-external/ai-skill accepted.
  qc:all seeds acc-v2/kanban/member/crm itself (`scripts/qc-all.mts:110, :165, :177`), so it is never run on QC4/QC5. The repo now has **430** `scripts/qc-*.mts`.
- **P3 seams and their suites** (from P3 notes): CRM `crm/pos-seam.ts` + `payments.ts` block (P3.6) · chat `chat/pos-seam.ts` (P3.7; R1 ran `qc-chat-security` 38 · `-scope` 20 · `core-v2` 47) · kanban `integrations.addSystemCardComment` + meeting `postSystemMessage` (P3.8; `qc-kanban-k3.3`, not in the set) · HR `hr/pos-seam*.ts` (P3.5; HR set green) · inventory `createPo` (P3.9) · AI `ai/tools-pos.ts` (P3.9; `qc-ai-*` cited ×6) · account blocks (P3.6). Seed tags: `qc-crm-c2.7/c1.3/c1.5/c3.5` = `requires: crm-seed` (c2.7 says it "reads NO seeded row", throwaway tenants) · `qc-kanban-k3.2/k3.3` kanban-seed · `qc-member-m1.9/m2.3/m3.2` member-seed · `qc-acc-v2-products` acc-v2-seed. These have no `requires` (legacy `.env.qc` guard): `qc-chat-security*` · `qc-chat-core-v2` · `qc-chat-v2-context` · `qc-meeting-invite` · `qc-inventory{,-item,-account}` · `qc-ai-{tools,tools2,skills,plan,proposals,phase-a,phase-b1,schedule,proactive}` · `qc-money-mapping` · `qc-catalog-services` · `qc-booking-edit-schedule`.
- **Sweep plan** `scripts/pos-visual-sweep.json`: 33 runs + 3 exempt (P2 23 + `p3.5u/p3.4u/p3.9u/p3.7u/p3.8u` × th/en). `qc-pos-p2.14` V1/V2 (`:119–120`) require a th+en run per page and per wo plan constant. Visual rule (LANE-RULES §เลนภาพ): a **full** shoot only at merge points and at **phase close**; the controller judges money screens 01/02/02b/05/07/12/receipts himself.
- **P3 QC5 rounds (all green at merge)**:

| U card | runs (`/root/pos-runs/`) | build | result | owner-ack |
|---|---|---|---|---|
| P3.5U | vis-p35u3 (QC5 −2 migrations ⇒ red) → vis-p35u4 78/85 → vis-p35u5 9/9 | un_z-YV7H… @b92d5598 | 85/85 | **W22** (07 hours line) |
| P3.4U | vis-p34u 19/58 (429 snapshot + console) → vis-p34u2 58/58 | WAUfKtpj… @77d72a69 | 58/58 | **W24** (5 offline surfaces) |
| P3.9U | vis-p39u 40/40 | G4XH7hWJ… @d040425c | 40/40 | none in OP — spec §6 empty-rule ack (`pos-P3.9U.md:45`) ⇒ **gap** |
| P3.7U | vis-p37u 42/42 (2nd build after swap) | 9mZ5Ha91… @86ffc207 | 42/42 | **W25** (5 surfaces) |
| P3.8U | vis-p38u …002749Z SKIP 39/47 → …003509Z 47/47 | XlCNo527… @2676f5f6 | 47/47 | **W26** (5 surfaces + PRIVATE board) |
| P3.6U · P3-SKEL U | pending | — | — | to come (CD-P36U-12 · CD-SKELU-12) |

## 3. Gaps
G1 the P3 seam suites are not all in the gate set (chat/kanban/meeting/inventory/ai/crm-c2.7) · G2 no qc:all since 16 Oct (+10 suites, +6 P3 merges, +6 migrations) · G3 no full P3 sweep at one build · G4 owner-ack scattered (W22/W24–W26 + P3.9U none + 2 pending) · G5 OP lines unpasted (⚠️4) · G6 p1.6 scan gap (⚠️5) · G7 W21 reds (⚠️3) · G8 facts labels (⚠️6) · G9 no HANDOVER-P3 · G10 follow-ups not triaged (§4 d).

## 4. Proposed oracle — `scripts/qc-pos-p3.12.mts` (≈ 24 checks · mostly static · red-before `ledger/wo-notes/P3.12-red.txt`)
Template = `qc-pos-p2.14` static half. Pins: `const PIN = process.env.P312_PIN || "<P3-close base>"` and `const LANE_PIN = process.env.P312_LANE_PIN || PIN` (LANE-RULES §ประหยัดโทเคน template). There is no merge-base and no DB except Z1. `--list` / `--no-db` as house style.
- **G1–G3 gate set**:
  - G1: the manifest holds every `qc-pos-*`/`qc-hf-*` (= p2.14 G1, PAR) **plus** the Tier-1 cross-system list in §4(a).
  - G2: no `accepted` row names a lane-pin check id (ST*) — W21 must be fixed, not accepted.
  - G3: every `accepted` row has a `match` (PAR fix2) and an opRef present in OP.
- **X1–X2 qc:all record**:
  - X1: `wo-notes/pos-P3.12.md` §qcall has head, Neon branch name, total/passed, and one class line per red, with each class ∈ the HANDOVER-P2 classes or a CONTROLLER-DECISION id.
  - X2: the branch is recorded as deleted (line "ลบ QC7").
- **V1–V3 parity**:
  - V1: sweep.json has th+en runs for `p3.6u` and `p3-skel-u` (real rows, not placeholders) — p2.14 V2 PAR extended.
  - V2: `wo-notes/pos-P3.12-parity.md` has rows · OPEN 0 · every DEVIATION cites a ruling or a W-id.
  - V3: every derived-screen owner-ack of P3 U cards has a W-row (W22 W24 W25 W26 + P3.9U + P3.6U + P3-SKEL U).
- **H1–H3 handover**:
  - H1: `HANDOVER-*-POS-P3.md` has §0–§7. Every P3 row (P3.4–P3.9 S/U · P3-SKEL S/U · P3.6U · HF-FU2) has a SHA that is an ancestor of HEAD.
  - H2: the `POS-CONTRACTS.md` event table ⊇ every `pos.*` key in `outbox-consumers.ts` (p2.14 H2 PAR).
  - H3: the triage table §4(d) — every id has exactly one disposition, and every "OP" id is present in OP.
- **K1–K3 docs**:
  - K1: no `pos-integrations.ts` fact false with label `P3`/`P3.x`/`P3.10`.
  - K2: OP has §Chat · §CRM · §platform/payment · §app-shell · §settings/staff with the P3 lines (grep the anchors of ⚠️4).
  - K3: `docs/modules/14-pos.md` head line points at HANDOVER-P3 (P2.14 ruling-7 pattern).
- **O1–O4 oracle health**:
  - O1: `qc-pos-p1.6` R2 scans `src/lib/pos-*-actions.ts`.
  - O2: `pos-oracle-check.sh <tree> <suite> --base HEAD` is not red for every `qc-pos-p3*` suite (O5/O6 W21-class).
  - O3: every `qc-pos-p3*` has a LANE_PIN env override.
  - O4: lane-pin freeze — every lane pin equals the P3-close SHA, or the chain re-pin commit (K3-of-P2.14 analogue).
- **Z1**: residue 0 (no DB writes expected; a fingerprint of POS tables before/after `--no-db` = identical).
- **Red-before**: ≈ 18/24 red at the base. Green by design (PAR): G1 POS half · G3 · H2 · O3 for p3.6/p3-skel/p3.9 · Z1.

**(a) Cross-system list + how to run.**
- **Tier 1** = append to `pos-gates.json` (QC4, POS lock, every full gate run):
  - `qc-chat-security` · `qc-chat-security-scope` · `qc-chat-core-v2` · `qc-chat-v2-context`
  - `qc-meeting-invite`
  - `qc-inventory` · `qc-inventory-item` · `qc-inventory-account`
  - `qc-ai-tools` · `qc-ai-tools2` · `qc-ai-skills` · `qc-ai-plan` · `qc-ai-proposals` · `qc-ai-phase-a` · `qc-ai-phase-b1` · `qc-ai-schedule` · `qc-ai-proactive`
  - `qc-money-mapping` · `qc-catalog-services` · `qc-booking-edit-schedule`
  - `qc-crm-c2.7` (if its first QC4 run proves "throwaway tenants only")

  Admission rule per suite: one `pos-pre-submit.sh --also <suite>` run on QC4. Green ⇒ add. Red because it needs a seed, a server, the network or a wipe ⇒ Tier 2 + an OP line to the owning lane. Never admit a suite that seeds/resets (`seed-member-qc` · `seed-kanban-qc` wipe — `qc-all.mts:66, :135`).
- **Tier 2** = qc:all only: `qc-crm-c1.3/c1.5/c3.5` · `qc-kanban-k3.2/k3.3` · `qc-member-m1.9/m2.3/m3.2/m3.3/m3.5/m3.7` · `qc-acc-v2-products` + the rest of the repo.

  Run it once, CONTROLLER-RUN, at the P3-close tip:
  1. Cut a new Neon branch from QC4 (proposal `wo-pos-qcall-p3` = "QC7").
  2. Write `.env.qc7` on tree c and copy `qc6.sh` → `qc7.sh` (host allow = the new host only; refuse prod/QC1–QC6).
  3. `env ISO_MEM=7G bash scripts/iso.sh bash qc7.sh pnpm qc:all` under `/tmp/shark-gate-qcall.lock`. Never under the POS lock, and never at the same time as the tree-d build.
  4. Classify the reds against the 16 Oct classes. Any new class = CONTROLLER-DECISION.
  5. Delete the branch. Record in notes + HANDOVER-P3 §2.
- **(b) Parity sweep.** Order:
  1. P3.6U + P3-SKEL U merge.
  2. Tree d checks out the tip and runs `qc5.sh … prisma migrate status` from tree d (the 21 Oct lesson: QC5 must be deployed from a tree at the tip).
  3. **One** build with `build-d-inner-10g.sh` (RAM guard).
  4. Serve, then shoot every `runs[]` row of sweep.json, one pass at a time (P3.5U F1: passes are not parallel-safe).
  5. `vis-summary.py` → `wo-notes/pos-P3.12-parity.md` (P1.18/P2.14 format: frame × size × locale · MATCH/DEVIATION/OPEN).
  6. The controller judges the money screens himself + P3 new states (01 company chip/credit tile · 02 on-account · 07 hours/offline · 12 credit bill · 08 AI/anomaly).
  7. Add the "#0" card chip (`pos-P3.8U-review.md:25`) and the PayDone due-date line (CD-P36U-7) to the watch list.
  8. Fix-now items → one U fix round (`wip/pos-p3.12-u`) → reshoot only the touched states.

  Expect ~160 runs / ~3 h (P2: 146 runs, 12:15–15:05Z, `POS-RESUME.md:1905–1907`).
- **(c) HANDOVER-P3 content** (P2 template §0–§7):
  - §0: 10-line summary.
  - §1: card table (P3.4–P3.9 S/U · P3-SKEL S/U · P3.6U · HF-FU2 · CD-RP re-pin commits · merge SHAs).
  - §2: gate runs (gates117–gates12x + qc:all QC7 classes).
  - §3: parity (sheet summary + QC5 run table of §2).
  - §4: owner items W9–W26+ still open, with defaults.
  - §5: leftovers = triage "defer" rows.
  - §6: how to run (trees · bind-mount remount · QC4/QC5/QC7 · build 10g · swap · pre-submit/oracle-check).
  - §7: state at handover.

  Also: ORACLE-EDIT list of the phase (`git log --grep ORACLE` since c5fc223b).
- **(d) Follow-up triage** (disposition: **12** = do in P3.12 · **P4/P5/P6** = defer to that card · **OP** = owner/other module):

| id | follow-up (source) | → |
|---|---|---|
| F1 | p1.6 scan set + `pos-integrations-actions.ts` (⚠️5) | 12 |
| F2 | W21 re-base p3.4 ST2 · p3.7 ST3 · p3.8 ST2/ST3 (OP :309) | 12 (after owner OK) |
| F3 | facts labels P3 (⚠️6) + p2.14 K1 + ProductPanel "P2.3" literal | 12 |
| F4 | paste OP lines Chat/CRM/ACCOUNT/platform/app-shell/staff (⚠️4) | 12 |
| F5 | "#0" chip when cardNo null (P3.8U F3) | 12 sweep watch → P4.3 if visible |
| F6 | PayDone/bill/receipt due date — expose `creditTerms.dueDate` (P3.6U prompt :49 :61) | P4.3 |
| F7 | chat delivery-status reader (P3.7U.md:92) · room-post reader (P3.8U.md:73) | OP Chat / Meeting |
| F8 | server-side LINKED check `setPosChatSettings` (P3.7U F1) | P5.2 |
| F9 | LINE reply-token vs push · bot bubble style (P3.7.md:72, CD-P37U-8) | OP Chat |
| F10 | P3.6 F6 lag bills NOT EXISTS (P3.6-review:90) | OP ACCOUNT |
| F11 | P3.6 B5 `postExternalSale` P2002 = already-posted (P3.6.md:178) | P5.1 |
| F12 | legacy register-ui deal link after commission drain (P3.6.md:229) | OP CRM |
| F13 | P3-SKEL H6 timestamp/nonce for real adapters · H8 poll cost | OP (P3.1-real) · P5.3 |
| F14 | W19 legal hold + PDPA erase of slips (P3-SKEL.md:140) | OP W19 |
| F15 | P3-SKEL R2 Lows (REJECTED sha · SALE_REVERSED ranking · purge scan) (review :95) | check after SKEL U → P5.1/OP |
| F16 | P3.5U F3 17C "จาก HR" tag · F4 client-safe catalogue reader · overrideTtlMin (P3.5U.md:76–79) | P4.3 |
| F17 | kanban/meeting suites missing from gate set (P3.8U.md:73) | 12 (Tier 1/2) |
| F18 | multi-day anomaly rows → no card · 86/refund card links on POS screens (P3.8U.md:73, CD-P38U-9) | OP Kanban / P4.3 |
| F19 | HF-FU2 D1c device identity (OP :280) | P5.2 |
| F20 | HF-FU2 D11 legacy setup writers on linked units (OP :281) | P5.2 (authz) |
| F21 | HF-FU2 QR-4 static PromptPay tag-62 bank-app test (OP :277) | OP W5 |
| F22 | RPT-6 print route variant (OP :278) | P4.3 |
| F23 | `qc-account-api-settings` SKIPPED (server :3215) | OP ACCOUNT-API · P6.1 precondition |
| F24 | CD-10 offline sync must refuse ON_ACCOUNT — **closed by allowlist** `offline-shared.ts:15, :115` | P5.1 (add one check) |

- **(e) ORACLE-EDITs** (controller, own `test(pos)` commits, `// ORACLE-EDIT ผู้คุม <date> (P3.12 …)`; counts before/after in notes):
  1. `qc-pos-p1.6.mts:484` scan set += `walk("src/lib").filter(/\/pos-[a-z-]*actions\.ts$/)`. Red-before = run once. If a file fails R2 (throw/no catch), that is a product fix in P3.12, not an accept.
  2. **W21 re-base (recommended over retire)**: in p3.4/p3.7/p3.8 add `Pxx_LANE_PIN` env-override, default = each card's merge SHA. ST rows judge hunks with the `ownHunks()` rule of `qc-pos-p3.6` (another card's `POS P<x> ▸ … ◂` block is not "outside the block"; unmarked = red). The probes delete A–D as CD-P36-O1 did. Nothing is removed; every assertion is kept. If the owner says "retire" instead, the replacement is a phase-level guard: O2 above plus `qc-pos-p3.12` O3.
  3. `qc-pos-p2.14.mts:399–401` K1 expected labels follow the §10.6 relabel.
  4. `pos-gates.json`: append `qc-pos-p3.12` + Tier 1. No new `accepted` row for an ST id.
  5. The lane-pin freeze batch at P3 close: all LANE_PINs → the P3-close SHA via `/root/pos-runs/ctl-scripts-2026-10-09/repin-lane.sh`, p2.10 last. Include p2.2–p2.6 contract-sha constants if the contract moved (CD-RP9b lesson, `POS-RESUME.md:2028`).

## 5. Lanes · trees · order · estimate (3-lane cap; the build counts as heavy — lane 3 = light work only)
1. Oracle writer (tree e or f, `wip/pos-p3.12-oracle`, ≈ 2 h).
2. Controller F2 W21 edits (only after the owner says yes) + F1 + Tier-1 admission runs (QC4, one by one, ≈ 2 h).
3. Builder S (`wip/pos-p3.12`, ≈ 3 h): facts relabel + K1 edit · OP paste · manifest · docs pointer · notes/triage · HANDOVER draft.
4. gates12x full (≈ 1.5–2 h).
5. Build d + full sweep (≈ 4 h, lane 2).
6. qc:all QC7 **after** the build (≈ 2 h, lane 2).
7. Parity sheet → U fix round (≈ 3 h if any) → reshoot touched states.
8. HANDOVER-P3 filled → R1 → merge → freeze re-pin → gates (final) → push → tg.

Wall ≈ 1.5 days.

## 6. Risks
- RAM: build 12G + qc:all 7G + QC4 suites ⇒ strictly sequential heavy steps.
- QC5 schema behind (deploy from tree d at the tip).
- Tier-1 suites with a legacy `.env.qc` guard. In POS trees `.env.qc` = QC4 (LANE-RULES 2), but any that reaches the network/LLM (`qc-ai-*`) must use mock mode or go to Tier 2 (Q2).
- The W21 filter refusal repeats ⇒ the owner must answer.
- New reds in qc:all from P3 migrations (6 since 16 Oct) on seeded modules.
- Sweep writes real rows on QC5 (bills/deposits/slips) — no reseed. The harness keeps its find-or-create fixtures.

## 7. Owner questions → OP W-items (defaults applied; nothing waits)
- **W-next-1 = W21 again**, as a concrete yes/no: "re-base the 4 ST checks with a lane pin + other-card markers, delete nothing". Default if silent: leave red, as today.
- **W-next-2**: one owner-ack bundle for the P3 derived screens (W22 W24 W25 W26 + P3.9U empty rule + P3.6U + P3-SKEL U) — images from the P3 sweep. Default: as built.
- **W-next-3**: checkpoint "ปิด P3" (like W3). Default: acknowledged; the run continues (`feedback_pos_run_to_100`).

## 8. Hard rules
COMMON + LANE-RULES verbatim:
- QC4 only via `qc4.sh` + `/tmp/shark-gate-pos.lock` + with-gate-lock; QC5 = visual lane only; QC7 = qc:all only.
- Every node command via `iso.sh` (session cgroup 5G).
- Never export CI. Never reseed/reset QC4/QC5. No `seed-*-qc`.
- Builders never build/serve.
- `pos-oracle-check.sh` before spawning any builder/reviewer; `pos-pre-submit.sh` for builder gates.
- ORACLE-EDIT = controller-only, its own test commit, with a reason line.
- No migration, no `createSale` change, no contract regen in P3.12.
- `date -u` for every ledger time. ⛔ never push `main`; never `cd`.
- Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 9. Counters / done-definition
**Done** =
- `qc-pos-p3.12` green ×2;
- full gate set green except the evidenced `accepted` rows (and 0 W21 reds if the owner agreed);
- qc:all QC7 run recorded and classified, with the branch deleted;
- parity sheet OPEN 0 after the U round;
- HANDOVER-P3 H1 green;
- OP pasted + W-next rows;
- triage table complete;
- tg report with %.

Counter: per the §10.9 ruling.

## 10. PROPOSED rulings for the controller
1. Shape = one card P3.12 (S + an optional U fix round under the same row) · oracle `qc-pos-p3.12` ≈ 24 · R1 only (no hunter unless the U round touches money screens' logic). `(confirmed · controller B …)`
2. Starts only after P3.6U and P3-SKEL U merge; the oracle writer may start now (static, pins env-overridable). `(confirmed · controller B …)`
3. Cross-system = Tier 1 joins `pos-gates.json` after a green admission run each · Tier 2 = qc:all on a new Neon branch "QC7" cut from QC4, deleted after. `(confirmed · controller B …)`
4. W21 = re-base (LANE_PIN + ownHunks), never delete; ask the owner once more as W-next-1; default leave red. `(confirmed · controller B …)`
5. p1.6 R2 scan set += `src/lib/pos-*-actions.ts` (3 files); a failing file = product fix in P3.12. `(confirmed · controller B …)`
6. Facts relabel: `voucherPayment` `couponAfterPurchase` `callQueueFromTable` `advanceBookingBill` `lowStockReorder` `bigBillDeal` → a label the owner can read. The phase string is shown to shops (⚠️6), so today the card says "เร็ว ๆ นี้ · P3" after P3 has closed. Proposal: "P4+" (or drop the suffix with a new key `soonNoPhase`). `promptpayReconcile` → "W4". The K1 ORACLE-EDIT follows. `(confirmed · controller B …)`
7. Full P3 sweep at one build; the controller judges money + new P3 states; fix-now = one U round; reshoot touched states only. `(confirmed · controller B …)`
8. Triage dispositions as §4(d); every "OP" row pasted by the builder S as ledger-only lines. `(confirmed · controller B …)`
9. Counter rule: count plan rows done ÷ 55 from P3.12 on (P3-SKEL = 5 rows at U · P3.6 row at P3.6U · P3.12 · P4.1–P6.2), and record the old merge-count in HANDOVER-P3 §7 for history. `(confirmed · controller B …)`
10. Lane-pin freeze at P3 close (all pins → P3-close SHA, p2.10 last); from P4 on, new oracles must use the PIN/LANE_PIN template and pass `pos-oracle-check.sh`. `(confirmed · controller B …)`
