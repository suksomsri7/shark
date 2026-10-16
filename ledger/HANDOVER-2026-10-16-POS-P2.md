# HANDOVER — POS ใหม่ ปิดเฟส P2 "จอเดียวทุกโหมด + ทุกช่องทาง" (P2.1–P2.14 + P2.9b · ใบ U 12 ใบ · HF ของเฟส 6 ใบ)

วันที่: 16 ต.ค. 2569 (UTC) · worktree `/root/projects/shark-pos` · branch `session/pos` · ฐาน P2.14 = merge P2.7U `64923c13` (ใบสุดท้ายก่อน P2.14 · ทุกใบ P2 ยกเว้น P2.14 อยู่บนทิปนี้) · ตอนร่าง: gates106 `DONE` 04:0xZ → push แล้ว (`origin/session/pos` มี `64923c13`) · gates107 (hf-fu หมุด) กำลังรัน · ผู้คุมงาน: บัญชี A (รับไม้จากบัญชี B 03:56Z) · ร่างโดย drafter (อ่านอย่างเดียว · ช่องที่ผู้คุมเติมตอน merge = `__…__`) · ⛔ ห้าม push main · แหล่งความจริงสด = ท้าย `ledger/POS-RESUME.md`

## §0 สรุป 10 บรรทัด
1. P2 ส่งมอบจอเดียวทุกโหมด/ทุกช่องทาง: ช่องทางขาย + ค่าคอมฯ แพลตฟอร์มลงบัญชี (P2.1) · ราคาตามช่องทาง/สาขา/เวลา + กฎราคา (P2.2) · สูตร/วัตถุดิบ BOM ตัดคลัง + ต้นทุนตามสูตร (P2.3) · โหมดโต๊ะใน POS + โต๊ะจอง (P2.4) · แยกบิล 3 แบบ + ย้าย/รวมโต๊ะ + ใบรายการ (P2.5) · KDS ใหม่ + ใบครัว + 86 ทุกช่องทาง (P2.6) · QR สั่งที่โต๊ะ + สั่งล่วงหน้าจ่ายก่อน (P2.7) · จอออเดอร์ทุกช่องทาง + เว็บร้านอ่านราคา POS (P2.8) · บัตรของขวัญ/เครดิตร้าน/ทิปเป็นวิธีชำระ (P2.9) · มัดจำเป็นวิธีชำระ (P2.9b) · จอลูกค้า `/d` (P2.10) · หลายสาขา (P2.11) · รายงานช่องทาง/สาขา/รายชั่วโมง/ผิดปกติ + พิมพ์/PDF (P2.12) · REST `/api/v1/pos` 48 op + สกิล + คู่มือ (P2.13) · ปิดเฟส + ไล่เก็บ follow-up "HF-FU2" (P2.14)
2. **ตัวนับ = __COUNTER__** (ledger นับใบ S และ U แยกกัน · ก่อน P2.14 = 43/55 หลัง P2.7U merge + gates106 · P2.14 = ใบสุดท้ายของเฟส · ผู้คุมยืนยันตัวเลขหลังเจ้าของเช็กพอยต์ "ปิด P2" `POS-MASTER-PLAN.md` §5) · ใบแทรกที่ไม่นับ: HF-TX HF-PP HF-PP2 HF-GC HF-GC2 HF-FU · MAIN-MERGE · ORACLE-EDIT merges
3. โค้ด P2 (ไฟล์ใหม่ใน `src/lib/modules/pos/`): `recipe*` · `table*` · `table-split*` · `kds*` · `kitchen-slip-render` · `order*` (+ `order-adapters`) · `qr-order*` · `qr-staff*` · `tender*` · `tip-ledger*` · `deposit*` · `refund-tenders*` · `display*` · `report-print-shared` · `pre-bill-render` · `api/**` (dispatch · ops · openapi · keys) + `api-key-actions` · UI `src/components/pos/{tables,kds,orders,qr,display,products}` + register (มัดจำ · ตัดสต็อกค้าง · เมนูเพิ่ม) · หน้าใหม่ `src/app/app/sys/[id]/pos/{tables,orders,kds,products/price-rules,reports/print}` · สาธารณะ `(store)/d` · `(store)/q/{t/[qrToken],[linkToken],o/[orderToken]}` · `/developers/pos` · `api/v1/pos/[...path]` + `openapi.json`
4. migration ของ P2 = 14 ไฟล์ `…_pos_p21_sales_channel` → `…_pos_p27_qr_orders` (p21 · p22_prices · p23_recipe · p24_tables · p28_orders · p26_kds/stock_taken/station_set_at · p29_tenders · p25_split · p29b_deposits/deposit_phone_lock · p210_customer_display · p27_qr_orders) · **QC4 + QC5 เท่านั้น · ยังไม่ขึ้น prod** (P6.1)
5. ข้อสอบ: `scripts/qc-pos-p2.1…p2.14.mts` + `qc-pos-p2.9b` (15 ชุด) + `qc-pos-api-skill` + `qc-hf-tx` + `qc-hf-fu` · ORACLE-EDIT/ADD ของเฟส 2 = 81 commit `test(...)`/`qc(...)` ของตัวเอง · manifest ด่าน `scripts/pos-gates.json` (86 suite + 8 คำสั่ง) + runner `scripts/pos-gates-all.sh` · manifest ภาพ `scripts/pos-visual-sweep.json` (23 run) (P2.14)
6. "qc:all เขียว" (มติ P2.14 ข้อ 5) = P2 gate set บน QC4 ใต้ล็อก POS: **__GATESET_RESULT__** (`__GATESET_PATH__`) · `qc:all` ทั้งรีโปบน Neon branch ส่วนตัว (O27 · CONTROLLER-RUN): __QCALL_NEON__ · แดงที่ยอมรับ = 5 ชุดจาก P1 (§2)
7. parity ทุกจอ (มติ P2.14 ข้อ 6 · th × 1440/1024/390 ทุกหน้า/state · en × 1440 ทุกหน้า + en × 390 ของ register/pay/bills/หน้าสาธารณะ): __PARITY_SUMMARY__ · แผ่น `ledger/wo-notes/pos-P2.14-parity.md` (§3)
8. รันด่าน (QC4): `bash scripts/pos-gates-all.sh` (P2.14 · `--dry` = แผนอย่างเดียว) หรือทีละชุด `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-<id>.mts` · typecheck heap 8192 / ISO_MEM 10500M · **ห้าม export CI ในสคริปต์ด่าน** (§6)
9. รันภาพ (QC5 · ทรี d · พอร์ต 3228): `bash scripts/qc5.sh env ACC_V2_PORT=3228 bash scripts/acc-v2-serve.sh start` แล้ว `bash scripts/iso.sh bash scripts/qc5.sh env CI=1 [LOCALE=en] pnpm exec tsx scripts/visual-pos.mts <wo> --states --user owner|cashier|manager --tenant coffee [--page <page>] --base http://127.0.0.1:3228` · wo ของ P2 = `p2.2u p2.3u p2.4u p2.5u p2.6u p2.7 p2.8u p2.9u p2.9bu p2.10 p2.11u p2.12u p2.13` (`--list` ไม่ต้อง DB)
10. ถัดไป (§7): เจ้าของเช็กพอยต์ "ปิด P2" → P3 (12 ใบ: adapter แพลตฟอร์ม · ออฟไลน์ · HR/CRM/แชท/บอร์ด · AI · e-Tax) → P4 ทุกปุ่ม → P5 ล่าบั๊ก → P6 ขึ้น prod · เจ้าของยังไม่ตอบ TG msg 4692 (2 มติ · §4 ข้อแรก)

## §1 ใบที่ปิด (P2.1–P2.14 + P2.9b)
SHA = commit merge บน `session/pos` (ตรวจด้วย `git merge-base --is-ancestor <sha> 64923c13` แล้วทุกตัว) · วงเล็บ = head ของ wip (= parent ที่สองของ merge) · "code" = head โค้ดก่อน commit โน้ต · จำนวนข้อ = ผลล่าสุดในด่าน (แหล่งในวงเล็บ · `/root/pos-runs/<gates>-*/`) — หลายชุดโตขึ้นจาก ORACLE-EDIT/ADD ระหว่างทาง (p2.1 53 → 55 · p2.4 49 → 50 · p2.6 51 → 62 → 67 · p2.7 38 → 42 · p2.8 54 → 60 → 61 · p2.10 12 → 13 · p2.12 30 → 33 · p2.13 49 → 54 · api-skill 10 → 12 · hf-tx 18 → 22 · hf-fu 25 → 29) · ใบ P2.5/P2.7/P2.9/P2.9b/P2.10–P2.13 = oracle-first บน wip เดียวกัน (oracle อยู่ใน merge ของ S)

| ใบ | merge (S · U) | ข้อสอบ (ข้อ · แหล่งผล) · ภาพ | ผู้ตรวจ (ไฟล์ใน `ledger/wo-notes/`) |
|---|---|---|---|
| P2.1 ช่องทางขาย + ค่าคอมฯ → บัญชี | oracle `e4672cfa` (`0a8dfeea`) · S `206a48df` (`41143357`) · ORACLE-EDIT R8 `6fbbe15b` (`c05ee731`) · U `711b6d5e` (`15c8781c`) | qc-pos-p2.1 55/55 (gates106) · ภาพ vis57 | `pos-P2.1-review-S.md` · `pos-P2.1-review-R2.md` · `pos-P2.1U-review.md` (fix 1–2) |
| P2.2 ราคาตามช่องทาง/สาขา/เวลา + กฎราคา | oracle `b3c3fbf5` · S `0c20c473` (`55f9d940` · ORACLE-EDIT `4ea0ad23` `ec074d01`) · U `1636da3c` (`2f8f1e67`) | qc-pos-p2.2 42/42 (gates104) · U gates64 15/15 · ภาพ vis60/vis61 | `pos-P2.2-review-S.md` · `pos-P2.2-review-R2.md` · `pos-P2.2U-review.md` · `pos-P2.2U-review-R2.md` |
| P2.3 สูตร/วัตถุดิบ BOM | oracle `6dbcafe0` · re-pin ST4 `7f633a26` · S `160299e4` (`06f2d825`) · U `a7561b5c` (`a59655ac` · code `ac598727`) | qc-pos-p2.3 46/46 (gates93) · S gates63 23/23 · ภาพ vis63 19/19 | `pos-P2.3-review.md` · `pos-P2.3-review-R2.md` · `pos-P2.3U-review.md` |
| P2.4 โหมดโต๊ะ + โต๊ะจอง | oracle `7057fd5d` · S `7365d4db` (`b2c2aa84` · code `3bbb4a51`) · U `c81f5bbf` (`d55366ba` · code `bdd7891a`) | qc-pos-p2.4 50/50 (gates106) · restaurant ×4 (gates106) · S gates67 · ภาพ vis64/vis65 | `pos-P2.4-review.md` · `pos-P2.4-review-R2.md` (R1–R4) · `pos-P2.4-hunt.md` · `pos-P2.4U-review.md` |
| P2.5 แยกบิล 3 แบบ + ย้าย/รวมโต๊ะ + ใบรายการ | S `96cc5f4f` (`fe2db17b`) · U `3dd0639d` (`8f4c66eb`) | qc-pos-p2.5 49/49 (gates104) · S gates81 · U gates84 · ภาพ vis75/vis76 | `pos-P2.5-review.md` (R1–R3) · `pos-P2.5-hunt.md` · `pos-P2.5U-review.md` |
| P2.6 KDS + ใบครัว + 86 ทุกช่องทาง | oracle `2be1b730` · S `671e6fd2` (`1a87a574` · code `e5fc0392`) · U `4449123f` (`d3396aab` · code `8db5cda5`) | qc-pos-p2.6 67/67 (gates106) · S gates75 · U gates77 · ภาพ vis71 | `pos-P2.6-review.md` · `-review-R2.md` · `-review-R3.md` · `pos-P2.6-hunt.md` · `pos-P2.6U-review.md` · `-R2.md` · `-R3.md` |
| P2.7 QR สั่ง/สั่งล่วงหน้าจ่ายก่อน | S `92b7149d` (`0787cbf1`) · U `64923c13` (`1c354079` · fix `ac59ce6f` · `14bbe1a8`) | qc-pos-p2.7 42/42 ×2 (gates106) · S gates104/105 · ภาพ vis89/vis90/vis91 | `pos-P2.7-review.md` (S R1–R3 + hunter H1–H5 · U R1 → fix 1–3) · `pos-P2.7U.md` |
| P2.8 จอออเดอร์ทุกช่องทาง + เว็บร้านอ่านราคา POS | oracle `8226c0a9` · S `d85ea5c3` (`e8e25065` · code `1d676836`) · U `89eb07ed` (`99f49ffd` · code `5706a999`) | qc-pos-p2.8 61/61 (gates106) · qc-shop 15 · shop-refund 12 (gates104) · U gates70 · ภาพ vis66b/vis68 | `pos-P2.8-review.md` (R1–R3) · `pos-P2.8-hunt.md` · `pos-P2.8U-review.md` · `pos-P2.8U-review-R2.md` |
| P2.9 บัตรของขวัญ/เครดิตร้าน/ทิป | S `40ade233` (`a00b1c9d`) · ORACLE-EDIT `d871877c` (`ac0031bd` · CD-P29-1) · U `9ada96ef` (`c25c7bc4`) | qc-pos-p2.9 62/62 (gates101) · S gates78 · U gates82 · ภาพ vis72/vis73/vis74 | `pos-P2.9-review.md` · `-review-R2.md` · `-review-R3.md` · `pos-P2.9-hunt.md` · `pos-P2.9U-review.md` |
| P2.9b มัดจำเป็นวิธีชำระ | S `c3c52ef1` (`9700c5e1` · code `0e15d4e3`) · U `616db657` (`692a02d7`) | qc-pos-p2.9b 53/53 (gates104) · S gates86 · U gates91 · ภาพ vis79/vis80 | `pos-P2.9b-review.md` (R1–R5 · hunter ×4 SIGNED-OFF) · `pos-P2.9bU-review.md` |
| P2.10 จอลูกค้า (จอที่ 2) | `9e72513f` (`6b2cefbb`) | qc-pos-p2.10 13/13 (gates106) · merge gates95/96 · ภาพ vis82/vis83 | `pos-P2.10-review.md` (R1 → fix 1–2 → R2) |
| P2.11 หลายสาขา | S `744e4f35` (`3eec7cc9`) · U `5f554f9e` (`adf9e992` · code `c43719a1`) | qc-pos-p2.11 34/34 (gates106) · S gates85 · U gates88 · ภาพ vis77/vis78 | `pos-P2.11-review.md` · `pos-P2.11U-review.md` |
| P2.12 รายงานช่องทาง/สาขา/รายชั่วโมง/ผิดปกติ + PDF | S `d0561566` (`b5beeae0`) · U `861815e0` (`0c1177ca`) | qc-pos-p2.12 33/33 (gates104 · gates106) · S gates97/98 · U gates99 · ภาพ vis84/vis85 + PDF probe | `pos-P2.12-review.md` (+ hunter H1–H5) · `pos-P2.12U-review.md` |
| P2.13 REST `/api/v1/pos` + สกิล + คู่มือ | `f95348ac` (`a67693a8`) · skill fix-up `4bb550cf` (`4ccd0df9`) | qc-pos-p2.13 54/54 (gates106) · qc-pos-api-skill 12/12 (gates104) · hf-apiv1-scope 143 (gates101) · agent test 5/5 (`pos-P2.13-agent.md`) · ภาพ vis86–vis88 | `pos-P2.13-review.md` (R1 + hunter H1–H3 → R2) |
| P2.14 ปิดเฟส: qc:all + parity ทุกจอ + HANDOVER-P2 | `05975437` (`e1c4d999`) | qc-pos-p2.14 56 เช็ก (L1–L5 · A1–A11 · D1 · Q1–Q6 · O1–O5 · P1–P6 · R1–R5 · U1 · K1–K3 · G1–G4 · V1–V4 · H1–H3 · Z1–Z2 · red-before 8/56 ที่ฐานของ oracle) · ผลที่ merge: __GATESET_RESULT__ | `pos-P2.14-review.md` · `pos-P2.14.md` · `pos-P2.14-parity.md` |

**ใบแทรก (HF) ของเฟส 2** — ไม่นับในตัวนับ · ทุกใบมีผู้ตรวจอิสระ
| ใบ | merge | ข้อสอบ (ข้อ · แหล่งผล) | ผู้ตรวจ |
|---|---|---|---|
| HF-TX createSale ในธุรกรรมของผู้เรียก (callerTx / afterSaleCommitted · ไม่ซ้อน savepoint) | `831ad163` (`1eba9bc4` · code `088e78ed`) | qc-hf-tx 18 → 22/22 (gates104) · p1.6 48 · p1.7 33 | `pos-HF-TX-review.md` (MERGEABLE · hunt OK) · `pos-HF-TX-investigation.md` |
| HF-PP ด่านผู้จัดการฝั่งเซิร์ฟเวอร์ของพร้อมเพย์/บัตรที่ไม่มีใบขอรับเงิน | `ca5a07b4` (`b34ebc08` · code `33072250`) | qc-pos-p1.7 33 · qc-pos-p2.4 50 (P9) | `pos-HF-PP-review.md` (R1/R2 MERGEABLE) |
| HF-PP2 ด่านเดียวกันใน `orders.payOrder` (REGISTER_MANUAL_METHODS ร่วม) | `adbb1640` (`94d31026` · code `448c632c`) | qc-pos-p2.8 61 (P10) · merge gates71 | `pos-HF-PP2-review.md` · `pos-HF-PP2-review-R2.md` |
| HF-GC บัตรกำนัล balanceAfter จากแถวที่ล็อก + ตาข่ายลงหนี้สิน 2110 ตอนขาย | `071402d8` (`31cb1bd8` · code `ceb281c1`) | qc-hf-tx HT2.7 (20/20 ตอน merge) · merge gates73 | `pos-HF-GC-review.md` · `pos-HF-GC-review-R2.md` |
| HF-GC2 `expireDue` อ่านยอดใต้ล็อก · `reload` มีเงื่อนไขสถานะ | `2a18fdec` (`bea20b66` · code `9153edbf`) | qc-hf-tx HT2.8/HT2.9 (22/22) · merge gates74 | `pos-HF-GC2-review.md` |
| HF-FU ถังเก็บตกฝั่งเซิร์ฟเวอร์ 21 ข้อ (ตัวกวาดออเดอร์ค้าง · รอบร่างกำพร้า · หมุนเศษส่วนแบ่ง · posSalePosted · expectedRowsHash …) | `84ffb48b` (`6194adf7`) | qc-hf-fu 29/29 (gates105) · merge gates93 | `pos-HF-FU-review.md` (R1–R3 + hunter H1/H2) · `pos-HF-FU-oracle.md` |

ใบแทรกอื่นที่ลง `session/pos` ระหว่าง P2: MAIN-MERGE `0d581286` (`b873b2a1` · origin/main 71a1f363 + P1.1b ส่วน B + ORACLE-EDIT S5.12/S2.19a · `pos-MAIN-MERGE.md`) · ORACLE-EDIT p0.2 S7 `66555aa6` (ปิด P1) · HF-P1CLOSE `db5af8c2` (ปิด P1 · ฐานของเฟสนี้) · ORACLE-EDIT merge `d871877c` (CD-P29-1 re-pin p2.4 ST4 + p2.6 L3)

**หมายเหตุตัวนับ**: แผน `POS-MASTER-PLAN.md` หัว P2 "14 ใบ" = 14 แถว (P2.1–P2.14) · P2.9b เป็นใบที่แตกจาก P2.9 (มัดจำ) ไม่มีแถวในแผน · ledger นับใบ S และ U แยก (มติ P2.14 ข้อ 10 ส่วนหัว: "the plan's 55 is the total of rows the ledger has been counting — the controller confirms at close") ⇒ ตัวเลขสุดท้ายผู้คุมเป็นคนเคาะ (`__COUNTER__`)

## §2 ด่านปิดเฟส ("qc:all เขียว" = P2 gate set · มติ P2.14 ข้อ 5)
**ด่านปิดเฟส (P2.14 · ผู้คุมเติม)**
- P2 gate set บน QC4 ใต้ล็อก POS ผ่าน `scripts/pos-gates-all.sh` (manifest `scripts/pos-gates.json` · ทุก `qc-pos-*` · `qc-hf-*` · restaurant ×4 · shop ×2 · hotel/ticket/subscription money · account-cpa · `qc-account-api-*` 19 ชุด · fitness ±env · fitness-pos · `gen-pos-api-docs --check` · typecheck 8192 · `visual-pos --list` + `--dry` th/en): `__GATESET_PATH__` → **__GATESET_RESULT__**
- `qc:all` ทั้งรีโป (418 ชุด · seed acc-v2/kanban/member/crm ก่อนรัน ⇒ ห้ามรันบน QC4) = CONTROLLER-RUN ครั้งเดียวบน Neon branch ส่วนตัวก่อน deploy (O27 · `POS-OWNER-PENDING.md:70`): __QCALL_NEON__
- ลำดับปิดเฟส (มติ 11): merge P2.14 → push → gate set → build ทรี d → parity sweep ตาม `scripts/pos-visual-sweep.json` → ผู้คุมตัดสิน → U fix round → ถ่ายซ้ำ state ที่แตะ → gate set อีกครั้ง → push → HANDOVER-P2 (ไฟล์นี้) → เจ้าของเช็กพอยต์ "ปิด P2"

**ด่าน merge ของแต่ละใบ (QC4 · `/root/pos-runs/<run>/SUMMARY.txt` บรรทัด `<suite> <exit>` + `DONE`)**
| run | head | ผล |
|---|---|---|
| `gates63-b-20261010T023823Z` · `gates64-p11-20261010T030617Z` · `gates67-c-20261010T064904Z` | P2.3 S code `09e2ca11` · P2.2U `2f8f1e67` · P2.4 S `b2c2aa84` | DONE เขียวทั้งหมด (23/23 · 15/15 · gates67) |
| `gates70-b-…T112445Z` · `gates71-p11-…T123054Z` · `gates73-p11-…` · `gates74-p11-…` | P2.8U `99f49ffd` · HF-PP2 `adbb1640` · HF-GC `071402d8` · HF-GC2 `2a18fdec` | DONE · gates71 แดง p2.8 = หมุด ST6 (wip-only · เขียวหลัง push) |
| `gates75-c-…` · `gates77-c-…` · `gates78-p11-20261014T213929Z` | P2.6 S `671e6fd2` · P2.6U `4449123f` · P2.9 S `40ade233` | DONE · gates75 แดง p2.8 = หมุด ST6 · gates78 แดง p2.4 / p2.6 / p2.8 = contract sha + lane pins → ORACLE-EDIT merge `d871877c` (CD-P29-1) |
| `gates81-c-…` · `gates82-b-…` · `gates84-c-…` · `gates85-c-…` | P2.5 S `96cc5f4f` · P2.9U `9ada96ef` · P2.5U `3dd0639d` · P2.11 S `744e4f35` | DONE · แดงเฉพาะหมุด p2.8 (gates81) |
| `gates86-b-…` · `gates88-c-…` · `gates91-c-…` · `gates93-c-…` · `gates95-b-…`/`gates96-b-…` | P2.9b S `c3c52ef1` · P2.11U `5f554f9e` · P2.9bU `616db657` · HF-FU `84ffb48b` · P2.10 `9e72513f` | DONE · แดงเฉพาะหมุด lane (p2.11 ST1/ST4 · p2.8 ST6) → เขียวหลัง push (gates96: p2.8 61 · p2.11 34) |
| `gates97-c-…`/`gates98-c-…` · `gates99-c-20261015T205526Z` | P2.12 S `d0561566` · P2.12U `861815e0` | DONE · แดงเฉพาะหมุด (p2.10 ST2 · hf-fu ST1) → push → gates98 (p2.10 13 · p2.8 61) / gates100 (p2.10 13 · hf-fu 29) เขียว |
| `/root/pos-runs/gates101-c-20261015T215429Z` + `gates102-c-20261015T222423Z` | P2.13 `f95348ac` | 30 ขั้น DONE: p2.13 54 ×2 · api-skill 10 · p0.2 56 · hf-apiv1-scope 143 · account-api-core 64 · kanban-k1.15 30 · ai-skills 23 · p1.3 128 · p1.8 49 · p1.9 53 · p1.17 40 · p1.6 48 · hf-tx 22 · p2.6 67 · p1.1 180 · p2.1 55 · p2.9 62 · p2.9b 53 · authz 82 · gen-check · fitness ±env · fitness-pos · typecheck 0 · แดง 5 = หมุด (p2.8 p2.11 p2.12 hf-fu p2.10) → gates102 เขียวหมด |
| `/root/pos-runs/gates103-c-20261015T235552Z` | skill fix-up `4bb550cf` | api-skill 12/12 ×2 · p2.13 54 · kanban 30 · account-api-core 64 · p0.2 56 · gen --check · fitness ±env/pos · typecheck 0 |
| `/root/pos-runs/gates104-c-20261016T010124Z` + `gates105-c-20261016T013301Z` | P2.7 S `92b7149d` | 32 ขั้น DONE: p2.7 42 ×2 · restaurant ×4 (6 · 19 · 11) · p2.4 50 · p2.5 49 · p2.6 67 · p1.7 33 · p1.6 48 · p2.1 55 · p2.2 42 · p1.18 81 · hf-tx 22 · p1.1 180 · p1.3 128 · p2.9b 53 · p2.12 33 · authz 82 · api-skill 12 · shop 15 · shop-refund 12 · fitness ±env/pos · typecheck 0 · แดง 5 = หมุด (p2.8 ST6 · p2.13 ST5 · p2.10 ST2 · hf-fu ST1 · p2.11 ST1/ST4) → push → gates105 เขียว 5/5 |
| `/root/pos-runs/gates106-c-20261016T033551Z` | P2.7U `64923c13` (ฐาน P2.14) | **DONE 04:0xZ** 23 ขั้น: p2.7 42 ×2 · p2.8 61 · p2.4 50 · p2.6 67 · restaurant ×4 (6 · 19 · 11) · authz 82 · p1.16 28 · p2.10 13 · p1.3 128 · p1.1 180 · p2.1 55 · p2.13 54 · p2.11 34 · p2.12 33 · fitness ±env/pos · typecheck 0 · แดง 1 = qc-hf-fu 28/29 ST1 (หมุด merge-base กับ origin · ตอนนั้นยังไม่ push) → push แล้ว → gates107 (`/root/pos-runs/gates107-c-*` · hf-fu · มี 3 โฟลเดอร์จาก unit ซ้ำที่ถูกหยุด) กำลังรัน — ผู้คุมยืนยันผล |

**หมุด lane (TL-1)**: 6 ชุดเทียบ `git merge-base HEAD origin/session/pos` (qc-hf-fu ST1 · p2.8 ST1/ST6 · p2.11 ST1/ST4 · p2.12 ST1 · p2.13 ST5 · p2.10 ST2) + p2.7 ST3 ⇒ แดงบนทิปที่ยังไม่ push ทุกครั้ง (โดยออกแบบ) · มติ P2.14 ข้อ 3/18: re-pin ทั้ง 7 เป็น SHA ฐาน P2.14 (= `64923c13`) ใน ORACLE-EDIT batch ท้ายใบ ⇒ K3 allow-list ว่าง · P3 แก้หมุดเมื่อจะแตะไฟล์เหล่านั้น

**ข้อยกเว้นที่รับไว้ (manifest `accepted` · G4 · ไม่ใช่ความผิดของโค้ด POS):**
- `qc-acc-v2-pos-lines` 65/79 — QC4 ไม่มีชุดข้อมูล acc-v2 · เลน POS ห้าม reseed · เจ้าของ = โมดูลบัญชี (มติ P2.14 ข้อ 21: ผู้สร้าง P2.14 เพิ่มบรรทัด OP ให้)
- `qc-member-m2.6` / `m2.7` / `m2.8` — ล้มตอน setup `TypeError … reading 'role'` (seed สมาชิก QC4 ไม่ตรง `member-expected.json` · `POS-OWNER-PENDING.md:111`) · `qc-member-m1.7` — ล้มที่ setup แบบเดียวกัน (S6.2/S6.3 ไม่เคยได้รัน · p1.18 K4b คุมแทน) · เจ้าของ = โมดูลสมาชิก · ห้าม reseed
- 5 ชุด `qc-account-api-*` ที่หัว `// requires: acc-v2-seed` (read-docs · read-finance · read-gl · read-master · settings) — รันครั้งเดียวใน gate set · ถ้าแดงเพราะไม่มี seed เท่านั้น (หลักฐาน log ในโน้ต builder) ⇒ `accepted` "needs acc-v2 seed — green on the ACCOUNT-API lane" + บรรทัด OP "รันทั้ง 5 บนเลน acc-v2 ก่อน deploy" (มติ 21) · แดงอื่น = แก้/CONTROLLER-DECISION

**ORACLE-EDIT/ADD ของเฟส 2** — 81 commit แยกของตัวเอง (`git log --grep ORACLE db5af8c2..64923c13`) · กลุ่มใหญ่: re-pin contract sha CD-P29-1 (p2.1 S8 · p2.2 S3 · p2.3 ST4 · p2.4 ST4 · p2.5 L2 · p2.6 L3) · P2.13 batch (createSale caller pin `pos/api/ops/sales.ts` 1 → 0 ใน 9 ชุด · p2.1 ST3 · p0.2 pins · OR4) · P2.7 (p2.1 builtins 4 → 5 · p2.8 ST1 · p2.6 A6 · p1.7 C9 ×2 · p2.7 TB8/PY13) · HF-FU (p2.5 C7/T5/refAlloc · p2.6 O4 · p2.9b A10) · P2.11U `qc-hf-pos-page-authz` P-7 · P2.12U RP-1 81 → 82 · P2.10 p1.18 `rewardNearCustomerDisplay` · ORACLE-EDIT ของ P2.14 (p2.7 ST3 · hf-fu HN1 · p2.10 :723 · p1.17 :209 · p2.13 SH2 · qc-ai-wave5b · re-pin 7 ชุด · มติ 12–24) = ผู้คุมเติมจาก `pos-P2.14.md`

## §3 parity (มติ P2.14 ข้อ 6 · H3)
แหล่ง: `ledger/wo-notes/pos-P2.14-parity.md` (รูปแบบ P1.18: กรอบ × ขนาด × ภาษา · MATCH / DEVIATION(+มติ) / OPEN · H3 = ต้องไม่มี OPEN) · แผนถ่าย `scripts/pos-visual-sweep.json` 23 run (pages-th/en `p2close` · P1 wo 8 ชุด · rpub · P2 wo 13 ชุด: p2.2u p2.3u p2.4u p2.5u p2.6u p2.8u p2.9u p2.9bu p2.10 p2.11u p2.12u p2.13 p2.7) + exempt 3 (`reports/print` → reports · `products/price-rules` → products · `/developers/pos` → settings) · build ครั้งเดียวที่ทิปปิดเฟส บนทรี d · QC5

**สรุป: __PARITY_SUMMARY__**

ภาพที่ผู้คุมตัดสินแล้วตอน merge แต่ละใบ (เทียบ `ledger/design-pos/NN` · ไม่ซ้ำในแผ่น parity เว้นแต่ sweep เจอต่าง):
| ใบ | ภาพ (run) | กรอบแบบ |
|---|---|---|
| P2.1U | vis57 (ตาเปล่าเทียบแบบ 10/12) | 09 · 10 · 12 |
| P2.2U | vis60 (products 35 · sales 70 · register en 37) · vis61 (register 104) | 06 · 01 · 12 |
| P2.3U | vis63 (19/19 rc 0 · 446 th + 77 en) | 06 · 10 |
| P2.4U | vis64 / vis65 PASS | 03 |
| P2.8U | vis66b + vis68 (owner/cashier th + owner en · 0 failures) | 09 |
| P2.6U | vis71 | 04 (+ derived 1024/390/Expo · `POS-OWNER-PENDING.md:132`) |
| P2.9U | vis72 → vis73/vis74 (V1–V4) | 02 · 02b · 12 |
| P2.5U | vis75 → vis76 (V1/V2/V4) | 15B · 15C · 03 |
| P2.11U | vis77 (24 + 18) + vis78 (ถ่ายซ้ำ 4 state) | 06 · 08 · 17A · 16 |
| P2.9bU | vis79 / vis80 | 02 · 02b · 12 |
| P2.10 | vis82 / vis83 (14 state 1280×800/1024×768 + settings) | 11A · 17B |
| P2.12U | vis84 / vis85 + `--pdf` probe | 08 |
| P2.13 | vis86–vis88 (settings คีย์ API ×5 + developers-pos · owner/manager th/en) · F-IMG1 Low developers-pos 390 th ตารางล้น → UI-6 (P2.14) | — (derived) |
| P2.7U | vis89 → vis90 → vis91 | 09 · 03 · 10 · หน้า `/q/**` (ของเดิม) |

เก็บตกจาก P1 ที่ลงใบนี้ (`POS-MASTER-PLAN.md` §4 ท้ายตาราง P2): (ก) 14B 390 ตะกร้าว่างไม่มีทางเข้าบิลพัก = UI-2 · (ข) 19ค การ์ดแดง PromptPay + print-failed เป็น toast ล่าง = UI-1 → U fix round ของ P2.14 · (ค)(ง)(จ) = เจ้าของอื่น (§4)

## §4 สิ่งที่เจ้าของต้องเคาะ (จาก `ledger/POS-OWNER-PENDING.md` · บรรทัดลงวันที่ ≥ 10 ต.ค. ที่ยังเปิด · `:N` = เลขบรรทัดในไฟล์ ณ 16 ต.ค.) — บรรทัดก่อน 10 ต.ค. ที่ยังเปิด = ดู HANDOVER-P1 §4 (ไม่ซ้ำ)
**⏳ เจ้าของยังไม่ตอบ (TG msg 4692) · ทำตามค่าแนะนำ · LEG-1–4 อยู่ใน commit แยก ถอนได้ก่อน merge**
- มติ P2.14 ข้อ 1 **ประตูเดิมร้านอาหาร = "กั้น ไม่ลบ"** (LEG-1–4): สาขาที่ผูก POS → route API เดิม `restaurant/{order,session,service-request}` + `(store)/…/restaurant/{bill,notify-payment}` ตอบ 409 `POS_LINKED` + ประตูใหม่ `/q/t/<qrToken>` · หน้า staff เดิม `checkout/tables/order/kds` redirect ไป POS + แบนเนอร์ · action เดิม + AI `restaurant_close_bill` ปฏิเสธ · lookup ล้ม = ปิด (fail-closed) · สาขาไม่ผูก POS = เดิมทุกไบต์ · ลบโมดูลเดิม = หลัง go-live (P6) · ถ้าเจ้าของค้าน ⇒ LEG-1–4 กลายเป็นความเสี่ยงที่รับไว้ (ช่องเก็บเงินซ้ำ :87 :90 :192 · session ผี :247) และเหลือแค่ redirect ของ P2.7 (ที่มา `:88` `:130` `:134` `:138` `:171` `:240` `:246`(5) `:247`)
- มติ P2.14 ข้อ 2/12 **API-1 เงินสดผ่าน `POST /sales` ต้องหากะได้**: `requiredOtherSources` เปิด ⇒ `shiftId` ที่ส่งมา หรือกะเปิดกะเดียว · 0 หรือ ≥ 2 กะ ⇒ 409 `SHIFT_REQUIRED` (ไม่มีบิล) · ปิด ⇒ เหมือนเดิม + `outOfShift: true` · สกิล/คู่มือแก้ตาม (ที่มา `:237`(6) `:238`)

**เคาะ (เจ้าของตัดสิน)**
- (ร้าน · P2.2 F5) โปรช่วงเวลาจบได้ถึง 23:59 — ต้องรับ "24:00" ไหม (:74)
- (คลัง V2 · P2.3 Q6) หน่วยซื้อ ≠ หน่วยใช้ — ตัวคูณแปลงหน่วยต่อสินค้าคลัง (:78)
- (คลัง/บัญชี · P2.3 Q6) ต้นทุนละเอียดกว่าสตางค์สำหรับวัตถุดิบ (:79)
- (บัญชี · P2.3 F8b) ตัดสต็อกค้างที่ลองใหม่ลงต้นทุนขายวันที่ลองใหม่ — รับ หรือให้ลงวันของบิลเดิม (:81)
- (ผู้คุม/เจ้าของ · runbook P6.1) `one_open_session_per_table` ยังไม่มีในฐานจริง (QC4 มีแบบสร้างมือ) + ขออนุมัติ query อ่านอย่างเดียว `SELECT count(*) FROM "RestaurantOrder"` บน prod ก่อน deploy (> 500k ⇒ ดัชนีแยกขั้น) (:86 · :94(4) · :141)
- (คลัง · P2.4 hunt) ตัดวัตถุดิบตอนเช็คบิล ไม่ใช่ตอนครัวทำ ⇒ ของที่ยกเลิกหลังเริ่มทำไม่ถูกบันทึกเป็นของเสีย (:93)
- (ออกแบบจอ 09 · P2.8) แบบฟอร์ม "+ คีย์ออเดอร์" (manual sheet) ไม่มีในภาพ — เคาะแบบ หรือใช้ข้อเสนอติดป้าย "derived" (:102)
- (ร้าน/เว็บร้าน · P2.8) `webPriceConflict` สินค้าเดียวราคาเว็บต่างกันหลายสาขา — ราคาเว็บรายสาขา หรือรวมราคาเดียว (:103)
- (เว็บร้าน · P2.8 fix 2) กติการาคาทุกช่องทางควรถึงหน้าเว็บไหม · 🚀 deploy: รัน `backfillWebPrices` ก่อนเปิดราคาเว็บแบบอ่านสองทาง (:106)
- (ร้าน · P2.8/P2.7 มติ 11) ความหมายของ "ปิดช่องทาง WEB/CHAT" (QR นิยามแล้ว) (:107 · :243)
- (เว็บร้าน · P2.8 H1) ปุ่มยืนยันรับเงินของหน้าจัดการเว็บร้านยังไม่แสดงเหตุผล `POS_ORDER_CLOSED` + หน้าลูกค้าควรแสดงว่าออเดอร์ถูกปฏิเสธ/ยกเลิก (:112)
- (ร้าน · HF-PP/HF-PP2) บัตรอยู่ใต้ค่าตั้ง "ผู้จัดการเป็นผู้ยืนยันเงินเข้าเท่านั้น" — ไม่ต้องการ = ถอด `"CARD"` ที่ `REGISTER_MANUAL_METHODS` (`pos/register-shared.ts`) จุดเดียว + ORACLE-EDIT p1.7 R4b / p2.4 P9 / p2.8 P10 (:124 · :143)
- (ร้าน · HF-PP fix 1 · PP-1) โอนไม่มีเลขอ้างอิงไม่อยู่ใต้ค่าตั้งนี้ — คงไว้ หรือเพิ่ม `"TRANSFER"` (:125)
- (ร้าน · P2.6) ภาพ derived ของจอ 04 (1024/390/Expo/ชีตของหมด/ใบครัว 17B) — เจ้าของดูภาพ P2.6U แล้วเคาะ (:132)
- (บัตรกำนัล · HF-GC/HF-GC2 · GC-1) ค้าง: F2 ช่องผูกบัญชีช้า · FU-2 `unsuspend` ยอดก่อน tx · FU-4 ตาข่ายใน consumer ล้ม = WARN ไม่มีตัวกวาด · `expireDue` `catch {}` กลืน JV ล้ม (:152 · :155 · :156 · :161)
- (ร้าน · P2.5 · RPT-9) จำนวนชิ้นของบรรทัดส่วนแบ่งในรายงานสินค้า + คืนเงินบรรทัดส่วนแบ่งคืนสต็อกทั้งรายการ — ข้อเสนอ: ส่วนแบ่งไม่คืนสต็อกเสมอ (:164 · :165)
- (บัญชี/นักบัญชี · blocker ก่อน go-live) แบบจำลอง VAT: บัตรของขวัญ/เครดิต `STORED_VALUE` → 2110 (:175) · มัดจำ VAT ตอนรับเงิน (:199) · สมุดเลิกจด VAT ระหว่างรับกับใช้มัดจำ (:210) · นโยบายเดียวของการคืนเงินหลังเลิกจด VAT ทุกวิธีชำระ (:212)
- (บัญชี + บัตรกำนัล · CD1b) ยอดยกมา Cr 2110 ของบัตรที่ขาย/เติมตอนสวิตช์ผูกบัญชีปิด (:176 · :190)
- (บัญชี · CD9) แยก 2111 เงินรับล่วงหน้า–บัตร/เครดิตร้าน ออกจาก 2110 (:177 · :204)
- (บัญชี · CD11) บัตรใช้ข้ามสมุด — inter-book clearing หรือจำกัดบัตรต่อสมุด (:178)
- (บัญชี + จอง/โรงแรม/เช่า · CD7) มัดจำทางเดิมลงเป็นรายได้ + เช็คเอาต์โรงแรมรายได้ซ้ำ — ทางแก้ `applyExternalDepositReceipt` (:179 · :201)
- (ร้าน · CD5) ถ้อยคำ "เครดิตร้าน" (ยอดเครดิตของสมาชิก ไม่ใช่วางบิล) (:180)
- (บัตรกำนัล/สมาชิก · GC-2) รายการบัตร/KPI/กระเป๋าสิทธิ์ปนเครดิตร้าน · `registerMemberBenefits.giftCards` ไม่มี `kind`/`status` (:183 · :196)
- (ร้าน/แพลตฟอร์ม · P2.9 F5) ตัวนับ PIN ผิดเขียนนอก tx ⇒ ใช้ 2 connection ต่อบิลทาง callerTx — pool ≥ 2 × เครื่อง หรือตารางแยก (:188)
- (ร้าน + บัญชี · P2.9 H4) void บิลที่จ่ายด้วยบัตรซึ่งหมดอายุแล้ว = ยอดคืนหมดอายุทันที — หรือคืนเป็นเครดิต/เงินสด (เปลี่ยน = ORACLE-EDIT C5) (:189)
- (ร้าน + บัญชี · P2.9b CD6 · DEP-3) หมดอายุ/ริบมัดจำ — ใบถัดไป (:202)
- (ร้าน · P2.9b มติ 14) ยืนยัน: ปิดสวิตช์มัดจำ = รับใหม่ไม่ได้ แต่ของเดิมยังใช้/คืนได้ (:203)
- (ร้าน · P2.9b deviation 4 · DEP-2) คืนมัดจำผ่านสายอนุมัติ POS_REFUND ต้องการไหม (:207)
- (ร้าน · P2.11 Q7) ผู้จัดการบางสาขาได้จอ 06 แบบสาขา (กลับมติ HF-POS-PAGES ข้อ 1) — ยืนยัน (:215)
- (ร้าน · P2.11 Q10) สูตรต่อสาขา (`RecipeLine.unitId`) ต้องการไหม (:216)
- (ร้าน · P2.11 Q5) ค่าบริการ/ทิป/ข้อความท้ายใบเสร็จต่อสาขา (:217)
- (บัญชี · P2.11) ใบกำกับเต็มรูปพิมพ์สาขาของสมุด ไม่ใช่สาขาที่ขาย (:218)
- (ร้าน · P2.11 F2 · PRC-4) จำกัดสิทธิ์อ่าน `unitPriceMatrix` (:220)
- (ร้าน · P2.12 มติ 3) เกณฑ์จุดผิดปกติ A1–A10 — ยืนยัน/แก้ตัวเลข · "เปิดลิ้นชักโดยไม่ขาย" ยังไม่มีบันทึก (RPT-10) (:228)
- (ร้าน · P2.13 มติ 5) เปิดบัตรของขวัญ/เครดิต/มัดจำ/แต้มผ่าน API เมื่อไร (PIN ผ่านแอปบุคคลที่สาม) (:232 · ปิดบรรทัด :187)
- (ร้าน · P2.13) บิล API ยังไม่เข้า KDS — ใช้ `POST /orders` แทน หรือเปิดใบถัดไป (:234 · :235)
- (ร้าน · P2.7 S5 · QR-8 · QR-4) เงินเข้าหลังออเดอร์จ่ายก่อนถูกปิด = ops ERROR + คืนนอกระบบ (ไม่มีคืนผ่าน Beam) · QR พร้อมเพย์นิ่งไม่มีเลขอ้างอิง EMV tag-62 (ทดสอบกับแอปธนาคาร) (:245 · :246(1))
- (แกน · O3 · HF-P1CLOSE) เปลือกแอปภาษาอังกฤษ — ใบ i18n ของ app shell (:97)
- (โมดูลอนุมัติ · O12) ภาพหน้า `/app/approvals` 390 ในชุดภาพแกน เทียบ 21A (:98)
- (สมาชิก · MAIN-MERGE) แก้ seed/fixture สมาชิกบน QC4 ให้ m2.6–m2.8 (+ m1.7) รันได้ — POS ห้ามล้าง seed (:111 · :117)

**รับทราบ / ตรวจรับ (ไม่ต้องตัดสิน · เจ้าของโมดูลอ่านแล้วรับ)**
- (คลัง) `consumeBatch` + `lockItemsInTx` อาร์กิวเมนต์ที่ 4 (P2.3 S) (:77) · จอ 06 อ่าน `InvItem` ตรงแบบอ่านอย่างเดียว (P2.3U F5) (:82)
- (บัญชี) void/คืนของกลับต้นทุนขายที่ต้นทุนการตัดเดิม (P2.3 F8a) (:80) · บรรทัดบิลโต๊ะไม่มี `priceSource` (:92)
- (ร้านอาหาร) migration `pos_p24_tables` + facade `restaurant/index.ts` (P2.4 S) (:85) · migration `pos_p26_kds` + `restaurant/kitchen.ts` (P2.6 S) (:129)
- (ร้านอาหาร) เช็คบิลเดิม `PAYMENT_MISMATCH` กับส่วนลดระดับ + ค่าบริการปัดต่างกัน 1 สตางค์ (:89) · บิลโต๊ะรวม QR PENDING / void หลังโต๊ะเปิดใหม่ / intent PAID ที่บิลถูกปฏิเสธ (:94(1)–(3))
- (ร้านอาหาร · ประตูเดิม → LEG) จอครัวเดิมปฏิเสธรายการที่ชำระแล้ว (:130) · ประตูเดิมบนรอบครัวใหม่: คืนตัวนับเต็ม qty / `advanceItem` เขียนทับ / ปลด 86 / deadlock ฝั่งหน้าเดิม (:134 · :138 · :139) · ตัวกันแผนแยกบิลของหน้าเดิม/AI ตรวจก่อน tx เดิม (ช่องแคบ) (:171 · :192)
- (เว็บร้าน) `shop/service.ts` สะท้อน ShopOrder เข้าจอออเดอร์ + ราคาเว็บอ่านสองทาง (P2.8 S) (:101) · ยกเลิกออเดอร์เว็บที่ยังไม่จ่ายจากจอ POS = ยกเลิก ShopOrder (:113)
- (ร้าน/สมาชิก) บิลของออเดอร์ไม่แนบ `memberId` (แต้ม = P3.7) (:105)
- (ร้าน) ส่งมอบถูกปฏิเสธเมื่อบิลของออเดอร์ถูกยกเลิก (ตัวรับ `posOrderOnSaleVoided` ย้ายเข้า main consumer chain แล้วใน HF-FU) (:114)
- (บัญชี) เลข JV `count()+1` (O24) — **ปิดแล้ว** โดย main 71a1f363 (C5.4-N sequence + C5.5 alloc lock) ผ่าน MAIN-MERGE `0d581286` (:104 · :108 · :109) · `ensureNamedCustomerContact` → `ciEquals` (:110)
- (บัตรกำนัล) HF-TX เปลี่ยนทางเรียกบิลขาย/เติมบัตรเป็น `callerTx` + `afterSaleCommitted` · ⚠️ m2.6–m2.8 ยังไม่เคยรันกับ HF นี้ (:117) · H1/H2 ของ hunt HF-TX **ปิดโดย HF-GC** `071402d8` (:118 · :119)
- (ทุกโมดูล) helper `"$transaction" in` ที่ HT7 นับ (:120)
- (ร้าน) ช่อง REST ไม่ผ่านด่าน "ผู้จัดการยืนยันเงินเข้า" (:126) — **แทนที่ด้วย** :236 (P2.13 fix1: คีย์ API รับได้เฉพาะ เงินสด/โอน/แพลตฟอร์ม เมื่อเปิดค่าตั้ง) · ไม่มี REST รับเงินออเดอร์ (:144)
- (ร้าน) พักครัว = พักเว็บร้าน/แชท/API ด้วย (:133) · ออเดอร์ค้าง NEW เพราะพักครัว — **ปิดโดย HF-FU** (`releaseHeldOrders`) (:135) · ตั๋วข้ามเที่ยงคืน (:136) · heal ตั๋วที่หลุด + ตั๋วผีเมื่อย้ายสถานี (:137)
- (บัตรกำนัล/บัญชี) HF-GC `ensureGiftCardSalePosted` + ตัวอ่าน `giftCardSaleEntryId` + ทางขายซ้ำอ่านธงจาก payload (:147–:150) · HF-GC2 ปิด FU-1/F3 (:159 · :160)
- (ร้าน/นักบัญชี · P2.5) VAT ของบิลแยกต่าง ≤ ⌊(N+1)/2⌋ สตางค์ (:166) · หารเท่าเมื่อปิดค่าบริการ เศษ ≤ ฿2/200 รายการ (:167) · void ใบหลังโต๊ะมีลูกค้าใหม่ค้างจ่าย (UI-17 · P3) (:169)
- (ร้าน) รอบร่างกำพร้า + รวมโต๊ะเดิมไม่ย้ายแผน DONE — **ปิดโดย HF-FU** (orphan table-draft sweep · `legacyMergeSplitGuard`) (:170 · :173)
- (บัตรกำนัล/สมาชิก) P2.9 schema `GiftCardKind` + service tender (:181) · `mergeGiftCards` ย้ายเครดิตร้าน ไม่มีข้อสอบ (:182)
- (บัญชี) facade เพิ่มล้วน: `applyExternalSale.tip` + `crExtra` + `postExternalRefund` (:184) · `archiveLedger`/`updateLedger` ปฏิเสธบัญชีพักทิป (:191) · ชั้นเอกสาร `DEPOSIT_RECEIPT` + `upsertExternalSaleDocument` (:200)
- (ร้าน) ทิป: บัญชีพักทิปต้องเป็นหนี้สิน · คืนเงินไม่คืนทิป · จ่ายทิปให้พนักงาน = HR (:185)
- (POS) `refundTenderCaps` ฟังก์ชันเดียว — **DONE** (brief P2.14 แถว 92) (:195)
- (ร้าน) ใบรับมัดจำยกเลิกไม่ได้ ใช้ "คืนเงินมัดจำ" · มัดจำสมาชิก/walk-in (:205) · walk-in ไม่มีเบอร์เดาเลขได้ — **ปิดโดย P2.9bU** (บังคับเบอร์ walk-in) (:208 · :209) · บิล ฿0 จบ DONE ด้วย zeroEntry (:211) · intent PAID ไม่มีใบรับมัดจำ (กระทบยอดเอง) (:224)
- (ร้าน) สต็อกของสาขา = ระบบคลังของสาขา · โอนสองขั้น = การ์ด P2.12T (:219 · :227) · แถวราคาที่เลิกใช้กลับมามีผล + `purgeDead` (:221) · บันทึกราคาพร้อมกันสองจอ — **ปิดโดย HF-FU** (`expectedRowsHash`) (:222)
- (ร้าน) จอลูกค้าต้อง Chrome ≥ 111 / iPadOS ≥ 16.4 (:226) · สิทธิ์ `pos.report.anomaly` (PDPA) (:229)
- (ร้าน) บิล API ผูกกับคีย์ (ออกคีย์ต่อแอป) (:233) · บิล API ยกเลิก/คืนจากลิ้นชักบิล + กติกาอนุมัติเดียวกัน (:235) · ค่าตั้งยืนยันมือ ⇒ API รับเฉพาะ เงินสด/โอน/แพลตฟอร์ม (:236)
- (ร้านอาหาร) ✅ P2.7 ปิดบรรทัด :91 (รอบ QR ถือล็อก session) · :131 (event 86 ของ QR) · :168 (QR ของโต๊ะที่ย้าย/รวม) (:240 · :241 · :242)

**ผู้คุม / HF-FU2 (ถังที่ไม่เคยเปิด → ไล่ใน P2.14 · ผลจริงดู `wo-notes/pos-P2.14.md`)**
- (DOC-6) คอมเมนต์ P1.7 ของ `regCreateSale` ไม่จริงตั้งแต่ Prisma 7 (:121)
- (CONTROLLER-RUN · P6.1) นับแถว `PosPayment` บน prod แบบอ่านอย่างเดียว (:186) · migration P2.9b ขึ้น QC5/prod = ผู้คุม (:206)
- (DEP-1) คำปฏิเสธ `DEPOSIT_NOT_OWNER/LOCKED/NOT_FOUND` เพิ่ม `depositId` (:223)
- (ACC-1 · brief จัดเป็น OWNER บัญชี) คืนบิล PLATFORM หลังย้าย POS ไปสมุดใหม่ ไม่กลับค่าคอมฯ อัตโนมัติ (:225)
- (API-3 · API-5 · API-6 · API-2 · API-7 · API-1 · API-8) P2.13 fix1 follow-ups (1)–(7): audit `actorType` ของคีย์ · คีย์บริการใบกำกับ · REST void ปิดออเดอร์ครบทุกสถานะ · เพิกถอนคีย์ตามสาขา · เล่นซ้ำหลัง TTL · เงินสดนอกกะ · รูปผลเมื่อ `duplicated` (:237)
- (API-1) เงินสดนอกกะสองทาง (ก) ปิด requiredOtherSources (ข) เปิดแต่ ≥ 2 กะ (:238)
- (API-4) คำขออนุมัติจาก REST แสดงรหัสคีย์ดิบ (:239)
- (QR-3 · QR-5 · API-9 · QR-7) P2.7 S follow-ups: คีย์กันส่งรอบซ้ำถาวร · นัดรับ/ส่งถึงบ้าน (P3) · ป้ายแหล่ง void ของ AI/REST · เตือนสาขาไม่มีพร้อมเพย์/Beam (:244)
- (QR-4 · QR-1 · QR-2 · QR-3 · LEG-1 · QR-6) P2.7 fix 2 follow-ups (1)–(6) (:246)
- (LEG-1) route เดิม `service-request` + `session` ยัง get-or-create session บนสาขาที่ผูก POS (:247)
- (สถานะใบอื่นที่ส่งต่อมา) บรรทัด HF-FU2 ใน brief P2.12 (:79–:81 · :91) และ RESUME (:1609 · :1615 · :1645 · :1783) = ถังเดียวกัน (brief P2.14 ⚠️9)

**จำนวน**: รอเจ้าของตอบ 2 · เคาะ 40 ข้อ · รับทราบ 25 ข้อ (อ้างบรรทัด OP 68 บรรทัด · บางข้อรวมหลายบรรทัด) · ผู้คุม/HF-FU2 11 ข้อ

## §5 ของค้าง / เก็บตก
**ไล่แล้วใน P2.14**: แถว FIX ของตาราง follow-up 94 แถวใน brief P2.14 §1 (FIX 59 · รวม LEG-1–4 + API-1 ที่รอเจ้าของ) = burned down in P2.14 — see `pos-P2.14.md` (ไม่ลงซ้ำที่นี่ · แถวที่ builder ไม่ได้แก้/ถูก veto = ผู้คุมเติมจากโน้ตนั้นตอน merge)

**ส่งต่อ P3 / ใบของตัวเอง (brief P2.14 §1 (e) + แถว P3)**
- QR-5 สั่งล่วงหน้าแบบนัดเวลารับ + ส่งถึงบ้าน
- P3-1 บัตรของขวัญ/เครดิตร้าน/มัดจำ/แต้มผ่าน API (PIN ผ่านแอปบุคคลที่สาม) · payment intent ผ่าน API · op ที่เหลือของ P2.13 IN-B · `POS_TOOL_SCOPES` ถูก general-key gate บัง (info) · PIN hash สองครั้งตอนจ่ายส่วนแบ่ง
- voucher เป็นวิธีชำระ (`PosPayType` ไม่มี VOUCHER · DOC-1 → "P3") · `callQueueFromTable` · `advanceBookingBill`
- บิล API เข้า KDS · คืนเงินผ่าน Beam · ตรวจสลิป (P3.10) · adapter LINE MAN/Grab/Shopee (P3.1–P3.3)
- DEP-3 หมดอายุ/ริบมัดจำ
- TL-7 cron `retryPendingStockCuts` + pending-restore retry · KDS `setReady`/adapter retry ผ่าน outbox
- UI-14 ของหมดระดับตัวเลือกใน OptionsDialog (ต้องมี availability ต่อ choice ฝั่ง S)
- UI-15 บัตร/เครดิต/สิทธิ์สมาชิก/ใบกำกับเต็มรูป ที่เช็คบิลโต๊ะและจ่ายส่วนแบ่ง
- UI-17 ตัวช่วยจ่ายใบส่วนแบ่งที่ void หลังโต๊ะเปิดใหม่ (`TABLE_SESSION_CLOSED`)
- UI-13 ชื่อ/ระดับสมาชิกบนแผงออเดอร์ (P3.7) · `memberId` บนบิลออเดอร์ (P3.7)
- RPT-8 สรุป KPI หน้าเดียว A4 · SQL aggregation ของรายงานเก่า (P5)
- โอนสองขั้น/ข้ามคลัง + ตัดสต็อกต่อ location = การ์ด P2.12T · สูตรต่อสาขา · ค่าบริการต่อสาขา · snapshot อัตราค่าคอมฯ บนบิล
- onboarding/นำเข้า CSV/ชุดตัวอย่าง = การ์ด 18 (O10 · ไม่เคยเปิด)

**รอเจ้าของ (OWNER ในตาราง brief · รายละเอียด §4)**: QR-4 · QR-8 · ACC-1 · ACC-4 (สมุดปิดชั้นเอกสาร ⇒ zero-entry ค้าง `posSalePosted=false` · รับไว้) · DEP-2 · PRC-4 · PP-1 · GC-1 · GC-2 · RPT-9 · RPT-10 · UI-3 (ชิป "เครื่องนี้" ของบิลพัก ต้อง migration) · UI-13 (แบบ manual sheet) · UI-16 (ผู้จัดการสาขาเดียวล้างแถวราคาตายไม่ได้) · TL-3 (eslint ไม่ได้ติดตั้งใน node_modules ร่วม — ห้าม `pnpm add` ในเลน) · OWN-1 (บรรทัดรับทราบ/ยืนยันของโมดูลอื่น ≈ 60 บรรทัด) · OWN-2 (O3 app shell en · การ์ด 18 · O12 21A)

**runbook P6.1 / deploy**
- TL-6 ดัชนี CONCURRENTLY (`PosSale(channelId)` · order lines/events · `one_open_session_per_table`) + นับแถว `RestaurantOrder` / `PosPayment` บน prod ก่อน (อ่านอย่างเดียว · ต้องได้อนุมัติ)
- migration P2 14 ไฟล์ขึ้น prod ตามลำดับ · `backfillWebPrices` ก่อนเปิดราคาเว็บอ่านสองทาง · รัน 5 ชุด `qc-account-api-*` (acc-v2-seed) บนเลน acc-v2 · `qc:all` บน Neon branch ส่วนตัว (O27)
- API v1 POS ยังไม่ขึ้น prod ⇒ การเปลี่ยนรูป DTO (API-10/11) ทำได้ถึง P6.1 · หลัง deploy ต้องมี versioning

**เครื่องมือผู้คุม (นอกรีโป)**: DOC-4 `build-{c,d}-inner-8g.sh` hard-code ทรี (`cd /root/projects/shark-pos-{c,d}` บรรทัด 3 · vis87 ใช้ไม่ได้เพราะเหตุนี้) — ทำ `TREE` เป็นพารามิเตอร์ · `scripts/with-gate-lock.sh:8` ค่าเริ่ม typecheck 3584 MB (สคริปต์ร่วมกับเลน CRM — ไม่แก้ · ใช้ env ทับ)

**ระดับรีโป**
- `session/pos` = `origin/main` 71a1f363 + 2,262 commit (MAIN-MERGE `0d581286` 10 ต.ค. · main ยังไม่มี commit ใหม่หลังจากนั้น) · ไม่มีอะไรของ POS V2 ขึ้น main/prod · ⛔ push main = ต้องขอเจ้าของ (P6)
- P1.1b ส่วน B — **DONE** ใน MAIN-MERGE (brief P2.14 แถว 94)
- `.claude/` gitignored: สกิล POS ย้ายมา track ที่ `skills/shark-pos-api/` + `scripts/sync-skills.sh` (P2.14 มติ 4) · สกิลของ crm/member/kanban/account ยังอยู่ใต้ `.claude/skills` กับเจ้าของ (บรรทัด OP)

**จำนวน §5**: ส่งต่อ P3 13 · รอเจ้าของ 17 รหัส · P6.1 3 · เครื่องมือ 1 · ระดับรีโป 3

## §6 วิธีรัน
**QC4 vs QC5** (เหมือน P1 §6)
- QC4 = Neon `wo-pos-qc4` (host `ep-frosty-lab`) · ข้อสอบ DB ของ builder/oracle/ด่าน merge · `scripts/qc4.sh` ปฏิเสธ prod/QC1/ค่าว่าง · เลน POS ใช้ล็อก `env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock` (ทาง A · 8 ต.ค.)
- QC5 = Neon `wo-pos-qc5` (host `ep-fragrant-thunder`) · **เลนภาพเท่านั้น** (เซิร์ฟเวอร์ + `visual-pos.mts` บนทรี d) · `scripts/qc5.sh` · `POS_QC_ALLOW_HOST=ep-fragrant-thunder` · migrate ถึง P2.7 แล้ว (`prisma migrate deploy` แบบ additive ผ่าน `qc5.sh`) · ⛔ **ห้าม reseed ทั้ง QC4 และ QC5** · ห้ามชุดที่ล้างข้อมูลร่วม (`seed-member-qc`, `seed-hr-qc`, `migrate reset`, `qc:all` ทั้งรีโป) · sweep ภาพเขียนแถวเงินจริงบน QC5 (บิล · มัดจำ · บัตร · เครดิตสมาชิกโต ฿200 ต่อรอบ — TL-4) ⇒ sweep เดียวต่อทิป · เคลียร์ DEVICE_LIMIT / MANAGER membership ค้างก่อน sweep

**ด่าน (QC4)**
- ทั้งชุด (P2.14): `bash scripts/pos-gates-all.sh` อ่าน `scripts/pos-gates.json` · ออก `/root/pos-runs/p214-close-<tree>-<UTC>/` (`HEAD.txt` · `<name>.log` บรรทัดท้าย `EXIT <code>` · `SUMMARY.txt` = `<name> <exit>` ตามลำดับ manifest + `DONE`) · `--dry` พิมพ์ `PLAN <name> <forced|unforced|command>` ไม่รันอะไร · `mode forced` = ชุดมีด่าน SKIP ⇒ รันด้วย `QC_FORCE=1` · `needs` = เครื่องหมาย `// requires: <x>-seed` · `accepted` = แดงที่รับไว้ (มีเหตุผล + เจ้าของ + `opRef` ใน OP)
- ทีละชุด: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts` (ชุด p2.14 ใช้ `ISO_MEM=7G` เพราะ Q5/Q6 แตก child 2 ตัว)
- fitness: `pnpm exec tsx scripts/fitness.mts` (ไม่มี env) + `bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts` + `pnpm exec tsx scripts/fitness-pos.mts` · `gen-pos-api-docs --check` exit 0
- **typecheck heap 8192 MB / ISO_MEM 10500M** (ตั้งแต่ P2.7 · RESUME 22:10Z "typecheck heap 8192 ตั้งแต่นี้") บนล็อก `/tmp/pos-gate.lock` · `scripts/with-gate-lock.sh:8` ค่าเริ่ม 3584 และ LANE-RULES §5 ยังเขียน 5632 = เก่า (DOC-3)
- สคริปต์ผู้คุม `/root/pos-runs/ctl-scripts-2026-10-09/`: `gatesNN-c.sh` (ล่าสุด gates106/107 · ทรี c detached) · `chainNN.sh` (build + ภาพ · chain87) · `vis91-c.sh` (ถ่ายเฉพาะ state ไม่ build) · `build-c-inner-8g.sh` / `build-d-inner-8g.sh` · `templates/` (gates101/104/106 · chain84/86/87 · vis91 · ข้อความ merge p27/p27u/p213/p213s ที่มี `__HEAD__`/`__BASE__`)

**build (ทรี d · ผู้คุมเท่านั้น · builder ห้าม build/serve)**: `build-d-inner-8g.sh` (heap 8192 · ISO_MEM 10500M · tsc 7168 เคย OOM 14 ต.ค.) · next build จาก session = OOM รีสตาร์ต ⇒ ผ่าน `systemd-run`/`iso.sh` เท่านั้น

**ภาพ (QC5 · ทรี d · พอร์ต 3228)**: `bash scripts/qc5.sh env ACC_V2_PORT=3228 bash scripts/acc-v2-serve.sh start` → `bash scripts/iso.sh bash scripts/qc5.sh env CI=1 [LOCALE=en] pnpm exec tsx scripts/visual-pos.mts <wo> --states [--state <id>…] --user owner|cashier|manager --tenant coffee [--page <page>] --base http://127.0.0.1:3228` → `… acc-v2-serve.sh stop` · `POS_PAGES` = register sales products close reports stock shifts settings receipt-public tables orders kds display + qr-public (P2.7U) · ขนาด 1440×900 / 1024×768 / 390×844 (+ display 1280×800 / 1024×768) · **แผน P2 เปิดตามชื่อ wo ไม่ใช่ `all`** (`p2.2u` … `p2.13` · `p2.7`) และ settings/sales/shifts/stock/products ต้อง `--page` · `--list` ไม่ต้อง DB/chromium · `--dry` แสดงสิ่งที่จะเขียน · `LOCALE=en` = 1440 อย่างเดียว ยกเว้น KDS และ `EN_MOBILE_PAGES` (register · sales · receipt-public · display · qr-public — มติ 6 · P2.14) · ภาพออก `shark-pos-d/.qc-shots/pos/<wo>/` · montage เทียบแบบด้วย python PIL (ตัวอย่างใน `pos-P2.7-review.md` vis89–91) · sweep ปิดเฟสตาม `scripts/pos-visual-sweep.json` (P2.14)

**🔴 กับดัก**
- **CI**: `scripts/with-gate-lock.sh` ข้าม `flock` เมื่อมี `CI`/`VERCEL` ⇒ สคริปต์ด่านห้าม `export CI` · ใส่ `CI=1` เฉพาะคำสั่ง visual · runner P2.14 `unset CI VERCEL` ที่หัว
- **systemd-run ไม่สืบ cwd** ⇒ สคริปต์ที่ส่งเข้า unit ใช้ path เต็มทุกตัว (gates87) · `systemctl stop` ไม่หยุด unit `iso-<pid>-<ts>` ที่ซ้อน → ดู `systemctl list-units 'iso-*'` · timeout บน `iso.sh` ทิ้ง unit tsc ค้างและถือล็อก
- **flock ซ้อนบนไฟล์เดียวกัน = ล็อกตัวเอง** (chain64) · ห้ามแก้สคริปต์ที่ unit กำลังรัน
- **ห้าม `cd`** ในเลน (ใช้ `git -C` / `env -C` · Bash ขนานใช้ cwd ร่วม)
- **สกิล**: `.claude/` gitignored ⇒ ตัวจริงของสกิล POS = `skills/shark-pos-api/` (track · P2.14 มติ 4) + `scripts/sync-skills.sh` คัดลอกไป `/root/.claude/skills` และ `/root/.claude-b/skills` แล้วเทียบไบต์ · ทรีอื่นที่รัน `qc-pos-api-skill`/`gen-*-api-docs` ของโมดูลอื่นยังต้องคัดลอก `.claude/skills/*` เอง
- pre-commit fitness แดง "model ไม่มีใน schema" = Prisma client เก่า → `prisma generate` ตอนทรีว่าง · ทรี: b/c = builder/ด่าน · d = build + ภาพ (+ builder P2.14) · node_modules ร่วม ห้าม generate ขณะเลนอื่นใช้
- คีย์ API ห้ามลง log/commit · คีย์ทดสอบ agent ของ P2.13 เพิกถอนแล้ว

## §7 สถานะ ณ วันส่งมอบ (ท้าย `POS-RESUME.md` ถึง 03:56Z 16 ต.ค. + ผู้คุมเติมตอน merge)
- **P2.7U** merge `64923c13` (no-ff จาก `wip/pos-p2.7u` `1c354079`) · gates106 DONE (แดงเฉพาะหมุด hf-fu ST1 · §2) → push `session/pos` แล้ว → gates107 (hf-fu) กำลังรัน → เขียว = **43/55**
- **P2.14** brief `ledger/pos-briefs/pos-brief-P2.14.md` (94 แถว follow-up · §10 มติ 1–24) · oracle ส่งแล้ว (`origin/wip/pos-p2.14-oracle` · 56 เช็ก · red-before 8/56 · manifest 2 ไฟล์) · **S builder** (บัญชี A · ทรี d · `wip/pos-p2.14` = ฐาน P2.7U + merge oracle) spawn 03:52Z · prompt `pos-briefs/pos-prompt-accountB-P2.14-S.md` · ถัดไป R1 + money hunter (LEG guard · API-1 · DSP-1 · QR-1/3 · API-2/9) → fix → R2 → merge `05975437` → gate set → build ทรี d → parity sweep → U fix round → gate set อีกครั้ง → push
- **HANDOVER-P2** = ไฟล์นี้ (drafter อ่านอย่างเดียว · ขนานกับ S builder ตามมติ 11) · ผู้คุมเติม `05975437` `e1c4d999` `__GATESET_PATH__` `__GATESET_RESULT__` `__PARITY_SUMMARY__` `__QCALL_NEON__` `__COUNTER__` แล้วรัน H1 ของ `qc-pos-p2.14` (`--no-db`)
- **เจ้าของ**: TG msg 4692 ยังไม่ตอบ (§4 ข้อแรก) · เช็กพอยต์ "ปิด P2" (`POS-MASTER-PLAN.md` §5 จุดตรวจเจ้าของ) หลัง HANDOVER-P2 + parity
- **P3** (12 ใบ · `POS-MASTER-PLAN.md` P3): ยังไม่มี brief · ใบที่รอของเจ้าของ (P3.1–P3.3 partner API · P3.10 Beam/สลิป · P3.11 e-Tax) ทำโครง + ปิดสุภาพก่อน · ทุกใบที่แตะ `register.ts`/`service.ts`/`prisma/` ต้อง ORACLE-EDIT หมุด SHA ฐาน P2.14 ตอนตั้งใจแตะ (มติ 3)
- เลน: เพดาน 2 เลน builder (กติกา RUN) · ตอนร่าง = เลน 1 S builder P2.14 (ทรี d) · เลน 2 drafter HANDOVER-P2 · ด่าน/บิลด์/ภาพ (gates106) ไม่นับเลน · ⛔ ห้าม push main · ส่งไม้บัญชีเมื่อ weekly 97%
