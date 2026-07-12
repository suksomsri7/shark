# SHARK — พิมพ์เขียวการเชื่อมทั้ง 18 ระบบ (Connection Matrix)

> Fable 5, 2026-07-12 — ตอบโจทย์เจ้าของ: "ทุกระบบเชื่อมกัน โดยเฉพาะระบบที่ 18"
> คู่กับ `BLUEPRINT_SYSTEMS.md §3` (กลไก link) + `modules/_CONVENTIONS.md §2` (contracts 2.1-2.8)
> กติกาเดิมคงเดิม: เชื่อม = **opt-in** เสมอ · ไม่เชื่อม = ทำงานเดี่ยวได้ · side effects วิ่ง outbox กลาง

## 1. ตารางเชื่อมรวม (แถว = ระบบ, คอลัมน์ = เชื่อมกับใคร ทำอะไร)

| # | ระบบ | เชื่อมออก (เรียกใคร) | ถูกเชื่อมเข้า (ใครเรียก) |
|---|---|---|---|
| 1 | Hotel | POS(2.1 ROOM_CHARGE/settle) · Member(2.6 check-in) · Account(via POS) · **INV(minibar/amenity ตัดสต็อก C-1)** · **HR(กะแม่บ้าน C-2)** · Chat(แจ้ง booking) · Coupon/Point(via POS) | POS(chargeToRoom) · Ticket(แพ็กเกจห้อง+ตั๋ว 🔜) · AI(tools) |
| 2 | Restaurant | POS(2.1 ปิดบิล) · Member/Point/Coupon(via POS) · **INV(BOM ตัดวัตถุดิบ C-1)** · **HR(กะครัว C-2)** · Q(คิวหน้าร้าน) | AI · Chat(สั่งผ่านแชท 🔜) |
| 3 | Booking | POS(2.1 ปิดงานออกบิล ✅) · Member(2.6 จอง→สมาชิก ✅) · **HR(C-2: พนักงานลา→slot ปิดอัตโนมัติ)** · Notify(2.5 ยืนยันนัด) | Chat(จองจากแชท) · AI(จัดคิว/สรุป) |
| 4 | Q บัตรคิว | Notify(เรียกคิว) · Member(สะสมประวัติ) | Restaurant(คิวโต๊ะ) · Chat(กดคิวจากแชท) · AI |
| 5 | Ticket | POS(2.1 PENDING_PAYMENT) · Member · Coupon · **INV(ของที่ระลึก/สินค้าหน้างาน)** | Chat(ขายตั๋วในแชท) · AI |
| 6 | Member | Notify(2.5) · Point/Reward/Coupon(โปรไฟล์เดียวกัน) | ทุกระบบ business (2.6 memberId เสมอ) · Chat(identify ลูกค้า) · AI |
| 7 | Reward | Point(2.2 burn) · Member · Notify | Chat/AI(เช็ค/แลกรางวัลจากแชท) |
| 8 | Coupon | Member(consent 2.5) | POS(2.3 validate/redeem/release) · ทุก business via POS · Chat(แจกคูปองในแชท) · AI(campaign) |
| 9 | Point | — (เป็น ledger ปลายทาง) | POS(2.2 earn/burn/reverse) · Reward(burn) · Member(แสดง) · AI |
| 10 | Chat | Member(2.6 findOrCreate จาก LINE/FB id) · Booking/Q/Ticket(สร้างรายการจากแชท) · Coupon(แจก) · **KB(C-5 ตอบอัตโนมัติ)** · **AI(C-3 draft ตอบ)** · Notify(2.5 ช่องทางส่ง LINE) | ทุกระบบ (ส่งข้อความหาลูกค้า = notify ผ่าน channel ที่เชื่อม) |
| 11 | Meeting | — | **ทุกระบบ = producer แจ้งเตือนเข้า channel** (ลารออนุมัติ C-2, สต็อกใกล้หมด C-1, Daily Brief จาก AI, บิลใหญ่, support case) · Kanban(การ์ดจากข้อความ) |
| 12 | Account | — (ปลายทาง GL) | POS(2.4 postSale/Refund/Void ✅) · **INV(C-1 มูลค่าสต็อก/ปรับยอดตรวจนับ)** · **HR(C-2 payroll P2 → เงินเดือน+ภงด.1)** · ทุก business via POS · AI(อ่านงบ/สร้าง draft เอกสาร) |
| 13 | Kanban | Meeting(แจ้งการ์ด) · HR(assignee = พนักงาน) | Ticket/Chat(เคส→การ์ด) · AI(สร้าง/ย้ายการ์ด) |
| 14 | POS | Point(2.2) · Coupon(2.3) · Account(2.4) · Member(2.6 recordSpend) · **INV(C-1 ขายแล้วตัดสต็อก)** | Hotel/Restaurant/Booking/Ticket (2.1 — จุดตัดเงินเดียวของทั้งแพลตฟอร์ม) · AI(สรุปยอด) |
| 15 | AI พนักงาน | **ทุกระบบผ่าน tool layer (C-3)** — อ่านได้ตาม permission, เขียนผ่าน DRAFT+confirm · KB(C-5 หาความรู้) · Meeting(Daily Brief) · Chat(ตอบลูกค้า) | ผู้ใช้สั่งงานทางแชท |
| 16 | KB | — | AI(C-5 L1 context→L2 trgm→L3 vector) · Chat(auto-answer) · พนักงาน(ค้นเอง) |
| 17 | HR | **Booking(C-2 ปิด slot)** · Restaurant/Hotel(กะ staff) · **Account(C-2 payroll P2)** · Meeting(แจ้งใบลา) · Notify(2.5 ผลอนุมัติ) | AI("ใครสายบ่อยสุด") · Kanban(assignee) |
| 18 | **Inventory** | **Account(C-1 มูลค่า/ปรับยอด)** · Meeting/Notify(แจ้งใกล้หมด) | **POS(ขายตัด) · Restaurant(BOM) · Hotel(minibar) · Ticket(ของที่ระลึก) · Account(ซื้อ→รับเข้า, ใบเบิก/ส่งคืน) · AI("เหลือกี่ชิ้น"/เสนอสั่งซื้อ)** |

หลักอ่านตาราง: ✅ = implement แล้ว · ที่เหลือ = contract ผูกไว้ล่วงหน้า สร้างระบบเมื่อไหร่ก็เสียบได้เลย

## 2. Contracts ใหม่ C-1 ถึง C-5 (ต่อจาก 2.1-2.8 ใน _CONVENTIONS.md — มาตรฐานเดียวกัน: idempotencyKey, refType=ชื่อ Prisma model, tx? optional, side effects ผ่าน outbox)

### C-1 Inventory — **ระบบ 18 เป็น "จุดตัดสต็อกเดียว"** (คู่ขนานกับหลัก "POS เป็นจุดตัดเงินเดียว")
```
inv.consume({ tenantId, systemId, lines: [{itemId|sku, qty>0}], sourceModule: 'POS'|'RESTAURANT'|'HOTEL'|'TICKET'|'ACCOUNT',
  refType, refId, idempotencyKey, tx? })          // ตัดออก — เรียกตอนขาย/เบิก/BOM
inv.receive({ ...lines+costSatang, refType /*'AccountDocument' บันทึกซื้อ*/, refId, idempotencyKey })   // รับเข้า
inv.reverse({ tenantId, refType, refId, idempotencyKey })   // void/refund บิล → คืนสต็อกอัตโนมัติ (POS voidSale เรียก)
inv.adjust({ itemId, qtyNew, reason, countId? })  // ตรวจนับ/แก้มือ + audit → account.postInventoryAdjust
inv.onHand({ systemId, itemId[] })                // read-only — POS เช็คก่อนขาย (ติดลบได้ default, ตั้ง block ได้)
```
- **นโยบายเดียวกับ Point**: ผู้เรียกส่ง "อะไร กี่ชิ้น อ้างเอกสารไหน" — Inventory เป็นผู้คุม ledger เอง ห้ามโมดูลอื่น UPDATE ยอดตรง
- **สต็อกไม่พอไม่ block การขาย** (default ยอมติดลบ + ธง needsReview) — ร้านจริงของขายไปแล้วค่อยเคลียร์ ปรับเป็น strict ได้ต่อ item
- เชื่อม Account: มูลค่าคงเหลือ (ถัวเฉลี่ย) → บัญชี 1300 · ผลต่างตรวจนับ → ค่าใช้จ่าย/รายได้ปรับสต็อก · **Inventory ไม่รู้ account code** (ผ่าน facade 2.4 แบบเดียวกับ POS)
- แจ้งใกล้หมด: ต่ำกว่า reorderPoint → notify(2.5) + Meeting channel + โผล่ใน Daily Brief ของ AI

### C-2 HR — availability คือของ HR, ระบบอื่นถาม ห้าม copy
```
hr.availability({ systemId, employeeId[]|linkedRef, date })   // → ตารางว่าง/ลา/ขาด — Booking ใช้ปิด slot
hr.linkStaff({ hrEmployeeId, module: 'BOOKING'|'RESTAURANT'|'HOTEL', staffRefId })   // ผูกคนเดียวกันข้ามระบบ
hr.monthlySummary({ systemId, month })            // → input payroll → account.postPayroll (P2, ภงด.1)
```
- ลาอนุมัติแล้ว → emit `hr.leave.approved` → Booking ปิด slot ของวันนั้นอัตโนมัติ + แจ้งลูกค้าที่จองค้าง (2.5)

### C-3 AI — เข้าถึงทุกระบบผ่าน tool layer เดียว (ตามสเปค 16-ai-employee.md)
- tool = service layer เดิมเท่านั้น (ห้าม SQL ตรง) · tenantId/systemId มาจาก session ไม่ใช่จาก model
- อ่าน: ตาม permission ของ AI ตัวนั้น · เขียน: สร้าง **DRAFT + คนกด confirm** เสมอ (ยกเว้น action ที่เจ้าของ whitelist)
- ระบบใหม่ทุกระบบ**ต้องประกาศ tool manifest** (อ่าน/เขียนอะไรได้) ในสเปคโมดูลตัวเอง — HR/INV ใส่แล้วในข้อ 1

### C-4 Meeting — inbox กลางของแจ้งเตือนภายใน
- ทุกระบบส่งผ่าน `notify(channel: MEETING, channelKey)` — Meeting ไม่รู้จักโมดูลต้นทาง (แค่ render template 2.5)

### C-5 KB — retrieval เดียวใช้ร่วม AI + Chat auto-answer
```
kb.retrieve({ systemId, query, limit })   // L1 in-context(≤50 บทความ+cache) → L2 pg_trgm → L3 pgvector
```

## 3. กติกาเพิ่มระบบใหม่ในอนาคต (กันพิมพ์เขียวแตก)
1. เพิ่มแถวในตารางข้อ 1 + ประกาศ contract ใหม่เป็น C-x ที่นี่ (ห้ามคุยกันเองข้ามโมดูลนอกตาราง)
2. เงินทุกบาทผ่าน POS(2.1) → Account(2.4) · สต็อกทุกชิ้นผ่าน INV(C-1) · แต้มทุกแต้มผ่าน Point(2.2) · ลูกค้าอ้าง memberId(2.6) · availability พนักงานถาม HR(C-2)
3. ทุกระบบต้องมี: tool manifest ให้ AI (C-3) + event เข้า Activity(2.7) + template แจ้งเตือน (2.5)
