# RESUME — สถานะสด (เขียนด้วยมือ Fable · เครื่องหลักคือ `pnpm resume`)

> อัปเดต 2026-07-16 โดย Fable 5 · **session ตาย → account ใหม่บน VPS นี้ อ่านไฟล์นี้ + รัน `pnpm resume`**

## กำลังวิ่ง (2 Builder ขนาน — worktree + neon branch แยก)
- **WO-0007 Ticket→POS** (agent a3960a61) — neon `wo-0007` · oracle `scripts/qc-ticket-money.mts` (fail-before TK-2.* แดง) · แตะ ticket/{service,actions}.ts
- **WO-0008 Hotel→POS** (agent aed9c541) — neon `wo-0008` · oracle `scripts/qc-hotel-money.mts` (fail-before HT-2.* แดง) · แตะ hotel/{service,actions}.ts
- ทั้งคู่: เส้น ticket→pos/hotel→pos อนุมัติใน fitness แล้ว · pattern = booking/actions.ts (pos.createSale ที่จุดปิดเงิน)

## ถ้า Builder ตายกลางคัน (session ใหม่ทำต่อ)
1. `git worktree list` — หา worktree ค้าง · `.claude/worktrees/agent-<id>`
2. commit ใน branch นั้นถึงไหน: `git -C <worktree> log --oneline` · ledger step: อ่าน `<worktree>/ledger/wo/WO-000X.json`
3. ทำต่อจาก step ที่ยังไม่ติ๊ก หรือ merge ถ้า oracle เขียวแล้ว
4. เก็บกวาด: `git worktree remove <path> --force` · `pnpm neon:delete wo-000X` · `pnpm neon:gc` (ลบ ci-/wo- ค้าง >24ชม)

## เสร็จแล้ว (main)
M0 kernel guard · M1 POS→Account · M2 UI shell · M3 DNA Wizard · WO-0003 คูปอง · WO-0006 authz 8 โมดูล
audit ฟรี: restaurant→POS→บัญชี (qc-restaurant-money 6/6)
CI: 7 suite ~228 ข้อ · เขียวแท้ run #18

## หนี้/backlog
- audit booking→POS: wiring มีใน actions/booking.ts แต่ต้อง session harness (เลื่อน)
- ลดจำนวน query ใน flow เงิน (tx timeout ขยายเป็น 30s ชั่วคราว)
- DEPOSIT/ROOM_CHARGE map เป็น TRANSFER ชั่วคราว
- M4: LLM free-text บน DNA — **ต้องขอ OpenRouter key ใหม่ (ชื่อ shark) จาก user** (ห้ามใช้ key ข้ามโปรเจกต์)
- raw color เก่าใน (store)/r/[token]
