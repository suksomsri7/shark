# QC4 — ชั้น Platform/CORE: สิ่งที่ Stage A ต้องมีให้ครบ

> สาย QC ที่ 4 · ตรวจวันที่ 2026-07-11 · ขอบเขต: WORKPLAN_PARALLEL Stage A เทียบกับภาระ CORE ที่ประกาศไว้ใน
> BLUEPRINT.md · BLUEPRINT_BUSINESS_UNITS.md · SECURITY.md · REPORTS.md · modules/_CONVENTIONS.md ·
> modules/15-backoffice.md · หัวข้อ Integration + Edge Cases ของ modules/01–14 ทุกไฟล์
> เอกสารนี้เป็นรายงาน QC — **ไม่แก้ไฟล์สเปคใดๆ** ข้อเสนอทั้งหมดรอเจ้าของโปรเจกต์ตัดสิน

---

## ก. Findings

รูปแบบ: `[ID | ระดับ | ปัญหา | แหล่ง | ข้อเสนอแก้]`

### CRITICAL (3)

| ID | ปัญหา | แหล่ง | ข้อเสนอแก้ |
|---|---|---|---|
| QC4-C1 | **WORKPLAN Stage A ไม่ครอบภาระ CORE ที่เอกสารอื่นประกาศไว้** — A1–A3 ใน WORKPLAN ระบุแค่ schema/auth/RBAC/notify/SSE/cron/storage/limits + stub 4 ตัว แต่ (ก) SECURITY §14 Stage A มีอีก ~15 รายการ (rate limit 3 มิติ, security headers, zod strict, sanitizer, origin check, 404-not-403, isolation fixture + route manifest + CI gate, raw client กักบริเวณ, error ไม่รั่ว stack, gitleaks, schema เผื่ออนาคต) (ข) REPORTS §9.1 ผูกของกลางเข้า A1/A2/A3 (bizDate, DailyStat+statUpsert+StatRunner, Report API kit, ExportService, getUnitKpi+StatProvider, ReportShell components, หน้า Overview) (ค) 15-backoffice §8 มี 6 จุดเชื่อมที่ CORE ต้องเผื่อ (slot widget/banner/imp, imp middleware, tenant status resolver, lib/core/flags, route จอง /app/help + /app/settings/billing, platformPrisma) — **ทั้งหมดไม่ปรากฏใน WORKPLAN A1–A3 และไม่อยู่ใน gate ข้อ 6 เลย** → เสี่ยงประกาศ freeze `lib/core/` ทั้งที่ยังขาด แล้วโมดูล Stage B/C ต้องขอแก้ core ภายหลัง (ผิดกติกาเหล็กข้อ 1) | WORKPLAN §1, §6 · SECURITY §14 · REPORTS §9.1 · 15-backoffice §8 | อัปเดต WORKPLAN A1–A3 ให้อ้าง checklist รวม (หัวข้อ ข. ของรายงานนี้) + แทนที่ gate ข้อ 6 ด้วย gate v2 (หัวข้อ จ.) |
| QC4-C2 | **การตั้งค่า VAT ซ้ำ 2 ที่ คนละ shape** — POS เก็บ `unit.settings.pos.vat {registered, rateBp, mode: INCLUDED\|EXCLUDED\|NONE}` + `pos.receipt.taxId/posRegNo` ขณะ Account เก็บ `unit.settings.account {vatRegistered, priceIncludesVat, vatRate, taxId, branchCode, legalName, legalAddress}` — unit เดียวกันมีอัตรา VAT/สถานะจด VAT/เลขผู้เสียภาษี 2 ชุด แถม 12-account §8.3 สั่งว่า `SaleDocument.vatAmount` ต้องคิดตาม `settings.account.priceIncludesVat` แต่ 14-pos §7 คิดตาม `settings.pos.vat` → เลขภาษีบนใบเสร็จ POS กับใบกำกับ/ภ.พ.30 ของ Account เพี้ยนกันได้ทั้งระบบ | 14-pos §4.1, §7 · 12-account §4.8, §8.3 | ให้ **`settings.account.*` เป็น source of truth เดียว** ของ VAT + ข้อมูลนิติบุคคล (vatRegistered, priceIncludesVat, vatRate, taxId, branchCode, legalName, legalAddress) — `settings.pos` ตัด `vat` และ `receipt.taxId` ทิ้ง เหลือเฉพาะเรื่องหน้าร้าน (prefix, header/footer, posRegNo, showPoints) · POS อ่าน VAT ผ่าน helper กลาง `getUnitVat(unit)` ใน lib/core แล้ว snapshot ลงเอกสารตามเดิม · แก้ทั้ง 14-pos.md และ 12-account.md ให้อ้างจุดเดียว |
| QC4-C3 | **ชื่อ event ฝั่ง emit กับฝั่ง subscribe ไม่ตรงกัน** — POS (14 §7.5/7.6) emit `pos.sale.voided` / `pos.sale.refunded` แต่ Restaurant (02 §3.8, §8) subscribe `sale.voided` · Ticket (05 §8) รอ `sale.paid` ที่ฝั่ง POS ไม่เคยประกาศชื่อนี้ (POS พูดถึงแค่ createSale sync) → implement ตามสเปคตรงตัว = handler ไม่มีวันถูกเรียก (โต๊ะไม่ปลด lock, ตั๋วไม่ออก) แบบเงียบ | 14-pos §7.5/7.6/§8 · 02-restaurant §3.8/§8 · 05-ticket §8 | ตั้ง **naming standard เดียว: `<module>.<entity>.<past-tense>`** และประกาศ registry กลางใน CORE_API.md (หัวข้อ ง.3) — ชื่อ canonical: `pos.sale.paid`, `pos.sale.voided`, `pos.sale.refunded` · แก้ 02 (sale.voided→pos.sale.voided), 05 (sale.paid→pos.sale.paid) และให้ 14 ประกาศ `pos.sale.paid` อย่างชัดเจน (จุด emit: SaleDocument ครบยอดชำระ — ครอบทั้ง sync และ async payment) |

### MAJOR (13)

| ID | ปัญหา | แหล่ง | ข้อเสนอแก้ |
|---|---|---|---|
| QC4-M1 | **โมดูล 15 Backoffice ไม่อยู่ใน stage ไหนของ WORKPLAN** — Stage B มี 4+1 โมดูล, Stage C มี 9 โมดูล, รวม 14 แต่ 15-backoffice หายไป ทั้งที่มี dependency ชัด (ต้องรอ SSE/cron/storage/flags จาก A2 + คิว contract change `PlatformRole.FINANCE`/`Tenant.status`) | WORKPLAN §1 · 15-backoffice §1, §4 | เพิ่ม 15-backoffice เป็น session ขนานใน Stage C (หรือ "B5" ถ้าอยากได้ support desk เร็ว) + ระบุว่า contract change ของ 15 (Tenant.status enum, PlatformRole.FINANCE, PlatformUser 2FA fields, Tenant back-relations) ให้ CORE ทำรอไว้ตั้งแต่ A1 (ดู M12) |
| QC4-M2 | **SSE topic scheme ขัดกัน 4 แบบ** — Restaurant: `unit:{unitId}:restaurant:{topic}` · Queue: `q:{unitId}` + per display + per ticket · Chat/Meeting: `chat:*` / `meeting:*` (per user/tenant) · Kanban: per board · Booking/Hotel/Ticket: ไม่ระบุ scheme เลย — hub กลางเขียนไม่ได้ถ้า topic ไม่มีมาตรฐาน | 02 §8 · 04 §8.6 · 10 §3.5 · 11 §8.3/§11.9 · 13 §8 · 03 §3.12 · 05 §10 | มาตรฐานเดียว (ดู registry ง.4): unit-scoped = `unit:{unitId}:{module}:{topic}` · tenant-scoped = `tenant:{tenantId}:{module}:{topic}` · per-user = `user:{userId}:{module}` · public token = `public:{module}:{token}` — แก้ 04 (`q:{unitId}` → `unit:{unitId}:queue:board`) และเติม scheme ให้ 03/05/13 ตอน implement · กติกา 11 §11.9 (chat/meeting แยก namespace เด็ดขาด) คงไว้ |
| QC4-M3 | **ชื่อ notification template ใช้ 4 convention ปนกัน** — dot-case มี module prefix (`hotel.booking.hold`, `queue.almost`, `chat.unassigned`) · SCREAMING (`RESTAURANT_PICKUP_READY`, `COUPON_ISSUED`, `REWARD_REDEEMED`) · snake ไม่มี prefix (`tier_upgraded`, `points_expiring`) · kebab (`pos-e-receipt`) · แถม Ticket ใช้ `session.cancelled`/`event.reminder` ที่ไม่มี module prefix (ชนกับโมดูลอื่นได้) — template registry กลาง (A2) สร้างไม่ได้ถ้าชื่อไม่นิ่ง | 01 §8.7 · 02 §8 · 03 §8.5 · 04 §8.1 · 05 §7.5/§8 · 06 §7/§8.3 · 07 §7/§8 · 08 §7 · 09 §8.5 · 10 §8.1 · 11 §8.1 · 13 §8 · 14 §8 | มาตรฐานเดียว `<module>.<event_snake>` (dot ครั้งเดียว) — ตาราง mapping ชื่อเดิม→canonical อยู่ใน registry ง.1 · CORE เก็บ template ทั้งหมดใน `messages/{locale}/notify/<module>.json` + validate ตอน boot ว่า template ที่โมดูลอ้างมีจริง |
| QC4-M4 | **Impersonation นิยามขัดกันระหว่าง SECURITY กับ 15-backoffice** — (1) อายุ session: SECURITY §9 "≤ 1 ชม." vs 15 §3.4 "30 นาที hard limit" (2) blocklist โหมด WRITE คนละชุด: SECURITY ห้าม {จ่ายเงิน, ลบข้อมูล, แก้ payment settings, export ลูกค้าทั้งหมด} vs 15 ห้าม {เปลี่ยนอีเมล owner, ลบ/เชิญสมาชิกทีม, ชำระเงิน, ลบ unit} (3) การได้ WRITE: SECURITY แค่ "กดยกระดับแยก" vs 15 บังคับ SUPER_ADMIN approve เมื่อผู้ขอเป็น SUPPORT (4) การลง audit: SECURITY ให้ทุก action ลง AuditLog ร้าน (actorType=IMPERSONATED + onBehalfOf) vs 15 ให้ทุก request ลง PlatformAuditLog และลง AuditLog ร้านเฉพาะ WRITE (actor="SHARK Support") | SECURITY §9, §7.1 · 15-backoffice §3.4, §8 | ยึด **15-backoffice เป็นหลัก (เข้มกว่า)** แล้วอัปเดต SECURITY ให้ตรง: อายุ 30 นาที · WRITE ต้อง SUPER_ADMIN (หรือ approve) · blocklist = **union ทั้งสองชุด** {ชำระเงิน/จ่ายเงิน, ลบข้อมูล/ลบ unit, แก้ payment settings, export ลูกค้าทั้งหมด, เปลี่ยนอีเมล owner, ลบ/เชิญสมาชิกทีม} · audit สองชั้น: ทุก request → PlatformAuditLog; mutation (WRITE) → AuditLog ร้านด้วย `actorType=IMPERSONATED, actorId="SHARK Support", onBehalfOf=platformUserId` (ใช้ schema SECURITY §7.1 เดิม ไม่ต้องแก้) |
| QC4-M5 | **Backoffice session/cookie ขัดกัน** — SECURITY §1.3: cookie `__Host-shark_bo`, idle 8 ชม., absolute 24 ชม. vs 15 §3.1: cookie `__Host-bo_session`, SameSite=Strict, idle 60 นาที, absolute 12 ชม. | SECURITY §1.3 · 15-backoffice §3.1, §11.1 | ยึด 15 (เข้มกว่า): ชื่อ `__Host-bo_session` · Strict · idle 60 นาที / absolute 12 ชม. → อัปเดต SECURITY §1.3 ให้ตรง (แก้ทีเดียวกัน checklist 12.2 ที่อ้าง cookie) |
| QC4-M6 | **Pattern upload ขัดกัน** — SECURITY §4.4 บังคับ "endpoint upload กลางเดียว `lib/core/storage/` โมดูลห้ามรับไฟล์เอง + magic bytes sniff + re-encode ทุกรูป" แต่ Chat (10 §3.4, API #11/#21) และ Meeting (11 #18) ใช้ **presigned URL อัปตรงเข้า object storage** — ไฟล์ที่อัปตรงจะไม่ผ่าน sniff/re-encode ของ endpoint กลาง | SECURITY §4.4 · 10-chat §3.4, §11.9 · 11-meeting §3, #18 | ตัดสินให้ชัดใน CORE_API.md — ข้อเสนอ: upload service กลางมี **2 โหมด** (ก) proxy upload (default — sniff+re-encode ทันที) (ข) presigned upload สำหรับไฟล์ใหญ่/แชท โดยไฟล์อยู่สถานะ `PENDING` จนผ่าน **post-upload verification job** (sniff + validate + ย้าย prefix จริง) ก่อนถูกอ้างในข้อความ — ตรงกับที่ Chat มีสถานะ pending 1 ชม. อยู่แล้ว · ข้อกำหนด SECURITY (สุ่มชื่อ, path ต่อ tenant, signed URL, MIME allowlist) บังคับทั้งสองโหมด |
| QC4-M7 | **REPORTS stale + DailyStat ซ้อนกับ ChatDailyStat** — REPORTS §2.13 บอก "Chat/Meeting ยังไม่มีสเปค" แต่ 10-chat.md/11-meeting.md มีสเปคเต็มแล้ว · 10-chat นิยาม `ChatDailyStat` (per channel, หลายคอลัมน์, cron เที่ยงคืน) ทำหน้าที่ทับกับ DailyStat กลาง · module enum ใน DailyStat (§7.1) ไม่มีค่า `CHAT`/`MEETING` · แถบรวม Overview ต้องการ "แชทค้างตอบ" แต่ไม่มี contract ระบุ (PlatformDailyStat ของ backoffice = คนละ scope ไม่ซ้อน — OK) | REPORTS §2.13, §7.1–7.2 · 10-chat §4 (ChatDailyStat) · BLUEPRINT_BUSINESS_UNITS §4 | คำตัดสินที่เสนอ (แนวเดียวกับ HotelNightAudit): `ChatDailyStat` = ตาราง detail ภายในโมดูล (มิติ channel/FRT) **คงไว้** · Chat ต้อง implement `StatProvider` ป้อน DailyStat กลางด้วย metric ใหม่ `CHAT: conversations_new, conversations_resolved, messages_in` (เพิ่มค่า `CHAT` ใน module enum) · "แชทค้างตอบ" = Tier T live ผ่าน contract อ่านสด `chat.getUnansweredCount(tenantId, unitAccess)` — เพิ่มใน A3 stub · อัปเดต REPORTS §2.13 ให้อ้างสเปคจริง |
| QC4-M8 | **Event hooks `membership.unitAccessChanged` / `membership.removed` ต้อง emit จาก CORE แต่ไม่อยู่ใน Stage A** — Meeting (11 §7.6/§8.3/§11.4) subscribe สอง event นี้ + SSE hub ต้องตัด connection ทันทีเมื่อ `membership.removed` — โค้ดที่ emit อยู่ในหน้า settings/team ซึ่งเป็นของ A1 และจะถูก freeze — ถ้าไม่วาง event bus + จุด emit ตอน A จะต้องแก้ core ทีหลัง | 11-meeting §7.6, §8.3, §11.4 · 10-chat §7.3 · SECURITY §1.3 (revoke เมื่อถอด Membership) | เพิ่มใน A2: in-process event bus กลาง (`lib/core/events`) + CORE emit `membership.unitAccessChanged`, `membership.removed` จาก flow ทีม/สิทธิ์ของ A1 + SSE hub subscribe เพื่อตัด connection + session revoke ผูกจุดเดียวกัน |
| QC4-M9 | **Outbox/retry queue กลางไม่ถูกนิยาม** — POS ต้องมี outbox retry สำหรับ point.earn/account.post (backoff 5 ครั้ง + จอ "รายการค้างซิงก์"), Account บอก "ผู้เรียกเก็บเข้า retry queue ของตัวเอง", Chat outbound retry 3 ครั้ง, Backoffice retry email imp, Digest/StatRunner ใช้ debounce queue — และ system health ของ backoffice วัด **"queue lag"** ราวกับมี queue กลาง แต่ WORKPLAN A2 ไม่มีรายการนี้ → เสี่ยงแต่ละโมดูลสร้าง queue เอง 4–5 ชุด | 14-pos §7.1(9), §11.8 · 09-point §7.2, §8 · 12-account §7, §8.1 · 10-chat §8.5 · 15-backoffice §3.8, §8 · REPORTS §1.5 | เพิ่ม A2: **`lib/core/jobs` — outbox/job queue กลาง** (DB-backed, at-least-once + backoff + dead-letter + หน้าค้างซิงก์ + expose lag metric ให้ backoffice) — โมดูลใช้ enqueue อย่างเดียว consumer เป็นของโมดูล · ระบุใน CORE_API.md ว่า retry semantics + idempotency key เป็นหน้าที่ consumer |
| QC4-M10 | **โครง `Membership.permissions` / STAFF preset / permission มีพารามิเตอร์ — ไม่มีนิยามกลาง** — Hotel ship preset 2 แบบ (Front desk/Housekeeping), Ticket มี preset box office/gate, POS ใช้ `permissions.pos` + ค่าพารามิเตอร์ `maxDiscountBp` (default 1000), Member ใช้ ⚙️ custom หลาย action, Booking ต้องการ cross-module check (`booking.appointment.checkout` ต้องมี `pos.sale.create` ด้วย) — แต่ A1 ระบุแค่ "RBAC can() 4 มิติ" ไม่มี schema ของ permissions JSON, ไม่มีกลไก preset registry, ไม่มี parameterized permission | 01 §9 · 05 §9 · 14 §9 · 06 §9 · 03 §9 | A1 ต้อง fix โครง: `permissions: { [module]: { [action]: true \| { ...params } } }` + `can()` รองรับ params (`can(..., {action:'pos.sale.discount'})` คืน grant object) + preset = ชุด permissions ที่โมดูลลงทะเบียน (`registerStaffPreset(module, key, permissions)`) — UI เชิญพนักงานเลือก preset ได้ · cross-module = เรียก `can()` สองครั้ง (ไม่ต้องมีกลไกพิเศษ แต่เขียนเป็น convention) |
| QC4-M11 | **notify() ตามที่โมดูลคาดหวัง ใหญ่กว่าที่ A2 เขียนไว้มาก** — โมดูลต้องการ: (1) `NotificationLog` กลางกันส่งซ้ำ (07 assumption #4) (2) dedupe ด้วย tag + **รู้ว่า SSE เปิดอยู่** ("หน้า SSE เปิดอยู่ = ไม่ส่งซ้ำช่องอื่น" — 04 §8.1) (3) ตรวจ consent marketing ที่ notify layer เอง (06 §8.3) (4) ข้าม tenant ที่ SUSPENDED (15 §3.2) (5) channel `WEB` = in-app notification ที่**ไม่มีใครเป็นเจ้าของ UI** (Kanban/Meeting/Chat ยิง WEB — กระดิ่ง/inbox ในไหน? MB-04 คือ announcement ไม่ใช่ notify) | _CONVENTIONS §2.5 · 04 §8.1 · 06 §8.3 · 07 §8 · 11 §8.1 · 13 §8 · 15 §3.2 | เขียนสเปค notify service ใน CORE_API.md: `notify({tenantId, to, channel[], template, data, tag?, dedupeKey?})` + NotificationLog + consent gate (สอบ Member เมื่อ template ถูก mark `marketing`) + presence check ผ่าน SSE hub + suspended-tenant skip + **CORE เป็นเจ้าของ in-app notification center (กระดิ่ง + list + mark read) ใน shell A1** — เพิ่มเข้า checklist A1/A2 |
| QC4-M12 | **`Tenant.status` ค่าเต็ม + พฤติกรรม resolver อยู่ผิดที่** — core.prisma (BLUEPRINT §2) มีแค่ `TenantStatus @default(ACTIVE)` ไม่ประกาศค่า ส่วนค่าจริง `PENDING/ACTIVE/SUSPENDED/CLOSED/PENDING_DELETE` + `suspendedReason` ไปอยู่เป็น "contract change" ใน 15-backoffice — แต่ tenant resolver (A1) ต้องเคารพสถานะเหล่านี้ (410 + MB-07 + ตัด session + cron/notify skip) ตั้งแต่ freeze | BLUEPRINT §2 · 15-backoffice §4 (หมายเหตุ relation), §8.3 | ย้ายเข้า A1 เลย: enum เต็ม + `suspendedReason` ใน core.prisma ตั้งแต่แรก (additive ทีหลังทำได้แต่ middleware/resolver ที่อ่านมันคือ core ที่ freeze) + resolver/middleware อ่านสถานะ → 410/MB-07 + hook ให้ cron/notify/queue skip |
| QC4-M13 | **Contract stubs นับไม่ตรงและไม่พอ** — gate ข้อ 6 บอก "stub ครบ 6 ตัว" แต่ A3 ระบุแค่ 4 ชื่อ (createSale, point.earn, coupon.validate+redeem, account.post = 5 ฟังก์ชัน) · ยังขาด stub ที่ Stage B/C ประกาศว่าต้องมีจากกลาง: `member.findOrCreate` (+2.6b), `activity.log` (+2.7), `getUnitKpi` registry, `StatProvider`, `flags.isEnabled`, `chat.getUnanswered` (แถบ Overview), และข้อเสนอแก้ contract ของ 09 (idempotencyKey บังคับ, `point.reverse/quoteBurn/getBalance/transferOnMerge`), ของ 14 (`coupon.release` + รับ tx client) | WORKPLAN §1 A3, §6 · 06 §8.5–8.7 · 09 §8 · 14 §8 · 08 §7 · REPORTS §9.1 | นิยาม A3 = **รายชื่อ stub ชัดเจน 10 กลุ่ม** (ดู checklist ข้อ ข-A3) + ระบุเลขให้ตรงใน gate · คำขอแก้ _CONVENTIONS ของ 06/09/14 (2.2 idempotencyKey, 2.3 release, 2.6b, 2.7) ให้ CORE อนุมัติ**ก่อน freeze** เพราะเป็น interface ของ stub |

### MINOR (7)

| ID | ปัญหา | แหล่ง | ข้อเสนอแก้ |
|---|---|---|---|
| QC4-m1 | `Tenant.limits` ไม่มี key registry/naming standard — `maxUnits/maxTeam/storageMb` (15) vs `kanbanBoards` (13) ปนกัน | BLUEPRINT_BUSINESS_UNITS §5 · 13 §11.5 · 15 §3.5 | ใช้ registry ง.5 + convention `<domain><Noun>` camelCase มี default จาก `PlanDefinition.defaultLimits` — เพิ่ม helper `limits.get(tenantId, key)` ใน lib/core |
| QC4-m2 | Pattern ตั้งค่า unit ไม่สม่ำเสมอ — Hotel/POS/Account เก็บใน `BusinessUnit.settings.{module}` แต่ Restaurant ใช้ตาราง `RestaurantSetting` แยก | 01 §4.1 · 02 §4.2 · 12 §4.8 · 14 §4.1 | ยอมรับได้ (Restaurant field เยอะ+relation) แต่เขียนเป็นกติกาใน _CONVENTIONS: "ค่า config เรียบ → settings JSON namespace ของโมดูล; config ที่มี relation/ปริมาณมาก → ตารางโมดูล" กัน session อื่นตีความเอง |
| QC4-m3 | Cron runner ยังไม่มีสเปคความสามารถ ทั้งที่โมดูลอ้างเป็นของมีแล้ว — ต้องรองรับ: ตารางถี่ 1 นาที–รายวัน, **เวลา per-unit timezone** (audit 03:00 เวลาร้าน, member tier 03:00, point 03:30, chat purge 04:00), `X-Cron-Secret` (08/09 อ้างว่า "มีแล้วจาก Phase 0/1"), heartbeat ต่อ job → system health (15 §3.8), skip tenant SUSPENDED | 08 §7 · 09 §5.4 · 15 §3.8, §8 · REPORTS §1.5 | เขียนสเปค cron runner ใน CORE_API.md: job registry + schedule แบบ per-unit-tz + heartbeat table + secret + suspended skip (รายการ cron ทุกโมดูลรวมไว้ใน registry ง.6) |
| QC4-m4 | ลำดับอ่านของ session โมดูล (WORKPLAN §3.4) ไม่มี SECURITY.md / REPORTS.md — โมดูลจะพลาดกติกา [B] ของ SECURITY (idempotency, webhook, encryption) และกติการายงาน (ห้ามเขียน DailyStat ตรง, ห้ามทำ date picker เอง) | WORKPLAN §3.4 | แก้เป็น: `_CONVENTIONS.md → CORE_API.md → SECURITY.md (ป้าย [B] ของโมดูลตน) → REPORTS.md §9.2 → สเปคโมดูล → PROGRESS.md` |
| QC4-m5 | Coupon สร้าง rate limit ของตัวเอง (`CouponAttempt` + lockout 30 นาที) ทับซ้อน rate limit middleware กลาง (SECURITY §5.1 มีแถว coupon validate/redeem อยู่แล้ว) | 08 §3 (98) · SECURITY §5.1 | ยอมรับได้ (ต้องการ lockout stateful ต่อ member เกิน scope middleware) แต่หมายเหตุใน CORE_API.md ว่าชั้น middleware กลางยังคุมอีกชั้น — เลขสองชั้นต้องไม่ขัดกัน (middleware ≥ ชั้นโมดูล) |
| QC4-m6 | 2FA PlatformUser ป้าย stage ไม่ตรง — SECURITY §9 ให้บังคับ 2FA เป็น [L] แต่ 15-backoffice บังคับตั้งแต่ v1 ของโมดูล (เข้มกว่า — ทิศถูก) | SECURITY §9 · 15 §3.1 | อัปเดตป้ายใน SECURITY เป็น "มากับโมดูล 15 v1" กันตีความว่าเลื่อนได้ถึงก่อน launch |
| QC4-m7 | `getUnitKpi(unitId)` ของ Hotel ไม่มีพารามิเตอร์วัน — REPORTS §11 ตัดสินแล้วเป็น `(unitId, date)` แต่ 01-hotel §10 ยังเขียนแบบเก่า | 01 §10 · REPORTS §3.1, §11.2 | แก้ 01-hotel ตอน implement ให้ตรง REPORTS (คำตัดสินมีแล้ว — เหลือ sync ข้อความ) |

**สรุปจำนวน: CRITICAL 3 · MAJOR 13 · MINOR 7 — รวม 23 findings**

---

## ข. CORE Stage A checklist ฉบับรวมสุดท้าย

> รวมจาก: WORKPLAN A1–A3 + SECURITY §14 Stage A + REPORTS §9.1 + Backoffice §8 (6 จุดเชื่อม) + สิ่งที่โมดูล 01–14 ประกาศคาดหวัง
> จัดกลุ่ม A1/A2/A3 ใหม่ตามข้อเสนอในหัวข้อ ค. — ⭐ = ของใหม่ที่ WORKPLAN เดิมไม่มี

### A1 — Foundation + Security-at-the-edge (23 รายการ)

**Schema & isolation**
1. core.prisma: Tenant (⭐ +status enum เต็ม `PENDING/ACTIVE/SUSPENDED/CLOSED/PENDING_DELETE` + suspendedReason + limits Json) / User / Membership (role OWNER\|MANAGER\|STAFF + unitAccess + permissions Json) / BusinessUnit (type/status/settings/slug) / PlatformUser (⭐ +เผื่อ field 2FA, enum รองรับ FINANCE additive)
2. ⭐ Schema เผื่ออนาคตตาม SECURITY: AuthToken, Session, ChannelCredential (encPayload/keyVersion), AuditLog.onBehalfOf
3. Prisma tenant guard extension + unit guard (dev-throw / prod-throw) + `crossUnit` flag + raw client กักบริเวณ `lib/core/db/raw.ts` + lint rule
4. ⭐ Isolation fixture 2 tenants × 2 units + route manifest + test matrix generator + CI gate (`pnpm check` รวม isolation เสมอ)

**Auth & session**
5. Magic link (hash, 15 นาที, single-use atomic, interstitial POST) + OTP fallback (limit/lockout) + anti-enumeration
6. Session table + `__Host-shark_session` + rotation + revoke ทุกเครื่อง + โหลด Membership สด (cache ≤60s) — ⭐ผูก event `membership.removed` (ดู A2-11)
7. ⭐ Backoffice session แยกขาด: `__Host-bo_session` (Strict, idle 60m/abs 12h — ตาม QC4-M5) — วางตาราง/namespace ไว้แม้ module 15 มาทีหลัง

**RBAC**
8. `can()` 4 มิติ + `withUnitCtx` pattern + default deny + 404-not-403 convention
9. ⭐ โครง `Membership.permissions` JSON + parameterized permission (เช่น maxDiscountBp) + `registerStaffPreset()` (QC4-M10)

**Edge security (ตาม SECURITY [A])**
10. ⭐ zod `.strict()` ทุก endpoint (กติกา + helper) · sanitizer กลาง + ban dangerouslySetInnerHTML
11. ⭐ Rate limit middleware 3 มิติ + ค่ากลุ่ม auth · Origin/Sec-Fetch-Site check ทุก mutation
12. ⭐ Security headers ครบ §8.1 + CORS ปิด + error boundary ไม่รั่ว stack
13. ⭐ gitleaks + lockfile CI + `.env` hygiene

**Shell & UX foundation**
14. i18n TH/EN (`messages/{locale}/{module}.json` แยกไฟล์) + design system B&W
15. Dashboard shell + Unit Switcher + sidebar 3 โซน + URL scheme `/app/u/[unitSlug]/`
16. ⭐ Slot ใน `(app)` shell 3 จุด: widget แจ้งปัญหา (MB-01), announcement banner + กระดิ่ง (MB-04), impersonation banner (MB-05) — mount point + จองพื้นที่ (ตัว component จริงมากับโมดูล 15)
17. ⭐ Middleware `(app)` รองรับ imp context (อ่าน imp cookie → actor พิเศษ → enforce READ_ONLY blocklist ชั้น middleware)
18. ⭐ Tenant resolver เคารพ Tenant.status (SUSPENDED/CLOSED/PENDING_DELETE → 410 + MB-07) + จอง route `/app/help/*`, `/app/settings/billing`
19. ⭐ In-app notification center (กระดิ่ง + list + mark read) รองรับ notify channel `WEB` (QC4-M11)
20. Onboarding สร้างกิจการแรก + `settings/units` + เชิญพนักงาน (เลือก role/unitAccess/preset)
21. หน้า Overview "ทุกกิจการ" (การ์ด mock จาก stub A3) + แถบรวม tenant
22. ⭐ Design components รายงานกลาง: `<ReportShell>` `<StatCard>` `<DateRangePicker>` `<ReportTable>` (REPORTS §8.1 — ผูก A1 เพราะเป็น design system)
23. ⭐ `bizDate(unit, ts)` + tenant timezone helper (REPORTS §1.4 — POS/Account/Queue ใช้ทันที) — ห้าม hardcode +7

### A2 — Platform services (14 รายการ)

1. AuditLog กลาง (schema §7.1, append-only, DB grant INSERT/SELECT) + audit hook ผูกใน contract stubs
2. `notify()` service: channel EMAIL/WEB (LINE 🔜) + ⭐ template registry (ง.1) + ⭐ NotificationLog + ⭐ tag dedupe/presence-aware + ⭐ consent gate (stub จน Member ลง) + ⭐ skip tenant SUSPENDED
3. SSE hub กลาง: ⭐ topic scheme มาตรฐาน (ง.4) + Last-Event-ID resume + replay buffer + heartbeat + reconnect-snapshot convention + public-token stream (จอคิว/ตั๋ว/QR โต๊ะ) + จำกัด connection ต่อ user + ตรวจ tenant ทุก event
4. Cron runner: job registry + per-unit-timezone schedule + `X-Cron-Secret` + ⭐ heartbeat → system health + ⭐ skip tenant SUSPENDED (ง.6)
5. ⭐ Outbox/job queue กลาง `lib/core/jobs` (at-least-once, backoff, dead-letter, จอค้างซิงก์, lag metric) — QC4-M9
6. Object storage + upload service: sniff/re-encode/สุ่มชื่อ/path ต่อ tenant/signed URL + ⭐ โหมด presigned + post-upload verification (QC4-M6)
7. Tenant.limits: ⭐ key registry (ง.5) + `limits.get()` helper + enforcement จุดสร้าง unit/บอร์ด/ทีม
8. ⭐ `lib/core/flags`: `flags.isEnabled(key, tenantId)` + cache 60s + invalidate (ตาราง FeatureFlag มากับ 15 — interface อยู่ core)
9. ⭐ `platformPrisma` client แยก (ไม่ผ่าน tenant extension) — ให้เฉพาะ `lib/modules/backoffice`
10. ⭐ Event bus in-process `lib/core/events` + ประกาศ event registry (ง.3)
11. ⭐ CORE emit `membership.unitAccessChanged` / `membership.removed` จาก flow ทีม (A1-20) + SSE hub ตัด connection + session revoke (QC4-M8)
12. ⭐ DailyStat (core.prisma) + partial unique index + `statUpsert()` + StatRunner (cron กลางคืน/15 นาที/debounce) — REPORTS §9.1
13. ⭐ Report API kit: response envelope + date-range/compare util + cap 366 วัน — REPORTS §7.3
14. ⭐ ExportService + ReportExportLog: CSV UTF-8 BOM + permission gate + bulk security event (ใช้ AuditLog+notify ของ A2)

### A3 — Contract stubs + CORE_API.md (10 กลุ่ม)

1. `createSale / voidSale / refundSale` (POS 2.1) — stub คืน mock + ยิง audit hook
2. `point.earn / burn / adjust / reverse / quoteBurn / getBalance / transferOnMerge` (2.2 ฉบับแก้ตาม 09 §8 — idempotencyKey บังคับ)
3. `coupon.validate / redeem / release / issuePersonalCode` (2.3 ฉบับแก้ตาม 14 §8 — redeem/release รับ tx client)
4. `account.post` + facade `postSale / postRefund / postPointBurn` (2.4 + 12 §8.1)
5. `notify()` interface (ชี้ไป A2 service — โมดูลเรียกผ่าน contract เดียว)
6. ⭐ `member.findOrCreate` (2.6b) + `activity.log` (2.7) — ตามข้อเสนอ 06 ที่ต้องอนุมัติก่อน freeze
7. ⭐ `getUnitKpi(unitId, date)` + `registerUnitKpiProvider` + stub mock ทุก UnitType (REPORTS §3.1)
8. ⭐ `StatProvider.collectDailyStats(scope, date)` interface (REPORTS §7.2)
9. ⭐ `chat.getUnanswered(tenantId, unitAccess)` stub (แถบรวม Overview — QC4-M7)
10. ⭐ **CORE_API.md**: ทุก service ข้างบน + ตัวอย่างเรียก + registry 4 ชุด (template/settings/event/limits จากหัวข้อ ง.) + topic scheme + กติกา retry/idempotency + วิธียื่น contract change

> **ขนาดรวม: 23 + 14 + 10 = 47 รายการ** (WORKPLAN เดิมนับได้ ~17 — ของหลุด ~30 รายการ)
> หมายเหตุ: ของกลางที่ REPORTS ผูกกับ "ปลาย Stage B" (Daily Digest, หน้า consolidated) **ไม่อยู่ใน Stage A** — ถูกต้องแล้ว คงไว้ตามเดิม

---

## ค. ประเมิน: Stage A ใหญ่เกินไหม + ข้อเสนอแบ่งใหม่

**คำตัดสิน: ใหญ่เกินสำหรับ "1 session เดียว" ตามที่ WORKPLAN เขียน แต่เนื้อส่วนใหญ่เลื่อนไม่ได้** — 47 รายการนี้เกือบทั้งหมดคือของที่ freeze แล้วแตะไม่ได้อีก (schema แกน, guard, shell slot, contract interface) ถ้าตัดออกจะย้อนกลับมาเป็น contract change ที่ block ทุก session

ข้อเสนอ:

1. **เลิกตีความ "session เดียว" ตามตัวอักษร** → Stage A = **3 session ต่อเนื่อง (A1 → A2 → A3) โดยยังห้ามขนานกับใครทั้งสิ้น** — เจตนาเดิม (CORE คนเดียวถือปากกา) คงอยู่
2. **แบ่ง A2 เป็น 2 คลื่นเพื่อปล่อย Stage B เร็วขึ้น** (ทางเลือก ถ้าอยากเร่ง):
   - **A2a (block Stage B):** AuditLog · notify (EMAIL+WEB ขั้นต่ำ) · cron runner + X-Cron-Secret · outbox/jobs · DailyStat/statUpsert · Tenant.limits — เพราะ POS/Member/Point/Account ใช้ทันที (idempotency, cron expire, posting retry)
   - **A2b (block เฉพาะ Stage C + โมดูล 15):** SSE hub · object storage/upload · flags · platformPrisma · ExportService/Report kit — Stage B แทบไม่แตะ (POS ใช้ SSE แค่จอรอง, ไม่มี upload)
   - เงื่อนไข: interface ของ A2b ต้องประกาศใน CORE_API.md ตั้งแต่ A3 (โมดูลเขียนโค้ด against interface ได้) — เริ่ม Stage B ได้หลัง A1+A2a+A3 แล้ว CORE ทำ A2b ต่อคู่ขนานกับ Stage B (CORE ยังเป็นคนเดียวที่แตะ lib/core — ไม่ผิดกติกา)
3. **สิ่งที่เลื่อนออกจาก Stage A ได้จริง (ไม่ block ใคร):**
   - Daily Digest + หน้า consolidated (REPORTS ผูกปลาย Stage B แล้ว — คงเดิม)
   - PDF engine, scheduled export, LINE channel (🔜 ตามสเปคเดิม)
   - ตัว UI จริงของ widget แจ้งปัญหา/banner/impersonation (มากับโมดูล 15) — **Stage A ทำแค่ slot + middleware + resolver** (A1-16/17/18)
   - Field-level encryption (SECURITY §6.2) — ป้าย [B/L] อยู่แล้ว แค่วาง schema (A1-2)
   - StatRunner backfill 90 วัน อัตโนมัติ (edge case REPORTS §10.6) — ทำตอนโมดูลแรก register provider ก็ทัน
4. **สิ่งที่ห้ามเลื่อนเด็ดขาด (บทเรียนจาก findings):** Tenant.status เต็มรูป + resolver (M12), event bus + membership.* (M8), permissions schema/preset (M10), topic/template/event naming standards (C3/M2/M3), bizDate (POS/Account ใช้วันแรก), isolation CI gate (SECURITY ระบุว่าคือ gate ของ CORE)

---

## ง. Registries (ฉบับตั้งต้น — ให้ CORE ยกไปใส่ CORE_API.md)

### ง.1 Notification template registry

Convention เสนอ: **`<module>.<event_snake>`** — คอลัมน์ "ชื่อในสเปค" คือของเดิมที่ต้องแก้ให้ตรง canonical

| # | Canonical | ชื่อในสเปคเดิม | โมดูล | ช่อง | หมายเหตุ |
|---|---|---|---|---|---|
| 1 | `hotel.booking_hold` | hotel.booking.hold | 01 | EMAIL | ลิงก์จ่ายมัดจำ+หมดเวลา |
| 2 | `hotel.booking_confirmed` | hotel.booking.confirmed | 01 | EMAIL | |
| 3 | `hotel.booking_reminder` | hotel.booking.reminder | 01 | EMAIL | ก่อนเช็คอิน 1 วัน |
| 4 | `hotel.booking_cancelled` | hotel.booking.cancelled | 01 | EMAIL | +ยอดคืน |
| 5 | `hotel.booking_expired` | hotel.booking.expired | 01 | EMAIL | |
| 6 | `hotel.checkout_receipt` | hotel.checkout.receipt | 01 | EMAIL | +แต้มที่ได้ |
| 7 | `hotel.audit_summary` | hotel.audit.summary | 01 | EMAIL/WEB | OWNER/MANAGER |
| 8 | `restaurant.pickup_ready` | RESTAURANT_PICKUP_READY | 02 | WEB/EMAIL | |
| 9 | `restaurant.pickup_rejected` | (ไม่ตั้งชื่อ) | 02 | WEB/EMAIL | |
| 10 | `member.link_otp` | (OTP ผูกสมาชิก — 02 ใช้) | 02→06 | SMS?/EMAIL | เจ้าของ template ควรเป็น Member |
| 11 | `booking.confirmed` | booking.confirmed | 03 | EMAIL(/LINE🔜) | |
| 12 | `booking.pending` | booking.pending | 03 | EMAIL | |
| 13 | `booking.rescheduled` | booking.rescheduled | 03 | EMAIL | |
| 14 | `booking.cancelled` | booking.cancelled | 03 | EMAIL | |
| 15 | `booking.reminder` | booking.reminder | 03 | EMAIL/LINE | cron 5 นาที |
| 16 | `queue.almost` | queue.almost | 04 | LINE/EMAIL/WEB | dedupe ด้วย tag เมื่อ SSE เปิด |
| 17 | `queue.called` | queue.called | 04 | เดียวกัน | สำรองเมื่อไม่มี SSE |
| 18 | `queue.skipped` | queue.skipped | 04 | เดียวกัน | |
| 19 | `ticket.issued` | ticket.issued | 05 | EMAIL | QR inline + guest link |
| 20 | `ticket.session_cancelled` | session.cancelled ⚠️ไม่มี prefix | 05 | EMAIL | notify ทุก buyer |
| 21 | `ticket.event_reminder` | event.reminder ⚠️ไม่มี prefix | 05 | EMAIL | 24 ชม. ครั้งเดียว/order |
| 22 | `ticket.refund_approved` | (ไม่ตั้งชื่อ) | 05 | EMAIL | |
| 23 | `ticket.refund_rejected` | (ไม่ตั้งชื่อ) | 05 | EMAIL | |
| 24 | `member.tier_upgraded` | tier_upgraded | 06 | EMAIL/WEB | |
| 25 | `member.tier_downgraded` | (ไม่ตั้งชื่อ) | 06 | EMAIL | รวม renew notice |
| 26 | `member.tier_expiring` | เตือนก่อนตกระดับ (ไม่ตั้งชื่อ) | 06 | EMAIL | 30 วันก่อนสิ้นรอบ |
| 27 | `member.claim_otp` | claim OTP (ไม่ตั้งชื่อ) | 06 | EMAIL/SMS | |
| 28 | `member.card_invite` | เชิญรับบัตร (ไม่ตั้งชื่อ) | 06 | EMAIL | auto-create |
| 29 | `member.dsr_update` | DSR update (ไม่ตั้งชื่อ) | 06 | EMAIL | |
| 30 | `reward.redeemed` | REWARD_REDEEMED | 07 | EMAIL/WEB | +code/QR |
| 31 | `reward.pickup_reminder` | เตือน 3 วัน (ไม่ตั้งชื่อ) | 07 | EMAIL | |
| 32 | `reward.fulfilled` | FULFILLED (ไม่ตั้งชื่อ) | 07 | EMAIL | |
| 33 | `reward.cancelled` | CANCELLED (ไม่ตั้งชื่อ) | 07 | EMAIL | |
| 34 | `reward.expired` | EXPIRED (ไม่ตั้งชื่อ) | 07 | EMAIL | |
| 35 | `coupon.issued` | COUPON_ISSUED | 08 | EMAIL/WEB | แจก PERSONAL |
| 36 | `point.earned` | points_earned | 09 | WEB | default ปิด |
| 37 | `point.expiring` | points_expiring | 09 | EMAIL/WEB | 30/7 วัน |
| 38 | `point.adjusted` | points_adjusted | 09 | EMAIL/WEB | |
| 39 | `chat.unassigned` | chat.unassigned | 10 | WEB | |
| 40 | `chat.assigned_to_you` | chat.assigned_to_you | 10 | WEB/EMAIL | |
| 41 | `chat.staff_replied` | chat.staff_replied | 10 | EMAIL | throttle 1/ชม./เธรด |
| 42 | `meeting.mentioned` | meeting.mentioned | 11 | WEB/EMAIL | throttle digest 15 นาที |
| 43 | `meeting.dm_new` | meeting.dm_new | 11 | WEB/EMAIL | |
| 44 | `meeting.announcement` | meeting.announcement | 11 | WEB/EMAIL | |
| 45 | `meeting.event_reminder` | meeting.event_reminder | 11 | WEB/EMAIL | ก่อน 30 นาที |
| 46 | `meeting.event_changed` | meeting.event_changed | 11 | WEB/EMAIL | |
| 47 | `kanban.mention` | kanban.mention | 13 | WEB/EMAIL | |
| 48 | `kanban.assigned` | kanban.assigned | 13 | WEB/EMAIL | |
| 49 | `kanban.due_reminder` | kanban.due_reminder | 13 | WEB/EMAIL | |
| 50 | `kanban.comment_on_assigned_card` | kanban.comment_on_assigned_card | 13 | WEB/EMAIL | |
| 51 | `pos.e_receipt` | pos-e-receipt | 14 | EMAIL | |
| 52 | `pos.low_stock_digest` | (ไม่ตั้งชื่อ) | 14 | EMAIL | รวมเข้า Daily Digest กลาง (REPORTS §11.7) |
| 53 | `pos.shift_over_short` | (ไม่ตั้งชื่อ) | 14 | EMAIL/WEB | เกิน threshold |
| 54 | `pos.shift_force_closed` | (ไม่ตั้งชื่อ) | 14 | EMAIL/WEB | |
| 55 | `account.tax_invoice` | (ไม่ตั้งชื่อ) | 12 | EMAIL | PDF ใบกำกับเต็มรูป |
| 56 | `account.period_closed` | (ไม่ตั้งชื่อ) | 12 | WEB/EMAIL | |
| 57 | `account.reconcile_diff` | (ไม่ตั้งชื่อ) | 12 | WEB/EMAIL | เกิน threshold |
| 58 | `account.suspense_pending` | (ไม่ตั้งชื่อ) | 12 | WEB | |
| 59 | `reports.daily_digest` | Daily Digest | REPORTS §4 | EMAIL (LINE🔜) | ปลาย Stage B |
| 60–71 | `backoffice.case_replied / case_status_changed / case_waiting_info / csat_invite / imp_started / imp_ended / invoice_created / payment_rejected / receipt / renewal_30 / renewal_7 / tenant_suspended / export_ready` (ประมาณ 12–13 ใบ — สเปค 15 ไม่ตั้งชื่อ) | — | 15 | EMAIL | 2 ภาษา ตาม QC 15 |

**รวม ≈ 71 template (ตั้งชื่อแล้วในสเปค 38 · ยังไม่ตั้งชื่อ ~33)** — ทุกใบ TH/EN

### ง.2 unit.settings key registry (กันชื่อชน)

| Namespace | Keys | เจ้าของ | หมายเหตุ |
|---|---|---|---|
| (root) | `timezone` (default Asia/Bangkok) | CORE | ทุกโมดูลอ่าน — ห้าม hardcode +7 |
| (root) | `openHours` | CORE | Booking intersect slot · Chat ใช้เป็นเวลาทำการ widget |
| (root) | `dayCutoffHour` 🔜 | CORE | Queue §11.3 + REPORTS §1.4.4 — มีผลทุกโมดูลพร้อมกัน |
| `hotel.*` | checkInTime, checkOutTime, weekendDays, holdMinutes, bookingMode, noShowCutoff, auditAutoTime, dailyHousekeeping, inspectionRequired, maxAdvanceBookingDays, bookingCodePrefix | 01 | |
| `booking.*` | queueHandoff {enabled, queueTypeCode} | 03 | handoff → Q ใน unit เดียวกัน |
| `pos.*` | ~~vat~~ (→ ย้ายไป account ตาม QC4-C2), receipt {prefix, refundPrefix, header, footer, posRegNo, showPoints}, payment {promptpayId, bankAccounts[]}, stock.oversellPolicy, shift {blindClose, overShortAlertSatang}, discount.requireReasonOverBp | 14 | ⚠️ ตัด `vat` + `receipt.taxId` |
| `account.*` | vatRegistered, priceIncludesVat, vatRate, taxId, branchCode, legalName, legalAddress, docPrefix | 12 | **source of truth ของ VAT/นิติบุคคล** (QC4-C2) |
| (Restaurant) | — ใช้ตาราง `RestaurantSetting` แยก | 02 | pattern ต่าง — ดู QC4-m2 |
| (Chat) | อ่าน openHours ของ unit + fallback `ChatSetting.businessHours` ระดับ tenant | 10 | |

### ง.3 Event name registry (in-process event bus)

Convention: **`<module>.<entity>.<past-tense>`** · core-owned ใช้ prefix ตามโดเมน

| Event | Emitter | Subscribers | หมายเหตุ |
|---|---|---|---|
| `pos.sale.paid` | POS (SaleDocument ครบยอด) | Ticket (ออกตั๋ว) | สเปค 05 เขียน `sale.paid` — แก้ตาม QC4-C3 |
| `pos.sale.voided` | POS (voidSale) | Restaurant (ปลด lock/reopen), Hotel/Booking/Ticket (ปรับเอกสารต้นทาง) | สเปค 02 เขียน `sale.voided` — แก้ |
| `pos.sale.refunded` | POS (refundSale) | โมดูลต้นทาง 01/02/03/05 | |
| `membership.unitAccessChanged` | CORE (settings/team) | Meeting (auto-join/leave), Chat (badge/สิทธิ์เห็น) | CORE ต้อง emit ตั้งแต่ A (QC4-M8) |
| `membership.removed` | CORE | SSE hub (ตัด connection), Meeting (leftAt), Session revoke | |
| `queue.ticket.done` | Queue | Booking (ปิด loop handoff) | สเปค 04 เขียน `queue.done(refId)` — ปรับตาม convention |
| (internal) `statRefresh` | ทุกโมดูลผ่าน statUpsert queue | StatRunner | ไม่ใช่ domain event — อยู่ใน jobs |

### ง.4 SSE topic scheme (มาตรฐานเสนอ)

```
unit:{unitId}:{module}:{topic}      ← unit-scoped (restaurant kds/floor, queue board, booking calendar, ticket live, hotel housekeeping)
tenant:{tenantId}:{module}:{topic}  ← tenant-scoped (kanban board ใช้ boardId เป็น topic)
user:{userId}:{module}              ← stream ต่อ user (chat staff, meeting, badge)
public:{module}:{token}             ← ไม่มี session (จอคิว displayToken, บัตรคิว publicToken, ตั๋ว guest, QR โต๊ะ qrToken)
```
- Chat `chat:*` / Meeting `meeting:*` แยก namespace เด็ดขาด (กติกา 11 §11.9) — เข้ากับ scheme นี้ได้ (`user:{id}:chat` vs `user:{id}:meeting`)
- ความสามารถ hub ที่โมดูลประกาศแล้ว: Last-Event-ID + replay buffer ~5 นาที (10/11) · heartbeat 25–30s (10/04) · reconnect → refetch snapshot ก่อน resubscribe (02/04) · ตรวจ tenant/สิทธิ์ต่อ event + re-check ทุก 5 นาที (13) · ตัด connection เมื่อ membership.removed (11) · presence (ออนไลน์ = มี stream) แชร์ Chat/Meeting (11 §8.3) · notify() ถาม presence ได้ (04)

### ง.5 Tenant.limits key registry

| Key | Default (FREE) | ผู้ใช้ |
|---|---|---|
| `maxUnits` | 5 | CORE (สร้าง unit) — BLUEPRINT_BUSINESS_UNITS §5 |
| `maxTeam` | 10 | CORE (เชิญพนักงาน) — 15 §3.5 PlanDefinition |
| `storageMb` | 1024 | upload service + backoffice usage |
| `kanbanBoards` | 20 | Kanban (13 §11.5 — ในโมดูลยังมี limit ย่อยของตัวเอง: columns 20, cards 1000, checklist 50, attachments 20×20MB, members 50, storage 2GB) |
| `maxCustomers` / `maxTxPerMonth` | (ยังไม่กำหนดค่า) | backoffice Usage tab อ้างถึง — ต้องนิยามตอนทำ 15 |

### ง.6 Cron registry (รวมทุกโมดูล — ให้ cron runner รองรับ)

| โมดูล | Job | ความถี่ |
|---|---|---|
| CORE/REPORTS | StatRunner refresh วันนี้ / ปิดเมื่อวาน / re-verify | 15 นาที / 00:30 unit-tz / 03:00 D+1 |
| CORE | ลบ Session/AuthToken หมดอายุ | รายวัน (ภายใน 30 วัน — SECURITY §6.4) |
| CORE/REPORTS | Digest assembler (ปลาย Stage B) | รายชั่วโมง+15 |
| Hotel | HOLD sweeper · night audit auto | 1 นาที · `auditAutoTime` unit-tz |
| Booking | reminder + auto no-show + PENDING TTL | 5 นาที |
| Queue | SKIPPED→NO_SHOW + สิ้นวันกวาดค้าง + rolling avg | 5 นาที + สิ้นวัน unit-tz (+1 ชม.) |
| Ticket | hold expire · session/event lifecycle · reminder 24 ชม. | 1 นาที · 15 นาที · รายวัน |
| Member | tier renew/downgrade + เตือน 30 วัน | รายวัน 03:00 tenant-tz |
| Coupon | expire code/campaign + ลบ CouponAttempt | รายชั่วโมง (`X-Cron-Secret`) |
| Point | expire · expiry-notify · reconcile | รายวัน 03:30 · รายคืน (`X-Cron-Secret`) |
| Chat | retention purge · ChatDailyStat · orphan upload · unread reconcile | 04:00 unit-tz · เที่ยงคืน · รายชั่วโมง · รายคืน |
| Meeting | event reminder 30 นาที | 5 นาที |
| Kanban | due reminder | 5 นาที |
| POS | force-close กะ · held cart discard · low stock digest · PO draft auto-cancel | 04:00 unit-tz · เที่ยงคืน unit-tz · รายวัน · รายวัน |
| Backoffice | sla-scan · domain-check · billing-reminders · case-autoclose · stats-rollup · purge-deletions | 5 นาที · 10 นาที · รายวัน · รายวัน · 03:30 ICT · รายวัน |

ความต้องการรวม: schedule per-unit/tenant timezone · heartbeat ต่อ job → system health (15 §3.8) · skip tenant SUSPENDED · idempotent ทุกตัว (รันซ้ำ/ซ้อน 2 instance ต้องปลอดภัย — 09 QC)

---

## จ. Gate "CORE เสร็จ" เวอร์ชันอัปเดต (แทน WORKPLAN ข้อ 6)

- [ ] 1. Loop จริงบนเครื่อง: สมัคร→ยืนยันอีเมล→สร้างองค์กร→สร้างกิจการแรก→dashboard + Unit Switcher + `/app/u/[unitSlug]/`
- [ ] 2. `can()` 4 มิติ + permissions schema/preset + Prisma guard + **isolation suite ผ่านบน CI (fixture 2×2 + route manifest ครบทุก route)**
- [ ] 3. เชิญพนักงาน + จำกัด unitAccess + **ถอด Membership แล้ว: session revoke + event `membership.removed`/`unitAccessChanged` ยิงจริง + SSE ตัด**
- [ ] 4. Security-at-the-edge ครบตาม SECURITY §14 Stage A: rate limit ตอบ 429 จริง · headers ผ่าน `curl -I` · zod strict (ยัด field เกิน→ปฏิเสธ) · origin check · 404-not-403 · error ไม่รั่ว stack · gitleaks เขียว
- [ ] 5. Platform services มีจริง+มีเทส: AuditLog (append-only + grant) · notify (template registry validate ตอน boot + NotificationLog + WEB inbox แสดงผล) · SSE hub (resume + heartbeat + public token) · cron runner (per-unit tz + heartbeat + X-Cron-Secret) · outbox/jobs (retry+dead-letter) · upload (sniff/re-encode/signed URL) · flags.isEnabled · platformPrisma · Tenant.limits enforce ที่จุดสร้าง unit
- [ ] 6. Backoffice hooks พร้อม: slot 3 จุดใน shell · imp middleware (READ_ONLY block ได้จริง) · tenant resolver ตอบ 410 เมื่อ SUSPENDED · route `/app/help`, `/app/settings/billing` จองแล้ว
- [ ] 7. Reports foundation: bizDate helper มีเทสข้ามเที่ยงคืน/timezone · DailyStat + statUpsert (partial unique ทำงาน) · Report API kit · ExportService (CSV BOM + export log + bulk event) · ReportShell/StatCard/DateRangePicker/ReportTable ใช้ในหน้า Overview แล้ว
- [ ] 8. Contract stubs ครบ **10 กลุ่ม** (ข้อ ข-A3) — เรียกได้จริง คืน mock + audit hook ยิง · Overview แสดงการ์ด KPI จาก stub
- [ ] 9. `CORE_API.md` เผยแพร่ ครบ: ทุก service + ตัวอย่างเรียก + registry 4 ชุด (template/settings/event/limits) + SSE topic scheme + naming standards + วิธียื่น contract change
- [ ] 10. i18n TH/EN + design tokens B&W ทุกหน้า shell + empty/loading/error state
- [ ] 11. คำขอแก้ _CONVENTIONS ที่ค้างจาก 06/09/14 (2.2 idempotencyKey+point.reverse ฯลฯ, 2.3 release+tx, 2.6b findOrCreate, 2.7 activity.log) **อนุมัติและสะท้อนใน stub แล้ว** — ห้าม freeze ทั้งที่ contract ยังมีคำขอค้าง
- [ ] 12. ความขัดใน findings C2 (VAT), C3 (event names), M2–M7 ถูกตัดสิน + แก้ไฟล์สเปคที่เกี่ยวแล้ว (กัน session โมดูล implement คนละทาง)

---

*จบรายงาน QC4 — จัดทำโดย QC สายที่ 4 (platform/CORE)*
