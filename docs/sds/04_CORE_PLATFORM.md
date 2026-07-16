# 04 — Core Platform & Security

## Kernel guard (src/lib/core)
- **scope.ts** — ทะเบียน axis ทุก model (fail-closed: ไม่ลงทะเบียน = โยน) · axis: `global` (มีเหตุผลเขียนกำกับ) / `tenant` / `unit` / `system` / `platform`
- **db.ts `tenantDb(ctx)`** — Prisma extension inject filter ทุก operation (find/update/delete/create/createMany/upsert-where) — คือปราการชั้นเดียวที่กันข้อมูลข้ามร้านทั้งระบบ **ห้าม refactor โดยไม่มี oracle ครบ**
- **rbac.ts** — OWNER ทุกอย่าง · MANAGER เต็มในหน่วยที่คุม · STAFF ตาม permission string `<module>.<entity>.<verb>` หรือ wildcard `<module>.*` · `assertCan` โยน ForbiddenError
- **outbox.ts** — transactional outbox: emit ใน tx เดียวกับงานหลัก · idempotent (tenantId+idempotencyKey) · drain best-effort + cron เก็บตก · consumer ห่อด้วย Automation hook (พังไม่ล้มงานหลัก)
- **auth.ts/session.ts** — passwordless (OTP+magic link) hash sha256 เก็บ hash เท่านั้น · session cookie httpOnly
- **context.ts `requireTenant`** — auth + tenant ACTIVE gate (SUSPENDED/CLOSED → /suspended)

## ชั้นความปลอดภัย (สถานะจริง + มาตรฐานที่งานใหม่ต้องตาม)

| ชั้น | กลไกปัจจุบัน | กติกาสำหรับงานใหม่ |
|---|---|---|
| Tenant isolation | tenantDb + scope ทุก model + oracle ทดสอบ cross-tenant ทุกชุด | ทุก oracle ใหม่ต้องมีข้อ "tenant อื่นมองไม่เห็น" |
| AuthZ | assertCan ทุก server action (fitness F6 ratchet) | action ใหม่ = permission string ใหม่ตาม convention เสมอ |
| AI ทำแทน | proposal เก็บ server-side · execute อ่านจาก DB ด้วย id เท่านั้น · assertCan สิทธิ์**คนกด** ณ execute · claim อะตอมมิกกันกดซ้ำ · TTL 24 ชม. | action-tool ใหม่ทุกตัวเดินเส้นนี้ ห้ามลัด |
| Backoffice | user/ตาราง/cookie แยกขาดจากร้าน · ไม่มีหน้า register (seed เท่านั้น) · enumeration-safe OTP · PlatformAuditLog append-only ทุก mutation | การกระทำใหม่ฝั่ง platform ต้อง audit + role check |
| Secrets | key ต่อโปรเจกต์เท่านั้น (ชื่อ shark) · เก็บ .env + Vercel encrypted · token เก็บ hash | ห้าม hardcode/ห้ามข้ามโปรเจกต์/ห้าม log ค่า secret |
| Cron/API ภายใน | Bearer SHARK_CRON_SECRET (เทียบเป๊ะ · env ว่าง = 401 เสมอ) | endpoint ภายในใหม่ใช้ pattern เดียวกัน |
| Input | Zod ที่ boundary (DNA/LLM ทุก payload) · เงินเป็นสตางค์ Int | ค่าจาก client/LLM ทุกตัวผ่าน validation ก่อนแตะ DB |

## ช่องว่าง security ที่รู้ตัว (อยู่ใน Master Queue)
observability/alerting (WO-0041) · rate limiting + security headers (WO-0043) · PDPA data rights + backup/DR ซ้อม (WO-0042) · pentest ภายนอก (needs-owner จ้าง) · การรวม CRON_SECRET เก่า/ใหม่เป็นตัวเดียว

## QC หลายชั้น (ระบบตรวจงานทั้งหมด)
1. **Oracle ต่อโมดูล** (`scripts/qc-*.mts` ~15 ชุด >150 ข้อ) — Fable เขียน**ก่อน**โค้ด · Builder ห้ามแตะ · รันกับ Neon branch แยก · เป็น regression ถาวร
2. **qc:account 107 ข้อ** — เส้นเงินทั้งหมด แตะอะไรที่เกี่ยวเงินต้องเขียว
3. **fitness ratchet 14 ข้อ** (pre-commit บังคับ) — scope ครบ/ไม่มี raw prisma เพิ่มในโมดูล/assertCan ครบ/doc refs ไม่ตาย/ฯลฯ — เข้มขึ้นได้อย่างเดียว ห้ามผ่อน baseline
4. **typecheck ก่อน push ทุกครั้ง** (`set -o pipefail`) — Vercel build ตรวจ `scripts/` ด้วย
5. **Deploy gate** — ยืนยัน Vercel API state=READY ทุก push (ห้ามเชื่อ curl)
6. **Fable ตรวจรับ** — รันข้อสอบซ้ำเองเสมอ (ไม่เชื่อรายงาน Builder) + อ่าน diff จุด security
