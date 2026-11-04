# WO S1.9 — งานประจำรันเป็นผู้ตั้ง (ห้องใหม่ต่อรอบ · claim ก่อนรัน)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-d` branch `wip/sec-s1.9` (ฐาน a6f98e88) · 2026-11-04 ~15Z · builder: Opus
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.9.md` (+ COMMON + RESOLUTIONS R-K5 R-K6 R-K8/R-K8b §G)
> ข้อสอบ: `scripts/qc-sec-s1.9.mts` (10 ข้อ · **ไม่ได้แก้** · ขอ ORACLE-EDIT R-4 ดู §7)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/ai/scheduled.ts` | แก้ | `FREQUENCIES` `CHANNELS` `TaskInput` · `createTask` ทางใหม่ (`createOwnedTask`) · `isDue` (pure · bkkParts) · `describeFrequency` · `runScheduledTasks` แยกแถวมี owner → `runOwnedTask` (isDue → claim → Membership สด → startRoom → enqueueRoomJob → runRoomJobs limit 1) · แถวเดิมโค้ดเดิมทุกตัวอักษร | ใช่ (scheduled.ts) |
| `src/lib/ai/secretary/rooms.ts` | แก้ | `startRoom` คืน `messageId` ของข้อความ USER แรก (ไม่เปลี่ยนอย่างอื่น) | – |
| `src/lib/ai/tools.ts` | แก้ hunk `schedule_task` | params optional `frequency` (enum) + `days` (int[]) · ไม่ระบุ = ข้อเสนอเดิมทุกตัวอักษร | ใช่ |
| `src/lib/ai/proposals.ts` | แก้ hunk `ai_schedule_task` + type payload | ส่ง `ownerUserId: userId ?? undefined` + frequency + days · note บอกความถี่ (ไม่มี userId = note เดิม) | ใช่ |
| `docs/modules/31-secretary.md` | แก้ §5.4 (messageId) + §5.17 | สัญญาใหม่ | – |

## 2. migration / seed — ไม่มี (คอลัมน์มาจาก S1.1)

## 4. กลุ่ม X
- X1: งานรันใน tenant ของแถว · ผู้ตั้งต้องเป็นสมาชิกร้านนั้น (createTask + ตอนรัน) — T-1 eO · R-3
- X2: สิทธิ์ = Membership สดของผู้ตั้งทุกรอบ (ถูกถอน = ข้าม) · worker บังคับสิทธิ์ตอน execute — R-3
- X3: ตัวนับงานที่ startRoom (conditional updateMany เดิม) — R-1/R-2 counter
- X5: claim ก่อนรัน conditional updateMany · สองรอบซ้อน = ห้องเดียว · นาฬิกาฉีด — R-2
- X11: งานประจำ 1 รอบ = 1 งาน (startRoom) · โควตาหมด = ข้าม ไม่ throw — R-4 (ดู §7)
- X4 X6–X10: N-A (ไม่มี event ใหม่ · ไม่มี endpoint · instruction ผ่านทางเดิมของ sendMessage)

## 5. ผลข้อสอบ
- `qc-sec-s1.9` forced #1 / #2 / unforced: `JSON_SUMMARY {"total":10,"passed":9,"failed":["R-4"],"skipped":[],"findings":[{"id":"R-4","sev":"CRITICAL"}]}` ×3 (R-4 = บั๊กข้อสอบ §7)
- regression vs `ledger/qc-baseline/sec-baseline-85751098.txt`: qc-ai-schedule 8/8 · qc-ai-proposals 16/16 · qc-ai-tools 18/18 (= baseline) · qc-sec-s1.4 28/28 · qc-sec-s1.5 16/16
- typecheck: 8 errors ทั้งหมดเป็น `scripts/qc-sec-s1.{6,7,10,13,17}.mts` import โมดูลของใบอนาคต (มีอยู่ก่อน) · 0 ในไฟล์ที่แตะ
- fitness มี env / `env -u DATABASE_URL -u DIRECT_URL`: 53/53 ทั้งคู่

## 7. ข้อแย้ง / มติทางเทคนิค
- **ORACLE-EDIT s1.9-R-4**: ข้อ R-4 คาด `roomsQ === 2` แต่รอบ R-3 (NOW3 = 12 พ.ย. 18:00) งาน DAILY ของ owner (`okD`) ถึงเวลาจริงและเปิดห้องที่ 3 ถูกต้อง (R-3 ตรวจแค่ห้องของ staff) — หลักฐานว่าทาง quota ถูก: `ran4=1` (แถวเดิมเท่านั้น · งานใหม่ข้าม). เสนอ hunk: เก็บ `const roomsBefore4 = await prisma.aiRoom.count({ where: { tenantId: tid, startedById: U.owner } });` ก่อน `runScheduledTasks(NOW4…)` แล้วเปลี่ยน `roomsQ === 2` → `roomsQ === roomsBefore4` (หรือ `=== 3`). หมายเหตุ: R-4 ตั้ง counter กลับเป็น 2 ภายหลัง แต่ไม่กระทบข้ออื่น
- ลำดับใน `runOwnedTask`: ทำ `isDue` (pure บนแถวที่อ่านมา) **ก่อน** claim แทน claim ก่อน isDue — ผลเท่ากัน แต่ไม่ตั้ง lastRunDay ให้งาน WEEKLY/MONTHLY ในวันที่ไม่ใช่วันของมัน
- claim แล้วข้าม (ผู้ตั้งถูกถอน / โควตาหมด / enqueue ล้ม) = ไม่ลองซ้ำในวันเดียวกัน (ตามใบ)
- worker นำเข้าแบบ dynamic ใน scheduled.ts (กันวงกลม worker → service → … → proposals → scheduled)
- provider ของทางใหม่ = provider เดียวกับทางเดิม (`deps.provider ?? resolveProvider("fast")`) ส่งเข้า `runRoomJobs` · ไม่มี provider = คืน 0 ก่อน claim (ทางเดิม)
- ทางที่เรียกโมเดลเพิ่ม: ไม่มีทางใหม่ — เรียกผ่าน `runRoomJobs → sendMessage` (คิดเงินตามเดิม) + นับงานที่ `startRoom`
- ใครได้/เสียสิทธิ์: งานประจำที่ยืนยันจากข้อเสนอที่รู้ตัวคนกด รันด้วยสิทธิ์คนกด (เดิม = system actor สิทธิ์ต่ำสุด) · ผลส่งถึงผู้ตั้ง (push + ห้อง) ไม่ใช่ AppNotification ทั้งร้าน · แถวเดิมไม่เปลี่ยน

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| `channels: ["room"]` ยังได้ push | worker `pushRoom` push ทุกครั้ง — ตัวกรองต้องแก้ `worker.ts` (นอกใบ) | ผู้คุมเลือก (S1.23 push prefs?) |
| `runRoomJobs limit 1` หยิบงานเก่าสุดในคิวกลาง | ถ้าคิวมีงานค้างของร้านอื่น งานนี้รอตัวเก็บตกรายนาที (R-K8b) — ไม่ผิด แต่ช้าได้ 1 นาที | – |
| MONTHLY วันที่ 29–31 ในเดือนที่สั้นกว่า = ไม่รัน | ตามสัญญา isDue (วันที่ไทย ∈ days) | UI S2.x เตือน |

## 9. คืนสภาพฐาน QC
- ข้อสอบ `finally` ลบ tenant `qc-sec-s19x-*` + user `qcs19x-*` + pushDevice · ไม่ได้รัน seed
