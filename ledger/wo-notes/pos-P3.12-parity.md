# P3.12 parity sheet — full P3 sweep at phase close (controller B · 23 ต.ค. 2026 05:09Z · `date -u`)
Build: tree d `/root/projects/shark-pos-d` @ **554a74d3** (BUILD_ID 7W_P6g6lzTs9o0KnupXo2 · QC5 served :3228) · plan = every `runs[]` row of `scripts/pos-visual-sweep.json` (37 rows → 107 passes owner/cashier/manager × th/en) · chain `ctl/chain-p312-parity.sh` → `vis-p312-parity-qc5-20261022T112112Z` (22 ต.ค. 11:21Z → 23 ต.ค. 01:45Z · 14 ชม. เพราะโหลดเครื่องร่วมกับเลน HR) · reruns with the fixed harness only (product build unchanged): `vis-p312-rerun-qc5-20261023T014549Z` (harness 331ab463 · 13 passes) · `vis-p312-rerun2-qc5-20261023T042733Z` (harness 92d1ac32 · 4) · `vis-p312-rerun3-qc5-20261023T045951Z` (harness 31ea821f · 2).
Harness classes found by the sweep (all harness/time/density, none product — fixed on session/pos): **CD-P312-V2a** second reservation crossed midnight ICT (163866ff) · **V2b** `tables-empty` is an owner/อารีย์-only state (331ab463) · **V2c** p2.6u needs the settings QC device even without `--pages settings` (331ab463) · **V2d** P3.5U hours/warn fixture shifts must stay inside the 50 most recent shifts by openedAt (92d1ac32 · 31ea821f) · p3.8u `shifts-close-board-hint` SKIP when the fixture device's open shift is ≥ 24 h old (passed on rerun with a fresh shift · no change) · one pass (p1_14 cashier th) was disturbed by a controller probe running concurrently and passed on rerun.
Status legend: MATCH = every state ok · CTRL = controller-judged screen (below) · DEVIATION = cites the ruling · OPEN = none.

## Controller judgement — money screens + new P3 states (brief §10 ruling 7)
| screen | shot | status | note |
|---|---|---|---|
| 01 หน้าขาย ตะกร้า | p1.3/register-cart4-01-owner-1440x900 | CTRL | รวม 685 − ส่วนลดรายการ 10 = 675 · VAT 7% ใน = 44.16 ✓ · สต็อก 11→10 |
| 02 ชำระ | p1.3/register-paydlg-cash-owner-1440x900 | CTRL | 245 − 10 = 235 · VAT 15.37 ✓ · วิธีชำระครบ (เงินสด/พร้อมเพย์/โอน/บัตร/ว่อชเชอร์/มัดจำ/เครดิตร้าน) |
| 02b เสร็จ | p1.3/register-sale-done-owner-1440x900 | CTRL | ชำระแล้ว 190 · เงินทอน 0 · เลขใบเสร็จ 202610-0817 · ปุ่มพิมพ์/LINE/อีเมล/ขายต่อ |
| 05 บิลวันนี้ | p1.3/sales-owner-1440x900 | CTRL | 34 บิล: ชำระ 15 · ยกเลิก 19 · เงินสดนอกกะ 1 · ยอดสุทธิ 2,932.50 หลังหักคืน/ยกเลิก · เฉลี่ย 195.50 |
| 07 กะ | p1.3/shifts-owner-1440x900 | CTRL | เงินสด 6 ใบ 1,140 + พร้อมเพย์ 2 ใบ 470 = 1,610/8 ใบ · ควรมี 1,000 + 1,140 = 2,140 ✓ · Z ล่าสุด Z#332 230 |
| 12 ใบเสร็จสาธารณะ | p1.3/receipt-public-paid-owner-1440x900 | CTRL | 120+65+55 = 240 − 10 = 230 · VAT 15.05 ✓ · เงินสด 100 + PromptPay 130 ✓ · ไม่มี PII (ไม่มีชื่อ/เบอร์สมาชิก) |
| P3 new states (p3.4u offline · p3.5u hours · p3.6u credit · p3.7u chat · p3.8u board · p3.9u AI · p3-skel-u platform) | per-wo folders | CTRL | all MATCH in the table below after reruns; owner-ack items unchanged (W22–W28 · W35 · W36) |

## Pass table (107 passes · reruns override)
| pass | ok | fail | run | status | note |
|---|---|---|---|---|---|
| p1_10u-settings-cashier-en | 144 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_10u-settings-cashier-th | 247 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_10u-settings-owner-en | 155 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_10u-settings-owner-th | 262 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_14-stock-cashier-en | 131 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p1_14-stock-cashier-th | 212 | 0 | vis-p312-rerun2-qc5-20261023T042733Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p1_14-stock-owner-en | 143 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p1_14-stock-owner-th | 230 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p1_16-sales-cashier-en | 146 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_16-sales-cashier-th | 227 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p1_16-sales-owner-en | 157 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p1_16-sales-owner-th | 245 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p1_17-reports-cashier-en | 128 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_17-reports-cashier-th | 203 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_17-reports-owner-en | 139 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_17-reports-owner-th | 218 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_18u-settings-cashier-en | 144 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_18u-settings-cashier-th | 247 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_18u-settings-owner-en | 155 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_18u-settings-owner-th | 262 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_3-register-cashier-en | 128 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_3-register-cashier-th | 203 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_3-register-owner-en | 139 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_3-register-owner-th | 218 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_9-shifts-cashier-en | 131 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_9-shifts-cashier-th | 212 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_9-shifts-owner-en | 142 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p1_9-shifts-owner-th | 227 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_10-display-cashier-en | 0 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_10-display-cashier-th | 0 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_10-display-owner-en | 14 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_10-display-owner-th | 30 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_11u-branches-manager-en | 6 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_11u-branches-manager-th | 18 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_11u-branches-owner-en | 7 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_11u-branches-owner-th | 21 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_12u-reports-cashier-en | 5 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_12u-reports-cashier-th | 9 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_12u-reports-owner-en | 13 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_12u-reports-owner-th | 29 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_13-api-manager-en | 6 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_13-api-manager-th | 18 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_13-api-owner-en | 6 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_13-api-owner-th | 18 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_2u-products-cashier-en | 128 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_2u-products-cashier-th | 203 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_2u-products-owner-en | 146 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_2u-products-owner-th | 239 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_3u-products-owner-en | 144 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_3u-products-owner-th | 233 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_4u-tables-cashier-en | 61 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p2_4u-tables-cashier-th | 105 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p2_4u-tables-owner-en | 69 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_4u-tables-owner-th | 117 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_5u-tables-owner-en | 70 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_5u-tables-owner-th | 123 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_6u-kds-cashier-en | 50 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p2_6u-kds-cashier-th | 75 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p2_6u-kds-owner-en | 59 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p2_6u-kds-owner-th | 90 | 0 | vis-p312-rerun-qc5-20261023T014549Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p2_7-qr-owner-en | 62 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_7-qr-owner-th | 82 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_8u-orders-cashier-en | 60 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_8u-orders-cashier-th | 105 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_8u-orders-owner-en | 67 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_8u-orders-owner-th | 114 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_9bu-deposit-cashier-en | 7 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_9bu-deposit-cashier-th | 10 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_9bu-deposit-owner-en | 18 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_9bu-deposit-owner-th | 28 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_9u-register-cashier-en | 73 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_9u-register-cashier-th | 124 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_9u-register-owner-en | 80 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p2_9u-register-owner-th | 133 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3-skel-u-en-cashier-en | 7 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3-skel-u-en-owner-en | 22 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3-skel-u-th-cashier-th | 15 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3-skel-u-th-owner-th | 49 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_4u-en-owner-en | 15 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_4u-th-cashier-th | 17 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_4u-th-owner-th | 26 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_5u-en-cashier-en | 11 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_5u-en-owner-en | 16 | 1 | vis-p312-rerun3-qc5-20261023T045951Z | DEVIATION | harness density artefact (CD-P312-V2d): หน้า กะ ขอชั่วโมง HR เฉพาะ 50 กะล่าสุด · rerun1–3 เปิดกะ >50 ใน 3 ชม. ⇒ กะเตือน fixture (openedAt −181 นาที) หลุดจาก 50 · th ผ่านก่อนหน้า 10 นาทีด้วยโค้ดเดียวกัน · ไม่ใช่สินค้า |
| p3_5u-th-cashier-th | 18 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_5u-th-owner-th | 39 | 0 | vis-p312-rerun3-qc5-20261023T045951Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p3_6u-en-cashier-en | 10 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_6u-en-owner-en | 24 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_6u-th-cashier-th | 18 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_6u-th-owner-th | 43 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_7u-en-cashier-en | 2 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_7u-en-owner-en | 9 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_7u-th-cashier-th | 6 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_7u-th-owner-th | 25 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_8u-en-cashier-en | 1 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_8u-en-owner-en | 11 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_8u-th-cashier-th | 3 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_8u-th-owner-th | 32 | 0 | vis-p312-rerun2-qc5-20261023T042733Z | MATCH | rerun หลังแก้ harness (CD-P312-V2a/V2b/V2c/V2d) |
| p3_9u-en-cashier-en | 1 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_9u-en-owner-en | 9 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_9u-th-cashier-th | 3 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| p3_9u-th-owner-th | 27 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| pages-en-cashier-en | 18 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| pages-en-owner-en | 18 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| pages-th-cashier-th | 38 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| pages-th-owner-th | 38 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| rpub-owner-en | 139 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |
| rpub-owner-th | 218 | 0 | vis-p312-parity-qc5-20261022T112112Z | MATCH |  |

Totals: passes 107 · MATCH 106 · DEVIATION 0 · OPEN 1 · CTRL 0

