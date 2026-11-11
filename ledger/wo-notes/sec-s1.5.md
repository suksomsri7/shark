# WO S1.5 — คิวเบื้องหลังห้องเลขา (`secretary/worker.ts` · lease · X5 · retry · push · งานรายนาที)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-b` branch `wip/sec-s1.5` (ฐาน e78492a6) · 2026-11-04 14:0xZ · ผู้คุมงาน: Fable 5.1 · builder: Opus
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.5.md` + COMMON + RESOLUTIONS R-K2 R-K6 R-K8 R-K8b R-K20 §G (R-S1.1c)
> ข้อสอบ: `scripts/qc-sec-s1.5.mts` (16 ข้อ · commit test 00086018 + 0261666b · **builder ไม่ได้แก้** · ไม่มีคำขอ ORACLE-EDIT) · ผ่านตั้งแต่รอบแรก

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/ai/secretary/worker.ts` | ใหม่ | `ROOM_JOB_LEASE_MS` · `ROOM_JOB_MAX_ATTEMPTS` · `ROOM_JOBS_MINUTE_JOB` · `enqueueRoomJob` · `sendRoomMessage` · `runRoomJobs` · `registerRoomJobsMinuteJob` | — |
| `src/lib/ai/secretary/room-jobs-job.ts` | ใหม่ | import = ลงทะเบียน `secretary.roomJobs` (everyMinutes 1) | — |
| `src/lib/ai/service.ts` | แก้ 4 hunk | deps `userMessageId?` (ไม่สร้าง USER ซ้ำ · history `NOT id` · ห้องที่มองไม่เห็น ⇒ throw ไม่เปิดห้องใหม่) + **addendum ผู้คุม**: `secretaryOf(...).catch(() => null)` (getAccess คงล้มแบบปิด) | ✅ |
| `scripts/crm-cron.mts` | แก้ 2 บรรทัด | `await import("@/lib/ai/secretary/room-jobs-job")` ถัดจาก sequences-job | — |
| `src/app/api/cron/outbox/route.ts` | แก้ 1 บรรทัด | `import "@/lib/ai/secretary/room-jobs-job"` (hook `runMinuteJobs` เห็นงานนี้) | — |
| `docs/modules/31-secretary.md` | แก้ | §5.5 เขียนใหม่ให้ตรงโค้ด · §6 หมายเหตุ job/closed | — |

ไม่แตะ prisma/** · ไม่รัน generate · ไม่แตะ vercel.json · rooms.ts ไม่ import worker.ts · ไม่สร้าง route (S1.14)

## 2. migration / seed / backfill
ไม่มี (ใช้ `AiRoomJob` ของ S1.1)

## 3. สรุปด่าน
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D2 | oracle forced ×2 + unforced (+ forced อีกรอบหลัง addendum) | ✅ | §5 |
| D4 | regression = baseline `sec-baseline-85751098.txt` + qc-sec ใบก่อน | ✅ (s0.3 D1.7 แดงตั้งแต่ HEAD — ไม่ใช่ของใบนี้ §7) | §5 |
| D5 | typecheck 0 ในไฟล์ที่แตะ · fitness ×2 | ✅ | §5 |
| D10 | docs §5.5/§6 | ✅ | commit |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | check ids / เหตุผล |
|---|---|---|
| X1 ขอบเขต | ใช้ | W-2 (MANAGER ไม่ใช่สมาชิก ⇒ not_found) · ทุกการเขียนของ worker ผูก tenantId ของแถว · ห้องร้านอื่น = not_found |
| X2 ตัวตน | ใช้ | R-6 (Membership สดทุกรอบ · ถูกถอน ⇒ FAILED ไม่เรียกโมเดล) · sendMessage รันด้วยสิทธิ์ผู้สั่ง |
| X3 ยิงพร้อมกัน | ใช้ | enqueue idempotent (P2002 ⇒ แถวเดิม) · W-1 |
| X4 ส่งซ้ำ | ใช้ | W-1 (messageId เดิม = แถวเดิม) |
| X5 งานตามเวลา | ใช้ | R-3 lease · R-4 สองรอบขนาน = โมเดล 5 ครั้งพอดี · R-5 retry/FAILED · fencing `attempts` ตอนเขียนผล · `now` ฉีดได้ |
| X6 injection | N-A | ไม่มีข้อความใหม่เข้า prompt (ใช้ sendMessage เดิม) |
| X7 endpoint มือถือ | N-A | ไม่มี route (S1.14) |
| X8 PDPA | ใช้ | push body = คำตอบ ≤ 120 ตัว ถึงเฉพาะผู้เปิด ∪ สมาชิกห้อง (P-1 ไม่ถึง owner/manager) |
| X9 การกระทำอันตราย | N-A | worker ไม่ execute ข้อเสนอ |
| X10 ความลับ | ใช้ | job.error = ข้อความไทยทั่วไป · error ดิบของผู้ให้บริการไป logOps WARN เท่านั้น |
| X11 ต้นทุน | ใช้ | ทุกการเรียกผ่าน sendMessage (chargeUsageSafe source CHAT · AiUsage) · ไม่นับงาน (W-2 jobs = 1) |

## 5. ผลข้อสอบ
- `qc-sec-s1.5` forced #1: `JSON_SUMMARY {"total":16,"passed":16,"failed":[],"skipped":[],"findings":[]}` exit 0
- forced #2: `JSON_SUMMARY {"total":16,"passed":16,"failed":[],"skipped":[],"findings":[]}` exit 0
- unforced: `JSON_SUMMARY {"total":16,"passed":16,"failed":[],"skipped":[],"findings":[]}` exit 0
- forced หลัง addendum `secretaryOf.catch`: `JSON_SUMMARY {"total":16,"passed":16,"failed":[],"skipped":[],"findings":[]}` exit 0 · residue: `finally` ลบร้าน/ผู้ใช้ `qcs15-*`/PushDevice `qcs15-`
- qc-crm-c0.5 (route outbox ที่ import room-jobs-job · ไม่อยู่ใน baseline): `JSON_SUMMARY {"total":50,"passed":50,"findings":[],...}` exit 0
- regression (ก่อน addendum) เทียบ baseline 85751098 — เท่ากันทุกชุด:
  - qc-ai-brain `JSON_SUMMARY {"total":8,"passed":8,"findings":[]}` (หลัง addendum ซ้ำ: เท่าเดิม)
  - qc-ai-schedule `JSON_SUMMARY {"total":8,"passed":8,"findings":[]}`
  - qc-ai-proactive `JSON_SUMMARY {"total":6,"passed":6,"findings":[]}`
  - qc-chat-push-badge `JSON_SUMMARY {"total":48,"passed":48,"findings":[]}`
  - qc-chat-notify-v2 `JSON_SUMMARY {"total":30,"passed":30,"findings":[]}`
  - qc-mobile-chat `qc-mobile-chat: 29/29 ผ่าน · CRITICAL fail 0` exit 0 (baseline exit 0)
  - qc-crm-c2.2 (ไม่อยู่ใน baseline) `JSON_SUMMARY {"total":73,"passed":73,"findings":[]}`
- qc-sec ใบก่อน (หลัง addendum): s0.2 `{"total":30,"passed":30,...}` · s1.1 `{"total":66,"passed":66,...}` · s1.2 `{"total":28,"passed":28,...}` · s1.4 `{"total":28,"passed":28,"failed":[],"skipped":[],"findings":[]}` · s0.3 `{"total":53,"passed":51,"failed":["D1.7"],"skipped":["D4.3"]}` — D1.7 = docs §5 ไม่มี `listAccess(`/`sightForUser(` **ตั้งแต่ HEAD e78492a6** (ตรวจ `git show HEAD:docs/...` = 0 ทั้งคู่) ไม่ใช่ของใบนี้
- typecheck (`ISO_MEM=9500M`): error 8 ตัว ทั้งหมดใน `scripts/qc-sec-s1.19.mts` (4) · `qc-sec-s1.6.mts` (1) · `qc-sec-s1.7.mts` (3) = oracle ของใบที่ยังไม่สร้าง · ไฟล์ที่แตะ 0
- fitness ×2: D-1/D-2 ของ oracle PASS (มี env / `env -u DATABASE_URL -u DIRECT_URL`)

## 7. มติทางเทคนิค
- **ความถี่ outbox ใน deploy (R-K8 สั่งจด):** `vercel.json` มีแค่ `/api/cron/tick` (รายวัน 20:00Z) + `/api/cron/hourly` · ไม่มีตัวตั้งเวลาใดชี้ `/api/cron/outbox` (ตรงกับคอมเมนต์ `scripts/crm-cron.mts:9`) ⇒ hook ใน outbox = ของแถม · ตัวเก็บตกจริง = crontab VPS `* * * * * … crm-cron.mts minute` (มีอยู่แล้วบนเครื่อง · ทรี shark-in-th) ⇒ งานค้างถูกเก็บภายใน ~1 นาที + lease 2 นาที
- ไม่ผูกใน `api/cron/hourly` (R-K8b แทน R-K8: รางรายนาทีพอ · qc-crm-c2.10 S4.3 ห้ามเสียบงานรายนาทีเข้า tick/hourly)
- `RoomJobDeps.deadline?` (เพิ่มจากใบ · ไม่บังคับ): งานรายนาทีส่ง `ctrl.deadline − 8 วิ` ⇒ หยุดหยิบงานใหม่เมื่องบรอบ 20 วิ ใกล้หมด (โมเดล 5 ตัว × หลายวินาทีเกินงบ — ไม่งั้นได้ `cut-off` ทุกนาที)
- fencing: เขียนผล (DONE/FAILED/QUEUED) ด้วย `updateMany where {id, status RUNNING, attempts = ค่าตอน claim}` ⇒ รอบที่ lease หมดแล้วถูกหยิบต่อ เขียนทับผลของรอบใหม่ไม่ได้ (outcome "lost" ไม่นับ ไม่ push)
- ผู้สั่งพ้นห้อง (มี Membership แต่มองไม่เห็นห้องแล้ว) ⇒ FAILED "ผู้สั่งไม่ได้อยู่ในห้องนี้แล้ว" ก่อนเรียก sendMessage (ไม่ retry) · sendMessage + userMessageId + มองไม่เห็น ⇒ throw (ไม่เปิดห้องใหม่เงียบ ๆ)
- job.error ของการ throw = "เลขาติดขัดชั่วคราว…" / "…ไม่สำเร็จหลังลอง 3 ครั้ง" (ไม่ใส่ข้อความดิบ — X10) · !ok ⇒ `usage.quotaMessage(scope, resetAt)` / AI ปิด / ว่าง
- push หลัง FAILED = "ทำไม่ได้: <เหตุ>" (ยกเว้นข้อมูลหาย ERR_MISSING ไม่ push) · ไม่ push ตอนกลับคิว
- `sendRoomMessage` แตะ `AiRoom.updatedAt` ใน tx เดียว (ห้องที่มีข้อความใหม่ขึ้นบนของ listRooms)
- ทางที่เรียกโมเดลเพิ่ม: `runRoomJobs` → `service.sendMessage` (คิดเงินเดิม `chargeUsageSafe` source CHAT + AiUsage) — ไม่มีทางใหม่ที่ไม่ผ่าน meter
- ใครได้/เสียสิทธิ์: ไม่เปลี่ยน · ผู้ส่งข้อความในห้อง = ผู้เห็นห้อง (ผู้เปิด ∪ สมาชิก ∪ OWNER) · งานรันด้วยสิทธิ์สดของผู้สั่ง
- addendum ผู้คุม (S1-2 retro FIX-NOW): `secretaryOf(ctx.actor.userId).catch(() => null)` ใน Promise.all ของ sendMessage + คอมเมนต์ไทย 1 บรรทัด · `getAccess` ไม่แตะ

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| `imageUrls` ของ `sendRoomMessage` ไม่ถึงโมเดลทางคิว | ไม่มีคอลัมน์เก็บรูปบน AiMessage/AiRoomJob (ห้ามแตะ prisma) — รับพารามิเตอร์ไว้ตามลายเซ็นแต่ไม่ใช้ | S1.14 (route: ส่งรูปตรงหรือเพิ่มคอลัมน์ใน migration secretary_b) |
| ไม่มี serialization ต่อห้อง: 2 ข้อความในห้องเดียวที่ส่งห่างกันไม่กี่วินาที อาจรันพร้อมกันคนละรอบ (`after()` สองตัว) ⇒ คำตอบสลับลำดับได้ · job แรกเห็นข้อความที่ตามมาทีหลังใน history | ใบกำหนด claim ต่อ job (ไม่ระบุล็อกต่อห้อง) · ทำให้ถูกต้องต้องล็อกแถวห้องใน tx | ผู้คุมตัดสิน (S1.14 อาจรัน `runRoomJobs` เฉพาะ job ของ request นั้น / ล็อกห้อง) |
| event `ai.room.status_changed` + ข้อความระบบ "ทำไม่สำเร็จ" ในห้องตาม §6 | ใบไม่สั่ง · event ต้องมี consumer+label 3 ที่+oracle replay | ใบที่รับ event ห้อง (S1.6/S1.14) |
| docs §6 แผนภาพ "DONE ── ข้อความใหม่ = เปิดต่อ" ขัดกับ oracle W-3 (ห้องปิด ⇒ closed) | ทำตาม oracle/ใบ · จดหมายเหตุใน §6 แล้ว | ผู้คุมแก้แผนภาพ |
| qc-sec-s0.3 D1.7 (docs §5 ขาด `listAccess(` · `sightForUser(`) | แดงตั้งแต่ HEAD e78492a6 — ชื่อจริงในโค้ด S1.3/S1.4 ต่างจากรายชื่อใน oracle s0.3 | ผู้คุม (ORACLE-EDIT s0.3 หรือเติม docs §5.3/§5.4) |

## 9. คืนสภาพฐาน QC เลขา
ข้อสอบ `finally` ลบร้าน `qc-sec-s15-*` + แถว tenant ทุกตาราง + PushDevice `ExponentPushToken[qcs15-` + ผู้ใช้ `qcs15-*` · ไม่มี seed เปลี่ยน
