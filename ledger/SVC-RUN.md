# SVC-RUN — กติกาเหล็ก · วิธีทำต่อใบ · สถานะสด · บันทึกเหตุการณ์ (RUN "SVC" จองคิว+บัตรคิว V2 · หอพัก)

> สถานะ RUN: **▶️ เดินต่อ 28 ต.ค. ~14:4xZ** · (เดิม ⏸ พัก 28 ต.ค. ~00:3xZ (เจ้าของสั่ง · ย้ายบัญชี) — ดู SVC-RESUME บล็อกบนสุด** · เดิม: **▶️ กำลังเดิน — เริ่ม 27 ต.ค. 2569 (R0.0 14:3xZ)** · ผู้คุม = Fable · branch «session/svc» (ฐาน 940e3aca)
> แผน/ใบงาน = `ledger/SVC-MASTER-PLAN.md` · ชื่อชิ้นกลาง = `ledger/SVC-CORE-CONTRACT.md` · จุดต่อ = `ledger/SVC-RESUME.md` · prompt = `ledger/SVC-KICKOFF-PROMPT.md`
> ไฟล์นี้ = ที่เดียวที่ผู้คุมแก้สถานะ (§3) และจดเหตุการณ์/มติเทคนิค (§4)

---

## 1. กติกาเหล็ก (ละเมิด = ตีกลับทั้งใบ)

### 1.1 ขอบเขต · ความปลอดภัย
1. ทำงานใน branch «session/svc» + worktree ของ RUN นี้เท่านั้น · **ห้าม push main · ห้าม deploy** จนเจ้าของสั่ง (push branch งานได้) · ห้ามแตะ worktree อื่นใน `/root/projects/*` (POS/HR/อื่น ๆ)
2. **ฐานข้อมูล QC ของ RUN นี้เท่านั้น** («.env.qc-svc» ผ่าน «scripts/qc-svc.sh») · ห้ามอ่าน/แก้/source `.env` (production) · ห้ามใช้ credential ข้ามโปรเจกต์
3. POS แตะได้ **2 จุดเท่านั้น** (มติเจ้าของ · ใบ B.0 คอลัมน์ + ใบ B.10 ฟังก์ชัน): บิลพักผูกงานบริการ · ค่าคอมฯ ตามผู้ให้บริการ — แตะ POS เกินนี้ = หยุดใบ ถามเจ้าของ · HR แตะได้จุดเดียว: `staffWindows()` คืน `[]` ใน `src/lib/modules/hr/index.ts` (B.1)
4. ไฟล์ชิ้นกลาง (รายการใน `ledger/SVC-CORE-CONTRACT.md`) แก้ได้เฉพาะใบ R0.x หรือใบแก้ชิ้นกลางที่ผู้คุมออก (ตรวจเข้ม) · ใบโดเมนต้องการเพิ่ม = เขียนคำขอใน wo-notes
5. migration มีได้เฉพาะ R0.1 · B.0 · D.0 (+ H.0) · เพิ่มอย่างเดียว · `prisma migrate diff --from-schema <เดิม> --to-schema prisma/schema --script` (มติ 27 ต.ค.: ห้าม migrate dev — qc-svc มี drift HR) → **อ่าน SQL ทุกบรรทัด** (ไม่มี DROP · ALTER TYPE ต่อท้ายเท่านั้น · NOT NULL ต้องมี default) · **ห้าม `prisma format` ทั้งชุด** (แก้เฉพาะไฟล์ schema ของใบ)
6. ห้ามลบ/กวาด `/tmp` · ห้ามแก้สคริปต์ที่ unit กำลังรัน · EAS/สโตร์ ต้องรอเจ้าของ

### 1.2 เครื่อง · เลน
7. **เพดาน 3 เลนรวมทุกงานบนเครื่อง** (รวม RUN อื่นถ้ามี) · เลนที่ 3 ต้องเบา (pure/เอกสาร/ไม่ build) เมื่อมี build หนักรันอยู่ · ใบที่แตะ `prisma/schema` ห้ามขนานกัน · build หนักทีละ 1
8. ทุก tsx/tsc/build/qc ผ่าน `bash scripts/iso.sh …` (foreground) · งานยาว (build+ภาพ+qc:all) = สคริปต์ path เต็ม แล้ว `systemd-run --unit=svc-<ชื่อ> --collect -p MemoryMax=… --setenv=PATH="$PATH" --setenv=HOME=/root bash <สคริปต์>` แล้ว poll log · build ทรีใหญ่ใช้ heap/ISO_MEM ตาม `reference_shark_pos_build_tsc_heap_7g` · ก่อนเริ่ม chain ใหม่ตรวจ `systemctl list-units 'iso-*' 'svc-*'` (stop chain ไม่ฆ่าลูก iso)
9. ข้อสอบที่เขียนฐาน: ผ่าน «scripts/qc-svc.sh» (ตั้ง `GATE_LOCK_FILE=/tmp/shark-gate-svc.lock`) ทีละชุด · **ห้าม export `CI`** (ข้าม flock) · ห้าม flock ซ้อนไฟล์เดียวกัน · ห้าม kill ข้อสอบกลางคัน (cleanup อยู่ใน `finally`)

### 1.3 วิธีทำงาน · ประหยัด token
10. **ผู้คุมเขียนข้อสอบ oracle ก่อน** «scripts/qc-svc-<wo>.mts» (ต้องแดง/SKIPPED ด้วยเหตุผลที่ถูก · commit `test(svc): <wo>`) → builder (Opus/Sonnet) **ห้าม build/commit/push/แก้ข้อสอบ** → ผู้คุมรันข้อสอบซ้ำเอง + build QC ผ่าน iso + ภาพ → merge เข้า «session/svc»
11. ข้อสอบผิดจริง: builder เขียนแย้ง → ผู้คุมตัดสิน → ผู้คุมแก้เองพร้อมบรรทัด `ORACLE-EDIT <ชุด>-<ข้อ>` + หลักฐาน ใน §4
12. **ประหยัด token**: ผู้คุมเขียนเอกสาร/ใบสั่ง/wo-notes เอง (ไม่ปล่อยตัวแทนเขียนเอกสาร) · chain งานพื้นหลังทีละ 1 · ด่านเต็มครั้งเดียวต่อเฟส · ตัวเลขจากตัวแทนไม่ใช่หลักฐาน — หลักฐานคือผลรันของผู้คุม
13. รายงาน Telegram **เฉพาะ %**: `tg "📊 SVC · 40% (21/53)"` หลังปิดใบ · ระหว่างพัก RUN ห้าม tg รายชั่วโมง · คำถามเจ้าของลง «ledger/SVC-OWNER-QUESTIONS.md» พร้อมค่าปลอดภัย แล้วทำต่อ (ไม่หยุดรอ)
14. โค้ด: ไม่มี `any` · zod v4 · ข้อความ error ไทยไม่โทษผู้ใช้ · เงินเป็นสตางค์ · เวลาไทยใช้ `src/lib/core/quiet-hours.ts` (`bkkParts`/`bkkYmd`) ห้าม `getDay()` ดิบ · `"use server"` export async function เท่านั้น · `'use client'` ห้าม import โมดูลที่ลากถึง prisma · import ข้ามโมดูลผ่าน facade + `ALLOWED_EDGES` · อ่าน `node_modules/next/dist/docs/` ก่อนใช้ API Next ที่ไม่แน่ใจ (AGENTS.md)
15. event ใหม่ลง 3 ทะเบียนในใบเดียวกัน (`src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts`) · payload ห้ามมีเบอร์/อีเมล/ชื่อเต็ม · งานตามเวลาใช้ `src/lib/platform/minute-jobs.ts` (ไม่เพิ่ม `vercel.json`)
16. **หน้าตั้งค่าสร้างจากทะเบียนค่าตั้ง** (`SettingsForm`) — ห้ามวาดหน้าตั้งค่าทีละหน้า

### 1.4 🔴 กติกาตรวจแบบเบา (เจ้าของตกลง 27 ต.ค. 2569)
| เรื่อง | ทำอย่างไร |
|---|---|
| **ต่อใบ** | รันเฉพาะ: ข้อสอบของใบ + ชุดข้อสอบของ **โมดูลที่ใบแตะ** (รายการในคอลัมน์ "ข้อสอบ" ของ MASTER-PLAN) + «scripts/qc-svc-smoke.mts» · typecheck + fitness 2 โหมด (มี env / `env -u DATABASE_URL`) |
| **ด่านเต็ม** (`qc:all` + ไล่กดทุกบทบาท) | **ครั้งเดียวตอนจบเฟส/ก่อน UAT**: G1 = B.12 (ก่อน UAT ร้านตัดผม) · G2 = D.15 (ก่อน UAT หอ) · G3 = B.18+D.20 (จบ RUN · ครั้งเดียวร่วมกัน) · R0 ไม่มีด่านเต็มของตัวเอง (ปิดด้วยชุดของใบ + ชุดโมดูลที่แตะ) · แดงที่โผล่ใน qc:all เท่านั้น: reseed แล้วรันเดี่ยว — เขียว = flake พร้อมสาเหตุ · แดงสองครั้ง = บั๊กจริงต้องแก้ |
| **ตรวจเข้ม 2 รอบ** (reviewer แยก 2 ตัว · รอบ 2 ไม่เห็นรอบ 1) | เฉพาะ: **เงิน/บัญชี/VAT/มัดจำ/ประกัน** · **กฎหมาย (สคบ.)** · **กันจองซ้อน/ตัวจัดคิว** · **ข้อมูลข้ามร้าน** (ลิงก์สาธารณะ · ความลับ · ขอบเขต) — ใบที่ติด "เข้ม" ในตาราง MASTER-PLAN |
| **ตรวจรอบเดียว** | หน้าจอทั่วไป/ใบเบา (reviewer 1 ตัว หรือผู้คุมอ่าน diff เองสำหรับใบ S/M) |
| **perf** | เฉพาะ ตัวจัดคิว (B.2 · ซ้ำใน B.13) และ ออกบิลทั้งตึก (D.8) — เกณฑ์อยู่ในใบ |
| **ภาพ** | **1 ภาพ MOCKUP\|RENDER ต่อจอที่อนุมัติ** (คอลัมน์ "ภาพ") · ผู้คุมเปิดดูเองแล้วเขียน `PARITY: ผ่าน/ตีกลับ + เหตุผล` · ใบไม่มี UI ไม่ต้องถ่าย · มือถือ 390 เฉพาะจอที่แบบเป็นมือถือ |
| **ห้ามตัด (แม้ใบเบา)** | แยกร้าน (X1 ข้ามร้าน ⇒ 404) · ความถูกต้องเงิน (GL สมดุล · ยอดตรงทุกสตางค์) · กันจองซ้อน · สคบ. (ตัวตรวจ + ที่ปรึกษาก่อนหอขึ้นจริง) · UI ตรงแบบ |

### 1.5 กลุ่มข้อสอบ X (ใช้เท่าที่เกี่ยว · ใบไม่เกี่ยวเขียนเหตุผล 1 บรรทัดใน wo-notes)
X1 ขอบเขต (ข้ามร้าน/ข้ามหน่วย/ข้ามอาคาร ⇒ 404 ไม่มีข้อมูลหลุด) · X3 ยิงพร้อมกัน ≥10 ทาง (ตัวนับ/สถานะ/การจอง) · X4 ส่งซ้ำ (consumer event เดิม 2 รอบ/พร้อมกัน = ผลครั้งเดียว) · X5 งานตามเวลา 2 รอบซ้อน = ครั้งเดียว · X6 ข้อมูลเข้าอันตราย (CSV `csvRow` · เพดานนำเข้า · ไฟล์ mime/ขนาด) · X7 endpoint สาธารณะ (rate limit `checkRateLimitDb` · token ≥128 บิตเก็บ hash · token ผิด = คำตอบเดียวกัน) · X8 PDPA (ยินยอม/optOut ตอนส่งจริง · log/payload ไม่มี PII) · X9 การกระทำอันตราย (confirm + เหตุผล · approval เกินเพดาน · audit) · X10 ความลับ/ไฟล์ (ไฟล์ส่วนตัวผ่าน route ตรวจสิทธิ์+หมดอายุ · ไม่มีความลับใน DTO/RSC)

---

## 2. วิธีทำต่อใบ (ผู้คุม · ห้ามสลับขั้น)

| ขั้น | ทำอะไร |
|---|---|
| 1 | อ่านแถวใบใน MASTER-PLAN §4 + § ที่อ้างในแบบ + CC · **เปิดโค้ดจริงที่จะแตะ** (ชื่อ/บรรทัดอาจเลื่อนหลังใบก่อน · โค้ดชนะเอกสาร) |
| 2 | เขียนใบสั่ง «ledger/svc-briefs/svc-brief-<wo>.md» (ไฟล์เจ้าของ · สัญญาฟังก์ชัน · เกณฑ์รับ · ชุด regression · ห้ามอะไร) — สั้น ชี้ไปที่ MASTER-PLAN/CC แทนการคัดลอก |
| 3 | เขียนข้อสอบ «scripts/qc-svc-<wo>.mts» (+ ฉากภาพใน «scripts/visual-svc.mts» ถ้ามีจอ) → รันผ่าน iso → แดง/SKIPPED ถูกเหตุผล → commit `test(svc): <wo> oracle N ข้อ` |
| 4 | ปล่อย builder ในเลนว่าง (worktree «shark-svc-lN» · reset เป็น tip ของ `session/svc` ก่อน) — prompt สั้น: "อ่านใบสั่ง + CC · ห้าม build/commit · รายงานต่อข้อ" |
| 5 | ใบเข้ม: ปล่อยผู้ตรวจ 2 ตัวแยกกัน · ใบเบา: ผู้ตรวจ 1 ตัวหรืออ่านเอง → BLOCKER กลับ builder (วนจนหมด) |
| 6 | รับงาน: reseed (ถ้าใบเขียนฐาน) → ข้อสอบใบ + ชุดโมดูลที่แตะ + smoke **ผู้คุมรันเอง** → typecheck + fitness 2 โหมด → (มีจอ) build QC ผ่าน iso + ภาพ 1 ใบ/จอ → PARITY → (perf) วัดตามเกณฑ์ |
| 7 | merge เข้า «session/svc» (merge ด้วย SHA ตรง ไม่ใช้ FETCH_HEAD) · wo-notes «ledger/wo-notes/svc-<wo>.md» (ผล · X ที่เกี่ยว · หนี้) · แก้ §3 · บันทึก §4 ถ้ามีมติ · `tg "📊 SVC · NN% (x/53)"` · บรรทัดเดียวใน memory โปรเจกต์ |
| ปิดเฟส | ด่านเต็มตาม §1.4 (G1/G2/G3) เป็น unit เดียว · ชุด UAT · แจ้งเจ้าของด้วย tg % + จุด U ใน MASTER-PLAN §7 |

---

## 3. สถานะสด (⬜ ยังไม่เริ่ม · 🔄 กำลังทำ · 🧪 รอผู้คุมรับ · ✅ รับแล้ว · ⏸ รอของภายนอก) — 13/53 = 25%

| ใบ | ชื่อสั้น | ตรวจ | เลน | สถานะ | commit | หมายเหตุ |
|---|---|---|---|---|---|---|
| R0.0 | เตรียม RUN | — | ผู้คุม | ⬜ | | รอ POS 100% |
| R0.1 | migration svc_r0 | เข้ม | | ✅ | 125f52cd | 71/71 · 2 ผู้ตรวจ |
| R0.2 | seed + visual + smoke | เบา | | ✅ | f76ef28a | 48/49 · V-6 ภาพจริงรอ QC server (ใบ UI แรก) |
| R0.3 | เครื่องยนต์ค่าตั้ง | เข้ม | | ✅ | ffe9d12b | 94/94 · 2 ผู้ตรวจ + ยืนยันซ้ำ (BLOCKER 2 ปิด) |
| R0.4 | หน้าค่าตั้งจากทะเบียน | เบา | | ✅ | f49d9ce5 | 45/46 · ภาพ VIS-2 รอ build QC |
| R0.5 | ศูนย์เชื่อมต่อ | เข้ม | | ✅ | c3ceca84 | 68/69 · 2 ผู้ตรวจ · ภาพ P-4 รอ build QC รวม |
| R0.6 | QR + ตรวจสลิปกลาง | เข้ม | | ✅ | 7dc101fe | 77/77 · 2 ผู้ตรวจ (BLOCKER ถอนสิทธิ์ปิด) |
| R0.7 | LINE + notifyCustomer | เข้ม | | ✅ | 859d2de8 | 89/89 · 2 ผู้ตรวจ · ชุดแก้ 13 ข้อ |
| R0.8 | แกนห้อง + RoomOccupancy | เข้ม | | ✅ | e1325629 | 95/95 · 2 ผู้ตรวจ + ยืนยันซ้ำ (BLOCKER จองเกินปิด) |
| R0.9 | ผังห้องร่วม | เบา | | ✅ | 2b8a2413 | 55/56 · V-1 ภาพรอ build รวม |
| B.0 | migration svc_b + defs จองคิว | เข้ม | | ✅ | 270897ec | 164/165 (G-9 = หนี้ D3) · 2 ผู้ตรวจ · _fallback คงพฤติกรรมรุ่นแรก |
| B.1 | เวลาต่อช่าง + ช่าง↔บริการ | เบา | | ✅ | 5947107e | 60/60 · _fallback เหมือนรุ่นแรก |
| B.2 | ตัววางคิว planDay | เข้ม+perf | | ✅ | 480ca1de | 93/93 · 2 ผู้ตรวจ · fuzz 20k · p95 worst ~11 ms |
| B.3 | หาเวลาว่าง v2 | เข้ม | | ✅ | e74813d0 | 75/75 · 2 ผู้ตรวจ + ยืนยันซ้ำ 2 รอบ (BLOCKER 2 + MAJOR 6 ปิด) |
| B.4 | เช็กอิน · walk-in · บัตร P/A · สาย/ไม่มา | เข้ม | | ✅ | f62daaf8 | 86/87 · 2 ผู้ตรวจ + ยืนยันซ้ำ (BLOCKER 2 + MAJOR 5 ปิด) |
| B.5 | จอคิววันนี้แถวเดียว | เบา | | ✅ | af645cb7 | 51/71 · H/E/V รอ QC server SVC_QC_CLOCK=1 · Q-2 ฉากล้าง minBreakMin (ทาง ค) |
| B.6 | ตู้/ทีวี/หน้าบัตร | เข้ม | | ✅ | 490c4437 | 62/72 · 2 ผู้ตรวจ + ยืนยันซ้ำ (MAJOR 1 + MINOR 7 ปิด · probe hold 21 breach 0) · H/V รอ QC server/build รวม |
| B.7 | จองออนไลน์ + ลิงก์จัดการนัด | เข้ม | | ✅ | 8ea089eb | 96/103 เต็มรวม G · 2 ผู้ตรวจ (MAJOR 2 + MINOR 8 ปิด · probe breach 0) · H/V รอ QC server · ต้องเปิดพร้อม B.8 |
| B.8 | มัดจำรุ่นแรก | เข้ม | | ✅ | ebe2c1fc | 89/94 + r0.6 77/77 ซ้ำ · 2 ผู้ตรวจ (BLOCKER ปลุกนัดยกเลิกช้า + V1–V22 ปิด · probe 30/0) · FORFEIT_PENDING ร้านตัดสิน · ยกเว้นสมาชิกจากตัวตนยืนยันเท่านั้น · หนี้: คืนส่วนเกิน · ไม่มี POS ⇒ audit-only (B.12) |
| B.9 | แจ้งเตือน + ผูก LINE | เข้ม | | ✅ | 96521c79 | 60/62 เต็มรวม G · 2 ผู้ตรวจ (BLOCKER สวมเบอร์ยึด LINE + MAJOR 1 ปิด · probe breach 0) · V-1 รอ build |
| B.10 | จบงาน→บิลพัก POS + ค่าคอมฯ | เข้ม | | ✅ | 20e5421c | 61/64 · 2 ผู้ตรวจ (Q1–Q11 ปิด · probe 27 HOLD 0 BREACH) · POS 2 จุด · void บิลจ่ายแล้วฝั่งจองคิว · หนี้: เปิดบิลใหม่หลัง void · ชุด/สูตร/ชั่ง = BAD_INPUT |
| B.11 | จอตั้งค่าจองคิว + สิทธิ์ | เบา | | ✅ | 64e6c184 | 84/95 · V-2 ภาพรอ build รวม |
| B.12 | ปิด B1 (G1) ร้านตัดผม | — | ผู้คุม | ⬜ | | U1 |
| B.13 | ทรัพยากร | เข้ม | | ⬜ | | |
| B.14 | ปฏิทินลากย้าย | เบา | | ⬜ | | |
| B.15 | คู่รัก/กลุ่ม | เข้ม | | ⬜ | | |
| B.16 | ความชอบลูกค้า | เบา | | ⬜ | | |
| B.17 | waitlist + ไม่มาซ้ำ | เบา | | ⬜ | | |
| B.18 | ปิดเฟส B + แก้สเปก | — | ผู้คุม | ⬜ | | G3 คู่ D.20 · U3 |
| D.0 | migration svc_d | เบา | | ✅ | b113a1f4 | 107/108 + ORACLE-EDIT · ดัชนีหนี้ครบ |
| D.1 | กฎหมาย + สูตรเงิน (pure) | เข้ม | | ✅ | ffe9d12b | 122/122 (pure e6213cde + defs) · 2 ผู้ตรวจ |
| D.2 | facade บัญชีหอ | เข้ม | | ✅ | bbf544fe | 78/78 · 2 ผู้ตรวจ + ยืนยันซ้ำ (BLOCKER 1 + MAJOR 8 ปิด) |
| D.3 | VAT + ใบกำกับ | เข้ม | | ✅ | 8ab8795d | 85/85 (เต็มรวม G) · 2 ผู้ตรวจ 2 รอบ (MAJOR 4 + MINOR 8 ปิด · probe 30/30) · J4 คำถามบัญชีค้าง |
| D.4 | นำเข้า Excel | เข้ม | | ✅ | d26c55f9 | 117/119 ทรีรวม (G-2 = d.6 S-5 ฐาน) · 2 ผู้ตรวจ + ยืนยันซ้ำ (BLOCKER 3 รวม XLSX ค้าง Y1 ปิด) · probe-d4-b 68/0 · migration svc_d4 |
| D.5 | ผู้เช่า/สัญญา/ประกัน | เข้ม | | ✅ | b79f2ef5 | 110/115 · 2 ผู้ตรวจ + ยืนยันซ้ำ · M-11 ORACLE-EDIT (RETRY_SAFE ใต้โหลด) |
| D.6 | มิเตอร์ + จดมือถือ | เบา | | ✅ | d5f50b74 | 87/89 · V-1/V-2 ภาพรอ build รวม |
| D.7 | ค่าน้ำไฟทุกโหมด + หน้ากฎหมาย/VAT | เข้ม | | ✅ | b0575e00 | 107/109 · 2 ผู้ตรวจ + ยืนยันซ้ำ (BLOCKER 2 + MAJOR 8 ปิด) · V-1/V-2 ภาพรอ build รวม |
| D.8 | รอบบิลรายเดือน | เข้ม+perf | | ✅ | 1dc227b0 | 97/109 · 2 ผู้ตรวจ 2 รอบ (BLOCKER 5 + MAJOR 9 ปิด) · probe-d8-b 25/25 + b2 22/22 · P-2/P-3 perf ผ่านตอนเครื่องว่าง · V รอ build รวม |
| D.9 | LINE ผู้เช่า + พอร์ทัลจ่าย | เข้ม | | ✅ | ba53e630 | 86/89 (S-1/V-1/V-2 skip) · 2 ผู้ตรวจ (W1–W13 ปิด) · probe-d9-b 28/0 · notifyCustomer precheck |
| D.10 | ตรวจสลิป/รับเงินหอ | เข้ม | | ⬜ | | |
| D.11 | เตือน/ทวง/ค่าปรับ | เข้ม | | ✅ | 624cf584 | 99/100 · 2 ผู้ตรวจ (BLOCKER ยกเว้นค่าปรับแล้วยังส่งในบิล + L1–L13 ปิด · probe 33/33) · perf 100 ห้อง×12 งวด ok · หนี้ L7 เพดานเตือน hardcode |
| D.12 | ย้ายออก/คืนประกัน | เข้ม | | ⬜ | | |
| D.13 | ผังห้องหอ + ตั้งนโยบาย/สิทธิ์ | เบา | | ✅ | 39d926de | 88/98 · 2 ผู้ตรวจ + ยืนยันซ้ำ (MAJOR 3 ปิด · probe BREACH 0) · V-2 รอ build รวม |
| D.14 | AI อ่านมิเตอร์ | เบา | | ⬜ | | |
| D.15 | ปิด D1 (G2) หอขึ้นใช้ | — | ผู้คุม | ⬜ | | ต้องผ่าน J3 · U2 |
| D.16 | แจ้งซ่อม→บอร์ดงาน | เบา | | ⬜ | | |
| D.17 | ประกาศ | เบา | | ⬜ | | |
| D.18 | พัสดุ | เบา | | ⬜ | | |
| D.19 | รายงานหลักหอ | เบา | | ⬜ | | |
| D.20 | ปิดเฟส D (G3) | — | ผู้คุม | ⬜ | | U4 |
| C.1 | ตัวต่อตรวจสลิปเจ้าแรก | เข้ม | | ⬜ | | รอชื่อเจ้า+คีย์ (J2) |
| C.2 | LINE เครื่องจริง + คู่มือร้าน | เบา | | ⬜ | | |
| C.3 | สุขภาพตัวต่อ | เบา | | ⬜ | | |

เฟสเลื่อน (ไม่นับใน %): H.0–H.10 · H2.1–H2.3 · K.1–K.2 · S.1 · P.1 · CO.1–CO.2 · RP.1–RP.2 · API.1–API.2 · KT.1 · X-POS.1 · X-MIG.1 — ⬜ ทั้งหมด (รายละเอียด MASTER-PLAN §6.1)

### 3.1 ด่านเต็ม
| ด่าน | เมื่อ | ผล | log |
|---|---|---|---|
| G1 | B.12 | ⬜ | |
| G2 | D.15 | ⬜ | |
| G3 | B.18 + D.20 | ⬜ | |

### 3.2 หนี้ (ข้อที่ผ่านไม่ได้ · เหตุผล · ใบที่จะปิด)
| ใบ | หนี้ | เหตุผล | ปิดใน |
|---|---|---|---|
| — | — | — | — |

---

## 4. บันทึกเหตุการณ์ · มติเทคนิค · ORACLE-EDIT (ต่อท้ายเท่านั้น · รูปแบบ `YYYY-MM-DD HH:MMZ · ใบ · เรื่อง`)

- 2026-10-27 · แผน · เขียน SVC-MASTER-PLAN / SVC-CORE-CONTRACT / SVC-RUN / SVC-RESUME / SVC-KICKOFF-PROMPT · ยังไม่แตะโค้ด · รอ POS 100%

- 27 ต.ค. 2569 · มติเจ้าของ: **อนุญาตแตะ POS จุดที่ 3 = X-POS.1** (รวมตรวจสลิป POS `PosPaymentSlip`/`slip-verify.ts` เข้ากับ `PaymentSlip` กลาง เพื่อจับสลิปใช้ซ้ำข้าม POS↔หอ) · ทำหลังลูกค้ารายแรกใช้จริง (ใบเลื่อนตามแผน) · รวมเป็น 3 จุดที่อนุญาตแตะ POS: บิลพักผูกงาน · ค่าคอมฯ ตามผู้ให้บริการ · X-POS.1

- 27 ต.ค. 2569 14:3xZ · **R0.0 เสร็จ** (ผู้คุม): POS 100% ยืนยัน (`session/pos` 940e3aca · ยังไม่ลง main) ⇒ ฐาน `session/svc` = 940e3aca + commit เอกสาร SVC · เลน «shark-svc-l1/l2/l3» (branch wip/svc-lN · node_modules bind จากทรีหลัก) · Neon `wo-svc-qc` (br-late-pond-ao7wm6tn · ep-mute-scene · parent QC4) + `.env.qc-svc` (gitignored) + `scripts/qc-svc.sh` (ล็อก /tmp/shark-gate-svc.lock · POS_QC_ALLOW_HOST=ep-mute-scene) · **btree_gist 1.8 ใช้ได้** (CREATE ใน tx แล้ว rollback) ⇒ ใช้ EXCLUDE ตาม CC §5.2 ไม่ต้องทางสำรอง · baseline ดู `ledger/wo-notes/svc-baseline-*.txt` (12/12 เขียว · ชุด POS 4 ชุดติดด่านเขียน QC4 = หนี้ SVC-D1) · Prisma 7: สคริปต์ probe ต้องใช้ adapter/pg
- 27 ต.ค. ~16Z · **ข้อสอบวันแรก commit แล้ว** (บน branch เลน): R0.1 63 ข้อ (b4527004 · l3) · B.2 74 ข้อ (8b3c232a · l1) · D.1 104 ข้อ (e5cf9651 · l2) — ผู้คุมรันซ้ำ แดง/SKIP ถูกเหตุผลทั้ง 3 · ผู้เขียนข้อสอบพิสูจน์ฝั่งบวกด้วยตัวอ้างอิงทิ้งได้ + จับกลายพันธุ์ได้ · builder 3 ตัวเริ่มแล้ว
- มติผู้คุม (รับตามใบสั่ง): B.2 §7 ข้อ 1–11 (ลำดับคิว 3 ชุด = queueOrder×backfill · ช่องว่างนับเมื่อ ≥10 นาที · buffer กับพักขั้นต่ำใช้ค่ามาก · ±ETA = min(30,max(5,ceil(0.15·รอ/5)·5)) · `overrunExtendMin` ค่าเริ่ม 5 ⇒ B.0 เพิ่ม def · "12×120" = นัดรวม 120 · ย้ายช่างมือ = B.5 · "ข้างหน้า N คิว" เคาะใน B.5/B.6) · D.1: เงินสตางค์จำนวนเต็ม ทศนิยม throw · อัตราต้นทุนปัดลง · VAT ต่อบรรทัด (ตรง computeTotals บัญชี V2) · คำขู่/คำต้องห้าม/หักค่าเสื่อมปกติ บล็อกทุกโหมด · หอนักศึกษา/โรงแรม โหมดเริ่มเข้มงวด · คีย์ค่าตั้งหอใช้ prefix `rooms.`
- ส่งที่ปรึกษากฎหมาย (J3) — ค้างตอบ: คืนประกัน 7 วันปฏิทิน/ทำการ/14 วันเมื่อมีหัก · วิธีคิด "อัตราที่การไฟฟ้าเรียกเก็บ" (บิล÷หน่วย ปัดลง · โหมดตารางยังไม่รวม VAT/ค่าบริการ กฟภ.) · เพดานค่าปรับ + วิธีนับวันผ่อนผัน · ค่าปรับมี VAT ไหม (เริ่ม NONE) · ฐาน 3 เดือนนับค่าห้องอย่างเดียว · บล็อกคำขู่ทุกโหมด · ห้องรายเดือนของโรงแรมเข้าข่ายไหม · ร่าง MANDATORY_CLAUSES
- หนี้แบบ (แก้ตอนทำจอ): ภาพ 05 LINE รวม "ค่าห้อง+ส่วนกลาง" บรรทัดเดียว ⇒ ต้องแยกบรรทัดเมื่อจด VAT (D-phase Flex/ใบเสร็จ) · ภาพ 04 "8 จาก 32 ห้อง" ควรเป็น 31 · ภาพ 03/README หน่วยห้อง 207 ไม่รวมในบิล กฟภ. · ภาพ 17 ผ่อนผัน 0 วัน vs ค่าเริ่ม 3 (fixture ใช้ 0)
- 27 ต.ค. ~16:3xZ · ✅ **R0.1 รับแล้ว** — merge 125f52cd (lane l3 cf0d02fb) · ข้อสอบ 71/71 (ORACLE-EDIT: env type · +E-9/E-10 host ปลอม/DIRECT ว่าง · +K-1 FK · +C-1..3 CHECK · +M-6/7 svc_r0b) · regression hotel ×3 + booking-race เขียว · tsc · fitness 53/53 ×2 · ผู้ตรวจ 2 ตัวไม่มี BLOCKER · แก้ตาม SHOULD: ด่าน host ที่ hostname · DIRECT ว่าง exit 4 · migration svc_r0b CHECK end>start · **มติ: วิธี migration ของ SVC = migrate diff + deploy (ห้าม migrate dev) จนรวม HR** · ส่งต่อใบหลัง `ledger/wo-notes/svc-r0.8-carry.md` · tsc ต้อง ISO_MEM=9000M NODE_OPTIONS=--max-old-space-size=7168
- B.2 builder เสร็จ (74/74 · p95 ~2 ms · ไฟล์เดียว planner.ts) → ผู้ตรวจ 2 ตัว (กติกา/fuzz) กำลังตรวจ
- 27 ต.ค. ~17Z · ผู้ตรวจ B.2 ×2 + D.1 ×2 ครบ → ส่งแก้รอบเดียว (ORACLE-EDIT + builder คู่กัน):
  - **B.2 มติ**: นัดที่ยังไม่เริ่ม/ไม่ถูกปล่อย start = max(startAt, now, จบก่อนหน้า+gap) (ถือ BLOCKER — walk-in แซงลูกค้านัดที่รออยู่) · ANY ย้ายช่างเคารพ gap ก่อน/หลัง + safety + ข้ามช่างโควตาเต็ม · serviceId ไม่รู้จัก ⇒ UNPLACED `UNKNOWN_SERVICE` · STAFF_UNAVAILABLE ใช้ startAt เดิม · planner เรียง+รวมหน้าต่างเอง · ธง `overWindow` · perf worst-case p95 ~12 ms
  - **D.1 มติ**: ยอดติดลบ ⇒ `NEGATIVE_SATANG` (BLOCKER) · VAT ซ้อนค่าน้ำไฟ: bill = รวม VAT · จด VAT ไม่รวม ⇒ อัตรา floor(bill×100/107÷หน่วย) · gross ผู้เช่ารวม ≤ บิล ทุกโหมด (BLOCKER) · ตัวตรวจค่าผิด ⇒ BLOCK `INVALID_INPUT` · DEDUCTION เฉพาะ DAMAGE+หลักฐาน ≥1 · mode ไม่รู้จัก ⇒ STRICT · ข้อบังคับสัญญาต้องตรง textTh · คำต้องห้าม NFKC+ตัดสัญลักษณ์+คำพ้อง · ตัวตรวจ `LATE_FEE_CAP` · RENT EXEMPT เสมอ · needsApproval รวม legal · เหตุผลนอกขอบเขต ≥10 ตัวอักษรจริง · `OVERFLOW` ที่จุดคูณ · ยืนยัน 7.5 ล้านชุด: บิลหอ = ใบแจ้งหนี้บัญชี V2 ทุกสตางค์ (ยอดไม่ติดลบ)
  - ส่งต่อ: D.2 บรรทัด = qty 1 × amountSatang · D.7 params กฎหมายระดับแพลตฟอร์มเท่านั้น + OUT_OF_SCOPE ต้องหลักฐานเมื่ออยู่ในขอบเขต · D.8 minimum=null เมื่อปิด · เจ้าของควรรู้: เศษวัน DIV_30 เดือน ก.พ. ได้ ฿4,350 ไม่ใช่เต็มเดือน (ค่าตั้ง) · คำพ้องต้องห้ามส่ง J3
- 27 ต.ค. ~18Z · ✅ **B.2 รับแล้ว** merge 480ca1de · 🔄 **D.1 ส่วน pure รับแล้ว** merge e6213cde (defs/rooms.ts ทำต่อหลัง R0.3) · tsc ทรีรวม exit 0 · fitness 53/53 · หนี้: settleDeposit ยังไม่ถอด VAT (ใบย้ายออก) · D.8 ส่ง billedRooms
- 27 ต.ค. ~18:3xZ · ✅ **R0.2 รับแล้ว** merge f76ef28a · 48/49 (V-6 ถ่ายภาพจริงต้อง build QC server — ทำในใบ UI แรก) · ORACLE-EDIT env type · tsc 0 · seed รอบ 2 ไม่เขียน · ร้านอื่น 34 ร้านไม่เปลี่ยน
- 27 ต.ค. ~19–20Z · ผู้ตรวจครบ: **R0.5** ไม่มี BLOCKER → แก้ 12 ข้อ (create:true กันเขียนทับ · owner-only ขยาย unitAccess · CONNECTED ก่อน ERROR · รีเซ็ตตัวนับเมื่อถอด · AbortSignal ใน callIntegration · failed event เฉพาะเคย CONNECTED · handle ไม่มี meta ⇒ NOT_READY · AAD ผูก tenant+id · คีย์หลายบรรทัด · test race เวอร์ชันคีย์ · purge เคารพ deadline · เมนู/การ์ดธนาคาร/ภาษาคน) · หนี้: ช่องค้น · แถบโควตา · ms · ข้อความ LINE เดือนนี้ · index IntegrationCallLog.at
- **R0.8** BLOCKER: ห้องที่ถือการจองถูก OOO/OUT_OF_ORDER/MONTHLY ⇒ ตัวนับลืม ⇒ ขายเกิน → แก้: นับการจองทุกแถวเป็นภาระประเภท×คืน + occupancy ไม่ใช่โรงแรม · เตือนเมื่อปิดซ่อมห้องที่มีการจอง · ปล่อยห้องหลัง POS สำเร็จ · ตัวนับช่วงวัน = ห้องว่างตลอดช่วง + best-fit · backfill dry-run ไม่ล็อก · expireHolds batch 50 · RELEASE SAVEPOINT · P2028⇒ok:false · claimRoom requireRentMode · ORACLE-EDIT วันที่สัมพัทธ์ + ชนิด (tsc) · carry: backfill --apply ทุกร้านก่อนเปิด DORM/R0.9 · re-pack การจอง = เฟส H
- **R0.3** 72/72 รอผู้ตรวจ · D.1 defs/rooms.ts กำลังทำ (l2)
- **R0.3** ผู้ตรวจ: BLOCKER 2 (พิสูจน์บน QC) — (1) ผู้จัดการสร้างสายอนุมัติ MANAGER แล้วอนุมัติค่าเกินกฎหมายกันเอง (**ช่องโหว่แกนอนุมัติเดิมของแพลตฟอร์ม: MANAGER สร้าง policy ได้**) (2) คำขอค้างสมัย WARN อนุมัติหลังเปลี่ยนเป็น STRICT แล้วยังเขียน → มติ: apply ต้อง OWNER อนุมัติ (Membership สด) + ตรวจกฎหมายซ้ำโหมดปัจจุบัน + ด่าน 3–6 ซ้ำ + STALE · **approval policy create/update = OWNER เท่านั้น (แก้แกน)** · ล็อกกลุ่ม · ตรวจชั้นลึก · มติ (ก) ไม่ลบแถวที่มีเพราะเท่าชั้นบน · refsFor · effectiveFrom ย้อนหลังเฉพาะเจ้าของ · perf 50 คีย์ ≤40 SQL · resolveSettingsMany · หนี้: สรุปข้อเสนอในหน้าอนุมัติ/ปิดค่า PRIVACY (R0.4) · paymentProfileId ตรวจ tenant (R0.6)
- 27 ต.ค. ~23Z · ✅ **R0.5 รับ (ตรรกะ)** merge c3ceca84 · 68/69 · ภาพเทียบแบบ (P-4 + R0.2 V-6) ทำรอบ build QC รวมครั้งเดียวหลัง R0.3/R0.8 เข้า (ลดแย่ง RAM) · ด่าน grantStaffAccess (คืนสมาชิกภาพผู้ถือคีย์) = รับ · หลังเครื่องรีสตาร์ต ~22Z เปิด agent ใหม่จากชุดแก้ /root/svc-runs/fix/*.md
- 28 ต.ค. ~00Z · ✅ **R0.8** merge e1325629 (conflict minute-jobs เก็บทั้ง 2 งาน) · ✅ **R0.3 + D.1 defs** merge ffe9d12b (conflict labels/permissions เก็บทั้งสองฝั่ง) · ผู้ตรวจยืนยันซ้ำด้วยสคริปต์จริง: R0.8 B-1/S-1/S-2/S-4 ผ่าน · R0.3 B1/B2 + ทางอ้อม 9 ฉาก ผ่าน (ชุดควบคุมเขียนได้) · ORACLE-EDIT qc-svc-r0.3 ลำดับล้าง roomOccupancy ก่อน hotelRoom (S-6 ของ R0.8 จับได้) · ทรีรวม: r0.1 71 · r0.2 48/49 · r0.3 94 · r0.5 68/69 · r0.8 95 · d.1 122 · approval ×3 · automation · webhook เขียว · fitness 53 · tsc 0
- มติ/หนี้เพิ่ม: **แกนอนุมัติ policy create/update/toggle = OWNER** (ช่องโหว่เดิมของแพลตฟอร์ม — แจ้งเจ้าของแล้ว) · audit ค่าตั้งเขียนใน tx (ต่างใบสั่ง = รับ) · CC: R0.4 ส่งเฉพาะคีย์ที่แตะ + สวิตช์ "ตามชั้นบน" · นับเจ้าของควรกรอง acceptedAt (หนี้) · R0.9: งานเก็บกวาด occupancy ค้างหลังเช็กเอาต์ + setRoomTypeRent คืน affected
- 28 ต.ค. ~00:3xZ · ⏸ **พัก RUN** ตามเจ้าของ (ย้ายบัญชี) · หยุด agent 3 ตัว (R0.6 builder · R0.7/B.0 ข้อสอบ) ก่อนมีไฟล์งาน · ไม่มี WIP ค้าง · R0.6 ข้อสอบอยู่ wip/svc-l3 5608461a (push) · จุดต่อ = SVC-RESUME บล็อก ⏸ PAUSE
- 28 ต.ค. ~16Z · 🔧 **แยก node_modules ของเลน l2** (`/root/projects/shark-svc-nm-l2` bind เข้า l2) — prisma generate จาก schema ใบ migration (B.0) ทำ client ร่วมพังให้เลนอื่น (assertRegistryComplete) · กติกาใหม่: **เลนที่ทำใบ schema ต้องมี node_modules แยก** · client ร่วม (ทรีหลัก) generate จาก schema ของ session/svc เท่านั้น · **แก้ 28 ต.ค. ~16:3xZ: bind mount ลามข้ามเลน (shared propagation) ⇒ เปลี่ยนเป็น symlink**: l1/l3 → /root/projects/shark-svc/node_modules · l2 → /root/projects/shark-svc-nm-l2 (ไม่หายหลังรีบูต · ห้ามใช้ mount --bind กับเลน SVC อีก)
- 28 ต.ค. ~17Z · ✅ **R0.6** merge · 77/77 · ผู้ตรวจ: BLOCKER Membership ไม่กรอง acceptedAt (ถอนสิทธิ์แล้วยังอนุมัติสลิปได้) — แก้ทั้ง slip-verify + core/settings · ข้อสอบชุดแก้เห็นแดงก่อนโค้ดแก้ (ดี) · carry consumer B.8/D.10 อยู่ท้าย `ledger/svc-briefs/svc-brief-r0.6.md` §8
- baseline เพิ่ม: qc-member-m3.2/m3.4 ล้มบน qc-svc ทั้งทรีหลัก (TypeError role null) = ข้อมูล QC ไม่ใช่ SVC → หนี้ SVC-D2 (seed member บน qc-svc ก่อนใช้เป็น regression)
- qc-pos-p3.5 ข้อ ST2 (ห้าม migration ใหม่นอก P3.5) ฟ้อง svc_r0/r0b/b = ข้อสถิตเก่าของ POS → หนี้ SVC-D3 (ให้ชุด p3.5 ยอม `_svc_*`)
- 28 ต.ค. ~16:10Z · เครื่อง (container) รีสตาร์ตครั้งที่ 2 · builder 3 ตัวหยุด (R0.7 ชุดแก้ · B.0 ชุดแก้ · R0.4) · commit ข้อสอบรอบแก้กันหาย (R0.7 75584c75 · B.0 1ceaca47) + push wip/svc-l1..3 · เปิด builder ใหม่ทำต่อจาก working tree · symlink node_modules รอดรีสตาร์ต ✓
- 28 ต.ค. ~17Z · ✅ **B.0** merge 270897ec · 164/165 (G-9 p3.5 ST2 = หนี้ D3) · ⚠️ ยังไม่ regenerate client ชุดกลาง (l1/l3 ยังใช้ schema ก่อน B.0 — regenerate หลัง R0.7/R0.4 rebase) · tsc ใน l2 แดง TS7006 2 จุด (DealBoard.tsx · ReconcilePanel.tsx) สงสัยชุด node_modules แยก — ตัดสินด้วย tsc ทรีรวมหลัง regenerate
- 28 ต.ค. ~17:3xZ · ✅ **R0.7** merge 859d2de8 · 89/89 · ชุดแก้หลังผู้ตรวจ 13 ข้อ (retry key LINE · timeout 10s · webLink/vars · pending dedupe · QUOTA · rich menu merge · mask รหัสผูก · 9 SQL/ครั้ง) · ด่านทรีรวม (regenerate client + tsc + ชุด SVC ทั้งหมด) ทำหลัง R0.4 เสร็จ · node_modules แยกเพิ่ม nm-l1 (l1 อยู่บนฐาน B.0 แล้ว)
- 28 ต.ค. ~18:3xZ · ✅ **R0.4** merge f49d9ce5 · 🟢 **ด่านทรีรวม** (หลัง R0.6/R0.7/B.0/R0.4): ข้อสอบ SVC 11 ชุด + hotel×3 booking×2 approval payment chat-security เขียว · fitness 53 · **tsc 0 บน node_modules จริง** (TS7006 ใน l2 = ผลของชุดแยก) · ORACLE-EDIT bc1c5a1e: B.0 หมวด P ตรวจเฉพาะตอนรับใบ (SKIP เมื่อใบหลังแตะไฟล์) · R0.7 N-16 ใช้คีย์แม่แบบที่ไม่มีจริง
- 28 ต.ค. ~19Z · ✅ **D.0** merge b113a1f4 (12 ตารางหอ · ดัชนีหนี้ STAY/idempotencyKey/holdExpiresAt/at/buildingId · AccountDocSource DORM) · ORACLE-EDIT: d.0 O-10 RESTRICT=23001 (PG18) · r0.8 S-6 ข้าม d.0 (ลบตั้งใจให้ล้ม) 9fbd6464 · client ชุดกลาง regenerate แล้ว (l3 ใช้ได้)
- 28 ต.ค. ~19:3xZ · ✅ **B.1** merge 5947107e · 60/60 (G regression booking/queue/hr ในข้อสอบ) · ORACLE-EDIT ST-1 ตรวจเฉพาะตอนรับใบ · ข้อสังเกต: ข้อสอบ 'แตะเฉพาะไฟล์ของใบ' ทุกใบต้องเป็น accept-time (กติกาใหม่ผู้เขียนข้อสอบ)
- 28 ต.ค. ~17:2xZ · D.2 ข้อสอบ+ใบสั่ง 06b51d29 (wip/svc-l2 · 63 ข้อ · 13 เขียว PC-1/PC-2 positive control · 50 แดงถูกเหตุ) · builder เริ่ม · baseline regression 13 ชุดรันบนทรีหลัก → /root/svc-runs/d2-reg-baseline.txt · J4 ผู้ตรวจบัญชี: บัญชี 2140 เงินประกันผู้เช่า (lazy) · เลขรับประกัน = เลข JV · VAT ไม่ตรงสมุด ⇒ ปฏิเสธ
- 28 ต.ค. ~17:3xZ · ภาพเทียบแบบ R0.2/R0.4/R0.5 ถ่ายแล้ว (build iso ผ่าน) · R0.5 ตรงโครง · R0.4 ผ่านแค่โครง — ส่วนต่างจดใน wo-notes/svc-r0.8-carry.md ให้ B.11/D.7/D.13 · ส่ง tg 3 ภาพ · oracle 3 ใบรันซ้ำกับ QC_BASE · l1 B.3 ข้อสอบเริ่ม
- 28 ต.ค. ~22:3xZ · ✅ **R0.9** รับ (02ee8474 → merge 2b8a2413) · ผู้คุมรัน oracle ซ้ำ 55/56 (V-1 ภาพรอ build รวมรอบหน้า) · ทรีรวม: r0.2 48/49 (ORACLE-EDIT D-14 ไม่นับฉาก SvcQcScene) · r0.8 95/95 · smoke 6/6 · tsc 0 · ตรวจเบา: sweepStaleOccupancy ปิดเฉพาะ refType HotelReservation ที่การจองไม่ใช่ BOOKED/CHECKED_IN (ข้อเท็จจริงเดียวกับ HOTEL_REF) · หนี้: G-1 สุ่มแดงได้เมื่อคิว event ค้างมาก (drainAll งบ 20 วิ) · ภาพ oracle r0.2/r0.4/r0.5 กับ QC_BASE: 48/49→เขียว · 46/46 · 69/69 · 14/53
- โควตา weekly ของ agent ชน ~19Z (รีเซ็ต 21Z) → ปลุก D.2 builder + B.3 ผู้เขียนข้อสอบต่อหลังรีเซ็ต · D.2 builder 63/63 → ผู้ตรวจเงิน 2 คนแยก + ผู้คุมรัน regression · B.3 ข้อสอบ dcf9cc05 (65 ข้อ) → builder · l3 D.6 ข้อสอบ
- 29 ต.ค. ~00:2xZ · ✅ **D.2** (e99f9be2 → merge bbf544fe) · ผู้ตรวจ A+B: BLOCKER 1 (คีย์กันซ้ำข้ามหน่วยยิงพร้อมกัน ⇒ สลิปลงเงิน 2 ครั้ง) + MAJOR (ถอยปิดประกันไม่ได้ · ประกันผู้เช่า A หักใบ B · หลายสมุด/ย้ายสมุด · ใบเพิ่มหนี้เก็บไม่ได้ · ลด/เพิ่มหนี้บนใบยกเลิก · กลับรายการ JV หอทางทั่วไป) → F1–F8 · รอบยืนยัน B: ปิดครบ + N1 (ถอยในช่วงล็อกข้อมูล) → F9 · ORACLE-EDIT 63→78 · ผู้คุม: 78/78 + regression 13 ชุดเท่าฐาน (acc-v2 security/coa/journal + crm-c2.7 แดงตั้งแต่ฐาน = SVC-D4) · ล็อกระดับร้าน (หนี้ N2: D.8 ออกบิลทีละใบ) · ชุดแก้ /root/svc-runs/fix/d2.md
- ✅ **D.6** (68924c86 → merge d5f50b74 · conflict fitness edges รวมทั้งสองฝั่ง) · ผู้คุมรันซ้ำ 87/89 (V-1/V-2 ภาพรอ build รวม — ต้อง reseed → ฉากผัง → ฉากมิเตอร์ ก่อนถ่าย · ผู้ใช้ owner + meter) · ค่ามิเตอร์ ≤ int4 · ทรีรวม: d.2 78/78 · r0.9 55/56 · smoke 6/6 · tsc 0 · **16/53**
- เลน: l1 B.3 75/75 หลังแก้ G1–G6 → ผู้ตรวจ B รอบยืนยันด้วย probe เดิม · l2 D.5 ข้อสอบ · l3 D.7 ข้อสอบ
- 29 ต.ค. ~01Z · ✅ **B.3** (2a016837 → merge e74813d0) · ผู้ตรวจ A (อ่านโค้ด) + B (ยิงหลายโพรเซสจริง): BLOCKER 2 (key เดียวพร้อมกัน ⇒ FULL ทั้งที่จองแล้ว · ลูกค้าใหม่ ≥12 พร้อมกันในสาขาเชื่อมสมาชิก ⇒ pool ค้าง P2028) + MAJOR (ส่งซ้ำหลังปล่อยได้ "จองแล้ว" · key ข้ามสาขาได้ id สาขาอื่น · รับมัดจำบนนัดที่ถูกปล่อย · ปลุกนัดซ้อน · P2002 ลูกค้าใหม่) → G1–G6 · รอบยืนยัน: ปิดครบ (probe 6/6) + N-1 (ยืนยัน PENDING แข่งปล่อยช่อง 2/10) → G7 CAS ทุกทาง → probe 0/60 · ORACLE-EDIT 65→75 · ผู้คุม 75/75 · ทรีรวม: b.3 74/75 (ST-1 SKIP ตรวจตอนรับใบเท่านั้น) · b.2 93/93 · smoke 6/6 · tsc 0 · หนี้ใน /root/svc-runs/fix/b3.md (Customer ค้าง PDPA → B.11 · คืนเงิน POS เมื่อแพ้ claim/เงินสดไม่มีกะ → B.8 · WARN ผิดเรื่อง → B.5 · bufferMin snapshot → B.4) · **17/53**
- เลน: l1 B.4 ข้อสอบ · l2 D.5 builder (ข้อสอบ 97 · เลน merge ทิป D.6+B.3 แล้ว) · l3 D.7 builder (ข้อสอบ 96 · coTenants = {occupants, vehicles} ตาม D.5) · ชุดคำถามกฎหมาย/PDPA/บัญชี ledger/wo-notes/svc-legal-questions.md
- 29 ต.ค. ~03:1xZ · ✅ **D.7** (4f49f19b → merge b0575e00) · ผู้ตรวจ A+B: BLOCKER 2 (ตัวตรวจใช้ค่าตั้งระดับกลุ่มแต่คิดเงินด้วยค่าตั้งรายแถว · แถวที่การยอมรับสร้างจับขอบเขตบิล ⇒ STRICT ผ่านทั้งที่เก็บ ฿22,500 > บิล ฿19,824) + MAJOR (บิลซ้อนขอบเขต · นอกขอบเขตค้าง · STRICT ไม่มีบิลยอมรับได้ (กลับมติ §8.4) · TARIFF ไม่มีเพดาน · มิเตอร์รวมเฉลี่ยห้องว่างให้ผู้เช่า (ค่าเริ่มใหม่: ผู้ให้เช่าแบก) · ผสมมิเตอร์นับซ้ำ · ฟอร์มเลือกอาคารไม่ได้) → H1–H9 + N1 (หน้าส่ง fingerprint) · ORACLE-EDIT 96→109 · รอบยืนยัน B ปิดครบ · ทรีรวม: d.7 107/109 · d.6 87/89 · smoke 6/6 · tsc 0 · หนี้ /root/svc-runs/fix/d7.md · **18/53**
- ~03:0xZ โควตา session ชน (รีเซ็ต 03:10Z) — agent 5 ตัวหยุด (B.4 builder · B.4 ผู้ตรวจ B · D.5 builder · B.11 ผู้เขียนข้อสอบ) → ปลุกต่อจากงานบนดิสก์
- 29 ต.ค. ~05Z · ✅ **B.4** (233b1736 → merge f62daaf8) · ผู้ตรวจ A+B: BLOCKER 2 (checkIn ∥ runPlanner deadlock 40P01 ~13% · planner ย้ายนัดใครก็ได้ในแผนแต่ในฐานไม่ย้าย ⇒ แถวถือช่องซ้อน) + MAJOR (startJob ทับนัด · ถอย NO_SHOW แล้ว tick ตั้งซ้ำ · งานที่อยู่ในร้านไม่ถือช่อง · ข้ามเที่ยงคืนจองซ้อน) → J1–J6 + priority เฉพาะ STAFF + reschedule ล้าง manualHold · ORACLE-EDIT 74→87 · รอบยืนยัน B: deadlock 0/9 · ทับ 0 (chaos 6×6) · ทรีรวม: b.4 86/87 · b.3 74/75 (ST-1 ข้ามหลัง merge) · smoke 6/6 · tsc 0 · F5.1 baseline 47→49 (ผู้คุมอนุญาต) · deploy note queue.housekeeping · หนี้ /root/svc-runs/fix/b4.md · **19/53**
- B.5 ข้อสอบ 75eafc1a (71 ข้อ) บน l1 · builder รอ B.11 merge (ไฟล์ชนกัน 4 ไฟล์)
- 29 ต.ค. ~17:3xZ · ✅ **B.11 + D.5 + B.5** (22/53) · ด่านรวม C บน session/svc หลัง merge B.5 af645cb7: b.5 / b.11 / b.3 / b.4 / d.5 110/115 / smoke 6/6 / tsc 0 · ORACLE-EDIT: d.5 M-11 (RETRY_SAFE ใต้โหลด → กดซ้ำต้อง ACTIVE ครบ · 60c0452e + แก้ badOf) · r0.2 D-14 ไม่นับนัด+walk-in ฉาก B.5 (2 commit) · ⚠️ d.6 G-1 / r0.9 G-1 แดงเมื่อรันซ้อน (r0.8 → qc-hotel-money HT-2) แต่ qc-hotel-money เดี่ยว 5/5 · r0.8 เดี่ยว 95/95 · outbox ค้าง 1 ⇒ ไม่ใช่ regression ของโค้ด = ลำดับ G ก่อนล้างข้อมูล (บทเรียน D.5) · หนี้: ย้าย G หลัง cleanup ใน r0.9 + d.6 · gate-d5 ค้างเพราะ pgrep จับ cmdline ตัวเอง (เสีย ~1 ชม.) + ล็อก 30 นาทีหมดเวลาเมื่อ 3 เลน ⇒ สคริปต์ด่านต่อไปมี retry lock
- D.8 2d722f21 บน l2 (ข้อสอบ 109 · รีวิว 2 รอบ: BLOCKER 5 + MAJOR 9 ปิด · probe-d8-b 25/25 · probe-d8-b2 22/22 · /root/svc-runs/fix/d8.md) · ค้าง P-2 perf ใต้โหลด (84 วิ/31 ใบ) วัดตอนเครื่องว่าง
- D.13 2c7ef43d บน l3 (ข้อสอบ 98 · รีวิว: MAJOR 3 ปิด · probe BREACH 0 · ORACLE-EDIT RT-1/S-8 · /root/svc-runs/fix/d13.md) · ค้าง Q-1..3 (รอบบิล D.8 งวด 2026-10 ค้างบน svcqc)
- 29 ต.ค. ~19:2xZ · ✅ **D.8 + D.13** (24/53) · merge 1dc227b0 (D.8) + 39d926de (D.13 · แก้ชน permissions/account/dorm index เก็บทั้งสองฝั่ง) · ด่านรวม D: probe-d8-b 25/25 · probe-d8-b2 22/22 · probe-d13-b ผ่าน · d.5 110/115 · d.7 · b.11 · smoke 6/6 · tsc 0 · d.8 97/109 · d.13 88/98 · ORACLE-EDIT: d.8 S-6 (คีย์หอที่เหลือเป็นของ D.13) · d.8 mkBook(vat) ใส่ taxId (จาก D.3 · อยู่บน l2) · ฉาก D.13 แยกงวด (เดือนนี้สงวนให้ฉาก D.8 · D.13 ใช้เดือนหน้า/เดือนก่อน) ⇒ ภาพหอ 01 ป้าย "ค้าง ก.ย." แทน "ค้าง ต.ค." ตอนเทียบ PARITY
- เลน: l1 B.6 builder เสร็จ (62/72) รอ reviewer B · l2 D.3 builder · l3 B.9 ข้อสอบ a2d850b2 รอ B.6 merge
- 30 ต.ค. ~02Z · ✅ **B.6** (25/53 · ยกเป็นเข้ม ตามมติ Q5) · merge 490c4437 · ด่านรวม: b.6 · probe-b6-b breach 0 · d.13 · smoke · tsc 0 · regression ที่แดงหลัง merge แก้แล้ว: ฉาก B.6 tick กวาด walk-in ของวันฉาก B.5 (sweepEndOfDay ทุกวันก่อนหน้า) ⇒ ฉากทั้งสองกัน tick ข้ามวัน + ซ่อมตัวเองเมื่อรันซ้ำ (b.5/b.6/b.4 ผ่านทั้งสองลำดับ) · ORACLE-EDIT: b.4 Q-4 (บัตรนัดปิดทางเดิม · ETA ผ่าน loadTicketView) · b.6 S-9 ข้ามหลัง merge · b.6 S-1/S-2 queue-line opt deviceId · permissions เอา booking.devices.manage ออกจาก planned (b.11 K-2) · fitness F5.1 baseline 49→50 (deviceByToken) · action สาธารณะอยู่ใต้ app/(store)/bq
- 30 ต.ค. ~05Z · ✅ **D.3** (26/53) · merge 8ab8795d · ด่าน F: d.3 เต็ม 85/85 · probe-d3-b · d.2 78/78 · d.13 · b.6 · b.11 · smoke · fitness 53/53 · tsc 0 · d.8 P-3 แดงเฉพาะ --perf-rooms=20 (20 ห้องส่งจบในการเรียกเดียว · 300 ห้องเต็มผ่านแล้วใน gate-d) · 🔴 deploy: unique index AccountDocument_taxinvoice_source_uniq ต้องตรวจ prod
- merge B.9 (96521c79) + B.7 (แก้ชน svc-qc-data/booking index/ledger เก็บทั้งสองฝั่ง) → ด่าน G
- 30 ต.ค. ~05:4xZ · ✅ **B.9 + B.7** (28/53) · ด่าน G2 บน 8ea089eb: b.9 เต็ม 60/62 · probe-b9-b breach 0 · b.7 เต็ม 96/103 · probe-b7-b breach 0 · b.0 160/166 (G-9 = qc-pos-p3.5 ST2 เห็น migration svc_r… · มีอยู่ก่อน · หนี้ POS/B.18) · r0.7 89/89 · b.11 · smoke · fitness 53/53 · tsc 0 · ORACLE-EDIT: b.9 (S-1/S-2/remoteAction) · b.0 แถว 50b hideServiceName · r0.7 F-3 + ถอด route ชั่วคราว · มติความปลอดภัย: ช่อง ONLINE/KIOSK/REMOTE ไม่ผูก Party/สมาชิกจากเบอร์ไม่ยืนยัน (ลิงก์ตัวตน LINE เท่านั้น)
- 30 ต.ค. ~06:0xZ · ✅ **D.11** (29/53) · merge dee57130 · ด่าน H2/H3: d.11 99/100 · probe-d11-b 33/33 · d.8 78/85 · d.3 · d.13 88/98 · smoke 6/6 · fitness 53/53 · tsc 0 (รันซ้ำหลังเครื่องรีสตาร์ต) · ORACLE-EDIT d.8 S-7
- 30 ต.ค. ~07:3xZ · ✅ **B.10** (30/53) · merge f5cccfd9 · ด่าน I: b.10 61/64 (G-2 = b.5 S-3 → ORACLE-EDIT 05ec068f voidPaidServiceBillAction op void · b.5 รันซ้ำ 0 failed) · probe-b10-b 27/0 · p5.1 28/28 · p3.5 55/55 · p2.9b 53/53 · b.4 · b.9 · smoke · fitness 53/53 · tsc 0 · ORACLE-EDIT probe K5-a (voidPaidServiceBill)
- 30 ต.ค. ~10:3xZ · ✅ **B.8** (31/53) · merge 788cdeb0 · ด่าน J: b.8 89/94 (G-5 r0.6 แดงเพราะฉาก D.9 ตั้ง payments.receiver UNIT หอบน svcqc — ลบแถวแล้ว รัน r0.6 ซ้ำ 77/77) · probe-b8-b 30/0 · b.10 0 failed · probe-b10-b 27/0 · p3.5 55/55 · smoke · fitness 53/53 · tsc 0 · ORACLE-EDIT b.7 S-5 · b.3 SNAP_KEYS · probe P3g/P7 (V5)
- 30 ต.ค. ~12:0xZ · ✅ **D.9** (32/53) · merge 950565b6 · ด่าน K (ผู้คุมใหม่ บัญชี B รับผลที่รันค้างจากบัญชี A): d.9 86/89 0 failed · probe-d9-b 28/0 · r0.6 77/77 · b.8 / b.7 / d.11 --no-regression 0 failed · smoke 6/6 · fitness 53/53 · tsc 0
- 30 ต.ค. ~22:4xZ · ✅ **D.4** (33/53) · merge 05014f81 + prisma generate ทรีหลัก · ด่าน L: d.4 117/119 · probe-d4-b 68/0 · d.9/d.8/d.5 --no-regression 0 failed · smoke 6/6 · fitness 53/53 · tsc 0 · ผู้ตรวจยืนยันตีกลับ X2 (regex attrsOf กำลังสอง · 787 B ค้าง 51 วิ) ⇒ Y1–Y3 · มติ X12 คง findForbiddenTerms · หนี้ N3/X16 ใน /root/svc-runs/fix/d4.md · 🔴 deploy: migration 20261224000000_svc_d4 · ⚠️ l1 ใช้ node_modules ทรีหลัก (ไม่ใช่ nm-l1) ⇒ merge session เข้า l1 ทุกครั้งที่ generate · ~16Z agent ตายทั้งหมด (OAuth หมดอายุ) เสีย ~6 ชม.
