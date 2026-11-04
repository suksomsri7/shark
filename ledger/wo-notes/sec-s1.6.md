# WO S1.6 — ห้องร่วม `secretary/members.ts`

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-b` branch `wip/sec-s1.6` (จาก d8625b70) · 2026-11-04T14:35Z · ผู้คุมงาน: Fable 5.1 · builder: Opus (subagent)
> สัญญา: ใบสั่ง `ledger/secretary-briefs/sec-brief-S1.6.md` (+ COMMON + RESOLUTIONS R-K1 R-K2 R-S1.1c)
> แบบ `ledger/DESIGN-SECRETARY.md` D2/D3 · ภาพ `ledger/design-secretary/sec-d.jpg` (ใบนี้ไม่มี UI)
> ข้อสอบ: `scripts/qc-sec-s1.6.mts` (14 ข้อ · commit test: 47027ca0 · **แก้หลัง commit หรือไม่: ไม่**)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/ai/secretary/members.ts` | ใหม่ | `ROOM_MEMBERS_MAX` · `RoomMemberRow` · `listMembers` · `addMember` · `removeMember` · `visibleMessagesWhere` · `roomMemberRows` | ไม่ |
| `src/lib/ai/service.ts` | แก้ (2 hunk + 1 import) | `listMessages`: ทางห้องร่วม (`s !== base`) ใส่ `...await visibleMessagesWhere(...)` · `sendMessage`: ประวัติที่ป้อนโมเดลใส่เงื่อนไขเดียวกันเมื่อห้องเห็นผ่านห้องร่วม (H-2) | ใช่ — hunk seeHistory เท่านั้น |
| `src/lib/ai/secretary/rooms.ts` | แก้ | `getRoom` คืน `members: RoomMemberRow[]` (ผ่าน `roomMemberRows` · `Promise.all` กับ statusCounts) | ไม่ |
| `docs/modules/31-secretary.md` | แก้ | §5.6 เขียนใหม่ตามของจริง · §7 เพิ่มแถว "ออกจากห้อง" + "เห็นข้อความก่อนถูกเพิ่ม" | – |
| `ledger/wo-notes/sec-s1.6.md` | ใหม่ | ไฟล์นี้ | – |

## 2. migration / seed / backfill
- ไม่มี (ไม่แตะ prisma/** · ไม่รัน generate)

## 4. กลุ่มข้อสอบ X
| กลุ่ม | เกี่ยว? | check ids / เหตุผล |
|---|---|---|
| X1 ขอบเขต | ใช้ | A-1 R-2 (มองไม่เห็น = not_found) · A-2 (ไม่ใช่สมาชิกกิจการ) · H-1/H-2 (seeHistory) |
| X2 ตัวตน/มอบอำนาจ | ใช้ | X-1 X-2 (actor ของผู้เขียน · ไม่ได้ตัวตนเลขาของเจ้าของห้อง) |
| X3 ยิงพร้อมกัน | ใช้ (โค้ด) | เพดาน 20: ล็อกแถว AiRoom `FOR UPDATE` ใน tx · unique `[roomId,userId]` ชน = already · ข้อสอบไม่ได้ยิงพร้อมกัน (หนี้ §8) |
| X4–X11 | N-A | ไม่มี event/consumer · ไม่มีงานตามเวลา · ไม่มี endpoint · ไม่เรียกโมเดลเพิ่ม · ไม่มีข้อมูลลูกค้า |

## 5. ผลข้อสอบ
- `qc-sec-s1.6` forced #1: `JSON_SUMMARY {"total":14,"passed":14,"failed":[],"skipped":[],"findings":[]}`
- `qc-sec-s1.6` forced #2: `JSON_SUMMARY {"total":14,"passed":14,"failed":[],"skipped":[],"findings":[]}`
- `qc-sec-s1.6` unforced: `JSON_SUMMARY {"total":14,"passed":14,"failed":[],"skipped":[],"findings":[]}` (members.ts มีแล้ว ⇒ รันเต็ม) · residue: `finally` ลบร้าน/ผู้ใช้ `qcs16-*`
- `qc-sec-s1.5`: `JSON_SUMMARY {"total":16,"passed":16,"failed":[],"skipped":[],"findings":[]}`
- `qc-sec-s1.4`: `JSON_SUMMARY {"total":28,"passed":27,"failed":["G-3"],"skipped":[],"findings":[{"id":"G-3","sev":"CRITICAL"}]}` — ดู §7 ORACLE-EDIT · สำเนาชั่วคราวที่ใส่ `seeHistory: true` บรรทัด 136 (ลบแล้ว ไม่ commit): `JSON_SUMMARY {"total":28,"passed":28,"failed":[],"skipped":[],"findings":[]}`
- regression เทียบ `ledger/qc-baseline/sec-baseline-85751098.txt` (เท่ากันทุกชุด):
  - `qc-ai-phase-b1`: `JSON_SUMMARY {"total":9,"passed":9,"findings":[]}` (baseline 9/9)
  - `qc-ai-phase-b2`: `JSON_SUMMARY {"total":11,"passed":11,"findings":[]}` (baseline 11/11)
  - `qc-ai-proposals`: `JSON_SUMMARY {"total":16,"passed":16,"findings":[]}` (baseline 16/16)
  - `qc-ai-plan`: `JSON_SUMMARY {"total":7,"passed":7,"findings":[]}` (baseline 7/7)
  - `qc-mobile-chat`: `qc-mobile-chat: 29/29 ผ่าน · CRITICAL fail 0` exit 0 (baseline exit 0)
- typecheck (`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=9500M bash scripts/iso.sh pnpm typecheck`): 8 errors ทั้งหมดในข้อสอบของใบที่ยังไม่ build (`qc-sec-s1.13.mts` 1 · `qc-sec-s1.19.mts` 4 · `qc-sec-s1.7.mts` 3) · ไฟล์ที่ใบนี้แตะ 0
- fitness มี env (qc-sec.sh): `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` exit 0 · `env -u DATABASE_URL -u DIRECT_URL`: `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` exit 0

## 7. ข้อแย้ง / มติทางเทคนิค
- **ORACLE-EDIT s1.4-G-3** (ขอผู้คุม): `scripts/qc-sec-s1.4.mts:136` สร้าง `AiRoomMember` ของ staff2 ด้วยค่าปริยาย `seeHistory=false` **หลัง** ข้อความทั้งหมดของห้อง ⇒ กติกา seeHistory ของใบนี้ (COMMON §C.8 · brief S1.6) ทำให้ staff2 เห็น 0 แถว (`0 1 0`). G-3 ตั้งใจทดสอบการมองเห็นห้อง ไม่ใช่ช่วงประวัติ ⇒ hunk: `addedById: U.staff } });` → `addedById: U.staff, seeHistory: true } });` (ยืนยันแล้วด้วยสำเนาชั่วคราว 28/28)
- ลำดับตรวจของ addMember: not_found → forbidden → closed → self → not_member_of_tenant → already → limit (ห้องปิดตัดสินก่อนตรวจผู้ถูกเพิ่ม)
- OWNER เพิ่มผู้เปิดห้อง หรือเพิ่มตัวเอง = `self` · `userId` ว่าง = `not_member_of_tenant`
- removeMember ทำได้แม้ห้องปิด (ใบไม่ห้าม · เอาคนออกจากงานที่จบแล้วควรทำได้)
- `addedAt` / `createdAt` ใช้ค่าปริยายของ Prisma ทั้งคู่ (แหล่งเวลาเดียวกับข้อความอื่น) · สร้างแถวสมาชิกก่อนข้อความระบบใน tx เดียว ⇒ ข้อความระบบ `createdAt ≥ addedAt`
- event `ai.room.member_added` (แผนเดิมใน doc §5.6) **ไม่ทำ** — brief S1.6 ไม่ระบุ และ event ใหม่ต้องมี consumer + 2 ทะเบียน + replay oracle (COMMON §C.10) · doc แก้แล้ว
- `visibleMessagesWhere` เรียกเฉพาะเมื่อห้องเห็นผ่านห้องร่วม (ไม่ใช่ห้องตัวเองจากรหัส) ⇒ ห้องเดิม/ห้องตัวเอง/OWNER ไม่มี query เพิ่ม · baseline คงเดิม
- ทางที่เรียกโมเดลเพิ่ม: ไม่มี
- ใครได้/เสียสิทธิ์: ผู้เปิดห้อง/OWNER ได้ชวน/เอาคนในกิจการเข้า-ออกห้อง · สมาชิกออกเองได้ · สมาชิก `seeHistory=false` **เสีย** การเห็นข้อความก่อนถูกเพิ่ม (ทั้งใน listMessages และประวัติที่ป้อนโมเดล — เดิมใน S1.4/S1.5 เห็นทั้งหมด)

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ข้อสอบยิง addMember พร้อมกัน ≥10 ทาง (เพดาน 20) | oracle ไม่มีข้อนี้ · โค้ดใช้ FOR UPDATE แล้ว | ผู้คุม/นักล่า |
| event `ai.room.member_added` / `member_removed` | ต้องมี consumer + labels + replay oracle | S1.23 (notify · RESOLUTIONS §J · doc §9 แก้แล้ว) |
| ปรับ seeHistory ของสมาชิกที่อยู่แล้ว (สวิตช์ใน D3 หลังเพิ่ม) | ไม่อยู่ในสัญญา | S2.10 ถ้าแบบต้องการ |
| สมาชิกที่ถูกถอน Membership ยังมีแถว `AiRoomMember` (ไม่แสดงใน listMembers/getRoom · ไม่นับเพดาน · ไม่ได้ push ตั้งแต่รอบ 2 — R-S1.6c · ~~role แสดง STAFF~~ ข้อความรอบ 1 ผิด) | ไม่ลบอัตโนมัติ (รับสิทธิ์คืน = กลับมาเห็น) | ใบ staff/ถอนสิทธิ์ |
| ตอบหลังถูกเอาออกกลางทาง (re-check ก่อนบันทึก) · title/contextJson เห็นได้โดยสมาชิก seeHistory=false | RESOLUTIONS §J หนี้ (ยอมรับ · แจ้งใน D3) | S2.10 |

## 9. คืนสภาพฐาน QC เลขา
- ข้อสอบ `finally` ลบทุกตารางของร้านทดสอบ + ผู้ใช้ `qcs16-*` · ไม่สร้าง seed

## 10. รอบ 2 (หลัง 2 ผู้ตรวจ · MERGE-AFTER-FIX · RESOLUTIONS §J R-S1.6a–d) — merge session/secretary @ee9db7ca เข้าเลนก่อน
- **R-S1.6a** `members.ts` `visibleSinceForUser(tenantId, role, userId, convId)` / `visibleSinceFor(ctx, convId)` → `{ gte: addedAt } | null` + `withinSight` · ใช้ใน `proposals.ts` (`listPendingProposals` · `rejectProposal` · ด่านมองเห็น `executeProposal`) และ `plans.ts` (`listPendingPlans` · `rejectPlan` · ด่านมองเห็น `executePlan`) — `createdAt < addedAt` = "ไม่พบ" · `rejectPlan` ทำเพิ่มเพื่อให้เหมือน `rejectProposal` (ผู้คุมไม่ได้ระบุ) · list = query เพิ่มเฉพาะเมื่อ `conv.room` และผู้ดูไม่ใช่ OWNER/ผู้เปิด
- **R-S1.6b** ข้อความระบบ `authorUserId = "system"` (`SYSTEM_AUTHOR`) · `NOT_SYSTEM_MESSAGE` = `OR [{authorUserId: null}, {authorUserId: {not: "system"}}]` (Prisma `not` ตัด null) ใช้ใน `rooms.listRooms` (unread) · `mobile/conversations.ts` (unread) · `service.sendMessage` (ประวัติของโมเดล) · `listMessages` ยังแสดงข้อความระบบ (H-1) · ไม่มีข้อความ 🔁 ในโค้ดตอนนี้
- **R-S1.6c** `roomPushRecipients(tenantId, roomId)` = ผู้เปิด ∪ สมาชิก ที่ Membership `acceptedAt ≠ null` (**ผู้เปิดที่ถูกถอนก็ตัดด้วย** — ตัดสินใจเอง: ปลอดภัยกว่า) · `worker.pushRoom` ใช้ตัวนี้ · `roomMemberRows` (listMembers/getRoom) กรอง accepted · เพดาน 20 นับเฉพาะ accepted (ใต้ล็อก FOR UPDATE)
- **R-S1.6d** OWNER เพิ่มตัวเอง ⇒ `self` "คุณเห็นทุกห้องอยู่แล้วในฐานะเจ้าของร้าน — ไม่ต้องเพิ่มตัวเองเข้าห้อง" · ผู้เปิดห้องออกเอง ⇒ `forbidden` "ผู้เปิดห้องออกไม่ได้ — ปิดห้องแทน"
- ไฟล์ที่แตะเพิ่ม: `src/lib/ai/proposals.ts` · `src/lib/ai/plans.ts` (hunk ด่านมองเห็น + import — ชนกับเลน d S1.3b ได้ที่ไฟล์เดียวกันแต่คนละ hunk) · `src/lib/ai/secretary/worker.ts` (pushRoom) · `src/lib/mobile/conversations.ts` (unread) · `rooms.ts` (unread) · `service.ts` (history) · docs §5.6 + §9
- ผลรอบ 2:
  - `qc-sec-s1.6` forced #1: `JSON_SUMMARY {"total":16,"passed":16,"failed":[],"skipped":[],"findings":[]}`
  - `qc-sec-s1.6` forced #2: `JSON_SUMMARY {"total":16,"passed":16,"failed":[],"skipped":[],"findings":[]}`
  - `qc-sec-s1.6` unforced: `JSON_SUMMARY {"total":16,"passed":16,"failed":[],"skipped":[],"findings":[]}`
  - `qc-sec-s1.4`: `JSON_SUMMARY {"total":28,"passed":28,"failed":[],"skipped":[],"findings":[]}` (หลัง ORACLE-EDIT s1.4 G-3 ของผู้คุม 4d4a2cd0)
  - `qc-sec-s1.5`: `JSON_SUMMARY {"total":16,"passed":16,"failed":[],"skipped":[],"findings":[]}`
  - `qc-ai-proposals` `{"total":16,"passed":16,"findings":[]}` · `qc-ai-plan` `{"total":7,"passed":7,"findings":[]}` · `qc-mobile-chat` 29/29 exit 0 · `qc-ai-phase-b1` 9/9 · `qc-ai-phase-b2` 11/11 — เท่า baseline ทุกชุด
  - typecheck: 12 errors ทั้งหมดในข้อสอบของใบที่ยังไม่ build (s1.10 2 · s1.13 1 · s1.17 1 · s1.21 5 · s1.7 3) · ไฟล์ที่ใบนี้แตะ 0
  - fitness มี env `{"total":53,"passed":53,"findings":[]}` exit 0 · ไม่มี env `{"total":53,"passed":53,"findings":[]}` exit 0
