# WO K1.1 — ไมเกรชัน A + backfill + ordering core + แจ้งเตือนตรงคน

> สัญญา: `ledger/KANBAN-RUN.md` §K1.1 · ข้อสอบ: `scripts/qc-kanban-k1.1.mts` (Fable · ไม่แตะ)
> DB ที่ใช้ทำงาน: **QC เท่านั้น** (Neon branch host `ep-plain-art`) · ไม่แตะ prod · ไม่ commit (ทิ้ง tree ไว้สกปรกตามสั่ง)

## สถานะ
| ด่าน | ผล |
|---|---|
| `qc-kanban-k1.1.mts` | **28/30 · CRITICAL 1 · MAJOR 1** — ตก 2 ข้อ **จากข้อสอบเอง ไม่ใช่งานที่ส่ง** (หลักฐาน §6) |
| `qc-kanban-notify.mts` | ✅ 12/12 (เพิ่ม KN-3b/KN-4b ตรวจ `recipientUserId`) |
| `qc-ai-kanban-board.mts` | ✅ 3/3 |
| `pnpm typecheck` | ✅ 0 error |
| `pnpm fitness` (2 โหมด) | 19/20 — ข้อที่ตก = F7.1 `docs/modules/13-kanban-v2.md → kanban/limits.ts` **ของ agent เอกสารที่เขียนขนานกัน** ไม่ใช่ไฟล์ของ WO นี้ |

## 1. ไฟล์ที่แตะ
| ไฟล์ | เรื่อง |
|---|---|
| `prisma/schema/kanban.prisma` | enum ใหม่ 3 · คอลัมน์ใหม่ Board 6 / Column 4 / Card 11 · index ใหม่ 3 |
| `prisma/migrations/20260919000000_kanban_v2_a/migration.sql` | ไมเกรชันชุด A (เพิ่มอย่างเดียว) |
| `src/lib/modules/kanban/ordering.ts` | **ใหม่** — แกนลำดับ (fractional indexing) ไม่แตะ prisma |
| `src/lib/modules/kanban/service.ts` | dual-write `position`+`sortOrder` · `cardNo` · `createBoard` รับ unit/visibility/color/createdById · getBoard เรียงตาม position · แจ้งเตือนตรงคน |
| `scripts/backfill-kanban-v2-a.mts` | **ใหม่** — backfill idempotent |
| `scripts/qc-kanban-notify.mts` | ย้ายจาก `loadEnvFile(".env")` → `loadLegacyQcEnv` + ตรวจ `recipientUserId` |
| `scripts/qc-all.mts` | รองรับเครื่องหมาย `// requires: kanban-seed` |
| `package.json` / `pnpm-lock.yaml` | + `fractional-indexing` |

## 2. แพ็กเกจใหม่
`fractional-indexing@4.0.0` (rocicorp) — **สัญญาอนุญาต CC0-1.0** ไม่ใช่ MIT อย่างที่ใบงานเขียนไว้
(CC0 = ยกให้สาธารณสมบัติ กว้างกว่า MIT ไม่มีเงื่อนไขแนบ ⇒ ใช้ได้ แต่บันทึกไว้ให้ตรงความจริง)
API ที่ใช้: `generateKeyBetween`, `generateNKeysBetween` · base62 `0-9A-Za-z` · `(null,null) → "a0"`

## 3. migration SQL (รายคำสั่ง · อ่านด้วยตาแล้ว)
`prisma/migrations/20260919000000_kanban_v2_a/migration.sql` — 9 คำสั่ง **เพิ่มอย่างเดียวทั้งหมด**
1. `CREATE TYPE "KanbanBoardVisibility" AS ENUM ('PRIVATE','TENANT')`
2. `CREATE TYPE "KanbanLabelColor" AS ENUM ('SLATE','BLUE','GREEN','AMBER','RED','PURPLE')`
3. `CREATE TYPE "KanbanCardSourceType" AS ENUM ('MANUAL','TEMPLATE','CHAT','FORM','EMAIL','AUTOMATION','AI')`
4. `ALTER TABLE "KanbanBoard" ADD COLUMN` × 6 — `cardNoSeq` (INT NOT NULL DEFAULT 0) · `color` (NOT NULL DEFAULT 'SLATE') · `visibility` (NOT NULL DEFAULT 'PRIVATE') · `unitId` · `createdById` · `templateOfId` (3 ตัวหลัง nullable)
5. `ALTER TABLE "KanbanCard" ADD COLUMN` × 11 — `sourceType` (NOT NULL DEFAULT 'MANUAL') · ที่เหลือ nullable ทั้งหมด (`cardNo` `position` `startAt` `completedAt` `reminderMinutesBefore` `reminderSentAt` `coverFileId` `sourceId` `createdById` `archivedById`)
6. `ALTER TABLE "KanbanColumn" ADD COLUMN` × 4 — `isDoneColumn` (NOT NULL DEFAULT false) · `position` `wipLimit` `color` (nullable)
7. `CREATE INDEX "KanbanBoard_tenantId_systemId_unitId_idx"`
8. `CREATE INDEX "KanbanCard_tenantId_systemId_status_dueAt_idx"`
9. `CREATE INDEX "KanbanCard_boardId_cardNo_idx"` (ยัง **ไม่ unique** — เพิ่มใน migration B ของ K1.4 หลัง backfill)

ตรวจด้วยตาแล้ว: ไม่มีคำสั่งลบคอลัมน์/ตาราง · ไม่มีเปลี่ยนชนิดคอลัมน์เดิม · ทุก NOT NULL มี DEFAULT
⇒ โค้ดเก่าที่ยังวิ่งอยู่ระหว่าง Vercel deploy เสิร์ฟต่อได้ (บทเรียนแชทล่ม 2.5 ชม. 1 ก.ย.)

คำสั่งที่ใช้สร้าง (Prisma 7 — ธง `--from-schema-datasource` ถูกถอดออกแล้ว):
```
pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema --script
```

## 4. backfill — อัลกอริทึม
`scripts/backfill-kanban-v2-a.mts` · ไล่ **ทีละบอร์ด · 1 transaction ต่อบอร์ด** (timeout 120s)
1. อ่านคอลัมน์ ACTIVE เรียง `sortOrder → createdAt`
2. **เครื่องหมาย "บอร์ดมีมาก่อน K1.1"** = คอลัมน์ ACTIVE ยังไม่มี `position` สักตัว → `visibility: PRIVATE → TENANT`
   (อ่านเครื่องหมาย **ก่อน** เติม position · บอร์ดที่โค้ดใหม่สร้างมี position ตั้งแต่แรกจึงไม่ถูกแตะ · บอร์ดใหม่คง PRIVATE)
3. เติม `position` คอลัมน์ด้วย `keysBetween` — แถวที่มีคีย์แล้วเป็น "หมุด" เติมเฉพาะช่องว่างระหว่างหมุด (ไม่เขียนทับของเดิมเลย)
4. เติม `position` การ์ด ACTIVE ต่อคอลัมน์ ด้วยกติกาเดียวกัน (เรียง `sortOrder → createdAt`)
5. `cardNo`: การ์ดทั้งบอร์ด (รวมที่เก็บเข้าคลัง) เรียง `createdAt` → ใบที่ยังไม่มีเลข ได้เลขถัดจากเลขสูงสุดที่มีอยู่ (บอร์ดที่ยังไม่มีเลขเลยเริ่มที่ 1)
6. `cardNoSeq` ของบอร์ด = เลขการ์ดสูงสุด
รันซ้ำ = ไม่มีอะไรเปลี่ยน (วัดจริง: รอบ 2 `touched 0`) · พิมพ์ `BACKFILL_SUMMARY {...}` ให้อ่านเป็นตัวเลข

**ผลบน QC (รอบแรก)**: `{"boards":11,"touched":11,"visibility":11,"columns":35,"cards":39,"cardNo":39,"cardNoSeq":4}`
(11 บอร์ด = ร้าน QC บอร์ดงาน 3 + บอร์ดตกค้างจากข้อสอบชุดอื่นบน branch เดียวกัน)

### วิธีรันบน prod (Fable — หลัง deploy K1.1 ขึ้น Vercel แล้ว)
```
cd /root/projects/shark-in-th          # worktree ที่ .env = production
ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/backfill-kanban-v2-a.mts
```
- ไม่ตั้ง `ALLOW_PROD_BACKFILL=1` → สคริปต์บังคับผ่าน `loadQcEnv()` ซึ่ง **ตายทันที** ถ้า host เป็น branch production
- ตั้งแล้ว → โหลด `.env` (หรือไฟล์ที่ระบุด้วย `BACKFILL_ENV_FILE`) + พิมพ์คำเตือนก่อนเริ่ม
- รันได้หลายครั้ง ปลอดภัย · ต้องรัน **หลัง** `prisma migrate deploy` ของ Vercel เสร็จ (ไม่งั้นคอลัมน์ยังไม่มี)
- 🔴 ต้องรันเร็วที่สุดหลัง deploy: ก่อนรัน บอร์ดเก่าทุกใบเป็น PRIVATE ตาม default ⇒ ถ้าทิ้งไว้นานหลัง K1.3 (สิทธิ์ 2 ชั้น) ขึ้น พนักงานจะมองไม่เห็นบอร์ด

## 5. โค้ดที่เปลี่ยน (สรุปพฤติกรรม)
- `ordering.ts`: `keyBetween` `keysBetween` `needsRebalance(keys, max=50)` `rebalanceKeys(n)` `comparePosition` `positionOf`/`readPosition` `sortByPosition` — ไม่ import prisma
  - `positionOf(row)` = `position` ถ้ามี ไม่งั้น `"0" + sortOrder เติมศูนย์ 10 หลัก` ⇒ แถวที่ยังไม่ backfill เรียงถูกและอยู่ **ก่อน** แถวที่มีคีย์ (คีย์จริงขึ้นต้นด้วยตัวอักษร > "0")
- `createBoard(input)` + `unitId? visibility? color? createdById?` · คอลัมน์เริ่มต้น 3 ตัวได้ `position` ตั้งแต่แรก
- `createColumn` / `createCard` เขียน `position = keyBetween(คีย์ท้ายสุด, null)` **คู่กับ** `sortOrder` เดิม (D10)
- `createCard` เพิ่ม `startAt` `sourceType` `sourceId` `createdById` · จองเลขการ์ดใน tx เดียวกับการสร้าง:
  `UPDATE "KanbanBoard" SET "cardNoSeq" = "cardNoSeq" + 1 WHERE id = $1 RETURNING "cardNoSeq"` (คำสั่งเดียวจบ — กันเลขซ้ำตอนสร้างพร้อมกัน) · raw SQL อยู่ใน `service.ts` ที่ import prisma อยู่แล้ว ⇒ F5 ratchet ไม่ขยับ
- `getBoard` เรียง `position (nulls first) → sortOrder → createdAt` · `listMyCards` เรียง `dueAt → position → sortOrder → createdAt`
  - ⚠️ **ต่างจากตัวอักษรของใบงานเล็กน้อย**: ใบงานสั่ง `listMyCards` เรียง position ก่อน แต่หน้า "งานของฉัน" จัดกลุ่มตามกำหนดส่ง (เลยกำหนด/วันนี้/สัปดาห์นี้) และ `position` เป็นลำดับ**ภายในคอลัมน์**ซึ่งข้ามบอร์ดแล้วไม่มีความหมาย ⇒ คง `dueAt` เป็นตัวหลัก แล้วใช้ position/sortOrder เป็นตัวตัดสินเมื่อกำหนดส่งเท่ากัน (ข้อสอบไม่ได้ตรวจข้อนี้)
- `moveCard` **เขียน `position` ใหม่ด้วย** (ต่อท้ายคอลัมน์ปลายทาง) — ไม่ได้อยู่ในใบงานแต่จำเป็น: getBoard เรียงด้วย position แล้ว ถ้าไม่เขียนการ์ดที่ย้ายจะไปโผล่กลางคอลัมน์ตามคีย์เก่า (ย้ายแบบเลือกตำแหน่ง before/after = K1.4)
- `notifyAssignment` เขียน `recipientUserId = assigneeUserId` (คง outbox `kanban.card.assigned` เหมือนเดิม) · `updateCard` ยังไม่แจ้งเมื่อผู้รับคนเดิม
- `qc-all.mts`: `// requires: kanban-seed` → ถ้า `resolveKanbanScope()` คืน null จึงเรียก `seed-kanban-qc.mts` (มีอยู่แล้ว = ข้าม ไม่เขียนทับ `kanban-expected.json`) · seed ล้ม = ชุดที่ต้องใช้ขึ้น ❌ พร้อมเหตุผล ชุดอื่นรันต่อ

## 6. 🔴 ข้อสอบตก 2 ข้อ — วัดแล้วว่าเป็นข้อสมมติของข้อสอบเอง (Fable ตัดสิน)

### K1.1-S1.6 (MAJOR) — index มีครบ แต่ regex เทียบผิดรูป
ข้อสอบเทียบ `indexdef` ด้วย `/"tenantId", "systemId", "status", "dueAt"/` แต่ Postgres **ไม่ใส่เครื่องหมายคำพูดให้ `status`** (ตัวพิมพ์เล็กล้วน ไม่ใช่คำสงวน) ค่าจริงจาก `pg_indexes`:
```
CREATE INDEX "KanbanCard_tenantId_systemId_status_dueAt_idx" ON public."KanbanCard" USING btree ("tenantId", "systemId", status, "dueAt")
CREATE INDEX "KanbanBoard_tenantId_systemId_unitId_idx"      ON public."KanbanBoard" USING btree ("tenantId", "systemId", "unitId")   ← regex ผ่าน
CREATE INDEX "KanbanCard_boardId_cardNo_idx"                 ON public."KanbanCard" USING btree ("boardId", "cardNo")                 ← regex ผ่าน
```
index ที่สัญญาไว้ **มีครบทั้ง 3 ตัว** · index เดิมของโปรเจกต์ (`KanbanBoard_tenantId_systemId_status_idx`) ก็แสดง `status` ไม่มีเครื่องหมายคำพูดเหมือนกัน ⇒ ไม่มีวิธีเขียน schema ให้ Postgres ใส่เครื่องหมายคำพูดให้
**เสนอแก้ข้อสอบ**: `/"tenantId", "systemId", "?status"?, "dueAt"/`

### K1.1-S3.4 (CRITICAL) — เกณฑ์ "60 รอบ → คีย์ยาวเกิน 50" เป็นไปไม่ได้กับไลบรารีที่สเปคบังคับ
ข้อสอบแทรกจุดเดิม 60 ครั้ง แล้วต้องได้ `maxLen > 50` — ค่านี้เป็นผลของ **ไลบรารีล้วน ๆ** ไม่ขึ้นกับโค้ดที่ส่ง
`fractional-indexing` แบ่งครึ่งช่องว่างแบบ base62 ⇒ คีย์ยาวขึ้น 1 ตัวอักษรต่อการแทรก ~5.95 ครั้ง (log62 ของ 1 หลัก)
วัดจริง (positive control):
```
60 รอบ  : maxLen = 14  · needsRebalance = false
242 รอบ : คีย์เกิน 50 ตัวอักษรครั้งแรก
400 รอบ : maxLen = 82  · needsRebalance = true      ← ฟังก์ชันทำงานถูก
needsRebalance(60 รอบ, max=10) = true · needsRebalance([]) = false · needsRebalance(['a0','a1']) = false
```
ลำดับคีย์ที่ได้จริง: `Zz ZzV Zzl Zzt Zzx Zzz ZzzV …` (ยาวขึ้นทีละตัวทุก ~6 รอบ)
จะให้ผ่านต้องเขียนอัลกอริทึมเองแบบ base2 ซึ่ง §11.1 ห้าม ("ห้าม implement เอง") และ S3.1/S3.2 ก็บังคับให้ใช้แพ็กเกจ
**เสนอแก้ข้อสอบ** (เลือกอย่างใดอย่างหนึ่ง): เพิ่มรอบเป็น ≥ 250 · หรือคงรอบ 60 แล้วเรียก `needsRebalance(grown, 10)` + เทียบ `maxLen > 10`

### หมายเหตุความสะอาดของข้อสอบ (ไม่ใช่ข้อตก แต่ทำให้รันรอบสองแดง)
`qc-kanban-k1.1.mts` สร้างการ์ดใน S4 แล้วลบทิ้งตอนท้าย แต่ **ไม่คืน `cardNoSeq`** ⇒ จบรอบหนึ่งบอร์ดป่าตองเหลือ `cardNoSeq = 25` แต่ `cardNo` สูงสุด = 24
รอบถัดไป S2.5 จะแดง แล้วลามไป S4.1/S4.2 (เพราะ backfill ใน S2.7 รีเซ็ต seq กลับเป็น 24 กลางรอบ) — วัดจริงได้ 25/30
**วิธีรันให้ผลนิ่ง**: รัน `pnpm exec tsx scripts/backfill-kanban-v2-a.mts` (idempotent) **ก่อน** ข้อสอบทุกครั้ง หรือให้ข้อสอบคืน `cardNoSeq` ตอน cleanup
ตอนนี้ผมคืนสภาพ DB ไว้ให้แล้ว (`cardNoSeq` = 24 ตรงกับ `cardNo` สูงสุด)

## 7. คำสั่งที่รัน + บรรทัดสุดท้าย
```
# 0) env (ทุกคำสั่ง DB) — QC เท่านั้น
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" \
       DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" APP_ENV=development
echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1     # ด่าน host

# 1) ไมเกรชัน
pnpm exec prisma migrate deploy   → Applying migration `20260919000000_kanban_v2_a` · All migrations have been successfully applied.
pnpm exec prisma generate         → ok

# 2) backfill (รอบแรก / รอบสอง)
pnpm exec tsx scripts/backfill-kanban-v2-a.mts
BACKFILL_SUMMARY {"boards":11,"touched":11,"visibility":11,"columns":35,"cards":39,"cardNo":39,"cardNoSeq":4}
BACKFILL_SUMMARY {"boards":11,"touched":0,"visibility":0,"columns":0,"cards":0,"cardNo":0,"cardNoSeq":0}   ← รันซ้ำไม่เปลี่ยนอะไร

# 3) ข้อสอบ
pnpm exec tsx scripts/qc-kanban-k1.1.mts
ผ่าน 28/30
FINDINGS: CRITICAL 1 · MAJOR 1 · MINOR 0
JSON_SUMMARY {"total":30,"passed":28,"findings":["K1.1-S1.6","K1.1-S3.4"]}

pnpm exec tsx scripts/qc-kanban-notify.mts   → QC Kanban Notify: 12/12 ผ่าน · ✅ เขียวหมด
pnpm exec tsx scripts/qc-ai-kanban-board.mts → ผ่าน 3/3 · JSON_SUMMARY {"total":3,"passed":3,"findings":[]}

# 4) เครื่องหมาย seed ของ qc-all (รันแบบกรองชุดเดียว ไม่ได้รัน qc:all เต็ม)
pnpm exec tsx scripts/qc-all.mts kanban-k1
🌱 4 ชุดต้องใช้ชุดข้อมูล QC บอร์ดงาน: kanban-k1.1, kanban-k1.2, kanban-k1.3, kanban-k1.4
   ↩︎ มีชุดข้อมูล QC บอร์ดงานใน DB นี้อยู่แล้ว → ข้าม seed (1.1s)

# 5) typecheck / fitness
NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck   → (ไม่มี output = 0 error)
pnpm fitness
JSON_SUMMARY {"total":20,"passed":19,"findings":[{"id":"F7.1","name":"ไม่มี ref ตายใหม่ในเอกสาร (ตรวจ 428 ref ใน 112 ไฟล์ · หนี้เดิม 9)","detail":"1 ref ตายใหม่ (ไม่อยู่ใน baseline):\n        docs/modules/13-kanban-v2.md → `kanban/limits.ts`","sev":"MAJOR"}]}
env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness
JSON_SUMMARY {"total":20,"passed":19,"findings":[{"id":"F7.1",...เหมือนกันทุกตัวอักษร...}]}
```
F1 (ทุก model ลงทะเบียน scope) ✅ — K1.1 เพิ่มแค่ enum + คอลัมน์ ไม่มี model ใหม่จึงไม่ต้องลงทะเบียนเพิ่ม
F8 (migration ครอบทุก model) ✅ · F5 (raw prisma ในโมดูล) ✅ ไม่เพิ่มไฟล์ใหม่
F7.1 ที่แดง = ไฟล์ `docs/modules/13-kanban-v2.md` ของ agent เอกสารที่เขียนขนานอยู่ (อ้าง `kanban/limits.ts` ที่ยังไม่มี) — WO นี้ไม่ได้แตะไฟล์นั้น และไม่มี ref ตายจากไฟล์ของ K1.1 เลย

## 8. กับดักที่เจอระหว่างทาง (บันทึกให้ WO ถัดไป)
- 🔴 **`pnpm exec prisma format --schema prisma/schema` ห้ามใช้ในรีโปนี้**: Prisma 7 จะจัดรูปไฟล์ schema **ทุกไฟล์** ไม่ใช่เฉพาะที่แก้ และมันเขียนคอมเมนต์เอกสารบรรทัดเดียว `/** … */` ใหม่เป็นหลายบรรทัด — เจอกรณีที่ **ซ้อนคอมเมนต์จนพัง** (`/**` โผล่ซ้อนใน `account.prisma`) ⇒ WO นี้คืนไฟล์ `account.prisma` `account_gl.prisma` `automation.prisma` กลับด้วย `git checkout --` แล้ว (ยืนยันหลังคืน: `prisma validate` ผ่าน · `migrate diff` = empty ไม่มี drift)
- Prisma 7 ถอดธง `--from-schema-datasource` ของ `migrate diff` ออก → ใช้ `--from-config-datasource` (เหมือน script `pnpm drift`)

## 9. ของค้างส่งต่อ
- K1.4: `@@unique([boardId, cardNo])` (migration B) · `moveCard(before/after)` + rebalance เมื่อ `needsRebalance` เป็นจริง · `completedAt`/`isDoneColumn`/`wipLimit` ยังเป็นแค่ช่องเปล่า
- K1.3: `visibility` ยังไม่มีใครบังคับใช้ (ยังไม่มี `boardRole()`) — บอร์ด PRIVATE ตอนนี้ยังเห็นได้เหมือนเดิม
- prod: ต้องรัน backfill ตาม §4 หลัง deploy


## ภาคผนวกโดย Fable (ตรวจรับ 05:19 น.)
- S1.6/S3.4: builder ถูก — แก้ oracle (regex `"?status"?` · แทรก 260 รอบ) + เพิ่ม cleanup คืน `cardNoSeq` · K1.4 oracle ปรับเป็น 260 รอบด้วย · 30/30
- รับข้อสังเกต: license CC0-1.0 (แก้ในบันทึก) · `prisma format` ห้ามใช้ (Prisma 7 พังคอมเมนต์) — จดเป็นกติกา run ข้อ 6 · `moveCard` เขียน position ด้วย (ถูกต้อง)
- สร้าง `src/lib/modules/kanban/limits.ts` (D4) ที่พิมพ์เขียวอ้าง → F7.1 หาย
- prod: หลัง Vercel READY ของ commit นี้ Fable รัน `ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/backfill-kanban-v2-a.mts` ด้วย `.env` (ผลอยู่ใน ledger)
