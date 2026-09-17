# WO C0.3 — facade ของอีก 6 โมดูลที่ CRM ต้องใช้ (บัญชี · แชท · HR · คลังสินค้า · party · ระบบอนุมัติ)

> RUN "CRM v2" · worktree `/root/projects/shark-crm` · branch `session/crm` · 17 ก.ย. 2569 · ผู้คุมงาน: Opus 5
> builder 2 ตัวทำขนาน (ไฟล์ไม่ทับกัน): **ตัวที่ 1** = A บัญชี + F ระบบอนุมัติ + `ALLOWED_EDGES` · **ตัวที่ 2** = B แชท · C HR · D คลัง · E party
> ผู้เขียนข้อสอบ + ผู้ตรวจ = ตัวแทนแยกคนละตัว · สัญญา: `ledger/crm-briefs/crm-brief-C0.3.md` (+ addendum + ข้อตัดสิน 8 ข้อ)
> ข้อสอบ: `scripts/qc-crm-c0.3.mts` (88 ข้อ · commit `ad143c6` · **ไม่ถูกแก้เลยหลัง commit** — ยืนยันด้วย `git diff ad143c6 99b99d3 -- scripts/qc-crm-c0.3.mts` = ว่าง)

## 1. ไฟล์ที่แตะ (23 ไฟล์ · +1713 −715)
| ส่วน | ไฟล์ | ทำอะไร |
|---|---|---|
| A บัญชี | `account/index.ts` · `account/service.ts` | `createExternalQuotation` รับ `lines[]`/`discountAmount`/`validUntil`/`note`/`createdById` (ไม่ส่ง = เหมือนเดิมทุกไบต์) · เพิ่ม 7 ทางออก: `convertQuotationToInvoice` · `respondQuotation` · `createPaymentRequestForDoc` · `outstandingByContacts` · `mergeContacts` · `ensureAccountContact` · `docLinkInfo` |
| F อนุมัติ | `approval/labels.ts` · `approval/actions.ts` · `approval-effects.ts` | 4 ชนิดของ CRM (`crm.discount` `crm.commission` `crm.reassign` `crm.portal_request`) + **`AccountDocument` ที่หายไปแต่เดิม** (หนี้เก่า: `approval-cap.ts` ยื่นชนิดนี้อยู่แล้วแต่ร้านตั้งกฎไม่ได้) + กิ่ง NO-OP ที่ระบุใบเจ้าของแต่ละเรื่อง |
| B แชท | `chat/party-bridge.ts` (ใหม่) · `chat/index.ts` · `chat/service.ts` | `sendLineToParty` (ไม่ throw · เหตุผลปฏิเสธแยก 2 แบบ) · `listConversationsByParty` (**ข้ามระบบแชททั้งร้าน** + กรองสาขาด้วย `canAccessConvUnit`) · เขียน `ChatContact.partyId` ตอนผูกสมาชิก |
| C HR | `hr/index.ts` (ใหม่) · `hr/service.ts` | facade re-export ล้วน + `employeeOfUser` · `isOnLeave` (วันไทยจริง ครอบคลุมทั้งสองปลาย) |
| D คลัง | `inventory/index.ts` (ใหม่) · `inventory/service.ts` | facade + `searchItems` (ชื่อ/sku/barcode · ตัดของที่เก็บเข้ากรุ · เพดาน 50) |
| E party | `party/index.ts` · `party/service.ts` | `updateContactInfo` (แก้บางส่วนไม่ล้างช่องอื่น · normalise เบอร์ · ชนกันแล้วบันทึกเป็นคู่ที่น่ารวม ไม่ใช่ล้ม · `tx` ร่วมทรานแซกชันผู้เรียกจริง) |
| ด่าน | `scripts/fitness.mts` | `ALLOWED_EDGES` +7 เส้น (`crm→chat|hr|inventory|approval|member|kanban|forms`) พร้อมเหตุผล · ไม่แตะกฎเดิมสักข้อ |

## 2. migration / seed / backfill
ไม่มีทั้งสามอย่าง (ใบนี้ห้ามมี migration)

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน (ผู้คุมงานรันเองทั้งหมด · log `.qc-shots/crm/c03-verify.log`) |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด โดยตัวแทนแยก · เคยแดง/SKIPPED | ✅ | commit `ad143c6` · SKIPPED ถูกเหตุผล ก่อนมีของจริง |
| D2 | ข้อสอบเขียวเมื่อผู้คุมงานรันเอง (หลัง reseed 3 ชุด + ระบายคิว) | ✅ | `JSON_SUMMARY {"total":88,"passed":88,"findings":[]}` |
| D3 | กลุ่ม X | ✅ | X1 14 ข้อ · X3 4 ข้อ (รวมยิงข้ามโพรเซส 4 ตัว) · X8 5 ข้อ · ที่เหลือ N-A (ดู §4) |
| D4 | regression | ✅ | **รัน 100 ชุด** — บัญชี 44 · account-api 19 · approval 3 · POS/แชท/HR/คลัง/ฟอร์ม/สมาชิก ที่เหลือ · แดง 3 ชุด **พิสูจน์แล้วว่าไม่ใช่ของใบนี้** (§7) |
| D5 | typecheck + fitness 2 โหมด | ✅ | typecheck exit 0 · `{"total":29,"passed":29}` ทั้งมี env และ `env -u DATABASE_URL` |
| D6 | build ผ่าน | ✅ | `acc-v2-serve.sh` exit 0 — สำคัญเพราะใบนี้แตะโมดูลกลางหลายตัว |
| D7 | ภาพ | ✅ N-A | ใบนี้ไม่มี UI สักพิกเซล (facade + service ล้วน) · ภาพชุด 0.1 ยังถ่ายได้ปกติหลัง build |
| D8 | ทะเบียนปุ่ม | ✅ N-A | ไม่มี element ใหม่ · F14.1/F14.2 เขียว |
| D9 | ผู้ตรวจไม่มี BLOCKER | ✅ | รอบแรก: **BLOCKER 1 (บั๊กเงิน) + SHOULD-FIX 5** → แก้ครบ 9 จุด → รอบสอง (ตรวจเฉพาะรอบแก้) ดู §7 |
| D10 | เอกสาร/ทะเบียน | ✅ | ไม่มี op/สิทธิ์/event ใหม่ · `ALLOWED_EDGES` มีเหตุผลครบทุกเส้น |
| D11 | wo-notes + คืนสภาพ QC | ✅ | ไฟล์นี้ · `qc-member-m1.9` 26/26 (วัดหลังระบายคิวและหลังจบทุกอย่าง) · ข้อสอบสร้างร้านชั่วคราวของตัวเองแล้วกวาดลบครบ (`C0.3-CLEAN`) |
| D12 | commit → push → Vercel READY | ⏳ | §10 |

## 4. กลุ่มข้อสอบ X
| กลุ่ม | เกี่ยว? | check ids / เหตุผล N-A |
|---|---|---|
| X1 ขอบเขต | **ใช้** | `X1.1–X1.14` — ข้ามร้านทุกฟังก์ชันใหม่ (convert · respond · docLinkInfo · outstanding · merge · ensureContact · paymentRequest · conversations · sendLine · hr ×2 · inventory ข้ามร้าน+ข้ามระบบ · party · approval policy) |
| X3 ยิงพร้อมกัน | **ใช้** | `X3.1–X3.3a` — `ensureAccountContact` 12 ทางพร้อมกัน 3 รอบ → 1 แถว · ทุกคนได้ id เดียวกัน · **และซ้ำด้วย 4 โพรเซสแยก** (ล็อกในหน่วยความจำต้องแดง) |
| X8 PDPA | **ใช้** | `X8.0–X8.4` — ไม่มีเบอร์/อีเมลใน log · audit · OpsEvent · outbox ของฟังก์ชันใหม่ (ยกเว้น `account.contact.created/updated` ที่มีมาแต่เดิม ตาม RESOLUTIONS R-C 17) |
| X2 · X4 · X5 · X6 · X7 · X9 · X10 | N-A | ไม่มีคีย์ API/AI ใหม่ (X2) · ไม่มี consumer ใหม่ (X4) · ไม่มีงานตามเวลา (X5) · ไม่รับข้อมูลจากภายนอกโดยตรง — ตัวตรวจค่าที่เพิ่มคือกันผู้เรียกภายในส่งค่าพัง (X6) · ไม่มี endpoint สาธารณะใหม่ (X7) · ไม่มี op ชนิด danger ใหม่ (X9) · ไม่มีไฟล์/ความลับใหม่ (X10) |

## 5. ผลข้อสอบ (ของจริง)
- `qc-crm-c0.3`: `{"total":88,"passed":88,"findings":[]}`
- 100 ชุด regression · แดง 3 (อธิบายครบใน §7) · `qc-member-m1.9` 26/26
- typecheck exit 0 · fitness 29/29 ×2 โหมด · build exit 0

## 6. ภาพ
N-A (ไม่มี UI) — **PARITY: ผ่าน** โดยนิยาม · ถ่ายชุด 0.1 ซ้ำหลัง build แล้วยังปกติ

## 7. ข้อแย้ง / มติทางเทคนิค / สิ่งที่เจอ
- 🔴 **BLOCKER ที่ผู้ตรวจจับได้และผมยืนยันกับโค้ดเอง — บั๊กเงิน**: `createExternalQuotation` ส่ง `discountAmount` เข้าเครื่องคิดเงินโดยไม่ตรวจค่า · `totals.ts:95` **ตัดค่า** ก่อนคำนวณ แต่ `service.ts:1955` **เก็บค่าดิบ** และ `gl.ts:471` คิดฐานรายได้จากค่าที่เก็บ ⇒ ส่วนลด ฿1,500 บนดีล ฿1,000 ได้เอกสารที่พิมพ์ว่า "ส่วนลด 1,500.00" บนใบยอดรวม 0 · แปลงเป็นใบแจ้งหนี้แล้ว `issueDocument` โยน `ลงบัญชีไม่สมดุล` ⇒ **ออกใบแจ้งหนี้ไม่ได้ตลอดกาล** · ค่าติดลบยิ่งร้าย (เงียบจนถึงตอนออกเอกสาร แล้วบันทึกรายได้สูงกว่าที่เสนอ)
  - **มติ: ปฏิเสธพร้อมบอกตัวเลข ไม่ตัดเงียบ** (ตัดเงียบ = ฿1,500 กลายเป็น ฿1,000 โดยคนกรอกไม่รู้ตัว) · แก้ที่ facade ไม่ใช่ `createDocument` เพราะใบนี้ห้ามเปลี่ยนพฤติกรรมผู้เรียกเดิม
  - **หนี้ที่ยกไป**: `createDocument` ยังเก็บส่วนลดที่ขัดกับยอดของตัวเองได้ถ้ามีผู้เรียกรายอื่นในอนาคต → เสนอปิดในเฟส C5
- ผู้ตรวจ SHOULD-FIX อีก 5 ข้อ แก้ครบ: ประตูที่สอง (`findOrCreateCustomerContact`) ยังสร้างผู้ติดต่อซ้ำได้ตอนยิงพร้อมกัน → ใช้ล็อกตัวเดียวกัน · `ensureAccountContact` ผูกกับ Party ที่ถูกรวมไปแล้ว (ทำให้การรวมถูกยกเลิกเงียบ ๆ) → resolve ตัวจริงก่อน · หลักฐานลายเซ็นเขียนนอกทรานแซกชันบนเส้นที่กลืน error → ย้ายเข้าทรานแซกชันเดียวกับการเปลี่ยนสถานะ · `qty` ทศนิยมคูณแบบ float ทำให้บรรทัดขัดกันเองระดับสตางค์ → ปัดที่ 4 ตำแหน่งและบังคับสตางค์เป็นจำนวนเต็ม · `unitAccess` เป็น optional ทำให้ลืมส่งแล้วเห็นทั้งร้าน → บังคับในชนิดข้อมูล
- ✅ **ORACLE-EDIT: ไม่มีเลยในใบนี้** — ข้อสอบไม่ถูกแตะหลัง commit (ยืนยันด้วย diff ว่าง)
- **แดง 3 ชุดที่ไม่ใช่ของใบนี้** (ทั้งหมดมีหลักฐานใน `ledger/CRM-RUN.md` §4):
  1. `qc-account-api-docs` · 2. `qc-account-api-openapi` — อ่านโฟลเดอร์ `.claude/skills/shark-account-api` ที่ `.gitignore:43` ตัดทิ้ง ⇒ ไม่มีใน worktree นี้ตั้งแต่แรก (generator บอกเอง: ไฟล์ 0 ไบต์ vs ที่ควรเป็น 17,855)
  3. `qc-acc-v2-security` S5 รับชำระผ่าน webhook — **ย้อน `src/` กลับไปที่ `ad143c6` แล้วรันซ้ำ ได้ผลแดงเหมือนกันเป๊ะ (294/298)** ⇒ ของเดิม
- **บั๊กของโมดูลอื่นที่เจอระหว่างทาง** (บันทึกใน CRM-RUN §4 · ไม่แก้ในใบนี้): `hr/rules.ts:6` `isAvailable` เทียบวันแบบ UTC ⇒ ระบบจองเพี้ยนช่วง 00:00–07:00 เวลาไทย · `PartyMergeReason` ไม่มีค่า `EMAIL` · `employeeOfUser` คืนพนักงานที่ลาออกแล้วได้ (ใบ C3.3 ต้องเช็ค `active` เอง)

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ไม่มี unique index `(systemId, partyId)` บน `AccountContact` | ใบนี้ห้ามมี migration · ความถูกต้องพึ่งล็อกของฐานข้อมูลอย่างเดียว | **C1.1** (เพิ่ม partial unique index เป็นตัวกันชั้นสอง) |
| `src/lib/member-bridges.ts` แตะตาราง CRM ด้วย prisma ดิบ | ไม่ใช่ import ⇒ facade/F2.3 มองไม่เห็น | **C1.8** |
| ต้นเหตุจริงของ `qc-acc-v2-security` S5 | `safeReason` กลืน exception ⇒ หาไม่เจอถ้าไม่ log ชนิด error ก่อน | **C5** (ล่าบั๊ก) |
| โฟลเดอร์สกิลของ account API ไม่มีใน worktree | `.claude/` ถูก gitignore ทั้งก้อน | เตรียมก่อนใบ **C1.10** (ใบนั้นต้องสร้าง generator แบบเดียวกัน) |

## 9. คืนสภาพ QC
ข้อสอบสร้างร้านชั่วคราว 2 ร้านของตัวเอง (`qc-c03-*`) แล้วกวาดลบทุกตารางที่มี `tenantId` 4 รอบ + นับซ้ำ (`C0.3-CLEAN` เขียว) · `qc-member-m1.9` 26/26 หลังจบทุกอย่าง · `scripts/*-expected.json` และ fixture ของบัญชีเปลี่ยนเพราะ reseed (id ใหม่) — ถูกต้องตามสภาพฐาน QC ปัจจุบัน
