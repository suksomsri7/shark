# HR VIS-5d — oracle writer notes (settings `?tab=` panels + law table · mockup 08)

Tree `/root/projects/shark-hr-l3` · branch `wip/hr-vis-5d` · base = local `session/hr` c4f5b2b99 (VIS-5a + VIS-5b, no VIS-5c) · lane DB through `qc-hr.sh` (ep-ancient-truth).
Run: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-vis-5d.mts` (unforced = SKIPPED until `HR VIS-5d` appears in settings-view.ts / settings/page.tsx).
Red output: `ledger/wo-notes/hr-VIS-5d-red.txt`.

## 1. qc-hr-vis-5d — 28 checks · on the base: 18 RED for the right reason · 10 GREEN controls · BASE-EXPECTATION 28/28 · residue none
| id | kind | on base | what |
|---|---|---|---|
| S1 | static | GREEN | changed files ⊆ VIS5D_ALLOW (brief §8 src · 2 new src + `*TemplateRowsEditor*.tsx` · th/en · inventory · matrix · this oracle · walker/seed + older oracles only with `ORACLE-EDIT (HR VIS-5d · controller)` hunks) |
| S2 | static | GREEN | every src hunk adds `HR VIS-5d` + `◂` · card files only inside the named function (base line range by TS AST, or the import block) · new files marked in lines 1–3 |
| S3 | static ctl | GREEN | §7.10 untouched list = base · payroll-rules sha |
| S4 | static | GREEN | no new `"use client"` except TemplateRowsEditor · no hex/rgba/bg-blue-/emoji · no *Satang arithmetic added · no `min-w-[` in law page/law-ui |
| S5 | static ctl | GREEN | page.tsx keeps every base testid literal (stub-note excepted) + `attendance-pay-ui`, `lifecycle-ui`, `<LeavePresetSection`, `<LeavePolicyWarningLines`, `addLeavePresetAction(`, `lp.${k}` · law page+law-ui: no `"use server"`/`<form`/`action=`/`formAction`/`onSubmit`/`@/lib/platform`, keep `hr-law-table`/`hr-law-row-`/`loadLawView` |
| S6 | static | RED | `wrap` on ModuleTabs (both pages; settings-ui.tsx counts) · `max-w-7xl` frame, no 2xl/3xl root |
| X1 | static ctl | GREEN | 22 inline wrappers (TS AST vs base file): same names = brief §2.1 · same action call text `X(fd)` · no new captured local (base: `path`, `year`) · `back` module-level · no inline action in any other VIS-5d file |
| X2 | db | RED (14/22) | each wrapper invoked as owner (FormData `{systemId}` only) → NEXT_REDIRECT → path `/hr/settings`, a result code (msg/run2/pacct) and `settingsTabOf(query)` = its tab (shifts: shift×2, normal minutes, labor · leave: policy×2, preset · holidays: ×3 · rules: clock×2, attendance, OT, att-pay · pay: engine, book, posting, pay account, bank×3). Base: the 8 shifts/run2/pacct ones land right |
| X3 | db | RED | holiday-year GET form carries hidden `tab=holidays` · law-preset forms only in the leave panel |
| V1 | pure | RED | 34 `settingsTabOf` vectors (+ the table re-checked against the brief rule) |
| N1 | db | RED | menu per viewer O M MK MB MKB MP: `hr-set-nav`, items `hr-set-nav-<tab>` in mockup order with exact labels, law item = `hr-settings-law-link`, managers item only for O → `/app/settings/staff`, one aria-current (shifts by default), class with 44 px height, heading "ตั้งค่าพนักงาน" + footnote |
| N2 | db | RED | law page: same menu, law item aria-current |
| P1 | db | RED | owner: `hr-set-panel-<tab>` per tab · own section signature only · no section id in two panels · `hr-set-connections` on every panel |
| P2 | db | RED | M/MB `?tab=life` → menu + `hr-set-empty`, no section |
| W2 | ctl | GREEN | per viewer: union over the viewer's menu tabs = today's id set (golden recorded on c4f5b2b99, stored as owner set − per-viewer regex; reproduces the measured sets exactly) · allowed lost: `hr-settings-stub-note`, `hr-settings-law-preset-off-*` (all); MB `hr-line-settings-enabled|mode|digest|cap|unit`; MKB same + `hr-life-lead-probation|lead-contract|kanban|template-onboarding|template-offboarding`; MP `hr-filing-profile-f-*|formflag|slashmode|encoding|wagemode|branchtype|lto` · allowed gained: `hr-set-*` |
| G0 | db ctl | GREEN | P / PS (payroll keys only): both pages 404 |
| G1 | db | RED | refused controls not rendered as input/select/textarea/button/form/fieldset (per-viewer regex, brief §5 corrected) · row archive/delete buttons: all-branch viewers SA,S1,S2 (etc.), MB/MKB S1/L1/H1 only (GREEN part) · read-only card has `hr-set-readonly-*` with text: MB LINE · MKB LINE + lifecycle · MP filings |
| G2 | db | RED | every element with `disabled` (not `<option>`) has aria-describedby → existing text / title / data-reason, all viewers × menu tabs. Base: law-preset-off (all), apikeys-issue (O), LINE inputs (MB/MKB), lifecycle fieldset + autoRevokePin/revokeAppAccess (MK/MKB), filings (MP) |
| F1 | db | RED | `?tab=leave&msg=ok` alert inside `hr-set-panel-leave` · `?run2=ok` / `?pacct=ok` / `?fmsg=saved` → pay panel holding the card · `?life=ok` → life panel |
| C1 | db | RED | `hr-set-connections`: "การเชื่อมต่อ (ย่อ)" + "ทั้งหมด" → `/app/settings/connections` · exactly 2 `hr-set-conn-*` rows (บัญชี · แชท LINE พนักงาน) linking `?tab=pay…#hr-pay-accounting` / `?tab=connect…#hr-line-settings` · no POS/จอง/คลัง/เปิดใช้ |
| L1 | db | RED | law page: "ตารางกฎหมาย", howPicked, `⚠ warn`, card titles ประกันสังคม / ภาษีเงินได้บุคคล (ขั้นบันได) / ค่าลดหย่อนพื้นฐาน / OT และค่าแรงขั้นต่ำ · SSO card = `<table>` with th exactly มีผลตั้งแต่ · ลูกจ้าง · นายจ้าง · ฐานต่ำสุด · ฐานสูงสุด · สมทบสูงสุด/เดือน · สถานะ, body rows = SSO rows of `loadLawView(today)` · tax th = เงินได้สุทธิทั้งปี (บาท) · อัตรา · ภาษีสะสมเมื่อเต็มขั้น · absent: แก้ได้โดยไม่ต้องอัปเดตโปรแกรม, ÷ 12, เพิ่มช่วงมีผลใหม่, ร้านยืนยัน, ในร้านตอนนี้, ผู้ช่วย AI, ทุกการแก้ไขเก็บประวัติ. Base: only the OT title + SSO table are missing |
| I1 | static | RED | `hr.setview` th=en keys, non-empty, en without Thai, right after `hr.settings`, **no other message key changed** |
| I2 | static | RED | th `hr.setview` values contain (exact): ตั้งค่าพนักงาน · กะและตารางงาน · ประเภทลาและโควตา · วันหยุด · กฎสาย/OT · รอบจ่าย · สิทธิ์ผู้จัดการ · การเชื่อมต่อระบบ · ตารางกฎหมายใช้ร่วมทุกสาขา · กะ/วันหยุด/กฎสาย ตั้งแยกรายสาขาได้ · การเชื่อมต่อ (ย่อ) · ทั้งหมด · บัญชี · ลงบัญชีเงินเดือน · แชท LINE พนักงาน · แจ้งกะ · ผลอนุมัติ · สลิป (nav "ตารางกฎหมาย" may reuse hr.law; life label = `hr.life.settings.title`) |
| I3 | db | RED | en: 7 tabs (O) + MB connect + law page — no Thai value of `hr.setview` (first 12 chars, placeholders stripped) in the text · no `‹MISSING:hr.setview` (VIS-5c V9 sentinel technique) |
| I4 | db | RED | th page header desc has no "ชั่วคราว"/"แบบย่อ" and no `hr-settings-stub-note` (Q4) · no Thai literal in added code |
| K1 | static | RED | VIS-5d rows `hr-set-nav*` on both pages · every rendered `hr-set-*` id has a VIS-5d row of its page · stub-note + law-link rows' `conditional` changed · base ids of both pages still in source |
| M1 | tooling | GREEN | matrix + walker fields (this commit) |
| Z1 | ctl | GREEN | residue · outbound |

Size 61.2 kB (59.8 KiB).

## 2. Baseline of the brief §8 suites on the untouched base c4f5b2b99 (lane DB, QC_FORCE=1, before any edit of this ticket)
| suite | result | | suite | result |
|---|---|---|---|---|
| qc-hr-vis-5a | 42/42 | | qc-hr-h3.6 | 62/62 |
| qc-hr-vis-5b | 34/34 | | qc-hr-h3.7 | 68/68 |
| qc-hr-h1.2 | 73/73 | | qc-hr-h4.2 | 57/57 |
| qc-hr-h2.4 | 68/68 | | qc-hr-h4.3 (S1.6) | 45/45 |
| qc-hr-h2.5 | 79/79 | | qc-hr-h4.4 | 86/86 |
| qc-hr-h2.7 | 94/94 | | qc-hr-h4.5 | 90/90 |
| qc-hr-h2.9 | 58/58 | | qc-hr-h4.8 | 48/48 |
| qc-hr-h3.1 | 58/58 | | qc-hr-set-1 | 25/25 |
| qc-hr-h3.2 | 64/64 | | qc-hr-priv-2 | 47/47 |
| qc-hr-h3.3 | 51/51 | | qc-hr-leave-3 | 53/53 |
| qc-hr-h3.4 | 85/85 | | qc-hr-preprod-1 | 57/57 |
| qc-hr-h3.5 | 53/53 | | | |
No anomaly: everything green on the base. `qc-hr-h2.12` does not exist (folded into h2.7 H212.5). Re-run on this oracle commit: see §8.

## 3. Corrections to the brief (verified in code)
1. **MB of the walk ≠ MB of §5.** Walk `manager-branch` = MANAGER, unit huahin, **no key** (`hr-qc-env.mts:289`). `canManageClockSettings` and `canSeeLifecycle` need OWNER or the **direct** key → walk-MB sees **no clock section and no lifecycle card**; §5's "MB" (key holder, branch-limited) is a different viewer. The oracle renders both: MB (walk) and MKB (STAFF + `hr.employee.create`, U1). Walk-MB's only "see but cannot save" card is LINE.
2. `canUseBankFiles` / `canUseFilings` (= `bankGateOf`, `bank-files/service.ts:73`): OWNER, or `hr.payroll.read` **and** `hr.payroll.pay` **and** all branches. M, MK, MB, MKB see neither card; added viewer MP (MANAGER + both payroll keys, all branches): bank presets + filings card with every field `disabled={!owner}` (needs read-only text, G1/G2); bank profile form not rendered (`onSaveProfile` null).
3. `MK` also sees `autoRevokePin` / `revokeAppAccess` locked (`lifecycle-ui.tsx:490,495` — disabled when on and not OWNER) → needs a reason too (G2), not only MB.
4. LINE save button is already hidden for non-savers (`line-ui.tsx:178 {canSave && …}`); only the 5 inputs + 5 event checkboxes are disabled.
5. Holiday year switch is a GET form (`page.tsx:418`) — `settingsTabOf` has no rule for `year`, so the builder must add a hidden `tab=holidays` input (X3). Not in the brief.
6. Q3 resolved: `/app/settings/staff` **is** the permission page ("ผู้ใช้งานและสิทธิ์", per-key grants, gate `settings` STAFF_READ/ADMIN) → OWNER-only menu link is right. `/app/settings/connections` only needs `requireTenant()` (no role gate) — same link the hub already shows.
7. Q4 without touching other blocks: render the new header desc from `hr.setview` and leave `hr.settings.desc` / `stubNote` keys as they are (unused) — any change to an `hr.settings.*` key turns vis-5b/5c S5 and this oracle's I1 red. No suite pins `hr-settings-stub-note` or those keys (h1.2 does not read the settings files).
8. `hr.law.status.draft` = "ร่าง · รอนักบัญชียืนยัน" vs mockup "ร่าง · ยังไม่มีผล" (inForce "ใช้อยู่" matches) — not pinned (§4 #9: builder reports). `hr.law.ded.*` labels differ from the mockup's two-line form — not pinned.
9. `hr.law.ot.basis` renders "÷ {days} วัน ÷ {hours} ชั่วโมง" — L1 forbids only "÷ 12".
10. `x7-todo-h4.8-apikeys` already renders (inventory has `hr-apikey*` rows) — not a TODO skip any more; now points at `?tab=connect`.
11. Lifecycle save button has **no testid** and no inventory row → cannot be press-probed; builder should add `hr-life-save` (row wo VIS-5d) — then ORACLE-EDIT adds it to `14v-settings-life.pressProbe`.
12. Suites the brief did not list that also freeze VIS-5d files: `qc-hr-h3.9` S1.5 (bank-files dir) — mechanism added; `qc-hr-vis-5c` uses the same vis-5-lib diffStatics (covered once VIS-5c merges); `qc-hr-priv-3` P8 (settings/law outcome per viewer) is layout-independent.

## 4. Builder scope (exact)
- Marker: every hunk adds a line with `HR VIS-5d` **and** `◂` (same line); new files `HR VIS-5d` in lines 1–3.
- Edit: `src/app/app/sys/[id]/hr/settings/page.tsx` · `settings/law/page.tsx` · `settings/ApiKeysCard.tsx` · `src/lib/modules/hr/law-ui.tsx` · `payroll-accounting-ui.tsx` · `leave-presets-ui.tsx` (whole files) · inside these functions only: `lifecycle-ui.tsx` SettingsForm / LifecycleSettings / tplText · `line-ui.tsx` LineSettingsCard · `work-entries-ui.tsx` WorkSettingsCard · `labor-ui.tsx` LaborSettingsCard · `attendance-pay-ui.tsx` AttendancePayPolicyCard · `payroll-run-ui.tsx` PayrollEngineCard · `bank-files/ui.tsx` BankSettingsCard · `filings/ui.tsx` FilingSettingsCard.
- New: `src/lib/modules/hr/settings-view.ts` (export `settingsTabOf(sp)`; tabs `shifts|leave|holidays|rules|pay|connect|life`) · `settings-ui.tsx` · optional `src/lib/modules/hr/*TemplateRowsEditor*.tsx` ("use client", Q8).
- Data: `hr.setview.*` only (th + en, inserted right after `hr.settings`) · inventory rows wo `VIS-5d` (+ `conditional` of `hr-settings-stub-note`, `hr-settings-law-link`).
- Test ids the oracle reads: `hr-set-nav`, `hr-set-nav-<tab>`, `hr-settings-law-link` (law menu item), `hr-set-panel-<tab>`, `hr-set-empty`, `hr-set-connections`, `hr-set-conn-*` (2), `hr-set-readonly-*`.
- Must keep (older suites, survey): `hr-life-*` ids (incl. both template textareas) stay **in lifecycle-ui.tsx** (h4.4 S13.1) — TemplateRowsEditor must not take them over; no `hr-run2-*` outside payroll-run-ui (vis-5a K3); one `<table` in payroll-run-ui (K5); vis-5a KEEP privacy lines; `HrLaborCard` body unchanged (vis-5b S3); `"hr-pay-book"`/`"hr-pay-account"` double-quoted (h3.7); `hr-holiday-preset` in a tracked file (h2.7); `hr-settings-attendance-policy`, `hr-settings-ot-policy` in page.tsx (h2.5/h2.9); bank-files/ui `.untestedLong }` `.legal }` (h3.5); filings/ui `.untestedSso }` `.wageU }` `.pdfNote }` (h3.6); no `now:` in hr pages / lifecycle-ui (h2.4 S11.1, h4.4 S12.1); new inventory rows must not use prefixes `hr-bank-`, `hr-filing`, `hr-attpay-`, `hr-life-` (owned by older WOs).

## 5. Walk (scripts/walk-hr-matrix.json + walk-hr.mts, ORACLE-EDIT (HR VIS-5d · controller))
- `14-settings` (shifts, O M MB) + new `14v-settings-leave|holidays|rules|pay|connect|life` (O M MB, `?tab=`), all 3 sizes × th/en, `configMoneyOk` M MB, mockup 08 · `15-law` (O MB; cov-15-law M automatic) · `x7-todo-h4.8-apikeys` → `?tab=connect`. Cells: 7×3×6 + 2×6 = 138 (+ cov). `--dry` 0 errors.
- pressProbe: shifts `hr-settings-shift-add`, `-shift-archive-*`, `hr-we-normal-save`, `hr-labor-save` · leave `-policy-add`, `-policy-archive-*`, `-law-preset-add-*` · holidays `-holiday-add`, `-holiday-delete-*`, `hr-holiday-preset` · rules `-clock-policy-save`, `hr-clock-site-*-save`, `-attendance-save`, `-ot-policy-save`, `hr-attpay-save` · pay `hr-run2-engine-save`, `hr-pay-book-save`, `hr-pay-account-save`, `hr-pay-posting`, `hr-bank-profile-save`, `hr-bank-preset-save`, `hr-bank-preset-del-*`, `hr-filing-profile-save` · connect `hr-line-settings-save`, `hr-apikeys-issue` · life none (no testid, §3.11).
- New walker assertions (state fields): `maxHeight` → PAGE-HEIGHT (settings 1440 ≤ 2400, 390 ≤ 4500; law 1440 ≤ 1800) · `fold` → FOLD (top of each selector inside the first viewport; `!full` = whole element; `@hrtabs` = HR tab strip): settings 1440 tabs + menu + 3rd shift row + add form (other tabs: menu + panel), 1024 menu + h1 + panel, 390 h1 + menu + panel; law 1440 tabs + menu + title + warn + whole SSO card + tax header, 1024/390 menu + h1 + SSO card top · `tabStrip` [1440, 1024] → TABS-CLIP (strip scrolls or a tab outside the strip box) · `disabledFail` → DISABLED-NO-REASON is FAIL and also covers controls inside `<fieldset disabled>` · `cleanSeed` [HrShift, HrLeavePolicy, HrHoliday, HrBankExportPreset, ApiKey] → SEED-DIRTY when the QC shop's table digest ≠ `hr-walk-expected.json.after` (same digest SQL as seed-hr-walk). None of these run on refusal or cov-* cells.

## 6. Narrow VIS5D acceptances added (each touched line carries `ORACLE-EDIT (HR VIS-5d · controller)`; only `HR VIS-5d … ◂` hunks; message keys only `hr.setview.*`; never a whole file)
| suite | check | accepts |
|---|---|---|
| vis-5-lib (vis-5b, vis-5c) | S1 / S5 | the 14 src files + walk-hr/seed-hr-walk (every hunk marked) · new settings-view/settings-ui/TemplateRowsEditor/qc-hr-vis-5d (marker lines 1–3) · `hr.setview.*` |
| vis-5a | S1 / S2 / S3 / S5 | same files (S1 untouched bank-files/filings ui · S3 payroll-run-ui · S5 TemplateRowsEditor client file) + the edited oracles |
| h3.6 | S1.6 bank | bank-files/ui.tsx hunks `HR VIS-5d…◂` (in base) |
| h3.9 | S1.5 | bank-files/ui.tsx, every hunk marked (in base) |
| h4.2-lib | S1.7 | settings page hunks (in base) |
| h4.3-lib | S1.6 / S1.7 | payroll-run-ui · payroll-accounting-ui · leave-presets-ui · the VIS-5d oracle files · labor-ui S1.7 |
| priv-2 | S4 / S5 | VIS-5d src (frozen bank-files/filings/lifecycle/line/work-entries/law/leave/settings files; MARKED payroll-run-ui) + oracle files |
| leave-3 | ST2 / ST3 | all VIS-5d files + tools + oracles · messages only `hr.setview.*` |
| preprod-1 | ST2 | attendance-pay-ui · labor-ui |
Oracle-file list used everywhere: qc-hr-vis-5d, vis-5-lib, vis-5a, h3.6, h3.9, h4.2-lib, h4.3-lib, priv-2, leave-3, preprod-1. Merge note: VIS-5c (wip/hr-vis-5bc) edits the same allowlist lines in vis-5-lib, leave-3, priv-2, h4.3-lib → resolve as unions.
Suites that need nothing (survey, read-only): h1.2 (reads none of the files), h2.4/h2.5/h2.7/h2.9/h3.1–h3.5/h4.4 (origin base, in-base guards — only the "must keep" strings of §4), h3.7, h4.5 / h4.8 (MARKED checks skipped once in base), set-1.

## 7. Open questions for the controller
1. Size: 61.2 kB bytes (59.8 KiB) — OK, or split a lib?
2. `settingsTabOf` for unknown / empty / array `tab` = ignored (falls to the param rules) — oracle reading, brief silent.
3. Viewer MP (manager + payroll keys) is outside the walk matrix — accept oracle-only coverage (as Q10)?
4. LINE mini-row subtitle pinned to the mockup "แจ้งกะ · ผลอนุมัติ · สลิป" (events: ตารางกะ · ผลใบลา · ผลคำขอ OT · สลับกะ · สลิป) — keep exact (§7.4) or allow the true event list?
5. Lifecycle save testid `hr-life-save` (§3.11) — add to the builder's scope + press probe?
6. "OT และค่าแรงขั้นต่ำ" card title is pinned (mockup) although `hr.law.kinds.OT` = "ค่าล่วงเวลา (OT)" — new key must live in `hr.setview` (I1 forbids editing `hr.law`).

## 8. Commands / results
Oracle commit e3a9072eb, re-run on that head (lane DB, QC_FORCE=1): vis-5a 42/42 · vis-5b 34/34 · h3.6 62/62 · h3.9 60/60 · h4.2 57/57 · h4.3 45/45 · priv-2 47/47 · leave-3 53/53 · preprod-1 57/57 (the allowlists accept this commit's own oracle/tool edits) · qc-hr-vis-5d forced 10/28, BASE-EXPECTATION 28/28 · unforced = SKIPPED · `walk-hr.mts --dry` 0 errors · `pnpm typecheck` (ISO_MEM=14000M, 12288) exit 0.
