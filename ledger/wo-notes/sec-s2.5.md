# WO S2.5 + S2.6 (ชุด S2-5) — กล่องรวมรออนุมัติ A6 · งานประจำ A7 · push → deep-link

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-d` branch `wip/sec-s2.5` (ฐาน = ทิปผู้คุม 0267be7f (S2.1+S2.2/S2.3+S2.4+S2.12) + merge ทิปใหม่ b7dc15c8 ตาม COMMON A.11) · 2026-11-04 UTC · builder: ตัวแทน
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.5.md` (+ COMMON + RESOLUTIONS §F §K §L.2 §N §Q) · ภาพคู่: A6 = `sec-a.jpg` หน้า 6 · A7 = `sec-a.jpg` หน้า 7 (+ `sec-dark-a.jpg` หน้าเดียวกัน) · A8 (หน้า 8 = แจ้งเตือนบนจอล็อก) เป็นภาพระบบปฏิบัติการ ไม่มีจอในแอปให้จับคู่ — ส่วนของแอปคือ handler ของ S2.6
> ข้อสอบ: `SPEC=scripts/qc-sec-specs/s2.5.json scripts/qc-sec-screen.mts` (9 ข้อ · **ไม่แก้ spec/oracle**) · สัญญาเส้น: S1.14 ยังไม่ merge (ไม่มี `s1.14` ใน `git log` ของทิป) ⇒ อ่าน `wip/sec-s1.14` อ่านอย่างเดียว (`docs/api/SECRETARY-API.md` · `src/lib/ai/secretary/{inbox,dto,notify,worker}.ts` · `src/app/api/mobile/secretary/scheduled/**` · `src/lib/ai/scheduled.ts`)

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ดูภาพคู่ + ผู้ตรวจ) — ไม่ push

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `apps/mobile/app/(app)/secretary/inbox.tsx` | เขียนใหม่ (แทน SecSkeleton) | A6: GET `secretary/inbox?take=100` **ไม่ส่ง x-tenant-id** · แท็บ 4 (ทั้งหมด/เงิน/ส่งลูกค้า/ลบ-ยกเลิก + ตัวนับ) · จัดกลุ่มตามกิจการ (หัวกลุ่ม = ชื่อร้าน) · อนุมัติ/ตีกลับต่อรายการด้วย `x-tenant-id` = tenantId ของรายการ (ไม่สลับร้าน active) · ยืนยัน 2 ชั้น + ชีตตีกลับ C4 = `useApprovalFlow` ของ S2.4 · canApprove=false ⇒ ปุ่มปิด + บรรทัดเหตุผล · แตะรายการ ⇒ switchTenant (ถ้าต่าง · เฉพาะร้านที่เป็นสมาชิก) แล้ว `/secretary/room/[roomId]` (ไม่มีห้อง = `/chat/[conversationId]`) · บรรทัดรอง "N รายการ · ทุกกิจการ · คุณอนุมัติได้ K" (K = `inbox/count.canApprove` จาก store กลาง) · ว่าง = การ์ด "ไม่มีงานรออนุมัติ" · flash 4 วิ |
| `apps/mobile/app/(app)/secretary/scheduled.tsx` | เขียนใหม่ | A7: GET `secretary/scheduled` ({items,max}) · แถว: คำสั่ง · ความถี่+เวลา (hourBkk) + ช่องทาง · รอบถัดไป (วันนี้/พรุ่งนี้/วัน/วันที่) · สวิตช์ (PUT `{active}` · ล้ม = คืนค่า+ข้อความ) · งานของคนอื่น: OWNER = เปิด/ปิด/ลบได้ (ชีตล็อก) · คนอื่น = อ่านอย่างเดียว · เพิ่ม: เต็ม max ⇒ ข้อความเพดาน (ไม่เปิดชีต) · แก้ = POST ใหม่ + DELETE เดิม (เต็มเพดาน ⇒ DELETE ก่อน · POST ล้ม ⇒ ตั้งของเดิมคืน) · ลบ = ยืนยันในชีตก่อน · ไม่มีรายเดือนในตัวเลือก |
| `apps/mobile/src/components/secretary/InboxItem.tsx` | ใหม่ | การ์ด A6: ป้ายระบบ+ชนิดงาน+เวลา · สรุปแยก "หัว · รายละเอียด" · why (เมื่อ canApprove) · บรรทัดเหตุผล (canApprove=false) · note ผลเซิร์ฟเวอร์ · ดู / ตีกลับ / อนุมัติ(และส่ง) |
| `apps/mobile/src/components/secretary/ScheduleSheet.tsx` | ใหม่ | ชีตเพิ่ม/แก้: คำสั่ง · ทุกวัน/ทุกสัปดาห์ (+วัน อา.–ส.) · ชั่วโมง 0–23 · push/room (ปริยายทั้งคู่) · ตรวจช่องว่าง (ไทย) · ข้อความ 400 ของเซิร์ฟเวอร์ · ลบ 2 ขั้น · โหมดล็อก (งานคนอื่น/รายเดือน: แสดงคำสั่ง + ลบ) |
| `apps/mobile/src/lib/push-register.ts` | เพิ่ม (S2.6) | `secretaryRouteFromLink` (pure · ตัด `?e=`/`#` · 5 แบบ: `/secretary/room/<id>` `/secretary/inbox` `/secretary/scheduled` `/secretary/help/<id>` (+`/help/<id>` ของเซิร์ฟเวอร์) `/customers/<id>`) · `handleSecretaryPush(resp, deps)` (data.tenantId ต่าง + เป็นสมาชิก ⇒ switchTenant แล้ว push · จำ identifier กันเปิดซ้ำ) · `openLastSecretaryPush` (เปิดแอปจากแจ้งเตือนตอนแอปปิด · เปิดแล้ว `clearLastNotificationResponse`) · `syncAppBadge` (GET `secretary/badge` → `setBadgeCountAsync` · เว็บข้าม) |
| `apps/mobile/app/(app)/_layout.tsx` | เพิ่มอย่างเดียว (hot file · ดู §7) | import + ref ของ auth ให้ handler · `if (handleSecretaryPush(resp, …)) return;` บรรทัดแรกของ listener เดิม · badge ตอนเปิด/foreground · บรรทัดเดิมคงครบ (s2.1 L-1 ผ่าน) |
| `apps/mobile/src/api/secretary.ts` | ขยาย | PATH + `secretary/inbox` `secretary/scheduled` `secretary/badge` · PATH_ID + `secretary/scheduled/[id]` · `USER_LEVEL` (me · inbox ไม่ส่ง x-tenant-id) · `secPostId(…, {tenantId})` · `secPutId`/`secDeleteId` · `normalizeInbox`/`inboxClassOf`/`inboxToApproval` · `normalizeTasks`/`nextRunOf` (pure · now ฉีดได้) · `fetchAppBadge` |
| `apps/mobile/src/api/client.ts` | แก้ 2 บรรทัด (นอกรายการ) | `ApiOpts.tenantId` = ใส่ x-tenant-id ของร้านที่ระบุแทนร้าน active (ไม่มี = เหมือนเดิม) |
| `apps/mobile/src/components/airy/Tabs.tsx` | แก้ 2 บรรทัด (นอกรายการ) | `TabItem.testID?` (ปริยายเดิม `${testID}-${key}`) — spec ต้องเห็น testID แท็บเป็น literal ในไฟล์จอ |
| `apps/mobile/src/i18n/{th,en}.ts` | แก้ | +72 คีย์ `sec.inbox.*` `sec.sched.*` (th/en ชุดเดียวกัน) |
| `apps/mobile/qc/fixtures/secretary/s2.5.json` | ใหม่ | 2 ร้าน 5 รายการ (เงิน · คืนมัดจำ ร้าน t2 · ส่งลูกค้า · ลบถาวร · แผนที่อนุมัติไม่ได้) · งานประจำ 3 (ทุกวัน · ทุกสัปดาห์ · ของคนอื่นที่ปิดอยู่) |
| `apps/mobile/qc/fixtures/secretary/s2.1.json` | แก้ (นอกรายการ) | expect ของ `/secretary/inbox` `/secretary/scheduled` เป็น testID จอจริง + mock 2 เส้น (ถ่ายชุด S2.1 ซ้ำได้สะอาด · แบบที่ S2.4 ทำกับ room) |
| `apps/mobile/qc/push-link-test.mjs` | ใหม่ | ทดสอบ handler ด้วย NotificationResponse ปลอม (esbuild รวม push-register.ts + ตัวปลอมของ expo-notifications/expo-device/expo-constants/react-native/api client) |
| `scripts/sec-ui-inventory.json` | แก้ (นอก apps/mobile) | +29 แถวปุ่มของ S2.5 |

## 5. ผลข้อสอบ
- spec oracle forced #1 (ก่อนแก้): แดง X-1 `{"miss":["canApprove"]}` (คำนี้อยู่แค่ใน InboxItem) ⇒ ย้ายการตัดสินเข้าไฟล์จอ (`canApprove={r.canApprove}` + guard ก่อนอนุมัติ/ตีกลับ · ไม่แตะ spec)
- spec oracle forced #1 (หลัง merge ทิป b7dc15c8): `JSON_SUMMARY {"total":9,"passed":9,"failed":[],"skipped":[],"findings":[]}` exit 0
- spec oracle forced #2: `JSON_SUMMARY {"total":9,"passed":9,"failed":[],"skipped":[],"findings":[]}` exit 0
- `qc-sec-s2.1` forced: `{"total":14,"passed":14,…}` exit 0 · `qc-sec-s2.12` forced: `{"total":13,"passed":13,…}` exit 0 · spec s2.2 forced: `{"total":11,"passed":11,…}` exit 0 · spec s2.4 forced: `{"total":7,"passed":7,…}` exit 0
- push handler: `pnpm exec node apps/mobile/qc/push-link-test.mjs` → `JSON_SUMMARY {"total":9,"passed":9,"failed":[]}` exit 0
- regression unforced (qc-sec.sh + gate lock · SHARK_AI_MOCK=1) เทียบ `ledger/qc-baseline/sec-baseline-bfad2f15.txt`: เท่าเดิมทั้ง 4 (§5.1)
- mobile typecheck 0 (M-1 ของทุก oracle ข้างบน + `npm run typecheck` ใน iso) · fitness D-1 (มี env) / D-2 (ไม่มี env) ผ่านทุกรอบ · pre-commit fitness ผ่าน

### 5.1 regression
รันหลัง qc:all ของผู้คุมปล่อย gate lock (`bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env SHARK_AI_MOCK=1 pnpm exec tsx scripts/<t>.mts`) = baseline ทุกตัว: qc-mobile-app 38/38 exit 0 · qc-mobile-auth 31/31 exit 0 · qc-mobile-chat 29/29 exit 0 (push-register เดิม) · qc-mobile-authz-hotfix 12/12 `JSON_SUMMARY {"total":12,"passed":12,"findings":[]}` exit 0

## 6. ภาพ
คำสั่ง (สำเนา/พอร์ตของเลนนี้):
```
bash scripts/iso.sh env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4724 ROUTES=/secretary/inbox,/secretary/scheduled FIXTURE=apps/mobile/qc/fixtures/secretary/s2.5.json node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/parity-sec.sh a 6 apps/mobile/qc/shots-sec/secretary-inbox.png apps/mobile/qc/shots-sec/secretary-inbox-a6-pair.png   (+ -dark … --dark)
bash scripts/parity-sec.sh a 7 apps/mobile/qc/shots-sec/secretary-scheduled.png apps/mobile/qc/shots-sec/secretary-scheduled-a7-pair.png   (+ -dark … --dark)
cp apps/mobile/qc/shots-sec/s2.5-interaction/README-click.mjs.txt <scratch>/s25-click.mjs && bash scripts/iso.sh node <scratch>/s25-click.mjs $PWD/apps/mobile/qc/fixtures/secretary/s2.5.json $PWD/apps/mobile/qc/shots-sec/s2.5-interaction
pnpm exec node apps/mobile/qc/push-link-test.mjs
```
- ภาพคู่ (U-1):
  - A6 ↔ `sec-a.jpg` หน้า 6: `apps/mobile/qc/shots-sec/secretary-inbox-a6-pair.png` · มืด ↔ `sec-dark-a.jpg` หน้า 6: `apps/mobile/qc/shots-sec/secretary-inbox-dark-a6-pair.png`
  - A7 ↔ `sec-a.jpg` หน้า 7: `apps/mobile/qc/shots-sec/secretary-scheduled-a7-pair.png` · มืด ↔ `sec-dark-a.jpg` หน้า 7: `apps/mobile/qc/shots-sec/secretary-scheduled-dark-a7-pair.png`
- ภาพเดี่ยว: `apps/mobile/qc/shots-sec/secretary-inbox{,-dark}.png` · `apps/mobile/qc/shots-sec/secretary-scheduled{,-dark}.png` (summary ok · overflow false · unmocked [] · missing [])
- กดจริง `apps/mobile/qc/shots-sec/s2.5-interaction/`: `inbox-cannot-approve.png` · `inbox-confirm2x.png` · `inbox-reject-sheet.png` · `inbox-empty.png` · `sched-sheet-new.png` · `sched-sheet-weekly.png` · `sched-sheet-edit.png` · `sched-sheet-locked.png` · `sched-delete-confirm.png` · `sched-cap.png` · `sched-empty.png` · ผลดิบ `result.json`
- ผลกดจริง (`result.json`):
  - GET inbox: `?take=100` · x-tenant-id **null** · การ์ด 5 ใน 2 กลุ่ม · แท็บ เงิน 2 / ส่งลูกค้า 1 / ลบ 1 / ทั้งหมด 5
  - แผน canApprove=false: approve/reject `aria-disabled=true` · บรรทัด "ต้องให้เจ้าของหรือผู้จัดการ…" · กดแล้ว POST 0 ครั้ง
  - อนุมัติ p-quote (ร้าน t1): body `{}` header **t1** → flash "ออกใบเสนอราคาแล้ว" · อนุมัติ p-refund (ร้าน t2 ขณะ active t1): body `{}` header **t2** · active ยังเป็น t1 · โหลดกล่องใหม่หลังแต่ละครั้ง
  - ลบถาวร p-del: `{}` → needsSecondConfirm ⇒ ชีต `sec-inbox-confirm2x` → `{"confirm2x":true}` header t1 · ok:false (p-review) ⇒ note "รายการนี้หมดอายุแล้ว" บนการ์ด
  - ตีกลับ p-refund (C4 · แค่งานนี้): body `{"remember":"JOB"}` header **t2**
  - แตะรายการร้าน t2 ⇒ `shark_tenant` = t2 · URL `/secretary/room/r2` · GET rooms/r2 ส่ง header t2 · แตะ "ดู" รายการร้าน t1 ⇒ `/secretary/room/r1` ไม่สลับ · ว่าง ⇒ `sec-inbox-empty`
  - งานประจำ: GET header t1 · สวิตช์ st1 ⇒ PUT `{"active":false}` · aria-checked false · PUT ล้ม (404) ⇒ สวิตช์คืนเป็น true + ข้อความเซิร์ฟเวอร์ "ไม่พบงานประจำนี้"
  - เพิ่ม: บันทึกว่าง ⇒ "พิมพ์สิ่งที่ให้ทำก่อน" · ทุกสัปดาห์ไม่มีวัน ⇒ "เลือกอย่างน้อย 1 วัน" · ไม่มีปุ่มรายเดือน · POST `{"instruction":"สรุปรีวิวใหม่ของสัปดาห์","hourBkk":18,"frequency":"WEEKLY","days":[1,3],"channels":["room"]}` → flash "บันทึกงานประจำแล้ว" ชีตปิด · 400 ไทยของเซิร์ฟเวอร์แสดงในชีต
  - แก้ st1 (ยังไม่เต็ม) ⇒ `POST {…hourBkk:7…}` แล้ว `DELETE st1` · เต็ม (max 3) ⇒ `DELETE st1` → `POST` (ล้ม 400) → `POST` ของเดิม (hourBkk 8) คืน + ข้อความในชีต
  - เพิ่มตอนเต็ม (3/3) ⇒ `sec-sched-cap` "ตั้งงานประจำได้สูงสุด 3 รายการต่อกิจการ…" · ชีตไม่เปิด · POST 0
  - ลบ st2: กด "ลบงานประจำ" ⇒ DELETE 0 ครั้ง (ถามก่อน) → ยืนยัน ⇒ `DELETE st2` → flash "ลบงานประจำแล้ว"
  - งานคนอื่น (st3): OWNER ⇒ ชีตล็อก (ไม่มีบันทึก · มีลบ) · STAFF ⇒ สวิตช์ `aria-disabled=true` · กดสวิตช์/แถวไม่ยิง PUT ไม่เปิดชีต
- push handler (`push-link-test.mjs` · P-1…P-9): ห้อง (+tenantId ร้านอื่น ⇒ switch t2 แล้ว push · conversationId ไม่ทำให้หลุดไป /chat) · inbox (`?e=` ตัด) · customers (ร้านเดิม ไม่สลับ) · scheduled (ร้านที่ไม่ได้เป็นสมาชิก ⇒ ไม่สลับ) · help (`/help/c7` → `/secretary/help/c7`) · ลิงก์อื่น 8 แบบ (`/inbox/…?e=assigned` · CRM · `//host` · `https://…` · `..` · ว่าง · null · ตัวเลข) ⇒ false · ใบเดิมซ้ำ = เปิดครั้งเดียว · เปิดแอปจากแจ้งเตือน = เปิด + ล้าง 1 ครั้ง (ลิงก์อื่นไม่ล้าง) · badge = ตั้ง 3 / null-ล้ม ไม่ตั้ง

### จุดต่างจากแบบ (ภาพคู่)
| จอ | ต่าง | เหตุ |
|---|---|---|
| A6 | ไม่มียอดเงินแยกคอลัมน์ขวา · หัว = ส่วนก่อน " · " ของ summary · บรรทัดรอง = ส่วนที่เหลือ | DTO inbox ไม่มี payload/amount (มีแค่ summary ปิด PII ≤200) |
| A6 | หัวกลุ่มชื่อร้าน (SectionLabel) แทนชื่อร้านในหัวการ์ด · หัวการ์ด = ป้ายระบบ + ชื่อชนิดงาน | ใบสั่ง "จัดกลุ่มตามร้าน (หัวกลุ่ม = ชื่อร้าน)" |
| A6 | ปุ่ม ดู / **ตีกลับ** / อนุมัติ (แบบ: ดู / แก้ / อนุมัติ) | ใบสั่งให้อนุมัติ/ตีกลับต่อรายการ · แก้ต้องมี input (ไม่มีใน DTO inbox) ⇒ แก้ในห้อง |
| A6 | กล่อง why ขึ้นต้น "ทำไมต้องอนุมัติ:" · ไม่มี "ทุกกิจการ ⌄" (ตัวกรองร้าน) และข้อความ "แตะตัวเลข…" | why มีเฉพาะ canApprove (inboxForUser) · ตัวกรองร้าน = รุ่นถัดไป (มี `tenantId` query แล้ว) |
| A6 | แท็บที่ 4 ล้นขวา (เลื่อนได้) | ตัวอักษรตาม tokens (R-UI1) |
| A7 | ไม่มีป้ายระบบใต้แถว · บรรทัดรอง = ความถี่+เวลา · ช่องทาง (ไม่มี "อ่านอย่างเดียว/ร่างข้อความ…") | DTO งานประจำไม่มีระบบ/ชนิดงาน |
| A7 | บรรทัด "ตั้งโดยคนอื่นในทีม" ใต้งานของคนอื่น · สวิตช์ปิดเป็นสีเทา | ใบสั่ง (อ่านอย่างเดียว เว้น OWNER) |
| ทุกจอ | ตัวอักษร/ปุ่มใหญ่กว่าแบบตามสัดส่วน · ชีตโปร่ง (เห็นข้างหลังบนเว็บ QC) | R-UI1 · หนี้ Sheet เดิม (S2.20) |

## 7. มติทางเทคนิค / ส่วนต่างจากใบ
- **ชื่อไฟล์ API:** ใบเขียน `src/lib/secretary-api.ts` — ของจริงคือ `src/api/secretary.ts` (ตาราง PATH ของ S2.1–S2.4) ใช้ไฟล์เดิม
- **x-tenant-id ต่อรายการ:** เพิ่ม `ApiOpts.tenantId` ใน `src/api/client.ts` (2 บรรทัด · ค่าเดิมไม่เปลี่ยน) แทนการเขียน fetch ซ้ำ
- **`(app)/_layout.tsx` (hot file ที่ใบไม่ได้ระบุ):** จำเป็น — push ห้องเลขาของเซิร์ฟเวอร์ (`worker.ts pushRoom`) ส่ง `conversationId` มาด้วย ⇒ listener เดิมจะเปิด `/chat/<cid>` (จอ 1.0) ก่อน · ใส่ `handleSecretaryPush` เป็นบรรทัดแรกของ listener เดิม (เพิ่มอย่างเดียว · ทุกบรรทัดเดิมอยู่ครบ · qc-sec-s2.1 L-1 ผ่าน)
- **`/inbox/<convId>?e=…` (แชทลูกค้า S1.24) ไม่แปลงเป็น `/customers/<id>`** — จอ customers/[id] ยังเป็นโครง (S2.18) ⇒ คงทางเดิม conversationId → `/chat` · S2.18 ค่อยเพิ่มแถว `/inbox/` ใน `SEC_LINKS`
- **`/help/<caseId>`** ของเซิร์ฟเวอร์ (SECRETARY-API บรรทัด 117) → `/secretary/help/<id>`
- **ตีกลับปิดเมื่อ canApprove=false ด้วย** (ไม่ใช่แค่อนุมัติ) — เส้น reject ใช้ด่านผู้ยืนยันเดียวกัน · ไม่ให้กดแล้วโดนปฏิเสธ
- **ชั้นแท็บ:** DTO inbox ไม่มี `class` ⇒ กระจกของ `kind-class.ts` ฝั่งแอป (`inboxClassOf`) · destructive = `risk === "DESTRUCTIVE"` · ถ้าเซิร์ฟเวอร์ส่ง `class` มา = ใช้ของเซิร์ฟเวอร์ · แผนไม่มี kind ⇒ อยู่แท็บทั้งหมดเท่านั้น (DTO-REQ-4)
- **แก้งานประจำ = ตั้งใหม่ + ลบเดิม** (PUT รุ่นนี้รับแค่ `active` · 400 not_supported) · งานเดิมปิดอยู่ ⇒ PUT `{active:false}` ให้ตัวใหม่ · OWNER แก้เวลา/ความถี่ของงานคนอื่นไม่ได้ (การตั้งใหม่จะย้ายเจ้าของเป็น OWNER) — เปิด/ปิด/ลบได้
- **งานรายเดือน** (ตั้งจากเว็บ/lib ได้): แอปแสดงอย่างเดียว "ทุกเดือน วันที่ …" · แก้ไม่ได้ (ชีตล็อก) · ไม่มีตัวเลือกรายเดือนในชีต (X-2)
- **badge ไอคอนแอป:** เฉพาะ iOS/Android (เว็บไม่มี badge และไม่ยิงเส้นเพิ่มในจอ QC) · ตอนเข้าโซนกิจการ + กลับมา foreground
- ทางที่เรียกโมเดลเพิ่ม: ไม่มี · สิทธิ์: ไม่เปลี่ยน (ทุกการตัดสินอยู่ที่เซิร์ฟเวอร์ · แอปปิดปุ่มตาม canApprove/mine/role เพื่อ UX เท่านั้น)

## 8. หนี้ / คำขอ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| **DTO-REQ-4** inbox items เพิ่ม `class {money, customerFacing, destructive, piiExport}` (จาก `classOfKind`) + แผนส่ง kinds/class รวม | แท็บเงิน/ส่งลูกค้าตอนนี้เดาฝั่งแอปจากตารางกระจก (ไม่รู้ module ของ kind ที่มาจากทะเบียน op) · แผนไม่เข้าแท็บใดเลย | S1.14 (ผู้คุมตัดสิน) |
| **DTO-REQ-5** push ของห้อง/อนุมัติ/งานประจำใส่ `data.tenantId` (worker `pushRoom` ไม่มี) | ไม่มี ⇒ แตะแจ้งเตือนของร้านอื่นเปิดในร้าน active ⇒ จอห้องตอบ "ไม่พบห้อง" | S1.14/S1.23 |
| **DTO-REQ-6** `PUT scheduled/[id]` รับ hourBkk/frequency/days/channels (update ใน lib) | ตอนนี้แก้ = ลบ+ตั้งใหม่ (id/lastRunDay/เจ้าของเปลี่ยน · ช่วงสั้น ๆ ที่ไม่มีงานเมื่อเต็มเพดาน) | S1.9/S1.14 |
| inbox DTO ไม่มี amount/payload สรุป | ยอดเงินแยกคอลัมน์แบบ A6 ไม่มีแหล่ง | S1.14 (ถ้าต้อง) |
| ตัวกรองร้าน "ทุกกิจการ ⌄" | `inbox?tenantId=` มีแล้ว — UI รุ่นถัดไป | S2.x |
| `/inbox/<convId>` → `/customers/<id>` ใน `SEC_LINKS` | จอแชทลูกค้า K2 ยังเป็นโครง | S2.18 |
| ชีตโปร่งบนเว็บ QC | หนี้ Sheet เดิม | S2.20 |

## ต่อจากนี้ (ถ้า restart)
แก้จอแล้ว: รันบล็อก §6 → `bash scripts/iso.sh env QC_FORCE=1 SPEC=scripts/qc-sec-specs/s2.5.json pnpm exec tsx scripts/qc-sec-screen.mts`
