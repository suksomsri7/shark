# WO S2.21 + S2.22 (ชุด S2-21) — G1 สร้างกิจการ · G2 เชิญพนักงาน · G3 สิทธิ์ต่อคน · G4 บัญชีของฉัน

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-d` branch `wip/sec-s2.21` (ฐาน = ทิปผู้คุม 51504cb0 + merge `session/secretary` 040ed86e ตาม COMMON A.11) · 2026-11-04/05 UTC · builder: ตัวแทนเลน d
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.21.md` (+ COMMON + RESOLUTIONS §F §H §P/§P.2 §Q §R §T) · ภาพ G1 = `sec-g.jpg` หน้า 1 · G2 = หน้า 2 · G3 = หน้า 3 · G4 = หน้า 4 (+ `sec-dark-g.jpg` หน้าเดียวกัน)
> ข้อสอบ: `SPEC=scripts/qc-sec-specs/s2.21.json scripts/qc-sec-screen.mts` (**ไม่แก้ spec/oracle**) · สัญญา S1.14 อ่านจาก `wip/sec-s1.14` (อ่านอย่างเดียว · fc28eb97: route `secretary/{tenants/create, staff, staff/invite, staff/invites, staff/invites/[id](/resend), staff/[membershipId](/suspend|/remove), invites/accept, invites/[code], notify, account/delete(/preview)}` + `inbox/shift` · `src/lib/staff/levels.ts`)

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ดูภาพคู่ + ผู้ตรวจ 1 คน (สิทธิ์ UI)) — ไม่ push

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `apps/mobile/app/(app)/business/new.tsx` | เขียนใหม่ (แทน SecSkeleton) | G1: ชื่อ (2–60) · ประเภท 7 ชิป (TENANT_TYPES ของ server) · ระบบ 8 ตัวเลือก ติ๊กได้ ≤ 6 (ติ๊กล่วงหน้าตามประเภท) · `POST secretary/tenants/create {name,type,systems}` (ไม่ส่ง x-tenant-id) → `refreshMe` → `switchTenant(tenant.id)` → `resetSecretaryMe` → กิจการแรกของบัญชี ⇒ `/secretary/onboarding/name` (+ ล้างธงหลังสมัคร) · กิจการที่ 2–3 ⇒ `/secretary/room/<room.roomId>` (ไม่มีห้อง ⇒ `/secretary`) · 400 = ข้อความไทยของ server (เพดาน 3 ร้าน) · 429 = ข้อความจอ · ไม่มีปุ่ม X เมื่อยังไม่มีกิจการ · การ์ดรับคำเชิญด้านบน |
| `apps/mobile/app/(app)/secretary/staff/invite.tsx` | เขียนใหม่ | G2: ชื่อ · เบอร์ (`formatThaiMobileInput` → `normalizeThaiMobile` ก่อนส่ง) · บทบาท Segment (OWNER: พนักงาน/ผู้จัดการ · MANAGER: พนักงานอย่างเดียว) · สาขา (ชิป "ทุกสาขา" = `["*"]` ปริยาย · ติ๊กสาขา = รายการชัดเจน · ว่าง ⇒ กลับเป็น `["*"]` ไม่ส่งรายการว่าง) · ChatLevelPicker + LevelGrid (ปิดทุกระบบปริยาย) · การ์ดตัวอย่าง SMS (แม่แบบเดียวกับ server) · `POST secretary/staff/invite {name, phone, role, unitIds, permissions}` (permissions = `permissionsFromLevels` · ผู้จัดการ = `{}`) · การ์ดผล (SMS ส่งแล้ว / ลิงก์ให้ส่งเอง + หมดอายุ) · เหตุผลไทยต่อ reason (ตาราง REASON) · คำเชิญค้าง `GET staff/invites` + ส่งอีกครั้ง / ยกเลิก (ชีตยืนยัน) |
| `apps/mobile/app/(app)/secretary/staff/[membershipId].tsx` | เขียนใหม่ | G3: แถวของคนนี้จาก `GET secretary/staff` · บทบาท · สาขา · แชท 3 ระดับ · LevelGrid (ระบบของร้านจาก `GET secretary/access` ∪ โมดูลที่คนนี้มีระดับอยู่) · `PUT secretary/staff/[membershipId] {role, unitIds, levels(เฉพาะที่แก้ + มีจริง), chat(เมื่อแก้), extraPermissions:{}}` · ระงับ/เอาออก = ชีตยืนยัน → `POST …/suspend|remove {}` → `router.dismissTo("/secretary/staff")` · อ่านอย่างเดียว: ตัวเอง / เจ้าของ / MANAGER ดูคนที่ไม่ใช่พนักงาน · บทบาทผู้จัดการในฟอร์ม ⇒ กริดปิด + ข้อความ "ผู้จัดการใช้ได้ทุกระบบ" |
| `apps/mobile/app/(app)/secretary/settings/account.tsx` | เขียนใหม่ | G4: อวตาร + ชื่อ + "เจ้าของ N · พนักงาน M กิจการ" · การ์ดรับคำเชิญ · เบอร์ (ไม่มี ⇒ `/phone` · มีแล้ว ⇒ "เปลี่ยนเบอร์ต้องติดต่อทีมงาน" R-S1.19e) · อีเมล (email ∨ pendingEmail + "ยังไม่ยืนยัน") · Apple (`user.appleLinked` ไม่มี ⇒ "–") · ธีม Segment = `theme-store` `setThemeMode` · แจ้งเตือน (ชีต 4 ชนิด × ALL/ASSIGNED/OFF → `PUT secretary/notify {kind, mode}` · ล้มคืนค่าเดิม) · ภาษา → B2 · เข้าเวร (สถานะจาก `GET inbox/staff` · ไม่อยู่ในรายชื่อ = ตอบลูกค้าไม่ได้ ⇒ ปิด · `POST inbox/shift {onDuty}`) · ออกจากระบบ 2 แตะ · ลบบัญชี: ชีต → `GET account/delete/preview` → พิมพ์คำยืนยัน → `POST account/delete {confirm}` → `signOut` |
| `apps/mobile/src/components/secretary/LevelGrid.tsx` | ใหม่ | **ที่เดียวของแอปที่แปลงระดับ → คีย์** (ผู้ตรวจดูไฟล์นี้ไฟล์เดียว): ตาราง `LEVEL_KEYS` 40 โมดูล (สร้างจาก `PERMISSION_MODULES` + `isSensitiveKey` + `levelsAvailableFor` ของ server · คีย์อ่อนไหว/คีย์ลิมิตตัดออก) · `CHAT_KEYS` = CHAT_LEVELS ของ server · `levelsAvailable` · `offOnly` · `keysForLevel` · `permissionsFromLevels` · `levelOf` · `gridModules` · UI `LevelGrid` / `LevelButtons` / `SysHead` |
| `apps/mobile/src/components/secretary/ChatLevelPicker.tsx` | ใหม่ | การ์ดแชทลูกค้า NONE/VIEW/REPLY (UI อย่างเดียว · คีย์อยู่ LevelGrid) |
| `apps/mobile/src/components/secretary/InviteRow.tsx` | ใหม่ | `InviteRow` (ห่อ `PendingRow` ของ D1 ด้วย testID ของ G2) · `ReceivedInvites` การ์ด "คุณได้รับคำเชิญจาก <ร้าน>" (`GET secretary/invites/pending` → `POST secretary/invites/accept {inviteId}` → refreshMe → switchTenant → `/secretary`) |
| `apps/mobile/src/api/secretary.ts` | ขยาย | PATH: tenants/create · staff/invite · staff/invites · invites/accept · invites/pending · notify · account/delete(/preview) · inbox/shift · PATH_ID: staff/[id] (+suspend/remove) · `USER_LEVEL` +5 เส้นระดับผู้ใช้ · **`secPost` ส่ง `tenant: !USER_LEVEL.has(path)`** (เดิมส่ง x-tenant-id เสมอ — rooms/scheduled ยังส่งเหมือนเดิม) · `putStaff` · types/normalizers: TENANT_TYPES/SYSTEMS · InviteBody/Res · INVITE_REASONS/`inviteReasonOf` · `normalizeInvites` · `normalizeUnits`/`unitIdsOf` · ReceivedInvite · NOTIFY_KINDS/MODES/`normalizeNotify` · DeletePreview · StaffPerson + `joinedAt` |
| `apps/mobile/app/_layout.tsx` | แก้ 1 hunk | **สลับธง R-S2.12a**: ไม่มีกิจการ + `isFreshSignup(user.id)` ⇒ `/business/new` (เดิม /dna) · บัญชีเดิมไม่มีกิจการ ⇒ /dna ตามเดิม (/business/new เปิดได้) |
| `apps/mobile/src/lib/post-signup.ts` | แก้คอมเมนต์ | บอกว่าสลับแล้ว |
| `apps/mobile/src/lib/auth-context.tsx` | แก้ type 1 บรรทัด | `Me.user.appleLinked?: boolean \| null` (optional · ไม่เปลี่ยนพฤติกรรม) |
| `apps/mobile/src/i18n/{th,en}.ts` | แก้ | +140 คีย์ `biz.*` `inv.*` `perm.*` `acct.*` · th/en 796 คีย์เท่ากัน · en ไม่มีอักษรไทย (คำยืนยันลบบัญชีอ่านจาก `th["acct.delete.word"]` เสมอ เพราะ server เทียบคำไทยตรงตัว) |
| `apps/mobile/qc/fixtures/secretary/s2.21.json` | ใหม่ | OWNER: me (เจ้าของ 2 · พนักงาน 1 · เบอร์ · appleLinked) · staff 3 คน + คำเชิญค้าง 1 + `units` บนสุด 2 สาขา · access dorm/booking/account/pos/ai · notify · preview ลบ · ทุก POST/PUT/DELETE ของใบ |
| `apps/mobile/qc/fixtures/secretary/s2.21-mgr.json` | ใหม่ | MANAGER (ภาพเดี่ยว): ผู้จัดการ ฝน · pendingEmail · ไม่มี appleLinked |
| `apps/mobile/qc/fixtures/secretary/s2.1.json` | แก้ | expect ของ 4 route = testID ของจอจริง + mock staff/invites · invites/pending · notify (ถ่ายชุด S2.1 ซ้ำได้สะอาด) |
| `scripts/sec-ui-inventory.json` | แก้ | +46 แถว S2.21/S2.22 |

## 2. ระดับ → คีย์ (ให้ผู้ตรวจสิทธิ์)
- G3 ส่ง `levels` ให้ server แปลงเอง (`setStaffLevels`) — ตารางในแอปใช้แค่ "แสดงเฉพาะระดับที่มี" + ล็อกโมดูล OFF-only · ส่งเฉพาะโมดูลที่ผู้ใช้กดเปลี่ยน (ส่งระดับเดิมซ้ำ = `permissionsForLevel` จัดคีย์ทั้งโมดูลใหม่ → คีย์รายตัวที่เคยให้ไว้เปลี่ยนเงียบ ๆ) · `chat` ส่งเฉพาะเมื่อเปลี่ยน (VIEW/NONE ถอนคีย์แชทรายตัว) · `extraPermissions: {}` (ไม่มีช่องรายคีย์ — server ไม่บอกคีย์ที่ให้ได้)
- G2 route `staff/invite` รับแค่ `permissions` (คีย์) ⇒ แอปแปลงด้วย `permissionsFromLevels` (VIEW = คีย์อ่าน r · USE = r + w · แชท = CHAT_KEYS) · ไม่มีคีย์อ่อนไหว/คีย์ลิมิตในตาราง · server ตรวจซ้ำ (`validatePermissionInput` + `checkNoEscalation` ⇒ 400 bad_permissions → ข้อความจอ) · บทบาทผู้จัดการ ⇒ `{}`
- ตารางสร้างจากทะเบียนจริง: สคริปต์ใน §8 (import `PERMISSION_MODULES` + `isSensitiveKey` + `levelsAvailableFor` จาก tree นี้ · คีย์ action ลงท้าย .read/.view/.list = r) — ทะเบียนเปลี่ยน ⇒ รันใหม่แล้วแทนตาราง (หนี้ §7: DTO-REQ ให้ server รับ levels ในคำเชิญแทน)
- ผลกดจริง (§5): คำเชิญ หอพัก USE + จองคิว VIEW + แชท VIEW ⇒ 12 คีย์ · ไม่มีคีย์ delete/refund/void/import/export/settings/payment/deposit/slip

## 3. ผลข้อสอบ (หลัง merge session/secretary 040ed86e · dist ของทิปนี้)
- spec s2.21 forced #1: `JSON_SUMMARY {"total":12,"passed":12,"failed":[],"skipped":[],"findings":[]}` exit 0
- spec s2.21 forced #2: `JSON_SUMMARY {"total":12,"passed":12,"failed":[],"skipped":[],"findings":[]}` exit 0 (M-1 typecheck mobile 0 · D-1/D-2 fitness มี env / ไม่มี env ผ่าน ทั้งสองรอบ)
- spec forced: s2.2 11/11 · s2.4 7/7 · s2.5 9/9 · s2.7 16/16 · s2.10 10/10 (exit 0 ทั้งหมด) · `qc-sec-s2.1` forced 14/14 · `qc-sec-s2.12` forced 13/13
- regression unforced (`qc-sec.sh` + gate lock · SHARK_AI_MOCK=1) เทียบ `ledger/qc-baseline/sec-baseline-bfad2f15.txt`: qc-mobile-app 38/38 exit 0 · qc-mobile-auth 31/31 exit 0 · qc-mobile-chat 29/29 exit 0 · qc-mobile-authz-hotfix 12/12 exit 0 (= baseline: exit 0 ทั้ง 4 · authz 12/12)
- หลัง merge ทิปล่าสุด 77732dc2 (ledger ล้วน · RESOLUTIONS §U ไม่เกี่ยวใบนี้) → spec s2.21 forced อีกรอบ: `{"total":12,"passed":12,"failed":[]}` exit 0
- รอบแรก forced แดง 1 ข้อ (R-/secretary/staff/invite: testID แถวคำเชิญอยู่ในคอมโพเนนต์) → ย้าย testID มาไว้ในไฟล์จอ (ส่งผ่าน prop) → เขียว · ไม่แก้ spec

## 4. ภาพ
คำสั่ง (สำเนา/พอร์ตของเลนนี้):
```
bash scripts/iso.sh env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4724 ROUTES=/business/new,/secretary/staff/invite,/secretary/staff/m1,/secretary/settings/account FIXTURE=apps/mobile/qc/fixtures/secretary/s2.21.json node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/iso.sh env QC_PREPARE=1 QC_SKIP_EXPORT=1 QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4724 QC_OUT=apps/mobile/qc/shots-sec/s2.21-mgr ROUTES=/secretary/staff/invite,/secretary/staff/m1,/secretary/staff/m2,/secretary/settings/account FIXTURE=apps/mobile/qc/fixtures/secretary/s2.21-mgr.json node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/parity-sec.sh g 1 apps/mobile/qc/shots-sec/business-new.png apps/mobile/qc/shots-sec/business-new-g1-pair.png   (g 2 invite · g 3 m1 · g 4 account · + --dark)
cp apps/mobile/qc/shots-sec/s2.21-interaction/README-click.mjs.txt <scratch>/s221-click.mjs && bash scripts/iso.sh node <scratch>/s221-click.mjs $PWD/apps/mobile/qc/fixtures/secretary/{s2.21,s2.21-mgr}.json $PWD/apps/mobile/qc/shots-sec/s2.21-interaction
```
- ภาพคู่ (ผู้คุมดู):
  - G1 ↔ `sec-g.jpg` หน้า 1: `apps/mobile/qc/shots-sec/business-new-g1-pair.png` · มืด `apps/mobile/qc/shots-sec/business-new-dark-g1-pair.png` (`sec-dark-g.jpg` หน้า 1)
  - G2 ↔ `sec-g.jpg` หน้า 2: `apps/mobile/qc/shots-sec/secretary-staff-invite-g2-pair.png` · มืด `apps/mobile/qc/shots-sec/secretary-staff-invite-dark-g2-pair.png`
  - G3 ↔ `sec-g.jpg` หน้า 3: `apps/mobile/qc/shots-sec/secretary-staff-m1-g3-pair.png` · มืด `apps/mobile/qc/shots-sec/secretary-staff-m1-dark-g3-pair.png`
  - G4 ↔ `sec-g.jpg` หน้า 4: `apps/mobile/qc/shots-sec/secretary-settings-account-g4-pair.png` · มืด `apps/mobile/qc/shots-sec/secretary-settings-account-dark-g4-pair.png`
- ภาพเดี่ยว: `apps/mobile/qc/shots-sec/{business-new,secretary-staff-invite,secretary-staff-m1,secretary-settings-account}{,-dark}.png` (summary ok · overflow false · unmocked [] · missing [] ทั้ง 8)
- MANAGER (ภาพเดี่ยว · `s2.21-mgr.json`): `apps/mobile/qc/shots-sec/s2.21-mgr/{secretary-staff-invite,secretary-staff-m1,secretary-staff-m2,secretary-settings-account}{,-dark}.png` + `apps/mobile/qc/shots-sec/s2.21-mgr/summary.json` (8 ok)
- กดจริง `apps/mobile/qc/shots-sec/s2.21-interaction/` (สคริปต์ `README-click.mjs.txt` · ผลดิบ `result.json`): `g1-filled.png` · `g1-cap.png` · `post-signup-business-new.png` · `g2-sent.png` · `g2-levels.png` · `g2-reason-pending-cap.png` · `g2-cancel-confirm.png` · `g3-edited.png` · `g3-suspend-confirm.png` · `g3-manager-on-manager.png` · `received-invite-card.png` · `g4-theme-dark.png` · `g4-notify-sheet.png` · `g4-delete-typed.png`

### จุดต่างจากแบบ (ภาพคู่)
| จอ | ต่าง | เหตุ |
|---|---|---|
| G1 | ประเภท 7 ชิป (มี "โรงเรียน/คอร์ส") · ระบบ 8 ตัว (ไม่มี "หอพัก" · มี "สต็อก") + บรรทัด "เลือกได้สูงสุด 6" · ช่องชื่อว่าง (แบบพิมพ์ไว้แล้ว) | TENANT_TYPES/SystemType ของ server (ไม่มี DORM ใน SystemType) · TENANT_SYSTEMS_MAX 6 |
| G1 | ไม่มีปุ่ม X ตอนยังไม่มีกิจการ | หลังสมัครใหม่ไม่มีที่ให้ย้อน |
| G2 | มีชิป "ทุกสาขา" + ระบบครบตามร้าน (5 แถว + ผู้ช่วย AI) · ใต้การ์ด SMS มีรายการคำเชิญค้าง/การ์ดผล · ปุ่มล่างจางเมื่อยังกรอกไม่ครบ | ใบสั่ง (unitIds ["*"] ปริยาย · คำเชิญค้าง · ส่งผล) · `GET access` คืนทุกระบบที่ร้านเปิด |
| G2 | ข้อความ SMS = แม่แบบของ server ("SHARK: <ร้าน> เชิญคุณ <ชื่อ> เข้าใช้ SHARK · เปิดลิงก์ … (หมดอายุ 7 วัน)") ไม่ใช่ถ้อยคำในแบบ | R-S1.25j |
| G3 | ไม่มีปุ่ม ⋯ · มีปุ่ม "บันทึก" ก่อนปุ่มระงับ/เอาออก · คำอธิบายขวาของแถวระบบ (ผู้เช่า·ห้อง·บิล) ไม่มี | ระงับ/เอาออกอยู่ล่างจออยู่แล้ว · PUT ต้องมีจุดยืนยัน · ไม่มีข้อมูลคำอธิบายโมดูล |
| G3 | หัวจอ "หอพัก · พนักงาน · เข้าเวรอยู่ · เข้าร่วม 12 ต.ค." ตรงแบบเมื่อ server ส่งชื่อสาขา (DTO-REQ) · ไม่มีชื่อ = "สาขา" | staff row มีแค่ unitId |
| G4 | แถวใช้ SettingRow ของ S2.7 (ตัวหนา) · ธีมในภาพถ่าย = "สว่าง"/"มืด" (shoot ตั้ง theme-store) · เข้าเวรเป็นสวิตช์ (แบบ = แถวมีลูกศร) · Apple "–" เมื่อ /me ไม่ส่ง | ชิ้นส่วนร่วม · เวลาเข้าเวรรู้เฉพาะหลังกด (DTO-REQ) |
| ทุกจอ | ตัวอักษร/ปุ่มใหญ่กว่าแบบตามสัดส่วน | R-UI1 |

## 5. ผลกดจริง (dist ของทิปนี้ · `apps/mobile/qc/shots-sec/s2.21-interaction/result.json` · ไม่มี _ERROR)
- G1 กิจการที่ 2: POST `["{\"name\":\"QC ใหม่\",\"type\":\"service\",\"systems\":[\"BOOKING\",\"CRM\",\"MEMBER\",\"ACCOUNT\",\"CHAT\",\"INVENTORY\"]}"]` (ไม่มี x-tenant-id: null) → shark_tenant = "t4" → "/secretary/room/r9"
- G1 กิจการแรก (ไม่มีร้าน · ไม่มีปุ่ม X = true): POST `["{\"name\":\"QC แรก\",\"type\":\"restaurant\",\"systems\":[\"POS\",\"CRM\",\"MEMBER\",\"ACCOUNT\",\"KANBAN\",\"CHAT\"]}"]` → shark_tenant = "t4" → "/secretary/onboarding/name" · เพดาน 3 ร้าน (400) ⇒ "สร้างกิจการได้สูงสุด 3 ร้านต่อบัญชี — ถ้าต้องการเพิ่ม ติดต่อทีมงาน" · อยู่หน้าเดิม
- หลังสมัคร (OTP signup isNew=true · ไม่มีร้าน) ⇒ "/business/new" · บัญชีเดิมไม่มีร้าน ⇒ "/dna" (ลำดับเดิม)
- G2 ค่าเริ่มต้น: `["{\"name\":\"ก้อง\",\"phone\":\"+66898765432\",\"role\":\"STAFF\",\"unitIds\":[\"*\"],\"permissions\":{}}"]` · ผล: "สร้างคำเชิญของ 089-•••-5432 แล้ว — ยังไม่ได้ส่ง SMS ส่งลิงก์นี้ให้เองได้\nhttps://shark.in.th/i/QCQCQCQC\nใช้ได้ถึง 11/11" · SMS preview: "\nSMS ที่น้องจะได้รับ\nSHARK: The Bean Café เชิญคุณ ก้อง เข้าใช้ SHARK · เปิดลิงก์ shark.in.th/i/•••• (หมดอายุ 7 วัน)"
- G2 สาขา+ระดับ: {"name": "ก้อง", "phone": "+66898765432", "role": "STAFF", "unitIds": ["u-dorm"], "permKeys": 12, "permSample": ["booking.report.view", "chat.conversation.read", "chat.conversation.markRead"], "anySensitive": []} · ปุ่มระดับ (ai ไม่มี VIEW): ["inv-level-dorm-OFF", "inv-level-dorm-VIEW", "inv-level-dorm-USE", "inv-level-booking-OFF", "inv-level-booking-VIEW", "inv-level-booking-USE", "inv-level-account-OFF", "inv-level-account-VIEW", "inv-level-account-USE", "inv-level-pos-OFF", "inv-level-pos-VIEW", "inv-level-pos-USE", "inv-level-ai-OFF", "inv-level-ai-USE"]
- G2 เหตุผล: {"rate_limited": "วันนี้ส่งคำเชิญครบจำนวนแล้ว ลองใหม่พรุ่งนี้", "already_member": "เบอร์นี้อยู่ในกิจการแล้ว", "already_invited": "เบอร์นี้มีคำเชิญที่ยังไม่รับอยู่แล้ว — กดส่งอีกครั้งในรายการด้านล่าง", "pending_cap": "คำเชิญค้างครบ 20 ใบแล้ว ยกเลิกใบที่ไม่ใช้ก่อน", "bad_permissions": "สิทธิ์ที่เลือกให้ไม่ได้ (เกินสิทธิ์ของคุณหรือระบบไม่รองรับ) — ปรับระดับแล้วลองใหม่", "sms_unavailable": "ระบบส่ง SMS ยังไม่พร้อม ลองใหม่ภายหลัง"}
- G2 ส่งอีกครั้ง ["{}"] → "ส่งคำเชิญอีกครั้งแล้ว" · ยกเลิก DELETE ก่อนยืนยัน 0 → หลังยืนยัน 1 · MANAGER บทบาท = ["inv-role-STAFF"]
- G3: ปุ่มระดับ ["perm-level-dorm-OFF", "perm-level-dorm-VIEW", "perm-level-dorm-USE", "perm-level-booking-OFF", "perm-level-booking-VIEW", "perm-level-booking-USE", "perm-level-account-OFF", "perm-level-account-VIEW", "perm-level-account-USE", "perm-level-pos-OFF", "perm-level-pos-VIEW", "perm-level-pos-USE", "perm-level-ai-OFF", "perm-level-ai-USE"] · point (OFF-only) ล็อก = 1 · แชท ["perm-chat-NONE", "perm-chat-VIEW", "perm-chat-REPLY"] · PUT `["{\"role\":\"STAFF\",\"unitIds\":[\"u-dorm\"],\"levels\":{\"dorm\":\"VIEW\"},\"chat\":\"VIEW\",\"extraPermissions\":{}}"]` → "บันทึกสิทธิ์แล้ว" · server ปฏิเสธ ⇒ "ระดับนี้ไม่มีในระบบนี้ — เลือก ปิด / ดู / ใช้งาน ตามที่หน้าจอแสดง"
- G3 ระงับ: POST ก่อนยืนยัน 0 · หลัง ["{}"] → "/secretary/staff" · เอาออก: กด "ยังไม่ทำ" = 0 · ยืนยัน = 1
- G3 MANAGER: ดูผู้จัดการอีกคน {"readonly": 1, "save": 0, "suspend": 0, "remove": 0} · ดูพนักงาน {"roles": ["perm-role-STAFF"], "save": 1, "suspend": 1}
- การ์ดคำเชิญ: "\nคุณได้รับคำเชิญจาก ร้านเพื่อน QC\nพนักงาน · ใช้ได้ถึง 11/11\nรับคำเชิญ" → POST `["{\"inviteId\":\"rinv1\"}"]` (ไม่มี x-tenant-id) → shark_tenant "t5" → "/secretary"
- G4 ธีม: กดมืด → shark_theme = "dark" · รีโหลดยัง = "dark" (`g4-theme-dark.png`)
- G4 แจ้งเตือน: GET 1 · PUT `["{\"kind\":\"inbox\",\"mode\":\"OFF\"}"]` · สรุปแถว "การแจ้งเตือน\nอนุมัติ · เลขา · ช่วยเหลือ\n"
- G4 เวร: POST `["{\"onDuty\":false}"]` → "เข้าเวร\nออกเวรแล้ว"
- G4 ลบบัญชี: preview GET 1 → "กิจการที่จะถูกลบ: บลูเฮาส์ หอพัก\nกิจการที่โอนให้คนอื่น: The Bean Café\nกิจการที่คุณออกจากทีม: Sweet Studio\nข้อมูลส่วนตัวและเลขาของคุณจะถูกลบ · ออกจากระบบทุกเครื่องทันที" · ปุ่มปิดก่อนพิมพ์/พิมพ์ไม่ครบ ("true"/"true" · POST 0) · พิมพ์ครบ → POST `["{\"confirm\":\"ลบบัญชี\"}"]` → logout 1 · token null → "/login"
- G4 ออกจากระบบ 2 แตะ: {"posts": 0, "label": "แตะอีกครั้งเพื่อออก"} → {"posts": 1, "url": "/login"} · MANAGER อีเมลรอยืนยัน "อีเมล (สำรอง · ใบเสร็จ)\nยังไม่ยืนยัน\nmgr@qc.invalid" · Apple "เข้าด้วย Apple\n–"

## 6. คำขอ (SPEC-EDIT / DTO-REQ)
- SPEC-EDIT: ไม่มี
- DTO-REQ-1 `GET secretary/invites/pending` (`pendingInvitesForUser` · R-S1.25b) — S1.14 ไม่มีเส้นนี้ · แอปเรียกแล้ว 404 = ไม่แสดงการ์ด (G1 + G4) · ข้อสอบกดจริงใช้ mock
- DTO-REQ-2 `GET secretary/staff` ใส่ `units: [{id, name}]` บนสุด (`listTenantUnits`) หรือ R-S1.14j (`units` ของแถวเป็น {id,name}) — ไม่มี ⇒ ชิปสาขาเหลือ "ทุกสาขา" อย่างเดียว · หัว G3 แสดง "สาขา"
- DTO-REQ-3 `POST secretary/staff/invite` รับ `levels` + `chat` (server แปลงด้วย `permissionsForLevel`/`permissionsForChat`) — แล้วตาราง LEVEL_KEYS ในแอปเหลือแค่ระดับที่มี (ไม่ต้องตามทะเบียนคีย์)
- DTO-REQ-4 `/me` `user.appleLinked: boolean` (G4) · DTO-REQ-5 สถานะเวรของตัวเอง + `onDutyAt` (G4 แสดงเวลาเข้าเวร) · DTO-REQ-6 คีย์รายตัวที่ผู้สั่งให้ได้ต่อคน (ช่อง extraPermissions ของ G3)

## 7. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ตาราง LEVEL_KEYS สำเนาทะเบียนคีย์ | route invite รับแค่ permissions | DTO-REQ-3 (S1.14 รอบถัดไป) |
| การ์ดรับคำเชิญยังไม่มี route จริง | DTO-REQ-1 | S1.14 |
| ไม่มีช่อง extraPermissions รายคีย์ | server ไม่บอกคีย์ที่ให้ได้ | DTO-REQ-6 |
| ลิงก์ `/i/<code>` (previewInvite) ยังไม่มีจอในแอป | นอกใบ (เว็บ/ลิงก์สาธารณะ) | S3 |
| aria-checked/aria-selected ของ Segment/Toggle บน RN-web ไม่ออก | ตรวจด้วย body ของคำขอ + localStorage แทน | — |

## 8. สคริปต์สร้างตาราง LEVEL_KEYS
```
// <scratch>/gen.mts · รัน: bash scripts/iso.sh pnpm exec tsx <scratch>/gen.mts > levels.json
import { PERMISSION_MODULES } from "@/lib/core/permissions";
import { isSensitiveKey, levelsAvailableFor } from "@/lib/staff/levels";
const READ = /\.(read|view|list)$/; const lim = (k: string) => k.split(".").some((s) => s.startsWith("_"));
const out: Record<string, unknown> = {};
for (const m of PERMISSION_MODULES) { if (m.module === "chat") continue; const keys = m.actions.map((a) => a.key).filter((k) => !isSensitiveKey(k) && !lim(k)); out[m.module] = { levels: levelsAvailableFor(m.module), view: keys.filter((k) => READ.test(k)), use: keys }; }
console.log(JSON.stringify(out));
```
แล้วแปลงเป็น `{ l, r, w }` (ตัดชื่อโมดูลหน้าจุดแรก) วางใน `LevelGrid.tsx`

## 9. รอบ 2 ตามรีวิว W (RESOLUTIONS §V) — merge ทิป 4cb52316 ก่อนแก้
| ข้อ | แก้ที่ | หลักฐาน (`s2.21-interaction/result.json`) |
|---|---|---|
| R-S2.21a `[]` = ยังไม่มีสาขา · `["*"]` = ทุกสาขา | `[membershipId].tsx` `allUnits` = มี "*" · `unitNames` [] ⇒ `perm.unitNone` · ถอนสาขาสุดท้าย = [] | หัว m2: "\nน้ำ\nยังไม่มีสาขา · ผู้จัดการ · เข้าร่วม 2 ก.ย." · ถอนสาขาเดียวของก้อง ⇒ "แชท\nแชท LINE/FB\nยังไม่มีสาขา\nไม่เห็น\nดูได้\nตอบได้" |
| R-S2.21b OFF-only ที่ server ให้ระดับไว้ ⇒ "ให้รายคีย์ไว้" | `LevelGrid` (`<testID>-<module>-perkey`) · ฟอร์ม G3 เก็บระดับดิบของ server · ไม่ส่งระดับของโมดูล OFF-only | settings=VIEW ⇒ perkey 1 "\nให้รายคีย์ไว้" |
| R-S2.21c role/unitIds เฉพาะเมื่อเปลี่ยน · ลด MANAGER→STAFF รีเซ็ตกริด | `save` + `pickRole` (ลดบทบาท ⇒ ระดับว่าง/แชท NONE แล้วส่งทั้งกริด + แชท — ระดับที่ "เก็บจริง" ของผู้จัดการ DTO ไม่ส่ง (staffViewOf ให้ค่าเต็ม) จึงเริ่มที่ปิดให้เจ้าของเลือก) | PUT แก้ระดับ: ["{\"levels\":{\"dorm\":\"VIEW\"},\"chat\":\"VIEW\",\"extraPermissions\":{}}"] · แก้สาขา: ["{\"unitIds\":[\"u-dorm\",\"u-main\"],\"levels\":{},\"extraPermissions\":{}}"] · ลดบทบาท: ["{\"role\":\"STAFF\",\"levels\":{\"dorm\":\"USE\",\"booking\":\"OFF\",\"account\":\"OFF\",\"pos\":\"OFF\",\"ai\":\"OFF\"},\"chat\":\"NONE\",\"extraPermissions\":{}}"] |
| R-S2.21d สาขาเริ่มต้น · bad_units · ลิงก์ · MANAGER ปุ่มคำเชิญ · ready+denied · G1 ref · ลิงก์ออก | `invite.tsx` `defaultUnits` (OWNER >1 สาขา = ว่าง ต้องเลือก · MANAGER = สาขาตัวเอง · ซ่อนชิปทุกสาขาถ้าตัวเองไม่มี "*") · REASON +bad_units · ลิงก์เฉพาะ sms≠sent · `canTouch` · `ready` มี `!denied` · `new.tsx` `busyRef` + `biz-new-logout` (เมื่อยังไม่มีกิจการ) | OWNER ยังไม่เลือก: POST 0 → เลือกทุกสาขา ["{\"name\":\"ก้อง\",\"phone\":\"+66800000404\",\"role\":\"STAFF\",\"unitIds\":[\"*\"],\"permissions\":{}}"] · MANAGER ชิป ["inv-unit-u-dorm"] · คำเชิญ {"rows": 2, "resend": 1, "cancel": 1} (ใบ MANAGER ไม่มีปุ่ม) · body ["{\"name\":\"ก้อง\",\"phone\":\"+66800000404\",\"role\":\"STAFF\",\"unitIds\":[\"u-dorm\"],\"permissions\":{}}"] · sms=sent ⇒ ลิงก์ 0 · bad_units ⇒ "มีสาขาที่ให้ไม่ได้ (ไม่อยู่ในกิจการหรือเกินสาขาของคุณ) — เลือกใหม่" · G1 กดซ้ำ 2 ครั้ง ⇒ POST 1 · ลิงก์ออก 1 |
| W-11 newOwner | `account.tsx` `acct.delete.toOwner` | "กิจการที่จะถูกลบ: บลูเฮาส์ หอพัก\nกิจการที่โอนให้คนอื่น: The Bean Café (ให้ น้ำ)\nกิจการที่คุณออกจากทีม: Sweet Studio\nข้อมูลส่วนตัวและเลขาของคุณจะถูกลบ · ออกจากระบบทุกเครื่องทันที" |
| W-13 เบอร์ปลอมชัด | fixtures `+668000001xx/2xx` · masked `080-•••-0303/0505` · สคริปต์กด `0800000404` | — |
- ภาพ/คู่ถ่ายใหม่ทั้งหมดบน dist นี้ (path เดิม §4) + `s2.21-interaction/{g2-manager,g3-demote}.png`
- ผลรอบ 2: spec s2.21 forced ×2 = 12/12 exit 0 · s2.2 11/11 · s2.4 7/7 · s2.5 9/9 · s2.7 16/16 · s2.10 10/10 · qc-sec-s2.1 14/14 · qc-sec-s2.12 13/13 (M-1 typecheck 0 · D-1/D-2 fitness ผ่านทุกรอบ) · หลัง merge ทิป a64e38e3 (S1.14 + S2.17–S2.19 · i18n/inventory/summary/s2.1 fixture รวมแบบ union) รันซ้ำทั้งชุด: s2.21 ×2 12/12 · s2.2 11/11 · s2.4 7/7 · s2.5 9/9 · s2.7 16/16 · s2.10 10/10 · s2.17 12/12 · s2.1 14/14 · s2.12 13/13 exit 0
- ตารางระดับ→คีย์คงไว้ (ตั๋ว server: invite รับ levels+chat ⇒ ลบใน S2.14)

## ต่อจากนี้ (ถ้า restart)
แก้จอแล้ว: รันบล็อก §4 (export ใหม่) → `bash scripts/iso.sh env QC_FORCE=1 SPEC=scripts/qc-sec-specs/s2.21.json pnpm exec tsx scripts/qc-sec-screen.mts` ×2 · `apps/mobile/node_modules` = symlink (ไม่ commit)
