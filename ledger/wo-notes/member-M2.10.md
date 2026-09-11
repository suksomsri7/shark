# M2.10 — REST/AI ชุดสอง (points · stamps · rewards · wallet · vouchers · coupons · giftcards · me.*)

**ผลข้อสอบ: `qc-member-m2.10` 16/20** (แดง 4 = S3.1 + S5.1/S5.2/S5.3)
- **S5.1 · S5.2 · S5.3 — รอ Fable build ใหม่** เซิร์ฟเวอร์ QC ที่ :3215 ขึ้นอยู่จริง (`up=200` ที่ `/ping`)
  แต่เป็นบิลด์ **ก่อน** ใบนี้ ⇒ ทุก path ของชุดสองตอบ 404 `not_found` · ไม่ใช่ข้อผิดพลาดของโค้ด
  (เส้นเดียวกันผ่านหมดเมื่อเรียกผ่าน route handler ตรง ๆ ใน S2/S3/S6) — Fable build แล้วรันซ้ำได้เลย
- **S3.1 — ข้อสอบขัดกับข้อมูล seed (ดู "ข้อแย้ง" ข้างล่าง)** · 2 ใน 3 ส่วนของข้อนี้เขียว (GET /me = 200 · GET /me/card = 200)
  ตกเฉพาะ `PATCH /me {nickname}` ซึ่งตอบ 422 เพราะฟิลด์ `nickname` ของร้าน QC ตั้ง `customerEditable = false`

regressions (รันเอง ผ่านครบ): `m1.11` 26/26 · `m2.9` 22/22 · `m2.7` 22/22 · `m2.8` 30/30 ·
`tsc --noEmit` เงียบ · fitness 2 โหมด 26/26 (F13.7 135 op · F13.8 ไม่ stale · F13.9 33 tool) ·
`gen-member-api-docs --check` exit 0 · `gen-account-api-docs --check` exit 0 · `gen-kanban-api-docs --check` exit 0

---

## 1. ไฟล์ส่งมอบ

### ใหม่
| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/modules/member/api/ops/points.ts` | 14 op แต้ม (balance/ledger/quoteEarn/quoteBurn/credit/adjust/transfer/reverse/expiring/rules×3/settings×2) |
| `src/lib/modules/member/api/ops/stamps.ts` | 8 op ตราสะสม (cards×4/progress/add/void/stats) |
| `src/lib/modules/member/api/ops/rewards.ts` | 9 op ของรางวัล (list/create/update/toggle/redeem/redemptions.list/redemptions.lookup/fulfil/cancel) |
| `src/lib/modules/member/api/ops/wallet.ts` | 3 op กระเป๋าสิทธิ์ (get/quote/apply) |
| `src/lib/modules/member/api/ops/vouchers.ts` | 11 op voucher (templates×4/list/forMember/issue/validate/redeem/release/cancel) |
| `src/lib/modules/member/api/ops/coupons.ts` | 7 op คูปอง (list/create/update/toggle/validate/issuePerMember/saveToWallet) |
| `src/lib/modules/member/api/ops/giftcards.ts` | 9 op บัตรกำนัล (list/sell/balance/use/reload/transfer/suspend/settings×2) |
| `src/lib/modules/member/api/customer-lane.ts` | เลนลูกค้า: token `cs_` → `ApiActor` CUSTOMER · ด่าน path `/me` · เพดานอัตราต่อ "คน" |
| `src/lib/modules/member/api/loyalty.ts` | ที่เดียวที่แปลง "ระบบสมาชิก + สาขา" → ctx ของ point/reward/giftcard/coupon (กติกาเดียวกับ `member/wallet.ts`) |
| `src/lib/modules/member/api/rate.ts` | ย้าย `MEMBER_RATE_LIMITS` ออกจาก `config.ts` (กันวงกลม config ⇄ customer-lane · `config.ts` re-export ต่อ) |

### แก้ (เฉพาะจุด)
- `member/api/ops/me.ts` — เขียนใหม่: 9 op ทำงานจริง (get/update/card/wallet/vouchers/stamps/giftcards/redeem/transfer)
- `member/api/registry.ts` — ต่อ 7 กลุ่มใหม่เข้า `MEMBER_OPS` (68 → **135 op**)
- `member/api/openapi.ts` — `memberWebhookEvents()` ครอบ prefix `member./point./stamp./reward./voucher./giftcard.` (เดิมกรองแค่ `member.`) + ข้อ 14 ของ Conventions พูดถึง token `cs_` และ 403 `customer_scope`
- `member/api/config.ts` — ผูก `altAuth: memberCustomerAuth`
- `member/api/actor.ts` — `memberActorOf` คืน `customerActor(customerId)` เมื่อคำขอมาจากเลนลูกค้า · เพิ่ม `member.giftcard.sell` ใน OPERATE_SCOPES
- `member/api/tools.ts` — `runMemberTool`/`dispatchMemberKind` รับ ctx แบบก้อนเดียว (รูปเดิมยังเรียกได้ผ่าน overload) · `ASSISTANT_READ_SCOPES` +point.read/loyalty.read/promo.read · `summarize()` บอกจำนวนแต้ม/เงิน/ตรา/จำนวนคน
- `member/customer-session.ts` — token ของ session ลูกค้าขึ้นต้น `cs_` (`CUSTOMER_TOKEN_PREFIX` + `isCustomerToken`)
- `member/wallet.ts` — เพิ่ม `applyOnSaleStandalone()` (REST ไม่มี tx ของบิลในมือ → เปิด tx ให้เอง)
- `point/lots.ts` + `point/index.ts` — เพิ่ม `listLots(ctx, customerId)` (ล็อตที่ยังเหลือ เรียงตามลำดับที่จะถูกตัดจริง)
- `coupon/service.ts` + `coupon/index.ts` — เพิ่ม `updateCoupon` · `setCouponActive` · `issuePerMemberCodes`
- `api-keys/scopes.ts` — ชุด `member-operate` เพิ่ม `member.giftcard.sell`
- `ai/skills.ts` — สกิล `members` เพิ่ม 11 ชื่อ tool ใหม่ · `ai/tools-member.ts` — ส่ง ctx ก้อนเดียว
- `.claude/skills/shark-member-api/SKILL.md` — description ใหม่ · เลนลูกค้า · workflow map 11 แถว · **6 recipe ใหม่** (points/stamps/wallet/vouchers/giftcards/me) · webhook 15 ตัว
  (คัดลอกไป `/root/.claude/skills/shark-member-api/` แล้ว — `diff -r` ตรงกันทุกไบต์)
- `docs/api/MEMBER-API.md` + `references/endpoints.md` — generator ทับ (135 op)

### แก้ที่ "ของกลาง" (additive ทั้งหมด · ไม่เปลี่ยนทางเดินเดิมของบัญชี/บอร์ดงานแม้แต่บรรทัดเดียว)
| ไฟล์ | เพิ่มอะไร | ทำไมเลี่ยงไม่ได้ |
|---|---|---|
| `api/actor.ts` | `ApiActor.customerId?` | ต้องพา "ลูกค้าคนไหน" จากด่านหน้าไปถึง handler · ใช้ `userId` ไม่ได้ (ลูกค้าไม่ใช่ผู้ใช้ของร้าน) |
| `api/require.ts` | `ApiModuleConfig.altAuth?` + เรียกเป็นด่านที่ 0 | แกนกลางรู้จักแต่คีย์ `shark_` · โมดูลอื่นไม่ประกาศฟิลด์นี้ = ทางเดินเดิมไม่ขยับ |
| `api/op.ts` | `ApiOp.replaySecrets?` | PIN บัตรกำนัลคืน "ครั้งเดียว" — ถ้า replay คืนของเดิมทั้งดุ้น สัญญานั้นเป็นโมฆะ |
| `api/idempotency.ts` | `scrubReplaySecrets()` ตอนตอบซ้ำ | คู่กับข้อบน (ชั้นบริการ `giftcard.sell` คืน `pin: null` ตอนยิงซ้ำอยู่แล้ว — สองชั้นต้องพูดตรงกัน) |
| `api/respond.ts` | รหัส `customer_scope` (403) | ลูกค้าถือ session จริงแต่เรียก op ของร้าน · 401 ไม่ถูก (ล็อกอินใหม่ไม่ช่วย) · `scope_missing` ไม่ถูก (ไม่มี scope ไหนเปิดทางนี้) |
| `gen-{account,kanban}-api-docs.mts` · `developers/{account,kanban}/page.tsx` | คำอธิบายรหัสใหม่ 1 บรรทัด | `Record<ApiErrorCode, …>` เป็น exhaustive ⇒ เพิ่มรหัสแล้วต้องอธิบายทุกโมดูล (F13.2/F13.5 จะแดงถ้าไม่ regen) |
| `docs/api/{ACCOUNT,KANBAN}-API.md` | regenerate (เพิ่มแถวรหัสใหม่ในตาราง error) | ผลของข้อบน — ไม่มีการแก้มือแม้แต่ตัวเดียว |
| `developers/member/page.tsx` | ป้ายไทย 7 หมวดใหม่ + ลำดับ + ย่อหน้าเลนลูกค้า | หน้าไล่จาก `MEMBER_OPS` เอง · ถ้าไม่ใส่ป้าย หมวดใหม่จะขึ้นเป็นคำอังกฤษดิบ |

---

## 2. 🔴 ข้อแย้ง — S3.1 `PATCH /me {nickname}` ขัดกับข้อมูล seed (ไม่ได้แก้ ตามกติกา)

ข้อสอบคาดว่า `PATCH /me {"fields":{"nickname":"เอพี"}}` → `200 {updated:["nickname"]}`
พร้อมวงเล็บกำกับว่า "(ฟิลด์ที่ร้านเปิดให้แก้)" — แต่ **ร้าน QC ไม่ได้เปิดให้แก้**:

```
MemberField ของร้าน QC (อ่านจาก DB จริง วันนี้):
[{"key":"nickname","customerEditable":false,...},
 {"key":"birthDate","customerEditable":true,...},
 {"key":"certLevel","customerEditable":false,...}]
```

หลักฐานประกอบ 3 ชั้น:
1. `fields.ts:805` — `customerEditable: input.customerEditable ?? false` (ค่าปริยายของฟิลด์ = ปิด)
2. `seed-member-qc.mts` ไม่เคยตั้ง `customerEditable` ให้ `nickname` เลย
3. **ข้อสอบ M2.9 รู้เรื่องนี้และแก้เอง**: `qc-member-m2.9.mts:165–168` พลิก `nickname.customerEditable = true`
   ก่อนทดสอบ แล้ว **คืนค่ากลับเป็น false ใน finally** (`made.fieldRestore`) ⇒ ตอน M2.10 รัน ฟิลด์นี้ปิดอยู่เสมอ

พฤติกรรมที่ได้จึงถูกต้องตามสัญญา M2.9 ("ลูกค้าแก้ได้เฉพาะฟิลด์ที่ร้านเปิดสวิตช์ `customerEditable` ให้")
และข้อความที่ตอบกลับก็เป็นภาษาไทยที่ไม่โทษผู้ใช้: *"ช่อง «ชื่อเล่น» (nickname) ให้ทางร้านเป็นผู้กรอกให้ — แจ้งพนักงานเพื่อแก้ไขข้อมูลนี้"*

**ทางแก้ที่เสนอ (ให้ Fable เคาะ — builder ไม่แตะข้อสอบ/seed เอง):**
- (ก) ข้อสอบพลิก `nickname.customerEditable` แล้วคืนค่าเหมือน M2.9 · หรือ
- (ข) ใช้ `birthDate` ซึ่ง seed เปิดให้แก้อยู่แล้ว · หรือ
- (ค) ถ้าเจตนาคือ "ชื่อเล่นลูกค้าต้องแก้เองได้เสมอ" = เปลี่ยน seed/เทมเพลตฟิลด์ (เป็นมติสินค้า ไม่ใช่ของใบนี้)

---

## 3. ข้อตัดสินอื่น (ที่สัญญาไม่ชัดและตัดสินเอง)

1. **`rewards.redeem` ใช้ scope `member.loyalty.read`** ตามหัวข้อสอบเป๊ะ — และตรงกับ service อยู่แล้ว
   (`reward/v2.ts:79 assertRedeem` เรียก `hasMemberPerm(actor,"member.loyalty.read")`) ⇒ ไม่ใช่ช่องโหว่ใหม่ที่ใบนี้เปิด
2. **`member.giftcard.sell` ถูกเพิ่มเข้าชุด `member-operate`** — ข้อสอบ S2.4 ยิง `giftcards.sell` ด้วยคีย์ operate
   และ `giftcard.sell` assert คีย์นี้ ⇒ ไม่เพิ่ม = ขายบัตรจากหน้าเคาน์เตอร์ไม่ได้เลย · `giftcard.manage`
   (ตั้งค่า/ระงับ/ทะเบียนทั้งร้าน) **ยังอยู่ชุด admin เท่านั้น**
3. **`giftcards.balance` ใช้ `member.customer.read`** (ไม่ใช่ `giftcard.*`): ต้องรู้หมายเลขเต็มถึงจะถามได้อยู่แล้ว
   และยอดคงเหลือไม่ใช่ความลับ — ความลับคือ *สิทธิ์ใช้เงิน* ซึ่งยังต้องมี PIN ทุกครั้ง
4. **`wallet.apply` ใช้ `member.customer.update`** (ชุด operate): เป็นการเปลี่ยนของที่สมาชิกถืออยู่ในบิลหนึ่ง
   ไม่มี scope ไหนของโมดูลที่ตรงกว่านี้ · `wallet.get`/`wallet.quote` = `member.customer.read`
   (จำเป็นด้วย เพราะ actor `assistant` มีเฉพาะ scope อ่าน ⇒ `member_wallet_quote` ถึงรันทันทีได้)
5. **`points.quoteBurn` ไม่คำนวณสูตรเอง** — เรียก `wallet.quoteApply` ตัวเดียวกับหน้าขาย แล้วดึงบรรทัด `POINTS`
   (ลำดับสิทธิ์ §9.1 เป็นสัญญา · คิดเองที่นี่ = วันหนึ่งยอดของ REST กับ POS จะต่างกันเงียบ ๆ)
6. **`coupons.issuePerMember` / `coupons.saveToWallet` = โคลนคูปองเป็นโค้ดเฉพาะคน** (`perMemberCode: true`,
   `usageLimit: 1`, `perMemberLimit: 1`, โค้ดสุ่ม `<BASE>-XXXXXX`) เพราะตาราง `Coupon` ยังไม่มีคอลัมน์เจ้าของ
   และใบนี้ห้ามมี migration · ใบที่โคลนตั้ง `saveToWallet: false` เสมอ — **กันโค้ดส่วนตัวไปโผล่ในกระเป๋าของทุกคน**
   (กระเป๋าของ M2.7 อ่าน "คูปองที่เปิดใช้อยู่ทั้งระบบ" ยังไม่ผูกรายคน) ⇒ ผู้เรียกเป็นคนส่งโค้ดถึงเจ้าของเอง
   จากรายการ `coupons[]` ที่คำตอบคืนไป — ดูหนี้ข้อ 1
7. **audit ของเลนลูกค้า**: `actorType = USER`, `actorId = "cs:<customerId>"` (enum `ActorType` ไม่มี `CUSTOMER`
   และการเพิ่มค่า enum = migration ซึ่งใบนี้ห้ามมี) · `targetType/targetId` ยังชี้ที่ `Customer` คนนั้นตามปกติ
8. **`dispatchMemberKind` ที่ไม่มี `proposalId`** ใช้คีย์กันซ้ำ = `kind-<sha256(kind+payload) 24 ตัว>`
   ⇒ ยืนยัน payload เดิมซ้ำไม่บวกแต้มซ้ำ (S4.6) และไม่ใช้คีย์ว่าง/คงที่ที่จะไปชนข้อเสนออื่น
9. **ไม่ทำ `POST /me/points/transfer/otp`** แม้ `me.transfer` ต้องใช้ OTP: `requestTransferOtp` ยังส่งรหัสออกไป
   ไม่ได้จริง (ไม่มี SMS gateway จนกว่าจะถึง M3.2) และไม่อยู่ในรายการ op ของสัญญา ⇒ ทางขอรหัสยังเป็น
   server action ของหน้า `/m/*` เหมือนเดิม · summary ของ `points.transfer`/`me.transfer` เขียนตามความจริงข้อนี้

---

## 4. หนี้ที่ฝากไว้

1. **กระเป๋าสิทธิ์ยังไม่รู้จัก "คูปองของใคร"** — `member/wallet.ts listWalletCoupons` อ่านคูปองที่เปิดใช้อยู่ทั้งระบบ
   (หนี้เดิมของ M2.7) ⇒ โค้ดเฉพาะคนที่ M2.10 ออกให้ จึงยังไม่ขึ้นในกระเป๋าของเจ้าของ · แก้จริงต้องมีคอลัมน์
   เจ้าของใน `Coupon` (migration) — เสนอรวมไปกับ M3.2 ที่แตะคูปองต่อคนอยู่แล้ว
2. **`giftcards.suspend` รวม 2 คำสั่งไว้ที่ path เดียว** (`suspended: false` = ปลดระงับ) เพราะสัญญาระบุ op เดียว ·
   ถ้าอยากได้ `POST /giftcards/{number}/unsuspend` แยก ค่อยเพิ่มทีหลังแบบ additive ได้
3. **`points.rules.*` / `points.settings.*` ใช้ `member.settings.manage`** ตามหัวข้อสอบ ⇒ คีย์ชุด operate
   อ่านกฎแต้มไม่ได้เลย · ถ้าจอ POS ของคู่ค้าต้องอธิบายว่า "ได้แต้มมาจากกฎข้อไหน" ต้องเปิด `points.rules.list`
   ให้ `member.point.read` — รอเจ้าของเคาะ
4. **ยังไม่ได้รัน regression ของบัญชี/บอร์ดงาน** — `qc-account-api-core` หยุดเองทันทีเพราะ env ในกะนี้ชี้ prod
   (`🔴 หยุด! … ชี้ไป production branch`) และ builder ไม่ควรดัด env เอง ⇒ **ขอให้ Fable รัน
   `qc-account-api-*` + `qc-kanban-k1.15` ด้วย env ของชุดนั้นก่อน commit** · ของที่แตะร่วมกันคือ
   `api/{actor,require,op,idempotency,respond}.ts` ซึ่ง **เพิ่มอย่างเดียวและปิดอยู่โดยปริยาย**
   (`altAuth`/`replaySecrets` ไม่ประกาศ = ทางเดินเดิมไม่ผ่านโค้ดใหม่เลย) · tsc + fitness 2 โหมด +
   docs `--check` ของทั้ง 3 โมดูลเขียวแล้ว
5. **`wallet.apply` เปิด transaction ของตัวเอง** (`applyOnSaleStandalone`) ⇒ ต้องเรียกหลังบิลถูกบันทึกแล้ว ·
   ยังไม่มี op ของ POS ใน REST ระบบสมาชิก ผู้เชื่อมต่อจึงต้องเปิดบิลทาง API อื่นก่อน

---

## 5. ตรวจภาพ (Fable)

ใบนี้ไม่มีสเปกภาพใน `visual-member.mts` · หน้าเดียวที่ตาเห็นผลคือ `/developers/member`
(หมวดใหม่ 7 กลุ่ม: แต้มสะสม · บัตรสะสมตรา · ของรางวัล · กระเป๋าสิทธิ์ · voucher · คูปอง · บัตรกำนัล
และย่อหน้าเลนลูกค้าในหัวข้อ "กติกาที่ใช้กับทุก operation")

ยังไม่ได้ตรวจด้วยตา (builder ห้าม build) — รอ Fable เทียบภาพ/หน้าจอเอง
