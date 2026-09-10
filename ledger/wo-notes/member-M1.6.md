# wo-notes — M1.6: สมัคร (โมดัล/ลิงก์/QR) · นำเข้า 3 ขั้น · ตัวซ้ำ/เปรียบเทียบ/รวมคน

> builder: Sonnet (โหมดขนานกับ M1.8 ช่องทางที่มา + M1.10 ระดับ UI ใน worktree เดียวกัน) · 10 ก.ย. 2569 · เริ่ม ~11:50 UTC จบ ~12:15 UTC (~18:50–19:15 น. ไทย)

## ไฟล์ที่ส่งมอบ

**ใหม่**
- `src/lib/modules/member/import.ts` — `autoMapping` · `previewImport` · `importMembers` · `checkDuplicate` · `joinLinkFor`
- `src/lib/modules/member/members-actions.ts` — `createMemberAction` · `checkDuplicateAction` · `joinLinkForAction` · `briefForAction`
- `src/lib/modules/member/duplicates-actions.ts` — `findDuplicatesAction` · `compareMembersAction` · `mergeMembersAction` · `dismissDuplicateAction`
- `src/app/app/sys/[id]/member/members/new/page.tsx` (ภาพ 10)
- `src/app/app/sys/[id]/member/members/import/page.tsx` (ภาพ 12)
- `src/app/app/sys/[id]/member/members/duplicates/page.tsx` (ภาพ 11)
- `src/components/member/MemberRegisterForm.tsx` · `MembersImportWizard.tsx` · `MembersDuplicates.tsx`

**แก้ (เท่าที่จำเป็น — อธิบายในข้อตัดสิน)**
- `src/lib/modules/member/fields.ts` — เพิ่ม `export function checkFieldValue(...)` 1 ฟังก์ชัน (บวกท้าย `normalizeValue` เดิม ไม่แก้โค้ดเดิมเลยสักบรรทัด)
- `src/lib/modules/member/import-actions.ts` — คงของเดิม (`importCustomersAction` v1) ไว้ทั้งหมด เพิ่ม `autoMappingAction` · `previewImportAction` · `importMembersAction` ต่อท้าย
- `src/app/app/sys/[id]/member/import/page.tsx` — เปลี่ยนเป็น `redirect()` ไป `/member/members/import` (ตามสัญญา)

ไม่ได้แตะ `profile.ts` `sources.ts` `tiers.ts` `nav.ts` `list.ts` `ui.tsx` `MemberIcon.tsx` ตามข้อห้าม (ไม่ต้องเพิ่มไอคอนใหม่ — คอมโพเนนต์ที่ทำใช้ปุ่ม/ข้อความล้วน)

## ผลข้อสอบ `qc-member-m1.6.mts`

```
🟢 S1.1–S1.8  (8/8)  service layer (import.ts)
🟢 S2.1–S2.3  (3/3)  static: หน้า/action/testid
🔴 S3.1–S3.3        ภาพ — รอ Fable ถ่าย (ตามสัญญา "S3.x ภาพ = Fable")
รวม 11/14 (เป้าของใบนี้ S1.1–S2.3 ครบ)
```

## Regressions (ผ่าน gate lock)
- `qc-member-m1.4.mts` → 🟢 37/37
- `qc-member-m1.5.mts` → 🟢 20/20
- `pnpm exec tsc --noEmit` → ผ่าน (ไม่มี error)
- `pnpm fitness` (มี env) → 🟢 23/23 (F6.1 ตกรอบแรกเพราะ action ใหม่ 2 ไฟล์ไม่เรียก `assertCan` ตรง — แก้แล้ว ดูข้อตัดสิน)
- `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness.mts` → 🟢 23/23

## ข้อตัดสิน (ไม่มีข้อแย้งกับข้อสอบ — ทุกข้อผ่าน — แต่มีจุดที่สัญญาไม่ได้ระบุละเอียดพอ ต้องตัดสินเอง)

1. **`checkFieldValue` เพิ่มใน `fields.ts`** — สัญญา S1.2 เขียนตรง ๆ ว่า "ใช้ validate ของ fields engine" แต่ `fields.ts` เดิมไม่มี export ตรวจอย่างเดียว (มีแต่ `setFieldValues` ที่เขียนด้วย) จึงเพิ่มฟังก์ชันเดียว บวกท้ายไฟล์ ไม่แตะโค้ดเดิม — เรียก `normalizeValue` ตัวเดียวกับที่ `setFieldValues` ใช้ (สองเส้นทางตรวจไม่มีวันไม่ตรงกัน) `fields.ts` ไม่อยู่ในบัญชีห้ามแก้ (มีแค่ profile/sources/tiers/nav/list)

2. **`import-actions.ts` ไม่ลบของเดิม** — ไฟล์นี้มีชื่อเดียวกับที่สัญญาระบุว่า "ใหม่" แต่บนดิสก์มีอยู่แล้วเป็น v1 (`importCustomersAction` เรียก `service.ts#importCustomers`) ที่ `ui.tsx#MemberImportSection` ยังอ้างอยู่ → เลือก **บวกฟังก์ชัน v2 ต่อท้าย** แทนการเขียนทับ กันไม่ให้ `ui.tsx` (ไฟล์ที่ไม่ได้รับอนุญาตให้แตะ) คอมไพล์พัง หน้าเดิม `/member/import` ตอนนี้ `redirect()` ไปตัวใหม่แล้วจึงไม่มีใครเรียก `MemberImportSection` อีก แต่โค้ดยังอยู่ครบ (ไม่ใช่ dead-but-broken)

3. **ความหมายจริงของ `onDuplicate: "candidate"`** — schema มี `@@unique([memberSystemId, phone])` จึงบังคับสร้างซ้ำทับเบอร์เดิมไม่ได้จริงไม่ว่าโหมดไหน ⇒ ตีความ (ตรงกับ S1.5 ที่ทดสอบด้วยเบอร์ใหม่แต่ชื่อซ้ำ) ว่า **candidate = ไม่เช็คซ้ำล่วงหน้า ปล่อยให้ `createMember` ตัดสินเอง** (ชนเบอร์/อีเมลจริง → `created:false` → นับ skip) **แล้วตรวจ "ชื่อคล้าย" แยกต่างหากเฉพาะแถวที่สร้างสำเร็จ** เจอ → ตั้ง `PartyMergeCandidate` (กลไกเดียวกับที่ `findDuplicates` ของ M1.4 อ่าน) — บันทึกเป็นคอมเมนต์หัวไฟล์ `import.ts` ด้วย

4. **แผงเปรียบเทียบ (ภาพ 11)**: แถว "ชื่อ-นามสกุล" ในหน้าจอ map เป็น 2 field key จริง (`firstName`+`lastName`) ไม่ใช่ `"name"` (ไม่มีฟิลด์ `name` ในทะเบียน — เป็นคอลัมน์ v1 เก่า) กันไม่ให้เลือกฝั่ง B แล้ว `setFieldValues` throw "ไม่มีฟิลด์ชื่ออ้างอิง name" · แถว "ระดับ" แสดงเป็นข้อมูลอ้างอิงเฉยๆ ไม่มีปุ่มเลือก (ระดับไม่ได้ปรับผ่าน `fieldChoices` ของ `mergeMembers` — เป็นของ `tierDefId` ที่รวมแล้วคงของฝั่งที่เก็บไว้เสมอ)

5. **"ส่งลิงก์ LINE" ในภาพ 10 → เปลี่ยนเป็น "คัดลอกลิงก์"** — ส่งจริงผ่านแชทลูกค้ายังไม่มี adapter ในใบนี้ (ต้องผ่านโมดูลแชท) เลือกไม่ทำปุ่มที่อ้างว่าส่งได้จริงแต่ทำไม่ได้ (กติกาห้ามแต่งประสบการณ์ที่ยังไม่มี) — ปุ่ม "QR LIFF" ยังทำงานจริงครบ (เรียก `joinLinkFor` สร้างไว้ตั้งแต่โหลดหน้า)

6. **ฟิลด์กำหนดเองชนิด LOOKUP/FILE ในฟอร์มสมัคร** — เรนเดอร์เป็นช่องปิดใช้งาน + ข้อความ "ตั้งค่าได้จากหน้าโปรไฟล์หลังสมัคร" (ตัวเลือก/อัปโหลดไฟล์ตอนสมัครไม่อยู่ในสัญญา 8 testid ของใบนี้) — ไม่ใช่บั๊ก เป็นขอบเขตที่ตัดไว้ตั้งแต่ต้น

7. **F6 fitness (authz coverage)**: action ใหม่ 2+1 ไฟล์ (`members-actions.ts` `duplicates-actions.ts` `import-actions.ts#gateImport`) เดิมใช้ `canReadMember()` + `throw new Error` ธรรมดา — ข้อสอบสถาปัตยกรรม F6.1 นับด่านสิทธิ์จาก "เรียก `assertCan` จริง" เท่านั้น (ไล่ตาม import ลึก 1 ชั้น) ไม่นับฟังก์ชัน boolean เฉย ๆ → แก้ให้ทุก `gate()` เรียก `assertCan(...)` เมื่อ `canReadMember` เป็น false (แบบเดียวกับ `fields-actions.ts`/`privacy-actions.ts` ของใบก่อนหน้า) — ตรวจแล้วว่า fitness ผ่านทั้ง 2 โหมด

## หนี้ที่เปิดไว้ (ไม่ใช่บั๊ก แต่ยังไม่ทำ)
- ตัวเลือก LOOKUP (ค้นรายการ) / อัปโหลดไฟล์ FILE ในฟอร์มสมัคร — ยังปิดใช้งานไว้ (ดูข้อตัดสิน 6)
- "ส่งลิงก์ LINE" จริงผ่านแชท — ยังไม่ทำ (ดูข้อตัดสิน 5) ตอนนี้เป็นปุ่มคัดลอกลิงก์
- กล่องสรุป "ผลการรวม" ของแผงเปรียบเทียบเป็นตัวเลขประมาณ (แต้ม+ห้องแชทของทั้งคู่รวมกัน) ยังไม่ใช่ preview เต็มของ voucher/สแตมป์/ประวัติ (โมดูลเหล่านั้นยังไม่มีจนกว่าจะถึง M2.x)
- `import-actions.ts#importCustomersAction` (v1) + `ui.tsx#MemberImportSection` ยังอยู่ในโค้ดแต่ไม่มีทางเข้าจาก UI แล้ว (หน้าเดิม redirect หมด) — รอใบที่เลิกใช้ v1 อย่างเป็นทางการ (ตามที่ `nav.ts` บันทึกไว้แล้วว่าเป็นหนี้เดิม)

## คืนสภาพ QC
ไม่ต้องคืนสภาพเอง — `scripts/qc-member-m1.6.mts` มี `finally` ลบสมาชิก/party/consent/attribution/activity/audit/outbox ที่สร้างระหว่างข้อสอบให้เองแล้ว (ยืนยันด้วยการรันซ้ำ 2 รอบ ได้ผลเดิมทั้งสองรอบ ไม่มีข้อมูลค้าง)

## ตรวจภาพ
เว้นให้ Fable (S3.1–S3.3 + PARITY เทียบภาพ 10/11/12)

---

## ตีกลับรอบ 1 (Fable ถ่ายภาพจริงเทียบ mockup แล้ว — แก้เลย์เอาต์)

> เริ่ม ~12:40 UTC จบ ~13:15 UTC (~19:40–20:15 น. ไทย)

### แก้ตามภาพ 10 (`MemberRegisterForm.tsx` · `members/new/page.tsx`)
1. กล่อง QR+ลิงก์ ซ่อนไว้ก่อน (ใช้ `hidden` attribute) — โผล่เมื่อกด "QR LIFF" (toggle) · ย้าย `data-testid="members-new-qr"` ไปไว้ที่กล่องเอง (อยู่ใน DOM เสมอตามที่สั่ง ไม่ใช่ที่ปุ่ม)
2. เพิ่มช่อง **LINE** ใต้มือถือ/อีเมล — อ่านอย่างเดียว placeholder "ผูกภายหลังจากแชท" · ชิปตรวจซ้ำเปลี่ยนเป็น pill สีเขียว/ส้ม (`--color-tag-green`/`--color-tag-amber`) แทนข้อความเปล่า
3. ส่วน "ที่มา" เป็น 5 ช่อง: ช่องทาง · **แคมเปญ** (select จาก `sources.ts#listLinks` — ไม่มีลิงก์เลย = "— ไม่มีแคมเปญ —" ปิดใช้งาน ไม่บันทึก) · สาขาหลัก · ผู้แนะนำ · **พนักงานที่รับ** (select จาก `prisma.membership` ของร้าน ค่าเริ่มต้น = ผู้ใช้ปัจจุบัน) — แคมเปญ/พนักงานที่รับบันทึกลง `sourceDetail.campaignId`/`sourceDetail.receivedByUserId` (createMember รับ sourceDetail ได้จริงตามที่คาด)
4. เพิ่มไอคอนหัวส่วน — **lucide-react ไม่ได้ติดตั้งในโปรเจกต์นี้** (เช็คแล้วใน `node_modules`/`package.json` ไม่มี) ใช้ `MemberIcon` sprite ที่มีอยู่แทน (เพิ่ม 2 ไอคอนใหม่ `person`/`flag` ต่อท้าย `MemberIcon.tsx` แบบเติมเท่านั้น ไม่แก้ของเดิม) — สอดคล้องกับแบบไอคอนเดิมของทั้งโมดูลมากกว่า
5. แถบล่าง sticky ในการ์ด: ซ้าย "ระดับเริ่มต้น {ชื่อระดับ isDefault/sortOrder ต่ำสุด จาก `tiers.ts#listTierDefs`}" (**ไม่มีข้อความแต้มต้อนรับ** ตามที่สั่ง) · ขวา ยกเลิก + บันทึกและออกบัตร
6. ใต้ความยินยอม เพิ่ม "นโยบายความเป็นส่วนตัว v{version} · ลงนามผ่านหน้าจอ" จาก `privacy.ts#currentPolicy` — ร้าน QC ยังไม่ตั้งนโยบาย จึงตัดเลขเวอร์ชันออกอัตโนมัติ (เห็นแค่ "นโยบายความเป็นส่วนตัว · ลงนามผ่านหน้าจอ")

### แก้ตามภาพ 11 (`MembersDuplicates.tsx` · `members/duplicates/page.tsx`)
7. รายการคู่เปลี่ยนการ์ด → ตาราง 4 คอลัมน์ (ชื่อ↔ชื่อตัวหนา / เหตุผลเป็นชิป / ข้อมูลย่อ "ระดับ · N แต้ม" — **ใช้ `MemberBrief.tier`/`.points` ที่มีอยู่ใน `DuplicatePairDto` แล้ว ไม่ต้อง query เพิ่ม** / ปุ่มเปรียบเทียบ) · แถวที่เลือกอยู่ขอบฟ้า · ท้ายตาราง "แสดง N จาก M คู่"
8. ปุ่ม "สแกนหาตัวซ้ำใหม่" มุมขวาบน เรียก `findDuplicatesAction` แล้วอัปเดตตารางในหน้าโดยไม่รีโหลด (ตัดสัญลักษณ์ลูกศรออกจากปุ่ม — ดูหมายเหตุอีโมจิด้านล่าง)
9. แผงเปรียบเทียบกว้างขึ้นเป็น 560px (`lg:grid-cols-[1fr_560px]`) หัวแต่ละฝั่งไม่ truncate แล้ว + ใช้ `TierChip` สีตาม tier จริง + บรรทัด "N แต้ม · มา N ครั้ง" (จาก `Member360.stats.visitCount`) · ตารางฟิลด์ label อยู่ซ้ายสุด (`grid-cols-[96px_1fr_1fr]`) มีเส้นคั่นแต่ละแถว · กล่อง "ผลการรวม" พื้น `--color-accent-soft` กรอบ `--color-accent` 3 บรรทัด (เดิม 2 + เพิ่ม "เขียนรายการโอนลง ledger ไม่แก้ย้อนแถวเดิม") · แถวสถานะ "รวมได้ทันที (คุณเป็นเจ้าของร้าน)" (OWNER) / "ต้องอนุมัติก่อนรวม (ตามนโยบายอนุมัติ)" (MANAGER) — **ไม่มี toggle จริงตามที่สั่ง** (ดูข้อตัดสินเพิ่มด้านล่างเรื่องไม่มี facade เช็ค policy จริง)

### แก้ตามภาพ 12 (`MembersImportWizard.tsx` · `members/import/page.tsx`)
10. ขั้น 2 จัดเป็น 3 คอลัมน์ (`lg:grid-cols-[240px_1fr_260px]`): **ซ้าย** ตัวอย่างไฟล์ mono 3 คอลัมน์แรก + "อีก N คอลัมน์: …" + กล่อง "ตัวอย่างค่า {ฟิลด์}" ต่อคอลัมน์ที่ map ไป SELECT (ค่าไม่ซ้ำ + ชิปตรง/ไม่ตรงตัวเลือก) · **กลาง** แถว mapping (หัวคอลัมน์ mono · dropdown ต่อท้าย "(กำหนดเอง)" สำหรับฟิลด์ไม่ใช่ระบบ · ชิปสถานะ "N แถว"/"N แถว เหตุผล" คำนวณฝั่ง client จาก `rows` จริงเฉพาะ phone/date/select ตามที่สั่ง — debounce `previewImportAction` 400ms ให้ตัวเลขสรุปฝั่งขวาสดตามการจับคู่) + ลิงก์ "เพิ่มเป็นตัวเลือกใหม่" (เรียก `fields-actions.ts#updateFieldAction` จริง — อัปเดต choices ทันทีถ้าสำเร็จ ไม่มีสิทธิ์ `member.settings.manage` ก็ยังกดได้แต่จะเห็นเหตุผลปฏิเสธ) / "ข้าม" (ตั้ง mapping เป็น skip) · **ขวา** "ตั้งค่าการนำเข้า": ช่องทางที่มา (select ป้ายไทย default นำเข้า) · `members-import-dup-option` ย้ายมาที่นี่ · สาขาหลัก · แท็ก · กล่องสรุปก่อนนำเข้าจากผล preview สด
11. แถบล่างขั้น 2: ย้อนกลับ (ซ้าย) · ข้อความ "จะนำเข้า N คน · ข้าม M แถวที่มีปัญหา" + ปุ่ม "ตรวจข้อมูล" (**testid `members-import-next` ตัวเดิม** — ไม่ได้เปลี่ยน)
12. ขั้น 3 เหลือแค่ตารางผลตรวจ + ปุ่มนำเข้า + ผลลัพธ์ — ตัด dup-option/สาขา/แท็กออก (ย้ายไปขั้น 2 แล้วตามข้อ 10)

### ข้อตัดสินเพิ่มจากรอบตีกลับ
- **lucide-react ไม่มีในโปรเจกต์** (ตรวจ `package.json` + `node_modules` แล้วไม่พบ ไม่มีที่ไหนในโค้ด import มาก่อนเลย) — ใช้ `MemberIcon` sprite เดิมของโมดูลแทนตามภาพรวม ไม่เพิ่ม dependency ใหม่ (การเพิ่ม npm package ต้องแก้ package.json/lockfile ซึ่งไม่อยู่ในขอบเขตที่สั่งและเสี่ยงกระทบ build ของทั้งโปรเจกต์)
- **สัญลักษณ์ ✓/⚠/⇄**: เขียนไปก่อนแล้วโดนข้อสอบ `EMOJI` regex (`☀–➿` ครอบคลุมสัญลักษณ์กลุ่ม dingbat ด้วย ไม่ใช่แค่อีโมจิสี) จับที่ S2.3 — แก้เป็น `<MemberIcon name="check"/"warn">` (มีอยู่แล้วในสไปรต์) หรือตัดสัญลักษณ์ออกเป็นข้อความล้วน ตรวจซ้ำด้วยสคริปต์กวาดทั้งโฟลเดอร์ (หลัง strip comment) แล้วไม่พบเหลือ
- **"ต้องอนุมัติก่อนรวม" ไม่มี facade เช็ค policy จริง**: `approval/index.ts` ยังไม่มี export ใด ๆ (ว่างเปล่า) และ WO นี้ห้ามแก้โมดูล approval — ใช้กฎจากพฤติกรรมจริงของ `mergeMembers` แทน (OWNER ไม่เดินสายอนุมัติเลยไม่ว่ามี policy ไหม · MANAGER เดินสายอนุมัติเสมอซึ่งอาจ auto-approve เงียบ ๆ ถ้าไม่มี policy) → ข้อความอิงบทบาทของผู้ดู ไม่ใช่ query policy ตรง ๆ (บอกตามทางที่ `mergeMembers` จะเดินจริงเมื่อกด ไม่ใช่การเดา)
- **"เพิ่มเป็นตัวเลือกใหม่"**: เรียก `updateFieldAction` จริง (มี action นี้อยู่แล้ว) แต่ต้องมีสิทธิ์ `member.settings.manage` (คนละคีย์กับ `member.customer.import`) — staff ที่นำเข้าอย่างเดียวกดแล้วจะได้ reason ปฏิเสธ ไม่ crash แค่ทำไม่สำเร็จ (ยอมรับได้ตาม WO ที่บอกว่า "ถ้าไม่มี action ให้ทำเฉพาะข้าม" — ในที่นี้มี action จึงต่อสายไว้เต็ม)

### ผลตรวจซ้ำหลังแก้
- `qc-member-m1.6.mts` → 🟢 **13/14** (S1.1–S2.3 ครบ 11/11 · S3.1/S3.2 ผ่าน 200 · เหลือ S3.3 แดงเพราะสตริง "PARITY: ผ่าน" ยังไม่ถูกเขียนในไฟล์นี้ — รอ Fable ถ่ายภาพรอบใหม่ตัดสินเองตามที่ตกลงไว้เดิม ไม่ใช่สิ่งที่ builder เขียนเองได้)
- `qc-member-m1.4.mts` → 🟢 37/37 · `qc-member-m1.5.mts` → 🟢 20/20 (ไม่กระทบ)
- `tsc --noEmit` (ไฟล์ของ M1.6 เอง) → ผ่านสะอาด หลายรอบ **แต่ตอนนี้ tsc ทั้งโปรเจกต์แดงจากไฟล์ที่ builder อื่นกำลังแก้อยู่พร้อมกัน** (`src/app/developers/account/page.tsx`, `src/app/developers/kanban/page.tsx` ขาด key `customer_session_required` ที่เพิ่งเพิ่มใน `src/lib/api/respond.ts`, `scripts/qc-member-m2.3.mts` error ระหว่างเขียน, `src/lib/modules/member/api/dispatch.ts` หา `./registry` ไม่เจอ) — ยืนยันด้วย `git status`/`git diff --stat` ว่าไฟล์เหล่านี้ไม่ใช่ของใบนี้และ builder ไม่ได้แตะเลย ตรวจซ้ำ 3 รอบห่างกันหลายนาทีว่า error อยู่นอกไฟล์ M1.6 เสมอ (grep ยืนยันว่าไม่มี error พาดพิงไฟล์ของ M1.6 สักบรรทัด)
- `pnpm fitness` (มี env) → F6.1 (ที่เกี่ยวกับใบนี้) ยังเขียว · เจอ F13.2/F13.5 แดง (เอกสาร ACCOUNT-API/KANBAN-API ไม่ตรง generator) — **ไม่เกี่ยวกับ M1.6** เช่นกัน (คนละโมดูล คนละไฟล์ที่ builder อื่นกำลังทำ REST API อยู่พร้อมกัน)

### หนี้ใหม่จากรอบนี้ (เพิ่มจากหนี้เดิม)
- ข้อความสถานะ "ต้องอนุมัติก่อนรวม" อิงบทบาทผู้ดู ไม่ได้ query `ApprovalPolicy` จริง (ไม่มี facade ให้เรียก) — ถ้า `approval/index.ts` เปิด export ให้เช็ค policy ได้ในอนาคต ควรเปลี่ยนมาเช็คจริงแทน
- ปุ่ม "เพิ่มเป็นตัวเลือกใหม่" ใช้ได้เฉพาะคนมีสิทธิ์ `member.settings.manage` — staff ทั่วไปที่ทำได้แค่ import จะกดไม่สำเร็จ (เห็น reason ปฏิเสธ ไม่ crash)

## ตรวจภาพ (Fable · 10 ก.ย. ~19:10 UTC · build #19)
- ภาพ 10 ↔ `members-new-owner-desktop.png`: หัวส่วนมีไอคอน · QR ซ่อนจนกด "QR LIFF" ✓ · ติดต่อ มือถือ/อีเมล/LINE (ผูกภายหลังจากแชท) ✓ · ที่มา 5 ช่อง (ช่องทาง/แคมเปญ/สาขาหลัก/ผู้แนะนำ/พนักงานที่รับ) ✓ · ข้อมูลดำน้ำ (กำหนดเอง) ✓ · สุขภาพ = กล่องอ่อนไหวกรอกภายหลัง ✓ · PDPA 6 ช่อง + บรรทัดนโยบาย ✓ · แถบล่าง "ระดับเริ่มต้น สมาชิก" + ยกเลิก/บันทึกและออกบัตร ✓ · มือถือเรียงคอลัมน์เดียว ไม่ล้น (overflow=false)
- ภาพ 11 ↔ `members-dup-compare-desktop.png`: ตาราง 4 คอลัมน์ (คู่ · เหตุผลชิป "ชื่อคล้าย 100%" · ข้อมูลย่อ ระดับ·แต้ม ↔ · ปุ่มเปรียบเทียบกรอบน้ำเงิน) ✓ · "แสดง 1 จาก 1 คู่" ✓ · ปุ่ม "สแกนหาตัวซ้ำใหม่" ✓ · แผงเปรียบเทียบ: ชื่อ/รหัส/ชิประดับ/แต้ม·มา ✓ ป้ายฟิลด์ซ้าย ✓ กล่องฟ้า ผลการรวม + บรรทัด ledger ✓ สถานะอนุมัติ ✓ ปุ่ม 2 ✓
- ภาพ 12 ↔ `members-import-mapping-desktop.png`: 3 คอลัมน์ (ตัวอย่างไฟล์ 5 แถวแรก + อีก n คอลัมน์ + ตัวอย่างค่า SELECT ชิป "ตรงตัวเลือก" · mapping + ชิปสถานะ ✓ n แถว / ⚠ 1 แถว เบอร์ไม่ครบ 10 หลัก · ตั้งค่าการนำเข้า ช่องทาง/ซ้ำ/สาขา/แท็ก + สรุปก่อนนำเข้า) ✓ · แถบล่าง ย้อนกลับ · "จะนำเข้า 2 คน · ข้าม 1 แถวที่มีปัญหา" · ตรวจข้อมูล ✓ · ขั้น 3 ตารางผล + นำเข้า 2 คน ✓
- **PARITY: ผ่าน** (harness: ขั้น 2 ต้องกดถัดไปหลังอัปโหลด · dup-option อยู่ขั้น 2 — ปรับข้อสอบ/harness แล้ว)
