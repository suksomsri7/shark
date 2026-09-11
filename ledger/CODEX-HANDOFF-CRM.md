# CODEX-HANDOFF-CRM — คู่มือส่งต่องาน "CRM v2 เฟส C1" ให้ Codex ทำเอง (เขียน 11 ก.ย. 2569 · Fable)

> ผู้อ่าน: **Codex (builder)** และ **Codex (reviewer)** — 2 session แยกกัน คนละ prompt (§8) · เจ้าของสั่ง 11 ก.ย.: "ส่งต่อให้ codex เขียนทั้งหมด · codex ตรวจเอง · Fable ตรวจซ้ำเมื่อ limit รีเซ็ต"
> เอกสารนี้คือ **กติกา** · สเปกอยู่ที่ 3 ไฟล์ (§1) · ทุกอย่างที่ขัดกับเอกสารนี้ = เอกสารนี้ชนะ ยกเว้นเรื่องความปลอดภัย/prod ที่ `AGENTS.md`/`_CONVENTIONS.md` ชนะ

---

## 0. สรุปสั้นที่สุด
1. อ่านตามลำดับ §1 (≈ 40 นาที) — ห้ามข้าม
2. ทำงานบน worktree `/root/projects/shark-crm` branch **`session/crm-codex`** เท่านั้น (§2)
3. ทำ **ทีละใบ** ตามลำดับ §4 (C1.1 → C1.11) · ทุกใบ = **ข้อสอบก่อน → โค้ด → ผ่านทั้งหมด → wo-notes → commit → push branch** (§5)
4. **ห้าม** push main · deploy · migrate prod · แตะ `.env` · แตะ POS/บัญชี tx · รัน build/qc:all พร้อม session อื่น (§3)
5. ติดปัญหา = เขียนลง wo-notes แล้ว **ทำใบถัดไปที่ไม่ขึ้นกับมัน** ไม่ต้องรอใคร (§6)
6. เสร็จทั้ง C1 → reviewer ตรวจ (§8) → เขียน `ledger/CRM-RUN.md` §3.1 + §4 → หยุด รอ Fable

---

## 1. ลำดับอ่าน (บังคับ)
| # | ไฟล์ | อ่านอะไร |
|---|---|---|
| 1 | `AGENTS.md` · `docs/modules/_CONVENTIONS.md` | กติกาโค้ดทั้งรีโป (Next รุ่นนี้ · tenant-scoped · outbox · facade) |
| 2 | `ledger/CRM-RUN.md` | §0 กติกา RUN · §1 ตาราง WO · **§2 สัญญา+รายการข้อสอบต่อใบ** · §3 ลำดับ |
| 3 | `docs/modules/20-crm-v2.md` | §0 มติ C1–C14 · §4 data model (ต้องตรงทุกคอลัมน์) · §5 service API · §6 สิทธิ์ · §7 event · §9 เชื่อมทุกระบบ · §11 edge cases |
| 4 | `docs/api/CRM-API.md` | op ที่ C1.10 ต้องทำ (~50) · shapes |
| 5 | `ledger/design-crm/README.md` + ภาพ 01–06 · 10 · 13 · 14 | UI ที่ต้องได้ (parity) — เปิดดู PNG จริง |
| 6 | `scripts/crm-qc-env.mts` · `scripts/seed-crm-qc.mts` · **`scripts/qc-crm-c1.1.mts`** | สัญญาชุดข้อมูล · seed · **ข้อสอบตัวอย่างที่ Fable เขียน — ลอกรูปแบบนี้ทุกใบ** |
| 7 | ตัวอย่างของจริงจาก RUN สมาชิก (โค้ดที่ผ่านแล้ว): `src/lib/modules/member/fields.ts` (engine ฟิลด์ที่ต้องต่อยอด) · `src/lib/modules/member/profile.ts` (โครง service + สิทธิ์ + audit + event) · `src/lib/modules/kanban/api/{op,registry,dispatch}.ts` + `ops/boards.ts` (ทะเบียน op) · `src/lib/platform/member-bridges.ts` (consumer/composition root) · `scripts/member-backfill-common.mts` + `member-backfill-party-links.mts` (backfill) · `ledger/wo-notes/member-M1.4.md` (wo-notes ที่ดี) |
| 8 | `ledger/MEMBER-RUN.md` §0–§0.1 · `ledger/HANDOVER-2026-09-11-MEMBER-M2.md` §5 | บทเรียนที่จ่ายมาแล้ว (hasIdx · use server export type · 'use client' import prisma · outbox consumer) |

## 2. ที่ทำงาน
- worktree `/root/projects/shark-crm` (ติดตั้ง deps + prisma generate แล้ว · มี `.env.qc` = ฐาน QC) · branch **`session/crm-codex`** (สร้างจาก main แล้ว)
- เริ่มทุกกะ: `git fetch origin && git rebase origin/main` (session สมาชิกยัง push main อยู่ · ถ้า conflict ใน `prisma/schema/member.prisma` `scope.ts` `outbox-consumers.ts` `labels.ts` `permissions.ts` `fitness.mts` ให้แก้ให้ **ทั้งสองฝั่งอยู่ครบ** ห้ามทิ้งของสมาชิก)
- จบทุกใบ: `git push origin session/crm-codex` (ห้าม `:main`)
- ฐานข้อมูล: **QC เท่านั้น** (`.env.qc` · `loadQcEnv` มีด่านกัน host prod) · ห้ามอ่าน/แก้ `.env` (= production) · ห้ามตั้ง `ALLOW_PROD_BACKFILL`
- คำสั่งมาตรฐาน:
  ```bash
  pnpm typecheck                                   # tsc --noEmit
  pnpm fitness                                     # 26 ด่านสถาปัตยกรรม (ต้องเขียวก่อน commit — pre-commit รันให้)
  pnpm exec tsx scripts/seed-member-qc.mts         # ถ้า DB QC ยังไม่มีร้าน QC สมาชิก
  pnpm exec tsx scripts/seed-crm-qc.mts            # ชั้น CRM
  pnpm exec tsx scripts/qc-crm-c1.1.mts            # ข้อสอบใบ (ต้อง JSON_SUMMARY passed==total · exit 0)
  bash scripts/with-gate-lock.sh pnpm build        # งานหนักต้องผ่านตัวต่อคิว (เครื่อง 2 คอร์ · มี session อื่น)
  bash scripts/with-gate-lock.sh pnpm qc:all -- --only crm   # ถ้ามี flag · ไม่มีก็รัน qc-crm-*.mts ทีละไฟล์
  bash scripts/acc-v2-serve.sh                      # QC server สำหรับภาพ (ดูวิธีในสคริปต์) · ปิดเมื่อเสร็จ
  ```
- migration: `pnpm exec prisma migrate dev --name crm_v2_a --create-only` บน QC → ตรวจ SQL ว่า additive ล้วน (ADD COLUMN/TABLE/TYPE VALUE · ไม่มี DROP/ALTER TYPE ที่ทำลาย) → `prisma migrate deploy` บน QC · **ห้ามรันบนฐานอื่น** · ชื่อ migration ต้องลงท้าย `_crm_v2_a` (ข้อสอบหา regex นี้)

## 3. ห้าม (ละเมิด = งานทั้งใบถูกตีกลับ)
1. ห้าม push `main` / สร้าง PR ไป main / merge เอง — Fable merge หลังตรวจ
2. ห้าม deploy (Vercel) · ห้าม `prisma migrate deploy` นอก QC · ห้ามแตะ `.env`/`.env.local` · ห้ามใช้ credential ข้ามโปรเจกต์
3. ห้ามแก้ไฟล์ข้อสอบ `scripts/qc-crm-*.mts` **หลัง commit "test:" ของใบนั้น** (§5 ขั้น 2) — ถ้าเชื่อว่าข้อสอบผิด: เขียนแย้งใน wo-notes §5 พร้อมหลักฐาน แล้วปล่อยข้อนั้นแดง (ห้ามแก้ให้เขียว)
4. ห้ามแตะ `src/lib/modules/pos/service.ts` · tx ของ `account` · `src/lib/modules/kanban/automation.ts` ในเฟส C1 (เป็นของ C2.1/C2.7 และต้องรอสมาชิก M3.3)
5. ห้ามสร้าง engine ใหม่ 3 อย่าง (C13): ฟิลด์ (ต่อยอด `member/fields.ts` ด้วย `objectKey`) · อัตโนมัติ · ทะเบียน op (`defineCrmOp` แบบ `defineKanbanOp`) — อยากทำต่างต้องแย้งใน wo-notes ก่อน ไม่ใช่ทำแล้วบอก
6. ห้าม import ข้ามโมดูลตรง — ผ่าน facade `index.ts` + เพิ่ม `ALLOWED_EDGES` ใน `scripts/fitness.mts` พร้อมเหตุผล (F2)
7. ห้ามใช้ `any` ในโค้ด src (scripts ใช้ `type Any = any` ได้ตามแบบ) · ห้าม `export type` ในไฟล์ `"use server"` · ห้าม `'use client'` import โมดูลที่ลากถึง prisma (ใช้ `*-shared.ts` + server action)
8. ห้ามเพิ่ม event โดยไม่ลง 3 ทะเบียน (`outbox-consumers.ts` · `automation/labels.ts AUTOMATION_EVENTS` · `webhooks/labels.ts WEBHOOK_EVENTS`) ในใบเดียวกัน — ลืม = คิว outbox ตันทั้งระบบเงียบ ๆ
9. ห้ามรัน build/typecheck/qc:all พร้อมกัน 2 อย่าง หรือพร้อม session อื่นโดยไม่ผ่าน `with-gate-lock.sh` — เครื่องเคยค้างทั้งเครื่อง
10. ห้ามลบ/กวาด `/tmp` · ห้ามแตะ worktree อื่น (`shark-member` กำลัง RUN · `shark-in-th` = main)

## 4. ลำดับใบงานเฟส C1 (ทำเฉพาะ C1 · 11 ใบ · C2/C3 รอคำสั่ง)
C1.1 → C1.2 → C1.3 → C1.4 → C1.5 → C1.6 → C1.7 → C1.8 → C1.9 → C1.10 → C1.11 (สัญญาเต็ม `CRM-RUN.md` §2 · ขนานได้เฉพาะ C1.6∥C1.7 และ C1.9∥C1.10 ถ้าเปิด 2 session แต่ **ห้ามแตะไฟล์เดียวกัน**)
- ใบ C1.1 มีข้อสอบให้แล้ว (`qc-crm-c1.1.mts` 26 ข้อ) — เริ่มจากทำให้ข้อสอบนี้เขียว
- ใบ C1.2–C1.11: **เขียนข้อสอบเองก่อน** จากรายการ "oracle:" ใน CRM-RUN §2 (จำนวนข้อ = ตัวเลขในวงเล็บ · id = `C1.x-S<กลุ่ม>.<ข้อ>` · รูปแบบเดียวกับ c1.1 ทุกประการ: SKIP guard · chk · finally คืนสภาพ · JSON_SUMMARY · `// requires: crm-seed`)
- ข้อสอบภาพ (ใบที่มี "ภาพ NN"): ทำเป็น `scripts/visual-crm.mts <wo> --user owner|thana|nok|manager` (ลอก `scripts/visual-member.mts`) ถ่าย `.qc-shots/crm/<wo>/*.png` แล้ว **เปิดดูเองเทียบ mockup** ก่อนบอกว่าผ่าน · ใส่ path ภาพใน wo-notes

## 5. ขั้นตอนต่อใบ (ทุกใบเหมือนกัน · ห้ามสลับลำดับ)
| ขั้น | ทำอะไร | หลักฐาน |
|---|---|---|
| 1 | อ่านสัญญาใบนั้น (CRM-RUN §2 + หัวข้อพิมพ์เขียวที่อ้าง + ภาพ) · เปิดโค้ดจริงที่จะแตะ (ห้ามเดาชื่อคอลัมน์/ฟังก์ชัน — เช่นชื่อตารางที่ต้องเพิ่ม partyId ใน C1.1 ให้ grep `prisma/schema/*.prisma` แล้วแก้ `PARTY_LINK_TABLES` ใน crm-qc-env ให้ตรงของจริง พร้อมบันทึก) | รายการไฟล์ใน wo-notes §1 |
| 2 | เขียนข้อสอบ `scripts/qc-crm-<wo>.mts` (+ visual spec) → รัน = **SKIPPED** (ยังไม่มีโค้ด) → `git commit -m "test(crm): <wo> oracle N ข้อ"` | commit hash |
| 3 | เขียนโค้ด + migration (ถ้ามี) + seed เพิ่ม (ถ้าใบนั้นต้องการข้อมูลใหม่ — แก้ `seed-crm-qc.mts` + `crm-qc-env.mts` ได้ แต่ห้ามลดจำนวนเดิม) | — |
| 4 | รันข้อสอบใบนี้จนผ่าน **ทุกข้อ** · รัน regressions: `qc-crm-c1.*` ใบก่อนหน้าทั้งหมด + `qc-member-m1.2` `qc-member-m1.4` `qc-member-m1.11` (ฟิลด์/360/REST ของสมาชิกที่เราต่อยอด) + `qc-kanban-k3.3` (บอร์ดงาน link) — ต้องเขียวเท่าเดิม | JSON_SUMMARY ทุกชุด วางใน wo-notes §3 |
| 5 | `pnpm typecheck` · `pnpm fitness` (มี env) · `env -u DATABASE_URL pnpm fitness` (ไม่มี env — pre-commit รันแบบนี้) · ถ้าใบมี UI: `with-gate-lock pnpm build` + ถ่ายภาพ + ดูภาพ | ผลใน wo-notes |
| 6 | เขียน `ledger/wo-notes/crm-<wo>.md` ตามเทมเพลต `ledger/wo-notes/TEMPLATE-crm.md` (ไฟล์ · ผล · ข้อแย้ง · หนี้ · คืนสภาพ QC) | ไฟล์ |
| 7 | `git commit` (ระบุไฟล์ + ผลข้อสอบใน message · Co-Authored-By ตามกติการีโป) → `git push origin session/crm-codex` → อัปเดต `ledger/CRM-RUN.md` §3.1 แถวของใบ (✅ DONE n/n · hash) + §4 เหตุการณ์ 1 บรรทัด | hash ใน CRM-RUN |
| 8 | ใบถัดไป · ถ้าเครื่องรีสตาร์ท: อ่าน CRM-RUN §3.1 + wo-notes ล่าสุด แล้วทำต่อจากขั้นที่ค้าง (ห้ามเริ่มใบใหม่ทับ) | — |

## 6. เมื่อติด
- **ข้อสอบกับสเปกขัดกัน** → เชื่อพิมพ์เขียว §4/§5 ก่อน · เขียนแย้งใน wo-notes §5 (ข้อสอบ id · เหตุผล · หลักฐานจากโค้ด/สเปก) · ปล่อยข้อนั้นแดง · ไปต่อ
- **สเปกขาด/คลุมเครือ** → ตัดสินใจเองแบบ "เพิ่มอย่างเดียว ย้อนกลับได้" · บันทึกใน wo-notes §5 "มติทางเทคนิค" · ห้ามหยุดรอ
- **ต้องแตะไฟล์ต้องห้าม (§3 ข้อ 4)** → หยุดใบนั้น · เขียนใน CRM-RUN §4 ว่าติดอะไร · ทำใบอื่นที่ไม่ขึ้นกับมัน
- **conflict กับ main** จากสมาชิก → rebase · เก็บทั้งสองฝั่ง · รัน regressions สมาชิกที่ระบุใน §5 ขั้น 4 ซ้ำ
- **qc-all/build ค้าง** → อย่า kill session อื่น · รอ gate lock (สูงสุด 30 นาที) · ถ้าเครื่อง load สูงนาน ให้เขียนใน CRM-RUN §4 แล้วพัก
- **ข้อสอบ c1.1 ที่ Fable เขียนผิด** (เป็นไปได้ — เขียนก่อนมีโค้ด) → แย้งใน wo-notes พร้อมหลักฐาน · ตัวอย่างที่อนุญาตให้แก้ข้อสอบ c1.1 ได้เอง **เฉพาะ**: ชื่อตารางจริงใน `PARTY_LINK_TABLES` (crm-qc-env) และ include/relation name ที่ Prisma ไม่รู้จัก — บันทึก diff ใน wo-notes

## 7. เกณฑ์ "เฟส C1 เสร็จ" (ก่อนเรียก reviewer)
- 11 ใบ ✅ ใน CRM-RUN §3.1 · ข้อสอบ `qc-crm-c1.1`…`c1.11` เขียวทั้งหมดในรอบเดียว (รันต่อกัน) · regressions สมาชิก/บอร์ดงานเขียว · `pnpm typecheck` · fitness 2 โหมด · build ผ่าน · ภาพทุกหน้า C1 ถ่ายแล้วดูแล้ว (path ใน wo-notes) · CRM v1 3 หน้าเดิมยังใช้ได้ (`qc-crm-v1`) · `docs/api/CRM-API.md` ถูก generator เขียนทับแล้วตรง (F13.8) · branch push แล้ว · **ไม่มี** commit ใน main จาก Codex

## 8. Reviewer (Codex session ที่ 2 · เริ่มเมื่อ §7 ครบ) — prompt
```
คุณคือผู้ตรวจอิสระของงาน CRM v2 เฟส C1 บน branch session/crm-codex (worktree /root/projects/shark-crm) · ห้ามแก้โค้ด src/ · แก้ได้เฉพาะ ledger/REVIEW-CRM-C1.md ที่คุณเขียน
อ่าน: ledger/CODEX-HANDOFF-CRM.md · ledger/CRM-RUN.md §2 · docs/modules/20-crm-v2.md §4–§7 · wo-notes/crm-C1.*.md
ทำตามลำดับ และเขียนผลลง ledger/REVIEW-CRM-C1.md ทีละข้อ (append ทันที ไม่รอจบ):
1. ความซื่อตรงของข้อสอบ: ต่อใบ เปิด scripts/qc-crm-<wo>.mts เทียบกับรายการ oracle ใน CRM-RUN §2 — นับว่าข้อสอบครอบทุกข้อในสเปกไหม (ตาราง: ข้อสเปก → id ข้อสอบ → มี/ไม่มี/อ่อนกว่า) · ดู git log ว่าไฟล์ข้อสอบถูกแก้หลัง commit "test:" หรือไม่ (git log -p scripts/qc-crm-<wo>.mts) → รายงานทุกการแก้
2. รันจริง: seed-member-qc → seed-crm-qc → qc-crm-c1.1..c1.11 ต่อกัน + regressions ตาม §5 ขั้น 4 · วาง JSON_SUMMARY ทุกชุด (ห้ามเชื่อตัวเลขใน wo-notes)
3. ภาพ: เปิด .qc-shots/crm/<wo>/*.png คู่กับ ledger/design-crm/NN-*.png ทีละหน้า ระบุจุดต่างเป็นข้อ ๆ (ตำแหน่ง/สิ่งที่ขาด) — ผ่านด้วยตา ไม่ใช่รายงานของ builder
4. กติกา §3: grep ว่ามีการแตะไฟล์ต้องห้าม / import ข้ามโมดูลตรง / event ไม่ลง 3 ทะเบียน / any ใน src / use-server export type / migration ที่ไม่ additive
5. เชื่อมทุกระบบ (พิมพ์เขียว §9 แถวที่อยู่ในเฟส C1): ตรวจว่า partyId + consumer + facade ที่ระบุมีจริง (grep) — ตารางแถว → มี/ไม่มี
6. สรุปท้ายไฟล์: CRITICAL/MAJOR/MINOR เรียงความสำคัญ + ข้อที่ต้อง Fable ตัดสิน · ห้ามสรุปว่า "ผ่าน" ถ้ามีข้อ 2 แดงหรือข้อ 3 ต่างเกิน 3 จุด/หน้า
```

## 9. เมื่อ Fable กลับมา (บันทึกไว้ให้ตัวเองอ่าน)
1. อ่าน `ledger/REVIEW-CRM-C1.md` + CRM-RUN §3.1/§4 + wo-notes ทุกใบ (ข้อแย้ง §5 ก่อน)
2. เทียบข้อสอบกับสเปกเองอีกรอบเฉพาะใบที่ reviewer ธง · รันชุดเต็มเอง (`qc-crm-*` + regressions + qc:all ผ่าน gate lock)
3. ดูภาพเองทุกหน้า (ด่าน parity) · ตัดสินข้อแย้ง (แก้ข้อสอบเองถ้า builder ถูก)
4. rebase `session/crm-codex` บน main → merge → push main → Vercel READY → `_prisma_migrations` prod (crm_v2_a) → backfill prod `--dry-run` → จริง → prod verify (owner/thana/nok) → HANDOVER-CRM-C1 → Telegram → memory
5. ตัดสินใจเรื่อง C2 (รอ M3.3 สมาชิก) แล้วเขียน handoff เฟส C2 ถ้ายังใช้ Codex ต่อ
