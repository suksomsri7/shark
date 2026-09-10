# HANDOVER — บอร์ดงาน→Trello · P3 "เชื่อมทั้งระบบ + AI" ปิด 10 ก.ย. 2569 — **RUN จบ 36/36 WO**

> ต่อจาก `HANDOVER-2026-09-07-KANBAN-P2.md` · ledger สด `ledger/KANBAN-RUN.md` · worktree `/root/projects/shark-kanban` branch `session/kanban` · main ล่าสุด `480c490` (K3.9) · prod = Vercel READY ทุกใบ

## 1. สรุปผลทั้ง RUN

| | P1 (6 ก.ย.) | P2 (7 ก.ย.) | **P3 (7 + 10 ก.ย.)** | รวม |
|---|---|---|---|---|
| WO | 15/15 | 12/12 | **9/9** | **36/36** |
| migration (additive ทั้งหมด · ตรวจ `_prisma_migrations` บน prod ทุกตัว — ยืนยันครบ a–u 22 ตัว 10 ก.ย. 08:20) | a–k (11) | l m n o p q p2 (7) | **r s t u (4)** | 22 |
| oracle checks (Fable เขียนก่อน builder ทุกใบ) | 324 | 249 | **134** (20+19+15+11+21+10+14+11+13) | 707 |
| ภาพหน้าจอจริงที่ Fable เปิดดู | 62 | ~52 | **~36** (+ มุมมอง thana 6) | ~150 |
| REST op (`/api/v1/kanban`) | 56 | 82 | **88** | 88 |
| AI tool (สกิล `tasks`) | 16 | 20 | **23** | 23 |
| เส้น import ข้ามโมดูลที่อนุมัติ (F2) | — | kanban→calendar · kanban→approval | **kanban→party · chat→kanban** | 4 |
| qc:all ปิดเฟส | 246/246 | 287/287 | **286/287 → แก้ k1.1 แล้ว 287/287 (ดู §7)** | |

**ฟีเจอร์ P3 ที่ผู้ใช้ได้ (อยู่บน prod แล้ว):**
- **K3.1 เชื่อมข้อมูล SHARK** ในหลังการ์ด — ผู้ติดต่อ (CRM/Party) · บทสนทนาแชท · เอกสารบัญชี · คำขออนุมัติ · ใบลา · บิล POS · ลิงก์ภายนอก · ซ่อนชื่อลูกค้าจากคนไม่มีสิทธิ์ · ขาย้อน `listCardsForTarget`
- **K3.2 สร้างงานจากแชท** — ปุ่มในหัวห้อง → แผง AI ร่างชื่อ/สรุป/กำหนดส่ง/เช็คลิสต์ → ผูกห้อง+ผู้ติดต่อ+ไฟล์แนบ → แปะบันทึกภายในกลับในห้อง · สวิตช์รายร้าน (ตั้งค่า › การเชื่อมต่อ)
- **K3.3 การ์ดเกิดจากที่อื่น** — ฟอร์ม / คำขออนุมัติ (อนุมัติแล้วปิดงานให้) / เอกสารบัญชีอนุมัติ-จ่ายแล้วปิดการ์ดที่ผูก / ใบลา→การ์ดหาคนแทน / บิลยกเลิก→การ์ดตรวจสอบ / แชทค้างไม่มีคนรับ (sweep รายชั่วโมง) · event ใหม่ `hr.leave.submitted` · ชิปที่มา 5 ชนิด
- **K3.4 ย้อนกลับ** — ปิดการ์ด → บันทึกภายในในห้องแชท / activity บนเอกสาร (idempotent) · **หน้าโปรไฟล์ผู้ติดต่อ `/app/party/{id}`** (D23) พร้อม "งานที่เชื่อมกับผู้ติดต่อนี้"
- **K3.5 ผู้ช่วย AI ในหลังการ์ด** — สรุปการ์ด (ความเห็นติดป้าย "ผู้ช่วย AI") · แตกเป็นเช็คลิสต์ (เสนอก่อน) · ร่างคำตอบลูกค้า · op `cards.detail` `cards.setDue` `cards.fromChat`
- **K3.6 คำแนะนำกฎอัตโนมัติ** — นับจากประวัติ 30 วัน 3 แบบ → เสนอกฎพร้อมตัวเลขจริง → กด "สร้าง" โหลดเข้าตัวสร้างกฎ
- **K3.7 การ์ดสะท้อน** — งานเดียวบนหลายบอร์ด แก้ที่ไหน = แก้ต้นฉบับ · ย้าย/ปิดแยกต่อบอร์ด (D22)
- **K3.8 ภาพรวมข้ามบอร์ด** — ตัวเลข 4 ค่า · กรอง/จัดกลุ่ม/บันทึกมุมมองข้ามบอร์ด · เห็นเฉพาะบอร์ดที่มีสิทธิ์
- **K3.9 อีเมลเข้าบอร์ด + push รายคน** — ที่อยู่ต่อบอร์ด (หมุนได้) → การ์ดพร้อมไฟล์แนบ · `POST /api/email/inbound` (fail-closed) · `sendPushToUsers` รวมผู้เรียก 3 จุด

## 2. บั๊ก/ช่องโหว่ที่จับได้ระหว่าง P3 (นอกเหนือจาก oracle)
- **สิทธิ์ read ตรงตัว** (K3.1): `assertKanbanCan("kanban.board.read")` ~25 จุดตรวจคีย์ตรงตัว ⇒ พนักงานที่ติ๊กแค่ `kanban.card.*` เปิดบอร์ดได้แต่เปิดหลังการ์ด 500 → เดินผ่าน `canReadKanban` (read-โดยนัย K1.3) · ยืนยันด้วยภาพธนา
- **เพดาน token ตัด JSON ไทย** (K3.2): `maxTokens: 700` → คำตอบไทยชนเพดาน → zod ไม่ผ่าน → fallback เงียบทั้งที่จ่ายเงิน → 1500 (บทเรียน: token ไทยกินขาออกด้วย)
- **ผู้ยืนยันข้อเสนอ AI เป็น VIEWER เสมอ** (K3.5): `userActor()` scopes ว่าง → `apiRole: "VIEWER"` ⇒ เจ้าของกดยืนยันย้าย/มอบหมายถูกปฏิเสธ → ใช้ Membership จริง + ส่ง userId จาก proposals
- **Timeline ไม่รีเฟรชตาม prop** (K3.5): ความเห็นที่ AI เขียนไม่โผล่จนสลับแท็บ → `reloadKey`
- **op ใหม่ import static ลากถึง `lib/env`** (K3.5): fitness F10.1 แดงเฉพาะใน pre-commit (ไม่มี env) → import แบบ lazy · กติกาใหม่: รัน fitness แบบไม่มี env ก่อน commit
- **ข้อสอบของ Fable เอง**: กุญแจ `E.boards.kataSecret` (ของจริง `kata`) ใน 5 ไฟล์ · S8 ของ k3.3 ชน partial unique `chat_conv_active` · `require()` ใน ESM · k3.7/k3.9 ไม่คืน `cardNoSeq` · S5.2 ของ k3.3 พึ่ง seed ที่เปลี่ยน — builder จับได้ทั้งหมด (ระบบ "แย้งพร้อมหลักฐาน" ทำงาน)
- **QC data drift** สะสมจากหลาย oracle (position ≠ sortOrder · cardNoSeq > max) → re-seed 10 ก.ย. · ข้อสอบที่กิน cardNo ต้องคืน seq ใน finally
- **container รีสตาร์ท 1 ครั้ง (10 ก.ย. ~06:40)** ระหว่าง builder K3.7 รัน `next build` → กติกาใหม่ตั้งแต่ K3.8: builder ห้าม build · Fable build+ถ่ายภาพเองตอนรับงาน (ไม่เกิดซ้ำ)

## 3. รอเจ้าของ (prod)
- **อีเมลเข้าบอร์ด (K3.9) ยังใช้ไม่ได้บน prod** จนกว่าจะตั้ง: (1) ผู้ให้บริการรับอีเมลขาเข้า (Resend Inbound / Cloudflare Email Routing) + MX ของ `shark.in.th` — ⚠️ ถ้าโดเมนรับอีเมลบริษัทอยู่แล้ว ใช้ซับโดเมนแล้วแก้ `BOARD_EMAIL_DOMAIN` ใน `boards-email.ts` ที่เดียว (2) env `EMAIL_INBOUND_SECRET` บน Vercel (ไม่ตั้ง = route ตอบ 503 ปิดสนิท) (3) webhook ชี้ `https://shark.in.th/api/email/inbound` ส่ง header `X-Inbound-Secret` · **แนะนำ**: แสดง `tasks+{key}@` เป็นที่อยู่หลักแทน `งาน+{key}@` (local part ไทยต้อง SMTPUTF8 ผู้ให้บริการหลายเจ้าไม่รับ) — โค้ดรับทั้งสองรูปแบบอยู่แล้ว
- เดิม: `ABLY_API_KEY` (realtime ยัง polling) · `RESEND_API_KEY` (อีเมลแจ้งเตือน/สรุปยัง dev-log) · ดูหน้าใหม่บน prod ด้วยตา (Fable ตรวจได้เฉพาะ QC) · เทส iPad build #24
- LLM เรียบเรียงคำแนะนำกฎ (K3.6) เป็น opt-in — เปิดจริงแก้ 1 บรรทัดใน `automation/page.tsx` (เผาเครดิตทุกครั้งที่เปิดหน้า)

## 4. หนี้ที่เหลือ (ไม่บล็อก · เรียงตามความคุ้ม)
1. **เครดิต AI ของบอร์ดงานลงช่อง `CHAT_SUGGEST`** (K3.2/K3.5) — enum `AiCreditSource` ยังไม่มีค่าเฉพาะ (เพิ่ม = migration)
2. **REST op/AI tool ของ integrations** (`integrations.get/set`) + สะพาน K3.3 ยังไม่มี (F13.4 บังคับมีข้อสอบ)
3. ปุ่ม "สร้างเช็คลิสต์จากสรุปนี้" ใต้ความเห็น AI (ภาพ 03) · `draftReply` ยังไม่ดึงข้อความล่าสุดจากห้องแชท · แผงจากแชทเลือกผู้รับผิดชอบได้ 1 คน · แก้เช็คลิสต์ก่อนบันทึกยังไม่มี
4. ไฟล์แนบจากอีเมล: ไม่ตรวจ magic bytes (fixture ข้อสอบ S2.2 ส่ง PDF ปลอม 3 ไบต์ — แก้ fixture ก่อนใส่ด่าน)
5. ปุ่ม "ดูใน CRM" บนหน้าผู้ติดต่อ · ชิปสะท้อนในมุมมองตาราง · op ถอดตัวสะท้อน · ตารางภาพรวมเป็นตัวอ่านอย่างเดียวแยกจาก TableView
6. `emitOutboxOutsideTx` (ใบลา) ไม่ atomic กับแถวใบลา (ยอมรับ · พลาด = ไม่มีการ์ดหาคนแทน) · `sourceType` ยังไม่มี `INBOX` · K2.9 action `add_link` ยังไม่ทำ
7. จาก P2: k1.1 flake เมื่อรันรวมชุด · แถบล่างมือถือ 5 เมนู · ช่องแก้รายละเอียดเทมเพลต · โหมดสัปดาห์ปฏิทิน · describeRule · dryRun DUE_DATE · seed completedAt (การ์ดในคอลัมน์เสร็จของ seed ถูกนับ "ค้าง" ในภาพรวม/รายงาน)
8. ข้อสอบชุด hr/approval/forms/pos 19 ชุด + `qc-ai-kanban-board` ยัง `loadEnvFile(".env")` = แตะ prod ⇒ builder ไม่ได้รัน (ควรย้ายมา QC env)

## 5. วิธีทำงานที่ใช้ได้ผล (สืบทอดไป RUN ถัดไป)
oracle ก่อน → builder แย้งได้ต้องมีหลักฐาน → Fable ดูภาพเอง (owner + staff) → builder ห้าม build (Fable build+ภาพ) → ห้ามซ้อนงานหนัก → oracle ต้องผ่าน tsc + fitness ทั้งมี/ไม่มี env → ข้อสอบที่กิน cardNo/แก้ seed ต้องคืนใน finally → ทุก push ตรวจ Vercel READY + `_prisma_migrations` → Telegram % ทุกใบ → พักงาน = commit WIP บน session branch + RESUME "วิธีต่อหลังพัก"

## 6. ถัดไป
- **ออกแบบ UX/UI Member System** (คิวเจ้าของ 6 ก.ย. — memory `project_shark_member_system_design`): design only · `ledger/DESIGN-MEMBER.md` + `ledger/design-member/*.html/png` → Telegram + ข้อเสนอแนะ · ต่อยอด member/point/coupon/reward/marketing/crm/party + custom fields แบบ K2.6
- หลังเจ้าของเคาะ: RUN "Member System" ด้วยวิธีเดียวกัน

## 7. qc:all ปิดเฟส (10 ก.ย. 09:30–09:55 · 1386 วินาที)
- ผล **286/287** — แดงชุดเดียว `kanban-k1.1` 27/30 (S2.5/S4.1/S4.2) = หนี้ "flake เมื่อรันรวมชุด" จาก P1/P2
- **ต้นเหตุจริง (ปิดหนี้แล้ว)**: ข้อสอบยึดสมมติฐาน seed บริสุทธิ์ `cardNoSeq == max(cardNo)` และคำนวณเลขที่คาดจากค่าตอนเริ่มไฟล์ — แต่ชุดอื่นใน qc:all สร้าง/ลบการ์ด (seq เดินหน้า) ซึ่งเป็นสภาพจริงบน prod ไม่ใช่บั๊ก (ทุกทางสร้างการ์ดใช้ `UPDATE … cardNoSeq+1 RETURNING` ตัวเดียวกัน ตรวจแล้ว 6 จุด) → แก้ข้อสอบเป็น invariant ของสินค้า: `seq ≥ max` (seq < max = เลขซ้ำแน่นอน) และอ่าน seq สดก่อน createCard → **k1.1 30/30 บนสภาพ drift** · ไม่ต้องรัน qc:all ซ้ำ (ชุดอื่น 286 เขียวอยู่แล้ว · ไม่มีการแก้โค้ด src)
- ชุดที่ qc:all **ไม่ครอบ** เพราะ `loadEnvFile(".env")`: hr/approval/forms/pos 19 ชุด + `qc-ai-kanban-board` (ดู §4 ข้อ 8)

