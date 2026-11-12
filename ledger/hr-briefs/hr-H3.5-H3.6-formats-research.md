# H3.5 / H3.6: bank payroll files and government filings, from public sources only

Checked 12 Nov 2026 (2569 BE). Research only. Nothing under /root/projects or /root/.claude was changed.
The owner has **no sample files from any bank**. Nothing below has been tested against a real bank or agency upload.

**Tags** (shark-thai-law §1):
- **[V]**: I opened the official document myself.
- **[V2]**: a secondary source I opened, which clearly says what it is based on.
- **[V2-weak]**: third-party code I opened, which says only in general terms what it is based on. Treat it as [U] for decisions.
- **[S]**: search-result snippet only, page not opened.
- **[U]**: not confirmed.

Unless stated otherwise, every tag below has the date checked 2026-11-12.

**Evidence store.** Downloads are kept, untouched and never executed, under
`/tmp/claude-0/-root/872c5096-2093-558d-8eaa-53dc53b5686a/scratchpad/fmt-src/`. Key files, with the first 16 hex characters of each sha256:

| Local file | sha256 (prefix) | What it is |
|---|---|---|
| `web/kbank-faq.pdf` | e5b88942d0440638 | KBank K-Cash Connect Plus FAQ v2.4, dated 01-07-2026. Copied from web.archive.org (snapshot 20260714) because kasikornbank.com returns Access Denied to this machine |
| `dlj/index.html` | 93cedd83454f0930 | github.com/touchaee/dlj-payroll-web, a KBank PCT generator |
| `oca/l10n-thailand-15.0/l10n_th_bank_payment_export_ktb/data/bank.export.format.line.csv` | 8a73ad741076b7cd | OCA/Ecosoft KTB iPay layout |
| `web/ktb-bulkfile-en.pdf` | bbfa47e0dbf7650a | Krungthai Business "Bulk Payment Transfer" manual, 2022 |
| `gov/Download_FormatPND1V2_0.pdf` | ac649fd311570ddf | RD Format 2.0 for ภ.ง.ด.1 / 1ก / 1ก พิเศษ |
| `gov/swc1.5.1_FormatPND1.pdf` | 305e51f7ea6fce95 | RD Format 1.0 (Payroll) |
| `gov/Download_swc_Data_Test.zip` | a303a349025c2416 | RD official sample files |
| `gov/sso-Format135_New.zip` | ed2e9015a9941dff | SSO "FORMAT เงินสมทบ (135)" .xls |
| `gov/sso-eservice-UserManual.pdf` | ab9af877d203259b | SSO e-Service user manual, created 2023-08-23 |
| `gov/rd-50tawi.pdf` | d6a114f2130cf501 | RD form 50 ทวิ |

**Sites I could not reach.** Bank websites block this machine:
- scb.co.th returns 403 (Incapsula).
- bangkokbank.com times out.
- kasikornbank.com returns Access Denied.

Some facts from those sites are therefore stuck at [S]. A person on a normal browser could probably move them to [V] in minutes. See §D.

---

## Part A: bank payroll and bulk transfer files

### A0. Summary of how complete the public information is

| Bank | Product / format | What is public | Best tag at field level |
|---|---|---|---|
| **KBank** | K-Cash Connect Plus · service **PCT – KBANK PAYROLL** (same bank) · **PCL – SMART PAYROLL** (other banks) · **PCTDRVA – PAYROLL DRIVE A** | Official FAQ gives rules, validations and error messages: date format, amount format, header totals, file name. The full layout comes only from a third-party repo | Rules **[V]** · positions **[V2-weak]** |
| **SCB** | SCB Business Anywhere ("Import" → template "Payment File Import") · SCB Business Net | Product names, the import flow and SMART cut-off times only. **No field layout found** | none (process **[V2]**) |
| **BBL** | BIZ iBanking / iCash (new system) · upload format "BBL and Other Bank Accounts (SMART)" · Bualuang Payroll program | Product names, plus the Excel "Template-Employee" column names, from snippets only. **No field layout found** | none (**[S]**) |
| **KTB** | (a) Krungthai **Corporate Online "KTB iPay"** fixed-width file · (b) **Krungthai Business** "Bulk Payroll" Excel template | (a) Full 498-character layout from open-source OCA/Ecosoft code · (b) official manual listing every column and code, but no widths because it is Excel | (a) **[V2]** · (b) **[V]** at column and code level |

### A1. KBank (Kasikornbank)

**Product and services.** All rows below are from the KBank FAQ, page "เงื่อนไขมาตรฐานการส่งข้อมูล", **[V]**. Source: KBank FAQ v2.4 (01-07-2026), https://www.kasikornbank.com/th/download/level4_doc/faq_k-cashconnectplus.pdf (read through the web.archive.org copy dated 20260714).

| Service | Code | Fee | Upload cut-off | Limit per item |
|---|---|---|---|---|
| Salary to KBank accounts | **PCT – KBANK PAYROLL** | 15 THB in-zone / 25 THB cross-zone | Every day, before 19:00 on the effective date | 3,000,000 |
| Salary to other banks | **PCL – SMART PAYROLL** | 12 THB | Business days only, **2 business days** before, by 15:30 | 2,000,000 |
| Other upload services in the same table | DCT (Direct Credit) · IPP (Interbank) · PP (PromptPay) · MCL / MCS (SMART Credit next day / same day) · FTR · FTL · BNE · COC · COE · BP | — | — | — |

**Payroll programs that support each format** (FAQ p.104, **[V]**):
- **Both PCTDRVA and PCT:** EASYACC, ACCPAYROLL, TIGERSOFT, BUSINESS PLUS, EAGLE.
- **PCTDRVA only:** PROSOFT and 17 others.

KBank itself refers to a **"KBank Excel Template"** for preparing the text file (FAQ p.46–47, **[V]**). That template is not public.

**Conflict on the format name.**
- PEAK help calls it "**PTC** – KBANK PAYROLL" **[V2]**: https://intercom.help/peak/en/articles/5667430
- The KBank FAQ and the DLJ code both say "**PCT**".
- Use **PCT**, the bank's own spelling. PEAK's spelling looks like a typo.

**Rules taken from the official error list** (FAQ p.47–49, **[V]**):

| Rule | Detail |
|---|---|
| Date fields | `TransDate` and `Instrument Date` use format **`yyMMdd`, with the year in CE** ("yy = ปี ค.ศ"). Example: 230113 |
| Amounts | Digits only, no decimal point, no comma. Example "000001831077200 หมายถึง 18,310,772.00 บาท" means **15 digits with 2 implied decimals (satang)**. A space after the amount, or an amount without 2 decimal places, breaks the totals (Trace:10 / Trace:20) |
| Header totals | Line 1 must carry the total item count and total amount. They must equal the sum of the detail lines (Trace:9 / Trace:10 / Trace:20, plus Thai and English messages 5–6) |
| File name | English letters and digits only, **no Thai**, **at most 15 characters** |
| Special characters | Tabs and other special characters in fields cause "ORA-01403 no data found" (for example, after pasting names into the Excel template) |
| Service mismatch | The first characters of the file must match the service chosen at upload. Otherwise the error is "Given Band not found" |
| Hash error | "File Hash is not tallying! … การเข้ารหัส MD5 ไม่ถูกต้อง". The FAQ does not say which formats carry an MD5 hash **[U]** |
| Mandatory fields | A blank mandatory field gives "Value of Mandatory Field is NULL … at line number" |

**Encoding.** For a generated text file that shows no Thai, the FAQ (p.68–69, **[V]** for the instruction itself) says to:
- set the Windows system locale to **Thai**, and
- **untick "Beta: Use Unicode UTF-8"**.

This suggests the official template writes ANSI / **cp874 (TIS-620)**. That is my **inference [U]**; the FAQ never names an encoding.

**Account numbers** (FAQ p.101, table dated 10 Feb 2569, **[V]**):
- BBL 002, KBANK 004, KTB 006 and SCB 014 use **10-digit** accounts with **4-digit** branch codes.
- GSB uses 12 or 15 digits, GHB 12, BAAC 10 or 12, TISCO 14, KKP 10 or 14, and so on.
- PromptPay and Interbank limit: 2,000,000 per item.

**Field positions.** These come from a third party, **[V2-weak]**:
- Source: https://github.com/touchaee/dlj-payroll-web, file `index.html`, one commit dated 2026-07-13, co-authored by an AI, no licence.
- The code says it "mirror[s] the KBank template VBA exactly". It cites no document.
- It writes the file as plain text with **CRLF** line endings, labelled `us-ascii`.
- File name: `PCT<yymmddhhmmss>.txt`, which is 15 characters and fits KBank's ≤15 rule.
- It checks that the **header is 178** characters and **each detail line 487**.

Header (178 characters):

| Pos | Len | Content |
|---|---|---|
| 1 | 1 | `H` |
| 2–4 | 3 | `PCT` |
| 5–20 | 16 | Batch reference, left-aligned, space-padded, alphanumeric |
| 21–26 | 6 | `000000` |
| 27–40 | 14 | spaces |
| 41–50 | 10 | Debit account, zero-padded |
| 51 | 1 | space |
| 52–66 | 15 | **Total amount in satang**, zero-padded |
| 67 | 1 | space |
| 68–73 | 6 | File date `yymmdd` (CE) |
| 74–98 | 25 | spaces |
| 99–148 | 50 | Company name, left-aligned |
| 149–154 | 6 | Effective date `yymmdd` |
| 155–172 | 18 | Item count, zero-padded |
| 173 | 1 | `N` |
| 174–178 | 5 | spaces |

Detail (487 characters):

| Pos | Len | Content |
|---|---|---|
| 1 | 1 | `D` |
| 2–7 | 6 | Sequence number, zero-padded |
| 8–21 | 14 | spaces |
| 22–31 | 10 | Credit account |
| 32 | 1 | space |
| 33–47 | 15 | Amount in satang |
| 48 | 1 | space |
| 49–54 | 6 | File date |
| 55–79 | 25 | spaces |
| 80–129 | 50 | Payee name |
| 130–135 | 6 | Effective date |
| 136–138 | 3 | `000` |
| 139–154 | 16 | Sequence number, zero-padded |
| 155–305 | 151 | Spaces (50 + 1 + 50 + 50). The meaning of these fields is not stated |
| 306–344 | 39 | `0000000000.00` three times (VAT/WHT-like fields, meaning not stated) |
| 345–367 | 23 | spaces (10 + 13) |
| 368–487 | 120 | spaces (30 × 4) |

The repo validates that the debit account and each credit account have exactly 10 digits, and that the company name has ≤50 characters.

**How the two KBank sources agree:**
- Agree: the CE `yyMMdd` dates, the 15-digit satang amounts, and the item count and total amount on line 1 all match the official FAQ.
- Not covered by the FAQ: positions, the `N` flag, the unnamed blank fields, and whether line 1 starts with `H`.
- Not public at all: PCL (SMART Payroll, other banks) and PCTDRVA layouts. Nothing found.

**PEAK constraints for PCT** ([V2], https://intercom.help/peak/en/articles/5667430 and /11058559):
- The company and the employees must all bank with KBank.
- Payroll must be recorded at least 3 business days before payday.
- PEAK will not produce the bank file if ภ.ง.ด.1 or ภ.ง.ด.54 withholding is attached ("ธนาคารไม่รองรับ").

**Still missing for KBank:** official field positions, the encoding, the MD5 hash rule, the PCL and PCTDRVA layouts, and whether Thai names are allowed.

### A2. SCB (Siam Commercial Bank)

**Products and upload flow:**
- **SCB Business Anywhere (SME).** Path: Login → การอนุมัติรายการ → **Import** → template name "**Payment File Import**" → choose the PEAK .txt file → choose the import type ("ประเภทการ Import ข้อมูล") and a batch name. **[V2]** PEAK, https://intercom.help/peak/en/articles/5696897
- **PEAK payroll file rule:** PEAK's SCB payroll .txt file is only allowed when the company and all employees bank with SCB. **[V2]** https://intercom.help/peak/en/articles/4812494

**SMART Credit cut-offs** ([V2], PEAK citing SCB's terms PDF https://www.scb.co.th/getmedia/01d61496-503d-4309-a336-31fcdc15f4e3/scb-smart-credit.pdf; the PDF itself is blocked by Incapsula, so it is [S] for me):

| Option | Approve before | Effect |
|---|---|---|
| Next Day | 09:30 on the business day before | Debit 1 day ahead, payee receives the next business day |
| Same Day | 11:00 | Payee receives the same day |

Source: https://intercom.help/peak/en/articles/10923025

**Other public facts:**
- The Business Anywhere payroll manual mentions creating payroll files from an **Excel template**, including a variant for other-bank accounts with next-day effect. **[S]** (page returns 403)
- SCB Business Net / e-Integration accepts payment files "in the company's own file format" through the bank's integration service. **[S]**

**Field layout: none found.** I found nothing on the record types, widths, encoding or code lists. No open-source generator turned up either: GitHub repository search returned 0 for `l10n_th_bank_payment_export_scb`.

### A3. BBL (Bangkok Bank)

**Products and file rules** (all **[S]**: bangkokbank.com timed out twice, so these come from search snippets of https://www.bangkokbank.com/en/hint/hintbiz/biz-payroll):
- Products: BIZ iBanking "Payroll" and iCash (new system), which covers Payroll, Direct Credit, SMART and BAHTNET.
- To pay other banks, the upload format must be "**BBL and Other Bank Accounts (SMART)**". "You can only upload files that have Bangkok Bank's SMART format."
- The file can be prepared with Bangkok Bank's own "Payroll" program, or exported from other payroll software, as long as it is in Bangkok Bank's format.
- The Excel template has a "**Template-Employee**" sheet with First Name, Last Name, Branch Code, Account Number and Bank Code. It can be saved as **CSV (Comma delimited)**. First and last name should match the account name.
- Host-to-host SFTP is offered for ERP systems.

**Other facts:**
- Oracle PeopleSoft Global Payroll Thailand ships "BBL" and "KBANK" EFT formats. **[S]** Its documentation is licensed, so this is not usable as a source.
- **Field layout: none found.** GitHub search found nothing either.

### A4. KTB (Krungthai)

**(a) Krungthai Corporate Online, "KTB iPay" fixed-width text file.** Source **[V2]**:
- OCA `l10n-thailand`, branch 15.0, module `l10n_th_bank_payment_export_ktb` v15.0.3.0.0. Author Ecosoft, AGPL-3.
- https://github.com/OCA/l10n-thailand/tree/15.0/l10n_th_bank_payment_export_ktb, data file `data/bank.export.format.line.csv`.
- The format record is named "KTB iPay". The module is marked development status **Alpha**, and it has no test that checks bytes against a bank file.

Generator behaviour (from `l10n_th_bank_payment_export/models/bank_payment_export.py` and `bank_export_format.py`):
- Python `ljust`/`rjust` with the stated pad character. **Padding never truncates**, so a value longer than its field breaks the line length. This is a bug to avoid.
- Line ending **CRLF**.
- **Encoding not set** in the module, so Odoo's text report default applies, most likely UTF-8 **[U]**.
- Both record types are **498 characters**. There is no trailer.

HEADER record:

| Pos | Len | Field | Value / rule |
|---|---|---|---|
| 1–2 | 2 | File Type | `10` |
| 3 | 1 | Record Type | `1` |
| 4–9 | 6 | Batch Number | `000001` (zero-padded on the left) |
| 10–12 | 3 | Sending Bank Code | `006` |
| 13–19 | 7 | Total Transactions | count, zero-padded on the left |
| 20–38 | 19 | Total Amount | **satang** (`round(total × 100)`), zero-padded on the left |
| 39–46 | 8 | Effective Date | **DDMMYYYY** from Python `strftime`, so **CE** (whether KTB expects CE or BE: [U]) |
| 47 | 1 | Transaction Code | `C` |
| 48–55 | 8 | Receiver No. | `00000000` |
| 56–71 | 16 | Company ID | KTB company ID, left-aligned |
| 72–91 | 20 | User ID | spaces |
| 92–498 | 407 | Filler | spaces |

DETAIL record, one per payee:

| Pos | Len | Field | Value / rule |
|---|---|---|---|
| 1–2 | 2 | File Type | `10` |
| 3 | 1 | Record Type | `2` |
| 4–9 | 6 | Batch No. | `000001` |
| 10–12 | 3 | Receiving Bank | bank code, for example `014` |
| 13–16 | 4 | Receiving Branch | branch code. For GSB 12-digit accounts: `999` + first digit |
| 17–27 | 11 | Receiving A/C | zero-padded to 11. Special rules for BOT, BAAC, HSBC, TISCO, KKP, IBANK, GSB and GHB (see `_get_acc_number_digit`) |
| 28–30 | 3 | Sending Bank | `006` |
| 31–34 | 4 | Sending Branch | zero-padded |
| 35–45 | 11 | Sending A/C | zero-padded |
| 46–53 | 8 | Effective Date | DDMMYYYY |
| 54–55 | 2 | Service Type | **Standard/Express (other bank):** 01 salary · 02 dividend · 03 interest · 04 goods/services · 05 securities · 06 tax refund · 07 loan · 59 other. **Direct (KTB to KTB):** 02 Salary · 04 Bond interest · 09 Insurance · 10 Telephone · 11 Electricity · 12 Water · 14 Purchase/Service · 15 GSB · 21 Securities · 25 Clearing Bank · 27 SSO · 28 Lottery · 37 E-card · 46 Pension |
| 56–57 | 2 | Clearing House Code | `00` |
| 58–74 | 17 | Amount | **satang**, zero-padded |
| 75–82 | 8 | Receiver Info | spaces |
| 83–92 | 10 | Receiver ID | `0000000000` |
| 93–192 | 100 | Receiver Name | account holder name, left-aligned |
| 193–292 | 100 | Sender Name | left-aligned |
| 293–332 | 40 | Other Info 1 | spaces |
| 333–350 | 18 | DDA Ref 1 | spaces |
| 351–352 | 2 | Reserve | spaces |
| 353–370 | 18 | Ref No. / DDA Ref 2 | payment reference |
| 371–372 | 2 | Reserve | spaces |
| 373–392 | 20 | Other Info 2 | spaces |
| 393–398 | 6 | Ref Running Number | 1-based, zero-padded |
| 399–400 | 2 | Status | `09` |
| 401–440 | 40 | E-mail | spaces |
| 441–460 | 20 | SMS / Mobile | spaces |
| 461–464 | 4 | Receiving Sub-Branch | `0000` |
| 465–498 | 34 | Filler | spaces |

Validation rules in the OCA code:
- "Direct" files may hold KTB accounts only. "Standard" files may hold **non-KTB** accounts only.
- One file per journal (one debit account).
- THB only.

**(b) Krungthai Business (business.krungthai.com), "Bulk Payroll" Excel template.** Source **[V]**: official manual "Bulk Payment Transfer Website", https://business.krungthai.com/assets/manual/ManualEN%20KTB%20Business_Bulk%20File.pdf (PDF dated 2022-08-05; it is image-only, so I read the rendered pages). A companion "Bulk Upload" manual (2022-06-15) shows the upload file named `Bulk_Payroll.xls`.

General rules:
- Format all Excel columns as **Text**.
- The template is downloaded from the bank site under "Download Bulk Template".

Header row (row 1 only):
- **File Type** `10`.
- **Record Type** `H`.
- **Batch No.** Any number, but the same on every row of the file.
- **Bulk File Type** for salary: `3` = Bulk payroll 1, `4` = Bulk payroll 2, `5` = Bulk payroll 3. Other uses: `1` batch, `2` online immediate, `6` online with a different date and debit account per row.
- Customer reference (optional) and company abbreviation.
- Company name in Thai and in English. English is required for BAHTNET.
- Company address (building, floor, room, street, province, district, sub-district) and postal code.
- 13-digit tax ID.
- SSO number (optional).
- Sending bank for payroll (optional).
- **Effective date**, except for bulk type 6.
- **Transaction code** `C`. `D` (direct debit) is planned for the future.
- Company ID.
- **Count of all detail records**.
- **Total net transfer amount**.
- Count and total amount of withholding-tax records, invoice count and invoice total. Write 0 when there are none.

Detail rows (`D`):
- **File Type** `10`, Record Type `D`, Batch No. the same as the header.
- **Payment Reference No.** No duplicates allowed.
- **Bulk Service Type:**
  - for file types 1, 3, 4, 5: `PPND` PromptPay next day, `DCR` Direct Credit, `SMSD` SMART same day, `SMND` SMART next day, `BN` BAHTNET;
  - for file types 2, 6: `OWN`, `3RD`, `OBA` other bank, `PPID` PromptPay online.
- **Payee bank ID** `006` for KTB.
- **Payee branch code**, required only for OWN, 3RD and BN.
- **PromptPay type** `I` (tax ID) or `M` (mobile), required for PPND and PPID.
- Payee account number or PromptPay ID.
- Payee name. English is required for BAHTNET.
- Optional address fields.
- **WHT flag** Y or N.
- Effective date (bulk types 1–5 must use the same date on every row).
- Service type codes: when paying to another bank, specify 01 for payroll.
- **Fee payer** `OUR` or `BEN`.

Optional row types `W` (withholding tax, at most one per detail) and `I` (invoice, one or more) can follow each detail.

The manual shows column order but **not lengths**, because the file is Excel.

**Still missing for KTB:**
- An official iPay spec, to confirm the OCA layout, the CE vs BE date question and the encoding.
- The column letters of the Krungthai Business template. The manual images show columns A–H but not the full width.

---

## Part B: government files

### B1. ภ.ง.ด.1 (monthly) and ภ.ง.ด.1ก (annual)

**Two official RD layouts exist.** Both come from https://rd.go.th/63724.html, "รูปแบบข้อมูล (ฟอร์แมตกลาง)", page last updated 16-06-2025, **[V]**:
1. **Format 2.0** (`FormatPND1V2_0.pdf`, "Version 2.0 ปรับปรุง ณ วันที่ 16/06/2568"). Used to file by uploading a media file online ("ยื่นแบบด้วยสื่อฝากไฟล์ออนไลน์") and through the WHT Software Component (SWC / SWC-UI).
2. **Format 1.0, "Payroll / ระบบจ่ายตรง / GFMIS"** (`swc1.5.1/FormatPND1.pdf`, "Version 1.0 ปรับปรุง ณ วันที่ 23/05/2566"). This is the input that SWC-UI converts.

**RD Prep "โอนย้ายข้อมูล" has no fixed format** ([V2] PEAK https://intercom.help/peak/en/articles/8705182; Business Plus https://www.businessplus.co.th/ContentUploader/7551/Files/PND.1_RD_Prep.pdf):
- The user ticks "แบ่งแยกข้อมูลด้วยสัญลักษณ์", chooses `|`, then **drags each column onto RD Prep's fields**.
- The pay date can be read as BE "dd/mm/yyyy (มีสัญลักษณ์)".
- The pay date must fall inside the tax month.
- RD Prep's output is a `.rdx` file, which is uploaded to e-Filing.

So for RD Prep, any pipe-delimited file works. **Format 2.0 is the only fixed official format**, and it is the one to use.

**Mandatory electronic filing.** ภ.ง.ด.1, 1ก and 1ก พิเศษ must be filed electronically (e-Filing, e-WHT or file upload) from tax month January 2567 (ประกาศอธิบดีฯ ฉ.438, 26 Sep 2566). **[V2]** PEAK citing https://www.rd.go.th/fileadmin/user_upload/news/2566thai/news35_2566_01.pdf

**Format 2.0 general rules** (ข้อกำหนด 1–17, **[V]**):

| Rule | Detail |
|---|---|
| File name | `TAX_TYPE_NID13_BRANCH6_TAXYEAR4_TAXMONTH2_FORMTYPE2_NN.txt`, where NN = ครั้งที่ส่ง 00–99. Example in RD's own sample: `PND1_…_000000_2555_04_00_00.txt` |
| Structure | 1 header line (H), then detail lines (D) |
| Encoding | "UNICODE จะต้องกำหนดเป็น **UTF8**". RD's sample files are **UTF-8 with BOM** and **CRLF** **[V]** |
| Separator | Fields separated by `|`, with **no leading or trailing pipe**. An empty field is written as `||` |
| Line end | CR/LF |
| Numbers | Numeric (15,2) means up to 18 characters including the decimal point, for example `500.00`. Write `0.00` when there is no value. Round half up at the 3rd decimal |
| Forbidden characters | `* + / \ ! $ % # & @`, comma, single quote and double quote |
| Padding | **Do not pad.** Write the actual value, for example `|สมศักดิ์|` |
| Address on 1ก | ภ.ง.ด.1ก and 1ก พิเศษ **must** include the payee address and postcode |

**Format 2.0 header fields, in order (22 fields):**

| # | Field | Rule |
|---|---|---|
| 1 | `H` | |
| 2 | SENDER_ID (4) | `0000` for file upload / media |
| 3 | SENDER_NID (13) | |
| 4 | SENDER_BRANCH (6) | `000000` for head office |
| 5 | SENDER_ROLE (1) | 1 = ผู้หัก · 2 = ผู้กระทำการแทน · 3 = ตัวกลาง · 4 = ยื่นรวม |
| 6 | TAX_TYPE (8) | `PND1` · `PND1A` · `PND1AS` |
| 7 | NID (13) | |
| 8 | BRANCH_NO (6) | |
| 9 | DEPT_NAME (80) | for example "สำนักงานใหญ่" |
| 10 | LTO (1) | 0 or 1 |
| 11 | TAX_MONTH (2) | `01`–`12`; **`00` for 1ก and 1ก พิเศษ** |
| 12 | TAX_YEAR (4) | **BE**, for example 2568 |
| 13 | BRANCH_TYPE (1) | `V` / `S` / empty |
| 14 | FORM_TYPE (2) | `00` normal, `01`–`99` additional filing |
| 15 | TOT_NUM (7) | |
| 16 | TOT_AMT (15,2) | |
| 17 | TOT_TAX (15,2) | |
| 18 | SUR_AMT (15,2) | always `0.00` |
| 19 | GTOT_TAX (15,2) | |
| 20 | TRANS_AMT (15,2) | `0.00` when filing by media |
| 21 | USER_ID (20) | Media: the registration reference ("เลขอ้างอิงการลงทะเบียน"). Internet: the User ID |
| 22 | FORM_FLAG (1) | 1 = media, 2 = internet |

**Format 2.0 detail fields, in order (26 fields):**

| # | Field | Rule |
|---|---|---|
| 1 | `D` | |
| 2 | SEQ_NO (10) | |
| 3 | BRANCH_NO (6) | |
| 4 | PIN (13) | |
| 5 | TIN (10) | `0000000000` if none |
| 6 | TITLE_NAME (100) | `-` if none |
| 7 | FNAME (100) | |
| 8 | SNAME (80) | Middle name + space + surname |
| 9 | PAID_DATE (8) | **ววดดปปปป = DDMMYYYY in BE**. For 1ก, use the last day of the year |
| 10 | TAX_RATE (4,2) | for example `15.00` or `0.00` |
| 11 | PAID_AMT (15,2) | |
| 12 | TAX_AMT (15,2) | |
| 13 | INC_TYPE_PND (1) | **1 = 40(1)** · 2 = 40(2) at 3% · 3 = 40(1)(2) on leaving employment · 4 = 40(2) payee in Thailand · 5 = 40(2) payee abroad |
| 14 | PAY_CON (1) | **1 = หัก ณ ที่จ่าย · 2 = ออกให้ตลอดไป · 3 = ออกให้ครั้งเดียว** |
| 15–23 | Address parts | BUILD_NAME (40), ROOM_NO (20), FLOOR_NO (20), VILLAGE_NAME (100), ADD_NO (40), MOO_NO (20), SOI (100), STREET_NAME (100), TAMBON (50), all optional |
| 24 | AMPHUR (50) | marked M |
| 25 | PROVINCE (50) | marked M |
| 26 | POSTAL_CODE (5) | marked M |

**Format 1.0 (Payroll)** **[V]** is pipe-separated, not fixed-length (note 10), with file name `PND1.txt`. It has 20 fields:
- FORMTYPE, COMPIN13, COMTIN10, BRANO (**4**), PIN, TIN, PER_N1 (40), NAME1 (80), SUR_N1 (80), ADDRESS1 (150), ADDRESS2 (150), POSCOD.
- TAXMONTH (`00` for 1ก), TAXYEAR (BE), INCOMECODE (1–5 as above), PAYDATE DDMMYYYY (BE), TAXRATE (C3, `0` for progressive rates), PAYMENT (13,2), TAX (13,2), TAXCONDITION (1–3).

**Conflicts between the RD sources** (recorded side by side, each **[V]**):

| Topic | Source 1 | Source 2 |
|---|---|---|
| Tax ID in RD's sample header | 14 `T`s, a placeholder (`swc_Data_Test.zip`, 2015) | Spec says 13 characters |
| USER_ID in RD's sample | 19–20 `Z`s | — |
| Address fields 24–26 | Format 2.0 table marks AMPHUR, PROVINCE and POSTAL_CODE as **M** for all forms | Rule 17 says the address is required for 1ก and 1ก พิเศษ (implying optional for monthly ภ.ง.ด.1). Safe choice: always send them |
| Amount width | v1.0: 13,2 | v2.0: 15,2 |
| Branch width | v1.0: 4 | v2.0: 6 |
| Tax rate | v1.0: C3, integer, `0` for progressive | v2.0: N 4,2 |
| Tax rate in RD's sample | `10.00` on every line, including type 1 (40(1)). Synthetic data only | — |

**Funds attachment file for 1ก / 1ก พิเศษ** **[V]**:
- Name: `FUND_{PND1A|PND1AS}_{NID13}_{TaxYear}.csv`.
- Fields, separated by `|` or comma, no quotes, no thousands commas, 2 decimals: `{PIN13}|{TaxYear}|{กบข./กสจ./ครูเอกชน}|{ประกันสังคม}|{สำรองเลี้ยงชีพ}`.
- Example: `0001234567890|2564|0.00|700.00|12000.00`.
- It is imported into SWC-UI, and the amounts then appear on the 50 ทวิ.

**Deadlines** ([V], taken from shark-thai-law `common-withholding-tax.md` §8, checked 12–13 Nov 2569; not re-opened today):

| Form | Paper | Online |
|---|---|---|
| ภ.ง.ด.1 | within 7 days after month end | 15 days, for filings due 1 Feb 2567 – **31 Jan 2570** (search again after that date) |
| ภ.ง.ด.1ก | end of February | 8 March |

### B2. สปส.1-10 (Social Security contribution file)

**Official upload layout, "FORMAT เงินสมทบของสำนักงานประกันสังคม (135)"** **[V]**:
- Source: `Format135_New.zip` from www.sso.go.th/sites/default/files/userfiles/file/download/Format135_New.zip, read through the web.archive.org copy dated 20170222.
- The .xls inside is code page 874 and was last saved 2010-02-04. It is **old**: still official, but not re-confirmed as current.

**Upload channel today** **[V]**: SSO e-Service manual (created 2023-08-23), https://www.sso.go.th/eservices/web/UserManual.pdf, §3.2 "การชำระเงินสมทบแบบแนบไฟล์":
- The file-type dropdown shows "**txt, .dat**".
- Per-branch filing (แยกยื่น) uses สปส.1-10. Combined filing for several branches (ยื่นรวมสาขา) uses สปส.1-10/1.

**Independent confirmation** **[V2]**: Panyame (payroll vendor), https://www.panyame.com/blog/docs/others/e-filing/sso110txt/, gives the same widths with no positions.

**Record rules:**
- **Fixed width, 135 characters per record.**
- Amounts are right-aligned and zero-padded, **without the decimal point** (satang implied). Example: 1,500,000.67 is written `000000150000067`.

Header record (ส่วนที่ 1), one per file:

| Pos | Len | Field | Rule |
|---|---|---|---|
| 1 | 1 | RECORD TYPE | `1` |
| 2–11 | 10 | ACC NO | employer account number from SSO |
| 12–17 | 6 | BRANCH NO | `000000` for head office |
| 18–23 | 6 | PAID DATE | **DDMMYY with the year in BE** (example `150447`) |
| 24–27 | 4 | PAID PERIOD | **MMYY in BE** (example `0347` = March 2547) |
| 28–72 | 45 | COMPANY NAME | |
| 73–76 | 4 | RATE | no decimal point, zero-padded on the left. Example `0300` = 3.00%, so 5% is `0500` |
| 77–82 | 6 | TOTAL EMPLOYEE | |
| 83–97 | 15 | TOTAL WAGES | 2 implied decimals |
| 98–111 | 14 | TOTAL PAID | employee + employer, 2 implied decimals |
| 112–123 | 12 | TOTAL PAID BY EMPLOYEE | |
| 124–135 | 12 | TOTAL PAID BY EMPLOYER | |

Detail record (ส่วนที่ 2), one per insured person:

| Pos | Len | Field | Rule |
|---|---|---|---|
| 1 | 1 | RECORD TYPE | `2` |
| 2–14 | 13 | SSO ID | the national ID number |
| 15–17 | 3 | PREFIX | **003 = นาย, 004 = นางสาว, 005 = นาง**. Other prefixes: ask SSO for the code |
| 18–47 | 30 | FNAME | |
| 48–82 | 35 | LNAME | |
| 83–96 | 14 | WAGES | for example `00000001500000` = 15,000.00 |
| 97–108 | 12 | PAID AMOUNT | employee contribution, for example `000000075000` |
| 109–135 | 27 | blank | |

Not stated anywhere: encoding, line ending, file name. The .xls code page 874 hints at **TIS-620 [U]**.

**Rounding** ([V2], the สปส.1-10 form notes as reproduced by Business Plus https://www.businessplus.co.th/ContentUploader/843/Files/…สปส.1-10….pdf; agrees with shark-thai-law `domain-labour-payroll.md` §ซ, which cites พ.ร.บ.ประกันสังคม ม.46 via OLO, [V2]):
- Round each person's contribution: 50 satang or more rounds up to 1 baht; less than 50 satang is dropped.
- **The employer pays the same amount as the employee's rounded contribution.**
- Wages below 1,650 are computed as 1,650. Wages above the ceiling are computed at the ceiling.
- That form copy still shows the old 15,000 ceiling. The current ceiling is **17,500, giving 875 per side per month (2569–2571)** per the shark-thai-law skill **[V]**.

**What goes in the wages column:**
- The form says "ในช่อง 4 ให้กรอกจำนวนค่าจ้างที่จ่ายจริง" (enter the **actual** wage) **[V2]**.
- The Business Plus sample shows 115,500.00 wages with 750 contribution, so actual wages are reported and the cap applies only to the contribution.
- Whether e-Service rejects an uncapped wage in the 14-digit field: **[U]**.

**Deadline.** By the 15th of the following month (ม.47) **[V2/V]**, per the skill. For e-payment, an extra 7 business days for wages from January 2568 onward **[S]**.

### B3. 50 ทวิ (withholding tax certificate) for employees

**Official RD form** **[V]**: https://www.rd.go.th/fileadmin/tax_pdf/withhold/approve_wh3_081156.pdf (PDF last modified 2013-11-08).

| Item on the form | What it says |
|---|---|
| Copies | Copy 1: the payee attaches it to their tax return. Copy 2: the payee keeps it |
| Title and numbering | "หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร", with **เล่มที่ / เลขที่** (book number / sheet number) |
| Payer and payee | 13-digit tax ID, name, and address in the order building, room, floor, number, soi, moo, road, tambon, amphur, province |
| ลำดับที่ในแบบ | Must cross-reference the line number in the filing: "ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบยื่นรายการภาษีหักที่จ่าย". For employees, tick **(1) ภ.ง.ด.1ก** (or (2) ภ.ง.ด.1ก พิเศษ). **The form has no box for the monthly ภ.ง.ด.1** |
| Income rows | **Row 1: "เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)"**. Row 2: 40(2). Rows 3–6: other income types |
| Columns | Date or tax year paid · amount paid · tax withheld and remitted |
| Totals | Total paid and total tax, plus the total tax **in Thai words** |
| Fund boxes | กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน · **กองทุนประกันสังคม** · กองทุนสำรองเลี้ยงชีพ |
| Payer condition | (1) หัก ณ ที่จ่าย · (2) ออกให้ตลอดไป · (3) ออกให้ครั้งเดียว · (4) อื่น ๆ |
| Sign-off | Signature of the payer, date of issue, company seal (if any) |
| Warning | Breaching ม.50 ทวิ is punishable under ม.35 |

**Deadline** ([V], ม.50 ทวิ(2) via the skill): by **15 February of the following year**, or **within 1 month after the employee leaves** during the year.

**Electronic PDF** ([V] for a single taxpayer only, plus [U], via the skill §10):
- The form allows computer-printed signatures or a rubber stamp; Thai or English; the RD format.
- Ruling กค 0702/1176 (7 Mar 2557) allowed issuing it as electronic data, but that ruling binds only the taxpayer who asked. Its conditions: the same text as the form, a reliable method, ป.121/2545 ข้อ 4–8, and notifying RD on ภ.อ.11.
- **Whether a PDF sent by e-mail is acceptable today is [U].** Label it in the UI as "ตรวจกับนักบัญชีของร้าน".

**Numbering.** RD gives no format rule beyond having เล่มที่ and เลขที่. The skill §7 [V] says "เลขลำดับ" plus a counterfoil copy. The H3.6 plan already says to reuse `account/doc-numbering.ts`.

---

## Part C: recommendations for the builders

### C1. One line per bank and filing

| Target | Recommendation | Confidence |
|---|---|---|
| **ภ.ง.ด.1 / 1ก, RD Format 2.0** | **Build a fixed generator with a golden-file oracle.** UTF-8 with BOM, CRLF, pipe-separated, 22 header and 26 detail fields. Use RD's own `swc_Data_Test` files as a parse and round-trip oracle, plus the vectors in C3. Also offer RD Prep users the same file, since RD Prep can map any pipe-separated file | **high** |
| **สปส.1-10, SSO 135** | **Build a fixed generator with a golden-file oracle** for the layout. Treat the **encoding (TIS-620 vs UTF-8), line ending and file name as settings**, and label them "ยังไม่ทดสอบกับ e-Service จริง" until one real upload passes | layout **high** · bytes **medium-low** |
| **50 ทวิ (PDF)** | **Build** a PDF with the RD form's content and order exactly as listed in B3, numbered by `doc-numbering.ts`, with the 1ก line number cross-referenced. Show "PDF/อีเมล: ตรวจกับนักบัญชีของร้าน" | content **high** · e-delivery **low** |
| **KTB Corporate Online iPay** | **Build as a best-effort template.** Label it in the UI "ยังไม่ทดสอบกับธนาคารจริง". Use the OCA layout, but **truncate** fields (OCA does not) and make the encoding a setting | **low–medium** |
| **KTB Krungthai Business (Excel)** | **Build as a best-effort template** (an .xlsx with H and D rows and the official codes). Label it "ยังไม่ทดสอบกับธนาคารจริง". Better still: generic CSV plus a column guide that matches the manual | **medium** at column level |
| **KBank PCT** | **Build as a best-effort template.** Label it "ยังไม่ทดสอบกับธนาคารจริง". Enforce the official FAQ rules (CE `yyMMdd` dates, 15-digit satang amounts, header totals, ASCII file name ≤15 characters, no tabs). Positions come from one unreviewed third-party repo. No PCL/SMART variant | **low** |
| **SCB** | **Do not build. The spec is not public.** Offer the generic CSV plus column mapping instead | — |
| **BBL** | **Do not build. The spec is not public.** Offer the generic CSV plus column mapping, with a preset matching the bank's "Template-Employee" columns (First Name, Last Name, Branch Code, Account Number, Bank Code), which come only from search snippets **[S]** | — |

### C2. Generic fallback: one export the shop pastes into the bank's own template

Offer CSV, as UTF-8 with BOM and as cp874, and XLSX with every column formatted as Text. One row per payee. Columns:

`seq, payee_title, payee_first_name, payee_last_name, payee_name_en, bank_code_3 (e.g. 004), branch_code_4, account_no_digits (no dashes, keep leading zeros), promptpay_type (I/M/blank), promptpay_id, amount_baht (2dp, no thousands separator), amount_satang (integer), effective_date_ce (YYYY-MM-DD), effective_date_be (DD/MM/YYYY), payment_ref, employee_code, email, mobile`

The file ends with a summary block:
- item count,
- total in baht,
- total in satang,
- the debit account.

Column mapping:
- The shop can save a "mapping" per bank: column order, which columns are included, the date style, and the amount style (baht with 2 decimals vs satang).
- Provide presets for the KTB Business column order and the BBL Template-Employee columns.

### C3. Golden test vectors (only where the field-level spec is [V] or [V2])

All data is fictional. In the lines below `·` stands for one space; replace it with a real space in the test files. Line lengths were checked with a script (`/tmp/claude-0/-root/872c5096-2093-558d-8eaa-53dc53b5686a/scratchpad/scripts/vectors.py`). Thai text is counted in code points. For a TIS-620 file that equals bytes. For UTF-8 output the pad rule (characters vs bytes) is **[U]**.

**V1. ภ.ง.ด.1 Format 2.0 [V]**

Input:
- Company NID 0105561234567, head office, November 2569, filing by media (FORM_FLAG 1).
- Two employees, both 40(1), condition 1, paid 25/11/2569.
- Employee 1: 30,000.00 paid, 500.00 tax.
- Employee 2: 20,000.00 paid, 0.00 tax.
- USER_ID: the placeholder registration reference `REGREF0000000000001`.

Expected file name: `PND1_0105561234567_000000_2569_11_00_00.txt`.

Expected content: UTF-8 with BOM, lines ending in CRLF.

```
H|0000|0105561234567|000000|1|PND1|0105561234567|000000|สำนักงานใหญ่|0|11|2569||00|2|50000.00|500.00|0.00|500.00|0.00|REGREF0000000000001|1
D|1|000000|1100700123456|0000000000|นาย|สมชาย|ใจดี|25112569|0.00|30000.00|500.00|1|1||||||||||พญาไท|กรุงเทพมหานคร|10400
D|2|000000|3100500654321|0000000000|นางสาว|สมหญิง|รักงาน|25112569|0.00|20000.00|0.00|1|1||||||||||พญาไท|กรุงเทพมหานคร|10400
```

Assertions:
- 22 fields in H and 26 in D.
- TOT_AMT equals the sum of PAID_AMT.
- TOT_TAX equals GTOT_TAX equals the sum of TAX_AMT.
- No trailing pipe.
- Every amount has 2 decimals.

**Also use RD's own sample as an oracle:** `swc_Data_Test/PND1_TTTTTTTTTTTTT_000000_2555_04_00_00.txt`.
- Parse it, then re-emit it byte for byte: BOM, CRLF, 22/26 fields, totals 6500.00 / 650.00 over 5 detail lines.
- Its INC_TYPE values (5, 4, 3, 2, 1) and PAY_CON values (1, 1, 1, 2, 3) cover every code.

**V2. SSO 135 [V]**

Input:
- Employer account 1234567890, branch 000000, paid 15/12/2569, period 11/2569, rate 5%.
- Employee 1: นาย สมชาย ใจดี, wage 15,000.00, contribution 750.00.
- Employee 2: นางสาว สมหญิง รักงาน, wage 9,430.00. 471.50 rounds up to **472.00**.

Expected (each line 135 characters):

```
112345678900000001512691169บริษัท·ตัวอย่าง·จำกัด························050000000200000000244300000000000244400000000122200000000122200
21100700123456003สมชาย·························ใจดี·······························00000001500000000000075000···························
23100500654321004สมหญิง························รักงาน·····························00000000943000000000047200···························
```

Assertions:
- Header TOTAL WAGES `000000002443000` equals the sum of the detail WAGES.
- TOTAL PAID BY EMPLOYEE `000000122200` equals the sum of the detail PAID AMOUNT.
- Employer total equals employee total.
- TOTAL PAID `00000000244400` equals the two totals added together.
- 9,430.00 × 5% = 471.50, which rounds to 472.

Extra rounding cases (no expected bytes, rule only):

| Wage | Exact contribution | Expected |
|---|---|---|
| 9,409.00 | 470.45 | 470 |
| 1,000.00 | floor applies (1,650 × 5% = 82.50) | 83 |
| 40,000.00 | cap applies (17,500) | 875 |

**V3. KTB iPay [V2], OCA layout**

Input:
- Company ID `COMPANY01`, effective 25/11/2026 (written in CE, as OCA does).
- Standard (other-bank) file, service type 01.
- Debit account 1112223334 at branch 0123.
- Payee 1: SCB (014) account 1234567890, 15,000.00, ref PAY/0001.
- Payee 2: BBL (002) account 9876543210, 9,430.00, ref PAY/0002.

Expected (each line 498 characters, CRLF):

```
1010000010060000002000000000000244300025112026C00000000COMPANY01·······(spaces to col 498)
10200000101400000123456789000601230111222333425112026010000000000001500000········0000000000SOMCHAI·JAIDEE(…to col 192)SHOP·CO·LTD(…to col 292)(spaces)PAY/0001(…)00000109(spaces)0000(spaces)
```

The exact full lines are printed by `vectors.py` (ktb section). Key slices to assert on the first detail line:

| Positions | Expected value |
|---|---|
| 10–12 | `014` |
| 17–27 | `01234567890` |
| 54–55 | `01` |
| 58–74 | `00000000001500000` |
| 393–398 | `000001` |
| 399–400 | `09` |

Key slices to assert on the header:

| Positions | Expected value |
|---|---|
| 13–19 | `0000002` |
| 20–38 | `0000000000002443000` |

This vector tests **our port of the OCA layout**. It is **not** a bank oracle.

**V4. KBank PCT [V2-weak]: implementation test only, not a bank oracle**

Input:
- Batch reference `NOV2026`, debit account 1112223334, company "SHOP CO LTD".
- File date 2026-11-24, effective date 2026-11-25.
- Payee 1: 0123456789, 15,000.00.
- Payee 2: 0987654321, 9,430.00.

Expected: a 178-character header, then two 487-character details.

```
HPCTNOV2026·········000000··············1112223334·000000002443000·261124·························SHOP·CO·LTD·······································261125000000000000000002N·····
```

Assertions:
- Header positions 52–66 = `000000002443000`.
- Header positions 155–172 = `000000000000000002`.
- Detail 1 positions 33–47 = `000000001500000`.
- Detail 1 positions 49–54 = `261124`.
- Both date fields are CE `yyMMdd`. This part is **[V]** from the KBank FAQ.

No vectors are given for SCB or BBL: there is no spec.

---

## D. Biggest unknowns, and how to close them cheaply

1. **No bank publishes a field spec we could open.**
   - SCB and BBL: nothing at field level.
   - KBank: rules only; the positions come from one unreviewed repo.
   - KTB iPay: open-source code only.
   - **Cheapest fix:** the shop downloads its own bank's template or spec from inside the bank portal (KBank Excel Template, the BBL SMART template, SCB "Payment File Import", KTB "Download Bulk Template"), or asks its relationship manager. Then a **"preview import" or validation run in the bank portal** acts as the oracle. No money moves until someone approves it.
2. **Encoding of the fixed-width bank and SSO files (TIS-620 or UTF-8)** is unconfirmed everywhere. Column counts differ between the two for Thai names, because UTF-8 uses 3 bytes per Thai character. Make it a setting, default cp874 for SSO and KBank [U], and test once.
3. **Is SSO Format 135 still current?** The .xls is from 2010 and the e-Service manual (2023) shows only "txt, .dat". Also unclear: does e-Service want actual wages or capped wages in the WAGES field?
4. **KTB iPay date era** (CE in OCA) and whether Corporate Online still accepts this "iPay" file, compared with the newer Krungthai Business Excel template.
5. **50 ทวิ as PDF or e-mail:** there is no general RD rule, only a ruling for one taxpayer. **[U]**
6. **Pages a person can re-check in a normal browser to lift tags from [S] to [V]:**
   - https://www.bangkokbank.com/en/hint/hintbiz/biz-payroll (template download link)
   - https://www.scb.co.th/th/corporate-banking/digital-banking-services/business-anywhere/manual/payroll
   - https://www.scb.co.th/getmedia/01d61496-503d-4309-a336-31fcdc15f4e3/scb-smart-credit.pdf
   - https://www.kasikornbank.com/th/Download/Level4_doc/easymanual-kcashconnectplus-th.pdf (28 MB; the web.archive copy is cut off at 5 MB)
