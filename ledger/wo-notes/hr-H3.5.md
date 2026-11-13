# H3.5 — builder notes (bank salary-transfer files)

Branch `wip/hr-h3.5` on `session/hr` 30f83b99a (brief + RED oracle ea2890c07). Lane DB wo-hr-qc-l1 only. Green output: `hr-H3.5-green.txt`.

## What was built
| layer | files |
|---|---|
| migration | `prisma/migrations/20270107000000_hr_bank_files/migration.sql` — 3 CREATE TABLE · 2 unique · 4 index · 15 CHECK · additive (applied on lane DB) |
| schema | `prisma/schema/payroll.prisma` — 3 models appended at EOF (one marked block `HR H3.5`) |
| scope / qc env | `core/scope.ts` sys() ×3 · `scripts/hr-qc-env.mts` HR_TABLES ×3 + HR_DELETE_ORDER (no FK) |
| pure | `hr/bank-files/{codes,encode,kbank,ktb,generic,xlsx,build}.ts` — imports only `./` + `node:zlib`; `build.ts` = single entry `buildBankFile` + `BANK_TEXT`, `BANK_PRESETS`, `resolveBankCode` |
| service | `hr/bank-files/service.ts` — gate · profile · presets · preview · generate (manifest in the FOR SHARE tx) · download (rebuild + sha) · list files · list runs |
| actions / route | `hr/bank-files/actions.ts` ("use server", assertCan key pre-gate for F6.1, real gate in service) · `app/app/sys/[id]/hr/payroll/bank-file/[fileId]/route.ts` |
| UI | `hr/bank-files/ui.tsx` (server only) — `BankFileSection` on the payroll page · `BankSettingsCard` on the settings page · one marked hunk each page |
| texts | `messages/{th,en}/common.json` `hr.bank.*` (th = en keys) · inventory rows (19, wo H3.5) · visual block `"3.5"` |

## Decisions (inside the brief's defaults)
- **Gate**: the service reads the caller's accepted membership from the DB (user + tenant + role equal to the one passed) and requires the gate on **both** the DB row and the passed viewer. `permissions["hr.payroll.read"] === true && permissions["hr.payroll.pay"] === true && isAllBranches(hrScopeOf(...))` — no `hr.*` wildcard. Profile write = OWNER (DB role and passed role). Non-member / other system / other tenant / unknown id ⇒ identical `{ok:false, code:"NO", reason}`.
- **Refusal order** (R3) is kept even when the format is off: the service asks the pure layer with a dummy format first, so STATUS/NEGATIVE/MISMATCH win over FORMAT_OFF/OPTIONS.
- **Manifest** `optionsJson` = resolved options (defaults filled: encoding, batchRef, KTB mode/era/branch, effective date, resolved generic column spec + presetId). No account digits, names or bytes. Download rebuilds with these options + `now = createdAt`; any refusal or sha/length mismatch ⇒ CHANGED. Download still works if the owner later disables the format (bytes are proven identical by sha) — see risks.
- **Payee name** = `bankAccountName` trimmed, else employee name + `NAME_FROM_PROFILE`. Encoding check (fixed formats) runs on the whole name before the cut. Refusal names = display names (`HrEmployee.name`).
- **Pure result** carries an extra key `rows` (included rows with full account digits) so the service can build the masked preview without a second selection pass. It never leaves the server: the service maps it to `accountMasked = •••last4`.
- **Generic**: `BANK_UNKNOWN` = warning; XLSX cells refuse control characters / lone surrogates as ENCODING (XML cannot carry them); CSV TIS-620 refuses non-TIS chars as ENCODING. Header/const that start with `= + - @`, contain control chars or are not TIS-620 for a TIS-620 preset ⇒ OPTIONS (pure) / `presetColumns` (service).
- **XLSX** writer: inlineStr cells, style 1 = numFmt 49, deflate via `node:zlib`, zip time fixed 1980-01-01 (deterministic bytes).
- **Effective date** default = Bangkok day of `payDate`; `EFFECTIVE_PAST` (employeeId null) for every format when earlier than the Bangkok day of `now`.
- **Items whose employee row is gone**: passed as an account-less payee and relabelled `NO_EMPLOYEE` in the DTO (Σ invariant kept).
- **Download route** answers refusals with the fixed text, `text/plain`, no-store, nosniff, status 404/409/410 — no bytes. Generating never changes the run (Q12); the UI says so under the button.

## Golden-file disagreements
None. Every golden (G1–G8, DB1, DB2) matched on the first build; 24/24 bank-code vectors.

## ORACLE-EDITs
1. `scripts/qc-hr-h3.5.mts` S4.1 (marked comment in place). `ops #4 = listBankPresets(cO, V.other)` takes no id, so it asks the **other tenant's OWNER** for the presets of **their own** HR system — a legitimate success, not "other tenant ⇒ no". Making it refuse would mean inventing a rule (e.g. "presets need a bank profile"). Edit: ops #0–#3 stay on `cO` (they carry tenant A's ids); added all 5 ops with tenant A's ctx `cA` for `V.other` (the real other-tenant case). Strictly more refusals checked (9 vs 5), identical-bytes check unchanged.
2. `scripts/qc-hr-h0.1.mts` `SCHEMA_SHA` re-taken `ba34dee6… → 640d60eb…` (payroll.prisma + 3 models appended at EOF, additive). **H3.4 also moves this pin** — whoever merges second re-takes it on the merged file.

## Not followed / deviations
- Brief §7 run list includes `qc-hr-h1.1`, `qc-hr-h4.6`, `qc-crm-c3.3`, `nav-functions`; the controller's run list for this WO does not — run only what the controller listed (see green file).
- Presets UI: create + delete only (service supports update by id; no edit form) — debt.
- Settings page opens only for OWNER / `hr.employee.create` (existing rule), so a payroll user with read+pay cannot manage presets in the UI (service allows it). They can still use built-in presets and existing shop presets on the payroll page.

## Open risks
- All bank layouts are from public secondary sources ([V2-weak] PCT positions, [V2] OCA KTB) — labelled untested everywhere, off by default. HQ14 (owner's real bank sample) still open.
- TIS-620 default for fixed formats is a [U] choice (cp874 hint only for KBank).
- KTB_BUSINESS column order / amount position are [U] — preset is a guide.
- Download after the owner turns a format off still serves the file made while it was on (sha-proven identical).
- `generateBankFileAction` redirects to the route handler after a server action; with JS on, Next falls back to a full navigation for a non-page URL (download starts). Not verified in a browser in this lane (visual run belongs to the controller).

## Debts
- Preset edit form · per-employee bank/branch code fields (D1) · BOT bank-code list beyond the 4 [V] codes (Q5) · SCB/BBL/PCL generators · MD5 rule · reconciliation (H3.7).

## Must for H3.6 / H3.8
- H3.6 (tax/SSO filing files): reuse `bank-files/encode.ts` (TIS-620 single-byte, fixed-width `left/zero`) and the manifest-without-bytes + sha rebuild pattern; do **not** write `HrPayrollRun.filingJson`/the bank key column without a brief change; keep refusals unaudited (Q10 analogue).
- H3.8: any run-row lock order must treat `FOR SHARE` on `HrPayrollRun` taken by generate/download (no advisory lock held) — reverse/markPaid wait for it; never take a period advisory lock inside a bank-file tx.
- Whoever merges after H3.4: re-take qc-hr-h0.1 `SCHEMA_SHA` on the merged payroll.prisma.

---
## Fix round 1 (controller rulings after reviewer + hunter on 625209076)
| F | change | where |
|---|---|---|
| F1 | effective date (and the Bangkok day of `now`) must have CE year 2000–2400 (BE stays 4 digits) ⇒ OPTIONS · final guard `fixedLinesOk` — every line = layout length or LAYOUT refusal, no bytes, nothing saved | `build.ts` `inYearRange` / `fixedLinesOk` |
| F2 | PCT item/total ≥ 10^15, KTB item ≥ 10^17 / total ≥ 10^19 ⇒ AMOUNT naming the employees (or "ยอดรวมของไฟล์") | `build.ts` fixed branch |
| F3 | `cutAtCluster`: cut before the base of a split cluster, drop a trailing lead vowel (เ แ โ ใ ไ), pad with spaces · NAME_CUT unchanged | `encode.ts` |
| F4 | `formulaLike` = leading tab/CR outright, or `= + - @` after stripping leading whitespace/control · employeeName/employeeCode trimmed · UTF-8 CSV and XLSX refuse C0 controls (except tab/CR/LF), DEL, U+202A–202E, U+2066–2069 | `generic.ts`, `build.ts` |
| F5 | action redirects to `payroll?bank=&bfmt=&bfile=#hr-bank` (highlighted `<a download>`, no auto-download) · `bank-files/download-route.ts#bankFileGet` answers `rsc` / `next-router-prefetch` with 204 before any service call; route.ts checks the same before `requireTenant` | `actions.ts`, `download-route.ts`, `route.ts`, `ui.tsx` |
| F6 | download refuses FORMAT_OFF while the shop has that fixed format off (status → formatOff → expired → changed) | `service.ts#downloadBankFile` |
| F7 | `BANK_TEXT_EN` (same shape) + `bankTextFor(locale)`; UI, route refusals and the settings flash use `getLocale()` (next-intl, like the other HR pages' `getTranslations`). Service `reason` stays Thai (oracle contract) | `codes.ts`, `ui.tsx`, `download-route.ts`, settings page |
| F8 | empty/blank employee code sorts like null · tests for debit-account change, download ∥ reverse ×4, page data for non-holders, route helper statuses/headers | `service.ts#loadRun`, oracle |

**Next redirect, verified in source** (`node_modules/next/dist/server/app-render/action-handler.js` 259–330, 889–899): a *fetch* server action (JS on) that throws `redirect()` to an app-relative URL makes the server `fetch()` that URL with `RSC_HEADER = "rsc": "1"` and the forwarded request headers (cookies included); when the answer is not an RSC payload the body is cancelled and the client router then navigates to the URL itself. With the old redirect-to-route this ran the route twice (two downloads, two audit rows). MPA (no-JS) gets a plain 303 + `Location`. `next-router-prefetch` is the router's prefetch header (`app-router-headers.js`).

**ORACLE-EDITs (fix r1, all marked in place):** S1.7 reads route + `download-route.ts` (logic moved; behaviour now tested in S6.6) · S1.8 texts rule requires `{….untestedLong}` / `{….legal}` JSX (old `\blegal\b` matched the testid) · `textFor` + AMOUNT/LAYOUT · fixture `hr-h3.5-texts.json`: + th `layout` `amount` `amountTotal` and an `en` block (existing Thai untouched) · new checks S6.1–S6.11.

**RED→green:** the new oracle on 625209076 (temp worktree) = 42/53, failing S1.7 S2.1 S6.1–S6.9 (`ctx` `red-625209076.txt` in the builder scratchpad; S6.10/S6.11 held → registered GREEN). On 9a783587e/8f8e54a73 = 53/53.

**Hunter probes** (run, then moved to /root/backups/hr-hunt/): D1 gone (9999-12-31 BE / 0999-01-01 ⇒ OPTIONS in pure and DB) · D2 PCT ≥10^15 ⇒ AMOUNT · D4 tab/CR/space-led formulas ⇒ FORMULA, NUL/BEL/ESC/RLO ⇒ ENCODING · DB probe all ✓ incl. format-off matrix. D3: `pct-cut-orphan` still prints ❌ because the probe expects the field to end in `ก่` for 50×ก+่ — that needs 51 bytes; the ruling (cut to the last complete cluster + pad) gives 49×ก + space, which is what S6.4 asserts. The probe's "grapheme cuts 35" line counts inputs whose 51st char is a mark, not output defects.

**Debts (recorded, not now):** preset edit form · per-employee bank/branch code fields · bank codes beyond the 4 verified · real-bank validation (HQ14).
