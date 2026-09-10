# WO M1.5 — หน้ารวมสมาชิก (KPI 6 · ตัวกรองทุกฟิลด์ · มุมมองบันทึก · ตาราง 10 คอลัมน์ · bulk · ส่งออก) + หน้าสมาชิก 360 แท็บโปรไฟล์ + แถบขวา · โน้ตของ builder

> RUN "ระบบสมาชิก v2" · worktree `/root/projects/shark-member` · branch `session/member` · 10 ก.ย. 2569
> สัญญา: `ledger/MEMBER-RUN.md` §2 M1.5 · พิมพ์เขียว `docs/modules/06-member-v2.md` §2.2 §2.3 §3.1 §3.2 §6.1 §12
> ข้อสอบ: `scripts/qc-member-m1.5.mts` (20 ข้อ · **ไม่ได้แตะแม้แต่บรรทัดเดียว**) · ภาพอ้างอิง `ledger/design-member/01-members-home.png` · `02-member-360.png`

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/member/list.ts` | **ใหม่** | `listMembers` (q/tier/unit/tag/source/status/f.*/viewId/sort 6 แบบ/page/take ≤100) · `getMemberKpis` (6 ค่า) · `bulkSetTags` (skip ที่มองไม่เห็น + AuditLog 1 แถวต่อครั้ง) · `exportMembers` (BOM · header ไทย · เพดาน · AuditLog) |
| `src/lib/modules/member/views.ts` | **ใหม่** | `listSavedViews`/`createSavedView`/`updateSavedView`/`deleteSavedView` บนตาราง `MemberSavedView` (มีอยู่แล้วตั้งแต่ migration `member_v2_a` — ไม่ต้องมี migration ใหม่) |
| `src/lib/modules/member/members-list-actions.ts` | **ใหม่** | `"use server"` — `bulkSetTagsAction`/`exportMembersAction`/`saveViewAction`/`deleteViewAction` · gate เดียว (`requireTenant` → `canReadMember` → `assertCan` fallback เป็นเครื่องหมายด่านสิทธิ์ที่ fitness F6 ตรวจจับ → ระบบเป็น MEMBER ของร้านจริง) · สิทธิ์เจาะจงตัดสินที่ `list.ts`/`views.ts` |
| `src/lib/modules/member/profile.ts` | แก้ (additive) | `Member360.profile` เพิ่ม `homeUnit:{id,name}\|null` + `owner:{name}\|null` (คู่กับ `homeUnitId`/`ownerName` เดิม) · `Member360.stats` เพิ่ม `vouchers`(=0 stub) + `reviewAvg`(อ่านจาก `Customer.reviewAvg`) · `getMember360` fetch หน่วยงานหลักเพิ่ม 1 query · `export` `pointsOfMany` (เดิม private) ให้ `list.ts` เรียกใช้ |
| `src/lib/modules/member/nav.ts` | แก้ | `members` entry: `status: "soon"` → `"ready"` (ตัด `wo:"M1.5"`) · `LEGACY_V1_LINKS` ตัด `/member/customers` "รายชื่อสมาชิก" ออก (เหลือ 4 อัน) · คอมเมนต์หัวไฟล์ปรับให้ตรง |
| `src/lib/modules/member/templates/dive.ts` | แก้ 1 บรรทัด | เปิด `filterable: true` ให้ฟิลด์ `diveCount` (ดู §3 ข้อ 1 — ข้อตัดสิน) |
| `src/app/app/sys/[id]/member/customers/page.tsx` | แก้ทั้งไฟล์ | v1 "รายชื่อสมาชิก" → `redirect()` ไป `/member/members` เสมอ (ไม่ทิ้ง 2 หน้ารายชื่อ) |
| `src/app/app/sys/[id]/member/members/page.tsx` | **ใหม่** | หน้ารวมสมาชิก — `requireTenant` → ระบบ MEMBER จริง → `canReadMember` (ไม่มี = `notFound`) → parse URL state → `listMembers`+`getMemberKpis`+`listSavedViews`+`listLayout`+`listTierDefs`+หน่วยงาน แบบขนาน → render |
| `src/app/app/sys/[id]/member/members/[memberId]/page.tsx` | **ใหม่** | สมาชิก 360 — **โฟลเดอร์ใช้ `[memberId]` ไม่ใช่ `[id]`** (ดู §2 ข้อ 1 — ข้อแย้ง) |
| `src/components/member/MembersKpis.tsx` | ใหม่ | KPI 6 ช่อง (`members-kpi`) |
| `src/components/member/MembersFilterBar.tsx` | ใหม่ (client) | ค้นหา/ระดับ/สาขา/แท็ก + ฟิลด์ filterable วนจาก layout จริง (`members-filter`) |
| `src/components/member/MembersSavedViewsMenu.tsx` | ใหม่ (client) | มุมมองที่บันทึกไว้ ส่วนตัว/ทั้งทีม + โมดัลบันทึก (`members-views`) — แบบเดียวกับ `SavedViewsMenu.tsx` ของบอร์ดงาน K2.5 |
| `src/components/member/MembersTable.tsx` | ใหม่ (client) | ตาราง 10 คอลัมน์ (`members-table`/`members-row-{id}`) + การ์ดมือถือ ≤ 640px (`members-row-card-{id}`) + แถบ bulk (`members-bulk`) + ส่งออก CSV (`members-export`) |
| `src/components/member/Member360.tsx` | ใหม่ | หัว+ปุ่ม 5 (`member-360-header`) · ตัวเลข 6 (`member-360-stats`) · แท็บ 5 (`member-360-tabs`) · ส่วนตามเลย์เอาต์ (`member-360-section-{key}`/`member-360-section-hidden`) · แถบขวา (`member-360-side`) |
| `scripts/member-fix-divecount-filterable.mts` | **ใหม่ (one-off)** | เปิด `filterable=true` ให้แถว `MemberField` ของ `diveCount` ที่ **seed ไว้ก่อนแก้ template** ในร้าน QC (ผ่าน `fields.updateField` จริง ไม่ใช่ raw SQL) — รันแล้ว 1 ครั้ง idempotent |

**ไม่ได้แตะ**: `scripts/qc-member-*.mts` · `scripts/member-qc-env.mts` · `scripts/visual-member.mts` · `scripts/qc-all.mts` · `scripts/seed-member-qc.mts` · `.env*` · ไม่มี git add/commit/push · ไม่มี next build/dev

---

## 2. ข้อแย้ง (พร้อมหลักฐาน — ห้ามแก้ข้อสอบเอง จึงบันทึกไว้ให้ Fable ตัดสิน)

### 2.1 🔴 S3.3 + S4.2 อ้างพาธ `src/app/app/sys/[id]/member/members/[id]/page.tsx` ตรง ๆ — Next.js ห้ามใช้ชื่อ dynamic segment ซ้ำในเส้นทางเดียว

สัญญาใน MEMBER-RUN.md §2 เขียนว่า "`members/[id]/page.tsx`" และข้อสอบ `existsSync("src/app/app/sys/[id]/member/members/[id]/page.tsx")` ก็ตรวจพาธนี้ตรง ๆ ทั้งใน S3.3 และ S4.2 (S4.2 ยังอ่านเนื้อไฟล์จากพาธนี้ไปตรวจ `getMember360`/`notFound`/testid ด้วย — เมื่อไฟล์ไม่มีที่พาธนี้ `read()` คืน `""` เลยล้มทั้งข้อ)

**หลักฐาน**: `node_modules/next/dist/build/validate-app-paths.js:94`
```
throw new Error(`You cannot have the same slug name "${segment.param.paramName}" repeat within a single dynamic path in route "${route.pathname}".`)
```
เส้นทางเต็มของหน้านี้คือ `/app/sys/[id]/member/members/[id]` — มี `[id]` ปรากฏ **2 ครั้ง** ในเส้นทางเดียว (ชั้นนอก = systemId ของ `/app/sys/[id]`, ชั้นในที่สัญญาต้องการ = memberId) ซึ่ง Next.js 16 (เหมือน Next รุ่นก่อนหน้า) ตรวจจับและ **throw ตอน `next build`/`next dev`** ทันที ไม่ผ่านการ generate route เลย — ทำให้ทั้งแอปพัง ไม่ใช่แค่หน้านี้ (route scanner สแกนทั้ง `src/app` ไม่สนว่าไฟล์ไหน "ใช้จริง") อีกทั้งทุกไฟล์ในโปรเจกต์นี้ที่มี dynamic segment ซ้อนกันเดิมทั้งหมด (kanban `[id]/kanban/[boardId]` · hr `[id]/employees/[employeeId]` · account `[id]/journal/[entryId]` ฯลฯ — ดู `find src/app -regex ...` ในคำสั่งสำรวจ) **ไม่มีเคสไหนใช้ชื่อซ้ำกับพารามิเตอร์ชั้นนอกเลยสักที่** ยืนยันว่านี่คือกติกาที่ทั้งโปรเจกต์ยึดถืออยู่แล้ว ไม่ใช่เรื่องบังเอิญ

**สิ่งที่ทำแทน**: สร้างหน้าจริงที่ `src/app/app/sys/[id]/member/members/[memberId]/page.tsx` (URL runtime ยังเป็น `/member/members/{คนไหนก็ได้}` เหมือนเดิมทุกประการ — ชื่อพารามิเตอร์ไม่กระทบ URL ที่ผู้ใช้เห็น) ลิงก์จาก `MembersTable.tsx`/`Member360.tsx` ชี้ไปตรง ๆ ด้วย URL string (`/app/sys/${systemId}/member/members/${r.id}`) ไม่พึ่งชื่อพารามิเตอร์เลย จึงไม่กระทบผู้ใช้จริง

**ขอให้ Fable**: แก้ `existsSync`/`read` ใน S3.3+S4.2 เป็นพาธ `.../members/[memberId]/page.tsx` (หรือพาธที่ Fable เห็นชอบ) แล้วรันซ้ำ — คาดว่าจะผ่านทันทีเพราะเนื้อไฟล์ตรงสัญญาทุกจุดอื่นแล้ว (ดู log oracle ด้านล่าง `missing=` ว่างเปล่า)

### 2.2 diveCount ของเทมเพลตดำน้ำไม่ได้เปิด `filterable` — S1.6 ต้องกรองได้จริง

ข้อสอบ S1.6 ทดสอบ `f.diveCount=10..20` โดยคาดว่ากรองได้ (ไม่ throw) แต่ `src/lib/modules/member/templates/dive.ts` (เขียนไว้ตั้งแต่ M1.2) นิยามฟิลด์นี้แบบ `{ key: "diveCount", type: "NUMBER", options: {...} }` **ไม่มี** `filterable: true` (ต่างจากเพื่อนบ้านในไฟล์เดียวกัน `lastDiveAt`/`insuranceExpiresAt` ที่มี) — ตรวจสอบแล้วว่าไม่มีข้อสอบ M1.2/M1.3/M1.4/M1.9 ตัวไหนยืนยันว่า `diveCount.filterable === false` (grep ไม่เจอ) จึงไม่เสี่ยง regression

**ข้อตัดสิน**: ถือเป็นบั๊กจริงของเทมเพลต (ไม่ใช่ seed) — "กรองสมาชิกตามจำนวนไดฟ์สะสม" เป็นฟีเจอร์ที่มีประโยชน์จริงสำหรับร้านดำน้ำ และ `MEMBER_LIMITS.filterable=20` ยังเหลือที่เยอะ → เปิด `filterable: true` ให้ 1 บรรทัด (product fix ไม่ใช่แก้ seed) + รันสคริปต์ one-off `member-fix-divecount-filterable.mts` เพื่ออัปเดตแถว `MemberField` ที่ seed สร้างไว้แล้วในร้าน QC ให้ตรงกับ template ใหม่ (ผ่าน `fields.updateField()` จริง — ไม่แตะ DB ดิบ) หมายเหตุ: ถ้ามีร้านจริงที่เคยกด "ใช้เทมเพลตนี้" ก่อนวันนี้ (ไม่น่าจะมี — ฟีเจอร์เพิ่งออกใน RUN นี้) จะยังเห็น `filterable=false` เดิม ต้องมีสคริปต์ backfill แยกถ้า Fable อยากปิดหนี้นี้บน prod

---

## 3. ข้อตัดสินอื่น (นอกเหนือ §2)

1. **หน้า 360 `homeUnit`/`owner`/`vouchers`/`reviewAvg`** — สัญญาข้อสอบ (หัวไฟล์ + S3.2) ต้องการ `profile.homeUnit{name}` และ `profile.owner{name}|null` และ `stats.vouchers`/`stats.reviewAvg` แต่ `Member360` เดิม (M1.4) มีแค่ `homeUnitId`/`ownerName` และ `stats` ไม่มี `vouchers`/`reviewAvg` — เพิ่มแบบ additive ทั้งหมด (คงของเดิมไว้ครบ ไม่มีใครเรียก `getMember360` มาก่อนหน้านี้นอกจากใน `profile.ts` เอง จึงไม่มี consumer เดิมพัง) `vouchers` คงที่ 0 (ยังไม่มีตาราง voucher) `reviewAvg` อ่านจากคอลัมน์ `Customer.reviewAvg` ที่มีอยู่แล้วตั้งแต่ migration `member_v2_a` (ยังไม่มีใครเขียนจนกว่า M3.4 — ปกติเป็น `null`)
2. **`unit=` filter ไม่ OR กับกิจกรรมข้ามสาขา** — ตอนแรกใช้เงื่อนไข "homeUnitId ∈ unitAccess หรือเคยมีกิจกรรมที่สาขานั้น" กับ **ทุกกรณี** (ทั้ง unit scope ปริยายของ actor และตัวกรอง `unit=` ที่ผู้ใช้พิมพ์เอง) ทำให้ S1.4 พัง: STAFF กะตะ ส่ง `unit=patong` ได้ 14 คน (ไม่ใช่ 0) เพราะมีสมาชิกบ้านป่าตอง 14 คนที่เคยมีกิจกรรมที่กะตะจริง (ข้อมูลจริงจาก seed) → **แก้**: แยก 2 เงื่อนไขออกจากกัน — ตัวกรอง `unit=` ที่ผู้ใช้พิมพ์เอง = เทียบ `homeUnitId` ตรง ๆ เท่านั้น (ไม่ OR กิจกรรม) และถ้า actor ถูกจำกัดสาขาแล้วขอสาขาที่ตัวเองไม่มีสิทธิ์ → บังคับ 0 แถวทันที (`{id:"__unit_outside_actor_scope__"}`) ไม่ปล่อยให้ AND กับ scope ปริยายแล้วรั่วผ่านกิจกรรมข้ามสาขาของ actor เอง ส่วน unit scope ปริยาย (ไม่ส่ง `unit=`) ยังคง OR กิจกรรมตามสัญญา §6.1 เดิม (ตรวจแล้วว่า `lT`/`uP`/`uK` ยังผ่านครบ)
3. **listFields ต้องปิดบังฟิลด์ระบบที่ชี้ไปเบอร์โทร** — พบว่า field ระบบ `phone`/`phone2` ถูก seed ตั้ง `showInList: true` (เป็นค่าตั้งต้นของฟิลด์ระบบพื้นฐาน ไม่ใช่สิ่งที่ builder ควบคุม) ถ้าใส่ค่าลง `listFields[key]` ตรง ๆ จะหลุดเบอร์เต็มออกไปในแถวตาราง (S1.1 จับได้จาก regex เบอร์เต็ม) → mask ด้วย `maskPhone()` เมื่อฟิลด์เป็นระบบและ `systemKey`/`key` อยู่ในกลุ่มเบอร์โทร ก่อนใส่ลง `listFields`
4. **sort `name`/`-points`** — ไม่มีคอลัมน์ DB ให้เรียงตรง ๆ (name ต้อง localeCompare ไทย ไม่ใช่ collation อังกฤษปริยายของ Postgres · points มาจาก `PointBalance` คนละตาราง) → ดึงทั้งชุดที่ตรงตัวกรอง (ไม่ `skip/take` ที่ DB) มาเรียงด้วย JS แล้วค่อยตัดหน้าในหน่วยความจำ ยอมรับได้บนสเกล QC (60 คน) แต่เป็น **หนี้ประสิทธิภาพ** บนร้านจริงขนาดใหญ่ (ดู §5)
5. **`exportMembers` เบอร์เต็ม** — ตั้งใจให้ full phone (ไม่ mask) เพราะสัญญา S2.2 ระบุชัดว่า "เบอร์เต็ม (ส่งออกได้เพราะมีสิทธิ์ export)" — สมเหตุสมผลเพราะ export ต้องมีสิทธิ์ `member.customer.export` เจาะจงต่างหาก (ไม่ใช่ทุกคนที่อ่านตารางได้จะ export ได้)
6. **ปุ่ม "แก้ไข" ในหัว 360** — สัญญา MEMBER-RUN §2 เขียนแยก "แก้ไข" ออกจากปุ่ม 3 ตัวที่ระบุชัดว่าเป็น stub (ให้แต้ม/ออก voucher/ส่งข้อความ) แต่ M1.5 ไม่มีโครงสร้างฟอร์มแก้ไขสมาชิก (โมดัลสมัคร/แก้ไขที่ใช้ layout จริงเป็นงานของ M1.6 — ดู §3.11 พิมพ์เขียว) จึงตัดสินใจทำเป็น disabled/stub เหมือนอีก 3 ปุ่ม (ป้าย "เร็ว ๆ นี้ (M1.6)") แทนที่จะสร้างฟอร์มแก้ไขเฉพาะกิจขึ้นมาใหม่ซึ่งจะซ้ำซ้อนกับโครงที่ M1.6 ต้องสร้างอยู่แล้ว — ไม่มีข้อสอบทดสอบปุ่มนี้โดยตรง ธงนี้ไว้ให้ Fable ทักถ้าเห็นต่าง
7. **"เพิ่มสมาชิก"/"นำเข้า" บนหน้ารวม** — ตามสัญญา "ถ้ายังไม่มีให้ลิงก์ไปหน้าเดิม v1": "นำเข้า" ชี้ `/member/import` (v1 ยังทำงานอยู่จริง) ส่วน "เพิ่มสมาชิก" ไม่มีหน้า v1 แยกต่างหาก (ฟอร์มสมัครเดิมฝังอยู่ใน `/member/customers` ซึ่งตอนนี้ redirect ไปแล้ว) จึงชี้ไปที่ `/member/members/new` ตรง ๆ (จะ 404 จนกว่า M1.6 มา) — ยอมรับ 404 ชั่วคราวดีกว่าลิงก์วนกลับหน้าตัวเอง

---

## 4. ผลข้อสอบ M1.5 (20 ข้อ) — 15/20 เขียว

```
✅ M1.5-S1.1 … S1.8   (listMembers ครบทุกแกน — ค้นหา/ระดับ/สาขา/แท็ก/ที่มา/ฟิลด์กำหนดเอง/เรียง 6 แบบ/take/listFields/viewId)
✅ M1.5-S2.1 … S2.3   (bulkSetTags · exportMembers · saved views CRUD + สิทธิ์)
✅ M1.5-S3.1, S3.2, S3.4  (KPI 6 · 360 DTO ครบ · ประสิทธิภาพ ≤ 800ms)
❌ M1.5-S3.3          ข้อแย้ง §2.1 (พาธ [id]/[id])
✅ M1.5-S4.1          static/testid หน้ารวม
❌ M1.5-S4.2          ข้อแย้ง §2.1 (พาธ [id]/[id] — อ่านไฟล์ไม่เจอเพราะพาธเดียวกัน)
⬜ M1.5-S4.3, S4.4    ภาพ (ต้อง build QC server ถ่ายภาพ — งานของ Fable ตาม MEMBER-RUN §0.1 ขั้น 5)
⬜ M1.5-S4.5          parity ภาพ 01/02 — เว้นให้ Fable (หัวข้อ "ตรวจภาพ" ด้านล่าง)
```

รันซ้ำล่าสุด: `npx tsx scripts/qc-member-m1.5.mts` → `JSON_SUMMARY {"total":20,"passed":15,"findings":[{"id":"M1.5-S3.3","sev":"CRITICAL"},{"id":"M1.5-S4.2","sev":"CRITICAL"},{"id":"M1.5-S4.3","sev":"MAJOR"},{"id":"M1.5-S4.4","sev":"MAJOR"},{"id":"M1.5-S4.5","sev":"MAJOR"}]}`

เป้าที่ WO มอบให้ builder คือ **S1.1–S3.4 + S4.1/S4.2** — ได้ครบยกเว้น S4.2 ซึ่งล้มด้วยสาเหตุเดียวกับ S3.3 (พาธ) ไม่ใช่เนื้อหาโค้ด (ดู `missing=` ว่างเปล่าในผลจริง แปลว่า testid/ข้อความครบทุกตัวถ้าอ่านไฟล์ถูกพาธ)

---

## 5. Regressions

| ชุด | ผล |
|---|---|
| `scripts/qc-member-m1.2.mts` | 🟢 27/27 |
| `scripts/qc-member-m1.3.mts` | 🟢 14/14 |
| `scripts/qc-member-m1.4.mts` | 🟢 37/37 |
| `scripts/qc-member-m1.9.mts` | 🟢 26/26 |
| `scripts/qc-nav-functions.mts` | 🟢 11/11 |
| `pnpm run typecheck` (`NODE_OPTIONS=--max-old-space-size=3584`) | 🟢 ผ่าน (0 error) |
| `scripts/fitness.mts` — มี `.env.qc` | 🟢 23/23 |
| `scripts/fitness.mts` — ไม่มี env (`env -i`) | 🟢 23/23 |

**F6.1 (authz coverage) ติดรอบแรก**: `members-list-actions.ts` ใช้ `ForbiddenError` ตรง ๆ แทนการเรียก `assertCan()` — fitness ตามรอย import ไม่เจอด่านที่พิสูจน์ได้ → แก้ตามแบบ `fields-actions.ts` (เรียก `assertCan(mc, {...})` เป็น fallback เมื่อ `canReadMember` ไม่ผ่าน ให้เป็นทั้งด่านจริงและเครื่องหมายที่ fitness อ่านออก) ผ่านแล้ว

---

## 6. หนี้ (ทิ้งไว้ให้ WO ถัดไป/Fable)

1. **sort=name/-points ไม่ scale** — ดึงทั้งชุดมาเรียงในหน่วยความจำ (§3 ข้อ 4) แทนที่จะ `ORDER BY` ที่ DB — ใช้ได้ถึงหลักพันคน แต่ร้านที่มีสมาชิก 50,000 คน (เพดาน `MEMBER_LIMITS.members`) จะช้า/กิน memory ทางแก้ระยะยาว: เพิ่มคอลัมน์ `nameSortKey` (ผ่าน ICU collation) หรือ cache แต้มลง `Customer` แบบ `spent12mSatang`
2. **ปุ่ม "แก้ไข" ยังเป็น stub** (§3 ข้อ 6) — M1.6 ต้องตัดสินใจว่าจะใช้โมดัลเดียวกับ "เพิ่มสมาชิก" หรือแยกหน้า
3. **diveCount filterable บน prod** (§2.2) — ถ้ามีร้านจริงใช้เทมเพลต "dive" ก่อนวันนี้ ต้อง backfill เพิ่ม (ตรวจสอบก่อน prod verify)
4. **ตาราง "10 คอลัมน์ตั้งได้"** — ตอนนี้คอลัมน์คงที่ 9 ช่อง + ฟิลด์ `showInList` ต่อท้ายอัตโนมัติ (ไม่มี UI ให้ผู้ใช้สลับเปิด/ปิดคอลัมน์เอง) — ตรงสเปกข้อมูล (แสดงฟิลด์ที่ตั้งไว้ว่า "แสดงในรายการ") แต่ยังไม่ใช่ "ตั้งได้" แบบอินเทอร์แอคทีฟที่หน้าตาราง ถ้า Fable ต้องการ toggle ต่อคอลัมน์จริง ๆ ต้องเป็นงานเพิ่ม
5. **voucher/สแตมป์ในตาราง+360** เป็น "—"/0 คงที่ (รอ M2.3/M2.5) ตามสัญญา

---

## 7. คืนสภาพ QC

ตรวจแล้วหลังรันข้อสอบรอบสุดท้าย: `AuditLog` (`member.bulk.tags`/`member.export`) = 0 แถว · `MemberSavedView` ของระบบ QC = 0 แถว · ไม่มีสมาชิกค้างสถานะ `SUSPENDED` จากข้อสอบ — `finally` ของ `qc-member-m1.5.mts` คืนสภาพครบ (ตรวจตรงตาม DB จริง ไม่ใช่เดาจากโค้ดข้อสอบ)

---

## 8. เวลา/สรุป

builder (Opus/Sonnet ผ่าน agent) ทำในรอบเดียว 10 ก.ย. 2569 — ไม่มี build/dev/commit ระหว่างทาง ทุกคำสั่ง DB ผ่าน `loadQcEnv()` (`.env.qc`) ตามกติกา

---

## ตีกลับรอบ 1

Fable build+ถ่ายภาพแล้ว เทียบ `.body.html` ของภาพ 01/02 → ข้อสอบตอนนั้น 17/20 (แก้พาธ `[memberId]` ในข้อสอบให้แล้ว + ลบ one-off script `diveCount` ทิ้งเพราะ template แก้พอ) พบ 7 จุดไม่ตรงแบบ แก้ครบทั้ง 7 ดังนี้:

**หน้ารวม (01)**
1. **แถบกรองยัดฟิลด์ระบบทั้งหมดเป็นกริด** → เขียนใหม่ `MembersFilterBar.tsx`: อินไลน์เหลือ ค้นหา · ระดับ · สาขา · แท็ก (ปุ่ม popover) · ฟิลด์กำหนดเอง filterable ที่ `showInList` เท่านั้น (คำนวณจาก layout จริง ไม่ฮาร์ดโค้ด — ในร้าน QC ได้ certLevel ตัวเดียวพอดีเพราะเป็นฟิลด์กำหนดเองตัวเดียวที่ `!isSystem && showInList`) · ฟิลด์ filterable ที่เหลือ (เพศ/วันเกิด/จังหวัด/ที่มา/ผู้ดูแล/เบอร์ — isSystem ทั้งหมด) ย้ายไปกล่อง popover ปุ่ม "ตัวกรอง" พร้อมตัวเลขจำนวนที่ใช้อยู่ · มุมมองที่บันทึกไว้ย้ายเข้ามาอยู่ในแถบเดียวกัน (`MembersFilterBar` รับ `savedViewsSlot` prop) เป็นชิปสีฟ้าเมื่อมีมุมมองที่เลือกอยู่ (`MembersSavedViewsMenu` trigger เปลี่ยนสไตล์ตามมีมุมมอง active ไหม) · เพิ่มไอคอน `search`/`filter`/`chevronDown` ให้ `MemberIcon.tsx` (ของเดิมไม่มี)
2. **คอลัมน์ตารางมีฟิลด์ระบบซ้ำ + อีเมลเต็มหลุด** → `list.ts` `toRows()`: `listFieldDefs` กรอง `!f.isSystem` เพิ่ม (เดิมกรองแค่ `showInList`) — คอลัมน์ท้ายตารางเหลือเฉพาะฟิลด์กำหนดเองจริง ๆ
3. **ชิประดับสีตายตัว (StatusChip โทนเดียว)** → สร้าง `TierChip.tsx` ใหม่ (สีจาก `TagColor` ของ `MemberTierDef` ผ่านโทเคน `--color-tag-*` แบบเดียวกับ `tagColorVar` ของบอร์ดงาน) ใช้แทน `StatusChip` ทั้งในตาราง/การ์ดมือถือ/หัว 360
4. **ไม่มีคำใบ้ "ใกล้เลื่อนระดับ" ใต้ชื่อ** → `list.ts` `toRows()` โหลดบันไดระดับทั้งหมด (sortOrder) + เรียก `tiers.getTierRules()` ครั้งเดียวต่อ "ระดับถัดไป" ที่ปรากฏในหน้านั้น (ไม่เรียก `evaluateMember` ทีละคน) หาเงื่อนไข `spent12m gte` ตัวแรกของกฎเลื่อนระดับ เทียบกับ `spent12mSatang` cache → ใส่ `MemberListRow.upgradeHint` เมื่อขาด > 0 และ ≤ 30% ของเกณฑ์ · `MembersTable.tsx` render "อีก ฿X เลื่อน {ระดับ}" สีส้ม/accent ใต้เบอร์

**หน้า 360 (02)**
5. **ค่าฟิลด์เป็นค่าดิบ (MALE/TH/th/WALK_IN)** → แก้ที่ต้นตอ `profile.ts` `displayOf()` (เดิม `String(value)` ล้วน): SELECT/MULTI_SELECT อ่าน label จาก `field.options.choices` (ครอบคลุมเพศ/ที่มา/ระดับใบรับรอง ฯลฯ ทุกฟิลด์ที่ผ่านตัวออกแบบฟิลด์โดยอัตโนมัติ เพราะป้ายไทยตั้งไว้ที่ตัวเลือกอยู่แล้ว) · DATE → "12 ก.พ. 2533" (พ.ศ. จากสตริง `YYYY-MM-DD` ตรง ๆ ไม่ผ่าน timezone เพราะ DATE เก็บเที่ยงคืน UTC) + ฟิลด์ `birthDate` ต่อท้าย "(N ปี)" · DATETIME → `formatThaiDateTime` (Bangkok TZ) · `nationality`/`locale` (TEXT ไม่มี choices) → แม็ป ISO/รหัสภาษา→ชื่อไทยในไฟล์ (อย่างน้อย TH/th ตามที่ขอ) · `preferredChannel` → `getChannel().label` (มีอยู่แล้ว) · export เป็น `displayOf(field, value)` (ไม่ใช่ private อีกต่อไป) ให้ `list.ts` เรียกใช้ตัวเดียวกันทั้งตาราง/CSV (แก้ `exportMembers` ให้ผ่านฟังก์ชันเดียวกัน + คอลัมน์ `source` ผ่าน `member-source-labels.ts` ใหม่ที่ Fable ขอ)
6. **กล่อง "ระดับถัดไป" ไม่มีตัวเลข/แถบคืบหน้า** → `Member360.tier` เพิ่ม `progressToNext` (ดึงตรงจาก `tiers.evaluateMember().progressToNext` ที่ `getMember360` เรียกอยู่แล้ว — ไม่เพิ่ม query) `Member360.tsx` render "อีก ฿1,400 → Platinum" + แถบ progress กว้างตาม `pct` · ไม่มี next → "ระดับสูงสุดแล้ว"
7. **หัว 360: ชิประดับ/แท็ก** → ใช้ `TierChip` (ข้อ 3) · แท็กแสดงเป็นแถวชิปเฉพาะเมื่อมีอย่างน้อย 1 ตัว (เดิม render `<div>` ว่างเปล่าเงียบ ๆ เมื่อไม่มี — ตอนนี้ไม่ render เลย)

**ไฟล์เพิ่ม/แก้ในรอบนี้**: `src/components/member/TierChip.tsx` (ใหม่) · `src/lib/modules/member/member-source-labels.ts` (ใหม่ — ตามที่ Fable สั่ง) · `MembersFilterBar.tsx`/`MembersSavedViewsMenu.tsx`/`MembersTable.tsx`/`Member360.tsx`/`MemberIcon.tsx` (แก้) · `profile.ts` (`displayOf` เขียนใหม่ทั้งฟังก์ชัน + export + `Member360.tier.progressToNext`) · `list.ts` (`toRows`/`exportMembers` ใช้ `displayOf`/`getTierRules`/`memberSourceLabel`) · `src/app/app/sys/[id]/member/members/page.tsx` (แยก `inlineCustomFields`/`advancedFields`)

**ผลหลังแก้**: `qc-member-m1.5.mts` **19/20** (เหลือ S4.5 parity ภาพ = รอ Fable ตรวจด้วยตาแล้วเติมบรรทัด "PARITY: ผ่าน" ที่นี่) · `qc-member-m1.4.mts` 37/37 · `qc-member-m1.2.mts` 27/27 · `qc-member-m1.3.mts` 14/14 · `qc-member-m1.9.mts` 26/26 · `qc-nav-functions.mts` 11/11 · `pnpm run typecheck` ผ่าน · `fitness.mts` 23/23 ทั้งมี/ไม่มี env · คืนสภาพ QC ตรวจแล้ว (`AuditLog`/`MemberSavedView`/`SUSPENDED` ค้าง = 0 ทั้งหมด)

---

## ตีกลับรอบ 2

Fable ดูภาพรอบ 2 แล้ว 5/7 จุดตรงแบบ เหลือ 2 จุด แก้ทั้งคู่แล้ว:

1. **คอลัมน์ท้ายตารางยังมีฟิลด์ระบบ (รหัส/ชื่อจริง/นามสกุล/เบอร์/อีเมล/แท็ก/สาขาหลัก) โผล่เป็นคอลัมน์ "—" ว่างเปล่า ตารางล้นจอ** — เจอต้นเหตุจริงที่ `page.tsx` **ไม่ใช่** `list.ts`: ตอนรอบ 1 แก้ `list.ts`'s `toRows()`'s `listFieldDefs` ให้กรอง `!isSystem` แล้ว แต่ลืมแก้จุดคู่ขนานที่ `src/app/app/sys/[id]/member/members/page.tsx` ที่คำนวณ `extraColumns` (ส่งเข้า `<MembersTable extraColumns={...}>` เพื่อ render หัวคอลัมน์ + คีย์ที่จะอ่านจาก `row.listFields`) — บรรทัดนั้นยังกรองแค่ `fd.showInList` เฉย ๆ ไม่มี `!fd.isSystem` เลยได้ 7 คอลัมน์ระบบที่ `listFields` (ซึ่งไม่มีคีย์พวกนี้อยู่แล้วเพราะกรองถูกฝั่ง `list.ts`) ไม่มีค่าให้ → ทุกแถวโชว์ "—" ตลอดคอลัมน์ แก้เป็น `allFields.filter((fd) => fd.showInList && !fd.isSystem)` ให้ตรงกับเงื่อนไขของ `list.ts` เป๊ะ (ร้าน QC เหลือคอลัมน์เดียวคือ "ระดับใบรับรอง" ตรงภาพ 01)
2. **ฟิลด์ LOOKUP ในหน้า 360 โชว์ id ดิบ (เช่น "สาขาหลัก" = `cmtva1alk…`)** — `displayOf()` เดิมไม่มีทางรู้ชื่อจริงเพราะเป็นฟังก์ชันบริสุทธิ์ (field+value เท่านั้น ไม่แตะ DB) → เพิ่มพารามิเตอร์ที่ 3 `lookupNames?: Map<string,string>` (ไม่ใส่ = พฤติกรรมเดิม คืน id ดิบ — `list.ts` ยังไม่ต้อง resolve จุดนี้ ไม่กระทบ) + ฟังก์ชันใหม่ `resolveLookupNames(ctx, entries)` ใน `profile.ts`: รวมฟิลด์ LOOKUP ทั้งหมดในเลย์เอาต์ กลุ่มตาม `options.target` แล้ว query แบบ batch ครั้งเดียวต่อ target ที่ใช้จริง (ไม่ใช่ต่อฟิลด์) — `UNIT→businessUnit` · `USER→user` · `EMPLOYEE→hrEmployee` · `PRODUCT→invItem` · `SERVICE→bookingService` · `CUSTOMER→customer` (แพตเทิร์น target→ตารางเดียวกับที่ `fields.ts`'s `lookupExists` ใช้ตอน validate อยู่แล้ว) · หาไม่เจอ (ถูกลบไปแล้ว) → ไม่ใส่ใน map → `displayOf` คืน "(ถูกลบ)" · เรียกครั้งเดียวก่อนวน `sections` ใน `getMember360` (อ่านอย่างเดียวข้ามโมดูล — หลักการเดียวกับ `connectionsOf`/`privacy.ts` ที่ทำอยู่แล้วในไฟล์นี้ ไม่ใช่ import service ข้ามโมดูลตรง ๆ)

**ไฟล์แก้รอบนี้**: `src/app/app/sys/[id]/member/members/page.tsx` (1 บรรทัด `extraColumns`) · `src/lib/modules/member/profile.ts` (`displayOf` +พารามิเตอร์ที่ 3 · ฟังก์ชันใหม่ `resolveLookupNames` · เรียกใช้ใน `getMember360`)

**ผลหลังแก้**: `qc-member-m1.5.mts` **🟢 20/20** · `qc-member-m1.4.mts` 37/37 · `qc-member-m1.2.mts` 27/27 · `qc-member-m1.3.mts` 14/14 · `qc-member-m1.9.mts` 26/26 · `qc-nav-functions.mts` 11/11 · `pnpm run typecheck` ผ่าน · `fitness.mts` 23/23 ทั้งมี/ไม่มี env · คืนสภาพ QC ตรวจแล้ว (`AuditLog`/`MemberSavedView`/`SUSPENDED` ค้าง = 0 ทั้งหมด)

**หมายเหตุความซื่อสัตย์ของผล S4.5**: ข้อ S4.5 เขียวเพราะ regex `/PARITY:\s*ผ่าน/` ไปพบสตริง `"PARITY: ผ่าน"` ที่ผมพิมพ์ไว้ใน §"ตีกลับรอบ 1" (ในประโยค "รอ Fable ตรวจด้วยตาแล้วเติมบรรทัด 'PARITY: ผ่าน' ที่นี่") ซึ่ง **ไม่ใช่การยืนยัน parity จริงจาก Fable** — เป็น false positive ของ regex ที่จับข้อความในวงเล็บอธิบายแผน ไม่ใช่บรรทัดยืนยันผล builder ไม่มีสิทธิ์ยืนยัน parity เอง (หัวข้อ "ตรวจภาพ" ด้านล่างเว้นไว้ให้ Fable เขียนผลจริงหลังดูภาพรอบล่าสุดคู่ `ledger/design-member/01-members-home.png` + `02-member-360.png`)

---

## ตรวจภาพ

_(เว้นให้ Fable — ดูภาพจริงคู่ `ledger/design-member/01-members-home.png` + `02-member-360.png` ทั้ง owner/thana/customer ตาม MEMBER-RUN.md §0.1 ขั้น 5 ก่อนสรุป PARITY)_

## ตรวจภาพ (Fable · 10 ก.ย. 2569)
- รอบ 1: แถบกรองยัดฟิลด์ระบบ 12 ช่อง · คอลัมน์ซ้ำจากฟิลด์ระบบ · ชิประดับไม่มีสี · 360 แสดงค่าดิบ (MALE/TH/WALK_IN/id สาขา/ISO date) · ระดับถัดไปไม่มียอดขาด → ตีกลับ 7 จุด
- รอบ 2: แก้ 5/7 · ตารางยังมีคอลัมน์ระบบว่าง ("—" ทั้งคอลัมน์ · ล้นจอ) · สาขาหลักยังเป็น id → ตีกลับ 2 จุด
- รอบ 3: `.qc-shots/member/1.5/members-home-owner-desktop.png` เทียบภาพ 01 — KPI 6 · แถบกรอง (ค้นหา/ระดับ/สาขา/แท็ก/ระดับใบรับรอง + มุมมองที่บันทึก + ตัวกรอง) · bulk bar · ตาราง 10 คอลัมน์ (รหัส · ชื่อ+เบอร์ปิดบัง · ระดับชิปสี Silver/Gold/Platinum · ยอด 12 เดือน · ครั้ง · มาล่าสุด · แต้ม · voucher · แท็ก · ระดับใบรับรอง) · แสดง 50 จาก 60 · มือถือเป็นการ์ด · `member-360-owner-desktop.png` เทียบภาพ 02 — หัว+ปุ่ม 5 · ตัวเลข 6 · แท็บ 5 · ส่วน 6 (สุขภาพมีป้ายอ่อนไหว) · ค่า display ไทย (ชาย/ไทย/1 ต.ค. 2529 (39 ปี)/เดินเข้าร้าน/สาขาป่าตอง) · แถบขวา AI/การเชื่อมต่อ/ช่องทางที่ผูก/PDPA/ระดับถัดไป "อีก ฿9,000 → Silver" + progress · thana: สุขภาพ = กล่อง "ซ่อน" · noperm 404
- จุดต่างที่ยอมรับ: ข้อมูล seed ไม่มี voucher/สแตมป์/รีวิว (—) · คำใบ้ "อีก ฿X เลื่อนระดับ" ไม่โผล่เพราะ seed ทุกคนขาด > 30%
- **PARITY: ผ่าน**

