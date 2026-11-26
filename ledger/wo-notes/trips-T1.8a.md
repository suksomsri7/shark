# wo-notes — TRIPS T1.8a (ข้อความถึงลูกค้าทริป · ยืนยัน · เตือนวันก่อนเดินทาง · งวดจ่าย)

ทรี `shark-trips-l1` · กิ่ง `wip/trips-t1.8` (HEAD 682f2d94f) · ไม่ commit/push/build · ฐาน QC ของเลนผ่าน `scripts/qc-trips.sh` เท่านั้น

## ไฟล์ (+/− เทียบงบ §3)
| ไฟล์ | +/− | งบ |
|---|---|---|
| `src/lib/platform/notify-customer.ts` | +18/−3 (ทุกบรรทัดในรั้ว `// TRIPS T1.8 ▸ … ◂`) | +30/−4 |
| `src/lib/core/settings/defs/trips.ts` | +5/−4 | +8/−4 |
| `src/lib/modules/trips/notify-core.ts` (ใหม่) | +202 | +220 |
| `src/lib/modules/trips/notify.ts` (ใหม่) | +305 | +340 |
| `src/lib/modules/trips/jobs.ts` | +69/−1 | +140/−2 |
| `src/lib/modules/trips/manifest.ts` | +12 | +30/−2 |
| `src/lib/modules/trips/trips-settings.ts` | +9/−1 | +25/−2 |
| `src/lib/modules/trips/booking-screens.ts` | +6/−1 | +40/−2 |
| `src/lib/modules/trips/index.ts` | +4 | +8 |
| `src/lib/outbox-consumers.ts` | +2/−2 | +4/−2 |
| `src/lib/platform/minute-jobs.ts` | +7 | +8 |
| `src/components/trips/BookingDrawer.tsx` | +24 | +45/−2 |
| `src/components/trips/TripsMsgPreview.tsx` (ใหม่) | +70 | +90 |
| `src/components/trips/TripsSettings.tsx` | +3 | +15/−2 |
| `src/messages/{th,en}/trips.json` | +28 ต่อไฟล์ | +30 |

## การตัดสินใจ
- **ประตู (R8)**: 4 จุดในรั้ว — ชนิด input (`domain` + `scope` + `localized` + `standardText`) · ด่าน domain รับ "trips" · refs ใช้ `...(input.scope?.productId ? { productId } : {})` · หลังค่าตั้ง: `standardText` ⇒ แทนค่าแม่แบบด้วย `_fallback` (domain trips เท่านั้น) · ใน `deliver` หลังตัดสิน locale: ผู้รับ en + แม่แบบ en ไม่ว่าง ⇒ ทับ `a.vars` ด้วย `localized.en.vars` (missingVarsOf/renderTemplate ใช้ชุดเดียวกัน · R6). ผู้เรียกเดิมไม่ส่งช่องใหม่ ⇒ refs/SQL/พฤติกรรมเดิม
- **ข้อเท็จจริงคิวรีเดียว** (`factsOf`): การจอง + สินค้า + รอบ + หน่วย TRIPS + ร้าน (ชื่อ/slug) + EXISTS คำขอคืนเงินเปิด (REQUESTED QUOTED APPROVED EXECUTING FAILED แบบ jobs.ts) + งวดสด (LEFT JOIN ด้วย dueId) — precheck หลัง claim ใช้ตัวเดียวกัน
- **ผู้ถูกลบ** = `bookerPartyId` null ∨ `piiPurgedAt` ∨ `policySnapshot.booker.erased` ⇒ BAD_STATE ก่อน claim / `SKIPPED_PRECHECK_ERASED` หลัง claim
- **ผู้รับ (R1 · D-2)**: ทาง ก = `ChatLinkCode` (TRIP_BOOKING · refId การจอง · usedAt ไม่ว่าง) JOIN `ChatContact` ด้วย SQL ดิบที่ใส่ tenantId เอง (ChatContact เป็น system-scoped — tenantDb ต้องมี systemId) · ผู้ติดต่อมี Party ≠ ผู้จอง (หลัง resolveCanonical ทั้งคู่) ⇒ ข้าม · ทาง ข เฉพาะ COUNTER/POS = `party.resolveCanonical(bookerPartyId)` ⇒ ส่ง `partyId` อย่างเดียว · ช่องทางอื่นทั้งหมด (WEB LIFF EMBED AGENT_* API CHAT_AI **และ IMPORT สำหรับเตือน**) = ทาง ก เท่านั้น
- **กุญแจ (R2)**: `keyId` แทน 0–9 ด้วย A–J · id นอก `[a-z0-9_-]{1,64}` ⇒ null ⇒ BAD_STATE · วันที่ผ่าน keyId เช่นกัน
- **ด่านแม่แบบตอนส่ง (R9)**: แม่แบบที่มีผล (ชั้นหน่วย·สินค้า) ไม่ผ่าน ⇒ ส่ง `standardText: true` + `logOps WARN` (ไม่มีข้อความแม่แบบใน log) · ลิ้นชักตัดสิน fallback ด้วยด่านเดียวกันกับแม่แบบที่มีผล ณ ตอนเปิด
- **จุดรับ** (`pickupFactsOf`) อ่านเฉพาะเตือนวันก่อนเดินทาง หรือเมื่อแม่แบบที่มีผลใช้ `{เวลารับ}`/`{จุดนัด}` (ประหยัดคิวรีของยืนยัน)
- **งาน** `trips.customerMessages` (jobs.ts): prisma ดิบอ่านหน่วย TRIPS ข้ามร้านอย่างเดียว · ค่าตั้งต่อร้านคิวรีเดียว (resolveSettingsMany) · หน่วยในเวลาเงียบ ⇒ ข้าม · เตือน: ขั้นใน notify.ts (`tripsReminderScan` หน้าละ 200 keyset · log IN คิวรีเดียวต่อหน้า) · ลองซ้ำ (`tripsRetryScan`): OutboxEvent ของร้าน 2 ชนิด createdAt ∈ [now−48ชม., now] ⇒ กุญแจตรงตัว ⇒ log IN ⇒ เรียกซ้ำเฉพาะ SKIPPED_QUIET / FAILED ที่ at ≤ now−60 นาที · ไม่มีแถว ⇒ ไม่เริ่มครั้งแรก
- consumer: `compose(no-op เดิม, onTripsNotifyEvent)` (lazy import · ไม่ throw)
- ค่าตั้ง: `msgEnabled()` ปิดทุกชนิดทุกแม่แบบ (R5 · `all(...)`) · `writeVia: "หน้า ตั้งค่าทัวร์ › ข้อความแจ้งเตือน"` ทั้ง `trips.msg.enabled` และ 10 แถว `trips.msg.<kind>` · ด่านบันทึก `saveTripsSettings` = `checkTripsMsgTemplate` กับ 3 ชนิด a (ชนิดอื่นไม่มีด่าน `{ลิงก์}` เพราะไม่ได้ส่งใน a)
- ผลของ `notifyTripBooking` เมื่อ precheck ปัดตก: `status = "SKIPPED_PRECHECK_<เหตุ>"` (ประตูคืน FAILED + precheckFailed) · QUOTA ⇒ `"QUOTA"`

## เบี่ยงจากใบ (และเหตุ)
1. **ช่องเพิ่มในประตู `standardText?: boolean`** (นอก 3 ช่องของ §4.10) — §4.7 ให้ "ตอนส่งใช้ค่าเริ่มของทะเบียน" แต่ประตูอ่านแม่แบบเอง ผู้เรียกจึงไม่มีทางสั่งให้ใช้ค่าเริ่มด้วย 3 ช่องเดิม · เพิ่มแบบเพิ่มล้วนในรั้ว · มีผลเฉพาะ `domain === "trips"` · ทางเลือกที่เล็กกว่าไม่มี (precheck ยับยั้งได้อย่างเดียว)
2. ตัวอย่างข้อความ `{ร้าน}` ใช้ `vm.unitName` (TripsSettingsVM ไม่มีชื่อร้าน และ screens.ts อยู่นอกขอบเขต) · ข้อความจริงใช้ `Tenant.name`
3. ตัวอย่างข้อความแก้ข้อความทดลองในกล่องของตัวเอง (ค่าเริ่ม = ค่าที่มีผลของฟอร์ม) — ฟอร์มกลาง `SettingsForm` ไม่ส่งค่าที่ยังไม่บันทึกออกมา และอยู่นอกขอบเขต
4. งานเตือนตัดหน่วยด้วยสวิตช์ชั้นหน่วย (ค่าตั้งครั้งเดียวต่อหน่วย §4.6) — สินค้าที่เปิดชั้นสินค้าแต่หน่วยปิดจะไม่ถูกงานสแกน (notifyTripBooking ตรวจชั้นสินค้าเสมอ)
5. `notify-core.ts` import `getDef` จาก `core/settings/registry` (pure) เพื่อข้อความมาตรฐานของ `renderTripsPreview` · จอฝั่งเบราว์เซอร์ใช้ `tripsPreviewWith(…, field.templateValue)` (ทะเบียนฝั่งเบราว์เซอร์ว่าง)

## ข้อสอบ — แดงที่เป็นปัญหาของข้อสอบ (ไม่ได้เลี่ยง)
- **P-2**: ข้อสอบเรียกทั้ง `ks[1].includes(":reminder1Day:")` และ `!/\d/.test(k)` — ชื่อชนิด `reminder1Day` มีเลข 1 เอง ⇒ ขัดกันเอง (ใบ §4.5 ก็เขียนทั้งรูปกุญแจ `…:reminder1Day:…` และ "กุญแจไม่มีตัวเลขเลย") · กุญแจที่ได้ไม่ตรง TH_PHONE_RE (เลขเดี่ยว) · ผู้คุมเลือก: ยอมเลขในส่วนชนิด หรือเปลี่ยนส่วนชนิด
- **S-6**: `jobs.ts` มี `AT TIME ZONE` ของ T0.8 อยู่เดิม (บรรทัด ~485/489 `runPdpaPurge`) — ข้อสอบตรวจทั้งไฟล์เมื่อไฟล์เปลี่ยน · โค้ดใหม่ไม่มี
- **M-5**: ฟิกซ์เจอร์ `TripRefundRequest` ไม่ใส่ `by` ⇒ ชน `TripRefundRequest_by_check` (และ `reasonKind`/`choice` ก็เป็นค่าสุ่ม)
- **M-6**: นับแถว reminder1Day ทั้งร้าน — 17:00 ไทย = 19:00 ญี่ปุ่น ⇒ KT ของหน่วยโตเกียว (เปิด reminder1Day ตั้งแต่ต้นกลุ่ม) ถึงหน้าต่างจริง ⇒ 1 แถวเสมอ · และเมื่อ eq ล้ม บรรทัดคืนรอบ D1 เป็น OPEN ไม่ถูกเรียก ⇒ รอบ D1 ค้าง CANCELLED ⇒ M-8 D-* X-1 E-* T-4 L-1 แดงตามกันหมด
- **J-1/J-2**: ฟิกซ์เจอร์ OutboxEvent ใช้ idempotencyKey `trips.booking.confirmed:<K1>` ซึ่ง bookTripsNow เขียนไว้แล้ว (booking.ts:1102) ⇒ ชน unique ⇒ "ตั้ง OutboxEvent ไม่ได้" ⇒ ไม่มีที่มาของกุญแจลองซ้ำ
- **D-1/D-2 ขึ้นกับนาฬิกาจริง**: consumer ไม่มี now (เวลาเครื่อง) · paymentDue เคารพเวลาเงียบ (§4.2) ⇒ รันช่วง 21:00–08:00 ไทย = SKIPPED_QUIET ไม่มี push
- ยืนยันว่าโค้ดผ่านเมื่อแก้ฟิกซ์เจอร์: สำเนาข้อสอบที่แก้ 4 จุดข้างบน (`scratchpad/t1.8a/qc-copy.txt` · เวลาเงียบของกลุ่ม D ตั้งเป็น 00:00–00:01) ⇒ 71/73 (แดงเหลือ P-2 S-6)

## ORACLE-EDIT ที่คาด (ผู้คุม)
- `qc-trips-t0.1.mts:203` (+ R-11) ค่าเริ่ม T69 ปิด (D-3)

## ยังไม่ได้ตรวจ
- ภาพฉาก (ลิ้นชัก 1440/390 · ตัวอย่างข้อความ th/en) — ห้าม build/เปิดเซิร์ฟเวอร์
- เส้นเอเจนซี่ A32 (ค่าสดชั้น AGENT เมื่อ snapshot ไม่มี) — ข้อสอบไม่มีฟิกซ์เจอร์เอเจนซี่
- ขนาด bundle ฝั่งเบราว์เซอร์ของ TripsMsgPreview (ดึง core/settings/registry + legal ที่เป็น pure)
- lint (ไม่อยู่ในรายการที่สั่งรัน)

## สถานะตอนพัก (เจ้าของสั่งพัก RUN · 26 พ.ย.)
- **ลำดับงานที่เสร็จ: ครบ 5 ขั้น** (1 notify-core · 2 รั้วประตู · 3 notify.ts + consumer + งาน + ลงทะเบียน minute-job · 4 ค่าตั้ง/writeVia/ค่าเริ่มปิด/ด่านบันทึก/ตัวอย่าง · 5 ลิ้นชัก + ข้อความ th/en) — ไม่มีฟังก์ชันค้างครึ่ง · ไม่มีการแก้โค้ดหลัง typecheck
- **typecheck เต็ม 1 ครั้ง (หลังเขียนครบ) = 0 error** (`scratchpad/t1.8a/tsc1.log`)
- **ข้อสอบ qc-trips-t1.8 ครั้งล่าสุด (ตัวจริง)**: 58/73 — PC 8/8 · S 7/8 · P 4/5 · GW 4/4 · C 7/7 · R 6/6 · M 5/8 · D 1/3 · X 2/3 · E 0/3 · J 3/5 · G 4/4 · T 3/4 · L 1/2 · PF 3/3 (แดงทั้งหมดเป็นข้อขัดของข้อสอบ/ฟิกซ์เจอร์ + ผลตามจาก M-6 ดูหัวข้อข้างบน) · สำเนาที่แก้ฟิกซ์เจอร์ 71/73
- **ชุดถดถอย SVC (รันต่อกันในลูปเดียว)**: r0.7 = 89/89 ✅ · b.9 = 57/62 ❌ (S-1 ขอบเขตไฟล์ของใบ SVC B.9 นับไฟล์ trips ของกิ่งนี้ว่า "นอกใบ" · G-1 = b.5 --no-regression แดง S-1 S-9 · G-2 = b.4 --no-regression แดง ST-1 — ทั้งหมดเป็นข้อตรวจขอบเขต/ไฟล์ ไม่ใช่พฤติกรรม · ยังไม่ได้เทียบกับฐานที่ไม่มีงานนี้) · b.17 กำลังรันตอนสั่งพัก (ไม่ได้ฆ่า) · **ลูปจะรัน d.9 d.10 d.16 d.17 d.18 ต่อเอง** — ผู้สร้างหยุดลูปไม่ได้ (คำสั่ง kill เปลือกลูปถูกระบบสิทธิ์ปฏิเสธ · ไม่ฆ่างานกลางทาง) · ผลจะอยู่ที่ `scratchpad/t1.8a/svc-<ชุด>.log`
- **ยังไม่ได้รัน**: qc-trips-t0.1 (คาด ORACLE-EDIT D-3) · fitness
- `.mts` ใน scratchpad เปลี่ยนเป็น `.txt` แล้ว (`qc-copy.txt`)
