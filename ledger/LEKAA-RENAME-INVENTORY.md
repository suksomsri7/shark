# LEKAA RENAME — inventory "Shark" → เลขา / Lekaa (17 พ.ย. 2569)

เจ้าของสั่ง: ผู้ช่วย AI / แอปที่ผู้ใช้หรือลูกค้าของร้านเห็นว่า "Shark" → ข้อความไทย **เลขา** · อังกฤษ **Lekaa** ·
"Lekaa" ในประโยคไทยก็เปลี่ยนเป็น เลขา ·
**ขยายขอบเขต (เจ้าของ 17 พ.ย. รอบ 2):** แบรนด์แพลตฟอร์ม "SHARK" ในข้อความที่ผู้ใช้เห็นก็เปลี่ยนด้วย (ไทย เลขา · อังกฤษ Lekaa) —
คงไว้เฉพาะ โดเมน/URL/อีเมล · ของเชิงเทคนิค · ข้อความตัวตนทางกฎหมาย/ภาษี (terms/privacy/ชื่อผู้ออกเอกสาร) · metadata สโตร์ ·
การย้ายโดเมน shark.in.th → lekaa.ai เป็นงานแยกในอนาคต (ดูหัวข้อท้ายไฟล์ — สำรวจอย่างเดียว ไม่แก้)

วิธีนับ: `grep -rIn -E 'Shark|Lekaa'` (ตรงตัวพิมพ์) ใน `src/ apps/mobile/ prisma/ docs/ scripts/` (ไม่รวม node_modules) ·
แยกบรรทัดในคอมเมนต์ออก · ตัดตัวระบุเชิงเทคนิค (`X-Shark-*`, `SharkApp`, `SharkTopBar`, `SharkCustomer`, `SharkSettings`,
`SharkSection`, `verifySharkSignature`, `outsideShark`, `Lekaa*`/`useLekaa*`/`LEKAA_*`, `not_lekaa`) ·
+ ตรวจ `SHARK` ตัวใหญ่ที่อยู่ใกล้คำ AI/ผู้ช่วย/แอป เพิ่ม · ไม่มีคำทับศัพท์ ชาร์ค/ชาร์ก ในโค้ด

## ก่อนแก้ (b0bb477fb)

| พื้นที่ | บรรทัดที่มี Shark | บรรทัดที่มี Lekaa | บรรทัดโค้ด (ไม่ใช่คอมเมนต์ · ไม่ใช่ตัวระบุ) |
|---|---|---|---|
| `src/` (เว็บ + เซิร์ฟเวอร์) | 139 | ~60 | 15 |
| `apps/mobile/` (แอป + qc) | 303 | ~190 | 330 (ส่วนใหญ่ fixture/ผลรอบเก่าใน qc/) |
| `prisma/` | 5 | 0 | 2 (`@default("Shark")` + migration) |
| `docs/` | 94 | 0 | 33 |
| `scripts/` (QC) | 144 | ~5 | 42 |

## เปลี่ยนแล้ว (นับเป็นสตริง)

| พื้นที่ | คอมมิต | ไฟล์ · จำนวน |
|---|---|---|
| แอป i18n | c5ba2ab0e + 3d7d3541d | `src/i18n/th.ts` 22 · `en.ts` 9 · `cal-th.ts` 2 · `locales/th.json` 7 (InfoPlist ไทย) · ชื่อเลขาปริยาย `DEFAULT_SECRETARY_NAME` "Shark"→"เลขา" + `secretaryNameOf` (อ่านชื่อปริยายเดิมเป็นชื่อใหม่) ใน `src/api/secretary.ts` · `onboarding/name.tsx` · `settings/secretary.tsx` · `i18n/index.ts` (ยุบ "เลขา เลขา" · อังกฤษชื่อปริยายแสดง "Lekaa") |
| เว็บ | 57e2cecfa | `src/app/use-app/page.tsx` 2 (ไทย "แอปเลขา" · อังกฤษคง Lekaa) |
| เซิร์ฟเวอร์ + prompt | 3b0d235b6 | `ai/secretary/chat-send.ts` 2 (ชื่อผู้ส่ง "เลขา (ผู้ช่วย AI)" · บรรทัดลงท้าย) · `chat/after-hours.ts` 5 (disclosure ปริยาย · ตัวอย่างใน error · เหตุ unknown · push ส่งต่อคน · note การใช้เครดิต) + อ่านทน disclosure ปริยายเดิม · `ai/secretary/identity.ts` ชื่อปริยาย + อ่านทนชื่อ "Shark" · `secretary.ts` ใส่ชื่อปริยายเองตอนสร้างแถว · `ai/persona.ts` 1 · `ai/tools.ts` 2 · `ai/proposals.ts` 1 · `team-chat/notify.ts` 1 · `team-chat/service.ts` 1 · สคริปต์ `scripts/lekaa-rename-db.mts` |
| แบรนด์ SHARK — แอป | 6b35729e8 | `th.ts`/`en.ts` ~36 คีย์ (ทีมเลขา/Lekaa team · สมัครใช้ · ในระบบ · SMS เชิญ "เลขา: …") · `cal-th/en` 4 · fixture s2.4-support 2 |
| แบรนด์ SHARK — เว็บ | 257f97cc3 | ~95 บรรทัดใน src/app, src/components, src/messages (ชื่อหน้า · manifest · โลโก้ตัวอักษร Lekaa · หน้าช่วยเหลือ/ลบบัญชี · คู่มือนักพัฒนา "Lekaa X API" · POS/CRM/บอร์ดงาน/บัญชี/ตั้งค่า · Topbar "เลขา AI") |
| แบรนด์ SHARK — เซิร์ฟเวอร์ | d8f160904 | ~45 บรรทัดใน src/lib (SMS OTP "รหัสเข้าใช้เลขา" · SMS เชิญ · error "ติดต่อทีมงานเลขา" · persona "บนแพลตฟอร์มเลขา (shark.in.th)" · ผู้ส่งอีเมลปริยาย `Lekaa <noreply@shark.in.th>` · openapi) + gen-*-api-docs 7 + docs/api/*.md สร้างใหม่ 6 ไฟล์ + skills/shark-pos-api endpoints |
| QC / fixture / เอกสาร | 07a3deed5 | ข้อสอบ 7 ไฟล์ (s1.12 s1.22 s1.2 s3a.1 s1.6 sec-real b27-chat-ai) · fixture แอป 33 ไฟล์ (131 จุด: ชื่อเลขา · disclosure · ลงชื่อ · พรีวิว) · สเปก qc-sec-specs 3 · `sec-ui-inventory.json` 3 · `docs/legal/secretary-ai-disclosure.md` 11 · `docs/modules/31-secretary.md` ~25 |

## คงไว้ (keep)

**เชิงเทคนิค** (ไม่แตะ): ส่วนหัว `X-Shark-System/Event/Event-Id/Signature/Signature-V2/Timestamp/Widget/Guest` (~60 จุดใน src/lib/modules/*/api, webhooks, developers pages, openapi) ·
UA `SharkApp` `SharkTopBar` `SharkCustomer` (`src/proxy.ts:33`, `src/lib/ui/use-in-app.ts`, `IssueReportSheet.tsx:47`, `issue-actions.ts:21`, `sys/[id]/page.tsx:67`, `apps/mobile/app/(app)/index.tsx:188`) ·
ตัวระบุ `SharkSettings` `SharkSection` `verifySharkSignature` `outsideShark` `askShark` (`customers/[id]/info.tsx:200`, `qc/buttons-sec.json:5079`) คีย์ i18n `cust.info.askShark`/`inShark` ·
`LekaaFab*` `LekaaLoader` `LekaaLogo` `useLekaa*` `LEKAA_*` `not_lekaa` · `handleSharkWebhook` ในตัวอย่างโค้ด docs/api + gen-*-api-docs ·
`prisma/schema/secretary.prisma:227 @default("Shark")` + `migrations/20261227000000_secretary_a/migration.sql:227` (ห้าม migration — โค้ดใส่ชื่อเองแล้ว) · `scripts/qc-sec-s1.1.mts:82` (ตรวจสคีมาคอลัมน์ ซึ่งไม่เปลี่ยน) ·
`scripts/pending/**` (โดเมน shark.in.th) · ค่าคงที่ `LEGACY_*` / สคริปต์ย้ายค่า (ต้องอ้างคำเดิม) · คอมเมนต์ประวัติในโค้ด (~160 บรรทัด)

**แบรนด์แพลตฟอร์ม** — ~~คงไว้~~ **เปลี่ยนแล้วรอบ 2** ยกเว้น:
- กฎหมาย/ตัวตนคู่สัญญา (รอเจ้าของ): `src/app/(marketing)/terms/page.tsx:2,8,13` · `src/app/(marketing)/privacy/page.tsx:3,9,14,48,49` · `docs/legal/secretary-ai-disclosure.md` ("แอป SHARK HUB" · ร่างนโยบาย) ·
  ไม่พบชื่อนิติบุคคล/ผู้ออกใบกำกับภาษีที่เป็น "SHARK" ในโค้ด (ชื่อผู้ออกเอกสารบัญชีมาจากข้อมูลกิจการของร้าน)
- metadata สโตร์: `scripts/asc-listing.py` · `apps/mobile/RELEASE-NOTES-2.0.md`
- ชื่อที่เก็บในฐาน: `src/lib/modules/pos/channel-shared.ts:28` + `src/messages/{th,en}/pos.json:3089,3486` "เว็บร้าน SHARK Shop"/"SHARK Shop website" (ช่องทาง BUILTIN ถูกสร้างเป็นแถว SalesChannel ด้วยชื่อนี้ · qc-pos-p2.1 ตรวจ) — ถ้าจะเปลี่ยนต้องย้ายข้อมูลด้วย
- รหัส/รูปแบบข้อมูล: `SHARK-MC:` (QR บัตรสมาชิก · `pos/register-member*.ts`, `member/me.ts:45`, แอป `member/index.tsx:47,190,195`) · เลขเคส `SHARK-000123` (`support/stage.ts:58`, `backoffice/cases/labels.ts:41`, แอป `api/secretary.ts:1316`) · `X-SHARK-Loop` · enum `"SHARK"` ของโหมดอีเมล CRM (`crm/emails.ts:562,566,680`, `crm/api/ops/emails.ts:288`)
- ภายใน: `[SHARK ops]` หัวอีเมลแจ้งทีม (`core/ops.ts:106`) · คอมเมนต์ JS `shark.js — SHARK CRM web tracking` (`crm/tracking.ts:1860`) · `globals.css:29` คอมเมนต์
- ส่งบุคคลที่สาม (รอเจ้าของ): `pos/payment-intent.ts:117` คำอธิบาย charge Beam ``SHARK POS ${ref}`` (อาจโผล่ในใบเสร็จ/สเตทเมนต์ลูกค้า — อาจมีการจับคู่ยอดด้วยข้อความนี้)
- `.env.example:14` EMAIL_FROM ตัวอย่าง (prod ใช้ค่าใน env จริง — **ค่า env บน Vercel ต้องเปลี่ยนชื่อผู้ส่งเอง** ถ้าตั้งไว้)

**ผลรอบเก่า**: `apps/mobile/qc/shots-sec/**` (104 บรรทัด — summary/result ของรอบตรวจที่ผ่านมา ไม่ใช่ข้อสอบ)

**Lekaa ที่ถูกแล้ว** (อังกฤษ): `apps/mobile/locales/en.json` · `en.ts` · `cal-en.ts` · `use-app` บรรทัดอังกฤษ · `app.json:3` ชื่อแอป

## กำกวม — รอเจ้าของตัดสิน (ไม่ได้แก้)

| ไฟล์:บรรทัด | สตริง | เหตุ |
|---|---|---|
| (รอบ 2 แก้แล้ว) Topbar "SHARK AI" → "เลขา AI" · "แอป SHARK"/"SHARK HUB" → "แอปเลขา"/"แอปมือถือเลขา" · pos.json "SHARK approvals page" → Lekaa · account-deletion | — | ตัดสินตามขอบเขตใหม่ |
| `src/app/(marketing)/privacy/page.tsx:48` | "เพื่อปรับปรุงคุณภาพของเลขา SHARK …" | หน้า privacy = ข้อความกฎหมาย คงไว้ทั้งหน้า |
| `apps/mobile/app.json:61,62,75` | "Lekaa ใช้ปฏิทิน…" / "Lekaa ไม่ได้ใช้…" / "Lekaa ใช้รายชื่อ…" | ข้อความขอสิทธิ์ภาษาไทยใน app.json (สั่งห้ามแตะ app.json) — เครื่องภาษาไทยใช้ `locales/th.json` ที่แก้แล้ว |
| `apps/mobile/src/i18n/cal-th.ts:160` | "เปิดได้ที่ การตั้งค่า › Lekaa › ปฏิทิน" | เส้นทางในแอปตั้งค่า iOS แสดงชื่อแอปจริง "Lekaa" — ถ้าเปลี่ยนจะหาไม่เจอ |
| `apps/mobile/app/login.tsx:273` | ตัวอักษร "Lekaa" ใต้โลโก้หน้าเข้าสู่ระบบ | เวิร์ดมาร์ก/โลโก้ (ทุกภาษา) |
| `apps/mobile/RELEASE-NOTES-2.0.md:10,15,29,30,40,48,49` | "เลขา AI \"Shark\"…" / "Shark drafts replies…" | บันทึกรุ่น 2.0 สำหรับสโตร์ (metadata · ส่งไปแล้ว) |

**แก้แล้วแต่ขอให้ดู**: ข้อความชวนดาวน์โหลดตอนนี้เขียน "แอปเลขา" (ชื่อบน App Store คือ "Lekaa"): `th.ts` team.add.shareMsg / team.menu.addSub / team.add.notFound ·
`src/app/use-app/page.tsx` · push `team-chat/notify.ts` "เพิ่มคุณเข้าทีมในแอปเลขา" · ชื่อเลขาปริยายที่เก็บในฐาน = "เลขา" (คำไทย) — จอภาษาอังกฤษแสดง "Lekaa" เฉพาะผ่านแม่แบบ `{name}`; ช่องแก้ชื่อในตั้งค่าแสดง "เลขา"

## ข้อมูลในฐาน

คอลัมน์ที่อาจเก็บคำเดิม: `AiSecretary.name` ("Shark" จากค่าปริยาย/หน้าตั้งชื่อครั้งแรก) · `AiSettings.aiDisclosure` (ข้อความปริยายเดิม) — ย้ายด้วย `scripts/lekaa-rename-db.mts` (dry-run ปริยาย · `--apply` เขียน) ·
ประวัติที่ไม่แตะ: `ChatMessage.senderName`/`body` (ข้อความที่ส่งถึงลูกค้าแล้ว) · `ChatConversation.lastMessagePreview` · `AiCreditTxn.note`
โค้ดอ่านทนแล้ว: `identityOf` (ชื่อ "Shark" = ปริยายใหม่) · `afterHoursSettings.cleanDisclosure` (disclosure ปริยายเดิม = ปริยายใหม่) · แอป `secretaryNameOf`

## ตรวจซ้ำหลังแก้

`grep` บรรทัดโค้ด (ไม่ใช่คอมเมนต์ · ไม่ใช่ตัวระบุ) ที่ยังมี `Shark`/`SHARK` ใน src/ + แอป เหลือ 38 บรรทัด = รายการ "คงไว้" ข้างบนทั้งหมด
(ค่าคงที่ LEGACY_* · @default · ตัวระบุ/รหัส · terms/privacy · SHARK Shop · enum · ops · Beam)

## Domain migration shark.in.th → lekaa.ai (สำรวจอย่างเดียว — ไม่ได้แก้)

นับ `shark.in.th` (ไม่สนตัวพิมพ์) ใน src/ apps/mobile/ prisma/ scripts/ (ไม่รวม pending/ และผลถ่ายจอ): ~300 บรรทัด — ในโค้ดแอป/เว็บ ~85 · ที่เหลือเป็นข้อสอบ QC/สคริปต์
ป้าย: **config** = อ่านจาก env/คำขอ สลับได้ง่าย · **hardcoded** = ต้องแก้โค้ด

| กลุ่ม | ที่อยู่ (file:line) | สลับอย่างไร |
|---|---|---|
| แอปมือถือ — API base URL | `apps/mobile/src/api/client.ts:7` `BASE_URL = "https://shark.in.th"` | **hardcoded** (ต้องออกรุ่นแอปใหม่ · รุ่นเก่ายังยิงโดเมนเดิม ⇒ โดเมนเดิมต้องเปิดต่อ/redirect) |
| แอปมือถือ — OAuth / deep link | `apps/mobile/app/login.tsx:235` `https://shark.in.th/api/auth/${provider}/start?mobile=1` + scheme `sharkai://auth` · `app.json:109` scheme `sharkai` · bundle/package `th.in.shark.ai` (`app.json:12,27`) | **hardcoded** · scheme/bundle id ไม่เกี่ยวโดเมน (ห้ามเปลี่ยน bundle id) |
| แอปมือถือ — universal links / associated domains | ไม่มี (`app.json` ไม่มี associatedDomains/intentFilters) · `eas.json` ไม่มี URL | — |
| แอปมือถือ — ข้อความ | `src/i18n/th.ts:987,1149` `en.ts:985,1147` ("เว็บ shark.in.th", SMS เชิญ `shark.in.th/i/…`) · `settings/account.tsx:51` คอมเมนต์ | **hardcoded** |
| เซิร์ฟเวอร์ — base URL | `env.APP_URL` (`src/lib/env.ts:7` ปริยาย localhost) ใช้ใน payment-request, credit-actions, notify-customer, dorm, booking-notify/waitlist, campaigns, crm portal/emails, auth ฯลฯ · `src/lib/core/origin.ts` `publicOrigin()` = โดเมนจากคำขอ (fallback APP_URL) | **config** — แต่มี fallback ฝัง `"https://shark.in.th"`: `ai/proposals.ts:1676,1678` · `pos/integration-creds.ts:90` · `pos-board-bridges.ts:78` · `account/api/ops/documents-write.ts:302,304` · `platform/hotel-mail.ts:44` (**hardcoded fallback**) |
| เซิร์ฟเวอร์ — ค่าคงที่โดเมน | `crm/tracking-shared.ts:39,41` `LINK_FALLBACK_URL`/`APP_PUBLIC_ORIGIN` · `staff/invite.ts:32` `INVITE_LINK_BASE` · `src/proxy.ts:23,47,54` ROOT_HOSTS + `backoffice.shark.in.th` · `domain/service.ts:42` (กันโดเมนตัวเองเป็นโดเมนร้าน) | **hardcoded** |
| Auth / OAuth / cookie | redirect_uri ฝังใน `src/app/api/auth/{line,google,facebook}/{start,callback}/route.ts` (6 ไฟล์) ⇒ ต้องเพิ่ม URI ใหม่ในคอนโซล LINE/Google/Facebook ด้วย · cookie ไม่ได้ตั้ง `domain` (host-only) ⇒ ผู้ใช้ต้องเข้าสู่ระบบใหม่บนโดเมนใหม่ · `core/phone-auth.ts:34` `PHONE_PLACEHOLDER_DOMAIN = "phone.shark.in.th"` (อีเมลแทนของผู้ใช้เบอร์โทร **เก็บในฐาน** — เปลี่ยนต้องย้ายข้อมูลหรือคงไว้) · Apple Sign-in (ตั้งในคอนโซล Apple) | **hardcoded** + คอนโซลภายนอก |
| Webhook / callback ที่ลงทะเบียนกับบุคคลที่สาม | แชท LINE/FB/IG: `/api/chat/webhook/[connectionId]` (แสดง `{origin}/api/chat/webhook/{id}` ใน `chat/ui.tsx:269` — ร้านไปตั้งในคอนโซลเอง) · Beam `/api/payment/beam/webhook` + returnUrl จาก APP_URL · Resend `/api/email/resend/webhook` + `/api/email/inbound` · แพลตฟอร์มเดลิเวอรี POS `platformWebhookUrl()` (`pos/integration-creds.ts:94` ใช้ APP_URL/fallback) · OAuth ด้านบน · push = Expo (ไม่ผูกโดเมน) · e-Tax ไม่มี callback ขาเข้า | URL สร้างจาก **config/คำขอ** แต่ **ทุกร้าน/ทุกคอนโซลต้องลงทะเบียนใหม่** (LINE OA ของแต่ละร้าน!) ⇒ โดเมนเดิมต้องรับต่อระยะยาว |
| อีเมลผู้ส่ง / ที่อยู่ขาเข้า | `env.ts:11` `EMAIL_FROM` ปริยาย `noreply@shark.in.th` (config) · `.env.example:12,14` · CRM ขาเข้า `crm+<key>@shark.in.th` (`core/inbound-address.ts:14` `CRM_EMAIL_SHARK_DOMAIN`) · บอร์ดงาน `งาน+…@` (`kanban/boards-email.ts:23`) · กล่องเอกสารบัญชี `inbox-<slug>@shark.in.th` (`account/inbox.ts:363`) · ที่อยู่ support@ / noreply@ / admin@ ในหน้า (`public-chrome.tsx:10`, `use-app`, `suspended`, `terms:52`, `privacy:81`, `support:28`, `backoffice/login:39`) · iCal UID `@shark.in.th` (`booking/online.ts:781`, `hotel-mail.ts:138`) | ผู้ส่ง **config** · ขาเข้า **hardcoded** + MX/Resend ของโดเมนใหม่ · ที่อยู่ที่ลูกค้าบันทึกไว้แล้ว (crm+…) ต้องรับต่อ |
| CSP / CORS / allowed origins | ไม่มี CSP ใน `next.config.ts` · CORS ของ tracking (`src/app/t/*`) และ widget แชท = จากโดเมนที่ร้านบันทึก (ฐาน) · `domain/service.ts:42` | **config/ฐาน** (ไม่มีรายการโดเมนเราฝัง ยกเว้น proxy ROOT_HOSTS) |
| ลิงก์ในเอกสาร/ข้อความถึงลูกค้า | ลิงก์ใบเสนอราคา `/doc/…` (documents-write · proposals fallback) · ลิงก์ชำระเงิน payment-request · ลิงก์นัด/บัตรคิว (`booking/settings-model.ts:138,141` ตัวอย่าง) · ลิงก์เชิญ SMS · ลิงก์ติดตาม CRM `/t/c/…` · หน้า `/s/{slug}` (`prisma/schema/core.prisma:42` คอมเมนต์) · `pos.json:1852` "เปิด shark.in.th/pos" | ส่วนใหญ่ **config** (APP_URL/คำขอ) · ข้อความ i18n **hardcoded** · ลิงก์ที่ส่งไปแล้วชี้โดเมนเดิมตลอด ⇒ ต้อง redirect |
| เอกสารสาธารณะ / API docs | `SERVER_URL`/`BASE_URL` ใน openapi 5 โมดูล (`pos/api/openapi.ts:13`, `crm/api/openapi.ts:20`, `crm/api/manifest.ts:27`, `kanban/api/openapi.ts:12`, `member/api/openapi.ts:15`, `account/api/openapi.ts:25`) · หน้า `/developers/*` (`BASE_URL` 5 ไฟล์) · ตัวอย่าง curl (`CrmApiSettings.tsx:44-53`, `MemberApiSettings.tsx:99-109`) · `gen-*-api-docs.mts` + `docs/api/*.md` · `skills/shark-pos-api/SKILL.md` (+ .claude/skills ของ crm/member/kanban/account) | **hardcoded** (แก้ค่าคงที่ แล้วรัน gen ใหม่ · fitness F13 ตรวจ) |
| SEO / sitemap / robots | ไม่มี `robots.ts`/`sitemap.ts`/`metadataBase` · `manifest.ts` ไม่มีโดเมน · หน้า marketing แสดงข้อความโดเมน (`terms:8,14`, `privacy:9`, `account-deletion:23,48,71`, `support:153,157`, `public-chrome.tsx:57`) | ข้อความ **hardcoded** |
| สโตร์ / metadata | `scripts/asc-listing.py:61-63,91-92` (support/privacy/account-deletion URL ในหน้าแอปบน App Store) · `qc-appstore-ready.mts` | **hardcoded** + ต้องแก้ใน App Store Connect / Play Console |
| ข้อสอบ QC / สคริปต์ | ~210 บรรทัดใน scripts/ (qc-crm-c2.5 24 · qc-crm-c2.6-web 14 · qc-crm-c5.3 13 · …) | hardcoded — ปรับตามค่าคงที่ตอนย้าย |
