# CAL-RESUME — เลขา AI ปฏิทิน + เตือนความจำ

- แผน: `ledger/SEC-CALENDAR-PLAN.md` (สำเนาจาก /root/mockups/secretary-calendar/ · 29 ใบ · มติ M1–M4 §0 ยึดเหนือทุกข้อ)
- ภาพอนุมัติ: /root/mockups/secretary-calendar/cal-{1,2,3}.png · DESIGN.md · gen.py
- ทรี `/root/projects/shark-sec-ui` branch `wip/sec-calendar` ตัดจาก `wip/sec-ui-1114` @ 8acda1fd3 (14 พ.ย. 2569)
- กติกา: งานหนักผ่าน scripts/iso.sh (typecheck ISO_MEM=14000M) · ห้าม EAS build / push main / migrate prod จนเจ้าของสั่ง · UI ทุกจอภาพคู่ MOCKUP|RENDER ก่อน merge · tg สั้น+% · ตอบเจ้าของภาษาไทย

## สถานะใบ (15/29 · เลน c ปิด 9 ใบ fixture-only — รอ CAL1.6 ต่อ API จริง)
| ใบ | สถานะ | หมายเหตุ |
|---|---|---|
| CAL0.1 สำรวจ | ✅ 14 พ.ย. (เจ้าของตอบ Q1–Q7 = ค่าเริ่ม · Q6 ส่ง RUN บัญชี) | ledger/cal-briefs/cal-brief-RESOLUTIONS.md · R-CAL-1…24 · คำถามเจ้าของ Q1–Q7 (มีค่าเริ่มทุกข้อ) · APNs ของ th.in.shark.ai ยังไม่ได้ตรวจ (R-CAL-14 · ต้องทำก่อน CAL3.2) |
| CAL0.2 สัญญา | ✅ 14 พ.ย. a89ce9df3 | docs/modules/32-secretary-calendar.md (R-CAL-25…37 · Q8 เวลาเดินทาง · Q9 ชื่อลูกค้าใน Google) · seed รัน 2 รอบบน wo-sec-qc: รอบ 2 เขียน 0 ✅ · ฐาน QC เลขา migrate 4 ไฟล์ค้างแล้ว (svc_h/chat_hide/attachments/bizprofile) |
| CAL0.3 ภาพมืด | ✅ เจ้าของผ่าน 14 พ.ย. | cal-dark-{1,2,3}.png |
| CAL1.1 migration calendar_a (เลน a) | ✅ 14 พ.ย. (รอผู้ตรวจอิสระ 🎯) | prisma/schema/calendar.prisma ตรงสัญญา §2 · migration 20261228000300_calendar_a ลงฐาน QC เลขาแล้ว · scope 4 แถว · R-CAL-33 export ยกเว้น CalItem/CalPref · deleteUserTraces 3 ตาราง · seed รอบ 2 เขียน 0 · qc-cal-1.1 15/15 ×2 · typecheck ✅ |
| CAL1.2 items + nextFire (เลน a) | ✅ 14 พ.ย. (รอผู้ตรวจอิสระ 🎯) | modules/calendar/{next-fire,items,links,push-msg}.ts · removeStaff ลบของส่วนตัว · qc-cal-1.2 103/103 ×2 (P บริสุทธิ์ next-fire.ts บรรทัด 100% · กิ่ง 99.4% — กิ่งเดียวที่เหลือเป็นเงาของ tsx ที่บรรทัดหัวฟังก์ชัน) · ส่วนต่าง D-A1…A8 ในสัญญา §15 |
| CAL1.4 job calendar.fire (เลน a) | ✅ 14 พ.ย. (รอผู้ตรวจอิสระ 🎯) | modules/calendar/{fire,jobs}.ts · push.ts +categoryId +transportErrors (additive) · import ใน crm-cron.mts + api/cron/outbox · F5 baseline 50→51 (fire.ts ข้ามผู้ใช้ตาม §3.3) · qc-cal-1.4 30/30 ×2 · ⚠️ push ถึงเครื่องจริงยังไม่พิสูจน์ (CAL3.2) |
| CAL1.5 job calendar.brief (เลน a) | ✅ 14 พ.ย. | modules/calendar/{brief,summary}.ts + agenda.ts **STUB until CAL1.3** (เลน b แทนทั้งไฟล์) · จองก่อนส่ง · ชุดละ 50 · หน้าต่าง 90 น. · Google เฉพาะกิจการหลัก (R-CAL-31) · F5 51→52 · qc-cal-1.5 24/24 ×2 |
| CAL1.6 API แอป (เลน a) | ✅ 14 พ.ย. | src/app/api/mobile/secretary/calendar/{agenda,month,today,items,items/[id],items/[id]/{done,reopen,snooze,confirm},source-done,prefs} + modules/calendar/prefs.ts · badges.calendar (ไม่รวม total) · rooms/[id].reminders · google/* = CAL1.8 เลน b · qc-cal-1.6 32/32 ×2 (401 ทุกเส้น · 404 ของคนอื่น · 400 ไทย · strict · 429) |
| CAL1.9 นัดชน (เลน a) | ✅ 14 พ.ย. | modules/calendar/conflicts.ts บริสุทธิ์ · qc-cal-1.9 17/17 ×2 · ครอบคลุม 100% บรรทัด/กิ่ง/ฟังก์ชัน (วัดบน JS ที่ esbuild แปลง — ตัววัดของ node บน .ts ผ่าน tsx แมปบรรทัดเพี้ยน) · ต่อเข้า agenda = CAL1.3 เลน b · ⏭ เลน a ครบ 6 ใบ |
| CAL1.3 ตัวรวม agenda (เลน b) | ✅ 14 พ.ย. (รอผู้ตรวจอิสระ 🎯) | modules/calendar/{agenda,tax-deadlines}.ts แทน STUB ทั้งไฟล์ (ลายเซ็นเดิม) · adapter 10 แหล่ง part()+logOps WARN+SECTION_FAILED · ตัดด้วยระบบไม่เปิด/CalPref.sources/ระดับเลขา OFF (ไม่ตัดของส่วนตัว Q2) · conflicts() → conflictWith · monthDots · todayOpenCount (count ตรง แคช 60 วิ) · completeSourceItem (kanban completeCard · CRM completeActivity) · links.ts +deepLink · เส้น F2 ใหม่ calendar→hr · qc-cal-1.3 58/58 ×2 (รัน seed ก่อน) · D-B1…B14 |
| CAL1.7 เครื่องมือเลขา (เลน b) | ✅ 14 พ.ย. (รอผู้ตรวจอิสระ 🎯) | src/lib/ai/tools-calendar.ts 5 ตัว (ไม่มีพารามิเตอร์ผู้รับ · ไม่ action · HAND_TOOL_CORE · add/agenda ใน CORE_TOOLS · สกิล calendar) · ทำซ้ำ = DRAFT · roomId = AiRoom.id · persona ห้องเลขา (M3 ปฏิเสธ+เสนอการ์ด · แยก schedule_task · วันที่+7 วัน) · qc-cal-1.7 51/51 ×2 · eval สด qc-cal-1.7-live 22 ประโยค: 100% / 95.5% (สองรอบสุดท้าย) · ค่าโมเดลรวม ≈ $1.00 · D-B15…B20 |
| CAL1.8 Google (เลน b) | ✅ 14 พ.ย. (รอผู้ตรวจอิสระ 🎯 · ยังไม่ทดสอบกับ Google จริง) | modules/calendar/google.ts + job calendar.google (15 นาที) + route calendar/google{,/connect,/sync} · secret-box AAD cal:<user>:<link> · syncToken ต่อปฏิทิน · ส่งออก EVENT/REMINDER/BOOKING + แก้สองทาง · ยกเลิกเชื่อม = ลบสำเนา+revoke+ลบแคช · deleteUserTraces revoke · qc-cal-1.8 49/49 ×2 (transport ปลอม) · ร่างยื่นตรวจ ledger/cal-briefs/google-verification-draft.md · D-B21…B27 |
| แก้รีวิว cal-review-b (เลน b) | ✅ 15 พ.ย. (รอผู้ตรวจ) | migration 20261228000400_calendar_b (CalItem.userEditedAt/externalCalendarId + CalRoomCard) ลงฐาน QC เลขาแล้ว · B1 ผลเครื่องมือไม่มีข้อมูลส่วนตัว + การ์ด calendarCards ใน GET rooms/[id] (⚠️ แอปต้องวาดการ์ด — งานเลน c) · Google ไม่เข้าโมเดล · M7 ไม่เข้า dataset · M1–M6 + m1–m9 · qc-cal-1.3 61 · 1.7 59 · 1.8 66 · D-B28…B39 · คำตอบรีวิวท้าย ledger/cal-briefs/cal-review-b.md |
| CAL2.1 แถบบน+API แอป | ✅ เลน c 14 พ.ย. bd9f52175 | ปุ่มปฏิทินถัดจาก ทีม + badge แดง (badges.calendar) · src/api/calendar.ts (ชนิดสัญญา + เส้น §8) · fixture เฉพาะ dev/QC เมื่อ 404 (calendar.fixtures.ts) · route calendar/{index,settings,google} · ภาพคู่ /root/qc/cal/ |
| CAL2.2 มุมมองวัน | ✅ เลน c 4c133fc34 (รวม 2.3) | แถบสัปดาห์+จุด · ทั้งวัน/ตามเวลา · AgendaRow · deepLink · ติ๊ก done/reopen/source-done · ดึงลง · ว่าง · pair-day[-dark] |
| CAL2.3 มุมมองเดือน | ✅ เลน c 4c133fc34 | ตาราง อา–ส · จุด ≤3 · ‹ พ.ศ. › · pair-month[-dark] |
| CAL2.4 แท็บเตือนฉัน | ✅ เลน c c63f1c8b7 | วันนี้/ต่อไป/เสร็จแล้ว · ปัดซ้ายลบ/ปัดขวาเสร็จ (SwipeRow + onDone) · ไม่มีภาพแบบ → render-remind[-dark] อย่างเดียว |
| CAL2.5 การ์ดวันนี้ | ✅ เลน c 6979c0511 | TodayCard ใต้ช่องค้นหา · pair-home[-dark] |
| CAL2.6 ปุ่ม + / AddCalSheet | ✅ เลน c f5c0e1ec7 | + โซนเลขา = แผ่นเลือก (สั่งงาน/เพิ่มเตือน) · โซนปฏิทิน = แผ่นเพิ่มตรง · pair-add[-dark] · ผูกกับ: จริง = ดีล CRM ของฉันเท่านั้น (ใบแจ้งหนี้/การ์ด ยังไม่มีเส้นค้นในแอป) |
| CAL2.7 การ์ดเตือนในห้อง | ✅ เลน c f4b107470 | ReminderCard + DRAFT ใช่ ตั้งเลย/แก้เวลา · RoomDetail.reminders · pair-room[-dark] |
| CAL2.9 ตั้งค่าปฏิทิน | ✅ เลน c 144a48cbb | จอ 8 + จอ 9 (ดู/สลับ/ยกเลิกเชื่อม · ไม่มีปุ่มเชื่อม = CAL2.10) · pair-settings / pair-google |
| CAL2.12 นัดชน | ✅ เลน c a08981278 | ConflictCard + cal-conflicts.ts (สำเนา §11 ฝั่งแอป · ต้องเทียบกับ CAL1.9) · render-tomorrow-full |
| B1 แอป (cal-review-b) | ✅ เลน c 15 พ.ย. (ดูคอมมิต "B1 room calendar cards") | RoomDetail.calendarCards → RoomCalCard (AGENDA = agenda ของผู้ดู แบบจอ 3 + "เปิดในปฏิทิน ›" · LIST = items today+upcoming แบบแท็บเตือนฉัน) · คนอื่นในห้อง = ไม่มีการ์ด (render-room-cards-other) · ข้อความยืนยันเตือนประจำมาจาก ReminderCard (DRAFT) · source-done 409 blocked/403 = แสดงข้อความเซิร์ฟเวอร์ + คืนวงกลม (โค้ดเดิมรองรับแล้ว) · Google DTO accessRole → "แชร์มา" |
| CAL2.13 โหมดมืด+ภาพคู่ | ✅ เลน c 15 พ.ย. (fixture/mock) | ภาพคู่ /root/qc/cal/pair-{home,day,month,room,add,settings,google,tomorrow}[-dark].png + render-* (remind, plus, add-custom, add-link, room-edit, set-time, tomorrow-full, room-cards, room-cards-other) ทั้งสองธีม · ยังไม่ได้ถ่ายกับเซิร์ฟเวอร์จริง/ฐาน QC |
| CAL2.8 ปุ่มลัดแจ้งเตือน | ✅ โค้ด (รอ build) เลน c 15 พ.ย. | src/lib/cal-notify.ts: category SEC_CAL / SEC_CAL_CALL (setNotificationCategoryAsync ตอน registerPush) · ทุกปุ่ม opensAppToForeground ⇒ ไม่ต้อง expo-task-manager (R-CAL-13b) · ปุ่ม → done/snooze ในนามกิจการของรายการ (data.tenantId) → ลบแจ้งเตือน → เปิดปฏิทินวันนั้น · โทรเลย = GET items/[id].phone → tel: · แตะ = SEC_LINKS /secretary/calendar?day&item · ⚠️ ต้องทดสอบบนเครื่องจริง |
| CAL2.10 เชื่อม Google | ✅ โค้ด เลน c 15 พ.ย. | src/lib/cal-google.ts: google-signin เดิม configure(offlineAccess + forceCodeForRefreshToken + scope ปฏิทิน 2 ตัว) → signOut → signIn → serverAuthCode → POST google/connect · ไม่แก้ app.json (plugin+iosUrlScheme มีแล้ว) ⇒ ส่ง OTA ได้ถ้า build ปัจจุบันมี google-signin 16 · จอ 9: ปุ่มเชื่อม/เชื่อมใหม่ · เลือกปฏิทินปลายทาง (owner/writer) · ส่งออกบัตรคิวค่าเริ่มปิด (Q9) · ⚠️ ทดสอบจริงต้องใช้บัญชีทดสอบโหมด Testing |
| CAL2.11 ปฏิทินในเครื่อง | ✅ โค้ด (รอ build) เลน c 15 พ.ย. | expo-calendar ~57.0.6 (npx expo install) + plugin ใน app.json (ข้อความไทย "Lekaa ใช้ปฏิทินในเครื่อง…" · Android READ/WRITE_CALENDAR จาก plugin) · src/lib/device-calendar.ts (ค่าในเครื่อง cal.device.<userId>) · จอ /secretary/calendar/device · รวมในวัน/เดือน/การ์ดวันนี้/นัดชน/การ์ด AGENDA ในห้อง · ส่งออกนัดส่วนตัว + แผนที่ id ในเครื่อง · ไม่ส่งขึ้นเซิร์ฟเวอร์ · ⚠️ ต้อง build ใหม่ + ทดสอบเครื่องจริง (เว็บแสดงได้แค่ "ใช้ได้ในแอปเท่านั้น") |
| นัดชนแอป=เซิร์ฟเวอร์ | ✅ 15 พ.ย. | apps/mobile/src/lib/cal-conflicts.ts พอร์ตตรงจาก conflicts.ts · ตรวจ: `sed 's#@/lib/modules/calendar/conflicts#<abs>/apps/mobile/src/lib/cal-conflicts.ts#' scripts/qc-cal-1.9.mts` แล้วรัน tsx → 17/17 (เท่าฝั่งเซิร์ฟเวอร์) |

## จุดต่อ
- เลน c (14 พ.ย.): จอทั้งหมดใช้ fixture ในตัวจนเส้น CAL1.6 ขึ้น · ถ่ายภาพคู่: `QC_PREPARE=1 bash scripts/iso.sh env QC_PREPARE=1 QC_NODE_MODULES=/root/qc-cal-nm/node_modules node apps/mobile/qc/shoot-cal.mjs --both` (นาฬิกาปัก 16 พ.ย. 2569 08:05 · ผล /root/qc/cal/ · /root/qc-cal-nm = node_modules ของ shark-in-th + expo-document-picker)
- ถ้า session ตาย: อ่านไฟล์นี้ → ดูใบที่ ▶️ → ดู ledger/cal-briefs/ ว่ามีผลค้างไหม

## เลน (14 พ.ย.)
- เลน a `/root/projects/shark-cal-a` branch `wip/cal-a`: CAL1.1 → 1.2 → 1.4 → 1.5 → 1.6 → 1.9
- เลน c `/root/projects/shark-cal-c` branch `wip/cal-c`: CAL2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.9 → 2.12 (fixture ก่อน API)
- เลน b เริ่มหลัง CAL1.1 merge: CAL1.3 → 1.7 → 1.8

- 14 พ.ย. เลน a แก้ตามรีวิวอิสระ `ledger/cal-briefs/cal-review-a.md` (B1 · M1–M5 · m2–m4 · m6 · m7 · m1/m5/m8 บันทึก) — a70751de3 · 4a78330b1 · สัญญา §15 D-A25…36
