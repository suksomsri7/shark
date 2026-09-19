# WO C1.8 — เหตุการณ์ชุดเฟส C1 + consumer + สะพานเชื่อมโมดูล

> RUN "CRM v2" · 19 ก.ย. 2569 · ผู้คุมงาน Opus 5 · ข้อสอบ `qc-crm-c1.8` 81 ข้อ · probe-c18-review 32/32
> ORACLE-EDIT: C1.8-X4.12/X4.15 (lead/ส่วนลดต้อง retry ไม่หาย) · qc-form FM-3.3 · qc-forms-notify FN-4 (ระบายคิวก่อนอ่าน) · C1.4-S9.10 (briefFor ต้องมี actor) · C1.2b-X4.x (crmA = v2) · C0.2-S1.1/S2.3 (forms ไม่เรียก CRM แล้ว) · qc-member-m1.4 (fixture เลือกสมาชิกชนกัน — CRM-RUN §4)

## 1. สิ่งที่ส่งมอบ
- `src/lib/platform/crm-bridges/{index,core,forms,chat}.ts` + `crm-outbound.ts` (in-app เท่านั้น) · consumer ใน `outbox-consumers.ts` (บล็อก C1.8)
- ฟอร์ม → lead: ย้ายจากการเรียกตรงไปเป็น consumer (`scheduleDrain` ทันทีหลังส่ง) · **ร้าน v1 ยังได้ lead แบบเดิม** · v2: รวมซ้ำด้วยอีเมล/เบอร์ + กิจกรรมต่อการส่ง + UTM · ขั้น lead ล้มชั่วคราว ⇒ event ล้มเพื่อ retry (ไม่หาย ไม่ซ้ำ) · submission + event + แจ้งเตือนใน tx เดียว
- แชท → Party (เฉพาะ PERSON · ผ่าน facade แชท + audit) → lead เมื่อ `chatToLead` · ใบเสนอราคาตอบรับ → ย้ายขั้น · ออกใบแจ้งหนี้ → ผูก · member.created/merged → ผูก/ชี้ใหม่ · อนุมัติส่วนลด → ใช้ครั้งเดียว (retry ได้) · timeline สมาชิก 1 แถวต่อ event
- `crm.deal.won` payload เหลือแต่รหัส (แจ้งเจ้าของ Q6) · คีย์ legacy `#<dealId>` / v2 `#<histId>` คงเดิม
- สะพานทุกตัวทำงานเฉพาะ uiVersion 2 + `bridgesEnabled` (ยกเว้น lead ฟอร์ม v1 และ `onCrmDealWon`)

## 3. ด่าน
| # | ผล | หลักฐาน |
|---|---|---|
| D2 | ✅ | 81/81 (`.qc-shots/crm/c18-verify2.log`) |
| D3 | ✅ | X1/X3/X4/X8 ในข้อสอบ + probe 32/32 (ฉีดความล้มเหลว → retry · 2 โปรเซสเบอร์เดียวกัน → Party เดียว) |
| D4 | ✅ | C1.1–C1.7 · C0.2–C0.4 · form · forms-notify · chat-member-autolink · chat-core-v2 · automation · webhook · account-api-webhooks · approval · member (แดงเฉพาะภาพ/skill) · m1.4 = ต้นเหตุเป็น fixture ของข้อสอบ (แก้แล้ว 37/37 บนข้อมูลที่เคยแดง) |
| D5/D6 | ✅ | typecheck · fitness 29/29 ×2 · build (`c18-build.log`) |
| D7 | N-A | ไม่มีหน้าใหม่ · ร้าน v1: probe ประตู 14/14 + probe-c18 เส้นทาง v1 |
| D9 | ✅ | ไม่มี BLOCKER · ข้อ 1–4 ถอยหลังบน prod ร้าน v1 → แก้ครบ |
| D11 | ✅ | m1.9 26/26 |

## 8. หนี้
| เรื่อง | เจ้าของ |
|---|---|
| sync ชื่อ/เลขภาษี AccountContact ตาม `crm.company.updated` | C2.7 |
| `onCrmDealWon` อ่านตาราง CRM ตรง | C5 |
| `member.created` ส่งซ้ำ → WELCOME ซ้ำ (บั๊กเดิมฝั่งสมาชิก) | C5 |
| แชทเลือกระบบ CRM แรกเท่านั้น | C2.4 |

## 3.2 D12 — push/deploy
✅ push `526895b` (+ `4e0ebd7`) → session/crm + main · deploy ใหม่ `dpl_GjC8s…` ขึ้นหลัง 450 วิ · health ok · ⚠️ `outboxPending: 1` ค้างหลัง deploy (ตัวนับรวม PENDING ที่รอ retry ด้วย · คิวบน prod ระบายเฉพาะเมื่อมีการกระทำ + ตาข่ายรายวัน) · ผู้คุมงานไม่มีสิทธิ์อ่าน DB prod จึงดูรายละเอียดไม่ได้ · เฝ้า 30 นาที (ผลในบรรทัดถัดไป)
