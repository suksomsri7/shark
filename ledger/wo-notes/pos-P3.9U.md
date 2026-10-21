# P3.9U — builder notes (account B lane · 21 Oct 2026) · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p3.9u`

Base `origin/session/pos` **26b831d2** (product tip 959b257a + ledger/pos-oracle-check only) · prompt `ledger/pos-briefs/pos-prompt-accountA-P3.9U-BUILD.md` (rulings 1–6 · CD-P39U-1…5).
Lane pin for gates: `P39_LANE_PIN=26b831d2` (card PIN stays 8bded5a7).

## Progress
- [x] (1) panel action `src/lib/modules/pos/ai-panel-actions.ts` + messages `pos.ai.panel.*` · `pos.settings.ai.{sheetOpen,save,cancel,saved,hourValue,managersEmpty,managersMax,invalidField,saveFailed}` (th+en)
- [x] (2) 08 panel — `reports/AiBriefPanel.tsx` (new) · `ReportsOverview.tsx` bottom row staff + panel · `page.tsx` refused panel under the page refusal (overview only)
- [x] (3) dock seed — `AiDock.tsx` reads optional `detail.prompt` (no detail ⇒ seed null ⇒ old behaviour) · `AiChat.tsx` prop `seed` + one effect → input prefill (no auto-send)
- [ ] (4) AI card + brief sheet
- [ ] (5) A11 verify
- [ ] (6) visual + inventory + spec
- [ ] (7) merge origin/session/pos → gates
