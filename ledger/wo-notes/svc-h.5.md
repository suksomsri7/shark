# WO h.5 — folio · ลงห้องจาก POS · เช็กเอาต์ POS ใบเดียว · เงินประกันห้อง · ภาษีบนบิลจริง (RUN SVC)

> RUN "SVC" (โรงแรม V2) · worktree `/root/projects/shark-svc-l2` · branch `wip/svc-h5` (ฐาน 6715ea241) → merge เข้า `session/svc` · 7 พ.ย. 2569 · ผู้คุม: Fable · builder: Opus
> สัญญา: ใบสั่ง `ledger/svc-briefs/svc-brief-h.5.md` (§0–§9) · ภาพ `ledger/design-dorm/09-hotel-checkin-folio.png` ครึ่งขวา
> ข้อสอบใบ: `scripts/qc-svc-h.5.mts` (92 ข้อ · **ไม่ได้แก้** — ข้อแย้ง 6 เรื่องใน §7 รอ ORACLE-EDIT)
> ระดับตรวจ: ☑ **เข้ม** (เงิน/บัญชี/VAT/มัดจำ/ประกัน · ข้อมูลข้ามร้าน — reviewer แยก 2 ตัว)
> ฐาน: qc-svc เลน l2 (`ep-weathered-mode`) ผ่าน `scripts/qc-svc.sh` · commit `55fc7458d` (pre-commit ข้าม `--no-verify`)

## 1. ไฟล์ที่แตะ (ทั้งหมดอยู่ใน §1 ของใบ)
| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `src/lib/modules/hotel/folio.ts` | ใหม่ | ด่าน (การจอง→หน่วย HOTEL→เข้าหน่วย→สิทธิ์) · `getFolio` · `postFolioItem` · `voidFolioItem` · `postRoomNights` · `folioForGroup` · `postDeposit` · `recomputeTx` (balance = Σ · TAX/SC ปรับในที่) |
| `src/lib/modules/hotel/checkout.ts` | ใหม่ | `prepareCheckout` · `settleAndCheckOut` (tx A → createSale นอก tx → ประกัน → tx B → คืนมัดจำเกิน · กันรายได้ซ้ำ) · `takeSecurityDeposit` · `refundSecurityDeposit` · `forfeitSecurityDeposit` · `afterRefundStay` |
| `src/lib/modules/hotel/room-charge.ts` | ใหม่ | `chargeToRoom` · `onPosSalePaidRoomCharge` · `onPosSaleVoidedRoomCharge` · `listUnmatchedRoomCharges` · `countUnmatchedRoomCharges` · `attachRoomCharge` |
| `src/lib/modules/hotel/service.ts` | แก้เฉพาะ `checkOut` (→ settleAndCheckOut `legacyCash`) · `refundStay` (+ `afterRefundStay`) · + import 1 บรรทัด | |
| `src/lib/modules/hotel/booking.ts` | 1 จุด + import | `takeBookingDeposit` → `postDeposit` (มติ 6) |
| `src/lib/modules/hotel/index.ts` · `actions.ts` | เพิ่ม (บล็อก `SVC H.5 ▸ … ◂`) | facade 13 ฟังก์ชัน · 8 action (`assertHotelCan` + ด่าน HOTEL) |
| `src/lib/modules/account/index.ts` | ท้ายไฟล์เท่านั้น | `reverseRoomChargePosting` · `restoreRoomChargePosting` (สายรายการต้นฉบับ→กลับ→คืน · ห่อ `reverseFor`/`reverseEntry`) |
| `src/lib/outbox-consumers.ts` | เพิ่มอย่างเดียว | `pos.sale.paid` ห่อ compose + try/catch (ลงห้อง) · `pos.sale.voided` bothMain (กลับ POS_CHARGE) · 8 event ใหม่ |
| `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` | เพิ่ม | ป้ายไทย 8 event (webhook ผ่าน spread · คอมเมนต์เท่านั้น) |
| `src/lib/core/settings/defs/rooms.ts` | เพิ่มคีย์ | `rooms.hotel.checkout.allowLegacyCash` (false) · `rooms.hotel.folio.manualItemMaxSatang` (5,000,000) |
| `src/lib/core/permissions.ts` | ถอด `hotel.folio.post/void` ออกจาก planned | |
| `src/components/hotel/{FolioPanel,FolioItemRow,PostItemDialog,VoidItemDialog,CheckoutDialog,SplitPayEditor,SecurityDepositCard,UnmatchedChargesList}.tsx` + `folio-shared.ts` | ใหม่ | จอ §4 |
| `src/app/app/u/[unitSlug]/hotel/reservations/[id]/page.tsx` | แก้ | ฝัง FolioPanel (`?tab=money` ขึ้นก่อน · `?checkout=1` เปิดไดอะล็อก) |
| `src/app/app/u/[unitSlug]/hotel/folio/unmatched/page.tsx` · `…/reservations/[id]/folio/print/page.tsx` | ใหม่ | คิว unmatched · หน้าพิมพ์ |
| `scripts/svc-qc-hotel-folio-scene.mts` | ใหม่ | ฉาก §6 (`--clear` · `--backfill`) |
| `docs/sds/modules/hotel.md` | เพิ่ม § | sign convention · เส้นเงิน · กันรายได้ซ้ำ · ประกัน |

## 2. ชุดโมดูลที่แตะ
- โรงแรม · POS (ผู้เรียก createSale/มัดจำ — ไม่แก้ POS) · บัญชี (2 ฟังก์ชันท้าย facade) · ทะเบียน event · ค่าตั้ง
- ไม่มี migration · ไม่แตะ seed/ฟิกซ์เจอร์

## 3. ผลข้อสอบ (builder รัน · ผู้คุมรันซ้ำเอง)
| ชุด | ผล |
|---|---|
| `qc-svc-h.5 --no-regression` (โค้ด = 55fc7458d · ก่อน commit · `/root/svc-runs/h5/builder/run3.txt`) | `{"total":92,"passed":63,"failed":["PC-2","RC-1","RC-2","RC-3","RC-6","ST-1","ST-5","ST-6","ST-7","ST-8","ST-11","ST-13","GL-1","GL-2","GL-3"],"skipped":["V-1","G-1".."G-13"]}` — ทุกแดง = ฐานยังไม่ reseed (PC-2) หรือข้อแย้ง §7 |
| สำเนาข้อสอบแก้ตามข้อเสนอ §7 (นอกทรี `/root/svc-runs/h5/builder/qc-h5-patched.mts` · run3-patched/run4-patched) | run3-patched 76/92 แดง PC-2 + ST-13 (สำเนาแก้ไม่ครบ) · run4-patched (หลัง commit) แดง PC-2 · F-3 (เพราะ commit แล้ว) · GL-5/6 (สำเนาทิ้งแขก DLX01 ของ UH2 ไว้ ⇒ กำกวมจริง) — **ST-1..ST-13 · GL-1..GL-3 · SD · B · N เขียวหมด** |
| `qc-svc-h.3 --no-regression` | `{"total":109,"passed":98,"failed":[]}` |
| qc-hotel-public | 15/15 |
| qc-svc-r0.4 | 45/46 (VIS-2 skip ยอมได้) |
| fitness (ไม่มี env) | 52/53 — F2.1 เส้นเถื่อน `hotel→account` (คำขอ §7 ข้อ 7) |
| qc-hotel-money · qc-hotel-refund · qc-pos-p5.1 · qc-pos-p2.9b · qc-svc-b.0(G-8 qc-pos-p2.4) | แดงตามที่ใบคาด (§2.11): ทางเดิม `checkOut` ได้ `PAY_METHODS_REQUIRED` + ทะเบียนผู้เรียก createSale/หมุดฟังก์ชันเปลี่ยน — รอ ORACLE-EDIT (§7 ข้อ 8) |
| tsc เฉพาะไฟล์ (tsconfig นอกทรี `/root/svc-runs/h5/builder/tsconfig.h5.json` · ทุกไฟล์ของใบ + ฉาก) | 0 error |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | check ids / เหตุผล |
|---|---|---|
| X1 ขอบเขต | ใช้ | B-1 (ร้าน B ⇒ NOT_FOUND ทุกฟังก์ชัน) · RC-6 (ข้ามร้าน/หน่วยหอ) · B-2 mgr2 · SQL ดิบทุกคำสั่งระบุ tenantId |
| X3 พร้อมกัน ≥10 | ใช้ | ST-12 (settle 10 ทาง = บิล 1 · PAYMENT 1 · event 1) — CAS CHECKED_IN→CHECKED_OUT + advisory lock ต่อบิล/ต่อ sale ลงห้อง |
| X4 ส่งซ้ำ | ใช้ | RC-2 (consumer ซ้ำ) · RC-7 (voided ซ้ำ) · GL-3/GL-6 (reverse/restore ซ้ำ) · SD-1/SD-4 · Q-2 |
| X5 งานตามเวลา | N-A | ไม่มีงานตามเวลาในใบนี้ (`postRoomNights` ให้ H.7 เรียก) |
| X6 ข้อมูลเข้าอันตราย | ใช้บางส่วน | FO-3 (เพดาน/ชนิด/ทศนิยม) · ST-3 (แถวจ่าย ≤6 · ชนิดต้องห้าม) · RC-5 (lines ว่าง/ติดลบ) |
| X7 endpoint สาธารณะ | N-A | ไม่มีทางสาธารณะ |
| X8 PDPA | ใช้ | N-2 payload id+สตางค์ · B-3 AuditLog ไม่มีชื่อ/เบอร์ |
| X9 การกระทำอันตราย | ใช้ | void ต้องเหตุผล ≥3 + audit (VD-1/2) · ROOM ที่ปิดวันแล้วต้องผู้จัดการ (RN-3) · ริบประกันต้อง manage + เหตุผล (SD-3) |
| X10 ความลับ | ใช้ | B-3 (DTO ไม่มี token/PII) |

## 5. ภาพ
- ยังไม่ถ่าย (builder ห้าม build) · หน้า: `/hotel/reservations/<id>?tab=money` · `?tab=money&checkout=1` · `/folio/print` · `/hotel/folio/unmatched` — ฉากพิมพ์ `SCENE_IDS {"SVC_VIS_H5_RES_ID": …}`

## 7. ข้อแย้ง oracle (ห้ามแก้เอง — หลักฐานจากโค้ดจริง)
1. **ST-1 / ST-5 (+ ST-6 · ST-7 · GL-1 · GL-2 ตามกัน) — `expectedCharges` หักรายการที่ void ซ้ำสองครั้ง** · `scripts/qc-svc-h.5.mts:543`
   `expectedCharges = Σ liveItems(items) ไม่นับ PAYMENT/DEPOSIT/…` — `liveItems` ตัดแถวเดิมที่ void (voidedAt) **แต่เก็บแถว VOID_REVERSAL (ติดลบ) ไว้** ⇒ ของที่ void ถูกหักสองครั้ง (MAIN: SERVICE 18,000 + MINIBAR 12,000 − ส่วนลด 1,000 = 29,000) · หลักฐาน run3 ST-1: `ได้ [470000,149000,321000] ต้องเป็น [441000,149000,292000]` (ต่างพอดี 29,000) · ถ้าคิดตามข้อสอบ balance หลัง PAYMENT จะไม่เป็น 0 (ขัด ST-5 ข้อท้าย) ·
   **เสนอ ORACLE-EDIT**: เพิ่ม `"VOID_REVERSAL"` ในรายการที่ไม่นับของ `expectedCharges` (สำเนาแก้แล้ว ST-1..GL-2 เขียว)
2. **RC-1 / RC-2 ขัด RC-6 (+ RC-3 · GL-3 ตามกัน) — เลขห้องและรหัสจองชนข้ามหน่วยตั้งแต่ FO-7** · `:420` `:649` `:778` `:792` `:861–886`
   MAIN ได้ห้อง DLX01 ของ UH (best-fit เสมอกัน ⇒ เรียงเลขห้อง) · FO-7 เช็กอินแขก u2 ลง DLX01 ของ UH2 (`:420`) · รหัสจองรันต่อหน่วย `<prefix>-YYMM-NNNN` (booking.ts `nextCodes`) ⇒ MAIN และ u2 ได้ `HR-2611-0001` ทั้งคู่ ⇒ RC-1 (reference DLX01) และ RC-2 (reference = code) **เป็นคำขอเดียวกับ RC-6 ที่ต้องได้ AMBIGUOUS_ROOM ทุกไบต์** — ไม่มีการตัดสินใดผ่านได้ทั้งสองข้อ · builder เลือกทางปลอดภัย (กำกวม ⇒ ไม่ลงห้องใคร · เข้าคิว unmatched ให้คนผูก) ·
   **เสนอ ORACLE-EDIT**: ห้อง UH2 ของ FO-7 ใช้เลขอื่น (เช่น `E01`) + ตั้ง `rooms.hotel.codePrefix` ของ UH2 เป็นอีกค่า · RC-6 สร้างห้อง `DLX01` ใน UH2 + เช็กอินแขกก่อนตรวจกำกวม แล้วเช็กเอาต์/ยกเลิกแขกนั้นท้าย RC-6 (ไม่งั้น GL-5 ที่อาจได้ DLX01 ของ UH จะกำกวมจริง — run4-patched)
3. **ST-8 — `ok(payable > 1)` เป็นไปไม่ได้** · `:1053–1058` · การจอง 1 คืน (W0→W1) มัดจำ FIRST_NIGHT = ราคาคืนนั้น ⇒ payable = 0 เสมอ · **เสนอ**: `checkOut: W(2)`
4. **ST-11 — payable ติดลบตามเลขของข้อสอบเอง** · `:1107–1123` · มัดจำหัวกลุ่ม = 3 × คืนแรก (ข้อสอบ assert เอง `:1114`) แต่เช็กอิน 2 ห้อง 1 คืน + ซักรีด 5,000 ⇒ payable = 5,000 − ราคาคืน < 0 (`payable -144000`) · **เสนอ**: ค่าบริการ ≥ ราคาคืน (เช่น 500,000) · ⚠️ ข้อท้าย "2 folio balance 0" จะไม่จริงเมื่อมัดจำเหลือ (หัวกลุ่มยังถือมัดจำคงเหลือ = ห้องที่ 3 ใช้ต่อ · ใบ §2.6) — ใช้ค่าบริการก้อนใหญ่จะให้มัดจำถูกใช้หมดพอดี
5. **ST-13 — `vatSatang = refVat(grand).vat` ขัดกติกา POS P2.9b R5** · `:1159–1169` · การจองนี้มีมัดจำ (FIRST_NIGHT = ยอดทั้งบิล) ⇒ POS ตั้ง `vatSatang` ของบิล = VAT(ยอด) − VAT ที่ออกตอนรับมัดจำ (`pos/service.ts` `billVat`) = 0 · GL-1 ของข้อสอบเองคาด Cr 2200 = VAT(grand) − VAT(มัดจำ) · **เสนอ**: `inhouse({…, deposit:false})` + `payable = grand` (สำเนาแก้แล้วเขียว) หรือคาด `refVat(grand).vat − VAT ของมัดจำ`
6. **PC-2** — ฐาน l2 ยังไม่ reseed membership frontdesk (ฟิกซ์เจอร์มี `hotel.folio.post/checkOut` แล้ว) — งานผู้คุม
7. **คำขอแก้ชิ้นกลาง (fitness)** — `scripts/fitness.mts` ALLOWED_EDGES ต้องเพิ่ม `"hotel→account"` (ใบ §0/§1 สั่งให้ checkout.ts/room-charge.ts/service เรียก `reverseRoomChargePosting/restoreRoomChargePosting` + `posAccountSystemId/vatConfigOf` ผ่าน facade `@/lib/modules/account`) · fitness ไม่มี env = 52/53 แดงเฉพาะเส้นนี้
8. **ORACLE-EDIT ที่ใบคาด (§2.11) + ทะเบียน POS** — qc-hotel-money HT-1.2/2.x · qc-hotel-refund RF-* · qc-pos-p5.1 MA2/MA2b/MA5/MA12b/MA13 เรียก `checkOut` เดิมไม่ส่งวิธีจ่าย ⇒ `PAY_METHODS_REQUIRED` (เปิด `rooms.hotel.checkout.allowLegacyCash` ในร้านทดสอบ) · ทะเบียนผู้เรียก `createSale(` (qc-pos-p2.4 L2 · qc-pos-p2.9b L2): `hotel/service.ts 2→1` · `hotel/checkout.ts 0→3` (บิลเช็กเอาต์ · ใบรับประกัน · บิลริบประกัน — ทุกจุดผ่าน `callerTx` ตามแบบ HT6.1 เว้นบิลเช็กเอาต์ที่เป็นเจ้าของ tx เอง) · qc-pos-p2.9b L3 หมุด `hotel/service.ts#checkOut` เปลี่ยน (ตั้งใจ · ใบ §1)

## มติทางเทคนิคที่ builder ตัดสิน (ย้อนได้)
- **มัดจำที่ใช้ชำระ** = แถว `DEPOSIT` **บวก** (อ้างบิล settle) บน folio หัวกลุ่ม ⇒ PAYMENT = −ยอดค่าใช้จ่ายของ folio ตามข้อสอบ + balance 0 · มัดจำเกิน ⇒ คืนผ่าน POS หลัง tx B + แถว `REFUND` (บวก) · กลุ่มที่ยังมีห้องถือมัดจำ ⇒ ไม่คืน (หัวกลุ่มเหลือเครดิต)
- **ออกก่อนกำหนด**: tx B ตั้ง `HotelBookingNight.counted = false` คืนที่ ≥ วันนี้ (ค่าห้องเก็บตามที่ post ครบถึงวันออกเดิม) — เดิม availability นับคืนของการจองที่ออกแล้ว ⇒ ห้องเต็มทั้งที่ว่าง (run2 SD-3/SD-4/B-2 จองไม่ได้)
- **ทางเดิม P1** (`allowLegacyCash`): แถวเงินสดเสมอ (0 เมื่อมัดจำพอดี — ST-4 คาด) · ไม่ผูก POS = เช็กเอาต์ไม่มีบิล (standalone แบบเดิม) · ทางใหม่ไม่ผูก POS = `POS_UNLINKED`
- **ภาษี**: ตรวจ `TAX_CONFIG_MISMATCH` เทียบอัตราของสมุดที่ POS ผูก (สูตรเดียวกับ `posVatRateBp`) · POS ไม่เชื่อมบัญชี = ผ่าน + คำเตือน (GL-4) · ค่าตั้งภาษีอ่าน ณ เวลาเช็กเอาต์ (ST-2 ตั้งหลังจอง) ไม่ใช่ `taxSnapshot`
- **ลงห้อง**: reference ลองเลขห้อง (เฉพาะห้องที่มีแขก CHECKED_IN) ก่อน แล้วรหัสจอง · ห้องว่าง = `ROOM_NOT_FOUND` · บิลมีส่วนลดท้ายบิล/ลงห้องบางส่วน ⇒ บรรทัดเดียวเท่ายอดที่ลงห้อง · `chargeToRoom` facade รับ `folioRef.reference` (ภายใน) เพิ่มจาก S §8.3
- **taxInvoice** `kind: "COMPANY"` ⇒ JURISTIC · `"INDIVIDUAL"` ⇒ PERSON ก่อนส่ง `parseTaxInvoiceBuyer`
- แถวจ่ายยอด 0 รับได้ (ข้อสอบส่ง CASH 0 เมื่อ payable 0) แต่ไม่ส่งเข้า POS

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ปุ่มเช็กเอาต์ P1 บนหน้าเคาน์เตอร์ (`hotel/page.tsx` · `checkOutAction`) ยังอยู่ ⇒ ได้ PAY_METHODS_REQUIRED เงียบ · badge จำนวน unmatched บนหน้าเคาน์เตอร์ | ไฟล์นอก §1 | H.4/H.2 (หน้าเคาน์เตอร์) — ลิงก์ไป `?tab=money&checkout=1` + `countUnmatchedRoomCharges` |
| คีย์ใหม่ 2 ตัวยังไม่อยู่ในการ์ดตั้งค่าโรงแรม (`hotel-settings-shared.ts`) | ไฟล์นอก §1 | ผู้คุม/H.1 ต่อ |
| แท็บ "เงิน" ใน BookingDetail ไม่ได้รวม FolioPanel (หน้าแสดง FolioPanel แยกบล็อก · `?tab=money` เลื่อนขึ้นก่อน) | BookingDetail.tsx นอก §1 | ผู้คุม |
| ลิงก์ใบเสร็จออนไลน์ของ POS หลังเช็กเอาต์ | settle คืน saleId/receiptNo (ไม่มี token) | H.7/POS |
| refundStay ของบิลกลุ่ม (`hotel-sale-<groupId>`) | refundStay P1 รู้จักแค่คีย์ต่อการจอง | H.7 |
| บิลร้านที่ลงห้องถูก void หลังบิลห้องปิด | folio ปิดแล้ว ⇒ log เตือน ให้ผู้จัดการจัดการ | H.7 |
| บิลร้านที่ถูกกลับรายการ (reverse) แล้วถูก void ภายหลัง | `reverseExternalSale` ไม่กลับ "ตัวคืน" ของสาย | H.7/บัญชี |
| ชั้นเอกสารรายงาน (ABB) ของบิลร้านที่ลงห้องยังอยู่ ⇒ รายงานขายรายสินค้าเห็นอาหาร 2 ที่ | ใบสั่งให้แตะเฉพาะ GL | บัญชี |
| ริบประกันบางส่วน | ใบ §0 v1 | ใบย่อย |
| folio EXCLUSIVE ของกลุ่ม = ภาษีต่อ folio รวมกัน (ปัดเศษต่อ folio) | ให้ PAYMENT ต่อ folio ตรงยอดของตัวเอง | — |

## สิ่งที่ H.4 / H.6 / H.7 ต้องรู้
- H.4: `takeSecurityDeposit(actor, ctx, {reservationId, amountSatang?, payType, reference?})` (ต้องเปิด `rooms.hotel.securityDeposit.enabled` · ยอดปริยาย `rooms.hotel.securityDeposit` ต่อประเภทห้อง) · folio เปิดตั้งแต่ CONFIRMED (ไม่มีจะสร้างให้) · การ์ด `SecurityDepositCard` ใช้ซ้ำได้
- H.6: `postFolioItem(actor, ctx, {reservationId, type:"MINIBAR", description, qty, unitAmountSatang, refType?, refId?})` · ต้องมี `hotel.folio.post` · เพดาน `rooms.hotel.folio.manualItemMaxSatang`
- H.7: `postRoomNights(ctx, {reservationId, upToDate, auditId})` = คืนที่ date < upToDate · ข้ามคืนที่มี `folioItemId` · คืนที่ post ด้วย auditId void ได้เฉพาะผู้จัดการ · no-show PENALTY ผ่าน `postFolioItem` · รายงานอ่าน folio + `settledSaleId`
- ทุกเส้น: แถว `DEPOSIT` ลบ = รับ · บวก = ใช้ในบิลเช็กเอาต์ · `PAYMENT` อ้างบิล POS · เงินประกันเป็นแถว amount 0
