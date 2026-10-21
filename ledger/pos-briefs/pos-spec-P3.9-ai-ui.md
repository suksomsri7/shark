# POS P3.9U — spec: AI UI (08 panel "สรุปเช้า POS" brief / empty / refused / off · dock seed · 10 AI card live switch + morning-brief sheet · A11 in reports/settings)

Builder U · 21 Oct 2026 · base `origin/session/pos` 26b831d2 (product tip 959b257a · P3.9 S merged 683a7cc8) · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p3.9u` · prompt `pos-prompt-accountA-P3.9U-BUILD.md` rulings 1–6 + CD-P39U-1…5 · S contract `wo-notes/pos-P3.9.md`.
**No server behaviour change.** S exports are the contract (`loadBriefInput`, `composeBrief`, `getPosAiSettingsAction`, `updatePosAiSettingsAction`, `posAiSettings`, `POS_AI_MANAGERS_MAX`). One new `"use server"` wrapper (CD-P39U-1). Brief text = template (no LLM, ruling 3).

## 1. 08 panel (ruling 1 · CD-P39U-1)
- Reader `src/lib/modules/pos/ai-panel-actions.ts` `posAiPanelAction({systemId, date?, locale?})`: session → membership (posMembership) → `assertCan pos.report.view` as boolean → POS system of the tenant → **refused** `PERMISSION_DENIED` unless `pos.report.view` at ≥ 1 linked POS unit (same rule as `loadBriefInput`) → **AI-off** `AI_OFF` when `settings.pos.ai.enabled` false (`canManage` = OWNER) → business date = today by the system cutoff (`bkkBusinessDate` + `posDayCutoffMinutes`); a valid `date` ≤ today is used instead (the panel passes the overview's `to`) → `loadBriefInput(ctx, actor-of-session, date)` → `composeBrief(input, locale)` → `{ok, title, lines, sections, anomalyHits, empty, businessDate, generatedAt, canManage}`. fix1 N1: a day with 0 bills drops only the ฿0 `sales` line; fix2 (CD-P39U-B1 final): `empty` = 0 bills **and** no actionable line (`soldOut` · `stock` · `anomalies` with a rule hit · `proposals`) (server-side); a day with sales always shows the brief. No `throw`; INTERNAL on unexpected errors.
- Component `reports/AiBriefPanel.tsx` (`"use client"`), placed in `ReportsOverview` bottom row next to the staff card (xl: staff 1.25 · panel 1; below xl stacked) — mockup 08.
  - **brief** `pos-reports-ai-panel` (accent border): spark tile + h2 `ai.brief.title` + `pos-reports-ai-at` "วิเคราะห์เมื่อ HH:MM" (`ai.panel.analyzedAt`, Bangkok time formatted on the client after mount — HF-418) · lines verbatim `pos-reports-ai-line-<n>` (`data-section`; red dot for `overShort` and for `anomalies` when a rule hit) · buttons `pos-reports-ai-draft-po` "สร้างใบสั่งซื้อ (ร่าง)" (primary) + `pos-reports-ai-ask` "ถามต่อ" · dashed footer `pos-reports-ai-propose-only` `ai.brief.proposeOnly`.
  - **empty** `pos-reports-ai-empty` `ai.brief.empty` (+ ask button) — when the day has **0 bills and no actionable line** (86 / low stock / anomaly hit / AI proposal) — CD-P39U-B1 final (fix2). A day with sales shows the brief (sales, top sellers, peak hour) even without actionable lines. With 0 bills and an actionable line the panel shows the lines + draft-PO button, minus the ฿0 sales line.
  - **refused** `pos-reports-ai-refused` `ai.panel.refused` (no figures). In `ReportsClient` it comes from the action; for an actor without `pos.report.view` at any unit the page renders the panel in refused mode **under** the page refusal card (`pos-report-refusal`) on kind=overview, without calling the action.
  - **off** `pos-reports-ai-off` dashed card `ai.brief.off` + OWNER link `pos-reports-ai-settings` → settings `?tab=shark`.
  - error `pos-reports-ai-error` + `pos-reports-ai-retry`.
- "สร้างงานในบอร์ด" is **not** rendered (CD-P39U-2) → follow-up P3.8U (`createAnomalyCardAction`).

## 2. Dock seed (CD-P39U-2)
- Buttons dispatch `CustomEvent("app:ai-open", {detail: {prompt}})`; prompts `ai.panel.seedDraftPo {date}` / `ai.panel.seedAsk {title, date}` — title + business date + intent only, **no figures / over-short / anomaly text** (fix1 F1; the AI reads data through its own scoped POS tools).
- `AiDock.tsx`: listener reads optional `detail.prompt` (non-empty string, ≤ 4000) into `seed {text, n}`; an event without detail sets `seed = null` ⇒ behaviour identical to before. `AiChat.tsx`: optional prop `seed` + one effect → input prefilled (**no auto-send**; the user presses send; confirm = existing proposal card).

## 3. 10 AI card + brief sheet (ruling 4 · CD-P39U-3)
- `settings/page.tsx` passes `ai={isOwner, managers}` on the shark tab; managers = accepted MANAGER memberships `{userId, name}` from the existing reader `listStaffAccess(tenantId)` (`@/lib/staff/service`), OWNER only.
- `SharkSettings.tsx` AI branch: OWNER loads `getPosAiSettingsAction` → header switch `pos-settings-ai-switch` (role switch · aria-checked = saved `enabled`) → `updatePosAiSettingsAction(systemId, {enabled})` → reload cards (state LINKED/OFF follows the saved value) · refusal `pos-settings-ai-switch-error` · button `pos-settings-ai-open` "ตั้งค่าสรุปเช้า" opens the sheet. Others: unchanged read-only indicator `pos-settings-card-state-ai` + `pos-settings-ai-owner-only` (`settings.ai.ownerOnly`). Dashed `AI.note` kept.
- Sheet `settings/AiBriefSheet.tsx` (`AiBriefSettings`, `pos-settings-ai-sheet`): title `settings.ai.sheetOpen`, `settings.ai.desc` under it (ruling 5) · `pos-settings-ai-brief-enabled` · `pos-settings-ai-hour` (0–23, label `hourValue` "06:00 น.") · `pos-settings-ai-email` · `pos-settings-ai-anomaly` · managers `pos-settings-ai-manager-<userId>` checkboxes (≤ `POS_AI_MANAGERS_MAX` = 50; unchecked boxes disabled when full; none ⇒ `pos-settings-ai-managers-empty`) · `pos-settings-ai-save` (changed keys only; nothing changed ⇒ close) · `pos-settings-ai-cancel`. Refusal by `field`: `brief.managerUserIds` ⇒ `settings.ai.invalidManager`, other fields ⇒ `settings.ai.invalidField` under the field, no field ⇒ `settingsRefusalMessageKey(code)` / `ownerOnly` (`pos-settings-ai-error`). Saved ids that are no longer managers are not shown and not re-sent unless the list is edited.

## 4. A11 (verify only)
`ReportsClient` A11 group (`pos-reports-anomaly-group-A11`, label `report.anomaly.rules.A11`) and `GeneralSettings` A11 row (`pos-settings-anomaly-A11-count`, `countUnit.A11` "ครั้ง", default 3 = W14) shipped in S; A1–A10 untouched. Visual states below shoot both.

## 5. Visual (`visual-pos.mts p3.9u --states` · reports + settings · 3 sizes th + LOCALE=en 1440)
| state | page | user | fixture |
|---|---|---|---|
| reports-ai-panel-brief | reports overview today | owner | AI on · 3 bills + 1 void today (createSale/voidSale, day keys, kept like P2.12U) + 3× A11 audit (actionable anomaly line) |
| reports-ai-panel-empty | reports overview 2024-01-02 | owner | AI on · 86 marks of the system + reorder points of at-risk items parked for the shot and restored (kept in `_qcP39uBefore.park`); fails with a reason if the owner has pending AI proposals |
| reports-ai-panel-refused | reports overview today | cashier | page refusal + refused panel |
| reports-ai-panel-off | reports overview today | owner | AI off |
| reports-anomalies-a11 | reports anomalies today | owner | 3× `pos.staff.schedule_override` audit (writeAudit · deleted in cleanup) |
| settings-general-anomaly-a11 | settings general | owner | — |
| settings-ai-card-off / -linked | settings shark | owner | AI off / on |
| settings-ai-brief-sheet | settings shark → sheet | owner | temp MANAGER membership (deleted in cleanup) |
| settings-ai-brief-sheet-invalid | sheet → tick temp manager → harness demotes to STAFF → save | owner | refusal `brief.managerUserIds` · role restored |
`settings.pos.ai` is written by the harness only (CD-P39U-4: jsonb_set `{pos,ai}`, original kept in `_qcP39uBefore {had, v}` and restored after the last job / finally / signal).

## 6. Owner-ack (no mockup)
Panel empty (= 0 bills and no actionable line — CD-P39U-B1 final) / refused / off states, the brief sheet, the seeded dock prefill (title + date + intent).
