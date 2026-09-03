# WO-CV14 — (ก) `.wav` ในหน้าต่างแนบไฟล์ + (ข) หน้าตั้งค่าที่อยู่/แผนที่สาขา (ปิด D14) · Fable สั่ง 2 ก.ย. 2026 · สาย N (Opus 5)

ทำงานใน worktree `/root/projects/shark-chat-b` (branch `session/chat-b` · node_modules เป็น symlink ไปตัวหลัก · .env คัดลอกแล้ว)
อ่านก่อน: `CLAUDE.md` · `ledger/PLAN-CHAT-V2.md` §10 D14 · `src/lib/modules/chat/composer.tsx` (input accept ~บรรทัด 105–116, 436–475) ·
`inbox-client.tsx` `addFiles` (~457) · `src/lib/storage/service.ts` (ALLOWED_TYPES / normalizeUploadType) · `room-actions.ts` `shopLocationAction` (~213–280) ·
`src/app/app/settings/branding/{page,actions}.ts(x)` (แบบอย่าง server action + สิทธิ์) · `src/app/app/settings/systems/page.tsx` · `src/lib/core/permissions.ts`

🔴 ห้ามแตะ: `service.ts` · `adapter.ts` · `line.ts` · `bubble.tsx` · `inbox-actions.ts` · `scripts/voice-transcode-worker.mts` · `qc-chat-v2-voice.mts` (สาย M ถืออยู่บน main)

## (ก) `.wav` ในหน้าต่างแนบไฟล์
ปัญหาที่พบจากการอ่านโค้ด: (1) `<input accept>` เป็น MIME ล้วน — OS/เบราว์เซอร์ที่จับคู่ด้วยนามสกุล (Windows/GTK/Android) อาจไม่ให้เลือก `.wav`/`.m4a`
(2) `addFiles` ตรวจแค่ขนาด **ไม่ตรวจชนิด** ทั้งที่คอมเมนต์ในคอมโพเนนต์บอกว่า "ตรวจขนาด/ชนิดก่อนอัปที่ตัวแม่" ⇒ ไฟล์ผิดชนิดรู้หลังอัปเสร็จ (ผิดกติกา "ตรวจก่อนอัป")
(3) ไฟล์ `.wav` บางเครื่อง `File.type` ว่าง/`audio/wave`/`audio/vnd.wave` → ต้องอนุมานจากนามสกุล
- A1 `accept` ของช่อง "ไฟล์" = MIME ทั้งทะเบียน **+ นามสกุล** (`.wav,.m4a,.pdf,…` สร้างจากค่าใน ALLOWED_UPLOAD_TYPES ไม่พิมพ์มือ) · ช่องรูป/กล้อง = image MIME + นามสกุลรูป
- A2 `addFiles`: ตรวจชนิดก่อนรับเข้า list — normalize ด้วย `normalizeUploadType` · ถ้า `type` ว่างหรือไม่อยู่ในทะเบียน ให้อนุมานจากนามสกุล (reverse map ของ ALLOWED_UPLOAD_TYPES + alias `audio/wave`/`audio/vnd.wave`→`audio/wav`) · ไม่ผ่าน → ข้อความไทยบอกชนิดที่รับ ไม่โทษผู้ใช้ · เซิร์ฟเวอร์ยังตรวจเหมือนเดิม (ห้ามลดด่านฝั่งเซิร์ฟเวอร์)
  - ถ้าอนุมานชนิดได้แต่ `File.type` เดิมว่าง ต้องส่ง mime ที่อนุมานขึ้นไปด้วย (ดู `sendReplyAction` ว่าอ่าน type จากไหน — ถ้าอ่านจาก `file.type` ตรง ๆ ให้ห่อเป็น `new File([f], f.name, { type })`)
- A3 ตรวจเส้นทาง "wav ที่แนบเป็นไฟล์ (ไม่มี durationMs)" ทั้งขาส่ง (`sendReplyAction` → sendReply) ว่ายังเป็น FILE ไม่กลายเป็นข้อความเสียง และอัปด้วยนามสกุล `.wav` จริง — รายงานผล (อ่านอย่างเดียว ห้ามแก้ service.ts)
- A4 ข้อสอบ additive ใน `scripts/qc-chat-v2-composer.mts` (หมวดใหม่ CM-W): accept มี `.wav`+`audio/wav` · สร้างจากทะเบียนไม่พิมพ์มือ · addFiles ปฏิเสธชนิดนอกทะเบียนพร้อมข้อความไทย · อนุมานชนิดจากนามสกุลเมื่อ type ว่าง · **fail-before** (รันก่อนแก้ต้องแดง)

## (ข) หน้าตั้งค่าที่อยู่/แผนที่สาขา (D14)
วันนี้ปุ่ม "แผนที่ร้าน" ในแชทอ่าน `BusinessUnit.settings.{address,mapUrl,lat,lng}` แต่ **ไม่มีหน้าไหนให้กรอก** — ต้องสร้าง
- B1 หน้าใหม่ `src/app/app/settings/units/[unitId]/page.tsx` "ตั้งค่าสาขา: {ชื่อ}" หัวข้อ "ที่อยู่และแผนที่" — ช่อง: ที่อยู่ (textarea ≤500) · ลิงก์แผนที่ (https เท่านั้น) · ละติจูด/ลองจิจูด (ตัวเลข -90..90 / -180..180 · ต้องกรอกคู่หรือไม่กรอกเลย) · แสดงตัวอย่างลิงก์ที่ลูกค้าจะได้รับ (ตรรกะเดียวกับ shopLocationAction: mapUrl > lat/lng > address) · ปุ่มบันทึก · ข้อความสำเร็จ/ผิดพลาด inline (ห้าม alert)
  - UI ใช้คอมโพเนนต์กลางที่หน้า branding ใช้ (PageHeader/Section/ปุ่ม class เดิม) ให้กลมกลืน · ไทยล้วนเหมือนหลังบ้านหน้าอื่น
- B2 action `src/app/app/settings/units/[unitId]/actions.ts` (`"use server"` · แบบ branding/actions.ts): tenantId จาก session เท่านั้น · หา unit ด้วย `{ id, tenantId }` ไม่พบ = error ไทย · **read-modify-write เก็บคีย์อื่นใน settings ไว้ครบ** · validate ตามข้างบน · `mapUrl` ต้องขึ้นต้น `https://` (กัน `javascript:`) · `revalidatePath` หน้าเดิม
  - สิทธิ์: เพิ่มคีย์ใหม่ใน `src/lib/core/permissions.ts` module `systems`: `"systems.unit.update": "แก้ที่อยู่/แผนที่/ข้อมูลสาขา"` (ไฟล์กลาง — แตะเฉพาะบรรทัดนี้ · ถ้ามีข้อสอบล็อกจำนวนคีย์/snapshot ให้ขยายแบบ additive) · OWNER/MANAGER ผ่านตามกติกา assertCan เดิม
- B3 ทางเข้า: `settings/systems/page.tsx` แถว business unit เพิ่มลิงก์ "ตั้งค่าสาขา" → `/app/settings/units/${id}` · `room-actions.ts` ข้อความ reason ตอนยังไม่ตั้ง → ชี้ทางว่า "ตั้งค่า → จัดการระบบ → ตั้งค่าสาขา" (ห้ามแตะตรรกะอื่นในไฟล์นี้)
- B4 ข้อสอบใหม่ `scripts/qc-unit-location.mts` (ดูแบบจากข้อสอบที่ใกล้ที่สุด เช่น qc-branding* หรือ harness fake prisma ของ qc-chat-core-v2): บันทึกถูก → settings merge คีย์เดิมอยู่ครบ · lat ไม่มี lng → error · lat 91 → error · mapUrl `javascript:` และ `http://` → ปฏิเสธ · unit ของ tenant อื่น → ไม่พบ · STAFF ไม่มีคีย์ → assertCan โยน · หลังบันทึก `shopLocationAction` คืนลิงก์ (ถ้า harness เอื้อม — ไม่ได้ให้บอก) · ไม่มีวันที่ฮาร์ดโค้ด · **fail-before**
- B5 `ledger/PLAN-CHAT-V2.md` D14 → ✅ (บอกหน้าที่สร้าง) · ห้ามแตะ RESUME.md

## ด่านก่อนส่งรายงาน (ใน worktree นี้ · ผ่าน pnpm script ที่มี with-gate-lock)
`pnpm typecheck` → `pnpm fitness` → `pnpm qc:all chat-v2-composer chat-attachments chat-inbox-ui unit-location permission rbac nav-functions systems` (ชื่อไหนไม่มีให้ข้าม แต่บอกในรายงาน)
ห้าม `pnpm build`/`qc:all` เต็ม · ห้าม commit/push/deploy (Fable ทำ) · ห้ามสร้าง migration

## รายงาน (ภาษาไทย) ต้องมี
ไฟล์ที่แตะ · ผลด่านเป็นตัวเลข · fail-before/after · ผลตรวจ A3 · สิ่งที่ตัดสินใจเองนอกใบสั่ง · ของที่ทำไม่ได้พร้อมเหตุผล
