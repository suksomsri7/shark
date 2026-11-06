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
