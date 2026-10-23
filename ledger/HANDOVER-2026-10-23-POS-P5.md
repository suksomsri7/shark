# HANDOVER — POS ใหม่ กลางเฟส P4/P5 (ผู้คุม B → บัญชี A · เจ้าของสั่ง 23 ต.ค. ≈12:0xZ "โควตา 94% ทำงานจนเสร็จ ไม่เปิดเลนเพิ่ม แล้วส่งไม้ A")

วันที่: 23 ต.ค. 2569 (UTC · `date -u`) · worktree ผู้คุม `/root/projects/shark-pos` · branch `session/pos` · ช่อง ⟨B⟩ = เติมเมื่อเลนที่วิ่งอยู่จบ (ถ้ายังเป็น ⟨B⟩ ตอน A รับไม้ ให้ A อ่านผลจาก path ที่ระบุแล้วเติมเอง)

## §0 สถานะ
1. **ตัวนับ** = **50/55 (91%)** นับแถวแผน (มติ P3.12 §10.9) · แถวที่ยังไม่ปิด: P4.2 (walker phase A กำลังวิ่ง) · P4.3 (fix จาก walker) · P5.2 (เหลือ batch D+E+device รอบ O4b → R1-2 → merge) · P5.3 perf · P6.1 rehearsal/PR · P6.2 docs — (P5.1/P5.2 นับเป็นแถวเดียวกันกับ "P5" ตามแผน ดู `POS-MASTER-PLAN.md`)
2. **tip product** = `0fc0151b` (= P5.1 batch C merge `6b1f84a5` → CD-RP23 `bc535ab0` → CD-RP23b) · ledger บนนั้นถึง ⟨B tip⟩ · ด่านทรี c ล่าสุด `tc-p51c-20261023T131221Z` @0fc0151b: strict tsc 0 · p2.14 60/60 · p1.6 48/48 · **p5.1 28/28** · p5.2 48/53 (แดง 5 = batch D+E+device)
3. **merge ในช่วง B (21–23 ต.ค.)**: P3.12 ปิดเฟส `15ee7536` · freeze CD-RP19 `f38494fb` (gates128 **136/136 เขียว**) · P4.1 `574b0758`/`8704b886` · P5.1 oracle + fix A+C+D `5926434f` (CD-RP20a/b) · **P5.2 fix A+B+C+F + R1 follow-up `c4584062`** (CD-RP21 `8c7412fa` · RP21b `5edbfc39`) · **P5.1 batch B `e9b765b4`** (CD-RP22/22b) · **P5.1 batch C `6b1f84a5`** (CD-RP23/23b · P5.1 ปิดแถว) — ทุกใบ R1 + (hunter ถ้าเป็นเงิน/authz) + ด่านทรี c ก่อน push
4. **ทรี**: ผู้คุม `shark-pos` session/pos · b = `wip/pos-p4.2-walker` 89631a81 (walker · ไม่มีเลน) · c = ด่าน (detached) · d = ภาพ/walker (checkout 89631a81 · build qcRVYZ · serve 3228 ขณะ walker วิ่ง) · e = `wip/pos-p3-skel-oracle` (ว่าง) · f = `wip/pos-p5.2-fix-de-dev` a786a9df (รอ R1) · p11 = `wip/pos-p5.1-fix-c` (builder รอบ O10)
5. **QC4** ep-frosty-lab (ข้อสอบ+ด่าน · คีย์ใน `.env.qc4`) · **QC5** ep-fragrant-thunder (ภาพ+walker · `qc5.sh`) · QC7 ลบแล้ว · ล็อก: POS `/tmp/shark-gate-pos.lock` · typecheck `/tmp/pos-gate.lock` · ⛔ `export CI`
6. **เครื่อง**: 16G/swap 12G · เลน ≤3G ผ่าน iso.sh · typecheck heap 8192/ISO 10500M ใต้ flock · build ทรี d heap 10240/ISO 13500M รอ RAM ≥9G · เพดาน **3 เลนรวมทุกชนิด** (gates/typecheck นับเป็นเลน)
7. **คำสั่งเจ้าของที่ยังมีผล**: ⛔ push main · คุณภาพ>ความเร็ว · builder ไม่ build/serve · ห้าม `.env*`/พิมพ์คีย์ · ห้าม reseed QC4/QC5 · ห้ามแก้ข้อสอบนอกมติ ORACLE-EDIT · oracle ใหม่หมุด env-override · ทุกใบแตะ `*actions*.ts` รัน p1.6 · `date -u` · ทำต่อถึง 100% ไม่รอเช็กพอยต์ · คำถามเจ้าของจด OP §รอคำตอบ ใช้ค่าเริ่มต้น · สรุปใหญ่ครั้งเดียวตอน 100% · HR พักทั้งหมด (22 ต.ค.) · **23 ต.ค. ≈12:0xZ: โควตา B 94% → ไม่เปิดเลนใหม่ → ส่งไม้ A**

## §1 เลนที่ยังวิ่ง/ค้าง ณ ส่งไม้
| เลน | ที่ | สถานะ | ผล/ที่ต้องทำต่อ |
|---|---|---|---|
| walker P4.2 phase A | ✅ จบ 14:39Z · `/root/pos-runs/walker-A-20261023T084816Z` (+ `summaries/` สำเนา JSON 5 cells) | owner 574/1161 dead 19 wE 23 · manager 560/1161 dead 4 wE 50 **hiddenLeak 1** (`products#pos-prod-price-*`) · cashier 743/1161 dead 3 wE 28 · public desktop/mobile 0 ปัญหา · **qc-pos-p4.2 8/12** (W1 W4 W5 W6 แดง) | **P4.3 triage** = บรีฟ `pos-briefs/pos-prompt-accountB-P4.3-TRIAGE.md` (อ่าน JSON ใน summaries/ ได้เลย ไม่ต้องใช้ทรี d) → fix round (registry/harness/product) → รัน cell ที่แตะซ้ำ (chain `ctl-scripts-2026-10-23/chain-p42-walker-A2.sh` เป็นแม่แบบ · ต้อง build ทรี d ที่ tip ใหม่ก่อน: `chain-p42-walker-A.sh <head>`) → qc-pos-p4.2 เขียว = ปิด P4.2+P4.3 |
| P5.2 batch D+E+device | ทรี f (รอบ O4 fcf5eecf · รอบ O4b ⟨B⟩) | R1 รอบ 1 = MAF (F1 sale path เชื่อ client deviceId · F2 matrix · F3–F8) → O4 ทำแล้ว → **O4b** (device scope ครบทุก action + CR4 p3.6 ORACLE-EDIT) ⟨B⟩ → R1 รอบ 2 ⟨B⟩ | ผ่าน ⇒ merge → re-pin ชุดเดิม (p2.7 add base rev · p2.8 · p2.11 · p3.9:LANE_PIN · hf-fu · hf-fu2 · p2.12 · p3-skel:LANE_PIN · regen matrix · p2.10 ท้าย) → ด่านทรี c (`ctl/tc-p52-5edbfc39.sh` เป็นแม่แบบ) → push → tg · แล้ว **P5.2 ครบ** (F4/F11 = W37/W38) |
| ~~builder P5.1 batch C~~ | p11 `wip/pos-p5.1-fix-c` 4e9d2d33 | ✅ merged `6b1f84a5` (R1 ×2 · CD-P51-O10/O10b) | P5.1 ครบ · ทรี p11 ว่าง |

## §2 มติผู้คุมช่วง 23 ต.ค. (อ้างในโค้ด/ข้อสอบ)
CD-P52-O3-1…5 (R1 fix A+B+C+F: hand-tools เป็น POS-scoped · deciderMayAct ตอนเคลมส่วนลด + X4b · F3 คงไว้ · HF-12.1 คาดไม่มี sales สำหรับคีย์กลาง · revert F5) · CD-P51-O6/O6b (MA2 แทนมติ 7 CD7: มัดจำโมดูล = POS_DEPOSIT · ORACLE-EDIT p2.9b L3/A6 · booking-deposit · hotel/rental-public · หมุด `P29B_L3_PIN`) · CD-P51-O7 (F1 re-take · F2 คืนส่วนเหลือ · deviation CN เต็ม) · CD-P51-O8/O9 (ริบมัดจำ NO_SHOW อัตโนมัติ · ยกเลิกคง OPEN · ใบรับโมดูล TRANSFER) · CD-P51-O10 (R1 batch C: F1 memberAttachOnly · F2 bridges ข้ามบิลริบ · F3 duplicate เฉพาะ PAID/REFUNDED · F4 ออกจาก NO_SHOW ⇒ void บิลริบ · F5–F8) · CD-RP21/21b/22/22b (re-pin) · CD-P42 walker A2: ซาก GRAB cred ของ parity บน QC5 → DRAFT (id `cmvjciyz3000e8skzib4k5ccn`)

## §3 ของเจ้าของ (OP §รอคำตอบ) ที่เพิ่มช่วงนี้
W36 P3.9U · W37 inventory writes นโยบาย catalog POS · W38 commission write หลัง read key · **W39** นโยบายริบมัดจำ (ค่าเริ่มต้น NO_SHOW ริบ · ยกเลิกคง OPEN) · **W40 🔴 ตั้ง `POS_DEVICE_KEY` ก่อน deploy** (จับคู่เบราว์เซอร์ทุกเครื่องขายหลัง deploy) · **W41** วิธีจ่ายมัดจำโมดูล (TRANSFER ปริยาย) · แจ้งเจ้าของโมดูล: Member+Approval (F3/F4) · booking/hotel/rental/ticket/shop/clinic/subscription/restaurant (batch B/C) · AI (F5 revert) · Restaurant (15 writers) · settings/staff (device key)

## §4 หนี้/ของค้างที่ A ต้องรู้
F-P3-69 · F-P3-06 · MA10 snapshot ledger id · shop `refundOrder` restock แข่ง confirm (builder B จด) · sale path ยังรับ deviceId จาก client (builder D+E+dev จด · รอ R1 ตัดสิน) · ไม่มี rotation ของ POS_DEVICE_KEY · hunter M-B / เลนส์ L4–L5 ยังไม่รัน · P5.3 perf ต้องทรี d (หลัง walker) · qc-pos-p3.6 outbox P2002 บน refund 1/8 รอบ (ก่อนหน้าก็มี) · walker ใช้เวลา ≈1.8–2 ชม./cell (19 cells ≈ 35 ชม. — A ควรรัน phase B เฉพาะ cells ที่ triage บอกว่าคุ้ม)

## §5 วิธีทำต่อ (A)
1. เปิดที่ `/root/projects/shark-pos` (บัญชี A: config ปกติ) → อ่านบล็อก ▶️ HANDOVER ท้าย `ledger/POS-RESUME.md` + ไฟล์นี้ → `git fetch origin session/pos` ทุกทรี · ตรวจ bind mount node_modules ถ้าเครื่องรีบูต
2. ปิดเลนค้างตาม §1 (R1 D+E+dev → merge · batch C → R1 → merge · walker → P4.3 triage → fix round บนทรี b/f) · เพดาน 3 เลน
3. ลำดับถัดไป: P4.3 (fix จาก triage + registry/harness fixes · รัน cell ที่แตะซ้ำ) → P5.3 perf (brief ใน MASTER-PLAN · ต้อง build ทรี d) → P6.1 rehearsal + PR (⛔ ห้าม push main · PR เท่านั้น · deploy = เจ้าของ W32 + W40) → P6.2 docs/HANDOVER 100% + สรุปใหญ่ครั้งเดียว
4. เครื่องมือ: `scripts/pos-repin-lane.sh` · `pos-oracle-check.sh` · `pos-pre-submit.sh` · `pos-gates-all.sh` (manifest 129 ชุด) · `pos-authz-matrix-gen.mts --write/--check` · chain scripts ใน scratchpad B `/tmp/claude-0/-root/9878a238-0754-5958-805a-a0391fccc617/scratchpad/ctl/` (คัดลอกไว้ `/root/pos-runs/ctl-scripts-2026-10-23/` ⟨B⟩)
5. tg: `/usr/local/bin/tg "📊 POS · NN% (x/y) · …"` หลังทุก merge
