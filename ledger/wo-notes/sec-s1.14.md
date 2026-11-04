# WO S1.14 — API ชุดเดียวเว็บ+แอป `/api/mobile/secretary/**` + server actions + เส้นทางจริง (ปิด S1 · ด่านเต็ม)

> RUN "เลขา AI" · เลน `/root/projects/shark-sec-b` branch `wip/sec-s1.14` (ต่อจากทิปผู้คุม 95a14b66) · 5 พ.ย. 2026 (UTC) · builder: Opus
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S1.14.md` + COMMON + RESOLUTIONS (§B.6 · §K · §L.2 R-S1.13i · §M · §N · §O · §P) · ข้อสอบ `scripts/qc-sec-s1.14.mts` (11 ข้อ · ไม่แก้)

## 0. Task 0 (hotfix ก่อน route)
- `src/lib/modules/chat/routing.ts` บันทึกภายในของ callHelper/handoff: 🙋/🔁 → `[เรียกคนช่วย] …` · `[ส่งต่อ] จาก … ถึง …: …` · commit 6341b68f
- qc-chat-v2-context 53/53 · qc-chat-v2-icons 35/35 · qc-sec-s1.21 19/19 (รันด้วยสำเนาที่แก้เครื่องหมายคำพูดใน H-2 — ดู §7 ORACLE-EDIT S1.21-H-2-parse)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/app/api/mobile/secretary/_shared.ts` | ใหม่ | ด่าน (gate/userGate) · `withRateLimit` (`sec:<route>:<user>`) · `readBody` zod strict (400 bad_json/invalid · 413) · `idParam` ≤80 · `thrown` (Forbidden 403 · Error ไทย 400 · อื่น 500 + logOps) · `runAfter` (after() / นอกคำขอ = รอ) · `claimClientMessageId` (ChatRateBucket 24 ชม.) |
| `src/app/api/mobile/secretary/**/route.ts` | ใหม่ 54 ไฟล์ | ตาราง route ของใบ (ดู docs/api/SECRETARY-API.md) |
| `src/app/api/mobile/secretary/support/_case.ts` · `staff/_staff.ts` | ใหม่ | ขอบเขตเคส (กติกาเดียวกับ caseScope ของ support/service.ts) · แม็ปเหตุผลคำเชิญ → สถานะ |
| `src/lib/ai/secretary/dto.ts` | ใหม่ (pure) | DTO ตัวเดียวของ route + server actions (ไม่มี payload ดิบ/token/ยอดเงิน) |
| `src/lib/ai/secretary/server-actions.ts` | ใหม่ | `"use server"` `sec<Verb><Entity>Action` × 42 (session + assertCan ai.chat.send + lib เดียวกัน) |
| `docs/api/SECRETARY-API.md` | แก้ | ทุกแถว `secretary/*` = ของจริง + กติการ่วม + ตารางย้ายชื่อจากร่าง S0.3 |
| `scripts/sec-real-path.mts` | ใหม่ | เส้นทางจริง 3 เส้น (รายงาน · ผู้คุมรันด้วยคีย์เจ้าของ) |
| `src/lib/modules/chat/routing.ts` | แก้ 2 บรรทัด | Task 0 |
ไม่แตะ lib ของใบอื่น · ไม่แตะ prisma/ · ไม่ generate

## 2. ตัดสินใจ / deviation
1. **ไฟล์ server actions = `server-actions.ts`** ไม่ใช่ `actions.ts` — `src/lib/ai/secretary/actions.ts` คือ log/undo ของ S1.8 อยู่แล้ว (ใส่ "use server" ไม่ได้)
2. **me/phone** ไม่มีเส้นซ้ำ — ใช้ `auth/sms/*` + `auth/phone/link` + `GET /me` ของ S1.19 (ตามใบ)
3. **support/\*** ต้องมี x-tenant-id (เคสเป็นของกิจการ · `createCase` ต้องมี tenantId) — ใบเขียนว่า "ไม่ต้องมีร้าน"
4. **secretary GET/PUT** ไม่ต้องมี x-tenant-id (AiSecretary แกน global) · GET อ่านอย่างเดียว (ไม่ ensureSecretary)
5. **`PUT scheduled/[id]`** รับเฉพาะ `{active}` — lib S1.9 ไม่มีฟังก์ชันแก้เวลา/ความถี่/วัน/ช่องทาง (ห้ามเขียน logic เอง) ⇒ ฟิลด์อื่น = 400 `not_supported` · หนี้ → ใบ S1.9b/S2
6. **ส่งซ้ำ clientMessageId** — `sendRoomMessage` ไม่มี clientMessageId ⇒ route จองกุญแจ `sec:cmid:<ร้าน>:<ห้อง>:<id>` ใน ChatRateBucket (คำสั่งเดียว · 24 ชม.) · ซ้ำ = 200 `{duplicate:true}` (ไม่มี messageId เดิม) · ส่งล้ม = คืนกุญแจ · หนี้: คอลัมน์ clientMessageId บน AiMessage (migration secretary_b)
7. **quota wire shape** ตาม R-S1.13i + oracle Q-1: `{jobs{used,limit,left,pct,level,text,resetAt,month}, assist{usedMicro,capMicro,pct}, credit{blocked}, pack}` — `credit` ไม่มียอดเงิน (บอกแค่ blocked "jobs"|null)
8. **approve/undo/plans approve** คืน 200 `{ok,note}` เสมอ (lib ไม่มีรหัสแยก · รูปเดียวกับ /api/mobile/proposals/confirm เดิม)
9. **staff PUT/suspend/remove** — lib คืนแค่ `{ok:false, reason}` ⇒ 400 `refused` + ข้อความไทย (แยก 403 ไม่ได้โดยไม่เดาข้อความ)
10. **invite link** คืนเฉพาะเมื่อ SMS ไม่ได้ส่งจริง (`sms !== "sent"`) — รหัสใช้ได้กับเบอร์ในใบเท่านั้น
11. **body.userId/tenantId** — R-2 grep `body.<x>`: schema strict ไม่มี now/actor ids · `members POST {userId}` = เป้าหมายที่ถูกเพิ่ม (ตามสัญญา) · `notify PUT {tenantId}` ได้แค่ร้านของ x-tenant-id หรือ null
12. **rooms POST** = startRoom → enqueueRoomJob → runRoomJobs ใน after() (startRoom ไม่สร้าง job เอง — แบบเดียวกับ scheduled.ts)
13. **messages** ใช้ `listMessages(…, 500)` แล้วตัดหน้าใน route (lib ไม่มี cursor) · หนี้: before/take ใน lib
14. **account/delete** ถอน Session ทุกตัวของผู้ใช้ก่อน `deleteAccount` (Q10)
15. **invites/[code]** สาธารณะ · 30/นาที/IP (O-9)
16. **กุญแจเพดาน = `sec:<route>:<tenantId>:<userId>`** บนเส้นระดับกิจการ (ใบเขียน `sec:<route>:<userId>`) — ต่อ Membership แบบ inbox R-S1.21d · เหตุ: ข้อสอบใช้ userId คงที่ข้ามรอบ ⇒ forced #2 ภายใน 60 วิ ชนถังของ L-1 รอบก่อน (H-1 r5 = 429)
17. **สัญญาเพิ่มของผู้คุม (S2.4 + §S)** — `src/lib/ai/secretary/views.ts` (อ่านอย่างเดียว · ใช้ร่วม route + server actions): proposals `why`/`classes`/`editable`/`canApprove` (dry-run approvalGate/planApprovalGate + ระดับ) · `GET rooms/[id]` `plans[]` PENDING+RUNNING + สถานะขั้น (RUNNING/SKIPPED อนุมานจาก stepsJson) · log `link` (พาธ /app) + `canUndo` (dry-run undoAction) · `secretary/me` = alias · RoomStatus 4 ค่าใน docs

## 3. ผู้ได้/เสียสิทธิ์
- ไม่มีสิทธิ์ใหม่ — ทุกเส้นใช้ด่านเดียวกับเว็บ (`ai.chat.send` · `settings.staff.read`) + ด่านใน lib (OWNER/MANAGER/ผู้เปิดห้อง)
- เส้นที่ทำให้โมเดลถูกเรียก: rooms POST · rooms/[id]/send (ผ่าน worker → sendMessage → คิดต้นทุนทางเดิม) · tenants/create เปิดห้องแรก (นับงาน · worker ไม่ถูกปลุกจากเส้นนี้)

## 4. ผลด่าน (HEAD d5412e2f7)
- oracle forced #1 `{"total":11,"passed":10,"failed":["H-2"]}` · forced #2 เหมือนกัน · unforced เหมือนกัน (ไดเรกทอรีมีแล้ว ⇒ unforced รันเต็ม) · สำเนาที่แก้ H-2 ตาม ORACLE-EDIT = 11/11
- qc-sec-* forced: เขียวทุกตัวยกเว้น s0.3 (D1.7 · D3.2) · s1.1 (M-1 · M-4 · B-1 · B-2) — ทั้งหมดเป็นของใบก่อน (migration secretary_b ของ S1.22 · baseline ไอคอนแดง · FREE_PACK R-S1.13b · ชื่อใน docs §5) · s1.21 รันด้วยสำเนาแก้เครื่องหมายคำพูด 19/19 · s1.14 ดูบน
- baseline 60 ชุด (`scratchpad sec-baseline-s114.txt`): ต่างจาก bfad2f15 แค่ qc-chat-v2-context 52→53 และ qc-chat-v2-icons 34→35 (exit 1→0) · ที่เหลือเท่าเดิมทุกบรรทัด
- typecheck: `pnpm typecheck` แดง 2 บรรทัด = scripts/qc-sec-s1.21.mts:130 (oracle ของผู้คุม) · tsc ทั้งรีโปยกเว้นไฟล์นั้น = 0 error
- next build (iso · heap 10240 · ISO_MEM 13500M · s1.21 แก้ชั่วคราวแล้วคืน): **global OOM ×2** (21:18Z · 21:38Z · node anon-rss 11.5–11.8G ระหว่าง "Creating an optimized production build" · swap ของเครื่องถูกเลนอื่นใช้ไป 5G ก่อนเริ่ม) — ไม่มีผล compile/type ⇒ ผู้คุมต้อง build ตอนเครื่องว่าง
- fitness: D-1/D-2 ของข้อสอบเขียวทุกรอบ + pre-commit ✅
- sec-real-path (SHARK_AI_MOCK=1): 3 เส้นเดินครบ · fixture ทุกตัวสร้างได้ · residue 0 · ไม่เรียกโมเดลจริง

## 7. ORACLE-EDIT / ข้อผู้คุม
- **S1.14-H-2**: ห้องถูกปิดใน H-1 (r6) ก่อน H-2 เพิ่มสมาชิก ⇒ `addMember` คืน `closed` (กติกา S1.6 R5) ⇒ 409 · ข้อสอบคาด 200 · ขอ: H-2 ใช้ห้องใหม่ที่ยังเปิด (`const hid = String((await call("rooms","POST",{instruction:"ห้องทดสอบสมาชิก"})).body.roomId ?? "")` แล้ว m1/m2/m3 ใช้ `{ id: hid }`) — สำเนาที่แก้แบบนี้ผ่าน 11/11
- **S1.21-H-2-parse** (ORACLE-EDIT 77d737b6 ของผู้คุม): `"ส่งต่อ"` ซ้อนในสตริง `"…"` บรรทัด 130 ⇒ esbuild/tsc parse error ⇒ ข้อสอบรันไม่ได้ + `pnpm typecheck`/`next build` แดง · ขอ: เปลี่ยนเป็น «ส่งต่อ» หรือ `\"`
- **S0.3-D1.7** (ขาด createInvite/moduleLevel/setModuleLevel/callHelper ใน docs §5 — ชื่อจริงคือ inviteStaff/levelOfModule/permissionsForLevel/callHelper ใน §5.24) · **S0.3-D3.2** (FREE_PACK มี `assistDailyMicro` ตาม R-S1.13b) — แดงก่อนใบนี้ ไม่ใช่ไฟล์ของใบนี้
