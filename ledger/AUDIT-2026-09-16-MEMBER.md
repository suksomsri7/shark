# ผลตรวจรับระบบสมาชิก v2 (Fable · 16–17 ก.ย. 2569)

ตรวจงาน M3.3→M3.11→M3.F ที่ Opus คุมงานต่อจาก Fable (base `21fd9f3` → `fad4317`) ตาม `HANDOVER-2026-09-11-MEMBER-M3-CONTROLLER.md` §6 + ตรวจโค้ดเชิงลึก 4 มุม (เลนสาธารณะ/OTP/session · REST/webhook/AI · consumer/journey/notification · สิทธิ์/PDPA/มือถือ) ทุกข้อด้านล่าง **Fable เปิดซอร์สยืนยันเองแล้ว** (ไม่ใช่รายงานของตัวตรวจอย่างเดียว)

## 1. คำตัดสินรวม

- **งานที่ Opus แจ้งว่าเสร็จ = เสร็จจริง** ทุกใบมี commit + แถวสถานะ + wo-notes + ORACLE-EDIT มีหลักฐาน · prod มี migration ครบ 18 ใบ · `.env` ไม่ถูกแตะ · ไม่มีชุดข้อสอบแตะ prod
- **ข้อสอบผ่านจริง** แต่ข้อสอบ **ไม่ครอบคลุม** เรื่องยิงพร้อมกัน (concurrency) · การส่งซ้ำ (redelivery) · ขอบเขตสิทธิ์ของผู้ช่วย AI/การส่งออก · PDPA ลบไม่หมด ⇒ พบบั๊ก/ช่องโหว่ **HIGH 7 · MEDIUM 15 · LOW 15** (ตาราง §3) ไม่มีข้อไหน "ระบบใช้ไม่ได้" แต่ 3 ข้อแรกควรแก้ก่อนเปิดให้ร้านจริงใช้ API/ผู้ช่วย AI
- หนี้ M3.F ข้อ 4 (m1.9 tier drift) หาต้นตอเจอและแก้แล้ว: `ORACLE-EDIT M2.3-S5.2`

## 2. เช็กลิสต์ §6

| ข้อ | ผล | หลักฐาน |
|---|---|---|
| 6-1 commit/ledger ครบทุกใบ | ✅ | M3.3–M3.11 + M3.F มีแถว §3.1 + wo-notes + commit บน main |
| 6-2 diff ORACLE-EDIT | ✅ | hunk ไร้ marker 27 จุด = ส่วนต่อของ ORACLE-EDIT ใน §4 ทั้งหมด · สุ่มตรวจ 2 เรื่องเงิน/สัญญา (Voucher FIXED=สตางค์ · REST ไม่มี 201) ตรงโค้ด |
| 6-3 qc:all ของตัวเอง | ⏳ | ดู §5 (เติมเมื่อ pipeline จบ) |
| 6-4 ภาพ vs mockup ด้วยตา | ⏳ | ดู §5 |
| 6-5 prodmig | ✅ | 18 ใบ member_v2 a→h3 บน prod · backfill dry-run 0 |
| 6-6 ไม่ละเมิด prod-suite / .env | ✅ | `.env` mtime 10 ก.ย. · ไม่มีบันทึกละเมิดใหม่ |

## 3. บั๊ก/ช่องโหว่ที่ยืนยันแล้ว (เรียงความรุนแรง)

### 🔴 HIGH

| # | เรื่อง | ที่ | ผลกระทบ | แก้ขั้นต่ำ |
|---|---|---|---|---|
| H1 | คีย์ API ที่ **ไม่มี** scope `member.*` เรียก tool เก่าของผู้ช่วยได้ (`memberToolAllowedForScopes` คืน true เมื่อไม่มี member scope) | `src/lib/modules/member/api/tools.ts:282-289` | คีย์ของโมดูลอื่นในร้านเดียวกันอ่านเบอร์เต็ม/สร้างข้อเสนอสมาชิกได้ | ไม่มี member scope ⇒ ปฏิเสธ tool ตระกูล member ทั้งหมด |
| H2 | ส่งออก CSV รายชื่อ: `columns` มาจาก client และฟิลด์ **sensitive** ไม่ผ่านนโยบาย D8 + ไม่ลง `MemberAccessLog` | `src/lib/modules/member/list.ts:448-509` · `fields.ts:1003-1020` | STAFF ที่มี `member.customer.export` ดึงค่าฟิลด์อ่อนไหวของทุกคนในขอบเขต (สูงสุด exportRows) โดยไม่มีร่องรอย | ใน `exportMembers`/`listFields` ตัดฟิลด์ sensitive เว้นแต่ `canViewSensitive` ผ่าน + `logAccess` |
| H3 | ผู้ช่วย AI รันด้วย scope คงที่ + `unitAccess: []` (=ทุกสาขา) ด่านหน้าคือ `canReadMember` เท่านั้น | `api/tools.ts:39-68` · `api/actor.ts:138-148` | พนักงานสาขาเดียว/มีคีย์เดียว ถามผู้ช่วยแล้วเห็นสมาชิก+รายงานทั้งร้าน | intersect scope กับสิทธิ์จริงของคนเปิดหน้า + ส่ง unitAccess ของคนนั้น |
| H4 | เพดาน OTP ลูกค้าเป็น in-memory ต่อ process (บน Vercel แทบไม่กัน) และเลน join ส่งเมล OTP ไปอีเมลใดก็ได้ | `customer-session.ts:99-110, 192-200` (เทียบ `public-lane.ts:108` ใช้ DB) | ถล่มเมลในนามร้าน · เดารหัสแบบขนาน (มีเพดานยืนยันผิดต่อใบ `:252-257` จึงยังไม่ใช่ยึดบัญชีง่าย ๆ แต่ต้นทุนผู้โจมตีต่ำเกินไป) | `hit()` → `checkRateLimitDb` + ถังนับยืนยันผิดต่อเบอร์/IP ใน DB |
| H5 | ยอดสะสม `totalSpentSatang` ไม่ atomic 2 ชั้น: dup-check ก่อน lock · `recordSpend` อ่าน-บวก-เขียน | `src/lib/member-bridges.ts:137-142` · `member/service.ts:309-324` | 2 บิลของคนเดียวกันถูก drain คนละ instance = ยอดหาย 1 บิล · lease หมดอายุ = บวกซ้ำ ⇒ เลื่อนระดับผิด | `recordOnce` ก่อน แล้วบวกเมื่อ `created` + `increment` |
| H6 | แจ้งเตือนสมาชิกไม่มีตัวกันซ้ำ: `refId` เขียนแต่ไม่เคยอ่าน · ไม่มี unique · `runDue` ไม่ claim แถวก่อนส่ง | `notifications.ts:444-461, 475-545` · `member.prisma:772-791` | redelivery/cron ซ้อน = ลูกค้าได้ LINE/SMS/อีเมลซ้ำ (WELCOME, POINTS_EARNED, TIER_UP …) | unique `(systemId, customerId, event, channel, refId)` + claim QUEUED→SENDING ด้วย updateMany |
| H7 | ข้อความที่เลื่อนส่ง (quiet hours/digest) ไม่ตรวจ consent ซ้ำตอนส่งจริง | `notifications.ts:425` vs `473-545` | ถอนความยินยอมแล้วยังได้ข้อความ (PDPA) | ใน `runDue` เช็ค `consentMapOf` → SKIPPED |

### 🟠 MEDIUM

| # | เรื่อง | ที่ | แก้ขั้นต่ำ |
|---|---|---|---|
| M1 | Webhook ปลายทาง: ตรวจแค่ https ไม่กัน host ภายใน (SSRF) · ลายเซ็นไม่มี timestamp (replay ได้) · retry นับรวม 5 ครั้งไม่มี backoff | `src/lib/webhooks/service.ts:41,144,196-199` · `member/api/ops/webhooks.ts:69` | บล็อก IP ส่วนตัว/metadata · ใส่ `X-Shark-Timestamp` ในลายเซ็น · backoff ต่อ endpoint |
| M2 | CSV รายงานไม่ผ่าน `neutralizeFormula` (formula injection) | `member/reports.ts:572-581` (มี helper ที่ `core/csv.ts:117`) | ใช้ `csvCell` กลาง |
| M3 | `QC_OTP_PREVIEW` ถูกเช็คก่อน NODE_ENV — env หลุดไป prod = รหัส OTP โชว์ให้ทุกคน | `customer-session.ts:46-49` | production ⇒ return false บรรทัดแรก |
| M4 | PIN ใบสแตมป์อยู่ใน DTO ที่ส่งเข้า client component และ op `stamps.cards.list` (คีย์อ่านอย่างเดียว) เห็น PIN · แอปพนักงานเดา PIN ได้ไม่จำกัด + เทียบไม่ constant-time | `stamp/service.ts:65,181-190` · `member/stamps/page.tsx:31` · `staff-app.ts:215-221` | DTO ให้ `pinRequired` แทน · rate limit ต่อ (user, card) · เก็บ PIN เป็น hash |
| M5 | PDPA erase เหลือ PII: รีวิว body/รูป · `Referral.refereeContact` · `MemberNotification.subject/body` · `CustomerSession` ไม่ revoke · `CustomerOtp.target` | `privacy.ts:1178-1245` | เพิ่มขั้นใน tx เดียวกัน |
| M6 | ระงับบัญชี/ลบข้อมูลแล้ว session เดิมยังใช้ได้ — `revokeAllCustomerSessions` ไม่มีผู้เรียกเลย · session ยอมรับ SUSPENDED | `customer-session.ts:168,261,297,333,358` | เรียก revoke ตอน suspend/erase · ตัด SUSPENDED ออกจาก `getCustomerSession` |
| M7 | ขั้น "รอ n วัน" ของ journey จองแถวด้วยการเซ็ต `finishedAt` — cron ตายกลางทางแล้วแถวไม่มีใครหยิบอีก | `journeys.ts:1084-1091` | จองแบบ lease (เลื่อน scheduledAt) หรือ sweeper |
| M8 | ทริกเกอร์ `member.merged` / `point.transferred` ตั้งได้แต่ไม่วิ่ง (payload ใช้ `keepId`/`fromCustomerId` ไม่อยู่ใน ID_KEYS) | `journeys.ts:598` · `profile.ts:1844` · `point/transfer.ts:275` | เพิ่มคีย์ หรือถอดจากตัวเลือก |
| M9 | แลกแต้มพร้อมกัน: ตรวจยอดแล้วค่อยหัก (ไม่ atomic) ⇒ ยอด/lot ติดลบได้ | `point/lots.ts:238-240,276` | `updateMany where balance >= points` แล้วเช็ค count |
| M10 | บั๊ก compose (บัญชีล้ม ⇒ ฝั่งสมาชิกไม่วิ่ง) กว้างกว่าที่บันทึก: journey/webhook/stamp ไม่ยิงด้วย · PAID ล้มถาวรแต่ VOID สำเร็จ ⇒ ลบยอดที่ไม่เคยบวก | `outbox-consumers.ts:335-345` · `member-bridges.ts:118-146` | แยก extras ให้วิ่งอิสระ + VOID ต้องเห็นแถว PURCHASE ก่อน |
| M11 | แต้มของบิลที่ยกเลิกอาจไม่ถูกกลับ (EARN ลงหลัง reverse · คีย์ void ยิงได้ครั้งเดียว) | `member-bridges.ts:261` · `wallet.ts:827-845` | อ่านสถานะบิลซ้ำก่อน earn / reverse ต่อ ledger entry |
| M12 | event ที่ให้ของมีค่า (booking DONE · deal won · shop paid) ยิงนอก transaction ผิดกติกา `core/outbox.ts:69-72` | `booking/service.ts:730,747` · `crm/service.ts:155` · `shop/service.ts:242` | emit ใน tx |
| M13 | รายงาน `findMany` ไม่มี `take` + ไม่กรองสาขา | `reports.ts:101-106,174,234,491,536` | aggregate ใน DB · ใส่ unit filter (หรือเขียนกำกับว่าตั้งใจ) |
| M14 | กันโกงแนะนำเพื่อนพึ่ง fingerprint ที่ client ส่ง และผูกกับผู้แนะนำคนเดิมเท่านั้น · `monthlyCap` ตั้ง null ได้ | `join-actions.ts:260` · `referrals.ts:405-460,690-706` | นับ fingerprint ข้ามร้าน + IP hash + cap ปริยาย |
| M15 | `campaigns.send` เป็น `kind:"write"` ไม่ใช่ danger (ไม่ต้อง confirm+reason ทั้งที่ยิงถึงลูกค้าทั้งกลุ่ม) | `api/ops/campaigns.ts:160-165` | เปลี่ยนเป็น danger |

### 🟡 LOW

L1 timing enumeration หน้า login (`customer-session.ts:192` await sendEmail เฉพาะสมาชิก) · L2 token รีวิวไม่มีวันหมดอายุ (`reviews.ts:373-374`) · L3 สาขา "done" ของ `reviewLiffView` ไม่เทียบ hash (`reviews.ts:1157-1160`) · L4 secret สำรองฝังโค้ด `"shark-member-card"` (`me.ts:329`) · L5 cookie Secure ผูก `APP_ENV` (`customer-session.ts:41-43`) · L6 ยึดเครื่อง push ด้วย Expo token (`push-devices.ts:406-411`) · L7 `/m/[slug]/auth/line` ไม่มี rate limit · L8 `logAccess` ข้ามคีย์ API ที่ไม่มี userId (`privacy.ts:169-171`) · L9 `revokeApiKey` ไม่ตรวจ systemId (`api-actions.ts:98-110`) · L10 ยกเลิกข้อเสนอของใครก็ได้ด้วยสิทธิ์อ่าน (`assistant-actions.ts:91-102`) · L11 `export type` ใน "use server" (`notifications-actions.ts:31`) · L12 PII/stack ใน OpsEvent (`outbox-consumers.ts:420-450` · `profile.ts:687`) · L13 `approvalNotify` สร้างซ้ำเมื่อ retry (`outbox-consumers.ts:280-287`) · L14 digest คลาด 1 วันเมื่อ event ตรงชั่วโมงพอดี (`notifications.ts:90-93`) · L15 `totalSpentSatang` เป็น Int (เพดาน ฿21.47 ล้าน · `member.prisma:20`)

## 4. ที่ตรวจแล้วผ่าน (ย่อ)

IDOR เลน `/me/*` ไม่พบ · tenant isolation ทุกด่าน · token `cs_`/`jt_` สุ่ม 32 ไบต์ เก็บ sha256 · LINE verify ฝั่ง server ตรวจ aud · referral: ไม่มี open redirect, advisory lock กันทะลุเพดาน, idempotencyKey ทั้งสองฝั่ง · member enumeration ปิด (ยกเว้น L1) · XSS: sanitizeHtml allowlist ทดสอบเลี่ยงไม่ผ่าน · action ทุกไฟล์ gate ก่อนทำงาน + re-resolve AppSystem · 404-not-403 ทุกหน้า · unit scope ตรงกันทุกด่าน · QR บัตร HMAC+TTL+tenant · mobile API 4 เส้น requireMobile+assertCan+phoneMasked · นโยบายข้อมูลอ่อนไหวใน 360 ตัดจาก DTO จริง · outbox: emit กันซ้ำจริง, drain วนจนเงียบ, lease claim, `member.created` ใน tx เดียวกับแถว · journey loop guard unique+re-entry ≥1 วัน · คณิตเวลาไทยไม่มี getDay() ดิบ · แต้ม ledger มี idempotencyKey ทุกตัว · เงินเป็นสตางค์ตลอดสาย

## 5. pipeline ของ Fable (§6-3/6-4)

(เติมเมื่อจบ)

## 6. แผนแก้ที่เสนอ (รอเจ้าของสั่ง — ยังไม่แตะโค้ด product)

- **ชุด S1 ความปลอดภัย (ครึ่งวัน)**: H1 · H2 · H3 · H4 · M2 · M3 · M4 · M6 · M15 · L4 · L5 · L7
- **ชุด S2 ความถูกต้องของเงิน/แต้ม (ครึ่งวัน)**: H5 · M9 · M10 · M11 · M12 · L15
- **ชุด S3 การส่งข้อความ/journey (ครึ่งวัน)**: H6 · H7 · M7 · M8 · L13 · L14
- **ชุด S4 PDPA/ความสะอาด (ครึ่งวัน)**: M5 · M13 · M14 · M1 · L1–L3 · L6 · L8–L12
- ทุกชุดต้องมี oracle ใหม่ที่จับบั๊กก่อนแก้ (ยิงพร้อมกัน 2 ทาง · redelivery · ตรวจ scope/ export) — oracle เดิมไม่มีข้อไหนจับได้
