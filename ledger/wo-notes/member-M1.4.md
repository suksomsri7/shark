# WO M1.4 — profile service (สมัคร/แก้/360/คนซ้ำ/รวมคน) + นโยบายข้อมูลอ่อนไหว (D8+D17) + ตัวตนหลายช่องทาง (D18) + migration `member_v2_b` · โน้ตของ builder

> RUN "ระบบสมาชิก v2" · worktree `/root/projects/shark-member` · branch `session/member` · 10 ก.ย. 2569
> สัญญา: `ledger/MEMBER-RUN.md` §2 M1.4 · พิมพ์เขียว `docs/modules/06-member-v2.md` §4.1 §4.3 §5.2 §5.11 §6 §7.1 §11.1
> ข้อสอบ: `scripts/qc-member-m1.4.mts` (37 ข้อ · **ไม่ได้แตะแม้แต่บรรทัดเดียว**)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `prisma/migrations/20261013000000_member_v2_b/migration.sql` | ใหม่ | additive: `Customer.phone2` · `Customer.facebook` · `ALTER TYPE "MemberLookupTarget" ADD VALUE 'USER'` (ไม่มีการใช้ค่าใหม่ใน migration เดียวกัน) |
| `prisma/schema/member.prisma` | แก้ | คอลัมน์ `phone2`/`facebook` + ค่า enum `MemberLookupTarget.USER` (พร้อมคอมเมนต์เหตุผล) |
| `src/lib/modules/member/profile.ts` | **ใหม่ (~1,050 บรรทัด)** | `createMember` · `updateMember`/`setStatus`/`setOwner`/`setTags` · `getMember360` · `linkIdentity`/`listIdentities`/`unlinkIdentity` · `findDuplicates`/`dismissDuplicate`/`mergeMembers`/`mergeMembersApproved` · `onMerge` hook registry · `briefFor` · `linkContact` · `maskPhone` |
| `src/lib/modules/member/privacy.ts` | ใหม่ (ส่วนแรก · M1.7 ต่อ) | `evaluateSensitiveAccess` · `canViewSensitive` (§6.3 ครบ 5 ขั้น) · `logAccess` (MemberAccessLog + event) |
| `src/lib/modules/member/errors.ts` | ใหม่ (บริสุทธิ์) | `MemberNotFoundError` (404) · `MemberForbiddenError` (403) · `MemberInputError` (400) · `MemberConflictError` (409 · `code = "CONFLICT"`) |
| `src/lib/modules/member/index.ts` | ใหม่ (facade) | export ของ v2 + ของเดิม (`findOrCreate`/`logActivity`/`recordSpend`/`recordVisit`) + `linkContact` |
| `src/lib/modules/member/access.ts` | แก้ | `MemberActorRole` (+`CUSTOMER`) · `MemberApiRole` (รับทั้งพิมพ์เล็ก/ใหญ่) + `apiRoleOf()` · `coversUnit()` · `isUnitScoped()` · `customerId` ใน actor |
| `src/lib/modules/member/fields.ts` | แก้ | `phone2`/`facebook` → คอลัมน์จริง (ปิดหนี้ M1.2) · LOOKUP target `USER` (ตรวจกับ `Membership` ของร้าน) + ป้ายไทย |
| `src/lib/modules/member/field-types.ts` | แก้ | เพิ่ม `USER` ใน `LOOKUP_TARGET_LABELS`/`ORDER` |
| `src/lib/modules/member/fields-actions.ts` | แก้ 1 บรรทัด | `mc.role` อ่านจาก `auth.active.role` (แคบชนิดกลับเป็น `Role` หลัง actor รับ `CUSTOMER` ได้) |
| `src/lib/modules/member/service.ts` | แก้ | `export` `uniqueMemberCode` (ใช้ตัวสร้างรหัสสมาชิกตัวเดียวกับทางเข้าเดิม) |
| `src/lib/modules/party/service.ts` + `index.ts` | แก้ | `recordMergeCandidatePair()` (คู่เจาะจง · idempotent) · `mergeParties()` (`mergedIntoId` + ปิดคู่เป็น MERGED) |
| `src/lib/modules/point/index.ts` | ใหม่ (facade) | ห่อ `earn/burn/credit/adjustPoints(+alias adjust)/reverse/getBalance/getCustomerPoints` |
| `src/lib/outbox-consumers.ts` | แก้ | consumer 5 ตัวใหม่ (no-op ห้ามล้ม + คอมเมนต์ว่าทำไม) |
| `src/lib/automation/labels.ts` | แก้ | `AUTOMATION_EVENTS` + 4 ตัว (ป้ายไทย) — ไม่ใส่ `sensitive.viewed` โดยตั้งใจ |
| `src/lib/webhooks/labels.ts` | แก้ | `member.sensitive.viewed` ตัวเดียว (อีก 4 มาจาก spread — ห้ามซ้ำ) |
| `src/lib/approval-effects.ts` | แก้ | เคส `member.merge` (อ่าน `systemId` จาก ApprovalRequest → `member.mergeMembersApproved`) · ปฏิเสธ = ไม่ทำอะไร |
| `scripts/fitness.mts` | แก้ | `ALLOWED_EDGES` + `member→approval` · `member→point` (พร้อมเหตุผล) |
| `scripts/member-backfill-fields.mts` | แก้ | ฟิลด์ระบบ `ownerUserId` target = `USER` + ย้ายแถวเดิม EMPLOYEE → USER (idempotent · นับ "ฟิลด์ที่ปรับปลายทาง") |
| `scripts/member-backfill-referral-codes.mts` | **ใหม่ (backfill ตัวที่ 7)** | แจกโค้ดแนะนำเพื่อนให้สมาชิกที่มีอยู่ก่อน v2 — ดู §4 ข้อ 1 |
| `scripts/seed-member-qc.mts` | แก้ | เพิ่ม backfill ตัวที่ 7 เข้าลำดับท้าย seed |
| `scripts/member-expected.json` | สร้างใหม่โดย seed | id ชุดใหม่ (reseed — ดู §5) |

**ไม่ได้แตะ**: `scripts/qc-member-*.mts` · `scripts/member-qc-env.mts` · `scripts/visual-member.mts` · `scripts/qc-all.mts` · `.env*` · ไม่มี git add/commit/push · ไม่มี next build/dev
**หมายเหตุ**: `scripts/visual-member.mts` และ `scripts/qc-member-m1.10.mts` ขึ้นใน `git status` ตั้งแต่ก่อนเริ่มงาน (แก้เวลา 08:12–08:13 หลัง commit `ca10686` เวลา 08:09 · งานเตรียม oracle ของ Fable) — builder ไม่ได้แก้

---

## 2. migration + diff

```
DU=$(grep '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"'); DB=$(grep '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')
echo "$DU" | grep -q ep-plain-art || exit 1     # ด่าน host (QC เท่านั้น)
DIRECT_URL="$DU" DATABASE_URL="$DB" pnpm exec prisma migrate deploy
```

| ขั้น | ผล |
|---|---|
| `migrate deploy` | `Applying migration 20261013000000_member_v2_b` → **All migrations have been successfully applied** |
| `migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script` | `-- This is an empty migration.` (ว่าง · รันซ้ำหลังงานเสร็จก็ยังว่าง) |
| `prisma generate` | ผ่าน |
| `member-backfill-fields --tenant siam-dive-member-qc` | รอบ 1: ฟิลด์ที่ปรับปลายทาง **1** · รอบ 2: **0** (idempotent) |
| `member-backfill-referral-codes` | dry-run 60 → รอบ 1 แจก **60** · รอบ 2 แจก **0** / มีอยู่แล้ว 60 (idempotent) |

---

## 3. ผลข้อสอบ

### M1.4 (ข้อสอบของใบนี้) — **37/37** 🟢

```
JSON_SUMMARY {"total":37,"passed":37,"findings":[]}
```
รันซ้ำอีกรอบบนชุดข้อมูลเดิม (ไม่ reseed) ก็ยัง **37/37** — ข้อสอบใบนี้คืนสภาพครบ ไม่มีตกค้างที่ทำให้รอบสองแดง

### regressions

| ชุด | ผล |
|---|---|
| `qc-member-m1.1.mts` | 🟢 **28/28** |
| `qc-member-m1.2.mts` | 🟢 **27/27** (หลัง reseed — ก่อน reseed ตก S3.2 ด้วยเหตุผลที่ไม่เกี่ยวกับใบนี้ ดู §4 ข้อ 2) |
| `qc-member-m1.3.mts` | 🟢 **14/14** |
| `qc-chat-member-autolink.mts` | 🟢 **11/11** |
| `qc-kanban-k3.1.mts` | 🟡 **19/20** — ตกเฉพาะ `K3.1-S6.3` (ต้องมีภาพ ≥ 3 ใบใน `.qc-shots/kanban/3.1` ซึ่ง worktree นี้ไม่มี · เป็นข้อของ Fable ตอน build+ถ่ายภาพ ไม่ใช่โค้ด) |
| `qc-approval-wiring.mts` | **ไม่ได้รัน** — หัวไฟล์ `process.loadEnvFile(".env")` (แตะ prod) ตามกติกาใบงานจึงรายงานเฉย ๆ |
| `pnpm typecheck` (`NODE_OPTIONS=--max-old-space-size=3584`) | ✅ exit 0 |
| `pnpm fitness` (มี env) | 🟢 **23/23** |
| `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness.mts` | 🟢 **23/23** |

---

## 4. ข้อแย้ง / ข้อตัดสิน (พร้อมหลักฐาน)

### (1) 🔴 ข้อสอบ S1.8 ต้องการ `Customer.referralCode` ของสมาชิก **ที่ seed ไว้** — แต่ไม่มีใครเป็นคนแจก ⇒ เพิ่ม backfill ตัวที่ 7

หลักฐาน: `scripts/qc-member-m1.4.mts:143` อ่านโค้ดจาก DB ตรง ๆ
```ts
const refCode = ((await prisma.customer.findUnique({ where: { id: m(1).id } })) as Any).referralCode as string;
```
แต่สมาชิก 60 คนของ seed ถูกสร้างผ่าน `member.findOrCreate` (v1) ซึ่งไม่เคยเขียน `referralCode` · backfill 6 ตัวของ M1.1 ก็ไม่มีตัวไหนแจกโค้ด (§4.6 ของพิมพ์เขียวมี 6 ข้อ ไม่มีข้อ referral) · `referrals.codeFor()` อยู่ใน §5.10 = งานของ **M3.5** ⇒ รอบแรกข้อนี้ตกด้วย `{"ref":false,"src":"LIFF","ev":false}` (สมาชิก 1 ไม่มีโค้ด → `createMember` มองว่าไม่ได้ส่งรหัสแนะนำมา)

**ตัดสิน (builder)**: เขียน `scripts/member-backfill-referral-codes.mts` (idempotent · `--tenant` · `--dry-run` · ด่าน prod เดียวกับตัวอื่น) แล้วต่อท้ายลำดับ backfill ใน seed
เหตุผลเชิงผลิตภัณฑ์ ไม่ใช่แค่ให้ข้อสอบเขียว: ลูกค้าเก่าคือกลุ่มที่ร้านอยากให้ชวนเพื่อนที่สุด ถ้าโค้ดเกิดเฉพาะตอนสมัครใหม่ ฟีเจอร์ D6 จะใช้ไม่ได้กับคนกลุ่มนี้เลย · และ "แจกตอนเปิดหน้าโปรไฟล์" ไม่ได้ เพราะโค้ดต้องมีอยู่ก่อนที่เพื่อนจะเอาไปกรอกตอนสมัคร
**สิ่งที่ Fable ต้องทำต่อ**: ตอน backfill prod ของเฟสนี้ ต้องรันตัวที่ 7 ด้วย (dry-run ก่อน) — ไม่งั้น prod จะไม่มีโค้ดแนะนำเพื่อนของลูกค้าเดิม

### (2) `qc-member-m1.2` S3.2 ตกเมื่อรัน **ซ้ำรอบสอง** โดยไม่ reseed (ไม่เกี่ยวกับใบนี้)

หลักฐาน: ก่อน reseed ข้อ S3.2 ให้ `act 0 · 2` · ดูแถวจริงในตาราง `MemberFieldValueHistory` ของฟิลด์ระบบ `nickname` เจอ 2 แถวที่ **เหมือนกันทุกช่อง** ต่างแค่เวลา:
`oldValue "โอ๊ต QC" → newValue "โอ๊ต 2" · changedById = owner` เวลา `08:02:41Z` และ `08:36:54Z` (= การรัน M1.2 สองครั้ง — ครั้งแรกก่อนเริ่มงานใบนี้)
สาเหตุ: ข้อสอบ M1.2 คืนสภาพ `trackHistory` แต่ไม่ได้ลบแถวประวัติที่ตัวเองสร้าง และ S3.2 นับแบบ `=== 1` ⇒ รอบสองบนชุดข้อมูลเดิมจะแดงเสมอ
หลัง reseed: **27/27** · โค้ดของ M1.4 ไม่ได้แตะชื่อเล่นของสมาชิกคนนั้นเลย
**ข้อเสนอ**: Fable แก้ finally ของ `qc-member-m1.2` ให้ลบแถว history ของ `sysNickField` (หรือเปลี่ยนเป็น `>= 1`) — ไม่งั้นทุกครั้งที่รัน M1.2 ซ้ำโดยไม่ reseed จะเจอแดงหลอก

### (3) ค่า enum ใหม่ `MemberLookupTarget.USER` แทนการใช้ `EMPLOYEE`
`Customer.ownerUserId` เก็บ **User.id** แต่ backfill เดิมตั้ง `options.target = "EMPLOYEE"` ⇒ `fields.setFieldValues` จะเอา id ไปตรวจกับตาราง `HrEmployee` แล้วไม่มีวันผ่าน (และถ้าผ่าน ก็จะเลือกพนักงานที่ไม่มีบัญชีเข้าระบบมาเป็น "ผู้ดูแล" ได้) ⇒ เพิ่มค่า enum + ตรวจกับ `Membership` ของร้าน (ผู้ใช้ร้านอื่นถูกปฏิเสธ) · แถวเดิมถูกย้ายโดย backfill แบบ idempotent

### (4) `point/index.ts` (facade ใหม่) แทนการ import `point/service` ตรง
พิมพ์เขียว §5.11 ระบุ facade ของโมดูลแต้มไว้อยู่แล้ว แต่ไฟล์ยังไม่มีจริง (ผู้เรียกเดิมล้วง `point/service`) · ใบนี้เป็นผู้เรียกรายใหม่จึงสร้าง facade ตามสัญญา แล้วเพิ่มเส้น `member→point` ใน `ALLOWED_EDGES` (ผู้เรียกเดิมยังคงเดิม ไม่แตะ)

### (5) "การเชื่อมต่อ" ในหน้า 360 อ่านด้วย prisma ตรง (ไม่ผ่าน facade ของโมดูลปลายทาง)
เป็นการ **นับแถว** ที่ผูก `partyId` เดียวกัน (ChatContact/CrmContact/AccountContact/KanbanCardLink) ไม่มีตรรกะธุรกิจของโมดูลนั้น ⇒ ถ้าเรียกผ่าน facade จะกลายเป็นเส้น import ถาวร `member→chat/crm/account/kanban` เพื่อเลข 4 ตัว · ใช้แบบเดียวกับที่ `fields.ts#lookupExists` ทำอยู่ (มีคอมเมนต์กำกับที่ฟังก์ชัน) · S6.4 ของข้อสอบก็ห้าม import 4 โมดูลนี้ตรง ๆ อยู่แล้ว
🔴 จุดที่ต้องรู้: **ห้องแชทนับจากเบอร์ที่ตรงกันด้วย** ไม่ใช่แค่ `partyId`/`customerId` — ห้องแชทของ seed (และของจริงที่ยังไม่เคยเรียก `linkIdentity`) เก็บแค่เบอร์ ถ้าไม่นับเบอร์ การ์ดจะโชว์ 0 ทั้งที่มีห้องอยู่จริง (ข้อสอบ S3.1 ยืนบนเส้นนี้)

### (6) รวมคน: ย้าย "เบอร์/อีเมล" ต้องล้างของฝั่งที่ถูกรวมก่อนเสมอ
`Customer` มี `@@unique([memberSystemId, phone])` ⇒ ถ้าเติมเบอร์ให้คนที่เก็บไว้โดยไม่ล้างของอีกฝั่ง transaction จะล้ม · และการค้น "ซ้ำเบอร์/อีเมล" ทุกจุดกรอง `status != MERGED` เพิ่ม (ไม่งั้นสมัครซ้ำด้วยอีเมลเดิมจะไปเจอคนที่ถูกรวมไปแล้ว)

### (7) เรื่องที่ **ยังไม่ทำ** ตามที่ใบงานระบุไว้เอง
`attribution.linkId` = null (ตัวแปล `?src=` → AcquisitionLink เป็นของ M1.8) · `tier.next` = null (M1.9) · consumer 5 ตัวเป็น no-op (ผลข้างเคียงจริง — แต้มต้อนรับ/แนะนำเพื่อน/sync ชื่อ — อยู่ที่ M1.8/M1.9/M3.x ผ่าน `member-bridges.ts`)

---

## 5. การคืนสภาพ / สถานะชุดข้อมูล QC

- **reseed 1 ครั้ง** (`pnpm exec tsx scripts/seed-member-qc.mts` · 67 วิ) หลังแก้ backfill ⇒ `scripts/member-expected.json` เป็น **id ชุดใหม่** (tenant `cmtv9y6v200006lkzu8l62a55`) — ต้อง commit ไฟล์นี้ไปพร้อมกัน
- ฐานข้อมูล QC ตอนนี้ = seed สด + backfill ครบ 7 ตัว + migration `member_v2_a`,`member_v2_b` · ข้อสอบ M1.1/M1.2/M1.3/M1.4 เขียวทั้งหมดบนสภาพนี้
- ข้อสอบ M1.4 คืนสภาพเองครบใน `finally` (ตรวจแล้ว: รันซ้ำได้ 37/37)

## 6. หนี้ / ส่งต่อ

1. **prod**: ต้องรัน `member-backfill-fields` (ย้าย target ผู้ดูแล) และ `member-backfill-referral-codes` (แจกโค้ดลูกค้าเดิม) ทีละร้าน — dry-run ก่อน
2. `qc-member-m1.2` finally ยังไม่ลบแถว history ของฟิลด์ระบบ `nickname` ⇒ รันซ้ำโดยไม่ reseed จะแดงหลอก (§4 ข้อ 2)
3. `qc-kanban-k3.1` S6.3 ต้องการภาพใน `.qc-shots/kanban/3.1` (งาน build+ถ่ายภาพของ Fable)
4. `qc-approval-wiring` ยังโหลด `.env` (prod) — หนี้เดิมชุดเดียวกับที่ M1.1 ทยอยย้าย
5. 🔴 **สายอนุมัติ "รวมสมาชิก" ยังตั้งจากหน้าจอไม่ได้**: `approval/labels.ts#ENTITY_TYPES` มีแค่ `PurchaseOrder`/`HrLeave` และ `approval/actions.ts:16` มี whitelist ของตัวเอง (`new Set(["PurchaseOrder","HrLeave"])`) ⇒ เจ้าของร้านสร้างนโยบาย `member.merge` ผ่าน UI ไม่ได้ (ข้อสอบสร้างผ่าน service ตรง) และการแจ้งเตือนจะโชว์ code ดิบเพราะไม่มีป้ายไทย
   **ผลจริงบน prod**: ผู้จัดการกด "รวมสมาชิก" แล้วจะ **รวมทันที** ทุกครั้ง (ไม่มีนโยบาย = autoApproved) จนกว่าจะเปิดทางให้ตั้งนโยบายได้
   builder **จงใจไม่แก้** เพราะ `qc-approval-wiring.mts` (ชุดที่เฝ้าทะเบียนนี้) โหลด `.env` = prod จึงรันตรวจไม่ได้ตามกติกาใบงาน ⇒ ฝากให้ Fable เพิ่ม `{ value: "member.merge", label: "รวมสมาชิกซ้ำ" }` ทั้ง 2 ที่ แล้วรัน `qc-approval-wiring` ยืนยัน (แก้จริง 2 บรรทัด)
6. `onMerge` registry ยังไม่มีใครลงทะเบียน (ตั้งใจ — M2.3/M2.5/M2.6 มาใส่ voucher/สแตมป์/บัตรกำนัล)

## 7. เวลา

เริ่ม ~08:15Z · จบ ~09:5xZ (≈ 1 ชม. 45 นาที) — อ่านสัญญา/โค้ดเดิม ~35 นาที · เขียนโค้ด ~40 นาที · migration+backfill+reseed ~15 นาที · ข้อสอบ+regressions ~35 นาที
