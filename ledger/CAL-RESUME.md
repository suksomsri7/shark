# CAL-RESUME — เลขา AI ปฏิทิน + เตือนความจำ

- แผน: `ledger/SEC-CALENDAR-PLAN.md` (สำเนาจาก /root/mockups/secretary-calendar/ · 29 ใบ · มติ M1–M4 §0 ยึดเหนือทุกข้อ)
- ภาพอนุมัติ: /root/mockups/secretary-calendar/cal-{1,2,3}.png · DESIGN.md · gen.py
- ทรี `/root/projects/shark-sec-ui` branch `wip/sec-calendar` ตัดจาก `wip/sec-ui-1114` @ 8acda1fd3 (14 พ.ย. 2569)
- กติกา: งานหนักผ่าน scripts/iso.sh (typecheck ISO_MEM=14000M) · ห้าม EAS build / push main / migrate prod จนเจ้าของสั่ง · UI ทุกจอภาพคู่ MOCKUP|RENDER ก่อน merge · tg สั้น+% · ตอบเจ้าของภาษาไทย

## สถานะใบ (12/29 · เลน c ปิด 9 ใบ fixture-only — รอ CAL1.6 ต่อ API จริง)
| ใบ | สถานะ | หมายเหตุ |
|---|---|---|
| CAL0.1 สำรวจ | ✅ 14 พ.ย. (เจ้าของตอบ Q1–Q7 = ค่าเริ่ม · Q6 ส่ง RUN บัญชี) | ledger/cal-briefs/cal-brief-RESOLUTIONS.md · R-CAL-1…24 · คำถามเจ้าของ Q1–Q7 (มีค่าเริ่มทุกข้อ) · APNs ของ th.in.shark.ai ยังไม่ได้ตรวจ (R-CAL-14 · ต้องทำก่อน CAL3.2) |
| CAL0.2 สัญญา | ✅ 14 พ.ย. a89ce9df3 | docs/modules/32-secretary-calendar.md (R-CAL-25…37 · Q8 เวลาเดินทาง · Q9 ชื่อลูกค้าใน Google) · seed รัน 2 รอบบน wo-sec-qc: รอบ 2 เขียน 0 ✅ · ฐาน QC เลขา migrate 4 ไฟล์ค้างแล้ว (svc_h/chat_hide/attachments/bizprofile) |
| CAL0.3 ภาพมืด | ✅ เจ้าของผ่าน 14 พ.ย. | cal-dark-{1,2,3}.png |
| CAL2.1 แถบบน+API แอป | ✅ เลน c 14 พ.ย. bd9f52175 | ปุ่มปฏิทินถัดจาก ทีม + badge แดง (badges.calendar) · src/api/calendar.ts (ชนิดสัญญา + เส้น §8) · fixture เฉพาะ dev/QC เมื่อ 404 (calendar.fixtures.ts) · route calendar/{index,settings,google} · ภาพคู่ /root/qc/cal/ |
| CAL2.2 มุมมองวัน | ✅ เลน c 4c133fc34 (รวม 2.3) | แถบสัปดาห์+จุด · ทั้งวัน/ตามเวลา · AgendaRow · deepLink · ติ๊ก done/reopen/source-done · ดึงลง · ว่าง · pair-day[-dark] |
| CAL2.3 มุมมองเดือน | ✅ เลน c 4c133fc34 | ตาราง อา–ส · จุด ≤3 · ‹ พ.ศ. › · pair-month[-dark] |
| CAL2.4 แท็บเตือนฉัน | ✅ เลน c c63f1c8b7 | วันนี้/ต่อไป/เสร็จแล้ว · ปัดซ้ายลบ/ปัดขวาเสร็จ (SwipeRow + onDone) · ไม่มีภาพแบบ → render-remind[-dark] อย่างเดียว |
| CAL2.5 การ์ดวันนี้ | ✅ เลน c 6979c0511 | TodayCard ใต้ช่องค้นหา · pair-home[-dark] |
| CAL2.6 ปุ่ม + / AddCalSheet | ✅ เลน c f5c0e1ec7 | + โซนเลขา = แผ่นเลือก (สั่งงาน/เพิ่มเตือน) · โซนปฏิทิน = แผ่นเพิ่มตรง · pair-add[-dark] · ผูกกับ: จริง = ดีล CRM ของฉันเท่านั้น (ใบแจ้งหนี้/การ์ด ยังไม่มีเส้นค้นในแอป) |
| CAL2.7 การ์ดเตือนในห้อง | ✅ เลน c (ดู git log) | ReminderCard + DRAFT ใช่ ตั้งเลย/แก้เวลา · RoomDetail.reminders · pair-room[-dark] |
| CAL2.9 ตั้งค่าปฏิทิน | ✅ เลน c (ดู git log) | จอ 8 + จอ 9 (ดู/สลับ/ยกเลิกเชื่อม · ไม่มีปุ่มเชื่อม = CAL2.10) · pair-settings / pair-google |
| CAL2.12 นัดชน | ✅ เลน c (ดู git log) | ConflictCard + cal-conflicts.ts (สำเนา §11 ฝั่งแอป · ต้องเทียบกับ CAL1.9) · render-tomorrow-full |

## จุดต่อ
- เลน c (14 พ.ย.): จอทั้งหมดใช้ fixture ในตัวจนเส้น CAL1.6 ขึ้น · ถ่ายภาพคู่: `QC_PREPARE=1 bash scripts/iso.sh env QC_PREPARE=1 QC_NODE_MODULES=/root/qc-cal-nm/node_modules node apps/mobile/qc/shoot-cal.mjs --both` (นาฬิกาปัก 16 พ.ย. 2569 08:05 · ผล /root/qc/cal/ · /root/qc-cal-nm = node_modules ของ shark-in-th + expo-document-picker)
- ถ้า session ตาย: อ่านไฟล์นี้ → ดูใบที่ ▶️ → ดู ledger/cal-briefs/ ว่ามีผลค้างไหม

## เลน (14 พ.ย.)
- เลน a `/root/projects/shark-cal-a` branch `wip/cal-a`: CAL1.1 → 1.2 → 1.4 → 1.5 → 1.6 → 1.9
- เลน c `/root/projects/shark-cal-c` branch `wip/cal-c`: CAL2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.9 → 2.12 (fixture ก่อน API)
- เลน b เริ่มหลัง CAL1.1 merge: CAL1.3 → 1.7 → 1.8
