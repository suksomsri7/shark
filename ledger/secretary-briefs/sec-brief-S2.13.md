# S2-13 — S2.13 โหมดมืดครบทุกจอ · S2.20 แถบบนทุกหน้า + push ห้องลูกค้า + ทดสอบ 3 แชทไม่ปน + ภาพคู่ K (Opus · `wip/sec-s2.13` · หลังทุกจอ S2 merge (S2.2–S2.12, S2.15, S2.17–S2.22) · light-check + ผู้คุมดูภาพคู่ทั้งชุด → CP2)
Read COMMON · RESOLUTIONS §F (R-UI3 theme-store · C17) · `sec-brief-S2.1.md` (SecTopBar/badges) · `sec-brief-S2.6` ใน S2.5 (push handler) · plan rows S2.13/S2.20 · ภาพแบบ `sec-dark-*.jpg` ทุกแผ่น · spec `scripts/qc-sec-specs/s2.13.json` + ทุก spec ของใบก่อนหน้า (รันซ้ำทั้งหมด)
## S2.13 โหมดมืด
- ทุกจอ S2 (≥ 30 route ใน `qc-sec-specs/*.json`) ถ่าย `--both` แล้วภาพคู่มืดต้องตรงแบบ `sec-dark-*` (ผู้คุมดู) · ตั้งค่า ตามระบบ/สว่าง/มืด ใน G4 (S2.22) ใช้ `theme-store` · `app.json` `userInterfaceStyle: "automatic"` · `StatusBar` style ตามธีม · ไม่มีสีฝัง (U3 ทุก route) · จอ 1.0 ไม่เปลี่ยน (ยังใช้ shim สว่าง)
- ตรวจ: รัน `qc-sec-screen.mts` ทุก spec (s2.2, s2.4, s2.5, s2.7, s2.10, s2.12, s2.15, s2.17, s2.21, s2.1 oracle) ซ้ำในทรีนี้ — ทุกตัวต้องเขียว · ภาพคู่มืดที่ยังไม่มี (จากใบที่ pair=false) ทำให้ครบที่นี่สำหรับจอที่มีแบบ
## S2.20 แถบบนทุกหน้า + push + 3 แชท
- `SecTopBar` ทุกหน้า S2 (รวม customers/help/business): badge 3 ไอคอน = รออนุมัติ (`secretary/inbox/count.canApprove`) · ลูกค้ายังไม่อ่าน (`inbox/unread` รวม) · ทีม (คำเชิญรอรับ + ขอความช่วยเหลือค้าง) · โหลดครั้งเดียวต่อ foreground + หลัง action · ปุ่ม ? ทุกหน้า
- push deep-link ห้องลูกค้า: `data.link=/customers/<id>` + `?e=helper|handoff|sla|assigned` ⇒ เปิดห้อง + toast ตามเหตุ (handler S2.6 ขยาย)
- ทดสอบ 3 แชทไม่ปน (fixture `s2.20.json` + สคริปต์ `apps/mobile/qc/three-chats.mjs` ใช้ puppeteer เดียวกับ shoot-sec): (1) พิมพ์ใน `/customers/x1` ⇒ request ไป `inbox/conversations/x1/reply` เท่านั้น (2) พิมพ์ใน `/secretary/room/r1` ⇒ `secretary/rooms/r1/send` เท่านั้น (3) พิมพ์ใน `/chat/<id>` 1.0 ⇒ `mobile/chat/send` เดิม · summary JSON `three-chats.json` {ok:true} — ข้อสอบ X-4 ของผู้คุมอ่านไฟล์นี้ (เพิ่มตอนรับใบ)
- ภาพคู่ K1–K4 × 2 ธีม ครบ (ถ้า S2.17 ทำแล้วให้ยืนยันซ้ำ)
## Files you own
`apps/mobile/app.json` (userInterfaceStyle) · `app/(app)/secretary/_layout.tsx` (StatusBar) · `src/components/secretary/SecTopBar.tsx` (badges) · `src/lib/push-register.ts` (handler ขยาย) · `qc/three-chats.mjs` · fixture `s2.20.json` · แก้สีฝัง/ธีมในจอ S2 ใด ๆ ที่พบ (จดรายการ) · `ledger/wo-notes/sec-s2.13.md`
## Acceptance = ทุก spec S2 เขียว + `SPEC=s2.13.json` ×2 + `three-chats.json ok` + ภาพคู่มืดครบ (CP2 ผู้คุม/เจ้าของดู) · typecheck 0 · fitness ×2
## fix-forward จากการดูภาพคู่ (ผู้คุม 5 พ.ย.)
- D1 `/secretary/staff`: แถว "รอรับคำเชิญ" ท้ายรายการถูกปุ่ม "เพิ่มพนักงาน" ลอยทับ — ใส่ padding ล่างของรายการ = ความสูงปุ่ม + inset (แบบเดียวกับ A1 ของ S2.2)
- ตรวจทุกจอที่มีแถบ/ปุ่มลอยล่าง (A1 · A2 · A6 · K1 · K2 · D1 · H1) ว่า contentContainer padding พอ ทั้ง 2 ธีม
