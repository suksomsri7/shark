คุณคือ builder ของ WO **M3.10** ระบบสมาชิก v2 (SHARK) — REST/AI ชุดสาม + manifest: ops ~72 (segments · campaigns · journeys · reviews · referrals · notifications · reports · settings/api-keys · webhooks · join (public lane) · me เพิ่ม) · test id `M3.10-S3.x` (F13.7) · webhooks CRUD ผ่าน REST + delivery HMAC + retry · `member/join.ts` service (startJoin/verifyJoin/joinForm/completeJoin) · tools ≥ 38 + manifest · OpenAPI · docs generator สมบูรณ์ · หน้า settings/api ส่วน webhooks (ภาพ 27 ขวา) + หน้า `/member/assistant` proposal flow (ภาพ 27 ซ้าย) · **ไม่มี migration**

อ่านก่อนเริ่ม (ตามลำดับ):
1. `ledger/member-briefs/member-builder-common.md` — กติกาตายตัว + วิธีส่งมอบ
2. `ledger/MEMBER-RUN.md` §0.1 · §2 M3.10 · §4 (มติล่าสุด)
3. **ข้อสอบ `scripts/qc-member-m3.10.mts` = สัญญาฉบับเต็ม** (หัวไฟล์ = op id · method · path · scope · test id ต่อกลุ่ม · join lane · tools ที่ต้องมี · manifest · docs · testid) — ผู้คุมงานเดิมตัดสินชื่อ path ไว้แล้ว **ยึดตามหัวไฟล์ ห้ามตั้งเอง**
4. `ledger/wo-notes/member-M1.11.md` (registry · dispatch กลาง · bundle scopes · generator · F13.7–9) · `member-M2.10.md` (ชุดสอง · customer token cs_ · actor.customerId · require.altAuth · idempotency) · `member-M2.9.md` (customer-session.ts · OTP rate) · `member-M3.1.md`…`member-M3.9.md` (service ของแต่ละกลุ่ม — op ต้องเรียก facade เท่านั้น ห้าม prisma ตรง)
5. ภาพ `ledger/design-member/27-ai-panel-api.png` (ซ้าย = ผู้ช่วย AI + กล่องข้อเสนอ · ขวา = API/webhooks) — `MemberIcon` · ห้าม hex · มือถือไม่ล้น

ขอบเขตไฟล์: `src/lib/modules/member/api/ops/{segments,campaigns,journeys,reviews,referrals,notifications,reports,settings,webhooks,join}.ts` + Edit `ops/me.ts` · `member/api/registry.ts` (ต่อ MEMBER_OPS) · `src/lib/modules/member/join.ts` · tools (`tools-member*`) · หน้า `src/app/app/sys/[id]/member/assistant/page.tsx` + `src/components/member/Assistant*.tsx` · Edit เฉพาะจุด: หน้า `member/settings/api` · `member/index.ts` · `member/nav.ts` · route join public (`/api/v1/member/join/...` ผ่าน dispatch กลาง · rate limit ต่อ IP) · docs: รัน generator (`gen-member-api-docs.mts`) ให้ `--check` exit 0 + อัปเดต `.claude/skills/shark-member-api/{SKILL.md,endpoints.md}` (ถูก gitignore — แก้ทั้งใน worktree และคัดลอกไป `/root/.claude/skills/shark-member-api/` ด้วย)
- ถ้าต้องแก้แกน REST (`src/lib/api/*`) ให้ additive เท่านั้น แล้ว regen docs บัญชี/บอร์ดงานด้วย (บทเรียน M2.10)
- AI: ใช้ `ai/service sendMessage` (skill members · source MEMBER_ASSIST) + `ai/proposals` (confirm ด้วยสิทธิ์ของคนกด) · `SHARK_AI_MOCK=1` ต้องใช้ได้ · prompt เป็นภาษาอังกฤษ ไม่ส่ง PII

regressions ต้องผ่านเท่าเดิม: `qc-member-m1.11` 26/26 · `m2.10` 20/20 · `m3.1`–`m3.9` (อย่างน้อยข้อ service) · ชุดบัญชี/บอร์ดงาน REST ที่ใช้ QC env (`qc-account-api-*` · `qc-kanban-k1.15` · `qc-kanban-k3.5` — ข้อภาพข้าม worktree แดง = ฐานเดิม) · `gen-*-api-docs --check` ทุกโมดูล · fitness 2 โหมด (F13.4/F13.5/F13.7–9) · grep 'use client' ก่อนส่งมอบ
- ข้อสอบ curl จริงต้องใช้ QC server ที่ผู้คุมงาน build — ข้อที่ต้องการ server ให้รายงานว่า "รอ server" ได้ ห้าม build เอง

ส่งมอบตาม common.md (wo-notes `ledger/wo-notes/member-M3.10.md` · ตอบสั้น: ไฟล์ · ผลข้อสอบ x/y · ข้อค้าง+เหตุผล) · ห้าม build/commit/push · ห้ามรัน suite ที่ชี้ `.env` (ทุก qc-*.mts มีด่านหยุดเองแล้ว — เจอ "🔴 หยุด!" ให้ export env ของ `.env.qc`)
