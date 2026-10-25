# HANDOVER — POS ใหม่ (RUN 1–24 ต.ค. 2026 · 55 ใบงาน · 7 เฟส) · ผู้คุม A · ร่าง 2026-10-24 05:20Z

## §0 สรุป
ฉบับนี้ **แทนที่ (supersedes)** HANDOVER เฟสเดิม 4 ฉบับ: `ledger/HANDOVER-2026-10-10-POS-P1.md` · `ledger/HANDOVER-2026-10-16-POS-P2.md` · `ledger/HANDOVER-2026-10-22-POS-P3.md` · `ledger/HANDOVER-2026-10-23-POS-P5.md` — ของเดิมยังอ่านได้เป็นรายละเอียดต่อเฟส.
- ตัวนับ: **51/55 → ปิดครบ 55/55 เมื่อ chain v3 (walker 19 ช่อง + perf P5.3) เขียวและไฟล์นี้ผ่าน qc-pos-p6.2 H1/H2** · tip ส่งมอบ = คอมมิตล่าสุดบน `session/pos` (ดู §7 วิธีตรวจ) · ⛔ ยังไม่ merge main (W32 เจ้าของ deploy ตาม `docs/pos/DEPLOY-RUNBOOK.md`).
- ของที่ขึ้นแล้ว: แคตตาล็อกเดียว · หน้าขาย V2 ทุกโหมด (ร้านค้า/ร้านอาหาร/โต๊ะ/QR/KDS/จอลูกค้า/หลายสาขา/ออฟไลน์) · ทุกช่องทาง (เว็บร้าน · ออเดอร์ · แพลตฟอร์มโครง) · เชื่อม HR/บัญชี/CRM/สมาชิก/แชท/บอร์ด/AI · REST `/api/v1/pos` + สกิล · ตั้งค่า/รายงาน/พิมพ์ · คู่มือในแอป `/pos/help`.
- คุณภาพ: ด่าน POS 134 ชุด + 8 คำสั่ง (manifest `scripts/pos-gates.json`) เขียวที่ tip ยกเว้น ACCEPTED 12 (account-api/member เดิม) · hunter เงิน/authz 7 รายงาน (§2) · parity 1440/1024/390 ทุกจอ · ซ้อม deploy บน branch สำเนา prod ผ่าน 37/37 (§6).
- ของเจ้าของ: W1–W43 (§5) · ก่อน deploy ต้องตั้ง `POS_DEVICE_KEY` (W40) · ลำดับ deploy CD-P61-R1 = migrate ก่อน merge main (runbook §0/§4).
- เริ่มงานต่อ: อ่าน §7 แล้วบล็อก ▶️ ท้าย `ledger/POS-RESUME.md`.

## §1 ตารางใบงาน 55 ใบ (SHA = merge บน session/pos · วงเล็บ = head ของ wip)
| ใบ | merge | ข้อสอบ ณ merge | บันทึก/ผู้ตรวจ |
|---|---|---|---|
| P0.1 เครื่องมือ QC POS | `c7b47330` (รอบ 2 `3dacd014` · `60313dbc`) | fitness 41/41 ±env · fitness-pos 8/8 | `ledger/wo-notes/pos-P0.1.md` |
| P0.2 ทะเบียน op | `9abb8326` (`e4b26fff`) | qc-pos-p0.2 56/56 | `ledger/wo-notes/pos-P0.2.md` |
| P0.3 ข้อสอบรากฐาน | `459e2f50` (`a6364a86`) | qc-pos-p1.1 82 + qc-pos-p1.3 72 ตอนรับ | `ledger/wo-notes/pos-P0.3-catalog.md` |
| P1.1a แคตตาล็อก+backfill | `28207fe7` (`38125490`) | qc-pos-p1.1 178/178 | `ledger/wo-notes/pos-P1.1a.md` |
| P1.1b dual-write | ส่วน A `cb1a2331` (`180fe773`) · ส่วน B ใน MAIN-MERGE `0d581286` | qc-pos-p1.1 S2.11b/S2.19 | `ledger/wo-notes/pos-P1.1b.md` |
| P1.2 ตัวเลือก/variant/ชั่ง | S `d0de4e67` · U `6546214a` | qc-pos-p1.2 55/55 | `ledger/wo-notes/pos-P1.2.md` |
| P1.3 หน้าขายใหม่ | `dfb95d5f` (`2385c2aa`) | qc-pos-p1.3 128/128 | `ledger/wo-notes/pos-P1.3.md` |
| P1.4 บาร์โค้ด | `6a04c025` (`eabb76b1`) | qc-pos-p1.4 21/21 | `ledger/wo-notes/pos-P1.4.md` |
| P1.5 พักบิล | `880ef560` (`bc18fcd6`) | qc-pos-p1.5 21/21 | `ledger/wo-notes/pos-P1.5.md` |
| P1.6 จอชำระ | S `5383fee2` · U `6546214a` | qc-pos-p1.6 48/48 | `ledger/wo-notes/pos-P1.6.md` |
| P1.7 PromptPay/Beam/บัตร | S `db840d74` · U `87f61ec9` | qc-pos-p1.7 32/32 | `ledger/wo-notes/pos-P1.7.md` |
| P1.8 คืนเงินบางส่วน+CN | `a1fa7514` | qc-pos-p1.8 49/49 | `ledger/wo-notes/pos-P1.8.md` |
| P1.9 กะ/X/Z | S `b0c3cc6c` · P1.9b `765067dc` · U `0a7b555f` | qc-pos-p1.9 53/53 · p1.9b 22/22 | `ledger/wo-notes/pos-P1.9.md` |
| P1.10 เครื่อง+พิมพ์ | S `a1fa7514` · U `d4b856ef` | qc-pos-p1.10 40/40 | `ledger/wo-notes/pos-P1.10.md` |
| P1.11 ใบเสร็จออนไลน์ | S `0bf5c3e3` (`861005e0`) · U `f8d0c233` | qc-pos-p1.11 38/38 | `ledger/wo-notes/pos-P1.11U.md` |
| P1.12 สมาชิกที่ตะกร้า | S `1bfa0ff9` · U `08ad8b2a` | qc-pos-p1.12 72/72 | `ledger/wo-notes/pos-P1.12-review-S.md` |
| P1.13 ใบกำกับเต็มรูป | S `d9fec398` · U `789498c4` | qc-pos-p1.13 33/33 | `ledger/wo-notes/pos-P1.13.md` |
| P1.14 ตรวจนับมือถือ | S `7a3cd3d8` · U `f1734776` | qc-pos-p1.14 30/30 | `ledger/wo-notes/pos-P1.14U.md` |
| P1.15 PIN/เพดาน/อนุมัติ | S `33a22ae7` · U `9163ebbe` | qc-pos-p1.15 39/39 | `ledger/wo-notes/pos-P1.15.md` |
| P1.16 บิลวันนี้ | `a21c1d2a` | qc-pos-p1.16 28/28 | `ledger/wo-notes/pos-P1.16.md` |
| P1.17 รายงาน 7 ชุด | S `75dfe559` · U `5a3bf592` · R4–R7 `3435767e` | qc-pos-p1.17 40/40 | `ledger/wo-notes/pos-P1.17U-R4.md` |
| P1.18 ตั้งค่า+ปิดเฟส P1 | S `39204872` · U `5b74f1f4` | qc-pos-p1.18 81/81 | `ledger/HANDOVER-2026-10-10-POS-P1.md` |
| P2.1 ช่องทางขาย+ค่าคอมฯ | S `206a48df` · U `711b6d5e` | qc-pos-p2.1 | `ledger/HANDOVER-2026-10-16-POS-P2.md` §1 |
| P2.2 กฎราคา | S `0c20c473` · U `1636da3c` | qc-pos-p2.2 (42/42 หลัง CD-P43-8) | `ledger/wo-notes/pos-P2.2.md` |
| P2.3 BOM | S `160299e4` · U `a7561b5c` | qc-pos-p2.3 46/46 | `ledger/HANDOVER-2026-10-16-POS-P2.md` §1 |
| P2.4 โหมดโต๊ะ | S `7365d4db` · U `c81f5bbf` | qc-pos-p2.4 50/50 | `ledger/wo-notes/pos-P2.4-hunt.md` |
| P2.5 แยกบิล/ย้ายโต๊ะ | S `96cc5f4f` · U `3dd0639d` | qc-pos-p2.5 49/49 | `ledger/wo-notes/pos-P2.5-hunt.md` |
| P2.6 KDS/ใบครัว/86 | S `671e6fd2` · U `4449123f` | qc-pos-p2.6 67 | `ledger/wo-notes/pos-P2.6-hunt.md` |
| P2.7 QR สั่ง/จ่ายก่อน | S `92b7149d` · U `64923c13` | qc-pos-p2.7 42/42 | `ledger/HANDOVER-2026-10-16-POS-P2.md` §1 |
| P2.8 จอออเดอร์ทุกช่องทาง | S `d85ea5c3` | qc-pos-p2.8 61 | `ledger/wo-notes/pos-P2.8-hunt.md` |
| P2.9 บัตรของขวัญ/เครดิต/ทิป (+P2.9b มัดจำ) | S `40ade233` · U `9ada96ef` · P2.9b `c3c52ef1` · `616db657` | qc-pos-p2.9 · p2.9b 53/53 | `ledger/wo-notes/pos-P2.9-hunt.md` |
| P2.10 จอลูกค้า | `9e72513f` | qc-pos-p2.10 13/13 | `ledger/HANDOVER-2026-10-16-POS-P2.md` §1 |
| P2.11 หลายสาขา | S `744e4f35` · U `5f554f9e` | qc-pos-p2.11 34/34 | `ledger/HANDOVER-2026-10-16-POS-P2.md` §1 |
| P2.12 รายงานช่องทาง/สาขา/PDF | S `d0561566` · U `861815e0` | qc-pos-p2.12 33/33 | `ledger/HANDOVER-2026-10-16-POS-P2.md` §1 |
| P2.13 REST + สกิล | `f95348ac` · `4bb550cf` | qc-pos-p2.13 54/54 · api-skill | `ledger/HANDOVER-2026-10-16-POS-P2.md` §1 |
| P2.14 ปิดเฟส P2 | `05975437` | qc-pos-p2.14 60/60 | `ledger/HANDOVER-2026-10-16-POS-P2.md` |
| P3.1 · P3.2 · P3.3 · P3.10 · P3.11 (= P3-SKEL โครงแพลตฟอร์ม/สลิป/e-Tax รอ creds W4) | S `80314e00` · U `321ddf57` | qc-pos-p3-skel 41/41 | `ledger/wo-notes/pos-P3-SKEL.md` |
| P3.4 ออฟไลน์ | S `0617d17b` · U `1a46db47` | qc-pos-p3.4 51/51 | `ledger/HANDOVER-2026-10-22-POS-P3.md` §1 |
| P3.5 HR×POS | S `688fc3ed` · U `2e912cfe` | qc-pos-p3.5 55/55 | `ledger/HANDOVER-2026-10-22-POS-P3.md` §1 |
| P3.6 บัญชี/CRM/สมาชิก/เครดิต | S `f6ae3054` · U `ea7aaa0a` | qc-pos-p3.6 52/52 | `ledger/HANDOVER-2026-10-22-POS-P3.md` §1 |
| P3.7 แชท | S `02b67f91` · U `5605b3a6` | qc-pos-p3.7 41/42 (ST3 = W21) | `ledger/HANDOVER-2026-10-22-POS-P3.md` §1 |
| P3.8 บอร์ด/ห้องทีม | S `a2c9a4c7` · U `5eabd360` | qc-pos-p3.8 34/34 | `ledger/HANDOVER-2026-10-22-POS-P3.md` §1 |
| P3.9 AI สรุปเช้า | S `683a7cc8` · U `7c5c0d09` | qc-pos-p3.9 48/48 | `ledger/HANDOVER-2026-10-22-POS-P3.md` §1 |
| P3.12 ปิดเฟส P3 | `15ee7536` · freeze `f38494fb` | qc-pos-p3.12 22/22 · gates128 136/136 | `ledger/HANDOVER-2026-10-22-POS-P3.md` |
| P4.1 ทะเบียนปุ่ม | `574b0758` (oracle `3857aa03`) | qc-pos-p4.1 16/16 | `ledger/wo-notes/pos-P4.1.md` |
| P4.2 ตัวเดินกดปุ่ม 19 ช่อง | walker `77de6002` → รวมใน `e527eff6` · ผล 19 ช่องจาก chain v3 (§8 EV-C4) | qc-pos-p4.2 12 ข้อ | `ledger/wo-notes/pos-P4.2-walker.md` |
| P4.3 triage+fix จาก walker | `e527eff6` · fix3 `c39b71fd` | qc-pos-p4.3 30/30 · p2.2 42/42 | `ledger/wo-notes/pos-P4.3-fix1-review.md` |
| P5.1 เงิน/race/idempotency | `5926434f` · `e9b765b4` · `6b1f84a5` | qc-pos-p5.1 28/28 | `ledger/wo-notes/pos-P5.1-hunt-MA.md` |
| P5.2 authz ทุก surface | `e774edeb` · `c4584062` · `98f60761` | qc-pos-p5.2 57 ข้อ · matrix 404 แถว | `ledger/wo-notes/pos-P5.2-hunt-L1.md` |
| P5.3 perf | oracle `c3ae27f1` · fix1–fix1d ดัชนีบาร์โค้ดฝั่งลูกข่าย merge `adfcee44` (CD-P53-O14/O15/O16 · R1+hunter 2 รอบ) · ผลวัด chain v3 **25/25 ×2** B3U p95 20.6/23.4 ms (§8 EV-P4) | qc-pos-p5.3 11/11 gate (S5 ทางลูกข่าย) · measure 25/25 | `ledger/wo-notes/pos-P5.3-oracle.md` · `ledger/wo-notes/pos-P5.3-fix1.md` · `ledger/wo-notes/pos-P5.3-fix1-review.md` |
| P6.1 runbook/verify/ซ้อม deploy | prep `c91d8735` · fix `4016a352` | qc-pos-p6.1 31/31 · ซ้อม 37/37 | `ledger/wo-notes/pos-P6.1.md` |
| P6.2 เอกสาร/คู่มือ/สกิล/HANDOVER | `0bd8324e` · `c4ce139a` | qc-pos-p6.2 16 ข้อ | `ledger/wo-notes/pos-P6.2-review.md` |

## §2 บั๊กจริงที่นักล่าพบ (ระดับสูง/กลาง · ที่มา · การแก้)
ครอบรายงาน hunter 8 ไฟล์ (รวม R1+hunter P5.3 fix1 `ledger/wo-notes/pos-P5.3-fix1-review.md`): `ledger/wo-notes/pos-P2.4-hunt.md` (Low 2 เท่านั้น) · `ledger/wo-notes/pos-P2.5-hunt.md` · `ledger/wo-notes/pos-P2.6-hunt.md` · `ledger/wo-notes/pos-P2.8-hunt.md` · `ledger/wo-notes/pos-P2.9-hunt.md` · `ledger/wo-notes/pos-P5.1-hunt-MA.md` · `ledger/wo-notes/pos-P5.2-hunt-L1.md`.

| id | ใบ | ระดับ | อาการ | การแก้ | ที่มา |
|---|---|---|---|---|---|
| MA-F1 | P5.1 | High | สิทธิ์สมาชิกกินค่าบริการ → คืนเงินได้มากกว่าที่บิลเก็บ | fix batch A+C+D `5926434f` | `ledger/wo-notes/pos-P5.1-hunt-MA.md` |
| MA-F2 | P5.1 | High | มัดจำ booking/hotel นับรายได้ซ้ำ | fix batch B `e9b765b4` (นโยบาย W39) | `ledger/wo-notes/pos-P5.1-hunt-MA.md` |
| MA-F3 | P5.1 | Med | legacy registerSaleAction ไว้ใจราคาจาก client · ไม่มี V2-on refusal | fix batch A+C+D `5926434f` | `ledger/wo-notes/pos-P5.1-hunt-MA.md` |
| MA-F4 | P5.1 | Med | รับมัดจำซ้ำหลังคืนเงินไม่บันทึก | fix batch C `6b1f84a5` (W41) | `ledger/wo-notes/pos-P5.1-hunt-MA.md` |
| MA-F5 | P5.1 | Med | ticket/hotel เสียบิลเมื่อ createSale ล้มหลัง commit สถานะ | fix batch C `6b1f84a5` | `ledger/wo-notes/pos-P5.1-hunt-MA.md` |
| MA-F6 | P5.1 | Med | subscribe ซ้อนสร้าง 2 subscription | fix batch A+C+D `5926434f` | `ledger/wo-notes/pos-P5.1-hunt-MA.md` |
| L1-F1 | P5.2 | High | MANAGER สาขาหนึ่งอนุมัติ void/refund/discount ของอีกสาขา | fix A+B+C+F `c4584062` | `ledger/wo-notes/pos-P5.2-hunt-L1.md` |
| L1-F2 | P5.2 | Med | ตั้ง/ปลดล็อก PIN ข้าม rank | fix A+B+C+F `c4584062` | `ledger/wo-notes/pos-P5.2-hunt-L1.md` |
| L1-F3 | P5.2 | Med | API key ทั่วไปอ่านยอดขายทุกสาขาผ่าน AI tool route | fix D+E `98f60761` | `ledger/wo-notes/pos-P5.2-hunt-L1.md` |
| P53-F1 | P5.3 | Med | ดัชนีบาร์โค้ดดึงผ่าน server action ที่ Next เรียงคิวต่อ client → ขวาง quote/submit · version ขยับทุก stock cut = ชุดเต็ม 2.5 MiB ทุก tick | fix1c `f30aef7c` (GET route + ETag/304 · ไม่ดึงตอน pay/done · version ไม่รวม stock) | `ledger/wo-notes/pos-P5.3-fix1-review.md` |
| P53-F2 | P5.3 | Med | refetch วนจากรหัสที่ตั้งใจไม่ใส่ดัชนี (แม่+ตัวแปร) และ stockLeft เปลี่ยน | fix1c `f30aef7c` (excluded[] จากเซิร์ฟเวอร์ · เทียบเฉพาะ field ตัดสิน) | `ledger/wo-notes/pos-P5.3-fix1-review.md` |
| P53-F3 | P5.3 | Med | ขอบราคาโปรตัดสินด้วยนาฬิกาแท็บเล็ต → นาฬิกาเร็ว = ดึงชุดเต็มรัวทุก 15 วิ | fix1c `f30aef7c` (serverNow/offset · ขอบที่ผ่านแล้วไม่สั่งดึง) | `ledger/wo-notes/pos-P5.3-fix1-review.md` |
| P53-H1 | P5.3 | Med | route ดัชนีไม่มี cache/throttle — ผู้มีสิทธิ์ขายเรียกวนได้ (≈40× หน้าแคตตาล็อก) | fix1c `f30aef7c` (cache ตาม version 120 วิ · build ร่วม · cap 2/tenant · 429 >1 ชุดเต็ม/10 วิ/ผู้ใช้) · fix1d `1abfdcd1` งบ 4 MiB/ชุด 64 MiB รวม | `ledger/wo-notes/pos-P5.3-fix1-review.md` |
| P53-D1 | P5.3 | Med | hit จากดัชนีทับ stock ที่จอรู้สดกว่า → ป้าย "สต็อก X→Y"/คำเตือนเกินสต็อกผิด (ไม่กระทบเงิน) | fix1d `1abfdcd1` (mergeKnownStock) | `ledger/wo-notes/pos-P5.3-fix1-review.md` |
| L1-F4 | P5.2 | Med | แอ็กชันคลังเขียน catalog POS ทุกสาขาไม่ผ่านด่านแถว | หนี้ → W37 (OP) | `ledger/wo-notes/pos-P5.2-hunt-L1.md` |
| L1-F5 | P5.2 | Med | actions/restaurant ไม่มี posLinkedUnit check | fix A+B+C+F `c4584062` | `ledger/wo-notes/pos-P5.2-hunt-L1.md` |
| L1-F6 | P5.2 | Med | ด่านระดับร้าน ⇒ MANAGER สาขาเดียวผ่าน (credit ฯลฯ) | fix D+E `98f60761` | `ledger/wo-notes/pos-P5.2-hunt-L1.md` |
| P25-N1 | P2.5 | Med | void บางส่วนของแผน DONE ขณะมีแผน OPEN ค้าง consumer | แก้ก่อน merge S `96cc5f4f` (CLOSED) | `ledger/wo-notes/pos-P2.5-hunt.md` |
| P25-N2 | P2.5 | Med | checkout/cancel ของร้านอาหารเดิมข้ามแผน OPEN | PARTIAL → ประตู legacy W1 (debt) | `ledger/wo-notes/pos-P2.5-hunt.md` |
| P26-H1 | P2.6 | Med | consume floor-0 ลืมที่ตัด แต่ restore คืนเต็ม (phantom stock) | fix round ก่อน merge S `671e6fd2` | `ledger/wo-notes/pos-P2.6-hunt.md` |
| P26-H2 | P2.6 | Med | deadlock ลำดับล็อกสลับ P2.6 ↔ P2.4/legacy | fix round ก่อน merge S `671e6fd2` | `ledger/wo-notes/pos-P2.6-hunt.md` |
| P26-H3 | P2.6 | Med | "last" ซ้อนทำ PosOrder ค้าง PREPARING | fix round ก่อน merge S `671e6fd2` | `ledger/wo-notes/pos-P2.6-hunt.md` |
| P26-H4 | P2.6 | Med | heal สร้างตั๋วช้าให้บิลที่เสิร์ฟแล้ว | fix round ก่อน merge S `671e6fd2` | `ledger/wo-notes/pos-P2.6-hunt.md` |
| P26-H5 | P2.6 | Med | 86 ตอนตัวนับ 0 ถูก void restore ย้อน | fix round ก่อน merge S `671e6fd2` | `ledger/wo-notes/pos-P2.6-hunt.md` |
| P28-H1 | P2.8 | Med | ด่าน F1 อ่าน mirror ที่ถึง PosOrder แบบ best-effort | fix round 3 ก่อน merge S `d85ea5c3` | `ledger/wo-notes/pos-P2.8-hunt.md` |
| P28-H2 | P2.8 | Med | ยกเลิก WEB order ที่รับแล้ว ShopOrder ยังจ่ายได้ | fix round 3 ก่อน merge S `d85ea5c3` | `ledger/wo-notes/pos-P2.8-hunt.md` |
| P29-H1 | P2.9 | Med | ส่วนบัตรของขวัญ/เครดิตร้านคืนเป็นเงินสดได้ | แก้ก่อน merge S `40ade233` · มติ CD-P29-1 `d871877c` | `ledger/wo-notes/pos-P2.9-hunt.md` |

## §3 ORACLE-EDIT
ORACLE-EDIT ทั้ง RUN = **433 commits** ในช่วง `71a1f363..a35fe494` (git log --grep ORACLE-EDIT) · รายการเต็มพร้อม SHA: `ledger/wo-notes/pos-oracle-edits.md` · ทุกตัวมีมติผู้คุม (CD-*) ในข้อความ commit หรือ `ledger/POS-RESUME.md` · หมุดเลนย้ายด้วย `scripts/pos-repin-lane.sh` (CD-RP1…RP27b) · กติกา: ห้ามแก้ข้อสอบนอกมติ · oracle ใหม่หมุดคงที่แบบ env-override.

## §4 หนี้/ของค้างที่รับไว้
| หนี้ | ผล | ที่มา |
|---|---|---|
| ไม่มีข้อสอบด่านสิทธิ์ของหน้าคู่มือ /pos/help (ทุก persona QC ถือคีย์ pos.*) | เสี่ยงต่ำ · โค้ดถูก · ควรเพิ่ม pin static | `ledger/wo-notes/pos-P6.2-review.md` F3 |
| แอ็กชันคลังเขียน catalog POS ทุกสาขา (L1-F4) | รอเจ้าของ | W37 (POS-OWNER-PENDING) |
| ประตู legacy ร้านอาหารบนสาขาที่ผูก POS (P25-N2 PARTIAL) | ใช้ 409 POS_LINKED + redirect | W1 (POS-OWNER-PENDING) |
| บิลเครดิตเทอมส่ง dueDate เป็นข้อมูล ไม่พิมพ์บนใบเสร็จ | ค่าเริ่มต้น = ข้อมูลอย่างเดียว | W43 (POS-OWNER-PENDING) |
| walker phase B 14 ช่อง ≈28 ชม. | รันทั้งหมดใน chain v3 | W42 (POS-OWNER-PENDING) |
| ข้อความ "% ไม่ถูกต้อง" ในกล่อง +X% ทั้งช่องทาง (BulkMarkupDialog.tsx pctInvalid) ไม่มี testid → ตัวกดตรวจได้แค่ตัวอย่างราคาเปลี่ยน (CD-P43-12) | รับไว้ · เพิ่ม testid ภายหลัง = แตะ src/ทะเบียน | `ledger/POS-RESUME.md` CD-P43-12 |
| ดัชนีบาร์โค้ด: กลุ่มตัวเลือกไม่บังคับที่ผูกหลังโหลดดัชนี ไม่ทำให้ quote ปฏิเสธ → บรรทัดขายไปโดยไม่เสนอตัวเลือกจนรอบ refresh ถัดไป (≤15 นาที) | รับไว้ (เงินถูก · quote re-price) | `ledger/wo-notes/pos-P5.3-fix1-review.md` D5 |
| โครงแพลตฟอร์ม/สลิป/e-Tax ปิดสุภาพ รอ creds | เปิดเมื่อตั้ง POS_CREDENTIALS_KEY | W4 (POS-OWNER-PENDING) · `ledger/wo-notes/pos-P3-SKEL.md` |

## §5 เรื่องรอเจ้าของ (W1…W43 · สถานะ: open = ยังไม่มีคำตอบ · default = ใช้ค่าเริ่มต้นไปแล้ว · รายละเอียดใน `ledger/POS-OWNER-PENDING.md` §รอคำตอบ)
| W | สถานะ | เรื่อง |
|---|---|---|
| W1 | default | ประตู legacy บนสาขาที่ผูก POS (409 POS_LINKED + redirect · ไม่ลบโค้ด) |
| W2 | default | ขาย REST เงินสดต้องมีกะเปิด (SHIFT_REQUIRED) |
| W3 | default | เช็กพอยต์ปิด P2 (ถือว่ารับทราบ) |
| W4 | open | creds แพลตฟอร์ม/Beam/e-Tax + env POS_CREDENTIALS_KEY |
| W5 | open | ร้านทดลองใช้จริง + เครื่องพิมพ์/ลิ้นชัก |
| W6 | default | REST ขายเงินสดนอกกะเมื่อสวิตช์ปิด แต่ orders.pay ปฏิเสธ |
| W7 | default | ไม่เพิ่มกฎกะเดียวต่อสาขา |
| W8 | default | คืนเงินบิลแพลตฟอร์มข้ามสมุดบัญชี |
| W9 | default | ค่าคอมฯ พนักงาน: เดือนที่ขาย · ฐานไม่รวม VAT |
| W10 | default | PIN POS กับ PIN HR คง 2 ที่เก็บ |
| W11 | default | เลขใบเสร็จบิลออฟไลน์ออกตอนซิงก์ |
| W12 | default | PWA app-shell ไม่สร้างจนทดสอบเครื่องจริง |
| W13 | default | Daily Brief ส่งในแอป+push |
| W14 | default | กฎผิดปกติ A11 ใช้ค่าเริ่มต้น A1–A10 |
| W15 | default | ข้อความอัตโนมัติถึงลูกค้าทางแชท |
| W16 | default | เครดิตเทอม: INVOICE + VAT ตอนขาย |
| W17 | default | แต้มสมาชิกบนบิลแพลตฟอร์ม เปิด |
| W18 | default | โพสต์ปิดกะแสดงยอดขาด/เกิน |
| W19 | default | เก็บสลิป 5 ปี |
| W20 | open | ผู้ให้บริการตรวจสลิป/e-Tax/Beam merchant |
| W21 | default | หมุดเลน diff-based (คลาส ST2) ใช้ re-pin ตามมติ |
| W22 | default | P3.5U จอกะ เลย์เอาต์อนุมาน |
| W23 | default | บิลเครดิต INVOICE ใบเดียว |
| W24 | default | P3.4U จอออฟไลน์อนุมาน |
| W25 | default | P3.7U จอแชทอนุมาน |
| W26 | default | P3.8U บอร์ด/ห้องทีมอนุมาน |
| W27 | default | QR โต๊ะ โทเคนใหม่ ≥ 60 บิต |
| W28 | default | P3.6U ลูกค้าองค์กรอนุมาน |
| W29 | default | หน้าขายเก่า 27 จุดไม่มี testid |
| W30 | default | walker สร้างสาขา posqc-btn บน QC5 |
| W31 | default | ซ้อม migration บน branch สำเนา prod (ลบวันเดียว · ไม่ส่งออก) — ทำแล้ว §6 |
| W32 | open | เจ้าของรัน deploy ตาม runbook (ลำดับ CD-P61-R1) |
| W33 | open | เจ้าของรัน verify --counts บน prod |
| W34 | open | ยืนยัน crontab นาทีบน VPS prod |
| W35 | default | P3-SKEL U จออนุมาน |
| W36 | default | P3.9U สรุปเช้าอนุมาน |
| W37 | default | L1-F4 แอ็กชันคลัง (ค่าเริ่มต้นตาม OP) |
| W38 | default | updatePosStaffCommission หลังคีย์อ่าน (ค่าเริ่มต้นตาม OP) |
| W39 | default | มัดจำโมดูล = หนี้สิน 2110 |
| W40 | open | ตั้ง env POS_DEVICE_KEY ก่อน deploy |
| W41 | default | วิธีจ่ายมัดจำที่โมดูลรับ |
| W42 | default | walker phase B รันทั้งหมด |
| W43 | default | dueDate เป็นข้อมูล ไม่พิมพ์ |

## §6 ถอยกลับ / deploy
- ลำดับ deploy และการถอยกลับ: `docs/pos/DEPLOY-RUNBOOK.md` §0 (CD-P61-R1: migrate ก่อน merge main) · §4 (ขั้น GO-1…GO-13) · §4.4 ล้มกลางทาง · **§9 เปิดใช้ทีละร้าน · ธง/สวิตช์ · การถอยกลับ** · ภาคผนวก ก SQL ถอยกลับ.
- ซ้อมแล้ว 24 ต.ค. บน branch สำเนา prod (W31): migrate deploy 37/37 · index 15/15 valid · verify 23/23 — `ledger/wo-notes/pos-P6.1.md`.
- PR body ร่าง: `ledger/pos-briefs/pos-PR-main.md` (เติม SHA/ด่านสุดท้ายก่อนเปิด PR) · ⛔ ผู้คุมไม่ push main.

## §7 วิธีรัน (ทุกอย่างหนักผ่าน `scripts/iso.sh` · ⛔ ห้ามตั้ง CI ในสคริปต์ด่าน · systemd-run ใช้ path เต็ม)
- ด่าน POS เต็ม: `bash scripts/pos-gates-all.sh --out /root/pos-runs/gatesNNN-c-<ts>` บนทรี c ที่ checkout tip (ดูแม่แบบ `/root/pos-runs/ctl-scripts-2026-10-23A/gates130-TEMPLATE.sh`) · manifest `scripts/pos-gates.json` · ข้อสอบเดี่ยว: `bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p6.2.mts` (แทนชื่อชุดที่ต้องการ · static: `--no-db`).
- qc:all ทั้งรีโป: `pnpm qc:all` บน Neon branch ที่แตกจาก QC4 (ครั้งเดียว · ดู memory QC6/QC7).
- walker: `scripts/qc-pos-buttons.mts --user <u> --device <d> --page all [--locale en] --base http://127.0.0.1:3228` บนทรี d (build + serve QC5 ผ่าน `scripts/qc5.sh`) แล้ว `scripts/qc-pos-p4.2.mts` · chain รวม: `/root/pos-runs/ctl-scripts-2026-10-23A/chain-p43-d-v2-TEMPLATE.sh <HEAD>`.
- perf: `scripts/seed-pos-perf.mts --preflight` → seed → `scripts/qc-pos-p5.3.mts --base <url> --tenant <id>` ×2 → `--drop` (QC5 เท่านั้น).
- ภาพ 3 ขนาด: `scripts/visual-pos.mts <wo> --user owner --page <p> --base <url>` (en = `env LOCALE=en` หลัง with-gate-lock เพราะ iso.sh ทิ้ง env).
- re-pin หมุดเลนหลัง merge: `bash scripts/pos-repin-lane.sh /root/projects/shark-pos <sha> "<tag>" <suite[:VAR]>…` แล้วกวาด static.
- ตรวจ prod อ่านอย่างเดียว: `scripts/verify-prod-pos.mts --counts|--crons|--self-test` (runbook §10).

## §8 ดัชนีหลักฐาน
| id | หลักฐาน | ที่อยู่ |
|---|---|---|
| EV-C1 | สถานะ+SHA ทุกใบ · ORACLE-EDIT · HANDOVER | ไฟล์นี้ §1/§3 · `ledger/POS-RESUME.md` · `ledger/wo-notes/pos-oracle-edits.md` |
| EV-C2 | wo-notes ครบทุกใบ | `ledger/wo-notes/` (pos-*.md) |
| EV-C3 | diff ข้อสอบ ↔ ป้าย ORACLE-EDIT | `ledger/wo-notes/pos-oracle-edits.md` (git log --grep) |
| EV-C4 | ด่านเต็มรอบสุดท้าย + walker 19 ช่อง | `/root/pos-runs/gates132-c-20261025T012546Z/SUMMARY.txt` (143 ชุด @c54de3ef) · walker `/root/pos-runs/walker-B-20261025T030640Z/SUMMARY.txt` + `summaries/` (chain v3 · 19 ช่อง) |
| EV-C5 | ภาพทุกจอ 3 ขนาด + ทะเบียนปุ่ม | `scripts/pos-ui-inventory.json` · `scripts/pos-visual-sweep.json` · `/root/pos-runs/vis-*` |
| EV-C6 | รายงานนักล่า + ตาราง finding → แก้ | `ledger/wo-notes/pos-P5.1-hunt-MA.md` · `ledger/wo-notes/pos-P5.2-hunt-L1.md` · §2 |
| EV-C7 | ซ้อม/ตรวจ migration (owner ขั้น deploy จริง W31/W32) | `ledger/wo-notes/pos-P6.1.md` · `docs/pos/DEPLOY-RUNBOOK.md` |
| EV-C8 | `.env` ไม่ถูกแตะ · ไม่มีข้อสอบบน prod · ไม่มี EAS build | ไม่มีคอมมิตแตะ .env* ใน RUN · ไม่มี EAS build (POS เป็นเว็บ) · `scripts/lib/pos-prod-writer-guard.mts` |
| EV-P1 | ขายจริง 1 บิลบน prod ร้านทดลอง (W5) | owner — หลัง deploy (W5 · W32) |
| EV-P2 | Z report 1 กะ บน prod | owner — หลัง deploy |
| EV-P3 | ออเดอร์ MANUAL 1 ใบจบถึงบัญชี บน prod | owner — หลัง deploy |
| EV-P4 | qc:all + perf | qc:all QC7 22 ต.ค. 283/429 (`ledger/HANDOVER-2026-10-22-POS-P3.md` §2) · perf P5.3 25/25 ×2 (B3U p95 23 ms) `/root/pos-runs/walker-B-20261025T030640Z/perf-run1.log` · `perf-run2.log` |
| EV-P5 | parity ทุกจอ 1440/1024/390 | `ledger/HANDOVER-2026-10-16-POS-P2.md` §3 · `ledger/HANDOVER-2026-10-22-POS-P3.md` §1 (vis-*) · help: `/root/pos-runs/walker-B-20261025T030640Z/visual-help-th.log` · `visual-help-en.log` |
| EV-P6 | HANDOVER ฉบับนี้ | `ledger/HANDOVER-2026-10-POS.md` |
