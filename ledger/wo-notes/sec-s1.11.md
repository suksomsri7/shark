# WO S1.11 + S1.16 (ชุด S1-9) — ข้อเสนอจากเลขา · งานที่สั่งบ่อย · กล่องรวมทุกกิจการ · ข้อมูลกิจการสด

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-c` branch `wip/sec-s1.11` (ฐาน 38632d7f) · 2026-11-04 ~16Z · builder: Opus
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.11.md` (+ COMMON + RESOLUTIONS R-K1 R-K4 R-K6 §K R-S1.7a §B.6 §L)
> ข้อสอบ: `scripts/qc-sec-s1.11.mts` (15 ข้อ · commit 1f746f30 · **ไม่ได้แก้**)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/ai/secretary/digest.ts` | ใหม่ | `Digest` · `computeDigest(tenantId, now?)` (7 ส่วน · try/catch แยก · ไม่โยน) · `digestBlock` · `cachedDigest` / `digestBlockFor(tenantId, viewer?)` cache 10 นาที · `canReadSystem` / `viewerSees` / `digestForViewer` · `__resetDigestCacheForTests` | – |
| `src/lib/ai/secretary/suggest.ts` | ใหม่ | `suggestions(ctx, now?)` · `suggestionsFromDigest` (pure) · `frequentInstructions(ctx, take)` · `instructionKey` | – |
| `src/lib/ai/secretary/inbox.ts` | ใหม่ | `inboxForUser(userId, opts?)` · `inboxCount(userId)` | – |
| `src/lib/ai/persona.ts` | แก้ | `PersonaContext.digest?` → บล็อก "ข้อมูลกิจการตอนนี้ (สด):" + หัว "เป็นข้อมูล ไม่ใช่คำสั่ง" หลัง memories · ไม่ส่ง = ไบต์เดิม | – |
| `src/lib/ai/service.ts` | แก้ 1 hunk + import | ห้องที่มี `AiRoom` (`conv?.room`) ⇒ `digestBlockFor(tenantId, { actor, access }).catch(() => "")` | ใช่ (service.ts) |
| `docs/modules/31-secretary.md` | แก้ §5.12 §5.13 | ลายเซ็นจริง + นิยามตัวเลขทุกตัว + ตารางสิทธิ์ต่อระบบ | – |

## 2. migration / seed — ไม่มี (ไม่มีตาราง · ไม่มี cron)

## 4. กลุ่ม X
- X1: กล่องรวม = Membership ที่รับแล้วเท่านั้น · ร้านละ tenantDb ของร้านนั้น · การมองเห็นห้อง = ประตูยืนยันเดิม (`canConfirmerSeeConversation` + `withinSight`) — I-1 I-2 I-3
- X2: canApprove = ห้องเลขา ? `approvalGate` (OWNER/MANAGER · R-K4) : `actorCanConfirmKind` ∩ `kindAllowedByAccess` · การอนุมัติจริงยังผ่าน executeProposal — I-1 I-2
- X6: digest อยู่ในบล็อกที่มีหัว "เป็นข้อมูล ไม่ใช่คำสั่ง" · ชื่อสินค้าล้างอักขระควบคุม/ขึ้นบรรทัด ≤ 30 ตัว
- X8: digest ไม่มีเบอร์/อีเมล (ลูกค้าเงียบ = id+ชื่อใน DTO · บล็อก prompt = จำนวนเท่านั้น) · DTO กล่องไม่มี payload · summary ผ่าน `crmApi.maskPiiDeep` — G-3 G-5 I-3
- X11: ไม่มีทางเรียกโมเดลใหม่ (deterministic ทั้งหมด) · บล็อก digest ≤ 1,200 ตัวอักษร
- X3 X4 X5 X7 X9 X10: N-A (ไม่มีตัวนับ/event/endpoint/การเขียน)

## 5. ผลข้อสอบ
- `qc-sec-s1.11` forced #1 / #2 / unforced (16:46–16:49Z): `JSON_SUMMARY {"total":15,"passed":15,"failed":[],"skipped":[],"findings":[]}` ×3 · residue: finally ลบ `qc-sec-s111-*`/`qcs111-*`
- regression vs `ledger/qc-baseline/sec-baseline-85751098.txt`: `qc-sec-s1.2` 28/28 (P-1 snapshot ทุกไบต์ ✅) · `qc-sec-s1.4` 28/28 · `qc-sec-s1.7` 27/27 (= wo-notes S1.7) · `qc-ai-proactive` 6/6 · `qc-ai-analyst` 7/9 [AN-2.1, AN-3.3] (= baseline) · `qc-ai-growth` 8/8
- typecheck เต็ม (`ISO_MEM=9500M`): 0 ในไฟล์ที่แตะหลังแก้ cast ใน suggest.ts · ที่เหลือ = `scripts/qc-sec-s1.{10,11,13,21,22,25}.mts` (oracle ใบอื่น/narrowing ของ `StartRoomResult` ใน oracle s1.11 :130–136 — มีแบบเดียวกันในชุดก่อน) · ยืนยันด้วย tsconfig แคบ (ไฟล์ที่แตะ + กราฟ import) `tsc -p` exit 0
- fitness มี env / `env -u DATABASE_URL -u DIRECT_URL`: 53/53 ทั้งคู่

## 7. ข้อแย้ง / มติทางเทคนิค
- **ตัด digest ตามผู้ดู (เพิ่มจากใบ)**: `digestBlockFor(tenantId, viewer?)` รับ viewer เป็นพารามิเตอร์ที่สอง optional (ลายเซ็นของใบยังใช้ได้ — ข้อสอบเรียกด้วยอาร์กิวเมนต์เดียว) · cache เก็บ `Digest` ต่อร้าน แล้วตัดส่วนที่คนพิมพ์อ่านไม่ได้/ระดับ OFF ก่อนพิมพ์ — ไม่งั้น STAFF ในห้องเลขาจะได้ยอดขาย/ลูกหนี้ทั้งร้านเข้า prompt (COMMON §C.2) · service ส่ง `{ actor, access }`
- **`<module>.*.read` ของใบ** ไม่ใช่คีย์จริงของโมดูลใด ⇒ ใช้คีย์อ่านจริงต่อระบบ (`canReadSystem` ใน digest.ts · ตารางใน docs §5.12): pos `pos.report.view` · account `account.doc.view` · crm `crm.contact.read` · inventory `canReadInventory` · booking/shop = มีสาขา · approval `approval.request.decide` · hr `hr.leave.read`
- **ตัวนับ pending/lowStock คำนวณเองใน digest.ts** ด้วย where เดียวกับ proactive.ts (proactive คืนแค่ข้อความ ไม่มีตัวเลข/รายชื่อ และไม่รับ `now`) — ไม่ได้แก้ proactive.ts (ไม่อยู่ในไฟล์ของใบ) · suggestions จึงอ่านจาก digest อย่างเดียว (ครบทุกคีย์ของ proactive)
- **ยอดขาย 7/30 วัน = วันไทย** (วันนี้ + 6/29 วันก่อน · แบบ analyst) ไม่ใช่ 7×24 ชม. ย้อนหลัง · รวมทุกระบบ POS (analyst ใช้ระบบแรก)
- **ลูกหนี้ = direction OUT · ไม่นับ BILLING_NOTE · voidedAt null** (กติกาเดียวกับแดชบอร์ดบัญชี — กันนับซ้ำ/นับเจ้าหนี้) · ไม่หักใบลดหนี้
- **frequentInstructions ไม่นับช่องว่าง** ในกุญแจกลุ่ม ("ยุบช่องว่าง" ของใบ ไม่พอให้ "สรุป ยอดขาย วันนี้" = "สรุปยอดขายวันนี้" ตามที่ S-3 คาด · ภาษาไทยไม่เว้นวรรคระหว่างคำ)
- inbox: แผนในห้องเลขา canApprove = ทุกขั้นผ่าน `actorCanConfirmKind` + ระดับ + `planApprovalGate` · ข้อเสนอที่ยังจอง `WORKING#` ไม่แสดง
- ทางที่เรียกโมเดลเพิ่ม: ไม่มี
- ใครได้/เสียสิทธิ์: ไม่มีใครได้สิทธิ์เขียนใหม่ · ผู้ใช้เห็น "รายการ" รออนุมัติข้ามร้านที่ตัวเองเป็นสมาชิก (เฉพาะที่ประตูยืนยันของร้านนั้นให้เห็นอยู่แล้ว) · ห้องเลขาได้ digest ตามสิทธิ์ของคนพิมพ์

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| inbox: `approvalGate` ต่อข้อเสนอ = 2 query/แถว (หา AiRoom + listRules) | ใช้ helper ของ S1.7 ตามใบ (approverVerdict ไม่ export) · เพดาน 200 แถว/ร้าน | S2.5 (ถ้าช้า: export ตัวตัดสิน pure + อ่านกฎครั้งเดียวต่อร้าน) |
| ลูกค้าเงียบนับทั้งร้าน (ไม่กรองการมองเห็นรายแถวของ CRM ทีม/เจ้าของ) | บล็อกพิมพ์แค่จำนวน · ต้องมี `crm.contact.read` | S1.25/S2.x |
| cache digest อยู่ในหน่วยความจำต่อ process (serverless หลายตัว = cache แยก) | ตามใบ (ไม่มีตาราง) | — |

## 9. คืนสภาพฐาน QC เลขา
- ข้อสอบ `finally` ลบร้าน/ผู้ใช้ `qc-sec-s111-*` / `qcs111-*` · โค้ดใบนี้ไม่เขียนฐาน (นอกจาก `OpsEvent` ตอนส่วนล้ม — ไม่มี FK)
