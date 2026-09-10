# โมดูล 06 v2: ระบบสมาชิก (Member System) — พิมพ์เขียว

> เอกสารพิมพ์เขียว · 10 กันยายน 2569 · ผู้เขียน: Fable · สถานะ: **ออกแบบครบ รอสั่ง RUN** (ยังไม่แตะโค้ด)
> ต่อยอดจาก `06-member.md` (v1) + `07-reward.md` + `08-coupon.md` + `09-point.md` · ยึด `_CONVENTIONS.md` (Member = tenant-scoped · POS เป็นจุดตัดเงินเดียว · Point เป็นผู้คำนวณแต้ม · outbox ทุกผลข้างเคียง)
> คู่มือแบบ: `ledger/DESIGN-MEMBER.md` · ภาพ 30 ใบ: `ledger/design-member/` · API: `docs/api/MEMBER-API.md` · แผนงาน: `ledger/MEMBER-RUN.md`
> เครื่องมือเทียบ QC: ทุกหน้าใน §3 มีภาพอ้างอิง · ทุกฟังก์ชันใน §5/§7 มี op ใน API doc · ทุกใบงานใน MEMBER-RUN มีเกณฑ์ตรวจรับ §13

---

## 0. การตัดสินใจ (ปิดแล้ว — จากเจ้าของ 10 ก.ย. 2569 + ข้อสรุปของ Fable)

### 0.1 มติ D1–D16

| # | เรื่อง | มติ | ผลต่อโค้ด |
|---|---|---|---|
| **D1** | ระดับสมาชิก | **ค่าเริ่มต้น 4 ระดับ** (Member/Silver/Gold/Platinum) seed ให้ทุกร้านเป็น `MemberTierDef` 4 แถว · **แก้/เพิ่ม/ลบได้** (ลบได้เมื่อไม่มีคนอยู่) · enum `MemberTier` เดิมคงไว้เพื่อ backward compat แต่โค้ดใหม่อ้าง `tierDefId` | §4.1 §4.3 |
| **D2** | แต้มหมดอายุ | **ค่าเริ่มต้น 12 เดือนหลังได้ · ตั้งค่าได้** (จำนวนเดือน / สิ้นปี / ไม่หมด) · แบบล็อต FIFO · ระดับยกเว้นได้ | §4.3 `PointLot` §7.6 |
| **D3** | Gift card | **ทำ** · สวิตช์ต่อร้าน `giftCard.accountingLink` (เปิด = ขายเป็นรับเงินล่วงหน้า/ใช้เป็นรายได้ผ่านโมดูลบัญชี · ปิด = บันทึกยอดในระบบสมาชิกอย่างเดียว) | §4.3 §9.4 |
| **D4** | ฝั่งลูกค้า | **ทำทั้ง LINE LIFF และแอป SHARK (ลูกค้า) พร้อมกัน** — หน้าจอชุดเดียว (`src/app/m/*` เว็บ responsive ใช้ใน LIFF และ WebView ของแอป) · ตัวตนลูกค้าผ่าน `platform_auth` (LINE login / OTP) | §3.5 §6.6 |
| **D5** | รีวิว | **เก็บในระบบอย่างเดียว** · ไม่เชื่อม Google Review (ตัดฟีเจอร์ "เชิญรีวิว Google" ออก · เก็บเป็น 🔜) | §7.9 |
| **D6** | แนะนำเพื่อน | **ร้านตั้งค่าได้** รางวัลผู้แนะนำ/เพื่อน = แต้ม หรือ voucher (ค่าเริ่มต้น: ผู้แนะนำ 300 แต้ม · เพื่อน voucher ฿100) | §4.3 `ReferralProgram` |
| **D7** | เทมเพลตกิจการ | **16 ประเภท** (§10) แต่ละชุด = ส่วน+ฟิลด์ · ระดับ · สแตมป์ · journey · เทมเพลตเป็นข้อมูล (JSON ใน `src/lib/modules/member/templates/*.ts`) แก้ต่อได้หลังใช้ | §10 |
| **D8** | ข้อมูลอ่อนไหว | **Admin ตั้งได้ว่าใครดู** — ตาราง `MemberSensitivePolicy` (ต่อส่วน/ฟิลด์ × บทบาท OWNER/MANAGER/STAFF + สาขาเดียวกันเท่านั้น) · ค่าเริ่มต้น OWNER+MANAGER · บันทึกการดูทุกครั้ง (`MemberAccessLog`) | §4.3 §6.3 |
| **D9** | ยังไม่ RUN | ส่งมอบพิมพ์เขียว + API + ภาพครบทุกหน้า + แผนงานละเอียด **เพื่อใช้เทียบ QC** · เริ่ม RUN เมื่อเจ้าของสั่ง | เอกสารชุดนี้ |
| **D10** | ช่องทางที่มา | **ทุกสมาชิกต้องมี `source`** (enum 12 ช่องทาง) + `sourceDetail` (แคมเปญ/ลิงก์/QR/พนักงาน/ผู้แนะนำ) + **first touch และ last touch** ผ่าน `MemberAttribution` · ลิงก์/QR ที่มา `AcquisitionLink` (`?src=`) | §4.3 §7.2 |
| **D11** | API + AI | **ทุกฟังก์ชันเป็น op** (ทะเบียนเดียว → REST `/api/v1/member/*` → AI tool → skill manifest → OpenAPI) แบบเดียวกับบอร์ดงาน/บัญชี · ~118 op · AI tool ~40 · เขียนแบบเสนอก่อน (proposal) เสมอ | `docs/api/MEMBER-API.md` §8 |
| **D12** | ตัวตนกลาง | `Party` = ตัวตน · `Customer` = สมาชิกของระบบ MEMBER · **ทุกโมดูลที่รู้เบอร์/อีเมล/LINE ต้องเขียน `partyId`** (แชท · CRM · บัญชี · จอง · POS) · ไม่รวมตาราง | §4.1 §9.1 |
| **D13** | เหตุการณ์ | ผลข้างเคียงทุกอย่างผ่าน outbox (24 event ใหม่ + 2 เดิม) · POS **เลิกเรียก** point/member ใน tx (ย้ายเป็น consumer `pos.sale.paid`) · event ใหม่ต้องลง consumer + AUTOMATION_EVENTS + WEBHOOK_EVENTS พร้อมกัน | §7 |
| **D14** | ฟิลด์กำหนดเอง | **คอลัมน์แยกชนิด** (`MemberFieldValue.valueText/Number/Date/Bool/Options/Ref/FileId`) แบบ K2.6 · เพดาน 60 ฟิลด์/ร้าน · ฟิลด์ระบบ (`isSystem`) ซ่อน/เปลี่ยนป้าย/เรียงได้ ลบ/เปลี่ยนชนิดไม่ได้ | §4.3 §11.2 |
| **D15** | กฎอัตโนมัติ | ระดับ (tier rule) และ journey ใช้ **`AutomationRule` เดิม** (`scope MEMBER` · `boardId null`) + trigger `member.*` + action ใหม่ 7 ตัว · dry-run/quota/loop-guard/บันทึกการรัน ใช้ของ K2.9 | §7.3 |
| **D17** | สิทธิ์ดูอ่อนไหว × HR | `MemberSensitivePolicy` ตั้งได้ 3 มิติ: **บทบาท** (OWNER/MANAGER/STAFF) · **ตำแหน่ง/แผนกจาก HR** (`hrPositions[]` / `hrDepartmentIds[]` อ่านจาก `HrEmployee`) · **สาขาเดียวกัน** · ต้องผูก `HrEmployee.userId` (เพิ่มคอลัมน์ · backfill จากอีเมล) · `MemberAccessLog.hrEmployeeId?` · ใช้ HR position กับ "ผู้ดูแล" และ lookup EMPLOYEE ด้วย | §4.1 §4.3 §6.3 §9.5 |
| **D18** | ตัวตนหลายช่องทาง | สมาชิก 1 คนมี id ภายนอกได้หลายช่องทางไม่จำกัด → ตาราง `MemberChannelIdentity` (channel · externalId · contactId? · verified · linkedBy) แทน `Customer.lineUserId` เดี่ยว · **กติกาจับคู่ตายตัว**: เบอร์ → อีเมล → id ช่องทาง → เลือกมือ · ไม่ตรง = สร้าง `PartyMergeCandidate` · หน้า 360 แสดง "ช่องทางที่ผูก" · ทุก ChatContact/ShopOrder/อีเมลเข้า ต้องเรียก `member.linkIdentity` | §4.3 §5.2 §9.3 §11.1 |
| **D19** | ช่องทางเปิดขยาย | **ห้ามฮาร์ดโค้ดช่องทาง** ในระบบสมาชิก — `MemberChannel/MemberConsentChannel` เปลี่ยนจาก enum เป็น `String` ที่ตรวจกับ **ทะเบียนช่องทางกลาง** `channels.ts` (แผน · src/lib/core/) (LINE · WEBCHAT · APP · FACEBOOK · INSTAGRAM · MESSENGER · WHATSAPP · WECHAT · EMAIL · SMS · PHONE · PUSH · SHOPEE · LAZADA · TIKTOK_SHOP) · แต่ละช่องทางประกาศ `{ key, label, kind: CHAT|MESSAGING|MARKETPLACE|DIRECT, canConsent, canNotify, adapter? }` · เพิ่มช่องทางที่ทะเบียน = สมาชิก/ยินยอม/แคมเปญ/แจ้งเตือน/ที่มา/segment รองรับทันที · **การเชื่อมต่อจริง** (adapter รับ-ส่งข้อความ/คำสั่งซื้อ) เป็นงานของโมดูลแชท/อีคอมเมิร์ซ (1 ใบงานต่อช่องทาง · นอก RUN นี้ ยกเว้น LINE/WEBCHAT/EMAIL/SMS/PUSH ที่มีแล้ว) · Lazada/Shopee = แชท (โมดูลแชท) + คำสั่งซื้อ (`ShopOrder` ของโมดูล ecommerce → `pos.sale.paid`/`shop.order.paid` → ซื้อ/แต้ม/ที่มา MARKETPLACE) | §4.2 §7.4 §9.3 §9.7 |
| **D16** | ไมเกรชัน | เพิ่มอย่างเดียว (nullable/default) · ลง prod ผ่าน Vercel build · backfill สคริปต์ idempotent ทีละร้าน (`scripts/member-backfill-*.mts`) | §4.6 |

### 0.2 v2 เปลี่ยนอะไรจาก v1 (`06-member.md` + 07/08/09)

| เรื่อง | v1 (มีอยู่จริง) | v2 |
|---|---|---|
| โปรไฟล์ | ชื่อ/โทร/อีเมล/ระดับ/ยอด/แท็ก/consent boolean | +25 ฟิลด์มาตรฐาน · ส่วน/ฟิลด์กำหนดเอง 11 ชนิด · consent ต่อช่องทาง · ที่มา first/last touch · หลายที่อยู่ · รูป |
| ระดับ | enum 4 ค่า · `minSpendSatang` ตัวเดียว | `MemberTierDef` + กฎหลายเงื่อนไข + คงระดับ/ลดระดับ + สิทธิประโยชน์ที่บังคับใช้จริง + ประวัติ + ทดลองรัน |
| แต้ม | earn/burn/adjust/reverse · ไม่มีหมดอายุ | + กฎหลายชั้น (ตัวคูณระดับ/สินค้า/ช่วงเวลา/เหตุการณ์) · ล็อต FIFO หมดอายุ · โอน · เพดาน · อนุมัติเมื่อปรับมือเกิน |
| สแตมป์ · gift card · voucher · รีวิว · แนะนำเพื่อน · wallet · journey · attribution | ไม่มี | ใหม่ทั้งหมด |
| คูปอง | โค้ดสาธารณะ 2 ขั้น | + โค้ดรายบุคคล · บันทึกเข้า wallet · QR |
| แคมเปญ | ยิงครั้งเดียว 3 เงื่อนไข | segment builder ทุกฟิลด์ · A/B · holdout · push · journey อัตโนมัติ |
| ประวัติ | `MemberActivity` เขียนจาก pos/booking/kanban | ทุกโมดูลเขียนผ่าน consumer · ไทม์ไลน์กรองได้ · ส่งออก/ลบ PDPA |
| API/AI | ไม่มี REST · AI tool 8 | op ~118 · REST · AI tool ~40 · skill manifest · webhook |

---

## 1. ขอบเขต · persona · user stories

### 1.1 ทำอะไร
ระบบสมาชิกระดับ SME ที่ (1) เก็บข้อมูลลูกค้าตามที่กิจการต้องการเอง (2) จัดระดับและสิทธิประโยชน์ด้วยกฎ (3) สะสม/ใช้สิทธิ์ทุกชนิดในกระเป๋าเดียว (4) ทำโปรโมชันอัตโนมัติตามพฤติกรรม (5) เห็นประวัติลูกค้าทั้งชีวิตจากทุกโมดูลของ SHARK — ใช้ได้ทั้งฝั่งพนักงาน (เว็บ/แอป) และฝั่งลูกค้า (LINE LIFF/แอป) และเปิดทุกฟังก์ชันเป็น API/AI tool

### 1.2 ไม่ทำ (ตัดสินแล้ว)
- แต้มข้ามร้านในเครือ (ต้องมีสัญญาระหว่างร้าน) · เกม/ภารกิจ · Google Review (D5) · marketplace ของรางวัลกลาง · แอปสมาชิกแยกจากแอป SHARK · SMS gateway ใหม่ (ใช้ของเดิมถ้ามี ไม่มี = ช่องปิด)
- Custom objects แบบ Zoho (ตารางใหม่ทั้งตาราง) — ดู §14 CRM roadmap (ต่อยอดจาก custom fields ในรอบถัดไป)

### 1.3 Persona
| ใคร | ต้องการ |
|---|---|
| เจ้าของร้าน (OWNER) | เห็นมูลค่าลูกค้าจริง · ตั้งกฎครั้งเดียวแล้วระบบทำเอง · ต้นทุนโปรโมชันคุมได้ · ข้อมูลไม่รั่ว |
| ผู้จัดการสาขา (MANAGER) | ดูสมาชิกสาขา · แก้ปัญหาลูกค้า (voucher ชดเชย · ปรับแต้ม) · รับเรื่องรีวิวต่ำ |
| พนักงานหน้าร้าน (STAFF) | ค้น/สแกนสมาชิกเร็ว · ใช้สิทธิ์ที่ POS · ประทับสแตมป์ · สมัครสมาชิกให้ลูกค้าใน 30 วินาที |
| การตลาด (STAFF+`marketing.*`) | segment · แคมเปญ · journey · วัด ROI |
| ลูกค้า | เห็นบัตร/แต้ม/สิทธิ์บน LINE · แก้ข้อมูลตัวเอง · แนะนำเพื่อน · ให้รีวิว · ควบคุมความยินยอม |
| ระบบภายนอก/AI agent | อ่าน/เขียนผ่าน REST + webhook + skill manifest |

### 1.4 User stories ที่ต้องผ่านตอนตรวจรับ (ตัวอย่างสำคัญ · ครบใน §13)
- US1 พนักงานสมัครสมาชิกให้ลูกค้าจากหน้า POS ด้วยเบอร์เดียว ระบบตรวจซ้ำ ให้แต้มต้อนรับ ออกบัตร QR ส่ง LINE ได้ใน 30 วินาที และรู้ว่ามาจากช่องทางไหน
- US2 เจ้าของคลินิกเพิ่มส่วน "สุขภาพ" 5 ฟิลด์ ตั้งเป็นอ่อนไหวเห็นเฉพาะ OWNER แล้วพนักงานเปิดโปรไฟล์เห็นเป็น "ซ่อน" และมีบันทึกการดู
- US3 ตั้งกฎ "Gold เมื่อยอด 12 เดือน ≥ 30,000 หรือ 12 ครั้ง" ทดลองรันเห็นรายชื่อ · บันทึก · สิ้นเดือนระบบเลื่อน/ลด + แจ้ง LINE + ประวัติอ้างตัวเลข
- US4 ลูกค้าซื้อที่ POS: ส่วนลดระดับอัตโนมัติ · เลือก voucher · ใช้แต้ม · gift card · สแตมป์ +1 · แต้มใหม่ ×1.5 — ทั้งหมดในบิลเดียว void แล้วย้อนครบ
- US5 แต้มล็อตที่ได้ 12 เดือนก่อนหมดอายุวันนี้ · ลูกค้าได้ LINE เตือน 30/7 วันก่อน · หลังหมดอายุ balance ลด · ledger มีแถว EXPIRE · หน้า wallet แสดง
- US6 journey วันเกิด ออก voucher + LINE ล่วงหน้า 7 วัน เฉพาะคนที่ยินยอม · holdout 10% ไม่ได้รับ · รายงานเทียบสองกลุ่ม
- US7 ลูกค้าให้ 2 ดาวหลังคอร์ส → การ์ดในบอร์ดงานอัตโนมัติ มอบหมายผู้จัดการ · ตอบกลับได้ · ลูกค้าเห็นคำตอบบน LINE
- US8 ลูกค้าแชร์ลิงก์แนะนำเพื่อน · เพื่อนสมัคร (source=REFERRAL · referrer) · ซื้อครั้งแรก ≥ 500 → ทั้งสองได้รางวัลตามที่ร้านตั้ง · เบอร์ซ้ำถูกปฏิเสธ
- US9 AI agent ภายนอกเรียก `GET /members?segment=...` แล้ว `POST /vouchers` ด้วย Idempotency-Key · webhook `voucher.issued` ยิงไประบบร้าน
- US10 ลูกค้ากด "ส่งออกข้อมูลของฉัน" บน LINE → ไฟล์รวมทุกโมดูลผ่าน Party · "ลบข้อมูล" → คำขอเข้าโมดูลอนุมัติ → ลบ/ปิดบัง + ledger คงยอดรวม

---

## 2. IA + การนำทาง

### 2.1 ลำดับชั้น
```
ร้าน (Tenant)
└─ ระบบ MEMBER (AppSystem type=MEMBER — 1 ร้านมี 1 ระบบเป็นหลัก · หลายระบบได้แต่ Party ร่วมกัน)
   ├─ สมาชิก (Customer ↔ Party)  ── ฟิลด์/ส่วน (MemberSection/MemberField) ── ค่า (MemberFieldValue)
   ├─ ระดับ (MemberTierDef ↔ กฎ AutomationRule scope=MEMBER_TIER ↔ สิทธิประโยชน์)
   ├─ Loyalty: แต้ม (PointLedger/PointLot) · สแตมป์ (StampCard/Progress/Event) · รางวัล (Reward/Redemption)
   ├─ Promotion: Voucher · Coupon · GiftCard · MktCampaign · Journey (AutomationRule scope=MEMBER_JOURNEY)
   ├─ ประวัติ: MemberActivity (รวม) · MemberReview · Referral
   └─ ตั้งค่า: ฟิลด์ · ระดับ · แต้ม · สแตมป์ · รางวัล · โปรโมชัน · ช่องทางที่มา · ความเป็นส่วนตัว · แจ้งเตือน · API
```

### 2.2 เมนูโมดูล (เมนูซ้าย 8 หมวด · ภาพ 01)
| เมนู | URL (ใต้ `/app/sys/{sysId}/member`) | สิทธิ์ขั้นต่ำ |
|---|---|---|
| สมาชิก | `/members` · `/members/{id}` (360) · `/members/new` · `/members/import` · `/members/duplicates` | `member.customer.read` |
| ระดับสมาชิก | `/tiers` · `/tiers/{id}` · `/tiers/rules` · `/tiers/plans` | `member.tier.read` |
| แต้ม | `/points` (ledger รวม) · `/points/settings` · `/points/adjust` · `/points/expiring` | `member.point.read` |
| สแตมป์ | `/stamps` · `/stamps/{id}` | `member.loyalty.read` |
| รางวัล | `/rewards` · `/rewards/redemptions` · `/rewards/fulfil` | `member.loyalty.read` |
| โปรโมชัน | `/vouchers` · `/coupons` · `/giftcards` · `/journeys` · `/journeys/{id}` | `member.promo.read` |
| แคมเปญ | `/campaigns` · `/campaigns/new` · `/segments` · `/reviews` · `/referrals` | `member.promo.read` |
| รายงาน | `/reports/{tab}` | `member.report.view` |
| ตั้งค่า | `/settings/{fields,tiers,points,privacy,sources,notifications,api}` | `member.settings.manage` |
| นอก sys | `/app/party/{partyId}` (K3.4 → กลายเป็นทางเข้า 360) · `/m/*` ฝั่งลูกค้า (D4) | — |

### 2.3 URL state (แบบบอร์ดงาน)
`/members?q=&tier=&unit=&tag=&f.{fieldKey}=&segment=&view={savedViewId}&sort=&page=` · หน้า 360 `?tab=profile|wallet|history|reviews|referrals&type=&from=&to=`

---

## 3. หน้าจอทั้งหมด (30 surface · ภาพใน `ledger/design-member/`)

| # | หน้า | URL | ภาพ | สิ่งที่ต้องมี (เกณฑ์ parity) |
|---|---|---|---|---|
| 3.1 | หน้ารวมสมาชิก | `/members` | 01 | KPI 6 · ตัวกรองทุกฟิลด์ (รวมกำหนดเอง `filterable`) · มุมมองบันทึก ส่วนตัว/ทั้งทีม · ตาราง 10 คอลัมน์ตั้งได้ · bulk (แท็ก · ออก voucher · ให้แต้ม · ส่งข้อความ · ส่งออก) · เพิ่ม/นำเข้า |
| 3.2 | สมาชิก 360 | `/members/{id}` | 02 · 08 | หัว+ปุ่ม 5 · ตัวเลข 6 · แท็บ 5 · ส่วนตามเลย์เอาต์ · ส่วนอ่อนไหวตาม policy · แถบขวา AI/การเชื่อมต่อ/PDPA/ระดับถัดไป · ไทม์ไลน์กรองได้ · รีวิว · แนะนำเพื่อน |
| 3.3 | ตัวออกแบบฟิลด์ | `/settings/fields` | 03 | palette 11 ชนิด · ลากเรียงส่วน/ฟิลด์ · คุณสมบัติ 10 รายการ · เทมเพลตกิจการ · ตัวอย่างมือถือ · เพดาน 60 |
| 3.4 | ระดับ + กฎ | `/tiers` `/tiers/rules` | 04 · 15 | บันไดระดับ · ตัวสร้างกฎประโยค · คงระดับ/ลด/รอบ/ผ่อนผัน · ทดลองรัน · ประวัติ · แบบเสียเงิน · แก้สิทธิประโยชน์ 9 ชนิด |
| 3.5 | Loyalty รวม | `/points` `/stamps` `/rewards` | 05 · 16 · 17 · 18 | กฎแต้ม · หมดอายุ · หนี้สิน · สแตมป์ editor+การ์ดจริง · รางวัล editor · รับของ QR |
| 3.6 | Wallet ที่ POS | (ในโมดูล POS) | 06 | แผงสิทธิ์ · ลำดับส่วนลด · กันซ้อน · สแตมป์ในบิล · แต้มที่จะได้ |
| 3.7 | Promotion | `/vouchers` `/giftcards` `/journeys` | 07 · 19 · 20 · 22 | journey builder · รายการ journey+ROI · voucher ออกรายคน/กลุ่ม (อนุมัติเมื่อเกินเพดาน) · gift card ขาย/ตั้งค่าพ่วงบัญชี · journey detail + holdout |
| 3.8 | แคมเปญ + segment | `/campaigns/new` `/segments` | 21 | segment builder ทุกฟิลด์ · ช่องทาง 4 · ตัวแปร · AI ร่าง · A/B · holdout · ตัวอย่าง LINE · ประมาณการต้นทุน |
| 3.9 | ประวัติ/รีวิว/แนะนำ | `/members/{id}?tab=history` `/reviews` `/referrals` | 08 · 23 · 24 | ไทม์ไลน์ 10 ชนิด · กล่องรีวิว · ตอบกลับ+AI · การ์ดอัตโนมัติ · ตั้งค่ารีวิว · แนะนำเพื่อน ตั้งค่า/leaderboard/กันโกง |
| 3.10 | ฝั่งลูกค้า (LIFF+แอป) | `/m/card` `/m/wallet` `/m/profile` `/m/join` | 09 · 29 | บัตร QR · wallet · โปรไฟล์แก้เอง (ฟิลด์ `customerEditable`) · ความยินยอม · PDPA · สมัคร 3 ขั้น (ที่มา `?src=` · OTP · ผู้แนะนำ) |
| 3.11 | สมัคร/ตัวซ้ำ/นำเข้า | `/members/new` `/members/duplicates` `/members/import` | 10 · 11 · 12 | โมดัลสมัคร (ที่มา · ฟิลด์ที่ตั้ง · ยินยอม · QR/ลิงก์ให้ลูกค้ากรอกเอง) · รวมคน (เลือกค่าต่อฟิลด์ · ledger โอน) · นำเข้าจับคู่คอลัมน์รวมฟิลด์กำหนดเอง |
| 3.12 | ช่องทางที่มา | `/settings/sources` `/reports/sources` | 13 | KPI · แท่งต่อช่องทาง · ลิงก์/QR ที่มา · attribution first/last |
| 3.13 | ความเป็นส่วนตัว | `/settings/privacy` | 14 | นโยบายเวอร์ชัน · ช่องทางยินยอม · **ใครดูอ่อนไหว (D8)** · บันทึกการดู · คำขอ PDPA · ลบอัตโนมัติ |
| 3.14 | แชท + สมาชิก | (ในโมดูลแชท) | 26 | แผงข้างห้อง · ผูกอัตโนมัติ/เลือก/สมัครจากแชท · ปุ่มด่วน 4 |
| 3.15 | AI + API | `/settings/api` + ผู้ช่วย | 27 | proposal flow · คีย์ API 3 ชุดสิทธิ์ · curl · manifest · webhook |
| 3.16 | แอปพนักงาน | (แอป SHARK) | 28 | ค้น/สแกน · สรุป+ปุ่ม 4 · ประทับ PIN |
| 3.17 | แจ้งเตือน/เทมเพลต | `/settings/notifications` | 30 | 8 เหตุการณ์ × 4 ช่องทาง · ตัวแปร · เวลาส่ง · quiet hours · เคารพยินยอม · สถิติ |
| 3.18 | รายงาน | `/reports/*` | 25 | ภาพรวม · RFM · ระดับ · แต้ม · โปรโมชัน · ช่องทาง · cohort · ส่งออก/ตั้งเวลา |

**มือถือ (พนักงาน)**: ทุกหน้า 3.1–3.9 ต้อง responsive ≤ 390px (รายการเป็นการ์ด · ตารางเป็นการ์ด 2 บรรทัด · แผงขวาเป็น sheet ล่าง) — ภาพ 28 เป็นแบบอ้างอิง

---

## 4. Data Model v2 (Prisma · additive ทั้งหมด · scope = tenant ยกเว้นระบุ)

### 4.1 แก้ตารางเดิม (เพิ่มคอลัมน์ล้วน — nullable/default)

```prisma
model Customer {                       // member.prisma — สมาชิกของระบบ MEMBER
  // เดิม: id tenantId memberSystemId memberCode name phone email tier totalSpentSatang visitCount tags marketingConsent consentAt partyId
  firstName        String?
  lastName         String?
  nickname         String?
  titleTh          String?             // คำนำหน้า
  birthDate        DateTime? @db.Date
  gender           MemberGender?
  nationality      String?             // ISO 3166-1 alpha-2
  avatarFileId     String?
  locale           String?  @default("th")
  preferredChannel MemberChannel?      // LINE/EMAIL/SMS/PHONE
  lineUserId       String?             // จาก ChatContact/LIFF
  status           MemberStatus @default(ACTIVE)   // ACTIVE/SUSPENDED/CLOSED/MERGED
  tierDefId        String?             // D1 — แทน enum
  tierPoints       Int      @default(0)            // แต้มระดับ (แยกจากแต้มใช้จ่าย)
  tierSince        DateTime?
  tierReviewAt     DateTime?           // รอบประเมินถัดไป
  source           MemberSource?       // D10
  sourceDetail     Json?               // { campaignId?, linkId?, staffUserId?, referrerCustomerId?, formId?, note? }
  ownerUserId      String?             // ผู้ดูแล
  homeUnitId       String?             // สาขาหลัก
  lastActivityAt   DateTime?
  spent12mSatang   BigInt   @default(0)  // cache รายวัน (cron)
  visits12m        Int      @default(0)
  reviewAvg        Decimal? @db.Decimal(3,2)
  referralCode     String?             // unique ต่อ tenant
  referredById     String?
  mergedIntoId     String?
  privacyVersion   Int?                // นโยบายที่ยอมรับ
  @@unique([tenantId, referralCode])
  @@index([tenantId, tierDefId]) @@index([tenantId, source]) @@index([tenantId, lastActivityAt]) @@index([tenantId, birthDate])
}
model PointLedger { lotId String? ; expiresAt DateTime? ; multiplier Decimal? @db.Decimal(4,2) ; ruleId String? }   // point.prisma
model PointSettings { expiryMode PointExpiryMode @default(MONTHS) ; expiryMonths Int @default(12) ; remindDays Int[] @default([30,7]) ; burnRateSatang Int @default(10) ; burnMinPoints Int @default(100) ; burnMaxPct Int @default(50) ; transferEnabled Boolean @default(false) ; transferMonthlyCap Int? ; adjustApprovalOver Int? ; earnBase String @default("NET") ; excludeGiftCard Boolean @default(true) ; excludeVoucher Boolean @default(true) ; dailyCap Int? }
model Coupon { perMemberCode Boolean @default(false) ; saveToWallet Boolean @default(true) ; stackWithVoucher Boolean @default(false) }
model MktCampaign { segmentId String? ; journeyId String? ; holdoutPct Int @default(0) ; variantB Json? ; pushEnabled Boolean @default(false) ; attachVoucherTemplateId String? ; stats Json? }
model MktRecipient { variant String? ; holdout Boolean @default(false) ; openedAt DateTime? ; usedAt DateTime? ; saleSatang BigInt? }
model ChatContact { partyId (มีแล้ว — **เขียนจริง**) ; customerId (มีแล้ว) ; linkedBy MemberLinkMethod? ; linkedAt DateTime? }
model CrmContact { memberCustomerId (มีแล้ว — auto เมื่อ deal won) }
model PosSale { voucherUseIds String[] @default([]) ; giftCardTxnId String? ; tierDiscountSatang Int @default(0) ; stampEventIds String[] @default([]) ; attributionId String? }
model Appointment { stampEventId String? }
model AutomationRule { scope AutomationScope @default(KANBAN) ; memberSystemId String? ; tierDefId String? ; journeyStats Json? }   // D15
model AppSystem.settings.member (Json) { giftCard: { enabled, accountingLink, expiryMonths }, referral: {...}, review: {...}, notifications: {...} }
```

### 4.2 Enum ใหม่
```
MemberGender        MALE FEMALE OTHER UNSPECIFIED
MemberChannel       (ยกเลิก enum — D19 ใช้ String key จาก `channels.ts` (แผน · src/lib/core/))
MemberStatus        ACTIVE SUSPENDED CLOSED MERGED
MemberSource        WALK_IN POS BOOKING LINE_OA LIFF WEB_FORM CHAT REFERRAL IMPORT CRM CAMPAIGN API MARKETPLACE APP OTHER  (+ `sourceChannel String?` = key ช่องทางจริง เช่น WHATSAPP/SHOPEE)
MemberLinkMethod    PHONE EMAIL CHANNEL_ID MANUAL MERGE ORDER
MemberFieldType     TEXT LONG_TEXT NUMBER MONEY DATE DATETIME SELECT MULTI_SELECT BOOLEAN FILE LOOKUP
MemberLookupTarget  PRODUCT SERVICE EMPLOYEE UNIT CUSTOMER
MemberConsentChannel (ยกเลิก enum — D19 ใช้ String key · canConsent=true เท่านั้น)
MemberConsentSource  SIGNUP_FORM LIFF STAFF IMPORT API CUSTOMER_SELF
TierChangeReason    RULE_UPGRADE RULE_DOWNGRADE RULE_KEEP MANUAL PAID_PLAN PLAN_EXPIRED MERGE INITIAL
TierBenefitType     DISCOUNT_PCT DISCOUNT_FIXED POINT_MULTIPLIER WELCOME_VOUCHER BIRTHDAY_GIFT FREE_SERVICE PRIORITY_BOOKING NO_POINT_EXPIRY CANCEL_FEE_DISCOUNT EXCLUSIVE_ITEMS
PointExpiryMode     MONTHS END_OF_YEAR NEVER
PointRuleKind       BASE TIER_MULTIPLIER ITEM_BONUS CATEGORY_BONUS TIME_MULTIPLIER EVENT_BONUS
PointEventBonus     SIGNUP BIRTHDAY REVIEW REFERRAL PROFILE_COMPLETE CHECKIN
StampRuleKind       PER_SALE_MIN PER_ITEM PER_VISIT PER_DAY MANUAL
StampEventType      ADD USE EXPIRE VOID MERGE
StampRewardKind     VOUCHER REWARD POINTS DISCOUNT_NEXT
RewardKind          ITEM SERVICE VOUCHER DISCOUNT
VoucherKind         FIXED PERCENT FREE_SERVICE FREE_ITEM
VoucherOrigin       TIER BIRTHDAY JOURNEY CAMPAIGN REDEEM COMPENSATION REFERRAL STAMP MANUAL API
VoucherStatus       ACTIVE USED EXPIRED CANCELLED
GiftCardStatus      ACTIVE DEPLETED EXPIRED SUSPENDED
GiftCardTxnType     SELL USE RELOAD TRANSFER EXPIRE REFUND ADJUST
ReviewStatus        NEW REPLIED ESCALATED HIDDEN
ReferralStatus      PENDING CONVERTED REWARDED REJECTED
ReferralRewardKind  POINTS VOUCHER
AutomationScope     KANBAN MEMBER_TIER MEMBER_JOURNEY
PrivacyRequestType  EXPORT DELETE
PrivacyRequestStatus PENDING APPROVED DONE REJECTED
```

### 4.3 ตารางใหม่ (ทุกตารางมี `id tenantId createdAt updatedAt` · unique/index ระบุ)

```prisma
// ── โปรไฟล์ / ฟิลด์ (D14) ──
model MemberSection { systemId; key; label; description?; columns Int @default(2); sortOrder; isSystem Boolean; sensitive Boolean @default(false); collapsed Boolean @default(false); @@unique([systemId, key]) }
model MemberField   { systemId; sectionId; key; label; description?; type MemberFieldType; options Json?   // SELECT/MULTI: {choices:[{value,label,color?}]} · NUMBER/MONEY: {unit?,decimals?,min?,max?} · TEXT: {pattern?,maxLength?} · LOOKUP: {target: MemberLookupTarget}
                     required Boolean; defaultValue Json?; unique Boolean; filterable Boolean; showInList Boolean; showOnCard Boolean; customerEditable Boolean; sensitive Boolean; trackHistory Boolean; isSystem Boolean; systemKey String?; sortOrder; archivedAt?; @@unique([systemId, key]) }
model MemberFieldValue { customerId; fieldId; valueText String?; valueNumber Decimal? @db.Decimal(18,4); valueDate DateTime?; valueBool Boolean?; valueOptions String[] @default([]); valueRef String?; valueFileId String?; updatedById?; @@unique([customerId, fieldId]); @@index([fieldId, valueText]) @@index([fieldId, valueNumber]) @@index([fieldId, valueDate]) }
model MemberFieldValueHistory { customerId; fieldId; oldValue Json?; newValue Json?; changedById?; changedVia MemberConsentSource; @@index([customerId, fieldId, createdAt]) }
model MemberAddress { customerId; kind String @default("HOME"); line1; line2?; subdistrict?; district?; province?; postcode?; country String @default("TH"); isDefault Boolean; @@index([customerId]) }
model MemberConsent { customerId; channel String /* D19: key จากทะเบียนช่องทางกลาง */; granted Boolean; source MemberConsentSource; policyVersion Int?; grantedAt?; revokedAt?; byUserId?; @@unique([customerId, channel]) }
model MemberPrivacyPolicy { systemId; version Int; bodyHtml; effectiveAt; @@unique([systemId, version]) }
model MemberSensitivePolicy { systemId; targetType String /* SECTION|FIELD */; targetId; roles Role[]; hrPositions String[] @default([]); hrDepartmentIds String[] @default([]); sameUnitOnly Boolean @default(false); logAccess Boolean @default(true); @@unique([systemId, targetType, targetId]) }   // D8 + D17 (ผ่านถ้าเข้าเงื่อนไข roles หรือ hrPositions/departments · แล้วตรวจ sameUnitOnly)
model MemberAccessLog { customerId; userId; hrEmployeeId?; hrPosition?; targetType; targetId; page String?; @@index([customerId, createdAt]) @@index([userId, createdAt]) }   // D17
model MemberPrivacyRequest { customerId; type PrivacyRequestType; status PrivacyRequestStatus; requestedVia MemberConsentSource; approvalRequestId?; fileId?; doneAt?; @@index([tenantId, status]) }
model MemberSavedView { systemId; ownerUserId?; scope String /* PRIVATE|TEAM */; name; filters Json; columns Json; sort Json?; sortOrder; @@index([systemId, scope]) }
model MemberTag { systemId; name; color TagColor?; @@unique([systemId, name]) }   // แท็กแบบมีทะเบียน (Customer.tags Json เดิมคง backward compat + backfill)

// ── ตัวตนหลายช่องทาง (D18) ──
model MemberChannelIdentity { customerId; channel String /* key ทะเบียนช่องทาง */; externalId String; displayName?; contactId? /* ChatContact */; verified Boolean @default(false); linkedBy MemberLinkMethod; linkedAt; lastSeenAt?; @@unique([tenantId, channel, externalId]) @@index([customerId]) }
model HrEmployee { + userId String? /* D17 ผูกบัญชีผู้ใช้ · backfill จากอีเมล */ }

// ── ที่มา (D10) ──
model AcquisitionLink { systemId; code; name; source MemberSource; campaignId?; unitId?; target String /* LIFF_JOIN|WEB_FORM|CHAT */; utm Json?; qrFileId?; hits Int @default(0); signups Int @default(0); firstPurchases Int @default(0); active Boolean; @@unique([tenantId, code]) }
model MemberAttribution { customerId; touch String /* FIRST|LAST */; source MemberSource; linkId?; campaignId?; staffUserId?; referrerCustomerId?; unitId?; occurredAt; @@unique([customerId, touch]) }

// ── ระดับ (D1) ──
model MemberTierDef { systemId; key; name; color TagColor; icon?; sortOrder; description?; isDefault Boolean; paidPlanId?; legacyTier MemberTier?; keepRuleId?; upgradeRuleId?; reviewCron String? @default("0 3 1 * *"); graceDays Int @default(30); notifyBeforeDays Int @default(30); archivedAt?; @@unique([systemId, key]) }
model MemberTierBenefit { tierDefId; type TierBenefitType; config Json /* DISCOUNT_PCT {pct,maxSatang,categories[]} · POINT_MULTIPLIER {x} · WELCOME_VOUCHER {templateId} · BIRTHDAY_GIFT {kind,value} · FREE_SERVICE {stampCardId,perYear} · PRIORITY_BOOKING {daysAhead} · CANCEL_FEE_DISCOUNT {pct} · EXCLUSIVE_ITEMS {itemIds[]} */; active Boolean; @@index([tierDefId]) }
model MemberTierHistory { customerId; fromTierDefId?; toTierDefId?; reason TierChangeReason; ruleId?; evidence Json /* {spent12m, visits12m, tierPoints, thresholds} */; byUserId?; approvalRequestId?; notifiedAt?; @@index([customerId, createdAt]) }

// ── แต้ม (D2) ──
model PointRule { systemId; kind PointRuleKind; config Json /* BASE {satangPerPoint,base NET|GROSS} · TIER_MULTIPLIER {tierDefId,x} · ITEM_BONUS {itemIds[],points} · CATEGORY_BONUS {categoryIds[],x|points} · TIME_MULTIPLIER {cron|dow[],from,to,x} · EVENT_BONUS {event,points} */; priority; active; @@index([systemId, active]) }
model PointLot { customerId; systemId; ledgerId; points Int; remaining Int; earnedAt; expiresAt?; expiredAt?; @@index([customerId, expiresAt]) @@index([systemId, expiresAt]) }
model PointTransfer { fromCustomerId; toCustomerId; points; feePoints Int @default(0); otpVerifiedAt?; ledgerOutId; ledgerInId; @@index([fromCustomerId, createdAt]) }

// ── สแตมป์ ──
model StampCard { systemId; name; description?; slots Int; ruleKind StampRuleKind; ruleConfig Json /* {minSatang?, itemIds[]?, serviceIds[]?, perDayMax, allowStaffScan, allowAutoFromSale, staffPin} */; rewardKind StampRewardKind; rewardConfig Json; autoRestart Boolean; validMonths Int?; tierDefIds String[]; unitIds String[]; active; sortOrder; @@index([systemId, active]) }
model StampCardProgress { cardId; customerId; cycle Int @default(1); stamps Int @default(0); startedAt; completedAt?; expiresAt?; rewardVoucherId?; @@unique([cardId, customerId, cycle]) }
model StampEvent { progressId; type StampEventType; count Int @default(1); refType?; refId?; byUserId?; unitId?; idempotencyKey; @@unique([tenantId, idempotencyKey]) @@index([progressId, createdAt]) }

// ── รางวัล (ต่อยอด Reward/RewardRedemption เดิม) ──
model Reward { + kind RewardKind; imageFileId?; stampCardId?; stampsCost Int?; tierDefIds String[]; perMemberMonthly Int?; startAt?; endAt?; unitIds String[]; pickupDays Int @default(14); showToCustomer Boolean @default(true) }
model RewardRedemption { + qrCode; expiresAt?; fulfilledById?; fulfilledUnitId?; cancelReason? }

// ── Promotion ──
model VoucherTemplate { systemId; name; kind VoucherKind; value Int /* satang | pct | serviceId ref via config */; config Json /* {minSatang?, categoryIds[]?, itemIds[]?, stackWithCoupon, maxDiscountSatang?, unitIds[]} */; validDays Int; origin VoucherOrigin; active; @@index([systemId]) }
model Voucher { templateId?; customerId; code; kind; value; config Json; origin VoucherOrigin; originRef Json? /* {journeyId|campaignId|tierDefId|reviewId|referralId|stampProgressId|userId} */; issuedAt; expiresAt; status VoucherStatus; usedAt?; usedRef Json? /* {saleId|appointmentId} */; cancelledAt?; approvalRequestId?; idempotencyKey; @@unique([tenantId, code]) @@unique([tenantId, idempotencyKey]) @@index([customerId, status]) @@index([systemId, expiresAt]) }
model GiftCard { systemId; number; pinHash; initialSatang; balanceSatang; buyerCustomerId?; ownerCustomerId?; recipientContact Json?; message?; status GiftCardStatus; expiresAt?; saleId?; accountingDocId?; @@unique([tenantId, number]) @@index([ownerCustomerId]) }
model GiftCardTxn { giftCardId; type GiftCardTxnType; satang Int; balanceAfter Int; refType?; refId?; byUserId?; idempotencyKey; @@unique([tenantId, idempotencyKey]) @@index([giftCardId, createdAt]) }
model MemberSegment { systemId; name; definition Json /* [{field, op, value}] AND-groups OR */; lastCount Int?; lastCountAt?; ownerUserId?; scope String; @@index([systemId]) }
model CampaignVariantStat { campaignId; variant String; sent; opened; used; saleSatang BigInt; @@unique([campaignId, variant]) }

// ── รีวิว / แนะนำเพื่อน ──
model MemberReview { customerId; systemId; unitId?; refType? /* PosSale|Appointment */; refId?; serviceId?; staffEmployeeId?; rating Int; body?; photoFileIds String[]; status ReviewStatus; replyBody?; repliedById?; repliedAt?; kanbanCardId?; requestSentAt?; source MemberConsentSource; @@index([systemId, createdAt]) @@index([customerId]) @@index([systemId, rating]) }
model ReviewSettings (ใน AppSystem.settings.member.review) { askAfterHours, channel, rewardPoints, escalateBelow, escalateBoardId, escalateAssigneeRole, replyTemplate }
model ReferralProgram { systemId; enabled; referrerRewardKind ReferralRewardKind; referrerRewardValue Json; refereeRewardKind; refereeRewardValue Json; convertOn String /* SIGNUP|FIRST_PURCHASE */; minFirstPurchaseSatang Int?; monthlyCap Int?; fraudPhoneDevice Boolean; shareText; @@unique([systemId]) }
model Referral { referrerCustomerId; refereeCustomerId?; refereeContact Json?; code; linkId?; status ReferralStatus; convertedAt?; conversionRef Json?; rewardedAt?; referrerRewardRef Json?; refereeRewardRef Json?; rejectReason?; @@index([referrerCustomerId]) @@unique([tenantId, refereeCustomerId]) }

// ── API ──
model MemberApiKey (ใช้ `ApiKey` กลางเดิม + scope bundle `member.readonly|member.operate|member.admin`)
```

### 4.4 ตารางที่ **ไม่** สร้าง
- `MemberWallet` — wallet เป็น view/query รวม (แต้ม+voucher+coupon+gift card+รางวัล+สแตมป์) ไม่ใช่ตาราง
- `Journey`/`JourneyStep` — ใช้ `AutomationRule` (D15) · ขั้น "รอ N วันแล้วทำต่อ" = action `WAIT_THEN` เก็บใน `AutomationRule.actions` + `AutomationRun` ที่มี `scheduledAt`
- `MemberEvent` ใหม่ — ใช้ `MemberActivity` เดิม (เพิ่ม index `[customerId, module, createdAt]` + คอลัมน์ `data Json?` `unitId?` `actorUserId?`)

### 4.5 backward compat
- `Customer.tier` (enum) ← sync จาก `tierDefId.legacyTier` ทุกครั้งที่เปลี่ยนระดับ (โค้ดเก่า marketing/rules ยังอ่านได้) · `Customer.marketingConsent` ← `MemberConsent(LINE|EMAIL|SMS).any(granted)`
- `MemberTierConfig` เดิม → backfill เป็น `MemberTierDef` + upgradeRule (`spent12m ≥ minSpendSatang`) · ไฟล์เดิมคงอยู่ 1 รอบแล้วลบ

### 4.6 แผน backfill (สคริปต์ idempotent ทีละร้าน · รันมือหลัง migration)
1. `member-backfill-tiers.mts` — สร้าง TierDef 4 แถว/ร้าน · map Customer.tier → tierDefId · TierHistory INITIAL
2. `member-backfill-fields.mts` — สร้าง Section/Field ระบบ (isSystem) ตาม §11.2 ทุกร้าน · ค่าเดิม (name/phone/email) ไม่ย้าย (อ่านจากคอลัมน์ Customer โดยตรง — ฟิลด์ระบบ = pointer)
3. `member-backfill-consent.mts` — marketingConsent → MemberConsent 3 แถว source IMPORT
4. `member-backfill-points-lots.mts` — สร้าง PointLot จาก EARN เดิม (remaining = สุทธิหลัง burn แบบ FIFO จำลอง · expiresAt = earnedAt + 12 เดือน · ล็อตที่ "ควรหมดแล้ว" → **ไม่ตัดย้อนหลัง** ตั้ง expiresAt = วันรัน + 90 วัน + แจ้งลูกค้า — ตัดสินใจเพื่อไม่ทำลูกค้าตกใจ)
5. `member-backfill-party-links.mts` — ChatContact/CrmContact/AccountContact ที่ partyId null → จับคู่เบอร์/อีเมล
6. `member-backfill-attribution.mts` — Customer เดิม source=IMPORT(ถ้ามาจาก import) / WALK_IN · first touch = createdAt

---

## 5. Service API (ไฟล์ · ฟังก์ชัน · กติกา)

### 5.1 กติกาโครงไฟล์ (บทเรียนจากบอร์ดงาน/บัญชี)
- โมดูล `src/lib/modules/member/` เป็นเจ้าของ: profile · fields · tiers · consent · sources · reviews · referrals · wallet(view) · segments · reports · templates · notifications
- โมดูลเดิมยังเป็นเจ้าของตัวเอง: `point/` (เพิ่ม lots/rules/transfer/expire) · `coupon/` · `reward/` (เพิ่ม fulfil/QR/stamp cost) · `marketing/` (เพิ่ม segment/holdout/variant/push) · ใหม่ `stamp/` · `voucher/` · `giftcard/`
- **ห้าม import ข้ามโมดูลตรง** — ผ่าน facade `index.ts` ของแต่ละโมดูล (fitness F2 `ALLOWED_EDGES` เพิ่ม: `member→party` · `member→point` · `member→voucher` · `pos→member(wallet facade)` · `chat→member(link facade)` · `voucher→point`(แลกแต้ม) · `stamp→voucher` · `giftcard→account`(เมื่อ accountingLink))
- consumer ข้ามหลายโมดูล อยู่ composition root `member-bridges.ts` (แผน · src/lib/platform/) · `member-outbound.ts`
- ทุก mutation: `ctx {tenantId, systemId, actorUserId|null}` + `actor` (สิทธิ์) + `idempotencyKey` เมื่อสร้างมูลค่า · รับ `tx?` · emit outbox หลัง commit
- ไม่มี `any` · zod v4 · error ไทยไม่โทษผู้ใช้ · วันไทย +07:00 คำนวณเอง

### 5.2 `profile.ts` (แผน · member/)
| ฟังก์ชัน | ทำอะไร | สิทธิ์ | event |
|---|---|---|---|
| `createMember(ctx, actor, input{fields, consents[], source, sourceDetail, referralCode?, welcome?})` | ตรวจซ้ำ (เบอร์/อีเมล/LINE ผ่าน party.findOrCreate) · สร้าง Customer+partyId · เขียนค่าฟิลด์ · consent · attribution FIRST/LAST · referral PENDING · แต้มต้อนรับ (event) · memberCode ตามรูปแบบ | `member.customer.create` | `member.created` |
| `updateMember(ctx, actor, id, patch{fields})` | ตรวจ `MemberField` (required/unique/type/choices) · เขียน history เมื่อ `trackHistory` · ฟิลด์อ่อนไหวต้องผ่าน policy · `customerEditable` เมื่อ actor=CUSTOMER | `member.customer.update` | `member.updated` |
| `getMember360(ctx, actor, id)` | โปรไฟล์ + ค่าฟิลด์ตามเลย์เอาต์ + ซ่อนอ่อนไหวตาม policy (+ log) + ตัวเลข 6 + ระดับถัดไป + การเชื่อมต่อ (นับจาก party) | `member.customer.read` | `member.sensitive.viewed` (เมื่อเปิดส่วนอ่อนไหว) |
| `listMembers(ctx, actor, {q, filters(รวม f.{key}), segmentId, viewId, sort, page})` | ตัวกรองรวมฟิลด์กำหนดเอง (join MemberFieldValue ตามชนิด) · unit scope | read | — |
| `findDuplicates` · `mergeMembers(ctx, actor, {keepId, mergeId, fieldChoices})` | ใช้ party merge + โอน ledger ทุกชนิด (points/vouchers/stamps/giftcards/history) เป็นรายการ MERGE · ตั้ง mergedIntoId | `member.customer.merge` | `member.merged` |
| `importMembers(ctx, actor, {rows, mapping, options})` | จับคู่คอลัมน์→ฟิลด์ (รวมกำหนดเอง) · ตรวจแถว · ซ้ำ: update/skip/candidate · source IMPORT | `member.customer.import` | `member.created`×n |
| `setStatus` · `setOwner` · `setTags` · `exportMembers` | — | update/read | `member.updated` |
| `linkIdentity(ctx, {channel, externalId, phone?, email?, displayName?, contactId?}) → {customerId?, matchedBy, candidates[]}` (D18) | กติกาตายตัว: เบอร์ → อีเมล → id ช่องทางที่เคยผูก → ไม่ตรง = คืน candidates (ชื่อคล้าย) + สร้าง PartyMergeCandidate · ตรงชัด → เขียน `MemberChannelIdentity` + `ChatContact.partyId/customerId` | (internal · facade) | `member.identity.linked` |
| `listIdentities(customerId)` · `unlinkIdentity` · `mergeIdentities` (ตอนรวมคน) | — | update | `member.updated` |

### 5.3 `fields.ts` (แผน · member/) (D14 · แบบ K2.6)
`listLayout` · `createSection/updateSection/reorderSections/deleteSection(ว่างเท่านั้น)` · `createField/updateField/archiveField/reorderFields` (isSystem: แก้ได้เฉพาะ label/description/sortOrder/required=false/showInList) · `setFieldValue(s)` (validate ต่อชนิด · SELECT ต้องอยู่ใน choices · LOOKUP ตรวจ target มีจริงในร้าน · unique ตรวจ) · `getFieldValues(customerIds[])` batch · `applyTemplate(templateKey)` (เพิ่มส่วน/ฟิลด์ที่ยังไม่มี ไม่ทับของเดิม) · `fieldFilterWhere(filters)` (สร้าง Prisma where จาก f.{key})

### 5.4 `tiers.ts` (แผน · member/) (D1)
`listTierDefs/createTierDef/updateTierDef/reorderTierDefs/archiveTierDef` · `setBenefits(tierDefId, benefits[])` · `evaluateMember(ctx, customerId, now) → {current, next, evidence, wouldUpgradeTo?, wouldDowngradeTo?, progressToNext}` (อ่านกฎ AutomationRule scope MEMBER_TIER) · `applyTierChange(ctx, customerId, toTierDefId, reason, evidence, byUserId?)` (history + sync legacy enum + event + benefits: welcome voucher) · `runTierReview(ctx, systemId, now, {dryRun})` (cron รายวันตรวจ `tierReviewAt` ≤ now → ประเมิน → เลื่อน/คง/ลด ตาม graceDays · dryRun คืนรายชื่อ) · `benefitsFor(customerId) → { discount, pointMultiplier, priorityDays, freeServices[], ... }` (facade ให้ POS/จอง) · `setManualTier` (เหตุผลบังคับ · เกิน policy → approval)

### 5.5 `point/` (ต่อยอด)
`rules.ts`: `listRules/upsertRule/toggleRule` · `computeEarn(ctx, {customerId, sale{lines, netSatang, paidBy}, event?}) → {points, breakdown[]}` (ฐาน→ตัวคูณระดับ→สินค้า/หมวด→เวลา→เพดานวัน · ตัด gift card/voucher ตาม settings) · `lots.ts`: `earnWithLot` (ledger EARN + PointLot expiresAt ตาม settings/ระดับยกเว้น) · `burnFifo` (ตัดล็อตเก่าก่อน · ledger BURN lotIds ใน data) · `expireDue(now)` (cron รายวัน → ledger EXPIRE ต่อล็อต + balance − + event `point.expired`) · `expiringSoon(customerId|systemId, days)` · `transfer(ctx, from, to, points, otp)` · `adjust` (เกิน `adjustApprovalOver` → approval) · `reverse` เดิม (คืนล็อต)

### 5.6 `service.ts` (แผน · stamp/)
`createCard/updateCard/toggleCard/listCards` · `addStamp(ctx, actor, {cardId, customerId, count, refType, refId, byPin?, idempotencyKey})` (ตรวจ ruleKind · perDayMax · tier/unit · ครบ → `completeCycle`: rewardKind → voucher/reward/points/discount · autoRestart) · `autoStampFromSale(sale)` (consumer) · `autoStampFromVisit(appointment)` · `progressFor(customerId)` · `void` · `expireDue`

### 5.7 `service.ts` (แผน · voucher/) · `service.ts` (แผน · giftcard/) · `coupon/` (ต่อยอด)
- voucher: `templates CRUD` · `issue(ctx, actor, {customerIds[]|segmentId, template|adhoc, origin, originRef, notify})` (มูลค่ารวม > เพดาน → approval · idempotency ต่อ (customer, originRef)) · `validate(ctx, customerId, code, cart) → {ok, discountSatang, reason?}` · `redeem(ctx, {voucherId, saleId}, tx)` (ATOMIC status ACTIVE→USED) · `release` (void sale) · `cancel` · `expireDue` · `listForCustomer`
- giftcard: `sell(ctx, actor, {satang, buyer, recipient, message, expiresAt}) → {number, pin}` (PosSale ชนิด GIFT_CARD_SALE ไม่ให้แต้ม · accountingLink → บัญชี รับเงินล่วงหน้า) · `use(ctx, {number, pin, satang, saleId}, tx)` (balance − · accountingLink → รายได้) · `reload` · `transfer` · `suspend` · `expireDue` (accountingLink → รายได้อื่น) · `balance`
- coupon: `issuePerMemberCodes(couponId, customerIds)` · `saveToWallet` · reuse validate/redeem/release เดิม

### 5.8 `wallet.ts` (แผน · member/) (facade ให้ POS/จอง/LIFF)
`getWallet(ctx, customerId, {cart?}) → { points{balance, expiringSoon[]}, vouchers[applicable], coupons[], giftCards[], rewardsPending[], stamps[], tierBenefits, paidPlan }` · `quoteApply(ctx, customerId, cart, choices{voucherIds, points, giftCard{number,pin,satang}, couponCode}) → { lines[], order[TIER,VOUCHER,COUPON,POINTS,GIFTCARD], totalDiscount, net, pointsToEarn, conflicts[] }` (กันซ้อนตาม settings · ลำดับตายตัว) · `applyOnSale(ctx, saleId, choices, tx)` (เรียก redeem ทุกชนิดใน tx ของ POS · **แต้มที่ได้/สแตมป์ เป็น consumer หลัง commit**)

### 5.9 `marketing/` (ต่อยอด) · journey
`segments.ts`: `evaluateSegment(definition) → where` (ทุกฟิลด์ระบบ + `f.{key}` + loyalty (points/tier/lastActivity/voucherCount) + consent) · `countSegment` · `sampleSegment` · `saveSegment` · `campaigns.ts`: `createCampaign` (+segmentId, variantB, holdoutPct, attach voucher, channels[]) · `send` (แบ่ง holdout สุ่มคงที่ต่อ (campaign, customer) · LINE ผ่าน chat facade `sendReply`/push message · อีเมล Resend · push `sendPushToUsers`… ลูกค้า = `PushDevice` ของ customer app) · `trackOpen/trackUse` (consumer `voucher.used`/`pos.sale.paid` ภายใน 30 วัน) · journey = `automation.ts` เดิม: trigger `member.*` · condition ฟิลด์สมาชิก/ระดับ/ยินยอม/segment · action ใหม่ `ISSUE_VOUCHER · GIVE_POINTS · SEND_LINE · SEND_EMAIL · SEND_SMS · SEND_PUSH · ADD_TAG · WAIT_THEN · OPEN_KANBAN_CARD · NOTIFY_STAFF` · `journeyStats` รวมจาก AutomationRun + CampaignVariantStat

### 5.10 `reviews.ts` (แผน · member/) · `referrals.ts` (แผน · member/) · `sources.ts` (แผน · member/) · `privacy.ts` (แผน · member/) · `notifications.ts` (แผน · member/) · `reports.ts` (แผน · member/)
- reviews: `requestReview(customerId, ref)` (journey/consumer หลังบริการ · LINE ลิงก์ LIFF) · `submitReview` (ลูกค้า · rating 1–5 · รูป ≤ 3 · แต้มตาม settings) · `reply` · `escalate` (≤ escalateBelow → `kanban.createCardFromExternal` sourceType REVIEW + ลิงก์ PARTY) · `summarize(period)` (AI · prompt อังกฤษ) · `stats`
- referrals: `program CRUD` · `codeFor(customerId)` · `attach(refereeCustomerId, code|link)` (ตอนสมัคร) · `evaluateConversion(sale|signup)` (consumer) · `rewardBoth` (แต้ม/voucher ตาม program · idempotency) · `reject(fraud)` · `leaderboard`
- sources: `links CRUD` · `resolveSource(request{src, ref, staff, form})` · `recordTouch(customerId, touch)` · `reportBySource(period)` · attribution: first ไม่เขียนทับ · last อัปเดตทุก touch ที่รู้ที่มา
- privacy: `policies CRUD/publish` · `setConsent(customerId, channel, granted, source, by)` · `sensitivePolicy CRUD` · `canView(actor, target)` · `logAccess` · `requestExport/requestDelete` (→ approval) · `exportBundle(customerId)` (รวมทุกโมดูลผ่าน Party) · `eraseMember` (anonymize PII · ledger คงยอด · เอกสารบัญชีคงตามกฎหมาย)
- notifications: `templates CRUD` (8 เหตุการณ์ × 4 ช่องทาง · ตัวแปร) · `send(event, customerId, vars)` (เคารพ consent · quiet hours · รวมรายวัน) · `stats`
- reports: `overview` · `rfm` · `tiers` · `points` (ออก/ใช้/หมด/คงค้าง/หนี้สิน) · `promotions` (ROI ต่อ journey/campaign) · `sources` · `cohort` · `exportCsv` · `scheduleEmail`

### 5.11 Facade ที่เปิดให้โมดูลอื่นเรียก (ไม่ใช่ HTTP)
| facade | ผู้เรียก | ฟังก์ชัน |
|---|---|---|
| `index.ts` (แผน · member/) | POS · จอง · แชท · CRM · ฟอร์ม · บอร์ดงาน · AI | `findOrCreate` (เดิม) · `linkContact(partyId|phone|lineUserId) → customerId?` · `getWallet` · `quoteApply` · `applyOnSale` · `benefitsFor` · `logActivity` (เดิม) · `briefFor(customerIds[])` (ชื่อ/ระดับ/แต้ม สำหรับแผงข้าง) · `resolveSource` |
| `index.ts` (แผน · point/) | POS · reward · voucher · referral | `computeEarn` · `earnWithLot` · `burnFifo` · `credit` · `reverse` · `getBalance` |
| `index.ts` (แผน · voucher/) | POS · จอง · journey · stamp · referral · review | `validate` · `redeem` · `release` · `issue` |
| `index.ts` (แผน · giftcard/) | POS · account | `use` · `balance` · `sell` |
| `index.ts` (แผน · stamp/) | POS · จอง · แอปพนักงาน | `addStamp` · `progressFor` |

---

## 6. สิทธิ์ v2

### 6.1 คีย์สิทธิ์ (เพิ่มใน `src/lib/core/permissions.ts` กลุ่ม member)
```
member.customer.read · member.customer.create · member.customer.update · member.customer.merge · member.customer.import · member.customer.export · member.customer.delete(=PDPA erase → approval)
member.sensitive.read (ผ่าน MemberSensitivePolicy เพิ่มเติม — D8)
member.tier.read · member.tier.manage · member.tier.setManual
member.point.read · member.point.adjust · member.point.transfer
member.loyalty.read · member.loyalty.manage (สแตมป์/รางวัล) · member.loyalty.stamp (ประทับ) · member.loyalty.fulfil
member.promo.read · member.promo.issue (voucher/coupon) · member.promo.manage (template/journey/campaign) · member.giftcard.sell · member.giftcard.manage
member.review.read · member.review.reply · member.referral.manage
member.report.view · member.settings.manage · member.privacy.manage · member.api.manage
```
- read-โดยนัย: มีคีย์ `member.*` ตัวใดตัวหนึ่ง = `member.customer.read` (บทเรียน K3.1)
- OWNER ทุกคีย์ · MANAGER ค่าเริ่มต้น: ทุกคีย์ยกเว้น settings/privacy/api/giftcard.manage · STAFF ค่าเริ่มต้น: customer.read/create/update · loyalty.stamp · promo.issue(เพดานต่ำ) · review.reply
- unit scope: STAFF/MANAGER ที่ `unitAccess` จำกัด เห็นสมาชิก `homeUnitId` ในสาขาตน + สมาชิกที่เคยซื้อ/จองในสาขาตน (ผ่าน MemberActivity.unitId) · OWNER ทั้งร้าน

### 6.2 ตาราง action × role (ตัวอย่างสำคัญ)
| action | STAFF | MANAGER | OWNER | CUSTOMER (LIFF/แอป) | API key |
|---|---|---|---|---|---|
| ดูโปรไฟล์ | สาขาตน | สาขาที่มีสิทธิ์ | ทั้งร้าน | ตนเอง | ตาม bundle |
| ดูส่วนอ่อนไหว | ตาม policy (ค่าเริ่มต้น ✗) | ตาม policy (✓) | ✓ | ตนเอง (เฉพาะ customerEditable) | ✗ (readonly ไม่รวมอ่อนไหว) |
| แก้ฟิลด์ | ✓ (ไม่รวมอ่อนไหวถ้า policy ห้าม) | ✓ | ✓ | เฉพาะ `customerEditable` | operate |
| ปรับแต้มมือ | ≤ เพดาน | ≤ เพดาน / เกิน → approval | ✓ | ✗ | operate (≤ เพดาน) |
| ออก voucher | ≤ ฿500/ใบ (ตั้งได้) | ≤ เพดาน | ✓ | ✗ | operate |
| ตั้งระดับมือ | ✗ | เหตุผล+approval | ✓ | ✗ | admin |
| แก้ฟิลด์/ระดับ/กฎ/นโยบาย | ✗ | ✗ | ✓ | ✗ | admin |
| ประทับสแตมป์ | ✓ (PIN) | ✓ | ✓ | ✗ | operate |
| รวมคน · ลบ PDPA | ✗ | approval | ✓ (approval สำหรับลบ) | ขอได้ | ✗ |

### 6.3 อัลกอริทึม "ดูข้อมูลอ่อนไหวได้ไหม" (D8 + D17)
```
canViewSensitive(actor, target):
  policy = MemberSensitivePolicy(target) ?? default{roles:[OWNER,MANAGER]}
  if actor.role == OWNER → true
  hr = HrEmployee where userId = actor.userId (ถ้าไม่ผูก = ไม่มีตำแหน่ง)
  pass = policy.roles.includes(actor.role) || policy.hrPositions.includes(hr?.position) || policy.hrDepartmentIds.includes(hr?.departmentId)
  if pass && policy.sameUnitOnly → ต้อง actor.unitAccess ครอบ customer.homeUnitId (หรือ "*")
  if pass && policy.logAccess → MemberAccessLog{userId, hrEmployeeId, hrPosition, target}
  return pass
```
- ตั้งค่าใน `/settings/privacy` (ภาพ 14): ต่อส่วน/ฟิลด์ × บทบาท × ตำแหน่ง/แผนก HR (ชิปเลือกจากทะเบียน HR) × สาขาเดียวกัน · พนักงานที่ยังไม่ผูกบัญชีผู้ใช้กับ HR → หน้าตั้งค่าเตือน "n คนยังไม่ผูก" (ลิงก์ไป HR)
- ฝั่ง API: bundle readonly/operate ไม่เห็นอ่อนไหวเสมอ · admin เห็นตาม policy ของผู้สร้างคีย์

### 6.4 กติกา 404-not-403 · AuditLog
- สมาชิกที่มองไม่เห็น (unit scope) = 404 · ส่วนอ่อนไหวที่ไม่มีสิทธิ์ = แสดง "ซ่อน" ไม่ error
- ทุก mutation เขียน `writeAudit()` แบบบัญชี · การดูอ่อนไหว → `MemberAccessLog`
- ฝั่งลูกค้า: session ลูกค้า (`platform_auth`) แยกจากพนักงาน · ทุก op `/m/*` ตรวจ `customerId === session.customerId`

---

## 7. เหตุการณ์ · กฎอัตโนมัติ · แจ้งเตือน · cron

### 7.1 Outbox events (ใหม่ 24 · มีอยู่ 2 · ลง consumer + AUTOMATION_EVENTS + WEBHOOK_EVENTS พร้อมกันทุกตัว)
| event | payload | emit จาก | consumer (composition root `member-bridges.ts` / `member-outbound.ts`) |
|---|---|---|---|
| `member.created` | {customerId, partyId, source, referrerId?} | profile.createMember | แต้มต้อนรับ (EVENT_BONUS SIGNUP) · journey "สมาชิกใหม่" · referral attach · แจ้งต้อนรับ · CRM link |
| `member.updated` | {customerId, changedKeys[]} | profile/fields | PROFILE_COMPLETE bonus (ครั้งเดียว) · sync แชท/CRM ชื่อ |
| `member.merged` | {keepId, mergedId} | mergeMembers | โอน ledger ทุกโมดูล · ปิดบัง merged |
| `member.tier.changed` | {customerId, from, to, reason} | tiers.applyTierChange | welcome voucher · แจ้ง · journey "เลื่อนระดับ" |
| `member.tier.at_risk` | {customerId, tier, shortfall} | runTierReview (แจ้งล่วงหน้า) | แจ้ง · journey "ใกล้ลดระดับ" |
| `member.consent.changed` | {customerId, channel, granted} | privacy | marketing recipient sync |
| `member.sensitive.viewed` | {customerId, userId, target} | getMember360 | AccessLog (audit) |
| `point.earned` · `point.burned` · `point.expiring` · `point.expired` · `point.transferred` | {customerId, points, lotId?, ref} | point | แจ้ง · journey · wallet cache |
| `stamp.added` · `stamp.completed` | {customerId, cardId, stamps, cycle} | stamp | แจ้ง · reward/voucher เมื่อครบ |
| `reward.redeemed` · `reward.fulfilled` | {customerId, rewardId, redemptionId} | reward | แจ้งสาขา · ประวัติ |
| `voucher.issued` · `voucher.used` · `voucher.expiring` · `voucher.expired` | {customerId, voucherId, origin, saleId?} | voucher | แจ้ง · campaign stats · ประวัติ |
| `giftcard.sold` · `giftcard.used` | {giftCardId, satang, saleId} | giftcard | บัญชี (accountingLink) · แจ้งผู้รับ |
| `review.received` · `review.replied` | {customerId, reviewId, rating} | reviews | escalate ≤ N → kanban card · แต้มรีวิว · แจ้งลูกค้าเมื่อตอบ |
| `referral.joined` · `referral.converted` | {referrerId, refereeId, ref} | referrals | รางวัลสองฝั่ง · แจ้ง |
| `booking.completed` · `booking.no_show` (ใหม่ในโมดูลจอง) | {appointmentId, customerId} | booking | visit · แต้ม CHECKIN · สแตมป์ · ขอรีวิว · journey no-show |
| `chat.contact.linked` (ใหม่) | {contactId, partyId, customerId, method} | chat | ประวัติ · แผงข้าง |
| `crm.deal.won` (ใหม่) | {dealId, contactId, valueSatang} | crm | สร้าง/ผูกสมาชิก · ประวัติ |
| `pos.sale.paid` · `pos.sale.voided` (มีอยู่) | {saleId} | pos | **ย้ายจาก tx มาเป็น consumer**: recordSpend · computeEarn→earnWithLot · สแตมป์ · attribution LAST(POS) · ขอรีวิว · tier evaluate (ทันทีถ้าถึงเกณฑ์เลื่อน) · void = ย้อนทั้งหมด |
| `account.invoice.paid` (มีอยู่) | {documentId, partyId, satang} | account | ยอด+แต้ม B2B (ถ้าตั้ง) |
| `forms.submission.received` (มีอยู่) | {submissionId} | forms | ฟอร์มสมัคร → createMember source WEB_FORM · mapping ฟิลด์ |
| `approval.request.approved` (มีอยู่) | {requestId, entityType} | approval | ปรับแต้ม/ตั้งระดับ/ออก voucher/ลบ PDPA ที่รออยู่ |

### 7.2 ช่องทางที่มา (D10) — กติกา attribution
- ทุกทางเข้าสมัครต้องส่ง `source`: POS/หน้าร้าน (staff, unit) · LIFF (`?src=` → AcquisitionLink) · เว็บฟอร์ม (formId) · แชท (contact channel: LINE_OA/CHAT) · จอง (BOOKING) · นำเข้า (IMPORT + ชื่อไฟล์) · CRM (deal) · API (key name) · แนะนำเพื่อน (REFERRAL + referrer)
- `MemberAttribution FIRST` เขียนครั้งเดียว · `LAST` เขียนทุกครั้งที่มี touch ที่รู้ที่มา (คลิกลิงก์ที่มา · แคมเปญ · ซื้อจากช่องทางใหม่)
- รายงาน "ช่องทางที่มา" นับ first touch เป็นหลัก · แสดง last touch เทียบ · ต้นทุน/สมาชิก = ค่าใช้จ่ายที่กรอกในลิงก์ที่มา ÷ signups
- ลิงก์ที่มา `shark.in.th/m/{tenantSlug}?src={code}` → LIFF join · QR สร้างจากลิงก์ · นับ hits/signups/firstPurchases

### 7.3 กฎอัตโนมัติ (D15 · ต่อยอด K2.9)
- trigger เพิ่มใน `AUTOMATION_EVENTS`: ทุก event §7.1 ที่ขึ้นต้น member./point./stamp./reward./voucher./giftcard./review./referral. + `member.birthday.upcoming {daysBefore}` (cron รายวัน 03:00 ไทย สร้าง event ล่วงหน้า) + `member.inactive {days}` (cron รายวัน) + `member.tier.review_due`
- condition เพิ่ม: ฟิลด์สมาชิกทุกตัว (ระบบ + `f.{key}`) · ระดับ · แต้ม · consent ช่องทาง · segment · สาขา · วันที่สมัคร
- action เพิ่ม 10: `ISSUE_VOUCHER{templateId}` · `GIVE_POINTS{points, expires?}` · `SEND_LINE{template}` · `SEND_EMAIL` · `SEND_SMS` · `SEND_PUSH` · `ADD_TAG/REMOVE_TAG` · `SET_TIER{tierDefId}` (เฉพาะ scope MEMBER_TIER) · `WAIT_THEN{days, thenActions[]}` (สร้าง AutomationRun scheduledAt) · `OPEN_KANBAN_CARD{boardId, template}` · `NOTIFY_STAFF{role|userIds}`
- กฎระดับ = `AutomationRule scope MEMBER_TIER` 2 ใบ/ระดับ (upgrade/keep) · เงื่อนไขพิเศษ `spent{window}` `visits{window}` `tierPoints` `memberDays` `paidPlan` `referrals` · ประเมินโดย `tiers.evaluateMember` ไม่ใช่ engine ทั่วไป (engine ใช้เฉพาะ dry-run/บันทึกการรัน)
- holdout: campaign/journey ที่ตั้ง `holdoutPct` → recipient ที่ hash(customerId+ruleId) mod 100 < pct = ไม่ทำ action แต่บันทึกเป็นกลุ่มเทียบ
- โควตา: reuse `automationRunsPerMonth` แยก scope MEMBER (ค่าเริ่มต้น 5,000/เดือน) · loop guard เดิม

### 7.4 ตารางแจ้งเตือนลูกค้า (เทมเพลต 8 × ช่องทาง 4 · ภาพ 30)
| เหตุการณ์ | ค่าเริ่มต้น | ตัวแปร |
|---|---|---|
| ต้อนรับสมาชิกใหม่ | LINE ทันที | {ชื่อ} {ระดับ} {แต้ม} {ลิงก์บัตร} |
| ได้แต้ม | LINE รวมรายวัน 09:00 | {แต้มที่ได้} {ยอดคงเหลือ} {บิล} |
| แต้มใกล้หมดอายุ | LINE + อีเมล 30/7 วันก่อน | {แต้มที่จะหมด} {วันหมดอายุ} {ลิงก์กระเป๋า} |
| เลื่อนระดับ | LINE + push ทันที | {ระดับใหม่} {สิทธิ์} |
| ใกล้ลดระดับ | LINE 30 วันก่อนรอบ | {ระดับ} {ยอดที่ขาด} {วันประเมิน} |
| voucher ใหม่ | LINE ทันที | {ชื่อ voucher} {มูลค่า} {หมดอายุ} |
| สแตมป์ครบ | LINE ทันที | {การ์ด} {รางวัล} |
| ขอรีวิว | LINE หลังบริการ N ชม. | {บริการ} {ลิงก์รีวิว} {แต้มที่จะได้} |
- เคารพ `MemberConsent` ต่อช่องทาง (ยกเว้น transactional: ต้อนรับ/ได้แต้ม/หมดอายุ = ส่งได้ถ้ามีช่องทาง แต่ปิดได้ใน settings) · quiet hours 21:00–08:00 → เลื่อนเช้า · LINE ผ่าน chat facade (push message ต้อง LINE OA ที่เชื่อม) · อีเมล Resend · SMS ผู้ให้บริการที่ตั้ง (ไม่มี = ปิด) · push = `PushDevice` ของ customer app

### 7.5 Cron (เกาะ `src/lib/platform/cron.ts` เดิม)
- รายวัน 03:00 ไทย: `point.expireDue` + `expiringSoon` แจ้ง · `voucher.expireDue` + expiring · `giftcard.expireDue` · `stamp.expireDue` · `tiers.runTierReview` (ที่ `tierReviewAt` ≤ วันนี้) · `member.birthday.upcoming` · `member.inactive` · refresh cache `spent12m/visits12m/lastActivityAt` · privacy auto-erase (inactive > N ปี → คำขอลบอัตโนมัติรออนุมัติ)
- รายชั่วโมง: `WAIT_THEN` runs ที่ถึงเวลา · campaign ตั้งเวลา · แจ้งรวมรายวัน 09:00
- รายวัน 06:00: รายงานอีเมลตั้งเวลา

---

## 8. ผู้ช่วย AI (D11 · แบบ K3.5)
- สกิล `members` ขยายจาก 8 → ~40 tool (ตารางเต็มใน `docs/api/MEMBER-API.md` §AI tools) · อ่านรันทันที · เขียน = proposal เสนอก่อนเสมอ (ยืนยันด้วยสิทธิ์ของคนกด — Membership จริง บทเรียน K3.5)
- ความสามารถหลัก: `member_search` (ประโยคธรรมชาติ → segment) · `member_summary` (สรุปลูกค้า 1 คนจากทุกโมดูล) · `member_recommend_offer` (แนะนำ voucher/แต้มจากพฤติกรรม+ระดับ) · `campaign_draft_message` (ร่างข้อความ LINE/อีเมล ตัวแปรครบ) · `review_summarize` · `review_draft_reply` · `journey_suggest` (จากข้อมูลจริง: วันเกิดที่กำลังมา · คนหายไป · ระดับใกล้ลด — แบบ K3.6) · `tier_simulate` (ถ้าเปลี่ยนเกณฑ์ ใครเลื่อน/ลด) · `points_liability_report`
- กติกา: prompt อังกฤษ · ไม่ส่ง PII เกินจำเป็น (ชื่อ/เบอร์ แทนด้วย id ใน prompt) · ผลไทย · maxTokens ≥ 1500 · เครดิตลงช่องใหม่ `MEMBER_ASSIST` (เพิ่ม enum `AiCreditSource` — migration additive)

---

## 9. เชื่อมกับโมดูลอื่น (สัญญา)

### 9.1 POS (จุดตัดเงินเดียว)
- ก่อนคิดเงิน: `member.getWallet(customerId, cart)` → แผงสิทธิ์ (ภาพ 06) · `quoteApply` ทุกครั้งที่เปลี่ยนตัวเลือก · `createSale` รับ `memberChoices` → `applyOnSale` ใน tx (voucher.redeem · coupon.redeem · point.burnFifo · giftcard.use · tier discount เป็น discount line) · ลำดับตายตัว ระดับ→voucher→คูปอง→แต้ม→gift card
- หลัง commit: consumer `pos.sale.paid` → recordSpend · แต้ม (computeEarn ตัดส่วนที่จ่ายด้วย gift card/voucher/แต้ม ตาม settings) · สแตมป์ · attribution · ขอรีวิว · tier
- void → reverse ทุกชนิด (voucher.release · point.reverse คงล็อต · giftcard REFUND · stamp VOID · recordSpend ติดลบ)
- gift card ขาย = `PosSale` line ชนิด GIFT_CARD (ไม่ให้แต้ม ไม่ VAT ตามกติกาบัญชี — ตรวจกับโมดูลบัญชี) → `giftcard.sell`

### 9.2 จอง
- `createAppointment` รับ `customerId` (มีอยู่) + แสดง `benefitsFor` (มัดจำลด · จองก่อน daysAhead) · `booking.completed`/`no_show` event ใหม่ → visit/แต้ม CHECKIN/สแตมป์ PER_VISIT/ขอรีวิว/journey
- หน้า backoffice จอง (ยังไม่มี — หนี้ของโมดูลจอง) แสดงระดับ/แต้มของลูกค้าผ่าน `briefFor`

### 9.3 แชท (ภาพ 26)
- เมื่อรู้เบอร์/LINE userId → `member.linkContact` → เขียน `ChatContact.partyId/customerId/linkedBy` → event `chat.contact.linked` · ไม่พบ = แผงเสนอ "สมัครจากแชท" (ดึงชื่อ/เบอร์/LINE) source CHAT
- แผงข้าง: `briefFor` + wallet ย่อ + ปุ่มด่วน (ออก voucher ชดเชย · ให้แต้ม · ประทับ · สร้างงาน K3.2)
- ส่ง LINE ของแคมเปญ/แจ้งเตือน ผ่าน chat facade (push message ต่อ userId) · บันทึกเป็นข้อความระบบในห้อง (isInternal=false, sender=system) เพื่อให้ประวัติแชทครบ

- **ทุกช่องทาง** (D18/D19): เมื่อโมดูลแชทรับข้อความจากช่องทางใดก็ตาม (LINE/WhatsApp/Messenger/WeChat/Shopee/Lazada/อีเมล/แอป) ให้เรียก `member.linkIdentity` ด้วย (channel, externalId, phone?, email?) → ผูกอัตโนมัติเมื่อตรงชัด · ไม่ตรง → แผงข้างเสนอ candidates/สมัครใหม่ · ห้องแชทหลายช่องทางของคนเดียวกันแสดง "ช่องทางที่ผูก n" และไทม์ไลน์รวม
- แคมเปญ/แจ้งเตือนส่งไปช่องทางที่ `canNotify` และมี identity + consent ของช่องทางนั้น (ลำดับที่ร้านตั้ง เช่น LINE → WhatsApp → อีเมล)

### 9.4 บัญชี
- gift card (`accountingLink` เปิด): ขาย → เอกสารรับเงินล่วงหน้า (บัญชี 2xxx) · ใช้ → รับรู้รายได้ · หมดอายุ → รายได้อื่น · reload/refund ตาม · `GiftCard.accountingDocId`
- แต้มคงค้าง: รายงาน "หนี้สินแต้ม" = balance รวม × ต้นทุน/แต้ม (ตั้งค่า) → ส่งเป็นรายการปรับปรุงสิ้นงวด (ทางเลือก · ไม่บังคับ)
- `account.invoice.paid` (B2B ผ่าน Party) → ยอด/แต้ม เมื่อร้านเปิด "นับใบแจ้งหนี้เป็นยอดสมาชิก"
- เอกสารของ Party โผล่ในไทม์ไลน์ (อ่านผ่าน facade บัญชี `listDocsByParty`)

### 9.5 บอร์ดงาน · ฟอร์ม · อนุมัติ · CRM · HR
- บอร์ดงาน: รีวิว ≤ N → `createCardFromExternal` (sourceType REVIEW · ลิงก์ PARTY) · ร้องเรียนจากแชท · งาน VIP · การ์ดที่ผูก PARTY โผล่ในไทม์ไลน์ (K3.1 `listCardsForTarget`) · หน้า `/app/party/{id}` (K3.4) ชี้ไป 360
- ฟอร์ม: ฟอร์มสมัคร/อัปเดต — mapping ฟิลด์ฟอร์ม → ฟิลด์สมาชิก (รวมกำหนดเอง) ตั้งในตัวออกแบบฟิลด์ · consent จากฟอร์ม
- อนุมัติ: ปรับแต้มเกิน · ตั้งระดับมือ · voucher เกินเพดาน · ลบ PDPA · รวมคน (MANAGER) · entityType `MEMBER_*`
- CRM: `crm.deal.won` → สร้าง/ผูกสมาชิก (source CRM) · CRM contact แสดงระดับ/มูลค่า · segment ใช้ lifecycle stage
- HR (D17): `HrEmployee.userId` ผูกบัญชีผู้ใช้ (backfill จากอีเมล + หน้า HR ให้ผูก) · policy อ่อนไหวอ่าน position/department · `ownerUserId` = พนักงานผู้ดูแล · ครูประจำ/แพทย์ประจำ = lookup EMPLOYEE · รายงานยอดลูกค้าที่ดูแล

### 9.6 ทะเบียนช่องทางกลาง + อีคอมเมิร์ซ (D19)
- `channels.ts` (แผน · src/lib/core/) = แหล่งเดียวของช่องทาง (key · label ไทย · kind · canConsent · canNotify · icon) · โมดูลแชทใช้ `ChatChannelType` เดิม map เข้า key เดียวกัน (เพิ่ม MESSENGER · WECHAT · EMAIL · APP · TIKTOK_SHOP ใน enum แชทเป็นงานของโมดูลแชท)
- Lazada/Shopee/TikTok Shop: **คำสั่งซื้อ** เข้าทางโมดูล ecommerce (`ShopOrder` → event `shop.order.paid` ใหม่ · ลง 3 ทะเบียน) → consumer สมาชิก: ซื้อ/แต้ม/สแตมป์/ที่มา MARKETPLACE + `sourceChannel` + linkIdentity(ช่องทาง, buyerId, phone/email) · **แชท** ของ marketplace ผ่าน adapter โมดูลแชท (นอก RUN นี้)
- ช่องทางที่ยังไม่มี adapter: ยังผูก identity ได้ (พนักงานกรอก/นำเข้า) · ยังเก็บ consent ได้ · แต่ส่งข้อความไม่ได้จนกว่าจะมี adapter — UI แสดง "ยังไม่เชื่อมต่อ" ชัด

### 9.7 REST / webhook / skill (D11)
- ทะเบียน `registry.ts` (แผน · src/lib/modules/member/api/) (+ ops ของ point/stamp/voucher/giftcard/reward/marketing รวมในทะเบียนเดียว `member`) → REST `/api/v1/member/*` · OpenAPI · `docs/api/MEMBER-API.md` generator · skill `members` manifest · webhook events ทั้ง §7.1
- คีย์ API: bundle `member.readonly` / `member.operate` / `member.admin` (ภาพ 27) · rate limit เดิม · Idempotency-Key บังคับทุก write

---

## 10. เทมเพลตกิจการ 16 ชุด (D7 · ข้อมูลใน `(templates)` (แผน · member/templates/) · เลือกตอนเปิดใช้ · แก้ต่อได้ · ใช้ซ้อนกันได้)

ทุกชุดมี 4 ส่วน: **ส่วน+ฟิลด์กำหนดเอง** · **ระดับเริ่มต้น (แทนที่ 4 ระดับมาตรฐานได้)** · **สแตมป์การ์ด** · **journey** — ตารางนี้คือรายการที่ต้องมีจริงในโค้ด (QC เทียบชื่อฟิลด์/ชนิด)

| # | กิจการ | ส่วน → ฟิลด์ (ชนิด) | ระดับ/สิทธิ์เด่น | สแตมป์ | journey เด่น |
|---|---|---|---|---|---|
| 1 | ดำน้ำ/กีฬาทางน้ำ | ข้อมูลดำน้ำ: ระดับใบรับรอง (SELECT) · หน่วยงาน (SELECT PADI/SSI/NAUI/อื่น) · เลขบัตร (TEXT) · จำนวนไดฟ์ (NUMBER) · ไดฟ์ล่าสุด (DATE) · ไซซ์เว็ทสูท/รองเท้า (SELECT) · ประกันดำน้ำ+หมดอายุ (TEXT+DATE) · ครูประจำ (LOOKUP EMPLOYEE) · ใบรับรองแพทย์ (FILE) · สุขภาพ (อ่อนไหว): โรคประจำตัว · ผู้ติดต่อฉุกเฉิน | Gold: จองเรือก่อน 7 วัน · Platinum: ดำน้ำฟรี 1 ไดฟ์วันเกิด | ครบ 10 ไดฟ์ฟรี 1 · ล้างอุปกรณ์ 5 ครั้ง | ไดฟ์ล่าสุด > 180 วัน → ดึงกลับ · ประกันใกล้หมด → เตือน |
| 2 | คลินิก/ความงาม | สุขภาพ (อ่อนไหว): กรุ๊ปเลือด · แพ้ยา (MULTI) · โรคประจำตัว (LONG_TEXT) · ยาประจำ · ผู้ติดต่อฉุกเฉิน · แพทย์ประจำ (LOOKUP) · คอร์สที่ซื้อ (LOOKUP SERVICE) · ครั้งที่เหลือ (NUMBER) | Silver: ส่วนลดคอร์ส 5% · Gold: ทรีตเมนต์ฟรีวันเกิด | คอร์ส 10 ครั้งฟรี 1 | นัดหน้าครบกำหนด → เตือน · ครั้งที่เหลือ = 1 → เสนอต่อคอร์ส |
| 3 | ทันตกรรม | สุขภาพ (อ่อนไหว): ประวัติแพ้ยา · โรคประจำตัว · ประกัน/สิทธิ์ (SELECT) · ทันตแพทย์ประจำ (LOOKUP) · ขูดหินปูนล่าสุด (DATE) | ครอบครัว (Family plan) | ตรวจประจำ 2 ครั้ง/ปี | ครบ 6 เดือน → นัดขูดหินปูน |
| 4 | ร้านอาหาร/คาเฟ่ | ความชอบ: แพ้อาหาร (MULTI) · มังสวิรัติ/ฮาลาล (SELECT) · โต๊ะโปรด (TEXT) · เมนูโปรด (LOOKUP PRODUCT) · วันครบรอบ (DATE) | Gold: ของหวานฟรีวันเกิด · จองโต๊ะก่อน | กาแฟ 9 แถม 1 · มื้อ 10 ลด 20% | วันครบรอบ → voucher · ไม่มา 45 วัน → ดึงกลับ · เช็กบิล → ขอรีวิว |
| 5 | ฟิตเนส/โยคะ | เป้าหมาย (SELECT) · น้ำหนัก/ส่วนสูง (NUMBER · อ่อนไหว) · เทรนเนอร์ (LOOKUP) · แพ็กเกจ/วันหมด (LOOKUP+DATE) · เวลาที่มาบ่อย (SELECT) · ใบรับรองแพทย์ (FILE) | แบบเสียเงิน รายเดือน/รายปี (MemberPlan) · Platinum: เชิญเพื่อนฟรี 2 ครั้ง/เดือน | เข้าคลาส 20 ครั้ง ได้ PT ฟรี 1 | แพ็กเกจหมดใน 7 วัน → ต่ออายุ · ไม่เข้า 14 วัน → ทัก |
| 6 | โรงแรม/รีสอร์ต | เอกสาร (อ่อนไหว): เลขพาสปอร์ต/บัตร · สัญชาติ · ห้องที่ชอบ (SELECT) · หมอน/แพ้ (MULTI) · เดินทางกับ (SELECT ครอบครัว/คู่/ธุรกิจ) · บริษัท (TEXT) | Gold: อัปเกรดห้องเมื่อว่าง · เช็กเอาต์ช้า | พัก 5 คืนฟรี 1 | ก่อนเข้าพัก 3 วัน → ข้อมูลเตรียมตัว · หลังเช็กเอาต์ → รีวิว · ครบปี → กลับมาพัก |
| 7 | ร้านค้าปลีก/แฟชั่น | ไซซ์เสื้อ/กางเกง/รองเท้า (SELECT) · แบรนด์ที่ชอบ (MULTI) · สีที่ชอบ · ที่อยู่จัดส่ง (หลายที่อยู่) | ตัวคูณแต้มตามระดับ · Platinum: สินค้าเฉพาะระดับ | ซื้อครบ 10 ครั้งลด 15% | สินค้าใหม่ตรงไซซ์ → แจ้ง · ตะกร้าค้าง (ออนไลน์) → เตือน |
| 8 | ซาลอน/สปา | ช่างประจำ (LOOKUP) · สูตรสี/ทรีตเมนต์ล่าสุด (LONG_TEXT) · แพ้สารเคมี (อ่อนไหว) · แรงกดที่ชอบ (SELECT) · ครั้งล่าสุด (DATE) | Gold: จองช่างประจำก่อน | นวด 10 ครั้งฟรี 1 | 5 สัปดาห์หลังตัดผม → นัดรอบใหม่ |
| 9 | กวดวิชา/สอนพิเศษ | ผู้ปกครอง: ชื่อ/เบอร์ (TEXT) · โรงเรียน/ชั้น (SELECT) · วิชาที่เรียน (MULTI) · ครูประจำ (LOOKUP) · เป้าหมายสอบ (SELECT) · ผลสอบล่าสุด (NUMBER · อ่อนไหว) | ครอบครัว: พี่น้องลด 10% | เข้าเรียน 20 ครั้ง ได้ชม.ฟรี | ก่อนเปิดเทอม → แพ็กเกจ · ขาดเรียน 2 ครั้ง → แจ้งผู้ปกครอง |
| 10 | คลินิกสัตว์ | สัตว์เลี้ยง (ส่วนซ้ำได้ 1–n — ใช้ LONG_TEXT+FILE ในรอบนี้ · custom object รอบหน้า): ชื่อ · ชนิด/พันธุ์ · วันเกิด · น้ำหนัก · วัคซีนล่าสุด (DATE) · แพ้ยา | — | อาบน้ำ 10 ครั้งฟรี 1 | วัคซีนครบกำหนด → นัด · วันเกิดสัตว์ → ของขวัญ |
| 11 | คาร์แคร์/อู่ | รถ (LONG_TEXT ทะเบียน/รุ่น/ปี) · เลขไมล์ล่าสุด (NUMBER) · เปลี่ยนน้ำมันล่าสุด (DATE) · ประกันหมด (DATE) | Gold: ล้างรถฟรีเดือนละครั้ง (FREE_SERVICE) | ล้าง 10 ครั้งฟรี 1 | ไมล์/เวลาถึงรอบ → นัดเปลี่ยนน้ำมัน · ประกันหมด 30 วัน → เตือน |
| 12 | ทัวร์/ทราเวล | พาสปอร์ต+หมดอายุ (อ่อนไหว) · ประเทศที่เคยไป (MULTI) · สไตล์ทริป (SELECT) · เดินทางกับ · งบต่อทริป (MONEY) · ที่นั่ง/อาหารบนเครื่อง | Platinum: ทริปพิเศษเฉพาะระดับ | ทริป 5 ครั้งลด 10% | พาสปอร์ตหมด 6 เดือน → เตือน · หลังทริป → รีวิว+แนะนำเพื่อน |
| 13 | สโมสรกีฬา/กอล์ฟ | แฮนดิแคป (NUMBER) · ทีม/กลุ่ม (SELECT) · เวลาออกรอบที่ชอบ (SELECT) · ล็อกเกอร์ (TEXT) | แบบเสียเงินรายปี (MemberPlan) · จองรอบก่อน | ออกรอบ 10 ครั้งฟรี 1 | แข่งขันเปิดรับ → แจ้งตามแฮนดิแคป |
| 14 | ร้านซ่อม/บริการ (มือถือ/คอม/แอร์) | อุปกรณ์ (LONG_TEXT รุ่น/ซีเรียล) · ประกันหมด (DATE) · งานซ่อมล่าสุด (LOOKUP? → บอร์ดงาน link) | — | ล้างแอร์ 4 ครั้งฟรี 1 | ล้างแอร์ครบ 6 เดือน → นัด · ซ่อมเสร็จ → รีวิว |
| 15 | อสังหา/ให้เช่า | ห้อง/ยูนิต (TEXT) · สัญญาเริ่ม/หมด (DATE) · เงินประกัน (MONEY) · ผู้ติดต่อฉุกเฉิน (อ่อนไหว) · ยานพาหนะ | ผู้เช่าเก่า: ลดค่าต่อสัญญา | — | สัญญาหมด 60 วัน → เสนอต่อ · ค่าเช่าค้าง (บัญชี) → เตือน |
| 16 | B2B/ขายส่ง | บริษัท/เลขภาษี (ผ่าน Party) · ผู้ติดต่อหลายคน (LONG_TEXT รอบนี้) · วงเงินเครดิต (MONEY · อ่อนไหว) · เงื่อนไขชำระ (SELECT) · พนักงานขาย (LOOKUP) · ประเภทธุรกิจ | ระดับตามยอดปี (Bronze/Silver/Gold ดีลเลอร์) · ส่วนลดเป็นราคาขั้น | — | ยอดสะสมใกล้ระดับถัดไป → แจ้งเซลส์ · ไม่สั่ง 30 วัน → เซลส์โทร (การ์ดบอร์ดงาน) |

**ทั่วไป (ใช้ได้ทุกกิจการ · ใส่ให้ทุกร้าน)**: ระดับ 4 ขั้น · สแตมป์ "ซื้อครบ 10 ครั้ง" · journey วันเกิด/สมาชิกใหม่/หายไป 60 วัน/ใกล้ลดระดับ/ขอรีวิว/แต้มใกล้หมด

---

## 11. Edge cases & กติกา

### 11.1 ตัวตน/ซ้ำ
- เบอร์เดียวกันคนละระบบ MEMBER = คนละ Customer แต่ Party เดียว · หน้า 360 รวม · แต้ม/ระดับแยกต่อระบบ (ตัดสิน: ร้านที่ต้องการรวมให้ใช้ระบบเดียว)
- รวมคน: ไม่ลบแถว · `mergedIntoId` · ledger ทุกชนิดเขียนรายการ MERGE (โอนแต้มคง lot/expiry เดิม · voucher เปลี่ยน customerId · สแตมป์รวมใบที่ยังไม่ครบ (นับรวม ไม่เกิน slots) · gift card เปลี่ยน owner · ประวัติชี้ทั้งสอง id) · ทำได้ครั้งเดียว ย้อนไม่ได้ (ต้องยืนยัน 2 ขั้น)
- ลูกค้าเปลี่ยนเบอร์: แก้ได้ · Party phoneNorm อัปเดต · แชทที่ผูกด้วยเบอร์เดิมยังผูกอยู่ (ผูกด้วย id ไม่ใช่เบอร์)

- **ตัวตนหลายช่องทาง (D18)**: 1 externalId ผูกได้ 1 สมาชิก/ร้าน · ผูกซ้ำคนละคน → CONFLICT + candidate · ลูกค้าเปลี่ยน id ช่องทาง (บัญชี LINE ใหม่) = identity เพิ่ม ไม่ลบเก่า · unlink ต้อง MANAGER · รวมคน = ย้าย identity ทั้งหมด

### 11.2 ฟิลด์กำหนดเอง (D14)
- ฟิลด์ระบบ 26 ตัว (`systemKey`: firstName lastName nickname titleTh birthDate gender nationality phone phone2 email lineUserId facebook address* locale preferredChannel tags note source ownerUserId homeUnitId memberCode) — ค่าจริงอยู่ในคอลัมน์ Customer/MemberAddress · ตัวออกแบบเห็นเป็นฟิลด์ปกติ
- ลบฟิลด์ที่มีค่า: archive (ซ่อน) ไม่ลบค่า · กู้ได้ · ลบถาวรต้อง OWNER + ยืนยันชื่อ
- เปลี่ยน choices ของ SELECT: ลบ choice ที่ใช้อยู่ → เลือก "แทนที่ด้วย" หรือ "เก็บค่าเดิมเป็น legacy" · unique + สมาชิกเดิมซ้ำ → เปิด unique ไม่ได้จนแก้
- LOOKUP: ค่า = id ของ target · แสดงชื่อสด · target ถูกลบ → แสดง "(ถูกลบ)" ไม่ error
- เพดาน 60 ฟิลด์/ร้าน · 12 ส่วน · choices 50/ฟิลด์ · LONG_TEXT 4,000 ตัวอักษร · FILE 10 MB
- ฟิลด์ `filterable` เท่านั้นที่ index/กรอง/segment ได้ (เปิดได้สูงสุด 20 ฟิลด์ — เหตุผล: index)
- `customerEditable` ห้ามเปิดกับฟิลด์อ่อนไหวหรือฟิลด์ที่ร้านยืนยัน (ระดับใบรับรอง) — UI เตือน

### 11.3 ระดับ
- เลื่อนทันทีเมื่อถึงเกณฑ์ (หลัง `pos.sale.paid`) · ลดเฉพาะรอบประเมิน + ผ่อนผัน · ห้ามลดถ้าเป็นแบบเสียเงินที่ยังไม่หมดอายุ · ตั้งมือ = ล็อกจนรอบถัดไป (`manualUntil`)
- เปลี่ยนกฎ → ไม่ย้อนหลังอัตโนมัติ (เจ้าของกด "ประเมินใหม่ทั้งร้าน" ผ่าน dry-run ก่อน)
- ระดับที่ถูก archive → สมาชิกในระดับย้ายไประดับที่กำหนด (บังคับเลือกตอน archive)

### 11.4 แต้ม/ล็อต
- BURN ตัดล็อตหมดอายุเร็วสุดก่อน · REVERSE คืนเข้าล็อตเดิม (ถ้าล็อตหมดอายุไปแล้ว → ล็อตใหม่ expiresAt = วันคืน + 30 วัน) · ยอดติดลบยอมได้จาก void (แสดงแดง · ล็อตถัดไปหักก่อน)
- โอน: ล็อตของผู้รับ = expiresAt เดิมของผู้ให้ (ไม่ต่ออายุ) · ต้อง OTP ฝั่งผู้ให้ (LIFF) · พนักงานโอนแทนไม่ได้
- ปรับมือ: reason บังคับ · เกิน `adjustApprovalOver` → approval · ทุกรายการมี actorUserId
- เพดานวัน: นับ EARN จากขาย (ไม่รวม EVENT_BONUS) · เกิน → ตัดที่เพดาน + บันทึก breakdown
- backfill ล็อตเก่า (§4.6 ข้อ 4) ไม่ตัดย้อนหลัง

### 11.5 สิทธิ์ที่ POS/จอง
- ลำดับส่วนลดตายตัว: ระดับ → voucher → คูปอง → แต้ม → gift card · ทุกขั้นคิดจากยอดหลังขั้นก่อน · ส่วนลดรวมไม่เกินยอดสินค้า · gift card ใช้ได้ไม่เกินยอดที่เหลือ
- กันซ้อน: voucher 1 ใบ/บิล (ตั้งได้) · voucher+คูปอง ตาม `stackWithCoupon` · แต้มไม่เกิน `burnMaxPct` · gift card ไม่มีเพดาน
- แต้มที่ได้: คิดจาก (ยอดสุทธิ − ส่วนที่จ่ายด้วย gift card/voucher/แต้ม ตาม settings) · ระดับตัวคูณ ณ เวลาซื้อ
- void: ย้อนทุกอย่างในลำดับกลับ · voucher กลับเป็น ACTIVE ถ้ายังไม่หมดอายุ (หมดแล้ว → ต่ออายุ 7 วัน) · สแตมป์ VOID · gift card REFUND
- จอง: ใช้ได้เฉพาะ voucher ชนิด FREE_SERVICE/มัดจำ · ส่วนลดระดับใช้กับมัดจำ · ที่เหลือคิดตอนชำระจริงที่ POS

### 11.6 Promotion
- voucher มูลค่ารวมต่อครั้ง > เพดาน (`Tenant.limits.member.voucherIssueApprovalOver` ค่าเริ่มต้น ฿10,000) → approval · ต่อคน/วัน ≤ 3 ใบจาก journey (กันวน)
- gift card: PIN 6 หลัก hash · ผิด 5 ครั้ง → ระงับ 15 นาที · โอนต้องเป็นสมาชิกทั้งคู่ · หมดอายุขั้นต่ำตามกฎหมาย (ตั้งค่า · ค่าเริ่มต้น 24 เดือน) · accountingLink เปิดกลางทาง → เฉพาะรายการหลังเปิด
- แคมเปญ: ส่งซ้ำคนเดิมไม่ได้ในแคมเปญเดียว · holdout สุ่มคงที่ · ยกเลิกกลางทาง = หยุดคิว ที่ส่งแล้วไม่ถอน · เคารพ consent ณ เวลาส่ง · เพดาน 5,000 ข้อความ/วัน/ร้าน (ตั้งได้)
- journey: คน 1 คนเข้า journey เดียวได้ครั้งละ 1 run · re-entry หลัง N วัน (ตั้งค่า) · WAIT_THEN สูงสุด 90 วัน · ปิด journey = ยกเลิก run ที่รอ

### 11.7 รีวิว/แนะนำเพื่อน
- รีวิว 1 ครั้ง/รายการอ้างอิง (sale/appointment) · แก้ได้ใน 24 ชม. · ซ่อนได้ (HIDDEN) แต่ไม่ลบ · คะแนนรวมนับเฉพาะไม่ซ่อน · รูปผ่าน storage เดิม
- แนะนำเพื่อน: เพื่อนต้องเป็นสมาชิกใหม่ (เบอร์/อีเมล/LINE ไม่เคยมี) · แนะนำตัวเองไม่ได้ · เบอร์อุปกรณ์ซ้ำ (device fingerprint จาก LIFF) → REJECTED · รางวัลจ่ายครั้งเดียวต่อ referee · โปรแกรมปิด = ที่ PENDING ยังนับต่อ 30 วัน

### 11.8 PDPA/ความปลอดภัย
- ส่วนอ่อนไหว: ไม่ส่งลง client ถ้าไม่มีสิทธิ์ (ไม่ใช่ซ่อนด้วย CSS) · API readonly ไม่รวมอ่อนไหวเสมอ · export บันทึก AccessLog
- ลบ (erase): anonymize PII ทุกตาราง (ชื่อ→"ลูกค้าที่ถูกลบ" · เบอร์/อีเมล/LINE/ที่อยู่/ฟิลด์ทั้งหมด null · รูปลบ) · ledger/บิล/เอกสารบัญชี **คงไว้** (กฎหมายบัญชี) แต่ไม่ชี้ตัวตน · Party กลาง anonymize เมื่อไม่มีโมดูลอื่นชี้
- ฝั่งลูกค้า: rate limit OTP · session แยก · ทุก op ตรวจเจ้าของ · QR บัตรเป็น token หมุนได้ (ไม่ใช่ customerId ดิบ) อายุ 24 ชม. หรือกดสร้างใหม่
- webhook: ลายเซ็น HMAC เดิม · payload ไม่มีอ่อนไหว

### 11.9 เพดาน (`Tenant.limits.member.*` · ค่าเริ่มต้นใน `limits.ts` (แผน · member/))
สมาชิก 50,000/ร้าน (แจ้งก่อนถึง) · ฟิลด์ 60 · ส่วน 12 · ระดับ 10 · กฎแต้ม 30 · สแตมป์การ์ด 20 · รางวัล 200 · voucher template 100 · journey 50 · segment 100 · แคมเปญ/เดือน 50 · ข้อความ/วัน 5,000 · voucher/คน/วัน 3 · import 10,000 แถว/ครั้ง · export 50,000 แถว · API 600 req/นาที/คีย์

---

## 12. Non-functional
- ประสิทธิภาพ: หน้ารวม 50 แถว + ตัวกรอง 5 ฟิลด์ (รวมกำหนดเอง 2) ≤ 12 query · ≤ 400 ms p95 บน 50,000 สมาชิก · หน้า 360 ≤ 15 query (batch ทุกโมดูลด้วย Promise.all) · wallet/quoteApply ≤ 6 query ≤ 150 ms (POS ต้องไว) · cron หมดอายุ 100,000 ล็อต ≤ 5 นาที batch 1,000
- index ที่ต้องมี: ทุก `@@index` ใน §4.3 + `MemberFieldValue` ต่อชนิดค่า + `MemberActivity [customerId, createdAt]` `[tenantId, unitId, createdAt]`
- การเข้าถึง: ฟอร์มทุกฟิลด์มี label · focus ring · ตาราง keyboard · สีป้ายผ่านคอนทราสต์ (6 สีเดิม) · LIFF ฟอนต์ ≥ 16px กันซูม
- i18n: ข้อความไทยตาม §12.3 ของ 13-kanban-v2 (คำเดียวกัน: "สมาชิก" ไม่ใช่ "ลูกค้า" ในโมดูลนี้ · "แต้ม" ไม่ใช่ "คะแนน" · "voucher" ทับศัพท์ · "คูปอง" · "ระดับ" ไม่ใช่ "ชั้น")
- ภาษาออกแบบ: `src/app/globals.css` + `src/components/ui/*` · mockup `ledger/design-member/` เป็นเกณฑ์ parity (Fable ดูภาพจริงคู่ mockup ทุกหน้า)

---

## 13. เกณฑ์ตรวจรับรายใบงาน (QC) — สรุป · รายละเอียดข้อสอบใน `ledger/MEMBER-RUN.md`

| เฟส | ใบ | เกณฑ์ผ่าน (นอกเหนือจาก oracle/tsc/fitness/regressions/ภาพ) |
|---|---|---|
| M1 โปรไฟล์ 360 + ฟิลด์ + ระดับ | M1.1 schema+backfill (+ channels.ts · MemberChannelIdentity · HrEmployee.userId) · M1.2 fields engine · M1.3 field designer UI · M1.4 profile service+360 (+ linkIdentity D18) · M1.5 หน้ารวม/กรอง/มุมมอง · M1.6 สมัคร/นำเข้า/ตัวซ้ำ · M1.7 consent/privacy/policy (+ D17 HR positions) · M1.8 sources/attribution (+ MARKETPLACE/sourceChannel) · M1.9 tiers engine · M1.10 tiers UI · M1.11 REST/AI ชุดแรก (~45 op) · M1.12 มือถือ+แชท side panel | US1 US2 US3 ผ่าน · backfill ทุกร้านไม่เสียข้อมูล · ฟิลด์ระบบ 26 ตัวครบ · policy อ่อนไหวไม่ส่งลง client · attribution first/last ถูกต้องทุกทางเข้า |
| M2 Loyalty + Wallet | M2.1 point rules+lots+expiry · M2.2 point transfer/adjust/approval · M2.3 stamp · M2.4 reward v2+fulfil · M2.5 voucher · M2.6 gift card (+accountingLink) · M2.7 wallet facade + POS integration · M2.8 POS consumer (ย้ายจาก tx) + void · M2.9 LIFF/แอปลูกค้า (บัตร/wallet/โปรไฟล์) · M2.10 REST/AI ชุดสอง | US4 US5 ผ่าน · qc:all POS/บัญชีเดิมเขียว · ลำดับส่วนลดตรง §11.5 ทุกกรณี · หมดอายุล็อตถูกต้องหลัง backfill |
| M3 Promotion + Journey + History | M3.1 segments · M3.2 campaigns v2 (A/B/holdout/push) · M3.3 journey (trigger/action/WAIT_THEN) · M3.4 reviews+escalation · M3.5 referrals · M3.6 notifications templates · M3.7 history timeline (consumers ทุกโมดูล) · M3.8 reports · M3.9 templates 16 กิจการ · M3.10 REST/AI ชุดสาม + webhook + manifest · M3.11 LIFF onboarding/แอปพนักงาน · M3.12 ปิดเฟส (qc:all · prod verify · handover) | US6–US10 ผ่าน · ทุก event ลง 3 ทะเบียน · ROI/holdout คำนวณตรงสูตร · API doc = registry (F13.5) · manifest โหลดได้ |

---

## 14. คำตอบ: "ระบบนี้ต่อยอดเป็น CRM เต็มรูปแบบได้ไหม" — ได้ และนี่คือทางไป

**สิ่งที่แบบนี้วางไว้แล้วซึ่ง CRM เต็มรูปแบบต้องมี**: ตัวตนกลาง (Party) + โปรไฟล์ปรับได้ (custom fields/sections/layout) + ไทม์ไลน์ทุกช่องทาง + segment ทุกฟิลด์ + journey อัตโนมัติ + consent/PDPA + API/webhook/AI ทุกฟังก์ชัน + สิทธิ์ละเอียด + attribution — นี่คือ 70% ของแกน CRM (Zoho/HubSpot ใช้แกนเดียวกันนี้)

**สิ่งที่ SHARK มีอยู่แล้วและ CRM ใช้ต่อได้ทันที**: โมดูล CRM (pipeline/deal/activity) · แชท omnichannel (LINE/เว็บ/FB/IG) · ฟอร์ม · บอร์ดงาน (งานติดตาม) · บัญชี (ใบเสนอราคา→ใบแจ้งหนี้) · อนุมัติ · HR (พนักงานขาย) · AI proposal — Zoho ต้องซื้อ Zoho CRM + Desk + SalesIQ + Books + Campaigns แยกกัน

**ช่องว่างที่ต้องเติมเพื่อเป็น "CRM เต็มรูปแบบ" (RUN ถัดไป · ประมาณ 25–30 ใบ)**
1. **Custom objects** — ขยาย engine ฟิลด์กำหนดเองให้สร้าง "ตาราง" ใหม่ได้ (เช่น สัตว์เลี้ยง · รถ · ทรัพย์สิน · สัญญา) ผูกกับสมาชิก 1–n · มีฟิลด์/เลย์เอาต์/สิทธิ์/API เอง — โครง `MemberSection/Field/Value` ออกแบบให้ generalize เป็น `CustomObject/Field/Record` ได้โดยเพิ่ม `objectKey` (ตัดสินใจไว้แล้วว่ารอบนี้ยังไม่ทำ D-scope §1.2)
2. **Lead → Contact → Account (บริษัท) → Deal** ครบวงจร: ตอนนี้ CRM มี contact/deal แต่ยังไม่มี "บริษัท" เป็นตัวตน (Party kind=COMPANY มีแล้ว — ต้องมีหน้า/ความสัมพันธ์ contact↔company↔deal) · lead scoring จากพฤติกรรม (แชท/เว็บ/อีเมลเปิด) · แปลง lead เป็นสมาชิกอัตโนมัติ (มีใน D-plan: `crm.deal.won`)
3. **Sales automation**: pipeline automation (ใช้ journey engine เดียวกัน scope CRM) · sequence อีเมล/LINE หลายขั้น (WAIT_THEN มีแล้ว) · task อัตโนมัติในบอร์ดงาน (มีแล้ว K3.3) · เตือนดีลนิ่ง
4. **Activity capture**: บันทึกโทร (click-to-call/แนบไฟล์เสียง) · อีเมลเข้า-ออกผูก contact (K3.9 มีอีเมลเข้าบอร์ดแล้ว — ขยายเป็น inbox ต่อ contact) · ปฏิทินนัด (มีโมดูลจอง/ประชุม)
5. **Reporting/forecast**: pipeline forecast · conversion ต่อขั้น · sales by rep · ใช้โครงรายงานสมาชิก (RFM/cohort) เป็นฐาน
6. **Territory/ทีมขาย**: สิทธิ์ตามพื้นที่/ทีม (unit scope มีแล้ว — เพิ่ม "ทีม" เป็นมิติ) · โควตา/คอมมิชชัน (ผูก HR/บัญชี)
7. **Web/email tracking**: pixel เปิดอีเมล (มีใน campaign) · เว็บไซต์ร้าน → lead form + attribution (AcquisitionLink ครอบแล้ว)
8. **Portal ลูกค้า B2B**: ดูใบเสนอราคา/ใบแจ้งหนี้/ชำระ (บัญชีมี print page แล้ว) — ต่อจาก `/m/*`

**คำแนะนำ**: ทำ Member System ตามแบบนี้ให้จบก่อน (แกน 70%) → RUN "CRM v2" ต่อด้วย custom objects + company + sales automation (ใช้ engine เดิม 3 ตัว: fields · automation · api registry) — ไม่ต้องรื้ออะไรที่สร้างในรอบนี้ เพราะทุกอย่างวางเป็น "ทะเบียน + engine + facade" ตั้งแต่ต้น
