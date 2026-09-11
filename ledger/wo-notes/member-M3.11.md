# M3.11 — LIFF onboarding `/m/[slug]/join` + แอปพนักงาน (Expo) + สะพาน push (builder notes)

> builder: Opus · 11 ก.ย. 2569 · worktree `shark-member` · ข้อสอบ `scripts/qc-member-m3.11.mts` (ไม่ถูกแตะ) · **ไม่มี migration · ไม่ build (next/Expo/eas) · ไม่ OTA · ไม่ commit**
> **ไม่ต้องบิลด์แอป/ไม่ต้อง OTA ในใบนี้**: `apps/mobile/app.json` version/runtimeVersion ไม่เปลี่ยน · ไม่มีไฟล์ .ipa/.apk/.aab · ไม่เพิ่ม native module (expo-camera เป็น optional) — จอใหม่ของแอปเป็น JS ล้วน จะถึงเครื่องพนักงานเมื่อเจ้าของสั่ง OTA/บิลด์รอบถัดไป

## 1. ผลข้อสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m3.11` (ตัวจริง) | **11/16** หลังเขียนโน้ตนี้ (ก่อนมีโน้ต 10/16 · S6.1 ขาดคำว่า "ไม่ต้องบิลด์") — ผ่าน S1.1–S1.5 · S2.1 · S2.2 · S3.1 · S4.2 · S5.2 · S6.1 |
| ค้าง 5 ข้อ | S3.2 ภาพ 29 (ต้อง build + `visual-member.mts 3.11`) · S3.3 PARITY (ผู้คุมงาน) · **S4.1 รอ server** (QC server ที่รันอยู่เป็น build เก่า → route ใหม่ตอบ 404 · ดูผลยิงในโปรเซสข้างล่าง = 401/401 ตามสัญญา) · S4.3 ภาพแอป (ผู้คุมงานรัน `apps/mobile/qc/shoot-member.mjs`) · **S5.1 ข้อแย้งข้อสอบ 2 จุด** (ข้อ ก) |
| สำเนาชั่วคราวของ m3.11 แก้ 2 จุดของ S5.1 (ลบทิ้งแล้ว) | S5.1 ✅ · S5.2 ✅ (บน QC server เดิม — REST `/me/push-devices` มีตั้งแต่ M3.10) |
| ยิง route แอปพนักงานในโปรเซส (สคริปต์ชั่วคราว ลบทิ้งแล้ว · คืนสภาพครบ) | ไม่มี token → **401** `{error:"unauthorized", message ไทย}` · token มั่ว → **401** · owner ค้น "ธนก" → 200 (5 คน · เบอร์ปิดบัง `081-xxx-0001`) · สแกน QR จริงของสมาชิก 1 (`SHARK-MC:…` จาก `meCard`) → 200 คนเดียวกัน · QR มั่ว → 404 ไทย · summary → 200 (ตัวเลข 3 · ประวัติ 3 · ลิงก์เว็บ 3) · id มั่ว → 404 ไทย · ใบสแตมป์ชั่วคราว (PIN 1234): PIN ผิด → 400 "PIN ไม่ตรง…" · ไม่ใส่ PIN → 400 · PIN ถูก → 200 แบนเนอร์ "ประทับสำเร็จ · 1/10 · อีก 9 ครั้ง…" · ส่ง requestId เดิมซ้ำ → 200 ตราเดียว (StampEvent 1 แถว) · พนักงานไม่มีสิทธิ์สมาชิก → 403 ไทย (ค้น + ประทับ) · พนักงานสาขากะตะเปิดสมาชิกป่าตอง → 404 |
| `tsc --noEmit` (รากโปรเจกต์) | ✅ |
| `apps/mobile` `npx tsc --noEmit` | ✅ (รวม 5 ไฟล์ใหม่ของโซน member) |
| fitness มี env / `env -u DATABASE_URL -u DIRECT_URL` | ✅ 26/26 · ✅ 26/26 |
| regressions สมาชิก | m2.9 **22/22** · m3.10 **21/21** (มี QC server เดิม) · m1.8 **15/15** · m3.5 **21/21** · m2.3 **22/22** · m1.3 14/14 · m1.5 20/20 · m1.6 14/14 · m1.7 26/26 · m1.10 12/12 (ชุดที่สแกน `src/components/member/*.tsx` ทั้งโฟลเดอร์หาอีโมจิ/hex) |
| ชุดมือถือ (`QC_ENV_FILE=.env.qc`) | qc-mobile-app **38/38** (static + typecheck apps/mobile) · qc-mobile-auth **31/31** · qc-mobile-chat **29/29** · qc-mobile-help **15/15** |
| grep `'use client'` | `JoinFlow.tsx` import แค่ `join-actions` ("use server") + `join-shared.ts` (ไม่มี import เลย) + MemberIcon/MShell/MLoginForm · `MPushBridge.tsx` import แค่ `me-actions` ("use server") · ไม่มีตัวไหนลากถึง prisma/env/facade |

## 2. ไฟล์

### ใหม่ (เว็บ)
- `src/app/m/[slug]/join/page.tsx` — ขั้น ก/ข (ไม่ต้องล็อกอิน) · ร้าน/โลโก้จาก `getBrandingTokens` · ฟอร์มจาก `joinForm` · ชื่อลิงก์ `?src=` จาก `listLinks` (อ่านอย่างเดียว ไม่นับ hit) · session ร้านนี้อยู่แล้ว → "เป็นสมาชิกอยู่แล้ว"
- `src/app/m/[slug]/join/done/page.tsx` — ขั้น ค · `requireCustomer` (ไม่มี session → /login) · บัตร `meCard` · แต้มต้อนรับจากสมุดแต้มจริง (`refType MemberJoin`)
- `src/components/member/JoinFlow.tsx` ('use client') — ต้อนรับ · ฟอร์ม (เบอร์+OTP · ฟิลด์ตามชนิด · ผู้แนะนำ · ยินยอม 4 · นโยบาย) · สถานะ "เป็นสมาชิกอยู่แล้ว" · `JoinUnavailable`
- `src/components/member/JoinDone.tsx` — บัตรสีเข้ม + QR · กล่องแต้ม · ปุ่มเปิดบัตร/ไปกระเป๋าสิทธิ์
- `src/components/member/MPushBridge.tsx` ('use client') — สะพาน push `data-testid="m-push-bridge"`
- `src/lib/modules/member/join-actions.ts` ("use server") — `lineJoinAction` · `startJoinAction` · `verifyJoinAction` · `checkReferralAction` · `completeJoinAction` → เรียก `join.ts` เท่านั้น
- `src/lib/modules/member/join-shared.ts` — ชนิดผลลัพธ์ของ action + ค่าคงที่ (ไม่มี import)

### ใหม่ (แอปพนักงาน)
- `src/lib/modules/member/staff-app.ts` — `staffMemberCtx` · `staffSearch` · `staffScan` · `staffSummary` · `staffStampCards` · `staffStamp` (export ผ่าน facade `member/index.ts`)
- `src/lib/mobile/member-routes.ts` — แปลง error → JSON ไทย · actor/ctx ของพนักงานจาก membership ที่ requireMobile ตรวจแล้ว
- `src/app/api/mobile/member/{search,scan,summary,stamp}/route.ts` — requireMobile → `assertCan` → facade `@/lib/modules/member`
- `apps/mobile/app/(app)/member/_layout.tsx` (Stack) · `index.tsx` (ค้น/สแกน) · `[customerId].tsx` (สรุป + ปุ่ม 2×2 + ประวัติ) · `stamp.tsx` (เลือกการ์ด · เหตุผล · PIN · แบนเนอร์)
- `apps/mobile/src/components/member/ui.tsx` — หัวจอ · ชิประดับ · วงชื่อย่อ · ชนิดข้อมูล API · จัดรูปตัวเลข/วันที่ (ไม่พึ่ง Intl)
- `apps/mobile/qc/shoot-member.mjs` — QC render (ผู้คุมงานรัน · ดูข้อ 6)

### แก้เฉพาะจุด
- `src/app/m/[slug]/layout.tsx` — ฝัง `<MPushBridge slug>` (+ คอมเมนต์)
- `src/app/m/[slug]/page.tsx` — ยังไม่ล็อกอิน (หรือ session คนละร้าน) + มี `?src=`/`?ref=` → `/m/<slug>/join?src=…&ref=…` (ข้อตัดสิน 8)
- `src/components/member/MLoginForm.tsx` — export `loadLiff`/`LiffSdk` (ใช้ตัวโหลด SDK ตัวเดียวกัน) · `login` รับ `redirectUri` · ลิงก์ "ยังไม่เป็นสมาชิก? สมัครสมาชิก" (`m-login-join`)
- `src/lib/modules/member/referrals-shared.ts` — `referralLandingPath` → `/m/<slug>/join?ref=<code>` (บรรทัดเดียว + คอมเมนต์)
- `src/lib/modules/member/customer-session.ts` — `requestOtp(…, { forJoin })` ส่งอีเมล OTP ให้ปลายทางที่ยังไม่เป็นสมาชิกด้วย (ข้อตัดสิน 3)
- `src/lib/modules/member/join.ts` — `startJoin` ส่ง `forJoin: true` (บรรทัดเดียว)
- `src/lib/modules/member/me-actions.ts` — `registerMyPushDeviceAction` (ข้อตัดสิน 12)
- `src/lib/modules/member/index.ts` — ต่อท้าย export ชุด staff-app (append ไม่ทับไฟล์)
- `apps/mobile/app/(app)/_layout.tsx` — เมนู Drawer "สมาชิก" → `member` (`testID drawer-member`)
- `apps/mobile/app/(app)/index.tsx` — รับ `?open=/app/…&t=` เปิดหน้าเว็บของร้านใน WebView (ข้อตัดสิน 16) · รับ `{ev:"open-member"}` จากเว็บ → `/member`
- `apps/mobile/src/api/client.ts` — `ApiError.detail` (อ่าน `message` ไทยจาก server · additive · endpoint เดิมไม่มี = ไม่เปลี่ยนพฤติกรรม)

## 3. ข้อแย้งข้อสอบ (หลักฐาน · ไม่ได้แก้ข้อสอบ)

**ก. S5.1 (บรรทัด 155) 2 จุด — ตายเสมอแม้ระบบถูก**
1. `reg.status === 201` — แกน REST ตอบ 200 ทุกคำขอสำเร็จ (ไม่มี 201 ใน `src/lib/api` · เรื่องเดียวกับ ORACLE-EDIT M3.10-S3 (201) ที่ผู้คุมงานแก้เป็น `200|201` แล้วใน m3.10) · ผลรันจริง `reg=200 reg2=200`
2. `dev.expoToken === tok` — คอลัมน์ของ `MemberPushDevice` ชื่อ `token` (`prisma/schema/member.prisma:570` · `push-devices.ts` เขียน `token`) · `expoToken` เป็นชื่อฟิลด์ใน **body** ของ REST เท่านั้น · ผลรันจริง `dev=true n=1` (มีแถว · ไม่ซ้ำ) แต่ `dev.expoToken` = undefined
- สำเนาชั่วคราวแก้เป็น `[200, 201].includes(reg.status)` + `(dev.token ?? dev.expoToken) === tok` → **S5.1 ✅** (ส่วนอื่นของข้อไม่แตะ) · ลบสำเนาแล้ว

**ข. (ไม่ใช่ข้อแย้งที่ทำให้แดง — แจ้งให้ตัดสิน) หัวข้อสอบบรรทัด 7 เขียน "hit +1 ครั้งต่อการเปิด"** แต่มติ M3.10 ข้อ 7 + คำสั่งใบนี้ = `startJoin` นับ hit แล้ว หน้าเปิดห้ามนับซ้ำ ⇒ ทำตามมติ: hits ของลิงก์ LIFF = "คนที่เริ่มสมัคร (กดขอรหัส)" ไม่ใช่ "คนเปิดหน้า" · S2.1 วัด `hits ≥ 1` จาก service จึงผ่านทั้งสองแบบ · ถ้าอยากได้ "คนเปิดหน้า" จริงต้องย้ายการนับออกจาก `startJoin` ไปไว้ที่หน้า (M3.10 REST จะไม่นับ) — ผู้คุมงานตัดสิน

**ค. S4.1 ยิง HTTP ไปที่ QC server** (`noTok=404 badTok=404` ตอนนี้) — server ที่รันอยู่เป็น build ก่อนใบนี้ ⇒ ต้อง build ใหม่ (งานผู้คุมงาน) · ในโปรเซสได้ 401/401 (ตารางข้อ 1)

## 4. ข้อตัดสิน

1. **ไม่นับ hit ที่หน้า** (ข้อแย้ง ข) · ส่ง `?src=` ดิบต่อให้ `startJoin`/`completeJoin` ทุกกรณี (ลิงก์ไม่รู้จัก = attribution FIRST linkId null ตาม S2.2) · บรรทัด "มาจาก: <ชื่อ> (src=<code>)" โชว์เฉพาะเมื่อ code ตรงลิงก์ที่เปิดอยู่ (`listLinks` อ่านอย่างเดียว)
2. **LINE**: ปุ่ม "สมัครด้วย LINE" → LIFF → `lineJoinAction` ตรวจ id_token กับ `https://api.line.me/oauth2/v2.1/verify` (กติกาเดียวกับ `/m/<slug>/auth/line`) · LINE ผูกสมาชิกแล้ว → ตั้ง cookie → "เป็นสมาชิกอยู่แล้ว" → บัตร · ยังไม่ผูก → ฟอร์ม (ยังต้องยืนยันเบอร์/อีเมลด้วย OTP เพราะตั๋วสมัครออกจาก OTP เท่านั้น) · ตอนกดสมัครส่ง id_token ชุดเดิมให้ `completeJoinAction` **ตรวจกับ LINE ใหม่** แล้วส่ง `verifiedLineUserId` ให้ `completeJoin` (ไม่เคยรับ lineUserId จาก client) · ตรวจไม่ผ่านตอนสมัคร (token หมดอายุ) = สมัครต่อได้แต่ไม่ผูก · ปุ่มใช้ได้จริงเมื่อมีทั้ง `LINE_LIFF_ID` + `LINE_CHANNEL_ID` — ไม่มี = ปุ่มพาไปฟอร์มเบอร์พร้อมข้อความ "ร้านนี้ยังไม่ได้เปิดสมัครผ่าน LINE" (หนี้ 2) · `?line=` จาก `loginWithLine` ใช้เป็น **สัญญาณ** ให้เริ่มขั้น LINE อัตโนมัติเท่านั้น ไม่ใช้เป็นตัวตน · LIFF login redirect กลับมาทำต่อเอง (sessionStorage)
3. **OTP ของการสมัครต้องส่งถึงคนที่ยังไม่เป็นสมาชิก** — `requestOtp` เดิมส่งอีเมลเฉพาะปลายทางที่เป็นสมาชิกแล้ว (ถูกสำหรับหน้าเข้าสู่ระบบ) ⇒ หน้าสมัครส่งรหัสไม่ถึงใครเลยบน prod · เพิ่ม `opts.forJoin` (additive) ให้ `startJoin` ส่งอีเมลทั้งคนใหม่และคนเดิมเหมือนกัน (ยังไม่เผยว่าใครเป็นสมาชิก · เพดานเดิมต่อปลายทาง 3/10 นาที ต่อ IP 10/10 นาที) · ช่องทางเบอร์ยังไม่มีผู้ส่ง SMS (หนี้ M2.9 เดิม) ⇒ ช่อง `m-join-phone` รับอีเมลได้ด้วย + ข้อความ "ยังไม่ได้รับ SMS? ใส่อีเมลในช่องนี้แทนได้"
4. **ความยินยอม 4 สวิตช์เริ่มที่ปิดทุกช่อง** (PDPA: ติ๊กไว้ให้ก่อนไม่นับเป็นความยินยอม) — ภาพ 29 โชว์บางช่องเปิดเป็นตัวอย่างสถานะหลังลูกค้าเลือก · ป้ายช่องทางจาก `joinForm().consents` (ไลน์/อีเมล/เอสเอ็มเอส/แจ้งเตือนในแอป — ภาพเขียน "โทรศัพท์" แต่สัญญาใบนี้ = PUSH)
5. **นโยบาย**: checkbox "ยอมรับ นโยบาย v<n>" + ปุ่มเปิดอ่านเนื้อหา (`policyHtml` ถูก sanitize ตั้งแต่ตอนบันทึก — `privacy.ts:414`) · ร้าน QC ยังไม่เผยแพร่นโยบาย (`policyVersion 0`) → ป้าย "นโยบายการใช้ข้อมูลสมาชิก" + ข้อความบอกตามจริงว่าร้านยังไม่เผยแพร่ฉบับเต็ม (ส่ง 0 ตามที่ `completeJoin` ตรวจ)
6. **แต้มต้อนรับบนหน้า done = ผลรวมรายการสมุดแต้ม `refType MemberJoin` ของคนนั้น** (ไม่รับตัวเลขทาง URL) · 0 = บอกตามจริง "ร้านนี้ยังไม่มีแต้มต้อนรับ" + แต้มคงเหลือ (ร้าน QC `welcomePoints 0`) · "voucher ต้อนรับ ฿100" ในภาพ 29 ค ไม่มีในระบบ (join.ts ให้แต้มอย่างเดียว) → ไม่แสดง (ห้ามข้อมูลปลอม) · หน้าต้อนรับโชว์ "รับ n แต้ม" เฉพาะร้านที่ตั้ง > 0
7. **ปุ่ม "เพิ่มเพื่อน LINE" (ถ้าร้านตั้ง) ไม่วาด** — ระบบยังไม่มีที่เก็บลิงก์เพิ่มเพื่อน/Basic ID ของ LINE OA ร้าน (ค้นทั้ง schema/code แล้ว) ⇒ ปุ่มรองเป็น "ไปกระเป๋าสิทธิ์" (ภาพ 29 ค ปุ่มล่าง) · หนี้ 2
8. **`/m/<slug>?src=`** (URL ที่หน้าตั้งค่าที่มา M1.8 ออกให้ร้านพิมพ์เป็น QR — m1.8 S4.1 บังคับรูปนี้) เดิมพาคนที่ยังไม่ล็อกอินไปหน้าเข้าสู่ระบบ = `src` หลุด + คนใหม่เจอหน้าที่ยืนยันไม่ผ่านตลอดกาล ⇒ ยังไม่ล็อกอิน/คนละร้าน + มี `src`/`ref` → `/join?…` · ล็อกอินแล้ว → บัตรเหมือนเดิม (m2.9 22/22)
9. **ผู้แนะนำ**: prefill `?ref=` แล้วตรวจให้เองตอนเปิดหน้า (`checkReferralAction` = `resolveReferralLanding` + `getProgram` · อ่านอย่างเดียว) · **ไม่คืนชื่อผู้แนะนำ** (หน้าสาธารณะ — เดาโค้ดแล้วรู้ว่าใครเป็นสมาชิก) · กล่องรางวัล "คุณและเพื่อนจะได้รางวัลเมื่อสมัครสำเร็จ / เมื่อคุณซื้อครั้งแรก" ตาม `convertOn` จริง + "ของคุณ: <รางวัลเพื่อนใหม่>" · โค้ดผิดตอนกดสมัคร = `completeJoin` โยนไทย (ไม่สร้างสมาชิก · S1.4) · ส่งรหัสเครื่องแบบสุ่ม (localStorage) เป็น `device.fingerprint` ให้ด่านกันโกงของ M3.5
10. **ด่านของ join-actions (หน้าสาธารณะ)**: `assertCan(PUBLIC_JOIN, member.join)` — actor สาธารณะที่ถือสิทธิ์ `member.join` ตัวเดียว (ชุดเดียวกับ `publicApiActor` ของ REST) + เพดานต่อ IP บน DB **ถังเดียวกับ REST** (`mbr:api:join:{read|write}:<hash ip>` · `JOIN_RATE_LIMITS`) ⇒ สลับยิงสองทางไม่ได้เพดานสองเท่า · ไม่มี prisma ในไฟล์
11. **ฟอร์ม**: ฟิลด์ตามชนิด (TEXT/LONG_TEXT/NUMBER/MONEY/DATE `YYYY-MM-DD`/DATETIME/SELECT/MULTI_SELECT/BOOLEAN) · ช่องว่างไม่ส่ง (ตัวเลขว่างไม่กลายเป็น 0) · ตรวจช่องบังคับฝั่งหน้าจอก่อน (ข้อความใต้ช่อง) แล้ว `completeJoin` ตรวจซ้ำ · OTP ผิด → ข้อความใต้ช่องรหัส · ครบ 5 ครั้ง → ล้างรหัสแล้วบอกให้ขอใหม่ (server ล็อกใบนั้นแล้ว) · verify ได้ existing → ตั้ง cookie → "คุณเป็นสมาชิกอยู่แล้ว" + ปุ่มเปิดบัตร · สมัครสำเร็จ → `/join/done` (ถ้าเบอร์กลายเป็นสมาชิกจากอีกเครื่องระหว่างกรอก = `created:false` → ไปบัตร)
12. **สะพาน push**: cookie session ลูกค้าเป็น httpOnly — JS ในหน้าอ่าน `cs_…` ไม่ได้ จึงยิง REST `POST /api/v1/member/me/push-devices` ด้วย Bearer เองไม่ได้ (การส่ง token ให้ JS = ทิ้งประโยชน์ของ httpOnly) ⇒ ทางปกติ = server action `registerMyPushDeviceAction` (อ่าน session จาก cookie → `registerPushDevice` **service ตัวเดียวกับ REST**) · ถ้าแอปแนบ `customerToken` (`cs_…` ที่แอปถือเอง) มาในข้อความ → ยิง REST ตรง · ทำงานเฉพาะในแอป (UA `SharkCustomer/` หรือมี `window.ReactNativeWebView`) + ทิ้งข้อความจากหน้าต่างอื่น (`ev.source`) — กันเว็บอื่นเปิดหน้านี้เป็น popup แล้ว postMessage token เครื่องตัวเองมาผูกกับบัญชีลูกค้า · หน้าเว็บส่ง `{type:"push-bridge-ready"}` ให้แอปเมื่อพร้อม (หลังล็อกอิน/สมัครหน้าโหลดใหม่ → แอปส่ง token ซ้ำได้) · 🔎 ข้อความ `me/push-devices` ในไฟล์สะพานเป็นพาธจริงที่ใช้ในทาง `customerToken` (ไม่ใช่คอมเมนต์ลอย ๆ) — แจ้งไว้ให้ชัดว่าทางปกติคือ server action
13. **API แอปพนักงาน**: ตรรกะอยู่ในโมดูลสมาชิก (`staff-app.ts` → facade) · route ไม่แตะ prisma · ระบบสมาชิก = ระบบ MEMBER แรกที่เปิดอยู่ของร้าน (ร้านไม่มี = 404 ไทย) · สิทธิ์อ่าน = `canReadMember` (read-โดยนัยของ STAFF เหมือนหน้าเว็บ) ไม่ผ่านจึง `assertCan(member.customer.read)` · ประทับ = `assertCan(member.loyalty.stamp)` + service `addStamp` ตรวจ `hasMemberPerm`/สาขาซ้ำ · error = `{ error: <รหัสเดิมที่แอปอ่าน>, message: <ไทย> }` (401/403/404/409/400/500) · เบอร์ปิดบังเสมอ · ขอบเขตสาขาตัดสินที่ `listMembers`/`briefFor`/`memberSummary`
14. **PIN** (ตาราง §6.2 "ประทับสแตมป์: STAFF ✓ (PIN)"): ใช้ `ruleConfig.staffPin` ของใบ — ใบที่ตั้ง PIN ต้อง PIN ตรง 4–6 หลัก (ทุก role) · ใบไม่ตั้ง = ประทับได้เลย จอไม่ขอ PIN (`pinRequired` จาก API) · ตรวจใน `staffStamp` ก่อนเรียก `addStamp` (service ตรวจ PIN เฉพาะฝั่งลูกค้ากดเอง) · `requestId` จากแอป = รหัสกันซ้ำ (`mobile.stamp:<id>`) ออกใหม่หลังสำเร็จเท่านั้น · พนักงานดูแลสาขาเดียว → ส่ง `unitId` สาขานั้น (ใบที่จำกัดสาขาตรวจได้ถูก)
15. **"เหตุผล/บริการ" เก็บใน `StampEvent.refId`** ของตรา MANUAL (ตารางไม่มีคอลัมน์ note · ใบนี้ห้าม migration · ตรา MANUAL ไม่มีอ้างอิงอื่น · `refType SALE` เท่านั้นที่ถูกอ่าน refId เป็นบิล — `member-bridges.ts:161`) · ≤ 80 ตัวอักษร · หนี้ 5
16. **ปุ่ม ใช้สิทธิ์/ให้แต้ม/ออก voucher** ยังไม่มีจอ native และ API ใบนี้มีแค่ 4 เส้น ⇒ เปิด **หน้าเว็บจริง** ของร้านใน WebView หน้าระบบงาน (`index.tsx` รับ `?open=/app/…&t=<nonce>` · รับเฉพาะพาธใต้ `/app/` ตัวอักษรปลอดภัย · ฉีด `location.assign` หลัง WebView เข้า `/app` แล้ว) — พาธจาก API: กระเป๋าสิทธิ์ใน 360 (`?tab=wallet`) · `/points/adjust` · `/promotions/vouchers` (ปุ่มเดียวกันบนหัว 360 ของเว็บยัง disabled "เร็ว ๆ นี้" จึงชี้หน้าที่ทำงานได้จริงแทน)
17. **expo-camera ยังไม่มีในแอป → ไม่ติดตั้ง** (เพิ่ม native module = ต้องบิลด์ใหม่ · ห้ามในใบนี้) · โหลดแบบ optional: `require("expo-camera")` ใน try/catch — `@expo/metro-config` เปิด `allowOptionalDependencies: true` (`ExpoMetroConfig.js:330`) ⇒ bundle ไม่ล้มแม้ไม่มีแพ็กเกจ · มีกล้อง = `CameraView` สแกน QR (`barcodeTypes: ["qr"]` · รับผลครั้งแรกครั้งเดียว) · ไม่มี = กดกล่องสแกนแล้วขึ้นช่องวาง/พิมพ์รหัส `SHARK-MC:…` (เครื่องสแกนบาร์โค้ดบลูทูธยิงลงช่องได้) + ค้นชื่อ/เบอร์ · เปิดใช้กล้องจริง: `npx expo install expo-camera` + plugin สิทธิ์กล้องใน app.json + บิลด์ใหม่ (รอเจ้าของสั่ง)
18. **โซน member เป็น Stack ซ้อนใน Drawer** (`member/_layout.tsx`) — ไม่งั้นปุ่มกลับเด้งไปหน้าแรกของ Drawer · ปุ่ม ☰ บนจอค้นเปิด Drawer ด้วย navigation ของ expo-router (`openDrawer` · แก้ตามตีกลับรอบ 1 — เดิมใช้ `DrawerActions` จาก `@react-navigation/native` ซึ่ง Metro ของ SDK 56+ ปฏิเสธ)
19. **ทางเข้าจอสมาชิก**: เมนู Drawer "สมาชิก" ตามสัญญา — แต่ Drawer ปิดท่าสไลด์ตั้งแต่ 6 ก.ย. และหน้าระบบงาน (WebView) ไม่มีปุ่มเปิด Drawer ⇒ เพิ่มตัวรับ `{ev:"open-member"}` ใน `index.tsx` (แบบเดียวกับ `open-ai`) · **ฝั่งเว็บ (NavDrawer) ยังไม่ส่ง** — อยู่นอกขอบเขตไฟล์ใบนี้ (หนี้ 4)
20. ธีมแอป: ปุ่มหลัก = สีกิจการ (`useBrand().accent` แบบทุกจอหลังล็อกอิน) ไม่ใช่ดำตามภาพ · ดวงสแตมป์ทึบ = สีตัวอักษรหลัก · ชิประดับ = สี `TagColor` ชุดเดียวกับโทเคน `--color-tag-*` ของเว็บ (API ส่งชื่อสี เช่น `SLATE`) · ตัวเลข/วันที่จัดรูปเอง (Hermes Intl ไม่ครบ) · ภาพ 28 มีแถบล่าง 4 แท็บ (ค้นหา/สมาชิก/ขาย/เมนู) ซึ่งแอปไม่มีโครงนี้ (แอปใช้ Drawer) → ไม่ทำ

## 5. หนี้

1. **SMS**: OTP ทางเบอร์ยังส่งไม่ถึงมือถือจริง (ไม่มีผู้ส่ง SMS · หนี้ M2.9) — สมัครบน prod ได้ทางอีเมลเท่านั้นจนกว่าจะต่อ gateway · อีเมลต้องมี `RESEND_API_KEY` ที่ verify โดเมนแล้ว
2. **LINE**: ต้องตั้ง `LINE_LIFF_ID` + `LINE_CHANNEL_ID` ถึงจะสมัครด้วย LINE ได้ · ปุ่ม "เพิ่มเพื่อน LINE" ต้องมีที่ตั้งค่าลิงก์เพิ่มเพื่อน/Basic ID ของ LINE OA ร้านก่อน
3. **กล้องสแกน QR**: ติดตั้ง expo-camera + สิทธิ์กล้อง + บิลด์ใหม่ (ข้อตัดสิน 17)
4. **เว็บ → แอป `{ev:"open-member"}`**: เมนูเว็บ (NavDrawer) ต้องส่งสัญญาณนี้เมื่อเปิดในแอป (UA `SharkApp/`) — ไม่งั้นพนักงานเข้าจอสมาชิก native ไม่ได้ (Drawer เปิดไม่ได้จากหน้าระบบงาน)
5. **เหตุผล/บริการของตรา** อยู่ใน `StampEvent.refId` — ควรมีคอลัมน์ note ในรอบที่มี migration
6. PIN ของใบไม่มีเพดานกรอกผิด (พนักงานล็อกอินแล้ว · PIN เป็นของใบไม่ใช่ความลับรายคน — ตามข้อตัดสิน M2.3 ข้อ 5)
7. **แอปลูกค้า** (UA `SharkCustomer/`) ยังไม่มี — สัญญาฝั่ง native: เปิด `/m/<slug>/*` ใน WebView · รอข้อความ `push-bridge-ready` แล้ว `postMessage(JSON.stringify({type:"push-token", expoToken, platform}))` (iOS เข้า window · Android เข้า document — สะพานฟังทั้งสอง)
8. hits ของลิงก์ LIFF = คนเริ่มสมัคร (ข้อแย้ง ข)
9. builder ไม่ได้รัน web export/ภาพของแอปเอง (กติกาห้าม build) — ตรวจแค่ tsc + qc-mobile-app

## 6. ข้อมูลสำหรับถ่ายภาพ (ผู้คุมงาน)

**เว็บ (ภาพ 29)** — ต้อง build QC server ก่อน (route/หน้าใหม่):
- `bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-member.mts 3.11` (owner: `m-join-welcome` + `m-join-form` · harness สร้างลิงก์ที่มา "โพสต์ Facebook ก.ย." + ใส่ `?ref=` ของสมาชิก 1 ให้เอง)
- `bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-member.mts 3.11 --user customer:5RVMTN` (สมาชิก 1 · `m-join-done`)
- ร้าน QC: `policyVersion 0` → ป้าย "ยอมรับ นโยบายการใช้ข้อมูลสมาชิก" (ไม่ใช่ "นโยบาย v3") · `welcomePoints 0` → หน้าต้อนรับ "สะสมแต้มและรับสิทธิ์สมาชิกได้ตั้งแต่วันนี้" และหน้า done "แต้มคงเหลือ … · ร้านนี้ยังไม่มีแต้มต้อนรับ" (ข้อมูลจริงของร้าน QC · ถ้าอยากเห็นแบบภาพ 29 ตั้งกฎ EVENT_BONUS SIGNUP + เผยแพร่นโยบายก่อนถ่าย) · ฟอร์มมี 12 ฟิลด์ (ชื่อ/นามสกุล/คำนำหน้า/วันเกิด/เพศ/สัญชาติ/facebook/ที่อยู่ 5 ช่อง) จึงยาวกว่าภาพ · ความยินยอมเริ่มปิดทุกช่อง (ข้อตัดสิน 4)
- ผู้แนะนำ: ถ้าโปรแกรมแนะนำเพื่อนของร้าน QC เปิดอยู่ จะขึ้นแถว "ผู้แนะนำ: <code> กรอกแล้ว" + กล่องรางวัล · ปิดอยู่ = แถวกรอกโค้ด + ข้อความ "ร้านนี้ปิดโปรแกรมแนะนำเพื่อนอยู่ตอนนี้…"

**แอปพนักงาน (ภาพ 28)** — `apps/mobile/qc/shoot-member.mjs`:
- ครบวงจร: `QC_PREPARE=1 bash scripts/with-gate-lock.sh node apps/mobile/qc/shoot-member.mjs` → rsync ซอร์สไป `/root/qc-shark-mobile-member` (node_modules = symlink ไป `/root/qc-shark-mobile/node_modules` ที่มี react-native-web แล้ว · package.json ตรงกัน) → patch `session.ts` (localStorage) + `login.tsx` (GoogleSignin try/catch) → `npx expo export --platform web --output-dir dist --clear` → เสิร์ฟ dist ในตัว (พอร์ต 4711 · SPA fallback) → ถ่าย iPhone 390×844 × 3 จอ
- มี dist เสิร์ฟอยู่แล้ว: `QC_BASE=http://127.0.0.1:4700 node apps/mobile/qc/shoot-member.mjs`
- ผล: `apps/mobile/qc/shots-member/{member-search,member-summary,member-stamp}-iphone.png` + `summary.json` `{screens:[{name, ok, errors[], missing[], overflow, unmocked[]}]}` · ok = ไม่มี pageerror + testID ครบ + ไม่ล้นแนวนอน · exit 1 ถ้ามีจอไม่ ok
- ขั้นในแต่ละจอ: search = พิมพ์ "สม" รอ `member-result-0` · summary = `/member/c1` · stamp = `/member/stamp?customerId=c1` พิมพ์ PIN 1234 กด `member-stamp-submit` รอ `member-stamp-banner` · mock ทุก `/api/mobile/*` ด้วยข้อมูลจำลองตามภาพ 28 (สมชาย ใจดี Gold · 2,340 · 2 · 7/10 → 8/10)

## 7. แก้ตามตีกลับรอบ 1 (11 ก.ย.)

**ต้นเหตุ**: `apps/mobile/app/(app)/member/index.tsx:14` `import { DrawerActions } from "@react-navigation/native"` — tsc ผ่าน (แพ็กเกจยังอยู่ใน node_modules) แต่ Metro ของ expo-router SDK 56+ ปฏิเสธทั้ง bundle ("expo-router is no longer compatible with react-navigation") ⇒ ถ้าขึ้น OTA/บิลด์ แอปทั้งตัวเปิดไม่ขึ้น · บทเรียน: จอแอปต้องยืนยันด้วย bundler จริง ไม่ใช่แค่ tsc

**แก้**: ลบ import นั้น · ปุ่ม ☰ ใช้ `useNavigation()` ของ `expo-router` แล้วเรียก `openDrawer()` (helper ของ Drawer ถูกรวมเข้า navigation ของจอลูก · ไม่มีก็ไล่ `getParent()` ขึ้นไปหา — ไม่ใช้ `useNavigation("/(app)")` เพราะหา layout ไม่เจอแล้ว throw) · `grep -rn "@react-navigation" apps/mobile/app apps/mobile/src` เหลือแค่คอมเมนต์ (ของเดิมใน `(app)/_layout.tsx:15` + คอมเมนต์อธิบายใน member/index.tsx)
- `apps/mobile/qc/shoot-member.mjs`: เพิ่มจอตรวจ `member-drawer` (กด ☰ บนจอค้น → Drawer เปิดจริง + มีเมนู "สมาชิก" `drawer-member`) · เพิ่ม `QC_SKIP_EXPORT=1` (คู่ `QC_PREPARE=1` = เสิร์ฟ dist เดิมแล้วถ่าย ไม่ export ใหม่)

**ผลยืนยันด้วย bundler จริง** (`QC_PREPARE=1 bash scripts/with-gate-lock.sh node apps/mobile/qc/shoot-member.mjs` — web export ในสำเนา `/root/qc-shark-mobile-member` · ไม่ใช่ eas/OTA):
- `npx expo export --platform web --output-dir dist --clear` → **Exported: dist** · web bundle 1 ไฟล์ `entry-7e0979d7….js` (2.9MB) · ไม่มี error (require `expo-camera` แบบ optional ผ่าน Metro ได้จริงตามข้อตัดสิน 17)
- `apps/mobile/qc/shots-member/summary.json`: **4/4 จอ ok · errors 0 · missing 0 · overflow false · unmocked 0** — member-search (พิมพ์ "สม" → 3 คน ชื่อ/เบอร์ปิดบัง/ชิประดับ) · member-summary (หัวการ์ด Gold · 2,340 / 2 / 7/10 · ปุ่ม 2×2 · ประวัติ 3) · member-stamp (ใส่ PIN → แบนเนอร์ "ประทับสำเร็จ · 8/10 · อีก 2 ครั้ง ได้ดำน้ำฟรี 1 ไดฟ์" · ดวง 8 ทึบ) · member-drawer (Drawer เปิด · ระบบงาน / ผู้ช่วย AI / สมาชิก) — builder เปิดดูภาพทั้ง 4 แล้ว · จุดเล็ก: ช่องค้นบนเว็บมีกรอบ focus ของเบราว์เซอร์ (เฉพาะ react-native-web ไม่มีบนเครื่องจริง)

**ผลรันใหม่ทั้งหมด**: `qc-member-m3.11` **15/16** (เหลือ S3.3 PARITY ของผู้คุมงาน · S5.1 ผ่านหลังผู้คุมงานแก้ข้อสอบตามข้อแย้ง ก · S4.1/S3.2/S4.3 ผ่านบนบิลด์/ภาพใหม่) · tsc ราก ✅ · apps/mobile tsc ✅ · fitness 26/26 ×2 · qc-mobile-app 38/38

### ตรวจภาพ
_(ผู้คุมงาน Opus 5 · 11 ก.ย. ~21:40 UTC · build QC ใหม่ (เว็บ LIFF) + web export แอป (`QC_PREPARE=1 node apps/mobile/qc/shoot-member.mjs`) · เปิดดูภาพเทียบ `29-liff-onboarding.png` + `28-staff-mobile.png` ด้วยตาแล้ว)_
- **LIFF (ภาพ 29)**: (ก) ต้อนรับ — โลโก้ย่อร้าน · "สมัครสมาชิก <ร้าน>" · "มาจาก: <ลิงก์> (src=…)" · สมัครด้วย LINE (ดำ) / สมัครด้วยเบอร์โทร · ลิงก์นโยบาย ✓ (ข) ฟอร์ม — ฟิลด์ที่ร้านเปิดให้กรอก + เบอร์ + ขอรหัส OTP · ผู้แนะนำ "กรอกแล้ว" + กล่องฟ้า "คุณและเพื่อนจะได้รางวัล" · ความยินยอม 4 ช่อง · ยอมรับนโยบาย · สมัครสมาชิก (ดำ) ✓ (ค) สำเร็จ — บัตรดำ + QR + ชิประดับ · กล่องแต้ม · เปิดบัตรสมาชิก / ไปกระเป๋าสิทธิ์ ✓
- ต่างจาก mockup (ยอมรับ): ฟอร์มยาวกว่าภาพเพราะร้าน QC เปิดฟิลด์ระบบให้ลูกค้ากรอกเองหลายช่อง (ข้อมูลร้าน) · ความยินยอม 4 ช่องเริ่ม "ปิด" (PDPA — ภาพเปิดไว้) · ร้าน QC ไม่มีแต้มต้อนรับ → ข้อความกลาง · ไม่มีปุ่ม "เพิ่มบัตรลง LINE" (ยังไม่มีที่เก็บลิงก์ LINE OA ของร้าน — หนี้)
- **แอปพนักงาน (ภาพ 28)**: (ก) ค้นสมาชิก — ช่องค้น · กล่องเส้นประ "สแกน QR บัตรสมาชิก" · ผลค้นหา 3 คน ชื่อ/เบอร์ปิดบัง/ชิประดับ ✓ (ข) สรุป — การ์ดชื่อ+ระดับ+รหัส · แต้ม/voucher/สแตมป์ · ปุ่ม 2×2 ประทับสแตมป์/ใช้สิทธิ์/ให้แต้ม/ออก voucher · ประวัติ 3 รายการ ✓ (ค) ประทับ — แบนเนอร์ "ประทับสำเร็จ · 8/10 · อีก 2 ครั้งได้…" · การ์ด 10 ช่อง · เหตุผล/บริการ · PIN 4 จุด · ปุ่มประทับแล้ว ✓ · (ง) ลิ้นชักเมนูมี "สมาชิก" ✓
- ต่างจาก mockup (ยอมรับ): ปุ่มหลักสีตามธีมแอป (น้ำเงิน) แทนดำ · ไม่มีแถบแท็บล่าง (แอปใช้ลิ้นชักเมนู) · กรอบ focus ของเบราว์เซอร์ในช่องค้น (เฉพาะ web export)
- **รอบแรกตีกลับ**: 🔴 `app/(app)/member/index.tsx` import `@react-navigation/native` → Metro ปฏิเสธ (expo-router SDK 56+) แอปทั้งตัว bundle ไม่ผ่าน (tsc ไม่จับ) · builder เปลี่ยนเป็น `useNavigation()` ของ expo-router · export ผ่าน 4/4 จอ
- **PARITY: ผ่าน**
