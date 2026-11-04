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
| 3 | เห็นงานของกัน | **เจ้าของเห็นงานทุกคนในกิจการ** · คนอื่นเห็นของตัวเอง (+ ห้องที่ถูกเพิ่ม R5) | A1 D1 | R-K1 · `roomSightFor` (conversations.ts) · §7 |
| 4 | ช่องทางรุ่นแรก | **แอปเท่านั้น** (เว็บมีเฉพาะระบบ) · LINE รุ่นถัดไป | A8 | API มือถือชุดเดียว · §11 |
| 5 | "ครั้งหน้าไม่ต้องถาม" | **รุ่นแรกไม่มี** — ทุกงานที่เขียน/ส่งลูกค้ารออนุมัติ · อ่าน/สรุป/ร่างทำเอง | A4 B3 | ไม่มีระดับ AUTO · `setAccess(AUTO)` ปฏิเสธ (§5.3) |
| 6 | ย้อนกลับ | **24 ชั่วโมง** เฉพาะชนิดที่ย้อนได้จริง | A5 B5 | `AiActionLog.undoableUntil` · `undoAction` |
| 7 | ราคา/แพ็ก | ฟรีทั้งหมด · **100 งาน/เดือน** · แพ็กเสียเงินแสดงปิด · ปุ่มเติมเงินปิด · $10 ร้านเดิมคงไว้ ร้านใหม่ไม่ได้ | B8 | `FREE_PACK` · `SECRETARY_LAUNCH_AT` · §8 |
| 8 | งานข้ามกิจการ | ไม่ทำ · งานเปิดใต้กิจการเดียว | B1 | ทุกห้องมี `tenantId` เดียว |
| 9 | เลขาเสนองานเอง | ทำ · เป็นแค่ข้อเสนอ ไม่เริ่มจนคนแตะ | A2 C3 | `suggestions` ไม่เปิดห้องเอง |
| 10 | เลขาพัฒนาตัวเอง | ความจำ + ประสบการณ์ + ข้อมูลสด 3 ชั้น · เรียนจากสิ่งที่คนยืนยันเท่านั้น | B6 B2 A2 | `AiLesson` · `AiMemory.status` · `lessonBlock` · `computeDigest` |
| 11 | ไอคอนช่วยเหลือ | แจ้งปัญหาเป็นห้องแชทกับทีม SHARK · ต่อยอด Support Desk | H1–H4 | R-K12 · §5.20 §5.21 |
| 12 | ชุดข้อมูลเทรน | เก็บตัวอย่าง + ผล ดี/แก้/ตีกลับ ไม่ระบุตัวตน · ร้านปิดได้ | — | `AiTrainingSample.{outcome, editedReply, …}` · `recordOutcome` |
| 13 | เบอร์ = ID | สมัคร/เข้าด้วยเบอร์ + **SMS OTP** · อีเมลสำรอง · Apple/Google คงไว้ · บัญชีเดิมบังคับผูกเบอร์ | S1 S2 | R-K9/K10 · `PhoneOtp` + `UserPhone` |
| 14 | แชทลูกค้าในแอป | ไอคอนที่ 2 = ลูกค้า (LINE · เว็บแชท) ต่อยอดโมดูล chat · แถบบน ซ้าย เลขา·ลูกค้า·ทีม / ขวา ?·+ | K1–K4 | R-K13 · `/api/mobile/inbox/*` |
| 15 | ผู้ดูแล + เรียกช่วย + กฎรับเรื่อง | ผู้ดูแล 1 คน · เรียกคนช่วย · ส่งต่อ · กฎต่อช่องทาง · SLA · เข้า/ออกเวร · **เฉพาะคนที่ตอบได้ในหน่วยนั้น** | K5 D1 | R-K14 · `ChatRoutingRule` `ChatShift` `ChatConversationHelper` |
| 16 | ปรับตามการวิเคราะห์ | + G1–G5 · S1/S2 เป็น SMS · สี 3 โซน · ตัด ไมค์ / TOPIC / "เปิดต่อจากทุกที่" / แปล-อัดเสียง K2 · งานประจำเหลือ วัน/สัปดาห์ | G1–G5 | §3 · §11 |

แก้รอบ 3 (R1–R9 · 3 พ.ย.): R1 ไอคอนแชท+คนแทนสวิตช์ · R2 เอา "ส" ออก · R3 ช่องพิมพ์ล่างสุด · R4 ไม่มี C2 · R5 ห้องร่วม (D2 D3) · R6/R7 สมัคร ชื่อ+เบอร์+อีเมล (OTP เปลี่ยนเป็น SMS ตามมติ 13) · R8 บัญชีเดิมต้องผูกเบอร์ไม่มีปุ่มข้าม · R9 C1 ไม่มีตัวอย่างชื่อ

### 0.2 คำตัดสิน R-K1…R-K20 (สรุป — ฉบับเต็มที่ `ledger/secretary-briefs/sec-brief-RESOLUTIONS.md`)

| # | สรุป 1 บรรทัด | ที่ใช้ในเอกสารนี้ |
|---|---|---|
| R-K1 | ขยาย `ConvSight` เป็น `{own; ownerExtras; memberOf?; tenantRooms?}` (S1.4 · ชื่อตามใบ S1.4) · OWNER เห็นทุกห้อง **เฉพาะห้องที่มี `AiRoom`** · `AiRoom.startedById` = `conversationCreatorOf(id).id` | §5.4 §5.18 §7 |
| R-K2 | `AiMessage.authorUserId String?` เขียนเฉพาะ actor member · migration ก่อนโค้ด | §4 §10 |
| R-K3 | `classOfKind` (pure) · `ALWAYS_APPROVE` ค่าคงที่ · `AiApprovalRule` 3 กฎ · ความจำในห้องเลขาเป็นข้อเสนอ | §5.7 |
| R-K4 | ด่านผู้อนุมัติ role ≥ MANAGER เฉพาะห้องที่มี `AiRoom` · hook `approvalGate` หลังด่านเดิมของ `executeProposal` | §5.8 §7 |
| R-K5 | `AiScheduledTask.ownerUserId` · รันด้วย actor ของผู้ตั้ง · claim ด้วย `lastRunDay` · ไม่มีคอลัมน์นาที | §4 §5.21 |
| R-K6 | โควตา = scope `"jobs"` ที่สาม · นับที่ `startRoom` | §8 |
| R-K7 | `canRunAi(tenantId, {scope})` ชั้นเดียว · ร้านหลัง `SECRETARY_LAUNCH_AT` ไม่ได้ GRANT | §5.14 §5.18 §8 |
| R-K8 | ตอบใน request + `after()` · เก็บตกด้วย cron hourly/outbox · **ไม่มี cron รายนาที** | §5.5 §11 |
| R-K9/K10 | `PhoneOtp` + `UserPhone` (global) · `phone-auth.ts` (แผน · core/) · SMS mock ใน QC | §4 §5.22 |
| R-K11 | `StaffInvite` — ไม่สร้าง Membership จนกว่าจะรับ | §4 §5.25 |
| R-K12 | `SupportCase.{source, category, roomId}` · `listCasesForUser` · `assignCase` · ระงับเลขา = `setAccess` ทุกโมดูล OFF | §5.20 §5.21 |
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
- (S1.22 · migration `secretary_b`) `AiSettings.{afterHoursReply Boolean @default(false), afterHoursHandoff Boolean @default(true), aiDisclosure String?}` — นอกเวลาทำการ (§5.27)

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

### 5.2 `secretary.ts` (S1.2 · มีแล้ว · `src/lib/ai/secretary/secretary.ts` + ส่วน pure `identity.ts`) — ตัวตนเลขาต่อผู้ใช้
ตาราง `AiSecretary` แกน global (1 แถว/user ใช้ข้ามทุกร้าน) · ไม่ต้องมี tenant · ค่าคงที่/ตรวจรูปแบบ/prompt อยู่ใน `identity.ts` (ไม่ import อะไร — persona ใช้ได้โดยไม่ลากฐานข้อมูล) · `secretary.ts` = ฐานข้อมูล + re-export
- `SECRETARY_DEFAULT = { name: "Shark", suffix: "ครับ", tone: "polite", languages: ["th"] }` · `TONES = ["polite", "friendly", "brief"]` (สุภาพ · เป็นกันเอง · สั้นกระชับ) · `LANGUAGES = ["th", "en", "zh", "ja"]` · `NAME_MAX = 30` · `SUFFIX_MAX = 10`
- `type SecretaryIdentity = { name: string; suffix: string; tone: Tone; languages: Language[] }`
- `ensureSecretary(userId: string) → Promise<AiSecretary>` — upsert ค่าเริ่มต้น · เรียกซ้ำ = แถวเดิม (id เดิม · ไม่แก้ค่าที่ตั้งไว้) · ชนกันสร้าง (P2002) = อ่านแถวผู้ชนะ
- `secretaryOf(userId: string) → Promise<AiSecretary | null>` — อ่านอย่างเดียว ไม่สร้าง
- `updateSecretary(userId: string, patch: Partial<SecretaryIdentity>) → Promise<AiSecretary>` — ตรวจก่อนเขียน (ผิดข้อใด = throw `Error` ข้อความไทย ไม่เขียนเลย): name trim 1–30 grapheme (`Intl.Segmenter("th")` — "ที่" = 1 · S1.3b) ไม่มีบรรทัดใหม่/อักขระควบคุม/อักขระมองไม่เห็นหรือกลับทิศ (U+200B–200F · U+202A–202E · U+2060–2069 · U+FEFF) · ต้องมี `\p{L}`/`\p{N}` ≥ 1 · suffix trim 0–10 grapheme · tone ∈ `TONES` · languages ⊆ `LANGUAGES` ≥ 1 (ซ้ำ = ตัด · คงลำดับ ตัวแรก = ภาษาหลัก) · ไม่มีแถว = สร้างพร้อมค่าที่ส่ง · `prefs` ยังไม่เปิดแก้ (ใบ S1.14/S2.7)
- `normalizeIdentityPatch(patch) → Partial<SecretaryIdentity>` (pure · ตัวตรวจตัวเดียวกับ update — route S1.14 ใช้ตอบ 400) · `identityOf(row) → SecretaryIdentity` (pure · ค่าเพี้ยนในฐาน = ค่าเริ่มต้นของช่องนั้น · S1.3b clamp แถวที่เขียนทางอื่น: ตัดอักขระควบคุม/มองไม่เห็น + ตัดความยาวเป็น grapheme · ชื่อไม่มีตัวอักษร = ค่าเริ่มต้น)
- `sampleSpeech(sec: SecretaryIdentity) → string` — pure · ประโยคตัวอย่างภาษาไทยมีชื่อ + คำลงท้าย · ต่างกันตามน้ำเสียง (B2 preview · ไม่เรียกโมเดล)
- `secretaryPromptBlock(sec: SecretaryIdentity) → string` — pure · บล็อก "ตัวตนของคุณ" (ชื่อ · `ลงท้ายประโยคด้วย "<suffix>"` เมื่อ suffix ไม่ว่าง · น้ำเสียง) · `"` ในชื่อ/คำลงท้ายถูกแทนด้วย `'` ใน prompt
- ต่อ `buildSystemPrompt` (persona.ts): `PersonaContext.secretary?: SecretaryIdentity` · **ไม่ส่ง = prompt เดิมทุกไบต์** (ข้อสอบ P-1 เทียบ sha256 ของ 5973db2e) · ส่ง ⇒ บรรทัดแรก `คุณคือ "<name>" เลขา AI ประจำกิจการ "<tenant>" บนแพลตฟอร์ม SHARK (shark.in.th)` · บล็อกตัวตนก่อน "กติกา:" · `languages = ["th"]` = บรรทัด "ตอบภาษาไทยเสมอ…" เดิม · มีภาษาอื่น = "ตอบภาษาเดียวกับที่ผู้ใช้พิมพ์ (ไทย/อังกฤษ/…)" · prompt ยังเป็นภาษาไทยตามไฟล์เดิม
- `service.sendMessage`: actor `member` → `secretaryOf(actor.userId)` ใน `Promise.all` เดิม (ไม่เพิ่ม round-trip · ไม่สร้างแถว) · คีย์ API/งานภายใน/ไม่มีแถว = ไม่ส่ง

### 5.3 `access.ts` (S1.3 · มีแล้ว · `src/lib/ai/secretary/access.ts` + ส่วน pure `access-rules.ts`) — ระดับต่อระบบ (B3)
ตาราง `AiSystemAccess` แกน tenant (`@@unique([tenantId, module])`) · `access-rules.ts` ไม่ import อะไร (tool-access.ts/persona.ts ใช้ได้โดยไม่เกิดวงโหลด) · ชื่อเครื่องมือ → โมดูล/เขียน อยู่ใน `tool-access.ts` (ตารางเดียวกับด่าน membership) · `access.ts` = ฐานข้อมูล + re-export ทั้งหมด
- `ACCESS_LEVELS = ["OFF", "READ", "DRAFT"]` (ไม่มี AUTO ในรุ่นแรก) · `AI_MODULES` 27 ตัว = pos crm member account kanban chat inventory hr booking queue hotel dorm rental school clinic shop kb approval automation system marketing coupon reward point ticket restaurant calendar (= `module` ที่ด่านเครื่องมือ/KIND_ACCESS ใช้จริง · ข้อสอบ B-0) · `ALWAYS_ON = ["ai", "support", "secretary"]` (ปิดไม่ได้) · `DEFAULT_LEVEL = "DRAFT"` · `DEFAULT_OVERRIDES = { chat: "READ" }` · `MODULE_LABEL_TH` ป้ายไทยต่อโมดูล
- `type AccessMap = Readonly<Record<string, AccessLevel>>` — ครบทุก `AI_MODULES` เสมอ
- `getAccess(tenantId: string) → Promise<AccessMap>` — 1 query · ไม่มีแถว = ค่าเริ่มต้น · ระดับในฐานที่ไม่รู้จัก = OFF (ปิดไว้ก่อน) · "AUTO" ในฐาน = DRAFT
- `setAccess(tenantId: string, by: { userId: string; membership?: MembershipCtx }, module: string, level: string) → Promise<AccessMap>` — **โหลด** `Membership(userId, tenantId)` จากฐานเสมอ (S1.3b · `by.membership` = hint ไม่เชื่อ) · ไม่มีแถว / `acceptedAt = null` / ไม่ใช่ OWNER = `ForbiddenError` · module ∉ `AI_MODULES` = throw ไทย · `"AUTO"` = throw "รุ่นแรกยังไม่เปิดให้เลขาทำเองโดยไม่ขออนุมัติ …" · ระดับอื่นที่ไม่รู้จัก = throw · ตรวจครบก่อนเขียน · upsert + `setById = userId` · คืน map ใหม่ทั้งร้าน
- `setAccessAsPlatform(tenantId: string, module: string, level: string, platformUserId: string) → Promise<AccessMap>` (S1.3b · H4 · R-K12) — ทางของทีมงานแพลตฟอร์ม · **ผู้เรียกตรวจสิทธิ์แพลตฟอร์มเอง** · กติกาโมดูล/ระดับเดียวกับ `setAccess` · `setById = "platform:<platformUserId>"`
- `moduleOff(access: AccessMap | undefined, module: string) → boolean` (access-rules · pure · S1.3b) — `undefined` = false (ประตูเดิม = พฤติกรรมเดิม) · ALWAYS_ON = false · OFF / โมดูลนอกรายการ = true
- `TOOL_EXTRA_MODULES: Readonly<Record<string, readonly string[]>>` (access-rules · S1.3b) — ทะเบียน "อ่านเพิ่ม" นอกโมดูลหลัก: `upcoming_schedule` → booking hotel hr · `financial_summary` → pos · `growth_recommendations` → member pos · `customer_points` → point · ในตัวเครื่องมือ: ส่วนของโมดูลที่ OFF = ไม่อ่าน + ผลมีคีย์ `ข้าม: ["ข้ามส่วน <ป้ายไทย> (เจ้าของปิดไว้)"]` (`skippedSectionNote(module)`) — ไม่ปฏิเสธทั้งเครื่องมือ · `financial_summary` pos OFF = ไม่คืนรายได้/กำไร · ยกเว้น `customer_points`: point OFF = `{error}` ทั้งเครื่องมือ · ไม่ OFF = ผลเดิมทุกไบต์
- `toolModuleOf(name) → string | null` (tool-access.ts · pure) — เครื่องมือเขียนมือ = `HAND_TOOL_MODULE[name]` (export · needs ว่างแต่อ่านข้อมูลโมดูล เช่น low_stock→inventory · today_appointments→booking · recent_leads→crm) ?? `needs[0].module` ?? (อยู่ใน `HAND_TOOL_CORE` ? null : `"__unmapped__"`) · เครื่องมือเสนอ = `kindAccessOf(HAND_ACTION_KIND[name]).module` · `propose_plan` = null (แต่ละขั้นตรวจตอนเสนอ + ก่อน claim + ตอนรัน) · ทะเบียน op = `moduleToolQuery(name).module` · ชื่อที่ไม่มีใครประกาศ = `"__unmapped__"` · null = แกนกลาง
- `HAND_TOOL_CORE: ReadonlySet<string>` (tool-access.ts · S1.3b) — แกนกลางที่ประกาศชัด: ask_clarify list_systems propose_plan load_skill remember_fact forget_fact list_memories support_open_case growth_recommendations · เครื่องมือเขียนมือที่ needs ว่างต้องอยู่ใน CORE หรือ `HAND_TOOL_MODULE` (ข้อสอบ s1.3b X-4)
- `toolIsWrite(name) → boolean` — `HAND_ACTION_KIND`/`propose_plan` = true · เขียนมือ = `writesNow` · ทะเบียน op = `info.write` (op.kind ≠ read) · ไม่รู้จัก = true
- `accessVerdict(access, name) → ToolVerdict` — `"__unmapped__"` = ปฏิเสธ (ปิดไว้ก่อน · S1.3b) · OFF = `{ok:false, reason:"เจ้าของร้านปิดไม่ให้เลขาใช้ระบบ<ไทย> …"}` · READ + เขียน = `{ok:false, reason:"ระบบ<ไทย> ตั้งไว้ให้เลขาดูได้อย่างเดียว …"}` · โมดูลที่สองที่อ่านมาประกอบ (`EXTRA_MODULE_TOOL_NEEDS` · แชท) ต้องไม่ OFF · โมดูลนอกรายการ = ปฏิเสธ
- `kindAllowedByAccess(access, kind) → ToolVerdict` — โมดูลของ `kindAccessOf(kind)` ต้อง DRAFT (ALWAYS_ON ผ่าน · kind ไม่รู้จัก = ปฏิเสธ)
- `levelVerdict(access, module | null, write) → {ok} | {ok:false; reason}` (access-rules · pure) — กติกาเดียวที่ 2 ตัวบนเรียก
- `accessSummaryForPrompt(access) → string` — pure · บรรทัด "ระบบที่เจ้าของร้านปิดไม่ให้เลขาแตะ: …" / "ระบบที่ดูได้อย่างเดียว …" · "" เมื่อทุกโมดูลอยู่ที่ค่าเริ่มต้นหรือ DRAFT (chat READ ค่าเริ่มต้นไม่พูดถึง) ⇒ ร้านที่ไม่เคยตั้ง = prompt เดิม
- ต่อด่าน (สิทธิ์สุทธิ = membership ∩ ระดับ · membership ตรวจก่อน ข้อความเดิม แล้วค่อยระดับ): `toolVerdict(actor, name, { crmLegacyLead?, access? })` + `toolsOfferedTo(actor, names, access?)` (tool-access.ts · ไม่ส่ง access = เดิมทุกไบต์ · คีย์ API ก็ผ่านด่านระดับเมื่อส่ง) · `ToolCtx.access?` → `runTool` (tools.ts) · `service.sendMessage` = `getAccess` ใน `Promise.all` เดิม → ยื่นเครื่องมือ/สกิล + `ToolCtx.access` + `PersonaContext.access` · `executeProposal` หลัง `assertCan` → `kindAllowedByAccess` ไม่ผ่าน = `{ok:false, note}` คง PENDING · **ประตู CRM** (`crm.assist.tasks` · `crm.activity.ai_fill` · นามบัตร · `crm.*` ที่มี `requestedByUserId`) ตรวจระดับก่อนส่งต่อ (kind ที่ไม่มีใน KIND_ACCESS ตรวจด้วยโมดูล crm · S1.3b) · `runKind` (ขั้นของแผน) ไม่ผ่าน = throw ไทย · `accessLevelGate` อ่านฐานไม่ได้ = `{ok:false, reason:"ตรวจสิทธิ์ของเลขาไม่ได้ชั่วคราว ลองใหม่อีกครั้ง"}` (ไม่ปล่อยข้อความ Prisma) · proposals.ts/plans.ts import `./secretary/access` ตอนเรียก (กันวงโหลด)
- แผน (S1.3b): `propose_plan` (tools.ts) — `ctx.access` มี ⇒ ทุกขั้นที่ kind รู้จักต้อง `kindAllowedByAccess(...).ok` ไม่งั้น `{error:"ขั้นตอน \"…\" ในแผนนี้ทำไม่ได้ — <เหตุผลระดับ>"}` ไม่สร้างแผน · `executePlan` (plans.ts) หลังด่าน HF-HR-0 ก่อน claim: `getAccess` ครั้งเดียว · ขั้นใดไม่ผ่าน ⇒ `{ ok:false, results:[{summary, ok:false, note: reason}], doneCount:0 }` · แผน **คง PENDING** (ไม่ FAILED · เจ้าของเปิดระดับแล้วกดใหม่ได้)
- route คีย์ API (S1.3b): `/api/v1/ai/tools/[name]` = `getAccess(auth.tenantId)` → `toolVerdict(actor, name, { crmLegacyLead, access })` (ไม่ผ่าน = 403) + `runTool({ …, access })` · `/api/v1/ai/skills` + `/api/v1/ai/skills/[id]` กรองสารบัญด้วย `toolVerdict(…, { …, access })` ⇒ ค่าเริ่มต้น chat = READ ใช้กับคีย์ API ด้วย

### 5.4 rooms.ts (S1.4 · มีแล้ว · `src/lib/ai/secretary/rooms.ts`) — ห้องงาน
- `roomTitleFrom(instruction: string) → string` — pure · บรรทัดแรกที่มีตัวอักษร (trim) · > 60 ตัว = ตัด 60 + "…" · ว่าง = "งานใหม่"
- `roomStatusOf(x: { closedAt: Date | null; queuedJobs: number; pendingProposals: number; pendingPlans: number }) → RoomStatus` — pure · ลำดับ **DONE > RUNNING > WAITING > OPEN** (`RoomStatus = "OPEN" | "RUNNING" | "WAITING" | "DONE"`)
- `startRoom(ctx: { tenantId; actor: AiMemberActor }, input: { instruction: string; title?: string; systems?: string[]; context?: { chatConversationId?; contactId? } }, now?: Date) → Promise<StartRoomResult>`
  - `StartRoomResult = { ok: true; roomId; conversationId; messageId (ข้อความ USER แรก · S1.9); jobsUsed; jobsLimit } | { ok: false; error: "empty" | "actor" | "quota"; message: string (ไทย); resetAt?: Date; jobsUsed?; jobsLimit? }`
  - ใน `prisma.$transaction` เดียว: (1) แถว `AiJobCounter(tenantId, month = monthKeyBangkok(now))` ด้วย `createMany … skipDuplicates` (= `INSERT … ON CONFLICT DO NOTHING`) (2) `updateMany({ where: { tenantId, month, jobs: { lt: FREE_PACK.jobsPerMonth } }, data: { jobs: { increment: countsAsJob({kind:"room_new"}) } } })` — count 0 ⇒ โควตาหมด ⇒ ย้อนทั้ง tx ไม่สร้างอะไร (X3 · ห้ามอ่านแล้วเขียน) (3) `AiConversation` (id = `newConversationId` → `u~<userId>~…`) (4) `AiRoom` (`startedById` = actor.userId = `conversationCreatorOf(conversationId).id` · `jobsCounted` 1) (5) `AiMessage` USER (`authorUserId`)
  - ยังไม่เรียกโมเดล และยังไม่สร้าง `AiRoomJob` (S1.5 ต่อคิว) · ไม่มี event (`ai.room.started` เลื่อนไป S1.5 พร้อม consumer + ทะเบียน 3 ที่)
  - actor ไม่ใช่คนในร้าน / `actorProblem` ⇒ `error:"actor"` · คำสั่งว่าง ⇒ `error:"empty"` · โควตาหมด ⇒ `error:"quota"` + `message = quotaMessage(...).text` + `resetAt = nextResetBangkok(now)` · ไม่ตรวจ `ai.chat.send` เอง (route S1.14 ตรวจ)
- `roomStatus(tenantId: string, conversationId: string, now?: Date) → Promise<RoomStatus>` — db · `AiRoomJob` QUEUED/RUNNING · `AiProposal` PENDING ไม่หมดอายุ · `AiPlan` PENDING ไม่หมดอายุ · ไม่มีห้อง = OPEN
- `listRooms(ctx: ConvCtx, opts?: { scope?: "mine" | "tenant"; status?: RoomStatus; q?: string; take?: number; before?: Date }) → Promise<RoomCard[]>`
  - `RoomCard = { id; conversationId; title; status; systems; startedById; startedByName; memberIds; updatedAt; closedAt; unread }`
  - `tenant` = OWNER เท่านั้น (คนอื่นส่งมา = `mine` เงียบ ๆ) · `mine` = `startedById = userId` ∪ `AiRoomMember.userId` · เรียง `AiRoom.updatedAt` desc · take ปริยาย 50 สูงสุด 100 · `before` = updatedAt < before · `q` = title contains (insensitive) · สถานะของการ์ด 3 groupBy รวม (ไม่ N+1) · `unread` = มี ASSISTANT ใหม่กว่า `AiConversation.lastReadAt` (ค่าเดียวต่อห้อง)
- `getRoom(ctx, roomId) → Promise<(AiRoom & { status }) | null>` — ผู้เปิด · สมาชิก · OWNER · อื่น = null
- `closeRoom(ctx, roomId, now?) → Promise<boolean>` — ผู้เปิดห้องหรือ OWNER · ตั้ง `closedAt` · ปิดซ้ำ = false
- `renameRoom(ctx, roomId, title) → Promise<boolean>` — ผู้เปิดห้องหรือ OWNER · `AiRoom.title` + `AiConversation.title` ใน tx เดียว · ≤ 60 ตัว
- การมองเห็น (R-K1) อยู่ที่ `conversations.ts` (ไม่ใช่ rooms.ts): `roomSightFor(ctx) → Promise<ConvSight>` (1 query: `AiRoomMember` ของผู้ใช้ → `memberOf` · `tenantRooms = role === "OWNER"`) · `findVisibleConversation` (แถวมี `room`) · `canSeeConversationById(ctx, id)` (ยกเลิกข้อเสนอ) · `canConfirmerSeeConversation(tenantId, m, userId, id)` (ยืนยันข้อเสนอ/แผน) — ใช้ใน `listMessages` · `sendMessage` · `listPendingProposals` · `rejectProposal` · `executeProposal` · `executePlan` · เครื่องมือ (`ToolCtx.sight` ที่ `sendMessage` ตรวจแล้ว · `guarded` ใช้ `ctx.sight ?? sightOf(ctx)`)
- 🔴 ห้าม import `service.ts` จาก rooms.ts (วงกลม)

### 5.5 worker.ts (S1.5 · มีแล้ว · `src/lib/ai/secretary/worker.ts` + `room-jobs-job.ts`) — คิวเบื้องหลัง (R-K8 · R-K8b)
- ค่าคงที่ `ROOM_JOB_LEASE_MS = 120_000` (2 นาที) · `ROOM_JOB_MAX_ATTEMPTS = 3` · `ROOM_JOBS_MINUTE_JOB = "secretary.roomJobs"`
- `enqueueRoomJob(tenantId, roomId, messageId, authorUserId) → Promise<AiRoomJob>` — idempotent บน `messageId @unique` (มีแล้ว = คืนแถวเดิม · ยิงพร้อมกันชน P2002 = คืนแถวของทางแรก) · ห้องต้องเป็นของร้าน + ข้อความต้องอยู่ในบทสนทนาของห้อง (ไม่งั้น throw — ผู้เรียกประกอบผิด) · แถวใส่ `tenantId` (R-S1.1c)
- `sendRoomMessage(ctx: { tenantId; actor: AiMemberActor }, roomId, input: { text; imageUrls? }) → Promise<{ ok: true; messageId; jobId } | { ok: false; error: "not_found" | "closed" | "empty"; message (ไทย) }>`
  - ข้อความว่าง ⇒ `empty` · ไม่มีห้อง / ร้านอื่น / มองไม่เห็น (`findVisibleConversation` → `roomSightFor`: ผู้เปิด ∪ สมาชิก ∪ OWNER) ⇒ `not_found` · `closedAt` ⇒ `closed`
  - tx เดียว: `AiMessage` USER (`authorUserId` = ผู้ส่ง · R-K2) + `AiRoomJob` QUEUED + แตะ `AiRoom.updatedAt` · **ไม่เรียกโมเดล · ไม่นับงาน** (R-K6) · route S1.14 เรียก `runRoomJobs` ต่อใน `after()`
  - `imageUrls` ยังไม่ไปถึงโมเดลทางคิว (ไม่มีคอลัมน์เก็บรูป — ดู wo-notes S1.5 §8)
- `runRoomJobs(deps?: { provider?; post?; now?; limit? (ปริยาย 5 · ≤ 50); deadline? }) → Promise<{ claimed; done; failed; requeued }>` — **ไม่ throw**
  1. หางาน `status = QUEUED` หรือ (`RUNNING` และ `leaseUntil < now`) · `attempts < 3` · เรียง `createdAt` · ≤ limit (คิวกลางข้ามร้าน)
  2. claim ทีละตัว: `updateMany({ where: { id, …เงื่อนไขข้อ 1 }, data: { status: RUNNING, leaseUntil: now + 2 นาที, attempts: +1, startedAt: now } })` — count 0 = อีกรอบได้ไป ข้าม (X5)
  3. `Membership` สดของ `authorUserId` (`acceptedAt ≠ null`) ไม่มี ⇒ FAILED "ผู้สั่งไม่ได้เป็นสมาชิกของกิจการแล้ว" · ผู้สั่งมองไม่เห็นห้องแล้ว ⇒ FAILED "ผู้สั่งไม่ได้อยู่ในห้องนี้แล้ว" (ไม่เรียกโมเดล · ไม่ retry)
  4. `sendMessage({ tenantId, actor: aiMemberActor(…) }, { conversationId: room.conversationId, text: message.content }, { provider, source: "CHAT", userMessageId: message.id })`
  5. ok ⇒ DONE (`finishedAt` · `error = null`) · !ok ⇒ FAILED + ข้อความไทย (`usage.quotaMessage` / AI ปิดอยู่ / ว่าง) ไม่ retry · throw ⇒ `attempts < 3` ? กลับ QUEUED (`leaseUntil = null` · error ไทยทั่วไป — รายละเอียดดิบไป `logOps` WARN เท่านั้น) : FAILED
     · การเขียนผลทุกครั้งมีเงื่อนไข `status = RUNNING AND attempts = ค่าตอน claim` (fencing — รอบที่ lease หมดแล้วถูกหยิบต่อ เขียนทับผลไม่ได้)
  6. หลัง DONE/FAILED: push ผ่าน `notifyUser(uid, tenantId, "room", …)` (S1.23 · ค่าตั้ง + badge + กันสแปม 60 วิ · §5.25a) → `sendPushToUser(uid, { title: room.title, body: ≤ 120 ตัวของคำตอบ | "ทำไม่ได้: …", data: { link: "/secretary/room/<roomId>", conversationId, roomId, kind: "room" } }, { post })` ถึง `room.startedById ∪ AiRoomMember.userId` · ไม่กรองร้าน (R-K20) · push ล้ม = log ไม่กระทบงาน
  - `deadline` (ms · ไม่บังคับ) = หยุดหยิบงานใหม่เมื่อถึงเวลา — งานรายนาทีส่ง `ctrl.deadline − 8 วิ`
- `registerRoomJobsMinuteJob() → void` — `registerMinuteJob({ name: "secretary.roomJobs", everyMinutes: 1, run: (now) => runRoomJobs({ now, limit: 5 }) })` · `room-jobs-job.ts` เรียกตอน import
- `service.sendMessage` deps ใหม่ `userMessageId?: string` — มี ⇒ ไม่สร้างแถว USER ซ้ำ · ประวัติ `NOT id = userMessageId` · บทสนทนาที่มองไม่เห็น ⇒ throw (ไม่เปิดห้องใหม่) · ไม่ส่ง = เดิมทุกไบต์
- เรียกจาก (R-K8b): route ส่งข้อความ S1.14 (`after()` ใน request เดียวกัน) · ตัวเก็บตก = งานรายนาที `secretary.roomJobs` ผ่าน `scripts/crm-cron.mts minute` (crontab VPS ทุกนาที) + hook `runMinuteJobs` ใน `POST /api/cron/outbox` (import `room-jobs-job`) · `vercel.json` ไม่แตะ (มีแค่ `tick` รายวัน + `hourly` · ไม่มีตัวตั้งเวลาใดชี้ `/api/cron/outbox`) · ไม่มี event `ai.room.*` ในใบนี้ · SSE เดิม `sendMobileChat` คงไว้
- 🔴 rooms.ts ห้าม import worker.ts (วงกลม) · worker → service → conversations

### 5.6 members.ts (S1.6 · มีแล้ว · `src/lib/ai/secretary/members.ts`) — ห้องร่วม (R5)
ผู้เปิดห้องไม่มีแถว `AiRoomMember` (รหัสห้องคือแหล่งความจริง) · ห้องที่มองไม่เห็น = `not_found` (R-K1 · ไม่บอกว่ามีอยู่) · คีย์ API/งานภายใน = มองไม่เห็นห้อง · ข้อความถึงผู้ใช้เป็นไทย · ไม่มี event `ai.room.*` ในใบนี้ (`ai.room.member_added` → ใบ S1.23 notify · RESOLUTIONS §J) · สมาชิกที่ Membership ถูกถอน (`acceptedAt = null`) = ไม่แสดง · ไม่นับเพดาน · ไม่ได้ push (R-S1.6c · แถว `AiRoomMember` ยังอยู่)
- `ROOM_MEMBERS_MAX = 20` · `type RoomMemberRow = { userId; name; role: "OWNER" | "MANAGER" | "STAFF"; addedById; addedAt: Date; seeHistory: boolean }` (name = `User.name` → ส่วนหน้าอีเมล → "สมาชิก" · role จาก `Membership` ของร้านนี้ที่ยังรับอยู่) · `SYSTEM_AUTHOR = "system"` · `NOT_SYSTEM_MESSAGE` (where ตัดข้อความระบบ — `authorUserId` null ผ่าน)
- `listMembers(ctx: ConvCtx, roomId) → Promise<RoomMemberRow[] | null>` — มองไม่เห็นห้อง = null · เรียง `addedAt` asc · ไม่รวมผู้เปิดห้อง
- `addMember(ctx, roomId, input: { userId: string; seeHistory?: boolean }) → Promise<{ ok: true; member: RoomMemberRow } | { ok: false; error: "not_found" | "forbidden" | "not_member_of_tenant" | "self" | "already" | "limit" | "closed"; message }>`
  - ลำดับตรวจ: มองไม่เห็น → `not_found` · ไม่ใช่ผู้เปิดห้อง/OWNER (รวมสมาชิกห้อง) → `forbidden` · `closedAt` → `closed` · ผู้ถูกเพิ่ม = ตัวเอง/ผู้เปิดห้อง → `self` (OWNER เพิ่มตัวเอง: "คุณเห็นทุกห้องอยู่แล้ว…" · R-S1.6d) · ไม่มี `Membership(userId, tenantId)` ที่ `acceptedAt ≠ null` (รวม user ไม่มีจริง) → `not_member_of_tenant` · มีแถวแล้ว → `already` · ครบ 20 (นับเฉพาะสมาชิกที่ Membership ยังรับอยู่) → `limit` · เพิ่มซ้ำหลังถูกเอาออก = แถวใหม่ (seeHistory ตามที่เลือกใหม่)
  - tx เดียว: `SELECT … FROM "AiRoom" … FOR UPDATE` (เพิ่มพร้อมกันไม่ทะลุ 20 · ตรวจปิด/ซ้ำ/จำนวนซ้ำใต้ล็อก · unique `[roomId, userId]` ชน = `already`) → `AiRoomMember(tenantId, roomId, userId, addedById = ผู้ทำ, seeHistory ปริยาย false)` → ข้อความระบบ `AiMessage(role ASSISTANT, content "🔔 <ผู้เพิ่ม> เพิ่ม <ผู้ถูกเพิ่ม> เข้าห้อง", authorUserId "system", tokens 0)` (R-S1.6b: ไม่นับ unread ใน `listRooms`/`mobile/conversations` · ไม่ป้อนเข้าประวัติของโมเดล) (สร้างหลังแถว ⇒ `createdAt ≥ addedAt` — สมาชิกใหม่เห็นเป็นแถวแรก) → `AiRoom.updatedAt`
- `removeMember(ctx, roomId, userId) → Promise<{ ok: true } | { ok: false; error: "not_found" | "forbidden" | "not_a_member"; message }>` — ผู้เปิดห้อง/OWNER เอาใครออกก็ได้ · สมาชิกเอาตัวเองออกได้ (ออกจากห้อง) · สมาชิกเอาคนอื่นออก = `forbidden` · ผู้เปิดห้องออกเอง = `forbidden` "ผู้เปิดห้องออกไม่ได้ — ปิดห้องแทน" (R-S1.6d) · ไม่มีแถว (รวมผู้เปิดห้อง) = `not_a_member` · tx: ลบแถว + ข้อความระบบ ("🔔 <ผู้ทำ> นำ <ชื่อ> ออกจากห้อง" · ออกเอง "🔔 <ชื่อ> ออกจากห้อง") + `AiRoom.updatedAt` · ออกแล้วมองไม่เห็นห้องทันที · ห้องปิดแล้วยังเอาออกได้
- `visibleSinceForUser(tenantId, role, userId, conversationId) → Promise<{ gte: Date } | null>` + `visibleSinceFor(ctx, conversationId)` — สมาชิก (ไม่ใช่ผู้เปิด · ไม่ใช่ OWNER) ที่ `seeHistory = false` ⇒ `{ gte: addedAt }` · อื่น ๆ ⇒ null (OWNER/ผู้เปิด/คีย์ = ไม่ query) · `withinSight(since, createdAt)` · `visibleMessagesWhere(ctx, conversationId)` = `{ createdAt: since }` หรือ `{}`
  - ใช้ใน `service.listMessages` (ทางห้องร่วมเท่านั้น · ห้องเดิม/ห้องตัวเอง = เดิมทุกไบต์) · ประวัติที่ป้อนโมเดลใน `service.sendMessage` · R-S1.6a: `listPendingProposals` · `listPendingPlans` · `rejectProposal` · `rejectPlan` · ด่านมองเห็นของ `executeProposal`/`executePlan` (ข้อเสนอ/แผนที่ `createdAt < addedAt` = "ไม่พบ" เหมือนไม่มี) — บังคับในบริการ ไม่ใช่ UI (COMMON §C.8)
- `roomPushRecipients(tenantId, roomId) → Promise<string[]>` (R-S1.6c) — ผู้เปิดห้อง ∪ สมาชิก เฉพาะคนที่ Membership ของร้านนี้ `acceptedAt ≠ null` · `worker.pushRoom` ใช้ตัวนี้
- `roomMemberRows(tenantId, roomId)` — ตัวอ่านภายใน (ไม่ตรวจการมองเห็น) ที่ `rooms.getRoom` ใช้ ⇒ `getRoom` คืน `members: RoomMemberRow[]` เพิ่ม · `listRooms` การ์ดมี `memberIds` (S1.4)
- X2: ข้อความที่สมาชิกพิมพ์ = `authorUserId` ของสมาชิก · เครื่องมือ/สกิลยื่นตามสิทธิ์ของผู้พิมพ์ (S1.4/S1.5) · ผู้อนุมัติผ่าน `actorCanConfirmKind`/`assertCan` ด้วยสิทธิ์ตัวเอง (เดิม)
- 🔴 members.ts ห้าม import `../service` หรือ `./rooms` (rooms → members · service → members)

### 5.7 kind-class.ts (S1.7 · มีแล้ว · pure · `src/lib/ai/secretary/kind-class.ts`) — ชั้นความเสี่ยง (R-K3 · R-S1.7c · R-S1.7d)
- ตารางชนิดข้อเสนออยู่ใน **`src/lib/ai/kind-tables.ts`** (pure ล้วน · ไม่ import อะไรเลย · R-S1.7d): `StaticProposalKind` · `STATIC_KIND_ACCESS` · `KIND_ACCESS` · `DESTRUCTIVE_KINDS` · `isKnownKind` · `kindAccessOf` · `registerDerivedKinds({access, destructive})` — ส่วนที่ derive จากทะเบียน op (บัญชี · บอร์ดงาน · สมาชิก · CRM · POS) proposals.ts เติมตอนโหลดโมดูล (ลำดับเดิม: คงที่ก่อน · ทะเบียนทับ) · proposals.ts re-export `DESTRUCTIVE_KINDS`/`isKnownKind`/`kindAccessOf` ชื่อเดิม · **kind-class.ts import จาก `../kind-tables` เท่านั้น** (ห้าม `../proposals` · ห้ามฐาน — oracle D-3) · ฝั่งที่ไม่ได้โหลด proposals.ts เห็นชุดคงที่ + fail-closed
- `classOfKind(kind: string) → KindClass` (`{ destructive; money; customerFacing; piiExport; known }`) — ไม่อ่านฐาน · ไม่เพิ่มคอลัมน์ใน `AiProposal`
  - `destructive` = `DESTRUCTIVE_KINDS.has(kind)` · `money` = module ∈ {account, payments, finance, cheques, point, reward, ticket, restaurant} (point/reward ยังใช้จริง: `point_adjust` · `reward_redeem`) · prefix `member.points.` `member.giftcards.` `member.wallet.` `member.rewards.` `member.vouchers.` · pos ที่ kind มี void/refund/sale · shop ที่มี refund · school ที่มี mark_paid/pay · หรือ kind มี refund/void/pay · `customerFacing` = `chat.send` · `marketing_create_campaign` · `coupon_create` · prefix `crm.emails.` `member.campaigns.` `member.journeys.` `member.notifications.` `crm.sequences.` · `piiExport` = kind มี export/csv
  - ไม่รู้จัก (`kindAccessOf` = null) ⇒ `{known:false, destructive:true, money:true, customerFacing:true}` (fail-closed ทั้ง 3 ชั้น · R-S1.7c) — `chat.send`/`booking_refund_deposit` known แล้ว (S1.12 ลงทะเบียนใน kind-tables)
- `ALWAYS_APPROVE = ["destructive","money","piiExport"]` (ค่าคงที่ · ปิดไม่ได้) · `RULE_KEYS = ["chat.send","money.limit","pii.export"]` · `RuleMap = Record<RuleKey, {enabled; limitSatang: number|null}>`
- `whyApproval(kind, payload, rules: RuleMap) → string` — ไทย ไม่ว่างเสมอ · เหตุผลต่อชั้นคั่นด้วย " · " ("ลบ/ยกเลิกถาวร — ต้องยืนยัน 2 ชั้น" · "เกินวงเงิน N บาท ที่ตั้งไว้ (รายการนี้ M บาท)" เมื่อ `money.limit` เปิดและยอดใน payload (`totalSatang`/`amountSatang`/`grandTotalSatang` ชั้นบนหรือใน `input` · บิลขายรวมจาก `lines`) เกิน `limitSatang` ไม่งั้น "มีเงินเข้า/ออก — ต้องอนุมัติเสมอ" · "ส่งถึงลูกค้า (กฎ chat.send)" · "ส่งออกข้อมูลส่วนบุคคล (กฎ pii.export)" · ไม่รู้จัก "ไม่รู้จักประเภทรายการนี้ — ต้องให้คนตรวจก่อนเสมอ" (ไม่ต่อท้ายชั้นอื่น) · ทั่วไป "เลขาเสนอ — รุ่นแรกทุกรายการเขียนต้องมีคนอนุมัติ")
- ในห้องเลขา: `remember_fact`/`forget_fact`/`kb_auto_save` เป็นข้อเสนอ (`AiMemory.status = "PENDING"`) · `support_open_case` ยังเขียนทันที (S1.10)
- kind ใหม่ (S1.12 · มีแล้ว — รายละเอียด §5.7a): `chat.send` (R-K15) → `sendReply(...)` เฉพาะผู้ติดต่อที่ `ChatContact.customerId` ผูกแล้ว · `booking_refund_deposit` (R-K16 · ชื่อจริงในโค้ด — เดิมเขียน `booking.refund_deposit`) → `refundDepositByShop` (booking/deposit.ts · ทางเดียวกับปุ่มคิวมัดจำ)

### 5.7a `chat.send` + `send_customer_message` · `booking_refund_deposit` + `refund_booking_deposit` (S1.12 · มีแล้ว · รอบ 2 ตาม RESOLUTIONS §M)
- tool `send_customer_message({ conversationId, body, kind?: "reply"|"followup"|"quote", documentId?, dealId? })` — **เสนอเท่านั้น** (skill `chat` · `HAND_ACTION_KIND` → `chat.send` · ผู้สั่งต้องมี `chat.message.send` · ระดับ `chat` ของร้านต้อง DRAFT — ค่าเริ่มต้น READ ⇒ ไม่ยื่น) · ห้องหาในร้าน + สาขาตาม `canAccessConvUnit` (OWNER/คีย์ = ทั้งร้าน · มองไม่เห็น = "ไม่พบ") · ลูกค้าไม่ผูก ⇒ error ไทย "…ยังไม่ผูกกับสมาชิก/CRM — ผูกก่อนแล้วค่อยส่ง" (ไม่สร้างข้อเสนอ) · ห้อง RESOLVED ⇒ error · body ≤ `CHAT_SEND_BODY_MAX` (= 1000 − ความยาวบรรทัดลงชื่อ)
- **K-8:** `kind: "followup"` = ติดตามงานบริการ (นัด/ใบเสนอราคา/คำถามค้าง) **ไม่ใช่ข้อความการตลาด** — รุ่นแรกไม่ตรวจ consent การตลาดของสมาชิก · การตลาดยังต้องผ่านแคมเปญของระบบสมาชิก (ตรวจ consent)
- payload (ids + ข้อความ): `{ systemId, conversationId, contactId, body, kind, refs?: { documentId?, dealId? } }` · summary (R-S1.12a) = `ส่งข้อความถึง <ชื่อ ผ่าน maskPiiDeep> (<ช่องทาง>):\n<body เต็ม>` — ผู้อนุมัติเห็นทั้งฉบับ
- ห้ามเป็นขั้นของแผน (R-S1.12b): `chat.send` และ `booking_refund_deposit` อยู่ใน `PLAN_HUMAN_ONLY` (plans.ts) · `isPlanHumanOnly(kind)` export · ไม่แก้ก่อนอนุมัติ (S1.10 — kind เขียนมือไม่ editable)
- ด่านก่อน claim (R-S1.12e): ผู้อนุมัติที่ไม่ใช่ OWNER ต้องผ่าน `canAccessConvUnit(unitAccess, conv.unitId)` ⇒ ไม่ผ่าน = คง PENDING + note ไทยเรื่องสิทธิ์สาขา
- dispatch (ตอนอนุมัติ · ตรวจซ้ำทุกข้อ): ห้องของร้าน + `systemId`/`contactId` ตรงห้อง · `contact.customerId` ไม่ว่าง ("ส่งได้เฉพาะลูกค้าที่ผูกกับสมาชิก/CRM แล้ว") · `status ≠ RESOLVED` (enum มีแค่ OPEN/PENDING/RESOLVED) · `replyWindowExpiresAt` หมด ⇒ "หน้าต่างตอบของช่องทางนี้ปิดแล้ว" · ไม่มีไฟล์แนบ → `sendReply({ senderUserId: <ผู้อนุมัติ>, senderName: "Shark (ผู้ช่วย AI)", body: body + "\n— ข้อความนี้ส่งโดย Shark ผู้ช่วย AI ของร้าน" (R-S1.12c · รวม ≤ 1000), unitAccess: ผู้อนุมัติ (OWNER = "*"), meta, clientMessageId: "ai:" + proposalId })` · resultNote `ส่งถึง <ชื่อ> ทาง <ช่องทาง> แล้ว (ลงชื่อ Shark ผู้ช่วย AI)` · ต้องรู้ userId ผู้อนุมัติ
- **ป้ายใน `ChatMessage.meta` (คีย์แบน `Record<string,string>` — S1.21 อ่านไปทำป้าย "ส่งโดย Shark · อนุมัติโดย X"):** `ai_proposalId` · `ai_approvedBy` (userId ผู้อนุมัติ) · `ai_roomId` (`AiRoom.id` — มีเฉพาะข้อเสนอที่เกิดในห้องเลขา) · ผู้ส่ง `senderName` = "Shark (ผู้ช่วย AI)" (ทับ `senderAlias` ของร้าน) + บรรทัดลงชื่อในตัวข้อความ (ช่องทางที่ไม่แสดง senderName)
- `sendReply` รับ `clientMessageId?: string` (ไม่ส่ง = เดิมทุกประการ) · คีย์ซ้ำในห้องเดียวกัน (เฉพาะ `direction: "OUT"`) ⇒ `{ ok: true, messageId: <แถวเดิม>, duplicate: true }` ไม่สร้างแถว/ไม่ส่งออกช่องทาง/ไม่ emit (ตรวจก่อน + จับ P2002 กรณีชนพร้อมกัน)
- ย้อนไม่ได้ (ไม่อยู่ใน `UNDOABLE_KINDS`) · log (S1.8) `out.entity = { type: "chat.message", id: <messageId> }` · payload = ids เท่านั้น ไม่เก็บ body · summary (ชื่อ + ข้อความ) ผ่าน maskPiiDeep (R-S1.8f · มติผู้คุม)
- persona (R-S1.12d): กติกา 1 บรรทัด ("ต้องผ่านการอนุมัติจากผู้มีสิทธิ์" · ระบบลงชื่อ Shark · เฉพาะลูกค้าที่ผูก · ห้ามสัญญาเรื่องเงิน/ส่วนลด) ฉีดเฉพาะเมื่อ service ยื่น `send_customer_message` ให้ผู้ถามจริง (`PersonaContext.customerChat`) · ไม่ส่ง = prompt เดิมทุกไบต์
- tool `refund_booking_deposit({ appointmentId })` (skill `booking` · kind `booking_refund_deposit` · คีย์ `booking.deposit.refund`) — นัดในสาขาที่ผู้สั่งเห็น · `depositInfo` ต้องอยู่สถานะ REFUND_DUE/FORFEIT_PENDING · summary สร้างที่เซิร์ฟเวอร์ `คืนมัดจำ <ยอด> บาท ให้ <ชื่อ mask> (นัดวันที่ <วันไทย>)` · payload `{ appointmentId, unitId }` · dispatch → `refundDepositByShop` (สิทธิ์สดของคนกด) · `out.entity = booking.appointment`

### 5.8 approval-gate.ts (S1.7 · มีแล้ว · `src/lib/ai/secretary/approval-gate.ts`) — กฎอนุมัติ (B4) + ผู้อนุมัติ (R-K3b · R-K4 · R-S1.7a/b/e)
- `DEFAULT_RULES: RuleMap` — เปิดทั้ง 3 · `money.limit.limitSatang = 500000` (5,000 บาท)
- `listRules(tenantId) → Promise<RuleMap>` — แถว `AiApprovalRule` + เติมค่าเริ่มต้น · อ่านอย่างเดียว
- `setRule(tenantId, by: { userId; membership; tenantId? }, key, patch: { enabled?; limitSatang? }) → Promise<RuleMap>` — `by.tenantId` ส่งมาแล้วไม่ตรง ⇒ `ForbiddenError` **ก่อนอ่าน role** (R-S1.7e) · OWNER เท่านั้น (`ForbiddenError`) · key ∉ `RULE_KEYS` / `limitSatang` ไม่ใช่จำนวนเต็ม ≥ 0 / วงเงินกับกฎอื่น ⇒ throw ไทย (ไม่เขียน) · ก่อนเขียนตรวจ Membership สดของ `by.userId` ในร้านนี้ = OWNER ที่รับคำเชิญแล้ว (ผูก tenant จากฐาน) · upsert `@@unique([tenantId, key])` + `setById` (prisma ตรง — guard ของ tenantDb ห่อ where ของ upsert ไม่ได้)
- `approvalGate(tenantId, m: MembershipCtx, row: { kind; conversationId; payload }, userId?) → Promise<{ ok: true; why? } | { ok: false; note }>` — ห้องเดิม (ไม่มีแถว `AiRoom`) ⇒ `{ok:true}` ทันที **ไม่อ่านกฎ ไม่คำนวณ why** (R-S1.7b · query เดียวคือหาแถว AiRoom) · ห้องเลขา ⇒ `m.role ∈ {OWNER, MANAGER}` (ไม่งั้น "ข้อเสนอของเลขาต้องให้เจ้าของหรือผู้จัดการอนุมัติ") + `membershipCan(m, kindAccessOf(kind), userId)` · ผ่าน ⇒ `why = whyApproval(kind, payload, listRules)` · ฐานล้ม ⇒ `{ok:false, note:"ตรวจกฎอนุมัติไม่ได้ ลองใหม่อีกครั้ง"}` (fail-closed · ไม่ throw)
- `planApprovalGate(tenantId, m, conversationId, steps, userId?) → Promise<string | null>` (R-S1.7a) — ด่านเดียวกันต่อทุกขั้นของแผน · หา AiRoom ครั้งเดียว · null = ผ่าน · ฐานล้ม = note เดียวกับข้างบน
- ต่อใน `executeProposal` หลังด่านสิทธิ์เดิม (`assertCan` + ระดับต่อระบบ S1.3) ก่อนยืนยัน 2 ชั้น · ไม่ผ่าน = คง PENDING · ผ่านในห้องเลขา ⇒ ผลคืน `why` (ฟิลด์ optional) · **ด่านมองเห็นห้อง (S1.4) อยู่ก่อนเสมอ** ⇒ MANAGER อนุมัติได้เฉพาะห้องที่ตัวเองเห็น (ผู้เปิด/สมาชิก) · OWNER ทุกห้อง
- ต่อใน `executePlan` (R-S1.7a) หลังด่านระดับต่อระบบ ก่อนยืนยัน 2 ชั้นและก่อน claim — ไม่ผ่าน ⇒ `{ok:false, results:[], doneCount:0, note}` (`PlanExecResult.note` optional) · ไม่ทำสักขั้น · แผน **คง PENDING** · ห้องเดิมไม่เปลี่ยน · `runKind` ไม่มีด่านซ้ำ
- R-K3b: กฎ 3 ข้อในรุ่นแรก = เก็บ + แสดง + ใช้ในข้อความ "ทำไมต้องอนุมัติ" เท่านั้น — ไม่มีทางอัตโนมัติ (AUTO รุ่นถัดไป)

### 5.9 actions.ts (S1.8 · มีแล้ว · `src/lib/ai/secretary/actions.ts`) — บันทึก + ย้อน 24 ชม. (มติ 6 · R-S1.8a · R-S1.8b–h)
- `UNDOABLE_KINDS: Record<kind, { entityType; hours: 24; undoPermission: {module, action} }>` (R-S1.8b · สิทธิ์ของ "การกลับทาง"): `kanban_create_card`/`kanban.cards.create` → `kanban.card.delete` · `kanban.cards.move` → `kanban.card.move` · `crm.deals.move` → `crm.deal.move` · `booking_create_appointment` → `booking.appointment.setStatus` — ไม่มี kind ที่ส่งข้อความหรือเงินออก
- `ActionEntity = { type; id; unitId? }` · `DispatchOut = { entity? }` — out-param ของ `proposals.dispatch(…, out?)` → `dispatchKanbanKind(…, out?)` ตั้ง entity **เฉพาะ `cards.create` (`env.data.id`) / `cards.move` (`env.data.cardId`)** เป็น `kanban.card` (R-S1.8h) · hand handler `kanban_create_card` (card.id) · `booking_create_appointment` (appointment id + unitId) · คำสั่งย้ายของทะเบียน (`kanban.cards.move`/`crm.deals.move`) ไม่มี out ⇒ entity = `payload.params.id` · ชนิดคืนของ handler คงเดิม (string)
- `snapshotBefore(tenantId, kind, payload)` — `kanban.cards.move` ⇒ `{systemId, columnId, position}` เดิม · `crm.deals.move` ⇒ `{systemId, stageId}` เดิม · อื่น null · `snapshotAfter(tenantId, kind, entity)` (R-S1.8c) — การ์ด ⇒ `{columnId}` · ดีล ⇒ `{stageId, stage}` (OPEN/WON/LOST) · นัด ⇒ `{status}` · เฉพาะ kind ใน UNDOABLE
- `recordAction(input: { tenantId; conversationId; kind; summary; approverId; proposalId?; planId?; entity?; before?; after?; executedAt }) → Promise<AiActionLog>` — `roomId` = `AiRoom.id` ของบทสนทนา (ห้องเดิม null) · `userId` = ผู้เปิดห้อง (`conversationCreatorOf` ชนิด member) ?? `approverId` ?? "system" · `module` = `kindAccessOf(kind).module` ?? `kind.split(".")[0]` · `summary` ผ่าน `maskPiiPatterns` ของ CRM (เรียกผ่าน facade `crmApi.maskPiiDeep` — ด่าน fitness ห้าม import ลึก · R-S1.8f) · `payload = { entity, before, after, planId?, ids }` — ids = ค่า id ของ payload ข้อเสนอ (key `id`/`…Id` ชั้นบน+params+input) · **ไม่เก็บ** คีย์ `isPiiKey` (`/taxId|lineId|lineUserId|promptpayId|phone|mobile|email|citizen|passport/i`) และค่าที่เป็นตัวเลขล้วน ≥ 9 หลัก หรือมี `@` (ทั้ง ids/before/after · R-S1.8e) · `undoableUntil = executedAt + 24 ชม.` เฉพาะ kind ใน `UNDOABLE_KINDS` ที่รู้ entity
- hook: `executeProposal` (หลัง dispatch สำเร็จ · approverId = ผู้กด) · `runKind(…, userId, summary?)` (planId จาก refId `plan-<id>-<i>` · `plans.ts` ส่ง `opts.userId` + **summary ของขั้น** — log ใช้สรุปของขั้น ไม่ใช่ชื่อแผน · R-S1.8g) · บันทึกล้ม = `logOps WARN` เท่านั้น ข้อเสนอยังสำเร็จ
- `undoAction(ctx: ConvCtx, logId, now?) → Promise<{ ok: true; note } | { ok: false; note }>` — 🔴 `now` ใช้เฉพาะทดสอบ — S1.14 ห้ามรับจากไคลเอนต์ · ลำดับ: มองไม่เห็น ⇒ "ไม่พบรายการ" (OWNER ทุกแถว · คนอื่น = ผู้สั่ง/ผู้อนุมัติของแถว หรือห้องที่ตัวเองเปิด/เป็นสมาชิก) → `undoneAt` มีแล้ว ⇒ "รายการนี้ย้อนไปแล้ว" → kind ไม่อยู่ใน registry / ไม่มี `undoableUntil` ⇒ "รายการนี้ย้อนไม่ได้" → `now > undoableUntil` ⇒ "เกิน 24 ชั่วโมง ย้อนไม่ได้แล้ว" → **แถวที่มี `roomId` (ห้องเลขา): ผู้ย้อนต้องเป็น OWNER/MANAGER** ("…ต้องให้เจ้าของหรือผู้จัดการเป็นผู้ย้อน" · R-K4) → `assertCan(คนกด, undoPermission)` ไม่ผ่าน ⇒ "คุณยังไม่มีสิทธิ์ย้อนรายการนี้…" → ระดับต่อระบบของเลขา (`kindAllowedByAccess` · ฐานล้ม = ปฏิเสธไทย) → claim `updateMany({id, undoneAt: null, undoableUntil ≥ now}) → {undoneAt, undoneById}` (ผู้ชนะเท่านั้น) → ตรวจสภาพปัจจุบัน + ลงมือ (ล้ม = คืน claim) → แถวใหม่ kind `undo:<kind>` (undoableUntil null · proposalId เดิม · ids.undoOf)
  - **ไม่ทับงานของคน (R-S1.8c/d)**: ย้ายการ์ด — คอลัมน์ปัจจุบัน ≠ `after.columnId` ⇒ "การ์ดถูกย้ายไปแล้ว…" · ย้ายดีล — `after.stage` หรือดีลปัจจุบันเป็น WON/LOST ⇒ "ดีลนี้ปิดการขายแล้ว…" · ขั้นปัจจุบัน ≠ `after.stageId` ⇒ "ดีลถูกย้ายไปขั้นอื่นแล้ว…" · ไม่มี `after` ⇒ ย้อนไม่ได้ · นัด — สถานะปัจจุบัน ≠ `after.status` ⇒ "สถานะของนัดเปลี่ยนไปแล้ว…" · ต้อง `status ∈ {PENDING, CONFIRMED}` และ `startAt > now` ไม่งั้น "สถานะ…"/"นัดเริ่มไปแล้ว…" · `appt.unitId` ต้องอยู่ใน unitAccess ของผู้ย้อน (`assertCan` + unitId)
  - **ลงมือ**: `kanban.cards.create` ⇒ op `cards.archive` · `kanban.cards.move` ⇒ op `cards.move` กลับคอลัมน์เดิม · `crm.deals.move` ⇒ op `deals.move` กลับขั้นเดิม — ทั้งสามผ่านทะเบียน op (`dispatchKanbanKind`/`crmApi.dispatchCrmKind` → `runOpAsActor`) ด้วยตัวตน+สิทธิ์ของผู้ย้อน (audit `after.actor = "ai-undo"` · `proposalId = undo-<logId>` · ป้ายส่งผ่านพารามิเตอร์ optional `auditActor` ของ `dispatchKanbanKind`/`CrmToolCtx`) ⇒ บทบาทบอร์ด/การมองเห็นดีล · completedAt (ออกจากคอลัมน์เสร็จ = ว่าง) · กิจกรรม · webhook ตรงของเดิม · **การ์ดย้อนไปท้ายคอลัมน์เดิม** (ไม่คืนตำแหน่งเดิมตรง — รับ G-5) · `kanban_create_card` (kind มือ ที่สร้างผ่าน service โดยไม่ผ่านบทบาทบอร์ด) ⇒ `kanbanSvc.archiveCard` ทางเดียวกับตอนสร้าง + ผู้ย้อนต้องเห็นบอร์ด (`boardRoleOf` ≠ null) · ย้อน create ของการ์ดที่ถูกแก้ทีหลัง = เก็บได้ตามเดิม · นัด ⇒ `setAppointmentStatus(CANCELLED)`
- `listLog(ctx, opts?: { day? (YYYY-MM-DD เวลาไทย); module?; roomId?; take? (≤ 200 · ปริยาย 50) }) → Promise<AiActionLog[]>` — OWNER ทุกแถว · **MANAGER/STAFF = เฉพาะแถวของห้องที่ตัวเองเปิด/เป็นสมาชิก + แถวที่ตัวเองเป็นผู้สั่ง/ผู้อนุมัติ** (MANAGER ไม่เห็นทั้งร้าน — หน้า B5) · เรียง `createdAt` desc · ยังไม่มี event `ai.action.*` (ต้อง consumer + 3 ทะเบียน — ใบที่ต่อ UI)
- หนี้ (RESOLUTIONS §K): purge `Ai*` ตอนลบร้าน/ลบผู้ใช้ → S1.25/S3 (G-12) · ประตู CRM (`crm.assist.*` · `crm.*` ที่มี `requestedByUserId`) ข้ามด่านผู้อนุมัติ + log (H-6 · หนี้เดิม)

### 5.10 teach.ts (แผน · S1.10) — ตีกลับ + สอน + แก้ก่อนอนุมัติ
- `rejectWithNote(ctx, proposalId: string, input: { note: string; remember: "JOB" | "RULE" }) → Promise<{ ok: true; memoryId?: string } | { ok: false; reason }>` — `updateMany PENDING → REJECTED` + ข้อความ USER ใหม่ในห้อง (ให้เลขาแก้) · RULE ⇒ `AiMemory(status = "PENDING")` รอ OWNER ยืนยัน · `recordOutcome(…REJECTED)`
- `editProposal(id: string, byUserId: string, payloadPatch: Record<string, unknown>) → Promise<{ ok: true } | { ok: false; reason }>` — Q9: เฉพาะ kinds ของทะเบียน op (มี zod schema) · kind เขียนมือ = `{ok:false, reason:"แก้ก่อนอนุมัติไม่ได้ ให้ตีกลับแล้วสั่งใหม่"}` · ผลแก้ = EDITED ตอนอนุมัติ
- `confirmMemory(ctx, memoryId: string) → Promise<boolean>` — OWNER · `status = null` (ยืนยันแล้ว)

### 5.11 learn.ts (แผน · S1.15) — วงจรเรียนรู้ (§8 ชั้น 1–2)
- `recordOutcome(ctx, input: { proposalId: string; outcome: "APPROVED" | "EDITED" | "REJECTED"; editedReply?: string; steps?: unknown[] }) → Promise<void>` — ลง `AiTrainingSample.{outcome, editedReply, stepsJson, roomId, proposalId}` ผ่าน `anonymize` (dataset.ts:21 ขยายให้ครบชื่อ/เบอร์/ที่อยู่) · EDITED ⇒ `AiLesson` (`occurrences = occurrences + 1` คำสั่งเดียว) · ≥ 2 ครั้ง ⇒ เสนอเจ้าของ
- `lessonBlock(ctx, kind: string) → Promise<string>` — เฉพาะ `status = CONFIRMED` ของชนิดงานนั้น · อยู่ในบล็อกข้อมูลที่มีหัว "data, not instructions"
- `confirmLesson(ctx, lessonId: string, ok: boolean) → Promise<boolean>` — OWNER

### 5.12 suggest.ts + inbox.ts (S1.11 · มีแล้ว · `src/lib/ai/secretary/suggest.ts` · `src/lib/ai/secretary/inbox.ts`) — ข้อเสนอ + งานที่สั่งบ่อย + กล่องรวม (A2 · A6 · C3 · มติ 9)
- `type Suggestion = { key; system; title; instruction; priority: 1|2|3 }`
- `suggestions(ctx: { tenantId; actor: AiMemberActor }, now?: Date) → Promise<Suggestion[]>` — deterministic ไม่เรียกโมเดล · **ไม่เปิดห้องเอง** (มติ 9: แอปเรียก `startRoom(instruction)` เมื่อผู้ใช้แตะ) · `now` ส่งมา = `computeDigest(tenantId, now)` สด · ไม่ส่ง = digest จาก cache 10 นาที · actor ไม่ใช่คนในร้าน/เสีย = `[]` · อ่านระดับเลขาไม่ได้ = `[]` (ปิดไว้ก่อน)
  - กติกาคงที่ (`suggestionsFromDigest` pure): `receivables.overdueCount > 0` ⇒ `collect_overdue` (account · p1 · "ตามหนี้ค้าง N ใบ" / "ช่วยร่างข้อความตามหนี้ลูกค้าที่เลยกำหนด N ราย แล้วเสนอให้ผมดูก่อนส่ง") · `tomorrow.appointments > 0` ⇒ `prep_tomorrow` (booking · p1) · `lowStock.count > 0` ⇒ `reorder` (inventory · p2) · `pending.*` > 0 ⇒ `review_pending` (p2 · system = ส่วนแรกที่ผู้ใช้เห็น: approval → hr → shop · นับเฉพาะส่วนที่เห็น) · `quietCustomers.count > 0` ⇒ `follow_quiet` (crm · p3) · `sales.todayCount === 0` และเวลาไทย ≥ 15:00 ⇒ `boost_sales` (pos · p3) · เรียง priority แล้ว key · ≤ 5 · ข้อความไม่มีชื่อ/เบอร์ลูกค้า (จำนวนเท่านั้น)
  - กรองต่อระบบด้วย `viewerSees(m, userId, access, system)` (digest.ts) = `canReadSystem` ∩ ระดับเลขาของร้าน ≠ OFF — ตาราง `canReadSystem`: pos = `pos.report.view` · account = `account.doc.view` · crm = `crm.contact.read` · inventory = `canReadInventory` · booking/shop = มีสาขาที่เปิดได้ (`actorBranches` ≠ []) · approval = `approval.request.decide` (rbac `evaluate`) · hr = `hr.leave.read` (ทุกตัวผ่าน `membershipCan` = ตัวตัดสินของโมดูลนั้น)
- `frequentInstructions(ctx: ConvCtx, take = 5) → Promise<{ instruction; count; lastAt }[]>` — `AiRoom` ของร้านนี้ที่ `startedById` = ผู้ใช้ (ห้องล่าสุด 500 ห้อง) · กุญแจกลุ่ม `instructionKey(title)` = NFC · ตัด "…" ท้าย · ตัวเล็ก · **ไม่นับช่องว่าง** (ภาษาไทยไม่เว้นวรรคระหว่างคำ — "สรุป ยอดขาย วันนี้" = "สรุปยอดขายวันนี้") · ≤ 60 ตัว · เฉพาะ count ≥ 2 · เรียง count desc แล้ว lastAt desc · `instruction` = ชื่อห้องล่าสุดของกลุ่ม (trim + ยุบช่องว่าง) · take ≤ 20
- `type InboxItem = { tenantId; tenantName; type: "proposal"|"plan"; id; roomId: string|null; conversationId; summary; kind?; risk?; createdAt; expiresAt: Date|null; canApprove; why? }` — **ไม่มี payload** · `summary` ผ่าน `crmApi.maskPiiDeep` (ปิดเบอร์/อีเมล · ≤ 200 ตัว) · แผนใช้ `AiPlan.title` เป็น summary (ไม่มี kind/risk)
- `inboxForUser(userId, opts?: { tenantId?; kind?: "proposal"|"plan"; take? }) → Promise<InboxItem[]>` — `Membership` ของผู้ใช้ที่ `acceptedAt ≠ null` (ทุกร้าน หรือร้านเดียว — ไม่ได้เป็นสมาชิก = `[]`) → ต่อร้าน: ข้อเสนอ/แผน `PENDING` ที่ `expiresAt > now` (ล่าสุด 200 แถว/ชนิด/ร้าน) ที่ผู้ใช้ **มองเห็น** = `canConfirmerSeeConversation(tenantId, m, userId, conversationId)` (ห้องตัวเอง · ห้องเลขาที่เป็นสมาชิก · OWNER ทุกห้องเลขา + ห้องที่ไม่ได้สร้างโดยคนในร้าน) และ `withinSight(visibleSinceForUser(…), createdAt)` (R-S1.6a) · ข้อเสนอที่ยังถูกจอง `WORKING#` = ไม่แสดง · เรียง createdAt desc · take ≤ 100 (ปริยาย 50) · ร้านที่ query ล้ม = ข้าม + `logOps WARN` (ไม่ล้มทั้งกล่อง)
  - `canApprove` (ข้อเสนอ) = `kindAllowedByAccess(access, kind)` ผ่าน และ (ห้องเลขา ? `approvalGate` ผ่าน — OWNER/MANAGER + `membershipCan` ของ kind : `actorCanConfirmKind`) · `why` = เหตุผลไทยจาก `approvalGate` (`whyApproval` · ห้องเลขาเท่านั้น) · (แผน) = ทุกขั้นผ่านระดับ + `actorCanConfirmKind` และ (ห้องเลขา) `planApprovalGate` = null · การอนุมัติจริงยังผ่าน `executeProposal`/`executePlan` ของร้านนั้น (ส่ง `x-tenant-id` ของร้านนั้น · ตรวจซ้ำทั้งหมด)
- `inboxCount(userId) → Promise<{ total; canApprove }>` — นับจากชุดเดียวกับ `inboxForUser` (เพดาน 100)

### 5.13 digest.ts (S1.16 · มีแล้ว · `src/lib/ai/secretary/digest.ts`) — ข้อมูลกิจการสด (§8 ชั้น 3)
- คำนวณสด (ไม่มีตาราง/cron) · deterministic ไม่เรียกโมเดล · ระบบไม่เปิด (ไม่มี `AppSystem` ประเภทนั้นที่ `active`) = ส่วนนั้น `null` · แต่ละส่วนครอบ try/catch แยก (ล้ม = `null` + `logOps WARN`) · `computeDigest` ไม่โยน
- `type Digest = { at; activeSystems: string[]; sales | null; quietCustomers | null; lowStock | null; receivables | null; tomorrow | null; pending }` (ฟิลด์ตามใบ S1.16)
- **นิยามตัวเลข** (เวลาไทย · "เที่ยงคืนไทย" = `bkkAt(now, 0, 0, n)`):
  - `activeSystems` — ประเภท `AppSystem.type` ที่ `active` (ไม่ซ้ำ · เรียงตามสร้าง)
  - `sales.{todaySatang,todayCount,d7*,d30*}` — `PosSale` ทุกระบบ POS ของร้าน · `docType = SALE` · `status ∈ {PAID, REFUNDED}` (VOIDED ไม่นับ) · ยอด = Σ(`grandTotalSatang` − `refundedSatang`) · จำนวน = จำนวนบิล · ช่วง `createdAt ∈ [เที่ยงคืนไทยของวันนี้ − (0 | 6 | 29) วัน, เที่ยงคืนไทยพรุ่งนี้)` — "7 วัน" = วันนี้ + 6 วันก่อน, "30 วัน" = วันนี้ + 29 วันก่อน (กติกาเดียวกับ `analyst.gatherBusinessSnapshot` · ต่างที่รวมทุกระบบ POS ไม่ใช่ระบบแรก)
  - `receivables.{count,totalSatang,overdueCount}` — `AccountDocument` ทุกระบบบัญชี · `direction = OUT` (ฝั่งลูกหนี้) · `status ∈ {AWAITING_PAYMENT, PARTIAL}` · `voidedAt = null` · ไม่นับ `BILLING_NOTE` (ใบวางบิลเรียกเก็บใบที่นับแล้ว — กติกาเดียวกับ `src/lib/modules/account/dashboard.ts` loadOpenDocs) · ค้าง = `grandTotal − paidTotal > 0` (count = ใบ · total = Σ ค้าง) · overdue = `dueDate < เที่ยงคืนไทยของวันนี้` (ไม่หักใบลดหนี้ — ต่างจากแดชบอร์ดบัญชีได้เมื่อมี CN)
  - `quietCustomers.{count,sample}` — `CrmContact` ทุกระบบ CRM · `archivedAt = null` · `createdAt < now − 30 วัน` · (`lastActivityAt = null` หรือ `< now − 30 วัน`) · sample ≤ 3 (ไม่เคยมีกิจกรรมก่อน แล้วกิจกรรมเก่าสุด) = `{id, name, days}` (days = วันเต็มนับจาก lastActivityAt ?? createdAt) · **ไม่อ่านเบอร์/อีเมล** · ร้านที่มีแต่ระบบสมาชิก (ไม่มี CRM) = `null`
  - `lowStock.{count,sample}` — `InvItem` ทุกระบบคลัง · `archivedAt = null` · `needsReorder(onHand, reorderPoint)` (reorderPoint > 0 และ onHand ≤ reorderPoint — กติกาเดียวกับ proactive `lowStock`) · sample ชื่อ ≤ 3 (เรียงชื่อ)
  - `tomorrow.{appointments,firstAt}` — ร้านมี `BusinessUnit.type = BOOKING` หรือ `AppSystem BOOKING` · `Appointment` ของร้าน `startAt ∈ [เที่ยงคืนไทยพรุ่งนี้, +1 วัน)` · `status ∉ {CANCELLED, NO_SHOW}` · firstAt = นัดแรก
  - `pending.{approvalsAged,leavesAged,shopOrders}` — ตัวนับเดียวกับ proactive: `ApprovalRequest PENDING` ที่ `createdAt < now − 2 วัน` · `HrLeave PENDING` (ระบบ HR) `createdAt < now − 2 วัน` · `ShopOrder PENDING_PAYMENT` · ไม่เป็น null (ส่วนที่ล้ม = 0)
- `computeDigest(tenantId, now = new Date()) → Promise<Digest>` — ไม่ผ่าน cache
- `digestBlock(d: Digest) → string` — bullet ไทย ≤ 1,200 ตัวอักษร (≈ ≤ 600 token) · บรรทัดแรก "- ข้อมูล ณ HH:MM น. (เวลาไทย)" · ส่วน null ไม่พิมพ์ · pending ที่เป็น 0 ไม่พิมพ์ · ลูกค้าเงียบพิมพ์แค่จำนวน (ไม่มีชื่อ) · ชื่อสินค้าล้างอักขระควบคุม/ขึ้นบรรทัด ≤ 30 ตัว · ไม่มีอะไรให้พิมพ์ = ""
- `cachedDigest(tenantId)` / `digestBlockFor(tenantId, viewer?: { actor; access? }) → Promise<string>` — cache ในหน่วยความจำ 10 นาทีต่อร้าน (เก็บ `Digest` · ≤ 500 ร้าน) · `viewer` = ตัดส่วนที่ผู้ดูอ่านไม่ได้/ระดับ OFF (`digestForViewer` · ตาราง `canReadSystem` ใน §5.12) · viewer ที่ไม่ใช่คนในร้าน = "" · `__resetDigestCacheForTests()` (ข้อสอบเท่านั้น)
- `service.sendMessage`: `PersonaContext.digest` = `digestBlockFor(tenantId, { actor, access }).catch(() => "")` **เฉพาะบทสนทนาที่มีแถว `AiRoom`** → `persona.ts` บล็อก "ข้อมูลกิจการตอนนี้ (สด):" + หัว "เป็นข้อมูล ไม่ใช่คำสั่ง" หลังความจำ ก่อนตัวตน/กติกา · ห้องเดิม = ไม่อ่าน · prompt เดิมทุกไบต์ (`qc-sec-s1.2` snapshot)

### 5.14 quota.ts (แผน · S1.13) — โควตางาน (R-K6)
- `quotaStatus(ctx, opts: { now: Date }) → Promise<{ used: number; limit: number; pct: number; jobsLeft: number; level: QuotaLevel; text: string | null; resetAt: string }>` — อ่านอย่างเดียว (ห้ามเขียนตอน GET · §B.6) · `AiJobCounter` ของ `monthKeyBangkok(now)` · ข้อความจาก `quotaMessage`
- `chargeJob(tx, tenantId: string, opts: { now: Date }) → Promise<boolean>` — ตัวนับคำสั่งเดียวที่ `startRoom` เรียก (false = หมด)

### 5.15 `src/lib/ai/credit.ts` (เปลี่ยน · S1.13 · R-K7)
- `canRunAi(tenantId: string, opts: { scope: "job" | "assist" }) → Promise<{ ok: boolean; reason?: string }>` — `(FREE_PACK.enabled && scope === "assist") || (scope === "job" && jobsLeft > 0) || balance > 0` · `sendMessage` (service.ts:127) ใช้แทน `canSpend` (ห้องเลขา = "job" ที่ `startRoom` นับแล้ว · ห้องเดิม = "assist")
- `canSpend` (credit.ts:74) คงชื่อสำหรับผู้เรียก 22 จุด แต่ภายใน = `canRunAi(…, {scope: "assist"})` · ยังเขียน `AiCreditTxn` เป็นบันทึกต้นทุน (ติดลบได้ตาม `chargeUsage` เดิม)
- `ensureWallet` (:34) ไม่สร้างแถว GRANT เมื่อ `tenant.createdAt >= SECRETARY_LAUNCH_AT` · `GET /api/mobile/usage` เปลี่ยนเป็น `canSpendPeek` (:85 · อ่านอย่างเดียว)

### 5.16 `src/lib/ai/provider.ts` (เปลี่ยน · S1.20 · มีแล้ว · R-K18 + R-K18b)
- `ANTHROPIC_MODEL_IDS: Readonly<Record<string, string>>` — `{ [FAST_MODEL]: "claude-haiku-4-5", [SMART_MODEL]: "claude-sonnet-5" }` · `FAST_MODEL`/`SMART_MODEL` คงเป็น slug OpenRouter (R-K18b · `service.ts` เทียบ `=== FAST_MODEL`) · `pickModel` คงคืน slug เดิม (`qc-ai-brain` ไม่เปลี่ยน)
- `toAnthropicModelId(slugOrId: string) → string` — pure · ตาราง → id · ขึ้นต้น `claude-` คืนเดิม · อื่น ๆ ตัด `anthropic/` + แทน `.` ด้วย `-`
- `buildAnthropicRequestBody(model, messages: AiChatMessage[], tools: AiToolDef[] | undefined, opts?: { maxTokens? }) → Record<string, unknown>` — pure · `system` block เดียว + `cache_control` · tool_use/tool_result (ผลที่ติดกันรวม user message เดียว) · รูป base64/url · tools `input_schema` + `cache_control` ตัวสุดท้าย · `max_tokens` ปริยาย 1024 · ไม่มีพารามิเตอร์สุ่ม/thinking
- `parseAnthropicReply(json: unknown, fallbackModel: string) → AiReply` — pure · `tokensIn = input + cache_creation_input + cache_read_input` · `tokensOut = output` · refusal ⇒ throw "AI ปฏิเสธคำขอนี้ (…)" · ว่าง ⇒ throw "AI provider ตอบว่าง"
- `class AnthropicProvider(key: string, model: string, deps?: { fetchImpl?: typeof fetch; version?: string }) implements AiProvider` — `readonly model` · `chat(messages, opts?: { maxTokens?; tools? }) → Promise<AiReply>` · `POST https://api.anthropic.com/v1/messages` (`x-api-key` · `anthropic-version: 2023-06-01`) · `!res.ok` ⇒ throw `AI provider <status>: …`
- `resolveProvider(tier = "smart") → AiProvider | null` — `SHARK_AI_MOCK=1` ⇒ Mock · `AI_PROVIDER=anthropic` ⇒ `SHARK_ANTHROPIC_KEY` (ไม่มี ⇒ null) + `toAnthropicModelId(SHARK_AI_MODEL ?? FAST/SMART ตาม tier)` · อื่น ๆ ⇒ OpenRouter ทางเดิม · `pricing.priceOf` จับ id ตรงด้วย substring เดิม (ราคา sonnet ยังเป็นค่าเก่า — หนี้ S3a.2)

### 5.17 `src/lib/ai/scheduled.ts` (เปลี่ยน · S1.9 · มีแล้ว · R-K5 · R-K8b)
- `FREQUENCIES = ["DAILY","WEEKLY","MONTHLY"]` · `CHANNELS = ["push","room"]` · `TaskInput = { instruction; hourBkk; ownerUserId?; frequency?; days?; channels? }`
- `createTask(ctx, input: TaskInput) → Promise<{ id }>` — ไม่มี `ownerUserId` = ทางเดิม (cap 10 · ไม่ตั้ง frequency) · มี `ownerUserId` = งานของคนตั้ง: frequency ปริยาย DAILY (แปลก = throw ไทย) · WEEKLY ⇒ `days` ⊆ 0–6 ไม่ว่าง (0 = อาทิตย์) · MONTHLY ⇒ `days` ⊆ 1–31 ไม่ว่าง · DAILY ⇒ `days = []` · `channels` ⊆ CHANNELS ปริยาย `["push","room"]` · ผู้ตั้งต้องมี Membership `acceptedAt ≠ null` ของร้านนี้ · เพดาน `FREE_PACK.scheduledMax` ต่อร้าน (ข้อความไทยบอกเพดาน) — ทุกข้อผิดพลาด = throw ไทย ไม่มีแถว
- `isDue(task, now) → boolean` (pure · เวลาไทยผ่าน `bkkParts`) — active · `hourBkk` = ชั่วโมงไทย · `lastRunDay` ≠ วันไทย · DAILY/null ทุกวัน · WEEKLY วันในสัปดาห์ไทย ∈ days · MONTHLY วันที่ไทย ∈ days (วันที่ 31 ในเดือนที่มี 30 วัน = ไม่รัน)
- `describeFrequency(frequency, days) → string` (pure · ไทย) — "ทุกวัน" · "ทุกสัปดาห์ (วันจันทร์)" · "ทุกเดือน (วันที่ 1, 15)"
- `runScheduledTasks(now: Date, deps?: { provider?; post? }) → Promise<number>` — ไม่ throw · แถว `ownerUserId = null` = ทางเดิมทุกตัวอักษร (AppNotification + `sendPushToTenant` · mark หลังรัน) · แถวมี `ownerUserId`: (1) `isDue` (2) claim `updateMany({ id, active: true, OR: [{lastRunDay: null}, {lastRunDay: {not: today}}] }) → { lastRunDay: today }` count 0 = ข้าม (X5) (3) Membership สด (`acceptedAt ≠ null`) ไม่มี ⇒ `logOps WARN "scheduled-skip"` + ข้าม (4) `startRoom({ tenantId, actor: aiMemberActor(owner) }, { instruction, systems: [] }, now)` — นับงาน 1 · โควตาหมด ⇒ จด + ข้าม (5) `enqueueRoomJob(room, startRoom.messageId, owner)` → `runRoomJobs({ provider, post, now, limit: 1 })` (worker เรียกโมเดลด้วยสิทธิ์ผู้ตั้ง · push ถึงผู้เปิดห้อง ∪ สมาชิก · `data.link = /secretary/room/<id>`) · ไม่สร้าง AppNotification · ผลเขียน = ข้อเสนอในห้อง · claim แล้วข้าม (ผู้ตั้งถูกถอน/โควตาหมด) = ไม่ลองซ้ำในวันเดียวกัน
- `listTasks(ctx)` คืนทุกคอลัมน์ (รวม `ownerUserId` `frequency` `days` `channels`)
- tool `schedule_task`: params ไม่บังคับ `frequency` (enum) + `days` (int[]) · ไม่ระบุ = ข้อเสนอแบบเดิม · `dispatch(ai_schedule_task)` ส่ง `ownerUserId: userId ?? undefined` + `frequency` + `days` · note บอกความถี่
- หนี้: `channels` บันทึกแล้วแต่ worker ยัง push ทุกครั้ง (`["room"]` อย่างเดียวยังได้ push) — ตัวกรองต้องแก้ `worker.ts` (นอกใบ S1.9)

### 5.18 `src/lib/ai/conversation-owner.ts` (เปลี่ยน · S1.4 · R-K1 · ยัง pure · เพิ่มเท่านั้น)
- `type ConvSight = { own: string | null; ownerExtras: boolean; memberOf?: ReadonlySet<string>; tenantRooms?: boolean }` — สองช่องใหม่ optional · ไม่มี = กติกาเดิมทุกตัวอักษร
- `withRoomSight(s, extra: { memberOf?: Iterable<string>; tenantRooms?: boolean }) → ConvSight` — pure · คืนค่าใหม่
- `canSeeConversationId(s, id)` — เดิม + `s.memberOf?.has(id)` (string-only: `tenantRooms` ตัดสินไม่ได้ ⇒ ไม่นับ)
- `canSeeConversation(s, row: { id; room?: { id } | null }) → boolean` — `canSeeConversationId || (s.tenantRooms && !!row.room)`
- `visibleConversationWhere(s)` — เดิม + `OR { id: { in: [...memberOf] } }` + (tenantRooms) `OR { room: { isNot: null } }` · sight ไม่มีสองช่อง = รูปเดิม
- OWNER เห็นห้องของคนอื่น **เฉพาะห้องที่มีแถว `AiRoom`** — ห้อง `u~` เดิมที่ไม่มี AiRoom ยังไม่มีใครเห็น (baseline `qc-ai-*` คงเดิม) · `sightOf`/`sightOfConfirmer` ไม่เปลี่ยน (ตัวอ่าน DB เติมผ่าน `withRoomSight`)

### 5.19 phone-auth.ts (แผน · `src/lib/core` · S1.19 · R-K9/K10) — ไม่ import env กลาง (แบบ `sms.ts`)
- `requestPhoneOtp(phone: string, ip: string | null, opts?: { now?: Date }) → Promise<{ ok: true; resendAfterSec: number } | { ok: false; reason: string }>` — `toE164Thai` · 6 หลัก · หมดอายุ 10 นาที · ผิดได้ 5 ครั้ง · ขอซ้ำทุก 60 วิ · rate-limit ต่อเบอร์ + ต่อ IP (`checkRateLimitDb` rate-limit-db.ts:38) · เก็บ `codeHash` เท่านั้น · `SMS_PROVIDER=mock` เขียนรหัสลง `logOps` (QC)
- `verifyPhoneOtp(phone: string, code: string, opts?: { now?: Date }) → Promise<{ ok: true; userId: string | null } | { ok: false; reason: string }>` — `consumedAt` claim คำสั่งเดียว · `userId = null` = เบอร์ใหม่ (แอปไปจอสมัคร)
- `registerWithPhone(input: { phone; name; email; otpTicket }) → Promise<{ ok: true; userId } | { ok: false; reason }>` — `prisma.user.create({email, name})` + `UserPhone` ใน tx เดียว · อีเมลซ้ำแต่เบอร์ใหม่ ⇒ "อีเมลนี้มีบัญชีแล้ว เข้าด้วยอีเมลแล้วผูกเบอร์" (R8)
- `bindPhone(userId: string, phone: string, code: string) → Promise<{ ok: boolean; reason? }>` — บัญชีเดิมผูกเบอร์ · `GET /api/mobile/me` เพิ่ม `phone` (nullable)

### 5.20 `src/lib/support/service.ts` (เปลี่ยน · ฝั่งร้าน · S1.17 · มีแล้ว · R-K12)
- `CASE_CATEGORIES = ["secretary_wrong", "bug", "question", "billing", "feature", "other"]` (ชิปหมวดของจอ H1)
- `openCaseFromApp(ctx: { tenantId }, input: { userId; subject; body; attachments?: Attachment[]; category?: string; roomId?: string | null }) → Promise<{ id; caseNo }>` — `createCase` เดิม (caseNo race-safe + ข้อความแรก + ไฟล์แนบที่ผ่าน `cleanAttachments`) แล้วตั้ง `source = "APP"` · `category` (ไม่อยู่ใน `CASE_CATEGORIES` ⇒ `"other"`) · `roomId` = ห้องของร้านนี้ที่ผู้แจ้งเห็น (ผู้เปิดห้อง ∪ สมาชิก ∪ OWNER ที่รับแล้ว) ไม่งั้น `null` (ไม่บอกว่ามีอยู่) · **ไม่ตั้ง `conversationId`** · หมวด `secretary_wrong` + ห้อง ⇒ best-effort `recordFeedback({ conversationId: room.conversationId, userText: subject, replyText: body, rating: "DOWN", note: "help:<caseId>" })` (anonymize ใน recordFeedback · ล้มไม่ throw)
- `listCasesForUser(ctx, userId, role: Role, take = 50 (≤ 200)) → Promise<CaseMeta[]>` — `openedByUserId = userId` หรือ `role === "OWNER"` (ทั้งร้าน รวมเคส `ai-assistant` เดิม) · meta unread เหมือน `listMyCasesWithMeta` (ข้อความ PLATFORM ใหม่กว่า `shopLastReadAt` · 2 query) · `listMyCases`/`listMyCasesWithMeta`/`unreadCaseTotal` เดิมคงไว้ให้เว็บ
- `unreadCaseTotalForUser(ctx, userId, role) → Promise<number>` — ขอบเขตเดียวกับ `listCasesForUser` (นับเคส RESOLVED ที่ยังไม่อ่านด้วย)
- `setResolvedByShop(ctx, userId, role, caseId) → Promise<boolean>` — เคสที่ผู้ใช้เห็น ⇒ `status = RESOLVED` · ไม่เห็น/ไม่มี/ร้านอื่น ⇒ `false`
- หมายเหตุ: `shopLastReadAt` เป็นค่าเดียวต่อเคส (OWNER เปิดอ่าน = ผู้แจ้งก็เห็นว่าอ่านแล้ว) — เหมือนเว็บเดิม

### 5.21 `src/lib/platform/support.ts` (เปลี่ยน · ฝั่งแพลตฟอร์ม · S1.17 · มีแล้ว)
- `listAllCases(filter?: { status?; source?: string; category?: string; assigneePlatformUserId?: string }) → Promise<CaseWithTenant[]>` — ไม่ส่งตัวกรอง = เดิม
- `assignCase(pu: PlatformUser, caseId: string) → Promise<boolean>` — "รับเรื่อง" H4 · `assigneePlatformUserId = pu.id` + `PlatformAuditLog` `support.assign` · ไม่มีเคส = `false`
- `caseDetail(caseId)` — แถวเคสมี `source`/`category`/`roomId` ติดมาด้วย (คอลัมน์ของ S1.1)
- `addPlatformMessage(pu, caseId, body, deps?: { post? })` — ข้อความ PLATFORM + `PENDING` + assignee (เดิม) · แทรก `🛟 ทีมงาน:` ลงห้อง AI **เฉพาะ `source !== "APP"` และมี `conversationId`** (bridge เดิม · `qc-help-v2`/`qc-mobile-help` เขียว) · push: เคส APP ⇒ (ผู้แจ้งยังเป็นสมาชิกที่รับแล้ว) `notifyUser(openedByUserId, tenantId, "help", { title: "ทีมงานตอบกลับแล้ว", body: ≤ 80, data: { link: "/help/<caseId>", caseId } })` · เคสอื่น = เดิม (`sendPushToUsers` ผู้สร้างห้อง/OWNER · `data.conversationId`)
- "ระงับเลขาของร้าน" = `setAccess` ทุกโมดูล OFF (ไม่มีธงใหม่ · ไม่ใช้ `suspendTenant` :140) — ใบ S2.16

### 5.22 `src/lib/mobile/tenants.ts` (เปลี่ยน · S1.25)
- `createTenantFromApp(userId: string, input: { name: string; type: string; systems: string[] }) → Promise<{ tenantId; roomId }>` — ห่อ `createTenantForUser` (:8) + เปิดระบบที่เลือก (`applyBlueprint` ทางเดิม) + `startRoom` ห้องแรก "ตั้งค่าเริ่มต้น" (ไม่นับงาน: `couldNotAct`/งานต้อนรับ)

### 5.23 invite.ts (แผน · `src/lib/mobile` · S1.25 · R-K11 + Q10)
- `createInvite(ctx, input: { name; phone; role: "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, boolean> }) → Promise<{ ok: true; inviteId } | { ok: false; reason }>` — OWNER/MANAGER (`settings.staff.write` staff/service.ts:60) · ตรวจด้วย `validatePermissionInput` (:155) · `canAssignRole`/`canGrantUnitAccess`/`canGrantPermission` (rbac.ts:94–112) · รหัสสุ่ม → `codeHash` · หมดอายุ 7 วัน · `sendSms` ลิงก์ `https://shark.in.th/i/<code>`
- `acceptInvite(userId: string, phone: string, opts: { now: Date }) → Promise<{ accepted: string[] }>` — หลัง `verifyPhoneOtp` · หา `StaffInvite` เบอร์ตรง + ยังไม่หมดอายุ + ยังไม่รับ → สร้าง `Membership(acceptedAt = now)` ผ่านตัวตรวจชุดเดียวกับ `updateStaffAccess` ใน tx เดียว · claim `updateMany({acceptedAt: null})` · ไม่ต้องมี HrEmployee · event `staff.invite.accepted`
- `revokeInvite(ctx, inviteId: string) → Promise<boolean>`
- `moduleLevel(permissions: Record<string, unknown>, module: string) → "OFF" | "VIEW" | "USE"` — pure · OFF = ไม่มีคีย์ของโมดูล · VIEW = มีเฉพาะคีย์ลงท้าย `.read`/`.view` · USE = `<module>.*` หรือมีคีย์เขียน ≥ 1
- `setModuleLevel(permissions: Record<string, unknown>, module: string, level: "OFF" | "VIEW" | "USE") → Record<string, boolean>` — pure · ทางกลับของ `moduleLevel` · แชท 3 ระดับ = ไม่เห็น / ดูได้ (`chat.conversation.read`) / ตอบได้ (+ `chat.message.send`)

### 5.24 routing.ts (S1.24 · มีแล้ว · `src/lib/modules/chat/routing.ts` + `sla-job.ts` · R-K14 · R-K8b · รอบ 2 R-S1.21a–i)
- คีย์สิทธิ์ทั้งโมดูลแชทที่ด่านใช้ร่วม = `src/lib/modules/chat/guard-keys.ts` (pure) re-export จาก `guard.ts`: `CHAT_READ_ACTION` `CHAT_REPLY_ACTION` (= `chat.message.send`) `CHAT_ASSIGN_ACTION` `CHAT_SET_STATUS_ACTION` `CHAT_MARK_READ_ACTION` `CHAT_CUSTOMER_LINK_ACTION`
- `loadTeam(tenantId) → Team` (Membership ที่รับแล้ว + เวร · โหลดครั้งเดียว) · `respondersOf(team, unitId)` (pure) · `eligibleResponders(tenantId, systemId, unitId) → { userId; name; role; onDuty }[]` = ∩ `evaluate(m, CHAT_REPLY_ACTION)` ∩ `canAccessConvUnit` · `canRespond(tenantId, userId, unitId)` (ใช้กับ `assign(…, { requireReplyPermission: true })`)
- `listRules` · `setRules(tenantId, by, systemId, rules[])` — OWNER/MANAGER (อื่น `ForbiddenError`) · mode/ช่องทางผิด / > 20 ข้อ ⇒ throw ไทย · แทนที่ทั้งชุดใน tx
- `assignIncoming({ tenantId, systemId, conversationId, now?, deps?: { notify?, post?, team? } })` → `{ assigned; reason }` — เรียกจาก `receiveInbound`/`receiveExternalInbound` (ห้องยังไม่มีผู้ดูแล · best-effort) และจาก sweep · กฎแรกที่เปิด+ตรงช่องทางและหาคนได้ชนะ · นอกเวลาทำการ ⇒ off_hours · ROUND_ROBIN / LAST_ASSIGNEE / OWNER · ไม่มีใคร ⇒ OWNER คนแรกที่**เห็นหน่วย** (owner_fallback) · เขียนด้วย `assign(…, { onlyIfAssignee: null })` (updateMany มีเงื่อนไข — มีคนรับตัดหน้า = ของเขาชนะ, reason already) · สำเร็จ ⇒ push "ได้รับห้อง" (`?e=assigned` · ค่าตั้งของผู้รับ)
- `callHelper` · `handoff({…, byCanAssign?})` — handoff ทำได้เฉพาะผู้ดูแลปัจจุบัน / ผู้ช่วยในห้อง / ผู้มีคีย์ assign (อื่น `{ ok:false, forbidden:true }` → 403) · ส่งให้ตัวเองไม่ได้ · ผู้รับต้องตอบได้ในหน่วย · บันทึกภายใน 🙋/🔁 + push
- `setShift(tenantId, userId, onDuty, now?)` — กดเข้าเวรซ้ำ = แถวเดิม · `listOnDuty(tenantId, onlyUserIds?)` (route กรองด้วยผู้ตอบได้ในหน่วยที่ผู้ดูเห็น)
- `sweepChatSla(now?, deps?)` — งาน `chat.sla` ทุก 5 นาที · ทีมโหลดครั้งเดียวต่อร้าน · (0)+(1) ห้อง OPEN ที่ไม่มีผู้ดูแลจริง (null หรือผู้ดูแลตอบไม่ได้แล้ว — ถูกถอน/หลุดหน่วย) รอ ≥ `unassignedAlertMin` **เฉพาะในเวลาทำการ**: ห้องว่าง ⇒ `assignIncoming` ก่อน · ไม่ได้ ⇒ เตือน OWNER/MANAGER ที่ตอบได้ในหน่วย · (2) ผู้ดูแลที่ตอบได้ยังไม่ตอบแรก ≥ SLA ⇒ เตือน · ≥ 2× ⇒ ย้ายให้ MANAGER (ห้องน้อยสุด) ไม่มีค่อย OWNER ด้วย `onlyIfAssignee: <ผู้ดูแลเดิม>` · กันซ้ำ = บันทึกภายใน clientMessageId `sla:unassigned|first_response|escalated:<เวลาเริ่มรอ ms>` และ query กรองห้องที่มีโน้ตแล้วตั้งแต่ต้น (ไม่กินเพดาน 200 ห้อง) · ดูย้อนหลัง 24 ชม.

### 5.25 `src/lib/core/push.ts` (เปลี่ยน 2 hunk · S1.23 · มีแล้ว · R-K20)
- `type PushMsg = { title; body; data?; badge?: number }` · payload Expo ใส่ `badge` **เฉพาะเมื่อผู้เรียกส่งมา** (ไม่ส่ง = payload เดิมทุกไบต์) · `deliverBatch` อ่านผลของ transport ได้ทั้ง array / `{ tickets }` / `{ data }` (ตัวจริงคืน array — ข้อสอบฉีดแบบ `{ tickets }`)
- `sendPushToChatStaff(args, deps?: { post?; prefs?: (userId) => Promise<"ALL" | "ASSIGNED" | "OFF"> })` — หลัง `selectChatNotifyRecipients` เดิม กรองด้วยค่าตั้ง `inbox` (`notifyModesFor` 1 query · ปริยายจาก `AiNotifyPref`): OFF ตัด · ASSIGNED เหลือเฉพาะผู้ดูแลเธรด (`assigneeUserId` ที่ส่งมา ?? ของเธรด) · ไม่มีแถว = ผู้รับเดิม · อ่านค่าตั้งไม่ได้ = ไม่กรอง + log · `data` = `{ link: "/inbox/<conversationId>", ...data ของผู้เรียก }` (คีย์เดิมคงอยู่ · link ของผู้เรียกชนะ) · ไม่มี badge (ข้อความเดียวหลายคน)
- push ห้องเลขา/ช่วยเหลือ = `sendPushToUser(userId)` ไม่กรอง tenant (A6) ผ่าน `notifyUser` (§5.25a)

### 5.25a notify.ts (S1.23 · มีแล้ว · `src/lib/ai/secretary/notify.ts`) — ค่าตั้งแจ้งเตือน · badge · กันสแปม (R-K20)
- `NOTIFY_KINDS = ["inbox", "approval", "room", "help"]` · `NOTIFY_MODES = ["ALL", "ASSIGNED", "OFF"]` · `NOTIFY_SPAM_WINDOW_MS = 60_000`
- `getNotifyPrefs(userId, tenantId?) → Promise<Record<NotifyKind, NotifyMode>>` — แถวของร้านชนะแถว `tenantId = null` (ทุกร้าน) · ปริยาย ALL · ค่าที่ไม่รู้จักถูกเมิน · 1 query (`resolveNotifyPrefs` = ส่วน pure)
- `setNotifyPref(userId, { tenantId?; kind; mode }) → Promise<prefs>` — ชนิด/โหมดผิด ⇒ throw ไทย · update-then-create (unique ที่มีคอลัมน์ null ใช้ upsert ไม่ได้ · P2002 ⇒ update ซ้ำ) · คืนค่าที่มีผลในร้านนั้น
- `notifyModesFor(tenantId, userIds, kind) → Promise<Map<userId, mode>>` — เฉพาะคนที่มีแถว (ตัวกรองของ `sendPushToChatStaff`)
- `badgeTotalFor(userId, tenantId) → Promise<number>` — ไม่มี Membership ที่รับแล้ว = 0 · (1) ห้องเลขาที่ผู้ใช้เปิด/เป็นสมาชิก (ไม่นับ OWNER-ทุกห้อง · ≤ 500 ห้องล่าสุด) ที่มีคำตอบเลขา (ไม่นับข้อความระบบ) ใหม่กว่า `lastReadAt` — สมาชิก seeHistory=false นับเฉพาะเมื่อคำตอบล่าสุด ≥ `addedAt` + (2) `unreadCount` ของทุกระบบ CHAT ที่ active ถ้ามีสิทธิ์ `chat.conversation.read` (`evaluate`) + (3) `unreadCaseTotalForUser`
- `notifyUser(userId, tenantId, kind, msg: { title; body; data: { link; … } }, deps?: { post?; now?; assigneeUserId? }) → Promise<{ sent; skipped: "pref" | "spam" | "none" | null }>` — **ไม่ throw** · OFF ⇒ `pref` · `inbox` + ASSIGNED ⇒ ส่งเฉพาะ `deps.assigneeUserId === userId` (ASSIGNED ของชนิดอื่น = ALL) · คีย์ `${userId}:${link}` ส่งจริงไปแล้วภายใน 60 วิ ⇒ `spam` (Map ในหน่วยความจำต่อโปรเซส · นับจากครั้งที่ส่งจริง · จองก่อนส่ง) · `badge = badgeTotalFor` (อ่านไม่ได้ = ไม่ใส่) · `sendPushToUser(userId, { ...msg, badge }, { post })` · ไม่มีเครื่อง/Expo ไม่รับ ⇒ `none` · อ่านค่าตั้งไม่ได้ = ALL
- ผู้เรียก: worker `pushRoom` (kind `room`) · `addPlatformMessage` เคส APP (kind `help`) · `sendPushToChatStaff` ใช้ `notifyModesFor` (kind `inbox`) · `approval` = ยังไม่มีผู้เรียก (ใบ S2.6/S1.14)

### 5.26 customer-context.ts (S1.22 · มีแล้ว · `src/lib/ai/secretary/customer-context.ts`) — บริบทลูกค้าในห้องเลขา (แบบ §10 (3) · X8)
- `customerContextOf(tenantId, { chatConversationId; contactId? }, actor: AiMemberActor) → Promise<CustomerContext | null>` — มองไม่เห็น = null (404-not-403): actor ต้องเป็น member ของร้านนี้ · `evaluate(m, {chat, CHAT_READ_ACTION})` (ค่าคงที่จาก `chat/notify.ts` — `guard.ts` ลาก env) · ห้องของร้าน · OWNER ∨ `canAccessConvUnit(unitAccess, conv.unitId)` · `contactId` ที่ส่งต้องตรงห้อง
  - `CustomerContext = { contactId; chatConversationId; displayName; channel; tags; assignee (ชื่อผู้ดูแล | null); linked: { member?: {tier; points:null}; deals? ≤5; openDocs? ≤5 }; recent ≤10 (IN/OUT ไม่รวม isInternal · ≤200 ตัว · เก่า→ใหม่) }`
  - linked ตรวจสิทธิ์ของผู้ถามเอง: member = `member.customer.read` + `getLinkedMember` · deals = CRM ใหม่ (`crmPanelTarget` + `crmUiVersion === 2`) + `briefFor` ด้วย `partyId` ของผู้ติดต่อ · openDocs = `account.doc.view` + `listDocsByParty` สถานะ AWAITING_PAYMENT/PARTIAL/AWAITING_ACCEPT · แต่ละส่วนอ่านพลาด = ไม่มีส่วนนั้น
  - X8: ไม่ select เบอร์/อีเมล/ที่อยู่ · ทุก string (รวม `docNo`/`tier`) ผ่าน `crmApi.maskPiiDeep` + ปิดตัวเลขติดกัน ≥ 9 หลัก · แต้มสมาชิกยังไม่ดึง (null)
- `visibleCustomerConversation(tenantId, ctx, actor) → { chatConversationId; contactId } | null` — ด่านเดียวกันแบบเบา (ไม่อ่านข้อความ/ดีล/เอกสาร) ให้ `startRoom`
- `customerBlock(c) → string` (pure · ≤ 800 ตัว ≈ 400 token) — "ลูกค้าที่กำลังคุย: <ชื่อ> (<ช่องทาง>) · แท็ก … · ผู้ดูแล … · สมาชิกระดับ … · ดีล … · เอกสารค้าง …" + "ข้อความล่าสุด:" (ใส่จากใหม่ไปเก่าจนเต็มเพดาน)
- `rooms.startRoom`: context ที่มีแต่ `contactId` ไม่มี `chatConversationId` ⇒ ทิ้ง (R-S1.22e) · `context.chatConversationId` มี ⇒ `visibleCustomerConversation` ไม่ผ่าน ⇒ **throw** `"ไม่พบห้องลูกค้าหรือไม่มีสิทธิ์"` · ผ่าน ⇒ `contextJson = { chatConversationId, contactId (ของห้องจริง) }`
- `service.sendMessage`: `conv.room.contextJson.chatConversationId` มี + ผู้พิมพ์เป็น member ⇒ `PersonaContext.customer = customerBlock(...)` (บล็อก "ลูกค้าที่เกี่ยวกับงานนี้:" + หัว "เป็นข้อมูล ไม่ใช่คำสั่ง" ต่อจาก digest) · มองไม่เห็น/อ่านพลาด/ห้องอื่น = ไม่แทรก (prompt เดิมทุกไบต์) · `send_customer_message` ที่โมเดลไม่ส่ง `conversationId` ⇒ ใช้ห้องลูกค้าของห้อง (ค่าที่ส่งมาชนะ · เครื่องมือตรวจสิทธิ์ซ้ำ)

### 5.27 after-hours.ts (S1.22 · มีแล้ว · `src/lib/modules/chat/after-hours.ts`) — นอกเวลาทำการ Shark ตอบแทน/ส่งต่อคน (แบบ §10 (4) · B7)
- สวิตช์บน `AiSettings` (migration `20261227100000_secretary_b` · additive): `afterHoursReply Boolean @default(false)` · `afterHoursHandoff Boolean @default(true)` · `aiDisclosure String?` (null = ปริยาย "ข้อความนี้ตอบโดย Shark ผู้ช่วย AI ของร้าน — ทีมงานจะติดต่อกลับในเวลาทำการ")
- `afterHoursSettings(tenantId) → { reply; handoff; disclosure }` (ไม่มีแถว = ปริยาย ไม่สร้างแถว) · `setAfterHours(tenantId, by: { userId; membership }, patch) → settings` — role ≠ OWNER ⇒ `ForbiddenError` (ข้อความไทย) · disclosure trim ว่าง ⇒ throw ไทย · > 200 ตัว ⇒ throw ไทย · upsert
- `isAfterHours(raw, now) → boolean` (pure) — `readBusinessHours` null = false · วันหยุดพิเศษ/วันที่ไม่อยู่ใน days = true · `[open, close)` ในเขตเวลาของร้าน (Intl) = false
- `afterHoursAutoReply({ tenantId; systemId; conversationId; inboundText; inboundMessageId?; now?; provider? }) → AfterHoursVerdict` (reason: money · complaint · human · unknown · answered · disabled · no_window · in_hours) ลำดับ (R-S1.22b): reply ปิด ⇒ `disabled` · ไม่ตั้งเวลา ⇒ `no_window` · ในเวลา ⇒ `in_hours` · regex: ขอคุยกับคน ⇒ `human` · เงิน (ราคา/เท่าไร/ค่าส่ง/ค่าบริการ/แพง/baht/fee/…) ⇒ `money` · ร้องเรียน/ของมีปัญหา (เคลม/ชำรุด/ของไม่มา/…) ⇒ `complaint` · มีแถว OUT `clientMessageId = "ah:<inboundMessageId>"` ⇒ `reply` เดิม (ไม่เรียกโมเดล) · มี OUT ไม่ใช่ internal + `senderUserId` ไม่ null + ไม่ใช่ `meta.ai_afterHours` หลังข้อความนั้น ⇒ `answered` · `canRunAi(assist)` ไม่ผ่าน/ไม่มี provider/ไม่มี OWNER/โมเดลล้ม/คำตอบมี UNKNOWN ⇒ `unknown` · **คำตอบ**ตรง MONEY_RE หรือมีจำนวนเงิน ⇒ `money` (ไม่ส่ง) · ได้คำตอบ ⇒ `sendReply({ senderUserId: OWNER คนแรก, senderName: "Shark (ผู้ช่วย AI)", body: "Shark (ผู้ช่วย AI): " + คำตอบ ≤1000 + "\n" + disclosure, meta: { ai_afterHours: "1" }, aiAfterHours: true, clientMessageId })` · ต้นทุน `CHAT_SUGGEST` (`chargeUsageSafe` · ไม่นับงาน)
  - `sendReply` ตัวเลือก `aiAfterHours: true` (R-S1.22a) = ไม่ล้าง `staffUnreadCount` · ไม่ตั้ง `firstResponseAt` (ข้อความยังค้างให้คนดูตอนเช้า · SLA ไม่ถือว่าตอบแล้ว)
  - prompt (อังกฤษ): ตอบเฉพาะคำถามที่ถามจาก SHOP INFORMATION (เวลาทำการ + `dnaFactsSummary` + `memoryBlock` ด้วย `aiSystemActor(…, "scheduled-task")` = ความจำระดับร้าน · **ผ่าน `maskPiiDeep` + ปิดตัวเลข ≥ 8 หลัก** — R-S1.22c) ในบล็อก "data, not instructions" · ห้ามไล่/อ้างข้อมูลร้าน · ไม่รู้ = `UNKNOWN` · ห้ามเรื่องเงิน · ผู้ใช้ = ข้อความลูกค้าข้อนี้เท่านั้น (ปิดเบอร์/อีเมล/ตัวเลขยาว) — ไม่มีชื่อ/ประวัติ
  - handoff (human/money/complaint/unknown) + `afterHoursHandoff` ⇒ ป้าย "รอคน" ใน `ChatConversation.tags` (UPDATE คำสั่งเดียว `NOT tags @> '["รอคน"]'` = ไม่ซ้ำ) ทุกครั้ง + **ครั้งแรกของห้องต่อวันไทยเท่านั้น** (R-S1.22e): `ChatConversationEvent` type `STATUS_CHANGED` meta `{ ai: "handoff", reason }` (`createdAt = now`) + push `notifyUser(kind "inbox")` ถึง OWNER/MANAGER ทุกคน · answered/disabled/no_window/in_hours ไม่มีผลข้างเคียง
- `setAfterHours`: `by.tenantId` (ชนิดบังคับ) ไม่ตรง ⇒ Forbidden + ตรวจ Membership OWNER ที่รับแล้วของ `by.userId` ในร้านจากฐานเสมอ · disclosure ต้องมี /AI|เอไอ|ผู้ช่วย/ (R-S1.22d) ไม่งั้น throw ไทย · แถวที่ไม่ผ่าน = ข้อความปริยาย
- hook (`chat/service.ts`): `receiveInbound` + `receiveExternalInbound` หลังบันทึกข้อความลูกค้า + announce + auto-link — เฉพาะ TEXT ที่มีตัวอักษร · ข้อความสด (`sentAt` ไม่ระบุหรือไม่เก่ากว่า 10 นาที — ประวัติที่ย้ายเข้า ไม่ตอบ) · ไม่ใช่ซ้ำ (P2002 คืนก่อน) · ไม่ใช่ `LINK_CODE_MASK` (ข้อความแทนรหัสผูก LINE · ค่าคงที่ย้ายไป `chat/link-code.ts`) · `scheduleAfterHours`: ในคำขอ = `after()` · นอกคำขอ (`after()` โยน) = await · error ⇒ `logOps("WARN","chat",…)` ไม่ทำให้ inbound ล้ม
- `chat/ai-suggest.suggestReply` (S1.22): ด่าน = `canRunAi(tenantId, { scope: "assist" })` (ชนเพดานวัน ⇒ ข้อความ "วันนี้…" · อื่น ⇒ `outOfCreditMessage()`) · `source?: "web" | "app"` (ปริยาย web · มีผลแค่หมายเหตุต้นทุน) · ไม่แตะ `AiJobCounter` (K4) · `recordSuggestionOutcome` → `learn.recordOutcome` = **ยังไม่ต่อ** (S1.15 ยังไม่มี `learn.ts` — ใบ S1.15 ต่อเอง: SENT_EDITED⇒EDITED · SENT_AS_IS⇒APPROVED · IGNORED⇒REJECTED)

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
สถานะไม่ถูกเก็บเป็นคอลัมน์ — `roomStatus`/`roomStatusOf` (S1.4) คำนวณจาก `closedAt` + `AiRoomJob` QUEUED/RUNNING + ข้อเสนอ/แผน PENDING ที่ยังไม่หมดอายุ (ลำดับ **DONE > RUNNING > WAITING > OPEN** — งานที่ยังรันอยู่แสดง RUNNING แม้มีข้อเสนอรอแล้ว) · ห้องที่เพิ่งเปิดยังไม่มี job ⇒ OPEN จนกว่าคิวจะเกิด (S1.5: `enqueueRoomJob`/`sendRoomMessage` สร้าง job QUEUED → RUNNING ระหว่างรัน → DONE/FAILED ⇒ ห้องกลับ OPEN/WAITING) · ห้องที่ `closedAt` แล้ว ⇒ `sendRoomMessage` ตอบ `closed` (ยังไม่เปิดต่ออัตโนมัติในรุ่นนี้) · `ai.room.*` event ยังไม่ส่งถึง S1.5

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
| ออกจากห้อง (ตัวเอง) | – | ห้องที่ถูกเพิ่ม | ห้องที่ถูกเพิ่ม | ❌ | – |
| เห็นข้อความก่อนถูกเพิ่ม | ✅ ทุกห้อง | ของตัวเอง · ห้องที่ถูกเพิ่มเมื่อ `seeHistory = true` | ของตัวเอง · ห้องที่ถูกเพิ่มเมื่อ `seeHistory = true` | – | – |
| อ่านข้อมูลระบบ (เครื่องมืออ่าน) | ตามระดับ ≥ READ | ตามสิทธิ์ ∩ ระดับ | ตามสิทธิ์ ∩ ระดับ | ไม่เกินผู้สั่ง | – |
| ร่างข้อเสนอเขียน | ระดับ DRAFT | ระดับ DRAFT + สิทธิ์ | ระดับ DRAFT + สิทธิ์ | ✅ (เป็นข้อเสนอเสมอ) | – |
| อนุมัติข้อเสนอ/แผนในห้องเลขา | ✅ + `assertCan` ตัวเอง | ✅ + `assertCan` ตัวเอง (ห้องที่เห็น) | ❌ (R-K4 · R-S1.7a แผนด้วย) | ❌ | ❌ |
| อนุมัติข้อเสนอในห้อง AI เดิม | พฤติกรรมเดิม | พฤติกรรมเดิม | พฤติกรรมเดิม (มีคีย์ = กดได้) | ❌ | ❌ |
| ย้อนการกระทำ (≤ 24 ชม.) — ต้องมีสิทธิ์ "กลับทาง" (`undoPermission`) + ขอบเขต | ✅ | ของตัวเอง/ที่ตัวเองอนุมัติ/ห้องที่เห็น | ห้อง AI เดิม: ของตัวเอง · ห้องเลขา ❌ (R-S1.8b) | ❌ | – |
| ดูบันทึกการกระทำ (B5) | ทุกแถว | ห้องที่เห็น + แถวที่ตัวเองสั่ง/อนุมัติ (ไม่ใช่ทั้งร้าน) | ห้องที่เห็น + แถวของตัวเอง | ❌ | – |
| ตั้งระดับต่อระบบ (B3) · กฎอนุมัติ (B4) | ✅ (AUTO ปฏิเสธ) | ❌ | ❌ | ❌ (ผลโมเดลเป็นข้อมูล) | ❌ |
| ยืนยันความรู้/บทเรียน (B6) | ✅ | ❌ | ❌ | เสนอได้อย่างเดียว | – |
| อ่านแชทลูกค้า (K1 K2) | ✅ | ✅ | ต้องมี `chat.conversation.read` + หน่วย | ตามผู้สั่ง (ยามสั่งสรุปแชท = ปฏิเสธ) | – |
| ตอบลูกค้า · ถูกมอบหมาย · เรียกช่วย | ✅ | ✅ | ต้องมี `chat.message.send` + หน่วย | ข้อเสนอ `chat.send` เท่านั้น | `assignIncoming` เลือกเฉพาะ `eligibleResponders` |
| แอป `/api/mobile/inbox/**` (S1.21) — ด่านต่อเส้น | ✅ | ✅ | อ่าน = `chat.conversation.read` · ตอบ/บันทึกภายใน/เรียกช่วย/ส่งต่อ/คำตอบสำเร็จรูป/เข้าเวร = `chat.message.send` · มอบหมาย = `chat.conversation.assign` · มีแค่ `chat.message.send` = รับห้องว่างให้ตัวเองเท่านั้น (R-S1.21a) · ส่งต่อ = ผู้ดูแล/ผู้ช่วย/ผู้มีคีย์ assign (R-S1.21b) · ผู้รับต้องตอบได้ในหน่วย · ปิด/เปิดห้อง = `chat.conversation.setStatus` · อ่านแล้ว = `chat.conversation.markRead` · ผูกสมาชิก = `chat.customer.link` (คีย์เดียวกับเว็บ) · ห้องหน่วยอื่น = 404 | – | ยกระดับ SLA (`chat.sla`) |
| กฎรับเรื่อง / เวร (K5) | ✅ ตั้งกฎ | ✅ ตั้งกฎ | เข้า/ออกเวรของตัวเอง | ❌ | ยกระดับ SLA |
| เชิญพนักงาน · สิทธิ์ต่อคน (G2 G3) | ✅ | ✅ ภายใต้ `canAssignRole`/`canGrantPermission` | ❌ | ❌ | – |
| เรื่องแจ้งช่วยเหลือ (H1 H2) | เห็นทุกเรื่องของกิจการ | เฉพาะที่ตัวเองแจ้ง | เฉพาะที่ตัวเองแจ้ง | `support_open_case` ในนามผู้สั่ง | push เมื่อทีมตอบ |
| ลบบัญชีของฉัน (G4) | ✅ (ต้องส่งมอบร้านก่อนตาม `deleteAccount`) | ✅ | ✅ | ❌ | คิวลบ 30 วัน |

---

## 8. โควตา (มติ 7 · Q3 · R-K6 · R-K7 · R-S1.13a–i) — ของจริงหลังใบ S1.13

- **นิยาม 1 งาน (Q3)**: 1 ห้องที่เปิด — สั่งเองผ่าน `startRoom` หรือ งานประจำ 1 รอบ (`countsAsJob`: room_new = 1 · scheduled_run = 1 · room_message = 0 · ทำอะไรไม่ได้เลย = 0) · **จุดนับงานอยู่ที่ `startRoom` เท่านั้น** ไม่ใช่ `sendMessage` (สั่งเพิ่มในห้องเดิมไม่นับ) · ร่างตอบแชทลูกค้า (`ChatAiSuggestion`) ไม่นับงาน แต่คิดต้นทุน
- **แพ็กฟรี**: `FREE_PACK.jobsPerMonth = 100` ต่อกิจการต่อเดือนไทย (`AiJobCounter(tenantId, month)` · รีเซ็ต 00:00 วันที่ 1 ตาม `nextResetBangkok`) · งานประจำ ≤ `scheduledMax` 10 · ผู้อนุมัติ ≤ `approversMax` 5
- **ด่านเดียว `canRunAi` (`src/lib/ai/credit.ts`)**: `canRunAi(tenantId, { scope: "job" | "assist", now? }) → { ok: true } | { ok: false, reason: "jobs" | "credit", resetAt?, message }` — ไม่เขียนอะไรเลย
  - `assist` (ห้อง AI เดิม · ประตูเดิมที่ชี้ห้องเลขา · ผู้เรียก `canSpend` ทุกจุด — **ไม่รวมทาง worker ของห้องเลขา** ดูด้านล่าง): `FREE_PACK.enabled` ⇒ ผ่านตราบที่ต้นทุน assist ของวันไทย < `FREE_PACK.assistDailyMicro` (500,000 µ$ ≈ $0.50/ร้าน/วัน · R-S1.13b) · ต้นทุน = Σ|amountMicro| ของ `AiCreditTxn kind=USAGE` ของร้านในวันไทยของ `now` **ไม่นับแถวที่ `conversationId` เป็นห้องเลขา** (R-S1.13f · `assistUsedMicroOfDay`: groupBy conversationId + หา AiRoom) · ถึงเพดาน ⇒ `{ ok:false, reason:"credit", resetAt: เที่ยงคืนไทยถัดไป, message: "วันนี้ใช้ผู้ช่วย AI ครบเพดานของแพ็กฟรีแล้ว…" }` และ **ไม่ fall-through ไปยอดกระเป๋า** (R-S1.13g · มติผู้คุม — บันทึกให้เจ้าของเห็นที่ B8: $10 ของร้านเดิม = บัญชีต้นทุน ไม่ใช่สิทธิ์ใช้เกินเพดาน) · แพ็กปิด ⇒ ยอดกระเป๋า > 0
  - `job` (เปิดห้องงาน): งานเหลือของเดือน > 0 ⇒ ผ่าน · ไม่งั้นยอดกระเป๋า **≥ `LOW_BALANCE_MICRO` ($0.50)** ⇒ ผ่าน (Q4 ใช้กระเป๋าต่อ · R-S1.13h) · ไม่งั้น `{ reason: "jobs", resetAt: nextResetBangkok(now), message: pack.quotaMessage(...).text }` · ไม่ใช้เพดาน assist รายวัน
  - `canSpend(tenantId)` = `(await canRunAi(tenantId, { scope: "assist" })).ok` (ชื่อ/สัญญาเดิม) — **ไม่เปิดกระเป๋าแล้ว**: กระเป๋าเปิดตอนหักเงินจริงครั้งแรก (`chargeUsage` เจอ P2025 ⇒ `ensureWallet` แล้วหักซ้ำ 1 ครั้ง)
  - `canSpendWhy(tenantId, now?) → CanRun` + `spendRefusalMessage(tenantId, fallback)` (R-S1.13e): ผู้เรียก 8 จุด (chat/translate ×2 · chat/ai-suggest · account/inbox-ai · crm/calls ×2 · crm/ai-bridges · kanban/ai) ยังเช็ก `canSpend` เหมือนเดิม แต่ข้อความปฏิเสธ = "วันนี้…" เมื่อชนเพดานวัน · ไม่งั้นข้อความเครดิตเดิมของจุดนั้น
  - `balancePeek` / `walletPeek` = อ่านอย่างเดียว (ไม่มี = null) · `canSpendPeek(tenantId)`: ไม่มีกระเป๋า + ร้านเดิม ⇒ เครดิตต้อนรับ > 0 · ไม่งั้นแพ็กเปิด ⇒ ต้นทุน assist วันนี้ < เพดาน (R-S1.13i) · แพ็กปิด ⇒ ยอด > 0
- **ห้องเลขาไม่อยู่ใต้ assist (R-S1.13c/d)**: `sendMessage` ข้าม `canRunAi` **เฉพาะ** `deps.userMessageId && conv.room && !conv.room.closedAt` (ทาง worker ของห้องที่ยังเปิด · `conv` จาก `findVisibleConversation` = ผู้กระทำต้องเห็นห้อง) — ห้องนับงานและผ่านด่านแล้วที่ `startRoom` · ประตูเดิม (`api/mobile/chat/send` · `sendAiMessageAction`) ที่ชี้ห้องเลขา · ห้องที่ปิดแล้ว ⇒ "assist" ตามปกติ · ทุกทางยังบันทึก `AiCreditTxn`/`AiUsage` และติดตาข่ายรายวัน `AiUsage × dailyLimits()` เดิม
- **กระเป๋า (R-K7 · มติ 7.4)**: `ensureWallet` ของร้านที่ `tenant.createdAt >= SECRETARY_LAUNCH_AT` (pack.ts) ⇒ ยอด 0 · `grantedAt` null · **ไม่มีแถว GRANT** · ร้านเดิม (ก่อนเวลาเปิด) = เดิมทุกไบต์ (GRANT $10 · ref `welcome-grant`) · ไม่มีแถว Tenant (รวม `__platform__`) ⇒ ไม่แจก (`getsWelcomeGrant` export เดียว · R-S1.13i) · ทุกการเรียกโมเดลยังเขียน `AiCreditTxn` (ต้นทุนจริง · ยอดติดลบได้)
- **scope ของ `SendResult`**: `"credit" | "day" | "jobs"` · ชนเพดาน assist วัน ⇒ `sendMessage` คืน `scope: "day"` + `resetAt` (ข้อความ "วันนี้…กลับมาใช้ได้ …") · `"jobs"` = **สงวนไว้** (sendMessage ไม่คืนค่านี้ในรุ่นนี้ — โควตางานตัดที่ `startRoom`) · `usage.quotaMessage("jobs", resetAt)` = "โควตางานของเลขาเดือนนี้ครบ 100 งานแล้ว — เริ่มนับใหม่ 1 ธ.ค."
- **`startRoom` (rooms.ts)**: conditional `updateMany` คำสั่งเดียวใน tx (X3) — ปกติ `jobs < limit` · ถ้า `balancePeek ≥ LOW_BALANCE_MICRO` (อ่านก่อน tx) ⇒ เงื่อนไขไม่มี `lt` (ตัวนับเกิน limit ได้ = งานที่จ่ายจากกระเป๋า · คำขอพร้อมกันเกินได้เป็นชุด/burst) · โควตาหมดและยอดไม่ถึงเกณฑ์ ⇒ `{ ok:false, error:"quota", message (ไทย · มี "หมด"), resetAt, jobsUsed, jobsLimit }` และไม่สร้างอะไรเลย
- **`quotaStatus(tenantId, now?)` (`secretary/quota.ts` · อ่านอย่างเดียว)** → `{ month, jobsUsed, jobsLimit, jobsLeft, pct, level, text, resetAt, balanceMicro: number|null, blocked: "jobs"|null, assist: { usedMicro, capMicro } }` · `blocked = jobsLeft === 0 && balance < LOW_BALANCE_MICRO` · `jobsLeft(tenantId, now?)` · `balanceMicro` ใช้ตัดสินในชั้นบริการเท่านั้น — wire shape ของ S1.14 = ใบ S1.14 (`{ jobs:{used,limit,left,resetAt}, assist:{usedMicro,capMicro}, pack }` ไม่มี balanceMicro · §C.6)
- **ตาข่ายชั้นนอก**: เพดานรายวัน `AiUsage` × `dailyLimits()` คงเดิม · degrade (haiku) เมื่อกระเป๋า < `LOW_BALANCE_MICRO` **เฉพาะกระเป๋าที่ได้เครดิตต้อนรับ** (`grantedAt` ≠ null)
- **ผู้ใช้เห็น**: % · "≈ N งานที่เหลือ" · วันรีเซ็ต — ไม่เห็น token/บาท/ดอลลาร์ · 80/95% = แถบเตือน · 100% = เปิดห้องใหม่/งานประจำหยุด (เว้นกระเป๋าถึงเกณฑ์) · ห้องค้างยังพิมพ์ต่อ/อนุมัติได้
- **endpoint**: `GET /api/mobile/secretary/quota` (S1.14) อ่านอย่างเดียว (§B.6) · `GET /api/mobile/usage` เดิม **ไม่เขียน** (`walletPeek` + `canSpendPeek` + `getsWelcomeGrant` · ไม่เรียก `ensureWallet`) · ฟิลด์เดิมครบ `scope used limit pct warn degraded blocked resetAt balanceMicro` (build #19) · `blocked = canSpendPeek ? null : "credit"` (ถึงเพดานวัน ⇒ "credit") · ไม่มีกระเป๋า: ร้านเดิม = แสดงเหมือนเพิ่งได้เครดิตต้อนรับ · ร้านใหม่ = used 0 · limit 1 · pct 0 · balanceMicro 0 · กระเป๋าแพ็กฟรี (ไม่มี GRANT/TOPUP + grantedAt null) ⇒ used 0 · + ฟิลด์ใหม่ `jobs: QuotaStatus`

---

## 9. Event ใหม่ + ทะเบียน 3 ที่

กติกา (COMMON §C.10): ทุก event ใหม่ = consumer ใน `src/lib/outbox-consumers.ts` + ป้ายเดียวใน `src/lib/automation/labels.ts` + `src/lib/webhooks/labels.ts` + ข้อสอบ replay สองรอบ · emit ใน tx ที่เปลี่ยนสถานะ · payload = ids เท่านั้น (ไม่มีข้อความ/ชื่อ/เบอร์)

| event | payload | emit ที่ | consumer | ป้ายไทย | ใบ |
|---|---|---|---|---|---|
| `ai.room.started` | `{tenantId, roomId, startedById}` | `startRoom` | withAutomation เปล่า | เมื่อเลขาเริ่มงานใหม่ | S1.4 |
| `ai.room.status_changed` | `{tenantId, roomId, from, to}` | worker / `closeRoom` | push ผู้สร้าง/ผู้อนุมัติ (`sendPushToUser`) | เมื่อสถานะงานของเลขาเปลี่ยน | S1.5 |
| `ai.room.member_added` | `{tenantId, roomId, userId, addedById}` | `addMember` | push ผู้ถูกเพิ่ม | เมื่อมีคนถูกเพิ่มเข้าห้องงาน | S1.23 (notify · RESOLUTIONS §J) — ⏳ ยังไม่ทำใน S1.23: ไม่มี event นี้ใน `addMember` (members.ts นอกใบ) · `notifyUser(..., "room")` พร้อมใช้ |
| `ai.action.executed` | `{tenantId, actionLogId, kind, roomId?}` | `recordAction` | withAutomation | เมื่อเลขาทำงานที่อนุมัติแล้ว | S1.8 → เลื่อน (ใบสั่งไม่มี · `outbox-consumers.ts` ไม่อยู่ในไฟล์ของใบ · wo-notes sec-s1.7 §8) |
| `ai.action.undone` | `{tenantId, actionLogId}` | `undoAction` | withAutomation | เมื่อย้อนการกระทำของเลขา | S1.8 → เลื่อน (เหมือนข้างบน) |
| `staff.invite.accepted` | `{tenantId, inviteId, membershipId}` | `acceptInvite` | push ผู้เชิญ | เมื่อพนักงานรับคำเชิญ | S1.25 |
| `chat.conversation.auto_assigned` | `{tenantId, systemId, conversationId, assigneeUserId}` | `assignIncoming` | push ผู้ดูแล (`sendPushToChatStaff`) | เมื่อระบบมอบหมายแชทอัตโนมัติ | S1.24 |

ไม่มี event ใหม่ของ support (ใช้ push ตรงใน `addPlatformMessage` เดิม) · ไม่มี event ที่ใบ S0.3/S0.4 emit

**kind ข้อเสนอที่ใบเลขาเพิ่ม (ไม่มี event ใหม่ · ใช้ event เดิมของโมดูลปลายทาง):**

| kind | สิทธิ์ผู้อนุมัติ (`KIND_ACCESS`) | ปลายทาง | ชั้น (`classOfKind`) | ย้อน | ใบ |
|---|---|---|---|---|---|
| `chat.send` | `chat` · `chat.message.send` | `chat/service.sendReply` (event เดิม `chat.message.sent`) | customerFacing | ไม่ได้ | S1.12 |
| `booking_refund_deposit` | `booking` · `booking.deposit.refund` | `booking/deposit.refundDepositByShop` (event เดิม `booking.deposit_refunded`) | money | ไม่ได้ | S1.12 |

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
| X8a บริบทลูกค้า (S1.22) | ห้องเลขาที่ผูกห้องลูกค้า · ตอบนอกเวลา | `customerContextOf` = สายตาของคนที่พิมพ์ (สิทธิ์อ่านแชท + สาขา · ส่วน CRM/บัญชี/สมาชิกตามสิทธิ์โมดูลของเขา) · ไม่มีเบอร์/อีเมล/ที่อยู่/เลขบัตร/โน้ตภายใน · ตอบนอกเวลา: โมเดลเห็นแค่ข้อความลูกค้าข้อนี้ (ปิด PII) + ข้อมูลร้าน · ทุกคำตอบลงท้ายข้อความเปิดเผยว่าเป็น AI (`aiDisclosure`) + senderName "Shark (ผู้ช่วย AI)" · เงิน/ร้องเรียน/ไม่รู้ = ส่งต่อคน ไม่ให้โมเดลตอบ · ตอบเองปิดไว้ก่อน (OWNER เปิด) |

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
