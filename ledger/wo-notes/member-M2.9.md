# WO M2.9 — ฝั่งลูกค้า `/m/*` (LIFF + WebView แอป) · builder Opus

> session ลูกค้าแยกจากพนักงาน · บัตร QR token 24 ชม. · wallet · โปรไฟล์แก้เอง · consent/PDPA · หน้า 5 จอ (ภาพ 09)

## 1. ไฟล์ส่งมอบ

| ไฟล์ | สถานะ | หมายเหตุ |
|---|---|---|
| `prisma/schema/customer-session.prisma` | **ใหม่** | `CustomerSession` · `CustomerOtp` (ไม่มี FK ข้ามโมดูล) |
| `prisma/schema/member.prisma` | แก้ | `Customer +cardTokenHash +cardTokenExpiresAt` · `PrivacyRequestType +ERASE` · `MemberChannelIdentity.customer` relation (+`Customer.identities`) |
| `prisma/migrations/20261024000000_member_v2_f2/` | **ใหม่** | additive ล้วน (CREATE TABLE/INDEX · ADD COLUMN · ALTER TYPE ADD VALUE) · apply บน QC แล้ว |
| `prisma/migrations/20261024000100_member_v2_f2_identity_fk/` | **ใหม่** | FK `MemberChannelIdentity.customerId → Customer.id` (ON DELETE CASCADE) + ลบแถวกำพร้าก่อนผูก — ดู §3 ข้อ 1 |
| `src/lib/core/scope.ts` | แก้เฉพาะจุด | ลงทะเบียน `CustomerSession` / `CustomerOtp` (แกน tenant) |
| `src/lib/modules/member/customer-session.ts` | **ใหม่** | requestOtp · verifyOtp · loginWithLine · mintCustomerSession · getCustomerSession · revokeCustomerSession · revokeAllCustomerSessions · requireCustomer · customerActor · sweepCustomerAuth · `__resetCustomerOtpLimit` |
| `src/lib/modules/member/me.ts` | **ใหม่** | meGet · meUpdate · meCard · rotateCardToken · resolveCardToken · `MeResult<T>` |
| `src/lib/modules/member/me-actions.ts` | **ใหม่** | `"use server"` — requestOtp/verifyOtp/logout · updateMyFields · setMyConsent · requestMyExport/Erase · acceptPolicy · rotateMyCard · **lookupCardTokenAction** (ทางเข้าพนักงาน) |
| `src/lib/modules/member/profile.ts` | แก้เฉพาะจุด | `export` `resolveLookupNames` (ตัวแปลง id→ชื่อ ตัวเดียวกับหน้า 360) ให้ `me.ts` ใช้ |
| `src/lib/modules/member/privacy.ts` | แก้เฉพาะจุด | source `LIFF` ของ actor ลูกค้า · `requestErase` รับ `{via, reason}` · คำขอของลูกค้า = type `ERASE` + ไม่ลบทันที |
| `src/lib/modules/member/index.ts` | แก้เฉพาะจุด | facade: getCustomerSession · mintCustomerSession · revokeCustomerSession · sweepCustomerAuth · resolveCardToken · meCard/meGet/meUpdate + type |
| `src/lib/platform/cron.ts` | แก้เฉพาะจุด | `customerAuthSwept` (ล้าง OTP/session หมดอายุรายวัน) |
| `src/app/m/[slug]/{page,layout,login,card,wallet,profile,history}` | **ใหม่** | หน้า 5 จอ + เปลือกมือถือ + แถบล่าง 4 + ทางเข้า `/m/<slug>` → บัตร |
| `src/app/m/[slug]/auth/line/route.ts` | **ใหม่** | POST id_token → ตรวจกับ `https://api.line.me/oauth2/v2.1/verify` → ออก cookie |
| `src/components/member/{MShell,MNav,MCard,MWallet,MProfile,MHistory,MLoginForm}.tsx` | **ใหม่** | UI ตามภาพ 09 |
| `src/components/member/MemberIcon.tsx` | แก้เฉพาะจุด | +9 ไอคอน (qr · wallet · clock · bell · mail · edit · out · box · menu) |

## 2. ผลข้อสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m2.9` | **21/22** (รอบตีกลับ) — ตกเฉพาะ `S5.3` (บรรทัด PARITY ของ Fable) · `S5.2` เขียวจากภาพที่ Fable ถ่ายไว้ (ต้องถ่ายใหม่หลังรอบนี้) |
| `tsc --noEmit` | ✅ |
| `fitness` (มี env / ไม่มี env) | ✅ 26/26 ทั้งสองโหมด |
| `qc-member-m2.7` | ✅ 22/22 |
| `qc-member-m2.8` | ✅ 30/30 |
| `qc-member-m1.7` | ✅ 26/26 |
| `qc-member-m1.4` | ✅ 37/37 |
| `qc-acc-v2-pos-lines` | ✅ 87/87 |
| `qc-chat-member-autolink` | ✅ 11/11 |
| `prisma migrate deploy` (QC) | ✅ · `migrate diff` = **"This is an empty migration."** |

## 3. ข้อตัดสิน (จุดที่สัญญาไม่ชัด — ตัดสินเองพร้อมเหตุผล)

1. **เพิ่ม relation `MemberChannelIdentity.customer` + migration ใบที่สอง**
   ข้อสอบ `S1.4` ค้นด้วย `where: { customer: { memberSystemId } }, include: { customer: true }` แต่ schema เดิมไม่มี relation ⇒ ข้อสอบพังทั้งไฟล์ (ERR)
   เลือก "แก้ schema ให้ตรงกับที่ข้อสอบสมมติ" แทนการรายงานว่าข้อสอบผิด เพราะ relation นี้ **อยู่ในโมดูลเดียวกัน** (แบบเดียวกับ `MemberActivity.customer`) และ `onDelete: Cascade` ปิดช่องโหว่จริง: id ช่องทางที่ค้างอยู่หลังลบสมาชิก = กุญแจเข้าบัญชีที่ไม่มีเจ้าของ
   ต้องเป็น **migration แยกใบ** (`…000100_member_v2_f2_identity_fk`) เพราะใบ `member_v2_f2` ถูก apply บน QC ไปแล้ว — แก้ไฟล์เดิม = checksum ไม่ตรง `migrate deploy` ล้ม
   ⚠️ **prod**: ใบนี้มี `DELETE` แถวกำพร้าก่อนผูก FK (บน QC = 0 แถว) — ตั้งใจให้ deploy ไม่ล้มถ้า prod มีขยะ
2. **คำขอลบข้อมูลของลูกค้า = ชนิดใหม่ `ERASE` และไม่ลบทันทีเด็ดขาด** (ข้อสอบ S4.2 บังคับ `type ERASE` + `PENDING`)
   ของเดิม (M1.7) `requestErase` ใช้ `DELETE` และ "ไม่มีนโยบายอนุมัติ = ลบทันที" ⇒ ปุ่มเดียวในไลน์ลบประวัติทั้งชีวิตตัวเองโดยไม่มีใครเห็น
   ⇒ แยก 2 เส้น: ลูกค้ากดเอง = `ERASE` + `PENDING` เสมอ (ยื่นคำขออนุมัติให้ร้านเห็น) · ร้าน/ระบบเปิดคำขอ = `DELETE` พฤติกรรมเดิมทุกประการ (M1.7 26/26 ยืนยัน)
   `applyEraseApproved` / `sweepAutoErase` / การกันคำขอซ้ำ รับทั้ง 2 ชนิดแล้ว
3. **`setConsent` ของ actor ลูกค้ารับที่มา `LIFF` เพิ่มจาก `CUSTOMER_SELF`** (S4.1 ส่ง `source: "LIFF"`) — ที่มาของพนักงาน/นำเข้า/API ยังห้ามเหมือนเดิม (M1.7 S2.4 เขียว)
4. **token บัตร = HMAC(SESSION_SECRET, `customerId:เวลาหมดอายุ`)** ไม่ใช่ random ที่ต้องเก็บของดิบ
   สัญญาบังคับ 2 อย่างพร้อมกัน: "เก็บแค่ hash" + "เรียกซ้ำได้ token เดิม" ⇒ ต้อง **คำนวณซ้ำได้** จากสิ่งที่อยู่ใน DB (id + `cardTokenExpiresAt`)
   ผลพลอยได้: เปิดหน้าบัตรจากคนละ instance/คนละเครื่องได้ QR เดิม (ถ้าใช้แคชในหน่วยความจำจะได้ QR ใหม่ทุก instance แล้ว QR ที่ลูกค้าเปิดค้างไว้ตายเงียบ ๆ)
   `rotateCardToken` กันกดรัวในมิลลิวินาทีเดียวกันด้วยการบวกเวลาหมดอายุ 1 ms
5. **AuditLog `member.me.update` ใช้ `actorType: "SYSTEM"` + `after.by = "customer"`** — enum `ActorType` ของ core ยังไม่มีค่า `CUSTOMER` และการเพิ่มค่าใหม่ต้องไปแก้ป้ายไทยใน `account/access.ts` (นอกขอบเขตใบนี้) · ห้ามใช้ `USER` เพราะจะกลายเป็น "พนักงานเป็นคนแก้"
6. **`meUpdate` มีรายการคีย์ห้ามแก้ถาวร** `phone` · `email` · `memberCode` แม้ร้านเผลอเปิด `customerEditable` — เบอร์/อีเมลคือกุญแจ OTP ของหน้านี้เอง (ยอมให้แก้ = ย้ายบัญชีได้จากหน้าจอลูกค้า) · ข้อความ error ระบุทั้งป้ายไทยและ **คีย์** ตามที่ S3.2 ขอ
7. **`meGet` เพิ่มคีย์ `lockedFields`** (additive): `sections` ยังผูกกับ `listLayout(audience customer)` เป๊ะตามสัญญา S3.1 (= ฟอร์มที่แก้ได้) แต่ภาพ 09 ค มีแถว "ไอคอนกุญแจ = ร้านยืนยันให้" ซึ่ง layout ชุด customer กรองทิ้งไปหมด ⇒ ส่งฟิลด์ของตัวเองที่ **ไม่อ่อนไหว · ร้านปิดสวิตช์แก้ · มีค่าอยู่จริง** มาไม่เกิน 6 แถวให้หน้าจอวาดแถวกุญแจได้ตรงภาพ
8. **`nextTier` เพิ่ม `progressPct`** (additive) — แถบความคืบหน้าบนการ์ดดำต้องใช้ `pct` จาก `tiers.evaluateMember` (เรียกแบบ `noCache` ⇒ หน้าอ่านอย่างเดียวไม่เขียน DB)
9. **LIFF SDK โหลดจาก CDN ของ LINE ตอนกดปุ่ม** (`static.line-scdn.net/liff/edge/2/sdk.js`) ไม่เพิ่ม dependency `@line/liff` (ยังไม่มีในโปรเจกต์ · การ `import()` แพ็กเกจที่ไม่มี = build ล้ม) · ไม่มี `LINE_LIFF_ID`/โหลดไม่ได้ = ปุ่มบอกให้ใช้ OTP แทน หน้าอื่นทำงานปกติ
10. **`lookupCardTokenAction` อยู่ใน `me-actions.ts`** ทั้งที่เป็นทางเข้าพนักงาน (ด่าน `requireTenant` + `assertCan member.customer.read`) — วางคู่กับ `meCard` เพราะเป็นคู่แฝดของ token เดียวกัน (ออก/ตรวจ ต้องแก้พร้อมกันเสมอ)
11. **cookie**: `shark_customer` (http) / `__Host-shark_customer` (https) · httpOnly · sameSite lax · maxAge 30 วัน — ไม่แตะ `shark_session` ของพนักงานเลย · **ไม่มี middleware ในโปรเจกต์นี้** (ตรวจแล้ว: ไม่มีไฟล์ `src/middleware.ts`) ⇒ ไม่ต้องยกเว้น `/m/*` จากอะไรทั้งสิ้น และหน้า `/app` เดิมไม่ถูกแตะ

## 3.1 รอบตีกลับที่ 1 (โปรไฟล์โชว์ค่าดิบ — `m-profile-mobile.png`)

| ข้อ | แก้อย่างไร |
|---|---|
| ค่าดิบหลุดถึงลูกค้า (`สาขาหลัก cmtvw0…` · `ภาษาที่ใช้ th` · `สัญชาติ TH`) | `MeFieldDto` เพิ่มคีย์ **`display`** (additive · `value` เดิมคงไว้ทุกตัว) — คำนวณด้วย `profile.displayOf` + `profile.resolveLookupNames` **ตัวเดียวกับหน้า 360** ⇒ LOOKUP → ชื่อสาขา · `locale` → "ไทย" · `nationality` → "ไทย" · SELECT → ป้ายตัวเลือก · DATE → วันที่ไทย(+อายุ) · `meGet` ไม่ส่ง id ดิบออกไปให้หน้าจอตีความเองอีกแล้ว (หน้าจออ่าน `display` อย่างเดียว) |
| แถวว่าง "—" ที่ลูกค้าทำอะไรไม่ได้ | `lockedFields` คัดเฉพาะแถวที่ **มีค่าจริง** (`display !== ""`) · ฟิลด์ที่แก้ได้แต่ว่าง ยังแสดง "—" + ดินสอ ตามที่สั่ง |
| — (พบเพิ่มระหว่างแก้) | ฟิลด์ `email` เปิด `customerEditable` ใน layout แต่ `meUpdate` ห้ามแก้ (กุญแจ OTP) ⇒ ปุ่มดินสอที่กดแล้วบันทึกไม่ได้ = หลอกผู้ใช้ · ย้ายไปฝั่งกุญแจ · ฟิลด์ชนิด `FILE` (รูปโปรไฟล์) ก็เช่นกัน — หน้านี้ยังไม่มีตัวอัปโหลด |
| — (พบเพิ่มระหว่างแก้) | ตัดฟิลด์งานหลังร้านออกจากสายตาลูกค้า: `memberCode` (ซ้ำกับหัวจอ) · `source`/`sourceChannel` (ข้อมูลการตลาดของร้าน) · `ownerUserId` · `note` · `tags` |

ผลหลังแก้ (สมาชิก 1): กุญแจ = `เบอร์โทร 0810000001 · ภาษาที่ใช้ ไทย · สาขาหลัก สาขาป่าตอง · ระดับใบรับรอง Advanced · หน่วยงานที่ออกใบรับรอง SSI · เลขที่ใบรับรอง MBQC-CERT-001` · ดินสอ = ชื่อจริง/นามสกุล/คำนำหน้า/วันเกิด/เพศ/สัญชาติ/เฟซบุ๊ก/ที่อยู่ 4 บรรทัด

**ผลพลอยได้ที่ข้อสอบจับได้ระหว่างรอบนี้ (แก้แล้ว)**
1. `S5.1` แดงเพราะเผลอเขียน 🔴 ใน **block comment** ของ `MProfile.tsx` — ด่านห้ามอีโมจิลอกเฉพาะคอมเมนต์ `//` ⇒ ย้ายเป็นคอมเมนต์บรรทัด (บทเรียน: ในไฟล์ `src/components/member/*` ห้ามใช้อีโมจิใน `/** */`)
2. `S2.1` แดงเพราะ token บัตรที่ค้างจาก **รอบถ่ายภาพของ Fable** ถูกนำกลับมาใช้ ⇒ `expiresAt` เหลือไม่ถึง 24 ชม. ⇒ เพิ่มกติกา **ใช้ใบเดิมซ้ำได้ภายใน 15 นาทีแรกเท่านั้น** (`CARD_REUSE_MS`) เกินกว่านั้นออกใบใหม่ (เวลาที่เหลือตรงกับที่โชว์เสมอ · QR ที่ถูกแคปไว้นานตายเร็วขึ้น · "เปิดบัตรแล้วเดินไปจ่ายเงิน" ยังได้ใบเดิม) — ข้อสอบไม่ขึ้นกับสภาพข้อมูลค้างอีกต่อไป

## 4. หนี้ / ข้อค้าง

1. **ส่ง OTP ทางเบอร์ยังส่งจริงไม่ได้** — ระบบไม่มี SMS gateway (`requestOtp` ออกใบให้ครบทุกอย่าง แต่รหัสไปไม่ถึงมือถือ) · ช่องทางอีเมลส่งผ่าน Resend แล้ว · รอใบที่ต่อ SMS provider (M3.2)
2. **`/m/<slug>/join` ยังไม่มีจริง** — `loginWithLine` ชี้ไปหน้านี้เมื่อ LINE ยังไม่ผูกกับสมาชิกคนไหน (สัญญากำหนดเอง) · หน้าสมัคร 3 ขั้นอยู่ในใบ **M3.11**
3. `LINE_LIFF_ID` ยังไม่มีใน env (ต้องให้เจ้าของสร้าง LIFF app ชี้มาที่ `https://<โดเมน>/m/<slug>`) — ไม่มีก็ใช้ OTP ได้ปกติ
4. ปุ่ม "แนะนำเพื่อน" บนการ์ดยังลิงก์ไปหน้าโปรไฟล์ (โปรแกรมแนะนำเพื่อนจริงอยู่ใบ **M3.5**)
5. `me.*` ฝั่ง REST ยังตอบ 401 `customer_session_required` ตามเดิม (เปิดจริงในใบ **M2.10**) — ใบนี้ไม่แตะ `api/ops/me.ts`
6. หน้าลูกค้ายังอัปโหลด "รูปโปรไฟล์" (ฟิลด์ชนิด FILE) เองไม่ได้ — ต้องมีตัวอัปโหลดในหน้า `/m/*` ก่อน (ใบถัดไป)
7. คำขออนุมัติที่เกิดจาก `requestErase` ฝั่งลูกค้าใช้ `requestedById = "member.privacy.customer"` (ไม่ใช่ `User.id` เพราะลูกค้าไม่มีบัญชีผู้ใช้ของร้าน) — แบบเดียวกับ `member.privacy.auto` ของ cron เดิม

## 5. ตรวจภาพ (Fable)

- ภาพ 09 ก (บัตร) · 09 ข (กระเป๋า) · 09 ค (โปรไฟล์) — มือถือ 390 · `--user customer:<รหัสสมาชิก 1>`
- หน้า login + /card แบบไม่มี session — `--user owner`

### ตรวจภาพ (Fable · 11 ก.ย. 01:30 UTC · QC server build จริง · 2 รอบ)
- รอบ 1: หน้าโปรไฟล์โชว์ id สาขาดิบ/`th`/`TH` + แถวว่างเกิน → ตีกลับ · แก้แล้ว (DTO เพิ่ม `display` ผ่านตัวแปลงเดียวกับหน้า 360)
- `m-card` เทียบภาพ 09 ก: การ์ดดำ ชื่อร้าน · ชื่อ+ชิประดับ · รหัส+สมาชิกมา · QR ใหญ่ · แต้มคงเหลือ + แถบ + "อีก ฿n → เลื่อนเป็น …" · ปุ่ม 4 (สิทธิ์/สแตมป์/ประวัติ/แนะนำเพื่อน) · "สิทธิ์ที่ใช้ได้ตอนนี้" · แถบล่าง 4 ✓
- `m-wallet` เทียบภาพ 09 ข: Voucher (นับ) · สแตมป์ · Gift Card · ของรางวัลรอรับ — empty state ไทย (ชุด QC สมาชิก 1 ไม่มีสิทธิ์) ✓ (แบนเนอร์แต้มใกล้หมดอายุจะขึ้นเมื่อมีล็อตใกล้หมด)
- `m-profile` เทียบภาพ 09 ค: หัวชื่อ/รหัส/ระดับ · ฟิลด์ที่แก้ได้ (ดินสอ) · ฟิลด์ล็อก (กุญแจ) แสดงค่าที่อ่านได้ (สาขาป่าตอง · ไทย · Advanced/SSI) · คำอธิบายกุญแจ · ความยินยอม toggle (6 ช่องทางจากทะเบียน · ภาพวาด 4) · ปุ่ม PDPA ✓
- `m-history` ไทม์ไลน์ของฉัน ✓ · `m-login` เบอร์/อีเมล → OTP + ปุ่ม LINE ✓ · `m-card-nosession` → login ✓
- หมายเหตุ: แถบล่าง fixed ปรากฏกลางภาพเต็มหน้าเป็นผลจากการถ่ายเต็มหน้าของ harness ไม่ใช่บั๊ก
- **PARITY: ผ่าน**
