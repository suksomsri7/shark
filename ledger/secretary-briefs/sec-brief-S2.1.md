# S2-1 — S2.1 โครงแอป + นำทาง + i18n + แถบบน + ทางเข้าจากหน้าแรก 1.0 (Opus · `wip/sec-s2.1` · light-check + ผู้ตรวจ 1 คน (นำทาง/regression จอ 1.0))

Read `sec-brief-COMMON.md`, `sec-brief-RESOLUTIONS.md` §F (R-UI1 สเกล ×0.73 · R-UI2 Feather/`@/src/theme/index` · R-UI3 theme-store), `sec-brief-S0.2.md` + `ledger/wo-notes/sec-s0.2.md` (ของที่มีแล้ว: `src/theme/{tokens,light,dark,index}` · `components/airy/*` 16 ตัว · `app/(app)/secretary/{index,_gallery}.tsx` · `qc/shoot-sec.mjs` · `qc/fixtures/secretary/README.md` · `scripts/parity-sec.sh` · `scripts/qc-sec-ui.mts`), plan row S2.1, แบบ §2 (รายการ 38 หน้า) + §10 "แถบบนทุกหน้า" (`ledger/DESIGN-SECRETARY.md`), ภาพแบบ `ledger/design-secretary/sec-a.jpg` หน้า 1 (A1) + `sec-k.jpg` (แถบบน 3 โซน) + `sec-dark-a.jpg`, และ oracle `scripts/qc-sec-s2.1.mts`. Verified: `apps/mobile/app/(app)/_layout.tsx` = Stack ของ 1.0 (ห้ามเปลี่ยนพฤติกรรมจอ 1.0 · `qc-mobile-app`/`qc-mobile-auth`/`qc-mobile-chat` ต้องเท่าเดิม) · `(app)/index.tsx` หน้าแรก 1.0 (orb → /chat) · ยังไม่มี i18n ในแอป (สตริงไทยฝังในจอ 1.0 — ห้ามแตะ).

## 1. เส้นทาง (expo-router · ทุกไฟล์ใหม่ใต้ `app/(app)/secretary/`)
| route | ไฟล์ | หน้าแบบ | ใบที่วาดจริง |
|---|---|---|---|
| `/secretary` | `index.tsx` (มีแล้ว C3 placeholder → ใบนี้ทำให้เป็น A1 โครง: ถ้า fixture มีห้อง = รายการ A1 (การ์ดเรียบ) · ไม่มี = C3 เดิม) | A1/C3 | S2.2 |
| `/secretary/new` | `new.tsx` | A2 | S2.3 |
| `/secretary/room/[id]` | `room/[id].tsx` | A3–A5 | S2.4 |
| `/secretary/inbox` | `inbox.tsx` | A6 | S2.5 |
| `/secretary/scheduled` | `scheduled.tsx` | A7 | S2.5 |
| `/secretary/staff` · `/secretary/staff/[membershipId]` · `/secretary/staff/invite` | `staff/{index,[membershipId],invite}.tsx` | D1 G2 G3 | S2.10 S2.21 S2.22 |
| `/secretary/settings` · `/secretary/settings/{secretary,access,rules,log,knowledge,customers,account,quota}` | `settings/{index,…}.tsx` | B1–B8 G4 | S2.7 S2.8 S2.9 S2.22 |
| `/secretary/onboarding/name` | `onboarding/name.tsx` | C1 | S2.11 |
| `/secretary/help` · `/secretary/help/[caseId]` | `help/{index,[caseId]}.tsx` | H1 H2 | S2.15 |
| `/customers` · `/customers/[id]` · `/customers/[id]/info` | `app/(app)/customers/{index,[id]/index,[id]/info}.tsx` | K1 K2 K3 | S2.17 S2.18 S2.19 |
| `/business/new` | `app/(app)/business/new.tsx` | G1 | S2.21 |
- ทุกจอใหม่ = **โครง**: `AiryScreen` + `TopBar` ตามโซน + หัวข้อไทย + ข้อความ "กำลังสร้าง (ใบ S2.x)" ใน `Glass` · ไม่เรียก API (ยกเว้น `/secretary` อ่าน `GET /api/mobile/secretary/rooms` ถ้า fixture มี · ไม่มี ⇒ C3) · ทุก Pressable มี `testID` (`sec-<route>-<ชื่อ>`) · ไม่มีสีฝัง · ไม่มีแถบล่าง (ไม่ใช้ Tabs navigator)
- `app/(app)/_layout.tsx`: **เพิ่ม** `<Stack.Screen name="secretary" />`/`customers`/`business` แบบ `headerShown:false` เท่านั้น (ไม่ย้าย/ไม่ลบของ 1.0) · กลุ่ม secretary มี `secretary/_layout.tsx` ของตัวเอง (Stack headerShown false · animation ตาม 1.0)

## 2. แถบบน (`components/airy/TopBar` — ขยายไม่เปลี่ยนสัญญาเดิม) + ตัวสลับกิจการ
- `components/secretary/SecTopBar.tsx`: `zone: "secretary" | "customers" | "team"` · ซ้าย 3 ปุ่มโซน (เลขา=message-circle · ลูกค้า=inbox · ทีม=users · ปุ่มโซนปัจจุบัน = สี `accent`/`zone.customers`/`zone.team` ตาม R-UI "สี 3 โซน") · ขวา `?` (help-circle → `/secretary/help`) + `+` (plus → `/secretary/new` ในโซนเลขา · `/customers` ไม่มี + · โซนทีม + → `/secretary/staff/invite`) · badge ต่อไอคอน (`badges?: { secretary?: number; customers?: number; team?: number }` — ตัวเลข ≤ 99 · มีจุดแดงเมื่อ >0) · กลาง = ชื่อกิจการ (จาก `GET /api/mobile/me` membership ที่ active) + ลูกศรเล็ก แตะ = `BusinessSwitcherSheet` (ชีต Airy: รายการร้านของผู้ใช้ จาก `/me` · แถว "เลขาของฉัน" → `/secretary/settings/secretary` · ปุ่ม "+ เพิ่มกิจการ" → `/business/new` · สลับ = `switchTenant` เดิมของ 1.0 (`src/lib/auth-context`)) · ไม่มีรูปโปรไฟล์
- ไอคอน Feather เท่านั้น (R-UI2) · ขนาดจาก `tokens.size.iconBtn` · `F` (0.73) ย้ายจาก `secretary/index.tsx` ไป `src/theme/index.ts` export `F`

## 3. i18n (เฉพาะจอเลขา · จอ 1.0 ไม่แตะ)
- `apps/mobile/src/i18n/{index.ts,th.ts,en.ts}` · `useT()` คืน `t(key, vars?)` · ภาษาจาก `AiSecretary.languages[0]` ผ่าน `/api/mobile/secretary` ถ้ามี ไม่งั้น `expo-localization` (มีใน SDK 57? ถ้าไม่มีใช้ `Intl`/`navigator.language` · ห้ามติดตั้งแพ็กเกจ) · คีย์ `sec.*` (en = ไทยทับ? ไม่ — en ต้องเป็นอังกฤษจริงสำหรับคีย์ที่ใบนี้ใส่ · คีย์ของใบถัดไปเพิ่มเอง) · ห้ามสตริงไทยฝังในไฟล์จอใหม่ (oracle grep อักษรไทยในไฟล์ `.tsx` ของ secretary/customers/business ⇒ 0 ยกเว้น fixture/คอมเมนต์)

## 4. ทางเข้าจากหน้าแรก 1.0
- `(app)/index.tsx`: เพิ่มปุ่ม/การ์ด "เลขา AI" (`testID="home-open-secretary"`) ที่ `router.push("/secretary")` **เพิ่มเท่านั้น** (วางใต้ orb/ชิปเดิม · ใช้สีจาก theme shim `C` ที่จอ 1.0 ใช้อยู่ — ไม่ import ธีมใหม่ในจอ 1.0) · ภาพ before/after `/` (1.0) ต่างกันเฉพาะปุ่มใหม่ (พิสูจน์ด้วย shoot-sec ROUTES=/)
- deep link scheme เดิม `sharkai://` (app.json): `sharkai://secretary/room/<id>` `sharkai://secretary/inbox` `sharkai://customers/<id>` ทำงานผ่าน expo-router ตาม path + `expo-router` ตาม path (ไม่ต้องแก้ native)

## 5. fixture + QC
- `qc/fixtures/secretary/s2.1.json`: `endpoints` = `/api/mobile/me` (1 ผู้ใช้ 2 ร้าน) · `/api/mobile/secretary/rooms` `{items: []}` · `/api/mobile/secretary/inbox/count` `{total:0, canApprove:0}` · `/api/mobile/inbox/unread` `{unread:0}` · `/api/mobile/secretary` `{name:"Shark", suffix:"ครับ", languages:["th"]}` · `expect` ทุก route ของใบ (testID ราก `sec-<route>`) · `routes` ครบ
- ถ่าย `ROUTES=<ทุก route ของใบ>` `--both` · ภาพคู่เฉพาะ `/secretary` (A1 โครงยังไม่ต้อง — ใบ S2.2 ทำ) ⇒ รัน `NO_PAIR=<ทุก route ยกเว้น /secretary>`
- `qc-mobile-app`/`qc-mobile-auth`/`qc-mobile-chat`/`qc-mobile-authz-hotfix` เท่าเดิม (ไม่แตะจอ 1.0 นอกจากปุ่มเดียว)

## Files you own
`apps/mobile/app/(app)/secretary/**` (ยกเว้น `_gallery.tsx`) · `app/(app)/customers/**` · `app/(app)/business/**` · `app/(app)/_layout.tsx` (เพิ่ม Stack.Screen เท่านั้น) · `app/(app)/index.tsx` (ปุ่มเดียว) · `src/components/secretary/{SecTopBar,BusinessSwitcherSheet}.tsx` · `src/components/airy/TopBar.tsx` (ขยาย prop) · `src/i18n/**` · `src/theme/index.ts` (export F) · `qc/fixtures/secretary/s2.1.json` · `ledger/wo-notes/sec-s2.1.md` · `docs/modules/31-secretary.md` §6 (ตารางเส้นทางแอป)
## Acceptance = `scripts/qc-sec-s2.1.mts` PASS (รวม `qc-sec-ui` ทุก route + typecheck mobile + regression ชุด mobile) · ภาพ `/` ก่อน/หลัง ในรายงาน
