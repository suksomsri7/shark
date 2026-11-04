# WO S1.7 + S1.8 (ชุด S1-6) — กฎอนุมัติ/ผู้อนุมัติ/ทำไมต้องอนุมัติ · บันทึกการกระทำ + ย้อนกลับ 24 ชม.

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-c` branch `wip/sec-s1.7` (ฐาน f385caa9) · 2026-11-04 14:4xZ · ผู้คุมงาน: Fable 5.1 · builder: Opus
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.7.md` + COMMON + RESOLUTIONS R-K3 R-K3b R-K4 R-S1.8a §B.3 §B.5
> ข้อสอบ: `scripts/qc-sec-s1.7.mts` (22 ข้อ · commit test aaae81d9 · **builder ไม่ได้แก้** · ขอ ORACLE-EDIT 1 จุด §7 — G-2 ขัดกับ S1.4 G-6)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/ai/secretary/kind-class.ts` | ใหม่ (ไม่อ่านฐาน · import proposals.ts แบบค่า) | `classOfKind` · `ALWAYS_APPROVE` · `RULE_KEYS` · `RuleMap` · `whyApproval` · `amountSatangOf` | — |
| `src/lib/ai/secretary/approval-gate.ts` | ใหม่ | `DEFAULT_RULES` · `listRules` · `setRule` (OWNER · upsert prisma ตรง) · `approvalGate` (AiRoom ⇒ OWNER/MANAGER + `membershipCan`) | — |
| `src/lib/ai/secretary/actions.ts` | ใหม่ | `UNDOABLE_KINDS` · `ActionEntity` · `DispatchOut` · `snapshotBefore` · `recordAction` · `recordFromDispatch` · `undoAction` · `listLog` · `payloadIdsOf` | — |
| `src/lib/ai/proposals.ts` | แก้ (บล็อกแยก ไม่ย้ายบล็อกเดิม) | gate หลังด่านระดับ S1.3 ก่อนยืนยัน 2 ชั้น · `out` + snapshot + `secRecordAction` รอบ dispatch ใน executeProposal · runKind (planId จาก refId) · `dispatch(…, out?)` → `dispatchKanbanKind(…, out)` · hand handler `kanban_create_card`/`booking_create_appointment` ตั้ง entity · helper `secApprovalGate/secSnapshotBefore/secRecordAction` (dynamic import) · import `logOps` + type `DispatchOut` | ✅ |
| `src/lib/ai/kanban-ops.ts` | แก้ | `dispatchKanbanKind(…, out?)` ตั้ง `out.entity` จาก `env.data.id`/`cardId` (ชนิด out เขียนในที่ — ไม่ import ไฟล์ secretary) | — |
| `src/lib/ai/plans.ts` | แก้ 1 บรรทัด (:148) | ส่ง `opts?.userId` เข้า `runKind` (§B.3) | ✅ |
| `docs/modules/31-secretary.md` | แก้ | §5.7/§5.8/§5.9 ตามโค้ด · §9 event `ai.action.*` = เลื่อน | — |

ไม่แตะ prisma/** · ไม่รัน generate · ไม่แตะ tool-access.ts / access*.ts / identity.ts / members.ts / service.ts / conversations.ts / oracle

## 2. migration / seed / backfill
ไม่มี (ใช้ `AiApprovalRule` + `AiActionLog` ของ S1.1)

## 3. สรุปด่าน
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D2 | oracle | ⚠️ ทางการแดง G-2 (+ crash ที่ L-1 เพราะ l1 ไม่มี) · สำเนาที่แก้ตาม ORACLE-EDIT §7 = 22/22 ×2 + unforced | §5 |
| D4 | regression = baseline `sec-baseline-85751098.txt` | ✅ | §5 |
| D5 | typecheck 0 ในไฟล์ที่แตะ · fitness ×2 (D-1/D-2) | ✅ | §5 |
| D10 | docs §5.7–§5.9 · §9 | ✅ | commit docs |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 ขอบเขต | ใช้ | U-1/U-2 (มองไม่เห็น = "ไม่พบรายการ") · L-4 (listLog ตามสิทธิ์) · ทุก query ผ่าน `tenantDb` หรือ `where tenantId` |
| X2 ตัวตน/มอบอำนาจ | ใช้ | G-1…G-3 (ผู้อนุมัติห้องเลขา OWNER/MANAGER) · R-2 (กฎตั้งได้แต่ OWNER) · undo `assertCan` ของคนกด (U-2) |
| X3 ยิงพร้อมกัน | ใช้ | undo claim `updateMany({id, undoneAt:null, undoableUntil ≥ now})` ผู้ชนะเท่านั้นลงมือ (U-4 ซ้ำ ⇒ "ย้อนไปแล้ว") — ไม่มีข้อสอบยิง 10 ทาง |
| X4 ส่งซ้ำ | N-A | ไม่มี event/consumer (เลื่อน §8) |
| X5 งานตามเวลา | ใช้ | U-4 เกิน 24 ชม. · `undoAction(ctx, id, now?)` ฉีดเวลาได้ |
| X6 ข้อมูลอันตราย | ใช้ | ผลโมเดลแตะกฎไม่ได้ (setRule = OWNER ทางเดียว) |
| X7 มือถือ | N-A | ไม่มี route ในใบนี้ (S1.14) |
| X8 PDPA | ใช้ | L-2 payload id ล้วน (`payloadIdsOf` + `idsOnly`) · ไม่มีชื่อ/เบอร์ |
| X9 การกระทำอันตราย | ใช้ | `ALWAYS_APPROVE` ค่าคงที่ · UNDOABLE ไม่มี void/refund/chat.send (U-5) · whyApproval "2 ชั้น" |
| X10 ความลับ | N-A | — |
| X11 ต้นทุน | N-A | ไม่มีทางเรียกโมเดลใหม่ |

## 5. ผลข้อสอบ
- `qc-sec-s1.7` (ทางการ) forced: C-1..4 R-1..3 G-1 G-3 ✅ · **G-2 ❌** `{"ok":false,"note":"ไม่พบข้อเสนอนี้ (อาจถูกลบไปแล้ว)"}` แล้ว TypeError ที่ L-1 (l1 ไม่มี) · unforced: เหมือนกัน · cleanup ใน finally ทำงาน (residue 0)
- สำเนาที่ใส่ ORACLE-EDIT (บรรทัดเดียว — เพิ่ม MANAGER เป็นสมาชิกห้องก่อน exM) forced: `JSON_SUMMARY {"total":22,"passed":22,"failed":[],"skipped":[],"findings":[]}` ×2 · unforced: เหมือนกัน · สำเนาลบแล้ว (ไม่ commit)
- residue: tenant `qc-sec-s17-*` 0 · user `qcs17-*` 0 · AiActionLog กำพร้า 31 แถว (มาจากชุด regression ที่ลบร้านแต่ไม่ลบ AiActionLog — ไม่มี FK) → ลบแล้ว · ดู §8
- regression (forced · SHARK_AI_MOCK=1) เทียบ baseline 85751098 — เท่ากันทุกชุด:
  qc-sec-s1.4 28/28 · qc-sec-s1.2 28/28 · qc-ai-proposals 16/16 · qc-ai-plan 7/7 · qc-ai-credit 32/32 · qc-ai-actions 11/12 CRASH (= baseline) · qc-ai-kanban-board 3/3 · qc-ai-phase-b1 9/9 · qc-ai-phase-b2 11/11 · qc-ai-wave5b 24/24 · qc-ai-growth 8/8 · qc-ai-automation exit 0 (= baseline ไม่มีสรุป) · qc-approval 16/16 · qc-approval-wiring 7/7 · qc-approval-edit 12/12
  qc-pos-p3.9 / qc-svc-smoke ไม่มีใน baseline ของฐานเลขา ⇒ ไม่รัน
- typecheck (`ISO_MEM=9500M` · heap 8192): 4 error ทั้งหมดเป็น oracle ของใบที่ยังไม่สร้าง (`qc-sec-s1.10/s1.13/s1.6.mts` import โมดูลที่ยังไม่มี) · ไฟล์ที่แตะ 0
- fitness: D-1 (มี env) ✅ · D-2 (ไม่มี env) ✅ (ทุกรอบของ oracle) · pre-commit ✅

## 7. ข้อแย้ง / มติทางเทคนิค
- **ORACLE-EDIT S1.7-G-2** — G-2 ให้ MANAGER (ไม่ใช่ผู้เปิด/สมาชิก) ยืนยันข้อเสนอในห้องของ STAFF แล้วต้อง ok · แต่ S1.4 G-6 (รับแล้ว · merge แล้ว) บังคับว่า MANAGER ที่มองไม่เห็นห้อง ⇒ "ไม่พบข้อเสนอนี้" — ข้อสอบสองใบนี้ผ่านพร้อมกันไม่ได้ (รูปเดียวกัน: `executeProposal(M("MANAGER"), …, {userId: mgr})` บนห้อง STAFF ที่ไม่มี AiRoomMember) · R-K4 + brief บอกให้ gate อยู่ "หลังด่านเดิม" และ doc §7 ให้ MANAGER เห็นเฉพาะห้องของตัวเอง + ที่ถูกเพิ่ม ⇒ builder คงด่านมองเห็นของ S1.4 · ขอแก้ hunk ใน G (ก่อน `const exM = …`):
  `await prisma.aiRoomMember.create({ data: { tenantId: tid, roomId: rS.roomId, userId: U.mgr, addedById: U.staff, seeHistory: true } });`
  (ทางเลือกถ้าผู้คุมตัดสินให้ MANAGER อนุมัติได้ทุกห้องเลขา: แก้ `canConfirmerSeeConversation` ใน conversations.ts + ORACLE-EDIT S1.4 G-6/G-7 — builder ไม่ทำเพราะขยายการมองเห็นห้อง)
- approvalGate วางหลังด่านระดับ S1.3 (ซึ่งอยู่หลัง `assertCan`) ก่อนยืนยัน 2 ชั้น — "หลัง assertCan" ตาม brief โดยไม่ย้ายบล็อกเดิม
- `approvalGate` รับ `userId?` ตัวที่ 4 (ให้ `membershipCan` ของโมดูลสมาชิกรู้ตัวคน — doc §5.8 มี `membershipCan`) · ชนิดคืนตาม brief (`note`)
- `recordAction.userId` = ผู้เปิดห้องเฉพาะรหัส `u~` (ชนิด member) — ห้องคีย์ API/งานภายใน ใช้ `approverId` (brief เขียน `.id` เฉย ๆ ซึ่งจะได้ id คีย์ ไม่ใช่คน)
- การมองเห็นของ undo = กติกาเดียวกับ listLog (OWNER · ผู้สั่ง/ผู้อนุมัติ · ห้องที่เปิด/เป็นสมาชิก) — ทำให้ U-3 (MANAGER ผู้อนุมัติ) ผ่านแม้ไม่ใช่สมาชิก; ห้องที่เห็นอ่านจาก `AiRoom.startedById ∪ AiRoomMember` (ความหมายเดียวกับ `roomSightFor`)
- undo ลำดับ: มองเห็น → ย้อนแล้ว → ไม่อยู่ใน registry → เกิน 24 ชม. → assertCan → claim → ลงมือ (ล้ม = คืน claim) → แถว `undo:<kind>` (ล้ม = เงียบ)
- ย้อน "ย้ายการ์ด" ใช้ `kanbanSvc.moveCard` (ต่อท้ายคอลัมน์เดิม · ตำแหน่งเดิมเก็บใน before.position แต่ไม่คืนตำแหน่งตรง)
- ทางที่เรียกโมเดลเพิ่ม: ไม่มี
- ใครได้/เสียสิทธิ์: STAFF **เสีย** การกดยืนยันข้อเสนอในห้องเลขา (ห้องที่มี AiRoom) แม้มีคีย์ · ห้อง AI เดิมเหมือนเดิม · OWNER ตั้งกฎ 3 ข้อได้ (ไม่มีผลเปิดทางอัตโนมัติ) · ผู้สั่ง/ผู้อนุมัติ/OWNER ย้อน 5 kind ได้ใน 24 ชม. ด้วยสิทธิ์ของ kind นั้น

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| event `ai.action.executed` / `ai.action.undone` | brief ไม่สั่ง · ต้อง consumer + 3 ทะเบียน + replay oracle · `outbox-consumers.ts` ไม่อยู่ในไฟล์ของใบ | ใบ UI ของบันทึก (S1.14/S2.x) หรือใบย่อย |
| AiActionLog ไม่มี FK → ชุด qc เดิมที่ลบร้านทิ้งแถวกำพร้า (31 แถวต่อรอบ regression) | ตารางของ S1.1 · ห้ามแตะ prisma | migration `secretary_b` (FK `onDelete: Cascade` ไป Tenant) หรือ cleanup ใน qc-sec.sh |
| แผน (`executePlan`/`runKind`) ในห้องเลขาไม่มีด่านผู้อนุมัติ | brief: "runKind ไม่ต้องมี gate" ⇒ STAFF ยืนยันแผนในห้องตัวเองได้ | ผู้คุมตัดสิน (S1.3b/S1.10) |
| ประตู CRM (`crm.assist.*`, `crm.*` ที่มี `requestedByUserId`) ข้าม gate + log (คืนก่อนด่านเดิม) | ไม่ย้ายบล็อกเดิม | ผู้คุมตัดสิน |
| `whyApproval` ยังไม่มีผู้เรียกฝั่ง DTO/การ์ด | ใบนี้ไม่มี route/UI | S1.14 / S2.x (A4/B4) |

## 9. คืนสภาพฐาน QC เลขา
oracle `finally` ลบ aiActionLog/aiApprovalRule/aiRoom*/aiProposal/aiPlan/… ของร้าน + tenant + user `qcs17-*` · ตรวจแล้ว tenant 0 · user 0 · AiActionLog กำพร้าจาก regression 31 แถว ลบแล้ว (`DELETE … WHERE NOT EXISTS Tenant`)
