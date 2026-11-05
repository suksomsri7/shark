# WO S2.15 (ชุด S2-15) — H1 ช่วยเหลือ · H2 ห้องแจ้งปัญหา

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-c` branch `wip/sec-s2.15` (ฐาน = ทิปผู้คุม f643eb17 · merge `session/secretary` b307fe98 และ ee435ba7 ตาม COMMON A.11) · 2026-11-05/06 UTC · builder: ตัวแทน
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.15.md` (+ COMMON + RESOLUTIONS §F · R-K12 · §T R-S1.14c · §Q · `sec-brief-S1.17.md`) · ภาพ H1 = `sec-h.jpg` หน้า 1 · H2 = หน้า 2 (+ `sec-dark-h.jpg` หน้าเดียวกัน)
> ข้อสอบ: `SPEC=scripts/qc-sec-specs/s2.15.json scripts/qc-sec-screen.mts` (**ไม่แก้ spec/oracle**) · สัญญาเซิร์ฟเวอร์ = route จริง `src/app/api/mobile/secretary/support/**` + `docs/api/SECRETARY-API.md` แถว 74–79 (อ่านอย่างเดียว)

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ดูภาพคู่ + ผู้ตรวจ) — ไม่ push

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `apps/mobile/app/(app)/secretary/help/index.tsx` | เขียนใหม่ (แทน SecSkeleton) | H1 (§2) |
| `apps/mobile/app/(app)/secretary/help/[caseId].tsx` | เขียนใหม่ | H2 (§3) |
| `apps/mobile/src/components/secretary/CaseRow.tsx` | ใหม่ | แถวเรื่อง: จุด 3 สี (`help-dot-run/wait/done`) · หัวเรื่อง · เวลา (roomTime) · บรรทัดสถานะ · ตัวนับยังไม่อ่าน · ป้าย SHARK-xxxxx · `caseStatusLine` ใช้ร่วม H2 |
| `apps/mobile/src/components/secretary/CaseBubble.tsx` | ใหม่ | ฟอง: ของเรา (ทึบขวา) · คนในร้านคนอื่น (กระจกขวา + "คนในร้าน" — เจ้าของเปิดดูเรื่องของพนักงาน) · ทีม SHARK (อวตาร SH ซ้าย) · ชิปไฟล์แนบ · ปุ่มลิงก์หน้าในแอป |
| `apps/mobile/src/components/secretary/HelpAttach.tsx` | ใหม่ | `useHelpAttach(upload)` (expo-image-picker มีในแอปแล้ว · ภาพเท่านั้น · quality 0.6 · ตรวจชนิด+ขนาด ≤ 4 MB ก่อนส่ง · ≤ 5 รูป) + `AttachedRow` |
| `apps/mobile/src/components/secretary/SecTopBar.tsx` | แก้ (เพิ่ม prop) | `helpOn` = ปุ่ม ? ทึบ ไม่มีปุ่มโซนทึบ (แบบ H1) · ไม่ใส่ = เหมือนเดิม |
| `apps/mobile/src/api/secretary.ts` | แก้ (ต่อท้าย + ตาราง PATH) | `secretary/support/cases` · `…/upload` · `…/cases/[id]` · `/reply` · `/resolve` · type `HelpCaseRow/HelpCase/HelpMsg/HelpAttachment/HelpOpenBody` · `normalizeHelpCases/Detail` · `caseNoText` · `helpDot` · `helpSubjectBody` · `helpRouteOf`/`splitHelpLinks` · `secUpload` (multipart — `api()` ส่ง JSON เท่านั้น) |
| `apps/mobile/src/i18n/{th,en}.ts` | แก้ | +63 คีย์ `help.*` (union กับ session · en ไม่มีอักษรไทย รวมคอมเมนต์) |
| `apps/mobile/qc/fixtures/secretary/s2.15.json` | ใหม่ | 3 เรื่อง 3 สถานะ · ห้อง c1 5 ข้อความ (รูปแนบ · ลิงก์ `[..](sharkai://…)` · path ภายใน) + ห้องงานแนบ r1 + PENDING · mock POST cases/reply/resolve/upload |
| `apps/mobile/qc/fixtures/secretary/s2.1.json` | แก้ | expect `/secretary/help*` = testID จริง + mock `support/cases` + `support/cases/c1` (ถ่ายชุด S2.1 ซ้ำได้ unmocked 0) |
| `scripts/sec-ui-inventory.json` | แก้ | +18 แถว S2.15 |

## 2. H1 `/secretary/help`
- `GET secretary/support/cases` (x-tenant-id · OWNER เห็นทุกเรื่องของร้าน — หัวรองเปลี่ยนเป็น "เจ้าของร้านเห็นทุกเรื่องของร้าน") · โหลดใหม่ทุกครั้งที่ focus + ดึงลง
- ชิป 5 (`help-chip` ×5 ตามลำดับแบบ): ใช้งานไม่ได้=`bug` · เลขาทำผิด=`secretary_wrong` · ข้อมูลไม่ตรง=`question` · บัญชี/การเงิน=`billing` · ข้อเสนอแนะ=`feature` · แตะซ้ำ = ยกเลิก · ไม่เลือก = ไม่ส่ง category (เซิร์ฟเวอร์ตั้ง `other`)
- จุด: `helpDot` — RESOLVED เทา · PENDING หรือ unreadCount>0 เขียว · อื่น ๆ ส้ม
- `?roomId=` (เมนู ⋯ ห้องงาน S2.4) ตรวจรูป `[A-Za-z0-9_-]{1,80}` · การ์ด "แนบห้องงาน: <ชื่อ>" (`GET secretary/rooms/[id]` · โหลดไม่ได้ = ไม่มีชื่อ) ถอดได้ (`help-room-detach`) · เลือกชิป "เลขาทำผิด" ไว้ก่อน (เปลี่ยนได้)
- ส่ง = `POST secretary/support/cases {subject = บรรทัดแรก ≤120, body ≤4000, category?, roomId?, attachments?}` → `router.push /secretary/help/<id>` · 429 = "ส่งถี่เกินไป…" (ข้อความคงอยู่) · อื่น ๆ = ข้อความเซิร์ฟเวอร์/ไทยกลาง · ปุ่ม + = แนบรูป (`help-home-attach`)

## 3. H2 `/secretary/help/[caseId]`
- `GET secretary/support/cases/[id]` · 404 ⇒ `help-gone` (ไม่มีช่องพิมพ์) · poll 15 วิ (focus + AppState active)
- หัว: ย้อน (`help-back`) · หัวเรื่อง · `SHARK-00042 · ● สถานะ` (`help-room-dot-<run|wait|done>`) · ⋯ (`help-menu` → ห้องงานที่แนบ / ปิดเรื่องนี้ / ไปที่เรื่องที่แจ้งไว้)
- ใต้ข้อความแรก: บรรทัดระบบ "เปิดเรื่อง … · แนบห้องงาน "<ชื่อ>" ให้ทีมดูอัตโนมัติ · HH:MM" = `help-room-card` แตะ → `/secretary/room/<roomId>` (ไม่มีห้อง = `help-opened` แสดงอย่างเดียว)
- ลิงก์จากทีม (`splitHelpLinks`): `[ชื่อ](sharkai://…)` · `sharkai://…` · path `/secretary|customers|business/…` (จอ native) · `/app/…` (หน้าเว็บร้านใน WebView หน้าแรก 1.0 `?open=` แบบ entityRoute) ⇒ ปุ่ม `help-link` → `router.push` · อย่างอื่น (`https://…` ภายนอก · `javascript:` · `sharkai://../..`) = ข้อความธรรมดา
- การ์ด "ปัญหาแก้แล้วหรือยัง" (`help-resolved-card`) เมื่อ PENDING: แก้แล้ว (`help-resolve-yes`) = `POST …/resolve {}` · ยังไม่แก้ (`help-resolve-no`) = `POST …/reply {body:"ยังไม่หาย ปัญหายังอยู่"}` + เปิดช่องพิมพ์ · RESOLVED = บรรทัด "ปิดแล้ว · พิมพ์ต่อเพื่อเปิดอีกครั้ง" (ช่องพิมพ์ยังใช้ได้ — reply เปิดใหม่ตามเซิร์ฟเวอร์)
- ตอบ = `POST …/reply {body, attachments?}` · มีแต่รูป ⇒ body "ส่งรูปให้ทีมดู" (body ต้อง ≥1 ตัว) · แนบ (`help-attach`) → `POST secretary/support/upload` multipart `file`
- push "ทีมงานตอบกลับแล้ว" (S1.23 `data.link=/help/<id>`) → `src/lib/push-register.ts` แปลงเป็น `/secretary/help/<id>` อยู่แล้ว (S2.6) — ไม่แตะ

## 4. รูปแนบ (R-S1.14c)
- picker `mediaTypes:["images"]` · `quality 0.6` (iOS/Android เข้ารหัส JPEG ใหม่ · HEIC → JPEG) · ชนิดต้องอยู่ใน jpeg/png/webp/heic/heif/gif (ไม่งั้นไม่ส่ง + ข้อความ) · > 4 MB หลังบีบอัด ⇒ ไม่ส่ง + "รูปใหญ่เกิน 4 MB…" · เซิร์ฟเวอร์ 413/415 ⇒ ข้อความเซิร์ฟเวอร์
- Content-Length: body = FormData ขนาดรู้ล่วงหน้า ⇒ fetch ใส่เอง (เว็บพิสูจน์ที่ระดับสาย: `content-length 352 = 352 ไบต์` · ไม่ใช่ chunked) · บน Android (OkHttp) ไฟล์ `file://` จาก picker ให้ความยาวได้ — **ต้องดูบนเครื่องจริงที่ CP2** (หนี้ §7)

## 5. ผลข้อสอบ (หลัง merge ทิป ee435ba7)
- spec s2.15 forced #1: `JSON_SUMMARY {"total":8,"passed":8,"failed":[],"skipped":[],"findings":[]}` exit 0
- spec s2.15 forced #2: `JSON_SUMMARY {"total":8,"passed":8,"failed":[],"skipped":[],"findings":[]}` exit 0 (R ×2 · X-1 · X-2 · U-1 ภาพคู่ H1/H2 สว่าง+มืด · M-1 typecheck mobile 0 · D-1/D-2 fitness มี env / ไม่มี env)
- spec forced ใบก่อน: s2.2 11/11 · s2.4 7/7 · s2.17 12/12 — exit 0 · `qc-sec-s2.1` forced 14/14 (รอบแรก I-1 แดงเพราะคอมเมนต์ไทยใน en.ts → แก้แล้ว) · `qc-sec-s2.12` forced 13/13
- regression unforced (`qc-sec.sh` + gate lock · SHARK_AI_MOCK=1) เทียบ `ledger/qc-baseline/sec-baseline-bfad2f15.txt`: qc-mobile-app 38/38 · qc-mobile-auth 31/31 · qc-mobile-chat 29/29 · qc-mobile-authz-hotfix `{"total":12,"passed":12,"findings":[]}` — exit 0 ทั้งหมด (= baseline)
- mobile typecheck 0 (แยก + M-1) · pre-commit fitness ผ่านทุก commit

## 6. ภาพ
คำสั่ง:
```
bash scripts/iso.sh env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-c QC_PORT=4725 ROUTES=/secretary/help,/secretary/help/c1 FIXTURE=apps/mobile/qc/fixtures/secretary/s2.15.json node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/parity-sec.sh h 1|2 apps/mobile/qc/shots-sec/<route>[-dark].png apps/mobile/qc/shots-sec/<route>[-dark]-h<n>-pair.png [--dark]
# กดจริง (รูปทดสอบต้องอยู่ใต้ /root · วางหลัง export เพราะ rsync --delete): qc-photo-s215.png 8×8 · qc-big-s215.png 1500² noise (6.7 MB) · qc-vec-s215.svg
cp apps/mobile/qc/shots-sec/s2.15-interaction/README-click.mjs.txt <scratch>/s215-click.mjs && bash scripts/iso.sh node <scratch>/s215-click.mjs $PWD/apps/mobile/qc/fixtures/secretary/s2.15.json /root/qc-shark-mobile-sec-c/qc-photo-s215.png /root/qc-shark-mobile-sec-c/qc-big-s215.png /root/qc-shark-mobile-sec-c/qc-vec-s215.svg $PWD/apps/mobile/qc/shots-sec/s2.15-interaction
```
- ภาพคู่:
  - H1 ↔ `sec-h.jpg` หน้า 1: `apps/mobile/qc/shots-sec/secretary-help-h1-pair.png` · มืด ↔ `sec-dark-h.jpg` หน้า 1: `apps/mobile/qc/shots-sec/secretary-help-dark-h1-pair.png`
  - H2 ↔ `sec-h.jpg` หน้า 2: `apps/mobile/qc/shots-sec/secretary-help-c1-h2-pair.png` · มืด: `apps/mobile/qc/shots-sec/secretary-help-c1-dark-h2-pair.png`
- ภาพเดี่ยว: `apps/mobile/qc/shots-sec/secretary-help.png` · `secretary-help-dark.png` · `secretary-help-c1.png` · `secretary-help-c1-dark.png` — summary ok · overflow false · errors [] · unmocked [] · missing [] ทั้ง 4
- กดจริง `apps/mobile/qc/shots-sec/s2.15-interaction/` (ผลดิบ `result.json` · สคริปต์ `README-click.mjs.txt`): `h1-from-room.png` · `h2-attached.png` · `h2-too-big.png` · `h2-resolved.png` · `h2-not-fixed.png` · `h2-menu.png` · `h2-not-found.png`

### ผลกดจริง (result.json)
- H1: แถว 3 · จุด run 1 (rgb 60,196,127) · wait 1 (rgb 255,176,32) · done 1 (rgb 197,200,212) · ตัวนับ 1 · ชิป 5 ตามลำดับแบบ · GET ส่ง x-tenant-id t1 · แตะแถว → `/secretary/help/c1`
- จากห้องงาน `?roomId=r1`: การ์ด "แนบห้องงาน: ใบเสนอราคา ร้านดอยช้าง" · POST `{"subject":"เลขาส่งใบเสนอราคาให้ลูกค้าผิดคน","body":…,"category":"secretary_wrong","roomId":"r1"}` → `/secretary/help/c9`
- เลือกชิป "ใช้งานไม่ได้" + ถอดห้อง: การ์ดหาย · POST `{"subject":"ปุ่มพิมพ์ใบเสร็จกดไม่ได้","body":…,"category":"bug"}` (ไม่มี roomId) · `?roomId=../x` = ไม่แนบ
- แนบจาก H1: upload multipart 1 ครั้ง → POST cases `attachments:[{name,url,kind:"image"}]` · 429 ⇒ "ส่งถี่เกินไป รอสักครู่แล้วลองใหม่" อยู่จอเดิม ข้อความคงอยู่ · ไม่มีเรื่อง ⇒ `help-empty`
- H2: ฟอง 5 · ชิปรูปแนบ "รูปแนบ 1 รูป" · ลิงก์ 2 ("เชื่อม LINE Official" · "เปิดหน้านี้ในแอป") · หัว `help-room-dot-run` "ทีม SHARK ตอบแล้ว" · การ์ดห้อง "เปิดเรื่อง SHARK-00042 · แนบห้องงาน "ใบเสนอราคา ร้านดอยช้าง" ให้ทีมดูอัตโนมัติ · 09:58"
- ตอบ: `POST c1/reply {"body":"ลองเชื่อมแล้วครับ"}` · ช่องพิมพ์ว่าง · โหลดใหม่ 1 ครั้ง
- ลิงก์: `sharkai://secretary/settings/customers` → `/secretary/settings/customers` · `/secretary/room/r1` → `/secretary/room/r1` · การ์ดห้อง → `/secretary/room/r1` · `/app/settings/chat` → `/?open=%2Fapp%2Fsettings%2Fchat&t=…` · `https://evil.example/x` · `[กด](javascript:…)` · `sharkai://../../etc` = ไม่เป็นปุ่ม
- แก้แล้ว: `POST c1/resolve {}` · "ปิดเรื่องแล้ว ขอบคุณที่แจ้งเข้ามา" · การ์ดหาย · จุด → done · บรรทัดปิดแล้ว
- ยังไม่แก้: `POST c1/reply {"body":"ยังไม่หาย ปัญหายังอยู่"}` · resolve 0 · "แจ้งทีมแล้ว พิมพ์รายละเอียดเพิ่มได้เลย" · จุด → wait · focus ช่องพิมพ์
- แนบใน H2: upload 1 ครั้ง (multipart · x-tenant-id t1) → reply `{"body":"ส่งรูปให้ทีมดู","attachments":[{"name":"qc-photo.png","url":"https://cdn.qc.invalid/help/upload-1.png","kind":"image"}]}` · ชิปหายหลังส่ง
- ระดับสาย (ส่งต่อไปเซิร์ฟเวอร์ในเครื่อง): `content-length: 352` = 352 ไบต์ · ไม่มี transfer-encoding · `name="file"; filename=…` · part `image/png` · มี Bearer
- รูป 6.7 MB ⇒ upload 0 + "รูปใหญ่เกิน 4 MB…" · svg ⇒ upload 0 + "แนบได้เฉพาะรูป JPG · PNG · WEBP · HEIC · GIF" · เซิร์ฟเวอร์ 415 ⇒ ข้อความเซิร์ฟเวอร์ · ไม่มีชิป
- เมนู ⋯: ห้องงาน 1 · ปิดเรื่อง 1 · รายการ 1 · `zz` 404 ⇒ `help-gone` · ไม่มีช่องพิมพ์

### จุดต่างจากแบบ (ภาพคู่)
| จอ | ต่าง | เหตุ |
|---|---|---|
| H1 | หัวรองยาว 2 บรรทัด (เจ้าของร้าน) | fixture = OWNER ⇒ "เจ้าของร้านเห็นทุกเรื่องของร้าน" (สิทธิ์จริงของ listCasesForUser) · บทบาทอื่น = ข้อความแบบเดิม |
| H1 | ข้อความ SLA ท้ายรายการเลื่อนลงใต้ช่องพิมพ์ | ตัวอักษร/การ์ดใหญ่กว่าแบบตาม R-UI1 · เลื่อนเห็น |
| H1 | เวลาแถวแรก "ตอนนี้"/"HH:MM" ตามเวลาที่ถ่าย | roomTime เดิมของแอป |
| H2 | ภาพเลื่อนไปท้ายเรื่อง (5 ข้อความตามใบ) · ข้อความแรก+บรรทัดเปิดเรื่องอยู่เหนือจอ | ห้อง c1 มี 5 ข้อความตามใบ |
| H2 | ชื่อผู้ตอบ = "ทีม SHARK · HH:MM" (แบบ "นัท · ทีม SHARK") | route ตัดชื่อ/รหัสทีมงานออก (DTO-REQ §7) |
| H2 | การ์ดลิงก์ = ไอคอนลิงก์สีเขียว + ชื่อ + path (แบบ = ไอคอน "แชท") | ลิงก์ไปได้หลายหน้า · ชื่อจาก `[ชื่อ](…)` ของทีม |
| ทุกจอ | ตัวอักษร/ปุ่มใหญ่กว่าแบบตามสัดส่วน | R-UI1 |

## 7. หนี้ / คำขอ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| **DTO-REQ** ชื่อผู้ตอบฝั่งทีม (ชื่อเล่น/ชื่อแสดง ไม่ใช่ id) ใน `GET support/cases/[id]` messages | ใบสั่ง "ชื่อคนตอบจริงจาก DTO" แต่ route ตั้งใจตัดออก ⇒ แอปแสดง "ทีม SHARK" | S1.14/S2.16 fix-forward (ผู้คุมตัดสิน) |
| ย่อขนาดภาพก่อนส่ง | ไม่มี `expo-image-manipulator` (ห้ามติดตั้ง) ⇒ บีบอัดด้วย quality 0.6 เท่านั้น · ภาพใหญ่มาก (เช่น 48 MP HEIC) อาจยังเกิน 4 MB ⇒ แจ้งให้เลือกรูปเล็กลง | S3 (เพิ่มแพ็กเกจเมื่อเจ้าของอนุญาต) |
| Content-Length บน Android/iOS จริง | เว็บพิสูจน์แล้ว (352 = 352) · RN แปลง FormData เอง — Android ไฟล์ `content://` อาจไม่รู้ความยาว (picker คืน `file://` ใน cache ปกติ) | CP2 เจ้าของลองบนเครื่อง |
| ไฟล์แนบในฟองเป็นชิปนับจำนวน (ไม่มีภาพย่อ/เปิดดู) | แบบ = ชิป "ภาพหน้าจอ 1 รูป" · ไม่มีตัวดูรูปในโซนเลขา | ภายหลังถ้าต้องการ |
| `aria-selected` ของชิป/ปุ่ม ? ไม่ออกบนเว็บ QC | RN-web ไม่แมป `accessibilityState.selected` ของ role button · ตรวจด้วย body ของ POST แทน (category ตามชิป) | — |

## 8. SPEC-EDIT / ORACLE-EDIT
- ไม่มี
