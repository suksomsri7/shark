# RESUME — สถานะสด (เขียนด้วยมือ Fable · เครื่องหลักคือ `pnpm resume`)

> อัปเดต 2026-07-16 โดย Fable 5 · **session ตาย → account ใหม่บน VPS นี้ อ่านไฟล์นี้ + รัน `pnpm resume`**

## 🔴 2026-07-16 13:10 BKK — session ถูก OOM ฆ่า (3 Builder ตายกลางคัน)
**เกิดอะไร**: รัน 3 Builder ขนาน + `Run build` + `Run next build` + `Typecheck` พร้อมกันบน VPS 2 core
→ load แตะ **3.65** (email เตือน 13:10) → หน่วยความจำทะลุ `MemoryMax=3G` ของ `claude-remote.service`
→ kernel OOM ฆ่า node (rss 1.0GB) 06:10:48+06:11:07 UTC → session ตาย → service restart 06:15 UTC
**อาการหลอก**: มือถือค้างที่ "Stopping…" 6 task เป็นชั่วโมง = **ซาก UI ไม่ใช่งานจริง** (event จบไม่เคยส่ง)
ตอนนี้ load 0.56 · service ใช้ 445M/3G · **ไม่มีอะไรวิ่งค้างอยู่จริง**
**กันซ้ำ**: อย่ารัน Builder ขนาน >2 ตัวพร้อม build/typecheck บนเครื่องนี้ — 2 core/3G ไม่พอ

## ค้างรอตัดสินใจ — งาน 3 Builder รอดครบ (ยังไม่ merge)
ไฟล์เขียนเสร็จหมดตอน 06:06-06:10 UTC **แต่ตายก่อนรัน oracle + ก่อน commit** → ยัง untracked ใน worktree
- **WO-0011 Inventory** (agent ae795afd) neon wo-0011 · `modules/inventory/{service,actions,ui}` ✍️ 3 ไฟล์ + WO json (M)
- **WO-0012 HR** (agent ac53316b) neon wo-0012 · `modules/hr/{service,actions,ui}` ✍️ 3 ไฟล์
- **WO-0013 Marketing** (agent a76dcc0d) neon wo-0013 · `modules/marketing/{service,actions,ui}` ✍️ 3 ไฟล์
worktree: `.claude/worktrees/agent-<id>/` ทั้ง 3 อยู่ที่ de6d940 · neon branch ยังไม่ถูกลบ (leak, อายุ 1.3 ชม.)
**⚠️ โค้ดยังไม่ผ่านข้อสอบสักตัว** — ห้าม merge จนกว่าจะรัน oracle เอง (qc-inventory/qc-hr/qc-marketing.mts) ทีละตัว
กู้: `git -C <wt> status` → รัน oracle → merge ถ้าเขียว → wire dispatch page.tsx + `pnpm neon:delete` + `neon:gc`
ของกลางบน main พร้อมแล้ว (schema+enum+scope+systems+rules+oracle+เส้น marketing→member)

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
