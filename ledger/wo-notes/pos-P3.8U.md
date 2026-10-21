# P3.8U — builder notes (account B lane · 21–22 Oct 2026) · tree `/root/projects/shark-pos-b` · branch `wip/pos-p3.8u`

Base `origin/session/pos` 50efa4dc (product tip **8c0fc3c4** + ledger only) · prompt `ledger/pos-briefs/pos-prompt-accountB-P3.8U-BUILD.md` (CD-P38U-1…11 confirmed + controller additions).
Card pin `qc-pos-p3.8` stays 42b823e9 (`P38_PIN` never set) · `P38_LANE_PIN=8c0fc3c4` passed for uniformity only.

## Progress
- [x] (1) messages th/en — `pos.settings.tabs.board` · `pos.settings.board.*` (+ `.room.*` · `.others.*` · `.errors.*`) · `pos.report.anomaly.toCard.*` · `pos.ai.panel.board` · `pos.shift.{boardCard,boardCardDone,hintTitle,hintRoom,hintCard,hintCardEvery}`
- [x] (2) tab `board` + page-server reads + create-board
- [x] (3) wrapper `posBoardCardsAction` (CD-P38U-2)
- [x] (4) anomaly button/chips + 08 panel link
- [x] (5) shifts chip + hint lines
- [x] (6) KANBAN card link → `?tab=board`
- [x] (7) harness + inventory + sweep row + spec
- [ ] (8) merge origin/session/pos → gates
