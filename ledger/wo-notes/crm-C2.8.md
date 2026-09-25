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
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ⏳ | unit `crm-c28c29-verify` (QC1) — §5 |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ⏳ | §5 |
| D5 | typecheck · fitness ×2 | ⏳ | §5 (builder: typecheck ต้อง heap 5120 · fitness 32/32 ×2) |
| D6 | build | ⏳ | §5 |
| D7 | ภาพ + PARITY | ⏳ | `.qc-shots/crm/2.8-*` vs mockup 05 (Fable ดูเอง) |
| D8 | testid + ทะเบียน | ✅ | +32 แถว · testid คงเดิมหลัง parity · F14.1/F14.2 |
| D9 | ผู้ตรวจอิสระ | ✅ | read-only (opus): **BLOCKER 3** — B1 decay claim นอก tx (คะแนนค้างถาวร · probe ก่อน/หลัง) · B2 threshold ยิงซ้ำ cron+live · B3 quotation event ไร้ตัวยิง/consumer · MAJOR 4 (audit adjust · recompute ไม่ยิง event · changed from===to · picker) · parity 3 — แก้ครบ · ตัดสินแดง 5 ข้อ = ข้อสอบ |
| D10 | เอกสาร/ทะเบียน | ✅ | event ใหม่ 3 ตัวมี consumer + ป้าย · docs regen (F13.11) · เว็บฮุคจาก spread |
| D11 | wo-notes + คืนสภาพ | ⏳ | `qc-member-m1.9` ใน unit |
| D12 | push → deploy | ⏳ | รอเจ้าของ push (เติม hash + dpl หลัง deploy) |

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
_(รอ unit `crm-c28c29-verify` บน QC1 — เติมหลังรัน)_

## 6. ติดตาม
- decay tx timeout 180 s ที่ batchSize 500 ยังไม่วัดบนร้านใหญ่ (timeout = retry ไม่ใช่ข้อมูลหาย)
- กฎ template ต่อธุรกิจ (`crm.deal.won` ฯลฯ ใน `templates/business/*`) ยังไม่มีใคร materialise — เมื่อ WO ไหน seed ต้องขยาย SCORE_BRIDGE_EVENTS + consumer พร้อมกัน
