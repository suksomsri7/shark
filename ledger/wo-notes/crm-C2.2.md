# WO C2.2 — ลำดับการติดตาม (Sequences)

> RUN "CRM v2" · worktree builder `/root/projects/shark-crm-c20` (QC2) · รวมเข้าทรีหลัก `/root/projects/shark-crm` branch `session/crm` · builder รอบ 1: 20–23 ก.ย. (opus · ผู้ตรวจอิสระ 1 · SHOULD-FIX 8 แก้ครบ) · **รอบ 2: 24 ก.ย. (opus · ผู้ตรวจของผู้คุมงาน + regression ที่ไม่เคยรัน → แก้ 7 ข้อ)** · ผู้คุมงาน **Fable 5.1** · รับงาน 24 ก.ย. 2569
> สัญญา: `ledger/CRM-RUN.md` §2 C2.2 · ใบสั่ง `ledger/crm-briefs/crm-brief-C2.2.md` (addendum 19 ก.ย. + ruling 24 ก.ย. รอบ 1 + **ruling round 2**) · พิมพ์เขียว §5.7 §11.5 · มติ C16 C25 · ภาพ `07-automation-sequence.png` (ล่าง)
> ข้อสอบ: `scripts/qc-crm-c2.2.mts` (**73 ข้อ** = 65 เดิม + ORACLE-EDIT 8 ข้อ 24 ก.ย. · S1–S10 43 · X1 4 · X3 4 · X4 2 · X5 4 · X6 2 · X8 7 · X9 6 · FATAL/CLEAN) · แก้หลัง commit: **ใช่ — เพิ่ม 8 ข้อ (ดู §7)**

## 1. ไฟล์ที่แตะ (33 ไฟล์ · +4,077/−8)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/crm/sequences.ts` (1,481) · `sequences-shared.ts` · `sequences-job.ts` (shim) | ใหม่ | CRUD + versioning (แก้ขั้นขณะมีคนเดิน = version+1 · เปลี่ยนชื่อ/ติ๊กไม่เด้งเวอร์ชัน) · `enroll` (1 ACTIVE/คน/ลำดับ · CONFLICT+replace · PAUSED ก็กัน · ข้ามคน opt-out) · **เพดาน `maxActive` ตัดสินใน SQL คำสั่งเดียว + advisory lock** · `bulkEnroll` ≤500 + confirm/reason + audit ก่อนลูป · `stop/pause/resume` · `stopFor` รับเฉพาะรหัสปิด 8 ตัว (FAILED = เครื่องยนต์ไปถึงเอง) · `runDue` งานรายนาที (lease 15 นาที · ≤200 แถว · วนจนเงียบ · กู้ lease หมดอายุ · วันทำการ/วันหยุด/sendWindow เวลาไทย) · auto-stop 5 เหตุ + `AuditLog auto_stop` ใน tx เดียว · `failAttempt` 5 ครั้ง → FAILED · `archiveSequence` ปักธงก่อนแล้ววนแบตช์ ≤500 จนจบ (deadline 20 วิ · ไม่ audit ซ้ำ) · `versionCounts` groupBy · ปฏิทิน (businessDays/holidays/นำเข้าวันหยุดไทยจากรายการในโค้ด) |
| `src/lib/platform/crm-bridges/sequences.ts` | ใหม่ | ตัวรับ `crm.deal.won/lost` · `crm.contact.updated`(opt-out) → `stopFor` · **ประตู `bridgeOpen(crmGate(ระบบของแถว))` ในตัว handler ทุกตัว** (R-E.14: ร้าน v1 ไม่หยุด ไม่ยิง event) |
| `src/lib/platform/minute-jobs.ts` · `crm-bridges/index.ts` · `outbox-consumers.ts` · `webhooks/labels.ts` · `crm/automation.ts` · `activities.ts` · `settings.ts` (บล็อก C2.2) · `crm/index.ts` · `nav.ts` | แก้ | งาน `crm.sequences` ทุก 5 นาที (eager) · consumer 3 ตัวเป็น "ของแถม" ใต้ compose · event `crm.sequence.enrolled/finished` (ทะเบียนเดียว payload = id) · กิจกรรม TASK จากขั้น (idempotent `sourceRef`) · ตัวเขียน settings คำสั่งเดียว 3 ตัว |
| `src/app/app/sys/[id]/crm/settings/sequences/{page,[sequenceId]/page,actions}.tsx` · `settings/holidays/page.tsx` · `src/components/crm/sequences/*` (7) · `contacts/page.tsx` · `contacts/[contactId]/page.tsx` · `layout.tsx` | ใหม่/แก้ | รายการ+ตัวแก้ไข (ป้าย "เปิดรับคนใหม่" ตรงกับเครื่องยนต์ · แบนเนอร์ "มีคนเดินอยู่บนเวอร์ชันอื่น" จาก groupBy · หน้าลำดับที่เก็บแล้วอ่านอย่างเดียว + "ทำการเก็บต่อ") · ลงทะเบียน/ลงทะเบียนเป็นชุด · วันทำการ/วันหยุด · ปุ่มบน contact 360 · ลิ้นชักเมนู (ในบล็อก v2 เท่านั้น) |
| `scripts/crm-ui-inventory.json` (+87 แถว) · `visual-crm.mts` (spec "2.2") · `crm-cron.mts` · `gen-crm-api-docs.mts` · `docs/api/CRM-API.md` | แก้ | ทะเบียน testid · ภาพ · ตัวรัน cron · เอกสาร |

## 2. migration / seed / backfill
- ไม่มี (ตาราง `CrmSequence/Step/Enrollment` มาจาก C2.0) · seed ไม่เปลี่ยน · ไม่มี backfill

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด · เคยแดง | ✅ | ข้อสอบ commit 19 ก.ย. · ORACLE-EDIT 24 ก.ย. เคยแดง 72/73 (X9.5 = บั๊กจริง) |
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ✅ | `c22c23-verify2.log`: `qc-crm-c2.2` **73/73** (รอบ 3) · รอบ 2 ก็ 73/73 |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ✅ | §5 — 17 ชุดเขียว รวม `qc-crm-c1.11` **66/66** (จับ regression 2 ข้อของรอบแรก แก้แล้ว) |
| D5 | typecheck · fitness ×2 | ✅ | typecheck exit 0 · fitness 32/32 · noenv 32/32 |
| D6 | build | ✅ | BUILD+serve exit 0 · shots ออกครบ |
| D7 | ภาพ + PARITY | ✅ | §6 (Fable ดูเอง) |
| D8 | testid + ทะเบียน | ✅ | +87 แถว · ผู้ตรวจนับ: id ใน `.map` ทุกตัวมี discriminator · F14.1/F14.2 |
| D9 | ผู้ตรวจอิสระ | ✅ | รอบ 1 (opus 23 ก.ย.): ไม่มี BLOCKER · SHOULD-FIX 8 → แก้ครบ · **รอบ 2 (opus 24 ก.ย. อ่านอย่างเดียว): ยืนยัน 8 ข้อแก้จริง file:line · ไม่มี BLOCKER · SHOULD-FIX 3 + NOTE 9** → แก้ครบ (§7) |
| D10 | เอกสาร/ทะเบียน | ✅ | event 2 ตัวใน `webhooks/labels.ts` เท่านั้น + consumer + emit ใน tx · docs regen |
| D11 | wo-notes + คืนสภาพ | ✅ | `qc-member-m1.9` 26/26 หลังทั้งชุด |
| D12 | push → deploy | ⏳ | รอเจ้าของ push (session นี้ push ไม่ได้) |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 ขอบเขต | ใช้ | `X1.1–X1.4` (ลงทะเบียนคนที่มองไม่เห็น = 404 · ระบบ/ร้านอื่น) |
| X2 API/AI | N-A | REST/AI ของลำดับ → C2.11 |
| X3 ยิงพร้อมกัน | ใช้ | `X3.1–X3.4` (ลงทะเบียนคนเดียวกัน 2 ทาง = 1 ACTIVE · **เพดาน maxActive 10 ทาง = 3+7 CONFLICT**) |
| X4 ส่งซ้ำ | ใช้ | `X4.1–X4.2` |
| X5 จองแถวตามเวลา | ใช้ | `X5.1–X5.4` (`runDue` ซ้อน = ทำครั้งเดียว · ตายหลังจอง → ทำใหม่หลัง lease · ไม่จองด้วยสถานะปลายทาง) |
| X6 ข้อมูลเข้าอันตราย | ใช้ | `X6.1–X6.2` |
| X7 endpoint สาธารณะ | N-A | ไม่มี |
| X8 PDPA | ใช้ | `X8.1–X8.7` (consent ตอนขั้นทำงาน · ถอนระหว่างทาง = SKIPPED · payload ไม่มี PII) |
| X9 การกระทำอันตราย | ใช้ | `X9.1–X9.6` (bulk confirm+reason ≤500 · audit ทุก mutation · **auto_stop ใน tx เดียว (xmin) · bulk_enroll ก่อนลูป**) |
| X10 ความลับ/ไฟล์ | N-A | ไม่มี |
| ร้าน uiVersion 1 | ใช้ | `S9.1–S9.6` (runDue ข้าม · แถวเก็บไว้ · กลับเป็น 2 เดินต่อ · **ประตูสะพาน v1 ไม่หยุด/0 event · v2 หยุด+1 event**) |

## 5. ผลข้อสอบ (unit **`crm-c22c23-verify2`** = รอบสุดท้ายหลัง C2.2 r3 + C2.3 r3 · QC1 seed ใหม่ · 24 ก.ย. 04:10–05:25 UTC · ALLDONE · 0 ❌)
- `migrate diff (must be empty)`: exit=0 · `-`
- `reseed member`: exit=0 · `-`
- `qc-member-m1.1`: exit=0 · `{"total":28,"passed":28,"findings":[]}`
- `seed crm #1`: exit=0 · `-`
- `seed crm #2`: exit=0 · `-`
- `DRAIN`: exit=0 · `{"total":4,"passed":4,"findings":[]}`
- `qc-crm-c2.2`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-c2.3`: exit=0 · `{"total":80,"passed":80,"findings":[]}`
- `qc-crm-c2.1`: exit=0 · `{"total":84,"passed":84,"findings":[]}`
- `qc-crm-c0.5`: exit=0 · `{"total":50,"passed":50,"findings":[],"unproven":[],"info":{"leaseStyle":"row lease (re-ru`
- `qc-member-fix-s3`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `qc-automation`: exit=0 · `{"total":13,"passed":13,"findings":[]}`
- `qc-crm-c1.4`: exit=0 · `{"total":110,"passed":110,"findings":[]}`
- `qc-crm-c1.6`: exit=0 · `{"total":79,"passed":79,"findings":[],"skippedChecks":[]}`
- `qc-crm-c1.7`: exit=0 · `{"total":57,"passed":57,"findings":[]}`
- `qc-crm-c1.8`: exit=0 · `{"total":81,"passed":81,"findings":[]}`
- `qc-crm-c1.11`: exit=0 · `{"total":66,"passed":66,"findings":[]}`
- `qc-crm-c2.0`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-v1`: exit=0 · `{"total":17,"passed":17,"findings":[]}`
- `qc-crm-c0.2`: exit=0 · `{"total":27,"passed":27,"findings":[]}`
- `qc-hr-leave-booking`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `qc-form`: exit=0 · `{"total":10,"passed":10,"findings":[]}`
- `qc-forms-notify`: exit=0 · `-`
- `qc-nav-functions`: exit=0 · `-`
- `probe-uiversion-gate (no env)`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `typecheck`: exit=0 · `-`
- `fitness`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `fitness-noenv`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `BUILD+serve`: exit=0 · `-`
- `shots 2.2`: exit=0 · `{"wo":"2.2","user":"owner","shots":[".qc-shots/crm/2.2/crm-sequences-owner-desktop.png",".`
- `shots 2.3`: exit=0 · `{"wo":"2.3","user":"owner","shots":[".qc-shots/crm/2.3/crm-assignment-owner-desktop.png","`
- `serve stop`: exit=0 · `-`
- `qc-member-m1.9`: exit=0 · `{"total":26,"passed":26,"findings":[]}`

(รอบก่อน `crm-c22c23-verify` 02:52 UTC: c2.2 73/73 · c2.3 74/74 · ถอยหลังชุดเดียวกันเขียวหมด)
## 6. ภาพ (D7)
visual spec "2.2" (ขยาย 24 ก.ย.: สร้างลำดับ "ติดตามใบเสนอราคา" 5 ขั้น + ลงทะเบียน 4 คน ชั่วคราวผ่าน facade แล้วคืนสภาพ นับแถว 0→0) · owner
| หน้า | mockup | ภาพจริง | จอ | overflow | จุดต่างที่เห็นเอง |
|---|---|---|---|---|---|
| หน้าแก้ไขลำดับ: ตั้งค่า + **ภาพรวมลำดับ (การ์ดต่อขั้น + ลูกศร + ตัวเลข)** + สถิติต่อขั้น + **ลงทะเบียนอยู่ (ผู้ติดต่อ/บริษัท/ขั้นปัจจุบัน/เข้าเมื่อ/จัดการ)** + เก็บลำดับ | 07 ล่าง | `.qc-shots/crm/2.2/crm-sequence-editor-owner-{desktop,mobile}.png` | 1440/390 | ไม่มี (มือถือ: การ์ดซ้อนแนวตั้งด้วย ↓) | รอบแรกตีกลับ (ไม่มีภาพรวม) · รอบ 3 ตรงแบบ · ACCEPTANCE-FIX ผู้คุมงาน 1 class: การ์ดยืดพอดี 5 ใบที่ 1440 (เดิม 210px คงที่ เห็น 4 ใบ ใบที่ 5 ต้องเลื่อน) · ตัวเลขต่อขั้นเป็น 0/4 เพราะไม่ได้รัน `runDue` บนข้อมูลตัวอย่าง (ตั้งใจ ไม่ส่งจริง) |
| รายการลำดับ (ชื่อ · 5 ขั้น · เวอร์ชัน · กำลังเดิน 4) | 07 ล่าง (หัวการ์ด) | `crm-sequences-owner-*` | 1440/390 | ไม่มี | — |
| ฟอร์มสร้างลำดับ · วันทำการ/วันหยุด (+นำเข้าวันหยุดไทยปี N) · ลงทะเบียนเป็นชุด (ยืนยัน+เหตุผล) · บล็อกบน contact 360 | — (ไม่มีใน mockup · ตาม brief) | `crm-sequences-new-*` · `crm-sequences-holidays-*` · `crm-contacts-bulk-enroll-*` · `crm-contact-360-sequences-*` | 1440/390 | ไม่มี | — |
- `PARITY: ผ่าน` (Fable 24 ก.ย. หลังรอบ 3 + ACCEPTANCE-FIX)

## 7. ข้อแย้ง / มติ
- **มติรอบ 1 (24 ก.ย. Opus)** 8 ข้อ — ประตูสะพาน · `active:false` = ปิดรับคนใหม่ · ไม่เด้งเวอร์ชัน · audit auto-stop · เพดาน SQL คำสั่งเดียว · งานรายนาที eager · `stopFor` รหัสปิดปิด · archive ปักธงก่อน — **ผู้ตรวจรอบ 2 ยืนยันแก้จริงทุกข้อ**
- **มติรอบ 2 (24 ก.ย. Fable · ท้าย brief)**: S1 archive >500 = ซอมบี้ (หน้า 404) → วนแบตช์จนจบ (500 แถวทีละแถว 29 วิ → batch 600 แถว 1.3 วิ) + หน้าอ่านอย่างเดียว · S2 แบนเนอร์เวอร์ชันจากหน้า 500 แถว → groupBy · S3 audit bulk ก่อนลูป · N6 คีย์เดียว `crm.sequence.manage` · **+ regression จาก `qc-crm-c1.11` ที่ 2 รอบก่อนไม่เคยรัน**: `min-w-[520px]` ไม่มี prefix → `md:` · ประตูต้องเห็นในตัว handler ทุกตัว · **+ บั๊กจริงจากข้อสอบใหม่ `X9.5`: `MAX_STEP_ATTEMPTS` ไปไม่ถึง** — `jsonb_build_object($1, …)` พารามิเตอร์ไม่ระบุชนิด ⇒ Postgres 42P18 ทุกรอบ ถูก `.catch(() => false)` กลืน ⇒ ขั้นที่ล้ม retry ตลอดกาล → แก้ `${key}::text` + log ERROR แทนกลืน
- **ORACLE-EDIT 8 ข้อ (บันทึกใน CRM-RUN §4)**: X3.3/X3.4 · S10.1/S10.2 · S9.5/S9.6 · X9.5 (พิสูจน์ tx เดียวด้วย `xmin` — ผู้เขียนแก้จาก createdAt) · X9.6 (≥1 แถวก่อน event แรก)
- **รอบ 3 PARITY (Fable)**: หน้าแก้ไขลำดับตีกลับ (ไม่มีแถวการ์ดขั้น+ตัวเลข/ตารางผู้ลงทะเบียนตามแบบ) → เพิ่ม `crm-seq-overview` (การ์ดต่อขั้น + นับจาก `stats()` · เลื่อนแนวนอน · ไม่มี min-w ไม่มี prefix) · ตาราง ผู้ติดต่อ/บริษัท(`companyWhere`)/ขั้นปัจจุบัน/เข้าเมื่อ(`thaiAgoLabel` +07:00 คำนวณฝั่ง server) · ตัวแก้ไขขั้นพับใต้ `crm-seq-steps-toggle` · testid เดิมคงทั้งหมด · inventory +2
- `CRM_V2_SWITCH=all` ต้องตั้งตอนรัน `qc-crm-c1.11` (สคริปต์ตรวจตั้งให้แล้ว · builder บน QC2 เจอ 57/66 เพราะไม่ได้ตั้ง)

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ส่งซ้ำเมื่อตายหลัง provider รับแล้วก่อน `advance` commit (ขั้นที่ไม่ใช่ TASK) | ต้องมี idempotency key ฝั่ง transport | C2.5 (`Message-ID`) |
| ขั้นส่งล้มชั่วคราว (LINE/อีเมล 500) ไม่ retry — ข้ามขั้น | นโยบาย retry อยู่กับ transport | C2.5 |
| `stats.log[].reason` เก็บข้อความ error ของ sender ไม่ scrub | sender วันนี้คืนสตริงไทยกลาง ๆ | C2.5 + X8 สแกน stats |
| ปริมาณ: ฟอร์มยิงพร้อมกัน ~100 ใบ/ระบบ | advisory lock ต่อระบบ | C5 |
| N3 สะพานอ่าน crmDeal ก่อนเช็คประตู (1 query/เหตุการณ์บนร้าน v1) | ค่าใช้จ่าย ไม่ใช่ความหมาย | C5 |

## 9. คืนสภาพ QC
- ร้านชั่วคราว `qc-c22-*` ทั้งหมด · CLEAN · ผู้เขียนข้อสอบเพิ่ม cleanup `OpsEvent source='crm.sequences'` ที่ไม่มี tenantId · `qc-member-m1.9` 26/26 หลังทั้งชุด (verify2)
