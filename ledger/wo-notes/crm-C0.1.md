# WO C0.1 — เครื่องมือ QC ของ CRM (ข้อสอบ/เมล็ดข้อมูล/เครื่องถ่ายภาพ/ทะเบียนปุ่ม) — ไม่แตะพฤติกรรมของระบบ

> RUN "CRM v2" · worktree `/root/projects/shark-crm` · branch `session/crm` · 17 ก.ย. 2569 · ผู้คุมงาน: Opus 5
> builder: ตัวแทนแยก 2 ตัว (ผู้เขียนข้อสอบ = Opus · ผู้ทำเครื่องมือ = Opus) · ผู้ตรวจ: ตัวแทนแยก (Opus)
> สัญญา: `ledger/crm-briefs/crm-brief-C0.1.md` (+ COMMON + RESOLUTIONS) · `ledger/CRM-MASTER-PLAN.md` §6 เฟส C0
> ข้อสอบ: ใบนี้ **ไม่มี** `qc-crm-c0.1.mts` — ใบนี้คือ "ใบที่สร้างข้อสอบ" ตัวที่ถูกตรวจคือ `scripts/qc-crm-c1.1.mts`
>   (ต้อง SKIPPED อย่างถูกเหตุผลจนกว่า `crm_v2_a` จะลง) + ด่าน F14.1/F14.2 + เครื่องถ่ายภาพที่ผู้คุมงานรันเอง

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `scripts/crm-qc-env.mts` | แก้ | แยก `PARTY_LINK_NEW_COLUMN` (5) / `PARTY_LINK_EXISTING_COLUMN` (4) / `PARTY_LINK_TABLES` (9) · เพิ่ม `PARTY_LINK_IDENTITY` (คอลัมน์ตัวตนจริงต่อตาราง) · เพิ่ม `CQC.businessRows` (สัญญาแถวธุรกิจสำหรับ C1.1) · `CRM_V2A_TABLES` +3 (`CrmVisibilityPolicy` `CrmFileLink` `CrmContactConsent`) |
| `scripts/qc-crm-c1.1.mts` | แก้ | 30 → **50 ข้อ** (+ ERR guard) · S5 ผูก partyId ตรง 9 ตารางจริง · S5.7 ใหม่ กันข้อสอบผ่านแบบไม่มีข้อมูล · S2.4/S2.5 สถานะปลายทางของการสลับ unique · S1.5–S1.13 คอลัมน์ที่ RESOLUTIONS R-A สั่ง · S1.14–S1.19 รูปร่างคอลัมน์ `CrmCompany`/`CustomObject`/`CustomRecord*` · S6.5 `acceptingLeads` · S8.1/S8.2 `uiVersion`=1 + `bridgesEnabled` |
| `scripts/seed-crm-qc.mts` | แก้ | ชื่อตารางตามของจริง · ลบ `CrmFileLink`/`CrmContactConsent` ก่อนแม่ (กัน FK ตอน reseed หลัง `crm_v2_a`) · เขียน `partyLinkTables` ลงเฉลย · 🔴 **เลิกเรียก `crm.moveDeal`** สำหรับดีลที่ปิดแล้ว (ดู §7 มติ 5) · เพิ่มตัวตรวจในตัวเอง (สมาชิกต้อง = 60 · `source:"CRM"` ต้อง = 0 · `crm.deal.won` ต้อง = 0 ไม่งั้น exit 1) |
| `scripts/crm-expected.json` | สร้างใหม่โดย seed | เฉลยชุดข้อมูล (id เปลี่ยนทุกครั้งที่ reseed) |
| `scripts/visual-crm.mts` | **ใหม่** | เครื่องถ่ายภาพ CRM (1440×900 + 390×844 · ตรวจ overflow พร้อมชื่อ element ที่ผิด · console/HTTP≥400 · `summary-<user>.json`) · ผู้ใช้ owner/manager/thana/nok/`customer:<code>` · session ปัก `qc-visual-crm` ลบใน `finally` |
| `scripts/crm-ui-inventory.json` | **ใหม่** | ทะเบียนปุ่ม (ว่าง + สคีมาตาม MASTER-PLAN §7 ในคีย์ `$*`) |
| `scripts/fitness.mts` | แก้ (+128 −0) | ด่าน **F14.1** ปุ่มในโค้ดต้องมีแถว · **F14.2** แถวต้องมีปุ่มจริง + ไม่มีแถวซ้ำ + ratchet ของ baseline |
| `ledger/wo-notes/TEMPLATE-crm.md` | แก้ | ตารางด่าน 12 ข้อ + ตาราง X1–X10 · แก้หัวไฟล์ (branch `session/crm` · ไม่ใช่ Codex) |
| `ledger/crm-briefs/crm-brief-C0.1.md` | แก้ | Controller addendum (ข้อเท็จจริงที่ตรวจกับโค้ด + การแบ่งงาน 2 ตัวแทน) |
| `scripts/pending/run-c01-shots.sh` · `run-c01-verify.sh` · `probe-c01-tenants.mts` | **ใหม่** | สคริปต์ของผู้คุมงาน (unit แยกสำหรับ build+ภาพ · ชุดยืนยัน · ตัวนับร้าน QC) |

`src/` **ไม่ถูกแตะเลย** — ใบนี้ไม่มีการเปลี่ยนพฤติกรรมของระบบ

## 2. migration / seed / backfill
- migration: **ไม่มี** (ใบนี้ห้ามมี — migration มีได้เฉพาะ C1.1 · C2.0 · C3.0)
- seed: `seed-crm-qc.mts` ยัง idempotent และยังเขียน `scripts/crm-expected.json` ทุกครั้ง · 🔴 **บทเรียน**: `seed-member-qc.mts` สร้างร้าน QC ใหม่ (ลบของเดิม) ⇒ id ทุกตัวเปลี่ยนหลัง reseed · ในฐาน QC มีร้าน `siam-dive-member-qc` เพียง **1 ร้าน** (ตรวจแล้ว ไม่มีร้านค้างสะสม) ⇒ ทุกใบต่อจากนี้ต้อง **ถ่ายภาพหลัง reseed รอบสุดท้ายของใบนั้นเสมอ** (ลำดับใน MASTER-PLAN §5 ขั้น 8 → 10 ถูกอยู่แล้ว)
- backfill: ไม่มี (6 สคริปต์เป็นของ C1.1 — ข้อสอบ S3 รอตรวจอยู่)

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบเขียนก่อนโค้ด โดยตัวแทนแยก และเคยแดง/SKIPPED | ✅ | ใบนี้ **คือ** ใบเครื่องมือ: `qc-crm-c1.1.mts` (50 ข้อ) เขียนโดยตัวแทนแยกที่ไม่แตะ `src/` และ **SKIPPED อย่างถูกเหตุผล** (ยังไม่มี `prisma/migrations/*_crm_v2_a`) |
| D2 | ข้อสอบเขียวครบเมื่อผู้คุมงานรันซ้ำเองหลัง reseed | ✅ | reseed สมาชิก+CRM แล้วรันเอง: `JSON_SUMMARY {"total":0,"passed":0,"findings":[],"skipped":true}` exit 0 — SKIPPED คือผลที่ถูกต้องของใบนี้ |
| D3 | กลุ่ม X ครบ | ✅ | N/A ทั้ง 10 กลุ่ม — ดู §4 |
| D4 | regression | ✅ | `qc-crm` 25/25 · `qc-crm-activity` 12/12 (รันเองหลัง reseed) |
| D5 | typecheck + fitness 2 โหมด | ✅ | typecheck exit 0 · `pnpm fitness` 28/28 · `env -u DATABASE_URL pnpm fitness` 28/28 (`findings:[]` ทั้งคู่) |
| D6 | build ผ่าน | ✅ | `bash scripts/acc-v2-serve.sh` exit 0 · เซิร์ฟเวอร์ QC ตอบ HTTP 200 ที่ :3215 |
| D7 | ภาพ 4 บทบาท × 2 ขนาดจอ · ผู้คุมงานเปิดดูเอง | ✅ | 24 ภาพใน `.qc-shots/crm/0.1/` (owner · manager · thana · nok × contacts/deals/activities × desktop/mobile) · `failures:0 · fatal:null` ทุกผู้ใช้ · ถ่ายใหม่หลัง reseed รอบสุดท้าย · ดู §6 |
| D8 | ทุก element ที่กดได้มี testid + แถวในทะเบียน | ✅ (ด่านพร้อมใช้) | ทะเบียนว่าง + F14.1/F14.2 เขียว · หน้า v1 **ไม่มี `data-testid` เลย** (grep = 0) จึงไม่มีหนี้ต้องตรึง — baseline ว่างโดยตั้งใจ ด่านกัดโค้ดใหม่ตั้งแต่ C1.3 |
| D9 | ผู้ตรวจไม่มี BLOCKER | ✅ | รอบแรก: BLOCKER 1 + ควรแก้ 6 → แก้ครบ · รอบสอง (ไล่เฉพาะจุดที่แก้): **"no BLOCKERs remaining"** + ของใหม่ 2 จุดที่ปิดต่อแล้ว · ดู §7 |
| D10 | เอกสาร/ทะเบียน | ✅ | N/A — ไม่มี op/สิทธิ์/event ใหม่ในใบนี้ (F13.x เขียวเท่าเดิม) |
| D11 | wo-notes + ข้อมูล QC คืนสภาพ | ✅ | ไฟล์นี้ · `qc-member-m1.9` 26/26 หลังทุกอย่าง |
| D12 | commit → push → Vercel READY | ✅ | `b8fea3f` (+ `7fb1d76` บันทึก hash) · push `session/crm` + `main` 14:17 UTC · deploy ใหม่ขึ้นจริง 14:24 UTC (`dpl_By2r9…` → `dpl_33Xqe…` ใน header ของ shark.in.th) · `/api/health` 200 `{"ok":true,"db":true,"outboxPending":0}` · ไม่มี migration ในใบนี้ ⇒ ไม่ต้องตรวจ `_prisma_migrations` |

## 4. กลุ่มข้อสอบ X
| กลุ่ม | เกี่ยวกับใบนี้? | เหตุผล |
|---|---|---|
| X1–X10 | **N-A ทั้งหมด** | ใบนี้ไม่แตะ `src/` เลย ไม่มี read/write/mutation/op/endpoint/ไฟล์/ข้อมูลบุคคลใหม่ — เป็นเครื่องมือ QC ล้วน (ข้อสอบ · เมล็ดข้อมูล · เครื่องถ่ายภาพ · ด่าน fitness · แม่แบบ wo-notes) · กลุ่ม X ที่ใบนี้ "ติดตั้งให้ใบอื่น" อยู่ในตาราง X ของแม่แบบ `TEMPLATE-crm.md` และในข้อสอบ `qc-crm-c1.1.mts` (X ของ C1.1) |

## 5. ผลข้อสอบ (ของจริง · ผู้คุมงานรันเองบน seed ใหม่)
รอบสุดท้าย (`scripts/pending/run-c01-final.sh` · unit `crm-c01-final` · log `.qc-shots/crm/c01-final.log`) — ลำดับจงใจ: reseed → seed ซ้ำ → **ระบายคิว** → วัด
- reseed: `seed-member-qc` exit 0 (สมาชิก 60 · บิล 120 · นัด 40) → `seed-crm-qc` ×2 exit 0 (idempotent · 20s/16s) ปิดท้ายทุกรอบด้วย `สมาชิกในร้าน 60 (CRM 0) · outbox ที่ยังไม่ DONE จากรอบนี้ 0`
- **ระบายคิว** `qc-cron` (เรียก `drainAll()` ของจริง): `JSON_SUMMARY {"total":4,"passed":4,"findings":[]}`
- `qc-member-m1.9` **หลังระบายคิว**: `JSON_SUMMARY {"total":26,"passed":26,"findings":[]}` ← ด่านที่จับบั๊ก §7 มติ 5 ได้
- `qc-crm-c1.1`: `JSON_SUMMARY {"total":0,"passed":0,"findings":[],"skipped":true}` (SKIPPED ถูกเหตุผล)
- `qc-crm`: `{"total":25,"passed":25,"findings":[]}` · `qc-crm-activity`: `{"total":12,"passed":12,"findings":[]}`
- `pnpm typecheck` exit 0 · `pnpm fitness` `{"total":28,"passed":28,"findings":[]}` · `env -u DATABASE_URL pnpm fitness` `{"total":28,"passed":28,"findings":[]}`
- `qc-member-m1.9` **อีกรอบหลังทุกอย่าง (รวมถ่ายภาพ)**: `JSON_SUMMARY {"total":26,"passed":26,"findings":[]}` ⇒ ทั้งใบไม่ทิ้งคราบไว้ในฐาน QC
- (ใบถัดไป) `qc-crm-c0.2`: SKIPPED ถูกเหตุผล — ข้อสอบ C0.2 เขียนล่วงหน้าแล้ว commit แยก

## 6. ภาพ
คำสั่งที่ใช้: `systemd-run --unit=crm-c01-shots … bash scripts/pending/run-c01-shots.sh` (build → `visual-crm.mts 0.1 --user owner|manager|thana|nok` → stop)

| หน้า | mockup | ภาพจริง | ผู้ใช้ | จอ | overflow | ที่เห็นด้วยตา |
|---|---|---|---|---|---|---|
| CRM v1 ดีล | — (หน้าเดิม ไม่มี mockup) | `.qc-shots/crm/0.1/crm-v1-deals-owner-desktop.png` | owner | 1440 | ไม่มี | ยอดคาดการณ์ ฿6,964,000 · กระดาน 3 คอลัมน์ · การ์ดดีล QC 16–45 พร้อมกิจกรรม = ข้อมูล seed จริง ไม่ใช่หน้าเปล่า |
| CRM v1 ผู้ติดต่อ | — | `.qc-shots/crm/0.1/crm-v1-contacts-thana-mobile.png` | thana | 390 | ไม่มี | "ผู้ติดต่อ (80)" ครบ · ไม่มีอะไรล้นขอบจอ · ฟอร์มเพิ่มผู้ติดต่อท้ายหน้า |
| อีก 22 ใบ | — | `.qc-shots/crm/0.1/` | manager · nok · ที่เหลือ | ทั้งสองจอ | ไม่มี | `summary-<user>.json` ทุกใบ `status:200 · missing:[] · errors:[] · overflow:false` |

**PARITY: ผ่าน** — ใบเครื่องมือไม่มี mockup ให้เทียบ เกณฑ์ของใบคือ "เครื่องถ่ายภาพทำงานจริงกับหน้า v1 3 หน้า" ซึ่งพิสูจน์แล้วทั้ง 4 บทบาท × 2 ขนาดจอ (หน้า v1 ยังไม่มีการมองเห็นตามทีม — thana เห็นทุกอย่างเป็นเรื่องปกติจนกว่าจะถึงใบ C1.7)

## 7. ข้อแย้ง / มติทางเทคนิค
- **มติ 1 (การสลับ unique ของ `MemberSection/MemberField`)**: ใบสั่ง C0.1 เขียนว่า "ของเก่ายังอยู่ใน `crm_v2_a`" แต่ MASTER-PLAN §6 แถว C1.1 สั่งลำดับ `ADD COLUMN → CREATE UNIQUE ใหม่ → DROP unique เก่า` ในไมเกรชันเดียว ⇒ **ยึด MASTER-PLAN** · ข้อสอบ S2.4 ตรวจสถานะปลายทาง (ของใหม่มี · ของเก่าหายไป) · S2.5 ตรวจลำดับใน `migration.sql`
- **มติ 2 (ข้อสอบ partyId ต้องไม่ผ่านแบบว่างเปล่า)**: S5.6 เดิมจะ "เขียว" ได้ถ้าตารางธุรกิจไม่มีแถวเลย — เพิ่ม **S5.7** บังคับว่าทั้ง 9 ตารางต้องมีแถวจริง ≥ 2 และบันทึกสัญญาไว้ที่ `CQC.businessRows` (เจ้าของงาน = **C1.1**: ต้องเพิ่มระบบธุรกิจใน `extraSystems` + สร้างแถวใน seed) · **ตั้งใจให้ S5.7 แดง** จนกว่า C1.1 จะทำ
- **มติ 3 (ขอบเขตด่าน F14)**: `CRM_UI_DIRS` = 4 โฟลเดอร์ (เพิ่ม `src/lib/modules/crm` เพราะเนื้อหน้า v1 อยู่ที่ `ui.tsx` และ `src/app/b` เตรียมไว้ให้ portal ของ C3.5) — รับตามที่ตัวแทนเสนอ · โฟลเดอร์ที่ยังไม่มี = ไม่มีข้อค้นพบ ไม่ใช่ error
- **มติ 4**: `CRM_TESTID_BASELINE` ว่าง — หน้า v1 ไม่มี `data-testid` สักตัว จึงไม่มีหนี้ให้ตรึง (ไม่ใช่การปล่อยผ่าน)
- **มติ 5 (บั๊กจริงที่เจอตอนตรวจรับ — สำคัญที่สุดของใบนี้)**: `qc-member-m1.9` เขียวตอนรันทันทีหลัง seed แล้ว **กลายเป็นแดงในอีกชั่วโมง** (`member:40` แทน `30`) · ไล่จนถึงต้นเหตุ: เมล็ดข้อมูล CRM เรียก `crm.moveDeal` ให้ดีล 1–10 เข้าขั้น WON → `moveDeal` emit `crm.deal.won` ใน tx (`src/lib/modules/crm/service.ts:163`) → consumer `onCrmDealWon` (`src/lib/member-bridges.ts:616`) **สมัครสมาชิกให้ 10 คน** (source CRM) · เมล็ดข้อมูลไม่ระบายคิว เหตุการณ์จึงค้าง แล้วไปงอกตอนชุดอื่นระบายคิวทีหลัง ⇒ วัดทันที = เขียว · วัดทีหลัง = แดง (กับดักที่หาต้นตอยากมาก และจะพังด่าน D11 ของอีก 52 ใบที่เหลือ)
  - **แก้**: เมล็ดข้อมูล "สร้างสถานะ" ไม่ใช่ "ปลอมเหตุการณ์ธุรกิจ" — วางดีลที่ปิดแล้วลงขั้นปลายทางโดยเขียนฟิลด์ชุดเดียวกับที่ `moveDeal` เขียน (`stageId`/`kind`/`closedAt` ผ่าน `dealStateForStage` ตัวเดิม + ผล lifecycle ของผู้ติดต่อผ่าน `lifecycleAfterDealWon` ตัวเดิม) แต่ไม่ emit · ต่างจากของเดิมแค่ "เวลาที่ประทับ `closedAt`" ไม่ใช่ค่า
  - **กันซ้ำ**: เมล็ดข้อมูลตรวจตัวเองก่อนเขียนเฉลย — สมาชิกต้อง = 60 · `source:"CRM"` ต้อง = 0 · `crm.deal.won` ต้อง = 0 ไม่งั้นหยุดทันทีพร้อมข้อความไทย
  - **บทเรียนสำหรับทุกใบต่อไป**: ชุดยืนยันต้อง **ระบายคิวก่อนวัด** เสมอ ไม่งั้นความเสียหายจากคิวค้างจะโผล่ในใบของคนอื่น
- **ผู้ตรวจรอบสอง**: ไม่เหลือ BLOCKER · ของใหม่ที่เกิดจากการแก้ ปิดเพิ่ม 2 จุด — ทะเบียนปุ่มแถว `*` เดี่ยวคลุมทุกปุ่มไดนามิก (เพิ่มกติกาแพตเทิร์นสั้นเกิน = แถวพิการ) · ข้อสอบใช้เบอร์หาเจ้าของทั้งที่ชุดข้อมูลมีเบอร์ซ้ำ 4 คู่โดยตั้งใจ (เปลี่ยนเป็น `เบอร์ → Set<partyId>` + ยืนยันว่าเบอร์ซ้ำต้องรวมเป็น Party เดียว ซึ่งเป็นข้อบกพร่องของ backfill ที่ไม่มีข้อสอบอื่นจับ)
- **ปรับด่าน F14 ตามผู้ตรวจ**: เปลี่ยนจาก "รายชื่อโฟลเดอร์ที่พิมพ์ไว้" เป็น **ตัวค้นหาโฟลเดอร์ CRM เอง** + ตัวทดสอบตัวเอง (`CRM_ANCHOR_DIRS` ต้องถูกค้นเจอ) ⇒ ปิดความเสี่ยง "C1.3 เอา UI ไปวางที่ใหม่แล้วด่านเงียบตลอดกาล"
- ไม่มี `ORACLE-EDIT` ในใบนี้ (ข้อสอบยังไม่ถูก commit ก่อนหน้า — การแก้ทั้งหมดเกิดก่อน commit `test(crm)`)

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| แถวข้อมูลธุรกิจ 9 ตาราง × 2 แถว ใน seed (ทำให้ S5.6/S5.7 พิสูจน์ของจริง) | ต้องมีระบบ SHOP/RENTAL/TICKET/SCHOOL/HOTEL/CLINIC/QUEUE ในร้าน QC และต้องมี `crm_v2_a` ก่อน | **C1.1** |
| หน้า CRM v1 ไม่มี `data-testid` (ด่าน D8 ยังไม่ครอบ v1) | v1 จะถูกแทนที่ด้วย v2 และต้องคงพฤติกรรมเดิมไว้เฉย ๆ (`qc-crm-v1`) | ไม่ปิด (ตั้งใจ) — v2 ครอบใน C1.3 เป็นต้นไป |
| สเปกภาพของ portal (`customer:<code>`) | `portal-session` เกิดใน C3.5 (ทางเรียกเตรียมไว้แล้วในเครื่องถ่ายภาพ) | **C3.5** |

## 9. คืนสภาพ QC
- ข้อสอบไม่ได้สร้างแถวใด ๆ (SKIPPED) · เครื่องถ่ายภาพลบเฉพาะ session ที่รอบนั้นสร้างเอง (ลบด้วย id/tokenHash ไม่ใช่ลบทั้งป้าย) + กวาดซากที่หมดอายุ · `finally` ทำงานแม้ออกกลางคัน (พิสูจน์ด้วยการชี้ chromium ผิดที่แล้วยังลบ session ทัน)
- ชุดข้อมูลสมาชิกยังตรงเฉลย **หลังระบายคิว** และ **หลังจบทุกอย่างรวมถ่ายภาพ**: `qc-member-m1.9` 26/26 ทั้งสองครั้ง
- เมล็ดข้อมูลตรวจตัวเองทุกครั้ง: `สมาชิกในร้าน 60 (CRM 0) · outbox ที่ยังไม่ DONE จากรอบนี้ 0`
- ร้าน QC ในฐานข้อมูลมีร้านเดียว (`siam-dive-member-qc`) — ไม่มีร้านค้างจากการ seed ซ้ำ
