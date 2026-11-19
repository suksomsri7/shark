# แผนงาน · เลขา AI — ปฏิทิน + เตือนความจำ (CAL)

> ร่าง 14 พ.ย. 2569 · สำหรับ session ที่ทำแอปเลขาต่อ (ทรี `/root/projects/shark-sec-ui` · branch `wip/sec-ui-1114` หรือ branch ใหม่ที่ตัดจากมัน)
> แบบที่อนุมัติ: `/root/mockups/secretary-calendar/` — `cal-1.png` (จอ 1–4) · `cal-2.png` (จอ 5–8) · `cal-3.png` (จอ 9–10) · ตัวสร้างภาพ `gen.py` · สรุปแบบ `DESIGN.md`
> แอป native (Expo/RN) **ไม่ใช่ WebView** · ข้อความทั้งหมดในแอปเป็นภาษาไทย

---

## 0. มติเจ้าของ (ยึดเหนือทุกข้อในแผนนี้)

| # | มติ |
|---|---|
| M1 | ไอคอนปฏิทินอยู่ **แถบบน** ถัดจาก "ทีม" · badge แดง = เรื่องวันนี้ที่ยังไม่เสร็จ |
| M2 | สรุปเช้า: **ผู้ใช้ตั้งเวลาเอง + เปิด/ปิดได้** · ค่าเริ่ม = เปิด 08:00 · (สรุปเย็นของพรุ่งนี้ ค่าเริ่ม = ปิด 19:00) |
| M3 | **ปฏิทินเป็นของตัวเอง ไม่มีใครสั่งใครได้** — ไม่มีช่อง "แจ้งใคร" · ไม่มี API/เครื่องมือที่รับ userId ของคนอื่น · ขอเตือนคนอื่น → เลขาปฏิเสธสุภาพ + เสนอสร้างการ์ดบอร์ดงานแทน (เครื่องมือ kanban เดิม) |
| M4 | ซิงก์ **Google Calendar + ปฏิทิน iPhone ทำ** · ส่วนตัว 100% ร้าน/เพื่อนร่วมงานมองไม่เห็น |

ความหมายของ M3 ที่ใช้ในแผน: "ของตัวเอง" = **สร้าง/แก้/เตือน ได้เฉพาะของตัวเอง** · ส่วนรายการที่มาจากระบบของร้าน (นัดลูกค้า ใบแจ้งหนี้ ฯลฯ) แสดงตามสิทธิ์ที่ผู้ใช้มีอยู่แล้วในระบบนั้น (อ่านอย่างเดียว) — แบบนี้ตรงกับภาพจอ 3 ที่เจ้าของเห็นนัดของครูนิว

---

## 1. ข้อเท็จจริงจากโค้ด (สำรวจ 14 พ.ย. บนทรี shark-sec-ui `8acda1fd3`)

| เรื่อง | มีแล้ว | ใช้อย่างไร |
|---|---|---|
| ตัวรันรายนาที | `src/lib/platform/minute-jobs.ts` `registerMinuteJob({name, everyMinutes, run, ownBudgetMs?})` · ยิงจาก crontab VPS `scripts/crm-cron.mts minute` (ทุกนาที · flock) + hook ใน `POST /api/cron/outbox` · ตัวอย่างลงทะเบียน: `ai/secretary/worker.ts:447`, `modules/chat/sla-job.ts` | เตือนความจำ + สรุปเช้า/เย็น **ขี่รางนี้** · ไม่เพิ่ม cron ใน `vercel.json` (กติกา C16 ของ CRM) · R-K8 เดิม ("ไม่มีรายนาที") ล้าสมัยแล้ว ให้ยืนยันใน CAL0.1 |
| Push | `src/lib/core/push.ts` (Expo push · นับสำเร็จเฉพาะ `status:"ok"` · มี `badge`) · `PushDevice(userId, tenantId?, expoToken, platform)` ใน `prisma/schema/mobile.prisma` · แอปมี `expo-notifications ~57.0.8` | ส่งเตือน/สรุปผ่าน `push.ts` · ต้องเพิ่ม **categoryId** (ปุ่มลัด) ใน payload |
| สรุปข้อมูลกิจการ | `src/lib/ai/secretary/digest.ts` (คำนวณสด · ไม่เรียกโมเดล · ตัดตามสิทธิ์ผู้ดู · try/catch แยกส่วน) — มีลูกหนี้ค้าง/เกินกำหนด · นัดพรุ่งนี้ · คำขอค้าง | ตัวรวม agenda เขียน **แบบเดียวกัน** และใช้ตัวกรองสิทธิ์ชุดเดียวกัน (`evaluate`, `contactWhere`, `viewerScope`) |
| งานประจำเลขา | `AiScheduledTask` (รายวัน/สัปดาห์/เดือน · ระดับชั่วโมง) + `ai/secretary/scheduled.ts` | **ไม่ใช้** ทำเตือนความจำ (คนละความหมาย: งานประจำ = สั่งเลขาทำงาน · เตือน = แจ้งผู้ใช้) |
| เข้ารหัสความลับ | `src/lib/core/integrations/secret-box.ts` | เก็บ refresh token ของ Google |
| เตือนเดิมของระบบอื่น | `modules/kanban/reminders.ts#sweepDueSoonReminders` (hourly) · minute job `crm.activity.remind` · `crm.activities.overdue` | **ห้ามเตือนซ้ำ** — ปฏิทินไม่ push รายการของระบบอื่นรายตัว (push เฉพาะ "เตือนฉัน"/"นัดส่วนตัว" + สรุปเช้า/เย็น) |
| ฟิลด์วันที่ในระบบ | `Appointment.startAt/endAt` (booking) · `CrmActivity.dueAt/startAt/endAt/remindAt` · การ์ดบอร์ดงาน `dueAt` (kanban.prisma ~l.139) · `AccountDocument.dueDate` (account.prisma l.137) · `HrPayRun?.payDate` (payroll.prisma l.77) · หอพัก `dueDate` (dorm.prisma l.167/205) · ตั๋ว/ทริป `startAt` (ticket.prisma) | ชื่อโมเดลจริงทุกตัว **ยืนยันใน CAL0.1** ก่อนเขียน adapter |
| แถบบนแอป | `apps/mobile/src/components/secretary/SecTopBar.tsx` (199 บรรทัด · zone เลขา/ลูกค้า/ทีม/systems) | เพิ่มปุ่ม zone `calendar` |
| ⚠️ ความเสี่ยงเดิม | push.ts บันทึกว่าเคยเจอ `InvalidCredentials — APNs` ของ `th.in.shark.ai` (29 ส.ค.) | CAL3.2 ต้องพิสูจน์ push ถึงเครื่องจริง (positive control) ก่อนบอกเสร็จ |

---

## 2. สถาปัตยกรรม (4 ข้อหลัก)

1. **ไม่มีระบบปฏิทินแยก** — โมดูลใหม่ `src/lib/modules/calendar/` มีแค่ (ก) ของส่วนตัว: เตือนฉัน + นัดส่วนตัว (ข) ตัวรวม agenda อ่านอย่างเดียวจากระบบอื่น (ค) ตัวซิงก์ Google
2. **ทุกแถวผูก `userId` เจ้าของ** · ทุก query กรอง `userId = actor.userId` · ไม่มีพารามิเตอร์ userId ใน API/เครื่องมือ (M3 บังคับด้วยโครงสร้าง ไม่ใช่ด้วยเงื่อนไข)
3. **Google ซิงก์ฝั่งเซิร์ฟเวอร์** (OAuth · syncToken · สองทาง) · **iPhone/Android ฝั่งเครื่องเท่านั้น** (`expo-calendar` · ไม่ส่งนัดในเครื่องขึ้นเซิร์ฟเวอร์) ⇒ สรุปเช้าแบบ push รวมนัด Google ได้ แต่นัดในเครื่องรวมได้เฉพาะตอนเปิดแอป (การ์ดวันนี้/จอปฏิทิน)
4. **เวลาเก็บ UTC · คำนวณ/แสดงตามเวลาไทย** (ใช้ `bkkAt/bkkParts` จาก `core/quiet-hours`) · ทำซ้ำคำนวณ `nextFireAt` ด้วยฟังก์ชันบริสุทธิ์

---

## 3. ใบงาน (29 ใบ · ≈ 117 ชม.เลน)

### CAL0 — เตรียม (3 ใบ · ≈ 8 ชม.)

| ใบ | งาน | เกณฑ์รับ | ชม. |
|---|---|---|---|
| **CAL0.1** | **สำรวจ (อ่านอย่างเดียว)** → `ledger/cal-briefs/cal-brief-RESOLUTIONS.md`: ชื่อโมเดล/ฟิลด์/ตัวกรองสิทธิ์จริงของทุกแหล่งในตาราง §1 · ใคร "เป็นเจ้าของ" รายการในแต่ละแหล่ง (พนักงานผู้รับนัด · ผู้รับผิดชอบการ์ด · owner ของกิจกรรม CRM) · ยืนยันราง minute-jobs ยังเดินบน prod (log `/var/log/shark-crm-cron.log`) · ตรวจ APNs credential ของแอปเลขาปัจจุบัน · วิธี deep link จากแอปเข้าแต่ละระบบ (zone systems WebView รับ path?) · ตารางกำหนดยื่นภาษีที่ใช้ (ใช้ skill `shark-thai-law` · ภ.พ.30 · ภ.ง.ด.1/3/53 · ปกส. · ยื่นกระดาษ vs e-filing) | ทุกชื่อในใบ CAL1.x มีจริง · ข้อขัดกับแผน = คำตัดสินพร้อมเหตุผล | 3 |
| **CAL0.2** | **สัญญา** `docs/modules/32-secretary-calendar.md`: โมเดลข้อมูล · API ทุกเส้น (พารามิเตอร์/ผล/ข้อผิดพลาด) · ชนิด `AgendaItem` · กติกาเตือน/เลื่อน/ย้ำ/ทำซ้ำ · payload push + category · seed `scripts/seed-calendar-qc.mts` (2 กิจการ · เจ้าของ+พนักงาน 2 · รายการทุกแหล่ง · idempotent) | ผู้ตรวจเทียบกับ 10 จอแล้วไม่มีช่องว่าง · seed รันซ้ำไม่เพิ่มแถว | 3 |
| **CAL0.3** | **ภาพโหมดมืด** 10 จอ ด้วย `gen.py` (เพิ่ม CSS มืดแบบชุด ai-hire `DARK`) → `cal-dark-{1,2,3}.png` ส่งเจ้าของ ✅ ก่อนเริ่ม CAL2 | เจ้าของ ✅ | 2 |

### CAL1 — เซิร์ฟเวอร์ (9 ใบ · ≈ 49 ชม.)

| ใบ | งาน | เกณฑ์รับ / ข้อสอบ | ชม. |
|---|---|---|---|
| **CAL1.1** 🎯 | migration `calendar_a` = `prisma/schema/calendar.prisma`: **`CalItem`** (id, userId, tenantId, kind `REMINDER\|EVENT`, title ≤200, note?, startAt, endAt?, allDay, repeat `NONE\|DAILY\|WEEKLY\|MONTHLY`, repeatDays Int[], leadMinutes 0, linkType?/linkId? (CRM contact/deal · ใบแจ้งหนี้ · การ์ด), status `OPEN\|DONE\|CANCELLED`, doneAt?, nextFireAt? @index, lastFiredAt?, nagAt?, source `APP\|CHAT\|GOOGLE`, externalId?, leaseUntil?) · **`CalPref`** (userId+tenantId @unique · morningOn true · morningMinute 480 · eveningOn false · eveningMinute 1140 · sources Json · lastMorningDay?/lastEveningDay? "YYYY-MM-DD") · **`CalLink`** (userId @unique per provider · provider `GOOGLE` · email · tokenBox (secret-box) · calendars Json [{id,name,color,import}] · exportCalendarId · exportKinds String[] · syncToken? · lastSyncAt? · status) · **`CalExternalEvent`** (linkId, externalId @unique per link, calendarId, title, startAt, endAt?, allDay, etag, deletedAt?) · FK + index ตาม query CAL1.3/1.4 | migrate บนฐาน QC ผ่าน · `prisma generate` ไม่ทำให้ typecheck ทรีอื่นแดง (⚠️ node_modules ร่วม) | 4 |
| **CAL1.2** 🎯 | `modules/calendar/items.ts`: `createItem/updateItem/cancelItem/markDone/snooze(id, until)` — รับ `actor` อย่างเดียว ไม่มี userId · `nextFire(item, now)` บริสุทธิ์ (ทำซ้ำ · leadMinutes · ข้ามเวลาที่ผ่านแล้ว · เวลาไทย · สิ้นเดือน 29–31) · ตรวจ: เวลาที่ผ่านแล้ว = ปฏิเสธ (ยกเว้นนัดย้อนหลังแบบ EVENT) · ความยาว · linkId ต้องอ่านได้ด้วยสิทธิ์ผู้ใช้ | ข้อสอบบริสุทธิ์ `nextFire` ครอบคลุม 100% · ผู้ใช้ B แก้ของ A = 404 | 5 |
| **CAL1.3** 🎯 | **ตัวรวม** `modules/calendar/agenda.ts`: `agendaFor(viewer, tenantId, {from,to})` → `AgendaItem{ id, source, title, sub, startAt, endAt?, allDay, deepLink, checkable, done }` + `monthDots(viewer, tenantId, month)` + `todayOpenCount` (badge) · adapter ต่อแหล่ง (try/catch แยก · ล้ม = ส่วนนั้นว่าง + logOps WARN แบบ digest.ts): booking (นัดที่ฉันรับ ∪ นัดทั้งสาขาที่ฉันมีสิทธิ์จัดการ) · บัญชี (ใบแจ้งหนี้ครบกำหนด/เกินกำหนด · กำหนดยื่นภาษี เฉพาะผู้มีสิทธิ์บัญชี) · บอร์ดงาน (การ์ดที่ฉันรับผิดชอบ · ติ๊กเสร็จ = ย้ายตามกติกาบอร์ด) · CRM (กิจกรรมที่ฉันเป็นเจ้าของ) · HR (วันจ่ายเงินเดือน/ปกส. ผู้มีสิทธิ์ HR · ใบลาของฉัน) · หอพัก (บิลครบกำหนด) · ทริป (รอบออกเรือ — adapter ปิดไว้จนระบบ TRIPS ขึ้น main) · ของตัวเอง (`CalItem`) · Google (`CalExternalEvent`) · เคารพ `CalPref.sources` และระดับเลขาของระบบ (OFF = ไม่แสดง) | qc: ผู้ใช้ไม่มีสิทธิ์บัญชีไม่เห็นใบแจ้งหนี้ · พนักงานเห็นแค่นัดตัวเอง · ระบบที่ร้านไม่เปิด = ไม่มีแถว · ล้ม 1 แหล่ง ส่วนอื่นยังมา | 8 |
| **CAL1.4** 🎯 | **minute job** `calendar.fire` (`registerMinuteJob` everyMinutes 1 · งบของตัวเอง): จอง `CalItem` ที่ `nextFireAt ≤ now` ด้วย lease (`updateMany` เงื่อนไข lease) → push ผ่าน `core/push.ts` (title/body/data `{type:"cal", itemId, deepLink}` · `categoryId:"SEC_CAL"`) → ทำซ้ำ = คำนวณรอบถัดไป · ไม่ทำซ้ำ = ตั้ง `nagAt = now+30m` · ถึง `nagAt` และยัง OPEN = ย้ำ 1 ครั้งแล้วล้าง · **ไม่ push รายการของระบบอื่น** (กันซ้ำกับ kanban/CRM) · quiet hours ใช้กติกาเดิมของ push ถ้ามี | qc นาฬิกาปลอม: 2 รอบซ้อนส่งครั้งเดียว · เลื่อน/เสร็จระหว่างรอ = ไม่ส่ง · ทำซ้ำรายสัปดาห์ข้ามเดือนถูก | 6 |
| **CAL1.5** | **สรุปเช้า/เย็น** job `calendar.brief` (everyMinutes 1): ผู้ใช้ที่ `morningOn` และ `morningMinute` ถึงแล้ววันนี้ (เวลาไทย) และ `lastMorningDay ≠ วันนี้` → สร้างข้อความ **ไม่เรียกโมเดล** จาก `agendaFor` (นับ + 3 รายการแรก) → push แยกต่อกิจการ (จอ 1) · เย็น = ของพรุ่งนี้ · วันว่าง = ไม่ส่ง (ไม่รบกวน) | qc: ตั้ง 07:15 ได้รับ 07:15 ครั้งเดียว · ปิดแล้วไม่ได้รับ · 2 กิจการ = 2 ข้อความ | 4 |
| **CAL1.6** | **API แอป** `src/app/api/mobile/secretary/calendar/`: `GET agenda?from&to` · `GET month?ym` · `GET/POST items` · `PATCH/DELETE items/[id]` · `POST items/[id]/done` · `POST items/[id]/snooze {until}` · `GET/PUT prefs` · `GET badge` (หรือรวมในตัวนับเดิม S1.23) · auth แบบเส้นเลขาเดิม · rate limit | ข้อสอบเส้นทาง: ไม่ล็อกอิน 401 · ของคนอื่น 404 · ค่าผิด 400 พร้อมเหตุผลไทย | 4 |
| **CAL1.7** 🎯 | **เครื่องมือเลขา** (`ai/tools*.ts` + `tool-access.ts`): `calendar_add` (title, whenISO, repeat?, link?) · `calendar_update` · `calendar_cancel` · `calendar_list` · `calendar_agenda` (อ่าน) — **ไม่มีพารามิเตอร์ผู้รับ** · เป็นข้อมูลส่วนตัว ⇒ ไม่ผ่านด่านอนุมัติของร้าน · เวลา: โมเดลแปลงเป็น ISO+เวลาไทย เซิร์ฟเวอร์ตรวจซ้ำ (ผ่านแล้ว/กำกวม → ถามกลับ) · ผลลัพธ์แสดงเป็นการ์ด `reminder_card` ในห้อง (จอ 5) · persona: ขอเตือนคนอื่น → ตอบตาม M3 + เสนอ `kanban` สร้างการ์ด | eval ≥ 20 ประโยคไทย (พรุ่งนี้บ่ายสาม · ทุกวันจันทร์ 9 โมง · อีกครึ่งชั่วโมง · วันที่ 5 ทุกเดือน · "เตือนครูนิว…" ต้องไม่สร้าง) ผ่าน ≥ 95% | 5 |
| **CAL1.8** 🎯 | **Google** `modules/calendar/google.ts`: แลก code (PKCE จากแอป) → token เก็บ `secret-box` · scope น้อยสุด (`calendar.events` + `calendar.calendarlist.readonly`) · ดึงรายการปฏิทิน · ซิงก์เข้า `CalExternalEvent` ด้วย syncToken (job `calendar.google` ทุก 15 นาที + ตอนเปิดจอ) · ส่งออก `CalItem` EVENT (และตามตัวเลือก: เตือนฉัน · นัดลูกค้าที่ฉันรับ) ไปปฏิทินที่เลือก เก็บ externalId · ลบ/แก้สองทาง · ยกเลิกเชื่อม = revoke + ลบแคช · token ตาย = status `NEEDS_RECONNECT` + แจ้งในจอ 8 · **ร่างเอกสารยื่นตรวจ Google** (นโยบายความเป็นส่วนตัว · วิดีโอสาธิต · เหตุผล scope) ให้เจ้าของยื่น | qc ด้วย transport ปลอม (ฉีดได้แบบ push.ts) · ทดสอบจริงกับบัญชีทดสอบ (โหมด Testing ≤100 ผู้ใช้) | 10 |
| **CAL1.9** | **นัดชน** `conflicts(items)` บริสุทธิ์ (รวมเวลาเดินทางตั้งต้น 0 · ทับซ้อน ≥ 1 นาที) → `AgendaItem.conflictWith` + ข้อเสนอเลขาบนจอ 10 ("เตือนออกตอน …") สร้าง `CalItem` เมื่อกด | ข้อสอบบริสุทธิ์ 100% | 3 |

### CAL2 — แอป native (13 ใบ · ≈ 50 ชม. · ทุกจอ: ภาพคู่ MOCKUP|RENDER สว่าง+มืด 390×844 ก่อน merge)

| ใบ | จอ | งาน | ชม. |
|---|---|---|---|
| **CAL2.1** | 2 | `SecTopBar` เพิ่มปุ่ม zone `calendar` ถัดจาก "ทีม" + badge แดง (`todayOpenCount`) · route `(app)/secretary/calendar/{index,settings,google}` · `src/api/calendar.ts` (ชนิดจาก CAL0.2 · fixture ก่อน API จริง) | 3 |
| **CAL2.2** | 3 | มุมมองวัน: Segment วัน/เดือน/เตือนฉัน · แถบสัปดาห์ (จุด = มีรายการ) · กลุ่ม "ทั้งวัน"/"ตามเวลา" · `AgendaRow` (แถบสีระบบ = สีเดียวกับแผ่นเปิดระบบ · ป้ายระบบ · วงกลมติ๊ก) · แตะ = deep link เข้าระบบ · ดึงลงรีเฟรช · ว่าง = ข้อความว่าง | 6 |
| **CAL2.3** | 4 | มุมมองเดือน: ตาราง 7 คอลัมน์ (เริ่มอาทิตย์) · จุดสีต่อระบบ ≤3 · แตะวัน = รายการด้านล่าง · ‹ › เปลี่ยนเดือน · ปี พ.ศ. | 4 |
| **CAL2.4** | 3 | แท็บ "เตือนฉัน": วันนี้/ต่อไป/เสร็จแล้ว · ปัดซ้าย = ลบ · ปัดขวา = เสร็จ (คอมโพเนนต์ปัดเดียวกับแชทลูกค้าเลน a) | 3 |
| **CAL2.5** | 2 | การ์ด "วันนี้" บนสุดหน้าเลขา (นับ + 4 รายการแรก + "ดูทั้งหมดในปฏิทิน ›") · หายเมื่อไม่มีรายการ/เกินเที่ยงคืน · รวมนัดในเครื่อง (CAL2.11) | 3 |
| **CAL2.6** | 6 | ปุ่ม + : เพิ่มตัวเลือก "เพิ่มเตือน/นัด" → `AddCalSheet` (Segment เตือนความจำ/นัดหมาย · เรื่อง · ชิปเวลาด่วน อีก 1 ชม./เย็นนี้ 18:00/พรุ่งนี้ 09:00/เลือกเอง · ทำซ้ำ · ผูกกับ (ค้นลูกค้า/ดีล/ใบแจ้งหนี้/การ์ด) · เตือนล่วงหน้า) — **ไม่มี "แจ้งใคร"** | 5 |
| **CAL2.7** | 5 | `ReminderCard` ในห้องแชทเลขา (แก้ไข → AddCalSheet โหมดแก้ · ยกเลิก) · ปุ่มยืนยันเตือนประจำ | 3 |
| **CAL2.8** | 7 | แจ้งเตือนมีปุ่มลัด: `setNotificationCategoryAsync("SEC_CAL", [เสร็จแล้ว, เลื่อน 1 ชั่วโมง, เลื่อนไปพรุ่งนี้ 09:00, โทรเลย*])` (*เฉพาะเมื่อผูกลูกค้าที่มีเบอร์) · ตัวรับคำตอบ (ทำงานแม้แอปปิด) → API done/snooze · แตะ = เปิดปฏิทินวันนั้น · ⚠️ **ต้อง EAS build ใหม่ — รอเจ้าของสั่ง** | 4 |
| **CAL2.9** | 8 | ตั้งค่าปฏิทิน: สรุปเช้า (สวิตช์ + เวลา) · สรุปเย็น (สวิตช์ + เวลา) · สวิตช์ต่อระบบ (แสดงเฉพาะระบบที่มีสิทธิ์) · แถว Google/iPhone พร้อมสถานะ · เข้าจาก ⚙ ในจอปฏิทิน | 4 |
| **CAL2.10** | 9 | เชื่อม Google: `expo-auth-session` (PKCE) → ส่ง code ให้ CAL1.8 · เลือกปฏิทินที่ดึงเข้า · ตัวเลือกส่งออก + ปฏิทินปลายทาง · กล่องความเป็นส่วนตัว · ยกเลิกเชื่อม (ยืนยัน) · สถานะเชื่อมใหม่ | 4 |
| **CAL2.11** | 9–10 | ปฏิทินในเครื่อง (`expo-calendar` · iOS+Android): ขออนุญาตครั้งแรก · เลือกปฏิทิน · รวมเข้ามุมมองวัน/เดือน/การ์ดวันนี้ (ฝั่งเครื่องเท่านั้น ไม่ส่งขึ้นเซิร์ฟเวอร์) · ส่งออกนัดส่วนตัวไปปฏิทินในเครื่อง (เก็บแผนที่ id ในเครื่อง) · ⚠️ เพิ่มแพ็กเกจ + สิทธิ์ใน `app.json` (`NSCalendarsFullAccessUsageDescription` ภาษาไทย) = **ต้อง build ใหม่** | 6 |
| **CAL2.12** | 10 | การ์ดนัดชน (ข้อเสนอเลขา + ปุ่ม เตือนเลย/ไม่ต้อง) ใต้รายการวัน · รวมนัดในเครื่องด้วย | 2 |
| **CAL2.13** | ทุกจอ | ปิดโหมดมืด + ภาพคู่ครบ 10 จอ × 2 ธีม (`scripts/shoot-sec.mjs` + `parity-sec.sh`) · testID ทุกปุ่ม + ทะเบียน `sec-ui-inventory.json` | 3 |

### CAL3 — ปิดงาน (4 ใบ · ≈ 10 ชม.)

| ใบ | งาน | เกณฑ์รับ | ชม. |
|---|---|---|---|
| **CAL3.1** | ด่านถดถอย: ชุด qc เลขาเดิมทั้งหมด + `qc-cal-*` ใหม่ · typecheck server+mobile **ผ่าน `scripts/iso.sh` (ISO_MEM=14000M)** | ถดถอย 0 | 3 |
| **CAL3.2** | **เส้นทางจริงบนฐาน QC + เครื่องจริง**: พิมพ์ "เตือนอีก 2 นาที…" ในแชท → การ์ด → minute job ยิง → แจ้งเตือนถึงเครื่องจริง (positive control: ส่ง push ทดสอบตรงก่อน) → กดเลื่อน 1 ชม. จากหน้าล็อก → ฐานเปลี่ยน · สรุปเช้าตั้ง +3 นาที ได้รับ 1 ครั้ง · Google บัญชีทดสอบซิงก์สองทาง | หลักฐานภาพหน้าจอ + log ใน ledger | 3 |
| **CAL3.3** | ขอคำสั่งเจ้าของ: EAS build + TestFlight · migration prod · push main · ยื่นตรวจ Google OAuth | เจ้าของสั่งทีละเรื่อง | 2 |
| **CAL3.4** | หลังขึ้น prod: ตรวจใน prod (ตั้งเตือนจริง 1 รายการ · สรุปเช้าวันถัดไป) · บันทึกจุดต่อ/สรุป | ผ่านใน prod | 2 |

---

## 4. ลำดับและเลน (เพดานรวม 2–3 เลน · ตามที่เครื่องว่าง · HR ใช้เครื่องอยู่)

```
CAL0.1 → CAL0.2 ─┬─ เลน a: CAL1.1 → CAL1.2 → CAL1.4 → CAL1.5 → CAL1.6 → CAL1.9
CAL0.3 (ภาพมืด)  ├─ เลน b: CAL1.3 (หลัง 1.1) → CAL1.7 → CAL1.8
                 └─ เลน c (แอป · fixture ก่อน API): CAL2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.9 → 2.12
                     (หลัง CAL1.8/1.6) 2.10 · 2.11 · 2.8 → 2.13
→ CAL3.1 → CAL3.2 → CAL3.3 (รอสั่ง) → CAL3.4
```
- 🎯 = ใบเสี่ยง ต้องมีผู้ตรวจอิสระก่อน merge
- งานแอปเริ่มได้ทันทีด้วย fixture หลัง CAL0.2 · ต่อ API จริงเมื่อ CAL1.6 merge
- รวม build เดียวตอนท้าย (CAL2.8 + CAL2.11 + expo-auth-session ต้อง native module) — ไม่ build ระหว่างทาง

## 5. ประเมินเวลา
≈ 117 ชม.เลน · 3 เลนขนาน ≈ 5–6 วัน ถึงพร้อม build · + Google verification (ฝั่ง Google หลายวัน–สัปดาห์ · ระหว่างรอใช้โหมด Testing ได้ ≤100 บัญชี)

## 6. ความเสี่ยง
| ความเสี่ยง | ทางกัน |
|---|---|
| push ไม่ถึงเครื่อง (APNs เคยพัง) | CAL0.1 ตรวจ credential · CAL3.2 positive control บนเครื่องจริง |
| เตือนซ้ำกับ kanban/CRM | ปฏิทินไม่ push รายการของระบบอื่น · สรุปเช้าเป็นข้อความเดียว |
| ราง minute ล่ม = เตือนไม่ออก | ใช้สัญญาณชีพ `getMinuteJobStatus` เดิม · หน้า integrations เห็น `calendar.fire` |
| เวลาเพี้ยน (UTC/ไทย · สิ้นเดือน) | `nextFire` บริสุทธิ์ + ข้อสอบ 100% · แสดง พ.ศ. |
| Google ไม่ผ่านตรวจ | โหมด Testing ระหว่างรอ · scope น้อยสุด · ร่างเอกสารให้เจ้าของ |
| node_modules ร่วมกัน (prisma generate กระทบทรีอื่น) | CAL1.1 รันตอนเครื่องว่าง + แจ้ง session อื่น |
| ข้อมูลส่วนตัว (PDPA) | นัดในเครื่องไม่ขึ้นเซิร์ฟเวอร์ · Google เฉพาะเจ้าของบัญชี · ยกเลิกเชื่อม = ลบแคชทันที |

## 7. ตัดออกจากรุ่นนี้โดยเจตนา
เตือนคนอื่น/ทีม (M3) · ปฏิทินร่วมของร้าน · เชิญผู้เข้าร่วมนัด · เวลาเดินทางอัตโนมัติจากแผนที่ · Outlook/Exchange · เลขาเตือนเชิงรุก (ค้างจ่าย/ดีลเงียบ — เป็นเฟสถัดไปแยกแผน)

## 8. กติกา RUN (ยกจาก RUN เลขาเดิม)
- งานหนักทุกอย่างผ่าน `scripts/iso.sh` · typecheck `ISO_MEM=14000M`
- ห้าม EAS build · ห้าม push main · ห้าม migrate prod — **จนเจ้าของสั่ง**
- UI ต้องตรงภาพ: ภาพคู่ MOCKUP|RENDER ก่อน merge ทุกจอ
- รายงาน Telegram (`tg`) สั้น + % เป็นระยะ เช่น `tg "📊 CAL · 41% (12/29)"`
- จุดต่องาน: `ledger/CAL-RESUME.md` อัปเดตทุกครั้งที่ปิดใบ
- ตอบเจ้าของเป็นภาษาไทย
