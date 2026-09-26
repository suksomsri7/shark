# CRM v2 RUN — จุดต่องานของผู้คุมงาน (อ่านไฟล์นี้ก่อนเมื่อ session ใหม่)

> อัปเดตล่าสุด: **26 ก.ย. 2569 12:40 (ไทย · 05:40 UTC)** · ผู้คุมงาน **Fable 5.1** · branch `session/crm` · ▶️ กำลังเดิน
> ลำดับอ่าน: ไฟล์นี้ → `ledger/CRM-MASTER-PLAN.md` §12 → **ท้าย `ledger/CRM-RUN.md` §4 (บันทึก 23–24 ก.ย. สำคัญมาก)** → brief ของใบที่ทำ (มี "Controller ruling/addendum" = ผูกพัน)

## 0. ▶️ ทำต่อจากตรงนี้ (session ใหม่ · ทำตามลำดับ)

### 0.1 เช็กสภาพเครื่องก่อน
- `systemctl list-units --all | grep -E "iso-|crm-" | grep -v mount` — ถ้ามี **`crm-c21-verify3`** ยัง active = **ปล่อยให้จบ** (unit `--collect` รอดจาก session ตาย) · ห้าม stop กลาง suite
- ผลอยู่ที่ `.qc-shots/crm/c21-verify3.log` · ดูด้วย
  `awk '/^== /{n=$0} /^exit=/{print n" -> "$0}' .qc-shots/crm/c21-verify3.log` และ `grep JSON_SUMMARY`
- `ls /tmp/shark-gate*.lock` + `fuser /tmp/shark-gate.lock` ต้องไม่มีใครถือ

### 0.2–0.5 C2.1 … C2.7 — ✅ รับงานแล้ว 7 ใบ (25/53 = 47%) · commit ในทรีหลัก · 🔴 **ยังไม่ push** (session Fable ถูกตัวกรองสิทธิ์บล็อก — เจ้าของกด: `cd /root/projects/shark-crm && git push -u origin session/crm && git push origin HEAD:main`)
- หลัง deploy READY: เติม D12 ใน wo-notes C2.1–C2.5 (hash + dpl) · `tg` · 🔴 prod ต้องมี `RESEND_WEBHOOK_SECRET` (ไม่ตั้ง = webhook ปิด 401 ปลอดภัย) · Q7 ฟุตเตอร์ยกเลิกรับ (ค่าเริ่มต้น "มี")
- worktree c20/c23/c12a: รีเซ็ตเป็น HEAD ใหม่ก่อนใช้ (`git checkout -- . && git clean -fd -e .qc-shots -e node_modules -e '.env.*' && git checkout --detach <HEAD>`) · หลักฐาน `.qc-shots/c24*`, `.qc-shots/c25*` ยังอยู่
- ข้อสอบพร้อม: C2.6 (82 + web 34) · C2.7 (55 — **8 ข้อรอเคาะท้าย addendum brief C2.7**) · C2.8 (54) · C2.9 (47) · C2.10 (40) · C2.11 (47) · C3.0 (33) — ทุกใบยกเว้น C2.6/C2.7 เคาะแล้ว
- C2.6/C2.7 รับแล้ว 25 ก.ย. (commit ดูใน git log) · หลักฐาน builder ใน c20/c23 `.qc-shots/c26*` `.qc-shots/c27*` · probe ไม่ commit
- **กำลังเดิน**: C2.8 (c20/QC2 · ข้อสอบ 54 · ตอนรับต้อง ORACLE-EDIT `C2.1-S4.6`) ∥ C2.9 (c23/QC3 · 47) — spawn 25 ก.ย. ~00:20 UTC · ≤3 agent ขนาน
- ถัดไป: C2.10 → C2.11 → ปิดเฟส C2 (`qc:all` ส่ง DATABASE_URL/DIRECT_URL) → C3.0 migration
- วงจรที่ใช้ได้ผล (5 ใบ): builder (log ทุก suite) → **ผู้ตรวจอ่านอย่างเดียว opus** → ORACLE-EDIT + builder แก้ (before/after) → รวม (ไฟล์ร่วม: patch --fuzz + เช็คสมดุลวงเล็บ · inventory รวมตาม wo · docs regen ก่อน suite) → unit ตรวจรวม (ชื่อสคริปต์ใหม่ทุกรอบ · ถอยหลังรวม c1.11) → ภาพต้องมีข้อมูล → PARITY → wo-notes → commit

### 0.6 ถัดไปตามลำดับ
C2.4 (ข้อสอบ 78 · `CRM_ASSIST` พร้อมใช้จาก C2.0) → C2.5 ∥ C2.6 → C2.7 … C2.11 → ปิดเฟส C2 ด้วย `qc:all` (**ต้องส่ง DATABASE_URL/DIRECT_URL เข้าไปด้วย** ดู `scripts/pending/run-c1-qcall.sh`) → C3.0 (migration) …
- ข้อสอบที่พร้อมแล้ว (commit แล้วในทรีหลัก): C2.4 (78) · **C2.5 (94)** · **C2.6 (82)** · ยังอยู่ใน `shark-crm-c12a` รอ copy+commit: **`qc-crm-c2.6-web.mts` (34 · ตัว headless)** + **`qc-crm-c2.7.mts` (55)** พร้อม addendum ในสอง brief — **ต้อง typecheck ในทรีหลักก่อน commit**
- 🔴 C2.6 **ห้ามรับงานด้วยข้อสอบฝั่ง server ตัวเดียว** ต้องมีตัว headless ด้วย (คำตัดสิน 23 ก.ย. ท้าย brief C2.6)
- ข้อที่ผู้เขียนข้อสอบ C2.7 สารภาพว่า **ตั้งชื่อเอง ไม่มีเอกสารรองรับ** (13 ข้อ ท้าย brief C2.7) — ผู้คุมงานต้องเคาะก่อน spawn builder C2.7 · ข้อสำคัญ: `linkSaleToDeal` ต้องนับบิลที่จ่ายแล้วใน tx เดียวกัน (ไม่งั้นเงินไม่ถูกนับ) · ธง "เอกสารถูกยกเลิก" ใช้ `CrmDeal.tags` เพราะห้าม migration · ไม่มี `PosSale.dealId` (มติ C29) แม้ CRM-RUN §1 ยังเขียนว่ามี

## 0.9 🔴 โทเคน/โควตา (เจ้าของถาม 25 ก.ย.)
- โทเคนหลักอยู่ที่ sub-agent (builder 400–800k · ผู้ตรวจ ~250k · ผู้เขียนข้อสอบ ~300k ต่อรอบ) · session ควบคุมใช้ cache
- โควตา Opus ชนเพดานทุก ~4–5 ชม. เมื่อรัน 4 ตัวขนาน (24 ก.ย. ชน 3 ครั้ง: 08:00 · 13:00 · 18:00 UTC) ⇒ **รันขนานไม่เกิน 3 ตัว** · ก่อนชนเพดานให้ agent เซฟ log/หลักฐานเป็นระยะ (ทำอยู่แล้ว)
- ย้าย session ได้เฉพาะตอนไม่มี agent ค้าง (agent ตายพร้อม session) — จุดปลอดภัย = หลังรับใบ · RESUME นี้พอสำหรับเริ่มใหม่

### 0.10 สถานะ 25 ก.ย. 17:20 UTC (Fable) — ⏸️ พัก · เก็บกวาดแล้ว · **พร้อมย้ายบัญชี** · รับแล้ว **29/53 = 55%** · phase C2 ครบทุกใบ
- เก็บกวาด 17:20: ไม่มี unit/agent/chromium/port 3215 ค้าง · ลบ patch ชั่วคราวใน /tmp + โปรไฟล์ chromium `chr-crm-*` · ทรี shark-crm/c20/c23/c12a สะอาดทั้งหมด · qc:all ผล 325/355 บันทึกแล้ว (ข้อ 2) · ย้ายบัญชี: ทำงานใน `/root` เดิม (ความจำ + ledger อยู่บนเครื่อง) · ห้ามสองบัญชีแตะ repo/worktree เดียวกันพร้อมกัน
**เริ่มใหม่ทำตามลำดับนี้:**
1. ✅ push แล้ว 26 ก.ย. (`581428f1` · prod `dpl_EG93Xo…` 04:10 UTC · D12 C2.10/C2.11 เติมแล้ว) · `git status` ต้องสะอาด · main ตามหลัง session/crm 1 commit (ledger) — ไม่ต้อง push main แยก (push main = deploy จ่ายเงิน) รอ push จริงรอบหน้า
2. ✅ 26 ก.ย. เช็ก 2 แล้ว: coa T15 = ข้อสอบเน่าตามเวลา · kanban S3.2 = dnd-kit จาก member (CRM-RUN §4) · builder c1.3 debt เปิดบน c23/QC3 · (เดิม) **ผล qc:all ปิด C2 (อ่านแล้ว)**: 325/355 · ENV 25 ชุด (ข้อภาพ member/kanban) · **หนี้จริง 1 = `crm-c1.3` S0.3**: 5 ไฟล์อ่าน `CrmCompany` ตรง (`assignment.ts` `automation.ts` `emails.ts` `payments.ts` `sequences.ts`) → เปิด builder เล็ก (opus) refactor ผ่าน `companyWhere`/companies service แล้วรัน `qc-crm-c1.3` + c2.1/c2.2/c2.3/c2.5/c2.7 บน QC2 · **ต้องเช็ก 2**: `acc-v2-coa` T15.2/3/5 (เทียบกับ log เก่าว่ามีมาก่อน C2.7 ไหม — ถ้าใหม่ = ของ C2.7 `DOC_SETTLE`) · `kanban-k2.3` S3.2 (static — อ่าน `/tmp/claude-0/qc-all/qc-kanban-k2.3.log`) · ลง MASTER-PLAN §12 บรรทัดปิด C2 หลังแก้ c1.3
3. **C3.0 migration `crm_v2_c`** — builder รอบแรกถูกหยุด (เพิ่งเริ่ม · รัน `prisma format` แล้วทำ schema ทุกไฟล์เปลี่ยนรูปแบบ) · c20 ต้องรีเซ็ต (`git reset --hard && git clean -fd -e .qc-shots`) ก่อนเปิดใหม่ · prompt ใหม่ต้องสั่ง **ห้าม `prisma format` ทั้งชุด** (แก้เฉพาะ `crm.prisma` + ไฟล์ที่มี `HrPayAdjustment` + `PortalSession` ใหม่) · create-only เท่านั้น · Fable อ่าน SQL ทุกบรรทัด → `qc-prisma.sh migrate deploy` QC2 → `qc-crm-c3.0` (33) → QC1/QC3 → regressions ตาม brief §"Regressions the controller runs"
4. เลนถัดไปหลัง C3.0: C3.1 (รายงาน/scheduled) → C3.2 ∥ C3.3 → … (MASTER-PLAN §12 ลำดับ) · c20/c23 ที่ `ada8cac2` · 🔴 เปิดเลนใหม่ builder ต้อง reseed member+CRM บน QC ของตัวเอง
5. candidate C6.1: คอลัมน์ AppNotification `dedupeKey`/`deferredUntil`/`channels` (C2.10 B1) · FK HrPayAdjustment→CrmCommission · crontab

### 0.11 สถานะ 26 ก.ย. 05:40 UTC (Fable · session ใหม่) — ▶️ เดิน 3 เลน · รับแล้ว 32/53 = 60%
- session ก่อน (05:00 UTC) spawn builder 2 ตัวแล้วตายใน 25 นาที ⇒ spawn ใหม่ 05:40 ให้ "ทำต่อจากสภาพไฟล์" (agent ตายพร้อม session · ไฟล์ใน worktree ยังอยู่)
- **เลน A** หนี้ `crm-c1.3` S0.3 — builder opus ใน `shark-crm-c23`/QC3: helper 6 ตัวท้าย `companies.ts` มาจากรอบก่อน (uncommitted) · เหลือย้ายจุดเรียก 12 จุดใน assignment/automation/emails/payments/sequences · หลักฐาน `.qc-shots/c13debt/` · ต้องรัน c1.3 + c2.1/2.2/2.3/2.5/2.7/2.8 บน QC3 (reseed ก่อน)
- **เลน B** C3.0 migration `crm_v2_c` — builder opus ใน `shark-crm-c20`/QC2 (รีเซ็ตสะอาดที่ 7e32764f): ห้าม `prisma format` · owned = `crm.prisma` `payroll.prisma` `scope.ts` `migrations/20261102000000_crm_v2_c/` `wo-notes/crm-C3.0.md` · builder **ไม่ deploy** — Fable อ่าน SQL ทุกบรรทัด → `env QC_ENV_FILE=.env.qc2 bash scripts/qc-prisma.sh migrate deploy` (ผ่าน iso) → `qc-crm-c3.0` (33) บน QC2 → QC1/QC3 → regressions ท้าย brief · หลักฐาน `.qc-shots/c30/`
- **เลน C** ผู้เขียนข้อสอบ C3.1 — opus ใน `shark-crm-c12a`: `scripts/qc-crm-c3.1.mts` (26 + X) + addendum ท้าย brief C3.1 (ต้องเคาะก่อน spawn builder C3.1)
- ถ้า session ตายอีก: `git -C <wt> status` + `.qc-shots/` ของแต่ละเลน แล้ว spawn ใหม่ด้วย prompt เดิม (สรุปใน CRM-RUN §4 26 ก.ย. 05:40)
- **06:55 UTC**: A ✅ `d3856c50` · B ✅ `41c262c0` (33/33 QC1+QC2 · ชุดถอยหลังรอบ 1 แดง 27 ชุดเพราะ client ร่วมถูก generate ทับ — ดู CRM-RUN §4 06:50 · รอบ 2 `run-c30-verify-v2.sh` รอยูนิตแรกจบ) · C ✅ `4abc726e` (56 ข้อ · ruling 15 ข้อ) → **builder C3.1 กำลังทำใน c23/QC3** (หลักฐาน `.qc-shots/c31/`) · **ผู้เขียนข้อสอบ C3.2 ใน c110** · c20 ยังมีไฟล์ C3.0 (commit แล้วในทรีหลัก · รีเซ็ตได้) · c12a ที่ 4abc726e
- **07:40 UTC**: ข้อสอบ C3.2 ✅ `e98314d4` (46 ข้อ · ruling 15) → **3 agent กำลังทำ (เพดาน)**: builder C3.1 (c23/QC3 · `.qc-shots/c31/`) ∥ builder C3.2 (c110/QC2 · reseed เอง · `.qc-shots/c32/`) ∥ ผู้เขียนข้อสอบ C3.3 (c12a/QC1 throwaway) · crm_v2_c deploy ครบ QC1/QC2/QC3 แล้ว · ยูนิต `crm-c30-verify-v2` (27 ชุด + typecheck + m1.9) กำลังรัน log `.qc-shots/crm/c30-verify-v2.log` — m1.9 S7.2 รอบ 1 แดง (member.tier.* ค้าง 8 — น่าจะจากช่วง client เก่า · ถ้ารอบ 2 ยังแดง เปิด OutboxEvent.lastError)
- **13:30 UTC ✅ รับ C3.2 = 32/53 (60%)** · โควตา session ชน 13:25 (agent C3.5 r4 + C2.7-fix r3 ตาย · ไฟล์อยู่ใน c110/c20) · **ตัวปลุก 14:31 UTC** (bash sleep) → ทำทันที: (1) resume builder C3.5 rounds 4 "ต่อจากไฟล์" (SF1–SF5 + role matrix + notes ใน CRM-RUN 13:20) (2) resume C2.7-fix รอบ 3 (B1 re-derive settle + docPaymentLedger + F1.12–14 ใน CRM-RUN 13:35) (3) C3.3 รอบ 4 (refId `<paymentId>#r<n>` + ลบ PENDING ของแถว reverse) → ผู้ตรวจเงินสุดท้าย → รวม C3.3 → รวม C2.7-fix (rebase payments.ts) → ยูนิต QC1 (4) ผู้เขียนข้อสอบ C3.6–C3.9 · ห้ามลืม: ข้อสอบ c2.10 ฉบับ 11 เทมเพลตอยู่ใน c12a รวมพร้อม C3.3
- **11:10 UTC** C3.2 รวมแล้ว `684828d0` (ผู้ตรวจ 2 รอบ · ORACLE-EDIT SF-4 โดยผู้เขียนข้อสอบ · ACCEPTANCE-FIX perm โควตาใน nav) → ยูนิต `crm-c32-verify` QC1 (log `.qc-shots/crm/c32-verify.log` · build+ภาพ 3.2 owner/thana/manager · ยูนิตก๊อป expected.json ให้ c20/c12a หลัง reseed) · c110 รีเซ็ตที่ 684828d0 → **builder C3.5 portal (QC2 · reseed เอง)** · เลน: C3.3 r2 (c12a/QC1) · C2.7-fix (c20/QC1) · C3.5 (c110/QC2) = 3
- **10:20 UTC ✅ รับ C3.1 = 31/53 (58%)** · เลน: builder C3.2 รอบ 3 (c110/QC2) · builder C3.3 รอบ 2 BLOCKER เงิน 4 (c12a/QC1) · **C2.7-fix** (c20/QC1 · agent เดียว: เพิ่มข้อสอบ→แดง→แก้→เขียว → Fable ตรวจ) · builder C3.5 รอเลน
- **09:40 UTC** C3.1 รวมเข้าทรีหลัก `80c1269a` (ผู้ตรวจ: SHOULD-FIX 5 + NOTE 6 แก้ครบ · 56/56 QC3) → ยูนิต `crm-c31-verify` บน QC1 (reseed · ข้อสอบ ×2 · ถอยหลัง 17 · typecheck 5120 · fitness · **build+ภาพ 3.1 owner/manager** · m1.9) log `.qc-shots/crm/c31-verify.log` · ภาพ parity ต้องดูเองเทียบ mockup 09 · c23 รีเซ็ตที่ 80c1269a (expected QC3 คืนแล้ว) → ผู้เขียนข้อสอบ C3.5 portal · เลน: builder C3.2 (c110) · builder C3.3 (c12a) · ข้อสอบ C3.5 (c23) = 3
- **08:05 UTC เจ้าของเลือก "เอาคุณภาพ"** ⇒ เพดาน **3 เลน** (เครื่อง 2 CPU/8 GB) · Opus ทุกบทบาท · ผู้ตรวจทุกใบ · นักล่าทันทีหลังรับ C3.3/C3.5 · หลักฐาน X3/X4 แบบทำซ้ำบั๊ก · CP3 เจ้าของลองก่อน C4 · ✅ **รับ C3.0 = 30/53 (57%)** (`c2.7` 63/63 เมื่อ load ลด)
- **07:50 UTC** เจ้าของบอก "ไม่มี session อื่น เดินหน้าเต็มกำลัง" → เปิดเลนที่ 4: ผู้เขียนข้อสอบ C3.4 (opus · c20 รีเซ็ตที่ 9e2ecd00 · QC1 throwaway) · เพดานตอนนี้ 4 agent (ถ้าโควตา Opus ชน → กลับไป 3)
- รวม C3.1+C3.2 (ขนาน): ไฟล์ร่วม `index.ts`/`nav.ts`/`crm-ui-inventory.json`/registries → `patch --fuzz=3` + เช็คสมดุลวงเล็บ (ห้าม `git apply -3`) → รันข้อสอบทั้งสองใบซ้ำบน QC1
- 🔴 ห้าม agent ใด `prisma generate` (client ร่วม) · worktree ทุกตัวต้องอยู่บน commit ที่สคีมาเท่าทรีหลัก
- ถัดไป: รับ C3.0 หลังรอบ 2 เขียว (30/53) → รับ C3.1 (ผู้ตรวจอ่านอย่างเดียว opus ก่อน) → C3.2 ∥ C3.3 (ข้อสอบ C3.3 ต้องเขียนก่อน)

## 1. 🔴 กติกาที่เพิ่งได้มาจากคืน 23–24 ก.ย. (อ่านให้ครบ ไม่งั้นเสียเวลาซ้ำ)
1. **`qc-member-m1.1` ลบข้อมูล CRM ทั้งชุดด้วยตัวมันเอง** (ข้อ `M1.1-S3.4` รัน `seed-member-qc.mts` ซ้ำ = ลบร้านสร้างใหม่ · CRM ใช้ร้าน/slug เดียวกัน) ⇒ **วางได้ที่เดียว: หลัง reseed member และก่อน seed CRM** · พิสูจน์แล้วว่าย้ายแล้วเขียว
2. 🔴 **ห้ามห่อ build/typecheck/acc-v2-serve ด้วย flock เพิ่ม** — `with-gate-lock.sh` ถือ gate→qc2→qc3 ครบแล้ว ห่อซ้ำ = deadlock ทุก lane (Fable ทำพลาด 24 ก.ย. เสีย 40 นาที)
2c. 🔴 **โควตา session (หน้าต่าง 5 ชม.) เจ้าของสั่ง 26 ก.ย. 12:50 UTC ให้ pace เอง** — วันนี้ reset 09:30 UTC แล้วชน 84% ตอน 12:46 (3 ชม. 16 นาที) ⇒ อัตรา ≈ 26%/ชม. เมื่อรัน 3–4 agent · หน้าต่างถัดไป reset **14:30 UTC** (21:30 ไทย) แล้ว 19:30 · 00:30 … (ทุก 5 ชม. ตราบที่ใช้ต่อเนื่อง) · ประมาณงบ ≈ 4M sub-agent token/หน้าต่าง (นับจาก `subagent_tokens` ใน task-notification) · **กติกา (เจ้าของแก้ 12:58 UTC: "ใช้โควตาเกือบเต็มทุกรอบ")**: ทำ tally token ตั้งแต่ reset · เป้า ≈95% ตอน reset ไม่ใช่หยุดรอ · เมื่อเหลือน้อย ให้เลือกงานขนาดพอดีที่เหลือ (ผู้ตรวจอ่านอย่างเดียว ≈6% · ผู้เขียนข้อสอบ ≈10% · builder ≈15–20%) และเตรียมงานถัดไปให้พร้อมยิงทันทีที่ reset · ห้ามปล่อยหน้าต่างว่าง · ชน 429 = agent ตาย ไฟล์ยังอยู่ → spawn ใหม่หลัง reset "ทำต่อจากสภาพไฟล์" · weekly: All models 31% · Fable 11% (reset พุธ 17:59 ไทย)
2a. 🔴 **เครื่องมี 2 CPU / 8 GB / swap 4 GB** — typecheck 2 ตัวพร้อมกัน (3.2+2.7 GB) = swap เต็ม load 66 ⇒ ข้อสอบ race ที่ใช้ worker process แดงหลอก (26 ก.ย. `c2.7` X3.2 okPayments=0) · **typecheck/fitness/build ต้องผ่าน `with-gate-lock.sh` เสมอ (รวม builder ทุกตัว) และ NODE_OPTIONS ≤ 4096** · prompt ของ agent ต้องใส่คำสั่งนี้ตรง ๆ · เลนขนาน 4 ตัว = เพดานของเครื่อง ไม่ใช่แค่โควตา
2b. **ห้ามแก้ไฟล์สคริปต์ที่ unit กำลังรันอยู่** — bash อ่านต่อจาก byte offset ⇒ unit ตายกลางทาง (เสีย build 10 นาที + suites ที่เหลือ) · ก๊อปเป็นชื่อใหม่ต่อรอบ (`run-x-v3.sh`) + `bash -n` ก่อนยิง
3. ตัวเลขที่ agent รายงานไม่ใช่หลักฐาน — แต่ **หลักฐานที่ดีคือ "ทำบั๊กเดิมให้เกิดซ้ำ แล้วแสดงว่าของใหม่ไม่เป็น"** (ใช้กับ C2.2 ได้ผลมาก) สั่ง builder ให้ส่งของแบบนี้
4. ด่านใหม่ `scripts/qc-owner-guard.mts`: worktree อื่นห้าม reseed QC1 (exit 5) · ทรีหลักไม่ถูกขวาง · ห่อ qc2/qc3 ไม่ถูกขวาง
5. ก่อนโทษ agent ว่าทำฐานข้อมูลเสีย: `grep -l seed-member-qc scripts/qc-*.mts` ก่อน

## 2. Worktree (ทุกตัว detached · node_modules = bind mount ของ tree หลัก)
| path | หน้าที่ | ฐาน QC |
|---|---|---|
| `/root/projects/shark-crm` | tree หลัก · ผู้คุมงานตรวจ/commit/push | QC1 |
| `/root/projects/shark-crm-c12a` | ผู้เขียนข้อสอบ C2.3/C2.4 | ไม่ใช้ DB |
| `/root/projects/shark-crm-c20` | C2.0 builder (node_modules = overlay) | QC2 |
| `/root/projects/shark-crm-c19` | อดีต C1.9 (commit แล้ว · มีไฟล์ค้างไม่ต้องใช้) | QC1 |
| `/root/projects/shark-crm-c111` | C1.11 builder | QC2 |
| `/root/projects/shark-crm-c110` | อดีต C1.10 (ว่าง) | QC2 |
🔴 ก่อนลบ worktree ใด: `umount <wt>/node_modules` แล้วเช็คว่าว่าง แล้ว `rmdir` ก่อน `git worktree remove` (ไม่งั้นลบ node_modules ของจริง)
🔴 agent ตายไปกับ session แต่ไฟล์ใน worktree ยังอยู่ — session ใหม่: `git -C <wt> status` ดูงานค้าง แล้ว spawn builder ใหม่ให้ "ทำต่อจากสภาพไฟล์ปัจจุบัน" พร้อม brief + addendum

## 3. ฐาน QC สามตัว
- QC1 = `ep-plain-art…` (`.env.qc`) · QC2 = `wo-crm-qc2` `ep-cool-shadow…` (`.env.qc2`, แตกจาก QC1 · ไม่ใช่ prod)
- QC3 = `wo-crm-qc3` `br-bold-cherry-aox2mvxk` `ep-weathered-river…` (`.env.qc3`, แตกจาก QC2 20 ก.ย. · มี C2.0 แล้ว) · `scripts/qc3.sh` · ล็อก `/tmp/shark-gate-qc3.lock` · ลบตอน C6.4
- `scripts/qc2.sh <cmd>` = ไป QC2 + ล็อก `/tmp/shark-gate-qc2.lock` · typecheck/build/serve ใช้ล็อกเครื่องเดียวเสมอ
- แต่ละ worktree ผูก branch เดียว · expected.json มาจากการ seed branch นั้น · ลบ QC2 ตอน C6.4

## 4. กติกาที่เพิ่มระหว่าง RUN (ผูกพันทุกใบ)
- ข้อสอบ/ด่าน D7 ทุกใบต้องมีกรณี **ร้าน uiVersion 1** (ทุกร้านบน prod เป็น 1) · หน้า v1 ต้องเหมือนเดิมทุกไบต์
- migration ห้ามมีคำสั่งที่ล้มได้กับข้อมูล prod เดิม (UNIQUE/NOT NULL/FK บนแถวเดิม → C6.1)
- ก่อน spawn agent: `cd` tree ที่ถูก + บอก path เต็มในคำสั่ง (agent รับ cwd)
- เจอแดงแปลก: เก็บ snapshot ข้อมูลก่อน reseed
- สวิตช์ v1↔v2 (C1.11) ซ่อนจากร้านจริงโดยปริยาย (`CRM_V2_SWITCH_TENANTS` / `CRM_V2_SWITCH`)

## 5. เรื่องรอเจ้าของ
- `ledger/CRM-OWNER-QUESTIONS.md` (Q5 rehearsal · Q6 payload webhook ดีลชนะ — ค่าเริ่มต้นเดินหน้า)
- ดิสก์ VPS (ตอนนี้ว่าง ~16 GB — มีคนเคลียร์แล้ว)
- เช็ค prod `/api/health` outboxPending (หลัง C1.8 ค้าง 1 นาน 30 นาที · 19 ก.ย. 04:51 UTC) — ถ้ายัง ≥1 วันถัดไป แจ้งเจ้าของ
- 🔴 ห้ามเปิด CRM v2 ให้ร้านนำร่องก่อน C6.1 ติด crontab รายชั่วโมง/รายวัน (กฎ C2.1 ขั้นรอ/ตามเวลาจะไม่ทำงาน)
- C6: ชื่อร้านนำร่อง · "ทำ" สำหรับ backfill บน prod · crontab
