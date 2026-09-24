# WO C2.1 — Automation scope CRM + ตัวรันแอ็กชันร่วม (มติ C18)

> RUN "CRM v2" · worktree `/root/projects/shark-crm` · branch `session/crm` · builder 19–20 ก.ย. บน QC2 (`shark-crm-c20`) · ผู้ตรวจอิสระ 20 ก.ย. · รวมเข้าทรีหลัก 23–24 ก.ย. (`df817c9a`) · **รับงาน 24 ก.ย. 2569 · ผู้คุมงาน Fable 5.1** (ต่อจาก Opus 5) · builder: opus
> สัญญา: `ledger/CRM-RUN.md` §2 C2.1 · ใบสั่ง `ledger/crm-briefs/crm-brief-C2.1.md` (+ Controller addendum 19 ก.ย. 7 ข้อ) · พิมพ์เขียว §7.3 · ภาพ `ledger/design-crm/07-automation-sequence.png` (บน)
> ข้อสอบ: `scripts/qc-crm-c2.1.mts` (**84 ข้อ** = S 30 · X 26 · U 6 · R/CLEAN 22) · แก้หลัง commit: **ใช่** — ORACLE-EDIT `C2.1-X4.4` (20 ก.ย. ดู §7)

## 1. ไฟล์ที่แตะ (37 ไฟล์ · +3,869/−221 ใน `df817c9a`)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/automation/action-runner.ts` | ใหม่ (383) | ตัวรันร่วม: `executeActions` · `runDueWaits` · `eventKeyOf` · `WAIT_LEASE_MS` + `SubjectAdapter` — **ย้าย**โค้ด wait/lease/send ออกจาก journeys (ไม่มีสำเนาที่สอง) |
| `src/lib/modules/member/journeys.ts` | แก้ (−228 สุทธิ) | move-only: กลายเป็น adapter `customer` · export/arity ตาม JOURNEY_BASELINE เดิมทุกตัว |
| `src/lib/modules/crm/automation.ts` · `automation-shared.ts` | ใหม่ (1,619 · 291) | กฎ scope=CRM + `crmSystemId` · trigger `crm.*`/`custom.record.*` + cron 5 · เงื่อนไข `c.` `co.` `d.` `f.{key}` `o.{objectKey}.{fieldKey}` · แอ็กชัน 14 + CREATE_DEAL · กฎเริ่มต้น 6 (ปิดโดยปริยาย) · dry-run · โควตาต่อร้าน · loop-guard · run log |
| `src/lib/automation/engine.ts` | แก้ | สาขา CRM (แบบเดียวกับที่ delegate ไป kanban) |
| `src/app/app/sys/[id]/crm/settings/automation/{page,actions}.ts(x)` | ใหม่ | หน้า `/settings/automation` (ประตู `crm.automation.manage` · 404 สำหรับ STAFF) |
| `src/components/crm/automation/CrmAutomationBuilder.tsx` · `types.ts` · `src/components/automation/SentenceParts.tsx` · `kanban/AutomationBuilder.tsx` | ใหม่/แก้ | ตัวสร้างกฎประโยคไทย — แยกชิ้นส่วนร่วมจาก K2.9 แบบ move-only (K2.9 ยังเขียว) |
| `src/lib/platform/minute-jobs.ts` · `src/lib/outbox-consumers.ts` · `crm/index.ts` · `crm/nav.ts` | แก้ | งานรายนาที CRM (eager) · consumer · facade · ทะเบียนหน้า |
| `src/app/app/layout.tsx` | แก้ (+4) | **ACCEPTANCE-FIX** ต่อเมนู "กฎอัตโนมัติ" เข้าลิ้นชัก (ดู §7) |
| `scripts/fitness.mts` | แก้ | ข้อยกเว้น `CRM_DEEP_ALLOWED` เฉพาะ `engine.ts → crm/automation` (มติ 20 ก.ย.) |
| `scripts/crm-ui-inventory.json` | แก้ (+51) | ทะเบียน testid ของหน้ากฎ |
| `scripts/qc-crm-c0.2.mts` · `qc-crm-c0.5.mts` · `qc-crm-c2.1.mts` · `qc-crm-c2.3.mts` | แก้ | ORACLE-EDIT (ดู §7) |
| `scripts/qc-owner-guard.mts` · `seed-*.mts` · `visual-crm.mts` · `scripts/pending/*` | ใหม่/แก้ | ด่านกัน reseed QC1 จาก worktree อื่น · ภาพ spec `"2.1"` · สคริปต์ตรวจ/probe ของผู้คุมงาน |

## 2. migration / seed / backfill
- ไม่มี migration (คอลัมน์ `AutomationRun.crmContactId` + partial unique มาจาก C2.0 แล้ว) · seed ไม่เปลี่ยน (ข้อสอบใช้ร้านชั่วคราว `qc-c21-*` ทั้งหมด) · ไม่มี backfill

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบเขียนก่อนโค้ด · เคยแดง | ✅ | ข้อสอบ commit 19 ก.ย. (`5e9c5f9d` และก่อนหน้า) · builder รอบแรก 83/84 (X4.4 แดง → ORACLE-EDIT) |
| D2 | เขียวเมื่อผู้คุมงานรันเองหลัง reseed | ✅ | `c21-verify3.log`: `qc-crm-c2.1` **`{"total":84,"passed":84}`** บน QC1 seed ใหม่ (reseed member → m1.1 → seed crm ×2 → DRAIN) |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ✅ | §5 — 13 ชุดเขียว (ยอมรับ 1 ข้อคลาส E ที่จำแนกแล้ว) |
| D5 | typecheck · fitness ×2 | ✅ | `typecheck exit=0` · `fitness` 32/32 · `fitness-noenv` 32/32 |
| D6 | build | ✅ | `BUILD+serve exit=0` · พอร์ต 3215 ตอบ HTTP 200 (unit `crm-c21-verify3`) |
| D7 | ภาพ + PARITY | ✅ | §6 — ผู้คุมงาน (Fable) เปิดดู 4 ใบเทียบ mockup 07 บน เอง |
| D8 | testid + ทะเบียน | ✅ | `crm-ui-inventory.json` +51 · F14.1/F14.2 ใน fitness 32/32 · `qc-nav-functions` **11/11** (หลัง ACCEPTANCE-FIX) |
| D9 | ผู้ตรวจอิสระ | ✅ | 20 ก.ย.: ไม่มี BLOCKER · SHOULD-FIX 4 (loop-guard ระดับผู้ติดต่อ · cron ติด 500 แถวแรก · WAIT ของระบบที่กลับเป็น v1 · คำเตือนไทยเมื่อไม่มีตัวจับเวลา) → builder แก้ครบ · ผู้ตรวจยืนยัน journeys สมาชิก/บอร์ดงาน/ร้าน v1 เหมือนเดิม |
| D10 | เอกสาร/ทะเบียน | ✅ | ไม่มี event/op ใหม่ · fitness F13.x เขียว |
| D11 | wo-notes + คืนสภาพ QC | ✅ | ไฟล์นี้ · `qc-member-m1.9` `{"total":26,"passed":26}` |
| D12 | push main → deploy | ⏳ | รอ push (เติม hash + `dpl_` หลัง deploy READY) |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | check ids / เหตุผล |
|---|---|---|
| X1 ขอบเขต | ใช้ | `C2.1-X1.1–X1.4` (กฎของระบบ A ไม่ยิงให้ B/ร้านอื่น · แอ็กชันเล็งขั้น/คน/บอร์ดนอกร้านไม่ได้ · STAFF ไม่มีคีย์ = 404) |
| X2 API/AI | N-A | REST/AI ของกฎ → C2.11 |
| X3 ยิงพร้อมกัน | ใช้ | `C2.1-X3.1–X3.4` |
| X4 ส่งซ้ำ | ใช้ | `C2.1-X4.1–X4.5` (event เดิม 2 รอบ/พร้อมกัน = run เดียวต่อกฎ · event ไม่มีผู้ติดต่อก็ dedupe — addendum ข้อ 6) |
| X5 จองแถวตามเวลา | ใช้ | `C2.1-X5.1–X5.3` (`runDueWaits` ซ้อน → resume ครั้งเดียว · ตายหลังจอง → resume หลัง lease) |
| X6 ข้อมูลเข้าอันตราย | ใช้ | `C2.1-X6.1–X6.4` (WEBHOOK ไป 127.0.0.1/169.254.169.254/localhost ถูกปฏิเสธ · ตัวแปรเทมเพลต escape) |
| X7 endpoint สาธารณะ | N-A | ไม่มี endpoint สาธารณะในใบนี้ |
| X8 PDPA | ใช้ | `C2.1-X8.1–X8.3` (consent ตรวจตอนส่งจริง · ถอนระหว่าง WAIT ⇒ SKIPPED เหตุผลไทย) |
| X9 การกระทำอันตราย | ใช้ | `C2.1-X9.1–X9.3` (เปิด/ปิด/ลบกฎมี audit · โควตาบังคับ) |
| X10 ความลับ/ไฟล์ | N-A | ไม่มีไฟล์/secret ใหม่ |
| ร้าน uiVersion 1 | ใช้ | `C2.1-U.1–U.6` (กฎ CRM ไม่ทำงานบนร้าน v1 · แถว WAIT เก็บไว้ · กลับเป็น 2 แล้วเดินต่อ — R-E.14) |

## 5. ผลข้อสอบ (จาก `.qc-shots/crm/c21-verify3.log` · unit `crm-c21-verify3` · QC1 · 24 ก.ย. 00:38 UTC)
- `migrate diff` จากฐาน QC1 = ว่าง · reseed member → `qc-member-m1.1` 28/28 → seed crm ×2 → DRAIN — ทุกขั้น exit 0
- `qc-crm-c2.1`: `JSON_SUMMARY {"total":84,"passed":84,"findings":[]}`
- `probe-c21-builder`: 14/14 (สคริปต์พิสูจน์ของผู้คุมงาน: dedupe event ไม่มีผู้ติดต่อ · loop-guard · quota)
- regressions: `qc-automation` 13/13 · `qc-kanban-k2.9` **25/26** (`K2.9-S11.7` = ข้อภาพอ่าน `.qc-shots/kanban/2.9` ที่ถูกลบตอนเคลียร์ดิสก์ — คลาส E ตาม `ledger/crm-c1-close-reds.md` · addendum ข้อ 1 ยอมรับ) · `qc-member-fix-s2` 25/25 · `qc-member-fix-s3` 14/14 · `qc-crm-c1.8` 81/81 · `qc-crm-c1.11` 66/66 (รวม `qc-crm-v1` ลูก) · `qc-crm-c2.0` 73/73 · `qc-crm-v1` 17/17 · `qc-crm-c0.2` **27/27** · `qc-nav-functions` 11/11 · `probe-uiversion-gate` (ไม่ตั้ง env) 14/14
- `typecheck` exit 0 · `fitness` 32/32 · `fitness-noenv` 32/32
- `BUILD+serve` exit 0 · `shots 2.1` exit 0 (4 ใบ) · `serve stop` exit 0 · `qc-member-m1.9`: `JSON_SUMMARY {"total":26,"passed":26,"findings":[]}` · `ALLDONE`

## 6. ภาพ (D7)
คำสั่ง: `bash scripts/acc-v2-serve.sh` → `pnpm exec tsx scripts/visual-crm.mts 2.1` (ใน unit verify3 · owner เท่านั้น — thana/nok ไม่มีคีย์ `crm.automation.manage` = 404 ตามแบบ X1.4 · manager ใช้หน้าเดียวกับ owner)
| หน้า | mockup | ภาพจริง | ผู้ใช้ | จอ | overflow | จุดต่างที่เห็นเอง |
|---|---|---|---|---|---|---|
| รายการกฎ + ชิปโควตา + บันทึกการทำงาน | 07 บน (ซ้าย-ล่าง) | `.qc-shots/crm/2.1/crm-automation-owner-desktop.png` | owner | 1440 | ไม่มี | mockup มีกฎ 5 ข้อ+สถิติ · ของจริง "0 กฎ" เพราะ seed ไม่ apply กฎเริ่มต้น (ปุ่ม "ใช้กฎเริ่มต้น 6 กฎ" มีตามแบบ) · มีแถบเตือน "ตัวจับเวลาของระบบยังไม่ทำงาน" (มติผู้ตรวจ 20 ก.ย.) ซึ่ง mockup ไม่มี — ตั้งใจ |
| เดียวกัน | 07 บน | `…owner-mobile.png` | owner | 390 | ไม่มี (แถบแท็บ CRM เลื่อนแนวนอนตามแบบเดิมตั้งแต่ C1.x) | ปุ่ม "ใช้กฎเริ่มต้น"/"สร้างกฎใหม่" ตกบรรทัดใหม่ — อ่านได้ |
| ตัวสร้างกฎประโยคไทย (เมื่อ / และถ้า / ให้ทำ + ทดลองรัน · ยกเลิก · บันทึกกฎ) | 07 บน (การ์ด "กฎใหม่") | `…builder-owner-desktop.png` | owner | 1440 | ไม่มี | ตรงแบบ: ชิป เมื่อ/และถ้า/ให้ทำ · "+ เพิ่มเงื่อนไข" · "+ เพิ่มการกระทำ (19 ชนิด)" (แบบเขียน 12 · ของจริงตามสัญญา 14+CREATE_DEAL+…) · ช่องชื่อกฎ · 3 ปุ่มท้าย |
| เดียวกัน | 07 บน | `…builder-owner-mobile.png` | owner | 390 | ไม่มี | select ยาวถูกตัดด้วย ellipsis ("เกิน n") — ยอมรับ |
- `PARITY: ผ่าน` — โครง/ลำดับ/ปุ่มครบตามแบบ · ต่างเฉพาะข้อมูลตัวอย่างและแถบเตือนที่ตั้งใจเพิ่ม · หนี้: ภาพรายการกฎแบบมีข้อมูล (หลัง apply กฎเริ่มต้น) ถ่ายตอน CP2

## 7. ข้อแย้ง / มติ (ทั้งหมดบันทึกใน `ledger/CRM-RUN.md` §4 แล้ว)
- **ORACLE-EDIT `C2.1-X4.4`** (20 ก.ย.): Prisma + pg adapter โยน P2010 และรหัส Postgres อยู่ที่ `meta.driverAdapterError.cause.originalCode` ไม่ใช่ `meta.code` · DB ปฏิเสธแถวซ้ำจริง (23505) — ข้อสอบอ่านผิดที่
- มติ 20 ก.ย. ต่อข้อเสนอ builder: กันวน 60 วิ แบบ K2.9 (รับ) · ข้อยกเว้น fitness `CRM_DEEP_ALLOWED` เฉพาะ engine.ts → crm/automation (รับ) · คีย์ cron: overdue ต่อกิจกรรม · stale ต่อช่วงเงียบ · score ต่อการอัปเดต (รับ) · `journeyId = ruleId` ในแถว run ของ CRM (รับ · ผู้ตรวจยืนยันฝั่งสมาชิกไม่อ่านเห็น)
- **ORACLE-EDIT `C0.2-S4.2` + `C0.2-S4.3`** (24 ก.ย.): คอมเมนต์อธิบาย `CRM_DEEP_ALLOWED` ดันบล็อกกฎ F2.3 หลุดหน้าต่าง 600 ตัวอักษรของข้อสอบ — พิสูจน์ด้วยไฟล์ล่อ 2 ตัวว่ากฎยังจับจริง แล้วแก้ข้อสอบให้ยึด `const CRM_SELF_DIRS`
- **ORACLE-EDIT `C0.5-S4.4/S4.5a/S4.5b`** (24 ก.ย.): `qc-crm-c0.5.mts` ตั้ง `QC_ENV_FILE=".env.qc"` ตายตัว ⇒ แดงบน QC2/QC3 โดยไม่เกี่ยวกับโค้ด — แก้เป็น `process.env.QC_ENV_FILE || ".env.qc"`
- **ACCEPTANCE-FIX (ผู้คุมงาน · 3 บรรทัด ใน `layout.tsx`)**: หน้า `/crm/settings/automation` ขึ้นทะเบียน `status:"ready"` ใน `crm/nav.ts` แต่ไม่ได้ต่อเข้าลิ้นชักเมนู ⇒ ผู้ใช้เข้าหน้าไม่ได้ถ้าไม่พิมพ์ URL · `qc-nav-functions` S5 จับได้ (ข้อสอบ C2.1 ไม่จับ · builder C2.2/C2.3 รายงานตรงกันโดยอิสระ)
- 🔴 ผู้ตรวจ 20 ก.ย.: **ไม่มีตัวรันรายชั่วโมง/รายวันบน prod จนกว่า C6.1 ติด crontab** ⇒ ห้ามเปิด v2 ให้ร้านนำร่องก่อน C6.1 (ขั้น WAIT และกฎตามเวลาจะเงียบ) · หน้าตั้งค่ากฎแสดงคำเตือนไทยเมื่อตัวจับเวลาไม่ทำงาน

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| SEND_EMAIL จากกฎ = SKIPPED พร้อมเหตุผลไทย (ไม่มี transport) | addendum ข้อ 2 · ระบบอีเมลมา C2.5 | C2.5 |
| `crm.activity.overdue` เป็น cron trigger | addendum ข้อ 4 | C2.10 |
| crontab รายนาที/รายชั่วโมง/รายวันบน prod | ยังไม่ติด | C6.1 |
| `qc-kanban-k2.9` S11.7 + `qc-member-m3.10` S4.3 อ่านภาพที่ถูกลบตอนเคลียร์ดิสก์ | คลาส E (ไม่ใช่ของใบนี้) | ปิดเฟส C2 (ถ่ายภาพชุดเดิมคืน) |
| ข้อสอบข้อ `C0.2-S3.6` เคยแดง (0 ผู้ติดต่อ CRM ที่มี partyId) เมื่อ m1.1 ล้างข้อมูล | ต้นเหตุ = ลำดับ m1.1 · แก้ลำดับแล้ว = 27/27 | ปิดแล้ว |

## 9. คืนสภาพ QC
- ข้อสอบใช้ร้านชั่วคราว `qc-c21-*` ทั้งหมด · CLEAN เขียว · `qc-member-m1.9` 26/26 หลังทั้งชุด (30/15/10/5 คงเดิม) · `crm-expected.json`/`member-expected.json` revert แล้วก่อน commit
- 🔴 บทเรียนถาวรจากใบนี้ (ดู CRM-RESUME §1): `qc-member-m1.1` รัน seed ซ้ำเอง ⇒ ต้องอยู่หลัง reseed member และก่อน seed CRM เท่านั้น · ห้ามแก้สคริปต์ที่ unit กำลังรัน · `qc-owner-guard` กัน reseed QC1 จาก worktree อื่น
