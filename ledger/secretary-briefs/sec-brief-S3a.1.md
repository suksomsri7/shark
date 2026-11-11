# S3a-1 — S3a.1 ข้อสอบรวม + นักล่า 6 เลนส์ + โมเดลจริง (ผู้คุมขับเอง · หลัง S2.14 ปิด S2 · 6 พ.ย.)
Read COMMON · MASTER-PLAN row S3a.1 · docs/modules/31-secretary.md §1.4 (10 user stories) §1.5 (3 เส้นสาธิต) · RESOLUTIONS ทั้งหมด (สัญญาล่าสุด = `docs/api/SECRETARY-API.md`)

## 1. ข้อสอบรวม (มีแล้ว · ผู้คุมเขียน 6 พ.ย.) — `scripts/qc-sec-s3a.1.mts`
- 10 user stories ผ่าน route มือถือจริง (ไม่ใช่ lib ตรง ยกเว้น OTP ขอรหัสผ่าน lib เพื่อจับข้อความ SMS และ assignIncoming/runTool ที่เป็นขั้นภายใน): U1 สมัครด้วยเบอร์ · U2 ตั้งชื่อเลขา · U3 สั่งงานแรก (job inline) · U4 B3 ตั้งแชท DRAFT → ข้อเสนอ chat.send → owner อนุมัติ → ข้อความ OUT มีลงชื่อ → log · U5 STAFF ตีกลับ remember=RULE → เจ้าของยืนยัน · U6 ห้องร่วม (ไม่เห็นประวัติ · authorUserId) · U7 K1/K2 → ai-suggest → ส่งจากร่าง (outcome) · U8 กฎวนตามเวร + กะ → assign · U9 เชิญด้วย levels/chat → invites/pending → accept → สิทธิ์แปลง · U10 scope=tenant · Q โควตา · X ความลับ · R โมเดลจริง (SKIP จนมีคีย์)
- ผลบน tip bed1198b (6 พ.ย. ~12:0xZ): **16/17 · SKIP R-1** · รัน: `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 SMS_PROVIDER=mock pnpm exec tsx scripts/qc-sec-s3a.1.mts`
- ปิด S2 แล้วรันซ้ำ ×3 บน tip สุดท้าย (ก่อน CP3)

## 2. นักล่า 6 เลนส์ (reviewer agents · อ่านอย่างเดียว · หลักฐาน path:บรรทัด · ห้ามรันหนัก) — ผู้คุม spawn 6 ตัวขนานบน tip หลัง S2.14
- L1 สิทธิ์/ห้องร่วมรั่ว: ข้อมูลข้ามร้าน/ข้ามหน่วย/ข้ามห้อง (rooms · members seeHistory · proposals · log · inbox · customers) · STAFF ทำสิ่งที่ OWNER เท่านั้น · platform actor
- L2 โควตา/ตัวนับ: `AiJobCounter` นับซ้ำ/ไม่นับ (duplicate clientMessageId · retry · ห้องร่วม · งานประจำ) · FREE_PACK assist cap · เดือน BKK · race
- L3 คิว/cron/ซ้ำ: `runRoomJobs` lease · X5 · ซ้อนกัน · job ค้าง · minute job · scheduled tasks ซ้ำวัน · push ซ้ำ
- L4 API: ทุก route ใต้ `/api/mobile/secretary/**` + `/api/mobile/inbox/**` + `/api/mobile/auth/sms/**` + `/me` — body strict · 401/403/404/409/422/429 ถูก · rate-limit ทุกเส้นเขียน · DTO ไม่มี token/คีย์/เบอร์เต็ม · เอกสารตรงโค้ด
- L5 PDPA/prompt injection: ข้อความลูกค้าในห้องร่วม/after-hours/ai-suggest เข้า prompt อย่างไร · `SENSITIVE`/masked memory · ลูกค้าสั่งเลขาได้ไหม · ข้อมูลลูกค้าออกนอก SHARK · ลบบัญชี 30 วัน
- L6 ความลับ: env/คีย์ในโค้ด/log/DTO/ภาพ QC/fixture · `logOps` detail · push payload · SMS mock text ใน OpsEvent บน prod (R-S1.19c)
- ผลนักล่า → RESOLUTIONS §Z · แก้เป็นใบย่อย (เลน b server · เลน d แอป) · ข้อสอบ regression ต่อ finding ที่แก้

## 3. `qc:all` + build เต็ม (ผู้คุมรัน · เครื่องว่าง): `pnpm qc:all` (ชุดเดิมทุกระบบ · เทียบ baseline 049df880b) · `next build` ผ่าน inner script (`scratchpad/build-inner.sh` · ISO_MEM=15G · ไม่มีเลนอื่น) · `bash scripts/sec-baseline.sh` baseline สุดท้าย
## 4. โมเดลจริง 3 เส้น (docs §1.5) — ต้องมีคีย์ Anthropic "shark" ใน `.env.qc-sec` (`SHARK_ANTHROPIC_KEY` · `AI_PROVIDER=anthropic`) จากเจ้าของ · ผู้คุมรันมือ: (1) ใบเสนอราคา→ส่ง LINE (2) POS ขาย+แต้ม (3) คืนมัดจำ booking · จดต้นทุนจริงต่อห้อง (AiUsage) ใน RUN ledger §5 · ถ้าคีย์ไม่มาก่อน CP3 ⇒ รายงาน CP3 ด้วย mock + ระบุค้าง
## CP3 = รายงานใหญ่: ข้อสอบรวม 16/17 (+R) · นักล่า 6 เลนส์ปิด · qc:all · build · ภาพคู่ทั้งชุด (S2.14) · ขอคำสั่ง push main + migration (S3a.2) → build TestFlight (S3a.3)
