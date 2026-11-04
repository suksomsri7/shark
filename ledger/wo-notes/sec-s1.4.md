# WO S1.4 — ห้อง = งาน (`secretary/rooms.ts` + การมองเห็นห้องร่วม R-K1 + ตัวนับงานใน tx เดียว)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-b` branch `wip/sec-s1.4` (ฐาน 6f2710a0) · 2026-11-04 13:2xZ · ผู้คุมงาน: Fable 5.1 · builder: Opus
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.4.md` + COMMON (A.8) + RESOLUTIONS R-K1 R-K2 R-K6 §B.1 §F §G (R-S1.1c)
> ข้อสอบ: `scripts/qc-sec-s1.4.mts` (28 ข้อ · **builder ไม่ได้แก้** · ขอ ORACLE-EDIT 1 จุด §7 — fixture 2 บรรทัดขาด `tenantId`)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/ai/conversation-owner.ts` | แก้ (เพิ่มเท่านั้น · ยัง pure) | `ConvSight.memberOf?/tenantRooms?` · `withRoomSight` · `canSeeConversationId` + memberOf · `canSeeConversation(s,row)` · `visibleConversationWhere` + OR id-in / room isNot null (sight เดิม = รูปเดิม → แยกเป็น `legacyVisibleWhere`) | ✅ |
| `src/lib/ai/conversations.ts` | แก้ | `roomSightFor` (1 query AiRoomMember) · `findVisibleConversation` include room + `canSeeConversation` (ห้องของตัวเอง/ห้องเดิมไม่ query สมาชิก) · `canSeeConversationById` · `canConfirmerSeeConversation` | — |
| `src/lib/ai/service.ts` | แก้ 4 hunk | `listMessages` ใช้ room sight · `sendMessage`: sight ของเทิร์น = `withRoomSight(sightOf, {memberOf:[conv.id]})` เมื่อเห็นผ่านห้องร่วม · ส่ง `sight` เข้า ToolCtx · USER message `authorUserId` เฉพาะห้องที่มี AiRoom | ✅ |
| `src/lib/ai/proposals.ts` | แก้ 2 จุด + import | `rejectProposal` → `canSeeConversationById` · `executeProposal` (≈:400) → `canConfirmerSeeConversation` · `listPendingProposals` ใช้ `findVisibleConversation` อยู่แล้ว (ไม่แก้) | ✅ |
| `src/lib/ai/plans.ts` | แก้ 1 จุด + import | `executePlan` :104 → `canConfirmerSeeConversation` | ✅ |
| `src/lib/ai/tools.ts` | แก้ 2 hunk | `ToolCtx.sight?: ConvSight` · `guarded` ใช้ `ctx.sight ?? sightOf(ctx)` | ✅ |
| `src/lib/ai/secretary/rooms.ts` | ใหม่ | `roomTitleFrom` · `roomStatusOf` · `startRoom` · `roomStatus` · `listRooms` · `getRoom` · `closeRoom` · `renameRoom` | — |
| `docs/modules/31-secretary.md` | แก้ | §0.1 แถว 3 · §0.2 R-K1 · §5.4 · §5.18 · §6 ให้ตรงโค้ด | — |

ไม่แตะ prisma/** · ไม่รัน `prisma generate` · ไม่สร้าง route · ไม่แตะ `src/lib/mobile/**` · ไม่แตะ usage.ts/credit.ts · rooms.ts ไม่ import service.ts

## 2. migration / seed / backfill
ไม่มี (ใช้ตาราง S1.1)

## 3. สรุปด่าน
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D2 | oracle | ✅ (ด้วยสำเนาที่แก้ fixture — ดู §7) | §5 |
| D4 | regression = baseline `sec-baseline-85751098.txt` | ✅ | §5 |
| D5 | typecheck 0 ในไฟล์ที่แตะ · fitness ×2 | ✅ | §5 |
| D10 | docs §5.4/§5.18/§6 | ✅ | commit bdb57034 |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 ขอบเขต | ใช้ | G-1…G-7 · L-2 · L-5 · L-6 (ไม่เห็น = null/"ไม่พบ" แบบเดียวกับไม่มี) |
| X2 ตัวตน | ใช้ | S-3 (actor system/คนละร้าน ⇒ error actor) · ผู้ยืนยันยังผ่าน assertCan เดิม (ไม่แตะ) |
| X3 ยิงพร้อมกัน | ใช้ | S-6 (10 ทาง เหลือ 5 ⇒ 5 สำเร็จ · ตัวนับ = limit) |
| X4 ส่งซ้ำ | N-A | ไม่มี event/consumer ในใบนี้ |
| X5 งานตามเวลา | ใช้ | S-4/S-5 (now ฉีด · เดือนไทย · resetAt 1 ธ.ค. 00:00 BKK) |
| X6 ข้อมูลอันตราย | N-A | ไม่ส่งข้อความเข้าโมเดลใหม่ (startRoom ไม่เรียกโมเดล) |
| X7 endpoint มือถือ | N-A | ไม่มี route (S1.14) |
| X8 PDPA | N-A | ไม่เก็บข้อมูลใหม่นอกจาก title/คำสั่ง (เหมือนแชทเดิม) |
| X9 การกระทำอันตราย | N-A | ปิด/เปลี่ยนชื่อห้อง = ผู้เปิด/OWNER (L-6) · ไม่มี mutation ธุรกิจ |
| X10 ความลับ | ใช้ | ผลของ startRoom มีแค่ jobsUsed/jobsLimit (ไม่มี token/เงิน) |
| X11 ต้นทุน/โควตา | ใช้ | S-2/S-4/S-6 · ข้อความไทยจาก `quotaMessage` |

## 5. ผลข้อสอบ (JSON_SUMMARY จริง)
- `qc-sec-s1.4.mts` **ตัวจริง** forced: S/V ผ่าน 12 ข้อ แล้ว crash ที่ fixture บรรทัด 136 `prisma.aiRoomMember.create` — `Argument \`tenantId\` is missing.` (ไม่ถึง JSON_SUMMARY · exit 1) → ORACLE-EDIT §7
- สำเนาที่แก้เฉพาะ 2 บรรทัด fixture (`tenantId: tid` ที่ :136 และ :147 · ลบแล้ว ไม่ commit):
  - forced #1: `JSON_SUMMARY {"total":28,"passed":28,"failed":[],"skipped":[],"findings":[]}`
  - forced #2: `JSON_SUMMARY {"total":28,"passed":28,"failed":[],"skipped":[],"findings":[]}`
  - unforced: `JSON_SUMMARY {"total":28,"passed":28,"failed":[],"skipped":[],"findings":[]}`
  - residue หลังรัน (tenant `qc-sec-s14-*` · user `qcs14-*` · AiRoom/AiConversation `u~qcs14-*` · AiRoomMember): `{"tenants":0,"users":0,"rooms":0,"convs":0,"members":0}`
- regression (ครั้งละ 1 · `QC_FORCE=1 SHARK_AI_MOCK=1` ผ่าน qc-sec.sh) — เทียบ `sec-baseline-85751098.txt`:
  - qc-ai-phase-b1 `JSON_SUMMARY {"total":9,"passed":9,"findings":[]}` = baseline
  - qc-ai-phase-b2 `JSON_SUMMARY {"total":11,"passed":11,"findings":[]}` = baseline
  - qc-ai-actions `JSON_SUMMARY {"total":12,"passed":11,"findings":["CRASH"]}` = baseline (CRASH เดิม "Cannot read properties of null (reading 'id')")
  - qc-ai-memory `JSON_SUMMARY {"total":7,"passed":7,"findings":[]}` = baseline
  - qc-ai-proposals `JSON_SUMMARY {"total":16,"passed":16,"findings":[]}` = baseline
  - qc-ai-plan `JSON_SUMMARY {"total":7,"passed":7,"findings":[]}` = baseline
  - qc-mobile-chat `qc-mobile-chat: 29/29 ผ่าน · CRITICAL fail 0` exit=0 = baseline (exit=0)
  - qc-mobile-help `qc-mobile-help: 15/15 ผ่าน · CRITICAL fail 0` exit=0 = baseline (exit=0)
  - qc-support-ai `JSON_SUMMARY {"total":7,"passed":7,"findings":[]}` (ไม่มีใน baseline 85751098 — เขียวครบ)
- typecheck `bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=9500M pnpm typecheck`: 0 error ในไฟล์ที่แตะ · error ที่เหลือ: `scripts/qc-sec-s1.2.mts` 8 · `scripts/qc-sec-s1.5.mts` 2 (โมดูลยังไม่สร้าง — รู้อยู่แล้ว) · `scripts/qc-sec-s1.4.mts` 2 (= fixture ขาด `tenantId` ข้อเดียวกับ ORACLE-EDIT)
- fitness มี env: `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` · `env -u DATABASE_URL -u DIRECT_URL`: `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` · pre-commit fitness ผ่านทุก commit

## 7. ข้อแย้ง / มติทางเทคนิค
- **ORACLE-EDIT S1.4-L-fixture** (บรรทัด 136 + 147): `AiRoomMember`/`AiRoomJob` มี `tenantId String` บังคับ (R-S1.1c) แต่ fixture สร้างผ่าน `prisma` ตรงโดยไม่ใส่ ⇒ PrismaClientValidationError แล้วทั้งกลุ่ม L/G ไม่รัน · hunk:
  - `:136` `data: { roomId: staffRoomId, …` → `data: { tenantId: tid, roomId: staffRoomId, …`
  - `:147` `data: { roomId: ownerRoomId, messageId: …` → `data: { tenantId: tid, roomId: ownerRoomId, messageId: …`
  (typecheck ก็จับ 2 จุดนี้ · ไม่มีส่วนอื่นของ oracle เปลี่ยน · สำเนาที่แก้แค่นี้ = 28/28)
- **ชื่อช่อง sight:** ใช้ `memberOf?`/`tenantRooms?` ตามใบ S1.4 + oracle (RESOLUTIONS R-K1 เขียน `tenantAll` — ใบ S1.4 ใหม่กว่าและ oracle ตรวจ `tenantRooms`) · `sightOf`/`sightOfConfirmer` ไม่รับ extra (ตัวอ่าน DB เติมด้วย `withRoomSight`) — docs แก้ตามนี้
- **ToolCtx.sight ใน sendMessage:** `canSeeConversationId` ไม่นับ `tenantRooms` ⇒ ถ้าส่ง roomSight ตรง ๆ OWNER ในห้องของพนักงานจะโดน `guarded` ตัด conversationId (ข้อเสนอไม่ผูกห้อง) · จึงส่ง `withRoomSight(sightOf(ctx), {memberOf:[conv.id]})` = เฉพาะห้องนี้ที่ `findVisibleConversation` ตรวจแถวแล้ว (แคบกว่า tenantRooms) · ห้องเดิม = `sightOf(ctx)` เท่ากับที่ guarded คำนวณเอง
- **authorUserId ใน sendMessage:** เขียนเฉพาะห้องที่มี AiRoom + actor member (G-4 ต้องการ) · ห้องเดิมไม่เขียน = แถวเดิมทุกตัวอักษร (ตามคำสั่งผู้คุม "byte-for-byte") · R-K2 อ่านได้สองทาง — ถ้าผู้คุมต้องการเขียนทุกห้องของ member ให้ตัด `conv?.room &&` (S1.5/S1.6 ทำต่อได้)
- **แผนหมดอายุ:** สถานะ WAITING นับ `AiPlan` PENDING **ที่ยังไม่หมดอายุ** (ใบเขียน "AiPlan PENDING") — ให้ตรงกับ `listPendingPlans` ไม่งั้นห้องค้าง WAITING ทั้งที่ไม่มีอะไรให้อนุมัติ
- **ลำดับสถานะ:** DONE > RUNNING > WAITING > OPEN ตามใบ + oracle S-0 (docs §6 เดิมเขียน WAITING > RUNNING — แก้แล้ว)
- **ตัวนับ:** แถวเดือนสร้างด้วย `createMany … skipDuplicates` (= INSERT … ON CONFLICT DO NOTHING · กันชน unique เมื่อห้องแรกของเดือนเปิดพร้อมกัน — Prisma `upsert` ทั่วไปไม่การันตี) แล้ว conditional `updateMany jobs < limit` · `jobsUsed` อ่านหลังบวกใน tx เดียวกัน (แถวถูกล็อกโดย tx นี้)
- ทางที่เรียกโมเดลเพิ่ม: **ไม่มี** (startRoom ไม่เรียกโมเดล)
- ใครได้/เสียสิทธิ์: สมาชิกห้อง (`AiRoomMember`) ได้อ่าน/ส่งข้อความ/ดู-ยกเลิก-ยืนยันข้อเสนอ/ยืนยันแผน ในห้องเลขานั้น (ยังผ่าน assertCan ของตัวเอง) · OWNER ได้สิ่งเดียวกันในทุกห้องที่มีแถว AiRoom ของร้าน · ห้องเดิมไม่มี AiRoom = ไม่มีใครได้/เสียอะไร (G-2 · baseline เท่าเดิม) · ประตูอื่นที่ใช้ `findVisibleConversation` (`/api/v1/ai/tools/[name]` — actor คีย์ ไม่ได้อะไรเพิ่ม · `member/assistant.ts` · `member/assistant-guard.ts`) ได้กติกาห้องร่วมตามไปด้วย

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| `rejectPlan` (plans.ts :185) ยังใช้ `sightOf` เดิม — สมาชิก/OWNER ยืนยันแผนในห้องร่วมได้แต่ยกเลิกไม่ได้ | ใบให้แตะ plans.ts 1 จุด | S1.6 (หรือผู้คุมอนุญาต 1 บรรทัด `canSeeConversationById`) |
| `listPendingPlans` ใช้ `findVisibleConversation` แล้ว (ได้ห้องร่วมอัตโนมัติ) | — | — |
| `seeHistory=false` ยังไม่กรองใน `listMessages` | ของ S1.6 (oracle G-3 ต้องการให้สมาชิกเห็นข้อความเดิม) | S1.6 |
| `startRoom` ไม่สร้าง `AiRoomJob` / ไม่ส่ง event `ai.room.started` | ใบ: S1.5 ต่อคิว · event ต้องมี consumer+labels+replay | S1.5 |
| `startRoom` ไม่ตรวจ `ai.chat.send` เอง | route ตรวจ (assertCan) | S1.14 |
| `AiRoom.updatedAt` ไม่ขยับเมื่อมีข้อความใหม่ในห้อง (การเรียง listRooms) | worker แตะแถวห้องตอนรันงาน | S1.5 |
| `unread` ใช้ `AiConversation.lastReadAt` ค่าเดียวต่อห้อง (ไม่ใช่ต่อคน) | ไม่มีคอลัมน์อ่านต่อสมาชิก | S1.6 / S2 |
| `crm/ai-bridges.ts:648` ยังใช้ `sightOfConfirmer` string-only | นอกไฟล์ของใบ · ประตู CRM | ผู้คุมตัดสิน |
| `src/lib/mobile/conversations.ts` (จอ 1.0) ลิสต์ห้องเลขาของตัวเองด้วย (u~ ของผู้ใช้) | ใบห้ามแตะ mobile | S2.1 |

## 9. คืนสภาพฐาน QC เลขา
- oracle `finally` ลบตามรายชื่อตาราง + tenant + user `qcs14-*` · ตรวจ 2 ครั้ง (หลังรอบ crash ของตัวจริง + สำเนา forced #1 · และหลังรอบ unforced สุดท้าย): tenant/user/room/conv/member = 0
- คำสั่งซ้ำ: `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.4.mts`
