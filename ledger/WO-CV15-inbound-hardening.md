# WO-CV15 — ปิดช่องโหว่ขาเข้าของ API แชท (Fable ตรวจพบ 2 ก.ย. 2026 ระหว่างคุมสาย M/N) · สาย M ทำต่อหลัง WO-CV13

## F1 🔴 HIGH — ไฟล์แนบขาเข้ารับ URL อะไรก็ได้ → stored XSS / IP leak ในกล่องข้อความของทีม
- เส้น: `POST /api/v1/chat/messages` (โหมด widget = ผู้เยี่ยมชมทุกคนบน origin ที่อนุญาต · โหมด secret) → `toAttachments()` รับ `url` เป็นสตริงใด ๆ → `receiveExternalInbound` ไม่ตรวจ scheme/host → `bubble.tsx` วาด `<a href={a.url}>` / `<img src>` / `<audio src>`
- ผล: `url: "javascript:..."` = XSS เมื่อพนักงานกดไฟล์แนบ (React ไม่บล็อก href javascript:) · `http://attacker/...` = รั่ว IP/UA ของทีมทุกคนที่เปิดห้อง · เส้นเดียวกันโดน `receiveExternalReply` (`/api/v1/chat/replies`) และ `sendReply` เมื่อ attachments มาจาก API
- แก้ (2 ชั้น · ห้ามแก้แค่ชั้นเดียว):
  1. ชั้น 1 (service.ts): helper เดียว `sanitizeAttachmentUrl(url)` → ต้อง parse ได้ด้วย `new URL` · `protocol === "https:"` · host ไม่ใช่ localhost/IP ส่วนตัว/`.local`/`.internal` (กัน SSRF ของ worker/LINE อีกชั้น) · ยาว ≤ 2048 · ใช้ในทั้ง `receiveExternalInbound` · `receiveExternalReply` · `sendReply` (ตัวกรอง attachments ที่มีอยู่แล้วบรรทัด `filter((a) => a?.url?.trim() ...)` ให้ต่อด้วยตัวนี้) · ไฟล์ที่ไม่ผ่าน = ทิ้งทั้งข้อความพร้อม reason ไทย ("ลิงก์ไฟล์แนบต้องเป็น https") ไม่ใช่กรองเงียบ
  2. ชั้น 2 (bubble.tsx + VoiceBody): ก่อนวาง `href`/`src` ตรวจ `/^https:\/\//i` — ไม่ผ่านให้แสดงชื่อไฟล์เป็นข้อความธรรมดา (กันข้อมูลเก่าที่อยู่ใน DB แล้ว)
- ข้อสอบ additive ใน `scripts/qc-chat-security.mts` (หมวดใหม่ SEC-U): `javascript:` / `http://` / `https://127.0.0.1` / `https://10.0.0.1` / `https://foo.local` → ปฏิเสธพร้อม reason ไทย · `https://cdn.example/x.wav` ผ่าน · ทั้ง 3 ฟังก์ชัน · static: bubble.tsx ไม่มี `href={a.url}` เปล่าโดยไม่ผ่าน guard · **fail-before**

## F2 🟠 MEDIUM — `context` ถูก merge ลง `ChatConversation.meta` ทั้งก้อนโดยไม่กรองคีย์
- widget ส่ง `context: { autoTranslate: true }` ได้ → บังคับให้ร้านจ่ายค่าแปลทุกข้อความขาเข้าของห้องนั้น (D15 อ่าน `meta.autoTranslate`) โดยทีมไม่ได้กด · ทับ `tags`/คีย์ภายในอื่นได้ · ยัด JSON ขนาดใหญ่ไม่จำกัด (row bloat)
- แก้: whitelist คีย์ที่ SiamDive ใช้จริง (`siamdive2/src/lib/shark-chat.ts` SharkContext): `pageUrl · userAgent · country · lang · referrer` · ค่าต้องเป็น string ≤ 512 ตัวอักษร (null = ลบคีย์) · คีย์อื่นทิ้งเงียบ (ไม่ error — ผู้เรียกเดิมไม่พัง)
- ข้อสอบ SEC-U: `context:{autoTranslate:true, tags:["x"], pageUrl:"/trip/1"}` → meta มี pageUrl · ไม่มี autoTranslate/tags · ค่า 10,000 ตัวอักษรถูกตัด/ปฏิเสธ

## กติกา
เหมือน WO-CV13: ห้าม commit/push · ด่าน `pnpm typecheck` → `pnpm fitness` → `pnpm qc:all chat` · รายงานไทยพร้อมตัวเลข fail-before/after
