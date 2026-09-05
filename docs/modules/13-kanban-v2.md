# โมดูล 13 (v2): Kanban — บอร์ดงาน เทียบชั้น Trello

> scope: **system** (`AppSystem type=KANBAN` — ทุกตารางมี `tenantId + systemId` ตามที่ `src/lib/core/scope.ts:207-210` ลงทะเบียนไว้แล้ว)
> สถานะเอกสาร: **พิมพ์เขียวสำหรับลงมือ (v2)** — เอกสารนี้ **แทนที่** `docs/modules/13-kanban.md` ทั้งฉบับ
> ที่มา: `ledger/DESIGN-KANBAN-TRELLO.md` (แบบที่เจ้าของเคาะ) + ภาพ `ledger/design-kanban/*.png` + โค้ดจริง ณ 5 ก.ย. 2569
> ยึด `docs/modules/_CONVENTIONS.md` (ภาษาไทย · ชื่อ code/model/field เป็นอังกฤษ · เงินเป็นสตางค์ · เวลา UTC · ไม่มี hard delete)
> 🔴 ผู้เขียนโค้ดต้องอ่าน §0 ก่อนเสมอ — ข้อขัดแย้งระหว่างเอกสารเก่ากับแบบใหม่ถูกตัดสินไว้ที่นั่นแล้ว ห้ามรื้อ

---

## 0. การตัดสินใจ (ปิดแล้ว — ห้ามเปิดใหม่)

### 0.1 มติ D1–D14

| # | เรื่อง | มติ | ผลต่อโค้ด |
|---|---|---|---|
| **D1** | ขอบเขต workspace | **Workspace = `AppSystem type=KANBAN`** · 1 ร้านเปิดได้หลายระบบ (แยกทีมเรือ/ทีมออฟฟิศ) · หน้ารวมบอร์ดและค้นหาข้ามบอร์ด **ทำงานภายใน 1 systemId เท่านั้น** | ทุก query คง `where { tenantId, systemId }` เหมือนวันนี้ (`service.ts:49-51`) · ไม่เพิ่มชั้น Workspace ใหม่ |
| **D2** | การมองเห็นบอร์ด | `PRIVATE` (เฉพาะสมาชิกบอร์ด) / `TENANT` (ทุกคนที่มีสิทธิ์โมดูลเห็นเป็น `VIEWER`) · **OWNER = ADMIN โดยปริยายทุกบอร์ด** · **MANAGER ที่ `unitAccess` ครอบ `board.unitId` = `EDITOR` โดยปริยายของบอร์ดนั้น** · บอร์ด PRIVATE ของสาขาอื่นถูกซ่อน · `unitId` เป็น metadata ไม่ใช่กำแพงข้อมูล | อัลกอริทึม `resolveBoardRole()` §6.2 |
| **D3** | คนนอกองค์กร (guest) | **ไม่ทำใน run นี้** — เลื่อนไป P4 · ไม่ออกแบบ schema รองรับล่วงหน้า | ไม่มี `KanbanBoardGuest` |
| **D4** | เพดาน | ไฟล์แนบ **10 MB/ไฟล์** (ใช้ค่าเดียวกับ `CHAT_ATTACHMENT_MAX_BYTES` ที่ `src/lib/storage/service.ts:71` ห้ามพิมพ์ตัวเลขซ้ำ) · **20 ไฟล์/การ์ด** · ป้ายกำกับ **≤30/บอร์ด** · ฟิลด์กำหนดเอง **≤20/บอร์ด** · **บอร์ด/การ์ด ไม่จำกัด** ตอนนี้ · ตารางเพดานอ่อนของ v1 §11.5 เก็บไว้เป็น "ค่าตั้งต้นของ config" (§11.6) | ค่าคงที่รวมที่ `kanban/limits.ts` ที่เดียว |
| **D5** | แจ้งเตือนพนักงาน | **ในแอป** (`AppNotification.recipientUserId` ยิงตรงคน) + **Expo push รายคน** (helper ใหม่) + **อีเมลสรุป (digest)** · **ไม่ทำ LINE/Telegram หาพนักงาน** | §7.4 |
| **D6** | ขอบเขต AI | **เสนอก่อนเสมอ** ทุกกรณี ไม่มีข้อยกเว้น · เส้นทาง "แชท → การ์ดในกล่องงานเข้า" เป็น **กฎอัตโนมัติที่ผู้ดูแลเปิดเอง** ไม่ใช่ AI ตัดสินใจเอง | §8 · §9.2 |
| **D7** | ขอบเขต P2 | P2 = Table · Calendar · Summary · Saved views · Custom fields · Card templates + recurring · Inbox · Automation builder · Reports · Email digest/watch · **Timeline = ใบสุดท้ายของ P2 (K2.3) เลื่อนออกได้** | §13 |
| **D8** | ลำดับงาน | **P1 parity → P2 → P3** · "สร้างงานจากแชท" คือ **K3.2** ห้ามดึงมาทำก่อน | §13 |
| **D9** | สีป้ายกำกับ | enum 6 ค่า `SLATE / BLUE / GREEN / AMBER / RED / PURPLE` map ตรงกับ `--color-tag-*` ใน `src/app/globals.css:29-34` | §4.2 |
| **D10** | ไมเกรชัน | **เพิ่มอย่างเดียว** · คอลัมน์ใหม่ nullable หรือมี default เสมอ · ใช้ `scripts/vercel-build.sh` ที่รัน `prisma migrate deploy` ก่อน `next build` บน production ⇒ **โค้ดกับ schema ขึ้นพร้อมกันใน push เดียว** · `sortOrder` อยู่คู่ `position` ตลอด P1 (อ่าน `position ?? sortOrder` · เขียนทั้งคู่) | §4.6 |
| **D11** | กฎอัตโนมัติของบอร์ด | **ใช้ `AutomationRule` เดิม** เพิ่มคอลัมน์ `boardId` / `systemId` / `conditions Json` / `actions Json` · ไม่สร้าง `KanbanAutomationRule` · บันทึกการทำงานลง `AutomationRun` เดิม | §4.5 · §7.6 |
| **D12** | รายละเอียดการ์ด (rich text) | เก็บเป็น **HTML string ที่ผ่าน sanitize** ในคอลัมน์ `description String?` เดิม (allowlist ตาม v1 §11.6) · **ไม่ใช้ Tiptap JSON · ไม่เพิ่ม dependency ตัวแก้ข้อความ** · P1 ใช้ textarea + markdown-lite (`**หนา** _เอียง_ - รายการ` + ลิงก์อัตโนมัติ) แล้วค่อยยกระดับภายหลัง | §4.3 · §11.7 |
| **D13** | realtime | ช่อง Ably **ต่อบอร์ด** ผ่าน `src/lib/realtime` · โหมดมาจาก `realtimeMode()` · **ไม่มีกุญแจ = poll ทุก 5 วิ เหมือนเดิม และต้องใช้งานได้ครบทุกฟังก์ชัน** | §7.5 |
| **D14** | เลขการ์ด | `cardNo` วิ่งต่อบอร์ดด้วย `KanbanBoard.cardNoSeq` ผ่าน `UPDATE ... SET cardNoSeq = cardNoSeq + 1 ... RETURNING` **คำสั่งเดียวใน transaction เดียวกับการสร้างการ์ด** | §5.4 · §11.2 |

### 0.2 v2 เปลี่ยนอะไรจาก v1 (`docs/modules/13-kanban.md`)

**สิ่งที่ยกมาทั้งดุ้น (ยังถูกอยู่ ห้ามเขียนใหม่):**
- §11.1 fractional indexing — ไลบรารี `fractional-indexing`, server เป็นคนสร้างคีย์, fallback เมื่อเพื่อนบ้านหาย, rebalance เมื่อคีย์ยาว >50 ตัวอักษร → §11.1 ของเอกสารนี้
- §11.2 concurrency · §11.3 กติกาธุรกิจ · §11.4 คน/สิทธิ์เปลี่ยนกลางทาง · §11.5 เพดาน · §11.6 ความปลอดภัย → §11.2–§11.7
- §9 ตารางสิทธิ์ action × role → §6.4 (ขยายด้วยคีย์ใหม่ 8 ตัว)
- §3.8 เทมเพลต (`structure Json` + instantiate ใน transaction เดียว) → §10
- §7 business flows → กระจายเข้า §5.5 (ลากการ์ด) · §7.4 (mention/เตือน) · §10 (สร้างจากเทมเพลต) · §11
- §12 QC checklist → §13 (แตกเป็นรายใบงาน)

**สิ่งที่ v2 ยกเลิก/แทนที่ของ v1 (13 จุด — ทุกจุดคือข้อขัดแย้งที่แบบใหม่ชนะ):**

| # | v1 ว่าไว้ | v2 (แบบใหม่ + มติ D) | เหตุผล |
|---|---|---|---|
| 1 | URL `/app/kanban/...` ระดับ tenant ไม่มี systemId | `/app/sys/{systemId}/kanban/...` | โค้ดจริงเดินเส้นนี้อยู่แล้ว (`src/app/app/sys/[id]/kanban/`) · D1 |
| 2 | `KanbanLabelColor` **10 สี** (GRAY/RED/ORANGE/YELLOW/GREEN/TEAL/BLUE/PURPLE/PINK/BROWN) | **6 สี** SLATE/BLUE/GREEN/AMBER/RED/PURPLE | มีโทเคนจริงแค่ 6 (`globals.css:29-34`) · D9 · แบบ §5.4 |
| 3 | `unitId` **ไม่ให้สิทธิ์** MANAGER (v1 §9.1) | MANAGER ที่ `unitAccess` ครอบ `board.unitId` = **EDITOR โดยปริยาย** | แบบ §6.6 · D2 |
| 4 | `description Json?` = Tiptap JSON | `description String?` = HTML ที่ sanitize แล้ว | D12 — ไม่เพิ่ม dependency editor |
| 5 | realtime = **SSE** ต่อบอร์ด | **Ably ต่อบอร์ด + polling fallback** | D13 · ระบบมี `src/lib/realtime` อยู่แล้ว |
| 6 | ไฟล์แนบ **20 MB**/ไฟล์ · เก็บ `fileKey/mime/size` เอง | **10 MB**/ไฟล์ · อ้าง `FileAsset.id` ที่ `src/lib/storage` สร้าง | D4 · แบบ §7.2 — ไม่สร้างที่เก็บไฟล์ซ้อน |
| 7 | เช็คลิสต์ **แบน 1 ชุด/การ์ด** | **หลายชุด** (`KanbanChecklist` + `KanbanChecklistItem`) มอบหมาย + กำหนดส่ง **รายรายการ** | แบบ §7.2 · ภาพ `03-card-back.png` |
| 8 | "ไม่ทำ automation ใน v1" | ทำใน P2 โดย**ต่อยอด `AutomationRule` เดิม** | แบบ §6.3 · D11 |
| 9 | ถอดคนออกจากบอร์ด → **ไม่** auto-unassign | ถอดคนออก → การ์ดที่เขาถือในบอร์ดนั้นกลายเป็น **"ยังไม่มอบหมาย"** + แจ้งผู้ดูแลบอร์ด | ข้อความในภาพ `10-board-settings.png` ที่เจ้าของเห็นแล้ว (UI ต้องตรงภาพ) |
| 10 | `cardNo Int` **NOT NULL** + `@@unique([boardId, cardNo])` ตั้งแต่แรก | `cardNo Int?` **nullable** → backfill → **ค่อยเพิ่ม unique ทีหลัง** | D10 — ไมเกรชันเพิ่มอย่างเดียว |
| 11 | เพดานการ์ด 1,000/บอร์ด · บอร์ด 20/tenant (บังคับ) | **ไม่จำกัด** โดยค่าตั้งต้น · ตัวเลขเดิมกลายเป็น "ค่าตั้งต้นของ config" ที่ปิดอยู่ | D4 |
| 12 | เทมเพลตระบบ **4 ชุด** | **6 ชุด** สำหรับธุรกิจไทย (§10) | แบบ §8 K1.12 |
| 13 | cron เตือนกำหนดส่ง **ทุก 5 นาที** | เกาะ `/api/cron/hourly` ที่มีอยู่ (ราย 1 ชม.) + ปัดช่วงเตือน | `vercel.json` มี cron แค่ 2 ตัว (`0 20 * * *`, `0 * * * *`) — เพิ่ม cron 5 นาทีคือเพิ่มค่าใช้จ่ายและงานปฏิบัติการโดยไม่จำเป็น · **⚠️ สมมติ: แบบไม่ได้ระบุความถี่** |

**เรื่องที่แบบ (mockup) กับข้อความในเอกสารต่างกัน — ตัดสินแล้ว:**
- `08-automation.png` โชว์ "ใช้ไป 128 / 1,000 ครั้งเดือนนี้" = ตัวเลขสมมติในภาพ · **v2 ไม่มีโควตาการรัน** (เราไม่ได้ขายเป็นแพ็กเกจแบบ Trello) แต่ **ต้องแสดงจำนวนรันจริงเดือนนี้** จาก `AutomationRun` — ⚠️ สมมติ (แบบเงียบเรื่องโควตา)
- `01-boards-home.png` โชว์ "ดูเทมเพลตทั้งหมด (12)" = ตัวเลขสมมติ · ของจริงต้องนับ `KanbanBoardTemplate` ที่ `isActive` จริง (P1 = 6)

---

## 1. ขอบเขต · persona · user stories

### 1.1 ทำอะไร (v2 ครบ 3 ระยะ)
บอร์ดงานภายในองค์กรที่ **แทน Trello ได้จริง** และ **รู้จักข้อมูลธุรกิจของร้าน** ซึ่ง Trello ทำไม่ได้:
บอร์ด → คอลัมน์ → การ์ด พร้อมหลังการ์ดเต็มรูปแบบ (รายละเอียด/ผู้รับผิดชอบหลายคน/กำหนดส่ง/ป้ายกำกับ/เช็คลิสต์หลายชุด/ไฟล์แนบ/ความเห็น+@กล่าวถึง/ประวัติกิจกรรม), ลากวางด้วย fractional indexing, สมาชิกบอร์ด 3 บทบาท, ตัวกรอง+ค้นหาข้ามบอร์ดที่เก็บสถานะไว้ใน URL, เทมเพลต, มือถือ (กดค้างลาก/ปัดการ์ด), realtime, มุมมองตาราง/ปฏิทิน/ไทม์ไลน์/สรุป, มุมมองที่บันทึกไว้, ฟิลด์กำหนดเอง, กล่องงานเข้าส่วนตัว, ระบบอัตโนมัติที่อ่านเป็นประโยคไทย, รายงาน, และ **การ์ดผูกกับลูกค้า/แชท/ใบเสนอราคา/คำขออนุมัติ/ใบลา/คิว/คลังความรู้**

### 1.2 ไม่ทำ (ตัดสินแล้ว)
- ❌ มุมมองแผนที่ (Map) · ❌ ระบบ Power-Ups (ใช้เว็บฮุค+API+AI แทน) · ❌ สติกเกอร์/โหวต/Card Aging · ❌ จานสี 30 สี
- ❌ Guest ภายนอกองค์กร (D3 — P4)
- ❌ ให้ลูกค้า (persona ระดับ 4) เห็นบอร์ด — Kanban เป็นเครื่องมือภายในเสมอ
- ❌ AI ลงมือเองโดยไม่ยืนยัน (D6)

### 1.3 Persona

| Persona | ใช้ทำอะไร | หน้าเริ่มต้น |
|---|---|---|
| **เจ้าของร้าน (OWNER)** | เห็นทุกบอร์ด · ตั้งกฎอัตโนมัติ · ดูรายงานภาระงาน/งานค้าง | หน้ารวมบอร์ด |
| **ผู้จัดการสาขา (MANAGER)** | คุมบอร์ดของสาขาตัวเอง · มอบหมายงาน · ตามกำหนดส่ง | หน้ารวมบอร์ด (กรองสาขาตัวเอง) |
| **พนักงาน (STAFF)** | ทำงานบนบอร์ดที่ถูกเชิญ · จดงานเข้ากล่องงานเข้า · ปัดการ์ดบนมือถือ | **งานของฉัน** |
| **ลูกค้า** | ❌ ไม่เกี่ยว | — |

### 1.4 User stories (ที่ต้องผ่านตอนตรวจรับ)
1. (OWNER) เปิดสาขาใหม่ → สร้างบอร์ดจากเทมเพลต "เปิดสาขาใหม่" ได้คอลัมน์+การ์ด+เช็คลิสต์+ป้ายครบใน 1 คลิก แล้วมอบหมายทีมทันที
2. (MANAGER ป่าตอง) เห็นบอร์ดของสาขาป่าตองโดย**ไม่ต้องถูกเชิญ** และ**ไม่เห็น**บอร์ด PRIVATE ของสาขาอื่น
3. (STAFF) เช้ามาเปิด "งานของฉัน" เห็นงานทุกบอร์ดจัดกลุ่ม เลยกำหนด/วันนี้/สัปดาห์นี้ + **รายการเช็คลิสต์ที่มอบหมายให้ฉัน**
4. (STAFF มือถือ) หน้าท่าเรือ ปัดขวา = ทำเสร็จ · ปัดซ้าย = เก็บเข้าคลัง · มีปุ่มย้อนกลับ 5 วินาที
5. (STAFF) ลูกค้าทัก LINE → กด "สร้างงานจากข้อความนี้" → ได้การ์ดพร้อมชื่อ/สรุป/กำหนดส่งที่ AI ร่างให้ และผูกกลับไปที่บทสนทนา (K3.2)
6. (MANAGER) ลากการ์ดจัดลำดับความสำคัญในคอลัมน์ได้ และลำดับคงอยู่หลังรีเฟรช · เปิด 2 จอลากพร้อมกันแล้วเห็นตรงกัน
7. (OWNER) ตั้งกฎ "การ์ดเข้า *รอตรวจ* + ป้าย *การเงิน* → เปิดคำขออนุมัติ + มอบหมายผู้จัดการ + แจ้งเตือน" แล้ว **ทดลองรันย้อนหลัง** ก่อนบันทึก
8. (STAFF) ถูก @กล่าวถึงในความเห็น → ได้แจ้งเตือน **เฉพาะตัวเอง** (ไม่ใช่ทั้งร้านเห็น) ทั้งในแอปและบนมือถือ

---

## 2. IA + การนำทาง

### 2.1 ลำดับชั้น
```
Tenant (องค์กร)
 └── AppSystem type=KANBAN   ← "Workspace" (มีได้หลายตัว · D1)
       ├── KanbanBoard (ผูก unitId ได้ = metadata)
       │     └── KanbanColumn
       │           └── KanbanCard
       │                 └── เช็คลิสต์ / ไฟล์แนบ / ความเห็น / กิจกรรม / ลิงก์ข้ามระบบ / ฟิลด์กำหนดเอง
       ├── KanbanInboxItem   (กล่องงานเข้าส่วนตัว — ยังไม่เป็นการ์ด)
       ├── KanbanBoardView   (มุมมองที่บันทึกไว้ · ส่วนตัว/ทั้งทีม)
       ├── KanbanBoardTemplate / KanbanCardTemplate
       └── AutomationRule (boardId != null)
```

### 2.2 เมนูโมดูล 7 หมวด
🔴 ต้องแก้ **2 ที่ให้ตรงกัน** เสมอ: `childrenFor("KANBAN")` ที่ `src/app/app/layout.tsx:203-209` และ `kanbanTabs()` ที่ `src/lib/modules/kanban/ui.tsx:26-34` — มีสคริปต์ `scripts/qc-nav-functions.mts` ตรวจอยู่

| # | หมวด | URL | ใครเห็น | ป้ายตัวเลข |
|---|---|---|---|---|
| 1 | **บอร์ด** | `/app/sys/{id}/kanban/boards` | ทุกคนที่มีสิทธิ์โมดูล | — |
| 2 | **งานของฉัน** | `/app/sys/{id}/kanban/my-tasks` | ทุกคน (**หน้าเริ่มต้นของ STAFF**) | จำนวนงานเลยกำหนด+วันนี้ |
| 3 | **กล่องงานเข้า** | `/app/sys/{id}/kanban/inbox` | ทุกคน | จำนวนรายการค้าง |
| 4 | **ปฏิทินงาน** | `/app/sys/{id}/kanban/calendar` | ทุกคน | — |
| 5 | **ระบบอัตโนมัติ** | `/app/sys/{id}/kanban/automation` | `kanban.automation.manage` | — |
| 6 | **รายงาน** | `/app/sys/{id}/kanban/reports` | `kanban.report.view` | — |
| 7 | **ตั้งค่า** | `/app/sys/{id}/kanban/settings/{tab}` | ผู้ดูแลบอร์ด/OWNER | — |

หมวดที่ผู้ใช้ไม่มีสิทธิ์ **ต้องซ่อน** ไม่ใช่โชว์แล้วพาไปหน้า 403 (แบบเดียวกับที่ `CHAT` ทำอยู่ใน `layout.tsx:186-195`)

### 2.3 URL ของบอร์ด (สถานะทุกอย่างอยู่ใน URL)
```
/app/sys/{systemId}/kanban/b/{boardId}
  ?view=board|table|calendar|timeline|summary     (ค่าตั้งต้น board)
  &card={cardId}                                   เปิดหลังการ์ดทับ (deep link)
  &assignee={userId|none}[,{userId}...]            หลายค่า = OR
  &label={labelId}[,{labelId}...]                  หลายค่า = OR
  &due=overdue|today|week|none
  &q={keyword}                                     ค้นชื่อ + #cardNo + ไวยากรณ์ §11.9
  &group=column|assignee|label                     เฉพาะ view=table|timeline
  &sort=due|created|updated|position
  &savedView={viewId}                              โหลดมุมมองที่บันทึกไว้ (แล้วเขียนทับพารามิเตอร์)
```
🔴 **ตัวกรองอยู่ใน URL เสมอ** — ส่งลิงก์ให้เพื่อนแล้วต้องเห็นเหมือนกันเป๊ะ (ข้อได้เปรียบเหนือ Trello ที่เก็บตัวกรองไว้ในเครื่อง) · เส้นทางเก่า `/kanban/{boardId}` ต้อง **redirect ถาวร** ไป `/kanban/b/{boardId}` (ลิงก์ในแจ้งเตือนที่ส่งออกไปแล้วชี้เส้นเก่าอยู่ — ดู `service.ts:32`)

### 2.4 เมนูซ้ายยุบเป็นรางไอคอน
เมื่ออยู่ในหน้าบอร์ด (`/kanban/b/*`) **เมนูซ้าย 288px ยุบเหลือรางไอคอน 56px** เพื่อคืนพื้นที่ให้คอลัมน์ (ภาพ `02-board.png`) · รางยังสลับระบบได้ · มีปุ่มกางกลับ · จำสถานะต่อผู้ใช้ใน `localStorage` (ไม่ใช่ DB)
ไอคอนใช้ **สไปรต์ SVG inline แบบเดียวกับ `src/components/account-v2/AccountIcon.tsx`** (คัดลอก path จาก `ledger/design-kanban/_base.part`) — **ห้ามลง dependency ไอคอนใหม่ · ห้ามใช้อีโมจิในหน้าจอบอร์ด**

---

## 3. หน้าจอทั้งหมด (11 surface)

> ทุกหน้า: i18n TH/EN · ภาษาออกแบบตาม §12.4 · มี loading / empty / error ครบ · ปุ่มที่ผู้ใช้ไม่มีสิทธิ์ **ซ่อน** ไม่ใช่ disabled
> "QC เห็นภาพ" = สิ่งที่ต้องเห็นในภาพหน้าจอจริงตอนตรวจรับ เทียบกับ mockup ที่ระบุ

### 3.1 หน้ารวมบอร์ด — `/kanban/boards` · ภาพ `01-boards-home.png`
**หน้าที่:** จุดเริ่มของหัวหน้า — หาบอร์ดให้เจอใน 1 สายตา และค้นการ์ดข้ามบอร์ดได้ทันที

| ส่วน | องค์ประกอบ | การกระทำ → service |
|---|---|---|
| หัวเรื่อง | "บอร์ดงาน" + "9 บอร์ด · การ์ดค้าง 63 ใบ" | `boards.listBoardsHome()` |
| แถบค้นหา | ช่อง "ค้นหาการ์ดทุกบอร์ด…" + ชิป `Ctrl K` | `search.searchCards()` (debounce 250ms) |
| ตัวกรองสาขา | dropdown "หน่วยธุรกิจ: ทั้งหมด" | คิวรีซ้ำด้วย `unitId` |
| ปุ่มหลัก | "สร้างบอร์ด" (เห็นเมื่อมี `kanban.board.create`) | เปิด modal 2 ขั้น → `boards.createBoard()` |
| แถบ 1 | **บอร์ดติดดาว** — การ์ดกว้าง 4 ใบ/แถว · แถบสีบอร์ด · ชื่อ · "สาขา · N คอลัมน์ · N การ์ด" · ชิปเตือน (เลยกำหนด N ใบ / ครบสัปดาห์นี้ N / เริ่ม 8 ต.ค.) · avatar stack + `+2` | `boards.listStarred()` |
| แถบ 2 | **จัดกลุ่มตามสาขา** — หัวกลุ่ม "สาขาป่าตอง · 3 บอร์ด · ดูทั้งหมด ›" แล้วแถวบอร์ด (avatar stack · ชื่อ · "18 การ์ด · แก้ไข 12 นาทีที่แล้ว") | `boards.listGroupedByUnit()` |
| แถบ 3 | **บอร์ดกลางองค์กร** (`unitId = null`) | เดียวกัน |
| แถบ 4 | **เริ่มจากเทมเพลต** — 5 การ์ด + "ดูเทมเพลตทั้งหมด (N) ›" | `templates.listBoardTemplates()` |

**สถานะ:** loading = skeleton การ์ดบอร์ด 4 ใบ · empty = "ยังไม่มีบอร์ด — เริ่มจากเทมเพลตเร็วกว่าสร้างเอง" + การ์ดเทมเพลต 5 ใบ + ปุ่ม "สร้างบอร์ดเปล่า" · error = แถบแดง + ปุ่มลองใหม่ (ห้ามโทษผู้ใช้)
**ปุ่มลัด:** `Ctrl/⌘ K` ค้นหา · `b` ตัวสลับบอร์ด · `g t` ไปงานของฉัน · `g i` ไปกล่องงานเข้า
**มือถือ:** grid → รายการ 1 คอลัมน์ · แถบเทมเพลตเลื่อนแนวนอน · ช่องค้นหาติดบนสุด
**QC เห็นภาพ:** ต้องเห็น 4 แถบครบตามลำดับ (ติดดาว → สาขา → กลางองค์กร → เทมเพลต) · การ์ดบอร์ดมีแถบสีซ้าย · มีชิป "เลยกำหนด N ใบ" สีแดง · avatar stack ซ้อนกัน · เมนูซ้าย 7 หมวดพร้อมป้ายตัวเลขที่ "งานของฉัน" และ "กล่องงานเข้า"

### 3.2 มุมมองบอร์ด — `?view=board` · ภาพ `02-board.png`
**หน้าที่:** หน้าทำงานหลัก — เห็นงานทั้งบอร์ดและขยับได้ด้วยการลาก

**หัวบอร์ด (สูง 56px):** ชื่อบอร์ด (คลิกแก้ในที่ ถ้า ADMIN) · ดาว (toggle) · ชิปสาขา · ชิปการมองเห็น ("เฉพาะสมาชิก"/"ทั้งร้านเห็น") · **ตัวสลับมุมมอง 5 แบบ** (บอร์ด/ตาราง/ปฏิทิน/ไทม์ไลน์/สรุป) · ปุ่ม **ตัวกรอง** (มีตัวเลขเมื่อทำงานอยู่) · ปุ่ม **อัตโนมัติ** · avatar stack + ปุ่มเชิญ · เมนู `⋯` (ตั้งค่าบอร์ด · ป้ายกำกับ · คลังเก็บ · ทำสำเนาบอร์ด · เก็บบอร์ดเข้าคลัง)

**แถบตัวกรอง (โผล่เมื่อมีเงื่อนไข):** "กรองอยู่:" + ชิปเงื่อนไข (กดกากบาทถอดทีละอัน) + **"แสดง 18 จาก 24 การ์ด"** + "ล้างตัวกรอง" + บรรทัดจาง "ลิงก์นี้แชร์ตัวกรองให้ทีมได้ (เก็บไว้ใน URL)"

**เวทีบอร์ด (พื้น `#f4f5f7`):** คอลัมน์กว้าง 240px พื้น `#eceef1` เลื่อนแนวนอน
- หัวคอลัมน์: ชื่อ · จำนวนการ์ด · ชิป WIP (`3/3 เต็ม` สีแดงเมื่อเต็ม) · `+` · `⋯` (เปลี่ยนชื่อ · ตั้งเป็นคอลัมน์เสร็จ · จำกัดงานพร้อมกัน · สีคอลัมน์ · พับ · เก็บเข้าคลัง)
- การ์ด: ปก (ถ้ามี) · ชิปที่มา (LINE/ฟอร์ม/HR) · ชื่อ · ป้ายกำกับ · ชิปกำหนดส่ง (เทา/อำพัน/แดง/เขียว) · ตราเช็คลิสต์ `2/5` · ตราไฟล์ · ตราความเห็น · ตราลิงก์ระบบ · avatar
- **ลาก:** เส้นประสีน้ำเงินคือจุดที่การ์ดจะตกลง · การ์ดที่ยกอยู่เอียงเล็กน้อย+เงา · คอลัมน์เต็ม WIP แสดงข้อความ "คอลัมน์เต็ม — ปิดงานก่อน"
- ท้ายคอลัมน์: "เพิ่มการ์ด" (พิมพ์ชื่อ + Enter แล้วช่องยังเปิดอยู่ให้พิมพ์ใบต่อไปได้ทันที)

**การกระทำ → service:** ลากการ์ด → `ordering.moveCard()` · ลากคอลัมน์ → `ordering.moveColumn()` · เพิ่มการ์ด → `cards.createCard()` · กดการ์ด → เปิดหลังการ์ด (`?card=`) · ติดดาว → `boards.toggleStar()`
**สถานะ:** บอร์ดว่าง = "บอร์ดนี้ยังว่าง ลองเพิ่มงานแรกในคอลัมน์ 'รอทำ'" + ปุ่ม · คอลัมน์ว่าง = กรอบเส้นประ "ลากการ์ดมาวางที่นี่" · กรองแล้วไม่เจอ = "ไม่มีการ์ดตรงกับตัวกรอง 2 ข้อนี้" + ปุ่มล้าง · บอร์ดถูกเก็บเข้าคลัง = แถบเหลือง "บอร์ดถูกเก็บถาวร" + ทั้งบอร์ดอ่านอย่างเดียว
**ปุ่มลัด:** `f`/`x` กรอง · `n` การ์ดใหม่ใต้ตัวที่ชี้ · `t` แก้ชื่อ · `d` กำหนดส่ง · `l` ป้าย (`1`–`6` สลับสี) · `c` เก็บเข้าคลัง · `j/k` หรือ `↑↓` เลื่อนเลือก · **`Shift+←/→` ย้ายการ์ดข้ามคอลัมน์ด้วยคีย์บอร์ด** · `z` ย้อน 5 วินาที · `?` รายการปุ่มลัด · `Esc` ปิด
**มือถือ (ภาพ `07-mobile.png` จอ ก):** เลื่อนทีละคอลัมน์แบบ snap + จุดบอกตำแหน่ง + บรรทัด "คอลัมน์ 2 จาก 5" · กดค้าง 0.3 วิ ยกการ์ด · ปัดขวา = ทำเสร็จ (แถบเขียว) · ปัดซ้าย = เก็บเข้าคลัง · แถบสอนท่าทางล่างจอ · FAB + ปุ่ม AI
**QC เห็นภาพ:** เมนูซ้ายเป็นรางไอคอน 56px · ตัวสลับมุมมอง 5 ปุ่มโดยปุ่ม "บอร์ด" ถูกเลือก · แถบตัวกรองพร้อมข้อความ "แสดง 18 จาก 24 การ์ด" · คอลัมน์ "กำลังทำ" แสดง `3/3 เต็ม` สีแดง · มีการ์ดที่กำลังถูกลาก + เส้นประจุดวาง · การ์ดมีชิปที่มา LINE/ฟอร์ม/ใบลา

### 3.3 หลังการ์ด — `?card={cardId}` · ภาพ `03-card-back.png`
**หน้าที่:** ที่ที่งานจริงเกิด 80% — แก้ทุกอย่างของการ์ดได้จบในที่เดียว
**รูปแบบ:** โมดัลกว้าง 872px มุมโค้ง 14px บนเดสก์ท็อป · **แผ่นเต็มจอ** บนมือถือ · เปิด/ปิดผ่าน `?card=` (กด back ของเบราว์เซอร์ต้องปิดโมดัล ไม่ใช่ออกจากบอร์ด)

| บล็อก (บนลงล่าง) | รายละเอียด | service |
|---|---|---|
| แถบบน | `การ์ด #128 · อยู่ในคอลัมน์ [รอทำ ▾] · บอร์ด งานร้าน — สาขาป่าตอง` · ปุ่มปิด | `cards.moveCardToColumn()` |
| ชื่อการ์ด | หลายบรรทัด แก้ในที่ (Enter บันทึก · Esc ยกเลิก) | `cards.updateCard()` |
| **เมนู "เพิ่ม:"** | สมาชิก · ป้ายกำกับ · กำหนดวัน · เช็คลิสต์ · ไฟล์แนบ · เชื่อมข้อมูล SHARK — **อยู่ใต้ชื่อทันที** (โฉมใหม่ของ Trello) | เปิด popover ตามชนิด |
| แถวสรุป | ผู้รับผิดชอบ (avatar + `+`) · ป้ายกำกับ (ชิป + `+`) · กำหนดส่ง ("พฤ. 11 ก.ย. 2569 · 17:00" + "เตือนล่วงหน้า 1 วัน") | `members`/`labels`/`cards` |
| **เชื่อมกับข้อมูลในระบบ SHARK** | อยู่ **เหนือ** รายละเอียด · แถวละ 1 ลิงก์: ไอคอน · ชื่อ · ชนิด · ค่าสรุป (ดีล ฿186,000 / ร่าง / รออนุมัติ) · ปุ่ม "+ เพิ่มการเชื่อม" | `links.listCardLinks()` (K3.1) |
| รายละเอียด | กล่องข้อความ + "แก้ไขล่าสุด … · บันทึกอัตโนมัติ" (debounce 800ms) | `cards.updateDescription()` |
| **ขั้นตอนงาน** (เช็คลิสต์) | หัวข้อ + `3/5` + แถบความคืบหน้า + "ซ่อนรายการที่ทำแล้ว" · แต่ละรายการ: ติ๊ก · ชื่อ (แก้ในที่) · ชิปกำหนดส่ง · avatar ผู้รับผิดชอบ · ลากเรียง · บรรทัดอธิบาย "รายการที่ถึงกำหนดจะโผล่ใน *งานของฉัน*" | `checklists.*` |
| ไฟล์แนบ | หัวข้อ + จำนวน + "+ อัปโหลด" · แถวไฟล์: ไอคอน/thumbnail · ชื่อ · "42 KB · อัปโดย ธนา · 4 ก.ย." · ปุ่ม "ตั้งเป็นปก" | `attachments.*` |
| **ความเห็นและกิจกรรม** | แท็บ `ทั้งหมด / ความเห็น / กิจกรรม` · สายเดียวเรียงเวลา · ความเห็นคน (avatar + ชื่อ + เวลา + เนื้อหา + `@ชื่อ` ไฮไลต์) · **ข้อความของผู้ช่วย AI** (มีปุ่มต่อยอด เช่น "สร้างเช็คลิสต์จากสรุปนี้") · บรรทัดกิจกรรม ("ธนา ย้ายการ์ดจาก กล่องงานเข้า → รอทำ · เมื่อวาน 16:05") · บรรทัดของกฎอัตโนมัติ | `comments.*` / `activity.*` |
| ช่องเขียน | "เขียนความเห็น… พิมพ์ @ เพื่อกล่าวถึงเพื่อนร่วมทีม" + ปุ่มส่ง (มือถือ = ติดขอบล่าง) | `comments.addComment()` |
| **แถบขวา** | **การ์ดนี้**: ย้ายไปคอลัมน์/บอร์ดอื่น · ทำสำเนา · สะท้อนการ์ด (P3) · บันทึกเป็นเทมเพลตการ์ด (P2) · ติดตามการ์ด <br> **ทำต่ออัตโนมัติ**: ปุ่มบนการ์ดที่ผู้ดูแลตั้งไว้ <br> **ผู้ช่วย AI**: สรุปการ์ดนี้ · แตกเป็นเช็คลิสต์ · ร่างข้อความตอบลูกค้า <br> **ฟิลด์กำหนดเอง** (P2) <br> **เก็บเข้าคลัง** (ปุ่มอันตราย) | ตามชื่อ |

**สถานะ:** loading = skeleton 3 บล็อก · การ์ดถูกเก็บเข้าคลังไปแล้ว = แถบ "การ์ดนี้อยู่ในคลัง" + ปุ่มกู้คืน + ทุกอย่างอ่านอย่างเดียว · VIEWER = ซ่อนช่องเขียน/ปุ่มแก้ทั้งหมด · ลิงก์ที่ผู้ดูไม่มีสิทธิ์โมดูลปลายทาง = แสดง "เอกสารในระบบบัญชี (ไม่มีสิทธิ์เข้าถึง)" **ไม่ซ่อนแถว**
**ปุ่มลัด:** `Esc` ปิด · `t` แก้ชื่อ · `d` กำหนดส่ง · `l` ป้าย · `c` เก็บเข้าคลัง · `Enter` ส่งความเห็น · `Shift+Enter` ขึ้นบรรทัด
**มือถือ (ภาพ `07` จอ ข):** แผ่นเต็มจอ · ปุ่ม "ถ่ายรูปแนบ" อยู่ในเมนูเพิ่ม · แถบ AI 1 บรรทัด · ช่องความเห็นติดขอบล่างเสมอ
**QC เห็นภาพ:** เมนู "เพิ่ม:" อยู่ **ใต้ชื่อการ์ด** ไม่ใช่ในแถบขวา · บล็อก "เชื่อมกับข้อมูลในระบบ SHARK" อยู่ **เหนือ** รายละเอียด · เช็คลิสต์มีแถบความคืบหน้า + avatar + ชิปวันที่รายรายการ · สายกิจกรรมมีทั้งความเห็นคน ข้อความ AI และบรรทัดกฎอัตโนมัติ · แถบขวามี 5 กลุ่มตามลำดับ

### 3.4 มุมมองตาราง — `?view=table` (P2 · K2.1) · ภาพ `04-table.png`
**หน้าที่:** แก้งานหลายใบเร็ว ๆ แบบสเปรดชีต
**ส่วนประกอบ:** แถบเครื่องมือ (ค้นในบอร์ดนี้ · ตัวกรอง · `จัดกลุ่ม: คอลัมน์ ▾` · ส่งออก CSV · เพิ่มการ์ด) · **แถบเลือกหลายรายการ** ("เลือก 2 การ์ด · ย้ายไปคอลัมน์ · มอบหมาย · ติดป้าย · ตั้งกำหนดส่ง · เก็บเข้าคลัง") · ตาราง 8 คอลัมน์: การ์ด (+`#131`) · คอลัมน์ · ผู้รับผิดชอบ · กำหนดส่ง · เช็คลิสต์ · ป้ายกำกับ · **เชื่อมระบบ** · แก้ไขล่าสุด · แถวท้าย "เพิ่มการ์ดใหม่ในคอลัมน์ *รอทำ*" · ท้ายตาราง "แสดง 10 จาก 24 การ์ด · แก้ค่าในช่องได้ทันที (คลิกที่ช่อง)" + แบ่งหน้า
**การกระทำ:** คลิกช่อง → แก้ในที่ (`cards.updateCard` / `members.setAssignees` / `labels.setCardLabels`) · เลือกหลายรายการ → `cards.bulkUpdate()` · ส่งออก → `reports.exportCardsCsv()`
**สถานะ:** ว่าง/กรองไม่เจอ เหมือน §3.2 · มือถือ: ตารางกลายเป็นรายการ 2 บรรทัด + ปัดเพื่อทำ (ไม่มีแก้ในช่อง)
**QC เห็นภาพ:** คอลัมน์ "เชื่อมระบบ" มีค่าจริง (ใบเสนอราคา/แชท LINE/ใบซื้อ/อุปกรณ์ #A-102) · แถบเลือกหลายรายการโผล่เมื่อติ๊ก ≥1 แถว · ชิปกำหนดส่งใช้สีตามกติกา (เลย 4 วัน = แดง)

### 3.5 มุมมองปฏิทิน — `?view=calendar` (P2 · K2.2) · ภาพ `05-calendar.png`
**หน้าที่:** เห็นภาระงานตามวัน และเลื่อนกำหนดส่งด้วยการลาก
**ส่วนประกอบ:** สลับ สัปดาห์/เดือน · `‹ กันยายน 2569 ›` · ปุ่ม "วันนี้" · ตัวกรอง · **ถาดซ้าย "ยังไม่กำหนดวัน (6)"** พร้อมบรรทัดสอน "ลากการ์ดไปวางบนวันในปฏิทิน = ตั้งกำหนดส่ง" · **สวิตช์ "แสดงงานจากระบบอื่นด้วย"** + คำอธิบายสัญลักษณ์ (การ์ดในบอร์ดนี้ / เลยกำหนด / จองทริป·ลา·ประชุม อ่านอย่างเดียว) · ตารางเดือน 7 คอลัมน์ วันนี้ไฮไลต์
**การกระทำ:** ลากการ์ดลงวัน → `cards.setDue()` · ลากในปฏิทิน → เปลี่ยน `dueAt` · งานจากระบบอื่นดึงจาก `src/lib/modules/calendar` ที่หน้า `/app/calendar` ใช้อยู่แล้ว (อ่านอย่างเดียว กดแล้วไปหน้าต้นทาง)
**QC เห็นภาพ:** ถาด "ยังไม่กำหนดวัน" มีการ์ดจริง · มีรายการอ่านอย่างเดียวสีต่างจากการ์ดบอร์ด (เช่น "พี่ก้อง ลาป่วย", "ทริปสิมิลัน 3 วัน") · วันนี้มีกรอบไฮไลต์

### 3.6 มุมมองไทม์ไลน์ — `?view=timeline` (P2 · K2.3 · **เลื่อนออกได้**)
แถบงานจาก `startAt` → `dueAt` · จัดกลุ่มตามคอลัมน์/คน/ป้าย · ซูม สัปดาห์–เดือน–ไตรมาส · ลากขอบเปลี่ยนช่วงวัน · **ไม่มีบนมือถือ** (แสดงข้อความชวนไปใช้มุมมองตารางแทน)
**QC เห็นภาพ:** ⚠️ ไม่มี mockup — ตรวจด้วยเกณฑ์: แถบงานตรงช่วงวันจริง · ลากขอบแล้วค่า `startAt/dueAt` ใน DB เปลี่ยนตาม

### 3.7 มุมมองสรุป — `?view=summary` (P2 · K2.4)
4 ไทล์: การ์ดต่อคอลัมน์ · ต่อคน · ต่อกำหนดส่ง · ต่อป้าย + กราฟ throughput รายสัปดาห์ (สร้าง vs เสร็จ)
🔴 **กดไทล์แล้วเจาะลงเป็นรายการการ์ดได้** (ลิงก์ไป `?view=table&...` พร้อมตัวกรอง) — จุดที่ Trello ทำไม่ได้และเป็นเหตุผลที่เราทำ
**QC เห็นภาพ:** ⚠️ ไม่มี mockup — ตรวจ: ตัวเลขในไทล์ตรงกับจำนวนแถวที่ได้หลังกดเจาะลง

### 3.8 งานของฉัน + กล่องงานเข้า — `/kanban/my-tasks` · ภาพ `06-my-tasks.png`
**หน้าที่:** หน้าเริ่มต้นของพนักงาน — รู้ว่าวันนี้ต้องทำอะไร โดยไม่ต้องเปิดบอร์ดทีละใบ
**หัวหน้าจอ:** "สวัสดีตอนเช้า ธนา" + "ศุกร์ 5 กันยายน 2569 · มีงานถึงกำหนดวันนี้ 3 งาน · เลยกำหนด 1 งาน" + dropdown "ทุกบอร์ด" + ปุ่ม "จดงานเร็ว"
**คอลัมน์ซ้าย — กล่องงานเข้าของฉัน (P2 · K2.8):** หัวข้อ + จำนวน + คำอธิบาย "ที่พักงานส่วนตัว ยังไม่อยู่บอร์ดไหน — เคลียร์ให้ว่างทุกวัน" · ช่อง "พิมพ์แล้วกด Enter เพื่อจดงานใหม่…" · รายการพร้อมชิปที่มา (จากแชท LINE · ส่งต่อทางอีเมล · จดไว้เอง) + เวลา + ป้าย "AI ตั้งชื่อ + สรุปให้แล้ว" + ปุ่ม "ส่งเข้าบอร์ด" · บรรทัดท้าย "ลากการ์ดไปวางบนบอร์ด หรือกด *ส่งเข้าบอร์ด* เพื่อจัดที่อยู่ให้งาน"
**คอลัมน์ขวา:** 4 ตัวเลข (เลยกำหนด 1 · ถึงกำหนดวันนี้ 3 · สัปดาห์นี้ 6 · ปิดไปสัปดาห์นี้ 9) · หัวข้อ "งานที่มอบหมายให้ฉัน · รวมทุกบอร์ดที่ฉันเข้าถึง" + แท็บ `ตามกำหนด / ตามบอร์ด / ตามความสำคัญ` · กลุ่ม **เลยกำหนด → วันนี้ → สัปดาห์นี้ → ถัดไป → ไม่มีกำหนด** แต่ละแถว: ชื่อ + "บอร์ด · คอลัมน์ · #cardNo" + ป้าย + ชิปกำหนดส่ง + เช็คลิสต์ · บล็อก **"รายการเช็คลิสต์ที่มอบหมายให้ฉัน"** (โชว์ว่าอยู่ในการ์ดไหน) · บล็อก **"ที่ฉันติดตาม (ไม่ได้รับผิดชอบ)"** (P2)
**การกระทำ:** ติ๊กเช็คลิสต์ในที่ · กดแถว = เปิดหลังการ์ดข้ามบอร์ด · toggle "แสดงงานที่เสร็จแล้ว"
**สถานะ:** ว่าง = "วันนี้ไม่มีงานค้าง 🎉 งานที่หัวหน้ามอบหมายจะมาอยู่ที่นี่" + ปุ่ม "ดูบอร์ดทั้งหมด" · กล่องงานเข้าว่าง = "กล่องงานเข้าว่างแล้ว — จดงานใหม่ได้ที่ช่องด้านบน" · **เกิน 500 การ์ด** = แถบ "แสดง 500 รายการแรก — กรองรายบอร์ดเพื่อดูให้ครบ" (v1 ตัดที่ 100 เงียบ ๆ ห้ามทำแบบนั้นอีก)
**มือถือ (ภาพ `07` จอ ค):** 4 ตัวเลขเป็นชิปเลื่อนแนวนอน · งานของฉันบนสุด กล่องงานเข้าถัดลงมา · แถบล่าง 5 เมนู (บอร์ด/งานฉัน/กล่องเข้า/ปฏิทิน/รายงาน)
**QC เห็นภาพ:** 2 คอลัมน์ตามภาพ · ป้าย "AI ตั้งชื่อ + สรุปให้แล้ว" บนรายการที่มาจากอีเมล · บล็อกเช็คลิสต์ที่มอบหมายให้ฉันอยู่ใต้รายการงาน · ทุกแถวบอกชื่อบอร์ดกำกับ

### 3.9 ตัวสร้างกฎอัตโนมัติ — `/kanban/automation` (P2 · K2.9) · ภาพ `08-automation.png`
**หน้าที่:** ให้เจ้าของร้านตั้งกฎได้เองโดยไม่ต้องเขียนโค้ด
**ซ้าย:** รายการ 6 ชนิดพร้อมจำนวน — กฎ (Rule) 6 · ปุ่มบนการ์ด 3 · ปุ่มบนบอร์ด 1 · ตั้งเวลา 2 · ตามวันครบกำหนด 2 · รายงานอีเมล 1 · + "คำแนะนำจาก AI (4)" · "บันทึกการทำงาน"
**กลาง — ตัวสร้างกฎ:** หัวข้อ "กฎใหม่ — ยังไม่บันทึก" + คำอธิบาย "อ่านเป็นประโยคไทยได้ตรง ๆ · เลือกจากรายการ ไม่ต้องเขียนโค้ด" + ป้าย "ทดลองรันย้อนหลังได้"
ประโยค: **เมื่อ** [การ์ดถูกย้ายเข้าคอลัมน์ ▾][รอตรวจ ▾][ในบอร์ดนี้] **และถ้า** [การ์ดมีป้ายกำกับ ▾][การเงิน ▾] **ให้ทำ** [เปิดคำขออนุมัติ ▾][สายอนุมัติ: จัดซื้อเกิน ฿10,000 ▾][แล้วผูกกลับมาที่การ์ด] **และ** [มอบหมายให้ ▾][ผู้จัดการสาขา] **และ** [แจ้งเตือน ▾][ในแอป + แจ้งบนมือถือ][ข้อความ: "การ์ด {ชื่อการ์ด} รออนุมัติ"]
+ ปุ่ม "เพิ่มเงื่อนไข / เพิ่มการกระทำ (สูงสุด 20 การกระทำต่อ 1 กฎ)" · ช่องชื่อกฎ · ปุ่ม **ทดลองรัน** / ยกเลิก / บันทึกกฎ
**ล่าง:** ตาราง "กฎที่เปิดใช้อยู่" (กฎ · รันเดือนนี้ · สถานะ) · แผง "คำแนะนำจาก AI" (K3.6) · "บันทึกการทำงานล่าสุด" (OK/ล้ม + เวลา + รายละเอียด + "จะลองใหม่อัตโนมัติ")
**QC เห็นภาพ:** ประโยคกฎอ่านเป็นไทยต่อเนื่องได้จริง · ปุ่ม "ทดลองรัน" อยู่คู่ปุ่มบันทึก · ตารางกฎแสดงชื่อ event เป็นภาษาคนไม่ใช่โค้ด (แต่บรรทัดรองแสดง `chat.message.received` ได้) · บันทึกการทำงานมีทั้งรายการ OK และล้ม

### 3.10 ตั้งค่าบอร์ด — `/kanban/settings/*` · ภาพ `10-board-settings.png`
7 แท็บ: **ทั่วไป · สมาชิกและสิทธิ์ · ป้ายกำกับ · ฟิลด์กำหนดเอง · มุมมองที่บันทึกไว้ · อัตโนมัติ · คลังเก็บ** + ปุ่มอันตราย "เก็บบอร์ดเข้าคลัง"
- **สมาชิกและสิทธิ์:** "5 คน · สูงสุด 50" · ช่องค้นทีมงาน · ปุ่มเชิญ · กล่องอธิบายสิทธิ์ 2 ชั้น ("เห็นบอร์ดได้ = ต้องมีสิทธิ์โมดูล *บอร์ดงาน* ใน SHARK ก่อน แล้วจึงคุมรายละเอียดด้วยบทบาทในบอร์ดนี้ · เจ้าของร้านเป็นผู้ดูแลทุกบอร์ดโดยอัตโนมัติ") · ตาราง 4 คอลัมน์: คน (avatar+ชื่อ+อีเมล) · **บทบาทในองค์กร** · **บทบาทในบอร์ดนี้** (ผู้ดูแล (อัตโนมัติ) / ผู้ดูแล / แก้ไขได้ / ดูอย่างเดียว) · การ์ดที่ถือ · บรรทัดเตือน "ถอดคนออกจากบอร์ด การ์ดที่เขาถืออยู่จะกลายเป็น *ยังไม่มอบหมาย* และแจ้งผู้ดูแล"
- **ป้ายกำกับ:** "7 ป้าย · 6 สีตามระบบ" · ชิปป้าย + "ใช้ใน N การ์ด" · บรรทัด "ใช้จานสีเดียวกับแท็กเอกสารในระบบบัญชี (6 สี ผ่านเกณฑ์คอนทราสต์) — ไม่ทำจาน 30 สีแบบ Trello"
- **มุมมองที่บันทึกไว้:** รายการ + ป้าย `ทั้งทีม` / `ส่วนตัว` + คำบรรยายเงื่อนไข ("ตาราง · กรอง: เลยกำหนด · เรียงตามวันที่")
- **ฟิลด์กำหนดเอง:** "3 / 20" + รายการพร้อมชนิด ("ตัวเลข (บาท) · แสดงหน้าการ์ด", "ตัวเลือก: สูง / กลาง / ต่ำ")
- **คลังเก็บ:** การ์ด/คอลัมน์ที่เก็บไว้ + ค้นหา + ปุ่มกู้คืน
**QC เห็นภาพ:** ตารางสมาชิกโชว์ **สองบทบาทในแถวเดียว** · OWNER แสดง "ผู้ดูแล (อัตโนมัติ)" และแก้ไม่ได้ · ป้ายกำกับมีตัวนับการใช้งานจริง

### 3.11 สร้างงานจากแชท (อยู่ในโมดูลแชท · K3.2) · ภาพ `09-from-chat.png`
ปุ่ม **"สร้างงานจากข้อความนี้"** บนหัวห้องแชท → แผงขวา 380px: "ผู้ช่วย AI เตรียมให้แล้ว — อ่าน 12 ข้อความล่าสุด → ตั้งชื่อการ์ด สรุปรายละเอียด เดากำหนดส่ง และร่างเช็คลิสต์ให้ · แก้ไขได้ก่อนบันทึก" · ฟิลด์: ชื่อการ์ด · ลงบอร์ด · คอลัมน์ · ผู้รับผิดชอบ · กำหนดส่ง (ชิป `AI`) · ป้ายกำกับ · รายละเอียด (สรุปจากแชท) · **เชื่อมอัตโนมัติ** (ติ๊ก: บทสนทนา LINE นี้ / ผู้ติดต่อ CRM·Party / คัดลอกไฟล์แนบในแชท (0 ไฟล์) / สร้างใบเสนอราคาร่างในระบบบัญชีด้วย) · บรรทัด "เมื่อการ์ดถูกปิด ระบบจะกลับมาแปะบันทึกในบทสนทนานี้ให้อัตโนมัติ · ปุ่มนี้เปิด/ปิดได้ที่ ตั้งค่า › การเชื่อมต่อ" · ปุ่ม ยกเลิก / **สร้างการ์ด**
🔴 ข้อจำกัดสถาปัตยกรรม: fitness ของรีโปห้ามเส้น `kanban → chat` ตรง ⇒ ปุ่มนี้อยู่ในโมดูลแชท และเรียก **facade** `kanban.createCardFromExternal()` เท่านั้น (§9.3)
**QC เห็นภาพ:** แผงขวาซ้อนบนหน้าแชทจริง · ชิป `AI` ที่ช่องกำหนดส่ง · ติ๊ก 4 รายการเชื่อมอัตโนมัติ · บรรทัดอธิบายการแปะบันทึกกลับ

---

## 4. Data Model v2 (Prisma)

> ทุกตารางใหม่มี `tenantId + systemId` (แกน `system`) และ **ต้องลงทะเบียนใน `src/lib/core/scope.ts`** ด้วย `sys()` มิฉะนั้น `scopeOf()` โยน error ตอน boot (fail-closed — ดูหัวไฟล์ scope.ts)
> ยกเว้น `KanbanBoardTemplate` (มี `tenantId` เป็น null ได้ = เทมเพลตของแพลตฟอร์ม) ต้องลงทะเบียนเป็น `g("เทมเพลตกลางของแพลตฟอร์ม — tenantId null")` และ **service ต้องกรอง `tenantId IN (null, ปัจจุบัน)` เองทุกครั้ง**
> id = `cuid()` · เวลา UTC · soft delete ด้วย `status`/`archivedAt` ทุกที่ · **ห้าม hard delete** ยกเว้นที่ระบุชัด

### 4.1 แก้ 3 ตารางเดิม (เพิ่มคอลัมน์ล้วน — nullable/มี default ทุกตัว)

```prisma
model KanbanBoard {
  // เดิม: id tenantId systemId name description sortOrder status archivedAt createdAt updatedAt
  unitId       String?                                  // K1.1 · ผูกสาขา (metadata · ไม่ใช่ isolation)
  color        KanbanLabelColor      @default(SLATE)    // K1.1 · แถบสีบนการ์ดบอร์ด
  visibility   KanbanBoardVisibility @default(PRIVATE)  // K1.3
  cardNoSeq    Int                   @default(0)        // K1.1 · ตัวนับ #cardNo (D14)
  createdById  String?                                  // K1.1
  templateOfId String?                                  // K1.12 · สร้างมาจากเทมเพลตไหน
  emailKey     String?                                  // K3.9 · งาน+{emailKey}@shark.in.th
  archivedById String?                                  // K1.1

  @@index([tenantId, systemId, unitId])                 // K1.1 · หน้ารวมบอร์ดจัดกลุ่มตามสาขา
  @@index([tenantId, systemId, visibility, status])     // K1.3 · list บอร์ดที่ฉันเห็น
  @@unique([tenantId, emailKey])                        // K3.9 · เพิ่มหลัง backfill
}

model KanbanColumn {
  position     String?           // K1.1 · fractional index — อยู่คู่ sortOrder เดิม (D10)
  isDoneColumn Boolean @default(false)   // K1.1
  wipLimit     Int?              // K1.1 · null = ไม่จำกัด
  color        KanbanLabelColor? // K1.1
  isCollapsed  Boolean @default(false)   // K1.14 · พับคอลัมน์ (ระดับบอร์ด ไม่ใช่รายคน)

  @@index([boardId, status, position])   // K1.1 · โหลดบอร์ด
}

model KanbanCard {
  cardNo                Int?                  // K1.1 · backfill แล้วค่อยเพิ่ม unique (4.6)
  position              String?               // K1.1 · fractional index ภายในคอลัมน์
  startAt               DateTime?             // K1.1 · ใช้กับไทม์ไลน์/ปฏิทิน
  completedAt           DateTime?             // K1.1 · set เมื่อเข้าคอลัมน์ done
  reminderMinutesBefore Int?                  // K1.6 · null/0/60/1440/2880
  reminderSentAt        DateTime?             // K1.6 · กันเตือนซ้ำ (reset เมื่อ due เปลี่ยน)
  coverFileId           String?               // K1.9 · → FileAsset.id
  sourceType            KanbanCardSourceType @default(MANUAL)  // K1.1
  sourceId              String?               // K1.1 · conversationId / submissionId / …
  mirrorOfId            String?               // K3.7 · การ์ดสะท้อน
  recurrenceRule        String?               // K2.7 · "FREQ=WEEKLY;BYDAY=MO" (subset ของ RRULE)
  recurrenceParentId    String?               // K2.7
  createdById           String?               // K1.1
  archivedById          String?               // K1.1
  // description String? (เดิม) = HTML ที่ sanitize แล้ว (D12) — ไม่เพิ่มคอลัมน์ใหม่

  @@index([tenantId, systemId, status, dueAt])    // K1.1 · cron เตือน + รายงานเลยกำหนด
  @@index([boardId, status, completedAt])         // K1.1 · รายงาน throughput
  @@index([columnId, status, position])           // K1.1 · โหลดคอลัมน์
}
```
🔴 index เดิม `[columnId, status, sortOrder]` **คงไว้** จนกว่าจะเลิกใช้ `sortOrder` ในเวอร์ชันถัดไป

### 4.2 Enum ใหม่ (9 ตัว)

```prisma
enum KanbanBoardVisibility { PRIVATE  TENANT }                       // K1.3
enum KanbanBoardRole       { VIEWER  EDITOR  ADMIN }                 // K1.3
enum KanbanLabelColor      { SLATE  BLUE  GREEN  AMBER  RED  PURPLE } // K1.2 · D9 → --color-tag-*
enum KanbanCardSourceType  { MANUAL  TEMPLATE  CHAT  FORM  EMAIL  AUTOMATION  AI  INBOX }  // K1.1
enum KanbanCustomFieldType { TEXT  NUMBER  DATE  CHECKBOX  SELECT }  // K2.6
enum KanbanWatchTargetType { CARD  COLUMN  BOARD }                   // K2.11
enum KanbanViewScope       { PRIVATE  BOARD }                        // K2.5 · ส่วนตัว / ทั้งทีม
enum KanbanInboxStatus     { OPEN  MOVED  DISMISSED }                // K2.8
enum KanbanLinkType {                                                // K3.1
  PARTY  CRM_CONTACT  CHAT_CONVERSATION  ACCOUNT_DOC  APPROVAL_REQUEST
  HR_LEAVE  HR_EMPLOYEE  APPOINTMENT  HOTEL_RESERVATION  RENTAL_BOOKING
  SCHOOL_CLASS  INV_ITEM  QUEUE_TICKET  TICKET_EVENT  FORM_SUBMISSION
  KB_ARTICLE  POS_SALE  SHOP_ORDER  RESTAURANT_ORDER  URL
}
enum KanbanActivityType {                                            // K1.10 · 34 ค่า
  BOARD_CREATED  BOARD_UPDATED  BOARD_ARCHIVED  BOARD_UNARCHIVED
  MEMBER_ADDED  MEMBER_ROLE_CHANGED  MEMBER_REMOVED
  COLUMN_CREATED  COLUMN_UPDATED  COLUMN_MOVED  COLUMN_ARCHIVED
  CARD_CREATED  CARD_UPDATED  CARD_MOVED  CARD_ARCHIVED  CARD_UNARCHIVED
  CARD_ASSIGNED  CARD_UNASSIGNED  CARD_DUE_SET  CARD_DUE_REMOVED  CARD_COMPLETED  CARD_REOPENED
  CARD_LABEL_ADDED  CARD_LABEL_REMOVED  CARD_COVER_SET
  CHECKLIST_ADDED  CHECKLIST_ITEM_ADDED  CHECKLIST_ITEM_DONE  CHECKLIST_ITEM_UNDONE  CHECKLIST_ITEM_REMOVED
  ATTACHMENT_ADDED  ATTACHMENT_REMOVED  COMMENT_ADDED
  LINK_ADDED  LINK_REMOVED  AUTOMATION_RAN  AI_SUGGESTED
}
```
`KanbanEntityStatus { ACTIVE ARCHIVED }` = ของเดิม ใช้ต่อ

### 4.3 ตารางใหม่

| ตาราง | ทำอะไร | คีย์/ดัชนีสำคัญ | WO |
|---|---|---|---|
| `KanbanBoardMember` | สมาชิก + บทบาท | `@@unique([boardId, userId])` · `@@index([tenantId, systemId, userId])` | **K1.3** |
| `KanbanBoardStar` | ติดดาวรายคน | `@@unique([boardId, userId])` · `@@index([tenantId, systemId, userId])` | **K1.3** |
| `KanbanLabel` | ป้ายของบอร์ด | `@@unique([boardId, name])` · `@@index([tenantId, systemId, boardId])` | **K1.2** |
| `KanbanCardLabel` | join การ์ด×ป้าย | `@@unique([cardId, labelId])` · `@@index([labelId])` | **K1.2** |
| `KanbanCardAssignee` | ผู้รับผิดชอบหลายคน | `@@unique([cardId, userId])` · `@@index([tenantId, systemId, userId])` | **K1.2** |
| `KanbanChecklist` | ชุดขั้นตอนงาน (หลายชุด/การ์ด) | `@@index([cardId, position])` | **K1.7** |
| `KanbanChecklistItem` | รายการ + มอบหมาย + กำหนดส่งรายรายการ | `@@index([checklistId, position])` · `@@index([tenantId, systemId, assigneeUserId, isDone, dueAt])` | **K1.7** |
| `KanbanComment` | ความเห็น + mention (soft delete) | `@@index([cardId, createdAt])` | **K1.8** |
| `KanbanAttachment` | ไฟล์แนบ (อ้าง `FileAsset.id`) | `@@unique([cardId, fileId])` · `@@index([cardId, createdAt])` | **K1.9** |
| `KanbanActivity` | ประวัติ append-only | `@@index([cardId, createdAt(sort: Desc)])` · `@@index([boardId, createdAt(sort: Desc)])` | **K1.10** |
| `KanbanBoardTemplate` | เทมเพลตบอร์ด (แพลตฟอร์ม + ของร้าน) | `@@index([tenantId, isActive, sortOrder])` | **K1.12** |
| `KanbanBoardView` | มุมมองที่บันทึกไว้ | `@@index([boardId, scope])` · `@@index([tenantId, systemId, ownerUserId])` | **K2.5** |
| `KanbanCustomField` | นิยามฟิลด์ของบอร์ด | `@@unique([boardId, name])` · `@@index([boardId, sortOrder])` | **K2.6** |
| `KanbanCustomFieldValue` | ค่าต่อการ์ด | `@@unique([cardId, fieldId])` · `@@index([fieldId])` | **K2.6** |
| `KanbanCardTemplate` | เทมเพลตการ์ดในบอร์ด | `@@index([boardId, sortOrder])` | **K2.7** |
| `KanbanInboxItem` | กล่องงานเข้าส่วนตัว | `@@index([tenantId, systemId, ownerUserId, status, createdAt])` · `@@unique([tenantId, sourceKey])` | **K2.8** |
| `KanbanWatcher` | ติดตามการ์ด/คอลัมน์/บอร์ด | `@@unique([targetType, targetId, userId])` · `@@index([tenantId, systemId, userId])` | **K2.11** |
| `KanbanCardLink` | ผูกการ์ดกับวัตถุโมดูลอื่น | `@@unique([cardId, linkType, linkId])` · `@@index([tenantId, systemId, linkType, linkId])` | **K3.1** |

```prisma
model KanbanBoardMember {
  id        String          @id @default(cuid())
  tenantId  String
  systemId  String
  boardId   String
  board     KanbanBoard     @relation(fields: [boardId], references: [id], onDelete: Cascade)
  userId    String          // ต้องเป็น Membership ของ tenant นี้ — ตรวจใน service (ไม่ทำ FK ไป User)
  role      KanbanBoardRole @default(EDITOR)
  addedById String?
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
  @@unique([boardId, userId])
  @@index([tenantId, systemId, userId])
}

model KanbanLabel {
  id        String           @id @default(cuid())
  tenantId  String
  systemId  String
  boardId   String
  board     KanbanBoard      @relation(fields: [boardId], references: [id], onDelete: Cascade)
  name      String           // ≤ 40 ตัวอักษร
  color     KanbanLabelColor
  sortOrder Int              @default(0)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt
  cards     KanbanCardLabel[]
  @@unique([boardId, name])
  @@index([tenantId, systemId, boardId])
}

model KanbanChecklist {
  id        String   @id @default(cuid())
  tenantId  String
  systemId  String
  cardId    String
  card      KanbanCard @relation(fields: [cardId], references: [id], onDelete: Cascade)
  title     String     // "ขั้นตอนงาน" เป็นค่าตั้งต้น
  position  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  items     KanbanChecklistItem[]
  @@index([cardId, position])
}

model KanbanChecklistItem {
  id             String    @id @default(cuid())
  tenantId       String
  systemId       String
  cardId         String    // denormalize: "รายการที่มอบหมายให้ฉัน" ต้อง join กลับการ์ดโดยไม่ผ่าน checklist
  checklistId    String
  checklist      KanbanChecklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  title          String    // ≤ 300
  position       String
  isDone         Boolean   @default(false)
  assigneeUserId String?   // 1 คน/รายการ (ตาม Trello advanced checklist)
  dueAt          DateTime?
  doneById       String?
  doneAt         DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@index([checklistId, position])
  @@index([tenantId, systemId, assigneeUserId, isDone, dueAt])
}

model KanbanAttachment {
  id           String   @id @default(cuid())
  tenantId     String
  systemId     String
  cardId       String
  card         KanbanCard @relation(fields: [cardId], references: [id], onDelete: Cascade)
  fileId       String     // → FileAsset.id (ไม่เก็บ bytes/mime ซ้ำ — อ่านจาก FileAsset)
  caption      String?
  source       String   @default("UPLOAD")  // UPLOAD | CHAT | EMAIL | AUTOMATION
  uploadedById String?
  createdAt    DateTime @default(now())
  @@unique([cardId, fileId])
  @@index([cardId, createdAt])
}

model KanbanCardLink {
  id        String        @id @default(cuid())
  tenantId  String
  systemId  String
  cardId    String
  card      KanbanCard    @relation(fields: [cardId], references: [id], onDelete: Cascade)
  linkType  KanbanLinkType
  linkId    String        // id ของวัตถุปลายทาง (URL = เก็บ url ใน label)
  role      String?       // "SOURCE" | "RELATED" | "RESULT"
  label     String?       // snapshot ชื่อไว้แสดงตอนไม่มีสิทธิ์อ่านปลายทาง (ห้ามเก็บยอดเงิน/ข้อมูลอ่อนไหว)
  createdById String?
  createdAt DateTime      @default(now())
  @@unique([cardId, linkType, linkId])
  @@index([tenantId, systemId, linkType, linkId])   // ขาย้อน: "เอกสารนี้ผูกกับการ์ดไหนบ้าง"
}

model KanbanInboxItem {
  id           String  @id @default(cuid())
  tenantId     String
  systemId     String
  ownerUserId  String                  // กล่องนี้เป็นของใคร (ส่วนตัวเสมอ)
  title        String
  note         String?                 // สรุปจาก AI / เนื้ออีเมล
  source       KanbanCardSourceType @default(MANUAL)
  sourceKey    String?                 // idempotency ของขาเข้า เช่น "chat:{messageId}"
  fileIds      Json    @default("[]")  // FileAsset.id[]
  status       KanbanInboxStatus @default(OPEN)
  movedCardId  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@unique([tenantId, sourceKey])
  @@index([tenantId, systemId, ownerUserId, status, createdAt])
}

model KanbanBoardView {
  id          String @id @default(cuid())
  tenantId    String
  systemId    String
  boardId     String?                 // null = มุมมองข้ามบอร์ด (K3.8)
  ownerUserId String?                 // null เมื่อ scope = BOARD
  name        String
  scope       KanbanViewScope @default(PRIVATE)
  config      Json                    // { view, filters:{assignee[],label[],due,q}, sort, group }
  sortOrder   Int    @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([boardId, scope])
  @@index([tenantId, systemId, ownerUserId])
}

model KanbanBoardTemplate {
  id          String   @id @default(cuid())
  tenantId    String?               // null = เทมเพลตกลางของแพลตฟอร์ม (scope.ts = global + why)
  systemId    String?               // null สำหรับเทมเพลตกลาง
  key         String                // "dive-shop" | "hotel" | … (คงที่ ใช้อ้างใน seed/QC)
  name        String
  nameEn      String
  description String?
  icon        String                // ชื่อคีย์ในสไปรต์ AccountIcon
  structure   Json                  // §10
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([tenantId, key])
  @@index([tenantId, isActive, sortOrder])
}
```
(`KanbanBoardStar` · `KanbanCardAssignee` · `KanbanCardLabel` · `KanbanComment` · `KanbanActivity` · `KanbanCustomField(Value)` · `KanbanCardTemplate` · `KanbanWatcher` เขียนตามตาราง 4.3 — รูปแบบเหมือน v1 §4 ทุกประการ เพิ่ม `systemId` และเปลี่ยน `KanbanComment.body` เป็น `String` ≤5000 ที่เก็บ token `@[userId]`)

### 4.4 ตารางที่ **ไม่** สร้าง
- ❌ `KanbanAutomationRule` — ใช้ `AutomationRule` เดิม (D11)
- ❌ ตารางเก็บไฟล์ของตัวเอง — ใช้ `FileAsset` (D4/§9)
- ❌ ตาราง summary/สถิติ — `_CONVENTIONS §2.8` ห้ามโมดูลสร้าง summary เอง · รายงานคิวรีสดจากตารางหลัก (§11.10)

### 4.5 แก้ `prisma/schema/automation.prisma` (K2.9 · เพิ่มคอลัมน์ล้วน)
```prisma
model AutomationRule {
  systemId    String?     // ระบบไหน (null = กฎเดิมระดับร้าน — พฤติกรรมเดิมไม่เปลี่ยน)
  boardId     String?     // null = กฎระดับร้าน (POS/inventory เดิม) · มีค่า = กฎของบอร์ดนั้น
  kind        String  @default("RULE")  // RULE|CARD_BUTTON|BOARD_BUTTON|SCHEDULED|DUE_DATE|EMAIL_REPORT
  conditions  Json    @default("[]")    // [{field, op, value}] — AND ทั้งชุด
  actions     Json    @default("[]")    // [{type, params}] — สูงสุด 20 (ตามที่ UI บอกผู้ใช้)
  scheduleCron String?                  // เฉพาะ kind=SCHEDULED (เวลาไทย)
  lastRunAt   DateTime?
  @@index([tenantId, boardId, enabled])
}
model AutomationRun {
  boardId  String?
  cardId   String?
  @@index([tenantId, ruleId, createdAt])
}
```
🔴 `minAmountSatang` + `actionType` + `actionConfig` เดิม **ห้ามลบ** — กฎเก่าของ POS/inventory ยังอ่านช่องเหล่านั้นอยู่ · เอนจินใหม่อ่าน `actions` ก่อน ถ้าว่างจึงถอยไปใช้ `actionType/actionConfig` เดิม

### 4.6 แผน backfill (สคริปต์ `scripts/kanban-backfill-*.mts` · รันมือ · idempotent · ทำทีละบอร์ด)

| ลำดับ | อะไร | วิธี | ตรวจว่าเสร็จ |
|---|---|---|---|
| 1 | **`position` ของคอลัมน์** | ต่อบอร์ด: อ่านคอลัมน์เรียง `sortOrder,createdAt` → `generateKeyBetween(prev, null)` ไล่ทีละใบ | `COUNT(*) WHERE position IS NULL` = 0 |
| 2 | **`position` ของการ์ด** | ต่อคอลัมน์: เรียง `sortOrder,createdAt` → ไล่ gen เช่นเดียวกัน | เหมือนข้อ 1 |
| 3 | **`cardNo`** | ต่อบอร์ด: เรียง `createdAt` → ตั้ง 1..N ใน transaction → `cardNoSeq = N` · **เพิ่ม `@@unique([boardId, cardNo])` ใน migration ถัดไปหลังยืนยันว่า null หมดแล้ว** | ไม่มีเลขซ้ำ/ว่าง |
| 4 | **`labels Json` → `KanbanLabel`** | ต่อบอร์ด: `SELECT DISTINCT` ชื่อป้ายที่ใช้จริง → สร้าง `KanbanLabel` ไล่สี 6 สีวน → สร้างแถว `KanbanCardLabel` · **คง `labels Json` ไว้อ่านอย่างเดียวอีก 1 รอบ deploy** แล้วค่อยเลิกอ่าน | จำนวนคู่ (การ์ด,ป้าย) เท่าเดิม |
| 5 | **`assigneeUserId` → `KanbanCardAssignee`** | คัดลอกทุกการ์ดที่ `assigneeUserId != null` · **เขียนคู่กันตลอด P1** (สร้าง/แก้ผู้รับผิดชอบต้องอัปเดตทั้ง 2 ที่) | จำนวนแถวใหม่ = จำนวนการ์ดที่มี assignee |
| 6 | **`createdById`** | เติมจาก `KanbanActivity` ถ้ามี · ไม่มีก็ปล่อย null (ไม่เดา) | — |
| 7 | **`emailKey`** (K3.9) | สุ่ม 8 ตัวอักษร base32 ต่อบอร์ด | ไม่ซ้ำใน tenant |

🔴 กติกาการอ่านระหว่างเปลี่ยนผ่าน: **`ORDER BY COALESCE(position, lpad(sortOrder::text, 10, '0'))`** ห้ามอ่าน `position` เดี่ยว ๆ จนกว่าจะยืนยันว่า backfill ครบทั้ง prod
🔴 `prisma migrate diff` **มองไม่เห็น partial index** — ต้องอ่าน SQL ที่ generate ด้วยตาก่อน apply (บทเรียนของรีโป)

---

## 5. Service API

### 5.1 กติกาโครงไฟล์ (บทเรียนของรีโปนี้)
```
src/lib/modules/kanban/
  service.ts        ← เก็บไว้เป็น re-export ชั่วคราว (proposals.ts:19 import * as kanbanSvc — ห้ามพัง)
  boards.ts columns.ts cards.ts ordering.ts labels.ts checklists.ts comments.ts
  attachments.ts activity.ts members.ts search.ts templates.ts inbox.ts views.ts
  automation.ts reports.ts links.ts limits.ts permissions.ts notify.ts events.ts
  actions.ts        ← "use server" — **export ได้เฉพาะ async server action เท่านั้น**
  ui.tsx / components/*.tsx
```
🔴 **กติกา server action ของรีโป:** ไฟล์ที่ขึ้นต้นด้วย `"use server"` ห้าม export อย่างอื่นนอกจาก action (ค่าคงที่/ชนิด/ฟังก์ชันช่วย ต้องอยู่ในโมดูลธรรมดา) — ไม่งั้น build พังแบบอ่านไม่รู้เรื่อง
🔴 ทุก action: `requireTenant()` → `assertKanbanCan()` → `assertBoardRole()` → เรียก service → `revalidatePath()` · **ห้ามเชื่อ `tenantId`/`systemId` จาก formData** (เอาจาก session เสมอ ตามที่ `actions.ts` ทำอยู่แล้ว)
🔴 ทุก service mutation รับ `tx?` optional (ตาม `_CONVENTIONS §2`) และตรวจ `tenantId + systemId` ในทุก `where` (defense-in-depth — ไม่พึ่ง Prisma extension อย่างเดียว)

**ชนิดร่วม:** `type Ctx = { tenantId: string; systemId: string; actorUserId: string }`
**รูปแบบ error:** `throw new KanbanError(code, ข้อความไทย)` — โค้ด: `BOARD_NOT_FOUND` `BOARD_ARCHIVED` `COLUMN_ARCHIVED` `CARD_ARCHIVED` `WIP_LIMIT_EXCEEDED` `POSITION_CONFLICT_RETRY` `LIMIT_REACHED` `FORBIDDEN` `LAST_ADMIN` `COLUMN_NOT_EMPTY` `INVALID_INPUT`

### 5.2 `boards.ts`

| ฟังก์ชัน | ขอบเขต | สิทธิ์ | กิจกรรม/เหตุการณ์ | ข้อผิดพลาด (ข้อความไทย) | ใครเรียก |
|---|---|---|---|---|---|
| `listBoardsHome(ctx, {unitId?, q?})` | `tenantId+systemId` + กรองด้วย `visibleBoardIds()` | `kanban.board.read` | — | — | §3.1 |
| `listStarred(ctx)` | เดียวกัน + `KanbanBoardStar.userId=actor` | `kanban.board.read` | — | — | §3.1 |
| `getBoard(ctx, boardId, {includeArchived})` | + `assertBoardRole ≥ VIEWER` | `kanban.board.read` | — | `BOARD_NOT_FOUND` "ไม่พบบอร์ดนี้" (**404 ไม่ใช่ 403**) | §3.2 |
| `createBoard(ctx, {name, unitId?, visibility, color?, templateId?})` | tx เดียว | `kanban.board.create` | `BOARD_CREATED` | `LIMIT_REACHED` "บอร์ดเต็มเพดานของร้าน — เก็บบอร์ดเก่าเข้าคลังก่อน" | §3.1 · AI `kanban_create_board` |
| `updateBoard(ctx, boardId, patch)` | | ADMIN | `BOARD_UPDATED` + **AuditLog เมื่อเปลี่ยน `visibility`/`unitId`** | `BOARD_ARCHIVED` "บอร์ดนี้อยู่ในคลัง — กู้คืนก่อนจึงแก้ได้" | §3.10 |
| `archiveBoard/unarchiveBoard(ctx, boardId)` | | ADMIN | `BOARD_ARCHIVED/UNARCHIVED` | — | §3.10 |
| `toggleStar(ctx, boardId)` | | VIEWER | — | — | §3.1/§3.2 |
| `duplicateBoard(ctx, boardId, {withCards})` | tx เดียว | `kanban.board.create` | `BOARD_CREATED` | — | §3.2 เมนู ⋯ |

### 5.3 `columns.ts`

| ฟังก์ชัน | สิทธิ์ | กิจกรรม | ข้อผิดพลาด |
|---|---|---|---|
| `createColumn(ctx, boardId, {name, isDoneColumn?})` | ADMIN | `COLUMN_CREATED` | `LIMIT_REACHED` "คอลัมน์เต็ม 20 คอลัมน์แล้ว" |
| `updateColumn(ctx, columnId, {name?, isDoneColumn?, wipLimit?, color?, isCollapsed?})` | ADMIN | `COLUMN_UPDATED` | `INVALID_INPUT` "จำนวนงานพร้อมกันต้องเป็นเลขบวก" |
| `archiveColumn(ctx, columnId)` | ADMIN | `COLUMN_ARCHIVED` | `COLUMN_NOT_EMPTY` "ย้ายการ์ด N ใบออกก่อนจึงเก็บคอลัมน์นี้ได้" · "เก็บคอลัมน์สุดท้ายของบอร์ดไม่ได้" |
| `bulkMoveCardsOut(ctx, columnId, toColumnId)` | ADMIN | `CARD_MOVED` ×N | — |

🔴 **เปลี่ยนพฤติกรรมจากโค้ดวันนี้:** `archiveColumn` ปัจจุบัน (`service.ts:165-176`) **เก็บการ์ดในคอลัมน์ไปด้วยเงียบ ๆ** ⇒ v2 ต้อง block และให้ผู้ใช้เลือก "ย้ายไปคอลัมน์ไหน" ในกล่องเดียวกัน (v1 §11.3)

### 5.4 `cards.ts`

| ฟังก์ชัน | สิทธิ์ | กิจกรรม/เหตุการณ์ | ข้อผิดพลาด |
|---|---|---|---|
| `createCard(ctx, {columnId, title, description?, assigneeUserIds?, labelIds?, dueAt?, startAt?, reminderMinutesBefore?, sourceType?, sourceId?})` | EDITOR | `CARD_CREATED` + outbox `kanban.card.created` · `cardNo` จาก **`UPDATE KanbanBoard SET cardNoSeq = cardNoSeq + 1 WHERE id=… RETURNING cardNoSeq` คำสั่งเดียวใน tx** (D14) | `COLUMN_ARCHIVED` "คอลัมน์นี้ถูกเก็บเข้าคลังแล้ว" · `WIP_LIMIT_EXCEEDED` |
| `getCard(ctx, cardId)` | VIEWER | — | `CARD_NOT_FOUND` |
| `updateCard(ctx, cardId, patch)` | EDITOR | `CARD_UPDATED` / `CARD_DUE_SET` / `CARD_DUE_REMOVED` · แก้ `dueAt`/`reminderMinutesBefore` → **reset `reminderSentAt = null`** | `CARD_ARCHIVED` |
| `updateDescription(ctx, cardId, html)` | EDITOR | `CARD_UPDATED` · sanitize ก่อนเขียนเสมอ (§11.7) | — |
| `setDue(ctx, cardId, {dueAt, startAt?, reminderMinutesBefore?})` | EDITOR | เหมือนบน | — |
| `moveCardToColumn(ctx, cardId, toColumnId)` | EDITOR | เรียก `ordering.moveCard` | — |
| `archiveCard/unarchiveCard(ctx, cardId)` | EDITOR | `CARD_ARCHIVED/UNARCHIVED` · unarchive แล้วคอลัมน์เดิมถูกเก็บ → ลงท้ายคอลัมน์แรก | — |
| `bulkUpdate(ctx, cardIds[], patch)` | EDITOR | กิจกรรมรายใบ · **จำกัด 100 ใบ/ครั้ง** | `LIMIT_REACHED` "เลือกได้ครั้งละไม่เกิน 100 การ์ด" |
| `copyCard(ctx, cardId, {toColumnId})` | EDITOR | `CARD_CREATED` · ก๊อป ชื่อ/รายละเอียด/เช็คลิสต์/ป้าย/ฟิลด์/ไฟล์แนบ · **ไม่ก๊อปวันที่และผู้รับผิดชอบ** | — |
| `saveAsCardTemplate(ctx, cardId)` (K2.7) | ADMIN | — | — |

### 5.5 `ordering.ts` — **หัวใจ (K1.4)**
```ts
moveCard(ctx, { cardId, toColumnId, beforeCardId?, afterCardId?, override? })
  : Promise<{ cardId, columnId, position, completedAt }>
moveColumn(ctx, { columnId, beforeColumnId?, afterColumnId? })
moveChecklistItem(ctx, { itemId, beforeItemId?, afterItemId? })
rebalanceColumn(ctx, columnId)   // เรียกโดย cron หรือเมื่อพบคีย์ยาว >50
```
- **client ส่งได้แค่ id เพื่อนบ้าน ห้ามส่ง position** · server อ่าน position จริงของเพื่อนบ้านใน tx แล้ว `generateKeyBetween()` เอง (v1 §11.1)
- ลำดับใน tx: โหลดการ์ด `FOR UPDATE` → ตรวจ ACTIVE/บอร์ด ACTIVE/สิทธิ์ EDITOR → ตรวจคอลัมน์ปลายทางอยู่บอร์ดเดียวกัน+ACTIVE → **ตรวจ WIP limit** (เกิน = `WIP_LIMIT_EXCEEDED` "คอลัมน์เต็ม — ปิดงานก่อน" · ADMIN ส่ง `override:true` ได้ แล้วบันทึกกิจกรรม) → อ่าน position เพื่อนบ้าน (หายไปแล้ว = แทรกท้ายคอลัมน์ ไม่ error) → เขียน `position` **และ `sortOrder`** (D10) → set/clear `completedAt` ตาม `isDoneColumn`
- **ยอมให้ position ซ้ำได้** (ไม่มี unique) แล้ว tie-break ด้วย `ORDER BY position ASC, id ASC` ⇒ ทุก client เห็นลำดับเดียวกัน
- ย้ายภายในคอลัมน์เดิม → **ไม่เขียน `CARD_MOVED`** (กันประวัติท่วม) แต่อัปเดต `updatedAt` และยิง realtime
- เหตุการณ์: ข้ามคอลัมน์ → outbox `kanban.card.moved` · เข้าคอลัมน์ done → เพิ่ม `kanban.card.completed`

### 5.6 ตารางฟังก์ชันไฟล์ที่เหลือ

| ไฟล์ | ฟังก์ชัน | สิทธิ์ | กิจกรรม/เหตุการณ์ | ข้อผิดพลาดสำคัญ | ผู้เรียก |
|---|---|---|---|---|---|
| `labels.ts` | `listLabels(ctx,boardId)` · `createLabel(ctx,boardId,{name,color})` · `updateLabel` · `deleteLabel` · `setCardLabels(ctx,cardId,labelIds[])` | อ่าน=VIEWER · จัดการ=`kanban.label.manage`+ADMIN | `CARD_LABEL_ADDED/REMOVED` · ลบป้าย = กิจกรรมระดับบอร์ด 1 ครั้ง | `LIMIT_REACHED` "ป้ายกำกับได้สูงสุด 30 ป้ายต่อบอร์ด" · ชื่อซ้ำ → "มีป้ายชื่อนี้แล้ว" | §3.2 · §3.10 |
| `checklists.ts` | `addChecklist` · `renameChecklist` · `removeChecklist` · `addItem` · `updateItem({title?,isDone?,assigneeUserId?,dueAt?})` · `removeItem` · `listMyChecklistItems(ctx,userId)` | EDITOR (`listMy*` = ตัวเอง) | `CHECKLIST_*` · ติ๊กครบทุกข้อ → outbox `kanban.checklist.completed` | `LIMIT_REACHED` "เช็คลิสต์ได้สูงสุด 50 รายการต่อการ์ด" | §3.3 · §3.8 |
| `comments.ts` | `listComments(ctx,cardId,cursor)` · `addComment(ctx,cardId,{body,mentions[]})` · `editComment` (เจ้าของ) · `deleteComment` (เจ้าของ/ADMIN · soft) | `kanban.card.comment` + EDITOR (ADMIN ลบของคนอื่นได้) | `COMMENT_ADDED` + outbox `kanban.comment.added` · แจ้ง mention (§7.4) | mention ที่ไม่มี token ในบอดี้ → `INVALID_INPUT` | §3.3 |
| `attachments.ts` | `listAttachments` · `addAttachment(ctx,cardId,file)` · `removeAttachment` · `setCover(ctx,cardId,fileId\|null)` | `kanban.card.attach` + EDITOR | `ATTACHMENT_ADDED/REMOVED` · `CARD_COVER_SET` | "ไฟล์ใหญ่เกิน 10MB — ย่อขนาดแล้วส่งใหม่ได้เลย" · "แนบได้สูงสุด 20 ไฟล์ต่อการ์ด" · ชนิดไฟล์ไม่รับ (ข้อความจาก `uploadFile`) | §3.3 |
| `activity.ts` | `log(tx, {boardId, cardId?, type, data})` · `listCardActivity(ctx,cardId,cursor)` · `listBoardActivity(ctx,boardId,cursor)` | VIEWER | — (ตัวมันเองคือคนเขียน) | — | ทุกไฟล์ |
| `members.ts` | `listMembers(ctx,boardId)` · `addMembers(ctx,boardId,userIds[],role)` · `changeRole` · `removeMember` · `leaveBoard` · `setAssignees(ctx,cardId,userIds[])` · `listTenantUsers(tenantId)` (มีอยู่แล้ว `service.ts:314`) | `kanban.board.member.manage` + ADMIN (`setAssignees` = EDITOR) | `MEMBER_*` · `CARD_ASSIGNED/UNASSIGNED` + outbox `kanban.card.assigned` · **AuditLog ทุกครั้ง** | `LAST_ADMIN` "ต้องมีผู้ดูแลบอร์ดอย่างน้อย 1 คน — ตั้งคนใหม่ก่อน" | §3.10 · §3.3 |
| `search.ts` | `searchCards(ctx,{q,limit})` ข้ามบอร์ดที่เห็นได้ · `parseQuery(q)` (ไวยากรณ์ §11.9) · `filterCards(ctx,boardId,filters)` | `kanban.board.read` | — | — | §3.1 · §3.2 · AI |
| `templates.ts` | `listBoardTemplates(ctx)` (`tenantId IN (null, ปัจจุบัน)`) · `instantiate(ctx,{templateId,name,unitId,visibility})` · `saveBoardAsTemplate(ctx,boardId,name)` | `kanban.board.create` / `kanban.template.manage` | `BOARD_CREATED` | เทมเพลตปิดใช้งาน → `BOARD_NOT_FOUND` | §3.1 |
| `inbox.ts` (K2.8) | `listInbox(ctx,userId)` · `quickAdd(ctx,{title})` · `addFromSource(ctx,{source,sourceKey,title,note,fileIds})` (idempotent ด้วย `sourceKey`) · `moveToBoard(ctx,{itemId,boardId,columnId,...})` · `dismiss` | ของตัวเองเท่านั้น (ผู้ดูแลก็ดูของคนอื่นไม่ได้) | `CARD_CREATED` เมื่อส่งเข้าบอร์ด | — | §3.8 · consumer §9.2 |
| `views.ts` (K2.5) | `listViews(ctx,boardId)` · `saveView(ctx,{boardId,name,scope,config})` · `updateView` · `deleteView` | `PRIVATE`=เจ้าของ · `BOARD`=ADMIN | — | — | §3.2 · §3.10 |
| `automation.ts` (K2.9) | `listRules(ctx,boardId)` · `createRule` · `updateRule` · `toggleRule` · `dryRun(ctx,rule,{days})` → รายการการ์ดที่ *จะ* ถูกกระทำ (ไม่เขียน DB) · `runForKanbanEvent(evt)` · `listRuns(ctx,boardId)` | `kanban.automation.manage` | `AUTOMATION_RAN` + แถว `AutomationRun` | "1 กฎมีการกระทำได้ไม่เกิน 20 อย่าง" | §3.9 |
| `reports.ts` (K2.10) | `openCards` · `overdue` · `workload` · `throughput` · `aging` · `exportCardsCsv` (ใช้ `src/lib/core/csv.ts`) | `kanban.report.view` | — | — | §3.7 · `/reports` |
| `links.ts` (K3.1) | `listCardLinks(ctx,cardId,viewerUserId)` (resolve + เช็คสิทธิ์รายคน §9.1) · `addLink` · `removeLink` · `listCardsForTarget(ctx,linkType,linkId)` | EDITOR (อ่าน=VIEWER) | `LINK_ADDED/REMOVED` | — | §3.3 · โมดูลอื่น |
| `notify.ts` | `notifyCardAssigned` · `notifyMention` · `notifyDueSoon` · `notifyOverdue` · `sendDigest` — **ทุกตัวเขียน `AppNotification.recipientUserId` เสมอ** | — | — | — | §7.4 |
| `permissions.ts` | `resolveBoardRole()` · `assertBoardRole()` · `visibleBoardIds()` (§6.2) — **pure ที่สุดเท่าที่ทำได้ เพื่อให้ข้อสอบยิงตรงได้** | — | — | `FORBIDDEN` / `BOARD_NOT_FOUND` | ทุกไฟล์ |

### 5.7 Facade ที่เปิดให้โมดูลอื่นเรียก (ไม่ใช่ HTTP)
```ts
kanban.getCardSummary({ tenantId, systemId, cardId, viewerUserId })
  → { ok:true, card:{ id, boardId, cardNo, title, columnName, isDone, dueAt, assignees[] } }
  | { ok:false, reason:'NOT_FOUND'|'NO_ACCESS' }          // ผู้เรียก: Meeting chip, Chat chip
kanban.createCardFromExternal({ tenantId, systemId, boardId, columnId, title, description?,
  sourceType, sourceId, actorUserId, links?: {linkType, linkId, role}[] })
  → { cardId, cardNo }                                    // ผู้เรียก: Chat (K3.2), forms, HR, approval
kanban.listCardsForTarget({ tenantId, systemId, linkType, linkId, viewerUserId })
  → { cards: [...] }                                      // ผู้เรียก: หน้าลูกค้า/เอกสาร แสดง "งานที่เกี่ยวข้อง"
```
🔴 ตรวจสิทธิ์ **ของผู้ดูรายคนทุกครั้ง ห้าม cache ข้าม user** (บทเรียน `reference_authorization_must_not_use_cached_answer`)

---

## 6. สิทธิ์ v2

### 6.1 คีย์สิทธิ์ (แก้ `src/lib/core/permissions.ts:484-499`)

| คีย์ | ป้ายไทย | มีอยู่แล้ว? | ค่าตั้งต้นของ STAFF | WO |
|---|---|---|---|---|
| `kanban.board.read` | เห็นบอร์ดงาน | 🆕 | ✅ เปิด | K1.3 |
| `kanban.board.create` | สร้างบอร์ด | ✅ | ✅ | — |
| `kanban.board.rename` | เปลี่ยนชื่อบอร์ด | ✅ | ❌ | — |
| `kanban.board.delete` | เก็บบอร์ดเข้าคลัง | ✅ | ❌ | — |
| `kanban.board.member.manage` | จัดการสมาชิกบอร์ด | 🆕 | ❌ | K1.3 |
| `kanban.column.create` / `kanban.column.delete` | เพิ่ม/เก็บคอลัมน์ | ✅ | ❌ | — |
| `kanban.card.create` / `.update` / `.move` / `.delete` | การ์ด | ✅ | ✅ / ✅ / ✅ / ✅ | — |
| `kanban.card.comment` | เขียนความเห็น | 🆕 | ✅ | K1.8 |
| `kanban.card.attach` | แนบไฟล์ | 🆕 | ✅ | K1.9 |
| `kanban.label.manage` | จัดการป้ายกำกับ | 🆕 | ❌ | K1.2 |
| `kanban.automation.manage` | ตั้งกฎอัตโนมัติ | 🆕 | ❌ | K2.9 |
| `kanban.report.view` | ดูรายงาน | 🆕 | ❌ | K2.10 |
| `kanban.template.manage` | จัดการเทมเพลตของร้าน | 🆕 | ❌ | K1.12 |

🔴 คีย์ในทะเบียนต้องตรงกับ string ที่ยิงเข้า `assertCan()` **เป๊ะ ๆ** (กติกาข้อ 2 ของ `permissions.ts`)
🔴 `kanban.board.read` เป็นคีย์ที่ **ไม่เคยมี** ⇒ วันนี้ใครมีสิทธิ์โมดูลก็เห็นทุกบอร์ดรวมบอร์ดเงินเดือน/เรื่องร้องเรียน · K1.3 ต้องปิดช่องนี้ · **แผน migration ของสิทธิ์:** membership เดิมที่มี `kanban.*` หรือคีย์ kanban ใด ๆ อยู่แล้ว ให้ถือว่ามี `kanban.board.read` โดยปริยาย (ไม่งั้นคนเดิมเข้าไม่ได้ทันทีหลัง deploy) — เขียนเป็น `IMPLIES` ในโค้ด ไม่ใช่ backfill DB

### 6.2 อัลกอริทึมหาบทบาทในบอร์ด (`permissions.ts` ของโมดูล)

```ts
// ── ชั้น 1: RBAC ของ SHARK ── (src/lib/core/rbac.ts evaluate())
// ── ชั้น 2: บทบาทในบอร์ด ──
type BoardRole = "ADMIN" | "EDITOR" | "VIEWER" | null;   // null = มองไม่เห็นบอร์ดนี้

function resolveBoardRole(m: MembershipCtx, userId: string, board: {
  id: string; unitId: string | null; visibility: "PRIVATE" | "TENANT";
}, membership: KanbanBoardMember | null): BoardRole {
  // 0) ต้องผ่านชั้น 1 ก่อนเสมอ — ไม่มีสิทธิ์โมดูล = มองไม่เห็นอะไรเลย
  if (!evaluate(m, { module: "kanban", action: "kanban.board.read" })) return null;

  // 1) OWNER = ADMIN ทุกบอร์ด (D2) — ไม่ต้องเชิญ
  if (m.role === "OWNER") return "ADMIN";

  // 2) สมาชิกบอร์ดที่ถูกเชิญ = บทบาทที่ระบุ (ชนะข้ออื่นเสมอ ถ้าสูงกว่า)
  const explicit: BoardRole = membership?.role ?? null;

  // 3) MANAGER ที่คุมสาขาของบอร์ดนี้ = EDITOR โดยปริยาย (D2)
  //    board.unitId = null (บอร์ดกลางองค์กร) → ไม่ให้สิทธิ์โดยปริยาย
  const implicitByUnit: BoardRole =
    m.role === "MANAGER" && board.unitId !== null && canAccessUnit(m, board.unitId)
      ? "EDITOR" : null;

  // 4) บอร์ด TENANT = ทุกคนที่ผ่านข้อ 0 เห็นเป็น VIEWER
  const implicitByVisibility: BoardRole = board.visibility === "TENANT" ? "VIEWER" : null;

  // 5) เอาบทบาทที่ "สูงสุด" ของ 3 เส้นทาง — ไม่มีเลย = null
  return highest(explicit, implicitByUnit, implicitByVisibility);   // ADMIN > EDITOR > VIEWER
}

function assertBoardRole(role: BoardRole, need: "VIEWER"|"EDITOR"|"ADMIN") {
  if (role === null) throw new KanbanError("BOARD_NOT_FOUND", "ไม่พบบอร์ดนี้"); // 404 ไม่ใช่ 403
  if (rank(role) > rank(need)) throw new KanbanError("FORBIDDEN", "คุณดูบอร์ดนี้ได้อย่างเดียว");
}
```
**`visibleBoardIds(ctx)`** (ใช้กับทุก list/search/รายงาน — เขียนเป็น `where` เดียว ไม่ใช่กรองใน JS):
```sql
board.tenantId = :tenantId AND board.systemId = :systemId AND (
     :role = 'OWNER'
  OR board.visibility = 'TENANT'
  OR EXISTS (SELECT 1 FROM "KanbanBoardMember" bm WHERE bm."boardId" = board.id AND bm."userId" = :userId)
  OR (:role = 'MANAGER' AND board."unitId" = ANY(:unitAccess))       -- unitAccess = ['*'] → เงื่อนไขเป็นจริงเสมอ
)
```

### 6.3 กติกา 404-not-403
- บอร์ด/การ์ด/ไฟล์แนบ/ช่อง realtime ที่ผู้ใช้ **มองไม่เห็น** → ตอบ **404 "ไม่พบบอร์ดนี้"** ทุกทาง (หน้าเว็บ, server action, facade) — ห้ามบอกว่า "มีอยู่แต่คุณไม่มีสิทธิ์"
- ผู้ใช้ **เห็นได้แต่ทำไม่ได้** (เช่น VIEWER กดแก้) → **403 "คุณดูบอร์ดนี้ได้อย่างเดียว"** และ UI ต้องซ่อนปุ่มนั้นไปแล้วตั้งแต่แรก

### 6.4 ตาราง action × role

| Action | OWNER | MANAGER (สาขาตรง) | MANAGER (สาขาอื่น) | board ADMIN | board EDITOR | board VIEWER | ไม่ใช่สมาชิก + PRIVATE |
|---|---|---|---|---|---|---|---|
| เห็นบอร์ดในรายการ | ✅ ทุกใบ | ✅ | ❌ (PRIVATE) / ✅ (TENANT) | ✅ | ✅ | ✅ | **404** |
| เปิดบอร์ด / ดูการ์ด / ดูกิจกรรม | ✅ | ✅ | ตามบน | ✅ | ✅ | ✅ | 404 |
| สร้างบอร์ด | ✅ | ✅ | ✅ | — | — | — | — |
| แก้ตั้งค่าบอร์ด / เก็บบอร์ด / เปลี่ยน visibility | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | 404 |
| จัดการสมาชิก + บทบาท | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | 404 |
| จัดการคอลัมน์ / ป้ายกำกับ / ฟิลด์กำหนดเอง | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | 404 |
| สร้าง/แก้/ย้าย/เก็บการ์ด · เช็คลิสต์ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | 404 |
| มอบหมาย / กำหนดส่ง / ติดป้ายการ์ด | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | 404 |
| ความเห็น + @กล่าวถึง | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | 404 |
| แนบไฟล์ / ตั้งปก | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | 404 |
| แก้/ลบความเห็นตัวเอง | ✅ | ✅ | — | ✅ | ✅ | — | — |
| ลบความเห็นคนอื่น | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | — |
| ตั้งกฎอัตโนมัติของบอร์ด | ✅ | ❌* | ❌ | ✅* | ❌ | ❌ | 404 |
| ดูรายงาน | ✅ | ✅ | — | — | — | — | — |
| มุมมองที่บันทึกไว้ (ส่วนตัว / ทั้งทีม) | ✅/✅ | ✅/❌ | — | ✅/✅ | ✅/❌ | ✅/❌ | — |
| ออกจากบอร์ดเอง | — | — | — | ✅† | ✅ | ✅ | — |

\* ต้องมีคีย์ `kanban.automation.manage` **และ** เป็น ADMIN ของบอร์ดนั้น
† ADMIN คนสุดท้ายออก/ถูกถอดไม่ได้ → `LAST_ADMIN` (OWNER เป็น ADMIN โดยปริยายเสมอ จึงไม่มีทางไร้คนคุม)

### 6.5 กติกา AuditLog (เขียนผ่านรูปแบบเดียวกับ `writeAudit()` ใน `src/lib/modules/account/access.ts:63`)
เขียน **นอกเหนือจาก `KanbanActivity`** เมื่อ: เพิ่ม/ถอดสมาชิก · เปลี่ยนบทบาทในบอร์ด · เปลี่ยน `visibility` · เปลี่ยน `unitId` ของบอร์ด · เปิด/ปิดกฎอัตโนมัติ · ลบความเห็นของคนอื่น
รูปแบบ: `action = "kanban.member.added" | "kanban.member.role_changed" | "kanban.member.removed" | "kanban.board.visibility_changed" | "kanban.board.unit_changed" | "kanban.automation.toggled" | "kanban.comment.deleted_by_admin"` · `targetType = "KanbanBoard"|"KanbanCard"|"KanbanComment"` · `before`/`after` เก็บเฉพาะฟิลด์ที่เปลี่ยน
🔴 audit ล้มเหลว **ห้าม** ทำ action หลักพัง (ครอบ try/catch เหมือนต้นแบบ)

---

## 7. เหตุการณ์ · แจ้งเตือน · realtime

### 7.1 Outbox events (เพิ่ม 8 · มีอยู่แล้ว 1)
🔴 **กฎเหล็กของรีโป:** เพิ่ม `type` ใหม่ใน outbox = **ต้องลงทะเบียน consumer ที่ `src/lib/outbox-consumers.ts` พร้อมกัน** ไม่งั้นคิวตันทั้งระบบเงียบ ๆ (`reference_outbox_new_event_needs_consumer`)

| event | ยิงเมื่อ | payload | idempotencyKey | consumer |
|---|---|---|---|---|
| `kanban.card.created` | สร้างการ์ดสำเร็จ | `{cardId, boardId, columnId, cardNo, sourceType, sourceId?}` | `kanban.card.created.{cardId}` | `withAutomation(async()=>{})` |
| `kanban.card.moved` | ย้าย**ข้าม**คอลัมน์ | `{cardId, boardId, fromColumnId, toColumnId, actorUserId}` | `kanban.card.moved.{cardId}.{ts}` | `withAutomation(kanbanWatchNotify)` |
| `kanban.card.assigned` | เพิ่มผู้รับผิดชอบ | `{cardId, boardId, assigneeUserId, actorUserId}` | `kanban.assign.{cardId}.{assigneeUserId}` (**คงรูปเดิม** `service.ts:24`) | `withAutomation(async()=>{})` (แจ้งเตือนเกิดในโมดูลแล้ว) |
| `kanban.card.completed` | เข้าคอลัมน์ `isDoneColumn` | `{cardId, boardId, columnId, completedAt}` | `kanban.card.completed.{cardId}.{completedAtISO}` | `withAutomation(closeLinkedTargets)` (K3.4) |
| `kanban.card.due_soon` | cron พบใกล้ถึงกำหนด | `{cardId, boardId, dueAt, assigneeUserIds[]}` | `kanban.due_soon.{cardId}.{dueAtISO}` | `withAutomation(async()=>{})` |
| `kanban.card.overdue` | cron พบเลยกำหนดครั้งแรก | `{cardId, boardId, dueAt, overdueDays}` | `kanban.overdue.{cardId}.{yyyy-mm-dd}` | `withAutomation(async()=>{})` |
| `kanban.checklist.completed` | ติ๊กครบทุกข้อของชุดนั้น | `{cardId, boardId, checklistId}` | `kanban.checklist.completed.{checklistId}` | `withAutomation(async()=>{})` |
| `kanban.comment.added` | ความเห็นใหม่ | `{cardId, boardId, commentId, authorId, mentions[]}` | `kanban.comment.{commentId}` | `withAutomation(async()=>{})` |
| `kanban.board.created` | สร้างบอร์ด | `{boardId, templateKey?}` | `kanban.board.created.{boardId}` | `withAutomation(async()=>{})` |

🔴 **ห้ามใส่เนื้อความ/ชื่อลูกค้าลง payload** — payload วิ่งต่อเข้าเว็บฮุคของร้านโดยอัตโนมัติผ่าน `withWebhooks` (`outbox-consumers.ts:243,334-336`)
ผลพลอยได้: ทุก event ได้ **เว็บฮุคขาออกฟรี** ⇒ ร้านต่อ n8n/Make/Zapier เองได้ (แทน Power-Ups)

### 7.2 `AUTOMATION_EVENTS` (แก้ `src/lib/automation/labels.ts:7-11` — วันนี้มีแค่ 3 รายการ)
```ts
{ value: "kanban.card.created",        label: "เมื่อมีการ์ดใหม่" },
{ value: "kanban.card.moved",          label: "เมื่อการ์ดถูกย้ายคอลัมน์" },
{ value: "kanban.card.assigned",       label: "เมื่อมอบหมายงาน" },
{ value: "kanban.card.completed",      label: "เมื่องานเสร็จ" },
{ value: "kanban.card.due_soon",       label: "เมื่อใกล้ถึงกำหนดส่ง" },
{ value: "kanban.card.overdue",        label: "เมื่อเลยกำหนดส่ง" },
{ value: "kanban.checklist.completed", label: "เมื่อเช็คลิสต์ครบทุกข้อ" },
{ value: "kanban.comment.added",       label: "เมื่อมีความเห็นใหม่" },
```
🔴 `kanban.card.assigned` มี consumer แล้วแต่ **ยังไม่อยู่ในเมนูนี้** ⇒ ผู้ใช้ตั้งกฎกับมันไม่ได้ · เพิ่มพร้อมกันทั้ง 8

### 7.3 ทริกเกอร์/เงื่อนไข/การกระทำของกฎ (K2.9)
- **ทริกเกอร์:** 8 event ข้างบน + `SCHEDULED` (cron ไทย) + `DUE_DATE` (N วันก่อน/หลังกำหนด)
- **เงื่อนไข** (`conditions[]`, AND ทั้งชุด): `column == X` · `label has X` · `assignee is empty|X` · `due within N days` · `card source == CHAT|FORM|…` · `custom field X op value` · `board == this`
- **การกระทำ** (`actions[]`, ≤20): ย้ายคอลัมน์ · ติด/ปลดป้าย · มอบหมาย · ตั้ง/เลื่อนกำหนดส่ง · เพิ่มเช็คลิสต์จากเทมเพลต · เก็บเข้าคลัง · เขียนความเห็น · **แจ้งเตือน (ในแอป + push)** · **เปิดคำขออนุมัติแล้วผูกกลับมาที่การ์ด** · **สร้างการ์ดในบอร์ดอื่น** · ยิงเว็บฮุค
- **ทดลองรันย้อนหลัง (`dryRun`)**: อ่านการ์ด N วันย้อนหลังที่ตรงเงื่อนไข → คืนรายการ "จะทำอะไรกับใบไหน" **โดยไม่เขียนอะไรเลย** (ไม่แม้แต่ `AutomationRun`)

### 7.4 ตารางแจ้งเตือน (D5)

| เหตุการณ์ | ใครได้ | ในแอป (`recipientUserId`) | Expo push | อีเมล | ปิดได้ไหม | กันซ้ำ |
|---|---|---|---|---|---|---|
| ถูก @กล่าวถึงในความเห็น | ผู้ถูกกล่าวถึง | ✅ ทันที | ✅ | ✅ ทันที | **ปิดไม่ได้** | ไม่ notify ตัวเองที่ mention ตัวเอง |
| ถูกมอบหมายงาน | ผู้รับผิดชอบใหม่ | ✅ ทันที | ✅ | ตามค่าตั้ง | **ปิดไม่ได้** | idempotencyKey ต่อ (การ์ด,คน) |
| ถูกเชิญเข้าบอร์ด / เปลี่ยนบทบาท | ผู้ถูกเชิญ | ✅ | ✅ | ✅ | **ปิดไม่ได้** | ต่อ (บอร์ด,คน,บทบาท) |
| ความเห็นใหม่บนการ์ดที่ฉันรับผิดชอบ/ติดตาม | ผู้รับผิดชอบ + ผู้ติดตาม **ยกเว้นคนที่ถูก mention ไปแล้ว** | ✅ | ตามค่าตั้ง | สรุปรายชั่วโมง | ปิดได้ | ตัดคนที่ได้ mention |
| การ์ดที่ฉันติดตามถูกย้าย/เก็บ | ผู้ติดตาม | ✅ | ❌ | สรุป | ปิดได้ | — |
| ใกล้ถึงกำหนดส่ง (`reminderMinutesBefore`) | ผู้รับผิดชอบทุกคน (ไม่มีเลย → ผู้สร้าง) | ✅ | ✅ | ตามค่าตั้ง | ปิดได้ | `reminderSentAt` (at-most-once) |
| เลยกำหนดส่ง | เดียวกัน + ผู้ดูแลบอร์ด | ✅ | ❌ | สรุปรายวัน | ปิดได้ | 1 ครั้ง/การ์ด/วัน |
| สรุปรายวัน/สัปดาห์ (digest) | ทุกคนที่เปิด | ❌ | ❌ | ✅ | ปิดได้ | 1 ฉบับ/คน/รอบ |

- 🔴 **บั๊กที่มีอยู่จริงในโค้ดเดิม:** `notifyAssignment()` ใน `src/lib/modules/kanban/service.ts` เคยเขียน `AppNotification` โดย **ไม่ตั้ง `recipientUserId`** ⇒ ทั้งร้านเห็นว่าใครถูกสั่งงานอะไร ทั้งที่ `automation.prisma:51` มีช่องนี้อยู่แล้ว · **v2 ต้องตั้งค่าเสมอ** และ **เอาชื่อผู้รับออกจาก body** (ไม่ต้องบอกแล้วเพราะยิงตรงคน) · ปิดใน K1.1 หรือ K1.8 ก็ได้ แต่ **K1.8 ต้องตรวจซ้ำด้วยคิวรีจริง** (ดู §13)
- **Expo push รายคน (ใหม่ K3.9):** เพิ่ม `sendPushToUsers(tenantId, userIds[], msg)` ใน `src/lib/core/push.ts` (วันนี้มีแค่ `sendPushToTenant` และ `sendPushToChatStaff` ที่ผูกกับแชท) · best-effort ห้าม throw · เรียก **นอก transaction** เสมอ (network call ขัง Neon pool)
- **ระดับความถี่ 3 ระดับ** (ตาม Trello ที่พิสูจน์แล้ว): ไม่ส่ง / สรุปรายชั่วโมง / ทันที · **อ่านในแอปแล้วไม่ส่งอีเมลซ้ำ**
- ❌ ไม่มี LINE/Telegram หาพนักงาน (D5)

### 7.5 Realtime (D13)
- ช่อง: `kanban:{tenantId}:{systemId}:{boardId}` — เพิ่มฟังก์ชัน `kanbanChannel()` ใน `src/lib/realtime/events.ts` (ไฟล์นั้น **pure** ห้ามมี env/fetch เพราะเบราว์เซอร์ import ด้วย)
- event: `EV_KB_CARD = "kb.card"` · `EV_KB_COLUMN = "kb.column"` · `EV_KB_BOARD = "kb.board"`
- payload = **สัญญาณเปล่า ๆ เท่านั้น** — ต้องเพิ่มคีย์ `boardId`, `cardId`, `columnId`, `rev` เข้า `SAFE_KEYS` (`events.ts:44`) แล้วจอค่อยไปดึงข้อมูลจริงจากเซิร์ฟเวอร์เราเอง · **ห้ามส่งชื่อการ์ด/ชื่อลูกค้าออกไปนอกบ้าน**
- `publish()` **ห้าม throw** (สัญญาข้อ 3 ของ `src/lib/realtime/index.ts`) · ไม่มี `ABLY_API_KEY` = `realtimeMode()` คืน `"polling"` และหน้าจอ poll ทุก 5 วิ — **ทุกฟังก์ชันต้องใช้ได้ครบเหมือนเดิม**
- จอที่เปิดบอร์ดเดียวกันเห็นการ์ดขยับภายใน **2 วินาที** ในโหมด realtime · ≤6 วินาทีในโหมด polling
- ผู้ที่ถูกถอดจากบอร์ดต้องหลุดจากช่อง (ตรวจสิทธิ์ตอนออก token และ re-check ทุก 5 นาที)

### 7.6 Cron

| งาน | เกาะ route ไหน | ความถี่ | กติกาคว้างาน (claim) |
|---|---|---|---|
| เตือนใกล้ถึงกำหนดส่ง | `/api/cron/hourly` (มีอยู่แล้ว) | ทุกต้นชั่วโมง | `updateMany WHERE reminderSentAt IS NULL AND dueAt - interval <= now()` แล้วค่อยส่ง — **atomic claim** กัน cron ซ้อนยิงซ้ำ · batch 500 |
| กวาดเลยกำหนด → `kanban.card.overdue` | `/api/cron/tick` (03:00 BKK) | วันละครั้ง | idempotencyKey มีวันที่ ⇒ ยิงซ้ำในวันเดียวกันไม่เกิดแถวใหม่ |
| อีเมลสรุป (digest) | `/api/cron/tick` | วันละครั้ง | ต่อผู้ใช้: บันทึก `lastDigestAt` ใน `Membership.permissions`? **ไม่** — ใช้ตาราง `AppNotification` เป็นหลักฐานว่าเคยส่งแล้ว ⚠️ สมมติ: แบบไม่ได้ระบุที่เก็บ |
| การ์ดเกิดซ้ำ (recurring · K2.7) | `/api/cron/tick` | วันละครั้ง | สร้างการ์ดใบใหม่จาก `recurrenceParentId` + วันที่ → idempotencyKey `kanban.recur.{parentId}.{yyyy-mm-dd}` |
| rebalance position | `/api/cron/tick` | วันละครั้ง | เฉพาะคอลัมน์ที่มีคีย์ยาว >50 · transaction เดียวต่อคอลัมน์ + ยิง realtime `kb.column` ให้จอ reload |
| กฎ `SCHEDULED` ของบอร์ด | `/api/cron/hourly` | ทุกต้นชั่วโมง | เทียบ `scheduleCron` กับเวลาไทย + `lastRunAt` (กันรันซ้ำในชั่วโมงเดียว) |

🔴 `vercel.json` มี cron แค่ 2 ตัว — **ห้ามเพิ่มตัวที่ 3 โดยไม่ถามเจ้าของ** (ค่าใช้จ่าย + ต้องเปลี่ยน `vercel.json`)
🔴 ห้ามใช้ `getDay()` กับวันที่ไทยตรง ๆ (บทเรียน `reference_thai_date_getday_trap`) — ตัดวันด้วย `+07:00` ที่ประกาศชัด เหมือน `src/app/app/calendar/page.tsx:11-16`

---

## 8. ผู้ช่วย AI

### 8.1 ของที่มีอยู่แล้ว (ห้ามทำซ้ำ)
สกิล `tasks` (`src/lib/ai/skills.ts:170-175`): `kanban_my_tasks` (อ่าน) · `kanban_create_board` (ข้อเสนอ) · `kanban_create_card` (ข้อเสนอ) + `kanban_archive_card` ที่อยู่ใน `DESTRUCTIVE_KINDS` (`proposals.ts:114`) ⇒ ยืนยัน 2 ชั้น

### 8.2 เครื่องมือใหม่ 8 ตัว (K3.5)

| เครื่องมือ | ชนิด | ProposalKind | `KIND_ACCESS` (module/action) | ทำอะไร |
|---|---|---|---|---|
| `kanban_search_cards` | อ่าน | — | — | ค้นการ์ดข้ามบอร์ดด้วยภาษาคน → เรียก `search.searchCards()` |
| `kanban_board_summary` | อ่าน | — | — | สรุปบอร์ด: ค้างกี่ใบ ติดคอลัมน์ไหน ใครโหลดเยอะ |
| `kanban_card_detail` | อ่าน | — | — | อ่านการ์ด 1 ใบพร้อมเช็คลิสต์+ความเห็น |
| `kanban_move_card` | ข้อเสนอ | `kanban_move_card` | `kanban` / `kanban.card.move` | ย้ายการ์ด |
| `kanban_assign_card` | ข้อเสนอ | `kanban_assign_card` | `kanban` / `kanban.card.update` | เพิ่ม/เปลี่ยนผู้รับผิดชอบ |
| `kanban_set_due` | ข้อเสนอ | `kanban_set_due` | `kanban` / `kanban.card.update` | ตั้ง/เลื่อนกำหนดส่ง |
| `kanban_add_checklist` | ข้อเสนอ | `kanban_add_checklist` | `kanban` / `kanban.card.update` | แตกงานเป็นขั้นตอน |
| `kanban_card_from_chat` | ข้อเสนอ | `kanban_card_from_chat` | `kanban` / `kanban.card.create` | อ่านบทสนทนา N ข้อความล่าสุด → เสนอการ์ดพร้อมชื่อ/สรุป/กำหนดส่ง/ลิงก์กลับ (หัวใจของภาพ `09`) |

**ขั้นตอนลงทะเบียน (ลืมข้อใดข้อหนึ่ง = AI เรียกไม่ได้เลยแบบเงียบ ๆ):**
1. เพิ่ม tool object + ใส่ใน `toolRegistry` (`src/lib/ai/tools.ts:2490-2511`)
2. เพิ่มชื่อใน `SKILLS` สกิล `tasks` (`skills.ts:173`)
3. เพิ่ม kind ใน `StaticProposalKind` + `STATIC_KIND_ACCESS` (`proposals.ts:62,131`)
4. เขียน executor ใน `runProposal()` ที่ **เรียก service ของโมดูล ห้ามแตะ Prisma ตรง** (ยกเว้นอ่านชื่อไปทำข้อความผล เหมือน `proposals.ts:877`)
5. ผ่าน `assertSkillRegistryComplete()` + ข้อสอบ `qc-ai-skills`

**สรุปสกิลใหม่ (ภาษาอังกฤษ — เข้า context ตลอด ต้องสั้น):**
`"Task boards: my assigned tasks, search cards, board summary, card detail, create board/card, move, assign, set due, add checklist, create a card from a chat thread."`

### 8.3 กติกาที่ห้ามฝ่าฝืน
- **เสนอก่อนเสมอ** ทุกการเปลี่ยนแปลง (D6) · ตอนกดยืนยัน ตรวจสิทธิ์ของ **คนกดยืนยัน** ไม่ใช่คนที่คุยกับ AI
- ตอนรันจริงต้องเรียก service ของโมดูล **ห้ามแตะ Prisma ตรง**
- prompt ของเครื่องมือเขียน**ภาษาอังกฤษ** (ไทยกิน token 4 เท่า — `reference_llm_thai_token_cost`) แต่ `summary`/ข้อความผลลัพธ์ที่ผู้ใช้เห็นเป็นไทย
- จุดที่ AI โผล่ใน UI: 3 ปุ่มในแถบขวาหลังการ์ด · แผงเตรียมการ์ดจากแชท (ภาพ `09`) · แผงคำแนะนำกฎ (ภาพ `08`) · สรุปอีเมลในกล่องงานเข้า (ภาพ `06`)
- ข้อความจาก AI ในสายกิจกรรมต้องมีป้าย **"ผู้ช่วย AI"** ชัดเจน ห้ามปลอมเป็นคน (ภาพ `03`)

---

## 9. เชื่อมกับโมดูลอื่น

### 9.1 `KanbanCardLink` + ตัวแปลผลรายชนิด (K3.1)

| `linkType` | โมเดลปลายทาง | ป้ายที่แสดง | URL | สิทธิ์ที่ต้องมีจึงเห็นรายละเอียด |
|---|---|---|---|---|
| `PARTY` | `Party` | ชื่อผู้ติดต่อ + "ผู้ติดต่อ (CRM / Party)" | `/app/party/{id}` | `party.contact.read` |
| `CRM_CONTACT` | `CrmContact` | ชื่อ + มูลค่าดีล | `/app/sys/{crmId}/crm/contacts/{id}` | `crm.contact.read` |
| `CHAT_CONVERSATION` | `ChatConversation` | "แชท LINE · {ชื่อ}" + สถานะเคส | `/app/sys/{chatId}?c={id}` | `chat.conversation.read` |
| `ACCOUNT_DOC` | `AccountDocument` | เลขที่ + ยอด + สถานะ | `/app/sys/{accId}/account/documents/{id}` | `account.doc.read` |
| `APPROVAL_REQUEST` | `ApprovalRequest` | หัวข้อ + "รออนุมัติ/อนุมัติแล้ว" | `/app/approval/{id}` | `approval.request.decide` หรือเป็นผู้ยื่น |
| `HR_LEAVE` / `HR_EMPLOYEE` | `HrLeave` / `HrEmployee` | ช่วงวันลา / ชื่อพนักงาน | `/app/sys/{hrId}/hr/...` | `hr.leave.read` · **ห้ามแสดงข้อมูลอ่อนไหว** (`canViewPayroll` แยกต่างหาก) |
| `APPOINTMENT` `HOTEL_RESERVATION` `RENTAL_BOOKING` `SCHOOL_CLASS` | ตามชื่อ | วันเวลา + ชื่อรายการ | ตามโมดูล | สิทธิ์อ่านโมดูลนั้น + เข้าถึง unit |
| `INV_ITEM` | `InvItem` | ชื่อ + รหัส (`อุปกรณ์ #A-102`) | `/app/sys/{invId}/inventory/items/{id}` | `inventory.item.read` |
| `QUEUE_TICKET` / `TICKET_EVENT` | `QueueTicket` / `TicketEvent` | เลขบัตรคิว / ชื่ออีเวนต์ | ตามโมดูล | สิทธิ์อ่านโมดูลนั้น |
| `FORM_SUBMISSION` | `FormSubmission` | หัวข้อฟอร์ม + เวลา | `/app/forms/submissions/{id}` | `forms.submission.read` |
| `KB_ARTICLE` | `KbArticle` | ชื่อบทความ | `/app/kb/{id}` | `kb.article.read` |
| `POS_SALE` `SHOP_ORDER` `RESTAURANT_ORDER` | ตามชื่อ | เลขบิล + ยอด | ตามโมดูล | สิทธิ์อ่านโมดูลนั้น |
| `URL` | — | ข้อความใน `label` | `linkId` = URL (บังคับ `https?:`) | — |

**กติกาการแสดงผล (แบบ §6.1):** ผู้ดูที่ไม่มีสิทธิ์โมดูลปลายทาง → แสดงแถวเป็น **"เอกสารในระบบบัญชี (ไม่มีสิทธิ์เข้าถึง)"** — **ไม่ซ่อนแถว** (ให้รู้ว่ามีของอยู่) และ **ไม่แสดงยอดเงิน/ชื่อลูกค้า**
**กติกาข้อมูล:** เก็บแค่ pointer ไม่ก๊อปข้อมูล · `label` เก็บได้แค่ชื่อสั้น ๆ ไว้แสดงตอนไม่มีสิทธิ์ · ห้ามเก็บยอดเงิน
**ผู้ติดต่อ:** ต้องผ่าน facade `party.safeFindOrCreate()` เท่านั้น ห้ามแตะตาราง `Party` ตรง

### 9.2 การ์ดเกิดจากที่อื่น (inbound consumers · K3.3)
ทุกเส้นทาง **เปิด/ปิดได้รายร้าน** ผ่านสวิตช์ในตั้งค่า (ต้นแบบ: `AccountSystemLink.config.inboxFromChat` ที่ `outbox-consumers.ts:153+`) — ค่าตั้งต้น = **ปิดทุกตัว**

| ต้นทาง (event) | สวิตช์ | ผลลัพธ์ | idempotency |
|---|---|---|---|
| `chat.message.received` | `openTaskFromChat` | ข้อความค้าง > N นาทีโดยไม่มีคนรับ → สร้าง `KanbanInboxItem`/การ์ดในคอลัมน์ "กล่องงานเข้า" + ผูก `CHAT_CONVERSATION` (+ `PARTY` ถ้ามี) | `sourceKey = "chat:{messageId}"` |
| `forms.submission.received` | `cardFromForm` | สร้างการ์ด + เนื้อฟอร์มในรายละเอียด + ผูก `FORM_SUBMISSION` | `sourceKey = "form:{submissionId}"` |
| `approval.request.submitted/approved/rejected` | `cardFromApproval` | สร้าง/อัปเดตการ์ดติดตาม + ผูก `APPROVAL_REQUEST` · ผลอนุมัติกลายเป็นกิจกรรมในการ์ด | `"approval:{requestId}:{status}"` |
| `account.document.approved` · `account.invoice.paid` | `closeCardOnDocApproved` | ปิดการ์ดที่ผูก `ACCOUNT_DOC` นั้น (ย้ายเข้าคอลัมน์ done แรกของบอร์ด) | `"acc:{documentId}:{status}"` |
| `hr.leave.submitted` (**ต้องเพิ่ม event ฝั่ง HR**) | `cardOnLeave` | สร้างการ์ด "หาคนแทน" ในบอร์ดของสาขานั้น มอบหมายหัวหน้าสาขา | `"hrleave:{leaveId}"` |
| `pos.sale.voided` | `cardOnVoidedSale` | ยอดเกินที่ตั้งไว้ → สร้างการ์ดตรวจสอบ + ผูก `POS_SALE` | `"possale:{saleId}"` |
| อีเมลขาเข้า `งาน+{emailKey}@shark.in.th` (K3.9) | `cardFromEmail` | subject → ชื่อ · body → รายละเอียด (sanitize) · ไฟล์แนบ → `FileAsset` | `"email:{messageId}"` |

🔴 โค้ดที่ต้อง "อ่านฝั่งแชท" ต้องอยู่ที่ **composition root** (`src/lib/outbox-consumers.ts`) แล้วส่ง**ข้อมูลดิบ**ให้ facade ของ Kanban — fitness ห้ามเส้น `kanban → chat` ตรง (แบบเดียวกับที่บัญชีทำอยู่)

### 9.3 ย้อนกลับ (outbound · K3.4)
- การ์ดที่ผูก `CHAT_CONVERSATION` **ถูกปิด** → แปะบันทึกภายในในบทสนทนา ("งาน #128 ปิดแล้วโดย ธนา") ผ่าน facade ของแชท
- การ์ดที่ผูก `ACCOUNT_DOC` ถูกปิด → **ไม่แตะสถานะเอกสาร** (เอกสารการเงินต้องเปลี่ยนผ่านโมดูลบัญชีเท่านั้น) แค่เขียนกิจกรรม
- การ์ดถูกเก็บเข้าคลัง → ไม่ทำอะไรกับปลายทาง (กันผลข้างเคียงเกินคาด)

---

## 10. เทมเพลตบอร์ด 6 ชุด (K1.12)

โครง `structure Json`:
```jsonc
{
  "labels":  [{ "key": "urgent", "name": "ด่วน", "color": "RED" }, …],
  "columns": [{ "name": "รอทำ", "isDoneColumn": false, "wipLimit": null,
                "cards": [{ "title": "…", "description": "…",
                            "labelKeys": ["urgent"],
                            "checklist": { "title": "ขั้นตอนงาน", "items": ["…", "…"] } }] }]
}
```
🔴 การ์ดจากเทมเพลต **ไม่มีผู้รับผิดชอบและไม่มีกำหนดส่ง** (ให้ทีมเติมเอง) · `sourceType = TEMPLATE` · สร้างทั้งบอร์ดใน **transaction เดียว** (kill กลางคันแล้วต้องไม่มีบอร์ดครึ่งใบ)

| key | ชื่อ (nameEn) | ไอคอน | คอลัมน์ | ป้ายกำกับ | การ์ดตัวอย่าง (ย่อ) |
|---|---|---|---|---|---|
| `dive-shop` | **ร้านดำน้ำ/ทัวร์ทางน้ำ** (Dive shop operations) | `truck` | กล่องงานเข้า · รอทำ · กำลังทำ · รอตรวจ · เสร็จแล้ว✔ | ด่วน(RED) · งานขาย(BLUE) · ซ่อมบำรุง(AMBER) · ลูกค้า(PURPLE) · เอกสาร(SLATE) · ทีมงาน(GREEN) | เติมถังอากาศก่อนทริป [ซ่อมบำรุง] ☑ นับถังคงเหลือ/เช็คแรงดัน/บันทึกรอบเติม · ทำใบเสนอราคาทริปกลุ่ม [งานขาย] ☑ เช็ควันว่างเรือ/ขอเลขผู้เสียภาษี/คำนวณต้นทุน/ส่งให้ลูกค้า · ตรวจอุปกรณ์หลังทริป [ซ่อมบำรุง] · ต่อทะเบียนเรือ [เอกสาร] · ตอบลูกค้าที่ค้างในแชท [ลูกค้า] |
| `hotel` | **โรงแรม/ที่พัก** (Hotel housekeeping & maintenance) | `home` | แจ้งเข้า · กำลังทำ · รออะไหล่ · ตรวจรับ · เสร็จแล้ว✔ | ด่วน(RED) · ห้องพัก(BLUE) · ส่วนกลาง(GREEN) · ซัพพลาย(AMBER) · ร้องเรียน(PURPLE) | แอร์ห้อง 301 ไม่เย็น [ห้องพัก][ด่วน] ☑ ตรวจหน้างาน/สั่งช่าง/ทดสอบ/แจ้งแขก · เติมของใช้ในห้อง [ซัพพลาย] · ตรวจสระว่ายน้ำประจำสัปดาห์ [ส่วนกลาง] ☑ วัดค่าคลอรีน/ทำความสะอาด/บันทึกผล · เคสร้องเรียนแขก [ร้องเรียน] |
| `restaurant` | **ร้านอาหาร** (Restaurant daily ops) | `shop` | เตรียมร้าน · ระหว่างวัน · ปิดร้าน · ปัญหาที่ต้องแก้ · เสร็จแล้ว✔ | ครัว(AMBER) · หน้าร้าน(BLUE) · วัตถุดิบ(GREEN) · ความสะอาด(SLATE) · ด่วน(RED) | เช็ควัตถุดิบก่อนเปิดร้าน [วัตถุดิบ] ☑ ของสด/ของแห้ง/ของหมดอายุ · สั่งของเข้าครัวรอบสัปดาห์ [วัตถุดิบ] · ทำความสะอาดเครื่องดูดควัน [ความสะอาด] · แก้เมนูขายดีที่ของหมด [หน้าร้าน][ด่วน] · ปิดยอดสิ้นวัน [หน้าร้าน] |
| `clinic` | **คลินิก/สถานพยาบาล** (Clinic operations) | `pig` | นัดหมายวันนี้ · รอเอกสาร · ติดตามผล · เคลม/เบิก · เสร็จแล้ว✔ | ผู้ป่วย(BLUE) · เอกสาร(SLATE) · เวชภัณฑ์(GREEN) · ด่วน(RED) · เครื่องมือ(AMBER) | ติดตามผลผู้ป่วยหลังรักษา [ผู้ป่วย] ☑ โทรติดตาม/บันทึกอาการ/นัดครั้งถัดไป · เบิกเวชภัณฑ์ประจำเดือน [เวชภัณฑ์] · สอบเทียบเครื่องมือ [เครื่องมือ] ☑ นัดผู้ให้บริการ/เก็บใบรับรอง · ยื่นเอกสารเคลมประกัน [เอกสาร] |
| `retail` | **ร้านค้าปลีก** (Retail store) | `box` | งานเข้า · กำลังทำ · รอของ/รออนุมัติ · เสร็จแล้ว✔ | สต็อก(GREEN) · หน้าร้าน(BLUE) · โปรโมชัน(PURPLE) · การเงิน(AMBER) · ด่วน(RED) | นับสต็อกรอบเดือน [สต็อก] ☑ แบ่งโซน/นับ/กระทบยอด/ปรับในระบบ · จัดหน้าร้านตามโปรใหม่ [โปรโมชัน] · สั่งของเติมสินค้าขายดี [สต็อก] · ตรวจยอดเงินสดปลายวัน [การเงิน] |
| `weekly` | **งานประจำสัปดาห์ (ใช้ได้ทุกธุรกิจ)** (Weekly team board) | `calendar` | รอทำ · กำลังทำ · รอคนอื่น · เสร็จแล้ว✔ | ด่วน(RED) · ประจำ(SLATE) · ทีมงาน(GREEN) · ลูกค้า(BLUE) | ประชุมทีมประจำสัปดาห์ [ประจำ] ☑ รวบรวมวาระ/ส่งสรุป · สรุปยอดสัปดาห์ให้เจ้าของ [ประจำ] · เคลียร์งานค้างจากสัปดาห์ก่อน [ด่วน] |

- ทุกเทมเพลตมี **คอลัมน์ done ปิดท้ายเสมอ** (`isDoneColumn = true`) เพื่อให้รายงาน throughput/`completedAt` ทำงานได้ตั้งแต่วันแรก
- `dive-shop` มีคอลัมน์ "กล่องงานเข้า" นำหน้าเพื่อรองรับกฎอัตโนมัติจากแชท (§9.2)
- ป้ายกำกับใช้ได้แค่ 6 สี ⇒ เทมเพลตที่มี >6 ป้ายต้อง **ใช้สีซ้ำ** ไม่ใช่เพิ่มสี
- ทั้ง 6 ชุดเป็น `tenantId = null` (แพลตฟอร์ม) · ร้านบันทึกของตัวเองเพิ่มได้ผ่าน `kanban.template.manage`

---

## 11. Edge cases & กติกา

### 11.1 Fractional indexing (สเปคบังคับ — ห้าม implement อัลกอริทึมเอง · ยกมาจาก v1 §11.1)
- ใช้ไลบรารี **`fractional-indexing`** (Figma-style · base-62 `0-9A-Za-z`): `generateKeyBetween(a: string|null, b: string|null): string` — `(null,null) → "a0"` · แทรกหัว/ท้าย/ระหว่างได้เสมอ · เทียบลำดับด้วย string compare (`ORDER BY position ASC`)
  ✅ เพิ่มลง `package.json` แล้วในสาย K1.x (`fractional-indexing ^4.0.0`) — **ห้ามเขียนอัลกอริทึมใหม่ตามความเข้าใจ** ทุกจุดที่สร้างคีย์ต้องผ่าน `ordering.ts` ไฟล์เดียว
- **server สร้างคีย์เท่านั้น** — client ส่งได้แค่ `beforeCardId/afterCardId` · server อ่าน position จริงของเพื่อนบ้านใน transaction แล้วค่อย gen (กัน client ที่ค้าง cache เขียนคีย์มั่ว)
- **แทรกจุดเดียวกันพร้อมกัน** → position ซ้ำได้ **ยอมให้ซ้ำ** (ไม่มี unique constraint) แล้ว tie-break ด้วย `ORDER BY position ASC, id ASC` ⇒ ทุก client เห็นลำดับเดียวกัน · การลากครั้งถัดไปจะแยกคีย์ออกจากกันเอง
- **เพื่อนบ้านหายระหว่างลาก** (ถูกย้าย/เก็บเข้าคลัง) → fallback แทรกท้ายคอลัมน์ปลายทาง + response บอกตำแหน่งจริง → client reconcile · **ไม่ error ใส่ผู้ใช้**
- **คีย์ยาวขึ้นเรื่อย ๆ** → คีย์ใดในคอลัมน์ยาว **> 50 ตัวอักษร** = เข้าคิว rebalance → transaction เดียว rewrite ทั้งคอลัมน์เป็นคีย์ห่างเท่ากัน (`a0, a1, a2, …`) นอกเวลาใช้งาน + ยิงสัญญาณ realtime ให้จอ reload
- คอลัมน์ · การ์ด · รายการเช็คลิสต์ ใช้กติกาเดียวกันทุกประการ

### 11.2 Concurrency
- ย้ายการ์ดที่คนอื่นเพิ่งเก็บเข้าคลัง → `CARD_ARCHIVED` "การ์ดนี้ถูกเก็บเข้าคลังไปแล้ว" → client เอาการ์ดออกจากบอร์ด
- 2 คนแก้รายละเอียดพร้อมกัน → last-write-wins (autosave debounce 800ms ลดโอกาสชน) + สัญญาณ realtime เตือนอีกฝ่ายว่ามีเวอร์ชันใหม่ · 🔜 field-level version check
- `cardNo` — `UPDATE … SET cardNoSeq = cardNoSeq + 1 … RETURNING` **คำสั่งเดียว** ใน tx เดียวกับ create (D14) · 🔴 อ่าน-แล้ว-เขียนแยกกันคือเลขซ้ำเมื่อยิงพร้อมกัน และ DB จำลองจับไม่ได้ (`reference_atomic_counter_single_statement`)
- cron ซ้อนรอบ → `updateMany WHERE reminderSentAt IS NULL` เป็น claim แบบ atomic ต่อ batch ⇒ การ์ดหนึ่งถูกเตือนรอบเดียว (at-most-once — ยอมพลาดดีกว่าสแปม)
- optimistic UI: server ปฏิเสธ → client คืนการ์ดกลับที่เดิม + toast เหตุผลไทย · `POSITION_CONFLICT_RETRY` → client รีเฟรชเพื่อนบ้านแล้วลองใหม่อัตโนมัติ **1 ครั้ง**

### 11.3 กติกาคอลัมน์ "เสร็จ" และ `completedAt`
- ย้ายเข้าคอลัมน์ที่ `isDoneColumn` → `completedAt = now()` + กิจกรรม `CARD_COMPLETED` + outbox `kanban.card.completed`
- ย้ายออก → `completedAt = null` + `CARD_REOPENED`
- **ปลด flag `isDoneColumn` ออกจากคอลัมน์** → การ์ดที่อยู่ในนั้น **คง `completedAt` เดิม** (ประวัติไม่ย้อน) แต่การ์ดใหม่ที่เข้ามาไม่ถูกตั้งค่า
- ติ๊ก flag ให้คอลัมน์ที่มีการ์ดอยู่แล้ว → **ไม่** ย้อนตั้ง `completedAt` ให้การ์ดเก่า (จะทำให้รายงาน throughput ย้อนหลังเพี้ยน) · แจ้งในกล่องยืนยันว่า "มีผลกับการ์ดที่ย้ายเข้ามาหลังจากนี้เท่านั้น"
- มี `isDoneColumn` ได้หลายคอลัมน์ · "คอลัมน์ done แรก" = คอลัมน์ `isDoneColumn` ที่ position น้อยสุด (ใช้ตอนปัดขวาบนมือถือ / กฎอัตโนมัติ)

### 11.4 WIP limit
- นับเฉพาะการ์ด `status = ACTIVE` ในคอลัมน์นั้น
- **บล็อกเฉพาะการย้าย/สร้างการ์ดเข้าคอลัมน์ที่เต็ม** — ไม่บล็อกการแก้ไขการ์ดที่อยู่แล้ว
- หัวคอลัมน์แสดง `3/3 เต็ม` สีแดง + ข้อความในบอร์ด "คอลัมน์เต็ม — ปิดงานก่อน"
- board ADMIN ส่ง `override: true` ผ่านได้ → บันทึกกิจกรรม `COLUMN_UPDATED { override: true, cardId }`
- ลด `wipLimit` ให้ต่ำกว่าจำนวนการ์ดปัจจุบัน → **อนุญาต** (ไม่บังคับย้ายการ์ดออก) แต่หัวคอลัมน์แสดง `5/3 เกิน` และห้ามย้ายเข้าเพิ่ม

### 11.5 คน/สิทธิ์เปลี่ยนกลางทาง
- **ถอดคนออกจากบอร์ด** → การ์ดที่เขาถือ**ในบอร์ดนั้น**กลายเป็น "ยังไม่มอบหมาย" + แจ้งผู้ดูแลบอร์ด (ตามข้อความในภาพ `10`) · กล่องยืนยันบอกจำนวนการ์ดที่กระทบก่อนเสมอ · รายการเช็คลิสต์ที่มอบหมายให้เขาก็ถูกปลดด้วย
- **ผู้ใช้ถูกลบจาก tenant** → แสดงชื่อในผู้รับผิดชอบ/ความเห็น/กิจกรรมเป็น **"อดีตทีมงาน (ชื่อ)"** · ไม่ลบข้อมูลย้อนหลัง · mention เขาไม่ได้อีก · ไม่แจ้งเตือน
- **@กล่าวถึงคนที่ไม่ใช่สมาชิกบอร์ด PRIVATE** → **เพิ่มเขาเป็น `VIEWER` อัตโนมัติ** + กิจกรรม `MEMBER_ADDED (ผ่านการกล่าวถึง)` + AuditLog แล้วค่อยแจ้ง (จะได้กดลิงก์แล้วไม่เจอ 404) · ถ้าเขาไม่มีสิทธิ์โมดูลเลย → แจ้งว่า "ขอสิทธิ์โมดูลบอร์ดงานจากเจ้าของร้าน"
- **เปลี่ยน `visibility` TENANT → PRIVATE** → คนที่ไม่ใช่สมาชิกหลุดทันที (การ์ดหายจาก "งานของฉัน" ของเขา) · กล่องยืนยันต้องบอกจำนวนคนที่จะหลุด
- **เปลี่ยน `unitId` ของบอร์ด** → สิทธิ์โดยปริยายของ MANAGER เปลี่ยนทันที · เขียน AuditLog
- **บอร์ดผูก unit ที่ถูก PAUSED/ARCHIVED** → บอร์ดใช้ต่อได้ปกติ (metadata) ชิปสาขาแสดงจาง ๆ

### 11.6 เพดาน (`Tenant.limits.kanban.*` — ค่าตั้งต้นอยู่ใน `kanban/limits.ts`)

| อะไร | ค่าตั้งต้น v2 | หมายเหตุ |
|---|---|---|
| บอร์ด ACTIVE / ระบบ | **ไม่จำกัด** (`null`) | D4 · เปิดเพดานได้ภายหลังโดยตั้ง config |
| การ์ด ACTIVE / บอร์ด | **ไม่จำกัด** (`null`) | เดียวกัน · แต่ performance budget §12.1 อ้างอิงที่ 1,000 ใบ |
| คอลัมน์ / บอร์ด | 20 | |
| ป้ายกำกับ / บอร์ด | **30** | D4 |
| ฟิลด์กำหนดเอง / บอร์ด | **20** | D4 (Trello ให้ 50 — เราน้อยกว่าเพื่อกันบอร์ดรก) |
| รายการเช็คลิสต์ / การ์ด | 50 | |
| ไฟล์แนบ / การ์ด · ขนาด/ไฟล์ | **20 ไฟล์ · 10 MB** | D4 — ขนาดอ้าง `CHAT_ATTACHMENT_MAX_BYTES` ห้ามพิมพ์เลขซ้ำ |
| สมาชิก / บอร์ด | 50 | ตรงกับข้อความ "5 คน · สูงสุด 50" ในภาพ `10` |
| การกระทำ / 1 กฎอัตโนมัติ | 20 | ตรงกับข้อความในภาพ `08` |
| การ์ดใน "งานของฉัน" | 500 + แถบเตือน | ห้ามตัดเงียบ ๆ แบบโค้ดวันนี้ (100 ใบ) |
| bulk update / ครั้ง | 100 | |
| storage รวมโมดูล / tenant | 2 GB (เตือน ไม่บล็อก) | นับจาก `FileAsset.bytes` ของไฟล์ที่ผูกกับ `KanbanAttachment` |

เกินเพดาน → `LIMIT_REACHED` พร้อมข้อความไทยที่**บอกทางออก** ("เก็บบอร์ดเก่าเข้าคลังก่อน") ห้ามบอกแค่ว่าเกิน

### 11.7 ความปลอดภัย
- **Rich text (D12):** sanitize ฝั่ง server ทุกครั้งก่อนเขียน DB ด้วย **allowlist** — แท็ก `p br strong em s code ul ol li h3 a` · attribute เฉพาะ `a[href]` และ href ต้องขึ้นต้น `http://` หรือ `https://` (กัน `javascript:`) · render ใส่ `rel="noopener noreferrer" target="_blank"` · แท็ก/attribute นอกรายการ **ตัดทิ้ง** ไม่ escape (ไม่งั้นผู้ใช้เห็น `<script>` เป็นข้อความ)
- **อัปโหลด:** ผ่าน `uploadFile()` ของ `src/lib/storage/service.ts` เท่านั้น (มี allowlist ชนิดไฟล์ + เพดานอยู่แล้ว) · ห้ามสร้างเส้นทางอัปโหลดใหม่
- **ทุก id ใน payload** (`boardId/columnId/cardId/labelId/fileId/userId`) ต้องตรวจ belongs-to-tenant+system ก่อนใช้ — cuid เดายากแต่**ห้ามพึ่งความเดายากแทนการตรวจ**
- **`userId` ที่รับมา** ต้องเป็น `Membership` ของ tenant นี้เสมอ (ตรวจใน service — ไม่ทำ FK ไป `User` เพราะ User เป็น global)
- **ช่อง realtime**: ออก token เฉพาะคนที่ `resolveBoardRole() != null` · payload ไม่มีเนื้อความ (§7.5)
- **ไม่มีสิทธิ์เห็น → 404** ทุกทาง (§6.3)
- Rate limit (ใช้ `src/lib/core/rate-limit*.ts`): mutation 60/นาที/ผู้ใช้ · อัปโหลด 10/นาที · ค้นหา 30/นาที

### 11.8 กติกาตัวกรอง
- ตัวกรองต่างแกน = **AND** (ผู้รับผิดชอบ AND ป้าย AND กำหนดส่ง) · ค่าหลายค่าในแกนเดียว = **OR**
- `assignee=none` = การ์ดที่ยังไม่มอบหมาย · `due=overdue|today|week|none` ตัดวันด้วย **เวลาไทย** เสมอ
- `q` ค้นใน `title` + `#cardNo` (+ description/comment เมื่อทำ full-text ใน P3)
- ตัวกรองที่ทำงานอยู่ **ติดไปทุกมุมมอง** ของบอร์ดเดียวกัน (board/table/calendar/timeline) เพราะอยู่ใน URL
- แสดงผลเสมอว่า "แสดง N จาก M การ์ด" — ตัวเลข M = การ์ด ACTIVE ทั้งบอร์ด
- ล้างตัวกรอง = ลบพารามิเตอร์ออกจาก URL (ไม่ใช่ตั้งค่าว่าง) เพื่อให้ลิงก์สะอาด

### 11.9 ไวยากรณ์ค้นหา (`search.parseQuery`)

| คำ | ความหมาย | ตัวอย่าง |
|---|---|---|
| `#123` | เลขการ์ด | `#128` |
| `@ฉัน` / `@ชื่อ` | ผู้รับผิดชอบ | `@ฉัน เลยกำหนด` |
| `บอร์ด:ชื่อ` | จำกัดบอร์ด | `บอร์ด:ป่าตอง` |
| `คอลัมน์:ชื่อ` | จำกัดคอลัมน์ | `คอลัมน์:รอตรวจ` |
| `ป้าย:ชื่อ` | ป้ายกำกับ | `ป้าย:ด่วน` |
| `เลยกำหนด` / `วันนี้` / `สัปดาห์นี้` / `ไม่มีกำหนด` | กำหนดส่ง | |
| `เสร็จแล้ว` / `ยังไม่เสร็จ` | สถานะ | |
| `ในคลัง` | รวมของที่เก็บเข้าคลัง (ค่าตั้งต้นไม่รวม) | |
| `-คำ` | กลับความหมาย | `-ป้าย:ด่วน` |

- คำที่เหลือ = คีย์เวิร์ด · **รองรับคำอังกฤษคู่กันทุกตัว** (`label:` `board:` `overdue` `is:done` …) เพราะทีมที่ย้ายจาก Trello พิมพ์แบบเดิม
- ค้นได้เฉพาะบอร์ดที่ `visibleBoardIds()` คืนมา · ผลลัพธ์ 20 รายการแรก + "ดูทั้งหมด"

### 11.10 อื่น ๆ
- **หน้าต่างย้อนกลับ (undo) 5 วินาที** — ใช้กับ: ปัดการ์ดบนมือถือ (เสร็จ/เก็บเข้าคลัง) · `z` บนเดสก์ท็อป · เก็บการ์ดเข้าคลัง · ทำงานฝั่ง client (ยิง action ย้อนกลับ) **ไม่ใช่การหน่วงเขียน DB** ⇒ คนอื่นเห็นผลทันทีและเห็นการย้อนกลับทันทีเช่นกัน
- **เก็บบอร์ดเข้าคลัง**: ยืนยันด้วยการพิมพ์ชื่อบอร์ด · ไม่แตะการ์ด/คอลัมน์ (คง state เพื่อกู้คืนตรงเป๊ะ) · การ์ดทั้งบอร์ดหายจาก "งานของฉัน"/รายงาน/ค้นหาทันที (ทุก query กรอง `board.status = ACTIVE`) · คนที่เปิดค้างเห็นแถบ "บอร์ดถูกเก็บถาวร" แล้วอ่านอย่างเดียว
- **เก็บการ์ดเข้าคลังแล้วกู้คืน** ตอนคอลัมน์เดิมถูกเก็บไปแล้ว → ลงท้ายคอลัมน์แรกของบอร์ด + กิจกรรมบอกเหตุผล
- **ลบป้ายกำกับ** → ปลดจากทุกการ์ด + กิจกรรมระดับบอร์ด **ครั้งเดียว** (ไม่ log รายการ์ด)
- **เวลา**: เก็บ UTC · แสดง/จัดกลุ่ม/ปฏิทินตาม `Asia/Bangkok` · "วันนี้" ตัดเที่ยงคืนไทย
- **ไม่มี hard delete** ยกเว้น: `KanbanCardLabel` (join) · `KanbanChecklistItem` · `KanbanCardAssignee` · `KanbanBoardStar` · `KanbanWatcher` · แถว `KanbanAttachment` (ไฟล์จริงลบแบบ async ผ่าน `deleteStoredFile`)
- **รายงานคิวรีสด** ไม่ทำ snapshot (ปริมาณระดับ SME ไหว) · นับเฉพาะบอร์ด ACTIVE · timezone ไทย

---

## 12. Non-functional

### 12.1 งบประมาณประสิทธิภาพ

| อะไร | เพดาน | วัดยังไง |
|---|---|---|
| โหลดหน้าบอร์ด 20 คอลัมน์ × **1,000 การ์ด** | **≤ 1.5 วินาที** (TTFB + render ครั้งแรก) | fixture 1,000 การ์ด · วัด 3 รอบเอาค่ากลาง · **วัดบน prod ไม่ใช่ dev** (dev ไม่ hydrate — `reference_shark_prod_visual_qc`) |
| คิวรีบอร์ด | ≤ 3 คิวรี (บอร์ด+คอลัมน์+การ์ดสรุป) · **ไม่ดึง description/comment ในหน้าบอร์ด** | นับจริง |
| ลากการ์ด (optimistic) | การ์ดขยับ **≤ 16ms** ไม่รอเซิร์ฟเวอร์ · เซิร์ฟเวอร์ตอบภายใน 400ms | |
| ค้นหาข้ามบอร์ด | ≤ 500ms ที่ 10,000 การ์ด | `EXPLAIN` ต้องไม่มี seq scan บน `KanbanCard` |
| "งานของฉัน" | ≤ 800ms | ใช้ index `[tenantId, systemId, userId]` ของ `KanbanCardAssignee` |
| หน้าจอ realtime | เห็นการเปลี่ยนแปลงของคนอื่น ≤ 2 วิ (realtime) / ≤ 6 วิ (polling) | เปิด 2 เบราว์เซอร์ |
| bundle ของหน้าบอร์ด | client component เฉพาะที่จำเป็น (บอร์ด/หลังการ์ด/ตัวกรอง) · ที่เหลือ server component | |

🔴 `next build` ต้องตั้ง `NODE_OPTIONS=--max-old-space-size=3584` (`reference_next_build_node_heap_oom`) · ห้ามรัน typecheck+build+agent พร้อมกันบน VPS

### 12.2 การเข้าถึง (accessibility)
- **เส้นทางคีย์บอร์ดล้วนต้องทำงานได้ครบ**: `j/k` เลือกการ์ด → `Enter` เปิดหลังการ์ด → `Tab` ไล่ทุกช่อง → **`Shift+←/→` ย้ายการ์ดข้ามคอลัมน์** (ทดแทนการลากสำหรับคนที่ลากไม่ได้) → `Esc` ปิด
- โฟกัส: เปิดหลังการ์ด → โฟกัสไปที่ชื่อการ์ด · ปิด → **โฟกัสกลับที่การ์ดใบเดิมบนบอร์ด** · โมดัลต้อง trap focus และมี `aria-modal`
- **ความปลอดภัยกับ IME ไทย** 🔴 ปุ่มลัดตัวอักษรเดี่ยว **ต้องไม่ทำงานเมื่อเคอร์เซอร์อยู่ในช่องพิมพ์** (`input`, `textarea`, `[contenteditable]`) และ **ต้องไม่ทำงานระหว่าง IME composition** (`event.isComposing === true`) — เป็นบั๊กคลาสสิกที่ทำให้พิมพ์ไทยแล้วโดนขโมยโฟกัส
- ต้อง **ปิดปุ่มลัดทั้งหมดได้** ในหน้าตั้งค่าบัญชี (จำเป็นสำหรับผู้ใช้โปรแกรมอ่านหน้าจอ)
- ลากวางต้องมี `aria-live` ประกาศผล ("ย้าย *เติมถังอากาศ* ไปคอลัมน์ กำลังทำ")
- คอนทราสต์ ≥ 4.5:1 ทุกสีป้าย (6 สีผ่านแล้ว) · **ห้ามสื่อความหมายด้วยสีอย่างเดียว** — ชิปกำหนดส่งต้องมีข้อความกำกับ ("เลย 4 วัน") ไม่ใช่แค่สีแดง
- แตะได้ ≥ 44×44px บนมือถือ

### 12.3 i18n — ตารางคำ (จาก แบบ §5.5 · **ห้ามใช้คำอื่นสลับไปมา**)

| อังกฤษ (code) | ไทย (UI) |
|---|---|
| Board | **บอร์ด** |
| List / Column | **คอลัมน์** |
| Card | **การ์ด** (พูดถึงเนื้อหาใช้ "งาน") |
| Label | **ป้ายกำกับ** |
| Due date | **กำหนดส่ง** (ห้ามใช้ "วันครบกำหนด" ในบริบทการ์ด) |
| Start date | **วันเริ่ม** |
| Checklist | **ขั้นตอนงาน** (หัวข้อในการ์ด) / **เช็คลิสต์** (คำทั่วไป) |
| Attachment | **ไฟล์แนบ** · Cover → **ปก** |
| Comment | **ความเห็น** · Activity → **กิจกรรม** |
| Archive | **เก็บเข้าคลัง** (ห้ามใช้ "ลบ") |
| Watch | **ติดตาม** · Member → **สมาชิกบอร์ด** |
| Admin / Normal / Observer | **ผู้ดูแล / แก้ไขได้ / ดูอย่างเดียว** |
| Template | **เทมเพลต** · Automation → **ระบบอัตโนมัติ** · Rule → **กฎ** |
| Card button | **ปุ่มบนการ์ด** · Inbox → **กล่องงานเข้า** |
| Mirror card | **การ์ดสะท้อน** · Custom field → **ฟิลด์กำหนดเอง** |
| WIP limit | **จำกัดงานพร้อมกัน** (หัวคอลัมน์แสดง `3/3 เต็ม`) |
| Saved view | **มุมมองที่บันทึกไว้** |

**สถานะว่าง (ข้อความตรงตามแบบ §5.7 — ทุกอันต้องบอกขั้นต่อไป 1 อย่าง):**

| ที่ไหน | ข้อความ | ปุ่ม |
|---|---|---|
| ยังไม่มีบอร์ดเลย | "ยังไม่มีบอร์ด — เริ่มจากเทมเพลตเร็วกว่าสร้างเอง" + การ์ดเทมเพลต 5 ใบ | เลือกเทมเพลต / สร้างบอร์ดเปล่า |
| บอร์ดใหม่ยังไม่มีการ์ด | "บอร์ดนี้ยังว่าง ลองเพิ่มงานแรกในคอลัมน์ 'รอทำ'" | + เพิ่มการ์ด |
| คอลัมน์ว่าง | เส้นประจาง "ลากการ์ดมาวางที่นี่" | — |
| กรองแล้วไม่เจอ | "ไม่มีการ์ดตรงกับตัวกรอง 2 ข้อนี้" | ล้างตัวกรอง |
| งานของฉันว่าง | "วันนี้ไม่มีงานค้าง 🎉 งานที่หัวหน้ามอบหมายจะมาอยู่ที่นี่" | ดูบอร์ดทั้งหมด |
| กล่องงานเข้าว่าง | "กล่องงานเข้าว่างแล้ว — จดงานใหม่ได้ที่ช่องด้านบน" | — |
| คลังเก็บว่าง | "ยังไม่มีการ์ดที่เก็บเข้าคลัง" | — |
| ยังไม่มีกฎอัตโนมัติ | "ยังไม่มีกฎ — ลองกฎยอดฮิต: ย้ายเข้า 'เสร็จแล้ว' แล้วปิดงานให้อัตโนมัติ" | สร้างจากตัวอย่าง |

🔴 ข้อความ error **ห้ามโทษผู้ใช้** — บอกว่าเกิดอะไรและทำอะไรต่อ ("ไฟล์ใหญ่เกิน 10MB — ย่อขนาดแล้วส่งใหม่ได้เลย") · ห้าม hardcode string ในหน้าจอ (ทุกอันผ่านชั้น i18n TH/EN)

### 12.4 ภาษาออกแบบ (ยึด `src/app/globals.css` + mockup บัญชี V2 ที่เจ้าของเคาะแล้ว — **ห้ามคิดจานสีใหม่**)
- ตัวอักษร **IBM Plex Sans Thai** (โหลดอยู่แล้วใน `src/app/layout.tsx`)
- ขาว `#fff` · พื้นรอง `#fafafa` · **พื้นเวทีบอร์ด `#f4f5f7`** · คอลัมน์ `#eceef1`
- ตัวอักษร `#0a0a0a` / `#404040` / `#737373` / `#a3a3a3` · เส้น `#e5e5e5`
- accent เดียว `#1d4ed8` (พื้นจาง `#e9eefc`) · อันตราย `#b91c1c`
- ป้ายกำกับ = 6 สีจาก `--color-tag-*` เท่านั้น
- มุมโค้ง: ปุ่ม/แถว `8px` · การ์ด `10–12px` · โมดัล `14px` · ชิป/รูปคน วงกลม
- **ชิปกำหนดส่ง** (ความหมายเดียวกับ Trello เพราะทีมคุ้นแล้ว): เทา = ยังไกล · อำพัน = ภายใน 24 ชม. · แดง = เลยกำหนด · เขียว = เสร็จ
- ไอคอน: สไปรต์ SVG inline stroke 1.7 currentColor แบบ `AccountIcon.tsx` — **ห้ามใช้อีโมจิเป็นไอคอนในโมดูลนี้**

---

## 13. เกณฑ์ตรวจรับรายใบงาน (QC)

> 🔴 กติกาการตรวจของ run นี้: **ด่าน parity ด้วยตา** — เปิดภาพหน้าจอจริงคู่กับ mockup ทุกหน้าที่มีภาพ แล้วผ่านด้วยตา ไม่ใช่ผ่านด้วยรายงาน (`feedback_ui_must_match_approved_mockups`)
> ทุก QC ที่แตะฐานข้อมูล ต้อง **เปิดหัวไฟล์ดูก่อนรัน** ว่าชุดนั้นยิง prod หรือไม่ (`reference_shark_qc_suites_hit_prod_db`)

### P1 — เทียบชั้น Trello แกนหลัก

| WO | เรื่อง | เกณฑ์ตรวจรับที่ oracle ต้องยืนยัน |
|---|---|---|
| **K1.1** | ไมเกรชันชุด A + backfill | **DB:** `SELECT count(*) FROM "KanbanCard" WHERE position IS NULL` = 0 และของ `KanbanColumn` = 0 หลังรัน backfill · `cardNo` ไม่ซ้ำ/ไม่ว่างต่อบอร์ด · `cardNoSeq` = max(cardNo) · คอลัมน์ใหม่ทุกตัว nullable หรือมี default (ตรวจ SQL ที่ generate ด้วยตา) · **พฤติกรรม:** เปิดบอร์ดที่มีอยู่เดิม ลำดับการ์ดเหมือนก่อน migrate เป๊ะ (บันทึกลำดับก่อน-หลังเป็นตัวเลข ไม่ใช่ "ดูแล้วเหมือนเดิม") |
| **K1.2** | ป้ายกำกับ + ผู้รับผิดชอบหลายคน | **DB:** จำนวนคู่ (การ์ด,ป้าย) ใน `KanbanCardLabel` = จำนวนคู่ที่นับได้จาก `labels Json` เดิม · `KanbanCardAssignee` มีแถวครบทุกการ์ดที่ `assigneeUserId != null` · **พฤติกรรม:** สร้างป้ายที่ 31 → `LIMIT_REACHED` · ชื่อป้ายซ้ำในบอร์ดเดียวกัน → ปฏิเสธ · แก้ผู้รับผิดชอบแล้วทั้ง `assigneeUserId` และ `KanbanCardAssignee` ตรงกัน (dual-write) |
| **K1.3** | สมาชิก + สิทธิ์ 2 ชั้น + คีย์ใหม่ | **สิทธิ์:** STAFF ที่ไม่ใช่สมาชิกยิง `getBoard` ของบอร์ด PRIVATE → **404** (ไม่ใช่ 403) · MANAGER สาขา A เปิดบอร์ด `unitId=A` ได้เป็น EDITOR โดยไม่ถูกเชิญ · MANAGER สาขา A เปิดบอร์ด PRIVATE ของสาขา B → 404 · OWNER เปิดได้ทุกบอร์ด · VIEWER ยิง mutation ทุกตัว → 403 · ถอด ADMIN คนสุดท้าย → `LAST_ADMIN` · **DB:** มี `AuditLog` ครบทุกครั้งที่เพิ่ม/ถอด/เปลี่ยนบทบาท/เปลี่ยน visibility · **ทะเบียน:** ทุกคีย์ใหม่มีใน `permissions.ts` และตรงกับ string ที่ `assertCan` ใช้ (grep เทียบ) |
| **K1.4** | fractional indexing + API ย้าย | ลากใน/ข้ามคอลัมน์ → ตำแหน่งคงอยู่หลังรีเฟรช · เปิด 2 เบราว์เซอร์ลากลงจุดเดียวกันพร้อมกัน → **ทั้งคู่จบด้วยลำดับเดียวกัน ไม่มี error ใส่ผู้ใช้** · แทรกจุดเดิม 60 ครั้ง → คีย์ยาวเกิน 50 → job rebalance ทำงานแล้ว**ลำดับไม่เปลี่ยน** · ส่ง `beforeCardId` ที่ถูก archive ไปแล้ว → การ์ดไปท้ายคอลัมน์ ไม่ error · WIP เต็ม → `WIP_LIMIT_EXCEEDED` + ADMIN override ผ่านและมีกิจกรรมบันทึก · ย้ายเข้าคอลัมน์ done → `completedAt != null` · ย้ายออก → `null` |
| **K1.5** | ลากวางเดสก์ท็อป + optimistic | **ภาพ:** เทียบ `02-board.png` — การ์ดที่ยกอยู่เอียง+เงา · เส้นประจุดวางสีน้ำเงิน · **พฤติกรรม:** จำลอง server ตอบ 409 ทุกโค้ด → การ์ดเด้งกลับที่เดิม + toast ภาษาไทยถูกข้อความ · ไม่มีหน้ากระพริบ (ไม่ full reload) |
| **K1.6** | หลังการ์ด | **ภาพ:** เทียบ `03-card-back.png` ทีละบล็อก — เมนู "เพิ่ม:" ใต้ชื่อ · บล็อกเชื่อมข้อมูลอยู่เหนือรายละเอียด · แถบขวา 5 กลุ่ม · **พฤติกรรม:** แก้ทุกฟิลด์ (ไทย+อังกฤษ+ลิงก์) แล้ว reload ข้อมูลไม่หาย · `?card=` เปิดตรงได้ · กด back ปิดโมดัลไม่ใช่ออกจากบอร์ด · **ความปลอดภัย:** ยิง payload XSS ชุดมาตรฐานลงรายละเอียด → render ปลอดภัย ไม่มี `<script>`/`javascript:` เหลือ |
| **K1.7** | เช็คลิสต์ | หลายชุดต่อการ์ด · มอบหมาย+กำหนดส่งรายรายการ · ติ๊กครบ → outbox `kanban.checklist.completed` เกิด 1 แถว · รายการที่มอบหมายให้ฉันโผล่ในหน้า "งานของฉัน" · เพิ่มรายการที่ 51 → `LIMIT_REACHED` |
| **K1.8** | ความเห็น + @กล่าวถึง + แจ้งเตือนตรงคน | 🔴 **หลักฐานตรง:** `SELECT "recipientUserId" FROM "AppNotification" WHERE title='ได้รับมอบหมายงาน'` → **ไม่เป็น null** · ผู้ใช้คนอื่นเปิด `/app/notifications` **มองไม่เห็นแถวนั้น** · mention ตัวเอง → ไม่มีแจ้งเตือน · mention คนนอกบอร์ด PRIVATE → เขาถูกเพิ่มเป็น VIEWER + มี `AuditLog` + กดลิงก์แล้วเข้าได้ (ไม่ 404) · mentions ที่ไม่มี token ในบอดี้ → `INVALID_INPUT` |
| **K1.9** | ไฟล์แนบ + ปก | ไฟล์ 11 MB → ถูกปฏิเสธพร้อมข้อความไทย · ไฟล์ที่ 21 → `LIMIT_REACHED` · ชนิดไฟล์นอก allowlist → ปฏิเสธ · แถว `KanbanAttachment` อ้าง `FileAsset.id` จริง (join ได้) · ตั้งปกแล้วการ์ดบนบอร์ดแสดงปก · ลบไฟล์ → แถวหาย + object ถูกลบแบบ async |
| **K1.10** | ประวัติกิจกรรม + AuditLog | ทำครบ 12 การกระทำ → มีแถว `KanbanActivity` ครบ 12 ชนิดตรงตาม enum · จัดลำดับในคอลัมน์เดิม → **ไม่เกิด** `CARD_MOVED` · กิจกรรมแก้/ลบไม่ได้ (append-only — ตรวจว่าไม่มี `update`/`delete` ในโค้ด) |
| **K1.11** | ตัวกรอง + ค้นหา + URL + `Ctrl K` | คัดลอก URL ที่มีตัวกรองไปเปิดอีกเบราว์เซอร์ → **เห็นชุดการ์ดเดียวกันเป๊ะ** · ข้อความ "แสดง N จาก M" ตรงกับที่นับมือ · `#128` ค้นเจอการ์ดเดียว · `@ฉัน เลยกำหนด` คืนเฉพาะการ์ดของตัวเองที่เลยกำหนดตามเวลาไทย · ค้นหาไม่คืนบอร์ดที่ไม่มีสิทธิ์เห็น (ยิงด้วยบัญชี STAFF เทียบกับ OWNER) |
| **K1.12** | เทมเพลต 6 ชุด + หน้ารวมบอร์ดใหม่ | สร้างจากทั้ง 6 เทมเพลต → คอลัมน์/การ์ด/เช็คลิสต์/ป้ายตรง `structure` ทุกตัว · **atomic** (kill กลางคัน → ไม่มีบอร์ดครึ่งใบ) · การ์ดจากเทมเพลตไม่มีผู้รับผิดชอบและไม่มีกำหนดส่ง · ทุกเทมเพลตมีคอลัมน์ `isDoneColumn` · **ภาพ:** เทียบ `01-boards-home.png` — 4 แถบครบตามลำดับ |
| **K1.13** | มือถือ | **บนเครื่องจริง (iOS Safari + Android Chrome)**: กดค้าง 0.3 วิ ยกการ์ดได้ · ลากถึงขอบจอ auto-scroll · ปัดขวา = เข้าคอลัมน์ done แรก · ปัดซ้าย = เก็บเข้าคลัง · **ปุ่มย้อนกลับ 5 วินาทีทำงานจริง** · หลังการ์ดเต็มจอ + ช่องความเห็นติดขอบล่างไม่ถูกคีย์บอร์ดบัง · **ภาพ:** เทียบ `07-mobile.png` ทั้ง 3 จอ |
| **K1.14** | ปุ่มลัด · สถานะว่าง · realtime · คลังเก็บ | ปุ่มลัดทุกตัวใน §3.2 ทำงาน · **พิมพ์ไทยในช่องชื่อการ์ดแล้วกด `f`/`c`/`n` ต้องไม่ทริกเกอร์อะไร** (ทดสอบทั้งขณะ IME composition) · ปิดปุ่มลัดในตั้งค่าแล้วเงียบทั้งหมด · สถานะว่างครบ 8 จุดตามตาราง §12.3 พร้อมปุ่ม · เปิด 2 จอ ย้าย/คอมเมนต์/เก็บ → อีกฝั่งเห็นภายใน 2 วิ (มีกุญแจ Ably) และ ≤6 วิ (ไม่มีกุญแจ — **ต้องทดสอบโหมด polling ด้วย**) · หน้าคลังเก็บกู้คืนได้ทั้งการ์ดและคอลัมน์ |

### P2 — มุมมอง + อัตโนมัติ + รายงาน

| WO | เกณฑ์ตรวจรับ |
|---|---|
| **K2.1** ตาราง | **ภาพ** เทียบ `04-table.png` · แก้ค่าในช่องแล้ว DB เปลี่ยนจริง · เลือก 2 การ์ดแล้ว bulk ทั้ง 5 การกระทำ · CSV ที่ส่งออกเปิดใน Excel ภาษาไทยไม่เพี้ยน (BOM) · จำนวนแถว = จำนวนการ์ดที่กรองได้ |
| **K2.2** ปฏิทิน | **ภาพ** เทียบ `05-calendar.png` · ลากการ์ดจากถาดลงวัน → `dueAt` เปลี่ยนเป็นวันนั้นเวลาไทย · สวิตช์ "แสดงงานจากระบบอื่น" ดึงจาก `/app/calendar` จริงและ**อ่านอย่างเดียว** (ลากไม่ได้) |
| **K2.3** ไทม์ไลน์ (เลื่อนออกได้) | แถบตรงช่วง `startAt→dueAt` · ลากขอบแล้วค่าใน DB เปลี่ยน · มือถือแสดงข้อความชวนไปมุมมองตาราง |
| **K2.4** สรุป | ตัวเลขทุกไทล์ตรงกับที่นับมือจาก fixture · **กดไทล์แล้วเจาะลงได้** และจำนวนแถวที่ได้ = ตัวเลขในไทล์ |
| **K2.5** มุมมองที่บันทึกไว้ | มุมมองส่วนตัวคนอื่นมองไม่เห็น · มุมมองทั้งทีมสร้างได้เฉพาะ ADMIN · โหลดแล้ว URL เปลี่ยนตาม config |
| **K2.6** ฟิลด์กำหนดเอง | 5 ชนิดครบ · ฟิลด์ที่ 21 → `LIMIT_REACHED` · ค่าที่กรอกไปแล้วไม่หายเมื่อซ่อนฟิลด์ · กรอง/เรียงตามฟิลด์ได้ในมุมมองตาราง |
| **K2.7** เทมเพลตการ์ด + เกิดซ้ำ | สร้างการ์ดจากเทมเพลต → ก๊อป ชื่อ/รายละเอียด/เช็คลิสต์/ป้าย/ฟิลด์ **ไม่ก๊อปวันที่** · รัน cron 2 รอบในวันเดียวกัน → การ์ดเกิดซ้ำ **1 ใบ** (idempotencyKey) |
| **K2.8** กล่องงานเข้า | **ภาพ** เทียบ `06-my-tasks.png` · Enter จดงานแล้วรายการโผล่ทันที · "ส่งเข้าบอร์ด" กลายเป็นการ์ดจริงและ `status=MOVED` · ผู้ดูแลเปิดกล่องของคนอื่นไม่ได้ (404) · ยิง event ขาเข้าซ้ำ → ไม่เกิดรายการซ้ำ (`sourceKey`) |
| **K2.9** ตัวสร้างกฎ | **ภาพ** เทียบ `08-automation.png` · กฎอ่านเป็นประโยคไทยได้ · **ทดลองรันแล้วไม่มีแถวใหม่ใน DB เลย** (ตรวจ count ก่อน-หลัง) · บันทึกกฎแล้วยิง event จริง → เกิด `AutomationRun` สถานะ OK · กฎที่มี 21 การกระทำ → ปฏิเสธ · `AUTOMATION_EVENTS` มีครบ 8 รายการและโผล่ใน dropdown · **ทุก event ใหม่มี consumer** (grep เทียบ `emitOutbox` กับ registry) |
| **K2.10** รายงาน | ตัวเลขทั้ง 5 รายงานตรงกับ fixture ที่นับมือ · export CSV ครบ · `EXPLAIN` ไม่มี seq scan บน `KanbanCard` |
| **K2.11** digest + ติดตาม | ติดตามการ์ด/คอลัมน์/บอร์ดแล้วได้แจ้งเตือนตามตาราง §7.4 · คนที่ถูก mention **ไม่ได้แจ้งเตือนซ้ำ 2 ใบ** · digest ส่ง 1 ฉบับ/คน/รอบ · ตั้งความถี่ "ไม่ส่ง" แล้วเงียบจริง |

### P3 — เชื่อมทุกโมดูล + AI

| WO | เกณฑ์ตรวจรับ |
|---|---|
| **K3.1** `KanbanCardLink` | ผูกครบทุก `linkType` ที่เปิดใช้ · ผู้ดูที่ไม่มีสิทธิ์โมดูลปลายทางเห็น "(ไม่มีสิทธิ์เข้าถึง)" **และไม่เห็นยอดเงิน/ชื่อลูกค้า** · เปลี่ยนสิทธิ์ผู้ดูแล้วผลลัพธ์เปลี่ยนทันที (**ไม่มี cache ข้าม user**) · ขาย้อน `listCardsForTarget` คืนการ์ดถูกใบ |
| **K3.2** สร้างงานจากแชท | **ภาพ** เทียบ `09-from-chat.png` · สวิตช์ปิดอยู่ = ปุ่มไม่โผล่ · สร้างแล้วได้การ์ด + `KanbanCardLink` ชนิด `CHAT_CONVERSATION` (+`PARTY`) · โค้ดไม่มี import จาก `kanban` ไป `chat` ตรง (fitness ผ่าน) |
| **K3.3** การ์ดจากฟอร์ม/ลา/อนุมัติ/คิว | ยิง event ซ้ำ 3 ครั้ง → การ์ดเกิด 1 ใบ · สวิตช์ปิด = ไม่มี query เพิ่มเลย (early return) · ทุก event ใหม่มี consumer ลงทะเบียนแล้ว |
| **K3.4** ย้อนกลับ | ปิดการ์ดที่ผูกแชท → มีบันทึกภายในโผล่ในบทสนทนา · ปิดการ์ดที่ผูกเอกสารบัญชี → **สถานะเอกสารไม่เปลี่ยน** มีแค่กิจกรรม |
| **K3.5** เครื่องมือ AI 8 ตัว | `assertSkillRegistryComplete()` ผ่าน + ข้อสอบ `qc-ai-skills` เขียว · ทุกตัวที่เขียนเป็น **ข้อเสนอ** (ไม่มีตัวไหนลงมือทันที) · กดยืนยันด้วยบัญชีที่ไม่มีสิทธิ์ → ถูกปฏิเสธ (ตรวจสิทธิ์คนกดยืนยัน) · executor เรียก service ไม่แตะ Prisma ตรง |
| **K3.6** คำแนะนำกฎจาก AI | คำแนะนำอ้างพฤติกรรมจริงที่นับได้จาก `KanbanActivity` (ไม่ใช่ข้อความแต่ง) · กด "สร้าง" แล้วได้กฎที่แก้ได้ก่อนบันทึก |
| **K3.7** การ์ดสะท้อน | แก้ที่ไหนก็เห็นเหมือนกัน · เก็บต้นฉบับเข้าคลัง → ตัวสะท้อนไม่หาย แต่ขึ้นสถานะ |
| **K3.8** มุมมองข้ามบอร์ด | เห็นเฉพาะบอร์ดที่มีสิทธิ์ · ตัวกรองบันทึกได้ทั้งส่วนตัว/ทั้งทีม |
| **K3.9** อีเมลเข้าบอร์ด + push รายคน | ส่งอีเมลเข้า `งาน+{emailKey}@` → เกิดการ์ดพร้อมไฟล์แนบ · ส่งซ้ำ (`messageId` เดิม) → ไม่เกิดซ้ำ · `sendPushToUsers` ส่งเฉพาะเครื่องของคนที่ระบุ (นับ `sent`/`skipped` ให้ตรง **ห้ามโกหกตัวเลข**) |

### เกณฑ์ตัดขวางที่ตรวจทุกใบงาน
- [ ] **Isolation:** ยิง id ข้าม tenant/ข้าม systemId ทุก endpoint/action → 404 ทุกครั้ง (รวม facade, ช่อง realtime, ไฟล์แนบ)
- [ ] **ไม่มี hard delete** บนบอร์ด/คอลัมน์/การ์ด/ความเห็น — grep หา `.delete(`/`deleteMany(` แล้วต้องเจอเฉพาะตารางที่อนุญาตใน §11.10
- [ ] **ไม่มี string hardcode** ในหน้าจอ · TH/EN สลับได้ · **เรนเดอร์ดูทุกภาษาก่อนส่ง**
- [ ] **`childrenFor("KANBAN")` กับ `kanbanTabs()` ตรงกัน** — `scripts/qc-nav-functions.mts` เขียว
- [ ] ทุก migration เป็น additive · อ่าน SQL ที่ generate ด้วยตาก่อน apply · `prisma migrate status` ไม่มีค้าง
- [ ] `pnpm qc:all` เขียว (🔴 ห้ามรัน build/typecheck/agent พร้อมกันบน VPS)
- [ ] **QC เห็นภาพ**: มีภาพหน้าจอจริงของทุก surface ที่มี mockup วางคู่กัน และผ่านด้วยตา
