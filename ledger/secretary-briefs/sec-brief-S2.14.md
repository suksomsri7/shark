# S2-14 — S2.14 ปิด S2: ต่อ API จริง (ถอด mock/placeholder) · `expo export` สำเนา QC · ทะเบียนปุ่มครบ · ด่านเต็ม (Opus · `wip/sec-s2.14` · หลังทุกใบ S2 merge · **ด่านเต็ม** + ผู้ตรวจ 2 คน (UX ครบวงจร · ความปลอดภัยฝั่งแอป))
Read COMMON · ทุก `sec-brief-S2.*.md` + wo-notes · `docs/api/SECRETARY-API.md` · `apps/mobile/qc/README.md` · plan row S2.14 · ทุก spec `scripts/qc-sec-specs/*.json`.
## งาน
1. ถอดของที่ยังอ่าน fixture ตรง (`import fixture from "@/qc/fixtures/…"` ต้องเป็น 0 ไฟล์ในจอจริง — S0.2 placeholder ถูกแทนแล้วโดย S2.2) · ทุกจอเรียก `secretary-api.ts`/`inbox-api.ts` จริง · จัดการ loading/empty/error 3 สถานะทุกจอ (fixture แยกไฟล์ต่อสถานะ · ภาพเดี่ยว)
2. ทะเบียนปุ่ม: `apps/mobile/qc/buttons-sec.json` = ทุก testID ใน `app/(app)/secretary|customers|business/**` + `app/{login,signup,otp,phone}.tsx` ↔ action ที่กด (route/endpoint) · สคริปต์ `qc/click-sec.mjs` กดทุกปุ่มใน fixture แล้วจด request/route ที่เกิด → `clicks-sec.json` (ปุ่มที่กดแล้วไม่มีอะไรเกิด = แดง)
3. `expo export --platform web` ในสำเนา QC ผ่าน (มีแล้วใน shoot-sec) + `npx expo-doctor` ถ้ามี · typecheck 0 · ไม่มี `console.log` ในจอ S2 · ไม่มี TODO ค้างที่ไม่ได้จด
4. เอกสาร: `docs/modules/31-secretary.md` §6 ตารางจอ↔route↔endpoint ครบ · `ledger/SECRETARY-RUN.md` §5 สรุป S2 (ผู้คุมเขียน)
## ด่านเต็ม (ครั้งเดียว): ทุก spec S2 + `qc-sec-s2.1/s2.12` + `three-chats` + `clicks-sec` + ทุกชุด `qc-mobile-*` + `qc-sec-ui` ทุก route + typecheck ทั้ง repo + `next build` (iso) + fitness ×2 · ภาพคู่ทั้งชุด (สว่าง/มืด) ส่ง CP3 ให้เจ้าของดู
## Files you own
จอ S2 ทุกไฟล์ (เฉพาะถอด mock/เพิ่มสถานะ) · `qc/{buttons-sec.json,click-sec.mjs}` · docs §6 · `ledger/wo-notes/sec-s2.14.md`

## fix-forward จาก S2.13 (RESOLUTIONS §W · ผู้คุม 6 พ.ย.) — ทำในใบนี้ก่อนรันด่านเต็ม
- F1 แถบ/ปุ่มลอยล่างทุกจอ (ช่องพิมพ์ A1/A2/A4/H1/H2/K2 · ปุ่ม D1/G1/G2) พื้นหลังทึบ/เบลอตาม surface token — ข้อความการ์ดห้ามทะลุ (ทั้ง 2 ธีม · ถ่ายคู่ A1+D1+G2 ซ้ำ)
- F2 A6 แถวชิปตัวกรองพอดีจอ 390 (ชิปที่ 4 ต้องครบ) หรือเลื่อนได้แบบมีขอบจาง
- F3 K2 placeholder รูปลูกค้า = surface กลาง + ไอคอน (ไม่ใช่กล่องเขียวสด) · ระบุแหล่งที่มาของสีเดิมใน wo-note
- F4 แนบภาพ D1/G2 ตอนเลื่อนสุด (ทั้ง 2 ธีม) ใน wo-note
- ลบตาราง LevelGrid ฝั่งแอปใน G2 เมื่อ S1.14b merge แล้ว (server รับ `levels`+`chat` · ปฏิเสธ `sensitive_key`) — ถ้า S1.14b ยังไม่ merge ตอนเริ่มใบ ให้ทำท้ายสุดหลัง merge tip
- (จาก S1.14b · §X) `customers/[id]/info.tsx` แสดง `linkedMember.phoneMasked` (server ไม่ส่ง `phone` แล้ว) · K2: การ์ด "Shark ร่างคำตอบ" ใช้ `POST ai-suggest` ใหม่ (`ok:false` ⇒ ซ่อนการ์ด) และส่ง `suggestionId` ไปกับ reply เมื่อผู้ใช้ส่งจากร่าง · K3 ใช้ `conversation.can.*` ซ่อน/ปิดปุ่ม assign/setStatus/linkCustomer (แทนเดา role) · `conversation.tags` แสดงชิปแท็ก
