# WO C2.4 — Activity capture: บันทึกการโทร + AI · แชท → กิจกรรม · ปฏิทินรวมนัด · เตือนงาน

> RUN "CRM v2" · builder `/root/projects/shark-crm-c20` (QC2) · รวมทรีหลัก `session/crm` · builder รอบ 1: 24 ก.ย. 05:50–08:00 UTC (opus · 78/78) · ผู้ตรวจของผู้คุมงาน 08:35 · **รอบ 2: 08:25–09:30 (opus ตัวใหม่หลังโควตา · 91/91)** · ผู้คุมงาน **Fable 5.1** · รับงาน 24 ก.ย. 2569
> สัญญา: CRM-RUN §2 C2.4 · brief C2.4 (R1–R13 · R2 = `CRM_ASSIST` · ruling round 2) · พิมพ์เขียว §5.5 · มติ C5 · ภาพ 08 ซ้าย/ขวา · 13
> ข้อสอบ: `scripts/qc-crm-c2.4.mts` (**91 ข้อ** = 78 + ORACLE-EDIT 13 ข้อ 24 ก.ย. · S0 6 · S1–S8 38 · S9 10 · X1 5 · X2 3 · X3 2 · X4 3 · X5 1 · X6 4 · X8 6 · X9 2 · X10 3 · U 5 · F7/N16 · CLEAN) · แก้หลัง commit: **ใช่ (S2.3 CRM_ASSIST · S9.*/X8.6/N16/F7 · S7.6 เดินทั้ง page tree)**

## 1. ไฟล์ที่แตะ (38 ไฟล์ · +3,898/−48)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `crm/calls.ts` (~730) · `calls-shared.ts` · `calls-actions.ts` · `transcriber.ts` · `call-provider.ts` · `reminders.ts` | ใหม่ | logCall/attachRecording (1 ไฟล์/CALL · validate บริสุทธิ์ก่อนเขียน · ≤25 MB audio · PRIVATE) · getRecording (visibility ก่อน `privateFileUrl` 15 นาที) · removeRecording (danger) · purgeRecordings (730 วัน · ข้าม v1) · `CrmTranscriber` (ทะเบียนว่าง R-B · `costMicroUsd?`) · transcribeCall = advisory lock + claim WORKING (15 นาที · stale ปล่อย) → STT/AI นอก tx → proposal `crm.activity.ai_fill` · accept/reject (ปฏิเสธขณะ payload ว่าง · `pick()` ไม่ NULL ทับ) · ชาร์จครั้งเดียว `CRM_ASSIST` (STT+สรุป) · ลำดับปฏิเสธ v2→404→403→VALIDATION→AI_DISABLED→NOT_CONFIGURED→NO_CREDIT · scanBusinessCard (≤5 MB · data: URL · ไม่เก็บ) → `crm_create_lead` ของระบบนั้น · acceptLeadProposal (force · คืน PENDING เมื่อล้ม) · rejectLeadProposal (PII ไม่เหลือ) · `CrmCallProvider` mapper ล้วน · `remindDue` (ธง = OutboxEvent key ใน tx เดียวกับ AppNotification · anti-join แถวที่ปลูกธงแล้ว · วนจนเงียบ · push นอก tx ยิงครั้งเดียว · title/push ไม่มีชื่อกิจกรรม · body redact เบอร์/อีเมล) |
| `activities.ts` (บล็อก C2.4) · `activities-shared.ts` | แก้ | `createChatActivityOnce` (lock + existence tenant-wide) · `touchContactsFromChat` (GREATEST คำสั่งเดียว) · `calendar.appointments[]` จาก facade booking/clinic/school ตามช่วงเวลา (ไม่ใช่ 1,000 คนแรก · cap 3,000 + `appointmentsTruncated`) · API-key actor = `[]` · facade ล้ม = WARN · `hasRecording` |
| `crm-bridges/chat.ts` (บล็อก C2.4) | แก้ | RESOLVED → 1 CHAT activity (ระบบเปิดแรกที่มีผู้ติดต่อของ Party) + สรุป AI (`chatSummary` default false) · message → `stopFor REPLY` + `lastActivityAt` ทุกระบบที่เปิด · `catchUpResolvedChat` เมื่อผู้ติดต่อเกิดทีหลัง |
| `booking/index.ts` · `clinic/index.ts` · `school/index.ts` (+ `service.ts#appointmentsByParty`) · `scripts/fitness.mts` ALLOWED_EDGES | ใหม่/แก้ | facade อ่านอย่างเดียว (ตามช่วงเวลา · คลินิกไม่มีอาการ/วินิจฉัย/ค่ารักษา) |
| `src/lib/ai/credit.ts` | แก้ (additive) | `ChargeInput.extraMicroUsd` + `totalCostMicro()` + `canSpendPeek()` (สถานะ GET ไม่สร้าง wallet) |
| `platform/minute-jobs.ts` · `outbox-consumers.ts` · `webhooks/labels.ts` · `crm/index.ts` · `settings.ts` (บล็อก C2.4) · `scripts/crm-cron.mts` | แก้ | งาน `crm.activity.remind` ทุก 5 นาที (eager) · event `crm.activity.reminder` (ทะเบียนเดียว · consumer no-op) · facade `calls`/`reminders` · `settings.crm.ai.*` / `retention.recordingDays` |
| `components/crm/call/{CrmCallLogModal,CrmClickToCall,CrmCardScanButton,CrmCallRecordings,types}.tsx` · `_actions/calls.ts` · `CalendarViews.tsx` · calendar page · contact/deal 360 · contacts list | ใหม่/แก้ | โมดัลบันทึกการโทร (tel: เปิดโมดัล) · สแกนนามบัตร · ฟัง/ลบไฟล์เสียงบน 360 ทั้งสอง · ปฏิทินรวมนัด (ชิปเส้นประ · "+N รายการ" ถูก) |
| `crm-ui-inventory.json` (+48 · −1 `contact-call-link`) · `visual-crm.mts` (spec "2.4" สร้างข้อมูลตัวอย่างชั่วคราว) · `api/ops/activities.ts` + `docs/api/CRM-API.md` | แก้ | |

## 2. migration / seed / backfill — ไม่มี (R1) · AI credit source `CRM_ASSIST` จาก C2.0

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด · เคยแดง | ✅ | baseline 9/78 (MISSING_FUNCTION) · หลัง ORACLE-EDIT 90/91 → 91/91 |
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ✅ | `qc-crm-c2.4` **91/91** ทั้ง 2 รอบ |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ✅ | §5 — 27 ชุด (คลาส E 2 ข้อ) |
| D5 | typecheck · fitness ×2 | ✅ | รอบ 3 typecheck exit 0 · fitness 32/32 · noenv 32/32 (รอบ 2) |
| D6 | build | ✅ | รอบ 3 BUILD+serve exit 0 |
| D7 | ภาพ + PARITY | ✅ | §6 (Fable ดูเอง) |
| D8 | testid + ทะเบียน | ✅ | +48 แถว (ปุ่มโทรเดิมแทนที่) · F14.1/F14.2 |
| D9 | ผู้ตรวจอิสระ | ✅ | ผู้ตรวจของผู้คุมงาน (opus อ่านอย่างเดียว): (a)–(h) ยืนยัน · BLOCKER 2 + SHOULD-FIX 9 + NOTE 11 → รอบ 2 แก้ครบ (before/after `shark-crm-c20/.qc-shots/c24-r2/` + log ทุก suite) |
| D10 | เอกสาร/ทะเบียน | ✅ | event ใหม่ 1 (`crm.activity.reminder`) ครบ consumer+label · docs regen (`appointments` + ข้อจำกัด API key) |
| D11 | wo-notes + คืนสภาพ | ✅ | `qc-member-m1.9` 26/26 (ทั้ง 3 รอบ) |
| D12 | push → deploy | ⏳ | รอเจ้าของ push |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 | ใช้ | `X1.1–X1.5` + `S9.7` (ปฏิทินเฉพาะ Party ที่มองเห็น · API key ไม่ได้นัด · proposal ข้ามระบบ 404) |
| X2 | ใช้ | `X2.1–X2.3` (actor แบบคีย์ API) |
| X3 | ใช้ | `X3.1–X3.2` + `S9.2` (ถอดเสียง 10 ทาง = 1 proposal/1 ชาร์จ · transcribe ∥ accept) |
| X4 | ใช้ | `X4.1–X4.3` + `S9.10` (RESOLVED 2 ครั้ง/พร้อมกัน = 1 กิจกรรม) |
| X5 | ใช้ | `X5.1` + `S9.1` (เตือนซ้อน · 205 แถว) |
| X6 | ใช้ | `X6.1–X6.4` (mime/ขนาดไฟล์เสียง · นามบัตร) |
| X7 | N-A | ไม่มี route สาธารณะ (R10) |
| X8 | ใช้ | `X8.1–X8.6` (transcript/PII ไม่อยู่ใน payload/OpsEvent/audit/แจ้งเตือน/prompt) |
| X9 | ใช้ | `X9.1–X9.2` (ลบไฟล์เสียง confirm+reason · audit) |
| X10 | ใช้ | `X10.1–X10.3` (ลิงก์หมดอายุ · viewer-bound · ไม่มี path/CDN ใน DTO) |
| ร้าน uiVersion 1 | ใช้ | `U.1–U.5` |

## 5. ผลข้อสอบ (QC1 seed ใหม่ · 24 ก.ย. 09:38–11:45 UTC · 3 unit)
**รอบ 1 `c24c25-verify.log` (ถอยหลัง 27 ชุด · ก่อนแก้ visual-crm/S0.8):**
- `migrate diff (must be empty)`: exit=0 · `-`
- `reseed member`: exit=0 · `-`
- `qc-member-m1.1`: exit=1 · `{"total":28,"passed":27,"findings":[{"id":"M1.1-S4.2","sev":"CRITICAL"}]}`
- `seed crm #1`: exit=0 · `-`
- `seed crm #2`: exit=0 · `-`
- `DRAIN`: exit=0 · `{"total":4,"passed":4,"findings":[]}`
- `qc-crm-c2.4`: exit=0 · `{"total":91,"passed":91,"findings":[]}`
- `qc-crm-c2.5`: exit=0 · `{"total":105,"passed":105,"findings":[]}`
- `qc-crm-c2.1`: exit=0 · `{"total":84,"passed":84,"findings":[]}`
- `qc-crm-c2.2`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-c2.3`: exit=0 · `{"total":80,"passed":80,"findings":[]}`
- `qc-crm-c0.5`: exit=0 · `{"total":50,"passed":50,"findings":[],"unproven":[],"info":{"leaseStyle":"row le`
- `qc-crm-c1.4`: exit=1 · `{"total":110,"passed":109,"findings":[{"id":"C1.4-S0.8","sev":"MAJOR"}]}`
- `qc-crm-c1.6`: exit=0 · `{"total":79,"passed":79,"findings":[],"skippedChecks":[]}`
- `qc-crm-c1.7`: exit=0 · `{"total":57,"passed":57,"findings":[]}`
- `qc-crm-c1.8`: exit=0 · `{"total":81,"passed":81,"findings":[]}`
- `qc-crm-c1.11`: exit=0 · `{"total":66,"passed":66,"findings":[]}`
- `qc-crm-c2.0`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-v1`: exit=0 · `{"total":17,"passed":17,"findings":[]}`
- `qc-crm-c0.2`: exit=1 · `{"total":27,"passed":25,"findings":[{"id":"C0.2-S4.4","sev":"CRITICAL"},{"id":"C`
- `qc-chat-core-v2`: exit=0 · `{"total":47,"passed":47,"findings":[]}`
- `qc-chat-v2-context`: exit=0 · `{"total":53,"passed":53,"findings":[]}`
- `qc-ai-vision`: exit=0 · `{"total":6,"passed":6,"findings":[]}`
- `qc-ai-credit`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `qc-ai-proposals`: exit=0 · `{"total":16,"passed":16,"findings":[]}`
- `qc-kanban-k3.9`: exit=0 · `{"total":13,"passed":12,"findings":["K3.9-S4.2"]}`
- `qc-kanban-notify`: exit=0 · `-`
- `qc-member-m3.6`: exit=1 · `{"total":19,"passed":18,"findings":[{"id":"M3.6-S8.3","sev":"CRITICAL"}]}`
- `qc-member-fix-s1`: exit=0 · `{"total":28,"passed":28,"findings":[]}`
- `qc-member-fix-s3`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `qc-marketing`: exit=0 · `{"total":8,"passed":8,"findings":[]}`
- `qc-forms-notify`: exit=0 · `-`
- `qc-onboarding-drip`: exit=0 · `{"total":6,"passed":6,"findings":[]}`
- `qc-form`: exit=0 · `{"total":10,"passed":10,"findings":[]}`
- `qc-hr-leave-booking`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `qc-nav-functions`: exit=0 · `-`
- `probe-uiversion-gate (no env)`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `gen-crm-api-docs`: exit=0 · `-`
- `typecheck`: exit=2 · `-`
- `fitness`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `fitness-noenv`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `BUILD+serve`: exit=1 · `-`
- `shots 2.4`: exit=1 · `-`
- `shots 2.5`: exit=1 · `-`
- `serve stop`: exit=0 · `-`
- `qc-member-m1.9`: exit=0 · `{"total":26,"passed":26,"findings":[]}`

**รอบ 2 `c24c25-verify2.log` (หลังแก้ C1.4-S0.8 + docs regen ก่อน):**
- `migrate diff (must be empty)`: exit=0 · `-`
- `reseed member`: exit=0 · `-`
- `qc-member-m1.1`: exit=0 · `{"total":28,"passed":28,"findings":[]}`
- `seed crm #1`: exit=0 · `-`
- `seed crm #2`: exit=0 · `-`
- `DRAIN`: exit=0 · `{"total":4,"passed":4,"findings":[]}`
- `gen-crm-api-docs (early)`: exit=0 · `-`
- `qc-crm-c2.4`: exit=0 · `{"total":91,"passed":91,"findings":[]}`
- `qc-crm-c2.5`: exit=0 · `{"total":105,"passed":105,"findings":[]}`
- `qc-crm-c1.4`: exit=0 · `{"total":110,"passed":110,"findings":[]}`
- `qc-crm-c0.2`: exit=0 · `{"total":27,"passed":27,"findings":[]}`
- `qc-crm-c2.2`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-c1.8`: exit=0 · `{"total":81,"passed":81,"findings":[]}`
- `qc-crm-c1.11`: exit=0 · `{"total":66,"passed":66,"findings":[]}`
- `qc-crm-v1`: exit=0 · `{"total":17,"passed":17,"findings":[]}`
- `qc-nav-functions`: exit=0 · `-`
- `probe-uiversion-gate (no env)`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `gen-crm-api-docs`: exit=0 · `-`
- `typecheck`: exit=2 · `-`
- `fitness`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `fitness-noenv`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `BUILD+serve`: exit=1 · `-`
- `shots 2.4`: exit=1 · `-`
- `shots 2.5`: exit=1 · `-`
- `serve stop`: exit=0 · `-`
- `qc-member-m1.9`: exit=0 · `{"total":26,"passed":26,"findings":[]}`

**รอบ 3 `c24c25-verify3.log` (หลังย้าย spec 2.4 เข้า SPECS):**
- `typecheck`: exit=0 · `-`
- `fitness`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `BUILD+serve`: exit=0 · `-`
- `shots 2.4`: exit=0 · `{"wo":"2.4","user":"owner","shots":[".qc-shots/crm/2.4/crm-call-log-modal-owner-`
- `shots 2.5`: exit=0 · `{"wo":"2.5","user":"owner","shots":[".qc-shots/crm/2.5/crm-emails-owner-desktop.`
- `serve stop`: exit=0 · `-`
- `qc-member-m1.9`: exit=0 · `{"total":26,"passed":26,"findings":[]}`

สรุป: `qc-crm-c2.4` **91/91** · `qc-crm-c2.5` **105/105** · ถอยหลังเขียวทั้งหมดยกเว้นคลาส E 2 ข้อ (`K3.9-S4.2` · `M3.6-S8.3` = ภาพที่ถูกลบ) · รอบ 1 แดง `C1.4-S0.8` (แก้แล้ว 110/110) · `M1.1-S4.2`/`C0.2-S4.4-4.5` (docs stale จากลำดับสคริปต์ → 28/28 · 27/27) · typecheck ล้มจาก merge `visual-crm.mts` (ซ่อมแล้ว)

## 6. ภาพ (D7)
spec "2.4" (สร้างผู้ติดต่อมีเบอร์+Party + นัดจอง/คลินิก/โรงเรียนชั่วคราว คืนสภาพ) · owner (thana/nok = 404 ตามแบบ)
| หน้า | mockup | ภาพจริง | จอ | overflow | จุดต่างที่เห็นเอง |
|---|---|---|---|---|---|
| โมดัลบันทึกการโทร (ผลสาย · ระยะเวลา · ทิศทาง · เวลา · โน้ต · งานถัดไป · ไฟล์เสียง) | 08 ซ้าย | `.qc-shots/crm/2.4/crm-call-log-modal-owner-{desktop,mobile}.png` | 1440/390 | ไม่มี | ผลสายเป็น select (แบบเป็นชิป 6 ตัว — เทียบเท่า · มือถือดีกว่า) · การ์ด "AI ถอดเสียง + สรุป" ไม่อยู่ในโมดัล (ของจริงอยู่บนกิจกรรมหลังบันทึก และเป็น calm state "ยังไม่ได้เชื่อมบริการถอดเสียง" ตาม R-B — ข้อสอบ S8.4/S7.x) |
| ผู้ติดต่อ 360 + ปุ่มโทร/สแกนนามบัตร | 08 ซ้าย | `crm-contact-360-call-owner-*` | 1440/390 | ไม่มี | — |
| ปฏิทินสัปดาห์รวมนัด (ชิปเส้นประ = อ่านอย่างเดียว + คำอธิบาย) | 08 ขวา | `crm-calendar-merged-owner-*` | 1440/390 | ไม่มี | แบบใช้สีส้มแทนนัดจากโมดูลจอง · ของจริงใช้เส้นประ+คำอธิบาย (แยกได้ชัดเช่นกัน) |
- `PARITY: ผ่าน` (Fable 24 ก.ย.) · หนี้ภาพ: การ์ด AI ตอนมี provider จริง (backlog Q2)

## 7. ข้อแย้ง / มติ
- R1–R13 (19 ก.ย.) · R2 REPLACED = `CRM_ASSIST` (ORACLE-EDIT S2.3 24 ก.ย.) · builder รอบ 1 ตัดสินใจ 11 ข้อ (รับ) · **ruling round 2** (ท้าย brief): B1 เตือนอดตาย · B2 proposal ว่าง · F3–F11 · N13/N16–N20 · ORACLE-EDIT 78→91
- builder รอบ 2: F9 = คืน PENDING เสมอ (เพราะ `contacts.ts` แมป Error ไทยทุกตัวเป็น VALIDATION) · N13 = title generic + body redact (ข้อสอบ S5.2/X5.1/U.5 หาแถวจากชื่อกิจกรรม) · N18 testid ของโมดัลร่วมอยู่ใต้หน้าเดียว (F14.2 ห้ามซ้ำ) · `credit.ts` additive

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ผู้ให้บริการ STT จริง (ทะเบียนว่าง) · route webhook ผู้ให้บริการโทร | R-B / R10 · รอเจ้าของ Q2 | backlog |
| `purgeRecordings` ลงทะเบียนเป็นงานรายวัน | R-A | C2.10 |
| `chargeUsage` คืน 0 เมื่อ provider ไม่ส่ง usage (ทั้งแพลตฟอร์ม) | N12 | C5 |
| `redactContactInfo` ไม่รู้เลขไทย/อีเมลแปลง · over-match วันที่ ISO | N15 | C5 |
| `leaveSnapshot`-style: `mergedAppointments` cap 3,000 | ประกาศบนจอ | C5 |

## 9. คืนสภาพ QC — ร้านชั่วคราว `qc-c24-*` · CLEAN · `qc-member-m1.9` 26/26
