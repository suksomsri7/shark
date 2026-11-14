# HR H4.9-FIX1 — builder notes (lane 3 · branch `wip/hr-h4.9-fix1` from session/hr `2ab0c6b62`)

Evidence in: `ledger/wo-notes/hr-H4-close-qcall.txt` (c1 · c2 · c5 · c0-1). Scratch/logs: `scratchpad/h49fix1/` (untracked).

## Changes
1. **c1 qc-ai-skills SK-4.2** — `src/lib/ai/skills.ts:198-199` (product): hr skill summary "(ข้อเสนอต้องมีคนยืนยัน)" → "(proposals need a human to confirm)"; marked `// HR H4.9 ▸ … ◂`.
   Pin found: `scripts/qc-hr-h4.3.mts:154` (S1.3) requires `summary.includes("ข้อเสนอต้องมีคนยืนยัน")` → now red. NOT edited (awaiting ruling).
   No other fixture/generator/doc pins the summary (grep "Staff: who is on today" → only skills.ts + the qcall note; briefs/notes mention the phrase historically only).
2. **c2 qc-nav-functions S5** — `scripts/qc-nav-functions.mts:321-324` ORACLE-EDIT (HR H4.9 · controller): one `IN_PAGE_ENTRIES` row
   `{ type: "HR", rest: "/hr/reports", entryFile: "src/lib/modules/hr/overview-ui.tsx", href: /href=\{`\$\{s\}\/hr\/reports`\}/ }`.
   Verified: `src/lib/modules/hr/overview-ui.tsx:70` `<Tile testId="hr-overview-reports-link" … href={`${s}/hr/reports`} />`, `s = /app/sys/${systemId}` (line 40); tile is in `HrTeamOverviewSection`, rendered by `HrHub` (ui.tsx:48). Hotel/booking reds untouched.
3. **c5 qc-pos-p6.2 D2** — `docs/sds/modules/pos.md` (docs only): count line 5 (88→91, +3 of HR H4.2 `540a1008b`), §4 heading (91 ชื่อ), new §4 bullet after the SVC bullet listing `salesFacts`, `SalesByHourResult`, `SalesByHourDay` with descriptions read from `pos/reports.ts:2143-2190`.
   D2 rule (qc-pos-p6.2.mts:682,687): ``word = (w) => new RegExp(`(^|[^\\w])${esc(w)}(?![\\w])`).test(doc)`` over every facade name from `facadeOf(index.ts)` (`export {…}`/`export type {…}` + `export const|type|…`). Replicated read-only (`scratchpad/h49fix1/d2check.mjs`): new doc 91 names · missing 0; positive control on HEAD doc → missing 3 (SalesByHourResult, SalesByHourDay, salesFacts) = the qcall finding. Suite not run (refuses lane DBs).
4. **c0-1 qc-pages RG-1** — `src/lib/pages/registry.ts:99-105` (product, marked `HR H4.9`): `S("HR","/hr/roster","ตารางกะ","🗓️")` · `S("HR","/hr/requests","คำขอพนักงาน","📥")` · `S("HR","/hr/settings","ตั้งค่าพนักงาน","⚙️")` · `S("HR","/hr/settings/law","ตารางกฎหมาย (HR)","⚖️")` — keys `S:HR/hr/roster` … match the 4 `childrenFor` HR items (layout.tsx:158,161,164,165); all 4 page files exist. WidgetDef has no permission field (rows = key/kind/type/suffix/label/icon only).
   **Runtime effect**: the 4 become selectable in the Page builder (`availableWidgets` → `widgetsFor`, service.ts:111-121) for any business unit whose tenant has an HR system available; once placed, `/p/[slug]` and `/app/pages/[pageId]` render them as plain links `/app/sys/<hrSystemId>/hr/...` (widgetHref). No menu change, no data widget, no DB change. The registry does not filter by viewer permission (same as the existing 6 HR widgets): a Page member without rights who taps one gets the destination page's own guard (404 — roster: OWNER/MANAGER/hr.employee.create; requests: 404 if no request kind visible; settings + law: OWNER/hr.employee.create).

## Results (lane 3 DB · iso + qc-hr + gate lock · QC_FORCE=1)
seeds: hr-seed-law-draft --apply (0 created · 10 unchanged) · seed-hr-qc 34/34
qc-ai-skills 23/23 ✅ · qc-pages 31/31 ✅ · qc-ai-tools 18/18 ✅ · qc-ai-tools2 8/8 ✅ · qc-hr-h4.2 57/57 ✅ · qc-hr-h4.8 48/48 ✅ · qc-hr-h1.3 63/63 ✅ · qc-hr-h2.4 68/68 ✅ · qc-hr-h0.6 55/55 ✅ · qc-hr-money-2 57/57 ✅ · qc-hr-hf-sso 41/41 ✅ · fitness 54/54 ✅ ×2 (env / -u DATABASE_URL -u DIRECT_URL) · fitness-hr 9/9 ✅ ×2
qc-nav-functions ❌ S5 only HOTEL ×14 + BOOKING ×2 (class b, unchanged) — HR line gone (HR 10/11 route + in-page entry)
qc-hr-h4.3 43/45 ❌ S1.3 (Thai pin) · S1.6 (oracles=scripts/qc-nav-functions.mts)
qc-hr-priv-2 45/47 ❌ S4 (frozen,oracles changed: src/lib/ai/skills.ts scripts/qc-nav-functions.mts) · S5 (outside=src/lib/ai/skills.ts,src/lib/pages/registry.ts)
typecheck (clean .next/types + tsbuildinfo) exit 0.

## Awaiting controller ruling (proposed explicit acceptances — NOT applied)
- qc-hr-h4.3 S1.3 (`qc-hr-h4.3.mts:154`): `includes("ข้อเสนอต้องมีคนยืนยัน")` → `includes("proposals need a human to confirm")` (+ S1.3 registry text line 28).
- qc-hr-h4.3 S1.6 (`qc-hr-h4.3-lib.mts:192-204`): `H49_ALLOW = new Set(["scripts/qc-nav-functions.mts"])`, `h49Ok(f)` = in allow-list && ≥1 hunk && every hunk has an added line containing `ORACLE-EDIT (HR H4.9 · controller)`; add `!h49Ok(f)` to `oraclesLeft`.
- qc-hr-priv-2 S4 (`qc-hr-priv-2.mts:106-115`): accept `src/lib/ai/skills.ts` in FROZEN when every hunk adds a line with `HR H4.9`; accept `scripts/qc-nav-functions.mts` in OLD when every hunk adds `ORACLE-EDIT (HR H4.9 · controller)`.
- qc-hr-priv-2 S5 (`:117-121`): treat `src/lib/ai/skills.ts`, `src/lib/pages/registry.ts` as allowed when every hunk adds a line with `HR H4.9`.

## Rulings applied (controller · all four approved as worded) — r2
- `scripts/qc-hr-h4.3.mts` S1.3 (CHECKS line 28 + :154): pins "proposals need a human to confirm".
- `scripts/qc-hr-h4.3-lib.mts` S1.6: `H49_ALLOW = {scripts/qc-nav-functions.mts, scripts/qc-hr-priv-2.mts}` + `h49Ok` (every hunk adds `ORACLE-EDIT (HR H4.9 · controller)`) in `oraclesLeft`. Extension per ruling: `qc-hr-priv-2.mts` (its own S4/S5 edit trips h4.3 S1.6).
- `scripts/qc-hr-priv-2.mts` S4: `H49_MARK` = skills.ts → "HR H4.9" · qc-nav-functions.mts → ORACLE-EDIT marker; extension per ruling: `qc-hr-h4.3.mts`, `qc-hr-h4.3-lib.mts` (ORACLE-EDIT marker; they are in OLD and lack the PRIV-2 marker). FROZEN diff and OLD filter both drop h49Ok files. S5: `H49_SRC = [skills.ts, registry.ts]`, every hunk adds "HR H4.9".
- money-2 / hf-sso statics: not tripped, no edit.
r2 results: h4.3 45/45 · priv-2 47/47 · money-2 57/57 · hf-sso 41/41 · h1.3 63/63 · h2.4 68/68 · ai-skills 23/23 · pages 31/31 · fitness 54/54 ×2 · fitness-hr 9/9 ×2 · nav-functions S5 = HOTEL ×14 + BOOKING ×2 only (class b).
