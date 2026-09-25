# WO C2.7 — สะพานบัญชี / POS (เงินเข้าดีล)

> RUN "CRM v2" · builder `/root/projects/shark-crm-c23` (QC3) · รวมทรีหลัก `session/crm` · builder รอบ 1: 24 ก.ย. 12:20–15:30 UTC (opus 2 ตัว — ตัวแรกถูกโควตาตัดขณะแก้ unique-violation ใน tx) · ผู้ตรวจของผู้คุมงาน 15:40 · **รอบ 2: 21:25–22:35 (opus)** · ผู้คุมงาน **Fable 5.1** · รับงาน 25 ก.ย. 2569
> สัญญา: CRM-RUN §2 C2.7 · brief C2.7 (addendum 1–8 · ruling 24 ก.ย. · ruling round 2) · มติ C29 (ไม่มี `PosSale.dealId`) · R-C.1 (ไม่มี migration) · ไม่มี mockup (ปุ่มบนจอ POS/เอกสาร)
> ข้อสอบ: `scripts/qc-crm-c2.7.mts` (**63 ข้อ** = 55 + ORACLE-EDIT 8 ข้อ S9 · S0 6 · S1–S8 28 · S9 8 · U 4 · X1 3 · X3 4 · X4 4 · X6 1 · X8 2 · X9 2 · CLEAN) · แก้หลัง commit: **ใช่ (fixture 3 จุด: company partyId · DEPOSIT_RECEIPT · pump ก่อน trigger lab · S9)**

## 1. ไฟล์ที่แตะ (21 ไฟล์ · +1,805/−15)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `crm/payments.ts` (~780) · `payments-shared.ts` | ใหม่ | `recordDocPayment` (ไล่ chain `invoiceDocId/quotationDocId/sourceDocId` ≤6 hop · allow-list INVOICE/DEPOSIT_RECEIPT · BILLING_NOTE = WARN ไม่ attribute · หลายดีล = เก่าสุด + WARN) · `flagRowInTx` = `createMany skipDuplicates` (ON CONFLICT DO NOTHING ใน tx · ไม่ catch P2002) · `linkSaleToDeal` (ล็อกระดับบิล · นับบิลที่จ่ายแล้วใน tx · **ปฏิเสธถ้าบิลผูกดีลอื่นแล้ว** · gift card ปฏิเสธ · ต้อง v2+bridgeOpen) · `countPosSale`/`reverseRow` วนทุกแถวของ `(refType, refId)` · `flagDocumentVoided` ถอนเฉพาะแถวของเอกสารนั้น + tag `DEAL_VOIDED_TAG` + AUTO activity · `onInvoiceFullyPaid` → แถว `DOC_SETTLE#<docId>` ปิดส่วนต่าง WHT ให้ = `grandTotal` แล้ว auto-WON · **ประตูหยุดนับได้ ไม่หยุดถอน** (`canCount` เฉพาะทางนับ) · `emitMoneyUpdate` |
| `crm-bridges/money.ts` (+`core.ts` คอมเมนต์) | ใหม่ | handler 7 ตัว อ่านประตูเองในตัว (`openCrmSystems` ทางนับ · `crmGates` ไม่กรอง `bridgeOpen` ทางถอน — ทั้ง c1.11-S6.10 และ B2 จริงพร้อมกัน) |
| `crm/deals.ts` | แก้ | `createQuoteFromDeal`/issueQuotation/issueInvoice · quotation responded → ขั้น + AUTO activity + แจ้งเจ้าของ · `setWonValueInTx` (gate ของ C1.5) · `autoInvoiceOnWonFromBridge`/`autoWinOnPaidFromBridge` (audit SYSTEM) · `moveCore` อ่าน countedWonValue **ในล็อก** เฉพาะ v2 · `Deal360.paidSatang` + KPI "เงินที่รับแล้ว" (ซ่อนเมื่อ 0) |
| `pos/register.ts` (`posOpenDeals` ต้อง `crm.deal.update` · `posLinkSaleToDeal`) · `pos/register-ui.tsx` (`pos-deal-select` · `pos-deal-hint`) · `actions/pos.ts` (ห่อ link — CRM ล้มบิลไม่ล้ม) | แก้ | `pos/service.ts` ไม่แตะ (S7 sha) |
| `account/index.ts` (+`listDocPayments` อ่านอย่างเดียว) · `account/docs/[docType]/[docId]/page.tsx` + `crm/doc-block.tsx` + `components/crm/doc/DocDealLink.tsx` (`acc-doc-crm-deal`) | แก้/ใหม่ | ฟังก์ชันธุรกรรมบัญชีไม่แตะ |
| `outbox-consumers.ts` (CRM ต่อท้าย `pos.sale.paid/voided` · account events) · `crm-bridges/index.ts` · `crm/index.ts` (`payments`) · `scripts/fitness.mts` (edge `pos→crm` + `CRM_HOSTED_CONTROLS` ให้ทะเบียนรับ testid ที่อยู่ในไฟล์ POS 2 ตัว) · `crm-ui-inventory.json` (+3) · `visual-crm.mts` (spec "2.7") | แก้ | |

## 2. migration / seed / backfill — ไม่มี (R-C.1 · C29) · refType ที่ 3 `DOC_SETTLE` (นอก R-C.4 · รับ)

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด · เคยแดง | ✅ | 14/15 FATAL (fixture) → 63/63 ×2 |
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ✅ | `qc-crm-c2.7` **63/63** |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ✅ | §5 — 25 ชุดเขียว |
| D5 | typecheck · fitness ×2 | ✅ | typecheck exit 0 · fitness 32/32 · noenv 32/32 |
| D6 | build | ✅ | BUILD+serve exit 0 |
| D7 | ภาพ + PARITY | ✅ | §6 (Fable ดูเอง) |
| D8 | testid + ทะเบียน | ✅ | +3 แถว (`CRM_HOSTED_CONTROLS`) · F14.1/F14.2 |
| D9 | ผู้ตรวจอิสระ | ✅ | ผู้ตรวจของผู้คุมงาน (opus อ่านอย่างเดียว): (a)–(k) ยืนยัน · **BLOCKER 2 ด้านเงิน** + SHOULD-FIX 5 + NOTE 12 · ชี้ว่า 55/55 มาจากสำเนา → รอบ 2 แก้ครบ + ไฟล์จริง 63/63 ×2 (`shark-crm-c23/.qc-shots/c27-r2/`) |
| D10 | เอกสาร/ทะเบียน | ✅ | ไม่มี event/op ใหม่ · edge `pos→crm` มีเหตุผล |
| D11 | wo-notes + คืนสภาพ | ✅ | `qc-member-m1.9` 26/26 |
| D12 | push → deploy | ✅ | เจ้าของ push `session/crm` + `main` → `0d638f15` (25 ก.ย. ~05:56 UTC · ไม่มี migration ในช่วง 965c0bbd..0d638f15) · deploy ใหม่ขึ้นจริง 06:01:06 UTC (`dpl_FFKFz…` → `dpl_8aHf55…` ใน header `Link` ของ `/`) · smoke `/` `/login` `/api/health` 200 · health `db:true outboxPending:0` · prod `uiVersion` 1 ทุกร้าน (ไม่เปิด v2 ก่อน C6.1) |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 | ใช้ | `X1.1–X1.3` (เอกสาร/บิลข้ามร้าน/ระบบ · `dealForDoc` scoped) |
| X2 | N-A | REST → C2.11 |
| X3 | ใช้ | `X3.1–X3.4` + `S9.5` (จ่ายพร้อมกัน · link∥consumer 10 ทาง · moveCore∥payment) |
| X4 | ใช้ | `X4.1–X4.4` (replay/parallel = นับครั้งเดียว · void ครั้งเดียว) |
| X5 | N-A | ไม่มีงานตามเวลา |
| X6 | ใช้ | `X6.1` (จำนวนเงินเพดาน/ลบ) |
| X7 | N-A | ไม่มี endpoint สาธารณะ |
| X8 | ใช้ | `X8.1–X8.2` (payload/WARN id ล้วน) |
| X9 | ใช้ | `X9.1–X9.2` (link/auto audit) |
| X10 | N-A | ไม่มี |
| ร้าน uiVersion 1 | ใช้ | `U.1–U.4` (สะพานเงินข้าม v1 · ไม่ catch-up = Q8) · `S9.2` (ถอนเงินไม่ถูกกั้น) |

## 5. ผลข้อสอบ
**unit `crm-c26c27-verify` (QC1 seed ใหม่ · 24 ก.ย. 22:40–23:35 UTC · ALLDONE):**
- `migrate diff (must be empty)`: exit=0 · `-`
- `reseed member`: exit=0 · `-`
- `qc-member-m1.1`: exit=1 · `{"total":28,"passed":27,"findings":[{"id":"M1.1-S4.2","sev":"CRITICAL"}]}`
- `seed crm #1`: exit=0 · `-`
- `seed crm #2`: exit=0 · `-`
- `DRAIN`: exit=0 · `{"total":4,"passed":4,"findings":[]}`
- `gen-crm-api-docs (early)`: exit=0 · `-`
- `qc-crm-c2.6`: exit=0 · `{"total":87,"passed":87,"findings":[]}`
- `qc-crm-c2.7`: exit=0 · `{"total":63,"passed":63,"findings":[]}`
- `qc-crm-c2.1`: exit=0 · `{"total":84,"passed":84,"findings":[]}`
- `qc-crm-c2.2`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-c2.3`: exit=0 · `{"total":80,"passed":80,"findings":[]}`
- `qc-crm-c2.4`: exit=0 · `{"total":91,"passed":91,"findings":[]}`
- `qc-crm-c2.5`: exit=0 · `{"total":105,"passed":105,"findings":[]}`
- `qc-crm-c0.5`: exit=0 · `{"total":50,"passed":50,"findings":[],"unproven":[],"info":{"leaseStyle":"row le`
- `qc-crm-c1.2b`: exit=0 · `{"total":93,"passed":93,"findings":[]}`
- `qc-crm-c1.4`: exit=0 · `{"total":110,"passed":110,"findings":[]}`
- `qc-crm-c1.5`: exit=0 · `{"total":103,"passed":103,"findings":[]}`
- `qc-crm-c1.6`: exit=0 · `{"total":79,"passed":79,"findings":[],"skippedChecks":[]}`
- `qc-crm-c1.8`: exit=0 · `{"total":81,"passed":81,"findings":[]}`
- `qc-crm-c1.11`: exit=0 · `{"total":66,"passed":66,"findings":[]}`
- `qc-crm-c2.0`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-v1`: exit=0 · `{"total":17,"passed":17,"findings":[]}`
- `qc-crm-c0.2`: exit=0 · `{"total":27,"passed":27,"findings":[]}`
- `qc-form`: exit=0 · `{"total":10,"passed":10,"findings":[]}`
- `qc-forms-notify`: exit=0 · `-`
- `qc-public-links`: exit=0 · `{"total":11,"passed":11,"findings":[]}`
- `qc-pages`: exit=0 · `{"total":31,"passed":31,"findings":[]}`
- `qc-pos-register`: exit=0 · `{"total":42,"passed":42,"findings":[]}`
- `qc-pos-account`: exit=0 · `{"total":16,"passed":16,"findings":[]}`
- `qc-acc-v2-payments`: exit=0 · `-`
- `qc-account-api-write-payments`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `qc-member-fix-s3`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `qc-chat-core-v2`: exit=0 · `{"total":47,"passed":47,"findings":[]}`
- `qc-nav-functions`: exit=0 · `-`
- `probe-uiversion-gate (no env)`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `gen-crm-api-docs`: exit=0 · `-`
- `typecheck`: exit=0 · `-`
- `fitness`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `fitness-noenv`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `BUILD+serve`: exit=0 · `-`
- `shots 2.6`: exit=0 · `{"wo":"2.6","user":"owner","shots":[".qc-shots/crm/2.6/crm-tracking-owner-deskto`
- `shots 2.7`: exit=0 · `{"wo":"2.7","user":"owner","shots":[".qc-shots/crm/2.7/pos-register-deal-select-`
- `qc-crm-c2.6-web (headless)`: exit=1 · `{"total":21,"passed":15,"findings":[{"id":"C2.6W-S1.1","sev":"CRITICAL"},{"id":"`
- `serve stop`: exit=0 · `-`
- `qc-member-m1.9`: exit=0 · `{"total":26,"passed":26,"findings":[]}`

สรุป: `qc-crm-c2.6` **87/87** · `qc-crm-c2.7` **63/63** · ถอยหลัง 25 ชุดเขียวทั้งหมด · `qc-member-m1.1` 27/28 (S4.2 = fitness F13.11 docs stale ตอนต้นสคริปต์ก่อน regen — fitness ปลายทาง 32/32 · ลำดับสคริปต์ ไม่ใช่โค้ด) · `qc-crm-c2.6-web` รอบแรก 15/21+FATAL = บั๊กข้อสอบ 4 เรื่อง (`__name` esbuild · UA HeadlessChrome เป็น bot · X4.1 ขัดมติ ticket ครั้งเดียว · console ของ OOPIF) → ORACLE-EDIT (+S1.3 ตัวคุมบวก bot · W9) → รอบสอง (unit `crm-c26-web2` 23:58 UTC · ผู้คุมงานรันเอง): **`qc-crm-c2.6-web` 35/35** · m1.9 26/26

## 6. ภาพ (D7)
spec "2.7" (AccountSystemLink + ดีล 3 บรรทัด + ใบเสนอราคา DRAFT + บิล POS ผูกผ่าน facade · คืนสภาพ) · owner · ไม่มี mockup เฉพาะ — ตรวจปุ่ม/ป้ายจริง
| หน้า | ภาพจริง | จอ | overflow | จุดที่เห็นเอง |
|---|---|---|---|---|
| POS หน้าขาย: เลือกสมาชิก → ช่อง "ดีล (นับบิลนี้เป็นเงินที่รับของดีล)" + คำอธิบาย · ไม่มีสมาชิก = ไม่มีช่อง | `.qc-shots/crm/2.7/pos-register-deal-select-owner-*` · `pos-register-no-deal-*` | 1440/390 | ไม่มี | ตรงสัญญา S5.4 |
| ดีล 360: KPI "เงินที่รับแล้ว ฿1,200" ข้างมูลค่าดีล · เอกสารบัญชี · รายการสินค้า | `crm-deal-money-owner-*` | 1440/390 | ไม่มี | ซ่อนเมื่อ 0 |
| หน้าเอกสารบัญชี: บล็อกดีลที่ผูก (`acc-doc-crm-deal`) | `acc-doc-crm-deal-owner-*` | 1440/390 | ไม่มี | — |
- `PARITY: ผ่าน` (Fable 25 ก.ย.)

## 7. ข้อแย้ง / มติ
- addendum 1–8 CONFIRMED · ORACLE-EDIT fixture ×3 (company `partyId` · RECEIPT=PAID จ่ายไม่ได้ → DEPOSIT_RECEIPT · pump ก่อน trigger lab) · **ruling round 2**: B1 บิลเดียว 2 ดีล · **B2 "ประตูหยุดนับได้ ห้ามหยุดถอน"** · SF-1 void เฉพาะเอกสาร · SF-2 WHT `DOC_SETTLE` · SF-3 moveCore ในล็อก · SF-4/5 · N1/N3/N4 → ORACLE-EDIT S9.1–S9.8 (55→63)
- builder พบ/แก้ regression จริง: c1.5-S0.8 (`wonValueSatang` เขียนนอก deals.ts) · c1.11-S6.10 ×2 (handler ต้องอ่านประตูเอง — helper `allCrmSystems` ถูกถอด) · typecheck (`account.listDocPayments` ไม่มีบน facade) · fitness F14.x (testid ในไฟล์ POS → `CRM_HOSTED_CONTROLS`)
- กติกาใหม่จากใบนี้: **builder ห้ามรันสำเนาข้อสอบที่แก้เอง** — ขอ ORACLE-EDIT แล้วรอ

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| Q8 catch-up เงินของร้านที่สลับ v1→v2 | รอเจ้าของ | หลัง C2.7 ถ้าเจ้าของสั่ง |
| `BILLING_NOTE` (กระจายหลายดีล) ไม่ attribute | ต้องแยกตามใบแจ้งหนี้ลูก | C3 |
| แจ้งเตือน "ใบแจ้งหนี้ของดีลชำระแล้ว / เอกสารถูกยกเลิก → ผู้ดูแล" (blueprint §7.4) | ค่าเริ่มต้นแจ้งเตือนเป็นของ C2.10 | C2.10 |
| REST ops ของเงินดีล (จะเปิด B1 ให้ผู้ใช้ API) | C2.11 ต้องใช้ guard เดียวกัน | C2.11 |
| ต้นทุน resolve chain ต่อ `account.payment.recorded` ของร้าน v2 (≤6 hop ×2 query/ระบบ) · `dealForDoc` ทุกครั้งที่เปิดหน้าเอกสาร | ขอบเขต tenant · bounded | C5 |
| CRM อ่าน `PosSale` ตรงผ่าน prisma (ไม่มีกฎห้าม) | บันทึกทิศทาง | — |

## 9. คืนสภาพ QC — `qc-c27-*` · CLEAN (trigger ถอน) · `qc-member-m1.9` 26/26
