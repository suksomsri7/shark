## กติกาตายตัว (ละเมิด = ตีกลับทันที)
- ทำงานใน worktree `/root/projects/shark-member` เท่านั้น (ห้าม cd ไป repo อื่น · ห้ามแตะ shark-kanban / shark-in-th)
- **ห้าม build · ห้าม commit · ห้าม push · ห้ามแตะ `.env` (prod) · ห้ามรัน suite ที่ loadEnvFile(".env")** — QC ใช้ `.env.qc` ผ่าน `scripts/acc-v2-env.mts loadQcEnv()` เท่านั้น · Prisma CLI: export DATABASE_URL/DIRECT_URL จาก `.env.qc` ด้วย `grep|cut` (ห้าม `source` — ค่ามี `&`) แล้วตรวจ host เป็น ep-plain-art ก่อน migrate
- **ห้ามแก้ข้อสอบ/harness/seed/fitness**: `scripts/qc-member-*.mts` `scripts/visual-member.mts` `scripts/qc-all.mts` `scripts/seed-member-qc.mts` `scripts/member-qc-env.mts` `scripts/member-expected.json` `scripts/fitness.mts` — เชื่อว่าข้อสอบผิด → จดใน wo-notes แล้วทำต่อ ห้ามแก้เอง
- **ห้ามรัน `qc-member-m1.1.mts`** (reseed)
- งานหนัก (tsc / oracle / fitness / prisma) ผ่าน `bash scripts/with-gate-lock.sh <cmd>` เสมอ (รอ lock นานได้ = ปกติ · Fable กำลัง build อยู่)
- **โหมดขนาน**: มี builder อื่นทำงานใน worktree เดียวกัน — ห้ามแก้ไฟล์ของใบอื่น · ไฟล์ใช้ร่วม (`member/index.ts` facade · `member/limits.ts` · `outbox-consumers.ts` · `automation/labels.ts` · `webhooks/labels.ts` · `platform/cron.ts` · `approval-effects.ts` · `approval/labels.ts` · `api-keys/scopes.ts`) แก้ด้วย **Edit เฉพาะจุด ห้าม Write ทับทั้งไฟล์** อ่านใหม่ก่อน Edit ทุกครั้ง · `git status` เห็นไฟล์คนอื่น dirty = ปกติ ห้าม checkout/revert/stash
- ข้อสอบเชิงนับอาจ flake จากข้อมูลชั่วคราวของ builder อื่น → รันซ้ำก่อนสรุป
- AGENTS.md: Next.js รุ่นนี้ต่างจากที่รู้ — อ่าน `node_modules/next/dist/docs/` เมื่อสงสัย · TS strict ห้าม `any` ใน src · zod v4 · Prisma 7 multi-file schema (`prisma/schema/*.prisma`) · migration ใหม่ต้อง additive และ `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script` พิมพ์ "empty migration" หลัง migrate deploy บน QC
- UI ห้ามอีโมจิ/สัญลักษณ์ช่วง U+2600–27BF (✓ ⚠ ⇄) ใน `src/components/member/*.tsx` (ใช้ `MemberIcon`) · ห้าม hex สี (ใช้โทเคน/คลาสเดิม) · error ภาษาไทย ไม่โทษผู้ใช้ · testid ตามสัญญาทุกตัว · UI ต้องตรงภาพ mockup ใน `ledger/design-member/` (Fable เทียบด้วยตา ตีกลับได้)
- event ใหม่ต้องลง 3 ทะเบียน (outbox-consumers.ts · automation/labels.ts AUTOMATION_EVENTS · webhooks/labels.ts WEBHOOK_EVENTS) ไม่งั้นคิวตันเงียบ
- action ไฟล์ `"use server"` ต้องเรียก `assertCan(...)` ตรง ๆ เมื่อไม่มีสิทธิ์ (fitness F6 สแกนข้อความ) ตามแบบ `fields-actions.ts`

## ส่งมอบ (ทุกใบเหมือนกัน)
- `bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-<wo>.mts` → ผ่านทุกข้อที่ไม่ใช่ภาพ/PARITY (ของ Fable)
- `bash scripts/with-gate-lock.sh pnpm exec tsc --noEmit` ผ่าน
- fitness ผ่านทั้ง 2 โหมด: `bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts` และ `env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts`
- regressions ที่ระบุในใบ ผ่านเท่าเดิม
- เขียน `ledger/wo-notes/member-<wo>.md`: ไฟล์ส่งมอบ · ผลข้อสอบ · ข้อตัดสิน (ทุกจุดที่สัญญาไม่ชัดและตัดสินเอง พร้อมเหตุผล) · หนี้ · เว้นหัวข้อ "ตรวจภาพ" ให้ Fable
- ตอบกลับสั้น: ไฟล์ · ผลข้อสอบ x/y · ข้อที่ค้าง+เหตุผล
- 🔴 ด่าน parity ในข้อสอบต้องเป็นบรรทัด `- **PARITY: ผ่าน**` (regex ^-?\s*\*\*PARITY…\*\*) — builder เคยเขียนคำนี้ในโน้ตแบบอ้างถึงแล้วข้อสอบผ่านเอง (M2.4 · 10 ก.ย.)
- 🔴 component 'use client' ห้าม import ไฟล์ที่ลากถึง prisma/env/facade (เช่น `@/lib/modules/<mod>/<service>`) — tsc ผ่านแต่ `next build` พัง (Module not found: pg ใน Client Component Browser · M3.1 11 ก.ย.) ⇒ ชนิดข้อมูล/ทะเบียน/ป้าย ที่ UI ใช้ให้อยู่ไฟล์บริสุทธิ์ `*-shared.ts` · ค่าที่ต้องคิวรีผ่าน server action · ตรวจด้วย grep ก่อนส่งมอบ
