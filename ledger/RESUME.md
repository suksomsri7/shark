# RESUME — สถานะสด (เขียนด้วยมือ Fable · เครื่องหลักคือ `pnpm resume`)

> อัปเดต 2026-07-16 โดย Fable 5 · **session ตาย → account ใหม่บน VPS นี้ อ่านไฟล์นี้ + รัน `pnpm resume`**

## กำลังวิ่ง
- (ว่าง — WO-0009 CRM merged)
(WO-0009 CRM เสร็จ)

## กู้ Builder ตายกลางคัน
`git worktree list` → `git -C <wt> log --oneline` + อ่าน `<wt>/ledger/wo/WO-*.json` step → ทำต่อ/merge → `git worktree remove --force` + `pnpm neon:delete wo-X` + `pnpm neon:gc`

## คำสั่งล่าสุด user (2026-07-16 ค่ำ)
บันทึก ✓ → **deploy รอบแรก** (Vercel prod + VPS staging) → ปล่อย Builder ขนาน (Procurement/Inventory/Marketing)

## เสร็จแล้ว (main)
M0 kernel guard · M1 POS→Account · M2 UI shell · M3 DNA Wizard · WO-0003 คูปอง · WO-0006 authz 8 โมดูล · **WO-0009 CRM เต็มระบบ (25/25)** · **WO-0010 สะพาน Deal→ใบเสนอราคา**
WO-0007 Ticket→POS · WO-0008 Hotel→POS (ทั้งคู่รีแฟกเตอร์ใช้ systemForUnit หลัง merge)
audit ฟรี: restaurant→POS→บัญชี
**ทุกระบบธุรกิจมีเงินเข้าบัญชีครบ**: POS·restaurant·ticket·hotel·booking(wiring)·coupon
CI: 9 suite ~240 ข้อ · เขียวแท้

## หนี้/backlog
- audit booking→POS: wiring มีใน actions/booking.ts แต่ต้อง session harness (เลื่อน)
- ลดจำนวน query ใน flow เงิน (tx timeout ขยายเป็น 30s ชั่วคราว)
- DEPOSIT/ROOM_CHARGE map เป็น TRANSFER ชั่วคราว
- M4: LLM free-text บน DNA — **ต้องขอ OpenRouter key ใหม่ (ชื่อ shark) จาก user** (ห้ามใช้ key ข้ามโปรเจกต์)
- raw color เก่าใน (store)/r/[token]
