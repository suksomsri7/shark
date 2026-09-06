# RUN: ตราสินค้าและธีมกิจการ (Branding & Theme) — เริ่ม 6 ก.ย. 2569

> เจ้าของสั่ง "เริ่มได้เลย" 6 ก.ย. ~08:10 หลังเคาะแบบ 4 รอบ · แบบ = `ledger/DESIGN-BRANDING.md` + `ledger/design-branding/*.png`
> worktree `/root/projects/shark-branding` branch `session/branding` · Fable คุมงาน/เขียน oracle · builder ห้ามแก้ oracle · กติกาเดียวกับ run บอร์ดงาน (`shark-kanban/ledger/KANBAN-RUN.md` §กติกา 1–9)
> **วิธีกลับมาต่อ**: `cd /root/projects/shark-branding && git pull --rebase origin main` → อ่านตาราง WO → `wo-notes/branding-<WO>.md`

## การตัดสินใจ (เจ้าของไม่ได้ตอบ 4 ข้อ → Fable ใช้ค่าที่เสนอ แก้ทีหลังได้)
| # | เรื่อง | ตัดสิน |
|---|---|---|
| T1 | โทนแถบเมนูปริยาย | LIGHT (เหมือนปัจจุบัน) |
| T2 | พนักงานเลือกโทนเอง | ไม่ได้ — ธีมเป็นของร้าน (OWNER/ADMIN ตั้ง) · เฉพาะ "ย่อ/ขยายแถบ" เป็นของผู้ใช้ |
| T3 | โลโก้เอกสาร/อีเมล | ตัวเดียวกับแถบบน (ช่องโลโก้แนวนอน = ทีหลัง) |
| T4 | ธีมมืดทั้งระบบ | ไม่ทำ |
| T5 | ไม่มี sharp ในโปรเจกต์ → ไม่ resize ฝั่งเซิร์ฟเวอร์ | เก็บ URL เดียว ใช้ CSS ย่อ (`object-fit: contain`) · จำกัดไฟล์ ≤ 2MB · ตรวจ magic bytes เป็นรูปจริง |
| T6 | รางไอคอน | ไม่มีโลโก้บนราง · โทนเดียวกับแถบเมนู · คลิกไอคอน = เปิดหน้าระบบ ไม่มี flyout · เมนู = ชื่อระบบ 1 บรรทัด (ตัด children ของ CHAT/ACCOUNT และทุกระบบ) |
| T7 | แถบบน | ซ้าย = โลโก้+ชื่อที่แสดง (ไม่มี ☰ บนจอ ≥ lg) · ขวา = "แจ้งปัญหาการใช้งาน" + SHARK AI (orb) · มือถือ/แอป: ปัดขวาเปิดเมนู (ไม่มี ☰) |
| T8 | "แจ้งปัญหาการใช้งาน" v1 | ตาราง `IssueReport` + ภาพหน้าจอ (html2canvas ไม่มี → ให้แนบไฟล์เอง + ระบบเก็บ URL/UA/เวอร์ชัน) + แจ้ง Telegram เจ้าของผ่านช่องทางที่มี (OpsEvent) · การ์ดในบอร์ดงาน SHARK = ทีหลัง (ต้องมี cross-tenant write) |
| T9 | ลำดับกับบอร์ดงาน | B1/B2 ทำคู่ขนานกับ K1.14 (ไม่ชนไฟล์) · B3 (โครงแอป) เริ่มหลัง K1.14 ลง main เพราะแตะ `AppShell/NavRail/layout.tsx` เหมือนกัน |

## ตาราง WO — สถานะสด
| WO | งาน | โมเดล | สถานะ | ปิด | QC |
|---|---|---|---|---|---|
| B1 | schema+migration (NavTone, brandFg, navTone, applyStorefront, applyMobile, IssueReport) · `color.ts` contrast · `getBrandingTokens` (default+cache+invalidate) · `setBranding` ขยาย · AuditLog+outbox `tenant.branding.updated` · `/api/mobile/me` ส่ง branding · `IssueReport` service | Opus | IN_PROGRESS | | `qc-branding-b1.mts` 16 ข้อ |
| B2 | หน้าตั้งค่า `/app/settings/branding` ใหม่ตามภาพ 01 (โลโก้อัปโหลด+พรีวิว · ชื่อที่แสดง · 8 สี+hex+picker · กล่อง contrast · โทนแถบ 3 แบบ · สวิตช์ 3 · ตัวอย่างสด · บันทึก/คืนค่า) + `uploadLogoAction` ตรวจ magic bytes ≤2MB | Sonnet | TODO | | `qc-branding-b2.mts` |
| B3 | โครงแอป: token ที่ราก (`<html style>` จาก layout) · Topbar ใหม่ (โลโก้+ชื่อ · 2 ปุ่มขวา · ไม่มี ☰ ≥lg) · NavDrawer/NavRail รับโทน · รางไอคอนทุกหน้า + ย่อ/ขยาย จำต่อผู้ใช้ (`preferences.navCollapsed` ใช้ store ของ K1.14) · ตัด children ทุกระบบ · มือถือปัดขวาเปิดเมนู · ปุ่ม "แจ้งปัญหาการใช้งาน" (แผ่น + ส่ง) | Opus | TODO (รอ K1.14) | | `qc-branding-b3.mts` + visual |
| B4 | หน้าร้าน/ใบเสนอราคา/อีเมล อ่านจาก `getBrandingTokens` ที่เดียว (ตาม applyStorefront) | Sonnet | TODO | | `qc-branding-b4.mts` |
| B5 | แอป SHARK HUB: รับ branding จาก `/api/mobile/me` → จอล็อกอิน/แชท/ปุ่ม + ปัดขวาเปิดเมนูเว็บ (แอปเปิด swipe คืน แต่ยิงสัญญาณให้เว็บเปิดเมนู) · OTA | Sonnet | TODO | | `qc-mobile-app` + เรนเดอร์ iPad |
| BF | qc:all · verify prod (ภาพจริง 3 โทน) · handover · Telegram | Fable | TODO | | |

## สัญญา B1 (Opus)
- Prisma (`prisma/schema/branding.prisma`, additive migration `prisma/migrations/20260930000000_branding_theme/migration.sql`):
  `enum NavTone { LIGHT BRAND DARK }` · `TenantBranding` เพิ่ม `brandFg String?` · `navTone NavTone @default(LIGHT)` · `applyStorefront Boolean @default(true)` · `applyMobile Boolean @default(true)` · `updatedById String?`
  `model IssueReport { id tenantId userId? kind IssueKind(BUG|DISPLAY|IDEA) message pageUrl userAgent appVersion? screenshotUrl? status IssueStatus(OPEN|ACK|DONE) @default(OPEN) createdAt updatedAt @@index([tenantId, status]) }` · ลงทะเบียน scope tenant
- `src/lib/branding/color.ts` (pure): `isHex(s)` · `relativeLuminance(hex)` · `contrastRatio(a,b)` (WCAG 2.x) · `pickReadableFg(hex) → "#ffffff" | "#0a0a0a"` (เลือกตัวที่ ratio สูงกว่า) · `softOf(hex) → rgba 8%`
- `src/lib/branding/service.ts`: `setBranding(ctx, input & { navTone?, applyStorefront?, applyMobile?, updatedById? })` — hex ผิด/URL ไม่ปลอดภัย → throw ไทย · คำนวณ `brandFg` ทุกครั้งที่สีเปลี่ยน · เขียน AuditLog `branding.updated` (diff fields) · `emitOutbox` `tenant.branding.updated` (idempotencyKey `branding#<tenantId>#<updatedAt ms>`) + consumer no-op ลงทะเบียน + label ไทย · invalidate cache
  `getBrandingTokens(tenantId) → BrandingTokens = { displayName, logoUrl, accent, accentFg, accentSoft, navTone, navBg, navFg, navFg2, navOn, applyStorefront, applyMobile, isDefault }` — ค่าปริยาย = `{ accent "#1d4ed8", accentFg "#ffffff", navTone LIGHT, navBg "#fafafa", navFg "#0a0a0a", navFg2 "#737373", navOn "#ffffff" }` · BRAND → navBg=accent, navFg=accentFg, navFg2 = accentFg 72%, navOn = accentFg 16% · DARK → navBg "#111827", navFg "#f9fafb", navFg2 "#9ca3af", navOn rgba(255,255,255,.1) · แคช in-memory ต่อ tenant TTL 60 วิ + `invalidateBrandingCache(tenantId)`
  `getPublicBranding` เดิมคงสัญญา (ใช้ tokens ภายใน · เคารพ applyStorefront=false → ค่าปริยาย)
- `src/lib/branding/issues.ts`: `createIssueReport(ctx, { userId?, kind, message, pageUrl, userAgent, appVersion?, screenshotUrl? }) → row` (message trim ว่าง → throw ไทย · ≤ 2000 ตัวอักษร) · `listIssueReports(ctx, { status? })` · `setIssueStatus(ctx, id, status)` · แจ้ง ops: เขียน `OpsEvent`/ช่องทางแจ้งเตือนเจ้าของที่มีอยู่ (สำรวจ `src/lib/core/ops*` — ถ้าไม่มี ให้ log + outbox `issue.reported`)
- `/api/mobile/me`: เพิ่ม `branding` ต่อ membership = `{ displayName, logoUrl, accent, accentFg, navTone }` เมื่อ `applyMobile` (ไม่งั้น null)
- Oracle: `scripts/qc-branding-b1.mts` (Fable) — สร้าง tenant "QC BRANDING" เอง + ล้างเอง

## บันทึกเหตุการณ์ (ล่าสุดบนสุด · เวลาไทย)
- 6 ก.ย. 08:20 น. — เจ้าของสั่งเริ่ม · สร้าง worktree + ledger + oracle B1 · สั่ง Opus B1
