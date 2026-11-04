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
