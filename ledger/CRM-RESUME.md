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

### 0.19 ▶️ 30 Sep 2026 ~10:00 UTC — RESUMED (new Claude account) · owner: **1 lane first** · 44/53 = 83%
- Lane (the only agent): **C5.4-C round 8b builder** (Opus · id ad432d1fb4fb1977d · worktree c54c at 61985bba · QC2 only) — ruling R8-1 option (a): batch from `GRP#…#<child>` key in restoreDocForCheque / voidPaymentInTx / voidVendorPaymentInTx / group void · drops createCheque `paymentIds` + backfill script · one authorised ORACLE-EDIT (probe-r8 G0) · checkpoints in c54c `ledger/wo-notes/crm-C5.4-C.md` "Round 8b" · logs `/tmp/c54c-logs/r9/` · ends with one local WIP commit (no push). If it dies: new agent "continue from the files" with the same ruling.
- Controller machine work (no quota): unit **crm-c44-accept** (`scripts/pending/run-c44-accept-v1.sh`) = restore QC1 expected → build HEAD + server 3215 → --clean → `--journey all` → --clean · results `.qc-shots/crm/c44-accept/_summary.txt` + `journeys.log` · passed===total ⇒ accept C4.4 (45/53); reds ⇒ classify (known infra: US5 RESEND key · US9 tracker origin).
- After builder hands back: controller reads the diff → QC1 cheque suites (wht-cheque / cheque-audit / ai-skill · pattern `scripts/pending/run-c54c-r7c-cheque.sh`) → money hunter r9 (read-only, the single lane) → patch incremental onto main → gate (`run-main-c.sh` list) → commit. ⛔ prod push = ask owner.
- **10:45 UTC update** · builder r8b DONE → c54c local commit **80be6e11** (new leaf `account/group-batch.ts`; report in c54c wo-notes "Round 8b"; probe-cn 33/33 · probe-r8 green · c2.7 79 · groups 174 · payments 162 · typecheck 0 · fitness ×2) · controller read the src diff (OK) · **QC1 cheque suites on 80be6e11: wht-cheque 69/69 · ai-skill 33/33 · cheque-audit 33/33** (`.qc-shots/crm/c54c-r8b-cheque.log`) · lane now = **money hunter r9** (Opus · id aab02ca360aa8619a · QC2 · report → c54c `ledger/wo-notes/crm-C5.4-C-hunt-r9.md` · probes `scripts/pending/hunt-54c-r9/`). After verdict: fixes (builder) or patch `git diff c10ee3f9 80be6e11` onto main → gate → commit.
- **C4.4 acceptance run (main 3371c9e2 · QC1)**: 77/85 · 1 gap (US5-0 compose, known) · --clean 52 rows. Reds = NOT accepted yet; controller diagnosis so far: **US4-5b = RUNNER** (AI transcribe fieldset renders only after the call is `saved` — CrmCallLogModal.tsx:227; runner looks before save and uploads no audio) · **US9-2/3/4 = RUNNER fixture** (`/t/e` requires Origin host ∈ tracking `domains` — tracking.ts:626; runner enables tracking but never adds the QC host; no origin-guard aborts in the log = I2 fix works) · **US5-3/5/7 = not diagnosed** (send now SENT via dev fallback; click data absent in routing.links; enrollment null). NEXT lane after the hunter: C4.4 oracle round 4 (fix runner US4/US9, diagnose US5, rerun `--journey US4,US5,US9` then all) — server 3215 is up as unit `crm-qc1-serve` (RemainAfterExit; plain units kill the server when they end — use this unit, `systemctl stop crm-qc1-serve` to stop).
- **11:15 UTC update** · hunter r9 DONE (c54c commit afa8833c = r8b + report `ledger/wo-notes/crm-C5.4-C-hunt-r9.md` + probes `scripts/pending/hunt-54c-r9/` · pushed to wip/crm-c54c-r8): r8b claims held, no regression — but 2 BLOCKER + 4 MAJOR **pre-existing** (also on prod account V2) in the cheque unwind: R9-1 bounce keeps per-payment tax invoices (VAT twice on re-collect) · R9-2 deposit receipt by cheque bounced ⇒ phantom AR · R9-3 WHT not unwound · R9-4 void inside the group-payment window ⇒ cheque linked to voided payment · R9-5 refused cheque leaves committed payments · R9-6 group head not re-synced · R9-7 MINOR journal-no race (gl.ts:290 — **separate card, not this batch**) · R9-8 NOTE. **RULING → ROUND 10** (lane = builder resumed, id ad432d1fb4fb1977d): A one shared per-payment unwind (voidPayment parity: WHT, auto-TI, deposit; F3-parity refusal on bounce; bounce JV AR leg = Σ actually-voided) · B group payment = ONE tx (extract recordPaymentInTx / recordVendorPaymentInTx / createChequeInTx; validate cheque draft before writes; form path payment.ts same) · C sync group head on bounce. Logs `/tmp/c54c-logs/r10/`. After handback: controller diff read → QC1 cheque suites (`run-c54c-r8b-cheque.sh` pattern, new name) → hunter r10 (resume aab02ca360aa8619a) → patch onto main.
- Heartbeat CronCreate `*/23` re-created (session-only). Old agent ids in §0.18 are dead (account switch). Leftover servers: 3216, 3217 (`c432-serve`) still up — harmless, stop when memory is needed.
- Main tree working copy: `scripts/*-expected.json` + fixtures = QC1 seed ids (restored from `.qc-shots/qc1-expected/`) — do NOT commit them.

### 0.18 ⏸️ 28 Sep 2026 ~23:40 UTC — WEEKLY-LIMIT STOP (owner) · 44/53 = 83% · lanes 2 · no agents/units running
- MAIN (session/crm) = C4.4-fix 3f934300 on top of C r5 4888a96e + F 986ec608 · all pushed · prod still 3677d983 (nothing new pushed to prod — ⛔ ask owner first; C money must NOT ship before r8 done).
- C4.4: fix merged + gate green; card NOT accepted yet → rebuild QC1 3215 from HEAD (`scripts/pending/run-build-head3.sh` pattern — NEVER wrap acc-v2-serve in with-gate-lock) → run ALL journeys US1–US10 on QC1 (runner env WEBHOOK_ALLOW_PRIVATE=1) + --clean → passed===total ⇒ accept C4.4 (45/53).
- C5.4-C r6–r8 = branch **wip/crm-c54c-r8** (61985bba; incremental = `git diff c10ee3f9 61985bba`; worktree shark-crm-c54c). Hunter r6 F1–F7 + r7 N1 closed + B2c refuse + legacy cheque phrases (QC1 wht-cheque 69/69). OPEN R8-1 (group/billing-note payment by cheque links only first child): partial fix in WIP (group void one tx + up-front refusal · restore loops) but `AccountDocumentPayment.chequeId` is UNIQUE ⇒ **RULING (controller): option (a) no migration** — derive the batch from payment key `GRP#…#<child>` in restoreDocForCheque/voidPaymentInTx, drop `paymentIds` + backfill script; then rerun probe-r8 (G0–G3 + G1b), r7 reruns, probe-cn, c2.7, groups, payments, write-payments, typecheck, fitness ×2 (QC2) + wht-cheque/cheque-audit/ai-skill on QC1 (swap acc-v2-expected like scripts/pending/run-c54c-r7c-cheque.sh) → hunter r9 → patch incremental onto main → gate (run-main-c.sh list) → commit.
- Agents (resume via SendMessage if transcripts survive; else new agents from wo-notes): C builder a967cc389179d4d2a · money hunter ab3bffbcee8ecf3e9 · C4.4-fix builder a260db9b893b75e34 · C4.4 reviewer a5211e54e500acd78 · C4.2 it4 aed457d6ca7a8aed3 (GO pending, needs fresh 3215).
- Then queue: C4.2 it4 → accept C4.1/C4.2 · C4.2-fix (B1–B6) · C5.4-D queues · C5.4-E UX · C5.5 · C3.10 · C6. Owner pending P1–P17 (`ledger/CRM-OWNER-PENDING.md`; new P17).
- Worktree c44f fully merged (can be removed) · QC1 reseed expected files (acc-v2/crm/member-expected + kbank fixtures) backed up in `.qc-shots/qc1-expected/` and the tree reset to HEAD for a clean checkout — **before any QC1 run: `cp -r .qc-shots/qc1-expected/scripts/. scripts/`** (HEAD versions match QC2).

### 0.17 ▶️ 28 Sep 2026 ~20:20 UTC — 2 lanes · 44/53 = 83%
- MAIN = 4888a96e (batch F + C4.4 oracle 986ec608 · batch C r5 4888a96e) · pushed session/crm · prod still 3677d983 · ⛔ C money NOT for prod until r6.
- QC1 server 3215 rebuilt from 4888a96e (AI mock · WEBHOOK_ALLOW_PRIVATE=1) READY 20:18. 🔴 never wrap acc-v2-serve.sh in with-gate-lock (it locks itself → self-deadlock).
- Lane 1: C5.4-C round 6 (a967cc389179d4d2a · c54c on TEMP r5 commit c10ee3f9 · QC2) fixing hunter r6 F1–F7 (probe scripts/pending/hunt-54c-r6/probe-r6.mts) → then incremental patch (diff vs c10ee3f9) onto main → gate (run-main-c.sh list) → re-hunt.
- Lane 2: C4.4-fix builder (a260db9b893b75e34 · c44f on TEMP b112b467 = 986ec608 + C r5 · QC3) items taxId/role · stageOnQuote UI · dealDocInput company partyId · CREATE_DEAL primary contact · I3 → merge diff vs b112b467 → rerun journeys on QC1 → accept C4.4.
- Queued: C4.2 it4 GO (aed457d6ca7a8aed3, server ready) → accept C4.1/C4.2 · C4.2-fix (B1–B6) · C5.4-D · C5.4-E · C5.5 · C3.10 · C6.
- promptpay PP16 = fixture gap on QC2 (no staticPending request row) — reseed acc-v2 on QC2 or fix fixture before C3.10 qc:all. main scripts/acc-v2-expected.json working copy = QC1 seed ids (do not commit blindly).

### 0.16 ⏸️ 28 Sep 2026 ~12:50 UTC — QUOTA STOP at 91% · 43/53 = 81% · lane cap now 2 (owner)
- MAIN = c6fe26d2 (batch A r1–3 + C4.3-fix2 committed). QC1 server 3215 rebuilt from c6fe26d2 (AI mock · WEBHOOK_ALLOW_PRIVATE=1).
- Unit crm-c43-accept (C4.3 acceptance on main/QC1): oc1 10/10 · i1 296/296 · q01 65/66 (deal-new @390 "ตัวเลือก @first ไม่มีใน deal-new-contact" — likely data/timing, re-run q01 + inspect) · q02 56/56 · q03–q10 + merge running → gate true ⇒ accept C4.3 (44/53).
- Agents to resume (wo-notes checkpoints): C5.4-B a79fe2841ad004c36 round 4 (hunter H1–H6) · C5.4-C a967cc389179d4d2a round 3 (zero-cash paid event · CN race · backfill dry-run).
- Queued (lane cap 2): C5.4-F review r2 (a65c68198f8dc4d6e) → F hunter · C money hunter after C r3 · C4.2 it4 GO (aed457d6ca7a8aed3, server ready) · C4.4 full run GO (a34d2630d3542be17, server has WEBHOOK_ALLOW_PRIVATE) · C4.4-fix builder (4 items) · C4.2-fix builder (B1–B6) · C5.4-D queues · C5.4-E business/UX · C3.10 · C5.5 · C6.

### 0.15 ⏸️ 28 Sep 2026 ~06:00 UTC — QUOTA STOP at 95% (owner) · accepted 43/53 = 81%
Resume via SendMessage (each agent has a wo-notes checkpoint):
- C5.4-A (a6099ec1d458b59fb · c54a): round 3 = hunter H1–H5 (report ledger/wo-notes/crm-C5.4-A-hunt.md). Batch A rounds 1–2 are ALREADY MERGED into the MAIN working tree (uncommitted!) — unit crm-c54a-main verifies it · after round 3: re-merge the delta (patch, read hunks) → gate → commit.
- C4.3-fix2 (a467afb01d3d14282 · c432): round 2 = S1 activity clear · S2 required custom fields UI + SERVER enforcement (action + REST) · N2 FieldError outside <label> · then ALL parts + merge under the QC3 lock → merge into main → accept C4.3 (44/53).
- C5.4-B (a79fe2841ad004c36 · c54b) · C5.4-C (a967cc389179d4d2a · c54c): building.
- C4.2 (aed457d6ca7a8aed3): it3 analysis; unit crm-c42-it3b (other roles).
- C4.4 (a34d2630d3542be17): stories.
- Owner rules now: cap 6 lanes · ask quota % hourly · stop at ≥90%.

### 0.14 ⏸️ 28 Sep 2026 ~02:00 UTC — QUOTA STOP at 81% (owner) · accepted **43/53 = 81%** (C5.2 · C5.3 · C5.1 today) · prod LIVE 3677d983 (C3.9-fix + Vercel tsc split)
Resume each agent via SendMessage from its wo-notes checkpoint (transcripts survive):
- C4.2 (aed457d6ca7a8aed3 · c42) — unit `crm-c42-it3b` keeps running owner→manager→nok→thana→customer · then merge_summary per role (wo-notes §12)
- C4.3-fix part 2 (a467afb01d3d14282 · c432) — unit `c432-v3` rebuild #3 + hardened oracle + shots (`.qc-shots/c432/v3-progress.log` ends V3DONE) · server 3217 unit `c432-serve` · then controller: eyeball screenshots vs mockups → merge → C4.3 card (passed===total)
- C4.4 (a34d2630d3542be17 · c44) — US4/5/7/8 unclassified, US9/10 not run · --clean leftovers · US3 product bug = C4.4-fix item
- C5.4-A (a6099ec1d458b59fb · c54a) — all 10 coded · units c54a-tc2 + c54a-reg-new2 running · re-run fitness → handback → reviewer + hunter
- C5.4-B (a79fe2841ad004c36 · c54b) — planned only · baseline unit c54b-base · ruling 6 refined (wo-notes)
- Queued: C5.4-C money (L2 + X1: REST paidSatang/wonValueSatang) · D queues (L3 M1 CRM/M2/M4/m2) · E business/UX (L6) · F public (L4 M1, M3 part, m1–m3) · C4.4-fix (US2 taxId/role · US3 stage UI + contact/company partyId bug · US5?) · C3.10 (qc:all · CP3 owner · HANDOVER) · rebuild QC server 3215 from HEAD after C4.2 it3
- 02:40 UTC update: quota 90% (owner) · reset ≈04:35 UTC · C5.4-A reviewer MERGEABLE AFTER SF (3xx=delivered · keep storing 500 · phone column valid-only + notes) → round 2 in c54a, checkpoint "ROUND 2 STOP" in its wo-notes · C4.3-fix2 unit c432-v3 (i1 274/276 · q01 62/62 so far) · C4.2 it3 owner 13/13 done (analyse #6/#13/#12 first) · manager… running in crm-c42-it3b · after reset: cron one-shot 04:52 resumes lanes
- Hazard noted: C2.1-S6.2 spawns qc-member-m3.3 which does a GLOBAL drain (crashed at start twice on QC2) — scope it before the next shared-DB run

### 0.13 ▶️ 27 ก.ย. ~14:10 UTC (Fable · บัญชีใหม่ · เครื่อง KVM4 4 CPU/15 GB) — เดิน 3 เลน · 40/53 = 75%
- worktree เดิม c12a/c20/c23/c110 **มีไฟล์ค้างที่ยังไม่ reset** (ตัวกรองสิทธิ์ไม่ให้ session นี้ reset — ของรวมเข้า main แล้วตาม §0.12) · bind mount node_modules หายหลังรีบูต · **สร้าง worktree ใหม่** `shark-crm-c42` (C4.2) `-c43` (C4.3) `-c44` (C4.4) ที่ 18feaa84 + `mount --bind` node_modules ของทรีหลัก (รีบูตแล้วต้อง mount ใหม่) + ก๊อป `.env.qc*`
- ยูนิต `crm-c39fix-main` ยิง 13:45 UTC (log `.qc-shots/crm/c39fix-main.log`) → เขียว = จด gate C3.9-fix + แจ้งเจ้าของก่อน push prod
- เลน A: builder C4.2 triage (Opus · c42) Phase 1 = ทะเบียน opener/needs/viewport + dry (QC3) · เลน B: ผู้เขียน C4.3 ฟอร์ม (Opus · c43 · QC3 in-process) `qc-crm-forms.mts` + `scripts/lib/qc-crm-restore.mts` · เลน C: ผู้เขียน C4.4 US1–US10 (Sonnet · c44 · QC2) `scripts/crm-journeys/` + `--journey` · ทั้งสามหยุดหลัง Phase 1 → **ผู้คุมงาน: หลังยูนิตจบ พักทุกเลน → build จาก HEAD → `acc-v2-serve.sh start` (QC1 · 3215) → resume เลนสำหรับ Phase 2 (รันจริงผ่าน gate lock)**
- heartbeat CronCreate `*/23` (session-only · re-created 22:42 after container restart)
- ~14:25 UTC OWNER: **4 lanes** · lane D = C5.1 perf builder (Opus · `shark-crm-c51` · QC2 tenant crm-perf-qc) · old worktrees cleaned by owner · owner items → `ledger/CRM-OWNER-PENDING.md` · tg = % only · unit relaunched ~13:55 (first launch failed: relative path)

### 0.12 🔴 CHECKPOINT 27 ก.ย. 2569 ~13:50 UTC — เจ้าของอัปเกรด VPS เป็น KVM4 + ย้ายบัญชี Claude (session ใหม่เริ่มที่นี่)
**รับแล้ว 40/53 = 75%** (C2 ครบ · C3.0–3.9 · C2.7-fix · C3.3-fix) · commit ล่าสุด = ดู `git log -1` (session/crm) · **ทุกอย่างรวมเข้าทรีหลักแล้ว — worktree c12a/c20/c110/c23 ไม่มีของที่ยังไม่ได้รวม (reset ได้)**

**ค้าง (ทำต่อทันทีหลังเครื่องใหม่พร้อม):**
1. **C3.9-fix acceptance**: โค้ดรวมแล้ว (`0053f261`) · ผู้ตรวจความปลอดภัย 3 รอบ MERGEABLE · **ยูนิตยืนยันบนทรีหลักยังไม่จบ** (ถูกหยุดตอน checkpoint) → รัน `systemd-run --unit=crm-c39fix-main --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash scripts/pending/run-c39fix-main.sh` (c3.9 48/48 ×2 + regression 34 + fitness + m1.9) → ถ้าเขียว = จด gate ใน wo-notes C3.9 §C3.9-fix · **แล้วจึงเปิด push prod** (`git push origin HEAD:main`)
2. **C4.1** รวมแล้ว (`15707b04`) รอ C4.2 รันจริงยืนยัน backdrop testid 5 ตัว · **C4.2** runner + ทะเบียน: pilot owner 1,962 กด ผ่าน 510 / dead 1,327 (แถวในชีตต้องเปิดก่อน) → งาน triage ค้าง: เพิ่มฟิลด์ `opener`/`needs` ในทะเบียน + ตัวกด แล้ววน owner จน dead = จริง (ดู `ledger/wo-notes/crm-C4.2.md` สถานะล่าสุด) · finding จริงแล้ว: `/deals/new` ล้นจอ 390 · `/p/[slug]` 404 resource
3. **C3.10 ปิดเฟส**: qc:all เต็ม · CP3 เจ้าของลองบนร้าน QC · HANDOVER · แล้ว C4.3/C4.4 · C5 นักล่า 5 · C6 (crontab · backfill · pilot)
4. คำถามเจ้าของค้าง: Q7–Q13 (`ledger/CRM-OWNER-QUESTIONS.md` + wo-notes)

**วิธีเริ่มใหม่บนเครื่อง/บัญชีใหม่:** `git pull` · อ่าน §0.12 นี้ + `ledger/CRM-RUN.md` ท้ายไฟล์ · ตรวจ `.env.qc/.env.qc2/.env.qc3` มีอยู่ · `pnpm install` + `bash scripts/qc-prisma.sh generate` ถ้า node_modules ใหม่ · worktree เดิมถ้าหายให้ `git worktree add` ใหม่ (c12a/c110 = bind mount node_modules · c20/c23 = overlay — ดู 0.11) · เปิด CronCreate heartbeat ใหม่ (session-only) · กติกาคงเดิม: เอาคุณภาพ · ≤3 เลน · **build ต้องพักทุกเลนก่อน (OOM 3 ครั้งบน 2 CPU/8 GB — KVM4 น่าจะดีขึ้น)** · ผู้ตรวจอิสระทุกใบ · นักล่าหลังใบเงิน/ความปลอดภัย · patch --fuzz แล้วอ่านทุก hunk · ห้าม prisma generate ในเอเจนต์ · pgrep -f จับตัวเอง · รายงาน tg เป็นระยะ

### 0.11 สถานะ 26 ก.ย. 05:40 UTC (Fable · session ใหม่) — ▶️ เดิน 3 เลน · รับแล้ว 35/53 = 66%
- session ก่อน (05:00 UTC) spawn builder 2 ตัวแล้วตายใน 25 นาที ⇒ spawn ใหม่ 05:40 ให้ "ทำต่อจากสภาพไฟล์" (agent ตายพร้อม session · ไฟล์ใน worktree ยังอยู่)
- **เลน A** หนี้ `crm-c1.3` S0.3 — builder opus ใน `shark-crm-c23`/QC3: helper 6 ตัวท้าย `companies.ts` มาจากรอบก่อน (uncommitted) · เหลือย้ายจุดเรียก 12 จุดใน assignment/automation/emails/payments/sequences · หลักฐาน `.qc-shots/c13debt/` · ต้องรัน c1.3 + c2.1/2.2/2.3/2.5/2.7/2.8 บน QC3 (reseed ก่อน)
- **เลน B** C3.0 migration `crm_v2_c` — builder opus ใน `shark-crm-c20`/QC2 (รีเซ็ตสะอาดที่ 7e32764f): ห้าม `prisma format` · owned = `crm.prisma` `payroll.prisma` `scope.ts` `migrations/20261102000000_crm_v2_c/` `wo-notes/crm-C3.0.md` · builder **ไม่ deploy** — Fable อ่าน SQL ทุกบรรทัด → `env QC_ENV_FILE=.env.qc2 bash scripts/qc-prisma.sh migrate deploy` (ผ่าน iso) → `qc-crm-c3.0` (33) บน QC2 → QC1/QC3 → regressions ท้าย brief · หลักฐาน `.qc-shots/c30/`
- **เลน C** ผู้เขียนข้อสอบ C3.1 — opus ใน `shark-crm-c12a`: `scripts/qc-crm-c3.1.mts` (26 + X) + addendum ท้าย brief C3.1 (ต้องเคาะก่อน spawn builder C3.1)
- ถ้า session ตายอีก: `git -C <wt> status` + `.qc-shots/` ของแต่ละเลน แล้ว spawn ใหม่ด้วย prompt เดิม (สรุปใน CRM-RUN §4 26 ก.ย. 05:40)
- **06:55 UTC**: A ✅ `d3856c50` · B ✅ `41c262c0` (33/33 QC1+QC2 · ชุดถอยหลังรอบ 1 แดง 27 ชุดเพราะ client ร่วมถูก generate ทับ — ดู CRM-RUN §4 06:50 · รอบ 2 `run-c30-verify-v2.sh` รอยูนิตแรกจบ) · C ✅ `4abc726e` (56 ข้อ · ruling 15 ข้อ) → **builder C3.1 กำลังทำใน c23/QC3** (หลักฐาน `.qc-shots/c31/`) · **ผู้เขียนข้อสอบ C3.2 ใน c110** · c20 ยังมีไฟล์ C3.0 (commit แล้วในทรีหลัก · รีเซ็ตได้) · c12a ที่ 4abc726e
- **07:40 UTC**: ข้อสอบ C3.2 ✅ `e98314d4` (46 ข้อ · ruling 15) → **3 agent กำลังทำ (เพดาน)**: builder C3.1 (c23/QC3 · `.qc-shots/c31/`) ∥ builder C3.2 (c110/QC2 · reseed เอง · `.qc-shots/c32/`) ∥ ผู้เขียนข้อสอบ C3.3 (c12a/QC1 throwaway) · crm_v2_c deploy ครบ QC1/QC2/QC3 แล้ว · ยูนิต `crm-c30-verify-v2` (27 ชุด + typecheck + m1.9) กำลังรัน log `.qc-shots/crm/c30-verify-v2.log` — m1.9 S7.2 รอบ 1 แดง (member.tier.* ค้าง 8 — น่าจะจากช่วง client เก่า · ถ้ารอบ 2 ยังแดง เปิด OutboxEvent.lastError)
- **27 ก.ย. 12:55 UTC ✅ รับ C3.8 = 40/53 (75%)** · C4.1+C4.2 runner รวมแล้ว (15707b04 · รอรันจริง) · C3.9-fix รอบ 4 ใน c12a (RESUME แล้ว) → ผู้ตรวจ → รวม → ยูนิต → เปิด push prod · ถัดไป: C4.2 รันจริง (server จาก HEAD · ~ชม.) · C3.10 ปิดเฟส (qc:all + CP3 เจ้าของ) · 🔴 build = ต้องพักทุกเลนก่อน (OOM 3 ครั้ง)
- **27 ก.ย. 10:50 UTC 🔴 C3.9-fix เปิด** — นักล่าความปลอดภัยพบ BLOCKER 5 (PII รอดจากการลบ · CRM ลบสมาชิกข้ามสิทธิ์) ⇒ **⛔ อย่า push HEAD:main (prod) จนกว่า C3.9-fix จบ** (push session/crm ได้) · ลำดับ: hunter ORACLE-EDIT H1–H12 ใน main → reset c12a → builder → ผู้ตรวจ → ยูนิต
- **27 ก.ย. 10:05 UTC ✅ รับ C3.9 + C3.4 = 39/53 (74%)** · C3.3-fix ปิดแล้ว (c3.3 90/90 บนทรีหลัก) ⇒ **push prod ได้** (`git push -u origin session/crm && git push origin HEAD:main`) · เลน: C3.8 รอบ 2 (c110/QC2) → ผู้ตรวจ → รวม → 40/53 · C4.2 runner พร้อม (main) · ถัดไป C3.10 ปิดเฟส (qc:all · CP3 เจ้าของลอง) → C4 · worktree ว่าง: c12a c20 c23 (reset ก่อนใช้)
- **27 ก.ย. 02:55 UTC 🔴 C3.3-fix เปิด** — นักล่าเงินพบ MAJOR 5 (ทำซ้ำได้) · ลำดับ: hunter เขียน ORACLE-EDIT C3.3-H1–H6 ใน main (แดง) → `git -C shark-crm-c12a reset --hard HEAD-ของ-main` → builder C3.3-fix (c12a/QC1) → ผู้ตรวจเงิน → ยูนิต → commit · **⛔ เจ้าของอย่า push HEAD:main (prod) จนกว่า C3.3-fix จบ** (push session/crm ได้)
- **27 ก.ย. 02:25 UTC ✅ รับ C3.3 + C2.7-fix = 37/53 (70%)** (`ff2cb5fb` + commit รับ) · เลน: C3.4 builder (c110/QC2) · C3.9 ผู้ตรวจรอบ 2 (c23) · นักล่าบั๊กเงิน C3.3 (main/QC1 probe) · unit `crm-c33-post` (ภาพ 3.7 thana + c3.7 ซ้ำ) · c20/c12a ว่าง (รีเซ็ตก่อนใช้) · ถัดไป: ผล C3.9 r2 → รวม C3.9 (c23 base = C3.0 commit? ดู `git -C shark-crm-c23 log -1`) → ยูนิต → 38/53 · C3.4 → ผู้ตรวจ → รวม · C3.8 builder หลัง C3.4 (c12a) · 🔴 build ห้ามซ้อนกับชุด QC ของเลนอื่น (OOM 2 ครั้ง) — สั่ง PAUSE เลนอื่นก่อน build
- **27 ก.ย. 00:00 UTC 🔨 รวม C3.3 + C2.7-fix ในทรีหลักแล้ว (ยังไม่ commit — รอยูนิต `crm-c33-verify` เขียว)** · payments.ts = ฐาน c20 + C3.2 + hook C3.3 ครบ 8 จุด (ทำมือ) · ORACLE-EDIT C3.3-CLEAN ใช้แล้ว (split_part part 2 — ผู้สร้างเสนอ part 3 ผิด) · สเปคภาพ "3.3" + C37_GATE · ถ้า session ตาย: `git status` ในทรีหลักต้องเห็น 28 ไฟล์แก้ + 9 ไฟล์ใหม่ (commissions) — **ห้าม reset** · ต่อ: `systemd-run --unit=crm-c33-verify … scripts/pending/run-c33-verify.sh` → ตาภาพ vs mockup 10 ขวา → wo-notes C3.3 + C2.7-fix gate → commit → รับ 37/53 → รีเซ็ต c110 = HEAD → builder C3.4 · C3.9 builder (c23) กำลังทำ · c20/c12a ว่างหลัง commit
- **23:20 UTC ✅ รับ C3.6 + C3.7 = 35/53 (66%)** · เลน: C3.3 รอบ 7 (c12a) · C3.9 (c23) · C2.7-fix รอ (c20) · c110 ว่าง (รีเซ็ตก่อนใช้ → builder C3.4 หลังรวม C3.3) · ถัดไป: รวม C3.3+C2.7-fix (เดินสาย hook: `afterPaymentsReversed` ที่ payments.ts :446/:537/:809/:882 · `afterPaymentCounted` :541/:634/:925/:1012 ของ c20 — ตำแหน่งจริงดูใน c20) → ยูนิต → รับ → C3.4
- **20:35 UTC** C3.6+C3.7 รวมเข้าทรีหลัก `4c00bf09` → ยูนิต `crm-c367-verify` (log `.qc-shots/crm/c367-verify.log` · build · shoot-crm · ภาพ 3.6 owner · 3.7 owner/thana · oracle 3.7 ซ้ำ) · c23 รีเซ็ตที่ 4c00bf09 → ผู้เขียนข้อสอบ C3.8+C3.9 · c110 ว่าง (รีเซ็ตก่อนใช้) · C3.3 รอบ 6 (c12a) · C2.7-fix พร้อม (c20)
- **20:15 UTC ✅ รับ C3.5 = 33/53 (62%)** · ถัดไป: รวม C3.6 (c23) + C3.7 (c110) → ยูนิต `crm-c367-verify` (build · visual 3.6 owner · 3.7 owner/thana · shoot-crm · oracle 3.7 ซ้ำ) · C3.3 รอบ 6 กำลังทำ → ORACLE-EDIT (M14/S2.5/M15/M16) → รวมคู่ C2.7-fix (เดินสาย hook 8 จุด) → ยูนิต
- **17:50 UTC** C3.5 รวมเข้าทรีหลัก `c0e35025` (ผู้ตรวจ 3 รอบ · 67/67) → ยูนิต `crm-c35-verify` QC1 (reseed member+crm+acc-v2 · ข้อสอบ ×2 · ถอยหลัง 28 · build · prep portal → ภาพ 3.5 customer 6 หน้า + owner settings · undo) log `.qc-shots/crm/c35-verify.log` · ภาพ portal ต้องดูเองเทียบ mockup 12 · c110 ว่างแล้ว (รีเซ็ตก่อนใช้) · เลน: C2.7-fix r3 (c20) · C3.3 r4 (c12a) · ข้อสอบ C3.6+C3.7 (c23)
- **17:15 UTC** เจ้าของปลุก (ตัวปลุก sleep ไม่ทำงาน) → resume 3 เลนจากไฟล์ (C3.5 r4 · C2.7-fix r3 · C3.3 r4) + ผู้เขียนข้อสอบ C3.6+C3.7 (c23/QC3) · heartbeat cron ทุก 23 นาที · หน้าต่างโควตาใหม่เริ่ม 17:12 (reset ≈ 22:12 UTC)
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
2e. 🔴 **มติเจ้าของ 26 ก.ย. 22:15 UTC "ทำตามแนะนำ" (ประหยัดโควตาโดยไม่ลดคุณภาพ)**: (1) จัดจังหวะ — งานหนักต้นหน้าต่าง · ปลายหน้าต่างเฉพาะงานเล็ก/ผู้ตรวจ · งานเครื่อง (ยูนิต/build/ภาพ/รวม) ระหว่างรอ reset (2) resume agent เดิมแทน spawn ใหม่ · prompt ชี้ไฟล์/บรรทัดตรง ๆ ลดการอ่านกว้าง (3) **ผู้เขียนข้อสอบใบเบา (C4.x · C3.6–3.9 ระดับเบา) ใช้ Sonnet** · builder/ผู้ตรวจ/นักล่า/ใบเงิน-ความปลอดภัย = Opus เสมอ (4) ไม่ตัดรอบผู้ตรวจ · เฝ้า weekly limit: ใกล้ 90% ⇒ เหลือเฉพาะรวม/ตรวจ แจ้งเจ้าของ
2d. 🔴 **ตัวปลุกตัวเอง: `bash sleep` ในพื้นหลังไม่ปลุก session** (26 ก.ย. รอ 14:31 แล้วไม่ตื่นจน 17:12 เจ้าของต้องมาสั่งเอง) — ใช้ **CronCreate** ของ harness แทน (job `*/23 * * * *` "CRM heartbeat" · session-only · หมดอายุ 7 วัน · ยิงเฉพาะตอน idle) · session ใหม่ต้องสร้างใหม่ทันทีที่เริ่ม
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
