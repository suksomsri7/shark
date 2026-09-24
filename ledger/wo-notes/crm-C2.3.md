# WO C2.3 — มอบหมาย lead อัตโนมัติ (Assignment rules)

> RUN "CRM v2" · worktree builder `/root/projects/shark-crm-c23` (QC3) · รวมเข้าทรีหลัก branch `session/crm` · builder รอบ 1: 20–23 ก.ย. (opus · 60/60) · ผู้ตรวจอิสระ 24 ก.ย. (11 จุด + 5 ORACLE-EDIT) · **รอบ 2: 24 ก.ย. (opus · แก้ 11 ข้อ + WARN)** · ผู้คุมงาน **Fable 5.1** · รับงาน 24 ก.ย. 2569
> สัญญา: CRM-RUN §2 C2.3 · brief C2.3 (addendum R1–R12 + ruling 24 ก.ย.) · พิมพ์เขียว §5.7 §11.5 · ภาพ 07 (ขวา)
> ข้อสอบ: `scripts/qc-crm-c2.3.mts` (**80 ข้อ** = 60 + ORACLE-EDIT 20 ข้อ 24 ก.ย. · S0 5 · S1–S6 22 · S7 7 · S8 7 · S9 3 · S10 6 · X1 6 · X3 8 · X4 3 · X8 2 · X9 3 · U 7 · CLEAN) · แก้หลัง commit: **ใช่ (S4.1 23 ก.ย. · +14 ข้อ 24 ก.ย. · S0.4 รับ facade object)**

## 1. ไฟล์ที่แตะ (13 ไฟล์ · ≈ +2,300)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/crm/assignment.ts` (916) · `assignment-shared.ts` | ใหม่ | กฎเรียงลำดับ · เงื่อนไข 6 ชนิด (sourceKind/sourceChannel/province=CONTAINS ที่อยู่ Party/companySize/**language (locale)**/`f.<key>`) · โหมด FIXED/ROUND_ROBIN (cursor คำสั่งเดียว `%n`)/TEAM_LEAD/LEAST_OPEN · ข้าม acceptingLeads=false · ลา (snapshot ก่อน tx · ใน tx ไม่ยืมคอนเนกชัน) · ไม่มี membership · ชนเพดาน `maxOpenPerUser` · ผู้รับสำรอง · NOBODY → ไม่มีเจ้าของ + แจ้ง OWNER/MANAGER 1 ครั้ง/คน · `simulate` (รับ address/companySize/fields) · `pageData` (ประตู `crm.assignment.manage` · ฟิลด์เฉพาะ `!isSystem && !sensitive` · `onLeave` เฉพาะผู้มี `hr.leave.read` · ไม่มีอีเมล · คิวผ่าน visibleWhere) · `teamStampOf` ปั๊ม teamId เฉพาะสมาชิกทีมจริง · advisory lock ต่อระบบ · `openLoadOf` ไม่อยู่บน facade |
| `contacts.ts` (บล็อก C2.3 ×10) | แก้ | `pick` ใน tx ของการสร้าง (เส้นทางอัตโนมัติเท่านั้น: ไม่มีผู้สร้างมนุษย์ / `ownerUserId:"auto"`) · `locale` เข้า draft + คอลัมน์ · v1 เหมือนเดิมทุกไบต์ |
| `settings.ts` (บล็อก C2.3) · `index.ts` · `nav.ts` · `layout.tsx` | แก้ | `settings.crm.assignment.fallbackUserId` jsonb คำสั่งเดียว · facade · ทะเบียนหน้า · ลิ้นชัก (ในบล็อก v2) |
| `src/app/app/sys/[id]/crm/settings/assignment/{page,actions}.ts(x)` · `src/components/crm/assignment/{CrmAssignmentManager,types}.tsx` | ใหม่ | หน้าตั้งค่า (ภาพ 07 ขวา) · testid มี `-${idx}` · `simMax` จากค่าคงที่ · ข้อความไทยบอกสิ่งที่การทดลองไม่ครอบ |
| `scripts/crm-ui-inventory.json` (+40) · `visual-crm.mts` (spec "2.3") · `qc-crm-c2.3.mts` | แก้ | |

## 2. migration / seed / backfill — ไม่มี (`CrmAssignmentRule` มาจาก C2.0)

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด · เคยแดง | ✅ | 59/60 รอบแรก (S4.1) · 64/71 หลัง ORACLE-EDIT (7 ข้อแดงจนกว่า builder แก้) |
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ✅ | `c22c23-verify2.log`: `qc-crm-c2.3` **80/80** (รอบ 3) · รอบ 2 74/74 |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ✅ | §5 — 17 ชุดเขียว (c1.4 110 · c1.7 · c1.8 81 · c1.11 66 · hr-leave-booking 14 · form 10 · forms-notify …) |
| D5 | typecheck · fitness ×2 | ✅ | typecheck exit 0 · fitness 32/32 · noenv 32/32 |
| D6 | build | ✅ | BUILD+serve exit 0 · shots ออกครบ |
| D7 | ภาพ + PARITY | ✅ | §6 (Fable ดูเอง) |
| D8 | testid + ทะเบียน | ✅ | +40 แถว (pattern `-*` 3 แถว) · S6.4 นับจำนวน render · F14.1/F14.2 |
| D9 | ผู้ตรวจอิสระ | ✅ | รอบ 1: 11 จุด → แก้ครบ (`c23-r2/`) · **รอบ 2 (ผู้ตรวจของผู้คุมงาน)**: ยืนยัน 11 ข้อแก้จริง + พบ BLOCKER 3 / SHOULD-FIX 5 / NOTE 3 → **รอบ 3 แก้ครบ 10 ข้อ** (`c23-r3/` · before/after ทุกข้อ · 80/80 · c1.4 110 · c1.7 57 · c1.8 81 · form 10 · forms-notify 9 · chat-core-v2 47) |
| D10 | เอกสาร/ทะเบียน | ✅ | ไม่มี event ใหม่ (`crm.contact.assigned` เดิม + ruleId/teamId) · ไม่มี op ใหม่ (C2.11) |
| D11 | wo-notes + คืนสภาพ | ✅ | `qc-member-m1.9` 26/26 หลังทั้งชุด |
| D12 | push → deploy | ⏳ | รอเจ้าของ push |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 | ใช้ | `X1.1–X1.6` (กฎอ้างคน/ทีมร้านอื่นไม่ได้ · ผู้รับต้องมองเห็นเรคคอร์ด · `S9.1` ปั๊ม teamId คนนอกทีมไม่ได้) |
| X2 | N-A | REST/AI → C2.11 |
| X3 | ใช้ | `X3.1–X3.8` (20 ทาง/4 คน = 5 คนละ · LEAST_OPEN ไม่เกินเพดาน · **RR + เพดาน 10 ทาง = 2/คน · 8/2 NOBODY · cursor ∈ [0,n)**) |
| X4 | ใช้ | `X4.1–X4.3` |
| X5 | N-A | ไม่มีงานตามเวลา |
| X6 | N-A | เงื่อนไขเป็น enum/คีย์ที่ validate · ไม่มี URL/ไฟล์ |
| X7 | N-A | ไม่มี |
| X8 | ใช้ | `X8.1–X8.2` + `S8.3/S8.4/S8.5` (label ฟิลด์ลับ · การลา · อีเมล ไม่หลุด) |
| X9 | ใช้ | `X9.1–X9.3` (แก้กฎมี audit) |
| X10 | N-A | ไม่มี |
| ร้าน uiVersion 1 | ใช้ | `U.1–U.7` (v1 ไม่เดินกฎ · `createContactFromLegacy` v1 ไม่แตะ owner · **v2 เดินกฎ + NOBODY แจ้ง 1 ครั้ง**) |

## 5. ผลข้อสอบ (unit **`crm-c22c23-verify2`** = รอบสุดท้ายหลัง C2.2 r3 + C2.3 r3 · QC1 seed ใหม่ · 24 ก.ย. 04:10–05:25 UTC · ALLDONE · 0 ❌)
- `migrate diff (must be empty)`: exit=0 · `-`
- `reseed member`: exit=0 · `-`
- `qc-member-m1.1`: exit=0 · `{"total":28,"passed":28,"findings":[]}`
- `seed crm #1`: exit=0 · `-`
- `seed crm #2`: exit=0 · `-`
- `DRAIN`: exit=0 · `{"total":4,"passed":4,"findings":[]}`
- `qc-crm-c2.2`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-c2.3`: exit=0 · `{"total":80,"passed":80,"findings":[]}`
- `qc-crm-c2.1`: exit=0 · `{"total":84,"passed":84,"findings":[]}`
- `qc-crm-c0.5`: exit=0 · `{"total":50,"passed":50,"findings":[],"unproven":[],"info":{"leaseStyle":"row lease (re-ru`
- `qc-member-fix-s3`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `qc-automation`: exit=0 · `{"total":13,"passed":13,"findings":[]}`
- `qc-crm-c1.4`: exit=0 · `{"total":110,"passed":110,"findings":[]}`
- `qc-crm-c1.6`: exit=0 · `{"total":79,"passed":79,"findings":[],"skippedChecks":[]}`
- `qc-crm-c1.7`: exit=0 · `{"total":57,"passed":57,"findings":[]}`
- `qc-crm-c1.8`: exit=0 · `{"total":81,"passed":81,"findings":[]}`
- `qc-crm-c1.11`: exit=0 · `{"total":66,"passed":66,"findings":[]}`
- `qc-crm-c2.0`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-v1`: exit=0 · `{"total":17,"passed":17,"findings":[]}`
- `qc-crm-c0.2`: exit=0 · `{"total":27,"passed":27,"findings":[]}`
- `qc-hr-leave-booking`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `qc-form`: exit=0 · `{"total":10,"passed":10,"findings":[]}`
- `qc-forms-notify`: exit=0 · `-`
- `qc-nav-functions`: exit=0 · `-`
- `probe-uiversion-gate (no env)`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `typecheck`: exit=0 · `-`
- `fitness`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `fitness-noenv`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `BUILD+serve`: exit=0 · `-`
- `shots 2.2`: exit=0 · `{"wo":"2.2","user":"owner","shots":[".qc-shots/crm/2.2/crm-sequences-owner-desktop.png",".`
- `shots 2.3`: exit=0 · `{"wo":"2.3","user":"owner","shots":[".qc-shots/crm/2.3/crm-assignment-owner-desktop.png","`
- `serve stop`: exit=0 · `-`
- `qc-member-m1.9`: exit=0 · `{"total":26,"passed":26,"findings":[]}`

(รอบก่อน `crm-c22c23-verify` 02:52 UTC: c2.2 73/73 · c2.3 74/74 · ถอยหลังชุดเดียวกันเขียวหมด)
## 6. ภาพ (D7)
visual spec "2.3" (ขยาย 24 ก.ย.: สร้างกฎ ROUND_ROBIN 4 คน ชั่วคราวแล้วคืนสภาพ 0→0) · owner เท่านั้น (thana/nok ไม่มีคีย์ = 404 ตามแบบ)
| หน้า | mockup | ภาพจริง | จอ | overflow | จุดต่างที่เห็นเอง |
|---|---|---|---|---|---|
| กฎมอบหมาย (ตาราง ลำดับ/กฎ/วิธีแจก/คนที่รับ/คิวถัดไป/จัดการ) + ผู้รับสำรอง + ทดลองดูก่อน + คิวของพนักงาน | 07 ขวา (การ์ด "มอบหมายอัตโนมัติ — Round-robin" + ชิปคน·คิว) | `.qc-shots/crm/2.3/crm-assignment-owner-{desktop,mobile}.png` | 1440/390 | ไม่มี | แบบเป็นการ์ดเล็กในหน้ากฎอัตโนมัติ · ของจริงเป็นหน้าตั้งค่าเต็มตาม brief (`/settings/assignment`) — สาระครบ: round-robin · รายชื่อ+คิว (ตาราง "คิวของพนักงาน" = ชิป "ธนา วงศ์ทอง · คิว 3") · "ใช้ทุกทางเข้า lead ใหม่" · คิวถัดไป · ข้อความบอกสิ่งที่การทดลองไม่ครอบ |
| ตัวแก้กฎ (ใหม่ + เปิดกฎจริง) | 07 ขวา | `crm-assignment-editor-owner-*` · `crm-assignment-rule-editor-owner-*` | 1440/390 | ไม่มี | ฟอร์มครบ: ชื่อ/วิธีแจก/ทีม/เพดาน/คนที่รับ (ติ๊ก+คิว)/เงื่อนไข และ-หรือ |
- `PARITY: ผ่าน` (Fable ดูเอง 24 ก.ย.) · หมายเหตุ: ก่อนขยาย spec ภาพเป็นตารางว่าง ตัดสินไม่ได้ — กติกาใหม่: visual spec ของใบที่มี "รายการ" ต้องสร้างข้อมูลตัวอย่างชั่วคราวเสมอ

## 7. ข้อแย้ง / มติ (ท้าย brief C2.3 + CRM-RUN §4)
- R1–R12 (19 ก.ย.) ยืน · ruling 24 ก.ย. 11 ข้อ: B1 การลาหลุด → ตัด `onLeave` ตาม `hr.leave.read` (rbac.evaluate · MANAGER ยังเห็นตาม mockup) · S2 `language` ตายสนิท → locale ผ่านเส้นทางจริง · S1/S3/S4/S5/S6/S7/S8/S10/NOTE1 ตามรายการ · S9 lock ต่อระบบ (แข็งกว่าสัญญา) รับ · `actions.ts` ในโฟลเดอร์ route รับ · `setCrmAssignmentKey` ตัวเขียนที่สอง รับ
- **Fable 24 ก.ย.**: `leaveSnapshot` กลืน error เงียบ → ต้อง WARN (แก้แล้ว) · ไม่ส่ง `leaveGaps` ออกจาก `pick` · simulate รับค่าพิมพ์ได้
- ORACLE-EDIT 14 ข้อ + S0.4 (facade object แทน namespace เพราะ namespace ซ่อนสมาชิกไม่ได้)
- **รอบ 3 (Fable · ท้าย brief "ruling round 3")**: B1-bis สถานะลารั่วผ่าน `nextUserId`/ทดลอง → `Env.ignoreLeave` สำหรับผู้ดูไม่มี `hr.leave.read` + ข้อความบอกว่าไม่คิดวันลา (`crm-assign-leave-note`) · B2 สะพานไม่ส่ง locale → `chat.ts` ใช้ `ChatContact.lang`/`meta.lang` · `forms.ts` ใช้คำตอบ `locale/language/ภาษา` (ฟอร์มไม่มีคอลัมน์ภาษา = หนี้ C2.6) · B3 `BridgeLeadInput.fields` → custom (คีย์ไม่รู้จักถูกทิ้ง ไม่ทำลีดตก) · S1 `f.<ลับ/ระบบ>` ถูกปฏิเสธตอนบันทึกกฎ · S2 คนนอกทีมปิดรับ = ข้าม · S3 ร้านไม่มีกฎ = ไม่แจ้ง NOBODY · S4 ผู้รับสำรองต้องมี `crm.contact.read` · S5 mutation ทุกตัว + audit ใน tx เดียว (`auditInTx` แบบ C1.7) · N3 คอมเมนต์/expect.target/BCP-47 · ORACLE-EDIT S10.1–S10.6 + S8.4 (ห้ามคีย์ที่มีคำว่า leave) → **80 ข้อ**

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ฟอร์มสาธารณะไม่มีช่อง "ภาษา" ระดับ FormDef (วันนี้อ่านจากคำตอบ locale/language/ภาษา เท่านั้น) · การแมปคำตอบฟอร์ม → custom field (`f.<key>` บนลีดจากฟอร์ม) | โมเดล/สะพานฟอร์มเป็นของ C2.6 | C2.6 |
| S4 residual: คน/กฎที่เพิ่มระหว่าง snapshot กับ tx ถูกนับว่า "ไม่ลา" · candidate >300 = WARN | ต้อง harness ~100 ลีด | C5 |
| R9 multi-HR (`hr.isOnLeave` ระบบแรกเท่านั้น) | นอกขอบเขต | backlog |
| กฎ `f.phone` ที่เคยบันทึกไว้ยังไม่แมตช์ (UI ไม่เสนอแล้ว) | engine ตาม R6 | — |

## 9. คืนสภาพ QC — ร้านชั่วคราว `qc-c23-*` · CLEAN · `qc-member-m1.9` 26/26 หลังทั้งชุด (verify2)
