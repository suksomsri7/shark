# PR — POS V2 (`session/pos` → `main`) · ร่างโดยผู้คุม A 24 ต.ค. 2026 (เติม SHA/ตัวเลขสุดท้ายตอนปิด P6.1 · ⛔ ผู้คุมไม่ push main — เจ้าของเป็นผู้ merge ตาม `docs/pos/DEPLOY-RUNBOOK.md`)

## สรุป (Summary)
POS ใหม่ทั้งระบบ (RUN 1–24 ต.ค. 2026 · 55 ใบงาน · 7 เฟส): แคตตาล็อกเดียว · หน้าขายใหม่ 3 ขนาด · ชำระหลายวิธี/PromptPay/คืนเงิน/กะ · โต๊ะ-ครัว-ช่องทาง · เชื่อม 13 ระบบ · REST `/api/v1/pos` + สกิล · ออฟไลน์ · AI · ล่าบั๊ก/ช่องโหว่ (P5) · "ทุกปุ่มทำงาน" (P4) · เครื่องมือ deploy อ่านอย่างเดียว (P6.1) · HEAD ของ PR = `<PR_HEAD_SHA>` (เติมตอนปิด) · ฐาน `origin/main` = `<MAIN_SHA>`.

## ลำดับ deploy (บังคับ · CD-P61-R1)
🔴 `vercel.json` ใช้ `scripts/vercel-build.sh` ซึ่งรัน `prisma migrate deploy` เองตอน build ⇒ **เจ้าของต้องรัน migrate deploy จาก VPS (worktree สะอาดที่ `<PR_HEAD_SHA>` · direct URL + lock_timeout 5s) และ `migrate status` ต้องขึ้น "up to date" ก่อนกด merge** — ถ้า merge ก่อน Vercel จะ migrate เองโดยไม่มี pre-flight (runbook §0 · §4).
1. ตั้ง env บน Vercel production: `POS_DEVICE_KEY` (≥ 32 ไบต์สุ่ม · กุญแจคุกกี้จับคู่เครื่องขาย · W40) + `POS_CREDENTIALS_KEY` ถ้ายังไม่ตั้ง (§6) → 2. pre-flight ล็อก/row counts อ่านอย่างเดียว (§3.4 · `verify-prod-pos.mts --counts`) → 3. `prisma migrate deploy` จาก VPS (§4.2) → 4. `migrate status` up to date + verify M1 M2 T1 C1 E1 I1 เขียว (ด่านแข็ง GO-10) → 5. merge PR (Vercel build ต้องพิมพ์ "No pending migrations to apply.") → 6. เลื่อน checkout crontab บน VPS ตาม main (§7) · index มือ (§5) · จับคู่เครื่องขายทุกเครื่อง (§9 GO-15) → 7. backfill ทีละร้าน `--dry-run` ก่อน (§8) → 8. เปิดธงทีละร้าน (§9).
- **GO-11b (R2-F2)**: ถ้า `verify-prod-pos.mts --counts` รายงาน K2 > 0 (ระบบที่ `settings.pos.registerV2 = true` อยู่แล้ว) ให้รัน backfill §8 (catalog → `--verify` 0 → web prices → `pos-shift-required-off`) เฉพาะ tenant เหล่านั้น **ระหว่าง GO-10 กับ merge** หรือปิด `registerV2` ของร้านนั้นก่อน merge แล้วเปิดคืนหลัง backfill (เจ้าของเลือก GO-3f) — ไม่งั้นร้านนั้นจะได้หน้าขาย V2 ที่แคตตาล็อกว่าง + บังคับกะ ตั้งแต่ merge จนถึง backfill.
- **GO-12 freeze (R2-F1)**: หลัง GO-5 กิ่ง PR รับได้เฉพาะ commit ledger/docs · ก่อนกด merge ต้องรัน `verify-prod-pos.mts --pr-freeze <PR_HEAD_SHA> --main-at <main SHA ที่ GO-10>` = FAIL 0 (diff ของ prisma/src/package.json/lockfile/vercel.json/vercel-build.sh ว่าง และ main ไม่มี migration ใหม่).

## รายการ migration
37 ไฟล์ · เพิ่มอย่างเดียว (additive) ทั้งหมด · ตารางเดิมที่แตะ 13 · ไฟล์ DO $$ 8 · ALTER TYPE 5 · ไฟล์ที่ rerun ไม่ได้ 20 (ต้องใช้ SQL ถอยกลับภาคผนวก ก ถ้าล้มกลางทาง) · `20261220100000_pos_p61_hand_indexes` = `CREATE INDEX IF NOT EXISTS` 14 ตัว (no-op ถ้าสร้างมือแล้ว) — ตารางเต็ม = runbook §2 · กลยุทธ์ index ตามจำนวนแถว §3.2 (ทาง ก/ข/ค/ง).

## ธง/สวิตช์ (flags)
ค่าปริยายทุกธง POS V2 = ปิด ต่อระบบ (`AppSystem(POS).settings.pos.*`): `registerV2` · `offline.enabled` · `credit.enabled` · `chat.*` 4 ตัว · `board.enabled`/`teamRoom` · `ai.enabled`/`ai.brief.enabled` · `deposit/serviceCharge/tip.enabled` · creds แพลตฟอร์ม/สลิป/e-Tax (ไม่มี = ปิด) · print agent (ไม่มี = ปิด) · `shift.required.register` เปิดเมื่อ registerV2 (ขั้นข้อมูล §8.5) — ตาราง + จุดอ่านในโค้ด = runbook §9.
⚠️ พฤติกรรมที่เปลี่ยนตอน deploy **แม้ธงปิด** (runbook §1A · ต้อง GO ทีละข้อ): ประตู legacy ร้านอาหารบนสาขาที่ผูก POS · มัดจำโมดูลเป็นใบรับ POS_DEPOSIT · คีย์กลางได้ 403 บน AI tools ของ POS · เครดิต/ทิปต้อง OWNER หรือผู้จัดการทุกสาขา · device binding บนทางขาย/คืน/เงินสด/กะ/snapshot.

## การถอยกลับ (rollback)
- ถอยทั้งร้าน = ปิดธงตามตาราง §9 (ไม่ย้อน migration · ข้อมูลเพิ่มอย่างเดียว).
- migration ล้มกลางทาง (P3018/P3009) = SQL ถอยกลับเฉพาะไฟล์นั้น (ภาคผนวก ก) → `migrate resolve` → รันใหม่ (§4.4).
- นโยบาย **forward-fix (แก้ไปข้างหน้า)**: หลังมีการเขียนข้อมูล V2 ครั้งแรก (enum ใหม่ใน PosPayment/PosSale) ห้าม promote build เก่าบน Vercel (R1 F8) — แก้ด้วย hotfix ไปข้างหน้าเท่านั้น · ตรวจด้วย SQL อ่านอย่างเดียว GO-22 ก่อนตัดสินใจ.

## หลักฐาน (evidence)
- ด่านเต็ม `pos-gates-all.sh` ที่ `<PR_HEAD_SHA>`: `<gatesNNN-c-…>` VERDICT green (manifest 139 แถว · ACCEPTED 12 ใบเดิมของเลนบัญชี/สมาชิก) · strict tsc 0 errors · `qc-pos-p4.3` 30/30 · `qc-pos-p5.1` 28/28 · `qc-pos-p5.2` 55/55 (F4/F11 รอเจ้าของ W37/W38) · `qc-pos-p5.3` วัดบน QC5 `<p53-…json>` · `qc-pos-p4.2` `<walker-B-…>` 19 cell · parity P3.12 106/107+1 harness · HANDOVER-P1/P2/P3 + `HANDOVER-2026-10-POS.md` (P6.2).
- ซ้อม deploy (W31): `ledger/wo-notes/pos-P6.1.md` — Neon branch ของ prod `<branch>` · migrate log · backfill dry numbers · verify output · ลบ branch `<time>`.
- ของเจ้าของที่ยังเปิด (ship พร้อม merge · รับทราบ): W4 W5 W19 W27 W37 W38 W39 W41 W42 W43 (ดู `ledger/POS-OWNER-PENDING.md` §รอคำตอบ).
