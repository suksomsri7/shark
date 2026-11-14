# CAL-RESUME — เลขา AI ปฏิทิน + เตือนความจำ

- แผน: `ledger/SEC-CALENDAR-PLAN.md` (สำเนาจาก /root/mockups/secretary-calendar/ · 29 ใบ · มติ M1–M4 §0 ยึดเหนือทุกข้อ)
- ภาพอนุมัติ: /root/mockups/secretary-calendar/cal-{1,2,3}.png · DESIGN.md · gen.py
- ทรี `/root/projects/shark-sec-ui` branch `wip/sec-calendar` ตัดจาก `wip/sec-ui-1114` @ 8acda1fd3 (14 พ.ย. 2569)
- กติกา: งานหนักผ่าน scripts/iso.sh (typecheck ISO_MEM=14000M) · ห้าม EAS build / push main / migrate prod จนเจ้าของสั่ง · UI ทุกจอภาพคู่ MOCKUP|RENDER ก่อน merge · tg สั้น+% · ตอบเจ้าของภาษาไทย

## สถานะใบ (1/29)
| ใบ | สถานะ | หมายเหตุ |
|---|---|---|
| CAL0.1 สำรวจ | ✅ 14 พ.ย. (เจ้าของตอบ Q1–Q7 = ค่าเริ่ม · Q6 ส่ง RUN บัญชี) | ledger/cal-briefs/cal-brief-RESOLUTIONS.md · R-CAL-1…24 · คำถามเจ้าของ Q1–Q7 (มีค่าเริ่มทุกข้อ) · APNs ของ th.in.shark.ai ยังไม่ได้ตรวจ (R-CAL-14 · ต้องทำก่อน CAL3.2) |
| CAL0.2 สัญญา | ▶️ เริ่ม 14 พ.ย. | docs/modules/32-secretary-calendar.md + scripts/seed-calendar-qc.mts |
| CAL0.3 ภาพมืด | 🟡 ส่งเจ้าของแล้ว (tg msg 5978–5980) รอ ✅ | /root/mockups/secretary-calendar/cal-dark-{1,2,3}.png · gen.py ส่วน DARK (สำรอง gen.py.bak-r2) |

## จุดต่อ
- ถ้า session ตาย: อ่านไฟล์นี้ → ดูใบที่ ▶️ → ดู ledger/cal-briefs/ ว่ามีผลค้างไหม
