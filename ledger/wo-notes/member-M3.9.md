# WO M3.9 — เทมเพลตกิจการ 16 ชุด + ทั่วไป (D7 · §10) · โน้ตของ builder

> RUN "ระบบสมาชิก v2" · worktree `/root/projects/shark-member` · 11 ก.ย. 2569 · builder: Sonnet 5
> สัญญา: `ledger/MEMBER-RUN.md` §2 M3.9 · พิมพ์เขียว `docs/modules/06-member-v2.md` §10 · ข้อสอบ `scripts/qc-member-m3.9.mts` (ไม่ได้แตะ)
> **ตีกลับรอบ 1 (ผู้คุมงาน)**: ข้อสอบเดิมทดสอบ apply ครบ 16 ชุดสะสมในร้านเดียว → ชนเพดาน 60 ฟิลด์/12 ส่วน บังคับให้เทมเพลตย่อเหลือ ~3 ฟิลด์/ชุด (ขัด §10) · ผู้คุมงานแก้ข้อสอบใหม่เป็น "ทดสอบทีละชุดแยกกัน + เก็บกวาดก่อนชุดถัดไป" แล้ว ⇒ เขียนเทมเพลต 15 ชุดใหม่ทั้งหมดให้ตรง §10 เต็มรูป ไม่ย่อเพื่อหนีเพดานอีก (ดู §3)

---

## 1. ไฟล์ที่ส่งมอบ

| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/member/templates/index.ts` | แก้ | ขยายชนิด `MemberTemplate` (เพิ่ม `MemberTemplateTier/Stamp/Journey` เต็มรูป) · ลงทะเบียน 17 เทมเพลต |
| `src/lib/modules/member/templates/dive.ts` | แก้ | เติม `tiers`(2 · reuse gold/platinum) · `stamps`(1) · `journeys`(1) — **ไม่แตะฟิลด์/ส่วนเดิม** (M1.2 ล็อกไว้) |
| `src/lib/modules/member/templates/general.ts` | แก้ | เติม `tiers`(4 มาตรฐาน) · `stamps`(1 "ซื้อครบ 10 ครั้ง") · `journeys`(6 อ้าง presetKey จริงของ M3.3 + 1 นิยามเอง) |
| `templates/{clinic,dental,restaurant,fitness,hotel,retail,salon,tutoring,vet,carcare,travel,sportsclub,repair,realestate,b2b}.ts` | ใหม่ (15 ไฟล์ · **เขียนใหม่ทั้งหมดรอบตีกลับ**) | เทมเพลตกิจการ #2–16 — ฟิลด์/ชนิด/ส่วน/ระดับ/สแตมป์/journey ตรงแถวของตัวเองใน §10 เต็มรูป (ดูตาราง §3) |
| `src/lib/modules/member/templates-service.ts` | ใหม่ | `validateTemplate` · `previewTemplate` · `applyTemplate(ctx, key, {parts, actor, onlyFieldKeys})` — รวม 4 ส่วน (fields ผ่าน `fields.ts` เดิม · tiers ผ่าน `tiers.createTierDef`+`setBenefits`+`setTierRules` · stamps ผ่าน `stamp.createCard` · journeys ผ่าน `journeys.createFromPreset`/`createJourney`) |
| `src/lib/modules/member/fields.ts` | แก้ 1 จุด | `applyTemplate` คืน `created: {sectionIds, fieldIds}` เพิ่มจากเดิม (ของเดิม `added` ไม่เปลี่ยน — ผู้เรียกเดิมไม่ต้องแก้) |
| `src/lib/modules/member/fields-actions.ts` | แก้ | `applyTemplateAction` เปลี่ยนไปเรียก `templates-service.applyTemplate` (รับ `parts`) · เพิ่ม `previewTemplateAction` (อ่านอย่างเดียว) |
| `src/lib/modules/member/index.ts` | แก้ (ต่อท้าย) | export ชนิด/ฟังก์ชันของ `templates` + `templates-service` (validateTemplate/previewTemplate/applyTemplate→`applyMemberTemplate`) |
| `src/components/member/TemplatePreview.tsx` | ใหม่ | แผงตัวอย่าง (นับ ส่วน/ฟิลด์/ระดับ/สแตมป์/journey · เช็กบ็อกซ์ 4 ส่วน testid ตรงตัว · รายการฟิลด์ + ป้าย "มีแล้ว/ใหม่") |
| `src/components/member/FieldDesigner.tsx` | แก้ | เรียก `previewTemplateAction` เมื่อเปลี่ยนเทมเพลต · render `TemplatePreviewPanel` · ปุ่ม "ใช้เทมเพลต" ส่ง `parts` ที่ติ๊กไว้ · โชว์ `template-apply-result` หลัง apply · "ตัวอย่างมือถือ" โชว์ฟิลด์ของเทมเพลตที่เลือก (ก่อน apply) แทนฟิลด์จริงเมื่อมี preview |

**ไม่ได้แตะ**: `scripts/qc-member-*.mts` ทุกไฟล์ (รวมข้อสอบ M3.9 ที่ผู้คุมงานแก้เอง) · `member-qc-env.mts` · `visual-member.mts` · `qc-all.mts` · `seed-member-qc.mts` · `member-expected.json` · `fitness.mts` · `prisma/**` (ไม่มี migration ตามสัญญา) · `.env*`

---

## 2. ผลข้อสอบ M3.9 (ฉบับแก้ของผู้คุมงาน) — **22/24** (ครบทุกข้อที่ไม่ใช่ภาพ/PARITY)

```
JSON_SUMMARY {"total":24,"passed":22,"findings":[{"id":"M3.9-S4.2","sev":"CRITICAL"},{"id":"M3.9-S4.3","sev":"MAJOR"}]}
```

ผ่าน: S1.1 S1.2 · S2.1–S2.16 (ทั้ง 16 เทมเพลต validate+apply+idempotent+Δ ต่อชุดแยกกัน) · S3.1 S3.2 S3.3 · S4.1
ตก: **S4.2** (ภาพ 03 — ต้อง build+serve QC server ถ่ายภาพจริง ซึ่ง builder ห้ามbuild) · **S4.3** (PARITY — รอผู้คุมงานตรวจภาพ)
รันซ้ำ 2 รอบ (หลังเขียนเทมเพลตใหม่ครบ 15 ไฟล์) ได้ 22/24 คงที่ทุกรอบ — ไม่ flaky

---

## 3. กิจการ → ส่วน/ฟิลด์ที่ได้ (เทียบ §10) — ตารางให้ผู้คุมงานตรวจด้วยตา

| กิจการ | ส่วน | ฟิลด์ (n) | อ่อนไหว | ระดับ (n) | สแตมป์ (n) | journey (n) |
|---|---|---|---|---|---|---|
| dive (ไม่แก้ ล็อกจาก M1.2) | dive, health | 13 | ✓ (health) | 2 (reuse gold/platinum) | 1 | 1 |
| clinic | health | **8**: กรุ๊ปเลือด·แพ้ยา(MULTI)·โรคประจำตัว·ยาประจำ·ผู้ติดต่อฉุกเฉิน·แพทย์ประจำ(LOOKUP EMPLOYEE)·คอร์สที่ซื้อ(LOOKUP SERVICE)·ครั้งที่เหลือ | ✓ | 2 (reuse silver/gold) | 1 | 1 |
| dental | health | **5**: ประวัติแพ้ยา·โรคประจำตัว·ประกัน/สิทธิ์(SELECT)·ทันตแพทย์ประจำ(LOOKUP)·ขูดหินปูนล่าสุด(DATE) | ✓ | 2 (`family` ใหม่ + silver) | 1 | 1 |
| restaurant | preferences | **5**: แพ้อาหาร(MULTI)·มังสวิรัติ/ฮาลาล(SELECT)·โต๊ะโปรด·เมนูโปรด(LOOKUP PRODUCT)·วันครบรอบ(DATE) | — | 2 (reuse gold/silver) | **2** | **2** |
| fitness | health | **7**: เป้าหมาย(SELECT)·น้ำหนัก/ส่วนสูง(sensitive)·เทรนเนอร์(LOOKUP)·แพ็กเกจ(LOOKUP SERVICE)·วันหมดอายุ(DATE)·เวลาที่มาบ่อย(SELECT)·ใบรับรองแพทย์(FILE) | ✓ | 2 (`paid_plan` ใหม่ + platinum) | 1 | 1 |
| hotel | documents | **6**: เลขพาสปอร์ต/บัตร·สัญชาติ·ห้องที่ชอบ(SELECT)·หมอน/แพ้(MULTI)·เดินทางกับ(SELECT)·บริษัท | ✓ | 2 (reuse gold/platinum) | 1 | **2** |
| retail | preferences | **6**: ไซซ์เสื้อ·ไซซ์กางเกง·ไซซ์รองเท้า·แบรนด์ที่ชอบ(MULTI)·สีที่ชอบ·ที่อยู่จัดส่ง(หลายที่อยู่) | — | 2 (reuse silver/platinum) | 1 | 1 |
| salon | health | **5**: ช่างประจำ(LOOKUP)·สูตรสี/ทรีตเมนต์ล่าสุด(LONG_TEXT)·แพ้สารเคมี(sensitive)·แรงกดที่ชอบ(SELECT)·ครั้งล่าสุด(DATE) | ✓ | 2 (reuse gold/silver) | 1 | 1 |
| tutoring | family | **6**: ผู้ปกครอง·โรงเรียน/ชั้น(SELECT)·วิชาที่เรียน(MULTI)·ครูประจำ(LOOKUP)·เป้าหมายสอบ(SELECT)·ผลสอบล่าสุด(sensitive) | ✓ | 2 (`family` ใหม่ + silver) | 1 | 1 |
| vet | pets | **7**: ชื่อ·ชนิด/พันธุ์(SELECT)·วันเกิด(DATE)·น้ำหนัก(NUMBER)·วัคซีนล่าสุด(DATE)·แพ้ยา(LONG_TEXT)·ประวัติการรักษา(FILE) | — | **0** (§10: "—") | 1 | 1 |
| carcare | assets | **4**: รถ(LONG_TEXT)·เลขไมล์ล่าสุด(NUMBER)·เปลี่ยนน้ำมันล่าสุด(DATE)·ประกันหมด(DATE) | — | 2 (reuse gold/silver) | 1 | 1 |
| travel | documents | **7**: พาสปอร์ต(sensitive)·หมดอายุ(sensitive)·ประเทศที่เคยไป(MULTI)·สไตล์ทริป(SELECT)·เดินทางกับ(SELECT)·งบต่อทริป(MONEY)·ที่นั่ง/อาหาร | ✓ | 2 (reuse platinum/gold) | 1 | 1 |
| sportsclub | club | **4**: แฮนดิแคป(NUMBER)·ทีม/กลุ่ม(SELECT)·เวลาออกรอบที่ชอบ(SELECT)·ล็อกเกอร์ | — | 2 (`annual_plan` ใหม่ + gold) | 1 | 1 |
| repair | assets | **4**: ประเภทงานซ่อม(SELECT · เติมให้ครบ ≥4)·อุปกรณ์(LONG_TEXT)·ประกันหมด(DATE)·งานซ่อมล่าสุด | — | **0** (§10: "—") | 1 | 1 |
| realestate | documents | **6**: ห้อง/ยูนิต·สัญญาเริ่ม(DATE)·สัญญาหมด(DATE)·เงินประกัน(MONEY sensitive)·ผู้ติดต่อฉุกเฉิน(sensitive)·ยานพาหนะ | ✓ | 2 (`returning_tenant` ใหม่ + gold) | **0** (§10: "—") | 1 |
| b2b | documents | **6**: บริษัท/เลขภาษี·ผู้ติดต่อหลายคน(LONG_TEXT)·วงเงินเครดิต(MONEY sensitive)·เงื่อนไขชำระ(SELECT)·พนักงานขาย(LOOKUP EMPLOYEE)·ประเภทธุรกิจ | ✓ | **3** (`bronze/silver/gold_dealer` ใหม่ทั้งหมด) | **0** (§10: "—") | **2** |
| general (ไม่แก้ ล็อกจาก M1.2) | preferences | 4 | — | 4 มาตรฐาน | 1 | 6 |

**หมายเหตุการตัดสินใจ**:
- **ระดับที่ reuse `gold`/`silver`/`platinum`** = กรณีที่ §10 เขียนชื่อระดับตรงตัว ("Gold: ...", "Platinum: ...") — ใช้รหัสมาตรฐานเดียวกับที่ทุกร้านมีอยู่แล้วจริง ๆ (`member-backfill-tiers.mts`) ไม่ใช่การย่อประหยัดงบ
- **ระดับที่สร้างใหม่เฉพาะกิจการ** (`family` ×2 ที่ dental/tutoring — คนละความหมายคนละไฟล์ ไม่ชนกันเพราะข้อสอบทดสอบแยกทีละชุด · `paid_plan` fitness · `annual_plan` sportsclub · `returning_tenant` realestate · `bronze_dealer`/`silver_dealer`/`gold_dealer` b2b) = กรณีที่ §10 บรรยายแนวคิดระดับที่ไม่ใช่บันไดมาตรฐาน (แผนสมาชิกรายเดือน/ปี, ผู้เช่าเก่า, ดีลเลอร์ 3 ขั้น) — ตั้งชื่อ/ป้ายเฉพาะกิจการนั้นจริง ไม่ทับกับระดับทั่วไป
- **ฟิลด์ที่ reuse ข้ามกิจการ** มีเฉพาะ 2 ตัวที่ถาวรจริง (`conditions`/`emergencyContact` — สร้างจาก seed M1.2 ไม่เคยถูกลบ) และใช้เฉพาะที่ความหมายตรงกันจริง (โรคประจำตัว/ผู้ติดต่อฉุกเฉิน) ตามที่ผู้คุมงานอนุญาต — ฟิลด์อื่นทั้งหมดของแต่ละกิจการเป็น **key เฉพาะกิจการนั้น ไม่ reuse ข้ามไฟล์**
- **`repair`** §10 ระบุไว้แค่ 3 ฟิลด์ (อุปกรณ์ · ประกันหมด · งานซ่อมล่าสุด) — เติม `deviceType` (ประเภทงานซ่อม: มือถือ/คอมพิวเตอร์/แอร์) เป็นฟิลด์ที่ 4 ให้ครบเกณฑ์ ≥4 ของข้อสอบ (สอดคล้องกับชื่อกิจการเอง)
- **journey ที่ทำได้ตาม §10 ตรงตัว**: ใช้ presetKey ของ M3.3 เมื่อ trigger/action ตรงกัน (review/at_risk/inactive/birthday/new_member) หรือ **นิยามเอง** ผ่าน `trigger: { event: "member.inactive", params: { days } }` เมื่อ §10 ระบุจำนวนวันตรงตัว (เช่น restaurant 45 วัน · fitness 14 วัน · salon 35 วัน · hotel 365 วัน · b2b 30 วัน) — ได้ค่าตรงเป๊ะไม่ใช่ค่า default ของ preset (60 วัน)
- **journey บางรายการใน §10 ยังทำไม่ได้ 100%** เพราะทะเบียน `JOURNEY_TRIGGERS` ของ M3.3 ยังไม่มี trigger รอบเวลาที่อ่านจาก**ฟิลด์กำหนดเอง** (เช่น ประกันหมดอายุ/สัญญาหมด/พาสปอร์ตหมด/วัคซีนสัตว์/แพ็กเกจหมด) — รองรับแค่ birthday (`Customer.birthDate`)/inactive/tier review ตามที่ M3.3 ออกแบบไว้ · จดไว้ในคอมเมนต์ของแต่ละไฟล์เทมเพลตที่เกี่ยวข้อง ไม่ fabricate trigger ใหม่นอกสัญญา (นอกขอบเขตไฟล์ M3.9)

---

## 4. ข้อตัดสินของ builder (จุดที่สัญญาไม่ชัด — พร้อมเหตุผล)

1. **`fields.ts#applyTemplate` ขยายคืนค่า `created: {sectionIds, fieldIds}`** — จำเป็นเพื่อให้ `templates-service.ts` ประกอบ `created` รวมกับ tiers/stamps/journeys ได้ครบ · ผู้เรียกเดิมอ่านแค่ `.added` ไม่กระทบ (ยืนยัน `qc-member-m1.2` 27/27)
2. **`previewTemplate` เทียบ "ฟิลด์มีอยู่แล้วไหม" ด้วย key แบบรวมทั้งระบบ ไม่ผูกกับ section** — ตรงกับพฤติกรรมจริงของ `fields.ts#applyTemplate` (เช็ก `fieldKeys` เป็น flat set ข้ามทุกส่วน)
3. **testid ของเช็กบ็อกซ์ 4 ส่วน (`template-part-fields/tiers/stamps/journeys`) เขียนเป็นสตริงตรงตัวในโค้ด** ไม่ใช่ template literal ต่อ key แบบไดนามิก — ข้อสอบ grep หาข้อความตรงตัวในซอร์ส
4. **`applyTemplate` ระดับบนต้องมี `actor` เมื่อ `parts` มี tiers/stamps/journeys และ actor ต้องผ่าน `canManageSettings`** — ส่วน "fields" อย่างเดียวไม่บังคับ actor (ตรงรูปแบบเดิม M1.2)
5. **rule/benefits ของระดับ apply เฉพาะตอน "สร้างใหม่จริง" เท่านั้น** — ระดับที่ reuse ของเดิม (gold/silver/platinum/member) ไม่ถูกแก้ rule/benefits แม้เทมเพลตประกาศไว้ (สอดคล้อง "ไม่ทับของเดิม")
6. **benefit ชนิด `FREE_SERVICE`/`EXCLUSIVE_ITEMS` ไม่ตั้งค่าจริงในเทมเพลต** (carcare Gold "ล้างรถฟรีเดือนละครั้ง") — ทั้งสองชนิดต้องมี `itemIds` จริงของร้าน (สินค้า/บริการ) ซึ่งเทมเพลตไม่รู้จักล่วงหน้า (แต่ละร้านมีแคตตาล็อกต่างกัน) ⇒ ใส่คำอธิบายไว้ในข้อความ `description` ให้เจ้าของไปตั้งเองที่หน้าตั้งค่าระดับ (M1.10) แทนการยัด itemIds มั่ว
7. **stamps ที่ apply สร้างมาแบบ `active` ปริยาย** — `createCard` ของ M2.3 ไม่มีพารามิเตอร์ `active` ให้ตั้งตอนสร้าง (ปริยาย `true` เสมอ) เจ้าของร้านปิดเองได้ที่หน้า `/member/stamps`
8. **general.journeys ทั้ง 6 เส้นใช้ `enabled: false` เสมอ** — สัญญา S3.2 บังคับ `journeys` ที่มาจาก apply เทมเพลตต้อง `enabled === false` เสมอ
9. **b2b ใช้รหัสระดับเฉพาะ `bronze_dealer`/`silver_dealer`/`gold_dealer`** แทนการ reuse `gold`/`silver` มาตรฐาน — เพราะ §10 ต้องการป้าย/สิทธิประโยชน์ "ดีลเลอร์" ที่ต่างจากระดับสมาชิกทั่วไป (ราคาขั้น B2B ไม่ใช่ส่วนลดผู้บริโภคทั่วไป) ถ้า reuse `gold`/`silver` (ซึ่งมีอยู่แล้วถาวรทุกระบบ) จะโดนข้าม (exists=true) ไม่ได้ตั้งค่า rule/benefits ของดีลเลอร์เลย

---

## 5. หนี้ / เรื่องที่ผู้คุมงานควรรู้

1. **REST op ของ templates-service (`applyTemplate` แบบมี parts/tiers/stamps/journeys) ยังไม่มี** — REST op เดิม (M1.11 `/fields/templates/{key}/apply`) ยังผูกกับ `fields.applyTemplate` ตัวเดิม (fields อย่างเดียว) — ถ้า M3.10 ต้องการ endpoint เต็มรูป ให้ผูกกับ `templates-service` ที่เปิดผ่าน facade แล้ว (`applyMemberTemplate`)
2. **journey บางรายการใน §10 ยังไม่มี trigger รอบเวลาตามฟิลด์กำหนดเอง** (ประกัน/สัญญา/พาสปอร์ต/วัคซีน/แพ็กเกจหมดอายุ) — ต้องเพิ่ม trigger ประเภท "ฟิลด์กำหนดเองถึงวันที่ X" ในทะเบียน `JOURNEY_TRIGGERS` (M3.3) ก่อนจึงจะทำได้ครบ 100% (นอกขอบเขตไฟล์ที่ M3.9 แตะได้)
3. **ตัวอย่างมือถือ (`field-preview-mobile`) แสดง "ฟิลด์ของเทมเพลตที่เลือก" เมื่อมี preview โหลดอยู่** (แทนที่ฟิลด์จริงของร้าน) — เจตนาตามภาพ 03 ที่ต้องโชว์ "ตัวอย่างก่อน apply" ยังไม่มีปุ่มสลับกลับไปดูของจริงระหว่างเลือกเทมเพลตค้างอยู่ (หนี้ UX เล็ก)
4. **`qc-member-m1.9` ยังตก S1.1 อยู่ 1 ข้อ (memberCount 30/15/10/5 → 29/16/10/5)** — ตรวจแล้วไม่เกี่ยวกับไฟล์ของ M3.9 (โค้ดของใบนี้ไม่แตะ `Customer.tierDefId` เลย) ผู้คุมงานรับทราบแล้วว่าเป็นผลจากงานคู่ขนานของ builder อื่น (M3.4/M3.5/M3.6) และจะจัดการเอง — ไม่ใช่งานของ M3.9

---

## 6. ข้อมูลสำหรับถ่ายภาพ (ภาพ 03 kbar เทมเพลต)

- หน้า `/app/sys/{id}/member/settings/fields` — เลือก dropdown `field-template-select` เป็น **"คลินิก / ความงาม"** (`clinic`) ตามที่สเปคภาพระบุ
- คาดหวังเห็น: แผงตัวอย่าง (`template-preview`) ใต้แถวเทมเพลต — หัวชื่อ "คลินิก / ความงาม" · แถวนับ (`template-preview-counts`): ส่วน 1 (ใหม่ 0 หรือ 1 แล้วแต่ว่าเคย apply เทมเพลตอื่นที่ใช้ส่วน "health" มาก่อนหรือยัง) · ฟิลด์ 8 (ใหม่ 6–8) · ระดับ 2 · สแตมป์ 1 (ใหม่ 1) · journey 1 (ใหม่ 1) · เช็กบ็อกซ์ 4 อัน (ติ๊กครบเป็นค่าเริ่มต้น) · รายการฟิลด์ 8 แถว (กรุ๊ปเลือด/แพ้ยา/โรคประจำตัว/ยาประจำ/ผู้ติดต่อฉุกเฉิน/แพทย์ประจำ/คอร์สที่ซื้อ/ครั้งที่เหลือ)
- กดปุ่ม "ตัวอย่างมือถือ" (มุมขวาบน) → เปิดการ์ดลอย แสดงส่วน "สุขภาพ" พร้อม 8 ฟิลด์ของเทมเพลต clinic (ก่อน apply จริง)
- กด "ใช้เทมเพลต" (ConfirmDialog) → ยืนยัน → เห็น `template-apply-result`: "เพิ่มส่วน n · ฟิลด์ n · ระดับ n · สแตมป์ n · journey n"
- มือถือ (390px): แผง `template-preview` ต้องไม่ล้น (ใช้ `flex-wrap` + `min-w-0` + `truncate` ในรายการฟิลด์ไว้แล้ว)
- ไม่มีอีโมจิ/hex ใน `TemplatePreview.tsx`/ส่วนที่แก้ของ `FieldDesigner.tsx` (ตรวจแล้วผ่านตามข้อสอบ S4.1)

### ตรวจภาพ
_(ผู้คุมงาน Opus 5 · 11 ก.ย. ~11:00 UTC · build QC หลังรวมทั้งชุด 3.4/3.5/3.6/3.9 · เปิดดูทุกภาพเทียบ mockup ด้วยตาแล้ว)_
- **fields-template-owner desktop (ภาพ 03 kbar)**: ตรง — แถบบน "เทมเพลต: [คลินิก / ความงาม]" + ใช้เทมเพลต + ตัวอย่างมือถือ + บันทึก · แผงตัวอย่าง: ชื่อเทมเพลต · นับ ส่วน/ฟิลด์/ระดับ/สแตมป์/journey (ใหม่ n) · เช็กบ็อกซ์นำเข้า 4 ส่วน · รายการฟิลด์ 8 ตัวของคลินิกตาม §10 แถว 2 (กรุ๊ปเลือด · แพ้ยา · โรคประจำตัว · ยาประจำ · ผู้ติดต่อฉุกเฉิน · แพทย์ประจำ · คอร์สที่ซื้อ · ครั้งที่เหลือ) พร้อมป้าย ใหม่/มีแล้ว · ด้านล่างตัวออกแบบเดิม (palette 11 · ผืนฟอร์ม · แผงคุณสมบัติ · ฟิลด์ 33/60)
- ต่างจาก mockup (ยอมรับ): แผงตัวอย่างเทมเพลตแทรกเหนือผืนฟอร์ม (mockup 03 ไม่มีสถานะ "เลือกแล้วยังไม่ใช้" — เป็นส่วนเพิ่มตามสัญญา M3.9)
- **รอบแรกตีกลับ** (ไม่ใช่ภาพ — เนื้อหาเทมเพลต): ข้อสอบเดิม apply 16 ชุดสะสมจนชนเพดาน → ชุดละ ~3 ฟิลด์ ขัด §10 → แก้ข้อสอบให้ทดสอบทีละชุด + builder เขียน 15 ชุดใหม่ตาม §10 (สุ่มตรวจ clinic/restaurant/carcare ตรงแถว §10)
- **fields-template-owner mobile**: ไม่ล้น · แถบเทมเพลตขึ้นบรรทัด · แผงตัวอย่างเต็มกว้าง · palette เลื่อนแนวนอน (แบบ M1.3)
- **PARITY: ผ่าน**

---

## 7. regressions

| ชุด | ผล |
|---|---|
| `qc-member-m1.2` | 🟢 27/27 |
| `qc-member-m1.3` | 🟢 14/14 |
| `qc-member-m2.3` | 🟢 22/22 |
| `qc-member-m3.3` | 🟢 32/32 |
| `pnpm exec tsc --noEmit` | 🟢 exit 0 |
| `fitness.mts` (มี env) | 🟢 26/26 · CRITICAL 0 MAJOR 0 MINOR 0 |
| `fitness.mts` (`env -u DATABASE_URL -u DIRECT_URL`) | 🟢 26/26 |
| `qc-member-m1.9` | 🟡 25/26 (ตก S1.1 เดิม — ไม่เกี่ยวกับ M3.9 ดู §5 ข้อ 4 · ผู้คุมงานรับไปจัดการเอง) |
| grep purity `templates/*.ts` | 🟢 ไม่มี import `@/lib/core/db`/`prisma`/`@/lib/modules/*` (นอกกลุ่ม `member/templates`) |

ไม่ได้รัน: `next build/dev` · `git add/commit/push`

## 8. เวลาที่ใช้

รอบแรก ≈ 3 ชม. 30 นาที (ถูกตีกลับเพราะเทมเพลตย่อเกินเพดานเดิม) · รอบตีกลับ (เขียนเทมเพลต 15 ไฟล์ใหม่เต็มรูปตาม §10 + ตรวจ regressions ใหม่ทั้งชุด) ≈ 1 ชม. 40 นาที
