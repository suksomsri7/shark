## โหมดขนานรอบนี้ (M3.4 ∥ M3.5 ∥ M3.6 — 3 builder บน worktree เดียว)
- ไฟล์ใช้ร่วมที่ทุกใบต้องแตะ: `member/index.ts` (facade) · `member/nav.ts` · `outbox-consumers.ts` · `automation/labels.ts` · `webhooks/labels.ts` · `platform/cron.ts` · `core/scope.ts` · `prisma/schema/member.prisma` → **Edit เฉพาะจุด อ่านใหม่ก่อน Edit ทุกครั้ง ห้าม Write ทับ** · เห็นบรรทัดของใบอื่นแทรกอยู่ = ปกติ ห้ามลบ
- migration: เขียน SQL ด้วยมือเฉพาะตาราง/คอลัมน์/enum ของใบตัวเอง (ห้าม `prisma migrate dev` — จะดูดสคีมาของใบอื่นเข้าไฟล์คุณ) แล้ว `prisma migrate deploy` + `prisma generate` ด้วย env จาก `.env.qc` (grep|cut · ตรวจ host ep-plain-art) · `migrate diff` อาจไม่ "empty" เพราะสคีมาของใบอื่นยังไม่ migrate — ให้ตรวจแค่ว่าไม่มีรายการของตัวเอง
- `prisma generate`/tsc ล้มเพราะสคีมาของใบอื่นกำลังแก้ครึ่ง ๆ → รอ 1–2 นาทีแล้วลองใหม่ ไม่ต้องไปแก้ไฟล์เขา
- ข้อสอบเชิงนับอาจ flake จากข้อมูลชั่วคราวของ builder อื่น → รันซ้ำก่อนสรุป
