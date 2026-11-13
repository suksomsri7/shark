# H3.5 oracle notes — golden derivation · service shapes · check map

> Oracle `scripts/qc-hr-h3.5.mts` (42 checks: 36 RED-by-design · 6 GREEN controls) · fixtures `scripts/fixtures/hr-h3.5-*` · brief `hr-briefs/hr-brief-H3.5.md`.
> **§2 is part of the brief** (service shapes). Everything else documents how each expected value was obtained — never from the code under test.

## 1. Sources and method
- Layouts: research `hr-briefs/hr-H3.5-H3.6-formats-research.md` A1 (KBank PCT) and A4 (KTB iPay), re-read against the stored evidence: OCA `l10n_th_bank_payment_export_ktb/data/bank.export.format.line.csv` (rows `ktb_format_01…44`: length, `ljust`/`rjust`, pad char, value) and `bank_payment_export.py` (`\r\n` after every `end_line` row, i.e. after the last line too); DLJ `index.html` `buildFile()` (header/detail concatenation, `padRight` **truncates**, `lines.join("\r\n") + "\r\n"`).
- Tag column in §3: blank = the format's default tag — **PCT positions [V2-weak]** (DLJ), **KTB [V2]** (OCA). Rows marked [V] are confirmed by the KBank FAQ v2.4 (yyMMdd CE dates, 15-digit satang amounts, header count/total). Generic CSV/XLSX and the presets are **our contract**, not a bank oracle.
- Each golden was produced by a field-list builder (one `(name, length, value)` per field, asserting `len(value) == length`; Thai encoded with Python's `tis-620` codec, CSV BOM written explicitly) that never imports SHARK code. The tables in §3 are its printout.
- **Independent cross-check:** G1 (all 3 lines) and G3A (all 3 lines) are byte-identical to the research's own vectors (`vectors.py`, written before this oracle). G3A uses `ktbReceivingBranch: ZEROS` and refs `PAY/0001…` precisely to make that comparison possible.
- **Positive control (pure groups):** a throwaway reference implementation written separately in TypeScript (not committed, removed after the run) turned S2.0–S2.12 all GREEN (13/13) on the lane DB run of 12 Nov — so every pure expectation is satisfiable and the XLSX reader/Text-format probe works. DB groups S3–S5 have **no** positive control (needs the migration; not created on the lane DB by the oracle writer).

## 2. Service shapes (part of the brief, R9–R13)
`ctx = {tenantId, systemId}` (HR system) · `viewer = {role, unitAccess, permissions, userId}` · `opts = {now?: Date}` (oracle only). Refusal = `{ok:false, code, reason}` (`reason` = fixed text; `employees` added for ENCODING/FORMULA; `notIncluded` for EMPTY). Gate refusal = exactly `{ok:false, code:"NO", reason: BANK_TEXT.no}` for every non-holder, unknown id, other system, other tenant.
| function | input | success |
|---|---|---|
| `getBankProfile(ctx, viewer)` | — | `{ok:true, profile: null \| {debitBankCode, debitAccountMasked, debitBranchCode, companyNameEn, ktbCompanyId, formatsEnabled, debitAccountNo (OWNER only)}}` |
| `saveBankProfile(ctx, viewer, input, opts)` | `{debitBankCode, debitAccountNo, debitBranchCode?, companyNameEn?, ktbCompanyId?, formatsEnabled: ("KBANK_PCT"\|"KTB_IPAY")[], acknowledgeUntested?}` | `{ok:true}` · non-OWNER ⇒ `PROFILE_OWNER`/`profileOwner` · bad field ⇒ `PROFILE_INPUT`/`profileInput` (companyNameEn and ktbCompanyId printable ASCII) · enabling a format not enabled before without `acknowledgeUntested:true` ⇒ `ACK_UNTESTED`/`ackUntested` · audit `hr.bankfile.profile {formatsEnabled}` |
| `listBankPresets(ctx, viewer)` | — | `{ok:true, items:[{id, name, kind, columns, includeHeader, includeSummary, amountStyle, dateStyle, encoding}]}` (rows only; built-ins `GENERIC`, `KTB_BUSINESS` are code constants) |
| `saveBankPreset(ctx, viewer, input)` | `{id?, name, kind, columns:[field, header][], includeHeader, includeSummary, amountStyle, dateStyle, encoding}` | `{ok:true, id}` · `PRESET_NAME`/`presetName` · `PRESET_COLUMNS`/`presetColumns` · audit `{presetId, op:"save"}` |
| `deleteBankPreset(ctx, viewer, {id})` | | `{ok:true}` · audit `{presetId, op:"delete"}` |
| `previewBankFile(ctx, viewer, req, opts)` | `req = {runId, format, presetId?, options?}`; `presetId` = `GENERIC`/`KTB_BUSINESS`/row id (CSV/XLSX); `options` = `{effectiveDate?, encoding?, batchRef?, ktbMode?, ktbDateEra?, ktbReceivingBranch?}` | R13 preview DTO |
| `generateBankFile(ctx, viewer, req, opts)` | as preview | `{ok:true, fileId, fileName, contentType, bytes: Uint8Array, itemCount, totalSatang, notIncluded, warnings, untested}` (`untested` = fixed format) · fixed format not enabled ⇒ `FORMAT_OFF`/`formatOff` |
| `downloadBankFile(ctx, viewer, {fileId}, opts)` | | `{ok:true, fileName, contentType, bytes, untested}` · `STATUS`/`status` · `EXPIRED`/`expired` · `CHANGED`/`changed` |
| `listBankFiles(ctx, viewer, {runId})` | | `{ok:true, items:[R13 file row]}` newest first |
Service `notIncluded`/`warnings` rows carry `name` (display name) per R13; the pure layer's do not.

## 3. Golden derivation (field tables)
## G1 KBANK_PCT · ASCII (also TIS620: identical bytes)

**PCT header**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–1 | 1 | H | `H` | [V2-weak] DLJ |
| 2–4 | 3 | Service | `PCT` |  |
| 5–20 | 16 | Batch reference | `NOV2026·········` |  |
| 21–26 | 6 | Const 000000 | `000000` |  |
| 27–40 | 14 | Spaces | `14× space` |  |
| 41–50 | 10 | Debit account | `1112223334` |  |
| 51–51 | 1 | Space | `1× space` |  |
| 52–66 | 15 | Total amount (satang) | `000000002443000` | [V] FAQ p.47 15 digits implied 2 dp |
| 67–67 | 1 | Space | `1× space` |  |
| 68–73 | 6 | File date | `261124` | [V] FAQ yyMMdd CE |
| 74–98 | 25 | Spaces | `25× space` |  |
| 99–148 | 50 | Company name | `SHOP·CO·LTD·······································` |  |
| 149–154 | 6 | Effective date | `261125` | [V] FAQ yyMMdd CE |
| 155–172 | 18 | Item count | `000000000000000002` | [V] FAQ header count |
| 173–173 | 1 | Flag N | `N` |  |
| 174–178 | 5 | Spaces | `5× space` |  |
| | **178** | total | | |

**PCT detail 1**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–1 | 1 | D | `D` | [V2-weak] DLJ |
| 2–7 | 6 | Sequence | `000001` |  |
| 8–21 | 14 | Spaces | `14× space` |  |
| 22–31 | 10 | Credit account | `0123456789` |  |
| 32–32 | 1 | Space | `1× space` |  |
| 33–47 | 15 | Amount (satang) | `000000001500000` |  |
| 48–48 | 1 | Space | `1× space` |  |
| 49–54 | 6 | File date | `261124` | [V] FAQ yyMMdd CE |
| 55–79 | 25 | Spaces | `25× space` |  |
| 80–129 | 50 | Payee name | `SOMCHAI·JAIDEE····································` |  |
| 130–135 | 6 | Effective date | `261125` | [V] FAQ yyMMdd CE |
| 136–138 | 3 | Const 000 | `000` |  |
| 139–154 | 16 | Sequence (16) | `0000000000000001` |  |
| 155–305 | 151 | Spaces 50+1+50+50 | `151× space` |  |
| 306–344 | 39 | 0000000000.00 ×3 | `0000000000.000000000000.000000000000.00` |  |
| 345–367 | 23 | Spaces 10+13 | `23× space` |  |
| 368–487 | 120 | Spaces 30×4 | `120× space` |  |
| | **487** | total | | |

**PCT detail 2**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–1 | 1 | D | `D` | [V2-weak] DLJ |
| 2–7 | 6 | Sequence | `000002` |  |
| 8–21 | 14 | Spaces | `14× space` |  |
| 22–31 | 10 | Credit account | `0987654321` |  |
| 32–32 | 1 | Space | `1× space` |  |
| 33–47 | 15 | Amount (satang) | `000000000943000` |  |
| 48–48 | 1 | Space | `1× space` |  |
| 49–54 | 6 | File date | `261124` | [V] FAQ yyMMdd CE |
| 55–79 | 25 | Spaces | `25× space` |  |
| 80–129 | 50 | Payee name | `SOMYING·RAKNGAN···································` |  |
| 130–135 | 6 | Effective date | `261125` | [V] FAQ yyMMdd CE |
| 136–138 | 3 | Const 000 | `000` |  |
| 139–154 | 16 | Sequence (16) | `0000000000000002` |  |
| 155–305 | 151 | Spaces 50+1+50+50 | `151× space` |  |
| 306–344 | 39 | 0000000000.00 ×3 | `0000000000.000000000000.000000000000.00` |  |
| 345–367 | 23 | Spaces 10+13 | `23× space` |  |
| 368–487 | 120 | Spaces 30×4 | `120× space` |  |
| | **487** | total | | |

## G2 KBANK_PCT · TIS620 · Thai names

**PCT header**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–1 | 1 | H | `H` | [V2-weak] DLJ |
| 2–4 | 3 | Service | `PCT` |  |
| 5–20 | 16 | Batch reference | `HR202611········` |  |
| 21–26 | 6 | Const 000000 | `000000` |  |
| 27–40 | 14 | Spaces | `14× space` |  |
| 41–50 | 10 | Debit account | `1112223334` |  |
| 51–51 | 1 | Space | `1× space` |  |
| 52–66 | 15 | Total amount (satang) | `000000002443001` | [V] FAQ p.47 15 digits implied 2 dp |
| 67–67 | 1 | Space | `1× space` |  |
| 68–73 | 6 | File date | `261124` | [V] FAQ yyMMdd CE |
| 74–98 | 25 | Spaces | `25× space` |  |
| 99–148 | 50 | Company name | `SHOP·CO·LTD·······································` |  |
| 149–154 | 6 | Effective date | `261125` | [V] FAQ yyMMdd CE |
| 155–172 | 18 | Item count | `000000000000000003` | [V] FAQ header count |
| 173–173 | 1 | Flag N | `N` |  |
| 174–178 | 5 | Spaces | `5× space` |  |
| | **178** | total | | |

**PCT detail 1**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–1 | 1 | D | `D` | [V2-weak] DLJ |
| 2–7 | 6 | Sequence | `000001` |  |
| 8–21 | 14 | Spaces | `14× space` |  |
| 22–31 | 10 | Credit account | `0123456789` |  |
| 32–32 | 1 | Space | `1× space` |  |
| 33–47 | 15 | Amount (satang) | `000000001500000` |  |
| 48–48 | 1 | Space | `1× space` |  |
| 49–54 | 6 | File date | `261124` | [V] FAQ yyMMdd CE |
| 55–79 | 25 | Spaces | `25× space` |  |
| 80–129 | 50 | Payee name | `นายสมชาย·ใจดี·····································` |  |
| 130–135 | 6 | Effective date | `261125` | [V] FAQ yyMMdd CE |
| 136–138 | 3 | Const 000 | `000` |  |
| 139–154 | 16 | Sequence (16) | `0000000000000001` |  |
| 155–305 | 151 | Spaces 50+1+50+50 | `151× space` |  |
| 306–344 | 39 | 0000000000.00 ×3 | `0000000000.000000000000.000000000000.00` |  |
| 345–367 | 23 | Spaces 10+13 | `23× space` |  |
| 368–487 | 120 | Spaces 30×4 | `120× space` |  |
| | **487** | total | | |

**PCT detail 2**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–1 | 1 | D | `D` | [V2-weak] DLJ |
| 2–7 | 6 | Sequence | `000002` |  |
| 8–21 | 14 | Spaces | `14× space` |  |
| 22–31 | 10 | Credit account | `0987654321` |  |
| 32–32 | 1 | Space | `1× space` |  |
| 33–47 | 15 | Amount (satang) | `000000000943000` |  |
| 48–48 | 1 | Space | `1× space` |  |
| 49–54 | 6 | File date | `261124` | [V] FAQ yyMMdd CE |
| 55–79 | 25 | Spaces | `25× space` |  |
| 80–129 | 50 | Payee name | `สมหญิง·รักงาน·····································` |  |
| 130–135 | 6 | Effective date | `261125` | [V] FAQ yyMMdd CE |
| 136–138 | 3 | Const 000 | `000` |  |
| 139–154 | 16 | Sequence (16) | `0000000000000002` |  |
| 155–305 | 151 | Spaces 50+1+50+50 | `151× space` |  |
| 306–344 | 39 | 0000000000.00 ×3 | `0000000000.000000000000.000000000000.00` |  |
| 345–367 | 23 | Spaces 10+13 | `23× space` |  |
| 368–487 | 120 | Spaces 30×4 | `120× space` |  |
| | **487** | total | | |

**PCT detail 3**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–1 | 1 | D | `D` | [V2-weak] DLJ |
| 2–7 | 6 | Sequence | `000003` |  |
| 8–21 | 14 | Spaces | `14× space` |  |
| 22–31 | 10 | Credit account | `2223334445` |  |
| 32–32 | 1 | Space | `1× space` |  |
| 33–47 | 15 | Amount (satang) | `000000000000001` |  |
| 48–48 | 1 | Space | `1× space` |  |
| 49–54 | 6 | File date | `261124` | [V] FAQ yyMMdd CE |
| 55–79 | 25 | Spaces | `25× space` |  |
| 80–129 | 50 | Payee name | `นางสาวประภาพรรณศรีสวัสดิ์วงศ์ไพบูลย์·ณ·อยุธยารักษ์` |  |
| 130–135 | 6 | Effective date | `261125` | [V] FAQ yyMMdd CE |
| 136–138 | 3 | Const 000 | `000` |  |
| 139–154 | 16 | Sequence (16) | `0000000000000003` |  |
| 155–305 | 151 | Spaces 50+1+50+50 | `151× space` |  |
| 306–344 | 39 | 0000000000.00 ×3 | `0000000000.000000000000.000000000000.00` |  |
| 345–367 | 23 | Spaces 10+13 | `23× space` |  |
| 368–487 | 120 | Spaces 30×4 | `120× space` |  |
| | **487** | total | | |

## G3A KTB_IPAY STANDARD · era CE · receiving branch ZEROS

**KTB header**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `1` |  |
| 4–9 | 6 | Batch Number | `000001` |  |
| 10–12 | 3 | Sending Bank Code | `006` |  |
| 13–19 | 7 | Total Transactions | `0000002` |  |
| 20–38 | 19 | Total Amount | `0000000000002443000` | [V2] OCA satang |
| 39–46 | 8 | Effective Date | `25112026` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 47–47 | 1 | Transaction Code | `C` |  |
| 48–55 | 8 | Receiver No. | `00000000` |  |
| 56–71 | 16 | Company ID | `COMPANY01·······` |  |
| 72–91 | 20 | User ID | `20× space` |  |
| 92–498 | 407 | Filler | `407× space` |  |
| | **498** | total | | |

**KTB detail 1**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `2` |  |
| 4–9 | 6 | Batch No. | `000001` |  |
| 10–12 | 3 | Receiving Bank | `014` |  |
| 13–16 | 4 | Receiving Branch | `0000` | [V2] OCA ljust · blank = option (SPACES OCA / ZEROS) |
| 17–27 | 11 | Receiving A/C | `01234567890` |  |
| 28–30 | 3 | Sending Bank | `006` |  |
| 31–34 | 4 | Sending Branch | `0123` |  |
| 35–45 | 11 | Sending A/C | `01112223334` |  |
| 46–53 | 8 | Effective Date | `25112026` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 54–55 | 2 | Service Type | `01` | [V2] OCA list |
| 56–57 | 2 | Clearing House | `00` |  |
| 58–74 | 17 | Amount | `00000000001500000` | [V2] OCA satang |
| 75–82 | 8 | Receiver Info | `8× space` |  |
| 83–92 | 10 | Receiver ID | `0000000000` |  |
| 93–192 | 100 | Receiver Name | `SOMCHAI·JAIDEE···········································…` |  |
| 193–292 | 100 | Sender Name | `SHOP·CO·LTD··············································…` |  |
| 293–332 | 40 | Other Info 1 | `40× space` |  |
| 333–350 | 18 | DDA Ref 1 | `18× space` |  |
| 351–352 | 2 | Reserve | `2× space` |  |
| 353–370 | 18 | Ref No./DDA Ref 2 | `PAY/0001··········` |  |
| 371–372 | 2 | Reserve | `2× space` |  |
| 373–392 | 20 | Other Info 2 | `20× space` |  |
| 393–398 | 6 | Ref Running Number | `000001` |  |
| 399–400 | 2 | Status | `09` |  |
| 401–440 | 40 | E-mail | `40× space` |  |
| 441–460 | 20 | SMS | `20× space` |  |
| 461–464 | 4 | Receiving Sub-Branch | `0000` |  |
| 465–498 | 34 | Filler | `34× space` |  |
| | **498** | total | | |

**KTB detail 2**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `2` |  |
| 4–9 | 6 | Batch No. | `000001` |  |
| 10–12 | 3 | Receiving Bank | `002` |  |
| 13–16 | 4 | Receiving Branch | `0000` | [V2] OCA ljust · blank = option (SPACES OCA / ZEROS) |
| 17–27 | 11 | Receiving A/C | `09876543210` |  |
| 28–30 | 3 | Sending Bank | `006` |  |
| 31–34 | 4 | Sending Branch | `0123` |  |
| 35–45 | 11 | Sending A/C | `01112223334` |  |
| 46–53 | 8 | Effective Date | `25112026` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 54–55 | 2 | Service Type | `01` | [V2] OCA list |
| 56–57 | 2 | Clearing House | `00` |  |
| 58–74 | 17 | Amount | `00000000000943000` | [V2] OCA satang |
| 75–82 | 8 | Receiver Info | `8× space` |  |
| 83–92 | 10 | Receiver ID | `0000000000` |  |
| 93–192 | 100 | Receiver Name | `SOMYING·RAKNGAN··········································…` |  |
| 193–292 | 100 | Sender Name | `SHOP·CO·LTD··············································…` |  |
| 293–332 | 40 | Other Info 1 | `40× space` |  |
| 333–350 | 18 | DDA Ref 1 | `18× space` |  |
| 351–352 | 2 | Reserve | `2× space` |  |
| 353–370 | 18 | Ref No./DDA Ref 2 | `PAY/0002··········` |  |
| 371–372 | 2 | Reserve | `2× space` |  |
| 373–392 | 20 | Other Info 2 | `20× space` |  |
| 393–398 | 6 | Ref Running Number | `000002` |  |
| 399–400 | 2 | Status | `09` |  |
| 401–440 | 40 | E-mail | `40× space` |  |
| 441–460 | 20 | SMS | `20× space` |  |
| 461–464 | 4 | Receiving Sub-Branch | `0000` |  |
| 465–498 | 34 | Filler | `34× space` |  |
| | **498** | total | | |

## G3B KTB_IPAY STANDARD · era CE · receiving branch SPACES

**KTB header**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `1` |  |
| 4–9 | 6 | Batch Number | `000001` |  |
| 10–12 | 3 | Sending Bank Code | `006` |  |
| 13–19 | 7 | Total Transactions | `0000002` |  |
| 20–38 | 19 | Total Amount | `0000000000002443000` | [V2] OCA satang |
| 39–46 | 8 | Effective Date | `25112026` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 47–47 | 1 | Transaction Code | `C` |  |
| 48–55 | 8 | Receiver No. | `00000000` |  |
| 56–71 | 16 | Company ID | `COMPANY01·······` |  |
| 72–91 | 20 | User ID | `20× space` |  |
| 92–498 | 407 | Filler | `407× space` |  |
| | **498** | total | | |

**KTB detail 1**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `2` |  |
| 4–9 | 6 | Batch No. | `000001` |  |
| 10–12 | 3 | Receiving Bank | `014` |  |
| 13–16 | 4 | Receiving Branch | `4× space` | [V2] OCA ljust · blank = option (SPACES OCA / ZEROS) |
| 17–27 | 11 | Receiving A/C | `01234567890` |  |
| 28–30 | 3 | Sending Bank | `006` |  |
| 31–34 | 4 | Sending Branch | `0123` |  |
| 35–45 | 11 | Sending A/C | `01112223334` |  |
| 46–53 | 8 | Effective Date | `25112026` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 54–55 | 2 | Service Type | `01` | [V2] OCA list |
| 56–57 | 2 | Clearing House | `00` |  |
| 58–74 | 17 | Amount | `00000000001500000` | [V2] OCA satang |
| 75–82 | 8 | Receiver Info | `8× space` |  |
| 83–92 | 10 | Receiver ID | `0000000000` |  |
| 93–192 | 100 | Receiver Name | `SOMCHAI·JAIDEE···········································…` |  |
| 193–292 | 100 | Sender Name | `SHOP·CO·LTD··············································…` |  |
| 293–332 | 40 | Other Info 1 | `40× space` |  |
| 333–350 | 18 | DDA Ref 1 | `18× space` |  |
| 351–352 | 2 | Reserve | `2× space` |  |
| 353–370 | 18 | Ref No./DDA Ref 2 | `PAY/0001··········` |  |
| 371–372 | 2 | Reserve | `2× space` |  |
| 373–392 | 20 | Other Info 2 | `20× space` |  |
| 393–398 | 6 | Ref Running Number | `000001` |  |
| 399–400 | 2 | Status | `09` |  |
| 401–440 | 40 | E-mail | `40× space` |  |
| 441–460 | 20 | SMS | `20× space` |  |
| 461–464 | 4 | Receiving Sub-Branch | `0000` |  |
| 465–498 | 34 | Filler | `34× space` |  |
| | **498** | total | | |

**KTB detail 2**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `2` |  |
| 4–9 | 6 | Batch No. | `000001` |  |
| 10–12 | 3 | Receiving Bank | `002` |  |
| 13–16 | 4 | Receiving Branch | `4× space` | [V2] OCA ljust · blank = option (SPACES OCA / ZEROS) |
| 17–27 | 11 | Receiving A/C | `09876543210` |  |
| 28–30 | 3 | Sending Bank | `006` |  |
| 31–34 | 4 | Sending Branch | `0123` |  |
| 35–45 | 11 | Sending A/C | `01112223334` |  |
| 46–53 | 8 | Effective Date | `25112026` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 54–55 | 2 | Service Type | `01` | [V2] OCA list |
| 56–57 | 2 | Clearing House | `00` |  |
| 58–74 | 17 | Amount | `00000000000943000` | [V2] OCA satang |
| 75–82 | 8 | Receiver Info | `8× space` |  |
| 83–92 | 10 | Receiver ID | `0000000000` |  |
| 93–192 | 100 | Receiver Name | `SOMYING·RAKNGAN··········································…` |  |
| 193–292 | 100 | Sender Name | `SHOP·CO·LTD··············································…` |  |
| 293–332 | 40 | Other Info 1 | `40× space` |  |
| 333–350 | 18 | DDA Ref 1 | `18× space` |  |
| 351–352 | 2 | Reserve | `2× space` |  |
| 353–370 | 18 | Ref No./DDA Ref 2 | `PAY/0002··········` |  |
| 371–372 | 2 | Reserve | `2× space` |  |
| 373–392 | 20 | Other Info 2 | `20× space` |  |
| 393–398 | 6 | Ref Running Number | `000002` |  |
| 399–400 | 2 | Status | `09` |  |
| 401–440 | 40 | E-mail | `40× space` |  |
| 441–460 | 20 | SMS | `20× space` |  |
| 461–464 | 4 | Receiving Sub-Branch | `0000` |  |
| 465–498 | 34 | Filler | `34× space` |  |
| | **498** | total | | |

## G3C KTB_IPAY STANDARD · era BE · receiving branch ZEROS

**KTB header**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `1` |  |
| 4–9 | 6 | Batch Number | `000001` |  |
| 10–12 | 3 | Sending Bank Code | `006` |  |
| 13–19 | 7 | Total Transactions | `0000002` |  |
| 20–38 | 19 | Total Amount | `0000000000002443000` | [V2] OCA satang |
| 39–46 | 8 | Effective Date | `25112569` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 47–47 | 1 | Transaction Code | `C` |  |
| 48–55 | 8 | Receiver No. | `00000000` |  |
| 56–71 | 16 | Company ID | `COMPANY01·······` |  |
| 72–91 | 20 | User ID | `20× space` |  |
| 92–498 | 407 | Filler | `407× space` |  |
| | **498** | total | | |

**KTB detail 1**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `2` |  |
| 4–9 | 6 | Batch No. | `000001` |  |
| 10–12 | 3 | Receiving Bank | `014` |  |
| 13–16 | 4 | Receiving Branch | `0000` | [V2] OCA ljust · blank = option (SPACES OCA / ZEROS) |
| 17–27 | 11 | Receiving A/C | `01234567890` |  |
| 28–30 | 3 | Sending Bank | `006` |  |
| 31–34 | 4 | Sending Branch | `0123` |  |
| 35–45 | 11 | Sending A/C | `01112223334` |  |
| 46–53 | 8 | Effective Date | `25112569` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 54–55 | 2 | Service Type | `01` | [V2] OCA list |
| 56–57 | 2 | Clearing House | `00` |  |
| 58–74 | 17 | Amount | `00000000001500000` | [V2] OCA satang |
| 75–82 | 8 | Receiver Info | `8× space` |  |
| 83–92 | 10 | Receiver ID | `0000000000` |  |
| 93–192 | 100 | Receiver Name | `SOMCHAI·JAIDEE···········································…` |  |
| 193–292 | 100 | Sender Name | `SHOP·CO·LTD··············································…` |  |
| 293–332 | 40 | Other Info 1 | `40× space` |  |
| 333–350 | 18 | DDA Ref 1 | `18× space` |  |
| 351–352 | 2 | Reserve | `2× space` |  |
| 353–370 | 18 | Ref No./DDA Ref 2 | `PAY/0001··········` |  |
| 371–372 | 2 | Reserve | `2× space` |  |
| 373–392 | 20 | Other Info 2 | `20× space` |  |
| 393–398 | 6 | Ref Running Number | `000001` |  |
| 399–400 | 2 | Status | `09` |  |
| 401–440 | 40 | E-mail | `40× space` |  |
| 441–460 | 20 | SMS | `20× space` |  |
| 461–464 | 4 | Receiving Sub-Branch | `0000` |  |
| 465–498 | 34 | Filler | `34× space` |  |
| | **498** | total | | |

**KTB detail 2**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `2` |  |
| 4–9 | 6 | Batch No. | `000001` |  |
| 10–12 | 3 | Receiving Bank | `002` |  |
| 13–16 | 4 | Receiving Branch | `0000` | [V2] OCA ljust · blank = option (SPACES OCA / ZEROS) |
| 17–27 | 11 | Receiving A/C | `09876543210` |  |
| 28–30 | 3 | Sending Bank | `006` |  |
| 31–34 | 4 | Sending Branch | `0123` |  |
| 35–45 | 11 | Sending A/C | `01112223334` |  |
| 46–53 | 8 | Effective Date | `25112569` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 54–55 | 2 | Service Type | `01` | [V2] OCA list |
| 56–57 | 2 | Clearing House | `00` |  |
| 58–74 | 17 | Amount | `00000000000943000` | [V2] OCA satang |
| 75–82 | 8 | Receiver Info | `8× space` |  |
| 83–92 | 10 | Receiver ID | `0000000000` |  |
| 93–192 | 100 | Receiver Name | `SOMYING·RAKNGAN··········································…` |  |
| 193–292 | 100 | Sender Name | `SHOP·CO·LTD··············································…` |  |
| 293–332 | 40 | Other Info 1 | `40× space` |  |
| 333–350 | 18 | DDA Ref 1 | `18× space` |  |
| 351–352 | 2 | Reserve | `2× space` |  |
| 353–370 | 18 | Ref No./DDA Ref 2 | `PAY/0002··········` |  |
| 371–372 | 2 | Reserve | `2× space` |  |
| 373–392 | 20 | Other Info 2 | `20× space` |  |
| 393–398 | 6 | Ref Running Number | `000002` |  |
| 399–400 | 2 | Status | `09` |  |
| 401–440 | 40 | E-mail | `40× space` |  |
| 441–460 | 20 | SMS | `20× space` |  |
| 461–464 | 4 | Receiving Sub-Branch | `0000` |  |
| 465–498 | 34 | Filler | `34× space` |  |
| | **498** | total | | |

## G4 KTB_IPAY DIRECT · default ref · CE · SPACES

**KTB header**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `1` |  |
| 4–9 | 6 | Batch Number | `000001` |  |
| 10–12 | 3 | Sending Bank Code | `006` |  |
| 13–19 | 7 | Total Transactions | `0000001` |  |
| 20–38 | 19 | Total Amount | `0000000000001234567` | [V2] OCA satang |
| 39–46 | 8 | Effective Date | `25112026` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 47–47 | 1 | Transaction Code | `C` |  |
| 48–55 | 8 | Receiver No. | `00000000` |  |
| 56–71 | 16 | Company ID | `COMPANY01·······` |  |
| 72–91 | 20 | User ID | `20× space` |  |
| 92–498 | 407 | Filler | `407× space` |  |
| | **498** | total | | |

**KTB detail 1**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `2` |  |
| 4–9 | 6 | Batch No. | `000001` |  |
| 10–12 | 3 | Receiving Bank | `006` |  |
| 13–16 | 4 | Receiving Branch | `4× space` | [V2] OCA ljust · blank = option (SPACES OCA / ZEROS) |
| 17–27 | 11 | Receiving A/C | `04445556667` |  |
| 28–30 | 3 | Sending Bank | `006` |  |
| 31–34 | 4 | Sending Branch | `0123` |  |
| 35–45 | 11 | Sending A/C | `01112223334` |  |
| 46–53 | 8 | Effective Date | `25112026` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 54–55 | 2 | Service Type | `02` | [V2] OCA list |
| 56–57 | 2 | Clearing House | `00` |  |
| 58–74 | 17 | Amount | `00000000001234567` | [V2] OCA satang |
| 75–82 | 8 | Receiver Info | `8× space` |  |
| 83–92 | 10 | Receiver ID | `0000000000` |  |
| 93–192 | 100 | Receiver Name | `MANA·DEEJAI··············································…` |  |
| 193–292 | 100 | Sender Name | `SHOP·CO·LTD··············································…` |  |
| 293–332 | 40 | Other Info 1 | `40× space` |  |
| 333–350 | 18 | DDA Ref 1 | `18× space` |  |
| 351–352 | 2 | Reserve | `2× space` |  |
| 353–370 | 18 | Ref No./DDA Ref 2 | `HR202611-0001·····` |  |
| 371–372 | 2 | Reserve | `2× space` |  |
| 373–392 | 20 | Other Info 2 | `20× space` |  |
| 393–398 | 6 | Ref Running Number | `000001` |  |
| 399–400 | 2 | Status | `09` |  |
| 401–440 | 40 | E-mail | `40× space` |  |
| 441–460 | 20 | SMS | `20× space` |  |
| 461–464 | 4 | Receiving Sub-Branch | `0000` |  |
| 465–498 | 34 | Filler | `34× space` |  |
| | **498** | total | | |

## G5A generic CSV · default preset · UTF-8 BOM · CRLF

```
ลำดับ,รหัสพนักงาน,ชื่อบัญชี,รหัสธนาคาร,ธนาคาร,เลขที่บัญชี,จำนวนเงิน,วันที่โอน,อ้างอิง⏎
1,E001,สมชาย ใจดี,004,กสิกรไทย,0123456789,15000.00,2026-11-25,HR202611-0001⏎
2,,"Somying ""Ying"", R.",014,SCB,1234567890,9430.00,2026-11-25,HR202611-0002⏎
3,E003,กรุง ศรี,,กรุงศรี,111222333012,0.01,2026-11-25,HR202611-0003⏎

```

## G5B generic CSV · custom mapping · SATANG · DMY_BE · summary · no header · TIS620

```
0123456789,1500000,01,,25/11/2569,สมชาย ใจดี⏎
1234567890,943000,01,,25/11/2569,"Somying ""Ying"", R."⏎
111222333012,1,01,,25/11/2569,กรุง ศรี⏎
จำนวนรายการ,3⏎
ยอดรวม,2443001⏎

```

## G5C generic CSV · DMY_CE · BAHT_2DP · header + summary · UTF-8 BOM

```
No,Amount,Date⏎
1,15000.00,25/11/2026⏎
2,9430.00,25/11/2026⏎
3,0.01,25/11/2026⏎
จำนวนรายการ,3⏎
ยอดรวม,24430.01⏎

```

## DB1 KBANK_PCT · service defaults (TIS620 · batch HR203110 · effective = payDate 2031-10-31) · now 2031-10-30 09:00 BKK

**PCT header**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–1 | 1 | H | `H` | [V2-weak] DLJ |
| 2–4 | 3 | Service | `PCT` |  |
| 5–20 | 16 | Batch reference | `HR203110········` |  |
| 21–26 | 6 | Const 000000 | `000000` |  |
| 27–40 | 14 | Spaces | `14× space` |  |
| 41–50 | 10 | Debit account | `1112223334` |  |
| 51–51 | 1 | Space | `1× space` |  |
| 52–66 | 15 | Total amount (satang) | `000000005234567` | [V] FAQ p.47 15 digits implied 2 dp |
| 67–67 | 1 | Space | `1× space` |  |
| 68–73 | 6 | File date | `311030` | [V] FAQ yyMMdd CE |
| 74–98 | 25 | Spaces | `25× space` |  |
| 99–148 | 50 | Company name | `QC·SHOP·CO········································` |  |
| 149–154 | 6 | Effective date | `311031` | [V] FAQ yyMMdd CE |
| 155–172 | 18 | Item count | `000000000000000003` | [V] FAQ header count |
| 173–173 | 1 | Flag N | `N` |  |
| 174–178 | 5 | Spaces | `5× space` |  |
| | **178** | total | | |

**PCT detail 1**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–1 | 1 | D | `D` | [V2-weak] DLJ |
| 2–7 | 6 | Sequence | `000001` |  |
| 8–21 | 14 | Spaces | `14× space` |  |
| 22–31 | 10 | Credit account | `0123456789` |  |
| 32–32 | 1 | Space | `1× space` |  |
| 33–47 | 15 | Amount (satang) | `000000003000000` |  |
| 48–48 | 1 | Space | `1× space` |  |
| 49–54 | 6 | File date | `311030` | [V] FAQ yyMMdd CE |
| 55–79 | 25 | Spaces | `25× space` |  |
| 80–129 | 50 | Payee name | `A·ONE·············································` |  |
| 130–135 | 6 | Effective date | `311031` | [V] FAQ yyMMdd CE |
| 136–138 | 3 | Const 000 | `000` |  |
| 139–154 | 16 | Sequence (16) | `0000000000000001` |  |
| 155–305 | 151 | Spaces 50+1+50+50 | `151× space` |  |
| 306–344 | 39 | 0000000000.00 ×3 | `0000000000.000000000000.000000000000.00` |  |
| 345–367 | 23 | Spaces 10+13 | `23× space` |  |
| 368–487 | 120 | Spaces 30×4 | `120× space` |  |
| | **487** | total | | |

**PCT detail 2**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–1 | 1 | D | `D` | [V2-weak] DLJ |
| 2–7 | 6 | Sequence | `000002` |  |
| 8–21 | 14 | Spaces | `14× space` |  |
| 22–31 | 10 | Credit account | `0987654321` |  |
| 32–32 | 1 | Space | `1× space` |  |
| 33–47 | 15 | Amount (satang) | `000000001234567` |  |
| 48–48 | 1 | Space | `1× space` |  |
| 49–54 | 6 | File date | `311030` | [V] FAQ yyMMdd CE |
| 55–79 | 25 | Spaces | `25× space` |  |
| 80–129 | 50 | Payee name | `นายบี·สอง·········································` |  |
| 130–135 | 6 | Effective date | `311031` | [V] FAQ yyMMdd CE |
| 136–138 | 3 | Const 000 | `000` |  |
| 139–154 | 16 | Sequence (16) | `0000000000000002` |  |
| 155–305 | 151 | Spaces 50+1+50+50 | `151× space` |  |
| 306–344 | 39 | 0000000000.00 ×3 | `0000000000.000000000000.000000000000.00` |  |
| 345–367 | 23 | Spaces 10+13 | `23× space` |  |
| 368–487 | 120 | Spaces 30×4 | `120× space` |  |
| | **487** | total | | |

**PCT detail 3**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–1 | 1 | D | `D` | [V2-weak] DLJ |
| 2–7 | 6 | Sequence | `000003` |  |
| 8–21 | 14 | Spaces | `14× space` |  |
| 22–31 | 10 | Credit account | `1112223330` |  |
| 32–32 | 1 | Space | `1× space` |  |
| 33–47 | 15 | Amount (satang) | `000000001000000` |  |
| 48–48 | 1 | Space | `1× space` |  |
| 49–54 | 6 | File date | `311030` | [V] FAQ yyMMdd CE |
| 55–79 | 25 | Spaces | `25× space` |  |
| 80–129 | 50 | Payee name | `F·SIX·············································` |  |
| 130–135 | 6 | Effective date | `311031` | [V] FAQ yyMMdd CE |
| 136–138 | 3 | Const 000 | `000` |  |
| 139–154 | 16 | Sequence (16) | `0000000000000003` |  |
| 155–305 | 151 | Spaces 50+1+50+50 | `151× space` |  |
| 306–344 | 39 | 0000000000.00 ×3 | `0000000000.000000000000.000000000000.00` |  |
| 345–367 | 23 | Spaces 10+13 | `23× space` |  |
| 368–487 | 120 | Spaces 30×4 | `120× space` |  |
| | **487** | total | | |

## DB2 KTB_IPAY STANDARD · service defaults (CE · SPACES · TIS620 · ref HR203110-0001) · system B

**KTB header**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `1` |  |
| 4–9 | 6 | Batch Number | `000001` |  |
| 10–12 | 3 | Sending Bank Code | `006` |  |
| 13–19 | 7 | Total Transactions | `0000001` |  |
| 20–38 | 19 | Total Amount | `0000000000000150000` | [V2] OCA satang |
| 39–46 | 8 | Effective Date | `31102031` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 47–47 | 1 | Transaction Code | `C` |  |
| 48–55 | 8 | Receiver No. | `00000000` |  |
| 56–71 | 16 | Company ID | `QCB01···········` |  |
| 72–91 | 20 | User ID | `20× space` |  |
| 92–498 | 407 | Filler | `407× space` |  |
| | **498** | total | | |

**KTB detail 1**

| pos | len | field | value | tag |
|---|---|---|---|---|
| 1–2 | 2 | File Type | `10` | [V2] OCA |
| 3–3 | 1 | Record Type | `2` |  |
| 4–9 | 6 | Batch No. | `000001` |  |
| 10–12 | 3 | Receiving Bank | `014` |  |
| 13–16 | 4 | Receiving Branch | `4× space` | [V2] OCA ljust · blank = option (SPACES OCA / ZEROS) |
| 17–27 | 11 | Receiving A/C | `02223334445` |  |
| 28–30 | 3 | Sending Bank | `006` |  |
| 31–34 | 4 | Sending Branch | `0456` |  |
| 35–45 | 11 | Sending A/C | `09990001112` |  |
| 46–53 | 8 | Effective Date | `31102031` | [V2] OCA DDMMYYYY · era = option (CE OCA / BE [U]) |
| 54–55 | 2 | Service Type | `01` | [V2] OCA list |
| 56–57 | 2 | Clearing House | `00` |  |
| 58–74 | 17 | Amount | `00000000000150000` | [V2] OCA satang |
| 75–82 | 8 | Receiver Info | `8× space` |  |
| 83–92 | 10 | Receiver ID | `0000000000` |  |
| 93–192 | 100 | Receiver Name | `B·ONE····················································…` |  |
| 193–292 | 100 | Sender Name | `QC·SHOP·B················································…` |  |
| 293–332 | 40 | Other Info 1 | `40× space` |  |
| 333–350 | 18 | DDA Ref 1 | `18× space` |  |
| 351–352 | 2 | Reserve | `2× space` |  |
| 353–370 | 18 | Ref No./DDA Ref 2 | `HR203110-0001·····` |  |
| 371–372 | 2 | Reserve | `2× space` |  |
| 373–392 | 20 | Other Info 2 | `20× space` |  |
| 393–398 | 6 | Ref Running Number | `000001` |  |
| 399–400 | 2 | Status | `09` |  |
| 401–440 | 40 | E-mail | `40× space` |  |
| 441–460 | 20 | SMS | `20× space` |  |
| 461–464 | 4 | Receiving Sub-Branch | `0000` |  |
| 465–498 | 34 | Filler | `34× space` |  |
| | **498** | total | | |

## 4. Non-byte expectations (hand arithmetic)
- **G1** run net = 1,500,000 + 943,000 + 0 + 50,000 + 200,000 + 100,000 + 300,000 = **3,093,000** satang; file 2,443,000 (e1+e2); excluded e3 NET_ZERO 0 · e4 NO_ACCOUNT 50,000 · e5 NOT_THIS_BANK 200,000 (ไทยพาณิชย์ → 014) · e6 ACCOUNT_FORMAT 100,000 (`12345`) · e7 BANK_UNKNOWN 300,000 (กรุงศรี: no [V] code); 2,443,000 + 650,000 = 3,093,000 ✓. File name `PCT` + `261124102030` (now 10:20:30 BKK) = 15 chars + `.txt`. e1 account `012-3-45678-9` → `0123456789`.
- **G2** total 1,500,000 + 943,000 + 1 = 2,443,001; batch default `HR202611`; e2 has no account name ⇒ `สมหญิง รักงาน` + NAME_FROM_PROFILE; e8 account name is 64 code points ⇒ first 50 + NAME_CUT. G2A (ASCII): e1 account name, e2 fallback name and e8 contain Thai ⇒ ENCODING listing the three **display names** `สมชาย ใจดี, สมหญิง รักงาน, ประภาพรรณ`.
- **G3** run net 1,500,000 + 943,000 + 1,234,567 = 3,677,567; file 2,443,000; e3 (กรุงไทย 006) SAME_BANK 1,234,567. Era BE: 2026 + 543 = 2569 ⇒ `25112569`. Receiving A/C `1234567890` → zfill 11 `01234567890` (OCA `_get_acc_number_digit`, ≤ 11 digits). Sending A/C `1112223334` → `01112223334`, branch `0123`.
- **G4** DIRECT: only e3 (006) ⇒ count 1, total 1,234,567 = `00000000001234567`; ref default `HR202611-0001`; service `02` (OCA Direct list "02 Salary"); e1 (014), e2 (002) NOT_THIS_BANK.
- **G5** run net 2,443,001; e4 NET_ZERO; e3 bank กรุงศรี ⇒ bankCode blank + BANK_UNKNOWN (warning only in generic) and no account name ⇒ NAME_FROM_PROFILE; e2 `Somying "Ying", R.` ⇒ quoted `"Somying ""Ying"", R."`; `123-4-56789-0` → `1234567890`; amounts 15000.00 / 9430.00 / 0.01; SATANG 1500000 / 943000 / 1; DMY_BE 25/11/2569; summary `จำนวนรายการ,3` · `ยอดรวม,2443001` (SATANG) or `ยอดรวม,24430.01` (BAHT).
- **G6/G7** XLSX compared after reading back with `dorm/import-parse#parseImportFile` (rows padded to the header width) and a zip probe: every `<c>` has `t="s"` or `t="inlineStr"` and its style's `numFmtId` is 49. G7 = KTB Business D-row column names/codes [V] (manual 2022-08-05): File Type `10`, Record Type `D`, Batch No. (blank — must equal the header row the shop keeps in the bank template), Payment Reference No., Bulk Service Type (blank — PPND/DCR/SMSD/SMND/BN is the shop's choice), Payee Bank ID, Payee Branch Code (blank — required only for OWN/3RD/BN), PromptPay Type (blank), Payee Account No., Payee Name, WHT Flag `N`, Effective Date (DMY_CE [U]), Service Type `01` ("specify 01 for payroll"), Fee Payer (blank — OUR/BEN shop's choice), Amount. **Column order and the Amount column position are [U]** (manual shows A–H only; amount not listed in the research's detail list) — the preset is a guide the shop checks against `Bulk_Payroll.xls`.
- **DB1** (system A, run 2031-10, service order A01…A07): KBank payees a1 3,000,000 · a2 1,234,567 (`098-765-4321` → `0987654321`, account name Thai ⇒ TIS-620 bytes) · a6 1,000,000 ⇒ count 3, total **5,234,567**; excluded a3 NOT_THIS_BANK 2,000,000 · a4 NO_ACCOUNT 500,000 · a5 NET_ZERO 0 · a7 NOT_THIS_BANK 777,700; run net 8,512,267 = 5,234,567 + 3,277,700 ✓. now 2031-10-30T02:00Z = 09:00 BKK ⇒ file date `311030`, name `PCT311030090000.txt`; payDate 2031-10-31 (stored 12:00 BKK) ⇒ effective `311031`; batch `HR203110`.
- **DB2** (system B): b1 SCB 150,000 included, b2 KTB SAME_BANK 250,000; defaults STANDARD · CE `31102031` · SPACES · TIS-620; sending branch `0456`, account `09990001112`; company ID `QCB01`; name `KTB_IPAY_203110_311030090000.txt`.
- **S3.8** generic on run 1: included a1 a2 a3 a6 a7 = 3,000,000 + 1,234,567 + 2,000,000 + 1,000,000 + 777,700 = **8,012,267**; excluded a4 NO_ACCOUNT, a5 NET_ZERO; first ref `HR203110-0001`; effective `2031-10-31`.
- **S3.6** PAID run 2031-08: a1 only = 3,000,000 · v2 run 2031-06: a1 + a3 = 5,000,000.
- **S2.12** OVER_LIMIT boundary = 3,000,000.00 baht [V] (FAQ limit per item, PCT) ⇒ 300,000,000 satang no warning, 300,000,001 warning; 2,147,483,647 satang = `21474836.47`.

## 5. What could not be derived (left as options or out of scope — nothing invented)
- KTB date era (CE in OCA, BE possible) and the receiving branch for payees without a branch code ⇒ options, both values golden-tested (G3A/B/C).
- Encoding of either bank file (cp874 hint for KBank only) ⇒ option, ASCII and TIS-620 tested; UTF-8 not offered for fixed width (pad rule unknown).
- KBank PCT: meaning of the `N` flag, the 151 blank and the three `0000000000.00` fields, whether Thai names are accepted, the MD5 hash rule ⇒ mirrored as DLJ writes them; not claimed as bank-verified.
- Bank codes beyond 002/004/006/014 (no [V] source in the research) ⇒ not resolved; fixed formats exclude, generic warns.
- SCB, BBL, KBank PCL/PCTDRVA layouts ⇒ no generator.
- Per-item limit for KTB ⇒ no warning.
