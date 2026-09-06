# B1 — schema + contrast + โทเคนธีม + IssueReport + /api/mobile/me (บันทึกผู้ทำ)

> WO: `ledger/BRANDING-RUN.md` §สัญญา B1 · แบบ: `ledger/DESIGN-BRANDING.md` §6/§7b · ตัดสินใจ T1–T9
> ข้อสอบ: `scripts/qc-branding-b1.mts` (21 ข้อ · Fable เขียน · builder ไม่แตะ)
> ผล: **20/21 · CRITICAL 1 = `B1-S2.1` ซึ่งผมเชื่อว่าข้อสอบผิด** (หลักฐาน §6 — ไม่แก้ข้อสอบตามกติกา)

## 1. ไฟล์ที่แตะ

**ใหม่**
- `src/lib/branding/color.ts` — คณิตศาสตร์สีล้วน (pure) ไม่แตะ DB/env
- `src/lib/branding/issues.ts` — "แจ้งปัญหาการใช้งาน" (สร้าง/ลิสต์/เปลี่ยนสถานะ)
- `prisma/migrations/20260930000000_branding_theme/migration.sql` — additive + รันซ้ำได้

**แก้**
- `prisma/schema/branding.prisma` — `enum NavTone` · `TenantBranding` +5 คอลัมน์ · `enum IssueKind/IssueStatus` · `model IssueReport`
- `src/lib/branding/service.ts` — `getBrandingTokens` + แคช + `invalidateBrandingCache` · `setBranding` ขยาย + audit + outbox · `getBranding` คืนฟิลด์ใหม่ · `getPublicBranding` เคารพ `applyStorefront`
- `src/lib/core/scope.ts` — `IssueReport: tenant` (fail-closed registry · F1.1)
- `src/lib/automation/labels.ts` — `tenant.branding.updated` + ป้ายไทย (spread ต่อไป `WEBHOOK_EVENTS` อัตโนมัติ)
- `src/lib/outbox-consumers.ts` — consumer `tenant.branding.updated` (ล้างแคชธีมของอินสแตนซ์ที่ระบายคิว)
- `src/app/api/mobile/me/route.ts` — เพิ่ม `branding` ต่อ membership
- `src/app/app/settings/branding/actions.ts` — ส่ง `updatedById` จาก session (หน้าจอใหม่ทั้งหน้าเป็นงาน B2)

## 2. Schema (additive ล้วน)

```
enum NavTone { LIGHT BRAND DARK }
TenantBranding + brandFg String? · navTone NavTone @default(LIGHT)
               + applyStorefront Boolean @default(true) · applyMobile Boolean @default(true)
               + updatedById String?
enum IssueKind { BUG DISPLAY IDEA } · enum IssueStatus { OPEN ACK DONE }
IssueReport { id tenantId userId? kind message pageUrl userAgent appVersion? screenshotUrl?
              status @default(OPEN) createdAt updatedAt
              @@index([tenantId,status]) @@index([tenantId,createdAt]) }
```

ไมเกรชัน: `CREATE TYPE` ห่อ `DO $$ … EXCEPTION WHEN duplicate_object` (Postgres ไม่มี `IF NOT EXISTS` ให้ type) ·
คอลัมน์ใหม่ทุกตัว `ADD COLUMN IF NOT EXISTS` + nullable หรือ `NOT NULL DEFAULT` คงที่ (PG11+ ไม่ rewrite ตาราง = ไม่ล็อกยาวบน prod) ·
`CREATE TABLE/INDEX IF NOT EXISTS` · ไม่มีคำสั่งทำลายใด ๆ · ลงบน branch QC (`ep-plain-art`) แล้ว — **ยังไม่ลง prod** (เจ้าของ/Fable เป็นคนสั่ง `migrate deploy` เอง ตามกติกา)

## 3. แผนที่ฟังก์ชัน

`color.ts` (pure)
- `isHex(s)` · `hexToRgb` · `relativeLuminance(hex)` · `contrastRatio(a,b)` — **WCAG 2.x เป๊ะ** (piecewise `c/12.92` / `((c+.055)/1.055)^2.4`)
- `pickReadableFg(hex) → "#ffffff" | "#0a0a0a"` (ratio สูงกว่าชนะ · เสมอ → ขาว)
- `meetsAA(ratio, large?)` (ให้ B2 ใช้กับกล่อง "ผ่าน AA") · `softOf(hex)` → `rgba(...,0.08)` · `fgAlpha(fg, a)`

`service.ts`
- `getBrandingTokens(tenantId) → BrandingTokens` = `{ displayName, logoUrl, accent, accentFg, accentSoft, navTone, navBg, navFg, navFg2, navOn, applyStorefront, applyMobile, isDefault }`
  - ปริยาย: `accent #1d4ed8` · `accentFg #ffffff` · `navTone LIGHT` · `navBg #fafafa` · `navFg #0a0a0a` · `navFg2 #737373` · `navOn #ffffff`
  - `BRAND` → `navBg=accent` · `navFg=accentFg` · `navFg2=rgba(accentFg,.72)` · `navOn=rgba(accentFg,.16)`
  - `DARK` → `#111827` / `#f9fafb` / `#9ca3af` / `rgba(255,255,255,0.1)`
  - `isDefault` = ยังไม่เลือก `brandColor` (ไม่ใช่ "ไม่มีแถว") — ร้านที่ตั้งแค่ชื่อ/สวิตช์ก็ยังนับว่าใช้ธีมปริยาย
- `setBranding(ctx, input)` — hex/URL/โทน ผิด → `throw` ไทย · คำนวณ `brandFg` ทุกครั้งที่สีเปลี่ยน (`""` = ล้างสี → `brandFg=null`) ·
  เขียนแถว + `emitOutbox("tenant.branding.updated")` ใน **tx เดียว** (idempotencyKey `branding#<tenantId>#<updatedAt ms>`) ·
  ล้างแคช · `writeAudit("branding.updated")` พร้อม before/after + `fields` ที่เปลี่ยน · `scheduleDrain()` ให้ฮุค/กฎอัตโนมัติได้ยินทันที
- `getPublicBranding(tenantId)` — สัญญาเดิมทุกตัวอักษร แต่ภายในอ่านจาก tokens · `applyStorefront=false` → `brandColor/logoUrl = null` แต่ **คงชื่อที่แสดง** (ชื่อกิจการไม่ใช่ธีม — ลูกค้าต้องรู้ว่าจองกับใคร)
- `getBranding(ctx)` — คืนฟิลด์ใหม่เพิ่ม (หน้า B2 ใช้เติมฟอร์ม) · ยังคืน `null` เมื่อไม่มีแถวเหมือนเดิม

`issues.ts` — `createIssueReport` (kind ผิด/ข้อความว่าง/เกิน 2000/ไม่รู้หน้า → throw ไทย · แจ้ง ops ผ่าน `logOps("WARN","issue-report",…)`) · `listIssueReports(ctx,{status?,limit?})` (ใหม่ก่อน · เพดาน 500) · `setIssueStatus(ctx,id,status)` · `ISSUE_KIND_LABEL` / `ISSUE_STATUS_LABEL` ให้ B3 ใช้

`/api/mobile/me` — ต่อ membership: `applyMobile ? { displayName, logoUrl, accent, accentFg, navTone } : null`

## 4. ดีไซน์ของแคช

- `Map<tenantId, {at, tokens}>` ระดับโมดูล · TTL 60 วิ · `invalidateBrandingCache(tenantId?)` (ไม่ส่ง = ล้างทั้งโปรเซส สำหรับสคริปต์/ข้อสอบ)
- ล้าง 2 ทาง: (1) `setBranding` ล้างของอินสแตนซ์ที่กดบันทึก → คนกดเห็นผลทันที (2) consumer ของ `tenant.branding.updated` ล้างของอินสแตนซ์ที่ระบายคิว
- อินสแตนซ์อื่นบน serverless รอไม่เกิน 60 วิ — ยอมรับได้เพราะธีมเปลี่ยนปีละไม่กี่ครั้ง แต่ถูกอ่านทุกคำขอ
- ฝั่งแอปมือถือ (B5) แคชในเครื่องเองอีกชั้น — ฮุค `tenant.branding.updated` คือสัญญาณให้ดึงใหม่

## 5. ส่วนที่ตัดสินใจเอง / ต่างจากตัวหนังสือใน WO

1. **ไม่ทำ `logoSmallUrl`** — T5 ตัด sharp ออกแล้ว (ไม่มี resize ฝั่งเซิร์ฟเวอร์) · เก็บ URL เดียว ใช้ CSS ย่อ · §สัญญา B1 ก็ไม่ได้ขอคอลัมน์นี้ (มีแต่ §6 ของแบบซึ่งเขียนไว้ก่อนเคาะ T5)
2. **แจ้ง ops ใช้ `logOps` ไม่ใช่ outbox `issue.reported`** — สัญญาเขียนว่า "ถ้าไม่มีช่องทาง ให้ log + outbox" · มี `src/lib/core/ops.ts` อยู่แล้ว จึงไม่เพิ่ม event ใหม่ (event ใหม่ = ต้องมี consumer + ป้าย ไม่งั้นคิวตัน) · ระดับ `WARN` ไม่ใช่ `ERROR` เพราะ ERROR ยิงอีเมลเตือนทุกครั้งที่มีคนบ่น
3. **`setBranding` เขียนผ่าน `prisma.$transaction`** (ไม่ใช่ `tenantDb`) เฉพาะขั้นเขียน+emit — เพราะ `emitOutbox` ต้องการ `tx` ตัวเดียวกับงานหลัก · การอ่าน `before` ยังผ่าน `tenantDb` และ `where` เป็น `tenantId` (unique) จึงยังผูกร้านเป๊ะ
4. **`scheduleDrain` โหลดแบบ lazy** (`await import`) — `outbox-consumers.ts` import `invalidateBrandingCache` จาก service ⇒ import ตรงจะเป็นวงกลม
5. **`isDefault` นิยาม = ยังไม่มี `brandColor`** (ไม่ใช่ "ไม่มีแถว") — ไม่งั้นร้านที่แค่ปิดสวิตช์หน้าร้านจะกลายเป็น "ตั้งธีมแล้ว" ทั้งที่ยังไม่ได้เลือกสี และ `getPublicBranding` จะเริ่มคืน `#1d4ed8` แทน `null` = เปลี่ยนพฤติกรรมหน้าร้านเดิม
6. **เพิ่ม index `[tenantId, createdAt]`** ให้ `IssueReport` (สัญญาขอแค่ `[tenantId,status]`) — หน้ารายการเรียงตามเวลาเสมอ

## 6. 🔴 ข้อที่ค้าง: `B1-S2.1` — ตัวเลขในข้อสอบไม่ตรงกับ WCAG 2.x

ข้อสอบคาด `contrastRatio("#ffffff","#0E7490") ≈ 5.9 ± 0.3` · โค้ดคืน **5.36**

หลักฐานว่า 5.36 คือค่าที่ถูก (สูตร WCAG 2.x — `docs`: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance):

| คู่สี | โค้ดนี้ | ค่าอ้างอิงสาธารณะ (WebAIM/DevTools) |
|---|---|---|
| `#767676` / `#ffffff` | 4.54 | 4.54 (สีเทาที่ "เพิ่งผ่าน AA" ที่คนอ้างกันบ่อย) |
| `#0000ff` / `#ffffff` | 8.59 | 8.59 |
| `#000000` / `#ffffff` | 21.00 | 21 |
| `#0E7490` / `#ffffff` | **5.36** | 5.36 |

ที่มาของเลข 5.9: ถ้า **ข้ามท่อน piecewise** ของ WCAG แล้วใช้ `Math.pow(c/255, 2.4)` ตรง ๆ จะได้ **5.948** (และ `#0a0a0a/#FDE047` = 15.59)
— ซึ่งน่าจะเป็นตัวเลขที่ไปอยู่ในภาพแบบ `01-settings.html` ("ตัวอักษรบนสีนี้ใช้ ขาว · 5.9:1 ผ่าน AA")

ทำไมไม่ยอมใช้สูตรที่ให้ 5.9: กล่องผลตรวจใน B2 จะโชว์ตัวเลขที่ **ไม่ตรงกับเครื่องมือทุกตัวในโลก** และแพงกว่านั้นคือมัน
**ประเมินสูงเกินจริงราว 10%** ⇒ สีที่จริง ๆ ได้ 4.3 (ตก AA) จะถูกโชว์ว่า 4.7 "ผ่าน AA" = ระบบโกหกเรื่องการเข้าถึงได้

ทางแก้ที่เสนอ (Fable เป็นเจ้าของข้อสอบ — ผมไม่แตะ): แก้ค่าคาดใน `qc-branding-b1.mts` เป็น `5.36 ± 0.05`
และแก้ข้อความในภาพแบบเป็น "5.36:1 ผ่าน AA" · ข้ออื่นในเช็คเดียวกัน (`#0a0a0a/#FDE047 > 14` → ได้ 15.02) ผ่านอยู่แล้ว
`pickReadableFg` ไม่กระทบเลยไม่ว่าจะใช้สูตรไหน (ลำดับความคมชัดเหมือนกัน) ⇒ **ไม่มีผลกับพฤติกรรมจริงของธีม**

## 7. ผลด่าน

```
pnpm exec tsx scripts/qc-branding-b1.mts
  ผ่าน 20/21 · FINDINGS: CRITICAL 1 · MAJOR 0 · MINOR 0
  JSON_SUMMARY {"total":21,"passed":20,"findings":["B1-S2.1"]}   ← ดู §6

scripts/qc-branding.mts (white label เดิม)   ผ่าน 5/5 · CRITICAL 0
scripts/qc-mobile-app.mts                    38/38 ผ่าน · CRITICAL fail 0
scripts/qc-mobile-auth.mts (แตะ /api/mobile/me)  31/31 ผ่าน · CRITICAL fail 0
pnpm typecheck                               0 error
pnpm exec tsx scripts/fitness.mts (ไม่ export env)  ผ่าน 23/23 · CRITICAL 0  (F1.1 รู้จัก IssueReport · F10.1 ผ่าน)
```
ไม่มีชุด `qc-*storefront*` / `qc-white-label*` / `qc-outbox*` ในรีโป (มีแต่ `diag-outbox-lag.mts` ซึ่งเป็นเครื่องมือวินิจฉัย ไม่ใช่ข้อสอบ)

## 8. จุดที่อยากให้ Fable ลองแหย่

1. **ข้อ §6** — ตัดสินให้ทีว่าจะยึด WCAG จริง (5.36) หรือยึดเลขในภาพแบบ
2. **แคช 60 วิ ข้ามอินสแตนซ์** — เปิด 2 แท็บ/2 แลมบ์ดา แล้วบันทึกธีม: อีกฝั่งจะเห็นของเก่าได้ถึง 60 วิ (ตั้งใจ) · ถ้าเจ้าของรับไม่ได้ ต้องขยับไปใช้ `revalidateTag`/หัวข้อ realtime แทน
3. **`idempotencyKey = branding#<tenantId>#<updatedAt ms>`** — ถ้ามีใครกดบันทึก 2 ครั้งภายในมิลลิวินาทีเดียวกัน event ที่สองจะถูกกลืนเงียบ ๆ (นับ outbox ได้ 1 แทน 2) · วัดจริงบน Neon ห่างกันหลาย ms เสมอ แต่ถ้าอยากกันเด็ดขาดต้องเติม nonce
4. **`getPublicBranding` เมื่อ `applyStorefront=false`** — ผมคง `displayName` ไว้ตามข้อสอบ · ถ้าเจตนาคือ "หน้าร้านต้องดูเป็น SHARK ล้วน" ต้องคืนชื่อ tenant ดิบ ๆ แทนชื่อที่แสดง (เปลี่ยนได้ที่เดียว)
5. **`/api/mobile/me` ยิง `getBrandingTokens` ต่อ membership** — คนที่อยู่ 10 ร้านจะได้ 10 query ในครั้งแรก (หลังจากนั้นแคช 60 วิ) · ถ้าอยากให้จบใน query เดียวต้องทำ `getBrandingTokensMany`
6. **`IssueReport.userId` ไม่มี FK ไป `User`** (ตามธรรมเนียมของรีโปที่ไม่ผูก relation ข้าม axis) — ลบผู้ใช้แล้วแถวยังอยู่ โดยตั้งใจ (ประวัติต้องไม่หาย) แต่ต้อง join เอง
7. **สิทธิ์ของ `issues.ts`** — B1 เป็นชั้น service ล้วน ยังไม่มี `assertCan` (คนแจ้ง = ใครก็ได้ที่ล็อกอินในร้าน · คนเปลี่ยนสถานะควรเป็น OWNER/ADMIN) ⇒ **B3 ต้องใส่ด่านสิทธิ์ตอนต่อปุ่ม** ไม่งั้นพนักงานเปลี่ยนสถานะเรื่องของคนอื่นได้
