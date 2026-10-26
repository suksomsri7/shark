# P4.3 — รอบสำรวจ walker (chain v3b · CD-P43-14) · บันทึกผู้คุม A · 25 ต.ค. 2026
รอบสำรวจ = ปล่อย walker 19 ช่องเดินครบบน build qQ59--mTf9CtReFSvf5YE (tip 939e4fd2) เพื่อเก็บ defect ทุกช่องก่อนแก้รวมครั้งเดียว แล้ว rerun 19 ช่องรอบจริงที่ tip สุดท้าย (ทะเบียนเปลี่ยน = registryHash เปลี่ยน = ต้องรันใหม่ทุกช่องอยู่แล้ว)
ผลดิบ: `/root/pos-runs/walker-B-20261025T030640Z/` (cell-*.log · summaries/) · perf 25/25 ×2 (B3U p95 17.4/17.8 ms)

## ช่อง 1 owner-desktop (110 นาที · ok 643/1193 · dead 0 · wrongExpect 2 · console 1)
| แถว | อาการ | สาเหตุ | การแก้ |
|---|---|---|---|
| `sales#pos-bills-page-*` | ไม่ประกาศสถานะเลือก | aria-current มาหลัง fetch หน้าใหม่ แต่ตัวกดตรวจครั้งเดียว | fix7 CD-P43-13: poll ≤4 วิ (qc-pos-buttons.mts) |
| `orders#pos-ord-start` | ไม่เห็น pos-ord-toast | ผลิตภัณฑ์ startPrep ไม่ส่ง okToast โดยออกแบบ (OrdersScreen.tsx:429) ปุ่มเปลี่ยนเป็น pos-ord-ready | fix7: ทะเบียนเป้า pos-ord-ready |
| console `settings#pos-settings-logo-url` | 404 ×3 | ตัวกดพิมพ์ URL ทีละตัว → preview โหลด "h"/"ht"… เป็น path ใต้แอป | fix7: ช่อง URL insertText · fix8: logoPreviewUrl() เฉพาะ https ถูกรูปแบบ (ReceiptSettings.tsx) |
| `products#pos-prod-bulk-pct` (chain v3 รอบก่อน) | ไม่เห็น pos-prod-bulk-preview | ทะเบียน inline-error เป้าที่เห็นอยู่แล้ว · ข้อความ "% ไม่ถูกต้อง" ไม่มี testid | fix6 CD-P43-12: ทะเบียน ui/changes + opener select-on · **หนี้**: เพิ่ม testid ข้อความ pctInvalid (BulkMarkupDialog.tsx) ภายหลัง |

## ช่อง 2 owner-ipad (104 นาที · ok 643/1194 · dead 1 · wrongExpect 2 · console 1)
| แถว | อาการ | สาเหตุ | การแก้ |
|---|---|---|---|
| `settings#pos-device-lan-printer-name-*` | dead (ไม่มี DOM mutation) | **บั๊กเลย์เอาต์จริง**: settings มีเมนู 240 px ของตัวเอง ⇒ ที่ 1024 pane 398 px แต่ DeviceSettings สองคอลัมน์ panel 400+32 ⇒ คอลัมน์ซ้าย 0 · การ์ด LAN เหลือ 58 px | fix8 CD-P43-15/15b (src · R1 MERGEABLE): @container บน pane · devices สองคอลัมน์เมื่อ pane ≥762 · receipt ≥712 · LAN form ≥360 · 1440 เท่า mockup เดิม |
| (เดิม 3 รายการจากช่อง 1) | | | |

## ช่อง 3 owner-mobile (105 นาที · ok 628/1178 · dead 0 · wrongExpect 1 · console 1 · overflow 0)
เฉพาะรายการเดิม: `sales#pos-bills-page-*` + console logo · ไม่มี defect ใหม่ · ไม่มี overflow ที่ 390 · ord-start ผ่านบนมือถือ

## ช่อง 4 owner-desktop-en (107 นาที · ok 644/1193 · dead 1 · wrongExpect 4 · console 1)
| แถว | อาการ | สาเหตุ | การแก้ |
|---|---|---|---|
| `register#pos-taxinv-form` + `pos-taxinv-branch-code` (dead) | กล่องไม่ปิด / ช่องรหัสสาขาไม่ตอบ | **บั๊กเลย์เอาต์ EN จริง**: ป้าย "Branch no." nowrap ในคอลัมน์ 1fr ดันคอลัมน์ซ้ายกว้างเกิน → ช่อง e-Tax email ทับช่องรหัสสาขา (TaxInvoiceDialog.tsx grid sm:grid-cols-[1fr_1fr]) · ไทย "สาขาที่" สั้นจึงผ่าน | fix9 CD-P43-16 (src · builder) + สแกนแพตเทิร์นเดียวกันทุกกล่อง |
| `orders#pos-ord-cancel-confirm` | ปฏิเสธ "This shift is closed" | ออเดอร์ซากจากช่องก่อน (ช่องไทย skip เพราะไม่มีการ์ด · ช่อง en เจอการ์ดที่บิลผูกกะที่ปิดไปแล้ว) | fix9h (ผู้คุม · fixture): ยกเลิกออเดอร์เปิดค้างของ posqc-btn-unit ตอนเริ่มรอบ (ซากรอบก่อน) และก่อนปิดกะตอนจบรอบ · fallback เขียนตรง CANCELLED เมื่อกะปิดแล้ว |
| (เดิม bills-page · ord-start · logo) | | | |

## ช่อง 5 owner-mobile-en (49 นาที · 400 แถวตามทะเบียน · ok 170 · wrongExpect 1 = bills-page เดิม · console 0 · overflow 0)
ไม่มี defect ใหม่

## ช่อง 6 manager-desktop (ok 614/1193 · dead 0 · wrongExpect 4 · console 0 · overflow 0)
| แถว | อาการ | สาเหตุ | การแก้ |
|---|---|---|---|
| `settings#pos-settings-credit-save` | ปฏิเสธ `pos-settings-credit-error` "บัญชีนี้ยังไม่มีสิทธิ์ตั้งวงเงินลูกค้าเครดิต" (edit-*/add/ฟอร์ม เปิดได้) | **UI ไม่ตรงด่านเซิร์ฟเวอร์**: `credit.ts:90-93` (มติ CD-P52-O4 F5) save ได้เฉพาะ OWNER หรือ MANAGER unitAccess "*" · แต่ `settings/page.tsx:149` ตัดสิน `evaluate(pos.credit.manage)` อย่างเดียว → ผู้จัดการสาขาเดียว (fixture) เห็นปุ่มแก้/เพิ่ม · เจ้าของทุกช่องผ่าน | **CD-P43-17 fix10 src** (builder ทรี b `wip/pos-p4.3-fix10` · บรีฟ `pos-prompt-accountA-P4.3-FIX10-CREDIT-SCOPE.md`): helper `canEditCreditAccounts` ใช้ร่วม save+หน้า · การ์ดอ่านอย่างเดียว + notice `pos-settings-credit-all-branches-only` · ทะเบียน: เติม needs 10 แถว credit edit/add/ฟอร์ม (ผู้คุม · p4.1 16/16) |
| `pos-bills-page-*` · `pos-ord-start` · `pos-ord-cancel-confirm` | เดิม (fix7 poll · fix7 ทะเบียน · fix9h ซากออเดอร์) | | |

## ช่อง 7 manager-ipad (95 นาที · ok 614/1194 · dead 1 · wrongExpect 4 · console 0 · overflow 0)
ทั้งหมดเดิม: `pos-device-lan-printer-name-*` dead (fix8 @container · build qQ59 ยังไม่มี) · `pos-settings-credit-save` (fix10) · `pos-bills-page-*` · `pos-ord-start` · `pos-ord-cancel-confirm` (fix7/fix9h) — **ไม่มี defect ใหม่**

## ช่อง 8 manager-mobile (93 นาที · ok 598/1178 · dead 0 · wrongExpect 2 · console 0 · overflow 0)
ทั้งหมดเดิม: `pos-bills-page-*` (fix7) · `pos-settings-credit-save` (fix10) — **ไม่มี defect ใหม่**

## ช่อง 9 manager-desktop-en (92 นาที · ok 611/1193 · dead 0 · wrongExpect 4 · console 0 · overflow 0)
ทั้งหมดเดิม: `pos-taxinv-form` EN (fix9/9b) · `pos-ord-start` (fix7) · `pos-ord-cancel-confirm` ซากออเดอร์ (fix9h) · `pos-settings-credit-save` (fix10) — **ไม่มี defect ใหม่**

## ช่อง 10 manager-mobile-en (49 นาที · 400 แถว · ok 169 · dead 0 · wrongExpect 0 · console 0 · overflow 0) — 🟢 **เขียว ไม่มี defect**

## ช่อง 11 cashier-desktop (97 นาที · ok 784/1193 · dead 0 · wrongExpect 0 · console 0 · overflow 0) — 🟢 **เขียว ไม่มี defect**

## ช่อง 12 cashier-ipad (98 นาที · ok 785/1194 · dead 0 · wrongExpect 1 · console 0 · overflow 0)
| แถว | อาการ | สาเหตุ | การแก้ |
|---|---|---|---|
| `register#pos-reg-held-confirm-hold` | เซิร์ฟเวอร์ปฏิเสธ `pos-reg-error` "ส่วนลดเกินสิทธิ์ของบัญชีนี้ (สูงสุด 10%)" | **ซากข้ามช่อง**: แถว `pos-discount-over-request` ของช่อง 11 (cashier-desktop 19:49Z) สร้างบิลพัก "รออนุมัติส่วนลด" (`holdCartForApproval` · hcap4cb9… · approvedRequestId null) · ตอนจบช่อง fixture ลบสาย POS_DISCOUNT_OVER แต่บิลพักยัง HELD (กำพร้า) → ช่อง 12 opener `pos-reg-held-recall-*` เจอบิลนี้เป็นใบแรก → `recallHeldCart` quote ด้วยเพดานแคชเชียร์ (มติ 5 P1.15U: ไม่มี approval = เพดานผู้ขาย) → DISCOUNT_EXCEEDS_LIMIT · ช่อง 11 ไม่เจอเพราะบิลเกิดหลังแถว held (confirm-hold ถูก skip) · DB QC5 ยืนยัน (posHeldCart unit posqc-btn) | **CD-P43-18 fix11h** (ผู้คุม · fixture): resetSideEffects + ขั้น "บิลพักค้าง" ทิ้ง HELD ที่เกิดในรอบ (DISCARDED+version แบบตัวกวาดหมดอายุ) · qc-pos-buttons ด่าน 10/10 · strict tsc รวมรอบทรี c ถัดไป · **หนี้ผลิตภัณฑ์ (W44)**: ลิ้นชักบิลพักแสดงบิล "รออนุมัติส่วนลด" ให้เรียกคืนได้ทั้งที่ยังไม่อนุมัติ → ข้อความปฏิเสธเป็น "ส่วนลดเกินสิทธิ์" (ควรแสดงป้ายรออนุมัติ/ปิดปุ่มเรียกคืน) — ไม่ใช่บั๊กเงิน (เซิร์ฟเวอร์ปฏิเสธถูก) · จดใน HANDOVER §4/§5 รอเจ้าของ |

## ช่อง 13 cashier-mobile (102 นาที · ok 778/1178 · dead 0 · wrongExpect 1 · console 0 · overflow 0)
ทั้งหมดเดิม: `pos-bills-page-*` (fix7) — **ไม่มี defect ใหม่**

## ช่อง 14 cashier-desktop-en (99 นาที · ok 785/1193 · dead 0 · wrongExpect 3 · console 0 · overflow 0)
ทั้งหมดเดิม: `pos-reg-held-confirm-hold` ซากบิลพักรออนุมัติ (fix11h) · `pos-bills-page-*` (fix7) · `pos-taxinv-form` EN (fix9/9b) — **ไม่มี defect ใหม่**

## ช่อง 15 cashier-mobile-en (54 นาที · 400 แถว · ok 222 · dead 0 · wrongExpect 1 · console 0 · overflow 0)
ทั้งหมดเดิม: `pos-bills-page-*` (fix7) — **ไม่มี defect ใหม่** · ครบ 15 ช่องพนักงาน

## ช่อง 16–19 (public ×4)
(เติมเมื่อแต่ละช่องจบ)
