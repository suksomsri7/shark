# WO C2.11 — REST + ผู้ช่วย AI ชุดที่สอง (32 op · 10 tool)

> RUN "CRM v2" · builder `/root/projects/shark-crm-c23` (QC3) · builder 2 รอบ (opus · รอบ 1 บน `455623ec` = 30/32 op + tool 10 + sendBulk · รอบ 2 บน `a747d4b1` หลังรวม C2.10 = 2 op notifications + BLOCKER/MAJOR จากผู้ตรวจอิสระ) · ผู้ตรวจอิสระ read-only (opus) · รวมทรีหลัก `a2b547ca`
> สัญญา: CRM-RUN §2 C2.11 · brief C2.11 (addendum 1–15 · ruling 24 ก.ย. + ORACLE-EDIT send-bulk · มติหลังรอบ 1 · มติ 25 ก.ย.) · แบบแผน C1.10 (op registry · kind read/write/danger · confirm+reason · 404 ไม่ใช่ 403 · proposal vs read) · ไม่มีคีย์/หน้า/migration ใหม่ · mockup 14 (ขวา) หน้า API
> ข้อสอบ: `scripts/qc-crm-c2.11.mts` (**47 ข้อ** · S1 3 · S2 12 · S3 4 · S4 3 · S5 1 · S6 1 · S7 2 · X2 5 · X3 1 · X6 3 · X7 2 · X8 3 · X9 3 · U 3 · CLEAN) · ORACLE-EDIT โดย Fable: S2.10 (dry run ของ op danger ต้องส่ง confirm) · S3.2 (seed object `car` + fixture ล้ม = FATAL) · ข้อความ 31→32 · **X7.1** assert จริง (read มี rate · bulk ห้ามอยู่ `report`) · **X9.3** ต้องพบเหตุผลผู้เรียกใน audit ≥2 · **X9.1** ห้าม op danger มี tool · และ `qc-crm-c1.10`: S0.2 regex รับ id ของใบอื่น · X1.1/X1.2 รับ 400/422 = ปฏิเสธ

## 1. ไฟล์ที่แตะ (23 ไฟล์ src · +1,566/−19 · docs 101 op)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `crm/api/ops/{emails,sequences,assignment,scoring,tracking,automation,notifications,insights}.ts` (+1,264) · `api/registry.ts` (+55) | ใหม่/แก้ | 32 MUST op (emails 11 · sequences 7 · assignment 3 · scoring 4 · tracking 3 · notifications 2 · automation 2) + 6 RECOMMENDED (templates upsert/delete · draft · deals.stale.list · activities.due.list · deals.nextStep.set) · path แบบ C1.10 · `emails.send` = ผู้รับคนเดียว (kind write) · `emails.sendBulk` = `POST /emails/send-bulk` danger ≤500 · `scoring.explain = GET /contacts/{id}/score` (`crm.contact.read`) · `assignment.simulate`/`automation.dryRun` kind read แม้ POST + ด่านสถิต `crmReadKindDoorsReachableByReadonlyBundle()` assert ตอน import (dev/QC) · danger 4 = sendBulk · bulkEnroll · recompute{all} · inbound.rotate (+ templates.delete) · `rate` ทุก read (14 ตัว) · bulk 2 ตัวอยู่ `write` · `notifications.prefs.*` ทำแทนเจ้าของคีย์เท่านั้น (สคีมา strict ไม่มี userId) · ทุก op เรียก facade เท่านั้น |
| `crm/emails.ts` (+162/−12) | แก้ | **`sendBulk`** (ลูปบน `sendCore` · consent/visibility/idempotency รายคน `<reqKey>:<contactId>` · จับทุก error ต่อคน → `failed[]` ids+code · ตอบ 200 เสมอ · audit started/done+failedCodes) · `listThreads` รับ `pageSize` · **A1** `isTransactionalReply(ctx, actor, contact, replyToEmailId)`: parent ต้องอยู่ tenant/system เดียวกัน · เธรดต้องมีผู้ติดต่อคนนี้ · actor ต้องมองเห็น (`rowVisibleFilter`) · ไม่ผ่าน = 404 ไม่ถอยเปิดเธรดใหม่ (ปิดช่อง bypass consent ของคนอื่น + graft เธรดผิดคน ที่มีมาตั้งแต่ C2.5) · `deleteTemplate` คืน `inUse {sequences, scheduled}` + audit |
| `api/tools.ts` (+8) · `ai/skills.ts` (+6) · `ops/deals.ts` · `ops/contacts.ts` | แก้ | tool 10: read `crm_email_thread` · `crm_score_explain` · `crm_stale_deals` · `crm_activities_due` · `crm_records_query` · draft-only `crm_draft_email` · proposal `crm_send_email` · `crm_enroll_sequence` · `crm_assign` (บน `contacts.assign` เดิม) · `crm_set_next_step` · `ASSISTANT_READ_SCOPES += crm.email.read` (ยัง ∩ สิทธิ์ของคนที่ถาม) · **B3** assistant เห็น subject/snippet/body/from ที่ mask PII แล้ว (`maskPiiPatterns`) · hint `crm_update_deal` ตัด "next step" |
| `api/http-errors.ts` (+13) | แก้ | `EMAIL_BLOCKED`/`NOT_CONFIGURED` → 409 state_conflict · `CRM_V2_DISABLED` → 409 crm_v2_disabled (เดิมกลายเป็น 500 ให้ client retry ไม่จบ) |
| `webhooks/labels.ts` · `outbox-consumers.ts` | แก้ | (รอบ 1 ใส่ `crm.deal.stale`/`crm.activity.overdue` เอง → รอบ 2 **ถอน** เหลือของ C2.10 ประกาศครั้งเดียว) |
| `settings/api/page.tsx` · `CrmApiSettings.tsx` · `shared.ts` | แก้ | บรรทัดช่วยของชุดสิทธิ์แสดงจำนวนสิทธิ์จริง + กลุ่ม C2 (ไม่มี testid/DOM ใหม่ · S6.1) · `visual-crm.mts` spec "2.11" (หน้า API + ฟอร์มคีย์) |
| `ops/activities.ts` | แก้ | em dash ใน `calendar.list.summary` (C2.4) → ASCII ตามสัญญา C1.10 |
| `gen-crm-api-docs.mts` (+33/−8) | แก้ | section ใหม่ 7 · glossary 8 แถว · PLANNED ตัดของที่มีแล้ว · docs 101 op |

## 2. migration / seed / backfill — ไม่มี · คีย์สิทธิ์ใหม่ ไม่มี (`crm.email.read` อยู่ในชุด operate/admin เดิม)

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด · เคยแดง | ✅ | 16/47 → 42 (รอบ 1) → 43 (ข้อสอบเข้มขึ้น) → **47/47 ×2** (รอบ 2) |
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ✅ | unit `crm-c210c211-verify` (QC1) — §5 |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ✅ | §5 — 48 ชุดเขียว (member ภาพ = ENV ถ่ายแล้วใน unit เสริม) |
| D5 | typecheck · fitness ×2 | ✅ | typecheck exit 0 · fitness 32/32 ×2 |
| D6 | build | ✅ | BUILD+serve exit 0 · c2.6-web 35/35 |
| D7 | ภาพ + PARITY | ✅ | §7 |
| D8 | testid + ทะเบียน | ✅ | ไม่มี testid ใหม่ · F13.10 (`test:` id ครบ 101 op) · F13.12 (tool 23 ในสกิล) · F14 เขียว |
| D9 | ผู้ตรวจอิสระ | ✅ | read-only (opus): BLOCKER A1 replyTo consent-bypass (แก้) · A2 เว็บฮุคไร้ตัวยิง (จบด้วย C2.10) · A3 จุดชน C2.10 (ถอนแถวซ้ำ) · MAJOR B1–B6 · MINOR 7–13 · ตัดสิน ORACLE-EDIT + ชี้ข้อที่เขียวหลอก (X7.1/X9.3) → ข้อสอบเข้มขึ้น |
| D10 | เอกสาร/ทะเบียน | ✅ | docs 101 op (F13.11) · event C2 ประกาศครั้งเดียว · tool ในสกิล |
| D11 | wo-notes + คืนสภาพ | ✅ | `qc-member-m1.9` 26/26 ×2 |
| D12 | push → deploy | ⏳ | รอเจ้าของ push |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 | ใช้ | (ผ่าน c1.10 X1.1–X1.3 ที่แก้แล้ว) + A1 replyTo ข้ามระบบ = 404 |
| X2 | ใช้ | `X2.1–X2.5` (คีย์ไม่มี `crm.email.*` อ่านเธรดไม่ได้ · readonly ส่งไม่ได้ 5 ประตู · assistant ตามสิทธิ์คนถาม · thana อ่านเธรดกระบี่ไม่ได้) |
| X3 | ใช้ | `X3.1` (send idempotent · คีย์เดิม = จดหมายฉบับเดียว) |
| X4 | N-A | ไม่มี consumer ใหม่ (C2.10 เป็นเจ้าของ) |
| X5 | N-A | ไม่มีงานตามเวลา |
| X6 | ใช้ | `X6.1–X6.3` (สคีมา strict · เพดาน 500/bulk · take) |
| X7 | ใช้ | `X7.1–X7.2` (rate ทุก read · bulk ไม่อยู่ report · limiter ครอบ op ใหม่) |
| X8 | ใช้ | `X8.1–X8.3` (readonly ไม่เห็น body · assistant เห็นของ mask · error ไม่รั่ว) |
| X9 | ใช้ | `X9.1–X9.3` (danger 4 + ไม่มี tool · send คนเดียว · audit มีเหตุผลผู้เรียก) |
| X10 | N-A | ไม่มี |
| ร้าน uiVersion 1 | ใช้ | `U.1–U.3` (ทุก op ใหม่ = 409 crm_v2_disabled ไม่เขียน · ping 200) |

## 5. ผลข้อสอบ
**unit `crm-c210c211-verify` (QC1 seed ใหม่ · 25 ก.ย. 12:00–14:40 UTC · ALLDONE · main tree `a2b547ca`):**
- `migrate diff (must be empty)`: exit=0 · `-`
- `gen-crm-api-docs (early · before m1.1)`: exit=0 · `-`
- `reseed member`: exit=0 · `-`
- `qc-member-m1.1`: exit=0 · `{"total":28,"passed":28,"findings":[]}`
- `seed crm #1`: exit=0 · `-`
- `seed crm #2`: exit=0 · `-`
- `DRAIN`: exit=0 · `{"total":4,"passed":4,"findings":[]}`
- `qc-crm-c2.10`: exit=0 · `{"total":41,"passed":41,"findings":[]}`
- `qc-crm-c2.11`: exit=0 · `{"total":47,"passed":47,"findings":[]}`
- `qc-crm-c2.10`: exit=0 · `{"total":41,"passed":41,"findings":[]}`
- `qc-crm-c2.11`: exit=0 · `{"total":47,"passed":47,"findings":[]}`
- `qc-crm-c1.10`: exit=0 · `{"total":66,"passed":66,"findings":[]}`
- `qc-crm-c2.1`: exit=0 · `{"total":84,"passed":84,"findings":[]}`
- `qc-crm-c2.2`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-c2.3`: exit=0 · `{"total":80,"passed":80,"findings":[]}`
- `qc-crm-c2.4`: exit=0 · `{"total":91,"passed":91,"findings":[]}`
- `qc-crm-c2.5`: exit=0 · `{"total":105,"passed":105,"findings":[]}`
- `qc-crm-c2.6`: exit=0 · `{"total":87,"passed":87,"findings":[]}`
- `qc-crm-c2.7`: exit=0 · `{"total":63,"passed":63,"findings":[]}`
- `qc-crm-c2.8`: exit=0 · `{"total":54,"passed":54,"findings":[]}`
- `qc-crm-c2.9`: exit=0 · `{"total":52,"passed":52,"findings":[]}`
- `qc-crm-c0.5`: exit=0 · `{"total":50,"passed":50,"findings":[],"unproven":[],"info":{"leaseStyle":"row lease (re-run at +16m)","dueMode`
- `qc-crm-c1.2b`: exit=0 · `{"total":93,"passed":93,"findings":[]}`
- `qc-crm-c1.4`: exit=0 · `{"total":110,"passed":110,"findings":[]}`
- `qc-crm-c1.5`: exit=0 · `{"total":103,"passed":103,"findings":[]}`
- `qc-crm-c1.6`: exit=0 · `{"total":79,"passed":79,"findings":[],"skippedChecks":[]}`
- `qc-crm-c1.7`: exit=0 · `{"total":57,"passed":57,"findings":[]}`
- `qc-crm-c1.8`: exit=0 · `{"total":81,"passed":81,"findings":[]}`
- `qc-crm-c1.11`: exit=0 · `{"total":66,"passed":66,"findings":[]}`
- `qc-crm-c2.0`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-v1`: exit=0 · `{"total":17,"passed":17,"findings":[]}`
- `qc-crm-c0.2`: exit=0 · `{"total":27,"passed":27,"findings":[]}`
- `qc-form`: exit=0 · `{"total":10,"passed":10,"findings":[]}`
- `qc-forms-notify`: exit=0 · `-`
- `qc-public-links`: exit=0 · `{"total":11,"passed":11,"findings":[]}`
- `qc-pages`: exit=0 · `{"total":31,"passed":31,"findings":[]}`
- `qc-pos-register`: exit=0 · `{"total":42,"passed":42,"findings":[]}`
- `qc-pos-account`: exit=0 · `{"total":16,"passed":16,"findings":[]}`
- `qc-acc-v2-payments`: exit=0 · `-`
- `qc-account-api-write-payments`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `qc-account-api-keys`: exit=0 · `{"total":51,"passed":51,"findings":[]}`
- `qc-webhook`: exit=0 · `{"total":15,"passed":15,"findings":[]}`
- `qc-kanban-notify`: exit=0 · `-`
- `qc-push`: exit=0 · `-`
- `qc-cron`: exit=0 · `{"total":4,"passed":4,"findings":[]}`
- `qc-member-fix-s3`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `qc-member-m3.3`: exit=1 · `{"total":32,"passed":30,"findings":[{"id":"M3.3-S9.2","sev":"CRITICAL"},{"id":"M3.3-S9.3","sev":"CRITICAL"}]}`
- `qc-member-m3.6`: exit=1 · `{"total":19,"passed":18,"findings":[{"id":"M3.6-S8.3","sev":"CRITICAL"}]}`
- `qc-member-m3.7`: exit=1 · `{"total":23,"passed":22,"findings":[{"id":"M3.7-S6.2","sev":"CRITICAL"}]}`
- `qc-chat-core-v2`: exit=0 · `{"total":47,"passed":47,"findings":[]}`
- `qc-ticket-money`: exit=0 · `{"total":6,"passed":6,"findings":[]}`
- `qc-rental`: exit=0 · `{"total":11,"passed":11,"findings":[]}`
- `qc-school`: exit=0 · `{"total":7,"passed":7,"findings":[]}`
- `qc-hotel-money`: exit=0 · `{"total":5,"passed":5,"findings":[]}`
- `qc-clinic`: exit=0 · `{"total":8,"passed":8,"findings":[]}`
- `qc-queue-public`: exit=0 · `{"total":20,"passed":20,"findings":[]}`
- `qc-shop`: exit=0 · `{"total":15,"passed":15,"findings":[]}`
- `qc-booking-race`: exit=0 · `{"total":8,"passed":8,"findings":[]}`
- `qc-nav-functions`: exit=0 · `-`
- `probe-uiversion-gate (no env)`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `gen-crm-api-docs`: exit=0 · `-`
- `typecheck`: exit=0 · `-`
- `fitness`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `fitness-noenv`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `BUILD+serve`: exit=0 · `-`
- `shots 2.10 (owner)`: exit=0 · `{"wo":"2.10","user":"owner","shots":[".qc-shots/crm/2.10/crm-home-stale-owner-desktop.png",".qc-shots/crm/2.10`
- `shots 2.10 (manager)`: exit=1 · `{"wo":"2.10","user":"manager","shots":[".qc-shots/crm/2.10/crm-home-stale-manager-desktop.png",".qc-shots/crm/`
- `shots 2.11 (owner)`: exit=2 · `{"wo":"2.11","user":"owner","shots":[".qc-shots/crm/2.11/crm-settings-api-c211-owner-desktop.png"],"failures":`
- `qc-member-m3.10 (server up)`: exit=1 · `{"total":21,"passed":20,"findings":[{"id":"M3.10-S4.3","sev":"CRITICAL"}]}`
- `qc-crm-c2.6-web (headless)`: exit=0 · `{"total":35,"passed":35,"findings":[]}`
- `serve stop`: exit=0 · `-`
- `qc-member-m1.9`: exit=0 · `{"total":26,"passed":26,"findings":[]}`

- แดงที่ไม่ใช่โค้ด: `qc-member-m3.3` S9.2/S9.3 · `qc-member-m3.6` S8.3 · `qc-member-m3.7` S6.2 · `qc-member-m3.10` S4.3 = ข้อภาพที่อ่านไฟล์ summary ของ visual-member (ไม่มีใน seed) — ข้อฟังก์ชันผ่านหมด · `shots 2.10 (manager)` = spec คาดแท็บร้านทั้งที่ผู้จัดการใน seed ไม่มี `crm.settings.manage` (แก้ spec) · `shots 2.11` = selector ที่มีจุดไม่ได้ quote (แก้ spec) → ปิดทั้งหมดใน unit `crm-member-shots-c2close` (ด้านล่าง)

**unit `crm-member-shots-c2close` (QC1 · เซิร์ฟเวอร์จาก .next เดิม):** visual-member 3.3/3.6/3.7/3.10 ถ่ายครบ (ทุกหน้า 200 · ไม่ล้น · ไม่มี element หาย) → `qc-member-m3.7` **23/23** · `qc-member-m3.10` **21/21** · `qc-member-m3.3` 31/32 (S9.2 ขาดภาพผู้ใช้ `noperm` 404) · `qc-member-m3.6` 18/19 (S8.3 ขาดภาพ `thana` 403) — สองข้อนี้ต้องถ่ายผู้ใช้เพิ่มของ RUN สมาชิก ไม่เกี่ยวโค้ด (หน้าแจ้งเตือนสมาชิกหลังยก quiet-hours ออก = 200 ไม่ล้น) · shots 2.10 manager (spec แก้) exit 0 · shots 2.11 owner 3 ใบ (spec 1 คาด testid ของ event ที่อยู่ในฟอร์ม "เพิ่ม URL" → แก้ spec แล้ว · ภาพครบ) · `qc-member-m1.9` 26/26


## 6. ติดตาม / มติ
- การตอบอ้าง `replyToEmailId` ของเธรดที่ยังไม่ผูกผู้ติดต่อผ่าน API = 404 (รับ · UI ตอบจากเธรดที่ผูกแล้ว) · ถ้าต้องการในอนาคต: เงื่อนไข `assertUnmatchedGate`
- op สำหรับ preview `recompute` แบบไม่ต้อง confirm (kind read แยก) → C3.x ถ้าจำเป็น · C1.10-X1.1/X1.2 ควรส่ง body ถูกต้องเพื่อให้ path id เป็นตัวตัดสิน (จด)
- `emails.userSettings.*` เข้มกว่า UI (ต้อง `crm.email.settings`) · `emails.draft` บาง (ไม่คืนข้อมูลลูกค้า) · path เงา `/deals/stale` vs `/deals/{id}` ปลอดภัยเพราะ matcher เลือก param น้อยสุด
## 7. PARITY (Fable ดูเอง)
- **PARITY: ผ่าน** — `.qc-shots/crm/2.11/crm-settings-api-c211-{owner-desktop,owner-mobile,bundles-owner-desktop}.png` vs `ledger/design-crm/14-ai-api-webhook.png` (ขวา): โครงหน้า API เดิมของ C1.10 คงเดิม (คีย์ · curl · manifest tool · webhook · deliveries) · ตาราง tool ขึ้น 23 ตัวรวม 10 ตัวใหม่ (ชนิด/สิทธิ์ถูก) · ฟอร์มสร้างคีย์: บรรทัดช่วยของชุดสิทธิ์เติม "· N สิทธิ์ (รวม อีเมล · ลำดับการติดตาม · …)" ต่อท้ายข้อความเดิม (readonly 6 · operate 23 · admin 51) ไม่ดัน radio/ไม่ล้น
