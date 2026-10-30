# ใบสั่ง D.4 — นำเข้า Excel (ห้อง · ผู้เช่า · สัญญา · ประกันยกมา · เลขมิเตอร์ล่าสุด) · ตรวจ **เข้ม** (เงิน: ประกันยกมา · กฎหมาย สคบ. · ข้อมูลข้ามร้าน · X6)

> แหล่งความจริง: `ledger/SVC-MASTER-PLAN.md` แถว D.4 (+ กราฟ `D.5 ─► D.4` · D.15 รอ D.4) · `ledger/DESIGN-DORM-HOTEL.md` §1 ข้อ 12 "AI เสนอ คนยืนยัน" · ภาพ `ledger/design-dorm/12-import-excel.png` (+ `.body.html` · README "นำเข้า (จอ 12): 32 ผู้เช่า · ประกันเปิดยอด ฿296,400 · ค้างยกมา ฿10,200.40") · CC §1 (ค่าตั้ง · ตัวตรวจกฎหมาย §1.7) §8 (`dorm.import`) · SVC-RUN §1.5 X1 X3 X6 X9 · ใบสั่ง D.5 §2–§3.11 (`createLease` `moveIn` · K1 tx เดียว · K3 จับคู่ผู้เช่า) · ใบสั่ง D.6 (`createMeter` `submitReadings` — "ทางเดียวที่เขียนแถว PERIOD · D.4 นำเข้า") · ใบสั่ง D.1 (`evaluateLegal` 3 โหมด) · บทเรียนเงิน `/root/svc-runs/fix/d2.md` (F7 ห้ามกลับ JV หอทางทั่วไป · N2 คิวเงินระดับร้าน) `d5.md` (K1 · หนี้ "D.4 ต้องเรียก moveIn ทีละรายการ") `d8.md` (CAS ก่อนออกเอกสาร · stale ต่อรายการ) `d3.md` `d11.md` (ล็อกครอบตรวจ→เขียน)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.4.mts» — รับใบ = **ผ่านทุกข้อ** · SKIP ที่ยอมได้ระหว่างทำ = V-1 (ไม่มี QC_BASE) · Q-* (ร้าน svcqc ยังไม่ seed) · G-* เมื่อต่อท้าย `--no-regression` — ผู้คุมรันครบก่อนรับ · positive control PC-* + Z-1 ต้องคงเขียว
> รัน: `cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.4.mts [--no-regression] > /tmp/svc-d4-<ชื่อ>.log 2>&1` (ห้ามครอบ timeout · ห้าม kill กลางคัน — ล้างอยู่ใน finally · ข้อพร้อมกันยิงจาก **4 โพรเซสลูก × 3** ผ่าน `--child` + 30 ทางในโพรเซสเดียว)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` (ไม่มีไลบรารี xlsx ในโปรเจกต์ — ดู §2.2) · ห้ามแตะ `.env*`** · temp ขึ้นต้น `svc-d4-` · รายงานต่อข้อ (id → ผล) · ⚠️ **migration รอมติผู้คุม RULING-1 (§13)** — ก่อนมีมติห้ามแตะ `prisma/schema`

---

## 1. ไฟล์ของใบ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| «src/lib/modules/dorm/import-parse.ts» | ใหม่ · **pure** (import ได้แค่ `node:zlib` `node:crypto` + `import type`) | อ่านไฟล์ CSV/TSV/XLSX · ถอดรหัสอักขระ · ทำเซลล์อันตรายให้เป็นกลาง · แปลงวันที่/เงิน/เบอร์ · เดาคอลัมน์จากหัวคอลัมน์ · ตัวสร้าง CSV แม่แบบ/รายงานปัญหา §4 |
| «src/lib/modules/dorm/import.ts» | ใหม่ | service นำเข้า §3 §5 §6 — `tenantDb({tenantId, unitId})` + `$transaction` ของมัน (ห้าม `import { prisma }` ดิบ · F5) · เรียก D.5/D.6 ผ่านไฟล์ในโมดูลเดียวกัน |
| «src/lib/modules/dorm/import-ai.ts» | ใหม่ | ตัวต่อ AI เดาคอลัมน์ (`ImportColumnGuesser`) บน `resolveProvider("fast")` ของ `src/lib/ai/provider.ts` + เครดิต AI เดิม (`canSpend`/`chargeUsageSafe`) · ไม่มี provider/เครดิต ⇒ `null` |
| «src/lib/modules/dorm/index.ts» | แก้ (ต่อท้ายบล็อก `// SVC D.4`) | export ชื่อ §3 §4 + type — ห้ามแตะบรรทัดของใบอื่น |
| «src/lib/modules/dorm/lease.ts» | แก้ **additive** | อาร์กิวเมนต์ที่ 3 ภายในโมดูล `internal?: LeaseImportMark` ของ `createLease` / `moveIn` §5.3 — ไม่ส่ง = พฤติกรรมเดิมทุกไบต์ (G-1 `qc-svc-d.5` ต้องเขียว) |
| «src/lib/modules/dorm/meter.ts» | แก้ **additive** | `SubmitDeps.source?: "MANUAL" \| "IMPORT"` (ไม่ส่ง = `MANUAL` เดิม) · `createMeter` รับ `note` เดิม (ใช้เป็นเครื่องหมายนำเข้า) — G-2 `qc-svc-d.6` ต้องเขียว |
| `src/lib/modules/account/index.ts` + `src/lib/modules/account/service.ts` (บล็อก `// SVC D.4`) | แก้ **additive** (RULING-2) | `reverseSecurityDepositReceiptInTx` / `reverseSecurityDepositReceipt` §3.8 — ฟังก์ชันเดิมของ D.2/D.5 พฤติกรรมเดิมทุกไบต์ |
| `src/lib/core/settings/defs/rooms.ts` | แก้ (ต่อท้ายบล็อก `// SVC D.4`) | 3 คีย์ §2.3 (group `import`) — ห้ามแตะคีย์เดิม |
| `src/lib/core/permissions.ts` | แก้ 1 จุด | เอา `"dorm.import"` ออกจาก `planned` ของโมดูล dorm (คีย์มีแล้วจาก D.13) |
| «src/components/dorm/ImportScreen.tsx» | ใหม่ · `'use client'` | จอ หอ 12 §8 (render ได้ด้วย `renderToStaticMarkup` · action รับทาง prop · ไม่ import prisma/โมดูล server/actions/`next/navigation\|headers`) |
| «src/components/dorm/import-shared.ts» | ใหม่ · pure ไม่มี directive | ป้ายไทยของฟิลด์/โค้ดปัญหา/ขั้น ที่จอใช้ร่วม (ห้าม import server) |
| «src/app/app/u/[unitSlug]/dorm/tenants/import/page.tsx» | ใหม่ (server) | หน้า §8.1 |
| «src/app/app/u/[unitSlug]/dorm/tenants/import/actions.ts» | ใหม่ `"use server"` | §8.2 |
| «src/app/app/u/[unitSlug]/dorm/tenants/import/template/route.ts» | ใหม่ (GET) | ดาวน์โหลดแม่แบบ CSV §8.3 |
| «scripts/svc-qc-import-scene.mts» | ใหม่ | ฉากภาพ §8.5 |
| «prisma/schema/dorm.prisma» + migration `svc_d4` | **เฉพาะเมื่อ RULING-1 = ก** | ตาราง §2.1 |

ห้าม: แตะ `rooms/*` `party/*` `approval/*` `account/gl.ts` (ใช้ `reverseFor`/`reverseEntry` ผ่าน service ได้ — ไม่แก้ gl) · `TenantsScreen.tsx`/`tenants/page.tsx` ของ D.5 (ลิงก์ "นำเข้าจาก Excel" = แก้ได้ **1 บรรทัด** ใน TenantsScreen ถ้าจำเป็น) · `any` · `getDay()/getDate()/getMonth()` ดิบ (ใช้ `bkkYmd`/สตริง `YYYY-MM-DD`) · เส้นเงินใหม่ (ห้าม `createExternalInvoice`/`recordExternalPayment`/`postSecurityDeposit` ตรงจาก import.ts — เงินผ่าน `moveIn` ของ D.5 เท่านั้น · กลับรายการผ่าน §3.8 เท่านั้น) · `Promise.all` รอบฟังก์ชันเงิน/สัญญา (หนี้ D.2 N2 — ทีละรายการ) · ลบแถวบัญชี (JV/เอกสาร) ไม่ว่ากรณีใด

---

## 2. ศัพท์ · กติกา

### 2.1 ชุดนำเข้า (batch) — ที่เก็บ (RULING-1)
- **ทาง ก (แนะนำ · ต้องมีมติผู้คุมเพราะผิดกติกา §1.1 ข้อ 5):** migration additive `svc_d4` ตารางเดียว (อ่าน SQL ทุกบรรทัด · ไม่มี DROP)
  ```
  DormImportBatch  id · tenantId · unitId · fileHash String (sha256 hex ของไบต์ไฟล์) · fileName String · format String ("CSV"|"XLSX") · sheet String?
                   · fileId String? (FileAsset private ของไฟล์ต้นทาง) · rowCount Int · columnCount Int
                   · status String @default("DRAFT")  -- DRAFT | CREATING | CREATED | UNDOING | UNDONE
                   · version Int @default(0)            -- CAS ทุกการเปลี่ยนสถานะ/ข้อมูล
                   · proposal Json? (ผลเดาคอลัมน์ + source) · mapping Json? · mappingConfirmedById String? · options Json? · decisions Json?
                   · previewHash String? · summary Json? · manifest Json? (สิ่งที่สร้างต่อแถว §5.4) · lastError Json?
                   · claimToken String? · claimUntil DateTime?   -- เจ้าของงานสร้าง/ย้อนที่กำลังทำ (heartbeat)
                   · createdById · committedAt DateTime? · undoneAt DateTime? · undoneById String? · undoReason String? · createdAt · updatedAt
  @@unique([unitId, fileHash]) · @@index([tenantId, unitId, status])
  SQL มือ: CHECK status IN (...) · CHECK format IN ('CSV','XLSX') · CHECK rowCount >= 0
           UNIQUE "DormImportBatch_unit_active_key" ON ("unitId") WHERE "status" IN ('CREATING','UNDOING')   -- 1 งานสร้าง/ย้อนต่อหน่วย
  ```
- **ทาง ข (ไม่มี migration):** สถานะชุดเก็บเป็น AuditLog ต่อท้าย + manifest ใน `DormLease.policySnapshot.import` / `DormMeter.note` · ล็อกด้วย advisory ต่อหน่วยทุก tx — ซับซ้อนกว่าและ CAS อ่อนกว่า (ผู้ตรวจ B จะยิงหนัก) · **ข้อสอบเขียนแบบไม่ขึ้นกับที่เก็บ** (ตรวจผ่าน facade + ตารางธุรกิจ · ล้างทุกตารางที่มี `tenantId`) ⇒ ผ่านได้ทั้งสองทาง
- `batchId` = id ของชุด (ทาง ข: `imp_` + 24 ตัวแรกของ sha256(tenantId|unitId|fileHash)) · **ไฟล์เดิม (ไบต์เดียวกัน) บนหน่วยเดิม = ชุดเดิมเสมอ**

### 2.2 รูปแบบไฟล์ (มติผู้เขียนข้อสอบ — ไม่มีไลบรารี xlsx ใน `package.json` · ห้ามติดตั้ง)
- **CSV/TSV** (ตัวแยกกลาง `src/lib/core/csv.ts` `parseCsv` ใช้ได้ · ตัวคั่น `,`/tab อัตโนมัติ) · ถอดรหัส: BOM UTF-8 ⇒ utf-8 · BOM UTF-16LE (`FF FE` — Excel "Unicode Text") ⇒ utf-16le · ไบต์เป็น UTF-8 ถูกต้อง ⇒ utf-8 · อื่น ⇒ **windows-874** (`new TextDecoder("windows-874")` — Excel ไทยบันทึก "CSV" ธรรมดาเป็น TIS-620)
- **XLSX** = ตัวอ่านเล็กเขียนเองบน `node:zlib` (`inflateRawSync(buf, { maxOutputLength })`) ไม่มี dependency: อ่าน central directory (ไม่รองรับ zip64/เข้ารหัส/แยกไฟล์ ⇒ `UNSUPPORTED_FORMAT`) · method 0 (store) และ 8 (deflate) · `xl/workbook.xml` (ชื่อชีต) + `xl/_rels/workbook.xml.rels` + `xl/sharedStrings.xml` + `xl/worksheets/sheetN.xml` · เซลล์ `t="s"` `t="inlineStr"` `t="str"` `t="b"` ตัวเลข · **สูตรไม่คำนวณ** — ใช้ค่าแคช `<v>` (ไม่มี ⇒ ว่าง) · ตำแหน่งเซลล์จาก `r="C7"` (ช่องว่างกลางแถวเติม "") · แถวแรกที่ไม่ว่าง = หัวคอลัมน์ · ถอด XML entity 5 ตัว + `&#n;` `&#xh;` (ไม่ขยาย entity อื่น · ไม่อ่าน DTD)
- **กันไฟล์ระเบิด**: ผลรวมไบต์หลังคลายทุกไฟล์ใน zip ≤ `min(40 MB, maxFileBytes × 20)` · ไฟล์ใน zip ≤ 500 รายการ · เกิน ⇒ `UNSAFE_FILE` (ไม่ throw · ไม่จองหน่วยความจำเกินเพดาน — ใช้ `maxOutputLength`)
- `.xls` (BIFF) · `.ods` · PDF · รูป ⇒ `UNSUPPORTED_FORMAT` (ข้อความบอก "บันทึกเป็น .xlsx หรือ CSV UTF-8") · ตัดสินจากไบต์ ไม่เชื่อนามสกุล/contentType: zip `PK\x03\x04` ที่มี `xl/workbook.xml` = XLSX (zip อื่น เช่น .docx/.ods ⇒ UNSUPPORTED) · OLE2 `D0 CF 11 E0` (.xls) ⇒ UNSUPPORTED · ขึ้นต้น `%PDF-` ⇒ UNSUPPORTED · มีไบต์ NUL (ที่ไม่ใช่ UTF-16 มี BOM) ⇒ UNSUPPORTED · อื่น = ข้อความ CSV/TSV · ไม่มีข้อมูล/มีแต่ BOM+บรรทัดว่าง ⇒ `EMPTY_FILE`
- เลือกชีต: `sheet` (ชื่อ) · ไม่ส่ง = ชีตแรก · ผลอัปโหลดคืนทุกชีต `{ name, rowCount }` (ภาพ 12: ชีต "ผู้เช่า" 36 แถว 11 คอลัมน์ · ชีต "มิเตอร์" 36 แถว) · ไม่รวมข้ามชีต (หนี้)

### 2.3 เพดาน X6 (ค่าตั้งในทะเบียน · defs/rooms.ts group `import` · chain `["UNIT"]` · editPermission เดิม `dorm.settings.edit`)
| คีย์ | ชนิด | ค่าเริ่ม `_fallback` | schema | หมายเหตุ |
|---|---|---|---|---|
| `rooms.import.maxRows` | int | 1000 | int 10–5000 | แถวข้อมูล (ไม่นับหัว) · เกิน ⇒ `TOO_MANY_ROWS` |
| `rooms.import.maxFileBytes` | int | 2_000_000 | int 10_000–10_000_000 | ขนาดไฟล์ดิบ · เกิน ⇒ `FILE_TOO_LARGE` |
| `rooms.import.undoDays` | days | 0 | int 0–7 · `ownerOnly` · `sensitivity: "MONEY"` | 0 = ย้อนได้ถึง 23:59:59 ไทยของวันที่สร้าง · N = ถึงสิ้นวันที่ (วันสร้าง + N) — RULING-3 |
- เพดานแข็งในโค้ด (ไม่ใช่ค่าตั้ง): คอลัมน์ ≤ 60 (`TOO_MANY_COLUMNS`) · เซลล์ ≤ 1,000 ตัวอักษร (เกิน ⇒ ปัญหา `CELL_TOO_LONG` ต้องแก้) · ชื่อผู้เช่า ≤ 200 · หมายเหตุ ≤ 500 · ไฟล์ว่าง/มีแต่หัว ⇒ `EMPTY_FILE`
- อ่านค่าตั้ง **สดทุกคำขอ** (`resolveSetting` refs `{unitId}`) — ไม่แคช

### 2.4 เซลล์อันตราย (CSV/formula injection — X6)
- `neutralizeCell(v)` (pure · §4): ถ้าค่าดิบขึ้นต้นด้วย `=` `+` `-` `@` `\t` `\r` `\n` หรือ ตัวเต็มความกว้าง `＝ ＋ － ＠` **หรือ** หลังตัดช่องว่าง/tab/CR/LF หัวแล้วขึ้นต้นด้วย `= + - @ ＝ ＋ － ＠` ⇒ คืน `'` + ค่าที่ตัดช่องว่างหัวท้ายแล้ว · อื่น ⇒ ค่าเดิม (ไม่แตะตัวเลขล้วนในฟิลด์ตัวเลข — ฟิลด์ตัวเลขแปลงเป็นตัวเลขก่อน ไม่ผ่านตัวนี้)
- **ขาเข้า**: ฟิลด์ข้อความ (`tenantName` `note` `building` `roomType`) ผ่าน `neutralizeCell` ก่อนเก็บ/สร้าง + ปัญหา `TEXT_NEUTRALIZED` (WARN · ให้คนเห็นและแก้ในไฟล์) · ฟิลด์ตัวเลข/วันที่/เบอร์ ที่ขึ้นต้นด้วยสูตร (`=1+1` `+66…` ยกเว้นเบอร์ `+66` ที่ถอดได้จริง) ⇒ แปลงไม่ได้ = ปัญหาชนิดฟิลด์ (`MONEY_INVALID` ฯลฯ) — **ไม่ประเมินสูตรเด็ดขาด** · เลขห้องขึ้นต้นด้วยสูตร ⇒ `ROOM_INVALID`
- **ขาออก/สะท้อนกลับ** ทุกทาง: `samples` ของผลอัปโหลด · `issues[].value` · `importIssuesCsv` · `importTemplateCsv` · DOM — ไม่มีสตริงใดขึ้นต้นด้วย `= + - @ \t \r` (CSV ใช้ `csvRow` ของ `src/lib/core/csv.ts` ทับบน `neutralizeCell`)
- `samples` ปิดข้อมูลส่วนตัว: เบอร์ ⇒ `081-xxx-4410` (เก็บ 3 ตัวหน้า + 4 ตัวท้าย) · เลขบัตร 13 หลัก ⇒ `x-xxxx-xxxxx-xx-3` (เหลือหลักท้าย) — ทุกเซลล์ที่ "หน้าตาเป็น" เบอร์/เลขบัตร ไม่ว่าจับคู่คอลัมน์อะไร

### 2.5 ฟิลด์ (FieldKey) · การแปลง
| field | บังคับ | แปลง | ปัญหา |
|---|---|---|---|
| `room` | ✅ ทุกแถว | ตัดช่องว่าง · `^[A-Za-z0-9ก-ฮ/-]{1,12}$` | `ROOM_INVALID` · ซ้ำในไฟล์ `ROOM_DUP_IN_FILE` (ต้องแก้ ทั้งสองแถว) |
| `building` | | ข้อความ ≤ 60 | ไม่มีคอลัมน์ ⇒ หน่วยมีอาคารเดียว = ใช้อาคารนั้น · ไม่มีอาคาร = สร้าง "อาคาร 1" · มีหลายอาคาร ⇒ `BUILDING_REQUIRED` (ต้องแก้) |
| `floor` | | จำนวนเต็ม 1–200 | ไม่มีคอลัมน์ ⇒ **ชั้นคิดจากเลขห้อง**: เลขล้วน 3 หลัก = หลักแรก · 4 หลัก = 2 หลักแรก · อื่น = 1 |
| `roomType` | | ข้อความ ≤ 60 | ไม่มีคอลัมน์ ⇒ ประเภทต่อค่าเช่าที่ต่างกัน ชื่อ `ห้อง ฿4,500/เดือน` (`monthlyRateSatang` = ค่าเช่า · `rentMode "MONTHLY"`) · ห้องไม่มีค่าเช่า ⇒ ประเภทของค่าเช่าที่พบบ่อยสุดในไฟล์ (INFO `ROOM_TYPE_ASSUMED`) |
| `tenantName` | ถ้ามีผู้เช่า | ข้อความ ≤ 200 · ยุบช่องว่าง · `neutralizeCell` | ไม่มีชื่อ + มีค่าเช่า ⇒ WARN `VACANT_WITH_RENT` (ห้องว่าง ไม่สร้างสัญญา) · ไม่มีชื่อ + ไม่มีค่าเช่า ⇒ ห้องว่างเงียบ (INFO `ROOM_ONLY`) |
| `phone` | ต้องมี phone **หรือ** idCard เมื่อมีชื่อ | `normalizePartyPhone` (+66 = 0 · ตัดขีด/ช่องว่าง) · ไทย 9–10 หลัก | `PHONE_INVALID` · ไม่มีทั้งคู่ ⇒ `TENANT_CONTACT_REQUIRED` (ต้องแก้) · ซ้ำในไฟล์ ⇒ WARN `PHONE_DUP_IN_FILE` ที่แถวหลัง (ตัดสิน MERGE/SEPARATE · ค่าเริ่ม MERGE เมื่อชื่อตรง · ชื่อไม่ตรง ⇒ ต้องแก้จนตัดสิน) |
| `idCard` | | 13 หลัก + เลขตรวจของ D.5 | `IDCARD_INVALID` (ต้องแก้) |
| `startDate` | ถ้ามีผู้เช่า | `options.dateFormat`: `BE_DMY` (ค่าเริ่ม · `1/5/69` `01/05/2569` ⇒ พ.ศ. · ปี 2 หลัก = 25xx) · `CE_DMY` · `ISO` · ตัวเลข 20000–80000 = Excel serial (ระบบ 1900) | `DATE_INVALID` · อนาคต ⇒ `START_IN_FUTURE` (ต้องแก้ · ผู้ยังไม่เข้าอยู่ทำในหน้าผู้เช่า) |
| `months` | | จำนวนเต็ม 1–360 · ไม่มีคอลัมน์ = `rooms.lease.defaultMonths` | สิ้นสุด < วันนี้ ⇒ WARN `LEASE_ENDED_IN_FILE` + ต่อรอบละ `defaultMonths` จนครอบวันนี้ (J3) |
| `rent` | ถ้ามีผู้เช่า | เงิน: `4500` `4,500` `฿4,500.50` `4500.00 บาท` ⇒ สตางค์ · ติดลบ/ทศนิยม > 2 ตำแหน่ง/สูตร ⇒ ผิด | `MONEY_INVALID` · ไม่มีค่าเช่า (และประเภทไม่มีราคา) ⇒ `RENT_REQUIRED` |
| `deposit` | | เงิน · ว่าง = 0 (ไม่ใช่ค่าตั้ง — ยอดจริงที่ถือไว้) | `MONEY_INVALID` · กฎหมาย §2.7 |
| `advanceRent` | | เงิน · ว่าง = 0 · **ไม่ลงเงิน** (เหมือน D.5) | รวมในตัวกั้น §2.7 |
| `elecReading` `waterReading` | | จำนวนเต็ม 0–2,147,483,647 | `METER_INVALID` (ต้องแก้) · > 3 × มัธยฐานของคอลัมน์ (มัธยฐาน > 0) ⇒ WARN `METER_OUTLIER` (ใช้เป็นเลขเริ่มตามไฟล์) |
| `arrears` | | เงิน | INFO `ARREARS_NOT_IMPORTED` — **ไม่สร้างใบแจ้งหนี้** (RULING-4) · แสดงในแผน "ยอดค้างยกมา (จดไว้ ยังไม่ออกใบ)" |
| `note` | | ข้อความ ≤ 500 · `neutralizeCell` | ⇒ `HotelRoom.note` ของห้องที่ **สร้างใหม่** เท่านั้น (ห้องเดิมไม่ทับ) |
| `IGNORE` | | — | เช่น LINE (ผูกด้วยรหัสผูกห้อง D.9) |
- แมปปิ้ง = `Record<คอลัมน์ index (0-based) เป็นสตริง, FieldKey | "IGNORE">` · แต่ละ FieldKey ≤ 1 คอลัมน์ · ต้องมี `room` ⇒ ไม่งั้น `INVALID_MAPPING` · คอลัมน์ที่ไม่อยู่ในแมป = ไม่นำเข้า
- เลขแถว `rowNo` = เลขแถวในชีต (หัว = 1 · แถวข้อมูลแรก = 2)

### 2.6 คีย์ธรรมชาติ (นำเข้าซ้ำ = ไม่ซ้ำ · X4)
- **ไฟล์เดิม** ⇒ ชุดเดิม (§2.1) · ชุด CREATED ⇒ `createImport` คืน `duplicate: true` ไม่มีแถวใหม่
- **ไฟล์อื่นข้อมูลซ้ำ** (บันทึกใหม่/CSV↔XLSX/สลับคอลัมน์): ต่อแถว — ห้อง: (หน่วย, เลขห้อง) มีอยู่ (active) ⇒ ใช้ห้องเดิม · ห้อง inactive ที่สร้างโดยชุดที่ UNDONE ⇒ ปลุกกลับ (active=true) · สัญญา: ห้องมีสัญญา DRAFT/ACTIVE/NOTICE ของผู้เช่าคนเดียวกัน (Party ที่จับคู่ได้ตาม D.5 K3) ⇒ `SKIP_EXISTS` (INFO · ไม่สร้างอะไรต่อในแถวนั้น ยกเว้นมิเตอร์/เลขที่ยังไม่มี) · ห้องมีสัญญาของคนอื่น ⇒ `ROOM_OCCUPIED` (ต้องแก้) · มิเตอร์: (ห้อง, ชนิด) active มีแล้ว ⇒ ใช้ตัวเดิม · เลข PERIOD (มิเตอร์, งวด) มีแล้วค่าเท่ากัน ⇒ ไม่เขียน · ค่าต่าง ⇒ WARN `METER_CONFLICT` (คงค่าในระบบ ไม่ทับ) · ผู้เช่า: จับคู่ตาม D.5 K3 (ชื่อไม่ตรงกับ Party ที่เบอร์/บัตรชน ⇒ ต้องแก้ `TENANT_MATCH_CONFIRM` จนตัดสิน `confirmPartyId`/`createNewParty`) · เงินประกัน: คีย์ของ D.5 `dorm.lease:<leaseId>:deposit` (ต่อสัญญา ⇒ ไม่มีทางลงซ้ำ)

### 2.7 กฎหมาย (ตัวตรวจ D.1 · โหมดของหน่วยอ่านสด)
- ต่อแถวที่มีผู้เช่า: `evaluateLegal("DEPOSIT_ADVANCE_LIMIT", { leaseKind: leaseKind(months), monthlyRentSatang: rent, depositSatang: deposit, advanceRentSatang: advanceRent }, { mode, outOfScopeReason })` — **ฟังก์ชันเดียวกับที่ `createLease` ใช้** (ผลพรีวิว = ผลตอนสร้าง)
  - `BLOCK` (STRICT · OUT_OF_SCOPE ไม่มีเหตุผล) ⇒ ปัญหา `DEPOSIT_LEGAL` **MUST_FIX** (`legal.code` · `messageTh` · `citation` · ข้อแนะ "แก้ยอด หรือข้ามแถว") — สร้างไม่ได้จนแก้ (`decisions` SET deposit) หรือข้ามแถว
  - `WARN` (โหมด WARN) ⇒ ปัญหา `DEPOSIT_LEGAL` **WARN** — `createImport` ต้องมี `legalAck.reason` (≥ 10 ตัวอักษร · `isValidOutOfScopeReason`) **และ** ผู้กระทำเป็น OWNER (Membership สด) ไม่งั้น `NEEDS_OWNER` ไม่มีอะไรเกิด · สร้างผ่าน `createLease(… legalAck)` ⇒ สัญญา `legal.level WARN` + AuditLog `dorm.lease.legal_override` ของ D.5
  - `OK` (รวม OUT_OF_SCOPE + เหตุผล) ⇒ ไม่มีปัญหา
- ข้อความสัญญา: `createLease` ตรวจข้อบังคับ/คำต้องห้ามเองตาม D.5 K2/K8 — ชื่อผู้เช่าที่ทำให้ข้อความสัญญาผิด ⇒ พรีวิวต้องรายงาน `CONTRACT_LEGAL` MUST_FIX (เรียกตัวตรวจเดียวกับ D.5 แบบอ่านอย่างเดียว) ไม่ใช่ไปล้มตอนสร้าง

### 2.8 สถานะ · CAS · ล็อก (ใบเข้ม — ผู้ตรวจ B ยิงตาม §12)
```
DRAFT ──createImport (CAS: status DRAFT|UNDONE, previewHash ตรง, confirmed) ──► CREATING ──ทุกแถวเสร็จ──► CREATED
CREATING (ไม่มีผู้ถือ: claimUntil < now − 60 วิ) ──createImport──► CREATING (token ใหม่ · ทำต่อ)
CREATED | CREATING(ไม่มีผู้ถือ) ──undoImport (CAS)──► UNDOING ──ครบ──► UNDONE ──createImport (พรีวิวใหม่)──► CREATING
```
- ทุกการเปลี่ยนสถานะ = `updateMany where { id, tenantId, unitId, status IN (...), version }` + `version+1` + `claimToken` สุ่ม 128 บิต + `claimUntil = now + 120 วิ` · ได้ 0 แถว ⇒ อ่านใหม่: CREATED ⇒ `{ok:true, duplicate:true}` · UNDONE (สำหรับ undo) ⇒ `duplicate:true` · มีผู้ถือ ⇒ `BUSY` (reason "มีการนำเข้า/ย้อนกลับของหอนี้กำลังทำอยู่ — รอสักครู่แล้วลองใหม่")
- หน่วยหนึ่งมีงาน CREATING/UNDOING ได้ชุดเดียว (ทาง ก = partial unique · ชน P2002 ⇒ `BUSY`)
- **ตรวจ→เขียน ใต้ล็อกเดียวกัน**: `createImport` คำนวณแผนใหม่ใน tx ที่ถือ `pg_advisory_xact_lock(hashtextextended('dorm.import:<unitId>', 0))` แล้วเทียบ `previewHash` ก่อน CAS เป็น CREATING (ต่าง ⇒ `STALE_PREVIEW` + `previewHash` ใหม่ · ไม่มีอะไรเกิด) · ทุก tx ของงานต่อแถวเริ่มด้วยล็อกเดียวกัน + ตรวจ `claimToken` (ไม่ใช่ของเรา ⇒ หยุด ไม่เขียน · `BUSY`)
- **ห้ามเปิด connection ที่สองระหว่าง tx** (ไม่เรียก facade ที่เปิด tx เอง ภายใน tx · ไม่ `prisma.` ดิบใน callback) — งานต่อแถวเป็น **ลำดับ tx สั้น ๆ** §5.2 ไม่ใช่ tx ยักษ์ (คิวเงินระดับร้าน ~0.7 วิ/สัญญา · tx เดียว 36 สัญญาเกิน timeout)
- tx ของ import: `maxWait ≤ 20s` `timeout ≤ 30s` · `40P01` (deadlock) / `P2034` ⇒ ลองใหม่ **1 ครั้ง** แล้ว `BUSY` (ไม่ throw · ไม่ค้างครึ่งทาง — แถวที่ยังไม่ทำคงเดิม ทำต่อได้)
- ลำดับล็อก (ห้ามสลับ): `dorm.import:<unitId>` → (ใน D.5) `dorm.lease:<id>` → แถว Tenant (บัญชี InTx) → แถวสัญญา · ไม่มีทางใดถือล็อกหลังแล้วขอ `dorm.import:<unitId>`
- ฟังก์ชันเขียนทุกตัว: ห้าม throw (ยกเว้นบั๊กจริง) · ปฏิเสธ = `{ ok:false, code, reason }` reason ไทยไม่ว่าง ไม่โทษผู้ใช้ ไม่มีข้อความ Prisma

---

## 3. สัญญา (ชื่อ/ชนิดตรงตัว — ข้อสอบผูก) — ออกทาง `@/lib/modules/dorm`
```ts
export type ImportCtx = { tenantId: string; actorUserId: string };
export type ImportFieldKey = "room" | "building" | "floor" | "roomType" | "tenantName" | "phone" | "idCard" | "startDate" | "months"
  | "rent" | "deposit" | "advanceRent" | "elecReading" | "waterReading" | "arrears" | "note";
export type ImportMapping = Record<string, ImportFieldKey | "IGNORE">;      // key = index คอลัมน์ 0-based เป็นสตริง
export type ImportOptions = { dateFormat?: "BE_DMY" | "CE_DMY" | "ISO"; meterReadDate?: string /* YYYY-MM-DD */; depositChannel?: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId?: string | null };
export type ImportDecision = { action: "SKIP" } | { action: "SET"; field: ImportFieldKey; value: string } | { action: "TENANT"; mode: "MERGE" | "SEPARATE" } | { action: "TENANT"; confirmPartyId: string } | { action: "TENANT"; createNewParty: true };
export type ImportIssue = { rowNo: number | null; room: string | null; code: string; severity: "MUST_FIX" | "WARN" | "INFO"; field: ImportFieldKey | null;
  value: string | null /* ปิดข้อมูลส่วนตัว + neutralize */; messageTh: string; legal?: { code: string; messageTh: string; citation: string } | null };
export type ImportPlan = { buildings: number; floors: number; rooms: number; roomTypes: number; leases: number; parties: number; meters: number; readings: number;
  depositSatang: number; arrears: { count: number; satang: number }; existing: { rooms: number; leases: number; meters: number }; skippedRows: number };
export type ImportSummary = { rows: number; ready: number; warn: number; mustFix: number };
export type ImportStatus = "DRAFT" | "CREATING" | "CREATED" | "UNDOING" | "UNDONE";
type Fail = { ok: false; code: string; reason: string };
```
**ด่านทุกฟังก์ชัน** (ลำดับนี้ · แบบ D.5 §3): หน่วย = `BusinessUnit` ของ `ctx.tenantId` และ `type "DORM"` · ผู้กระทำ = Membership สด (`acceptedAt` ไม่ null) · สิทธิ์ `dorm.import` ผ่าน `evaluate` (OWNER/MANAGER ที่คุมหน่วยผ่าน) · `createImport`/`undoImport` ต้อง `dorm.lease.manage` ด้วย และต้องเห็นทุกอาคารของหน่วย (`dormBuildingScope` ไม่จำกัด) · ชุดต้องเป็นของหน่วยนั้น — **ไม่ผ่าน ⇒ `NOT_FOUND` (เขียน) / `null` หรือ `[]` (อ่าน) reason เดียวกันทุกกรณี** (X1 ไม่บอกว่ามีอยู่)

### 3.1 `uploadImport`
```ts
uploadImport(ctx, { unitId: string; fileName: string; contentType?: string | null; data: Uint8Array; sheet?: string | null },
             deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void> })
  → Promise<{ ok: true; batchId: string; duplicate: boolean; status: ImportStatus; format: "CSV" | "XLSX"; sheet: string;
              sheets: { name: string; rowCount: number }[]; rowCount: number; columnCount: number; headers: string[]; samples: string[][] } | Fail>
```
- ลำดับ: ด่าน → ขนาด (`maxFileBytes`) ⇒ `FILE_TOO_LARGE` → อ่าน §2.2 (`UNSUPPORTED_FORMAT` · `UNSAFE_FILE` · `EMPTY_FILE` · `SHEET_NOT_FOUND`) → แถว (`maxRows`) ⇒ `TOO_MANY_ROWS` · คอลัมน์ > 60 ⇒ `TOO_MANY_COLUMNS` — ปฏิเสธ = **ไม่มีแถวใดเกิด** (ไม่มีชุด · ไม่มี FileAsset)
- ไฟล์เก็บเป็น FileAsset `visibility "private"` ผ่าน `uploadFile` (deps.put) ก่อนเปิด tx (บทเรียน D.5 K5) · `fileHash` = sha256 ของ `data`
- ไฟล์เดิมบนหน่วยเดิม (พร้อมกัน 12 ทางด้วย) ⇒ ชุดเดียว `duplicate: true` (ไม่ P2002/throw) · ไม่อัปซ้ำ (หรืออัปแล้วลบของผู้แพ้ best-effort)
- `headers` = หัวคอลัมน์ผ่าน `neutralizeCell` · `samples` = ≤ 3 แถวแรกที่ไม่ว่าง ต่อคอลัมน์ (ปิดเบอร์/เลขบัตร §2.4 + neutralize)
- ไม่มี AI ในขั้นนี้ · ไม่มีเงิน · audit `dorm.import.uploaded` (after: batchId · fileHash · rowCount — ไม่มีชื่อ/เบอร์)

### 3.2 `guessColumns` (AI เสนอ · คนยืนยัน)
```ts
export type ImportColumnGuesser = {
  guess(input: { headers: string[]; samples: string[][]; fields: { key: ImportFieldKey; labelTh: string }[] })
    : Promise<{ col: number; field: ImportFieldKey | "IGNORE"; confidence: number }[]>;
};
guessColumns(ctx, { unitId: string; batchId: string }, deps?: { guesser?: ImportColumnGuesser | null })
  → Promise<{ ok: true; source: "AI" | "HEADER" | "NONE"; mapping: ImportMapping; confidence: Record<string, number>; guessed: number; columns: number } | Fail>
```
- `deps.guesser` ไม่ส่ง ⇒ ตัวต่อจริง `defaultColumnGuesser({tenantId})` (import-ai.ts · `null` เมื่อไม่มี provider/เครดิต) · ส่ง `null` = ไม่มี AI
- มี guesser ⇒ เรียก **ครั้งเดียว** ด้วย `headers` + `samples` ที่ **ปิดข้อมูลส่วนตัวแล้ว** (เบอร์/บัตรปิดตาม §2.4 · ชื่อคนในคอลัมน์ที่หน้าตาเป็นชื่อแทนด้วย `"ชื่อ-นามสกุล"` — PDPA: ไม่ส่งชื่อ/เบอร์จริงออกนอกระบบ) · ผลที่ field ไม่รู้จัก/คอลัมน์นอกช่วง/field ซ้ำ ⇒ ทิ้งรายการนั้น · guesser throw/หมดเวลา (10 วิ) ⇒ ใช้ HEADER **ไม่ throw**
- ไม่มี AI ⇒ `headerGuess` (pure §4) จับคู่จากหัวคอลัมน์ตรงชื่อพ้อง (ไทย/อังกฤษ) — `source "HEADER"` · ไม่มีตรงเลย ⇒ `"NONE"` (คนจับคู่เอง)
- `guessed` = จำนวนคอลัมน์ที่ได้ field จริง (ไม่นับ IGNORE) · ภาพ 12 "ระบบเดาให้ 10/11"
- เก็บเป็น `proposal` ของชุด — **ไม่ใช่การยืนยัน** (§3.3)

### 3.3 `previewImport` (ตรวจ + แผน · อ่านอย่างเดียวต่อข้อมูลธุรกิจ)
```ts
previewImport(ctx, { unitId: string; batchId: string; mapping?: ImportMapping; options?: ImportOptions; decisions?: Record<string /* rowNo */, ImportDecision[]> })
  → Promise<{ ok: true; status: ImportStatus; confirmed: boolean; previewHash: string; mapping: ImportMapping; summary: ImportSummary; issues: ImportIssue[]; plan: ImportPlan;
              rows: { rowNo: number; room: string; action: "CREATE" | "VACANT" | "SKIP_EXISTS" | "SKIPPED" | "BLOCKED"; severity: "OK" | "WARN" | "MUST_FIX" }[] } | Fail>
```
- `mapping` ส่งมา = **คนยืนยัน** (`confirmed: true` · จด `mappingConfirmedById` = ผู้กระทำ) · ไม่ส่ง = ใช้ `proposal` (`confirmed: false`) · แมปผิด ⇒ `INVALID_MAPPING` · options ผิด ⇒ `INVALID_INPUT`
- ไม่มีแถวธุรกิจใดถูกเขียน (ห้อง/สัญญา/Party/มิเตอร์/เลข/JV/outbox) — เขียนได้เฉพาะแถวชุด (mapping/options/decisions/summary/previewHash)
- `summary`: ต่อแถว ความรุนแรงสูงสุดของแถว (INFO ไม่นับ) ⇒ `ready` = แถวไม่มี WARN/MUST_FIX · `rows = ready + warn + mustFix`
- `plan` นับ **ของที่จะสร้างใหม่จริง** (ไม่รวมของเดิม · รวมห้องว่าง) · `parties` = Party ใหม่ · `depositSatang` = Σ ประกันของสัญญาที่จะสร้าง (ไม่รวมแถว MUST_FIX/ข้าม) · `arrears` = นับ/รวมจากคอลัมน์ค้าง (แสดงเท่านั้น)
- `previewHash` = sha256 ของ JSON เรียงคีย์: `fileHash` · mapping · options · decisions · โหมดกฎหมาย+เหตุผล · ค่าตั้งที่ใช้ (`defaultMonths` `deposit.months` ฯลฯ) · แผนต่อแถว (รวมผลจับคู่ห้อง/ผู้เช่ากับข้อมูลเดิม) — ข้อมูลเดิมเปลี่ยน/โหมดเปลี่ยน ⇒ hash เปลี่ยน
- ชุด CREATED ⇒ พรีวิวได้ (ทุกแถวเป็น SKIP_EXISTS) · ชุด CREATING/UNDOING ⇒ `BUSY`

### 3.4 `createImport`
```ts
createImport(ctx, { unitId: string; batchId: string; previewHash: string; legalAck?: { reason: string } | null })
  → Promise<{ ok: true; status: "CREATED"; duplicate: boolean; created: ImportPlan } | Fail>
```
- โค้ดปฏิเสธ: `NOT_FOUND` · `NOT_CONFIRMED` (แมปไม่เคยถูกส่งมาโดยคนใน previewImport) · `STALE_PREVIEW` (+ `previewHash` ใหม่ใน Fail) · `MUST_FIX_REMAINING` (+ `mustFix` n) · `NEEDS_OWNER` (มีแถว WARN กฎหมาย แต่ไม่มี legalAck/ไม่ใช่ OWNER) · `BUSY` · `PARTIAL` (แถวหนึ่งล้มจากบัญชี/ฐาน — `{ done, failedRowNo, failedCode }` · สถานะคง CREATING ไม่มีผู้ถือ · เรียกซ้ำ = ทำต่อจากแถวนั้น) — ทุกโค้ดก่อน CAS เป็น CREATING = **ไม่มีแถวใดเกิด**
- `created` = สิ่งที่สร้างจริงในรอบนี้รวมรอบที่ทำต่อ (= `plan` ของพรีวิวที่ hash ตรง) · `duplicate: true` เมื่อชุดเป็น CREATED อยู่แล้ว (ไม่มีอะไรเกิด)
- ขั้นตอน §5

### 3.5 `undoImport`
```ts
undoImport(ctx, { unitId: string; batchId: string; reason: string }, deps?: { now?: Date })
  → Promise<{ ok: true; status: "UNDONE"; duplicate: boolean;
              undone: { leases: number; depositReversals: number; reversedSatang: number; rooms: number; roomTypes: number; buildings: number; meters: number; readings: number } } | Fail>
```
- โค้ด: `NOT_FOUND` · `INVALID_INPUT` (เหตุผล < 3 ตัวอักษร) · `NOT_CREATED` (DRAFT) · `UNDO_EXPIRED` (พ้นหน้าต่าง `undoDays` เทียบ `committedAt` วันไทย · ใช้ `deps.now` ถ้าส่ง) · `UNDO_BLOCKED` + `blockers: { code: "BILL_EXISTS" | "MOVEOUT_EXISTS" | "LEASE_CHANGED" | "DEPOSIT_MOVED" | "METER_READ_AFTER_IMPORT" | "ROOM_IN_USE"; room: string; leaseId?: string }[]` (ไม่มีอะไรถูกย้อน) · `BUSY` · UNDONE แล้ว ⇒ `{ok:true, duplicate:true}`
- ขั้นตอน §6 · audit `dorm.import.undone` (after: batchId · reason · ยอด)

### 3.6 อ่าน
```ts
getImport(ctx, { unitId: string; batchId: string }) → Promise<ImportView | null>
type ImportView = { batchId: string; unitId: string; fileName: string; format: "CSV" | "XLSX"; sheet: string; sheets: { name: string; rowCount: number }[];
  rowCount: number; columnCount: number; headers: string[]; samples: string[][]; status: ImportStatus; proposal: { source: "AI" | "HEADER" | "NONE"; guessed: number } | null;
  mapping: ImportMapping | null; confirmed: boolean; summary: ImportSummary | null; plan: ImportPlan | null; issues: ImportIssue[];
  committedAt: string | null; undoUntil: string | null /* ISO */; canUndo: boolean; undoneAt: string | null; createdBy: string | null };
listImports(ctx, { unitId: string }) → Promise<{ batchId: string; fileName: string; status: ImportStatus; rowCount: number; committedAt: string | null; createdAt: string }[]>
importIssuesCsv(ctx, { unitId: string; batchId: string }) → Promise<string | null>     // หัว: แถว,ห้อง,รหัส,ระดับ,ช่อง,ค่า,คำอธิบาย · ทุกบรรทัดผ่าน csvRow
```
- DTO ทั้งหมด **ไม่มีเบอร์เต็ม/เลขบัตร** (X8) · ไม่มี path/cdnUrl/`private://`

### 3.7 pure (ออกทาง facade ด้วย — ข้อสอบ F เรียกตรง)
`parseImportFile` · `neutralizeCell` · `parseThaiDate` · `parseMoneySatang` · `headerGuess` · `importTemplateCsv` · `IMPORT_FIELDS` — สัญญา §4

### 3.8 account facade (additive · RULING-2) — กลับรายการรับเงินประกัน (ไม่ลบ)
```ts
reverseSecurityDepositReceiptInTx(tx, { tenantId: string; unitId: string; leaseId: string; receiptKey: string /* คีย์ที่ใช้รับ เช่น dorm.lease:<id>:deposit */; reason: string; createdById?: string | null })
  → Promise<{ ok: true; duplicate: boolean; receiptEntryId: string; reversalEntryId: string; heldSatang: number } | DormFail>
reverseSecurityDepositReceipt(input เดียวกัน)   // รุ่นเปิด tx เอง (runDormMoneyTx) — ห้ามเรียกใน tx อื่น
```
- หา JV รับ `DormSecurityDeposit#<unitId>:<leaseId>#RECEIVE:<receiptKey>` (ทุกสมุดของร้าน · แบบ F4) ⇒ ไม่พบ `NOT_FOUND` · สัญญามี JV ปิดประกัน (`#SETTLE:`) ที่ยังมีผล ⇒ `DEPOSIT_SETTLED`
- กลับรายการด้วยกลไก GL เดิม (entry ตรงข้าม `reversalOfId` = JV รับ · JV รับเป็น `REVERSED` · วันที่ = วันนี้ไทย · `assertNotLockedTx` ⇒ `PERIOD_LOCKED`) · **ไม่ลบแถวใด** · ซ้ำ ⇒ `duplicate: true` ผลเดิม · วินัยล็อกเดียวกับ `postSecurityDepositInTx` (แถว Tenant → ลิงก์หน่วย → JV)
- ทางทั่วไป (สมุดรายวัน/REST) ยังปฏิเสธ JV หอเหมือน F7 (G-* `qc-svc-d.2` ผ่าน d.5/d.8 ต้องเขียว)
- `securityDepositHeld` หลังกลับ = 0 · `securityDepositReceipts` ไม่แสดง JV ที่ถูกกลับ (status REVERSED)

---

## 4. pure «import-parse.ts» (import ได้แค่ `node:zlib` `node:crypto` + `import type` · ไม่แตะ prisma/next/env)
```ts
export const IMPORT_FIELDS: { key: ImportFieldKey; labelTh: string; aliases: string[] }[];   // aliases ไทย/อังกฤษ เช่น room: ["ห้อง","เลขห้อง","room","room no"] · elecReading: ["ไฟ","มิเตอร์ไฟ","elec",…] (จับคำหน้า เช่น "ไฟ ก.ย.")
export function parseImportFile(data: Uint8Array, opts?: { sheet?: string | null; maxUnzippedBytes?: number })
  : { ok: true; format: "CSV" | "XLSX"; encoding: "utf-8" | "utf-16le" | "windows-874" | "xlsx"; sheet: string; sheets: { name: string; rowCount: number }[]; headers: string[]; rows: string[][] }
  | { ok: false; code: "UNSUPPORTED_FORMAT" | "UNSAFE_FILE" | "EMPTY_FILE" | "SHEET_NOT_FOUND"; reason: string };
export function neutralizeCell(v: string): string;                                           // §2.4
export function parseThaiDate(v: string, fmt?: "BE_DMY" | "CE_DMY" | "ISO"): string | null;  // ⇒ "YYYY-MM-DD" · ตัวเลข Excel serial ด้วย · วันไม่มีจริง (31/2) ⇒ null
export function parseMoneySatang(v: string): number | null;                                  // §2.5 · ไม่ใช่เงิน/ติดลบ/สูตร ⇒ null · "" ⇒ null
export function headerGuess(headers: string[]): ImportMapping;                                // ตรงชื่อพ้องเท่านั้น (ไม่ fuzzy) · LINE/line id ⇒ "IGNORE"
export function importTemplateCsv(): string;                                                  // BOM + หัว 11 คอลัมน์ตามภาพ 12 + ตัวอย่าง 2 แถว · ทุกบรรทัด csvRow
```
- `rows` = ค่าดิบ (ยังไม่ neutralize — ตัวตรวจต้องเห็นของจริง) ความยาวเท่า `headers` · แถวว่างล้วนถูกตัด · `rowCount` ของชีต = แถวข้อมูล (ไม่นับหัว)
- ตัวอย่างที่ข้อสอบผูก: `parseThaiDate("1/5/69")` = `"2026-05-01"` · `("01/05/2569")` = `"2026-05-01"` · `("2026-05-01","ISO")` · `("46143")` = `"2026-05-01"` · `parseMoneySatang("4,500")` = 450000 · `("฿4,500.50")` = 450050 · `("4986.40")` = 498640 · `("=1+1")` `("-500")` `("4.505")` `("abc")` = null · `headerGuess` ของหัวภาพ 12 = room/tenantName/phone/startDate/rent/deposit/elecReading/waterReading/arrears/IGNORE(LINE)/note

---

## 5. สร้าง (`createImport`)
### 5.1 ก่อนเริ่ม (tx A · ล็อก `dorm.import:<unitId>`)
คำนวณแผนใหม่จากไฟล์ + mapping/options/decisions ที่เก็บ + ข้อมูลปัจจุบัน → ตรวจ `confirmed` · hash · MUST_FIX · ทาง WARN (OWNER+ack) → CAS เป็น CREATING (+ claimToken/claimUntil) — ไม่ผ่านข้อใด = ไม่มีอะไรเปลี่ยน

### 5.2 ต่อแถว (ตามลำดับ rowNo · **ทีละแถว** · แถว SKIPPED/BLOCKED ข้าม)
1. **tx R1** (ล็อก `dorm.import:<unitId>` · ตรวจ+ต่ออายุ claim): อาคาร/ประเภทห้อง/ห้องที่ยังไม่มี (เขียนผ่าน tx · ห้อง `floorNo` `floor` `buildingId` `roomTypeId` `note`) · จด manifest ของแถว (rooms/roomTypes/buildings ที่สร้าง) **ใน tx เดียวกัน**
2. ถ้ามีผู้เช่า: `createLease(ctxOwner, { unitId, roomId, startDate, months, tenant, rentSatang, depositSatang, advanceRentSatang, bookingFeeSatang: 0, legalAck }, { importBatchId, rowNo })` — `tenant` = `{ partyId }` เมื่อ MERGE กับแถวก่อน/`confirmPartyId` · `{ name, phone, idCardNo, createNewParty? }` อื่น ๆ · ได้ `ROOM_TAKEN` และห้องมีสัญญาที่ `policySnapshot.import.batchId` = ชุดนี้ ⇒ **รับเป็นของเรา** (ทำต่อหลังล้ม)
3. `moveIn(ctxOwner, { unitId, leaseId, paidAt: วันนี้, channel: options.depositChannel ?? "TRANSFER", financeAccountId }, { importBatchId, rowNo })` ⇒ เงินประกันยกมา = **JV เดียวกับ D.5** (`postSecurityDepositInTx` คีย์ `dorm.lease:<leaseId>:deposit` · Dr เงิน / Cr เงินประกันรับ หนี้สิน) ใน tx เดียวกับ ACTIVE (D.5 K1) · ประกัน 0 ⇒ ไม่มี JV · `NEEDS_CONTACT` จัดการตามทาง D.5 (เตรียมผู้ติดต่อนอก tx แล้วลองใหม่ 1 ครั้ง)
4. มิเตอร์: ต่อชนิดที่มีค่าในแถว — ห้องไม่มีมิเตอร์ active ⇒ `createMeter(ctx, { unitId, kind, roomId, startReading: ค่า, note: "import:<batchId>" })` · แล้ว `submitReadings(ctx, { unitId, periodKey: เดือนของ meterReadDate, items: [{ meterId, value, readAt: meterReadDate+"T12:00:00+07:00" }] }, { source: "IMPORT" })`
5. **tx R2** (ล็อก + claim): จด manifest (leaseId · partyId · partyCreated · receipt key · meterIds · readingIds) · แถวล้มที่ขั้นใด ⇒ จด `lastError` (rowNo · code) ปล่อย claim → `PARTIAL`
- ห้องว่าง (VACANT/ROOM_ONLY) ทำข้อ 1 + 4 เท่านั้น · SKIP_EXISTS ทำเฉพาะของที่ยังไม่มี (มิเตอร์/เลข)
### 5.3 อาร์กิวเมนต์ภายใน D.5 (`internal?: LeaseImportMark = { importBatchId: string; rowNo: number }`)
- `createLease`: พฤติกรรมเดิมทุกข้อ (ด่าน · กฎหมาย · ข้อความสัญญา · จับคู่ผู้เช่า · claimRoom) + `policySnapshot.import = { batchId, rowNo, origin: "IMPORT" }` (คีย์บนสุดเพิ่ม · ไม่ทับคีย์เดิม)
- `moveIn`: ข้าม **เฉพาะ** `NOT_SIGNED` และ `PHOTOS_REQUIRED` (สัญญากระดาษเดิม · ไม่มีรูปวันเข้าย้อนหลัง) เมื่อ `internal.importBatchId` ตรงกับ `policySnapshot.import.batchId` ของสัญญา — อย่างอื่นเหมือนเดิม (กฎหมายค้าง ⇒ NEEDS_APPROVAL · เงิน/ล็อก/คีย์เดิม)
- ไม่เปิดทางนี้ผ่าน server action ใด (actions ของ D.5 ส่งอาร์กิวเมนต์ 2 ตัวเท่านั้น) · `getLease` แสดงสัญญานำเข้า: `signedAt null` (จอ D.5 แสดง "สัญญากระดาษเดิม (นำเข้า)" ได้ภายหลัง — ไม่บังคับในใบนี้)
### 5.4 manifest ต่อแถว (ใช้ย้อนกลับ + ทำต่อ)
`{ rowNo, room, roomId, roomCreated, roomRevived, roomTypeIds[], buildingIds[], leaseId?, partyId?, partyCreated?, receiptKey?, depositSatang, meterIds[], readingIds[], status: "DONE" | "FAILED" }`

---

## 6. ย้อนกลับ (`undoImport`)
1. tx U0 (ล็อก `dorm.import:<unitId>`): สถานะ/หน้าต่างเวลา → **ตรวจตัวกั้นทุกแถว** (บิล `DormBill` ของสัญญาชุดนี้ใด ๆ · `DormMoveOut` · สถานะสัญญาไม่ใช่ ACTIVE/DRAFT · JV ประกันของสัญญาอื่นนอกจาก JV รับของชุด หรือยอดถือ ≠ ยอดที่นำเข้า · เลขมิเตอร์ของมิเตอร์ชุดนี้ที่ไม่ใช่ของชุด · ห้องที่ชุดสร้างมี occupancy/สัญญาอื่น) → มี ⇒ `UNDO_BLOCKED` (ไม่มีอะไรเปลี่ยน) → CAS เป็น UNDOING
2. ต่อสัญญา (ทีละสัญญา · tx เดียวต่อสัญญาผ่าน `runDormMoneyTx`): advisory `dorm.lease:<id>` → ตรวจตัวกั้นของสัญญานี้ซ้ำใต้ล็อก (`SELECT … FOR UPDATE` แถวสัญญา · ไม่มีบิล) → `reverseSecurityDepositReceiptInTx` (มีเงิน) → สัญญา `CANCELLED` · `endReason "IMPORT_UNDONE:<batchId>"` · `endedAt` → `releaseOccupancy` — **ทั้งหมดใน tx เดียว** (เงินกับสถานะ commit พร้อมกัน · บทเรียน D.5 K1) · พบตัวกั้นใต้ล็อก ⇒ หยุด คืน `UNDO_BLOCKED` (สัญญาที่ย้อนแล้วคงย้อน · ชุดคง UNDOING ไม่มีผู้ถือ · เรียกซ้ำทำต่อได้หลังแก้)
3. tx U2: ลบเลข PERIOD ของชุด (`source IMPORT` · id ใน manifest) · ลบมิเตอร์ของชุด (ไม่มีเลขอื่นแล้ว) · ห้องที่ชุดสร้าง ⇒ `active=false` (สัญญา CANCELLED ยังอ้าง FK — ห้าม hard delete ห้อง) · ห้องที่ชุด "ปลุก" ⇒ กลับ inactive · **ประเภทห้อง/อาคารที่ชุดสร้าง ปิด/ลบเฉพาะเมื่อไม่มีห้อง active อื่นใช้อยู่** (ชุดหลังอาจสร้างห้องใหม่บนประเภท/อาคารของชุดนี้ — ข้อสอบ I-5 → U-6) · อาคารที่ว่างแล้ว ⇒ ลบ (`deleteBuilding` ของ rooms หรือ tx เดียวกัน)
4. **Party ไม่ลบ** (ตัวตนกลางข้ามโมดูล · RULING-5) — นำเข้าใหม่จับคู่คนเดิม (ไม่เกิดซ้ำ) · ผล `undone` ไม่นับ Party
5. CAS เป็น UNDONE (`undoneAt` · `undoneById` · `undoReason`) · ไม่ลบแถวบัญชีใด ๆ (JV รับ = REVERSED + JV กลับรายการ · GL ประกันสุทธิ 0)
- หลัง UNDONE: ห้อง/สัญญา/มิเตอร์ของชุดไม่ปรากฏใน `listLeases` (ทุกแท็บ) · `roomBoard` · `meterWalk` · `heldTotalSatang` ลดตามยอดที่ย้อน

---

## 7. สิทธิ์ · event · audit
- คีย์ `dorm.import` (มีแล้ว · เอาออกจาก `planned`) · ผู้ใช้ QC ไม่แก้ใน `svc-qc-data` (ข้อสอบสร้างผู้ใช้เอง) · พรีเซ็ต D.13: เจ้าของเท่านั้น
- **ไม่มี event ใหม่** (event ของ D.5/D.6 ที่ถูกเรียกเกิดตามเดิม) · audit: `dorm.import.uploaded` · `dorm.import.created` (after: batchId · นับต่อชนิด · ยอดประกัน) · `dorm.import.undone` — payload/after ไม่มีชื่อ/เบอร์/เลขบัตร (X8 · X9)
- X5 ไม่เกี่ยว (ไม่มีงานตามเวลา) · X7 ไม่เกี่ยว (ไม่มี endpoint สาธารณะ — route แม่แบบอยู่หลังล็อกอิน)

---

## 8. จอ หอ 12 (เดสก์ท็อป 1440 · 390 ไม่ล้นแนวนอน) · ฉาก
### 8.1 «tenants/import/page.tsx» (server)
`requireUnit` · `unit.type !== "DORM"` ⇒ `notFound()` · ไม่มี `dorm.import` (ผ่าน `evaluate` ด้วย membership ของ session) ⇒ `notFound()` · `searchParams.batch` (ไม่มี = ชุดล่าสุดที่ไม่ใช่ UNDONE ของหน่วย · ไม่มีชุด = ขั้นอัปโหลด) · ข้อมูลผ่าน facade (`getImport` `previewImport` เมื่อมี mapping/proposal) ไม่แตะ prisma → `<ImportScreen … />` (อยู่ใต้ layout D.13 ⇒ แท็บ "ผู้เช่า/สัญญา" active เอง)
### 8.2 «actions.ts» `"use server"` — export async function เท่านั้น: `uploadImportAction` · `guessColumnsAction` · `previewImportAction` · `createImportAction` · `undoImportAction` — ทุกตัว `requireUnit` + สิทธิ์ `dorm.import` · ร้าน/ผู้กระทำจาก session (`auth.active.userId`) ไม่รับ tenantId จาก input · ไฟล์รับ base64/dataURL ตรวจขนาด **ก่อนถอด** (≤ `maxFileBytes`)
### 8.3 «template/route.ts» GET: ด่านเดียวกับหน้า (ไม่ผ่าน ⇒ 404) · `Content-Type: text/csv; charset=utf-8` · `Content-Disposition: attachment; filename="dorm-import-template.csv"` · body = `importTemplateCsv()`
### 8.4 «ImportScreen.tsx» (`'use client'` · props: `{ unitSlug: string; view: ImportView | null; preview: PreviewResult | null; actions?: {...} }` · render ได้ด้วย `renderToStaticMarkup` เมื่อไม่ส่ง actions)
- ตัวห่อ `data-dorm-import` · หัว "นำเข้าข้อมูลหอ" · ขั้น `data-import-step="UPLOAD|MAP|CHECK|CREATE"` 4 อัน ป้าย "อัปโหลด · จับคู่คอลัมน์ · ตรวจ · นำเข้า" · ขั้นปัจจุบัน `data-active="true"` (มีชุดยังไม่ยืนยัน = MAP · ยืนยันแล้ว = CHECK · CREATED/UNDONE = CREATE) · ลิงก์ "ดาวน์โหลดแม่แบบ" → `/app/u/<slug>/dorm/tenants/import/template`
- แถบไฟล์ `data-import-file`: ชื่อไฟล์ · `ชีต "<ชื่อ>" · <n> แถว <m> คอลัมน์` + ชีตอื่น `ชีต "<ชื่อ>" <n> แถว` · "เปลี่ยนไฟล์"
- ตาราง "คอลัมน์ในไฟล์ → ช่องในระบบ": แถว `data-map-col="<index>"` (หัวคอลัมน์ · ตัวอย่าง `data-map-sample` · ตัวเลือก `data-map-field="<FieldKey|IGNORE|>"`) · ป้าย `data-map-source="AI|HEADER|NONE"` ข้อความ "ระบบเดาให้ <guessed>/<columns>"
- การ์ด "ผลตรวจก่อนนำเข้า" `data-import-summary` + `data-ready` `data-warn` `data-mustfix` (ป้าย พร้อม · เตือน · ต้องแก้) · ปัญหา `data-import-issue="<code>"` `data-row` `data-severity` ("แถว 27 · ห้อง 310 …" · ข้อความกฎหมาย + citation เมื่อมี)
- การ์ด "จะสร้างอะไรบ้าง" `data-import-plan` · แถว `data-plan-item="structure|leases|meters|arrears|deposit"` (อาคาร · ชั้น · ห้อง `1 · 3 · 36` · ผู้เช่า + สัญญา · มิเตอร์ (ไฟ+น้ำ) + เลขเริ่ม · ยอดค้างยกมา "จดไว้ ยังไม่ออกใบ" · เงินประกันเปิดยอด (หนี้สิน) `฿296,400`) · ท้าย "นำเข้าทั้งชุดเป็น 1 รายการ · ย้อนกลับได้ <ภายในวันนี้|ภายใน N วัน> ถ้ายังไม่ออกบิล"
- ปุ่ม `data-import-create` (`disabled` เมื่อ mustFix > 0 หรือยังไม่ยืนยันแมป) · `data-import-undo` เฉพาะ CREATED และ `canUndo`
- **ไม่มีเบอร์เต็ม/เลขบัตร · ไม่มีคำต้องห้าม สคบ. · ไม่มีสตริงที่ขึ้นต้นด้วยสูตร** · สีตามโทเคนเดิม · หน้าตาตามภาพ 12 (ซ้าย = ตารางจับคู่ · ขวา = ผลตรวจ + แผน)
### 8.5 ฉาก «scripts/svc-qc-import-scene.mts» (ค่าล้วนใน `scripts/svc-qc-data.mts` บล็อก D.4: `SQC_IMPORT_SCENE` · `sqcImportSample`)
- ด่าน `loadSvcQcEnv("svc-qc-import-scene")` · ร้าน svcqc ต้อง seed แล้ว (ไม่งั้น exit 3) · **อยู่ร้าน B** (`SQC_OTHER`) หน่วย DORM ของฉาก `SQC_IMPORT_SCENE.unit` (ร้าน A ต้องมี 4 หน่วยพอดี — smoke SM-UNITS) · ผู้ถ่าย `--user other-owner`
- สร้างหน่วย (ถ้ายังไม่มี) → ไฟล์ xlsx 2 ชีต ("ผู้เช่า" = `sqcImportSample(วันนี้ไทย, { variant: "scene" })` · "มิเตอร์" 36 แถว) ชื่อ `ทะเบียนหอ ต.ค.69.xlsx` → `uploadImport` (put noop) → `guessColumns` ด้วย guesser แบบกำหนดผลตายตัวของฉาก (10/11 · LINE ไม่จับ) → `previewImport` **ไม่ส่ง mapping** (ค้างขั้น MAP · `confirmed false`) ⇒ พร้อม 32 · เตือน 3 · ต้องแก้ 1 · แผน 1·3·36 · ผู้เช่า+สัญญา 32 · มิเตอร์ 72 · ค้างยกมา 2 ฿10,200.40 · ประกัน ฿296,400
- idempotent: `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` · รันซ้ำ = 0/0/0 (ไฟล์เดิม = ชุดเดิม) · `--clear` ลบเฉพาะของฉาก (ชุด · FileAsset · หน่วยฉาก) · ไม่แตะข้อมูลอื่นของร้าน A/B

---

## 9. ข้อสอบ «scripts/qc-svc-d.4.mts» (กลุ่ม)
S โครงสร้าง · PC positive control (ต้องเขียวก่อนมีงาน) · F แยกไฟล์/แปลงค่า (pure) · C6 เพดาน X6 · N เซลล์อันตราย · M เดาคอลัมน์/ยืนยัน · P ตรวจ+พรีวิว+กฎหมายตามโหมด · K สร้าง (ไฟล์ 36 ห้องสร้างครบ · เงินเส้นเดียวกับ D.5) · I นำเข้าซ้ำ · U ย้อนกลับ (บัญชีกลับรายการ) · R พร้อมกัน (4 โพรเซส × 3 · 30 ทางในโพรเซสเดียว) · A สิทธิ์ · X ข้ามร้าน · W จอ หอ 12 · Q ฉาก · V ภาพ · Z ล้าง · G regression (หลังล้าง)
- ข้อมูลทดสอบใต้ร้านชั่วคราว slug `qc-svc-d4-*` · ผู้ใช้ `svc-d4-*@shark.local` · ไฟล์ตัวอย่างสร้างในข้อสอบจาก `sqcImportSample` (CSV UTF-8+BOM · CSV windows-874 · XLSX store/deflate เขียนเองใน oracle) — ไม่มีไฟล์ใน `scripts/fixtures/`
- ห้ามแก้ให้ผ่านด้วย "ลองใหม่จนสำเร็จ" ที่ซ่อนผลซ้ำ · ฟังก์ชันใน facade ขาด = FAIL

## 10. regression · X · ส่งต่อ · หนี้
- G (หลังล้าง · ลูกโพรเซส): `qc-svc-d.5` · `qc-svc-d.6` · `qc-svc-d.1` · `qc-svc-d.8 --no-regression` · `qc-svc-d.13 --no-regression` · `qc-svc-smoke` · + ผู้คุม: `qc-svc-d.2` (facade บัญชีเพิ่ม) · fitness 2 โหมด · typecheck · ตรวจเข้ม 2 รอบ
- X1 (X-* · A-*) · X3 (R-*) · X4 (I-* · R-1/R-2) · X6 (C6-* · N-* · F-zip) · X8 (samples/DTO ไม่มี PII · AI ไม่เห็นชื่อ/เบอร์จริง) · X9 (audit 3 ชนิด · undo ต้องมีเหตุผล)
- ส่งต่อ: **D.8** บิลแรกของสัญญานำเข้าใช้เลข PERIOD นำเข้าเป็นเลขก่อน · **D.10/D.12** ยอดค้างยกมา (ไม่สร้างในใบนี้) · **D.12** แยกส่วนเกินประกันเป็น "เงินรับล่วงหน้าคืนผู้เช่า" (ภาพ 12 ข้อแนะ) · **D.14** ตัวต่อ AI ใช้ร่วม · **D.15** ลูกค้าจริงนำเข้า (UAT U2)
- หนี้ (ไม่บล็อก): รวมข้อมูลข้ามชีต (ชีต "มิเตอร์" แยก) · ผู้พักร่วม/รถจากไฟล์ · รูป/สัญญาสแกนย้อนหลังของสัญญานำเข้า · อัปโหลดไฟล์ใหญ่ทีละส่วนฝั่ง client (bodySizeLimit) · Party ที่สร้างแล้วย้อน (RULING-5)

## 11. คำถามกฎหมาย/บัญชี (ลง `ledger/wo-notes/svc-legal-questions.md` ตอนรับใบ)
- **J4 (บัญชี)**: ประกันยกมา Dr "เงินสด/ธนาคาร" (ทางเดียวกับ D.5 ตามคำสั่งผู้คุม) — ถ้าเจ้าของตั้งยอดยกมาของบัญชีธนาคารเองด้วย ยอดเงินจะนับซ้ำ · ทางเลือก Dr "ยอดยกมา/ทุน" ต้องแตะ facade บัญชี — ค่าปลอดภัย: ให้เลือก `financeAccountId` (บัญชีพัก) ได้ในตัวเลือก + ข้อความเตือนบนจอ
- **J3 (กฎหมาย)**: สัญญาในไฟล์ครบกำหนดแล้วแต่ผู้เช่ายังอยู่ (เดือนต่อเดือน) — ต่ออายุรอบละ `defaultMonths` อัตโนมัติ (WARN) ถูกต้องไหม · สัญญานำเข้าไม่มีลายเซ็น/รูปวันเข้า (ข้ามด่าน D.5 เฉพาะนำเข้า) ใช้เป็นหลักฐานได้แค่ไหน · ประกันเดิมเกิน 3 เดือนที่รับมาก่อนประกาศ (โหมดเข้มงวดบล็อก) ควรมีทาง "ยกเว้นสัญญาเดิมก่อนประกาศมีผล" หรือไม่

## 12. สนามผู้ตรวจ B (โพรเซสแยกจริง · ต้อง 0 ไม่ผ่าน)
| # | ฉาก | ผลที่ต้องได้ |
|---|---|---|
| R1 | `createImport` ชุดเดียว 12 ทาง (4 โพรเซส × 3) + 30 ทางในโพรเซสเดียว | ผู้ทำงานจริง 1 · ที่เหลือ `BUSY`/`duplicate` · ห้อง/สัญญา/JV/มิเตอร์/เลข = แผนพอดี · 0 throw/P2028/P2024 |
| R2 | สองไฟล์ต่างกันห้องทับกัน (CSV vs XLSX ข้อมูลเดียวกัน + ไฟล์ที่มีห้องเพิ่ม 2) ยิงพร้อมกัน | ไม่มีห้อง/สัญญา/Party/มิเตอร์ซ้ำ · ชุดหนึ่ง `BUSY` หรือแถวเป็น SKIP_EXISTS · ยอดประกันรวม = ไม่ซ้ำ |
| R3 | `undoImport` 12 ทาง | ย้อนครั้งเดียว · JV กลับรายการ = จำนวน JV รับ พอดี · ไม่มี JV ถูกลบ |
| R4 | undo ∥ createImport (6+6) บนชุด CREATED แล้วต่อด้วย create ∥ undo บนชุด UNDONE | สถานะสุดท้ายเป็นของผู้ชนะคนเดียว: ทุกสัญญาของชุด ACTIVE+ยอดถือ=ประกัน **หรือ** ทุกสัญญา CANCELLED+ยอดถือ 0 — ห้ามครึ่ง ๆ |
| R5 | SIGKILL ตัวสร้างหลังแถว N (ระหว่าง `createLease` กับ `moveIn` และระหว่าง `moveIn` กับ tx R2) แล้ว `createImport` ใหม่ (หลัง claim หมด + 60 วิ) | ทำต่อจนครบ · รับสัญญาที่สร้างค้างเป็นของชุด (ไม่ซ้ำ) · undo หลังจากนั้นย้อนครบรวมแถวที่ค้าง |
| R6 | zombie: ตัวสร้างเก่าตื่นหลังถูกแย่ง claim | tx R1/R2 ของมันถูกปฏิเสธ (token ไม่ตรง) · ไม่มีแถวหลุดหลัง CREATED/UNDONE |
| R7 | undo ∥ D.8 เตรียม/ส่งรอบบิลของหน่วยเดียวกัน | undo `UNDO_BLOCKED` (มีบิล) **หรือ** บิลไม่ถูกสร้างให้สัญญาที่ CANCELLED — ห้ามบิลค้างบนสัญญาที่ย้อนแล้ว |
| R8 | undo ∥ `settleSecurityDeposit`/`reverseSecurityDepositSettlement` บนสัญญานำเข้า | ผู้ชนะ 1: ปิดประกันสำเร็จ ⇒ undo `UNDO_BLOCKED (DEPOSIT_MOVED)` · undo สำเร็จ ⇒ ปิดประกัน `NO_DEPOSIT_HELD`/NOT_FOUND · GL สมดุล |
| R9 | import ∥ `createLease` มือบนห้องเดียวกัน · import ∥ `submitReadings` มิเตอร์/งวดเดียวกัน | ห้องเดียวกันมีสัญญาเดียว (`ROOM_TAKEN` ⇒ แถวนั้น `PARTIAL`/MUST_FIX ไม่ใช่ซ้อน) · เลข PERIOD แถวเดียว |
| R10 | สองหน่วยร้านเดียวกันนำเข้าพร้อมกัน (คิวเงินระดับร้าน) | ทั้งคู่สำเร็จหรือ `PARTIAL` ที่ทำต่อได้ · ไม่มี DRAFT ค้างเงินเกิน · ไม่ throw |
| R11 | บังคับ 40P01 (ล็อกสลับลำดับระหว่างสองชุด/สอง tx) | ลองใหม่ 1 ครั้ง แล้ว `BUSY` · ไม่มีครึ่งแถว (manifest = ฐานจริง) |
| R12 | ยิงข้ามหน่วย/ข้ามร้านด้วย batchId ที่เดา/ขโมยมา · `previewHash` ของชุดอื่น | `NOT_FOUND`/`STALE_PREVIEW` · reason เดียวกัน · ไม่มีข้อมูลหลุด |
| R13 | ขอบหน้าต่าง undo 23:59:59 ↔ 00:00:00 ไทย (`deps.now`) · `undoDays` เปลี่ยนระหว่างทาง | ตัดสินด้วยค่าตั้งสด ณ คำขอ · ขอบถูกต้องตามวันไทย |
| R14 | ไฟล์ระเบิด (zip 30 MB หลังคลาย · 10,000 รายการ · XML ลึก/ยาว · CSV 1 แถว 9 MB) | `UNSAFE_FILE`/`FILE_TOO_LARGE`/`CELL_TOO_LONG` ภายใน < 5 วิ · RSS ไม่เกิน ~300 MB |
| R15 | เซลล์อันตรายทุกแบบ (`=` `+` `-` `@` tab CR LF ตัวเต็มความกว้าง · DDE `=cmd\|' /C calc'!A0` · `=HYPERLINK`) ไหลผ่าน ชื่อ → สัญญา → `listLeases` → CSV ทุกตัวส่งออกของหอ | ไม่มีช่องใดในไฟล์ส่งออก/DOM ขึ้นต้นด้วยสูตร |

## 13. มติที่ต้องให้ผู้คุมเคาะ (ค่าปลอดภัยในวงเล็บ — builder ทำตามค่าปลอดภัยถ้ายังไม่มีมติ ยกเว้น RULING-1)
1. **RULING-1 ที่เก็บชุดนำเข้า** — ทาง ก migration `svc_d4` (แนะนำ · ผิดกติกา §1.1 ข้อ 5 จึงต้องมีมติ) / ทาง ข ไม่มี migration · ข้อสอบผ่านได้ทั้งสองทาง · **ยังไม่มีมติ = builder หยุดก่อนแตะ schema** (ทำ pure/จอได้)
2. **RULING-2 แตะ account facade/service** (เพิ่ม `reverseSecurityDepositReceipt*` แบบ additive · ไม่มีทางอื่นกลับ JV หอเพราะ F7) — (อนุญาต แบบเดียวกับ D.5 K1)
3. **RULING-3 หน้าต่างย้อนกลับ** แผน "ภายในวัน" vs ภาพ 12 "ภายใน 7 วันถ้ายังไม่ออกบิล" — (ค่าตั้ง `rooms.import.undoDays` ค่าเริ่ม 0 = ภายในวัน · ตั้งได้ถึง 7 · เงื่อนไข "ยังไม่ออกบิล" ใช้ทุกกรณี)
4. **RULING-4 ยอดค้างยกมา** (ภาพ 12 "ใบแจ้งหนี้ค้างยกมา 2 ใบ") — ไม่อยู่ในขอบเขตแถวแผน และการออกใบ = เส้นเงินใหม่ — (ไม่สร้างใบ · แสดง "จดไว้ ยังไม่ออกใบ" · ส่งต่อ D.10/D.12)
5. **RULING-5 Party ตอนย้อนกลับ** — (ไม่ลบ · ตัวตนกลางข้ามโมดูล + ผู้ติดต่อบัญชีอ้างอยู่ · นำเข้าใหม่จับคู่คนเดิม)
6. **RULING-6 ข้ามด่านลงชื่อ/รูปวันเข้าของ `moveIn` เฉพาะนำเข้า** (§5.3 · แตะ lease.ts แบบ additive) — (อนุญาต · ป้ายบนสัญญาว่า "นำเข้า")
7. **RULING-7 รูปแบบไฟล์** — ไม่มีไลบรารี xlsx · (CSV/TSV + ตัวอ่าน XLSX เขียนเองบน `node:zlib` พร้อมเพดานระเบิด · ไม่รองรับ .xls/.ods)
8. **RULING-8 ไฟล์มีแถว WARN กฎหมาย** — (สร้างทั้งชุดได้เฉพาะ OWNER + legalAck · ไม่ส่งสายอนุมัติ เพราะสัญญา DRAFT ค้างอนุมัติจะทำให้ชุดค้างครึ่งทาง)

## มติผู้คุม (30 ต.ค.)
- **RULING-1 = ทาง ก**: migration `svc_d4` เพิ่มตาราง `DormImportBatch` แบบเพิ่มอย่างเดียว (ไม่แก้ตาราง/คอลัมน์เดิม) · ยกเว้น §1.1 ข้อ 5 เฉพาะใบนี้ · ต้องมี tenantId + unitId + index · ลงรายการใน `ledger/wo-notes/svc-deploy-checklist.md`
- **RULING-2 อนุมัติ** เพิ่ม `reverseSecurityDepositReceipt*` ใน account facade/service แบบเพิ่มอย่างเดียว (แบบ D.5 K1) · กลับรายการเท่านั้น ห้ามลบแถวบัญชี · ผู้ตรวจ A ต้องอ่านเส้นเงินนี้ทุกบรรทัด
- **RULING-3** ค่าตั้ง `rooms.import.undoDays` ค่าเริ่ม 0 (= ภายในวันตามเวลาไทย) ตั้งได้ 0–7 · ข้อความบนจอ หอ 12 ต้องอ่านจากค่าตั้ง (ไม่เขียน "7 วัน" ตายตัว) · `UNDO_BLOCKED` ทุกกรณีตามใบยังบังคับ
- **RULING-4 รับ** ยอดค้างยกมา = จดไว้ ไม่ออกใบ · แสดง "จดไว้ ยังไม่ออกใบ"
- **RULING-5 รับ** ย้อนกลับไม่ลบ Party
- **RULING-6 อนุมัติ** ข้ามด่านลงชื่อ/รูปวันเข้าเฉพาะงานนำเข้า (อาร์กิวเมนต์ภายในแบบเพิ่ม)
- **RULING-7 รับ** รูปแบบไฟล์ CSV/TSV (UTF-8/UTF-16LE/cp874) + XLSX ตัวอ่านบน node:zlib พร้อมเพดาน · อื่น ⇒ UNSUPPORTED_FORMAT
- **RULING-8 รับ** แถว WARN สร้างได้เฉพาะ OWNER + legalAck
- J4 (ประกันยกมา Dr เงินสด อาจนับซ้ำกับยอดยกมาธนาคาร) ⇒ หน้าพรีวิวต้องมีคำเตือนชัด + ลงคำถามบัญชีตอนรับใบ
- ระดับตรวจ = เข้ม · ผู้ตรวจ 2 คน (A อ่านโค้ด · B probe R1–R15)
