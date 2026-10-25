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

## ช่อง 3–19
(เติมเมื่อแต่ละช่องจบ)
