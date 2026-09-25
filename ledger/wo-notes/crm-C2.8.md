# WO C2.8 — คะแนนผู้ติดต่อ (lead scoring)

> RUN "CRM v2" · builder `/root/projects/shark-crm-c20` (QC2) · รวมทรีหลัก `session/crm` 25 ก.ย. 05:20 UTC (`809999fa`) · builder 3 ตัว (opus · ตัวแรกโดนโควตา · ตัวต่อ = ปิด deliverables + c1.11/nav · รอบแก้ 2 = BLOCKER/MAJOR/parity จากผู้ตรวจอิสระ) · ผู้ตรวจอิสระ read-only (opus)
> สัญญา: CRM-RUN §2 C2.8 · brief C2.8 (26 ข้อยืนยัน + มติรอบแก้ 25 ก.ย.) · R-C.1 ไม่มี migration (ใช้ `CrmScoreRule`/`CrmScoreLog`/`score,scoreBand,scoreUpdatedAt` จาก C2.0) · R-C.8 คีย์ event · R-E.14 gate-first · mockup 05 (ป้าย/เหตุผลบนการ์ด 360) · หน้าตั้งค่าไม่มี mockup
> ข้อสอบ: `scripts/qc-crm-c2.8.mts` (**54 ข้อ** · S0 4 · S1–S7 20 · S8 7 · U 4 · X1 3 · X3 5 · X4 3 · X5 3 · X8 2 · X9 2 · CLEAN · FATAL) · ORACLE-EDIT 6 ข้อ (S2.1/S8.6 snapshot ก่อน event ถัดไป · S5.2 กฎ seed +15 ยิงด้วย = 2 log/21 · S8.2 fixture ต้องเป็นของ STAFF · X5.3 `maxBatches:1`+pacing แล้ว **detached+group-kill** เพราะ `pnpm exec tsx` มีหลาน) · ค้างจาก C2.1: ORACLE-EDIT `C2.1-S4.6` (ADJUST_SCORE +5 จริง)

## 1. ไฟล์ที่แตะ (26 ไฟล์ · +2,647/−45 ไม่รวม docs/inventory)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `crm/scoring.ts` (+1,158) · `scoring-shared.ts` (+191) · `scoring-job.ts` | ใหม่ | `seedSystemRules` 8 กฎ (idempotent · advisory lock) · CRUD/toggle/reorder/delete มี audit · `onEvent` = INSERT log แบบมีเงื่อนไข (`maxPerDay` ต่อวันไทย · unique `(ruleId,eventKey)` · NOT EXISTS) + bump `GREATEST(0, score+points)` คำสั่งเดียวใต้ `FOR UPDATE` ผู้ติดต่อ · ระดับ ร้อน/อุ่น/เย็น + event `crm.score.changed` (ไม่ยิงเมื่อ from===to) / `crm.score.threshold` ครั้งเดียวต่อการข้าม · `explain` · `recompute` (dry-run ไม่เขียน · จริง = ยิง changed/threshold `#recompute-<runId>`) · `adjust` (audit ใน tx เดียว) · `decay` claim `FOR UPDATE SKIP LOCKED` + reconcile **ใน tx เดียวต่อ batch** วนจนเงียบ (`maxBatches`) · `applyInactivity` (event เสมือน `crm.contact.inactive` ครั้งเดียวต่อช่วงนิ่ง) · ตัวเลือก event ของกฎ = `SCORE_BRIDGE_EVENTS ∪ crm.contact.inactive` |
| `crm-bridges/scoring.ts` (+96) · `index.ts` | ใหม่ | `onScoringEvent` ตัวเดียว เสียบใต้ compose ของทุก event ที่กฎอ้างได้ · gate-first (uiVersion 2 + bridgesEnabled) · event ไม่ระบุระบบ = ทุกระบบ CRM ที่เปิด · `crm.deal.quotation.issued` อ่าน `payload.contactId` |
| `outbox-consumers.ts` (+35) · `automation/labels.ts` (+19) · `automation-shared.ts` | แก้ | consumer `crm.score.changed`/`threshold`/`crm.deal.quotation.issued` + ต่อ `onScoringEvent` ใน chat/form/activity.completed/email ×3/web.identified · ป้าย 3 event · `CRM_RULE_TRIGGERS` ไม่ลิสต์ threshold ซ้ำ |
| `crm/automation.ts` (+73/−19) | แก้ | ขั้น `ADJUST_SCORE` ผ่าน `crm.scoring.adjust` · trigger `crm.score.threshold` จับ `params.band` · **ตัด cron poller ของ threshold** (ทางเดียว = event สด · คีย์ cron เดิมไม่ชนคีย์ live ⇒ เคยยิงซ้ำ) |
| `crm/deals.ts` (+12) | แก้ | ยิง `crm.deal.quotation.issued#<dealId>#<docId>` ใน tx ผูก `quotationDocId` · payload ids ล้วน |
| `crm-bridges/forms.ts` | แก้ | `FormDef.scoreOnSubmit` ผ่าน `adjust` ทางเดียว (eventKey `form#<subId>`) |
| `crm/settings.ts` (+54) · `crm/index.ts` · `nav.ts` · `app/layout.tsx` · `minute-jobs.ts` · `scripts/crm-cron.mts` | แก้ | ตั้งค่าเกณฑ์ระดับ `jsonb_set` คำสั่งเดียว · facade `crm.scoring` · เมนู/accordion หลัง `crm.score.manage` · งานรายวัน `crm.scoring.decay` |
| `settings/scoring/{page,actions}.tsx` · `components/crm/scoring/{CrmScoringManager,ContactScoreBadge,types}.tsx` · `contacts/[contactId]/page.tsx` | ใหม่/แก้ | หน้าตั้งค่ากฎ (390 ผ่าน `sm:min-w-[640px]`) · ป้าย `🔥 ร้อน 72` + "ทำไมถึงร้อน 72" + ชิป 3 เหตุผล + "ดูเหตุผลคะแนนทั้งหมด" (mockup 05) · inventory +32 แถว · `visual-crm.mts` spec "2.8" (สร้างข้อมูลผ่าน facade + คืนสภาพ) |

## 2. migration / seed / backfill — ไม่มี (R-C.1) · ไม่มี catch-up คะแนนก่อน v2

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด · เคยแดง | ✅ | 49/54 → (ORACLE-EDIT 5 + รอบแก้) 53/54 → (X5.3 group-kill) **54/54** QC2 Fable รันเอง |
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ✅ | unit `crm-c28c29-verify` (QC1) — §5 |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ✅ | §5 — 45 ชุดเขียว (m3.7 S6.2 = ENV) |
| D5 | typecheck · fitness ×2 | ✅ | §5 (builder: typecheck ต้อง heap 5120 · fitness 32/32 ×2) |
| D6 | build | ✅ | BUILD+serve exit 0 · c2.6-web 35/35 |
| D7 | ภาพ + PARITY | ⏳ | `.qc-shots/crm/2.8-*` vs mockup 05 (Fable ดูเอง) |
| D8 | testid + ทะเบียน | ✅ | +32 แถว · testid คงเดิมหลัง parity · F14.1/F14.2 |
| D9 | ผู้ตรวจอิสระ | ✅ | read-only (opus): **BLOCKER 3** — B1 decay claim นอก tx (คะแนนค้างถาวร · probe ก่อน/หลัง) · B2 threshold ยิงซ้ำ cron+live · B3 quotation event ไร้ตัวยิง/consumer · MAJOR 4 (audit adjust · recompute ไม่ยิง event · changed from===to · picker) · parity 3 — แก้ครบ · ตัดสินแดง 5 ข้อ = ข้อสอบ |
| D10 | เอกสาร/ทะเบียน | ✅ | event ใหม่ 3 ตัวมี consumer + ป้าย · docs regen (F13.11) · เว็บฮุคจาก spread |
| D11 | wo-notes + คืนสภาพ | ✅ | `qc-member-m1.9` 26/26 ×2 |
| D12 | push → deploy | ✅ | เจ้าของ push `session/crm` + `main` → `0d638f15` (25 ก.ย. ~05:56 UTC · ไม่มี migration ในช่วง 965c0bbd..0d638f15) · deploy ใหม่ขึ้นจริง 06:01:06 UTC (`dpl_FFKFz…` → `dpl_8aHf55…` ใน header `Link` ของ `/`) · smoke `/` `/login` `/api/health` 200 · health `db:true outboxPending:0` · prod `uiVersion` 1 ทุกร้าน (ไม่เปิด v2 ก่อน C6.1) |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 | ใช้ | `X1.1–X1.3` (ข้ามร้าน/ระบบ · explain ตาม visibility TEAM) |
| X2 | N-A | REST → C2.11 |
| X3 | ใช้ | `X3.1a–X3.4` (4 process 12 event = 60 พอดี · 50 ขนาน maxPerDay = 3 log) |
| X4 | ใช้ | `X4.1–X4.3` (ส่งซ้ำ/ขนาน = log เดียว · threshold ครั้งเดียว) |
| X5 | ใช้ | `X5.1–X5.3` (sweep ขนาน · ตายหลัง claim · SIGKILL กลางทาง → รอบถัดไปเก็บครบ ไม่นับซ้ำ) |
| X6 | N-A | ไม่ใช่เงิน (คะแนน ≥0 ด้วย GREATEST) |
| X7 | N-A | ไม่มี endpoint สาธารณะ |
| X8 | ใช้ | `X8.1–X8.2` (payload id/ตัวเลข/ระดับ · reason = ชื่อกฎ · คีย์ `<type>#<id>#…`) |
| X9 | ใช้ | `X9.1–X9.2` (audit ทุก mutation · adjust ใน tx) |
| X10 | N-A | ไม่มี |
| ร้าน uiVersion 1 | ใช้ | `U.1–U.4` (ไม่ให้คะแนน · sweep กรองใน SQL · แถวคงอยู่ · กลับ v2 ต่อได้) |

## 5. ผลข้อสอบ
**unit `crm-c28c29-verify` (QC1 seed ใหม่ · 25 ก.ย. 04:20–06:05 UTC · ALLDONE · main tree `809999fa` + C2.9 `56575407`):**
- `migrate diff (must be empty)`: exit=0 · `-`
- `gen-crm-api-docs (early · before m1.1)`: exit=0 · `-`
- `reseed member`: exit=0 · `-`
- `qc-member-m1.1`: exit=0 · `{"total":28,"passed":28,"findings":[]}`
- `seed crm #1`: exit=0 · `-`
- `seed crm #2`: exit=0 · `-`
- `DRAIN`: exit=0 · `{"total":4,"passed":4,"findings":[]}`
- `qc-crm-c2.8`: exit=0 · `{"total":54,"passed":54,"findings":[]}`
- `qc-crm-c2.9`: exit=0 · `{"total":52,"passed":52,"findings":[]}`
- `qc-crm-c2.8`: exit=0 · `{"total":54,"passed":54,"findings":[]}`
- `qc-crm-c2.9`: exit=0 · `{"total":52,"passed":52,"findings":[]}`
- `qc-crm-c2.1`: exit=0 · `{"total":84,"passed":84,"findings":[]}`
- `qc-crm-c2.2`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-c2.3`: exit=0 · `{"total":80,"passed":80,"findings":[]}`
- `qc-crm-c2.4`: exit=0 · `{"total":91,"passed":91,"findings":[]}`
- `qc-crm-c2.5`: exit=0 · `{"total":105,"passed":105,"findings":[]}`
- `qc-crm-c2.6`: exit=0 · `{"total":87,"passed":87,"findings":[]}`
- `qc-crm-c2.7`: exit=0 · `{"total":63,"passed":63,"findings":[]}`
- `qc-crm-c0.5`: exit=0 · `{"total":50,"passed":50,"findings":[],"unproven":[],"info":{"leaseStyle":"row lease (re-run at +16m)","dueMode`
- `qc-crm-c1.2b`: exit=0 · `{"total":93,"passed":93,"findings":[]}`
- `qc-crm-c1.4`: exit=0 · `{"total":110,"passed":110,"findings":[]}`
- `qc-crm-c1.5`: exit=0 · `{"total":103,"passed":103,"findings":[]}`
- `qc-crm-c1.6`: exit=0 · `{"total":79,"passed":79,"findings":[],"skippedChecks":[]}`
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
- `qc-member-fix-s3`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `qc-chat-core-v2`: exit=0 · `{"total":47,"passed":47,"findings":[]}`
- `qc-member-m3.7`: exit=1 · `{"total":23,"passed":22,"findings":[{"id":"M3.7-S6.2","sev":"CRITICAL"}]}`
- `qc-ticket-money`: exit=0 · `{"total":6,"passed":6,"findings":[]}`
- `qc-ticket-cancel`: exit=0 · `{"total":10,"passed":10,"findings":[]}`
- `qc-rental`: exit=0 · `{"total":11,"passed":11,"findings":[]}`
- `qc-rental-race`: exit=0 · `{"total":6,"passed":6,"findings":[]}`
- `qc-rental-refund`: exit=0 · `{"total":11,"passed":11,"findings":[]}`
- `qc-school`: exit=0 · `{"total":7,"passed":7,"findings":[]}`
- `qc-school-refund`: exit=0 · `{"total":11,"passed":11,"findings":[]}`
- `qc-hotel-money`: exit=0 · `{"total":5,"passed":5,"findings":[]}`
- `qc-hotel-refund`: exit=0 · `{"total":15,"passed":15,"findings":[]}`
- `qc-clinic`: exit=0 · `{"total":8,"passed":8,"findings":[]}`
- `qc-clinic-refund`: exit=0 · `{"total":13,"passed":13,"findings":[]}`
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
- `shots 2.8`: exit=0 · `{"wo":"2.8","user":"owner","shots":[".qc-shots/crm/2.8/crm-scoring-owner-desktop.png",".qc-shots/crm/2.8/crm-s`
- `qc-crm-c2.6-web (headless)`: exit=0 · `{"total":35,"passed":35,"findings":[]}`
- `serve stop`: exit=0 · `-`
- `qc-member-m1.9`: exit=0 · `{"total":26,"passed":26,"findings":[]}`

- `qc-member-m3.7` exit=1 = `M3.7-S6.2` ข้อภาพหน้าจอ (`act undefined` — ชุดรันก่อน BUILD+serve) · 22 ข้อฟังก์ชันรวมสัญญา consumer ผ่าน · รันซ้ำหลัง serve ขึ้นใน unit `crm-c28-shots2` (ดูด้านล่าง)

**unit `crm-c28-shots2` (QC1 · เซิร์ฟเวอร์ขึ้นจาก .next เดิม):** serve start exit=0 · shots 2.8 owner 6/6 ภาพ (หน้าตั้งค่า · ตัวแก้กฎ · **การ์ด 360 คะแนน** desktop+mobile) exit=0 · shots 2.8 manager 6/6 exit=0 · `qc-member-m3.7` 22/23 (S6.2 อ่าน `.qc-shots/member/3.7/summary-*.json` ของ visual-member ที่ไม่มีใน seed รอบนี้ = ENV ไม่ใช่โค้ด · 22 ข้อฟังก์ชันเขียว) · serve stop · `qc-member-m1.9` 26/26

## 6. PARITY (Fable ดูเอง)
- **PARITY: ผ่าน** — `.qc-shots/crm/2.8/crm-contact-360-score-owner-{desktop,mobile}.png` vs `ledger/design-crm/05-contact-360-convert.png`: ป้าย `🔥 ร้อน 72` ในแถวชิปหัวการ์ด ✅ · ชิป 3 เหตุผล "+15 นัดพบ/โทรคุยเสร็จ · 2 วันก่อน · +10 … · +5 …" ✅ (ข้อความ = ชื่อกฎจริง) · หัว "ทำไมถึงร้อน 72" + "ดูเหตุผลคะแนนทั้งหมด" (เปิดแล้วเห็น 4 แถวพร้อมวันหมดอายุ) ✅ · mockup วาง "ทำไมถึงร้อน 72 / ดู" ไว้ใน panel ผู้ช่วย AI ด้วย — panel นั้นเป็นของใบ AI ภายหลัง (ตอนนี้ placeholder) ไม่ใช่ขอบเขต C2.8 · ชิป "เป็นสมาชิก Gold / PROSPECT / QUALIFIED" = C1.4/สมาชิก ไม่ใช่ใบนี้ · มือถือ 390 ไม่ล้น
- หน้าตั้งค่า `/crm/settings/scoring` + ตัวแก้กฎ: ไม่มี mockup · ดูแล้วเรียบร้อย (ระดับคะแนน · คำนวณใหม่ · ตารางกฎ 8 ข้อ + ฟอร์มเพิ่มกฎ · มือถือไม่ล้น)


## 6. ติดตาม
- decay tx timeout 180 s ที่ batchSize 500 ยังไม่วัดบนร้านใหญ่ (timeout = retry ไม่ใช่ข้อมูลหาย)
- กฎ template ต่อธุรกิจ (`crm.deal.won` ฯลฯ ใน `templates/business/*`) ยังไม่มีใคร materialise — เมื่อ WO ไหน seed ต้องขยาย SCORE_BRIDGE_EVENTS + consumer พร้อมกัน
