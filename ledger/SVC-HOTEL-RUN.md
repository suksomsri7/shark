# SVC-HOTEL-RUN — สถานะสด + บันทึกเหตุการณ์ เฟส H (โรงแรม V2) · เริ่ม 7 พ.ย. 2569

> กติกาเหล็ก = `SVC-RUN.md` §1 ทั้งหมด (ห้าม push main/deploy · QC DB ผ่าน `qc-svc.sh` · migration เฉพาะ H.0 · ORACLE-EDIT เฉพาะผู้คุม · ภาพคู่ทุกจอ · ตัวเฝ้าทุกงานยาว) · แผน = `SVC-HOTEL-PLAN.md` ร่าง 2 · ใบสั่ง = `svc-briefs/svc-brief-h.N.md` · ข้อสอบ = `scripts/qc-svc-h.N.mts`
> เจ้าของสั่ง 7 พ.ย. ~15Z: **"เริ่มได้ ทำขนานกับระบบเลขา"** (เลขา S3a.6 รันอยู่เลน shark-sec-d) ⇒ โรงแรม 2 เลนจน S3a.6 ปิด แล้ว 3 เลน · build/tsc รอ RAM ≥ 10G เสมอ
> รายงาน Telegram: `tg "📊 HOTEL · NN% (x/11)"` หลังปิดใบเท่านั้น · branch `session/svc` (ต่อจาก SVC · ทรีหลัก commit เอกสาร `--no-verify` จนกว่า Prisma client ร่วมทรีเลขาจะหมดปัญหา)

## 1. เลน (ทรีที่มี node_modules/Prisma client แยกจากทรีเลขาเท่านั้น)
| เลน | ทรี | ฐาน QC | node_modules | ใช้ทำ |
|---|---|---|---|---|
| hA | `/root/projects/shark-svc-l2` | l2 ep-weathered-mode | `shark-svc-nm-l2-store` (แยก) | ข้อสอบ h.0/h.1 → builder H.0 |
| hB | `/root/projects/shark-svc-l1` | l1 ep-royal-lake | `shark-svc-nm-l1-store` (แยก) | ข้อสอบ h.1 → builder H.1 |
| hC | (เปิดเมื่อ S3a.6 ปิด) | l3 ep-royal-bar | ต้องตรวจว่าแยกจากทรีหลักก่อน | ผู้ตรวจ/ใบถัดไป |
| ด่านรวม | `/root/projects/shark-svc` (ทรีหลัก) | ep-mute-scene | **ร่วมทรีเลขา — ห้าม prisma generate/tsc/build ที่นี่จน RUN เลขาจบ** | ledger · merge · push |

## 2. สถานะ (ตัวนับ x/11)
| ใบ | งาน | ขนาด | ข้อสอบ | ผล | SHA | หมายเหตุ |
|---|---|---|---|---|---|---|
| H.0 | migration svc_h + backfill + scope/registry + ด่าน HOTEL | 1 | qc-svc-h.0 | ✅ | 5b1d69ea6 | 152/153 (V-1 SKIP รอ QC server) · ผู้ตรวจผ่าน 0 CRITICAL/MAJOR · ORACLE-EDIT 8 จุด |
| H.1 | ราคา/ฤดู/วันหยุด/แผน/ยกเลิก/ภาษี + จอราคา + จอตั้งค่า + แท็บ | 2 | qc-svc-h.1 | ⬜ | | ภาพ 15 |
| H.3 | จอง V2 (HOLD · กลุ่ม · ยกเลิกตามขั้นบันได · ต่อ/ย่น · no-show) | 1.5 | qc-svc-h.3 | ⬜ | | load test 20 คำขอ |
| H.2 | tape chart | 2 | qc-svc-h.2 | ⬜ | | ภาพ 08 |
| H.5 | folio + chargeToRoom + เช็กเอาต์ tenders จริง | 2 | qc-svc-h.5 | ⬜ | | ภาพ 09 ขวา · ORACLE-EDIT oracle P1 |
| H.4 | เช็กอิน + ทะเบียนแขก + ร.ร.3/4 + ตม.30 | 2 | qc-svc-h.4 | ⬜ | | ภาพ 09 ซ้าย · PDPA |
| H.6 | แม่บ้านมือถือ | 1.5 | qc-svc-h.6 | ⬜ | | ภาพ 13 |
| H.7 | night audit + รายงาน | 1.5 | qc-svc-h.7 | ⬜ | | |
| H.8 | จองออนไลน์ V2 | 1.5 | qc-svc-h.8 | ⬜ | | ภาพ 16 · อีเมล |
| H.10 | โครง OTA + fake adapter | 2 | qc-svc-h.10 | ⬜ | | ภาพ 11 |
| H.9 | ปิดเฟส: ด่านเต็ม + ไล่กด + PARITY + แพ็ก UAT | 1 | — | ⬜ | | ผู้คุม |

**1/11 (9%)** · นอกตัวนับ: H2.1–H2.3 ตัวต่อ channel manager เจ้าจริง (รอชื่อจากลูกค้า)

### 2.1 หนี้ (ข้อที่ผ่านไม่ได้ · เหตุผล · ใบที่จะปิด)
| จาก | หนี้ | ระดับ | ปิดที่ |
|---|---|---|---|
| H.0 | (ผู้ตรวจ m) `@@unique` ที่มี nullable (HotelRate.seasonId · RateOverride.ratePlanId) ใช้ findUnique/upsert ไม่ได้ ⇒ findFirst+create/update ใน tx · คอมเมนต์เตือน DROP ทิศ DB→schema ของ index มือ 3 ตัว · `service.ts:83` คอมเมนต์ RATE_PLAN ล้าสมัย · weekendDays ไม่กันซ้ำ · codePrefix ไม่มี regex | m | H.1 |
| H.0 | (ผู้ตรวจ m) backfill: import static ต้องรันผ่าน qc-svc.sh/มี env · tx เดียว ≤10 นาที ล็อกแถว BOOKED (รัน prod ช่วงเงียบ) · `loadSvcQcEnv` ปฏิเสธ prod ⇒ ต้องมีขั้นตอนเปิดทาง prod ก่อน deploy · claim ไม่กรองวัน (การจองอดีตได้ STAY/folio OPEN ย้อนหลัง) · CONFLICT พิมพ์รอบแรกเท่านั้น (คิวรีสำรอง: มีคืนแต่ไม่มี STAY active) · แถวเดิม source=WALK_IN ทุกแถว · nights จาก ratePerNight อาจ ≠ totalSatang ถ้ามีส่วนลด | m | H.3 / H.7 / H.5 / deploy |
| H.0 | enum โรงแรมเดิม 3 คีย์ (noShow · ota.roomScope · ota.onConflict) ยังไม่มี enumLabelsTh (R-9 ห้ามแก้คีย์เดิมใน H.0) · คีย์ chain RATE_PLAN อย่างเดียวต้องเปิดชั้นจากจอโรงแรม ไม่งั้น r0.4 D-2 แดงเมื่อเปิดคีย์ | m | H.1 §6.1 |
| นอก H | r0.9 G-1 แดง 55/56 (qc-hotel-money ซ้อน 3 ชั้น HT-2.x journal 0 แถว) ตั้งแต่ G2/G3 — ORACLE-EDIT h0-G5 ยอมเฉพาะ G-1 | m | หลัง RUN |

## 3. บันทึกเหตุการณ์
- 7 พ.ย. ~15Z · **เริ่ม RUN HOTEL** (เจ้าของสั่งหลังแก้ประเมิน: เลขาไม่มีเลน build ค้าง · S3a.6 เพิ่งเริ่ม) · tg 0% · เลน hA=l2 hB=l1 (Prisma client แยกจากทรีเลขา · ตรวจ inode แล้ว) · ขั้นแรก: ฟิกซ์เจอร์ H (ผู้คุม) → ข้อสอบ h.0 + h.1 ขนาน → builder H.0
- 7 พ.ย. ~16Z · ฟิกซ์เจอร์ H commit a9aad92d8 (SQC_HOTEL_RATES · ภาพ h.1 · frontdesk +hotel.rates.read) · เลน hA (l2) = ผู้เขียนข้อสอบ h.0 · hB (l1) = ผู้เขียนข้อสอบ h.1 (Fable ทั้งคู่ · branch wip/svc-h0-oracle / wip/svc-h1-oracle) · ทรีหลัก/l4 ห้ามรันของหนัก (Prisma client ร่วมทรีเลขา) · hC = l3 (client แยก · ตรวจแล้ว) เตรียมไว้
- 7 พ.ย. ~17:4xZ · **ข้อสอบ h.0 (153 ข้อ · c10ff6014) + h.1 (122 ข้อ · 2957b2cd0) รับแล้ว** — ผู้คุมรันซ้ำเองบน l2/l1: h.0 13 เขียว (PC 7 + guard 6) ที่เหลือแดงเหตุผลตรง · h.1 10 เขียว (PC 6 + F/Z) 0 throw ดิบ · มติต่อคำถามผู้เขียน 9+10 ข้อ ลงใบสั่ง §12/§11 (เพิ่ม `HotelSeason.minNights` · ctx.roomTypes · fallback ต่อประเภท · `data-scroll-hint` · NOT_FOUND) · merge f84364e8a + ใบนี้ · reseed l1 · ถัดไป: builder H.0 บน l2 (branch wip/svc-h0)
- 7 พ.ย. ~18:3xZ · builder H.0 รายงานกลางทาง: ถอด hiddenUntil ทำ r0.4 แดง 5 ข้อ (คีย์โรงแรมโผล่หน้าตั้งค่าหอ · enum ไม่มีป้าย · ชั้น RATE_PLAN เปิดจากหน้าหอไม่ได้) + d.13 R-1/R-7 แดง + r0.8 S-6 จับ DELETE HotelRoom ในข้อสอบ h.0 (ทดสอบ RESTRICT) · **มติ: H.0 คง hiddenUntil PHASE_H · H.1 เปิดตามประเภทหน่วย (`unitTypes`) + enumLabelsTh** (ใบสั่ง h.0 §12 ข้อ 11–12 · h.1 §6.1) · ORACLE-EDIT: h.0 R-1/R-K (h0-R1-keep-hidden) · r0.8 S-6 (r08-S6-h0) · d.13 R-1 (d13-R1-hotel-perm · ขอบเขตแคบลง: คีย์หอเท่านั้น)
- 7 พ.ย. ~17:1xZ · ✅ **H.0** (1/11 · 9%) · builder 10cd55ce3 (147/153 · ข้อแย้ง 5 = ข้อสอบ: M-7 prisma 7.8 ไม่มี --to-url · RP-3/B-3/B-7 ข้อสอบขัดกันเอง · G-5 r0.9 หนี้เดิม) ⇒ ORACLE-EDIT 5 จุด 574708355 · ผู้คุมรันเต็มซ้ำบน l2 @5b1d69ea6 **152/153 0 failed** (V-1 SKIP ไม่มี QC server · r0.9 ยอม G-1) · ผู้ตรวจ (l3 · อ่านอย่างเดียว) ผ่าน 0 CRITICAL/MAJOR · minor 9 → หนี้ §2.1 · backfill ฐาน l2: BOOKED กำพร้า 94 → CONFIRMED · CONFLICT 0 · merge session/svc · ถัดไป: migrate deploy svc_h บน l1/l3/ฐานหลัก → builder H.1 บน l1
- 7 พ.ย. ~17:1xZ · migration svc_h ลงครบ 4 ฐาน QC (l2 โดย builder · l1 · l3 · ฐานหลัก ep-mute-scene โดยผู้คุม · prisma generate เฉพาะ l1/l3 — ทรีหลักยังห้าม) · backfill ยังรันเฉพาะ l2 (ฐานอื่นรันก่อน H.3) · **builder H.1 เริ่มบน l1 (wip/svc-h1)** · ตัวเฝ้า 19:04Z
- 7 พ.ย. ~20:2xZ · builder H.1 รายงาน (57cce5d8d+b3fbe22a5 · ข้อสอบ 117/122 · แดง = G-1/G-6/G-7 ล้วนเป็น oracle เดิมคาด hiddenUntil · tsc ยังไม่ได้รัน RAM 2–3G เลขา build ค้าง) ⇒ ORACLE-EDIT ชุด unitTypes: h.0 R-1/R-K/R-9/D-5 · r0.4 ×3 (hiddenOnDorm) · d.13 unitKeys · h.1 U-13 (ยกเว้น export type P1 เดิม) · F-1/F-3 (settings core 3 ไฟล์ตาม §6.1) · มติ: actions.ts คืนบรรทัด `export type ReservationFormState` เดิม (build P1 ผ่านมาก่อน) · d.13 Q-1..3 บน l1 = ฉากหอตามวันที่ → rebuild ฉากหอบน l1

