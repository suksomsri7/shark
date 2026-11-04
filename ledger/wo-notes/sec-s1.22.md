# WO S1.22 — สะพานเลขา ↔ ห้องลูกค้า (บริบทลูกค้า · ร่างตอบ · นอกเวลาทำการ)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-b` branch `wip/sec-s1.22` · 5 พ.ย. 2026 (UTC) · builder เลน b
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.22.md` (+ COMMON + RESOLUTIONS R-K13 R-K14 R-K15 · §K R-S1.8e · §L · §M · §B.5) · docs `docs/modules/31-secretary.md` §4.2 · §5.26 · §5.27 · §10 (X8a)
> ข้อสอบ: `scripts/qc-sec-s1.22.mts` (12 ข้อ · ผู้คุมแก้หัวไฟล์ (คอมเมนต์) หลัง MIGRATION READY · ข้อสอบไม่ถูกแก้โดย builder)

## 0. จุดต่อ (restart อ่านตรงนี้)
- commit 1 `8717e758` = schema + migration `20261227100000_secretary_b` (ผู้คุม pre-merge → `acda8970` + `prisma generate` แล้ว)
- commit 2 = โค้ด + docs + ไฟล์นี้ (ff จาก `acda8970`)
- คำสั่ง: oracle `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.22.mts`
  · regression = ตัวรันใน scratchpad (`s122-reg.sh` · `1:<suite>` forced / `0:<suite>` unforced) · typecheck `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=9500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck`

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม? |
|---|---|---|---|
| `prisma/schema/ai_credit.prisma` | แก้ | AiSettings + 3 คอลัมน์ | — |
| `prisma/migrations/20261227100000_secretary_b/migration.sql` | ใหม่ | ADD COLUMN ×3 (additive) | — |
| `src/lib/ai/secretary/customer-context.ts` | ใหม่ | `customerContextOf` · `visibleCustomerConversation` · `customerBlock` | — |
| `src/lib/ai/secretary/rooms.ts` | แก้ 1 hunk + import | `startRoom` ตรวจ context (throw ไทย) · contactId ตามห้องจริง | — |
| `src/lib/ai/persona.ts` | แก้ | `PersonaContext.customer?` + บล็อก "ลูกค้าที่เกี่ยวกับงานนี้:" หลัง digest | — |
| `src/lib/ai/service.ts` | แก้ 3 hunk + 2 helper | ห้องที่มี `contextJson.chatConversationId` ⇒ customer block · `send_customer_message` ค่าปริยาย conversationId | ✅ COMMON §D (hunk เล็ก) |
| `src/lib/modules/chat/ai-suggest.ts` | แก้ 2 hunk | `canRunAi(assist)` แทน canSpend · `source?: "web"\|"app"` | — |
| `src/lib/modules/chat/after-hours.ts` | ใหม่ | settings · `isAfterHours` · `afterHoursAutoReply` · handoff | — |
| `src/lib/modules/chat/service.ts` | แก้ 2 จุด hook + helper | `scheduleAfterHours` หลังบันทึกขาเข้า (after() / await นอกคำขอ) | — |
| `docs/modules/31-secretary.md` | แก้ | §4.2 · §5.26 · §5.27 · §10 X8a | — |

## 2. migration
- `secretary_b`: `ALTER TABLE "AiSettings" ADD COLUMN "afterHoursHandoff" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "afterHoursReply" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "aiDisclosure" TEXT` — ไม่มี DROP/ALTER TYPE/NOT NULL ไร้ default · ทำด้วย schema→schema diff (`--from-schema <HEAD 4d6cdd35> --to-schema prisma/schema`) แบบ S1.1 (ไม่ใช้ฐาน QC เป็น shadow — จะล้างฐาน) · `migrate deploy` บนฐาน QC เลขาแล้ว
- `prisma format` จัดรูป 21 ไฟล์อื่นด้วย (รีโปไม่ format-clean) → คืนทั้งหมด commit เฉพาะ ai_credit.prisma
- ลำดับ deploy: migration ก่อนโค้ด (R-K2 · RESOLUTIONS §E) — โค้ดอ่านคอลัมน์ใหม่ทุก inbound (`afterHoursSettings`)

## 3. มติ/ส่วนเบี่ยง
- **CHAT_READ_ACTION** import จาก `chat/notify.ts` ไม่ใช่ `guard.ts`: guard ลาก `core/context → session → env` (ZodError SESSION_SECRET ในสคริปต์/งานเบื้องหลัง — เจอจริงตอนรัน oracle ครั้งแรก) · ค่าเดียวกัน ไม่พิมพ์สตริงซ้ำ
- **startRoom throw** (ไม่คืน `{ok:false}`) ตามสัญญา/ข้อสอบ C-3 — ผู้เรียก route ต้อง catch (S1.14)
- verdict "มีคนในร้านตอบหลังข้อความนี้แล้ว" ใช้ reason `in_hours` (ไม่มีค่าใน union ของสัญญา · ไม่มีผลข้างเคียง) · ตอบซ้ำ inboundMessageId เดิม ⇒ คืน `reply` เดิมโดยไม่เรียกโมเดล
- ด่านต้นทุนไม่ผ่าน/ไม่มี provider/ไม่มี OWNER ⇒ handoff `unknown`
- hook: นอกคำขอ (`after()` โยน) = **await** ก่อนคืน (A-5 เห็นผลทันที · ไม่มีงานลอย) · ในคำขอ = `after()` · ข้อความ `sentAt` เก่ากว่า 10 นาที (ประวัติย้ายเข้า) ไม่ตอบ · เฉพาะ TEXT
- push handoff = `notifyUser(kind "inbox")` ของเลขา (ค่าตั้ง/กันสแปม/badge เดิม) ถึง OWNER/MANAGER ที่รับคำเชิญแล้ว · ครั้งเดียวต่อห้องต่อวันไทย (นับ event handoff ของวัน)
- แต้มสมาชิก `points: null` รุ่นนี้ (ไม่มี facade อ่านยอดแต้มที่เบา) · deals เฉพาะร้าน CRM ใหม่ (uiVersion 2) ผ่าน `briefFor`
- **learn.recordOutcome bridge: ข้าม** — S1.15 ยังไม่มี `src/lib/ai/secretary/learn.ts` · ใบ S1.15 ต่อ mapping SENT_EDITED⇒EDITED · SENT_AS_IS⇒APPROVED · IGNORED⇒REJECTED

## 4. ทางที่เรียกโมเดลเพิ่ม (คิดเงินทุกทาง)
- `afterHoursAutoReply` → `provider.chat` (fast) → `chargeUsageSafe` source `CHAT_SUGGEST` · ผ่าน `canRunAi(assist)` ก่อน · ไม่นับงาน
- (ไม่มีทางใหม่อื่น — customer block เป็นข้อความใน prompt เดิม)

## 5. ใครได้/เสียสิทธิ์
- ห้องเลขาที่ผูกห้องลูกค้า: ผู้พิมพ์เห็นบริบทเท่าที่สิทธิ์แชท+สาขา+โมดูลของตัวเองเห็น · ผู้เปิดห้องที่ไม่เห็นห้องลูกค้า = เปิดห้องไม่ได้ (throw)
- `setAfterHours` = OWNER เท่านั้น · ลูกค้าได้คำตอบอัตโนมัติเฉพาะเมื่อ OWNER เปิด `afterHoursReply`

## 6. ผล (ดูรายงาน — วางจริง)
- `qc-sec-s1.22` forced #1 (17:59Z) / #2 (18:08Z) / unforced (18:10Z): `JSON_SUMMARY {"total":12,"passed":12,"failed":[],"skipped":[],"findings":[]}` ×3 · exit 0 · D-1/D-2 = fitness มี env/ไม่มี env ผ่านทุกรอบ
- forced: `qc-sec-s1.2` 28/28 · `qc-sec-s1.4` 28/28 · `qc-sec-s1.12` 15/15 · `qc-sec-s1.13` 14/14 (exit 0 ทุกชุด)
- unforced (= baseline `sec-baseline-85751098`): `qc-chat-ai-suggest` 44/44 · `qc-chat-business-hours` 73/73 · `qc-chat-learning` 32/32 · `qc-chat-core-v2` 47/47 · `qc-chat-security` 38/38 · `qc-ai-tools` 18/18
- typecheck เต็ม (NODE_OPTIONS 8192 · ISO_MEM 9500M · ไม่ OOM): `src/**` 0 error · 17 error อยู่ใน `scripts/qc-sec-*.mts` ทั้งหมด (s1.10/s1.21/s1.25 = ใบที่ยังไม่สร้าง · s1.22:108 `r.roomId` บน union `StartRoomResult` ดู §7)

## 7. ORACLE-EDIT (ขอผู้คุม)
- **S1.22-A-5 (MINOR · flake ตามเวลา)**: `open=(nowH+2)%24, close=(nowH+3)%24` — ตอน 21:xx BKK ได้ 23:00/00:00 ⇒ `validateBusinessHours` ปฏิเสธ (open ≥ close) ⇒ ถือว่าไม่ได้ตั้ง ⇒ `no_window` ⇒ A-5 แดง · เสนอ: `open = nowH >= 21 ? "00:00"/"01:00" ตามกรณี` หรือใช้ช่วงก่อนหน้า `open=(nowH+21)%24 … close=(nowH+22)%24` เมื่อ nowH ≥ 21 (ช่วงใดก็ได้ที่ไม่ครอบเวลาปัจจุบันและ open<close)

- **S1.22 typecheck (MINOR · ชนิดเท่านั้น รันผ่าน)**: บรรทัด 108 `r.roomId` — `StartRoomResult` เป็น union ⇒ TS2339 · เสนอ `(r as { roomId: string }).roomId` หรือ `if (!r.ok) throw …` ก่อนใช้

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| learn.recordOutcome จาก recordSuggestionOutcome | learn.ts ยังไม่มี | S1.15 |
| UI ตั้งค่า after-hours + route | ใบนี้ทำ service เท่านั้น | S1.14 / S2.x |
| แต้มสมาชิกใน CustomerContext | ไม่มี facade เบา | ภายหลัง |

## 9. คืนสภาพฐาน QC
- oracle `finally` ลบ tenant `qc-sec-s122-*` + ผู้ใช้ `qcs122-*` ทุกตาราง (รวม aiSettings · chatConversationEvent · appNotification)

## 10. รอบ 2 (ผู้ตรวจ N · RESOLUTIONS §O) — merge ทิป `90989b9d`
- R-S1.22a `sendReply({ aiAfterHours: true })` ไม่แตะ staffUnreadCount/firstResponseAt (A-6)
- R-S1.22b ลำดับ disabled → no_window → in_hours → human/money/complaint (regex) → ตอบแล้ว (ah:) → answered (OUT · senderUserId ไม่ null · ไม่ใช่ meta.ai_afterHours) → ด่านต้นทุน → โมเดล → ตรวจคำตอบ (MONEY_RE/AMOUNT_RE ⇒ money ไม่ส่ง) · reason ใหม่ human/answered · regex ขยายตาม §O (A-7)
- R-S1.22c ข้อมูลร้าน (เวลาทำการ+DNA+ความจำ) ผ่าน maskPiiDeep + ตัวเลข ≥ 8 หลัก · prompt ห้ามไล่/อ้างข้อมูลร้าน
- R-S1.22d body = "Shark (ผู้ช่วย AI): " + คำตอบ + "\n" + disclosure · disclosure ต้องมี AI/เอไอ/ผู้ช่วย (setAfterHours throw ไทย · แถวที่ไม่ผ่าน = ข้อความปริยาย)
- R-S1.22e `LINK_CODE_MASK` ย้ายไป `chat/link-code.ts` (route import) + hook ข้าม · docNo/tier ผ่าน mask · event handoff ครั้งแรกต่อห้องต่อวัน (createdAt = now) · `by.tenantId` ชนิดบังคับ + ไม่ตรง ⇒ Forbidden + ตรวจ Membership OWNER จากฐานเสมอ (ข้อสอบ A-1 ยังไม่ส่ง tenantId — ORACLE-EDIT) · context มีแต่ contactId ⇒ ทิ้ง
