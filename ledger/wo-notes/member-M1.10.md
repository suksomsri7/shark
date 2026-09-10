# WO M1.10 — ระดับ UI: บันได · ตัวสร้างกฎ (scope MEMBER_TIER) · benefits editor 10 ชนิด · ทดลองรัน · ประวัติ · แบบเสียเงิน · ตัวอย่างบัตร LINE (ภาพ 04 · 15) — โน้ตของ builder

> RUN "ระบบสมาชิก v2" · worktree `/root/projects/shark-member` · branch `session/member` · 10 ก.ย. 2569
> สัญญา: `ledger/MEMBER-RUN.md` §2 M1.10 · พิมพ์เขียว `docs/modules/06-member-v2.md` §3.4 §4.3 §5.4 §6.1 §7.3 §11.3 §12
> ข้อสอบ: `scripts/qc-member-m1.10.mts` (13 chk · S1–S2 = โค้ด 8 ข้อ · S3.x = ภาพ 4 ข้อ เว้นให้ Fable)
> โหมดขนาน: worktree นี้มี builder อื่นทำงานพร้อมกัน (M1.6 สมัคร/นำเข้า · M1.8 ช่องทางที่มา) — แตะเฉพาะไฟล์ของใบนี้ตามสัญญา

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/member/tiers-actions.ts` | **ใหม่** | `"use server"` — 9 action พอดี (`createTierDefAction` `updateTierDefAction` `reorderTierDefsAction` `archiveTierDefAction` `setBenefitsAction` `setTierRulesAction` `dryRunAction` `reviewNowAction` `setManualTierAction`) · ด่านเดียว `gate(systemId,key)` = requireTenant → `canReadMember`+`assertCan` (ชั้น 1) → `hasMemberPerm(actor,key)` (ชั้น 2 · `member.tier.manage` ปกติ · `member.tier.setManual` เฉพาะ `setManualTierAction`) → ยืนยันระบบเป็น MEMBER ของร้านนี้ · เรียก `./tiers` เท่านั้น (ไม่แตะ `prisma.memberTier*` — มีแตะ `prisma.appSystem`/`prisma.customer` เพื่อยืนยันขอบเขตร้าน/หารายชื่อ ACTIVE ป้อน `runTierReview`) · ทุกฟังก์ชันคืน `{ok,data}\|{ok:false,reason}` ผ่าน `safeReason` |
| `src/app/app/sys/[id]/member/tiers/page.tsx` | **แทนที่ทั้งไฟล์** | เดิมเป็นหน้า v1 (`MemberTiersSection`/`ModuleTabs`) — แทนที่ด้วยหน้า v2 เต็ม: `requireTenant`→ระบบ MEMBER→`canReadMember`(ไม่มี=notFound)→`listTierDefs`+`getTierRules`(ของระดับที่เลือกจาก `?tier=`)+ประวัติ 20 แถว (`prisma.memberTierHistory` join ชื่อสมาชิก+ระดับเอง เพราะตารางนี้ไม่มีคอลัมน์ systemId)+`prisma.memberPlan`(แบบเสียเงิน) แบบขนาน → render `TierLadder`+`TierRuleBuilder`+`TierDryRun`(เฉพาะ canManage)+การ์ด "สมาชิกแบบเสียเงิน"(inline)+`TierHistory` |
| `src/app/app/sys/[id]/member/tiers/[tierId]/page.tsx` | **ใหม่** | หน้าแก้ระดับ 1 ใบ — โฟลเดอร์ `[tierId]` (ไม่ใช่ `[id]` ซ้ำกับ `/member/tiers/[id]` ชั้นนอก — Next ห้าม ตามบทเรียน M1.5) · โหลด `listTierDefs(includeArchived)`หา tier ที่ตรง (ไม่พบ=notFound) + `prisma.memberPlan` → render `TierBenefitsEditor` |
| `src/components/member/TierLadder.tsx` | **ใหม่** | บันได 4 การ์ด (`tiers-ladder`/`tiers-tier-{key}`) + สิทธิ์ 3 ข้อแรกย่อ + ปุ่มเลื่อนลำดับซ้าย/ขวา (`reorderTierDefsAction`) + เก็บเข้าคลัง (mini-dialog เลือก `moveToTierId` + `archiveTierDefAction`) + เพิ่มระดับ (`tiers-add` + `createTierDefAction` เพดาน `MEMBER_LIMITS.tiers`) |
| `src/components/member/TierRuleBuilder.tsx` | **ใหม่** | ตัวสร้างกฎ (`tiers-rule-builder`/`tiers-rule-upgrade`/`tiers-rule-keep`) — 8 ฟิลด์จาก `tiers.ts#RULE_FIELDS` (ป้ายไทย) + ALL/ANY + `windowMonths` + op 5 ชนิด + `graceDays`/`notifyBeforeDays` → `setTierRulesAction` |
| `src/components/member/TierBenefitsEditor.tsx` | **ใหม่** | หน้า `/tiers/[tierId]`: ซ้าย "ระดับ" (ชื่อ/สี/ไอคอน/ลำดับ+/−/คำอธิบาย/แบบเสียเงิน+`paidPlanId`) · กลาง "สิทธิประโยชน์" 10 ชนิด (`tiers-benefits`/`tiers-benefit-{type}` จาก `BENEFIT_REGISTRY`) · ขวา `TierCardPreview` สด · ปุ่มเดียว "บันทึก" ยิง `updateTierDefAction`+`setBenefitsAction` พร้อมกัน |
| `src/components/member/TierDryRun.tsx` | **ใหม่** | ปุ่ม "ทดลองรันได้" (`tiers-dryrun`/`tiers-dryrun-run`/`tiers-dryrun-result`) → `dryRunAction` (ประเมินสมาชิก ACTIVE ทุกคนทันที ไม่รอถึงรอบ) + ปุ่ม "ประเมินทั้งร้านตอนนี้" ผ่าน `ConfirmDialog` จริง → `reviewNowAction` (บันทึกจริง) |
| `src/components/member/TierCardPreview.tsx` | **ใหม่** | ตัวอย่างบัตร LINE (`tiers-card-preview`) — รับ state สดจาก `TierBenefitsEditor` (ไม่ต้องบันทึกก่อนก็เห็นตัวอย่าง) |
| `src/components/member/TierHistory.tsx` | **ใหม่** | ตารางประวัติ 20 แถว (`tiers-history`) — เหตุผลไทยจาก `TierChangeReason` + สรุป `evidence` (MANUAL/archive ใช้ `evidence.reason` ตรง ๆ · กฎอัตโนมัติสร้างประโยคจาก `spent12m`/`visits12m`/`shortfall`) + ป้าย ส่งแล้ว/รอส่ง/รออนุมัติ |
| `src/lib/modules/member/access.ts` | **ไม่แตะ** | `hasMemberPerm` มีอยู่แล้วตั้งแต่ M1.3 — ตรวจแล้วว่าครบตามที่ M1.10 ต้องการ ไม่ต้องเพิ่ม |
| `src/lib/modules/member/nav.ts` | แก้ 1 บรรทัด | `key: "tiers"` → `status: "ready"` (ตัด `wo:"M1.10"`) ตามสัญญา — ไม่แตะบรรทัดอื่น |
| `src/components/member/MemberIcon.tsx` | แก้ (เพิ่ม 3 ไอคอน) | `bolt` (กฎ) · `chat` (บัตร LINE) · `card` (แบบเสียเงิน — ประกาศไว้เผื่อใช้ แต่ยังไม่ได้เรียกในหน้านี้ ไม่กระทบอะไร) |

**ไม่ได้แตะ**: `tiers.ts` `profile.ts` `list.ts` `sources.ts` (ตามข้อห้าม) · `scripts/qc-member-*.mts` · `member-qc-env.mts` · `visual-member.mts` · `qc-all.mts` · `.env*` · ไม่มี `git add/commit/push` · ไม่มี `next build/dev`

**ไฟล์อื่นที่ขึ้นใน `git status` แต่ไม่ใช่ของใบนี้** (builder คู่ขนาน M1.6/M1.8 กำลังทำอยู่จริงระหว่างรัน): `member-M1.8.md` `qc-member-m1.8.mts` `qc-member-m1.11/12.mts` `member/import.ts` `sources.ts` `sources-actions.ts` `duplicates-actions.ts` `members-actions.ts` `MemberRegisterForm.tsx` `MembersImportWizard.tsx` `SourcesSettings.tsx` `import/page.tsx` `members/import/` `members/new/` `settings/sources/` `member_v2_b3` migration · `ledger/MEMBER-RUN.md` `prisma/schema/member.prisma` (แก้โดยคนอื่น) — ไม่ได้แตะสิ่งเหล่านี้แม้แต่บรรทัดเดียว

---

## 2. ผลข้อสอบ M1.10 (13 chk)

```
🟢 S1.1 tiers-actions.ts สัญญาไฟล์/gate ครบ
🟢 S1.2 access.ts hasMemberPerm ตาราง §6.1
🟢 S1.3 page.tsx โหลดข้อมูลครบ + notFound + ปุ่มแก้ตาม hasMemberPerm
🟢 S1.4 testid ครบ 15 · ไม่มีอีโมจิ/hex · MemberTabs+PageHeader · nav.ts ready
🟢 S2.1 ตัวสร้างกฎ 7 ฟิลด์ (spent12m/visits12m/tierPoints/memberDays/paidPlan/referrals) + ALL/ANY + windowMonths
🟢 S2.2 benefits editor 10 ชนิดครบ + ฟอร์ม config + สวิตช์ active + setBenefitsAction
🟢 S2.3 ทดลองรัน + ประเมินทั้งร้าน(ConfirmDialog) + ประวัติ
🟢 S2.4 บันได/เพิ่ม/เรียง/archive/moveToTierId/paid plan/card preview
⬜ S3.1–S3.3 ภาพ — ต้อง build QC server ถ่ายภาพ (ห้าม builder build) → งานของ Fable
⬜ S3.4 parity — เว้นให้ Fable ตรวจด้วยตา

🔴 M1.10: 8/12 (S1–S2 ครบ 8/8 · S3.x ภาพ 4 ข้อเว้นให้ Fable ตามกติกา §0.1)
JSON_SUMMARY {"total":12,"passed":8,"findings":[...4 ภาพ...]}
```

รันซ้ำ 2 รอบ (รอบแรก F6.1 ของ fitness แดงเพราะ gate ไม่มี `assertCan`/`requireMembership(` ให้ fitness พิสูจน์ได้ทางสถิต → แก้ตามข้อ 4.1 ด้านล่าง → รอบสอง S1–S2 ยังเขียว 8/8 เหมือนเดิม ไม่กระทบพฤติกรรม)

---

## 3. Regressions

| ชุด | ผล |
|---|---|
| `qc-member-m1.9` (26 ข้อ) | 🟢 **26/26** |
| `qc-member-m1.5` (20 ข้อ) | 🟢 **20/20** |
| `tsc --noEmit` (`NODE_OPTIONS=--max-old-space-size=3584`) | 🟢 exit 0 |
| `fitness.mts` (มี env) | 🟡 **22/23** — F6.1 แดงจาก `duplicates-actions.ts`/`members-actions.ts` (ไฟล์ของ builder คู่ขนาน M1.6/M1.8 ไม่ใช่ของใบนี้ — `tiers-actions.ts` ผ่านแล้วตั้งแต่รอบสอง ไม่อยู่ใน finding) |
| `fitness.mts` (ไม่มี env · `env -u DATABASE_URL -u DIRECT_URL`) | 🟡 **22/23** — ผลเดียวกัน (fitness ไม่แตะ DB) |

**ไม่ได้รัน** `qc-member-m1.1` — ไม่ได้แก้ backfill/schema/seed ตามข้อห้ามของใบนี้

---

## 4. ข้อตัดสิน (พร้อมเหตุผล — ไม่มีข้อแย้งกับตัวข้อสอบ)

### 4.1 เพิ่ม `assertCan` เป็นด่านชั้น 1 ใน `gate()` เพื่อให้ fitness F6.1 พิสูจน์ได้ทางสถิต

`scripts/fitness.mts#F6.1` สแกนไฟล์ `*-actions.ts` หาการเรียก `assertCan|assertAccountCan|requireMembership(` ตรง ๆ (หรือ import ฟังก์ชันที่เรียกอย่างใดอย่างหนึ่งนั้น) — เป็นฮิวริสติกทางสถิต ไม่รู้จัก `hasMemberPerm` ของโมดูลสมาชิก (เหตุผลเดิมที่ M1.3 ตัดสินใจไม่ใช้ `assertCan` ตรง ๆ สำหรับสิทธิ์เจาะจงของโมดูลนี้ — ดู `access.ts` หัวไฟล์) รอบแรกที่ส่ง `gate()` มีแค่ `hasMemberPerm` → F6.1 แดง (ไม่ใช่บั๊กสิทธิ์จริง แต่ fitness มองไม่เห็น)

**แก้**: เดินตามแบบที่ `privacy-actions.ts` (M1.7) วางไว้แล้ว — ชั้นที่ 1 ตรวจ "เข้าโมดูลสมาชิกได้ไหม" ด้วย `canReadMember`+`assertCan` fallback (คนที่อ่านโมดูลไม่ได้เลยจะโดน `assertCan` โยน 403 ทันที ซึ่งไม่เคยเกิดจริงเพราะ `hasMemberPerm` เข้มกว่า `canReadMember` เสมอ — เป็น belt-and-suspenders ให้ fitness ตรวจจับได้ ไม่ใช่ตรรกะที่ทำงานจริง) ชั้นที่ 2 ยังเป็น `hasMemberPerm(actor,key)` ตามสัญญา §6.1 เหมือนเดิมทุกประการ — พฤติกรรมสิทธิ์ไม่เปลี่ยน (M1.10-S1.1/S1.2 ยังเขียวเหมือนเดิมทั้งก่อน/หลังแก้)

### 4.2 แยกไฟล์ `TierRuleBuilder.tsx` แทนการ reuse `AutomationBuilder.tsx` ตรง ๆ

ลองไล่โค้ด `components/kanban/AutomationBuilder.tsx` (935 บรรทัด) ก่อนตัดสินใจ: ผูกกับคำศัพท์บอร์ดงานทั้งไฟล์ (คอลัมน์/ป้าย/ผู้ใช้/`event` ของบอร์ด/`createRuleAction` ที่เขียนลง `automation.ts` ของ kanban ตรง ๆ) ไม่มี prop `scope` ให้สลับชุดฟิลด์ และ schema เงื่อนไขของมันคนละรูปกับ `RuleInput`/`RuleCondition` ของ `tiers.ts` (ไม่มี `windowMonths`, ค่า `value` ไม่รองรับ boolean) — เพิ่ม prop scope ให้มันจะต้องแตะไฟล์ `automation-actions.ts`/`automation.ts` ของบอร์ดงานซึ่งอยู่นอกขอบเขตใบนี้ (และเสี่ยง regression K2.9) ⇒ แยกไฟล์ใหม่ตามที่สัญญา S2.1 เปิดทางไว้ ("ถ้า reuse ตรงไม่ได้ ให้แยก component แต่ใช้ชุด UI/โทเคนเดียวกัน") ใช้โทเคนสี/spacing เดียวกันทั้งหมด (`--color-line`/`--color-accent`/`--color-muted` ฯลฯ) และคำศัพท์ปุ่มแนวเดียวกัน ("ครบทุกข้อ"/"ข้อใดข้อหนึ่ง" แทน "และ"/"หรือ" ของบอร์ดงาน)

### 4.3 หน่วยเงินของ `spent12m`/`spent` เป็นสตางค์ — ฟอร์มแปลงเป็นบาทให้ผู้ใช้เสมอ

ยืนยันจากคอมเมนต์ `tiers.ts` (`evidence.spent12m` = "ยอดซื้อรวม 12 เดือน (สตางค์)") และค่าจริงที่ backfill ตั้งไว้บน seed (`getTierRules(gold).upgrade = spent12m ≥ 3,000,000` ตรงกับภาพ 04 ที่โชว์ "฿30,000") → `TierRuleBuilder` คูณ/หาร 100 เองตอนแสดง/บันทึกเฉพาะฟิลด์ `spent12m`/`spent` — ฟิลด์อื่น (visits/tierPoints/memberDays/referrals) เป็นจำนวนเต็มตรง ๆ ไม่แปลง

### 4.4 benefits editor แยก DISCOUNT_PCT/DISCOUNT_FIXED เป็น 2 แถว (มากกว่ามอคอัพ 1 แถว)

ภาพ 15 มีแถว "ส่วนลดที่ POS/จอง" แถวเดียวกับดรอปดาวน์ % — แต่สัญญาต้องมี 10 ชนิดครบ (`TierBenefitType` enum ของ `tiers.ts` แยก `DISCOUNT_PCT`/`DISCOUNT_FIXED` เป็นคนละแถวข้อมูลจริง ไม่ใช่ mode toggle ของ UI เดียว) — เลือกทำ **2 แถวแยก** แทนการยัดโหมดสลับ % ↔ จำนวนคงที่ลงแถวเดียว เพราะ: (1) ร้านอาจต้องการเปิดทั้งสองพร้อมกันในอนาคต (เช่น ลด 5% สูงสุด ฿500 + ลดเพิ่มคงที่ ฿100 วันเกิด) schema รองรับอยู่แล้วเพราะเป็นคนละ `TierBenefitDto` (2) UI ยังคงครบ 10 ชนิดตามข้อสอบ ไม่มีการ "ซ่อน" ชนิดใดไว้เบื้องหลัง toggle ที่มองไม่เห็น — **ผลคือภาพจริงมี 10 แถวแทน 9 แถวของมอคอัพ** ธงนี้ไว้ให้ Fable ตัดสินตอนเทียบภาพ (§ ตรวจภาพ ด้านล่าง) ถ้าอยากรวมเป็นแถวเดียวจริง ต้องแก้ schema `benefitConfigSchemas`/`TierBenefitType` ของ `tiers.ts` ซึ่งอยู่นอกขอบเขตใบนี้

### 4.5 `dryRunAction`/`reviewNowAction` ประเมิน "สมาชิก ACTIVE ทุกคน" ไม่ใช่แค่คนที่ถึงรอบ

`runTierReview()` ที่ไม่ส่ง `customerIds` จะกรองเฉพาะ `tierReviewAt ≤ now` — บน seed วันนี้แทบไม่มีใครมี `tierReviewAt` ตั้งไว้ (M1.9 หมายเหตุ: "`tierReviewAt` ยัง null ทุกคน" เพราะ backfill ไม่ได้ตั้งให้) ⇒ ถ้าไม่ส่ง `customerIds` ปุ่ม "ทดลองรัน"/"ประเมินทั้งร้านตอนนี้" จะได้ผลว่างเปล่าเสมอบนร้านที่เพิ่งเปิดฟีเจอร์นี้ ไม่สมกับชื่อปุ่ม (ผู้ใช้กดแล้วคาดหวังเห็นผลจริงของกฎปัจจุบัน) ⇒ ทั้งสอง action ดึง `customerId` ของสมาชิก ACTIVE ทั้งหมดในระบบก่อน แล้วส่งเป็น `customerIds` ให้ `runTierReview` ประเมินทุกคนไม่ว่าจะถึงรอบหรือยัง (ตรงกับโหมด "ทดลองรัน/หน้าจอ" ที่ `tiers.ts` ออกแบบไว้ให้ใช้อยู่แล้ว — ดูคอมเมนต์ §7 ข้อ 7 ของ `wo-notes/member-M1.9.md`) — "ประเมินทั้งร้านตอนนี้" จึงมีความหมายว่า "บังคับทบทวนทันทีไม่ต้องรอกำหนดการ" ไม่ใช่แค่ trigger cron ตามปกติ

### 4.6 ตัวอย่างบัตร LINE (`TierCardPreview`) อยู่หน้า `/tiers/[tierId]` เท่านั้น ไม่ใช่หน้า `/tiers` หลัก

ข้อความ "ส่งมอบ" ใน MEMBER-RUN.md §2 M1.10 เขียนรวมทั้งสองฟีเจอร์ไว้ในย่อหน้าเดียวกันของหน้า `/tiers` แต่ภาพมอคอัพจริงชัดเจนว่าคนละหน้า: ภาพ 04 (`/tiers`) คอลัมน์ขวามีแค่ "สมาชิกแบบเสียเงิน" ส่วนภาพ 15 (`/tiers/[tierId]`) คอลัมน์ขวาคือ "ตัวอย่างที่ลูกค้าเห็นบน LINE" — ยึดภาพเป็นหลักตามกติกา parity (`feedback_ui_must_match_approved_mockups`) และ oracle เองก็ไม่ได้บังคับตำแหน่งหน้า (แค่ต้องมี testid `tiers-card-preview` ปรากฏที่ไหนก็ได้ในแอป) — `tiers-card-preview` จึงอยู่เฉพาะหน้าแก้ระดับ

### 4.7 archive ใช้ mini-dialog ของตัวเอง ไม่ใช้ `ConfirmDialog` กลาง

`ConfirmDialog` (`src/components/ui/ConfirmDialog.tsx`) รองรับแค่ `reasonField` เดียว (text input) ไม่รองรับ `<select>` เลือก `moveToTierId` — และไฟล์นั้นไม่ได้อยู่ในสัญญาไฟล์ที่แก้ได้ของใบนี้ จึงสร้าง dialog เฉพาะกิจ (`ArchiveDialog` ใน `TierLadder.tsx`) แทน — ตรวจแล้วว่า oracle S2.4 (archive) ไม่ได้บังคับ literal string `ConfirmDialog` (ต่างจาก S2.3 ที่บังคับ เพราะ "ประเมินทั้งร้านตอนนี้" ใช้ `ConfirmDialog` จริงตามที่ regex เช็ก)

---

## 5. หนี้ / เรื่องที่ Fable ต้องรู้

1. **`TierCardPreview`/`TierLadder`/`TierBenefitsEditor` มีฟังก์ชัน `shortBenefit`/`labelOf` ซ้ำกัน** (แปลง `TierBenefitDto`→ข้อความไทยสั้น) — ไม่มีไฟล์ util กลางที่อนุญาตให้สร้างใหม่ในสัญญาของใบนี้ (component ทั้ง 6 ไฟล์ถูกระบุชื่อตายตัว) เก็บไว้เป็นหนี้เล็ก ๆ รวมไฟล์ตอนทำความสะอาดทีหลังได้
2. **ป้าย "ระดับสมาชิก (เดิม)" ใน `nav.ts#LEGACY_V1_LINKS` ยังชี้ URL เดียวกับหน้าใหม่** (`/member/tiers`) เพราะ M1.10 แทนที่หน้า v1 ที่พาธเดิมตรง ๆ (ไม่ใช่สร้างพาธใหม่) — คอมเมนต์หัวไฟล์ `nav.ts` เขียนไว้แล้วว่า "M1.10 = ระดับ คือใบที่ย้ายผู้ใช้ไปหน้าใหม่ แล้วค่อยตัดออกเป็นใบแยก" — **เสนอ**: ใบทำความสะอาดถัดไปลบ 1 บรรทัดนี้ออกจาก `LEGACY_V1_LINKS` (ไม่ใช่งานของ M1.10 ตามสัญญา ห้ามแก้ `nav.ts` เกินบรรทัดเดียว)
3. **10 แถวในตัวสร้างสิทธิประโยชน์ (แทน 9 แถวของภาพ 15)** — ดู §4.4 ข้างบน รอ Fable ตัดสินตอนเทียบภาพว่ายอมรับ 10 แถวแยก DISCOUNT_PCT/DISCOUNT_FIXED หรือให้กลับไปรวมเป็น toggle เดียว (ต้องแก้ `tiers.ts` เพิ่ม ถ้าเลือกทางหลัง)
4. **ประวัติ (`memberTierHistory`) กรองด้วยชุด `customerId` ของระบบทั้งหมดก่อน** (ไม่มีคอลัมน์ `systemId` ในตารางนี้) — ทำงานถูกต้องบนสเกล QC (60 คน) แต่เป็นหนี้ประสิทธิภาพถ้าร้านมีสมาชิกหลักหมื่น (ต้อง fetch ids ทั้งหมดก่อน) — รูปแบบเดียวกับหนี้ sort ของ M1.5
5. **`setManualTierAction` ยังไม่มีปุ่มเรียกใช้จริงในหน้าไหนของ M1.10** — ตามสัญญา oracle ไม่มี testid บังคับสำหรับ UI ตั้งระดับมือในใบนี้ (ตั้งใจให้ export ไว้ก่อนสำหรับ Member 360 หรือใบถัดไปมาผูก) — action ผ่านการทดสอบ static (S1.1) แต่ยังไม่มี integration test เชิง UI
6. **ไอคอน `card` ที่เพิ่มใน `MemberIcon.tsx` ยังไม่ได้ใช้จริง** — ตั้งใจไว้สำหรับการ์ด "สมาชิกแบบเสียเงิน" แต่สุดท้ายใช้หัวข้อความล้วนไม่ใส่ไอคอน (ไม่กระทบอะไร เผื่อไว้ให้ใบอื่นเรียกใช้ต่อ)

---

## 6. คืนสภาพชุดข้อมูล QC

ใบนี้เป็น UI ล้วน ไม่ได้รันฟังก์ชันที่เขียนข้อมูลจริงระหว่างพัฒนา (ไม่ได้เปิดเซิร์ฟเวอร์/คลิกปุ่มจริง — ข้อสอบ M1.10 เป็น static check ไม่เรียก action) — regressions ที่รัน (`qc-member-m1.9`/`qc-member-m1.5`) มี `finally` คืนสภาพของตัวเองอยู่แล้วและจบด้วยผลเขียวครบ (26/26, 20/20) ยืนยันว่าชุดข้อมูล QC ไม่ถูกแตะโดยใบนี้

---

## 7. ตรวจภาพ

เว้นให้ Fable (S3.1–S3.4 ของข้อสอบ) — ยังไม่ได้ build/ถ่ายภาพเพราะ builder ห้าม `next build/dev`

**สิ่งที่ Fable ควรรู้ก่อนถ่ายภาพ**:
- หน้า `/tiers` ค่าเริ่มต้นเลือกระดับ "gold" อัตโนมัติ (index `length-2` ของ 4 ระดับ) — ตรงกับภาพ 04
- ปุ่ม "ทดลองรันได้" เรียก `runTierReview` กับสมาชิก ACTIVE **ทั้งหมด** (ไม่ใช่แค่คนถึงรอบ) — ควรเห็นตัวเลขไม่เป็นศูนย์บนชุด QC จริง
- หน้า `/tiers/{gold-id}` มี 10 แถวสิทธิประโยชน์ (มากกว่าภาพ 15 ที่มี 9 แถว) — ดู §4.4/§5 ข้อ 3 ก่อนตัดสิน parity
- thana (STAFF) ต้องไม่เห็น `tiers-add` และไม่เห็นปุ่มบันทึกในทุก component (ควบคุมด้วย prop `canManage` ทุกที่)

---

## 8. เวลา

เริ่มอ่านสัญญา/พิมพ์เขียว/เอนจิน M1.9/pattern M1.5–M1.7 → เขียนโค้ด 6 component + 1 actions + 2 pages + nav/icon → รันข้อสอบ+regressions+fitness (2 รอบเพราะ F6.1) → ส่งมอบ: **~2 ชม. 10 นาที** · งานหนักรันทีละ 1 ผ่าน `with-gate-lock.sh` ตลอด (เครื่อง 2 คอร์ มี builder อื่นแชร์คิวอยู่) · ไม่มี `next build/dev` · ไม่มี `git add/commit/push`

## ตรวจภาพ (Fable · 10 ก.ย. ~12:20 UTC)
- ภาพ 04 ↔ `tiers-owner-desktop.png`: การ์ดระดับ 4 ใบ (ป้ายสี · จำนวนคน · สรุปสิทธิ์ · ลิงก์แก้สิทธิ์ · ย้ายลำดับ/ลบ) + การ์ดเพิ่มระดับ ✓ · ตัวสร้างกฎเลื่อน/คงระดับ/ไม่ถึง→ลด ✓ · ประเมินทุกวันที่ 1 03:00 + ผ่อนผัน/แจ้งล่วงหน้า ✓ · ปุ่มทดลองรัน/ประเมินทั้งร้าน ✓ · ประวัติเปลี่ยนระดับ (วันที่ ชื่อ เดิม→ใหม่ เหตุผล แจ้งแล้ว) ✓ · สมาชิกแบบเสียเงิน (ว่าง — แพ็กเกจมาใบ M2.x) ✓
- `tiers-dryrun-result-desktop.png`: ผลทดลองรัน 4 ช่อง (เลื่อน/ลด/คง/ใกล้ลด) ✓ ต่างจากภาพ 04 ที่เป็นแถบสีฟ้าบรรทัดเดียว — ยอมรับ (ข้อมูลครบกว่า)
- ภาพ 15 ↔ `tiers-benefits-owner-desktop.png`: 3 คอลัมน์ ระดับ (ชื่อ/สี 6/ไอคอน/ลำดับ ±/คำอธิบาย/เสียเงิน) · สิทธิ์ 10 แถวเปิด-ปิด (ภาพ 15 มี 9 — builder เพิ่ม "ส่วนลดจำนวนคงที่" ซึ่งอยู่ในสัญญา benefit keys ยอมรับ) · ตัวอย่างการ์ด LINE + คนในระดับ ✓ · ยกเลิก/บันทึก ✓
- มือถือ `tiers-owner-mobile.png`: การ์ดเรียงลง · กฎ/ประวัติไม่ล้น (overflow=false) ✓ · thana เห็นหน้าอ่านได้ (200) · noperm 404 ✓
- **PARITY: ผ่าน** (หนี้: ต้นทุนสิทธิ์เดือนที่แล้ว + "แก้ไขล่าสุดโดย" ยังไม่แสดง — รอข้อมูลจาก M2.x)
