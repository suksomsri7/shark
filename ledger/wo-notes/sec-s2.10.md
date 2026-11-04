# WO S2.10 + S2.11 (ชุด S2-10) — D1 ทุกคนในกิจการ · D2 ห้องร่วม · D3 ชีตเพิ่มคน · C1 ตั้งชื่อเลขา + fix-forward ห้อง (RESOLUTIONS §S)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-c` branch `wip/sec-s2.10` (ฐาน = ทิปผู้คุม + merge `session/secretary` ec757f92 ตาม COMMON A.11) · 2026-11-04 UTC · builder: ตัวแทน
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.10.md` (+ COMMON + RESOLUTIONS §F §J §P R-S1.25a/g §Q §S) · ภาพ D1 = `sec-d.jpg` หน้า 1 · D2 = หน้า 2 · D3 = หน้า 3 · C1 = `sec-c.jpg` หน้า 3 (+ `sec-dark-d.jpg` / `sec-dark-c.jpg` หน้าเดียวกัน)
> ข้อสอบ: `SPEC=scripts/qc-sec-specs/s2.10.json scripts/qc-sec-screen.mts` (10 ข้อ · **ไม่แก้ spec/oracle**) · สัญญา S1.14: ยังไม่ merge เข้า session ⇒ อ่าน `wip/sec-s1.14` (อ่านอย่างเดียว · d5412e2f `docs/api/SECRETARY-API.md` + `src/lib/ai/secretary/dto.ts` + `src/lib/staff/levels.ts` + `src/app/api/mobile/secretary/staff/route.ts`)

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ดูภาพคู่ + ผู้ตรวจ 2 คน (ห้องร่วม/สิทธิ์)) — ไม่ push

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `apps/mobile/app/(app)/secretary/staff/index.tsx` | เขียนใหม่ (แทน SecSkeleton) | D1: SecTopBar โซนทีม (+ ซ่อนสำหรับ STAFF) · ชื่อกิจการใหญ่ · ค้นหา · แถวพนักงาน (ป้ายแชท NONE/VIEW/REPLY · หน่วย · กำลังทำ/รออนุมัติ/ห้องร่วมกับคุณ จาก `secretary/rooms` · เข้าเวร จาก `inbox/staff` onDuty) · แถวคำเชิญค้าง (ส่งอีกครั้ง → `POST staff/invites/[id]/resend` · ยกเลิก → ชีตยืนยัน → `DELETE staff/invites/[id]`) · แตะแถว → `/secretary/staff/[membershipId]` · ปุ่ม "เพิ่มพนักงาน" → `/secretary/staff/invite` · STAFF/403 = จอ "เฉพาะเจ้าของ/ผู้จัดการ" ไม่มีปุ่ม |
| `apps/mobile/app/(app)/secretary/onboarding/name.tsx` | เขียนใหม่ | C1: "ขั้น 3 จาก 3" + แถบ 3 ช่อง · ลูกแก้ว · ชื่อ (ค่าเริ่มต้น `"Shark"` = DEFAULT_SECRETARY_NAME · ไม่มีรายการชื่อตัวอย่าง R9) · ลงท้าย · น้ำเสียง · ตัวอย่างการพูดสด · บันทึก = `updateSecretary` (PUT secretary) → reload me → `router.replace("/secretary")` · ข้าม = ไป /secretary ไม่ PUT · เคยตั้งแล้ว (saved) ⇒ เติมค่าเดิม |
| `apps/mobile/app/(app)/secretary/room/[id].tsx` | แก้ | D2 (ฟองคนอื่น/ข้อความระบบ/ป้ายผู้อนุมัติ/ปุ่ม user-plus + เมนู "เพิ่มคน") · §S ทั้งหมด (ตาราง §7) |
| `apps/mobile/src/components/secretary/StaffRow.tsx` | ใหม่ | แถวพนักงาน + แถวคำเชิญค้าง |
| `apps/mobile/src/components/secretary/AddMemberSheet.tsx` | ใหม่ | D3 (ดู §3) + ส่วน "อยู่ในห้องแล้ว" ถอด (ยืนยัน) |
| `apps/mobile/src/components/secretary/MemberBubble.tsx` | ใหม่ | `Avatar` (ตัวอักษรแรก · สีระบบของธีมวนตาม userId) · `MemberBubble` · `SystemMsg` |
| `apps/mobile/src/components/secretary/ApprovalCard.tsx` | แก้ | onDone(item, removed) · ref guard · ผลแผน N/M · ช่องที่แก้ · บรรทัดลงชื่อ chat.send · canApprove · ป้าย "รออนุมัติ · <ผู้มีสิทธิ์>" |
| `apps/mobile/src/components/secretary/DoneCard.tsx` | แก้ | ปุ่มย้อนต่อแถว (canUndo) → จอเปิดชีตยืนยัน · ตัดปุ่มย้อนรวม/LIFO |
| `apps/mobile/src/components/secretary/EditSheet.tsx` | แก้ | allowlist `sec.field.*` (`hasFieldLabel`) · export `fieldLabel` |
| `apps/mobile/src/components/secretary/StepCard.tsx` | แก้ | สถานะขั้น ✕ FAILED / – SKIPPED (S1.14) |
| `apps/mobile/src/components/secretary/SecTopBar.tsx` | แก้ (เพิ่ม prop) | `showPlus` (STAFF ในโซนทีม = ไม่มี +) — สัญญาเดิมไม่เปลี่ยน |
| `apps/mobile/src/api/secretary.ts` | ขยาย | PATH `inbox/staff` · PATH_ID `rooms/[id]/members` `staff/invites/[id]` `staff/invites/[id]/resend` · `secDeleteRoomMember` · `normalizeStaff`/`ChatLevel`/`StaffPerson`/`StaffInvite` · `updateSecretary` · `normalizeLog` ใช้ `logCanUndo` (canUndo ของเซิร์ฟเวอร์ชนะ) + `link` ระดับแถว · `canApprove` ใน ProposalItem/PlanItem · RoomDetail.members มี role/seeHistory · แผนของห้องมีธง pending · ApproveRes มี results |
| `apps/mobile/src/theme/{light,dark}.ts` | แก้ (เพิ่มคีย์) | `bad.fg` (ป้าย "ไม่เห็นแชทลูกค้า" · ขั้นที่ล้ม · ปุ่มถอด) |
| `apps/mobile/src/i18n/{th,en}.ts` | แก้ | +90 คีย์ `sec.staff.*` (รวม `sec.staff.add.*` ของ D3) `sec.onb.*` `sec.room.*` (§S) `sec.field.*` (+7) · th/en 584 คีย์เท่ากัน (I-1 ของ qc-sec-s2.1 เขียว) · en ไม่มีอักษรไทย (ลายเซ็น en = คำอธิบายภาษาอังกฤษ "(added in Thai)") |
| `apps/mobile/qc/fixtures/secretary/s2.10.json` | ใหม่ | เจ้าของ + 4 คน (ผู้จัดการ REPLY · พนักงาน REPLY / VIEW+เข้าเวร / NONE) + คำเชิญค้าง 1 · ห้อง r2 ร่วม 3 คน (ข้อความระบบ · ฟองสมใจ · การ์ดเอกสารเงินแก้แล้ว มี `contactId`/`boardId` ที่ต้องไม่แสดง) · C1 ยังไม่เคยตั้ง |
| `apps/mobile/qc/fixtures/secretary/s2.4.json` · `s2.4-running.json` · `s2.4-done.json` | แก้ | ค่า S1.14 จริง: `WAITING_APPROVAL`→`WAITING` · done `DONE`(closedAt null)→`OPEN` (เสร็จแต่ยังไม่ปิด) · แผน `status` · ขั้น `WAITING`→`PENDING` · `classes` · `canApprove` · log `link` |
| `apps/mobile/qc/fixtures/secretary/s2.1.json` | แก้ | expect ของ `/secretary/staff` `/secretary/onboarding/name` = testID ของจอจริง + mock `inbox/staff` (ถ่ายชุด S2.1 ซ้ำได้สะอาด) |
| `scripts/sec-ui-inventory.json` | แก้ | +23 แถว S2.10 · แก้ action ของ `sec-room-undo` `sec-room-menu-close` |

## 2. D1 — ข้อมูลและกติกา
- `GET secretary/staff` (S1.14 route = `listStaffAccess(…,{includeInvites:true})` + `staffViewOf`): แถว `pending:false` → `StaffPerson{membershipId,userId,name,role,active,me,units,levels,chat}` · `pending:true` → `StaffInvite{inviteId,name,phoneMasked,role,expiresAt,expired}` (`normalizeStaff`) · ป้ายแชท = `CHAT_LABEL[NONE|VIEW|REPLY]` ในไฟล์จอ · หน่วย = จำนวน unitAccess (ว่าง = ทุกหน่วย · ไม่มีชื่อหน่วยใน DTO)
- สถานะงาน: `GET secretary/rooms` (OWNER `scope=tenant` · คนอื่น `mine`) → นับห้อง RUNNING/WAITING ที่คนนั้นเปิดหรือเป็นสมาชิก · "ห้องร่วมกับคุณ" = ห้องยังไม่ DONE ที่มีทั้งเราและเขา · จุดส้มขวา = จำนวนรออนุมัติ
- เข้าเวร: `GET inbox/staff` (`eligibleResponders` · onDuty) — ล้ม = ไม่แสดง (ไม่ใช่เส้น secretary/* · มีใน SECRETARY-API ตาราง K3)
- ตัวเราไว้ท้ายรายการ (แบบ = รายชื่อทีม) · STAFF: `secretary/staff` ตอบ 403 (คีย์ `settings.staff.read`) ⇒ จอ "เฉพาะเจ้าของ/ผู้จัดการ" · ปุ่ม + แถบบนซ่อน
## 3. D3 — ชีตเพิ่มคน
- รายชื่อ = `secretary/staff` (active · ไม่ใช่เรา · ไม่อยู่ในห้อง · ไม่ใช่ผู้เปิดห้อง) · ติ๊กหลายคน · บรรทัดรอง = สิทธิ์โดยย่อจาก `levels` (เจ้าของ/ผู้จัดการ = "ดูทุกระบบ · อนุมัติได้")
- สวิตช์ "ให้เห็นข้อความเก่าในห้องนี้" = `seeHistory` ปริยาย **ปิด** · ยืนยัน = `POST secretary/rooms/[id]/members {userId, seeHistory}` ต่อคน (ล้มรายคน = ข้อความไทยของเซิร์ฟเวอร์ต่อชื่อ · ชีตค้างไว้) · หลังเพิ่ม/ถอด โหลดห้องใหม่ (ข้อความระบบ 🔔 มาจากเซิร์ฟเวอร์)
- ถอด = ส่วน "อยู่ในห้องแล้ว" ท้ายชีต (canManage) → ชีตยืนยัน → `DELETE secretary/rooms/[id]/members/[userId]` · เพิ่มซ้ำหลังถูกถอด = แถวใหม่ตาม seeHistory ที่เลือก (R-S1.6d) · ชื่อห้อง/บริบทห้องเห็นได้แม้ seeHistory ปิด (หนี้ที่ยอมรับ §J — ไม่แสดงคำเตือนเพิ่ม)
## 4. D2 — ห้องร่วม
- ฟองคนอื่น = `MemberBubble` (อวตาร + "ชื่อ · บทบาท" จาก `room.members`) · ข้อความระบบ = `SystemMsg` (+ เวลาไทย) · ฟองของเรา/เลขา = `Bubble` เดิม
- ป้ายการ์ด (เฉพาะห้องที่มีสมาชิก): "รออนุมัติ · <เรา ถ้า canApprove> + <สมาชิก OWNER/MANAGER>" (≤ 2 ชื่อ) · `canApprove=false` ⇒ ปุ่มอนุมัติปิด + "รอ <ชื่อ> อนุมัติ…"
- บรรทัดสถานะ = "<สถานะ> · N คนในห้อง" (สมาชิก + ผู้เปิด) · ปุ่ม user-plus บนแถบ + เมนู ⋯ "เพิ่มคนเข้าห้อง" เฉพาะ `canManage` และห้องยังไม่ปิด

## 5. ผลข้อสอบ (หลัง merge session/secretary ec757f92 · ทิปเลน 5bc2de0a + ภาพ)
- spec s2.10 forced #1: `JSON_SUMMARY {"total":10,"passed":10,"failed":[],"skipped":[],"findings":[]}` exit 0
- spec s2.10 forced #2: `JSON_SUMMARY {"total":10,"passed":10,"failed":[],"skipped":[],"findings":[]}` exit 0
- spec s2.4 forced: `JSON_SUMMARY {"total":7,"passed":7,"failed":[],"skipped":[],"findings":[]}` exit 0 (ภาพ A3/A4/A5 ถ่ายใหม่บนโค้ดนี้ + fixture ที่ปรับ)
- spec s2.2 forced: `{"total":11,"passed":11,…}` exit 0 · spec s2.7 forced: `{"total":16,"passed":16,…}` exit 0
- `qc-sec-s2.1` forced: `{"total":14,"passed":14,…}` exit 0 · `qc-sec-s2.12` forced: `{"total":13,"passed":13,…}` exit 0
- regression unforced (`qc-sec.sh` + gate lock · SHARK_AI_MOCK=1) เทียบ `sec-baseline-bfad2f15.txt`: qc-mobile-app 38/38 exit 0 · qc-mobile-auth 31/31 exit 0 · qc-mobile-chat 29/29 exit 0 · qc-mobile-authz-hotfix 12/12 exit 0 (= baseline: exit 0 ทั้ง 4 · authz 12/12)
- mobile typecheck 0 (M-1 ในทุกรอบของ spec) · fitness มี env / ไม่มี env ผ่าน (D-1/D-2 ทุกรอบ) · pre-commit fitness ผ่าน

## 6. ภาพ
คำสั่ง (สำเนา/พอร์ตของเลนนี้):
```
bash scripts/iso.sh env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-c QC_PORT=4725 ROUTES=/secretary/staff,/secretary/room/r2,/secretary/onboarding/name FIXTURE=apps/mobile/qc/fixtures/secretary/s2.10.json node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/iso.sh env QC_PREPARE=1 QC_SKIP_EXPORT=1 QC_COPY=/root/qc-shark-mobile-sec-c QC_PORT=4725 ROUTES=/secretary/room/r1 FIXTURE=apps/mobile/qc/fixtures/secretary/s2.4.json node apps/mobile/qc/shoot-sec.mjs --both
(+ s2.4-running / s2.4-done → QC_OUT=apps/mobile/qc/shots-sec/s2.4-<state>) · bash scripts/parity-sec.sh d 1|d 2|c 3|a 3|a 4|a 5 …
cp apps/mobile/qc/shots-sec/s2.10-interaction/README-click.mjs.txt <scratch>/s210-click.mjs && bash scripts/iso.sh node <scratch>/s210-click.mjs $PWD/apps/mobile/qc/fixtures/secretary/{s2.10,s2.4,s2.4-running}.json $PWD/apps/mobile/qc/shots-sec/s2.10-interaction
```
- ภาพคู่ (ผู้คุมดู):
  - D1 ↔ `sec-d.jpg` หน้า 1: `apps/mobile/qc/shots-sec/secretary-staff-d1-pair.png` · มืด `apps/mobile/qc/shots-sec/secretary-staff-dark-d1-pair.png` (`sec-dark-d.jpg` หน้า 1)
  - D2 ↔ `sec-d.jpg` หน้า 2: `apps/mobile/qc/shots-sec/secretary-room-r2-d2-pair.png` · มืด `apps/mobile/qc/shots-sec/secretary-room-r2-dark-d2-pair.png`
  - C1 ↔ `sec-c.jpg` หน้า 3: `apps/mobile/qc/shots-sec/secretary-onboarding-name-c1-pair.png` · มืด `apps/mobile/qc/shots-sec/secretary-onboarding-name-dark-c1-pair.png` (`sec-dark-c.jpg` หน้า 3)
  - D3 ↔ `sec-d.jpg` หน้า 3 (ชีต · ภาพเดี่ยวจากการกดจริง): `apps/mobile/qc/shots-sec/s2.10-interaction/d3-add-sheet.png`
  - ถ่ายใหม่ของ S2.4 (โค้ดห้องเปลี่ยน): A4 `apps/mobile/qc/shots-sec/secretary-room-r1-a4-pair.png` · `…/secretary-room-r1-dark-a4-pair.png` · A3 `apps/mobile/qc/shots-sec/s2.4-running/secretary-room-r1-a3-pair.png` · `…/s2.4-running/secretary-room-r1-dark-a3-pair.png` · A5 `apps/mobile/qc/shots-sec/s2.4-done/secretary-room-r1-a5-pair.png` · `…/s2.4-done/secretary-room-r1-dark-a5-pair.png`
- ภาพเดี่ยว: `apps/mobile/qc/shots-sec/secretary-staff{,-dark}.png` · `secretary-room-r2{,-dark}.png` · `secretary-onboarding-name{,-dark}.png` (summary ok · overflow false · unmocked [] · missing [] ทั้ง 6) · `secretary-room-r1{,-dark}.png` · `s2.4-running/…` · `s2.4-done/…`
- กดจริง `apps/mobile/qc/shots-sec/s2.10-interaction/` (สคริปต์ `README-click.mjs.txt` · ผลดิบ `result.json`): `d1-cancel-confirm.png` · `d1-staff-role-denied.png` · `d3-add-sheet.png` · `d3-remove-confirm.png` · `edit-sheet-allowlist.png` · `edited-fields.png` · `close-confirm.png` · `undo-confirm.png` · `plan-partial.png` · `c1-edited.png`
- ผลกดจริง (หลัง merge · dist ของทิปนี้):
  - D1: แถว 5 · ป้ายแชท ["ตอบได้","ตอบได้","ดูได้","ไม่เห็นแชทลูกค้า","ตอบได้"] · คำเชิญค้าง 1 · ส่งอีกครั้ง `POST staff/invites/inv1/resend {}` + "ส่งคำเชิญอีกครั้งแล้ว" · ยกเลิก: ก่อนยืนยัน DELETE 0 → ยืนยัน 1 · แตะแถวแรก → `/secretary/staff/m2` · บทบาท STAFF (403) ⇒ `sec-staff-denied` + ไม่มี `sec-staff-invite` (DOM มี `sec-top-new` 1 ตัว = จอ `/secretary` ที่ stack วางไว้ใต้ตาม `initialRouteName` R-S2.1a — ภาพ `d1-staff-role-denied.png` ไม่มี +)
  - D3: ผู้เลือกได้ = ก้อง · ยิ่ง (ตัดเรา/ผู้เปิด/สมาชิกเดิม) · ติ๊ก 2 คน → ปุ่ม "เพิ่ม 2 คน" → **2 POST** `{"userId":"u-qc-kong","seeHistory":false}` · `{"userId":"u-qc-ying","seeHistory":false}` · ชีตปิด · ถอด: ก่อนยืนยัน DELETE 0 → ยืนยัน `DELETE rooms/r2/members/u-qc-2` 1
  - §S: ดูตาราง §7 (ค่าจาก `result.json`)
  - C1: ค่าเริ่มต้น "Shark" · พิมพ์ Nana + ค่ะ ⇒ ตัวอย่าง "สวัสดีค่ะ คุณสุข Nana เลขาของคุณพร้อมแล้วค่ะ …" · ปุ่ม "เริ่มใช้ Nana" · บันทึก → `PUT secretary {"name":"Nana","suffix":"ค่ะ","tone":"polite"}` → `/secretary` · ข้าม → `/secretary` PUT 0

### จุดต่างจากแบบ (ภาพคู่)
| จอ | ต่าง | เหตุ |
|---|---|---|
| D1 | บทบาทเป็น เจ้าของ/ผู้จัดการ/พนักงาน (ไม่ใช่ตำแหน่ง "ฝ่ายขาย/บาริสต้า") · หน่วย = "1 หน่วย"/"ทุกหน่วย" (ไม่ใช่ชื่อสาขา) | DTO staff มีแค่ role + unitAccess (id) |
| D1 | มีแถวของเราเอง (ท้ายรายการ) · ปุ่ม + บนแถบ (โซนทีม = เชิญ ตาม S2.1) · ไม่มี "เสร็จวันนี้ N" / "ค่าเริ่มต้นพนักงานใหม่" | เซิร์ฟเวอร์ส่งทุก Membership · rooms ไม่มีเวลาเสร็จต่อคน |
| D1 | แถวคำเชิญค้างอยู่ใต้รายชื่อ (เลื่อนลงเห็น · ภาพแรกโดนปุ่มล่างบัง) | แบบไม่มีแถว pending · ใบสั่งบังคับ |
| D2 | ภาพเลื่อนไปที่การ์ดรออนุมัติ (ข้อความแรก + ข้อความระบบอยู่เหนือจอ) | พฤติกรรม S2.4 (ไปสิ่งที่ต้องทำ) |
| D2 | การ์ด = ชื่อชนิดงาน + summary เต็ม + กล่อง "ช่องที่แก้แล้ว" + why + สวิตช์ล็อก (ไม่มีราคาแยกขวา) · ปุ่ม "อนุมัติ" (ไม่ใช่ "อนุมัติและส่ง" เพราะไม่ใช่ customerFacing) | DTO ไม่มี payload ดิบ (X10) · R-K3b · §S |
| D2 | แถบบนมีทั้ง user-plus และ ⋯ | spec s2.4 บังคับ `sec-room-menu` + s2.10 บังคับ `sec-room-add-member` |
| D3 | มีส่วน "อยู่ในห้องแล้ว" + ปุ่มถอด ใต้ปุ่มเพิ่ม | ใบสั่ง (ถอด + ยืนยัน) |
| C1 | มีปุ่ม "ข้าม" มุมขวา · น้ำเสียง "สั้นกระชับ" (แบบ: "ทางการ") | ใบสั่ง (ข้าม = ค่าปริยาย) · ค่าน้ำเสียงของเซิร์ฟเวอร์ = polite/friendly/brief |
| ทุกจอ | ตัวอักษร/ปุ่มใหญ่กว่าแบบตามสัดส่วน | R-UI1 |

## 7. §S — ตารางปิดงาน (R-S2.4a–f)
| ข้อ | เรื่อง | ทำที่ | หลักฐาน | สถานะ |
|---|---|---|---|---|
| R-S2.4a | ย้อนต่อแถว + ชีตยืนยันบอกชื่อรายการ · ใช้ `canUndo` ของเซิร์ฟเวอร์ | `DoneCard.tsx` (ปุ่มต่อแถว `undoable = l.canUndo && !l.undoneAt`) · `secretary.ts normalizeLog` → `logCanUndo` (boolean ของเซิร์ฟเวอร์ชนะ · ไม่มี = เทียบ undoableUntil รุ่นเก่า) · `[id].tsx` ชีต `sec-room-undo-confirm` | กดจริง: ก่อนยืนยัน POST 0 · ชีตแสดง summary ของแถว · ยืนยัน → `POST log/l1/undo {}` + note · `canUndo:false` + undoableUntil 2099 ⇒ ไม่มีปุ่ม | CLOSED |
| R-S2.4b | poll วิ่งอยู่ = ธง rerun · ok ⇒ เอาการ์ดออกทันที · ok:false/409/410 ⇒ reload ทันที | `[id].tsx load()` (`rerun` ref · do/while ทิ้งผลเก่า) · `onDone(item, removed)` · `ApprovalCard stale()` | กดจริง: การ์ด 1 → 0 ที่ 600 ms ขณะ GET proposals ถูกหน่วง 3 วิ · ok:false ⇒ GET ห้อง 1→2 ทันที + note | CLOSED |
| R-S2.4c | แผน "ทำแล้ว N/M" + note ขั้นแรกที่ล้ม · doneCount>0 ⇒ reload | `ApprovalCard.approve` (plan) | กดจริง: flash "ทำแล้ว 1/2 ขั้น · ขั้นที่ล้ม: ยังไม่ได้ตั้งเลขผู้เสียภาษี" + reload | CLOSED |
| R-S2.4d | การ์ดแสดงฟิลด์ที่แก้จาก `res.input` · EditSheet เฉพาะคีย์ที่มี `sec.field.*` | `ApprovalCard` (`editedInput` ← res.input · กล่อง `-fields`) · `EditSheet.editableFields/hasFieldLabel` | กดจริง: ช่องในชีต = title, note (ไม่มี contactId/boardId) · patch `{note}` · การ์ดแสดง "หมายเหตุ: เครดิต 45 วัน (โทรยืนยัน)" จาก res.input | CLOSED |
| R-S2.4e | AppState background หยุด poll + backoff ออฟไลน์ · cmid ใหม่หลังแก้ร่างที่ส่งล้ม + แจ้ง duplicate · ปิดห้องยืนยัน · ref guard | `[id].tsx` (setTimeout chain · `active` จาก AppState · `failCount` ×2 ถึง 60 วิ · `failedText` · `sendingRef`/`actRef`) · `ApprovalCard busyRef` · `AddMemberSheet busyRef` · ชีต `sec-room-close-confirm` | กดจริง: ซ่อนหน้า 11 วิ = GET 2→2 · กลับมา 800 ms = 3 · ออฟไลน์ช่วงห่าง 5.0/10.0/20.0 วิ · ส่งซ้ำข้อความเดิม = cmid เดิม · แก้ร่าง = cmid ใหม่ · duplicate ⇒ "ข้อความนี้ส่งไปแล้ว — ไม่ส่งซ้ำ" · ปิดห้อง: ก่อนยืนยัน POST 0 → ยืนยัน `{}` | CLOSED |
| R-S2.4f | การ์ด chat.send แสดงบรรทัดลงชื่อที่จะต่อท้าย | `ApprovalCard` (`kind === "chat.send"` → `-signature`) · i18n `sec.room.ap.signature` = ข้อความเดียวกับ `CHAT_SEND_SIGNATURE` | กดจริง: "บรรทัดลงชื่อที่จะต่อท้ายข้อความ / — ข้อความนี้ส่งโดย Shark ผู้ช่วย AI ของร้าน" | CLOSED (ข้อความคัดลอกจากเซิร์ฟเวอร์ — ถ้าเซิร์ฟเวอร์เปลี่ยนต้องแก้ i18n · ดู §8) |
| สัญญา S-5 | fixture s2.4* ใช้ RoomStatus/DTO จริง | fixtures s2.4* (§1) · `normStatus` เดิมยังรับรูปเก่า | spec s2.4 เขียว 7/7 · ภาพถ่ายใหม่ | CLOSED |

## 8. หนี้ / คำขอ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| บรรทัดลงชื่อ chat.send คัดลอกเป็น i18n (เซิร์ฟเวอร์ไม่ส่ง) | ถ้าเปลี่ยน `CHAT_SEND_SIGNATURE` ต้องแก้ th.ts ด้วย — เสนอ DTO-REQ: proposalDto ของ chat.send ส่ง `signature` | S1.14 (ผู้คุมตัดสิน) |
| D1 ไม่มีชื่อหน่วย/ตำแหน่งงาน · "เสร็จวันนี้" ต่อคน | DTO staff มีแค่ unitAccess id + role | S2.22 / DTO ภายหลัง |
| AddMemberSheet ไม่ได้เรียก `GET rooms/[id]/members` (ใช้ `room.members` ของ GET ห้อง · สัญญาเดียวกัน) | ลดเส้นที่ยิง · ห้องโหลดใหม่หลังเพิ่ม/ถอด | — |
| ป้ายผู้อนุมัติเดาจากบทบาทสมาชิก (+ canApprove ของเรา) | เซิร์ฟเวอร์ไม่ส่งรายชื่อผู้อนุมัติได้ต่อข้อเสนอ — เสนอ DTO-REQ `approvers[]` | S1.14 |
| สวิตช์ seeHistory บนเว็บ QC ไม่มี `aria-checked` (ตรวจด้วย body ของ POST แทน) | `Toggle` ของ S2.7 ใช้ accessibilityState | — |
| ปุ่มเชิญ/ส่งอีกครั้งยังไม่มีจอ G2/G3 (S2.21/S2.22 ใช้ route เดียวกัน) | นอกใบ | S2.21 · S2.22 |

## ต่อจากนี้ (ถ้า restart)
แก้จอแล้ว: รันบล็อก §6 (export ใหม่) → `bash scripts/iso.sh env QC_FORCE=1 SPEC=scripts/qc-sec-specs/s2.10.json pnpm exec tsx scripts/qc-sec-screen.mts` (+ s2.4)
