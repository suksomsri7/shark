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
