## ▶️ 31 ต.ค. ~16:3xZ — **42/53 (79%)** · session/svc 698cd1e4 (B.13 merge · รอด่าน U)
- ✅ ช่วงนี้: D.19 · D.12 · B.16 (ด่าน R/S/T บนฐานหลัก) · B.13 ผ่านผู้ตรวจ B (7 รอบแก้ Q1–Q19 · /root/svc-runs/fix/b13.md) → merge 698cd1e4 + migration svc_b13 ลงฐานหลัก/l1/l3 + generate ทรีหลัก/l3 · ด่าน U `/root/svc-runs/gate-u.sh` → gate-u.txt (เขียว ⇒ ✅ B.13 = 43/53)
- 🟡 **G1 (B.12)** qc:all จบ 306/478 · คัดแดงแล้ว `/root/svc-runs/g1-classify.md` (บั๊กจริง 2: webhook settings.changed ซ้ำ · เมนูข้างไม่มีหน้าจองใหม่) · รอบแก้ `/root/svc-runs/fix/g1.md` builder ในเลน l2 · หลังจบ: ผู้คุมรันซ้ำบนฐานหลัก + ไล่กดบทบาท/ภาพ + ชุด UAT
- เลน: l1 B.17 phase 2 (แก้ชน merge 698cd1e4 · migration svc_b17 · l1 มี nm แยกแล้ว /root/projects/shark-svc-nm-l1) · l2 G1 รอบแก้ · l3 ผู้เขียนข้อสอบ B.15 · l4 ผู้เขียนข้อสอบ B.14 (ฐาน l3 ร่วม) · ⚠️ l2 ยังไม่มี migration svc_b13 (merge session + migrate + generate หลัง G1 builder จบ)
- หนี้ใหม่: b.3 S-9 ขึ้นกับเวลาของวัน (หลัง ~22:45 ไทย) · ปุ่ม "มาถึง" = ตอนกด (คำถามเจ้าของ) · A9 walk-in ข้ามเที่ยงคืน · env qc:all ขาด SESSION_SECRET · acc-v2 seed เน่าตามเวลา (โมดูลอื่น)

## ▶️ 31 ต.ค. ~08Z — **39/53 (74%)** · session/svc 9501cba6 (D.19 merge · รอด่าน R)
- ✅ วันนี้: D.4 D.18 D.17 D.10 D.16 D.14 C.3 · D.19 ACCEPT รอด่าน R (`/root/svc-runs/gate-r.sh` เริ่มเองหลัง G1)
- 🟡 **G1 (B.12)** qc:all 478 ชุด รันอยู่: unit `svc-g1-qcall` · worktree ตรึง `/root/projects/shark-svc-g1` (79e806f8) · log `/root/svc-runs/g1-qcall.log` · หลังจบ: คัดแดงทีละชุด (สภาพแวดล้อม ⇒ หนี้ · บั๊ก ⇒ แก้) + ไล่กดบทบาท (build QC + ภาพ)
- เลน: l1 D.12 รอบแก้ 5 (Y33–Y34 · /root/svc-runs/fix/d12.md) · l3 B.13 ข้อสอบ · l4 B.16 ข้อสอบ (ใช้ฐานเลน l3 ร่วม)
- ฐาน QC ต่อเลน: ดู memory reference_shark_svc_lane_qc_branches · หนี้ §3.2 · คำถามเจ้าของ SVC-OWNER-QUESTIONS (D.14 ค่าเริ่ม AI · บั๊กบัญชี V2 outstandingByContacts)

## ▶️ รับไม้ 30 ต.ค. ~11:4xZ (บัญชี B · ผู้คุมใหม่) — **33/53** (D.9 ✅ · D.4 ✅ 05014f81)
- 📍 30 ต.ค. ~23Z: agent ตายทั้งหมด ~16Z (OAuth หมดอายุ) · งาน builder D.12/D.10 commit เป็น WIP บน wip/svc-l1 (84eab08b) / wip/svc-l2 (80394c52) · ORACLE-EDIT ผู้คุมอนุมัติแล้ว (d.8 Q-2/S-7 · d.5 S-8 · d.11 S-7 · r0.6 P-1/U-2 · probe-d9-b IA-1 · d.12 M-8/G-7 · d.10 S-1) · กำลังรีวิวเข้ม A+B ทั้ง 2 ใบ · ผู้คุมรัน d.12 เต็ม /root/svc-runs/ctl-d12.txt · l3 ว่าง · ถัดไป B.12
- บัญชี A หมด weekly 11:29–11:34Z ⇒ builder D.10/D.4/D.12 ตาย · gate-k + D.4 probe/full ที่ค้างปล่อยรันจนจบ
- เปิด builder ใหม่ "ทำต่อจากทรี": l1 D.12 (เริ่มจาก 95/121 · log /tmp/svc-d12-build-2.log) · l2 D.10 (โค้ดราวครึ่ง) · l3 D.4 รอผล /tmp/svc-d4-probe-2.log + /tmp/svc-d4-build-full2.log แล้วผู้คุมรับ/ส่งผู้ตรวจยืนยันซ้ำ

## ⏸ HANDOVER 30 ต.ค. ~11:0xZ (weekly 98% · เจ้าของสั่งเตรียมย้ายบัญชี)
**31/53 (58%)** · `session/svc` push แล้ว (tip = D.9 merge 950565b6 + ledger) · ✅ ล่าสุด: D.11 · B.10 · B.8 (รายละเอียด SVC-RUN §3/§4)
- **ด่านค้าง:** gate-k (D.9 merged 950565b6) `/root/svc-runs/gate-k.sh` → ผล `/root/svc-runs/gate-k.txt` · ที่เห็นแล้ว: d.9 86/89 0 failed · probe-d9-b 28/0 · ถ้าค้างกลาง/ไม่มี DONE ⇒ รันใหม่ `setsid nohup bash /root/svc-runs/gate-k.sh > /root/svc-runs/gate-k.txt 2>&1 < /dev/null & disown` · เขียวทั้งหมด ⇒ mark D.9 ✅ (32/53) commit ledger + push + tg
- **เลน (งานอยู่บนดิสก์ ยังไม่ commit · agent เก่าตายตอนย้ายบัญชี ⇒ เปิด builder ใหม่ให้ "ทำต่อจากสถานะทรี" + อ่านใบสั่ง/รายการแก้):**
  - **l1 D.12** ย้ายออก/คืนประกัน · oracle be3f2a37 (121 ข้อ · มติ R1–R7 ท้ายใบสั่ง) · builder เริ่มแล้ว (merge 950565b6 เข้า l1 ก่อน) → ต่อ: builder → 2 ผู้ตรวจ → fix → commit → merge → gate
  - **l2 D.10** ตรวจสลิป/รับเงินหอ · oracle 67cab545 (79 ข้อ · มติ R1–R11) · builder เริ่มแล้ว → เหมือนกัน
  - **l3 D.4** นำเข้า Excel · builder แก้ X1–X20 ตาม `/root/svc-runs/fix/d4.md` (2 ผู้ตรวจเสร็จแล้ว · probe `scripts/probe-d4-b.mts` ต้อง 0 BREACH · log ใหม่ `/tmp/svc-d4-probe-2.log`) · l3 มี node_modules แยก `/root/projects/shark-svc-nm-l3` (มี DormImportBatch · migration svc_d4 ลง QC DB แล้ว) ⚠️ ทรีหลัก/l1 ใช้ client ของทรีหลัก — **หลัง merge D.4 ต้อง `pnpm exec prisma generate` ในทรีหลัก**
- **ถัดไป:** B.12 ปิด B1 (ผู้คุมรันด่านเต็ม · B.5–B.11 ครบแล้ว) · D.15 ปิด D1 หลัง D.3 D.4 D.10 D.11 D.12 D.13 · B.13 หลัง B.12
- **ค้างผู้คุม:** (1) pos.sale.paid P2002 `accountJournalEntry.create` (gl.ts) ที่ probe B.8 เห็นตอนระบายคิว — ตรวจตอน B.12 (2) d.6 S-5 (กล่องเงิน D.8 ในจอมิเตอร์) + G-2 r0.2 (ข้อมูล seed บาร์เบอร์) แดงบนฐาน — ORACLE-EDIT ตอน B.12/D.15 (3) d.13 S-8 ใช้ git status ⇒ แดงเมื่อใบหลังแตะ prisma/meter.ts ระหว่างทำ (เสนอเทียบ base commit) (4) ฉาก b.7 กับ b.10 วันเดียวกัน ⇒ ด่านต้อง `svc-qc-done-pos-scene --clear` ก่อน b.7 (5) ภาพเทียบแบบ (QC_BASE) ยังไม่ได้ถ่ายรวม (6) ส่งชุดคำถามกฎหมาย `ledger/wo-notes/svc-legal-questions.md` ให้เจ้าของ (7) ลบ Neon branch wo-svc-qc ตอนจบ RUN
- **บทเรียนใหม่วันนี้:** ฉากบน svcqc ห้ามตั้งค่าระดับร้าน/หน่วยที่ชุดอื่นพึ่ง (D.9 ตั้ง payments.receiver ⇒ r0.6 แดง) · เลนที่แตะ schema ต้องมี node_modules แยกก่อน generate (D.4 ทำ client ร่วมพัง 5 นาที) · ORACLE-EDIT ต้องคงความเข้ม + ติดป้ายผู้คุม
- **วิธีทำงาน/สคริปต์ด่าน:** `/root/svc-runs/gate-*.sh` (แบบ run() ลอง 4 ครั้ง) · รายการแก้ `/root/svc-runs/fix/*.md` · กติกาเดิมทั้งหมดใน SVC-RUN §1–2 · ตอบเจ้าของเป็นภาษาไทย · tg สั้น % เท่านั้น

## ⏸ CHECKPOINT 29 ต.ค. (โควตา 92% · รีเซ็ต ~45 นาที)
- 19/53 · B.11 (64e6c184) + D.5 (b79f2ef5) merged รอ gate รวม /root/svc-runs/gate-d5.txt เขียว ⇒ mark ✅ 21/53 + push + tg
- l1 B.5 builder (oracle 75eafc1a) กำลังรัน · l2 D.8 builder เริ่มแล้ว (oracle 6965f136 · มติ perf/paylink รอยืนยัน) · l3 D.13 oracle committing (98 ข้อ · builder เริ่มหลังรีเซ็ต · G-1 r0.9 + G-4 d.5 M-11 แดงตั้งแต่ฐาน ต้องรันเดี่ยวหลัง reseed ก่อนรับ)
- agent หยุดเพราะโควตา ⇒ SendMessage ปลุก (งานอยู่บนดิสก์ใน worktree)

# SVC RUN — จุดต่องานของผู้คุม (อ่านไฟล์นี้ก่อนเมื่อเปิด session ใหม่)

> อัปเดตล่าสุด: **27 ต.ค. 2569** · ผู้วางแผน RUN · branch ปัจจุบันของเอกสาร `session/svc-design` (worktree `/root/projects/shark-svc`)
> ลำดับอ่าน: ไฟล์นี้ → `ledger/SVC-RUN.md` §1 (กติกาเหล็ก) + §3 (สถานะ) + ท้าย §4 → `ledger/SVC-CORE-CONTRACT.md` → แถวใบที่จะทำใน `ledger/SVC-MASTER-PLAN.md` §4 → แบบ `ledger/DESIGN-BOOKING-QUEUE.md` / `ledger/DESIGN-DORM-HOTEL.md` (§ ที่ใบอ้าง)

## ▶️ RUNNING 7 พ.ย. 2569 ~14:5xZ — RUN HOTEL **4/11 (36%)** · H.1 ✅ · H.3 ✅ · H.2 ✅ 0ef525fb8 · builder H.5 (l2 รอบ 2) · H.4 (l3) ถัดไป
- สถานะสด = `ledger/SVC-HOTEL-RUN.md` §2–§3 · คำถามเจ้าของ = `SVC-OWNER-QUESTIONS.md` บล็อก HOTEL 7 พ.ย.
- เลน (7 พ.ย. ~13:2xZ): **l1** ว่าง · **l2** `wip/svc-h5` (ฐาน 6715ea241) builder H.5 (Opus · พรอมป์ `/root/svc-runs/h5/builder-prompt.md` · progress `/root/svc-runs/h5/builder-progress.md`) · **l3** `wip/svc-h2` builder H.2 รอบ 3 (MAJOR 1–2 ผู้ตรวจ · progress `/root/svc-runs/h2/builder-progress.md`) + chain รอบ 1 `svc-h2-accept` (log `/root/svc-runs/h2/accept.txt` · ผลใช้คัดปัญหา · ต้องรัน chain รอบ 2 บน tip รอบ 3) + unit `svc-h2-dorm-rebuild` (d.13 ข้ามเดือน) · ขั้น H.2 ต่อ: builder รอบ 3 commit → ผู้คุม ORACLE-EDIT h.2 (เพิ่ม MV สถานะห้อง CHECKED_IN · preview ข้ามประเภท · X block พร้อมกัน · PC-3 anylane) → chain รอบ 2 (accept.sh) → PARITY ภาพ 08 → merge → tg 36% · H.5 ต่อ: builder → ผู้ตรวจเงิน Fable 2 รอบ → chain (ทำ /root/svc-runs/h5/accept.sh จาก h2/accept.sh · host ep-weathered-mode · port 3245 · ภาพ h.5 ต้อง env SVC_VIS_H5_RES_ID) → PARITY ภาพ 09 ขวา → merge → tg 45%
- ข้อสอบพร้อมใน session/svc: h.2 (84) · h.3 (109+probe) · h.5 (92) · h.4 (106) · h.6 (95) · ฟิกซ์เจอร์ H.2–H.6 ครบ · **มติประหยัด**: ไม่เปิดผู้เขียนข้อสอบล่วงหน้า (h.7/h.8/h.10 เขียนเมื่อถึงคิว) · builder ทีละใบเมื่อ chain ใบก่อนจบ
- ฐาน QC: backfill svc_h ครบ 4 ฐาน (ฐานหลัก 94 · l3 96 · l1 0 · l2 94) · build/serve บนเลนต้องใช้ inner script (`/root/svc-runs/h{1,3}/{build,serve}-inner.sh` · KICKOFF §3.1)
- เครื่อง: 4 vCPU/15 GB (ไม่ KVM8) · steal เหลือ 2–16% หลังเจ้าของแก้ Hostinger · metabot หยุดไว้ (ต้อง start ก่อนใช้) · RAM ว่าง ~11G
- ถ้า session หลุด: อ่าน `SVC-HOTEL-KICKOFF-PROMPT.md` §0–§4 (§2 ข้าม — H.1 ปิดแล้ว) · ดู log ข้างบน · ห้ามเปิดเลนที่ 4

## ⏸ 7 พ.ย. 2569 ~21:2xZ — จุดส่งไม้ก่อนอัปเกรด VPS → KVM8 · **พรอมป์เริ่ม session ใหม่ = `ledger/SVC-HOTEL-KICKOFF-PROMPT.md`** (เจ้าของสั่ง "บันทึกทั้งหมดเตรียมส่งไม้ต่อ")
**สถานะ:** SVC 51/52 (C.2 รอ OA LINE+มือถือ) · **HOTEL 1/11 (H.0 ✅) · H.1 โค้ดเสร็จ+ผู้ตรวจผ่าน รอขั้นรับงานท้าย** · ทุกอย่าง push แล้ว ทรีทุกเลนสะอาด (dirty 0)
- `session/svc` @299f341d8 (H.0 merge · ข้อสอบ h.0/h.1 · ORACLE-EDIT ชุด unitTypes · ใบสั่ง H.0–H.3 + H.2 · แผน/สถานะ)
- `wip/svc-h1` @62c568cbf (H.1 รอบผู้ตรวจ · **ยังไม่ merge**) · ⚠️ 21:59Z **tsc ทรีรวมแดง 19 จุดใน `rates.ts` (ชนิดพารามิเตอร์ db แคบกว่า tenantDb · ไม่ใช่พฤติกรรม)** — builder แก้แล้ว **`0941d0911`** (LockTx/AuditTx ชนิดแคบจาก TenantDb · ไม่มี any) · chain รับงานรันใหม่ 22:09Z บน l1 @0941d0911 (รอ RAM ≥10G สำหรับ tsc) · หลังรีบูต: ถ้า `/root/svc-runs/h1/accept.txt` ไม่มี DONE ⇒ รัน chain ใหม่ (l1 อยู่บน wip/svc-h1 @0941d0911 แล้ว) — ผู้คุมรันข้อสอบ h.1 เต็มเองแล้ว **120/122 · 0 failed** (F-1/V-1 SKIP) · ผู้ตรวจ 2 รอบ + รอบยืนยัน **ผ่าน** · ค้าง: **tsc ทรีรวม · build QC · ภาพ h.1 owner/frontdesk · PARITY ภาพ 15** (chain `/root/svc-runs/h1/accept.sh` กำลังรันตอนส่งไม้ · ถ้า VPS รีบูตก่อนจบ = รันใหม่ได้ทั้งก้อน ไม่มีอะไรเสีย)
- `wip/svc-h0` @5b1d69ea6 (merge แล้ว)

**▶️ ขั้นต่อหลังรีบูต (ตามลำดับ)**
1. ตรวจเครื่อง: `swapon --show` (fstab มี /swapfile–/swapfile5 ควรขึ้นเอง) · `free -g` · ถ้า KVM8 RAM มากขึ้น ค่า ISO_MEM/heap เดิมใช้ได้ ปรับเพิ่มได้ทีหลัง
2. ตรวจทรี/เลน: `git -C /root/projects/shark-svc status -sb` (session/svc) · l1 `wip/svc-h1` · l2 `wip/svc-h0` · l3 detached · node_modules ของ l1/l2/l3 เป็น store จริง (`shark-svc-nm-l1-store` `-l2-store` `shark-svc-nm-l3`) ไม่ใช่ bind mount — ไม่หายหลังรีบูต · **ทรีหลัก+l4 ยังใช้ Prisma client ร่วมทรีเลขา** (ห้าม generate/tsc/build ที่นั่นจน RUN เลขาจบ · commit เอกสาร `--no-verify`) · ตรวจ `grep -c 'model AiRoom ' node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/schema.prisma` ในทรี l1/l2/l3 ต้องเป็น 0
3. ฐาน QC: migration svc_h ลงครบ 4 ฐาน (l1 l2 l3 ep-mute-scene) · backfill รันแล้วเฉพาะ l2 (ฐานอื่นรัน `scripts/svc-h0-backfill.mts --dry` แล้วจริง ก่อน H.3) · ฉากหอบน l1 rebuild แล้ว 7 พ.ย.
4. **ปิด H.1**: ถ้า `/root/svc-runs/h1/accept.txt` ยังไม่มี `######## DONE` ⇒ รัน `systemd-run --unit=svc-h1-accept … /root/svc-runs/h1/accept.sh` ใหม่ (สคริปต์ทำครบ: exam → tsc → build → serve 3242 → ภาพ) → ดูภาพ `.qc-shots/svc/h1/pairs/{owner,frontdesk}` เทียบ `ledger/design-dorm/15-hotel-rates.png` + จอตั้งค่าเทียบโครงหอ 17 → PARITY ผ่าน ⇒ merge `wip/svc-h1` เข้า session/svc (`--no-verify` ในทรีหลัก) → SVC-HOTEL-RUN H.1 ✅ 2/11 → `tg "📊 HOTEL · 18% (2/11)"` · PARITY ตก ⇒ ตีกลับ builder ใหม่บน l1 (ใบสั่ง h.1 §5)
5. **เปิด H.3 + H.2 ขนาน**: ผู้คุมใส่ฟิกซ์เจอร์บล็อก "SVC H.3" (`SQC_HOTEL_BOOKING_SCENE` · ภาพ h.3 · สิทธิ์ frontdesk) + "SVC H.2" (ภาพ h.2) ใน `scripts/svc-qc-data.mts` → ผู้เขียนข้อสอบ (Fable) h.3 บน l2 · h.2 บน l3 (พรอมป์แบบเดียวกับ h.0/h.1 ในบันทึก 7 พ.ย.) → builder H.3 (ก่อน) → H.2 → H.5 → H.4 → H.6 → H.7 → H.8 → H.10 → H.9
6. ตัวเฝ้า: ทุกงานยาวต้องมีตัวเฝ้า (Bash until DONE + send_later สำรอง) · เครื่องใช้ร่วมกับ RUN เลขา (S3a.6) จน RUN เลขาจบ ⇒ build/tsc รอ RAM ≥10G
7. เซิร์ฟเวอร์ QC เก่า `svc-g1-serve` (3241 · build เก่า) ไม่ต้องเปิดคืน · `svc-h1-serve` (3242) เปิดเมื่อ chain H.1 รันถึง

**ของที่รอเจ้าของ:** C.2 (LINE OA ทดสอบ + iPhone/Android) · เลขา: push main S3a.2 / TestFlight S3a.3 (ไม่ใช่ของ RUN นี้) · H2 ชื่อ channel manager (ยังไม่ต้อง)
**หนี้/บันทึกสำคัญ:** SVC-HOTEL-RUN §2.1 · memory `reference_shark_svc_sec_shared_prisma_client` · ORACLE-EDIT ทั้งหมดมีป้ายในไฟล์ข้อสอบ (grep "ผู้คุม 7 พ.ย.")


## 🟢 2 พ.ย. 2569 ~10Z — 98% (51/52) · เหลือ C.2 เท่านั้น
- ปิดแล้ว: B.18 + D.20 + G3 (125728d6 บน session/svc) · รายละเอียด SVC-RUN §4 บรรทัดท้าย
- C.1 ⏸ เลื่อนตามเจ้าของ (ตรวจสลิปเอง) · เฟส H โรงแรม V2 ยังไม่เริ่ม (เจ้าของสั่ง 1 พ.ย.)
- **C.2 รอเจ้าของ**: LINE OA ทดสอบที่ต่อแชต SHARK + iPhone 1 + Android 1 มี LINE · ผู้คุมเขียนคู่มือร้านตอนเริ่ม
- เลน: ไม่มี builder ทำงาน · server QC `svc-g1-serve` ยังเปิดที่ 3241 (หยุดได้) · ล้าง Neon branch เลน l1–l3 ตอนจบ RUN
- ▶️ **7 พ.ย. RUN HOTEL 1/11 (H.0 ✅ 17Z)** — เจ้าของสั่ง "เริ่มได้ ทำขนานกับระบบเลขา" · สถานะสด = `ledger/SVC-HOTEL-RUN.md` · แผน = `SVC-HOTEL-PLAN.md` ร่าง 2 · ใบสั่ง h.0/h.1 · เลน hA=l2 hB=l1 hC=l3 (ห้ามใช้ทรีหลัก/l4 รันของหนัก) · tg `📊 HOTEL · NN% (x/11)`
- ⚠️ 4 พ.ย. Prisma client ใน node_modules ของทรีนี้ถูกทรีเลขา AI generate ทับ (inode ร่วม) ⇒ fitness แดงปลอม (AiRoom…) · commit เอกสารใช้ `--no-verify` · ก่อนเริ่ม H.0 แยก node_modules store ของ svc เอง (ดู memory reference_shark_svc_sec_shared_prisma_client)
- ⚠️ session/svc ถูก force-with-lease 2 พ.ย. (reword หัว commit 4e51c758→c49caa71 · ต้นไม้เท่าเดิม) — ทรีอื่นที่อยู่บน SHA เก่าให้ checkout ใหม่


---

## ▶️ RUNNING ต่อ 28 ต.ค. ~14:4xZ (เจ้าของสั่ง "Run งานยาวตามแผน") — เลน: l3 builder R0.6 · l1 ข้อสอบ R0.7 · l2 ข้อสอบ B.0

## (จบแล้ว) ⏸ PAUSE — 28 ต.ค. 2569 ~00:3xZ (เจ้าของสั่ง "จบงานพักก่อน · เตรียมย้ายบัญชี")

**สถานะ: 7/53 (13%)** · `session/svc` @ (ดู git log — commit นี้) push แล้ว · ไม่มี agent/unit รันอยู่ · gate lock /tmp/shark-gate-svc.lock ว่าง
- ✅ รับแล้ว: R0.1 · R0.2 · R0.3 · R0.5 · R0.8 · B.2 · D.1 (รายละเอียด/มติ = SVC-RUN §3 + §4 ท้ายไฟล์)
- 🔸 ค้างกลางทาง (หยุดก่อนมีไฟล์งาน — ไม่มี WIP ค้างในทรี):
  - **R0.6** ตรวจสลิปกลาง: ข้อสอบ 66 ข้อ + ใบสั่ง commit แล้ว `5608461a` บน `wip/svc-l3` (push แล้ว · rebase บน session/svc แล้ว) → ขั้นถัดไป = ปล่อย builder (ใบสั่งมีมติ 12 ข้อ + มติผู้คุม: autoApprove เริ่ม false · ใช้ TenantIntegration.onFailure แทน payments.slip.onVerifierDown · PII retention = หนี้ J5)
  - **R0.7** LINE: ยังไม่มีข้อสอบ → เริ่มขั้น 2–3 ใหม่ (เลน l1)
  - **B.0** migration จองคิว: ยังไม่มีข้อสอบ → เริ่มขั้น 2–3 ใหม่ (เลน l2) · ห้ามรันขนานกับ D.0 (schema)
- 🖼️ ค้าง: ภาพเทียบแบบ R0.2 (V-6) + R0.5 (P-4) — build QC รวมครั้งเดียว (ทรี d heap/ISO_MEM ตาม memory reference_shark_pos_build_tsc_heap_7g) พร้อมใบ UI ถัดไป (R0.4)
- 📌 หนี้/carry: `ledger/wo-notes/svc-r0.8-carry.md` (R0.9 งานเก็บกวาด occupancy · setRoomTypeRent affected · D.0 ดัชนี · backfill --apply ทุกร้านก่อนเปิด DORM) · หนี้ SVC-D1 (allowlist ทดสอบ POS ให้รับ ep-mute-scene ก่อนใช้ชุด POS เป็น regression ใน B.8/B.10) · คำถามที่ปรึกษากฎหมาย J3 ใน §4 · หนี้ R0.4 (สรุปข้อเสนอในหน้าอนุมัติ · ปิดค่า PRIVACY · ซ่อน payments.slip.onVerifierDown)
- ชุดแก้หลังผู้ตรวจที่ใช้ไปแล้ว: `/root/svc-runs/fix/*.md` (อ้างอิง)

### ▶️ RESUME STEPS (บัญชีใหม่)
1. อ่านไฟล์นี้ → `ledger/SVC-RUN.md` §1 (กติกา) §2 (วิธีต่อใบ) §3 (สถานะ) + §4 ท้ายไฟล์ (มติล่าสุด) → `ledger/SVC-CORE-CONTRACT.md` (+ภาคต่อท้ายไฟล์)
2. เช็กเครื่อง: `systemctl list-units 'iso-*'` ว่าง · bind mount node_modules ของ `/root/projects/shark-svc-l{1,2,3}` (เป็น symlink แล้ว — ไม่ต้อง mount · l2 ใช้ /root/projects/shark-svc-nm-l2) · `[ -x .../node_modules/.bin/tsx ]` · ทรีหลัก `cd /root/projects/shark-svc && pnpm exec prisma generate` ถ้า client เก่า
3. `git -C /root/projects/shark-svc pull`/log ให้ตรง origin/session/svc · เลน: `git -C /root/projects/shark-svc-lN reset --hard session/svc` (ยกเว้น l3 ใช้ `wip/svc-l3` ที่มีข้อสอบ R0.6 → `git rebase session/svc`)
4. เปิด 3 เลน: l3 = builder R0.6 · l1 = ข้อสอบ R0.7 · l2 = ข้อสอบ B.0 → ต่อตาม MASTER-PLAN §5 (สัปดาห์ 2: R0.7→B.1→B.3 · D.0→D.2→D.5 · R0.4→B.11→D.6)
5. ทุกใบเข้ม: ผู้ตรวจ 2 ตัว + เมื่อข้อสอบใหม่เขียนหลังโค้ดแก้ ให้ผู้ตรวจรันฉากเดิมยืนยันซ้ำก่อน merge · รัน tsc ด้วย `ISO_MEM=9000M NODE_OPTIONS=--max-old-space-size=7168`
6. tg เฉพาะ % หลังปิดใบ · ห้าม push main · ห้าม deploy

## (เก่า) ▶️ RUNNING — สถานะตอนนี้ (27 ต.ค. 14:5xZ)

- R0.0 ✅ (ดู SVC-RUN §4) · วันแรกกำลังเปิด: เลน 3 = R0.1 · เลน 1 = B.2 · เลน 2 = D.1 (ขั้นใบสั่ง+ข้อสอบ)

## (เดิม) ⏸ PAUSE — สถานะก่อนเริ่ม

- **แผนเสร็จ · ยังไม่เริ่ม RUN** · 0/53 ใบ · ไม่มีเลน/agent/unit ใดของ SVC รันอยู่
- เอกสารที่มี: `ledger/SVC-MASTER-PLAN.md` (53 ใบ + เลื่อน 27) · `ledger/SVC-CORE-CONTRACT.md` (ชื่อชิ้นกลางที่เคาะแล้ว K1–K12) · `ledger/SVC-RUN.md` (กติกา + สถานะ ⬜ ทั้งหมด) · ไฟล์นี้ · `ledger/SVC-KICKOFF-PROMPT.md`
- ✅ เอกสารแผน commit แล้วบน `session/svc-design` (push origin แล้ว 27 ต.ค.)
- **รออะไร**: POS RUN ถึง 100% (ประเมิน ~1–2 วันจาก 27 ต.ค.) + เจ้าของอนุญาตเริ่ม SVC (J0) → เริ่มที่ **R0.0** (ผู้คุมทำเอง) แล้ว **R0.1 · B.2 · D.1** พร้อมกันวันแรก
- ลำดับ RUN ของเจ้าของ: POS → **SVC** → HR → ทีม AI · ลูกค้าจริงรอ: ร้านจองคิว (ตัดผม) + หอพัก
- ของที่ต้องขอเจ้าของระหว่างทาง (ไม่บล็อกการเริ่ม): J1 ข้อมูลร้านตัดผม (สัปดาห์ 3) · J2 ข้อมูลหอ + จด VAT ไหม + ผู้ให้บริการตรวจสลิป+คีย์ (สัปดาห์ 3–4) · J3 ที่ปรึกษากฎหมาย (ส่งชุดสัปดาห์ 2 · ต้องผ่านก่อน D.15) · J4 ผู้ตรวจบัญชี · J5 PDPA · J6 env `INTEGRATIONS_CREDENTIALS_KEY` + สั่ง deploy

## ▶️ RESUME STEPS (ทำตามลำดับ — วางซ้ำได้ทุกครั้งที่ session ใหม่)

1. **เช็กว่า POS จบจริง**: `git show session/pos:ledger/POS-RESUME.md | tail -60` (อ่านอย่างเดียวผ่าน git · ห้ามแตะ worktree POS) ว่า "55/55 · 100%" + tip สุดท้ายของ `session/pos` · ยังไม่ 100% = **หยุด ไม่เริ่ม SVC** (เพดานเลนเป็นของ POS)
2. เช็กเครื่อง: `systemctl list-units 'iso-*' 'svc-*' 'pos-*' --no-pager` · `ls /tmp/shark-gate*.lock` · `free -g` (swap ≥ 12G ตาม `reference_shark_pos_build_tsc_heap_7g`) · bind mount `node_modules` ของ worktree (หลังรีบูตหาย — `reference_shark_pos_bind_mounts_lost_on_reboot`)
3. `cd /root/projects/shark-svc && git status && git log --oneline -5` · commit เอกสารแผนถ้ายังไม่ commit (ข้างบน)
4. อ่าน `ledger/SVC-RUN.md` §3 หาใบแรกที่ไม่ใช่ ✅ · ใบที่ 🔄/🧪 = ทำต่อจากขั้นใน SVC-RUN §2 ที่ค้าง (ดู wo-notes «ledger/wo-notes/svc-<wo>.md» + `git diff --stat` ของเลน) · **ห้ามเริ่มใบที่เสร็จแล้วใหม่**
5. ถ้ายังไม่เริ่มเลย → ทำ **R0.0** ตาม MASTER-PLAN §4.R0 แถว R0.0:
   - เคาะฐาน branch: POS merge เข้า main แล้ว ⇒ แตก «session/svc» จาก main · ยังไม่ merge ⇒ แตกจาก tip `session/pos` สุดท้าย (จด SHA ใน SVC-RUN §4)
   - `git worktree add` เลน «/root/projects/shark-svc-l1» «-l2» «-l3» + bind mount `node_modules` · ทรีหลัก `/root/projects/shark-svc` เปลี่ยนเป็น «session/svc» (เอกสาร SVC-* ต้องตามมาด้วย — cherry-pick commit เอกสาร)
   - Neon branch «qc-svc» จาก QC4 (วิธี `reference_shark_pos_qc6_qcall_branch` · ระวัง `reference_shark_qc4_env_role_trap`) → «.env.qc-svc» → «scripts/qc-svc.sh» (`QC_ENV_FILE=.env.qc-svc` · `GATE_LOCK_FILE=/tmp/shark-gate-svc.lock`)
   - ทดลอง `CREATE EXTENSION btree_gist` บน qc-svc (แล้ว rollback) → จดผลใน SVC-RUN §4
   - baseline ชุดเดิม → «ledger/wo-notes/svc-baseline-<hash>.txt»
6. วันแรก (3 เลน): เลน 3 = **R0.1** (migration) · เลน 1 = **B.2** (ตัววางคิว pure) · เลน 2 = **D.1** (กฎหมาย+สูตร pure — ส่วน defs รอ R0.3) · ต่อด้วยตาราง MASTER-PLAN §5
7. ทุกใบ: วิธีทำ SVC-RUN §2 · ปิดใบแล้ว `tg "📊 SVC · NN% (x/53)"` · อัปเดต §3 ของ SVC-RUN + บล็อกนี้ (เปลี่ยนหัวเป็น ▶️ RUNNING + ใบที่กำลังเดิน + เลน)

## 📌 ข้อเคาะที่ค้าง (ทำตามค่าปลอดภัยไปก่อน · ดู CC §10)
- รหัสผังบัญชีเงินประกันผู้เช่า (D.2) · ค่าคอมฯ เมื่อผู้ให้บริการไม่มีบัญชีผู้ใช้ (B.0/B.10 — แจ้งผู้คุม POS) · btree_gist (R0.0) · ลิงก์เปิดแชท OA พร้อมรหัส (C.2) · ข้อความบริการ vs การตลาด (J5)
- ฐาน branch (R0.0) · ลำดับความสำคัญเลนถ้าเจ้าของอยากให้ "หอนำ" (MASTER-PLAN §8 คันโยก ก)
