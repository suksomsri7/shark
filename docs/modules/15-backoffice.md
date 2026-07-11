# โมดูล 15: Backoffice — ผู้ดูแลแพลตฟอร์ม (backoffice.shark.in.th)

> scope = **PLATFORM** (ไม่มี tenantId isolation — Backoffice เห็นข้ามทุกร้านโดยออกแบบ)
> ⚠️ อำนาจสูง = ความรับผิดชอบสูง: **ทุก action ที่แตะข้อมูลร้านต้องลง `PlatformAuditLog`** ไม่มีข้อยกเว้น
> ยึด `_CONVENTIONS.md` ทุกข้อที่ประยุกต์ได้ · เงิน = `Int` สตางค์ · เวลา UTC (แสดงผล Asia/Bangkok)
> ผู้ใช้โมดูลนี้ = ทีมงานแพลตฟอร์ม SHARK เอง **ไม่ใช่ร้านค้า** — แต่มี "ฝั่งร้าน" ที่เชื่อมถึงกัน (widget แจ้งปัญหา, banner ประกาศ, อีเมลแจ้ง impersonation)

---

## 1. ภาพรวม + ขอบเขต

### ทำอะไร (v1)
- **PlatformUser + auth แยกขาด**: ทีมแพลตฟอร์ม 3 role (SUPER_ADMIN / SUPPORT / FINANCE) login แยกจากร้านโดยสิ้นเชิง (คนละตาราง คนละ session namespace คนละ cookie) + **บังคับ 2FA (TOTP)** ทุกคน
- **Tenant management**: list/ค้นหา/filter ร้านทั้งแพลตฟอร์ม, หน้า detail ร้าน (units, ทีม, usage, timeline), อนุมัติ/ระงับ/ปิดร้าน, เปิด-ปิดโมดูลรายร้าน, ปรับ `Tenant.limits` รายร้าน
- **Support Desk (ฟีเจอร์หลัก)**: ร้านเปิดเคสจาก dashboard ตัวเอง (widget "แจ้งปัญหา" + help center) → ticketing เต็มรูป: ประเภทเคส, สถานะ, priority + SLA, มอบหมาย agent, thread 2 ฝั่ง + email notify, แนบไฟล์, internal note, canned response, escalate, CSAT, รายงาน
- **Impersonation ("เข้าดูแทนร้าน")**: session จำกัดเวลา 30 นาที read-only โดย default, write ต้อง SUPER_ADMIN + เหตุผล, banner แดงตลอด, audit ทุก request, แจ้งอีเมลเจ้าของร้านอัตโนมัติ
- **Billing (วางโครง — ตอนนี้ฟรี)**: plan definition, invoice/ใบเสร็จของแพลตฟอร์ม, บริการ custom domain 1,500฿/ปี (สั่งซื้อ → โอน/PromptPay แนบสลิป → FINANCE ยืนยัน → activate → เตือนต่ออายุ 30/7 วัน → หมดอายุ = ปิด domain)
- **Custom domain ops**: คิวคำขอเชื่อมโดเมน, สถานะ DNS/SSL, ปุ่ม re-check, troubleshooting view
- **Announcement**: ประกาศถึงร้าน (ทั้งหมด/segment) → banner ใน dashboard ร้าน + read receipt + release notes
- **Platform metrics dashboard**: ร้านใหม่/active/churn, ร้านต่อโมดูล, GMV รวม (**อ่านแบบ aggregate จาก rollup เท่านั้น**), จำนวนเคส, system health (queue lag, error rate, cron status)
- **Feature flags**: เปิดฟีเจอร์ทดลองรายร้าน / รายเปอร์เซ็นต์ (percentage rollout)
- **Data & compliance**: export ข้อมูลร้าน (ร้านขอย้ายออก), ลบร้านตามคำขอ PDPA (soft delete 30 วัน → purge), audit log viewer platform-wide

### ไม่ทำใน v1 (🔜 อยู่ในหัวข้อ 3)
- Knowledge base / FAQ สาธารณะแบบมีบทความ (v1: help center = ฟอร์มเปิดเคส + รายการเคส + ลิงก์ประกาศ)
- Payment gateway อัตโนมัติ (Beam/Omise/Stripe) — v1 รับโอน/PromptPay แนบสลิปให้ FINANCE ยืนยันมือ
- Live chat support realtime (v1 = thread เคส + email; SSE refresh thread พอ)
- Plan แบบเก็บเงินรายเดือน (วาง schema ไว้ แต่ทุกร้าน = FREE, invoice เกิดจาก custom domain เท่านั้น)
- IP allowlist / SSO (Google Workspace) สำหรับ PlatformUser
- Undo merge / restore ร้านหลัง purge (purge = ถาวร)

### หลักการออกแบบที่ห้ามละเมิด
1. **แยก auth ขาดจากร้าน**: `PlatformUser` ≠ `User` — อีเมลเดียวกันสมัครได้ทั้งสองฝั่งโดยไม่เกี่ยวกัน, cookie `__Host-bo_session` ใช้ได้เฉพาะโดเมน backoffice.shark.in.th, ไม่มี endpoint ไหนรับ session ข้ามฝั่ง
2. **Audit ทุก action ที่แตะข้อมูลร้าน**: mutation ทุกตัว + read ที่เห็น PII รายคน (เปิดหน้า detail ร้าน, impersonation ทุก request) → `PlatformAuditLog` append-only
3. **GMV/สถิติข้ามร้าน = aggregate เท่านั้น**: UI backoffice ห้าม query ตารางธุรกรรมร้านตรงๆ — อ่านจาก `PlatformDailyStat` (rollup รายวันโดย cron) ป้องกันทั้ง performance และการเห็นข้อมูลละเอียดเกินจำเป็น
4. **การเห็นข้อมูลในร้าน = ผ่าน impersonation เท่านั้น**: หน้า tenant detail แสดงเมทาดาต้า/ตัวเลขสรุป ไม่แสดงข้อมูลธุรกิจรายแถว (รายการขาย, โปรไฟล์ลูกค้า) — อยากเห็นต้อง impersonate ซึ่งถูก audit + แจ้งเจ้าของร้าน

### ตำแหน่งโค้ด (ตาม WORKPLAN_PARALLEL)

> 📌 **(D16 — RESOLUTIONS) โมดูล Backoffice = Stage D ใน WORKPLAN** — เริ่มได้หลัง CORE Stage A (โดยเฉพาะ A2b: SSE hub, object storage/upload, flags, `platformPrisma`, backoffice slots/imp middleware) · จุดเชื่อมที่ CORE ต้องเผื่อไว้ล่วงหน้าอยู่ในหัวข้อ 8

```
prisma/schema/backoffice.prisma        ← ตาราง platform ทั้งหมดของโมดูลนี้
lib/modules/backoffice/                ← business logic
app/(backoffice)/                      ← UI (โดเมน backoffice.shark.in.th เท่านั้น)
app/api/backoffice/                    ← API (middleware ตรวจ PlatformUser session)
messages/{th,en}/backoffice.json
```
- ตาราง `Tenant`, `User`, `PlatformUser`(โครงเดิม) อยู่ `core.prisma` — โมดูลนี้ **ขอ contract change 1 รายการ**: เพิ่มค่า enum `PlatformRole.FINANCE` + field 2FA ใน `PlatformUser` (additive) → ยื่น `docs/contract-changes/` ตามกติกา
- ฝั่งร้าน (widget แจ้งปัญหา, banner ประกาศ, impersonation banner) เป็น component ใน `(app)` shell — ระบุจุดเชื่อมที่ CORE ต้องเผื่อไว้ในหัวข้อ 8

---

## 2. Persona & User Stories

| Persona | Stories |
|---|---|
| **SUPER_ADMIN** (เจ้าของแพลตฟอร์ม/CTO) | ฉันอยากเห็นสุขภาพทั้งแพลตฟอร์มในจอเดียว (ร้านใหม่ วันนี้ขายเท่าไร ระบบล่มไหม เคสค้างกี่ใบ) · ฉันระงับร้านที่ abuse ได้ทันทีโดยข้อมูลไม่หาย · ฉันเปิดฟีเจอร์ทดลองให้ร้านนำร่อง 5% ก่อน roll out · ฉันเป็นคนเดียวที่อนุมัติ impersonation แบบ write และการลบร้าน |
| **SUPPORT** (เจ้าหน้าที่ซัพพอร์ต) | เคสใหม่เด้งเข้า inbox ฉัน มอบหมาย/รับเอง ตอบร้านได้ในหน้าเดียว มี canned response ไม่ต้องพิมพ์ซ้ำ · เคสไหนใกล้หลุด SLA ต้องเห็นชัดก่อนหลุด · ร้านอธิบายบั๊กไม่ถูก → ฉันขอ impersonate read-only 30 นาทีไปดูหน้าจอจริงของร้าน · โน้ตภายในให้ทีมอ่านโดยร้านไม่เห็น |
| **FINANCE** (การเงิน) | มีคิวสลิปรอตรวจ → เทียบยอด/เวลาโอน → กดยืนยันแล้วระบบ activate โดเมน + ออกใบเสร็จให้อัตโนมัติ · ฉันเห็นรายได้แพลตฟอร์ม รายการค้างชำระ ใบที่ใกล้หมดอายุ · ฉันแก้ข้อมูลร้านไม่ได้และไม่จำเป็นต้องเห็น |
| **ร้านค้า Owner/Manager** (ฝั่งเปิดเคส) | เจอปัญหา → กดปุ่ม "แจ้งปัญหา" มุมขวาล่างของ dashboard แนบ screenshot ส่งได้ใน 1 นาที · มีคนตอบฉันได้รับอีเมล + เห็น thread ใน dashboard · ปิดเคสแล้วให้คะแนนความพอใจได้ · มีประกาศจากแพลตฟอร์ม (ปิดปรับปรุง/ฟีเจอร์ใหม่) เห็นเป็น banner กด "รับทราบ" แล้วหายไป · ฉันขอ export ข้อมูลร้านทั้งหมด หรือขอลบร้านตาม PDPA ได้ |
| **เจ้าของร้าน** (ฝั่งถูก impersonate) | ถ้าทีมแพลตฟอร์มเข้าดูร้านฉัน ฉันต้องได้อีเมลแจ้งทันทีว่าใครเข้า เมื่อไร เหตุผลอะไร |

---

## 3. ฟังก์ชันทั้งหมด

### 3.1 PlatformUser + Auth + 2FA
- ✅ Role 3 ระดับ: `SUPER_ADMIN` / `SUPPORT` / `FINANCE` — สิทธิ์ตามตารางหัวข้อ 9 (จุดตรวจเดียว `canPlatform(user, action)`)
- ✅ Login = passwordless email (magic link/OTP ส่งเข้าอีเมล) **+ TOTP บังคับ** = 2 factor เสมอ
  - user ใหม่: SUPER_ADMIN สร้าง → ได้อีเมลเชิญ → login ครั้งแรกถูกบังคับ setup TOTP (QR + ยืนยัน 6 หลัก) ก่อนเข้าหน้าใดๆ + ได้ recovery codes 10 ชุด (single-use, แสดงครั้งเดียว)
  - ทุก login หลังจากนั้น: อีเมล OTP → TOTP → เข้าได้
- ✅ Session: cookie `__Host-bo_session` (Secure, HttpOnly, SameSite=Strict, path=/, โดเมน backoffice เท่านั้น), idle timeout 60 นาที, absolute 12 ชั่วโมง, เก็บใน `PlatformSession` (revoke รายเครื่องได้)
- ✅ แจ้งเตือน login จากเครื่อง/IP ใหม่ทางอีเมล · ล็อก 15 นาทีหลังใส่ TOTP ผิด 5 ครั้ง
- ✅ จัดการทีม (SUPER_ADMIN): สร้าง/ปิดใช้งาน/เปลี่ยน role/reset 2FA (reset = บังคับ setup ใหม่ + audit + อีเมลแจ้งเจ้าตัว)
- ✅ SUPER_ADMIN คนสุดท้ายห้ามลดสิทธิ์/ปิดใช้งานตัวเอง (ต้องมี SUPER_ADMIN ≥ 1 เสมอ)
- 🔜 IP allowlist ต่อ role, SSO Google Workspace, WebAuthn/passkey

### 3.2 Tenant Management
- ✅ **List + ค้นหา + filter**: ค้นจากชื่อ/slug/อีเมล owner/custom domain · filter: plan, `Tenant.status`, โมดูลที่เปิด, ช่วงวันที่สมัคร, active ล่าสุด (7/30/90 วัน/ไม่ active), มี custom domain, มีเคสเปิดอยู่ · sort: สมัครล่าสุด, active ล่าสุด, GMV 30 วัน · เพจจิเนตแบบ cursor
- ✅ **หน้า detail ร้าน** (แท็บ):
  - *Overview*: ชื่อ/slug/plan/status/วันที่สมัคร/active ล่าสุด, owner (ชื่อ+อีเมล), KPI สรุปจาก rollup (GMV 30 วัน, จำนวนสมาชิก, จำนวนธุรกรรม), ปุ่ม action (ระงับ/ปิด/impersonate/เปิดเคสแทนร้าน)
  - *Units*: รายการ BusinessUnit (ชื่อ, type, status, สร้างเมื่อ)
  - *Team*: Membership ทั้งหมด (อีเมล, role, unitAccess, login ล่าสุด) — read-only
  - *Usage*: ตัวเลขเทียบ `Tenant.limits` (จำนวน unit, สมาชิกทีม, ลูกค้า, storage, ธุรกรรม/เดือน) + กราฟ 90 วันจาก rollup
  - *Modules & Limits*: toggle เปิด-ปิดโมดูลรายร้าน (`enabledModules`) + ฟอร์มแก้ `Tenant.limits` (JSON editor แบบ field-by-field มี default + คำอธิบาย)
  - *Timeline*: เหตุการณ์สำคัญของร้าน (สมัคร, เปิดโมดูล, เปิดเคส, ถูกระงับ, ซื้อโดเมน, impersonated) — อ่านจาก `PlatformAuditLog` + system events
  - *Notes*: โน้ตภายในทีมแพลตฟอร์มต่อร้าน (`TenantNote`) — ร้านไม่เห็น
- ✅ **เปลี่ยนสถานะร้าน** (ผลกระทบต้องชัด — แสดง dialog สรุปก่อนยืนยัน + ต้องกรอกเหตุผล):

| Action | Tenant.status | ผลกระทบ |
|---|---|---|
| อนุมัติ | `PENDING → ACTIVE` | (ใช้เมื่อเปิด approval mode/ร้านโดน flag ตอนสมัคร) ร้านเริ่มใช้งานได้ |
| ระงับ (suspend) | `ACTIVE → SUSPENDED` | ทีมร้าน **login ไม่ได้** (เห็นหน้า "ร้านถูกระงับ + เหตุผล + ปุ่มเปิดเคสอุทธรณ์") · **storefront/custom domain ปิด** (410 + หน้าแจ้ง) · cron/notify ของร้านหยุด · **ข้อมูลอยู่ครบ** · ปลดระงับได้ทุกเมื่อ |
| ปลดระงับ | `SUSPENDED → ACTIVE` | กลับมาใช้ได้ทั้งหมดทันที |
| ปิดร้าน (close) | `→ CLOSED` | เหมือน SUSPENDED + ตั้งใจถาวร (ร้านเลิกใช้/เลิกกิจการ) · ยังกู้คืนได้โดย SUPER_ADMIN · ไม่ purge ข้อมูลจนกว่าจะมี DeletionRequest |
| ลบตาม PDPA | `→ PENDING_DELETE` | ดูหัวข้อ 3.10 (soft delete 30 วัน → purge) |
- ✅ เปิด-ปิดโมดูลรายร้าน: toggle แล้วมีผลทันที (เมนูร้านซ่อน/โชว์) — ปิดโมดูล **ไม่ลบข้อมูล** ของโมดูลนั้น เปิดกลับมาเห็นเหมือนเดิม · ปิดโมดูลที่มีธุรกรรมวันนี้ → เตือนก่อนยืนยัน
- ✅ ปรับ `Tenant.limits` รายร้าน: override ค่า default ของ plan (เช่น เพิ่มจาก 5 → 10 units ให้ร้านนำร่อง) — ทุกการแก้ลง audit พร้อม before/after
- ✅ เปิดเคสแทนร้าน (proactive): SUPPORT สร้าง SupportCase ให้ร้าน (เช่น เห็น error จาก monitoring ก่อนร้านแจ้ง) — ร้านเห็นเคสใน dashboard ตัวเอง
- 🔜 ส่งอีเมลถึง owner จากหน้า detail, tag/segment ร้าน (สำหรับ CRM แพลตฟอร์มเอง)

### 3.3 Support Desk (ฟีเจอร์หลัก)

**ฝั่งร้าน (ใน dashboard ร้าน `(app)`)**
- ✅ **Widget "แจ้งปัญหา"** ปุ่มลอยมุมขวาล่าง ทุกหน้าใน `(app)` → เปิด panel: เลือกประเภท → หัวข้อ → รายละเอียด → แนบรูป/ไฟล์ (สูงสุด 5 ไฟล์ × 10MB, image/pdf/log) → ส่ง
  - แนบ context อัตโนมัติ: URL หน้าปัจจุบัน, unitId ที่เลือกอยู่, browser/UA, ขนาดจอ, locale (ร้านเห็นว่าแนบอะไร ลบได้)
- ✅ **หน้า Help Center** `/app/help`: รายการเคสของร้าน (filter สถานะ) + ปุ่มเปิดเคสใหม่ + ประกาศล่าสุดจากแพลตฟอร์ม
- ✅ หน้าเคสฝั่งร้าน `/app/help/cases/[caseNo]`: thread ข้อความ (ไม่เห็น internal note), ตอบกลับ + แนบไฟล์, เห็นสถานะ/ผู้ดูแล, ปุ่ม "ปัญหาแก้แล้ว" (ร้านกดปิดเอง → RESOLVED)
- ✅ Email notify ร้าน: ตอบกลับจากทีม, เปลี่ยนสถานะ, ขอข้อมูลเพิ่ม (WAITING_MERCHANT), เชิญให้คะแนน CSAT — ทุกฉบับมีลิงก์ตรงเข้าหน้าเคส
- ✅ ใครเปิด/เห็นเคสได้: Membership role OWNER/MANAGER ทุกคนของร้านเห็นทุกเคสของร้าน · STAFF เปิดเคสได้และเห็นเฉพาะเคสที่ตัวเองเปิด

**ประเภท / สถานะ / Priority / SLA**
- ✅ ประเภทเคส: `BUG` บั๊ก · `USAGE` สอบถามการใช้งาน · `FEATURE_REQUEST` ขอฟีเจอร์ · `BILLING` บิลลิ่ง/ชำระเงิน · `DOMAIN` โดเมน/DNS
- ✅ สถานะ: `OPEN` → `IN_PROGRESS` → (`WAITING_MERCHANT` ⇄) → `RESOLVED` → `CLOSED`
  - `WAITING_MERCHANT` = รอข้อมูลจากร้าน (นาฬิกา SLA resolve **หยุดเดิน**) · ร้านตอบ → เด้งกลับ `IN_PROGRESS` อัตโนมัติ
  - `RESOLVED` = ทีมตอบว่าแก้แล้ว/ตอบครบแล้ว · ร้านตอบกลับภายใน 7 วัน → reopen เป็น `IN_PROGRESS` (นับ `reopenCount`) · ครบ 7 วันไม่ตอบ → auto-`CLOSED`
  - `CLOSED` = จบถาวร ร้านตอบเพิ่มไม่ได้ (ต้องเปิดเคสใหม่ ระบบใส่ลิงก์อ้างเคสเก่าให้)
- ✅ Priority + SLA (เวลาทำการ จ–ส 09:00–18:00 Asia/Bangkok, config ที่ `PlatformSettings` — ยกเว้น URGENT นับ 24/7):

| Priority | นิยาม | First response | Resolve target |
|---|---|---|---|
| `URGENT` | ระบบร้านใช้ไม่ได้/ขายไม่ได้/data ผิดเสียหาย | 1 ชม. (24/7) | 24 ชม. |
| `HIGH` | ฟีเจอร์หลักพัง มี workaround | 4 ชม.ทำการ | 2 วันทำการ |
| `NORMAL` (default) | ใช้งานติดขัด/สอบถาม | 8 ชม.ทำการ | 5 วันทำการ |
| `LOW` | ขอฟีเจอร์/คำถามทั่วไป | 24 ชม.ทำการ | best effort |
  - ร้านเลือก priority ไม่ได้ (เลือกได้แค่ประเภท + ติ๊ก "ใช้งานไม่ได้เลย" ซึ่ง map เป็นข้อเสนอ URGENT) — SUPPORT เป็นคน set/แก้ priority
  - `firstResponseAt` = ข้อความ public แรกจากฝั่ง platform · ระบบคำนวณ `slaFirstResponseDueAt`/`slaResolveDueAt` ตอนสร้าง/เปลี่ยน priority
  - แจ้งเตือนภายใน (Telegram/email ทีม): เคสใหม่ URGENT ทันที, เคสใกล้หลุด SLA (เหลือ 25% ของเวลา), เคสหลุด SLA (ตั้ง `slaBreachedAt`)
- ✅ **มอบหมาย**: assign ให้ agent (SUPPORT/SUPER_ADMIN), รับเคสเอง (claim), โอนเคส · เคส `BILLING` แนะนำ assign FINANCE ได้ (FINANCE ตอบเคส BILLING ได้)
- ✅ **Escalate**: SUPPORT กด escalate + เหตุผล → priority ขึ้นหนึ่งขั้น + แจ้ง SUPER_ADMIN + ตั้ง `escalatedAt` — ใช้เมื่อเกินมือ/ต้อง decision
- ✅ **Thread ข้อความ**: 2 ฝั่ง (ร้าน ↔ platform) + `SYSTEM` (บันทึกอัตโนมัติ: เปลี่ยนสถานะ/มอบหมาย/escalate) · **internal note** (`isInternal=true`) เห็นเฉพาะฝั่ง platform, UI แถบพื้นเหลืองอ่อนแยกชัด, สลับโหมด "ตอบร้าน / โน้ตภายใน" ต้องกดชัดเจน (กันพลาดส่งโน้ตให้ร้าน — default คือโน้ตภายในเมื่อเปิดจาก tab internal)
- ✅ **Canned responses**: คลัง (title, body, หมวด) + ตัวแปร `{{merchantName}}`, `{{caseNo}}`, `{{agentName}}` · ค้นด้วย `/` ในกล่องตอบ · CRUD โดย SUPPORT ทุกคน
- ✅ **CSAT**: เมื่อเคส RESOLVED/CLOSED ส่งอีเมล + แสดงในหน้าเคสฝั่งร้าน: คะแนน 1–5 ดาว + คอมเมนต์ (optional) · ให้ได้ครั้งเดียว แก้ไม่ได้ · ลิงก์หมดอายุ 14 วัน · คะแนน ≤ 2 แจ้งเตือน SUPER_ADMIN
- ✅ **รายงาน Support** (หัวข้อ 10): เคสเปิดใหม่/ปิดต่อวัน, first response/resolve time เฉลี่ยและ P90, %SLA hit, หมวดปัญหายอดฮิต, backlog aging, CSAT เฉลี่ยต่อ agent
- 🔜 Knowledge base/FAQ บทความสาธารณะ + suggest บทความอัตโนมัติตอนร้านพิมพ์เปิดเคส · merge เคสซ้ำ · SLA แบบ custom ต่อ plan

### 3.4 Impersonation ("เข้าดูแทนร้าน")

> ✅ **(D13 — RESOLUTIONS) หัวข้อนี้เป็น canonical ของ impersonation ทั้งระบบ** — SECURITY.md §9 แก้ให้ตรงตามนี้แล้ว (30 นาที read-only default · WRITE ต้อง SUPER_ADMIN/approve) · **blocklist = union ของ SECURITY.md ∪ ไฟล์นี้** (ดู bullet โหมด WRITE) · audit สองชั้น: ทุก request → PlatformAuditLog, mutation (WRITE) → AuditLog ร้านด้วย (`actorType=IMPERSONATED, onBehalfOf=platformUserId`)

- ✅ Flow: จากหน้า tenant detail หรือหน้าเคส → กด "เข้าดูแทนร้าน" → กรอก **เหตุผล (บังคับ ≥ 10 ตัวอักษร)** + ลิงก์เคสที่เกี่ยว (optional) → ได้ session
- ✅ โหมด:
  - `READ_ONLY` (default): SUPPORT/SUPER_ADMIN เริ่มได้เอง ทันที · ทุก mutation (POST/PUT/PATCH/DELETE ที่ไม่ใช่ whitelist เช่น เปลี่ยนภาษา UI) ถูก middleware block พร้อมข้อความ "โหมดอ่านอย่างเดียว"
  - `WRITE`: **SUPER_ADMIN เท่านั้น** (SUPPORT ขอ → สร้างคำขอค้างให้ SUPER_ADMIN อนุมัติใน backoffice ก่อน จึงเริ่มได้) + เหตุผลบังคับ · แม้ WRITE ก็มี blocklist ถาวร = **union กับ SECURITY.md §9 (D13)**: เปลี่ยนอีเมล owner, ลบ/เชิญสมาชิกทีม, action ชำระเงิน/จ่ายเงิน, ลบ unit, ลบข้อมูล, แก้ payment settings, export ลูกค้าทั้งหมด
- ✅ อายุ **30 นาที** นับจากเริ่ม (hard limit, ไม่มี extend — หมดแล้วขอใหม่) · จบก่อนได้ด้วยปุ่ม "สิ้นสุด" · token ผูกกับ `ImpersonationSession` + `bo_session` เดิม (หลุด bo_session = impersonation ตายด้วย)
- ✅ กลไก: backoffice ออก signed token (JWT อายุสั้น มี `impersonationId`, `tenantId`, `mode`) → เปิดแท็บใหม่ไปที่ dashboard ร้าน `/app?imp={token}` → middleware ฝั่ง `(app)` ตรวจ token → สร้าง session context พิเศษ (**ไม่ใช่** session ของ user จริงคนไหนในร้าน — `actor = platformUser via impersonation`)
- ✅ **Banner แดงตลอด** ทุกหน้า (sticky top, ปิดไม่ได้): "🔴 คุณกำลังดูร้าน {ชื่อร้าน} ในฐานะทีมแพลตฟอร์ม ({mode}) — เหลือ {mm:ss} · [สิ้นสุด]"
- ✅ **Audit ทุก request**: ทุก HTTP request ระหว่าง impersonation ลง `PlatformAuditLog` (path, method, impersonationId; ถ้า write เก็บ payload ย่อ + before/after) — append-only
- ✅ **แจ้งเจ้าของร้านอัตโนมัติ**: อีเมลถึง owner ทันทีที่ session เริ่ม (ใคร, โหมดอะไร, เหตุผล, เวลา) — ปิดการแจ้งไม่ได้ · จบ session สรุปให้ owner อีกฉบับ (จำนวน request, ระยะเวลา)
- ✅ ประวัติ impersonation ทั้งหมดดูได้ที่ backoffice (BO-20) + โชว์ใน timeline ของร้าน
- ✅ ร้านที่ `SUSPENDED/CLOSED`: impersonate ได้ (จำเป็นสำหรับ debug/ตรวจสอบ) — banner ระบุสถานะร้านด้วย

### 3.5 Billing (วางโครง — ตอนนี้ฟรี)
- ✅ **PlanDefinition**: FREE (default, 0฿) — โครงพร้อมสำหรับ plan เก็บเงินอนาคต (code, ชื่อ TH/EN, ราคา/ช่วงเวลา, limits default, feature list) · v1 แก้ได้เฉพาะ limits ของ FREE
- ✅ **Custom domain 1,500฿/ปี** (product เดียวที่เก็บเงินใน v1) — flow เต็มดูหัวข้อ 7.4:
  1. ร้านกดสั่งซื้อจากหน้า settings/domain ของร้าน → ระบบออก `PlatformInvoice` (PENDING_PAYMENT, ครบกำหนด 7 วัน)
  2. ร้านชำระ: โอนธนาคาร/PromptPay (แสดง QR + เลขบัญชีแพลตฟอร์ม) → **แนบสลิป** + เวลาโอน
  3. เข้า **คิวตรวจของ FINANCE** → เทียบยอด/เวลา → ยืนยัน (`VERIFIED`) หรือปฏิเสธ (`REJECTED` + เหตุผล → ร้านแนบใหม่ได้)
  4. ยืนยันแล้ว → invoice `PAID` → **activate** บริการ (DomainRequest เดินต่อ) + ออก**ใบเสร็จ** (เลขรัน `RCPT-{YYYY}-{run}`) PDF ส่งอีเมล · ร้านขอ**ใบกำกับภาษี**ได้ (กรอกชื่อ/เลขผู้เสียภาษี/ที่อยู่ — snapshot ลง invoice, เลข `TINV-{YYYY}-{run}`)
  5. **ต่ออายุ**: แจ้งเตือนก่อนหมด 30 วัน และ 7 วัน (อีเมล + banner ใน dashboard ร้าน) → ออก invoice ต่ออายุให้อัตโนมัติ → จ่าย+ยืนยัน = ต่อ `expiresAt` +1 ปี
  6. **หมดอายุ**: เกิน `expiresAt` + grace 7 วัน → domain `SUSPENDED` (storefront บนโดเมนนั้นแสดงหน้า "หมดอายุ" · path `/s/{slug}` ปกติยังใช้ได้) → จ่ายย้อนหลังได้ภายใน 90 วัน = reactivate · เกิน 90 วัน = `REMOVED` ต้องสมัครใหม่
- ✅ ประวัติชำระต่อร้าน (แท็บใน tenant detail + หน้ารวมของ FINANCE): invoice ทุกใบ, สลิป, ใครยืนยัน, ใบเสร็จ/ใบกำกับ
- ✅ Void invoice (FINANCE, ก่อนจ่ายเท่านั้น) — ใบเสร็จออกแล้วห้ามแก้ (immutable ตาม _CONVENTIONS ข้อ 5) แก้ = void + ออกใหม่อ้างใบเดิม
- 🔜 gateway อัตโนมัติ (Beam/PromptPay API ตัดอัตโนมัติ), plan รายเดือน, ส่วนลด/โค้ด, ใบกำกับ e-Tax

### 3.6 Custom Domain Ops
- ✅ **คิวคำขอ**: ร้านกรอกโดเมนที่ settings → เกิด `DomainRequest` → backoffice เห็นคิวทั้งหมด filter ตามสถานะ
- ✅ State machine: `REQUESTED → PENDING_PAYMENT → AWAITING_DNS → VERIFYING → VERIFIED → SSL_ISSUING → ACTIVE` · fail path: `FAILED` (ตรวจไม่ผ่าน — retry ได้) · `SUSPENDED` (หมดอายุ/ร้านถูกระงับ) · `REMOVED`
- ✅ หน้า detail ต่อคำขอ: ค่า DNS ที่ต้องตั้ง (CNAME → `cname.shark.in.th` / A record) vs ค่าจริงที่ระบบเห็น (dig ล่าสุด), สถานะ SSL cert (issued/expiry), ประวัติการเช็คทุกครั้ง
- ✅ **ปุ่ม Re-check**: ยิงตรวจ DNS + ออก/ต่อ SSL ทันที (มี rate limit 1 ครั้ง/นาที/โดเมน) — cron ตรวจอัตโนมัติทุก 10 นาทีสำหรับสถานะค้าง `AWAITING_DNS/VERIFYING/SSL_ISSUING`
- ✅ **Troubleshooting view**: วินิจฉัยอัตโนมัติพร้อมคำแนะนำเป็นภาษาคน — "CNAME ชี้ไป www แต่ยังไม่ชี้ root", "เจอ AAAA record เกิน", "DNS ยัง propagate ไม่ครบ (TTL {n})", "CAA record block การออก cert" · ปุ่ม copy ข้อความอธิบายส่งให้ร้าน (ใช้ตอบเคส DOMAIN)
- ✅ ถอดโดเมน (ร้านขอเอง/แพลตฟอร์มถอด + เหตุผล) → tenant resolver หยุด map ทันที
- ✅ เคสประเภท `DOMAIN` ลิงก์ถึง DomainRequest ของร้านอัตโนมัติ (agent เห็น diagnostic ในหน้าเคสเลย)

### 3.7 Announcement
- ✅ สร้างประกาศ: title, body (Markdown), type: `INFO` / `MAINTENANCE` / `RELEASE` / `CRITICAL`, ช่วงแสดงผล (`publishAt`–`expiresAt`), pin ได้
- ✅ **Audience**: ทั้งหมด หรือ segment — เงื่อนไข AND: plan, โมดูลที่เปิด, มี custom domain, tenantIds ระบุเอง · ประเมิน ณ เวลาอ่าน (ร้านเปิดโมดูลทีหลังก็เห็นประกาศของโมดูลนั้นที่ยังไม่หมดอายุ)
- ✅ **ฝั่งร้านเห็น**: banner แถบบนใน dashboard `(app)` (CRITICAL = แดง ปิดไม่ได้จนกว่ากด "รับทราบ" · อื่นๆ = ขาวดำ กด × ได้) + หน้ารวมประกาศ/`release notes` ใน `/app/help` + badge กระดิ่ง
- ✅ **Read receipt**: กด "รับทราบ"/เปิดอ่าน → `AnnouncementRead` (per user) · backoffice เห็น % ร้านที่อ่านแล้ว + drill down ว่าร้านไหนยังไม่อ่าน (สำคัญกับ MAINTENANCE)
- ✅ สถานะ: `DRAFT → SCHEDULED → PUBLISHED → ARCHIVED` · แก้หลัง publish ได้ (โชว์ "แก้ไขล่าสุด") · ยกเลิก = archive
- 🔜 ส่งอีเมลประกอบประกาศ (v1: in-app เท่านั้น ยกเว้น MAINTENANCE เลือกส่งอีเมลได้), target รายภาษา

### 3.8 Platform Metrics Dashboard
- ✅ แหล่งข้อมูล = `PlatformDailyStat` (rollup รายวันโดย cron 03:30 ICT ต่อ tenant ต่อวัน) + counter สด (เคส, health) — **UI ไม่ยิง query ลงตารางธุรกรรมร้านตรงๆ เด็ดขาด**
- ✅ การ์ด KPI: ร้านทั้งหมด/ใหม่ (วัน/สัปดาห์/เดือน), ร้าน active (มี login หรือธุรกรรมใน 7/30 วัน), churn (ไม่ active > 60 วัน), **GMV รวม** (ยอด PosSale ทุกร้าน — aggregate เท่านั้น ไม่มี drill down ถึงรายบิล), เคสเปิดอยู่/หลุด SLA, สมาชิกทีม/ลูกค้า รวมแพลตฟอร์ม
- ✅ กราฟ: ร้านใหม่รายวัน 90 วัน, GMV รายวัน, ร้าน active รายสัปดาห์, การใช้โมดูล (ร้านกี่ร้านเปิดโมดูลไหน)
- ✅ **System health**: SSE/queue lag, error rate (5xx ต่อนาที จาก log aggregation), cron runner status (งานล่าสุดของทุก cron จาก A2 — เขียว/เหลือง/แดง), DB connection pool, storage usage — พร้อม threshold แจ้งเตือน Telegram ทีม
- 🔜 cohort retention, funnel onboarding (สมัคร→สร้าง unit→ธุรกรรมแรก), export CSV

### 3.9 Feature Flags
- ✅ `FeatureFlag`: key (เช่น `pos.new_receipt_layout`), คำอธิบาย, `defaultOn`, `rolloutPercent` 0–100, สถานะ ACTIVE/ARCHIVED
- ✅ Override รายร้าน: force ON / force OFF ต่อ tenant (ชนะทุกอย่าง)
- ✅ ลำดับประเมิน: override รายร้าน → percentage (`hash(flagKey + tenantId) % 100 < rolloutPercent` — deterministic ร้านเดิมได้ผลเดิมเสมอ ไม่สุ่มใหม่ทุก request) → `defaultOn`
- ✅ Contract ให้ CORE: `flags.isEnabled(key, tenantId): boolean` ใน `lib/core/flags` (cache 60 วิ + invalidate เมื่อแก้) — โมดูลธุรกิจเรียกอ่านอย่างเดียว แก้ค่าได้จาก backoffice เท่านั้น
- ✅ แก้ flag ทุกครั้งลง audit (ก่อน/หลัง) — flag เปิดผิดร้านคือ incident
- 🔜 targeting ตาม plan/โมดูล, scheduled rollout (ค่อยๆ ไต่ %), kill switch รวม

### 3.10 Data & Compliance
- ✅ **Export ข้อมูลร้าน** (ร้านขอย้ายออก/ขอสำเนา): ร้านกดขอเองจาก settings หรือ backoffice กดแทน → `TenantExportJob` (background) → ZIP ของ JSON+CSV ทุกตารางของ tenant (แยกไฟล์ต่อโมดูล) + ไฟล์แนบ → ลิงก์ดาวน์โหลด signed URL อายุ 72 ชม. ส่งอีเมล **owner เท่านั้น** · จำกัด 1 job ค้าง/tenant · ทุกครั้งลง audit
- ✅ **ลบร้านตามคำขอ (PDPA)**:
  1. Owner ยื่นคำขอ (ยืนยันด้วย OTP อีเมล) หรือส่งคำขอผ่านเคส → `TenantDeletionRequest` (PENDING)
  2. **SUPER_ADMIN approve เท่านั้น** (ตรวจ: ไม่มี invoice ค้าง, ไม่มีข้อพิพาท) → tenant เป็น `PENDING_DELETE` = ระงับทันที (login/storefront ปิด) + เสนอ export ให้ก่อน
  3. **Soft delete 30 วัน**: ข้อมูลอยู่ครบ กู้คืนได้ (owner ขอยกเลิกได้ภายในช่วงนี้ → กลับ ACTIVE)
  4. ครบ 30 วัน → cron **purge**: ลบข้อมูลธุรกิจ + PII ทั้งหมดของ tenant (hard delete รายตาราง + ไฟล์ใน storage) · **คงไว้**: PlatformInvoice/ใบเสร็จ (หน้าที่ทางบัญชี-ภาษี, PII ขั้นต่ำ), PlatformAuditLog (anonymize reference), แถว Tenant โครง (id, slug ปล่อยคืน, `purgedAt`) กันสถิติพัง · purge ต้อง idempotent + มีรายงานผลต่อตาราง
- ✅ **Audit Log Viewer** platform-wide: ค้น/filter ตาม platformUser, tenant, action, ช่วงเวลา, impersonationId · เห็น before/after diff · **append-only — ไม่มี API แก้/ลบ** · retention ≥ 2 ปี · export CSV (SUPER_ADMIN)
- 🔜 anonymize รายลูกค้าคนเดียวข้ามแพลตฟอร์ม (v1: ทำในโมดูล Member ของแต่ละร้าน), data residency report

---

## 4. Data Model (Prisma)

> ไฟล์ `prisma/schema/backoffice.prisma` — ทุกตารางเป็น platform-level (ไม่มี tenant guard; ห้ามผ่าน Prisma extension ตัว inject tenantId → ใช้ client แยก `platformPrisma` ที่ไม่มี extension นั้น)
> อ้าง `Tenant`, `User`, `PlatformUser` จาก core.prisma · **contract change ที่ต้องยื่น**: เพิ่ม `FINANCE` ใน enum `PlatformRole` + field 2FA/status ใน `PlatformUser` (additive)

```prisma
// ── Auth ─────────────────────────────────────────────

enum PlatformRole { SUPER_ADMIN SUPPORT FINANCE }        // FINANCE = contract change (additive)
enum PlatformUserStatus { ACTIVE DISABLED }

model PlatformUser {                                      // ขยายจาก core (แสดงเต็มเพื่อความชัด)
  id            String   @id @default(cuid())
  email         String   @unique
  name          String
  role          PlatformRole
  status        PlatformUserStatus @default(ACTIVE)
  totpSecret    String?                                   // encrypted at rest
  totpEnabledAt DateTime?
  recoveryCodes Json     @default("[]")                   // hashed, single-use
  lastLoginAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  sessions        PlatformSession[]
  assignedCases   SupportCase[]        @relation("CaseAssignee")
  messages        SupportMessage[]
  cannedResponses CannedResponse[]
  impersonations  ImpersonationSession[] @relation("ImpUser")
  impApprovals    ImpersonationSession[] @relation("ImpApprover")
  auditLogs       PlatformAuditLog[]
  announcements   PlatformAnnouncement[]
  verifiedPayments PlatformPayment[]
  tenantNotes     TenantNote[]
}

model PlatformSession {
  id             String   @id @default(cuid())
  platformUserId String
  user           PlatformUser @relation(fields: [platformUserId], references: [id])
  tokenHash      String   @unique
  ip             String?
  userAgent      String?
  lastSeenAt     DateTime @default(now())
  expiresAt      DateTime                                  // absolute 12h
  revokedAt      DateTime?
  createdAt      DateTime @default(now())
  @@index([platformUserId, expiresAt])
}

model PlatformSettings {                                   // singleton (id="default")
  id            String @id @default("default")
  businessHours Json   @default("{\"tz\":\"Asia/Bangkok\",\"days\":[1,2,3,4,5,6],\"open\":\"09:00\",\"close\":\"18:00\"}")
  slaMatrix     Json                                       // { URGENT:{firstMin:60,resolveMin:1440,clock:"24_7"}, ... }
  paymentInfo   Json                                       // บัญชีธนาคาร + PromptPay ของแพลตฟอร์ม
  updatedAt     DateTime @updatedAt
}

// ── Support Desk ─────────────────────────────────────

enum SupportCategory { BUG USAGE FEATURE_REQUEST BILLING DOMAIN }
enum SupportStatus   { OPEN IN_PROGRESS WAITING_MERCHANT RESOLVED CLOSED }
enum SupportPriority { LOW NORMAL HIGH URGENT }

model SupportCase {
  id           String   @id @default(cuid())
  caseNo       String   @unique                            // "SC-2026-000123" sequence ต่อปี
  tenantId     String
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  unitId       String?                                     // หน่วยที่เกี่ยว (จาก context widget)
  category     SupportCategory
  status       SupportStatus   @default(OPEN)
  priority     SupportPriority @default(NORMAL)
  subject      String
  context      Json?                                       // {url, ua, screen, locale} จาก widget
  createdByUserId String?                                  // merchant User (null = platform เปิดแทน)
  openedByPlatformUserId String?
  assigneeId   String?
  assignee     PlatformUser? @relation("CaseAssignee", fields: [assigneeId], references: [id])
  domainRequestId String?                                  // ลิงก์อัตโนมัติเมื่อ category=DOMAIN
  relatedCaseId   String?                                  // เคสใหม่อ้างเคสเก่าที่ CLOSED

  slaFirstResponseDueAt DateTime?
  slaResolveDueAt       DateTime?
  firstResponseAt       DateTime?
  slaBreachedAt         DateTime?
  slaClockPausedAt      DateTime?                          // ตอน WAITING_MERCHANT
  slaPausedTotalMin     Int      @default(0)
  escalatedAt           DateTime?
  resolvedAt            DateTime?
  closedAt              DateTime?
  reopenCount           Int      @default(0)

  csatScore    Int?                                        // 1..5
  csatComment  String?
  csatAt       DateTime?
  csatTokenHash String?  @unique                           // ลิงก์ให้คะแนน one-time

  messages     SupportMessage[]
  attachments  SupportAttachment[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([tenantId, status])
  @@index([status, priority, slaResolveDueAt])
  @@index([assigneeId, status])
  @@index([category, createdAt])
}

enum SupportAuthor { MERCHANT PLATFORM SYSTEM }

model SupportMessage {
  id             String  @id @default(cuid())
  caseId         String
  case           SupportCase @relation(fields: [caseId], references: [id])
  authorType     SupportAuthor
  merchantUserId String?                                   // เมื่อ MERCHANT
  platformUserId String?                                   // เมื่อ PLATFORM
  platformUser   PlatformUser? @relation(fields: [platformUserId], references: [id])
  body           String
  isInternal     Boolean @default(false)                   // internal note — ห้าม serialize ไป API ฝั่งร้านเด็ดขาด
  attachments    SupportAttachment[]
  createdAt      DateTime @default(now())
  @@index([caseId, createdAt])
}

model SupportAttachment {
  id         String  @id @default(cuid())
  caseId     String
  case       SupportCase @relation(fields: [caseId], references: [id])
  messageId  String?
  message    SupportMessage? @relation(fields: [messageId], references: [id])
  fileName   String
  mimeType   String
  sizeBytes  Int
  storageKey String                                        // object storage (A2)
  uploadedByMerchant Boolean @default(true)
  createdAt  DateTime @default(now())
  @@index([caseId])
}

model CannedResponse {
  id          String  @id @default(cuid())
  title       String
  body        String                                       // รองรับ {{merchantName}} {{caseNo}} {{agentName}}
  category    SupportCategory?
  createdById String
  createdBy   PlatformUser @relation(fields: [createdById], references: [id])
  archivedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// ── Impersonation ────────────────────────────────────

enum ImpersonationMode   { READ_ONLY WRITE }
enum ImpersonationStatus { PENDING_APPROVAL ACTIVE ENDED EXPIRED DENIED }

model ImpersonationSession {
  id             String   @id @default(cuid())
  platformUserId String
  platformUser   PlatformUser @relation("ImpUser", fields: [platformUserId], references: [id])
  tenantId       String
  tenant         Tenant   @relation(fields: [tenantId], references: [id])
  mode           ImpersonationMode   @default(READ_ONLY)
  status         ImpersonationStatus @default(ACTIVE)
  reason         String                                    // บังคับ ≥ 10 ตัวอักษร (validate ชั้น service)
  caseId         String?                                   // เคสที่เกี่ยว
  approvedById   String?                                   // SUPER_ADMIN (บังคับเมื่อ mode=WRITE และผู้ขอไม่ใช่ SUPER_ADMIN)
  approvedBy     PlatformUser? @relation("ImpApprover", fields: [approvedById], references: [id])
  tokenHash      String   @unique
  startedAt      DateTime?
  expiresAt      DateTime?                                 // startedAt + 30 นาที (hard)
  endedAt        DateTime?
  requestCount   Int      @default(0)
  ownerNotifiedAt DateTime?                                // อีเมลแจ้ง owner ตอนเริ่ม
  createdAt      DateTime @default(now())
  @@index([tenantId, createdAt])
  @@index([platformUserId, createdAt])
}

// ── Billing ──────────────────────────────────────────

enum InvoiceType   { CUSTOM_DOMAIN PLAN ADDON }
enum InvoiceStatus { PENDING_PAYMENT PAID VOID EXPIRED }
enum PaymentMethod { BANK_TRANSFER PROMPTPAY }
enum PaymentStatus { SUBMITTED VERIFIED REJECTED }

model PlanDefinition {
  id            String  @id @default(cuid())
  code          String  @unique                            // "FREE"
  nameTh        String
  nameEn        String
  priceSatang   Int     @default(0)
  billingPeriod String  @default("YEARLY")                 // YEARLY | MONTHLY (อนาคต)
  defaultLimits Json                                       // {maxUnits:5, maxTeam:10, storageMb:1024, ...}
  features      Json    @default("[]")
  isActive      Boolean @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model PlatformInvoice {
  id           String  @id @default(cuid())
  invoiceNo    String  @unique                             // "INV-2026-000045" sequence ต่อปี
  tenantId     String
  tenant       Tenant  @relation(fields: [tenantId], references: [id])
  type         InvoiceType
  status       InvoiceStatus @default(PENDING_PAYMENT)
  description  String                                      // "Custom domain shop.example.com (ปี 1)"
  amountSatang Int                                         // 150000 = 1,500฿
  vatSatang    Int     @default(0)
  totalSatang  Int
  periodStart  DateTime?                                   // ช่วงบริการที่ invoice นี้ครอบ
  periodEnd    DateTime?
  dueAt        DateTime
  paidAt       DateTime?
  voidedAt     DateTime?
  voidReason   String?
  domainRequestId String?
  domainRequest   DomainRequest? @relation(fields: [domainRequestId], references: [id])

  receiptNo    String? @unique                             // "RCPT-2026-000045" ออกเมื่อ PAID
  taxInvoiceNo String? @unique                             // "TINV-..." ออกเมื่อร้านขอ
  taxInfo      Json?                                       // snapshot ชื่อ/เลขผู้เสียภาษี/ที่อยู่ (freeze)

  payments     PlatformPayment[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([tenantId, status])
  @@index([status, dueAt])
}

model PlatformPayment {
  id           String  @id @default(cuid())
  invoiceId    String
  invoice      PlatformInvoice @relation(fields: [invoiceId], references: [id])
  method       PaymentMethod
  status       PaymentStatus @default(SUBMITTED)
  amountSatang Int
  slipStorageKey String                                    // รูปสลิป
  transferAt   DateTime?                                   // เวลาที่ร้านบอกว่าโอน
  submittedByUserId String?                                // merchant User
  verifiedById String?
  verifiedBy   PlatformUser? @relation(fields: [verifiedById], references: [id])
  verifiedAt   DateTime?
  rejectReason String?
  createdAt    DateTime @default(now())
  @@index([status, createdAt])
  @@index([invoiceId])
}

// ── Custom Domain Ops ────────────────────────────────

enum DomainRequestStatus { REQUESTED PENDING_PAYMENT AWAITING_DNS VERIFYING VERIFIED SSL_ISSUING ACTIVE FAILED SUSPENDED REMOVED }

model DomainRequest {
  id           String  @id @default(cuid())
  tenantId     String
  tenant       Tenant  @relation(fields: [tenantId], references: [id])
  domain       String  @unique                             // "shop.example.com" (lowercase, punycode)
  status       DomainRequestStatus @default(REQUESTED)
  expectedDns  Json                                        // [{type:"CNAME", host:"shop", value:"cname.shark.in.th"}]
  lastCheckAt  DateTime?
  lastCheckResult Json?                                    // {records:[...], diagnosis:[...]} สำหรับ troubleshooting view
  sslIssuedAt  DateTime?
  sslExpiresAt DateTime?
  activatedAt  DateTime?
  expiresAt    DateTime?                                   // อายุบริการ (จาก invoice ปีต่อปี)
  suspendedAt  DateTime?
  removedAt    DateTime?
  failReason   String?
  invoices     PlatformInvoice[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([status, lastCheckAt])
  @@index([tenantId])
  @@index([status, expiresAt])                             // cron เตือนต่ออายุ
}

// ── Announcement ─────────────────────────────────────

enum AnnouncementType   { INFO MAINTENANCE RELEASE CRITICAL }
enum AnnouncementStatus { DRAFT SCHEDULED PUBLISHED ARCHIVED }

model PlatformAnnouncement {
  id          String  @id @default(cuid())
  title       String
  body        String                                       // Markdown
  type        AnnouncementType @default(INFO)
  status      AnnouncementStatus @default(DRAFT)
  audience    Json    @default("{\"all\":true}")           // {all} | {plans:[], modules:[], hasCustomDomain?, tenantIds:[]}
  publishAt   DateTime?
  expiresAt   DateTime?
  pinned      Boolean @default(false)
  createdById String
  createdBy   PlatformUser @relation(fields: [createdById], references: [id])
  reads       AnnouncementRead[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([status, publishAt])
}

model AnnouncementRead {
  id             String  @id @default(cuid())
  announcementId String
  announcement   PlatformAnnouncement @relation(fields: [announcementId], references: [id])
  tenantId       String
  userId         String                                    // merchant User
  readAt         DateTime @default(now())
  @@unique([announcementId, userId])
  @@index([announcementId, tenantId])
}

// ── Feature Flags ────────────────────────────────────

model FeatureFlag {
  id             String  @id @default(cuid())
  key            String  @unique                           // "pos.new_receipt_layout"
  description    String
  defaultOn      Boolean @default(false)
  rolloutPercent Int     @default(0)                       // 0–100
  archivedAt     DateTime?
  overrides      FeatureFlagOverride[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model FeatureFlagOverride {
  id       String  @id @default(cuid())
  flagId   String
  flag     FeatureFlag @relation(fields: [flagId], references: [id])
  tenantId String
  enabled  Boolean                                         // force ON/OFF ชนะ percent+default
  note     String?
  createdAt DateTime @default(now())
  @@unique([flagId, tenantId])
  @@index([tenantId])
}

// ── Compliance / Data ────────────────────────────────

enum ExportJobStatus { QUEUED RUNNING DONE FAILED }

model TenantExportJob {
  id           String  @id @default(cuid())
  tenantId     String
  requestedByUserId    String?                             // merchant owner
  requestedByPlatformId String?
  status       ExportJobStatus @default(QUEUED)
  storageKey   String?                                     // ZIP
  downloadExpiresAt DateTime?                              // signed URL 72 ชม.
  error        String?
  startedAt    DateTime?
  finishedAt   DateTime?
  createdAt    DateTime @default(now())
  @@index([tenantId, status])
}

enum DeletionStatus { PENDING APPROVED SOFT_DELETED PURGED CANCELLED }

model TenantDeletionRequest {
  id           String  @id @default(cuid())
  tenantId     String  @unique                             // 1 คำขอ active ต่อร้าน
  requestedByUserId String?
  reason       String?
  status       DeletionStatus @default(PENDING)
  approvedById String?                                     // SUPER_ADMIN เท่านั้น
  approvedAt   DateTime?
  softDeletedAt DateTime?
  purgeDueAt   DateTime?                                   // softDeletedAt + 30 วัน
  purgedAt     DateTime?
  cancelledAt  DateTime?
  purgeReport  Json?                                       // {table: rowsDeleted} ต่อการ purge
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

// ── Audit / Notes / Rollup ───────────────────────────

model PlatformAuditLog {                                   // APPEND-ONLY: ไม่มี update/delete ทุกชั้น
  id              String  @id @default(cuid())
  platformUserId  String?
  platformUser    PlatformUser? @relation(fields: [platformUserId], references: [id])
  impersonationId String?
  action          String                                   // "tenant.suspend", "imp.request", "flag.update", ...
  targetType      String                                   // "Tenant" | "SupportCase" | "FeatureFlag" | ...
  targetId        String?
  tenantId        String?                                  // ร้านที่ถูกกระทบ (มีเสมอเมื่อแตะข้อมูลร้าน)
  before          Json?
  after           Json?
  ip              String?
  userAgent       String?
  createdAt       DateTime @default(now())
  @@index([tenantId, createdAt])
  @@index([platformUserId, createdAt])
  @@index([action, createdAt])
  @@index([impersonationId])
}

model TenantNote {
  id          String  @id @default(cuid())
  tenantId    String
  body        String
  createdById String
  createdBy   PlatformUser @relation(fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
  @@index([tenantId, createdAt])
}

model PlatformDailyStat {                                  // rollup รายวัน — แหล่งเดียวของ metrics ข้ามร้าน
  id          String   @id @default(cuid())
  date        DateTime                                     // 00:00 UTC ของวัน (ICT)
  tenantId    String?                                      // null = แถวรวมทั้งแพลตฟอร์ม
  gmvSatang   BigInt   @default(0)                         // ยอดขาย POS สุทธิ (aggregate)
  saleCount   Int      @default(0)
  activeUsers Int      @default(0)                         // merchant login วันนั้น
  newMembers  Int      @default(0)
  casesOpened Int      @default(0)
  casesClosed Int      @default(0)
  storageMb   Int      @default(0)
  @@unique([date, tenantId])
  @@index([tenantId, date])
}
```

**หมายเหตุ relation ไป core**: `Tenant` เพิ่ม back-relation (`supportCases`, `invoices`, `domainRequests`, `impersonations`) — additive, ยื่นรวมใน contract change เดียวกัน · `Tenant.status` ต้องมีค่า `PENDING / ACTIVE / SUSPENDED / CLOSED / PENDING_DELETE` (+ field `suspendedReason String?`)

---

## 5. API Endpoints

> ทุก endpoint ใต้ `/api/backoffice/*` ผ่าน middleware: ตรวจ `bo_session` → `canPlatform(user, action)` → rate limit → handler · ตอบ 401 (ไม่มี session) / 403 (role ไม่ถึง)
> ฝั่งร้าน (`/api/help/*`, `/api/announcements/*`) ใช้ session ร้านปกติ + tenant guard เดิม

### 5.1 Auth (backoffice)
| Method | Path | ทำอะไร | Role |
|---|---|---|---|
| POST | `/api/backoffice/auth/request-otp` | ส่ง OTP เข้าอีเมล | public (rate limit แรง) |
| POST | `/api/backoffice/auth/verify-otp` | ตรวจ OTP → ขั้น TOTP | public |
| POST | `/api/backoffice/auth/verify-totp` | ตรวจ TOTP/recovery code → ออก session | public (มี pre-session) |
| POST | `/api/backoffice/auth/setup-totp` | สร้าง secret + ยืนยันครั้งแรก | ทุก role (ยังไม่มี TOTP) |
| POST | `/api/backoffice/auth/logout` | revoke session | ทุก role |
| GET/DELETE | `/api/backoffice/auth/sessions` | ดู/revoke session ตัวเอง | ทุก role |

### 5.2 Platform users
| Method | Path | ทำอะไร | Role |
|---|---|---|---|
| GET/POST | `/api/backoffice/users` | list / สร้าง (ส่งอีเมลเชิญ) | SUPER_ADMIN |
| PATCH | `/api/backoffice/users/[id]` | เปลี่ยน role / disable | SUPER_ADMIN |
| POST | `/api/backoffice/users/[id]/reset-2fa` | บังคับ setup TOTP ใหม่ | SUPER_ADMIN |

### 5.3 Tenants
| Method | Path | ทำอะไร | Role |
|---|---|---|---|
| GET | `/api/backoffice/tenants?q&plan&status&module&signedFrom&activeWithin&cursor` | list + filter | ทุก role (FINANCE เห็นเฉพาะคอลัมน์ billing-related) |
| GET | `/api/backoffice/tenants/[id]` | detail (overview/units/team/usage) — **audit read** | SUPER_ADMIN, SUPPORT |
| PATCH | `/api/backoffice/tenants/[id]/status` | `{action: APPROVE\|SUSPEND\|UNSUSPEND\|CLOSE, reason}` | SUPER_ADMIN (SUPPORT: SUSPEND ชั่วคราวได้เมื่อ abuse ชัด → แจ้ง SUPER_ADMIN) |
| PATCH | `/api/backoffice/tenants/[id]/modules` | `{enabledModules: [...]}` | SUPER_ADMIN, SUPPORT |
| PATCH | `/api/backoffice/tenants/[id]/limits` | `{limits: {...}}` | SUPER_ADMIN |
| GET/POST | `/api/backoffice/tenants/[id]/notes` | โน้ตภายใน | SUPER_ADMIN, SUPPORT |
| GET | `/api/backoffice/tenants/[id]/timeline` | เหตุการณ์สำคัญ | SUPER_ADMIN, SUPPORT |

### 5.4 Support Desk (ฝั่ง backoffice)
| Method | Path | ทำอะไร | Role |
|---|---|---|---|
| GET | `/api/backoffice/cases?status&priority&category&assignee&tenantId&slaRisk&q&cursor` | inbox | SUPER_ADMIN, SUPPORT (+FINANCE เฉพาะ category=BILLING) |
| POST | `/api/backoffice/cases` | เปิดเคสแทนร้าน `{tenantId, category, subject, body, priority}` | SUPER_ADMIN, SUPPORT |
| GET | `/api/backoffice/cases/[id]` | detail + thread (รวม internal) | ตาม inbox |
| POST | `/api/backoffice/cases/[id]/messages` | `{body, isInternal, attachmentIds[]}` → ถ้า public: notify ร้าน + เซ็ต firstResponseAt | ตาม inbox |
| PATCH | `/api/backoffice/cases/[id]` | `{status?, priority?, assigneeId?, category?}` | ตาม inbox |
| POST | `/api/backoffice/cases/[id]/escalate` | `{reason}` → priority+1 + แจ้ง SUPER_ADMIN | SUPPORT |
| GET/POST/PATCH/DELETE | `/api/backoffice/canned-responses[/id]` | CRUD (delete = archive) | SUPER_ADMIN, SUPPORT |
| GET | `/api/backoffice/reports/support?from&to` | รายงาน support | SUPER_ADMIN, SUPPORT |

### 5.5 Support Desk (ฝั่งร้าน — ใน `(app)`)
| Method | Path | ทำอะไร | ใคร |
|---|---|---|---|
| POST | `/api/help/cases` | เปิดเคส `{category, subject, body, context, attachmentIds[], claimUrgent?}` | ทุก Membership |
| GET | `/api/help/cases?status&cursor` | เคสของร้าน (STAFF เห็นเฉพาะของตัวเอง) | ทุก Membership |
| GET | `/api/help/cases/[caseNo]` | detail + thread (**server กรอง `isInternal=true` ออกเสมอ**) | ตามสิทธิ์ข้างบน |
| POST | `/api/help/cases/[caseNo]/messages` | ตอบกลับ + แนบไฟล์ (block เมื่อ CLOSED) | ตามสิทธิ์ |
| POST | `/api/help/cases/[caseNo]/resolve` | ร้านกด "ปัญหาแก้แล้ว" | ตามสิทธิ์ |
| POST | `/api/help/cases/[caseNo]/csat` | `{score 1..5, comment?}` one-time | OWNER/MANAGER หรือผู้เปิดเคส |
| POST | `/api/help/attachments` | upload (ก่อนสร้างเคส/ข้อความ) — ตรวจ mime/size | ทุก Membership |

### 5.6 Impersonation
| Method | Path | ทำอะไร | Role |
|---|---|---|---|
| POST | `/api/backoffice/impersonations` | `{tenantId, mode, reason, caseId?}` → READ_ONLY: ได้ token เลย · WRITE (ผู้ขอไม่ใช่ SUPER_ADMIN): สถานะ PENDING_APPROVAL | SUPPORT, SUPER_ADMIN |
| POST | `/api/backoffice/impersonations/[id]/approve\|deny` | อนุมัติ/ปฏิเสธคำขอ WRITE | SUPER_ADMIN |
| POST | `/api/backoffice/impersonations/[id]/end` | จบก่อนหมดเวลา | เจ้าของ session, SUPER_ADMIN |
| GET | `/api/backoffice/impersonations?tenantId&userId&cursor` | ประวัติ | SUPER_ADMIN, SUPPORT (ของตัวเอง) |
| POST | `/api/imp/exchange` | (ฝั่ง app) แลก token → imp context cookie อายุ = เวลาที่เหลือ | ผู้ถือ token |

### 5.7 Billing
| Method | Path | ทำอะไร | Role |
|---|---|---|---|
| GET | `/api/backoffice/invoices?status&tenantId&type&cursor` | list | FINANCE, SUPER_ADMIN |
| POST | `/api/backoffice/invoices` | ออก invoice มือ (กรณีพิเศษ) | FINANCE, SUPER_ADMIN |
| POST | `/api/backoffice/invoices/[id]/void` | void (ก่อนจ่าย) `{reason}` | FINANCE, SUPER_ADMIN |
| GET | `/api/backoffice/payments?status=SUBMITTED` | คิวสลิปรอตรวจ | FINANCE, SUPER_ADMIN |
| POST | `/api/backoffice/payments/[id]/verify` | ยืนยัน → invoice PAID → activate + ออกใบเสร็จ (atomic) | FINANCE, SUPER_ADMIN |
| POST | `/api/backoffice/payments/[id]/reject` | `{reason}` → แจ้งร้านแนบใหม่ | FINANCE, SUPER_ADMIN |
| GET/PATCH | `/api/backoffice/plans[/id]` | ดู/แก้ plan definition | ดู: ทุก role · แก้: SUPER_ADMIN |
| POST | `/api/billing/domain/order` | (ฝั่งร้าน) สั่งซื้อ/ต่ออายุ custom domain → ได้ invoice | OWNER |
| POST | `/api/billing/invoices/[no]/submit-slip` | (ฝั่งร้าน) แนบสลิป `{slipKey, transferAt, method}` | OWNER |
| POST | `/api/billing/invoices/[no]/request-tax-invoice` | (ฝั่งร้าน) ขอใบกำกับ `{taxInfo}` | OWNER |
| GET | `/api/billing/invoices` | (ฝั่งร้าน) ประวัติ + ดาวน์โหลดใบเสร็จ PDF | OWNER |

### 5.8 Domains
| Method | Path | ทำอะไร | Role |
|---|---|---|---|
| GET | `/api/backoffice/domains?status&cursor` | คิวคำขอ | SUPER_ADMIN, SUPPORT, FINANCE (read) |
| GET | `/api/backoffice/domains/[id]` | detail + lastCheckResult (troubleshooting) | SUPER_ADMIN, SUPPORT |
| POST | `/api/backoffice/domains/[id]/recheck` | ตรวจ DNS/SSL ทันที (rate limit 1/นาที) | SUPER_ADMIN, SUPPORT |
| POST | `/api/backoffice/domains/[id]/suspend\|reactivate\|remove` | จัดการสถานะ `{reason}` | SUPER_ADMIN |

### 5.9 Announcements
| Method | Path | ทำอะไร | Role |
|---|---|---|---|
| GET/POST/PATCH | `/api/backoffice/announcements[/id]` | CRUD + publish/archive | SUPER_ADMIN, SUPPORT (CRITICAL: SUPER_ADMIN เท่านั้น) |
| GET | `/api/backoffice/announcements/[id]/reads` | % อ่าน + ร้านที่ยังไม่อ่าน | SUPER_ADMIN, SUPPORT |
| GET | `/api/announcements` | (ฝั่งร้าน) ประกาศ active ที่ match audience | ทุก Membership |
| POST | `/api/announcements/[id]/read` | read receipt / รับทราบ | ทุก Membership |

### 5.10 Flags · Metrics · Compliance · Audit
| Method | Path | ทำอะไร | Role |
|---|---|---|---|
| GET/POST/PATCH | `/api/backoffice/flags[/id]` | CRUD flag + rolloutPercent | SUPER_ADMIN |
| PUT/DELETE | `/api/backoffice/flags/[id]/overrides/[tenantId]` | force ON/OFF รายร้าน | SUPER_ADMIN, SUPPORT (เฉพาะ override — แก้ percent ไม่ได้) |
| GET | `/api/backoffice/metrics/overview` | KPI การ์ด + กราฟ (จาก rollup) | ทุก role |
| GET | `/api/backoffice/metrics/health` | queue lag, error rate, cron status | SUPER_ADMIN, SUPPORT |
| POST | `/api/backoffice/tenants/[id]/export` | สั่ง export job | SUPER_ADMIN |
| POST | `/api/settings/export` | (ฝั่งร้าน) owner ขอ export เอง | OWNER |
| POST | `/api/settings/delete-request` | (ฝั่งร้าน) owner ยื่นลบร้าน (OTP ยืนยัน) | OWNER |
| GET | `/api/backoffice/deletion-requests` | คิวคำขอลบ | SUPER_ADMIN |
| POST | `/api/backoffice/deletion-requests/[id]/approve\|cancel` | อนุมัติ (→ soft delete) / ยกเลิก | SUPER_ADMIN |
| GET | `/api/backoffice/audit?user&tenantId&action&impId&from&to&cursor` | audit viewer (read-only) | SUPER_ADMIN (SUPPORT: เฉพาะ log ของตัวเอง) |

---

## 6. UI Screens

> ทั้งหมด B&W minimal, i18n TH/EN, responsive — backoffice ใช้บน desktop เป็นหลักแต่ mobile ต้องอ่าน/ตอบเคสได้ · ทุกหน้า: empty/loading/error state ครบ

### ฝั่ง backoffice (`app/(backoffice)/`)
| # | หน้า | เนื้อหาหลัก |
|---|---|---|
| BO-01 | Login | อีเมล → OTP → TOTP · หน้า setup TOTP ครั้งแรก (QR + recovery codes) |
| BO-02 | Dashboard | KPI การ์ด + กราฟ 90 วัน + system health strip + เคสหลุด SLA + คิวรอ (สลิป/โดเมน/ลบร้าน) |
| BO-03 | Tenants list | ตาราง + ค้นหา/filter chips + saved filters · แถว: ชื่อ, plan, status badge, โมดูล, active ล่าสุด, GMV 30 วัน |
| BO-04 | Tenant detail | แท็บ Overview / Units / Team / Usage / Modules & Limits / Billing / Timeline / Notes + action bar (ระงับ·ปิด·impersonate·เปิดเคสแทน) — dialog ยืนยัน + เหตุผลทุก action |
| BO-05 | Support inbox | 3 คอลัมน์: filter rail · รายการเคส (badge priority, นาฬิกา SLA countdown, เปลี่ยนสีเมื่อเหลือ <25%) · preview — มุมมอง "ของฉัน / ยังไม่มีเจ้าของ / ทั้งหมด / หลุด SLA" |
| BO-06 | Case detail | header (caseNo, ร้าน→ลิงก์ BO-04, category, priority editable, assignee, SLA clocks) · thread (public ขาว / internal เหลืองอ่อน / system เทา) · กล่องตอบ 2 โหมดสลับชัด + canned `/` + แนบไฟล์ · sidebar: ข้อมูลร้านย่อ, context จาก widget, เคสก่อนหน้าของร้าน, ปุ่ม impersonate (prefill caseId), diagnostic โดเมน (เมื่อ DOMAIN) |
| BO-07 | Canned responses | ตาราง CRUD + preview ตัวแปร |
| BO-08 | Support reports | กราฟเคส/วัน, response/resolve time (avg+P90), %SLA, หมวดยอดฮิต, CSAT ต่อ agent, backlog aging |
| BO-09 | Billing — invoices | ตาราง filter สถานะ/ประเภท + ใบใกล้ครบกำหนด/หมดอายุ |
| BO-10 | Payment verify | คิวสลิป: รูปสลิปเต็มจอ + ข้อมูล invoice เทียบข้าง + ปุ่มยืนยัน/ปฏิเสธ(เหตุผล) — keyboard-first (J/K เลื่อน, V ยืนยัน) |
| BO-11 | Plans | รายการ plan + แก้ default limits |
| BO-12 | Domains queue | ตารางคำขอ + status badge + อายุคงเหลือ + ปุ่ม re-check inline |
| BO-13 | Domain detail | expected vs actual DNS (diff highlight), SSL status, ประวัติเช็ค, diagnosis ภาษาคน + ปุ่ม copy, ปุ่ม re-check/suspend/remove |
| BO-14 | Announcements | ตาราง + สถานะ + % read |
| BO-15 | Announcement editor | ฟอร์ม + Markdown preview + audience builder (นับจำนวนร้านเป้าหมายสด) + schedule |
| BO-16 | Feature flags | ตาราง flag (key, %, default, จำนวน override) + หน้า flag: slider percent + ตาราง override รายร้าน |
| BO-17 | Audit log viewer | ตาราง filter หลายมิติ + expand เห็น before/after diff (JSON side-by-side) |
| BO-18 | Compliance | 2 แท็บ: Export jobs · Deletion requests (คิว → approve dialog เตือนผลกระทบ + นับถอยหลัง purge) |
| BO-19 | Settings & team | PlatformUser CRUD, business hours/SLA matrix, ข้อมูลบัญชีรับเงิน |
| BO-20 | Impersonation history | ตาราง session ทั้งหมด (ใคร/ร้าน/โหมด/เหตุผล/ระยะเวลา/request count) + คำขอ WRITE รออนุมัติ |

### ฝั่งร้าน (component ใน `(app)` — จุดเชื่อมที่ CORE ต้องเผื่อ)
| # | หน้า/Component | เนื้อหาหลัก |
|---|---|---|
| MB-01 | Widget "แจ้งปัญหา" | ปุ่มลอยมุมขวาล่างทุกหน้า `(app)` → panel ฟอร์มเปิดเคส + auto-context (แสดงให้เห็น ลบได้) · mobile: ปุ่มย้ายไปเมนู "ช่วยเหลือ" กันบังเนื้อหา |
| MB-02 | Help Center `/app/help` | รายการเคส + สถานะ badge + เปิดเคสใหม่ + ประกาศ/release notes |
| MB-03 | เคส `/app/help/cases/[caseNo]` | thread (ไม่มี internal note), ตอบ+แนบไฟล์, ปุ่ม "ปัญหาแก้แล้ว", แถบ CSAT หลังปิด |
| MB-04 | Announcement banner | แถบบนใน dashboard: CRITICAL แดงต้องกดรับทราบ / อื่นๆ ปิดได้ + กระดิ่ง badge |
| MB-05 | Impersonation banner | แถบแดง sticky (มาจาก imp context — CORE middleware inject) |
| MB-06 | Billing `/app/settings/billing` | invoice list + แนบสลิป + ดาวน์โหลดใบเสร็จ + ขอใบกำกับ · settings/domain: สถานะโดเมน + วันหมดอายุ + ปุ่มต่ออายุ |
| MB-07 | Suspended screen | เต็มจอเมื่อร้านถูกระงับ: เหตุผล + ปุ่มเปิดเคสอุทธรณ์ (route เดียวที่ยังเข้าได้) |

---

## 7. Business Flows

### 7.1 เปิดเคส → ปิดเคส (happy path + failure)
1. ร้านกด widget → กรอก → `POST /api/help/cases` → สร้าง case (OPEN, priority NORMAL หรือเสนอ URGENT ถ้าติ๊ก "ใช้งานไม่ได้เลย"), คำนวณ SLA due, notify ทีม (URGENT → Telegram ทันที)
2. Agent เปิด BO-05 → claim/assign → สถานะ IN_PROGRESS
3. Agent ตอบ public ครั้งแรก → เซ็ต `firstResponseAt` (นาฬิกา first response หยุด) → email ร้าน + thread ฝั่งร้านอัปเดต (SSE)
4. ต้องการข้อมูลเพิ่ม → เซ็ต WAITING_MERCHANT (`slaClockPausedAt` — resolve clock หยุด) → email ร้าน · ร้านตอบ → auto กลับ IN_PROGRESS + บวก `slaPausedTotalMin`
5. แก้เสร็จ → RESOLVED (+`resolvedAt`) → email + เชิญ CSAT
6. ร้านตอบกลับใน 7 วัน → reopen (IN_PROGRESS, `reopenCount+1`, SLA resolve คิดใหม่จากเวลา reopen) · ไม่ตอบ → cron auto-CLOSED วันที่ 7
- *Failure*: upload แนบไฟล์เกิน/mime ผิด → 422 inline error · ร้าน SUSPENDED เปิดเคสได้เฉพาะจาก MB-07 (category BILLING/USAGE) · agent ส่ง internal note สลับโหมดพลาด → มี confirm เมื่อ toggle จาก internal เป็น public ในข้อความเดียวกัน

### 7.2 SLA + Escalate
1. Cron ทุก 5 นาที: สแกนเคส active → เหลือ <25% ของ SLA ใด → แจ้ง assignee (ไม่มี assignee → แจ้งทีม) · เลย due → เซ็ต `slaBreachedAt` + แจ้ง SUPER_ADMIN + ติด badge "หลุด SLA"
2. เวลา WAITING_MERCHANT ไม่นับ (หัก `slaPausedTotalMin` ตอนคำนวณ)
3. SUPPORT escalate → priority+1 (สูงสุด URGENT), SLA คำนวณใหม่จาก priority ใหม่ (นับจากเวลา escalate), แจ้ง SUPER_ADMIN + system message ใน thread
- *Failure*: เปลี่ยน priority ลง → SLA คำนวณใหม่ + system message บอกเหตุผล (บังคับกรอก)

### 7.3 Impersonation
1. Agent กดจาก BO-04/BO-06 → dialog: โหมด + เหตุผล (≥10 ตัวอักษร) + caseId
2. READ_ONLY → สร้าง `ImpersonationSession` (ACTIVE, expiresAt=+30 นาที) + signed token → เปิดแท็บ `/app?imp={token}`
   · WRITE โดย SUPPORT → PENDING_APPROVAL → SUPER_ADMIN เห็นใน BO-20 → approve → agent ได้แจ้งเตือน + ปุ่มเริ่ม (token ออกตอนเริ่ม ไม่ใช่ตอน approve)
3. ฝั่ง app: `/api/imp/exchange` ตรวจ token (single-use) → เซ็ต imp cookie → ทุก request: middleware ตรวจอายุ + mode + blocklist, `requestCount++`, ลง `PlatformAuditLog`
4. เริ่ม session → email owner ทันที (`ownerNotifiedAt`) — ส่งไม่ผ่านก็ retry queue แต่ **ไม่ block session** (log ให้เห็นใน BO-20 ว่ายังไม่ notified)
5. จบ (กดจบ/หมด 30 นาที/bo_session ตาย) → ENDED/EXPIRED → email สรุปถึง owner + system note ในเคส (ถ้ามี caseId)
- *Failure*: mutation ใน READ_ONLY → 403 + banner สั่น + ลง audit ว่าพยายาม write · token ใช้ซ้ำ/หมดอายุ → 401 หน้าอธิบาย

### 7.4 Custom domain: ซื้อ → จ่าย → activate → ต่ออายุ → หมดอายุ
1. ร้านกรอกโดเมนที่ settings/domain → validate (รูปแบบ, ไม่ซ้ำ `@unique`, ไม่ใช่โดเมนต้องห้าม) → `DomainRequest` (REQUESTED) → กดสั่งซื้อ → `PlatformInvoice` (PENDING_PAYMENT, due 7 วัน, ผูก domainRequestId) → DomainRequest = PENDING_PAYMENT
2. ร้านโอน/สแกน PromptPay → แนบสลิป → `PlatformPayment` (SUBMITTED) → แจ้ง FINANCE
3. FINANCE ตรวจใน BO-10: ยอดตรง+สลิปจริง → verify → **transaction เดียว**: payment VERIFIED + invoice PAID (+`paidAt`, ออก receiptNo) + DomainRequest → AWAITING_DNS (+`expiresAt` = +1 ปีจาก activate จริง) → email ร้าน (ใบเสร็จ PDF + วิธีตั้ง DNS)
   · ปฏิเสธ → REJECTED + เหตุผล → ร้านแนบใหม่ (invoice ยัง PENDING_PAYMENT)
4. Cron ทุก 10 นาที + ปุ่ม re-check: ตรวจ DNS → ตรง → VERIFYING → VERIFIED → ออก SSL (Caddy on-demand/ACME) → SSL_ISSUING → ACTIVE (+`activatedAt`, `Tenant.customDomain` + `domainStatus` sync) → email แจ้งร้าน "โดเมนพร้อมใช้"
5. ต่ออายุ: cron รายวันเช็ค `expiresAt` — เหลือ 30 วัน → ออก invoice ต่ออายุ + email + banner MB-06 · เหลือ 7 วัน → เตือนซ้ำ (email + banner แดง)
6. หมดอายุ: เลย `expiresAt` → grace 7 วัน (แจ้งทุกวัน) → SUSPENDED (โดเมน 410 หน้า "หมดอายุ", `/s/{slug}` ยังใช้ได้) → จ่ายภายใน 90 วัน → reactivate ต่ออายุจากวันจ่าย · เกิน → REMOVED + ล้าง `Tenant.customDomain`
- *Failure*: invoice เลย due 7 วันไม่จ่าย → EXPIRED + DomainRequest กลับ REQUESTED (สั่งใหม่ได้) · จ่ายมาหลัง invoice EXPIRED → FINANCE ออก invoice ใหม่แล้ว verify กับใบใหม่ (ห้าม revive ใบ EXPIRED) · DNS ตรวจผ่านแล้ว SSL fail (CAA/rate limit ACME) → สถานะ FAILED + diagnosis + retry backoff

### 7.5 ระงับร้าน
1. SUPER_ADMIN กด "ระงับ" → dialog แสดงผลกระทบครบ + บังคับเหตุผล → confirm
2. Transaction: `Tenant.status=SUSPENDED` + `suspendedReason` → audit (before/after)
3. ผลทันที: session ทีมร้านทุกคน invalidate → เจอ MB-07 · tenant resolver ตอบ 410 หน้าแจ้งบน storefront + custom domain · cron/notify ของร้าน skip · rollup ยังเก็บสถิติ
4. Email owner: เหตุผล + ช่องทางอุทธรณ์ (เปิดเคสจาก MB-07)
5. ปลดระงับ → ทุกอย่างกลับปกติทันที + email แจ้ง
- *Failure*: ระงับร้านที่มี impersonation ค้าง → imp ยังใช้ได้ (banner บอกสถานะ) · ระงับซ้ำสถานะเดิม → 409

### 7.6 PDPA deletion
ตามหัวข้อ 3.10: ยื่น (OTP) → SUPER_ADMIN approve → PENDING_DELETE (ระงับ + เสนอ export) → 30 วันกู้คืนได้ → cron purge (idempotent, รายงานต่อตาราง, คงเอกสารบัญชี + audit anonymized) → PURGED + email ยืนยันไปอีเมล owner (เก็บอีเมลปลายทางไว้ใน request ก่อน purge)
- *Failure*: มี invoice ค้างชำระ → approve ไม่ได้จนกว่าจะ void/จ่าย · owner ยกเลิกวันที่ 29 → CANCELLED + tenant กลับ ACTIVE · purge ล้มกลางทาง → job รันใหม่ต่อจากตารางที่เหลือ (checkpoint ใน purgeReport)

### 7.7 Announcement publish
สร้าง DRAFT → preview → publish ทันที/schedule → cron เผยแพร่ตาม `publishAt` → ฝั่งร้าน `GET /api/announcements` (cache 5 นาที) กรอง audience ณ เวลาอ่าน → แสดง banner/กระดิ่ง → read receipt → BO เห็น % อ่าน · หมด `expiresAt` หายเอง → ARCHIVED

### 7.8 Feature flag rollout
สร้าง flag (0%) → force ON ร้านนำร่อง (override) → เพิ่ม percent 5→25→50→100 (ทุกครั้ง audit) → เจอปัญหา: force OFF ร้านที่พัง หรือดึง percent ลง (deterministic hash — ร้านที่หลุดกลุ่มจะปิดทันที) → เสถียรแล้ว: `defaultOn=true`, percent ล้างความหมาย → archive flag เมื่อโค้ดลบ flag แล้ว

---

## 8. Integration (จุดเชื่อมกับ CORE + โมดูลอื่น)

### สิ่งที่ CORE (Stage A) ต้องเผื่อไว้ให้โมดูลนี้ — **สำคัญ ระบุเป็น checklist**
1. **Slot ใน `(app)` layout shell** 3 จุด: (ก) mount point widget แจ้งปัญหา (MB-01) (ข) announcement banner + กระดิ่ง (MB-04) (ค) impersonation banner (MB-05 — render เมื่อ request context มี imp)
2. **Middleware `(app)` รองรับ imp context**: อ่าน imp cookie → inject `actor` พิเศษ + enforce READ_ONLY blocklist ก่อนถึง handler ทุกตัว (ต้องอยู่ชั้น middleware กลาง ไม่ใช่รายโมดูล)
3. **Tenant resolver เคารพ `Tenant.status`**: SUSPENDED/CLOSED/PENDING_DELETE → storefront 410 + app ไป MB-07
4. **`lib/core/flags`**: `flags.isEnabled(key, tenantId)` (อ่าน FeatureFlag/Override + cache) — โมดูลไหนก็เรียกได้
5. **Route `/app/help/*`, `/app/settings/billing`** จองไว้ใน `(app)`
6. **Prisma client แยก `platformPrisma`** (ไม่ผ่าน tenant-inject extension) ให้เฉพาะ `lib/modules/backoffice` ใช้

### Contract กลางที่โมดูลนี้เรียก
| Contract | ใช้ตอนไหน |
|---|---|
| `notify()` (2.5) | email ทุกฉบับ: ตอบเคส/เปลี่ยนสถานะ/CSAT, แจ้ง impersonation, ใบเสร็จ/เตือนต่ออายุ 30/7 วัน, ระงับร้าน, ประกาศ MAINTENANCE, export พร้อมดาวน์โหลด — template แยกไฟล์ i18n |
| Object storage (A2) | แนบไฟล์เคส, สลิป, ใบเสร็จ PDF, export ZIP — ทั้งหมด private + signed URL |
| SSE hub (A2) | thread เคสอัปเดตสด (ฝั่งร้าน + BO-06), badge inbox, ตัวนับ imp countdown |
| Cron runner (A2) | sla-scan (5 นาที) · domain-check (10 นาที) · billing-reminders (รายวัน) · case-autoclose (รายวัน) · stats-rollup (03:30 ICT) · purge-deletions (รายวัน) — ทุกตัว report heartbeat เข้า system health |
| `AuditLog` ร้าน vs `PlatformAuditLog` | action ของแพลตฟอร์มลง **PlatformAuditLog** เสมอ · action ที่กระทบข้อมูลในร้าน (imp WRITE) ลง AuditLog ของร้านด้วย (actor = "SHARK Support") ให้ร้านตรวจสอบฝั่งตัวเองได้ |

### ที่โมดูลอื่นต้องรู้
- **POS (14)**: stats-rollup อ่าน `PosSale` แบบ aggregate รายวัน (`crossUnit+crossTenant` flag เฉพาะ job นี้) — POS ไม่ต้องทำอะไรเพิ่ม แต่ index `[tenantId, createdAt]` ต้องมี
- **ทุกโมดูล**: อยากทำ gradual rollout → ครอบด้วย `flags.isEnabled()` · เจอ error ฝั่งร้าน → error boundary มีปุ่ม "แจ้งปัญหา" prefill context เปิด MB-01

---

## 9. Permissions (Platform roles × action)

| Action | SUPER_ADMIN | SUPPORT | FINANCE |
|---|---|---|---|
| ดู tenants list | ✅ | ✅ | ✅ (คอลัมน์ billing) |
| ดู tenant detail (units/team/usage) | ✅ | ✅ | ❌ (เห็นเฉพาะแท็บ Billing) |
| อนุมัติ/ปลดระงับ/ปิดร้าน | ✅ | ❌ (ระงับฉุกเฉินได้ → รายงาน SUPER_ADMIN) | ❌ |
| เปิด-ปิดโมดูลรายร้าน | ✅ | ✅ | ❌ |
| แก้ Tenant.limits | ✅ | ❌ | ❌ |
| Support inbox + ตอบเคส | ✅ | ✅ | เฉพาะ BILLING |
| แก้ priority / escalate / assign | ✅ | ✅ | เฉพาะ BILLING |
| Canned responses CRUD | ✅ | ✅ | ❌ |
| Impersonate READ_ONLY | ✅ | ✅ | ❌ |
| Impersonate WRITE | ✅ | ขอได้ (รออนุมัติ) | ❌ |
| อนุมัติ imp WRITE / ดูประวัติ imp ทั้งหมด | ✅ | ของตัวเอง | ❌ |
| ดู invoices / คิวสลิป | ✅ | 👁 read (ช่วยตอบเคส) | ✅ |
| Verify/Reject payment · ออก/void invoice | ✅ | ❌ | ✅ |
| แก้ PlanDefinition | ✅ | ❌ | ❌ |
| Domains: ดูคิว + re-check | ✅ | ✅ | 👁 read |
| Domains: suspend/remove | ✅ | ❌ | ❌ |
| Announcements CRUD | ✅ | ✅ (CRITICAL ❌) | ❌ |
| Feature flags: percent/default | ✅ | ❌ | ❌ |
| Feature flags: override รายร้าน | ✅ | ✅ | ❌ |
| Metrics overview | ✅ | ✅ | ✅ |
| System health | ✅ | ✅ | ❌ |
| Export ข้อมูลร้าน (ฝั่ง BO) | ✅ | ❌ | ❌ |
| อนุมัติ deletion request | ✅ | ❌ | ❌ |
| Audit viewer ทั้งหมด | ✅ | ของตัวเอง | ของตัวเอง |
| จัดการ PlatformUser + reset 2FA + SLA/settings | ✅ | ❌ | ❌ |

**ฝั่งร้าน (Membership เดิม)**: เปิดเคส = ทุก role · เห็นทุกเคสของร้าน = OWNER/MANAGER (STAFF เห็นของตัวเอง) · billing/export/delete-request/สั่งซื้อโดเมน = OWNER เท่านั้น · CSAT = OWNER/MANAGER หรือผู้เปิดเคส

---

## 10. Reports & Metrics

| รายงาน | เนื้อหา | ผู้ใช้ |
|---|---|---|
| Platform overview | ร้านใหม่/active/churn, GMV รวมรายวัน (aggregate), การใช้โมดูล | SUPER_ADMIN |
| Support daily | เคสเปิด/ปิดต่อวัน แยกหมวด, backlog aging (0-1/2-3/4-7/>7 วัน) | SUPPORT |
| SLA & response | first response + resolve time (avg, P90) ต่อ priority, %SLA hit, เคสหลุดพร้อมสาเหตุ | SUPER_ADMIN |
| หมวดปัญหายอดฮิต | Top category/ความถี่ + trend — feed เข้า roadmap/KB | SUPER_ADMIN |
| CSAT | คะแนนเฉลี่ยรวม/ต่อ agent, % response rate, คอมเมนต์ล่าสุด, เคสคะแนน ≤2 | SUPER_ADMIN |
| Billing | รายได้/เดือน, invoice ค้างชำระ, โดเมนใกล้หมดอายุ 30/60/90 วัน, ประวัติ verify ต่อ FINANCE user | FINANCE |
| System health | cron heartbeat, queue lag, error rate, storage — threshold แจ้ง Telegram | SUPER_ADMIN |
| Impersonation report | จำนวน session/เดือน ต่อ user, โหมด, ร้านที่ถูกเข้าบ่อย (ผิดปกติ = flag) | SUPER_ADMIN |

---

## 11. Edge Cases & Rules

1. **Session แยกขาดจริง**: อีเมลเดียวเป็นทั้ง PlatformUser และ merchant User ได้ — สอง cookie คนละโดเมน ไม่มี endpoint แลกข้ามฝั่ง · `/api/backoffice/*` เสิร์ฟเฉพาะ host backoffice.shark.in.th (ตรวจ Host header)
2. **internal note รั่ว = incident ร้ายแรงสุดของโมดูล**: กรอง `isInternal` ที่ **ชั้น serializer ฝั่ง server** (ไม่ใช่ UI ซ่อน) + integration test ยิง API ฝั่งร้านต้องไม่มี field นี้เด็ดขาด
3. **Impersonation token**: single-use exchange, ผูก bo_session (bo logout = imp ตาย), หมด 30 นาที hard — พยายาม write ตอน READ_ONLY ต้อง log ไว้เป็นหลักฐาน
4. **Audit append-only**: ไม่มี route update/delete · DB user ของ app ไม่มีสิทธิ์ UPDATE/DELETE บนตาราง `PlatformAuditLog` (enforce ระดับ Postgres GRANT) · เขียน audit fail → ยกเลิก mutation นั้นด้วย (อยู่ใน transaction เดียวกัน)
5. **GMV/rollup**: ห้าม endpoint ไหน query ตารางธุรกรรมข้ามร้านสด — rollup พังให้โชว์ "ข้อมูลถึงวันที่ X" ไม่ fallback ไป query สด · rollup idempotent (`@@unique([date, tenantId])` upsert)
6. **สลิปปลอม/ซ้ำ**: hash รูปสลิปเก็บไว้ เจอซ้ำข้าม payment → warning ให้ FINANCE · verify แล้ว invoice ต้องยัง PENDING_PAYMENT (กัน double-verify ด้วย conditional update)
7. **DNS flapping**: โดเมน ACTIVE ที่ตรวจแล้วหลุด 3 ครั้งติด → แจ้งร้าน + SUPPORT (ไม่ถอดอัตโนมัติ) · CAA/ACME rate limit → backoff แบบ exponential
8. **เคสจากร้านที่ถูกระงับ/ลบ**: SUSPENDED เปิดเคสได้เฉพาะช่องอุทธรณ์ · tenant PURGED → เคสเก่าคง caseNo แต่ anonymize เนื้อหาฝั่งร้าน
9. **SLA ข้ามเขตเวลา/วันหยุด**: คำนวณจาก business hours ใน PlatformSettings (v1 ไม่มีตารางวันหยุดนักขัตฤกษ์ — 🔜) · เปลี่ยน priority = คำนวณ due ใหม่ทั้งคู่ + system message
10. **Announcement segment**: ประเมิน ณ เวลาอ่าน — ร้านหลุด segment แล้ว banner หาย แต่ read receipt เดิมคงไว้ · CRITICAL ที่ยังไม่กดรับทราบไม่ถูก `expiresAt` ซ่อน (ค้างจนกดรับ)
11. **Flag hash ต้อง stable**: `hash(flagKey + tenantId)` — ห้ามใส่ seed เวลา/random · ลด percent = ร้านหลุดกลุ่มปิดทันที (พฤติกรรมตั้งใจ — เอกสารบอกทีมชัด)
12. **ลำดับข้อความเคสพร้อมกัน 2 agent**: ตอบชนกัน → thread เรียง createdAt, BO-06 โชว์ "X กำลังพิมพ์" (SSE presence) 🔜 v1: โชว์ข้อความใหม่สดพอ
13. **Export มี PII**: ลิงก์ signed 72 ชม. ส่งอีเมล owner เท่านั้น · ไฟล์ลบจาก storage หลัง 7 วัน · export ระหว่าง PENDING_DELETE ได้ (สิทธิ PDPA) — ระหว่าง SUSPENDED ให้ผ่านคำขอเคสเท่านั้น
14. **Purge idempotent + partial-failure**: ลบเป็นลำดับ FK-safe ต่อโมดูล, checkpoint ใน `purgeReport`, rerun ต่อได้ · เอกสารการเงิน (invoice/receipt) + audit ไม่ลบ (ภาระทางกฎหมาย > PDPA erasure — บันทึกเหตุผลใน DPA doc)
15. **นาฬิกา**: DB เก็บ UTC — SLA/รายงาน "ต่อวัน" ตีความที่ Asia/Bangkok เสมอ (rollup ตัดวันตาม ICT)
16. **SUPER_ADMIN คนเดียวหาย**: มี ≥1 SUPER_ADMIN ACTIVE เสมอ (constraint ชั้น service) · recovery หลุด 2FA ทุกช่อง = ทำมือระดับ DB พร้อม runbook (เขียนใน ops doc)

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Auth & isolation**
- [ ] merchant session cookie ใช้กับ `/api/backoffice/*` → 401 ทุก endpoint (ทดสอบอัตโนมัติ)
- [ ] bo_session ใช้กับ API ฝั่งร้าน → ไม่ได้สิทธิ์อะไร (ยกเว้น flow imp exchange)
- [ ] PlatformUser ใหม่ถูกบังคับ setup TOTP ก่อนเข้าหน้าใดๆ · login ครบ 2 factor เสมอ · TOTP ผิด 5 ครั้ง = ล็อก 15 นาที
- [ ] disable PlatformUser → session ที่ค้าง revoke ทันที

**Support Desk**
- [ ] เปิดเคสจาก widget: context ถูกแนบ + เคสโผล่ inbox ภายใน 2 วิ (SSE) + email ทีมเมื่อ URGENT
- [ ] API ฝั่งร้านไม่มี `isInternal` message หลุดเลย (integration test dump JSON ทั้ง response)
- [ ] SLA: first response หยุดเมื่อตอบ public แรก · WAITING_MERCHANT หยุด resolve clock · หลุด SLA มี badge+แจ้งเตือน
- [ ] ร้านตอบเคส RESOLVED ภายใน 7 วัน → reopen อัตโนมัติ · เกิน → auto-CLOSED (cron test)
- [ ] CSAT ให้ได้ครั้งเดียว ลิงก์หมดอายุ 14 วัน คะแนน ≤2 แจ้ง SUPER_ADMIN
- [ ] STAFF ร้านเห็นเฉพาะเคสตัวเอง · OWNER เห็นทุกเคสของร้าน · ไม่มีทางเห็นเคสร้านอื่น (2-tenant test)

**Impersonation**
- [ ] READ_ONLY: ทุก mutation โดน block + ถูก log · WRITE โดย SUPPORT ต้องผ่าน approve ก่อน token ออก
- [ ] หมด 30 นาที = ใช้ต่อไม่ได้ทันที · banner แดงแสดงทุกหน้า + countdown
- [ ] Email owner ออกตอนเริ่ม (และสรุปตอนจบ) — mock mail test
- [ ] ทุก request ระหว่าง imp มีแถวใน PlatformAuditLog (นับ requestCount ตรงกับ log)

**Billing & Domain**
- [ ] Flow ครบ: สั่งซื้อ → invoice → แนบสลิป → FINANCE verify → PAID + ใบเสร็จเลขรัน + DomainRequest เดินต่อ — ทั้งหมด atomic (kill กลาง transaction แล้วไม่มี state ครึ่งๆ)
- [ ] double-verify payment เดียวกัน → ครั้งที่สอง fail (conditional update test)
- [ ] เตือนต่ออายุ 30/7 วันออกจริง (cron test time-travel) · หมด grace → SUSPENDED · จ่ายใน 90 วัน → reactivate
- [ ] ใบเสร็จ/invoice PAID แก้ไม่ได้ — แก้ = void + ออกใหม่
- [ ] Re-check โดเมน rate limit 1/นาที · troubleshooting แสดง diagnosis ตรงกับ DNS จริง (fixture test)

**Tenant ops & compliance**
- [ ] ระงับร้าน → login ร้านเจอ MB-07 + storefront/custom domain 410 + ข้อมูลครบ · ปลดระงับกลับปกติ
- [ ] ปิด/เปิดโมดูล มีผลทันทีและไม่ลบข้อมูล
- [ ] Deletion: SUPER_ADMIN เท่านั้น approve · soft delete 30 วันกู้ได้ · purge ลบครบตามรายงาน + คง invoice/audit · rerun purge ไม่พัง (idempotent)
- [ ] Export ZIP ครบทุกตารางของ tenant + ลิงก์หมดอายุ 72 ชม. + ส่งเฉพาะ owner

**Announcement & Flags & Metrics**
- [ ] ประกาศ segment แสดงเฉพาะร้านที่ match · CRITICAL ต้องกดรับทราบ · read receipt นับถูก
- [ ] Flag: override > percent > default · hash deterministic (ร้านเดิมผลเดิมทุก request) · แก้ flag ลง audit
- [ ] หน้า metrics ไม่มี query ตารางธุรกรรมร้านสด (ตรวจ code review + query log) · rollup ตัดวันตาม ICT

**ทั่วไป**
- [ ] ทุก mutation ในโมดูลนี้มีแถว PlatformAuditLog (สุ่มตรวจ 100%) · audit เขียน fail = mutation rollback
- [ ] DB grant: app role ไม่มี UPDATE/DELETE บน PlatformAuditLog
- [ ] i18n TH/EN ครบทุกหน้า BO + MB · email template 2 ภาษา · B&W minimal + responsive + empty/loading/error state
- [ ] `pnpm check backoffice` ผ่าน (typecheck + lint + test)
