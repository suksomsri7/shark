# WO S2.14 — ปิด S2: ต่อ API จริง · 3 สถานะทุกจอ · ทะเบียนปุ่ม + กดจริง · fix-forward F1–F4 · hand-off §X/§Y.2

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุม `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-d` branch `wip/sec-s2.14` (ฐาน b3c88df16) · 2026-11-05 UTC · builder: ตัวแทน
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.14.md` (+ COMMON + RESOLUTIONS §W §W.2 §X §X.2 §Y §Y.2) · สัญญา server `docs/api/SECRETARY-API.md`
> ข้อสอบ: `scripts/qc-sec-s2.14.mts` (S ทุก spec + s2.1/s2.12 · B ทะเบียนปุ่ม · F fixture/console + docs · T three-chats · M typecheck · D fitness) — **ไม่แก้ oracle/spec**

## สถานะ: เสร็จ (รอผู้คุม: ด่านเต็ม `next build` + qc-mobile-* + ผู้ตรวจ 2 คน + CP3 ภาพคู่) — ไม่ push
- ผล (หลัง merge session/secretary 90da32041 ด้วย SHA · ทิป bf99a3de7 + commit wo-note):
  - `qc-sec-s2.14` forced #1 `{"total":10,"passed":10,"failed":[],"skipped":[],"findings":[]}` exit 0 · forced #2 เท่ากัน exit 0 · ไม่ forced 10/10 (มี buttons-sec.json ⇒ รันเต็ม)
  - ในนั้น: S-1 ทุก spec (9) เขียว · s2.1/s2.12 เขียว · B-1 391 testID ok 391 · F-1 · F-2 (33 แถว) · T-1 three-chats 3/3 · M-1 typecheck mobile 0 · D-1/D-2 fitness ×2
  - typecheck ทั้ง repo (`NODE_OPTIONS=--max-old-space-size=9000 ISO_MEM=10500M bash scripts/iso.sh pnpm exec tsc --noEmit`) exit 0 (ก่อน merge · merge เพิ่มแค่ ledger + oracle S3a.1)
  - `clicks-sec.json`: 391/391 ok (ปุ่ม 129 · ช่องพิมพ์ 23 · กล่อง 239 ตามชนิดที่เห็นจริงบนเว็บ) · `three-chats.json` ok 3/3 unmocked 0 · summary ราก 60 จอ ok · states 96/96 ok · padding 20/20
  - ไม่ได้รัน: oracle เซิร์ฟเวอร์ `qc-sec-s1.*` (ใบนี้ไม่แตะ `src/**`/prisma) · `next build` (ผู้คุม)

## 1. fix-forward + hand-off ที่ทำ
| ข้อ | ไฟล์ | ทำอะไร |
|---|---|---|
| **badges เส้นเดียว** (R-S2.13b · §Y.2) | `src/api/secretary.ts` · `SecTopBar.tsx` (คอมเมนต์) · fixture 15 ไฟล์ | `refreshZoneBadges()` = `GET secretary/badges` เส้นเดียว (เดิม 4 เส้น: inbox/count · inbox/unread · staff/invites · support/cases) · เลขา = `approvals` · ลูกค้า = `customers` · ทีม = `team.invites + team.help + team.support` · `zoneCountsOf()` pure (รูปเสีย = 0) · พลาด = คงตัวเลขเดิม · fixture ทุกชุดเพิ่ม `GET /api/mobile/secretary/badges` (ค่าเท่าตัวเลขเดิมของภาพ) |
| **push `?s=`** (§Y.2 MINOR-2) | `src/lib/push-register.ts` | มีแล้วจาก S2.13 (`secretaryRouteFromLink(link, systemId)` ต่อ `?s=<systemId>&e=`) — ตรวจแล้ว ไม่ต้องแก้ · handler อ่าน `link` เป็นหลัก (R-S1.14c-c) |
| **K2 ai-suggest** (§X) | `customers/[id]/index.tsx` · `src/api/inbox.ts` | ขอร่างเฉพาะ `aiDraft && can.aiSuggest !== false` · `ok !== true` ⇒ ไม่มีการ์ด · `options[0].id` = suggestionId · ส่งจากการ์ด ("ส่ง") และ "แก้" แล้วส่ง ⇒ reply แนบ `suggestionId` (ไม่แนบกับบันทึกภายใน R-S1.14b-g · ล้างช่องพิมพ์ = ทิ้งร่าง) · ลบฟิลด์ deprecated `suggestionId/body` ของ SuggestRes |
| **K2 can.reply/assign** | `customers/[id]/index.tsx` | `canReplyHere = inbox/systems.canReply && conversation.can.reply !== false` คุมช่องพิมพ์/การ์ดร่าง/ส่งใหม่ · ปุ่มรับเรื่องซ่อนเมื่อ `can.assign === false` |
| **K3 phoneMasked** (§X) | `customers/[id]/info.tsx` · `src/api/inbox.ts` | แสดง `linkedMember.phoneMasked` ตรง ๆ (server ไม่ส่ง phone แล้ว) · ลบ `phone` ออกจาก type LinkedMember |
| **K3 can.*** (§X) | `customers/[id]/info.tsx` | `can.reply` (ตอบ/คนช่วย/รับเรื่องให้ตัวเอง R-S1.21a) · `can.assign` (มอบให้คนอื่น) · `can.setStatus` (สถานะ/ปิดห้อง) · `can.linkCustomer` (ผูก/ถอด) — ไม่มี `can` = กติกาเดิมจาก role |
| **K3 tags** (§X) | `customers/[id]/info.tsx` | แถวแท็ก = ชิปต่อแท็ก ("รอคน" = ชิปเตือน) แทนข้อความต่อกัน |
| **K3 task** (S1.14b เส้นจริง) | `customers/[id]/info.tsx` · i18n +7 คีย์ · inventory | ปุ่ม "สร้างงานบอร์ด" เปิดชีตชื่องาน → `POST …/task {title}` → "สร้างการ์ดงาน #N แล้ว" · 404 not_configured = ข้อความไทยของ server · แสดงเมื่อ can.reply |
| **G4 shift GET** (S1.14b) | `settings/account.tsx` · `src/api/secretary.ts` · fixture s2.1/s2.21/s2.21-mgr | สถานะเวร + เวลาเข้าเวรจาก `GET inbox/shift` · ตอบลูกค้าได้ = อยู่ใน `inbox/staff` |
| **ลบตาราง LevelGrid (คีย์) ใน G2** (§V · S1.14b merge แล้ว) | `staff/invite.tsx` · `LevelGrid.tsx` · `src/api/secretary.ts` | invite ส่ง `levels` (เฉพาะไม่ใช่ OFF) + `chat` แทน `permissions` · ลบ `permissionsFromLevels/keysForLevel/CHAT_KEYS` และรายการคีย์ r/w ทั้งตาราง — เหลือ `LEVELS_OF` (ระดับที่โมดูลมี) สำหรับแสดงปุ่ม · เหตุผลใหม่ `bad_level/bad_module/sensitive_key` แสดงไทย |
| **F1** แถบ/ปุ่มลอยทึบ | `theme/{light,dark,index,tokens}.ts` · `airy/{InputBar,BottomDock,index}.tsx` · A1 · D1 · G1 · G2 · C1(ตั้งชื่อ) | ช่องพิมพ์ทุกจอ (A1/A2/A4/H1/H2/K2) = `solidBarStyle` (พื้น `dock.bar` ทึบ + ขอบ/เงาแบบกระจก) · ของลอย absolute (ช่องสั่งงาน A1 · ปุ่ม D1/G1/G2/C1) มี `BottomDock` ใต้ = ไล่จากใสเป็นพื้นจอทึบ (`dock.fade→dock.solid` · สูง = ระยะล่าง + ความสูงของลอย + `DOCK_FADE` 30) · ไม่แตะ padding เดิม |
| **F2** A6 ชิป | `airy/Tabs.tsx` (+prop `dense` `bleed`) · `secretary/inbox.tsx` | ชิป 4 อันพอดีจอ 390 (padding 11 · ตัว 14 · gap 7) + แถวเลื่อนชิดขอบจอ (ไม่ถูกตัดกลางหน้า · เงาไม่ถูกตัดเป็นกล่อง) |
| **F3** รูปลูกค้า K2 | `components/customers/MessageBubble.tsx` · fixture s2.1/s2.17/s2.20 | พื้นรอ = `surface` + ไอคอนรูป · รูปโหลดได้ทับเต็มกรอบ · โหลดไม่ได้ (onError) = คงพื้นรอ · **แหล่งสีเขียวเดิม**: fixture ใช้ data URI PNG 1×1 ที่พิกเซลเดียวคือ `#00ff00` alpha 0x7f (ถอดจาก IDAT = `01 00ff007f`) ถูกยืดเต็ม 180×140 ด้วย `resizeMode="cover"` บนพื้น `chip.bg` — ไม่ใช่สีของธีม · เปลี่ยน fixture เป็น PNG 1×1 โปร่งใส (ภาพแสดงพื้นรอของจริง) |
| **F4** D1/G2 เลื่อนสุด | (ภาพ) | ดู §4 |
| **3 สถานะทุกจอ** (งาน 1) | 16 จอ + `airy/LoadState.tsx` (ใหม่ `Loading`/`LoadError`) · i18n `sec.state.*` | ก่อนผลแรก = ตัวหมุน (ห้ามแสดง "ว่าง/0" ระหว่างโหลด) · ล้ม = การ์ดล้ม + ลองใหม่ (หรือ note ออฟไลน์เดิมของจอที่ poll) · ว่าง = ข้อความว่างเดิม (หลังผลว่างจริงเท่านั้น) · บั๊กที่พบ: A1 ล้ม (500) ตกไปจอ C3 "ยังไม่มีงาน" · D1 ล้ม = "0 คน · ยังไม่มีพนักงาน" · B6 ล้ม = "ยังไม่มีบทเรียน" · K2 ระหว่างโหลดขึ้น "ดูได้อย่างเดียว" · A6/B8 ระหว่างโหลดขึ้น "0 รายการ/0%" — แก้ทั้งหมด · testID ใหม่ `sec-home-loading/-error` `sec-room-loading/-error` `sec-inbox-loading` `sec-sched-loading` `sec-staff-loading/-error` `perm-loading/-error` `sec-access-loading` `sec-know-loading/-error` `sec-cust-loading` `cust-set-loading` `sec-quota-loading` `sec-log-loading/-error` `help-loading` `help-case-loading/-error` `cust-loading` `cust-room-loading` `cust-info-loading` |

## 2. ตั๋ว server ที่พบ (ไม่แก้เอง · → S3a)
| # | เรื่อง | เหตุ | ข้อเสนอ |
|---|---|---|---|
| T1 | `GET secretary/badges` ไม่บอกสิทธิ์ดูแชทลูกค้า | `customers: 0` เป็นได้ทั้ง "ไม่มีสิทธิ์" และ "อ่านหมดแล้ว" — เดิม `inbox/unread` 403 ซ่อนไอคอนลูกค้าได้ทันที · ตอนนี้ซ่อนเมื่อเปิด K1/K2/K3 แล้วได้ 403 | เพิ่ม `customersAccess: boolean` (หรือ `customers: null` เมื่อไม่มี `chat.conversation.read`) |
| T2 | ระดับที่โมดูลมี (`levelsAvailableFor`) ไม่มีใน API | แอปยังต้องถือสำเนา `LEVELS_OF` (40 โมดูล · ตัวอักษร O/V/U) เพื่อแสดงเฉพาะปุ่มระดับที่มี — ทะเบียนเปลี่ยนแล้วแอปไม่ตาม = ส่งระดับที่ไม่มี ⇒ 422 bad_level | `GET secretary/access` (หรือ `staff`) ส่ง `levelsAvailable: Record<module, ("OFF"\|"VIEW"\|"USE")[]>` แล้วลบตารางสุดท้ายของแอป |
| T3 | `POST …/task` คืน `cardHref` = path เว็บ | แอปยังไม่มีจอบอร์ดงาน ⇒ แสดงแค่ "สร้างการ์ดงาน #N แล้ว" | ลิงก์เปิดเว็บ/จอบอร์ดในแอป (รุ่นถัดไป) |
| T4 | ไม่มีเส้นแก้แท็กห้อง | K3 แสดงชิปแท็กอ่านอย่างเดียว (หนี้ §N เดิม) | `PUT …/tags` ถ้าต้องการให้แก้จากแอป |
| **แถวแสดงผล ≠ ปุ่มปิด** | `components/secretary/SettingRow.tsx` · `customers/[id]/info.tsx` (InfoRow) | แถวที่ไม่มี onPress (เช่น อีเมล/Apple/SLA/แท็ก/ผู้ดูแลเมื่อไม่มีสิทธิ์) = `View` แทน `Pressable disabled` — โปรแกรมอ่านจอไม่ประกาศเป็นปุ่ม · ทะเบียนปุ่มนับเป็นกล่องแสดงผล |
| **ผูกเบอร์ล้มชั่วคราว** (สถานะล้ม) | `app/phone.tsx` | เน็ต/เซิร์ฟเวอร์ขัดข้อง (`network`/`server_error`) ⇒ คงรหัส 6 หลักไว้ให้กด "ยืนยัน" ซ้ำ (เดิมล้างทุกกรณี ⇒ ปุ่มยืนยันไม่มีทางกดได้จริงเพราะกล่องรหัสส่งเองเมื่อครบ) · รหัสผิด/หมดอายุ = ล้างเหมือนเดิม |

## 3. ทะเบียนปุ่ม + กดจริง (งาน 2)
- `apps/mobile/qc/buttons-sec.json` (สร้างด้วย `node apps/mobile/qc/click-sec.mjs --registry`): ทุก testID (สตริงตรง) ใน `app/(app)/secretary|customers|business/**` + `app/{login,signup,otp,phone}.tsx` (ไม่รวม `_gallery`) — regex เดียวกับ oracle B-1 · ต่อแถว `{testID, files[], kind: button|input|view, tag, handler, action}` · `action` = route/endpoint ที่ handler อ้าง (ตามเข้าไปในฟังก์ชันของไฟล์ 1 ชั้น) หรือ "สถานะจอ"
- `apps/mobile/qc/click-sec.mjs` → `apps/mobile/qc/shots-sec/clicks-sec.json` (เขียนโดยสคริปต์เท่านั้น): web export ของสำเนา QC + chromium · context แยกต่อหน้า (localStorage ไม่ปน) · สำรวจทุก fixture × route (ชุดเดียวกับภาพ + `s2.14-{loading,empty,error,denied}` + กรณีพิเศษ `s2.14-cases*.json` `cases[]`) และชีต/เมนูที่โผล่หลังกด (ลึก 2 ชั้น · ชั้นลึกสำรวจเฉพาะ testID ที่เพิ่งโผล่)
  - **ok ของปุ่ม** = หลังกด 1.1 วิ มีอย่างน้อย 1: request ใหม่ถึง API (GET ที่จอ poll ไม่นับ เว้นแต่เกิดทันทีหลังกด < 500 ms) · route เปลี่ยน · testID โผล่/หาย · aria/หน้าตาของปุ่มเปลี่ยน · ข้อความเปลี่ยน (จอที่ข้อความไม่ขยับเอง) · window.open · ตัวเลือกไฟล์ — **ไม่มีเลย = แดง** · ปุ่มปิด ⇒ กรอกทุกช่องก่อน (ยังปิด = แดง) · ฟอร์มที่ต้องแก้ก่อนบันทึก มีขั้นเตรียม `PREP` (เช่น `perm-save` ← เลือกระดับแชท)
  - **ok ของช่องพิมพ์** = พิมพ์แล้วค่าเปลี่ยน หรือเกิด request (กล่องรหัสส่งเองเมื่อครบ 6 หลัก)
  - **ok ของกล่อง (view)** = เห็นบนจอใน fixture อย่างน้อย 1 ชุด — ไม่ใช่ปุ่ม (ไม่มีอะไรให้กด) · ⚠️ ตีความ oracle B-1 "ทุก testID ต้อง ok" ⇒ กล่องนับ ok เมื่อแสดงจริง (ดู §7 คำถาม 1)
- fixture ใหม่ (สร้างด้วย `node apps/mobile/qc/states-sec.mjs --make` จาก s2.1 — อย่าแก้มือ): `s2.14-{loading,empty,error,denied}.json` (สถานะ) · `s2.14-cases.json` (+ `cases[]` ทางเดิน) · `s2.14-cases-{staff,new,auth,phone,phone2}.json` · ส่วนขยายรูปแบบ `__status/__delayMs/__afterReq` อ่านโดย `qc/sec-harness.mjs` เท่านั้น (shoot-sec.mjs เดิมไม่แตะ)

## 4. ภาพ (งาน 5 · ถ่ายใหม่ทั้งชุดหลังแก้ · runner `apps/mobile/qc/shots-sec/s2.14-interaction/README-reshoot.sh.txt`)
- ภาพคู่หน้าเดิมทุกแผ่น (สว่าง+มืด) ชื่อเดิมใน `apps/mobile/qc/shots-sec/` (A1–A7 · B2–B8 · C1–C4 · D1–D2 · G1–G4 · H1–H2 · K1–K3) + `s2.14-interaction/{b1-switcher,c4-reject-sheet,d3-add-member,k4-channels,k5-routing}{,-dark}-pair.png`
- **F1/F4** เลื่อนสุด: `apps/mobile/qc/shots-sec/s2.14-interaction/secretary-staff{,-dark}-scrolled-end-d1-pair.png` · `secretary-staff-invite{,-dark}-scrolled-end-g2-pair.png` · ภาพเลื่อนสุดทุกจอ `*-scrolled-end.png` + `padding.json` (20/20 ok · gap ≥ 12: A1 12 · A2 98 · A6 40 · K1 32 · K2 16 · D1 12 · H1 24 · G2 12 · C1 12 · G1 77 — 2 ธีมเท่ากัน)
- **F2** A6: `apps/mobile/qc/shots-sec/secretary-inbox{,-dark}-a6-pair.png` (ชิป 4 อันครบในจอ 390)
- **F3** K2 รูปลูกค้า: `apps/mobile/qc/shots-sec/s2.14-interaction/k2-image-placeholder{,-dark}-pair.png`
- 3 สถานะ (ภาพเดี่ยว · สว่าง): `apps/mobile/qc/shots-sec/s2.14-states/{loading,empty,error,denied}/<route>.png` + แผ่นรวม `<สถานะ>-sheet-{1..4}.png` + `states.json`
- ปุ่มปิดจริง: `airy/PrimaryButton.tsx` · `auth/airy.tsx` (LinkLine) ส่ง `disabled` ให้ Pressable (เดิมแค่ไม่ส่ง onPress ⇒ บนเว็บเป็นปุ่มเปิดที่กดแล้วเงียบ — ทะเบียนปุ่มจับได้ที่ `phone-request`) · หน้าตาไม่เปลี่ยน

## 5. งาน 3 (export · doctor · TODO · console)
- `expo export --platform web` ในสำเนา QC `/root/qc-shark-mobile-sec-d` ผ่าน (QC_PREPARE=1 ของ shoot-sec · exit 0 ทุกรอบ)
- `npx expo-doctor` ไม่ได้รัน: ไม่มีใน node_modules และ npx จะดาวน์โหลดแพ็กเกจ (ห้ามติดตั้งแพ็กเกจ) — ขอผู้คุมรันในทรีที่มี/ข้าม
- TODO/FIXME/XXX ในจอ+คอมโพเนนต์ S2 + `src/api/{secretary,inbox}.ts` = 0 · `console.log/debug` = 0 · import `@/qc/fixtures` = 0 (oracle F-1)

## 6. ข้อที่ต่างจากใบ + เหตุผล
| ใบ | ทำจริง | เหตุผล |
|---|---|---|
| docs "§6 ตารางจอ↔route↔endpoint" (ใบ) / "§2.3" (oracle F-2) | เพิ่ม **§2.3b** ใน `docs/modules/31-secretary.md` (33 แถว ขึ้นต้น `\| /…`) | §6 ของเอกสารเป็น state machine อยู่แล้ว · ตาราง §2.3 เดิมใช้ backtick ใน route ⇒ regex oracle ไม่นับ — ไม่แก้ตารางเดิม เพิ่มตารางใหม่ใต้ §2.3 |
| "ลบตาราง LevelGrid ฝั่งแอปใน G2" | ลบตาราง **ระดับ→คีย์** (`permissionsFromLevels/keysForLevel/CHAT_KEYS` + รายการคีย์ r/w) · คงกริดปุ่ม UI + ตาราง `LEVELS_OF` (ระดับที่โมดูลมี) | server ไม่ส่ง `levelsAvailable` ⇒ ถ้าลบหมดแอปจะแสดงปุ่มระดับที่โมดูลไม่มีแล้วโดน 422 · ตั๋ว T2 |
| fixture สถานะ | 4 สถานะ (เพิ่ม `denied` 403) | ไม่มีสิทธิ์ต่างจากล้ม (ข้อความไม่โทษผู้ใช้) |
| ภาพสถานะ | ภาพเดี่ยวสว่าง 1x (390×844) + แผ่นรวม | ขนาดรีโป (ภาพ 2x ทั้ง 96 แผ่น ≈ 98 MB) |
| `npx expo-doctor` | ไม่รัน | ต้องดาวน์โหลดแพ็กเกจ (ห้าม) |
| `clicks-sec.json` | รอบเต็ม 1 ครั้งบน build สุดท้าย (381/391) + รอบ `RESUME=1` เฉพาะ fixture `s2.1/s2.17/s2.20` (ปุ่ม K3 10 ตัวที่ถูกนับเพดาน 3 ครั้งในทางเดินที่ชีตค้นสมาชิกเปิดทับ — แก้ตัวนับแล้ว: ทางเดินที่มีชีตทับไม่นับเพดาน) ⇒ 391/391 | ไฟล์ยังเขียนโดยสคริปต์ทั้งหมด · รอบเต็มใหม่ใช้ ~28 นาที (คำสั่งใน §8) |

## 7. คำถามที่ต้องการมติ (ไม่เดา)
1. **oracle B-1 กับ testID ที่ไม่ใช่ปุ่ม**: ทะเบียนมี 391 testID — ปุ่ม 154 · ช่องพิมพ์ 14 · **กล่องแสดงผล 223** (ราก AiryScreen · Note · การ์ดผล · ชีต) ซึ่ง "กดแล้วมีผล" ไม่ได้โดยธรรมชาติ · click-sec ให้ ok = "เห็นบนจอจริงใน fixture อย่างน้อย 1 ชุด" (`effect: visible (ไม่ใช่ปุ่ม)`) — ขอยืนยันนิยามนี้ หรือสั่ง ORACLE-EDIT ให้ B-1 ตรวจเฉพาะ `kind != view`
2. ไอคอน "ลูกค้า" ของแถบบน: badges เส้นเดียวทำให้ซ่อนไอคอนได้เมื่อเปิด K1/K2/K3 แล้วเจอ 403 เท่านั้น (เดิมรู้จาก `inbox/unread` 403 ทันที) — รับได้จนกว่าตั๋ว T1 หรือให้ยิง `inbox/systems` เพิ่ม 1 เส้นเฉพาะครั้งแรกต่อกิจการ?
3. ปุ่ม "สร้างงานบอร์ด" K3 (S1.14b task): แสดงเมื่อ `can.reply` (คีย์ `chat.message.send` ตรงด่าน route) — ถ้าร้านไม่ได้เปิดสร้างงานจากแชท ผู้ใช้จะเห็นปุ่มแล้วได้ข้อความ not_configured · ต้องการให้ server ส่งธง `can.task`/ค่าตั้ง ใน DTO เพื่อซ่อนปุ่มไหม
4. `cust-info-tags` เปลี่ยนจากแถวข้อความเป็นชิป — ภาพแบบ K3 เป็นแถว "แท็ก" ข้อความ · ทำตาม hand-off §X ("แสดงชิปแท็ก") ⇒ ภาพคู่ K3 ต่างแบบเล็กน้อยที่แถวนี้

## 8. หนี้ / คำสั่งรันซ้ำ
- สร้าง fixture สถานะ+กรณีพิเศษ: `node apps/mobile/qc/states-sec.mjs --make` · ถ่ายสถานะ: `bash scripts/iso.sh env QC_COPY=/root/qc-shark-mobile-sec-d node apps/mobile/qc/states-sec.mjs`
- ทะเบียน: `node apps/mobile/qc/click-sec.mjs --registry` · กดจริงเต็ม: `bash scripts/iso.sh env QC_COPY=/root/qc-shark-mobile-sec-d WORKERS=4 node apps/mobile/qc/click-sec.mjs` (ต้องมี dist: `shoot-sec.mjs` QC_PREPARE=1 ก่อน) · แก้เฉพาะตัวแดง: `RESUME=1 SCEN='<regex fixture>'`
- ถ่ายใหม่ทั้งชุด + ภาพคู่ + เลื่อนสุด/ระยะ: `bash scripts/iso.sh bash apps/mobile/qc/shots-sec/s2.14-interaction/README-reshoot.sh.txt` (EXPORT=1 = export ก่อน)
- หนี้: badge โหลด 3 ครั้งตอนเปิดโซน (effect + focus ซ้อน — มีมาตั้งแต่ S2.1 · ไม่กระทบตัวเลข) · Android `expo-system-ui` (R-S2.13i · S3a) · ตั๋ว server T1–T4 (§2)
