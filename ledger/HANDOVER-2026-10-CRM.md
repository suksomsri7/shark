# HANDOVER — CRM v2 (ใบ C6.4) · ต.ค. 2026

> **สถานะเอกสาร: ใกล้สุดท้าย** — เลนส่งมอบเขียนต่อจาก `ledger/HANDOVER-2026-10-CRM-DRAFT.md` แล้วตรวจทุกข้อกับ repo ณ **7 ต.ค. 2026 23:05 UTC** (`date -u`) · `session/crm` @ `d82a8796` · `origin/main` @ `f132ce21` (= โค้ดบน prod)
> งานนี้อ่านอย่างเดียว: ไม่ได้รันข้อสอบ / build / typecheck / server / สคริปต์ที่แตะฐานข้อมูล และไม่ได้อ่าน `.env*` · ทุกตัวเลขผลข้อสอบมาจากบันทึก (`ledger/**`, ข้อความ commit) ไม่ได้รันซ้ำ
> ช่องที่ขึ้น **`⏳ รอผล — ผู้คุมงานเติม`** = ผลยังไม่เกิด ห้ามอ่านว่าเสร็จ (รายการรวมอยู่ §13) · ของที่หาไม่พบจริง ๆ อยู่ §11 · สิ่งที่แก้จากฉบับร่างอยู่ §12
> ไม่มีค่ากุญแจ/โทเคน/connection string ในไฟล์นี้ — มีแต่ชื่อตัวแปร · ผู้คุมงานเป็นผู้ตรวจและ commit ไฟล์นี้

---

## 1. สรุป 1 หน้า

**CRM v2 คืออะไร** — ระบบลูกค้าสัมพันธ์รุ่นใหม่ของ SHARK ที่สร้างทับ CRM v1 ภายในโมดูลเดิม (`src/lib/modules/crm/**`, หน้า `src/app/app/sys/[id]/crm/**`) เปิดต่อ "ระบบ CRM" ด้วยค่า `settings.crm.uiVersion` (1 = หน้าเดิม · 2 = v2 · ค่าเริ่มต้น 1 — `src/lib/modules/crm/settings.ts:26`) · ณ เวลาที่เขียน ยังไม่มีบันทึกว่าระบบใดบน prod ถูกสลับเป็น 2 (ร้านนำร่องรอเจ้าของกดสวิตช์)

| กลุ่ม | สิ่งที่มี (ใบที่สร้าง) |
|---|---|
| ข้อมูลหลัก | ผู้ติดต่อ + แปลง lead + ความยินยอม (C1.4) · บริษัท (C1.3) · ดีล/pipeline/ขั้น/เหตุผลแพ้ (C1.5) · กิจกรรม/ปฏิทิน/โน้ต/ไฟล์/@mention (C1.6) · วัตถุกำหนดเอง + เทมเพลต 8 (C1.2a/b, C1.9) |
| ทีมและสิทธิ์ | สิทธิ์ 51 คีย์ (ตัวเลขตอนรับ C1.7 · ไม่ได้นับใหม่ในรอบส่งมอบ) · มองเห็น OWN/TEAM/ALL · ทีมขาย (C1.7) |
| เครื่องยนต์ขาย | อีเมล (ส่ง/รับ/เธรด/ติดตาม/unsubscribe · C2.5) · ลำดับติดตาม sequences (C2.2) · มอบหมาย lead (C2.3) · บันทึกการโทร/นามบัตร/AI (C2.4) · tracking ลิงก์/QR/shark.js/ฟอร์ม (C2.6) · คะแนน (C2.8) · automation (C2.1) · เหตุการณ์ธุรกิจ 8 โมดูล (C2.9) · ดีลนิ่ง+แจ้งเตือน (C2.10) · สะพานบัญชี/POS (C2.7) |
| ทีม/รายงาน/portal | รายงาน 8 แท็บ + export + ตั้งเวลา (C3.1) · โควตา + หน้าแรก KPI (C3.2) · คอมมิชชัน → payroll (C3.3) · AI ในหน้า + ห้องทีม (C3.4) · portal ลูกค้า B2B `/b/[slug]` (C3.5) · หน้าเชื่อมระบบ (C3.6) · มือถือ + แอปพนักงาน (C3.7) · PDPA ลบ/ส่งออก/อายุเก็บ/เพดาน (C3.9) |
| API | REST `/api/v1/crm` 122 op + AI tool 32 + manifest/OpenAPI ต่อคีย์ (C1.10 → C2.11 → C3.8) + skill `shark-crm-api` (`.claude/skills/shark-crm-api/` — gitignore · สร้างด้วย `scripts/gen-crm-api-docs.mts`) |
| ฐานงาน | facade ข้ามโมดูล (C0.2/C0.3) · ไฟล์ส่วนตัว (C0.4) · ตัวรันงานรายนาที `scripts/crm-cron.mts` (C0.5) · นโยบายปลายทางลิงก์ `/l/[code]` (C6.1-LINKPOLICY) |

**สถานะ: 51/53 (96 %) ตามตัวนับของ RUN** — ปิดแล้ว: C0–C2 ครบ · C3.0–C3.9 · C4.1–C4.4 · C5.1–C5.5 · C6.0 (ดูด main) · C6.1 (deploy 1) · C6.2 (backfill P15) · **ยังเปิด 3 ใบ**: C3.10 (ปิดเฟส C3 — เลนกำลังทำบน `wip/crm-c310`) · C6.3 (ร้านนำร่อง — รอเจ้าของกดสวิตช์) · C6.4 (ไฟล์นี้) · งานคู่ขนาน: PARITY (เทียบภาพกับ mockup 01–17) กำลังถ่าย
⚠ **ตัวนับเกิน 1**: commit `a09363c4` (27 ก.ย.) รับ "C3.3 + C2.7-fix" แล้วขยับ 35→37 = นับใบแก้ C2.7-fix เป็น 1 ใบ ทั้งที่ MASTER-PLAN §12 นับ 53 = C0 5 · C1 12 · C2 12 · C3 11 · C4 4 · C5 5 · C6 4 (ไม่มีใบ fix) ⇒ ใบตามแผนที่ปิดจริง = **50** และถ้าปิดอีก 3 ใบโดยบวกทีละ 1 ตัวนับจะไป 54/53 — ผู้คุมงานต้องเลือกวิธีรายงานตัวเลขสุดท้าย (หลักฐาน: `git log --grep='/53'` ไล่ 27→…→51) · ตัวเลขสุดท้าย: **⏳ รอผล — ผู้คุมงานเติม**

**อะไรอยู่บน prod วันนี้** (shark.in.th)

| | สถานะ ณ 7 ต.ค. ~23:00 UTC | หลักฐาน |
|---|---|---|
| โค้ด | `main` = `f132ce21` = CRM v2 ทั้งหมด (C0–C5.5) + hotfix แพลตฟอร์ม 1–5 ต.ค. + C6.0 + link policy · `session/crm` ต่างจาก `main` เฉพาะ `ledger/**`, `scripts/pending/**`, `scripts/qc-crm-buttons.mts` (ไม่มีไฟล์ใน `src/` หรือ `prisma/`) | `git diff --name-only origin/main..origin/session/crm -- src prisma` = ว่าง |
| deployment | deploy 1: `dpl_AQMM29am5Nt424reV1eu6WdFBDAd` → `dpl_GHA989HSCiYSdWyCVVSPU1mC4UaL` (11:19 UTC) · redeploy commit เดิมเพื่อรับ env สวิตช์: `dpl_7tGsv841PgskzDmW32zRPQ6mwzQC` = READY และเป็นตัวที่เสิร์ฟหน้าแรก | `wo-notes/crm-C6.1.md` §4 · `CRM-RESUME.md` บรรทัด ▶️ 22:44 / ✅ redeploy LIVE |
| migration | ครบ: `20261031000000_crm_v2_a` · `20261101000000_crm_v2_b` · `20261101000001_ai_credit_crm_assist` · `20261102000000_crm_v2_c` (ขึ้นตั้งแต่ ก.ย.) + deploy 1: `20261103000000_crm_perf_indexes` · `20261104000001_account_journal_no_sequence` · `20261104000002_account_journal_no_alloc_lock` · `20261104000003_account_journal_no_alloc_lock_v2` (11:11:17–22 UTC · 5 วินาที · `acc_jno_%` 260 ตัว) | `crm-C6.1.md` §4 |
| env ใหม่ | `CRM_V2_SWITCH_TENANTS` บน Vercel Production = tenant id ของ `siam-dive-center` (`cmtazbpjh000004lcjikxju2i`) | `CRM-RESUME.md` บรรทัด 22:40 UTC · สคริปต์ `scripts/pending/c6/vercel-env-switch.cjs` |
| ข้อมูล CRM v2 | ตาราง v2 ว่างตอน probe 08:18 UTC (CrmContact 0) · 2 ระบบ CRM ใน 1 ร้าน (`siam-dive-center`) ยังเป็น v1 · outbox `crm.*` ไม่เคยมี | `crm-C6.1.md` §1 |
| งานตามเวลา | crontab 3 บรรทัดติดตั้งแล้ว (VPS `/root/projects/shark-in-th` @ `f132ce21`) · รอบแรก 11:21 UTC งาน 6/6 ok | `crm-C6.1.md` §4 · `CRM-RESUME.md` บรรทัด 11:25 UTC |
| backfill | P15 สองตัว `--apply` แล้ว (เปลี่ยน 0 แถว) · สคริปต์ `crm-backfill-*` 6 ตัว: dry-run แล้ว **ไม่พบบันทึกการรันจริง** (§9.1) | `crm-C6.2.md` · `ledger/evidence/c62/` |

**ทางถอยบรรทัดเดียว:** ร้านนำร่องมีปัญหา → เจ้าของร้านกดสวิตช์กลับเป็นหน้าจอเดิมที่ `/app/sys/<systemId>/crm/settings` (กลับ 1 ได้เสมอแม้ไม่มี env — `src/lib/modules/crm/switch-actions.ts:29-30`) · สะพาน/consumer ทำงานผิด → `settings.crm.bridgesEnabled = false` · ข้อมูลไม่หาย (migration เพิ่มอย่างเดียว · สลับไปมาไม่ลบแถว) · **ห้ามใช้ Vercel Instant Rollback ย้อนข้าม deploy 1** หลังมีการลงบัญชีครั้งแรกใต้เลข JV แบบใหม่ — โค้ดเก่า (count+1) จะชนเลขลำดับแล้วสมุดบัญชีค้างทั้งเดือน (กฎ M2 · §7.5)

---

## 2. ตารางใบงาน

คอลัมน์ "ข้อสอบตอนรับ" = จำนวนผ่าน/ทั้งหมดของชุดข้อสอบของใบตอนรับงาน (จากบันทึก ไม่ได้รันซ้ำ) · "commit" = commit ที่รับงาน/รวม (MASTER-PLAN §12, RESUME, git log — ทุก sha ในตารางตรวจแล้วว่ามีจริงและเป็นบรรพบุรุษของ `origin/main` f132ce21) · C0–C3.9-fix ขึ้น prod ตั้งแต่ 28 ก.ย. (3677d983) · C4–C6.0 ขึ้น prod กับ deploy 1 (7 ต.ค.)

### เฟส C0 — ปรับฐาน

| ใบ | งาน | สถานะ | commit | ข้อสอบตอนรับ | ผู้ตรวจ |
|---|---|---|---|---|---|
| C0.1 | เครื่องมือ QC (visual-crm · ทะเบียนปุ่ม · F14.1/F14.2) | ✅ | b8fea3f | c1.1 26→50 ข้อ | รอบ 1: BLOCKER 1 + ควรแก้ 6 → แก้ครบ · รอบ 2: "no BLOCKERs remaining" + ของใหม่ 2 จุดปิดแล้ว (`wo-notes/crm-C0.1.md:41,82`) |
| C0.2 | facade `crm/index.ts` + ด่าน F2.3 | ✅ | 9ea28f1 | 27/27 | ORACLE-EDIT 2 รอบ (ผู้คุมงาน) |
| C0.3 | facade 6 โมดูล (บัญชี·แชท·HR·คลัง·party·approval) | ✅ | a30a0a6 (+99b99d3) | 88/88 | เจอบั๊กเงิน 1 แก้แล้ว |
| C0.4 | ไฟล์ส่วนตัว (HMAC 15 นาที) | ✅ | 55c7a07 | 72/72 | ปิดช่องลบ/อ่านไฟล์ข้ามร้าน (ของเดิมบน prod) |
| C0.5 | ตัวกระจายงานรายนาที + `crm-cron.mts` | ✅ | ad67892 | 50/50 | แก้ "ข้ามรอบครึ่งหนึ่งเงียบ" |

### เฟส C1 — โครง

| ใบ | งาน | สถานะ | commit | ข้อสอบตอนรับ | ผู้ตรวจ |
|---|---|---|---|---|---|
| C1.1 | migration `crm_v2_a` · ทีม · partyId 9 ตาราง · backfill 6 | ✅ | ab2b006 | 50/50 | ไม่มี BLOCKER |
| C1.2a | engine ฟิลด์รับ objectKey (ทางลูกค้าเหมือนเดิมทุกไบต์) | ✅ | 479fbd7 | 91/91 (G1 14/14) | ปิดทางเขียนคอลัมน์ที่มีกฎธุรกิจ |
| C1.2b | วัตถุกำหนดเอง + เทมเพลต 8 | ✅ | a7a7bce | 93/93 | ชื่อเรคคอร์ดรั่วค่าอ่อนไหว · คีย์อ่านอย่างเดียวเขียนได้ → แก้ |
| C1.3 | บริษัท | ✅ | 4f8af9d | 89/89 | BLOCKER (บริษัทผูกตัวตน "คน") → แก้ · PARITY 18 ภาพ |
| C1.4 | ผู้ติดต่อ + แปลง lead + ความยินยอม | ✅ | 919e7d6 | 110/110 | BLOCKER PDPA (opt-out หายตอนแปลง/รวม) → แก้ |
| C1.5 | ดีล + pipeline + ขั้น + เหตุผลแพ้ | ✅ | a7312fb | 103/103 | SHOULD-FIX 12 → แก้ · ปิดเหตุ v2 หลุดถึงร้านจริง |
| C1.6 | กิจกรรม/ปฏิทิน/โน้ต/ไฟล์/mention | ✅ | 9b971e3 | 79/79 | BLOCKER (ชื่อบอร์ดส่วนตัวรั่ว) → แก้ |
| C1.7 | สิทธิ์ 51 คีย์ + visibility + ทีม | ✅ | 90d3043 | 57/57 | BLOCKER (ลิงก์บอร์ดร้าน v1) → แก้ |
| C1.8 | เหตุการณ์ + สะพาน (ฟอร์ม/แชท/บัญชี/สมาชิก/อนุมัติ) | ✅ | 526895b | 81/81 | lead หาย/ซ้ำเมื่อสะดุด → retry |
| C1.9 | UI วัตถุกำหนดเอง | ✅ | b01b3b72 | 45/45 | BLOCKER (เขียนฟิลด์อ่อนไหวไม่ได้) → แก้ |
| C1.10 | REST 63 op + AI 14 tool + หน้าตั้งค่า API | ✅ | 41c8d2a0 | 66/66 | BLOCKER (AI เห็นค่าอ่อนไหว) → แก้ |
| C1.11 | มือถือ · แผงแชท · นำเข้า/รวม · สวิตช์ v1↔v2 | ✅ | 02ba30bc | 66/66 + v1 17/17 | ไม่มี BLOCKER · ปิดเฟส C1 (qc:all 305/345) |

### เฟส C2 — เครื่องยนต์ขาย

| ใบ | งาน | สถานะ | commit | ข้อสอบตอนรับ | ผู้ตรวจ |
|---|---|---|---|---|---|
| C2.0 | migration `crm_v2_b` (604 บรรทัด) + `ai_credit_crm_assist` | ✅ | 965c0bbd | 73/73 | additive ล้วน |
| C2.1 | ตัวรันแอ็กชันร่วม + automation scope CRM | ✅ | d3e58043 | 84/84 | PARITY ผ่าน · ORACLE-EDIT 3 |
| C2.2 | ลำดับติดตาม (sequences) | ✅ | a0161f65 | 73/73 | 2 รอบ + builder 3 รอบ (บั๊กจริง 4) |
| C2.3 | มอบหมาย lead | ✅ | a0161f65 | 80/80 | BLOCKER 3 รอบ 2 → แก้ |
| C2.4 | บันทึกการโทร + AI + นามบัตร + ปฏิทินรวม | ✅ | 7e706377 | 91/91 | BLOCKER 2 → แก้ |
| C2.5 | ระบบอีเมล | ✅ | 7e706377 | 105/105 | BLOCKER 2 → แก้ · มติ C31 |
| C2.6 | tracking + shark.js + ฟอร์ม | ✅ | b41dbfa9 | 87/87 + headless 35/35 | BLOCKER 1 → แก้ |
| C2.7 | สะพานบัญชี/POS | ✅ | b41dbfa9 | 63/63 | BLOCKER 2 (เงิน) → แก้ |
| C2.8 | คะแนนผู้ติดต่อ | ✅ | 455623ec | 54/54 ×2 | PARITY mockup 05 |
| C2.9 | เหตุการณ์ธุรกิจ 8 โมดูล | ✅ | 455623ec | 52/52 ×2 | — |
| C2.10 | ดีลนิ่ง + แจ้งเตือนพนักงาน + cron 7 งาน | ✅ | ada8cac2 | 41/41 ×2 | — |
| C2.11 | REST ชุด 2 (32 op + tool 10) | ✅ | ada8cac2 | 47/47 ×2 | ปิด consent bypass เดิม (A1) |
| ปิด C2 | qc:all | ✅ | d3856c50 | 325/355 (ENV ภาพ 25) | — |
| C2.7-fix | ลำดับ event การจ่าย + reconcile รายชั่วโมง | ✅ | ff2cb5fb / a09363c4 | 79/79 ×2 | ผู้ตรวจเงิน 4 รอบ · ⚠ ใบแก้ใบนี้ถูกนับเป็น 1 ใน 53 ตอนรับ (35→37 ที่ a09363c4 — ดู §1) |

### เฟส C3 — ทีม · รายงาน · portal

| ใบ | งาน | สถานะ | commit | ข้อสอบตอนรับ | ผู้ตรวจ |
|---|---|---|---|---|---|
| C3.0 | migration `crm_v2_c` (214 บรรทัด) | ✅ | 41c262c0 | 33/33 ×2 | additive · diff ว่างหลัง deploy |
| C3.1 | รายงาน 8 แท็บ + export + ตั้งเวลา | ✅ | 80c1269a | 56/56 ×2 | SHOULD-FIX 5 แก้ครบ |
| C3.2 | โควตา + หน้าแรก | ✅ | 684828d0 | 47/47 ×2 | 2 รอบ (BLOCKER 1 + 12) |
| C3.3 | คอมมิชชัน → payroll | ✅ | ff2cb5fb / a09363c4 | 84/84 ×2 | ผู้ตรวจเงิน 7 รอบ (BLOCKER 7) |
| C3.3-fix | นักล่าเงินหลังรวม: MAJOR 5 + race 1 | ✅ | a9523b59 | 90/90 ×2 | ผู้ตรวจเงิน 3 รอบ |
| C3.4 | AI ในหน้า + ห้องทีม | ✅ | a06a796b+0321c844+a9523b59 | 53/53 ×2 | 3 รอบ (MERGEABLE AFTER SHOULD-FIX) |
| C3.5 | portal B2B `/b/[slug]` | ✅ | c0e35025 | 67/67 ×2 | 3 รอบ (24 แก้) |
| C3.6 | หน้าเชื่อมระบบ 24 ตัว | ✅ | 4c00bf09 (รับ 37f1daaf) | 29/29 ×2 | BLOCKER 1 (SEND_LINE) |
| C3.7 | มือถือ 8 routes + แอปพนักงาน 5 จอ | ✅ | 4c00bf09+286ef7ab | 30/30 | SHOULD-FIX 5 |
| C3.8 | REST/AI ชุดสาม (op 106→122 · manifest) | ✅ | 76b0f81a | 31/31 ×2 | 2 รอบ → MERGEABLE |
| C3.9 | PDPA ลบ/ส่งออก/อายุเก็บ/เพดาน | ✅ | a0d9d531+a06a796b | 36/36 ×2 | 4 รอบ (BLOCKER 3) |
| C3.9-fix | นักล่าความปลอดภัย 12 ข้อ (BLOCKER 5) | ✅ | 0053f261 → c236a490 (prod 3677d983) | 48/48 ×2 | ACCEPTED (MASTER ยังขึ้น 🔨 — ตารางไม่ได้อัปเดต) |
| C3.10 | ปิดเฟส: qc:all บน QC1 reseed + CP3 | 🔨 กำลังปิด (เริ่ม 7 ต.ค. 11:34 UTC) | `wip/crm-c310` (ยังไม่รวม) | qc:all 313/380 (rc=1 · 20:00 UTC) → เลนไล่แดงของ CRM · ผลสุดท้าย: **⏳ รอผล — ผู้คุมงานเติม** (§9.0) | ผู้คุมงานตรวจ + รวม: **⏳ รอผล — ผู้คุมงานเติม** |

### เฟส C4 — ทุกปุ่มทำงาน

| ใบ | งาน | สถานะ | commit | ข้อสอบตอนรับ | ผู้ตรวจ |
|---|---|---|---|---|---|
| C4.1 | ทะเบียนปุ่ม 1,066 แถวตอนรับ (วันนี้ `scripts/crm-ui-inventory.json` มี 1,069 แถว — +3 แถว link hosts) + ด่าน F14 | ✅ 3 ต.ค. | 54af5306 (registry md5 f102f258) | F14 1066/0 หนี้/0 แถวผี | รับพร้อม C4.2 |
| C4.2 | ตัวกดทุกปุ่ม 5 บทบาท (`owner` `manager` `nok` `thana` `customer`) × 2 จอ (`qc-crm-buttons.mts` it7) | ✅ 3 ต.ค. | 54af5306 (runner md5 71120e8e) | run6 4377/4377 · รวม run5+run6 7805/7805 · 0 dead/wrongExpect/hiddenLeak/VACUOUS · tripwire CLEAN | FINAL VERDICT: ACCEPT (ผู้ตรวจใหม่) · F1–F4 LOW → หนี้ |
| C4.2-fix (= "UI fix" ของ C5.4 — ยืนยันจาก `CRM-RESUME.md:255,331`) | ปุ่มกั้นด้วยคีย์เดียวกับ action/service + linkify อีเมลของ composer (รวม C4.4-fix2) | ✅ 30 ก.ย. | 03848b5b | gate `crm-main-ui` (บันทึกใน `wo-notes/crm-C4.2-fix.md`) | r1 NOT MERGEABLE (BL-1) → r2/r3 ผ่าน |
| C4.2-fix-linkhosts | fixture `linkHosts` ของตัวกดปุ่ม + กฎกรอก + 3 แถวใหม่ (หนี้ของ link policy) | ✅ 7 ต.ค. 11:33 UTC | 02bfa7cb (จาก `wip/crm-c42b` a8d45fdf) | run7 `/settings/tracking` 184/184 · รวม run6+run7 4399/4399 · tripwire CLEAN | (ใบผู้คุมงาน) |
| C4.3 | ฟอร์มทุกใบ (22 ฟอร์ม · inline error · กดซ้ำ) | ✅ | d5f829d2 (build c6fe26d2) | 669/669 · restore เหมือนเดิม ×12 | 2 รอบ + ORACLE-EDIT probe/select-wait |
| C4.3-fix 1/2 | phantom team member · lost-reason race · ข้อความไทย | ✅ | 130ca0c1 · c6fe26d2 | — | MERGEABLE (AFTER SHOULD-FIX) |
| C4.4 | เส้นทางผู้ใช้ US1–US10 กดจริง | ✅ 1 ต.ค. | 46f952cc (รับ b15a142d) | `--journey all` 92/95 · 0 fail · 3 ช่องว่างผลิตภัณฑ์ (STT P18 ×2 · compose-new-thread) | 5 รอบ · 2 review |
| C4.4-fix / fix2 / fix3 (J3) | convert รับ taxId+บทบาท · ผูกผู้เยี่ยมชมเว็บ→ผู้ติดต่อ | ✅ | 3f934300 · 03848b5b · 46f952cc | J3 probe 32/32 | J3 r2 MERGEABLE |

### เฟส C5 — ล่าบั๊ก

| ใบ | งาน | สถานะ | commit | ผลตอนรับ | ผู้ตรวจ |
|---|---|---|---|---|---|
| C5.1 | ความเร็วข้อมูลขนาดจริง + `crm_perf_indexes` | ✅ | 98fd480a | งบ 32/32 · equivalence 0 diff | MERGEABLE |
| C5.2 | นักล่า 6 เลนส์ | ✅ | c8546046 | 0 BLOCKER · 22 MAJOR · 40 MINOR | — |
| C5.3 | ยืนยัน + ปักข้อสอบแดง `qc-crm-c5.3.mts` | ✅ | affceffa | 54 ข้อ (52 แดงตามข้อค้นพบ) | 2 รอบ · มติ ORACLE-EDIT 1–8 |
| C5.4-A | แพลตฟอร์ม (outbox lease 6 นาที · webhook · SSRF · idempotency) | ✅ | c6fe26d2 | — | ดูบันทึก C5.4-A |
| C5.4-B | สิทธิ์ + PDPA (v1 ปิดบน v2 · portal ตายตามบริษัท · คีย์ ⊆ ผู้สร้าง) | ✅ | c2c8d86b | batch-B 14 id เขียว | — |
| C5.4-C | เงิน (ใบลดหนี้ · ถอน/เช็ค · 14 รอบ) | ✅ | 4888a96e · 1b524af3 | c2.7 79/79 · c3.1 56/56 · c3.2 47/47 · c3.3 90/90 | hunter r9–r12 → MERGEABLE AFTER … |
| C5.4-D | คิว/ลำดับติดตาม | ✅ | 5fb440fd | — | 3 รอบ → F1–F6 ไป D2 |
| C5.4-D2 | ส่งอีเมลซ้ำ F1–F6 (token HMAC แน่นอน) | ✅ | 8cf86985 | probe 28/28 + ถอยหลังเขียว | MERGEABLE |
| C5.4-E | UX (L6) + sanitize ถอดรหัสครั้งเดียว | ✅ | 288cca97 | equiv 454/454 | MERGEABLE |
| C5.4-F | อีเมล/tracking hardening (A-R ของเราเท่านั้น) | ✅ | 986ec608 | c2.5 105 · c2.6 87 · c2.9 52 · c3.5 67 | MERGEABLE AFTER SHOULD-FIX |
| C5.4-N | เลขใบสำคัญจาก Postgres sequence (P20) | ✅ | 264c5440 | oracle 12/12 · 3 แคชเชียร์ 7/20→20/20 | เงิน 2 รอบ |
| **C5.4 รวม** | | ✅ 1 ต.ค. | 264c5440 | 46/53 | — |
| C5.5 | ล่ารอบสอง (hunt 1·2a·2b·3·4 · authz sweep · fix1–15 · G1–G3) | ✅ 3 ต.ค. | 07ce81c2 (gate 2f5e411b) | run6 ไม่มีข้อบกพร่องผลิตภัณฑ์ใหม่ | ทุกใบ MERGEABLE (ดูตารางล่าง) |

#### ใบย่อย C5.5 (ทุกใบรวมเข้า `session/crm` · ขึ้น prod กับ deploy 1 แล้ว)

| ใบ | ขอบเขต 1 บรรทัด | commit รวม | gate ตอนรวม | ผู้ตรวจ |
|---|---|---|---|---|
| fix1 | hunt-1: automation ตรงกับประตูมือ · REST idempotency ไม่รันซ้ำ (409 outcome_unknown) · webhook choke point | 42acc952 | static + QC3 เขียว · c1.10 66/67 (H.1 = :3215 เก่า) | 2 รอบ MERGEABLE |
| fix2 | hunt-2a: ciEquals (ILIKE `_`/`%`) · portal ATO · nav perms · อีเมลแอบอ้าง | 5c87acc3 | 20/20 | 3 รอบ FINAL MERGEABLE |
| fix3a | webhook ปฏิเสธ event ต่างตระกูล · 429 nothingWritten · ล็อกตัวจัดเลข JV (migration 000002/3) · at-risk วันไทย | 7d5dc93f | — | r1 NOT MERGEABLE (F1) → r2 MERGEABLE |
| fix3b | field-due/pipeline-late วันไทย · portal DATETIME · ป้ายผู้ส่งไม่ยืนยัน · guard ต่อตระกูล | 4b5ca1cb | — | 2 รอบ MERGEABLE |
| fix4 | forward-port hotfix 1 ต.ค. (sanitizer · automation/payment/mobile authz · 1 MB inbound) + ciEquals บัญชี 4 จุด | d16dc211 | — | MERGEABLE |
| fix5 | regex กำลังสอง/อินพุตไม่จำกัด (ReDoS) + fitness F16 | 6280997b | — | r1 NOT MERGEABLE (RV5-1) → r2 MERGEABLE |
| authz sweep | มือถือ AI ต้อง `ai.chat.send` · scope คีย์บัญชี · webhook test · v1 activity ข้ามร้าน | 53d88b71 | 21:10 UTC 1 ต.ค. | MERGEABLE |
| fix6 | ซ่อนตัวเลือกบริษัทเมื่อไม่มีสิทธิ์ · ปฏิเสธก่อนเขียน · AI brief ติดป้ายอีเมลไม่ยืนยัน | 1d23347e | — | 2 รอบ MERGEABLE |
| fix7 | edit sheet บริษัทหลักที่มองไม่เห็น · archived · วันเวลาไทยใน 360/export | e963af82 | — | MERGEABLE |
| G1 | AI tools รันในนามผู้เรียก (actor บังคับ · สิทธิ์ต่อ tool) | 05dc5f74 | — | 2 รอบ MERGEABLE |
| fix9 | PDPA export แบ่งหน้า + บอกความครบ · erase ไม่มีเพดาน | c99ef119 | — | 2 รอบ MERGEABLE |
| fix11 | erase เขียนแบบ set-based · จำแนก tx หมดเวลา | d1f62aa8 | — | MERGEABLE |
| fix10 | ชื่อบริษัทบนดีล/ผู้ติดต่อตาม visibility · DATE display | b5050ac6 | 25/25 | MERGEABLE |
| G2 | ห้อง AI เป็นของผู้สร้าง | 4814fbc0 | 22/23 (X7.1 แดงจนถึง G3) | MERGEABLE |
| fix8 | คีย์ API / webhook / อีเมลขาเข้า (lane ผู้ส่งเบา) + H3-1 | 3b2bd298 | 33/34 (RK.6 = RV-4 มากับ hotfix) | 4 รอบ (r1–r3 NOT MERGEABLE) → MERGEABLE มีเงื่อนไข |
| G3 | ความจำ AI ต่อผู้เขียน + ด่านข้อมูลติดต่อ | af362860 | 26/29 (3 ENV) | 3 รอบ MERGEABLE |
| fix12 | ตรวจซ้ำไม่เปิดเผยเรคคอร์ดที่มองไม่เห็น · rate limit เบอร์/อีเมล · import job | 1d202ed5 | 29/29 | 3 รอบ MERGEABLE |
| fix13 | hunt-4: erase ถึงความจำ/แผน/ข้อเสนอ AI · ประตู CRM ตามห้อง G2 · outbox ปลุกจริง | 4dd1bc35 | 36/37 (K0.1 by design) | 2 รอบ MERGEABLE |
| fix14 | S4: ข้อมูลสมาชิกบนหน้าบัญชี/CRM ต้องมีสิทธิ์ดูสมาชิก | c1522f6e | 32/33 (m1.4 ENV) | 4 รอบ MERGEABLE |
| fix15 | after-drain fallback 3 วินาที · drain วิ่ง 1 รอ 1 · แก้จาก run5 | 07ce81c2 | gate 2f5e411b | 2 รอบ MERGEABLE |

### เฟส C6 — ขึ้น production

| ใบ | งาน | สถานะ | commit | หลักฐาน | ผู้ตรวจ |
|---|---|---|---|---|---|
| C6.0 | ดูด origin/main (59 commit · hotfix 1–5 ต.ค.) เข้า session/crm · 12 ไฟล์ขัดกัน "เก็บด่านที่เข้มกว่า" | ✅ 7 ต.ค. | merge ae276a54 → 3557ddd1 · gate 54cad0b2 | gate 29 ขั้นเขียว (c3.8 รันซ้ำ 31/31) · hf-apiv1-scope 143/143 | MERGEABLE (R-1 · R-2) |
| C6.1-LINKPOLICY | นโยบายปลายทาง `/l/<code>` (P11 ทาง ข) | ✅ 7 ต.ค. | 9fd5323d → 1ec59c02 | probe ผู้ตรวจ 40/40 · builder 44/44 · c2.5/2.6/2.11/c5.3 L4 เขียว | r1 MERGEABLE AFTER RV-1/2 → r2 MERGEABLE |
| C6.1 | ตรวจ prod อ่านอย่างเดียว + ซ้อม migration + **deploy 1** + crontab | ✅ 7 ต.ค. 11:21 UTC | 3675fb09 · 7327c424 · push `f132ce21` → main · บันทึก 98bca721 | `wo-notes/crm-C6.1.md` §1, §3, §4 | (ใบผู้คุมงาน) |
| C6.2 | backfill prod (P15 สองตัว) | ✅ 7 ต.ค. 22:34 UTC | d135854a | `wo-notes/crm-C6.2.md` · `ledger/evidence/c62/c62-apply-p15.log` (เปลี่ยน 0 · รอบสอง 0) | (ใบผู้คุมงาน) |
| C6.3 | ร้านนำร่อง `siam-dive-center` | ⏸ env + redeploy เสร็จ · รอเจ้าของกดสวิตช์ | fbf072f0 · f4f59e47 (บันทึก) | เดิน 5 บทบาท + เฝ้า 24 ชม.: **⏳ รอผล — ผู้คุมงานเติม** (§9.2) | — |
| C6.4 | ส่งมอบ (ไฟล์นี้) | 📝 ใกล้สุดท้าย | ⏳ รอผล — ผู้คุมงานเติม (commit) | — | รอ Fable ตรวจรอบสุดท้าย |

---

## 3. บั๊กจริงที่เจอและแก้

ระดับ: ตามที่ผู้ล่า/ผู้ตรวจให้ไว้ · "prod" = มีอยู่บน production ก่อนแก้

### 3.1 ก่อน C4 (C0–C3 · อยู่บน prod แล้ว)

| id | ระดับ | 1 บรรทัด | แก้ในใบ |
|---|---|---|---|
| C0.4 | HIGH (prod) | ร้านหนึ่งลบ/อ่านไฟล์ของร้านอื่นได้ด้วย URL โลโก้สาธารณะ | C0.4 |
| C0.3 | เงิน | ส่วนลดท้ายบิลเกินยอด ⇒ ใบแจ้งหนี้ออกไม่ได้ตลอดไป ("ลงบัญชีไม่สมดุล") | C0.3 |
| C0.5 | MED | ตัวกระจายงานข้ามรอบครึ่งหนึ่งแบบเงียบ | C0.5 |
| C1.4-AF | MED (prod สมาชิก) | แจ้งเตือนสมาชิกหยุดทั้งร้านเมื่อมีสมาชิกถูกลบ | C1.4 (acceptance fix) |
| C1.5 | HIGH | หน้า v2 หลุดถึงร้านจริง (ไม่มีประตู uiVersion) | C1.5 |
| C3.3-fix | MAJOR ×5 + race | คอมมิชชันคิดผิดหลังรวม (H1–H6/M7) | C3.3-fix |
| C3.9-fix | BLOCKER ×5 (12 ข้อ) | นักล่าความปลอดภัย H1–H12 | C3.9-fix (prod 28 ก.ย.) |
| BLOCKER ของผู้ตรวจรายใบ | — | ดูคอลัมน์ "ผู้ตรวจ" ใน §2 (C1.3, C1.4, C1.6, C1.7, C1.9, C1.10, C2.3–C2.7, C3.2–C3.9) | ใบนั้น ๆ |

### 3.2 จากการรันปุ่ม/ฟอร์ม/เส้นทาง (C4.x)

| id | ระดับ | 1 บรรทัด | แก้ในใบ |
|---|---|---|---|
| C4.2 F1 (run2–3) | MED | nok/thana เห็นปุ่มที่ action ปฏิเสธ (hiddenLeak) | C4.2-fix 03848b5b |
| C4.3 | LOW–MED | สมาชิกทีมผี · lost-reason race · emoji ZWJ · throw แทนข้อความไทย | C4.3-fix 1/2 |
| C4.4 | MED | convert ไม่รับ taxId/บทบาท · บริษัทซ้ำเลขภาษีรั่ว · ผู้เยี่ยมชมเว็บไม่ผูกย้อนหลัง | C4.4-fix · fix2 · fix3 (J3) |
| P-it5-2 | MED | outbox ไม่ถูกปลุกจากแผงแชท/`/u`/portal/ทีม (รอ cron) | C5.5-fix13 |
| P-it5-3 | LOW | หน้า `/u/[token]` ไม่มี viewport meta | C5.5-fix13 |
| P-it6-2 | MED (`core/after-drain.ts` — ไฟล์แพลตฟอร์ม) | drain แบบรวมคำขอไม่เริ่ม ⇒ event รอถึง cron | C5.5-fix15 (fallback 3 วินาที · ต้นเหตุยังไม่พิสูจน์) |
| P-it6-1 | LOW–MED | กล่อง "แนบกับผู้ติดต่อ" โผล่ให้ผู้จัดการที่ถูกปฏิเสธทีหลัง | fix15 |
| O-it6-a / RVR-5 | LOW | bulk move นับดีลที่อยู่ขั้นนั้นแล้วว่า "ย้าย" | fix15 |
| O-it6-d | LOW | กล่องไฟล์โยน NOT_FOUND ใน server component | fix15 |

### 3.3 C5.2 → C5.4 (22 MAJOR · 40 MINOR)
ปักเป็นข้อสอบแดง 52 ข้อใน `scripts/qc-crm-c5.3.mts` แล้วแก้เป็นชุด A–F + D2 + N (ตาราง §2) — รายการเต็มต่อข้อ: `wo-notes/crm-C5.2-L1…L6.md` + `crm-C5.3.md` · ข้อที่ prod เปิดอยู่ตอนนั้น (C5.3 "Prod exposure"): L1-M3, L1-m5, L3-M1, L3-M3, L3-m1, L3-m4, L4-M2 → แก้ใน C5.4-A/B · ข้อเด่น: เลขใบสำคัญ JV ชนกัน (3 แคชเชียร์ ⇒ 80 % ชำระล้ม — มีบน prod จนถึง deploy 1) → C5.4-N (ขึ้น prod 7 ต.ค.)

### 3.4 C5.5 (ล่ารอบสอง)

(คำว่า "prod" ในตารางนี้ = มีบน production **ตอนที่พบ** · ทุกข้อแก้ขึ้น prod แล้วกับ deploy 1 เว้นแต่ระบุว่าเป็นหนี้)

| id | ระดับ | 1 บรรทัด | แก้ในใบ |
|---|---|---|---|
| H55-1 | MED | REST idempotency: retry หลัง DB สะดุดรัน handler ซ้ำ | fix1 |
| H55-2 | MED | กฎ automation บันทึกแอ็กชันเกินสิทธิ์มือ (GIVE_POINTS/ISSUE_VOUCHER/OPEN_KANBAN_CARD) | fix1 (ทางรันอ่านโค้ดเท่านั้น) |
| L55-3 | LOW | reschedule/ลบกิจกรรมใช้คีย์ต่างกันระหว่าง UI/REST | fix1 |
| L55-4 | LOW | webhook endpoint ระดับร้าน ไม่มี visibility | fix1 (endpoint เก่าไม่ตรวจซ้ำ = หนี้) |
| L55-5 | LOW | after-drain รวมคำขอ อาจเลื่อน event ≤15 วินาที | หนี้ → fix15 ส่วนหนึ่ง |
| 2a-3 | HIGH (prod สมาชิก) | sanitizer ปล่อย `<tag/attr=…>` ⇒ XSS หน้า join สมาชิก | prod hotfix 6513a9f7 + fix4 |
| 2a-9 | HIGH | portal → stored XSS ในการ์ดบอร์ดพนักงาน | prod hotfix 6513a9f7 + fix4 |
| 2a-4 | HIGH | ReDoS ขาเข้าไม่ต้องล็อกอิน (sanitize ไม่จำกัดขนาด) | prod hotfix ca5a28be (1 MB) + fix5 |
| 2a-6 | HIGH | portal ATO ด้วยอีเมลหน้าคล้าย (ILIKE `_`/`%`) | fix2 |
| 2a-1 · 2a-2 · 2a-5 | MED | วนอีเมลผ่านกล่องขาเข้า · From ลูกค้าแอบอ้างมีผลข้างเคียง · From พนักงาน ILIKE | fix2 |
| 2a-7 · 2a-8 | LOW | ไม่มีเพดานขาเข้าต่อระบบ/ผู้ส่ง · เชิญซ้ำไม่ถอด session | fix2 |
| H2b-1 | MED | runbook N ขาดการตรวจสิทธิ์ sequence | แก้ใน runbook (pre-check 3b) |
| H2b-2 | LOW | ตัวจัดเลข JV setval ถอยหลังได้ | fix3a (migration 000002 → 000003) |
| H2b-3 · F5 | LOW | at-risk/pipeline-late เทียบเวลา ไม่ใช่วันไทย | fix3a · fix3b |
| H2b-4 · H2b-5 | LOW | field_due DATETIME ยิงก่อน 1 วัน · portal แสดงวันที่ UTC | fix3b |
| fix3a-F1 | MED | ทาง gap ≤1000 ไม่ล็อก ⇒ ชน P2002 | fix3a r2 (000003) |
| fix4-RV-1 | HIGH (session/crm เท่านั้น) | regex กำลังสองใน catch ของการส่งอีเมล | fix5 |
| fix4-RV-2 | MED (prod) | parser From/To กำลังสอง | fix5 |
| authz S1 · S2 · S3 · S5–S8 | MED–LOW | คีย์บัญชีรับ scope อื่น · webhook test ส่ง event ปลอม · v1 activity ข้ามร้าน · ฯลฯ | authz sweep 53d88b71 |
| authz F1 | HIGH (prod) | `/api/v1/*` เดิมไม่สนใจ scope คีย์ | HF-APIV1 (prod 5841c670) |
| S4 | MED (prod) | การ์ดสมาชิกบนโปรไฟล์ผู้ติดต่อบัญชีไม่ตรวจสิทธิ์ดูสมาชิก | fix14 |
| G1 | HIGH (prod) | AI tools รันด้วย tenantId อย่างเดียว ⇒ `ai.chat.send` ได้ทุก tool | G1 |
| G1-F1 | HIGH (prod) | ห้อง AI เป็นของทั้งร้าน — พนักงานอ่านห้องเจ้าของได้ | G2 |
| G2-1 ฯลฯ | MED | ความจำ AI ร้านใส่ทุก prompt · ข้อมูลติดต่อในความจำ | G3 |
| R2b-3 (fix2) | MED | switchCompany แข่งกับเชิญซ้ำ | fix2 r3 |
| fix8-RV-1/2/6/8 | HIGH (blocker ในรีวิว) | bucket ขาเข้าถูกเติมเต็มจนตัดอีเมลจริงของลูกค้า | fix8 r2–r4 (lane ผู้ส่งเบา) |
| H3-1 | MED | อีเมลปลอมชื่อลูกค้าตัดอีเมลจริงของลูกค้าทั้งชั่วโมง | fix8 |
| H3-2 · H3-3 | LOW/INFO | export PDPA ตัดเงียบที่ `take` · erase หยุดที่เพดาน | fix9 · fix11 |
| FX7-1 · RV10-1 | MED | ชื่อบริษัทที่มองไม่เห็นรั่วบนหน้าดีล · ตรวจซ้ำรั่ว PII | fix10 · fix12 |
| H4-1 | MED | ผู้ถูกลบ (PDPA) ยังอยู่ในความจำ AI และถูกส่งเข้าโมเดล | fix13 |
| H4-2 · H4-3 · H4-4 | LOW | ยืนยันข้อเสนอ AI ห้องคนอื่น · merge field ชื่อบริษัทที่ซ่อน · คีย์ CRM ถูกเสนอ tool ที่ใช้ไม่ได้ | fix13 |
| RV14-1 | MED (prod) | 360 CRM โชว์รหัส/ชื่อสมาชิกให้คนไม่มีสิทธิ์สมาชิก | fix14 r3 |

### 3.5 hotfix production 1–5 ต.ค. ที่มากับ origin/main (ดูดเข้าใน C6.0)

(929c39ce = merge commit ที่ push ขึ้น main 1 ต.ค. 13:50 UTC — `CRM-RESUME.md:160`)

| merge / commit | 1 บรรทัด |
|---|---|
| 929c39ce (deploy 1 ต.ค. 13:50 UTC) | hotfix/sanitize-2026-10-01 ข้อ 1–4: sanitizer default-deny (6513a9f7) · automation page จำกัด KANBAN (4d64b0dc) · payment profile ตรวจสิทธิ์+audit (0013b8ae) · inbound 1 MB (ca5a28be) · mobile AI/DNA ตรวจสิทธิ์ (7089364c) |
| 5841c670 | HF-APIV1: คีย์ที่มี scope/ผูกระบบถูกปฏิเสธที่ `/api/v1` เดิม · คีย์แชทต้องไม่มี scope · kanban revoke เฉพาะระบบตัวเอง |
| 8c68f335 | HF-POS-PAGES: ด่านสิทธิ์หน้า POS ต่อสาขา |
| 2f45c56e | HF-HR-0: ปิดข้อมูลพนักงาน/สลิปรั่ว · สายอนุมัติ · OT · ห้ามอนุมัติของตัวเอง |
| 6948b12f | HF-INV-0 + HF-INV-1: ด่านสิทธิ์คลัง/รายงาน + สต็อกในคำสั่งเดียว (ล็อกแถว) |
| 8999a79e | ledger RC hotfixes 2026-10-01 (ผลรวม 4 สาขา) |
| 3a93a773 · 70ab5b86 | HF-O23: POS register เดิม — prefix idempotency key `pos1:` + ตรวจความเป็นเจ้าของหลังสร้าง |
| f85f5455 | qc4.sh (harness อย่างเดียว · tip ของ main ก่อน deploy 1) |

---

## 4. ORACLE-EDIT ทั้งหมด

**กติกา:** ผู้ทำงานแก้ข้อสอบเองไม่ได้ · ทุกการแก้ต้องมีมติผู้คุมงาน (Fable) และติดป้าย `// ORACLE-EDIT <id> (<ใบ> · <เหตุ>)` ในไฟล์ · ตั้งแต่ C5.x ผู้ตรวจอิสระให้ความเห็นก่อนผู้คุมงานอนุมัติ
**จำนวน:** 337 บรรทัดป้ายที่เพิ่มใน `scripts/` (ไม่นับ `scripts/pending/`) ระหว่าง `b8fea3f^..session/crm` (นับซ้ำแล้วที่ d82a8796 = 337) + 31 ไฟล์ใน `scripts/pending/` (probe ของใบ) · **ยังไม่รวม** การแก้ข้อสอบของเลน C3.10 บน `wip/crm-c310` (c1.2b S8.2 = 541a4b21 · c3.7 X1.3 = 9e4fe9a9 · ทะเบียนปุ่ม 284614a6) — มติ ORACLE-EDIT ของผู้คุมงานต่อ 3 รายการนี้: **⏳ รอผล — ผู้คุมงานเติม** · ทะเบียนละเอียดพร้อมเหตุผลของยุค C0–C3: `ledger/CRM-RUN.md` §4 (106 บรรทัด ORACLE-EDIT) · ยุค C4–C6: ส่วน "ORACLE-EDIT" ใน `wo-notes` ของแต่ละใบ

### 4.1 ต่อไฟล์ (ป้ายที่เพิ่มใน RUN · ใบที่อ้างในป้าย)

| ไฟล์ | ป้าย | ใบที่อ้าง | ผู้อนุมัติ |
|---|---|---|---|
| qc-crm-c3.3 | 47 | C3.3 (38) · C3.3-H (8) · C5.1-fix · X3/S0 | ผู้คุมงาน (มติเงิน + นักล่าเงิน) |
| qc-crm-c3.2 | 25 | C3.2 (14+) · C5.4-C (10) · C4.1 · C5.1-fix | ผู้คุมงาน |
| qc-crm-c2.7 | 24 | C5.4-C (8) · C2.7-fix (7) · C2.7-S3 (7) · C4.1 · C3.0 | ผู้คุมงาน |
| qc-crm-c0.2 | 18 | C5.4-A (5) · C0.2-S1/S4 · C1.8 · C1.10 · C3.4 | ผู้คุมงาน |
| qc-crm-c3.9 | 16 | C5.4-B (9) · C3.9-H (6) · export-confirm (5) · C6.1-LINKPOLICY | ผู้คุมงาน |
| qc-crm-c2.3 | 15 | C2.3 (60→80 ข้อ) | ผู้คุมงาน (ผู้เขียนข้อสอบ opus เขียน) |
| qc-crm-c2.11 | 11 | C2.11 · C6.1-LINKPOLICY | ผู้คุมงาน |
| qc-crm-c5.3 | 11 | มติ 1–8 · L4-M2 · L3-m1 (fix1) · C6.1-LINKPOLICY | ผู้คุมงาน (มติผูกพัน 28 ก.ย.) |
| qc-crm-c1.10 | 10 | C1.10 · C1.11 · C2.11 · C3.4 · C3.8 · C5.4-D · C5.5-fix1 (S7.2) · C5.5-G1 | ผู้คุมงาน |
| qc-crm-c2.4 · c2.5 | 9 · 9 | C2.4/C2.5 (ข้อสอบเพิ่ม) · C4.1 · C5.4-F (S3.4/S10.7/S10.8) · fix2/fix5 (SHA_BOARD_IN) | ผู้คุมงาน + ผู้ตรวจ fix2/fix5 |
| qc-crm-c2.6-web · c2.6 | 8 · 6 | C5.4-F (I2) · C4.4-I2 · C2.5 · C4.1 · C6.1-LINKPOLICY (X6.1) | ผู้คุมงาน |
| qc-crm-c1.11 · c2.10 · c2.8 | 7 · 7 · 6 | C1.11-S6 · C5.4-B (ruling 6) · C4.1 · C2.10-S0/S4.1 · C2.8 S2.1/S5.2/S8.2/S8.6/X5.3 | ผู้คุมงาน |
| qc-crm-c1.6 · c2.9 · c1.4 | 5 · 5 · 3 | C5.4-E (S4.4) · C1.7 · C1.6-X3.4 · C2.9-X4 · C1.4-S1.5 (C5.4-B · L5-m6) | ผู้คุมงาน |
| qc-crm อื่น (c0.4 c0.5 c1.1 c1.2a c1.2b c1.3 c1.5 c1.8 c1.9 c2.1 c2.2 c3.0 c3.1 c3.4 c3.5 c3.6 c3.7 c3.8 c51fix-equiv forms) | 1–4 ต่อไฟล์ | ใบของตัวเอง · C4.1 · C5.1-fix (allowlist `crm_perf_indexes`) · C4.3 probe/select-wait | ผู้คุมงาน |
| ชุด AI 15 ไฟล์ (qc-ai*, qc-kb*, qc-chat-notify, qc-mobile-chat, qc-account-api-ai-skill) | 1–2 | C5.5-G1 (17 ไฟล์ — เพิ่ม `actor`/`qcOwner` เท่านั้น ไม่เปลี่ยนค่าคาด) · G2 · G3 | ผู้ตรวจ G1 "17 ข้อชอบธรรม" + ผู้คุมงาน |
| qc-mobile-authz-hotfix · qc-mobile-help | 2 · 1 | C5.5-G2 (ห้องที่ STAFF เปิดเองผ่าน route จริง) | ผู้ตรวจ G2 + ผู้ตรวจ C6.0 |
| qc-acc-v2-contact-modal · -profile · -contacts | 5 · 3 · 3 | C5.4-A ("system" viewer) · C5.5-fix14 (Q7.5 ส่ง viewer OWNER) | ผู้คุมงาน (fix14 เฉพาะ Q7.5) |
| qc-chat-api-v1 · business-hours · replies | 1 ละไฟล์ | HF-APIV1 | มาจาก hotfix (ของ main) |
| qc-hf-apiv1-scope | 1 | C6.0 · G1 rule (HF-12.1/12.2 + HF-12.2b ใหม่) | ผู้ตรวจ C6.0 "อนุมัติมีเงื่อนไข" + ผู้คุมงาน |
| qc-hf-hr-privacy | 2 | C6.0 L-4 (ส่ง actor ให้ runTool) · C5.5-G1 | ผู้ตรวจ C6.0 (เงื่อนไข: รันบน QC4) — รันใน qc:all ของ C3.10 บน **QC1** ได้ 194 ✅ (`wo-notes/crm-C3.10.md` ช่วง 19:38 UTC) · การรันบน QC4 ไม่พบบันทึก |
| crm-journeys US2/US3/US10 | 2 · 1 · 1 | C4.4 · C4.4-fix | ผู้คุมงาน |
| สมาชิก/อื่น (qc-member-fix-s2, m1.4, qc-form, qc-forms-notify, qc-pages, qc-webhook, qc-acc-v2-security, qc-chat-v2-voice, visual-crm) | 1 ละไฟล์ | C1.5 (S2-M12.2) · C1.8 (drainAll) · C0.4 (path private) · RG-1 เมนู CRM | ผู้คุมงาน |

### 4.2 ORACLE-EDIT สำคัญยุค C5–C6 (เหตุผลเต็ม)

| ไฟล์ · ข้อ | ใบ | เหตุผล | ผู้อนุมัติ |
|---|---|---|---|
| qc-crm-c3.1:409 reps net | C5.3 มติ 1 | ยอดเซลส์สุทธิ = APPROVED+PAID+REVERSED ตาม periodKey | ผู้คุมงาน |
| qc-crm-c3.2 weighted | C5.3 มติ 2 | ไม่นับ OMITTED + ปัดต่อดีล | ผู้คุมงาน |
| qc-crm-c3.9 S1.4 | C5.3 มติ 3 / C5.4-B | erase ปิดชื่อในชื่อดีล/nextStep/lostReason | ผู้คุมงาน |
| qc-crm-c2.5 S10.8 | C5.3 มติ 4 (F8) | token ยกเลิกรับอีเมลที่ถูกต้องใช้ได้เสมอแม้เกินเพดาน | ผู้คุมงาน |
| qc-crm-c2.7 S3.1/S9.5 | C5.4-C (Q14) | won = ฐานก่อน VAT จาก `WON_VALUE_BASIS` ค่าเดียว | ผู้คุมงาน |
| qc-crm-c1.11 S6.10 | C5.4-B มติ 6 | หน้า v1 ต้องปฏิเสธเมื่อ uiVersion 2 | ผู้คุมงาน |
| qc-crm-c1.4 S1.5 | C5.4-B (L5-m6) | เก็บ URL หน้าโดยตัด query | ผู้คุมงาน |
| qc-crm-c3.9 export-confirm | C5.4-B (L5-m7) | export ทั้งร้านต้องมีเหตุผล + ยืนยัน | ผู้คุมงาน |
| qc-crm-c1.6 S4.4 · c51fix-equiv | C5.4-E R1/SF-7 | แท็บวันนี้ตามวันไทย · เรียงชื่อ ICU | ผู้ตรวจ E + ผู้คุมงาน |
| qc-crm-c5.3 L4-M2 | C5.4-A SF1 | 3xx = ส่งถึงพร้อมเตือน; SSRF = ไม่ fetch hop ภายใน | ผู้คุมงาน |
| qc-crm-c3.2 S0.4 · c3.6 S0.2 · c3.3 S0.4 | C5.1 F.2 | allowlist โฟลเดอร์ `crm_perf_indexes` เฉพาะเมื่อ SQL เป็น CREATE INDEX ล้วน (ไม่เปลี่ยนชื่อเพื่อหลบ) | ผู้คุมงาน |
| qc-crm-c1.10 S7.2 | C5.5-fix1 | ย้าย `before = HOOKS.length` ขึ้นก่อน REST (C5.4-D ปลุก outbox ทันที) | ผู้ตรวจ fix1 + ผู้คุมงาน |
| qc-crm-c5.3 L3-m1 | C5.5-fix1 RV-1 | retry claim ค้าง > 6 นาที ⇒ 409 `idempotency_outcome_unknown` ไม่รันซ้ำ | ผู้คุมงาน |
| qc-crm-c2.5 U.5 SHA_BOARD_IN | fix2 · fix5 | `kanban-email-in.ts` เปลี่ยนจริง ⇒ ปักค่า sha ใหม่ | ผู้ตรวจ fix2/fix5 |
| pending/c54n/check-jno-fns-r2 | fix3a r2 | ฟังก์ชันคาด = 000001→000002→000003 | ผู้ตรวจ fix3a |
| pending/cf2/probe-cf2 R2-6 | fix4 | หนี้ 2 จุดหายแล้ว ค่าคาด 3→1 | ผู้ตรวจ fix4 |
| qc-numbering N7 · r2-money R2-C1/R2-D · probe-legal-counters | C5.4-N | สัญญาตัวจัดเลข M1 · type annotation | ผู้ตรวจ N + ผู้คุมงาน |
| pending/c54d/probe-c54d-r3 R2S2a | C5.4-D2 | SENT ด้วย provider id ที่ replay แทนป้าย DELIVERY_UNCONFIRMED | ผู้ตรวจ D2 |
| qc-crm-c2.6 X6.1 · c2.11 S2.11 · c3.8 · c3.9 · c5.3 L4-M3 | C6.1-LINKPOLICY (73c1bf18) | fixture ลิงก์ไปโดเมนที่ไม่ได้ประกาศ ⇒ ประกาศ `example.invalid` / positive control `plain.<DOM_A>` | ผู้ตรวจ linkpolicy อนุมัติครบ 5 |
| qc-hf-hr-privacy L-4 (8d1887ce) | C6.0 | G1 บังคับ `ToolCtx.actor` ⇒ ส่ง OWNER | ผู้ตรวจ C6.0 (ขอให้รัน QC4 · บน QC1 เขียว 194) |
| qc-hf-apiv1-scope HF-12.1/12.2/12.2b (c40433a5) | C6.0 | คีย์ทั่วไปไม่เห็น tool เขียนทันที/ข้อมูลบัญชีแล้ว (กติกา G1) · core = รายชื่อตายตัว 6 ตัว · 137/141 → 143/143 | ผู้ตรวจ C6.0 (มีเงื่อนไข) |

⚠ งานตรวจที่ MASTER-PLAN §10 ข้อ 3 สั่ง ("`git diff <hash เริ่ม RUN>..main -- scripts/qc-crm-*` ทุก hunk หลัง `test(crm):` ต้องมีป้ายคู่กัน") **ยังไม่มีใครทำ** (ไม่พบบันทึกใน ledger ณ 7 ต.ค. 23:05 UTC) — ตารางข้างบนนับจากป้ายเท่านั้น ไม่ได้จับ hunk ที่ไม่มีป้าย · หมายเหตุ: ช่วงอ้างอิงตอนนี้คือ `<hash เริ่ม RUN>..main` ได้จริงแล้วเพราะ main = f132ce21

---

## 5. หนี้และความเสี่ยงที่ยอมรับ

### 5.1 ระดับแพลตฟอร์ม/บัญชี (มีผลแม้ร้านยังเป็น v1)

| เรื่อง | ผลต่อเจ้าของ (ภาษาคน) | ที่มา |
|---|---|---|
| เลข JV มีช่องว่างได้ + ไม่เริ่มใหม่ทุกเดือน (P20/New-1) · กระโดดครั้งเดียว ≤100 (New-4) | เลขใบสำคัญอาจข้าม และนับต่อข้ามเดือน (เลขเอกสารภาษีไม่ข้าม) | C5.4-N |
| ห้าม Instant Rollback ข้าม N (M2) | ย้อนเวอร์ชันผิดวิธี = สมุดบัญชีค้างทั้งเดือน | N-review M2 |
| allocator residual (000003) · 40P01 ระหว่าง heal | หลัง restore/import ข้อมูล การลงบัญชีอาจรอกัน/ล้ม 1 ครั้งแล้วลองใหม่ได้ | fix3a |
| C5.4-N2 ไม่ได้ทำ (เลขเอกสารภาษี/ค่าใช้จ่ายถือทั้ง tx) · N-Q3 · N-Q4 (POS ABB ไม่ได้ตรวจ) | ใบกำกับยาวอาจทำให้แคชเชียร์อื่นรอ · ใบเสร็จย่อ POS ยังไม่รู้ว่ามี race ไหม | N l.354-365 |
| `core/after-drain.ts` (fix15 · RV15-2 drain ที่ไม่จบบล็อก drain ถัดไป) | ถ้า fallback ไม่พอ event ทุกโมดูลอาจช้าถึง 1 นาที (มี cron) | fix15-review · §7 watch |
| L55-5 · N5 ทางเขียนที่ไม่ปลุก drain | event จากแผงแชท/มือถือ/portal/public รอ ≤1 นาที (≤1 ชม. ถ้าไม่มี crontab) | register §4 |
| N7 งานรายวันที่ถูกฆ่าเสียรอบ | purge/retention อาจข้าม 1 วันเงียบ ๆ | D-review N7 |
| Webhook: endpoint เดิมไม่ตรวจซ้ำ + ไม่กรองตามระบบ CRM (L55-4/New-5/R2-4) · guard fail-closed เฉพาะเมื่อทะเบียนว่าง (fix3a F4) | ปลายทาง webhook เก่ายังได้ event CRM ทั้งร้าน | fix1/fix3a |
| Automation H55-2: ไม่มีคอลัมน์ผู้เขียนกฎ | กฎของคนที่ถูกลดสิทธิ์ยังทำงานด้วยสิทธิ์ OWNER จนกว่าจะแก้กฎ | fix1 l.56 |
| H55-1 หน้าต่าง store ล้ม · ApiIdempotency ไม่มีงานลบ | ยาก: 409 in_progress 6 นาที | fix1 |
| `contains` ยังถือ `%`/`_` เป็น wildcard ในหลายโมดูล | ค้นหาอาจได้ผลกว้างเกิน | fix4 · fix8 |
| ซ่อนสมาชิก Q2/Q3 (fix14): แชท `getLinkedMember` ใส่ชื่อ+เบอร์สมาชิกใน prompt AI โดยไม่ตรวจสิทธิ์ | ผู้ตรวจให้ MED · ยังไม่แก้ | fix14 |
| fix12 RV12-2/3 · ข้อมูล "มีอยู่" ยังรู้ได้ตอนสร้างผู้ติดต่อ | รู้ได้ว่าเบอร์/อีเมลมีในร้านหรือไม่ | fix12 |

### 5.2 ระดับ CRM v2 (มีผลเมื่อร้านเปิด v2)

| เรื่อง | ผล | ที่มา |
|---|---|---|
| อีเมล D2-N3 / N4 · SESSION_SECRET/APP_URL ต่างกันระหว่าง VPS/Vercel | ส่งซ้ำข้ามเครื่อง = ขั้นถูกข้าม · ใครมี SESSION_SECRET สร้าง token ได้ | D2 |
| P19 Message-ID ไม่ได้พิสูจน์ · **fallback `+t` ยังไม่ได้สร้าง** (ตรวจโค้ด: แท็ก `+t<short>` ใช้ "ต่อเธรด" เท่านั้น — `emails.ts:2655-2665`; ผลของการตอบกลับ `repliedAt` + `crm.email.replied` + หยุด sequence ต้องมี `parent` ที่หาได้จาก Message-ID อย่างเดียว — `emails.ts:2528-2536, 2759`) | ถ้า Resend เปลี่ยน Message-ID: คำตอบลูกค้ายังเข้าเธรดถูก แต่ไม่ถูกนับเป็น "ตอบแล้ว" และลำดับติดตามส่งต่อ | P19 · register §7 ข้อ 6 |
| providerId webhook ไม่มีดัชนี (1.4) | bounce/delivery ช้าลงเมื่ออีเมลเยอะ | D2-review N2 |
| fix8 R4-1…R4-4 · RV-7 ปริมาณขาเข้า ≤5,000 ฉบับ/ชม./ระบบ | ผู้รับอีเมลของเราอาจถ่วงคำตอบของคนอื่นในเธรดนั้น (หายไปเมื่อตั้ง P14) | fix8-review |
| G3 RV-10/RV-11 · Q1–Q6 | ด่านเบอร์ในความจำ AI จับรูปแบบคู่ไม่ได้ · ปฏิเสธเบอร์/PromptPay ของร้านเอง | G3 |
| G2 ผลตอน deploy | ห้อง AI เดิมทั้งหมดเป็นของ OWNER · STAFF เสียประวัติ · REST conversationId เดิม 404 | G2 (prod ไม่มีคนใช้ AI ใน 30 วัน — R-1 probe) |
| C2.10: fanout 36 ชม. · 9/10 เทมเพลตไม่มีผู้ส่ง · B1 รับเป็นข้อจำกัด — คอลัมน์ `AppNotification.dedupeKey`/`deferredUntil`/`channels` **ไม่ได้สร้าง** (model ใน `prisma/schema/automation.prisma` ไม่มี 3 ช่องนี้) | crontab ล่ม >36 ชม. = แจ้งเตือนหาย | `crm-C2.10.md:34` · `CRM-RESUME.md:41` |
| J3 residual 1–9 (New-9) | visitor id ปลอมผูกประวัติกับ lead ปลอมได้ · ฟอร์มรอ ≤1.5 วินาที | C4.4-fix3 |
| RV-2 fix3b (DATETIME field_due ยิงซ้ำ 1 ครั้งหลัง deploy) | ต้องนับ `AutomationRun` ก่อนเปิด v2 (§9.2) | fix3b-review |
| RV-3 fix3b · RV-4 portal · RV14 (a)(b)(d) · R2F-1..4 · F6-5/F6-6 | DATETIME บน 360/export เป็น UTC · กล่องขอแก้ข้อมูลต้องพิมพ์ ISO · ข้อความ merge บอกว่าเป็นสมาชิก · dry-run กฎรู้ว่าใครเป็นสมาชิก | register |
| P11 link policy — RV-4 (ไม่ใช่ PSL จริง) · RV-6…RV-11 INFO · RV-12 LOW (`/t/c` `/l` ตอบทุก host) · RV-13 INFO (ลิงก์เก่าที่ไม่ผ่านยังนับคลิก + ยิง `crm.email.clicked`) | `*.github.io` ฯลฯ ประกาศได้ · alias host ใช้เปลี่ยนเส้นทางได้ | linkpolicy-review |
| ยังไม่สร้าง: blocklist (`isDestinationBlocklisted` คืน false) · allow-list บน `/t/c` · โดเมนส่งที่ยืนยัน DNS = อนุญาตเสมอ | — | linkpolicy |
| P18 ไม่มี STT · P21 คะแนนบริษัทซ่อน | ไม่มีถอดเสียงอัตโนมัติ · หน้าบริษัทไม่มีคะแนน | P18/P21 |

### 5.3 หนี้การทดสอบ/UI

| เรื่อง | ที่มา |
|---|---|
| C4.2 **F1** `crm-emails-thread-row` หลุดจากตารางรวม run6 (แยก chunk `/emails`) — ปิดด้วยรัน owner+manager chunk `re:^/emails(/\[threadKey\])?$` | C4.2-review |
| C4.2 **F2** `--combine-base` แทนทั้งหน้า (16 การกด `/u/[token]` ของ staff หลุด) · **F3** ไม่ได้ทดสอบลูกค้าถูกกันจาก `/emails/[threadKey]` · **F4** 7 แถวไม่เคยวางแผน + 6 select ไม่มีตัวเลือก | C4.2-review |
| C4.2 F1/F2 (register): `/companies` + แท็บไม่กั้นด้วย `crm.company.read` · แท็บไม่มี aria state · 19 แถว "no-error only" · 53 แถว VACUOUS-candidate · POS↔ดีล/เลขใบเสนอราคาตรวจระดับ service เท่านั้น | register §4–§5 |
| C4.1 D4: UI v1 อยู่นอกทะเบียนปุ่ม | C4.1 |
| ~~ตัวกดปุ่มยังไม่มี fixture `linkHosts`~~ — ✅ ปิดแล้ว 7 ต.ค. (02bfa7cb · run7 184/184) | `CRM-RESUME.md` บรรทัด 11:33 UTC |
| ตัวกดปุ่มใช้ browser context เดียวทุกบทบาท ⇒ คุกกี้พนักงานค้างตอนทดสอบ customer (hiddenLeak 28 ใน qc:all ของ C3.10 = บั๊กของตัวรัน ไม่ใช่ของผลิตภัณฑ์) — แก้แล้วบน `wip/crm-c310` 284614a6 (customer lock-out 94/94) **ยังไม่รวมเข้า session/crm**: ⏳ รอผล — ผู้คุมงานเติม | `wo-notes/crm-C3.10.md` (บน `origin/wip/crm-c310`) ข้อ 3 |
| ข้อสอบ acc-v2 / account-api แดง 34 ชุดใน qc:all (seed บัญชีมีระเบิดเวลา: `scripts/seed-acc-v2-qc.mts:135` + `qc-acc-v2-contact-merge` คืนสภาพด้วย seed ตามนาฬิกาจริง) — เจ้าของเรื่อง = session บัญชี ไม่ใช่ CRM | `wo-notes/crm-C3.10.md` §Reds |
| C6.0 **R-1** (release note): คีย์ทั่วไปเสีย `remember_fact`/`forget_fact`/`support_open_case`/`financial_summary`/`record_expense` ทาง `/api/v1/ai` (core 8→6) — ตรวจ prod แล้วไม่มีผู้ใช้ | C6.0 |
| C6.0 **R-2** (LOW · ถ้อยคำในโน้ต): แก้แล้ว · **R-3** (LOW · มีมาก่อนทั้งสองฐาน): ข้อความ 403 "ระบบไม่ตรง" ที่ `src/app/api/v1/ai/tools/[name]/route.ts:56` พูดถึง "สมุดบัญชีที่ระบุ…" แม้คีย์ผูกกับบอร์ดงาน → ผู้ตรวจ: ใช้ถ้อยคำกลางในใบถัดไป (ยังไม่แก้) | `wo-notes/crm-C6.0-merge-main-review.md:45-46` |
| gate hygiene: `pnpm docs --check` เป็น no-op (ใช้ generator `--check` ×4 แทน) · CI ข้าม qc:all/drift ถ้าไม่มี secret `NEON_API_KEY`/`NEON_PROJECT_ID` (`.github/workflows/ci.yml:84-90` — ตั้งไว้หรือยังดูจาก repo ไม่ได้ §11) | register §6 |
| ENV reds ที่ทราบ (E1-K2.3 · recurring date bomb · account-api-docs · c3.1 · m1.9 · c3.7 · tax-print-audit · promptpay PP16) | register §6c |
| QC1: ผู้คุมงานลบชุด [B] (MemberNotification 150 · MemberAttribution 110 · MemberTierHistory 55) เกินมติ — ย้อนไม่ได้ | register "Controller deviation" |

---

## 6. เรื่องรอเจ้าของ

**มติของเจ้าของที่ได้แล้ว (7 ต.ค. · จาก `CRM-RESUME.md` §0.23):** "ทำได้เลย ตามแนะนำ" 08:15 UTC (crontab · probe prod อ่านอย่างเดียว · JV ไม่เริ่มใหม่รายเดือน + กระโดด ≤100 · G1+G2 ไปกับ C6 · สร้าง `/l` policy ก่อนนำร่อง · คีย์ทั่วไปเฉพาะ OWNER · ที่เหลือใช้ค่าเริ่มต้น register §3) → **"GO push"** 11:10 UTC (deploy เดียว 4 migration) → ร้านนำร่อง + "ทำ" backfill P15 + "ทำตามแนะนำ" 22:3x UTC → "ทำ parity" → 23:02 UTC "เปิด 3 เลน" · กติกาถาวร: **ทุกการ push ขึ้น main (= deploy = เสียเงิน) ต้องมี "GO push" ของเจ้าของในแชทแยกทุกครั้ง**

### 6.1 ค้างฝั่งเจ้าของ ณ 7 ต.ค. ~23:00 UTC (เรียงตามสิ่งที่บล็อกงาน)

| # | เรื่อง | ใครทำ | สถานะ |
|---|---|---|---|
| O1 | กดสวิตช์ CRM ใหม่ (v2) ของระบบ CRM `cmtdvo8h1000004l1d5tl5ej5` — ล็อกอินเป็น **OWNER** ของ SIAM DIVE CENTER → ระบบ CRM นั้น → ตั้งค่า (`/app/sys/cmtdvo8h1000004l1d5tl5ej5/crm/settings`) | เจ้าของ | รอ · บล็อก C6.3 ทั้งใบ |
| O2 | smoke แบบล็อกอินหลัง deploy 1 (register R6: ใบแจ้งหนี้บริการ + หัก ณ ที่จ่าย 3 % ได้เลข `RV-yyyy-mm-…` · จ่ายผู้ขาย + 3 % · พรีวิวเลข JV ไม่ขยับ · ระบบบัญชีใหม่ได้ 5 sequence) + smoke ของ hotfix 1 ต.ค. | เจ้าของ | ยังไม่ยืนยัน (`crm-C6.1.md` §4 "NOT done here") |
| O3 | ออกคีย์ API ใหม่ของ SIAM DIVE CENTER (ตั้งค่า → API keys · จะมีผู้สร้างกำกับ) → ใส่แทนคีย์เก่าใน siamdive2 (ตัวแปร `SHARK_CHAT_API_KEY` บน Vercel ของ siamdive2 + `.env` บน VPS) → แจ้งผู้คุมงานให้เพิกถอนคีย์เก่า = ปิด P15-3 | เจ้าของออกคีย์/สลับ · ผู้คุมงานเพิกถอน | รอ · **ห้ามเพิกถอนคีย์เก่าก่อนสลับ** (แชท SiamDive ใช้ทุกวัน) |
| O4 | รัน `qc-hf-o23` บน QC4 ผ่าน session POS (ชุดนี้มีด่าน "QC4 เท่านั้น") | เจ้าของส่งต่อให้ session POS (ข้อความข้าม session ถูกบล็อกจากที่นี่) | รอ |
| O5 | env parity VPS ↔ Vercel: `SESSION_SECRET` + `APP_URL` ตรงกันทุกไบต์ (+ Resend / LINE / Ably / Blob) | เจ้าของ (ผู้คุมงานไม่อ่าน `.env`) | วิธีทำส่งในแชทแล้ว · ไม่พบบันทึกว่าทำเสร็จ (§11) |
| O6 | CP3 — เจ้าของลองร้าน QC (portal ด้วย session ลูกค้า + คอมมิชชัน → payroll) | เจ้าของ (ผู้คุมงานส่งลิงก์ + ขั้นตอน) | หลัง C3.10 ปิด |
| O7 | "ทำ" ของ backfill 3 รายการที่ dry-run ไม่เป็นศูนย์ (เหตุผลแพ้ +10 · นโยบายมองเห็น +20 ของ `siam-dive-center` · party-links Appointment 17 ของ `demo-review-1787213513937`) | เจ้าของสั่ง · ผู้คุมงานรัน | ไม่พบบันทึกทั้งคำสั่งและการรันจริง (§9.1) |
| O8 | กุญแจที่ค้างจาก RUN อื่น: `RESEND_WEBHOOK_SECRET` (P9) · `CRM_INBOUND_AUTHSERV_ID` (P14) · `EMAIL_INBOUND_SECRET` (ยังไม่ตั้งบน prod — `/api/email/inbound` ตอบ 503) · `BUNNY_ACCOUNT_KEY` (New-11) · ABLY / LINE OA prod | เจ้าของ | รอ · ค่าเริ่มต้น = ไม่ตั้ง (ปิดแบบปลอดภัย) |

**ปิดไปแล้วในวันที่ 7 ต.ค.:** GO push deploy 1 ✅ · ชื่อร้านนำร่อง ✅ (`siam-dive-center` — tenant `siamdive` ไม่มีระบบ CRM) · อีเมลเจ้าของสำหรับทดส่ง ✅ (อยู่ใน `CRM-RESUME.md` บรรทัด 🚀 11:10 UTC) · "ทำ" backfill P15 ✅ · `qc-hf-hr-privacy` 194 ✅ + `qc-hf-pos-page-authz` 56 ✅ รันบน QC1 ใน qc:all ของ C3.10 (เดิมรอ QC4)

### 6.2 P-list (`CRM-OWNER-PENDING.md` + register §3)

| # | เรื่อง | ค่าเริ่มต้นที่ใช้ |
|---|---|---|
| P1 | push prod 28 ก.ย. | ✅ ทำแล้ว (3677d983) |
| P2 | CP3 เจ้าของลองร้าน QC (portal + คอมมิชชัน→payroll) | รอ (หลัง C3.10 ซึ่งกำลังปิด) |
| P3 | บรรทัดยกเลิกรับในอีเมลขายตัวต่อตัว (Q7) | มีทั้งสองแบบ |
| P4 | เงิน v1 นับเข้าดีลย้อนหลัง (Q8) | ไม่ catch-up |
| P5 | คอมมิชชัน Q9–Q12 | ตามร่างใน `crm-C3.3.md` |
| P6 | ใครกดปุ่ม AI ในหน้า (Q13) | ทุกคนที่อ่าน CRM ได้ (RV-3 ยังเปิด) |
| P7 | backfill · ร้านนำร่อง · crontab | ✅ crontab ติดตั้งแล้ว · ✅ ร้านนำร่อง = `siam-dive-center` · backfill P15 ✅ (ชุด `crm-backfill-*` ดู O7) |
| P9 | `RESEND_WEBHOOK_SECRET` บน prod | ไม่ตั้ง (webhook 401 · ไม่มี bounce event) |
| P10 | won value ก่อน/หลัง VAT (Q14) | ก่อน VAT ทุกที่ |
| P11 | `/l/<code>` open redirect (Q15) | ✅ ทาง ข สร้างแล้ว (ไม่มี Safe Browsing) |
| P12 | คีย์ API ตายตามสิทธิ์ผู้สร้าง (Q16) | ใช่ (C5.4-B) |
| P13 | clawback อนุมัติอัตโนมัติ | อัตโนมัติ |
| P14 | `CRM_INBOUND_AUTHSERV_ID` (ตั้งหลังทดสอบ forged-twin เท่านั้น) | ไม่ตั้ง (fail-closed) |
| P15 | ล้าง prod 3 อย่าง (คีย์ไร้ผู้สร้าง · ถอด portal ที่หมดสิทธิ์ · ใบแจ้งหนี้ค้าง partial) | ✅ ข้อ 2–3 `--apply` แล้ว 7 ต.ค. (0 แถว) · ข้อคีย์ไร้ผู้สร้าง รอ O3 |
| P16 | ดาวน์โหลดข้อมูลร้านระดับแพลตฟอร์มไม่มีเหตุผล/audit | เพิ่ม — **ไม่ได้สร้าง** |
| P17 | เอกสารของดีลบริษัทออกในนามบริษัท · backfill เอกสารเก่า? | ไม่ backfill |
| P18 | ถอดเสียงสาย | ไม่มี STT · ซ่อนส่วนนี้ |
| P19 | ส่งอีเมลจริงทดสอบ Message-ID | ผู้คุมงานทดสอบใน C6.3 (fallback `+t` ไม่ได้สร้าง — §5.2) · ผล: ⏳ รอผล — ผู้คุมงานเติม |
| P20 | เลข JV | (a) sequence · ช่องว่างได้ |
| P21 | คะแนนบริษัท | ซ่อน |

### 6.3 New-list (register §3)

| # | เรื่อง | ค่าเริ่มต้น |
|---|---|---|
| New-1 | JV ไม่เริ่มใหม่รายเดือน | ✅ ยอมรับ 7 ต.ค. |
| New-2 | DB role ต้องมี CREATE | ✅ ไม่ต้องทำ (prod = `neondb_owner` มี CREATE ทั้ง 2 URL) |
| New-3 | ช่วงเวลา deploy + กฎห้าม Instant Rollback | ✅ deploy 1 ทำแล้ว · กฎยังมีผล (§7.5) |
| New-4 | กระโดดเลข ≤100 ครั้งเดียว | ✅ ยอมรับ 7 ต.ค. |
| New-5 | หน้า webhook แพลตฟอร์มสมัคร `crm.*` ได้ | ต้องมีกฎผู้สร้าง CRM · endpoint เก่าไม่แตะ |
| New-6 | เพดานอนุมัติของ automation | ปฏิเสธตอนบันทึกเมื่อเกินเพดานมือของผู้เขียน |
| New-7 | retry key เดิมหลัง DB สะดุด = 409 | ตามที่สร้าง |
| New-8 | STAFF ย้ายผู้ติดต่อข้ามเจ้าของได้ | ตามพิมพ์เขียว |
| New-9 | J3 residual 9 ข้อ | ยอมรับตามแบบ |
| New-10 | ซ้อม migration บน Neon branch (Q5) | ✅ ทำแล้ว 7 ต.ค. (เขียว) |
| New-11 | `BUNNY_ACCOUNT_KEY` | รอ (ไฟล์ส่วนตัวยังไม่ล็อกสนิท) |

### 6.4 นโยบาย/ผลิตภัณฑ์ (RESUME §0.23 C ข้อ 6–17 + register ส่วนหลัง)

| เรื่อง | ค่าเริ่มต้น / คำแนะนำผู้ตรวจ |
|---|---|
| RV-3: ฟีเจอร์ AI ของ CRM ต้องมี `ai.chat.send` ไหม | ยังไม่ตัดสิน (ไม่บังคับ) |
| authz sweep D1–D11 (สำคัญ: D11 หน้า webhook ลบ endpoint ของ CRM/สมาชิกได้ · D3 สัมภาษณ์ DNA ใช้เครดิต AI ไม่มีคีย์ · D5 ผู้จัดการสาขาเปลี่ยน PromptPay ร้าน) | พฤติกรรมเดิม |
| งาน AI ตั้งเวลารันในนามใคร | least-privileged (ปัจจุบัน) |
| คีย์ทั่วไป `[]` สร้างได้เฉพาะ OWNER | ✅ ตกลง 7 ต.ค. — **ยังไม่ได้สร้างในโค้ด**: `createKeyAction` (`src/app/app/settings/api/actions.ts:35-36`) กั้นด้วยสิทธิ์ `api.key.create` อย่างเดียว ไม่มีเงื่อนไขบทบาท OWNER · ไฟล์นี้ไม่ถูกแก้ตั้งแต่ 16 ก.ค. (6c2a6c60) · register บรรทัด 295 ยืนยันสภาพเดียวกัน ⇒ เป็นใบค้าง |
| PDPA export: จำกัดตามสิ่งที่ผู้ขอเห็น? รวมแถวที่ถูก merge? lane ไฟล์ส่วนตัวสำหรับ export ใหญ่? · erase ขนาดใหญ่แบบหลายขั้น | ปัจจุบันจำกัดตามผู้ขอ · erase ทั้งหมดหรือไม่ทำเลย |
| export DATETIME เป็น ISO `+07:00` | ตามที่สร้าง |
| ค่าเริ่มต้นบริษัทของดีล (F6-6) | เดิม |
| ประกาศผลของ G2 · นโยบายความจำ AI (G3 Q1–Q6, RV-11) · ห้อง AI ของบัญชีที่ถูกลบ (PDPA) | ประกาศตอน deploy |
| fix12 Q1–Q3 (force ไม่ข้ามรายการซ้ำที่มองไม่เห็น · สแกนนามบัตรที่ชนผู้ติดต่อซ่อน · เพดาน 120/10 นาที) | ตามที่สร้าง |
| fix13 Q1–Q7 · fix14 Q1–Q5 + round-4 (d) · fix15 Q1–Q5 (fallback 3 วินาที · ยืนยันก่อนลบ webhook) | ผู้ตรวจ: คง 3 วินาที · เพิ่มยืนยันลบ webhook ในชุด UX |
| P-it5-1: ผู้จัดการระดับหน่วยเห็นแอ็กชัน automation ที่ถูกปฏิเสธเสมอ | ยังไม่ตัดสิน |
| H4-4: คีย์ที่มี scope อ่าน CRM ใช้ tool อ่านของ AI ได้ไหม | ปฏิเสธ (ไม่โฆษณา) |
| link policy: allow-list บน `/t/c` · โดเมนส่งยืนยันแล้ว = อนุญาตเสมอ | ผู้ตรวจ: ใช่ (ยังไม่สร้าง) |
| `endpoints.md` ที่ gitignore ใน cd2 | ไม่ทำ |
| ABLY / RESEND / LINE OA prod keys | รอ (จาก RUN อื่น) |

---

## 7. Runbook deploy / rollback

### 7.0 บันทึก deploy 1 (ทำแล้ว 7 ต.ค. 2026 — `wo-notes/crm-C6.1.md` §4)

| ขั้น | ผล |
|---|---|
| เจ้าของ "GO push" 11:10 UTC → `git push origin HEAD:main` f85f5455..f132ce21 (fast-forward 281 commit · 11:10:44 UTC) | ✅ |
| Vercel build (migrate → tsc → next build ≈ 9 นาที) · deployment `dpl_AQMM29am5Nt424reV1eu6WdFBDAd` → `dpl_GHA989HSCiYSdWyCVVSPU1mC4UaL` (เห็น 11:19:28 UTC) | ✅ |
| 4 migration 11:11:17–22 UTC · pending/failed 0 · `acc_jno_%` 260 · ระบบ CRM ทุกตัวยัง v1 · outbox ERROR `crm.*` 0 | ✅ |
| ตรวจแบบไม่ล็อกอิน: `/` 200 · `/login` 200 · `/app` 307 · `/api/mobile/conversations` 401 · `/api/v1/crm/ping` 401 · `/l/nope` 302 · `/t/c/nope` 302 · `/api/email/inbound` ไม่มี secret 503 | ✅ |
| VPS `/root/projects/shark-in-th` ดึงเป็น f132ce21 (`pnpm install --frozen-lockfile` + `prisma generate`) + crontab 3 บรรทัด | ✅ รอบแรก 11:21 UTC งาน 6/6 ok |
| redeploy commit เดิมเพื่อรับ env `CRM_V2_SWITCH_TENANTS` (22:40 UTC) → `dpl_7tGsv841PgskzDmW32zRPQ6mwzQC` READY · ไม่มี migration ใหม่ | ✅ |
| smoke แบบล็อกอิน (R6) + เฝ้า log Vercel 1 ชม. | ❌ เจ้าของยังไม่ยืนยัน (O2) |

ข้อ 7.1–7.3 ข้างล่างเก็บไว้เป็น **แม่แบบสำหรับ deploy ครั้งถัดไป** (ค่าในตารางคือค่าที่วัดก่อน deploy 1)

### 7.1 Pre-check (ค่าที่วัดก่อน deploy 1 · 7 ต.ค. 08:18–11:06 UTC)

| ข้อ | ตรวจอะไร | ผล | หลักฐาน |
|---|---|---|---|
| R4-1 | lock capacity ≥ 2× (500 × 5.1) | ✅ lock_slots 57,664 · candidates 52 | prod-probe-c61 |
| R4-2 | รูปเลข docNo (2 นับ = 0) | ✅ 0 / 0 (114 แถว) | prod-probe-c61 |
| R4-3/3b | role DATABASE_URL = DIRECT_URL + CREATE | ✅ `neondb_owner` ทั้งคู่ ⇒ 3b ไม่เกี่ยว | prod-probe-c61 |
| R4-4 | `acc_jno_%` = 0 · migration `2026110400000%` = 0 | ✅ | prod-probe-c61 |
| R4-5 | migrate deploy บน branch ขนาด prod + `pnpm drift` | ✅ 4 migration 2.6 วินาที · drift สะอาด · 260 sequence | `crm-C6.1.md` §3 · `.qc-shots/crm/neon-rehearse-2.log` |
| R4-6 | เจ้าของตอบ Q1 (ไม่เริ่มเลขใหม่รายเดือน) | ✅ 7 ต.ค. | RESUME |
| R4-7/8 | role migrate เป็นเจ้าของฟังก์ชัน · PG ≥ 11 | ✅ deploy เดียวกัน · PG 18.6 | runbook addendum |
| 1.6 / 1.7 | ซ้ำ AccountContact / บริษัทมี primary >1 | ✅ 0 / 0 | prod-probe-c61 |
| R10 | uiVersion ทุกร้าน = 1 · outbox ERROR `crm.*` 24 ชม. = 0 | ✅ (2 ระบบ CRM ใน 1 ร้าน · ไม่เคยมี event `crm.*`) | prod-probe-c61 |
| C6.0 R-1 | คีย์ทั่วไปใช้ tool AI ที่จะหาย? | ✅ ไม่มี (AI ไม่ถูกใช้ 30 วัน · คีย์ "Siamdive" ใช้แชทอย่างเดียว) | prod-probe-r1 |
| gate session/crm | typecheck · docs ×4 · fitness 42/42 · ชุด QC3 | ✅ 29 ขั้น | `.qc-shots/crm/main-c60.log` |
| ไม่ได้ทำก่อน deploy 1 | env parity (O5) · `qc-hf-o23` บน QC4 (O4) · เตรียม rollback build (7.6) | — | deploy ไปโดยไม่มี 3 ข้อนี้ |

### 7.2 ขั้น deploy (ทำซ้ำได้ — deploy 1 ใช้ขั้นนี้)
1. เจ้าของพิมพ์ "GO push" ในแชท (ทุกครั้ง)
2. ผู้คุมงาน push `session/crm` → `main` (ต้องเป็น fast-forward: `git merge-base --is-ancestor origin/main HEAD`) — เลือกชั่วโมงเงียบ ไม่ใช่ปิดงวดสิ้นเดือน · ก่อน push ต้อง `pnpm typecheck` ผ่าน iso (Vercel ตรวจ type `scripts/*.mts` ด้วย)
3. เฝ้า Vercel build (`scripts/vercel-build.sh`): `prisma migrate deploy` (4 folder เรียงชื่อ · คาดไม่กี่วินาที) → `migrate status` → `tsc --noEmit` (heap 6144) → `next build` · รวม 5–40 นาที · ⚠ ถ้า build ล้มหลัง migrate: โค้ดเก่าเสิร์ฟต่อบน schema ใหม่ (ปลอดภัยเพราะ additive + allocator M1 ข้ามเลขที่โค้ดเก่าเขียน) → แก้แล้ว deploy ใหม่ ห้าม Instant Rollback
4. ดึง checkout VPS `/root/projects/shark-in-th` ให้ตรง commit ที่ deploy (crm-cron รันโค้ดจากที่นี่ และเป็นตัว drain outbox ของทุกโมดูล)
5. crontab 3 บรรทัด — **ติดตั้งแล้ว** ไม่ต้องทำซ้ำ (ตรวจด้วย `crontab -l | grep crm-cron`) · ต้นฉบับอยู่ที่หัวไฟล์ `scripts/crm-cron.mts:16-18` (UTC · ใช้ `.env` ของ prod · ห้ามตั้ง `QC_ENV_FILE` ร่วมกับ DATABASE_URL ของ prod):
```
* * * * * cd /root/projects/shark-in-th && /usr/bin/flock -n /tmp/shark-crm-minute.cron.lock /usr/bin/pnpm exec tsx scripts/crm-cron.mts minute >> /var/log/shark-crm-cron.log 2>&1
7 * * * * cd /root/projects/shark-in-th && /usr/bin/flock -n /tmp/shark-crm-hourly.cron.lock /usr/bin/pnpm exec tsx scripts/crm-cron.mts hourly >> /var/log/shark-crm-cron.log 2>&1
40 20 * * * cd /root/projects/shark-in-th && /usr/bin/flock -n /tmp/shark-crm-daily.cron.lock /usr/bin/pnpm exec tsx scripts/crm-cron.mts daily >> /var/log/shark-crm-cron.log 2>&1
```
(daily 20:40 UTC = 03:40 ไทย หลัง `/api/cron/tick` · hourly/daily ห้ามเรียก `runDailyCron`)

### 7.3 Smoke หลัง deploy
(สถานะหลัง deploy 1: ข้อ "ไม่ล็อกอิน" + migration + cron = ทำแล้ว ✅ · ข้อบัญชี (N) / หน้า CRM v1 / คีย์ Siamdive / outbox = รอ smoke ของเจ้าของหรือไม่พบบันทึก — ⏳ รอผล — ผู้คุมงานเติม)
- ไม่ล็อกอิน: `/` 200 · `/login` 200 · `/app` 307 · มือถือแชท/conversations ไม่มี auth = 401
- `_prisma_migrations` up to date (รวม 4 ตัวใหม่) · `SELECT prosrc LIKE '%pg_advisory_xact_lock%', prosrc LIKE '%IF f - nv <= 1000 THEN%', proconfig FROM pg_proc WHERE proname='account_alloc_journal_no'` → true, true, `{search_path=pg_catalog, public}` · `acc_jno_%` = 260 (52 × 5)
- บัญชี (N): ใบแจ้งหนี้บริการ + หัก ณ ที่จ่าย 3 % (TI + WTI มีเลข · JV `RV-yyyy-mm-…`) · จ่ายผู้ขาย + 3 % (50 ทวิ มีเลข) · หน้า JV "สร้าง JV" เปิด 2 ครั้งเลขพรีวิวไม่ขยับ · ระบบบัญชีใหม่ → 5 sequence · **ลงบัญชีในระบบที่มีอยู่แล้ว 1 ครั้ง** (3b)
- หน้า CRM v1 บน prod ยังทำงาน (ตรวจภาพแบบ prod visual · dev ไม่ hydrate)
- คีย์ "Siamdive" ยังใช้แชท API ได้ (R-1) · พฤติกรรม hotfix 1–5 ต.ค. ยังอยู่
- `/var/log/shark-crm-cron.log` มีรอบ minute ทุกนาที ไม่มี error
- outbox: ไม่มี PENDING ค้าง > 5 นาที · OpsEvent ERROR ใหม่ = 0

### 7.4 สิ่งที่ต้องเฝ้า (อย่างน้อย 1 ชม. แรก แล้ว 24 ชม.)
| สัญญาณ | เกณฑ์ |
|---|---|
| log `[after-drain] fallback drain … did not start within 3000 ms` | ≤ 1/นาที/instance (run6 บน QC เห็น 6 ครั้ง · รอนานสุด 14.4 วินาที) |
| Vercel function duration p95/p99 · DB connection/pool error | ไม่เกิน 2× ฐานเดิม |
| outbox stale count + อายุ PENDING เก่าสุด | ไม่มี PENDING > ~5 นาทีที่ attempts 0 |
| `[account/gl] journal number allocation failed` · `journal sequences not created at setup` · P2002 บน AccountJournalEntry | 0 |
| 40P01 deadlock ตอนลงบัญชี | คาด 0 (เกิดได้เฉพาะตอน heal) |
| OpsEvent ERROR ของ outbox / consumer CRM | 0 รายการใหม่จาก CRM |

### 7.5 กฎถอย
| อาการ | ทำอะไร |
|---|---|
| CRM v2 ร้านนำร่องผิด | OWNER ของร้านกดสวิตช์กลับเป็นหน้าจอเดิม (action `setCrmUiVersionAction` — กลับ 1 ได้เสมอ · เขียน audit `crm.settings.uiVersion`) · consumer ผิด → `settings.crm.bridgesEnabled = false` · ข้อมูลอยู่ครบ |
| ต้องปิดสวิตช์ทั้งร้านนำร่อง (ไม่ให้กดไป 2 ได้อีก) | ลบ/แก้ env `CRM_V2_SWITCH_TENANTS` บน Vercel Production แล้ว redeploy (`scripts/pending/c6/vercel-env-switch.cjs` + `vercel-deploy-state.cjs`) — ระบบที่เป็น 2 อยู่แล้วยังเห็นสวิตช์เพื่อกดกลับ (`crm/settings/page.tsx:42`) |
| after-drain: PENDING > ~5 นาที attempts 0 · p95 > 2× · error จาก after-drain | กู้ไฟล์เดียว `src/lib/core/after-drain.ts` จาก bd435157 แล้ว deploy (ไม่มี schema/data) |
| ตัวจัดเลข JV ผิด | ถ้าจำเป็น: รันคำสั่ง `account_alloc_journal_no` ของ 000001 ซ้ำ (OR REPLACE) · **ห้ามรัน 000002 เดี่ยว** · ห้าม drop sequence · ไม่มี down-migration |
| ต้องถอยทั้ง release | Instant Rollback ไป `dpl_AQMM29am5Nt424reV1eu6WdFBDAd` ใช้ได้ **เฉพาะก่อนมีการลงบัญชีครั้งแรกใต้เลขแบบใหม่** (`crm-C6.1.md` §4 — หลัง deploy 1 ผ่านมาแล้วหลายชั่วโมง ให้ถือว่าใช้ไม่ได้ เว้นแต่ตรวจแล้วว่าไม่มี JV ใหม่) · หลังจากนั้น **ห้าม Vercel Instant Rollback ไป release ก่อน N** · ใช้ rollback build ที่เตรียมไว้ = release ก่อนหน้า + ส่วน N ของ `gl.ts` (journalNoParts/Display/allocate/peek/ensureJournalSequences + hook ensureAccounting) + peek ใน `journal/page.tsx` (ส่วน legal-tail ถอยได้) |
| hotfix 1–5 ต.ค. | ห้ามถอยข้าม — เปิดช่องโหว่ prod คืน |

### 7.6 ยังไม่พร้อม
- **rollback build สำหรับ N ไม่ได้เตรียมไว้** — ไม่มี branch/tag ชื่อ rollback/revert ทั้ง local และ origin · ไม่มีสคริปต์ใน `scripts/pending/` · บันทึก deploy (`crm-C6.1.md` §4) เขียนเพียง "code-only rollback via a new build" ⇒ ถ้าต้องถอยต้องสร้างตอนนั้นตามสูตรใน `wo-notes/crm-C5.4-N.md:514-516` / register R7
- Vercel function max duration เทียบหน้าต่าง claim 6 นาที (`LEASE_MS` — `src/lib/core/outbox.ts:20`): ใน repo มี `maxDuration` จุดเดียว = 60 วินาที ที่ `src/app/api/cron/outbox/route.ts:8` · `vercel.json` ไม่มีบล็อก `functions` ⇒ route อื่นใช้ค่าเริ่มต้นของแผน Vercel ซึ่งดูจาก repo ไม่ได้ (§11)

---

## 8. ชุดหลักฐาน

| หลักฐาน (MASTER §10) | อยู่ที่ไหน | สถานะ |
|---|---|---|
| 1. สถานะ+hash ทุกใบ · ORACLE-EDIT · HANDOVER | `CRM-MASTER-PLAN.md` §12 · `CRM-RUN.md` §3.1/§4 (ถึง 28 ก.ย.) · `CRM-RESUME.md` · ไฟล์นี้ | CRM-RUN ไม่อัปเดตหลัง 28 ก.ย. — log หลังจากนั้นอยู่ใน RESUME/wo-notes |
| 2. wo-notes ครบ 53 ใบ | `ledger/wo-notes/crm-*.md` (135 ไฟล์ ใน git ณ d82a8796) | มีครบถึง C6.2 · `crm-C3.10.md` ฉบับเต็ม (งานของเลน + ตารางสุดท้าย) อยู่บน `origin/wip/crm-c310` ยังไม่รวม · C6.3 ยังไม่มีโน้ต — ⏳ รอผล — ผู้คุมงานเติม |
| 3. diff ข้อสอบ ↔ ป้าย ORACLE-EDIT | git | ยังไม่ทำ (§4) |
| 4. qc:all รอบสุดท้าย (JSON_SUMMARY) | `/tmp/c310-logs/qc-all.log` + `status.txt` (สำเนาอยู่ใน `ledger/evidence/c310/` บน `origin/wip/crm-c310` — 91 ไฟล์) | รันบน QC1 ที่ reseed · ทรี 725f0e0a · **313/380 (rc=1)** · แดง 67 = บัญชี 34 (ระเบิดเวลาของ seed) · สมาชิก 25 · kanban-k2.3 · ด่าน env 4 · ของ CRM จริง: c1.2b S8.2, c3.7 X1.3 + S1/S2, verdict ของ crm-buttons → เลน C3.10 กำลังปิด · ตารางสุดท้าย: ⏳ รอผล — ผู้คุมงานเติม (รอบก่อน: ปิด C2 325/355 · ปิด C1 305/345) |
| 5. ภาพ 5 บทบาท × 2 จอ + `buttons/summary.json` | `.qc-shots/crm/<ใบ>/` · `.qc-shots/crm/buttons/*.json` · run5/run6/run7 ใน `/tmp/c42b-logs/` · ชุด PARITY: `/tmp/crm-parity/sheets/` + `/tmp/crm-parity/INDEX.md` (MOCKUP\|RENDER เทียบ `ledger/design-crm/01–17`) | `.qc-shots` gitignore · ผล PARITY (ผู้คุมงานเทียบด้วยตา): ⏳ รอผล — ผู้คุมงานเติม |
| 6. รายงานนักล่า + ตาราง finding → ข้อสอบ → commit | `wo-notes/crm-C5.2-L*.md` · `crm-C5.3.md` · `crm-C5.5-hunt-*.md` · probe ใน `scripts/pending/` | ใน git |
| 7. ตรวจ/ซ้อม migration prod + backfill | `crm-C6.1.md` · `crm-C6.2.md` · `ledger/evidence/c62/c62-apply-p15.log` (ใน git) · `.qc-shots/crm/prod-probe-c61-{pooled,direct}.log` · `neon-rehearse-{1,2}.log` · `c62-dryrun-1.log` · `c62-dryrun-p15.log` (gitignore) | P15 ทำแล้ว · ชุด `crm-backfill-*` dry-run เท่านั้น (§9.1) |
| 8. `.env` ไม่ถูกแตะ · ไม่มีชุดข้อสอบบน prod · ไม่มี EAS build | — | ยังไม่มีบันทึกยืนยันรวม (mtime ฯลฯ) |

**gate log ของการรวมแต่ละใบ** (gitignore): `.qc-shots/crm/main-{a-c43,authz,b,c,c2,d,d2,f,j3,n,ui,fix1…fix15,g1,g2,g3,c60}.log` · `c43-accept2*.log` · `c44-accept2/` · `c51fix-main.log` · `deploy-3677d983.log`

**ต้องคัดลอกออกจาก `/tmp` ก่อนส่งมอบ (หายเมื่อรีสตาร์ต):**
- `/tmp/c42b-logs/` (24 MB) — อย่างน้อย: `run5-verdict*.{txt,json}` · `run6-verdict.{txt,json}` · `run6-combined-verdict.{txt,json}` · `run6-tripwire.txt` · `run6-window-leftovers.txt` · `counts-{before,after}-run{5,6}.json` · `run6.sh` · `run6.md5` · `run6.status` · `cleanup-it7-apply-A.txt` · `cleanup-it7-readonly.txt` · `typecheck-main-land.log`
- `/tmp/c310-logs/` (3.8 MB · qc:all ของ C3.10 — เลนสั่งให้คัดลอกเข้า `ledger/evidence/c310/` แล้วบางส่วน) · `/tmp/crm-parity/` (ภาพ PARITY)
- `/tmp/c54c-logs/` (12 MB · เงิน C5.4-C r1–r14 รวม probe-cn RED) · `/tmp/c54n-logs` (N) · `/tmp/cf3-logs/` (migrate-deploy 000002/000003 บน QC2) · `/tmp/c55-logs` · `/tmp/cf2-logs` · `/tmp/cf*-logs` อื่นที่โน้ตอ้าง (48 โฟลเดอร์ `/tmp/*-logs` ณ 7 ต.ค. 23:05 UTC) · ⚠ วันนี้ container รีสตาร์ท 2 ครั้ง — `/tmp` รอดมาได้ แต่ไม่ควรพึ่ง
- ปลายทางแนะนำ: Drive ผ่าน rclone (`VPS-Archive/crm-v2-evidence/`) สำหรับของใหญ่ + commit สรุป verdict/tripwire/counts (ไม่กี่ KB) เข้า `ledger/evidence/` · `.qc-shots/crm/` ทั้งก้อนควรไป Drive

**สาขาที่เป็นบันทึก (ทั้งหมด push แล้ว):**
`session/crm` d82a8796 ณ เวลาที่เขียน (ตัวจริง) · `main` f132ce21 (prod) · `wip/crm-c310` cb7405de ณ เวลาที่เขียน (เลนปิด C3.10 — ยังเดินอยู่) · `wip/crm-c42b` 0fcda430 (runner/registry + helper lane: verdict.py, counts, tripwire, run6.sh) · `wip/crm-c60-merge-main` · `wip/crm-c61-linkpolicy` · `wip/crm-cf2/cf3/cf11/cf16/cf17/cf18/cf19/cf20` · `wip/crm-c54c-r8/c54d/c54e/c55/cd2/cj3/cui/hunt4/c42-it4` · hotfix: `rc/hotfixes-2026-10-01`, `hotfix/{sanitize-2026-10-01,apiv1-scope,pos-page-authz,hr-privacy,inventory-atomic,inventory-authz}`

---

## 9. งานที่ยังเปิด (C3.10 · C6.2 ส่วนที่เหลือ · C6.3 · PARITY · C6.4)

### 9.0 C3.10 — ปิดเฟส C3 (เลนเดียวบน `wip/crm-c310` · worktree `/root/projects/shark-crm-c310`)

สิ่งที่รู้แล้ว (จาก `wo-notes/crm-C3.10.md` บน `origin/wip/crm-c310` @ cb7405de):

| ข้อ | งาน | สถานะที่บันทึก |
|---|---|---|
| — | reseed QC1 + rebuild `:3215` จาก 725f0e0a + `pnpm qc:all` 380 ชุด | เสร็จ 20:00 UTC · 313/380 · rc=1 |
| 1 | c1.2b S8.2 ข้อสอบเก่า (เตือน 80 % ที่วัตถุตัวที่ 24) | ✅ 541a4b21 · 93/93 บน QC1 |
| 2 | c3.7 X1.3 ข้อสอบเก่า (ไม่นับ NOTE) | ✅ 9e4fe9a9 · X1.3 เขียว · ชุดได้ 24/30 (รอภาพ 390 px) |
| 3 | ตัวกดปุ่ม: ล้างคุกกี้ต่อบทบาท | ✅ 284614a6 · customer lock-out 94/94 · ตัวควบคุม (runner เก่า) ได้ 0/2 ⇒ hiddenLeak 28 = บั๊กตัวรัน |
| 4 | ทะเบียนปุ่ม (`crm-auto-rule-toggle` ของ manager = ปฏิเสธ · `crm-auto-action-field` ต้องมีข้อมูล) + fitness + typecheck ผ่าน iso | ✅ cb7405de · fitness 42/42 · typecheck rc=0 |
| 5a–5d | รันซ้ำเดี่ยว: owner `/deals` · owner `/settings/automation` · manager `/settings/commissions` · manager `/settings/automation` | ⏳ รอผล — ผู้คุมงานเติม |
| 6 | c2.1 รันเดี่ยว (S6.2 ลูก `member-m3.3`) | ⏳ รอผล — ผู้คุมงานเติม |
| 7 | ภาพ 390 px (visual-crm 3.7 owner+thana · shoot-crm) แล้วรัน c3.7 ให้ครบ 30 | ⏳ รอผล — ผู้คุมงานเติม |
| 8 | หลักฐานเข้า `ledger/evidence/c310/` | บางส่วนแล้ว (91 ไฟล์บนสาขาเลน) · ที่เหลือ ⏳ รอผล — ผู้คุมงานเติม |
| 9 | ตารางสุดท้าย + ลบ `scripts/qc-crm-buttons-prefix-c310.mts` (สำเนา runner เก่าสำหรับตัวควบคุม) | ⏳ รอผล — ผู้คุมงานเติม |

**ตารางสุดท้ายของ C3.10 (ทุกชุดแดง → สาเหตุ → ชั้น → ปิดด้วยอะไร):** ⏳ รอผล — ผู้คุมงานเติม
**ผู้คุมงานตรวจ + merge `wip/crm-c310` → `session/crm` + มติปิด C3.10:** ⏳ รอผล — ผู้คุมงานเติม
**CP3 (เจ้าของลอง QC):** ⏳ รอผล — ผู้คุมงานเติม

เกณฑ์ปิด (จากโน้ต): ชุด `crm-*` + crm-buttons ต้องเขียวหรือระบุสาเหตุฝั่ง CRM ได้ · แดงของ acc-v2/account-api จากระเบิดเวลาของ seed = หนี้สภาพแวดล้อมของ session บัญชี ไม่นับ CRM · ถ้าเลนตาย: เริ่มเลนใหม่จากบล็อก "Lane status at hand-over" + "Resume 3" ของโน้ตบนสาขาเลน (เลนตายพร้อม session เสมอ)

### 9.1 C6.2 backfill — ปิดแล้ว แต่มีส่วนที่ไม่มีบันทึกการรันจริง

| สคริปต์ | dry-run บน prod (7 ต.ค. · 10 ร้าน) | รันจริง |
|---|---|---|
| `scripts/pending/c54b/backfill-revoke-ended-portal.mts` (P15-2) | accesses 0 | ✅ `--apply` 22:33 UTC · revoked 0 · รอบสอง 0 |
| `scripts/pending/c54c/backfill-invoice-status.mts` (P15-3 ในฉบับร่าง = ข้อใบแจ้งหนี้) | candidates 2 · wouldFix 0 | ✅ `--apply` · applied 0/0 · รอบสอง เหมือนเดิม |
| `scripts/crm-backfill-lost-reasons.mts` | `siam-dive-center` +5 ต่อระบบ CRM (2 ระบบ = 10) | **ไม่พบบันทึก** — แต่สวิตช์ไป v2 เรียก `ensureLostReasons` ให้ระบบนั้นเอง (`switch-actions.ts:42-45`) |
| `scripts/crm-backfill-visibility.mts` | `siam-dive-center` +10 ต่อระบบ (= 20) | **ไม่พบบันทึก** — ไม่มีแถวก็ใช้ค่าเริ่มต้นในโค้ด STAFF→TEAM · MANAGER→ALL (`visibility.ts:219-222` `CRM_VIS_DEFAULT`) |
| `scripts/crm-backfill-party-links.mts` | `demo-review-1787213513937` Appointment 17 | **ไม่พบบันทึก** |
| `scripts/crm-backfill-companies-from-text.mts` · `-contact-names.mts` · `-stage-history.mts` | 0 ทุกร้าน | ไม่จำเป็น (ไม่มีแถว) |
| คีย์ API ไร้ผู้สร้าง (1 คีย์ = คีย์แชท "Siamdive" ของ SIAM DIVE CENTER) | — | ไม่มีสคริปต์ · ห้ามเพิกถอนจนกว่า O3 เสร็จ |
| ตัวเลือก: unique 1.6/1.7 (prod ไม่มีแถวซ้ำ) | — | ไม่ได้ทำ · เป็น migration ใหม่ ⇒ ต้องอนุมัติ |

ที่มา: `CRM-RESUME.md` บรรทัด 11:25 UTC ("3 non-zero … Waiting for the owner's \"ทำ\" per tenant") เทียบกับ `wo-notes/crm-C6.2.md` + commit d135854a ที่บันทึกเฉพาะ P15 ⇒ **ผู้คุมงานต้องยืนยันว่า 3 รายการที่ไม่เป็นศูนย์รันจริงหรือยัง / ตัดสินว่าไม่ต้องรัน: ⏳ รอผล — ผู้คุมงานเติม**
วิธีรัน (ผู้คุมงานเท่านั้น): `ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/crm-backfill-<ชื่อ>.mts --tenant <slug> --dry-run` จาก `/root/projects/shark-in-th` ที่ commit เดียวกับ prod · สคริปต์ P15 อ่าน `process.env.DATABASE_URL` ตรง ๆ ⇒ ดึงค่าด้วย `grep|cut` จาก `.env` + ด่านชื่อ host prod (`ep-royal-night`) · ห้าม `source .env` (URL มี `&`) · ห้ามพิมพ์ค่า

### 9.2 C6.3 ร้านนำร่อง

**กลไกสลับ (อ่านจากโค้ด):** ปุ่มสลับ v1↔v2 ที่ `/app/sys/[id]/crm/settings` แสดงเฉพาะ OWNER ของร้านเมื่อ `isCrmV2SwitchAllowed(tenantId)` = env `CRM_V2_SWITCH=all` หรือ tenant **id** (ไม่ใช่ slug) อยู่ใน `CRM_V2_SWITCH_TENANTS` คั่นด้วย `,` (`src/lib/modules/crm/ui-version.ts:66-75`) · กด → `setCrmUiVersionAction` → `setCrmSettingsKey(uiVersion)` (jsonb_set คำสั่งเดียว) + เติมเหตุผลแพ้ชุดกลางครั้งแรก + audit · ผู้คุมงานไม่ต้องเขียนฐานข้อมูลเอง

| ขั้น | สถานะ |
|---|---|
| 1. ร้านนำร่อง = `siam-dive-center` (SIAM DIVE CENTER · tenant `cmtazbpjh000004lcjikxju2i` · มี 2 ระบบ CRM ว่าง ทั้งคู่ v1) | ✅ เจ้าของเลือก 7 ต.ค. |
| 2. ตั้ง `CRM_V2_SWITCH_TENANTS` บน Vercel Production + redeploy `dpl_7tGsv841PgskzDmW32zRPQ6mwzQC` | ✅ READY · เสิร์ฟ shark.in.th แล้ว |
| 3. เจ้าของกดสวิตช์ที่ระบบ CRM `cmtdvo8h1000004l1d5tl5ej5` แล้วบอก "เปิดแล้ว" | รอเจ้าของ (O1) · เวลาที่เปิด: ⏳ รอผล — ผู้คุมงานเติม |
| 4. probe อ่านอย่างเดียวหลังเปิด (`scripts/pending/c6/prod-probe-c61.cjs`: uiVersion = 2 เฉพาะระบบนั้น · outbox ERROR 0) | ⏳ รอผล — ผู้คุมงานเติม |
| 5. เดิน 5 บทบาทตามพิมพ์เขียว §3 ทุกหน้า + ถ่ายภาพ · ใช้ผู้ติดต่อชั่วคราว tag `qc-prod-` แล้วลบ · ไม่ส่งอีเมล/LINE ถึงลูกค้าจริง ยกเว้นอีเมลเจ้าของ | ⏳ รอผล — ผู้คุมงานเติม |
| 6. P19: ส่งอีเมลจริง 1 ฉบับถึงอีเมลเจ้าของ แล้วตอบกลับ — Message-ID คงอยู่ไหม · เธรดถูกทำเครื่องหมายว่าตอบไหม · sequence หยุดไหม (fallback `+t` ไม่มี — §5.2) | ⏳ รอผล — ผู้คุมงานเติม |
| 7. เฝ้า 24 ชม. (§7.4: OpsEvent · outbox · `[after-drain]` · เลข JV) | ⏳ รอผล — ผู้คุมงานเติม |
| 8. มติ: คงไว้ที่ v2 / ถอย · เปิดร้านอื่นเมื่อเจ้าของสั่ง | ⏳ รอผล — ผู้คุมงานเติม |

ก่อนเดิน (จากฉบับร่าง · ยังไม่พบบันทึกว่าทำ): นับ `AutomationRun` ที่ eventKey ขึ้นต้น `custom.record.field_due#` (fix3b RV-2: > 0 ⇒ ต้องเพิ่มสะพาน ~10 บรรทัดก่อน — prod ตาราง v2 ว่าง จึงคาด 0) · ตัดสิน P9/P14 (ค่าเริ่มต้น = ไม่ตั้งทั้งคู่) · crontab log สะอาด ≥ 1 ชม. (ติดตั้งมาแล้ว > 11 ชม.)
**ถอย:** เจ้าของกดสวิตช์กลับ (§7.5) — ไม่ต้อง deploy

### 9.3 PARITY (เจ้าของสั่ง "ทำ parity" 7 ต.ค.)
เลนถ่ายภาพทุกหน้าของแบบ 01–17 · 4 บทบาท × 2 จอ จากทรีหลักบน `:3215` → แผ่นคู่ MOCKUP|RENDER ที่ `/tmp/crm-parity/sheets/` + `/tmp/crm-parity/INDEX.md` (เลนไม่ตัดสิน ไม่ commit) → ผู้คุมงานเทียบด้วยตากับ `ledger/design-crm/01–17` แล้วบันทึกผล
**ผล PARITY (ผ่าน/จุดต่างต่อแบบ):** ⏳ รอผล — ผู้คุมงานเติม

### 9.4 ชุดข้อสอบที่ยังค้างบนทรีที่รวมแล้ว
| ชุด | สถานะ | ใครทำ |
|---|---|---|
| `qc-hf-o23` | ต้องเป็น host QC4 (ด่านในชุด) — ยังไม่รัน | session POS / เจ้าของ (O4) |
| `qc-hf-hr-privacy` · `qc-hf-pos-page-authz` | ✅ เขียวบน QC1 ใน qc:all ของ C3.10 (194 · 56) — บน QC4 ไม่พบบันทึก | — |
| `qc-crm-c5.3` · `qc-crm-c51fix-equiv` · `qc-crm-perf` | มีด่าน "QC2 เท่านั้น" — ใน qc:all บน QC1 ไม่ได้ตรวจอะไร · ผลบน QC2 จาก gate C6.0 ยังใช้ | ผู้คุมงาน (ถ้าต้องการรอบใหม่) |
| C4.2 F1: chunk owner+manager `re:^/emails(/\[threadKey\])?$` | หนี้ C4.2 — ไม่พบบันทึกว่ารันแยก | รอบรันปุ่มถัดไป |
| แดงของ CRM ใน qc:all C3.10 | ดู §9.0 | เลน C3.10 |

### 9.5 C6.4 ที่เหลือหลังไฟล์นี้
ผู้คุมงานตรวจไฟล์นี้ → เติมทุกช่อง ⏳ (§13) → commit · คัดลอกหลักฐานออกจาก `/tmp` (§8) · บันทึก memory · Telegram · **หยุด รอ Fable ตรวจรอบสุดท้าย** (MASTER-PLAN §10: สุ่มรัน 5 ชุด + กลุ่ม X บน seed ใหม่ · เทียบภาพกับ mockup · นักล่า 4 เลนส์ · ตรวจ prod) · งานตรวจ diff ข้อสอบ ↔ ป้าย ORACLE-EDIT (§4 ท้าย) ยังไม่มีใครทำ

---

## 10. เริ่มงานจากศูนย์ (session ใหม่อ่านตรงนี้)

### 10.1 ของอยู่ที่ไหน

| ของ | ที่อยู่ |
|---|---|
| ทรีหลัก (ผู้คุมงาน) | `/root/projects/shark-crm` · branch `session/crm` · remote `origin/session/crm` |
| prod | `origin/main` f132ce21 · Vercel (`vercel.json` → `buildCommand: bash scripts/vercel-build.sh` · region `sin1`) · VPS checkout ที่ crontab ใช้ = `/root/projects/shark-in-th` (ต้องอยู่ที่ commit เดียวกับ prod เสมอ — **ไม่ใช่ที่ทำงาน ห้ามแก้**) |
| worktree ของเลน | `/root/projects/shark-crm-c310` (`wip/crm-c310` — เลนปิด C3.10) · `shark-crm-c42b` (`wip/crm-c42b` — ตัวกดปุ่ม + ตัวช่วย verdict/counts/tripwire) · เลนเก่า: `-c54d` `-c54e` `-cd2` `-cf2` `-cui` `-c60` `-c61l` (สาขาถูก push ครบ) |
| จุดต่องาน | `ledger/CRM-RESUME.md` — อ่านบรรทัด `> **▶️ / 🧳 / ✅` ท้ายบล็อก §0.23 (ราวบรรทัด 100–112) ก่อน แล้วค่อยอ่าน §0.23 A–C |
| แผน + สถานะต่อใบ | `ledger/CRM-MASTER-PLAN.md` §12 (ตารางสด) · §12B (คู่มือกู้สถานการณ์) · §10 (ชุดหลักฐานส่งมอบ) |
| หนี้ / มติ / runbook | `ledger/CRM-C6-REGISTER.md` (§1 candidate · §2 runbook R1–R12 · §3 เรื่องรอเจ้าของ · §4 หนี้ · §6c แดงที่ทราบ · §6d ลำดับ reseed QC1) |
| เรื่องรอเจ้าของ | `ledger/CRM-OWNER-PENDING.md` (P1–P21) · `ledger/CRM-OWNER-QUESTIONS.md` |
| บันทึกต่อใบ | `ledger/wo-notes/crm-*.md` (135 ไฟล์) · brief: `ledger/crm-briefs/` · log ยุค C0–C3: `ledger/CRM-RUN.md` (ไม่อัปเดตหลัง 28 ก.ย.) |
| แบบ UI | `ledger/design-crm/01–17` (`.html` + `.png`) · พิมพ์เขียว `ledger/DESIGN-CRM.md` |
| โค้ด | `src/lib/modules/crm/**` · หน้า `src/app/app/sys/[id]/crm/**` · REST `src/app/api/v1/crm` + `src/lib/modules/crm/api/**` · สาธารณะ: `/b/[slug]` (portal) · `/u/[token]` · `/l/[code]` · `/t/{c,e,o,s,v,consent}` |
| ข้อสอบ | `scripts/qc-crm-*.mts` (ต่อใบ) · `scripts/qc-crm-buttons.mts` + `scripts/crm-ui-inventory.json` (1,069 แถว) · `scripts/crm-journeys/` · `scripts/visual-crm.mts` · probe ของใบ: `scripts/pending/<ใบ>/` |
| สคริปต์ prod (ผู้คุมงานเท่านั้น) | `scripts/pending/c6/`: `prod-probe-c61.cjs` (อ่านอย่างเดียว) · `prod-probe-r1-apikey-ai.cjs` · `prod-tenants.cjs` · `neon-rehearse-migrations.cjs` · `vercel-env-switch.cjs` · `vercel-deploy-state.cjs` |
| หลักฐาน | ใน git: `ledger/evidence/` (`c62/` · `c310/` บนสาขาเลน) · นอก git: `.qc-shots/crm/**` · `/tmp/*-logs/` (§8) |
| cron | `crontab -l` บน VPS (3 บรรทัด `crm-cron.mts minute|hourly|daily`) · log `/var/log/shark-crm-cron.log` |

### 10.2 รัน QC อย่างปลอดภัย (กฎที่ละเมิดแล้วเครื่องดับจริง)

1. **ทุกคำสั่งหนัก** (ชุดข้อสอบ · ตัวกดปุ่ม · visual · fitness · typecheck · build) ต้องห่อสองชั้น:
   `bash scripts/iso.sh bash scripts/with-gate-lock.sh <คำสั่ง>`
   - `scripts/iso.sh` = รันใน systemd unit แยก (นอก cgroup 5 GB ของ session · `MemoryMax` ปรับด้วย `ISO_MEM` เช่น `ISO_MEM=7000M` สำหรับ typecheck · ตั้ง `QC_ENV_FILE=.env.qc` ให้เอง)
   - `scripts/with-gate-lock.sh` = คิวงานหนักของทั้งเครื่อง (`/tmp/shark-gate.lock`; typecheck/build/serve ถือล็อก QC2+QC3 ด้วย)
   - 7 ต.ค. container รีสตาร์ท 2 ครั้งเพราะเลนรัน c3.7 ตรง ๆ ใน session (node 4.6 GB > 5 GB)
   - pre-commit hook รัน fitness ใน cgroup ของ session ⇒ เลน C3.10 commit ด้วย `--no-verify` ตามคำสั่งผู้คุมงาน แล้วรัน fitness ผ่าน iso แทน
2. **ฐาน QC1 เท่านั้นสำหรับช่วงปิดงาน** (`.env.qc` · host ขึ้นต้น `ep-plain-art`) · QC2 = `scripts/qc2.sh` (`ep-cool-shadow` — ชุด c5.3 / c51fix-equiv / perf มีด่าน QC2) · QC3 = `scripts/qc3.sh` · **QC4 (`ep-frosty-lab`) เป็นของ session POS — ห้ามแตะ และไม่มี `.env.qc4` ที่นี่** · ห้ามรันชุดข้อสอบใด ๆ ใส่ prod
3. **`scripts/crm-expected.json` (และ `member-`/`acc-v2-expected.json`, `scripts/fixtures/**`) = เฉลยของ seed ปัจจุบัน — เก็บในเครื่องเท่านั้น ห้าม commit** · worktree ของเลนต้องคัดลอกจากทรีหลักหลัง reseed (เฉลยเก่า ⇒ K.1 ล้มแล้วชุดตายด้วย FK ของ session)
4. reseed QC1 ทำจาก**ทรีหลักเท่านั้น** (`scripts/qc-owner-guard.mts` — worktree อื่น exit 5) ตามลำดับ register §6d · `qc-member-m1.1` รัน seed สมาชิกซ้ำและ**ลบข้อมูล CRM** ⇒ วางไว้ก่อน seed CRM เท่านั้น · seed บัญชี (`seed-acc-v2-qc.mts`) ล้มตามนาฬิกาจริง — เลน C3.10 ใช้วิธีเลื่อนนาฬิกา (`/tmp/c310-logs/` `run-accv2-reseed-c310b.sh`)
5. ชุด UI/ปุ่ม/visual ต้องมี server `:3215` ที่ build จาก HEAD ที่ทดสอบ (`bash scripts/acc-v2-serve.sh stop` → ก๊อป `scripts/pending/run-rebuild-3215-*.sh` เป็นชื่อใหม่แล้วรันเป็น unit) · env ของรอบ: `CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:3215 SHARK_AI_MOCK=1` · ตรวจ BUILD-STATE ก่อนเชื่อผล (7 ต.ค.: 11:33 เสิร์ฟจาก c42b build 86724927 → 12:10 rebuild จากทรีหลัก 725f0e0a)
6. ห้ามแก้สคริปต์ที่ unit กำลังรัน (ก๊อปเป็นชื่อใหม่ทุกรอบ) · ห้ามยิง Bash ขนานเมื่อมีคำสั่ง `cd` (commit ลงผิดสาขามาแล้ว 3 ครั้ง) · ก่อนเขียน ledger เช็ก `pwd` + branch
7. เลนตายพร้อม session เสมอ ⇒ สั่งเลน commit + push หลังจบทุกข้อ และเขียนสถานะลงโน้ตของใบ · เพดานเลนล่าสุด = 3 (เจ้าของ 23:02 UTC) · งานหนักทีละ 1 ผ่าน gate lock
8. เวลาใน ledger ต้องมาจาก `date -u` — บรรทัดท้าย `CRM-RESUME.md` บางบรรทัดลงเวลา 23:15 / 23:2x UTC ขณะที่นาฬิกาเครื่องตอนเขียนไฟล์นี้คือ 23:05 UTC และบรรทัด 🧳 (~22:50) มาก่อนบรรทัด ▶️ (22:44) — ลำดับเหตุการณ์ถูก แต่อย่าอ้างนาทีจากบรรทัดเหล่านั้น

### 10.3 แตะ prod ได้แค่ไหน

- push ขึ้น `main` = deploy = เสียเงิน → ต้องมี "GO push" ของเจ้าของในแชททุกครั้ง · ก่อน push: fast-forward + typecheck ผ่าน iso
- อ่านอย่างเดียว: `scripts/pending/c6/prod-probe-c61.cjs` (`BEGIN READ ONLY` · โหลด env เองในโปรเซส) — ผู้คุมงานรันได้ตามมติ 7 ต.ค. · เลน/ตัวแทนห้ามแตะ prod
- เขียน prod: เฉพาะ backfill ที่เจ้าของสั่ง "ทำ" (§9.1) และการเพิกถอนคีย์เก่าหลัง O3
- ห้ามอ่าน/พิมพ์ `.env*` ในแชทหรือ ledger · ห้าม `source .env` · ชื่อตัวแปรที่เกี่ยวกับ CRM: `CRM_V2_SWITCH` · `CRM_V2_SWITCH_TENANTS` · `ALLOW_PROD_BACKFILL` · `QC_ENV_FILE` · `RESEND_WEBHOOK_SECRET` · `CRM_INBOUND_AUTHSERV_ID` · `EMAIL_INBOUND_SECRET` · `SESSION_SECRET` · `APP_URL` · `BUNNY_ACCOUNT_KEY` · `SHARK_AI_MOCK` · `QC_BASE` · (CI) `NEON_API_KEY` `NEON_PROJECT_ID`

### 10.4 กับดักที่รู้แล้ว

| กับดัก | ผล | ทำอย่างไร |
|---|---|---|
| `crm-cron.mts` + `QC_ENV_FILE` ร่วมกับ `DATABASE_URL` ของ prod ที่ค้างใน shell | สคริปต์หยุด exit 4 (ด่านกันหลุด prod) | `unset DATABASE_URL DIRECT_URL` ก่อนรันโหมด QC |
| VPS checkout `shark-in-th` ไม่ตรง commit ที่ deploy | crm-cron (ตัว drain outbox ของ**ทุกโมดูล**) ประมวลผล event ด้วยโค้ดคนละรุ่น | ทุก deploy: ดึง `shark-in-th` ให้ตรง + `pnpm install --frozen-lockfile` + `prisma generate` |
| Vercel build ตรวจ type `scripts/*.mts` ด้วย | prod deploy ล้ม (เคย 3 รอบ) | `pnpm typecheck` ผ่าน iso ก่อน push · ข้อสอบล่วงหน้าใช้ `await import("…" as string)` |
| build ล้ม**หลัง** migrate | โค้ดเก่าเสิร์ฟบน schema ใหม่ (ปลอดภัยเพราะ additive) | แก้แล้ว deploy ใหม่ — ห้าม Instant Rollback (§7.5) |
| ตัวกดปุ่มบน `session/crm` ยังใช้คุกกี้ร่วมทุกบทบาท | hiddenLeak ปลอม 28 เมื่อรัน 5 บทบาทในโปรเซสเดียว | ใช้ runner จาก `wip/crm-c310` 284614a6 หรือรัน `--user customer` แยกโปรเซส จนกว่าจะรวม |
| qc:all แดงบัญชี 34 ชุด | ไม่ใช่ regression ของ CRM | ดู `crm-C3.10.md` §Reds · ส่งต่อ session บัญชี |
| ชุดที่อ่าน skill docs (`c3.8 S7.1`, `m1.11`, `k1.15`, `account-api-docs`) แดงใน worktree | `.claude/skills/shark-*-api/` เป็น gitignore | สร้างใหม่ด้วย generator (`scripts/gen-crm-api-docs.mts` ฯลฯ) ในทรีที่รัน |
| ส่งข้อความข้าม session / `tg` ถูกบล็อกเป็นครั้งคราว | เจ้าของ/ session POS ไม่ได้รับ | เขียนลง `CRM-OWNER-QUESTIONS.md` + สรุปในแชท ให้เจ้าของส่งต่อเอง |
| คีย์แชท "Siamdive" เป็นคีย์ไร้ผู้สร้างตัวเดียวบน prod | เพิกถอนก่อนสลับ = แชท SiamDive ดับ | ทำตามลำดับ O3 |
| ร้าน `siamdive` (slug) ≠ `siam-dive-center` | `siamdive` ไม่มีระบบ CRM | ร้านนำร่องคือ `siam-dive-center` · env ใช้ tenant **id** |
| `/root/projects/shark` (ไม่มี `-in-th`/`-crm`) | prototype ตาย | ไม่ใช้ |

---

## 11. ต้องถามเจ้าของ / ยังหาไม่พบ

### 11.1 ผลการไล่ 12 ข้อในภาคผนวกของฉบับร่าง

| # | ข้อเท็จจริง | ผล | แหล่ง |
|---|---|---|---|
| 1 | commit ที่รับ C1.9 · C1.10 · C1.11 · C2.0 | ✅ พบ: `b01b3b72` · `41c8d2a0` · `02ba30bc` · `965c0bbd` | `git log -G'\| C1.9 \| ✅' -- ledger/CRM-MASTER-PLAN.md` (commit แรกที่ทำแถวเป็น ✅) + ข้อความ commit |
| 2 | หลักฐาน C3.10 · วิธีนับ 49/53 | ✅ พบ: C3.10 ไม่เคยทำก่อน 7 ต.ค. — เริ่ม 11:34 UTC (131f63ae) ยังไม่ปิด · ตัวนับเกิน 1 เพราะ a09363c4 นับ C2.7-fix (35→37) | `git log --grep='/53'` · `wo-notes/crm-C3.10.md` · MASTER-PLAN §12 บรรทัดสรุป 53 ใบ |
| 3 | "UI fix" ของ C5.4 = commit ใด | ✅ พบ: `03848b5b` (C4.2-fix + C4.4-fix2) | `CRM-RESUME.md:255` และ `:331` |
| 4 | เนื้อหา C6.0 R-3 | ✅ พบ (§5.3) | `wo-notes/crm-C6.0-merge-main-review.md:46` + โค้ด `src/app/api/v1/ai/tools/[name]/route.ts:56` |
| 5 | rollback build ของ N | ❌ ไม่พบ = ไม่ได้เตรียม (§7.6) | ค้น: `git branch -a` + `git tag` (คำ rollback/revert) · `scripts/pending/` · register R7 · `crm-C5.4-N.md:514-516` · `crm-C6.1.md` §4 |
| 6 | วิธีตั้ง `uiVersion = 2` บน prod | ✅ พบ (§9.2) | `src/lib/modules/crm/ui-version.ts:66-75` · `switch-actions.ts:20-63` · `crm/settings/page.tsx:42` · `CRM-RESUME.md` บรรทัด "C6.3 switch mechanism" |
| 7a | P19 fallback `+t` สร้างหรือยัง | ✅ พบ: **ยังไม่สร้าง** | โค้ด `src/lib/modules/crm/emails.ts:2528-2536, 2655-2665, 2759` · register §7 ข้อ 6 |
| 7b | C2.10 B1 คอลัมน์ AppNotification | ✅ พบ: **ไม่ได้สร้าง** (รับเป็นข้อจำกัด) | `prisma/schema/automation.prisma` model `AppNotification` · `wo-notes/crm-C2.10.md:34` · `CRM-RESUME.md:41` |
| 7c | รายการคอลัมน์ "nullable → NOT NULL" (C3.0) | ❌ ไม่พบ — แหล่งเองไม่เคยมีรายการ | ค้น: `wo-notes/crm-C3.0.md:40` (ประโยคเดียว) · register แถว 1.8 ("unspecified list") + §7 ข้อ 5 ("No list found") |
| 8a | สถานะ env parity | ❌ ไม่พบ | ค้น: `CRM-RESUME.md` (มีแต่ "how-to sent in chat" / "owner-side still owed") · `crm-C6.1.md` §1, §4 |
| 8b | Vercel function max duration | ◐ พบบางส่วน: `maxDuration = 60` เฉพาะ `src/app/api/cron/outbox/route.ts:8` · `vercel.json` ไม่มี `functions` | ค่าเริ่มต้นของแผน Vercel ดูจาก repo ไม่ได้ |
| 8c | secret NEON ใน CI | ◐ พบกลไก: `.github/workflows/ci.yml:84-90` ข้าม T1 ถ้าไม่มี `NEON_API_KEY`/`NEON_PROJECT_ID` | ตั้งไว้จริงหรือไม่ ดูไม่ได้ (`gh` ไม่ได้ล็อกอินบนเครื่องนี้) |
| 9 | deploy id เต็มของ prod ก่อน deploy 1 | ✅ พบ: `dpl_AQMM29am5Nt424reV1eu6WdFBDAd` | `wo-notes/crm-C6.1.md:35` · `CRM-RESUME.md` บรรทัด 🚀 11:10 UTC |
| 10 | นโยบาย "คีย์ทั่วไปเฉพาะ OWNER" ในโค้ด | ✅ พบ: **ยังไม่ได้สร้าง** (§6.4) | `src/app/app/settings/api/actions.ts:35-36` (`api.key.create` อย่างเดียว) · `git log` ของไฟล์ (ล่าสุด 6c2a6c60 · 16 ก.ค.) · register บรรทัด 295 |
| 11 | คีย์ไร้ผู้สร้าง = คีย์ "Siamdive" | ✅ พบ: ใช่ | `wo-notes/crm-C6.2.md:12` · `crm-C6.0-merge-main.md:108` · `crm-C6.1.md` §1 (active 1 คีย์ · `createdById` NULL) |
| 12 | ผลตรวจของ C0.1 | ✅ พบ (§2) | `wo-notes/crm-C0.1.md:41` (D9) และ `:82` |

### 11.2 ยังต้องถาม / ยืนยัน

| # | เรื่อง | ถามใคร | ค้นแล้วที่ไหน |
|---|---|---|---|
| Q-A | env parity VPS ↔ Vercel ทำแล้วหรือยัง (`SESSION_SECRET` `APP_URL` ตรงกันไหม) — มีผลต่อ token อีเมล/ยกเลิกรับ (D2-N3) | เจ้าของ | RESUME · C6.1 |
| Q-B | เจ้าของ smoke แบบล็อกอินหลัง deploy 1 แล้วหรือยัง + มีการลงบัญชีใต้เลข JV ใหม่แล้วหรือยัง (ตัดสินว่า Instant Rollback ยังใช้ได้ไหม) | เจ้าของ | C6.1 §4 |
| Q-C | backfill `crm-backfill-*` 3 รายการที่ไม่เป็นศูนย์ — รันจริงแล้ว / ไม่ต้องรัน? | ผู้คุมงาน (ถ้าไม่เคยรัน → เจ้าของ) | RESUME · C6.2 · evidence/c62 · git log |
| Q-D | จะเตรียม rollback build ของ N ไว้ไหม | ผู้คุมงาน | §11.1 ข้อ 5 |
| Q-E | รายการคอลัมน์ที่จะทำ NOT NULL (C3.0) — มีจริงไหม หรือปิดข้อนี้ทิ้ง | ผู้คุมงาน | §11.1 ข้อ 7c |
| Q-F | Vercel plan max duration ของ function ทั่วไป · secret NEON ของ GitHub Actions ตั้งแล้วหรือยัง | เจ้าของ (หน้า dashboard) | §11.1 ข้อ 8b/8c |
| Q-G | ตัวเลขสุดท้ายจะรายงาน 53/53 หรืออธิบายว่านับ C2.7-fix ด้วย | ผู้คุมงาน | §1 |
| Q-H | สร้างกฎ "คีย์ทั่วไปเฉพาะ OWNER" + fallback `+t` (P19) เป็นใบตามหลัง หรือรับเป็นหนี้ | เจ้าของ/ผู้คุมงาน | §11.1 ข้อ 7a, 10 |
| Q-I | ระบบ CRM ตัวที่สองของ SIAM DIVE CENTER (id ไม่อยู่ใน ledger) จะเปิด v2 ด้วยไหม | เจ้าของ | RESUME บรรทัด 22:34 / 22:40 ("the first of the two empty CRM systems") |

---

## 12. สิ่งที่แก้จากฉบับร่าง (`HANDOVER-2026-10-CRM-DRAFT.md` @ 7327c424)

เมื่อฉบับร่างกับโค้ด/บันทึกล่าสุดไม่ตรงกัน ยึดโค้ดและบันทึกล่าสุด

| # | ฉบับร่างเขียน | แก้เป็น | เหตุ |
|---|---|---|---|
| 1 | สถานะ 49/53 · C6.1 เหลือ crontab · C6.2–C6.4 รอ "GO push" | 51/53 · C6.1 ✅ (deploy 1 + crontab) · C6.2 ✅ · C6.3 รอสวิตช์ | `CRM-RESUME.md` บรรทัด 🎉 11:21 / ✅ 22:34 · MASTER-PLAN §12 |
| 2 | prod = `origin/main` f85f5455 · `dpl_AQMM29am…` · C4–C6.0 "ขึ้นกับ deploy ถัดไป" · migration 4 ตัวยังไม่ขึ้น · ไม่มี crontab | prod = f132ce21 · `dpl_7tGsv841PgskzDmW32zRPQ6mwzQC` · ทุกอย่างขึ้นแล้ว · crontab ติดตั้งแล้ว (เขียนตาราง §1 ใหม่ · เพิ่ม §7.0) | `crm-C6.1.md` §4 · `git rev-parse origin/main` |
| 3 | "session/crm = origin/main + 280 commit" | deploy 1 = fast-forward 281 commit (f85f5455..f132ce21) · วันนี้ `session/crm` นำ main เฉพาะ ledger + scripts | `crm-C6.1.md:35` · `git diff --name-only` |
| 4 | C1.9 / C1.10 / C1.11 / C2.0 commit "ไม่พบในบันทึก" | b01b3b72 / 41c8d2a0 / 02ba30bc / 965c0bbd | git log |
| 5 | C0.1 ผู้ตรวจ "ไม่พบบรรทัดผลตรวจ" | 2 รอบ · ไม่เหลือ BLOCKER | `crm-C0.1.md:41,82` |
| 6 | C3.10 "⚠ ไม่พบหลักฐานว่าทำ" · "qc:all … ยังไม่มีบนทรีที่รวมแล้ว" | กำลังปิด · qc:all 313/380 แล้ว · ผลสุดท้ายเป็น ⏳ | `crm-C3.10.md` (ทั้งสองสาขา) |
| 7 | C4.2-fix = "UI fix" (อนุมาน) | ยืนยัน 03848b5b | `CRM-RESUME.md:255,331` |
| 8 | ทะเบียนปุ่ม 1,066 แถว | 1,066 ตอนรับ · ปัจจุบัน 1,069 (+3 แถว link hosts) | นับ `rows` ใน `scripts/crm-ui-inventory.json` · `crm-C3.10.md` Resume 3 |
| 9 | หนี้ "ตัวกดปุ่มยังไม่มี fixture linkHosts — lane กำลังทำ" (§5.3, §9.3) | ปิดแล้ว 02bfa7cb (run7 184/184) · เพิ่มแถว C4.2-fix-linkhosts ใน §2 | `CRM-RESUME.md` บรรทัด 11:33 UTC |
| 10 | `qc-hf-hr-privacy` / `qc-hf-pos-page-authz` "ยังไม่ได้รัน · ต้อง QC4" | เขียวบน QC1 ใน qc:all C3.10 (194 · 56) · ค้าง QC4 เฉพาะ `qc-hf-o23` | `crm-C3.10.md` ช่วง 19:38 UTC |
| 11 | C6.0 R-3 "ไม่พบ" | ข้อความ 403 พูดถึงสมุดบัญชีกับคีย์บอร์ดงาน (LOW) | review `:46` |
| 12 | P19 fallback `+t` "ไม่พบในบันทึก" | ยังไม่ได้สร้าง (ตรวจโค้ด) | `emails.ts` |
| 13 | "คีย์ทั่วไปเฉพาะ OWNER — การสร้างจริงยังไม่พบ" | ยังไม่ได้สร้าง (ตรวจโค้ด) | `settings/api/actions.ts:35-36` |
| 14 | rollback build "ยังไม่พบว่าเตรียมไว้" | ไม่ได้เตรียม + deploy ไปแล้ว ⇒ กฎ Instant Rollback เปลี่ยนเป็น "ได้เฉพาะก่อนลงบัญชีครั้งแรกใต้เลขใหม่" | `crm-C6.1.md` §4 |
| 15 | วิธีสลับ v2 บน prod "ไม่พบ" · ทางถอย = ตั้ง `settings.crm.uiVersion = 1` | สวิตช์ของ OWNER หลัง env `CRM_V2_SWITCH_TENANTS` (tenant id) · ทางถอย = กดสวิตช์กลับ | `ui-version.ts` · `switch-actions.ts` |
| 16 | §6.1 A1–A6 (GO push · ร้านนำร่อง · อนุมัติ backfill · QC4) รอทั้งหมด | เขียนใหม่เป็น O1–O8 ตามสถานะจริง | RESUME §0.23 |
| 17 | §9.1 backfill "ยังไม่ทำ · คาด no-op" | P15 ทำแล้ว (0) + ตัวเลข dry-run จริง + ชี้ว่า 3 รายการไม่มีบันทึกรันจริง | `crm-C6.2.md` · RESUME 11:25 |
| 18 | wo-notes 133 ไฟล์ · C3.10 ไม่มีโน้ต | 135 ไฟล์ · มี `crm-C3.10.md` + `crm-C6.2.md` | `git ls-files` |
| 19 | สาขา: `session/crm` 7327c424 · `main` f85f5455 | d82a8796 / f132ce21 + `wip/crm-c310` | git |
| 20 | ชื่อ migration แบบย่อ (`crm_v2_a` …) | ใส่ชื่อโฟลเดอร์เต็ม (`20261031000000_crm_v2_a` …) | `ls prisma/migrations` |
| 21 | "5 บทบาท" ไม่ระบุชื่อ | `owner` `manager` `nok` `thana` `customer` | `scripts/qc-crm-buttons.mts:121` |
| 22 | คำว่า "มีบน prod วันนี้" ของบั๊กเลข JV / after-drain | ปรับเป็น "มีจนถึง deploy 1" | deploy 1 |
| 23 | ไม่มีหัวข้อเริ่มงานจากศูนย์ / กับดัก / รายการ ⏳ | เพิ่ม §10 · §11 · §13 | ใบสั่ง C6.4 |

ตรวจแล้ว**ไม่ต้องแก้**: sha ทุกตัวในตาราง §2–§4 (เป็น commit จริงและอยู่ใน `origin/main`; `71120e8e` / `f102f258` เป็น md5 ไม่ใช่ commit) · ชื่อสคริปต์ backfill 8 ตัว · บรรทัด crontab 3 บรรทัด (ตรงกับหัว `scripts/crm-cron.mts`) · ขั้นของ `scripts/vercel-build.sh` (migrate deploy → migrate status → tsc heap 6144 → next build) · ป้าย ORACLE-EDIT 337 บรรทัด + 31 ไฟล์ pending · เส้นทาง `/b/[slug]` `/u/[token]` `/l/[code]` `/t/c/[token]` · AI tool 32 ตัว (`.claude/skills/shark-crm-api/SKILL.md:29`)
**ไม่ได้ตรวจซ้ำ** (ยกมาจากฉบับร่างตามบันทึก): จำนวนข้อสอบผ่านต่อใบ · จำนวน op 122 · สิทธิ์ 51 คีย์ · รายละเอียดบั๊ก §3 · ตารางหนี้ §5 นอกจากแถวที่ระบุว่าแก้

---

## 13. รายการช่อง ⏳ ที่ผู้คุมงานต้องเติมก่อนปิด

| # | ที่ | เติมอะไร |
|---|---|---|
| 1 | §1 · §11.2 Q-G | ตัวเลขสุดท้าย (53/53 หรือคำอธิบายตัวนับ) |
| 2 | §2 แถว C3.10 · §9.0 | ผลข้อ 5a–5d · 6 · 7 · 8 · 9 · ตารางสุดท้าย · merge `wip/crm-c310` + มติปิด · CP3 |
| 3 | §4 | มติ ORACLE-EDIT ของ c1.2b S8.2 · c3.7 X1.3 · ทะเบียนปุ่ม (เลน C3.10) |
| 4 | §5.3 | การรวม runner ที่ล้างคุกกี้ต่อบทบาทเข้า `session/crm` |
| 5 | §2 แถว C6.3 · §9.2 ขั้น 3–8 | เวลาที่เจ้าของเปิด · probe หลังเปิด · เดิน 5 บทบาท · ผล P19 (§6.2) · เฝ้า 24 ชม. · มติ |
| 6 | §7.3 | ผล smoke แบบล็อกอินหลัง deploy 1 (O2) |
| 7 | §8 แถว 2 | โน้ต C6.3 + โน้ต C3.10 ฉบับรวม |
| 8 | §8 แถว 4 | ตารางสุดท้ายของ qc:all |
| 9 | §8 แถว 5 · §9.3 | ผล PARITY |
| 10 | §9.1 | backfill 3 รายการ: รันแล้ว / ไม่ต้องรัน |
| 11 | §2 แถว C6.4 | commit ของไฟล์นี้ |
