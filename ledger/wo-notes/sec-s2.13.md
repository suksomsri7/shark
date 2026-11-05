# WO S2.13 + S2.20 (ชุด S2-13) — โหมดมืดครบทุกจอ · แถบบน badge 3 ไอคอน · push ห้องลูกค้า · 3 แชทไม่ปน · ภาพคู่ K · fix-forward D1 padding

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุม `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-d` branch `wip/sec-s2.13` (ฐาน 049df880b + merge session/secretary c256e2dc1 ด้วย SHA) · 2026-11-05 UTC · builder: ตัวแทน
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.13.md` (+ COMMON + RESOLUTIONS §F R-UI3 · §Q Q-8/Q-9 · §R–§V) · แบบ `sec-dark-{a,b,c,d,g,h,k}.jpg` ทุกแผ่น
> ข้อสอบ: `SPEC=scripts/qc-sec-specs/s2.13.json scripts/qc-sec-screen.mts` + ทุก spec S2 + `qc-sec-s2.1` `qc-sec-s2.12` (**ไม่แก้ spec/oracle**)

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ดูภาพคู่ทั้งชุด CP2) — ไม่ push

## 1. ไฟล์ที่แตะ
| ไฟล์ | ทำอะไร |
|---|---|
| `apps/mobile/app.json` | `userInterfaceStyle: "automatic"` (C17 · X-1) |
| `apps/mobile/src/components/airy/ThemedStatusBar.tsx` (ใหม่) · `airy/index.ts` · `airy/Screen.tsx` | StatusBar ตามธีม (มืด ⇒ light · สว่าง ⇒ dark) · แสดงเฉพาะตอน focus (`useIsFocused` ของ expo-router — SDK 57 ห้าม import @react-navigation ตรง) ⇒ โซนเลขาค้าง mount ใน drawer ไม่ทับ `StatusBar style="dark"` ของจอ 1.0 · ใส่ใน AiryScreen = ครอบจอ S2 ทุกจอรวม login/signup/otp/phone |
| `app/(app)/{secretary,customers,business}/_layout.tsx` | `<ThemedStatusBar />` ชั้นโซน (X-2) |
| `src/api/secretary.ts` | badge ทีม = คำเชิญที่ส่งแล้วรอรับ (`GET secretary/staff/invites` ไม่หมดอายุ · ยิงเฉพาะ OWNER/MANAGER) + `support/cases.unread` · `pendingInviteCount` (pure) · ลำดับรอบ (`badgeSeq`) กันผลเก่าทับร้านใหม่ · **หลัง action**: `afterAction()` ครอบ secPost/secPostId/secDeleteId/secGetId ⇒ `scheduleZoneBadges()` (รวบ 400 ms) เมื่อ approve/reject ข้อเสนอ/แผน · เชิญ/ส่งใหม่/ยกเลิกคำเชิญ · รับคำเชิญ · เปิด/ตอบ/ปิด/อ่านเรื่องช่วยเหลือ |
| `src/components/secretary/SecTopBar.tsx` | คอมเมนต์แหล่งของ badge 3 ไอคอน (โค้ดแสดง badge + ปุ่ม ? มีแล้วจาก S2.1) |
| `app/(app)/customers/[id]/index.tsx` | (1) อ่านแล้ว ⇒ `scheduleZoneBadges` (badge ลูกค้าลด) (2) `?e=helper|handoff|sla|assigned` ⇒ Note ตามเหตุ (`cust.push.*` · sla = เตือน) (3) **บั๊กที่พบ**: เปิดตรงจากลิงก์/แจ้งเตือนตอนแอปเพิ่งเปิด กิจการ (auth) มาหลัง focus ⇒ load แรกถูกข้าม จอว่าง+"ดูได้อย่างเดียว" จนรอบ poll 5 วิ — แก้: โหลดทันทีเมื่อรู้กิจการ (พิสูจน์: probe 1.5 วิ ก่อนแก้ = ว่าง `…/customers-x1-dark-scrolled-end.png` รอบแรก · หลังแก้ = การ์ดร่างท้ายห้อง) |
| `src/lib/push-register.ts` | `secretaryRouteFromLink(link, systemId)`: `/customers/<id>` **และ `/inbox/<id>`** (ลิงก์ที่ `src/lib/modules/chat/routing.ts` ส่งจริงวันนี้) ⇒ `/customers/<id>?s=<data.systemId>&e=<เหตุ>` (เหตุที่รู้จัก 4 ค่า · systemId รูปแปลก = ไม่ใส่) · `customerPushReason` |
| `qc/push-link-test.mjs` | P-6/P-8 เดิมคาด `/inbox/…` = ปล่อยให้ตัวจัดการ 1.0 (→ `/chat/<conversationId>` = ห้อง AI คนละชนิด) ⇒ เปลี่ยนเป็นลิงก์ CRM/`/inbox` ที่ไม่มี id · เพิ่ม P-10 (5 ลิงก์ห้องลูกค้า + สลับร้าน) P-11 · ผล 11/11 |
| `app/(app)/secretary/staff/index.tsx` · `staff/invite.tsx` · `onboarding/name.tsx` | fix-forward D1: `LIST_BOTTOM = size.btnH + CTA_BOTTOM + cardGap` (แบบ A1) แทนเลขฝัง 120/110 · `CTA_BOTTOM` ใช้ร่วมกับปุ่ม |
| `app/(app)/secretary/index.tsx` | จอ 403 ไม่มีปุ่ม + (หนี้ S2.2) |
| `app/(app)/secretary/settings/index.tsx` | Q-8 ชื่อกิจการไม่อัดกลางแถบ 5 ปุ่ม — วางเต็มบรรทัดใต้แถบ (`TenantTitle`) แบบหน้า K |
| `src/components/airy/Sheet.tsx` | หนี้ S2.4/S2.5 "ชีตโปร่ง": พื้น `c.surface` ใต้ไล่สี + blur บนเว็บ |
| `src/components/secretary/BusinessSwitcherSheet.tsx` | หนี้ S2.7: แถบโควตางานของกิจการ (B1) โหลดตอนเปิดชีต · `sec-switch-quota` |
| `src/i18n/index.ts` | Q-9 ภาษากระพริบ: เก็บภาษาล่าสุดคีย์ `shark_lang` (เว็บ localStorage อ่านทันที · มือถือ SecureStore async · ค่าเซิร์ฟเวอร์ชนะ) |
| `src/i18n/{th,en}.ts` | +6 คีย์ (`cust.push.*` ×4 · `sec.switch.quota*` ×2) · th/en 1038 = 1038 · en ไม่มีอักษรไทย |
| `qc/three-chats.mjs` (ใหม่) · `qc/fixtures/secretary/s2.20.json` (ใหม่) | ข้อสอบ 3 แชท (§3) · fixture รวม s2.17+s2.4+s2.10+s2.2 + badge (รออนุมัติ 2 · ลูกค้า 3 · ทีม 2) + แชท 1.0 `/chat/c1` |
| `qc/fixtures/secretary/*.json` (13 ไฟล์) | + `GET secretary/staff/invites` / `GET secretary/support/cases` ที่ยังไม่มี (badge ทีมยิงที่ layout ของโซน · ไม่ใส่ = unmocked ⇒ U5 แดง) · s2.10 คำเชิญ inv1 ตรงแถว D1 · s2.7-staff + inbox/systems·connections·quick-replies·routing·notify (หนี้เก่า: S2.17 เพิ่มส่วน K4/K5 แต่ไม่เติม mock ⇒ s2.7-staff/summary มี unmocked) |
| `qc/shots-sec/**` | ถ่ายใหม่ทุก route ทุก fixture `--both` + ภาพคู่ใหม่ทั้งหมด (§4) · `three-chats*.{json,png}` · `s2.13-interaction/` |

ไม่แตะ: จอ 1.0 · `(app)/_layout.tsx` · เซิร์ฟเวอร์ · spec/oracle · package.json · inventory (ไม่มี Pressable ใหม่ — `sec-switch-quota` เป็น View)

## 2. โหมดมืด
- สีฝัง: สแกนจอ S2 ทุกไฟล์ (`app/(app)/{secretary,customers,business}/**` + `app/{login,signup,otp,phone}.tsx` + `components/{airy,secretary,customers,auth/airy}`) ด้วย regex ของ oracle ⇒ **0 จุดในจอ/คอมโพเนนต์ S2** (เหลือ `components/auth/social.ts` สีแบรนด์ Google/FB/LINE และ `auth/ui.tsx` ของ DNA 1.0 — ไม่ใช่จอ S2 · ไม่แก้) ⇒ ไม่มีรายการสีฝังที่ต้องแก้ในใบนี้
- ธีม: `useTheme()` = theme-store `shark_theme` (R-UI3) ∩ เครื่อง — มีแล้วจาก S0.2 · ตั้งค่า G4 (S2.22) ใช้ store เดียวกัน · `userInterfaceStyle automatic` ทำให้ `useColorScheme()` บนมือถือได้ค่าจริง (เดิม light เสมอ)
- จอ 1.0: ใช้ shim สว่างเดิม · ไม่มี ThemeProvider ของ navigation ⇒ พื้น/หัวยังสว่าง · StatusBar 1.0 = `dark` เดิม (ThemedStatusBar ถอดเมื่อโซนหลุด focus) · **ต้องดูบนเครื่องจริงที่ CP2**: คีย์บอร์ด/Alert ระบบของจอ 1.0 จะเป็นสีมืดตามเครื่อง (native · คุมจาก JS ไม่ได้โดยไม่แตะจอ 1.0)

## 3. ข้อสอบ 3 แชทไม่ปน (`apps/mobile/qc/three-chats.mjs` → `apps/mobile/qc/shots-sec/three-chats.json`)
- กดจริงใน chromium (puppeteer เดียวกับ shoot-sec) · ข้อความไม่ซ้ำกันต่อข้อ · เส้น "ส่ง" = `…/inbox/conversations/<id>/reply` · `…/secretary/rooms(/<id>/send)?` · `…/mobile/chat/send`
- ผล `{ok:true}` 3/3: `/customers/x1` → `POST /api/mobile/inbox/conversations/x1/reply` 1 ครั้ง (มีข้อความ) · `/secretary/room/r1` → `POST /api/mobile/secretary/rooms/r1/send` 1 · `/chat/c1` (1.0) → `POST /api/mobile/chat/send` 1 · leaks [] · unmocked [] · ข้อความไม่อยู่ใน body ของเส้นอื่นเลย
- positive control: แต่ละข้อนับ hit ของเส้นที่คาด = 1 (ไม่ใช่แค่ "ไม่มีรั่ว") · ภาพ `three-chats-{customer,secretary,ai10}.png`

## 4. ภาพ
คำสั่ง (ทั้งชุด): `apps/mobile/qc/shots-sec/s2.13-interaction/README-reshoot.sh.txt` (ถ่ายทุก fixture `--both` + parity ทุกคู่) · ผล: summary ราก 60 จอ ok/overflow false/errors []/unmocked []/missing [] (เว้น `_gallery` ของ S0.2 ไม่ได้ถ่ายใหม่) · โฟลเดอร์ย่อย s2.2-empty · s2.4-running/done · s2.7-staff (12) · s2.21-mgr (8) ok ทั้งหมด
ภาพคู่ (สว่าง + มืด · ทุกแผ่นที่มีแบบในแอป):
- A1 `apps/mobile/qc/shots-sec/secretary{,-dark}-a1-pair.png` (fixture s2.20 · badge 3 ไอคอน) · A2 `secretary-new{,-dark}-a2-pair.png` · A3 `s2.4-running/secretary-room-r1{,-dark}-a3-pair.png` · A4 `secretary-room-r1{,-dark}-a4-pair.png` · A5 `s2.4-done/secretary-room-r1{,-dark}-a5-pair.png` · A6 `secretary-inbox{,-dark}-a6-pair.png` · A7 `secretary-scheduled{,-dark}-a7-pair.png` (A8 = จอล็อกของระบบ ไม่มีจอในแอป)
- B1 **ใหม่** `s2.13-interaction/b1-switcher{,-dark}-pair.png` · B2–B8 `secretary-settings-{secretary,access,rules,log,knowledge,customers,quota}{,-dark}-b{2..8}-pair.png`
- C1 `signup{,-dark}-c1-pair.png` · C2 `otp{,-dark}-c2-pair.png` · C1(ตั้งชื่อ) `secretary-onboarding-name{,-dark}-c1-pair.png` · C3 `secretary{,-dark}-c3-pair.png` + `s2.2-empty/secretary{,-dark}-c3-pair.png` · C4 **ใหม่** `s2.13-interaction/c4-reject-sheet{,-dark}-pair.png`
- D1 `secretary-staff{,-dark}-d1-pair.png` (fixture s2.20) · D2 `secretary-room-r2{,-dark}-d2-pair.png` · D3 **ใหม่** `s2.13-interaction/d3-add-member{,-dark}-pair.png`
- G1–G4 `business-new…g1` `secretary-staff-invite…g2` `secretary-staff-m1…g3` `secretary-settings-account…g4` (G5 = backoffice เว็บ)
- H1 `secretary-help{,-dark}-h1-pair.png` · H2 `secretary-help-c1{,-dark}-h2-pair.png` (H3/H4 = backoffice เว็บ)
- K1 `customers{,-dark}-k1-pair.png` (fixture s2.20) · K2 `customers-x1{,-dark}-k2-pair.png` · K3 `customers-x1-info{,-dark}-k3-pair.png` · K4 **ใหม่** `s2.13-interaction/k4-channels{,-dark}-pair.png` · K5 **ใหม่** `s2.13-interaction/k5-routing{,-dark}-pair.png` (เลื่อนถึงส่วนในหน้า B7 — ตามที่ S2.17 จด K4/K5 เป็นส่วนต่อท้าย)
(path ทั้งหมดอยู่ใต้ `apps/mobile/qc/shots-sec/`)

## 5. fix-forward D1 + ตรวจแถบ/ปุ่มลอยล่าง 2 ธีม (`s2.13-interaction/padding.json` · สคริปต์ `README-padding.mjs.txt`)
เลื่อน ScrollView หลักจนสุด แล้ววัดขอบล่างของเนื้อหาท้ายสุดเทียบขอบบนของปุ่ม/ช่องลอย (หรือขอบล่างของรายการเมื่อแถบอยู่ในโฟลว์) — 18/18 ok:
| จอ | ของลอย | ท้ายสุด → ขอบ | ช่องว่าง (สว่าง/มืด) |
|---|---|---|---|
| A1 /secretary | ช่องสั่งงาน `sec-input` | การ์ดห้อง 750 → 762 | 12 / 12 |
| A2 /secretary/new | — (เนื้อหาไม่ล้นจอ) | — | ok |
| A6 /secretary/inbox | — | กลุ่มร้าน 804 → 844 | 40 / 40 |
| K1 /customers | — | แถว 812 → 844 | 32 / 32 |
| K2 /customers/x1 | ช่องพิมพ์ในโฟลว์ | การ์ดร่าง 704 → 720 | 16 / 16 |
| **D1 /secretary/staff** | ปุ่ม "เพิ่มพนักงาน" | แถวรอรับคำเชิญ 746 → 758 | 12 / 12 |
| H1 /secretary/help | ช่องพิมพ์ในโฟลว์ | รายการ 738 → 762 | 24 / 24 |
| G2 /secretary/staff/invite | ปุ่มส่งคำเชิญ | แถวคำเชิญ 746 → 758 | 12 / 12 |
| C1 /secretary/onboarding/name | ปุ่มบันทึก | ตัวอย่าง 746 → 758 | 12 / 12 |
- หมายเหตุ D1: ที่ตำแหน่งเลื่อน 0 (ภาพคู่) ปุ่มยังลอยเหนือแถวท้าย เพราะ 5 คน + คำเชิญยาวกว่าจอ 844 — ปกติของรายการเลื่อน (เหมือน A1 ใน S2.2) · เลื่อนสุดแล้วห่าง 12 = cardGap

## 6. ผลข้อสอบ (หลังถ่ายใหม่ทั้งชุด · ทิป 1d41d3ddc → merge session/secretary 1dba1d33b ด้วย SHA)
- spec ทุกใบ forced (QC_SKIP_TSC=1 · fitness ×2 อยู่ในทุกรอบ) ทุกตัว exit 0:
  s2.2 10/11 · s2.4 6/7 · s2.5 8/9 · s2.7 15/16 · s2.10 9/10 · s2.13 10/11 · s2.15 7/8 · s2.17 11/12 · s2.21 11/12 · oracle s2.1 13/14 · oracle s2.12 12/13 (ข้อที่ขาด = M-1 SKIP ทุกตัว · failed [] ทุกตัว)
- **s2.13 forced หลัง merge (มี typecheck mobile M-1) ×2**: `{"total":11,"passed":11,"failed":[],"skipped":[],"findings":[]}` exit 0 ทั้งสองรอบ · ไม่ forced: 10/11 (M-1 SKIP) exit 0
- `pnpm exec node apps/mobile/qc/push-link-test.mjs` 11/11 · `three-chats.mjs` 3/3 ok · padding 18/18 ok · mobile typecheck 0 · pre-commit fitness ผ่าน
- คำสั่ง: `bash scripts/iso.sh env QC_FORCE=1 [QC_SKIP_TSC=1] SPEC=scripts/qc-sec-specs/<ใบ>.json pnpm exec tsx scripts/qc-sec-screen.mts` · `bash scripts/iso.sh env QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4729 node apps/mobile/qc/three-chats.mjs` (ต้องมี dist จาก shoot-sec QC_PREPARE=1 ก่อน)

## 7. ค้าง / ขอมติผู้คุม
| เรื่อง | เหตุ | ข้อเสนอ |
|---|---|---|
| **ใบ: "SecTopBar ทุกหน้า S2 + ปุ่ม ? ทุกหน้า"** vs แบบ: หน้าย่อย (A2–A7 · B2–B8 · D2 · G1–G4 · H2 · K2 · K3) ในภาพแบบใช้แถบย้อนกลับ ไม่ใช่แถบ 3 โซน | ทำตามแบบ (ภาพคู่ต้องตรงแบบ) · แถบ 3 โซน + ? อยู่ทุกหน้ารากโซน: /secretary · /customers · /secretary/staff · /secretary/help · /secretary/settings | ผู้คุมยืนยัน หรือสั่งเพิ่มปุ่ม ? ในแถบย้อนของหน้าย่อย (จะต่างจากแบบ) |
| **badge ทีม** = "คำเชิญรอรับ + ขอความช่วยเหลือค้าง" | ตีความ: คำเชิญที่ร้านส่งแล้วรอรับ (แถว D1) + `support/cases.unread` (ทีม SHARK ตอบแล้วรอเรา) · ไม่มีเส้นนับ "คนขอให้ช่วยในห้องลูกค้า" และคำเชิญที่ส่งถึงเรา (`invites/pending` ยังไม่มีบนเซิร์ฟเวอร์) | ถ้าต้องการนิยามอื่น = ตั๋วเซิร์ฟเวอร์ (เส้นนับเดียว `secretary/badges` จะลด 4 request เหลือ 1) |
| **push ห้องลูกค้า**: ใบเขียน `data.link=/customers/<id>` แต่ `chat/routing.ts` ส่ง `/inbox/<id>?e=…` | แอปรับทั้งสองแบบ (เดิม `/inbox` ตกไปตัวจัดการ 1.0 → `/chat/<conversationId>` ผิดชนิดห้อง) · แก้ P-6/P-8 ของ push-link-test (ไม่ใช่ oracle ของผู้คุม) | ตั๋วเซิร์ฟเวอร์: เปลี่ยน link เป็น `/customers/<id>` (แอปรองรับแล้ว) |
| คีย์บอร์ด/Alert ของจอ 1.0 ตามธีมเครื่อง | native · `automatic` มีผลทั้งแอป | เจ้าของดูบนเครื่องจริง CP2 |
| ย้อนกลับข้ามโซนไปหน้าแรก 1.0 (หนี้ S2.1 "ถ้าต้องการ") | ไม่เปลี่ยน backBehavior ของ drawer 1.0 | คงเดิม |
| `base-s2.1/summary.json` จอ index ไม่ ok | ภาพฐานเก่าของ S2.1 (ไม่ใช่ข้อสอบ) | ไม่แตะ |
