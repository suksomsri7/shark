# M3.5 — แนะนำเพื่อน (referrals) · โน้ตผู้ทำ

> 🔴 **migration `member_v2_h3` เป็นข้อตัดสินของผู้คุมงาน (11 ก.ย.) ไม่ใช่ข้อแย้งข้อสอบ** — ใบงาน/หัวข้อสอบเดิมเขียนว่า
> "ไม่มี migration · ตาราง ReferralProgram/Referral มีตั้งแต่ M1.1" แต่ตรวจแล้วไม่มีใน `prisma/schema` · `prisma/migrations` · QC DB
> (คิวรี `information_schema.tables ilike '%referral%'` = ว่าง) · builder หยุดถามก่อนเขียนโค้ด → ผู้คุมงานอนุมัติชื่อ
> `20261030000000_member_v2_h3` + เนื้อหาตามพิมพ์เขียว §4.3 บรรทัด 284–285 · ผู้คุมงานแก้คอมเมนต์หัวข้อสอบเอง (ORACLE-EDIT)

## 1. ไฟล์ที่ส่งมอบ

| ไฟล์ | ใหม่/แก้ | เนื้อหา |
|---|---|---|
| `prisma/migrations/20261030000000_member_v2_h3/migration.sql` | ใหม่ | enum `ReferralStatus` (PENDING/CONVERTED/REWARDED/REJECTED) · `ReferralRewardKind` (POINTS/VOUCHER) · ตาราง `ReferralProgram` (@@unique systemId) · `Referral` (@@unique tenantId+refereeCustomerId · @@index referrerCustomerId · tenantId+status+createdAt · systemId) · FK referrer→Customer CASCADE · referee→Customer SET NULL · additive ล้วน (ไม่มี DROP/DELETE/UPDATE) |
| `prisma/schema/referral.prisma` | ใหม่ | model 2 + enum 2 (ไฟล์แยก ไม่ชน member.prisma ที่ M3.4/M3.6 แก้) |
| `prisma/schema/member.prisma` | แก้เฉพาะจุด | Customer: `referralsMade` / `referralsReceived` (back-relation 2 บรรทัด) |
| `src/lib/core/scope.ts` | แก้เฉพาะจุด | `ReferralProgram: sys()` · `Referral: tenant` (ลงทันทีหลัง generate) |
| `src/lib/modules/member/referrals-shared.ts` | ใหม่ | ชนิด/ค่าปริยาย/ป้าย/`rewardLabel`/`renderShareText`/`referralLandingPath` (ไฟล์บริสุทธิ์ — client import ได้) |
| `src/lib/modules/member/referrals.ts` | ใหม่ | getProgram/setProgram/codeFor/attach/evaluateConversion/rewardBoth/reject/listReferrals/leaderboard/stats/referralsForMember + `resolveReferralLanding` · `onMemberJoined` · `onMemberCreatedEvent` · `onSalePaid` · `referralCounts` |
| `src/lib/modules/member/referrals-actions.ts` | ใหม่ | `"use server"` 3 action (บันทึก/สวิตช์/ปฏิเสธ) · `assertCan(... "member.referral.manage")` ตรง ๆ · ไม่ export type/const |
| `src/lib/modules/member/index.ts` | แก้เฉพาะจุด | facade (ชื่อมี referral กำกับ: `getReferralProgram` `setReferralProgram` `referralCodeFor` `attachReferral` `evaluateReferralConversion` `rewardReferralBoth` `rejectReferral` `listReferrals` `referralLeaderboard` `referralStats` `referralsForMember` …) |
| `src/lib/modules/member/profile.ts` | แก้เฉพาะจุด | `CreateMemberInput.device?` · `createMember` เรียก `referrals.onMemberJoined` หลัง tx (dynamic import · พังไม่ล้มการสมัคร) · `Member360.referrals {code, referred, converted}` + 2 count ใน `getMember360` |
| `src/lib/modules/member/nav.ts` | แก้เฉพาะจุด | `MEMBER_CAMPAIGN_NAV` + `referrals` (ready) |
| `src/lib/modules/member/journeys-shared.ts` | แก้เฉพาะจุด | ทริกเกอร์ `referral.joined` / `referral.converted` (กลุ่ม "แนะนำเพื่อน") — ข้อสอบ M3.3 ครอบตระกูล `referral.*` อยู่แล้ว (หัวไฟล์บรรทัด 9) ไม่มีข้อไหนห้าม |
| `src/lib/outbox-consumers.ts` | แก้เฉพาะจุด | `member.created` → `referralOnMemberCreated` (ตาข่ายเก็บตก · 400/404 = WARN แล้วจบ · อื่น ๆ โยน retry) · `referral.joined` / `referral.converted` = no-op + withAutomation |
| `src/lib/automation/labels.ts` | แก้เฉพาะจุด | `AUTOMATION_EVENTS` + 2 ตัว (ป้ายไทย) |
| `src/lib/webhooks/labels.ts` | แก้เฉพาะจุด | คอมเมนต์ 1 บรรทัด (ได้ 2 ตัวจาก spread — ประกาศซ้ำ = ข้อสอบนับ ≠ 1) |
| `src/lib/member-bridges.ts` | แก้เฉพาะจุด | `onPosSalePaid` ขั้นสุดท้าย → `member.referralOnSalePaid` |
| `src/app/app/sys/[id]/member/referrals/page.tsx` | ใหม่ | ภาพ 24 (requireTenant · 404-not-403) |
| `src/components/member/ReferralSettings.tsx` | ใหม่ | client: ซ้าย (รางวัล · กันโกง · ข้อความแชร์ LINE · รูปแบบลิงก์) + สวิตช์ "เปิดใช้งาน" หัวหน้าจอ |
| `src/components/member/ReferralDashboard.tsx` | ใหม่ | KPI 4 + ผู้แนะนำสูงสุด 5 (server) |
| `src/components/member/ReferralRecentTable.tsx` | ใหม่ | client: การแนะนำล่าสุด + ปฏิเสธในแถว (ไม่ใช่กล่องเด้ง) |
| `src/components/member/ReferralMemberCard.tsx` | ใหม่ | client: การ์ดภาพ 08 ขวา + `ReferralMemberTab` (ส่งผ่านช่อง `tabPanel` ที่ M3.4 เปิดไว้ใน Member360) |
| `src/app/app/sys/[id]/member/members/[memberId]/page.tsx` | แก้เฉพาะจุด | `?tab=referrals` โหลด `referralsForMember` → `tabPanel={reviewPanel ?? referralPanel}` (Member360.tsx ไม่ต้องแก้ — ใช้ช่องของ M3.4) |
| `src/app/m/[slug]/referral/page.tsx` + `src/components/member/MReferral.tsx` | ใหม่ | LIFF: โค้ด · QR (ลิงก์เต็ม · qrcode ฝั่งเซิร์ฟเวอร์) · แชร์ LINE (`liff.shareTargetPicker` → fallback `https://line.me/R/msg/text/?…`) · คัดลอกลิงก์ · สถิติของฉัน · เพื่อนที่แนะนำ |
| `src/app/r/[code]/page.tsx` | ใหม่ | โค้ด → ร้าน → `redirect(/m/<slug>/login?ref=<code>)` · ไม่พบ/ชนข้ามร้าน = หน้าแจ้ง `r-landing` |
| `src/components/member/MCard.tsx` | แก้ 1 บรรทัด | ปุ่มลัด "แนะนำเพื่อน" ชี้ `/m/<slug>/referral` (เดิมชี้ `/profile` เพราะยังไม่มีหน้า) |

QC DB: `migrate deploy` h3 ✓ · `migrate diff --from-config-datasource --to-schema prisma/schema --script` = **"This is an empty migration."** (ตอน deploy ยังไม่มี h/h2 ของใบอื่น)

## 2. ผลการทดสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m3.5` ตัวจริง | **4/5** — ตายที่ข้อสอบบรรทัด 103 (`M3.5-ERR`) ก่อนถึง S2.3 · ดู §4.1 (รันซ้ำ 2 รอบ ผลเดิม) |
| `qc-member-m3.5` สำเนาแก้ 4 จุด (§4) | **18/21** ×2 รอบ — ที่เหลือ S7.2/S7.3/S7.4 = ภาพ/PARITY ของผู้คุมงาน |
| `tsc --noEmit` | ✓ (0 error) |
| fitness มี env / ไม่มี env | 26/26 · 26/26 |
| regressions | m1.4 37/37 · m2.2 15/15 · m2.5 26/26 · m2.9 22/22 · m3.2 27/27 · **m3.3 31/32** (S2.9 — ไม่ใช่ของใบนี้ ดู §6 ข้อ 1) |
| grep `'use client'` | Referral*.tsx/MReferral.tsx import แค่ `referrals-shared` (บริสุทธิ์) + `referrals-actions` (server action) + MemberIcon/MShell — ไม่มีตัวไหนลากถึง `referrals.ts`/facade/prisma |
| อีโมจิ U+2600–27BF / hex สี | ไม่มี (ใช้ `→` `≥` `…` ซึ่งอยู่นอกช่วง และมีใช้ในไฟล์เดิมแล้ว) |

## 3. ข้อตัดสินของ builder (จุดที่สัญญาไม่ชัด)

1. **มูลค่า voucher FIXED ในโปรแกรม = บาท · ตอนออกใบคูณ 100** — `Voucher.value` ของ FIXED เป็นสตางค์ (`voucher.prisma:19,59` · `faceValueSatang` · `adhocLabel` ใช้ `baht(value)`) ขณะที่โปรแกรม/หน้าจอ/ค่าปริยายของข้อสอบเองพูดว่า "voucher ฿100" (`value: 100`) ⇒ ส่งตรงจะได้ใบ **฿1.00** · คูณที่ `payReward` ที่เดียว (PERCENT ใช้ตรง) · ขัดข้อสอบ S3.2 (§4.2)
2. **ทั้งสองทางเข้าตอนสมัครทำงานจริง**: `createMember` เรียก `onMemberJoined` ทันทีหลัง tx (ผู้แนะนำเห็นไทม์ไลน์ทันที · SIGNUP ได้รางวัลทันที — S2.1/S3.4/S4.1 ต้องการแบบนี้) + คิว `member.created` เรียกซ้ำแบบ idempotent (payload.referrerId หรือ sourceDetail.referralCode) เป็นตาข่ายเก็บตก
3. **ลำดับตรวจของ `attach`**: โค้ดไม่มีจริง → throw ก่อน (แม้เพื่อนผูกไว้แล้ว — S2.2 ต้องการ) → เพื่อนมีแถวแล้วคืนแถวเดิม → แนะนำตัวเอง → ไม่ใช่สมาชิกใหม่ (createdAt เกิน 24 ชม. หรือมีบิล PAID) → (fraudPhoneDevice) เบอร์ของเพื่อน/ที่ส่งมา = เบอร์ผู้แนะนำ → fingerprint ซ้ำกับแถวใดของผู้แนะนำคนนี้ (ทั้งที่เขาเป็นผู้แนะนำ หรือแถวที่เขาเคยถูกแนะนำ) · ไม่มีคอลัมน์ `Customer.deviceFingerprint` (ผู้คุมงานสั่งไม่เพิ่ม) — เก็บใน `refereeContact.fingerprint` + เบอร์แบบปิดบัง `phoneMasked` (ไม่เก็บเบอร์เต็มซ้ำ)
4. **REJECTED ไม่ยิง event/ไทม์ไลน์** — `referral.joined` + `REFERRAL_JOINED` เฉพาะ PENDING (แนะนำตัวเอง/โกงไม่ใช่ "เพื่อนสมัคร")
5. **โปรแกรมปิด (§11.7 "ที่ PENDING ยังนับต่อ 30 วัน")**: แถวที่เกิด **ก่อน** ปิดแปลงได้ภายใน 30 วันนับจาก `ReferralProgram.updatedAt` · แถวที่เกิดระหว่างปิด = PENDING รอร้านเปิดใหม่ (S4.2) · ข้อจำกัด: ไม่มีคอลัมน์ "ปิดเมื่อ" ⇒ ใช้ `updatedAt` แทน (แก้ค่าอื่นระหว่างปิด = นับ 30 วันใหม่) — หนี้ §6 ข้อ 3
6. **เพดานรายเดือน** = นับแถวของผู้แนะนำที่ `convertedAt` อยู่ในเดือนไทยนี้ + ผู้แนะนำได้รางวัลจริง (ไม่ capped) · ตัดสินใต้ `pg_advisory_xact_lock` ต่อผู้แนะนำ แล้ว **จองผลไว้ใน `referrerRewardRef` ก่อนจ่าย** (สองบิลพร้อมกันไม่ทะลุเพดาน · retry ใช้ผลที่จองไว้ ไม่นับใหม่) · `$executeRaw` ไม่ใช่ `$queryRaw` (ฟังก์ชันคืน void — adapter pg อ่านไม่ได้ · เจอจริงตอนรันสำเนา)
7. **FIRST_PURCHASE**: มี saleId → ยึดยอดจริงบนบิล (ต้องเป็นบิล PAID ของเพื่อน) ไม่เชื่อ netSatang ที่ส่งมา · ไม่มี saleId → ใช้ netSatang (S3.1) · บิลไหนถึงขั้นต่ำก็นับ (ไม่จำกัดแค่บิลแรกจริง ตามหัวข้อสอบ) · โปรแกรม SIGNUP + ทริกเกอร์ PURCHASE (แถวที่ค้างจากตอนปิด) = แปลงได้
8. **ชื่อใน facade มีคำว่า referral กำกับ** (`reject`/`stats`/`attach` ชนง่ายกับโมดูลอื่น) — regex S6.2 ผ่านเพราะชื่อเดิมอยู่ใน `x as y`
9. **`pointsEarned` = แต้มที่ผู้แนะนำได้จริง** (REWARDED · ไม่ capped · ไม่ skipped) — ไม่นับค่าหน้าที่ติดเพดาน (ขัด S5.2/S5.3 §4.3)
10. **ต้นทุน/คน** = (แต้มที่จ่ายจริง × `PointSettings.burnRateSatang` + มูลค่าหน้าใบ voucher FIXED) ÷ จำนวนที่แปลง · voucher PERCENT = 0 (ไม่มีมูลค่าหน้าใบ — กติกาเดียวกับ `faceValueSatang` ของ M2.5) · **ยอด 90 วันแรก** = ยอดบิล PAID ภายใน 90 วันหลังสมัครเฉลี่ยต่อเพื่อน · เทียบกับสมาชิกที่ไม่ได้มาจากการแนะนำที่สมัครช่วงเดียวกัน (สูงสุด 2,000 คน)
11. **หน้า admin ใช้หน้าต่าง 30 วัน** (ตามป้าย "30 วันล่าสุด" ในภาพ 24) · service ค่าปริยาย 90 วันตามสัญญา
12. **`/r/[code]` ชี้หน้า `/m/<slug>/login?ref=`** ไม่ใช่ `/join` — หน้า join เป็นของ M3.11 (วันนี้เปิด = 404 → S7.3 ที่ต้องการ 200 หลัง redirect จะตก) · ปลายทางอยู่ที่ `referralLandingPath()` บรรทัดเดียวใน `referrals-shared.ts` ให้ M3.11 สลับ · เป็น page ไม่ใช่ route (ต้องมีหน้าแจ้งเมื่อโค้ดไม่พบ/ชนข้ามร้าน — ไม่เดาร้าน)
13. **ข้อความแชร์ปริยาย** มีตัวแปร `{ร้าน}` `{รางวัลเพื่อน}` `{link}` (ไม่ฮาร์ดโค้ดชื่อร้าน/มูลค่า) · บันทึกต้องมี `{link}` (ไม่งั้น throw ไทย) · ยาวไม่เกิน 500
14. **fallback แชร์** ใช้ `https://line.me/R/msg/text/?…` (ลิงก์ทางการที่แทน `line://msg/text/` ซึ่ง LINE เลิกแนะนำแล้ว) — หัวข้อสอบเขียน `line://` แต่ไม่มีข้อตรวจ
15. **สิทธิ์**: อ่าน = `canReadMember` (read-โดยนัย) + ขอบเขตสาขาจากสาขาหลักของ **ผู้แนะนำ** · ตั้งค่า/ปฏิเสธ = `member.referral.manage` · การ์ด 360 ของสมาชิกนอกสาขาหลัก (ที่ getMember360 ให้เห็นเพราะเคยมาสาขาตน) = กล่องแจ้ง ไม่ทำหน้าพัง

## 4. ข้อแย้งข้อสอบ (หลักฐาน) — ผู้คุมงานตัดสิน · builder ไม่ได้แตะไฟล์ข้อสอบ

สำเนาที่ใช้พิสูจน์ = `qc-member-m3.5.mts` + 4 จุดด้านล่าง (ลบสำเนาแล้ว) → **18/21 ×2 รอบ** · รันสำเนาแยกทีละจุดเพื่อยืนยันว่าแต่ละจุดจำเป็น

### 4.1 🔴 บรรทัด 103 — `mkCust("เบอร์ซ้ำ", { phone: undefined })` ⇒ ข้อสอบตายทั้งชุดที่ S2.3
`mkCust` spread `...extra` ทับ `phone: phoneN()` ด้วย `undefined` → `createMember` ไม่มีทั้งเบอร์และอีเมล → throw ตามกติกาเดิมของ M1.4
```
💥 MemberInputError: ต้องมีเบอร์โทรหรืออีเมลอย่างน้อย 1 อย่าง เพื่อใช้ยืนยันตัวสมาชิกครั้งต่อไป
    at Object.createMember (src/lib/modules/member/profile.ts:656:11)
    at mkCust (scripts/qc-member-m3.5.mts:66:78)
    at <anonymous> (scripts/qc-member-m3.5.mts:103:20)
JSON_SUMMARY {"total":5,"passed":4,"findings":[{"id":"M3.5-ERR","sev":"CRITICAL"}]}
```
เสนอ: `{ phone: undefined, email: \`dup-${tag}@qc.local\` }` (เจตนาข้อนี้คือ "เพื่อนไม่มีเบอร์ แต่ device.phone = เบอร์ผู้แนะนำ" → REJECTED — ด้วยสำเนาแก้จุดนี้ dupR = REJECTED "เบอร์/อุปกรณ์ซ้ำ" ✓)

### 4.2 🔴 S3.2 — 2 ปัญหาในข้อเดียว
**(ก) แข่งกับคิว**: `buy()` → `pos.createSale` ยิง `pos.sale.paid` แล้ว `scheduleDrain()` แบบ fire-and-forget (นอก request) · ข้อสอบอ่าน `rf(rB.id)` ทันทีโดยไม่ drain ⇒ แถวยัง PENDING เสมอ (consumer ตามพิมพ์เขียว §9.1 เป็น async โดยตั้งใจ — ห้ามแตะ tx ของ POS) · M2.8/M3.3/M3.7 ทุกข้อที่ตรวจผลหลังบิลใช้ `drainOutbox` ก่อนอ่าน
สำเนา (แก้ 4.1 + 4.2ข + 4.3 · **ไม่ drain**):
```
❌ [M3.5-S3.2] … act st=PENDING conv=null balΔ=0 led=false v={} refs={"a":null,"b":null} ob=false
💥 MemberInputError: เพื่อนยังไม่ถึงเงื่อนไขของโปรแกรม — ยังจ่ายรางวัลไม่ได้   ← S3.3 rewardBoth(PENDING) → ตายทั้งชุด 7/9
```
เสนอ: `await drainOutbox(CONS, { limit: 300 })` ×2 หลัง `buy(B, 60_000)` (ย้าย import drain ขึ้นมาก่อน S3)
**(ข) หน่วยของ voucher**: `Number(vB.value) === 100` — voucher FIXED เก็บเป็นสตางค์ (ข้อตัดสิน §3 ข้อ 1) ⇒ ใบ ฿100 ถูกต้องคือ 10,000
สำเนา (แก้ 4.1 + drain + 4.3 · **ไม่แก้หน่วย**) — ทุกอย่างอื่นผ่าน:
```
❌ [M3.5-S3.2] … act st=REWARDED conv={"saleId":"…","trigger":"PURCHASE","netSatang":60000} balΔ=300 led=true v={"k":"FIXED","v":10000,"ref":{"side":"referee",…,"referralId":"…"}} refs={"a":{"kind":"POINTS","label":"300 แต้ม","points":300,"ledgerId":"…"},"b":{"kind":"VOUCHER","label":"voucher ฿100","voucherId":"…"}}
JSON_SUMMARY 17/21
```
เสนอ: `Number(vB.value) === 10_000` (หรือถ้าผู้คุมงานตัดสินว่าโปรแกรมเก็บสตางค์ ต้องแก้ค่าปริยาย S1.1 `value === 100` เป็น 10,000 ด้วย — ปัจจุบันข้อสอบขัดกันเอง)

### 4.3 🟠 S5.2 + S5.3 `pointsEarned === 320` ขัด S4.1 ของข้อสอบเอง
S4.1 บังคับ: cap 2 · A ได้รางวัลเดือนนี้แล้ว 2 (B แต้ม 300, G voucher 10%) ⇒ H1..H3 **ติดเพดานทั้งหมด** และ `bal(A) === balA1` (ไม่ได้แต้มเพิ่มเลย) — ผ่านจริง · แต้มที่ A ได้จากการแนะนำจึงเป็น 300 เท่านั้น ส่วน "300+10+10" สมมติว่า H1/H2 ได้ 10 แต้ม ซึ่ง S4.1 ห้าม (ไม่มีนิยาม pointsEarned ที่ได้ 320 โดย S4.1 ยังผ่าน: นับค่าหน้าแม้ติดเพดาน = 330)
สำเนา (แก้ 4.1 + 4.2 · **คง 320**):
```
✅ [M3.5-S4.1] monthlyCap 2: … H1..H3 REWARDED แต่ผู้แนะนำไม่ได้แต้มเพิ่ม
❌ [M3.5-S5.2] … act top={"referred":7,"converted":5,"pointsEarned":300,"vouchersEarned":1} stats={"referredMembers":7,"conversionPct":71,"costPerMemberSatang":2730,"first90dSpendSatang":18571,"vsAvgPct":-99}
❌ [M3.5-S5.3] … act fm={"code":true,"conv":5,"pts":300,"tree":11} c360={"code":"…","referred":7,"converted":5}
JSON_SUMMARY 16/21
```
เสนอ: 320 → 300 ทั้งสองข้อ

### 4.4 ข้อสังเกต (ไม่แย้ง)
- S7.3 `r-landing` ต้องการ 200 หลัง redirect — ใบนี้ชี้ `/login?ref=` จึงได้ 200 · ถ้าผู้คุมงานต้องการ `/join` ตามตัวอักษร จะเป็น 404 จนกว่า M3.11 (ข้อตัดสิน §3 ข้อ 12)
- `seed-member-qc.mts` ลบร้านด้วยรายชื่อ model ตายตัว — `Referral` หายตาม FK cascade ของ Customer แต่ `ReferralProgram` (ไม่มี FK) ค้างเป็นแถวกำพร้า (ไม่ชนอะไร — systemId ใหม่ทุกรอบ) · ถ้าจะเก็บให้สะอาดเพิ่ม `"referral", "referralProgram"` ในรายชื่อ (ไฟล์ของผู้คุมงาน)

## 5. คืนสภาพ QC
ข้อสอบ/สำเนาคืนสภาพเองใน finally (ลูกค้า/referral/voucher/ledger/program) · สำเนา `scripts/tmp-m35-*.mts` ลบแล้วทั้งหมด · migration h3 อยู่บน QC DB แล้ว

## 6. หนี้ / เรื่องที่ยังค้าง
1. **M3.3-S2.9 แดง 31/32 — ไม่ใช่ของใบนี้**: `git diff src/lib/modules/member/journeys.ts` เป็นงานของ builder M3.4 (REQUEST_REVIEW จาก stub → ของจริง · `REVIEW_REQUESTED.refId` ไม่ใช่ saleId แล้ว · `act=true/false`) · ใบนี้แตะ `journeys-shared.ts` แค่เพิ่ม 2 ทริกเกอร์
2. **รวมสมาชิก (mergeMembers)** ยังไม่ย้าย Referral ของคนที่ถูกรวม (ผู้แนะนำที่ถูกรวม = แถวยังชี้คน MERGED · สถิติ/อันดับตกหล่น) — ควรต่อ `onMerge` hook แบบ voucher/สแตมป์ (M3.7/M3.F)
3. ไม่มีคอลัมน์ "ปิดโปรแกรมเมื่อ" — กติกา 30 วันหลังปิดใช้ `updatedAt` (§3 ข้อ 5) · ถ้าต้องแม่นให้เพิ่ม `disabledAt` ในใบถัดไป
4. แถวค้าง `CONVERTED` (จ่ายล้มกลางทางในสะพานขาย — สะพานกลืน error เป็น WARN) จ่ายต่อเมื่อเพื่อนมีบิลถัดไป/สมัครซ้ำเท่านั้น · ยังไม่มี cron เก็บตก — ควรเพิ่มใน cron รายชั่วโมง (M3.7/M3.F)
5. `/r/[code]` → `/login?ref=` · หน้า login ยังไม่ส่ง `ref` ต่อไปหน้าสมัคร — **M3.11 ต้อง**: สลับ `referralLandingPath` เป็น `/join` + ส่ง `referralCode` + `device.fingerprint` เข้า `createMember` (รับไว้แล้วใน `CreateMemberInput.device`)
6. REST/AI ops ของแนะนำเพื่อน (อ่านโปรแกรม/รายการ/อันดับ) = M3.10
7. ทางเข้าหน้า LIFF แนะนำเพื่อน: ปุ่มลัดในบัตรสมาชิก (MCard) + ลิงก์ตรง/ริชเมนู LINE · แถบล่าง 4 ปุ่มคงตามภาพ 09
8. `stats`/`leaderboard` อ่านแถวสูงสุด 5,000/20,000 แล้วรวมใน JS — ร้านใหญ่มากควรย้ายเป็น groupBy/รายงาน M3.8

## 7. ก่อน push/deploy prod (ฝากผู้คุมงาน)
- migration `20261030000000_member_v2_h3` additive ล้วน (CREATE TYPE ×2 · CREATE TABLE ×2 · INDEX ×6 · FK ×2) — ไม่แตะแถวเดิม ไม่ต้องนับอะไรบน prod ก่อน · ตรวจ `_prisma_migrations` หลัง deploy ตามปกติ
- ลำดับกับใบขนาน: h (M3.4) · h2 (M3.6) · h3 (ใบนี้) — h3 ไม่ขึ้นกับสองใบนั้น

## 8. ข้อมูลสำหรับถ่ายภาพ
- harness `visual-member.mts` WO `3.5` เตรียมเอง (TMP35): โปรแกรมเปิด SIGNUP · สมาชิก 1 แนะนำ 3 + สมาชิก 2 แนะนำ 2 (REWARDED) · สมาชิก 1 แนะนำตัวเอง (REJECTED) · ปิดโปรแกรมแล้วสมัคร "รอแปลง" (PENDING) · เปิดคืน
- หน้า admin `/member/referrals` (owner desktop+mobile): สวิตช์ "เปิดใช้งาน" หัวขวา · ซ้าย 3 การ์ด + ปุ่มบันทึก · ขวา KPI 4 (หน้าต่าง 30 วัน) · ผู้แนะนำสูงสุด (อันดับ 1–3 ป้ายดำ) · การแนะนำล่าสุด (รอ / สำเร็จ / ถูกปฏิเสธ · แนะนำตัวเอง / จ่ายแล้ว)
- 360 `?tab=referrals` (สมาชิก 1): การ์ดโค้ด + คัดลอก · ปุ่มคัดลอกลิงก์แชร์ LINE · 3 ช่อง แนะนำแล้ว/สำเร็จ/แต้มที่ได้ · ต้นไม้ (ชิป สำเร็จ · ฿ยอดบิลแรก / รอซื้อครั้งแรก / ถูกปฏิเสธ)
- LIFF `/m/<slug>/referral` (`--user customer:<สมาชิก 1>` mobile) · `/r/<โค้ดสมาชิก 1>` → `/m/<slug>/login?ref=<โค้ด>` (200)
- มือถือ: ตารางอยู่ใน `overflow-x-auto` ภายในการ์ด (min-w-0) · กริดหลัก `grid-cols-1 lg:grid-cols-[400px_1fr]` · KPI `grid-cols-2 xl:grid-cols-4`

### ตรวจภาพ
_(ผู้คุมงาน Opus 5 · 11 ก.ย. ~11:00 UTC · build QC หลังรวมทั้งชุด 3.4/3.5/3.6/3.9 · เปิดดูทุกภาพเทียบ mockup ด้วยตาแล้ว)_
- **referrals-owner desktop (ภาพ 24)**: ตรง — หัว "แนะนำเพื่อน" + สวิตช์เปิดใช้งาน · ซ้าย: รางวัล (ผู้แนะนำ แต้ม 300 · เพื่อน voucher ฿100 อายุ 30 วัน · ให้เมื่อ · จำกัด 10 ครั้ง/เดือน/คน) · กันโกง (เบอร์ซ้ำ · device fingerprint + ชิป "เปิดอยู่") · ข้อความแชร์ LINE + ตัวแปร + รูปแบบลิงก์ `…/ref/{โค้ด}` · ขวา: KPI 4 (สมาชิกจากการแนะนำ · อัตราแปลง · ต้นทุน/คน · ยอด 90 วันแรก) · ผู้แนะนำสูงสุด (อันดับวงดำ · แนะนำ/สำเร็จ/รางวัลที่ได้) · การแนะนำล่าสุด (สมัคร · ซื้อครั้งแรก · ชิปสถานะ สำเร็จ/รอ/ปฏิเสธ-เหตุผล · จ่ายแล้ว/ปุ่มปฏิเสธ)
- ต่างจาก mockup (ยอมรับ): ช่องรางวัลซ้อน 2 บรรทัด (ชนิด → จำนวน) แทนแถวเดียว · ปุ่ม "บันทึกการตั้งค่า" · รูปแบบลิงก์ใช้โดเมนของคำขอ (QC = 127.0.0.1)
- **แก้โดยผู้คุมงาน**: (1) 🔴 ลิงก์ `/r/<code>` ชนหน้าใบเสร็จบัญชี `(store)/r/[token]` → `next build` ล้ม → ย้ายเป็น `/ref/[code]` (ORACLE-EDIT §4) (2) select ชนิดรางวัลถูกตัดคำ "voucher ส่วนลดบา" → ป้าย "voucher ฿" / "voucher %" แบบ mockup
- **referrals-owner mobile**: ไม่ล้น · การ์ดตั้งค่าเต็มกว้าง · KPI 2×2 · ตารางอยู่ใน overflow-x-auto
- **member-referrals-owner (ภาพ 08 ขวา)**: แท็บ "แนะนำเพื่อน" ใน 360 — โค้ด + ลิงก์ + ต้นไม้เพื่อนที่แนะนำ + สถานะ
- **LIFF /m/[slug]/referral (customer)**: การ์ด "ชวนเพื่อนมาเป็นสมาชิก รับรางวัลทั้งคู่" + QR + โค้ดของฉัน + แชร์ทาง LINE (ดำ) + คัดลอกลิงก์ · สถิติ 3 ช่อง · เพื่อนที่ฉันแนะนำพร้อมสถานะ · **/ref/<code>** → หน้าเข้าสู่ระบบของร้าน (จนกว่า M3.11 มี /join)
- **PARITY: ผ่าน**
