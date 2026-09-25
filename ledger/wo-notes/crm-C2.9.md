# WO C2.9 — เหตุการณ์ธุรกิจ 8 โมดูล → ไทม์ไลน์ CRM

> RUN "CRM v2" · builder `/root/projects/shark-crm-c23` (QC3) · รวมทรีหลัก `session/crm` 25 ก.ย. 04:00 UTC · builder 3 รอบ (opus · รอบ 2 = item-5 no-POS pre-gate · รอบ 3 = F1–F4/N5/N8/N9 จากผู้ตรวจอิสระ) · ผู้เขียนข้อสอบแยกตัว (opus) เพิ่ม S10.4–S10.8
> สัญญา: CRM-RUN §2 C2.9 · brief C2.9 (19 ข้อยืนยัน + มติรอบ 2 F1–F4) · มติ C11 (event ใหม่ 6 ตัวยิง **ใน tx** ของโมดูลเจ้าของ) · R-C.8 คีย์ `<type>#<id>` · R-E.17 CRM อ่านแต่ id · ไม่มี migration · ไม่มี UI ใหม่ (ไม่มี mockup)
> ข้อสอบ: `scripts/qc-crm-c2.9.mts` (**52 ข้อ** = 47 + ORACLE-EDIT 5 ข้อ S10.4–S10.8 · S0 4 · S1–S8 24 (8 โมดูล × 3: emit ใน tx พิสูจน์ด้วย fault จริงบน OutboxEvent · 3 ทะเบียน · ผล CRM) · S9 3 · S10 8 · X1 3 · X4 2 + COMPOSE 1 · X8 3 · U 3 · CLEAN) · `at` ตัดจากสัญญา `markCustomerFromBridge` (มติ 25 ก.ย.)

## 1. ไฟล์ที่แตะ (13 ไฟล์ · +487/−58)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `crm-bridges/business.ts` (+159) | ใหม่ | ตัวรับ **ตัวเดียว** `onBusinessEvent` ทั้ง 8 ชนิด: spec ต่อ event (idField · load แถวจริงในร้าน · title · refType) → Party (canonical) → ผู้ติดต่อทุกระบบ CRM ที่เปิด (`take 80`) → `recordBusinessActivityOnce` + `markCustomerFromBridge` · partyId null = WARN ids-only (re-emit → C6.1 party-links) · ระบบหนึ่งล้มไม่กลืนระบบอื่น |
| `crm/activities.ts` (+63) | แก้ | `recordBusinessActivityOnce` — VISIT ใบเดียวต่อ `sourceRef` (`<type>:<rowId>`) ต่อระบบ · `resolveSystem` ก่อนเขียน (X1 door parity — N8) |
| `crm/contacts.ts` (+56) | แก้ | `markCustomerFromBridge({contactId})` — `BRIDGE_PROMOTABLE_STAGES` derive จาก `canAdvanceLifecycle` (F3) · อ่าน before ใน tx เดียว → audit มี before (F2) · `newSeq()` ทุกครั้ง ⇒ win-back ไม่ถูกคิวกลืน (F1) |
| `ticket/service.ts` `rental/service.ts` `school/service.ts` `hotel/service.ts` `clinic/service.ts` `queue/service.ts` | แก้ | ยิง `ticket.order.paid` · `rental.returned` · `school.enrolled` · `hotel.checked_out` · `clinic.visit.done` · `queue.served` **ใน tx เดียวกับการเปลี่ยนสถานะ** · rental/school/clinic: ไม่มี POS = โยนไทยก่อนแตะสถานะ (item 5) |
| `outbox-consumers.ts` (+23) | แก้ | consumer 6 ตัวใหม่ (no-op + `onBusinessEvent` ใต้ compose) · `booking.completed` / `shop.order.paid` ต่อ `onBusinessEvent` **ท้ายสุด** (สแตมป์/สมาชิกวิ่งก่อนเหมือนเดิม) · `booking.no_show` ไม่ต่อ |
| `automation/labels.ts` (+19) · `webhooks/labels.ts` (+2) · `crm-bridges/index.ts` (+5) | แก้ | ทะเบียน event 6 ตัว (ป้ายไทย · เว็บฮุคจาก spread · ไม่เข้า `CRM_RULE_TRIGGERS`) · export ตัวรับ |

## 2. migration / seed / backfill — ไม่มี · ไม่มี catch-up ของแถวก่อน v2 (Q8)

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด · เคยแดง | ✅ | รอบ 1 45/47 (X4.1/X4.2 fixture ชนทรัพยากร → ORACLE-EDIT own asset/room) · รอบ 2 47/47 · รอบ 3 52/52 |
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ⏳ | unit `crm-c28c29-verify` (QC1) — §5 |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ⏳ | §5 |
| D5 | typecheck · fitness ×2 | ⏳ | §5 (builder: typecheck clean · fitness 32/32 ×2) |
| D6 | build | ⏳ | §5 |
| D7 | ภาพ + PARITY | N-A | ไม่มี UI ใหม่ (กิจกรรม VISIT ขึ้นในไทม์ไลน์ C1.4 เดิม) |
| D8 | testid + ทะเบียน | N-A | ไม่มี control ใหม่ |
| D9 | ผู้ตรวจอิสระ | ✅ | ผู้ตรวจ read-only (opus) รอบ 2: F1 seq คงที่ = win-back เงียบ (**BLOCKER** · probe ก่อน 7/10 → หลัง 10/10) · F2 audit ไม่มี before · F3 stage set ซ้ำ · F4 partyId null เงียบ · N5/N8/N9 — แก้ครบ |
| D10 | เอกสาร/ทะเบียน | ✅ | event 6 ตัวมี consumer + ป้าย · ไม่มี op ใหม่ · `gen-crm-api-docs` ใน unit |
| D11 | wo-notes + คืนสภาพ | ⏳ | `qc-member-m1.9` ใน unit |
| D12 | push → deploy | ⏳ | รอเจ้าของ push (เติม hash + dpl หลัง deploy) |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 | ใช้ | `X1.1–X1.3` (แถวต้นทางข้ามร้าน/ระบบ · load ในร้านของ event · door parity ทั้ง 2 writer) |
| X2 | N-A | REST → C2.11 |
| X3 | N-A | ไม่มีตัวนับร่วม (ใบเดียวต่อ sourceRef กันด้วย unique/NOT EXISTS ใน tx) |
| X4 | ใช้ | `X4.1–X4.2` + `COMPOSE.1` (replay ทุกชนิด = VISIT ใบเดียว · consumer ล้ม = WARN ไม่ล้ม event) |
| X5 | N-A | ไม่มีงานตามเวลา |
| X6 | N-A | ไม่มีจำนวนเงินที่ CRM เขียน (อ่านสตางค์จาก payload เป็นข้อมูลอ้างอิง) |
| X7 | N-A | ไม่มี endpoint สาธารณะ |
| X8 | ใช้ | `X8.1–X8.3` (payload id+สตางค์ · clinic ไม่มีอาการ/ยา · WARN id ล้วน) |
| X9 | ใช้ | `S10.x` (audit ขั้นลูกค้า actor SYSTEM มี before/after) |
| X10 | N-A | ไม่มี |
| ร้าน uiVersion 1 | ใช้ | `U.1–U.3` (event ยัง DONE · สะพานไม่เขียน · ไม่โยน) |

## 5. ผลข้อสอบ
_(รอ unit `crm-c28c29-verify` บน QC1 — เติมหลังรัน)_
