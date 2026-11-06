# WO S3a.6-S — แปลภาษาในห้องแชทลูกค้า (server) · เลน c

> RUN "เลขา AI" · ทรี `/root/projects/shark-sec-c` · branch `wip/sec-s3a1-s2` · merge ทิปผู้คุม `3bb9f0b60` (SHA ตรง) · 7 พ.ย. 2569 · builder Opus
> ใบ `ledger/secretary-briefs/sec-brief-S3a.6.md` (สัญญา server ↔ แอป ล็อก · ไม่เปลี่ยนชื่อฟิลด์/route) · ข้อสอบ `scripts/qc-sec-s3a6-s.mts` (ใหม่) · ไม่มี migration · ไม่เรียกโมเดลจริง

## 1. ไฟล์
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/mobile/inbox-dto.ts` | แก้ | `needsTranslation(body, staffLang)` (pure · ตัวอักษร `\p{L}` ≥ 3 และไม่มีอักษรของสคริปต์ภาษาทีม · th=Thai · ja=Hira/Kata/Han · zh · ko · ru · ar · my · lo · km · อื่น = Latin) · `messageDto(…, staffLang?)` + `translatedBody/translatedLang/needsTranslation` (IN · ไม่ใช่บันทึกภายใน · ไม่ถูกลบ) · `InboxConversationCan.translate` · detail + `staffLang/contactLang` |
| `src/app/api/mobile/inbox/conversations/[id]/route.ts` | แก้ | อ่าน ChatSetting (staffLang · translateEnabled) · `can.translate` = เปิดแปล ∧ คีย์ `chat.translate.use` (ห้องที่เห็นแล้ว) · ส่ง staffLang ให้ messageDto |
| `src/app/api/mobile/inbox/conversations/[id]/messages/[mid]/translate/route.ts` | ใหม่ | สัญญาข้อ 2 — ห่อ `translateMessage` · ข้อความต้องเป็นของห้องนี้ · ไม่เห็นห้อง/ข้อความ 403 · RL 30/นาที · ไม่มีคีย์/ปิดแปล/เครดิตหมด = 200 ok:false ไทย · `lang` = targetLang ∨ staffLang |
| `src/app/api/mobile/inbox/conversations/[id]/translate-draft/route.ts` | ใหม่ | สัญญาข้อ 3 — ห่อ `translateDraft` (ปลายทางปริยาย contactLang → en · ไม่ส่งเอง) |
| `src/lib/modules/chat/ai-suggest.ts` | แก้ | `systemPrompt(replyLang, staffLang)` ต่างภาษา ⇒ ขอ `gloss` ในรูป JSON เดียวกัน (เรียกเดียว) · ภาษาเดียวกัน = prompt เดิมทุกไบต์ · parse ปลอดภัย (ไม่มี ⇒ null) · `SuggestOption.gloss` (ภาษาเดียวกัน ⇒ null แม้โมเดลส่งมา) · `SuggestResult.replyLang` · `provider?` ฉีดได้ (ข้อสอบ) · gloss **ไม่เก็บ** (ChatAiSuggestion ไม่มีช่อง · ห้าม migration) |
| `src/app/api/mobile/inbox/conversations/[id]/ai-suggest/route.ts` | แก้ | options + `gloss` · ระดับบน + `replyLang` |
| `src/lib/modules/chat/pii-mask.ts` | ใหม่ | `maskChatText` ย้ายจาก ai-suggest (R-Z24) ให้ใช้ร่วม |
| `src/lib/modules/chat/translate.ts` | แก้ | `translateMessage` ปิดข้อมูลติดต่อของข้อความลูกค้าก่อนเข้าโมเดล (ต้นฉบับยังเห็นในห้อง) · `translateDraft` ไม่ปิด (ข้อความที่ทีมตั้งใจส่งลูกค้า) |
| `docs/api/SECRETARY-API.md` · `docs/modules/31-secretary.md` | แก้ | แถวเธรด/ai-suggest + 2 แถวใหม่ · หมายเหตุ K2 |

## 2. ต่างจากใบ/ตัดสินเอง
1. **สิทธิ์แปล**: เว็บใช้คีย์ `chat.translate.use` (มีค่าใช้จ่าย) ⇒ แอปใช้คีย์เดียวกัน: `can.translate` = เปิดแปล ∧ เห็นห้อง ∧ คีย์ (แคบกว่านิยามในสัญญาเล็กน้อย — ไม่มีคีย์ = แอปไม่แสดงปุ่ม) · route: ไม่มีคีย์ = 200 ok:false ไทย (ไม่ใช่ 403 — สัญญาให้ 403 เฉพาะไม่เห็นห้อง)
2. ด่านหน้า route แปล = `chat.conversation.read` (ไม่ใช่ `chat.ai.suggest` ของ route ai-suggest) — แปลเป็นงานของคนอ่านห้อง · ห้องที่มองไม่เห็นตอบ 403 ตามสัญญา (route ai-suggest เดิมตอบ 404 — ไม่แตะ)
3. PII: ปิดเฉพาะขาลูกค้า → ทีม (translateMessage) · ร่างของทีมไม่ปิด
4. คำแปลที่แคชไว้ก่อนใบนี้ (ไม่ปิด PII) ยังคืนตามเดิม

## 3. ผล
- `qc-sec-s3a6-s` **13/13** ×2 (residue 0): N-1 needsTranslation 9 กรณี · N-2 DTO เธรด · T-1 แคช (หัก 1) · T-2 403 สาขาอื่น · T-3 ปิดแปล ⇒ ok:false · D-1 ปริยาย contactLang/en · D-2 ไม่ส่งเอง · G-1/G-2/G-3 gloss (Scripted · เรียกเดียว) · G-4 route · C-1 เครดิตหมด ⇒ ok:false ไทย (แปล · แปลร่าง · ai-suggest)
- regression: qc-sec-s1.14b 24/24 · s1.14c 12/12 · qc-chat-ai-suggest 44/44 · qc-chat-translate 34/34 · qc-sec-s3a1-s2 28/28 · s1.21 19/19
- typecheck 0 · fitness pre-commit ✅ · no-DB 53/53

## รอบ 2 (R-Z61 · merge ทิปผู้คุม 35da5c0ac ด้วย SHA ตรง ⇒ 863286843)
| ไฟล์ | สิ่งที่ทำ |
|---|---|
| `src/lib/modules/chat/lang.ts` (ใหม่ · pure) | **M1** `LANG_NAME` (export) · `LANG_ALIAS {zh: "cn"}` · `normalizeLang` จุดเดียว (zh/zh-TW/ZH ⇒ cn) · `isKnownLang` |
| `src/lib/modules/chat/translate.ts` | ย้าย LANG_NAME/normalizeLang ไป lang.ts แล้ว re-export · แคช: `normalizeLang(msg.translatedLang) === target` (แคชเก่า "zh" ยังใช้ได้) |
| `src/lib/mobile/inbox-dto.ts` | normalizeLang จาก lang.ts (inbox-dto ยัง pure) · `SCRIPT_OF.cn` = Han · **M2** `needsTranslation` ตัด `/https?:\/\/\S+\|www\.\S+\|\S+@\S+\|[#@]\S+/gu` ก่อนนับ |
| `src/lib/modules/chat/ai-suggest.ts` | เทียบภาษาหลัง normalize ทั้งสองฝั่ง · **gloss ขอเฉพาะร้านเปิด `translateEnabled`** · `maxTokens` 2000 เมื่อขอ gloss (ไม่ขอ = 1200 เดิม) · ชื่อภาษาใน prompt จาก `LANG_NAME` · `replyLang` คืนค่าที่ normalize แล้วทุกครั้ง |
| route translate · translate-draft | `targetLang` ต้อง `isKnownLang` ไม่งั้น 422 |
| docs `31-secretary.md` · `SECRETARY-API.md` | replyLang คืนทุกครั้ง · gloss เฉพาะเปิดแปล · zh ≡ cn · targetLang คีย์ใน LANG_NAME · needsTranslation ตัดลิงก์ |
| `scripts/qc-sec-s3a6-s.mts` | 13 ⇒ 22 ข้อ (ดูผล) |

ตัดสินเอง:
1. **"OK ka" (staff th) ⇒ true** — ตัวอักษรละตินจริง 4 ตัว ไม่มีอักษรไทย (คำทับศัพท์ที่พิมพ์เป็นละตินถือว่าต่างสคริปต์ · ปุ่มแปลโผล่ได้ ราคาถูกและกดเองเท่านั้น)
2. "mail me at abc@example.com" ⇒ true (เหลือ "mail me at") · อีเมล/ลิงก์ล้วน ⇒ false
3. prompt ยังใช้ `replyLang` ดิบในประโยค "customer's language (…)" เพื่อให้ prompt ไม่ขอ gloss เท่าเดิมทุกไบต์ (normalize ใช้เฉพาะการเทียบ/ค่าที่คืน)
4. ข้อสอบ prompt: G-6 = prompt ต่างภาษาเท่ากับ prompt ห้องเดียวกันตอนร้านปิดแปล + แทนรูป JSON + ประโยค gloss เท่านั้น (เทียบสตริงตรง) · G-2 = ภาษาเดียวกันเท่ากับ base (ต่างแค่รหัสภาษา) · ไม่มีคำว่า gloss

ข้อสอบใหม่: N-1 (+9 กรณี ลิงก์/www/#@/อีเมล/OK ka/cn/zh/zh-TW) · N-3 normalizeLang/isKnownLang · T-4 PII ปิดก่อนแปล (ไม่มี 0812345678 · มี ••••••••78 · ต้นฉบับยังเต็ม) · T-5 mid ห้องอื่น 403 + translate-draft ห้องที่ไม่เห็น 403 · T-6 ไม่มีคีย์ ⇒ can.translate=false + 200 ok:false · T-7 targetLang xx ⇒ 422 · zh ⇒ lang cn · T-8 ร้านปิด ⇒ can.translate=false · G-5 ร้านปิดแปลไม่ขอ gloss (maxTokens 1200) · G-1 +maxTokens 2000 + prompt Thai · G-6 prompt ต่างภาษา · R-1 ครั้งที่ 31 ⇒ 429 · C-1 + calls 0

ผลรอบ 2: `qc-sec-s3a6-s` **22/22** ×3 (residue 0) · regression: s1.14b 24/24 · s1.14c 12/12 · qc-chat-ai-suggest 44/44 · qc-chat-translate 34/34 (×2) · s3a1-s2 28/28 · s1.21 19/19 · typecheck 0 · fitness no-DB 53/53
