# RESUME — สถานะสด (เขียนด้วยมือ Fable · เครื่องหลักคือ `pnpm resume`)

> อัปเดต 2026-07-16 โดย Fable 5 · **session ตาย → account ใหม่บน VPS นี้ อ่านไฟล์นี้ + รัน `pnpm resume`**

## 🔴 2026-07-16 13:10 BKK — session ถูก OOM ฆ่า (3 Builder ตายกลางคัน)
**เกิดอะไร**: รัน 3 Builder ขนาน + `Run build` + `Run next build` + `Typecheck` พร้อมกันบน VPS 2 core
→ load แตะ **3.65** (email เตือน 13:10) → หน่วยความจำทะลุ `MemoryMax=3G` ของ `claude-remote.service`
→ kernel OOM ฆ่า node (rss 1.0GB) 06:10:48+06:11:07 UTC → session ตาย → service restart 06:15 UTC
**อาการหลอก**: มือถือค้างที่ "Stopping…" 6 task เป็นชั่วโมง = **ซาก UI ไม่ใช่งานจริง** (event จบไม่เคยส่ง)
ตอนนี้ load 0.56 · service ใช้ 445M/3G · **ไม่มีอะไรวิ่งค้างอยู่จริง**
**กันซ้ำ**: อย่ารัน Builder ขนาน >2 ตัวพร้อม build/typecheck บนเครื่องนี้ — 2 core/3G ไม่พอ

## ✅ 2026-07-16 บ่าย — Fable ตรวจรับ 3 Builder ครบ merge แล้ว
- **WO-0011 Inventory** oracle 12/12 · **WO-0012 HR** 9/9 · **WO-0013 Marketing** 8/8 (Fable แก้ 1 จุด: tenantId/systemId ใน createMany ให้ตรง type)
- ทุกตัวผ่าน qc:account 107/107 + fitness 14/14 + typecheck → merge เข้า main + **wire dispatch sys/[id]/page.tsx แล้ว** (INVENTORY/HR/MARKETING)
- แก้เพิ่มตามคำสั่ง user บ่ายนี้:
  - **DNA Wizard ค้าง "กำลังประกอบระบบ…"** = ฝั่ง client เท่านั้น (server APPLIED 10/10 ใน 26 วิ) → กัน 2 ชั้น: apply-button catch+refresh · blueprint page redirect /app ถ้า planHash APPLIED แล้ว
  - **AiDock**: ย้ายมุมขวาล่าง + ซ่อนใน /app/dna + เปลี่ยนเป็นรูป orb gradient (`public/ai-orb.png`, gen ด้วย fal.ai seedream ครั้งเดียว — key Content, ยังไม่มี FAL key ชื่อ shark)
- เก็บกวาด: neon wo-0011/12/13 ลบแล้ว + worktree 3 อันลบแล้ว

## ✅ 2026-07-16 เย็น — AI Layer Phase 1 SHIPPED (WO-0014/0015)
- `docs/AI_LAYER.md` = แผน 3 เฟสจากวิสัยทัศน์ "AI Business OS" ของ user (ไฟล์ Blank_6)
- kernel `src/lib/ai/` (rules/provider/persona/service/actions) + schema AiConversation/Message/Usage + migration ลง prod
- oracle qc-ai.mts **17/17** (Mock) · qc:account 107/107 · fitness · typecheck เขียวหมด
- ปุ่ม orb → แชทจริง (AiChat.tsx) — persona ผู้ช่วยประจำกิจการ รู้ชื่อร้าน+ระบบที่เปิด
- **SHARK_AI_KEY (OpenRouter ชื่อ shark) user ให้แล้ว** — อยู่ใน .env local + Vercel env (ผ่าน API) · ทดสอบยิงจริงผ่าน (haiku-4.5)
- UI Pass 3 โมดูลใหม่จบ (ConfirmDialog ส่งแคมเปญ + formatBaht)
- **NEXT: WO-0016 M4 สัมภาษณ์พิมพ์อิสระ (ปลดบล็อกแล้ว) → Phase 3 tool use → Backoffice Admin**

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
