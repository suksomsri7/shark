# CAL-RESUME — เลขา AI ปฏิทิน + เตือนความจำ

- แผน: `ledger/SEC-CALENDAR-PLAN.md` (สำเนาจาก /root/mockups/secretary-calendar/ · 29 ใบ · มติ M1–M4 §0 ยึดเหนือทุกข้อ)
- ภาพอนุมัติ: /root/mockups/secretary-calendar/cal-{1,2,3}.png · DESIGN.md · gen.py
- ทรี `/root/projects/shark-sec-ui` branch `wip/sec-calendar` ตัดจาก `wip/sec-ui-1114` @ 8acda1fd3 (14 พ.ย. 2569)
- กติกา: งานหนักผ่าน scripts/iso.sh (typecheck ISO_MEM=14000M) · ห้าม EAS build / push main / migrate prod จนเจ้าของสั่ง · UI ทุกจอภาพคู่ MOCKUP|RENDER ก่อน merge · tg สั้น+% · ตอบเจ้าของภาษาไทย

## สถานะใบ (3/29)
| ใบ | สถานะ | หมายเหตุ |
|---|---|---|
| CAL0.1 สำรวจ | ✅ 14 พ.ย. (เจ้าของตอบ Q1–Q7 = ค่าเริ่ม · Q6 ส่ง RUN บัญชี) | ledger/cal-briefs/cal-brief-RESOLUTIONS.md · R-CAL-1…24 · คำถามเจ้าของ Q1–Q7 (มีค่าเริ่มทุกข้อ) · APNs ของ th.in.shark.ai ยังไม่ได้ตรวจ (R-CAL-14 · ต้องทำก่อน CAL3.2) |
| CAL0.2 สัญญา | ✅ 14 พ.ย. a89ce9df3 | docs/modules/32-secretary-calendar.md (R-CAL-25…37 · Q8 เวลาเดินทาง · Q9 ชื่อลูกค้าใน Google) · seed รัน 2 รอบบน wo-sec-qc: รอบ 2 เขียน 0 ✅ · ฐาน QC เลขา migrate 4 ไฟล์ค้างแล้ว (svc_h/chat_hide/attachments/bizprofile) |
| CAL0.3 ภาพมืด | ✅ เจ้าของผ่าน 14 พ.ย. | cal-dark-{1,2,3}.png |
| CAL1.1 migration calendar_a (เลน a) | ✅ 14 พ.ย. (รอผู้ตรวจอิสระ 🎯) | prisma/schema/calendar.prisma ตรงสัญญา §2 · migration 20261228000300_calendar_a ลงฐาน QC เลขาแล้ว · scope 4 แถว · R-CAL-33 export ยกเว้น CalItem/CalPref · deleteUserTraces 3 ตาราง · seed รอบ 2 เขียน 0 · qc-cal-1.1 15/15 ×2 · typecheck ✅ |
| CAL1.2 items + nextFire (เลน a) | ✅ 14 พ.ย. (รอผู้ตรวจอิสระ 🎯) | modules/calendar/{next-fire,items,links,push-msg}.ts · removeStaff ลบของส่วนตัว · qc-cal-1.2 103/103 ×2 (P บริสุทธิ์ next-fire.ts บรรทัด 100% · กิ่ง 99.4% — กิ่งเดียวที่เหลือเป็นเงาของ tsx ที่บรรทัดหัวฟังก์ชัน) · ส่วนต่าง D-A1…A8 ในสัญญา §15 |

## จุดต่อ
- ถ้า session ตาย: อ่านไฟล์นี้ → ดูใบที่ ▶️ → ดู ledger/cal-briefs/ ว่ามีผลค้างไหม

## เลน (14 พ.ย.)
- เลน a `/root/projects/shark-cal-a` branch `wip/cal-a`: CAL1.1 → 1.2 → 1.4 → 1.5 → 1.6 → 1.9
- เลน c `/root/projects/shark-cal-c` branch `wip/cal-c`: CAL2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.9 → 2.12 (fixture ก่อน API)
- เลน b เริ่มหลัง CAL1.1 merge: CAL1.3 → 1.7 → 1.8
