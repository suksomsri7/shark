# WO S3a.6-A — แปลภาษาในห้องแชทลูกค้า (แอป · เลน d)

> RUN "เลขา AI" · tree ผู้คุม `/root/projects/shark-sec` · เลน d `/root/projects/shark-sec-d` branch `wip/sec-s3a6-a` (แตกจาก `wip/sec-s3a1-a` ec972cdc + merge ทิปผู้คุม `3bb9f0b6` ด้วย SHA ตรง) · 2026-11-07 · builder Opus
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S3a.6.md` ส่วน A + "สัญญา server ↔ แอป" (ข้อ 1–5) · ทำด้วย fixture ตามสัญญา (เลน c ทำ server ขนาน) · ไม่แตะ server · ไม่ push

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ดูภาพ + ยืนยันจุดสัญญา §5 กับเลน c)

## 1. ไฟล์ที่แตะ
| ไฟล์ | ทำอะไร |
|---|---|
| `apps/mobile/src/api/inbox.ts` | DTO ตามสัญญาข้อ 1/4: `MsgItem.translatedBody/translatedLang/needsTranslation` · `ConvDetail.staffLang/contactLang` · `ConvCan.translate` · `SuggestOption.gloss` · `SuggestRes.replyLang` · `TranslateRes` · เส้น `inbox/conversations/[id]/translate-draft` (ข้อ 3) · `inboxTranslateMessage(convId, mid, body)` = POST `…/messages/[mid]/translate` (ข้อ 2 · 2 พารามิเตอร์) |
| `apps/mobile/app/(app)/customers/[id]/index.tsx` | จอห้องแชทลูกค้า K2 (ดู §6 ข้อ 1): ปุ่มแปลใต้ฟอง IN · คำแปลใต้ต้นฉบับ · บรรทัด gloss ในการ์ดร่าง · ปุ่ม "แปลแล้วส่ง" ในแถบพิมพ์ · แผ่นยืนยัน ต้นฉบับ/คำแปล · fail-soft · testID ทุกชิ้นอยู่ในไฟล์จอ (ทะเบียนปุ่มเห็น) |
| `apps/mobile/src/components/customers/MessageBubble.tsx` | prop `inFooter` (ใต้ฟอง IN · จอวาดเอง) |
| `apps/mobile/src/components/airy/InputBar.tsx` | prop `right` (ชิ้นส่วนหน้าปุ่มส่ง · ไม่ใส่ = เหมือนเดิม) |
| `apps/mobile/src/i18n/{th,en}.ts` | +12 คีย์ `cust.tr.*` + 17 คีย์ `cust.lang.*` (th/en เท่ากัน · en ไม่มีอักษรไทย) |
| `apps/mobile/qc/fixtures/secretary/s3a6.json` | ใหม่: ห้อง x9 เว็บแชท Emily (contactLang en · staffLang th · can.translate) · IN อังกฤษ (needsTranslation · ยังไม่แปล) · OUT อังกฤษ · IN ญี่ปุ่น (มี translatedBody) · ร่างอังกฤษ + gloss ไทย · translate/translate-draft ok:true |
| `apps/mobile/qc/fixtures/secretary/s3a6-fail.json` | ใหม่ (`routes`): translate/translate-draft ตอบ 200 `{ok:false, reason}` ไทย |
| `scripts/qc-sec-specs/s3a6.json` | ใหม่ (builder เขียน — ใบสั่งให้ทำ "fixture spec s3a6.json" · ผู้คุมตรวจ/แก้ได้): route `/customers/x9` testID ใหม่ 10 ตัว + ภาพคู่ · X-1..X-4 |
| `apps/mobile/qc/click-sec.mjs` | SCENARIOS + `["s3a6.json", "/customers/x9"]` |
| `apps/mobile/qc/buttons-sec.json` | `--registry` ใหม่: 453 testID (+10) |
| `apps/mobile/qc/shots-sec/**` | `customers-x9{,-dark}.png` + summary · ภาพคู่ K2 · `s3a6-interaction/` |

## 2. พฤติกรรม
- ฟอง IN: มีคำแปล (ขอในจอนี้ หรือ `translatedBody` จาก server) ⇒ กล่อง `cust-bubble-translation` "คำแปล · <ภาษา>" + ข้อความ ใต้ฟอง (ต้นฉบับยังอยู่) · ไม่มี + `needsTranslation` + `can.translate === true` ⇒ ปุ่ม `cust-bubble-translate` "แปล" → POST `…/messages/[mid]/translate {systemId}` (ไม่ส่ง targetLang · server ใช้ staffLang) · ทีละข้อความ (ref) · ok:false ⇒ `reason` ไทยในแถบแจ้งของห้อง (`cust-room-note`) · ล้ม ⇒ ข้อความ server หรือ `cust.tr.fail` · ป้ายภาษา = `lang` ของผล (ไม่มี ⇒ staffLang) แปลงเป็นชื่อด้วย `cust.lang.<code>`
- การ์ดร่าง: `gloss` ⇒ `cust-draft-gloss` "คำแปล: …" สีจาง · "ส่งข้อความนี้" ส่ง `body` (ภาษาลูกค้า) + suggestionId เดิม — gloss ไม่ถูกส่ง
- แถบพิมพ์: `can.translate === true` ∧ contactLang ∧ staffLang ∧ ต่างกัน ∧ ไม่อยู่โหมดบันทึกภายใน ⇒ ปุ่ม `cust-translate-send` "แปลแล้วส่ง" (ปิดเมื่อช่องว่าง/กำลังส่ง/กำลังแปล) → POST `…/translate-draft {systemId, body, targetLang: contactLang}` → แผ่น `cust-tr-sheet`: `cust-tr-original` (ที่พิมพ์) · `cust-tr-text` (คำแปล "ลูกค้าจะได้รับข้อความนี้") · `cust-tr-send` "ส่งคำแปล" (ทางส่งเดิม `Composer.run` · clientMessageId · สำเร็จ = ปิดแผ่น + ล้างช่อง) · `cust-tr-edit` "แก้" (ใส่คำแปลลงช่องพิมพ์ · ปิดแผ่น) · `cust-tr-cancel` · ok:false ⇒ reason ไทยใน `cust-send-note` (ข้อความที่พิมพ์ยังอยู่)
- ไม่มีสิทธิ์/ปิดฟีเจอร์ (`can.translate` ไม่ใช่ true) ⇒ ไม่มีปุ่มแปลทั้งสองแบบ (คำแปลที่ server แคชไว้ยังแสดง)

## 3. ผลกดจริง (`apps/mobile/qc/shots-sec/s3a6-interaction/result.json` · สคริปต์ `README-click.mjs.txt` · ไม่มี _ERROR)
- ก่อน: ปุ่มแปล 1 (อังกฤษ) · คำแปล 1 (ญี่ปุ่น แคช) · gloss แสดง · กดแปล 2 ครั้งติด ⇒ POST 1 ครั้ง body `{"systemId":"cs1"}` (x-tenant-id t1) ⇒ ปุ่มหาย คำแปล 2 กล่อง
- การ์ดร่าง "ส่ง" ⇒ reply body = ร่างอังกฤษ + suggestionId sg9
- แปลแล้วส่ง: ช่องว่าง = ปุ่มปิด · พิมพ์แล้วกด 2 ครั้ง ⇒ POST translate-draft 1 ครั้ง `{"systemId":"cs1","body":"ส่งได้วันพุธค่ะ…","targetLang":"en"}` ⇒ แผ่นเปิด ต้นฉบับ/คำแปลถูก · ส่งคำแปล ⇒ reply body = คำแปล · แผ่นปิด · ช่องว่าง · แก้ ⇒ ช่อง = คำแปล ไม่มี reply · ยกเลิก ⇒ ไม่มี reply
- fail-soft (s3a6-fail): แปลข้อความ ⇒ แถบ "เครดิตแปลภาษาของร้านหมดแล้วเดือนนี้" ปุ่มยังอยู่ · แปลร่าง ⇒ "ร้านปิดการแปลภาษาในแชทอยู่" ไม่เปิดแผ่น ข้อความที่พิมพ์ยังอยู่
- can.translate=false ⇒ ไม่มีปุ่มแปล/แปลแล้วส่ง (คำแปลแคชยังเห็น) · contactLang = staffLang ⇒ ไม่มี "แปลแล้วส่ง" (ปุ่มแปลข้อความยังมี)

## 4. ภาพ
- ภาพคู่ K2 (`sec-k.jpg`/`sec-dark-k.jpg` หน้า 2 — แบบไม่มีส่วนแปล ใช้เทียบโครงห้อง): `apps/mobile/qc/shots-sec/customers-x9-k2-pair.png` · `customers-x9-dark-k2-pair.png`
- ภาพเดี่ยว: `apps/mobile/qc/shots-sec/customers-x9{,-dark}.png` (summary ok · overflow false · unmocked [])
- ขั้นต่าง ๆ: `s3a6-interaction/s3a6-1-translated.png` (คำแปลใต้ต้นฉบับ 2 ภาษา) · `s3a6-2-sheet.png` / `-dark` (แผ่นยืนยัน) · `s3a6-3-failsoft.png`

## 5. ผลข้อสอบ
(เติมด้านล่าง)

## 6. ต่างจากใบ / คำถาม
1. ใบเขียน "หน้าห้องแชทลูกค้า (`secretary/inbox.tsx` + คอมโพเนนต์ห้อง)" — `secretary/inbox.tsx` คือกล่องรวมรออนุมัติ (A6) · ห้องแชทลูกค้าจริงคือ `app/(app)/customers/[id]/index.tsx` (K2) จึงทำที่นั่น
2. body ของ translate/translate-draft ส่ง `systemId` ด้วย (ทุกเส้น inbox รับ `systemId?` แบบ strict เพื่อหาระบบแชท) — สัญญาเขียน `{targetLang?}` / `{body, targetLang?}` ⇒ ขอเลน c รับ `systemId?` (ถ้า zod strict ไม่รับ จะได้ 400)
3. แปลข้อความไม่ส่ง targetLang (ปริยายฝั่ง server = staffLang) · แปลร่างส่ง `targetLang = contactLang` ชัดเจน
4. ปุ่ม "แปลแล้วส่ง" เป็นชิปเล็กในแถบพิมพ์หน้าปุ่มส่ง (InputBar prop `right`) · ซ่อนในโหมดบันทึกภายใน
5. spec `s3a6.json` เขียนโดย builder (ไม่มีของผู้คุมในทรี) — ผู้คุมปรับได้
