# HANDOVER — ระบบสมาชิก v2 ปิดเฟส M2 (Loyalty · Promotion พื้นฐาน · ฝั่งลูกค้า · REST/AI ชุดสอง)

วันที่: 11 ก.ย. 2569 (UTC) · worktree `/root/projects/shark-member` · branch `session/member` → main `80fae42` (M2.10 = `900ab7d` · M3.1 = `cb1d397`) · ผู้ปิดเฟส: Fable

## สรุป 1 บรรทัด
เฟส M2 ครบ 10/10 ใบ (M2.1–M2.10) · ระบบสมาชิก v2 คืบหน้า 23/34 ใบ ≈ 68% (รวม M3.1 ที่ปิดก่อนรัน qc:all) · ทุกใบมี oracle ของ Fable ผ่านเต็ม + ภาพจริงเทียบ mockup ผ่านด้วยตา · migration ทั้งหมด (a–g · 13 ใบ) อยู่บน prod แล้ว (ตรวจ `_prisma_migrations` ทุกครั้งหลัง Vercel READY)

## สิ่งที่สร้างในเฟส M2 (ตัวเลขจากโค้ดจริง)
| ใบ | สิ่งที่ได้ | ข้อสอบ | ภาพ |
|---|---|---|---|
| M2.1 แต้ม v2 | PointRule 6 ชนิด (computeEarn) · PointLot FIFO/หมดอายุ (earnWithLot/burnFifo/reverseWithLots/expireDue/notifyExpiring) · PointTransfer · migration `member_v2_c` · backfill `scripts/member-backfill-points-lots.mts` | 30/30 | — |
| M2.2 โอน/ปรับแต้ม/ตั้งค่า | โอนแต้ม OTP + cap · ปรับมือ + สายอนุมัติ (`PointAdjustRequest` · migration `member_v2_c2`) · หน้า `/member/points` (ledger รวม/ตั้งค่า ก–จ/ปรับ/ใกล้หมดอายุ) | 15/15 | 16 |
| M2.3 สแตมป์ | โมดูล `stamp/` (StampCard/Progress/Event · migration `member_v2_d`) · กฎ 5 ชนิด · PIN/QR/อัตโนมัติจากบิล+นัด · completeCycle → รางวัล · หมดอายุ (cron) · merge hook · editor + การ์ดจริง | 22/22 | 17 |
| M2.4 รางวัล v2 | Reward คอลัมน์ใหม่ (migration `member_v2_d2`) · แลกด้วยแต้ม/สแตมป์ · QR รับของ · fulfil/cancel · หน้า editor/รับของ/ประวัติ + catalog | 18/18 | 05 · 18 |
| M2.5 voucher | โมดูล `voucher/` (VoucherTemplate/Voucher/VoucherIssueBatch · migration `member_v2_e`) · issue รายคน/กลุ่ม + สายอนุมัติเกินเพดาน · validate/redeem/release/expire · `src/lib/member-hooks.ts` (composition root) · facade `approval/index.ts` | 26/26 | 19 |
| M2.6 gift card | โมดูล `giftcard/` (migration `member_v2_f`) · ขาย/ใช้/เติม/หมดอายุ + ผูกบัญชี (2110/4030/4900) · `PosSale.giftCardId` · facade `pos/index.ts` | 24/24 | 20 |
| M2.7 wallet | `member/wallet.ts` getWallet · quoteApply (ลำดับ ระดับ→voucher→แต้ม→gift · กันซ้อน) · applyOnSale(cart) · แท็บกระเป๋าสิทธิ์ใน 360 | 22/22 | 02 |
| M2.8 POS | `createSale` รับ `memberChoices` → applyOnSale ใน tx · **แต้ม/สแตมป์/recordSpend ย้ายจาก tx ไป consumer `pos.sale.paid`** (`src/lib/member-bridges.ts`) · void ย้อนครบ · แผงสิทธิ์ที่หน้าขาย | 30/30 | 06 |
| M2.9 ฝั่งลูกค้า | `/m/[slug]/{login,card,wallet,profile,history}` · session ลูกค้าแยก (`customer-session.ts` · OTP/LINE · cookie `shark_customer` · token `cs_`) · บัตร QR `SHARK-MC:<token>` · migration `member_v2_f2` + `f2_identity_fk` | 22/22 | 09 |
| M2.10 REST/AI | ทะเบียน 68 → **135 op** (points/stamps/rewards/wallet/vouchers/coupons/giftcards + `me.*` 9 op) · เลนลูกค้า (Bearer `cs_`) · idempotency ทุก write · tools `member_*` (write = proposal) · webhook events M2 · docs regen 3 โมดูล + สกิล | 20/20 (curl จริง) | — |

- ทดสอบทั้งหมด: oracle M2 10 ชุด = 229 ข้อ เขียวหมด · regressions M1/บัญชี/บอร์ดงาน (QC env) ผ่าน · fitness 26/26 ทั้ง 2 โหมด · `gen-*-api-docs --check` 3 โมดูล exit 0
- ผล `qc:all` เต็มชุด (319 ชุด) ตอนปิดเฟส: 318/319 — ดูท้ายไฟล์

## บั๊กจริงที่จับได้ระหว่างเฟส (ไม่ใช่ข้อสอบผิด)
1. ไฟล์ `"use server"` export type → หน้า 500 ทั้งที่ tsc/build ผ่าน (M2.2) — บันทึกเป็นกติกาใน builder-common + memory
2. ตารางกฎแต้มไม่ตรงภาพ 16 + กริดไม่ยุบบนมือถือ (M2.2 ตีกลับ 2 รอบ)
3. หน้าโปรไฟล์ลูกค้าโชว์ id สาขาดิบ/ค่า enum (M2.9 ตีกลับ) → DTO มี `display` ผ่านตัวแปลงเดียวกับหน้า 360
4. v1 `member/service.ts#recordSpend` เขียน `Customer.tier` ทับระดับ v2 (พบ m1.9 S7.3 แดงเป็นระยะ) → ถ้ามี `tierDefId` ไม่แตะ tier
5. `core/outbox.ts drainUntilQuiet` เลิกเมื่อ "หยิบไม่เต็มรอบ" ทำให้ event ที่ consumer สร้างระหว่างรอบค้าง PENDING → เลิกเมื่อหยิบ 0 (มี MAX_ROUNDS + งบเวลา)
6. `applyOnSale` สัญญาเดิมไม่มียอดบิล → เพิ่ม `cart` บังคับ (M2.7/M2.8) · cache ชั้น 3 ลบทิ้งแล้ว
7. ด่าน parity ในข้อสอบเคยผ่านเองเมื่อ builder เขียนคำว่า "PARITY: ผ่าน" อ้างถึงในโน้ต → regex ต้องเป็นบรรทัด `- **PARITY: ผ่าน**` (ทุก oracle)

## ข้อสอบที่ Fable แก้เอง (builder ชี้ · ตรวจแล้วว่าข้อสอบผิดจริง)
`source: "STAFF"` ไม่ใช่ MemberSource (ต้อง WALK_IN — 6 ไฟล์) · `mergeMembers` ต้อง `confirm: "MERGE"` · seed: gold ทุกคนอยู่กะตะ · stamp slots ขั้นต่ำ 3 · M2.8 stamps หลัง void = 1 (2 บิลเข้าเกณฑ์) · k3.3 ภาพอยู่ worktree shark-kanban · m1.9 S2.1 consumer เลื่อนระดับให้ก่อน · m1.7 S6.2 party ที่บัญชีอ้างไม่ anonymize (§11.8) · m2.9 token บัตรใช้ซ้ำ 15 นาที · m2.10 nickname ต้องพลิก customerEditable ก่อน · suite บัญชี `qc-account-api-settings` S1.2 นับ bundle ทุกโมดูล → กรอง `account.*`

## หนี้ที่ส่งต่อ (ตามลำดับความสำคัญ)
- **M3.F**: `qc-pos-register` MEM-2 (prod env suite) คาด `pointEarned > 0` ทันทีหลัง createSale — แต้มย้ายไป consumer แล้ว ต้องแก้ suite เป็นตรวจหลัง drain
- **M3.F**: พิจารณาคีย์ `member.point.adjust` ในชุด operate (M2.2 ใช้ด่าน canReadMember + เพดาน/role ตาม §6.2) · `point.transferred` ยิงจริงแล้ว (M2.2) · `setPointSettings` ยังรับ 2 รูป (qc-point บังคับ)
- UI เล็ก: ชิป "รอรับ" มือถือขึ้น 2 บรรทัด (M2.4) · ชิปบริการชื่อซ้ำควรต่อชื่อสาขา (M2.3/M2.5) · pagination footer gift card เมื่อ > 50 ใบ (M2.6)
- ค่าธรรมเนียมโอนแต้มยังไม่หัก (`feePoints` 0 · M2.2) · UI สร้างกฎแต้มแบบพื้นฐาน (M2.2)
- `pos/index.ts` facade ใหม่ — ผู้เรียกเดิม 15 ที่ยัง import `pos/service` ตรง (M2.6)
- SMS gateway ยังไม่มี (OTP ทางเบอร์ส่งจริงไม่ได้ · M2.9/M2.2) · `LINE_LIFF_ID` ยังไม่ตั้ง (ไม่มีก็ใช้ OTP ได้) · `/m/[slug]/join` = M3.11
- `notify: true` ของ voucher ยังไม่ส่งข้อความจริง (M3.6) · กระเป๋ายังไม่รู้ "คูปองของใคร" (M2.7/M2.10 หมายเหตุ)
- ภาพบอร์ดงาน `.qc-shots/kanban/3.3|3.5` อยู่ worktree shark-kanban ⇒ k3.3/k3.5 ข้อภาพแดงใน worktree นี้เสมอ (ไม่ใช่บั๊ก)
- `.claude/` ถูก gitignore ⇒ สกิล `shark-*-api` ใน worktree ต้องคัดลอกจาก `/root/.claude/skills` (ทำแล้วรอบนี้)

## ของที่ยังรอเจ้าของ (ไม่บล็อกงาน)
- เชื่อม LINE OA + ตั้ง `LINE_LIFF_ID` เพื่อให้ `/m/*` เปิดจาก LINE ได้จริง (ตอนนี้ล็อกอินด้วย OTP อีเมล/เบอร์ได้)
- SMS provider (M3.6 มี interface `core/sms.ts` รอเสียบ)
- **backfill prod แต้ม→ล็อต** (`scripts/member-backfill-points-lots.mts --tenant <id> --dry-run` ก่อน · ทีละร้าน) — ยังไม่รัน เพราะ prod ยังไม่มีร้านที่เปิดระบบสมาชิก v2 ใช้จริง

## วิธีตรวจ/ใช้งาน
- QC: `bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m2.<n>.mts` (ต้องมี seed `qc-member-m1.1.mts` · ข้อภาพต้อง `bash scripts/acc-v2-serve.sh` + `scripts/visual-member.mts <wo> --user owner|thana|noperm|customer:<memberCode>`)
- ทั้งระบบ: `DATABASE_URL/DIRECT_URL จาก .env.qc (grep|cut) pnpm qc:all`
- REST: `docs/api/MEMBER-API.md` (135 op) · สกิล `.claude/skills/shark-member-api` · หน้า `/developers/member`

## งานถัดไป (เฟส M3 · 11 ใบ + M3.F)
M3.1 segments ✅ (`cb1d397`) → M3.2 campaigns v2 (กำลังทำ) → M3.3 journeys → (M3.4 reviews ∥ M3.5 referrals ∥ M3.6 notifications) → M3.7 history → (M3.8 reports ∥ M3.9 templates 16) → M3.10 REST/AI ชุดสาม → M3.11 LIFF join + แอปพนักงาน → M3.F ปิด RUN · oracle ทุกใบเขียนไว้แล้ว (`scripts/qc-member-m3.*.mts` + สเปคภาพใน `visual-member.mts`)

## ผลตรวจบน prod จริง
- Vercel READY ทุก push ของเฟส M2 (ล่าสุด `57d4ba3` รวม M3.1) · `_prisma_migrations` บน prod มี `member_v2_a…g` ครบ 13 ใบ (g ลบ orphan PointBalance 44 แถวของ tenant ทดสอบเก่า · เหลือ 3 แถว orphan 0) (ตรวจด้วย `/tmp/claude-0/prodmig.cjs` แบบอ่านอย่างเดียว) · `MemberChannelIdentity` บน prod 0 แถว ⇒ FK ใบ f2_identity_fk ผูกโดยไม่ลบอะไร
- ไม่มี backfill ที่ต้องรันบน prod ในเฟสนี้ (ร้านจริงยังไม่เปิดใช้ v2)

## ผล qc:all เต็มชุด (ปิดเฟส M2 · 11 ก.ย. 03:50–04:20 UTC · QC DB · ไม่มี builder)
- รอบสะอาด: **312/319 ชุดผ่าน** (1627 วิ) · แดง 7 → ตามไล่:
  - `acc-v2-contact-merge/contact-profile/contacts` + `acc-v2-party` — เฉลยบัญชี QC ขาดคีย์หลัง reseed มือ (ต้องรัน `acc-v2-expected-{contacts,contact-profile,dashboard}.mts`) + suite party JSON.stringify ชน BigInt (`spent12mSatang`) → แก้แล้ว รันซ้ำ **5/5 ผ่าน**
  - `member-m2.9` — ภาพลูกค้าถูกถ่ายด้วย memberCode ก่อน reseed → ถ่ายใหม่ **22/22**
  - `nav-functions` S5 — หน้าลึกของโมดูลสมาชิก 13 หน้า (members/new·import·duplicates · points/adjust·expiring · stamps/new · rewards/new·fulfil·redemptions · promotions/giftcards(+settings)·vouchers(+templates)) ไม่อยู่ใน drawer → เพิ่ม `MEMBER_DEEP_NAV` ใน `member/nav.ts` **11/11 ผ่าน**
  - `kanban-k2.3` 15/17 — ข้อภาพ/ลากขอบ ต้องมี `.qc-shots/kanban/2.3` (อยู่ worktree shark-kanban) — ไม่ใช่บั๊ก
- ⇒ สุทธิ **318/319** (เหลือ k2.3 ข้อภาพข้าม worktree) · รอบก่อนหน้า (271/320) แดงเพราะรันขณะ builder M3.1 แก้สคีมา + qc-all รัน reseed กลางรอบ — แก้ต้นเหตุทั้งสองแล้ว (qc-all ตัด `qc-member-m1.1` ออก · กติกา: qc:all เต็มชุดรันตอนไม่มี builder)
- บทเรียน: reseed บัญชีมือต้องตามด้วยสคริปต์เฉลย 3 ตัว · suite ที่ stringify Customer ต้องทน BigInt · ข้อสอบ m1.1 เลิกบังคับ "ยังไม่มีตาราง M2/M3"
