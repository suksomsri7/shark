# ร่างเอกสารยื่นตรวจ Google OAuth — ปฏิทินเลขา SHARK HUB (CAL1.8)

> ร่าง 14 พ.ย. 2569 · เลน b · **สำหรับเจ้าของยื่นเอง** (ใบ CAL3.3 — ยื่นเมื่อเจ้าของสั่ง) · ยังไม่ได้ยื่น ยังไม่ได้แก้หน้าจอยินยอมใน Google Cloud
> โปรเจกต์ Google Cloud: `732040229931` (client เดียวกับการล็อกอินด้วย Google — R-CAL-17) · แอป: SHARK HUB (`th.in.shark.ai`) · เว็บ: https://shark.in.th
> ⚠️ ข้อเท็จจริงที่ต้องให้เจ้าของยืนยันก่อนยื่น มีเครื่องหมาย **[ยืนยัน]** — ร่างนี้ไม่ใช่คำปรึกษากฎหมาย

## 0. สิ่งที่ต้องรู้ก่อนยื่น

| เรื่อง | ค่า |
|---|---|
| scope ที่ขอ (น้อยสุด) | `https://www.googleapis.com/auth/calendar.events` (sensitive) · `https://www.googleapis.com/auth/calendar.calendarlist.readonly` (sensitive) · + `openid email profile` ที่มีอยู่แล้วจากการล็อกอิน |
| scope ที่ **ไม่** ขอ | `calendar` (เต็ม) · `calendar.readonly` ทั้งบัญชี · Gmail/Drive ใด ๆ |
| ประเภทการตรวจ | sensitive scope ⇒ ต้องผ่าน "OAuth app verification" (ไม่ใช่ restricted ⇒ **ไม่ต้อง** CASA security assessment) **[ยืนยัน — ตรวจหน้า Google Cloud > OAuth consent screen ตอนยื่น]** |
| ระหว่างรอตรวจ | โหมด Testing ได้ไม่เกิน 100 บัญชีทดสอบ (เพิ่มอีเมลใน Test users) · refresh token ของโหมด Testing หมดอายุ 7 วัน ⇒ ผู้ทดสอบจะเห็น "ต้องเชื่อมใหม่" ทุกสัปดาห์ (คาดไว้ ไม่ใช่บั๊ก) |
| ⚠️ ผลกระทบ | หน้าจอยินยอมเป็นตัวเดียวกับการล็อกอิน — การเปลี่ยน/ยื่นตรวจกระทบหน้ายินยอมของการล็อกอินด้วย (R-CAL-11 ข้อ 8) |
| ต้องมีก่อนยื่น | หน้า Privacy Policy สาธารณะบนโดเมนที่ยืนยันแล้ว (shark.in.th) ที่มีส่วน §1 ข้างล่าง · หน้าแรกของแอปที่อธิบายผลิตภัณฑ์ · โดเมนยืนยันใน Search Console · โลโก้ · อีเมลติดต่อ **[ยืนยัน: อีเมลผู้ดูแล]** · วิดีโอสาธิต (YouTube unlisted) ตาม §3 |

---

## 1. ส่วนที่ต้องเพิ่มในนโยบายความเป็นส่วนตัว (ไทย + อังกฤษ)

### 1.1 ภาษาไทย

**การเชื่อมต่อ Google Calendar (ไม่บังคับ)**

SHARK HUB ให้คุณเชื่อมบัญชี Google Calendar ของคุณกับ "ปฏิทินเลขา" ได้ตามความสมัครใจ เพื่อดูนัดส่วนตัวรวมกับงานของร้าน และส่งนัด/เตือนที่คุณสร้างในแอปไปไว้ใน Google Calendar ของคุณ

- **ข้อมูลที่เราเข้าถึง**: รายชื่อปฏิทินของคุณ (ชื่อ สี สิทธิ์) และอีเวนต์ในปฏิทินที่คุณเลือกให้ดึงเข้ามาเท่านั้น (ชื่อเรื่อง สถานที่ เวลาเริ่ม-สิ้นสุด) · เราสร้าง แก้ และลบเฉพาะอีเวนต์ที่แอปสร้างขึ้นเอง (นัดส่วนตัว/เตือนฉัน และนัดลูกค้าที่คุณรับ ถ้าคุณเปิดตัวเลือกนั้น) ในปฏิทินปลายทางที่คุณเลือก
- **ข้อมูลที่เราไม่เข้าถึง**: อีเมล ไฟล์ รายชื่อผู้ติดต่อ หรือปฏิทินที่คุณไม่ได้เลือก · เราไม่ขอสิทธิ์จัดการปฏิทินทั้งบัญชี
- **ใช้เพื่ออะไร**: แสดงในปฏิทินและการสรุปเช้า/เย็นของ **คุณคนเดียว** และตรวจนัดชน — ไม่ใช้เพื่อโฆษณา ไม่ขาย ไม่ส่งต่อให้บุคคลที่สาม ไม่ส่งให้ผู้ช่วย AI และไม่ใช้ฝึกโมเดล AI
- **ใครเห็น**: เฉพาะคุณ · เจ้าของร้าน/เพื่อนร่วมงาน/ผู้ดูแลร้านมองไม่เห็นข้อมูล Google ของคุณ และข้อมูลนี้ไม่อยู่ในการส่งออกข้อมูลของร้าน · ผู้ช่วย AI (เลขา) ไม่ได้อ่านอีเวนต์ Google ของคุณ **[ยืนยัน: รุ่นนี้เครื่องมือ calendar_agenda รวมอีเวนต์ Google ของผู้ใช้คนนั้นในคำตอบของเลขาให้ผู้ใช้คนนั้นเอง — ถ้าต้องการถ้อยคำนี้ต้องตัด google ออกจาก calendar_agenda ก่อนยื่น ดูข้อ 4]**
- **การเก็บรักษา**: token เข้ารหัส (AES-256-GCM) ผูกกับบัญชีของคุณ · สำเนาอีเวนต์ที่ดึงมาเก็บไว้แสดงผล ลบเองเมื่อสิ้นสุดเกิน 60 วัน · ข้อมูลไม่ออกจากระบบ SHARK
- **การยกเลิก**: กด "ยกเลิกการเชื่อม" ในแอป (ตั้งค่าปฏิทิน › Google Calendar) — เราถอนสิทธิ์กับ Google และลบ token และสำเนาอีเวนต์ทั้งหมดทันที · ลบบัญชี SHARK = ถอนสิทธิ์และลบทั้งหมดเช่นกัน · ถอนสิทธิ์จากฝั่ง Google ได้ที่ https://myaccount.google.com/permissions
- **ปฏิทินในเครื่อง (iPhone/Android)**: อ่านและบันทึกบนเครื่องของคุณเท่านั้น ไม่ส่งขึ้นเซิร์ฟเวอร์

**การใช้ข้อมูลจาก Google API**: การใช้และการส่งต่อข้อมูลที่ได้รับจาก Google API ของ SHARK HUB เป็นไปตาม Google API Services User Data Policy รวมถึงข้อกำหนด Limited Use

### 1.2 English

**Google Calendar connection (optional)**

SHARK HUB lets you optionally connect your Google Calendar to the "Secretary calendar" so you can see your personal events alongside your work in the shop, and send personal appointments/reminders you create in the app to your own Google Calendar.

- **What we access**: your calendar list (name, colour, access role) and the events of the calendars you choose to import (title, location, start/end time). We create, update and delete only the events the app itself created (your personal appointments/reminders, and — only if you turn it on — the customer bookings assigned to you) in the destination calendar you choose.
- **What we do not access**: email, files, contacts, or calendars you did not select. We do not request full calendar management access.
- **Purpose**: shown only to **you** in your calendar view and morning/evening summary, and used to detect clashes. Not used for advertising, not sold, not transferred to third parties, not used to train AI models.
- **Who can see it**: only you. Shop owners, co-workers and shop administrators cannot see your Google data, and it is excluded from shop data exports.
- **Retention & security**: tokens are encrypted (AES-256-GCM) and bound to your account; cached event copies are deleted automatically 60 days after they end.
- **Disconnect**: tap "Disconnect" in the app (Calendar settings › Google Calendar). We revoke access with Google and immediately delete the token and all cached events. Deleting your SHARK account does the same. You can also revoke access at https://myaccount.google.com/permissions.
- **On-device calendar**: read and written on your device only, never uploaded.

**Limited Use disclosure**: SHARK HUB's use and transfer of information received from Google APIs to any other app will adhere to the Google API Services User Data Policy, including the Limited Use requirements.

---

## 2. เหตุผลของ scope (ช่อง "Scope justification" — ภาษาอังกฤษ)

**`https://www.googleapis.com/auth/calendar.events`**
> SHARK HUB is a business app for small shop owners and staff. Its "Secretary calendar" shows each user their own day: their personal appointments and reminders together with work items from the shop. With this scope we (1) read events from the calendars the user explicitly selects, so personal appointments appear in their day view and in their morning summary and clashes with customer bookings can be flagged; and (2) create, update and delete only the events our app created on the user's behalf (personal appointments/reminders they created in SHARK HUB, and optionally their assigned customer bookings) in one destination calendar they choose, keeping both sides in sync when the user edits or deletes them in either place. We cannot use calendar.events.readonly because the user asked us to write their appointments to Google Calendar, and we do not request the broader `calendar` scope because we never create, share, or delete calendars or change ACLs.

**`https://www.googleapis.com/auth/calendar.calendarlist.readonly`**
> Needed to show the user the list of their calendars (name, colour, whether it is their own or shared with them) so they can choose which calendars to import and which writable calendar should receive exported events. Read-only; we never modify the calendar list.

**Data handling summary (for the reviewer)**: access is per user (not per shop); data is visible only to that user; tokens are encrypted at rest and never sent to the mobile app; disconnect revokes the token and deletes all cached data immediately; no data is used for ads or model training.

---

## 3. สคริปต์วิดีโอสาธิต (≈ 2–3 นาที · อัดจากเครื่องจริง · บรรยายอังกฤษ + คำบรรยายไทย)

> Google ต้องเห็น: ชื่อแอป/โลโก้ตรงกับหน้ายินยอม · หน้ายินยอมของ Google ที่แสดง scope ทั้งสอง (เห็น client id ใน URL ถ้าทำผ่านเว็บ — แอปใช้ native sign-in ⇒ อัดให้เห็นหน้ายินยอมของ Google เต็มจอ) · การใช้ทุก scope ในแอป · การถอนสิทธิ์

| เวลา | ภาพ | บรรยาย (EN) |
|---|---|---|
| 0:00 | เปิด SHARK HUB → หน้าเลขา → ไอคอนปฏิทินแถบบน | "This is SHARK HUB, a business app for shop owners and staff. This is the Secretary calendar — each user's own day." |
| 0:15 | ⚙ ตั้งค่าปฏิทิน → แถว "Google Calendar · เชื่อม" | "The user can optionally connect their own Google Calendar." |
| 0:25 | กด → หน้าเลือกบัญชี Google → **หน้ายินยอม** แสดง "See, edit… events on all your calendars" + "See the list of Google calendars you're subscribed to" → กดอนุญาต | "Google shows the two calendar permissions we request: calendar events, and read-only calendar list." |
| 0:50 | จอ 9: email · รายการปฏิทิน (ส่วนตัว · งานบ้าน · วันหยุด) พร้อมสวิตช์ | "calendar.calendarlist.readonly: we list the user's calendars so they choose what to import." |
| 1:05 | เปิดสวิตช์ "งานบ้าน" → กลับจอวัน → อีเวนต์ Google ขึ้นพร้อมป้าย "Google" | "calendar.events read: events from the selected calendars appear in the user's own day view." |
| 1:25 | เพิ่ม "นัดส่วนตัว" ในแอป → ดึงลงรีเฟรช → เปิด Google Calendar (เว็บหรือแอป) เห็นนัดเดียวกัน | "calendar.events write: appointments the user creates in SHARK HUB are added to their chosen Google calendar." |
| 1:45 | แก้เวลานัดใน Google → กลับแอป ดึงลง → เวลาเปลี่ยน · ลบใน Google → แอปเป็น "ยกเลิก" | "Edits and deletes stay in sync both ways — only for events our app created." |
| 2:05 | จอ 9 กล่องความเป็นส่วนตัว | "Only this user can see this data. The shop owner and co-workers cannot." |
| 2:15 | กด "ยกเลิกการเชื่อม" → ยืนยัน → แถวกลับเป็น "เชื่อม" · อีเวนต์ Google หายจากจอ · เปิด myaccount.google.com/permissions ไม่มี SHARK HUB แล้ว | "Disconnecting revokes access and deletes all cached Google data immediately." |
| 2:35 | หน้า Privacy Policy บน shark.in.th ส่วน Google Calendar | "Our privacy policy describes this use, including the Limited Use disclosure." |

ข้อกำหนดการอัด: ใช้บัญชีทดสอบ (โหมด Testing) · ไม่มีข้อมูลลูกค้าจริงบนจอ (ใช้ร้าน CALQC) · ไม่ตัดต่อข้ามขั้นยินยอม · อัปโหลด YouTube แบบ Unlisted

---

## 4. รายการที่ต้องตัดสินก่อนยื่น (สำหรับเจ้าของ)

1. ✅ **ตัดสินแล้ว (calendar_b · ค่าเริ่มที่แนะนำ)**: ข้อมูล Google **ไม่ถูกส่งเข้าโมเดล AI เลย** และเทิร์นที่ใช้เครื่องมือปฏิทินไม่เข้า dataset ฝึกโมเดล (`AiTrainingSample`) — ถ้อยคำในนโยบาย "ผู้ช่วย AI (เลขา) ไม่ได้อ่านอีเวนต์ Google ของคุณ" ใช้ได้ตามจริง · ข้อความเดิมของข้อนี้เก็บไว้เป็นประวัติ:
   **เลขา AI กับอีเวนต์ Google** — `calendar_agenda` (เครื่องมือเลขา CAL1.7) เรียก `agendaFor` ซึ่งรวมอีเวนต์ Google ของผู้ใช้คนนั้น ⇒ ชื่ออีเวนต์ Google ถูกส่งเข้าโมเดล AI (Anthropic) เพื่อตอบผู้ใช้คนนั้น — Limited Use อนุญาตการใช้ "เพื่อให้บริการฟีเจอร์ที่ผู้ใช้เห็น" แต่ Google มักถามเรื่องการส่งต่อให้ผู้ให้บริการ AI **[ยืนยัน: (ก) คงไว้ + เขียนในนโยบายว่า "ส่งให้ผู้ให้บริการประมวลผล AI เพื่อตอบคำถามของคุณเท่านั้น ไม่ใช้ฝึกโมเดล" หรือ (ข) ตัด google ออกจาก calendar_agenda (แก้ 1 บรรทัด)]** — ค่าที่เลน b แนะนำ: (ข) จนผ่านการตรวจ
2. (PDPA · review b m6) ส่งออก "นัดลูกค้าที่ฉันรับ" — ค่าเริ่มปิด · ส่งเฉพาะสาขาที่ยังเข้าถึงและร้านไม่ได้ปิดเลขาระบบบัตรคิว · ลบบัญชี/ยกเลิกเชื่อม = ลบสำเนาก่อนถอนสิทธิ์ (มีเพดานเวลา 8 วิ) · ร้านยังไม่มีสวิตช์ระดับร้าน — ใส่ชื่อลูกค้าในอีเวนต์ Google (Q9 · ค่าเริ่มปิด) — ข้อมูลลูกค้าของร้านออกไปอยู่ในบัญชี Google ส่วนตัวของพนักงาน **[ยืนยัน]**
3. อีเมลติดต่อผู้พัฒนา / ผู้ดูแลข้อมูล (DPO) ที่จะใส่ในหน้ายินยอม **[ยืนยัน]**
4. ต้องมีหน้า Privacy Policy ฉบับเผยแพร่ก่อน — เลน b ไม่ได้แก้หน้าเว็บ (นอกขอบเขต)
