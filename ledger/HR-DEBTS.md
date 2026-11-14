# HR V2 — debt register (updated for H4.9 close · local session/hr cb0fd6e58 · 14 Nov 2026)

Sources: `ledger/HR-RESUME.md` (dated lines), `ledger/wo-notes/hr-*.md`, `ledger/HANDOVER-2026-11-13-HR-H2.md` §6, H5.2 hunts (`hr-H5.2-money-hunt.md`, `hr-H5.2-privacy-hunt.md`), fix tickets HF-SSO-2569 (merge 2ed3c1c13 + fix1 a92318a03), HR-MONEY-2 (merge da06cf366), HR-PRIV-2 (merge cb0fd6e58).
Two hunt notes are **untracked** files in the lane-3 tree, not on session/hr: `wo-notes/hr-H3.10-hunt.md`, `wo-notes/hr-HF-SSO-hunt.md` (cited as such).
Columns: id · what · risk · where · fix ticket · **gate** (`PRE-PROD` = close or accept in writing before H5.3 · `NTH` = nice-to-have) · **state** (`OPEN` / `CLOSED <ticket commit>`).
Gate comes from the note when the note names H5.3 / "before go-live"; otherwise it is the doc writer's proposal, marked `(proposed)` — the controller rules on those in the table below.

## ต้องให้ผู้คุมตัดสินก่อน production

รายการที่ติด "(proposed)" ทั้งหมด · ผู้เขียนเอกสาร**ไม่ได้ตัดสิน** แค่เสนอ · ผู้คุมเลือก ก่อน prod / หลัง prod แล้วแก้คอลัมน์ gate ในตารางข้างล่าง

| id | เรื่องนี้คืออะไร (ภาษาง่าย) | ข้อเสนอ | เหตุผล (≤ 15 คำ) | ผู้คุมตัดสิน |
|---|---|---|---|---|
| G-VIS | หน้าจอเงินเดือน/ธนาคาร/แบบยื่น/สลิป/รายงานใหม่ ยังไม่เคยถ่ายภาพตรวจกับแบบ | ก่อน prod | หน้าเงินจริงที่เจ้าของร้านใช้ ยังไม่มีใครเห็นด้วยตา | ☐ |
| H3.2-reverse-untested | กลับรายการรอบจ่ายที่มีรายการหักสาย/ขาดผูกอยู่ ยังไม่มีข้อสอบ | ก่อน prod | เส้นทางเงิน เพิ่มข้อสอบข้อเดียวพอ | ☐ |
| D-H34-damage-cause | หักค่าเสียหายไม่มีช่องระบุว่าจงใจ/ประมาทร้ายแรง | หลัง prod | หักเป็นรายการรออนุมัติ มีข้อความเตือนแล้ว คนตัดสินทุกครั้ง | ☐ |
| H3.5-fullwidth | ไฟล์ธนาคาร CSV ยังไม่กันเครื่องหมาย ＝ ตัวเต็มที่อาจกลายเป็นสูตร | หลัง prod | ไฟล์ธนาคารปิดเป็นค่าเริ่ม ต้องแก้ก่อนเปิดให้ร้านใช้ | ☐ |
| D-H37-legacy-run-manual-reverse | รายการบัญชีเงินเดือนรอบเก่า ยังกลับรายการด้วยมือจากหน้าบัญชีได้ | หลัง prod | production มีร้านเดโม 1 ร้าน ยังไม่มีรอบเก่าจริง | ☐ |
| D-H37-refund-in-runless-period | เงินคืนค่าเสียหายอาจตกไปเดือนที่ไม่มีรอบจ่าย แล้วไม่มีใครเห็น | ก่อน prod | เงินพนักงานค้างเงียบ แก้ด้วยการเพิ่มในรายการค้าง | ☐ |
| D-H38-resolveSelf-former-member | อดีตพนักงานที่ถูกลบสมาชิกแล้ว ฟังก์ชันภายในยังหาตัวเจอ | หลัง prod | เข้าทางเว็บไม่ได้ ทุกทางผ่านการเข้าระบบ | ☐ |
| DEBT-H38-1 | หน้าสลิปฝั่งร้านไม่มีบรรทัดธนาคาร/รหัสพนักงาน (ส่วนสิทธิ์สาขาแก้แล้ว) | หลัง prod | เหลือแค่เรื่องหน้าตา สิทธิ์ปิดแล้วใน PRIV-2 | ☐ |
| H3.9 D-3 | ลบพนักงานถาวรแล้วแถวทะเบียนลูกจ้างค้าง/หาย ทั้งที่ต้องเก็บ 2 ปี | หลัง prod | ต้องตรวจก่อนว่าลบถาวรทำได้จริงไหม (ยังไม่ยืนยัน) | ☐ |
| H2.6-trust | ตัวตัดสินคำขอแก้เวลาเชื่อผู้ใช้/ร้านที่ชั้นปุ่มส่งมา | หลัง prod | ทุกจุดสร้างจาก session อยู่แล้ว แก้รวมกับ reader-trust | ☐ |
| H2.7-chain / H2.6-hunt | การอนุมัติหลายขั้นพร้อมกัน และลารายชั่วโมงทับลาเต็มวัน ยังไม่ได้ล่าบั๊ก | ก่อน prod | การลากระทบเงิน นักล่า H5.2 ยังไม่ได้ครอบเรื่องนี้ | ☐ |
| H2.10-hunt | ปุ่ม/ฟอร์มหน้า "ของฉัน" ยังไม่ได้ทดสอบทางเบราว์เซอร์จริง | ก่อน prod | ทำพร้อมการเดินหน้าจอ H5.1 ได้เลย | ☐ |
| D-H212-legal | ลาป่วยวันที่ 31 ขึ้นไปถูกปฏิเสธ แทนที่จะเป็นลาไม่รับค่าจ้าง | ก่อน prod | ลูกจ้างลาป่วยได้ตามจริงตามกฎหมาย ระบบห้ามยื่นไม่ได้ | ☐ |
| D-PRIV-blind-approve | ผู้ดูเงินเดือนสาขาเดียวอนุมัติรายการเงินของคนที่ตัวเองมองไม่เห็นได้ | ก่อน prod | อนุมัติเงินโดยไม่เห็นยอด ขัดกฎ PRIV-2 | ☐ |
| D-PRIV-reader-trust | ตัวอ่านข้อมูลราว 35 ตัว เชื่อข้อมูลผู้ดูที่ส่งมา ไม่อ่านสิทธิ์ซ้ำจากฐานข้อมูล | หลัง prod | ทุกวันนี้ผู้เรียกสร้างจาก session ทุกครั้ง ยังโจมตีไม่ได้ | ☐ |
| D-M2-policy-paid-flip | สลับ "ลาได้เงิน/ไม่ได้เงิน" ของนโยบายลา ขณะมีใบลาอยู่ในเดือนที่จ่ายแล้ว | ก่อน prod | ยอดเงินเดือนที่จ่ายแล้วเปลี่ยนความหมายเงียบ ๆ | ☐ |
| D-M2-gross-fallback | ต้นทุนแรงงานถอยไปใช้ยอดรวมเมื่ออ่านข้อมูลบัญชีไม่ได้ โดยไม่บอกผู้ใช้ | หลัง prod | เกิดเฉพาะรอบรุ่นใหม่ไม่ผูกบัญชีที่แก้ด้วยมือ เป็นแค่รายงาน | ☐ |
| D-PRIV-confirmBranchHours | ปุ่มยืนยันชั่วโมงสาขามีกฎสาขาของตัวเอง ([] = ไม่มีสาขา) | หลัง prod | ไม่มีเงิน แค่ปุ่มยืนยันชั่วโมง | ☐ |
| HF-SSO-M2 | ถ้าเปิดใช้แถวกฎหมายปี 1970 อย่างเดียว รุ่นใหม่จะกลับไปใช้เพดาน 15,000 | ก่อน prod | แค่เขียนในคู่มือขึ้นระบบ ไม่ต้องแก้โค้ด | ☐ |
| H3.10-F3 | ผู้จัดการที่ไม่มีสิทธิ์เงินเดือน เห็นการ์ดบัญชีเงินเดือนในหน้าตั้งค่า | หลัง prod | เห็นแค่ชื่อบัญชี ไม่มียอดเงินหรือข้อมูลคน | ☐ |
| D-PRIV-invisible-chars | ชื่อพนักงานยังรับอักขระมองไม่เห็นบางตัว และไม่จำกัดความยาว | หลัง prod | ส่งออกกันไว้แล้ว เหลือเรื่องหน้าตาและความยาว | ☐ |

รวม 21 รายการ · ข้อเสนอ ก่อน prod 10 · หลัง prod 11

## 1. Gates that are not code debts (they block v2 in prod by design)

| id | what | gate | state |
|---|---|---|---|
| G-LAW | No `HrLawTable` row ACTIVE anywhere; activation needs accountant sign-off (HQ23) + SUPER_ADMIN script (none exists — H3.3 D-5). Since HF-SSO the seed has 10 DRAFT rows (dated SSO/DEDUCTION 2569/2572/2575) | PRE-PROD for v2 (v1 unaffected) | OPEN |
| G-NA11 | `V2_VARIABLE_PAY = false` (`hr/payroll.ts:2214`): DAILY/HOURLY/commission-only shops cannot use v2 until NA-11 + `payType` header column + hourly-holiday setting + minimum-wage table | PRE-PROD for those shops | OPEN |
| G-QCALL | `qc:all` stopped at 276/465 (13 Nov); remainder + svc (60) / sec (38) families owed by H4.9 | PRE-PROD | OPEN |
| G-SVCSEC | svc/sec suites need their own QC DB env (not set up): qc-svc-b.0/b.1/b.3–b.11/b.13–b.17, r0.7, d.9 (H4.5) · qc-sec-s1.3b/s1.9/s1.17/s1.21 | PRE-PROD | OPEN |
| G-VIS | Visual batch for specs 3.4–3.9 never shot; H5.1 walk tooling merged (a0e0c6225), 609 shots planned, never run against a server | PRE-PROD (proposed) | OPEN |
| G-SSO-GO | HF-SSO-2569 (17,500 ceiling by wage period) merged but **must not go to production** until owner/accountant confirm | PRE-PROD | OPEN (owner O-30) |

## 2. Phase H3 debts

| id | what | risk | where | fix ticket | gate | state |
|---|---|---|---|---|---|---|
| D-H32-punch-cap | `TAKE = 20_000` in work-entries | — | `hr/work-entries.ts:69` | — | — | CLOSED (not a defect): H3.10 hunt D.1 — page size, not a cap; overflow refuses `WE_TEXT.tooMuch` (untracked `hr-H3.10-hunt.md`) |
| D-H32-ui-payroll | attendance-pay sync button only on attendance month view | payroll-only viewer cannot sync | `hr/attendance-pay-ui.tsx` | verify in visual batch | NTH | OPEN |
| H3.2-cast | `ApproveFailCode` narrower than returned ATTENDANCE_* codes | wrong text on refusal | `hr/payroll.ts` | H5.1 | NTH | OPEN |
| H3.2-reverse-untested | reversal of a run with bound attendance rows untested | money | qc-hr-h3.4 | H5.2 | PRE-PROD (proposed) | OPEN |
| H3.1-rebuild | rows rebuilt after a REVERSED run overwritten in place | evidence (H3.4 snapshots workDays) | `hr/work-entries.ts` | H5.2 | NTH | OPEN |
| H3.1-breakMin | plannedMin uses stored row times with LIVE roster `breakMin` | stale until rebuild (flagged) | `hr/work-entries.ts` | H5.1 | NTH | OPEN |
| H3.1-pendingleave-ui | pending-leave blocker shows only a count | user cannot find the day | work-entries UI | H5.1 | NTH | OPEN |
| H3.3 D-1 | no back-office UI for law rows | ops by script only | `hr/law.ts` | H5.3 | PRE-PROD (script at least) | OPEN |
| H3.3 D-5 | no prod activation script | human error at activation | `wo-notes/hr-H3.3.md` §10 | H5.3 | PRE-PROD | OPEN |
| H3.3 D-10 | `globalReadDb()` helper | none today | `hr/law.ts` | core WO | NTH | OPEN |
| H3.3-rawsql | raw SQL through tenant client blocked only by fitness F16.9 | platform | `core/db.ts` | platform | NTH | OPEN |
| D-H34-damage-cause | no "wilful / gross negligence" cause field on damage deductions | unlawful deduction | H4.6 claims UI | H5.1 | PRE-PROD (proposed, legal) | OPEN |
| D-H46-refund-kind | REFUND kind exists; auto-flow from `refundOwedSatang` deferred | manual refund | `hr/stock-charge.ts` | H4.6 follow-up | NTH | OPEN |
| H3.4-instalments | HQ7 instalments not built | owner feature | payroll | owner HQ7 | NTH | OPEN |
| H3.4-payType-header | H3.2 header has no `payType` | needed when NA-11 flips | `HrAttendanceDeduction` | with NA-11 | NTH | OPEN |
| H3.4-visual | payroll v2 UI not shot (spec 3.4) | layout unseen | `hr/payroll-run-ui.tsx` | see G-VIS | PRE-PROD (see G-VIS) | OPEN |
| H3.4-m3-int4 | run total > 21,474,836.47 ฿ ⇒ raw Prisma error | crash | `payroll.ts` create v1/v2 | HR-MONEY-2 R4 `RUN_LIMIT` | — | CLOSED HR-MONEY-2 da06cf366 |
| H3.5-preset-edit | no preset edit form | UX | `hr/bank-files/ui.tsx` | H5.1 | NTH | OPEN |
| H3.5-bank-fields | no per-employee bank/branch code; banks beyond 4; SCB/BBL/PCL generators; MD5 | some banks unusable | `hr/bank-files/*` | after HQ14 | NTH | OPEN |
| H3.5-fullwidth | full-width ＝ not caught as formula start in bank CSV | CSV injection edge | `bank-files/generic.ts` | H5.2 | PRE-PROD (proposed, security) | OPEN (reports side closed by PRIV-2; bank side not) |
| D-PRIV-bank-names | bank-file refusal text still fills `{names}` with raw employee names | display spoof in refusal | `hr/bank-files/build.ts:60` · `codes.ts:14` | H5.1 | NTH | OPEN |
| HQ14 | bank formats untested with a real bank | wrong transfer file | H3.5 | owner sample | PRE-PROD before a shop enables a format | OPEN |
| D-H36-account-pure | pure re-export module in account/** | maintainability | `fitness.mts` F2.2 | accounting WO | NTH | OPEN |
| D-H36-test-hook | test hook `opts.__afterIssue` in prod code | low | `hr/filings/service.ts` | H5.1 | NTH | OPEN |
| H3.6-sso-utf8 | UTF-8 SSO name cut splits decomposed accents | rejected row | `hr/filings/sso.ts` | H5.1 | NTH | OPEN |
| H3.6-bahttext | `bahtText(1)` wording | wording | account | accounting | NTH | OPEN |
| H3.6-pnd-safeint | no safe-integer assertion on PND totals | float artefact | `hr/filings/rd.ts` | H5.2 | NTH | OPEN |
| H3.6-cert-stale | reversal not blocked by a live 50 ทวิ; cert keeps citing reversed run (flag `stale` only) — confirmed by H3.10 hunt F2 | outdated certificate | `payroll.ts reverseRunH37` · `filings/service.ts issueOne` | H5.1 | NTH | OPEN |
| H3.6-untested | PND1/1ก/SSO 1-10 untested with real e-Filing / e-Service | rejected filing | H3.6 | accountant trial upload | PRE-PROD before shops file | OPEN |
| D-H37-legacy-run-manual-reverse | pre-H3.7 payroll journals reversible by hand from accounting | books ≠ payroll | `account/journal-v2.ts` | accounting WO | PRE-PROD (proposed, money) | OPEN |
| D-H37-refund-in-runless-period | give-back ∥ approve of a later period can leave a refund in a period with no run; not in stranded list | refund never paid | `hr/payroll.ts giveBackClaim` | H5.2 | PRE-PROD (proposed, money) | OPEN |
| D-H37-setbook-two-tx | book link + pay-account clear in two tx | — | `hr/payroll.ts:3566-3583` | — | NTH (downgraded) | CLOSED as checked: H3.10 hunt F1 — race reachable but mark-paid re-checks and refuses `PAY_ACCOUNT`; no wrong entry |
| H3.10-F3 | MANAGER without payroll key sees the payroll-accounting card (book name, money-account names, default pay account) | info exposure (no money/PII) | `settings/page.tsx:96,649` · `hr/payroll.ts:3598` | H5.1 | PRE-PROD (proposed) | OPEN |
| H3.7-refund-claim-link | old refund requests carry no claim id ⇒ 4900 + flag | misclassified refunds | `requestRefundAdjustment` | H5.1 | NTH | OPEN |
| H5.2-M1 | give-back REFUND paid after its claim's run was reversed and claim cancelled | overpay | `payroll.ts` reverse/cancel | HR-MONEY-2 R1 (void/hold, `REFUND_HELD`, `REFUND_BOUND`) | — | CLOSED HR-MONEY-2 da06cf366 |
| D-M2-v1-reverse-silent | v1 reverse shows no refusal reason (CARRY_BOUND, LATER_RUN, JV codes, REFUND_BOUND) | user does not know why | `hr/payroll-actions.ts:220` | H5.1 | NTH | OPEN |
| H3.7-ui-perf | payroll-ui up to 30 `giveBackPeriodOf` lookups per render | slow page | `hr/payroll-ui.tsx` | H5.1 | NTH | OPEN |
| H3.7-rest-mapping | REST cannot map PAYROLL_* keys (by design) | none | account REST | — | NTH | OPEN (by design) |
| D-H38-slip-lock-timeout | slip/PDF tx has no `lock_timeout`; ~30 s wait behind reverse | error page | `hr/payslip.ts` | H5.1 | NTH | OPEN |
| D-H38-resolveSelf-former-member | `resolveSelf` serves a linked former employee after Membership deleted; not reachable over HTTP | privacy if a non-session entry appears | `hr/self.ts` | H5.2 privacy | PRE-PROD (proposed, privacy) | OPEN |
| D-H38-prefix-lookalike | 50 ทวิ prefix may be "HRSC" | cosmetic | filings settings | H5.1 | NTH | OPEN |
| D-H38-pdf-sara-am | ZWNJ between tone mark and ำ | visual | `hr/payslip-pdf.tsx` | visual pass | NTH | OPEN |
| DEBT-H38-1 | gate slip page: no bank line/employee code · borrowing scope | scope part fixed (`loadPayslipForViewer` = home pay scope) | slip gate page · `privacy.ts` | H5.1 (cosmetic part) | PRE-PROD (proposed, privacy) | PARTLY CLOSED HR-PRIV-2 cb0fd6e58 (scope) · OPEN (bank line/code) |
| DEBT-H38-4/5 | two slip lists on `/app/me/hr/pay`; inbox CERT not summarised | UX | self pay · inbox | H5.1 | NTH | OPEN |
| D-H39-leave-limit-shopwide | leave LIMIT counts employees shop-wide before branch filter | branch viewer refused on big shop | `hr/reports.ts` | H5.1 | NTH | OPEN |
| D-H39-rehire-same-record | rehire on same row keeps old endDate in register | wrong register | `hr/reports.ts` | rehire flow | NTH | OPEN |
| H3.9 D-1…D-7 | name not split · no wage-rate history · orphan register rows on hard delete (s.115) · no self export of time record (s.114) · daily/hourly rate · historical branch · holiday-OT ฿ in wages | legal record keeping | `wo-notes/hr-H3.9-design.md` §6 | H5.1 / NA-11 | NTH (D-3 PRE-PROD proposed) | OPEN |
| H5.2-F2 | reports gave a branch-limited payroll viewer pay of BORROWED employees for any period | privacy MAJOR | `reports.ts:172` | HR-PRIV-2 (`payScopeWhere`) | — | CLOSED HR-PRIV-2 cb0fd6e58 |
| D-PRIV-register-formula | position/nationality cells that look like formulas still block the whole register export (fixed text now) | owner cannot export until fixed | `hr/reports.ts` exportProblem | H5.1 | NTH | OPEN |
| H3.4-YTD-F4 | opening income INT ceiling 21,474,836.47 ฿ | very high earners | `HrPayrollOpeningYtd` | Decimal migration if asked | NTH | OPEN |
| H3.4-YTD-filed | filed ภ.ง.ด.1ก not guarded against later opening change | amended filing manual | payroll-opening | H5.1 | NTH | OPEN |
| H3.4-YTD-rehire | rehire row accepts an opening while original 50 ทวิ is live | double count | payroll-opening | rehire flow | NTH | OPEN |
| H3.4-YTD D1/D2 | previous employer income · CSV import | owner effort | payroll-opening | after accountant Y-01 | NTH | OPEN |
| SET-N1 | non-HR whole-object settings writers lack `type` filter | cross-module overwrite | `point/service.ts:555` etc. | hardening WO outside HR | NTH | OPEN |
| SET-N3 | long attendance-pay sync queues every HR settings save | timeouts | `settings-lock.ts` callers | H5.2 perf | NTH | OPEN |

## 3. Fix tickets after H3 (HF-SSO-2569 · HR-MONEY-2 · HR-PRIV-2) — new or changed

| id | what | risk | where | fix ticket | gate | state |
|---|---|---|---|---|---|---|
| HF-SSO-2569 | v1 hard-coded SSO ceiling 15,000; WHT SSO allowance capped 9,000 | under-deducted SSO 2569 | `payroll-rules.ts` (frozen) → new `payroll-rules-sso.ts` | HF-SSO | see G-SSO-GO | CLOSED in code 2ed3c1c13 + a92318a03 (not deployed) |
| HF-SSO-M1 | statics accept any hunk tagged HF-SSO (h3.2 S1.8, h3.4-lib, h3.6, h3.9, set-1); h3.7 pinned to one line by fix1 | oracle looseness | listed oracles | oracle sweep | NTH | PARTLY CLOSED a92318a03 (h3.7) · OPEN (others) |
| HF-SSO-M2 | activating only the 1970 SSO/DEDUCTION rows makes v2 use 15,000 / 9,000 for 2026+ | wrong v2 SSO/WHT | runbook (H3.3 §10) | H5.3 runbook text | PRE-PROD (proposed) | OPEN |
| HF-SSO-M3 | RECOMPUTE gate also runs for v2 runs without `inputDigest` (QC data only) | none in prod | `payroll.ts:2729-2733` | H5.2 | NTH | OPEN |
| HF-SSO-N2 | labour estimate + opening `SSO_HIGH` now show for shops without ACTIVE law rows | visible change — tell owner | `labor.ts:340` · `payroll-opening.ts:216` | owner O-30 | NTH | OPEN (info) |
| D-HFSSO-labour-13sat | 31-day months at the cap: per-day labour estimate +13 satang/employee/month | estimate only | labor.ts | — | NTH | OPEN (untracked `hr-HF-SSO-hunt.md` N2) |
| D-v2-jan-13month | two v2 runs paid in the same January both get monthIndex 1 ⇒ second projects 13 months (≈273 ฿/month over-withheld until Dec) | WHT over-withholding | `payroll.ts:2546` | accountant W-11 · H3.3 rule | NTH (v2 dormant) | OPEN |
| D-v1-joiner-x12 | v1 mid-year joiner WHT annualised ×12 (not remaining months); annual remainder not in last period | WHT | `payroll-rules.ts` (frozen) | accountant W-12 | NTH | OPEN (pre-existing) |
| D-m6-rehire-sso | same-month rehire = two rows ⇒ up to 2 × SSO ceiling; SSO 1-10 two lines per national id | SSO over-deduction | `payroll-run-rules.ts:434` · `filings/sso.ts:165` | accountant S-07 | NTH | OPEN |
| D-m7-v1-ot-round | v1 manual OT by hours rounds twice (+1 sat at 10 h, +93 sat at 744 h) | satang drift | `payroll-rules.ts:108,114` → `payroll.ts:235-238` | accountant P-06 (v1 frozen) | NTH | OPEN |
| D-K1-leaver-wht | leaver's final-period WHT still projects remaining months (e.g. 1,566.25 ฿ where year tax 0) | WHT | `payroll-run-rules.ts:440` | accountant W-04 (NA-12) | NTH | OPEN |
| H5.2-M2 | labour ACTUAL left out advance/claim recoveries, included REFUNDs | report ≠ books | `labor.ts:632,652` | HR-MONEY-2 R2 | — | CLOSED HR-MONEY-2 da06cf366 |
| H5.2-m4 | back-dated leave decision on an APPROVED/PAID month accepted silently | silent pay mismatch | `leave.ts` · `service.ts decideLeave` | HR-MONEY-2 R5/R6 (refused `CORRECTION_TEXT.paid`) | — | CLOSED HR-MONEY-2 da06cf366 (by refusal) |
| H5.2-m5 | borrowed shift: ACTUAL charged to home branch | wrong branch cost | `labor.ts` | HR-MONEY-2 R3 | — | CLOSED HR-MONEY-2 da06cf366 (holiday-lookup half: see D-M2-first-roster-unit) |
| D-M2-auto-refund | back-dated paid leave (e.g. sick) covering a day already deducted in a paid month is **refused**; no automatic refund | employee must be handled by hand | `hr/leave.ts leavePaidRunRefusalInTx` | owner decision O-29 | NTH | OPEN |
| D-M2-policy-paid-flip | flipping a leave policy's `paid` flag while approved leaves sit in paid months — no gate | paid months change meaning silently | `hr/leave.ts` `updateLeavePolicy` | MONEY follow-up | PRE-PROD (proposed, money) | OPEN (`hr-MONEY-2-oracle.md` "Open gap") |
| D-M2-first-roster-unit | the FIRST roster entry of the day decides the day's unit for labour ACTUAL (split shifts in two branches) | branch cost skew | `hr/labor.ts:774-780` `money2DayUnits` | H5.2 | NTH | OPEN |
| D-M2-gross-fallback | labour ACTUAL falls back to gross when accrual inputs are not ok — no user signal; truncated ACTUAL (>50,000 rows) mixes accrual + gross (banner exists) | report figure silently different | `hr/labor.ts` ~747-763 | H5.1 | NTH (proposed) | OPEN |
| D-M2-offboard-leave-gate | offboarding cancels leaves without the paid-month gate (no money effect) | inconsistency | `hr/lifecycle.ts` offboard | H5.2 | NTH | OPEN |
| D-M2-legacy-held | legacy APPROVED refunds of already-reversed claims become `REFUND_HELD` at the next build (not paid) | owner must reject by hand | `payroll.ts money2HeldRefundsInTx` | owner O-31 | NTH | OPEN (info) |
| H5.2-F1 | branch payroll viewer saw a BORROWED employee's national id, SSO no, house-reg address, bank, docs | privacy MAJOR | `privacy.ts:57,92-101` | HR-PRIV-2 (`inPayScope`) | — | CLOSED HR-PRIV-2 cb0fd6e58 |
| H5.2-F3 | payroll page: borrowed salary + whole-run totals ⇒ others' pay by subtraction | privacy MAJOR | `payroll-ui.tsx:93-105,350-362` | HR-PRIV-2 | — | CLOSED HR-PRIV-2 cb0fd6e58 |
| H5.2-F4 | renamed employee (control/bidi) blocks every money export; refusal echoed raw name | export DoS + spoof | `reports.ts:700-701` | HR-PRIV-2 (sanitise name cell, fixed refusal text, `HR_NAME_BAD` on write) | — | CLOSED HR-PRIV-2 cb0fd6e58 |
| D-PRIV-reader-trust | ~35 service readers trust caller ctx + viewer instead of re-reading DB Membership (H5.2 F5) | latent cross-tenant read if a caller caches a viewer | `privacy.ts` · `inbox.ts` · roster/judge/leave/… | gateOf/memberOf pattern | PRE-PROD (proposed, privacy) | OPEN |
| D-PRIV-blind-approve | `decideAdjustmentAs` lets a branch-limited viewer approve an adjustment whose amount they cannot see (inbox batch) | approve money unseen | `hr/inbox.ts:384` → `payroll.ts decideAdjustmentAs` | PRIV follow-up | PRE-PROD (proposed, privacy/money) | OPEN |
| D-PRIV-confirmBranchHours | `confirmBranchHours` keeps its own copy of the unit rule (`unitsOfViewer`, `[]` = none, unlike `hrScopeOf`) | inconsistent scope (no money) | `hr/payroll.ts:3114,3202` | H5.1 | NTH (proposed) | OPEN |
| D-PRIV-invisible-chars | `HR_NAME_BAD` misses further invisible code points; no name length cap (10k-char position accepted) | display spoof / layout | `hr/privacy-shared.ts:123` | H5.1 | NTH (proposed) | OPEN |
| D-PRIV-workentries | work-entries `covers` keeps its own minutes-only copy of the scope rule (frozen) | drift | `hr/work-entries.ts` | later | NTH | OPEN |
| D-PRIV-home-history | pay scope = CURRENT home branch (a moved employee's history moves with them) | history visible to new branch | `scope.ts inPayScope` | later | NTH | OPEN |
| D-PRIV-service-run-guard | `approveRun` / `markPaidRun` / `reverseRun` services take no viewer (actions check all-branch) | defence in depth | `hr/payroll.ts` | H5.2 | NTH | OPEN |
| D-PRIV-name-error-text | `createEmployee` bad-name refusal shows a generic error (form has no message channel) | user confused | `hr/ui.tsx` employees form | H5.1 visual batch | NTH | OPEN |
| D-PRIV-link-skip-silent | `linkStaffToHr` skips a booking staff whose name strips to empty, tells no one | missing employee | `booking/service.ts:686-688` | H5.1 visual batch | NTH | OPEN |
| D-PRIV-oracle-gaps | no check pins the self viewer's slip `item` byte-for-byte; borrowed-worked split path proven by code order only | test gap | `qc-hr-priv-2` | oracle author | NTH | OPEN |
| D-M2-oracle-D2 | legacy-leave revoke refusal not pinned | test gap | `qc-hr-money-2` | R5.11 ORACLE-EDIT (15 Nov) | — | CLOSED (`hr-MONEY-2-oracle.md` §11) |

## 4. Earlier phases still open (H0–H2, H4)

H0–H2 open list: `HANDOVER-2026-11-13-HR-H2.md` §6. Rows below = items with a gate, plus H4 tickets merged after H3.10.

| id | what | where | fix ticket | gate | state |
|---|---|---|---|---|---|
| D-H24-maxdur | no `maxDuration` on HR transactions | HR actions/routes | H5.3 | PRE-PROD | OPEN |
| D-H24-pinonly | PIN-only kiosk only with ≥ 6-digit PINs | kiosk | — | NTH | OPEN |
| H2.6-trust | correction decide trusts actor/tenant from action layer | `hr/correction.ts` | with D-PRIV-reader-trust | PRE-PROD (proposed) | OPEN |
| H2.7-chain / H2.6-hunt | approval-chain races; hourly + full-day leave not hunted | leave/correction | H5.2 | PRE-PROD (proposed) | OPEN |
| H2.10-hunt | server actions end-to-end (cookies) not hunted (H5.2 privacy could not call server actions either) | `/app/me/hr` | H5.1 walk | PRE-PROD (proposed) | OPEN |
| H2.9-untested | no ACTIVE law row tested on a DB (OT) · overnight day-off split | `hr/ot.ts` | after G-LAW | PRE-PROD for v2 | OPEN |
| H2.9-reversal | reversing a PAID run after an OT revoke pays then deducts (net 0) | payroll | accountant | NTH | OPEN |
| D-H29-rate-inline / D-H29-reason-ui | below-floor rate → error page · 0-settle reason not shown | OT UI | H5.1 | NTH | OPEN |
| H2.2-touch | long-press drag untested on a real device | roster board | H5.1 | NTH | OPEN |
| VIS-1-a/c | 404 tabs render; tab strip overflow 1440; 6 minors | HR tabs | H5.1 | NTH | OPEN |
| D-H212-legal | sick day 31+ refused instead of unpaid · child-care 50 % · maternity per pregnancy · preset race · paid cap separate from quota | `hr/leave-presets*` | after v2 engine | PRE-PROD (proposed, legal) | OPEN |
| H0.5 F4b/D3/F7/F8 | null actor on `setEmployeeActive` · PIN reset text · per-device limiter · `listEmployees` select | `hr/pin.ts` / service | ยังไม่ยืนยัน — ตรวจที่ `wo-notes/hr-H0.5.md` | NTH | OPEN (unverified) |
| D-H41-week-rule | published week, rostered off ⇒ booking falls back to shop hours | `hr/availability.ts` | ORACLE-EDIT + fixture | NTH | OPEN |
| X-HR.1b | booking closes whole day for half-day/hourly leave (SVC) | SVC | SVC owner | NTH | OPEN |
| H4.4-narrow | `employee: true` selects carry offboardNote server-side | lifecycle | H5.2 | NTH | OPEN |
| H4.6-orphan | orphan stock movement after crash · item lock 2 connections · tenant purge must delete HrStockCharge before employees · concurrent charges can drive stock negative | `hr/stock-charge.ts` · `scripts/pending/sweep-m11-orphans.mts` | H5.3 (purge order) | PRE-PROD (purge order) | OPEN |
| D-H42-vat-exclusive / D-H42-hub-queries / smallGroup key | labour % on VAT-inclusive sales · hub queries · misnamed key | `hr/labor.ts` | owner O-26 · H5.1 | NTH | OPEN |
| H4.2-FIX1 | open month MTD, partial per figure, day-1 null, nested-unit cap, Thai label | `hr/labor.ts` | folded into H4.3 | — | CLOSED H4.3 dace682c8 |
| D-H45-self-core | move `resolveSelf` into a light `hr/self-core.ts`; drop lazy `import("./self")` | `hr/line-*` | later | NTH | OPEN |
| D-H45-account-change-lock | `endLineLinksForAccountInTx` takes no hrline lock (use-time checks cover the race) | H4.5 | later | NTH | OPEN |
| D-H45-read-side-effect | `validActive` ends stale LINE links from read paths (chip, status, menu) | H4.5 | later | NTH | OPEN |
| D-oracle-later-mark-per-hunk | qc-hr-h4.2 S1.6 accepts any later-ticket mark per hunk, not the exact ticket | oracle | oracle sweep | NTH | OPEN |
| D-ai-suspended-tenant | AI tools for a suspended tenant's member rely on session-entry enforcement (pre-existing, all AI tools) | `core/context.ts` | platform | NTH | OPEN |
| D-H43-brief-cache | Daily Brief HR line recomputed uncached per secretary turn | H4.3 | later | NTH | OPEN |
| D-H43-pending-flag-visibility | pending `hr_flag_pattern` proposal blocks other managers for that employee+month; they cannot see/reject it | H4.3 | later | NTH | OPEN |
| H4.3-Z1-residue | qc-hr-h3.7 left 3 tenants once (cause unknown, not reproduced) — watch | QC4 | watch | NTH | OPEN (watch) |
| D-H48-cursor | offset paging on `GET /employees` | `hr/api` | later | NTH | OPEN |
| D-H48-leaves-cap-filter | leaves of ended employees count toward the 100-row cap before filtering | `privacy.leaveItemsForViewer` → `service.listLeaves` | later | NTH | OPEN |

## 5. Known red suites that are NOT HR defects (and test-tooling debts)

| suite / checks | why | owner | state |
|---|---|---|---|
| POS lane-pin statics p2.11 ST1/ST4 · p2.12 ST1 · p3.5 ST1/ST2 · p3.6 ST2/ST3 · P3.7-ST1/ST3 · P3.9-ST4 · p2.13 ST5 | stale pins of the finished POS RUN vs merge-base; all POS DB checks green | POS owner (re-pin) | OPEN |
| qc-nav-functions S5 | main's BOOKING/HOTEL routes missing from nav list; no HR route missing | main | OPEN |
| qc-kanban-k1.15 S3.2/S3.4 | `skills/shark-kanban-api/references/` not in the repo | kanban owner | OPEN — confirm at H4.9 on a clean base |
| qc-member-m1.11 | member count 63 ≠ 60 on shared QC4 + null profile (shared-DB state) | member owner | OPEN — confirm at H4.9 |
| qc:all acc-v2 (31) · account-api (9) · crm (19) · hf (4) · hardening HD-5.2 | seed time-rot, QC-only guards, stale generated docs, Permissions-Policy red on main | per `wo-notes/hr-H2-close-qcall.txt` | OPEN |
| `pnpm drift` on QC4: `DormUtilityRate` index | QC4 shared with other RUNs; HR tables no drift | dorm/HOTEL RUN | OPEN |
| D-QC-h05-lanes | qc-hr-h0.5 spawns the PIN backfill through `scripts/qc4.sh` (QC4) while its fixture is on the lane DB ⇒ S6.2/S6.4/S6.5/S6.7 red on lanes (green on QC4) | `scripts/qc-hr-h0.5.mts` | oracle fix | OPEN (`hr-HF-SSO.md:70`) |
| D-QC-svc-booking-freeze | qc-svc-b.16 S-2 and qc-svc-d.10 S-2 freeze `booking/service.ts`; HR-PRIV-2 changed it (marked hunks). Expected not to trip on a committed clean tree (`git status --porcelain`) — not run (SVC env) | SVC suites | verify at H4.9 | OPEN (unverified) |

## Counts

Rows in §2–§4: **117** · CLOSED **14** (+ 2 partly closed, counted open) · OPEN **103** · OPEN with gate PRE-PROD **25**, of which **16** are "(proposed)" · gates §1: **6**, all OPEN (G-VIS proposed) · decision table: **21** rows = 16 PRE-PROD (proposed) + 3 NTH (proposed) + G-VIS + H3.9 D-3 · §5 tooling/known-red rows: 8.

## Contradictions found

1. D-H32-punch-cap: ledger (12 Nov 23:10Z) said "H3.4 phase B fixes"; the constant is unchanged, but the H3.10 hunt (untracked note) shows it is a page size with a refusal on overflow — closed as "not a defect" on that evidence.
2. D-H46-refund-kind: HANDOVER-H2 implies it closes in H3.4; H3.4 design §3 #41 says PARTIAL.
3. D-H32-refund-kind: H3.2 notes asked for a non-taxable kind; ruling L6 kept taxable ALLOWANCE — closed by ruling.
4. D-H37-setbook-two-tx was PRE-PROD in the H3.10 register; the H3.10 hunt shows no wrong money entry ⇒ downgraded (the hunt note is untracked on session/hr).
5. HF-SSO-M1: the HF-SSO fix1 commit title says h3.7 S1.7 now accepts one HF-SSO line; the review's other loose regexes (h3.2, h3.4-lib, h3.6, h3.9, set-1) were not changed by any note I found.
