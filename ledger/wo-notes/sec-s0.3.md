# WO S0.3 + S0.4 — สัญญาข้อมูล + API doc + QC seed · แพ็กฟรี

> RUN "เลขา AI" (SECRETARY) · เลน c `/root/projects/shark-sec-c` branch `wip/sec-s0.3` (ff ไป d4cbb6ce ก่อน commit งาน) · 4 พ.ย. 2026 · builder: Opus (เลน c)
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S0.3.md` (+ COMMON + RESOLUTIONS) · schema §4 จาก `sec-brief-S1.1.md` + migration ที่ merge แล้ว
> ข้อสอบ: `scripts/qc-sec-s0.3.mts` (53 ข้อเมื่อมีฐาน · commit test: f92f3466 · **แก้หลัง commit: ไม่**)

## 1. ไฟล์ที่แตะ (ใหม่ทั้งหมด · ไม่แตะ hot file · ไม่แตะ prisma/ หรือสคริปต์เดิม)
| ไฟล์ | ทำอะไร |
|---|---|
| `docs/modules/31-secretary.md` | §0 มติ 16 + R-K1…R-K20 · §1 persona/10 stories/เส้นสาธิต 3 · §2 IA · §3 38 หน้า · §4 16 โมเดล + คอลัมน์ nullable · §5 service API ต่อไฟล์ · §6 state machine · §7 สิทธิ์ · §8 โควตา · §9 event 7 ตัว · §10 PDPA/X1–X11/ลำดับ deploy · §11 ตัดออก |
| `docs/api/SECRETARY-API.md` | 72 แถว route (method · path · Bearer · NEW/EXISTS · zod · DTO · rate-limit · errors ไทย · จอ) |
| `scripts/sec-qc-env.mts` | `loadSecQcEnv` — ยอมเฉพาะ ep-calm-flower-aosbmxhm + ต้องมี SEC_QC_HOST · ไม่โหลดไฟล์ env เอง · exit 4 |
| `scripts/sec-qc-data.mts` | `SEC` ค่าล้วน · ร้าน A/B · ผู้ใช้ 6 · ห้อง 6 · ข้อเสนอ 2 · แชท 2×4 · ตอบเร็ว 2 · เคส 1 · `pending` (เบอร์ · เลขา · ห้อง/สมาชิก/คิว · ระดับ · ตัวนับ · คำเชิญ) |
| `scripts/seed-secretary-qc.mts` | idempotent (อ่าน → diff → เขียนเฉพาะต่าง) · ลบเฉพาะแถวเกินของตารางที่ถือในร้าน secqc · TODO(S1.1)/NOTE ตามการตรวจตอนรัน |
| `src/lib/ai/secretary/pack.ts` | S0.4 pure · `FREE_PACK` · `SECRETARY_LAUNCH_AT` · `countsAsJob` · `quotaMessage` · `nextResetBangkok` · `monthKeyBangkok` |
| `ledger/wo-notes/sec-s0.3.md` | ไฟล์นี้ |

Commits: 58be61ef docs · 344e195b seed · d8f36e7f pack · 5c4bb7e6 wo-notes · (+ fix ชนิดใน seed) — pre-commit fitness ผ่านทุกครั้ง

## 2. seed
- รันจริง (หลัง secretary_a ลงฐาน QC แล้ว): รอบ 1 `JSON_SUMMARY {"suite":"seed-secretary-qc","ok":true,"created":{"aiMessage":11,"aiProposal":2,"chatContact":2,"chatConversation":2,"chatMessage":8,"chatQuickReply":2,"supportCase":1,"supportMessage":1},"updated":{},"removed":{}}` (ร้าน/ระบบ/ผู้ใช้/ห้อง ถูกสร้างไปแล้วในรอบที่ล้มก่อน migration ลง — ดู §7)
- รอบ 2 `JSON_SUMMARY {"suite":"seed-secretary-qc","ok":true,"created":{},"updated":{},"removed":{}}`
- `SEED_SUMMARY {"A":{"systems":6,"memberships":5,"aiConversations":6,"aiMessages":11,"aiProposalsPending":1,"chatConversations":2,"chatMessages":8,"chatQuickReplies":2,"supportCases":1},"B":{"systems":0,"memberships":1,…0},"users":6}`
- ไม่เขียนตาราง S1.1 ใด ๆ (ไม่มีการอ้าง delegate ของ S1.1 ในไฟล์ — grep ว่าง) · ตอนนี้ client มีโมเดลครบ ⇒ ไม่พิมพ์ TODO(S1.1) · พิมพ์ `NOTE(S1.1+)` แทน
- TODO(S1.1) ที่ seed พิมพ์เมื่อยังไม่มีตาราง (feature-detect `"<delegate>" in prisma` + `Prisma.dmmf` คอลัมน์): AiSecretary, AiRoom, AiRoomMember, AiRoomJob, AiSystemAccess, AiApprovalRule, AiActionLog, AiJobCounter, AiLesson, StaffInvite, ChatRoutingRule, ChatShift, ChatConversationHelper, UserPhone, PhoneOtp, AiNotifyPref + คอลัมน์ AiMessage.authorUserId, AiMemory.status, AiScheduledTask.{ownerUserId,frequency,days,channels}, AiTrainingSample.{outcome,editedReply,stepsJson,roomId,proposalId}, SupportCase.{source,category,roomId}

## 5. ผลข้อสอบ
- `qc-sec-s0.3` forced (ไม่มีฐาน · ก่อนได้ .env.qc-sec): `JSON_SUMMARY {"total":37,"passed":35,"failed":[],"skipped":["D2.5","D4.3"],"findings":[]}`
- forced #1 (ฐาน QC เลขา): `JSON_SUMMARY {"total":53,"passed":52,"failed":[],"skipped":["D4.3"],"findings":[]}` exit 0
- forced #2: `JSON_SUMMARY {"total":53,"passed":52,"failed":[],"skipped":["D4.3"],"findings":[]}` exit 0
- forced #3 (หลังแก้ชนิดใน seed): `JSON_SUMMARY {"total":53,"passed":52,"failed":[],"skipped":["D4.3"],"findings":[]}` exit 0 · seed ซ้ำ `created/updated/removed` ว่าง
- fitness: มี env (qc-sec.sh) `ผ่าน 53/53 · CRITICAL 0 · MAJOR 0 · MINOR 0` · `env -u DATABASE_URL -u DIRECT_URL` `ผ่าน 53/53 · 0/0/0`
- typecheck: ครั้งที่ 1 (heap 5632) OOM ไม่มีผล · ครั้งที่ 2 (heap 7680 · ISO_MEM 9000M) พบ error ชนิดใน seed ของใบนี้ (namespace Prisma + attachmentsJson) → แก้ + ตรวจด้วย tsc เฉพาะไฟล์ของใบนี้ (0 error) · ครั้งที่ 3 เต็ม: **0 error ในไฟล์ของใบนี้** · เหลือ 13 error ในข้อสอบของผู้คุมเท่านั้น: `qc-sec-s1.2.mts` 8 + `qc-sec-s1.4.mts` 3 (ใบที่ยังไม่สร้าง — module `@/lib/ai/secretary/{secretary,access,rooms}` ยังไม่มี · มาจาก d4cbb6ce) · `qc-sec-s0.2.mts` 1 + `qc-sec-ui.mts` 1 (TS1501 regex flag ต้อง es2018 · ของ S0.2) — ไม่ใช่ของใบนี้ ไม่แก้ (ห้ามแตะสคริปต์เดิม)

## 7. มติทางเทคนิค / เหตุรอ
- **รอ env + migration**: ทรีนี้ไม่มี `.env.qc-sec` ตอนเริ่ม (qc-sec.sh exit 2) → แจ้งผู้คุม · ระหว่างนั้น lane b รัน `prisma generate` ลง node_modules ร่วม ⇒ `@/lib/core/db` ล้มเพราะ scope.ts ของทรีนี้ไม่รู้จัก 16 โมเดล → ff ไป d4cbb6ce ตามคำสั่ง · seed รอบแรกล้ม P2022 (`AiMessage.authorUserId` ยังไม่มีในฐาน) หลังเขียน ร้าน/ระบบ/ผู้ใช้/ห้อง ไปแล้ว → ผู้คุม apply secretary_a → seed รอบใหม่ reconcile ครบ
- **จับคู่ห้อง AI**: รหัสห้องสุ่มจาก `newConversationId` ⇒ กุญแจ = (prefix ผู้สร้าง `u~<userId>~` + `title`) · แก้ชื่อใน SEC = สร้างห้องใหม่ + ลบห้องเดิม
- **ข้อเสนอ PENDING**: `expiresAt` คงค่าถ้าเหลือ ≥ 1 ชม. ไม่งั้นต่อ 24 ชม. (รันซ้ำไม่เขียน · D2.17 "อนาคต" ผ่านเสมอ)
- **sec-qc-env ไม่โหลดไฟล์ env** (ต่างจาก svc-qc-env) — qc-sec.sh export ให้แล้ว · กันการเปิดไฟล์ความลับจากสคริปต์
- **แชท LINE** ไม่มีแถว `ChatChannelConnection` (ต้องมี credentials เข้ารหัส) · contact อย่างเดียว ไม่ผูก CRM/สมาชิก
- **แถวเกิน**: ลบเฉพาะในร้าน A (AiConversation/AiMessage/AiProposal/ChatConversation+ลูก/ChatContact/ChatQuickReply/SupportCase) + Membership ของทั้งสองร้าน · AppSystem เกิน = แจ้งไม่ลบ · ร้าน B ไม่ลบแถว AI/แชท
- **§4 ต่างจากใบ S1.1 แบบตั้งใจ 2 จุด** (D1.6 ห้ามคำ `minute` และ `User.phone` ใน §4): "no `minute`" เขียนเป็น "ไม่มีคอลัมน์นาที" · "core.prisma FROZEN — no User.phone" เขียนเป็น "เบอร์อยู่ที่ตาราง UserPhone" · และปรับตาม migration ที่ merge จริง: AiSecretary/UserPhone/ChatConversationHelper ไม่มี FK (อ้างเชิงตรรกะ) · AiRoomMember/AiRoomJob/ChatShift/ChatConversationHelper มี `tenantId`
- **ชื่อ `quotaMessage` ซ้ำ** กับ usage.ts (คนละโมดูล) — ตามที่ใบสั่งกำหนด · จดใน §5.1
- path ไฟล์ที่ยังไม่มี เขียนแบบ "ชื่อ (แผน · โฟลเดอร์)" ไม่ใส่ backtick path เต็ม (fitness F7.1)
- ทางที่เรียกโมเดลเพิ่มในใบนี้: ไม่มี · ใครได้/เสียสิทธิ์: ไม่มี (เอกสาร + seed + pure)

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| seed ไม่เขียน `SEC.pending` ลงตาราง S1.1 (เบอร์ · เลขา · AiRoom/สมาชิก/คิว · ระดับ · ตัวนับ · คำเชิญ) | นอกขอบเขตใบนี้ (ผู้คุมสั่ง) | S1.4 S1.5 S1.6 S1.3 S1.13 S1.19 S1.25 (ต่อ seed) |
| API doc = สัญญา ยังไม่ generate จากโค้ด | route ยังไม่มี | S1.14 S1.21 |

## 9. คืนสภาพฐาน QC เลขา
- seed รันซ้ำ = 0 เขียน · ข้อสอบ D2.8 จำนวนแถวร้านอื่นไม่เปลี่ยน · ไม่มีแถวค้างนอก secqc-*
