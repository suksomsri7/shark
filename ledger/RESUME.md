# RESUME — สถานะสด (เขียนด้วยมือ Fable · เครื่องหลักคือ `pnpm resume`)

> อัปเดต 2026-07-16 โดย Fable 5 · **session ตาย → account ใหม่บน VPS นี้ อ่านไฟล์นี้ + รัน `pnpm resume`**

## กำลังวิ่ง — 3 Builder ขนาน (worktree+neon แยก · ไฟล์ disjoint)
- **WO-0011 Inventory** (agent ae795afd) neon wo-0011 · oracle qc-inventory.mts
- **WO-0012 HR** (agent ac53316b) neon wo-0012 · oracle qc-hr.mts
- **WO-0013 Marketing** (agent a76dcc0d) neon wo-0013 · oracle qc-marketing.mts
ทั้ง 3: Fable วางของกลางบน main แล้ว (schema+enum+scope+systems+rules+oracle+เส้น marketing→member)
Builder แตะเฉพาะ modules/<mod>/{service,actions,ui} · **Fable wire dispatch page.tsx เอง หลัง merge**
กู้ถ้าตาย: git worktree list → git -C <wt> log → merge ถ้า oracle เขียว → wire dispatch + neon:delete + neon:gc

## คำสั่งล่าสุด user (2026-07-16 ค่ำ)
✅ deploy: **Vercel auto-deploy ทุก push** (shark.in.th prod เดียว) · **VPS ปิดแล้ว** · ต่อไป: Builder ขนาน (Inventory/Procurement/Marketing)

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
