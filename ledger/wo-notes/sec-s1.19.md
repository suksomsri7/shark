# WO S1.19 — SMS OTP · เบอร์ = ID (`core/phone-auth.ts` + `UserPhone`/`PhoneOtp` + route มือถือ + mock SMS)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-c` branch `wip/sec-s1.19` (จาก e7317705) · 2026-11-04T13:35Z · ผู้คุมงาน: Fable 5.1 · builder: Opus (เลน c)
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.19.md` (+ COMMON + RESOLUTIONS R-K9/K10 · §B.8 · §G) · แบบ S1/S2 + มติ 13 + R8
> ข้อสอบ: `scripts/qc-sec-s1.19.mts` (21 ข้อ · commit test: e7317705 · **แก้หลัง commit หรือไม่: ไม่** — ขอ ORACLE-EDIT 1 รายการ §7)
> commit ของใบ รอบ 1: `301aee1e` mock SMS · `c0a56ecf` phone-auth core · `042035fb` routes + me.phone + API doc · `21d40ce3` notes
> **รอบ 2 (หลังรีวิว 2 คน · RESOLUTIONS §H R-S1.19a–h)**: merge `session/secretary` → `ff68b0db` · `db115e04` core · `5c500c16` routes + doc · ไฟล์นี้ = commit ถัดไป · ดู §R2 ท้ายไฟล์ (มาแทน §5/§7/§8 ส่วนที่ขัดกัน)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/core/sms.ts` | แก้ (เพิ่มเท่านั้น) | `SMS_PROVIDER=mock` ⇒ `mockProvider` ก่อนตรวจคีย์/endpoint · send = `logOps("INFO","sms-mock","SMS (mock)",{detail: JSON {to,text}})` (lazy import `./ops`) → `{ok:true, externalId:"mock-<ms>"}` · `__resetSmsProviderCacheForTests()` · ไม่ตั้ง = เดิม (null) | – |
| `src/lib/core/phone-auth.ts` | ใหม่ | ค่าคงที่ 6 ตัว · `requestPhoneOtp` · `verifyPhoneOtp` · `consumePhoneOtp` · `signupWithPhone` · `linkPhoneToUser` · `phoneOfUser` (ลายเซ็นตามใบ §2) · import แค่ `./db` `./hash` `./sms` | – |
| `src/app/api/mobile/auth/sms/request/route.ts` | ใหม่ | always-200 `{ok:true,resendAfterSec:60}` · 400 เมื่อ body ไม่ใช่ JSON/ไม่มี phone · ip จาก `x-forwarded-for` · sms_failed ⇒ `logOps WARN sms-otp` (ไม่มีเบอร์/รหัส) | – |
| `src/app/api/mobile/auth/sms/verify/route.ts` | ใหม่ | 401 `{error,message}` · มีบัญชี ⇒ consume + `issueMobileToken` (isNew:false) · ไม่มีบัญชี+ไม่มี signup ⇒ `{needSignup:true}` ไม่ consume · signup ⇒ `signupWithPhone` (ล้ม 409) + consume + token (isNew:true) | – |
| `src/app/api/mobile/auth/phone/link/route.ts` | ใหม่ | Bearer (`mobileUser`) · verify → เบอร์ของคนอื่น 409 (ไม่ consume) → consume → `linkPhoneToUser` → `{ok:true, phone}` | – |
| `src/app/api/mobile/me/route.ts` | แก้ | `user.phone = await phoneOfUser(user.id)` (+1 query) | ✅ hot (hunk เล็กสุด 4 บรรทัด) |
| `docs/api/SECRETARY-API.md` | แก้ | แถว `me` · `auth/sms/request` · `auth/sms/verify` = EXISTS รูปจริง + แถวใหม่ `auth/phone/link` | – |

ไม่แตะ `prisma/**` · `core/auth.ts` · AuthToken · `src/lib/ai/**` · ไม่รัน `prisma generate` · ไม่แก้ package.json

## 2. migration / seed / backfill
- ไม่มี (ใช้ `PhoneOtp`/`UserPhone` ของ S1.1 · global axis ใน scope.ts แล้ว)

## 3. ด่าน (ย่อ)
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด | ✅ | e7317705 (ผู้คุม) |
| D2 | forced ×2 (ของ builder · ผู้คุมรันซ้ำเอง) | ⚠️ 20/21 | Q-3 แดงเพราะข้อสอบ (§7) · สำเนาที่แก้ hunk แล้ว 21/21 |
| D4 | regression | ✅ | §5 |
| D5 | typecheck · fitness ×2 | ✅ | §5 |
| D6 | build | – | ผู้คุมรันต่อชุด merge |
| D7/D8 | ภาพ/testID | N-A | ไม่มี UI (จอ S2.12) |
| D10 | เอกสาร API | ✅ | `docs/api/SECRETARY-API.md` |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | check ids / เหตุผล |
|---|---|---|
| X1 ขอบเขต | ใช้ | link: เบอร์ของคนอื่น ⇒ 409 (S-3 · route) · me คืนเบอร์ของ token เท่านั้น (R-4/R-5) |
| X2 ตัวตน | ใช้ | เบอร์ = ตัวตน: token ออกได้เฉพาะหลัง OTP ตรง + consume สำเร็จ (R-3/R-4) · อีเมลมีบัญชีแล้วไม่ผูกให้เอง (R8 · S-1) |
| X3 ยิงพร้อมกัน | ใช้ | consume = `updateMany consumedAt null` คำสั่งเดียว (V-3) · attempts++ = `updateMany attempts<5` · signup แข่งกัน = unique ของฐาน → email_taken/phone_taken |
| X4 ส่งซ้ำ | ใช้ | code ใช้ซ้ำหลัง consume ⇒ 401 (R-3) |
| X5 งานตามเวลา | N-A | ไม่มีงานตามเวลา (`now` ฉีดได้ใน request/verify) |
| X6 ข้อมูลเข้าอันตราย | ใช้ | body ไม่ใช่ JSON/ชนิดผิด ⇒ 400 · ชื่อ 1–60 · อีเมล ≤254 + รูปแบบ · เบอร์ผ่าน `toE164Thai` |
| X7 endpoint มือถือ | ใช้ | rate-limit 5/เบอร์ · 20/ip (Q-2 · Q-3) · always-200 กัน enumeration (R-1) · Bearer บน link (R-5) |
| X8 PDPA | ใช้ | รหัสเก็บเป็น sha256 เท่านั้น · log ของ route ไม่มีเบอร์/รหัส · mock SMS เขียนข้อความลง OpsEvent (เฉพาะ `SMS_PROVIDER=mock`) |
| X9 การกระทำอันตราย | N-A | ไม่มี mutation ทางธุรกิจ |
| X10 ความลับ | ใช้ | ไม่มีรหัส/codeHash ใน response ใด ๆ (Q-1 · R-1) |
| X11 ต้นทุน | N-A | ไม่เรียกโมเดล · SMS จริงคิดเงินต่อข้อความ (เพดาน 5/เบอร์ · 20/ip ต่อ 10 นาที) |

## 5. ผลข้อสอบ (วางจริง)
- `qc-sec-s1.19` forced #1 (13:26Z): `JSON_SUMMARY {"total":21,"passed":20,"failed":["Q-3"],"skipped":[],"findings":[{"id":"Q-3","sev":"MAJOR"}]}` exit=0
- `qc-sec-s1.19` forced #2 (13:26Z): `JSON_SUMMARY {"total":21,"passed":20,"failed":["Q-3"],"skipped":[],"findings":[{"id":"Q-3","sev":"MAJOR"}]}` exit=0
- สำเนาชั่วคราวที่ใส่ hunk ORACLE-EDIT §7 (ลบแล้ว · ไม่ commit): `JSON_SUMMARY {"total":21,"passed":21,"failed":[],"skipped":[],"findings":[]}` exit=0
- residue: `finally` ของข้อสอบลบ PhoneOtp/UserPhone `+6680001*` · Session/User `qcs19-*` (OpsEvent sms-mock คงอยู่ตามปกติของ log)
- regressions (เทียบ `ledger/qc-baseline/sec-baseline-85751098.txt`):
  - `qc-mobile-auth`: `qc-mobile-auth: 31/31 ผ่าน · CRITICAL fail 0` exit=0 (baseline exit=0) ✅
  - `qc-mobile-authz-hotfix`: `JSON_SUMMARY {"total":12,"passed":12,"findings":[]}` exit=0 (baseline 12/12) ✅
  - `qc-account-deletion`: `JSON_SUMMARY {"total":18,"passed":18,"findings":[]}` exit=0 (ไม่มีใน baseline file) ✅
  - `qc-security-hotfix`: `QC Security Hotfix: 14/14 ผ่าน` exit=0 (ไม่มีใน baseline file) ✅
  - `qc-onboarding-drip`: `JSON_SUMMARY {"total":6,"passed":6,"findings":[]}` exit=0 (ไม่มีใน baseline file) ✅
- typecheck (`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=9500M bash scripts/iso.sh pnpm typecheck`): 10 errors ทั้งหมดอยู่ใน `scripts/qc-sec-s1.4.mts` (3) `qc-sec-s1.5.mts` (3) `qc-sec-s1.7.mts` (4) = import โมดูลที่ยังไม่สร้าง (รู้อยู่แล้ว) · **0 ในไฟล์ที่แตะ**
- fitness: มี env (D-1 ในข้อสอบ ✅ + เซสชัน `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}`) · `env -u DATABASE_URL -u DIRECT_URL` `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` · pre-commit hook ผ่านทั้ง 3 commit

คำสั่ง: `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s1.19.mts`

## 7. ข้อแย้ง / มติทางเทคนิค
- **ORACLE-EDIT S1.19-Q-3** — เชื่อว่าข้อสอบผิด: `` `${P.ip}${String(i).padStart(2, "0")}`.slice(0, 12) `` โดย `P.ip = "+6680001799"` (11 ตัว) + 2 หลัก = 13 ตัว แล้วตัดเหลือ 12 ⇒ ได้แค่ 2 เบอร์ (`+66800017990` ×10 · `+66800017991` ×10) ⇒ ด่านต่อเบอร์ (5) ตัดก่อน ⇒ ip 10.9.9.9 มีแค่ 10 แถว ⇒ ครั้งที่ 21 ไม่ติดด่าน ip (20) · เสนอ hunk บรรทัด 88:
  ```diff
  -    for (let i = 0; i < 20; i++) await pa.requestPhoneOtp(`${P.ip}${String(i).padStart(2, "0")}`.slice(0, 12), { send, ip: "10.9.9.9" });
  +    for (let i = 0; i < 20; i++) await pa.requestPhoneOtp(`+668000179${String(i).padStart(2, "0")}`, { send, ip: "10.9.9.9" });
  ```
  (20 เบอร์ต่างกัน 12 ตัว · ยังขึ้นต้น `+6680001` ⇒ cleanup เดิมครอบ) · สำเนาที่ใส่ hunk นี้ = 21/21
  - ทางเลือกที่ไม่ทำ: นับ "ครั้งที่ขอ" ต่อ ip แทนแถว (`rate-limit-db.ts`) — ใบสั่งให้นับแถว PhoneOtp และตัวนับแบบนั้นค้างข้ามรอบข้อสอบ (cleanup ไม่ลบ) ⇒ รอบที่ 2 แดง Q-1
- **D-3 ระวัง**: regex `/@\/lib\/env/` จับข้อความในคอมเมนต์ด้วย ⇒ คอมเมนต์หัวไฟล์ phone-auth.ts เลี่ยงสะกด path นั้น (ไม่ใช่ข้อแย้ง)
- มติ builder:
  - `verifyPhoneOtp` รหัสผิด = `updateMany({attempts < 5}) increment` — ถ้าแข่งกันจนครบ 5 แล้ว คืน `locked` (ไม่ทะลุเพดาน)
  - `consumePhoneOtp` เพิ่มเงื่อนไข `expiresAt > now` (รหัสที่หมดอายุระหว่าง verify→consume ใช้ไม่ได้)
  - `signupWithPhone` เบอร์ผิดรูป ⇒ `bad_input` (ใบไม่มี reason bad_phone ในชนิดผล) · ตรวจ email ก่อน phone · แข่งกันสมัคร ⇒ P2002 แยก target email/phone
  - `linkPhoneToUser` เมื่อ user มีเบอร์อื่นอยู่แล้ว ⇒ **เปลี่ยน** เป็นเบอร์ใหม่ (upsert by userId · เบอร์ผ่าน OTP แล้ว) — ใบระบุแค่ "เบอร์เดิมของตัวเอง = ok"
  - verify route: ผ่าน + มีบัญชี ⇒ `signup` ที่แนบมาถูกเมิน · consume ล้ม (ใช้พร้อมกัน) ⇒ 401 invalid · signup สำเร็จแต่ consume ล้ม ⇒ บัญชีอยู่ เข้าใหม่ด้วยเบอร์ได้
  - link route: เช็คเจ้าของเบอร์จากผล verify **ก่อน** consume (รหัสของเจ้าของเบอร์ไม่ถูกเผา)
  - error body ทุกเส้นใหม่มี `message` ไทย (กติการ่วม 6) · 409 ใช้กับ `bad_input` ด้วยตามใบ (เอกสารเดิมเขียน 422)
- ใครได้/เสียสิทธิ์: ผู้ถือเบอร์ที่ผ่าน OTP ได้ Bearer ของบัญชีที่ผูกเบอร์นั้น (เส้นทางเข้าใหม่) · ไม่มีใครเสียสิทธิ์ · ทางเรียกโมเดลใหม่: ไม่มี

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| rate-limit นับแถวแล้วค่อยสร้าง (อ่าน→เขียน) — ยิงพร้อมกันอาจเกิน 5/20 ไปเล็กน้อย | แบบเดียวกับ `requestLogin` เดิม · ใบสั่งให้นับแถว | ถ้าจำเป็น: advisory lock ต่อเบอร์ (ใบภายหลัง) |
| `PhoneOtp` ไม่มี index `(ip, createdAt)` | ห้ามแตะ prisma ในใบนี้ · ปริมาณน้อย (แถวอายุสั้น) | migration ถัดไปของ RUN (`> 20261227000000`) |
| ไม่มีงานลบแถว PhoneOtp ที่หมดอายุ | นอกขอบเขต (index `expiresAt` มีแล้ว) | cron ใบภายหลัง |
| verify route ไม่มี rate-limit ต่อเบอร์แยก (เอกสารเดิมเขียน 10/เบอร์) | ล็อก 5 ครั้ง/รหัส × 5 รหัส/10 นาที = เพดานเดาจริง 25/10 นาที | ผู้คุมตัดสิน |
| จอแอป (ขอรหัส/ใส่รหัส/สมัคร/บังคับผูกเบอร์) | UI | S2.12 |

### env ที่เจ้าของต้องตั้งสำหรับผู้ให้บริการจริง (production · ห้ามตั้ง `mock`)
| ตัวแปร | ความหมาย |
|---|---|
| `SMS_PROVIDER` | ชื่อผู้ให้บริการ (ไม่ว่าง · ไม่ใช่ `mock`) — ว่าง = ช่องทาง SMS ปิด (ขอรหัสทางเบอร์จะตอบ 200 แต่ไม่มี SMS ออก) |
| `SMS_API_KEY` | คีย์ Bearer ของเกตเวย์ (ความลับ) |
| `SMS_ENDPOINT` | URL POST JSON `{to, text, sender}` ของเกตเวย์ |
| `SMS_SENDER` | ชื่อผู้ส่ง (ปริยาย `SHARK` · ต้องลงทะเบียนกับเกตเวย์) |
ทั้ง 3 ตัวแรกต้องมีครบ ไม่งั้น `getSmsProvider()` = null · `SMS_PROVIDER=mock` ใช้กับ dev/QC เท่านั้น (ข้อความที่มีรหัสถูกเขียนลง OpsEvent)

## 9. คืนสภาพฐาน QC เลขา
- ข้อสอบ `finally` ลบ PhoneOtp/UserPhone ขึ้นต้น `+6680001` · Session ของ user `qcs19-*` · User `qcs19-*` · ใบนี้ไม่มี seed · ไม่สร้างแถวถาวรนอกจาก OpsEvent (`sms-mock`, `sms-otp`)


## R2. รอบ 2 — แก้ตามรีวิว (4 พ.ย. ~14Z)

### R2.1 ไฟล์ที่แตะเพิ่ม/แก้
| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/core/phone-auth.ts` | `normalizeThaiMobile` (export · `+66[689]\d{8}` · พับ +660/660 · ใช้ทุกฟังก์ชัน) · `phonePlaceholderEmail` / `isPhonePlaceholderEmail` / `publicEmailOf` / `PHONE_PLACEHOLDER_DOMAIN` · `PHONE_RL_PER_PHONE_DAY = 20` · request: throttle 60 วิ (แถวยังไม่ใช้+ยังไม่หมดอายุ ⇒ ok · ไม่สร้าง/ไม่ส่ง · `resendAfterSec` = วินาทีที่เหลือ) → 5/10 นาที + 20/วัน ต่อเบอร์ → 20/ip · `opts.now` ใช้กับ throttle/rate-limit/createdAt/expiresAt · ส่งล้ม ⇒ แถวคงอยู่แบบ consumed · verify: code ตัดเหลือตัวเลข · **จอง attempt ก่อนเทียบ** (`updateMany attempts<5`) · ถูก ⇒ คืน attempt (decrement) · signup: `User.email` = placeholder + `prefs.pendingEmail` · `opts.otpId` ⇒ consume + สร้าง User/UserPhone ใน `$transaction` เดียว · `email_taken` + otpId ⇒ จอง 1 attempt · อีเมลโดเมน placeholder = bad_input · link: `phone_change_locked` เมื่อมีเบอร์อื่น (ไม่เปลี่ยนเบอร์อีกแล้ว) · `opts.otpId` ⇒ ตรวจครบก่อน consume แล้ว consume+เขียนใน tx · reason ใหม่ `otp_used` (consume แข่งกัน) |
| `src/lib/core/sms.ts` | mock ถูกเมินเมื่อ `APP_ENV === "production"` (คืน null) |
| `src/lib/core/email.ts` | `sendEmail` ข้ามปลายทาง `@phone.shark.in.th` เงียบ ๆ (1 hunk · ไม่ throw) |
| `src/app/api/mobile/auth/sms/request/route.ts` | `!smsEnabled()` ⇒ 503 `sms_unavailable` ไทย (หลังตรวจ body · ก่อนเรียก) · `resendAfterSec` ของ route คงที่ 60 |
| `src/app/api/mobile/auth/sms/verify/route.ts` | `user = {id, email (null ถ้า placeholder), pendingEmail, name, phone}` · signup ส่ง `otpId` (consume ใน tx) · `otp_used` ⇒ 401 invalid |
| `src/app/api/mobile/auth/phone/link/route.ts` | ส่ง `otpId` เข้า `linkPhoneToUser` (consume ใน tx) · 409 `phone_change_locked` · `otp_used` ⇒ 401 |
| `src/app/api/mobile/me/route.ts` | `...publicEmailOf(user)` ⇒ `email` null สำหรับ placeholder + `pendingEmail` (null สำหรับบัญชีปกติ) |
| `docs/api/SECRETARY-API.md` | แถว me / sms/request (503 · throttle · 20/วัน) / sms/verify (code ตัดตัวเลข · signup ถูกเมินเมื่อมีบัญชี · placeholder/pendingEmail · attempt) / phone/link (400 · phone_change_locked) ตาม B12 |

### R2.2 ผลข้อสอบ (วางจริง)
- ⚠️ คำสั่งทางการ (`… env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s1.19.mts`) **ล้มกลางทาง ZodError `SESSION_SECRET`** — S-2b/S-2c import `@/lib/core/auth` + `@/lib/core/email` ⇒ `@/lib/env` parse แต่ `qc-sec.sh` ส่งแค่ DB env (ข้อสอบไม่เรียก `loadLegacyQcEnv` แบบชุด legacy) ⇒ ORACLE-EDIT R2-ENV · รันด้วย `SESSION_SECRET=<สุ่ม 48 ตัว ทิ้งหลังรัน>` บนบรรทัดคำสั่ง (ไม่ได้อ่าน .env):
- forced #1: `JSON_SUMMARY {"total":26,"passed":25,"failed":["Q-2"],"skipped":[],"findings":[{"id":"Q-2","sev":"CRITICAL"}]}` exit=1
- forced #2: `JSON_SUMMARY {"total":26,"passed":25,"failed":["Q-2"],"skipped":[],"findings":[{"id":"Q-2","sev":"CRITICAL"}]}` exit=1
- unforced: `JSON_SUMMARY {"total":26,"passed":25,"failed":["Q-2"],"skipped":[],"findings":[{"id":"Q-2","sev":"CRITICAL"}]}` exit=1
- สำเนาชั่วคราวที่ใส่ hunk ORACLE-EDIT R2-Q-2 (ลบแล้ว): `JSON_SUMMARY {"total":26,"passed":26,"failed":[],"skipped":[],"findings":[]}` exit=0
- regressions (หลัง round 2 · เทียบ baseline 85751098): `qc-mobile-auth: 31/31 ผ่าน · CRITICAL fail 0` exit=0 · `qc-mobile-authz-hotfix` `JSON_SUMMARY {"total":12,"passed":12,"findings":[]}` exit=0 · `qc-account-deletion` `JSON_SUMMARY {"total":18,"passed":18,"findings":[]}` exit=0 · `qc-security-hotfix` `QC Security Hotfix: 14/14 ผ่าน` exit=0 · `qc-onboarding-drip` `JSON_SUMMARY {"total":6,"passed":6,"findings":[]}` exit=0 — เท่ารอบ 1 / baseline
- typecheck: 0 ในไฟล์ที่แตะ · ที่เหลือ 7 ตัวอยู่ใน `scripts/qc-sec-s1.5/s1.6/s1.7/s1.13.mts` (import โมดูลที่ยังไม่สร้าง) · fitness มี env `{"total":53,"passed":53}` · `env -u DATABASE_URL -u DIRECT_URL` `{"total":53,"passed":53}` · D-1/D-2/D-3 ✅ · pre-commit ผ่าน

### R2.3 ORACLE-EDIT (รอบ 2)
- **R2-Q-2** — `sent.length === 1` ถูกประเมินตอน `chk` หลังลูป 4 คำขอที่เลื่อนเวลา (ซึ่งต้องสร้างแถว ⇒ ต้องส่ง) ⇒ ตอนนั้น `sent.length` = 5 เสมอ (ข้อเดียวกันยังบังคับแถว = 5) · hunk:
  ```diff
       const rowsAfterThrottle = await prisma.phoneOtp.count({ where: { phone: P.a } });
  +    const sentAfterThrottle = sent.length;
  ...
  -    … && sent.length === 1 && r6.ok === false …
  +    … && sentAfterThrottle === 1 && r6.ok === false …
  ```
- **R2-ENV** — ให้ข้อสอบตั้ง env ที่ `@/lib/env` ต้องการก่อน import auth/email (เช่น `loadLegacyQcEnv("qc-sec-s1.19")` จาก `./qc-env-guard.mjs` แบบ qc-mobile-auth หรือ `process.env.SESSION_SECRET ??= "<qc-only 32+ ตัว>"` ก่อน `await import("@/lib/core/auth")`) — ไม่งั้นคำสั่งทางการ crash ที่ S-2b
- ORACLE-EDIT S1.19-Q-3 ของรอบ 1 ผู้คุมแก้แล้ว (บรรทัด 95) ✅

### R2.4 มติ builder (รอบ 2)
- route `sms/request` ตอบ `resendAfterSec: 60` คงที่ — ไม่ส่งวินาทีที่เหลือของ throttle ออกนอก (ไม่งั้นคนนอกรู้ว่ามีคนเพิ่งขอรหัสของเบอร์นั้น) · ฟังก์ชันคืนวินาทีที่เหลือตาม R-S1.19f
- ลำดับ request: เบอร์ → throttle 60 วิ → 5/10 นาที + 20/วัน → ip — throttle มาก่อน (ไม่สร้างแถว · ไม่ส่ง)
- 503 ตรวจหลัง body (400) และก่อนเบอร์ (เบอร์ผิดตอนไม่มีผู้ให้บริการ = 503 เหมือนกัน · ไม่รั่วต่อเบอร์)
- verify รหัสไม่ครบ 6 หลักหลังตัดตัวเลข = invalid (กิน 1 attempt)
- consume ใน `$transaction` ล้ม (แข่งกัน) ⇒ reason ใหม่ `otp_used` ⇒ route 401 invalid · ไม่มีบัญชีค้าง (ย้อนทั้ง tx)
- เข้าด้วยบัญชีที่มีอยู่ = consume คำสั่งเดียว + ออก token (ไม่มีการเขียนบัญชี จึงไม่ต้อง tx)
- link: ตรวจ phone_taken/phone_change_locked ใน tx **ก่อน** consume ⇒ ถูกปฏิเสธแล้วรหัสยังไม่เสีย
- `publicEmailOf` คืน `pendingEmail` เสมอ (null สำหรับบัญชีปกติ) · `User.prefs` เดิมของบัญชีปกติไม่ถูกแตะ
- ใครได้/เสียสิทธิ์: อีเมลที่พิมพ์ตอนสมัครด้วยเบอร์ไม่ให้สิทธิ์อะไรเลยจนกว่าจะยืนยัน (S1.19b) ⇒ ไม่มีทางยึดบัญชีผ่าน OTP อีเมล / Apple / Google / grantStaffAccess (S-2b) · เจ้าของเบอร์ที่มีเบอร์อยู่แล้วเปลี่ยนเบอร์เองไม่ได้ (ต้องติดต่อทีมงาน)

### R2.5 หนี้ที่เหลือ (แทน §8 ส่วนที่ขัด)
| เรื่อง | ใบที่จะปิด |
|---|---|
| ยืนยันอีเมล: OTP อีเมล → ย้าย `prefs.pendingEmail` เป็น `User.email` ถ้ายังว่าง (บัญชี placeholder ยังรับอีเมลแจ้งเตือน/คำเชิญที่ผูกอีเมลไม่ได้จนกว่าจะยืนยัน) | **S1.19b** |
| index `PhoneOtp(ip, createdAt)` (นับต่อ ip) | migration **`secretary_b`** (`> 20261227000000`) |
| เปลี่ยนเบอร์แบบ step-up (ยืนยันเบอร์เดิม/อีเมล ก่อนย้าย) — วันนี้ `phone_change_locked` | รุ่นถัดไป · S2.12 แสดงข้อความติดต่อทีมงาน (รวมทางตัน `phone_taken` ตอน link) |
| rate-limit นับแถวแล้วค่อยสร้าง (อ่าน→เขียน) — ยิงพร้อมกันอาจเกินเพดานเล็กน้อย | ถ้าจำเป็น: advisory lock ต่อเบอร์ |
| ไม่มีงานลบแถว PhoneOtp ที่หมดอายุ/ส่งล้ม | cron ใบภายหลัง |
| จอแอป (ขอรหัส/ใส่รหัส/สมัคร/บังคับผูกเบอร์/สลับไปอีเมลเมื่อ 503) | S2.12 |
