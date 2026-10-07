# HANDOVER — CRM v2 (ร่าง C6.4) · 7 ต.ค. 2026

> **ร่างโดยผู้วิเคราะห์อ่านอย่างเดียว** (ไม่แตะ DB / server / test / build) จาก `session/crm` @ `7327c424` (= `54cad0b2` + บันทึกซ้อม migration)
> แหล่ง: `CRM-MASTER-PLAN.md` §6/§9/§10/§12 · `CRM-RESUME.md` §0.21–§0.23 · `CRM-C6-REGISTER.md` · `CRM-OWNER-PENDING.md` · `CRM-OWNER-QUESTIONS.md` · `wo-notes/crm-*.md` (หัว + บรรทัดผลตรวจสุดท้าย) · `git log origin/main..session/crm` · `prisma/migrations/2026110*` · `scripts/crm-cron.mts` · `scripts/vercel-build.sh`
> ข้อความ "**ไม่พบในบันทึก**" = ไม่เจอในแหล่งข้างบน ไม่ได้เดา · ผู้คุมงานเป็นผู้ commit ไฟล์นี้

---

## 1. สรุป 1 หน้า

**CRM v2 คืออะไร** — ระบบลูกค้าสัมพันธ์รุ่นใหม่ของ SHARK ที่สร้างทับ CRM v1 ภายในโมดูลเดิม (`src/lib/modules/crm/**`, หน้า `src/app/app/sys/[id]/crm/**`) เปิดต่อร้านด้วยค่า `settings.crm.uiVersion` (1 = หน้าเดิม · 2 = v2) ทุกร้านบน prod วันนี้ยังเป็น 1

| กลุ่ม | สิ่งที่มี (ใบที่สร้าง) |
|---|---|
| ข้อมูลหลัก | ผู้ติดต่อ + แปลง lead + ความยินยอม (C1.4) · บริษัท (C1.3) · ดีล/pipeline/ขั้น/เหตุผลแพ้ (C1.5) · กิจกรรม/ปฏิทิน/โน้ต/ไฟล์/@mention (C1.6) · วัตถุกำหนดเอง + เทมเพลต 8 (C1.2a/b, C1.9) |
| ทีมและสิทธิ์ | สิทธิ์ 51 คีย์ · มองเห็น OWN/TEAM/ALL · ทีมขาย (C1.7) |
| เครื่องยนต์ขาย | อีเมล (ส่ง/รับ/เธรด/ติดตาม/unsubscribe · C2.5) · ลำดับติดตาม sequences (C2.2) · มอบหมาย lead (C2.3) · บันทึกการโทร/นามบัตร/AI (C2.4) · tracking ลิงก์/QR/shark.js/ฟอร์ม (C2.6) · คะแนน (C2.8) · automation (C2.1) · เหตุการณ์ธุรกิจ 8 โมดูล (C2.9) · ดีลนิ่ง+แจ้งเตือน (C2.10) · สะพานบัญชี/POS (C2.7) |
| ทีม/รายงาน/portal | รายงาน 8 แท็บ + export + ตั้งเวลา (C3.1) · โควตา + หน้าแรก KPI (C3.2) · คอมมิชชัน → payroll (C3.3) · AI ในหน้า + ห้องทีม (C3.4) · portal ลูกค้า B2B `/b/[slug]` (C3.5) · หน้าเชื่อมระบบ (C3.6) · มือถือ + แอปพนักงาน (C3.7) · PDPA ลบ/ส่งออก/อายุเก็บ/เพดาน (C3.9) |
| API | REST `/api/v1/crm` 122 op + AI tool 32 + manifest/OpenAPI ต่อคีย์ (C1.10 → C2.11 → C3.8) + skill `shark-crm-api` |
| ฐานงาน | facade ข้ามโมดูล (C0.2/C0.3) · ไฟล์ส่วนตัว (C0.4) · ตัวรันงานรายนาที `crm-cron.mts` (C0.5) |

**สถานะ: 49/53 (92 %)** — C0–C5.5 รับครบ · C6.0 (ดูด origin/main เข้า) + link policy (P11) เข้า `session/crm` แล้ว · C6.1 ตรวจ prod อ่านอย่างเดียว + ซ้อม migration บน Neon branch ของ prod **เขียว** · C6.1 เหลือแค่ crontab (ติดตั้งพร้อม deploy) · C6.2–C6.4 รอ "GO push" ของเจ้าของ · ⚠ C3.10 (ปิดเฟส C3: `qc:all` บน QC1 ที่ reseed + CP3 เจ้าของลอง QC) **ไม่พบหลักฐานว่าทำ** (register §5 ยังนับเป็นใบค้าง)

**อะไรอยู่บน prod วันนี้ vs อะไรจะขึ้นกับ deploy ถัดไป**

| | prod วันนี้ (`origin/main` f85f5455 · deploy `dpl_AQMM29am…` ตาม RESUME) | ขึ้นกับ deploy ถัดไป (`session/crm` = origin/main + 280 commit) |
|---|---|---|
| โค้ด CRM | C0–C3.9-fix (deploy 28 ก.ย. 3677d983) — ซ่อนหลัง `uiVersion` 1 | C4.1–C4.4 + C5.1 + C5.4 ทุกชุด + C5.5 fix1–15 + G1–G3 + authz sweep + link policy + C6.0 |
| migration | `crm_v2_a` (18 ก.ย.) · `crm_v2_b` + `ai_credit_crm_assist` (23 ก.ย.) · `crm_v2_c` (27 ก.ย.) | `20261103000000_crm_perf_indexes` (ดัชนี 4 ตัว) · `20261104000001_account_journal_no_sequence` · `…000002_…_alloc_lock` · `…000003_…_alloc_lock_v2` (ซ้อมแล้ว 2.6 วินาที · drift สะอาด) |
| hotfix ของแพลตฟอร์ม | RC hotfixes 1–5 ต.ค. (sanitize · apiv1-scope · pos-page-authz · hr-privacy · inventory · HF-O23) | ทุกตัวยังอยู่ (merge "เก็บด่านที่เข้มกว่า" ทั้ง 12 ไฟล์ขัดกัน) |
| ข้อมูล CRM v2 | ตาราง v2 ว่าง (CrmContact 0) · outbox `crm.*` ไม่เคยมี · ไม่มีร้านใดเป็น v2 | — |
| งานตามเวลา | ไม่มี crontab ของ CRM | ติดตั้ง 3 บรรทัดหลัง deploy (§7) |

**ทางถอยบรรทัดเดียว:** ถ้า CRM v2 มีปัญหา → ตั้ง `settings.crm.uiVersion = 1` ของระบบนั้น (+ `settings.crm.bridgesEnabled = false` ถ้าสะพาน/consumer ทำงานผิด) ข้อมูลไม่หายเพราะ migration เป็นแบบเพิ่มอย่างเดียว · **ห้ามใช้ Vercel Instant Rollback ย้อนไปก่อน release ที่มี migration เลขใบสำคัญ (JV) `20261104000001`** — โค้ดเก่า (count+1) จะชนเลขลำดับใหม่แล้วสมุดบัญชีค้างทั้งเดือน (กฎ M2)

---

## 2. ตารางใบงาน

คอลัมน์ "ข้อสอบตอนรับ" = จำนวนผ่าน/ทั้งหมดของชุดข้อสอบของใบตอนรับงาน · "commit" = commit ที่รับงาน/รวม (MASTER-PLAN §12, RESUME, git log) · C0–C3 อยู่บน prod แล้ว (3677d983) · C4 ขึ้นไปอยู่บน `session/crm` เท่านั้น

### เฟส C0 — ปรับฐาน

| ใบ | งาน | สถานะ | commit | ข้อสอบตอนรับ | ผู้ตรวจ |
|---|---|---|---|---|---|
| C0.1 | เครื่องมือ QC (visual-crm · ทะเบียนปุ่ม · F14.1/F14.2) | ✅ | b8fea3f | c1.1 26→50 ข้อ | ไม่พบบรรทัดผลตรวจในบันทึก |
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
| C1.9 | UI วัตถุกำหนดเอง | ✅ | ไม่พบในบันทึก (MASTER เขียน "(ใบนี้)") | 45/45 | BLOCKER (เขียนฟิลด์อ่อนไหวไม่ได้) → แก้ |
| C1.10 | REST 63 op + AI 14 tool + หน้าตั้งค่า API | ✅ | ไม่พบในบันทึก | 66/66 | BLOCKER (AI เห็นค่าอ่อนไหว) → แก้ |
| C1.11 | มือถือ · แผงแชท · นำเข้า/รวม · สวิตช์ v1↔v2 | ✅ | ไม่พบในบันทึก | 66/66 + v1 17/17 | ไม่มี BLOCKER · ปิดเฟส C1 (qc:all 305/345) |

### เฟส C2 — เครื่องยนต์ขาย

| ใบ | งาน | สถานะ | commit | ข้อสอบตอนรับ | ผู้ตรวจ |
|---|---|---|---|---|---|
| C2.0 | migration `crm_v2_b` (604 บรรทัด) + `ai_credit_crm_assist` | ✅ | ไม่พบในบันทึก | 73/73 | additive ล้วน |
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
| C2.7-fix | ลำดับ event การจ่าย + reconcile รายชั่วโมง | ✅ | ff2cb5fb / a09363c4 | 79/79 ×2 | ผู้ตรวจเงิน 4 รอบ |

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
| C3.10 | ปิดเฟส: qc:all บน QC1 reseed + CP3 | ⚠ ไม่พบหลักฐานว่าทำ | — | — | — |

### เฟส C4 — ทุกปุ่มทำงาน

| ใบ | งาน | สถานะ | commit | ข้อสอบตอนรับ | ผู้ตรวจ |
|---|---|---|---|---|---|
| C4.1 | ทะเบียนปุ่ม 1,066 แถว + ด่าน F14 | ✅ 3 ต.ค. | 54af5306 (registry f102f258) | F14 1066/0 หนี้/0 แถวผี | รับพร้อม C4.2 |
| C4.2 | ตัวกดทุกปุ่ม 5 บทบาท × 2 จอ (`qc-crm-buttons.mts` it7) | ✅ 3 ต.ค. | 54af5306 (runner 71120e8e) | run6 4377/4377 · รวม run5+run6 7805/7805 · 0 dead/wrongExpect/hiddenLeak/VACUOUS · tripwire CLEAN | FINAL VERDICT: ACCEPT (ผู้ตรวจใหม่) · F1–F4 LOW → หนี้ |
| C4.2-fix (= "UI fix" — อนุมานจากข้อความ commit) | ปุ่มกั้นด้วยคีย์เดียวกับ action/service | ✅ | 03848b5b | c1.x–c2.x เขียวครบ (บันทึก C4.2-fix) | r1 NOT MERGEABLE → ผ่านรอบถัดไป |
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

#### ใบย่อย C5.5 (ทุกใบรวมเข้า `session/crm` และ push แล้ว)

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
| C6.1 | ตรวจ prod อ่านอย่างเดียว + ซ้อม migration | 🔶 เหลือ crontab | 3675fb09 · 7327c424 | `wo-notes/crm-C6.1.md` §1, §3 | (ใบผู้คุมงาน) |
| C6.2 | backfill prod | ⏸ รอเจ้าของ | — | — | — |
| C6.3 | ร้านนำร่อง | ⏸ รอเจ้าของ | — | — | — |
| C6.4 | ส่งมอบ (ไฟล์นี้) | 📝 ร่าง | — | — | รอ Fable |

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
| P-it6-2 | MED (prod-exposed `core/after-drain.ts`) | drain แบบรวมคำขอไม่เริ่ม ⇒ event รอถึง cron | C5.5-fix15 (fallback 3 วินาที · ต้นเหตุยังไม่พิสูจน์) |
| P-it6-1 | LOW–MED | กล่อง "แนบกับผู้ติดต่อ" โผล่ให้ผู้จัดการที่ถูกปฏิเสธทีหลัง | fix15 |
| O-it6-a / RVR-5 | LOW | bulk move นับดีลที่อยู่ขั้นนั้นแล้วว่า "ย้าย" | fix15 |
| O-it6-d | LOW | กล่องไฟล์โยน NOT_FOUND ใน server component | fix15 |

### 3.3 C5.2 → C5.4 (22 MAJOR · 40 MINOR)
ปักเป็นข้อสอบแดง 52 ข้อใน `scripts/qc-crm-c5.3.mts` แล้วแก้เป็นชุด A–F + D2 + N (ตาราง §2) — รายการเต็มต่อข้อ: `wo-notes/crm-C5.2-L1…L6.md` + `crm-C5.3.md` · ข้อที่ prod เปิดอยู่ตอนนั้น (C5.3 "Prod exposure"): L1-M3, L1-m5, L3-M1, L3-M3, L3-m1, L3-m4, L4-M2 → แก้ใน C5.4-A/B · ข้อเด่น: เลขใบสำคัญ JV ชนกัน (3 แคชเชียร์ ⇒ 80 % ชำระล้ม — **มีบน prod วันนี้**) → C5.4-N

### 3.4 C5.5 (ล่ารอบสอง)

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

| merge / commit | 1 บรรทัด |
|---|---|
| 929c39ce (deploy 1 ต.ค. 13:50 UTC) | hotfix/sanitize-2026-10-01 ข้อ 1–4: sanitizer default-deny (6513a9f7) · automation page จำกัด KANBAN (4d64b0dc) · payment profile ตรวจสิทธิ์+audit (0013b8ae) · inbound 1 MB (ca5a28be) · mobile AI/DNA ตรวจสิทธิ์ (7089364c) |
| 5841c670 | HF-APIV1: คีย์ที่มี scope/ผูกระบบถูกปฏิเสธที่ `/api/v1` เดิม · คีย์แชทต้องไม่มี scope · kanban revoke เฉพาะระบบตัวเอง |
| 8c68f335 | HF-POS-PAGES: ด่านสิทธิ์หน้า POS ต่อสาขา |
| 2f45c56e | HF-HR-0: ปิดข้อมูลพนักงาน/สลิปรั่ว · สายอนุมัติ · OT · ห้ามอนุมัติของตัวเอง |
| 6948b12f | HF-INV-0 + HF-INV-1: ด่านสิทธิ์คลัง/รายงาน + สต็อกในคำสั่งเดียว (ล็อกแถว) |
| 8999a79e | ledger RC hotfixes 2026-10-01 (ผลรวม 4 สาขา) |
| 3a93a773 · 70ab5b86 | HF-O23: POS register เดิม — prefix idempotency key `pos1:` + ตรวจความเป็นเจ้าของหลังสร้าง |
| f85f5455 | qc4.sh (harness อย่างเดียว · tip ของ main) |

---

## 4. ORACLE-EDIT ทั้งหมด

**กติกา:** ผู้ทำงานแก้ข้อสอบเองไม่ได้ · ทุกการแก้ต้องมีมติผู้คุมงาน (Fable) และติดป้าย `// ORACLE-EDIT <id> (<ใบ> · <เหตุ>)` ในไฟล์ · ตั้งแต่ C5.x ผู้ตรวจอิสระให้ความเห็นก่อนผู้คุมงานอนุมัติ
**จำนวน:** 337 บรรทัดป้ายที่เพิ่มใน `scripts/` (ไม่นับ `scripts/pending/`) ระหว่าง `b8fea3f^..session/crm` + 31 ไฟล์ใน `scripts/pending/` (probe ของใบ) · ทะเบียนละเอียดพร้อมเหตุผลของยุค C0–C3: `ledger/CRM-RUN.md` §4 (106 บรรทัด ORACLE-EDIT) · ยุค C4–C6: ส่วน "ORACLE-EDIT" ใน `wo-notes` ของแต่ละใบ

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
| qc-hf-hr-privacy | 2 | C6.0 L-4 (ส่ง actor ให้ runTool) · C5.5-G1 | ผู้ตรวจ C6.0 — **ยังไม่ได้รันบน QC4** |
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
| qc-hf-hr-privacy L-4 (8d1887ce) | C6.0 | G1 บังคับ `ToolCtx.actor` ⇒ ส่ง OWNER | ผู้ตรวจ C6.0 (ต้องรัน QC4) |
| qc-hf-apiv1-scope HF-12.1/12.2/12.2b (c40433a5) | C6.0 | คีย์ทั่วไปไม่เห็น tool เขียนทันที/ข้อมูลบัญชีแล้ว (กติกา G1) · core = รายชื่อตายตัว 6 ตัว · 137/141 → 143/143 | ผู้ตรวจ C6.0 (มีเงื่อนไข) |

⚠ งานตรวจที่ MASTER-PLAN §10 ข้อ 3 สั่ง ("`git diff <hash เริ่ม RUN>..main -- scripts/qc-crm-*` ทุก hunk หลัง `test(crm):` ต้องมีป้ายคู่กัน") **ยังไม่มีใครทำ** — ตารางข้างบนนับจากป้ายเท่านั้น ไม่ได้จับ hunk ที่ไม่มีป้าย

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
| P19 Message-ID ไม่ได้พิสูจน์ (fallback `+t` สร้างแล้วหรือยัง **ไม่พบในบันทึก**) | ถ้า Resend เปลี่ยน Message-ID ลำดับติดตามส่งต่อหลังลูกค้าตอบ | P19 |
| providerId webhook ไม่มีดัชนี (1.4) | bounce/delivery ช้าลงเมื่ออีเมลเยอะ | D2-review N2 |
| fix8 R4-1…R4-4 · RV-7 ปริมาณขาเข้า ≤5,000 ฉบับ/ชม./ระบบ | ผู้รับอีเมลของเราอาจถ่วงคำตอบของคนอื่นในเธรดนั้น (หายไปเมื่อตั้ง P14) | fix8-review |
| G3 RV-10/RV-11 · Q1–Q6 | ด่านเบอร์ในความจำ AI จับรูปแบบคู่ไม่ได้ · ปฏิเสธเบอร์/PromptPay ของร้านเอง | G3 |
| G2 ผลตอน deploy | ห้อง AI เดิมทั้งหมดเป็นของ OWNER · STAFF เสียประวัติ · REST conversationId เดิม 404 | G2 (prod ไม่มีคนใช้ AI ใน 30 วัน — R-1 probe) |
| C2.10: fanout 36 ชม. · 9/10 เทมเพลตไม่มีผู้ส่ง | crontab ล่ม >36 ชม. = แจ้งเตือนหาย | C2.10 |
| J3 residual 1–9 (New-9) | visitor id ปลอมผูกประวัติกับ lead ปลอมได้ · ฟอร์มรอ ≤1.5 วินาที | C4.4-fix3 |
| RV-2 fix3b (DATETIME field_due ยิงซ้ำ 1 ครั้งหลัง deploy) | ต้องนับ `AutomationRun` ก่อนเปิด v2 (§9) | fix3b-review |
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
| ตัวกดปุ่มยังไม่มี fixture `linkHosts` (3 แถวใหม่ไม่เคยกด) — **lane กำลังทำ 7 ต.ค.** | register linkpolicy |
| C6.0 **R-1** (release note): คีย์ทั่วไปเสีย `remember_fact`/`forget_fact`/`support_open_case`/`financial_summary`/`record_expense` ทาง `/api/v1/ai` (core 8→6) — ตรวจ prod แล้วไม่มีผู้ใช้ | C6.0 |
| C6.0 **R-3**: เนื้อหา **ไม่พบในบันทึกที่อ่าน** (โน้ตกล่าวถึง R-1/R-2 + §6 ruling เท่านั้น) | — |
| gate hygiene: `pnpm docs --check` เป็น no-op (ใช้ generator `--check` ×4 แทน) · CI ข้าม qc:all/drift ถ้าไม่มี NEON secret | register §6 |
| ENV reds ที่ทราบ (E1-K2.3 · recurring date bomb · account-api-docs · c3.1 · m1.9 · c3.7 · tax-print-audit · promptpay PP16) | register §6c |
| QC1: ผู้คุมงานลบชุด [B] (MemberNotification 150 · MemberAttribution 110 · MemberTierHistory 55) เกินมติ — ย้อนไม่ได้ | register "Controller deviation" |

---

## 6. เรื่องรอเจ้าของ

**มติ 7 ต.ค. ("ทำได้เลย ตามแนะนำ")** ถูกตีความเป็น: crontab = ใช่ (พร้อม deploy) · probe prod อ่านอย่างเดียว = ใช่ · DB role CREATE = ตรวจแล้วไม่ต้องทำ · env parity = เจ้าของทำเอง · deploy 2 รอบ (ต่อมาผู้คุมงานแนะนำเหลือ 1 รอบ — รอเจ้าของตอบ) · JV ไม่เริ่มใหม่รายเดือน + กระโดด ≤100 = ยอมรับ · G1+G2 ไปกับ C6 · `/l` policy = สร้างก่อนนำร่อง (ทำแล้ว) · คีย์ทั่วไปสร้างได้เฉพาะ OWNER · ที่เหลือใช้ค่าเริ่มต้น register §3 · **ไม่ใช่ GO push** — ทุกการ push prod ต้องได้ "GO push" แยก

### 6.1 การกระทำบน prod (บล็อก C6)

| # | เรื่อง | สถานะ / ค่าเริ่มต้น |
|---|---|---|
| A1 | **"GO push" deploy 1** (ผู้คุมงานแนะนำ: deploy เดียว 4 migration เพราะซ้อมแล้ว 2.6 วินาที) | รอ |
| A2 | env parity VPS ↔ Vercel: SESSION_SECRET + APP_URL ตรงกันทุกไบต์ + Resend/LINE/Ably/Blob | รอ (ผู้คุมงานไม่อ่าน .env) |
| A3 | ชื่อร้านนำร่อง + อีเมลของเจ้าของสำหรับทดส่งจริง (P7/P19) | รอ |
| A4 | อนุมัติ backfill prod ("ทำ" หลังเห็นตัวเลข dry-run) (P7/P15) | รอ |
| A5 | smoke แบบล็อกอินของ hotfix 1 ต.ค. | เจ้าของยังไม่ยืนยัน |
| A6 | รันชุด QC4 (hr-privacy · pos-page-authz · HF-O23) ผ่าน session POS | รอ |

### 6.2 P-list (`CRM-OWNER-PENDING.md` + register §3)

| # | เรื่อง | ค่าเริ่มต้นที่ใช้ |
|---|---|---|
| P1 | push prod 28 ก.ย. | ✅ ทำแล้ว (3677d983) |
| P2 | CP3 เจ้าของลองร้าน QC (portal + คอมมิชชัน→payroll) | รอ (หลัง C3.10 ซึ่งยังไม่ทำ) |
| P3 | บรรทัดยกเลิกรับในอีเมลขายตัวต่อตัว (Q7) | มีทั้งสองแบบ |
| P4 | เงิน v1 นับเข้าดีลย้อนหลัง (Q8) | ไม่ catch-up |
| P5 | คอมมิชชัน Q9–Q12 | ตามร่างใน `crm-C3.3.md` |
| P6 | ใครกดปุ่ม AI ในหน้า (Q13) | ทุกคนที่อ่าน CRM ได้ (RV-3 ยังเปิด) |
| P7 | backfill · ร้านนำร่อง · crontab | crontab = ใช่ (7 ต.ค.) · ที่เหลือรอ |
| P9 | `RESEND_WEBHOOK_SECRET` บน prod | ไม่ตั้ง (webhook 401 · ไม่มี bounce event) |
| P10 | won value ก่อน/หลัง VAT (Q14) | ก่อน VAT ทุกที่ |
| P11 | `/l/<code>` open redirect (Q15) | ✅ ทาง ข สร้างแล้ว (ไม่มี Safe Browsing) |
| P12 | คีย์ API ตายตามสิทธิ์ผู้สร้าง (Q16) | ใช่ (C5.4-B) |
| P13 | clawback อนุมัติอัตโนมัติ | อัตโนมัติ |
| P14 | `CRM_INBOUND_AUTHSERV_ID` (ตั้งหลังทดสอบ forged-twin เท่านั้น) | ไม่ตั้ง (fail-closed) |
| P15 | ล้าง prod 3 อย่าง (คีย์ไร้ผู้สร้าง · ถอด portal ที่หมดสิทธิ์ · ใบแจ้งหนี้ค้าง partial) | dry-run ก่อน · เจ้าของสั่ง `--apply` |
| P16 | ดาวน์โหลดข้อมูลร้านระดับแพลตฟอร์มไม่มีเหตุผล/audit | เพิ่ม — **ไม่ได้สร้าง** |
| P17 | เอกสารของดีลบริษัทออกในนามบริษัท · backfill เอกสารเก่า? | ไม่ backfill |
| P18 | ถอดเสียงสาย | ไม่มี STT · ซ่อนส่วนนี้ |
| P19 | ส่งอีเมลจริงทดสอบ Message-ID | ผู้คุมงานทดสอบใน C6.3 |
| P20 | เลข JV | (a) sequence · ช่องว่างได้ |
| P21 | คะแนนบริษัท | ซ่อน |

### 6.3 New-list (register §3)

| # | เรื่อง | ค่าเริ่มต้น |
|---|---|---|
| New-1 | JV ไม่เริ่มใหม่รายเดือน | ✅ ยอมรับ 7 ต.ค. |
| New-2 | DB role ต้องมี CREATE | ✅ ไม่ต้องทำ (prod = `neondb_owner` มี CREATE ทั้ง 2 URL) |
| New-3 | ช่วงเวลา deploy + กฎห้าม Instant Rollback | ตาม runbook |
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
| คีย์ทั่วไป `[]` สร้างได้เฉพาะ OWNER | ✅ ตกลง 7 ต.ค. — **การสร้างจริงยังไม่พบในบันทึก** |
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

### 7.1 Pre-check (สถานะ ณ 7 ต.ค. 11:06 UTC)

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
| ❌ ค้าง | env parity (A2) · ชุด QC4 (A6) · ช่วงเวลาเงียบ ไม่ใช่สิ้นเดือน · มีคนเฝ้า build · GO push (A1) · เตรียม rollback build (7.6) | — | — |

### 7.2 ขั้น deploy
1. เจ้าของพิมพ์ "GO push" ในแชท (ทุกครั้ง)
2. ผู้คุมงาน push `session/crm` → `main` (session/crm มี origin/main f85f5455 ครบ ⇒ fast-forward) — เลือกชั่วโมงเงียบ ไม่ใช่ปิดงวดสิ้นเดือน
3. เฝ้า Vercel build (`scripts/vercel-build.sh`): `prisma migrate deploy` (4 folder เรียงชื่อ · คาดไม่กี่วินาที) → `migrate status` → `tsc --noEmit` (heap 6144) → `next build` · รวม 5–40 นาที · ⚠ ถ้า build ล้มหลัง migrate: โค้ดเก่าเสิร์ฟต่อบน schema ใหม่ (ปลอดภัยเพราะ additive + allocator M1 ข้ามเลขที่โค้ดเก่าเขียน) → แก้แล้ว deploy ใหม่ ห้าม Instant Rollback
4. ดึง checkout VPS `/root/projects/shark-in-th` ให้ตรง commit ที่ deploy (crm-cron รันโค้ดจากที่นี่ และเป็นตัว drain outbox ของทุกโมดูล)
5. ติดตั้ง crontab 3 บรรทัด (UTC · ใช้ `.env` ของ prod · ห้ามตั้ง `QC_ENV_FILE` ร่วมกับ DATABASE_URL ของ prod):
```
* * * * * cd /root/projects/shark-in-th && /usr/bin/flock -n /tmp/shark-crm-minute.cron.lock /usr/bin/pnpm exec tsx scripts/crm-cron.mts minute >> /var/log/shark-crm-cron.log 2>&1
7 * * * * cd /root/projects/shark-in-th && /usr/bin/flock -n /tmp/shark-crm-hourly.cron.lock /usr/bin/pnpm exec tsx scripts/crm-cron.mts hourly >> /var/log/shark-crm-cron.log 2>&1
40 20 * * * cd /root/projects/shark-in-th && /usr/bin/flock -n /tmp/shark-crm-daily.cron.lock /usr/bin/pnpm exec tsx scripts/crm-cron.mts daily >> /var/log/shark-crm-cron.log 2>&1
```
(daily 20:40 UTC = 03:40 ไทย หลัง `/api/cron/tick` · hourly/daily ห้ามเรียก `runDailyCron`)

### 7.3 Smoke หลัง deploy
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
| CRM v2 ร้านนำร่องผิด | `settings.crm.uiVersion = 1` ของระบบนั้น · consumer ผิด → `settings.crm.bridgesEnabled = false` · ข้อมูลอยู่ครบ |
| after-drain: PENDING > ~5 นาที attempts 0 · p95 > 2× · error จาก after-drain | กู้ไฟล์เดียว `src/lib/core/after-drain.ts` จาก bd435157 แล้ว deploy (ไม่มี schema/data) |
| ตัวจัดเลข JV ผิด | ถ้าจำเป็น: รันคำสั่ง `account_alloc_journal_no` ของ 000001 ซ้ำ (OR REPLACE) · **ห้ามรัน 000002 เดี่ยว** · ห้าม drop sequence · ไม่มี down-migration |
| ต้องถอยทั้ง release | **ห้าม Vercel Instant Rollback ไป release ก่อน N** · ใช้ rollback build ที่เตรียมไว้ = release ก่อนหน้า + ส่วน N ของ `gl.ts` (journalNoParts/Display/allocate/peek/ensureJournalSequences + hook ensureAccounting) + peek ใน `journal/page.tsx` (ส่วน legal-tail ถอยได้) |
| hotfix 1–5 ต.ค. | ห้ามถอยข้าม — เปิดช่องโหว่ prod คืน |

### 7.6 ยังไม่พร้อม
- **rollback build สำหรับ N ยังไม่พบว่าเตรียมไว้** (runbook สั่งให้เตรียมก่อน deploy)
- Vercel function max duration เทียบหน้าต่าง claim 6 นาที — ไม่ได้ตรวจ (register fix1)

---

## 8. ชุดหลักฐาน

| หลักฐาน (MASTER §10) | อยู่ที่ไหน | สถานะ |
|---|---|---|
| 1. สถานะ+hash ทุกใบ · ORACLE-EDIT · HANDOVER | `CRM-MASTER-PLAN.md` §12 · `CRM-RUN.md` §3.1/§4 (ถึง 28 ก.ย.) · `CRM-RESUME.md` · ไฟล์นี้ | CRM-RUN ไม่อัปเดตหลัง 28 ก.ย. — log หลังจากนั้นอยู่ใน RESUME/wo-notes |
| 2. wo-notes ครบ 53 ใบ | `ledger/wo-notes/crm-*.md` (133 ไฟล์ ใน git) | C3.10 ไม่มีโน้ต · C6.2–C6.4 ยังไม่มี |
| 3. diff ข้อสอบ ↔ ป้าย ORACLE-EDIT | git | ยังไม่ทำ (§4) |
| 4. qc:all รอบสุดท้าย (JSON_SUMMARY) | — | **ยังไม่มีบนทรีที่รวมแล้ว** (ครั้งล่าสุด: ปิด C2 325/355 · ปิด C1 305/345) |
| 5. ภาพ 5 บทบาท × 2 จอ + `buttons/summary.json` | `.qc-shots/crm/<ใบ>/` · `.qc-shots/crm/buttons/*.json` · run5/run6 ใน `/tmp/c42b-logs/` | `.qc-shots` gitignore (216 MB) |
| 6. รายงานนักล่า + ตาราง finding → ข้อสอบ → commit | `wo-notes/crm-C5.2-L*.md` · `crm-C5.3.md` · `crm-C5.5-hunt-*.md` · probe ใน `scripts/pending/` | ใน git |
| 7. ตรวจ/ซ้อม migration prod + backfill | `crm-C6.1.md` · `.qc-shots/crm/prod-probe-c61-{pooled,direct}.log` · `neon-rehearse-{1,2}.log` | backfill ยังไม่ทำ |
| 8. `.env` ไม่ถูกแตะ · ไม่มีชุดข้อสอบบน prod · ไม่มี EAS build | — | ยังไม่มีบันทึกยืนยันรวม (mtime ฯลฯ) |

**gate log ของการรวมแต่ละใบ** (gitignore): `.qc-shots/crm/main-{a-c43,authz,b,c,c2,d,d2,f,j3,n,ui,fix1…fix15,g1,g2,g3,c60}.log` · `c43-accept2*.log` · `c44-accept2/` · `c51fix-main.log` · `deploy-3677d983.log`

**ต้องคัดลอกออกจาก `/tmp` ก่อนส่งมอบ (หายเมื่อรีสตาร์ต):**
- `/tmp/c42b-logs/` (24 MB) — อย่างน้อย: `run5-verdict*.{txt,json}` · `run6-verdict.{txt,json}` · `run6-combined-verdict.{txt,json}` · `run6-tripwire.txt` · `run6-window-leftovers.txt` · `counts-{before,after}-run{5,6}.json` · `run6.sh` · `run6.md5` · `run6.status` · `cleanup-it7-apply-A.txt` · `cleanup-it7-readonly.txt` · `typecheck-main-land.log`
- `/tmp/c54c-logs/` (12 MB · เงิน C5.4-C r1–r14 รวม probe-cn RED) · `/tmp/c54n-logs` (N) · `/tmp/cf3-logs/` (migrate-deploy 000002/000003 บน QC2) · `/tmp/c55-logs` · `/tmp/cf2-logs` · `/tmp/cf*-logs` อื่นที่โน้ตอ้าง (47 โฟลเดอร์ `/tmp/*-logs` รวมกัน)
- ปลายทางแนะนำ: Drive ผ่าน rclone (`VPS-Archive/crm-v2-evidence/`) สำหรับของใหญ่ + commit สรุป verdict/tripwire/counts (ไม่กี่ KB) เข้า `ledger/evidence/` · `.qc-shots/crm/` ทั้งก้อนควรไป Drive

**สาขาที่เป็นบันทึก (ทั้งหมด push แล้ว):**
`session/crm` 7327c424 (ตัวจริง) · `main` f85f5455 (prod) · `wip/crm-c42b` 0fcda430 (runner/registry + helper lane: verdict.py, counts, tripwire, run6.sh) · `wip/crm-c60-merge-main` · `wip/crm-c61-linkpolicy` · `wip/crm-cf2/cf3/cf11/cf16/cf17/cf18/cf19/cf20` · `wip/crm-c54c-r8/c54d/c54e/c55/cd2/cj3/cui/hunt4/c42-it4` · hotfix: `rc/hotfixes-2026-10-01`, `hotfix/{sanitize-2026-10-01,apiv1-scope,pos-page-authz,hr-privacy,inventory-atomic,inventory-authz}`

---

## 9. สิ่งที่ยังไม่ได้ทำใน C6

### 9.1 C6.2 backfill (dry-run → ส่งตัวเลขทาง tg → เจ้าของ "ทำ" → รันจริงทีละร้าน → รอบสองต้องได้ 0)

| สคริปต์ | ทำอะไร | หมายเหตุ prod |
|---|---|---|
| `scripts/crm-backfill-companies-from-text.mts` | สร้างบริษัทจากชื่อข้อความของผู้ติดต่อ | CrmContact = 0 ⇒ น่าจะ no-op · ต้องรันก่อน unique 1.7 |
| `scripts/crm-backfill-contact-names.mts` | แยกชื่อ/นามสกุล + คำนำหน้า | no-op คาด |
| `scripts/crm-backfill-lost-reasons.mts` | ใส่เหตุผลแพ้ระบบ 5 ค่าต่อระบบ CRM + ผูกดีลเดิม | 2 ระบบ CRM จะได้แถว |
| `scripts/crm-backfill-party-links.mts` | เติม partyId ให้ CrmContact + ตารางธุรกรรม 9 ตาราง | ตารางธุรกรรมอาจมีแถวจริง — ตัวเลข dry-run สำคัญ |
| `scripts/crm-backfill-stage-history.mts` | แถวประวัติขั้นแรกของดีล | no-op คาด |
| `scripts/crm-backfill-visibility.mts` | นโยบายมองเห็นค่าเริ่มต้น 10 แถว/ระบบ | 2 ระบบ |
| `scripts/pending/c54b/backfill-revoke-ended-portal.mts` (P15-2) | ถอด portal ของคนที่ออกจากบริษัทแล้ว | portal ไม่เคยใช้บน prod — คาด 0 |
| `scripts/pending/c54c/backfill-invoice-status.mts` (P15-3) | ใบแจ้งหนี้ partial ที่ชำระ+ใบลดหนี้ครบ → PAID (ไม่ยิง event) | บัญชีมีข้อมูลจริง — ต้อง dry-run |
| P15-1 คีย์ไร้ผู้สร้าง | **ไม่มีสคริปต์** · prod มี 1 คีย์ (`createdById NULL`, scope `[]`) | ⚠ อนุมาน: เป็นคีย์ "Siamdive" ตัวเดียวที่ใช้แชททุกวัน — **ถ้าเพิกถอนแชท SiamDive จะหยุด** ต้องให้เจ้าของเลือก (ผูกผู้สร้างแทนการเพิกถอน) |
| ตัวเลือก: unique 1.6/1.7 | prod ไม่มีแถวซ้ำ ⇒ ใส่ได้โดยไม่ต้องล้าง | migration ใหม่ ⇒ ต้องอนุมัติ |

ใช้ `ALLOW_PROD_BACKFILL=1 … --dry-run` ตาม register R11 · ห้าม source `.env` ที่ URL มี `&`

### 9.2 C6.3 ร้านนำร่อง
1. ก่อน: crontab ทำงาน (≥ 1 ชม. log สะอาด) · env parity (A2) · นับ `AutomationRun` eventKey `custom.record.field_due#%` (fix3b RV-2: > 0 ⇒ ต้องเพิ่มสะพาน ~10 บรรทัดก่อน) · ตัดสิน P9/P14 (ค่าเริ่มต้น = ไม่ตั้งทั้งคู่)
2. เจ้าของเลือกร้าน → ตั้ง `uiVersion = 2` เฉพาะระบบ CRM นั้น — **วิธีสลับบน prod ไม่พบในบันทึก** (สวิตช์ v1↔v2 ซ่อนจากร้านจริงตั้งแต่ C1.11; บน QC ใช้ `CRM_V2_SWITCH`)
3. เดิน 5 บทบาทตามพิมพ์เขียว §3 ทุกหน้า ถ่ายภาพ · ใช้ผู้ติดต่อ tag `qc-prod-` แล้วลบ · ไม่ส่งอีเมล/LINE ถึงลูกค้าจริง ยกเว้นอีเมลเจ้าของ
4. P19: ส่งอีเมลจริง 1 ฉบับถึงอีเมลเจ้าของ แล้วตอบกลับ — ดูว่า Message-ID คงอยู่ เธรดถูกทำเครื่องหมายว่าตอบ และ sequence หยุด
5. เฝ้า OpsEvent/outbox 24 ชม. (§7.4) → เปิดร้านอื่นเมื่อเจ้าของสั่ง

### 9.3 ชุดข้อสอบที่ยังไม่ได้รันบนทรีที่รวมแล้ว
| ชุด | ทำไมยังไม่รัน | ใครทำ |
|---|---|---|
| `qc-hf-hr-privacy` (มี ORACLE-EDIT L-4 ส่ง actor) | ปักไว้กับ QC4 (session POS · ไม่มี `.env.qc4` ที่นี่) | session POS บนคลาวด์ / เจ้าของ |
| `qc-hf-pos-page-authz` | QC4 | เหมือนกัน |
| `qc-hf-o23` | ต้องเป็น host QC4 (exit 4 ถ้าไม่ใช่) | เหมือนกัน |
| ตัวกดปุ่ม `/settings/tracking` (fixture `linkHosts: ["*.example.com"]` + กฎกรอก `/linkhosts-input$/` + 3 แถวใหม่) | หนี้ของ linkpolicy | **lane กำลังรัน 7 ต.ค.** (c42b: rebuild :3215 จาก tip ที่รวม → run7 บน QC1) |
| C4.2 F1 chunk owner+manager `/emails` | หนี้ C4.2 | รอบรันปุ่มถัดไป |
| `qc:all` เต็มบน QC1 ที่ reseed (C3.10) + CP3 | ไม่ได้ทำตั้งแต่ปิด C2 | ผู้คุมงาน (ลำดับ reseed: register §6d) |

### 9.4 C6.4 ที่เหลือหลังร่างนี้
ผู้คุมงานตรวจ/แก้ร่าง → เปลี่ยนชื่อเป็น `HANDOVER-<วันที่>-CRM.md` · เก็บหลักฐาน §8 · บันทึก memory · Telegram · **หยุด รอ Fable ตรวจรอบสุดท้าย** (Fable: สุ่มรัน 5 ชุด + กลุ่ม X บน seed ใหม่ · เทียบภาพกับ mockup · นักล่า 4 เลนส์ · ตรวจ prod)

---

### ภาคผนวก — ข้อเท็จจริงที่หาไม่พบในแหล่ง
1. commit ที่รับใบ C1.9 · C1.10 · C1.11 · C2.0 (MASTER เขียน "(ใบนี้)")
2. หลักฐานว่า C3.10 ทำแล้ว (นับ 49/53 แต่ register §5 ยังค้าง) · การนับ 49 รวมใบ fix บางใบ (เช่น C2.7-fix นับคู่ C3.3 = 37/53)
3. "UI fix" ของ C5.4 คือ commit ใด (อนุมานว่า 03848b5b)
4. เนื้อหา C6.0 **R-3**
5. rollback build ของ N เตรียมไว้หรือยัง
6. วิธีตั้ง `uiVersion = 2` ให้ร้านจริงบน prod
7. P19 fallback `+t` สร้างแล้วหรือไม่ · C2.10 B1 คอลัมน์ AppNotification · รายการคอลัมน์ "nullable → NOT NULL" (C3.0)
8. สถานะ env parity · Vercel function max duration · NEON secret ใน CI (การซ้อม 7 ต.ค. ทดแทน R4-5 แล้ว)
9. ค่าเต็มของ deploy id prod (`dpl_AQMM29am…` ถูกตัดในแหล่ง)
10. การสร้างนโยบาย "คีย์ทั่วไปเฉพาะ OWNER" ในโค้ด
11. ว่าคีย์ไร้ผู้สร้างคือคีย์ "Siamdive" (อนุมานจาก "1 คีย์ active" ในทั้งสอง probe)
12. ผลตรวจรายใบของ C0.1 (ไม่มีบรรทัดผลตรวจในโน้ต)
