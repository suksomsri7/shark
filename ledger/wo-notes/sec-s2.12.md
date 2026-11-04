# WO S2.12 — สมัคร/เข้าด้วยเบอร์ (SMS OTP) · login ธีม Airy · บังคับผูกเบอร์ (R8)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-c` branch `wip/sec-s2.12` · 2026-11-04 UTC · builder: ตัวแทนเลน c
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.12.md` (+ COMMON + RESOLUTIONS §F §H §P) · server = S1.19 (ไม่แตะ)
> ภาพ `ledger/design-secretary/sec-c.jpg` หน้า 1 (S1) หน้า 2 (S2) + `sec-dark-c.jpg` · **ไม่มีหน้า login/ผูกเบอร์ในแบบ** — ประกอบจากชิ้นเดียวกับ S1 (orb + การ์ดกระจก + ปุ่มหลัก)
> ข้อสอบ: `scripts/qc-sec-s2.12.mts` (13 ข้อ · commit 06720154 · **แก้หลัง commit หรือไม่: ไม่**)

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ผู้ตรวจ) — ไม่ push

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| apps/mobile/app/login.tsx | เขียนใหม่ (Airy) | ทางหลัก = เบอร์ (login-phone → login-sms → sms/request → /otp?mode=login) · อีเมล OTP 2 ขั้นเดิมอยู่ครบหลัง login-email-toggle · Apple/Google/LINE/Facebook/TikTok logic เดิมทุกบรรทัด · AnimatedOrb 96 (ด่าน qc-mobile-app APP-3.13) · ไม่มีสีฝัง (สีแบรนด์ย้ายไป components/auth/social.ts) |
| apps/mobile/app/signup.tsx | ใหม่ (S1) | ชื่อ/เบอร์/อีเมล (ป้าย "ยังไม่ยืนยัน") · ปุ่ม disabled จนครบ (ชื่อ ≥2 · มือถือไทย · อีเมล) · normalize ก่อนส่ง · รับค่าคืนทาง query |
| apps/mobile/app/otp.tsx | ใหม่ (S2) | 6 ช่อง (วาง 6 หลัก · ตัวเลขเท่านั้น · ครบแล้วยืนยันเอง) · นับถอยหลัง resendAfterSec · เบอร์ปิดเลขกลาง · ผิด ⇒ สั่น · หมดอายุ/ล็อก ⇒ ส่งใหม่ได้ทันที · needSignup/404 no_account ⇒ การ์ดชวนสมัคร · 503 ⇒ การ์ด + ปุ่มกลับไปเข้าวิธีอื่น · 409 email_taken/phone_taken/bad_input ⇒ ข้อความ |
| apps/mobile/app/phone.tsx | ใหม่ (R8) | เบอร์ → รหัส 6 ช่องในหน้าเดียว → phone/link → refreshMe · ทางออกเดียว = ออกจากระบบ · phone_taken / phone_change_locked / 503 ⇒ ข้อความไทย |
| apps/mobile/app/_layout.tsx | แก้ (gate +1 เงื่อนไข) | ไม่มี token: อนุญาต /signup /otp นอกจาก /login · **มี token + `user.phone === null` ⇒ /phone ก่อนตรวจร้าน** · ลำดับเดิม /login → /dna → /(app) ไม่เปลี่ยน |
| apps/mobile/src/lib/auth-context.tsx | แก้ 1 บรรทัด (type) | `Me.user` เพิ่ม `phone?: string \| null` · `pendingEmail?` (ไม่มีฟิลด์ = server เก่า = ไม่บังคับ) |
| apps/mobile/src/lib/{phone,auth-api}.ts | ใหม่ | normalizeThaiMobile (regex เดียวกับ server) · maskPhone · formatThaiMobileInput · smsRequest/smsVerify/phoneLink ห่อ api() · authErrorCode/authErrorKey |
| apps/mobile/src/components/auth/{airy.tsx,social.ts} | ใหม่ | StepBar · Hero · AuthField · OtpBoxes · LinkLine · NoteLine · GlassButton (สีจาก theme เท่านั้น) · สีแบรนด์ social |
| apps/mobile/src/i18n/{index,th,en}.ts | ใหม่ (ขั้นต่ำ) | `useT()` คืน `t(key, vars?)` · ปริยายไทย · คีย์ `auth.*` 81 ตัว th=en · **S2.1 (เลน d) สร้างไฟล์เดียวกัน ⇒ ตอน merge รวมแผนที่คีย์** |
| apps/mobile/qc/fixtures/secretary/s2.12.json | ใหม่ | noAuth /login /signup /otp · /phone เปิดด้วย token + /me phone=null · mock sms/request · sms/verify · phone/link |
| apps/mobile/qc/shoot-sec.mjs | แก้ 3 บรรทัด (ไฟล์ของ S0.2) | ROUTES รับ query ได้ (`/otp?phone=…`) — ชื่อภาพ/expect/noAuth/tall ใช้ path ไม่รวม query · goto ใช้ทั้งก้อน (ไม่งั้นถ่าย /otp พร้อม query ไม่ได้และ qc-sec-ui หา "otp" ไม่เจอ) |
| apps/mobile/qc/shots-sec/{login,signup,otp,phone}[-dark].png + 4 ภาพคู่ + summary.json | ใหม่ | หลักฐาน U |

## 2. ภาพ (คำสั่งจากรากรีโป · สำเนา QC แยกของเลน c ไม่ชนเลน d)
```
S='/signup?name=%E0%B8%AA%E0%B8%B8%E0%B8%82&phone=0812345678&email=suk%40thebean.co'
O='/otp?phone=0812345678&mode=signup&name=%E0%B8%81&email=a%40b.co'
bash scripts/iso.sh env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-c QC_PORT=4716 ROUTES="/login,$S,$O,/phone" FIXTURE=apps/mobile/qc/fixtures/secretary/s2.12.json node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/parity-sec.sh c 1 apps/mobile/qc/shots-sec/signup.png apps/mobile/qc/shots-sec/signup-c1-pair.png
bash scripts/parity-sec.sh c 1 apps/mobile/qc/shots-sec/signup-dark.png apps/mobile/qc/shots-sec/signup-dark-c1-pair.png --dark
bash scripts/parity-sec.sh c 2 apps/mobile/qc/shots-sec/otp.png apps/mobile/qc/shots-sec/otp-c2-pair.png
bash scripts/parity-sec.sh c 2 apps/mobile/qc/shots-sec/otp-dark.png apps/mobile/qc/shots-sec/otp-dark-c2-pair.png --dark
bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s2.12.mts
```
| หน้า | mockup | ภาพคู่ / ภาพ | จุดต่าง |
|---|---|---|---|
| S1 สมัคร (สว่าง) | c/1 | `apps/mobile/qc/shots-sec/signup-c1-pair.png` | แบบมีแถบสถานะ 9:41 (เว็บไม่มี) · ตัวอักษรใหญ่กว่าสัดส่วนแบบ (R-UI1: ไม่ย่อต่ำกว่า tokens.type) ⇒ ช่องล่างต่ำลง ~20dp · เพิ่มป้าย "ยังไม่ยืนยัน" ข้างช่องอีเมล (R-S1.19a) · ข้อตกลงตัด 2 บรรทัด |
| S1 สมัคร (มืด) | c/1 dark | `apps/mobile/qc/shots-sec/signup-dark-c1-pair.png` | เหมือนข้างบน |
| S2 OTP (สว่าง) | c/2 | `apps/mobile/qc/shots-sec/otp-c2-pair.png` | เบอร์ปิดเลขกลาง 081-•••-5678 (ใบสั่ง) · "หมดอายุใน 10 นาที" (server TTL 10 นาที ไม่ใช่ 5 ของแบบ) · ไม่มีลิงก์ "ส่งรหัสทางอีเมลแทน" (บัญชีใหม่ยังไม่มีอีเมลยืนยัน — แทนด้วย "แก้เบอร์หรืออีเมล" = otp-edit-email) · ภาพจริงยังไม่พิมพ์รหัส (แบบพิมพ์ 482) |
| S2 OTP (มืด) | c/2 dark | `apps/mobile/qc/shots-sec/otp-dark-c2-pair.png` | เหมือนข้างบน |
| login (NO_PAIR) | — | `apps/mobile/qc/shots-sec/login.png` · `login-dark.png` | Apple ไม่ขึ้นบนเว็บ (ซ่อนนอก iOS ตามกติกาเดิม) |
| ผูกเบอร์ (NO_PAIR) | — | `apps/mobile/qc/shots-sec/phone.png` · `phone-dark.png` | — |

## 3. ทางเดิน 4 ทาง
1. **สมัคร:** /login → "ยังไม่มีบัญชี? สมัคร" → /signup (ชื่อ/เบอร์/อีเมล) → `sms/request` → /otp?mode=signup&name&email → 6 หลัก → `sms/verify {phone, code, signup:{name,email}}` → token → `signIn` → ยาม: เบอร์มีแล้ว ⇒ ไม่มีร้าน ⇒ /dna (เดิม). 409 email_taken ⇒ ข้อความ + "แก้เบอร์หรืออีเมล" กลับ /signup พร้อมค่าเดิม (รหัสเดิมยังใช้ได้จนหมดอายุ).
2. **เข้าด้วยเบอร์:** /login (ช่องเบอร์) → `sms/request` (503 ⇒ ข้อความให้ใช้ Apple/Google/อีเมลบนจอเดียวกัน) → /otp?mode=login → verify → token ⇒ signIn · `{needSignup:true}` (S1.19 จริง) หรือ 404 no_account ⇒ การ์ด "ยังไม่มีบัญชีของเบอร์นี้ — สมัครเลย" → /signup?phone=.
3. **Apple / Google / อีเมล:** โค้ดเดิมทุกบรรทัด (endpoint เดิม `/api/mobile/auth/{apple,google,otp,verify,exchange}`) · อีเมลอยู่หลังลิงก์ "เข้าด้วยอีเมล" · ทุกทางจบที่ signIn → ยาม.
4. **ผูกเบอร์ (R8):** มี token + `/me.user.phone === null` ⇒ ยามพา /phone ก่อนตรวจร้าน (ทุก route) → เบอร์ → รหัส → `phone/link` → `refreshMe` ⇒ ยามพาไป /dna หรือ /(app) · 409 phone_taken / phone_change_locked ⇒ ข้อความ "ติดต่อทีมงาน" · ทางออกเดียว = ออกจากระบบ.

## 4. ผลข้อสอบ
- `qc-sec-s2.12` forced #1: `JSON_SUMMARY {"total":13,"passed":13,"failed":[],"skipped":[],"findings":[]}` exit 0
- forced #2: `JSON_SUMMARY {"total":13,"passed":13,"failed":[],"skipped":[],"findings":[]}` exit 0 · unforced (ไฟล์มีแล้ว ⇒ รันเต็ม): เหมือนกัน exit 0 · ไม่แตะฐาน (residue N/A)
- regressions (unforced · qc-sec.sh + gate lock · SHARK_AI_MOCK=1) เทียบ `ledger/qc-baseline/sec-baseline-85751098.txt` (exit 0 ทุกชุด): `qc-mobile-auth` 31/31 · `qc-mobile-app` 38/38 · `qc-mobile-chat` 29/29 · `qc-mobile-authz-hotfix` `{"total":12,"passed":12,"findings":[]}`
- `qc-sec-s1.19` forced (sanity · ไม่แตะ server): `{"total":26,"passed":26,"failed":[],"skipped":[],"findings":[]}`
- mobile typecheck 0 (M-1) · `pnpm fitness` มี env / ไม่มี env exit 0 (D-1/D-2 ×2 รอบ)

## 5. มติทางเทคนิค / เบี่ยงจากใบ
- `/phone` **ไม่อยู่ใน noAuth** (ใบเขียนไว้ทั้งสองแบบ) — ต้องมี token ไม่งั้นยามพาไป /login · เปิดด้วย token + /me phone=null
- S1.19 ตอบ "ไม่มีบัญชี" เป็น 200 `{needSignup:true}` (ไม่ใช่ 404 no_account) และรหัสผิด = 401 `invalid` (ไม่ใช่ bad_code) · ไม่มี `attemptsLeft` ⇒ แอปรับทั้งสองแบบ ("เหลือ N ครั้ง" แสดงเมื่อ server ส่งมาเท่านั้น — ปัจจุบันไม่ส่ง และ ApiError ไม่เก็บฟิลด์นี้)
- 503 sms_unavailable มาจาก `sms/request` เท่านั้น: login แสดงข้อความ (ปุ่ม Apple/Google/อีเมลอยู่บนจอเดียวกัน) · otp (ตอนส่งซ้ำ) แสดงการ์ด + ปุ่ม "เข้าด้วยวิธีอื่น" → /login (ไม่ทำโค้ด Apple/Google ซ้ำในจอ otp)
- i18n ปริยายไทย (แอปเดิมไทยล้วน · ไม่มี expo-localization) · `setLang()` ให้ S2.1 ต่อ
- login ใช้ AnimatedOrb 96 (orb.png เดิม) ไม่ใช่ Orb ของ Airy — qc-mobile-app APP-3.13 ตรวจ `AnimatedOrb` + `size={96}`
- `F` (0.73) อยู่ใน `components/auth/airy.tsx` ชั่วคราว (S2.1 ย้าย F ไป theme/index — ตอน merge ใช้ของ theme ได้)
- หลังสมัครครั้งแรก **ยังไม่พาไป** `/secretary/onboarding/name` / `/business/new` (route ของ S2.1 ยังไม่มีในทรีนี้) — ยามเดิมพาไป /dna เมื่อไม่มีร้าน

## 6. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ⚠️ ลำดับ deploy: ยาม R8 บังคับ /phone ทุกบัญชีที่ไม่มีเบอร์ — ถ้า prod ยังไม่ตั้ง SMS (503) ผู้ใช้เดิมทุกคนเข้าแอปไม่ได้ (ทางออกเดียว = ออกจากระบบ) | R8 ห้ามข้าม | ผู้คุม: ตั้ง SMS_PROVIDER ก่อนปล่อยแอป/OTA นี้ (runbook S3a.2) |
| บัญชีผู้ตรวจ App Store ไม่มีเบอร์ ⇒ ติด /phone (ไม่มี flag reviewer ใน /me) | ไม่มีฟิลด์ ⇒ ไม่ข้าม (ตามใบ) | ผู้คุม/S3a |
| การ์ด "คุณได้รับคำเชิญจาก <ร้าน>" (R-S1.25b) | ไม่มี route มือถือของ pendingInvitesForUser | S2.21 |
| หลังสมัคร → /secretary/onboarding/name หรือ /business/new | route ของ S2.1 | หลัง merge S2.1 |
| `scripts/sec-ui-inventory.json` ยังไม่มี | ไม่อยู่ในไฟล์ของใบ | S2.1 |
| docs §6 ไม่ได้แก้ (31-secretary.md §6 = state machine ห้อง ไม่เกี่ยว · ตารางเส้นทางแอปเป็นของ S2.1) | กันชน merge | S2.1 |
| `shots-sec/summary.json` + `src/i18n/*` ชนกับเลน d ตอน merge | ไฟล์ร่วม | ผู้คุม: รวม screens/คีย์ |

## ต่อจากนี้ (ถ้า restart)
ไม่มีงานค้าง — ผู้คุมรันซ้ำ §2 แล้วรีวิว · `apps/mobile/node_modules` = symlink ไป shark-in-th (ไม่ commit)

## 7. รอบ merge S2.1 (commit 7362d00b)
- i18n: ใช้ `index.ts` ของ S2.1 (I18nKey + ภาษาเครื่อง) · th/en = `sec.*` + `auth.*` · `authErrorKey` คืน I18nKey
- `F` ของ components/auth ลบ · ใช้ `F.v` จาก `src/theme/index`
- หลังสมัคร: `src/lib/post-signup.ts` (ธงในหน่วยความจำ) — otp ตั้งเมื่อ `isNew` · ยาม: ไม่มีกิจการ ⇒ `/business/new` (แทน /dna เฉพาะคนเพิ่งสมัคร) · มีกิจการ ⇒ `/secretary/onboarding/name` ครั้งเดียว
- shoot-sec: `fixture.locale` (s2.12 = th-TH) — ภาษาเครื่องของ chromium = en ⇒ จอ auth จะเป็นอังกฤษถ้าไม่ตั้ง
- summary.json: 24 route S2.1 + 4 route S2.12 ถ่ายใหม่ในทรีนี้ (58 ภาพ ok ทั้งหมด) · ภาพคู่ secretary-c3 ทำใหม่
- ผล: s2.12 forced ×2 + unforced 13/13 · s2.1 forced 14/14 · mobile-auth 31/31 · app 38/38 · chat 29/29 · authz-hotfix 12/12 · typecheck 0 · fitness ×2 ผ่าน

## 8. รอบ 2 ตามรีวิว R (RESOLUTIONS §R)
- R-S2.12a: สมัครใหม่ไม่มีร้าน ⇒ `/dna` ตามเดิม · `/business/new` เปิดได้แต่ไม่บังคับ — **S2.21 สลับเป็น G1 `/business/new` เมื่อจอจริงพร้อม**
- R-S2.12b: ธงผูก `user.id` (`signIn(token, {freshSignup})` ตั้งหลังโหลด /me) · ล้างตอนเริ่ม `signIn` + ใน `signOut` · มีร้าน ⇒ `/secretary/onboarding/name` ครั้งเดียว
- R-S2.12c: `/phone` busy ใน finally · ผูกแล้วแต่ `refreshMe` ล้ม ⇒ ปุ่ม `phone-retry` (refreshMe คืน boolean) · `locked` ⇒ ตัวนับเดินต่อ (otp + phone) · needSignup → `/signup?reuse=1` ⇒ ใช้รหัสเดิม (ถือในหน่วยความจำ `post-signup.ts`) ไม่ขอใหม่ · สมัครด้วยเบอร์ที่มีบัญชี (`isNew:false`) ⇒ แจ้ง `auth.otp.existingSignedIn` ก่อนเข้า · `Me.user.email: string | null`
