# WO S1.10 + S1.15 (batch S1-8) — ตีกลับ+สอน+แก้ก่อนอนุมัติ (`secretary/teach.ts`) · วงจรเรียนรู้ (`secretary/learn.ts`)

> RUN "เลขา AI" · tree ผู้คุม `/root/projects/shark-sec` · เลน `shark-sec-b` branch `wip/sec-s1.10` (ฐาน = ทิปผู้คุม 244fb955) · 2026-11-04 (UTC)
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S1.10.md` (+ COMMON + RESOLUTIONS R-K3 · §C Q9 · §B.4 · §J R-S1.6b · §K · §M R-S1.12e · §O)
> ข้อสอบ `scripts/qc-sec-s1.10.mts` (13 ข้อ · builder ไม่ได้แก้ — ขอ ORACLE-EDIT 3 ข้อ §7)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | COMMON §D |
|---|---|---|---|
| `src/lib/ai/secretary/teach.ts` | ใหม่ | `rejectWithNote` · `editProposal` · `validateProposalInput` · `pendingMemories` · `confirmMemory` · `rejectMemory` | – |
| `src/lib/ai/secretary/learn.ts` | ใหม่ | `recordOutcome` · `noteLesson` · `listLessons` · `confirmLesson` · `rejectLesson` · `lessonBlock` · `recordExecutedProposal` (hook) · `scrubText` · `normalizePattern` · `changedKeys` | – |
| `src/lib/ai/memory.ts` | แก้ | `rememberFact(…, opts?: {pending})` · `listMemories(…, {includePending})` · ไม่รวม PENDING · `MEMORY_PENDING` | ใช่ |
| `src/lib/ai/conversation-owner.ts` | แก้ (เพิ่มเท่านั้น · ยัง pure) | `newShopMemoryId(ctx)` · `memoryAuthorOf(id)` | ใช่ |
| `src/lib/ai/tools.ts` | แก้ 1 hunk | `remember_fact`: ห้องเลขา + ไม่ใช่ OWNER ⇒ pending (R-K3) | ใช่ |
| `src/lib/ai/proposals.ts` | แก้ 2 hunk | hook `secRecordOutcome` หลัง `secRecordAction` (dynamic import learn) | ใช่ |
| `src/lib/ai/persona.ts` | แก้ | `PersonaContext.lessons` + บล็อก "บทเรียนที่เจ้าของยืนยันแล้ว:" (หลัง digest/customer ก่อนกติกา) | – |
| `src/lib/ai/service.ts` | แก้ 2 จุดติดกันในทางเดียว | `lessonBlock` ใน Promise.all (dynamic import · `.catch(() => "")`) + ส่ง `lessons` เข้า buildSystemPrompt | ใช่ |
| `src/lib/modules/chat/ai-suggest.ts` | แก้ | `learnFromSuggestion` สะพาน §O (ปิดหนี้ S1.22) | – |
| `docs/modules/31-secretary.md` | แก้ | §5.10 · §5.11 เขียนใหม่ตามของจริง | – |

## 2. migration — ไม่มี (คอลัมน์ `AiMemory.status` · `AiTrainingSample.{outcome,editedReply,stepsJson,roomId,proposalId}` · `AiLesson` มีจาก secretary_a)

## 3. มติ/ส่วนเบี่ยง (ให้ผู้คุมตัดสิน)
1. **JOB ไม่จดบทเรียน** — ใบสั่งเขียน "JOB ⇒ ไม่จดอะไร" และ hook "rejectWithNote ⇒ noteLesson" · ข้อสอบ L-2 บังคับ: ถ้า JOB จดบทเรียน (pattern "ใส่กำหนดส่งด้วย" จาก T-1) n1/n2 จะชนแถวนั้น ⇒ n1.suggest = true หรือ n2.id ≠ n1.id เสมอ ⇒ ตีความ: JOB = ไม่จดความจำและบทเรียน · RULE = ความจำ + บทเรียน · recordOutcome REJECTED ทุกครั้ง
2. **normalizePattern ตัดช่องว่างระหว่างอักษรไทย** — L-2 ต้องให้ "ใส่กำหนดส่ง ด้วย" = "ใส่กำหนดส่งด้วย" (ภาษาไทยไม่เว้นวรรคระหว่างคำ) · ช่องว่างระหว่างคำอังกฤษคงไว้ (ยุบเหลือ 1)
3. **ข้อความระบบ 🔁 เขียน `authorUserId = "system"`** ตาม R-S1.6b (ข้อสอบ T-1 คาด null — ORACLE-EDIT §7)
4. **APPROVED/EDITED บันทึกเฉพาะห้องเลขา (มี `AiRoom`)** — ห้อง AI เดิมไม่มีแถว AiTrainingSample เพิ่ม (COMMON §C.11) · REJECTED ผ่าน `rejectWithNote` บันทึกทุกห้อง (เป็นการกระทำใหม่ของใบนี้) · ขั้นของแผน (`runKind`) ไม่บันทึกผล
5. **สะพานแชทไม่เก็บเนื้อข้อความ** (คำตอบลูกค้ามักมีชื่อลูกค้า — COMMON §C.9) เก็บแค่ `after = { similarity }` · kind `chat.suggest` · model `chat-suggest` · ⚠️ ทำให้ `recordSuggestionOutcome` เขียน AiTrainingSample เพิ่ม 1 แถวต่อผลคำแนะนำ (ร้านเดิมด้วย — ตามที่ §O/wo-notes S1.22 สั่ง) · ตาราง AiTrainingSample ไม่มี FK ⇒ ชุดทดสอบเดิมที่ลบ tenant จะเหลือแถวกำพร้า (ดู §8)
6. `rejectLesson` คนที่ไม่ใช่ OWNER = `ForbiddenError` (สมมาตรกับ confirmLesson · ใบสั่งไม่ระบุ) · `rejectMemory` ลบความจำของร้านได้ทั้งที่รอยืนยันและยืนยันแล้ว (T-4 ลบแถวที่ยืนยันแล้ว) ไม่รวม `u~` ของคนอื่น
7. `rejectWithNote` RULE: จดความจำล้ม (เช่น เต็ม 100) หลังตีกลับแล้ว = คืน ok ไม่มี memoryId + logOps WARN (ไม่ย้อนการตีกลับ)
8. `editProposal` เก็บ `_edited.before` ของการแก้ **ครั้งแรก** (แก้หลายรอบ = เทียบต้นฉบับ) · ปรับคีย์ชั้นบนของ payload ที่ทะเบียนแตกไว้ (`flatPayload`) ให้ตรง input · summary แทนค่า title/name เดิม (ไม่พบ ⇒ ต่อท้าย "· แก้เป็น:")
9. ไม่แตะ `dataset.anonymize` (ไม่อยู่ในรายการไฟล์ของใบ · ผล recordSample/feedback เดิมคงทุกไบต์) — ตัวปิดเพิ่ม (เบอร์มีขีด/+66 · เลขบัตร 13 หลัก) อยู่ใน `learn.scrubText`
10. service.ts: lessons อ่านทุกบทสนทนา (ใบสั่ง "ใน Promise.all") = +1 query/ข้อความ · ร้านที่ไม่มีบทเรียน = prompt เดิมทุกไบต์

## 4. ทางที่เรียกโมเดลเพิ่ม — ไม่มี (บล็อกบทเรียนเป็นข้อความใน prompt เดิม)

## 5. ใครได้/เสียสิทธิ์
- ผู้ที่เห็นข้อเสนอ (ผู้เปิดห้อง · สมาชิกห้อง · OWNER) ตีกลับพร้อมเหตุผล/แก้ก่อนอนุมัติได้ — เท่ากับสิทธิ์ `rejectProposal` เดิม (การแก้ไม่ข้ามด่านอนุมัติ: ผู้อนุมัติยังต้องผ่าน approvalGate ตอนกด)
- STAFF ในห้องเลขา: `remember_fact`/กติกาจากการตีกลับ = รอ OWNER ยืนยัน (เดิม = ความจำส่วนตัวทันที)
- ยืนยัน/ปฏิเสธความจำและบทเรียน = OWNER เท่านั้น

## 6. ผล (วางจริง)
- `qc-sec-s1.10` forced #1 / #2 / unforced (19:1x–19:2xZ): `JSON_SUMMARY {"total":13,"passed":9,"failed":["T-1","T-4","E-2","L-1"],…}` ×3 · exit 1 — **ทั้ง 4 แดงเพราะข้อสอบ** (§7) · สำเนาข้อสอบที่ใส่ 3 ORACLE-EDIT (ไฟล์ชั่วคราว ลบแล้ว ไม่ commit) = `{"total":13,"passed":13,"failed":[]}` exit 0 · D-1/D-2 fitness ผ่านทุกรอบ
- forced: `qc-sec-s1.2` 28/28 (persona snapshot) · `qc-sec-s1.6` 16/16 · `qc-sec-s1.7` 27/27 · `qc-sec-s1.12` 15/15 · `qc-sec-s1.22` 14/14 (exit 0 ทุกชุด)
- unforced (= baseline `sec-baseline-85751098`): `qc-ai-memory` 7/7 · `qc-ai-feedback` 5/5 · `qc-ai-eval` 4/4 · `qc-ai-brain` 8/8 · `qc-ai-proposals` 16/16 · `qc-ai-quality` 5/5 · `qc-ai-tuning` 7/7 · `qc-chat-ai-suggest` 44/44
- typecheck เต็ม (NODE_OPTIONS 8192 · ISO_MEM 9500M · ไม่ OOM): `src/**` 0 error · 11 error อยู่ใน `scripts/qc-sec-s1.21.mts`/`s1.25.mts` (ใบที่ยังไม่ merge — ไม่เกี่ยวใบนี้) · `qc-sec-s1.10.mts` คอมไพล์ผ่าน
- `pnpm fitness` มี env / `env -u DATABASE_URL -u DIRECT_URL`: 53/53 ×2

## 7. ORACLE-EDIT (ขอผู้คุม)
- **S1.10-T-1 (ขัด R-S1.6b)**: `(sysMsg as AnyMod).authorUserId === null` → `=== "system"` (ข้อความระบบ 🔁 ต้องเป็น "system" ไม่นับ unread · ไม่เข้าประวัติโมเดล — ข้อสอบเขียนก่อน R-S1.6b) · ส่วนอื่นของ T-1 ผ่านหมด
- **S1.10-T-4 (ลำดับประเมินผิด)**: `rj = await teach.rejectMemory(...)` รันก่อน `chk(...)` ⇒ `memoryBlock(STAFF).includes("urgent")` ประเมินหลังลบแล้ว = false เสมอ · แก้: `const blkO = await memory.memoryBlock(ctxOf(STAFF));` ก่อนบรรทัด `rj` แล้วใช้ `blkO.includes("urgent")`
- **S1.10-E-2 (payload ไม่ครบ)**: ข้อเสนอ `kanban.cards.create` ที่สร้างมือไม่มี `params.id` (path `/boards/{id}/cards` — ของจริงจาก `runKanbanTool` มีเสมอ) ⇒ handler ตอบ "คอลัมน์ที่ระบุไม่ได้อยู่ในบอร์ดนี้" · แก้ `mkProp(... { opId: "cards.create", input: {...}, params: { id: board.id } })` · **L-1 แดงตามเพราะ E-2** (ไม่มีแถว EDITED)
- **S1.7 (และป้องกัน s1.2/s1.3b/s1.4/s1.9/s1.12) residue**: hook ใหม่เขียน `AiTrainingSample` ตอนข้อเสนอห้องเลขาสำเร็จ — `qc-sec-s1.7` cleanup ไม่ลบ `aiTrainingSample` ⇒ เหลือ 2 แถวกำพร้า (ลบมือแล้ว เฉพาะ 2 id) · ขอเพิ่ม `"aiTrainingSample", "aiLesson"` ในรายการ cleanup ของชุดเหล่านั้น

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| `forget_fact` / `kb_auto_save` ในห้องเลขาเป็นข้อเสนอ (R-K3) | ใบนี้สั่งเฉพาะ remember_fact | ผู้คุมจัดใบ |
| route/UI ตีกลับ · แก้ · ความจำรอยืนยัน · บทเรียน | ใบนี้ทำ service | S1.14 / S2.x |
| AiTrainingSample ไม่มี FK ⇒ ลบร้านไม่ลบแถว | schema | S1.25/S3 purge Ai* (G-12) |
| ผลของขั้นแผน (runKind) ไม่บันทึก | ไม่มีการแก้ระดับขั้น | ภายหลัง |

## 9. คืนสภาพฐาน QC
- oracle `finally` ลบ tenant `qc-sec-s110-*` + `qcs110-*` (aiLesson · aiTrainingSample รวมอยู่) · ตรวจหลังชุด: AiLesson กำพร้า 0 · AiTrainingSample model chat-suggest 0 · secretary กำพร้า 2 (จาก qc-sec-s1.7 — ลบแล้ว)

## 10. รอบ 2 — merge ทิปผู้คุม bfad2f15 (ORACLE-EDIT T-1/T-4/E-2 + cleanup · S1.21+S1.24 · S1.25) · 2026-11-04 (UTC)
- merge สะอาด (ไม่มี conflict) · ผู้คุมรับส่วนเบี่ยง 1–7
- `qc-sec-s1.10` forced ×2 + unforced: `JSON_SUMMARY {"total":13,"passed":13,"failed":[],"skipped":[],"findings":[]}` ×3 · exit 0
- forced: s1.2 28/28 · s1.7 27/27 · s1.12 15/15 · s1.22 14/14 · unforced: qc-ai-memory 7/7 · qc-ai-proposals 16/16 · qc-chat-ai-suggest 44/44
- fitness มี env / ไม่มี env: 53/53 ×2 · typecheck เต็ม: `src/**` 0 error · 3 error อยู่ใน `scripts/qc-sec-s1.25.mts` (ไม่ใช่ไฟล์ของใบนี้)
