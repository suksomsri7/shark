# P3.9U — builder notes (account B lane · 21 Oct 2026) · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p3.9u`

Base `origin/session/pos` **26b831d2** (product tip 959b257a + ledger/pos-oracle-check only) · prompt `ledger/pos-briefs/pos-prompt-accountA-P3.9U-BUILD.md` (rulings 1–6 · CD-P39U-1…5).
Lane pin for gates: `P39_LANE_PIN=26b831d2` (card PIN stays 8bded5a7).

## Status (21 Oct 2026 ~20:5xZ) — DONE, not merged
- Code head **447a5d8c** (typechecked · dirty 0) · this notes commit on top = ledger only.
- `qc-pos-p3.9` forced **48/48 ×2** · `--no-db` **6/6** (P39_LANE_PIN=26b831d2 · SHARK_AI_MOCK=1 · card PIN untouched 8bded5a7).
- Typecheck `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` at 447a5d8c dirty 0 → **exit 0** (20:31–20:35Z, once).
- `visual-pos.mts p3.9u --states --dry` (iso · CI=1): th owner 27 shots rc 0 · th cashier 3 rc 0 · en owner 9 rc 0 · en cashier 1 rc 0.

## Progress
- [x] (1) panel action `src/lib/modules/pos/ai-panel-actions.ts` + messages `pos.ai.panel.*` · `pos.settings.ai.{sheetOpen,save,cancel,saved,hourValue,managersEmpty,managersMax,invalidField,saveFailed}` (th+en)
- [x] (2) 08 panel — `reports/AiBriefPanel.tsx` (new) · `ReportsOverview.tsx` bottom row staff + panel · `page.tsx` refused panel under the page refusal (overview only)
- [x] (3) dock seed — `AiDock.tsx` reads optional `detail.prompt` (no detail ⇒ seed null ⇒ old behaviour) · `AiChat.tsx` prop `seed` + one effect → input prefill (no auto-send)
- [x] (4) AI card + brief sheet — `settings/AiBriefSheet.tsx` (new) · `SharkSettings.tsx` AI branch (owner switch · sheet button · ownerOnly line · switch refusal) · `settings/page.tsx` `ai={isOwner, managers}` via `listStaffAccess` (CD-P39U-3)
- [x] (5) A11 verify — S shipped `ReportsClient` A11 group + `GeneralSettings` A11 row (default 3 · A1–A10 untouched); no code change · shot by `reports-anomalies-a11` / `settings-general-anomaly-a11`
- [x] (6) visual `P39U_WO`/`P39U_PLAN` (10 states) + inventory +13 rows + `ledger/pos-briefs/pos-spec-P3.9-ai-ui.md`
- [x] (7) merge origin/session/pos fae2250f (87619d0f · ledger only) → pre-submit ×2 → typecheck 0
/tmp/claude-0/-root/9878a238-0754-5958-805a-a0391fccc617/scratchpad/notes-body.md
## Gates — pre-submit run 2 (final · 20:35Z · logs /root/pos-runs/presubmit-shark-pos-p11-20261021T203519Z)
```
PRESUBMIT-TABLE head=447a5d8c tree=/root/projects/shark-pos-p11
suite                        exit pass/total     s  failed
wo-qc-pos-p3.9-run1          0    48/48         49  
wo-qc-pos-p3.9-run2          0    48/48         45  
wo-qc-pos-p3.9-nodb          0    6/6            1  
qc-pos-p1.1                  0    180/180      163  
qc-pos-p1.3                  0    128/128      139  
qc-pos-p1.6                  0    48/48         41  
qc-pos-p1.12                 0    72/72         80  
qc-pos-p1.16                 0    28/28         28  
qc-pos-p1.17                 0    40/40          8  
qc-pos-p1.18                 0    81/81         40  
qc-pos-p2.1                  0    55/55         51  
qc-pos-p2.7                  0    42/42         69  
qc-pos-p2.8                  0    61/61         89  
qc-pos-p2.9                  0    62/62        111  
qc-pos-p2.9b                 0    53/53        117  
qc-pos-p2.10                 0    13/13         24  
qc-pos-p2.11                 0    34/34         69  
qc-pos-p2.12                 0    33/33         57  
qc-pos-p2.13                 0    54/54         73  
qc-pos-p2.14                 0    60/60         71  
qc-hf-fu                     1    28/29        112  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-pos-page-authz         0    87/87          4  
qc-hf-reports-authz          0    79/79          5  
qc-hf-tx                     0    22/22         24  
qc-hf-fu2                    1    30/31         27  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-restaurant-money          0    6/6            5  
qc-shop-refund               0    12/12          6  
qc-hotel-money               0    5/5            4  
qc-ticket-money              0    6/6            4  
qc-subscription-money        0    14/14          5  
qc-account-cpa               0    107/107       13  
qc-acc-v2-pos-lines          1    65/79          9  PL1.1,PL1.2,PL1.3,PL1.4,PL1.6,PL1.7 … [accepted]
                                  ↳ ❌ PL1.1 เอกสารบิลขายหน้าร้าน 2 ใบ — ได้ 0 · ควรได้ 2
                                  ↳ ❌ PL1.2 บรรทัดรวม 3 บรรทัด — ได้ 0 · ควรได้ 3
                                  ↳ ❌ PL1.3 ทุกบรรทัดผูกทะเบียนสินค้า (productId) — ได้ 0 · ควรได้ 3
fitness-noenv                0    53/53         15  
fitness-qc4                  0    53/53         15  
fitness-pos                  0    8/8            9  
gen-check                    0    -              2  
PRESUBMIT head=447a5d8c green=33 red=3 expected-lane-pin=2 unexpected-red=qc-acc-v2-pos-lines · wo: qc-pos-p3.9-run1=48/48 · qc-pos-p3.9-run2=48/48 · qc-pos-p3.9-nodb=6/6 · VERDICT red (2: qc-hf-fu qc-hf-fu2)
```
Run 1 (87619d0f · /root/pos-runs/presubmit-shark-pos-p11-20261021T195043Z): same + `qc-pos-p2.14` V2 59/60 (no sweep run for `/^p3\.?9u/`) → fixed by 25d5560e.
- `qc-acc-v2-pos-lines` 65/79 = manifest-**accepted** (QC4 has no acc-v2 seed, since P1) — not caused by this card.

## Lane-pin reds (expected · controller re-pin at merge)
- `qc-hf-fu` HF-FU-ST1 (`scripts/qc-hf-fu.mts` ST1 · §4 forbidden list): `scripts/visual-pos.mts` changed vs merge-base bafdf89f — the P39U harness block (same class as P3.4U/P3.5U).
- `qc-hf-fu2` HF-FU2-ST1 (pin 72669941 · every hunk must carry HF-FU2): `reports/AiBriefPanel.tsx` (new) · `reports/ReportsOverview.tsx:9 :23 :855` · `reports/page.tsx:2 :16 :87` · `settings/AiBriefSheet.tsx` (new) · …(+17: SharkSettings/settings page/AiDock/AiChat/messages/inventory/visual) — all hunks marked `POS P3.9U ▸ … ◂`.

## `--state` list for the controller's QC5 round (`visual-pos.mts p3.9u --states`, pages reports + settings)
- `--user owner` th (1440/1024/390) + `LOCALE=en` 1440: `reports-ai-panel-brief` · `reports-ai-panel-empty` · `reports-ai-panel-off` · `reports-anomalies-a11` · `settings-general-anomaly-a11` · `settings-ai-card-off` · `settings-ai-card-linked` · `settings-ai-brief-sheet` · `settings-ai-brief-sheet-invalid` (owner th 27 · en 9)
- `--user cashier` th (3 sizes) + en 1440: `reports-ai-panel-refused` (th 3 · en 1)
- New build needed (UI + action changed). Fixture writes on QC5: day-keyed bills `posqc-vis-p39u-*` (kept) · `settings.pos.ai` restored · 3 audit rows deleted · temp MANAGER membership `posqc-coffee-mb-p39u-mgr` deleted.
