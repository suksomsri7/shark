# WO S2.16 + S2.23 — backoffice เคส (H3/H4) + คิวเลขา (G5)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-b` branch `wip/sec-s2.16` · 2026-11-05 UTC · builder: เลน b
> สัญญา: `ledger/secretary-briefs/sec-brief-S2.16.md` (+ COMMON + RESOLUTIONS R-K12 · §K · §L.2 · §O)
> ภาพ `ledger/design-secretary/sec-h.jpg` หน้า 3–4 (H3/H4) · `sec-g.jpg` หน้า 5 (G5) — เว็บ backoffice ใช้ component เดิม (ไม่ใช่ Airy · ไม่ต้องมีภาพคู่)
> ข้อสอบ: `scripts/qc-sec-s2.16.mts` (7 ข้อ · commit test 5c3d97255 · **builder ไม่แก้** · ORACLE-EDIT 2 ข้อ ดู §7)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม? |
|---|---|---|---|
| `src/lib/platform/secretary-ops.ts` | ใหม่ | listQueue · retryJob · cancelJob · costByTenant · tenantsAtAssistCap · roomForSupport · moneyOfMicro | – |
| `src/lib/platform/support.ts` | แก้ (เพิ่ม hunk) | listCasesForPlatform · caseTabCounts · isUrgentCase · suspend/resumeTenantSecretary · tenantSecretarySuspendedAt · platformUserBrief · ด่าน role ใน assignCase | ✅ COMMON §D (ชื่ออยู่ใน brief) |
| `src/app/backoffice/cases/page.tsx` | เขียนใหม่ | H3 แท็บ/ตัวกรอง/ป้าย "!" | – |
| `src/app/backoffice/cases/labels.ts` | ใหม่ | ป้ายไทย (สถานะ/ช่องทาง/หมวด) + เลขเคส | – |
| `src/app/backoffice/cases/[id]/page.tsx` | แก้ | H4 รับเรื่อง · ระงับ/ยกเลิกระงับ · เปิดร้าน · ห้องแนบ · ตอบ | – |
| `src/app/backoffice/secretary/{page,AutoRefresh,RoomReadOnlyView}.tsx` · `rooms/[id]/page.tsx` | ใหม่ | G5 + ห้องอ่านอย่างเดียว | – |
| `src/app/backoffice/ai-quality/page.tsx` | แก้ (1 ส่วน) | ส่วน "เรื่องแจ้ง เลขาทำผิด ที่ยังไม่ปิด" (brief สั่ง · ไฟล์ไม่อยู่ใน Files you own — DEVIATION) | – |
| `src/app/backoffice/page.tsx` | แก้ (ลิงก์ 2 อัน) | ทางเข้า "เรื่องแจ้ง" + "คิวเลขา" (ไม่ใช่ FINANCE) — DEVIATION เล็ก | – |
| `docs/modules/31-secretary.md` | แก้ | §5.21 S2.16 · §5.28 ใหม่ · §6 แถวลองใหม่/ยกเลิก | – |

## 2. migration / seed — ไม่มี (ใช้คอลัมน์ของ S1.1 · AiSettings/PlatformAuditLog/OpsEvent เดิม)

## 5. ผลข้อสอบ
- forced #1 / #2 / unforced (ไฟล์ที่ commit · `secretary-ops.ts` มีแล้ว ⇒ unforced ก็รันเต็ม): ทั้ง 3 รอบ Q-1 ✅ Q-2 ✅ Q-3 ✅ แล้ว **CRASH exit 1** ที่ fixture กลุ่ม C (`Unique constraint failed on (tenantId, caseNo)`) — ไม่มี JSON_SUMMARY · residue 0 (`tenants 0 · platformUsers 0 · users 0` ตรวจหลังรัน)
- สำเนาชั่วคราวที่แก้แค่ fixture caseNo (ORACLE-EDIT C-1 · ไม่ commit · ลบแล้ว): `JSON_SUMMARY {"total":7,"passed":6,"failed":["C-2"],"skipped":[],"findings":[{"id":"C-2","sev":"CRITICAL"}]}` (C-2 = ORACLE-EDIT ข้อ 2)
- fitness: มี env `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` exit 0 · `env -u DATABASE_URL -u DIRECT_URL` 53/53 exit 0 · pre-commit fitness ✅
- คำสั่ง: `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s2.16.mts`
- regressions (forced · ก่อน=หลัง): qc-backoffice 14/14 · qc-support 12/12 · qc-support-ai 7/7 · qc-help-v2 8/8 · qc-sec-s1.17 10/10 · qc-sec-s1.5 16/16 (ก่อนแก้ ทุกชุดเขียวเท่ากัน)
- typecheck (web · iso 8192/9500M): 0 error

## 7. ข้อแย้ง / มติทางเทคนิค
- **ORACLE-EDIT S2.16-C-1 (fixture ผิด · CRASH):** `mkCase` สร้าง SupportCase 3 แถวในร้านเดียวโดยไม่ตั้ง `caseNo` ⇒ ค่าปริยาย 0 ชน `@@unique([tenantId, caseNo])` แถวที่ 2 ⇒ ข้อสอบล้มทั้งไฟล์ (P2002) ก่อนถึง C-1 · hunk: `const mkCase = (subject, extra) => prisma.supportCase.create({ data: { tenantId: tid, openedByUserId: U.owner, subject, ...extra } as never });` → `let cn = 0; const mkCase = (subject, extra) => prisma.supportCase.create({ data: { tenantId: tid, openedByUserId: U.owner, subject, caseNo: ++cn, ...extra } as never });` · รันสำเนาชั่วคราว (ลบแล้ว ไม่ commit) ด้วย hunk นี้: Q-1..3 ✅ C-1 ✅ C-2 ❌ (ข้อถัดไป) D-1/2 ✅
- **ORACLE-EDIT S2.16-C-2 (สัญญาชนกับ qc-sec-s1.17 H-4):** C-2 คาด `assignCase(...)` คืน `{ ok: true }` แต่ S1.17 (รับแล้ว · docs §5.21) คืน `boolean` และ `qc-sec-s1.17` H-4 ตรวจ `asg === true` — ทำให้ทั้งสองเขียวพร้อมกันไม่ได้ · builder คงสัญญาเดิม (`boolean` · ไม่ทำ API ที่รับแล้วพัง) + เพิ่มด่าน role · hunk ที่ขอ: `a1.ok === true` → `(a1 === true || a1?.ok === true)` และ type cast `as { ok: boolean }` → `as unknown as boolean | { ok: boolean }` · ผลจริงของ C-2 ตอนนี้: `{"a1":true,"mine":1,"eFin":"ไม่มีสิทธิ์เข้าถึงหลังบ้านแพลตฟอร์ม"}` (ส่วนที่เหลือของข้อผ่าน)
- **ระงับเลขาของร้าน:** R-K12 เขียน "setAccess ทุกโมดูล OFF" แต่ brief S2.16 (ใหม่กว่า + คำสั่งผู้คุม) สั่ง **ไม่** — รุ่นแรก = `AiSettings.afterHoursReply=false` + OpsEvent + audit + ป้าย · ทำตาม brief · docs §5.21 ขีดฆ่าบรรทัดเดิม
- **ย้อน (undo) จาก backoffice:** `undoAction` (S1.8) รับเฉพาะ `ctx.actor.kind === "member"` (ไม่มี platform actor) ⇒ ปุ่มซ่อนตาม brief + หนี้
- **เปิดร้าน:** ไม่มีระบบ impersonate ในโค้ด ⇒ ลิงก์ไป `/backoffice/tenants/<id>`
- ต้นทุน = `AiCreditTxn` USAGE (oracle ใช้ตารางนี้ · `AiUsage` ไม่มีคอลัมน์ต้นทุน)
- ทางที่เรียกโมเดลเพิ่ม: ไม่มี (ร่างคำตอบ AI = `draftCaseReply` เดิม คิดเงินผ่าน `chargePlatform` อยู่แล้ว)
- ใครได้/เสียสิทธิ์: **FINANCE เสีย** "รับเรื่อง" (assignCase throw) และไม่เห็นห้องงานที่แนบ/หน้า `/backoffice/secretary` · FINANCE ยังอ่านรายการ/รายละเอียดเคส/ตอบเคสได้เท่าเดิม · SUPPORT/SUPER_ADMIN ได้: ระงับเลขา · ลองใหม่/ยกเลิกงาน · อ่านห้องงานเลขาทุกร้าน (อ่านอย่างเดียว) · เห็นต้นทุนต่อร้าน

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| สวิตช์ "ระงับเลขาของร้าน" จริง (ปิดห้องงาน/worker/ข้อเสนอ ไม่ใช่แค่ตอบนอกเวลา) | ไม่มีคอลัมน์ `tenant.aiSuspendedAt` (ห้ามแตะ prisma ในใบนี้) | S3 |
| ปุ่มย้อนบันทึกการกระทำจาก backoffice | `undoAction` ไม่รองรับ actor ทีมงาน (ต้องมีทาง `undoAsPlatform` + R-K4/§K) | S3 |
| ระบบ impersonate "เปิดร้าน" | ไม่มีในโค้ด | S3 (ถ้าเจ้าของต้องการ) |
| ยกเลิกงานไม่แจ้งผู้สั่ง (ไม่มี push/ข้อความในห้อง) | ไม่มีสเปก | S3 |
| C-1 นับ `source=APP` แบบทั้งฐาน QC (`app.length === 2`) — มีเคส APP OPEN ไม่มีผู้รับของชุดอื่นค้าง ⇒ แดงหลอก | ข้อสอบ (ข้อสังเกต) | ผู้คุม |

## 9. คืนสภาพฐาน QC
- ข้อสอบ `finally` ลบ tenant/งาน/เคส/PlatformUser `qcs216-*` · PlatformAuditLog (append-only ไม่มี FK) ค้างตามแบบเดิมของ S1.17
