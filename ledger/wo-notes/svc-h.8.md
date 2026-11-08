# WO H.8 — จองออนไลน์ V2 (storefront โรงแรม · ภาพ 16 ก/ข/ค) (RUN SVC)

> RUN "SVC" · worktree `/root/projects/shark-svc-l1` · branch `wip/svc-h8` (ฐาน b441ca678) · 7 พ.ย. 2569 · ผู้คุม: Opus (Fable ติดโควตา) · builder: Opus
> สัญญา: ใบสั่ง `ledger/svc-briefs/svc-brief-h.8.md` (§9 + §10 ชนะ §0–§8) · ภาพ `ledger/design-dorm/16-hotel-online-booking.png`
> ข้อสอบใบ: `scripts/qc-svc-h.8.mts` (84 ข้อ · **builder ไม่แก้** — ข้อแย้ง §7)
> ระดับตรวจ: **เข้ม** (สาธารณะ X7 + เงิน/มัดจำ) — ผู้ตรวจ 2 รอบ (ยังไม่ได้ทำ · ผู้คุมปล่อย)
> ฐาน: qc-svc เลน l1 (`ep-royal-lake`) ผ่าน `scripts/qc-svc.sh`

## 1. ไฟล์ที่แตะ
| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `src/lib/platform/hotel-web.ts` | ใหม่ | public API `(input, opts{clientKey,now?,deps?})`: publicInfo · publicSearch · publicQuote · publicCreateHold · publicPayDeposit · publicAttachSlip · publicStatus · publicLookup · publicCancel · holdFormStart · hotelWebClientKey · hotelHostAllowed · consumer `onHotelSlipApproved` · rate limit (checkRateLimitDb · คีย์ `hw:<op>:<hash หน่วย>:<hash IP>`) · event hotel.web.* 5 |
| `src/lib/platform/hotel-mail.ts` | ใหม่ | `notifyGuest(kind, id, locale?, deps?)` · `GUEST_MAIL_KINDS` 5 แบบ TH/EN · .ics · `onHotelBookingEvent` (consumer · หัวกลุ่มเท่านั้น · ไม่ throw) · `runGuestReminders` |
| `src/lib/modules/hotel/storefront.ts` | ใหม่ (ชื่อใน §1 · ใช้เป็นชั้นข้อมูลอ่านอย่างเดียว ไม่ใช่ API สาธารณะ — §10.12) | webUnitBySlugs · webSearchBundle (หน่วย+ประเภท+กฎยกเลิก+ห้องว่าง buildAvailability = 1 คิวรี) · webPlansOf · webBookingFacts · webBookingByCode · webBookingByIdem · planCancelRules · hotelDepositSlipFacts (+settled) · slipByIdemKey · lineOaBasicId · guestMailFacts · arrivalsWithEmailOn — ไม่ import prisma ดิบ (SQL ดิบผ่าน client ขยายแบบ sweepExpiredHolds) |
| `src/lib/modules/hotel/booking.ts` | แก้ **เพิ่มอย่างเดียว** (diff ไม่มีบรรทัดลบ) | input `locale` · `coupon` (snapshot) · `idempotencyKey` → policySnapshot.{locale, coupon, webIdem} · ล็อกกุญแจใน guard tx ⇒ `DUPLICATE_REQUEST` · `cancelBookingAsGuest(ctx, input)` (AsyncLocalStorage ⇒ ด่าน actor null เฉพาะยกเลิก · AuditLog after.by "GUEST") |
| `src/lib/modules/hotel/index.ts` · `actions.ts` | เพิ่ม | export ของ H.8 · `decideHotelSlipAction` (decideSlip ของสลิปกลาง) |
| `src/app/(store)/s/[tenantSlug]/[unitSlug]/hotel/{page, book/page, pay/[publicToken]/page, r/[publicToken]/page, my/page}.tsx` · `_web.tsx` · `actions.ts` · `slip/[publicToken]/route.ts` | แก้/ใหม่ | S1–S6 มือถือ 390 · TH/EN (`?lang=` ชนะ cookie) · โดเมนร้าน guard (`headers().get("host")` → `resolveTenantByHost`) · actions 4 ตัว (เดิม createPublicReservationAction ถูกแทน · URL คง) |
| `src/components/store/hotel/*` | ใหม่ | SearchBar · RoomTypeCard · BookingForm (client) · DepositPay (client) · HoldCountdown (client) · StatusCard · LookupForm · CancelDialog (client) · format.ts |
| `src/app/app/u/[unitSlug]/hotel/reservations/page.tsx` | แก้ | แถบ «สลิปรอตรวจ N» จาก `slipQueue` (domain HOTEL) + อนุมัติ/ปฏิเสธผ่าน `decideSlip` (ไม่สร้างคิวใหม่) |
| `src/lib/i18n/dict.ts` | เพิ่ม | คีย์ `hotel.web.*` 91 คู่ th/en |
| `src/lib/core/settings/defs/rooms.ts` | เพิ่มคีย์อย่างเดียว | `rooms.hotel.storefront.{enabled, maxRooms, selfCancel, badgeTh, badgeEn, customDomainUnitId, heroImages, description.th, description.en, reminderHour}` (unitTypes HOTEL · group hotel) |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/platform/minute-jobs.ts` | เพิ่ม | สาขา HOTEL ของ `payment.slip.approved` (bothMain) · อีเมลต่อ hotel.booking.created/confirmed/cancelled/hold_expired (compose) · consumer hotel.web.* 5 · ป้ายไทย 5 · `hotel-guest-reminder` |
| `scripts/svc-qc-hotel-web-scene.mts` · `docs/sds/modules/hotel.md` §storefront | ใหม่/เพิ่ม | ฉาก §6 · เอกสาร |

ไม่แตะ: prisma/** · pos/** · coupon/** · domain/** · email.ts · proxy.ts · payment/** · spam-guard · rates/pricing/availability.ts · service.ts · svc-qc-data · oracle

## 3. ผลข้อสอบ (รันโดย builder @c7c2e41d0 — ผู้คุมรันซ้ำ · log `/root/svc-runs/h8/builder/final*.log`)
| ชุด | ผล |
|---|---|
| qc-svc-h.8 --no-regression | 68/84 · failed [SR-10 (MINOR), PY-4, Q-1, Q-4] = ข้อแย้ง §7 ทั้งหมด · skipped [F-1 (commit แล้ว), V-1 (ไม่มี QC_BASE), G-1..10] |
| qc-svc-h.3 --no-regression | 98/109 · failed [] |
| qc-svc-h.5 --no-regression | 77/95 · failed [] |
| qc-svc-h.2 --no-regression | 78/87 · failed [] |
| qc-hotel-public | 15/15 (findings []) |
| qc-svc-b.8 --no-regression | 81/94 · failed [] (สาขา HOTEL ของ payment.slip.approved ไม่กระทบนัด/หอ) |
| qc-svc-b.0 | 167/172 · failed [] |
| tsc (เฉพาะไฟล์ของใบ 31 ไฟล์ · tsconfig นอกทรี) | 0 error (positive control ผ่าน) |
| pre-commit fitness | ผ่านทุก commit (ไม่ใช้ --no-verify) |
- ไม่ได้รัน: build/next · tsc ทั้งโปรเจกต์ · smoke · h.1/r0.8/b.7 · ภาพ (ผู้คุม)

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | check ids |
|---|---|---|
| X1 ข้ามร้าน/หน่วย | ใช้ | SR-5 · ST-5 · PY-4 (payload ร้าน B) · token ร้านอื่น = คำตอบเดียวกับ token มั่ว |
| X3 ยิงพร้อมกัน | ใช้ | HD-8 (double submit = 1 แถว · ล็อก webIdem ใน guard tx) · X-1 (20 ทางห้องสุดท้าย = 1) · PY-4 |
| X4 ส่งซ้ำ | ใช้ | PY-4 (consumer ซ้ำ/พร้อมกัน = ใบรับ 1 · สลิปที่ลงเงินแล้วข้าม) · PY-7 (ส่งซ้ำหลังคืนอัตโนมัติไม่สร้างใบรับ/ใบคืนเบิ้ล) · NT-4 |
| X5 งานตามเวลา | ใช้ | NT-5 (run ซ้ำ = 0 · จองสิทธิ์ส่งคำสั่ง SQL เดียว) |
| X6 ไฟล์ | ใช้ | PY-2 (> 5 MB · gif · ไบต์ไม่ใช่รูป · ว่าง) — ตรวจที่ slip-verify |
| X7 สาธารณะ | ใช้ | SR-7 · HD-12 · PY-2 · ST-9 · X-4 · ST-3/ST-4 (lookup คำตอบเดียว · เวลาเท่ากัน) · X-2 · HD-9 honeypot/ตั๋ว |
| X8 PDPA | ใช้ | HD-1 · HD-12 · PY-1 · PY-3 · ST-3 · ST-6 · X-3 (event/audit/ถัง rate ไม่มี PII) |
| X9 | N-A | ไม่มีการกระทำอันตรายของพนักงานใหม่ (ตัดสินสลิปใช้ decideSlip เดิม: เหตุผลบังคับ + audit) |
| X10 | ใช้ | ST-1 (DTO ไม่มีโทเคน/เบอร์ · อีเมล mask) · PY-1 (ผลสลิปไม่มี URL/path) · ไฟล์สลิป private ผ่าน slip-verify |

## 7. ข้อแย้ง oracle (ผู้คุมตัดสิน)
1. **PY-4 "decideSlip ซ้ำ ⇒ INVALID_STATE"** — ข้อสอบบรรทัด 1053–1054 ส่ง `transRef` ใหม่ (`H8${uid()}`) ให้สลิปที่อนุมัติไปแล้ว (มี transRef ของรอบแรก) ⇒ `payment/slip-verify.ts` decideSlip ตรวจ "เลขอ้างอิงที่กรอกไม่ตรงกับเลขในสลิป" (fix 4/5 · บรรทัด 666) **ก่อน** ตรวจสถานะ (บรรทัด 670) ⇒ ได้ `VALIDATION` ไม่ใช่ `INVALID_STATE` — พฤติกรรมของชิ้นกลาง R0.6 (ใบนี้ห้ามแตะ payment/**) · ส่วนอื่นของ PY-4 (ใบรับ 1 · depositSaleId เดิม · payload ปลอมไม่ทำอะไร) ผ่าน · เสนอ ORACLE-EDIT: รับ `/INVALID_STATE|VALIDATION/` หรือส่ง transRef เดิม/ไม่ส่ง
2. **Q-1 "override ทุกแถว = 169,000"** ขัดกับ **Q-2 "BREAKFAST 398,000 · NONREF 286,200"** — เครื่องคิดราคา H.1 ใช้ override ต่อแผน (แผนตรงก่อน · null = ทุกแผน) ไม่ได้ "ต่อยอด" อาหารเช้า/ส่วนลดจาก override ⇒ ถ้ามีแต่ override 169,000 คืนเสาร์ของ BREAKFAST/NONREF = 169,000 (รวม 358,000/303,100 ≠ ฟิกซ์เจอร์) · ฉากจึงตั้ง override ต่อแผน STANDARD 169,000 · BREAKFAST 209,000 · NONREF 152,100 (reason มี mark h8) ⇒ Q-2 ผ่าน · Q-1 ข้อ `ov.every(price === 169000)` แดง (ข้อสอบบรรทัด 1685) · เสนอ ORACLE-EDIT: ตรวจเฉพาะแถว mark h8 ต่อแผน `{STANDARD:169000, BREAKFAST:169000+20000×2, NONREF:floor90(169000)}`
3. **Q-4 "override ฉากหาย ⇒ 0 แถว"** — ข้อสอบนับ override ดีลักซ์ "ทุกแถว" ของวันเสาร์ฉาก (บรรทัด 1658 · 1717) · สัปดาห์นี้วันเสาร์ฉาก (2026-11-14) = วันแก้มือของฉาก h.1 (วันที่ 14 ของเดือน · reason "งานวิ่งในเมือง" · ratePlanId null) ⇒ หลัง `--clear` ยังเหลือแถวของ h.1 1 แถว (ได้ [0,0,1]) · `--clear` ลบเฉพาะของฉาก h.8 ถูกต้องตามใบ · เสนอ ORACLE-EDIT: นับเฉพาะแถว reason มี mark h8 (Q-1 `overrideRows` ก็ควรกรองแบบเดียวกัน)
4. **SR-10 (MINOR) SQL ≤ 6** — ทำได้ 11 คำสั่ง (หน่วย+ประเภท+กฎยกเลิก+ห้องว่าง 1 · ค่าตั้ง 2 · loadPricingContext 8 ของ H.1 ที่ห้ามแตะ) · < 400 ms ผ่าน (~45 ms) · ธง lowStock ผ่าน — ≤ 6 ต้องแก้ rates.ts (ต้องห้าม) · §10.6 ระบุเป็นเป้าหมาย MINOR

## 7.1 มติทางเทคนิคของ builder (ต่างจากใบ — ผู้คุมตรวจ)
- **cancel by GUEST**: booking.ts ห้ามลบบรรทัด ⇒ แก้ลายเซ็น `cancelBooking` ไม่ได้ ⇒ เพิ่ม `cancelBookingAsGuest(ctx, input)` ที่เรียก `cancelBooking(null, …)` ใต้ AsyncLocalStorage `{by:"GUEST"}` (ด่าน gate เปิด actor null เฉพาะ need `hotel.reservation.cancel` + store GUEST · audit ใส่ `by: "GUEST"`) · event payload เดิม (§10.11)
- **double submit**: ไม่มีคอลัมน์ idempotency ⇒ hash(unitId:key) เก็บ `policySnapshot.webIdem` · ใน guard tx (หลังล็อกประเภท) ล็อก advisory ต่อกุญแจแล้วหาใบเดิม ⇒ `DUPLICATE_REQUEST` (รหัสใหม่ต่อท้าย union) ⇒ hotel-web คืนใบเดิม
- **ค้นหา ≤ 14 คิวรี**: ใช้ `buildAvailability` (สูตรเดียวกับ hotelAvailability/availabilityInTx) กับข้อมูลห้อง/BLOCK-LEASE/คืนที่นับที่ดึงในคิวรีเดียวกับหน่วย — `hotelAvailability.get` ใช้ 4 คิวรี (occupancyRange include room = 2) ทำให้เกิน
- **สลิปซ้ำ**: replay ด้วยกุญแจเดิมคืนสลิปเดิมก่อนเรียก submitSlip (ไฟล์ใหม่ไม่ถูกเทียบ) · consumer ข้ามสลิปที่มีแถวรับเงิน `slip:<id>` แล้ว (กันใบรับ/ใบคืนเบิ้ลเมื่อ event ส่งซ้ำหลังคืนอัตโนมัติ — PY-7 เดิมได้ deposit_after_expiry 2)
- **งานเตือน**: ลงทะเบียน `cadence: "hourly"` · everyMinutes 60 (ไม่ใช่ daily ตาม §10.5) — ตัวรัน daily รัน 03:40 ไทย จะไม่ถึง reminderHour 10:00 · ส่งเมื่อชั่วโมงไทย ≥ reminderHour ของสาขา · จองสิทธิ์ส่งด้วยถัง `hw:mail:reminder:<id>` (limit 1 · 3 วัน)
- **ค่าตั้งใหม่อยู่ group hotel** แต่การ์ด «หน้าจอง» ของหน้าตั้งค่าโรงแรม (`src/components/hotel/hotel-settings-shared.ts` · นอกไฟล์ใบ) ยังมีแค่ customDomain ⇒ ร้านยังแก้ค่าใหม่จากหน้าตั้งค่าไม่ได้ (หนี้)
- **SCENE_SUMMARY**: มีการเปลี่ยน ⇒ `{created,updated,removed,checkIn,checkOut,holdToken,confirmedToken,qs}` · ไม่เปลี่ยน ⇒ `{0,0,0}` เป๊ะ (Q-3) · token+qs อยู่บรรทัด `SCENE_IDS` ทุกรอบ (chain อ่านได้เสมอ)
- **x-shark-host**: ไม่ได้ทดสอบว่า header จาก proxy ถึงหน้า — หน้าอ่าน `host` ตรง (§9.5)

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ส่วนลดคูปองหักตอน settle (createSale couponSystemId/couponCode) | H.5 checkout ยังไม่ส่ง · v1 จด snapshot + แสดง "หักตอนเช็กเอาต์" | H.5b |
| Turnstile / captcha | ไม่มีคีย์ (Q-H8-1) · v1 = rate limit + honeypot + ตั๋วเริ่มฟอร์ม | เมื่อเจ้าของให้คีย์ |
| โดเมนร้าน `/` → หน้าโรงแรม (`storefront.customDomainUnitId`) | ต้องแตะ proxy/หน้า root (นอกใบ) · v1 = กันโดเมนร้านอื่นเปิดหน้าโรงแรม | ใบโดเมน |
| การ์ดตั้งค่า «หน้าจอง» ยังไม่มีคีย์ storefront.* ใหม่ | ไฟล์ hotel-settings-shared.ts นอกใบ | H.x ตั้งค่า |
| Beam/QR ไดนามิก (PaymentIntent) | v1 = QR สถิต + สลิปกลาง (§9.3) | C.1 / ใบเกตเวย์ |
| ข้อความ LINE จริงถึงแขก · ฝากชื่อรอห้อง · self-reschedule · prefill สมาชิก · รีวิว/gallery | นอกขอบเขต v1 | H2/C.2 · ใบหลัง |

## 9. คืนสภาพ qc-svc
- ข้อสอบ h.8 ลบร้าน `svc-h8-*` + ถัง rate ใน finally (Z-1 ผ่าน) · ฉาก h8 ค้างบน svcqc ได้ (ภาพใช้) — `--clear` ลบเฉพาะของฉาก

## รอบ 2 (ผู้ตรวจ 1)
ทรี `/root/projects/shark-svc-l6` · branch `wip/svc-h8-r2` · ฐาน QC ep-late-union · probe `scripts/probe-h8-review-a.mts` = regression ถาวร

### ผลต่อมติผู้คุม
| ข้อ | ทำอะไร | ไฟล์ |
|---|---|---|
| A-5 token | `createBooking` ตั้ง `publicToken = randomBytes(18).toString("base64url")` (24 ตัว · 144 บิต) ทุกการจองใหม่ทุก source · กลุ่มคนละ token · prisma default คงเดิม · เพิ่มบรรทัดอย่างเดียว (import ใหม่ 1 + field 1) | booking.ts |
| A-6 ก | โหมดที่ไม่ใช่ AUTO_CONFIRM ต้องมีอีเมล (EMAIL_RE) หรือเบอร์ (9–15 หลัก) ⇒ ไม่มี = `CONTACT_REQUIRED` | hotel-web.ts |
| A-6 ข | ห้อง HOLD ที่ยังไม่จ่าย/ยังไม่หมดอายุต่อ client ≤ `storefront.maxRooms` (ค่าเริ่ม 5) · client = IP (IPv6 รวม /64 · IPv4-mapped ไม่รวม) · นับจากแถวเครื่องหมาย `hw:hk:<หน่วย12>:<client32>:<reservationId>` ใน ChatRateBucket (จดหลัง HOLD สำเร็จ · กวาดตามรอบถัง 24 ชม.) ⇒ `TOO_MANY_HOLDS` | hotel-web.ts · storefront.ts (`webHoldMark`) |
| A-6 ค | ห้อง HOLD เว็บ/LINE ที่ยังไม่จ่ายต่อประเภทต่อคืน + ห้องที่ขอ ≤ `max(1, ceil(ห้องขายได้ × 50%))` (`HOTEL_WEB_HOLD_CAP`) · คืนที่ห้องไม่พออยู่แล้ว ⇒ ข้ามเพดาน ให้ createBooking ตอบ AVAILABILITY_CHANGED + dates เหมือนเดิม (X-1 แข่งห้องสุดท้ายยังได้รหัสเดิม) · ห้องว่าง/ห้องที่ถือ/ของ client นับใน **คำสั่ง SQL เดียว** (webSearchBundle + guard) | hotel-web.ts · storefront.ts |
| A-14 | `canCancel` + `publicCancel` เฉพาะ source WEB/LINE · DTO เพิ่ม `cancelVia: SELF/CHANNEL/HOTEL` · หน้าสถานะ OTA = «ยกเลิก/แก้ไขที่ช่องทางที่จอง» ไม่มีปุ่ม · อื่น = «ติดต่อโรงแรม» · `notifyGuest` OTA ⇒ `OTA_SOURCE` ไม่ส่ง (ครอบทั้ง consumer/งานเตือน) · source อื่นที่ไม่ใช่เว็บ/LINE ส่งได้ + บรรทัด «ติดต่อโรงแรมเพื่อยกเลิก» | hotel-web.ts · hotel-mail.ts · r/[publicToken]/page.tsx · dict |
| A-12 | ถัง rate นับ **หลัง** resolve หน่วย · slug ไม่มีจริง/คำขอผิดรูป ⇒ ถังรวม `hw:<op>:none:<client>` ต่อ client · คีย์ของหน่วยจริงคงรูปเดิม (sha slug คู่) | hotel-web.ts |
| A-13 | สลิปรอตรวจ (PENDING/NEEDS_REVIEW) ได้ 1 ใบต่อกลุ่ม ⇒ ใบที่ 2 คืนใบเดิม `{ok, slipId, replayed, alreadyPending, reason "มีสลิปรอตรวจอยู่แล้ว"}` · ใบเดิมถูกปฏิเสธ ⇒ แนบใหม่ได้ · ตรวจไฟล์ (ชนิด/ขนาด/ลายเซ็นไบต์ แบบ slip-verify) ก่อนดูสลิปค้าง | hotel-web.ts · storefront.ts (`pendingSlip`) |
| A-15b | `hotelHostAllowed` ตัดพอร์ต (และ `[IPv6]:port`) ก่อน resolveTenantByHost (domain/** ห้ามแตะ จึงตัดที่ชั้น platform) | hotel-web.ts |
| ข้อ 7 | route สลิป: ด่านโดเมน → `publicSlipGate` (นับ rate ก่อนอ่าน body · ตั๋วใช้ครั้งเดียว WeakSet) → อ่าน body ทีละก้อนเพดาน 6 MB ตามไบต์จริง · server actions ทุกตัวผ่าน `hotelHostAllowed` (โดเมนร้านอื่น ⇒ notFound) + action สลิปใช้ด่านเดียวกัน · idempotencyKey ฝั่งไคลเอนต์ = randomUUID หรือ getRandomValues 128 บิต · ถัง view แยกต่อการจอง (`hw:view:<หน่วย>:<client>:<sha(id)16|none>`) · idempotencyKey เดิมข้อมูลต่าง (วัน/ประเภท×จำนวน/ชื่อ/อีเมล/เบอร์/แผน) ⇒ ใบเดิม + `mismatch:true` | route.ts · actions.ts · BookingForm/DepositPay · hotel-web.ts · storefront.ts |

### ตรวจเพิ่มเอง (สคริปต์ชั่วคราว ลบแล้ว ไม่ commit) 8/8
client cap (IP เดียว q5 แล้ว q1 ⇒ TOO_MANY_HOLDS) · type cap (10 ห้อง ถือ 5 ⇒ อีก IP ติด · 3+3 ติด · 3+2 ผ่าน) · IPv6 /64 รวม (อีก /64 ผ่าน) · ห้องเดี่ยวเต็ม ⇒ AVAILABILITY_CHANGED ไม่ใช่ TOO_MANY · mismatch ไม่ส่ง fingerprint/อีเมล · AUTO_CONFIRM ไม่บังคับติดต่อ · ถัง view แยกต่อการจอง + token มั่วเข้าถัง none · token ใหม่ ≥ 22 ตัวไม่ใช่ cuid

### ข้อแย้ง oracle (ผู้คุมตัดสิน)
5. **HD-10 ชนมติ A-6 ค** — ข้อสอบบรรทัด 941 + 945 สร้าง HOLD «ซูพีเรีย» (ร้านชั่วคราวมี 2 ห้อง: SUP1 SUP2 · บรรทัด 532) คืนเดียวกัน W+30→31 สองใบ (en แล้ว th) · เพดาน 50% ของ 2 ห้อง = ceil(1) = 1 ⇒ ใบที่ 2 ได้ `TOO_MANY_HOLDS` ตามมติ (ผลจริง r2f-h8.log บรรทัด 49) · ไม่ใช่บั๊ก · เสนอ ORACLE-EDIT: ใบ th ใช้คืนอื่น (เช่น W+33→34 · ไม่ชนข้ออื่นที่ใช้ซูพีเรีย W+26/28/31/46/48/56) **หรือ** ผู้คุมปรับเพดาน (`HOTEL_WEB_HOLD_CAP.minPerTypeNight` = 2 ⇒ ประเภท 1–2 ห้องไม่มีผล) — ข้อสังเกต: โรงแรมเล็ก (ประเภทละ 2 ห้อง) จะรับ HOLD เว็บได้ทีละ 1 ห้องต่อคืน แขกคนที่ 2 ต้องรอใบแรกจ่าย/หมดเวลา (≤ 15 นาที)

### หนี้รอบ 2
- เพดาน A-6 ข/ค ตรวจก่อนเข้า tx ของ createBooking (booking.ts ยกเว้นแคบ) ⇒ คำขอยิงพร้อมกันหลุดเพดานได้ ≤ เพดาน rate hold (5/10 นาที/IP) — ปิดจริงต้องย้ายเข้า tx หลัง lockTypes
- เครื่องหมาย client อายุตามรอบกวาดถัง (24 ชม.) ⇒ HOLD รออนุมัติที่ค้างเกิน 24 ชม. หลุดจากการนับต่อ client (เพดานต่อประเภทยังนับ)
- Turnstile ยังเป็นหนี้เดิม
