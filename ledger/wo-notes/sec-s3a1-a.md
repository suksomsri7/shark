# WO S3a.1-A — แก้ผลนักล่าฝั่งแอป (R-Z28 cmid ใน ref · R-Z29 ลบบัญชี 2 ขั้น · R-Z30 กัน double-submit + 409 pending · §Z.4 SSE error message + ป้าย kind ใหม่)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุม `/root/projects/shark-sec` · เลน d `/root/projects/shark-sec-d` branch `wip/sec-s3a1-a` (ฐาน 67900c01f) · 2026-11-06/07 UTC · builder Opus
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S3a.1-A.md` + COMMON A.11 + RESOLUTIONS §Z.3 (R-Z28–R-Z30) + §Z.4 (เลน c Q2/Q3 → เลน d: งานเพิ่มจากผู้คุมกลางรอบ) + §Z.2 R-Z21 (สัญญา server `{confirm, code}` — เลน c ทำขนาน · แอปทำตามสัญญา + mock ใน fixture)
> ข้อสอบ `scripts/qc-sec-s3a1-a.mts` (**ไม่แก้ oracle/spec**) · ไม่แตะ server (`src/**`) · ไม่ push

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ดูภาพขั้นใหม่) — ไม่ push

## 1. ไฟล์ที่แตะ
| ไฟล์ | ทำอะไร |
|---|---|
| `apps/mobile/src/api/secretary.ts` | `isPending(e)` (409 + code `pending`) · `retryPending(fn)` = 409 pending ⇒ รอ `PENDING_WAIT_MS` 1500 ms แล้วเรียกซ้ำเงียบ ๆ สูงสุด `PENDING_RETRIES` 3 ครั้ง (รวม 4 คำขอ) · ค้างเกิน/ error อื่น ⇒ โยนตามเดิม · type `account/delete` body = `{ confirm, code }` |
| `apps/mobile/src/lib/auth-api.ts` | `emailOtpRequest(email)` = POST `/api/mobile/auth/otp` (ไม่มี Bearer/tenant · 200 เสมอ) |
| `app/(app)/secretary/new.tsx` | R-Z28: `cmidRef` + `cmidFor` (คีย์ = tenant + คำสั่ง) — คำสั่งเดิม = รหัสเดิม · แก้คำสั่ง/สลับกิจการ = รหัสใหม่ · ล้างเมื่อสำเร็จ · R-Z30: `retryPending` + `sendingRef` (เดิม state `busy` อย่างเดียว) |
| `app/(app)/customers/[id]/info.tsx` | R-Z28: `cmidRef` + `cmidFor` (คีย์ = tenant + ห้องแชท + contactId + คำสั่ง) · `retryPending` (busyRef มีอยู่แล้ว) |
| `app/(app)/secretary/room/[id].tsx` | send ห่อ `retryPending` (cmid ref มีอยู่แล้ว) |
| `app/(app)/secretary/settings/account.tsx` | R-Z29 ลบบัญชี 2 ขั้นในชีตเดิม (§2) |
| `app/{login,otp,phone,signup}.tsx` · `secretary/{scheduled,settings/secretary,settings/knowledge,settings/log,settings/customers}.tsx` · `customers/[id]/index.tsx` | R-Z30: เพิ่ม ref กันกดซ้ำ (§3) |
| `src/i18n/{th,en}.ts` | +15 คีย์ `acct.delete.*` · §Z.4: `sec.kind.kb.save` "บันทึกความรู้"/"Save knowledge" · `sec.kind.memory.forget` "ลบความจำของร้าน"/"Forget shop memory" · `chat.sse.error` (th/en 1072 คีย์เท่ากัน · en ไม่มีอักษรไทย) |
| `src/api/client.ts` · `app/(app)/chat/[id].tsx` | §Z.4 (เลน c Q2): SSE ของ `chat/send` — `ChatEvent` error = `{type:"error", error, message?}` · เดิม event error ถูกข้าม (ไม่มี done ⇒ จอเงียบ ไม่มี bubble แดง) · ตอนนี้ไม่มี done แต่มี error ⇒ `sendChat` โยน `ChatStreamError` (detail = `message`) ⇒ จอแสดง `message` ของ server · ไม่มี message ⇒ `chat.sse.error` (i18n) · ข้อผิดพลาด HTTP เดิมใช้ `apiErrorText` ตามเดิม |
| `qc/fixtures/secretary/s2.21.json` · `s2.21-mgr.json` | + `POST auth/sms/request` (resendAfterSec 60 / 0 — mgr = 0 ให้ click-sec กด "ส่งรหัสอีกครั้ง" ได้) · account/delete 200 เดิม |
| `qc/fixtures/secretary/s2.21-delete.json` | ใหม่ (`routes` อย่างเดียว): บัญชีอีเมลไม่มีเบอร์ · `POST auth/otp` · `POST account/delete` = `__status 401 {error:"invalid"}` |
| `qc/buttons-sec.json` | `--registry` ใหม่: +4 (`acct-delete-sent` view · `-code` input · `-resend` · `-final`) · `acct-delete-confirm` handler = requestCode |
| `scripts/sec-ui-inventory.json` | แถว acct-delete-confirm แก้ + 3 แถวใหม่ |
| `qc/shots-sec/**` | ถ่ายใหม่ 4 route ของ s2.21 (+ mgr) + ภาพคู่ G1–G4 · ภาพขั้นใหม่ `s3a1-a-interaction/` |

## 2. R-Z29 ลบบัญชี 2 ขั้น (ชีต `acct-delete-sheet` เดิม)
- ขั้น 1 (`delStep="word"`): preview เดิม + พิมพ์ "ลบบัญชี" + บรรทัดบอกช่องทาง ("ขั้นถัดไป: เราจะส่งรหัส 6 หลักทาง SMS ไปที่ 080-•••-0101") · ปุ่ม `acct-delete-confirm` = **"ส่งรหัสยืนยัน"** → `requestCode`
  - มีเบอร์ (`user.phone`) ⇒ `smsRequest(user.phone)` (POST auth/sms/request {phone E.164} · ไม่มี Bearer/tenant) · cooldown = `resendAfterSec` (ไม่มี = 60)
  - ไม่มีเบอร์แต่มีอีเมลยืนยันแล้ว (`user.email`) ⇒ `emailOtpRequest` (POST auth/otp {email}) · cooldown 60
  - ไม่มีทั้งคู่ ⇒ ปุ่มปิด + "ติดต่อทีมงานเพื่อลบบัญชี" (pendingEmail ไม่นับ — server ไม่ส่งรหัสให้อีเมลที่ยังไม่ยืนยัน)
  - ล้ม: 503 sms_unavailable ⇒ ข้อความของจอนี้ (`acct.delete.smsDown` — ข้อความเดิมของจอ login ชวน "เข้าด้วย Apple…" ไม่ตรงบริบท) · 429/เน็ต ⇒ เหตุผลกลาง `auth.common.*` · อื่น ⇒ ข้อความไทยของ server หรือ `acct.delete.sendFail` · อยู่ขั้น 1
- ขั้น 2 (`delStep="code"`): `acct-delete-sent` "ส่งรหัส 6 หลัก…ไปที่ <ปิดกลาง> แล้ว" · `acct-delete-code` (ตัวเลข ≤ 6 · one-time-code) · `acct-delete-resend` (นับถอยหลัง · กด = ขอรหัสใหม่ + ล้างช่อง) · ปุ่ม `acct-delete-final` "ลบบัญชี" เปิดเมื่อครบ 6 หลัก → POST `secretary/account/delete {confirm:"ลบบัญชี", code}` (ไม่ส่ง x-tenant-id ตามเดิม) → signOut
  - 401 (ไม่ใช่ `unauthorized`) ⇒ "รหัสไม่ถูกต้องหรือหมดอายุแล้ว…" + ล้างช่อง (`keepCodeOnError`) · `code_required` ⇒ คงขั้นใส่รหัส + ข้อความ · ≥500/เน็ต ⇒ คงรหัสไว้กดซ้ำ · กดซ้ำกันด้วย `busyRef` (guard เดิมของจอ)
- เปิดชีตใหม่ = กลับขั้น 1 (ล้างรหัส/นับถอยหลัง)
- ⚠️ ข้อสังเกต: ยามหน้าประตู (`app/_layout.tsx` R8) พา `user.phone === null` ไป `/phone` ก่อนเสมอ ⇒ ในแอปจริงทุกคนที่ถึงจอนี้มีเบอร์ · ทางอีเมลถึงได้เฉพาะเมื่อ /me ไม่ส่งฟิลด์ phone (fixture `s2.21-delete.json` จึงไม่มีฟิลด์ phone) — ทำไว้ตามสัญญา R-Z21

## 3. R-Z30 รายการตรวจกันกดซ้ำ (ทุกจอ S2 · ✅ = มีอยู่แล้ว · ➕ = เพิ่มในใบนี้ · state = กันด้วย state อย่างเดียว ไม่แก้)
| จอ | ปุ่ม/ฟังก์ชัน | ตัวกัน |
|---|---|---|
| login | verify (รหัสอีเมล) · sendSms · sendOtp · Apple/Google/LINE/Facebook | ✅ verifyingRef (R-S2.14o) · ➕ sendingRef (ขอรหัส · กันพา /otp ซ้ำ) · socialRef (เดิมพึ่งปุ่มปิดอย่างเดียว) |
| otp | verify (กล่องส่งเอง + ปุ่ม) · resend | ➕ verifyingRef · resendingRef |
| phone | request · link (กล่องส่งเอง + ปุ่ม) · reload | ➕ busyRef |
| signup | submit (ขอรหัส) | ➕ sendingRef |
| secretary/new | send (POST rooms) | ➕ sendingRef + cmidRef + retryPending |
| secretary/room/[id] | send · approve/reject (useApprovalFlow) · close · undo · add/remove member | ✅ sendingRef · busyRef (flow) · actRef · ➕ retryPending |
| secretary/inbox | approve/reject | ✅ useApprovalFlow busyRef |
| secretary/scheduled | save (POST scheduled — ซ้ำ = งานประจำ 2 ตัว) · remove · toggle | ➕ busyRef · toggling Set ต่องาน (เดิมไม่มีตัวกันในฟังก์ชันเลย พึ่งปุ่มปิด) |
| secretary/help · help/[caseId] | send · reply · resolve | ✅ busy ref |
| secretary/staff · staff/invite · staff/[membershipId] | invite · resend · cancel · save · suspend/remove | ✅ busyRef |
| secretary/onboarding/name | save | ✅ busyRef |
| business/new | submit (tenants/create) | ✅ busyRef |
| settings/account | notify · shift · requestCode · delete | ✅ guard()/busyRef |
| settings/secretary | save (PUT secretary) | ➕ busyRef |
| settings/knowledge | confirm/delete memory+lesson | ➕ busyRef |
| settings/log | undo | ➕ undoRef |
| settings/customers | after-hours save | ➕ saveRef · routing/notify/shift = ✅ guard() busyRef |
| settings/rules | put (สวิตช์/วงเงิน · optimistic PUT ค่าเดียวกัน) | state — ไม่แก้: PUT idempotent ต่อคีย์ ค่าสุดท้ายชนะ |
| customers/[id] | send/sendText/resend (run) · claim · attach | ✅ busyRef (run) · ➕ claimRef · attach = state `uploading` (เลือกไฟล์ 1 ครั้ง) |
| customers/[id]/info | assign/handoff/helpers/status/link/task/ask | ✅ busyRef (act/createTask/askShark) · ➕ cmidRef + retryPending |
| settings/access · quota · index · secretary/index · customers/index | ไม่มีปุ่มส่ง (นำทางอย่างเดียว) | — |

## 4. ผลข้อสอบ (ทรีหลัง merge `session/secretary` f0593441 ด้วย SHA ตรง · A.11)
- `bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s3a1-a.mts` #1: `JSON_SUMMARY {"total":9,"passed":9,"failed":[],"skipped":[],"findings":[]}` · #2: เหมือนกัน (ก่อนแก้ 5/9)
- spec (QC_FORCE=1 QC_SKIP_TSC=1): s2.21 11/12 (M-1 ข้าม) · s2.4 6/7 · s2.17 11/12 · failed [] ทั้งสาม
- `qc-sec-s2.14` forced: `{"total":10,"passed":10,"failed":[]}` (S-1 ทุก spec 9 ตัว · s2.1 · s2.12 · B-1 ทะเบียน↔คลิก · M-1 · D-1/D-2 fitness)
- typecheck mobile 0 · fitness ผ่าน (oracle D-1/D-2 ×2 รอบ + pre-commit)
- click-sec รอบเต็ม (`--registry` ใหม่ 443 testID แล้วรันเต็ม · WORKERS=4): `clicks-sec.json: 443 testID · ok 443 · แดง 0 · 2546 การกด · 4157 วิ` · meta `{resumed:false, registryHash:30ad5edc…, distHash:3729ca93…, generatedAt:2026-11-06T01:37:52Z}`
  - ขั้นใหม่: `acct-delete-confirm` → POST auth/sms/request + ui +sent/code/resend · `acct-delete-code` input · `acct-delete-resend` → POST auth/sms/request (s2.21-mgr · resendAfterSec 0) · `acct-delete-final` → POST account/delete + logout + /login · `acct-delete-sent` เห็นจริง
  - dist ของรอบคลิก = ก่อนงาน §Z.4 (client.ts SSE · chat/[id] · ป้าย kind) — งานนั้นไม่เพิ่ม/เปลี่ยน testID และไม่อยู่ในจอที่ทะเบียนสแกน (chat 1.0 ไม่อยู่ในชุด S2)
- `qc-mobile-app` (1.0 static): 37/38 — APP-4.1 แดงเดิม (app.json `userInterfaceStyle:"automatic"` ตั้งแต่ R-S2.13i · ใบนี้ไม่แตะ app.json) · APP-3.4 จอแชทยังใช้ sendChat ✅

## 5. ภาพ
- ภาพคู่ (ถ่ายใหม่ · dist ของใบนี้): `apps/mobile/qc/shots-sec/secretary-settings-account-g4-pair.png` · `…-dark-g4-pair.png` (+ G1–G3 ถ่ายซ้ำเพราะ fixture s2.21 เปลี่ยน) · ภาพเดี่ยว 8 ภาพ summary ok/overflow false/unmocked [] · mgr 8 ภาพ ok · แบบ G4 ไม่มีชีตลบบัญชี ⇒ ขั้นใหม่เป็นภาพเดี่ยว
- ขั้นใหม่ `apps/mobile/qc/shots-sec/s3a1-a-interaction/` (สคริปต์ `README-click.mjs.txt` · ผลดิบ `result.json` · ไม่มี _ERROR):
  `z29-1-word.png` / `-dark` (ขั้น 1 + บรรทัดช่องทาง) · `z29-2-code.png` / `-dark` (ขั้น 2 นับถอยหลัง 59 วิ) · `z29-3-code-filled.png` · `z29-4-email-word.png` · `z29-5-email-code.png` (บัญชีอีเมล) · `z29-6-wrong-code.png` (401 ⇒ ล้างช่อง + ข้อความ)
- ผลกดจริง (result.json): sms/request body `{"phone":"+66800000101"}` ไม่มี tenant/Bearer · ลบ: กดสองครั้งติด ⇒ POST 1 ครั้ง body `{"confirm":"ลบบัญชี","code":"123456"}` ไม่มี x-tenant-id → logout → /login · ใส่ "12a345" ⇒ ช่อง "12345" ปุ่มปิด · อีเมล: POST auth/otp `{"email":"suk@qc.invalid"}` (sms 0) · 401 ⇒ "รหัสไม่ถูกต้องหรือหมดอายุแล้ว…" ช่องว่าง token ยังอยู่ · code_required ⇒ คงขั้น 2 + ข้อความ · 503 ⇒ ข้อความ smsDown อยู่ขั้น 1 · 429 ⇒ "ขอรหัสถี่เกินไป…"
  - new.tsx: 409×2 แล้ว 200 ⇒ POST 3 ครั้ง cmid เดียว ห่าง ~1.5 วิ ไม่มี sec-new-error ระหว่างรอ → /secretary/room/r1 · 409 ตลอด ⇒ 4 คำขอแล้ว "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง" · กดซ้ำคำสั่งเดิม = cmid เดิม · แก้คำสั่ง = cmid ใหม่ · คลิก 3 ครั้งติด ⇒ POST 1
  - room/[id] send: 409 แล้ว 200 ⇒ 2 POST cmid เดียว ไม่มีข้อความ error ร่างถูกล้าง
  - customers info "สั่ง Shark": 500 → กดใหม่ → 409 → 200 ⇒ 3 POST cmid เดียว context `{chatConversationId:"x1", contactId:"ct1"}` → /secretary/room/r7

## 6. ต่างจากใบ / ข้อสังเกต
- "ลองใหม่สูงสุด 3 ครั้ง" = 3 ครั้งหลังคำขอแรก (รวม 4) · ยัง pending ⇒ ข้อความล้มปกติของจอ (cmid ยังเก็บไว้ กดใหม่ = รหัสเดิม)
- ทางอีเมลของลบบัญชีถึงได้เฉพาะเมื่อ /me ไม่ส่งฟิลด์ phone (ยาม R8 พา phone:null ไป /phone) — ทำตามสัญญาไว้
- 401 ของ account/delete แยกจากเซสชันหมดด้วย `error !== "unauthorized"` (สัญญาเลน c: รหัสผิด ⇒ 401) — ถ้าเลน c ใช้ error อื่นสำหรับเซสชันหมด ต้องแก้คู่กัน
- R-Z30 นอกเหนือใบ: login sendSms/sendOtp/social · scheduled · settings/* · customers claim (รายการ §3) · rules.tsx คงเดิม (PUT idempotent)
- ไม่แตะ docs/api (เลน c)

## 7. รอบตอบคำถาม (ผู้คุม · สัญญาเลน c: 400 code_required/confirm_required · 401 invalid_code · 401 locked · 401 unauthorized = เซสชัน)
- 401 `locked` = ข้อความของตัวเอง `acct.delete.locked` ("ใส่รหัสผิดหลายครั้งเกินไป รหัสนี้ใช้ไม่ได้แล้ว — กดส่งรหัสอีกครั้งเพื่อรับรหัสใหม่" / en) · ล้างช่อง + ช่องรหัส `editable=false` (จาง) + ปุ่มลบปิด จนกว่าขอรหัสใหม่สำเร็จ (requestCode ⇒ เปิดคืน) · 401 `invalid_code` (และ 401 อื่นที่ไม่ใช่ `unauthorized`) = "รหัสไม่ถูกต้องหรือหมดอายุ" ตามเดิม
- fixture ใหม่ `qc/fixtures/secretary/s2.21-delete-locked.json` (account/delete ⇒ 401 locked · sms/request resendAfterSec 0) · `s2.21-delete.json` เปลี่ยน error เป็น `invalid_code` ตามสัญญา
- ภาพ `apps/mobile/qc/shots-sec/s3a1-a-interaction/z29-7-locked.png` · result.json `locked`: ข้อความ locked · ช่องว่าง+readOnly · ปุ่มลบปิด · พิมพ์ไม่เข้า · กดส่งรหัสอีกครั้ง ⇒ POST sms/request + ช่องเปิดคืน + ปุ่มลบเปิดเมื่อครบ 6 หลัก
- ไม่มี testID ใหม่ (`--registry` ได้ไฟล์เดิมทุกไบต์ ⇒ registryHash เดิม · ไม่รันคลิกซ้ำ) · ถ่าย s2.21 + ภาพคู่ G4 ใหม่ (dist ใหม่)
- `qc-sec-s3a1-a` 9/9 · spec s2.21 11/12 (M-1 ข้าม · failed []) · `session/secretary` ยังเป็น f0593441 (merge แล้ว · เลน b+c ยังไม่เข้า)
- คำถาม 2 (ยาม R8) ไม่ต้องปรับ · 3 docs เลน c แก้แล้ว
