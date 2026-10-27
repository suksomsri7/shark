# WO <wo> — <ชื่อใบ> (RUN SVC)

> RUN "SVC" (จองคิว+บัตรคิว V2 · หอพัก · โรงแรม V2) · worktree `/root/projects/shark-svc-lN` · branch `wip/svc-lN` → merge เข้า `session/svc` · <วันที่> · ผู้คุม: <โมเดล> · builder: <ตัวแทน/โมเดล>
> สัญญา: `ledger/SVC-MASTER-PLAN.md` §4 แถว <wo> · ใบสั่ง `ledger/svc-briefs/svc-brief-<wo>.md` · ชิ้นกลาง `ledger/SVC-CORE-CONTRACT.md` § … · แบบ `ledger/DESIGN-BOOKING-QUEUE.md` / `ledger/DESIGN-DORM-HOTEL.md` § … · ภาพ `ledger/design-booking|design-dorm/NN-*.png`
> ข้อสอบใบ: `scripts/qc-svc-<wo>.mts` (N ข้อ · commit test: <hash> · **แก้หลัง commit หรือไม่: ไม่ / ใช่ — ORACLE-EDIT ดู §7**)
> ระดับตรวจ (SVC-RUN §1.4): ☐ เบา (ตรวจรอบเดียว) · ☐ **เข้ม** (เงิน/บัญชี/มัดจำ/ประกัน · สคบ. · กันจองซ้อน/ตัวจัดคิว · ข้อมูลข้ามร้าน — reviewer แยก 2 ตัว)
> ฐาน: **qc-svc เท่านั้น** (`wo-svc-qc` · `ep-mute-scene`) — ทุกคำสั่งแตะฐาน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts` (ห้าม export CI · ห้าม flock ซ้อน)

## 1. ไฟล์ที่แตะ (ต้องอยู่ในรายการ "ไฟล์เจ้าของ" ของใบสั่ง — นอกนั้น = ตีกลับ)
| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|

## 2. ชุดโมดูลที่แตะ (คอลัมน์ "ข้อสอบ" ของ MASTER-PLAN) + migration/seed
- โมดูลที่แตะ: … → ชุดข้อสอบที่ต้องรัน: `qc-…` · `qc-…`
- migration (เฉพาะ R0.1 · B.0 · D.0 · H.0): ชื่อ · ได้จาก `prisma migrate diff --from-schema <เดิม> --to-schema prisma/schema --script` · อ่าน SQL ทุกบรรทัดแล้ว (ไม่มี DROP · ALTER TYPE ต่อท้าย · NOT NULL มี default) · รันบน qc-svc แล้ว
- seed: `scripts/seed-svc-qc.mts` / `scripts/svc-qc-data.mts` (SQC) เปลี่ยนอะไร · รันซ้ำ 2 รอบ = ไม่มีแถวเพิ่ม + รอบ 2 "ไม่มีการเขียน" (`SEED_SUMMARY` เท่าเดิม)
- 🔴 ลบห้อง: `roomOccupancy` ก่อน `hotelRoom` (FK RESTRICT)

## 3. ผลข้อสอบ (วาง `JSON_SUMMARY` จริง — ห้ามสรุปเป็นคำพูด · ตัวเลขจาก builder ไม่ใช่หลักฐาน ผู้คุมรันซ้ำเอง)
| ชุด | คำสั่ง | ผล (`JSON_SUMMARY` / exit) |
|---|---|---|
| ข้อสอบใบ `qc-svc-<wo>` | `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-<wo>.mts` | |
| ชุดโมดูลที่แตะ `qc-…` | (เหมือนบรรทัดบน) | |
| smoke `qc-svc-smoke` | `bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/qc-svc-smoke.mts` | |
| typecheck | `ISO_MEM=9000M NODE_OPTIONS=--max-old-space-size=7168 bash scripts/iso.sh pnpm exec tsc --noEmit -p tsconfig.json` | |
| fitness (มี env) | `bash scripts/iso.sh bash scripts/qc-svc.sh pnpm fitness` | |
| fitness (ไม่มี env) | `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | |
- smoke: ใบนี้เติมข้อ smoke อะไร (คงข้อเดิม · อ่านอย่างเดียว/คืนสภาพใน finally): …
- ด่านเต็ม (`qc:all` + ไล่กดทุกบทบาท) **ไม่รันต่อใบ** — เฉพาะ G1 (B.12) · G2 (D.15) · G3 (B.18+D.20)

## 4. กลุ่ม X (SVC-RUN §1.5 — ทุกแถวต้องมี: check ids หรือเหตุผล N-A 1 บรรทัด)
| กลุ่ม | เกี่ยว? | check ids / เหตุผล N-A |
|---|---|---|
| X1 ขอบเขต (ข้ามร้าน/ข้ามหน่วย/ข้ามอาคาร ⇒ 404 ไม่มีข้อมูลหลุด) — **ห้ามตัดแม้ใบเบา** | ☐ ใช้ / ☐ N-A | |
| X2 (สงวน — SVC ไม่ใช้เลขนี้) | N-A | — |
| X3 ยิงพร้อมกัน ≥10 ทาง (ตัวนับ/สถานะ/การจอง) | ☐ ใช้ / ☐ N-A | |
| X4 ส่งซ้ำ (consumer event เดิม 2 รอบ/พร้อมกัน = ผลครั้งเดียว) | ☐ ใช้ / ☐ N-A | |
| X5 งานตามเวลา 2 รอบซ้อน = ครั้งเดียว | ☐ ใช้ / ☐ N-A | |
| X6 ข้อมูลเข้าอันตราย (CSV `csvRow` · เพดานนำเข้า · mime/ขนาดไฟล์) | ☐ ใช้ / ☐ N-A | |
| X7 endpoint สาธารณะ (rate limit · token ≥128 บิตเก็บ hash · token ผิด = คำตอบเดียวกัน) | ☐ ใช้ / ☐ N-A | |
| X8 PDPA (ยินยอม/optOut ตอนส่งจริง · log/payload ไม่มี PII) | ☐ ใช้ / ☐ N-A | |
| X9 การกระทำอันตราย (confirm + เหตุผล · approval เกินเพดาน · audit) | ☐ ใช้ / ☐ N-A | |
| X10 ความลับ/ไฟล์ (ไฟล์ส่วนตัวผ่าน route ตรวจสิทธิ์+หมดอายุ · ไม่มีความลับใน DTO/RSC) | ☐ ใช้ / ☐ N-A | |
- ห้ามตัด (SVC-RUN §1.4): แยกร้าน · เงินตรงทุกสตางค์ (GL สมดุล) · กันจองซ้อน · สคบ. · UI ตรงแบบ — ใบนี้เกี่ยวข้อไหน หลักฐานอยู่ check id ไหน

## 5. ภาพ (ใบมีจอเท่านั้น · 1 ภาพ MOCKUP|RENDER ต่อจอที่อนุมัติ · ผู้คุม build QC server เอง — builder ห้าม build)
คำสั่ง: `bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/visual-svc.mts <wo> --user <key> --base http://127.0.0.1:<port>` (ห้าม :3215 · ไม่มี base ปริยาย) · สเปคหน้าอยู่ `SQC_VISUAL_SPECS` ใน `scripts/svc-qc-data.mts`
| จอ | mockup | ผู้ใช้ | 1440×900 | 390×844 (เฉพาะจอที่แบบเป็นมือถือ) | overflow | page error |
|---|---|---|---|---|---|---|
- `PARITY: ผ่าน / ตีกลับ — <เหตุผล · จุดต่างพร้อมพิกัด>` (ผู้คุมเปิดดูเอง)
- ใบไม่มี UI: `PARITY: N-A — ไม่มีจอ`

## 6. reviewer
- เบา: ผู้คุมอ่าน diff เอง / reviewer 1 ตัว — สรุป BLOCKER (ต้อง 0)
- เข้ม: reviewer A · reviewer B (B ไม่เห็นรายงาน A) — สรุป BLOCKER ทั้งคู่ (ต้อง 0)

## 7. ข้อแย้ง / มติทางเทคนิค
- ข้อสอบ id … ผิดเพราะ … (อ้างแบบ/CC § · โค้ด file:line) → ผู้คุมตัดสิน · แก้แล้วบันทึก `ORACLE-EDIT qc-svc-<wo>-<ข้อ>` ใน SVC-RUN §4
- สเปกขาด: … → ตัดสินใจ … (ย้อนกลับได้อย่างไร)
- คำขอแก้ชิ้นกลาง (ใบโดเมนแก้เองไม่ได้): …

## 8. หนี้ / สิ่งที่ยังไม่ทำ (ยกเข้า SVC-RUN §3.2)
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|

## 9. คืนสภาพ qc-svc
- ข้อสอบ `finally` คืนอะไร · `seed-svc-qc` รันซ้ำแล้วไม่มีการเขียน (สรุปเท่าเดิม) · ไม่มีแถว `qc-<wo>-*` ค้าง · ไม่มี session `qc-visual-svc` ค้าง · ไม่มีโปรไฟล์ chromium `/tmp/chr-svc-*` ค้าง
