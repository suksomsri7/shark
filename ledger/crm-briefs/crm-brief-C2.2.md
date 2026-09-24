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
