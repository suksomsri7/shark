# POS P2.14 — P2 phase-close parity sheet (draft for the controller)

Drafter: account A sub-agent · read-only · 16 Oct 2026 ~15:3xZ. Tip `session/pos` **39644eb2** (tree d), build `ovHP3ndB_-RV74Wv68izg`, DB QC5.
Sweep: `/root/pos-runs/vis-p2close-qc5-20261016T121501Z/` (HEAD.txt = 39644eb2 · 12:15:01Z) — **146 runs** · **1,741 shots** (th **1,144** · en **597**) · **1,728 ok / 13 failed** · runs **139 green / 7 red** (rc 1 ×6, rc 2 ×1). 16 green runs took 0 shots on purpose (no states for that user × page: p2.10 cashier ×4, p2.11u manager settings ×2, p2.12u cashier settings ×2, p2.6u cashier products/settings ×4, p2.9bu cashier sales/settings ×4).
Re-shoot: `/root/pos-runs/vis-p2close-reshoot1-qc5-20261016T150615Z/` (same tip/build/QC5, 15:06Z) — SUMMARY `DONE` · apikey-delete rc 0 (removed `QC P2.13 agent-test 2026-10-15T23:34`) · p2.9u register owner en rc 0 (15/15) · p2.13 `settings-shark-api-keys-empty` owner/manager × th/en rc 0 (8/8) · **23/23 ok, 0 console/5xx/overflow** → green.
Shots: `/root/projects/shark-pos-d/.qc-shots/pos/<wo>/` (paths below are relative to that folder). Mockups: `ledger/design-pos/NN-*.png`.

Method (as P1.18): harness facts from each run's `JSON_SUMMARY` (rc · status vs expect · consoleErrors · http5xx · overflow); then the shot named in each row was opened and spot-checked against the mockup (layout grammar, labels, ฿ + thousands, BE dates in th, real English in en with no `pos.*` keys, no clipped text, no stray Thai UI strings in en). Rows: 1440 th · 1024 th · 390 th · 1440 en · 390 en per new P2 frame; frames carried unchanged from P1 get one opened 1440 row plus one row for the other sizes (P1 rows in `pos-P1.18-parity.md` + vis59 addendum stand; the harness is green for them). **CTRL** = a money frame the controller judges (01 · 02 · 02b · 05 · 07 · 12 · 11C · P2.9U/P2.9bU pay states); the note gives facts only. Per §10 ruling 6, en is shot at 1440 for every page and at 390 only for register/pay/bills/public pages (`EN_MOBILE_PAGES`, `scripts/visual-pos.mts:949`); en 1024 is not shot (except the display, qr-public and KDS); those rows cite "ruling 6".
Global facts: ฿ with thousands separators everywhere checked (฿30,754.50 · ฿104,312.00 · ฿1,364); th dates BE ("16 ต.ค. 2569") except the report-kind cards (O-8); no `pos.*` key seen in any en shot; Thai left in en = app shell (sidebar, "แจ้งปัญหาการใช้งาน", module title "ขายหน้าร้าน · POS QC" = system name) + data (product/channel/branch/staff/QC names). Harness console errors appear only in the cashier `register/offline` shots (below). A full-page capture of the module-shell pages (products, reports, stock, settings, bills) draws the sticky app top bar + sidebar part-way down the page when the state scrolled; see Q1.

## Summary

| frame | MATCH | DEVIATION | OPEN | CTRL (folded into MATCH/DEVIATION by the controller — oracle H3 accepts only MATCH/DEVIATION/OPEN) | rows |
|---|---|---|---|---|---|
| 01 | 3 | 0 | 0 | 0 | 3 |
| 02 | 0 | 3 | 0 | 0 | 3 |
| 02b | 0 | 5 | 0 | 0 | 5 |
| 05ก | 0 | 2 | 0 | 0 | 2 |
| 05ข | 0 | 2 | 0 | 0 | 2 |
| 05ค | 0 | 2 | 0 | 0 | 2 |
| 07 | 0 | 5 | 0 | 0 | 5 |
| 12 | 5 | 0 | 0 | 0 | 5 |
| 11C | 5 | 0 | 0 | 0 | 5 |
| P2.9U/P2.9bU pay | 5 | 0 | 0 | 0 | 5 |
| 03 | 0 | 5 | 0 | 0 | 5 |
| 15B/15C | 0 | 5 | 0 | 0 | 5 |
| 04 | 4 | 1 | 0 | 0 | 5 |
| 06 | 0 | 5 | 0 | 0 | 5 |
| 08 | 0 | 5 | 0 | 0 | 5 |
| 09 | 0 | 5 | 0 | 0 | 5 |
| qr-public (/q) | 3 | 2 | 0 | 0 | 5 |
| 10 | 0 | 5 | 0 | 0 | 5 |
| 11A | 3 | 2 | 0 | 0 | 5 |
| 11B | 0 | 1 | 0 | 0 | 1 |
| 13A/13B | 0 | 2 | 0 | 0 | 2 |
| 14A | 0 | 2 | 0 | 0 | 2 |
| 14B | 0 | 2 | 0 | 0 | 2 |
| 15A | 0 | 2 | 0 | 0 | 2 |
| 16 | 0 | 4 | 0 | 0 | 4 |
| 17 | 0 | 4 | 0 | 0 | 4 |
| 18 | 0 | 1 | 0 | 0 | 1 |
| 19 | 0 | 4 | 0 | 0 | 4 |
| 20A | 0 | 1 | 0 | 0 | 1 |
| 20B | 0 | 1 | 0 | 0 | 1 |
| 21A | 0 | 1 | 0 | 0 | 1 |
| 21B | 0 | 1 | 0 | 0 | 1 |
| H (harness reds / missing shot) | 0 | 8 | 0 | 0 | 8 |
| **total** | **28** | **88** | **0** | **0** | **116** |

## Controller verdicts — money screens (ผู้คุม A · 16 Oct 14:2x–15:0xZ · opened himself: 01 · 02 · 02b · 05ก/ข/ค · 07 · 12 · 11C · P2.9U/P2.9bU pay states · spot 08)
| frame | shot | verdict | note |
| 01 | p1.3/register-cart4-01-owner-1440x900 | MATCH | ไวยากรณ์ตรงแบบทั้งหมด (หัว · แท็บ · ค้นหา/กำหนดเอง/สแกน · ชิปหมวด · กริด 4 คอลัมน์ · ตะกร้า+แถวสมาชิก+บรรทัด+สรุป+ชำระ · แถบคีย์ลัด) · ต่างเฉพาะข้อมูล QC: ไม่มีหมวด (ชิปเดียว) · ไม่มีคูปอง/สมาชิกในสถานะนี้ · ไม่มี badge ออเดอร์ออนไลน์ · มีสวิตช์ TH/EN + "แจ้งปัญหา" เพิ่ม (P1.18U/HF-418 accepted) |
| 02 | p1.3/register-paydlg-member-points-owner-1440x900 | DEVIATION (ref P1.18 parity row 02: P1.12U Dev 8 · P1.6U V5 · P1.13U Dev 4 · P1.7U Dev 8) | ตรง: ป้ายบิล+ชิปสมาชิก · ยอด+สรุป · บล็อกแต้ม (500 แต้ม → ลด ฿50 · ใช้แล้ว/ยกเลิก) · แถวคูปอง · คงเหลือ · กริดวิธี 2×4 · numpad+ปุ่มด่วน · สวิตช์ใบกำกับเต็มรูป · ย้อนกลับ/ยืนยัน · ต่าง (เดิมจาก P1): ไม่มีแถว "ส่งใบเสร็จ พิมพ์/LINE/อีเมล" ในฟุตเตอร์ (ย้ายไปจอสำเร็จ) · ไทล์ voucher/มัดจำ "ยังไม่เปิดใช้" (ค่าตั้งร้าน QC) · ไม่มีไทล์ลงบิลห้องพัก (ไม่ผูกโรงแรม) · ไม่มีสถานะแยกจ่ายในภาพนี้ (มีใน paydlg-giftcard-split P2.9U) |
| 02b | p1.3/register-sale-done-member-owner-1440x900 | DEVIATION (ref P1.18 parity row 02b: P1.6U R3 V7 · brief P1.18 Q9 · P1.10U Dev) | ตรง: ไอคอน ✓ · "ชำระแล้ว ฿190" · แถบข้อเท็จจริง (เงินทอน · แต้มที่ได้รับ (รวม) · เลขใบเสร็จ · วิธีชำระ) · ปุ่ม พิมพ์ใบเสร็จ/พิมพ์สำเนา/ส่งทาง LINE/ส่งอีเมล/ขายต่อ (อัตโนมัติ 5 วินาที) + toast ผูกสมาชิก · ต่าง (เดิม P1): เป็น modal กลางจอแทนแถบเต็มหน้า · ไม่มีช่อง "ใบกำกับอย่างย่อ"/"บัญชี ลงบัญชีแล้ว" · ไม่มีปุ่ม "แสดง QR ใบเสร็จ" (มี QR บนใบเสร็จสาธารณะ 11C แทน) · ไม่มีของใหม่จาก P2 |
| 05ก | p1.3/register-cart3-owner-390x844 (+ -en) | DEVIATION (ref P1.18 parity row 05ก: P1.18U Dev 1 · P1.2U R2-1) | ตรง 05ก: ชิปหัว (สาขา · กะ · กล้อง · ล็อก) · ค้นหา + "+" · กริด 3 คอลัมน์ · แถบตะกร้าติดล่าง "3 รายการ ฿235 · ชำระ ›" + สรุปชื่อ · badge จำนวนบนไทล์ · (ภาพเต็มหน้า: header เปลือกแอป/แถบตะกร้า fixed โผล่กลางภาพ = artefact ของ full-page capture ไม่ใช่ UI) · en 390 มีแล้วตามมติ 6 |
| 05ข | p1.3/register-paydlg-promptpay-qr-owner-390x844 (+ cashier · -en) | DEVIATION (ref P1.18 parity row 05ข: P1.12U Dev 8 · P1.6U V5 · P1.13U Dev 4 · P1.7U Dev 8) | แผ่นชำระเต็มจอ: ← ชำระเงิน · ยอด ฿235 · ช่องคูปอง (ใหม่ P2.1) · คงเหลือ · กริดวิธี 2 คอลัมน์ (เงินสด · พร้อมเพย์ · โอน · บัตร · voucher/มัดจำ "ยังไม่เปิดใช้" · เครดิตร้าน "ไม่มีสมาชิก") · QR · สวิตช์ใบกำกับ · ยืนยัน ฿235 — ไวยากรณ์ 05ข ครบ · ต่างเดิม: ไม่มีแถว "ใช้แต้ม 500 → −฿50" เพราะไม่มีสมาชิกในสถานะนี้ |
| 05ค | p1.14/stock-count-open-owner-390x844 | DEVIATION (ref P1.18 parity row 05ค: P1.14U Dev 6, 8, R2 R3) | ตรง 05ค: ← ตรวจนับ #12 · pill "นับแล้ว 2/6" · บรรทัดบริบท+แถบความคืบหน้า · ช่องสแกน/ค้นหา+กล้อง · ชิป ทั้งหมด/ยังไม่นับ/มีผลต่าง (มีตัวเลข) · แถว ชื่อ+SKU · "ระบบ n" · ช่องนับ/ปุ่ม "นับ" · ผลต่าง ±สี · หมายเหตุบวกกลับ · พักไว้ก่อน/ยืนยันผลต่าง 2 รายการ · ต่างเดิม: เปลือกแอป+แท็บระบบอยู่เหนือ (Dev 8) · ไม่มี "…" เมนูในแบบ (มีในจริง — เพิ่ม) · ข้อมูล QC มีสต็อกติดลบ (−59) = สภาพข้อมูล ไม่ใช่ UI |
| 07 | p1.9/shifts-current-owner-1440x900 | DEVIATION (ref P1.18 parity row 07 · P1.9U Dev · vis58b) | ตรง 07 ครบ: การ์ดกะ #191 "กำลังเปิด" + เปิดโดย/เงินตั้งต้น/เวลา · สรุป X 5 ตัวเลข · ตาราง "แยกตามวิธีชำระ" (บิล/ยอด/สถานะเงิน) · สูตร "เงินสดที่ควรมีในลิ้นชัก" (ตั้งต้น+รับ−ทอน−คืน+นำเข้า = ควรมี) + แถวนำเงินเข้า · ปิดกะนับเงินจริง 6 แบงก์+เหรียญ · ควรมี/นับได้/ผลต่าง (แดง) · เหตุผล บังคับเมื่อเกิน ฿100 · ปิดกะ+Z / ดู X report / blind toggle · ขวา: กะที่ปิดแล้ว (Z) 4 แถว · การ์ดแดง "เงินสดนอกกะ ฿65" + ดูบิล · เครื่องนี้ · ต่างเดิม (P1 accepted): อยู่ในเปลือกแอป+แท็บระบบ (owner view) แทนเปลือก POS · การ์ด "ส่งสรุปกะ" เป็นบรรทัดเดียว "ส่งสรุปกะทาง LINE จะมาในรอบถัดไป" · มีตัวเลือกสาขา (P2.11) |
| 12 | p1.16/sales-refund-owner-1440x900 (full page: list + drawer + modal) | MATCH | modal "คืนเงินบางส่วน 202610-0628 · ฿430": เลือกรายการ (checkbox · −/+ · "จาก n" · ยอด) · เหตุผล select · "คืนเงินด้วย" ไทล์ (เงินสด จากลิ้นชักกะ #198 — มีไทล์เดียวเพราะบิลจ่ายเงินสดล้วน ไม่มีสมาชิก = ข้อมูล) · กล่องสรุป "คืน ฿85" ✓ คืนสต็อก/ใบลดหนี้/กลับรายการบัญชี · ยกเลิก/ยืนยันคืนเงิน ฿85 · หมายเหตุบันทึกผู้ทำ · หน้า: ตัวกรองวันที่/ค้นหา/สาขา/ช่องทาง/ระบบ/พนักงาน/ส่งออก · ชิปสถานะ (+ "เงินสดนอกกะ 4" แดง · "มัดจำ" ใหม่ P2.9b) · การ์ด 3 ใบ · ชิปช่องทาง (P2.1) · ตาราง · ลิ้นชักบิล (รายการ · ยอด · การชำระ · ลงบัญชีแล้ว · ใบกำกับอย่างย่อ+ขอใบเต็มรูป · ประวัติ · พิมพ์ซ้ำ/ส่ง LINE/ส่งอีเมล/คัดลอกลิงก์ · ยกเลิกบิล/คืนเงิน) — ครบตามแบบ 12 · ต่าง: owner view อยู่ในเปลือกแอป (เดิม) |
| 11C | p2close-rpub/receipt-public-paid-owner-390x844 | MATCH | ตรง 11C: หัวร้าน+สาขา+วันที่ · ป้าย ✓ ชำระแล้ว · การ์ด (เลขใบเสร็จ · ใบกำกับอย่างย่อ · รายการ · ส่วนลด+คูปอง แดง · VAT 7% รวมในราคา · ยอดสุทธิ · วิธีชำระ "เงินสด ฿100 · PromptPay ฿130") · ปุ่ม ขอใบกำกับภาษีเต็มรูป (ดำ) / ดูแต้มของฉัน (1,574) / ให้คะแนนร้าน ★★★★★ / แจ้งปัญหาบิลนี้ · ฟุตเตอร์ "ส่งโดย SHARK · ไม่มีข้อมูลส่วนตัวอื่น" + สวิตช์ ไทย | อังกฤษ (เพิ่มจากแบบ · P1 O8) |
| 02 (P2.9U) | p2.9u/register-paydlg-giftcard-split-owner-1440x900 | MATCH | แยกจ่ายตามแบบ 02: แถว "เงินสด ฿300 ✓ · รับมา ฿300 · ทอน ฿0" + "บัตรของขวัญ GC-••••7296 ฿325 ✓ · คงเหลือ ฿175" (× ลบได้) · คงเหลือ ฿0 · ไทล์ เงินสด "✓ ฿300" · ว่อชเชอร์/บัตรของขวัญ "✓ 1 ใบ" (เลือกอยู่) · มัดจำ "ยังไม่เปิดใช้" · เครดิตร้าน "ไม่มีสมาชิก" · แผงขวา: เลขบัตร (สแกน/พิมพ์) + กล้อง + ค้นหา + numpad · ฟุตเตอร์ สวิตช์ใบกำกับเต็มรูป + **รับทิป** (ใหม่ P2.9U) · ยืนยันรับเงิน ฿625 (F4) |
| 02b (P2.9U) | p2.9u/register-sale-done-giftcard-owner-1440x900 | MATCH (ตามมติ 02b เดิม) | แถบข้อเท็จจริง: เงินทอน ฿0 · เลขใบเสร็จ · "วิธีชำระ" หลายบรรทัด (บัตรของขวัญ GC-••••7296 ฿325 · คงเหลือ ฿175 / เงินสด ฿300) · ปุ่มครบ (ส่งทาง LINE จางเพราะไม่มีสมาชิก) · ขายต่อ (อัตโนมัติ 4 วินาที) |
| 02 (P2.9bU) | p2.9bu/register-paydlg-deposit-split-owner-1440x900 | MATCH | แถวแยกจ่าย "มัดจำ #202610-0688 ฿325 ✓ · คงเหลือ ฿745" · ไทล์ "มัดจำที่ชำระไว้ ✓ 1 ใบ" · แผงขวา ค้นหาเลขมัดจำ → ผลการค้น (#เลข · ชื่อลูกค้า · เบอร์ปิดบางส่วน · คงเหลือ ฿1,070) + numpad · ไม่มีสวิตช์รับทิปในสถานะนี้ (ค่าตั้งปิด) |
| 08 (spot) | p2.12u/reports-hourly-owner-1440x900 · reports-print-overview-owner-1440x900 | DEVIATION (ref pos-P2.12U.md Deviations · P1.17U · P1 O3 ผู้ช่วย AI → เจ้าของแกน) | ตรง 08: การ์ด 5 ใบ (ยอดสุทธิ ▲% · บิล ▲ · เฉลี่ยต่อบิล · กำไรขั้นต้น "— ยังไม่มีต้นทุน" · บิลยกเลิก) · กราฟรายชั่วโมง + คาดการณ์เฉลี่ย 4 สัปดาห์ (บรรทัดอธิบาย) · เปรียบเทียบสาขา (ยอด/บิล/เฉลี่ย/กำไร) · สินค้าขายดี · ช่องทางการขาย (% + หมายเหตุหักค่าคอม) · วิธีชำระ (% + ยอด · มีบัตรของขวัญ/มัดจำ P2.9) · พนักงาน (บิล/ยอด/ส่วนลด/ยกเลิก/หมายเหตุ "ส่วนลดสูงผิดปกติ" · แถว "API: QC P2.13 agent-test …" ตามมติ API-4) · ส่งออก CSV / พิมพ์ PDF · ช่วงวันที่ 2 ปลาย · ต่าง: การ์ด "ลูกค้าสมาชิก" → หมายเหตุ "สมาชิก จะมาในรอบถัดไป" (AN13 สมาชิก half — ครึ่ง UI ยังไม่มา? ตรวจกับ P2.14 AN13) · ไม่มีแผง "ผู้ช่วย AI" (O3) · owner view ในเปลือกแอป · **หน้าพิมพ์** (RPT-6): 5 ตาราง (รายวัน · รายชั่วโมง · ช่องทาง · วิธีชำระ · ต่อพนักงาน) ตัวเลข 2 ตำแหน่ง · 🔸 Low: คอลัมน์ "รหัสผู้ใช้" โชว์ cuid ของคีย์ API (`cmva6dusy…`) แทนรหัสอ่านได้ — candidate U (cosmetic) |

Result: **no new money-screen deviation in P2** — 01/12/11C/P2.9U/P2.9bU = MATCH; 02/02b/05/07 = the same accepted P1 deviations (refs above), nothing added by P2 cards.

## Controller rulings (16 Oct ~15:3xZ) — OPEN → 0
| id | ruling | scope |
|---|---|---|
| O-1 | **fix-now** (U2) — reserved-table card: reservation line must not overlap "ดูการจอง / View booking" (clamp line or move button to a footer row); en panel buttons no wrap/truncate at 1440 | `TablesScreen.tsx` |
| O-2 | **fix-now** (U2) — split EQUAL bill-card title `min-w-0 truncate` at 1024 | `TableSplitDialog.tsx` |
| O-3 | **fix-now** (U2) — ICU plural for every `{count} items/tickets/…` line in `src/messages/en/pos.json` (drafter lists :3895 :4184 :530 :627 :3456 :3494 :3522 …); th untouched | en messages |
| O-4 | **fix-now** (U2) — products header stacks the toolbar under the title below `sm` (same cure as P1 O4) | `ProductsClient.tsx` |
| O-5 | **fix-now** (U2) — top-products card: horizontal scroll container (`relative` + `overflow-x-auto`, as P2.12U F6) so the margin column is reachable at 1440 | `ReportsOverview.tsx` |
| O-6 | **fix-now** (U2) — 15A segmented labels `whitespace-nowrap`; branch-number input wide enough for 5 digits | tax-invoice dialog |
| O-7 | **fix-now** (U2) — RETURN movement label omits the empty segment (no "-") | `StockShortcuts.tsx` (UI-4) |
| O-8 | **fix-now** (U2) — report-kind card range + anomaly date cells use the locale date formatter (BE in th) | `ReportsClient.tsx` / anomaly table |
| O-9 (controller) | **fix-now** (U2) — print report "ยอดต่อพนักงาน" column รหัสผู้ใช้ shows the API key cuid (`cmva6dusy…`); show the same "API: <name>" label as the screen (API-4) or the key's short id | reports print (RPT-6) |
| H1/H2 | **diagnose then fix** (U2) — cashier-only console error `ERR_INTERNET_DISCONNECTED` on the register URL in the `offline` state (owner clean): find the cashier-only fetch fired while offline (tab-badge poll? shift status? mode-tab visibility?) and gate it on the offline flag; if the request is legitimate and unavoidable → CONTROLLER-DECISION before any harness tolerance (no ORACLE-EDIT by the builder) | register (cashier) |
| H3 · H4 | closed by re-shoot (env failure · QC5 residue key deleted by the controller) | — |
| H5 | **harness** (U2) — `register-tab-badge` gets 390 (p2.8u plan) + re-shoot | `visual-pos.mts` |
| Q1 | sticky-shell artefact of the full-page capture = **harness-only, accepted** (as 10 Oct); not a product row | — |
| Q2 | P1 O3 (Thai app shell in en) and O12 (21A approvals page) **carry over** as accepted deviations — owner-core lines stay in `POS-OWNER-PENDING.md` | — |
| Q3 | **fix-now if label** (U2): KDS en renders the CHAT channel through the same label helper as the orders page ("Chat"); if "แชท" is a user-named custom channel in the QC seed → data, accept and note | KDS card |
| Q4 | **fix-now** (U2) — mode tab never shows "เร็ว ๆ นี้" for a live page: when table mode is not visible for the actor/unit, hide the tab (or disabled + real reason) — same spirit as P1 O1 | `RegisterModeTabs.tsx:52` |
| Q5 | coverage by plan **accepted** (UI-10 cashier read-only on settings-payments is where the switches live; en 1024 outside ruling 6) | — |
| Q6 | 05ค judged by the controller (row in §Controller verdicts) — DEVIATION (P1.14U refs), no new issue | — |
| Q7 | QC5 residue = data; **no reseed / no bulk cleanup** (rule); the only cleanup = the revoked agent-test API key (blocked a state) · HANDOVER-P2 carries no images, shots stay as evidence | — |

U2 = one builder fix round (`wip/pos-p2.14-u2` from `session/pos`) → re-shoot only the touched states (`--states --state …` th + en on QC5 after a rebuild of tree d) → gate set → push → rows above get the re-shoot evidence appended (addendum).

## Rows

| frame | state/shot path | size | locale | status | note |
|---|---|---|---|---|---|
| 01 | p1.3/register-{default,cart3,cart4-01,options-popover,line-editor,bill-discount,custom-item,search-empty,weigh,stock-warn,register-tile-*}-{owner,cashier}-1440x900.png · p2.4u/register-register-{table-mode,billtype-menu}-* · p2.6u/register-register-tile-86-* · p2.8u/register-register-tab-badge-* · p2close/register-*-1440x900.png | 1440 | th | MATCH (ผู้คุม — §Controller verdicts) | Register non-pay states th: 111 shots ok (all sizes), 0 console/5xx/overflow, owner + cashier. |
| 01 | same states `-1024x768` (p1.3/register-cart4-01-owner-1024x768.png opened: icon mode tabs, cart + totals ฿675 fit) | 1024 | th | MATCH (ผู้คุม — §Controller verdicts) | Included in the 111 ok above. |
| 01 | same states `-1440x900-en` (p1.3/register-register-en-owner-1440x900-en.png) | 1440 | en | MATCH (ผู้คุม — §Controller verdicts) | Register non-pay en: 74 ok. |
| 02 | p1.3/register-paydlg-{cash,card-edc,promptpay-qr,promptpay-paid,member-points,member-capped,platform}-* · p2.5u/register-split-part-pay-* · p2.4u/tables-tables-checkout-dialog-* · p2.8u/orders-orders-pay-dialog-* | 1440 | th | DEVIATION (ref §Controller verdicts · P1.18 parity rows 02 · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Pay states th 128 ok (all sizes). Fact seen on p1.3/register-paydlg-promptpay-timeout-owner-1440x900.png: numpad last row (00 · 0 · ⌫) sits under the footer at 900 px height (dialog body scrolls). |
| 02 | same `-1024x768` | 1024 | th | DEVIATION (ref §Controller verdicts · P1.18 parity rows 02 · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Included above. |
| 02 | same `-1440x900-en` | 1440 | en | DEVIATION (ref §Controller verdicts · P1.18 parity rows 02 · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Pay states en 82 ok (1440 + 390). |
| 02b | p1.3/register-sale-done{,-member}-*-1440x900.png · p1.10u + p1.18u/settings-paydone-print-*-1440x900.png · p2.9u/register-sale-done-giftcard-* · p2.9bu/register-sale-done-deposit-* | 1440 | th | DEVIATION (ref §Controller verdicts · P1.18 parity rows 02b · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Done states th 18 ok, en 18 ok. |
| 02b | `sale-done*-1024x768` | 1024 | th | DEVIATION (ref §Controller verdicts · P1.18 parity rows 02b · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Included above. |
| 02b | `sale-done*-390x844` | 390 | th | DEVIATION (ref §Controller verdicts · P1.18 parity rows 02b · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Included above. |
| 02b | `sale-done*-1440x900-en` | 1440 | en | DEVIATION (ref §Controller verdicts · P1.18 parity rows 02b · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Included above. |
| 02b | `sale-done*-390x844-en` | 390 | en | DEVIATION (ref §Controller verdicts · P1.18 parity rows 02b · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Included above. |
| 05ก | p1.3/register-*-390x844.png (+ p2close/register-*-390x844.png) · p1.3/register-held-drawer-owner-390x844.png opened | 390 | th | DEVIATION (ref §Controller verdicts · P1.18 parity rows 05ก · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Register 390 th: 101 ok + 1 red (`offline` cashier → row H1). |
| 05ก | p1.3/register-*-390x844-en.png | 390 | en | DEVIATION (ref §Controller verdicts · P1.18 parity rows 05ก · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Register 390 en: 101 ok + 1 red (`offline` cashier en → row H2). |
| 05ข | p1.3/register-paydlg-*-390x844.png · p2.9u/p2.9bu paydlg-*-390x844.png | 390 | th | DEVIATION (ref §Controller verdicts · P1.18 parity rows 05ข · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Included in the 02 counts. |
| 05ข | same `-390x844-en` | 390 | en | DEVIATION (ref §Controller verdicts · P1.18 parity rows 05ข · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Included in the 02 counts. |
| 05ค | p1.14/stock-count-{open,confirm}-*-390x844.png | 390 | th | DEVIATION (ref §Controller verdicts · P1.18 parity rows 05ค · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | stock-count th 12 ok (owner; cashier = refusal card). Listed CTRL because the addendum names "05"; 05ค is not a money screen — see Q6. |
| 05ค | — (stock not in EN_MOBILE_PAGES) | 390 | en | DEVIATION (ref §Controller verdicts · P1.18 parity rows 05ค · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | en stock-count = 1440 only (4 ok). |
| 07 | p1.9/shifts-{current,close,z,noshift}-{owner,cashier}-1440x900.png · p2close/shifts-* | 1440 | th | DEVIATION (ref §Controller verdicts · P1.18 parity rows 07 · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | p1.9: 8 ok per size (th 1440/1024/390 + en 1440). |
| 07 | same `-1024x768` | 1024 | th | DEVIATION (ref §Controller verdicts · P1.18 parity rows 07 · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | 8 ok. |
| 07 | same `-390x844` | 390 | th | DEVIATION (ref §Controller verdicts · P1.18 parity rows 07 · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | 8 ok. |
| 07 | same `-1440x900-en` | 1440 | en | DEVIATION (ref §Controller verdicts · P1.18 parity rows 07 · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | 8 ok. |
| 07 | — | 390 | en | DEVIATION (ref §Controller verdicts · P1.18 parity rows 07 · มติ P1 เดิม · ไม่มีของใหม่จาก P2) | Not shot (ruling 6: shifts not in EN_MOBILE_PAGES). |
| 12 | p1.16/sales-bills-*-1440x900.png · p2.12u/sales-bills-{all-branches,drawer-channel-refund}-* · p2.9u/sales-refund-to-card-* · p2.9bu/sales-{bills-deposit-filter,refund-deposit}-* · p2close/sales-* | 1440 | th | MATCH (ผู้คุม — §Controller verdicts) | Bills th 90 ok / en 60 ok (p1.16: 20 per size). Fact seen behind the 21B modal (p1.3/register-approval-wait-owner-1440x900.png): with the drawer open the staff column wraps one word per line ("เจ้าของ / ร้าน / กาแฟ / (POS / QC)"). |
| 12 | same `-1024x768` | 1024 | th | MATCH (ผู้คุม — §Controller verdicts) | Included above. |
| 12 | same `-390x844` | 390 | th | MATCH (ผู้คุม — §Controller verdicts) | Included above. |
| 12 | same `-1440x900-en` | 1440 | en | MATCH (ผู้คุม — §Controller verdicts) | Included above. |
| 12 | same `-390x844-en` | 390 | en | MATCH (ผู้คุม — §Controller verdicts) | Included above. |
| 11C | p2close-rpub/receipt-public-rpub-{paid,refunded-partial,voided,not-found,issue-sent,taxinvoice-form}-owner-1440x900.png · p2close/receipt-public-paid-* | 1440 | th | MATCH (ผู้คุม — §Controller verdicts) | rpub th 5 ok per desktop size + 6 at 390; en same (5/5/6); p2close receipt-public owner + cashier ok. |
| 11C | same `-1024x768` | 1024 | th | MATCH (ผู้คุม — §Controller verdicts) | ok. |
| 11C | same `-390x844` | 390 | th | MATCH (ผู้คุม — §Controller verdicts) | ok. |
| 11C | same `-1440x900-en` (+ 1024 en) | 1440 | en | MATCH (ผู้คุม — §Controller verdicts) | ok. |
| 11C | same `-390x844-en` | 390 | en | MATCH (ผู้คุม — §Controller verdicts) | ok. |
| P2.9U/P2.9bU pay | p2.9u/register-paydlg-{giftcard-entry,giftcard-split,giftcard-pin-error,giftcard-insufficient,giftcard-changed,storecredit,tip}-* · p2.9bu/register-{deposit-receive,paydlg-deposit-*}-* · p2.9u/settings-settings-tip-ledger-* · p2.9bu/settings-settings-deposit-toggle-* | 1440 | th | MATCH (ผู้คุม — §Controller verdicts) | p2.9u th 20 ok @1440 · 18 @1024 · 18 @390; p2.9bu th 14/12/12. UI-10 seen on p1.18u/settings-payments-cashier-1440x900.png: tip + deposit cards = "เฉพาะเจ้าของร้านตั้งค่า…ได้" (no switches). p2.9bu cashier settings/sales runs plan 0 shots (no cashier deposit-toggle shot — Q5). |
| P2.9U/P2.9bU pay | same `-1024x768` | 1024 | th | MATCH (ผู้คุม — §Controller verdicts) | See above. |
| P2.9U/P2.9bU pay | same `-390x844` | 390 | th | MATCH (ผู้คุม — §Controller verdicts) | See above. |
| P2.9U/P2.9bU pay | same `-1440x900-en` | 1440 | en | MATCH (ผู้คุม — §Controller verdicts) | p2.9u en 20 ok (owner en **from the re-shoot**: main run rc 2, 0 shots → row H3) · p2.9bu en 14 ok. |
| P2.9U/P2.9bU pay | same `-390x844-en` | 390 | en | MATCH (ผู้คุม — §Controller verdicts) | p2.9u en 16 ok (owner part from the re-shoot) · p2.9bu en 11 ok. |
| 03 | p2.4u/tables-panel-rounds-owner-1440x900.png (+ tables-floor) | 1440 | th | DEVIATION (ref pos-P2.4U-review.md "Controller vis64/vis65" — walk-in queue = เร็ว ๆ นี้, member line/service charge/NEEDS_CLEARING follow-ups; pos-P2.4U.md Deviations 4–5) | Zone tabs + counts, stat line ("ใช้อยู่ 7 จาก 13 โต๊ะ · ยอดบนโต๊ะตอนนี้ ฿1,195"), 5 card states + "ยังไม่ส่งครัว 2 รายการ", reserved card, legend, panel (rounds, "เสิร์ฟแล้วอีก 3 รายการ" collapse, totals ฿565, 5 actions, black เช็คบิล), alerts below the panel (V1 fix holds). Extra "QR ของโต๊ะ" + "พิมพ์ QR ทุกโต๊ะ" (P2.7U). |
| 03 | p2.4u/tables-panel-rounds-owner-1024x768.png | 1024 | th | DEVIATION (ref as 1440) | Panel = right sheet over the floor (vis65); unit chip truncates "ร้านกาแ…". |
| 03 | p2.4u/tables-floor-owner-390x844.png | 390 | th | DEVIATION → U2 O-1 (ruling 16 Oct · fix-now) | Alerts on top, 2-col cards, legend wraps. **W9 reserved card: the line "กันโต๊ะ 20:26" runs into the "ดูการจอง" button** (text overlaps the button's top edge). |
| 03 | p2.4u/tables-panel-rounds-owner-1440x900-en.png | 1440 | en | DEVIATION → U2 O-1 (ruling 16 Oct · fix-now) | English complete (zone names = data). **A9 reserved card: "Held from 20:28" is drawn over the "View booking" button**; panel buttons "Order more" wraps to 2 lines and "Merge tab…" truncates. |
| 03 | — | 390 | en | DEVIATION (ref pos-brief-P2.14.md §10 ruling 6) | tables not in EN_MOBILE_PAGES. |
| 15B/15C | p2.5u/tables-split-items-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P2.5U.md Deviations 2, 4, 7, 8) | Tabs รายรายการ/หารเท่า/ตามที่นั่ง, item list with bill toggles + "บิล 1 x3 · บิล 2 x1" split chips, bill cards ฿742.50 / ฿621.50 incl. 10 % service, footer note + ยกเลิกการแยกบิล/ชำระทีละใบ/ชำระบิล 1. Per-card "สะสมแต้ม/+สมาชิก" + "ใบรายการ" buttons = Deviations 2/4; satang amounts = allocator (mockup rounds to baht). |
| 15B/15C | p2.5u/tables-split-equal-owner-1024x768.png | 1024 | th | DEVIATION → U2 O-2 (ruling 16 Oct · fix-now) | "4 คน × ฿341" + stepper + 4 bill cards = 15C. **Bill 1 card title "บิล 1 · สมใจ ลูกค้าประจำ (POS QC)" runs past the card's right border** (overlaps the gap to card 2). |
| 15B/15C | p2.5u/tables-split-seat-owner-390x844.png | 390 | th | DEVIATION (ref pos-P2.5U.md Deviations 7; 15 has no 390 frame) | Full-width sheet, seat segmented 1–4 + กลางโต๊ะ, split chips, sticky footer with pay buttons. |
| 15B/15C | p2.5u/tables-split-items-owner-1440x900-en.png | 1440 | en | DEVIATION (ref as 1440 th) | "Split bill · Table V2", "By item / Split equally / By seat", "incl. 10% service charge", "Pay bill by bill"; no keys. |
| 15B/15C | — | 390 | en | DEVIATION (ref ruling 6) | tables not in EN_MOBILE_PAGES. |
| 04 | p2.6u/kds-mixed-owner-1440x900.png | 1440 | th | MATCH | Station tabs + counts, avg/target, pause switch, print ticket; 3 columns ใหม่/กำลังทำ/พร้อมเสิร์ฟ, black late ticket "เลยเป้า 1 นาที" + "เร่ง", strike-through done line, "เสร็จ 1/2", served-today recall card, footer ค้างทำวันนี้ + ของหมด (86) + แจ้งของหมด. |
| 04 | p2.6u/kds-mixed-owner-1024x768.png | 1024 | th | MATCH | Same grammar; header controls wrap to a second row. |
| 04 | p2.6u/kds-mixed-owner-390x844.png | 390 | th | MATCH | Station select, column segmented control (ใหม่ 1/กำลังทำ 3/พร้อมเสิร์ฟ 2), footer "ค้าง 7 · หมด 1 ›". |
| 04 | p2.6u/kds-expo-owner-1440x900-en.png | 1440 | en | DEVIATION → U2 O-3 (ruling 16 Oct · fix-now) | Expo grid, "Pause kitchen orders", "Mark sold out". **"Served today 1 tickets"** (no plural form). Channel label "แชท" shows in Thai inside "last #156 · แชท · 20:51" (data label or untranslated channel — Q3). |
| 04 | p2.6u/kds-mixed-owner-390x844-en.png | 390 | en | MATCH | "New 1 / Cooking 3 / Ready 2", "Done", "Pending 7 · Sold out 1". |
| 06 | p2.2u/products-drawer-prices-owner-1440x900.png (+ p2close/products-owner-1440x900.png) | 1440 | th | DEVIATION (ref pos-P2.2U.md Deviations 1–6 + pos-P2.2U-review.md "11. Deviations (accepted)"; module shell = pos-P1.18-parity.md 07 deviation (1) / O3) | Stat row (7 · 0 · หมด 1 · 0 · 3), search/category/branch filters, chips, table with ราคาสาขา/stock columns, drawer ราคาตามช่องทาง grid per branch + โปรราคา callout + บันทึก/ทำสำเนา/เก็บถาวร. Page lives in the module shell (legacy tabs ภาพรวม…ตั้งค่า), not the POS mode-tab shell of 06. Sticky-shell capture artifact cuts the title (Q1). |
| 06 | p2.11u/products-branch-compare-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-P2.11U-review.md R5 — sticky product column + overflow-auto) | "ขายที่ 2 สาขา" compare dialog, branch × channel matrix scrolls sideways (bold = set price). Page table behind shows "สาขา" chip on ลาเต้ร้อน ฿55. |
| 06 | p2.3u/products-recipe-view-owner-390x844.png | 390 | th | DEVIATION → U2 O-4 (ruling 16 Oct · fix-now) | Recipe drawer (สูตรพื้นฐาน/ขนาด S/M/L, BOM rows, ต้นทุน ฿23.20 · กำไรขั้นต้น 69%) = 06 grammar. **Page header: "สินค้าและเมนู" + subtitle squeezed into a ~40 px column, one word per line, beside the two toolbar buttons** (same pattern as P1 O4). |
| 06 | p2.2u/products-matrix-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-P2.2U.md Deviations 4) | "Products & menu", "Price promotions / Happy hour", "Prices differ by channel 3", "Shop price", "Not stocked", "On sale"; channel chips "สั่งออ"/"โทรสั่" = custom channel names cut to 6 chars (data, Deviation 4). |
| 06 | — | 390 | en | DEVIATION (ref ruling 6) | products not in EN_MOBILE_PAGES. |
| 08 | p2.12u/reports-hourly-owner-1440x900.png | 1440 | th | DEVIATION → U2 O-5 (ruling 16 Oct · fix-now) | KPI ×5 (฿30,754.50 ▲74 %), hourly chart with peak/this-hour/forecast legend, branch comparison, channels, payment methods, staff with "ส่วนลดสูงผิดปกติ" flags = 08 (+P2.12U). **Top-products card: a 4th column is cut at the card's right edge** (no visible scroll cue). Sticky-shell artifact hides the kind pills (Q1). |
| 08 | p2.12u/reports-branches-tab-owner-1024x768.png | 1024 | th | DEVIATION → U2 O-8 (ruling 16 Oct · fix-now) | Branch table (บิล · ยอดขายสุทธิ · เฉลี่ย · ใบคืนเงิน · ยอดคืนเงิน · บิลยกเลิก) fits. **Card subtitle "2026-10-10 – 2026-10-16" is ISO, not BE** (date picker above shows "10 ต.ค. 2569"). |
| 08 | p2.12u/reports-anomalies-owner-390x844.png | 390 | th | DEVIATION → U2 O-8 (ruling 16 Oct · fix-now) | A1…A10 groups with thresholds, tables scroll inside cards (vis85 fix holds). **Header range and every date cell are ISO ("2026-10-16")** in th. |
| 08 | p2.12u/reports-staff-flag-owner-1440x900-en.png | 1440 | en | DEVIATION → U2 O-5 (ruling 16 Oct · fix-now) | English complete ("Sales overview", "Hourly sales", "Forecast (4-week average)", "Unusually high discount", "Members are coming in a later release"). **Top products: "Ma(rgin)" column header clipped at the card edge.** "Data up to 2…" truncation = P1.17U R6 V4. |
| 08 | — | 390 | en | DEVIATION (ref ruling 6) | reports not in EN_MOBILE_PAGES. |
| 09 | p2.8u/orders-detail-platform-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P2.8U.md Deviations 2–13; rider/"แจ้ง LINE MAN" chips = เร็ว ๆ นี้ as built) | Channel rail + counts, auto-accept switches, prep time, 4 columns with countdown "ต้องรับใน 0:00", late cards, ready "ส่งมอบแล้ว", done list, detail (commission −฿57 → รับจริง ฿133, "เมื่อกดรับออเดอร์ ระบบจะ", customer, activity) = 09. "เลยเวลาเตรียม 849 นาที" = P2.13 agent-test order residue (P213-PHONE-001, data). |
| 09 | p2.8u/orders-mixed-owner-1024x768.png | 1024 | th | DEVIATION (ref as 1440) | Icon mode tabs + badge 3; chips truncate with "…". |
| 09 | p2.8u/orders-mixed-owner-390x844.png | 390 | th | DEVIATION (ref pos-P2.7U.md fix1 IMG-3 · pos-P2.8U.md Deviations 6) | Channel select, column segmented control, cards, rail settings below the board (no interleave). |
| 09 | p2.8u/orders-mixed-owner-1440x900-en.png | 1440 | en | DEVIATION → U2 O-3 (ruling 16 Oct · fix-now) | English complete ("Accept within 1:02", "Prep late by 1 min", "Pay on pickup", "When you accept, the system will"); short card button "Accept" (UI-7). **"1 items · ฿130"** (no plural form). |
| 09 | — | 390 | en | DEVIATION (ref ruling 6) | orders not in EN_MOBILE_PAGES. |
| qr-public (/q) | — (not shot at 1440) | 1440 | th | DEVIATION (ref pos-brief-P2.7.md ruling 15 · `visual-pos.mts:742`, `:971` — qr-public = 390 + 1024) | — |
| qr-public (/q) | p2.7/qr-public-table-bill-owner-1024x768.png | 1024 | th | MATCH (vs pos-spec-P2.7-qr-ui.md — no mockup, ruling 15) | Menu grid left, cart + rounds (status chips) + เรียกพนักงาน/ขอเช็คบิล + table bill ฿310 + PromptPay QR + "โอนแล้ว แจ้งร้าน" right. |
| qr-public (/q) | p2.7/qr-public-table-menu-owner-390x844.png | 390 | th | MATCH (vs spec) | Header shop/branch + "โต๊ะ QQ1" + ไทย/อังกฤษ, tabs เมนู/สั่งแล้ว/บิล, large + buttons, footer line. |
| qr-public (/q) | — (not shot at 1440; 1024 en shot) | 1440 | en | DEVIATION (ref ruling 15 as above) | — |
| qr-public (/q) | p2.7/qr-public-pre-pay-owner-390x844-en.png | 390 | en | MATCH (vs spec) | "Scan to pay with PromptPay", steps Pay/Accepted/Preparing/Ready, ฿125, "Pay within 13:28 (by 22:16)", "I have paid". |
| 10 | p2.13/settings-shark-api-keys-empty-owner-1440x900.png (**re-shoot**) | 1440 | th | DEVIATION (ref pos-P1.18U.md Deviations 10–12 · pos-brief-P1.18.md CD3 · vis59 O4; API card per pos-P2.13.md) | "เชื่อมอยู่ 5 จาก 13 ระบบ" + "มีงานค้าง 17" + history; 13 cards 3-col; channels + payments blocks; "คีย์ API ของระบบขายหน้าร้าน" empty card ("ยังไม่มีคีย์ API" · สร้างคีย์ · อ่านคู่มือ) = expected empty state after the re-shoot. |
| 10 | p1.18u/settings-shark-owner-1024x768.png | 1024 | th | DEVIATION (ref as 1440) | Header stacks chip + history under the title (O4 fix holds); cards 2-col; API card lists the then-present agent-test key (main run, before the delete). |
| 10 | p2.13/settings-shark-api-keys-list-owner-390x844.png (+ p2.13/developers-pos-owner-390x844.png, 21,042 px — not visually checked) | 390 | th | DEVIATION (ref as 1440) | One column; full page 10,874 px, only layout checkable at this scale. developers-pos 390: harness overflow false at 390 (UI-6 `overflow-x-auto`, `src/app/developers/pos/page.tsx:81, :124`). |
| 10 | p2close-en/settings-owner-1440x900-en.png | 1440 | en | DEVIATION (ref as 1440 th) | Settings General in English (Register / Shifts and drawer / Reports / anomaly thresholds A1–A10 / Branch stock / Branch PromptPay / App language); no keys. |
| 10 | — | 390 | en | DEVIATION (ref ruling 6) | settings not in EN_MOBILE_PAGES. |
| 11A | p2.10/display-paying-promptpay-owner-1280x800.png | 1280 | th | MATCH | Shop + branch · device, "สวัสดีคุณสมชาย · Gold · 1,240 แต้ม", lines with options and −฿10, totals, ฿625 + "ชำระแล้ว ฿300 · คงเหลือ ฿325", QR + "สแกนเพื่อจ่ายด้วย PromptPay", stamp row 7/10 = 11A. |
| 11A | p2.10/display-member-stamps-owner-1024x768.png | 1024 | th | MATCH | Same layout; "ใกล้ได้รางวัล! ดวงที่ 8/10". |
| 11A | — (display shot at 1280 + 1024 only) | 390 | th | DEVIATION (ref pos-P2.10.md `--state` list: display = 1280×800 + 1024×768) | — |
| 11A | p2.10/display-cart-owner-1280x800-en.png | 1280 | en | MATCH | "Total due", "Subtotal / Item discounts / Coupon WELCOME50", "฿10 off", "Full screen". |
| 11A | — | 390 | en | DEVIATION (ref pos-P2.10.md as above) | — |
| 11B | p1.18u/settings-receipt-owner-1440x900.png (not re-opened) | 1440 | th | DEVIATION (ref pos-P1.18-parity.md 11B rows) | Harness green; no P2 change to the 80 mm preview found in this sweep. |
| 13A/13B | p1.3/register-lock-screen-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.18-parity.md 13B rows · vis59 O5) | PIN pad, "ใครกำลังใช้เครื่องนี้" staff cards + "ใช้งานอยู่", สลับพนักงาน, held card ฿180, footer auto-lock note. |
| 13A/13B | p1.3/register-{lock-screen,lock-screen-scroll,lock-pin-locked,staff-switch}-* 1024/390 th + en (not re-opened) | 1024 · 390 · en | th/en | DEVIATION (ref pos-P1.18-parity.md 13A/13B rows) | Harness ok in every size/locale. |
| 14A | p1.3/register-member-panel-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.18-parity.md 14A rows) | Search "089 · พบ 1 รายชื่อ", result row with tier + points, 20-second sign-up form (phone/name/birthday/PDPA/source chips) = 14A. |
| 14A | p1.3/register-member-{panel,register,attached}-* other sizes/en (not re-opened) | 1024 · 390 · en | th/en | DEVIATION (ref as above) | Harness ok. |
| 14B | p1.3/register-held-drawer-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.18-parity.md vis59 O6 · pos-brief-P2.14.md UI-3 = OWNER/P3) | Bottom sheet "บิลที่พัก (4) ทั้งสาขา", cards name/฿/lines/time/staff + เรียกคืน/ทิ้ง; no "เครื่องนี้" chip (UI-3). Sticky-header capture artifact above the sheet (Q1). |
| 14B | p1.3/register-held-drawer-* 1440/1024/en (not re-opened) | 1440 · 1024 · en | th/en | DEVIATION (ref as above) | Harness ok. |
| 15A | p1.3/register-taxinvoice-dialog-owner-1440x900.png | 1440 | th | DEVIATION → U2 O-6 (ruling 16 Oct · fix-now) | Person/company switch, tax ID + DBD search, buyer, address, branch (สำนักงานใหญ่/สาขาที่), e-Tax email, accounting note, ยกเลิก/บันทึกและกลับไปชำระ = 15A. **"บุคคล ธรรมดา" tab label wraps to two lines** and the "สาขาที่ __" option is cramped (mockup: one line each). |
| 15A | p1.3/register-taxinvoice-{dialog,set}-* other sizes/en (not re-opened) | 1024 · 390 · en | th/en | DEVIATION (ref pos-P1.18-parity.md 15A rows) | Harness ok. |
| 16 | p1.14/stock-default-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.14U.md Deviations 6, 8 · pos-P2.14.md D9) | Tabs ตรวจนับ/รับของเข้า/โอน/ปรับสต็อก/ประวัติ, receive card, transfer note, adjust card, history with UI-4 label "ตัดตามสูตร ครัวซองต์เนยสด · … · บิล 20…". Shared-inventory note "คลังร่วมกับสาขา สาขาอารีย์". |
| 16 | p1.14/stock-adjust-owner-390x844.png | 390 | th | DEVIATION (ref as 1440) | Adjust card "-59 → -61", reason, location, history; open count "ตรวจนับ #12 · กำลังนับ" = QC residue. Sticky-header capture artifact (Q1). |
| 16 | p2.11u/stock-shared-inventory-manager-1440x900-en.png | 1440 | en | DEVIATION → U2 O-7 (ruling 16 Oct · fix-now) | English complete ("Receive stock", "Used by recipe", "Returned from bill"). **Return rows read "… · คลังหลัก · - · bill 202610-0668"** — an empty field rendered as "-" between location and bill. |
| 16 | p1.14/stock-*-1024x768 + en 390 (not re-opened / not shot) | 1024 · 390 en | th/en | DEVIATION (ref pos-P1.18-parity.md 16 rows · ruling 6) | Harness ok at 1024; en 390 not shot (ruling 6). |
| 17 | p1.18u/settings-devices-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.18-parity.md vis59 O7) | 3 ACTIVE devices + dashed register card + collapsed "เพิกถอนแล้ว (212)" (QC residue, was 97 on 10 Oct); right panel 17B + kitchen slip (ไม่พิมพ์/พิมพ์หลังขาย/LAN เร็ว ๆ นี้ — P2.6U Deviations 10) + customer-display block (P2.10). |
| 17 | p1.18u/settings-staff-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.18-parity.md 17C rows) | Role matrix scrolls sideways, approval policy, staff + PIN, HR import "เร็ว ๆ นี้ · P3.5". |
| 17 | p1.18u/settings-payments-cashier-1440x900.png | 1440 | th | DEVIATION (ref pos-P2.14.md UI-10 · pos-P1.18-parity.md 17A rows) | Cashier: "เฉพาะผู้จัดการแก้ได้", tip/deposit = owner-only notes, no switches (UI-10 fixed). |
| 17 | settings-receipt/devices/staff en 1440 (not re-opened) | 1440 | en | DEVIATION (ref pos-P1.18-parity.md 17A–C rows) | Harness ok. |
| 18 | — (onboarding not built) | — | — | DEVIATION (ref pos-P1.18-parity.md ruling O10: CSV import / sample set = onboarding card 18, later) | — |
| 19 | p1.3/register-paydlg-promptpay-timeout-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P2.14.md D6 · UI-1) | 19ค red card "ยังไม่ได้รับเงิน PromptPay · QR หมดอายุ" + สร้าง QR ใหม่ + เลือกวิธีอื่น + hint + "อ้างอิง LMIPCUTF". |
| 19 | p1.18u/settings-paydone-print-failed-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.18-parity.md vis59 O11 · pos-P2.14.md UI-1) | Print-failed = bottom toast "พิมพ์ไม่สำเร็จ — …" + พิมพ์ซ้ำ + พิมพ์ผ่านระบบแทน over the done sheet. |
| 19 | p1.3/register-offline-cashier-1440x900.png | 1440 | th | DEVIATION → U2 H1/H2 (ruling 16 Oct · diagnose + fix) | 19ง offline bar "ออฟไลน์ตั้งแต่ 19:43 — ขายต่อได้เมื่อกลับมาออนไลน์", pay disabled with red note. Harness red (console `ERR_INTERNET_DISCONNECTED`, cashier only). Cashier mode tab shows "โต๊ะ · เร็ว ๆ นี้" (table mode not visible for this actor/unit — `RegisterModeTabs.tsx:20,52`, P2.4U ruling 1 keeps the chip) — Q4. |
| 19 | p1.3/register-register-empty-catalogue-* · search-empty · stock-warn (not re-opened) | 1440 · 1024 · 390 · en | th/en | DEVIATION (ref pos-P1.18-parity.md 19ก/19ฉ rows · O10) | Harness ok. |
| 20A | p1.3/register-cart4-01-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-P1.18-parity.md 20A rows + vis59 verdict) | iPad: icon mode tabs, grid 3-col, cart + totals + ชำระเงิน ฿675 visible without scrolling the cart. |
| 20B | p1.3/register-register-en-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-P1.18-parity.md O3 — app shell Thai, owner line) | "Sale/Tables/Online orders…", "Custom item", "Scan with camera", "New bill · Takeaway", "Held bills", "Shortcuts F2 Search…"; Thai product/device names = data. |
| 21A | — (`/app/approvals` outside POS_PAGES) | 390 | th | DEVIATION (ref pos-P1.18-parity.md O12 "accept for P1" + POS-OWNER-PENDING line) | Not shot; see Q2 (does the P1 acceptance carry to P2?). |
| 21B | p1.3/register-approval-wait-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.18-parity.md 21B rows) | Modal "รอผู้จัดการอนุมัติ": request line ฿190 + reason, approver card "ส่งแล้ว", spinner + 4:58, PIN pad + "ใส่ PIN ผู้จัดการที่เครื่องนี้", ยกเลิกคำขอ = 21B. |
| H | p1.3-register-cashier-th-register.log → p1.3/register-offline-cashier-{1440x900,1024x768,390x844}.png | 1440 · 1024 · 390 | th | DEVIATION → U2 H1 (ruling 16 Oct · diagnose + fix) | rc 1 · 101 shots / 98 ok / 3 failed: `❌ register/offline … HTTP 200 (คาด record) · console error 1: Failed to load resource: net::ERR_INTERNET_DISCONNECTED @ /app/sys/posqc-coffee-sys-pos/pos/register?unit=posqc-coffee-unit-silom`. Owner offline passes. |
| H | p1.3-register-cashier-en-register.log → p1.3/register-offline-cashier-{1440x900,390x844}-en.png | 1440 · 390 | en | DEVIATION → U2 H2 (same) | rc 1 · 70 / 68 ok / 2 failed — same console error line. |
| H | p2.9u-register-owner-en-register.log | — | en | DEVIATION → closed by re-shoot (env · 15/15 ok) | rc 2 · 0 shots: `❌ ผิดพลาดกลางคัน — Error: Failed to launch the browser process: Code: 1` (snap chromium `update.go:193 cannot change mount namespace … permission denied`). Re-shoot rc 0, 15/15 ok. |
| H | p2.13-api-owner-th-settings.log → settings-shark-api-keys-empty ×3 | 1440 · 1024 · 390 | th | DEVIATION → closed by re-shoot (QC5 residue key deleted · green) | rc 1 · 18 / 15 ok / 3 failed: `ขั้นตอนพัง: ระบบ POS ร้าน QC มีคีย์อยู่แล้ว 1 ใบ — ภาพการ์ดว่างถ่ายไม่ได้` (QC5 residue key). Re-shoot after delete: rc 0, 3/3 ok. |
| H | p2.13-api-owner-en-settings.log | 1440 | en | DEVIATION → closed by re-shoot (QC5 residue key deleted · green) | rc 1 · 6 / 5 ok / 1 failed (same). Re-shoot rc 0, 1/1. |
| H | p2.13-api-manager-th-settings.log | 1440 · 1024 · 390 | th | DEVIATION → closed by re-shoot (QC5 residue key deleted · green) | rc 1 · 18 / 15 ok / 3 failed (same). Re-shoot rc 0, 3/3. |
| H | p2.13-api-manager-en-settings.log | 1440 | en | DEVIATION → closed by re-shoot (QC5 residue key deleted · green) | rc 1 · 6 / 5 ok / 1 failed (same). Re-shoot rc 0, 1/1. |
| H | — `register-tab-badge` @390 | 390 | th | DEVIATION → U2 H5 (harness: add 390 to register-tab-badge + re-shoot) | Missing shot: the P2.14 builder's `--state` list (`pos-P2.14.md` §7, UI-13) asks for `register-tab-badge @390`; the sweep shot it at 1440/1024 only (p2.8u, owner + cashier). UI-13 mobile orders button unverified by image. |

## Harness reds
- **H1** p1.3 register **cashier th** `offline` ×3 (1440/1024/390): console error `net::ERR_INTERNET_DISCONNECTED` on the register URL (expected "record"; HTTP 200). Owner `offline` is green.
- **H2** p1.3 register **cashier en** `offline` ×2 (1440/390): same.
- **H3** p2.9u register **owner en**: chromium launch failure (rc 2, 0 shots) — environment, re-shot green (15/15).
- **H4** p2.13 settings `settings-shark-api-keys-empty` owner/manager × th/en (8 shots, 4 runs): QC5 residue key (agent-test key of 15 Oct) — controller deleted it, re-shoot green 8/8.
- **H5** missing `register-tab-badge` @390 (UI-13).
- No other run has a failed shot, console error, 5xx or overflow; 16 runs took 0 shots by plan.

## Candidate fix-now items (OPEN rows I believe are product defects)
- **O-1 Reserved table card text over its button** (03: 390 th W9, 1440 en A9) — `src/components/pos/tables/TablesScreen.tsx` reserved card: give the reservation line a line clamp / reserve space above the "ดูการจอง / View booking" button (or move the button into the card footer row). Same file: en panel buttons "Order more" wraps / "Merge tab…" truncates — shorter en keys or allow 2-line labels evenly.
- **O-2 Split-bill EQUAL card title overflow** (15C 1024 th) — split modal bill card title needs `min-w-0 truncate` (or wrap) inside the card (`src/components/pos/tables/TableSplitDialog.tsx`).
- **O-3 en plurals** — `src/messages/en/pos.json:3895` `"{count} items · <b>{amount}</b>"` ("1 items", 09) and `:4184` `"Served today {count} tickets"` ("1 tickets", 04): ICU `{count, plural, one {# item} other {# items}}` (the file already uses `plural` 7 times); same pattern at `:530`, `:627`, `:3456`, `:3494`, `:3522`, `:3598`, `:3650`.
- **O-4 Products header at 390** (06) — title + subtitle squeezed beside the toolbar buttons, one word per line: stack the toolbar under the title below `sm` (same fix as P1 O4 on the SHARK-connections header) in the products page header (`src/app/app/sys/[id]/pos/products/ProductsClient.tsx`).
- **O-5 Top-products card cuts its last column** (08 1440 th + en "Ma…") — the report overview's top-products table needs the scroll container used for the anomaly tables (`relative` + `overflow-x-auto`, P2.12U F6) or drop/narrow the margin column at this card width (`ReportsOverview.tsx`).
- **O-6 Tax-invoice dialog type switch** (15A 1440 th) — "บุคคล ธรรมดา" wraps and "สาขาที่ __" is cramped: `whitespace-nowrap` on the segmented labels / wider branch input.
- **O-7 Stock history return rows show "-"** (16 en "… · คลังหลัก · - · bill 202610-0668") — the UI-4 label for `RETURN` (refund) movements renders an empty line name as "-": omit the segment when absent (`StockShortcuts.tsx`, UI-4 commit `05b70812`).
- **O-8 ISO dates on th report-kind cards** (08 branches tab 1024, anomalies 390: "2026-10-10 – 2026-10-16", date cells "2026-10-16") — format the range/date strings with the th/en date formatter (BE in th) in the report-kind card header and anomaly rows (`ReportsClient.tsx` / anomaly table); the same S-provided ISO strings probably appear on the other kind cards.
- (Harness, not product) **H5** add `register-tab-badge` at 390 to the p2.8u register plan (or `--state register-tab-badge` at 390) and re-shoot.

## Questions for the controller
- **Q1 Sticky-shell capture artifact**: on the module-shell pages (products, reports, stock, settings, bills, held drawer at 390) the full-page capture draws the sticky app top bar + sidebar part-way down the image whenever the state scrolled (e.g. p2.2u/products-drawer-prices-owner-1440x900.png, p2.12u/reports-hourly-owner-1440x900.png, p1.14/stock-adjust-owner-390x844.png). It hides content (kind pills, page titles) and was already present on 10 Oct (p22u). Treat as harness-only (scroll to top before `fullPage`) or accept?
- **Q2 "Accept for P1" rulings at the P2 close**: O3 (app shell Thai in en) and O12 (21A approvals page outside POS_PAGES) were accepted "for P1" with owner lines. I marked 20B/21A rows DEVIATION on those lines — do they carry to P2, or should they be OPEN?
- **Q3 KDS en "แชท"**: "last #156 · แชท · 20:51" in en — is "แชท" the stored channel name (data) or the CHAT channel's untranslated label? (The orders page in en shows "Chat" for the same channel.)
- **Q4 Mode tab "โต๊ะ · เร็ว ๆ นี้"** on the cashier register (19ง shot): `RegisterModeTabs.tsx:52` falls back to the old "soon" chip whenever table mode is not visible for the actor/unit (P2.4U ruling 1). The tables page is live; P1 O1 ruled a stale "soon" tab fix-now. Keep, hide the tab, or relabel?
- **Q5 Coverage gaps by plan**: UI-10 for the cashier is shown only on `settings-payments` (p2.9bu/p2.6u/p2.10/p2.12u cashier settings runs plan 0 shots); UI-7 "orders en 1024/768" from the builder's list is outside ruling 6 (en 1024 not shot). Enough, or add states?
- **Q6 05ค** is the scan stock-count phone frame (not money). The addendum lists "05" as CTRL, so I marked 05ค CTRL — do you want me to judge it instead?
- **Q7** QC5 residue visible in shots (212 revoked devices, open count #12, P2.13 agent-test order "เลยเวลาเตรียม 849 นาที", duplicate held bills "โต๊ะ 4 (ภาพ QC)") — data only; any cleanup wanted before HANDOVER-P2 images?


## Addendum — U2 re-shoot (controller · 16 Oct 17:16–17:26Z · tree d @230accb8 · build `taamEmOgfjv5vh5BxchCU` · QC5 · `/root/pos-runs/vis-u2-qc5-20261016T171622Z/` · 25 runs · 74 shots · 5 failed = H1/H2 only)
| id | shot re-opened | result |
|---|---|---|
| O-1 | p2.4u/tables-floor-owner-390x844 · tables-panel-rounds -en | ✅ FIXED — B9 reserved card: booking line clamped ("จอง 00:36 · คุณอรทัย (ภาพ QC) 6 คน · กันโต๊ะ…"), "ดูการจอง" button clear; en panel buttons one line |
| O-2 | p2.5u/tables-split-equal-owner-1024x768 | ✅ FIXED — "บิล 1 · สมใจ ลูกค้าประจำ (P…" truncates inside the card |
| O-3 | p2.8u/orders-mixed-owner-1440x900-en · p2.6u/kds-expo-owner-1440x900-en | ✅ FIXED — "1 item · ฿130" / "2 items" · "Served today 1 ticket" |
| O-4 | p2.3u/products-recipe-view-owner-390x844 | ✅ FIXED — title full width, toolbar wraps under it |
| O-5 | p2.12u/reports-hourly-owner-1440x900 | ✅ FIXED — top-products card shows the กำไร column |
| O-6 | p1.3/register-taxinvoice-dialog-owner-1440x900 | ✅ FIXED — "บุคคลธรรมดา" one line · branch field wider |
| O-7 | p2.11u/stock-shared-inventory-manager-1440x900-en | ✅ FIXED — return rows "17 Oct, 00:22 · คลังหลัก · bill 202610-0747 · คืน…" (no "-"); note: the trailing reason text is Thai (data from the bill) |
| O-8 | p2.12u/reports-branches-tab-owner-1024x768 | ✅ FIXED — "11 ต.ค. 2569 – 17 ต.ค. 2569 · ข้อมูล ณ 17 ต.ค. 00:23" |
| Q3 | p2.6u/kds-expo-owner-1440x900-en | ✅ FIXED — "last #41 · Chat" |
| Q4 | p1.3/register-default-cashier-1440x900 | ✅ FIXED — cashier tabs: หน้าขาย · ออเดอร์ออนไลน์ · บิลวันนี้ · กะ · สินค้า · รายงาน · ตั้งค่า (no "โต๊ะ · เร็ว ๆ นี้") |
| H5 | p2.8u/register-register-tab-badge-owner-390x844 | ✅ SHOT — badge "3" on the mobile orders button |
| H1/H2 | p1.3/register-offline-cashier-* th ×3 · en ×2 | ❌ still red — controller request trace (`dbg-offline-cashier-trace.log` in the run folder): the failing POST is server action `publishDisplayStateAction` (customer-display publish loop, P2.10) fired every few seconds for the display-paired cashier device; U2b guards did not cover it → **U3 H1b** (gate the display hook on `navigator.onLine`, publish once on `online`) → re-shoot after the U3 merge |
| O-9 | p2.12u/reports-print-overview-owner-1440x900 | ✅ by hunk (reports.ts `idCell`: "API …<last6>") — the re-shot print covers business day 17 Oct (00:23) and has no API-key seller row to show; the CSV/print column change is code-reviewed by the controller |
