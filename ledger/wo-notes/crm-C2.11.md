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
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ⏳ | QC3 44/47 บนรอบ 1 (Fable) · unit `crm-c210c211-verify` QC1 — §5 |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ⏳ | builder: c1.10 66 · c2.10 41 · c2.5 105 · c2.2 73 · c2.8 54 · api-keys 51 · webhook 15 · c1.8 81 · c1.11 66 · nav 11 — unit §5 (+ m3.10 กับ server) |
| D5 | typecheck · fitness ×2 | ⏳ | builder เขียว · unit |
| D6 | build | ⏳ | unit |
| D7 | ภาพ + PARITY | ⏳ | spec "2.11" หน้า API vs mockup 14 (ขวา) — Fable ดูเอง |
| D8 | testid + ทะเบียน | ✅ | ไม่มี testid ใหม่ · F13.10 (`test:` id ครบ 101 op) · F13.12 (tool 23 ในสกิล) · F14 เขียว |
| D9 | ผู้ตรวจอิสระ | ✅ | read-only (opus): BLOCKER A1 replyTo consent-bypass (แก้) · A2 เว็บฮุคไร้ตัวยิง (จบด้วย C2.10) · A3 จุดชน C2.10 (ถอนแถวซ้ำ) · MAJOR B1–B6 · MINOR 7–13 · ตัดสิน ORACLE-EDIT + ชี้ข้อที่เขียวหลอก (X7.1/X9.3) → ข้อสอบเข้มขึ้น |
| D10 | เอกสาร/ทะเบียน | ✅ | docs 101 op (F13.11) · event C2 ประกาศครั้งเดียว · tool ในสกิล |
| D11 | wo-notes + คืนสภาพ | ⏳ | `qc-member-m1.9` ใน unit |
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
_(รอ unit `crm-c210c211-verify` บน QC1)_

## 6. ติดตาม / มติ
- การตอบอ้าง `replyToEmailId` ของเธรดที่ยังไม่ผูกผู้ติดต่อผ่าน API = 404 (รับ · UI ตอบจากเธรดที่ผูกแล้ว) · ถ้าต้องการในอนาคต: เงื่อนไข `assertUnmatchedGate`
- op สำหรับ preview `recompute` แบบไม่ต้อง confirm (kind read แยก) → C3.x ถ้าจำเป็น · C1.10-X1.1/X1.2 ควรส่ง body ถูกต้องเพื่อให้ path id เป็นตัวตัดสิน (จด)
- `emails.userSettings.*` เข้มกว่า UI (ต้อง `crm.email.settings`) · `emails.draft` บาง (ไม่คืนข้อมูลลูกค้า) · path เงา `/deals/stale` vs `/deals/{id}` ปลอดภัยเพราะ matcher เลือก param น้อยสุด
