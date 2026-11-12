# TRIPS-CORE-CONTRACT — สัญญาชิ้นกลางของ RUN "TRIPS" (ตั๋ว · ทัวร์ · Liveaboard · เอเจนซี่ · ผู้ให้บริการ)

> เขียน 12 พ.ย. 2569 · ใบ P0.3 · ⚠️ เอกสารเท่านั้น — ยังไม่แตะโค้ด · รอผู้ตรวจอิสระ 1 รอบ (MASTER-PLAN §3 P0.3)
> **ไฟล์นี้อยู่เหนือ** `ledger/DESIGN-TRIPS-AGENCY.md` (TA) และ `ledger/TRIPS-MASTER-PLAN.md` (MP) §2 ในทุกเรื่อง "ชื่อ/ที่อยู่/ตาราง/หน้าสัมผัส/ลำดับล็อก/รูป snapshot" — TA (รวม §13.1 ผลกฎหมายรอบ 2 ที่ทับ §13) ยังเป็นแหล่งของ **พฤติกรรม หน้าจอ** · **ชื่อคีย์ ชนิด ชั้น ค่าเริ่ม และคำเตือน W01–W46 อยู่ใน `ledger/TRIPS-DEFAULTS.md` (P0.2) — ชื่อคีย์ในไฟล์นั้นชนะไฟล์นี้** · กฎหมาย `ledger/LEGAL-TRIPS-TH.md` ฉบับรอบ 2 (N1–N26 · §10 · §11)
> ต่อยอด `ledger/SVC-CORE-CONTRACT.md` (CC) — ค่าตั้งแบบชั้น (CC §1) · ศูนย์เชื่อมต่อ (CC §2) · `PaymentSlip` (CC §3) · `notifyCustomer()` (CC §4.4) · `signLink` (CC §4.5) · แบบแผน `RoomOccupancy`/`Channel*` (CC §5) **ใช้ของเดิม ไม่สร้างใหม่**
> ตรวจกับโค้ดจริงใน worktree `shark-trips` (branch `session/trips` @dadf9bc4b · มีชิ้น SVC ครบ) · ชื่อที่ **ยังไม่มี** เขียนใน «…» · ของที่มีจริงเขียนใน backtick
> หน่วยเงิน = Int **สตางค์** (สกุลต่างประเทศ = Int หน่วยย่อย "minor" เช่น cent) · เวลา = `DateTime` UTC · วันเดินทาง = `@db.Date` วันตามเขตเวลาร้าน (แบบ `HotelBookingNight.date`)
> เจ้าของไฟล์ชิ้นกลาง = ใบที่ระบุใน §A · ใบอื่น **ห้ามแก้ไฟล์ชิ้นกลาง** — ต้องการเพิ่ม = เขียนคำขอใน wo-notes → ผู้คุมตัดสิน (แบบ CC หัวไฟล์)

**มติเจ้าของที่ห้ามขัด (ยกมาเพื่อกันลืม):** SHARK ไม่ถือเงินลูกค้า (R1/Q16) · ไม่บล็อก/ไม่ตรวจใบอนุญาต ตัวตรวจกฎหมาย = `OK`/`WARN` เท่านั้น (รอบ 3) · ทุกค่า = ค่าเริ่มต้นที่ร้านปรับได้ในค่าตั้งแบบชั้น ไม่มีค่าคงที่ในโค้ด (รอบ 4) · ลูกค้าของเอเจนซี่ไม่เข้ารายชื่อการตลาดของร้านโดยค่าเริ่มต้น (Q17) · เฟส 2 (เอเจนซี่ย่อย · ผังที่นั่งตั๋ว · เครือข่ายข้ามร้าน · ภาษาจีน) ไม่สร้าง แต่ตัวตนเอเจนซี่ระดับแพลตฟอร์มตั้งแต่วันแรก (Q7) · หลายสกุลเงินและจ่ายแยกคน **เฉพาะ Liveaboard** (Q4/Q15) · หน้าจองสาธารณะ = route เดียวสำหรับลิงก์/LIFF/ฝัง (MP §2 ข้อ 10)

---

## 0. สรุปการเคาะ (อ่านข้อนี้พอถ้ารีบ)

| # | เรื่อง | แผน/แบบเรียก | **เคาะ (ใช้ชื่อนี้)** |
|---|---|---|---|
| TC1 | โมดูล | trips · ticket · agency · supplier + core/sellable | «src/lib/modules/trips/» · `src/lib/modules/ticket/` (เพิ่ม «index.ts») · «src/lib/modules/agency/» · «src/lib/modules/supplier/» · **«src/lib/core/sellable.ts» บริสุทธิ์ (ชนิด+ทะเบียนชนิดสินค้า)** + ตัวประกอบที่เรียกโมดูลจริงอยู่ชั้น platform «src/lib/platform/sellables.ts» · «src/lib/platform/basket.ts» (core ห้าม import โมดูล) |
| TC2 | ทิศ import | — | trips→agency · trips→supplier · ticket→agency · ทุกตัว→pos/account/party/approval/chat ผ่าน facade · **agency และ supplier ไม่ import trips/ticket** (อ่านชื่อสินค้าผ่าน platform) — §A.3 |
| TC3 | ตัวตนเอเจนซี่ | AgentIdentity/AgentAccount | «AgentIdentity» แกน `global` (ไม่มี tenantId · แบบ `User`) + «AgentIdentityUser» · «AgentAccount» แกน `tenant` (ร้าน = tenant) · ค่าสัญญาทั้งหมด = **ค่าตั้งชั้น AGENT** ไม่ใช่คอลัมน์ |
| TC4 | ตัดที่ | SQL เดียว | ตัวนับ 4 ช่องบนแถวรอบ: `capacity · sold · held · reserved` (reserved = โควตาเอเจนซี่ที่ยังไม่คืนและยังไม่ใช้) · ทุกการเปลี่ยน = `UPDATE … WHERE <เงื่อนไข> RETURNING` คำสั่งเดียวต่อแถว · Liveaboard = แถวต่อเตียงต่อรอบ «TripUnit» + `FOR UPDATE` — §D |
| TC5 | การจองตอนรอจ่าย | ถือที่ → การจอง | แถว «TripBooking» เกิดตอน `confirm()` ด้วยสถานะ `HOLD` (มีเลขจอง + ลิงก์จ่ายก่อนเงินเข้า แบบ `HotelReservation.status HOLD`) · ที่นั่งยังเป็น `held` จนเงิน/ร้านยืนยัน — §G |
| TC6 | ค่าตั้ง | โดเมน trips/agency/ticket · scope ใหม่ 5 | ต่อท้าย `SCOPE_KINDS`: `VESSEL` `PRODUCT` `DEPARTURE` `AGENT_TIER` `AGENT` · ลำดับทั่วไป→เจาะจง `TENANT → UNIT → VESSEL → PRODUCT → DEPARTURE → AGENT_TIER → AGENT` — §E |
| TC7 | ตัวตรวจกฎหมาย | OK/WARN | ไฟล์ใหม่ «src/lib/core/settings/legal/th-tour-2569.ts» · rule id = W01–W46 ของ TRIPS-DEFAULTS · ทะเบียนปฏิเสธตอนโหลดถ้า rule ของโดเมน trips/agency/ticket คืน `BLOCK` ได้ · "ระดับสูง/สูงสุด" = ช่อง «severity» บน WARN ไม่ใช่ระดับที่สาม · รับทราบโดยไม่บังคับเหตุผล — §E.5 |
| TC8 | snapshot | policySnapshot | คอลัมน์ `policySnapshot Json` (NOT NULL) บน «TripBooking» `TicketOrder` · รูป «TripsBookingSnapshot v1» ห่อ `PolicySnapshot` ของ CC 2–3 ก้อน (แยกต่อโดเมน เพราะทะเบียนห้าม snapshot ข้ามโดเมน) — §F |
| TC9 | เงิน | ผ่าน POS/บัญชี V2 | ลูกค้าจ่ายร้าน = ใบรับมัดจำ POS (`moduleTakeDeposit`) ต่องวด · ปิดทริป = บิลปิด POS ใช้มัดจำ · เอเจนซี่/ผู้ให้บริการ = เอกสารบัญชี V2 ผ่าน overload ใหม่ของ facade บัญชี (แบบ DORM D.2) — §H |
| TC10 | สมุดเอเจนซี่ | ต่อท้ายอย่างเดียว | «AgentLedgerEntry» + หัวสมุด «AgentBalance» (ล็อกแถวเดียวต่อเอเจนซี่ · seq ไม่ขาด) · บวก = เอเจนซี่ค้างร้าน — §I |
| TC11 | หน้าสาธารณะ | `/b/[shop]` | ⚠️ **`/b/[slug]` เป็นพอร์ทัลบริษัทของ CRM อยู่แล้ว** (`src/app/b/[slug]/page.tsx`) ⇒ เสนอ «/book/[shop]/…» · พอร์ทัล «/agent/[shop]/…» (ว่าง) — §J · L-1 |
| TC12 | เลขเอกสาร | TR- TK- LB- ST- | ตัวนับ «TripsCounter» `INSERT … ON CONFLICT DO UPDATE seq+1 RETURNING` (แบบ `PosDocCounter` ใน `src/lib/modules/pos/deposit.ts:508`) · งวดของเลขจอง = **เดือนเดินทาง** (พ.ศ.) · `RC-` ไม่ใช่ของ trips — §K |
| TC13 | ลำดับล็อก | — | ตะกร้า → รอบ (ตามชนิดสินค้า แล้ว id) → โควตาย่อย → หน่วย/เตียง → ถือที่ → การจอง → ตัวนับเลข → งวดจ่าย → หัวสมุดเอเจนซี่ → เจ้าหนี้ผู้ให้บริการ · POS/บัญชี **นอก tx** ของ trips — §D.5 |
| TC14 | ค่าตั้งเอเจนซี่/ภาษี | ตาม §13 | ตาม **TA §13.1** + TRIPS-DEFAULTS: WHT ตาราง ผู้จ่าย×ผู้รับ (บุคคลธรรมดา = ม.50(1) ไม่คำนวณอัตโนมัติ · ต่างประเทศ = ไม่หัก+ยืนยัน) · "ใครนำส่ง" (A30) · ราคาเน็ตค่าเริ่ม = โหมดตัวแทน · ยกเลิก 4 เหตุ + ตารางขั้นต่ำตามประกาศ (เตือน ไม่บล็อก) · เก็บแทน 4 เงื่อนไข — §E.4 §F §G.3 §H |

---

## A. แผนที่โมดูลและเจ้าของไฟล์

### A.1 ไฟล์ชั้น core / platform
| ไฟล์ | บริสุทธิ์? | เนื้อหา | เจ้าของ |
|---|---|---|---|
| «src/lib/core/sellable.ts» | ✅ (แบบ `src/lib/core/channels.ts` — ห้าม import prisma/next/โมดูล/env) | ชนิดทั้งหมดใน §C · `PRODUCT_KINDS` · `isProductKind()` · `SELL_ERROR_CODES` · `SELL_CHANNELS` · ฟังก์ชันบริสุทธิ์ `requestHash()` (กันซ้ำ) | T0.1 สร้าง · K1.1 เพิ่มชนิด TICKET-specific เฉพาะบรรทัดที่ประกาศ |
| «src/lib/platform/sellables.ts» | ❌ | `sellableFor(kind)` → implementation (lazy import facade `trips` / `ticket`) · `HOTEL` = ประกาศจองไว้ คืน `KIND_NOT_SUPPORTED` | T0.4 (TRIP) · K1.1 (TICKET) — แก้เฉพาะบรรทัดลงทะเบียน |
| «src/lib/platform/basket.ts» | ❌ | ตะกร้าหลายชนิด (G24): `basketHold` · `basketConfirm` — เรียก `*InTx` ของแต่ละชนิดใน tx เดียวตามลำดับล็อก §D.5 | T0.6 |
| «src/lib/platform/trips-pay.ts» | ❌ | consumer `payment.slip.approved` (domain `TRIPS`/`TICKET`) → `trips.recordDuePayment` / `ticket.markPaid` (แบบ `src/lib/platform/dorm-pay.ts`) | T0.7 (TRIPS) · K1.3 (TICKET) |
| «src/lib/platform/trips-public.ts» | ❌ | ตัวแก้ `/book/[shop]` → tenant/unit · ตัวติดตาม `?a ?s ?d` · rate limit · ตรวจโดเมนฝัง | W1.1 |
| «src/lib/platform/agent-auth.ts» | ❌ | ล็อกอินเอเจนซี่ (LINE/อีเมล) → `AgentIdentityUser` → session ขอบเขตต่อ `AgentAccount` | A1.2 |
| `src/lib/platform/minute-jobs.ts` | — | ลงทะเบียนงาน §J.2 (บรรทัดลงทะเบียนเท่านั้น · lazy import facade แบบ `rooms.expireHolds`) | ใบที่สร้างงานนั้น |
| `src/lib/platform/notify-customer.ts` | — | ขยาย `domain` จาก `"booking"\|"rooms"` → + `"trips"\|"ticket"\|"agency"` (L-7) | T1.8 |
| `src/lib/platform/postback-routes.ts` | — | prefix `trips.` `ticket.` | W2.2 |
| `src/lib/core/settings/{types,registry,service}.ts` | — | scope ใหม่ · โดเมนใหม่ · ทะเบียนตัวตรวจกฎหมายหลายไฟล์ (L-2 L-3) | **T0.1** (ตรวจเข้ม) · ตำแหน่ง locate ของ AGENT/AGENT_TIER = A1.1 · VESSEL = L1.1 · PRODUCT/DEPARTURE ของตั๋ว = K1.1 |
| «src/lib/core/settings/defs/trips.ts» · «defs/agency.ts» · «defs/ticket.ts» | ✅ | นิยามค่า §E.4 + แม่แบบ 4 ตัว | T0.1 · A1.1 · K1.1 |
| «src/lib/core/settings/legal/th-tour-2569.ts» | ✅ | ตัวตรวจ OK/WARN = W01–W46 ของ TRIPS-DEFAULTS §4 (+ «legal/index.ts» ทะเบียนรวม) | T0.1 (โครง + ข้อ trips) · A1.1 (ข้อ WHT) |
| `src/lib/core/scope.ts` | — | ลงทะเบียนทุก model ใหม่ (fail-closed) · `AgentIdentity`/`AgentIdentityUser` = `g("ตัวตนเอเจนซี่ระดับแพลตฟอร์ม (Q7)")` | ใบ migration ของตารางนั้น |
| `scripts/fitness.mts` | — | `ALLOWED_EDGES` + baseline F5 (ORACLE-EDIT ผู้คุมเท่านั้น) | ผู้คุม |

### A.2 โมดูล (facade = `index.ts` · โมดูลอื่นเรียกผ่าน facade เท่านั้น)
**«src/lib/modules/trips/»**
| ไฟล์ | เนื้อหา | ใบ |
|---|---|---|
| «index.ts» | facade (รายการชัดเจน ไม่ใช่ `export *` — แบบ `pos/index.ts` D5) | T0.1 สร้าง · ทุกใบต่อท้ายบล็อกของตัวเอง `// TRIPS <ใบ> ▸ … ◂` |
| «products.ts» | สินค้า · ตัวเลือก · ประเภทคน · รายการเสริม · i18n | T0.2 |
| «departures.ts» · «resources.ts» | กฎซ้ำ · รอบ · สถานะ · ทรัพยากรกันชน (EXCLUDE gist) | T0.3 |
| «capacity.ts» | **ไฟล์เดียวของโมดูลที่ใช้ SQL ดิบ** (ตัวนับ §D · sweeper) — F5 +1 | T0.4 |
| «pricing-core.ts» (บริสุทธิ์) · «pricing.ts» | ตัวเลือกราคา §F.1 (ฟังก์ชันบริสุทธิ์ รับข้อมูลที่โหลดแล้ว) · ตัวโหลด | T0.5 |
| «state.ts» (บริสุทธิ์) | ผังสถานะ §G (ตาราง transition + ผู้กระทำ) | T0.6 |
| «booking.ts» · «numbering.ts» · «sellable-impl.ts» | สร้าง/แก้/เลื่อน การจอง · เลข §K · implement `Sellable` | T0.6 (T0.4 วาง quote/hold/availability) |
| «money.ts» · «refund.ts» | งวดจ่าย · รับเงิน · ปิดยอด · คืนเงินเป็นขั้นตอน §H | T0.7 |
| «passengers.ts» · «pdpa.ts» | ผู้เดินทาง · เอกสารรับทราบความเสี่ยง · ไฟล์ส่วนตัว + log + ลบ | T0.8 |
| «manifest.ts» · «ops.ts» · «close.ts» · «cancel-departure.ts» · «costs.ts» · «notify.ts» · «onboarding.ts» · «import.ts» | งานฝั่งร้าน T1 | T1.4 · T1.5 · T1.5 · T1.6 · T1.7 · T1.8 · T1.9 · T1.10 |
| «liveaboard/vessel.ts» · «liveaboard/deckplan.ts» · «liveaboard/berths.ts» · «liveaboard/split-pay.ts» · «liveaboard/onboard-bill.ts» · «liveaboard/manifest.ts» · «liveaboard/charter.ts» | เรือ · ผัง+เวอร์ชัน+ตัวตรวจผลกระทบ · เตียง · จ่ายแยกคน · บิลบนเรือ · รายชื่อ · เหมาลำ | L1.1–L1.2 · L1.4 · L1.8 · L1.9 · L1.10 · L1.11 |

**`src/lib/modules/ticket/`** (ของเดิม `service.ts` `actions.ts` คงไว้)
| ไฟล์ | เนื้อหา | ใบ |
|---|---|---|
| «index.ts» | facade ใหม่ (ปัจจุบันไม่มี) | K1.1 |
| «sessions.ts» · «quota.ts» (SQL ดิบ — F5 +0: ไฟล์ `service.ts` นับอยู่แล้ว ย้ายไปที่นี่) · «sellable-impl.ts» | รอบ · ตัวนับ · implement `Sellable` | K1.1 · K1.2 |
| «admissions.ts» · «gate.ts» · «batch.ts» | ตั๋วรายใบ/ส่งต่อ · สแกนประตูออฟไลน์ · ชุดตั๋วเอเจนซี่ | K1.4 · K1.5 · K1.6 |

**«src/lib/modules/agency/»**
| ไฟล์ | เนื้อหา | ใบ |
|---|---|---|
| «index.ts» | facade | A1.1 |
| «identity.ts» | `AgentIdentity` ระดับแพลตฟอร์ม (อ่าน/เขียนผ่านฟังก์ชันนี้เท่านั้น) | A1.1 |
| «accounts.ts» · «tiers.ts» | ทะเบียน · สมัคร→อนุมัติ · ผู้ใช้/บทบาท · ผูก Party/CRM | A1.2 |
| «rates.ts» · «rates-core.ts» (บริสุทธิ์) | rate card · 3 แบบราคา · ช่วงพิเศษ · เครื่องลองคิด | A1.3 |
| «allotment.ts» · «requests.ts» | โควตา · วันคืน · คำขอก่อนจอง · เพดานถือ | A1.4 |
| «ledger.ts» | **ไฟล์ SQL ดิบเดียวของโมดูล** (หัวสมุด + seq) — F5 +1 | A1.5 |
| «statement.ts» · «commission.ts» · «links.ts» | ใบแจ้งยอด · รอบคอมฯ+WHT · ลิงก์ขาย | A1.6 · A1.7 · A1.8 |
| «portal.ts» · «api-keys.ts» | อ่านข้อมูลพอร์ทัล · คีย์ API/webhook | A2.1–A2.4 |

**«src/lib/modules/supplier/»** — «index.ts» (S1.1) · «suppliers.ts» «costs.ts» (S1.1) · «requests.ts» (S1.2) · «payables.ts» (S1.3) · «import.ts» (S1.4) · «peer-link.ts» (S1.5) · «group-quotes.ts» (S1.6)

### A.3 เส้น import ข้ามโมดูลที่ต้องเพิ่มใน `ALLOWED_EDGES` (ORACLE-EDIT ผู้คุม · ใบที่ใช้จริงเป็นคนยื่น)
| เส้น | ทำไม | ใบแรก |
|---|---|---|
| `trips→pos` `trips→account` `trips→party` `trips→system` | เงิน (§H) · Party ผู้จอง · หา POS/บัญชีที่ผูกหน่วย (แบบ `ticket→pos/party/system` เดิม) | T0.6/T0.7 |
| `trips→approval` `trips→chat` | คิวอนุมัติคืนเงิน/ราคาแก้มือ · `issueLinkCode` | T0.7 · W2.1 |
| `trips→agency` | ราคาเอเจนซี่ + โควตา + ลงสมุด **ใน tx เดียวกับการจอง** | T0.5 (type) · A1.3 (เรียกจริง) |
| `trips→supplier` | ต้นทุน/คำขอจองไปผู้ให้บริการตอนยืนยัน | S1.2 |
| `ticket→agency` | ชุดตั๋วเอเจนซี่ · ราคาเอเจนซี่ | K1.6 |
| `agency→party` `agency→account` `agency→crm` `agency→approval` | Party/บริษัท CRM · ใบแจ้งยอด/WHT · คิวอนุมัติ | A1.2 · A1.6 |
| `supplier→party` `supplier→account` `supplier→crm` | ผู้ติดต่อ · เจ้าหนี้ · ดีลเหมาลำ | S1.1 · S1.3 · S1.6 |
| `trips→hr` `trips→inventory` `trips→kanban` `trips→member` | X.2 | X.2 |
- **ห้าม**: agency→trips · agency→ticket · supplier→trips · ticket→trips · trips→ticket (ไม่มีวงโหลด · ตะกร้าข้ามชนิดอยู่ชั้น platform) · trips/ticket→hotel (HOTEL ในทะเบียนชนิดสินค้า = ประกาศจองไว้)
- `ticket/service.ts` เดิมล้วง `@/lib/modules/pos/service` — คงไว้ (ของเดิม) · **โค้ดใหม่ทุกไฟล์** เรียก POS ผ่าน `@/lib/modules/pos` facade

---

## B. ตาราง (เพิ่มอย่างเดียว · ต่อใบ migration)

กติการ่วม (ทุกตาราง): `tenantId` ทุกแถว (ยกเว้นแกน global) · `unitId` เมื่อเป็นของหน่วย (scope `unit`) · id ข้ามโมดูล/ข้ามไฟล์ schema = `String` หลวม ไม่มี FK (แบบ `RoomOccupancy.refId`) · สถานะเป็น `String` + `CHECK … IN (…)` SQL มือ (แบบ SVC H.0 — ไม่ใช้ enum ของ Prisma สำหรับตารางใหม่) · เงินบาท `…Satang Int` · เงินสกุลอื่น `…Minor Int` + `currency String` · CHECK `>= 0` ทุกตัวนับ/ยอด · `createdAt/updatedAt` · ทุก model ลง `src/lib/core/scope.ts` ในใบเดียวกัน · partial unique/EXCLUDE/CHECK เขียนท้าย migration (Prisma ประกาศไม่ได้ · migrate diff ไม่เสนอ DROP)

### B.1 T0.1 — migration «trips» (schema «prisma/schema/trips.prisma» + «prisma/schema/sellable.prisma»)
- `enum UnitType` + `TRIPS` (`ALTER TYPE ADD VALUE` ต่อท้าย แบบ `DORM`) — หน่วยที่ขายทัวร์/Liveaboard (L-6)

| ตาราง | scope | คอลัมน์หลัก | unique / index / CHECK |
|---|---|---|---|
| «SellBasket» | tenant | `channel` · `agentAccountId?` · `status` (`OPEN` `CHECKED_OUT` `EXPIRED` `ABANDONED`) · `expiresAt` · `publicTokenHash?` · `idempotencyKey` · `attribution Json?` | `@@unique([tenantId, idempotencyKey])` · `@@index([status, expiresAt])` |
| «TripProduct» | unit | `productType` (`TOUR` `LIVEABOARD` `ATTRACTION`) · `sourceKind` (`OWN` `SUPPLIER`) · `supplierId?` · `slug` · `status` (`DRAFT` `ACTIVE` `ARCHIVED`) · `title Json` `body Json` (`{th,en}`) · `currency` (THB เว้นแต่ LIVEABOARD) · `vesselId?` · `meetingPoint Json?` · `disclosure Json?` (ม.26 · L9) · `formSpec Json?` (ช่องผู้เดินทางต่อสินค้า L6) · `deepDive Bool` (ธงประกันคุ้มครองดำน้ำลึก · §13.1 L14) · `crossBorder Bool` (ทริปออกนอกประเทศ · ช่องสถานที่เกิด/แบบ ตม.) | `@@unique([tenantId, slug])` · `@@index([tenantId, unitId, status])` · CHECK `currency = 'THB' OR productType = 'LIVEABOARD'` |
| «TripOption» | unit | `productId` · `name Json` · `durationMin?` · `nights?` · `sortOrder` · `active` | `@@index([productId, active])` |
| «TripPaxType» | unit | `productId` · `code` (`ADULT` `CHILD` `INFANT` `SENIOR` `DIVER` `NON_DIVER` … ข้อความ) · `label Json` · `ageMin?` `ageMax?` (null = ตามค่าตั้ง `trips.pax.*`) · `countsCapacity Bool` | `@@unique([productId, code])` |
| «TripExtra» | unit | `productId?` (null = ทั้งหน่วย) · `kind` (`PARK_FEE` `PORT_FEE` `FUEL` `EQUIPMENT` `NITROX` `TRANSFER` `COURSE` `INSURANCE` `OTHER`) · `basis` (`PER_PAX` `PER_BOOKING` `PER_DAY` `PER_PAX_DAY` `PER_BOAT_NIGHT` — ค่าดำน้ำลึก 200/คน/วัน · ค่าจอดเรือค้างคืนต่อลำ §13.1 L5) · `mandatory` · `priceMinor` · `currency` · **ธง** `commissionable` `discountable` `passThrough` (นอกฐาน VAT · เงื่อนไข 4 ข้อ §13.1 L5 — ส่วนลดของผู้ให้บริการต้องคืนลูกค้า) · `evidenceFileIds String[]` (หลักฐานจ่ายแทน ต่อรอบ/การจอง — W05) · `taxKind` (`VAT7` `EXEMPT` `NONE`) · `stockItemId?` (G9) | `@@index([tenantId, unitId, productId])` · CHECK `NOT passThrough OR (NOT commissionable AND NOT discountable)` |
| «TripPickupZone» | unit | `name` · `pickupOffsetMin` · `surchargeSatang` · `polygon Json?` · `sortOrder` | `@@index([tenantId, unitId])` |
| «TripSchedule» | unit | `productId` · `optionId?` · `rule Json` (วันในสัปดาห์/ช่วงวัน) · `exceptions Json` · `departTimeMin` (นาทีจากเที่ยงคืนเวลาร้าน) · `capacity` · `minPax?` · `resourceIds String[]` · `dateFrom` `dateTo` @db.Date | `@@index([productId])` |
| «TripDeparture» | unit | `productId` · `optionId?` · `scheduleId?` · `localDate` @db.Date · `startsAt` `endsAt` (UTC) · `status` (`OPEN` `GUARANTEED` `FULL` `CLOSED` `CANCELLED`) · **ตัวนับ** `capacity` `sold` `held` `reserved` · `minPax?` · `cutoffAt?` · `vesselId?` · `deckPlanVersionId?` · `insurance Json?` (L14) · `version Int` | `@@unique([productId, optionId, startsAt])` (NULLS NOT DISTINCT) · `@@index([tenantId, unitId, localDate])` · `@@index([productId, localDate, status])` · CHECK ตัวนับ ≥ 0 (**ไม่มี** CHECK `sold+held+reserved ≤ capacity` — เงื่อนไขอยู่ในคำสั่งตัดที่ §D · ลดความจุผ่านฟังก์ชันที่คืนรายการกระทบ) |
| «TripResource» | unit | `kind` (`BOAT` `VAN` `GUIDE` `OTHER`) · `name` · `seats?` · `hrEmployeeId?` · `active` | `@@index([tenantId, unitId, kind])` |
| «TripResourceUse» | unit | `resourceId` · `departureId` · `startsAt` `endsAt` · `active` | SQL มือ: `EXCLUDE USING gist ("resourceId" WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE (active)` (มี `btree_gist` แล้วจาก svc_r0) |
| «TripSeason» | unit | `name` · `dateStart` `dateEnd` (รวมวันจบ) · `priority` · `status` | `@@index([tenantId, unitId, dateStart, dateEnd])` (แบบ `HotelSeason`) |
| «TripPrice» | unit | `productId` · `optionId?` · `paxTypeId?` · `cabinTypeId?` (Liveaboard) · `seasonId?` · `departureId?` (ราคาทับรายรอบ) · `currency` · `amountMinor` · `weekdayMask?` · `bookFrom?` `bookTo?` `travelFrom?` `travelTo?` · `priority` | unique (productId, optionId, paxTypeId, cabinTypeId, seasonId, departureId, currency) NULLS NOT DISTINCT · CHECK `amountMinor >= 0` |
| «TripPriceRule» | unit | `productId?` · `kind` (`EARLY_BIRD` `LAST_MINUTE` `GROUP_TIER` `FREE_LEADER` `BLACKOUT` `PROMO_CODE`) · `params Json` · ช่วงวันจอง/เดินทาง · `priority` · `active` | `@@index([tenantId, unitId, kind, active])` |
| «TripHold» | unit | `departureId` · `basketId?` · `bookingId?` · `channel` · `agentAccountId?` · `allotmentId?` · `qtyPublic` `qtyAllot` (รวม = ที่นั่งที่ถือ) · `unitIds String[]` (เตียง) · `requestHash` · `idempotencyKey` · `status` (`ACTIVE` `CONVERTED` `EXPIRED` `RELEASED`) · `expiresAt` · `releasedReason?` | `@@unique([tenantId, idempotencyKey])` · `@@index([status, expiresAt])` (sweeper ข้ามร้าน) · `@@index([departureId, status])` |
| «TripBooking» | unit | `code` · `publicTokenHash` (เก็บแฮช · ตัวจริงอยู่ในลิงก์เท่านั้น) · `status` §G · `productId` `departureId` (หลัก) `travelDate` · `basketId?` · `channel` · `agentAccountId?` `agentUserId?` `salesStaffId?` `linkId?` · `collectMode` (`SHOP` `AGENT`) · `bookerPartyId?` · `marketingEligible Bool` (R3) · `contactRoute` (`DIRECT` `VIA_AGENT`) · `currency` `fxRateMicros?` · ยอด (สตางค์ทั้งหมด): `grossSatang` `discountSatang` `passThroughSatang` `commissionSatang` `whtSatang` `netToShopSatang` `agentActualSaleSatang?` (ราคาที่เอเจนซี่ขายจริง · ไม่บังคับ · §13.1 L7 · A6) `paidSatang` `refundedSatang` · `holdExpiresAt?` · `policySnapshot Json` **NOT NULL** · `version Int` · `cancelReason?` `cancelledAt?` `travelledAt?` · `createdById?` | `@@unique([tenantId, code])` · `@@unique([publicTokenHash])` · `@@index([tenantId, unitId, status, travelDate])` · `@@index([departureId, status])` · `@@index([agentAccountId, createdAt])` · `@@index([bookerPartyId])` · `@@index([status, holdExpiresAt])` |
| «TripBookingItem» | unit | `bookingId` · `departureId` · `kind` (`SEAT` `BERTH` `CABIN` `EXTRA` `PICKUP` `FEE` `ADJUST`) · `paxTypeId?` `extraId?` `tripUnitId?` · `qty` · `unitPriceMinor` `amountMinor` `amountSatang` · ธง `commissionable` `discountable` `passThrough` · `taxKind` · `priceSource` (`RETAIL` `SEASON` `DEPARTURE` `TIER` `CONTRACT` `PROMO` `MANUAL`) · `active` | `@@index([bookingId])` · `@@index([departureId, active])` |
| «TripPassenger» | unit | `bookingId` · `itemId?` · `partyId?` · `fullName` · `nationality?` · `dob?` · `sex?` · `docType?` `docNumberEnc?` `docLast4?` `docExpiry?` · `diver Bool?` · `phone?` · `birthPlace?` (ทริปข้ามแดน) · `certLevel?` `diveCount?` `lastDiveAt?` (§13.1 L6) · `isMinor Bool` `guardianConsent Json?` (ผู้เยาว์ ≤ 10 ปี · §13.1 L12) · `answers Json` (ตาม `formSpec`) · `formStatus` · `waiverSignedAt?` `waiverEvidence Json?` (L11: ช่องทางยืนยัน · เวลา · แฮชข้อความ · เวอร์ชัน) · `checkinAt?` · `retainUntil?` | `@@index([bookingId])` · `@@index([retainUntil])` |
| «TripPaymentDue» | unit | `bookingId` · `seq` · `kind` (`DEPOSIT` `BALANCE` `INSTALMENT` `PASSENGER_SHARE`) · `passengerId?` (L1.8) · `dueAt` · `amountSatang` `amountMinor?` · `paidSatang` · `status` (`OPEN` `PAID` `OVERDUE` `WAIVED` `CANCELLED`) · `receiptSaleId?` · `payToken?Hash` | `@@unique([bookingId, seq])` · `@@index([status, dueAt])` |
| «TripMoneyEvent» | unit | ต่อท้ายอย่างเดียว: `bookingId` · `kind` (`RECEIVED` `REFUNDED` `FORFEITED` `CREDIT_ISSUED` `CLOSE_BILLED` `FEE_BILLED`) · `amountSatang` · `dueId?` · `posSaleId?` `accountDocId?` `slipId?` · `whtByCustomerSatang?` (ลูกค้านิติบุคคลหัก ณ ที่จ่ายร้าน · §13.1 L4 · T41) · `idempotencyKey` | `@@unique([tenantId, idempotencyKey])` · `@@index([bookingId])` |
| «TripRefundRequest» | unit | `bookingId` · `by` (`CUSTOMER` `AGENT` `STAFF` `SYSTEM`) · `reasonKind` (`CUSTOMER` `SHOP_EXTERNAL` `MIN_PAX` `SHOP_FAULT` · §13.1 L8) · `deductions Json` (รายการค่าใช้จ่ายจริง {หมวด ยอด fileIds} · T24 · W04) · `status` §G.3 · `computed Json` (จาก snapshot) · `choice` (`REFUND` `CREDIT` `MOVE`) · `amountSatang` · `approvalId?` · `posRefundSaleId?` `creditNoteDocId?` `storeCreditId?` · `decidedById?` | `@@index([tenantId, unitId, status])` |
| «TripDocument» | unit | `passengerId` · `kind` (`PASSPORT` `MEDICAL` `WAIVER` `CERT` `PARK_TICKET` `INSURANCE`) · `fileId` (FileAsset private) · `consent Json?` · `retainUntil` · `deletedAt?` | `@@index([retainUntil, deletedAt])` |
| «TripDocView» | unit | ต่อท้ายอย่างเดียว: `documentId` · `viewerKind` (`STAFF` `AGENT` `CUSTOMER`) · `viewerId` · `purpose` · `at` | `@@index([documentId, at])` |
| «TripPdpaRequest» | unit | คำขอของเจ้าของข้อมูล (ลบ/เข้าถึง/แก้): `passengerId?` `partyId?` · `kind` · `status` · `dueAt` (จาก `trips.pdpa.requestDeadlines` T64 · ลบ ≤ 90 วัน §13.1 L13) · `doneAt?` | `@@index([tenantId, status, dueAt])` |
| «TripCheckin» | unit | `passengerId` · `deviceId` · `scannedAt` (เวลาเครื่อง) · `receivedAt` · `result` (`FIRST` `DUPLICATE`) | `@@unique([passengerId, result])` WHERE `result='FIRST'` (partial) |
| «TripWaitlist» | unit | `departureId` · `partyId?` · `qty` · `status` · `offerHoldId?` · `offerExpiresAt?` | `@@index([departureId, status])` |
| «TripCost» | unit | `departureId` · `kind` · `amountSatang` · `note?` | `@@index([departureId])` |
| «TripUnit» | unit | ต่อรอบ × เตียง (Liveaboard · L1.4 เติม): `departureId` · `berthId` · `cabinId` · `sortKey` · `status` (`FREE` `HELD` `SOLD` `BLOCKED` `ALLOTTED`) · `holdId?` `bookingItemId?` `allotmentId?` · `version` | `@@unique([departureId, berthId])` · `@@index([departureId, status])` |
| «TripsCounter» | tenant | `series` (`TR` `LB` `TK` `ST` `CR` …) · `period` (`"6911"`) · `seq` | `@@unique([tenantId, series, period])` |

### B.2 A1.1 — migration «agency» (schema «prisma/schema/agency.prisma»)
| ตาราง | scope | คอลัมน์หลัก | unique / index |
|---|---|---|---|
| «AgentIdentity» | **global** (ไม่มี tenantId) | `kind` (`COMPANY` `PERSON`) · `legalName` · `taxId?` `branchCode?` · `country` · `payeeType` (`TH_JURISTIC` `TH_PERSON` `FOREIGN`) · `treaty Bool?` · `licenceNo?` `licenceExpiry?` (ไม่บังคับ · รอบ 3) | `@@index([taxId])` — **ไม่ unique** (รวมตัวตนซ้ำ = เฟส 2) |
| «AgentIdentityUser» | global | `identityId` · `userId` (`User` แพลตฟอร์ม) · `role` (`OWNER` `SALES` `ACCOUNTING`) · `active` | `@@unique([identityId, userId])` |
| «AgentTier» | tenant | `code` (`A` `B` `C` …) · `name` · `sortOrder` | `@@unique([tenantId, code])` |
| «AgentAccount» | tenant | `identityId` · `code` (PTD) · `status` (`PENDING` `ACTIVE` `SUSPENDED` `CLOSED`) · `tierId?` · `partyId` · `crmCompanyId?` · `accountContactId?` · `unitIds String[]` ([] = ทุกหน่วย) · `approvedById?` `approvedAt?` — **ไม่มีคอลัมน์เงื่อนไขการค้า** (อยู่ในค่าตั้งชั้น AGENT · TC3) | `@@unique([tenantId, code])` · `@@unique([tenantId, identityId])` |
| «AgentUser» | tenant | `agentAccountId` · `identityUserId` · `role` · `active` (สิทธิ์ของผู้ใช้เอเจนซี่ "ในร้านนี้") | `@@unique([agentAccountId, identityUserId])` |
| «AgentContract» | tenant | `agentAccountId` · `version` · `validFrom` `validTo?` · `fileId?` · `signedAt?` `signEvidence Json?` · `termsSnapshot Json` (ค่าตั้งชั้น AGENT ที่ resolve ตอนเซ็น) | `@@unique([agentAccountId, version])` |
| «AgentRateCard» | tenant | `ownerKind` (`TIER` `AGENT`) · `tierId?` `agentAccountId?` · `name` · `status` · `validFrom?` `validTo?` · `version` | `@@index([tenantId, ownerKind])` · CHECK มีเจ้าของ 1 ชนิด |
| «AgentRate» | tenant | `rateCardId` · `productKind` (ตรวจกับ `PRODUCT_KINDS`) · `productId` · `optionId?` `paxTypeId?` `cabinTypeId?` · `mode` (`COMMISSION_PCT` `COMMISSION_FIXED` `NET` `MARKUP`) · `valueBp?` `valueMinor?` `currency` · `minSellMinor?` · `markupCapBp?` · ช่วงจอง/เดินทาง · `priority` | unique (rateCardId, productKind, productId, optionId, paxTypeId, cabinTypeId, bookFrom, travelFrom) NULLS NOT DISTINCT · `@@index([tenantId, productKind, productId])` |
| «AgentAllotment» | tenant | `agentAccountId` · `productKind` · `slotId` (TripDeparture.id / TicketSession.id) · `qty` `used` `held` · `releaseAt?` (คำนวณจากค่าตั้งตอนสร้าง) · `releasedAt?` `releasedQty?` · `blockId?` (ชุดทั้งฤดู) | `@@unique([agentAccountId, productKind, slotId])` · `@@index([releasedAt, releaseAt])` · CHECK `used + held <= qty` |
| «AgentRequest» | tenant | `agentAccountId` · `kind` (`BOOKING` `PRICE_OVERRIDE` `CREDIT_INCREASE` `ALLOTMENT`) · `payload Json` · `holdId?` · `status` · `expiresAt` · `approvalId?` | `@@index([tenantId, status, expiresAt])` |
| «AgentLedgerEntry» | tenant | ต่อท้ายอย่างเดียว §I: `agentAccountId` · `seq` · `kind` · `amountSatang` (มีเครื่องหมาย) · `currency` · `bookingKind?` `bookingId?` · `statementId?` · `commissionId?` · `entitledAt?` `settledAt?` `dueAt?` · `refEntryId?` · `idempotencyKey` · `actorId` | `@@unique([agentAccountId, seq])` · `@@unique([tenantId, idempotencyKey])` · `@@index([agentAccountId, statementId])` · trigger SQL มือ: ปฏิเสธ UPDATE/DELETE (ยกเว้นตั้ง `statementId` จาก null ครั้งเดียว) |
| «AgentBalance» | tenant | PK `agentAccountId` · `currency` · `balanceSatang` · `lastSeq` · `version` | หัวสมุด (แถวที่ล็อก) |
| «AgentStatement» | tenant | `agentAccountId` · `code` (ST-…) · `periodKey` · `periodFrom` `periodTo` · `status` (`DRAFT` `ISSUED` `PARTIAL` `PAID` `VOID`) · ยอดสรุป · `accountDocId?` · `dueAt` | `@@unique([agentAccountId, periodKey])` · `@@unique([tenantId, code])` |
| «AgentCommission» | tenant | `agentAccountId` · `bookingKind` `bookingId` · `baseSatang` `rateBp?` `commissionSatang` · `vatSatang` · `whtRateBp` `whtSatang` · `currency` `fxRateMicros?` · `status` (`PENDING` `EARNED` `SETTLED` `CLAWED_BACK` `VOID`) · `earnedAt?` `settledAt?` · `settleMode` (`PAYOUT` `NETTED`) · `runId?` · `whtCertDocId?` | `@@unique([bookingKind, bookingId, agentAccountId])` · `@@index([agentAccountId, status, earnedAt])` |
| «AgentCommissionRun» | tenant | `code` · `cutoffAt` · `status` · ยอดรวม · `paidAt?` | `@@unique([tenantId, code])` |
| «AgentLink» | tenant | `agentAccountId` · `code` (ใน `?a=`) · `salesUserId?` · `productId?` · `active` | `@@unique([tenantId, code])` |
| «AgentApiKey» | tenant | `agentAccountId` · `keyHash` · `last4` · `scopes String[]` · `revokedAt?` | `@@unique([keyHash])` |
| **ผู้ให้บริการ** (ใส่ใน migration นี้ — แผนไม่มีใบ migration ของ S · L-25) | | | |
| «Supplier» | tenant | `partyId` · `accountContactId?` · `linkedTenantId?` (S1.5 · ร้านที่ใช้ SHARK) · `payeeType` · `status` | `@@index([tenantId, status])` |
| «SupplierCost» | unit | `supplierId` · `productId` (TripProduct sourceKind SUPPLIER) · `optionId?` `paxTypeId?` · `mode` (`NET` `PCT_OF_RETAIL`) · `valueMinor?` `valueBp?` · `currency` · ช่วงวัน | unique (supplierId, productId, optionId, paxTypeId, travelFrom) NULLS NOT DISTINCT |
| «SupplierRequest» | unit | `bookingId` · `supplierId` · `channel` (`EMAIL` `LINE` `LINK` `PEER`) · `status` §G.2 · `responseTokenHash` · `sentAt?` `respondBy` `respondedAt?` · `confirmationRef?` · `attempts` | `@@index([status, respondBy])` · `@@unique([responseTokenHash])` |
| «SupplierPayable» | unit | `supplierId` · `bookingId` · `amountSatang` · `dueAt` · `status` (`ACCRUED` `BILLED` `PAID` `VOID`) · `accountDocId?` · `idempotencyKey` | `@@unique([tenantId, idempotencyKey])` · `@@index([supplierId, status, dueAt])` |
| «GroupQuoteRequest» | unit | (S1.6) `productId` · `requester Json` · `status` · `crmDealId?` · `quotationDocId?` · `bookingId?` · `contractFileId?` | `@@index([tenantId, status])` |

### B.3 K1.1 — migration «ticket v2» (เพิ่มใน `prisma/schema/ticket.prisma` · ตาราง `Ticket*` เดิมคงชื่อ · enum เดิมคง)
| ตาราง/คอลัมน์ | คอลัมน์หลัก | unique / index |
|---|---|---|
| «TicketSession» | `eventId` · `startsAt` `endsAt?` · `localDate` · `status` (`OPEN` `CLOSED` `CANCELLED`) · ตัวนับ `capacity` `sold` `held` `reserved` · `cutoffAt?` · `version` | `@@unique([eventId, startsAt])` · `@@index([tenantId, unitId, localDate])` |
| «TicketChannelQuota» | `sessionId` · `ticketTypeId?` (null = ทุกประเภท) · `channel` (`"*"` = ทุกช่องทาง) · `quota` `sold` `held` | unique (sessionId, ticketTypeId, channel) NULLS NOT DISTINCT · แถว `(type, "*")` = **โควตาต่อประเภทของรอบ** (แทน `TicketType.quota/sold` ระดับอีเวนต์ · L-12) |
| «TicketBatch» | `agentAccountId` · `ticketTypeId` · `sessionId?` · `qty` `issued` `returned` · `consignment Bool` · `returnBy?` · `status` | `@@index([tenantId, agentAccountId])` |
| «TicketHold» | แบบ `TripHold` (`sessionId` · `lines Json` · `idempotencyKey` · `expiresAt` · `status`) | `@@unique([tenantId, idempotencyKey])` · `@@index([status, expiresAt])` |
| «TicketScan» | `admissionId` · `gateId` · `deviceId` · `scannedAt` · `receivedAt` · `result` (`FIRST` `REENTRY` `DUPLICATE` `INVALID`) | `@@index([admissionId, scannedAt])` |
| `TicketOrder` + | `sessionId?` · `agentAccountId?` · `batchId?` · `holdId?` · `basketId?` · `policySnapshot Json?` (null = ออเดอร์เก่า) · `publicTokenHash?` · `code?` (เลขใหม่ §K — `orderNo` เดิมคง) · `currency` default THB | `@@index([sessionId, status])` |
| `TicketAdmission` + | `sessionId?` · `validFrom?` `validTo?` (ตั๋วไม่ระบุวัน) · `maxEntries Int @default(1)` · `entries Int @default(0)` · `holderName?` · `transferredFromId?` · `batchId?` | `@@index([sessionId, status])` |
- backfill (ใน migration · idempotent): ทุก `TicketEvent` → `TicketSession` 1 แถว (`startsAt = event.startAt` · `capacity = Σ type.quota` · `sold = Σ type.sold`) + `TicketChannelQuota(type, "*")` ต่อประเภท (`quota = type.quota` · `sold = type.sold`) · `TicketOrder.sessionId`/`TicketAdmission.sessionId` = รอบนั้น · `TicketType.quota/sold` **หยุดเป็นตัวนับจริงหลัง K1.1** (คงคอลัมน์ · อ่านเพื่อแสดงผลเดิม)

### B.4 L1.1 — migration «liveaboard» (schema «prisma/schema/liveaboard.prisma»)
| ตาราง | คอลัมน์หลัก | unique / index |
|---|---|---|
| «Vessel» | unit · `name` `code` · `lengthM?` · `maxGuests` · `licenceCapacity?` · `status` · `photos Json` | `@@unique([unitId, code])` |
| «VesselDeckPlanVersion» | `vesselId` · `version` · `status` (`DRAFT` `PUBLISHED` `RETIRED`) · `effectiveFrom` @db.Date · `publishedAt?` `publishedById?` · `impactReport Json?` | `@@unique([vesselId, version])` |
| «VesselDeck» | `versionId` · `name` · `sortOrder` · `areas Json` (ลานดำน้ำ/ห้องอาหาร — ป้าย ไม่ขาย) · `backgroundFileId?` | `@@index([versionId])` |
| «VesselCabinType» | unit · `name Json` · `description Json?` · `basePriceMinor?` `currency` | `@@index([tenantId, unitId])` |
| «VesselCabin» | `versionId` · `deckId` · `code` (M1 D1…) · `cabinTypeId` · `layout Json` `{x,y,w,h}` · `bedType` · `ensuite` · `sellPerBerth` · `photos Json` | `@@unique([versionId, code])` |
| «VesselBerth» | `cabinId` · `code` · `sortKey` · `bedKind` · `sellable` | `@@unique([cabinId, code])` |
| «CabinAssignment» | ต่อรอบ: `departureId` · `tripUnitId` · `passengerId` · `assignedById` · `active` | partial unique (tripUnitId) WHERE active · `@@index([departureId])` |
- รอบ Liveaboard จด `TripDeparture.deckPlanVersionId` ตอนสร้าง · `TripUnit` ของรอบสร้างจากเตียง `sellable` ของเวอร์ชันนั้น · ชื่อ/รูป/คำบรรยายเปลี่ยนได้ทันที (TA §11) · เผยแพร่เวอร์ชันใหม่ = ตัวตรวจผลกระทบคืนรายการจองที่ทับเตียงที่ถูกลบ/ลด → บันทึกไม่ได้จนย้ายเคบิน (นี่ไม่ใช่การบล็อกกฎหมาย — เป็นความถูกต้องของข้อมูล)

---

## C. หน้าสัมผัส "ของที่ขายได้" — «src/lib/core/sellable.ts»

```ts
// ── ทะเบียน (ข้อความตรวจกับทะเบียน · เพิ่มชนิดไม่ต้อง migrate) ──
export const PRODUCT_KINDS = ["TRIP", "TICKET", "HOTEL"] as const;       // ลำดับนี้ = ลำดับล็อกข้ามชนิด (§D.5)
export type ProductKind = (typeof PRODUCT_KINDS)[number];
export const SELL_CHANNELS = ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "OTA", "API", "IMPORT", "CHAT_AI"] as const;
export type SellChannel = (typeof SELL_CHANNELS)[number];

export type SellActor =
  | { kind: "STAFF"; userId: string }                               // สิทธิ์ตรวจที่ action ก่อนเรียก (assertCan)
  | { kind: "AGENT"; agentAccountId: string; agentUserId: string }  // จาก session พอร์ทัล/คีย์ API
  | { kind: "PUBLIC"; clientKey: string }                           // แฮช IP+UA ใช้กับ rate limit เท่านั้น
  | { kind: "SYSTEM"; job: string };
export type SellCtx = { tenantId: string; unitId: string; channel: SellChannel; actor: SellActor; now?: Date; locale?: "th" | "en" };
export type Attribution = { agentCode?: string; staffCode?: string; linkId?: string; source?: string };

export type PaxQty = { paxTypeId: string; qty: number };
export type LineRequest = {
  productKind: ProductKind;
  productId: string;           // TripProduct.id | TicketEvent.id
  slotId: string;              // TripDeparture.id | TicketSession.id
  optionId?: string;
  pax: PaxQty[];               // ตั๋ว: paxTypeId = TicketType.id
  unitIds?: string[];          // TripUnit.id (เตียง) — Liveaboard เท่านั้น
  wholeCabinIds?: string[];    // เหมาเคบิน
  extras?: { extraId: string; qty: number }[];
  pickupZoneId?: string;
  promoCode?: string;
  currency?: string;           // ไม่ใช่ THB ได้เฉพาะ productType LIVEABOARD (CURRENCY_NOT_ALLOWED)
};
export type QuoteRequest = { lines: LineRequest[]; attribution?: Attribution; agentDiscountSatang?: number /* Q12 · เพดานจากค่าตั้ง */ };

export type Money = { satang: number; minor?: number; currency: string };
export type QuoteLine = {
  ref: string;                 // ดัชนีบรรทัดคำขอ
  items: { kind: string; label: string; qty: number; unit: Money; amount: Money;
           commissionable: boolean; discountable: boolean; passThrough: boolean; taxKind: "VAT7" | "EXEMPT" | "NONE";
           priceSource: string }[];
  available: { publicLeft: number; agentLeft?: number };
  cutoffAt?: string;
};
export type Quote = {
  quoteId: string;             // = priceFingerprint (แฮชของคำขอ + ราคา + เวอร์ชันข้อมูล) — ไม่มีแถวในฐาน
  lines: QuoteLine[];
  totals: { gross: Money; discount: Money; passThrough: Money; payable: Money };
  agent?: { collectFromCustomer: Money; remitToShop: Money; agentEarns: Money; whtGrossUp: Money; creditLeftSatang: number | null }; // §9.2 ข้อ 7
  cancelLadder: CancelStep[]; paymentSchedule: DueSpec[]; holdMinutes: number;
  fx?: { rateMicros: number; at: string } | null;
  warnings: { code: string; messageTh: string }[];     // WARN จากตัวตรวจ (L10 ราคาต่ำกว่าทุน ฯลฯ) — ไม่บล็อก
  expiresAt: string;
};
export type CancelStep = { daysBefore: number; refundBp: number };      // เรียงมาก→น้อย
export type DueSpec = { seq: number; kind: string; amount: Money; dueAt: string; passengerRef?: string };

export type HoldRequest = { quote: QuoteRequest; quoteId: string; basketId?: string; idempotencyKey: string; holdMinutes?: number };
export type Hold = { holdIds: string[]; basketId: string | null; expiresAt: string };
export type Booker = { name: string; phone?: string; email?: string; lineUserId?: string; partyId?: string; marketingConsent?: boolean };
export type ConfirmRequest = {
  holdIds: string[]; idempotencyKey: string; quoteId: string;
  booker: Booker; passengers?: { name: string; paxTypeId: string; fields?: Record<string, unknown> }[];
  pay: { mode: "PAY_NOW" | "PAY_LATER" | "AGENT_CREDIT" | "AGENT_WALLET" | "AGENT_COLLECTS"; method?: "PROMPTPAY" | "CARD" | "SLIP" | "CASH" };
  note?: string;
};
export type BookingRef = { productKind: ProductKind; bookingId: string; code: string; status: string; publicToken: string; dues: DueSpec[] };
export type CancelRequest = { bookingId: string; mode: "QUOTE" | "EXECUTE"; reason: string; choice?: "REFUND" | "CREDIT" | "MOVE"; moveToSlotId?: string; idempotencyKey: string };
export type CancelResult = { computed: { refundSatang: number; feeSatang: number; ladderStep: CancelStep | null; source: "SNAPSHOT" }; requestId?: string; status?: string };
export type AvailabilityQuery = { productId: string; from: string; to: string; optionId?: string; paxTotal?: number };
export type AvailabilityRow = { slotId: string; startsAt: string; localDate: string; status: string; publicLeft: number; agentLeft?: number; priceFrom?: Money; belowMin?: boolean };

export type SellResult<T> = { ok: true; value: T } | { ok: false; code: SellErrorCode; messageTh: string; retryable: boolean; details?: Record<string, unknown> };
export const SELL_ERROR_CODES = [
  "VALIDATION", "NOT_FOUND", "FORBIDDEN", "KIND_NOT_SUPPORTED", "CURRENCY_NOT_ALLOWED",
  "SOLD_OUT", "INSUFFICIENT_ALLOTMENT", "BERTH_TAKEN", "SLOT_CLOSED", "CUTOFF_PASSED",
  "PRICE_CHANGED", "BELOW_MIN_SELL_PRICE", "DISCOUNT_OVER_CAP",
  "HOLD_EXPIRED", "HOLD_NOT_FOUND", "HOLD_LIMIT",
  "AGENT_SUSPENDED", "CREDIT_LIMIT", "REQUIRES_APPROVAL",
  "IDEMPOTENCY_CONFLICT", "RATE_LIMITED", "BUSY", "STATE_CONFLICT",
] as const;
export type SellErrorCode = (typeof SELL_ERROR_CODES)[number];

export interface Sellable {
  kind: ProductKind;
  availability(ctx: SellCtx, q: AvailabilityQuery): Promise<SellResult<AvailabilityRow[]>>;
  quote(ctx: SellCtx, req: QuoteRequest): Promise<SellResult<Quote>>;
  hold(ctx: SellCtx, req: HoldRequest): Promise<SellResult<Hold>>;
  confirm(ctx: SellCtx, req: ConfirmRequest): Promise<SellResult<BookingRef[]>>;
  cancel(ctx: SellCtx, req: CancelRequest): Promise<SellResult<CancelResult>>;
  // ใช้โดย platform/basket.ts เท่านั้น — ทำงานใน tx ของผู้เรียก ไม่ commit เอง
  holdInTx(tx: unknown, ctx: SellCtx, req: HoldRequest & { basketId: string }): Promise<SellResult<Hold>>;
  confirmInTx(tx: unknown, ctx: SellCtx, req: ConfirmRequest & { basketId: string }): Promise<SellResult<BookingRef[]>>;
}
export function requestHash(req: unknown): string;   // canonical JSON → sha256 (บริสุทธิ์ · ใช้ node:crypto ไม่ได้ใน client ⇒ ส่วนแฮชอยู่ server-side wrapper)
```

**กติกา**
1. หน้าจอง · พอร์ทัล · ช่องทาง · API · แชท AI เรียก **ผ่าน `sellableFor(kind)` หรือ `basket.*` เท่านั้น** (ข้อสอบไล่ import: `src/app/book/**` `src/app/agent/**` `src/app/api/v1/{trips,ticket,agency}/**` ไม่ import `trips/booking` `ticket/service` ตรง)
2. `quote()` ไม่เขียนฐาน · `quoteId` = fingerprint · `hold()`/`confirm()` คำนวณใหม่ทุกครั้ง ถ้า fingerprint ไม่ตรง ⇒ `PRICE_CHANGED` พร้อม quote ใหม่ใน `details` (ไม่เดินต่อเงียบ ๆ)
3. **กันซ้ำ**: `hold`/`confirm`/`cancel(EXECUTE)` บังคับ `idempotencyKey` `[A-Za-z0-9_-]{8,100}` · เก็บที่ `TripHold.idempotencyKey` / `SellBasket.idempotencyKey` / `TripRefundRequest` (คีย์ `cancel:<bookingId>:<key>`) คู่กับ `requestHash` · คีย์เดิม+แฮชเดิม = คืนผลเดิม (`duplicated`) · คีย์เดิม+แฮชต่าง = `IDEMPOTENCY_CONFLICT` · namespace: ผู้เรียกสาธารณะ `pub:<clientKey>:<key>` · เอเจนซี่ `ag:<agentAccountId>:<key>` · พนักงาน `st:<userId>:<key>` (กันชนข้ามผู้เรียก)
4. **ตะกร้าหลายชนิด (G24)**: ทุก `confirm` เกิดในตะกร้าเสมอ (ตะกร้าชนิดเดียว = กรณีปกติของรุ่นแรก) · `basketConfirm` เปิด tx เดียว → ล็อก `SellBasket` → เรียก `confirmInTx` ตามลำดับ `PRODUCT_KINDS` · ชนิดใดล้ม = rollback ทั้งตะกร้า · เงินของตะกร้ารวมงวดตามบรรทัดของแต่ละการจอง (การจองแยกแถวต่อชนิด · ผูกด้วย `basketId`) · UI รุ่นแรกส่งชนิดเดียว แต่ข้อสอบ T0.6 ต้องมีตะกร้า TRIP+TICKET 1 ข้อ (หลัง K1.1)
5. ผลปฏิเสธคืนเป็นข้อมูล (ไม่ throw) · ข้อผิดพลาดไม่คาดคิด = throw (ชั้น API แปลงเป็น 500) · `messageTh` ไม่มีข้อมูลการจองของคนอื่น
6. `availability.publicLeft` = เลขจริงเสมอ (R2 · ห้ามปั้น) · หน้าจองตัดสินเองว่าจะแสดง "เหลือ N" เมื่อ N ≤ ค่าตั้ง «trips.public.showLeftAtOrBelow»
7. `HOTEL` อยู่ในทะเบียนเพื่อให้ `AgentRate.productKind` และตะกร้ารองรับในอนาคต · `sellableFor("HOTEL")` = `KIND_NOT_SUPPORTED` จนมีใบต่อ (เฟส 2)

---

## D. ความจุ ที่ว่าง และการล็อก — เจ้าของ T0.4 (trips) · A1.4 (โควตา) · L1.4 (เตียง) · K1.1 (ตั๋ว)

### D.1 ตัวนับรอบ (ทัวร์/ตั๋ว) — ทุกคำสั่งคือ "UPDATE เดียวมีเงื่อนไข" (`reference_atomic_counter_single_statement`)
```sql
-- (1) ถือที่จากที่ว่างสาธารณะ
UPDATE "TripDeparture"
   SET "held" = "held" + $n, "version" = "version" + 1, "updatedAt" = now()
 WHERE "id" = $slot AND "tenantId" = $tenant
   AND "status" IN ('OPEN','GUARANTEED')
   AND ("cutoffAt" IS NULL OR "cutoffAt" > $now)
   AND "sold" + "held" + "reserved" + $n <= "capacity"
RETURNING "capacity" - "sold" - "held" - "reserved" AS "publicLeft", "version";
-- 0 แถว ⇒ อ่านแถวเพื่อแยกเหตุ: SLOT_CLOSED / CUTOFF_PASSED / SOLD_OUT (อ่านหลังล้มเท่านั้น ไม่ใช่ก่อนตัด)

-- (2) ถือจากโควตาเอเจนซี่ (2 คำสั่งตามลำดับ · tx เดียว · คำสั่งที่ 2 ได้ 0 แถว ⇒ throw ⇒ rollback ทั้งก้อน)
UPDATE "TripDeparture" SET "held" = "held" + $n, "reserved" = "reserved" - $n, "version" = "version" + 1
 WHERE "id" = $slot AND "tenantId" = $tenant AND "status" IN ('OPEN','GUARANTEED') AND "reserved" >= $n
   AND ("cutoffAt" IS NULL OR "cutoffAt" > $now) RETURNING "version";
UPDATE "AgentAllotment" SET "held" = "held" + $n
 WHERE "id" = $allot AND "agentAccountId" = $agent AND "releasedAt" IS NULL AND "used" + "held" + $n <= "qty"
RETURNING "qty" - "used" - "held" AS "allotLeft";
-- ขอเกินโควตาและสัญญาเปิดขายอิสระ (ค่าตั้ง agency.quota.freeSale A20) ⇒ แบ่ง n = nAllot + nPublic เรียก (2) แล้ว (1)

-- (3) ถือ → ขาย (confirm หลังเงิน/ร้านยืนยัน)
UPDATE "TripDeparture" SET "held" = "held" - $n, "sold" = "sold" + $n, "version" = "version" + 1
 WHERE "id" = $slot AND "held" >= $n RETURNING "sold";
UPDATE "AgentAllotment" SET "held" = "held" - $nAllot, "used" = "used" + $nAllot WHERE "id" = $allot AND "held" >= $nAllot;

-- (4) ปล่อยที่ถือ (หมดเวลา/ยกเลิกก่อนขาย) · โควตายังไม่คืน ⇒ ที่กลับเข้าโควตา (reserved) · คืนแล้ว ⇒ กลับเข้าสาธารณะ
UPDATE "TripDeparture" SET "held" = "held" - $n, "reserved" = "reserved" + $nBackToAllot WHERE "id" = $slot AND "held" >= $n;
UPDATE "AgentAllotment" SET "held" = "held" - $nAllot WHERE "id" = $allot AND "held" >= $nAllot;

-- (5) ยกเลิกหลังขาย: sold - n (+ reserved + n ถ้าโควตายังไม่คืน และค่าตั้ง agency.quota.returnCancelledToQuota (ใหม่)) · allotment.used - n

-- (6) คืนโควตาตามวัน (minute job) — ล็อกรอบก่อน แล้วโควตา
SELECT 1 FROM "TripDeparture" WHERE "id" = $slot FOR UPDATE;
UPDATE "AgentAllotment" SET "releasedAt" = $now, "releasedQty" = "qty" - "used" - "held"
 WHERE "id" = $allot AND "releasedAt" IS NULL AND "releaseAt" <= $now RETURNING "releasedQty";
UPDATE "TripDeparture" SET "reserved" = "reserved" - $releasedQty WHERE "id" = $slot AND "reserved" >= $releasedQty;

-- (7) สร้าง/เพิ่มโควตา: UPDATE รอบ reserved + q WHERE sold+held+reserved+q <= capacity (คำสั่งเดียว) แล้ว INSERT/UPDATE AgentAllotment
-- (8) ลดความจุ: UPDATE capacity = $new WHERE sold+held+reserved <= $new · 0 แถว ⇒ คืนรายการจอง/โควตาที่กระทบให้ร้านตัดสิน
```
- ตั๋ว (K1.1) ใช้รูปเดียวกันบน `TicketSession` (ยอดรวม) แล้ว `TicketChannelQuota` ตามลำดับ (`type,"*"`) → (`type,channel`) → (`null,channel`) — แต่ละแถวคำสั่งเดียว เรียงตามลำดับนี้เสมอ · แถวที่ไม่มี = ไม่จำกัดชั้นนั้น
- `createOrder` เดิมของตั๋ว (`ticket/service.ts:241` updateMany บน `TicketType.sold`) ย้ายไปตัดที่ผ่าน «quota.ts» ในใบ K1.1 (ออเดอร์ทุกทางต้องผ่านตัวนับรอบ — L-12)

### D.2 Liveaboard: แถวต่อเตียง + ล็อกแถว (L1.4)
```sql
-- ใน tx เดียว หลังคำสั่ง (1)/(2) บนแถวรอบ (ลำดับ §D.5)
SELECT "id","status","allotmentId" FROM "TripUnit"
 WHERE "departureId" = $slot AND "id" = ANY($unitIds) ORDER BY "sortKey","id" FOR UPDATE;
UPDATE "TripUnit" SET "status" = 'HELD', "holdId" = $hold, "version" = "version" + 1
 WHERE "departureId" = $slot AND "id" = ANY($unitIds)
   AND ("status" = 'FREE' OR ("status" = 'ALLOTTED' AND "allotmentId" = $allot))
RETURNING "id";
-- จำนวนแถวที่คืน ≠ จำนวนที่ขอ ⇒ throw BERTH_TAKEN ⇒ rollback (ตัวนับรอบกลับด้วย)
```
- ตัวนับ `capacity/sold/held/reserved` ของรอบ Liveaboard ยังเดินคู่กัน (capacity = จำนวนเตียง sellable ที่ไม่ BLOCKED) ⇒ ปฏิทิน/ที่ว่าง/ช่องทางใช้สูตรเดียวทุกชนิด
- ถือเคบินหลายวัน = `TripHold.expiresAt` ยาวตามค่าตั้ง `agency.hold.duration` (A16 · ชั้น AGENT_TIER/AGENT/PRODUCT) สำหรับเอเจนซี่ · ลูกค้าตรงใช้ `trips.sell.holdMinutes` (T5) · ต่ออายุ = UPDATE `expiresAt` ของ hold ที่ `ACTIVE` เท่านั้น ถ้าค่าตั้งยอม
- แชร์ห้องตามเพศ (R6): ตรวจตอนจัด `CabinAssignment` ตามค่าตั้ง `trips.pax.cabinSharing` (T31 · ชั้น VESSEL/DEPARTURE) · "ไม่ระบุ" → คิวร้านยืนยัน (ไม่ปฏิเสธการจอง)
- ปิดเคบินต่อทริป = `TripUnit.status = 'BLOCKED'` + `capacity - k` คำสั่งเดียวแบบ (8)

### D.3 สูตรที่ว่าง (R2)
- **สาธารณะ** `publicLeft = capacity − sold − held − reserved` โดย `reserved = Σ (qty − used − held)` ของ `AgentAllotment` ที่ `releasedAt IS NULL` ของรอบนั้น (คงไว้ด้วยคำสั่ง §D.1 ทุกครั้งที่โควตาเปลี่ยน)
- **เอเจนซี่** `agentLeft = allotLeft(agent) + (freeSale ? publicLeft : 0)` · `freeSale` = ค่าตั้ง `agency.quota.freeSale` ชั้น AGENT
- **Liveaboard ต่อเคบิน** = นับ `TripUnit` ตามสถานะ (ผังเรือแสดงรูปทรงตามสถานะ · TA §9.2 ข้อ 6)
- ข้อสอบคงที่ (ทุกใบที่แตะตัวนับ): `sold = Σ qty ของ TripBookingItem(SEAT/BERTH, active)` ของการจองสถานะขายแล้ว · `held = Σ qtyPublic+qtyAllot ของ TripHold ACTIVE` · `reserved = Σ คงเหลือโควตาไม่คืน` · ยิงพร้อมกัน 50 คำขอ ขายเกินไม่ได้ (MP §5 ข้อ ก)

### D.4 ตัวกวาดที่ถือหมดเวลา (T0.4 · minute job `trips.expireHolds` ทุก 1 นาที · K1.1 เพิ่ม `ticket.expireHolds`)
1. อ่านรายการครบกำหนด **โดยไม่ล็อก**: `SELECT id, departureId FROM "TripHold" WHERE status='ACTIVE' AND "expiresAt" <= $now ORDER BY "departureId","expiresAt" LIMIT 200`
2. ต่อรอบ (tx ละรอบ · กลุ่มตาม departureId): `SELECT … FROM "TripDeparture" WHERE id=$slot FOR UPDATE` → CAS hold `UPDATE "TripHold" SET status='EXPIRED' WHERE id = ANY($ids) AND status='ACTIVE' AND "expiresAt" <= $now RETURNING …` → คืนตัวนับตามแถวที่ CAS ได้จริง (§D.1 ข้อ 4) → `TripUnit` กลับ `FREE`/`ALLOTTED` → การจองสถานะ `HOLD` ที่ผูก → `EXPIRED` (CAS) → outbox `trips.hold.expired` / `trips.booking.expired` ใน tx เดียว
3. ลำดับนี้ = ลำดับล็อกเดียวกับ confirm (รอบก่อน hold) ⇒ ไม่มี deadlock · เรียกซ้อน = CAS ตัดสิน (X5) · ไม่ใช้ `FOR UPDATE SKIP LOCKED` บน hold ก่อนรอบ (จะกลับลำดับ)
4. รับเงินหลังหมดเวลา (W1.4 · ภาพ 07): consumer สลิปเห็นการจอง `EXPIRED` → ลองถือใหม่ (§D.1 ข้อ 1) · ได้ = ยืนยันต่อ · ไม่ได้ = คืนเงินอัตโนมัติ + event `trips.booking.paid_after_expiry` (แบบ `hotel.booking.deposit_after_expiry`)

### D.5 ลำดับล็อกทั่วระบบ (ห้ามสลับ · ทุกใบที่เปิด tx ตรวจกับตารางนี้)
| ลำดับ | แถว | เรียงภายในด้วย |
|---|---|---|
| 1 | `SellBasket` | id |
| 2 | แถวรอบ: `TripDeparture` (ชนิด TRIP) → `TicketSession` (TICKET) — ตามลำดับ `PRODUCT_KINDS` | id |
| 3 | ตัวนับย่อยของรอบ: `AgentAllotment` · `TicketChannelQuota` | (sessionId, typeId, channel) / id |
| 4 | หน่วย: `TripUnit` (เตียง) · `TripResourceUse` (ตอนแก้รอบ) | sortKey, id |
| 5 | `TripHold` / `TicketHold` | id |
| 6 | `TripBooking` / `TicketOrder` (แก้ไข/ยกเลิก: อ่านไม่ล็อก → ข้อ 2–5 → ล็อกการจอง → ตรวจ `version`/สถานะซ้ำ) | id |
| 7 | `TripsCounter` (ตัวนับเลข) | (series, period) |
| 8 | `TripPaymentDue` · `TripMoneyEvent` (insert) | (bookingId, seq) |
| 9 | `AgentBalance` (หัวสมุด) → insert `AgentLedgerEntry` | agentAccountId |
| 10 | `SupplierPayable` · `SupplierRequest` | id |
| 11 | `emitOutbox` (insert ล้วน) | — |
- **POS และบัญชีอยู่นอก tx ของ trips เสมอ** (แบบ `ticket/service.ts` `markPaid`/`cancelOrder`: claim สถานะใน tx → เรียก POS/บัญชีด้วย idempotency key หลัง commit → ล้ม = คืน claim ถ้าไม่มีเอกสารของคีย์นั้นจริง) — POS มีลำดับล็อกของตัวเอง ห้ามซ้อน
- ล็อก advisory ใช้ได้เฉพาะคีย์ที่ไม่มีแถว (เช่น สร้างรอบจากกฎซ้ำ `pg_advisory_xact_lock(hashtext('trips-gen:'||scheduleId))`) และต้องมาก่อนข้อ 2
- ข้อสอบ X: ยิงพร้อมกัน {ถือ · ยืนยัน · ยกเลิก · หมดเวลา · คืนโควตา} บนรอบเดียว 50 รอบ ไม่มี deadlock (`40P01`) และค่าคงที่ §D.3 ถูกต้อง

---

## E. ค่าตั้ง — เจ้าของ T0.1 (เครื่องยนต์ + trips) · A1.1 (agency) · K1.1 (ticket)

### E.1 โดเมนและชั้นใหม่
- `SettingDomain` + `"trips" | "agency" | "ticket"` · `SettingUnitType` + `"TRIPS" | "TICKET"`
- `SCOPE_KINDS` ต่อท้าย: `"VESSEL"` `"PRODUCT"` `"DEPARTURE"` `"AGENT_TIER"` `"AGENT"` (ต่อท้าย = ไม่กระทบ chain เดิม) · `ScopeRefs` + `vesselId?` `productId?` `departureId?` `agentTierId?` `agentId?` · `REF_FIELD` ตาม
- `locateMany` / `SUPPORTED_SCOPES` / `entitiesOfUnit` (`src/lib/core/settings/service.ts:84,205,281`):
| scope | ตาราง | unitId ที่ได้ | known ที่ได้ | ใบที่เพิ่ม |
|---|---|---|---|---|
| PRODUCT | `TripProduct` **และ** `TicketEvent` (cuid ไม่ชนกัน · ค้นทั้งสอง) | ของแถว | UNIT · VESSEL (ถ้ามี) | T0.1 (Trip) · K1.1 (Ticket) |
| DEPARTURE | `TripDeparture` **และ** `TicketSession` | ของแถว | UNIT · PRODUCT · VESSEL | T0.1 · K1.1 |
| VESSEL | `Vessel` | ของแถว | UNIT | L1.1 |
| AGENT_TIER | `AgentTier` | **null** (ระดับร้าน) | TENANT | A1.1 |
| AGENT | `AgentAccount` | **null** | TENANT · AGENT_TIER (= `tierId`) | A1.1 |
- ⚠️ `refsFor()` คืน `null` เมื่อ entity ไม่มี unitId (`service.ts:429`) ⇒ ทุกผู้เรียกของโดเมนเหล่านี้ **ส่ง `ScopeRefs` ครบเอง** (unitId ของสินค้า + agentId/agentTierId) ไม่ใช้รูป `{scope, scopeId}` (L-4)

### E.2 ลำดับชั้น (ทั่วไป → เจาะจง · ตัวท้ายชนะ)
`TENANT → UNIT → VESSEL → PRODUCT → DEPARTURE → AGENT_TIER → AGENT`
- เหตุผล: ค่าของเรือ (แชร์ห้อง · ถือเคบิน) เป็นฐานของสินค้า · รอบเจาะจงกว่าสินค้า · **สัญญาเอเจนซี่ชนะสินค้า/รอบ** สำหรับเงื่อนไขการค้า (TA §2.4 "มัดจำ งวดจ่าย นโยบายยกเลิก ต่อสัญญาเอเจนซี่")
- นี่คือลำดับ **ค่าปริยาย** · แต่ละคีย์ประกาศ `chain` ของตัวเอง (ส่วนย่อย) ตาม "ชั้น" ใน TRIPS-DEFAULTS — คีย์ที่ P0.2 วาง PRODUCT **หลัง** AGENT (A5 `agency.price.sellerOfRecord` · A16 `agency.hold.duration` · A18 · A19 · A20 = ค่าของสินค้าชนะค่าทั่วไปของเอเจนซี่) ยอมรับ · `chainProblem` คงกฎเดิม (TENANT แรก · UNIT ถัดไป · ไม่ซ้ำ) ไม่เพิ่มกฎบังคับลำดับ (L-30) · ชั้น `SHOP` ใน TRIPS-DEFAULTS = `UNIT`
- คีย์ที่ไม่มีชั้นร้าน (A12 A13 A8 A33 — เฉพาะ AGENT_TIER/AGENT) ผ่าน `chainProblem` ได้ (ไม่มี TENANT/UNIT) · resolve ไม่เจอแถว = ค่าแม่แบบของหน่วยตาม `refs.unitId`
- ค่าตามตัวสินค้าที่ไม่ใช่นโยบาย (ราคา · โควตา · rate card) = **ตารางข้อมูล** (§B) ไม่ใช่ค่าตั้ง · ค่าตั้งเก็บค่าเริ่มต้นและกติกา
- ราคาสินค้าของเอเจนซี่ (เฉพาะสินค้า × เฉพาะเอเจนซี่) = `AgentRate` เพราะ chain เป็นเส้นตรง ตั้ง "PRODUCT × AGENT" พร้อมกันไม่ได้

### E.3 แม่แบบ (applyTemplate ทีละโดเมน · ตัวช่วยเปิดร้าน T1.9 เรียก 3 โดเมนด้วย key เดียวกัน)
| key | ใช้กับ | หมายเหตุ |
|---|---|---|
| `DIVE_SHOP` | trips · agency · ticket(fallback) | ร้านดำน้ำ (ภาพ 14) |
| `DAY_TOUR` | trips · agency | ทัวร์เดย์ทริป |
| `LIVEABOARD` | trips · agency | เรือ — เปิดหลายสกุลเงิน/จ่ายแยกคน |
| `ATTRACTION` | ticket · agency | สถานที่ขายตั๋ว |
- ตัวเลขทุกตัวของแม่แบบ = «ledger/TRIPS-DEFAULTS.md» (P0.2) · ใบ T0.1/A1.1/K1.1 คัดตัวเลขจากไฟล์นั้น · ไม่มีไฟล์ = ใบเริ่มไม่ได้
- ค่าที่ LG ยังไม่ยืนยัน: `helpTh` ขึ้นต้นป้าย "ตรวจกับนักบัญชีของร้าน" (มติรอบ 5) — รายการคีย์ใน TRIPS-DEFAULTS

### E.4 คีย์ (ชื่อ ชนิด ชั้น ค่าเริ่ม = «ledger/TRIPS-DEFAULTS.md» §1–§3 · **ชื่อในไฟล์นั้นชนะ**)
- 122 คีย์: trips `T1–T69` (70) · agency `A1–A37` (37) · ticket `K1–K15` (15) · คำเตือน `W01–W46` · ป้ายนักบัญชี 16 คีย์ (§5.1) · ป้ายหน่วยงาน 10 คีย์ (§5.2) — ใบ T0.1/A1.1/K1.1 ลงทะเบียนตามนั้นทุกตัว (ชั้น "SHOP" ในไฟล์นั้น = ชั้น `UNIT`)
- คีย์ที่สัญญานี้อ้าง (ตัวอย่าง · ⓢ = จดลง snapshot §F):
| เรื่อง | คีย์ (รหัส P0.2) |
|---|---|
| ถือที่/ปิดรับ/ขั้นต่ำ | `trips.sell.holdMinutes` (T5) · `trips.sell.cutoff` (T6) · `trips.sell.minToDepart` (T7) · `trips.sell.departureHorizonDays` (T8) · `trips.sell.waitlistHoldMinutes` (T9) · `trips.sell.abandonedReminder` (T10) · `agency.hold.duration` (A16) · `agency.hold.maxConcurrent` (A17) · `ticket.sell.holdMinutes` (K1) · `ticket.sell.cutoffMinutes` (K2) |
| ราคา | `trips.price.manualOverrideApprovalPct` (T11) · `trips.price.costWarnMarginPct` (T12) · `trips.general.currencies` (T3) ⓢ · `trips.fx.rateSource` (T4) ⓢ · `agency.tier.table` (A1 — คอมฯ ต่อระดับ) ⓢ · `agency.price.defaultModel` (A4) ⓢ · `agency.price.sellerOfRecord` (A5) ⓢ · `agency.price.actualSalePriceField` (A6) · `agency.price.minResalePrice` (A7) ⓢ · `agency.comm.discountFromCommission` (A24) ⓢ |
| งวดจ่าย | `trips.pay.depositPct` (T13) ⓢ · `trips.pay.depositBase` (T14) ⓢ · `trips.pay.balanceDueDaysBefore` (T15) ⓢ · `trips.pay.reminderDaysBefore` (T16) · `trips.pay.overdueAction` (T17) ⓢ · `trips.pay.splitPay` (T18 · LIVEABOARD เท่านั้น = VALIDATION) · `trips.pay.refundTargetBusinessDays` (T19) |
| ยกเลิก | `trips.cancel.ladder` (T20) ⓢ · `trips.cancel.shopCancelRefund` (T21 · ต่อเหตุ 4 แบบ) ⓢ · `trips.cancel.shopCancelOptions` (T22) ⓢ · `trips.cancel.refundForm` (T23) ⓢ · `trips.cancel.deductions` (T24) ⓢ · `trips.cancel.nameChangeFree` (T25) ⓢ · `trips.cancel.changeDateFee` (T26) ⓢ · `agency.cancel.policySource` (A9) ⓢ · `ticket.cancel.refund` (K5) ⓢ · `ticket.change.session` (K4) ⓢ |
| ผู้เดินทาง | `trips.pax.childAgeBand` (T27) ⓢ · `trips.pax.childPricePct` (T28) ⓢ · `trips.pax.fields` (T29) · `trips.pax.passportCutoffDays` (T30) · `trips.pax.cabinSharing` (T31 · ชั้น VESSEL) · `trips.pax.proofNotice` (T32) |
| ภาษี (LEGAL) | `trips.tax.*` (T33–T41) ⓢ ทั้งกลุ่ม · `trips.giftcard.invoiceAt` (T42) · `ticket.tax.*` (K7–K9) ⓢ |
| เก็บแทน/อุทยาน | `trips.line.defaults` (T44) ⓢ · `trips.parkFee.table` (T45) (T45 · effectiveDated) ⓢ · `trips.parkFee.ageBands` (T46) ⓢ · `trips.parkFee.exemptFlags` (T47) ⓢ · `trips.parkFee.countMode` (T48) ⓢ |
| ดำน้ำ/ประกัน/ใบอนุญาต | `trips.dive.ratio` (T49) · `trips.dive.cameraRule` (T50) · `trips.insurance.*` (T51–T54) · `trips.license.*` (T56–T57) · `trips.prospectus.checklist` (T58) · `trips.marine.*` (T59–T60) |
| PDPA/ลงนาม | `trips.pdpa.retention` (T61) (T61) · `trips.pdpa.healthDataProducts` (T62) · `trips.pdpa.minorConsent` (T63) · `trips.pdpa.requestDeadlines` (T64) · `trips.pdpa.ropaAutoDraft` (T65) · `trips.waiver.*` (T66–T68) · `agency.privacy.seeHealthForms` (A34) · `agency.privacy.customerSelfFillLink` (A35) · `ticket.pdpa.buyerRetentionDays` (K14) |
| เงินเอเจนซี่ (MONEY) | `agency.money.collector` (A10) ⓢ · `agency.money.paymentMethod` (A11) ⓢ · `agency.money.creditTermDays` (A12) ⓢ · `agency.money.creditLimit` (A13) · `agency.money.overLimitAction` (A14 · WARN/BLOCK เชิงการค้า) · `agency.money.statementCycle` (A15) · `agency.quota.releaseDaysBefore` (A18) · `agency.quota.requestResponseHours` (A19) · `agency.quota.freeSale` (A20) · `agency.comm.earnedAt` (A21) ⓢ · `agency.comm.currency` (A22) ⓢ · `agency.comm.clawbackOnCancel` (A23) ⓢ |
| หัก ณ ที่จ่าย (LEGAL) | `agency.wht.payerType` (A25) ⓢ · `agency.wht.ruleByPayee` (A26 · ตาราง ผู้จ่าย×ผู้รับ §13.1 L1) ⓢ · `agency.wht.minPerContract` (A27) ⓢ · `agency.wht.eWht` (A28) ⓢ · `agency.wht.grossUpOnNetRemit` (A29) ⓢ · `agency.wht.remitter` (A30 · "ใครนำส่ง" §13.1 L2) ⓢ |
| ลูกค้าของเอเจนซี่ | `agency.crm.addToShopMarketing` (A31 · R3) ⓢ · `agency.crm.whoMessagesCustomer` (A32 · R5) ⓢ · `agency.crm.customerContactRoute` (A33) ⓢ · `agency.price.hidePriceOnVoucher` (A8) ⓢ · `agency.signup.requireApproval` (A36) · `agency.license.fields` (A37) |
| ตั๋ว | `ticket.types` (K3) · `ticket.agent.batch` (K10) · `ticket.channel.quotaPct` (K11) · `ticket.scan.duplicate` (K12) · `ticket.msg.enabled` (K13) · `ticket.consumer.withdraw7Days` (K15) |

- **คีย์ที่สัญญานี้ต้องการแต่ TRIPS-DEFAULTS ยังไม่มี** (P0.2 เติมค่าเริ่มก่อนใบที่ระบุ · ชื่อเสนอ — L-41):
| คีย์ | ชนิด · ชั้น | ใช้ใน | ใบ |
|---|---|---|---|
| «trips.sell.confirmMode» | enum `AUTO`/`SHOP_CONFIRMS` · U·P·AT·A | §G.1 | T0.6 |
| «trips.sell.codePrefix» · «ticket.sell.orderPrefix» | text · U | §K | T0.6 · K1.1 |
| «trips.fx.rates» | table effectiveDated · U | §F.1 (ค่าอัตราจริงที่ล็อก · T4 บอกแค่แหล่ง) | L1.3 |
| «trips.public.showLeftAtOrBelow» · «trips.public.embedDomains» · «trips.public.rateLimits» (พื้นใน schema · L-22) | int · table · U | §C · §J.3 | W1.1 · W3.1 |
| «trips.cancel.autoApproveUpTo» | money · U | §G.3 | T0.7 |
| «trips.ops.autoCloseHoursAfterEnd» · «trips.ops.offlineCheckin» | int · bool · U·P | §J.2 | T1.5 |
| «trips.pdpa.viewLogDays» · «trips.pdpa.maskOnScreen» | days · bool · U | §J.4 | T0.8 |
| «trips.supplier.respondHours» · «trips.supplier.autoCancelOnTimeout» | U·P | §G.2 | S1.2 |
| «agency.quota.requestFirst» · «agency.quota.returnCancelledToQuota» | bool · AT·A·P | §D.1 · §G.1 | A1.4 |
| «agency.money.statementScope» | enum · U·A | §I.3 · L-11 | A1.6 |
| «trips.msg.<ชนิด>» · «agency.msg.<ชนิด>» · «ticket.msg.<ชนิด>» (template ต่อข้อความ) | template · U·P | `notifyCustomer` อ่าน `${domain}.msg.${messageKey}` (`notify-customer.ts:183`) — T69/K13 เป็นตารางเปิดปิดอย่างเดียว (L-42) | T1.8 · K1.3 |

### E.5 ตัวตรวจกฎหมาย = `OK` / `WARN` เท่านั้น · ข้อตัดสินจาก P0.2
1. **ไฟล์** «src/lib/core/settings/legal/th-tour-2569.ts» (ชื่อตาม P0.2) · rule id = รหัส `W01`–`W46` ของ TRIPS-DEFAULTS §4 (ข้อความไทยตามตารางนั้น) · ผล `{ level: "OK" | "WARN"; code; messageTh; citation; severity: "NORMAL" | "HIGH" | "HIGHEST"; pendingReview?: true }`
2. **(ก) ระดับ "สูง/สูงสุด"** (§13.1 L8/L10 · P0.2 C4): **ไม่เพิ่มระดับที่สาม** · ใช้ช่อง «severity» บนผล WARN เพื่อลำดับ/สีการแสดงผลเท่านั้น — `HIGH` = แถบบนสุด · `HIGHEST` = แถบบนสุด + ต้องติ๊กรับทราบแยกต่อข้อ (ยังบันทึกได้เสมอ) · `LegalVerdict` เดิมของหอไม่เปลี่ยน (severity เป็นช่องเสริม ไม่บังคับ)
3. **(ข) เหตุผล ≥ 10 ตัวอักษร** (`service.ts:943` `isValidOutOfScopeReason`): ในโดเมน `trips|agency|ticket` **คงการรับทราบ** (`ackLegalWarn: true` · ไม่ส่ง = `NEEDS_APPROVAL` พร้อมรายการคำเตือนให้จอแสดง) แต่ **ไม่บังคับเหตุผล** (ส่งได้ · เก็บใน `SettingChange.reason`) · ไม่มีสายอนุมัติเจ้าของ (`needsOwnerApproval` = false ทุก rule ของไฟล์นี้) · บันทึก `SettingChange.legalLevel = "WARN"` + `legalCode` ทุกครั้ง · หอ/จองคิวทำงานเดิมทุกไบต์ (เงื่อนไขแยกตามโดเมนของ def) — ข้อสอบ LG §11 คู่ "ปรับแล้วระบบยอม + แสดงคำเตือน" ผ่านได้
4. **(ค) เครื่องยนต์** (T0.1 · ตรวจเข้ม · แตะ R0.3): โดเมน 3 ตัว · scope 5 ตัว (§E.1) · ทะเบียน rule หลายไฟล์ («legal/index.ts» รวม `TH_RENTAL_2568_RULES` + `TH_TOUR_2569_RULES` แทนการผูกไฟล์เดียวที่ `registry.ts:11,139,196`) · `defineSettings` โยนถ้า def ของสามโดเมนอ้าง rule นอก `th-tour-2569` หรือ rule ที่ไม่ประกาศ `maxLevel: "WARN"` · การตรวจค่าเริ่มของแม่แบบ (`registry.ts:196` บังคับ `OK` โหมด STRICT) ใช้กับสามโดเมนนี้แบบ "ค่าเริ่มต้องไม่ WARN" (ภาพ 03 ที่เข้มกว่าเป็นค่าของร้านสมมติ ไม่ใช่ค่าแม่แบบ)
5. **ช่องป้าย** «reviewHint?: "ACCOUNTANT" | "AUTHORITY"» + «reviewAuthorityTh?: string» ใน `SettingDef` (ป้ายขึ้นแม้ค่ายังไม่ผิด · ต่างจาก `pendingReview` ของผล) — `SettingsForm` แสดง "ตรวจกับนักบัญชีของร้าน" / "ยังไม่ยืนยันกับ <หน่วยงาน>" · 16 + 10 คีย์ตาม TRIPS-DEFAULTS §5
6. **คำเตือนกฎหมายห้ามเป็น `GroupRule`** (GroupRule ล้ม = `VALIDATION`) · คำเตือนข้ามค่า (เช่น W03 = T13+T20) เขียนเป็น legal rule ที่ใช้ `legalInput(value, get)` อ่านค่าอื่น (กลไก `LEGAL_DEPS` มีแล้ว `registry.ts:30`) · GroupRule ใช้เฉพาะรูปข้อมูล (ขั้นบันไดเรียงวันลดลง · % ≤ 100 · สกุลเงินบนสินค้าที่ไม่ใช่ Liveaboard)
7. **จุดตรวจนอกจอค่าตั้ง** (บันทึกสินค้า/รอบ/ราคา/การจอง/คืนเงิน · W04 W05 W22 ฯลฯ) เรียกฟังก์ชันบริสุทธิ์ `evaluateTourRule(id, input)` ตัวเดียวกัน → `Quote.warnings` / แถบเตือน · ไม่มีเส้นทางใดคืน `LEGAL_BLOCK` (MP §5 ข้อ จ)
8. **ticket `_fallback` = พฤติกรรมตั๋ว MVP เดิม** (แบบ `FALLBACK_LEGACY` ของ `defs/booking.ts`): ไม่มีถือที่หมดเวลา (`PENDING` ค้างได้จนพนักงานยกเลิก — ตาม `ticket/service.ts` createOrder/cancelOrder) · ไม่ปิดรับอัตโนมัติ · ไม่มีตารางคืนเงิน · ขายได้ทุกช่องทางจากที่ว่างรวม · ร้านที่ไม่มี `SettingProfile(domain "ticket")` ได้ค่านี้ ⇒ ร้านตั๋วเดิมไม่เปลี่ยนพฤติกรรมหลัง K1.1 (ข้อสอบ K1.1 บังคับ) · แม่แบบ `ATTRACTION` ใช้ได้เมื่อร้านเลือกเอง
9. trips/agency `_fallback` = ค่าของ `DIVE_SHOP` (P0.2 §0)

---

## F. ตัวเลือกราคาและ snapshot — เจ้าของ T0.5 (+ A1.3 ชั้นเอเจนซี่ · L1.3 สกุลเงิน)

### F.1 ลำดับ (ตัวท้ายชนะ · ทุกขั้นจด `priceTrace`)
```
1 RETAIL       TripPrice ของ (product, option, paxType, cabinType) ไม่มี season/departure
2 SEASON       TripPrice ที่ season ครอบ travelDate (priority สูงสุด) · weekdayMask · ช่วงจอง/เดินทาง
3 DEPARTURE    TripPrice.departureId = รอบนี้ (ราคาทับรายรอบ)
4 RULES        TripPriceRule: EARLY_BIRD / LAST_MINUTE / GROUP_TIER / FREE_LEADER / BLACKOUT (บนราคาจากข้อ 3)
5 TIER         AgentRate ของ rate card ระดับ (AGENT_TIER) — ถ้ามีเอเจนซี่
6 CONTRACT     AgentRate ของ rate card เฉพาะเอเจนซี่ (ชนะระดับ)
7 PROMO        โปรโมชันที่ผู้ขายมีสิทธิ์ (โค้ดส่วนลด/คูปอง/แต้ม — ผ่าน member facade · discountable เท่านั้น)
8 MANUAL       ราคาแก้มือ: สิทธิ์ `trips.price.override` + เหตุผล + approval ถ้าเกินเพดาน (`trips.price.manualOverrideApprovalPct` T11) · L10 WARN ถ้าต่ำกว่าต้นทุนรอบ
```
- บรรทัดเสริม: ราคาจาก `TripExtra` (+ `trips.parkFee.table` (T45) สำหรับ `PARK_FEE` ตาม สัญชาติ × อายุ × ดำน้ำ ณ travelDate) · บรรทัด `passThrough` **ข้ามขั้น 4–8 ทั้งหมด** (ไม่ลด ไม่คิดคอมฯ)
- ขั้นเอเจนซี่แปลงเป็น 3 ตัวเลข (TA §9.2 ข้อ 7): `COMMISSION_PCT/FIXED` → ลูกค้าจ่ายราคาปลีก · คอมฯ = rate × ฐาน (ฐาน = Σ บรรทัด `commissionable`) · `NET` → ส่งร้าน = เน็ต (+ passThrough) · ราคาขายขั้นต่ำ `minSellMinor` (`BELOW_MIN_SELL_PRICE` — กติกาการค้าของสัญญา ไม่ใช่กฎหมาย) · `MARKUP` → ลูกค้าจ่าย ≤ เน็ต × (1 + cap)
- WHT ตามตาราง **ผู้จ่าย × ผู้รับ** (§13.1 L1 · A25 `agency.wht.payerType` × A26): ร้านนิติบุคคล→นิติบุคคลไทย 3% (หรือ 1% เมื่อ `agency.wht.eWht` A28) · →บุคคลธรรมดาไทย = โหมด ม.50(1) **ไม่คำนวณอัตโนมัติ** (ยอดว่างรอร้านกรอก · W10 · P0.2 C1) · →ต่างประเทศ = ไม่หัก + ยืนยันข้อเท็จจริง (W08 · C3) · ร้านบุคคลธรรมดา→นิติบุคคล = ไม่มีหน้าที่หัก · ใครนำส่ง = `agency.wht.remitter` (A30)
- ราคาเน็ต: ค่าเริ่ม = **โหมดตัวแทน** (`agency.price.sellerOfRecord` A5 · §13.1 L7) — ผลต่างเป็นค่าบำเหน็จ · `agentActualSaleSatang` ไม่กรอก = WARN (ไม่บล็อก)
- WHT gross-up (L2): `collectMode = AGENT` และ `agency.wht.ruleByPayee` (A26 ตามคู่ ผู้จ่าย×ผู้รับ) ให้หัก และ `agency.wht.grossUpOnNetRemit` (A29) ⇒ ส่งร้าน = ปลีก − คอมฯ + round(คอมฯ × whtRate) เมื่อยอดต่อครั้ง ≥ `agency.wht.minPerContract` (A27 · เฉพาะผู้รับนิติบุคคล · สัญญาต่อเนื่อง = หักทุกรายการ — P0.2 C2) (ภาพ 04ค: 8,200 − 1,050 + 31.50 = 7,181.50)
- ปัดเศษ: ต่อบรรทัด half-up เป็นสตางค์ · ผลรวม = Σ บรรทัด (ไม่ปัดผลรวมซ้ำ) · สกุลต่างประเทศ: ราคาตั้งต่อสกุล (ไม่แปลงสด · MP ข้อ 13) · ยอดบาท = round(minor × `fxRateMicros` / 1e6) ต่อบรรทัด · อัตราจาก «trips.fx.rates» (effectiveFrom ≤ เวลาจอง)

### F.2 รูป «TripsBookingSnapshot v1» (คอลัมน์ `TripBooking.policySnapshot` · `TicketOrder.policySnapshot`)
```ts
type TripsBookingSnapshot = {
  v: 1;
  productKind: "TRIP" | "TICKET";
  at: string;                                   // ISO เวลาจด
  refs: { unitId: string; productId: string; slotId: string; vesselId?: string; agentId?: string; agentTierId?: string };
  policy: {                                      // PolicySnapshot ของ CC §1.6 ต่อโดเมน (template + values + sources = ที่มาของค่า)
    trips?: PolicySnapshot;                      // snapshotPolicy(ctx, "trips.booking", refs) — คีย์ ⓢ ของ trips
    ticket?: PolicySnapshot;                     // "ticket.order"
    agency?: PolicySnapshot;                     // "agency.booking" (เฉพาะมีเอเจนซี่)
  };
  currency: string;                              // "THB" | "USD" | "EUR" (ไม่ใช่ THB เฉพาะ LIVEABOARD)
  fx: null | { rateMicros: number; source: "SETTING" | "MANUAL"; effectiveFrom: string };
  lines: {
    itemRef: string; kind: string; label: string; paxTypeCode?: string; qty: number;
    unitMinor: number; amountMinor: number; amountSatang: number;
    commissionable: boolean; discountable: boolean; passThrough: boolean; taxKind: "VAT7" | "EXEMPT" | "NONE";
    priceSource: "RETAIL" | "SEASON" | "DEPARTURE" | "RULE" | "TIER" | "CONTRACT" | "PROMO" | "MANUAL";
    priceTrace: { step: string; refId?: string; amountMinor: number }[];
  }[];
  totals: { grossSatang: number; discountSatang: number; passThroughSatang: number; vatBaseSatang: number; vatSatang: number; payableSatang: number };
  commission: null | {
    agentAccountId: string; mode: "COMMISSION_PCT" | "COMMISSION_FIXED" | "NET" | "MARKUP";
    baseSatang: number; rateBp: number | null; commissionSatang: number;
    collectMode: "SHOP" | "AGENT"; sellerOfRecord: "SHOP" | "AGENT";
    wht: { applies: boolean; payerType: string; payeeType: string; mode: "RATE" | "PROGRESSIVE_50_1" | "NONE_FOREIGN" | "NONE";
           rateBp: number | null; eWht: boolean; whtSatang: number | null; grossUp: boolean; remitter: "SHOP" | "AGENT" };
    agentActualSaleSatang: number | null;
    remitToShopSatang: number; agentEarnsSatang: number; currency: string;
  };
  cancelLadder: { daysBefore: number; refundBp: number }[];   // จาก trips/agency/ticket ที่ชนะ (มีชั้นใดเป็นที่มาใน policy.*.sources) — ใช้กับเหตุ CUSTOMER
  cancelMinimumLadder: { daysBefore: number; refundBp: number }[] | null; // ขั้นต่ำตามประกาศ 2563 ณ วันจอง (trips เท่านั้น · ไม่ใช่ ticket — P0.2 C5) ใช้แสดง W01
  shopCancelRefundBpByReason: { SHOP_EXTERNAL: number; MIN_PAX: number; SHOP_FAULT: number };
  refundForm: string;                            // T23 เงิน/เครดิต/ลูกค้าเลือก (+ อายุเครดิต)
  nameChangeFree: unknown; changeDateFee: unknown;   // T25 · T26
  paymentSchedule: { seq: number; kind: string; amountSatang: number; amountMinor?: number; dueAt: string; passengerRef?: string }[];
  tax: { vatRegistered: boolean; pricesIncludeVat: boolean; invoiceOnEachPayment: boolean; cancelFeeVat: boolean };
  deckPlanVersionId: string | null;
  flags: { marketingEligible: boolean; messageMode: string; contactRoute: string; hidePriceOnVoucher: boolean };
  warnings: string[];                            // รหัส WARN ที่ร้าน/ผู้ขายเห็นตอนจอง
};
```
- ทะเบียนห้าม snapshot kind เดียวอ้างคีย์ข้ามโดเมน (`registry.ts:151`) ⇒ ลงทะเบียน 3 kind: `"trips.booking"` (defs/trips) · `"agency.booking"` (defs/agency) · `"ticket.order"` (defs/ticket) แล้วห่อรวมตามรูปข้างบน (L-31)
- `snapshotPolicy` อ่านด้วย `prisma` นอก tx (`service.ts:486`) ⇒ เรียก **ก่อน** เปิด tx การจอง · `at` = เวลาเดียวกับ quote · ข้อสอบ: แก้ค่าตั้ง/สัญญา/ราคาหลังจอง → การจองเดิมไม่เปลี่ยน (MP §5 ข้อ ข)
- ทุกการคำนวณย้อนหลัง (คืนเงิน · คอมฯ · งวด · ใบแจ้งยอด · ใบกำกับ) อ่านจาก snapshot ผ่านตัวอ่านบริสุทธิ์ «trips/snapshot.ts» (`fromSnapshot` แบบ CC — คีย์ที่ไม่ได้จด = throw)
- แก้การจอง (เลื่อนวัน/เพิ่มคน · T0.6) = สร้าง snapshot ใหม่ทั้งก้อน เก็บของเดิมใน audit (`writeAudit` before/after) · ตารางยกเลิกของการจองที่เลื่อน = ของ snapshot เดิม เว้นแต่ร้านเลือก "ใช้กติกาปัจจุบัน" (บันทึกเหตุผล)

---

## G. ผังสถานะ — เจ้าของ T0.6 («trips/state.ts» บริสุทธิ์ · ทุกการเปลี่ยน = CAS `UPDATE … WHERE status = $from AND version = $v`)

### G.1 การจอง (`TripBooking.status` · `TicketOrder` ใช้ชุดย่อย)
| จาก → ถึง | เมื่อ | ผู้กระทำ |
|---|---|---|
| (ใหม่) → `HOLD` | `confirm()` + `pay.mode = PAY_NOW` และยังไม่มีเงิน (ที่นั่ง = held · `holdExpiresAt`) | PUBLIC · AGENT · STAFF |
| (ใหม่) → `PENDING` | «trips.sell.confirmMode» = `SHOP_CONFIRMS` · «agency.quota.requestFirst» · สินค้าผู้ให้บริการ (S1.2) | ทุกช่องทาง |
| (ใหม่) → `CONFIRMED` | PAY_LATER (ร้านยอม) · AGENT_CREDIT/WALLET ผ่านวงเงิน · AGENT_COLLECTS | STAFF · AGENT |
| `HOLD` → `CONFIRMED`/`PART_PAID`/`PAID` | เงินเข้า (สลิปอนุมัติ/พร้อมเพย์ยืนยัน/บัตร) · ที่นั่ง held→sold | SYSTEM (consumer) · STAFF |
| `HOLD` → `EXPIRED` | หมดเวลา (§D.4) | SYSTEM |
| `HOLD`/`PENDING` → `CANCELLED` | ผู้จองยกเลิกก่อนจ่าย · ร้านปฏิเสธ | PUBLIC(OTP) · AGENT · STAFF |
| `PENDING` → `CONFIRMED`/`HOLD` | ร้านยืนยัน · ผู้ให้บริการยืนยัน · คำขอเอเจนซี่อนุมัติ (ที่นั่ง held→sold หรือคง held รอจ่าย) | STAFF · SYSTEM(supplier) |
| `PENDING` → `CANCELLED` | ร้าน/ผู้ให้บริการปฏิเสธ · หมดเวลาตอบ | STAFF · SYSTEM |
| `CONFIRMED` → `PART_PAID` → `PAID` | รับเงินงวด (`paidSatang` เทียบ `payableSatang`) | SYSTEM · STAFF |
| `CONFIRMED`/`PART_PAID` → `CONFIRMED` (คงสถานะ) + ปล่อยที่ | `trips.pay.overdueAction = RELEASE` เลยกำหนด + grace → ไปทาง `CANCELLED` (เหตุ `OVERDUE`) | SYSTEM |
| `CONFIRMED`/`PART_PAID`/`PAID` → `CANCELLED` | ผ่านคำขอคืนเงิน G.3 (ลูกค้า/เอเจนซี่) · ร้านยกเลิกรอบ (T1.6) | STAFF · SYSTEM |
| `CONFIRMED`/`PART_PAID`/`PAID` → `TRAVELLED` | ปิดทริป (T1.5: ไกด์/ร้านกด หรือ «trips.ops.autoCloseHoursAfterEnd») — ค้างเงิน = ยังปิดได้ (ยอดค้างเป็นลูกหนี้) | STAFF(ไกด์) · SYSTEM |
| `CONFIRMED`/`PART_PAID`/`PAID` → `NO_SHOW` | ปิดทริปแล้วผู้เดินทางทั้งการจองไม่เช็กอิน (ร้านยืนยัน) · มัดจำตาม snapshot | STAFF |
| `NO_SHOW` → `TRAVELLED` | แก้ผิด (ภายใน N ชม. · คืนสถานะมัดจำแบบ `moduleUnforfeitDeposit`) | STAFF (สิทธิ์ `trips.booking.fix`) |
| เปลี่ยนรอบ/แก้คน | ไม่เปลี่ยนสถานะ · ทำใน tx: ปล่อยที่เดิม + ถือที่ใหม่ (ลำดับล็อกตาม id รอบ) + snapshot ใหม่ | STAFF · PUBLIC(OTP ถ้า snapshot ยอม) · AGENT(ถ้า สิทธิ์ผู้ใช้เอเจนซี่) |
- สถานะจบ: `EXPIRED` `CANCELLED` `TRAVELLED` `NO_SHOW` (ยกเว้นแถวแก้ผิดข้างบน)
- การจองผ่านเอเจนซี่ (R4): หน้า "การจองของฉัน" ของลูกค้า **ไม่มี** ปุ่มเลื่อน/ยกเลิก · ร้านยกเลิกรอบ → ทางเลือก 3 ทางส่งที่เอเจนซี่
- ตั๋ว: `PENDING`(เดิม) ≡ `HOLD`/`CONFIRMED` · `PAID` · `CANCELLED` (enum เดิม `TicketOrderStatus` คงไว้ · สถานะใหม่ใน v2 เก็บเพิ่มที่ «TicketHold» และ `admission.status`) — ไม่เพิ่มค่า enum ในรุ่นนี้

### G.2 คำขอไปผู้ให้บริการ (`SupplierRequest.status` · S1.2)
`DRAFT → SENT → (VIEWED) → CONFIRMED | DECLINED | EXPIRED` · `SENT/VIEWED → CANCELLED` (ลูกค้ายกเลิก) · `EXPIRED → SENT` (ส่งใหม่ · attempts+1)
- ผู้กระทำ: SYSTEM ส่ง · ผู้ให้บริการกดผ่านลิงก์ token (ไม่ล็อกอิน) หรือ PEER (S1.5 ร้าน SHARK ด้วยกัน = ยืนยันอัตโนมัติจากที่ว่างสด) · STAFF บันทึกแทน (โทรยืนยัน) พร้อมหลักฐาน
- `CONFIRMED` ⇒ การจอง `PENDING → HOLD/CONFIRMED` + `SupplierPayable(ACCRUED)` · `DECLINED/EXPIRED` ⇒ «trips.supplier.autoCancelOnTimeout» ตัดสินว่ายกเลิก+คืนเงินอัตโนมัติ หรือเข้าคิวร้าน

### G.3 คำขอคืนเงิน (`TripRefundRequest.status` · T0.7 · ภาพ 15)
`REQUESTED → QUOTED` (คำนวณจาก snapshot ทันที) `→ APPROVED | REJECTED | WITHDRAWN` · `APPROVED → EXECUTING → DONE | FAILED` · `FAILED → EXECUTING` (ลองซ้ำด้วยคีย์เดิม)
- **เหตุ 4 แบบ** (§13.1 L8): `CUSTOMER` = ตาราง `cancelLadder` ของ snapshot (เข้มกว่าขั้นต่ำได้ — ร้านเห็น W01 ตอนตั้ง ไม่บล็อก) · `SHOP_EXTERNAL` `MIN_PAX` `SHOP_FAULT` = `shopCancelRefundBpByReason` (ค่าเริ่ม 100% · ต่ำกว่า = W02) · หักค่าใช้จ่ายจริงได้เฉพาะรายการใน `deductions` พร้อมหลักฐาน (ไม่มีหลักฐาน = W04 · ยังอนุมัติได้)
- ผู้ยื่น: ลูกค้า (OTP · การจองตรง) · เอเจนซี่ (การจองของตัวเอง) · STAFF · SYSTEM (ร้านยกเลิกรอบ/เลยเวลาเลือก `trips.cancel.shopCancelOptions` = คืนอัตโนมัติ)
- ผู้อนุมัติ: อัตโนมัติเมื่อผลตรงตารางและ ≤ เพดาน (ค่าตั้ง «trips.cancel.autoApproveUpTo») · อื่น = approval core (`entityType` «trips.refund» ลง 3 ที่: labels · actions allowlist · `src/lib/approval-effects.ts`)
- ทางเลือก `CREDIT` = เครดิตร้าน (บัตร STORE_CREDIT ของ giftcard ผ่าน facade) · `MOVE` = เลื่อนรอบ (G.1 แถวเปลี่ยนรอบ)

---

## H. เงิน — ทุกบาทผ่าน POS / บัญชี V2 · เจ้าของ T0.7 (ลูกค้า) · A1.5–A1.7 (เอเจนซี่) · S1.3 (ผู้ให้บริการ) · L1.8–L1.9 (Liveaboard)

หลัก R1: เงินลูกค้าเข้าบัญชีร้านตรง (พร้อมเพย์ของร้านจาก `receiverFor` · เกตเวย์ของร้านจากศูนย์เชื่อมต่อ) · "กระเป๋าเอเจนซี่" = ยอดในสมุด §I ไม่ใช่เงินฝากกับ SHARK · คอมฯ ร้านโอนเอง ระบบออกรายการ+เอกสาร

### H.1 ลูกค้าจ่ายร้าน (ตรง · ลิงก์เอเจนซี่แบบร้านเก็บ · หน้าร้าน)
| จังหวะ | ทำอะไร | ฟังก์ชันที่มีอยู่ / ต้องเพิ่ม |
|---|---|---|
| ออก QR ต่องวด | ยอดล็อกต่อ `TripPaymentDue` | `promptpayQrFor(ctx, {unitId, amountSatang, ref: "due:<dueId>"})` (`src/lib/payment/receiver.ts`) |
| แนบสลิป | `submitSlip(domain «TRIPS», refType «TRIP_DUE», refId = dueId, idempotencyKey)` | `src/lib/payment/slip-verify.ts` — เพิ่ม domain/refType ใน `SLIP_DOMAIN_REF` (L-8) |
| อนุมัติ → รับเงิน | consumer «trips-pay.onTripSlipApproved» → `moduleTakeDeposit({keyBase: "trips-due-<dueId>", amountSatang, payType, customerId, createdBy: "module:trips"}, sell)` · `sell` เรียก `pos.createSale(… callerTx(tx))` จุดเดียวของ trips · ใบรับ = **ใบเสร็จ/ใบกำกับต่องวด** (VAT ตอนรับ · `applyExternalDepositReceipt` Cr 2110) = L4 | `src/lib/modules/pos/deposit.ts:609` · ผล → `TripPaymentDue.receiptSaleId` + `TripMoneyEvent(RECEIVED)` (คีย์ `recv:<slipId>`) · CAS สถานะการจอง |
| บรรทัดเก็บแทน (ค่าอุทยาน) | ⚠️ ใบรับมัดจำ POS รับยอดเดียวคิด VAT ทั้งก้อน ⇒ เก็บแทนนอกฐาน VAT ทำไม่ได้ด้วยฟังก์ชันเดิม (L-9) | ค่าเริ่มที่เสนอ: งวดแรกแยกบิล POS ของบรรทัด passThrough (`sourceModule "TRIPS"` · สินค้าภาษี NONE) ใช้ `createSale` ปกติ ไม่ใช่มัดจำ |
| ปิดทริป (รับรู้รายได้) | บิลปิด `pos.createSale({sourceModule: "TRIPS", sourceId: bookingId, idempotencyKey: "trips-close-<bookingId>", lines: บรรทัดบริการ, payMethods: [{type:"DEPOSIT", refSaleId, amountSatang} …] + ยอดค้าง})` · มัดจำที่ใช้ได้จาก `moduleDepositForBill` ต่อใบรับ | `pos.createSale` (facade `pos/index.ts:22`) · ⚠️ จำกัด DEPOSIT ≤ 3 ใบ/บิล (`pos/service.ts:354`) — จ่ายแยกคน Liveaboard > 3 ใบ (L-9) |
| ยกเลิกมีค่าธรรมเนียม | ริบหลังออกใบกำกับแล้ว = **ไม่ออกใบลดหนี้อัตโนมัติ** (`trips.tax.forfeitAfterInvoice` T39 ร้านเลือก · §13.1 L4) · (1) บิลค่ายกเลิก `createSale` บรรทัด "ค่ายกเลิกตามเงื่อนไข" จ่ายด้วย DEPOSIT = ค่าธรรมเนียม (VAT ตาม `trips.tax.cancelFeeVat` (T38) · L-23) (2) `moduleRefundDeposit` คืนคงเหลือ → ใบคืน CN (`PosDocCounter`) = ใบลดหนี้ | `pos/deposit.ts:703` · ยกเลิกเต็มจำนวน = (2) อย่างเดียว · ไม่มา = `moduleForfeitDeposit` (`:865`) |
| คืนเป็นเครดิต | `moduleRefundDeposit` ไม่ใช้ · บิลแปลงมัดจำเป็นเครดิตร้าน (giftcard `STORE_CREDIT`) | ผ่าน facade giftcard/member — ใบ T0.7 ยืนยันชื่อฟังก์ชัน (ปัจจุบันมี `giftcard/service.ts` `sell` `reload` — ยังไม่มีทาง "ออกเครดิตจากมัดจำ" · L-9) |
| ลูกค้านิติบุคคลหักร้าน | ช่อง "ลูกค้าหัก ณ ที่จ่าย" ตอนรับเงิน (`trips.tax.corporateCustomerWht` T41) → `TripMoneyEvent.whtByCustomerSatang` · ยอดเงินเข้า = ยอดงวด − ภาษีที่ลูกค้าหัก · ภาษีที่ถูกหักลงบัญชีผ่าน facade (ภาษีถูกหักรอเครดิต · `issueWhtCreditCert` ยังไม่อยู่บน facade — L-10) |
| ลงบัญชี | ทั้งหมดผ่าน account-bridge ของ POS เดิม (`applyExternalSale` · `applyExternalDepositReceipt` · `applyExternalDepositRefund` · `applyExternalRefund`) — trips ไม่เรียกบัญชีตรงในเส้นนี้ | facade บัญชี (F2.2) |

### H.2 เอเจนซี่เก็บเงินลูกค้า (Q2 ค่าเริ่มต้น)
- ร้าน **ไม่ออก** ใบเสร็จให้ลูกค้า (ผู้ขายตามสัญญา L7: `SHOP` = ร้านออกใบกำกับให้ลูกค้าในนามร้านผ่านเอเจนซี่ตัวแทน · `AGENT` = เอเจนซี่ออกเอง ร้านออกให้เอเจนซี่)
- ยืนยัน → สมุด §I: `CHARGE` (+ส่งร้านก่อนหักคอมฯ = ปลีกรวม passThrough) · `COMMISSION_NETTED` (−คอมฯ) · `WHT_GROSSUP` (+ภาษีหัก) → ยอดสุทธิที่ภาพ 04ค แสดง · `AgentCommission(PENDING, settleMode NETTED)`
- เอเจนซี่จ่าย: PAY_NOW = จ่ายต่อการจอง (สลิป domain «AGENCY» refType «AGENT_CHARGE») · WALLET = เติมล่วงหน้า · CREDIT = ตามใบแจ้งยอด
- เอกสารบัญชี (ฟังก์ชันใหม่ใน facade บัญชี · overload แบบ `createExternalInvoice(sourceKind "DORM")` — L-10):
  - «createExternalInvoice(sourceKind "TRIPS")» — ใบแจ้งหนี้จากใบแจ้งยอด/ต่อการจอง · บรรทัด `ExternalDocLine` (`taxKind` VAT7 / NONE สำหรับเก็บแทน)
  - `recordExternalPayment` (มีแล้ว · หอใช้) — รับชำระ · คีย์ `agpay:<entryId>`
  - «postAgencyAdvance» / «applyAgencyAdvance» — เติมกระเป๋า = รับล่วงหน้า Cr 2110 (แบบ `postSecurityDeposit` `account/index.ts:1973`)
  - `createExternalCreditNote` (มีแล้ว) — ยกเลิกหลังออกใบแจ้งหนี้
  - «issueAgencyWhtReceipt» — หนังสือรับรองที่ **เอเจนซี่** หักร้าน (ร้านรับ 50 ทวิ) ใช้ `issueWhtCreditCert` ใน `account/wht.ts:138` (ยังไม่อยู่บน facade)
- รับรู้รายได้: ⚠️ ใบแจ้งหนี้ลงรายได้ทันที ⇒ ขัดกับ "รับรู้เมื่อปิดทริป" (L-11) · ค่าเริ่มที่เสนอ: ใบแจ้งยอดออกใบแจ้งหนี้เฉพาะการจองที่ `TRAVELLED` ในงวด · ส่วนที่ต้องจ่ายล่วงหน้าตามงวดของสัญญา = รับล่วงหน้า («postAgencyAdvance») แล้วตัดตอนออกใบแจ้งหนี้

### H.3 ลิงก์เอเจนซี่แบบร้านเก็บเงิน (ร้านจ่ายคอมฯ)
- เงินลูกค้าเดินตาม H.1 · ปิดทริป → `AgentCommission PENDING → EARNED` (`entitledAt` = เวลาปิด · L3) + สมุด `COMMISSION_EARNED` (−) + บัญชี «applyAgentCommissionAccrual» (Dr ค่าคอมฯ / Cr ค่าคอมฯ ค้างจ่าย · แบบ `applyExternalChannelCommission(payout "DIRECT")` `account/index.ts:726` แต่ผูกแหล่งเป็นการจองไม่ใช่บิล POS — L-10)
- รอบจ่าย (A1.7) → «payAgentCommission» (จ่ายเงิน + WHT ตามประเภทผู้รับ ณ วันจ่าย · `issueWhtCert` `account/wht.ts:310` · 50 ทวิ · ภ.ง.ด.3/53 จาก `pnd()`) → สมุด `COMMISSION_PAID` (+) + `WHT_WITHHELD`
- ยกเลิกหลังได้สิทธิ์ = `COMMISSION_CLAWBACK` (+) หักงวดถัดไป (L3) · ก่อนได้สิทธิ์ = `AgentCommission VOID` ไม่มีรายการเงิน

### H.4 ผู้ให้บริการ (S1.3 · ร้านเป็นเอเจนซี่เอง G1)
- ยืนยันการจองสินค้า `sourceKind SUPPLIER` → `SupplierPayable(ACCRUED)` ต้นทุนจาก `SupplierCost` (จดลง snapshot บรรทัด `cost` — เพิ่มใน `lines[].costSatang?` ตอน S1.1)
- ใบวางบิล/จ่าย: «createExternalBill» (facade บัญชีใหม่ · ปัจจุบันมีแค่ `createExpenseDoc` ที่สร้าง DRAFT `account/index.ts:1359`) · จ่าย → payment เดิมของบัญชี · WHT ถ้าร้านต้องหัก (ผู้ให้บริการเป็นผู้รับเงิน)
- ลูกค้ายกเลิก → `SupplierPayable VOID` หรือค่าปรับของผู้ให้บริการตามเงื่อนไขของเขา (จดใน `SupplierCost`/snapshot) · กำไรต่อการจอง = ขาย − ทุน − คอมฯ

### H.5 หลายสกุลเงิน + จ่ายแยกคน (เฉพาะ Liveaboard)
- ราคาตั้งต่อสกุล · การจองจด `currency` + `fxRateMicros` · **ทุกเอกสาร POS/บัญชีเป็นบาท** (ยอดบาทล็อก ณ วันจอง · แสดง "USD x @ อัตรา y" บนเอกสาร · LG §8.3) · งวดถัดไปใช้ยอดบาทที่ล็อก ไม่ปรับตามอัตราใหม่
- คอมฯ สกุลต่างประเทศ (R7): `agency.comm.currency` (A22) = `THB` (ค่าเริ่ม) แปลงด้วยอัตราที่จด · `BOOKING` = สมุดแยกต่อสกุล (`AgentBalance` ต่อ currency)
- จ่ายแยกคน (L1.8): `TripPaymentDue.kind = PASSENGER_SHARE` ต่อผู้เดินทาง · ลิงก์จ่ายต่อคน (`payTokenHash`) · ใบรับต่อคน = ใบรับมัดจำ POS ต่อคน (ระวัง ≤ 3 ใบ/บิลปิด — L-9)
- บิลบนเรือ (L1.9): ⚠️ `HotelFolio.reservationId` เป็น FK บังคับไป `HotelReservation` (`hotel.prisma:396`) ⇒ ใช้กับ `TripBooking` ตรง ๆ ไม่ได้ (L-35)

### H.6 ค่าคงที่ของเงิน (ข้อสอบ 🔴 ทุกใบเงิน)
- Σ `TripMoneyEvent(RECEIVED)` − Σ `REFUNDED` = Σ ใบรับ POS ของ keyBase `trips-due-*` ของการจอง − ใบคืน
- การจองหนึ่ง: บิลปิด ≤ 1 (คีย์ `trips-close-<id>`) · รายได้รวม + ค่าธรรมเนียมยกเลิก + คืน = เงินรับ
- เก็บแทน: ไม่อยู่ในฐาน VAT ทุกเอกสาร · ไม่อยู่ในฐานคอมฯ · ไม่ถูกลด
- ทุกฟังก์ชันเงินกันซ้ำด้วยคีย์ (ยิงซ้ำ/ซ้อน = เงินลงครั้งเดียว · X4)

---

## I. สมุดบัญชีเอเจนซี่ (ต่อท้ายอย่างเดียว) — เจ้าของ A1.5 (+ A1.6 ใบแจ้งยอด · A1.7 รอบคอมฯ)

### I.1 ชนิดรายการ (เครื่องหมาย: **บวก = เอเจนซี่ค้างร้าน** · ลบ = ร้านค้างเอเจนซี่/เอเจนซี่มีเครดิต)
| kind | เครื่องหมาย | เกิดเมื่อ | อ้างอิงบังคับ |
|---|---|---|---|
| `CHARGE` | + | ยืนยันการจองแบบเอเจนซี่เก็บเงิน / PAY_LATER ของเอเจนซี่ | bookingKind+bookingId |
| `COMMISSION_NETTED` | − | คู่กับ CHARGE เมื่อหักกลบคอมฯ (settleMode NETTED) | commissionId |
| `WHT_GROSSUP` | + | คู่กับ CHARGE เมื่อเปิดหัก (L2) | commissionId |
| `CHARGE_REVERSAL` | − | ยกเลิก (ยอดตามตารางของ snapshot) | refEntryId |
| `CANCEL_FEE` | + | ค่ายกเลิกที่เอเจนซี่ต้องจ่าย | bookingId |
| `PAYMENT` | − | เอเจนซี่จ่ายเงิน (สลิป/โอน/บัตร) | accountDocId หรือ slipId |
| `WALLET_TOPUP` | − | เติมกระเป๋า | accountDocId |
| `COMMISSION_EARNED` | − | ปิดทริป (ร้านเก็บเงิน · ร้านค้างคอมฯ) | commissionId · `entitledAt` |
| `COMMISSION_PAID` | + | รอบจ่ายคอมฯ | runId · `settledAt` |
| `WHT_WITHHELD` | + | ร้านหักภาษีตอนจ่ายคอมฯ | runId · whtCertDocId |
| `COMMISSION_CLAWBACK` | + | ยกเลิกหลังได้สิทธิ์ | commissionId |
| `ADJUSTMENT` | ± | ปรับมือ (approval บังคับ) | approvalId · เหตุผล |
| `REFUND_TO_AGENT` | + | ร้านคืนเงินกระเป๋า/ยอดเกินให้เอเจนซี่ (เงินออก) | accountDocId |

### I.2 ค่าคงที่
1. ไม่มี UPDATE/DELETE (trigger SQL ปฏิเสธ · ยกเว้นตั้ง `statementId` จาก null ครั้งเดียว) · แก้ = รายการกลับ (`refEntryId`)
2. เขียนผ่าน «agency/ledger.ts» `postEntries(tx, agentAccountId, entries[])` ฟังก์ชันเดียว: `SELECT … FROM "AgentBalance" WHERE "agentAccountId"=$a FOR UPDATE` → seq = lastSeq+1… (ไม่ขาด) → INSERT ทั้งชุด → UPDATE balance (ลำดับล็อก §D.5 ข้อ 9)
3. `balanceSatang = Σ amountSatang` (ข้อสอบเทียบทุกครั้ง) · ทุกรายการมี `idempotencyKey` (เช่น `charge:<bookingId>` · `pay:<slipId>` · `earn:<commissionId>`)
4. วงเงิน: ตรวจตอน `confirm` (ใน tx หลังล็อกหัวสมุด): `exposure = balance + Σ ยอดการจอง HOLD/PENDING ของเอเจนซี่` เทียบ `agency.money.creditLimit` (A13) → `agency.money.overLimitAction` (A14) `WARN` (เดินต่อ + คำเตือน) / `BLOCK` (`CREDIT_LIMIT`) · ค้างเกินกำหนด → ค้างเกิน `agency.money.creditTermDays` ใช้ A14 เหมือนกัน · WALLET: `balance + ยอดใหม่ ≤ 0` (ไม่มีวงเงิน)
5. สองวันของคอมฯ (L3): `entitledAt` (ปิดทริป) กับ `settledAt` (จ่ายจริง/หักกลบในใบแจ้งยอด) แยกคอลัมน์ · เดือนภาษี WHT = เดือนของ `settledAt`
6. เงินลูกค้า SHARK ไม่ถือ: ไม่มีรายการใดหมายถึงเงินอยู่กับ SHARK

### I.3 ใบแจ้งยอด (A1.6)
```ts
generateStatement(ctx, { agentAccountId, periodKey }) → { statementId, created: boolean }   // idempotent ต่อ (agentAccountId, periodKey)
issueStatement(actor, ctx, statementId) → { accountDocId, code }                        // DRAFT → ISSUED · ออกเอกสารบัญชี (H.2) · notify เอเจนซี่
recordStatementPayment(ctx, { statementId, amountSatang, slipId? | accountPaymentRef, idempotencyKey })
```
- เลือกรายการ `statementId IS NULL` ที่เข้าขอบเขต «agency.money.statementScope» (L-11) · ผูก `statementId` ใน tx เดียวกับสร้างใบ (ล็อกหัวสมุดก่อน) · ใบที่ออกแล้วแก้ไม่ได้ — รายการหลังออกไปงวดถัดไป
- ยอดบนใบ = Σ รายการ (ไม่คำนวณใหม่จากการจอง) · ภาพ 13ง: `101,700 + 11,400 − 15,255 + 457.65 − 7,181.50 − 5,000 = 86,121.15` (ฟิกซ์เจอร์ QC ตาม README)
- เลข `ST-<YYMM>-<รหัสเอเจนซี่>-<n>` §K

### I.4 รอบจ่ายคอมมิชชัน (A1.7)
```ts
previewCommissionRun(ctx, { cutoffAt, agentAccountIds? }) → rows[]   // EARNED · settleMode PAYOUT · ไม่ settled · earnedAt ≤ cutoff
createCommissionRun(actor, ctx, { cutoffAt, idempotencyKey }) → runId    // ล็อก AgentCommission ที่เลือก (status EARNED → SETTLING ด้วย CAS)
payCommissionRun(actor, ctx, { runId, paidAt, perAgent: {agentAccountId, financeAccountId}[] })  // WHT คำนวณตาม payeeType ณ paidAt · เอกสาร + สมุด
```
- WHT ต่อเอเจนซี่ต่อการจ่าย: ไม่หักเมื่อยอดจ่าย < `agency.wht.minPerContract` (A27 · เฉพาะผู้รับนิติบุคคล · สัญญาต่อเนื่อง = หักทุกรายการ — P0.2 C2) · อัตราตาม `agency.wht.ruleByPayee` (บุคคลธรรมดา/ต่างประเทศ = ค่าที่ร้านตั้ง + WARN ถ้าเท่ากับอัตรานิติบุคคล — LG §8.4 ข้อ 6)
- เอเจนซี่เก็บเงิน (NETTED) ไม่เข้ารอบจ่าย — ปิดในใบแจ้งยอด

---

## J. Event · งานตามเวลา · route สาธารณะ · PDPA

### J.1 Event (ทุกตัวลง 3 ทะเบียนในใบเดียวกัน: `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` · payload = id + จำนวน + สตางค์ เท่านั้น ห้ามชื่อ/เบอร์/อีเมล/เลขเอกสาร)
| event | ใบ | payload |
|---|---|---|
| `trips.departure.created` · `trips.departure.status_changed` · `trips.departure.below_min` · `trips.departure.cancelled` | T0.3 · T1.2 · T1.6 | departureId · productId · unitId · status · paxSold · minPax |
| `trips.hold.created` · `trips.hold.expired` | T0.4 | holdId · departureId · qty · channel |
| `trips.booking.created` · `.confirmed` · `.part_paid` · `.paid` · `.changed` · `.cancelled` · `.expired` · `.travelled` · `.no_show` · `.paid_after_expiry` | T0.6 · T0.7 · T1.5 | bookingId · unitId · departureId · status · channel · agentAccountId? · amountSatang |
| `trips.payment.due_soon` · `trips.payment.overdue` · `trips.payment.received` | T0.7 | dueId · bookingId · amountSatang · dueAt |
| `trips.refund.requested` · `.approved` · `.done` | T0.7 | requestId · bookingId · amountSatang · choice |
| `trips.passenger.form_completed` · `trips.document.purged` | T0.8 | bookingId · passengerId · kind |
| `trips.waitlist.offered` | T0.4 | waitlistId · departureId · holdId |
| `trips.deckplan.published` | L1.2 | vesselId · versionId · effectiveFrom |
| `ticket.order.created` · `ticket.order.cancelled` · `ticket.order.refunded` · `ticket.admission.scanned` · `ticket.admission.transferred` · `ticket.session.cancelled` (คง `ticket.order.paid` เดิม) | K1.1–K1.5 | orderId · sessionId · qty · totalSatang |
| `agency.account.applied` · `.approved` · `.suspended` | A1.2 | agentAccountId |
| `agency.allotment.released` | A1.4 | allotmentId · slotId · qty |
| `agency.credit.exceeded` | A1.5 | agentAccountId · exposureSatang · limitSatang |
| `agency.statement.issued` · `.paid` · `.overdue` | A1.6 | statementId · agentAccountId · amountSatang |
| `agency.commission.earned` · `.settled` · `.clawed_back` | A1.7 | commissionId · bookingId · amountSatang |
| `supplier.request.sent` · `.confirmed` · `.declined` · `.expired` · `supplier.payable.due` | S1.2 · S1.3 | requestId/payableId · bookingId · supplierId |
- consumer `payment.slip.approved` (ของเดิม `bothMain` · `outbox-consumers.ts:995`) เพิ่มสาขา domain `TRIPS`/`TICKET`/`AGENCY` → «platform/trips-pay.ts» (idempotent ต่อ slipId)
- webhook ของเอเจนซี่ (A2.4) = event ที่มี `agentAccountId` ตรงกับคีย์เท่านั้น

### J.2 งานตามเวลา (`registerMinuteJob` ใน `src/lib/platform/minute-jobs.ts` · ทุกงาน idempotent + เริ่มใหม่ได้ทุกคำสั่ง + เคารพ `signal`)
| name | ทุก | ทำอะไร | ใบ |
|---|---|---|---|
| `trips.expireHolds` | 1 นาที | §D.4 | T0.4 |
| `trips.waitlistOffers` | 5 | เสนอที่ว่างให้รายการรอ | T0.4 |
| `trips.generateDepartures` | ทุกวัน | สร้างรอบล่วงหน้าตามกฎซ้ำ (advisory lock ต่อ schedule) | T0.3 |
| `trips.paymentDue` | 15 | เตือนงวด · ทำเครื่องหมายเลยกำหนด · ปล่อยที่ตาม snapshot | T0.7 |
| `trips.minPaxCheck` | 60 | รอบต่ำกว่าขั้นต่ำเมื่อถึงชั่วโมงตัดสิน → event + การ์ดงานร้าน | T1.2 |
| `trips.autoClose` | 60 | ปิดทริปตาม «trips.ops.autoCloseHoursAfterEnd» | T1.5 |
| `trips.departureCancelDefault` | 15 | เลยเวลาเลือก (T1.6) → คืนเงินอัตโนมัติ | T1.6 |
| `trips.abandonedReminder` | 15 | G6 ตามจองค้าง 1 ครั้ง | T1.8 |
| `trips.pdpaPurge` | daily | ลบไฟล์ `retainUntil` ผ่าน `deleteStoredFile` + `deletedAt` + event | T0.8 |
| `ticket.expireHolds` | 1 | แบบ trips | K1.1 |
| `agency.releaseAllotments` | 15 | §D.1 ข้อ 6 | A1.4 |
| `agency.requestsExpire` | 5 | คำขอเอเจนซี่หมดอายุ → ปล่อยที่ | A1.4 |
| `agency.statements` | daily | สร้าง/ออกใบแจ้งยอดตามรอบ · ค้างชำระ | A1.6 |
| `agency.licenceReminders` | daily | เตือนใบอนุญาตหมดอายุ (ถ้าเปิด · ไม่บล็อก) | A1.2 |
| `supplier.requestTimeouts` | 5 | SENT เลย `respondBy` → EXPIRED | S1.2 |

### J.3 route สาธารณะ (ทางเดียวสำหรับลิงก์/LIFF/ฝัง)
| route | ใคร | หมายเหตุ | ใบ |
|---|---|---|---|
| «/book/[shop]» · «/book/[shop]/[product]» | สาธารณะ | `[shop]` = `Tenant.slug` · `[product]` = `TripProduct.slug`/ตั๋ว · `?a=<AgentLink.code>` `?s=<รหัสพนักงาน>` `?d=<วัน>` `?lang=` · LIFF = route เดียวกัน + `?liff=1` (เปลือก) · ฝัง = route เดียวกันใน iframe ที่ `embed.js` สร้าง | W1.1 · W1.2 · W2.1 |
| «/book/[shop]/my/[token]» | ผู้ถือลิงก์ | ดูการจอง/วอเชอร์ · แก้/ยกเลิก = OTP | W1.3 |
| «/book/[shop]/pay/[token]» | ผู้ถือลิงก์ | จ่ายงวด/จ่ายส่วนตัวเอง (L1.8) | T0.7 · L1.8 |
| «/book/[shop]/form/[token]» | ผู้ถือลิงก์ | กรอกข้อมูลผู้เดินทาง/แบบฟอร์มแพทย์/waiver | T0.8 |
| «/book/embed.js» | สคริปต์ | ตรวจ `Origin`/`Referer` กับ «trips.public.embedDomains» · CSP `frame-ancestors` ตามรายการ | W3.1 |
| «/agent/[shop]/…» | เอเจนซี่ (ล็อกอิน) | session ผูก `AgentAccount` ของร้านนั้น · เปิดใน LIFF ได้ | A2.1–A2.3 |
| «/sp/[token]» | ผู้ให้บริการ | ยืนยัน/ปฏิเสธคำขอจอง (S1.2) | S1.2 |
| «/api/v1/trips» «/api/v1/ticket» «/api/v1/agency» | คีย์ API | เรียก sellable · webhook | X.1 · A2.4 |

**กติกา token**
- token ในลิงก์ = สุ่ม ≥ 128 บิต (base64url 22+ ตัว) · ฐานเก็บ **แฮช** (`publicTokenHash` · `payTokenHash` · `responseTokenHash`) — ต่างจาก `TicketOrder.publicToken`/`HotelReservation.publicToken` เดิมที่เก็บ cuid ดิบ (ของเดิมคงไว้) · ลิงก์ที่ต้องหมดอายุ (แบบฟอร์ม/จ่าย/ผู้ให้บริการ) ใช้ `signLink` (`src/lib/core/signed-link.ts`) เพิ่มชั้น
- ทุกคำค้นด้วย token ผูก tenant ของ `[shop]` ด้วย (token ร้านอื่น = ไม่พบ แบบ `getPublicOrder` เดิม)
- แก้/ยกเลิก/ดูเอกสาร PDPA ของตัวเอง = OTP เบอร์โทร (`CustomerOtp` เดิม) หรือ LINE userId ที่ผูกการจอง · ผลยืนยันอยู่ได้ตามค่าตั้ง
- วอเชอร์/ตั๋ว QR ออฟไลน์ = payload ที่เซ็น HMAC (คีย์แยกป้ายแบบ `private-links.ts`) มี bookingId/admissionId + ประเภท + วัน · ไม่มีชื่อเต็ม · เครื่องไกด์/ประตูตรวจลายเซ็นออฟไลน์ได้ด้วยกุญแจตรวจที่ได้ตอนออนไลน์ (คีย์ต่อร้าน · หมุนได้)

**rate limit** (`checkRateLimitDb` `src/lib/core/rate-limit-db.ts:38` · คำสั่งเดียว) — คีย์ `trips:hold:<shop>:<clientKey>` · `trips:otp:<bookingId>` · `trips:token:<clientKey>` (เดา token) · `agent:api:<keyId>` · ค่าเพดาน = ค่าตั้ง «trips.public.rateLimits» (schema มีขั้นต่ำที่ร้านลดไม่ได้ต่ำกว่า — L-22) · เพดานถือพร้อมกันต่อผู้ติดต่อ (G26) ตรวจใน tx ถือ

### J.4 PDPA (T0.8 · L1.6)
- ไฟล์พาสปอร์ต/แบบฟอร์มแพทย์/waiver = `uploadFile(visibility "private")` (`src/lib/storage/service.ts:209`) · เปิดดูผ่าน `privateFileUrl(fileId, ttl ≤ 900s, viewer)` (`private-links.ts:95`) เท่านั้น · DTO ห้ามมี URL CDN ถาวร (X10)
- ทุกการเปิด = แถว `TripDocView` ใน tx เดียวกับออกลิงก์ · จอแสดงปิดบัง (`docLast4` · ปีเกิด) ตาม «trips.pdpa.maskOnScreen»
- เลขเอกสารเก็บเข้ารหัส (`docNumberEnc` · กล่องปิดแบบ `HotelGuestRecord.idNumberEnc`) + `docLast4`
- แบบฟอร์มแพทย์: ช่องยินยอมแยก (`trips.pdpa.healthDataProducts` (T62 · เปิดเฉพาะสินค้าที่ต้องใช้ · §13.1 L12)) · เอเจนซี่ไม่เห็นโดยค่าเริ่ม (`agency.privacy.seeHealthForms` A34 · L12) · ร้านเห็นเฉพาะผู้มีสิทธิ์ `trips.passenger.health`
- `retainUntil` คำนวณตอนบันทึกไฟล์จาก `trips.pdpa.retention` (T61) (นับจากวันจบทริป) · งาน `trips.pdpaPurge` ลบไฟล์จริง + เคลียร์ช่องเข้ารหัส + `deletedAt` (แถวคงไว้เป็นหลักฐานว่าลบแล้ว)
- ลูกค้าของเอเจนซี่ (R3): `marketingEligible = false` ⇒ Party ของผู้เดินทางไม่ถูกเพิ่มเข้า segment/แคมเปญ (member facade กรองด้วยธงนี้) · ข้อความบริการตาม `messageMode` (R5) ตรวจใน «trips/notify.ts» ก่อนเรียก `notifyCustomer`

---

## K. เลขเอกสาร — เจ้าของ T0.6 («trips/numbering.ts») · K1.1 (ตั๋ว) · A1.6 (ใบแจ้งยอด)

| ชุด | รูป | ตัวอย่างในภาพ | งวด | ตัวนับ |
|---|---|---|---|---|
| ทัวร์ | `TR-<YY พ.ศ.><MM>-<NNNN>` | TR-6911-0142 · TR-6912-0188 | เดือนของ **วันเดินทาง** (เวลาร้าน) | `TripsCounter(series "TR", period "6911")` ต่อ tenant |
| Liveaboard | `LB-<YYMM>-<NNNN>` | LB-7002-0031 · LB-7002-0029 | เดือนออกเรือ | series "LB" |
| ตั๋ว | `TK-<YYMM>-<NNNN>` | TK-6911-0318 | เดือนเข้าชม (ตั๋วไม่ระบุวัน = เดือนที่ขาย) | series "TK" · คอลัมน์ใหม่ `TicketOrder.code` (`orderNo` เดิมคง) |
| ใบแจ้งยอด | `ST-<YYMM>-<รหัสเอเจนซี่>-<n>` | ST-6911-PTD-1 | เดือนสิ้นงวด | series `"ST:<agentCode>"` |
| รอบคอมฯ | `CR-<YYMM>-<NN>` | — | เดือนตัดยอด | series "CR" |
| ใบเสร็จ/ใบกำกับ | **ไม่ใช่ของ trips** | RC-6911-0588 | — | เลขจริง = `PosSale.receiptNo` (`YYYYMM-NNNN` `pos/service.ts:1013`) หรือเลขเอกสารบัญชี (`nextDocNo`) · ภาพ = ตัวอย่างการแสดงผล (L-14) |

**จองเลขแบบอะตอม** (คำสั่งเดียว · ใน tx ของการจอง · ลำดับล็อก §D.5 ข้อ 7 · แบบ `pos/deposit.ts:508`)
```sql
INSERT INTO "TripsCounter" ("id","tenantId","series","period","seq") VALUES ($id, $tenant, $series, $period, 1)
ON CONFLICT ("tenantId","series","period") DO UPDATE SET "seq" = "TripsCounter"."seq" + 1
RETURNING "seq";
```
- prefix = ค่าตั้ง («trips.sell.codePrefix» ต่อหน่วย/ชนิดสินค้า · «ticket.sell.orderPrefix») — ค่าเริ่ม TR/LB/TK (คีย์ใหม่ §E.4 · L-41) · ตัวนับต่อ (tenant, prefix) ⇒ เปลี่ยน prefix = ชุดใหม่
- เลขขาดได้เมื่อ tx ล้มหลังจอง? ไม่ — increment อยู่ใน tx เดียวกัน rollback คืนเลข · ไม่สัญญาว่าไม่มีช่อง (การจองถูกลบไม่มี แต่ HOLD→EXPIRED ใช้เลขไปแล้ว) · เลขจองไม่ใช่เอกสารภาษี จึงไม่ต้องต่อเนื่อง
- `[0-9]{4}` เต็ม (9999) ⇒ ขยายเป็น 5 หลักอัตโนมัติ (ไม่ล้ม)
- **ไม่ใช้** รูปแบบ `max+1` (`ticket/service.ts:218` ไม่มีล็อก → ชนพร้อมกันได้ · `hotel/booking.ts:489` advisory lock + max) สำหรับเลขใหม่

---

## L. คำถามเปิด / จุดที่โค้ดจริงขัดกับแผน (ทุกข้อมีค่าเริ่มที่เสนอ — ผู้คุมเคาะก่อนใบที่ระบุ)

| # | เรื่อง | ที่มา (โค้ด/แผน) | ค่าเริ่มที่เสนอ | ก่อนใบ |
|---|---|---|---|---|
| L-1 | **`/b/[slug]` ถูกใช้แล้ว** เป็นพอร์ทัลบริษัทของ CRM (`src/app/b/[slug]/page.tsx` + fitness F2.3/F2.4 ผูกโฟลเดอร์ `src/app/b`) · แผน MP ข้อ 10 ใช้ `/b/[shop]` | ชนตรง | ใช้ «/book/[shop]/…» (ลิงก์/LIFF/ฝัง) + «/agent/[shop]/…» · ภาพ/README แก้ข้อความ URL เป็นตัวอย่าง | W1.1 |
| L-2 | ทะเบียนค่าตั้งผูกตัวตรวจกฎหมายกับ `TH_RENTAL_2568_RULES` ตายตัว (`registry.ts:11,139,196` · `types.ts:9`) · `evaluateLegal` มีระดับ BLOCK + โหมด STRICT · P0.2 (c) | ขัด §E.5 | **ตัดสิน**: «legal/index.ts» ทะเบียนรวม + «legal/th-tour-2569.ts» (W01–W46 · `maxLevel: "WARN"`) · T0.1 ตรวจเข้ม (แตะเครื่องยนต์ R0.3) · ข้อสอบ R0.3/D.1 เดิมต้องเขียวเท่าเดิม | T0.1 |
| L-3 | `SettingDomain` · `SCOPE_KINDS` · `ScopeRefs` · `REF_FIELD` · `SUPPORTED_SCOPES` · `locateMany` · `entitiesOfUnit` ปิดตายตัว (`types.ts:13,33` · `service.ts:84–98,205,281`) | ต้องแก้ core | T0.1 เพิ่ม 5 scope + 3 domain ทีเดียว (ชนิด) · ส่วน locate เพิ่มโดยใบที่สร้างตาราง (§E.1) · `chainProblem` เพิ่มกฎลำดับชั้นใหม่ | T0.1 |
| L-4 | `refsFor()`/`snapshotPolicy({scope,scopeId})` คืน null เมื่อ entity ไม่มี unitId (`service.ts:429,481`) — AGENT/AGENT_TIER เป็นระดับร้าน | ขัดการใช้ AGENT | ผู้เรียกส่ง `ScopeRefs` เต็มเสมอ · ไม่แก้ `refsFor` | A1.1 |
| L-5 | `snapshotPolicy` อ่านด้วย `prisma` นอก tx | สังเกต | เรียกก่อนเปิด tx จอง · ยอมรับช่วงเวลาเล็กที่ค่าตั้งอาจเปลี่ยนระหว่าง quote→confirm (snapshot = ค่า ณ `at`) | T0.5 |
| L-6 | `enum UnitType` ไม่มี TRIPS (`core.prisma:63`) · `SettingUnitType` = HOTEL/DORM/BOOKING/POS | ต้องเพิ่ม | `ALTER TYPE "UnitType" ADD VALUE 'TRIPS'` ใน T0.1 · ตั๋วใช้หน่วย `TICKET` เดิม · ร้านดำน้ำที่ขายทั้งคู่ = 2 หน่วย | T0.1 |
| L-7 | `notifyCustomer` รับ domain แค่ `booking`/`rooms` (`notify-customer.ts:35,182`) | ต้องขยาย | เพิ่ม `trips`/`ticket`/`agency` (ข้อความ = `<domain>.msg.<ชนิด>`) · ใบ T1.8 แก้ไฟล์ platform (ตรวจเข้ม) | T1.8 |
| L-8 | `PaymentSlip.domain` = BOOKING/DORM/HOTEL และ `SLIP_DOMAIN_REF` บังคับ 1 refType ต่อ domain (`slip-verify.ts:219`) | ต้องขยาย | เพิ่ม `TRIPS→TRIP_DUE` · `TICKET→TICKET_ORDER` · `AGENCY→AGENT_CHARGE` (ค่าที่สองของเอเจนซี่ เช่น ใบแจ้งยอด ใช้ refType เดียวกันโดย refId ชี้ใบแจ้งยอด — หรือขยายให้ 1 domain หลาย refType: เสนอ **ขยายเป็นรายการ**) + CHECK ใน SQL ถ้ามี | T0.7 |
| L-9 | POS: (ก) `moduleTakeDeposit` รับยอดเดียว คิด VAT ทั้งก้อน ⇒ บรรทัดเก็บแทนนอกฐาน VAT ไม่ได้ (ข) บิลหนึ่งใช้มัดจำได้ ≤ 3 ใบ (`pos/service.ts:354`) ⇒ จ่ายแยกคน Liveaboard ปิดบิลไม่ได้ (ค) `moduleRefundDeposit` คืน "ทั้งคงเหลือ" ⇒ คืนบางส่วนต้องผ่านบิลค่าธรรมเนียมก่อน (ง) ไม่มีทาง "มัดจำ → เครดิตร้าน" | ขัด MP ข้อ 6 / TA §13 L4–L5 / Q15 | การแตะ POS ต้องได้อนุญาตเจ้าของ (แบบ SVC "POS 2 จุด") · เสนอขออนุญาต 3 จุด: `ModuleDepositInput.lines[]` พร้อม taxKind · เพดานใบมัดจำต่อบิลเป็นค่าตั้ง (หรือ `moduleDepositForBill` รวมหลายใบ) · ฟังก์ชันแปลงคงเหลือเป็น STORE_CREDIT · ถ้าไม่อนุญาต: เก็บแทนเป็นบิลแยกไม่ใช่มัดจำ (§H.1) · จ่ายแยกคน = ใบรับต่องวดรวม + การจัดสรรต่อคนในตาราง trips · เครดิต = ปิดใช้จนกว่าจะมี | T0.7 (ถามก่อน P0 ปิด) |
| L-10 | facade บัญชีไม่มี: ใบแจ้งหนี้ sourceKind TRIPS · รับล่วงหน้าเอเจนซี่ · ค่าคอมฯ ค้างจ่ายผูกการจอง · เจ้าหนี้ผู้ให้บริการ (มีแค่ `createExpenseDoc` DRAFT) · ออก 50 ทวิ (`issueWhtCert`/`issueWhtCreditCert` อยู่ใน `account/wht.ts` ไม่อยู่บน facade · F2.2 ห้ามล้วง) | ขาดของ | เพิ่ม overload/ฟังก์ชันใน `account/index.ts` แบบ DORM D.2 (ทางเดิมไม่เปลี่ยนแม้ไบต์เดียว) · ใบเจ้าของ: T0.7 («createExternalInvoice TRIPS»), A1.5 («postAgencyAdvance»), A1.7 (คอมฯ+WHT), S1.3 («createExternalBill») · ผู้ตรวจบัญชีดูผังบัญชี (รหัส "ค่าคอมฯ ค้างจ่าย" · "เงินรับแทน") | T0.7 |
| L-11 | เอเจนซี่เครดิต: ใบแจ้งหนี้ลงรายได้ทันที ⇒ ขัด "รับรู้เมื่อปิดทริป" · ภาพใบแจ้งยอด 1–15 พ.ย. ไม่ระบุว่ารวมการจองเดินทางอนาคตไหม | ต้องเคาะ | «agency.money.statementScope» ค่าเริ่ม = **เดินทางแล้วในงวด** (ใบแจ้งหนี้) + งวดที่ถึงกำหนดของการจองอนาคต = รับล่วงหน้า · ให้นักบัญชียืนยัน (ป้าย) | A1.6 |
| L-12 | ตั๋ว: ตัวนับจริงอยู่ที่ `TicketType.quota/sold` ระดับอีเวนต์ (`ticket.prisma:64`) · แผนมีแค่ 3 ตาราง ไม่มีตัวนับต่อรอบ×ประเภท | ขาดของ | ใช้ `TicketChannelQuota(type,"*")` เป็นโควตาต่อประเภทของรอบ · `createOrder`/`cancelOrder` เดิมเปลี่ยนไปตัดที่รอบใน K1.1 · `TicketType.sold` หยุดเดิน (คงอ่าน) | K1.1 |
| L-13 | เลขตั๋ว: `orderNo` เดิม `TO-<YYMMDD ค.ศ.>-NNNN` คิดแบบ max+1 ไม่ล็อก (`ticket/service.ts:216–224`) · รหัสตั๋วรายใบเดิมขึ้นต้น `TK-` + สุ่ม 10 (`:37`) · ภาพใช้ `TK-6911-0318` เป็นเลขออเดอร์ | ชนรูปแบบ | ออเดอร์ใหม่ได้ `code` `TK-YYMM-NNNN` จากตัวนับ (orderNo เดิมคง) · รหัสตั๋วรายใบคง `TK-` + 10 ตัว (รูปต่างกันชัด · `checkIn` ค้นตรงตัว) · หรือเปลี่ยน prefix ออเดอร์ค่าเริ่มเป็น `TO` — ผู้คุมเลือก | K1.1 |
| L-14 | `RC-6911-0588` ในภาพ 13 ไม่ใช่รูปเลขใบเสร็จของ POS (`YYYYMM-NNNN`) หรือของบัญชี | ภาพ≠โค้ด | trips ไม่ออกเลข RC · แสดงเลข POS/บัญชีจริง · ภาพถือเป็นตัวอย่าง (ข้อสอบภาพคู่ไม่เทียบเลขนี้) | T0.7 |
| L-15 | งวดของเลขจอง: ภาพบอกนัย "เดือนเดินทาง" (LB-7002 จองก่อน พ.ย. สำหรับ ก.พ.) | อนุมาน | ใช้เดือนเดินทาง (พ.ศ. 2 หลัก) · เลื่อนวันไม่เปลี่ยนเลข | T0.6 |
| L-16 | fitness F5 (raw prisma ในโมดูล) เป็น ratchet | ต้อง ORACLE-EDIT | baseline +2 (`trips/capacity.ts` · `agency/ledger.ts`) · ticket ใช้ไฟล์ที่นับอยู่แล้ว · supplier ไม่มี SQL ดิบ | T0.4 · A1.5 |
| L-17 | `ALLOWED_EDGES` ต้องเพิ่ม ~20 เส้น (§A.3) · ทิศ trips→agency ทำให้ agency เรียกข้อมูลสินค้าไม่ได้ตรง | ต้องเคาะ | ตาม §A.3 · พอร์ทัลเอเจนซี่อ่านสินค้าผ่าน «platform/sellables.ts» (`availability`/`quote`) | P0.3 ปิด |
| L-18 | ล็อกอินเอเจนซี่: พนักงานร้านใช้ `Membership` · ลูกค้าใช้ `CustomerSession` ต่อ tenant · ไม่มี session ข้ามร้านสำหรับคนนอก | ขาดของ | `AgentIdentityUser.userId` = `User` แพลตฟอร์ม (global) + session cookie แยกขอบเขต "agent" (เลือก AgentAccount ต่อร้าน) · ผ่านผู้ตรวจความปลอดภัย · ไม่ให้สิทธิ์ใดในแอปร้าน | A1.2 |
| L-19 | พอร์ทัลบริษัท CRM (`/b/[slug]`) มีระบบล็อกอิน B2B อยู่แล้ว | ทางเลือก | ไม่ใช้ร่วม (บทบาท/ขอบเขตต่างกัน · F2.3 ผูกโฟลเดอร์) · อาจยืมส่วน OTP | A1.2 |
| L-20 | `LINK_PURPOSES` ของ `ChatLinkCode` ปิด 3 ค่า (`chat/link-code.ts:20`) | ต้องขยาย | + `TRIP_BOOKING` · `AGENT_ACCOUNT` (ผูก LINE ผู้จอง/เอเจนซี่) | W2.1 |
| L-21 | โควตาเคบินเอเจนซี่ Liveaboard: ทั้ง `TripUnit.status=ALLOTTED` และตัวนับ `reserved` ต้องเดินคู่ | ความซับซ้อน | ใช้ทั้งคู่ในคำสั่งเดียวกันของ tx (§D.2) · ข้อสอบคงที่เทียบสองฝั่ง | L1.12 |
| L-22 | rate limit / เพดานความปลอดภัย เป็น "ค่าคงที่ในโค้ด" ไหม (มติรอบ 4 ห้ามค่าคงที่) | ขัดกันเชิงหลัก | เป็นค่าตั้ง แต่ zod schema มีพื้นขั้นต่ำ (ร้านเข้มขึ้นได้ ลดต่ำกว่าพื้นไม่ได้) · พื้นอยู่ใน defs (ไม่ใช่ในโค้ดธุรกิจ) | W1.1 |
| L-23 | ค่าธรรมเนียมยกเลิก/ริบจากมัดจำที่ออกใบกำกับ (VAT) ไปแล้ว · §13.1 L4: ไม่ออกใบลดหนี้อัตโนมัติ (T39 ร้านเลือก) · `trips.tax.cancelFeeVat` (T38) | ภาษี (U3 ยังไม่ยืนยัน) | ค่าเริ่ม T39 ตาม TRIPS-DEFAULTS: บิลค่าธรรมเนียมใช้มัดจำ ไม่ออก CN ส่วน VAT · เลือก "ออกใบลดหนี้" ได้ · ป้าย 🧾 | T0.7 |
| L-24 | การจองถือที่ตอนจ่าย: แผนบอก "hold → pending → …" | ตีความ | แถวการจองเกิดตอน confirm สถานะ `HOLD` (ต้องมีเลข/ลิงก์จ่ายก่อนเงินเข้า แบบโรงแรม) · `TripHold` ยังเป็นตัวถือที่ (§G.1) | T0.6 |
| L-25 | แผนไม่มีใบ migration ของผู้ให้บริการ | ขาดของ | ตาราง `Supplier*` อยู่ใน migration A1.1 (A1 มาก่อน S1.1 ในเลน ข) · หรือ S1.1 ทำ migration «supplier» เอง | A1.1 |
| L-26 | "ตารางค่าอุทยาน" เป็นค่าตั้ง (LG `trips.parkFee.table` (T45)) หรือข้อมูล | ตีความ | ค่าตั้งชนิด table + effectiveDated (ชั้น U·V·P) ตาม LG §8.1 | T0.5 |
| L-27 | ช่วงอายุเด็กอยู่ทั้งในค่าตั้ง (`trips.pax.childAgeBand` T27) และ `TripPaxType.ageMin/Max` | ซ้ำ | `TripPaxType` null = อ่านค่าตั้ง · ตั้งที่ประเภทคน = ทับ | T0.2 |
| L-28 | `HOTEL` ในทะเบียนชนิดสินค้า แต่โรงแรมไม่ implement sellable ใน RUN นี้ | ขอบเขต | ประกาศจองไว้ · `AgentRate.productKind = HOTEL` บันทึกได้แต่ใช้ไม่ได้ (คำเตือน) — หรือปฏิเสธจนเฟส 2 (เสนอ: ปฏิเสธ) | A1.3 |
| L-29 | ระดับเอเจนซี่เป็นตาราง (`AgentTier`) หรือข้อความ | ต้องเคาะ | ตาราง ต่อร้าน (scope AGENT_TIER ต้องมีแถวให้ locate) | A1.1 |
| L-30 | ลำดับชั้น: P0.2 วาง PRODUCT หลัง AGENT ในบางคีย์ (A5 A16 A18 A19 A20) ขัดลำดับปริยาย §E.2 | ตัดสินแล้ว | ยอมรับ chain ต่อคีย์ตาม TRIPS-DEFAULTS · ไม่เพิ่มกฎบังคับลำดับใน `chainProblem` · ผลรวมเอเจนซี่×สินค้าเฉพาะ = `AgentRate` / `AgentAllotment` | T0.1 |
| L-31 | ทะเบียนห้าม snapshot kind เดียวมีคีย์หลายโดเมน (`registry.ts:151`) | ขัด "snapshot เดียว" | 3 kind แล้วห่อ (§F.2) | T0.5 |
| L-32 | `ticket` ไม่มี facade · `ticket/service.ts` ล้วง `pos/service` | หนี้เดิม | K1.1 สร้าง `ticket/index.ts` · โค้ดใหม่ใช้ facade POS · ของเดิมไม่ย้าย (ไม่ขยายขอบเขต) | K1.1 |
| L-33 | `TicketOrder.publicToken` / `HotelReservation.publicToken` เก็บ cuid ดิบ | แบบเดิมอ่อนกว่า | ของใหม่เก็บแฮช (§J.3) · ของเดิมไม่แตะ | W1.1 |
| L-34 | สถานะตั๋วเป็น Prisma enum (`TicketOrderStatus`) | ข้อจำกัด | ไม่เพิ่มค่า enum · สถานะถือ/หมดอายุของตั๋วอยู่ที่ `TicketHold` | K1.1 |
| L-35 | **บิลบนเรือ**: `HotelFolio.reservationId` = FK บังคับไป `HotelReservation` (`hotel.prisma:396`) · แผน L1.9 "ใช้ HotelFolio" | ขัดโครงสร้าง | ทางเลือก: (ก) «TripFolio» ลอกรูป `HotelFolio`/`HotelFolioItem` (เสนอ) (ข) แก้ `HotelFolio.reservationId` เป็น nullable + `tripBookingId` (แตะตารางโรงแรม · ไม่ add-only) (ค) บิลค้าง POS (`PosHeldCart`) ต่อเคบิน | L1.9 |
| L-36 | `PosSale.sourceModule` เป็นข้อความ ("TRIPS" ใหม่) · รายงาน/ช่องทาง POS (`defaultChannelCode(sourceModule)`) อาจไม่รู้จัก | ตรวจ | T0.7 ตรวจว่ารายงาน POS/คอมฯ ช่องทางไม่พังกับ sourceModule ใหม่ · ช่องทางขายของบิล = "TRIPS" หรือ WEB | T0.7 |
| L-37 | P0.2 (b): `setSettings` บังคับเหตุผล ≥ 10 ตัวอักษรเมื่อรับคำเตือน (`service.ts:943`) · WARN ของหอมีสายอนุมัติเจ้าของ | ตัดสินแล้ว | โดเมน trips/agency/ticket: คงการรับทราบ (`ackLegalWarn`) · **ไม่บังคับเหตุผล** · ไม่มีสายอนุมัติ · หอ/จองคิวเดิมทุกไบต์ (§E.5 ข้อ 3) | T0.1 |
| L-38 | ภาพ 04ก/05 (฿86,300) กับ 13ง (฿86,121.15) ตัวเลขชุดต่างกัน | ภาพไม่ตรงกัน | ฟิกซ์เจอร์ QC ใช้ชุด 13ง (มติรอบ 5) · ข้อสอบภาพคู่ 04ก/05 ยกเว้นตัวเลขยอดรวม | A2.1 |
| L-39 | ตั๋วไม่ระบุวัน (open-dated) ไม่มีรอบ — ตัดที่จากไหน | ช่องว่าง | สร้าง `TicketSession` เสมือนต่อ "ช่วงใช้ได้" (เช่น รายเดือน) ที่ capacity = โควตาขายล่วงหน้า · เข้าประตูไม่ตัดที่ | K1.2 |
| L-40 | `trips→agency` ใน tx: การจองเรียก `agency.postEntries`/`claimAllotment` ใน tx ของ trips ⇒ facade agency ต้องรับ `tx` | รูปแบบ | ฟังก์ชัน `*InTx(tx, …)` ใน facade agency (แบบ `queue/service.issueTicketTx`) · ไม่มี `$transaction` ซ้อน | A1.4 · A1.5 |
| L-41 | คีย์ที่สัญญานี้ใช้แต่ไม่อยู่ใน 122 คีย์ของ TRIPS-DEFAULTS (ตาราง §E.4 ล่าง: confirmMode · codePrefix · fx.rates · public.* · cancel.autoApproveUpTo · ops.* · pdpa.viewLog/mask · supplier.* · quota.requestFirst/returnCancelledToQuota · money.statementScope) | ขาดค่าเริ่ม | P0.2 เติมภาคผนวก (ไม่เปลี่ยนชื่อ 122 คีย์เดิม) ก่อนใบที่ใช้ · ระหว่างนี้ใบนั้นห้ามเดาตัวเลข | T0.4 |
| L-42 | `notifyCustomer` อ่านข้อความจากคีย์ `${domain}.msg.${messageKey}` ชนิด template ต่อข้อความ (`notify-customer.ts:183`) แต่ TRIPS-DEFAULTS มีแค่ `trips.msg.enabled` (T69) / `ticket.msg.enabled` (K13) เป็นตารางเปิดปิด — และคีย์ `trips.msg.enabled` จะถูกตีความเป็น messageKey "enabled" | ชนแบบแผน | template ต่อข้อความ `trips.msg.<ชนิด>` (กลุ่ม msg) + เก็บ T69 เป็นสวิตช์รวมโดยเปลี่ยนชื่อเป็น «trips.msgSwitch.enabled» (หรือให้ `notifyCustomer` ข้าม messageKey "enabled") — ผู้คุมเลือก · เสนอเปลี่ยนชื่อ | T1.8 |
| L-43 | P0.2 C9: ค่าอุทยาน ฿600/฿300 ของร้านตัวอย่างไม่ตรงตารางทางการ T45 ⇒ ฟิกซ์เจอร์จะเรียก W05 ทุกการจอง | ฟิกซ์เจอร์ | ฟิกซ์เจอร์ P0.1 เพิ่มแถว "เกาะราชา" ของร้านใน T45 (ร้านแก้ตารางได้) · ข้อสอบ W05 ใช้กรณีแยก | T0.7 |
| L-44 | `trips.tax.vatRegistered` (T33) เป็นค่าตั้ง แต่สถานะจด VAT จริงอยู่ที่สมุดบัญชี (`vatConfigOf` `account/index.ts:50`) | สองแหล่ง | ค่าเริ่มของ T33 = อ่านจากสมุดที่ผูกหน่วย (ไม่มีสมุด = ค่าแม่แบบ) · ต่างกัน = WARN · เอกสารเงินจริงใช้ค่าของสมุดเสมอ | T0.7 |
| L-45 | ตารางยกเลิกขั้นต่ำ (ประกาศ 2563) ใช้กับ trips เท่านั้น ไม่ใช่ตั๋วเข้าชม (P0.2 C5) · ตารางภาพ 03 เข้มกว่าขั้นต่ำ | ตัดสินแล้ว | W01 ทำงานบนโดเมน trips (รวม LIVEABOARD) · ticket ใช้ K5 ไม่มีคำเตือนขั้นต่ำ · ภาพ 03 = ค่าร้านสมมติ จอค่าตั้งแสดง W01 | T0.7 |
| L-46 | P0.2 (c): ticket `_fallback` ต้องเป็นพฤติกรรม MVP เดิม แต่ K1.1 เปลี่ยน createOrder ไปตัดที่ตามรอบ (L-12) | ตัดสินแล้ว | `_fallback` ของ ticket: ไม่มีถือที่หมดเวลา · ไม่ปิดรับ · ไม่คืนเงินอัตโนมัติ · ช่องทางเดียวจากที่ว่างรวม (§E.5 ข้อ 8) · ตัวนับย้ายไปรอบ default ที่ backfill แต่ผลต่อร้านเดิมเท่าเดิม (ข้อสอบเทียบก่อน/หลัง) | K1.1 |
| L-47 | กลุ่มดำน้ำ (G8 · T49 อัตราผู้ควบคุม 1:4 / 1:2 · T50 กล้อง) ไม่มีตารางใน migration ใดของสัญญานี้ | ขาดตาราง | ใบ L1.10 เพิ่ม «TripDiveGroup» + «TripDiveGroupMember» (migration ย่อย add-only · ตรวจเข้ม) · W ตามอัตราเป็นคำเตือนตอนจัดกลุ่ม | L1.10 |
| L-48 | §13.1 L13 คำขอลบข้อมูลต้องเสร็จใน 90 วัน + ROPA อัตโนมัติ (T64 T65) — ไม่อยู่ในใบใดของแผนโดยตรง | ขอบเขต | `TripPdpaRequest` ใน migration T0.1 · คิวคำขอ + ROPA ร่างอยู่ในใบ T0.8 | T0.8 |
| L-49 | TA §13.1 อ้าง "ข้อสอบจากกฎ 52 ข้อ" แต่ LG §11 มี 47 แถว (P0.2 C7) | ตัวเลขเอกสาร | ใช้ 47 + คู่ W01–W46 · ผู้คุมแก้ข้อความใน TA/MP | — |
