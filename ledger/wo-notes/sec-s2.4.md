# WO S2.4 (ชุด S2-4) — ห้องงาน A3 · A4 · A5 · C4

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-d` branch `wip/sec-s2.4` (ฐาน 9b5e4f7d + merge ทิปผู้คุม fb7593f2 = S2.12 ตาม COMMON A.11) · 2026-11-04 UTC · builder: ตัวแทน
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.4.md` (+ COMMON + RESOLUTIONS §F §J §K §M R-K3b R-S1.8a) · ภาพ `sec-a.jpg` หน้า 3 (A3) · หน้า 4 (A4) · หน้า 5 (A5) + `sec-dark-a.jpg` หน้าเดียวกัน · C4 = `sec-c.jpg` หน้า 5
> ข้อสอบ: `SPEC=scripts/qc-sec-specs/s2.4.json scripts/qc-sec-screen.mts` (7 ข้อ · **ไม่แก้ spec/oracle**) · สัญญาเส้น/DTO: S1.14 ยังไม่ merge ⇒ อ่านของจริงจาก `wip/sec-s1.14` (อ่านอย่างเดียว · `docs/api/SECRETARY-API.md` + `src/lib/ai/secretary/dto.ts` ของ branch นั้น) — ทุกเส้นอยู่ในตาราง `PATH`/`PATH_ID` ของ `src/api/secretary.ts`

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ดูภาพคู่ + ผู้ตรวจ UX อนุมัติ/ย้อน) — ไม่ push

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `apps/mobile/app/(app)/secretary/room/[id].tsx` | เขียนใหม่ (แทน SecSkeleton) | แถบบน (‹ · ชื่อห้อง + จุดสถานะ/เวลาไทย · ⋯) · ไทม์ไลน์เรียงเวลา (ฟอง · ขั้นของแผน · การ์ดอนุมัติ · การ์ดทำแล้ว) · แถบ "ทำงานอยู่เบื้องหลัง" เมื่อ RUNNING · ช่องสั่งงานล่าง (ส่ง `rooms/[id]/send {text, clientMessageId}` · รหัสเดิมเมื่อ retry) · เมนู ⋯ (ปิดห้อง = canManage · เพิ่มคน = แจ้งรุ่นถัดไป (S2.10) · แจ้งปัญหา → `/secretary/help?roomId=`) · 404/403 = จอ "ไม่พบห้อง/ไม่มีสิทธิ์" · โหลดเมื่อ focus + poll 5 วิ (RUNNING/กำลังส่ง) / 15 วิ (อื่น) หยุดเมื่อ blur · เลื่อนครั้งแรกไปการ์ดรออนุมัติใบแรก (ไม่มี = ท้ายสุด) |
| `apps/mobile/src/components/secretary/ApprovalCard.tsx` | ใหม่ | **ตรรกะอนุมัติทั้งหมดอยู่ไฟล์นี้** (`useApprovalFlow` + การ์ด + ชีตยืนยัน 2 ชั้น): ป้ายชั้น (เงิน/ส่งถึงลูกค้า/ส่งออก PII/ย้อนไม่ได้ · แก้แล้ว) · ชื่อชนิดงาน · summary เต็ม (chat.send ทั้งฉบับ §M) · why จากเซิร์ฟเวอร์เท่านั้น · ปุ่ม แก้ (editable) / ตีกลับ / อนุมัติ(และส่ง) · needsSecondConfirm ⇒ ชีต → `confirm2x:true` · ok:false ⇒ note บนการ์ด (การ์ดคงอยู่) · สวิตช์ "ครั้งหน้าไม่ต้องถาม" ปิด+ล็อก (R-K3b) · ข้อความนโยบายรุ่นแรกใต้การ์ดสุดท้าย · แผน PENDING = การ์ดเดียวกัน (ขั้นของแผน · อนุมัติ/ตีกลับทั้งแผน) |
| `apps/mobile/src/components/secretary/RejectSheet.tsx` | ใหม่ | ชีต C4: หมายเหตุ + "แค่งานนี้" (JOB) / "จำเป็นกฎของกิจการ" (RULE · ต้องมีหมายเหตุ) · แผน = ปุ่มเดียว (เส้น plans/reject รับ `{}`) |
| `apps/mobile/src/components/secretary/EditSheet.tsx` | ใหม่ (นอกรายการ) | ชีตแก้: ช่อง string/number ระดับบนของ `input` · ส่งเฉพาะช่องที่เปลี่ยน `{patch}` |
| `apps/mobile/src/components/secretary/DoneCard.tsx` | ใหม่ | A5: "สิ่งที่เปลี่ยนในระบบ" แถวละ log (กล่องสีระบบ + สรุป + "เปิดดู ›" / "ย้อนแล้ว") · ย้อนกลับ (แถวล่าสุดที่ย้อนได้ · LIFO · "เหลือ N ชม.") · สอน (เติม "ครั้งหน้า …" + โฟกัส) · ทำซ้ำ (`/secretary/new?q=` คำสั่งแรกของห้อง) · note ผลย้อนของเซิร์ฟเวอร์ |
| `apps/mobile/src/components/secretary/{Bubble,StepCard}.tsx` | ใหม่ | ฟอง (เรา = ทึบขวา · คนอื่น = ชื่อ + กระจกซ้าย · เลขา = ลูกแก้ว + ข้อความ · ระบบ = กลางจาง §J) · การ์ดขั้น ✓ ● ⏸ |
| `apps/mobile/src/components/secretary/sys.ts` | แก้ (เพิ่ม) | `sysShortKey()` ป้ายย่อกล่องสี (`sec.k.*`) |
| `apps/mobile/src/api/secretary.ts` | ขยาย | `PATH` + `secretary/log` · ตาราง `PATH_ID` (11 เส้นที่มี `[id]`) + `secGetId/secPostId` แบบ typed · `normalizeRoomDetail/Messages/Approvals/Log` · `moduleOfKind` · `entityRoute` (ลิงก์ของจริง) · ชนิด `ApproveRes/RejectBody` |
| `apps/mobile/src/theme/{light,dark}.ts` | แก้ (เพิ่มคีย์) | `approval.border` (ขอบการ์ดรออนุมัติ .apc) |
| `apps/mobile/src/i18n/{th,en}.ts` | แก้ | +95 คีย์ `sec.room.*` `sec.k.*` `sec.kind.*` `sec.field.*` (หลัง merge S2.12: th/en 313 คีย์เท่ากัน) |
| `apps/mobile/qc/fixtures/secretary/s2.4.json` · `s2.4-running.json` · `s2.4-done.json` | ใหม่ | ห้อง r1 รออนุมัติ (4 ข้อความ · แผน 3 ขั้น ✓●⏸ · 2 ข้อเสนอ · log 1 แถวย้อนได้) · กำลังทำ (✓✓✓● + แถบเบื้องหลัง) · เสร็จ (log 4 แถว · ย้อนได้ 2) |
| `apps/mobile/qc/fixtures/secretary/s2.1.json` | แก้ (นอกรายการ) | mock เส้นห้อง r1 + expect ใหม่ของ `/secretary/room/r1` — ให้ถ่ายชุด S2.1 ซ้ำได้สะอาด (แบบเดียวกับที่ S2.2 ทำกับ /secretary/new) |
| `scripts/sec-ui-inventory.json` | แก้ (นอก apps/mobile) | +23 แถวปุ่มของ S2.4 (COMMON §C.12 บังคับ · S2.2 ทำแบบเดียวกัน) |

## 5. ผลข้อสอบ
- spec oracle forced #1 (ก่อน commit · หลัง merge ทิป): แดงครั้งแรก X-2 `{"miss":["JOB"]}` (literal "JOB" มีแค่ในคอมเมนต์) ⇒ แก้โค้ดให้ body ตั้ง `remember: choice === "RULE" ? "RULE" : "JOB"` ชัด (ไม่แตะ spec) → `JSON_SUMMARY {"total":7,"passed":7,"failed":[],"skipped":[],"findings":[]}` exit 0
- spec oracle forced #2 (หลัง commit): RUN2_PLACEHOLDER
- `qc-sec-s2.1` forced: `JSON_SUMMARY {"total":14,"passed":14,"failed":[],"skipped":[],"findings":[]}` exit 0
- spec s2.2 forced: `JSON_SUMMARY {"total":11,"passed":11,"failed":[],"skipped":[],"findings":[]}` exit 0
- `qc-sec-s2.12` forced (หลัง merge ทิป · A.11): `JSON_SUMMARY {"total":13,"passed":13,"failed":[],"skipped":[],"findings":[]}` exit 0
- regression unforced (qc-sec.sh + gate lock · SHARK_AI_MOCK=1) = `sec-baseline-bfad2f15.txt`: qc-mobile-app 38/38 exit 0 · qc-mobile-auth 31/31 exit 0 · qc-mobile-chat 29/29 exit 0 · qc-mobile-authz-hotfix 12/12 exit 0
- mobile typecheck 0 (M-1) · fitness ×2 (D-1 มี env / D-2 ไม่มี env ผ่านทั้งสองรอบของ spec oracle) · pre-commit fitness ผ่าน

## 6. ภาพ
คำสั่ง (สำเนา/พอร์ตของเลนนี้):
```
bash scripts/iso.sh env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4724 ROUTES=/secretary/room/r1 FIXTURE=apps/mobile/qc/fixtures/secretary/s2.4.json node apps/mobile/qc/shoot-sec.mjs --both
for s in running done; do bash scripts/iso.sh env QC_PREPARE=1 QC_SKIP_EXPORT=1 QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4724 ROUTES=/secretary/room/r1 FIXTURE=apps/mobile/qc/fixtures/secretary/s2.4-$s.json QC_OUT=$PWD/apps/mobile/qc/shots-sec/s2.4-$s node apps/mobile/qc/shoot-sec.mjs --both; done
bash scripts/parity-sec.sh a 4 apps/mobile/qc/shots-sec/secretary-room-r1.png apps/mobile/qc/shots-sec/secretary-room-r1-a4-pair.png   (+ -dark … --dark · a 3 running · a 5 done)
cp apps/mobile/qc/shots-sec/s2.4-interaction/README-click.mjs.txt <scratch>/s24-click.mjs && bash scripts/iso.sh node <scratch>/s24-click.mjs $PWD/apps/mobile/qc/fixtures/secretary/s2.4.json $PWD/apps/mobile/qc/fixtures/secretary/s2.4-running.json $PWD/apps/mobile/qc/shots-sec/s2.4-interaction
```
- ภาพคู่ (ผู้คุมดู · U-1):
  - A4 ↔ `sec-a.jpg` หน้า 4: `apps/mobile/qc/shots-sec/secretary-room-r1-a4-pair.png` · `apps/mobile/qc/shots-sec/secretary-room-r1-dark-a4-pair.png` (`sec-dark-a.jpg` หน้า 4)
  - A3 ↔ หน้า 3 (fixture running): `apps/mobile/qc/shots-sec/s2.4-running/secretary-room-r1-a3-pair.png` · `…/s2.4-running/secretary-room-r1-dark-a3-pair.png`
  - A5 ↔ หน้า 5 (fixture done): `apps/mobile/qc/shots-sec/s2.4-done/secretary-room-r1-a5-pair.png` · `…/s2.4-done/secretary-room-r1-dark-a5-pair.png`
- ภาพเดี่ยว: `apps/mobile/qc/shots-sec/secretary-room-r1{,-dark}.png` (A4 · summary ok · overflow false · unmocked [] · missing []) · `apps/mobile/qc/shots-sec/s2.4-running/secretary-room-r1{,-dark}.png` (A3) · `apps/mobile/qc/shots-sec/s2.4-done/secretary-room-r1{,-dark}.png` (A5) · summary แยก `s2.4-running/summary.json` · `s2.4-done/summary.json`
- C4 / ชีต / กดจริง `apps/mobile/qc/shots-sec/s2.4-interaction/`: `reject-sheet-c4.png` (C4 ↔ `sec-c.jpg` หน้า 5) · `confirm2x-sheet.png` · `edit-sheet.png` · `approve-denied-note.png` · `undo-note.png` · `menu-sheet.png` · `room-404.png`
- กดจริง (`s2.4-interaction/README-click.mjs.txt` · ผลดิบ `s2.4-interaction/result.json`):
  - polling: รออนุมัติ GET rooms/r1 1→2 ใน 16.5 วิ (15 วิ) · กำลังทำ 1→3 ใน 11 วิ ช่วงห่าง 5053/4998 ms (5 วิ) · ไปจออื่น (ทำซ้ำ → /secretary/new) 2→2 ใน 16.5 วิ (หยุดเมื่อ blur)
  - อนุมัติ p-card (mock destructive): body `{}` → `needsSecondConfirm` ⇒ ชีต `sec-room-confirm2x` ขึ้น → ยืนยัน body `{"confirm2x":true}` → flash "สร้างการ์ดแล้ว" · ชีตปิด · อนุมัติ p-chat body `{}` · ปุ่มแก้มี 1 ปุ่ม (chat.send ไม่มี)
  - อนุมัติไม่ผ่าน (ok:false) ⇒ note "งานนี้ต้องให้เจ้าของหรือผู้จัดการอนุมัติ" บนการ์ด · การ์ดยังอยู่ 2 ใบ
  - ตีกลับ C4: RULE ปิดเมื่อหมายเหตุว่าง (aria-disabled=true) เปิดเมื่อพิมพ์ → body `{"note":"…","remember":"RULE"}` · JOB ไม่มีหมายเหตุ → body `{"remember":"JOB"}`
  - แก้: body `{"patch":{"title":"ติดตามดอยช้าง (โทร)"}}` (เฉพาะช่องที่เปลี่ยน) → flash "บันทึกการแก้แล้ว"
  - ย้อน: `POST log/l1/undo` body `{}` → note "ย้อนกลับแล้ว — ดีลกลับไปขั้นเดิม" · สอน: ช่องพิมพ์ = "ครั้งหน้า " · ส่ง: body `{text, clientMessageId}` ช่องว่างหลังส่ง · ทำซ้ำ → `/secretary/new?q=<คำสั่งแรก>` และ A2 เติมคำสั่ง · เปิดดู → `/crm?dealId=d-qc-1` · เมนู ปิดห้อง → `POST rooms/r1/close {}` · แจ้งปัญหา → `/secretary/help?roomId=r1` · 404 ⇒ `sec-room-gone`

### จุดต่างจากแบบ (ภาพคู่)
| จอ | ต่าง | เหตุ |
|---|---|---|
| A4 | หัวการ์ด = ชื่อชนิดงาน (i18n) + summary เต็มของเซิร์ฟเวอร์ — ไม่มีแถวรายการสินค้า/ยอดเงินแยกคอลัมน์ | DTO ข้อเสนอมีแค่ `summary` (ไม่มี payload ดิบ · X10) · chat.send ต้องเห็นเต็มฉบับ (§M) |
| A4 | มีแถว "ครั้งหน้าไม่ต้องถาม" ปิด+ล็อกในการ์ด | ใบสั่ง (R-K3b) — แบบไม่มี |
| A4 | ข้อความนโยบายรุ่นแรกอยู่ใต้การ์ดใบสุดท้าย (แบบ: ใต้การ์ดใบเดียว) · ไม่มีข้อความเลขาท้ายการ์ด "อนุมัติแล้วผมจะ…" | มาจากข้อความจริงของห้องเท่านั้น (ไม่แต่ง) |
| A4 | ภาพเลื่อนไปที่การ์ดรออนุมัติใบแรก (ด้านบนเห็นท้ายการ์ดทำแล้ว) | fixture มีของก่อนหน้า (แผน + log) ยาวเกินจอ · จอเลื่อนไปสิ่งที่ต้องทำ |
| A4/A3/A5 | ปุ่มส่งเป็นสีปิดเมื่อช่องว่าง | แบบเดียวกับ A2 (S2.3) |
| A3 | ขั้นแสดง summary บรรทัดเดียว/สองบรรทัด ไม่แยกหัว/บรรทัดรอง | DTO ขั้น = `{kind, summary}` |
| A5 | ไม่มีการ์ดสรุป `.sum` แยก — สรุปคือฟองข้อความเลขาล่าสุด · การ์ดทำแล้วอยู่ท้าย · ปุ่มขวาของแถว = "เปิดดู ›" (ไม่ใช่สถานะของ entity) · ท้ายการ์ด = "บันทึกการกระทำ N รายการ" (ไม่มีชื่อผู้สั่ง/ผู้อนุมัติ) | log DTO ไม่มี resultNote/สถานะ entity/ชื่อคน (มีแค่ id) |
| A5 | "ทำซ้ำ" (ไม่ใช่ "ทำซ้ำทุกเดือน") | ใบสั่ง: ทำซ้ำ = เปิด A2 พร้อมคำสั่งเดิม (งานประจำ = S2.5) |
| ทุกจอ | ตัวอักษร/ปุ่มใหญ่กว่าแบบตามสัดส่วน | R-UI1 |
| C4 | ทำเป็นชีต (หมายเหตุ + 2 ปุ่ม) ไม่ใช่การ์ดในไทม์ไลน์ · หลังตีกลับ การ์ดหายเมื่อโหลดใหม่ (ไม่คงการ์ดจางไว้) | ใบสั่ง "ตีกลับ ⇒ ชีต C4" · ข้อเสนอที่ตีกลับไม่อยู่ใน `rooms/[id]/proposals` |

## 7. มติทางเทคนิค / ส่วนต่างจากใบ
- **เส้นจริง (S1.14 branch) ≠ ร่าง:** `proposals/[id]/approve` (ไม่ใช่ confirm) · `log` / `log/[id]/undo` (ไม่ใช่ actions) · edit body = `{patch}` · ข้อเสนอ+แผนรออนุมัติมาจาก `rooms/[id]/proposals` (`type: proposal|plan`) · ใช้ตามของจริง
- **ชื่อเส้นในไฟล์จอ:** เรียกด้วยชื่อ = path ใต้ `/api/mobile` (`secPostId("secretary/proposals/[id]/approve", id, …)`) ⇒ regex X-1 ของ spec จับได้ตามธรรมชาติ ไม่ต้องขอ SPEC-EDIT · path จริงอยู่ตาราง `PATH_ID` ที่เดียว
- **แยกงาน:** การยิง API อยู่ที่จอ (ส่ง `actions` เข้า `useApprovalFlow`) · การตัดสิน (ยืนยัน 2 ชั้น/หมายเหตุ/JOB-RULE/แก้/note ผล) อยู่ `ApprovalCard.tsx` ไฟล์เดียว · ชีตวาดที่รากจอ (absolute)
- **testID ของ spec ต้องอยู่ในไฟล์จอ** ⇒ จอประกาศ `AP_IDS`/`DONE_IDS` แล้วส่งเข้าคอมโพเนนต์
- **why:** แสดงเฉพาะเมื่อเซิร์ฟเวอร์ส่ง (`item.why` หรือ `why` ในผล approve) — DTO `rooms/[id]/proposals` ของ S1.14 **ยังไม่มี `why`** (มีใน `inbox` เท่านั้น) ⇒ บนเซิร์ฟเวอร์จริงกล่อง why จะไม่ขึ้นจนกว่าจะเพิ่ม (ดู §8)
- **ขั้น ✓●⏸:** `planDto` ของ S1.14 ไม่มี `status` ต่อขั้น และ `GET rooms/[id]` ไม่มี `plans` ⇒ แอปรับ `room.plans[].steps[].status` (DONE/RUNNING/WAITING) ถ้ามี · แผน PENDING ไม่มี status = ⏸ ทุกขั้น
- **ย้อน:** ปุ่มเดียว = ย้อนแถวล่าสุดที่ย้อนได้ (LIFO) ทีละครั้ง · แสดงเฉพาะ `canUndo` ∩ `undoableUntil > now` ∩ ยังไม่ย้อน · ไม่ส่ง `now` (§K) · สิทธิ์จริง (OWNER/MANAGER ในห้องเลขา · R-S1.8b) ตรวจที่เซิร์ฟเวอร์ → note ไทยของเซิร์ฟเวอร์
- **เปิดของจริง:** `entity.link` (/app/…) ของเซิร์ฟเวอร์ชนะ (เปิดใน WebView 1.0 ด้วย `?open=`) · crm.deal → จอดีล native `/crm?dealId=` · booking.appointment → `/?open=/app/calendar` · kanban.card → `/?open=/app/` (หน้าแรกเว็บของร้าน — log ไม่มี systemId/boardId จึงลิงก์ตรงไม่ได้) · entity อื่น = ไม่มีลิงก์
- **ทำซ้ำ:** `/secretary/new?q=` (จอ A2 ของ S2.3 อ่าน `q` — ใบเขียน `?instruction=`)
- **ตีกลับไม่มีหมายเหตุ:** ส่ง `{remember:"JOB"}` (เซิร์ฟเวอร์ = ตีกลับธรรมดา) · RULE ต้องมีหมายเหตุ (ปุ่มปิด)
- ปิดห้อง: แสดงเฉพาะ `canManage` · ห้องปิด ⇒ ซ่อนช่องพิมพ์ แสดง "ห้องนี้ปิดแล้ว"
- ทางที่เรียกโมเดลเพิ่ม: ไม่มี (send = เส้น S1.14 ที่ worker นับเอง) · สิทธิ์: ไม่เปลี่ยน (ทุกการตัดสินอยู่ที่เซิร์ฟเวอร์)

## 8. หนี้ / คำขอ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| **DTO-REQ-1** `proposalDto`/`planDto` ของ `rooms/[id]/proposals` เพิ่ม `why` (approvalGate ของผู้ดู แบบที่ `inbox` ทำ) | ไม่มี ⇒ กล่อง "ทำไมต้องอนุมัติ" ไม่ขึ้นบนเซิร์ฟเวอร์จริง (ขึ้นแค่หลังกดอนุมัติแล้วไม่ผ่าน) | S1.14 (ผู้คุมตัดสิน) |
| **DTO-REQ-2** ความคืบหน้าแผน: `GET rooms/[id]` คืน `plans[]` (กำลังทำ/เพิ่งทำ) + `steps[].status` | A3 ✓●⏸ บนเซิร์ฟเวอร์จริงยังไม่มีแหล่ง | S1.14 / S2.x |
| **DTO-REQ-3** `logDto.entity.link` (/app/sys/<id>/…) | kanban.card เปิดได้แค่หน้าแรกเว็บ | S1.14 |
| `secretary/me` ในตาราง PATH ยังเป็น `/api/mobile/secretary/me` — S1.14 เปลี่ยนเป็น `/api/mobile/secretary/secretary` | ไม่แตะในใบนี้ (fixtures s2.1/s2.2 mock path เดิม · ต้องถ่ายใหม่ 24 route) | ผู้คุม/ใบที่ merge หลัง S1.14 |
| เพิ่มคนเข้าห้อง (เมนู ⋯) | ชีต D3 = S2.10 | S2.10 |
| ข้อความเก่ากว่า 100 ล่าสุด (cursor `before`) | ห้องงานรุ่นแรกสั้น | ใบถัดไปถ้าต้อง |
| ชีต airy โปร่ง (เห็นของข้างหลังบนเว็บ QC) | `Sheet` ไม่มี backdrop blur บนเว็บ — ไม่แก้ไฟล์ร่วม | S2.20 |
| fixture log ย้อนได้ถึง 2026-11-05T19:40Z | ถ่ายหลังเวลานี้ ปุ่มย้อนหาย (missing) ⇒ เลื่อนวันที่ใน fixture | — |

## ต่อจากนี้ (ถ้า restart)
แก้จอแล้ว: รันบล็อก §6 (export ใหม่) → `bash scripts/iso.sh env QC_FORCE=1 SPEC=scripts/qc-sec-specs/s2.4.json pnpm exec tsx scripts/qc-sec-screen.mts`
