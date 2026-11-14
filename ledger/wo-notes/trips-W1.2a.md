# wo-notes · TRIPS W1.2a — เส้นจองทัวร์หน้าสาธารณะ (เลือก → ถือ → ผู้จอง → QR ยอดล็อก → วอเชอร์)

> ผู้สร้าง 14 พ.ย. 2569 · ทรี `shark-trips-l1` · branch `wip/trips-w1.2` @9a8934b98 (ไม่ commit) · ใบสั่ง `ledger/trips-briefs/W1.2.md` รอบ 2 + มติ R1–R17

## 1. สิ่งที่ได้ (ไฟล์)
| ไฟล์ | สิ่งที่ทำ |
|---|---|
| `src/lib/platform/trips-book-core.ts` (ใหม่) | ค่าคงที่ §3.1 · `parseBookSelection` · `selectionSeatsOk` · `cancelDeadlinesOf` · `reservationStateOf` · `bookTodoOf` · ตัวตรวจผู้จอง `bookerNameOf/PhoneOf/EmailOf` (§4.1) · ตัวทำลิงก์ `bookSelectHref/bookCheckoutHref/bookReservationHref` · `bookErrorParam` · `selectionParamsOf/selectionWithPax/selectionQuery` · ชนิด VM ทั้งหมด |
| `src/lib/platform/trips-book.ts` (ใหม่) | 8 ฟังก์ชัน §3.2 · ด่านอัตราคำสั่งเดียว (`rateBucketCte` ต่อกันแบบ chain + อ่านถัง token แบบไม่นับ) · ref/sel/nonce/basketToken/วอเชอร์ HMAC ด้วย `SESSION_SECRET` · ตารางแปลงรหัส R9 · บรรทัด VAT ฝั่งเซิร์ฟเวอร์ (R16-3) |
| `src/lib/modules/trips/public-booking.ts` (ใหม่) | ตัวอ่าน: แคตตาล็อก (ประเภทคน/เสริม/โซน + ป้ายตามภาษา) · รอบของวัน (listAvailability) · รอบ+สินค้า · ตะกร้า/ที่ถือ/การจองจาก tokenHash · การจองจาก tokenHash (+เวลาถือ ACTIVE + จำนวนชื่อ/ลายเซ็นผู้เดินทาง) — ไม่มีคำสั่งเขียน ไม่ import core/db |
| `src/lib/modules/trips/index.ts` | บล็อก `// TRIPS W1.2 ▸ … ◂` +6 บรรทัด (ตัวอ่าน 5 ตัว + ชนิด + `tripsHhmm`) |
| `src/lib/platform/trips-public.ts` | +34/−1: `cta = { enabled, reason }` ตามด่าน `bookSaleState` · ส่งออก `bookSaleState` `bookVisibleProduct` `bookMiss` `bookBrandOf` (ตัวช่วยเดิมที่เส้นจองใช้ร่วม) |
| `src/lib/platform/trips-public-core.ts` | +4/−1: ชนิด `cta: { enabled: boolean; reason: BookCtaReason }` |
| `src/app/book/[shop]/actions.ts` (ใหม่) | `startBookHoldAction` · `confirmBookHoldAction` (bind ร้าน/สินค้า/ตะกร้า/sel) |
| `src/app/book/[shop]/c/[basket]/page.tsx` · `my/[token]/page.tsx` (ใหม่) | dynamic · noindex · no-referrer · ชื่อหน้าทั่วไป · cache() 1 จุด |
| `src/app/book/[shop]/t/[productSlug]/page.tsx` | ปุ่มจองเปิด ⇒ `quoteBookSelection` + nonce + แผงเลือก/สรุป/ถือที่ |
| `src/components/book/BookSelect.tsx` · `BookCheckout.tsx` · `BookReservation.tsx` · `BookFlowParts.tsx` (ใหม่) · `BookProduct.tsx` (แก้) | จอ 01ข/ค/ง + 19 + สถานะแบบ 07 · ไม่มี client component (ทั้งเส้นใช้ได้โดยไม่มี JS) |
| `src/messages/{th,en}/book.json` | คีย์ LG-1 ครบ + `field.*` `steps.*` `todo.later` ฯลฯ (คีย์ th/en เท่ากัน) |
| `src/lib/core/settings/defs/trips.ts` | +14 (R15): X29 `trips.public.bookingEnabled` (bool · ปิดทุกแม่แบบ · U) · X30 `trips.public.shopContact` (table strict · null ทั้งหมด · U) + `TABLE_TH` ของ X30 (ป้ายไทย + nullTh — ฟอร์มตั้งค่าแสดงช่องได้ ไม่มีชื่อช่องดิบ) |
| `ledger/TRIPS-DEFAULTS.md` | 2 แถว X29 X30 |
| `scripts/seed-trips-qc.mts` | +1 บรรทัด (R17): ร้าน seed ตั้ง X29 = true ผ่าน `want()` เดิม (เทียบก่อนเขียน ⇒ รอบสองไม่เขียน) |

## 2. การตัดสินใจที่ใบสั่งเงียบ
1. **ป้ายบรรทัดราคา:** สรุปยอดใช้ `quoteTripLine` (บรรทัดมี paxTypeId/extraId/itemRef ⇒ ติดป้ายไทย/อังกฤษจากแคตตาล็อกได้) ส่วน `quoteTrips` ใช้เฉพาะ quoteId/ยอดเทียบตอนถือ/หน้ายืนยัน — ยอดของสองตัวเป็นค่าเดียวกัน (priceOf ตัวเดียว) · หน้ายืนยันจึงคิดราคา 2 ครั้ง (ต้นทุน) · `holdMinutes` อ่าน `trips.sell.holdMinutes` ชั้นเดียวกับ quoteTrips
2. **ราคาต่อหน่วยในตัวเลือก:** แบบ W1.1 X3 (คนเดียวต่อใบเสนอ · ทารกคู่ผู้ใหญ่ · เสริมคู่ผู้ใหญ่ 1 คน) · ร้าน VAT บวกเพิ่ม ⇒ amount+vat ของบรรทัดจำนวน 1 (X12)
3. **รายการเสริมที่เลือกได้** = ของสินค้า · ไม่บังคับ · active (แบบ W1.1) · รายการแบบ PER_PAX ของบริการคิดตามจำนวนคนเสมอ ⇒ จอเป็นช่องติ๊ก (ค่า 1)
4. **โซน `kind` null / `active` null** (โซนรุ่นเก่า A1.1) ⇒ ถือเป็น ZONE ที่เปิด
5. **ตัวเลือกรอบ:** `t` ตรง ⇒ รอบนั้น · ไม่งั้นรอบแรกที่ขายได้ · ไม่มีเลย ⇒ รอบแรก (ให้ saleBlock/บริการตัดสิน) · saleBlock CUTOFF/STARTED ⇒ CUTOFF_PASSED · อื่น ⇒ SLOT_CLOSED ก่อนกินโควตาถือ
6. **DONE ก่อนด่านฟอร์ม:** ตะกร้า CHECKED_OUT ⇒ DONE{token} ทันทีหลังตรวจลายเซ็น (ทั้งหน้ายืนยันและยืนยัน) — ส่งซ้ำ/ย้อนกลับไม่ถึงบริการ
7. **HOLD_EXPIRED ก่อนด่านฟอร์ม:** ที่ถือหมดตามนาฬิกา ⇒ HOLD_EXPIRED (+ rehold) โดยไม่ตรวจช่องกรอก
8. **seen ≠ sel.t** ⇒ PRICE_CHANGED{heldTotalSatang = totalSatang = sel.t} (ไม่เรียกบริการจึงไม่มียอดใหม่) — หน้ายืนยันโหลดใหม่จะเทียบราคาจริง
9. **ผลไม่สำเร็จมีช่องเสริม** `shopSlug` (ทุกรหัสหลัง resolve ร้าน ยกเว้น NOT_FOUND ที่ต้องเป็นรูปเดียว) + `back` (ถือ: หน้าสินค้าพร้อมการเลือกที่ตรวจแล้ว) + `rehold` (HOLD_EXPIRED/PRICE_CHANGED) — action redirect จากค่าของ platform เท่านั้น
10. **VM เพิ่ม `brand`** (ตราสินค้าแบบหน้าสินค้า) ในหน้ายืนยัน/หน้าการจอง เพื่อเปลือกหน้าเหมือนหน้าเดิม — ไม่มี id ภายใน
11. **ภาษาไม่ถูกพาข้าม action redirect** (R11: query มีแค่ sel/e/f) ⇒ หน้ายืนยัน/หน้าการจองใช้ Accept-Language (มีปุ่มสลับภาษาในหน้า) — หนี้ด้านล่าง
12. **pay สถานะอื่นของ intent:** HOLD_EXPIRED (แข่งกับเวลา) ⇒ state EXPIRED · NOTHING_DUE ⇒ pay null · อื่น ⇒ BUSY
13. **todo.people** = Σ SEAT ทุกประเภทใน snapshot (รวมทารก) · named = ผู้เดินทางที่ชื่อไม่ว่าง · WAIVER ตาม `trips.waiver.requiredFor` (ALL / SCUBA_ONLY+deepDive)
14. **notFound() ใน action** เมื่อไม่มี shopSlug (ไม่พบ / ไม่มีกุญแจเครื่อง) — ไม่มีปลายทางที่ปลอดภัยให้ redirect
15. **`@prisma/client` (Prisma.sql/join) ใน trips-book.ts** — จำเป็นต่อการต่อ CTE ของ `rateBucketCte` ในคำสั่งเดียว (แบบ trips-public.ts) · ไม่ใช้ prisma client นอกคำสั่งด่าน

## 3. ข้อสังเกตความปลอดภัย
- id ภายในไม่ออก: ref = base32(HMAC(SESSION_SECRET, ร้าน+ชนิด+id))[:12] · sel = JSON ref/ค่าสาธารณะ + MAC 22 ตัวผูก ร้าน·หน่วย·sha256(token ตะกร้า) · token ตะกร้า = HMAC(ร้าน+nonce) (nonce เดิม ⇒ ตะกร้าเดิม)
- ไม่มีกุญแจ ⇒ ปิด (nonce null ⇒ ไม่มีปุ่ม · ฟังก์ชันคืน UNAVAILABLE)
- ฟอร์มผิด/ด่านล่ม/ด่านเกิน ⇒ ไม่ถึงบริการ (ไม่มีที่ถือ/การจอง/Party ใหม่ — C-2 C-9 C-15 RL-2 เขียว)
- ไม่ log อะไรเลยในไฟล์ใหม่ · คีย์ถัง: `trips:{book,confirm,hold,token}:<tenant>:<ck>` `trips:slot:<tenant>:<departure>:<ck>`
- ไม่สะท้อนค่า: ข้อความผิดพลาดมาจากรหัสในรายการ · `e`/`f` ของหน้าผ่าน allowlist · `back.query` มีเฉพาะค่าที่ตรวจรูปแล้ว
- ไม่มี object จากผู้ใช้เข้า `update({data})` (ไม่มีคำสั่งเขียนนอก holdTrips/confirmTrips/คำสั่งด่าน)
- ⚠️ ผู้คุมดูด้วยตา: POST action ข้ามโดเมน (Origin) · `Cache-Control` ของ c/ my/ · ย้อนกลับหลังยืนยัน (คาด: DONE ⇒ หน้าการจองเดิม)

## 4. หนี้ส่งต่อ
- **W1.2b:** สลิป/ตรวจอัตโนมัติ · AWAIT_SHOP + SHOP_CONFIRMS สาธารณะ · เก็บชื่อที่ผู้จองพิมพ์ (R11 — **C-12 แสดงผลจริง: ชื่อ+อีเมลเดิมทำให้ได้ Party เดิมพร้อมเบอร์เดิม**) · ช่องเก็บการยอมรับ (`acceptedTermsAt/termsVersion`) · **พาภาษาข้าม redirect ของ action** (เช่น `l` ใน sel หรือคุกกี้ — ต้องมีมติ) · ป้ายภาษาอังกฤษของบรรทัด SEAT ในบริการราคา (ตอนนี้ติดป้ายในแพลตฟอร์มจากแคตตาล็อก)
- **W1.3:** ลิงก์ในรายการต้องทำ (`/form/[token]`) · เลื่อน/ยกเลิก/OTP บน my/
- **T0.4c:** `confirmTrips` สาธารณะไม่ตรวจสถานะรอบ/ปิดรับ (แพลตฟอร์มตรวจ `getAvailability` ก่อนเรียก · มีช่อง TOCTOU สั้น) · เพดานที่ถือไม่จ่ายต่อรอบ
- quote มีช่อง VAT ต่อบรรทัด/รวม VAT (ตอนนี้ VAT = payable − Σ ที่แพลตฟอร์ม) · หน้ายืนยันคิดราคา 2 ครั้ง (quoteTrips + quoteTripLine) — บริการควรคืน id ต่อบรรทัดใน Quote
- seed: ร้าน `andaman-dive` ยังไม่มีผู้รับเงินพร้อมเพย์ (ฟิกซ์เจอร์ไม่มี) ⇒ ฉาก `book-pay` จะเห็น "ร้านยังไม่ได้ตั้งบัญชีรับเงิน" — ผู้คุมต้องตัดสิน (เพิ่ม PaymentProfile ทดสอบในฟิกซ์เจอร์)
- token การจองเพิกถอนไม่ได้ (SESSION_SECRET) · ถังเดา token อ่านกับ +1 คนละคำสั่ง (รับในมติ)

## 5. ข้อแย้งต่อข้อสอบ (ปล่อยแดง)
- **S-10** · คาด: ไม่แตะ `scripts/seed-trips-qc.mts` · เหตุที่ผิด: มติ R17 ให้ผู้สร้างเพิ่มบรรทัดตั้ง X29 ใน seed เอง แต่ FORBIDDEN_PATHS ของข้อสอบยังมี seed · ควรแก้: เพิ่ม `:(exclude)scripts/seed-trips-qc.mts` หรือ LIMITED `[seed, 0, 2]`
- **C-12** · คาด: Party.phone ของการจองเบอร์ท้องถิ่น = `+66…` ของเบอร์ใหม่ · เหตุที่ผิด: ตัวช่วย `confirm()` ส่ง `name = BOOKER.name` + `email = BOOKER.email` เดิม ⇒ `party.findOrCreate` ขั้น (3) จับคู่ ชื่อ+อีเมล ได้ Party ของ C-3 (เบอร์ของ BOOKER) — แพลตฟอร์มส่ง `+66…` ของเบอร์ใหม่ถูกต้องแล้ว (ส่วน "ผู้จองคนเดียวกัน" เขียว) · ควรแก้: C-12 ส่ง `email: ""` และชื่อใหม่ (`name: \`C12 ${STAMP}\``)

## 6. ผลรันจริง (14 พ.ย. · ทรี l1 · ผ่านตัวห่อ iso/qc-trips/gate-lock)
- seed ×2: รอบแรกเขียน `tripSettingsT11` 1 (X29) · รอบสอง `updated {}` (ไม่เขียน)
- qc-trips-w1.2: **77/79** — แดง S-10 · C-12 (ข้อแย้ง §5)
- qc-trips-w1.1: 79/84 — แดงเพราะใบนี้ตามคาด: S-4 (app/book import trips-book) · S-5 ('use server' ใน app/book) · S-12 (ขอบเขต: ไฟล์ใหม่ของ W1.2 + defs + seed) · SD-5 (`cta` = `{enabled, reason}`) · XR-15 (จอใช้ชื่อช่อง `amountSatang` ตามสัญญา W1.2 §3.2 — ข้อของ W1.1 ห้ามคำนี้ในจอทั้งหมด ⇒ ต้อง ORACLE-EDIT ให้ยกเว้นชื่อช่องของ VM W1.2)
- qc-trips-t0.6 125/126 · t0.4 109/110 · t0.7 149/150 — แดงข้อเดียวกันทุกชุด: ขอบเขตแตะ `core/settings/defs/trips.ts` (เพิ่ม X29 X30 ตามมติ R15)
- qc-trips-t0.1 94/96 — R-1 R-2 (คีย์ใหม่ X29 X30 · ORACLE-EDIT §0)
- fitness 54/54 (มี DB) · 54/54 (`env -u DATABASE_URL`) · CRITICAL 0
- typecheck: 0 error

## 7. รอบแก้ r1 (14 พ.ย. · ทรี l1 @6c3bf129a→eedb52eb8 · ไม่ commit) — มติ W1–W7
| มติ | สิ่งที่แก้ |
|---|---|
| W1 | `BOOK_HOLD_USABLE_SEC = BOOK_PAY_MARGIN_SEC + 120` (core) · `holdUntilOf` (trips-book) ถือว่าหมดเมื่อเหลือ < 300 วิ ⇒ `loadBookCheckout`/`confirmBookHold` ตอบ HOLD_EXPIRED + rehold ก่อนตรวจฟอร์ม/เรียกบริการ |
| W2 | `BOOK_SLOT_HOLD_PER_HOUR` 2→3 · `startBookHold` หาตะกร้าของ nonce ก่อน (`findBookBasket`) — มีแล้ว ⇒ ข้ามถังถือ+ถังต่อรอบ วิ่งเส้นผลซ้ำของ `holdTrips` · **ปล่อยที่ถือเดิมทำได้**: `releaseHold` ของ capacity-service รับผู้กระทำ PUBLIC ด้วย capKey `basket:<sha256(token ตะกร้า)>` (สิทธิ์เดียวกับตอนถือ) ⇒ `releaseBookHold` ใหม่ + `reholdBookAction` + ปุ่ม "ถือใหม่" เป็นฟอร์ม POST บนหน้า c/ (ไม่แตะบริการ) · ข้อความถือถี่เกิน `select.holdLimited` (ลองใหม่ภายหลัง + ทางติดต่อร้านจาก `quote.shop`) |
| W3 | C-12 คงแดง (ไม่แตะ) |
| W4 | ตัด `summary.noFeesLater` · `summary.vat` ไม่มีอัตรา · `checkout.receiptNote` · `checkout.privacy` ระยะเก็บ "ตามระยะที่ร้านกำหนดภายใต้กฎหมาย" · `res.pay.payBy` มี {date} {time} (VM เพิ่ม `payByDate` · `payByLocal` คง HH:MM) · `BOOK_TERMS_VERSION` → `2026-11-14.2` (ข้อความเงื่อนไขเปลี่ยน) |
| W5 | (ก) PRICE_CHANGED ยอดเท่า ⇒ `priceChanged.termsTitle/termsBody/reholdTerms` (BookCheckoutStop) (ข) `bookRedirectOk` (core) ตรวจ slug/token ตะกร้า/sel/token การจองก่อนทุก redirect ใน actions.ts (ค) nonce `v2:<hold|confirm>:<tenant>` — หน้าสินค้าได้ nonce จาก `quoteBookSelection.nonce` · หน้ายืนยันออกโดเมน confirm (ง) `+660…` ⇒ ตัด 0 (จ) `pay.unavailable` NOTHING_DUE + การจอง PENDING ⇒ `UNAVAILABLE reason PENDING` → หน้า `book-res-pending` `res.pending` (ฉ) ผล ok/ไม่ ok ของถือ/ยืนยัน/ถือใหม่มี `lang` ที่ตรวจแล้ว ⇒ action ส่งต่อใน href (ช) `BOOK_FORM_MIN_SEC` 1 (ซ) ตัวอ้างรอบ `t` = `bookPublicRef(..,"slot", departureId)` 12 ตัว a-z2-7 (`trips-public.ts`) · หน้าสินค้าจับคู่รอบกับ id ผ่าน `loadBookDay` ทีละตำแหน่ง + ตรวจเวลาออก/ช่วงเวลา (ไม่ตรง ⇒ เลือกด้วยลิงก์ไม่ได้ทั้งวัน) — ไม่แตะ public-catalog.ts (ฌ) `collectMode ≠ SHOP` ⇒ `pay.unavailable AGENT_COLLECTS` ไม่เรียก intent (public-booking คืน `collectMode`) (ญ) ความเห็น actions.ts (อาร์กิวเมนต์ bind ไม่ได้เข้ารหัส — มาจาก URL แก้ได้) |
| W6 | `TRIPS_SEED_PAYMENT_PROFILE` (fixture) + seed สร้าง PaymentProfile ของร้าน seed เมื่อไม่มี/ไม่มีเลขผู้รับ (มีแล้วไม่แตะ) |
| W7 | `startBookHold`: ฟอร์มส่ง `t` (ไม่ว่าง) แต่ไม่ตรงรอบใดของวัน/วันไม่มีรอบ ⇒ `SLOT_CLOSED` กลับหน้าสินค้า (รวม `t` รูปเดิม HHMM จากหน้าที่เปิดค้าง) · ตรงแต่ขายไม่ได้ ⇒ blockCode เดิม (CUTOFF_PASSED/SLOT_CLOSED) · ทางสำรองรอบแรกเหลือเฉพาะ GET |

### จุดที่ตัดสินเอง (r1)
1. **nonce รุ่น 1 (ไม่มี scope) ยังรับทั้งสองฟอร์ม** — หน้าสาธารณะไม่ออกรูปนี้แล้ว (ออกได้เฉพาะโค้ดเซิร์ฟเวอร์ที่เรียก `issueBookFormNonce()` ตรง ๆ = ข้อสอบ `nonceAt`) · ปิดทันทีที่ข้อสอบส่ง scope (ลบ `|| signed(null)` ใน `checkNonce` บรรทัดเดียว) — ถ้าปิดตอนนี้ ข้อสอบแดงเกือบทั้งชุด H/C/R/X
2. ปล่อยที่ถือเฉพาะเมื่อลูกค้ากด "ถือใหม่" (ไม่ปล่อยตอนเปิดหน้ายืนยันที่ราคาเปลี่ยน — C-8 ตรึง "ที่ถือเดิมไม่หาย") · บริการตอบอื่นนอก HOLD_EXPIRED/HOLD_NOT_FOUND ⇒ BUSY ไม่พาไปถือซ้อน
3. W2 ข้ามทั้งถังถือ (X8) และถังต่อรอบเมื่อ nonce มีตะกร้าแล้ว (ส่งซ้ำไม่เพิ่มที่ถือ)
4. PENDING ใช้ `UNAVAILABLE reason "PENDING"` (เพิ่มจาก BOOKING_OFF/SHOP_CONFIRMS) — ไม่เพิ่มสถานะใน BOOK_RES_STATES (R8 · P-5)
5. หน้าสินค้าคิวรีที่ว่างของวันที่เลือกเพิ่ม 1 ครั้ง (loadBookDay) เพื่อหา id รอบ — ต้นทุน (หนี้ด้านล่าง)

### หนี้ใหม่ (r1)
- ตัวอ้างรอบควรมาจาก public-catalog เอง (closure แบบ `priceOf`) แทนการจับคู่ตำแหน่งกับ `loadBookDay` — ใบนี้ห้ามแตะ public-catalog.ts
- ปิดการรับ nonce รุ่น 1 หลังผู้เขียนข้อสอบปรับ `nonceAt`
- ข้อความ `err.RATE_LIMITED` ทั่วไปยัง "รอสักครู่" (ใช้กับหน้ายืนยัน) — W2 แก้เฉพาะของการถือ
- typecheck: ไฟล์ `scratchpad/w1.2-hunt/*.4da.ts` (สำเนาของนักล่า) ทำให้ `pnpm typecheck` แดง 14 จุด — ไม่ใช่โค้ดของใบ

### ข้อแย้งต่อข้อสอบ (r1 · ปล่อยแดง)
- w1.2 **P-1** คาด `BOOK_SLOT_HOLD_PER_HOUR` 2 · มติ W2 เปลี่ยนเป็น 3 ⇒ แก้ค่าคาดเป็น 3
- w1.2 **RL-4** คาดถือรอบเดียว 3 ครั้ง ⇒ ok ok LIMIT · W2 ⇒ ควรเป็น 4 ครั้ง ⇒ ok ok ok LIMIT (ที่ถือเพิ่ม 3 ครั้ง) + ส่งซ้ำ nonce เดิมไม่นับ
- w1.2 **LG-1** คาดคีย์ `summary.noFeesLater` · W4 ตัด ⇒ ลบออกจากรายการคีย์ + เพิ่มคีย์ใหม่ r1 ถ้าต้องการตรึง
- w1.2 **S-10** แตะ seed/fixture ตาม W6 (ORACLE-EDIT ผู้คุม)
- w1.2 **C-12** คงแดงตาม W3
- w1.1 **IS-5 XR-6 XR-7 XR-9** ตรึงตัวอ้างรอบรูป HHMM (`0700` `1300` `0700-2`) · W5 เปลี่ยนเป็น ref 12 ตัว ⇒ ตรวจรูป `/^[a-z2-7]{12}$/` + ตัวอ้างต่างกันต่อรอบ + `?t=<ref>` เลือกรอบนั้น แทนค่าตายตัว · ส่วนอื่นของข้อ (ที่ว่าง/ราคา/สถานะ) ผ่าน
- w1.2 ข้อสอบใหม่ที่ควรเพิ่ม: `nonceAt` ส่ง scope · W7 (ลบรอบหลังเปิดหน้า ⇒ SLOT_CLOSED ไม่มีที่ถือ)
