# POS ใหม่ — แผนงาน RUN (POS-MASTER-PLAN) · 55 ใบงาน · 7 เฟส

> 1 ต.ค. 2569 · ผู้เขียน Fable 5.1 · **แผนอย่างเดียว ยังไม่เริ่ม RUN (รอคำสั่ง + รอ CRM ปิด)**
> อ่านคู่: `DESIGN-POS.md` (แบบ) · `POS-CONTRACTS.md` (สัญญา) · `POS-API.md` · `POS-MIGRATION-PLAN.md` · ภาพ `design-pos/`
> แม่แบบ: `CRM-MASTER-PLAN.md` — กติกาเครื่อง/บทบาท/ด่าน 12 ข้อ/ขั้นตอน 14 ขั้น/prompt **ใช้ชุดเดียวกัน** (อ้าง §1–§5, §11 ของ CRM) ที่นี่เขียนเฉพาะส่วนที่ต่างและรายการใบงาน

## 0. วิธีใช้ (5 นาที)
1. เจ้าของสั่ง "เริ่ม RUN POS" → ผู้คุมงานเปิดไฟล์นี้ §12 (สถานะสด) → ทำ P0 ให้ครบก่อน (3 ใบ · เตรียมเครื่องมือ ไม่แตะพฤติกรรมสินค้า)
2. ทุกใบมี brief ใน `ledger/pos-briefs/pos-brief-<id>.md` (เขียนตอนถึงใบ ไม่เขียนล่วงหน้าทั้งหมด — brief ที่เขียนก่อนรันเคยผิดชื่อตารางใน CRM) · อ่าน `pos-brief-COMMON.md` ก่อนทุกใบ
3. ขนาน ≤3 เลน ทั้งเครื่อง (รวม session อื่น) · งานหนักผ่าน `scripts/with-gate-lock.sh` · ข้อสอบรันใน `scripts/iso.sh`
4. บทบาท (CRM §1): controller (Fable/Opus) · oracle writer · builder · reviewer (อ่านอย่างเดียว) · hunter — ห้ามควบในใบเดียวกัน

## 1. สิ่งที่ต่างจาก CRM RUN (เฉพาะ POS)
- **เงินจริง**: ทุกใบที่แตะ `createSale/void/refund/shift` ต้องรัน `qc-pos-account.mts` (16) + `qc-account-cpa.mts` (107) + `qc-restaurant-money.mts` + `qc-shop-refund.mts` + `qc-hotel-money.mts` + `qc-ticket-money.mts` + `qc-subscription-money.mts` เป็น regression (ระบบอื่นเรียก createSale ทั้งหมด — พังเงียบข้ามโมดูล)
- **ตัวเลขห้ามเพี้ยนระดับสตางค์**: oracle ทุกตัวตรวจ Σ payMethods = grandTotal · VAT round-half-up ระดับบิล · บัญชี Dr=Cr
- **UI ต้องแตะได้จริงบนแท็บเล็ต**: visual harness ถ่าย 3 ขนาด (1440×900 · iPad 1024×768 แนวนอน · 390×844) · touch target ≥44px เป็นข้อสอบ (X11)
- **ห้ามแก้ signature `createSale` ที่ระบบอื่นเรียก** — เพิ่มได้ ลบ/เปลี่ยนความหมายไม่ได้ (fitness F15.2)
- **แคตตาล็อกเดียว**: F15.1 ห้าม write `MenuItem`/`ShopProduct`/`AccountProduct.salePrice` นอก `catalog.ts`
- **ทุกจอ parity กับภาพ `design-pos/`** (feedback_lucid_ui_parity_gate) — ใบ UI ไม่ merge ถ้ามีจุดต่างค้างที่ไม่มีคำอธิบาย

## 2. ด่าน DoD (CRM §3 12 ข้อ) + ข้อเพิ่ม POS
13. เส้นเงิน regression ชุด §1 เขียวทั้งหมดบน Neon branch · 14. parity ภาพ 3 ขนาด · 15. ไม่มีสตริงอังกฤษดิบ/enum ในจอ (th+en ครบ) · 16. event ใหม่มี consumer + oracle replay ไม่เบิ้ล

## 3. กลุ่มข้อสอบ X — บังคับทุกใบ (จากบทเรียน บัญชี/สมาชิก/CRM + สเปก POS §11/§12)
| X | ตรวจอะไร |
|---|---|
| X1 idempotency | ยิงซ้ำ key เดิม = ผลเดิม ไม่เกิดเอกสาร/stock/แต้มซ้ำ (sale · refund · order ingest · sync) |
| X2 ข้ามร้าน/ข้ามสาขา | unitId/productId/memberId ของร้านอื่น → ปฏิเสธ ไม่รั่ว |
| X3 สิทธิ์ | ทุก action ใน §9 สเปก + ใหม่ (channel/order/approval/pin) ตามบทบาท · เพดานส่วนลด |
| X4 เงิน | Σ payMethods = grandTotal · เงินทอน · VAT 3 โหมด · split · 0 บาท · ค่าคอมฯ |
| X5 ย้อนกลับ | void/refund กลับทุก side effect (บัญชี แต้ม สต็อก ว่อชเชอร์ บัตรของขวัญ สแตมป์ คูปอง) · refund บางส่วนสัดส่วนถูก |
| X6 race | 2 เครื่องขายชิ้นสุดท้าย/เลขใบเสร็จ/recall บิลพักเดียวกัน/confirm vs expire |
| X7 เวลา | ตัดวันตามเขตเวลาสาขา · ข้อสอบไม่ผูก "วันที่ N" (feedback_oracle_rots_over_time) |
| X8 ไม่เชื่อม | ปิดการเชื่อมแต่ละระบบแล้วขายได้ ไม่มี entry/แต้ม/การ์ด |
| X9 outbox | event ทุกตัว replay ได้ · consumer ขั้นแรกล้มไม่บล็อกขั้นหลัง (reference_outbox_first_step_blocks_rest) · drain จนเงียบ |
| X10 ภาพ | parity 3 ขนาด · ไม่มี overflow · ภาษาไทย · empty/error/offline state |
| X11 แตะ | ปุ่มหลัก ≥44px · แป้นลัด F2/F4/F8/Esc · autofocus สแกน |
| X12 ไม่มี env | fitness รันแบบไม่มี .env (reference_shark_precommit_fitness_no_env) |

## 4. เฟสและใบงาน (55 ใบ)
สัญลักษณ์: เลน A = เครื่องคิดเงิน/ชำระ/กะ · B = แคตตาล็อก/สต็อก/สูตร · C = โต๊ะ/ครัว/ช่องทาง · S = เดี่ยว (แตะไฟล์กลาง ทำคนเดียว) · ⏮ = ต้องเสร็จก่อน

### P0 — เตรียม (3 ใบ · ทำก่อนทุกอย่าง · S)
| id | ชื่อ | ส่งมอบ | ตรวจรับ |
|---|---|---|---|
| P0.1 | เครื่องมือ QC POS | `scripts/pos-qc-env.mts` (ชื่อตารางจริง) · `seed-pos-qc.mts` (ร้านกาแฟ 2 สาขา + ร้านอาหาร 1 · วางหลัง seed สมาชิก) · `visual-pos.mts` (3 ขนาด) · `pos-ui-inventory.json` + fitness F15.1–F15.4 · `wo-notes/TEMPLATE-pos.md` | fitness เขียวแบบมี/ไม่มี env · seed รันซ้ำได้ · visual ถ่าย 4 หน้าเดิมได้ |
| P0.2 | ทะเบียน op POS | `pos/api/registry.ts` โครง (ยังไม่มี route) + ลงทะเบียน op เดิม 6 ตัว | F10.1 ผ่าน (ทุก tool อยู่ 1 ที่) |
| P0.3 | ข้อสอบรากฐาน | `qc-pos-p1.1.mts` (catalog) · `qc-pos-p1.3.mts` (register) เขียนก่อน build (fail-before) | ทั้งสองไฟล์ SKIPPED ด้วยเหตุผลถูกต้อง exit 0 |

### P1 — เครื่องคิดเงินใช้ได้ทั้งวัน (18 ใบ)
| id | เลน | ชื่อ | ⏮ | ส่งมอบหลัก | ตรวจรับ (oracle · ประมาณข้อ) | ภาพ |
|---|---|---|---|---|---|---|
| P1.1a | S | แคตตาล็อกเดียว — ตาราง+backfill | P0 | `PosProduct/PosCategory/PosVariant/RecipeLine/PosProductOptionGroup` + migration ขั้น 1 + `catalog.ts` + backfill | `qc-pos-p1.1` ~40 (นับ 1:1 · ราคาเท่าเดิม · idempotent · rollback) + regression คลัง/ร้านอาหาร/เว็บ | — |
| P1.1b | S | dual-write catalog | P1.1a | ทุก writer เดิม → catalog.ts · F15.1 | แก้ที่ร้านอาหาร → POS เห็น ·  ~20 | — |
| P1.2 | B | ตัวเลือก · variant · ชุด/คอมโบ · สินค้าชั่ง | P1.1a | option groups ใช้ร่วม · variant SKU/บาร์โค้ด · bundle · EAN น้ำหนัก | ~45 · ราคารวมตัวเลือกถูก · บาร์โค้ดน้ำหนัก | 06 |
| P1.3 | A | หน้าขายใหม่ (เดสก์ท็อป/แท็บเล็ต/มือถือ) | P1.1a | กริด/หมวด/ค้นหา/ตะกร้า/ส่วนลดบรรทัด/แป้นลัด/แถบสถานะ | `qc-pos-p1.3` ~50 + visual 3 ขนาด | 01 · 05ก |
| P1.4 | A | บาร์โค้ด (เครื่องสแกน + กล้อง) | P1.3 | wedge autofocus · ZXing · สแกนซ้ำ +1 | ~15 | 01 |
| P1.5 | A | พักบิล/เรียกคืน | P1.3 | `PosHeldCart` · recall atomic · re-price | ~20 (X6) | 14* |
| P1.6 | A | จอชำระ: split · numpad · เงินทอน · ค่าบริการ/ทิป | P1.3 | createSale รับ payMethods หลายรายการ | ~45 (X4) + regression เงินทั้งชุด | 02 · 05ข |
| P1.7 | A | PromptPay ไดนามิก + Beam webhook + บัตร | P1.6 | `PosPaymentIntent` · confirmSalePaid idempotent · Beam ปิดสุภาพถ้าไม่มี creds | ~35 (confirm vs expire race) | 02 |
| P1.8 | A | คืนเงินบางส่วน + CN + คืนสต็อก/แต้ม/ว่อชเชอร์ | P1.6 | `refundSale` docType REFUND · event `pos.sale.refunded` + consumer | ~45 (X5) + CPA 107 | 12 |
| P1.9 | A | กะ/ลิ้นชัก/X/Z/บังคับปิด/เงินสดนอกกะ | P1.6 | `PosShift` · Z แช่แข็ง · cron force-close · event shift | ~40 | 07 · 13* |
| P1.10 | A | เครื่อง + เครื่องพิมพ์ ESC/POS + ใบเสร็จ 58/80 + ใบกำกับอย่างย่อ | P1.9 | `PosDevice` · WebUSB/BT · template ใบเสร็จ th/en · reprint สำเนา | ~30 + ภาพใบเสร็จ parity | 11B |
| P1.11 | A | ใบเสร็จออนไลน์ + ส่ง LINE/อีเมล + แจ้งปัญหา | P1.10 | `/r/[token]` · notify · chat.pushToContact · event issue_reported | ~25 | 11C |
| P1.12 | B | สมาชิกที่ตะกร้า + สิทธิ์ที่จอชำระ (แต้ม/ว่อชเชอร์/บัตรของขวัญ/สแตมป์/รางวัล/tier) | P1.6 | member.lookup/quickRegister/benefitsFor · burn/redeem ใน tx · reverse ครบ | ~60 (X5 ข้ามระบบสมาชิก v2 ทุกตัว) | 01 · 02 · 14* |
| P1.13 | A | ใบกำกับเต็มรูปจากจอชำระ + DBD lookup (ปิดสุภาพ) | P1.6 | taxInvoice snapshot → Account ออกเอกสาร | ~15 | 15* |
| P1.14 | B | ตรวจนับมือถือ + ทางลัดรับของ/โอน/ปรับ | P1.1a | `PosStockCount` · ขายระหว่างนับบวกกลับ · event confirmed | ~30 | 05ค · 16* |
| P1.15 | A | PIN/สิทธิ์/เพดานส่วนลด + อนุมัติผ่าน approval core | P1.3 | `PosStaffPin` · resolvePolicy/submit · fallback PIN | ~35 (X3) | 13* · 21* |
| P1.16 | A | บิลวันนี้ + ยกเลิก/คืน UI + ประวัติ | P1.8 | ตาราง/ลิ้นชัก/modal | ~20 + visual | 12 |
| P1.17 | B | รายงานพื้นฐาน 7 ชุด + dashboard การ์ด | P1.9 | daily/products/staff/payments/margin/shifts/tax + CSV | ~30 (ตัวเลขตรง oracle คำนวณเอง) | 08 (บางส่วน) |
| P1.18 | S | ตั้งค่า POS + การ์ดเชื่อมระบบ + th/en + ปิดเฟส | ทุกใบ P1 | หน้าตั้งค่า 5 แท็บ · การ์ด 13 ระบบ · `qc:all` | qc:all เขียว · parity ครบทุกจอ P1 | 10 · 17* |

### P2 — จอเดียวทุกโหมด + ทุกช่องทาง (14 ใบ)
| id | เลน | ชื่อ | ⏮ | ตรวจรับ | ภาพ |
|---|---|---|---|---|---|
| P2.1 | S | `SalesChannel` + `PosSale.channelId` + ค่าคอมฯ → บัญชี | P1.6 | ~35 · บัญชี Dr/Cr ค่าคอมฯ | 09 |
| P2.2 | B | ราคาตามช่องทาง/ช่วงเวลา/สาขา + price rule จากการตลาด | P2.1 | ~30 (ลำดับ campaign>channel>base) | 06 |
| P2.3 | B | สูตร/วัตถุดิบ BOM ตัดคลัง + ต้นทุนตามสูตร | P1.1b | ~35 (C-1 consume ชุดเดียว · void คืน) | 06 |
| P2.4 | C | โหมดโต๊ะใน POS (ย้าย UI ร้านอาหาร) + โต๊ะจอง/คิว | P1.3 P1.1b | regression `qc-restaurant*` ทั้งชุด + ~30 | 03 |
| P2.5 | C | แยกบิล 3 แบบ + รวม/ย้ายโต๊ะ + พิมพ์ใบรายการ (pre-bill 03 · มติ P2.6 Q8) | P2.4 | ~35 (Σ ส่วนแยก = ยอดเดิม) | 15* |
| P2.6 | C | KDS ใหม่ + ใบครัว + 86 → ทุกช่องทาง | P2.4 S + P2.8 S (+P2.3 S บนฐาน) · มติ 10 ต.ค. | ~44 + Z + event availability | 04 |
| P2.7 | C | QR สั่ง/สั่งล่วงหน้าจ่ายก่อน (PENDING_PAYMENT) | P1.7 P2.4 | ~30 | — (ของเดิม) |
| P2.8 | C | จอออเดอร์ทุกช่องทาง + adapter MANUAL/WEB/CHAT + สลับเว็บร้านอ่าน PosProduct | P2.1 | ~45 + regression `qc-shop*` | 09 |
| P2.9 | A | ว่อชเชอร์เป็นวิธีชำระ · บัตรของขวัญ · เครดิตร้าน · มัดจำ · ทิป | P1.12 | ~40 (X5) | 02 |
| P2.10 | A | จอลูกค้า (จอที่ 2) | P1.6 | visual + ~10 | 11A |
| P2.11 | B | หลายสาขา: สต็อก/ราคา/เลขใบเสร็จ/รายงานรวม/โอน · **P2.2U F4**: แถวราคาของช่องทาง/สาขาที่เก็บถาวรแล้วทำให้บันทึกแบบแทนทั้งชุดจาก 06 ไม่ได้ ⇒ S รับแถวเดิมที่ไม่เปลี่ยนของรหัสที่เก็บแล้ว หรือ client ตัดทิ้งพร้อมแจ้ง | P2.2 | ~30 (X2) | 08 |
| P2.12 | B | รายงานช่องทาง/สาขา/ผิดปกติ + PDF | P2.1 P2.11 | ~20 | 08 |
| P2.13 | S | REST `/api/v1/pos` + สกิล + คู่มือ (registry) | P1.18 | ~45 op · oracle API + สกิลทดสอบด้วย agent | — |
| P2.14 | S | ปิดเฟส: qc:all + parity ทุกจอ + HANDOVER-P2 | ทุกใบ | qc:all เขียว | — |

**เก็บตกจากปิดเฟส P1 (parity R15 + HF-P1CLOSE · 10 ต.ค. — ทำใน P2.14 หรือการ์ด UI เล็กก่อนหน้า):** (ก) 14B บนมือถือ: ตะกร้าว่างไม่มีทางเปิด "บิลที่พัก" (ปุ่มอยู่ในชีตตะกร้าเท่านั้น) → ต้องมีทางเข้าบนแถบบน/แถบตะกร้า 390 (ต้องเคาะแบบ) · (ข) 19ค การ์ด QR หมดอายุ: แอปใช้ "QR หมดอายุ + สร้างใหม่" แต่แบบเขียน "PromptPay ยังไม่ได้รับเงิน · ลองใหม่ · เลือกวิธีอื่น · ยืนยันเอง" → **ตัดสิน 10 ต.ค. (vis59): deviation ที่ยอมรับใน P1 · การ์ดแดงตามแบบ 19ค (เหตุผล + ลองใหม่/เลือกวิธีอื่น/ยืนยันเอง + รหัสอ้างอิง) + print-failed เป็น toast ล่าง + 14B ชิป "เครื่องนี้"/ภาพ modal เรียกคืนชน → การ์ด P2.12**สิน (copy card) · (ค) O3 app-shell ภาษาอังกฤษ = การ์ดแกนกลาง (เจ้าของ core) · (ง) O10 19ก ปุ่ม "นำเข้า CSV / ชุดตัวอย่าง" = การ์ด onboarding (18) · (จ) O12 21A หน้าอนุมัติ = เจ้าของโมดูลอนุมัติ

### P3 — เชื่อมทุกระบบ + AI + ออฟไลน์ (12 ใบ)
P3.1 adapter LINE MAN (รอ partner API) · P3.2 Grab · P3.3 Shopee/Lazada/TikTok → สมาชิก · P3.4 ออฟไลน์ PWA + `/sync/sales` (C-13) · P3.5 HR (PIN ตามตารางงาน · ค่าคอมฯ · ชั่วโมง) · P3.6 CRM (ดีล/ลูกค้าองค์กร/เครดิตเทอม) · P3.7 แชท (ใบเสร็จ/สถานะ/สั่งจากแชท/ตอบอัตโนมัติ) · P3.8 บอร์ดงาน+ประชุม (event→การ์ด/ห้องทีม) · P3.9 AI tools + proposals + ตรวจจับผิดปกติ + Daily Brief · P3.10 ตรวจสลิปอัตโนมัติ + กระทบยอด Beam · P3.11 e-Tax Invoice (เมื่อมี provider) + ตัวช่วยพิมพ์ LAN · P3.12 ข้อสอบไขว้ทุกระบบ + parity + HANDOVER-P3
- ใบที่รอของจากเจ้าของ (P3.1–3.3, 3.10, 3.11) ทำโครง+ปิดสุภาพก่อน เปิดสวิตช์เมื่อ creds มา

### P4 — "ทุกปุ่มทำงาน" (3 ใบ · CRM §7 วิธีเดียวกัน): P4.1 ทะเบียนปุ่ม/ฟอร์ม POS ทุกจอ (data-testid + F15.3) · P4.2 เดินทุกปุ่มด้วย harness 3 ขนาด · P4.3 แก้ที่พบ + regression
### P5 — ล่าบั๊กและช่องโหว่ (3 ใบ · CRM §8): P5.1 เงิน/race/idempotency (hunter เลนเงิน) · P5.2 สิทธิ์/ข้ามร้าน/public endpoints (receipt token · webhook signature · QR โต๊ะ) · P5.3 ประสิทธิภาพ (หน้าขาย <1.0s · lookup barcode <100ms · 200 บรรทัด/บิล)
### P6 — ขึ้น production (2 ใบ · CRM §9): P6.1 migration ลำดับ + backfill + verify-prod · P6.2 HANDOVER + คู่มือในแอป + สกิล + อัปเดต `docs/modules/14-pos.md` เป็น V2 + `docs/sds/modules/pos.md` AS-BUILT

## 5. แผนขนานและงบเวลา (ประมาณการ · ไม่ใช่สัญญา)
- **เริ่มเมื่อ**: CRM RUN ปิดเฟสและขึ้น main (เหลือ ~9 ใบ) · ระหว่างรอ: เอกสาร/ภาพ/brief P0–P1.3 (ไม่แตะโค้ด)
- สัปดาห์ 1: P0 (S) → P1.1a/b (S) — เดี่ยว เพราะแตะตารางกลาง
- สัปดาห์ 2–4: 3 เลน A/B/C ขนาน (A: 1.3→1.4→1.5→1.6→1.7→1.8→1.9→1.10→1.11→1.13→1.15→1.16 · B: 1.2→1.12→1.14→1.17 · C: ว่างใน P1 → เริ่ม P2.4 ได้ทันทีที่ 1.3 ผ่าน)
- สัปดาห์ 5–7: P2 (S ใบ 2.1 ก่อน แล้ว 3 เลน)
- สัปดาห์ 8–10: P3 + P4–P6
- จุดตรวจเจ้าของ: ปิด P1 (ขายได้จริงบน prod ร้านทดลอง) · ปิด P2 · ก่อน P6
- 🔴 ทุกเฟส: ผู้คุมงานดูภาพจริงคู่ mockup เอง · agent "แก้แล้ว" ต้องมี PNG/โค้ดยืนยัน (บทเรียนบัญชี V2)

## 6. ของที่เจ้าของต้องทำ (ขนานกับ RUN · เริ่มได้ตั้งแต่วันนี้)
1. Beam: `BEAM_MERCHANT_ID/API_KEY/WEBHOOK_SECRET` + ตั้ง webhook `https://shark.in.th/api/payment/beam/webhook`
2. สมัคร partner: LINE MAN Wongnai Partner API · Grab Merchant/GrabFood API · Shopee Open Platform (+Lazada/TikTok ถ้าเอา) — ในนามบริษัท ใช้เวลาเป็นสัปดาห์–เดือน
3. ร้านทดลอง 1–2 ร้าน (ร้านกาแฟ/ร้านอาหาร) ยอมใช้จริงตอนปิด P1 (OWNER_TODO มีแนวคิดอยู่แล้ว)
4. ซื้อเครื่องพิมพ์ใบเสร็จ BT/USB 1 เครื่อง + ลิ้นชัก 1 ตัว ไว้ทดสอบจริง (ดู §7)
5. เลือกผู้ให้บริการ e-Tax (ภายหลัง · ไม่บล็อก)

## 7. ค่าใช้จ่ายที่ร้านต้องมี (ตัวเลขประมาณ · ⚠️ ต้องยืนยันราคาจริงก่อนบอกลูกค้า)
| รายการ | แนวทาง | ประมาณ |
|---|---|---|
| แท็บเล็ต/มือถือ | ของที่ร้านมีอยู่ (Android/iPad) | 0 – 8,000 บาท |
| เครื่องพิมพ์ใบเสร็จ 80 มม. BT/USB ESC/POS | Xprinter/Gprinter/Sunmi | ~1,500 – 3,500 บาท |
| ลิ้นชักเงิน (เปิดผ่านเครื่องพิมพ์) | RJ11 | ~800 – 1,500 บาท |
| เครื่องสแกนบาร์โค้ด (ค้าปลีก) | USB/BT wedge | ~700 – 2,000 บาท |
| จอลูกค้า | แท็บเล็ตเก่าเปิดลิงก์ | 0 |
| PromptPay/บัตร ผ่าน Beam | ค่าธรรมเนียมต่อรายการ | QR ~0–1% · บัตร ~1.5–3% (ตามแพ็ก Beam — ⚠️ ต้องดูสัญญาจริง) |
| ค่าคอมฯ แพลตฟอร์มเดลิเวอรี่ | หักโดยแพลตฟอร์ม | ~25–35% ของยอด |

## 8. ความเสี่ยงหลักและทางกัน
| ความเสี่ยง | ทางกัน |
|---|---|
| ยุบแคตตาล็อกทำร้านอาหาร/เว็บร้านพัง | dual-read 3 ขั้น + regression เดิมทั้งชุดทุกใบ + F15.1 |
| migration ชนกับ session อื่น | P1.1a/b ทำเดี่ยวหลัง CRM ขึ้น main · push ทันทีที่สร้าง migration |
| เครื่อง 2 CPU thrash → ข้อสอบ race แดงหลอก | ≤3 เลน · gate lock · ข้อสอบ race รันเดี่ยว |
| partner API ไม่มา | MANUAL adapter ให้ยอดครบตั้งแต่ P2 · adapter จริงเป็นสวิตช์ |
| Beam creds ไม่มา | ยืนยันมือ + สวิตช์ · โค้ด webhook รอ |
| ออฟไลน์ซับซ้อนเกิน | P3 · ขอบเขตแคบ (สด/โอน/ไม่มีแต้ม) · เลขชั่วคราว |
| โควตา session | หยุด spawn ที่ ≥70% · ทำงานฝั่งผู้คุมงานแทน (feedback_session_quota_pacing) |

## 9. Prompt (ใช้ของ CRM §11 โดยแทนที่ CRM→POS · เพิ่มบรรทัดบังคับ)
- Builder/Oracle writer เพิ่ม: "Money is integer satang. Never change `createSale` signature consumed by other modules. Every new event needs a consumer. All UI strings via `src/messages/{th,en}.json` key `pos.*`. Run the money regression set (list in POS-MASTER-PLAN §1) before claiming done. Wait for builds in the shell; do not end the turn while a command runs."
- Reviewer เพิ่ม: "Open the PNGs from `visual-pos.mts` next to `ledger/design-pos/NN-*.png` and list every visual difference with coordinates."

## 10. หลักฐานปิด RUN (CRM §10 + POS)
วิดีโอ/ภาพขายจริง 1 บิลบน prod ร้านทดลอง (สด+PromptPay · ใบเสร็จพิมพ์ · ลงบัญชี · แต้มขึ้น) · Z report 1 กะ · ออเดอร์ MANUAL 1 ใบจบถึงบัญชี · qc:all · parity ทุกจอ 3 ขนาด · HANDOVER

## 11. ภาพชุดเพิ่ม 13–21 (✅ วาดครบ 1 ต.ค.)
13 เปิดกะ + ล็อกจอ PIN · 14 แผ่นสมาชิก (ค้นหา/สแกน/สมัคร) + พักบิล/เรียกคืน · 15 ใบกำกับเต็มรูป + แยกบิล 3 แบบ · 16 รับของเข้า/โอน/ปรับจาก POS · 17 ตั้งค่า: ใบเสร็จ/ภาษี · เครื่องและเครื่องพิมพ์ · พนักงานและสิทธิ์ · 18 ตั้งร้านครั้งแรก (10 นาที) · 19 สถานะว่าง/ผิดพลาด/ออฟไลน์ · 20 หน้าขายภาษาอังกฤษ + iPad 1024×768 · 21 คำขออนุมัติ void/คืนเงิน + ขายแพ็กสมาชิกที่หน้าขาย

## 12. สถานะสด
- 1 ต.ค. 2569: แผนเขียนเสร็จ · ภาพครบ 21 จอ · **ยังไม่เริ่ม RUN** · รอ (1) เจ้าของสั่ง (2) CRM ขึ้น main
- 1 ต.ค. 2569 ~06:40 UTC: **เริ่ม RUN เฉพาะ P0** (เจ้าของสั่ง · ขนานกับ CRM · QC4 แยก) — สถานะสดย้ายไป `ledger/POS-RESUME.md`
