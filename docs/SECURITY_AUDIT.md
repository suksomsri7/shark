# SHARK — Security Self-Audit Checklist (WO-0043)

สถานะจริงจากโค้ด ณ WO-0043 (hardening). เอกสารนี้เป็น self-audit ภายใน ไม่ใช่ผลตรวจจากบุคคลที่สาม
รายการที่ยัง defer อยู่ท้ายไฟล์ พร้อมเหตุผล.

อัปเดต: WO-0043 · ผู้ตรวจ: Builder (self) · ขอบเขต: app ร้าน + backoffice + cron + chat public surface

---

## 1. Rate limiting (กันถล่ม / brute-force / spam)

| จุด | กลไก | ลิมิต | ไฟล์ |
|-----|------|-------|------|
| ขอ OTP login ร้าน (ต่ออีเมล) | นับ `AuthToken` purpose OTP ใน 10 นาที (นับก่อนสร้าง) | 5 ครั้ง/10 นาที → throw ไทย | `src/lib/core/auth.ts` |
| ขอ OTP login ร้าน (ต่อ IP) | นับ `AuthToken` OTP ต่อ ip ใน 10 นาที | 20 ครั้ง/10 นาที → throw ไทย | `src/lib/core/auth.ts` |
| ขอ OTP backoffice (ต่ออีเมล) | นับ `PlatformAuthToken` ใน 10 นาที (หลัง user-check เพื่อคง anti-enumeration) | 5 ครั้ง/10 นาที → throw ไทย | `src/lib/platform/auth.ts` |
| Webchat inbound (public) | `checkRateLimit` in-memory sliding window ต่อ session-cookie + fallback IP | 20 ข้อความ/นาที (session), 100/นาที (ip) → 429 | `src/app/api/chat/webchat/route.ts`, `src/lib/core/rate-limit.ts` |
| Webchat inbound (path param, เดิม) | `rateLimit` chat module ต่อ ip+connection + cap contact ใหม่/ชม. ระดับ DB | 20/นาที → 429 | `src/app/api/chat/webchat/[connectionId]/route.ts`, `src/lib/modules/chat/rate-limit.ts` |

หมายเหตุ:
- OTP rate limit นับจาก DB (`AuthToken`/`PlatformAuthToken`) จึง **ทนข้าม instance** (serverless หลายเครื่องเห็นเลขเดียวกัน).
- `checkRateLimit` เป็น in-memory ต่อ process (per-instance) — เหมาะกับ surface สาธารณะเพื่อกันถล่มระดับ instance คู่กับ cap ระดับ DB. ยอมรับข้อจำกัดนี้ (บน Vercel serverless แต่ละ instance มีถังของตัวเอง).
- UI action ที่เรียก `requestLogin` / `requestPlatformOtp` ถูก try/catch แล้วแสดง error inline (ไม่ทำหน้าแตก) — `src/lib/actions/auth.ts`, `src/lib/platform/actions.ts`.

## 2. Security headers

ตั้งใน `src/proxy.ts` → `applySecurity()` (Next 16 proxy แทน middleware) ครอบทุก response ที่ผ่าน matcher:
- `X-Frame-Options: DENY` — กัน clickjacking
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` — บังคับ HTTPS 2 ปี รวม subdomain (WO-0043)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` — ปิดสิทธิ์อุปกรณ์ที่แอปไม่ใช้ (WO-0043)

`poweredByHeader: false` ใน `next.config.ts` (ไม่ leak `X-Powered-By`).

## 3. CSRF

- ใช้ **Next.js Server Actions built-in Origin/Host check** (เทียบ Origin กับ Host อัตโนมัติ) — `next.config.ts` **ไม่** override `serverActions.allowedOrigins` จึงไม่เปิด cross-origin allowlist (default = same-origin only). ตรวจแล้ว: `next.config.ts` มีแค่ `poweredByHeader:false` + next-intl plugin.
- Cookie session ทั้งสองฝั่งตั้ง `sameSite: "lax"` เป็น defense เสริม (`src/lib/core/session.ts`, `src/lib/platform/actions.ts`).
- Mutation ทั้งหมดผ่าน Server Actions หรือ API route ที่มี auth ของตัวเอง (cron ใช้ secret, webchat ใช้ cookie+rate limit).

## 4. Secrets ทั้งหมดในระบบ

| Secret | ใช้ทำอะไร | อ่านที่ |
|--------|-----------|---------|
| `DATABASE_URL` / `DIRECT_URL` | Postgres (Neon) connection | `src/lib/env.ts` (zod validate url) |
| `SESSION_SECRET` | session (min 32 chars, validate ตอน boot) | `src/lib/env.ts` |
| `SHARK_CRON_SECRET` / `CRON_SECRET` | cron auth (รับได้ทั้งสองค่า) | `src/lib/core/cron-auth.ts` |
| `RESEND_API_KEY` | ส่งอีเมล OTP/แจ้งเตือน | `src/lib/core/email.ts` |
| `CHAT_CREDENTIALS_KEY` | เข้ารหัส chat channel credentials (derive 32B ด้วย sha256) | `src/lib/modules/chat/crypto.ts` |
| `SHARK_AI_KEY` | LLM API key (BYOK ชั้น AI) | ชั้น ai |
| `SHARK_BUNNY_KEY` | Bunny CDN storage | ชั้น storage |
| `SHARK_VERCEL_TOKEN` | Vercel API (custom domain) | ชั้น domain |

หลักการ:
- Secret ไม่เก็บใน DB เป็น plaintext ที่ควรเป็น hash: token session/OTP เก็บเป็น `sha256(token)` เท่านั้น (cookie ถือ token ดิบ) — `src/lib/core/hash.ts`, `session.ts`, `auth.ts`.
- Chat credentials เข้ารหัสด้วย `CHAT_CREDENTIALS_KEY` ก่อนลง DB.
- `env.ts` validate subset สำคัญด้วย zod ตอน boot (fail เร็วถ้าตั้งผิด). `SHARK_*` + `CHAT_CREDENTIALS_KEY` อ่านตรงจาก `process.env` (ไม่ผ่าน schema) — **จุดที่ควรพิจารณาเพิ่ม validation ภายหลัง**.
- แต่ละโปรเจกต์ถือ key ของตัวเอง (ไม่ share ข้าม siamdive/goodfood).

## 5. RBAC + assertCan

- โมเดล RBAC 4 มิติ: **tenant → unit → module → action** (`src/lib/core/rbac.ts`).
- Roles ร้าน (`Role`): `OWNER`, `MANAGER`, `STAFF`. Roles platform (`PlatformRole`): `SUPER_ADMIN`, `SUPPORT`, `FINANCE`.
- `evaluate()`: `OWNER` = true เสมอ · `MANAGER` = เต็มสิทธิ์ในหน่วยที่คุม · `STAFF` = ต้องมี `permissions[action] === true` หรือ wildcard `<module>.*` · null ctx → false.
- `assertCan()` → throw `ForbiddenError` (403) เมื่อไม่ผ่าน. เป็น **guard ชั้น 1 ที่ handler** (ก่อนแตะ DB) — เรียกจริงใน `actions/systems.ts`, `actions/restaurant.ts`, `ai/proposals.ts` (execute proposal เช็คสิทธิ์ "คนกดยืนยัน" ไม่ใช่ของ AI).
- Backoffice ใช้ guard แยก: `requirePlatformRole()` / `requireBackoffice()` throw/redirect ถ้า role ไม่พอ.

## 6. Tenant isolation (multi-tenant fail-closed)

- **`tenantDb(ctx)`** (`src/lib/core/db.ts`): Prisma `$extends` inject filter ทุก query = **defense-in-depth ชั้น 2** (ชั้น 1 = assertCan).
- 3 แกน scope: **tenant / unit / system**. `filterFor()` ใส่ `tenantId` เสมอ + `unitId`/`systemId` ตาม axis ของ model.
- **Fail-closed** หมายถึง:
  - Boot-time `assertRegistryComplete()` — ทุก model ต้องลงทะเบียน scope ไม่งั้น **แอปไม่ start**.
  - Model ไม่ลงทะเบียน / operation ยังไม่รองรับ guard → **throw** (ไม่ปล่อย query หลุด scope).
  - Context ไม่พอ (unit-scoped แต่ไม่มี `unitId`, system-scoped ไม่มี `systemId`) → throw.
- กันข้าม tenant:
  - `WHERE_OPS` (findMany/updateMany/count/…): AND filter เข้า where.
  - `create`/`createMany`: inject filter เข้า data.
  - `findUnique`: query แล้วเช็ค `inScope` ผล ถ้าข้ามขอบเขต → คืน `null` (เหมือน 404 ไม่ leak).
  - `update`/`delete`: merge filter เข้า `where` ก่อนยิง (filtered write) — ไม่ตรง = P2025 โดยไม่เขียนข้าม tenant.
- Base `prisma` ตรง ใช้เฉพาะ global-scope (auth/session/tenant lookup) + platform axis (support ข้ามร้านโดยตั้งใจ).

## 7. Session

- **ร้าน** (`src/lib/core/session.ts`): cookie `__Host-shark_session` (HTTPS) / `shark_session` (dev). `httpOnly` + `secure` + `sameSite:lax` + `path:/`.
  - TTL: idle **30 วัน**, absolute **90 วัน**. Sliding renewal แบบ throttled (ต่อ idle เฉพาะเมื่อเหลือ < ครึ่งของ idle) — absolute เป็นเพดานตายไม่ต่อ.
  - Token เก็บ `sha256` ใน DB, reject เมื่อ revoked / absolute หมด / idle หมด.
- **Backoffice** (`bo_session`): TTL 7 วัน (absolute อย่างเดียว ไม่มี sliding). `httpOnly`+`secure`+`sameSite:lax`. หมายเหตุ: ไม่มี `__Host-` prefix (ต่างจากร้าน) — พิจารณาเพิ่มภายหลังเพื่อความเข้ม.

## 8. Cron endpoint auth

- `isCronAuthorized()` (`src/lib/core/cron-auth.ts`): รับได้ทั้ง `Authorization: Bearer <secret>` และ `X-Cron-Secret: <secret>`, เทียบ constant-time (`timingSafeEqual`, กันความยาวต่าง), ยอมรับค่าที่ตรง `SHARK_CRON_SECRET` หรือ `CRON_SECRET` (รวมมาตรฐานใหม่/เก่า). ไม่มี header / ผิด / ไม่ตั้ง secret → false.
- ใช้ที่ `/api/cron/tick` (Vercel Cron, Bearer) และ `/api/cron/outbox` (RemoteTrigger เดิม, X-Cron-Secret) — พฤติกรรมเดิมทั้งคู่ยังใช้ได้.

---

## Known gaps / Deferred (บันทึกตรงตามจริง)

1. **Content-Security-Policy (CSP)** — ยังไม่ตั้ง. เหตุผล: Next ฉีด inline script/style (RSC hydration, next-intl) การตั้ง CSP เข้มต้องจัดการ nonce/hash ทุกจุด เสี่ยงทำหน้าแตก. Defer จนกว่าจะ audit inline surface ครบและใส่ nonce ผ่าน proxy ได้ปลอดภัย.
2. **Pentest ภายนอก** — ยังไม่ทำ. เอกสารนี้เป็น self-audit เท่านั้น. รอเจ้าของตัดสินใจจ้าง/เปิด scope external pentest.
3. **Rate limit ข้าม instance สำหรับ webchat** — `checkRateLimit` เป็น per-instance (in-memory). กันถล่มระดับ instance ได้ แต่ผู้โจมตีที่กระจายโหลดข้าม instance หลบได้บางส่วน; ชั้นกันจริงคือ cap contact ใหม่/ชม. ระดับ DB. อัปเกรดเป็น shared store (Redis/Upstash) ภายหลังถ้าจำเป็น.
4. **`__Host-` prefix สำหรับ `bo_session`** — ยังไม่ใช้ (ใช้ชื่อ `bo_session` ตรง). พิจารณาเพิ่มเพื่อกัน cookie fixation/subdomain.
5. **env validation ครอบไม่ครบ** — `SHARK_*` และ `CHAT_CREDENTIALS_KEY` อ่านตรงจาก `process.env` ไม่ผ่าน zod schema ใน `env.ts`. พิจารณาเพิ่มเข้า schema เพื่อ fail-fast.
