# C2.2 — Sequences
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C2.2". Spec: blueprint §5.7, §11.5, mockup 07 (bottom), decisions C16, C25.

## Deliverables
`sequences.ts`: CRUD (+ versioning: editing steps of a sequence with ACTIVE enrollments creates `version+1`; old enrollments finish on their version) · `enroll` (one ACTIVE per contact per sequence; CONFLICT with "replace" option; skips opted-out contacts) · `stop/pause/resume` · **`runDue(now)`** registered as a minute job (C0.5, every 5 min, ≤ 200 rows, loop until quiet ≤ 20 s): claim by LEASE (`leaseUntil = now+15m` conditional updateMany), execute the step through the shared action runner (EMAIL / LINE / TASK / WAIT / SMS if a provider exists), compute `nextAt` with business days (`settings.crm.businessDays`, `settings.crm.holidays`) and `sendWindow`, advance or finish; recover expired leases · auto-stop on 5 causes (reply, won, lost, opt-out, bounce) via consumers · per-step stats · holiday settings UI incl. "import Thai public holidays for year N" (static list in code) · editor UI `/settings/sequences/[id]`, enrollment list, enroll button on contact + bulk enroll.
Events `crm.sequence.enrolled/finished`.

## Acceptance (oracle `qc-crm-c2.2`)
CRM-RUN S1–S7 (28).
X3 two parallel enrolls of the same contact → one ACTIVE · X5 two overlapping `runDue` → each due step executed once (count fake sends); kill after claim → re-run after lease; never claims by writing a terminal state · X8 consent/opt-out/bounce checked WHEN THE STEP RUNS (withdraw between enroll and step → skipped + reason; never sent) · X9 bulk enroll = danger (confirm + reason, ≤ 500) · X1 enroll a contact the actor cannot see → 404.
Regressions: C2.1, C0.5, `qc-member-fix-s3`.

## Controller addendum (19 Sep · oracle `qc-crm-c2.2` 65 checks)
CONTRACT BLOCK in the oracle header is binding. Rulings: `stopFor(ctx{tenantId, systemId?}, contactId, reason)` (tenant-scoped — overrides RESOLUTIONS' short form) and `runDue(now, {tenantIds?})` accepted · step semantics as the oracle states (stepIndex = next step · WAIT advances and pushes nextAt · non-WAIT sets nextAt = now) · a PAUSED enrollment also blocks a new enroll (CONFLICT, `replace` allowed) — service rule, DB unique stays on ACTIVE · S7.3 using the real `runMinuteJobs` on QC is accepted (outbound stubbed) · the builder adds the `"2.2"` spec to `scripts/visual-crm.mts` (owned) · S6 static only. Permanent rule: uiVersion-1 cases (S9). Builder starts after C2.0 (tables) is accepted.

## Controller ruling (24 ก.ย. 2569 · Opus 5 · binding — หลังผู้ตรวจอิสระ)
ผู้ตรวจ: **ไม่มี BLOCKER** (ร้าน v1 ไม่กระทบ · lease/crash/versioning ถูก · Thai time ถูก · ยินยอมตรวจตอนขั้นทำงาน · payload ไม่มี PII) · **SHOULD-FIX 8 ข้อ + NOTE 4 ข้อ → builder แก้ครบ พร้อมหลักฐาน "ทำบั๊กเดิมให้เกิดซ้ำแล้วแสดงว่าหายไป"**
1. **สะพาน `crm-bridges/sequences.ts` ต้องมีประตู** (`uiVersion`/`bridgesEnabled`) — **ไม่อนุมัติข้อยกเว้นตัวที่สาม** ของกฎ "ประตูมาก่อนเสมอ" ใน `crm-bridges/core.ts` · R-E.14 **ไม่ถูกแก้**: ร้านที่สลับกลับเป็น v1 ต้องเก็บแถวไว้และเดินต่อเมื่อกลับเป็น 2 · หลักฐาน: ร้าน v1 + `crm.deal.lost` ⇒ แถวยัง ACTIVE · 0 event (เดิม STOPPED/LOST ถาวร + ยิง webhook) · ตัวคุมบวก: เปิดประตูแล้ว event เดียวกันหยุดจริง
2. **`active:false` = "ปิดรับคนใหม่" เท่านั้น** (ทางเลือก ก) คนที่อยู่ในลำดับแล้วเดินต่อ · ป้ายบนจอเปลี่ยนเป็น "เปิดรับคนใหม่" ให้ตรงกับที่เครื่องยนต์ทำ (ป้ายเดิมสัญญาอย่างหนึ่งแต่เครื่องยนต์ทำอีกอย่าง = ผู้ใช้ถูกหลอก)
3. แก้ชื่อลำดับ/ติ๊กตัวเลือก **ห้ามเด้งเวอร์ชัน** · หน้าสถิติต้องบอกตรง ๆ เมื่อมีคนเดินอยู่บนเวอร์ชันอื่น
4. `ACTIVE→STOPPED` ที่เครื่องยนต์ทำเอง (`OPT_OUT` · `CONTACT_GONE`) ต้องมี `AuditLog` ใน tx เดียวกัน — "ทำไมลำดับของลูกค้าคนนี้หยุด" ต้องตอบได้จากสมุดตรวจ ไม่ใช่จาก event เท่านั้น
5. เพดาน `maxActive` ต้องให้ **ฐานข้อมูลตัดสินในคำสั่งเดียว** + advisory lock ปิดช่อง READ COMMITTED · หลักฐาน: อัลกอริทึมเดิมยิง 10 ทาง/เพดาน 3 ⇒ 3 (ของใหม่) เทียบ 10 (ของเดิม รันซ้ำให้ดู)
6. งานรายนาทีต้องลงทะเบียนแบบเดียวกับ C2.1 (eager ใน `platform/minute-jobs.ts`) ไม่ใช่ผลข้างเคียงของลำดับการ import — เดิม process เย็นไม่เห็นงานเลย
7. `stopFor` รับได้เฉพาะรหัสปิด 8 ตัวที่มีในเอกสาร · **`FAILED` เป็นสถานะที่เครื่องยนต์ไปถึงเองจากตัวนับความพยายาม และ `stopFor` ต้องปฏิเสธมันต่อไป** (ผู้เรียกจากใบอื่นห้าม assert สถานะนี้ได้ · และห้ามให้ dead letter แอบใช้ `MANUAL` — ร้านจะอ่านว่า "หยุดเอง" ทั้งที่ขั้นนั้นล้ม 5 ครั้ง)
8. `archiveSequence` ต้องปักธง `archivedAt` ก่อนแล้วค่อยหยุดทีละ ≤500 + ทำซ้ำได้ (timeout ห้ามทิ้งลำดับที่ยังรับคนใหม่อยู่)

## Controller ruling round 2 (24 ก.ย. 2569 · Fable 5.1 · binding — หลังผู้ตรวจยืนยันของผู้คุมงาน)
ผู้ตรวจยืนยัน (อ่านทุกไฟล์ใน diff 32 ไฟล์): **8 ข้อรอบแรกแก้จริงทั้งหมด** (มี file:line ทุกข้อ) · ไม่มี BLOCKER · ร้าน v1 ไม่กระทบ (ลิ้นชักเมนูอยู่ในบล็อก v2 · หน้า contacts คืน v1 ก่อนเรียก sequenceOptions · `runDue` เห็นเฉพาะระบบ uiVersion 2) · scoping/lease/consent/outbox/testid/holiday ตรวจแล้วสะอาด
### ต้องแก้ก่อนรับงาน (builder รอบ 2 ใน `shark-crm-c20` · QC2 · หลักฐาน before/after ที่ `.qc-shots/c22-r2/`)
1. **S1 · `archiveSequence` หยุดได้ ≤500 แล้วคืน `remaining` แต่หน้าแก้ไข 404 ทันที (loadSequence กรอง archivedAt)** ⇒ ลำดับที่มี >500 คนเดิน = ที่เหลือ ACTIVE ตลอดกาลและ `runDue` ข้าม (ซอมบี้) · **แก้: วนแบตช์ ≤500 ในฟังก์ชันเดียวจน remaining=0 หรือครบ deadline ~20 วิ** + หน้าลำดับที่เก็บแล้วต้องโหลดได้แบบอ่านอย่างเดียว (ปุ่ม "ทำการเก็บต่อ") · กดซ้ำห้ามเขียน audit ซ้ำเมื่อไม่มีอะไรเปลี่ยน (N4)
2. **S2 · ป้าย "มีคนเดินอยู่บนเวอร์ชันอื่น" + สถิติต่อเวอร์ชันคำนวณจากหน้า `listEnrollments` 500 แถว** ⇒ เกิน 500 คน ป้ายหายและตัวเลขอ่าน 0 = หน้าจอโกหกร้าน (สิ่งที่มติข้อ 3 รอบแรกตั้งใจกัน) · แก้: `groupBy(sequenceVersion,status)` ใต้ visibility เดิม
3. **S3 · `bulkEnroll` เขียน audit แถวเดียวหลังลูป นอก tx** ⇒ ล้มที่คนที่ 300 = 300 การลงทะเบียน+event ไม่มี audit และเหตุผลที่ผู้ใช้พิมพ์หาย · แก้: audit `crm.sequence.bulk_enroll` (เหตุผล+รายชื่อ id) **ก่อน**ลูป + แถวสรุปหลังลูป
4. **N6 · service รับ `crm.settings.manage` เป็นทางเลือกของ `crm.sequence.manage` แต่ทุกทางเข้าบังคับ `crm.sequence.manage` เท่านั้น** · แก้: service ใช้ `crm.sequence.manage` อย่างเดียว
### ORACLE-EDIT (ผู้เขียนข้อสอบ opus · เฉพาะ `scripts/qc-crm-c2.2.mts`)
- X3 เพดาน `maxActive` ยิง 10 ทางพร้อมกัน ×3 รอบ ⇒ 3 ACTIVE + 7 CONFLICT (มติข้อ 5 รอบแรก **ไม่มีข้อสอบข้อไหนคุมเลย**) · เก็บลำดับ 600 คนจบในครั้งเดียว + โหลดหน้าได้ + กดซ้ำไม่ audit ซ้ำ · ประตูสะพาน v1 (`crm.deal.lost` ไม่หยุด · 0 event) กับตัวคุมบวก v2 (หยุด LOST + 1 event) · audit ครบ: auto_stop ต่อ OPT_OUT/CONTACT_GONE/FAILED และ bulk_enroll มีแม้ล้มกลางทาง
### หนี้ (บันทึก · ไม่บล็อกใบนี้)
- **N1 ส่งซ้ำเมื่อตายหลัง provider รับแล้วก่อน `advance` commit** (เฉพาะขั้นที่ไม่ใช่ TASK) → C2.5 ส่ง idempotency key ต่อ (enrollment,version,index) เป็น `Message-ID` · X5.4 ฆ่าใน sender จึงมองไม่เห็น
- **N2 ขั้นส่งล้มแบบชั่วคราว (LINE/อีเมล 500) ไม่ retry — ข้ามขั้นถาวร** (ตรงสัญญา แต่เป็นความเสี่ยงผลิตภัณฑ์) → C2.5 นโยบาย retry ของ transport
- **N5 ข้อความ error ของ sender ลง `stats.log[].reason` โดยไม่ scrub** — วันนี้ sender คืนสตริงไทยกลาง ๆ · C2.5 transport ต้องห้าม echo ผู้รับ + X8 ต้องสแกน `stats` ด้วย
- N3 สะพานอ่าน `crmDeal` ก่อนเช็คประตู (ค่าใช้จ่าย 1 query/เหตุการณ์บนร้าน v1 — ไม่ผิดความหมาย) · N7 `import "./sequences-job"` ใน sequences.ts เป็นเศษของทางเก่าแต่ทำให้ S7.1 เขียว **ห้ามลบ** · N8 version bump นับทุกสถานะ (แข็งกว่าสัญญา · ห้าม "แก้" เป็น ACTIVE) · N9 `clampIntoWindow` ยอมแพ้ที่ 400 รอบ (ปัจจุบันไปไม่ถึงเพราะ parseCalendar การันตีวันทำการ ≥1)

## Controller ruling round 3 — PARITY (24 ก.ย. 2569 · Fable · binding)
ผู้คุมงานถ่ายภาพแบบมีข้อมูล (visual spec "2.2" สร้างลำดับ "ติดตามใบเสนอราคา" 5 ขั้น + ลงทะเบียน 4 คน ชั่วคราวแล้วคืนสภาพ) แล้วเทียบ mockup 07 ล่างด้วยตา:
- **ตีกลับ**: หน้าแก้ไขลำดับเป็นฟอร์มแก้ขั้นแนวตั้ง 5 ฟอร์มยาว ไม่มี "แถวการ์ดขั้นแนวนอน + ตัวเลขต่อขั้น (34 ส่งแล้ว · 22 ยังไม่ตอบ …)" และตารางผู้ลงทะเบียนไม่มีคอลัมน์ ผู้ติดต่อ/บริษัท/ขั้นปัจจุบัน/เข้าเมื่อ ตามแบบ · แก้: เพิ่มแถบภาพรวมอ่านอย่างเดียวตามแบบไว้บนสุด (เลื่อนแนวนอนที่ 390 · ห้าม min-w ไม่มี prefix) + ตารางผู้ลงทะเบียนตามแบบ (คง พักไว้/หยุด เป็นคอลัมน์ท้าย) + ฟอร์มแก้ขั้นเดิมพับไว้ใต้ปุ่ม "แก้ไขขั้น" (testid เดิมทั้งหมดคงอยู่)
- ผ่าน: รายการลำดับ · ฟอร์มสร้าง · วันทำการ/วันหยุด · ลงทะเบียนเป็นชุด · บล็อกบน contact 360 — โครง/ปุ่มครบ ต่างแค่ข้อมูลตัวอย่าง
