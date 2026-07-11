# SHARK — พิมพ์เขียวความปลอดภัย (SECURITY.md)

> อ่านคู่กับ `BLUEPRINT.md` · `BLUEPRINT_BUSINESS_UNITS.md` · `modules/_CONVENTIONS.md` · `WORKPLAN_PARALLEL.md`
> ขอบเขต: **defensive security ของระบบเราเอง** — multi-tenant SaaS ที่ถือข้อมูลลูกค้า, เงิน (satang ledger), แต้ม/คูปอง, และ credential ช่องทางแชทของร้าน
> ภาษา: สเปคไทย, code อังกฤษ — เหมือนสเปคโมดูล

## ป้ายกำกับ Stage (ใช้ทั้งไฟล์)

| ป้าย | ความหมาย |
|---|---|
| **[A]** | ต้องอยู่ใน **Stage A — CORE** (freeze พร้อม `lib/core/`) — เลื่อนไม่ได้ เพราะทุกโมดูลเกาะ |
| **[B]** | ทำใน **Stage B/C** พร้อมโมดูลที่เกี่ยว (POS/Point/Coupon ฯลฯ) |
| **[L]** | ต้องเสร็จ **ก่อน launch production** (มีผู้ใช้จริง/เงินจริง) |
| **[🔜]** | หลัง launch ได้ — แต่ต้องวาง schema/hook รองรับตั้งแต่ตอนนี้ |

กติกาเหล็กข้อ 0: **ความปลอดภัยอยู่ใน `lib/core/` เท่านั้น** — session โมดูลห้าม implement auth/guard/rate-limit เอง ห้าม bypass ต้องเรียกผ่าน core + contracts ตาม WORKPLAN_PARALLEL ข้อ 3

---

## 1. Authentication (passwordless email)

### 1.1 Magic Link [A]

- Token: 256-bit random (`crypto.randomBytes(32)`), ส่งใน URL, **DB เก็บเฉพาะ SHA-256 hash** — DB หลุด token ใช้ไม่ได้
- อายุ **15 นาที**, **ใช้ครั้งเดียว** (consume แบบ atomic: `UPDATE ... WHERE usedAt IS NULL` เช็ค affected row — กัน race กดลิงก์ 2 แท็บ)
- ผูก token กับ email + purpose (`LOGIN` | `INVITE` | `EMAIL_CHANGE`) — token ประเภทหนึ่งใช้ข้ามประเภทไม่ได้
- ขอลิงก์ใหม่ → invalidate token เก่าทั้งหมดของ email นั้น (purpose เดียวกัน)
- Endpoint verify เป็น **POST จากหน้า interstitial** ("กดปุ่มเพื่อเข้าสู่ระบบ") ไม่ consume ตอน GET — กัน email scanner/prefetch ของ corporate mail เผา token ทิ้ง
- ห้ามใส่ token ลง log/analytics/Referer (`Referrer-Policy` ช่วยชั้นหนึ่ง — ดูข้อ 8)

```prisma
model AuthToken {
  id        String    @id @default(cuid())
  email     String
  tokenHash String    @unique          // sha256(token) — never the raw token
  purpose   TokenPurpose               // LOGIN | INVITE | EMAIL_CHANGE
  expiresAt DateTime                   // now() + 15m
  usedAt    DateTime?
  ip        String?                    // requester IP (audit)
  createdAt DateTime  @default(now())
  @@index([email, purpose])
}
```

```ts
// lib/core/auth/consume.ts — single-use, race-safe
const { count } = await prisma.authToken.updateMany({
  where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } },
  data: { usedAt: new Date() },
});
if (count !== 1) return fail("TOKEN_INVALID"); // expired/used/unknown — ข้อความเดียวกันหมด
```

### 1.2 OTP fallback [A]

- 6 หลัก, อายุ 10 นาที, เก็บ hash เช่นกัน (+ per-OTP salt กัน rainbow เพราะ space เล็ก)
- **ผิดได้ 5 ครั้ง/OTP → token ตาย** ต้องขอใหม่ · ขอได้ **3 ครั้ง/email/15 นาที** · **lockout email 30 นาที** เมื่อผิดสะสม 10 ครั้ง/ชั่วโมง (นับที่ email ไม่ใช่ IP อย่างเดียว — กัน distributed guess)
- เทียบด้วย constant-time compare (`crypto.timingSafeEqual`)

### 1.3 Session [A]

- Session id = 256-bit random, DB เก็บ hash, cookie เก็บ raw
- Cookie: `httpOnly; Secure; SameSite=Lax; Path=/` + `__Host-` prefix (`__Host-shark_session`) — กัน subdomain cookie injection จาก storefront/custom domain
- **Backoffice ใช้ cookie คนละตัว คนละ session table** (`__Host-bo_session` — SameSite=Strict, ยึดตาม 15-backoffice §3.1 / RESOLUTIONS D13) บน `backoffice.shark.in.th` — session ร้านใช้กับ backoffice ไม่ได้เด็ดขาด (PlatformUser แยกตารางอยู่แล้วตาม BLUEPRINT §3)
- อายุ: idle timeout **7 วัน**, absolute **30 วัน** · backoffice: idle **60 นาที**, absolute **12 ชม.** (ตาม 15-backoffice §3.1 — D13)
- **Rotation:** ออก session id ใหม่ทุกครั้งที่ (ก) login (ข) สิทธิ์เปลี่ยน (role/unitAccess) (ค) เปิด/ปิด 2FA — กัน session fixation
- **Revoke:** ผู้ใช้เห็นรายการ device (UA + IP คร่าวๆ + last active) + ปุ่ม "ออกจากระบบทุกเครื่อง" · ระบบ revoke อัตโนมัติเมื่อ email เปลี่ยน หรือ OWNER ถอด Membership
- ทุก request ตรวจ session → โหลด Membership สดจาก DB (cache ≤ 60 วิ) — **ห้าม cache permissions ใน JWT/cookie** เพราะถอดสิทธิ์ต้องมีผลทันที

```prisma
model Session {
  id         String   @id @default(cuid())
  userId     String
  tokenHash  String   @unique
  createdAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())
  expiresAt  DateTime               // absolute
  ip         String?
  userAgent  String?
  revokedAt  DateTime?
  @@index([userId])
}
```

### 1.4 2FA TOTP [🔜 แต่วาง schema ตอนนี้]

- บังคับ: **PlatformUser ทุกคน [L]** · **OWNER [🔜]** (เชิญชวนก่อน แล้วบังคับเมื่อ tenant มีเงินจริงไหลผ่าน)
- TOTP (RFC 6238), secret เข้ารหัส field-level (ดูข้อ 6.2), recovery codes 10 ชุด (เก็บ hash, ใช้ครั้งเดียว)
- Step-up: action อ่อนไหว (เปลี่ยน payout, ปิด 2FA, export ข้อมูลลูกค้าทั้งหมด, ลบ unit) ให้ถาม TOTP ซ้ำแม้ login อยู่

### 1.5 กัน email enumeration [A]

- ทุก endpoint ที่รับ email (ขอ magic link, ขอ OTP, สมัคร): ตอบ **ข้อความเดียวกันเสมอ** — "ถ้าอีเมลนี้มีบัญชี เราได้ส่งลิงก์ไปแล้ว" ไม่ว่า email มีจริงหรือไม่
- Timing: ทำงานให้ใช้เวลาใกล้กัน (email ไม่มีบัญชี → ยัง hash/enqueue dummy) หรือตอบทันทีแล้วส่งเมล async
- Rate limit ก่อนถึง logic (ข้อ 5.1) — enumeration ที่เหลือแพงเกินคุ้ม

---

## 2. Authorization

### 2.1 จุดบังคับ `can()` 4 มิติ [A]

`can(user, { tenantId, unitId?, module, action })` (BLUEPRINT_BUSINESS_UNITS §3) คือ **จุดตรวจเดียว** — กติกา:

1. **ทุก API route handler และทุก server action** เริ่มด้วย `requireAuth()` → `can()` **ก่อน**แตะ DB — ไม่มีข้อยกเว้น แม้ endpoint "อ่านอย่างเดียว"
2. unit-scoped route (`/api/u/[unitId]/...`): middleware ตรวจ `unitId ∈ tenant ของ session` + `can()` ก่อนเข้า handler — handler รับ `ctx` ที่ผ่านการตรวจแล้ว **ห้ามอ่าน tenantId/unitId จาก body/query/client state** (BLUEPRINT_BUSINESS_UNITS §8.2)
3. UI ซ่อนเมนูด้วย `can()` ตัวเดียวกัน — แต่การซ่อน UI **ไม่ใช่** การควบคุมสิทธิ์ ชั้นจริงคือ server
4. Default **deny**: module ไม่อยู่ใน `enabledModules` ของ tenant หรือ permission ไม่ระบุ = ปฏิเสธ

```ts
// lib/core/rbac/guard.ts — ทุก handler ใช้ pattern นี้
export async function withUnitCtx(req: Request, params: { unitId: string },
  need: { module: Module; action: Action }) {
  const session = await requireSession(req);                    // 401 → login
  const unit = await getUnitInTenant(session.tenantId, params.unitId);
  if (!unit) notFound();                                        // 404 — ไม่ใช่ 403 (ข้อ 2.4)
  if (!can(session, { tenantId: session.tenantId, unitId: unit.id, ...need })) notFound();
  return { session, tenant: session.tenantId, unit };           // ctx ที่ downstream เชื่อได้
}
```

### 2.2 Prisma tenant/unit guard = defense-in-depth ชั้น 2 [A]

- Prisma client extension inject `where: { tenantId }` ทุก query + dev-throw เมื่อ unit-scoped model ไม่ระบุ `unitId` (BLUEPRINT_BUSINESS_UNITS §2) — นี่คือ**ตาข่ายชั้นสอง** ไม่ใช่ตัวแทน `can()`
- **กติกา "ไม่มี query ไหนออกจาก handler โดยไม่ผ่าน guard":** raw `PrismaClient` (ไม่ extend) export จาก `lib/core/db/raw.ts` เท่านั้น, ใช้ได้เฉพาะ (ก) migration/seed (ข) platform-level model (Tenant, PlatformUser, AuthToken) (ค) cron ที่ประกาศ `SYSTEM_CONTEXT` ชัดเจน — lint rule ห้าม import `raw.ts` นอก `lib/core/`
- `crossUnit: true` flag ใช้ได้เฉพาะรายงานรวม (ยัง scope tenantId เสมอ) — grep-able, review ทุกจุดที่ใช้
- production: guard ที่ขาด tenantId → **throw เสมอ** (ไม่ใช่แค่ dev) — พังดีกว่ารั่ว
- [🔜] พิจารณา Postgres RLS เป็นชั้น 3 (SET `app.tenant_id` ต่อ transaction) เมื่อทีมโตขึ้น — ตอนนี้ 2 ชั้น + เทสหนัก (ข้อ 3) เพียงพอ

### 2.3 Contract services ก็ต้องตรวจ [B]

`createSale` / `point.earn|burn|adjust` / `coupon.redeem` / `account.post` รับ `tenantId, unitId` จาก **ctx ที่ตรวจแล้วเท่านั้น** — ห้าม caller ส่งค่าที่มาจาก client ตรงๆ และ service ต้องตรวจซ้ำว่า refs ทั้งหมด (memberId, couponCode, saleId) อยู่ tenant เดียวกัน — กัน "confused deputy" ที่โมดูลหนึ่งพาข้อมูลข้าม tenant ผ่าน service กลาง

### 2.4 404 แทน 403 [A]

- Resource ที่อยู่คนละ tenant / คนละ unit / ไม่มีสิทธิ์เห็น → ตอบ **404** เสมอ (ทั้ง API และ page) — กัน enumeration ว่า id ไหนมีจริง
- 403 ใช้เฉพาะกรณี "รู้ว่ามีอยู่แน่ๆ ใน tenant ตัวเองแต่ role ไม่ถึง" (เช่น STAFF กดหน้า settings) — เพื่อ UX
- id เป็น cuid (เดายาก) แต่**ห้าม**ถือว่า id ลับ — สิทธิ์คือชั้นควบคุม ไม่ใช่ความเดายากของ id

---

## 3. Tenant Isolation Testing [A — คือ gate ของ CORE]

BLUEPRINT §11 เตือนแล้ว: 1 บั๊ก = ข้อมูลข้ามร้าน นี่คือความเสี่ยงอันดับ 1 ของแพลตฟอร์ม

### 3.1 ชุดเทสบังคับ (fixture มาตรฐาน)

Fixture กลาง `test/fixtures/isolation.ts`: **Tenant X (unit X1, X2) + Tenant Y (unit Y1, Y2)** + ผู้ใช้ครบบทบาท (OWNER-X, MANAGER-X1, STAFF-X1-POS, CUSTOMER ที่เป็นสมาชิกทั้ง X และ Y, PlatformUser)

ทุก endpoint ต้องผ่าน matrix ต่อไปนี้ (เขียนเป็น test helper ยิงอัตโนมัติจาก route manifest):

| เคส | คาดหวัง |
|---|---|
| user ของ X อ่าน/แก้ resource id ของ Y (ยิงตรงด้วย id) | **404** |
| MANAGER-X1 แตะ resource ของ unit X2 | **404** |
| STAFF-X1-POS เรียก action นอก module ที่ได้สิทธิ์ | 403/404 ตามข้อ 2.4 |
| list endpoint ของ X | ไม่มีแถวของ Y ปน (assert ทุก field รวม aggregate/count) |
| CUSTOMER ดูแต้ม | เห็นเฉพาาะ CustomerProfile ของ tenant นั้น — แต้ม X ไม่โผล่ใน Y |
| mutation แนบ `tenantId`/`unitId` ของคนอื่นใน body | ค่าใน body ถูกเมิน — ผลลัพธ์เขียนลง tenant/unit ของ ctx เท่านั้น |
| ยิง `/api/u/[unitY1]/...` ด้วย session ของ X | **404** ที่ middleware |

### 3.2 CI gate

- `pnpm check <module>` (WORKPLAN §3.6) **รวม isolation suite เสมอ** — merge เข้า `main` ไม่ได้ถ้าแดง
- Route ใหม่ต้องลงทะเบียนใน route manifest → เทส matrix generate อัตโนมัติ · route ที่ไม่อยู่ใน manifest → CI fail (กัน endpoint หลุดตรวจ)
- [L] เพิ่ม smoke isolation test ยิงใส่ staging จริง (HTTP จริง ไม่ mock) ก่อนทุก release

---

## 4. Input / Output Security

### 4.1 Validation — zod ทุก endpoint [A]

- ทุก route/server action: `schema.parse()` ที่ขอบ ก่อน logic — ไม่มี `any` ทะลุเข้า
- `z.object({...}).strict()` — ปฏิเสธ field เกิน (**กัน mass assignment**: client ยัด `role`, `pointBalance`, `tenantId` มาใน payload)
- เงินรับเป็น `z.number().int().nonnegative()` (satang — _CONVENTIONS §3) · แต้ม/qty มี max ที่สมเหตุผล · string มี `.max()` ทุกตัว (กัน payload ยักษ์)
- id จาก params: `z.string().cuid()` ก่อนใช้

### 4.2 XSS [A]

- React escape by default — กติกา: **ห้ามใช้ `dangerouslySetInnerHTML`** ยกเว้นผ่าน sanitizer กลาง (`lib/core/sanitize.ts` — DOMPurify/`sanitize-html` allowlist แท็กจำเป็น) และต้อง review
- จุดเสี่ยงเฉพาะ SHARK: ชื่อร้าน/เมนู/ข้อความแชท/canned response/ประกาศ — โผล่ทั้ง dashboard, storefront (คนละ origin/custom domain), จอ TV เรียกคิว, ใบเสร็จ HTML → ทุกจุด render ผ่าน React หรือ sanitizer เท่านั้น
- CSP header เป็นชั้นสอง (ค่าอยู่ข้อ 8.1) · JSON response ตั้ง `Content-Type: application/json` + `X-Content-Type-Options: nosniff`

### 4.3 SQL Injection [A]

- Prisma query builder = parametrized ปลอดภัยโดย default
- `$queryRaw` ใช้ **tagged template เท่านั้น** (`$queryRaw\`...WHERE id = ${id}\`` — Prisma parametrize ให้) — **ห้าม** `$queryRawUnsafe` / string concatenation · lint rule ban `Unsafe` variants
- raw query ทุกจุดต้องมี `tenantId` ใน WHERE ด้วยมือ (extension ช่วยไม่ได้กับ raw) + comment `-- ISOLATION: manual` ให้ grep ตรวจได้

### 4.4 File upload [A2 — object storage service]

- Endpoint upload กลางเดียว (`lib/core/storage/`) — โมดูลห้ามรับไฟล์เอง
- ตรวจ: **magic bytes sniff** (ไม่เชื่อ extension/`Content-Type` ที่ client ส่ง), allowlist ประเภท (image/webp,png,jpeg + pdf สำหรับเอกสาร), ขนาด ≤ 10MB (config ต่อ use case), รูปทำ re-encode (sharp) — ล้าง metadata/สคริปต์ฝัง
- ชื่อไฟล์: **สุ่มใหม่** (`{cuid}.{ext-จาก-sniff}`) — ไม่ใช้ชื่อจาก user (กัน path traversal + เดา URL)
- Path แยก tenant: `tenant/{tenantId}/unit/{unitId}/...` — ตรวจสิทธิ์ก่อน sign URL เสมอ
- **ไม่ serve จาก app origin**: เสิร์ฟผ่าน CDN/object storage domain แยก (`usercontent.shark.in.th` หรือ Bunny CDN) + `Content-Disposition` เหมาะสม — ไฟล์ user อยู่คนละ origin กับ cookie
- ไฟล์ private (สลิปโอน, เอกสารบัญชี): **signed URL อายุสั้น** (≤ 15 นาที) เท่านั้น

### 4.5 SSRF [B — Chat/webhook, L ก่อนเปิด integration]

จุดที่ระบบ fetch URL จากภายนอก/ที่ user กำหนด (webhook ขาออก, ดึงรูปจาก URL, LINE/FB callback verify):
- Allowlist scheme `https:` เท่านั้น · resolve DNS แล้ว **บล็อก IP private/loopback/link-local/metadata** (10.x, 172.16/12, 192.168.x, 127.x, 169.254.x, ::1, fd00::/8) — ตรวจ**หลัง resolve** และปักหมุด IP ที่ resolve แล้ว (กัน DNS rebinding)
- ห้าม follow redirect ข้าม host โดยไม่ตรวจซ้ำ · timeout 10s · จำกัดขนาด response
- รวมเป็น `lib/core/net/safeFetch.ts` — โมดูลห้าม `fetch` URL ภายนอกที่ user ป้อนเอง

---

## 5. API Security

### 5.1 Rate limiting [A]

3 มิติ (นับแยก): **ต่อ IP** (ชั้นแรก กัน brute/scan) · **ต่อ user** (กัน credential ถูกยึดไปยิง) · **ต่อ tenant** (กัน tenant เดียวกิน resource/abuse)

| กลุ่ม endpoint | limit (ตั้งต้น — config ได้) |
|---|---|
| ขอ magic link / OTP | 3/email/15m · 10/IP/h |
| verify OTP | 5 ผิด/OTP · lockout ตามข้อ 1.2 |
| สมัคร tenant ใหม่ | 3/IP/วัน + งาน manual review ที่ backoffice |
| coupon validate/redeem | 10/member/h · 60/unit/h (กันเดา code — ดู threat model) |
| ใช้แต้ม/redeem reward | 10/member/h |
| ยิง QR check-in (ตั๋ว/สมาชิก) | 30/device/m |
| API ทั่วไป (อ่าน) | 300/user/m · 1000/tenant/m |
| mutation ทั่วไป | 60/user/m |

- Implement ที่ middleware กลาง (in-memory + Redis เมื่อ scale) — ตอบ `429` + `Retry-After` · เหตุการณ์ชน limit ซ้ำๆ → security event (ข้อ 7.2)
- Endpoint auth ทั้งหมด limit **ก่อน** ทำงานใดๆ

### 5.2 CSRF [A]

- ชั้น 1: `SameSite=Lax` cookie (ข้อ 1.3)
- ชั้น 2: **ทุก mutation (POST/PUT/PATCH/DELETE) ตรวจ `Origin`/`Sec-Fetch-Site` header** เทียบ allowlist (app origin + custom domain ของ tenant นั้นสำหรับ storefront route) — mismatch → 403 + log
- Server Actions ของ Next.js มี origin check ในตัว — ตั้ง `serverActions.allowedOrigins` ให้ครอบ custom domain flow
- ห้ามมี state-changing GET เด็ดขาด (รวมถึงลิงก์ "ยกเลิกจอง" ในอีเมล → พาไปหน้า confirm ก่อน)

### 5.3 Idempotency keys [B — บังคับกับเงิน/แต้ม]

- Mutation ที่สร้างผลทางการเงิน (`createSale`, จ่ายเงิน, `point.earn/burn`, `coupon.redeem`, จองห้อง/คิว/ตั๋ว): client ส่ง `Idempotency-Key` header (uuid) — server เก็บ `(tenantId, key) → response hash` อายุ 24 ชม. ยิงซ้ำได้ response เดิม ไม่เกิดรายการซ้ำ
- ชั้นในสุด: unique constraint จริงใน DB (`@@unique([unitId, receiptNo])`, ledger ref unique) — idempotency layer พังก็ยังไม่ double-post

### 5.4 Webhook signing [B/L]

**ขาเข้า (payment callback — Beam/Omise/Stripe, LINE):**
- ตรวจ **HMAC signature ตาม spec ของ gateway** ทุก request ก่อน parse business logic · ตรวจ timestamp ±5 นาที (กัน replay) · เก็บ `eventId` ที่ process แล้ว (dedupe)
- Endpoint webhook แยก route, ไม่ใช้ session, rate limit ต่อ IP, ตอบเร็ว (enqueue → process async)
- **ห้ามเชื่อ amount/status จาก callback อย่างเดียว** — ยืนยันด้วย API call กลับไปที่ gateway (ข้อ 10)

**ขาออก (แจ้ง event ไประบบร้าน [🔜]):**
- เซ็น `X-Shark-Signature: t={ts},v1=HMAC_SHA256(secret, ts + "." + body)` — secret ต่อ endpoint ต่อ tenant, โชว์ครั้งเดียวตอนสร้าง, rotate ได้ (รองรับ 2 secret ช่วง overlap)
- ส่งผ่าน `safeFetch` (ข้อ 4.5) · retry with backoff · หยุด+แจ้งเมื่อ fail ต่อเนื่อง

---

## 6. Data Protection

### 6.1 In transit [A/L]

- TLS 1.2+ ทุกชั้น: browser→proxy (Caddy/Nginx auto-TLS รวม custom domain — ข้อ 11), proxy→app, app→Postgres (`sslmode=require` เมื่อ DB คนละเครื่อง), app→object storage/gateway
- HTTP → redirect HTTPS + HSTS (ข้อ 8.1) · cookie `Secure` ทั้งหมด

### 6.2 At rest [L]

- Disk/volume encryption ที่ระดับ infra (LUKS/provider-managed) + **field-level encryption** สำหรับ secret ที่ต้องอ่านกลับได้:
  - token ช่องทางแชทของร้าน (LINE channel token, FB page token), webhook secret, TOTP secret, gateway credential ต่อ tenant
  - AES-256-GCM ผ่าน `lib/core/crypto/` — key จาก env/KMS (ไม่อยู่ใน DB), เก็บ `keyVersion` ต่อแถวเพื่อ rotate ได้
- ค่าที่ไม่ต้องอ่านกลับ (token login, OTP, session, recovery codes) → **hash เท่านั้น** (ข้อ 1)

```prisma
model ChannelCredential {          // ตัวอย่าง: LINE/FB token ของร้าน
  id         String  @id @default(cuid())
  tenantId   String
  channel    ChatChannel            // LINE | FACEBOOK | ...
  encPayload Bytes                  // AES-256-GCM(secret json)
  keyVersion Int
  @@unique([tenantId, channel])
}
```

### 6.3 Secrets management [A → L]

- [A] `.env` local + `.env.example` (ไม่มีค่าจริง) · `.gitignore` ครอบ `.env*` · **pre-commit secret scan** (gitleaks) ใน CI — commit ติด secret = fail
- [L] production: secret ผ่าน env ของ orchestrator (Docker secrets / Vercel env / vault) — ไม่มีไฟล์ .env ใน image, ไม่ log ค่า env
- Rotate ได้ทุกตัว: DB password, session signing, field-encryption key (keyVersion), gateway keys — เขียนขั้นตอน rotate ไว้ใน runbook · rotate ทันทีเมื่อคนออกจากทีม/สงสัยรั่ว
- แต่ละ integration ใช้ key ของโปรเจกต์ SHARK เอง — ไม่ยืมข้ามโปรเจกต์

### 6.4 PII minimization + PDPA [B → L]

SHARK เป็น **data processor** ของร้าน (ร้านเป็น controller ของข้อมูลลูกค้าตัวเอง) + เป็น controller ของข้อมูลบัญชีร้าน — ต้องมีทั้งสองหมวก:

- **เก็บน้อยที่สุด:** Customer ขั้นต่ำ = email/เบอร์ + ชื่อ — ไม่บังคับที่อยู่/วันเกิดถ้าโมดูลไม่ใช้ · เอกสาร freeze snapshot ได้เฉพาะใบเสร็จ (_CONVENTIONS §2.6)
- **Consent:** จุดสมัครสมาชิกร้าน (storefront) มี consent ชัด (สะสมแต้ม/การตลาด แยก checkbox) + เก็บ `consentAt`, `consentVersion`, ช่องทางถอน consent
- **DSR (Data Subject Rights):** ลูกค้าขอดู/แก้/ลบข้อมูล — สร้าง flow ใน storefront + backoffice: export ข้อมูลของตัวเอง (JSON), แก้โปรไฟล์, ลบ = **anonymize** (แทน PII ด้วย `deleted-{cuid}` แต่คงธุรกรรม/ledger ที่กฎหมายบัญชีต้องเก็บ) — ตอบภายใน 30 วันตาม PDPA
- **Retention ต่อประเภท:**

| ข้อมูล | เก็บ | เหตุผล |
|---|---|---|
| เอกสารเงิน (ใบเสร็จ, ledger, ภาษี) | ≥ 5 ปี | ประมวลรัษฎากร/บัญชี — anonymize ชื่อได้ ตัวเลขคงไว้ |
| โปรไฟล์ลูกค้า | ตลอด membership + 2 ปีหลัง inactive → เสนอร้าน anonymize | PDPA minimization |
| แชท | 1 ปี (config ต่อร้าน) | |
| AuditLog | 2 ปี | investigate/dispute |
| Session/AuthToken หมดอายุ | ลบภายใน 30 วัน (cron) | |
| Access log | 90 วัน | |

- **Log ไม่เก็บ PII:** logger กลางมี redact list (email, phone, token, OTP, ที่อยู่) — log อ้าง `userId`/`memberId` แทนค่า · ห้าม log request body ของ endpoint auth/payment
- [L] เอกสาร: Privacy Policy + DPA สำหรับร้าน (เราเป็น processor) + ทะเบียนกิจกรรมประมวลผล (RoPA) ฉบับย่อ

---

## 7. Audit & Monitoring

### 7.1 AuditLog กลาง [A2]

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  tenantId  String?                  // null = platform-level action
  unitId    String?
  actorType ActorType                // USER | PLATFORM_USER | SYSTEM | IMPERSONATED
  actorId   String
  onBehalfOf String?                 // impersonation: platform user จริง (ข้อ 9)
  action    String                   // "pos.sale.void", "member.export", "rbac.membership.update"
  refType   String?
  refId     String?
  before    Json?                    // ค่าเดิม (redact PII ตามนโยบาย log)
  after     Json?
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())
  @@index([tenantId, createdAt])
  @@index([actorId, createdAt])
  @@index([action, createdAt])
}
```

- **Append-only:** ไม่มี API update/delete — DB role ของ app มีสิทธิ์ INSERT/SELECT เท่านั้นบนตารางนี้ (ข้อ 8.3)
- **บังคับ audit:** ทุก action ที่แตะ เงิน (sale/void/refund/ราคา), แต้ม (earn/burn/adjust), คูปอง (สร้าง/redeem/ยกเลิก), สิทธิ์ (เชิญ/role/unitAccess), ตั้งค่า (payment, domain, module toggle), export ข้อมูล, auth event (login สำเร็จ/ล้มเหลว, revoke, 2FA) — ผูกไว้ที่ contract service กลาง เพื่อโมดูลลืมไม่ได้
- Owner เห็น audit ของ tenant ตัวเองใน dashboard (read-only) — โปร่งใสกับร้าน + ใช้จับพนักงานทุจริตเอง

### 7.2 Security events + alert [L]

ตรวจจับและแจ้ง (email + Telegram ops):
- Login ผิดปกติ: OTP ผิดถึง lockout, login สำเร็จจากประเทศ/IP ใหม่ของ OWNER/PlatformUser, session revoke ทั้งหมด
- **Bulk export** ข้อมูลสมาชิก/บัญชี — แจ้ง OWNER ทุกครั้ง
- สิทธิ์เปลี่ยน: role ขึ้นเป็น OWNER/MANAGER, PlatformUser ใหม่ (อันหลัง alert ระดับ critical)
- Fraud pattern (ดูข้อ 13): void/manual discount ผิดปกติ, point.adjust ก้อนใหญ่, coupon redeem ถี่ผิดปกติ, isolation guard throw ใน production (บั๊กหรือการโจมตี — ต้องดูทันที)
- Rate limit ชนซ้ำจาก key เดิม

### 7.3 Error tracking [A]

- Global error boundary + handler: client ได้ **error id + ข้อความ generic** เท่านั้น — **stack trace, query, ค่า env ห้ามออกไป client เด็ดขาด** (`NODE_ENV=production` + custom error page ทั้ง route/API)
- ฝั่ง server: error พร้อม context (redacted) เข้า error tracker (Sentry/self-host) — แจ้งเมื่อ error rate พุ่ง
- zod error ตอบ field ที่ผิดได้ (ปลอดภัย) แต่ห้ามสะท้อน internal message ของ Prisma/PG

---

## 8. Infrastructure

### 8.1 Security headers [A — ใส่ที่ middleware/next.config ตั้งแต่ shell แรก]

```ts
// next.config headers() — ค่าจริงที่ใช้
{
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https://usercontent.shark.in.th; font-src 'self'; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; " +
    "form-action 'self'; object-src 'none'; upgrade-insecure-requests",
  "X-Frame-Options": "DENY",                       // legacy ควบ frame-ancestors
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), geolocation=(), microphone=(), payment=()",
  // camera=self: จำเป็นสำหรับสแกน QR (ตั๋ว/check-in) ใน browser
  "Cross-Origin-Opener-Policy": "same-origin",
}
```

- CSP เริ่มเข้มแล้วค่อยเปิดตามจำเป็น (เช่น gateway JS SDK → เพิ่ม host เฉพาะ) — ห้าม `unsafe-eval` · เป้าหมาย [🔜] ย้าย style เป็น nonce-based ตัด `unsafe-inline`
- Storefront บน custom domain: header ชุดเดียวกัน แต่ `frame-ancestors 'none'` คงไว้ (ร้านอยากฝัง iframe → ฟีเจอร์ embed แยกที่ตรวจ domain [🔜])
- จอ TV เรียกคิว (route display): พิจารณา `frame-ancestors` เฉพาะกรณีจริงเท่านั้น

### 8.2 CORS [A]

- Default: **ไม่เปิด CORS** — API ใช้จาก same-origin (app + storefront ผ่าน rewrite/proxy เดียวกัน)
- Custom domain storefront เรียก API: เสิร์ฟผ่าน origin เดียวกับหน้าเว็บ (tenant resolver ทำให้ API อยู่ domain เดียวกัน) — ไม่ต้องเปิด cross-origin
- ถ้าจำเป็น (public API [🔜]): allowlist ราย origin จาก DB (custom domain ที่ verify แล้วเท่านั้น), ไม่มี `*` กับ credentialed request

### 8.3 Database least-privilege [L]

- แยก DB role: `shark_app` (CRUD ตารางแอป — **ไม่มี** DDL/DROP/TRUNCATE; AuditLog: INSERT/SELECT เท่านั้น) · `shark_migrate` (DDL — ใช้เฉพาะตอน deploy) · `shark_readonly` (รายงาน/BI/สำรวจ manual)
- Postgres ไม่เปิด public internet — bind localhost/private network, เข้าถึง remote ผ่าน SSH tunnel เท่านั้น · password คนละชุดต่อ role, ยาว, อยู่ใน secret store

### 8.4 Backup + DR [L]

- `pg_dump` รายวัน + WAL archiving (point-in-time recovery) — **เข้ารหัสไฟล์ backup** (age/GPG) ก่อนส่งออกนอกเครื่อง, เก็บ off-site (object storage คนละ provider/region), retention 30 วัน + รายเดือน 12 เดือน
- **ทดสอบ restore จริงทุกเดือน** (restore ลง instance ชั่วคราว + เทียบ row count/สุ่มตรวจ) — backup ที่ไม่เคย restore = ไม่มี backup
- เป้าหมายตั้งต้น: **RPO ≤ 24 ชม.** (รายวัน; ธุรกรรมเงินควรไล่ให้ ≤ 1 ชม. ด้วย WAL) · **RTO ≤ 4 ชม.** — เขียน runbook restore step-by-step ให้คนที่ไม่ได้ตั้งระบบทำตามได้

### 8.5 Dependencies + Docker [A → L]

- Lockfile commit เสมอ (`pnpm-lock.yaml`) + CI ติดตั้งแบบ `--frozen-lockfile`
- `pnpm audit` + Dependabot/Renovate ใน CI — critical vuln = block merge · pin GitHub Actions ด้วย SHA
- Docker: base image slim + pinned digest · **multi-stage build** (ไม่มี devDependencies/ซอร์สเกินจำเป็นใน runtime image) · รันเป็น **non-root user** · filesystem read-only ยกเว้น tmp · ไม่มี secret ใน image/layer history · จำกัด memory/CPU ต่อ container · expose เฉพาะ port ที่ใช้
- VPS: ufw ปิดทุก port ยกเว้น 80/443/SSH · SSH key-only + fail2ban · อัปเดต security patch อัตโนมัติ (unattended-upgrades)

---

## 9. Backoffice Hardening (backoffice.shark.in.th)

- [L] **PlatformUser บังคับ 2FA TOTP ทุกคน** — ไม่มีข้อยกเว้น (บัญชีนี้เห็นทุกร้าน = มูลค่าสูงสุดของผู้โจมตี)
- [A] แยกทุกอย่างจากฝั่งร้าน: route group `(backoffice)`, session/cookie แยก (ข้อ 1.3), layout แยก, `PlatformUser` คนละตาราง — ไม่มี path ที่ Membership ธรรมดา escalate มาได้
- [🔜] **IP allowlist** ต่อ PlatformUser (office/VPN IP) — ระหว่างนี้ใช้ 2FA + alert login ใหม่ (ข้อ 7.2) ชดเชย
- [L] **Impersonation ("เข้าสู่ระบบแทนร้าน" เพื่อ support)** — ควบคุมเข้มสุดในระบบ · **(D13 — RESOLUTIONS) ยึด 15-backoffice §3.4 เป็น canonical** — ข้อกำหนดด้านล่างปรับให้ตรงแล้ว:
  1. เริ่ม session impersonate ต้อง**กรอกเหตุผล (บังคับ ≥ 10 ตัวอักษร) + อ้างเคส support (optional)** — บันทึกทุกครั้ง
  2. **Audit สองชั้น**: ทุก request ระหว่าง impersonate → `PlatformAuditLog` · mutation (โหมด WRITE) → ลง `AuditLog` ของร้านด้วย `actorType = IMPERSONATED` + `onBehalfOf = platformUserId` (schema ข้อ 7.1) — ตามรอยได้ 100%
  3. **Banner แถบเด่นค้างบนจอตลอด**: "คุณกำลังดูระบบแทนร้าน {name} — ทุกการกระทำถูกบันทึก" + countdown + ปุ่มสิ้นสุด
  4. **Read-only เป็น default** — โหมด WRITE ต้อง **SUPER_ADMIN เท่านั้น** (SUPPORT ขอ → SUPER_ADMIN อนุมัติก่อนจึงเริ่มได้ ตาม 15 §3.4) และ**ห้ามเสมอ (blocklist = union SECURITY∪15)**: จ่ายเงิน/ชำระเงิน, ลบข้อมูล, แก้ payment settings, export ลูกค้าทั้งหมด, เปลี่ยนอีเมล owner, ลบ/เชิญสมาชิกทีม, ลบ unit
  5. อายุ session impersonate **30 นาที** (hard limit, ไม่มี extend — ตาม 15 §3.4) auto-expire · แจ้ง OWNER ของร้าน (email) ทุกครั้งที่ถูก impersonate (เริ่ม + สรุปตอนจบ)
- [L] action ทำลายล้างใน backoffice (ระงับ tenant, ลบ PlatformUser) → confirm + TOTP step-up + audit

---

## 10. Payment Security [B (POS) → L ก่อนรับเงินจริง]

- **ไม่แตะเลขบัตรเด็ดขาด** — gateway tokenize (Beam/Omise/Stripe hosted fields/redirect) → เราเก็บแค่ `gatewayChargeId` + สถานะ + amount → ไม่เข้า PCI DSS scope เต็ม (อยู่ระดับ SAQ A)
- Callback (webhook ขาเข้า — ข้อ 5.4): ตรวจ HMAC + timestamp + dedupe `eventId` แล้ว **ตรวจ 3 อย่างก่อด mark paid:** (1) `chargeId` เป็นของ order นี้จริง (2) **amount + currency ตรงกับ order เป๊ะ** — กันเคสจ่าย 1 บาทแล้ว replay/สลับ order (3) ยิง API ยืนยันสถานะกับ gateway ซ้ำ (ไม่เชื่อ callback ฝ่ายเดียว)
- PromptPay/โอนมือ: สลิปเป็นหลักฐานประกอบ **ไม่ auto-confirm** — พนักงานยืนยัน (audit) หรือใช้ slip verification API [🔜]
- **Reconcile รายวัน (cron):** เทียบรายการฝั่ง gateway ↔ `PosSale`/Account posting — ส่วนต่าง → alert + รายงานใน backoffice · ใบเสร็จ immutable, แก้ = void/reissue (_CONVENTIONS §5)
- Refund: สิทธิ์แยก (`pos.refund` — default OWNER/MANAGER เท่านั้น), มี limit ต่อวัน/ต่อคน, audit + alert เมื่อผิดปกติ
- Credential gateway ต่อ tenant → field-level encryption (ข้อ 6.2)

---

## 11. Custom Domain Security [Phase 6 / L ก่อนเปิดขายฟีเจอร์นี้]

- **Verify ownership ก่อน activate เสมอ:** ให้ร้านตั้ง `TXT _shark-verify.{domain} = shark-verify={token}` (token สุ่มต่อคำขอ) — ตรวจผ่านก่อนถึงจะ map `customDomain → tenantId` และออก cert · แค่ CNAME ชี้มา **ไม่พอ** (ใครก็ชี้ domain ที่ตัวเองคุมมาที่เราได้)
- **กัน subdomain takeover:** เมื่อร้านยกเลิก/หมดอายุ/เปลี่ยน domain → ลบ mapping + cert ทันที · cron ตรวจ DNS ของทุก custom domain — ถ้า CNAME ไม่ชี้มาแล้ว → พัก mapping + แจ้งร้าน · **ห้ามเสิร์ฟ wildcard/default tenant ให้ domain ที่ไม่มี mapping** (Caddy on-demand TLS ต้องมี `ask` endpoint ตรวจกับ DB ว่า domain นี้ verified — ไม่งั้นใครก็ชี้ domain มาให้เราออก cert ให้ได้)
- **Cert lifecycle:** auto-issue (Caddy on-demand / ACME), auto-renew, ตรวจวันหมดอายุทุกวัน — เหลือ < 14 วันแล้วยัง renew ไม่ได้ → alert ops + แจ้งร้าน · จำกัด rate การขอ cert ต่อ tenant (กัน abuse ACME quota)
- Cookie: session ออกให้เฉพาะ `shark.in.th` (`__Host-`) — บน custom domain ลูกค้า login ด้วย flow ของ storefront ที่ออก session cookie scoped domain นั้น แยกจาก session dashboard · ห้าม share cookie ข้าม custom domain
- Header ความปลอดภัยชุดเดียวกันทุก domain (ข้อ 8.1) — HSTS บน custom domain ใช้ `max-age` สั้นลงและไม่มี `preload` (domain ไม่ใช่ของเรา)

---

## 12. Incident Response + Pre-launch Checklist

### 12.1 Playbook ย่อ [L]

**บทบาท:** Incident lead (เจ้าของ), ผู้แก้เทคนิค, ผู้สื่อสาร (คนเดียวควบได้ช่วงทีมเล็ก แต่เขียนแยกไว้)

1. **Detect** — alert (ข้อ 7.2) / ร้านแจ้งผ่าน support desk / เจอเอง
2. **Contain (ภายใน 1 ชม.)** — เลือกตามเคส: revoke session ทั้งหมดของบัญชีที่โดน · ระงับ tenant/PlatformUser ที่เกี่ยว · ปิด endpoint ที่รั่ว (feature flag/maintenance) · rotate secret ที่สงสัย · **เก็บหลักฐานก่อนแก้** (snapshot log/AuditLog/DB ที่เกี่ยว)
3. **Assess** — ใช้ AuditLog + access log ตอบ: ข้อมูลอะไรรั่ว, tenant ไหนโดน, ช่วงเวลาไหน, ผู้กระทำ
4. **Eradicate & Recover** — แก้ root cause + เขียน isolation/regression test ของบั๊กนั้น → deploy → ยืนยันบน prod
5. **Notify** — PDPA: ข้อมูลส่วนบุคคลรั่วและมีความเสี่ยงสูง → แจ้ง สคส. (PDPC) **ภายใน 72 ชม.** + แจ้งร้าน (controller) ที่ได้รับผลกระทบพร้อมข้อเท็จจริง/ขอบเขต/สิ่งที่ทำแล้ว
6. **Post-mortem** — เอกสาร timeline + root cause + action items ภายใน 1 สัปดาห์ (blameless)

เคสเฉพาะที่เขียน runbook แยก: (ก) tenant data leak (ข) payment mismatch/fraud (ค) secret/token รั่ว (ง) บัญชี PlatformUser ถูกยึด (จ) ransomware/VPS ถูกยึด → restore จาก backup (ข้อ 8.4)

### 12.2 Pre-launch security checklist (ทีมรันเองได้ — ทำเป็น session ตรวจ 1 วัน)

**Auth & Session**
- [ ] magic link: หมดอายุ 15 นาทีจริง, ใช้ซ้ำไม่ได้ (ยิงซ้ำ 2 แท็บ), token เก่าตายเมื่อขอใหม่
- [ ] OTP: ผิด 5 ครั้งตาย, lockout ทำงาน, ขอถี่โดน 429
- [ ] email enumeration: response + timing เหมือนกันทั้ง email มี/ไม่มี
- [ ] cookie มี `__Host-`, httpOnly, Secure, SameSite — ตรวจใน devtools
- [ ] logout ทุกเครื่องทำงาน · ถอด Membership แล้ว request ถัดไปโดน 401/404
- [ ] session backoffice ใช้กับ app ไม่ได้ (สลับ cookie ด้วยมือ)

**Isolation (สำคัญสุด)**
- [ ] isolation suite (ข้อ 3) เขียวบน staging จริง (HTTP จริง)
- [ ] ยิงตรงทุก resource id ข้าม tenant/unit ด้วย curl → 404 หมด
- [ ] mutation ยัด tenantId/unitId คนอื่นใน body → ถูกเมิน
- [ ] production guard: query ไม่มี tenantId → throw (ทดลองใน staging)

**Input/API**
- [ ] endpoint ไม่มี zod schema = ไม่มี (ไล่จาก route manifest)
- [ ] ยัด field เกิน (role, pointBalance) → strict ปฏิเสธ
- [ ] upload: ไฟล์ .php/.svg ปลอม MIME → ถูกปฏิเสธ/re-encode, URL ไฟล์ private เดาไม่ได้+หมดอายุ
- [ ] mutation จาก origin แปลก → 403 · ไม่มี state-changing GET
- [ ] rate limit ตาราง 5.1 ตอบ 429 จริงทุกกลุ่ม

**Payment/เงิน/แต้ม**
- [ ] webhook ปลอม (ไม่มี/ผิด signature, timestamp เก่า, ยิงซ้ำ eventId) → ถูกทิ้ง + log
- [ ] callback amount ไม่ตรง order → ไม่ mark paid + alert
- [ ] createSale ยิงซ้ำด้วย Idempotency-Key เดิม → ใบเสร็จใบเดียว
- [ ] void/refund/point.adjust โดย STAFF ที่ไม่มีสิทธิ์ → ปฏิเสธ + ทุก action มีแถว AuditLog

**Infra**
- [ ] securityheaders.com / `curl -I` ครบตามข้อ 8.1 ทุก subdomain
- [ ] error หน้า prod ไม่มี stack trace (ทดลอง throw)
- [ ] `pnpm audit` ไม่มี critical · gitleaks สแกน history สะอาด
- [ ] Postgres ไม่ expose public · app role ไม่มี DDL · ลอง UPDATE AuditLog ด้วย app role → ถูกปฏิเสธ
- [ ] restore backup ลง instance ใหม่สำเร็จภายใน RTO
- [ ] Docker: `whoami` ใน container ≠ root

**Backoffice**
- [ ] PlatformUser ไม่มี 2FA → login ไม่ได้
- [ ] impersonation: บังคับเหตุผล, banner ขึ้น, read-only, audit ครบ, OWNER ได้ email

---

## 13. Threat Model สรุป (จุดเสี่ยงเฉพาะ SHARK)

| # | Threat | ความเสี่ยง | Mitigation หลัก | ชั้น/โมดูลที่รับผิดชอบ | Stage |
|---|---|---|---|---|---|
| T1 | **ข้อมูลข้ามร้าน (tenant/unit leak)** — IDOR, query หลุด guard, list ปนแถว | 🔴 สูงสุด — ฆ่าธุรกิจได้ในเหตุการณ์เดียว | can() ทุก handler (2.1) + Prisma guard ชั้น 2 (2.2) + 404 (2.4) + isolation suite เป็น CI gate (3) | `lib/core/rbac` + `lib/core/db` + CI | **A** |
| T2 | **แต้ม/คูปอง fraud** — เดา coupon code, redeem ซ้ำ (race), earn เกินจากยิง event ซ้ำ, self-earn โดยพนักงาน | 🔴 สูง — เงินรั่วเงียบๆ | code สุ่มยาวพอ + rate limit redeem (5.1) · `coupon.redeem` atomic transaction (_CONVENTIONS §2.3) · idempotency + ledger unique (5.3) · PointRule คิดที่ Point เท่านั้น · anomaly alert (7.2) | Coupon (08) + Point (09) + POS (14) | **B** |
| T3 | **พนักงานทุจริต** — void/refund ยักยอก, manual discount เกินสิทธิ์, adjust แต้มให้พวกพ้อง, ดูด CRM ก่อนลาออก | 🔴 สูง — โจทย์จริงของ SME ไทย | สิทธิ์ void/refund/adjust แยก action + จำกัด role (9,10) · AuditLog ทุกรายการเงิน/แต้ม + Owner เห็นเอง (7.1) · alert pattern ผิดปกติ + bulk export (7.2) · ใบเสร็จ immutable · revoke ทันทีเมื่อถอดพนักงาน (1.3) | POS/Point/Member + `lib/core/audit` | **B/L** |
| T4 | **QR ปลอม/ใช้ซ้ำ** — ตั๋วอีเวนต์ capture แล้วสแกนซ้ำ, บัตรสมาชิกปลอมสวมแต้ม/tier | 🟠 กลาง-สูง | QR = **token สุ่มอ้าง server** (ห้าม encode ข้อมูลจริง/เดาได้) · check-in atomic ครั้งเดียว + สถานะ realtime ให้คนสแกนเห็น "ใช้แล้ว" · บัตรสมาชิก QR หมุนอายุสั้น (TOTP-style) [🔜] · redeem หน้าร้านต้องพนักงาน confirm ฝั่งระบบ | Ticket (05) + Member (06) + Reward (07) | **B** |
| T5 | **บัญชี OWNER ถูกยึด** — email ของเจ้าของร้านโดน phishing → คุมทั้งร้าน | 🟠 กลาง-สูง | magic link 15 นาที + single-use (1.1) · alert login ใหม่ (7.2) · 2FA OWNER [🔜] · step-up action อ่อนไหว (1.4) · revoke ทุก device (1.3) | `lib/core/auth` | A/🔜 |
| T6 | **PlatformUser ถูกยึด / support ทุจริต** | 🔴 สูง — เห็นทุกร้าน | 2FA บังคับ (9) · session สั้น · impersonation read-only + audit + แจ้งร้าน (9) · IP allowlist [🔜] | backoffice + `lib/core/auth` | **L** |
| T7 | **Payment callback ปลอม/replay** — mark paid โดยไม่จ่ายจริง, amount mismatch | 🔴 สูง | HMAC + timestamp + dedupe (5.4) · ตรวจ amount + ยืนยันกับ gateway (10) · reconcile รายวัน (10) | POS (14) + payment service | **B/L** |
| T8 | **Custom domain abuse** — ชี้ domain คนอื่น, takeover หลังยกเลิก, ACME abuse | 🟠 กลาง | TXT ownership verify + `ask` endpoint + ลบ mapping ทันที (11) | tenant resolver + proxy | Phase 6/L |
| T9 | **XSS จาก user content** — ชื่อเมนู/แชท → จอร้าน, จอ TV, storefront | 🟠 กลาง | React escape + ban dangerouslySetInnerHTML + sanitizer กลาง (4.2) + CSP (8.1) | ทุกโมดูล UI + `lib/core/sanitize` | **A** |
| T10 | **Secret ร้านรั่ว** (LINE/FB token, gateway key) — DB dump/backup หลุด | 🟠 กลาง | field-level encryption + key นอก DB (6.2) · backup เข้ารหัส (8.4) · log redact (6.4) | Chat (10) + `lib/core/crypto` | B/L |
| T11 | **DoS / resource abuse** — สมัคร tenant ปั่น, ยิง OTP ให้ค่าเมลพุ่ง, SSE เปิดค้าง | 🟡 กลาง | rate limit 3 มิติ (5.1) · Tenant.limits · จำกัด SSE connection ต่อ user · CDN/proxy ชั้นหน้า | `lib/core/ratelimit` + infra | A/L |
| T12 | **จองซ้ำ/race ตัด slot–สต็อก–โควตาตั๋ว** — double-book, oversell | 🟡 กลาง (integrity) | transaction lock ที่ slot engine (BLUEPRINT §5.3) · unique constraint + idempotency (5.3) | Booking/Hotel/Ticket/POS | B |

---

## 14. สรุป checklist ตาม Stage (สำหรับ dev — ตัดไปใส่ progress ได้)

### Stage A — CORE (อยู่ใน `lib/core/` ก่อน freeze)
- [ ] AuthToken hash + magic link 15m single-use + interstitial POST verify (1.1)
- [ ] OTP hash + attempt limit + lockout (1.2)
- [ ] Session table + `__Host-` cookie + rotation + revoke ทุกเครื่อง + backoffice session แยก (1.3)
- [ ] Anti-enumeration ทุก endpoint auth (1.5)
- [ ] `can()` 4 มิติ + `withUnitCtx` pattern + default deny (2.1)
- [ ] Prisma guard extension + raw client กักบริเวณ + lint rules (2.2, 4.3)
- [ ] 404-not-403 convention (2.4)
- [ ] Isolation fixture + route manifest + CI gate (3)
- [ ] zod strict ทุก endpoint (4.1) · sanitizer กลาง + ban dangerouslySetInnerHTML (4.2)
- [ ] Rate limit middleware 3 มิติ + ค่า auth endpoints (5.1) · Origin check mutation (5.2)
- [ ] Security headers + CORS ปิด (8.1, 8.2) · error ไม่รั่ว stack (7.3)
- [ ] AuditLog schema + audit hook ใน contract stubs (7.1 — ส่วนของ A2)
- [ ] Upload service: sniff/re-encode/สุ่มชื่อ/path ต่อ tenant/signed URL (4.4 — A2)
- [ ] gitleaks + lockfile CI + `.env` hygiene (6.3, 8.5)
- [ ] วาง schema เผื่ออนาคต: 2FA fields, ChannelCredential (encPayload/keyVersion), AuditLog.onBehalfOf

### Stage B/C (พร้อมโมดูล)
- [ ] Idempotency key ทุก mutation เงิน/แต้ม/จอง (5.3) · contract services ตรวจ tenant ของ refs (2.3)
- [ ] Coupon/Point anti-fraud: atomic redeem, rate limit, PointRule กลาง (T2)
- [ ] สิทธิ์ void/refund/adjust แยก + audit + alert (T3) · QR = server token + atomic check-in (T4)
- [ ] Webhook ขาเข้า HMAC+timestamp+dedupe (5.4) · safeFetch กัน SSRF (4.5)
- [ ] Field-level encryption สำหรับ ChannelCredential/gateway keys (6.2)

### ก่อน Launch [L]
- [ ] PlatformUser 2FA บังคับ + impersonation ครบ 5 ข้อ (9)
- [ ] Payment: amount verify + gateway confirm + reconcile cron (10)
- [ ] Security event alerts (7.2) · log redaction ตรวจจริง (6.4)
- [ ] DB roles least-privilege + Postgres ไม่ public (8.3) · backup เข้ารหัส + restore test ผ่าน + runbook (8.4)
- [ ] Docker non-root/read-only + VPS hardening (8.5) · TLS ครบทุกชั้น (6.1)
- [ ] PDPA: consent + DSR flow + retention cron + Privacy Policy/DPA (6.4)
- [ ] Incident playbook + runbook 5 เคส (12.1) · รัน pre-launch checklist 12.2 ครบทุกข้อ
- [ ] Custom domain: TXT verify + ask endpoint + cert monitor (11 — ก่อนเปิดขายฟีเจอร์)

### 🔜 หลัง Launch
- [ ] 2FA OWNER (เชิญชวน → บังคับ) + step-up (1.4)
- [ ] IP allowlist backoffice (9) · Postgres RLS ชั้น 3 (2.2)
- [ ] CSP nonce-based ตัด `unsafe-inline` (8.1) · QR สมาชิกหมุนอายุสั้น (T4)
- [ ] Webhook ขาออก signing + public API + CORS allowlist (5.4, 8.2)
- [ ] Slip verification API (10) · external pen-test เมื่อรายได้ถึงจุดคุ้ม
