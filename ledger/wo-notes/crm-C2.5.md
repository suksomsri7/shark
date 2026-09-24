# WO C2.5 — ระบบอีเมล (E-mail engine · มติ C4) — ใบใหญ่และเปิดเผยที่สุดของ RUN

> RUN "CRM v2" · builder `/root/projects/shark-crm-c23` (QC3) · รวมทรีหลัก `session/crm` · a (transport/inbound/tracking/webhook) 24 ก.ย. 05:50–07:20 UTC · b (UI) 07:25–08:50 · ผู้ตรวจของผู้คุมงาน 08:50 · **รอบ 2: 08:25–09:30 (opus · 105/105)** · ผู้คุมงาน **Fable 5.1** · รับงาน 24 ก.ย. 2569
> สัญญา: CRM-RUN §2 C2.5 · brief C2.5 (addendum 1–13 + ruling 24 ก.ย. ×3 + round 2) · พิมพ์เขียว §5.6 §11.4 · มติ C4 · **C31** (`replyToMode SHARK|STAFF|SELF|CUSTOM` · threading `crm+<key>+t<12>@` · ฟุตเตอร์ยกเลิกรับทุกฉบับ · token ทำงานบน v1) · ภาพ 08 กลาง · 15
> ข้อสอบ: `scripts/qc-crm-c2.5.mts` (**105 ข้อ** = 94 (−FATAL) + ORACLE-EDIT 12 ข้อ S10 · S0 6 · S1–S9 61 · S10 12 · X1 5 · X2 1 · X3 3 · X4 5 · X5 3 · X6 6 · X7 6 · X8 6 · X9 1 · X10 1 · U 5 · CLEAN) · แก้หลัง commit: **ใช่ (`backdate` ::timestamp · S3.4 fixture authentication-results · S10.*)**

## 1. ไฟล์ที่แตะ (37 ไฟล์ · +6,177/−34)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/core/email.ts` (+`sendEmailRich` · `sendEmail` เดิมไม่แตะ sha ตรง) · `core/sanitize.ts` (opt-in `allowImages`/`allowLinkSchemes`) · **`core/inbound-address.ts`** (matcher ล้วน) | แก้/ใหม่ | header CR/LF ปฏิเสธก่อนเครือข่าย · `Idempotency-Key` · `deps.fetch` |
| `crm/emails.ts` (~2,450) · `emails-shared.ts` · `emails-actions.ts` · `emails-job.ts` | ใหม่ | routing (ร้าน × override × โดเมน VERIFIED) · send/sendAsSystem (consent ตอนส่ง · pixel/ลิงก์ตามสวิตช์ · unsubscribe ไม่ห่อ · List-Unsubscribe one-click · Message-ID/In-Reply-To/References · `to` ⊆ อีเมลผู้ติดต่อ) · scheduled LEASE (QUEUED คง · ส่งซ้ำด้วยคีย์เดิม · ส่งทันทีที่ค้าง = FAILED) · ingestInbound (`crm+<key>@` ก่อนบอร์ด · dedupe `<systemId>:<rfcId>` · threading 3 ชั้น เทียบ short เท่ากัน · BCC capture · OUT เฉพาะ From ที่ผ่าน DKIM/SPF หรือโดเมน VERIFIED · stranger→lead EMAIL · auto-reply ข้าม · ไฟล์แนบ PRIVATE รวมแบบ URL ผ่านด่าน SSRF · `attachmentsDropped` · v1 = เก็บอะไรไม่ได้) · tracking token `<emailId>~192-bit` เก็บ hash · `/t/o` ตอบเหมือนกันทุกกรณี · `/t/c` 302 เฉพาะ URL ที่เก็บ · unsubscribe (ทำงานบน v1) · webhook Svix (401 ไม่เขียนแม้ rate bucket · replay dedupe · bounce/complaint → optOut+consent+stopFor · error ชั่วคราว = 500) · domains · purge (ไม่แตะที่ยังไม่ส่ง) · event 6 ตัวใน tx เดียวกับตัวนับ · getThread/listThreads มองเห็นราย**ข้อความ** |
| routes `api/email/inbound` (dispatch hunk · แยกผู้รับก่อน import CRM) · `t/o` · `t/c` · `u/[token]` + `one-click` · `api/email/resend/webhook` | ใหม่/แก้ | |
| pages `crm/emails` (+ "การส่งของฉัน") · `[threadKey]` (iframe `sandbox=""` · srcDoc · รูปปิดก่อน) · `settings/email` · components `crm/emails/{EmailInbox,EmailThread,EmailComposer,EmailSettingsForm,MySendingCard,types}` | ใหม่ | composer ในเธรด (แม่แบบ/แนบ ≤8 MiB/ตั้งเวลา) · rotate key danger · ทับค่าต่อคน · แม่แบบ CRUD |
| `settings.ts` (บล็อก C2.5 jsonb คำสั่งเดียว) · `contacts.ts` (`kind:"EMAIL"`) · `activities.ts` (EMAIL + direction) · `sequences.ts` (`SeqSubject.stepId` + sender จริง) · `automation.ts` (SEND_EMAIL จริง R-E.5) · `index.ts` · `nav.ts` · `layout.tsx` · `minute-jobs.ts` (`crm.email.scheduled` 1 นาที) · `outbox-consumers.ts` · `webhooks/labels.ts` · `crm-cron.mts` · `gen-crm-api-docs.mts` + docs | แก้ | |
| `crm-ui-inventory.json` (+78) · `visual-crm.mts` (spec "2.5" สร้างเธรด/แม่แบบ/override ชั่วคราว transport stub) | แก้ | |

## 2. migration / seed / backfill — ไม่มี (ตาราง `CrmEmail*`/`EmailDomain` จาก C2.0 · token เก็บใน `trackTokenHash`/`routing`)

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด · เคยแดง | ✅ | 16/17 (FATAL backdate) → 88/93 (a) → 93/93 (b) → 102/105 → 105/105 |
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ✅ | `qc-crm-c2.5` **105/105** ทั้ง 2 รอบ |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ✅ | §5 — 27 ชุด (คลาส E 2 ข้อ) · `C1.4-S0.8` แก้แล้ว |
| D5 | typecheck · fitness ×2 | ✅ | รอบ 3 typecheck exit 0 · fitness 32/32 · noenv 32/32 (รอบ 2) |
| D6 | build | ✅ | รอบ 3 BUILD+serve exit 0 |
| D7 | ภาพ + PARITY | ✅ | §6 (Fable ดูเอง) |
| D8 | testid + ทะเบียน | ✅ | +78 แถว · roles owner+manager ที่ `/settings/email` · testid ซ้ำใน `.map` มี data-* |
| D9 | ผู้ตรวจอิสระ | ✅ | ผู้ตรวจของผู้คุมงาน (opus อ่าน a+b): (a)–(k) ยืนยัน · **BLOCKER 2** (threading prefix · getThread ทั้งเธรด) + SHOULD-FIX 13 + NOTE 12 → รอบ 2 แก้ครบ (before/after `shark-crm-c23/.qc-shots/c25-r2/` + log ทุก suite) |
| D10 | เอกสาร/ทะเบียน | ✅ | event 6 ตัว label เดียว (`webhooks/labels.ts`) + consumer + emit ใน tx · docs regen รู้จัก payload `crm.email.*` |
| D11 | wo-notes + คืนสภาพ | ✅ | `qc-member-m1.9` 26/26 (ทั้ง 3 รอบ) |
| D12 | push → deploy | ⏳ | รอเจ้าของ push · 🔴 prod ต้องมี `RESEND_WEBHOOK_SECRET` (ไม่ตั้ง = route ปิด 401) และ DNS ของ `crm+…@shark.in.th` ชี้ inbound เดิม |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 | ใช้ | `X1.1–X1.5` + `S10.2` (มองเห็นรายข้อความ) |
| X2 | ใช้ | `X2.1` |
| X3 | ใช้ | `X3.1–X3.3` |
| X4 | ใช้ | `X4.1–X4.5` (inbound replay/parallel · webhook replay · 2 ระบบ = 1 แถวต่อระบบ) |
| X5 | ใช้ | `X5.1–X5.3` + `S10.4/S10.5` (lease · crash หลัง claim / หลัง transport) |
| X6 | ใช้ | `X6.1–X6.6` (header injection · HTML inert · open redirect · mime/size) |
| X7 | ใช้ | `X7.1–X7.6` + `S10.8` (token ≥128 บิต hash · unknown = เหมือนกัน · rate limit จริง · webhook 401 ไม่เขียน) |
| X8 | ใช้ | `X8.1–X8.6` (consent ตอนส่ง · payload/log ไม่มี PII/URL · purge · complaint) |
| X9 | ใช้ | `X9.1` (rotate key danger) |
| X10 | ใช้ | `X10.1` (attachmentUrl 15 นาที · ไม่มี CDN/path ใน DTO) |
| ร้าน uiVersion 1 | ใช้ | `U.1–U.5` (+ ข้อยกเว้น 4: token click · one-click · purge · pixel) |

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
spec "2.5" (สร้างเธรดขาเข้า HTML+ไฟล์แนบ + ตอบ + แม่แบบ + override ชั่วคราว · transport stub · คืนสภาพ 0→0) · owner (+manager/thana/nok ตามคีย์)
| หน้า | mockup | ภาพจริง | จอ | overflow | จุดต่างที่เห็นเอง |
|---|---|---|---|---|---|
| กล่องจดหมาย (ทั้งหมด/ยังไม่จับคู่ · ค้นหา · แถวเธรด) + "การส่งของฉัน" | 08 กลาง | `.qc-shots/crm/2.5/crm-emails-owner-*` · `crm-emails-unmatched-owner-*` | 1440/390 | ไม่มี | — |
| เธรด: ขาเข้า (iframe sandbox · ปุ่มแสดงรูป · ไฟล์แนบ) · ขาออก · composer (ถึง/แม่แบบ/หัวข้อ/เนื้อความ/แนบ ≤8 MB/ตั้งเวลา) | 08 กลาง | `crm-email-thread-owner-*` · `crm-email-composer-owner-*` | 1440/390 | ไม่มี | ป้าย "เปิด N ครั้ง · คลิก N" มีในโค้ด (แสดงเมื่อ >0 · ข้อมูลตัวอย่างยังไม่ถูกเปิด) |
| ตั้งค่าอีเมล: กล่องรับเข้า+หมุนกุญแจ · ผู้ส่ง (SHARK/โดเมน+ตาราง DNS) · Reply-To 3 แบบ · สำเนา · BCC/lead/tracking/retention · ทับค่าต่อผู้ใช้ · แม่แบบ | 15 | `crm-email-settings-owner-*` | 1440/390 | ไม่มี | โหมดเป็น select แทน radio · การ์ด Gmail/Outlook "เร็ว ๆ นี้" ไม่ทำ (นอกขอบเขต) |
- `PARITY: ผ่าน` (Fable 24 ก.ย.)

## 7. ข้อแย้ง / มติ
- addendum 1–13 CONFIRMED (มติ C31) · หลัง a: ORACLE-EDIT `backdate` (42P08) + ยืนยัน 8 ข้อของ builder · หลัง b: 6 ข้อ · **ruling round 2** (ผู้ตรวจ): F1/F2 BLOCKER · F3–F15 · N6/N7/N8/(h) · มติ 3 ข้อ (S3.4 fixture · F4/F5 ตาม `scheduledAt` · **ไม่เพิ่มข้อยกเว้น F2.3 — matcher ไป `core/inbound-address.ts`**) · ORACLE-EDIT 93→105
- builder รอบ 2 ตัดสินใจ (รับ): complaint consent source `UNSUBSCRIBE` · `attachmentsDropped` ใน `routing` · F13 เพดาน client 8 MiB (10 MiB จริง = upload lane ใหม่) · แถว `/emails` ที่ list nok/thana → C4.2

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| Q7 เจ้าของ: ฟุตเตอร์ยกเลิกรับในอีเมลขาย 1:1 (ค่าเริ่มต้น "มี") | รอคำตอบ | ก่อน C2.5 ขึ้น prod จริง (ORACLE-EDIT S2.3/X8.2 ถ้า "ไม่") |
| `COMPLAINT` ใน `CONSENT_SOURCES` | contacts-shared + enum สมาชิก | C6 |
| ไฟล์แนบ 10 MiB จากเบราว์เซอร์ (FormData lane) · UI ของ `attachmentsDropped` · lazy-load HTML 2 เวอร์ชัน | ขอบเขต | backlog |
| `visibleThreadWhere` take 20,000 · `listThreads` take 2,000 · bounded reader ของ webhook | ปริมาณ | C5 |
| `purgeBodies`/`runScheduled` ลงทะเบียนรายวัน/แถวคง | R-A | C2.10 |

## 9. คืนสภาพ QC — ร้านชั่วคราว `qc-c25-*` · CLEAN (trigger/function ถูกถอน) · `qc-member-m1.9` 26/26
