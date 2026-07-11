# SHARK — Infrastructure Decisions (ตอบจากเจ้าของ 2026-07-11)

> ล็อกก่อนเริ่ม Stage A · creds จริงเก็บใน memory `reference_shark_*` เมื่อสมัครเสร็จ (แยกจาก siamdive — ห้าม share key ข้าม project)

## สรุปการตัดสินใจ

| เรื่อง | ตัดสิน |
|---|---|
| Hosting | **Vercel** · repo `github.com/suksomsri7/shark.git` |
| Database | **Neon (Serverless Postgres)** region Singapore — ดูเหตุผล §2 |
| Object storage | **Bunny Storage** (มี creds อยู่แล้ว) หรือ Vercel Blob — ดู §4 |
| Email (ส่ง OTP/magic link) | **Resend** + verify domain shark.in.th, from `noreply@shark.in.th` |
| Email (รับ support) | **ImprovMX** forward `support@shark.in.th` → Gmail (เหมือน siamdive) |
| OTP | อีเมลอย่างเดียว (ไม่มี SMS) |
| Payment | QR ร้านเอง + staff ยืนยันสลิป (gateway 🔜) — ตรง RESOLUTIONS D1 v1 |
| ธุรกิจ pilot แรก | **ร้านตัดผม** → Stage C เริ่ม Booking(03) ก่อน |
| LINE OA | per-tenant BYOK (ร้านเชื่อม OA ตัวเอง) — bump จาก 🔜 เป็น Phase ต้นๆ, ดู §5 |
| Brand / DNS | SHARK.IN.TH (จดแล้ว) |

## 1. Region — ตั้งให้ตรงกันทั้ง stack
ลูกค้าเป็นคนไทย → เลือก **Singapore** ทุกชั้น ลด latency:
- Vercel Functions region = `sin1` (Singapore)
- Neon project region = `ap-southeast-1` (Singapore)
- DB กับ function อยู่ region เดียวกัน = ตัด round-trip ข้ามทวีป (สำคัญมากกับ serverless ที่เปิด connection ถี่)

## 2. Database — ทำไม Neon (ไม่ใช่ Supabase/VPS)

**เลือก Neon เพราะ 5 เหตุผล ตรงกับสถาปัตยกรรม SHARK:**
1. **Native Vercel integration** — ผูกผ่าน Vercel Marketplace, inject env อัตโนมัติ, preview deployment ได้ DB ของตัวเอง
2. **Database branching = ตรงกับ WORKPLAN_PARALLEL เป๊ะ** — เราแตกงาน 1 โมดูล = 1 git branch/session · Neon สร้าง DB branch ต่อ git branch ได้ → **แก้ปัญหา "migration ordering conflict"** ที่เป็นจุดชนเดียวของการทำงานขนาน (WORKPLAN §4) แต่ละ session รัน migrate บน branch ตัวเอง ไม่เหยียบกัน แล้วค่อย rebase
3. **Scale-to-zero** — ช่วงฟรียังไม่มีคนใช้ 24 ชม. จ่ายเท่าที่ใช้จริง
4. **Extension ครบที่สเปคต้องการ:** `btree_gist` (EXCLUDE gist กันจองเวลาซ้อน — **ร้านตัดผม pilot ใช้ตรงนี้!**), `pg_trgm` (ค้นหาไทย) — เปิดใน migration แรก
5. Postgres แท้ 100% → Prisma + raw SQL migrations ทั้ง 9 รายการใน QC3 ทำงานได้หมด

**ทำไมไม่ Supabase:** เราเขียน auth เอง (passwordless) + storage/realtime แยกอยู่แล้ว → ไม่ได้ใช้ของแถม Supabase · แถม memory เตือนเรื่อง egress bill · (แต่ Supabase ก็ใช้ได้ ไม่ผิด ถ้าอยากคุม dashboard ที่เดียว)
**ทำไมไม่ Postgres บน VPS:** hosting เป็น Vercel (Singapore) → DB บน VPS คนละที่ = latency + จัดการ backup/scaling เอง ไม่คุ้มช่วงนี้

### ⚠️ 3 จุดที่ Neon + Vercel serverless + Prisma ต้องตั้งให้ถูก (ไม่งั้นพังตอน scale)
1. **2 connection strings** (Prisma datasource):
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")      // pooled (-pooler) — ใช้ runtime
     directUrl = env("DIRECT_URL")        // direct — ใช้ migrate/introspect
   }
   ```
   serverless เปิด connection ถี่ → **ต้องยิงผ่าน pooler** ไม่งั้น connection หมดพอร์ต
2. **Advisory lock ต้องเป็น transaction-scoped** — pooler = transaction mode ไม่รองรับ session-level lock → Hotel overbooking guard (สเปค 01) ต้องใช้ `pg_advisory_xact_lock()` **ไม่ใช่** `pg_advisory_lock()` · Booking slot ใช้ EXCLUDE gist (ไม่กระทบ)
3. **prismaSchemaFolder** (multi-file schema ต่อโมดูล ตาม WORKPLAN) = preview feature ของ Prisma → เปิด flag ใน schema

## 3. Prisma multi-file + migration ตอนขนาน
- `prisma/schema/*.prisma` แยกไฟล์ต่อโมดูล (core.prisma freeze) — ตรง WORKPLAN §2
- แต่ละ module branch: `prisma migrate dev` บน Neon branch ตัวเอง → merge → `migrate deploy` บน main branch (production) ผ่าน Vercel build

## 4. Object Storage (Stage A2b ต้องมี)
Vercel ไม่มี disk ถาวร → รูปเมนู/สลิปโอน/attachment ต้องออก:
- **Bunny Storage** (มี creds แล้ว — แต่ SHARK ต้อง storage zone แยกของตัวเอง ไม่ปน siamdive) + CDN — ถูกและเร็วในไทย
- หรือ **Vercel Blob** — ผูกกับ Vercel ง่ายสุด, signed URL ในตัว
- ทั้ง 2 ต้องผ่าน upload service กลาง (SECURITY §4.4: MIME sniff + re-encode + สุ่มชื่อ + path ต่อ tenant)

## 5. Email — 2 ระบบแยกหน้าที่ (อย่าใช้ ImprovMX ส่ง OTP!)
- **ส่ง (OTP/magic link/แจ้งเตือน):** ImprovMX เป็น forwarding **รับอย่างเดียว ส่ง transactional ไม่ได้/ไม่ควร** → ใช้ **Resend**: verify domain `shark.in.th` (เพิ่ม SPF+DKIM+DMARC ที่ DNS), ส่งจาก `noreply@shark.in.th` · Resend เข้ากับ Vercel/Next ดี มี React Email template
- **รับ (ลูกค้าเมลหา support):** **ImprovMX** forward `support@shark.in.th` → Gmail ของคุณ (ตั้งเหมือน admin@siamdive.com ทุกอย่าง — เพิ่ม MX record ที่ DNS shark.in.th)
- DNS shark.in.th: ต้องเพิ่ม MX (ImprovMX รับ) + TXT SPF/DKIM (Resend ส่ง) พร้อมกันได้ ไม่ชนกัน

## 6. LINE OA per-tenant (bump priority ตามที่เจ้าของขอ)
- สเปค Chat(10) ออกแบบ `ChannelAdapter` interface + ตาราง `ChatChannelConnection` รองรับไว้แล้ว (เดิม mark 🔜) → **เลื่อนขึ้นมาทำจริงหลัง Chat MVP**
- flow: ร้านเอา **Channel Access Token + Channel Secret ของ LINE OA ตัวเอง** มาวางในตั้งค่า → เก็บเข้ารหัส (`ChannelCredential.encPayload` + keyVersion ตาม SECURITY §11) → webhook `/api/store/[tenantSlug]/line/webhook` รับข้อความเข้า Chat inbox + ส่งออกผ่าน token ของร้าน
- ใช้ได้ทั้ง: แชทลูกค้า (Chat) + แจ้งเตือน (notify channel LINE) เช่น เตือนคิว/นัดร้านตัดผม
- ⚠️ ต้อง onboarding ทีละร้าน (แต่ละร้านสร้าง LINE Developer Provider + Messaging API channel เอง) — ทำคู่มือให้ร้าน

## 7. ลำดับเริ่มจริง (ปรับตาม pilot ร้านตัดผม)
Stage A (CORE) → Stage B (POS/Member/Point/Account) → **Stage C เริ่ม Booking(03) + Q(04) ก่อน** (ร้านตัดผมใช้: จองคิวช่าง + บัตรคิว + ชำระผ่าน POS + สะสมแต้ม) → โมดูลอื่นตามหลัง
- ร้านตัดผม end-to-end ที่ต้องวิ่งได้: สมัคร → สร้างกิจการ BOOKING → ตั้งบริการ+ช่าง+เวลา → ลูกค้าจองออนไลน์ → มาถึงออกบัตรคิว → ตัดเสร็จเก็บเงิน POS → ได้แต้ม → เชื่อม LINE OA เตือนนัด
