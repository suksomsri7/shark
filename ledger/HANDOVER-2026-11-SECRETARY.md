# HANDOVER — RUN เลขา AI (SECRETARY) · 8 พ.ย. 2569

> ใบ S3b.1 · สถานะ **55/60 → 56/60 เมื่อใบนี้ merge** · จุดต่อผู้คุม: `ledger/SECRETARY-RESUME.md` · บันทึกเต็ม: `ledger/SECRETARY-RUN.md` §3–§7
> เอกสารคู่: `docs/modules/31-secretary.md` (§S สถานะ 8 พ.ย.) · `docs/api/SECRETARY-API.md` · `docs/legal/secretary-ai-disclosure.md` (ร่าง รอเจ้าของ) · `apps/mobile/RELEASE-NOTES-2.0.md`

## 1. อะไรขึ้นจริงแล้ว (production)

| เรื่อง | ค่า |
|---|---|
| prod | shark.in.th = `main` **c82cc727a** (deploy `dpl_EsiZLczSgy` READY · 8 พ.ย. ~05:3xZ) · `/api/health` ok · `/api/mobile/secretary/*` = 401 ไม่มี token (เส้นขึ้นแล้ว) · `/doc/<token ผิด>` = 404 |
| Vercel build | 🔴 **ต้องคง build machine Enhanced** (tsc ขั้นแยกใช้ RSS ≈9.7 GB · standard 8 GB OOM) · 🔴 **ต้องคง `next build --webpack`** ใน `scripts/vercel-build.sh` (62b21b015 · PR #1) — Turbopack compile เกิน 45 นาที · build ปัจจุบัน ≈10.5 นาที |
| DB prod | `prisma migrate deploy` 46 migration (POS v2 37 · SVC v2 · เลขา `20261227000000_secretary_a` + `20261227100000_secretary_b`) · additive ทั้งหมด · ลงตอน build 7 พ.ย. 00:1xZ |
| จุดย้อน Neon | branch **`wo-restore-pre-s3a2`** (จาก production 7 พ.ย. 00:11Z) — 🔴 **ห้าม `neon:gc` ลบ เก็บถึงอย่างน้อย 15 พ.ย. 2569** |
| env prod (ชื่อเท่านั้น) | `POS_DEVICE_KEY` · `POS_CREDENTIALS_KEY` · `AI_PROVIDER=anthropic` · `SHARK_ANTHROPIC_KEY` (ตั้งผ่าน Vercel API 7 พ.ย. · ค่า POS สุ่ม 32 ไบต์) · `APP_URL`/`APP_ENV` เป็น sensitive อ่านค่าไม่ได้ — ลิงก์ `/doc` ใช้โดเมนร้าน ACTIVE ก่อน แล้วจึง `APP_URL` |
| cron VPS | ทรี **`/root/projects/shark-in-th`** ff → c82cc727a + `pnpm install` (ใต้ flock ของ cron) · crontab ของทรีนี้รัน `scripts/crm-cron.mts` · **crm-cron minute = 26 งาน** (เดิม 6) รวม `secretary.roomJobs` (เก็บตกคิวห้องเลขา) + `chat.sla` (ทุก 5 นาที) · รอบแรกล้ม 0 · ทุกครั้งที่ main เปลี่ยน ต้องเลื่อนทรีนี้ตาม |
| แอป | ยังเป็น SHARK HUB **1.0.0 (build 24)** ในสโตร์ — ฟีเจอร์เลขาทั้งหมดอยู่ในโค้ดแอปแต่ยังไม่บิลด์ (S3a.3) |

## 2. ใบที่เหลือ

| ใบ | งาน | บล็อกด้วย |
|---|---|---|
| **S3a.3** | บิลด์ 2.0.0 (iOS build 25 · Android versionCode 2) → **TestFlight เดิมของแอป SHARK HUB** (เจ้าของบอก 8 พ.ย.) + Play Internal · ขั้นตอนเขียนเป็น apps/mobile/SUBMIT-STEPS.md (ยังไม่มี · ทำในใบ S3a.3) | 🔴 **Expo token ใหม่** (ตัวเก่าให้ revoke) + **คำสั่งเจ้าของ** (ห้าม `eas build` เอง) · SMS provider prod + เบอร์ reviewer · `expo-system-ui` ก่อน Android |
| **S3a.4** | รับผลทดสอบจากเจ้าของ → ใบแก้ → OTA `eas update` (JS เท่านั้น) | S3a.3 |
| **S3b.2** | ภาพ/ข้อความสโตร์ 2.0 (6.5" + iPad · ไทย/อังกฤษ) · ตรวจ privacy labels — **เบอร์โทร = ข้อมูลใหม่ที่เก็บ** (ใช้ `docs/legal/secretary-ai-disclosure.md` §2) | คำตอบเจ้าของเรื่อง disclosure (ข้อ 1–3) |
| **S3b.3** | ยื่น App Store review + Play production · เปิดให้ทุกร้านทีละชุด · ร้านนำร่อง 3 ร้านสัปดาห์แรก | ทุกขั้นรอเจ้าของสั่ง |

## 3. ตั๋วเปิด (ไม่บล็อกสโตร์)

1. **ตัดวง import ฝั่ง server เพื่อกลับไปใช้ Turbopack** — วงเดียวใหญ่ `crm/index ↔ account/index ↔ outbox-consumers ↔ minute-jobs ↔ ai/service/tools` (422 → 865 ไฟล์) + dynamic import 527 จุด ⇒ `.next/server` 1.2 GB · ทาง: outbox-consumers ให้ import เฉพาะ worker/cron · เลิก dynamic import barrel `@/lib/modules/{member,crm,…}` → import ไฟล์ตรง · ai/tools เฉพาะ route AI · สคริปต์วัด `/root/scratch-buildprobe/*.py`
2. **ย้าย `REPLY_RATE` ออกจาก `src/app/api/mobile/inbox/conversations/[id]/reply/route.ts`** — Next ไม่ยอมให้ route export ชื่ออื่น ย้ายไปไฟล์ lib แล้ว import
3. **`SECRETARY_LAUNCH_AT`** ใน `src/lib/ai/secretary/pack.ts` ยังเป็น `2026-11-04T00:00:00.000Z` (แผน §E ขั้น 4 ให้ตั้ง = เวลา deploy จริง) — ร้านที่สร้างบน prod 4–8 พ.ย. ไม่ได้เครดิตต้อนรับ · เจ้าของตัดสินว่าคงไว้หรือเลื่อนเป็น 8 พ.ย.
4. นโยบายความเป็นส่วนตัวบนเว็บยังเขียน "OpenRouter" — ต้องแก้ตามร่าง disclosure (คำถามเจ้าของข้อ 1–2)
5. event ในสัญญา §9 (`ai.room.*` · `ai.action.*` · `staff.invite.accepted` · `chat.conversation.auto_assigned`) ไม่มีในโค้ด — ถ้าต้องการ automation/webhook ของเลขา = ใบใหม่
6. `PhoneOtp` ไม่มีงานลบอัตโนมัติ (เบอร์ + IP สะสม) — รอเจ้าของกำหนดระยะ
7. หมุนคีย์ Anthropic "shark" หลังจบ RUN (คีย์เคยถูกวางในแชต) · ลบสาขา sha256 หลัง deploy (L7 runbook)
8. svc: ต้อง merge main ก่อน `pnpm install` — lockfile ของ svc จะถอด `@react-pdf/renderer` ออกจาก node_modules ร่วม

## 4. หนี้ที่จดไว้ (จาก RUN §6.5 · §7.5 · RESUME)

- **สิทธิ์/ความปลอดภัย**: RC2 MINOR-3/6 · RC1 L2/L5/L6/L7/L9/L10 (§Z.5) · ลบบัญชีทางเว็บไม่มี step-up OTP (L10) · ระงับเลขาฝั่งทีม SHARK = ปิดตอบนอกเวลาอย่างเดียว (ยังไม่มีสวิตช์ระงับทั้งร้าน)
- **ค่าตั้ง/เพดานรอเจ้าของ**: เพดาน assist ฟรี 500k micro/วัน (§L.2) · โควตาต่อคน (L2 m-9) · SMS 2 segment (L6)
- **เลขา**: `AiScheduledTask.channels` บันทึกแต่ worker ยังไม่กรอง (push ทุกครั้ง) · `notifyUser(…, "approval")` ยังไม่มีผู้เรียก · ป้ายระบบการ์ด kind `support.*`/`kb.save`/`memory.forget` ขึ้น "งาน"
- **S3a.5 PDF/ลิงก์**: ตัวละตินพิมพ์ใหญ่ยาว > 26 ตัวไม่มีช่องว่างล้นคอลัมน์ · summary ใบอาจไม่ตรงถ้าห้องสร้างใบใหม่ระหว่างรออนุมัติ · `docLoggedInConversation` take 500 ไม่มี orderBy (ปฏิเสธเกิน ไม่รั่ว)
- **S3a.6 แปล**: web actions translate ไม่ตรวจ `targetLang` (ของเดิม)
- **ข้อสอบ**: `qc-sec-s3a1-r2` CRASH 2/12 รอบ (ไวต่อจังหวะ · แข็งแล้วใน e8f39922c) · R-Z47 `sec-real-path.mts` เก่า
- **ต้นทุน**: ≈฿3–8 ต่อห้อง (sonnet-5 · prompt+สกิล+ผล tool 20–35k token/การเรียก · แคชเขียนใหม่ทุกห้อง) · ทางลด (ต้องวัดก่อน): ส่วนคงที่ของ prompt ไว้หน้าสุดให้แคชข้ามห้อง/ร้าน · ย่อผล tool · haiku ในรอบค้น

## 5. ทรีและวิธีทำงานต่อ

- ทรีผู้คุม `/root/projects/shark-sec` (สาขา `session/secretary` = main บน origin) · ⚠️ ไม่มี node_modules หลังรีบูต (bind mount จาก shark-svc หาย — remount ก่อน)
- ทรีทดสอบ/เอกสาร `/root/projects/shark-sec-wp` (สาขา `wip/sec-s3b.1` จาก c82cc727a · node_modules ของตัวเอง) — ลบได้หลัง merge ใบนี้
- งานหนัก (tsc/build/tsx) ผ่าน `bash scripts/iso.sh …` เท่านั้น · ฐาน QC เลขา `wo-sec-qc` ผ่าน `scripts/qc-sec.sh` · ตัวขับโมเดลจริง `scripts/qc-sec-real.mts` (เพดาน ฿30/รอบ)
- กติกาค้าง: ห้าม push main / deploy / `eas build` / `eas submit` โดยไม่มีคำสั่งเจ้าของ · tg รายงานแบบ `📊 SEC · N% (x/60)` หลังปิดใบ
