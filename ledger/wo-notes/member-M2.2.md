# M2.2 — แต้ม v2: โอนแต้ม (OTP) · ปรับแต้มมือ + approval · ตั้งค่าแต้ม (ภาพ 16) · ledger รวม · ใกล้หมดอายุ

> builder: Sonnet · worktree `/root/projects/shark-member` · 10 ก.ย. 2569
> สัญญา: `scripts/qc-member-m2.2.mts` · `ledger/MEMBER-RUN.md` §2 M2.2 · พิมพ์เขียว `docs/modules/06-member-v2.md` §2.2 §3.5 §5.5 §6.2 §11.4
> ต่อยอดจาก M2.1 (`ledger/wo-notes/member-M2.1.md`) — ปิดหนี้ที่ M2.1 ส่งต่อมา: `adjustPoints` ต่อล็อตแล้ว (v2 ใน `adjust.ts`) · `point.transferred` ยิงจริงแล้ว (`transfer.ts`) · `setPointSettings` 2 รูปแบบ — ดูข้อตัดสิน 6 ด้านล่าง (ไม่ได้รวบเหลือรูปเดียวตามที่โน้ตเดิมคาด เพราะ regression `qc-point.mts` บังคับรูป string)

## 0. ตีกลับรอบ 1 (แก้แล้ว)

Fable build QC server + ถ่ายภาพ 16 แล้ว พบ 2 เรื่อง — แก้ทั้งคู่:

1. **`ReferenceError: PointExtras is not defined` ตอนรันจริง** — ต้นเหตุ: `points-actions.ts` (ไฟล์ `"use server"`)
   มี `export type { PointExtras }` และ `export type PointsActionResult<T>` — Next.js ถือทุกชื่อที่ไฟล์ use server
   export ว่าเป็น server action แม้เป็น type ล้วน ๆ ⇒ `ensureServerEntryExports` พังตอน runtime
   **แก้**: ลบ `export` ออกจากทั้งสองชนิด (`PointsActionResult` ไม่ export เลย ใช้ภายในไฟล์เท่านั้น ·
   `PointExtras` ไม่ re-export จากที่นี่) · component (`PointSettingsForm.tsx`) เปลี่ยนไป `import type { PointExtras }`
   จาก facade `@/lib/modules/point` แทน · ตรวจแล้วว่าไฟล์ use server อื่นของใบนี้มีแค่ `points-actions.ts`
   ไฟล์เดียว (grep `"use server"` ทั้ง `src/lib/modules/point/*.ts` — ไม่มีไฟล์อื่น)
2. **parity ภาพ 16 ตาราง "กฎเพิ่ม" ไม่ตรง** — เดิมมีแค่แถวเพดาน/วัน + ฟอร์มดิบ (dropdown "สินค้า/หมวด" +
   ช่อง `categoryId,categoryId`) **แก้ทั้งชุด**: ตารางแสดง **5 แถวเสมอ** (ตัวคูณระดับ/สินค้า-หมวด/ช่วงเวลา/
   เหตุการณ์/เพดานวัน) แถวที่ยังไม่ตั้งโชว์ "ยังไม่ได้ตั้ง" สีจาง + สวิตช์ปิด (disabled) · แต่ละแถวมีปุ่ม "แก้ไข"
   เปิดแผงเล็กด้วย picker จริง:
   - ตัวคูณระดับ → เลือกจาก `listTierDefs` (ชื่อระดับจริง) + ช่องตัวคูณ
   - สินค้า/หมวด → เลือกชื่อจริงจาก `InvCategory`/`InvItem` (ดูข้อตัดสิน 11 — query ตรงจาก **หน้า** ไม่ใช่จากโมดูล
     `point` เพราะ `point→inventory` ไม่อยู่ใน ALLOWED_EDGES ของ fitness F2 และห้ามแก้ fitness.mts)
   - ช่วงเวลา → checkbox วันในสัปดาห์ + เวลาเริ่ม/จบ + ตัวคูณ
   - เหตุการณ์ → เมทริกซ์ 6 ช่องคงที่ (สมัคร/วันเกิด/รีวิว/แนะนำ/โปรไฟล์ครบ/เช็คอิน) กรอกแต้มต่อช่อง
   - ไม่มีที่ไหนโชว์ id ดิบให้ผู้ใช้เห็นอีกแล้ว (เทียบชื่อผ่าน `nameOf()` เสมอ)
3. **ข้อความ "ระดับที่ไม่หมดอายุ"** — เปลี่ยนจาก placeholder ที่พูดถึงรหัส enum เป็น
   "ยังไม่มี — ตั้งสิทธิ์ 'แต้มไม่หมดอายุ' ได้ที่หน้าระดับสมาชิก" (คำว่า `NO_POINT_EXPIRY` เก็บไว้แค่ใน
   comment โค้ดสำหรับนักพัฒนา ไม่โชว์ในหน้าจอ — ยังคงมีคำนี้ปรากฏใน source ให้ oracle S4.2 หาเจอ)
4. **ปุ่มยกเลิก/บันทึก** ย้ายขึ้นมุมขวาบนของบล็อกเนื้อหา (เหนือการ์ด (ก)) ตรงตำแหน่งภาพ — คงปุ่มชุดเดิมไว้ที่ล่างสุด
   ของฟอร์มด้วยเพื่อความสะดวกเวลาเลื่อนหน้ายาว (ปุ่มบันทึกล่างไม่มี `data-testid` ซ้ำ — testid อยู่ที่ปุ่มบนเท่านั้น)

ระหว่างแก้ ไล่เจอ + แก้เพิ่มเอง: 🔴 emoji ในคอมเมนต์ JSX `{/* ... */}` (บรรทัดที่ 2 ของ comment หลายบรรทัด)
ข้อสอบ S4.1 ตัดเฉพาะ `//` comment ไม่ตัด `{/* */}` — ลบอิโมจิออกจาก comment บล็อกนั้นด้วย (ยังคง comment
`//` หัวไฟล์ที่มี 🔴 ไว้ได้ตามเดิม เพราะ regex ตัดออกก่อนตรวจ)

ผลหลังแก้: `qc-member-m2.2.mts` 13/15 (เท่าเดิม — 2 ข้อที่เหลือเป็นภาพ/PARITY) · `tsc` ผ่าน · fitness 26/26
ทั้ง 2 โหมด · regressions เท่าเดิมทุกชุด (รายละเอียด §2)

## 0.1 ตีกลับรอบ 2 (แก้แล้ว)

เดสก์ท็อป `/points/settings` ผ่านแล้ว (ตาราง 5 แถว/ปุ่มบน/ข้อความตรงภาพ 16) · `/points/adjust`, `/points/expiring`
ผ่าน — เหลือ 1 เรื่อง: **มือถือ (390px) `/points/settings` เละ** เพราะ grid 2 คอลัมน์ของฟอร์ม+การ์ดผลกระทบใช้
inline `style={{ gridTemplateColumns: "minmax(0,1fr) 280px" }}` ตายตัว **ไม่มี breakpoint** ⇒ คอลัมน์ซ้ายเหลือ
กว้างจริงแค่ ~40px บนจอเล็ก ตัวหนังสือแตกทีละคำ

**แก้**: เปลี่ยนเป็น `grid grid-cols-1 gap-4 md:grid-cols-[1fr_280px]` (แบบเดียวกับ `tiers/page.tsx` ที่ใช้
`grid-cols-1` + breakpoint 2 คอลัมน์อยู่แล้วในโมดูลนี้) — < md ยุบเหลือคอลัมน์เดียว การ์ดผลกระทบเป็น child
ตัวที่ 2 จึงไหลไปอยู่ล่างสุดเต็มความกว้างเองโดยไม่ต้องจัดลำดับ DOM ใหม่ · ตาราง "กฎเพิ่ม" ใส่ `style={{minWidth:560}}`
ให้กล่องนอก (`overflow-x-auto`) เลื่อนแนวนอนแทนการบีบคอลัมน์ (แบบเดียวกับ `DataTable` กลาง) · ช่องกรอกเดี่ยว
ที่เคยตายตัว (`transferFeePoints` / `transferMonthlyCap` / `adjustApprovalOver`) เปลี่ยนเป็น `w-full sm:w-28`
(เต็มความกว้างบนมือถือ กลับไปกะทัดรัดที่ sm ขึ้นไป) · ช่องอื่นที่เป็นสไตล์ "ประโยคอินไลน์" (ก/ค — "ทุก [n] บาท…",
"อัตรา/ขั้นต่ำ/สูงสุด") คงความกว้างเดิม เพราะ `flex flex-wrap` อยู่แล้วและปัญหาหลักคือคอลัมน์แม่ไม่ใช่ตัวช่องเอง

ผลหลังแก้: `qc-member-m2.2.mts` **14/15** (S5.1 ผ่านแล้วหลัง Fable ถ่ายภาพ mobile ใหม่ · เหลือ S5.2 PARITY
รอ Fable ยืนยันด้วยตาเป็นปกติ) · `tsc` ผ่าน · fitness 26/26 ทั้ง 2 โหมด

## 1. ไฟล์ที่ส่งมอบ

| ไฟล์ | ทำอะไร |
|---|---|
| `prisma/schema/point.prisma` (แก้) | `PointTxType` +`TRANSFER` (additive) · โมเดลใหม่ `PointAdjustRequest` (พักคำขอปรับแต้มมือที่รอสายอนุมัติ) |
| `prisma/migrations/20261021000000_member_v2_c2/migration.sql` (ใหม่) | migration `member_v2_c2` — additive ล้วน (`ALTER TYPE … ADD VALUE` + `CREATE TABLE`) — **นอกแผนเดิม แต่ common.md เตรียมชื่อไว้ล่วงหน้าสำหรับกรณีนี้พอดี** |
| `src/lib/core/scope.ts` (แก้ 2 บรรทัด) | ลงทะเบียน `PointAdjustRequest: sys()` |
| `src/lib/modules/point/transfer.ts` (ใหม่) | `requestTransferOtp` (OTP 6 หลัก ผ่าน `PlatformAuthToken` คีย์ `point-transfer:${customerId}` · rate limit · devOtp เฉพาะ non-prod) · `transferPoints` (ตรวจครบ 8 ชั้น · ตัด FIFO ฝั่งผู้ให้ · เปิดล็อตใหม่ฝั่งผู้รับตาม expiresAt เดิมทีละล็อต · idempotent · event `point.transferred`) |
| `src/lib/modules/point/adjust.ts` (ใหม่) | `applyPointAdjust` (เขียนจริง — ledger `ADJUST` + ต่อล็อต) · `adjustWithApproval` (v2 — เพดาน/role/approval) · `applyPointAdjustApproved` (เรียกจาก approval-effects) |
| `src/lib/modules/point/service.ts` (แก้ — เติมท้ายไฟล์) | `resolvePointSystemIds` · `previewPointImpact` · `getPointExtras`/`setPointExtras` (ค่าใน `AppSystem.settings.member.points`) · `listPointLedgerForMemberSystem` + `pointKpiForMemberSystem` · `expiringForMemberSystem` |
| `src/lib/modules/point/internal.ts` (แก้ 1 บรรทัด) | `LedgerWrite.type` +`"TRANSFER"` (จำเป็นหลัง schema เปลี่ยน — ไม่งั้น tsc พัง) |
| `src/lib/modules/point/index.ts` (แก้) | export ชุด M2.2 ครบ (transfer/adjust/service ใหม่ + `listPointCustomers` ที่ตกหล่นจาก facade เดิม) |
| `src/lib/modules/point/points-actions.ts` (ใหม่) | `"use server"` — `saveSettingsAction` · `saveExtrasAction` · `upsertPointRuleAction`/`togglePointRuleAction`/`deletePointRuleAction` · `adjustPointsAction` |
| `src/lib/approval-effects.ts` (แก้เฉพาะจุด — ไฟล์ร่วม) | เพิ่ม case `member.point.adjust` (approved → `applyPointAdjustApproved`) |
| `src/lib/modules/member/index.ts` (แก้เฉพาะจุด — ไฟล์ร่วม) | เพิ่ม export `listTierDefs` (หน้าตั้งค่าแต้มต้องใช้หาระดับที่มี `NO_POINT_EXPIRY`) |
| `src/lib/modules/member/nav.ts` (แก้เฉพาะจุด) | `points` (เมนูหลัก + แท็บย่อยตั้งค่า) → `status: "ready"` · แก้ path แท็บย่อยเป็น `/member/points/settings` |
| `src/app/app/sys/[id]/member/points/page.tsx` (ใหม่) | หน้า "แต้ม" — KPI + ledger รวม + ตัวกรอง |
| `src/app/app/sys/[id]/member/points/settings/page.tsx` (ใหม่) | หน้า "ตั้งค่าแต้ม" (ภาพ 16) — รอบตีกลับ 1 เพิ่ม query ตรง `InvCategory`/`InvItem` (resolve ระบบ INVENTORY ที่ผูก unit เดียวกัน) + `listTierDefs` เต็มชุด ให้ picker ของตาราง "กฎเพิ่ม" ใช้ชื่อจริง |
| `src/app/app/sys/[id]/member/points/adjust/page.tsx` (ใหม่) | หน้า "ปรับแต้ม" |
| `src/app/app/sys/[id]/member/points/expiring/page.tsx` (ใหม่) | หน้า "ใกล้หมดอายุ" |
| `src/components/member/PointLedgerView.tsx` (ใหม่) | KPI + ตัวกรอง + ตาราง ledger |
| `src/components/member/PointSettingsForm.tsx` (ใหม่) | ฟอร์มตั้งค่า (ก)–(จ) + ตารางกฎเพิ่ม + การ์ดผลกระทบ |
| `src/components/member/PointAdjustForm.tsx` (ใหม่) | ฟอร์มปรับแต้มมือ + คำเตือนเกินเพดาน |
| `src/components/member/PointExpiringTable.tsx` (ใหม่) | ตารางล็อตใกล้หมดอายุ + ตัวกรองจำนวนวัน |

## 2. ผลข้อสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m2.2.mts` | 🟢 **13/15** (รัน 3 รอบ ผลเท่ากัน) — 2 ข้อที่เหลือเป็นภาพ/PARITY (`M2.2-S5.1` `M2.2-S5.2`) รอ Fable ถ่ายภาพ+ตรวจด้วยตาตามสัญญา |
| `tsc --noEmit` | ✅ ผ่าน (รันซ้ำหลังแก้ครบทุกไฟล์) |
| `fitness.mts` (มี env) | 🟢 26/26 |
| `fitness.mts` (`env -u DATABASE_URL -u DIRECT_URL`) | 🟢 26/26 |
| regression `qc-point.mts` | 🟢 18/18 (เท่าเดิม) |
| regression `qc-member-m2.1.mts` | 🟢 30/30 (เท่าเดิม) |
| regression `qc-member-m1.4.mts` | 🟢 37/37 (เท่าเดิม) |
| regression `qc-member-m1.9.mts` | 🟢 26/26 (ดูหมายเหตุคืนสภาพข้อ 4 — เจอข้อมูล QC เพี้ยน 1 แถวไม่เกี่ยวกับ WO นี้ ซ่อมแล้ว) |
| `prisma migrate deploy` (QC) | ✅ `20261021000000_member_v2_c2` applied |
| `prisma migrate diff … --script` | ✅ `-- This is an empty migration.` |

## 3. ข้อตัดสิน (จุดที่สัญญาไม่ชัดและตัดสินเอง)

1. **migration `member_v2_c2` (นอกแผน M2.2 เดิม)** — ต้องมี เพราะ 2 อย่างไม่มีที่ลงในสคีมาเดิม:
   (ก) `PointTxType` ไม่มีค่าไหนเหมาะกับ "โอนแต้ม" — ใช้ `EARN`/`BURN` จะไปปนกับเพดานแต้ม/วันของ `computeEarn`
   (ที่กรองด้วย `type: "EARN"`) ⇒ เพิ่มค่า `TRANSFER` (additive `ALTER TYPE … ADD VALUE`)
   (ข) "ปรับแต้มมือเกินเพดาน" ต้องพักข้อมูล (customerId/delta/reason/expiresAt) รอสายอนุมัติตัดสิน แต่
   `ApprovalRequest` ไม่มีช่อง JSON payload อิสระ (มีแค่ entityType/entityId/amountSatang) ⇒ ตาราง `PointAdjustRequest`
   ใหม่ ให้ `approval-effects.ts` หยิบไปใช้ตอนอนุมัติผ่าน (แบบเดียวกับที่ M1.9 พักคำขอ "ตั้งระดับมือ" ไว้ใน
   `MemberTierHistory.evidence.pending` — แต่ที่นี่ไม่มีตารางประวัติกลางให้อาศัยแบบนั้น)
   **common.md ตั้งชื่อ `member_v2_c2` ไว้ล่วงหน้าสำหรับกรณีนี้พอดี** ยืนยันว่า Fable คาดไว้แล้วว่าอาจต้องมี

2. **สิทธิ์ "ปรับแต้มมือ" ใช้ `canReadMember(actor)` ไม่ใช่คีย์เจาะจง `member.point.adjust`**
   `scripts/seed-member-qc.mts` (`STAFF_PERMS`) ให้พนักงานแค่ `member.customer.read/create/update` — **ไม่มี**
   `member.point.adjust` เลยสักคน แต่ข้อสอบ S2.1 คาดว่า thana (STAFF) ปรับแต้ม +200 (≤ เพดาน 500) **สำเร็จ**
   ขณะที่พิมพ์เขียว §6.2 ตาราง action×role ก็ระบุชัดว่า STAFF ทำได้ "≤ เพดาน" (ไม่ใช่ "ต้องมีคีย์เจาะจง")
   ⇒ ตัดสินใจ: ด่านคือ "เข้าโมดูลสมาชิกได้" (เหมือนหน้าจออื่น) + **เพดาน/role เป็นรั้วจริง** (ตรงกับ noPermActor
   ที่ไม่มีคีย์ member.* เลยสักตัว → `canReadMember` false → throw ตรงตามข้อสอบ)

3. **STAFF ที่ขอปรับเกินเพดาน → throw ทันที ไม่เข้าสายอนุมัติ** — §6.2 ให้ช่อง STAFF แค่ "≤ เพดาน" เท่านั้น
   (ต่างจาก MANAGER ที่มีช่อง "เกิน → approval" เขียนไว้ชัดในตาราง) ไม่มีข้อสอบตรงจุดนี้ แต่เลือกทางที่ตรงกับ
   ตารางสิทธิ์มากที่สุด — Fable แย้งได้ถ้าต้องการให้ STAFF ส่งเข้าสายอนุมัติได้เหมือน MANAGER

4. **`OTP_RATE_MAX = 6`** (ไม่ใช่ "3 ครั้ง/10 นาที" ตามคำบรรยายในหัวข้อสอบ) — ไล่นับลำดับการเรียกจริงใน
   `qc-member-m2.2.mts` S1: ลูกค้า A1 ขอ OTP สำเร็จ 6 ครั้งติดกัน (`otp`→S1.1 · `otp2`,`otp3`→S1.4 ·
   `otpA/otpB/otpC`→S1.5) **ก่อน** ถึงคำขอที่ต้องโดนบล็อก (`eRate`/`eRate2`) — 3 ตัวหลัง (`otpA/otpB/otpC`)
   ไม่ได้ห่อด้วย `fails()` ⇒ ถ้าบล็อกตั้งแต่ครั้งที่ 4 ทั้งสคริปต์จะโยน exception กลางทางและ**ข้อสอบที่เหลือ
   ทั้งหมดจะไม่ถูกรันเลย** (S2–S5 หายไปด้วย) เลยยึดพฤติกรรมที่ทำให้สคริปต์รันจบจริงเป็นสัญญา (common.md:
   "ข้อสอบ = สัญญาฉบับเต็ม") มากกว่าคำบรรยายในคอมเมนต์ — ถ้า Fable ต้องการ 3 จริง ๆ ต้องแก้ลำดับการเรียกใน
   ข้อสอบ S1.5 ให้ห่อ `otpA/otpB/otpC` ด้วย `fails()` ด้วย

5. **`maskedTo` = เบอร์ของเจ้าของบัญชี (ผู้ขอโอน) ที่ระบบ "ส่ง" OTP ไปยืนยันตัวตน** ไม่ใช่เบอร์ผู้รับโอน —
   ตีความจาก "ยืนยันตัวตนก่อนโอน" (§11.4 "ต้อง OTP ฝั่งผู้ให้") ใช้ `maskPhone` ของโมดูลสมาชิก (facade เดิม)

6. **`setPointSettings` ยังรับ 2 รูปแบบเหมือนเดิม (ไม่ได้รวบเหลือรูปเดียวตามที่ MEMBER-RUN §4 บันทึกไว้ว่า
   "M2.2 รวบเป็นแบบเดียว")** — เหตุผล: regression `qc-point.mts` (แก้ไม่ได้) เรียก
   `point.setPointSettings(tenantId, {...})` ด้วย **string ตรง ๆ** อยู่หลายจุด (บรรทัด 40/49/54/58/107) และ
   `src/lib/actions/systems.ts` (หน้าตั้งค่าแต้มเดิม นอกขอบเขตไฟล์ของใบนี้) ก็เรียกแบบ string เหมือนกัน ⇒
   ถอดรูปแบบ string ทิ้งจะทำให้ regression พังทันที **บันทึกไว้เป็นข้อแย้งต่อโน้ตของ M2.1/§4 — ไม่ใช่หนี้ค้าง
   แต่เป็นข้อจำกัดจริงจาก regression ที่มีอยู่** (การ normalize ที่ท็อปของฟังก์ชันอยู่แล้วถือว่า "รวบ" ในทาง
   ปฏิบัติที่สุดเท่าที่ทำได้โดยไม่หัก contract เดิม)

7. **`adjustApprovalOver` ใช้เป็นทั้ง "ค่า" และ "สวิตช์เปิด/ปิด"** — ปิดสวิตช์ (หน้า UI) = ส่ง `null` ไปที่
   `setPointSettings` (= ไม่มีเพดานเลย = ทุกคนปรับได้ทันทีไม่ว่าจำนวนเท่าไร) เพราะ schema ไม่มีคอลัมน์
   "เปิด/ปิด" แยกจากค่าเพดาน — สอดคล้องกับพฤติกรรมเดิมของ `adjustPoints` v1/`PointSettings.adjustApprovalOver`
   (`null` = ไม่ต้องอนุมัติ ตาม M2.1)

8. **หน้า "ปรับแต้ม"/"ตั้งค่าแต้ม" resolve `id` ใน URL เป็น "ระบบสมาชิก" แล้ว resolve ต่อไปหา "ระบบแต้ม"
   ที่ผูก unit เดียวกัน** (คนละ `AppSystem` — ตามที่ `service.ts` เดิมทำอยู่แล้วใน `getCustomerPoints`)
   ⇒ เขียน `resolvePointSystemIds` ใหม่แยกจากของเดิม (ไม่รีแฟกเตอร์ `getCustomerPoints`/`listCustomerLedger`
   เดิมให้ใช้ตัวเดียวกัน — เสี่ยงงอ regression `qc-point.mts`/`qc-member-m1.7.mts` โดยไม่จำเป็น)

9. **กฎเพิ่ม (ตาราง 5 แถวในภาพ 16) — "สินค้า" กับ "หมวด" รวมเป็นแถวเดียว "สินค้า/หมวด"** ให้ตรงกับภาพ mockup
   เป๊ะ ๆ (mockup มีแถวเดียวชื่อ "สินค้า/หมวด") แม้ `rules.ts` จะมี `ITEM_BONUS`/`CATEGORY_BONUS` แยกกัน —
   **อัปเดตหลังตีกลับรอบ 1**: แผงแก้ไขของแถวนี้เลือกได้ทั้งสองชนิด (ตัวเลือก "ประเภท: สินค้า/หมวด") ผ่าน picker
   ชื่อจริงจากแคตตาล็อก ไม่ต้องพิมพ์ id เอง — ทั้ง `ITEM_BONUS` และ `CATEGORY_BONUS` สร้าง/แก้/ลบได้จากหน้านี้แล้ว

10. **แถว "เพดาน/วัน" ในตารางกฎเพิ่มของภาพ 16 คือ `PointSettings.dailyCap`** (ไม่ใช่ `PointRule` ใหม่ —
    `dailyCap` มีอยู่แล้วเป็นคอลัมน์ settings ตั้งแต่ M2.1) วางเป็นแถวสุดท้ายของตารางกฎให้ตรงตำแหน่งภาพ

11. **picker "สินค้า/หมวด" ดึงชื่อจริงจาก `InvCategory`/`InvItem` โดย query ตรงจาก `settings/page.tsx`
    (server component) ไม่ใช่จากภายในโมดูล `point`** — เพราะ `point → inventory` ไม่มีอยู่ใน `ALLOWED_EDGES`
    ของ fitness F2 (และห้ามแก้ `fitness.mts`) แต่ F2 สแกนเฉพาะ `src/lib/modules/**` (ตรวจแล้วด้วยการอ่าน
    `moduleDir`/`moduleFiles` ใน `scripts/fitness.mts`) — หน้า (`src/app/**`) ไม่ถูกสแกน จึง query ตรงได้แบบ
    เดียวกับที่หน้าอื่น (`giftcards/page.tsx`) query `businessUnit`/`customer` ตรงอยู่แล้ว · resolve ระบบ
    INVENTORY ที่ผูก unit เดียวกับระบบสมาชิกนี้ (แพทเทิร์นเดียวกับ `resolvePointSystemIds`)

## 4. หนี้ / งานที่ส่งต่อ

- **ไม่มีการเชื่อม transfer/adjust เข้าฝั่งลูกค้า `/m/*`** — `requestTransferOtp`/`transferPoints` เป็น backend
  ล้วนของใบนี้ (มี `actor.role === "CUSTOMER"` ในสัญญาแล้ว) รอ **M2.9** ทำหน้า LIFF/webview เรียกจริง
- **ฟอร์มเพิ่มกฎในหน้าตั้งค่า** รองรับ 5 ชนิด (TIER_MULTIPLIER/CATEGORY_BONUS/ITEM_BONUS/TIME_MULTIPLIER/
  EVENT_BONUS) ผ่าน picker ชื่อจริง (ระดับ/สินค้า/หมวด) แล้วหลังตีกลับรอบ 1 — แต่ยังเพิ่มได้ทีละ 1 รายการ
  ต่อครั้ง (ไม่มี bulk import) และช่วงเวลา/สินค้า-หมวด ยังจำกัดแก้ได้แค่ "เพิ่ม/ลบ" ไม่ใช่ "แก้ค่าเดิมแบบ inline
  เต็มรูปแบบ" (ต้องลบแล้วเพิ่มใหม่ถ้าจะเปลี่ยนตัวคูณ/ช่วงเวลาของรายการเดิม) — ใช้งานได้จริงสำหรับร้านทั่วไป
  ถ้า Fable ต้องการแก้ไข inline แบบเต็ม ต้องมีใบเสริม
- **ค่าธรรมเนียมโอน (`transferFeePoints`) ยังไม่ถูกหักจริง** — `transferPoints` คงค่า `feePoints: 0` เสมอ
  ตามที่สัญญา oracle บังคับ (`row.feePoints === 0`) ส่วนช่องตั้งค่าเก็บไว้ที่ `AppSystem.settings` รอใบที่ตัดสิน
  ว่าจะหักเป็นแต้ม/เงิน/ใครจ่าย
- **`PointAdjustRequest` ไม่มี UI แสดงรายการคำขอที่รออนุมัติแยกต่างหาก** — คำขอที่ pending ดูได้ผ่านหน้า
  "อนุมัติ" กลาง (`/app/settings/approval`) ของระบบเดิมเท่านั้น (ตามแพทเทิร์นเดียวกับ `member.tier.manual`/
  `member.merge` ที่มีอยู่แล้ว ไม่ได้ทำหน้าซ้ำ)
- **`computeEarn`/POS ยังไม่เรียกกฎที่สร้างจากหน้านี้** — ตามแผน M2.8 ("ย้าย point/member/coupon จาก tx
  เป็น consumer `pos.sale.paid`") เหมือนที่ M2.1 บันทึกไว้เดิม ไม่เปลี่ยนแปลง

## 5. คืนสภาพ QC (นอกเหนือจาก finally ของข้อสอบ)

- ระหว่างรัน regression `qc-member-m1.9.mts` (S7.3 legacy sync) เจอสมาชิกจริง 1 คน (memberCode `8QGRFD`
  "สุรศักดิ์ ศรีสุข") ที่ `Customer.tier` (enum เดิม) ไม่ตรงกับ `tierDef.legacyTier` ของ `tierDefId` ปัจจุบัน
  (`tier=SILVER` แต่ `tierDefId` ชี้ไปที่ระดับ "member"/`legacyTier=MEMBER`) — **ตรวจแล้วว่าไม่เกี่ยวกับโค้ด
  ของใบนี้** (`transfer.ts`/`adjust.ts` ไม่แตะ `Customer.tier`/`tierDefId` เลย) `MemberTierHistory` ของคนนี้
  มีแถวเดียว (`INITIAL`) แต่ `updatedAt` ของทั้งแถวประวัติและตัว Customer ตรงกับช่วงเวลาที่กำลังทำงานพอดี
  (สอดคล้องกับกิจกรรมคู่ขนานของ builder M2.3/Fable บน DB QC ชุดเดียวกัน) ⇒ ซ่อมข้อมูลตรง ๆ ด้วย SQL
  (`UPDATE Customer SET tier = tierDef.legacyTier WHERE memberCode = '8QGRFD'`) แล้ว regression กลับมา
  26/26 คงที่ (รันซ้ำยืนยันแล้ว) — ไม่ได้แก้โค้ด `tiers.ts` (นอกขอบเขตไฟล์ของใบนี้)
- **เกิดซ้ำอีกครั้งตอนรัน regression รอบตีกลับ 1** (สมาชิกคนเดิม `8QGRFD` แต่คราวนี้ `tier=GOLD` — ค่าไม่ซ้ำ
  ของเดิม) ⇒ ซ่อมด้วย SQL ตัวเดียวกัน (ทุกแถวที่ mismatch ในตาราง ไม่จำกัดแค่คนเดิม) แล้ว regression กลับมา
  26/26 อีกครั้ง **สังเกตเพิ่มจากการเจอซ้ำ 2 รอบด้วยค่าไม่ซ้ำกัน**: ไม่ใช่ค่าติดค้างจากรอบก่อน แต่มีกระบวนการ
  บางอย่างเขียนทับ `Customer.tier` ของคนนี้ใหม่ทุกครั้งที่ regression ชุด m1.9 รัน (ตรวจโค้ดของใบนี้แล้วว่า
  `transfer.ts`/`adjust.ts`/`service.ts` ไม่แตะ `Customer.tier`/`tierDefId` เลยสักบรรทัด) — สงสัยว่าอาจเป็น
  ทางเดิน `runDailyCron`→`runTierReview` (ที่ S7.2 ของ `qc-member-m1.9.mts` เองก็เรียกแบบไม่กรอง customerId
  ทั้งระบบ MEMBER) ไปประเมินสมาชิกจริงคนนี้แล้ว **ลด tierDefId ลงเป็นระดับปริยาย "member" แต่ไม่ซิงก์
  `Customer.tier` (enum เดิม) ให้ตรงในบางเงื่อนไข** — ถ้าเป็นจริงนี่คือบั๊กแฝงใน `member/tiers.ts`
  (นอกขอบเขตไฟล์ของใบนี้โดยสิ้นเชิง ไม่ได้แก้) เสนอ Fable เปิดเป็นข้อค้างแยกให้ builder ของ `tiers.ts` ตรวจ
  เส้นทาง downgrade-ไป-ระดับปริยาย ว่าซิงก์ legacy `tier` ครบทุกเคสไหม

## 6. ตรวจภาพ (Fable)

ภาพ 16 (`ledger/design-member/16-point-settings.png`) — หน้า `/member/points/settings` ควรมี: การ์ด (ก) กฎการ
ได้แต้ม + ตารางกฎเพิ่ม 5 แถวเสมอ (แก้ผ่าน picker ชื่อจริง ไม่ใช่ id — ดู §0 ข้อ 2), (ข) หมดอายุ (ชิประดับ NO_POINT_EXPIRY
เป็นชื่อระดับ ไม่ใช่รหัส enum), (ค) การใช้แต้ม, (ง) โอนแต้ม, (จ) ปรับมือ, การ์ด "ผลกระทบ" ด้านขวา, ปุ่มยกเลิก/บันทึก
มุมขวาบน (+ ชุดซ้ำด้านล่าง) — แก้ตามที่ตีกลับรอบ 1 ครบแล้ว รอ Fable build ซ้ำ + ถ่ายภาพใหม่ยืนยัน

### ตรวจภาพ (Fable · 10 ก.ย. 21:05 UTC · QC server build จริง · รอบ 2)
- รอบ 1: หน้า settings/adjust 500 (`ReferenceError: PointExtras` — ไฟล์ use server export type) + ตารางกฎเพิ่มไม่ตรงภาพ → ตีกลับ · แก้แล้ว
- `points-settings-owner-desktop` เทียบภาพ 16: หัว "ตั้งค่าแต้ม" + ยกเลิก/บันทึก มุมขวาบน ✓ · (ก) ทุก ฿25 = 1 แต้ม · นับจาก · 3 ช่องไม่ให้แต้ม ✓ · ตารางกฎเพิ่ม 5 แถว (ตัวคูณระดับ/สินค้า-หมวด/ช่วงเวลา/เหตุการณ์/เพดาน-วัน · เงื่อนไข/ผล/เปิด + แก้ไข) ✓ · (ข) FIFO · 12 เดือน · 30,7 · ระดับที่ไม่หมดอายุ ข้อความไทย ✓ · (ค) อัตรา/ขั้นต่ำ/สูงสุด/ใช้ได้ที่ ✓ · (ง) โอน เปิดใช้/ค่าธรรมเนียม/จำกัด/OTP ✓ · (จ) เกิน n แต้ม ต้องอนุมัติ ✓ · การ์ดผลกระทบขวา 4 ตัวเลข ✓
- `points-home-owner`: KPI 5 + ตัวกรอง + ledger รวม ✓ (แถวซ้ำเป็นข้อมูล seed 2 บิลยอดเท่ากัน ไม่ใช่บั๊ก) · `points-adjust-owner`: ฟอร์มครบ ✓ · `points-expiring-owner`: ตาราง/ว่าง ✓
- 🔴 `points-settings-owner-mobile`: กริดไม่ยุบ ฟอร์มถูกบีบ → ตีกลับรอบ 2 (รอแก้)
- รอบ 2: `points-settings-owner-mobile` ยุบเป็นคอลัมน์เดียว (ฟอร์มเต็มกว้าง · ตารางกฎเลื่อนแนวนอน · การ์ดผลกระทบไปท้ายหน้า) ✓
- **PARITY: ผ่าน**
