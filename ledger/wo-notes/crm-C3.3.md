# WO C3.3 — คอมมิชชัน → เงินเดือน (DRAFT ของ builder — ผู้คุมงานเติมช่อง D2/D6/D7/D9/D12)

> RUN "CRM v2" · worktree `/root/projects/shark-crm-c12a` (detached 77a6ebe8) · 26 ก.ย. 2569 · ผู้คุมงาน: Fable 5.1 · builder: Opus 5.5
> สัญญา: `ledger/CRM-RUN.md` §2 C3.3 · ใบสั่ง `ledger/crm-briefs/crm-brief-C3.3.md` (addendum 1–13 + มติผู้คุมงาน ก–จ) + COMMON + RESOLUTIONS
> พิมพ์เขียว `docs/modules/20-crm-v2.md` §5.9 §11.6 · มติ C3 · ภาพ `ledger/design-crm/10-teams-quota-commission.png` (ขวา)
> ข้อสอบ: `scripts/qc-crm-c3.3.mts` (61 ข้อ · commit test 77a6ebe8 · **ไม่แก้**)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/crm/commissions.ts` | ใหม่ | บริการทั้งหมด: onPaid/onWon/reverse/syncPayroll · approve/approveMany/reject · listRules/createRule/updateRule · mine/list/pending/report · ตัวต่อ afterPaymentCounted/afterPaymentsReversed/afterDealMoved · applyApprovalDecision · onPayrollPaid · advanceById · runPayrollSync |
| `src/lib/modules/crm/commissions-shared.ts` | ใหม่ | บริสุทธิ์: commissionOf (TIERED marginal ปัดครั้งเดียว) · shareOf/cumulativeOf (ผลรวมสะสม) · splitParts · commissionPeriodOf/firstFreePeriod (เดือนไทย) · checkRuleConfig · commissionSettingsOf · ป้ายไทย · DTO |
| `src/lib/platform/crm-bridges/commissions.ts` | ใหม่ (R-D) | ตัวรับ hr.payroll.paid + crm.commission.created/approved/reversed |
| `src/lib/modules/crm/index.ts` | บล็อก C3.3 | `export * as commissions` |
| `src/lib/modules/hr/payroll.ts` | บล็อก C3.3 | requestAdjustment(+crmCommissionId, +tx) → ทางแยก requestCommissionAdjustment (ON CONFLICT DO NOTHING บน partial unique) · markPaid ใน tx เดียวกับ emit `hr.payroll.paid` · payrollEmployeeOfUser (active เท่านั้น) · payrollRunPeriods · adjustmentOfCommission · adjustmentsOfRun |
| `src/lib/modules/hr/index.ts` | บล็อก C3.3 | re-export ล้วน |
| `src/lib/modules/crm/payments.ts` | 6 บรรทัดที่มีป้าย | หลัง commit: afterPaymentCounted (PAYMENT · DOC_SETTLE · POS_SALE ×2) · afterPaymentsReversed (reverseRow · flagDocumentVoided) |
| `src/lib/modules/crm/deals.ts` | 1 บรรทัดที่มีป้าย | หลัง commit ของ moveCore: afterDealMoved (WON = onWon · ออกจาก WON = ถอนแถวฐาน WON) |
| `src/lib/approval-effects.ts` | บล็อก C3.3 | กิ่ง `crm.commission` → applyApprovalDecision |
| `src/lib/outbox-consumers.ts` | 2 บล็อก C3.3 | crmCommissionBridge + 4 consumer (crmFirst) |
| `src/lib/webhooks/labels.ts` | บล็อก C3.3 | ป้าย 4 event (ประกาศที่เดียว) |
| `src/lib/platform/minute-jobs.ts` | บล็อก C3.3 | งาน `crm.commissions.payroll` ทุก 5 นาที |
| `src/lib/modules/crm/nav.ts` · `src/app/app/layout.tsx` | บล็อก C3.3 | `/crm/settings/commissions` · `/crm/commissions` |
| `src/app/app/sys/[id]/crm/settings/commissions/{page,actions}.ts(x)` · `src/app/app/sys/[id]/crm/commissions/page.tsx` | ใหม่ | หน้า UI + server actions |
| `src/components/crm/commissions/{CrmCommissionSettings,CrmMyCommissions}.tsx` · `types.ts` | ใหม่ | หน้าจอ client (ไม่ import โมดูล CRM — F2.3) |
| `scripts/crm-ui-inventory.json` | +29 แถว wo C3.3 | 26 แถว `/settings/commissions` · 3 แถว `/commissions` |
| `scripts/gen-crm-api-docs.mts` · `docs/api/CRM-API.md` | บล็อก C3.3 + สร้างใหม่ | สาขา payload ของ `crm.commission.*` (ไม่งั้นตกค่าปริยาย `teamId, change`) · คู่มือสร้างจาก generator (F13.11) — หลัง merge ให้รัน generator ใหม่ ไม่ต้อง patch ไฟล์คู่มือ |

## 2. migration / seed / backfill
ไม่มี (R-C.1 — crm_v2_c ของ C3.0 มีครบ) · ไม่มี seed · ไม่มี backfill

## 3–4. ด่าน + กลุ่ม X — ดูรายงาน builder (ผู้คุมงานเติม D2/D6/D7/D9/D12)
| กลุ่ม | ใช้? | check ids |
|---|---|---|
| X1 | ใช้ | X1.1–X1.5 |
| X2 | N-A | ไม่มี op REST / tool AI ในใบนี้ (crm_commissions_mine = C3.4/C3.8) |
| X3 | ใช้ | X3.1–X3.4 (+a) · ล็อกต่อดีลของผลรวมสะสม · conditional insert |
| X4 | ใช้ | X4.1–X4.5 · S1.4 · S2.2 |
| X5 | N-A (บางส่วน) | งานรายนาทีไม่จองแถว — idempotent ด้วย unique + guard + ล็อกแถว (X4.5/S4.4) |
| X6 | ใช้ | X9.1 (config 7 แบบ) · M5 (จำนวนเงินจากฐานเท่านั้น) |
| X7 | N-A | ไม่มี endpoint สาธารณะ |
| X8 | ใช้ | X8.1 · S8.6 |
| X9 | ใช้ | X9.1 · X9.2 |
| X10 | N-A | ไม่มีไฟล์/ความลับ |

## 5. ผลข้อสอบ (log ที่ `.qc-shots/c33/`)
- qc-crm-c3.3: r1 56/61 (บั๊กตัวอ่าน HR ไม่มี systemId) → r2 61/61 → final (ดูรายงาน)
- qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hr-payadjust 27/27 · qc-hr 9/9 · qc-approval 16/16 · qc-approval-edit 12/12 · qc-approval-wiring 7/7
- qc-crm-c2.7 62/63 (S0.4 นับ crm_v2_c เป็น migration เกิน — ORACLE-EDIT S0.4 ลง main แล้ว ยังไม่อยู่ในสำเนานี้) · qc-crm-c0.2 27/27 · qc-crm-c0.3 88/88 · qc-crm-c1.3 89/89 · qc-crm-c1.5 103/103 · qc-crm-c1.11 66/66 (`CRM_V2_SWITCH=all` ผ่าน `iso.sh env …`) · qc-nav-functions 11/11
- fitness 32/32 ทั้งมี env และ `env -u DATABASE_URL` · typecheck สะอาด 2 รอบ
- probe หลักฐาน (`probe-c33.log`): 12 onPaid ขนาน = 1 แถว · 2 งวดขนาน = Σ 166,666 · 23505 · markPaid ย้อนทั้ง update+event · WON ชนะซ้ำตามมติ ค

## 7. มติทางเทคนิคของ builder (ให้ผู้คุมงานยืนยัน)
- **มติ C32** (ยอมรับรอบแรก แล้ว **แทนที่ด้วยมติรีวิวเงิน B1**): T = `valueSatang` ถ้า > 0 · ไม่งั้นยอดก่อน VAT (POS Σ grandTotal − vat · เอกสาร `account.docNetBeforeVat` = subTotal − discountAmount) · **T แช่ไว้ที่ `basisSatang` ของแถวแรกของ (ดีล, กฎ)** ⇒ บิล/เอกสารที่ตามมาเปลี่ยนส่วนแบ่งไม่ได้ · wonValueSatang (รวม VAT · ลอย) ไม่ถูกอ่านอีก · ผลข้างเคียง upsell ⇒ Q10 · โค้ด `commissions.ts` `baseTotalOf` / `frozenTotal`
- (ผู้คุมงานยอมรับข้อ 2–5 ของรายงานรอบแรก) มติ ง แจ้งเจ้าของร้าน: ใช้เทมเพลต `commission.status` ที่มีอยู่ (ข้อสอบ C2.10-S0.2 ล็อกไว้ที่ 10 เทมเพลตพอดี — เพิ่ม `commission.pending` = C2.10 แดง) · ครั้งเดียวต่อแถวด้วยธง AuditLog `crm.commission.escalate` ใต้ advisory lock
- มติ ค (WON ชนะซ้ำ): DTO `rewon` + ป้าย "เคยจ่ายแล้ว" ในทั้งสองหน้า · คำถามเจ้าของ = **Q9** (Q8 ถูกใช้แล้วโดย C2.7) — ร่างข้อความอยู่ในรายงาน builder
- ส่วนแบ่งที่ปัดเป็น 0 ไม่เขียนแถว ⇒ ยอดของงวดนั้นไม่ถูกนับใน "ก่อน" ของกฎนั้น (เสีย < 1 สตางค์ต่องวดแบบนั้น)
- ถอนคืนหลังงวดถูกยกเลิกแล้วมีงวดใหม่เข้ามา: "ก่อน" นับเฉพาะงวดที่ยัง COUNTED ⇒ ส่วนแบ่งอาจต่างจากเต็มได้ ±ปัดเศษ

### ร่าง Q9 สำหรับ `ledger/CRM-OWNER-QUESTIONS.md` (ผู้คุมงานเป็นคนลง — ไฟล์ไม่อยู่ในรายการของ builder)
> ## Q9 (26 ก.ย. · C3.3 — เดินหน้าด้วยค่าเริ่มต้น "ไม่จ่ายซ้ำอัตโนมัติ") — ดีลที่ชนะ → ถูกเปิดใหม่ → ชนะอีกครั้ง: คอมมิชชันแบบ "คิดเมื่อปิดการขาย" ถูกถอนคืน (หักคืนในเงินเดือนงวดถัดไป) ตอนเปิดดีลใหม่ และเมื่อชนะอีกครั้ง **ระบบจะไม่สร้างคอมมิชชันให้อีกเอง** (หน้าคอมมิชชันแสดงป้าย "เคยจ่ายแล้ว") · ถ้าต้องการให้จ่ายใหม่ทุกครั้งที่ชนะ ตอบ "จ่ายใหม่" = เพิ่มใบงาน (เปลี่ยนกุญแจของแถวเป็นรหัสประวัติการชนะ) · กฎแบบ "คิดเมื่อรับเงิน" ไม่มีปัญหานี้

### ร่าง Q10 (ผู้คุมงานเป็นคนลง)
> ## Q10 (26 ก.ย. · C3.3 — เดินหน้าด้วยค่าเริ่มต้น "เพดานที่มูลค่าดีล") — ยอดฐานคอมมิชชันเมื่อใบแจ้งหนี้สูงกว่ามูลค่าดีล (upsell): เพดานที่มูลค่าดีล (ปัจจุบัน) หรือยอดสุทธิก่อน VAT ของเอกสาร · ปัจจุบันระบบคิดคอมมิชชันจาก "มูลค่าดีล" หรือ "ยอดเอกสารที่รับเงิน" แล้วแต่ตัวไหนน้อยกว่า (กัน VAT ปนเข้าไปในฐาน) ⇒ ขายเพิ่มในบิลเกินมูลค่าที่ตั้งไว้ในดีล ส่วนที่เกินไม่ได้คอมมิชชัน จนกว่าจะแก้มูลค่าดีล · ตอบ "ยอดก่อน VAT ของเอกสาร" = เพิ่มใบงาน (ต้องให้ระบบบัญชีส่งยอดก่อน VAT มาให้)

## 7b. ส่วนที่เพิ่มตามมติผู้คุมงาน (26 ก.ย. — ห้ามเป็นหนี้แบบอ่านอย่างเดียว)
- ตัวเขียน `settings.crm.commission`: `settings.ts` `setCrmCommissionSettings` (บล็อก C3.3 — jsonb ซ้อนสองชั้นคำสั่งเดียว แบบ `setCrmAiKey`) · บริการ `commissions.getCommissionSettings` / `setCommissionSettings` (คีย์ `crm.settings.manage` · zod `.strict()` · audit `crm.commission.settings` before/after) · `createRule` ไม่ระบุฐาน = ฐานปริยายของร้าน
- หน้า `/crm/settings/commissions`: กล่อง "ค่าตั้งคอมมิชชันของร้าน" (testids `crm-commission-setting-approval|payroll|basis` · `crm-commission-settings-save` · +4 แถวในทะเบียน) · action `saveCrmCommissionSettingsAction`
- การ์ด "คอมมิชชัน" ในหน้ารวม `/crm/settings` (key `commissions` · testid `crm-settings-card-*` แถวเดิมครอบ · คีย์ `crm.settings.manage`)
- probe: `.qc-shots/c33/probe-c33-settings.log` — PASS (ค่าอื่นของ `crm` รอด · MANAGER FORBIDDEN · 3 แบบผิด = VALIDATION · audit 1 แถว)


## 5b. ผลรอบสุดท้ายบน tree สุดท้าย (N10 · log `.qc-shots/c33/final-*.log` · สรุป `final-summary.log`)
qc-crm-c3.3 57/61 (แดงเฉพาะ 4 ข้อที่มติรีวิวเปลี่ยนพฤติกรรม: S1.1 · S5.2 · X4.2 · X3.3 → ORACLE-EDIT 1–4) · qc-payroll 19/19 · qc-payroll-reverse 14/14 ·
qc-hr-payadjust 27/27 · qc-hr 9/9 · qc-approval 16/16 · -edit 12/12 · -wiring 7/7 · qc-crm-c2.7 62/63 (S0.4 = ORACLE-EDIT ของ main ที่สำเนานี้ยังไม่มี) ·
qc-crm-c2.10 40/41 (S0.2 → ORACLE-EDIT 5) · qc-crm-c1.5 103/103 · c1.3 89/89 · c0.2 27/27 · c0.3 88/88 · c1.10 66/66 · qc-nav-functions 11/11 ·
qc-crm-c1.11 66/66 (`iso.sh env CRM_V2_SWITCH=all`) · fitness 32/32 ทั้งสองโหมด · typecheck สะอาด (5120 · ISO_MEM=6G · gate lock)
probe: `probe-c33-review.log` (B1 ×2 · B2 · B3 ×3 · S2 · S6 = PASS) · `probe-c33-final.log` (race · markPaid · 23505 · WON 4a/4b = PASS) · `probe-c33-settings.log` PASS

## 7c. รีวิวเงิน (4 BLOCKER · 8 SHOULD-FIX · 12 NOTE) — ทำครบตามมติผู้คุมงาน
| ข้อ | ทำอะไร (commissions.ts เว้นแต่ระบุ) | หลักฐาน |
|---|---|---|
| B1 | `baseTotalOf` (value > 0 · ไม่งั้นก่อน VAT: POS + `account.docNetBeforeVat` ใหม่ใน account/service.ts+index.ts บล็อก C3.3 · เส้น crm→account เดิม) · `frozenTotal` = basisSatang ของแถวแรก · basisSatang ของแถว PAID = T (เดิม = ยอดงวด) ⇒ ORACLE-EDIT S1.1 | probe B1: FIXED 24,000 · TIERED 65,000 (ขณะ wonValue ลอยทุกงวด) |
| B2 | ส่วนแบ่ง = max(0, F_T(Σ งวดที่ยัง COUNTED ซึ่งคิดกฎนี้แล้ว + งวดนี้) − Σ ยอดแถวต้นทางของกฎนี้ที่งวดยัง COUNTED (รวม REJECTED)) — **ต่างจากถ้อยคำมติ 1 จุด**: "Σ COUNTED ของดีล" จำกัดเฉพาะงวดที่ "คิดกฎนี้แล้ว + งวดนี้" ไม่งั้นงวดที่ประมวลผลก่อนดูดทั้งก้อนเมื่อสองงวดนับพร้อมกัน (X3.1/X3.2 สัดส่วนต่องวดแดง) | probe B2: net 1,000,000 พอดี · X3.1/X3.2 เขียว |
| B3 | `handoffReversal`: ต้นทาง HR REJECTED/หาย ⇒ ปิดเรื่อง (note `COMMISSION_REVERSAL_SETTLED_NOTE`) ไม่หัก · HR PENDING + runId null ⇒ `hr.withdrawCommissionAdjustment` (ใหม่ · guard PENDING+runId null+crmCommissionId) ใต้ล็อกทั้งสองแถว ล้างลิงก์ต้นทาง ปิดเรื่อง · อื่น ๆ ⇒ DEDUCTION | probe B3 ×3 (rejected · pending · control approved) · ORACLE-EDIT S5.2/X4.2/X3.3 |
| B4 | updateRule ห้ามเปลี่ยนฐานเมื่อกฎมีแถว (VALIDATION ข้อความตามมติ) · onPaid/onWon ข้ามกฎที่มีแถวฐานอื่นบนดีลนั้น (`hasOtherBasisRows`) | โค้ด |
| S1 | `afterDealMoved` (ออกจาก WON): แถวที่ยังไม่ถึงเงินเดือน (ไม่มี HR หรือ HR PENDING+runId null → ถอนก่อน) ⇒ ลบ + cancelRequest + audit `crm.commission.remove` · ที่ถึงแล้ว ⇒ ถอนคืน (มติ ค) | probe (4a) ลบแล้วชนะใหม่ได้แถวใหม่ · (4b) ถอนคืน+DEDUCTION ไม่สร้างใหม่ ป้าย rewon |
| S2 | approve ห้ามของตัวเอง (ยกเว้น OWNER) · pending ไม่แสดงแถวของตัวเอง · handoff ส่ง `requestedById` = ผู้อนุมัติด้วยมือ (audit ล่าสุด) ให้ HR 4 ตา | probe S2 |
| S3 | คิว (1ก)(1ข) คัดใน SQL: กฎตรง pipeline/ทีม · เงิน/ชนะหลังสร้างกฎ · ยังไม่มีแถวของกฎนั้น · cursor · syncPayroll คัดใน SQL (ไม่มีแถวถอน · ยอด ≤ เพดาน · ไม่ปิดเรื่อง · ถอนคืนเฉพาะที่ต้นทางเคยส่ง) + ตัวอ่าน HR `activeLinkedUserIds` + cursor | โค้ด |
| S4 | HR `requestCommissionAdjustment` ตอบ `code:"PERIOD_CLOSED"` เมื่องวดมีรอบแล้ว ⇒ `requestInTx` เลื่อนเดือน (ใต้ล็อก · อ่านรอบด้วย tx) · ตัวกวาด (5) ในงานรายนาที: `hr.strandedCommissionAdjustments` → `rehomeStranded` (ถอน + ยื่นใหม่ + ผูกลิงก์ ใน tx เดียวใต้ FOR UPDATE) | โค้ด (ไม่มี probe — งานรายนาทีวิ่งทั้ง QC DB ร่วม จึงไม่รันบน QC1) |
| S5 | `ownerTeams` ไม่กลืน error | โค้ด |
| S6 | approvalRequired + ไม่มีสาย ⇒ คง PENDING · `escalateOnce` แจ้ง `commission.pending` (เทมเพลตใหม่ใน notifications-shared.ts บล็อก C3.3 · ลิงก์ `/settings/commissions`) ref CrmCommission/<id> · ธงปักเมื่อแจ้งถึงจริงเท่านั้น · คิว (3) ข้ามแถวที่แจ้งแล้ว ⇒ ORACLE-EDIT C2.10-S0.2 | probe S6 (3 advance เพิ่ม → 1 notice · 1 flag) |
| S7 | `mineTotals` (SQL bigint) — หน้า "ของฉัน" ใช้ตัวนี้ | โค้ด |
| S8 | onPaid `FOR SHARE` แถวรับเงินใต้ล็อก + ตรวจ COUNTED | โค้ด |
| N2 | `take` ทุก findMany ที่รีวิวชี้ (+ ตัวอ่าน HR + หน้า settings) · N5 WARN เพดาน HR ครั้งเดียวต่อแถว (`flagOnce`) · N6 ถอนคืนไม่ขึ้นกับ payrollLink · N11 `firstFreePeriod` คืน null ⇒ VALIDATION | โค้ด |

### ORACLE-EDIT ที่ขอ (ผู้คุมงานเป็นคนแก้ — builder ไม่แตะไฟล์ข้อสอบ)
1. **C3.3-S1.1** (`scripts/qc-crm-c3.3.mts:553`) — เหตุ: มติ B1 ให้ basisSatang = T ที่แช่ไว้ (ไม่ใช่ยอดงวด) · หลักฐาน `qc-crm-c3.3-review-r1.log` act `bs:"2000000"` ทั้งสองแถว
   `- ... && Number(r.basisSatang) === sat && ...` → `+ ... && Number(r.basisSatang) === 2_000_000 && ...` (+ ข้อความ "basisSatang = that payment" → "basisSatang = the frozen pre-VAT base T")
2. **C3.3-S5.2** (`:926-928`) — เหตุ: มติ B3 ต้นทาง HR PENDING + ยังไม่เข้ารอบ ⇒ ถอนรายการต้นทาง ไม่หัก · หลักฐาน probe B3-pending + review-r1 `ded=[]`
   `- && s52Rev.periodKey === expK && dAdj.length === 1 && dAdj[0].kind === "DEDUCTION" && b(dAdj[0].amountSatang) === DP.s52.exp && dAdj[0].periodKey === expK && dAdj[0].employeeId === eTH`
   `- && s52Rev.hrPayAdjustmentId === dAdj[0].id && origAfter?.status === "APPROVED",`
   `+ && s52Rev.periodKey === expK && dAdj.length === 0 && (await adjOf(orig?.id)).length === 0 && !origAfter?.hrPayAdjustmentId && !!s52Rev.note`
   `+ && origAfter?.status === "APPROVED",` (+ ชื่อข้อ "ONE DEDUCTION …" → "the original's un-approved HR adjustment is withdrawn, nothing deducted")
3. **C3.3-X4.2** (`:942`) — เหตุเดียวกัน · `- revRows.length === 1 && dAdj.length === 1` → `+ revRows.length === 1 && dAdj.length === 0 && (await adjOf(orig?.id)).length === 0`
4. **C3.3-X3.3** (`:1309` fixture) — เหตุ: B3 · **ข้อเสนอให้คงการพิสูจน์ "DEDUCTION ครั้งเดียวภายใต้การแข่ง"**: ให้ HR อนุมัติรายการต้นทางก่อนยิง (tenant X ไม่มีรอบจ่าย ⇒ ไม่กระทบข้ออื่น)
   `  c.orig = ((await comm({ dealId: c.d.id, refType: "DEAL_PAYMENT" }))[0] as Any)?.id ?? null;`
   `+ for (const a of await adjOf(c.orig)) await PAY.decideAdjustment({ tenantId: tidX, systemId: hrX }, a.id, "APPROVED", { userId: uO, isOwner: true });`
   (ข้อตรวจที่ `:1398` ไม่ต้องแก้)
5. **C2.10-S0.2** (`scripts/qc-crm-c2.10.mts:238 · 254`) — เหตุ: มติ S6 เพิ่มเทมเพลต `commission.pending`
   `- const WANT_KEYS = [..., "invoice.paid"];` → `+ const WANT_KEYS = [..., "invoice.paid", "commission.pending"];`
   `- ... TPL.length === 10 && ...` → `+ ... TPL.length === 11 && ...` (+ ข้อความ "10 templates" → "11 templates" ใน S0.2/S3.1)

## 7d. รีวิวเงินรอบ 2 (1 BLOCKER · 5 SHOULD-FIX · notes) — ทำครบ
| ข้อ | ทำอะไร | หลักฐาน (`probe-c33-r2.log`) |
|---|---|---|
| R1 | `frozenTotal(…, valueBased)`: ดีลมีมูลค่า = แช่ที่แถวแรก · ดีลไม่มีมูลค่า = max(T สูงสุดที่เคยใช้, ยอดก่อน VAT ปัจจุบัน) โตได้อย่างเดียว แถวใหม่พก T นั้น | R1-seq 500 + 5,000 = 5,500 (T แถวที่ 2 = 110,000) · R1-par 2 บิลพร้อมกัน ×2 = Σ 5,500 |
| S-a | `netOfPayments`: บิล POS satang×(grand−vat)/grand · รับชำระ/ปิดยอดเอกสาร satang×net/grand ของเอกสารหลัก (`docRatioOf` อ่านนอกล็อก) · ไม่รู้ VAT = ยอดเต็ม · ปัดลงต่องวด (Σ อาจขาด full ≤ 1 สตางค์ต่องวดที่หารไม่ลง — ยอมรับ) | 8,000 / 8,000 / 8,000 |
| S-b | `handoffReversal` ตัดสินทั้งหมดใต้ล็อกแถวถอนคืน+ต้นทาง ด้วย `adjustmentOfCommission(…,{tx})` · ถอนไม่ได้ = อ่านใหม่แล้วตัดสินอีกรอบ · ไม่มีค่าก่อนล็อกใช้ตัดสินเงิน | 5 รอบ HR ไม่อนุมัติขณะถอนคืนแข่งกัน = 0 DEDUCTION ทุกรอบ |
| S-c | `rehomeStranded` เฉพาะ PENDING+runId null · ย้ายงวดในที่เดิม `hr.moveCommissionAdjustmentPeriod` (guard คำสั่งเดียว + งวดปลายทางต้องไม่มีรอบ) · ย้ายไม่ได้ = โยน · `strandedCommissionAdjustments` คืน PENDING เท่านั้น · `runPayrollSync(opts.tenantIds)` จำกัดร้านได้ (ใช้ใน probe) | a1 ย้ายในที่เดิม (id เดิม แถวเดียว ไม่อยู่ในรอบ) ขณะสร้างรอบแข่ง · a2 APPROVED ไม่ถูกแตะ |
| S-d | `applyApprovalDecision`: ผู้ตัดสินขั้นสุดท้าย (`approval.lastDecisionOf` — ตัวอ่านใหม่ใน approval/service.ts+index.ts บล็อก C3.3) = เจ้าของรายการและไม่ใช่ OWNER ⇒ REJECTED + เหตุผลไทย + audit (actor = ผู้ตัดสิน) · audit อนุมัติผ่านสายบันทึกผู้ตัดสิน ⇒ `requestedById = approverOf ?? row.userId` | ผู้จัดการตัดสินคอมมิชชันของตัวเอง ⇒ REJECTED · ส่งซ้ำไม่เปลี่ยน |
| S-e | คิว (1ก): ดีลที่ยังไม่มีแถวของกฎนั้นเลย ไม่จำกัด 3 วัน (cursor คุม) ⇒ มูลค่า/เอกสารที่ตั้งทีหลังยังได้เครดิต · **ยอมรับ**: สองกฎบนดีลเดียวกันที่เริ่มคิดคนละเวลาอาจแช่ T ต่างกัน (ดีลมีมูลค่า = ตัวเดียวกัน · ดีลไม่มีมูลค่า = ตามยอดขณะนั้นของแต่ละกฎ) | โค้ด |
| notes | onPaid ไม่ให้เครดิตย้อนหลัง (`countedAt < rule.createdAt` ⇒ ข้าม) · updateRule ห้ามเปลี่ยน ชนิด/อัตรา/มูลค่าขั้นต่ำ เมื่อกฎมีแถว (ข้อความเดียวกับ B4 · เทียบ config แบบเรียงคีย์ — jsonb เรียงคีย์ใหม่) · ธงแจ้งเจ้าของร้านปักเมื่อเรียกสำเร็จแม้นับได้ 0 · ลบแถวตอนเปิดดีลใหม่ตรวจชนิดดีลใต้ล็อกต่อดีล (ลำดับ ดีล → แถว) · `take` ครบ (+ HR appSystem.findMany) · คิว (3) หยิบแถวที่เคยแจ้งเจ้าของร้านเมื่อร้านปิด approvalRequired ภายหลัง (หนี้ข้อนี้ปิดแล้ว) | โค้ด |

### ผลรอบ r3 (tree สุดท้าย · oracle ที่ผู้เขียนข้อสอบแก้แล้ว · log `.qc-shots/c33/r3-*.log`)
qc-crm-c3.3 **74/74** · payroll 19/19 · payroll-reverse 14/14 · hr-payadjust 27/27 · hr 9/9 · approval 16/16 · -edit 12/12 · -wiring 7/7 ·
c2.7 62/63 (S0.4 — ORACLE-EDIT ของ main) · c2.10 41/41 · c1.5 103/103 · c1.3 89/89 · c0.2 27/27 · c0.3 88/88 · c1.10 66/66 · nav 11/11 · c1.11 66/66 ·
fitness 32/32 ×2 · typecheck สะอาด · probe `probe-c33-r2.log` R1-seq · R1-par · S-a · S-b · S-c · S-d = PASS

## 7e. รอบ 4 — แถวรับเงินที่ถูก "ปลุก" (C2.7 fix: DOC_SETTLE REVERSED → COUNTED ด้วย id เดิม ยอดใหม่)
- ~~refId ต่อการนับ `<paymentId>` / `<paymentId>#r<n>`~~ **แทนที่ในรอบ 5 (§7f) ด้วยกุญแจร่าง `<paymentId>#c<countedAt ms>`** · (ของเดิม:) `<paymentId>` ครั้งแรก · `<paymentId>#r<n>` ต่อการปลุกครั้งที่ n (n = จำนวน refId ต้นทางที่มีอยู่ของงวดนั้นในกฎนั้น ใต้ล็อกต่อดีล) — `commissions.ts` `payRefOf` · ทุกคิวรีที่จับคู่คอมมิชชัน ↔ แถวรับเงินใช้ `split_part(refId,'#',1)` (`payIdSql`) · `reverse({refId})` ถอนทุกการปลุกของงวดนั้น
- **"นับแล้ว"** = มีแถวต้นทางของงวดนั้น (การปลุกใดก็ได้) ที่ยังไม่มีแถวถอนคืน · **เครดิตแล้ว/ยอดสะสม** นับเฉพาะแถวต้นทางที่ยังไม่ถูกถอน (แถวที่ถอนแล้วหักล้างกับแถวถอนของมันเอง)
- **PENDING ของเงินที่ถูกถอน = ลบ** (audit `crm.commission.remove` + cancelRequest) ไม่ใช่ REJECTED · APPROVED/PAID ⇒ แถว REVERSED เหมือนเดิม
- ผลพลอยได้ที่แก้ไปด้วย: ทางเปิดดีลที่ชนะแล้วแยก "ดีลชนะกลับมาแล้ว ⇒ ข้าม" ออกจาก "ลบไม่ได้ ⇒ ถอนคืน" (เดิมแถวของดีลที่ชนะอยู่ถูกส่งไปถอนผิด)
- **สัญญาตัวต่อ (hook contract) สำหรับผู้คุมงานตอน merge C2.7 fix** — `payments.ts` ต้องเรียก **หลัง commit** ทุกครั้ง:
  1. แถว DOC_SETTLE ถูกสร้างใหม่ **หรือถูกปลุก** (REVERSED → COUNTED ยอดใหม่) ⇒ `await (await import("./commissions")).afterPaymentCounted(ctx, { dealId, refType: DOC_SETTLE_REF_TYPE, refId: documentId })` — บรรทัดเดียวกับทางสร้างใหม่ (บรรทัดที่มีป้าย `CRM C3.3 ▸` ใน `onInvoiceFullyPaid`) ต้องครอบทางปลุกด้วย
  2. แถว DOC_SETTLE ถูกถอน (รวมถอนเพื่อปลุกใหม่เพราะ WHT เปลี่ยน) ⇒ `await (await import("./commissions")).afterPaymentsReversed(ctx, { dealId })` **ก่อน** ข้อ 1 ของการปลุกครั้งนั้น
  3. ทั้งสองตัวกลืน error เอง (WARN) · idempotent (เรียกซ้ำ/พร้อมกันได้) · งานรายนาที (1ก)(2) เก็บให้ถ้าไม่ได้เรียก
  4. **(รอบ 5) ถอน+ปลุกในธุรกรรมเดียว** (`reconcileDocSettle` — REVERSED ไม่เคยให้ใครเห็น): C2.7 **ต้องตั้ง `countedAt` ใหม่ทุกครั้งที่ปลุก** (กุญแจร่างมาจาก countedAt) แล้วเรียกเพียงข้อ 1 — `afterPaymentCounted` ถอนแถวของร่างเก่า (กุญแจไม่ตรง) ก่อนแล้วจึงคิดร่างใหม่ · ไม่ต้องเรียกข้อ 2 (เรียกก็ได้ — มันหาแถว "ค้าง" ของงวดที่ยัง COUNTED ด้วย)
- probe `.qc-shots/c33/r4-probe.log`: P 9,700 + settle 300 ⇒ 970 + 30 · ถอน settle ⇒ −30 · ปลุก settle (id เดิม) ⇒ แถวใหม่ `<settleId>#r1` = 30 · ส่งซ้ำ ×3 ไม่เปลี่ยน · สุทธิ 1,000 · PENDING ของงวดที่ถูกถอน ⇒ ลบ + คำขอ CANCELLED + audit · ปลุกแล้วได้เครดิตใหม่

### ผลรอบ r4 (log `.qc-shots/c33/r4-*.log` · สรุป `r4-summary.log`)
qc-crm-c3.3 74/74 (ไม่มีข้อที่ผูกกับ refId แบบเดิม) · qc-payroll 19/19 · qc-hr-payadjust 27/27 · qc-crm-c2.7 62/63 (S0.4 = ORACLE-EDIT ของ main) · qc-crm-c1.5 103/103 ·
qc-crm-c0.2 27/27 · qc-crm-c2.10 41/41 (สำเนาข้อสอบ 11 เทมเพลตคงไว้) · fitness 32/32 ×2 · typecheck สะอาด · probe `r4-probe.log` wake + pending-delete = PASS

## 7f. รอบ 5 — รีวิวเงินรอบสุดท้าย (1 BLOCKER · 4 SHOULD-FIX · notes)
| ข้อ | ทำอะไร (`commissions.ts`) | หลักฐาน (`r5-probe.log`) |
|---|---|---|
| B1 | กุญแจร่าง `refId = <payId>#c<countedAt ms>` (`incKey` · SQL `keySql`) อ่าน countedAt ใต้ FOR SHARE · "นับแล้ว" = มีแถวกุญแจร่างนี้ · "เครดิตแล้ว/ยอดสะสม" นับเฉพาะแถวของร่างปัจจุบันของแต่ละงวด · `afterPaymentCounted` ถอนแถวค้าง (`reverse({refId, keepKey})` — prefix match ยกเว้นร่างปัจจุบัน) แล้วจึง onPaid · `afterPaymentsReversed` + งานรายนาที (2) เพิ่ม `OR (COUNTED AND refId <> key(p))` · เลิกใช้ `#r<n>` | settle 300 → 100 ถอน+ปลุกในธุรกรรมเดียว (raw update satang+countedAt): 970 + 30 − 30 + 10 = **980** · ส่งซ้ำไม่เปลี่ยน |
| S1 | ท้าย `afterPaymentsReversed`: งวดที่ยัง COUNTED ที่ไม่มีแถวของร่างปัจจุบัน (take 50) ⇒ onPaid | จ่ายเกิน: A 10,000 → 1,000 · B 4,000 → 0 (ไม่มีแถว) · ถอน A (เงินย้อนหลัง 10 วัน) ⇒ −1,000 แล้ว B ได้ **400** |
| S2 | `lastDecisionOf` ไม่มี `.catch` (fail closed — ล้ม = event ถูกส่งใหม่) | โค้ด |
| S3 | ผู้ตัดสินในสาย = เจ้าของรายการ (ไม่ใช่ OWNER) ⇒ คง PENDING · ผูกคำขอไว้ · note ไทย (ไม่มี "ยื่นใหม่") · `flagOnce(crm.commission.selfdecide)` เป็น audit · `escalateOnce` ถึงเจ้าของร้าน | PENDING + คำขอเดิม + note + แจ้งเจ้าของร้าน 1 ใบ (ส่งซ้ำ ×2) |
| S4 | แถว WON ประทับ `createdAt = เวลาเข้า WON` · onWon ก่อนคิด: แถวที่ยังมีชีวิตซึ่ง `createdAt < เวลาเข้า WON ครั้งนี้` = ของการชนะครั้งก่อน ⇒ `retireWonRows(dealMayBeWon)` (ยังไม่ถึงเงินเดือน = ลบ + event/audit · ถึงแล้ว = ถอนคืน ตามมติ ค) แล้วคิดใหม่ · ทางเปิดดีลใช้ฟังก์ชันเดียวกัน | ชนะ 100,000 → เปิดใหม่ (ข้ามตัวต่อ) → แก้เป็น 50,000 → ชนะ ⇒ **5,000** (แถวเก่า 10,000 ถูกลบ + audit) · ส่งซ้ำไม่เปลี่ยน |
| N4 | คิว (1ก) NOT EXISTS มี `c."dealId" = p."dealId"` + เทียบกุญแจร่าง | โค้ด |
| N5 | `crm.commission.removed` (ใน tx ของการลบ · payload id/สตางค์ล้วน · ป้ายใน webhooks/labels.ts · consumer no-op + automation · คู่มือ API สร้างใหม่) | โค้ด |
| N6 | อัตราส่วนก่อน VAT ต่อ "เอกสารของงวดนั้นเอง": facade บัญชีใหม่ `commissionDocRatios` (รับชำระ → เอกสาร · เอกสาร → net/grand · อ่านล้วน) · ไม่รู้ = ยอดเต็ม | โค้ด |
| N7 | "นับแล้ว" ต่อผู้ใช้: ไม่มี early-skip — unique + skipDuplicates ตัดสินรายคน (ส่วนแบ่งคิดซ้ำได้ค่าเดิม) | โค้ด |
| N8 | ไม่มีเครดิตย้อนหลังเทียบ "เวลานับร่างแรก" = ms น้อยสุดในกุญแจของแถวเดิมของงวดนั้น (ทุกกฎ) หรือร่างนี้ | โค้ด |

### ORACLE-EDIT รอบ 5 (ผู้คุมงาน/ผู้เขียนข้อสอบเป็นคนแก้ · หลักฐาน `.qc-shots/c33/r5-qc-crm-c3.3.log` = 61/74)
ทุกข้อที่แดง **ยอดเงินถูกทุกตัว** (ดูช่อง act) — แดงเพราะข้อสอบเทียบ `refId === <id แถวรับเงิน>` ซึ่งมติ B1 เปลี่ยนเป็น `<id>#c<ms>` และ S4.8 ที่มติ S3 เปลี่ยน REJECTED → PENDING
- เพิ่มตัวช่วยครั้งเดียวใกล้ `desc` (`scripts/qc-crm-c3.3.mts:540`): `+ const payOf = (ref: unknown) => String(ref ?? "").split("#")[0];`
- แทนการเทียบ refId ของแถว PAID (แถว WON `refId === ""` และ REVERSAL `refId === orig.id` **ไม่แตะ**):
  - S1.1/S1.2 `:571` `new Map(rows.map((r) => [String(r.refId), r]))` → `[payOf(r.refId), r]` · `:578` `r.refId === p11a.rowId` → `payOf(r.refId) === p11a.rowId` (+ `p11b`)
  - S1.3 `:586-587` · S3.2 `:731-732` · M9 `:1498-1499` · M6 `:886-887` · M7 `:910` · X3.2 `:1793-1794` — `r.refId === X` / `x.refId === X` → `payOf(r.refId) === X`
  - S2.1 `:655` `wp[0].refId === pW1.rowId` → `payOf(wp[0].refId) === pW1.rowId` · S3.4 `:763` `r.refId === ref` → `payOf(r.refId) === ref`
  - M10 `:1564` `rows[0].refId === ref` → `payOf(rows[0].refId) === ref` · X3.1 `:1776-1777` `p.id === x.refId` → `p.id === payOf(x.refId)`
  - (ถ้าต้องการพิสูจน์รูปแบบกุญแจ: S1.1 เพิ่ม `&& /^[^#]+#c\d+$/.test(r.refId)`)
- **S4.8** `:1611` มติ S3: `sM?.status === "REJECTED" && aM.length === 0` → `sM?.status === "PENDING" && !!sM?.approvalRequestId && !!sM?.note && aM.length === 0` (+ ข้อความ "⇒ REJECTED" → "⇒ stays PENDING (request kept · note · owner notified)")

### ผลรอบ r5 (log `.qc-shots/c33/r5-*.log` · สรุป `r5-summary.log`)
qc-crm-c3.3 61/74 (13 ข้อ = ORACLE-EDIT รอบ 5 ข้างบน · ยอดเงินถูกทุกข้อ) · qc-payroll 19/19 · qc-hr-payadjust 27/27 · qc-approval 16/16 · -edit 12/12 · -wiring 7/7 ·
qc-crm-c2.7 62/63 (S0.4 = ORACLE-EDIT ของ main) · qc-crm-c1.5 103/103 · qc-crm-c0.2 27/27 · fitness 32/32 ×2 · typecheck: รอบแรกแดง (ชนิด `PayRow` หายตอนแก้ — ชนิดล้วน ไม่กระทบตอนรัน) → แก้แล้วรอบสองสะอาด (`r5-typecheck-2.log`) ·
probe `r5-probe.log`: B1 980 · S1 400 · S3 PENDING+แจ้ง 1 ใบ · S4 5,000 = PASS

## 7g. รอบ 6 — รีวิวเงินรอบ 5 (2 BLOCKER · 2 SHOULD-FIX · notes) — ทำครบ
| ข้อ | ทำอะไร (`commissions.ts`) | หลักฐาน (`r6-probe.log`) |
|---|---|---|
| B-1 | คืน skip "นับแล้ว" ต่อ **กฎ**: ใน tx ก่อนคิด T `findFirst({dealId, ruleId, refType DEAL_PAYMENT, refId: กุญแจร่างนี้})` (ผู้ใช้ใดก็ได้ · รวมแถวที่ถอนแล้ว) ⇒ ข้าม · docstring คืนแล้ว · คิว (1ก) กรองใน SQL เพิ่ม (active · pipeline · `minDealSatang` เมื่อมีมูลค่า · `countedAt ≥ rule.createdAt`) + ธง `OpsAlertState.source = crm.commission.nomatch:<กุญแจร่าง>:<ruleId>` สำหรับทางที่ "ไม่มีแถว" เป็นคำตอบถาวร (ทีม/สินค้าไม่ตรง · ก่อนสร้างกฎ · ฐานอื่น · และส่วนแบ่ง 0 / T ≤ 0 / T < ขั้นต่ำ **เฉพาะเมื่อฐานนิ่งแล้ว** = ดีลมีมูลค่าและกฎนี้มีแถวบนดีลแล้ว — ฐานยังไม่นิ่งไม่ติดธง เพราะมูลค่า/เอกสารที่ตั้งทีหลังเปลี่ยนคำตอบได้ ตามมติ S-e · ดีลไม่มีเจ้าของกรองใน SQL อยู่แล้ว) · (1ก) ตัดคู่ (งวด, กฎ) ที่มีแถวหรือธงแล้ว · `updateRule` ที่เปลี่ยน pipeline/ทีม/สินค้า/active ลบธงของกฎนั้น · ธงผูกกุญแจร่าง ⇒ การปลุกได้การประเมินใหม่เอง | เครดิต A 1,000 → เปลี่ยนเจ้าของเป็น B → sync ×2 + onPaid ซ้ำ ⇒ ยังแถวเดียวของ A 1,000 · ธงกฎทีม 1 แถว |
| B-2 | `at` ของ onWon = แถวประวัติ **แรกของช่วง WON ปัจจุบัน** (แถวล่าสุดที่เข้าขั้น WON ซึ่ง fromStage เป็น null หรือไม่ใช่ WON) · แถวก่อนหน้า = แถวที่ createdAt < at · WON→WON จึงไม่มีอะไรเปลี่ยน | ย้าย ชนะ → ชนะ-ส่งมอบ + onWon ซ้ำ ⇒ แถว byte-identical · event คอมมิชชัน 2 → 2 |
| S-1 | `reverseRows` ใน tx ของแต่ละแถว: DEAL_PAYMENT ⇒ `FOR SHARE` แถวรับเงิน · ถ้ายัง COUNTED และ refId = กุญแจร่าง **ปัจจุบัน** ⇒ ข้าม · `afterPaymentCounted`/`afterPaymentsReversed` ไม่อ่านกุญแจก่อนล็อกแล้ว (เลิกส่ง keepKey) | settle 300 → ปลุก 100 แล้วยิง `reverse({refId: payId})` + `afterPaymentsReversed` พร้อมกัน (ตัวต่อที่มาช้า) ⇒ แถวไม่เปลี่ยน · Σ 10 |
| S-2 | `afterPaymentCounted` อ่าน ms ของกุญแจร่างเก่า **ก่อน** ลบแถว PENDING แล้วส่ง `firstCountedMs` ให้ onPaid · DOC_SETTLE ใช้ `cur.createdAt` ร่วมด้วย | S-2a PAYMENT (approvalRequired + สาย): PENDING 100 → ลบ (คำขอ CANCELLED) → R1 = 50 · กฎที่สร้างระหว่างทาง 0 แถว · S-2b DOC_SETTLE นับก่อนมีกฎ → ปลุกหลังสร้างกฎ ⇒ 0 แถว |
| notes | `docRatiosOf` fail closed (ล้ม = โยน · ทางเดิน retry) · `escalateOnce` คืน boolean — ล้ม ⇒ ไม่ตั้ง note/ธง selfdecide (คิว (3ข) ใหม่: PENDING ที่มีคำขอแต่ไม่มีธง selfdecide ⇒ `approval.requestStatuses` ⇒ APPROVED ⇒ ใช้ผลซ้ำ · (3) เดิมครอบแถวไม่มีคำขอ) · (2) รวมดีลที่มีงวดถูกถอนใน 7 วัน (เรียก `afterPaymentsReversed` ซ้ำ ⇒ S1 revisit กันโพรเซสตาย) · ร่างใหม่ของงวดที่ร่างเก่าถูก **คน** ไม่อนุมัติ (REJECTED) ⇒ เกิด PENDING + note `COMMISSION_WAS_REJECTED_NOTE` ("เคยถูกปฏิเสธ…") และ `advance` ไม่อนุมัติเองแม้ปิด approvalRequired (ส่งเจ้าของร้าน) | โค้ด |

### ข้อสอบที่ผู้เขียนข้อสอบต้องเพิ่ม (ค่าที่คาดแบบตรงตัว)
- **C3.3-M14** กฎ PAID 10% (ไม่มีเงื่อนไข) + กฎที่สอง `teamId` ที่เจ้าของดีลไม่อยู่ · ดีล 10,000 เจ้าของ A · งวด 10,000 → onPaid ⇒ แถว A 1,000 · เปลี่ยน `ownerUserId` เป็น B → `runPayrollSync(now, {tenantIds})` ×2 + `onPaid` ซ้ำ ⇒ **ยังแถวเดียว (A, 1,000)** · ไม่มีแถวของ B · Σ = 1,000 · `OpsAlertState` ที่ `source` ขึ้นต้น `crm.commission.nomatch:` ลงท้าย `:<ruleId กฎทีม>` = 1 (ลบใน finally)
- **C3.3-S2.5** กฎ WON · pipeline มีขั้น WON สองขั้น · moveDeal → WON1 (แถว 1 แถว) · moveDeal → WON2 + onWon ซ้ำ ⇒ `JSON(rows)` **byte-identical** (id · createdAt · amount · status) · จำนวน OutboxEvent `crm.commission.*` ของระบบไม่เพิ่ม · ไม่มี audit `crm.commission.remove`
- **C3.3-M15** approvalRequired = true + policy `crm.commission` · กฎ R1 (สร้างก่อน) · งวด PAYMENT 1,000 (countedAt = t0) → afterPaymentCounted ⇒ PENDING 100 มีคำขอ · สร้างกฎ LATE (createdAt > t0) · ปลุก (satang 500 · countedAt ใหม่ > LATE.createdAt) → afterPaymentCounted ⇒ แถวเดียว R1 = 50 PENDING · **LATE 0 แถว** · คำขอเดิม CANCELLED
- **C3.3-M16** DOC_SETTLE 300 → afterPaymentCounted (30) · ปลุก (satang 100 + countedAt ใหม่) → afterPaymentCounted (−30 + 10) · แล้วยิง **พร้อมกัน** `reverse(ctx, {refId: <payId>})` + `afterPaymentsReversed(ctx, {dealId})` (ตัวต่อที่ช้า/เห็นสถานะเก่า) ⇒ แถวทั้งหมด byte-identical กับก่อนยิง · แถว `refId = <payId>#c<countedAt ms ปัจจุบัน>` ไม่มีแถวถอนคืน · Σ = 10
- ข้อที่ขัดกับโค้ดรอบ 6: **ไม่มี** — r6 รอบแรก M10 (S-e) แดงเพราะรุ่นแรกติดธงเมื่อ T = 0 ⇒ แก้เป็น "ติดธงเฉพาะฐานนิ่ง" แล้ว 78/78 (`r6-qc-crm-c3.3-2.log`) · ข้อสอบยังไม่มี M14/S2.5/M15/M16

- **มติ S0.6:** `updateRule` ของกฎที่มีแถวแล้ว ปฏิเสธการเปลี่ยน pipeline/ทีม/สินค้า (VALIDATION ข้อความเดียวกับฐาน/อัตรา) · ชื่อ/เปิด-ปิด/ลำดับแก้ได้ · ล้างธง nomatch เฉพาะเมื่อขอบเขต/ฐานเปลี่ยน (= กฎยังไม่มีแถว) · เปิด/ปิดไม่ล้างธง · qc-crm-c3.3 84/84 (`r6-final.log`)

### ผลรอบ r6 (log `.qc-shots/c33/r6-*.log` · สรุป `r6-summary.log`)
qc-crm-c3.3 78/78 (`-2`) · qc-payroll 19/19 · qc-hr-payadjust 27/27 (`-2` บนโค้ดสุดท้าย) · qc-approval 16/16 · -edit 12/12 · -wiring 7/7 · qc-crm-c2.7 62/63 (S0.4 = ORACLE-EDIT ของ main เดิม) ·
qc-crm-c1.5 103/103 · qc-crm-c0.2 27/27 · fitness 32/32 ×2 · typecheck สะอาด (ครั้งเดียว · หลังแก้ครั้งสุดท้าย) · probe `r6-probe-2.log` B-1/B-2/S-1/S-2a/S-2b = PASS · ธง/แถวค้าง 0


## 7h. รีวิวสุดท้ายของรอบ 6 (5 SHOULD-FIX + notes) — ทำครบ
| ข้อ | ทำอะไร (`commissions.ts`) | หลักฐาน (`r7-probe.log`) |
|---|---|---|
| 1 | `revisitCounted` คิดใหม่ **ต่อกฎ**: งวด COUNTED ที่มีกฎ PAID เปิดอยู่อย่างน้อยหนึ่งกฎที่ยังไม่มีแถวของ (กุญแจร่าง, กฎ) · ไม่ดูธง · เรียกจาก `afterPaymentsReversed` และท้าย `afterPaymentCounted` เมื่อ `reverse()` ถอน/ลบอะไรออกไป (การปลุกที่ยอดหด) | (a) R1 1,000 (P1) · R2 200 (P2) · R1 ธง 1 · ยกเลิก P1 ⇒ R1 −1,000 แล้ว R1 200 ของ P2 (Σ R1 200 · Σ R2 200) · (b) 970 + 30 + X 0 (ธง) → ปลุก settle 100 ⇒ −30 + 10 + X 20 = **1,000** |
| 2 | ธง "สินค้าไม่ตรง" เฉพาะดีลที่มีรายการสินค้า ≥ 1 | มัดจำ 30,000 (ไม่มีรายการ) ⇒ ธง 0 · เพิ่มรายการ X · P2 70,000 + งานรายนาที ⇒ 3,500 + 1,500 = **5,000** |
| 3 | คิว (1ก) ใหม่ก่อน (`countedAt DESC, id DESC`) · หน้าแรกจากบนสุดทุกรอบ · หน้าที่เหลือเดินต่อจาก cursor ต่อระบบใน `OpsAlertState` `crm.commission.q1a.cursor:<systemId>` (สุดทาง = ลบ cursor วนใหม่ · ms ซ้ำข้ามหน้า = หยิบซ้ำได้ ไม่ขยับ = ถอย 1 ms) | โค้ด |
| 4 | `applyApprovalDecision`: แจ้งเจ้าของร้านไม่สำเร็จ ⇒ **โยน** (approval-effects ส่ง event ใหม่ตาม backoff) · (3ข) เดินทีละหน้าด้วย cursor id แล้วคัดผ่าน `approval.requestStatuses` เฉพาะคำขอที่ตัดสินแล้ว (APPROVED/REJECTED) — คำขอที่รอคนไม่ถูกใช้และไม่ทำให้หน้าเต็มจนแถวอื่นอด (ไม่มี SQL ข้ามไปตารางของโมดูล approval) | โค้ด |
| 5 | เปิดกฎกลับ (ปิด → เปิด) และเปลี่ยนขอบเขต/ฐานของกฎที่ยังไม่มีแถว ⇒ `createdAt = ตอนนี้` — **กฎที่เปิดกลับคิดเฉพาะเงินที่เข้ามาหลังจากนั้น** (เงินที่นับไว้ระหว่างกฎปิดไม่ได้คอมมิชชันย้อนหลัง) · UI ใต้ช่อง "เปิดใช้กฎนี้" แสดงข้อความนี้ | ปิดกฎ → เงิน Q1 → เปิดกฎ → งานรายนาที + revisit ⇒ 0 แถว · เงิน Q2 หลังเปิด ⇒ 500 · แก้ทีมของกฎที่ไม่มีแถว ⇒ createdAt ใหม่ |
| notes | (3) ไม่หยิบแถวที่ note = "เคยถูกปฏิเสธ…" และแจ้งเจ้าของร้านแล้ว · (1ก) ข้ามตัวกรองมูลค่าขั้นต่ำเมื่อดีลมีแถวของกฎนั้นแล้ว (T แช่) · B-2 `COALESCE(f."kind"::text,'') <> 'WON'` (ขั้นที่ถูกลบ) · ข้อความ "…เปลี่ยนขอบเขต/ฐานไม่ได้ — สร้างกฎใหม่แทน" · `updateRule` ตรวจ+เขียนในธุรกรรมเดียว (`FOR UPDATE` แถวกฎ · นับแถวใต้ล็อก · updatedAt เปลี่ยน = CONFLICT) และ onPaid/onWon ล็อกกฎ `FOR SHARE` ใต้ธุรกรรมที่เขียนแถว (ข้ามกฎที่ถูกแก้/ปิดระหว่างนั้น) · หัวไฟล์ `approval/index.ts` อัปเดต | โค้ด |
| M15 (r7) | revisit ท้ายการปลุกคิดงวดที่เพิ่งปลุกใหม่โดยไม่มีหลักฐานเวลานับแรก (แถว PENDING ถูกลบไปแล้ว) ⇒ กฎ LATE ได้เครดิตย้อนหลัง · แก้: เก็บ "เวลานับครั้งแรก" ถาวรต่องวด `OpsAlertState` `crm.commission.first:<paymentId>` (ค่าน้อยสุด · เขียนใน onPaid ก่อนคิด · อ่านใต้ล็อกเข้า firstMs) — ครอบทาง (2)/revisit/งานรายนาทีด้วย | qc-crm-c3.3 r7-2 |


### ORACLE-EDIT r7 (ผู้เขียนข้อสอบ) — ล้างแถวแพลตฟอร์มใหม่สองชนิดใน finally
`scripts/qc-crm-c3.3.mts:2222` `flagSql` ต่อท้ายเงื่อนไข (ก่อน sweep ตาราง tenant):
```
  OR ("source" LIKE 'crm.commission.first:%' AND split_part("source", ':', 3) IN (SELECT "id" FROM "CrmDealPayment" WHERE "tenantId" IN (${inList})))
  OR ("source" LIKE 'crm.commission.q1a.cursor:%' AND split_part("source", ':', 3) IN (SELECT "id" FROM "AppSystem" WHERE "tenantId" IN (${inList})))
```
(`WHERE "source" LIKE 'crm.commission.nomatch:%' AND (…)` ต้องครอบเป็น `WHERE (("source" LIKE 'crm.commission.nomatch:%' AND (…)) OR … )`) · CLEAN นับ `crm.commission.first:<ourPays>` เพิ่มได้

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ภาพ D7 · build D6 | builder ห้าม next build | ผู้คุมงาน |
| N1 productIds ของกฎไม่ถูกตรวจกับสินค้าของร้าน | ต้องอ่านสินค้าผ่าน facade inventory (ยังไม่มีตัวอ่านแบบกลุ่ม) — วันนี้ id ที่ไม่มีจริง = กฎไม่ตรงดีลไหนเลย (ไม่จ่ายเกิน) | C3.8 |
| N3 HR `reverseRun` (กลับรายการรอบที่จ่ายแล้ว) ไม่ย้อนสถานะ PAID ของคอมมิชชัน | ต้องมี event ใหม่ของ HR (`hr.payroll.reversed`) — นอกขอบเขต 4 event ของใบนี้ | C3.8 / C6 |
| N4 HR `cancelAdjustment` (ลบรายการด้วยมือ) ทิ้งลิงก์ `hrPayAdjustmentId` ค้าง | ฝั่งคอมมิชชันถือว่ารายการหาย = ปิดเรื่องแถวถอนคืน (handoffReversal) แต่ต้นทางค้าง REQUESTED · ควรให้ HR แจ้ง/ห้ามลบรายการที่มี crmCommissionId | C3.8 |
| N7 เครดิตเจ้าของ "ณ เวลาที่ประมวลผล" (ไม่ใช่ ณ เวลาจ่ายจริง) เมื่องานรายนาทีเก็บงวดที่ค้าง | ไม่มีประวัติเจ้าของดีล · ช่องว่างเฉพาะกรณีโพรเซสตายหลัง commit แล้วเจ้าของถูกเปลี่ยนก่อนงานรายนาที | backlog |
| N8 · N12 (ตามรายการของผู้รีวิว) | บันทึกไว้ตามมติ — รายละเอียดอยู่ในรายงานรีวิวของผู้คุมงาน | backlog |
| HR `createPayrollRun` ไม่อยู่ในธุรกรรมเดียว (อ่านรายการ APPROVED → สร้างรอบ → ผูก runId เป็นคนละคำสั่ง) | ตัวกวาดของ C3.3 จึงไม่แตะรายการ APPROVED เลย (S-c) · ควรห่อเป็น tx + ล็อกงวดในโมดูล HR | HR backlog |
| `strandedCommissionAdjustments` ไม่มี cursor (หยิบ 50 แรกต่อร้านต่อรอบ) | ร้านที่มีรายการค้างเกิน 50 ใช้หลายรอบ (รอบละ 5 นาที) | backlog |
| แถวที่แจ้งเจ้าของร้านไว้ก่อนร้านปิด approvalRequired | ปิดแล้ว: คิว (3) ของงานรายนาทีหยิบแถวเหล่านี้เมื่อ approvalRequired = false (advance ⇒ อนุมัติทันที) | — |
| รอบ 5 N1: ปัดลงต่องวด ⇒ Σ อาจขาดคอมมิชชันเต็ม ≤ n−1 สตางค์ (n = จำนวนงวดที่อัตราส่วน VAT หารไม่ลง) | ยอมรับ (บันทึก) | — |
| รอบ 5 N2: ดีลไม่มีมูลค่า — T โตได้อย่างเดียว ⇒ FIXED/TIERED จ่ายไม่ตรงเมื่อใบแจ้งหนี้ถูกแทนด้วยใบที่ยอดน้อยกว่า | คำถามเจ้าของ **Q12** (ร่าง: "ดีลที่ไม่ได้ตั้งมูลค่า ถ้าเปลี่ยนใบแจ้งหนี้เป็นยอดที่น้อยลง ฐานคอมมิชชันจะไม่ลดตาม — ต้องการให้ลดตามไหม") | owner |
| สองการปลุกใน ms เดียวกันได้กุญแจร่างเดียวกัน | เป็นไปไม่ได้ในทางปฏิบัติ (C2.7 ตั้ง countedAt ใหม่ทุกครั้ง) | — |
| รอบ 6: ธง nomatch + cursor (1ก) + เวลานับแรกต่องวด (`crm.commission.first:*` — หนึ่งแถวต่องวดที่มีกฎ PAID) อยู่ใน `OpsAlertState` (ตารางระดับแพลตฟอร์ม ไม่มี tenantId · ค้นด้วย `startsWith/endsWith` บน `source`) | โตตามจำนวน (งวด × กฎที่ไม่ตรง) ไม่มีตัวกวาด · ตัวลบร้านไม่ลบให้ · `NOT EXISTS` ใน (1ก) ใช้ unique index ของ source ได้ แต่ `endsWith` ตอนล้างธงของกฎ = สแกน · ควรมีตาราง/ดัชนีของตัวเอง (tenantId, ruleId, paymentKey) + ตัวกวาด | **C6.1** (ผู้สมัคร) |
| รอบ 6: งวดบนดีลที่ฐานยังไม่นิ่ง (ไม่มีมูลค่า หรือยังไม่มีแถวของกฎ) ที่ได้ส่วนแบ่ง 0 ไม่ติดธง | คิว (1ก) หยิบซ้ำทุกรอบ (ไม่มีกรอบ 3 วันตามมติ S-e) · จำกัดด้วยหน้า 10×100 ต่อระบบ · ถูกต้องเรื่องเงิน (skip ต่อกฎ) เสียแค่งาน | backlog |
| รอบ 6: S1 revisit ช้า/อดได้ | ท้าย `afterPaymentsReversed` หยิบงวด COUNTED ที่ไม่มีแถวร่างปัจจุบัน 50 งวดต่อครั้ง · งานรายนาที (2) กวาดดีลที่มีการถอนใน 7 วัน 50 ดีลต่อระบบต่อรอบ (รอบละ 5 นาที) ⇒ ดีลที่มีงวดเกิน 50 หรือร้านที่ถอนเกิน 50 ดีลใน 7 วันใช้หลายรอบ · พ้น 7 วันแล้วโพรเซสตาย = ไม่มีใครคิดให้อีก (ต้องปลุก/แก้กฎ) | backlog |
| N9 ข้อความแจ้งเตือนของ escalation | ปิดแล้วด้วยเทมเพลต `commission.pending` (S6) | — |

## 9. คืนสภาพ QC
ข้อสอบ + probe ใช้ tenant ทิ้ง (`qc-c33-*` · `qc-c33probe-*`) ลบใน finally — CLEAN เขียว · probe: rows left=0 · trigger ของ probe ถูก DROP (นับ pg_trigger = 0)
