# โมดูล 31: เลขา AI "Shark" (ห้องงาน · อนุมัติ · ห้องร่วม · แชทลูกค้าในแอป · ช่วยเหลือ · กิจการ/พนักงาน) — สัญญาข้อมูล

> เอกสารสัญญา · 4 พ.ย. 2569 · ใบ S0.3 (+S0.4) ของ RUN "เลขา AI" · ภาษาไทย ชื่อโค้ดอังกฤษ (ตาม `_CONVENTIONS.md`)
> ลำดับความจริง: **โค้ดชนะแบบ** · `ledger/secretary-briefs/sec-brief-RESOLUTIONS.md` (R-K1…R-K20 · §B–§F) ชนะ `ledger/REVIEW-SECRETARY-DESIGN-2026-11-04.md` ซึ่งชนะ `ledger/DESIGN-SECRETARY.md` และ `ledger/SECRETARY-MASTER-PLAN.md` §3
> ชื่อฟังก์ชัน/บรรทัดของของเดิมอ้างจากรีวิว S0.1 (`file:line` ของทรี session/secretary) · ภาพ: `ledger/design-secretary/sec-{a,b,c,d,g,h,k}.jpg` + `sec-dark-*.jpg`
> API มือถือ: `docs/api/SECRETARY-API.md` · seed QC: `scripts/seed-secretary-qc.mts` + `scripts/sec-qc-data.mts` · แพ็กฟรี: `src/lib/ai/secretary/pack.ts` (S0.4 · มีแล้ว)
> ไฟล์ที่ "วางแผน" (ยังไม่มี) เขียนแบบ "ชื่อไฟล์ (แผน · โฟลเดอร์)" ไม่ใส่ path เต็มในเครื่องหมายโค้ด — ตามแบบ `20-crm-v2.md` (fitness F7 ตรวจเฉพาะไฟล์ที่มีจริง)

---

## 0. มติเจ้าของ + คำตัดสินที่ผูกเอกสารนี้

### 0.1 มติเจ้าของ 16 ข้อ (DESIGN-SECRETARY §0 · 30 ต.ค.–4 พ.ย.)

| # | เรื่อง | มติ | หน้าในแบบ | ผลต่อสัญญา |
|---|---|---|---|---|
| 1 | ชื่อเลขา | ผู้ใช้ตั้งเอง · ค่าเริ่มต้น **"Shark"** | [C1](../../ledger/DESIGN-SECRETARY.md) · B2 | `AiSecretary.name @default("Shark")` · §5.2 |
| 2 | เลขาผูกกับ | **ผู้ใช้** (ตามไปทุกกิจการ · สิทธิ์แยกตามกิจการ) | B1 B2 | `AiSecretary` axis global (§4) |
| 3 | เห็นงานของกัน | **เจ้าของเห็นงานทุกคนในกิจการ** · คนอื่นเห็นของตัวเอง (+ ห้องที่ถูกเพิ่ม R5) | A1 D1 | R-K1 · `sightForUser` · §7 |
| 4 | ช่องทางรุ่นแรก | **แอปเท่านั้น** (เว็บมีเฉพาะระบบ) · LINE รุ่นถัดไป | A8 | API มือถือชุดเดียว · §11 |
| 5 | "ครั้งหน้าไม่ต้องถาม" | **รุ่นแรกไม่มี** — ทุกงานที่เขียน/ส่งลูกค้ารออนุมัติ · อ่าน/สรุป/ร่างทำเอง | A4 B3 | ไม่มีระดับ AUTO · `setAccess(AUTO)` ปฏิเสธ (§5.3) |
| 6 | ย้อนกลับ | **24 ชั่วโมง** เฉพาะชนิดที่ย้อนได้จริง | A5 B5 | `AiActionLog.undoableUntil` · `undoAction` |
| 7 | ราคา/แพ็ก | ฟรีทั้งหมด · **100 งาน/เดือน** · แพ็กเสียเงินแสดงปิด · ปุ่มเติมเงินปิด · $10 ร้านเดิมคงไว้ ร้านใหม่ไม่ได้ | B8 | `FREE_PACK` · `SECRETARY_LAUNCH_AT` · §8 |
| 8 | งานข้ามกิจการ | ไม่ทำ · งานเปิดใต้กิจการเดียว | B1 | ทุกห้องมี `tenantId` เดียว |
| 9 | เลขาเสนองานเอง | ทำ · เป็นแค่ข้อเสนอ ไม่เริ่มจนคนแตะ | A2 C3 | `suggestions` ไม่เปิดห้องเอง |
| 10 | เลขาพัฒนาตัวเอง | ความจำ + ประสบการณ์ + ข้อมูลสด 3 ชั้น · เรียนจากสิ่งที่คนยืนยันเท่านั้น | B6 B2 A2 | `AiLesson` · `AiMemory.status` · `lessonBlock` · `computeDigest` |
| 11 | ไอคอนช่วยเหลือ | แจ้งปัญหาเป็นห้องแชทกับทีม SHARK · ต่อยอด Support Desk | H1–H4 | R-K12 · §5.17 |
| 12 | ชุดข้อมูลเทรน | เก็บตัวอย่าง + ผล ดี/แก้/ตีกลับ ไม่ระบุตัวตน · ร้านปิดได้ | — | `AiTrainingSample.{outcome, editedReply, …}` · `recordOutcome` |
| 13 | เบอร์ = ID | สมัคร/เข้าด้วยเบอร์ + **SMS OTP** · อีเมลสำรอง · Apple/Google คงไว้ · บัญชีเดิมบังคับผูกเบอร์ | S1 S2 | R-K9/K10 · `PhoneOtp` + `UserPhone` |
| 14 | แชทลูกค้าในแอป | ไอคอนที่ 2 = ลูกค้า (LINE · เว็บแชท) ต่อยอดโมดูล chat · แถบบน ซ้าย เลขา·ลูกค้า·ทีม / ขวา ?·+ | K1–K4 | R-K13 · `/api/mobile/inbox/*` |
| 15 | ผู้ดูแล + เรียกช่วย + กฎรับเรื่อง | ผู้ดูแล 1 คน · เรียกคนช่วย · ส่งต่อ · กฎต่อช่องทาง · SLA · เข้า/ออกเวร · **เฉพาะคนที่ตอบได้ในหน่วยนั้น** | K5 D1 | R-K14 · `ChatRoutingRule` `ChatShift` `ChatConversationHelper` |
| 16 | ปรับตามการวิเคราะห์ | + G1–G5 · S1/S2 เป็น SMS · สี 3 โซน · ตัด ไมค์ / TOPIC / "เปิดต่อจากทุกที่" / แปล-อัดเสียง K2 · งานประจำเหลือ วัน/สัปดาห์ | G1–G5 | §3 · §11 |

แก้รอบ 3 (R1–R9 · 3 พ.ย.): R1 ไอคอนแชท+คนแทนสวิตช์ · R2 เอา "ส" ออก · R3 ช่องพิมพ์ล่างสุด · R4 ไม่มี C2 · R5 ห้องร่วม (D2 D3) · R6/R7 สมัคร ชื่อ+เบอร์+อีเมล (OTP เปลี่ยนเป็น SMS ตามมติ 13) · R8 บัญชีเดิมต้องผูกเบอร์ไม่มีปุ่มข้าม · R9 C1 ไม่มีตัวอย่างชื่อ

### 0.2 คำตัดสิน R-K1…R-K20 (สรุป — ฉบับเต็มที่ `ledger/secretary-briefs/sec-brief-RESOLUTIONS.md`)

| # | สรุป 1 บรรทัด | ที่ใช้ในเอกสารนี้ |
|---|---|---|
| R-K1 | ขยาย `ConvSight` เป็น `{own; ownerExtras; tenantAll; memberOf}` · OWNER เห็นทุกห้อง **เฉพาะห้องที่มี `AiRoom`** · `AiRoom.startedById` = `conversationCreatorOf(id).id` | §5.4 §5.19 §7 |
| R-K2 | `AiMessage.authorUserId String?` เขียนเฉพาะ actor member · migration ก่อนโค้ด | §4 §10 |
| R-K3 | `classOfKind` (pure) · `ALWAYS_APPROVE` ค่าคงที่ · `AiApprovalRule` 3 กฎ · ความจำในห้องเลขาเป็นข้อเสนอ | §5.7 |
| R-K4 | ด่านผู้อนุมัติ role ≥ MANAGER เฉพาะห้องที่มี `AiRoom` · hook `approvalGate` หลังด่านเดิมของ `executeProposal` | §5.8 §7 |
| R-K5 | `AiScheduledTask.ownerUserId` · รันด้วย actor ของผู้ตั้ง · claim ด้วย `lastRunDay` · ไม่มีคอลัมน์นาที | §4 §5.21 |
| R-K6 | โควตา = scope `"jobs"` ที่สาม · นับที่ `startRoom` | §8 |
| R-K7 | `canRunAi(tenantId, {scope})` ชั้นเดียว · ร้านหลัง `SECRETARY_LAUNCH_AT` ไม่ได้ GRANT | §5.14 §5.18 §8 |
| R-K8 | ตอบใน request + `after()` · เก็บตกด้วย cron hourly/outbox · **ไม่มี cron รายนาที** | §5.5 §11 |
| R-K9/K10 | `PhoneOtp` + `UserPhone` (global) · `phone-auth.ts` (แผน · core/) · SMS mock ใน QC | §4 §5.22 |
| R-K11 | `StaffInvite` — ไม่สร้าง Membership จนกว่าจะรับ | §4 §5.25 |
| R-K12 | `SupportCase.{source, category, roomId}` · `listCasesForUser` · `assignCase` · ระงับเลขา = `setAccess` ทุกโมดูล OFF | §5.23 §5.24 |
| R-K13 | route มือถือรับ `systemId?` · ด่าน Bearer ใช้ค่าคงที่จาก `guard.ts`/`permissions.ts` · cursor `before?` | `SECRETARY-API.md` |
| R-K14 | คีย์ตอบแชท = **`chat.message.send`** · `eligibleResponders` | §5.26 §7 |
| R-K15 | `chat.send` → `sendReply({senderUserId: approver, senderName: "Shark (ผู้ช่วย AI)", meta.ai, clientMessageId: proposalId})` | §5.7 §9 |
| R-K16 | เส้นสาธิต 3 = **คืนมัดจำนัดหมาย** `booking.refund_deposit` | §1.4 §11 |
| R-K17 | เครื่องมือ POS/SVC v2 ใช้ได้แล้ว · เครื่องมือ SVC v2 ใหม่ (deposit/online/planner/no-show/dorm) นอกขอบเขตรุ่นแรก ยกเว้น `booking.refund_deposit` | §11 |
| R-K18 | `AnthropicProvider` · `MODEL_IDS` · `pickModel` คืน tier · env `AI_PROVIDER` | §5.15 |
| R-K19 | แอปตามแผน S0.2/S2.13/S3a.2 · `EXPO_PUBLIC_API_URL` override เฉพาะ dev | §2 |
| R-K20 | `PushMsg.badge?` · `AiNotifyPref` (global) · deep-link `data.link` + คง `data.conversationId` | §4 §9 |

---

## 1. ขอบเขต · persona · user stories

### 1.1 ทำอะไร
ผู้ใช้ 1 คนมี **เลขา AI 1 ตัว** (ค่าเริ่มต้น "Shark") ที่ตามไปทุกกิจการ · คำสั่ง 1 ครั้ง = **ห้องงาน** 1 ห้อง (ผู้ใช้เห็นคำว่า "งาน" ไม่ใช่ session) ที่ทำงานเบื้องหลังบนเซิร์ฟเวอร์ ข้าม POS · CRM · สมาชิก · บัญชี · บอร์ดงาน · จองคิว · แชทลูกค้า ผ่านทะเบียนเครื่องมือเดิม (`src/lib/ai/tools.ts`) · ทุกการเขียน/ส่งลูกค้าเป็น **ข้อเสนอรออนุมัติ** (`src/lib/ai/proposals.ts`) · สิทธิ์ = ผู้พิมพ์ข้อความ ∩ ระดับต่อระบบของกิจการ · แอปเดียวรวม ห้องงาน · แชทลูกค้า · ทีม · ช่วยเหลือ

### 1.2 ไม่ทำในรุ่นแรก
ดู §11 (AUTO/"ไม่ต้องถาม" · งานข้ามกิจการ · LINE เป็นช่องสั่งงาน · เว็บห้องเลขา · dorm ในห้องเลขา · cron รายนาที · เครื่องมือ SVC v2 ใหม่)

### 1.3 Persona
| persona | บทบาท | ใช้อะไร |
|---|---|---|
| คุณสุข เจ้าของร้านกาแฟ (seed `secqc-owner`) | OWNER | สั่งงาน · อนุมัติ · เห็นงานทุกคน (D1) · ตั้งสิทธิ์ (B3 B4) · โควตา (B8) · เชิญพนักงาน (G2) |
| คุณมานี ผู้จัดการ (`secqc-manager`) | MANAGER | สั่งงาน · อนุมัติข้อเสนอในห้องเลขา · ตอบแชทลูกค้า |
| น้องขาย (`secqc-staff-sales`) | STAFF + `chat.conversation.read` + `chat.message.send` | สั่งงานของตัวเอง · ตอบลูกค้า · ถูกเพิ่มเข้าห้องร่วม |
| พี่หอ (`secqc-staff-dorm`) | STAFF + บอร์ดงาน | สั่งงานของตัวเอง (ไม่มีสิทธิ์แชท) |
| ลุงยาม (`secqc-staff-guard`) | STAFF ไม่มีคีย์ `chat.*` | ใช้เลขาได้ · ไอคอน "ลูกค้า" ไม่แสดง · สั่งสรุปแชท = ปฏิเสธ |
| ทีม SHARK (PlatformUser) | backoffice | H3 H4 G5 |

### 1.4 User stories ที่ต้องผ่านตอนตรวจรับ (10)
1. **สมัครด้วยเบอร์** — คนใหม่กรอก ชื่อ + เบอร์ + อีเมล (S1) → รับ SMS OTP 6 หลัก (S2) → `verifyPhoneOtp` สร้าง `User` + `UserPhone` ใน tx เดียว → เข้าแอป · บัญชีอีเมลเดิมเข้าด้วยอีเมลแล้วถูกบังคับผูกเบอร์ (R8)
2. **ตั้งชื่อเลขา** — ครั้งแรก C1 เติม "Shark" ให้ · แก้ชื่อ/ลงท้าย ครับ/ค่ะ/น้ำเสียง → `updateSecretary` · ตัวอย่างประโยคจาก `sampleSpeech`
3. **สั่งงานแรก** — C3 แตะงานแนะนำ หรือพิมพ์ที่ A2 → `startRoom` (นับ 1 งาน) → ห้องขึ้น A1 สถานะ "กำลังทำ" → ปิดแอปได้ · เสร็จ/รออนุมัติแล้ว push (A8)
4. **อนุมัติ** — A4 การ์ด "จะทำอะไร + ทำไมต้องอนุมัติ" (`classOfKind`) → OWNER/MANAGER กดอนุมัติ → `executeProposal` + `approvalGate` → `AiActionLog` → A5 ลิงก์ของจริง + ย้อนได้ 24 ชม.
5. **ตีกลับ + สอน** — C4 พิมพ์เหตุผล → "แค่งานนี้" (เลขาแก้ในห้องเดิม) / "จำเป็นกฎ" (`AiMemory.status="PENDING"` รอเจ้าของยืนยันใน B6) → `rejectWithNote`
6. **ห้องร่วม** — เจ้าของเพิ่มน้องขายเข้าห้อง (D3 · ปิด "เห็นข้อความเก่า" เป็นค่าเริ่มต้น) → น้องขายพิมพ์สั่งในห้องเดียวกันด้วยสิทธิ์ของตัวเอง → ฟองมีชื่อคนพิมพ์ (D2 · `authorUserId`)
7. **ลูกค้าทัก → Shark ร่าง → ส่ง** — ลูกค้า LINE ถามราคา (K1) → K2 การ์ด "Shark ร่างคำตอบ" (`ChatAiSuggestion` เดิม · ไม่นับงาน) หรือ "สั่ง Shark เรื่องลูกค้านี้" → ใบเสนอราคา + ข้อเสนอ `chat.send` → อนุมัติ → ฟองในห้องลูกค้า "ส่งโดย Shark (ผู้ช่วย AI) · อนุมัติโดย คุณสุข" (R-K15)
8. **มอบหมายอัตโนมัติ** — K5 เปิดกฎ "วนตามเวร" ของ LINE · น้องขายกดเข้าเวร → ข้อความใหม่ → `assignIncoming` ให้คนที่ `chat.message.send` + หน่วยตรงเท่านั้น · ไม่มีใคร → เจ้าของ · ไม่ตอบเกิน SLA → เตือน → ย้ายให้ผู้จัดการ
9. **เชิญพนักงาน** — G2 กรอก ชื่อ + เบอร์ + บทบาท + สิทธิ์ → `createInvite` ส่ง SMS ลิงก์ `https://shark.in.th/i/<code>` (7 วัน) → D1 "รอรับคำเชิญ" → คนนั้นเข้าแอปด้วยเบอร์นั้น → `acceptInvite` สร้าง `Membership` ผ่านตัวตรวจเดียวกับ `updateStaffAccess`
10. **เจ้าของดูงานทุกคน** — D1 รายชื่อ + สถานะงานต่อคน · A1 ขอบเขต "ทุกคนในกิจการ" (`listRooms({scope: "tenant"})`) เห็นห้องที่มี `AiRoom` ของทุกคน ป้าย "สั่งโดย" · STAFF ขอ scope tenant = 404

### 1.5 เส้นสาธิต 3 เส้น (ทดสอบด้วยโมเดลจริงตอนปิด S1 · ใบ S1.14 · R-K16)
1. **ใบเสนอราคา → ส่ง LINE ลูกค้า** — `account.*` (ร่างใบเสนอราคา) + `chat.send` (ส่งลิงก์ใบให้ลูกค้าที่ผูก `ChatContact.customerId`)
2. **ขายหน้าร้าน POS v2 + สมาชิกสะสมแต้ม** — `pos.*` (ทะเบียน op ของ POS v2 ผ่าน `src/lib/ai/tools-pos.ts`) + แต้มสมาชิก
3. **คืนมัดจำนัดหมาย (booking)** — kind ใหม่ `booking.refund_deposit` เขียนมือ → `bookingSvc.refundDeposit` (booking/service.ts:1329 · ข้อสอบ `qc-booking-deposit` รองรับ) · ชนิดเงินออก ⇒ `ALWAYS_APPROVE`

---

## 2. IA + การนำทาง

### 2.1 แถบบน (ทุกจอหลัก · มติ 14/16 · R1 R2)
- **ซ้าย 3 โซน**: เลขา (ดำ · ห้องงาน A1) · ลูกค้า (เขียว · K1 · ซ่อนเมื่อไม่มี `chat.conversation.read`) · ทีม (ม่วง-น้ำเงิน · D1 · เฉพาะ OWNER/MANAGER ตามข้อเสนอ §0.1 ข้อ 2)
- **ขวา**: `?` ช่วยเหลือ (H1) · `+` เริ่มงานใหม่ (A2) · ชื่อกิจการแตะได้ → B1 (สลับกิจการ + "เลขาของฉัน" B2)
- ไม่มีแถบเมนูล่าง · โหมดมืดตาม `shark_theme` (R-UI3) · ขนาดตาม R-UI1 (× 0.73 ของภาพ · ตัวอักษรไม่ต่ำกว่า `tokens.type`)

### 2.2 ลำดับหน้า
```
ติดตั้งใหม่: S1 สมัคร → S2 OTP SMS → C1 ตั้งชื่อเลขา → (ไม่มีกิจการ) G1 สร้างกิจการ → C3 ยังไม่มีงาน
เข้าครั้งถัดไป: S2 (OTP) → A1 งานทั้งหมด
A1 ──แตะห้อง──▶ A3 กำลังทำ / A4 รออนุมัติ / A5 เสร็จ  (ห้องเดียวกัน · การ์ดตามสถานะ)
   ──+──▶ A2 เริ่มงานใหม่        ──ไอคอนลูกค้า──▶ K1 ──▶ K2 ──▶ K3 / K4 / K5
   ──ไอคอนทีม──▶ D1 ──▶ G2 เชิญ / G3 สิทธิ์ต่อคน     ──ในห้อง ⋯──▶ D3 เพิ่มคน → D2 ห้องร่วม
   ──ชื่อกิจการ──▶ B1 ──▶ B2 เลขาของฉัน · B3 B4 B5 B6 B7 B8 · G1 เพิ่มกิจการ · G4 บัญชีของฉัน
   ──?──▶ H1 ──▶ H2   ·   push ──▶ data.link (ห้องงาน / ห้องลูกค้า / เคส)  ·  A6 รวมรออนุมัติทุกกิจการ · A7 งานประจำ
backoffice (เว็บแพลตฟอร์ม): H3 รายการเรื่องแจ้ง → H4 ห้องแชทกับผู้ใช้ · G5 คิวเลขา
```
จอใหม่อยู่ในโฟลเดอร์ `apps/mobile/app/(app)/secretary` · ข้อมูลผ่าน secretary.ts (แผน · apps/mobile/src/api/) ที่ type จากเอกสารนี้ + `docs/api/SECRETARY-API.md` (COMMON §C.12)

---

## 3. หน้าจอ 38 หน้า → องค์ประกอบ → ฟังก์ชัน/ตาราง

| หน้า | ชื่อ (ภาพ) | องค์ประกอบหลัก | ฟังก์ชัน / ตาราง | ใบ |
|---|---|---|---|---|
| **A1** | หน้าหลัก งานทั้งหมด (sec-a) | ตัวกรอง 4 (ทั้งหมด/กำลังทำ/รออนุมัติ/เสร็จ) · การ์ดห้อง (จุดสี · ป้ายระบบ · "สั่งโดย" · "ร่วมกับ") · ขอบเขต ของฉัน/ทุกคน (OWNER) | `listRooms` · `roomStatus` · `AiRoom` · `AiRoomMember` · `conversationCreatorOf` | S1.4 · S2.2 |
| **A2** | เริ่มงานใหม่ (sec-a) | ข้อเสนอจากข้อมูลวันนี้ · งานที่สั่งบ่อย · ช่องพิมพ์ล่างสุด (R3) | `suggestions` · `computeDigest` · `startRoom` | S1.11 · S1.16 · S2.3 |
| **A3** | งานกำลังทำ (sec-a) | การ์ดขั้นตอนทีละระบบ · "ทำงานอยู่เบื้องหลัง" · ปิดแอปได้ | `AiRoomJob` · `enqueueRoomJob` · `runRoomJobs` · `AiPlan.stepsJson` | S1.5 · S2.4 |
| **A4** | งานรออนุมัติ (sec-a) | การ์ดอนุมัติ · "ทำไมต้องอนุมัติ" · แก้ก่อนอนุมัติ · ตีกลับ | `classOfKind` · `approvalGate` · `executeProposal` · `editProposal` · `rejectWithNote` | S1.7 · S1.10 · S2.4 |
| **A5** | งานเสร็จ (sec-a) | สรุป · ลิงก์ของจริงที่เปลี่ยน · ย้อนกลับ/สอน/ทำซ้ำ | `AiActionLog` · `undoAction` · `listLog` · `{note, entity}` จาก dispatch (§B.5) | S1.8 · S2.4 |
| **A6** | รออนุมัติรวมทุกกิจการ (sec-a) | รายการข้อเสนอ PENDING ทุกกิจการที่ผู้ใช้อนุมัติได้ | `inboxForUser` · `requireMobileUser` (แผน) | S1.11 · S2.5 |
| **A7** | งานประจำ (sec-a) | รายการงาน · ทุกวัน/ทุกสัปดาห์ · ชั่วโมง · ช่องทาง · หยุดชั่วคราว | `AiScheduledTask.{ownerUserId, frequency, days, channels}` · `runScheduledTasks` | S1.9 · S2.5 |
| **A8** | แจ้งเตือนล็อกสกรีน (sec-a) | 4 ชนิด (รออนุมัติ · เสร็จ · ลูกค้า · ช่วยเหลือ) · badge · deep-link | `sendPushToUser` · `PushMsg.badge` · `data.link` · `AiNotifyPref` | S1.5 · S1.23 · S2.6 |
| **B1** | สลับกิจการ (sec-b) | รายชื่อกิจการ · + เพิ่มกิจการ · "เลขาของฉัน" | `GET /api/mobile/me` · `createTenantFromApp` | S2.7 |
| **B2** | เลขาของฉัน (sec-b) | ชื่อ · น้ำเสียง · ลงท้าย · ภาษา · สถิติ 4 ตัว (งาน/ผ่านไม่แก้/แก้/ตีกลับ) | `ensureSecretary` · `updateSecretary` · `sampleSpeech` · `AiSecretary` | S1.2 · S2.7 |
| **B3** | สิทธิ์ต่อระบบ (sec-b) | ต่อโมดูล ปิด / ดูอย่างเดียว / ร่าง+รออนุมัติ (ทำเองได้ = ปิดในรุ่นแรก) | `setAccess` · `listAccess` · `AiSystemAccess` | S1.3 · S2.8 |
| **B4** | ต้องอนุมัติเสมอ + ผู้อนุมัติ (sec-b) | รายการปิดไม่ได้ (เงินออก · ลบ · PII) · กฎตั้งได้ 3 ข้อ · วงเงิน · ผู้อนุมัติ | `ALWAYS_APPROVE` · `AiApprovalRule` · `approvalGate` | S1.7 · S2.8 |
| **B5** | บันทึกการกระทำ (sec-b) | รายวัน · ต่อระบบ · ผู้สั่ง · ผู้อนุมัติ · ปุ่มย้อน (ภายใน 24 ชม.) | `listLog` · `undoAction` · `AiActionLog` | S1.8 · S2.8 |
| **B6** | ความรู้ของกิจการ + สิ่งที่เรียนรู้ (sec-b) | ความรู้ (ยืนยันแล้ว/รอยืนยัน) · บทเรียน · ข้อมูลสด · ลบได้ | `AiMemory.status` · `AiLesson` · `lessonBlock` · `computeDigest` | S1.10 · S1.15 · S1.16 · S2.9 |
| **B7** | คุยกับลูกค้าแทนร้าน + PDPA (sec-b) | นอกเวลาทำการให้ Shark ตอบ · ส่งต่อคน · ข้อความเปิดเผย AI | `ChatSetting.businessHours` · `readBusinessHours` · `AiSettings` (คอลัมน์ในใบ S1.22) | S1.22 · S2.9 |
| **B8** | โควตา/แพ็ก (sec-b) | วงแหวน % · "≈ N งานที่เหลือ" · วันรีเซ็ต · แพ็กเสียเงิน (ปิด) | `quotaStatus` · `quotaMessage` · `FREE_PACK` · `AiJobCounter` | S0.4 · S1.13 · S2.7 |
| **C1** | ตั้งชื่อเลขาครั้งแรก (sec-c) | ช่องชื่อเติม "Shark" (R9) · ลงท้าย · น้ำเสียง | `ensureSecretary` · `updateSecretary` | S1.2 · S2.11 |
| **C3** | ยังไม่มีงาน (sec-c) | งานแรกที่แนะนำ · ช่องพิมพ์ | `suggestions` · `POST /api/mobile/chat/welcome` (เดิม) | S1.11 · S2.2 |
| **C4** | ตีกลับ → แก้ → "แค่งานนี้ / จำเป็นกฎ" (sec-c) | เหตุผล · 2 ทางเลือก · ข้อความยืนยัน | `rejectWithNote` · `AiMemory.status="PENDING"` | S1.10 · S2.4 |
| **S1** | สมัคร ชื่อ + เบอร์ + อีเมล (sec-c) | 3 ช่อง · Apple/Google · ลิงก์เข้าด้วยอีเมล | `requestPhoneOtp` · `toE164Thai` (sms.ts:37) | S1.19 · S2.12 |
| **S2** | ยืนยัน OTP SMS (sec-c) | 6 ช่อง · นับถอยหลังขอใหม่ · ผิดเกิน 5 ครั้ง | `verifyPhoneOtp` · `issueMobileToken` (mobile/auth.ts:23) | S1.19 · S2.12 |
| **D1** | ทุกคนในกิจการ (sec-d) | รายชื่อ · สถานะงานต่อคน · ป้ายแชท ไม่เห็น/ดูได้/ตอบได้ · "รอรับคำเชิญ" · + เชิญ | `listStaffAccess` (staff/service.ts:249) · `StaffInvite` · `AiRoom.startedById` | S1.25 · S2.10 |
| **D2** | ห้องร่วม (sec-d) | ฟองมีชื่อ · ข้อความระบบ "X เพิ่ม Y" · "รออนุมัติ · คุณสุข" | `AiRoomMember` · `AiMessage.authorUserId` · `listMessages` กรอง `addedAt` | S1.6 · S2.10 |
| **D3** | เพิ่มพนักงานเข้าห้อง (sec-d) | ติ๊กรายชื่อ · สวิตช์เห็นข้อความเก่า · คำเตือน | `addMember` · `removeMember` | S1.6 · S2.10 |
| **H1** | ช่วยเหลือ (sec-h) | ชิป 5 หมวด · รายการเรื่อง (จุดสถานะ) · ช่องพิมพ์ = เรื่องใหม่ | `listCasesForUser` · `openCaseFromApp` · `SupportCase.category` | S1.17 · S2.15 |
| **H2** | ห้องแจ้งปัญหา (sec-h) | แชทกับทีม · แนบภาพ · แนบห้องงาน · การ์ด "แก้แล้วหรือยัง" | `listCaseMessages` (:185) · `addShopMessage` (:196) · `SupportCase.roomId` | S1.17 · S2.15 |
| **H3** | backoffice รายการเรื่อง (sec-h) | แท็บ ใหม่/รอร้าน/ของฉัน/ปิด · ช่องทาง · หมวด · ป้าย ! | `listAllCases({status, source, category, assignee})` | S1.17 · S2.16 |
| **H4** | backoffice ห้องแชทกับผู้ใช้ (sec-h) | รับเรื่อง · ระงับเลขาของร้าน · ห้องงานที่แนบ · ร่าง AI · push | `assignCase` · `setAccess` (ทุกโมดูล OFF) · `draftCaseReply` (support-ai.ts:48) · `addPlatformMessage` | S1.17 · S2.16 |
| **K1** | รายการลูกค้า (sec-k) | ตัวนับต่อช่องทาง · แท็บ · ชิปช่องทาง · แถว · "Shark ร่างไว้" · "รอ N นาที" | `listConversations` (+`before`) · `unreadCount` · `waitingMin` | S1.21 · S1.24 · S2.17 |
| **K2** | ห้องแชทลูกค้า (sec-k) | ฟอง · บันทึกภายใน · การ์ดร่าง · ป้ายส่งโดย Shark · ไฟล์/สติกเกอร์ · ตอบเร็ว | `getThread` · `sendReply` · `suggestReply` · `applyQuickReply` · `meta.ai` | S1.21 · S1.22 · S2.18 |
| **K3** | ข้อมูลลูกค้า (sec-k) | ติดต่อ · ในระบบ SHARK · ผู้ดูแล · แท็ก · สร้างงานบอร์ด · สั่ง Shark | `linkCustomer` · `assign` · `setStatus` · `createTaskFromChat` · `startRoom({context})` | S1.21 · S1.22 · S2.19 |
| **K4** | ช่องทาง · ตอบเร็ว · แจ้งเตือน (sec-k) | ช่องทางที่เชื่อม (อ่านอย่างเดียว) · Shark เสนอคำตอบ · ตอบเร็ว · แจ้งเตือน ทุกข้อความ/ที่มอบหมาย/ปิด | `listConnections` · `AiNotifyPref` · `ChatSetting.aiSuggestEnabled` | S1.21 · S1.23 · S2.19 |
| **K5** | กฎรับเรื่องใหม่ · เข้าเวร · ยกระดับ (sec-k) | กฎต่อช่องทาง · รายชื่อเข้าเวร · SLA | `ChatRoutingRule` · `ChatShift` · `assignIncoming` · `eligibleResponders` | S1.24 · S2.19 |
| **G1** | สร้างกิจการ (sec-g) | ชื่อ · ประเภท · ระบบที่เปิด → เลขาเปิดห้อง "ตั้งค่าเริ่มต้น" | `createTenantFromApp` · `applyBlueprint` (dna/service.ts:175) · `startRoom` | S1.25 · S2.21 |
| **G2** | เชิญพนักงาน (sec-g) | ชื่อ · เบอร์ · บทบาท · หน่วย · สิทธิ์ · ส่ง SMS | `createInvite` · `sendSms` (sms.ts:100) · `StaffInvite` | S1.25 · S2.21 |
| **G3** | สิทธิ์ต่อคน (sec-g) | บทบาท · หน่วย · ระดับต่อระบบ ปิด/ดู/ใช้งาน · แชท 3 ระดับ · ระงับ/เอาออก | `moduleLevel` · `setModuleLevel` · `updateStaffAccess` (:492) · `revokeStaffAccess` (:586) | S1.25 · S2.22 |
| **G4** | บัญชีของฉัน (sec-g) | เบอร์/อีเมล/Apple · ธีม · แจ้งเตือน · เข้า/ออกเวร · ลบบัญชี | `previewAccountDeletion` · `deleteAccount` (account-deletion.ts:35,:80) · `ChatShift` | S1.14 · S2.22 |
| **G5** | backoffice คิวเลขา (sec-g) | กำลังรัน/รอ/ล้มเหลว · ต้นทุนรวม (เฉพาะทีม SHARK) · ลองใหม่ | `AiRoomJob` · `AiCreditTxn.conversationId` · `usageBySource` (credit.ts:296) | S1.5 · S2.23 |

---

## 4. Data Model (migration `secretary_a` · ใบ S1.1 · additive ล้วน)

แหล่ง: `ledger/secretary-briefs/sec-brief-S1.1.md` §Schema (ต้องตรงกันที่ CP0) · ไฟล์ใหม่ secretary.prisma ในโฟลเดอร์ `prisma/schema` + คอลัมน์ nullable บนตารางเดิม · `core.prisma` คง FROZEN (เบอร์อยู่ที่ตาราง `UserPhone`)
ทุกโมเดลใหม่: `id` cuid · `createdAt @default(now())` · `updatedAt @updatedAt` เมื่อแถวเปลี่ยนได้ · `tenantId` บนแถวระดับกิจการ · FK `onDelete: Cascade` ไปที่แม่ (`AiRoom`→`AiConversation` · `AiRoomMember`/`AiRoomJob`→`AiRoom`) · ดัชนีในวงเล็บ [ ] · ทุกโมเดลลง `src/lib/core/scope.ts` ตาม axis (fitness F1)
> ตรงกับ migration ที่ merge แล้ว (`prisma/migrations/20261227000000_secretary_a/migration.sql` · session/secretary d4cbb6ce): `AiSecretary.userId` · `UserPhone.userId` · `ChatConversationHelper.conversationId` มี **FK ON DELETE CASCADE** ใน SQL ของ migration (บรรทัด 370–376) · relation field ฝั่ง `User`/`ChatConversation` เพิ่มใน S1.1 รอบสอง (RESOLUTIONS R-S1.1a · back-relation 2 บรรทัดบน User) · `AiRoomMember` `AiRoomJob` `ChatShift` `ChatConversationHelper` มี `tenantId` ด้วย (axis tenant)

### 4.1 M-table — 16 โมเดลใหม่

| M | โมเดล | axis | ฟิลด์ | ดัชนี / unique | ใบที่ใช้ |
|---|---|---|---|---|---|
| M1 | `AiSecretary` | global `g(...)` | `userId @unique` (→ User · Cascade) · `name String @default("Shark")` · `suffix String @default("ครับ")` · `tone String @default("polite")` · `languages String[] @default(["th"])` · `prefs Json @default("{}")` (ไม่มี PII) | `userId` unique | S1.2 · S1.15 |
| M2 | `AiRoom` | tenant | `conversationId @unique` (→ AiConversation · Cascade) · `tenantId` · `startedById String` (= `conversationCreatorOf(conversationId).id` · denormalized · R-K1) · `title String` · `closedAt DateTime?` · `systems String[] @default([])` · `contextJson Json?` ({chatConversationId, contactId} ของ S1.22) · `jobsCounted Int @default(1)` | [tenantId, startedById, updatedAt] · [tenantId, closedAt] | S1.4 |
| M2 | `AiRoomMember` | tenant | `tenantId` · `roomId` (→ AiRoom · Cascade) · `userId` · `addedById` · `addedAt @default(now())` · `seeHistory Boolean @default(false)` | `@@unique([roomId, userId])` · [userId] | S1.6 |
| M8 | `AiRoomJob` | tenant | `tenantId` · `roomId` (→ AiRoom · Cascade) · `messageId String @unique` (AiMessage id) · `authorUserId String?` · `status String @default("QUEUED")` (QUEUED/RUNNING/DONE/FAILED) · `leaseUntil DateTime?` · `attempts Int @default(0)` · `error String?` · `startedAt DateTime?` · `finishedAt DateTime?` | [status, leaseUntil] · [roomId, createdAt] | S1.5 |
| M3 | `AiSystemAccess` | tenant | `tenantId` · `module String` · `level String @default("DRAFT")` (OFF/READ/DRAFT) · `setById String` | `@@unique([tenantId, module])` | S1.3 |
| M4 | `AiApprovalRule` | tenant | `tenantId` · `key String` (`chat.send` \| `money.limit` \| `pii.export` — R-K3) · `enabled Boolean @default(true)` · `limitSatang Int?` · `setById String` | `@@unique([tenantId, key])` | S1.7 |
| M5 | `AiActionLog` | tenant | `tenantId` · `roomId String?` · `userId String` · `approverId String?` · `module String` · `kind String` · `summary String` · `payload Json` (ids เท่านั้น · ไม่มี PII) · `proposalId String?` · `entityType String?` · `entityId String?` · `undoableUntil DateTime?` · `undoneAt DateTime?` · `undoneById String?` | [tenantId, createdAt] · [roomId] · [proposalId] | S1.8 |
| M7 | `AiJobCounter` | tenant | `tenantId` · `month String` ("YYYY-MM" เดือนไทยจาก `monthKeyBangkok`) · `jobs Int @default(0)` | `@@unique([tenantId, month])` | S1.13 |
| M10 | `AiLesson` | tenant | `tenantId` · `kind String` · `pattern String` · `example String` · `status String @default("PENDING")` (PENDING/CONFIRMED/REJECTED) · `occurrences Int @default(1)` · `sourceRoomId String?` · `sourceUserId String` · `confirmedById String?` | [tenantId, kind, status] | S1.15 |
| M9 | `StaffInvite` (R-K11) | tenant | `tenantId` · `phone String` (E.164) · `name String` · `role String` (MANAGER/STAFF) · `unitAccess Json @default("[]")` · `permissions Json @default("{}")` · `codeHash String @unique` · `expiresAt DateTime` · `acceptedAt DateTime?` · `acceptedUserId String?` · `invitedById String` | [tenantId, phone] · [tenantId, acceptedAt] | S1.25 |
| M11 | `ChatRoutingRule` | tenant | `tenantId` · `systemId String` · `channel String?` · `mode String` (ROUND_ROBIN/LAST_ASSIGNEE/OWNER) · `enabled Boolean @default(false)` · `order Int @default(0)` | `@@index([tenantId, systemId, enabled, order])` | S1.24 |
| M11 | `ChatShift` | tenant | `tenantId` · `userId` · `onDutyAt DateTime` · `offDutyAt DateTime?` | `@@index([tenantId, userId, offDutyAt])` | S1.24 |
| M11 | `ChatConversationHelper` | tenant | `tenantId` · `conversationId` (→ ChatConversation · Cascade) · `userId` · `calledById` · `note String?` | `@@unique([conversationId, userId])` · [userId] | S1.24 |
| M9 | `UserPhone` | global `g(...)` | `userId @unique` (→ User · Cascade) · `phone String @unique` (E.164) · `verifiedAt DateTime?` | `userId` unique · `phone` unique | S1.19 |
| M9 | `PhoneOtp` (R-K9) | global `g(...)` | `phone String` · `codeHash String` · `expiresAt DateTime` · `consumedAt DateTime?` · `attempts Int @default(0)` · `ip String?` | [phone, createdAt] · [expiresAt] | S1.19 |
| M12 | `AiNotifyPref` (R-K20) | global `g(...)` | `userId` · `tenantId String?` · `kind String` (inbox/approval/room/help) · `mode String` (ALL/ASSIGNED/OFF) | `@@unique([userId, tenantId, kind])` | S1.23 |

### 4.2 คอลัมน์ nullable บนตารางเดิม (บรรทัดเดียวต่อคอลัมน์ · คอมเมนต์ไทย `// S1.1 เลขา AI`)
- `AiMessage.authorUserId String?` (R-K2 · ผู้พิมพ์ข้อความ USER ในห้องเลขา · ห้องเดิม = null)
- `AiMemory.status String?` (null = ยืนยันแล้วแบบเดิม · "PENDING" = รอเจ้าของ)
- `AiScheduledTask.{ownerUserId String?, frequency String?, days Int[] @default([]), channels String[] @default([])}` — ไม่มีคอลัมน์นาที (R-K5/R-K8 · รันที่รอบ hourly ของ `hourBkk` เดิม)
- `AiTrainingSample.{outcome String?, editedReply String?, stepsJson Json?, roomId String?, proposalId String?}` (§B.4)
- `SupportCase.{source String?, category String?, roomId String?}` (R-K12 · `roomId` อ้าง `AiRoom.id` ไม่ใช่ conversationId)

### 4.3 ความสัมพันธ์ที่ห้ามเดินผิดทาง
- ผู้สร้างห้อง = รหัสห้อง `u~<userId>~…` (conversation-owner.ts:6–9) เป็นแหล่งความจริงเดียว · `AiRoom.startedById` เป็นสำเนา (ข้อสอบ S1.4 ตรวจว่าตรงกัน)
- ห้องที่ไม่มีแถว `AiRoom` = ห้อง AI รุ่นเดิม ⇒ พฤติกรรมเดิมทุกตัวอักษร (COMMON §C.11)
- `AiRoomJob.messageId` 1:1 กับ `AiMessage` (USER) · job ไม่ถือข้อความซ้ำ
- `StaffInvite` ไม่ใช่ `Membership` — `Membership.acceptedAt = null` ยังหมายถึง "ถูกถอนสิทธิ์" (staff/service.ts:576)
- ไม่เพิ่มค่าใน enum `AiCreditSource` — ห้องเลขาใช้ `CHAT` + `AiCreditTxn.conversationId` (§B.2)
- seed QC (`scripts/seed-secretary-qc.mts`) ตรวจโมเดลชุดนี้ตอนรัน · ยังไม่มี ⇒ พิมพ์ `TODO(S1.1): …` · ค่าที่รอตารางอยู่ใน `SEC.pending` ของ `scripts/sec-qc-data.mts`

---

## 5. Service API (ต่อไฟล์ · ลายเซ็น `name(params) → return` · กติกา · event)

กติกากลาง: ทุกฟังก์ชันรับ `ctx { tenantId, actor }` (`ConvCtx` · conversation-owner.ts:35) เว้นแต่ระบุ · ห้อง/แถวของกิจการอื่นหรือที่มองไม่เห็น = ตอบเหมือน "ไม่มี" (404-not-403) · ตัวนับเป็นคำสั่งเดียว (COMMON §C.5) · ผลของโมเดลเป็นข้อมูล ไม่ใช่สิทธิ์ (§C.3) · `now` ฉีดได้ทุกฟังก์ชันที่ใช้เวลา · DTO ไม่มี token/micro-dollar (§C.6) · ไฟล์ใหม่อยู่ในโฟลเดอร์ `src/lib/ai/secretary` (แผน) ยกเว้นระบุ

### 5.1 `pack.ts` (S0.4 · มีแล้ว · `src/lib/ai/secretary/pack.ts`)
- `FREE_PACK = { enabled: true, jobsPerMonth: 100, scheduledMax: 10, approversMax: 5 }` · `SECRETARY_LAUNCH_AT = "2026-11-04T00:00:00.000Z"` (ตั้งเวลา deploy จริงใน S3a.2)
- `countsAsJob(ev: JobEvent) → 0 | 1` — room_new = 1 · room_message = 0 · scheduled_run = 1 · `couldNotAct` ⇒ 0
- `quotaMessage(used: number, limit: number, resetAt: Date, now: Date) → { level, pct, jobsLeft, text }` — < 80 ok (text null) · 80–94 warn80 · 95–99 warn95 · ≥ 100 exhausted · ข้อความไทยมี % / "หมด" + วันรีเซ็ต "1 ธ.ค." + งานที่เหลือ · ไม่มี token/บาท (ชื่อซ้ำกับ `quotaMessage(scope?, resetAt?)` ของ `src/lib/ai/usage.ts` — คนละโมดูล · ตัวนี้คือโควตางาน)
- `nextResetBangkok(now: Date) → Date` — 00:00 เวลาไทยวันที่ 1 เดือนถัดไป · `monthKeyBangkok(now: Date) → string` — "YYYY-MM" เดือนไทย (ใช้ `bkkParts` ของ `src/lib/core/quiet-hours.ts`)

### 5.2 secretary.ts (แผน · S1.2) — ตัวตนเลขาต่อผู้ใช้
- `ensureSecretary(userId: string) → Promise<AiSecretaryDto>` — upsert ค่าเริ่มต้น Shark/ครับ/polite/["th"] (`INSERT … ON CONFLICT DO NOTHING`) · ไม่ต้องมี tenant
- `updateSecretary(userId: string, patch: { name?; suffix?; tone?; languages?; prefs? }) → Promise<AiSecretaryDto>` — zod: name 1–24 ตัว · suffix ∈ {ครับ, ค่ะ, ""} · tone ∈ {polite, friendly, brief} · languages ⊆ {th, en, cn, ja} · prefs ไม่มี PII
- `sampleSpeech(sec: AiSecretaryDto) → string` — pure · ประโยคตัวอย่างตามชื่อ/ลงท้าย/น้ำเสียง (ไม่เรียกโมเดล)
- ต่อ `buildSystemPrompt` (persona.ts:29): prompt อังกฤษ + บล็อกตัวตน · ภาษาตอบตาม `languages` (แทน "ตอบภาษาไทยเสมอ" :59 เฉพาะห้องเลขา)

### 5.3 access.ts (แผน · S1.3) — ระดับต่อระบบ (B3)
- `listAccess(ctx) → Promise<{ module; level: "OFF" | "READ" | "DRAFT" }[]>` — ไม่มีแถว = DRAFT · `chat` ไม่มีแถว = READ จนเชื่อมช่องทาง
- `setAccess(ctx, module: string, level: "OFF" | "READ" | "DRAFT" | "AUTO") → Promise<{ ok: true } | { ok: false; reason: string }>` — OWNER เท่านั้น · `AUTO` ⇒ `{ok:false, reason:"รุ่นแรกยังไม่เปิดให้เลขาทำเองโดยไม่ถาม"}` · upsert `@@unique([tenantId, module])`
- ต่อด่านเดิม 2 ชั้น: `toolsOfferedTo` (tool-access.ts:289) ตัดเครื่องมือของโมดูล OFF / ตัดเครื่องมือเขียนของ READ · `toolVerdict` ใน `runTool` (tools.ts:2411) ปฏิเสธซ้ำ · `executeProposal` ตรวจระดับอีกครั้งตอน execute (COMMON §C.2)

### 5.4 rooms.ts (แผน · S1.4) — ห้องงาน
- `sightForUser(tenantId: string, membership: { userId; role }) → Promise<ConvSight>` — อ่าน DB ครั้งเดียวต่อ request: `memberOf` จาก `AiRoomMember` · `tenantAll = role === "OWNER"` (R-K1)
- `startRoom(ctx, input: { instruction: string; context?: { chatConversationId?; contactId? }; source?: "user" | "scheduled" }) → Promise<{ ok: true; roomId; conversationId; jobId } | { ok: false; error: "quota_exhausted" | "ai_disabled"; scope?: "jobs" }>` — ใน tx เดียว: `AiConversation` (id จาก `newConversationId` :63) + `AiRoom` (`startedById` = ผู้สั่ง) + `AiMessage` USER (`authorUserId`) + `AiRoomJob` + นับงาน `AiJobCounter` (conditional `INSERT … ON CONFLICT DO UPDATE SET jobs = jobs + 1 WHERE jobs < limit RETURNING`) · โควตาหมด = ไม่สร้างอะไร · event `ai.room.started`
- `roomStatus(room: { closedAt; pendingProposals: number; pendingPlans: number; activeJobs: number }) → "OPEN" | "RUNNING" | "WAITING" | "DONE"` — pure · ลำดับ: closedAt ⇒ DONE · มี PENDING ⇒ WAITING · มี job QUEUED/RUNNING ⇒ RUNNING · อื่น ๆ ⇒ OPEN
- `listRooms(ctx, opts: { scope: "mine" | "tenant"; status?; q?; before?: Date; take?: number }) → Promise<{ items: RoomCardDto[]; nextBefore: string | null }>` — `tenant` = OWNER เท่านั้น (อื่น = ว่าง/404) · ป้าย "สั่งโดย" จาก `conversationCreatorOf` (:161) · "ร่วมกับ" จาก `AiRoomMember`
- `closeRoom(ctx, roomId: string) → Promise<boolean>` · `renameRoom(ctx, roomId, title) → Promise<boolean>` — ผู้สร้างหรือ OWNER
- เปลี่ยนที่ conversation-owner.ts: `ConvSight` + `sightOf`/`sightOfConfirmer` รับ `memberOf`/`tenantAll` · `visibleConversationWhere` เพิ่ม `OR id IN memberOf` และ (tenantAll) `OR id IN (AiRoom.conversationId ของกิจการ)` · ห้อง `u~` เดิมของคนอื่นยังมองไม่เห็น

### 5.5 worker.ts (แผน · S1.5) — คิวเบื้องหลัง (R-K8)
- `enqueueRoomJob(ctx, input: { roomId; messageId; authorUserId }) → Promise<{ jobId }>` — `messageId @unique` กันซ้ำ
- `runRoomJobs(opts: { now: Date; limit?: number; jobId?: string; deps?: { provider? } }) → Promise<{ ran: number; failed: number; released: number }>` — claim ด้วย `updateMany({status in [QUEUED, RUNNING], leaseUntil < now}) → RUNNING + leaseUntil = now + 2 นาที + attempts = attempts + 1` (X5 · สองรอบซ้อนทำครั้งเดียว) · attempts > 3 ⇒ FAILED · รัน `sendMessage` (service.ts:97) ด้วย actor ของ **ผู้เขียนข้อความ** (`aiMemberActor` จาก Membership สด) · จบแล้ว push ถ้าสถานะเป็น WAITING/DONE
- เรียกจาก: `POST /api/mobile/secretary/rooms/[id]/send` (ทำทันทีใน `after()` ของ request เดียวกัน) + เก็บตกใน `api/cron/hourly` และ `api/cron/outbox` (S1.5 จดความถี่จริงของ outbox ใน wo-notes) · ไม่มี cron รายนาที · SSE เดิม `sendMobileChat` (mobile/chat.ts:15) คงไว้

### 5.6 members.ts (แผน · S1.6) — ห้องร่วม (R5)
- `addMember(ctx, roomId: string, input: { userId: string; seeHistory: boolean }) → Promise<{ ok: true } | { ok: false; reason }>` — ผู้เพิ่ม = ผู้เปิดห้องหรือ OWNER · ผู้ถูกเพิ่มต้องมี `Membership.acceptedAt ≠ null` ในกิจการเดียวกัน · ข้อความระบบ "X เพิ่ม Y เข้าห้อง" · event `ai.room.member_added`
- `removeMember(ctx, roomId: string, userId: string) → Promise<boolean>` — ผู้เปิดห้อง/OWNER/ตัวเอง
- `listMessages` (service.ts:78) กรอง `createdAt ≥ addedAt` เมื่อ `seeHistory = false` (บังคับในบริการ ไม่ใช่ UI · COMMON §C.8)

### 5.7 kind-class.ts (แผน · S1.7 · pure) — ชั้นความเสี่ยง (R-K3)
- `classOfKind(kind: string) → { destructive: boolean; money: boolean; customerFacing: boolean; piiExport: boolean }` — derive จาก `DESTRUCTIVE_KINDS` (proposals.ts:128) + `kindAccessOf(kind).module` (:475): `account.*`/pos refund/`booking.refund_deposit` = money · `chat.send`/crm email/member campaign = customerFacing · ไม่รู้จัก = money + customerFacing (fail-closed)
- `ALWAYS_APPROVE` (ค่าคงที่ · ปิดไม่ได้): เงินออก · DESTRUCTIVE · ส่งออก PII · `whyApprove(kind: string, rules: AiApprovalRuleDto[]) → string[]` — เหตุผลไทยบนการ์ด A4
- ในห้องเลขา: `remember_fact`/`forget_fact`/`kb_auto_save` เป็นข้อเสนอ (`AiMemory.status = "PENDING"`) · `support_open_case` ยังเขียนทันที (ส่ง `aiActorUserId(actor)` แทน sentinel `"ai-assistant"`)
- kind ใหม่: `chat.send` (R-K15 · S1.12) → `sendReply({senderUserId: approverUserId, senderName: "Shark (ผู้ช่วย AI)", meta: {ai: {roomId, proposalId, approvedBy}}, body, clientMessageId: proposalId})` เฉพาะผู้ติดต่อที่ `ChatContact.customerId` ผูกแล้ว · `booking.refund_deposit` (R-K16) → `bookingSvc.refundDeposit`

### 5.8 approval-gate.ts (แผน · S1.7) — ผู้อนุมัติ (R-K4)
- `approvalGate(m: MembershipCtx, ctx: { tenantId }, proposal: { id; kind; conversationId; payload }, approverUserId: string) → Promise<{ ok: true } | { ok: false; reason: string }>` — เรียกใน `executeProposal` หลังด่านเห็นห้อง (proposals.ts:400) · ใช้เฉพาะข้อเสนอที่ห้องมี `AiRoom` · role ≥ MANAGER + `membershipCan` (tool-access.ts:167) · กฎ `money.limit` เทียบ `limitSatang` · ผู้อนุมัติยังต้องผ่าน `assertCan` เดิม (:427) ด้วยสิทธิ์ตัวเอง · ห้องเดิม = ผ่านทันที (`qc-ai-proposals` คงเขียว)

### 5.9 actions.ts (แผน · S1.8) — บันทึก + ย้อน 24 ชม. (มติ 6)
- `logAction(tx, input: { tenantId; roomId?; userId; approverId?; kind; summary; payload; proposalId?; entity?: { type; id }; now: Date }) → Promise<{ id }>` — hook ใน `executeProposal`/`runKind` · `undoableUntil = now + 24 ชม.` เฉพาะ kind ใน `UNDOABLE_KINDS` (ย้ายดีล CRM · การ์ดบอร์ดงาน · ร่างเอกสารบัญชีที่ยังไม่ส่ง · นัด/คิวที่ยังไม่ถึง) · event `ai.action.executed`
- `undoAction(ctx, actionId: string, opts: { now: Date }) → Promise<{ ok: true; note } | { ok: false; reason }>` — claim `updateMany({id, undoneAt: null, undoableUntil > now}) → undoneAt` · ผู้สั่งเดิม/ผู้อนุมัติ/OWNER · ข้อความที่ส่งลูกค้าแล้ว/เงินที่โอนแล้ว = ไม่อยู่ใน registry · event `ai.action.undone`
- `listLog(ctx, opts: { day?: string; module?: string; roomId?: string; before?: Date }) → Promise<{ items: ActionLogDto[]; nextBefore }>` — STAFF เห็นของตัวเอง · OWNER/MANAGER ทั้งกิจการ

### 5.10 teach.ts (แผน · S1.10) — ตีกลับ + สอน + แก้ก่อนอนุมัติ
- `rejectWithNote(ctx, proposalId: string, input: { note: string; remember: "JOB" | "RULE" }) → Promise<{ ok: true; memoryId?: string } | { ok: false; reason }>` — `updateMany PENDING → REJECTED` + ข้อความ USER ใหม่ในห้อง (ให้เลขาแก้) · RULE ⇒ `AiMemory(status = "PENDING")` รอ OWNER ยืนยัน · `recordOutcome(…REJECTED)`
- `editProposal(id: string, byUserId: string, payloadPatch: Record<string, unknown>) → Promise<{ ok: true } | { ok: false; reason }>` — Q9: เฉพาะ kinds ของทะเบียน op (มี zod schema) · kind เขียนมือ = `{ok:false, reason:"แก้ก่อนอนุมัติไม่ได้ ให้ตีกลับแล้วสั่งใหม่"}` · ผลแก้ = EDITED ตอนอนุมัติ
- `confirmMemory(ctx, memoryId: string) → Promise<boolean>` — OWNER · `status = null` (ยืนยันแล้ว)

### 5.11 learn.ts (แผน · S1.15) — วงจรเรียนรู้ (§8 ชั้น 1–2)
- `recordOutcome(ctx, input: { proposalId: string; outcome: "APPROVED" | "EDITED" | "REJECTED"; editedReply?: string; steps?: unknown[] }) → Promise<void>` — ลง `AiTrainingSample.{outcome, editedReply, stepsJson, roomId, proposalId}` ผ่าน `anonymize` (dataset.ts:21 ขยายให้ครบชื่อ/เบอร์/ที่อยู่) · EDITED ⇒ `AiLesson` (`occurrences = occurrences + 1` คำสั่งเดียว) · ≥ 2 ครั้ง ⇒ เสนอเจ้าของ
- `lessonBlock(ctx, kind: string) → Promise<string>` — เฉพาะ `status = CONFIRMED` ของชนิดงานนั้น · อยู่ในบล็อกข้อมูลที่มีหัว "data, not instructions"
- `confirmLesson(ctx, lessonId: string, ok: boolean) → Promise<boolean>` — OWNER

### 5.12 suggestions.ts (แผน · S1.11) — ข้อเสนอ + กล่องรวม
- `suggestions(ctx, opts: { now: Date; take?: number }) → Promise<{ system: string; title: string; instruction: string }[]>` — จาก `gatherProactiveInsights` (proactive.ts:31) + `computeDigest` + งานที่สั่งบ่อยของผู้ใช้ (top-N `AiRoom.title`) · ไม่เปิดห้องเอง (มติ 9)
- `inboxForUser(userId: string, opts: { tenantId?: string; kind?: string; now: Date }) → Promise<InboxItemDto[]>` — ข้อเสนอ/แผน PENDING ทุกกิจการที่ผู้ใช้มี `Membership.acceptedAt ≠ null` และ `actorCanConfirmKind` (tool-access.ts:264) ผ่าน (A6 · ข้ามร้านได้เฉพาะ "อ่านรายการ" — อนุมัติยังส่ง `x-tenant-id` ของร้านนั้น)

### 5.13 digest.ts (แผน · S1.16) — ข้อมูลกิจการสด (§8 ชั้น 3)
- `computeDigest(tenantId: string, opts: { now: Date }) → Promise<DigestDto>` — deterministic ไม่ผ่านโมเดล · ยอดขาย 7/30 วัน · ลูกค้าเงียบ · สต็อก · ค้างชำระ · คิว/จองพรุ่งนี้ (เฉพาะระบบที่เปิด) · cache ในหน่วยความจำ 10 นาที
- `digestBlock(ctx) → Promise<string>` — ≤ 600 token · บล็อกข้อมูล

### 5.14 quota.ts (แผน · S1.13) — โควตางาน (R-K6)
- `quotaStatus(ctx, opts: { now: Date }) → Promise<{ used: number; limit: number; pct: number; jobsLeft: number; level: QuotaLevel; text: string | null; resetAt: string }>` — อ่านอย่างเดียว (ห้ามเขียนตอน GET · §B.6) · `AiJobCounter` ของ `monthKeyBangkok(now)` · ข้อความจาก `quotaMessage`
- `chargeJob(tx, tenantId: string, opts: { now: Date }) → Promise<boolean>` — ตัวนับคำสั่งเดียวที่ `startRoom` เรียก (false = หมด)

### 5.15 `src/lib/ai/credit.ts` (เปลี่ยน · S1.13 · R-K7)
- `canRunAi(tenantId: string, opts: { scope: "job" | "assist" }) → Promise<{ ok: boolean; reason?: string }>` — `(FREE_PACK.enabled && scope === "assist") || (scope === "job" && jobsLeft > 0) || balance > 0` · `sendMessage` (service.ts:127) ใช้แทน `canSpend` (ห้องเลขา = "job" ที่ `startRoom` นับแล้ว · ห้องเดิม = "assist")
- `canSpend` (credit.ts:74) คงชื่อสำหรับผู้เรียก 22 จุด แต่ภายใน = `canRunAi(…, {scope: "assist"})` · ยังเขียน `AiCreditTxn` เป็นบันทึกต้นทุน (ติดลบได้ตาม `chargeUsage` เดิม)
- `ensureWallet` (:34) ไม่สร้างแถว GRANT เมื่อ `tenant.createdAt >= SECRETARY_LAUNCH_AT` · `GET /api/mobile/usage` เปลี่ยนเป็น `canSpendPeek` (:85 · อ่านอย่างเดียว)

### 5.16 `src/lib/ai/provider.ts` (เปลี่ยน · S1.20 · R-K18)
- `class AnthropicProvider(key: string, model: string) implements AiProvider` — `chat(messages, opts?: { maxTokens?; tools? }) → Promise<AiReply>` · Messages API · `system` แยก · tools → `input_schema` · `cache_control` บน system/tools · `usage.{input,output,cache_read_input,cache_creation_input}_tokens` รวมเข้า `tokensIn/tokensOut` เดิม
- `MODEL_IDS = { fast: { openrouter; anthropic }, smart: { … } }` · `pickModel(text, hasImages) → "fast" | "smart"` (คืน tier) · `resolveProvider(tier) → AiProvider | null` อ่าน env `AI_PROVIDER=anthropic|openrouter` (ปริยาย openrouter) + `SHARK_ANTHROPIC_KEY` · `pricing.priceOf` รู้จัก id ตรง · `SHARK_AI_MOCK=1` ⇒ Mock (ทุก oracle) · `qc-ai-brain` ห้ามเปลี่ยน

### 5.17 `src/lib/ai/scheduled.ts` (เปลี่ยน · S1.9 · R-K5)
- `createTask(ctx, input: { instruction; hourBkk; frequency?: "DAILY" | "WEEKLY"; days?: number[]; channels?: string[] }) → Promise<{ id }>` — งานใหม่จากห้องเลขาบันทึก `ownerUserId` (จาก `dispatch(ai_schedule_task)` ที่มี `userId` อยู่แล้ว) · เพดาน `FREE_PACK.scheduledMax`
- `runScheduledTasks(now: Date, deps?: { provider? }) → Promise<number>` — claim `updateMany({id, lastRunDay: {not: today}}) → {lastRunDay: today}` (X5) · แถวมี `ownerUserId` → โหลด `Membership` สด (`acceptedAt ≠ null` ไม่งั้นข้าม + จด) → `aiMemberActor` → `startRoom({source: "scheduled"})` (นับงาน · หมด = ข้าม + จด) → `sendPushToUser(owner)` · แถว null = ทางเดิมทุกตัวอักษร

### 5.18 `src/lib/ai/conversation-owner.ts` (เปลี่ยน · S1.4 · R-K1)
- `type ConvSight = { own: string | null; ownerExtras: boolean; tenantAll: boolean; memberOf: ReadonlySet<string> }` · `sightOf(ctx, extra?: { memberOf?; tenantAll? }) → ConvSight` · `sightOfConfirmer(m, userId, extra?) → ConvSight` · `canSeeConversationId(s, id) → boolean` (+ memberOf + tenantAll ของห้องที่มี AiRoom ตามชุดที่ผู้เรียกส่ง) · ไฟล์ยังเบา (ไม่มี db)

### 5.19 phone-auth.ts (แผน · `src/lib/core` · S1.19 · R-K9/K10) — ไม่ import env กลาง (แบบ `sms.ts`)
- `requestPhoneOtp(phone: string, ip: string | null, opts?: { now?: Date }) → Promise<{ ok: true; resendAfterSec: number } | { ok: false; reason: string }>` — `toE164Thai` · 6 หลัก · หมดอายุ 10 นาที · ผิดได้ 5 ครั้ง · ขอซ้ำทุก 60 วิ · rate-limit ต่อเบอร์ + ต่อ IP (`checkRateLimitDb` rate-limit-db.ts:38) · เก็บ `codeHash` เท่านั้น · `SMS_PROVIDER=mock` เขียนรหัสลง `logOps` (QC)
- `verifyPhoneOtp(phone: string, code: string, opts?: { now?: Date }) → Promise<{ ok: true; userId: string | null } | { ok: false; reason: string }>` — `consumedAt` claim คำสั่งเดียว · `userId = null` = เบอร์ใหม่ (แอปไปจอสมัคร)
- `registerWithPhone(input: { phone; name; email; otpTicket }) → Promise<{ ok: true; userId } | { ok: false; reason }>` — `prisma.user.create({email, name})` + `UserPhone` ใน tx เดียว · อีเมลซ้ำแต่เบอร์ใหม่ ⇒ "อีเมลนี้มีบัญชีแล้ว เข้าด้วยอีเมลแล้วผูกเบอร์" (R8)
- `bindPhone(userId: string, phone: string, code: string) → Promise<{ ok: boolean; reason? }>` — บัญชีเดิมผูกเบอร์ · `GET /api/mobile/me` เพิ่ม `phone` (nullable)

### 5.20 `src/lib/support/service.ts` (เปลี่ยน · ฝั่งร้าน · S1.17 · R-K12)
- `openCaseFromApp(ctx: { tenantId }, input: { userId; subject; body; category: "broken" | "ai_mistake" | "data" | "billing" | "feedback"; roomId?: string; attachments?: Attachment[] }) → Promise<{ id; caseNo }>` — `source = "APP"` · `roomId` ต้องเป็นห้องที่ผู้แจ้งเห็น · หมวด `ai_mistake` ⇒ คิว ai-quality
- `listCasesForUser(ctx: { tenantId }, userId: string, role: Role) → Promise<CaseRowDto[]>` — `openedByUserId = userId OR role === "OWNER"` (เคส `ai-assistant` เดิม → OWNER เห็น) · `listMyCases` (:123) เดิมคงไว้ให้เว็บ

### 5.21 `src/lib/platform/support.ts` (เปลี่ยน · ฝั่งแพลตฟอร์ม · S1.17)
- `listAllCases(filter?: { status?; source?; category?; assignee?: string }) → Promise<CaseWithTenant[]>` (:19)
- `assignCase(caseId: string, platformUserId: string) → Promise<boolean>` — "รับเรื่อง" H4 · ตั้ง `assigneePlatformUserId`
- `addPlatformMessage` (:71) แทรกลงห้อง AI เฉพาะเคส `source !== "APP"` (bridge เดิม · `qc-help-v2`/`qc-mobile-help` เขียว) · push ผู้แจ้งจริง `sendPushToUser(openedByUserId)` (push.ts:145)
- "ระงับเลขาของร้าน" = `setAccess` ทุกโมดูล OFF (ไม่มีธงใหม่ · ไม่ใช้ `suspendTenant` :140)

### 5.22 `src/lib/mobile/tenants.ts` (เปลี่ยน · S1.25)
- `createTenantFromApp(userId: string, input: { name: string; type: string; systems: string[] }) → Promise<{ tenantId; roomId }>` — ห่อ `createTenantForUser` (:8) + เปิดระบบที่เลือก (`applyBlueprint` ทางเดิม) + `startRoom` ห้องแรก "ตั้งค่าเริ่มต้น" (ไม่นับงาน: `couldNotAct`/งานต้อนรับ)

### 5.23 invite.ts (แผน · `src/lib/mobile` · S1.25 · R-K11 + Q10)
- `createInvite(ctx, input: { name; phone; role: "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, boolean> }) → Promise<{ ok: true; inviteId } | { ok: false; reason }>` — OWNER/MANAGER (`settings.staff.write` staff/service.ts:60) · ตรวจด้วย `validatePermissionInput` (:155) · `canAssignRole`/`canGrantUnitAccess`/`canGrantPermission` (rbac.ts:94–112) · รหัสสุ่ม → `codeHash` · หมดอายุ 7 วัน · `sendSms` ลิงก์ `https://shark.in.th/i/<code>`
- `acceptInvite(userId: string, phone: string, opts: { now: Date }) → Promise<{ accepted: string[] }>` — หลัง `verifyPhoneOtp` · หา `StaffInvite` เบอร์ตรง + ยังไม่หมดอายุ + ยังไม่รับ → สร้าง `Membership(acceptedAt = now)` ผ่านตัวตรวจชุดเดียวกับ `updateStaffAccess` ใน tx เดียว · claim `updateMany({acceptedAt: null})` · ไม่ต้องมี HrEmployee · event `staff.invite.accepted`
- `revokeInvite(ctx, inviteId: string) → Promise<boolean>`
- `moduleLevel(permissions: Record<string, unknown>, module: string) → "OFF" | "VIEW" | "USE"` — pure · OFF = ไม่มีคีย์ของโมดูล · VIEW = มีเฉพาะคีย์ลงท้าย `.read`/`.view` · USE = `<module>.*` หรือมีคีย์เขียน ≥ 1
- `setModuleLevel(permissions: Record<string, unknown>, module: string, level: "OFF" | "VIEW" | "USE") → Record<string, boolean>` — pure · ทางกลับของ `moduleLevel` · แชท 3 ระดับ = ไม่เห็น / ดูได้ (`chat.conversation.read`) / ตอบได้ (+ `chat.message.send`)

### 5.24 routing.ts (แผน · `src/lib/modules/chat` · S1.24 · R-K14)
- `eligibleResponders(tenantId: string, unitId: string | null) → Promise<string[]>` — `listStaffAccess` ∩ `evaluate(m, {module: "chat", action: "chat.message.send"})` ∩ `canAccessConvUnit` (chat/service.ts:1994)
- `assignIncoming(conv: { tenantId; systemId; conversationId; channel; unitId; contactId }, opts: { now: Date }) → Promise<{ assigneeUserId: string | null; reason: string }>` — เรียกจาก `receiveInbound` (:786) / `receiveExternalInbound` (:1118) · กฎ ROUND_ROBIN (คนเข้าเวร `ChatShift`) / LAST_ASSIGNEE / OWNER · ไม่มีคนตอบได้ ⇒ เจ้าของ · นอกเวลาทำการ ⇒ ไม่มอบหมาย + ป้าย Shark · ใช้ `assign` (:2136) ด้วย `opts.requireReplyPermission = true` · event `chat.conversation.auto_assigned`
- `callHelper(ctx, input: { conversationId; userId; note? }) → Promise<{ ok: boolean; reason? }>` — `ChatConversationHelper` + บันทึกภายใน `isInternal` + แจ้งเตือน · ผู้ถูกเรียกต้อง `eligibleResponders`
- `handoff(ctx, input: { conversationId; toUserId; reason: string }) → Promise<{ ok: boolean; reason? }>` — เปลี่ยนผู้ดูแล + บันทึกภายในพร้อมเหตุผล (ไม่แตะ enum `ChatEventType`)
- `setShift(ctx, onDuty: boolean, opts: { now: Date }) → Promise<{ onDutyAt: string | null }>` · ยกระดับ SLA = คำนวณตอนอ่าน (`waitingMin` จาก `firstCustomerMessageAt`) + sweep ใน `api/cron/outbox` (R-K8)

### 5.25 `src/lib/core/push.ts` (เปลี่ยน hunk เดียว · S1.23 · R-K20)
- `type PushMsg = { title; body; data?; badge?: number }` · payload Expo ส่ง `badge` ต่อ · `data.link` ("/secretary/room/<id>" · "/inbox/<convId>" · "/help/<caseId>") + คง `data.conversationId` ให้ build เก่า · push ห้องเลขา = `sendPushToUser(userId)` ไม่กรอง tenant (A6) · เคารพ `AiNotifyPref`

---

## 6. สถานะห้อง (state machine)

```
            startRoom (นับงาน)                      ข้อเสนอ/แผน PENDING เกิด
  (ไม่มี) ─────────────────▶ RUNNING ──────────────────────────────▶ WAITING
                             ▲   │ job จบ ไม่มี PENDING                 │ อนุมัติ/ตีกลับ/หมดอายุ ครบทุกใบ
     ข้อความใหม่ในห้อง        │   ▼                                    ▼
     (ไม่นับงาน) ──────────── OPEN ◀────────────────────────────── (คำนวณใหม่)
                             │ closeRoom (ผู้สร้าง/OWNER) · ห้องงานประจำจบรอบ
                             ▼
                            DONE ── ข้อความใหม่ = เปิดต่อ (closedAt = null · ไม่นับงาน)
```
สถานะไม่ถูกเก็บเป็นคอลัมน์ — `roomStatus` คำนวณจาก `closedAt` + ข้อเสนอ/แผน PENDING + `AiRoomJob` QUEUED/RUNNING (ลำดับ DONE > WAITING > RUNNING > OPEN)

| เหตุการณ์ | จาก → ไป | ใครทำได้ | event | push |
|---|---|---|---|---|
| เปิดห้อง (`startRoom`) | – → RUNNING | ผู้มีสิทธิ์ `ai.chat.send` (โควตาเหลือ) · งานประจำ (ผู้ตั้ง) | `ai.room.started` | – |
| ส่งข้อความในห้อง (`/send`) | OPEN/DONE → RUNNING | ผู้สร้าง · สมาชิกห้อง · OWNER (ด้วยสิทธิ์ตัวเอง) | – | – |
| เลขาเสนองาน | RUNNING → WAITING | ระบบ (worker) | `ai.room.status_changed` | ผู้สร้าง + ผู้อนุมัติที่ผ่าน `approvalGate` |
| job จบ ไม่มีข้อเสนอ | RUNNING → OPEN | ระบบ | `ai.room.status_changed` | ผู้สร้าง ("เสร็จแล้ว") |
| อนุมัติ/ตีกลับครบ | WAITING → OPEN/RUNNING | OWNER/MANAGER (ห้องเลขา · R-K4) | `ai.action.executed` | ผู้สร้าง |
| ข้อเสนอหมดอายุ 24 ชม. | WAITING → OPEN | ระบบ (`EXPIRED`) | – | – |
| ปิดห้อง (`closeRoom`) | * → DONE | ผู้สร้าง · OWNER | `ai.room.status_changed` | – |
| job ล้ม 3 ครั้ง | RUNNING → OPEN (+ข้อความ "ทำไม่สำเร็จ") | ระบบ | `ai.room.status_changed` | ผู้สร้าง |
| ผู้สั่งถูกถอนสิทธิ์ | job ค้าง → FAILED | ระบบ (โหลด Membership สดทุกรอบ) | – | – |

---

## 7. สิทธิ์ (ใคร × ทำอะไร)

หลัก: **สิทธิ์ = คนที่พิมพ์ข้อความนั้น ∩ ระดับต่อระบบของกิจการ (`AiSystemAccess`)** · บังคับตอน execute (proposals.ts / dispatch ของ tools.ts) ไม่ใช่แค่รายการเครื่องมือที่ยื่น · เลขาไม่มีสิทธิ์ของตัวเอง (= ผู้สั่ง) · คีย์แชท = `chat.conversation.read` (อ่าน · guard.ts:21) + **`chat.message.send`** (ตอบ · permissions.ts:96) — R-K14

| การกระทำ | เจ้าของ (OWNER) | ผู้จัดการ (MANAGER) | พนักงาน (STAFF) | เลขา (= ผู้สั่ง) | ระบบ |
|---|---|---|---|---|---|
| เปิดห้องงาน | ✅ | ✅ | ✅ ถ้ามี `ai.chat.send` | – | งานประจำ ด้วยสิทธิ์ผู้ตั้ง |
| เห็นห้อง | ทุกห้องที่มี `AiRoom` ในกิจการ + ของตัวเอง | ของตัวเอง + ที่ถูกเพิ่ม | ของตัวเอง + ที่ถูกเพิ่ม | – | – |
| เพิ่ม/เอาคนออกจากห้อง | ✅ ทุกห้อง | ห้องที่ตัวเองเปิด | ห้องที่ตัวเองเปิด | ❌ | – |
| อ่านข้อมูลระบบ (เครื่องมืออ่าน) | ตามระดับ ≥ READ | ตามสิทธิ์ ∩ ระดับ | ตามสิทธิ์ ∩ ระดับ | ไม่เกินผู้สั่ง | – |
| ร่างข้อเสนอเขียน | ระดับ DRAFT | ระดับ DRAFT + สิทธิ์ | ระดับ DRAFT + สิทธิ์ | ✅ (เป็นข้อเสนอเสมอ) | – |
| อนุมัติข้อเสนอในห้องเลขา | ✅ + `assertCan` ตัวเอง | ✅ + `assertCan` ตัวเอง | ❌ (R-K4) | ❌ | ❌ |
| อนุมัติข้อเสนอในห้อง AI เดิม | พฤติกรรมเดิม | พฤติกรรมเดิม | พฤติกรรมเดิม (มีคีย์ = กดได้) | ❌ | ❌ |
| ย้อนการกระทำ (≤ 24 ชม.) | ✅ | ของตัวเอง/ที่ตัวเองอนุมัติ | ของตัวเอง | ❌ | – |
| ตั้งระดับต่อระบบ (B3) · กฎอนุมัติ (B4) | ✅ (AUTO ปฏิเสธ) | ❌ | ❌ | ❌ (ผลโมเดลเป็นข้อมูล) | ❌ |
| ยืนยันความรู้/บทเรียน (B6) | ✅ | ❌ | ❌ | เสนอได้อย่างเดียว | – |
| อ่านแชทลูกค้า (K1 K2) | ✅ | ✅ | ต้องมี `chat.conversation.read` + หน่วย | ตามผู้สั่ง (ยามสั่งสรุปแชท = ปฏิเสธ) | – |
| ตอบลูกค้า · ถูกมอบหมาย · เรียกช่วย | ✅ | ✅ | ต้องมี `chat.message.send` + หน่วย | ข้อเสนอ `chat.send` เท่านั้น | `assignIncoming` เลือกเฉพาะ `eligibleResponders` |
| กฎรับเรื่อง / เวร (K5) | ✅ ตั้งกฎ | ✅ ตั้งกฎ | เข้า/ออกเวรของตัวเอง | ❌ | ยกระดับ SLA |
| เชิญพนักงาน · สิทธิ์ต่อคน (G2 G3) | ✅ | ✅ ภายใต้ `canAssignRole`/`canGrantPermission` | ❌ | ❌ | – |
| เรื่องแจ้งช่วยเหลือ (H1 H2) | เห็นทุกเรื่องของกิจการ | เฉพาะที่ตัวเองแจ้ง | เฉพาะที่ตัวเองแจ้ง | `support_open_case` ในนามผู้สั่ง | push เมื่อทีมตอบ |
| ลบบัญชีของฉัน (G4) | ✅ (ต้องส่งมอบร้านก่อนตาม `deleteAccount`) | ✅ | ✅ | ❌ | คิวลบ 30 วัน |

---

## 8. โควตา (มติ 7 · Q3 · R-K6 · R-K7)

- **นิยาม 1 งาน (Q3)**: 1 ห้องที่เปิด — สั่งเองผ่าน `startRoom` หรือ งานประจำ 1 รอบ (`countsAsJob`: room_new = 1 · scheduled_run = 1 · room_message = 0 · ทำอะไรไม่ได้เลย = 0) · **จุดนับงานอยู่ที่ `startRoom` เท่านั้น** ไม่ใช่ `sendMessage` (สั่งเพิ่มในห้องเดิมไม่นับ) · ร่างตอบแชทลูกค้า (`ChatAiSuggestion`) ไม่นับงาน แต่คิดต้นทุน
- **แพ็กฟรี**: `FREE_PACK.jobsPerMonth = 100` ต่อกิจการต่อเดือนไทย (`AiJobCounter(tenantId, month)` · รีเซ็ต 00:00 วันที่ 1 ตาม `nextResetBangkok`) · งานประจำ ≤ `scheduledMax` 10 · ผู้อนุมัติ ≤ `approversMax` 5
- **scope ที่สาม `"jobs"`**: `SendResult` (service.ts:43) เพิ่ม `scope: "jobs"` คู่กับ "credit"/"day" เดิม · `quotaMessage` ของ `usage.ts` รู้จัก "jobs" ("โควตางานเดือนนี้หมด…") · `startRoom` คืน `{ok:false, error:"quota_exhausted", scope:"jobs"}`
- **ลำดับเงิน (Q4 · `canRunAi`)**: `canRunAi(tenantId, {scope: "job" | "assist"})` = `(FREE_PACK.enabled && scope === "assist") || (scope === "job" && jobsLeft > 0) || balance > 0` — ห้องเลขาเรียก "job" (นับที่ `startRoom` แล้ว) · ห้อง AI เดิม + ผู้เรียก 20 จุดของ `canSpend` = "assist" · กระเป๋า $10 ของร้านเดิมยังใช้ได้เมื่อโควตาหมด · ร้านที่สร้างหลัง `SECRETARY_LAUNCH_AT` ไม่ได้ GRANT
- **ตาข่ายชั้นนอก**: เพดานรายวัน `AiUsage` × `dailyLimits()` (provider.ts:220) คงเดิม · degrade เมื่อกระเป๋า < $0.50 คงเดิม · ทุกการเรียกโมเดลยังเขียน `AiCreditTxn` (ต้นทุนจริง · ทีม SHARK เห็นใน G5)
- **ผู้ใช้เห็น**: % · "≈ N งานที่เหลือ" · วันรีเซ็ต — ไม่เห็น token/บาท/ดอลลาร์ · 80% และ 95% = แถบเตือน (`warn80`/`warn95`) · 100% = เปิดห้องใหม่/งานประจำหยุด · ห้องค้างยังพิมพ์ต่อ/อนุมัติได้
- **endpoint**: `GET /api/mobile/secretary/quota` อ่านอย่างเดียว (§B.6) · `GET /api/mobile/usage` เดิมเปลี่ยนเป็น `canSpendPeek`

---

## 9. Event ใหม่ + ทะเบียน 3 ที่

กติกา (COMMON §C.10): ทุก event ใหม่ = consumer ใน `src/lib/outbox-consumers.ts` + ป้ายเดียวใน `src/lib/automation/labels.ts` + `src/lib/webhooks/labels.ts` + ข้อสอบ replay สองรอบ · emit ใน tx ที่เปลี่ยนสถานะ · payload = ids เท่านั้น (ไม่มีข้อความ/ชื่อ/เบอร์)

| event | payload | emit ที่ | consumer | ป้ายไทย | ใบ |
|---|---|---|---|---|---|
| `ai.room.started` | `{tenantId, roomId, startedById}` | `startRoom` | withAutomation เปล่า | เมื่อเลขาเริ่มงานใหม่ | S1.4 |
| `ai.room.status_changed` | `{tenantId, roomId, from, to}` | worker / `closeRoom` | push ผู้สร้าง/ผู้อนุมัติ (`sendPushToUser`) | เมื่อสถานะงานของเลขาเปลี่ยน | S1.5 |
| `ai.room.member_added` | `{tenantId, roomId, userId, addedById}` | `addMember` | push ผู้ถูกเพิ่ม | เมื่อมีคนถูกเพิ่มเข้าห้องงาน | S1.6 |
| `ai.action.executed` | `{tenantId, actionLogId, kind, roomId?}` | `logAction` (ใน tx ของ execute) | withAutomation | เมื่อเลขาทำงานที่อนุมัติแล้ว | S1.8 |
| `ai.action.undone` | `{tenantId, actionLogId}` | `undoAction` | withAutomation | เมื่อย้อนการกระทำของเลขา | S1.8 |
| `staff.invite.accepted` | `{tenantId, inviteId, membershipId}` | `acceptInvite` | push ผู้เชิญ | เมื่อพนักงานรับคำเชิญ | S1.25 |
| `chat.conversation.auto_assigned` | `{tenantId, systemId, conversationId, assigneeUserId}` | `assignIncoming` | push ผู้ดูแล (`sendPushToChatStaff`) | เมื่อระบบมอบหมายแชทอัตโนมัติ | S1.24 |

ไม่มี event ใหม่ของ support (ใช้ push ตรงใน `addPlatformMessage` เดิม) · ไม่มี event ที่ใบ S0.3/S0.4 emit

---

## 10. PDPA · ความปลอดภัย

| กลุ่ม X | ใช้กับ | กติกาในสัญญานี้ |
|---|---|---|
| X1 ขอบเขต | ทุก route/บริการ | ห้อง/เคส/แชท/คำเชิญของกิจการอื่น หรือที่มองไม่เห็น = 404 · สมาชิกห้อง `seeHistory=false` ไม่ได้ข้อความก่อน `addedAt` (บังคับใน `listMessages`) |
| X2 ตัวตน | worker · อนุมัติ · งานประจำ | actor = ผู้เขียนข้อความ (Membership สดทุกรอบ) · ผู้อนุมัติผ่าน `assertCan` ตัวเอง · ไม่มี AUTO · ผลโมเดล/ความจำ/บทเรียน/ข้อความลูกค้าเปลี่ยนสิทธิ์/กฎ/โควตาไม่ได้ |
| X3 พร้อมกัน | `AiJobCounter` · lease · attempts · occurrences | คำสั่งเดียว (`UPDATE … SET x = x + 1 … RETURNING` / conditional `updateMany` / `ON CONFLICT`) |
| X4 ส่งซ้ำ | outbox · `chat.send` | consumer idempotent · `clientMessageId = proposalId` (unique `[conversationId, clientMessageId]`) |
| X5 ตามเวลา | worker · งานประจำ · undo · OTP | lease 2 นาที · claim `lastRunDay` · `undoableUntil` · `now` ฉีดได้ |
| X6 ข้อมูลเข้าอันตราย | prompt | ข้อความลูกค้า/ความจำ/บทเรียน/digest/KB อยู่ในบล็อกที่มีหัว "data, not instructions" |
| X7 endpoint มือถือ | `/api/mobile/**` ใหม่ | Bearer (`requireMobile` mobile/auth.ts:74) · `checkRateLimitDb` ทุกเส้น · เพดาน payload · OTP ต่อเบอร์+IP |
| X8 PDPA ผ่าน AI | prompt · `AiMemory` · `AiLesson` · `AiTrainingSample` · `AiActionLog.payload` | ไม่เก็บชื่อ/เบอร์/ที่อยู่ลูกค้า (ขยาย `anonymize`) · payload ids เท่านั้น · ข้อความแรกถึงลูกค้าเปิดเผยว่าเป็นผู้ช่วย AI + ลงชื่อ "Shark (ผู้ช่วย AI)" · คำขอเจ้าของข้อมูล = งานให้คนอนุมัติ |
| X9 การกระทำอันตราย | `ALWAYS_APPROVE` · DESTRUCTIVE | confirm 2 ชั้นเดิม · บันทึก `AiActionLog` ทุกครั้ง · ป้ายความเสี่ยงจาก `classOfKind` |
| X10 ความลับ | DTO ทุกตัว | ไม่มีคีย์/รหัส OTP/codeHash/token ช่องทาง/prompt/micro-dollar ใน DTO · `maskedConnection` เดิมสำหรับช่องทาง |
| X11 ต้นทุนและโควตา | ทุกทางที่เรียกโมเดล | ทุกการเรียกคิดเงิน (`chargeUsageSafe`) · หมด = พัก · ผู้ใช้เห็นงาน/% เท่านั้น |

**ลำดับ deploy (RESOLUTIONS §E · บังคับโดย R-K2):** (1) `prisma migrate deploy` (secretary_a) → (2) ตรวจ `_prisma_migrations` → (3) deploy โค้ด → (4) ตั้ง `SECRETARY_LAUNCH_AT` ใน pack.ts = เวลาที่ deploy จริง (แก้ก่อน build prod) → (5) `SMS_PROVIDER` จริง · `AI_PROVIDER=anthropic` เมื่อมีคีย์ · ไม่มี `eas build`/`eas update`/ส่งสโตร์จากเลน (S3a.3 ผู้คุมรันตามคำสั่งเจ้าของ)

ข้อกฎหมาย: กิจการ = ผู้ควบคุมข้อมูล (นโยบายความเป็นส่วนตัวต้องระบุการใช้ AI) · SHARK = ผู้ประมวลผล (ต้องมี DPA ในข้อตกลง) · ตรวจสัญญาผู้ให้บริการโมเดลเรื่องไม่เก็บข้อมูลไปเทรน — ให้ที่ปรึกษาตรวจก่อนเปิดจริง (DESIGN §5)

---

## 11. สิ่งที่ตัดออกจากรุ่นแรก (ตั้งใจ · ไม่ออกใบ)

| เรื่อง | เหตุผล / ที่มา |
|---|---|
| ระดับ "ทำเองได้" (AUTO) + "ครั้งหน้าไม่ต้องถาม" | มติ 5 · เปิดเมื่อสถิติ "อนุมัติแล้วไม่ต้องแก้" ดีพอ (DESIGN §4 ข้อ 4) |
| งานข้ามกิจการ | มติ 8 |
| LINE เป็นช่องสั่งงานเลขา · ห้องเลขาบนเว็บ shark.in.th | มติ 4 (แอปเท่านั้น · `member/assistant` เดิมคงไว้) |
| **dorm (หอพัก) ในห้องเลขา** | R-K16 — ไม่มีเครื่องมือ/kind/ทะเบียน op ของหอพัก · เส้นสาธิตที่ 3 เปลี่ยนเป็นคืนมัดจำนัดหมาย (booking) · หอพักเลื่อนรุ่นถัดไป |
| **cron รายนาที** (worker / นาทีของงานประจำ / ยกระดับ SLA) | R-K8 — `vercel.json` มี tick รายวัน + hourly เท่านั้น · ใช้ตอบใน request + `after()` + เก็บตกใน hourly/outbox · งานประจำไม่มีคอลัมน์นาที |
| **เครื่องมือ SVC v2 ใหม่** (deposit/online/planner/no-show/dorm) | R-K17 — เครื่องมือ POS v2/SVC v2 ที่มีอยู่ใช้ได้แล้ว · ไม่เพิ่มของใหม่ ยกเว้น `booking.refund_deposit` (R-K16) |
| งานประจำรายเดือน/นาทีที่ตั้ง | มติ 16 — เหลือ ทุกวัน/ทุกสัปดาห์ (คอลัมน์ `frequency` รับ MONTHLY ได้แต่ UI ไม่เปิด) |
| ไมค์สั่งงาน · กฎ TOPIC ใน K5 · กล่อง "เปิดต่อจากทุกที่" ใน A8 · แปลภาษา/อัดเสียงใน K2 | มติ 16 |
| Facebook/IG/WhatsApp ในแชทลูกค้า | มติ 14 (รุ่นถัดไป · โมดูล chat ยังไม่มี adapter) |
| ตัวส่งออกชุดข้อมูลเทรน + ตัวนับ backoffice | มติ 16 — รุ่นแรกติดป้ายผลอย่างเดียว (S1.15) |
| ตาราง `AiTenantDigest` + cron | S1.16 คำนวณสด + cache 10 นาที ก่อน |
| SSE/WebSocket ของแอปใหม่ | S1.23 ใช้ polling `since=` · SSE เดิมคงไว้ |
| เพิ่มค่า enum `AiCreditSource` · ธง "ระงับเลขา" ใหม่ · คอลัมน์ผู้สร้างบน `AiConversation` | §B.2 · R-K12 · R-K1 (รหัสห้องเป็นแหล่งความจริง) |
| แพ็กเสียเงิน · ปุ่มเติมเงิน · เครดิตต้อนรับร้านใหม่ | มติ 7 (แสดงปิด) |
