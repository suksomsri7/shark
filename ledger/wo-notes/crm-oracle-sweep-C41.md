# Oracle sweep after C4.1 — registry = interactive controls only (27 ก.ย. 2569 · oracle maintainer · worktree `shark-crm-c23` @ be5ab4be)

## ทำไม
C4.1 ตัด 94 แถวที่ไม่ใช่คอนโทรลออกจาก `scripts/crm-ui-inventory.json` (รายการ: `ledger/wo-notes/crm-C4.1.md` §3).
oracle ใบเก่าหลายใบยังเรียก "ทุก testid ต้องมีแถว" ⇒ แดงที่กล่อง/ข้อความ/ตาราง/`<audio>`.
นิยาม "testid ที่กดได้" ที่ถือเป็นหลัก = fitness F14.1 ⇒ ยกตัวสแกนของ F14 ไปไว้ที่ `scripts/lib/crm-testid-scan.mts`
(บริสุทธิ์ ไม่มี env/prisma/fs) แล้วให้ทั้ง fitness และ oracle ใช้ตัวเดียวกัน.

## กติกาใหม่ (ทุกเช็กที่แก้)
- testid ที่ตัวสแกน F14 ว่า **กดได้** (หรือ **หาไม่เจอ/อ่านไม่ออก** ⇒ เข้มไว้ก่อน) → ต้องมีแถวในทะเบียน (wo ตามเดิมของเช็กนั้น)
- testid ที่ **มีอยู่แต่ไม่กดได้** → ไม่ต้องมีแถว แต่ต้อง **ยังมีอยู่** เป็น `data-testid` ในซอร์สที่เช็กนั้นอ่าน (ไม่มีอะไรหย่อนลง)
- ตัดสินด้วย occurrence ที่ id ตรงเป๊ะก่อน · glob ใช้เฉพาะตอนไม่มีตัวตรง (กัน `<li data-testid={`crm-seq-step-${k}`}>` ถูกตัดสินด้วยปุ่ม `crm-seq-step-up-${k}`)

## fitness ก่อน/หลัง
`pnpm fitness` ก่อน/หลัง (ก่อน = HEAD + สองไฟล์ที่ผู้คุมงานแก้มือ · หลัง = ทุกการแก้ในใบนี้) — **diff = ไม่มี** ทั้งสองโหมด:
- ปกติ (DATABASE_URL/DIRECT_URL ของ QC3): `.qc-shots/sweep41/fitness-before-normal.log` ↔ `fitness-after-normal.log` → เหมือนกันทุกไบต์ · exit 0 · 33/33
- `env -u DATABASE_URL -u DIRECT_URL`: `fitness-before-nodb.log` ↔ `fitness-after-nodb.log` → เหมือนกันทุกไบต์ · exit 0
- โค้ดที่ย้าย = ตัวเดียวกับที่ลบจาก fitness ทุกตัวอักษร (เทียบ `git show HEAD:scripts/fitness.mts` บรรทัด 1085–1125 กับไฟล์ใหม่ที่ถอด `export ` ออก → identical)
- `pnpm typecheck` (gate lock · heap 5120) exit 0 → `.qc-shots/sweep41/typecheck.log`

## เช็กที่แก้
ทุกเช็กนำเข้า `needsRegistryRow` / `testidKind` จาก `scripts/lib/crm-testid-scan.mjs` (บรรทัด import มี `// ORACLE-EDIT (sweep 27 Sep, C4.1 registry policy)`).
positive control = ลบแถวทะเบียนของ testid **ที่กดได้** 1 แถวต่อเช็ก (ครั้งเดียวพร้อมกัน 10 แถว · `control.mutation.log`) แล้วรันชุดบน QC3 → คืนไฟล์ (sha256 ตรง `a40bfcce…`).

| ไฟล์:บรรทัด chk (แก้ที่) | id | กติกาเดิม | กติกาใหม่ | เขียว (QC3) | positive control → แดง |
|---|---|---|---|---|---|
| qc-crm-c1.11.mts:1465 (1455) | C1.11-S9.2 | ต้องมีแถว wo C1.11 ของ `crm-uiversion-toggle` | wrapper `crm-uiversion-toggle` (div) ต้องมีอยู่ (แถวต้องมีเฉพาะถ้ากดได้) **และ** ตัวกดข้างใน `crm-uiversion-submit` ต้องเป็นคอนโทรลตามตัวสแกน + มีแถว wo C1.11 (ตามที่ผู้คุมงานสั่ง: ต้องบังคับแถวของตัวกด ไม่ใช่ wrapper) | ✅ `green3-qc-crm-c1.11.log` | ลบแถว `crm-uiversion-submit` → ❌ `toggle=false(… crm-uiversion-submit interactive row=false)` (`control2-…`) · ใส่ `role="button"` ให้ wrapper ชั่วคราว → ❌ `toggle=false(control→row)` (`control-…`) |
| qc-crm-c2.2.mts:1372 (1366) | C2.2-S6.5 | ทุก testid literal/แพตเทิร์นในหน้า C2.2 ต้องมีแถว wo C2.2 | เฉพาะตัวที่กดได้ (หรือหาไม่เจอ) ต้องมีแถว wo C2.2 · ตัวอื่นอ่านมาจากไฟล์เหล่านั้นจึงยังมีอยู่ | ✅ `green2-qc-crm-c2.2.log` (exit 0) | ลบ `crm-seq-new-submit` → ❌ `missing=crm-seq-new-submit` |
| qc-crm-c2.4.mts:1068 (1063) | C2.4-S7.6 | ทุก id ใน need ต้องมีแถว wo C2.4 (ผู้คุมงานแก้มือ: NON_CONTROL 2 ตัว) | ใช้ helper แทนรายชื่อมือ: กดได้/หาไม่เจอ → แถว wo C2.4 · ไม่กดได้ (`crm-call-log-modal`, `crm-call-recording-player`) → ต้องมีเป็น data-testid ใน UI | ✅ exit 0 | ลบ `crm-card-scan` → ❌ `noRow=crm-card-scan` |
| qc-crm-c2.5.mts:1226 (1219) | C2.5-S8.5 | ทุก literal ต้องมีแถว wo C2.5 (ผู้คุมงานแก้มือ: regex เดาแท็กเอง) | ใช้ helper (ตัวสแกน F14) แทน regex มือ | ✅ exit 0 | ลบ `crm-email-send` → ❌ `noRow=crm-email-send` |
| qc-crm-c2.6.mts:1672 (1663) | C2.6-S8.4 | ทุก id ใน TIDS+timeline ต้องมีแถว wo C2.6 · จำนวนแถว ≥ 24 | กดได้/หาไม่เจอ → แถว wo C2.6 (prefix `x-` ตัดสินเป็น `x-*`) · ไม่กดได้ต้องมีใน UI (`gone`) · พื้นจำนวนแถว = จำนวนที่ต้องมีแถว (20) | ✅ exit 0 | ลบ `crm-track-save` → ❌ `missing=crm-track-save` |
| qc-crm-c2.7.mts:1192 (1185) | C2.7-S8.3 | 3 id ต้องมีแถว wo C2.7 | กดได้/หาไม่เจอ → แถว wo C2.7 · `pos-deal-hint` (span) ต้องมีในหน้า POS/หน้าเอกสาร | ✅ exit 0 | ลบ `pos-deal-select` → ❌ `inventoryMissing=pos-deal-select` |
| qc-crm-c3.1.mts:1499 (1496) | C3.1-S5.1 | ต้องมีแถว wo C3.1 ของ `crm-report-export` | ต้องมีแถวเมื่อกดได้ (วันนี้เป็นปุ่ม ⇒ เท่าเดิม) · need list เดิมยังบังคับให้มีในซอร์ส | ✅ exit 0 | ลบ `crm-report-export` → ❌ `exportRow=false` |
| qc-crm-c3.4.mts:1125 (1116) | C3.4-S8.1 | 9 ปุ่ม AI ต้องมีแถว | `inInv` ใช้ helper (กดได้ → แถว) · ผู้เรียกทุกตัวยังบังคับ `hasTid` | ✅ exit 0 | ลบ `crm-ai-deal-summary` → ❌ `missingInInventory=crm-ai-deal-summary` |
| qc-crm-c3.4.mts:1134 (1116) | C3.4-S8.2 | 4 id (รวม `crm-ai-at-risk-table`) ต้องมีในซอร์ส **และ** มีแถว | ตาราง (ไม่กดได้) ต้องมีในซอร์สอย่างเดียว · ปุ่มยืนยัน/แก้/ยกเลิกยังต้องมีแถว | ✅ exit 0 | ลบ `crm-ai-proposal-confirm` → ❌ `missing=crm-ai-proposal-confirm` |
| qc-crm-c3.4.mts:1144 (1116) | C3.4-S8.3 | `crm-settings-team-room` ต้องมีในซอร์ส+มีแถว | ผ่าน helper เดียวกัน (select ⇒ ต้องมีแถวเท่าเดิม) | ✅ exit 0 | ลบ `crm-settings-team-room` → ❌ `picker=false` |
| qc-crm-c3.5.mts:1489 (1485) | C3.5-S7.5 | 15 id ต้องมีแถว | กดได้/หาไม่เจอ → แถว · `inCode` ยังบังคับครบ 15 ตัวในโค้ด (วันนี้ทั้ง 15 เป็นคอนโทรล ⇒ เท่าเดิม) | ✅ exit 0 | ลบ `portal-otp-code` → ❌ `inventory=14/15` |
| qc-crm-c3.2.mts:922 (919) | C3.2-S5.1 | ≥ 12 แถว wo C3.2 ที่ page `"/"` | (มติผู้คุมงาน) page `"/"` **หรือ** `"/app/sys/[id]"` (หน้าหลักตามทะเบียนหลัง C4.1) · เกณฑ์ ≥ 12 และ wo C3.2 คงเดิม | ✅ `green-c32-qc-crm-c3.2.log` 47/47 exit 0 | ลบแถว home 1 แถวไม่ทำให้แดง (30→29 ยัง ≥ 12) ⇒ ลบ 19 แถวจนเหลือ 11 → ❌ `rows=11` (finding เดียว · `control-c32-…`) · คืน sha256 ตรง `a40bfcce…` (`c32.mutation.log`) |

หมายเหตุการรัน:
- ชุด control ทุกชุดแดง **เฉพาะ** เช็กที่ตั้งใจ (JSON_SUMMARY ของแต่ละ log มี finding เดียว = id นั้น · c3.4 = S8.1/S8.2/S8.3 สามตัว) · ยกเว้น c1.11 ที่แดงเพิ่มตามข้อถัดไป
- **c1.11 บน QC3 แดง S6.1 · S6.3–S6.9 · S7.1 ทั้งรอบเขียวและรอบ control เหมือนกัน** — สาเหตุสภาพแวดล้อม: ยูนิตของผู้คุมงานบน QC1 export `CRM_V2_SWITCH=all` แต่ `qc3.sh` ไม่ได้ตั้ง ⇒ สวิตช์ v1↔v2 ปิด (owner=404 · FORBIDDEN "ยังไม่เปิดให้สลับ") · ไม่เกี่ยวกับเช็กที่แก้ — ตัดสินเฉพาะ S9.2
- รอบเขียวแรกของ c2.2 แดง `missing=crm-seq-step-*` (`green-qc-crm-c2.2.log`): helper รุ่นแรกจับคู่ id แบบ glob อย่างเดียว ⇒ `<li data-testid={`crm-seq-step-${k}`}>` ถูกตัดสินด้วยปุ่ม `crm-seq-step-up-*` · แก้ helper ให้ id ที่ตรงเป๊ะตัดสินก่อน (glob เฉพาะเมื่อไม่มีตัวตรง) → `green2` exit 0 · fitness ไม่ใช้ `testidKind` จึงไม่กระทบ

## นอกขอบเขต (ไม่แก้ — ต่างชนิด)
- ~~C3.2-S5.1~~ → แก้แล้วตามมติผู้คุมงาน (แถวในตารางบน) · เดิม: (`scripts/qc-crm-c3.2.mts` ~บรรทัด 918 · "≥ 12 inventory rows (page \"/\", wo C3.2)") — **จะแดงเพราะ C4.1 เหมือนกันแต่คนละชนิด**: C4.1 เปลี่ยนคีย์ page ของแถวหน้า home จาก `"/"` เป็น `"/app/sys/[id]"` (ก่อน C4.1: wo C3.2 page "/" = 33 แถว · ตอนนี้ = 0 · page "/app/sys/[id]" = 30) · ไม่ใช่เรื่องคอนโทรล/ไม่ใช่คอนโทรล ⇒ ไม่ได้แก้ตามคำสั่ง "อย่าแตะเช็กชนิดอื่น" · ข้อเสนอ (ให้ผู้คุมงานตัดสิน): เทียบ `page` ด้วย `=== "/" || === "/app/sys/[id]"` · ยังไม่อยู่ในยูนิต c39fix-main จึงยังไม่เห็นแดง
- เช็กแบบ "นับจำนวนแถวตามหน้า/wo" อื่น ๆ (C1.5-S8.3 · C1.7-S7.6 · C1.9-S5.2 · C1.10-S9.1 · C2.1-S8.2 · C2.3-S6.4 · C2.8-S7.1 · C2.10-S5.1 · C2.11-S6.1 · C3.2-S5.2 · C3.3-S8.2/S8.3 · C3.6-S5.1) และเช็กแถวผี — ไม่ได้แก้ (ชนิดอื่น) · คำนวณกับทะเบียนปัจจุบันแล้วผ่านเกณฑ์ทุกตัว (C3.3-S8.3 = 3 พอดีเกณฑ์ ≥ 3)
- `scripts/qc-crm-buttons.mts` · `scripts/crm-ui-inventory.json` ไม่แตะ (แตะชั่วคราวใน positive control แล้วคืน sha256 ตรง) · qc-member/kanban/chat ไม่มีชุดไหนอ่านทะเบียน CRM
- ช่องโหว่ทะเบียนจริง: **ไม่พบ** — ตัวกดของสวิตช์ (`crm-uiversion-submit`) มีแถว wo C1.11 อยู่แล้ว

## ไฟล์
- ใหม่: `scripts/lib/crm-testid-scan.mts` (ตัวสแกน F14 + `scanTestids` · `interactiveTestidsIn` · `testidKind` · `needsRegistryRow`)
- แก้: `scripts/fitness.mts` (import แทนนิยามใน F14 · ผลเหมือนเดิมทุกไบต์) · `scripts/qc-crm-c1.11/c2.2/c2.4/c2.5/c2.6/c2.7/c3.1/c3.4/c3.5.mts`
- log: `.qc-shots/sweep41/` (green* · control* · fitness-* · typecheck.log · run-*.sh)
