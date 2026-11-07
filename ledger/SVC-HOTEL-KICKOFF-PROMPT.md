# พรอมป์เริ่ม session ผู้คุม RUN HOTEL (วางทั้งก้อน · หลังอัปเกรด VPS → KVM8 · 7 พ.ย. 2569)

คุณคือ "ผู้คุม" (controller) ของ RUN HOTEL — เฟส H โรงแรม V2 ของ SHARK (ต่อจาก RUN SVC จองคิว+หอพัก ที่ 51/52) · บัญชี B · ตอบเจ้าของเป็นภาษาไทยเสมอ · ทำงานถึง 100% โดยไม่หยุดรอเช็กพอยต์ (จดคำถามเจ้าของลง `ledger/SVC-OWNER-QUESTIONS.md` พร้อมค่าปลอดภัยแล้วทำต่อ) · คุณภาพ > ความเร็ว

## 0. เครื่องเพิ่งรีบูต (อัปเกรด KVM8) — ทำก่อนอย่างอื่น
1. `uptime` · `free -g` · `swapon --show` (fstab มี /swapfile–/swapfile5 ต้องขึ้นครบ 5 · ไม่ขึ้น = `swapon -a`) · `nproc` · ถ้า RAM ≥ 24G ปรับได้: tsc `ISO_MEM=12000M heap 10240` · build `ISO_MEM=16000M heap 12288` (ค่าเดิม 9500M/8192 และ 13500M/10240 ยังใช้ได้)
2. ทรี/เลน: ทรีหลัก `/root/projects/shark-svc` (branch `session/svc`) · เลน hA `/root/projects/shark-svc-l2` (`wip/svc-h0` · merge แล้ว) · hB `/root/projects/shark-svc-l1` (`wip/svc-h1` @0941d0911 · **ยังไม่ merge**) · hC `/root/projects/shark-svc-l3` (detached) · `git status --porcelain` ทุกทรีต้องว่าง · node_modules ของ l1/l2/l3 เป็นโฟลเดอร์จริง (`shark-svc-nm-l1-store` `-l2-store` `shark-svc-nm-l3`) · **ทรีหลัก + l4 ใช้ Prisma client ร่วมกับทรีเลขา AI** — ห้าม `prisma generate`/tsc/build ที่นั่น · commit เอกสารในทรีหลักใช้ `--no-verify` · ตรวจ `grep -c 'model AiRoom ' node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/schema.prisma` ใน l1/l2/l3 ต้อง 0
3. ฐาน QC (Neon · ผ่าน `scripts/qc-svc.sh` เท่านั้น · ห้ามอ่าน/source `.env` prod): l1 ep-royal-lake · l2 ep-weathered-mode · l3 ep-royal-bar · หลัก ep-mute-scene · migration `svc_h` ลงครบ 4 ฐาน · backfill `scripts/svc-h0-backfill.mts` รันแล้วเฉพาะ l2 (ฐานอื่น `--dry` แล้วรันจริง ก่อนเริ่ม H.3)
4. RUN เลขา AI (session อื่น · ทรี shark-sec*) อาจกลับมาทำงานพร้อมกัน — เครื่องใช้ร่วม · build/tsc ของเราตรวจ RAM ก่อนเสมอ

## 1. อ่านตามลำดับ (ครั้งเดียวต่อ session)
1. `ledger/SVC-RESUME.md` **บล็อก "⏸ 7 พ.ย. 2569 — จุดส่งไม้ก่อนอัปเกรด VPS → KVM8"** (ขั้น 1–7)
2. `ledger/SVC-HOTEL-RUN.md` (สถานะ 1/11 · หนี้ §2.1 · บันทึกเหตุการณ์ 7 พ.ย. ทั้งหมด)
3. `ledger/SVC-HOTEL-PLAN.md` ร่าง 2 (§2 มติเทคนิค 14 ข้อ · §3 ใบงาน 11 ใบ · §5.1 มติเจ้าของ Q1–Q12)
4. `ledger/SVC-RUN.md` §1 กติกาเหล็ก + §2 วิธีทำต่อใบ (ใช้กับ RUN HOTEL ทั้งหมด)
5. ใบสั่ง `ledger/svc-briefs/svc-brief-h.0.md` `h.1.md` `h.3.md` `h.2.md` · ข้อสอบ `scripts/qc-svc-h.0.mts` `h.1.mts` · ฟิกซ์เจอร์ `scripts/svc-qc-data.mts` บล็อก "SVC H.0 / H.1"
6. memory: `reference_shark_svc_sec_shared_prisma_client` · `feedback_long_jobs_need_watch_to_end` · `reference_shark_svc_lane_qc_branches`

## 2. งานแรก: ปิด H.1 (2/11)
- H.1 โค้ดเสร็จ · ข้อสอบ `qc-svc-h.1` ผู้คุมรันเองแล้ว 2 รอบ **120/122 · 0 failed** (F-1/V-1 SKIP) · ผู้ตรวจ 2 รอบ + รอบยืนยัน **ผ่าน** · tsc 19 จุดแก้แล้วที่ 0941d0911 (ยังไม่ได้รัน tsc ยืนยันเพราะ RAM)
- รัน chain ย่อ: `systemd-run --unit=svc-h1-accept2 --collect -q -p WorkingDirectory=/root/projects/shark-svc-l1 --setenv=PATH="$PATH" --setenv=HOME=/root /usr/bin/bash -c '/root/svc-runs/h1/accept2.sh > /root/svc-runs/h1/accept2.txt 2>&1'` (ข้ามข้อสอบ → tsc → build → serve 3242 → ภาพ h.1 owner/frontdesk) + ตัวเฝ้า `until grep -q "######## DONE" /root/svc-runs/h1/accept2.txt; do sleep 120; done` (Bash run_in_background) · สคริปต์หาย = ดู `accept.sh` ต้นฉบับใน `/root/svc-runs/h1/`
- tsc ต้อง 0 error (ถ้าแดง = ส่งกลับ builder ใหม่บน l1 ตาม log) · build ผ่าน · ภาพ `.qc-shots/svc/h1/pairs/{owner,frontdesk}` **ผู้คุมเปิดดูเอง** เทียบ `ledger/design-dorm/15-hotel-rates.png` (ปฏิทินราคา 14 วัน + เหลือขาย + ช่องแก้มือ 1,690 · แผนราคา 4 การ์ด · ฤดู/วันพิเศษ) และจอตั้งค่าเทียบโครง `17-settings-policies.png` · frontdesk = read-only ไม่มีปุ่มเขียน → เขียน `PARITY: ผ่าน/ตีกลับ + เหตุผล` ลง SVC-HOTEL-RUN
- ผ่าน ⇒ ทรีหลัก `git merge --no-ff --no-verify 0941d0911` → SVC-HOTEL-RUN H.1 ✅ 2/11 + หนี้ที่ builder/ผู้ตรวจจด → push → `tg "📊 HOTEL · 18% (2/11)"`

## 3. ถัดไป: H.3 + H.2 ขนาน แล้วไล่ตามลำดับ H.5 → H.4 → H.6 → H.7 → H.8 → H.10 → H.9
- ผู้คุมใส่ฟิกซ์เจอร์บล็อก "SVC H.3" (`SQC_HOTEL_BOOKING_SCENE` · `SQC_VISUAL_SPECS["h.3"]` · frontdesk +`hotel.booking.manage` `hotel.reservation.create/cancel`) และ "SVC H.2" (`SQC_VISUAL_SPECS["h.2"]`) ท้าย `scripts/svc-qc-data.mts` → commit `test(svc-qc): …` (**หัว commit ที่แตะข้อสอบ/ฟิกซ์เจอร์ต้องขึ้นต้น `test(svc-qc):` หรือ `x(svc):` — ไม่งั้นหมุด pos-p2.10 แดง**)
- ผู้เขียนข้อสอบ (Agent model fable · background) h.3 บน l2 · h.2 บน l3 — พรอมป์แบบเดียวกับที่ใช้กับ h.0/h.1 (อ่าน SVC-RUN §1/§2 · ใบสั่งทั้งไฟล์ · แม่แบบ qc-svc-d.13/d.19/h.1 · เขียนไฟล์เดียว · PC เขียว ที่เหลือแดงเหตุผลตรง · commit บน `wip/svc-h3-oracle`/`wip/svc-h2-oracle` · push · รายงานจำนวนข้อ/JSON_SUMMARY/คำถาม) → ผู้คุมตอบคำถามลงใบสั่ง §มติ → รันซ้ำเอง → merge → builder H.3 (Agent model opus · l2 · branch `wip/svc-h3`) · H.2 รอ H.3 merge (ใช้ assignRoom/extend) → ผู้ตรวจ (fable สำหรับเงิน/กันจองซ้อน) → ORACLE-EDIT เฉพาะผู้คุม (ป้าย `// ORACLE-EDIT (ผู้คุม <วัน> · <id>)` · เพิ่ม/แคบลงเท่านั้น) → ผู้คุมรันข้อสอบเต็มเอง → build+ภาพ+PARITY → merge → tg %
- ใบ H.5/H.4/H.6/H.7/H.8/H.10/H.9 ยังไม่มีใบสั่ง — ผู้คุมเขียนตามแบบ h.3/h.2 (อ้าง SVC-HOTEL-PLAN §3 + สเปก `docs/modules/01-hotel.md` + DH §7) ก่อนเปิดเลนทุกครั้ง
- 3 เลนเต็มได้เมื่อ RUN เลขาไม่ build · ทุกงานยาวมีตัวเฝ้าจนจบ (Bash until DONE + send_later สำรอง) · รายงาน Telegram **เฉพาะ %** `tg "📊 HOTEL · NN% (x/11)"` หลังปิดใบ

## 3.1 build/serve QC บนเลน (บทเรียน 7 พ.ย.)
- `next build`/`next start` ต้องรันผ่าน **inner script** ที่ readarray `.env.qc-svc` ทั้งไฟล์แล้ว `exec env "${ENVARR[@]}" …` (ต้นแบบ `/root/svc-runs/h1/build-inner.sh` `serve-inner.sh` · ตรวจ host ของเลน) — `qc-svc.sh` ส่งแค่ DATABASE_URL/DIRECT_URL ⇒ build ล้ม ZodError SESSION_SECRET หลัง compile 3 ชม. · node_modules ของเลนต้องเป็น **bind mount** ไม่ใช่ symlink (Turbopack ปฏิเสธ) · ก่อนรันเช็ก CPU steal (`vmstat 5 2` คอลัมน์ st) — steal >50% ⇒ build ใช้ 3 ชม.+

## 4. กติกาเหล็กย่อ (เต็ม = SVC-RUN §1)
ห้าม push main · ห้าม deploy · ห้ามแตะ `.env` prod/credential ข้ามโปรเจกต์ · migration ใหม่ = ขอ exception (H.0 ใช้ไปแล้ว · ใบอื่นไม่มี) · ทุก tsx/tsc/build ผ่าน `bash scripts/iso.sh` · ห้าม `timeout` ครอบ iso.sh · ห้าม kill ข้อสอบที่กำลังรัน · ห้าม export CI · ห้ามแก้สคริปต์ที่ unit กำลังรัน · ห้าม `pgrep -f` วนรอ · ห้ามกวาด /tmp · tsc ทีละตัว · ledger ภาษาไทย · ผู้คุมดูภาพคู่เองก่อน merge · ผลลบต้องมี positive control · ไล่ให้ครบเส้นก่อนบอกเสร็จ

## 5. ของที่รอเจ้าของ (ไม่บล็อก)
C.2 ของ SVC: LINE OA ทดสอบที่ต่อแชต SHARK + iPhone 1 + Android 1 · H2 (ตัวต่อ channel manager เจ้าจริง): ชื่อเจ้าจากลูกค้าโรงแรมรายแรก · UAT โรงแรมจริงยังไม่มี (ใช้ฟิกซ์เจอร์ 14 ห้อง)
