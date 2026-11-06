# S3a.6 — แปลภาษาในห้องแชทลูกค้า (เจ้าของสั่ง 7 พ.ย. 2569 "เริ่มทำต่อได้เลย") · S = server (เลน c) · A = แอป (เลน d) · ต่อจากทิปผู้คุมล่าสุด (merge SHA ตรง)
ของเดิมที่มีแล้ว (ห้ามเขียนซ้ำ): `src/lib/modules/chat/translate.ts` (`translateMessage` · `translateDraft` · กติกา W3 "กดแปล" · เครดิต CHAT_TRANSLATE · แคชใน ChatMessage.translatedBody/translatedLang · `guardTranslateEnabled` ตาม ChatSetting.translateEnabled · `ChatSetting.staffLang`) · `ai-suggest.ts` ร่างเป็นภาษาลูกค้า (`replyLang = contact.lang || staffLang`) · mobile route `inbox/conversations/[id]/ai-suggest` · DTO `src/lib/mobile/inbox-dto.ts`

## สัญญา server ↔ แอป (ล็อก · ทั้งสองเลนทำตามนี้)
1. DTO ข้อความ (read): เพิ่ม `translatedBody: string|null` · `translatedLang: string|null` · `needsTranslation: boolean` (IN เท่านั้น · body มีตัวอักษรที่ไม่ใช่สคริปต์ของ staffLang — th = ไม่มีอักษรไทยเลยและมีตัวอักษร ≥ 3 · ภาษาอื่นใช้หลักเดียวกันกลับด้าน) · DTO บทสนทนา: `staffLang` · `contactLang` · `can.translate` (= translateEnabled ∧ ผู้ใช้เห็นห้อง)
2. `POST inbox/conversations/[id]/messages/[mid]/translate` body `{targetLang?}` → `{ok:true, text, cached, lang}` | `{ok:false, reason}` (ไทย · 200 เสมอ fail-soft · 403 เฉพาะไม่เห็นห้อง · 429 ตาม RL เดิมของ inbox เขียน)
3. `POST inbox/conversations/[id]/translate-draft` body `{body, targetLang?}` → `{ok:true, text}` | `{ok:false, reason}` · targetLang ปริยาย = contactLang (ไม่มี ⇒ `en`)
4. `ai-suggest` response: options เพิ่ม `gloss: string|null` (คำแปลเป็น staffLang เมื่อ replyLang ≠ staffLang · ขอจากโมเดลในการเรียกเดียวกัน — ห้ามเรียกซ้ำ) + `replyLang` ระดับบน
5. ทุกอย่างหักเครดิตร้านเดิม (CHAT_TRANSLATE / CHAT_SUGGEST) · เครดิตหมด ⇒ `{ok:false, reason}` ไทย

## S (เลน c)
- route 2/3 ใหม่ + DTO ข้อ 1 + ai-suggest gloss ข้อ 4 (prompt: "If reply language ≠ <staffLang>, also give `gloss`: the same reply translated into <staffLang> for the staff") · parse ปลอดภัย (ไม่มี gloss ⇒ null) · บันทึก gloss ใน ChatAiSuggestion (คอลัมน์เดิม Json `sourcesUsed`? — ห้าม; ใช้ payload options ที่เก็บอยู่แล้วถ้ามี ไม่มี ⇒ ไม่เก็บ ไม่ migration)
- สิทธิ์: ด่านเดียวกับ ai-suggest route (เห็นห้อง + ระบบแชทเปิด) · PII ก่อนเข้าโมเดลใช้ตัวปิดเดิมของ R-Z24
- ข้อสอบ `scripts/qc-sec-s3a6-s.mts`: needsTranslation (ไทย/อังกฤษ/ญี่ปุ่น/อีโมจิล้วน/สั้นกว่า 3) · translate แคช (เรียก 2 ครั้ง = 1 charge) · translateEnabled=false ⇒ ok:false ไทย · ไม่เห็นห้อง 403 · translate-draft ปริยาย contactLang · ai-suggest gloss เมื่อ en/th และ null เมื่อ th/th (Scripted provider) · เครดิตหมด ⇒ ok:false · typecheck · fitness · docs `docs/api/SECRETARY-API.md` + `31-secretary.md` §แชทลูกค้า · wo-note `sec-s3a6-s.md`
## A (เลน d)
- หน้าห้องแชทลูกค้า (`apps/mobile/app/(app)/secretary/inbox.tsx` + คอมโพเนนต์ห้อง): ข้อความ IN ที่ `needsTranslation` ⇒ ปุ่มเล็ก "แปล" ใต้ฟอง → เรียก route 2 → แสดงคำแปลใต้ต้นฉบับ (ต้นฉบับยังเห็นเสมอ · ป้าย "คำแปล · <ภาษา>") · มีคำแปลอยู่แล้ว (translatedBody) ⇒ แสดงเลย ไม่มีปุ่ม
- การ์ด "Shark ร่างคำตอบ": ถ้า option มี `gloss` ⇒ แสดงบรรทัด "คำแปล: …" จาง ๆ ใต้ร่าง (ปุ่ม "ส่งข้อความนี้" ส่งตัวร่างภาษาลูกค้า ไม่ใช่ gloss)
- กล่องพิมพ์: เมื่อ `contactLang` ≠ `staffLang` และ `can.translate` ⇒ ปุ่ม "แปลแล้วส่ง" ข้างปุ่มส่ง → route 3 → แผ่นยืนยันแสดง ต้นฉบับ/คำแปล · ปุ่ม "ส่งคำแปล" (ส่ง text ที่แปล) · "แก้" (ใส่คำแปลลงกล่องพิมพ์) · "ยกเลิก"
- fail-soft: reason ไทยเป็น toast · ไม่มีสิทธิ์/ปิดฟีเจอร์ ⇒ ไม่แสดงปุ่ม · i18n th/en ครบ · testID ทุกปุ่มใหม่ · fixture spec `s3a6.json` (ห้อง en + ร่างมี gloss + ข้อความ IN อังกฤษ 1 ญี่ปุ่น 1) · ภาพคู่ G/ภาพ dark · `qc-sec-screen` + คลิกทะเบียนปุ่ม · mobile tsc 0 · wo-note `sec-s3a6-a.md`
- ทำได้ทันทีด้วย fixture ตามสัญญาข้างบนโดยไม่รอเลน c
