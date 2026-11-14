# trips-A1.3a — ระดับ A/B/C · rate card · แถวราคา 3 แบบ + คอมฯ บาทต่อที่นั่ง · ช่วงพิเศษ · port ราคาเอเจนซี่ · เครื่องลองคิด (รายงานผู้สร้าง · 14 พ.ย. 2569 · เลน l2 · ยังไม่ commit)

- ไฟล์ใหม่: `agency/rates-core.ts` (488 · บริสุทธิ์) · `agency/rates.ts` (~930 · บริการ + ตัวโหลด + port + เครื่องลองคิด)
- ต่อท้าย: `agency/index.ts` (+50 บล็อก A1.3a) · `core/permissions.ts` (+3 · 2 คีย์) · `platform/sellables.ts` (+1 บรรทัด lazy)
- ไม่มี migration · ไม่แตะ schema · ไม่แตะไฟล์ต้องห้าม
- ผู้สร้างคนที่ 3: ใช้ต่องานค้างทั้งชุด (อ่านเทียบใบสั่งทีละข้อแล้ว) · แก้ 1 จุด: port ตัดสินสถานะ/หน่วยของบัญชี**ก่อน**อ่านค่าตั้ง (`loadFacts(..., admit)`) ⇒ บัญชีที่ไม่ควรเปิดได้ null เสมอ แม้ค่าตั้งผิดรูป (เดิม throw ได้ก่อนถึงด่านสถานะ)

## ผล
- a1.3 (เต็ม รวม G): 98/101 · แดง S-6 S-7 X-4 = แย้งข้อสอบ (ด้านล่าง) · SKIP 0 · G-1 fitness ✅ · G-2 a1.2 ✅ · G-3 t0.5 ✅
- t0.5 130/130 · fitness 54/54 (F5.1 = 52 ✅ · F17.1 ✅) · typecheck 0
- a1.2 (--no-regression) 168/173 · แดง S-6 S-7 S-8 = ข้อขอบเขตเทียบฐาน b11dbd849 เห็นไฟล์ที่มีอยู่แล้วที่ HEAD (fitness.mts · parity-trips.sh · visual-trips.mts · qc-trips-a1.3.mts · trips/index.ts) — ไม่ใช่ไฟล์ของใบนี้
- a1.1 119/125 · แดง S-5 (rates.ts lazy import trips = มติ R2) · S-9 S-10 (sellables.ts = ไฟล์เจ้าของ §2 + ไฟล์ที่ HEAD มีอยู่แล้ว) · S-11 S-13 (trips/index.ts · fitness.mts ที่ HEAD) · G-1 → t0.1 S-8 (agency→trips = มติ R2) ⇒ ORACLE-EDIT ผู้คุมตาม §14 ข้อ 3

## แย้งข้อสอบ
- **S-6 / S-7**: `BASE_SHA = e60f54c89` แต่ผู้คุมเพิ่มเส้น `"agency→trips"` ใน `scripts/fitness.mts` ใน commit ใบสั่ง 8a8c1a070 (หลังฐาน) และ `session/trips` ยังไม่มีบรรทัดนั้น ⇒ `sameAsSession` ไม่ช่วย · ผู้สร้างไม่ได้แตะไฟล์นี้ (`git diff 8a8c1a070 -- scripts/fitness.mts` ว่าง) · เสนอ: BASE_SHA = `8a8c1a070` หรือยกเว้น `scripts/fitness.mts`
- **X-4**: regex `/legalName|taxId|bank|contact|licence/i` ใน `keysDeep` จับคีย์ค่าตั้ง `agency.crm.customerContactRoute` ซึ่งเป็น 1 ใน 24 คีย์ของ `policySnapshot` ที่ใบสั่ง §8 และข้อเดียวกัน (24 คีย์) บังคับ ⇒ ผ่านพร้อมกันไม่ได้โดยไม่ตัด snapshot (ซึ่งจะทำ SN และ snapshot ของ T0.5 พัง) · เสนอ: สแกน keysDeep เฉพาะนอก `policySnapshot.values` หรือยกเว้นคีย์ที่ขึ้นต้น `agency.`

## ตัดสินเองเมื่อใบสั่งเงียบ
- เครื่องลองคิดแทนชั้นเอเจนซี่ผ่าน port: ctx ของผู้กระทำ AGENT ที่เครื่องลองคิดสร้างเองถูกจดใน WeakMap ⇒ `agencyPricingPort.load` คืนผล build ของร่าง/บัญชีที่ไม่ ACTIVE/actualSaleSatang แทน (ผู้เรียกภายนอกปลอมไม่ได้ · ไม่ต้องแก้ trips) — เทียบเท่าขั้น (3) ของ §9 · ไม่มีร่าง+ACTIVE ⇒ ผลเท่า port จริง (TP-2 ทุกไบต์)
- audit `agency.tier.ensure` ใช้ `targetType "AgentTier"` (ไม่มี card/บัญชีให้อ้าง) · after = `{ count }`
- setAgentAccountTier บัญชีสถานะไม่ได้ ⇒ `BAD_STATE reason ACCOUNT_NOT_ACTIVE`
- ร่างในเครื่องลองคิด: แถวคีย์ NND ซ้ำกันในร่าง ⇒ `RATE_OVERLAP` (เหมือนชน unique ตอนบันทึก)
- ARCHIVE ไม่ล็อกเจ้าของ (ไม่มีกติกาซ้อน) · ACTIVATE/แก้ช่วง-ลำดับล็อก `agency.ratecard.v1` ก่อน CAS แถว card
- ค่าคงที่โครงสร้าง (TX_OPTS · จำนวนลองใหม่ · int4 ของ zod · เขตเวลาสำรอง · `"30"` ของมติ R3 A1.1) อยู่ใน rates.ts — ไม่ใช่ค่าธุรกิจของ §3

## หนี้
- A1.3b: จอ + `AgentContract` + ตารางรวมราคาต่อสินค้า + แก้ชื่อ/ปิดระดับ + คืนค่าเริ่มต้น
- A1.4: เรียก port ในถือที่/จอง · ตรวจสถานะซ้ำตอน commit · ส่ง actualSaleSatang · รหัส AGENT_SUSPENDED (Q10)
- A1.8: linkId → เอเจนซี่ · ห้ามส่ง commission/ราคาเน็ตให้ PUBLIC · A1.6/A1.7: payerType จากสมุด (Q5) · อัตราหัก ณ วันจ่าย (Q6)
- OQ29 (R3 ช่วงพิเศษของระดับถูกสัญญาบัง) · OQ30 (R4 ภาษี Q4–Q6) รอเจ้าของ

## รอบตรวจ-แก้และหนี้ (ผู้คุม · 14 พ.ย. 2569)
- ลำดับ: ผู้สร้าง 98/101 → ผู้ตรวจอิสระ 2 คน + นักล่า (4 probe) = FIX FIRST → มติ Z1–Z9 → r1 (แตะ trips 3 บรรทัด: ส่งสกุลของการจองเข้า port · ด่าน COMMISSION_EXCEEDS_PAYABLE) → ผู้เขียนข้อสอบแยก 114 ข้อ → ผู้ตรวจรอบ 2 = MERGE WITH DEBTS → มติ V1–V4 → r2 → ผู้เขียนข้อสอบแยก 121 ข้อ · probe HELD 191 FOUND 0
- มติทั้งหมด: ท้าย `ledger/trips-briefs/A1.3.md` (R1–R8 · Z1–Z9 · V1–V4)
- **หนี้ที่ต้องปิดในใบสั่ง A1.4 ก่อนเปิดการจองของเอเจนซี่ (เงินจริง):** ร้านเก็บเงินเอง + VAT ของคอมฯ แบบบวกเพิ่ม ⇒ ยอดจ่ายเอเจนซี่เกินยอดลูกค้าจ่ายได้ (ด่าน `payToAgent > payable`) · คอมฯ คงที่ต่อที่นั่งเมื่อโปร/แต้มลดราคาต่ำกว่าคอมฯ (OQ32) · ข้อความ COMMISSION_EXCEEDS_PAYABLE ไม่ตรงเงื่อนไข · `COMMISSION_FIXED` × ที่นั่งอาจเกิน int4 ตอนเขียนการจอง
- **หนี้ A1.3b (จอ):** ข้อความไทย/อังกฤษรายเหตุ (เช่น `PAX_RATE_MIN_SELL` ยังเห็นเป็นข้อความ VALIDATION ทั่วไป) · จอต้องโหลดการ์ดใหม่หลังได้ `replayed` · ปิดระดับ (ระดับที่ปิดยังให้ค่าเริ่ม/ใช้การ์ดได้) · ชื่อการ์ดแบบสูตร CSV ผ่าน `csvRow` ตอนส่งออก · ร่างไม่ตรวจ CARD_OVERLAP
- **หนี้อื่น:** ขั้นต่ำต่อประเภทคนต้องขยาย `Level` ของ T0.5 (วันนี้ปฏิเสธตอนบันทึก) · การแปลงสกุลเงิน (L1.12) · A7 เกิน int4 = ค่าตั้งผิดรูป (จำกัดที่ settings def) · รายชื่อผู้รับที่ได้อัตรา e-WHT เป็นค่าคงที่ในโค้ด (ไม่มีคีย์ค่าตั้ง) · เขตเวลาผิดรูป port throw · OQ29 OQ30
