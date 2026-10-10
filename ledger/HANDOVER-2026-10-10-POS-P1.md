# HANDOVER — POS ใหม่ ปิดเฟส P1 "เครื่องคิดเงินใช้ได้ทั้งวัน" (P0 3 ใบ + P1 ครบ ยกเว้น P1.1b ส่วน B)

วันที่: 10 ต.ค. 2569 (UTC) · worktree `/root/projects/shark-pos` · branch `session/pos` (local head `cda17070` · `origin/session/pos` = `f71990b6` — merge HF-P1CLOSE `db5af8c2` ยังไม่ push รอ gates62 เขียว) · ผู้คุมงาน: บัญชี A · ร่างโดย drafter (อ่านอย่างเดียว) · ⛔ ห้าม push main · แหล่งความจริงสด = ท้าย `ledger/POS-RESUME.md`

## §0 สรุป 10 บรรทัด
1. P1 ส่งมอบหน้าขายใหม่ทั้งวงจร: แคตตาล็อกเดียว (P1.1a/b) · ตัวเลือก/variant/ชั่งน้ำหนัก (P1.2) · หน้าขาย 3 ขนาด + บาร์โค้ด + พักบิล (P1.3–P1.5) · จอชำระ split/ทอน/ค่าบริการ + PromptPay/Beam/บัตร (P1.6–P1.7) · คืนเงินบางส่วน+CN (P1.8) · กะ/X/Z/นับซ้ำ (P1.9/P1.9b) · เครื่อง+เครื่องพิมพ์+ใบเสร็จ 58/80 (P1.10) · ใบเสร็จออนไลน์ `/r/<token>` (P1.11) · สมาชิกที่ตะกร้า (P1.12) · ใบกำกับเต็มรูป (P1.13) · ตรวจนับมือถือ (P1.14) · PIN/เพดานส่วนลด/อนุมัติ (P1.15) · บิลวันนี้ (P1.16) · รายงาน 7 ชุด (P1.17) · ตั้งค่า 8 แท็บ + th/en (P1.18)
2. **มติผู้คุม 10 ต.ค. 01:0xZ: ตัวนับ = 23/55** นับตามแถวแผน `POS-MASTER-PLAN.md` = P0 3 + P1 19 แถว (P1.1a + P1.1b + P1.2–P1.18) + P2.1 · **P1.1b นับปิด** (ส่วน A รับ `cb1a2331` · ส่วน B = 2 จุดใน `account/service.ts` เป็นงานติดตามหลัง merge main — `POS-RESUME.md:444`) · P1.9b เป็นใบติดตาม ไม่นับ · RESUME เคยนับ 24/55 (เกิน 1 จากการนับซ้ำ — ดู §1 หมายเหตุ) → แก้เป็น 23/55 แล้ว
3. โค้ด: `src/lib/modules/pos/*` (service/register/catalog/catalog-legacy/refund/shift/held-cart/receipt*/bills/reports/staff-pin/pos-approval/tax-invoice/device/payment-intent/settings-*) · UI `src/components/pos/{register,settings,print}` + `src/app/app/sys/[id]/pos/{register,sales,shifts,reports,stock,products,close,settings}` · ใบเสร็จสาธารณะ `src/app/(store)/r/[token]` · ข้อความ `src/messages/{th,en}/pos.json`
4. migration ของ P1 = 16 ไฟล์ `20261120000000_pos_v2_a` → `20261202100000_pos_p112_member_snapshot` (QC4 เท่านั้น · ยังไม่ขึ้น prod)
5. ข้อสอบ: `scripts/qc-pos-p0.2.mts` + `qc-pos-p1.*.mts` 19 ชุด + `qc-pos-{closeday,coupon,inventory,products,register,account}` · fitness `scripts/fitness.mts` (41) + `scripts/fitness-pos.mts` (8) · ภาพ `scripts/visual-pos.mts` (78 state id ตาม `--list`)
6. ด่านปิดเฟส R14 (§2): เขียวทุกชุดบน QC4 ยกเว้นข้อยกเว้นที่รับไว้ 2 กลุ่ม (`qc-acc-v2-pos-lines` · `qc-member-m2.7/m2.8/m1.7`) · `qc-pos-p0.2` ต้อง ORACLE-EDIT `66555aa6` → 56/56 · gates62 (จุด merge HF-P1CLOSE) **เขียว 12/12** · push แล้ว
7. parity R15 (§3): 157 แถว = 4 MATCH / 105 DEVIATION / 48 OPEN ที่ vis56 → ผู้คุมเคาะ O1–O13 → การ์ด HF-P1CLOSE merge `db5af8c2` · ภาพยืนยันชุดสุดท้าย = **vis59 เขียวทุกหน้า** (addendum §3)
8. รันด่าน (QC4): `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-<id>.mts` · **ห้าม export CI ในสคริปต์ด่าน** (§6)
9. รันภาพ (QC5 เท่านั้น): `bash scripts/qc5.sh env ACC_V2_PORT=3228 bash scripts/acc-v2-serve.sh start` แล้ว `bash scripts/iso.sh bash scripts/qc5.sh env CI=1 pnpm exec tsx scripts/visual-pos.mts <wo> --states --user owner|cashier --tenant coffee --page <page> --base http://127.0.0.1:3228`
10. P2 ณ วันส่งมอบ (§7): P2.1 S+U merge แล้ว · P2.2 S merge แล้ว / U กำลังสร้าง · P2.3 S กำลังสร้าง · oracle P2.4/P2.8 อยู่บน session/pos แล้ว · เจ้าของสั่ง 00:45Z ลดเพดานเหลือ 3 เลนเมื่องานปัจจุบันจบ

## §1 ใบที่ปิด (P0.1–P1.18)
SHA = commit รับงาน/merge บน `session/pos` (ตรวจด้วย `git merge-base --is-ancestor` แล้วทุกตัว) · วงเล็บ = head โค้ดของ wip · จำนวนข้อ = ผลล่าสุดในด่านปิดเฟส (แหล่งในคอลัมน์) — บางชุดโตขึ้นจาก ORACLE-EDIT/ORACLE-ADD ระหว่างทาง (เช่น p1.7 31→32 · p1.15 36→39 · p1.17 35→40 · p1.18 oracle 77 → S 80 → U 81)

| ใบ | รับ/merge | ข้อสอบ (ข้อ · แหล่งผล) | ผู้ตรวจ (ไฟล์) |
|---|---|---|---|
| P0.1 เครื่องมือ QC + F15.1–F15.4 | `c7b47330` (รอบ 2 `3dacd014` · `60313dbc`) | fitness 41/41 ±env + fitness-pos 8/8 (gates61-c) | `wo-notes/pos-P0.1.md` §Round 2 |
| P0.2 ทะเบียน op | `9abb8326` (`e4b26fff`) | qc-pos-p0.2 56/56 หลัง ORACLE-EDIT `66555aa6` (gates61-c) | `pos-P0.2.md` §5b |
| P0.3 ข้อสอบรากฐาน | `459e2f50` (`a6364a86`) | qc-pos-p1.1 82 + qc-pos-p1.3 72 ข้อตอนรับ (SKIPPED ถูกเหตุ) | `pos-P0.3-catalog.md` · `pos-P0.3-register.md` |
| P1.1a แคตตาล็อก+backfill | `28207fe7` (ff `38125490`) | qc-pos-p1.1 178/178 (p118-close-b3) | RESUME §0.8 · `pos-P1.1a.md` |
| P1.1b dual-write | **ส่วน A** `cb1a2331` (`180fe773`) · **ส่วน B ยังเปิด** | qc-pos-p1.1 S2.11b/S2.19 SKIP = ส่วน B | `pos-P1.1b.md` (R2 ผู้ตรวจ + R3 นักล่า) |
| P1.2 ตัวเลือก/variant/ชั่ง | S `d0de4e67` (`5d4c7fbe`) · U `6546214a` | qc-pos-p1.2 55/55 (gates61-c) | `pos-P1.2.md` §R2 · `pos-P1.2U.md` §R3 |
| P1.3 หน้าขายใหม่ | `dfb95d5f` (`2385c2aa`) | qc-pos-p1.3 128/128 (gates61-c) | `pos-P1.3.md` §B1.1/§B2.2 · RESUME:431 (code MERGEABLE · PARITY-OK) |
| P1.4 บาร์โค้ด | `6a04c025` (`eabb76b1`) | qc-pos-p1.4 21/21 (p118-close-b) | `pos-P1.4.md` §R2 |
| P1.5 พักบิล | `880ef560` (`bc18fcd6`) | qc-pos-p1.5 21/21 (gates61-c) | `pos-P1.5.md` §R2 |
| P1.6 จอชำระ | S `5383fee2` (`2dc08afd`) · U `6546214a` | qc-pos-p1.6 48/48 (gates55-d) | `pos-P1.6.md` §R2 + §R4 (นักล่าเลนเงิน) · `pos-P1.6U.md` |
| P1.7 PromptPay/Beam/บัตร | S `db840d74` (`2583bf41`) · U `87f61ec9` (`de130460`) | qc-pos-p1.7 32/32 (gates55-d) | `pos-P1.7.md` fix 1 · `pos-P1.7U.md` fix 1–2 |
| P1.8 คืนเงินบางส่วน+CN | `a1fa7514` (รวม P1.10 S) | qc-pos-p1.8 49/49 (gates61-c) | `pos-P1.8.md` §9 |
| P1.9 กะ/X/Z (+P1.9b นับซ้ำ) | S `b0c3cc6c` (`e05664af`) · P1.9b `765067dc` (`9aaa4caf`) · U `0a7b555f` | qc-pos-p1.9 53/53 (gates55-d) · qc-pos-p1.9b 22/22 (p118-close-b) | `pos-P1.9.md` §R2 · `pos-P1.9U.md` §R2 |
| P1.10 เครื่อง+พิมพ์ | S `a1fa7514` · U `d4b856ef` (`8dfab705` ผ่าน `0056cacb`) | qc-pos-p1.10 40/40 (gates55-d) · qc-pos-p1.10u-print 8/8 (p118-close-b) | `pos-P1.10.md` fix 1 · `pos-P1.10U.md` fix 1 |
| P1.11 ใบเสร็จออนไลน์ | S `0bf5c3e3` (merge `861005e0`) · U `f8d0c233` (`a19918d3`) | qc-pos-p1.11 38/38 (gates55-d) | `pos-P1.11U.md` fix 1 + Round 2 |
| P1.12 สมาชิกที่ตะกร้า | S `1bfa0ff9` (`9eb47438`) · U `08ad8b2a` (`0f1081b8`) | qc-pos-p1.12 72/72 (gates61-c) | `pos-P1.12-review-S.md` · `pos-P1.12U-review.md` · `pos-P1.12U-review-R2.md` |
| P1.13 ใบกำกับเต็มรูป | S `d9fec398` (`0d45a6d0`) · U `789498c4` (`994346a4`) | qc-pos-p1.13 33/33 (gates61-c) | `pos-P1.13.md` fix 1 · `pos-P1.13U.md` |
| P1.14 ตรวจนับมือถือ | S `7a3cd3d8` (`9a260116`) · U `f1734776` | qc-pos-p1.14 30/30 (p118-close-b) | `pos-P1.14U.md` §R2/§R3 |
| P1.15 PIN/เพดาน/อนุมัติ | S `33a22ae7` (`4a35f2b0`) · U `9163ebbe` (`5feecaac`) | qc-pos-p1.15 39/39 (gates55-d) | `pos-P1.15.md` fix 1 · `pos-P1.15U.md` fix 1 |
| P1.16 บิลวันนี้ | `a21c1d2a` | qc-pos-p1.16 28/28 (gates55-d) | `pos-P1.16.md` fix 1 |
| P1.17 รายงาน 7 ชุด | S `75dfe559` (`12813b8a`) · U `5a3bf592` (`e2da77ac`) · R4–R7 `3435767e` | qc-pos-p1.17 40/40 (p118-close-b) | `pos-P1.17U-R4.md` §R6/§R7 |
| P1.18 ตั้งค่า+ปิดเฟส | S `39204872` (`b1717d7c`) · U `5b74f1f4` (`e749b28e`) | qc-pos-p1.18 81/81 phase U (gates55-d) | `pos-P1.18-review-S.md` · `-R2.md` · `pos-P1.18U-review.md` · `-R2.md` |

ใบแทรกที่ลง `session/pos` ระหว่าง P1: HF-O23 `150dd45f` (deploy ขึ้น main `f85f5455` 5 ต.ค.) · ORACLE-EDIT p1.3 ตัวนับใบเสร็จ `1afeabc2` · P2.1 R8 `6fbbe15b` · HF-418 (#418 นาฬิกา LockScreen) `a1f5f56d` · HF-VIS-SHIFTS `1768467c` · HF-P1CLOSE `db5af8c2`

**หมายเหตุตัวนับ**: RESUME นับ P1.9 สองครั้ง (8/55 ตอน S · 13/55 ตอน U) · P1.10 สองครั้ง (15/55 · 17/55) · P1.17 สองครั้ง (9/55 · 10/55) แต่ P1.6U+P1.2U ได้ +1 (11/55) ⇒ ไล่รายใบได้ 21 ใบ ไม่ใช่ 23 · แผน `POS-MASTER-PLAN.md` หัว P1 เขียน "18 ใบ" แต่ตารางมี 19 แถว (P1.1a + P1.1b + P1.2–P1.18) · **มติ**: นับตามแถวแผน (19 แถว P1 · หัว "18 ใบ" ของแผนตกหล่น P1.1b) ⇒ 23/55 · แก้ตัวนับใน RESUME + รายงานเจ้าของแล้ว

## §2 ด่าน R14 (ปิดเฟส · QC4)
| run | head | ผล |
|---|---|---|
| `/root/pos-runs/gates55-d-20261009T215715Z` | `5b74f1f4` (merge P1.18U) | 30/30 ขั้น exit 0: p1.18 81 · closeday 22 · p1.6 48 · p1.9 53 · p1.5 21 · p2.1 55 · p1.12 72 · p1.3 128 · p1.15 39 · p1.16 28 · p1.10 40 · p1.7 32 · p1.11 38 · p1.13 33 · approval 16 · approval-edit 12 · approval-wiring 7 · bulk-ops 13 · crm-c3.3 90 · hr-roster 24 · nav-functions 11 เช็ก · page-authz 56 · pos-account 16 · account-cpa 107 · fitness-pos 8 · fitness 41 · typecheck 0 |
| `/root/pos-runs/p118-close-b-20261009T231559Z` (gates58-b) | `b694aea0` | 17 ชุดเขียว: p1.2 55 · p1.4 21 · p1.8 49 · p1.9b 22 · p1.10u-print 8 · p1.14 30 · p1.17 40 · coupon 8 · inventory 25 · products 24 · register 42 · restaurant-money 6 · shop-refund 12 · hotel-money 5 · ticket-money 6 · subscription-money 14 · แดง: p0.2 53/56 (S7.1 S7.5 S1.5) · p1.1 177/178 (R.1) · acc-v2-pos-lines 65/79 · member m2.7 0/1 · m2.8 0/1 · ⚠️ สคริปต์นี้ `export CI=1` ⇒ ไม่ถือล็อก (§6) |
| `/root/pos-runs/p118-close-b2-20261009T232153Z` (gates59-b · ถือล็อก) | `b694aea0` | p0.2 53/56 · p1.1 174/178 (S1.25 S1.36 R.1 R.2) · acc-v2-pos-lines 65/79 — vis57 ยังเขียน QC4 นอกล็อก |
| `/root/pos-runs/p118-close-b3-20261010T000658Z` (gates60-b · หลัง vis57 จบ) | `b694aea0` | **p1.1 178/178** · p0.2 53/56 (S7.1/S7.5 ยังแดงบน DB เงียบ ⇒ ไม่ใช่ residue) |
| `/root/pos-runs/p02-oracle-edit-20261010T0016Z` | ORACLE-EDIT `66555aa6` | `red-before.log` 53/56 → `forced.log` **56/56** |
| `/root/pos-runs/gates61-c-20261010T001746Z` | `0c20c473` (merge P2.2 S) | ทุกขั้น 0: typecheck · p2.2 42 · p2.1 55 · p1.12 72 · p1.3 128 · p1.2 55 · p1.5 21 · p1.13 33 · **p0.2 56** · pos-account 16 · account-cpa 107 · p1.8 49 · fitness 41/41 env + noenv · fitness-pos 8/8 |
| `/root/pos-runs/gates62-b-20261010T004335Z` | `db5af8c2` (merge HF-P1CLOSE) | **DONE 12/12 = 0**: generate · typecheck · page-authz 56 · p1.15 39 · p1.10 40 · p1.16 28 · p1.1 178 · p1.3 128 · p1.18 81 · fitness 41/41 · fitness-pos · vis-list |

**ข้อยกเว้นที่รับไว้ (ไม่ใช่ความผิดของโค้ด POS):**
- `qc-acc-v2-pos-lines` 65/79 — หัวสคริปต์ `// requires: acc-v2-seed` (`scripts/qc-acc-v2-pos-lines.mts:3`) · แดงทั้งหมดเป็น PL1.x "เอกสารบิลขายหน้าร้าน 2 ใบ — ได้ 0" = ไม่มีชุดข้อมูล acc-v2 บน QC4 · เลน POS ไม่ seed acc-v2 (RESUME 23:38Z)
- `qc-member-m2.7` / `m2.8` 0/1 — ล้มตอน setup `TypeError: Cannot read properties of null (reading 'role')` · สาเหตุ `member-expected.json` ไม่ตรง seed สมาชิกบน QC4 (RESUME:1030) · `qc-member-m1.7` ล้มที่ setup แบบเดียวกัน (RESUME 18:55Z/19:xx · `pos-P1.18-review-R2.md` R5) ⇒ S6.2/S6.3 ไม่เคยได้รัน (ข้อ K4b ของ p1.18 คุมแทน) · **ห้าม reseed เอง** — รอ session สมาชิก · ⚠️ `POS-OWNER-PENDING.md:56` เขียนว่า m1.7 S6.2/S6.3 "กลับมาเขียวโดยไม่แก้ข้อสอบ" ซึ่งขัดกับ RESUME + ผู้ตรวจ R2 — **แก้บรรทัดนั้นแล้ว 10 ต.ค. (ระบุว่าเป็นคำอ้าง builder · ผู้ตรวจค้าน · รอเจ้าของสมาชิกยืนยัน)**

**ORACLE-EDIT `66555aa6` (qc-pos-p0.2 S7):** ข้อสอบเขียนก่อนมีการคืนเงิน · P1.8 (`3064857a`) ทำให้ `closeDaySummary` (ที่ op `sales.summary`/`sales.byDay` ห่อ) รู้จัก docType (SALE ไม่ VOIDED นับ · ใบ REFUND หัก) แต่คิวรีอิสระของข้อสอบยังนับ status PAID ล้วน ⇒ ใบคืน CN (status PAID) ถูกนับเป็นยอดขาย / บิล REFUNDED ถูกทิ้ง → ต่าง 4 บิล/฿1,040 และโตทุกรอบภาพเพราะภาพสร้างใบคืน · แก้ = `realSum` แบบ docType-aware + SKIP เมื่อร้านตั้งตัดวัน ≠ 0 (P1.18) · S1.5 หายตามเพราะเป็นผลพ่วง · ผู้วินิจฉัย: เลน diag p0.2 (RESUME 00:16Z) · typecheck ของไฟล์นี้ผ่านใน gates61-c

## §3 parity R15
แหล่ง: `ledger/wo-notes/pos-P1.18-parity.md` (แช่แข็งที่ vis56 = `b694aea0` · ภาพ 365 th + 65 en ใน `/root/projects/shark-pos-d/.qc-shots/pos/p1close{,-en}/` · log `/root/pos-runs/vis56-all-20261009T223547Z/` — ทุกหน้า rc 0 ยกเว้น shifts-owner-th/en) · **#418 = 0 ทุก log ของ vis56** (ผล HF-418)

**สรุป 157 แถว: MATCH 4 · DEVIATION 105 · OPEN 48** · กรอบที่มี OPEN: 01 (4) · 02b (2) · 07 (4) · 10 (1) · 11C (6) · 13B (1) · 14B (6) · 17A (4) · 17B (4) · 19ก (4) · 19ค (6) · 20A (2) · 20B (2) · 21A (2) · MATCH ทั้ง 4 แถวอยู่ที่ 19ฉ

| # | สิ่งที่ต่าง | มติผู้คุม | HF-P1CLOSE ทำอะไร (`wo-notes/pos-HF-P1CLOSE.md`) |
|---|---|---|---|
| O1 | แท็บ "รายงาน/Reports" ยังเป็น "เร็ว ๆ นี้" (`href: null`) · ชิปสาขา 390 en เหลือ "⌄" | fix-now | `02b24b49` `RegisterModeTabs.tsx:27/30` ลิงก์ `/pos/reports` · `RegisterTopContext.tsx:63/126/144` ชิปสาขา/กะมือถือ · รอบแก้ F4 `bb764a01` ชิปสาขา `min-w-[96px] max-w-[50%]` |
| O2 | แถวคูปองในส่วนลดท้ายบิลติด "เร็ว ๆ นี้" ทั้งที่ใช้ได้ | fix-now | `78551cd2` `BillDiscountDialog.tsx:103` ถอด `aria-disabled` + `soonChip` |
| O3 | เปลือกแอปเป็นไทยในโหมด en | ยอมรับสำหรับ P1 → เจ้าของแกน | บรรทัด O3 ใน `POS-OWNER-PENDING.md:75` |
| O4 | หัวการ์ด "การเชื่อมต่อระบบ SHARK" ที่ 1024 บีบคำละบรรทัด | fix-now | `8d52fd5b` `settings-ui.tsx:35` `stackBelowXl` · `SharkSettings.tsx:132` |
| O5 | 13B ที่ 390 อาจเลื่อนไม่ถึงการ์ดพนักงาน | ตรวจใน HF | `aa91143b` `LockScreen.tsx:342` `md:min-h-0` + state `lock-screen-scroll` ยืนยัน `scrollHeight>clientHeight` · รอบแก้ F3 `441b6891` บังคับต้องมีบิลพัก |
| O6 | 14B ลิ้นชักบิลพักไม่เคยถูกถ่าย | harness | state `held-drawer` (3 ขนาด) |
| O7 | 17A/17B แสดงเครื่องที่เพิกถอน ~50 เครื่อง | fix-now (UI) | `dcd348a6` 17A แสดง ACTIVE เท่านั้น · 17B พับ "เพิกถอนแล้ว (n)" · รอบแก้ F6 `2ca2fb89` ตัดกิ่ง REVOKED ที่ตายแล้ว + เลือกเครื่อง ACTIVE ก่อน |
| O8 | 11C ใบเสร็จสาธารณะไม่อยู่ในชุด vis56 | ยอมรับตามหลักฐาน P1.11U รอบ 2 | `--page receipt-public` ถ่าย 3 ขนาด th/en (`rpub-issue-sent` 390 เท่านั้น เพราะเพดาน 3 ครั้ง/บิล/วัน) |
| O9 | 02b ถ่ายแค่ 1440 | ยอมรับ | `sale-done` เพิ่ม 390 (th) |
| O10 | 19ก ไม่มีปุ่ม "นำเข้า CSV/ชุดตัวอย่าง" | ยอมรับเป็น deviation → การ์ด onboarding (18) | — |
| O11 | 19ค การ์ดผิดพลาดไม่มีภาพ | harness | states `paydlg-promptpay-timeout` (เลื่อน `expiresAt` ของ intent ของรอบนี้ — ผู้คุมรับ F2) · `paydone-print-failed` |
| O12 | 21A หน้าอนุมัติบนมือถืออยู่นอก `POS_PAGES` | ยอมรับสำหรับ P1 → เจ้าของโมดูลอนุมัติ | บรรทัด O12 ใน `POS-OWNER-PENDING.md:76` |
| O13 | แคชเชียร์เปิด `products` ได้ 404 + console error | fix-now | `057fb075` `products/page.tsx:41–63` การ์ดปฏิเสธ HTTP 200 ก่อนอ่านสินค้า · ORACLE-EDIT `qc-hf-pos-page-authz` P-7 (ยังนับ 56) |
| 07 | ภาพกะของ owner ไม่ได้ถ่าย (สคริปต์ภาพ) | ถ่ายซ้ำ | HF-VIS-SHIFTS `1768467c` (เครื่องกะไม่ลงทะเบียน → LockScreen กลืนคลิก) |

ผู้ตรวจ HF-P1CLOSE (`pos-HF-P1CLOSE-review.md` @`64872b67`) = MERGEABLE-AFTER-FIXES · F1 (ไม่มีสาขา POS ⇒ 404) รับเป็น house grammar · F2 รับ · F3/F4/F6 แก้ · F5 รับ · ภาคผนวก `a1c8c4c3` สถานะหน้าบิลค้นเลขบิลเมื่อเป้าหมายตกหน้า 1 · merge `db5af8c2` (conflict เฉพาะ `POS-OWNER-PENDING.md` เก็บทั้งสองฝั่ง)

ภาพหลัง HF: vis58/vis58b บน QC5 (`/root/pos-runs/vis58-qc5-*` exit 4 ทุกหน้า = ด่าน `loadPosQcEnv` · `vis58b-qc5-*` ณ เวลาเขียน settings ×3 แดง (DEVICE_LIMIT จากเครื่องค้างใน snapshot QC5) · sales-cashier-th แดง · ยังไม่จบ) → vis58c (settings) → chain59: build59 @`db5af8c2` → **vis59** (register settings sales shifts reports stock products close receipt-public × owner-th/cashier-th/owner-en)

### ✅ vis59 addendum (controller · 10 Oct 02:2xZ)
- run `/root/pos-runs/vis59-qc5-20261010T012628Z` · build59 @`db5af8c2` on tree d · QC5 · **every page × owner-th/cashier-th/owner-en = 0 ❌** (register 96/93/34 · settings 47/47/17 · sales 27/27/9 · shifts 12/12/4 · reports · stock · products · close · receipt-public 16 ×3) · **#418 = 0** · shots `shark-pos-d/.qc-shots/pos/p1close{,-en}/` (vis56 originals backed up at `/root/pos-runs/vis56-shots-b694aea0/`)
- O1/O2/O4/O13 harness-verified · O5 lock-screen scrollable (1291 > 844, both cards in view) · O6 14B held drawer DEVIATION (no per-card device chip; 2-day expiry footer) · O7 17B devices = 3 ACTIVE + "เพิกถอนแล้ว (97)" collapsed, panel matches 17B · O8 11C receipt-public **MATCH** (+ language switch) · O9 sale-done 390 accepted · O11 19ค: PromptPay "QR หมดอายุ + สร้าง QR ใหม่" and print-failed in-dialog card = DEVIATION (functions present, copy/position differ) → **P2.12** · 07 shifts-owner verified (vis58b) · approval-wait 1024 fixed (P2.1U fix2) · full table in `wo-notes/pos-P1.18-parity.md` "vis59 addendum"
- gates62 @`db5af8c2` = 12/12 green (typecheck · authz 56 · p1.15 39 · p1.10 40 · p1.16 28 · p1.1 178 · p1.3 128 · p1.18 81 · fitness 41 · fitness-pos · vis-list) → pushed `83f4608d`

## §4 สิ่งที่เจ้าของต้องเคาะ (จาก `ledger/POS-OWNER-PENDING.md` · บรรทัด = เลขบรรทัดในไฟล์)
**บัญชี (session บัญชี/นักบัญชี)**
- ตรวจรับคอลัมน์ `AccountDocument.supersededByDocId` + facade ใบกำกับเต็มรูป (P1.13 · :49)
- ตรวจรับ `account/dashboard.ts` `SALES_WHERE` + TAX_INVOICE POS (P1.13 F3 · :50)
- เคาะ 4 ข้อ: ยกเลิก/ลดหนี้ TAX_INVOICE ของบิล POS จากหน้าบัญชีไม่ย้อนฝั่ง POS · รายงานภาษีขายไม่แสดงเลขผู้ซื้อ · `supersedeExternalSaleAbb` ไม่ตรวจงวดล็อก · ส่ง `taxInvoice` ซ้ำหลังอนุมัติ (P1.13 · :51)
- ตรวจรับ facade ค่าคอมฯ แพลตฟอร์ม + `ensureNamedCustomerContact` · `findContactForImport` ไม่มี orderBy (P2.1 · :52–53)
- ตรวจรับ `setPosLinkEnabled` + `connect/disconnect(tx?)` · คำถาม: POS ควรผูกได้หลายระบบบัญชีไหม (P1.18 S · :54, :57)
- O24 VAT ส่วนที่จ่ายด้วยบัตรของขวัญ — ต้องเคาะก่อนเริ่ม P2.9 (P1.12 · :63)
- O25 ผังบัญชีค่าคอมฯ ทาง A (ใช้อยู่) หรือ B (1120/6520) (P2.1 · :67)
- O26 VAT ค่า GP → 1155 + คืนค่าคอมฯ ตามสัดส่วน — รอนักบัญชียืนยัน (P2.1 · :68)
- O14 เลข JV ชนกัน — CRM แก้บน branch แล้ว รอทดสอบซ้ำฝั่งคลังหลัง CRM ขึ้น main (:23)

**คลัง / คลัง V2**
- O8 D4/D7/D10 เข้า RUN คลัง V2 (เคาะแล้ว · :17, :43) · O9 PO ตัวเดียว = ของบัญชี (เคาะแล้ว · :41)
- O12 คืนด้วยต้นทุนรายการตัดเดิม (เคาะแล้ว · :36) — ฝั่ง void ทำใน P2.3 ตามบรีฟ `pos-brief-P2.3.md` Q5
- O13 โค้ดบัญชีค้าง 30 วิ เมื่อพร้อมกัน ≥10 รายการ — ใบแยก (:22)
- O15 ห้ามยกเลิกเอกสารที่กระทบสต็อก — ใบแยกหลัง CRM ขึ้น main (เคาะแล้ว · :24, :37)
- (ยังไม่อยู่ในไฟล์) บรีฟ P2.3 Q6 สั่งเพิ่ม 2 บรรทัด: แปลงหน่วยซื้อ (ถุง/ลิตร) · ความละเอียดต้นทุนต่ำกว่าสตางค์ — builder P2.3 S จะเขียน

**ร้านอาหาร** — ไม่มีบรรทัดในไฟล์ ณ วันส่งมอบ · ที่สั่งให้เขียนแล้ว (RESUME 22:52Z, 23:31Z · `pos-brief-P2.4.md` Q6/Q9): checkout เดิมแข่งกันผูกรายการหลังขาย + ไม่มี unique index session โต๊ะ · checkout เดิม `PAYMENT_MISMATCH` เมื่อสมาชิกมีส่วนลด tier · คงหน้าเดิมไว้ ลบที่ P2.14 ต้องให้เจ้าของ OK — builder P2.4 S เป็นคนเขียน

**ร้านค้า (เว็บร้าน)** — ไม่มีบรรทัดในไฟล์ · บรีฟ P2.8 (`pos-brief-P2.8.md` Q8 + กติกา facade) สั่งเพิ่ม: แบบ 09 ไม่มีชีตสั่งออเดอร์มือ · hunk ใน `shop/service.ts` ผ่าน facade POS — builder P2.8 S เป็นคนเขียน

**แกน + นโยบายเจ้าของ**
- O3 เปลือกแอป i18n ภาษาอังกฤษ (HF-P1CLOSE · :75)
- O27 `qc:all` ทั้งรีโปบน Neon branch ส่วนตัวก่อนขึ้น main (P2.1 · :69) — QC5 ที่สร้าง 9–10 ต.ค. ใช้กับเลนภาพเท่านั้น
- PIN 4 หลัก × 30 ครั้ง/15 นาที/สาขา ⇒ เดาได้ ~2,880 ครั้ง/วัน — เพดานรายวัน / แจ้งเตือน / PIN ผู้จัดการ ≥ 6 หลัก (P1.18 R2 · :70)
- โปรช่วงเวลาจบได้ถึง 23:59 — ต้องรับ "24:00" ไหม (P2.2 F5 · :73)
- O4 Beam keys + `returnUrl` · ร้านทดลอง · เครื่องพิมพ์/ลิ้นชักจริง (เคาะ "ไม่เร่ง" · :13, :44 · ทดสอบฮาร์ดแวร์จริงยังไม่ได้ทำ — `pos-P1.10U.md`)
- O7 คีย์ API ทั่วไปจัดการที่ `/app/settings/api` ที่เดียว — แจ้ง session CRM (:16, :45)

**อนุมัติ (เจ้าของโมดูลอนุมัติ)**
- ตรวจรับ `listPoliciesForEntities` (P1.18 S · :55)
- K4 `decide()` ปฏิเสธผู้ตัดสิน = ผู้ยื่น ที่แกน (มีผลทุกโมดูล) + ข้อยกเว้นเจ้าของคนเดียว/`crm.commission` — เลือก: คงข้อยกเว้นที่แกน หรือไม่ส่งคำขอของเจ้าของเข้าสาย (P1.18 S · :56)
- R4 ร้านหลายเจ้าของ: ผู้ยื่นถอนคำขอตัวเองผ่าน decide ไม่ได้ — เคาะพร้อม O16(ค) (:70)
- O12 เพิ่มภาพหน้า `/app/approvals` 390 ในชุดภาพแกน เทียบ 21A (HF-P1CLOSE · :76)

**HR**
- O6 D15 เพดานประกันสังคม — รอนักบัญชี (HQ8 · :35)
- O16 ใบลาเจ้าของ (ข)+(ค) · O17 ผู้ทำ ≠ ผู้อนุมัติเงินเดือน + แถว "ผี" — HR V2 (เคาะแล้ว · :38–39)
- ORACLE-EDIT `qc-hr-roster` NM-2 (`781c440b`) — session HR รันซ้ำ (:60 · ผ่านใน gates55-d 24/24)

**สมาชิก** (ไม่มีหัวข้อในไฟล์ · จาก `pos-P1.18-review-R2.md` R5 · `pos-P1.12-review-S.md`)
- แก้ seed/`member-expected.json` บน QC4 ให้ m2.7/m2.8/m1.7 รันได้ แล้วยืนยัน m1.7 S6.2/S6.3 · ดัชนีเบอร์โทร/ปรับเบอร์ให้เป็นตัวเลขก่อนเทียบซ้ำ

**ออกแบบ**
- O10 (ก) slot แถบบนของแอปให้หน้าขาย — เคาะแล้ว (:40) · สถานะการทำไม่พบในแหล่ง
- 14B ทางเข้า "บิลที่พัก" บนมือถือเมื่อตะกร้าว่าง — ต้องเคาะแบบ (`POS-MASTER-PLAN.md` §4 เก็บตก (ก))
- 19ค ข้อความการ์ด QR หมดอายุ (แอป vs แบบ) — **ตัดสินแล้ว 10 ต.ค.: deviation → P2.12** (การ์ดแดง + เหตุผล + 3 ปุ่ม + รหัสอ้างอิง · print-failed เป็น toast ล่าง)

## §5 ของค้าง / เก็บตก
**จากแผน (`POS-MASTER-PLAN.md` §4 บล็อกหลัง P2.14 · commit `f71990b6`)**: (ก) 14B มือถือตะกร้าว่างเปิดบิลพักไม่ได้ · (ข) 19ค การ์ด QR หมดอายุ · (ค) O3 app-shell en = การ์ดแกน · (ง) O10 นำเข้า CSV/ชุดตัวอย่าง = การ์ด onboarding (18) · (จ) O12 21A = เจ้าของโมดูลอนุมัติ

**ระดับรีโป**
- `session/pos` ยังไม่มี `origin/main` (`71a1f363`): ตามหลัง 350 commit (รวม hotfix ที่ deploy 5 ต.ค. `f85f5455` และงาน CRM) · TODO "merge main เข้า session/pos + ORACLE-EDIT P1.3 S5.12" จาก RESUME 5 ต.ค. 04:17Z ยังไม่พบว่าทำ
- P1.1b ส่วน B (`account/service.ts` 2 จุด · ข้อสอบ S2.11b/S2.19 SKIP) — git แสดงว่า `origin/main` มี commit `crm(...)` แล้ว แต่ RESUME ไม่บันทึกว่าเงื่อนไข "CRM ขึ้น main" ครบ
- push `db5af8c2` + ledger หลัง gates62 เขียว
- **มติผู้คุม 10 ต.ค.**: merge `origin/main` เข้า `session/pos` ทำที่จุด merge ถัดไปหลัง P2.2U + P2.3 S เข้า `session/pos` (ไม่ทำระหว่าง builder ใช้ฐานอยู่) · รันด่านเต็ม (gates5x ชุด 30 ขั้น) หลัง merge · จากนั้นตรวจ P1.1b ส่วน B ว่าเงื่อนไข CRM ครบ → เปิดใบติดตาม "P1.1b-B" · ORACLE-EDIT P1.3 S5.12 ที่ค้างจาก 5 ต.ค. ตรวจซ้ำในด่านชุดเดียวกัน

**ติดตามจากโน้ตใบงาน (จุดที่ชี้หน้าจอ P1)**
- หน้าขาย: quote ที่รับ PIN ผู้จัดการ/บิลพักที่อนุมัติแล้ว (`pos-P1.15U.md` · `pos-P1.12U.md`) · เรียกบิลพัก "รออนุมัติส่วนลด" แล้วขอใหม่ได้บิลพักซ้อน (`pos-P1.15U.md`) · `HeldBillsDrawer`/`TaxInvoiceDialog` โครง flex บนมือถือแบบเดียวกับ 14A (`pos-P1.12U.md`) · ข้อความคูปองล้มรวมทุก refusal (F10 รับแล้ว) · held-cart แปลง `CHANNEL_NOT_SOLD` เป็น `PRODUCT_UNAVAILABLE` (`pos-P2.2.md` F1) · ตัวเลือกช่องทาง/ชิปหัวจอ → P2.8 (`pos-P2.1U.md`)
- จอชำระ/ใบเสร็จ: "ส่วนลดท้ายบิล" รวมแต้ม/ว่อชเชอร์/บัตรของขวัญบรรทัดเดียว (`pos-P1.10.md` F7) · อักษรนอกไทยพิมพ์เป็น "?" · BT เขียน 20 ไบต์ · ESC/POS ไม่จับคู่แล้วตกไปพิมพ์เบราว์เซอร์เงียบ (`pos-P1.10U.md`) · ใบเสร็จ LINE/อีเมลยังไทยอย่างเดียว (`pos-P1.18U.md`)
- ใบเสร็จออนไลน์: ไม่มี guard ต่อ IP · rate limit ส่งใบเสร็จนับนอกล็อก (`pos-P1.11.md`) · "คัดลอกลิงก์" บิลเก่าเขียน audit reprint · ลิ้นชักบิลไม่มีอีเมลสมาชิก (`pos-P1.11U.md`)
- ตั้งค่า: ตัวแก้ค่าบริการ (UI) · ขอบเขตประวัติรายสาขา/เลิก fallback อีเมล (P1.18 F11) · fixture 19ก ย้ายเข้า `seed-pos-qc` (`pos-P1.18U-review.md`) · `canEditReceipt` ระดับร้าน vs F9 (`pos-P1.10U.md` FU-c — ไม่พบว่าปิดแล้ว) · throttle PIN ต่อเครื่องสำหรับการเดาแบบไม่ระบุคน (`pos-P1.15.md`)
- รายงาน: KPI เทียบ "ช่วงเวลาเดียวกัน" ต้องแก้ server (`pos-P1.17U-R4.md` F1) · รูปแบบวันที่ตาม locale เบราว์เซอร์ (F2) · SQL aggregation → P2.12
- กะ: `denomDetail` รับเหรียญ · ShiftReport จำนวนใบคืน/บิลต่อวิธีชำระ (`pos-P1.9U.md`)
- บิล: snapshot อัตราค่าคอมฯ บนบิล · สรุปจำนวนต่อช่องทาง · บล็อกค่าคอมฯ หักคืนเงิน (`pos-P2.1U.md` F2/F3/F5 → P2.12) · ลูกค้าออนไลน์ไม่มีเลขอ้างอิงแพลตฟอร์ม (`pos-P1.16.md`)
- หลังบ้านที่ส่งต่อ: P1.8 F1–F10 (เลข CN ชนในสมุดเดียว · AI tools นับใบคืนเป็นยอดขาย → CRM · CRM ไม่มี consumer คืนเงิน · ตัวอ่านยอดสะสมสมาชิกไม่หักคืน · index `PosSale(refSaleId)` P6.1 · บัตรของขวัญคืนบางส่วน · VAT CN ต่าง 1 สตางค์) · P1.7 ค่าธรรมเนียม MDR · คืนเงิน Beam · รายงาน "เงินเข้าไม่มีบิล" · P1.1a index/รันนอกเวลาขาย → P6.1 runbook

## §6 วิธีรัน
**QC4 vs QC5**
- QC4 = Neon `wo-pos-qc4` (host `ep-frosty-lab`) · ข้อสอบ DB ของ builder/oracle/ด่าน merge ทั้งหมด · `scripts/qc4.sh` ปฏิเสธ prod/QC1/ค่าว่าง · ตั้ง `GATE_LOCK_FILE=/tmp/shark-gate-qc4.lock` แต่เลน POS ทับด้วย `env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock` (มติเจ้าของ 8 ต.ค. ทาง A · `pos-brief-LANE-RULES.md` ข้อ 2)
- QC5 = Neon `wo-pos-qc5` (id `br-wild-butterfly-ao85rjyz` · host `ep-fragrant-thunder`) แตกจาก QC4 (RESUME 23:50Z) · **เลนภาพเท่านั้น** (เซิร์ฟเวอร์ + `visual-pos.mts` บนทรี d) · `scripts/qc5.sh` ปฏิเสธ prod/QC1–QC4 · lock `/tmp/shark-gate-qc5.lock` · export `POS_QC_ALLOW_HOST=ep-fragrant-thunder` (`5197d531` — ไม่งั้น `loadPosQcEnv` exit 4) · `.env.qc5` gitignored 0600 ในทรี controller + d
- QC5 ล้าหลัง QC4: `bash scripts/iso.sh bash scripts/qc5.sh pnpm exec prisma migrate deploy` (additive) หรือลบ `pnpm neon:delete wo-pos-qc5` แล้วแตกใหม่ parent = QC4 (`neon:create` ไม่รองรับ parent → probe ชั่วคราว) · แตกตอนไม่มีภาพรันอยู่ (บทเรียน DEVICE_LIMIT 00:33Z: เครื่อง `posqc-vis-dev-328536` ติดมาใน snapshot) · ⛔ ห้าม reseed ทั้ง QC4 และ QC5 · ห้ามชุดที่ล้างข้อมูลร่วม (`seed-member-qc`, `seed-hr-qc`, `migrate reset`)

**ด่าน (QC4)**: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts` · fitness: `bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness` + แบบไม่มี env + `pnpm exec tsx scripts/fitness-pos.mts` · typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` · ตัวอย่างสคริปต์ผู้คุม `/root/pos-runs/ctl-scripts-2026-10-09/gates6{1,2}-*.sh`

**build (ทรี d เท่านั้น · builder ห้าม build)**: `env NODE_OPTIONS=--max-old-space-size=7168 ISO_MEM=9500M bash scripts/iso.sh …` (build53 โดน cgroup OOM ที่ 7000M ตอน "Running TypeScript" — RESUME 21:19Z) · ดู `build56-d.sh` / `chain59.sh`

**ภาพ (QC5 · ทรี d · พอร์ต 3228)**: `bash scripts/qc5.sh env ACC_V2_PORT=3228 bash scripts/acc-v2-serve.sh start` → `bash scripts/iso.sh bash scripts/qc5.sh env CI=1 [LOCALE=en] pnpm exec tsx scripts/visual-pos.mts <wo> --states --user owner|cashier --tenant coffee --page <register|settings|sales|shifts|reports|stock|products|close|receipt-public> --base http://127.0.0.1:3228` → `… acc-v2-serve.sh stop` · `--list` (ไม่ต้อง DB/chromium) · `--dry` แสดงสิ่งที่จะเขียน · ภาพออก `shark-pos-d/.qc-shots/pos/<wo>/` · LOCALE=en ถ่าย 1440 อย่างเดียว

**🔴 กับดัก CI (RESUME 23:21Z)**: `scripts/with-gate-lock.sh` ข้าม `flock` ทั้งหมดเมื่อมี `CI` หรือ `VERCEL` ใน env · สคริปต์ด่านผู้คุม (gates5x, vis56b) เคย `export CI=1` ⇒ ชุดของผู้คุมวิ่งไม่ถือล็อก ชนกับ builder → p0.2 S7 / p1.1 R.1 / p1.3 / p1.2 แดงจาก residue · **กติกา: สคริปต์ด่านห้าม export CI · ใส่ `CI=1` เฉพาะคำสั่ง visual** (gates59–62 ทำตามแล้ว)

**อื่น ๆ**: `systemctl stop <unit>` ไม่หยุด unit `iso-<pid>-<ts>` ที่ `iso.sh` สร้างซ้อน → ตรวจ `systemctl list-units 'iso-*'` (RESUME 21:20Z) · ทรี: b/c = builder/ด่าน · d = build+ภาพ · p11 = builder/oracle (node_modules ร่วม ห้าม generate ขณะเลนอื่นใช้) · pre-commit fitness แดง "model ไม่มีใน schema" = Prisma client เก่า → `prisma generate` เมื่อทรีว่าง

## §7 สถานะ P2 ณ วันส่งมอบ (ท้าย `POS-RESUME.md` ถึง 00:45Z)
- **P2.1** ช่องทางขาย: oracle `e4672cfa` (53 → R8 55) · S `206a48df` · ORACLE-EDIT R8 `6fbbe15b` · U `711b6d5e` (fix2 `15c8781c` ตาราง approval-wait 1024) ⇒ ปิด · RESUME นับ 24/55
- **P2.2** ราคาตามช่องทาง/สาขา/เวลา: brief §9 `1d095090` · oracle `b3c3fbf5` (42) · S `0c20c473` (fix 2 รอบ · ORACLE-EDIT C3/S8 `4ea0ad23`/Q8 `ec074d01`/C6) · push แล้วใน `f56b2108` · **P2.2U กำลังสร้าง** ทรี p11 `wip/pos-p2.2u` จาก `8226c0a9`
- **P2.3** BOM: brief §9 `2abd4f1a` · oracle `6dbcafe0` (45) · re-pin ST4 `7f633a26` · **builder S กำลังสร้าง** ทรี c (prompt `pos-prompt-accountB-P2.3-S.md` · rulings 1–12)
- **P2.4** โหมดโต๊ะ: brief ส่งแล้ว (§9 · `df3d030e`) · oracle `7057fd5d` (43) · builder S รอ P2.2 S + P2.3 S merge · ต้อง re-pin contract sha/L2/L3 เป็น ORACLE-EDIT แยก
- **P2.8** จอออเดอร์: brief + §9 1–15 `35fb1ddf` · oracle `8226c0a9` (54 · 24 CONTROLLER-DECISION รอผู้คุมเคาะตอนเขียน prompt S) · builder หลัง P2.2 S + P2.3 S
- **P2.6** KDS: drafter บรีฟกำลังทำ (RESUME 00:45Z)
- บรีฟใน `ledger/pos-briefs/`: P2.1 · P2.2 · P2.3 · P2.4 · P2.8
- เลน: เจ้าของสั่ง 00:45Z "งานเสร็จก่อน ลดเหลือ 3 เลน" · ตอนนั้น 4 เลน = P2.3 S (c) · P2.2U (p11) · drafter HANDOVER-P1 · drafter brief P2.6 · ด่าน/บิลด์/ภาพ (gates62, chain59) ไม่นับเลน
