# WO S1.1 — migration `secretary_a`

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-b` branch `wip/sec-s1.1` · 2026-11-04 (UTC) · ผู้คุมงาน: Fable 5.1 · builder: Opus
> สัญญา: ใบสั่ง `ledger/secretary-briefs/sec-brief-S1.1.md` (FINAL 4 พ.ย.) + COMMON A.6/A.7 + RESOLUTIONS R-K2 R-K5 R-K9/K10 R-K11 R-K12 R-K20 §B.1 §B.4 §B.8 §E + ข้อความเสริมของผู้คุม 2 ข้อ (relation fields · คำถามชื่อโฟลเดอร์)
> ข้อสอบ: `scripts/qc-sec-s1.1.mts` (65 ข้อ · commit test 4c8709be · **builder ไม่ได้แก้** · ขอ ORACLE-EDIT 3 จุด §7)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม? |
|---|---|---|---|
| `prisma/schema/secretary.prisma` | ใหม่ | 16 โมเดล (12 tenant + 4 global) · relation AiRoom→AiConversation, AiRoomMember/AiRoomJob→AiRoom, ChatConversationHelper→ChatConversation (Cascade ทั้งหมด) | — |
| `prisma/schema/ai.prisma` | แก้ (+12 บรรทัด ไม่ลบ) | `AiConversation.room AiRoom?` (back-relation) · `AiMessage.authorUserId` · `AiMemory.status` · `AiScheduledTask.{ownerUserId,frequency,days,channels}` · `AiTrainingSample.{outcome,editedReply,stepsJson,roomId,proposalId}` | — |
| `prisma/schema/support.prisma` | แก้ (+3) | `SupportCase.{source,category,roomId}` | — |
| `prisma/schema/chat.prisma` | แก้ (+1) | `ChatConversation.helpers ChatConversationHelper[]` (ตามข้อความเสริมผู้คุม) | — |
| `prisma/migrations/20261227000000_secretary_a/migration.sql` | ใหม่ | ดู §2 | — |
| `src/lib/core/scope.ts` | แก้ (+18) | ลงทะเบียน 16 โมเดล · global = AiSecretary UserPhone PhoneOtp AiNotifyPref (มี `why`) · ที่เหลือ tenant | — |
| `ledger/qc-baseline/sec-baseline-85751098.txt` | ใหม่ | baseline 60 ชุดหลัง migration | — |
| `prisma/schema/core.prisma` | แก้ (+2 · มติผู้คุม รอบ 2) | `User.secretary AiSecretary?` · `User.userPhone UserPhone?` — back-relation ล้วน ไม่มีคอลัมน์/SQL | — |

ไม่ได้แตะ `docs/modules/31-secretary.md` (S0.3 ยังไม่ merge ในทรีนี้ — S0.3 คัดตาราง §4 จากใบ/ไฟล์ schema นี้)

## 2. migration
- ชื่อ `20261227000000_secretary_a` · ตัวเดียว · เรียงท้ายสุด (196 โฟลเดอร์)
- **วิธีสร้าง SQL:** `prisma migrate diff --from-schema <prisma/schema @4c8709be คัดลง scratchpad> --to-schema prisma/schema --script` (schema→schema ไม่แตะฐาน)
  - ไม่ได้ใช้ `--from-migrations … --shadow-database-url "$DIRECT_URL"`: Prisma 7.8 ไม่มี flag `--shadow-database-url`/`--to-schema-datamodel`/`--from-url` แล้ว และการใช้ฐาน QC เป็น shadow = Prisma ล้างฐาน QC ทิ้ง
  - ตรวจไขว้ (อ่านอย่างเดียว) `bash scripts/iso.sh bash scripts/qc-sec.sh pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema --script` หลัง deploy: ส่วนที่มาจาก S1.1 = `DROP CONSTRAINT "AiSecretary_userId_fkey"` + `"UserPhone_userId_fkey"` เท่านั้น (คาดไว้ · ดูข้างล่าง) · ที่เหลือเป็น drift เดิมของ branch QC (HR enum/FK/คอลัมน์ · `DormUtilityRate` index) ไม่เกี่ยวใบนี้ · ไม่มี drift เรื่อง list nullability
- **SQL (อ่านเองทุกบรรทัด · additive ล้วน):** ALTER TABLE ADD COLUMN 5 ตาราง (nullable ทั้งหมด ยกเว้น `days`/`channels` = `NOT NULL DEFAULT ARRAY[]`) · CREATE TABLE 16 · CREATE (UNIQUE) INDEX 28 · ADD FOREIGN KEY 6 (Cascade ทั้งหมด) · ไม่มี DROP/RENAME/ALTER TYPE/SET NOT NULL/แก้ข้อมูล
- **แก้มือ 2 กลุ่ม** (จดในหัวไฟล์ SQL):
  1. list 4 คอลัมน์ → `NOT NULL` (Prisma สร้าง scalar list เป็น nullable · แบบอย่าง `svc_r0`/`crm_v2_b`/`crm_v2_c` · ข้อสอบ T ต้องการ NOT NULL): `AiScheduledTask.days/channels` · `AiRoom.systems` · `AiSecretary.languages`
  2. FK ที่ไม่มี relation ใน Prisma: `AiSecretary.userId → User` · `UserPhone.userId → User` (User อยู่ใน core.prisma FROZEN จึงใส่ back-relation ไม่ได้) · `ChatConversationHelper.conversationId → ChatConversation` เขียนมือตอนแรก — หลังข้อความเสริมผู้คุมเป็น relation ปกติแล้ว และ `migrate diff` ให้คำสั่ง FK **ตรงตัวอักษร** กับที่เขียนไว้ ⇒ SQL ไม่เปลี่ยน (ความเห็นหัวไฟล์ SQL ยังเขียนว่า 3 FK เขียนมือ — ไม่แก้เพราะแก้ไฟล์หลัง apply = checksum เปลี่ยน; secretary.prisma อธิบายถูกต้องแล้ว)
- deploy: ผู้คุมรัน `prisma migrate deploy` จาก session/secretary (74e42223) บน wo-sec-qc 12:19Z (ตอนนั้นทรีนี้ยังไม่มี `.env.qc-sec`) · builder **ไม่ได้รัน deploy** · ตรวจแล้ว `bash scripts/iso.sh bash scripts/qc-sec.sh pnpm exec prisma migrate status` = "196 migrations found … Database schema is up to date!" · M-7 เขียว
- seed/backfill: ไม่มี

## 3. ด่าน (ที่เกี่ยวกับใบนี้)
| # | ผ่าน? | หลักฐาน |
|---|---|---|
| D1 | ✅ (ผู้คุม) | test 4c8709be |
| D2 | ☐ รอผู้คุม | builder forced ×2 + unforced = 53/65 (แดงเฉพาะข้อที่ขอ ORACLE-EDIT §7) |
| D4 | ⚠️ | baseline 59/60 exit=0 · qc-mobile-app exit=1 = ผลของ S0.2 ไม่ใช่ S1.1 (§5) |
| D5 | ✅ (มีหมายเหตุ) | fitness 53/53 ×2 · typecheck 0 error ในไฟล์ของใบ (3 error เดิมในข้อสอบผู้คุม §5) |
| D6–D8 | N-A | ไม่มี route/UI |
| D11 | ✅ | ไฟล์นี้ · residue ข้อสอบ = cleanup ใน finally ลบ tenant `qc-sec-s11-*` |

## 4. กลุ่ม X
X1 ใช้ (แกน scope · F-3) · X2–X11 N-A (ใบนี้มีแต่ schema ไม่มีโค้ดเรียก) · X3 เตรียมไว้: `AiJobCounter @@unique([tenantId, month])` + `AiRoomJob.messageId @unique` ให้ S1.5/S1.13 ใช้ `INSERT … ON CONFLICT`

## 5. ผลข้อสอบ (วางจริง)
- `qc-sec-s1.1` forced #1 (12:2xZ ก่อน baseline):
  `JSON_SUMMARY {"total":65,"passed":53,"failed":["M-4","I-5","I-6","I-7","I-9","I-10","I-12","I-13","I-18","I-19","I-20","B-1"],"skipped":[],"findings":[{"id":"M-4","sev":"MAJOR"},{"id":"I-5","sev":"CRITICAL"},{"id":"I-6","sev":"CRITICAL"},{"id":"I-7","sev":"CRITICAL"},{"id":"I-9","sev":"CRITICAL"},{"id":"I-10","sev":"CRITICAL"},{"id":"I-12","sev":"CRITICAL"},{"id":"I-13","sev":"CRITICAL"},{"id":"I-18","sev":"CRITICAL"},{"id":"I-19","sev":"CRITICAL"},{"id":"I-20","sev":"CRITICAL"},{"id":"B-1","sev":"MAJOR"}]}`
- forced #2 (หลัง baseline · HEAD 957c0d26): เหมือน #1 ทุกตัวอักษร
- unforced (HEAD 957c0d26): เหมือน #1 ทุกตัวอักษร (มี secretary.prisma แล้ว ⇒ ไม่ SKIP)
- **baseline** `ledger/qc-baseline/sec-baseline-85751098.txt` (ลูปเดียวกับ `scripts/sec-baseline.sh` แต่ `cd /root/projects/shark-sec-b` · log ใน scratchpad · 12:23Z–12:27:40Z): 60 ชุด · 59 exit=0 · **qc-mobile-app exit=1** (37/38 · `APP-6.1 ธีม light mode … act ?`)
  - เทียบ `sec-baseline-2c2062c7.txt`: ต่างกันบรรทัดเดียว = exit ของ qc-mobile-app · JSON_SUMMARY ของอีก 59 ชุดเท่าเดิม
  - วินิจฉัย: APP-6.1 อ่าน `apps/mobile/src/theme.ts` หา `bg: "#fff…"` · S0.2 (merge 5973db2e) เปลี่ยน theme.ts เป็น shim ชี้ `src/theme/*` ⇒ ไม่มี literal แล้ว · S1.1 ไม่แตะ `apps/` เลย (`git diff --stat 5973db2e HEAD -- apps/` ว่าง) · baseline 2c2062c7 รันก่อน S0.2 จึงเขียว ⇒ **ไม่ได้แดงแบบเดียวกันบน 2c2062c7 · เป็น regression ของ S0.2**
- typecheck (`ISO_MEM` เพิ่ม · ดู §7): `tsc --noEmit` 3 error ทั้งหมดอยู่ในข้อสอบของผู้คุมที่ใบนี้ไม่แตะ — `scripts/qc-sec-s0.2.mts(100,69)` + `scripts/qc-sec-ui.mts(39,67)` TS1501 (regex flag ต้อง es2018) · `scripts/qc-sec-s0.3.mts(223,28)` TS2307 `@/lib/ai/secretary/pack` (ไฟล์ของ S0.3 ยังไม่ merge) · 0 error ใน src/ prisma/
- fitness: มี env (`qc-sec.sh`) `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` · `env -u DATABASE_URL -u DIRECT_URL` `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` · pre-commit ผ่านทุก commit

## 7. ข้อแย้ง / มติทางเทคนิค
- **ORACLE-EDIT S1.1-I (I-5 I-6 I-7 I-9 I-10 I-12 I-13 I-18 I-19 I-20):** บรรทัด 264–265 เทียบ `indexdef` กับชื่อคอลัมน์ที่ใส่ `"` ทุกตัว แต่ Postgres ใส่ `"` เฉพาะชื่อที่ต้องใส่ (ตัวใหญ่/คำสงวน) — ของจริง `(status, "leaseUntil")` · `("tenantId", module)` · `(phone)` · index ทุกตัวมีและลำดับคอลัมน์ถูก (ดูข้อความ "มี:" ใน log) · เสนอ: `r.indexdef.replace(/\s+/g, " ").replace(/"/g, "").endsWith(want.replace(/"/g, ""))`
- **ORACLE-EDIT S1.1-M4:** `OWNED_SCHEMA` (บรรทัด 127) เพิ่ม `"chat.prisma"` (ข้อความเสริมผู้คุม: back-relation `helpers` 1 บรรทัด) · และควรเพิ่ม `prisma/schema/chat.prisma` ในรายการ numstat ของ M-5 (บรรทัด 162) ให้ตรวจว่าเพิ่มอย่างเดียว
- **ORACLE-EDIT S1.1-B1:** ตัวกรอง cand (บรรทัด 321) เทียบเวลา `== migrate status <นาฬิกาจริง>` (20261104…) ≥ timestamp ชื่อโฟลเดอร์ (20261227000000) ⇒ เป็นไปไม่ได้เมื่อโฟลเดอร์ลงวันอนาคต · เสนอเทียบกับ `_prisma_migrations.finished_at` ของ migName (12:19Z) แทน · B-2 อยู่ใน else จึงยังไม่ถูกรัน (ถ้ารันจะผ่าน: ไฟล์มี "196 migrations found" + "Database schema is up to date!") · แม้แก้แล้ว B-1 ยังแดงจาก qc-mobile-app (S0.2) — ต้องมีมติผู้คุม (แก้ APP-6.1 ให้อ่าน `theme/light.ts` หรือยกเว้น)
- **ชื่อโฟลเดอร์ (ตอบคำถามผู้คุม — ไม่เปลี่ยนชื่อ):** โฟลเดอร์ที่มีอยู่แล้วลงวันอนาคต `20261225000000_svc_b13` · `20261226000000_svc_b17` ⇒ ชื่อ `20261104HHMMSS_secretary_a` จะเรียง **ก่อน** สองตัวนี้ = M-1 (CRITICAL "ตัวท้ายสุด") แดง + ขัดใบ ("must sort last") · ความเสี่ยงที่ผู้คุมห่วง (migration ใหม่วันที่จริงเรียงก่อน) มีอยู่แล้วตั้งแต่ svc_b13/b17 — กติกา: migration ถัดไปของ RUN นี้ต้องตั้งชื่อ > `20261227000000` · ถ้าผู้คุมยังต้องการเปลี่ยน: ต้องแก้ M-1 ด้วย แล้ว `UPDATE "_prisma_migrations" SET migration_name=…` ตามข้อความ
- **FK ไป User เขียนมือ (หนี้ drift):** core.prisma FROZEN ⇒ ไม่มี back-relation ⇒ `pnpm drift` (CI `.github/workflows/ci.yml:129`) จะรายงาน `DROP CONSTRAINT AiSecretary_userId_fkey/UserPhone_userId_fkey` บนฐาน CI · ทางเลือก: (ก) ยอมรับและให้ CI drift ยกเว้น 2 ชื่อนี้ (ข) ยกเว้น FROZEN 2 บรรทัด `secretary AiSecretary?` + `phone UserPhone?` ใน `model User` (ขัด §B.8 + M-6) · ต้องการมติผู้คุม · migration ถัดไปที่สร้างจาก diff ต้องตัด 2 คำสั่งนี้ทิ้ง
- **`tenantId` บน AiRoomMember/AiRoomJob (เพิ่มจากรายการคอลัมน์ในใบ):** ใบให้แกน tenant (§B.1) + กติกาใบ "tenantId on tenant-scoped rows" · ทะเบียนเดิมไม่มีโมเดลแกน tenant/unit/system ตัวไหนเลยที่ไม่มี `tenantId` (นับแล้ว 0) และ `tenantDb` ฉีด `tenantId` ทุก query ⇒ ไม่มีคอลัมน์ = query ผ่าน tenantDb พัง · S1.4/S1.5 ต้องใส่ tenantId ตอน insert (= `AiRoom.tenantId`)
- **ไม่มี createdAt บน AiRoomMember** (`addedAt` ทำหน้าที่แทน · ตรงสเปกข้อสอบ) · ไม่มี updatedAt บน AiActionLog/StaffInvite/ChatShift/UserPhone/ChatConversationHelper/PhoneOtp (ตรงสเปกข้อสอบ)
- **`prisma format`:** ไม่ได้รันบนทรี — ลองบนสำเนาแล้วมันจัดรูปไฟล์อื่น (account.prisma ฯลฯ) · ไฟล์ของใบ (secretary/ai/support) เป็นรูปแบบ canonical แล้ว (format ไม่เปลี่ยน) · chat.prisma format ต่างแค่บรรทัดว่างเดิมที่ 541 (มีก่อนใบ)
- **Prisma client (node_modules ร่วม):** node_modules ของทรีนี้ = bind mount ของ `/root/projects/shark-svc/node_modules` (ใช้ร่วมกับ shark-sec · shark-sec-c · shark-svc) · `prisma generate` 2 ครั้ง (12:03Z โมเดลใหม่ · 12:14Z เพิ่ม relation) · ⚠️ `db.ts` เรียก `assertRegistryComplete` ตอน import และตรวจ **ทั้งสองทาง** ⇒ ทรีที่ scope.ts ยังไม่มี 16 โมเดลจะโยน "16 model ยังไม่ได้ลงทะเบียน" (ไม่ใช่แค่ typecheck) · ผู้คุม pre-merge 74e42223 แล้ว · shark-svc (มี `next start` :3241 รันอยู่) ยังจะโยนเมื่อ import ใหม่/รีสตาร์ต
- **typecheck heap:** `NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M` ครั้งแรก OOM (exit 134 · client ใหญ่ขึ้น 16 โมเดล) · ครั้งที่ 2 ใช้ `8192`/`ISO_MEM=9500M` สำเร็จ (ครบโควตา 2 ครั้ง) ⇒ ใบถัดไปควรใช้ heap 8192
- ทางเรียกโมเดลเพิ่ม: ไม่มี · ใครได้/เสียสิทธิ์: ไม่มี (ไม่มีโค้ดใช้ตารางใหม่)

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ~~drift 2 FK ไป User~~ | ปิดแล้วรอบ 2 (back-relation ใน core.prisma) | S1.1 |
| `AiNotifyPref @@unique([userId, tenantId, kind])` — tenantId null ซ้ำได้ (Postgres NULL distinct) | Prisma ไม่รองรับ NULLS NOT DISTINCT | S1.23 upsert ด้วย findFirst/ทรานแซกชัน หรือ sentinel |
| ~~qc-mobile-app APP-6.1~~ | ปิดแล้ว (ORACLE-EDIT 405cd2e9 · re-run 38/38) | S1.1 |
| `docs/modules/31-secretary.md` §4 | S0.3 ยังไม่ merge | S0.3 คัดจากใบ |
| typecheck 5 error ในข้อสอบผู้คุม (s0.3 ×1 · s1.2 ×4 — โมดูลของใบที่ยังไม่ทำ + s1.2:112 ส่ง `Record<string, unknown>` เข้า Json ต้อง cast) | ไม่ใช่ไฟล์ของใบ | ผู้คุม / S0.3 / S1.2 |

## 9. คืนสภาพฐาน QC
ข้อสอบ `finally` ลบ tenant/AiConversation/AiRoom(+Cascade) ของตัวเอง + `qc-sec-s11-*` เก่ากว่า 1 ชม. · builder ไม่ได้เขียนฐานนอกจากข้อสอบ/baseline · ไม่ได้รัน deploy/UPDATE `_prisma_migrations`

## ทำต่อ (ถ้ารีสตาร์ต)
หลังผู้คุมแก้ข้อสอบ: `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s1.1.mts` (คาด 65/65 ถ้ามีมติเรื่อง qc-mobile-app ด้วย)

## 10. รอบ 2 — หลังมติผู้คุม (4 พ.ย. ~12:4xZ)
- มติ: ORACLE-EDIT ทั้ง 3 รับ (405cd2e9 · I-* ตัด `"` · M-4/M-5 รวม chat/core · M-6 ยอม back-relation 2 บรรทัด · B-1 เทียบ `finished_at`) · ชื่อโฟลเดอร์ 20261227000000 รับ · `tenantId` บน AiRoomMember/AiRoomJob รับ · drift ⇒ เพิ่ม back-relation ใน core.prisma
- `git merge session/secretary` → 285f054a (ไม่มี conflict)
- core.prisma +2 บรรทัด (ไม่จัดแนวบรรทัดเดิม · `prisma format` บนสำเนาไม่เปลี่ยนไฟล์) · secretary.prisma `AiSecretary.user` / `UserPhone.user` `@relation(fields: [userId], references: [id], onDelete: Cascade)` · หัวไฟล์ไม่มี FK เขียนมือแล้ว (ความเห็นหัว migration.sql ยังพูดถึง FK เขียนมือ — ไม่แก้ เพราะ checksum)
- `migrate diff --from-schema <base> --to-schema prisma/schema` = ชุดคำสั่งเดียวกับ migration.sql ทุกตัว (ต่างแค่ลำดับ/บรรทัดว่าง + 4 NOT NULL ที่แก้มือ) ⇒ migration ไม่เปลี่ยน
- drift (อ่านอย่างเดียว `qc-sec.sh … migrate diff --from-config-datasource --to-schema prisma/schema --script`): **ไม่มีคำสั่งของตาราง/คอลัมน์ S1.1 เลย · ไม่มี DROP CONSTRAINT ของ AiSecretary/UserPhone แล้ว** · ที่เหลือ = drift เดิมของ branch QC ล้วน HR (DropTable 13 · DropEnum 16 · DropForeignKey 15 · AlterTable 7 · AlterEnum 1 · RenameIndex 1 — ทุกตัว `"Hr…`) + DropIndex 6 (HR 5 + `DormUtilityRate_unitId_buildingId_kind_periodKey_key`)
- `prisma generate` (12:4xZ · node_modules ร่วม shark-svc) · fitness มี env `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` · ไร้ env `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}`
- typecheck (`NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=9500M`): 0 error ใน src/ prisma/ · 5 error ในข้อสอบผู้คุม (§8)
- qc-mobile-app re-run 12:50:59Z: 38/38 exit=0 → แทนบล็อกใน `sec-baseline-85751098.txt` (บรรทัด `# re-run` นำ) · ไฟล์ = 60 ชุด exit=0 ทั้งหมด · `== done` คงเดิม
- oracle forced #1: `JSON_SUMMARY {"total":66,"passed":66,"failed":[],"skipped":[],"findings":[]}`
- oracle forced #2: `JSON_SUMMARY {"total":66,"passed":66,"failed":[],"skipped":[],"findings":[]}`
- commits: 6c0267cc (core back-relations) · fa4e2627 (baseline re-run) · wo-notes (commit นี้)
