# WO C1.1 — migration `crm_v2_a` (แรกของ RUN) + ทีมกลาง + partyId 9 ตาราง + backfill 6 ตัว + เมล็ดข้อมูล

> RUN "CRM v2" · branch `session/crm` · 18 ก.ย. 2569 · ผู้คุมงาน: Opus 5 · builder/ผู้ตรวจ = ตัวแทนแยก
> ข้อสอบ: `scripts/qc-crm-c1.1.mts` (50 ข้อ · เขียนในใบ C0.1 · commit `b8fea3f`) · **ORACLE-EDIT 2 จุดโดยผู้คุมงาน** (§7)
> 🔴 **push ใบนี้ = `prisma migrate deploy` บน production** (`scripts/vercel-build.sh`) — ผู้คุมงานอ่าน SQL ทุกบรรทัดก่อนอนุญาต

## 1. migration `20261031000000_crm_v2_a` (27.7 KB) — ผู้คุมงานตรวจจากไฟล์จริงด้วยเครื่อง
| ชนิดคำสั่ง | จำนวน | หมายเหตุ |
|---|---|---|
| `CREATE TYPE` | 14 | enum ใหม่ |
| `ALTER TYPE … ADD VALUE` | 16 | ไม่มีค่าใหม่ถูกใช้เป็น default ในไฟล์เดียวกัน |
| `CREATE TABLE` | 15 | Team · TeamMember · CrmCompany(+Contact) · CrmDealContact/Line/StageHistory · CrmLostReason · CrmVisibilityPolicy · CrmFileLink · CrmContactConsent · CustomObject/Record/Value/ValueHistory |
| `CREATE INDEX` / `UNIQUE` | 59 / 11 | |
| `ALTER TABLE` | 25 | ADD COLUMN ว่างได้หรือมี default ทุกตัว (ตรวจแล้วไม่มี NOT NULL ที่ไม่มี default) · ADD CONSTRAINT อยู่บน**ตารางใหม่**ทั้ง 9 ตัว |
| `DROP INDEX` | 2 | unique เก่า `(systemId, key)` ของ MemberSection/MemberField — อยู่**หลัง** unique ใหม่ `(systemId, objectKey, key)` (บรรทัด 720/723 → 726/729) · ไม่มีโค้ดใช้ selector นี้ (ตัวเดียวที่ใช้ `systemId_key` คือ `accountMapping` คนละตาราง) |
ข้อตัดสิน: ไม่ใส่ unique `AccountContact(systemId, partyId)` (prod อาจมีแถวซ้ำ → migration ล้ม → deploy หยุด) · ไม่ใส่ index บนคอลัมน์ใหม่ของ `MemberActivity` (ตารางร้อน) · เพิ่ม `PartyMergeReason.EMAIL` · ช่วงล็อกตารางบน prod ยอมรับ (เหตุผลใน `ledger/CRM-RUN.md` §4)

## 2. โค้ด
- `src/lib/core/teams.ts` (ใหม่): CRUD ทีม · สมาชิก · หัวหน้า · `teamsOf`/`membersOf`/`unitIdsOf` · ล็อกแถวทีม `FOR UPDATE` ทุกทางที่แก้ + `applyLead` ทางเดียวที่เปลี่ยนหัวหน้า (ยิง `setLead` พร้อมกัน 4 ทาง × 10 รอบ → หัวหน้า 1 คนทุกรอบ) · `team.updated` ใน tx เดียวกับการเขียน (3 ทะเบียน · payload มีแต่ id)
- `src/lib/modules/crm/settings.ts` (ใหม่): `getCrmSettings` ค่าเริ่มต้น `uiVersion: 1` · `bridgesEnabled: true` · หาระบบด้วย id+tenant+type CRM
- `src/lib/core/scope.ts`: ลงทะเบียน 15 โมเดลใหม่ถูกแกน (ด่าน F1 ทำงาน — ก่อนลงทะเบียน สคริปต์ทุกตัวโยนตอน import)
- **partyId 9 ตาราง**: 7 โมดูลที่มี tx (booking · shop · rental · queue · ticket · school · hotel) **ผูกหลัง commit** ด้วย `linkPartyAfterCommit` ⇒ โค้ดธุรกิจเหมือนเดิมทุกไบต์ · คลินิกผูกตอนสร้าง (ไม่มี tx และตรวจครบก่อนสร้าง) · กุญแจต้องเชื่อถือได้: เบอร์ normalize ≥ 9 หลัก หรืออีเมลถูกรูปแบบ (hotel/queue) · ไม่มีวันโยน error · log ไม่มีเบอร์/อีเมล (X8) · `ALLOWED_EDGES` `<module>→party` 8 เส้น
- ✋ **แก้นอกรายการที่ผู้คุมงานอนุญาต** (typecheck พังจาก enum ใหม่): `crm/rules.ts` `CHURNED: 2` ชั่วคราว (C1.4 เจ้าของ) · `member/field-types.ts` · `member/fields.ts` (ป้ายอย่างเดียว) · kanban `types.ts`/`link-labels.ts`/`link-resolvers.ts` (stub "ยังไม่พร้อม" · ไม่อยู่ใน `LINK_TYPE_KINDS` ⇒ REST/UI/เอกสารเหมือนเดิม)
- backfill 6 ตัว: `--dry-run` · idempotent · ต่อร้าน · ต่อ batch 200 แถว · advisory lock ต่อร้าน · **try/catch ต่อร้าน (ร้านเดียวพังรอบไม่หยุด)** · ใช้ตัวโหลด QC ที่มีด่าน prod · ปฏิเสธ prod ถ้าไม่มี `ALLOW_PROD_BACKFILL=1`
- เมล็ดข้อมูล: แถวธุรกิจ 9 ตาราง × 2 ด้วย prisma ตรง (สถานะอย่างเดียว ไม่ยิงเหตุการณ์) · cleanup ล้มแล้วหยุดดัง ๆ · ตัวตรวจตัวเองเดิมยังทำงานหลังทุกขั้น

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน (ผู้คุมงานรันเอง · `.qc-shots/crm/c11-verify.log`) |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด · เคยแดง/SKIPPED | ✅ | เขียนใน C0.1 (`b8fea3f`) · SKIPPED ถูกเหตุผลจนมี `_crm_v2_a` |
| D2 | ข้อสอบเขียวเมื่อผู้คุมงานรันเอง | ✅ | `{"total":50,"passed":50,"findings":[]}` บน reseed ใหม่ (2 รอบ) |
| D3 | กลุ่ม X | ✅ | X1 ทีมข้ามร้าน → ไม่พบ · X3 backfill ยิงคู่ขนาน 2 ชุด × 2 รอบ = ไม่ซ้ำ + `setLead` พร้อมกัน · X8 ตัวเขียน partyId ไม่ log เบอร์/อีเมล · อื่น N-A |
| D4 | regression | ✅ | **55 ชุด** — C0.2–C0.5 · crm · crm-activity · สมาชิก m1.2/1.3/1.4/1.5/3.9/fix-s1 · **23 ชุดของ 8 โมดูลที่แตะเขียวทั้งหมด** · บอร์ดงานลิงก์ k1.9/k1.15/k3.1–3.5 · แดงเฉพาะ 2 ชนิดที่พิสูจน์แล้วว่าเป็นสภาพแวดล้อม: ไฟล์ภาพใน `.qc-shots/` (M1.3 S3.x · M1.5 S4.3/4.4 · M3.9 S4.2 · K3.x) และโฟลเดอร์สกิล `.claude/` (K1.15 S3.2/S3.4) |
| D5 | typecheck + fitness 2 โหมด | ✅ | สะอาด · 29/29 ทั้งสองโหมด |
| D6 | build | ✅ | exit 0 |
| D7/D8 | ภาพ/ทะเบียนปุ่ม | ✅ N-A | ไม่มี UI |
| D9 | ผู้ตรวจไม่มี BLOCKER | ✅ | ไม่มี BLOCKER · SHOULD-FIX 5 + เพิ่ม 1 → แก้ครบ (§7) |
| D10 | ทะเบียน/เอกสาร | ✅ | `team.updated` 3 ทะเบียน |
| D11 | คืนสภาพ QC | ✅ | `qc-member-m1.9` 26/26 **ทันทีหลังข้อสอบของใบนี้** และ 26/26 **หลังจบทุกอย่าง** |
| D12 | push → **prod migration** | ✅ | `ab2b006` (+ `80385c9`) push 04:53 UTC · deploy ใหม่ `dpl_DrR3w…` ขึ้นจริง 05:00:19 (428 วิ) · **หลักฐานว่า `crm_v2_a` ลง prod แล้ว**: `scripts/vercel-build.sh` รัน `migrate deploy` แล้ว `migrate status` ใต้ `set -euo pipefail` ⇒ deploy ใหม่จะขึ้นได้ก็ต่อเมื่อ migration ผ่านทั้งสองขั้น · `/api/health` ตอบ 200 **ทุก 30 วิ ตลอดช่วง build+migration** (ไม่มีการสะดุดที่มองเห็น) · หลัง deploy: health `{ok:true,db:true,outboxPending:0}` · หน้าแรก 200 · `/api/files` 403 ตามแบบ · ⚠️ `scripts/prodmig.cjs` ต้องรับ URL ของ prod เป็นอาร์กิวเมนต์ = ต้องอ่าน `.env` ซึ่งผู้คุมงานห้าม ⇒ ใช้หลักฐานจากด่านของ build แทน |

## 7. สิ่งที่เจอ/แก้/ตัดสิน
- 🔴🔴 **ก่อนเริ่ม ผู้คุมงานเจอว่า Prisma CLI จะวิ่งบน production** (`prisma.config.ts` โหลด `.env` เมื่อไม่มี `DIRECT_URL` + `iso.sh` ไม่ส่งตัวแปรเข้า unit) และ `migrate dev` เคย reset ฐาน QC ⇒ สร้าง `scripts/qc-prisma.sh` (ยอมแค่ host QC · ห้ามคำสั่งอันตราย · พิสูจน์ทั้งสองทาง) — commit `ee3beca`
- **ORACLE-EDIT `C1.1-S3.x` + `C1.1-S5.4`**: ข้อสอบเขียนก่อนมีสคีมา เดาว่าคอลัมน์ว่างได้ · ของจริง NOT NULL ⇒ Prisma ปฏิเสธ `{ not: null }` ⇒ **ทั้งรอบตายที่ S3.2 ข้อหลังจากนั้นไม่ถูกตรวจเลย** · แก้เป็น `{ not: "" }` / `""` (ความหมายเท่าเดิม) · builder รายงานโดยไม่แตะข้อสอบ
- 🔴 **แก้ก่อน push ตามผู้ตรวจ**: ฟอร์มคิวสาธารณะรับเบอร์อะไรก็ได้ ⇒ `phone=x` ซ้ำ ๆ สร้าง Party ขยะต่อคำขอ + การจองที่ล้มทิ้งชื่อ/เบอร์คนที่ไม่เคยเป็นลูกค้า (PDPA) → ผูกหลัง commit + กุญแจ ≥ 9 หลัก · พิสูจน์: `phone=x` ×5 → 0 Party · การจองชน/ห้องเต็ม → 0 Party · ตัวควบคุมเชิงบวก 9 ฟังก์ชันจริง → 9/9 ผูก Party เดียวกัน
- แก้ตามผู้ตรวจ: หัวหน้าทีม 2 คน · backfill ล็อกตารางธุรกิจทั้งร้านนานถึง 15 นาที (prod: ยืนยันชำระ/เช็กอินค้าง) · ผูกด้วยอีเมลไม่ดูชื่อ · **UPDATE ClinicVisit ไม่เช็ค tenantId (X1)** · รวม "-"/"ไม่มี" เป็นบริษัทปลอม · ใช้ Party ซ้ำด้วยชื่ออย่างเดียว · ไม่มี try/catch ต่อร้าน · คำนำหน้าไทยกลายเป็นชื่อจริง · cleanup ของ seed กลืน error
- ตรวจแล้วก่อน push: main ไม่มี commit ใหม่ และไม่มี migration ของ session อื่นชน timestamp

## 8. หนี้ / ส่งต่อ
| เรื่อง | เจ้าของ |
|---|---|
| unique `AccountContact(systemId, partyId)` — ต้องนับแถวซ้ำบน prod แบบอ่านอย่างเดียวก่อน | **C6.1** |
| unique ของ `CrmVisibilityPolicy` มีคอลัมน์ว่างได้ (NULL ไม่ซ้ำกัน) ⇒ เขียน policy ใต้ advisory lock | **C1.7** |
| ตารางลูกแกน tenant ผูกข้ามระบบ CRM ได้ถ้าผู้เขียนปนระบบ ⇒ ยืนยันว่าแม่ทั้งสองอยู่ `systemId` เดียวกัน | **C1.2 · C1.3 · C1.5** |
| แถวคลินิกผูก Party กลาง ⇒ กั้นด้วยสิทธิ์คลินิก (ข้อมูลสุขภาพ) | **C1.11 · C2.9** |
| index บนคอลัมน์ใหม่ของ `MemberActivity` ถ้าจำเป็นจริง (มี EXPLAIN เป็นหลักฐาน) | **C2.0** |
| `CrmDeal.valueSatang` ยังเป็น Int — เพดาน ฿20 ล้าน/ดีล | **C1.5** (ตัวปฏิเสธ) |
| `qc-member-m1.1` S3.1 นับนัด 40/สมาชิกร้าน 7 เป๊ะ แต่ seed ของ CRM เพิ่มนัด 2 + nok ⇒ แดงเมื่อมี seed CRM | **ปิดเฟส C1** (ต้องตัดสินก่อนรัน `qc:all` เต็ม) |
| ด่าน prod ของ `loadQcEnv` เป็น denylist อย่างเดียว | **C5** |
