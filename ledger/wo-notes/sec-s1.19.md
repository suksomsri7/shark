# WO S1.19 — SMS OTP · เบอร์ = ID (`core/phone-auth.ts` + `UserPhone`/`PhoneOtp` + route มือถือ + mock SMS)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-c` branch `wip/sec-s1.19` (จาก e7317705) · 2026-11-04T13:35Z · ผู้คุมงาน: Fable 5.1 · builder: Opus (เลน c)
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.19.md` (+ COMMON + RESOLUTIONS R-K9/K10 · §B.8 · §G) · แบบ S1/S2 + มติ 13 + R8
> ข้อสอบ: `scripts/qc-sec-s1.19.mts` (21 ข้อ · commit test: e7317705 · **แก้หลัง commit หรือไม่: ไม่** — ขอ ORACLE-EDIT 1 รายการ §7)
> commit ของใบ: `301aee1e` mock SMS · `c0a56ecf` phone-auth core · `042035fb` routes + me.phone + API doc · (ไฟล์นี้ = commit ถัดไป)

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
