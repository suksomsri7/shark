# WO H.10 — โครงช่องทาง OTA (channel manager): แม็ป · ARI ขาออก · ขาเข้า idempotent · คิวต้องจัดห้อง · ตัวต่อ FAKE (RUN SVC)

> RUN "SVC" (โรงแรม V2) · worktree `/root/projects/shark-svc-l4` · branch `wip/svc-h10` (ฐาน 4e8aadc36) → merge เข้า `session/svc` · 7 พ.ย. 2569 · ผู้คุม: Fable/Opus · builder: Opus
> สัญญา: ใบสั่ง `ledger/svc-briefs/svc-brief-h.10.md` (§9 · §10 ชนะ §0–§8) · ภาพ `ledger/design-dorm/11-integrations.png` (การ์ด OTA)
> ข้อสอบใบ: `scripts/qc-svc-h.10.mts` (89 ข้อ · **ไม่แก้** — มีข้อแย้ง 2 ข้อ ดู §7)
> ระดับตรวจ: ☑ **เข้ม** (กันจองซ้อน · เงิน prepaid · ข้ามร้าน) — ผู้ตรวจ 2 รอบ
> ฐาน: qc-svc (`ep-mute-scene`) ผ่าน `scripts/qc-svc.sh` + `with-gate-lock.sh`

## 1. ไฟล์ที่แตะ
| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `src/lib/modules/hotel/channel/types.ts` | ใหม่ (pure) | ชนิด adapter (AriPayload · InboundReservation · ChannelMapping · ChannelCallOpts) · markupPrice · ariHash (stableJson + cyrb53×2) · รหัสเหตุผล inbox |
| `src/lib/modules/hotel/channel/mapping.ts` | ใหม่ | ด่าน `hotel.channel.manage` · listChannelConnections · saveRoomMap/saveRateMap/saveBuffer (audit + dirty ใน tx) · loadMappings (คิวรีเดียว) · channelMappingFor · channelDetail |
| `src/lib/modules/hotel/channel/ari.ts` | ใหม่ | emitAriDirty · onAriDirty · ariDirtyFromBooking · enqueueAri (รวมชุด) · buildAri · pushAriJobs |
| `src/lib/modules/hotel/channel/inbound.ts` | ใหม่ | ingestInbound · applyInbound · pullAll · retryInbound · rejectInbound · listNeedsRoom · listInbox · fakeEnqueueInbound |
| `src/lib/modules/hotel/channel/index.ts` | ใหม่ | facade |
| `src/lib/modules/hotel/booking.ts` | **เพิ่มอย่างเดียว** (ลบ 0 บรรทัดเทียบ 034d4de8a) | `internal.channel` (CreateBookingInternal · replaceReservationIds · onCreated) · `channelCancelRowsTx` · cancelBooking by CHANNEL (`channelCancelInput` · WeakMap) · รหัส `CHANNEL_CONFLICT` |
| `src/lib/modules/hotel/rates.ts` | hook ล้วน (9 จุด) | `emitAriDirty` ใน tx ของ saveRatePlan/archiveRatePlan/saveSeason/archiveSeason/saveHolidays/removeHoliday/saveRates/setOverride/clearOverride |
| `src/lib/modules/hotel/block.ts` | hook ล้วน (2 จุด) | blockRoom/releaseBlock |
| `src/lib/modules/hotel/index.ts` · `actions.ts` | เพิ่ม | facade (บล็อก SVC H.10) · 7 actions (`hotel.channel.manage`) |
| `src/lib/core/integrations/types.ts` | แก้เฉพาะ ChannelManagerAdapter | ชนิดจริง (import type จาก hotel/channel/types) |
| `src/lib/core/integrations/providers/fake.ts` | แก้เฉพาะ CHANNEL_MANAGER | pullReservations คืนแถวจากคิวทดสอบในหน่วยความจำ (globalThis · ต่อ connectionId) |
| `src/lib/core/integrations/registry.ts` · `index.ts` | เพิ่มอย่างเดียว | `readyFor(kind, provider)` · re-export `integrationHandleForRow` 1 บรรทัด |
| `src/lib/core/settings/defs/rooms.ts` | เพิ่มท้าย | `rooms.hotel.ota.ariHorizonDays` (days 7–400 · 365 · U · requires CHANNEL_MANAGER) |
| `src/lib/core/permissions.ts` | ลบ 1 บรรทัด | `hotel.channel.manage` ออกจาก planned |
| `src/lib/outbox-consumers.ts` · `automation/labels.ts` · `webhooks/labels.ts` | เพิ่ม | 8 event (consumer · ป้ายไทย · webhooks ผ่าน spread) · hotel.booking.* ⇒ ariDirtyFromBooking (compose ของแถม) |
| `src/lib/platform/minute-jobs.ts` | เพิ่ม | `channel-ari-push` (1 นาที) · `channel-pull` (5 นาที) |
| `src/components/hotel/channel/*` | ใหม่ | ChannelCard · RoomMapEditor · RateMapEditor · BufferEditor · AriPreview · InboxList · NeedsRoomQueue + channel-shared.ts (pure) |
| `src/app/app/u/[unitSlug]/hotel/channels/{page,[connectionId]/page,inbox/page}.tsx` | ใหม่ | จอ §4 (ด่าน HOTEL + hotel.channel.manage) |
| `src/app/app/settings/integrations/{page,IntegrationsHub}.tsx` | เพิ่มลิงก์ | การ์ด "ช่องทางขายห้อง (OTA) · <หน่วย>" → "ตั้งค่าแม็ปห้อง/ราคา →" (`/app/u/<slug>/hotel/channels`) — IntegrationsHub แก้บรรทัด destructure 1 บรรทัด (เพิ่ม prop) |
| `scripts/svc-qc-hotel-ota-scene.mts` | ใหม่ | ฉาก §6 (idempotent · --clear) |
| `docs/sds/modules/hotel.md` | เพิ่ม §OTA | ARI pipeline · inbound state machine · prepaid/PLATFORM ⇒ H.5b |
- ไม่แตะ: prisma/** · pos/** · availability.ts · pricing.ts · integrations service/health/secret-box · ข้อสอบ/ฟิกซ์เจอร์ · ไม่มี migration

## 2. ชุดโมดูลที่แตะ
- hotel (booking/rates/block) → `qc-svc-h.3` `qc-svc-h.1` `qc-svc-h.2` `qc-svc-h.5` · ศูนย์เชื่อมต่อ → `qc-svc-r0.5` · ทะเบียน event → `qc-svc-b.0`
- migration: ไม่มี (ตาราง Channel* มีจาก H.0) · seed: ไม่แตะ

## 3. ผลข้อสอบ (builder รัน — ผู้คุมรันซ้ำเอง)
| ชุด | ผล |
|---|---|
| `qc-svc-h.10 --no-regression` (88a046a4a) | `{"total":89,"passed":70,"failed":["AR-13","IN-13"],"skipped":["MN-4","F-1","V-1","V-2","G-1".."G-13"]}` · Q 4/4 · X 6/6 · U 11/11 |
| `qc-svc-h.1 --no-regression` | failed `["PC-4"]` — seed svcqc เก่า (membership frontdesk ไม่มี hotel.rates.read · "reseed") ไม่เกี่ยวใบ |
| `qc-svc-h.3 --no-regression` | failed `["PC-4","Q-1".."Q-4"]` — PC-4 seed เก่า · ฉาก h.3 ล้ม `NO_POS หน่วยนี้ยังไม่ผูกระบบขายหน้าร้าน` (seed) · A–X ทั้งหมดเขียว (รวม K-15 probe โหลด) |
| `qc-svc-h.2 --no-regression` | failed `["PC-6","Q-1".."Q-5"]` — PC-6 seed เก่า · ฉาก tape ล้มที่มัดจำ NO_POS (seed) |
| `qc-svc-h.5 --no-regression` | failed `["PC-2","Q-1".."Q-3"]` — PC-2 seed เก่า · "ฉาก h.3 ล้ม" (NO_POS) |
| `qc-svc-b.0` | failed `[]` (skip P-2..P-4 M-6 M-7 เดิม) |
| `qc-svc-r0.5` | failed `[]` |
| fitness (มี env / ไม่มี env) | 53/53 · 53/53 |
| tsc (เฉพาะไฟล์ของใบ · tsconfig ชั่วคราวนอกทรี) | 0 error |
- 🔴 แดงที่เหลือของ h.1/h.2/h.3/h.5 = **seed svcqc บนฐานเก่า** (PC-x บอก "reseed" · ฉากล้มที่ `NO_POS`) — ผู้คุม reseed แล้วรันซ้ำ · builder ไม่ reseed (ฐานร่วมกับเลนอื่น)
- 🔴 ลำดับฉาก: ฉาก h.10 ถือ `ChannelRateMap → HotelRatePlan` (FK Restrict) ⇒ **h.1 `--clear` ล้มถ้าฉาก h.10 ยังอยู่** (เจอจริงรอบแรก: h.1 Q-3 exit=1 · หลัง h.10 `--clear` เขียว) — chain ผู้คุม: h.10 `--clear` ก่อน h.1/h.3 `--clear` (builder ล้างฉาก h.10 ทิ้งแล้วหลังรันรอบสุดท้าย)

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | check ids |
|---|---|---|
| X1 ขอบเขต | ใช้ | MP-3 · MP-7 · X-1 (แม็ปชี้ประเภทหน่วยอื่น ⇒ REJECTED · ร้าน B ⇒ NOT_FOUND · ARI ร้าน B ไม่มี id ร้าน A) · PC-6 |
| X3 พร้อมกัน ≥10 | ใช้ | X-3 (ห้องสุดท้าย 10 แถว ⇒ APPLIED 1 + NEEDS_ROOM 9 · ไม่มี 40P01) · X-2 (apply แถวเดียว 5 ทาง ⇒ การจอง 1) |
| X4 ส่งซ้ำ | ใช้ | IN-1 (ingest ซ้ำ) · IN-3 (apply ซ้ำ) · AR-6 (dirty ซ้ำ) · AR-8 (hash เดิม ⇒ ไม่เรียกตัวต่อ) |
| X5 งานตามเวลาซ้อน | ใช้ | X-4 (pullAll ×2 · pushAriJobs ×2 ⇒ ครั้งเดียว · CAS attempts) · PL-2 |
| X6 ข้อมูลเข้าอันตราย | ใช้บางส่วน | ingest: ตรวจกุญแจ zod · raw ≤ 64 KB · ≤ 500 แถว/ครั้ง · apply: zod เต็มรูป (INVALID ⇒ REJECTED) |
| X7 endpoint สาธารณะ | N-A | ไม่มี endpoint สาธารณะ (ตัวต่อจริง/webhook = H2) |
| X8 PDPA | ใช้ | X-5 · noPii ทุก event · AuditLog ไม่มีอีเมล/เบอร์ · log ระหว่าง apply/pull ไม่มี PII |
| X9 การกระทำอันตราย | ใช้ | MP-7 · IN-11 (ปฏิเสธต้องมีเหตุผล · audit) · U-5 |
| X10 ความลับ | ใช้ | MP-6 (DTO ไม่มีค่าลับ/ฟิลด์ตัวต่อ) · AR-9 (lastError ไม่มี apiKey/ข้อความดิบ) · X-5 (raw ไม่ออก DTO) |
- กันจองซ้อน: การจอง/ยกเลิกจากช่องทางผ่าน createBooking/cancelBooking เส้นเดียว (U-7) · แก้ไข = ยกเลิก+สร้างใน tx เดียว (IN-6/IN-7) · inbox APPLIED ใน tx เดียวกับการจอง (onCreated)
- เงิน: gross/commission/net ตรงสตางค์ (MN-1) · prepaid มัดจำ 0 · ไม่มีบิล POS (MN-2/IN-6/IN-8)

## 5. ภาพ
- จอ 3 หน้า + การ์ด OTA — V-1/V-2 SKIP (ไม่มี QC_BASE) · ผู้คุม build + ถ่าย `visual-svc h.10` (ต้อง `INTEGRATIONS_FAKE=1` · ฉาก h.1 → h.10)
- `PARITY:` รอผู้คุม (การ์ด OTA ภาพ 11)

## 6. reviewer — รอผู้คุมเปิด (เข้ม 2 รอบ: รอบ 1 guard tx/version/modify atomic · รอบ 2 ARI + เงิน prepaid)

## 7. ข้อแย้ง / มติทางเทคนิค
1. **IN-13 (ข้อสอบตั้งค่าไม่ได้ · ขอ ORACLE-EDIT)** — บรรทัด 1091 `setUnit("rooms.hotel.minNights", 3)` ตั้งที่ชั้น UNIT แต่ def `rooms.hotel.minNights` มี `chain: RP` (defs/rooms.ts:690) ⇒ `setSettings` ตอบ `VALIDATION · SCOPE_NOT_ALLOWED «ขั้นต่ำคืน» ตั้งที่ระดับนี้ไม่ได้` ⇒ ข้อล้มที่การตั้งฉาก ไม่ถึงโค้ดของใบ
   - หลักฐาน (probe ชั่วคราวบนร้าน svcqc · ลบแล้ว): UNIT ⇒ `{"ok":false,"code":"VALIDATION","issues":[{"key":"rooms.hotel.minNights","code":"SCOPE_NOT_ALLOWED"}]}` · ตั้ง `bookingMode MANUAL_APPROVE` (UNIT) + `minNights 3` ที่ชั้น **RATE_PLAN (STANDARD)** แล้ว inbound 2 คืน ⇒ `apply APPLIED · reservation CONFIRMED · holdExpiresAt null · nights 2`
   - เสนอแก้: ตั้ง minNights ที่ `scope:"RATE_PLAN", scopeId: ids.std` (หรือ `saveRatePlan` minNights 3) และ reset ชั้นเดียวกัน
2. **AR-13 (MINOR · §10.10)** — buildAri = 16 คำสั่งคงที่ (7 วัน = 60 วัน = 16 · AR-12 CRITICAL ผ่าน): ตัวต่อ 1 + แม็ป 1 (UNION ALL) + ค่าตั้ง ota ≤3 + hotelAvailability 3 + loadPricingContext 6+ค่าตั้ง ≤3 — ≤ 6 ทำไม่ได้ถ้ายังใช้สูตรเดียวของ H.1/H.3 (ห้ามคิดราคา/ห้องว่างเอง · U-7) · เสนอ: ยอมรับ MINOR หรือปรับเป้า ≤ 20
3. การเลือกออกแบบที่ผู้ตรวจควรดู
   - hook ARI ใน rates.ts/block.ts เขียน outbox **ใน tx เดียวกับงาน** (atomic) แทน "หลัง commit": ฟังก์ชันเดิมหลายตัว `return db.$transaction(...)` ตรง ⇒ แทรกหลัง commit แบบเพิ่มอย่างเดียวไม่ได้ · ผลเท่ากัน (consumer ทำงานหลัง commit เสมอ · งานย้อน = ไม่มี dirty) · ไม่ throw (import/emit ล้ม = ข้าม · ร้านไม่มีตัวต่อ = ไม่ยิง) · ยิงทุกครั้งที่บันทึกสำเร็จแม้ค่าเท่าเดิม (AR-10 saveRates ค่าเดิม)
   - booking.ts เพิ่มอย่างเดียว ⇒ ใช้รูป `if (!chIn)` นำหน้าบรรทัดเดิม 2 จุด (ด่าน WEB/LINE ของทางสาธารณะ · TOO_FAR) และ `Object.assign` บน limits/pc แทนการแก้บรรทัดเดิม
   - cancelBooking by CHANNEL: 4th param เพิ่มไม่ได้ (เพิ่มอย่างเดียว) ⇒ `cancelBooking(null, ctx, channelCancelInput({...}))` — ธงอยู่ใน WeakMap ของ booking.ts (ออบเจ็กต์จาก action/คำขอปลอมไม่ได้) · ไม่ได้ส่งออกผ่าน hotel/index.ts
   - inbox APPLIED + event `applied/cancelled` ใน tx เดียวกับการจอง/ยกเลิก (`onCreated`/`onCancelled` ของ internal) — ล็อก advisory ต่อ (ตัวต่อ, externalId) · การจอง active อื่นของเลขเดียวกัน ⇒ DUPLICATE (ย้อน · ยิงซ้อนได้การจองเดียว) · ฉบับใหม่กว่าที่ APPLIED ⇒ STALE
   - backoff = `updatedAt + 2^(attempts−1)` นาที (1·2·4·8 ตามใบ §2 ข้อ 4) · จองงานด้วย CAS attempts (attempts นับรวมรอบที่สำเร็จ ⇒ SENT attempts 1)
   - hash เดิม: ข้ามเมื่อเท่างาน SENT ล่าสุดที่ทับช่วง **และช่วงเท่ากันพอดี** (กันกรณีงานช่วงย่อยส่งค่าอื่นไปหลังจากนั้น)
   - คิวทดสอบ FAKE: ในหน่วยความจำของโพรเซสเท่านั้น (fake.ts ถูกบันเดิลฝั่ง client — ใช้ node:fs ไม่ได้ · ไม่ใช้ /tmp) · หยิบแล้วออกจากคิว · ส่ง connectionId ผ่าน `ChannelCallOpts`
   - `roomScope` ALL_NIGHTLY/SELECTED: ส่งเฉพาะประเภทที่แม็ปทั้งสองโหมด (ต้องมีรหัสของช่องทาง) — ไม่ต่างกันในใบนี้
   - หน่วยของแถว inbox = หน่วยของแม็ปห้อง (externalRoomId) · ไม่มีแม็ป ⇒ หน่วยเดียวของตัวต่อ
   - ผล booking ⇒ inbox: AVAILABILITY_CHANGED ⇒ NEEDS_ROOM `NO_ROOM` · NO_RATE (ไม่มีแผน) ⇒ NEEDS_ROOM · INVALID_STATUS/OVER_OCCUPANCY ⇒ NEEDS_ROOM `MANUAL_REQUIRED` · NOT_FOUND/INVALID ⇒ REJECTED · BUSY/STATE_CHANGED ⇒ คง RECEIVED (pullAll ลองใหม่)

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| PLATFORM tender ตอน settle การจอง prepaid | `checkout.ts COUNTER_PAY_TYPES` ยังไม่มี PLATFORM · ใบนี้ห้ามแตะ pos/** | **H.5b** |
| inbox `retainUntil` 2 ปี | ไม่มีคอลัมน์ ⇒ purge ตาม createdAt | H.9 |
| unique (channelConnectionId, channelRef) บน HotelReservation | ไม่มี index ⇒ กันด้วย inbox unique + ตัวตรวจใน tx (onCreated) | H.9 (ถ้าจะเพิ่ม index) |
| ตัวต่อเจ้าจริง + ส่งปฏิเสธกลับช่องทาง | Q10 รอชื่อลูกค้า | H2.1–H2.3 |
| ฉาก h.1/h.3 `--clear` ไม่รู้จักฉาก h.10 (FK Restrict ของ ChannelRateMap) | ไม่ใช่ไฟล์ของใบ | ผู้คุม (ลำดับ chain / ORACLE-EDIT h.1 h.3) |
| race ข้ามฉบับต่างประเภทห้องพร้อมกัน (ไม่มีการจองเดิม) | ล็อกต่อประเภทคนละตัว · onCreated จับได้เป็น DUPLICATE ⇒ คง RECEIVED ลองรอบหน้า (ไม่จองซ้อน) | — (บันทึกไว้) |

## 9. สิ่งที่ H2 (ตัวต่อเจ้าจริง) ต้องรู้
- implement `ChannelManagerAdapter` ชนิดจริงใน `providers/<เจ้า>.ts` + เปิด `readyFor("CHANNEL_MANAGER", "<CODE>")` · เมธอดรับ `ChannelCallOpts {signal, connectionId}` — เคารพ signal · pushAri ต้อง idempotent (ส่งซ้ำหลัง TIMEOUT ได้)
- `pushAri(map, dates, ari)`: ari.byDate[วัน][externalRoomId] = {available, stopSell, rates[externalRateId] = {priceSatang, minNights, closedToArrival}} (ราคา markup แล้ว · สตางค์)
- `pullReservations(since)`: คืน InboundReservation ตามสัญญา (version เพิ่มทุกครั้งที่แก้ · status NEW/MODIFIED/CANCELLED · gross/commission/net สตางค์ · prepaid) · since = max(createdAt) ของ inbox
- `ackReservation(externalId)` เรียกเมื่อ APPLIED/REJECTED · ack ล้มไม่ย้อนอะไร (ต้องรับ ack ซ้ำได้)
- ปฏิเสธจากคิว (`rejectInbound`) ยังไม่ส่งกลับช่องทาง — H2 เพิ่มเมธอด/ขั้นในจุดนี้

## 10. คืนสภาพ qc-svc
- ข้อสอบ h.10 ลบร้าน `svc-h10-*` ใน finally (Z-1 เขียว) · ฉาก h.10 ล้างแล้ว (`--clear` removed 18) หลังรันรอบสุดท้าย · probe ชั่วคราวลบไฟล์ + แถวแล้ว

## รอบ 2 (ผู้ตรวจ A)
probe `scripts/probe-h10-review-a.mts` (regression ถาวร) ก่อนแก้ 11/15 (แดง R-2 · R-6 · R-10 · R-11) ⇒ หลังแก้ **15/15**

| ข้อ | ต้นเหตุ | แก้ |
|---|---|---|
| R-6 MAJOR ยกเลิกหายเมื่อชน MODIFIED | hook ทางยกเลิกไม่ตรวจการจอง active ที่เหลือ · รายการ active อ่านก่อน lock | `appliedHook` (ทั้งทางลงและทางยกเลิก) หลัง advisory lock ต่อ (ตัวต่อ, externalId): นับการจอง active ของเลขนี้**ทั้งร้าน**ที่ไม่ใช่ ids ของรายการนี้ > 0 ⇒ `DUPLICATE` ⇒ ย้อน tx ⇒ CHANNEL_CONFLICT ⇒ RETRY ⇒ applyOnce อ่านรายการใหม่ (APPLY_TRIES 3 · หมดรอบ = คง RECEIVED ให้ pullAll) · ทางยกเลิก "เปล่า" (INVALID_INPUT) ใช้ hook เดียวกัน · ปิดทุกลำดับไม่พึ่ง lease (pullNowAction/retryInbound/pullAll ซ้อน ผ่าน lock เดียวกันหมด) |
| R-10 MAJOR ตัวต่อ 2 หน่วย MODIFIED ย้ายหน่วย ⇒ active 2 | STALE/active/hook ผูก unitId ของ inbox | ตรวจ active/STALE/DUPLICATE ระดับ (tenant, ตัวต่อ, externalId) ด้วย raw SQL (ไม่ผ่านตัวกรองหน่วยของ tenantDb) · **มติ: การจองเดิมอยู่คนละหน่วยกับฉบับใหม่ (ทั้ง MODIFIED และ CANCELLED) ⇒ NEEDS_ROOM `MANUAL_REQUIRED` — ไม่ย้าย/ยกเลิกข้ามหน่วยเอง** (ข้ามหน่วย = คนละโรงแรม/คนละ folio/คนละสิทธิ์พนักงาน ให้คนตัดสิน) · ลำดับกลับ (ฉบับใหม่ลงหน่วย 2 ขณะเดิมกำลังลงหน่วย 1) ปิดด้วย hook ข้อ R-6 (DUPLICATE ⇒ อ่านใหม่ ⇒ เห็นข้ามหน่วย ⇒ MANUAL_REQUIRED) |
| R-2 minor ผลที่คืนไม่ตรงแถว | `needsRoom()`/`reject()` คืนค่าที่ตั้งใจแม้ CAS ไม่เปลี่ยนแถว | CAS ไม่เปลี่ยน ⇒ NEEDS_ROOM อยู่แล้ว = ปรับเหตุผล · นอกนั้นอ่านสถานะจริง (`actual()`) แล้วคืนค่านั้น (APPLIED + reservationId) |
| R-11 minor NEEDS_ROOM ฉบับเก่าค้างคิว | ไม่มีการปิดฉบับเก่าตอนฉบับใหม่ APPLIED | ใน hook (tx เดียวกับ APPLIED): ฉบับ version ต่ำกว่าของ externalId เดียวกัน (ทั้งร้าน) ที่ RECEIVED/NEEDS_ROOM ⇒ REJECTED `STALE` + event `channel.reservation.rejected` ต่อแถว (idempotencyKey เดิม `…rejected#<inboxId>`) |
| ARI hook minor `emitAriDirty` กลืนข้อผิดพลาดใน tx | คิวรีล้มใน tx ของ Postgres = tx abort อยู่แล้ว | **มติ: มี tx ⇒ ไม่กลืน (transactional outbox) — ปล่อย throw ให้งานล้มที่ต้นเหตุ** แทนกลืนแล้วไปล้มที่คิวรีถัดไป/commit แบบเงียบ · savepoint ไม่เลือก: outbox ใน tx ที่เขียนไม่ได้แปลว่าฐานมีปัญหาจริง และ "งานสำเร็จแต่ ARI หาย" แย่กว่าให้ผู้ใช้ลองใหม่ · ไม่มี tx ⇒ ยังกลืน+เตือน (ไม่มี tx ให้เสีย) · ตัวห่อใน rates.ts/block.ts ถอด `.catch(() => undefined)` + คอมเมนต์ตรงพฤติกรรม (เป็นบรรทัดที่ใบนี้เพิ่มเอง ⇒ diff เทียบฐานยังเพิ่มอย่างเดียว) |

- ลำดับฉาก: ข้อสอบ h.10 ทิ้งฉาก OTA ⇒ ก่อน h.1/h.2/h.3/h.5 ต้อง `svc-qc-hotel-ota-scene.mts --clear` (ผู้คุมจัดใน chain) — ยืนยันผลด้านล่าง
- ไฟล์ที่แตะรอบนี้: `src/lib/modules/hotel/channel/inbound.ts` · `channel/ari.ts` · `hotel/rates.ts` (1 บรรทัดตัวห่อ) · `hotel/block.ts` (1 บรรทัดตัวห่อ) · booking.ts ไม่แตะ
- ผลรอบ 2 (รันจริง · ทรี l4): probe-h10-review-a 15/15 · qc-svc-h.10 --no-regression 73/89 แดง 0 (skip MN-4 · V-1/2 · G-1–13) · หลัง `svc-qc-hotel-ota-scene.mts --clear` (removed 18): h.3 98/109 แดง 0 · h.2 78/87 แดง 0 (Q-3 เขียวเมื่อเคลียร์ h.10 ก่อน) · h.5 77/95 แดง 0 · h.1 ดูบรรทัดถัดไป · tsc ไฟล์ของใบ 0
