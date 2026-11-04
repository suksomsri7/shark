# WO S2.2 + S2.3 (ชุด S2-2) — รายการห้อง A1/C3 · เริ่มงานใหม่ A2 (+ fix-forward RESOLUTIONS §Q R-S2.1a–f)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-d` branch `wip/sec-s2.2` (ฐาน fa790d96 + merge ทิปผู้คุม b7a0e68d = §Q + spec X-3..X-5) · 2026-11-05 UTC · builder: ตัวแทน
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.2.md` (+ COMMON + RESOLUTIONS §F §Q) · ภาพ `sec-a.jpg` หน้า 1 (A1) หน้า 2 (A2) + `sec-dark-a.jpg` · C3 = `sec-c.jpg` หน้า 4
> ข้อสอบ: `SPEC=scripts/qc-sec-specs/s2.2.json scripts/qc-sec-screen.mts` (11 ข้อ · **ไม่แก้ spec/oracle**) · S1.14 ยังไม่ merge ⇒ ชื่อเส้นตามตารางใน `sec-brief-S1.14.md` (+ ร่าง `docs/api/SECRETARY-API.md`) — ทุกเส้นอยู่ในตาราง `PATH` ของ `src/api/secretary.ts` ที่เดียว

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ดูภาพคู่) — ไม่ push

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `apps/mobile/app/(app)/secretary/index.tsx` | เขียนใหม่ | A1: ค้นหา (กรองชื่อในแอป) · ชิป 4 ตัว (นับกำลังทำ/รออนุมัติ) · การ์ด RoomCard → `/secretary/room/[id]` · บรรทัดรอง "เลขา · กำลังทำ · รออนุมัติ · เสร็จวันนี้" · ว่าง = C3 (ข้อเสนอจาก `secretary/suggestions` · ไม่มี/พลาด = ข้อเสนอตั้งต้น i18n) · 403 = จอ "ยังใช้เลขาไม่ได้" (R-S2.1d) · โหลดทุก focus + poll 15 วิ (useFocusEffect+setInterval ล้างตอน blur) + RefreshControl · ช่องสั่งงานล่าง `sec-home-new` → `/secretary/new` · กิจการเปลี่ยน = ล้างรายการทันที (กันผลของร้านเก่ามาทับ) |
| `apps/mobile/app/(app)/secretary/new.tsx` | เขียนใหม่ (แทน SecSkeleton) | A2: ปุ่ม × · หัวข้อ+ชื่อร้าน · orb + ทักทาย (ชื่อ/คำลงท้ายเลขา + ชื่อผู้ใช้คำแรก) · ข้อเสนอ (แตะ = เติม ไม่ส่ง · มติ 9) · สั่งบ่อย (`secretary/frequent` · ว่าง ⇒ `frequent` ที่แนบกับ suggestions) · ระบบที่เข้าถึงได้ (`secretary/access` ไม่โชว์ OFF · READ = "· ดูอย่างเดียว") · ส่ง `POST secretary/rooms {instruction, clientMessageId}` → `router.replace(/secretary/room/<roomId>)` · 402/quota ⇒ การ์ด `sec-new-quota` + ลิงก์ `/secretary/settings/quota` · 429/403/อื่น ⇒ Note · ปุ่มส่ง disabled เมื่อว่าง/กำลังส่ง · `?q=` เติมจาก C3 · ไม่มีไมค์ · KeyboardAvoidingView |
| `apps/mobile/src/api/secretary.ts` | ขยาย | ตาราง `PATH` + `secGet/secPost` แบบ typed · `normalizeRoom/normStatus/normalizeSuggestions/normalizeFrequent` (รับทั้งรูปร่าง API และรูปของ lib rooms.ts) · `isDenied` · `startErrorKind` · `clientMessageId` · **R-S2.1b** cache `me` คีย์ `user.id` + `resetSecretaryMe()` + ล้มไม่ cache · **R-S2.1e** store badge กลาง `refreshZoneBadges/useZoneBadgeCounts` + `useSecretaryZone()` (layout: โหลด me ต่อ user · user/tenant เปลี่ยน ⇒ reset · badge ตอน focus + AppState active) |
| `apps/mobile/app/(app)/{secretary,customers}/_layout.tsx` | แก้ | **R-S2.1a** `unstable_settings = { initialRouteName: "index" }` · ใช้ `useSecretaryZone()` · ส่ง `root` ให้ BusinessSwitcherHost |
| `apps/mobile/app/(app)/business/_layout.tsx` | แก้ | `useSecretaryZone()` (ไม่มี index ⇒ ไม่ใส่ initialRouteName) |
| `apps/mobile/src/components/secretary/BusinessSwitcherSheet.tsx` | แก้ | **R-S2.1c** `pick()`: switch สำเร็จ ⇒ ปิดชีต · `router.dismissAll()` (ถ้า canDismiss) · `router.navigate(root)` · Host รับ `root` |
| `apps/mobile/src/components/airy/Sheet.tsx` | แก้ | **R-S2.1f** `BackHandler` hardwareBackPress ปิดชีตเมื่อ visible |
| `apps/mobile/src/components/secretary/SecTopBar.tsx` | แก้ | **R-S2.1e** อ่าน `useZoneBadgeCounts()` แทนยิงเองทุก mount |
| `apps/mobile/src/components/airy/InputBar.tsx` | แก้ (เพิ่ม prop) | `sendTestID` · `sendDisabled` (พื้น btnOff) · `autoFocus` — ไม่ใส่ = เหมือนเดิม |
| `apps/mobile/src/components/secretary/{RoomCard,RoomFilters,SuggestionList}.tsx` | ใหม่ | การ์ดห้อง (เวลาไทย UTC+7 · badge รออนุมัติ · จุดยังไม่อ่าน · สั่งโดย/ร่วมกับ) · ชิปกรอง · รายการข้อเสนอ |
| `apps/mobile/src/components/secretary/sys.ts` | ใหม่ (นอกรายการ) | โมดูล → สี SysKey + คีย์ `sec.sys.*` (ใช้ร่วม 3 ไฟล์) |
| `apps/mobile/src/i18n/{th,en}.ts` | แก้ | +72 คีย์ `sec.home.*` `sec.new.*` `sec.sys.*` (27 โมดูลของ AI_MODULES) |
| `apps/mobile/qc/fixtures/secretary/s2.2.json` · `s2.2-empty.json` | ใหม่ | 5 ห้อง (รออนุมัติ 2 · กำลังทำ 2 · เสร็จ 1 · ผู้สั่งต่างกัน · crm/acc/chat/pos/dorm/booking) + suggestions/frequent/access/POST rooms · ว่าง = C3 |
| `apps/mobile/qc/fixtures/secretary/s2.1.json` | แก้ (นอกรายการ) | +mock `secretary/{suggestions,frequent,access}` · expect `/secretary/new` = `sec-new…` (จอจริงแทนโครง) — ให้ถ่ายชุด S2.1 ซ้ำได้สะอาด |
| `scripts/sec-ui-inventory.json` | แก้ | +11 แถวปุ่มของ S2.2/S2.3 |

## 5. ผลข้อสอบ
- spec oracle forced #1 (ก่อน commit): `JSON_SUMMARY {"total":11,"passed":11,"failed":[],"skipped":[],"findings":[]}` exit 0
- spec oracle forced #2 (หลัง commit ceb8452d): `JSON_SUMMARY {"total":11,"passed":11,"failed":[],"skipped":[],"findings":[]}` exit 0
- `qc-sec-s2.1` forced: `JSON_SUMMARY {"total":14,"passed":14,"failed":[],"skipped":[],"findings":[]}` exit 0
- regression unforced (qc-sec.sh + gate lock · SHARK_AI_MOCK=1) = `sec-baseline-bfad2f15.txt`: qc-mobile-app 38/38 exit 0 · qc-mobile-auth 31/31 exit 0 · qc-mobile-chat 29/29 exit 0 · qc-mobile-authz-hotfix 12/12 exit 0
- mobile typecheck 0 · fitness ×2 (oracle D-1/D-2 ผ่านทั้งสองรอบ) · pre-commit fitness ผ่าน

## 6. ภาพ
คำสั่ง (สำเนา/พอร์ตของเลนนี้):
```
R24=<24 route ของ S2.1 — ดู wo-notes sec-s2.1 §6>
bash scripts/iso.sh env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4724 ROUTES=$R24 FIXTURE=apps/mobile/qc/fixtures/secretary/s2.1.json node apps/mobile/qc/shoot-sec.mjs --both   # 48/48 ok
bash scripts/iso.sh env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4724 ROUTES=/secretary,/secretary/new FIXTURE=apps/mobile/qc/fixtures/secretary/s2.2.json node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/iso.sh env QC_PREPARE=1 QC_SKIP_EXPORT=1 QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4724 ROUTES=/secretary FIXTURE=apps/mobile/qc/fixtures/secretary/s2.2-empty.json QC_OUT=$PWD/apps/mobile/qc/shots-sec/s2.2-empty node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/parity-sec.sh a 1 apps/mobile/qc/shots-sec/secretary.png apps/mobile/qc/shots-sec/secretary-a1-pair.png   (+ --dark · a 2 สำหรับ /secretary/new)
bash scripts/iso.sh node apps/mobile/qc/shots-sec/s2.2-interaction/README-click.mjs.txt <s2.2.json> <s2.2-empty.json> <outdir>   (สคริปต์กดจริง · คัดลอกไป .mjs ก่อนรัน)
```
- ภาพคู่ (ผู้คุมดู):
  - `apps/mobile/qc/shots-sec/secretary-a1-pair.png` · `secretary-dark-a1-pair.png` (A1 ↔ sec-a หน้า 1)
  - `apps/mobile/qc/shots-sec/secretary-new-a2-pair.png` · `secretary-new-dark-a2-pair.png` (A2 ↔ sec-a หน้า 2)
- ภาพเดี่ยว: `apps/mobile/qc/shots-sec/{secretary,secretary-dark,secretary-new,secretary-new-dark}.png` (fixture s2.2 · summary ok · overflow false · unmocked [])
- สถานะว่าง (C3): `apps/mobile/qc/shots-sec/s2.2-empty/{secretary,secretary-dark}.png` (+ ภาพคู่อ้างอิง C3 `s2.2-empty/secretary-c3-pair.png` · `secretary-dark-c3-pair.png`) · summary แยก `s2.2-empty/summary.json`
- กดจริง `apps/mobile/qc/shots-sec/s2.2-interaction/`: `filter-approval.png` · `new-filled.png` · `new-quota.png` · `denied-403.png` · `switched-from-room.png` — ผล: ทั้งหมด 5 การ์ด · รออนุมัติ [r1,r4] · เสร็จ [r5] · ค้น "204" [r4] · poll GET rooms 1→2 ใน 16 วิ · แตะการ์ด → `/secretary/room/r4` · ช่องล่าง → `/secretary/new` · ปุ่มส่งว่าง aria-disabled=true · แตะข้อเสนอ = เติม instruction (POST 0 ครั้ง) · แตะสั่งบ่อย = เติม · ส่ง → `/secretary/room/r-new` body `{instruction, clientMessageId}` · 402 ⇒ การ์ดโควตา + ลิงก์ → `/secretary/settings/quota` · 403 ⇒ `sec-home-denied` (ไม่ใช่ C3) · C3 แตะข้อเสนอ → `/secretary/new` เติมคำสั่ง · สลับกิจการจากในห้อง → `/secretary` + tenant t2 (R-S2.1c)
- ชุด S2.1 ถ่ายซ้ำทั้ง 24 route ด้วย fixture s2.1 (แก้แล้ว) 48/48 ok — ภาพ 22 route อื่นได้ไฟล์เดิมทุกไบต์ (git ไม่เห็นความต่าง)

### จุดต่างจากแบบ (ภาพคู่)
| จอ | ต่าง | เหตุ |
|---|---|---|
| A1 | มีช่องสั่งงานล่าง (`sec-home-new`) — แบบไม่มี | ใบสั่ง "FAB/ช่อง สั่งงานใหม่ ล่าง" + spec บังคับ testID · ใช้ InputBar เดียวกับ C3 (กดแล้วไป A2) |
| A1 | บรรทัดรองของการ์ด = สถานะ ("รอคุณอนุมัติ 1 รายการ · สั่งโดย สมใจ") ไม่ใช่สรุปงาน ("ร่างเสร็จ ฿12,500 …") | DTO ของ rooms ไม่มีสรุปงาน (S1.14) — ถ้าเพิ่มฟิลด์ `summary` ภายหลัง ต่อได้ที่ RoomCard |
| A1 | ตัวอักษร/ปุ่มบนใหญ่กว่าแบบ (สัดส่วน) | R-UI1: ตัวอักษร = tokens.type · ปุ่ม 44 · ระยะแนวตั้ง × 0.73 |
| A1 | เวลา = "เมื่อวาน"/วันที่ (fixture 4 พ.ย. ถ่าย 5 พ.ย.) · กำลังทำ = "ตอนนี้" | relative ตามเวลาไทยจริง |
| A1 | ช่องค้นหา "ค้นหาชื่องานที่เคยสั่ง" (แบบ: "…ลูกค้า หรือเอกสาร") | กรองในแอปได้แค่ชื่อห้อง — ไม่สัญญาสิ่งที่ทำไม่ได้ |
| A2 | ไม่มี "พูด" ในช่องพิมพ์ ("พิมพ์สั่งงาน…") | มติ 16 ไม่มีไมค์ |
| A2 | ข้อเสนอแสดงคำสั่งเต็ม 1 บรรทัดเป็นบรรทัดรอง · ป้ายระบบตาม `system` จริง (inventory = "สต็อก") | API ข้อเสนอมี title+instruction เท่านั้น |

## 7. มติทางเทคนิค / ส่วนต่างจากใบ
- **ชื่อไฟล์ข้อมูล:** ใบเขียน `src/lib/secretary-api.ts` — ผู้คุมสั่งขยาย `src/api/secretary.ts` แทน ⇒ ทำตามนั้น
- **spec ตรวจสตริงเส้นในไฟล์จอ** (`secretary/rooms` ฯลฯ) แต่ทุกการเรียกต้องอยู่ในไฟล์ api ⇒ จอเรียกด้วย "ชื่อเส้น" (`secGet("secretary/rooms")`) · path จริงอยู่ในตาราง `PATH` (rename หลัง S1.14 = แก้ PATH ที่เดียว)
- DTO ยังไม่นิ่ง: `status` รับ OPEN/RUNNING/WAITING/DONE + QUEUED/WAITING_APPROVAL/CLOSED/FAILED · ผู้สั่ง `startedBy{id,name,isMe}` หรือ `startedById/startedByName` · คนร่วม `sharedWith`/`members`/`memberIds` · รออนุมัติ `badge.pendingProposals`/`pendingProposals` · unread bool/number
- ตัวกรอง "กำลังทำ" = RUNNING + OPEN (ห้องเปิดอยู่ที่ไม่รออนุมัติ) · ตัวกรองทำในแอปจาก take=50 ครั้งเดียว (ตัวเลขบนชิปมาจากชุดเดียวกัน)
- POST rooms ส่ง `clientMessageId` (ร่าง API บังคับ) — ไม่ส่ง `systems` (จอไม่มีตัวเลือกระบบ)
- ปุ่ม + ใน A2 = ล้างช่องพิมพ์ (แบบมี + แต่ไม่มีหน้าที่ · ไม่มีไฟล์แนบในใบนี้)
- R-S2.1b "เรียก resetSecretaryMe ตอน signOut/switchTenant": ไม่แตะ `auth-context` ของ 1.0 — `useSecretaryZone()` ใน layout เฝ้า `user.id`/`activeTenantId` แล้ว reset+โหลดใหม่ (ครอบทุกทางที่ signOut/switch) · cache คีย์ user.id กันข้ามบัญชีแม้ layout ไม่ได้ mount ตอนออก
- badge เลขารีเฟรชด้วยตอน /secretary โหลด/poll (layout focus ไม่ยิงซ้ำเมื่อกลับจากห้องใน stack เดียวกัน)
- InputBar (airy) เพิ่ม prop 3 ตัว — ไม่อยู่ใน "Files you own" แต่จำเป็นสำหรับ `sec-new-send` + disabled · เดิมไม่เปลี่ยน
- ทางที่เรียกโมเดลเพิ่ม: ไม่มี (POST rooms ไปทางเซิร์ฟเวอร์ S1.4 ที่นับงานอยู่แล้ว) · สิทธิ์: ไม่เปลี่ยน (403 จากเซิร์ฟเวอร์ = จอปฏิเสธ)

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ชื่อเส้น/รูป DTO ยืนยันกับ `docs/api/SECRETARY-API.md` หลัง S1.14 merge (โดยเฉพาะ `frequent` แยกเส้นหรือแนบ suggestions · `inbox/count`) | S1.14 ยังไม่ merge | ผู้คุม/S2.4 (แก้ `PATH` ที่เดียว) |
| บรรทัดสรุปงานบนการ์ด A1 | DTO ไม่มี | ถ้า S1.14 เพิ่ม `summary` |
| ปุ่ม + บนแถบบนยังโชว์ในจอ 403 | SecTopBar ไม่รู้สถานะสิทธิ์ | S2.20 |
| `secretary-c3-pair.png` (ราก shots-sec) เป็นภาพของ S2.1 | ภาพ C3 ใหม่อยู่ `s2.2-empty/` | — |

## ต่อจากนี้ (ถ้า restart)
แก้จอแล้ว: รันบล็อก §6 (export ใหม่) → `bash scripts/iso.sh env QC_FORCE=1 SPEC=scripts/qc-sec-specs/s2.2.json pnpm exec tsx scripts/qc-sec-screen.mts`
