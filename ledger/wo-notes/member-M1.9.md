# WO M1.9 — tiers engine (D1): TierDef/benefits/กฎ (AutomationRule scope MEMBER_TIER) · evaluate · runTierReview · manual+approval · archive · events · cron · โน้ตของ builder

> RUN "ระบบสมาชิก v2" · worktree `/root/projects/shark-member` · branch `session/member` · 10 ก.ย. 2569
> สัญญา: `ledger/MEMBER-RUN.md` §2 M1.9 · พิมพ์เขียว `docs/modules/06-member-v2.md` §4.3 §5.4 §7.1 §7.3 §7.5 §11.3 §11.9
> ข้อสอบ: `scripts/qc-member-m1.9.mts` (26 ข้อ · **ไม่ได้แตะแม้แต่บรรทัดเดียว**)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/member/tiers.ts` | **ใหม่ (1,434 บรรทัด)** | `listTierDefs` `createTierDef` `updateTierDef` `reorderTierDefs` `archiveTierDef` · `setBenefits` `benefitsFor` · `setTierRules` `getTierRules` · `evaluateMember` `applyTierChange` `evaluateAndApply` `runTierReview` · `setManualTier` `applyManualTierApproved` · `onTierChanged` hook · `nextReviewAt` |
| `src/lib/modules/member/index.ts` | แก้ (facade) | export `benefitsFor` `evaluateAndApply` `runTierReview` `evaluateMember` `applyManualTierApproved` `onTierChanged` + ชนิดข้อมูล 12 ตัว |
| `src/lib/modules/member/profile.ts` | แก้ | `getMember360().tier.next` เติมจริงจาก `tiers.evaluateMember(..., { noCache: true })` (**ปิดหนี้ M1.4**) · ห่อ try/catch (เอนจินระดับล้ม = หน้า 360 ยังเปิดได้) |
| `src/lib/outbox-consumers.ts` | แก้ | consumer `member.tier.changed` / `member.tier.at_risk` (no-op ห้ามล้ม + คอมเมนต์ว่าทำไม) |
| `src/lib/automation/labels.ts` | แก้ | `AUTOMATION_EVENTS` + 2 ตัว (ป้ายไทย) — spread ต่อเข้า `WEBHOOK_EVENTS` เอง จึงไม่ประกาศซ้ำที่ `webhooks/labels.ts` |
| `src/lib/approval-effects.ts` | แก้ | เคส `member.tier.manual` (อ่าน systemId จาก ApprovalRequest → `member.applyManualTierApproved`) · ปฏิเสธ = ปิดแถวคำขอไว้เป็นหลักฐาน ไม่แตะระดับ |
| `src/lib/platform/cron.ts` | แก้ | `sweepTierReviews()` (ทุก AppSystem type MEMBER active · try/catch **รอบร้าน**) + step `tierReviews` ใน `runDailyCron` (try/catch แยกอีกชั้น) + คีย์ `tierReviews` ใน summary |
| `src/lib/automation/engine.ts` | แก้ 1 where | `runForEvent` กรอง `scope: "KANBAN"` เพิ่ม (ดู §4 ข้อ 5) |
| `src/lib/automation/service.ts` | แก้ 1 where | `listRules` กรอง `scope: "KANBAN"` เพิ่ม (ดู §4 ข้อ 5) |

**ไม่ได้แตะ**: `scripts/qc-member-*.mts` · `member-qc-env.mts` · `visual-member.mts` · `qc-all.mts` · `.env*` · `prisma/**` (ใบนี้ไม่มี migration — คอลัมน์/ตารางครบตั้งแต่ `member_v2_a`) · `scripts/member-backfill-tiers.mts` (**ไม่ต้องแก้** — ดู §4 ข้อ 1) · ไม่มี `git add/commit/push` · ไม่มี `next build/dev`

**หมายเหตุ**: `ledger/MEMBER-RUN.md` · `scripts/visual-member.mts` · `scripts/qc-member-m1.6.mts` ขึ้นใน `git status` ตั้งแต่ก่อนเริ่มงาน (งานเตรียม oracle ของ Fable) — builder ไม่ได้แก้

---

## 2. ผลข้อสอบ

```
pnpm exec tsx scripts/qc-member-m1.9.mts
🟢 M1.9: 26/26
JSON_SUMMARY {"total":26,"passed":26,"findings":[]}
```

ผ่านครบ S1.1–S7.3 (evaluate 6 · เลื่อนทันที 2 · รอบทบทวน 6 · manual+approval 4 · archive 2 · benefits 3 · events/cron/legacy 3)

## 3. Regressions

| ชุด | ผล |
|---|---|
| `qc-member-m1.4` | 🟢 **37/37** |
| `qc-member-m1.2` | 🟢 **27/27** |
| `qc-kanban-k2.9` | 🟡 **25/26** — ตกเฉพาะ `K2.9-S11.7` (ต้องมีภาพจริง ≥ 4 ใบใน `.qc-shots/kanban/2.9`) = ข้อภาพที่ builder ถ่ายไม่ได้ (ห้าม build) · ข้อกฎอัตโนมัติทั้งหมดเขียวเท่าเดิม |
| `qc-member-tier` (v1) | 🟢 **7/7** |
| `qc-point` | 🟢 **18/18** |
| `tsc --noEmit` (`NODE_OPTIONS=--max-old-space-size=3584`) | 🟢 exit 0 |
| `fitness.mts` (มี env) | 🟢 **23/23** |
| `fitness.mts` (ไม่มี env · `env -u DATABASE_URL -u DIRECT_URL`) | 🟢 **23/23** |

**ไม่ได้รัน** `qc-member-m1.1` (28 ข้อ · ~7 นาที) — ตามสัญญาใบงานให้รันเฉพาะเมื่อแก้ `member-backfill-tiers.mts` ซึ่ง**ไม่ได้แก้** (§4 ข้อ 1)

---

## 4. ข้อตัดสิน (พร้อมเหตุผล)

1. **ไม่แก้ `member-backfill-tiers.mts` — ทำให้ `getTierRules` อ่านรูปที่ backfill เขียนไว้แทน**
   backfill เขียน `conditions = [{field, op, value}]` โดยไม่มี `match` และรันลง **prod ไปแล้ว** (10 ก.ย. · TierDef 24 · กฎ 18 ใบ)
   ⇒ ถ้าเปลี่ยนรูปแบบต้องไล่ migrate ข้อมูลกฎบน prod โดยไม่ได้อะไรเพิ่ม · `parseStoredRule()` จึงอ่าน
   `match` จาก `actionConfig.match` → ถ้าไม่มีก็ `conditions[0].match` → ไม่มีอีกก็เป็น `"ALL"` (ค่าที่ backfill ตั้งใจ)

2. **`match` เก็บที่ `AutomationRule.actionConfig.match`** (ไม่ใช่ `conditions[0].match`)
   เหตุผล: `conditions` ต้องคงรูป "รายการเงื่อนไขล้วน" ให้ตัวสร้างกฎของ M1.10 และ backfill ใช้ร่วมกันได้
   `actionConfig` เป็น placeholder `{}` อยู่แล้วตามคอมเมนต์ใน `automation.prisma` (แบบเดียวกับ K2.9)
   → เก็บ `{ match, tierRuleKind }` ที่นั่นไม่ชนกับใคร

3. **กฎคงระดับที่ไม่ได้ตั้ง = ใช้กฎเลื่อนเข้าระดับนั้นเองเป็นเกณฑ์คง** (`effectiveKeepRule`)
   ข้อสอบ `S2.2` บังคับว่า สมาชิก gold ที่ยอดกลายเป็น 0 ต้องได้ `wouldDowngradeTo = member` **ทั้งที่ gold ยังไม่มี keep rule**
   ⇒ ความหมายที่สมเหตุผลเดียวคือ "ยังเข้าเกณฑ์ที่ทำให้ได้ระดับนี้อยู่ไหม" · ถ้าตีความว่า "ไม่มีกฎคง = คงตลอดไป"
   ระดับทั้ง 18 ใบที่ backfill สร้างบน prod จะไม่มีวันถูกทบทวนเลยแม้แต่ครั้งเดียว

4. **นิยาม `visits12m` = จำนวน "วันที่ไม่ซ้ำกัน"** ที่มีบิล PosSale PAID (paidAt) หรือนัด Appointment DONE/CONFIRMED ที่ถึงเวลาแล้ว
   (ไม่ใช่จำนวนบิล — จ่าย 3 บิลในวันเดียว = มาร้าน 1 ครั้ง · ไม่ใช้ `MemberActivity type VISIT` เพราะโมดูลที่เขียนแถวนั้นยังไม่ครบทุกทางเข้า → M3.7)

5. **เอนจินกฎอัตโนมัติเดิม "รั่ว" จริง → ปิดที่ 2 จุด**
   - `automation/engine.ts#runForEvent`: where เดิม `{ event, enabled, boardId: null }` — กฎ MEMBER_TIER มี `boardId = null`
     จึง**อยู่ในขอบเขตที่มันเห็น** วันนี้ยังไม่ยิงเพราะกฎระดับใช้ `event = ""` (ไม่มี outbox event ชนิดนี้)
     แต่เป็นความปลอดภัยโดยบังเอิญ — พอ M3.3 ใส่ `event` จริงให้ journey เมื่อไร จะยิงแจ้งเตือนมั่วทั้งร้านทันที
   - `automation/service.ts#listRules`: where เดิมไม่กรองอะไรเลย ⇒ หน้าตั้งกติกาเดิมของร้านจะโชว์
     "เลื่อนเป็น Gold อัตโนมัติ" ปนมา แล้วเจ้าของกดลบทิ้งได้โดยไม่รู้ว่าเป็นกฎของระบบสมาชิก
   ⇒ เพิ่ม `scope: "KANBAN"` ทั้งสองที่ ตามคอมเมนต์ที่ enum `AutomationScope` เขียนไว้แล้ว ("ทุกขาอ่านของ v1 กรอง scope = KANBAN")
   ฝั่ง `kanban/automation.ts` **ไม่รั่ว** — ทุก `automationRule.findMany` ผูก `boardId` (ค่าจริง หรือ `{ not: null }`) อยู่แล้ว จึงไม่ต้องแก้
   (`qc-automation.mts` สร้างกฎผ่าน `createRule` ซึ่ง `scope` ตกเป็น `KANBAN` โดย default ⇒ ไม่กระทบ — ตรวจแบบอ่านโค้ด ดู §6)

6. **คำขอ "ตั้งระดับด้วยมือ" ที่รออนุมัติ เก็บเป็นแถว `MemberTierHistory`** (reason MANUAL · `approvalRequestId` · `evidence.pending = true`)
   ไม่ใช้ AuditLog เพราะตารางนี้มีคอลัมน์ `approvalRequestId` เตรียมไว้ให้พอดี และคนที่เปิดแท็บ "ประวัติระดับ" ควรเห็นว่า
   "มีคำขอค้างอยู่" · แถว pending ถูก**กันออก**จากการคิด `manualUntil` (`manualLockOf`) เพราะยังไม่มีผล
   idempotent: `applyManualTierApproved` ปิดแถว (`pending = false`) ก่อนใช้ระดับ ⇒ drain ซ้ำ/replay ไม่ตั้งซ้ำ

7. **`runTierReview` — `evaluated` นับต่างกันตามโหมด**
   - ไม่ส่ง `customerIds` = รอบจริง: `evaluated` = จำนวนสมาชิก ACTIVE ที่ `tierReviewAt ≤ now` (ตรงกับที่ `S3.6` เทียบกับ DB)
     คนที่ **ใกล้**ถึงรอบ (แจ้งล่วงหน้า) ถูกดึงมาอีกชุดหนึ่งต่างหาก และ**ไม่นับ**ใน `evaluated` — ไม่งั้นผลรวมถังจะเกิน `evaluated`
   - ส่ง `customerIds` = ทดลองรัน/หน้าจอ: ประเมิน**ทุกคนที่ส่งมา**ไม่ว่าถึงรอบหรือยัง (`S4.2` บังคับให้คนที่ถูกล็อกมือไว้
     และยังไม่ถึงรอบ ต้องออกมาเป็น `skipped`)

8. **`nextReviewAt()` แปล `reviewCron` แบบง่าย** = วันที่ 1 ของเดือนถัดไป 03:00 เวลาไทย (20:00 UTC ของวันสุดท้ายเดือนก่อน)
   ผลลัพธ์มากกว่า `from` เสมอ (กันทบทวนซ้ำในรอบเดียวกันไม่รู้จบ) · ตัวแปล cron เต็มรูปแบบเป็นงานของ M1.10

9. **ลำดับการตัดสินในรอบทบทวน**: ล็อกมือ / แบบเสียเงิน → `skipped` · แล้วจึง **เลื่อนขึ้นก่อน** (ถ้าเข้าเกณฑ์ระดับสูงกว่า)
   → คงระดับ → เสี่ยง (ครั้งแรก) → ลด (หลังผ่อนผัน) · "เคยเตือนแล้วหรือยัง" ดูจากแถว `RULE_KEEP` ที่ `evidence.atRisk = true`
   ซึ่งเกิด **หลัง `tierSince`** (เปลี่ยนระดับ = เริ่มนับรอบใหม่)

10. **`applyTierChange` ไปยังระดับเดิม = `{ changed: false }` เงียบ ๆ** (ไม่เขียนประวัติ ไม่ยิง event) แต่ **`setManualTier` โยนทิ้ง**
    พร้อมข้อความไทย — คนละเจตนา: ตัวแรกเป็น API ภายในที่ควรเรียกซ้ำได้ ตัวหลังคือคนกดปุ่มที่ควรได้รู้ว่ากดผิด

---

## 5. ข้อแย้ง / สิ่งที่ข้อสอบสอนให้แก้ (ไม่ได้แก้ข้อสอบ — แก้โค้ดของตัวเอง)

ไม่มีข้อแย้งกับข้อสอบ · แต่มี **2 เรื่องที่รอบแรกตก แล้วพบว่าโค้ดของ builder ผิดจริง** บันทึกไว้เป็นบทเรียน:

1. **`M1.9-S1.2` ตก: `memberDays` ได้ 0 แต่ข้อสอบคาด −12**
   รอบแรกเขียน `Math.max(0, …)` กันค่าติดลบ · ชุดข้อมูล QC ใช้วันอ้างอิง `MQC.today = 2026-09-30` (อีก 20 วันข้างหน้า)
   ⇒ `Customer.createdAt` ของสมาชิกที่ seed อยู่ใน**อนาคต** และ `memberDays` ที่ถูกต้อง = ค่าติดลบ
   **ตัดสิน: เอา clamp ออก** — ไม่ใช่เพื่อให้ข้อสอบผ่าน แต่เพราะการกลืนค่าติดลบให้เป็น 0 = ซ่อนข้อมูลที่เพี้ยน
   (ร้านที่นำเข้าลูกค้าพร้อมวันสมัครผิดจะได้กฎ "อายุสมาชิก" ที่ตัดสินจากตัวเลขปลอมโดยไม่มีใครเห็น)

2. **`M1.9-S3.1` ตก: `spent12m` เป็น 0 ทั้งที่บิล 35,000 บาทอยู่ครบ**
   รอบแรกกรองบิลด้วย `paidAt: { gte: since12, lte: now }` · `now` ของรอบทบทวนถูกตรึงไว้ตอนต้นข้อสอบ
   ส่วนบิลถูกสร้างหลังจากนั้น ⇒ `paidAt > now` แล้วหลุดออกจากยอด
   **ตัดสิน: ตัดขอบบนของบิลออก** (คงไว้เฉพาะฝั่ง "นัด") — บิลที่ปิดแล้วคือเงินที่ร้านได้รับจริง ต่อให้วันที่บนบิล
   ถูกคีย์ล่วงหน้า ก็ต้องนับเข้ายอดของลูกค้า · ตรงข้ามกับ "นัด" ที่ต้องถึงเวลาแล้วจริงถึงจะเรียกว่า "มาใช้บริการ"
   (คอมเมนต์เหตุผลไว้ที่ `collectEvidence` ทั้งสองจุดแล้ว)

---

## 6. หนี้ / เรื่องที่ Fable ต้องรู้

1. **`qc-cron.mts` · `qc-automation.mts` · `qc-ai-automation.mts` ยังใช้ `process.loadEnvFile(".env")` = prod จริง**
   builder **ไม่ได้รัน**ทั้งสามชุดตามกติกา ⇒ ตรวจผลกระทบด้วยการอ่านโค้ดแทน:
   - `qc-automation`: สร้างกฎผ่าน `createRule` ซึ่งไม่ตั้ง `scope` → ตกเป็น `KANBAN` → ผ่านตัวกรองใหม่ทั้ง `listRules` และ `runForEvent`
   - `qc-cron`: สัญญาที่หัวไฟล์ระบุคีย์ `{ subsExpired, proposalsExpired, outboxDrained }` ซึ่งยังอยู่ครบ (เพิ่ม `tierReviews` เป็นคีย์ใหม่)
   - ผลของ `sweepTierReviews` บน prod วันนี้ = **ไม่ทำอะไร**: `member-backfill-tiers` ไม่ได้ตั้ง `tierReviewAt` ให้ใคร (ยัง null ทุกคน)
     ⇒ รายชื่อ "ถึงรอบ" ว่างเปล่า · สมาชิกจะเริ่มมี `tierReviewAt` ก็ต่อเมื่อระดับถูกเปลี่ยนครั้งแรกผ่านเอนจินใหม่
   🔴 เสนอ: ย้าย 3 ชุดนี้ไป `loadQcEnv()` แบบเดียวกับที่ M1.1 ทำกับอีก 3 ชุด (งานของ Fable — builder ห้ามแตะ `.env`)

2. **welcome voucher ยังเป็น stub** — `onTierChanged()` เป็น hook registry ที่ยังไม่มีใครสมัคร · M2.5 (voucher) มาต่อท้ายที่นี่
   ผ่าน composition root แบบเดียวกับ `member.onMerge` ของ M1.4

3. **แจ้งเตือนลูกค้ายังไม่มี** — `member.tier.changed` / `member.tier.at_risk` มี consumer no-op ครบ 3 ทะเบียนแล้ว
   ข้อความถึงลูกค้า ("คุณขึ้นเป็น Gold แล้ว" / "อีก 30 วันจะหลุดระดับ") เป็นงาน **M3.6**

4. **`benefitsFor` ยังไม่มีใครเรียกใช้จริง** — จุดใช้งานคือ M2.7 (wallet facade) และ M2.8 (แผงสิทธิ์ที่หน้าขาย ·
   คอลัมน์ `PosSale.tierDiscountSatang` ที่ M1.1 เตรียมไว้ยังเป็น 0 ทุกใบ)

5. **`paidPlanId` ของ TierDef ยังไม่ถูกใช้ตัดสินอะไร** — วันนี้ "แบบเสียเงิน" ตัดสินจาก `MemberSubscription` ACTIVE ตรง ๆ
   (ไม่ผูกกับว่า subscription ใบนั้นเป็นแพ็กเกจของระดับไหน) · หน้าจอผูกแพ็กเกจ↔ระดับเป็นงาน M1.10

6. **`updateTierDef` / `reorderTierDefs` ยังไม่มีหน้าจอ** — เขียนไว้ครบตามสัญญาแล้ว รอ M1.10 มาต่อ UI

7. **ยังไม่มี op REST/AI ของระดับ** — M1.11 (`test: "M1.9-Sx.y"` ของทุก op ต้องอ้างข้อสอบใบนี้ได้)

---

## 7. คืนสภาพชุดข้อมูล QC

ข้อสอบคืนสภาพเองใน `finally` (กฎ platinum/silver/gold · benefits ของ gold · สมาชิก X/Y/Z + บิล + party ·
ระดับชั่วคราว · นโยบายอนุมัติ + คำขอ · subscription · outbox `member.*` ที่ DONE) — ตรวจหลังรันแล้ว:

| ของ | ก่อน | หลัง |
|---|---|---|
| `MemberTierDef` (ไม่ archive) ในระบบ QC | 4 | 4 (member/silver/gold/platinum) |
| `getTierRules(gold).upgrade` | `spent12m ≥ 3,000,000` (ALL) | เท่าเดิม |
| `getTierRules(gold).keep` | `null` | `null` |
| `getTierRules(silver).upgrade` | `spent12m ≥ 1,000,000` | เท่าเดิม |
| `MemberTierConfig` (v1) | 3 แถว | 3 แถว (ไม่ถูกแตะ — `S7.3` ยืนยัน) |
| สมาชิกในระบบ | 60 (30/15/10/5) | 60 (30/15/10/5 — `S1.1` ของรอบถัดไปยืนยัน) |

หลักฐาน: รัน `qc-member-m1.9` **2 รอบติด** (รอบแรก 24/26 · รอบสอง 26/26) และ `S1.1` (ซึ่งเทียบ `memberCount 30,15,10,5`
และกฎของ gold แบบเป๊ะ) เขียวทั้งสองรอบ ⇒ finally คืนของครบจริง · ตามด้วย `qc-member-m1.4` 37/37 และ `qc-member-m1.2` 27/27
บนชุดข้อมูลเดิมโดยไม่ต้อง reseed

---

## 8. เวลา

เริ่มอ่านสัญญา/ข้อสอบ → ส่งมอบ: **~1 ชม. 20 นาที** (อ่าน+ออกแบบ ~35 นาที · เขียนโค้ด ~20 นาที ·
ข้อสอบ 2 รอบ + regressions 5 ชุด + tsc + fitness ×2 ~25 นาที) · งานหนักรันทีละ 1 ตลอด (เครื่อง 2 คอร์) ·
ไม่มี `next build/dev` · ไม่มี `git add/commit/push`
