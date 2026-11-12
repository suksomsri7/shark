# TRIPS-CORE-CONTRACT — สัญญาชิ้นกลางของ RUN "TRIPS" (ตั๋ว · ทัวร์ · Liveaboard · เอเจนซี่ · ผู้ให้บริการ)

> **รอบ 3 (12 พ.ย. 2569)**: ปิดข้อค้างของผลตรวจรอบ 2 `ledger/wo-notes/trips-P0.3-review-r2.md` (N-1–N-11 · m-1 m-2) · ป้าย "(แก้รอบ 3)" · เพิ่ม §D.6 และ §N (ค่าที่ใบสั่ง T0.1/T0.5 ต้องกำหนด)
> **รอบ 2 (12 พ.ย. 2569)**: แก้ตามผลตรวจอิสระ `ledger/wo-notes/trips-P0.3-review-r1.md` (FIX FIRST · B-1–B-3 · M-1–M-15 · m-1–m-16 · C-1–C-12) + มติผู้คุม 15 ข้อ · ย่อหน้าที่แก้ติดป้าย "(แก้รอบ 2)" · ข้อที่ไม่เห็นด้วยกับผู้ตรวจอยู่ §M · ของที่ต้องขออนุญาตเจ้าของอยู่ §L.1 · คีย์ที่เพิ่มอยู่ภาคผนวก ก ของ `ledger/TRIPS-DEFAULTS.md`
> เขียน 12 พ.ย. 2569 · ใบ P0.3 · ⚠️ เอกสารเท่านั้น — ยังไม่แตะโค้ด · รอผู้ตรวจอิสระ 1 รอบ (MASTER-PLAN §3 P0.3)
> **ไฟล์นี้อยู่เหนือ** `ledger/DESIGN-TRIPS-AGENCY.md` (TA) และ `ledger/TRIPS-MASTER-PLAN.md` (MP) §2 ในทุกเรื่อง "ชื่อ/ที่อยู่/ตาราง/หน้าสัมผัส/ลำดับล็อก/รูป snapshot" — TA (รวม §13.1 ผลกฎหมายรอบ 2 ที่ทับ §13) ยังเป็นแหล่งของ **พฤติกรรม หน้าจอ** · **ชื่อคีย์ ชนิด ชั้น ค่าเริ่ม และคำเตือน W01–W46 อยู่ใน `ledger/TRIPS-DEFAULTS.md` (P0.2) — ชื่อคีย์ในไฟล์นั้นชนะไฟล์นี้** · กฎหมาย `ledger/LEGAL-TRIPS-TH.md` ฉบับรอบ 2 (N1–N26 · §10 · §11)
> ต่อยอด `ledger/SVC-CORE-CONTRACT.md` (CC) — ค่าตั้งแบบชั้น (CC §1) · ศูนย์เชื่อมต่อ (CC §2) · `PaymentSlip` (CC §3) · `notifyCustomer()` (CC §4.4) · `signLink` (CC §4.5) · แบบแผน `RoomOccupancy`/`Channel*` (CC §5) **ใช้ของเดิม ไม่สร้างใหม่**
> ตรวจกับโค้ดจริงใน worktree `shark-trips` (branch `session/trips` @04e9fd610 · มีชิ้น SVC ครบ) · ชื่อที่ **ยังไม่มี** เขียนใน «…» · ของที่มีจริงเขียนใน backtick
> หน่วยเงิน = Int **สตางค์** (สกุลต่างประเทศ = Int หน่วยย่อย "minor" เช่น cent) · เวลา = `DateTime` UTC · วันเดินทาง = `@db.Date` วันตามเขตเวลาร้าน (แบบ `HotelBookingNight.date`)
> เจ้าของไฟล์ชิ้นกลาง = ใบที่ระบุใน §A · ใบอื่น **ห้ามแก้ไฟล์ชิ้นกลาง** — ต้องการเพิ่ม = เขียนคำขอใน wo-notes → ผู้คุมตัดสิน (แบบ CC หัวไฟล์)

**มติเจ้าของที่ห้ามขัด (ยกมาเพื่อกันลืม):** SHARK ไม่ถือเงินลูกค้า (R1/Q16) · ไม่บล็อก/ไม่ตรวจใบอนุญาต ตัวตรวจกฎหมาย = `OK`/`WARN` เท่านั้น (รอบ 3) · ทุกค่า = ค่าเริ่มต้นที่ร้านปรับได้ในค่าตั้งแบบชั้น ไม่มีค่าคงที่ในโค้ด (รอบ 4) · ลูกค้าของเอเจนซี่ไม่เข้ารายชื่อการตลาดของร้านโดยค่าเริ่มต้น (Q17) · เฟส 2 (เอเจนซี่ย่อย · ผังที่นั่งตั๋ว · เครือข่ายข้ามร้าน · ภาษาจีน) ไม่สร้าง แต่ตัวตนเอเจนซี่ระดับแพลตฟอร์มตั้งแต่วันแรก (Q7) · หลายสกุลเงินและจ่ายแยกคน **เฉพาะ Liveaboard** (Q4/Q15) · หน้าจองสาธารณะ = route เดียวสำหรับลิงก์/LIFF/ฝัง (MP §2 ข้อ 10)

---

## 0. สรุปการเคาะ (อ่านข้อนี้พอถ้ารีบ) — (แก้รอบ 2: ตามผลตรวจ `ledger/wo-notes/trips-P0.3-review-r1.md` + มติผู้คุม 15 ข้อ)

| # | เรื่อง | แผน/แบบเรียก | **เคาะ (ใช้ชื่อนี้)** |
|---|---|---|---|
| TC1 | โมดูล | trips · ticket · agency · supplier + core/sellable | «src/lib/modules/trips/» · `src/lib/modules/ticket/` (เพิ่ม «index.ts») · «src/lib/modules/agency/» · «src/lib/modules/supplier/» · **«src/lib/core/sellable.ts» บริสุทธิ์ (ชนิดเท่านั้น)** + ตัวประกอบที่เรียกโมดูลจริงอยู่ชั้น platform «src/lib/platform/sellables.ts» · «src/lib/platform/basket.ts» (core ห้าม import โมดูล) |
| TC2 | ทิศ import | — | trips→agency · trips→supplier · ticket→agency · ทุกตัว→pos/account/party/approval/chat ผ่าน facade · **agency และ supplier ไม่ import trips/ticket** (อ่านชื่อสินค้าผ่าน platform) — §A.3 |
| TC3 | ตัวตนเอเจนซี่ (แก้รอบ 2) | AgentIdentity/AgentAccount | «AgentIdentity» แกน `global` เก็บ **เฉพาะที่ใช้จำว่าเป็นเอเจนซี่เดียวกันข้ามร้าน** (ชื่อแสดง · รหัสสาธารณะ · แฮชเลขภาษีไม่บังคับ) · ข้อมูลภาษี/เงิน/ติดต่อ/เลขบัตรบุคคล อยู่ที่ «AgentAccount» ต่อร้าน (แก้ได้เฉพาะร้านนั้น) · ล็อกอิน = «AgentUser» ระดับแพลตฟอร์ม (อีเมลหรือ LINE · **ไม่ใช่** `User`) + «AgentSession» ของตัวเอง — §B.2 §J.3 |
| TC4 | ตัดที่ (แก้รอบ 2) | SQL เดียว | ตัวนับ 4 ช่องบนแถวรอบ `capacity · sold · held · reserved` · ทุกคำสั่ง = `UPDATE … WHERE … RETURNING` + **ตรวจจำนวนแถวทุกคำสั่ง (0 แถว = โยนรหัสที่ตั้งชื่อ ⇒ rollback)** · แปลงถือ→ขาย CAS แถว `TripHold` นั้นก่อนเสมอ · Liveaboard = แถวต่อเตียง «TripUnit» (โควตาเอเจนซี่ใช้ได้เฉพาะเตียง `ALLOTTED` ของโควตานั้น · สาธารณะเฉพาะ `FREE`) — §D |
| TC5 | การจองตอนรอจ่าย/รออนุมัติ (แก้รอบ 2) | ถือที่ → การจอง | แถว «TripBooking» เกิดตอน `confirm()` สถานะ `HOLD`/`PENDING` · ที่นั่งยัง `held` · **เวลาหมดมีแหล่งเดียว = `TripHold.expiresAt`** (ไม่มี `TripBooking.holdExpiresAt`) · PENDING ใช้เวลาตามค่าตั้งเวลาตอบคำขอ ไม่ใช่เวลาถือระหว่างจ่าย — §D.4 §G.1 |
| TC6 | ค่าตั้ง | โดเมน trips/agency/ticket · scope ใหม่ 5 | ต่อท้าย `SCOPE_KINDS`: `VESSEL` `PRODUCT` `DEPARTURE` `AGENT_TIER` `AGENT` · ลำดับปริยาย `TENANT → UNIT → VESSEL → PRODUCT → DEPARTURE → AGENT_TIER → AGENT` · chain ต่อคีย์ตาม TRIPS-DEFAULTS |
| TC7 | ตัวตรวจกฎหมาย | OK/WARN | «legal/th-tour-2569.ts» (W01–W46) · **ข้อมูลเข้าผิดรูป/ไม่รู้จัก rule = WARN ไม่ใช่ BLOCK** · "สูง/สูงสุด" = ช่อง «severity» · รับทราบโดยไม่บังคับเหตุผล — §E.5 |
| TC8 | snapshot | policySnapshot | `policySnapshot Json` NOT NULL บน «TripBooking» (`TicketOrder` = nullable เพราะของเก่า) · «TripsBookingSnapshot v1» ห่อ `PolicySnapshot` 2–3 ก้อน — §F |
| TC9 | เงิน (แก้รอบ 2 · มติ 1) | ผ่าน POS/บัญชี V2 | **เอกสารเงินของ trips ทั้งหมด (ใบรับมัดจำ/งวด · ใบกำกับ · ใบลดหนี้ · ใบรับค่าเสียหาย) ออกผ่านบัญชี V2** ด้วยฟังก์ชัน facade ใหม่ของ RUN นี้ — แยกบรรทัดรายได้/รายได้รับล่วงหน้า+VAT กับบรรทัดเก็บแทนที่ลง **หนี้สิน «เงินรับแทน»** · **ไม่แก้ POS** · POS ใช้เฉพาะที่ใช้ได้วันนี้โดยไม่แก้: บิลบนเรือ («TripFolio» แบบเดียวกับโรงแรม) และตั๋วที่ VAT ทั้งใบ — §H |
| TC10 | สมุดเอเจนซี่ (แก้รอบ 2 · มติ 9) | ต่อท้ายอย่างเดียว | «AgentLedgerEntry» + หัวสมุด «AgentBalance» PK `agentAccountId` · **บาทเท่านั้นในรุ่นแรก** (คอมฯ สกุลของการจอง R7 = เลื่อน) · บวก = เอเจนซี่ค้างร้าน — §I |
| TC11 | หน้าสาธารณะ (มติ 11) | `/b/[shop]` | `/b/[slug]` เป็นพอร์ทัล CRM ⇒ **«/book/[shop]/…»** · พอร์ทัลเอเจนซี่ **«/agent/[shop]/…»** · ผู้ให้บริการ «/sp/[token]» — §J.3 |
| TC12 | เลขเอกสาร (แก้รอบ 2) | TR- TK- LB- ST- | ตัวนับ «SellCounter» (ใน `sellable.prisma` · ใช้ร่วม trips/ticket/agency) `INSERT … ON CONFLICT DO UPDATE seq+1 RETURNING` · งวด = เดือนเดินทาง (พ.ศ.) · เลขใบเสร็จ/ใบกำกับ/ใบลดหนี้ = **เลขจริงของโมดูลบัญชี** (`RC-…` ในภาพเป็นตัวอย่าง) — §K |
| TC13 | ลำดับล็อก (แก้รอบ 2 · มติ 2) | — | **สองเฟส**: เฟส 1 ล็อกแถวความจุของทั้งตะกร้าตามลำดับเดียว (รอบ/รอบตั๋ว → โควตา → เตียง · ภายในเรียง (ชนิด, id)) · เฟส 2 ถือที่ → การจอง → ตัวนับเลข → งวดจ่าย → คอมฯ → หัวสมุดเอเจนซี่ → ผู้ให้บริการ · **ห้ามขอล็อกชั้นต้นหลังชั้นท้ายในธุรกรรมเดียวกัน** · บัญชี/POS นอก tx — §D.5 |
| TC14 | ค่าตั้งเอเจนซี่/ภาษี | ตาม §13 | ตาม **TA §13.1** + TRIPS-DEFAULTS: WHT ตาราง ผู้จ่าย×ผู้รับ · "ใครนำส่ง" (A30) · โหมดตัวแทน · ยกเลิก 4 เหตุ + ขั้นต่ำตามประกาศ (เตือน) · เก็บแทน 4 เงื่อนไข · VAT ค่าคอมฯ = ค่าตั้งใหม่ (มติ 8) — §E.4 §F §G.3 §H |
| TC15 | ลูกค้าของเอเจนซี่ (แก้รอบ 2 · มติ 13) | ไม่เข้าการตลาด | trips **ไม่สร้าง/ผูก Member และไม่เขียนความยินยอมการตลาด** ให้การจองที่ `marketingEligible = false` · ตัวโหลดแถวของสะพาน CRM คืน `partyId = null` ให้การจองนั้น — §J.4 |

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
| «src/lib/platform/agent-auth.ts» | ❌ | (แก้รอบ 2) ล็อกอินเอเจนซี่ (อีเมล/LINE) → «AgentUser» → «AgentSession» (คุกกี้ `shark_agent`) → ขอบเขตต่อ `AgentAccount` — §J.3.1 · ข้อมูลตาราง global อ่าน/เขียนผ่าน «agency/entry.ts» | A1.2 |
| `src/lib/platform/minute-jobs.ts` | — | ลงทะเบียนงาน §J.2 (บรรทัดลงทะเบียนเท่านั้น · lazy import facade แบบ `rooms.expireHolds`) | ใบที่สร้างงานนั้น |
| `src/lib/platform/notify-customer.ts` | — | ขยาย `domain` จาก `"booking"\|"rooms"` → + `"trips"\|"ticket"\|"agency"` (L-7) | T1.8 |
| `src/lib/platform/postback-routes.ts` | — | prefix `trips.` `ticket.` | W2.2 |
| `src/lib/core/settings/{types,registry,service}.ts` | — | scope ใหม่ · โดเมนใหม่ · ทะเบียนตัวตรวจกฎหมายหลายไฟล์ (L-2 L-3) | **T0.1** (ตรวจเข้ม) · ตำแหน่ง locate ของ AGENT/AGENT_TIER = A1.1 · VESSEL = L1.1 · PRODUCT/DEPARTURE ของตั๋ว = K1.1 |
| «src/lib/core/settings/defs/trips.ts» · «defs/agency.ts» · «defs/ticket.ts» | ✅ | นิยามค่า §E.4 + แม่แบบ 4 ตัว | T0.1 · A1.1 · K1.1 |
| «src/lib/core/settings/legal/th-tour-2569.ts» | ✅ | ตัวตรวจ OK/WARN = W01–W46 ของ TRIPS-DEFAULTS §4 (+ «legal/index.ts» ทะเบียนรวม) | T0.1 (โครง + ข้อ trips) · A1.1 (ข้อ WHT) |
| `src/lib/core/scope.ts` | — | ลงทะเบียนทุก model ใหม่ (fail-closed) · `AgentIdentity`/`AgentUser`/`AgentSession`/`AgentLoginCode`/`SupplierPeerLink` = `g("ตัวตนเอเจนซี่ระดับแพลตฟอร์ม (Q7)")` | ใบ migration ของตารางนั้น |
| `scripts/fitness.mts` | — | `ALLOWED_EDGES` + baseline F5 (ORACLE-EDIT ผู้คุมเท่านั้น) | ผู้คุม |

### A.2 โมดูล (facade = `index.ts` · โมดูลอื่นเรียกผ่าน facade เท่านั้น)
**«src/lib/modules/trips/»**
| ไฟล์ | เนื้อหา | ใบ |
|---|---|---|
| «index.ts» | facade (รายการชัดเจน ไม่ใช่ `export *` — แบบ `pos/index.ts` D5) | T0.1 สร้าง · ทุกใบต่อท้ายบล็อกของตัวเอง `// TRIPS <ใบ> ▸ … ◂` |
| «products.ts» | สินค้า · ตัวเลือก · ประเภทคน · รายการเสริม · i18n | T0.2 |
| «departures.ts» · «resources.ts» | กฎซ้ำ · รอบ · สถานะ · ทรัพยากรกันชน (EXCLUDE gist) | T0.3 |
| «capacity.ts» · «jobs.ts» | ตัวนับ §D ผ่าน `tenantDb(ctx).$queryRaw` (F5 +0) · «jobs.ts» = ทางเข้าข้ามร้านไฟล์เดียว (ตัวกวาด/งานตามเวลา · F5 +1 · §A.4) (แก้รอบ 2) | T0.4 |
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
| «sessions.ts» · «quota.ts» (`tenantDb` raw — F5 +0) · «jobs.ts» (ตัวกวาด/reconcile ข้ามร้าน F5 +1 · แก้รอบ 2) · «sellable-impl.ts» | รอบ · ตัวนับ · implement `Sellable` | K1.1 · K1.2 |
| «admissions.ts» · «gate.ts» · «batch.ts» | ตั๋วรายใบ/ส่งต่อ · สแกนประตูออฟไลน์ · ชุดตั๋วเอเจนซี่ | K1.4 · K1.5 · K1.6 |

**«src/lib/modules/agency/»**
| ไฟล์ | เนื้อหา | ใบ |
|---|---|---|
| «index.ts» | facade | A1.1 |
| «entry.ts» (แก้รอบ 2 · แทน «identity.ts») | ทางเข้าข้ามร้านไฟล์เดียว (F5 +1): ตาราง global `AgentIdentity` `AgentUser` `AgentSession` `AgentLoginCode` · หาคีย์ API ก่อนรู้ร้าน · งานคืนโควตา/คำขอหมดอายุ/ใบแจ้งยอดข้ามร้าน · `AgentIdentity` แก้ได้เฉพาะ AgentUser OWNER ของเอเจนซี่นั้น | A1.1 |
| «accounts.ts» · «tiers.ts» | ทะเบียน · สมัคร→อนุมัติ · ผู้ใช้/บทบาท · ผูก Party/CRM | A1.2 |
| «rates.ts» · «rates-core.ts» (บริสุทธิ์) | rate card · 3 แบบราคา · ช่วงพิเศษ · เครื่องลองคิด | A1.3 |
| «allotment.ts» · «requests.ts» | โควตา · วันคืน · คำขอก่อนจอง · เพดานถือ | A1.4 |
| «ledger.ts» | หัวสมุด + seq ผ่าน `tenantDb` raw (F5 +0 · แก้รอบ 2) | A1.5 |
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

### A.4 งบ fitness F5 และ facade ที่ต้องเพิ่ม (แก้รอบ 2 · มติ 12 · ผลตรวจ C-5 C-6 M-8 M-9)
- **F5 นับอะไรจริง**: ไฟล์ใต้ `src/lib/modules/**` ที่ `import { prisma } from "@/lib/core/db"` (`scripts/fitness.mts:617–618` · baseline `f5RawPrisma: 50` `:234`) — **ไม่ได้นับ SQL ดิบ** · `tenantDb(ctx)` เป็น client ที่ขยายจาก `prisma` (`db.ts:88–89`) จึงเรียก `$transaction`/`$queryRaw`/`$executeRaw` ได้โดยไม่ import `prisma` (SQL ดิบต้องใส่ `tenantId` ใน WHERE เอง — ตัวกรองอัตโนมัติไม่ครอบ raw)
- กติกา: ตัวนับ/ล็อก (§D) เขียนด้วย `tenantDb(ctx).$transaction(tx => tx.$queryRaw…)` ⇒ **ไม่เพิ่ม F5** · ไฟล์ที่ต้อง `prisma` ดิบมีเฉพาะ "ทางเข้าข้ามร้าน/ก่อนรู้ร้าน" ไฟล์เดียวต่อโมดูล:
| ไฟล์ | ทำไมต้อง `prisma` ดิบ | F5 |
|---|---|---|
| «trips/jobs.ts» | ตัวกวาด hold · งวดจ่าย · ปิดทริปอัตโนมัติ · PDPA purge · ยกเลิกรอบเลยเวลาเลือก · ส่งเอกสารเงินซ้ำ — ข้ามร้านก่อนรู้ tenant | +1 |
| «ticket/jobs.ts» | ตัวกวาด `TicketHold` ข้ามร้าน · `reconcileSessions` | +1 (`ticket/service.ts` เดิมนับอยู่แล้ว · «quota.ts» ใช้ `tenantDb` = +0) |
| «agency/entry.ts» | คืนโควตา · คำขอหมดอายุ · ใบแจ้งยอดตามรอบ (ข้ามร้าน) · ตาราง global (`AgentIdentity` `AgentUser` `AgentSession` `AgentLoginCode` · แกน `global` ไม่มี tenantDb) · หา `AgentApiKey` ก่อนรู้ร้าน | +1 |
| «supplier/public.ts» | หา `SupplierRequest` จาก token «/sp/[token]» ก่อนรู้ร้าน · `SupplierPeerLink` (global) · `supplier.requestTimeouts` | +1 |
  รวม **50 → 54** (ORACLE-EDIT ผู้คุมในใบที่สร้างไฟล์) · ตารางแกน `tenant` ของ agency (`AgentAccount` `AgentBalance` `AgentStatement` …) ใช้ `tenantDb({tenantId})` ได้โดยไม่ต้องมี unitId (`db.ts:65–68` โยนเฉพาะแกน `unit`) · ตารางแกน `unit` ของ trips ที่ต้องอ่านข้ามหน่วยในร้านเดียว (พอร์ทัลเอเจนซี่ · ใบแจ้งยอด) = วนต่อหน่วยใน `AgentAccount.unitIds`/หน่วย TRIPS ของร้าน
- **facade POS** (มติ 12): โค้ดใหม่ใช้ `createSale` `afterSaleCommitted` `voidSale` `saleStatusByKey` `posSystemForSale` `PosSaleError` `CreateSaleInput` — มีบน `pos/index.ts:10–38` ครบ · **ไม่มีอะไรที่ต้องเพิ่มบน facade POS** ในแบบนี้ (ไม่ใช้ฟังก์ชันมัดจำของ POS · §H.0)
- **facade บัญชี** (เพิ่มแบบ DORM D.2 · ทางเดิมไม่เปลี่ยน): «applyTripReceipt» «recogniseTripRevenue» «applyTripPassThroughPayout» «applyTripRefund» (T0.7) · «postAgencyCharge» «applyAgencyRemittance» «postAgencyStatement» «issueAgentWhtCert» (A1.5–A1.6 · `issueWhtCert` อยู่ใน `account/wht.ts:310` ยังไม่อยู่บน facade) · «accrueAgentCommission» «payAgentCommission» (A1.7) · «postSupplierBill» «paySupplier» (S1.3) · «applyTripFolioSettlement» (L1.9) · enum `AccountDocSource` + `TRIPS` `AGENCY` `SUPPLIER` (migration ย่อยของ T0.1) · ผังบัญชีใหม่ (H.1)
- **facade อื่น**: `party` (มีแล้ว) · `member` (ไม่เรียกสำหรับการจองที่ไม่เข้าการตลาด · J.4) · `chat.issueLinkCode` + `LINK_PURPOSES` (W2.1) · `approval` (มีแล้ว) · `giftcard` เครดิตร้าน (X.2)

---

## B. ตาราง (เพิ่มอย่างเดียว · ต่อใบ migration)

กติการ่วม (ทุกตาราง): `tenantId` ทุกแถว (ยกเว้นแกน global) · `unitId` เมื่อเป็นของหน่วย (scope `unit`) · id ข้ามโมดูล/ข้ามไฟล์ schema = `String` หลวม ไม่มี FK (แบบ `RoomOccupancy.refId`) · สถานะเป็น `String` + `CHECK … IN (…)` SQL มือ (แบบ SVC H.0 — ไม่ใช้ enum ของ Prisma สำหรับตารางใหม่) · เงินบาท `…Satang Int` · เงินสกุลอื่น `…Minor Int` + `currency String` · CHECK `>= 0` ทุกตัวนับ/ยอด · `createdAt/updatedAt` · ทุก model ลง `src/lib/core/scope.ts` ในใบเดียวกัน

### B.0 กติกาเขียน migration (แก้รอบ 2 · มติ 14 · ผลตรวจ M-10)
1. **unique บางส่วน (partial) และ unique แบบ NULLS NOT DISTINCT = SQL มือเท่านั้น** ท้ายไฟล์ migration (`CREATE UNIQUE INDEX "<ชื่อ>" ON … NULLS NOT DISTINCT` / `… WHERE …`) · ฝั่ง Prisma **ห้ามประกาศ `@@unique` ซ้ำ** (Prisma สร้าง NULLS DISTINCT/เต็มตาราง ⇒ ซ้ำได้หรือบล็อกแถวที่ควรผ่าน) — ใส่เป็นคอมเมนต์ `// SQL มือ: <ชื่อดัชนี> …` แบบ `hotel.prisma:229–231` · ใช้ `@@index` ธรรมดาเพื่อค้นได้ · ใบที่สร้างตารางรัน `prisma migrate diff` ยืนยันว่า Prisma ไม่เสนอ DROP ดัชนีเหล่านี้
   - รายการ: `TripDeparture(productId, optionId, startsAt)` NND · `TripPrice(productId, optionId, paxTypeId, cabinTypeId, seasonId, departureId, currency)` NND · `AgentRate(rateCardId, productKind, productId, optionId, paxTypeId, cabinTypeId, bookFrom, travelFrom)` NND · `SupplierCost(supplierId, productId, optionId, paxTypeId, travelFrom)` NND · `TicketChannelQuota(sessionId, ticketTypeId, channel)` NND · `TripCheckin(passengerId) WHERE result='FIRST'` · `CabinAssignment(tripUnitId) WHERE active` · `TripFolio(bookingId) WHERE status='OPEN'`
2. ค่า enum ใหม่ของ Postgres (`ALTER TYPE "UnitType" ADD VALUE 'TRIPS'` · `ALTER TYPE "AccountDocSource" ADD VALUE 'TRIPS'` และ `'AGENCY'` `'SUPPLIER'`) อยู่ใน **migration ของตัวเองที่ไม่มีคำสั่งอื่นใช้ค่านั้น** (Postgres ใช้ค่าที่เพิ่งเพิ่มในธุรกรรมเดียวกันไม่ได้) และต้องขึ้นก่อนโค้ดที่เขียนค่านั้น (แบบ `DORM` ใน `account.prisma:109`)
3. CHECK ทุกตัว (สถานะ · ≥ 0 · `used + held <= qty`) เป็น SQL มือ
4. ดัชนีบางส่วนของตัวกวาดข้ามร้าน: `TripHold("expiresAt") WHERE status='ACTIVE'` · `TicketHold("expiresAt") WHERE status='ACTIVE'` · `AgentAllotment("releaseAt") WHERE "releasedAt" IS NULL`

### B.1 T0.1 — migration «trips» (schema «prisma/schema/trips.prisma» + «prisma/schema/sellable.prisma») + migration ย่อย «trips_enum» (UnitType TRIPS · AccountDocSource TRIPS/AGENCY/SUPPLIER · ขึ้นก่อน)
| ตาราง | scope | คอลัมน์หลัก | unique / index / CHECK |
|---|---|---|---|
| «SellBasket» (sellable.prisma) | tenant | `channel` · `agentAccountId?` · `status` (`OPEN` `CHECKED_OUT` `EXPIRED` `ABANDONED`) · `expiresAt` · `publicTokenHash?` · `idempotencyKey` · `attribution Json?` · `unitIds String[]` (หน่วยของทุกบรรทัด · M-15) | `@@unique([tenantId, idempotencyKey])` · `@@index([status, expiresAt])` |
| «SellCounter» (sellable.prisma · แก้รอบ 2 m-10 · แทน «TripsCounter») | tenant | `series` (`TR` `LB` `TK` `ST:<code>` `CR` …) · `period` (`"6911"`) · `seq` | `@@unique([tenantId, series, period])` |
| «TripProduct» | unit | `productType` (`TOUR` `LIVEABOARD` `ATTRACTION`) · `sourceKind` (`OWN` `SUPPLIER`) · `supplierId?` · `slug` · `status` (`DRAFT` `ACTIVE` `ARCHIVED`) · `title Json` `body Json` (`{th,en}`) · `currency` · `vesselId?` · `meetingPoint Json?` · `disclosure Json?` (ม.26 · L9) · `formSpec Json?` (L6) · `deepDive Bool` (§13.1 L14) · `crossBorder Bool` | `@@unique([tenantId, slug])` · `@@index([tenantId, unitId, status])` · CHECK `currency = 'THB' OR productType = 'LIVEABOARD'` |
| «TripOption» | unit | `productId` · `name Json` · `durationMin?` · `nights?` · `sortOrder` · `active` | `@@index([productId, active])` |
| «TripPaxType» | unit | `productId` · `code` · `label Json` · `ageMin?` `ageMax?` (null = ตามค่าตั้ง T27) · `countsCapacity Bool` | `@@unique([productId, code])` |
| «TripExtra» | unit | `productId?` · `kind` (`PARK_FEE` `PORT_FEE` `FUEL` `EQUIPMENT` `NITROX` `TRANSFER` `COURSE` `INSURANCE` `OTHER`) · `basis` (`PER_PAX` `PER_BOOKING` `PER_DAY` `PER_PAX_DAY` `PER_BOAT_NIGHT`) · `mandatory` · `priceMinor` · `currency` · ธง `commissionable` `discountable` `passThrough` · `taxKind` (`VAT7` `EXEMPT` `NONE`) · `stockItemId?` | `@@index([tenantId, unitId, productId])` · CHECK `NOT passThrough OR (NOT commissionable AND NOT discountable AND taxKind='NONE')` |
| «TripPassThroughEvidence» (แก้รอบ 2) | unit | `departureId?` `bookingId?` · `extraKind` · `paidToPayee` (เช่น กรมอุทยาน) · `amountSatang` · `paidAt` · `fileIds String[]` · `accountDocId?` (รายการจ่ายแทน) | `@@index([departureId])` · `@@index([bookingId])` |
| «TripPickupZone» | unit | `name` · `pickupOffsetMin` · `surchargeSatang` · `polygon Json?` · `sortOrder` | `@@index([tenantId, unitId])` |
| «TripSchedule» | unit | `productId` · `optionId?` · `rule Json` · `exceptions Json` · `departTimeMin` · `capacity` · `minPax?` · `resourceIds String[]` · `dateFrom` `dateTo` @db.Date | `@@index([productId])` |
| «TripDeparture» | unit | `productId` · `optionId?` · `scheduleId?` · `localDate` @db.Date · `startsAt` `endsAt` · `status` (`OPEN` `GUARANTEED` `FULL` `CLOSED` `CANCELLED`) · **ตัวนับ** `capacity` `sold` `held` `reserved` · `minPax?` · `cutoffAt?` · `vesselId?` · `deckPlanVersionId?` · `insurance Json?` · `stopSell Json?` (หยุดขายต่อช่องทาง · M-15) · `version Int` | SQL มือ NND (B.0) · `@@index([productId, optionId, startsAt])` · `@@index([tenantId, unitId, localDate])` · `@@index([productId, localDate, status])` · CHECK ตัวนับ ≥ 0 |
| «TripResource» | unit | `kind` (`BOAT` `VAN` `GUIDE` `OTHER`) · `name` · `seats?` · `hrEmployeeId?` · `active` | `@@index([tenantId, unitId, kind])` |
| «TripResourceUse» | unit | `resourceId` · `departureId` · `startsAt` `endsAt` · `active` | SQL มือ: `EXCLUDE USING gist ("resourceId" WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE (active)` (มี `btree_gist` แล้วจาก svc_r0) |
| «TripVehicleRun» (แก้รอบ 2 · M-15 T1.4) | unit | `departureId` · `resourceId` · `driverEmployeeId?` · `stops Json` (ลำดับ bookingId/จุดรับ/เวลา) | `@@index([departureId])` |
| «TripSeason» | unit | `name` · `dateStart` `dateEnd` · `priority` · `status` | `@@index([tenantId, unitId, dateStart, dateEnd])` |
| «TripPrice» | unit | `productId` · `optionId?` · `paxTypeId?` · `cabinTypeId?` · `seasonId?` · `departureId?` · `currency` · `amountMinor` · `weekdayMask?` · ช่วงจอง/เดินทาง · `priority` | SQL มือ NND · CHECK `amountMinor >= 0` |
| «TripPriceRule» | unit | `productId?` · `kind` · `params Json` · ช่วงวัน · `priority` · `active` | `@@index([tenantId, unitId, kind, active])` |
| «TripHold» | unit | `departureId` · `basketId?` · `bookingId?` · `channel` · `agentAccountId?` · `allotmentId?` · `qtyPublic` `qtyAllot` · `unitIds String[]` · `purpose` (`PAYMENT` `SHOP_CONFIRM` `AGENT_REQUEST` `SUPPLIER_REQUEST` `WAITLIST_OFFER` `AGENT_HOLD`) · `capKeyHash` (เพดานถือ §D.6 · แก้รอบ 3) · `requestHash` · `idempotencyKey` · `status` (`ACTIVE` `CONVERTED` `EXPIRED` `RELEASED`) · **`expiresAt` (แหล่งเดียวของเวลาหมด · แก้รอบ 2 M-3)** · `releasedReason?` | `@@unique([tenantId, idempotencyKey])` · `@@index([departureId, status])` · `@@index([bookingId])` · SQL มือ partial `("expiresAt") WHERE status='ACTIVE'` |
| «TripBooking» | unit | `code` · `publicTokenHash` · `status` §G · `productId` `departureId` `travelDate` · `basketId?` · `channel` · `agentAccountId?` `agentUserId?` `salesStaffId?` `linkId?` · `collectMode` (`SHOP` `AGENT`) · `payMethod` (`PAY_NOW` `PAY_LATER` `WALLET` `CREDIT` · M-13) · `bookerPartyId?` · `marketingEligible Bool` · `contactRoute` · `currency` `fxRateMicros?` · ยอดสตางค์: `grossSatang` `discountSatang` `agentDiscountSatang` `passThroughSatang` `vatSatang` `commissionSatang` `commissionVatSatang` `whtSatang` `netToShopSatang` `agentActualSaleSatang?` `paidSatang` `refundedSatang` · `accountingState` (`NONE` `UNEARNED` `RECOGNISED` `REVERSED` · H) · `policySnapshot Json` NOT NULL · `version Int` · `cancelReason?` `cancelledAt?` `travelledAt?` · `piiPurgedAt?` (m-14) · `createdById?` — **ไม่มี `holdExpiresAt`** (แก้รอบ 2) | `@@unique([tenantId, code])` · `@@unique([publicTokenHash])` · `@@index([tenantId, unitId, status, travelDate])` · `@@index([departureId, status])` · `@@index([agentAccountId, createdAt])` · `@@index([bookerPartyId])` |
| «TripBookingItem» | unit | `bookingId` · `departureId` · `kind` (`SEAT` `BERTH` `CABIN` `EXTRA` `PICKUP` `FEE` `ADJUST`) · `paxTypeId?` `extraId?` `tripUnitId?` · `qty` · `unitPriceMinor` `amountMinor` `amountSatang` `vatSatang` · ธง · `taxKind` · `priceSource` · `allotmentId?` (ที่มาของที่นั่ง · ใช้ตอนยกเลิก §D.1 ข้อ 5) · `active` | `@@index([bookingId])` · `@@index([departureId, active])` |
| «TripPassenger» | unit | `bookingId` · `itemId?` · `partyId?` · `fullName` · `nationality?` · `dob?` · `sex?` · `docType?` `docNumberEnc?` (กล่องปิด) `docLast4?` `docExpiry?` · `diver Bool?` · `phone?` · `birthPlace?` (ทริปข้ามแดน) · `certLevel?` `diveCount?` `lastDiveAt?` (§13.1 L6) · `isMinor Bool` `guardianConsent Json?` (ผู้เยาว์ ≤ 10 ปี · §13.1 L12) · `answers Json` (ตาม `formSpec`) · `formStatus` · `waiverSignedAt?` `waiverEvidence Json?` (L11: ช่องทางยืนยัน · เวลา · แฮชข้อความ · เวอร์ชัน) · `checkinAt?` · `retainUntil?` | `@@index([bookingId])` · `@@index([retainUntil])` |
| «TripPaymentDue» | unit | `bookingId` · `seq` · `kind` (`DEPOSIT` `BALANCE` `INSTALMENT` `PASSENGER_SHARE`) · `passengerId?` · `dueAt` · `amountSatang` (รวม) · `vatableSatang` `passThroughSatang` (แยกตามกติกา §H.1) · `amountMinor?` · `paidSatang` · `status` · `payTokenHash?` | `@@unique([bookingId, seq])` · `@@index([status, dueAt])` |
| «TripMoneyEvent» | unit | ต่อท้ายอย่างเดียว: `bookingId` · `kind` (`RECEIVED` `REFUNDED` `RETAINED` `REVENUE_RECOGNISED` `PASS_THROUGH_PAID` `CREDIT_ISSUED`) · `amountSatang` · `vatSatang` · `passThroughSatang` · `dueId?` · `tender` (`CASH` `PROMPTPAY` `TRANSFER` `CARD` `AGENCY`) · `accountDocId?` `accountEntryId?` · `postingStatus` (`POSTED` `UNPOSTED` `FAILED_NEEDS_ACTION` · แก้รอบ 3 N-6) · `postingAttempts Int` · `nextAttemptAt?` · `postedDate?` (วันลงบัญชีจริงเมื่อเลื่อนพ้นงวดปิด) · `slipId?` · `whtByCustomerSatang?` · `idempotencyKey` | `@@unique([tenantId, idempotencyKey])` · `@@index([bookingId])` · `@@index([tenantId, postingStatus])` |
| «TripRefundRequest» | unit | `bookingId` · `by` · `reasonKind` (`CUSTOMER` `EXTERNAL` `MIN_NOT_MET` `SHOP_FAULT` · ตาม T21) · `deductions Json` · `status` §G.3 · `computed Json` · `choice` (`MONEY` `CREDIT` `MOVE_DATE`) · `amountSatang` · `manualDeltaSatang` · `approvalId?` · `creditNoteDocId?` `damagesDocId?` · `decidedById?` | `@@index([tenantId, unitId, status])` |
| «TripDocument» | unit | `passengerId` · `kind` (`PASSPORT` `MEDICAL` `WAIVER` `CERT` `PARK_TICKET` `INSURANCE`) · `fileId` (FileAsset private) · `consent Json?` · `retainUntil` · `deletedAt?` | `@@index([retainUntil, deletedAt])` |
| «TripDocView» | unit | ต่อท้ายอย่างเดียว: `documentId` · `viewerKind` (`STAFF` `AGENT` `LINK_CUSTOMER` `CUSTOMER` · แก้รอบ 2) · `viewerId` · `purpose` · `at` | `@@index([documentId, at])` |
| «TripPdpaRequest» | unit | คำขอของเจ้าของข้อมูล (ลบ/เข้าถึง/แก้): `passengerId?` `partyId?` · `kind` · `status` · `dueAt` (จาก `trips.pdpa.requestDeadlines` T64 · ลบ ≤ 90 วัน §13.1 L13) · `doneAt?` | `@@index([tenantId, status, dueAt])` |
| «TripCashClose» (แก้รอบ 3 · N-4 · T1.3) | unit | `businessDate` @db.Date · `financeAccountId` · `expectedSatang` · `countedSatang` · `varianceSatang` · `countedById` · `varianceEntryId?` · `transferId?` (`AccountFinanceTransfer`) · `approvalId?` · `closedAt` | `@@unique([unitId, businessDate])` |
| «TripCheckin» | unit | `passengerId` · `deviceId` · `scannedAt` · `receivedAt` · `result` (`FIRST` `DUPLICATE`) | `@@index([passengerId])` + SQL มือ partial unique `(passengerId) WHERE result='FIRST'` (แก้รอบ 2 M-10b) |
| «TripWaitlist» | unit | `departureId` · `partyId?` · `qty` · `status` · `offerHoldId?` · `offerExpiresAt?` | `@@index([departureId, status])` |
| «TripCost» | unit | `departureId` · `kind` · `amountSatang` · `note?` | `@@index([departureId])` |
| «TripUnit» | unit | ต่อรอบ × เตียง: `departureId` · `berthId` · `cabinId` · `sortKey` · `status` (`FREE` `HELD` `SOLD` `BLOCKED` `ALLOTTED`) · `holdId?` `bookingItemId?` · `allotmentId?` (ตั้งเมื่อ ALLOTTED และคงไว้ตอน HELD/SOLD ที่มาจากโควตา) · `version` | `@@unique([departureId, berthId])` · `@@index([departureId, status])` · `@@index([allotmentId])` |
| «TripImportBatch» (M-15 T1.10/S1.4) | unit | `kind` · `fileId` · `mapping Json` · `status` (`PREVIEW` `APPLIED` `UNDONE`) · `createdRefs Json` (id ที่สร้าง · ใช้ย้อนกลับ) | `@@index([tenantId, unitId, status])` |
| «TripLinkStat» (M-15 W1.1/A1.8) | unit | `day` @db.Date · `channel` · `linkId?` `agentAccountId?` · `views` `starts` `paid` (ตัวนับวันละแถว · UPDATE คำสั่งเดียว) | SQL มือ NND `(unitId, day, channel, linkId)` |

### B.2 A1.1 — migration «agency» (schema «prisma/schema/agency.prisma») — (แก้รอบ 2 · มติ 5 · M-4 M-5 M-7)
| ตาราง | scope | คอลัมน์หลัก | unique / index |
|---|---|---|---|
| «AgentIdentity» | **global** | **เฉพาะที่ใช้จำเอเจนซี่เดียวกันข้ามร้าน**: `displayName` · `publicCode` (รหัสที่เอเจนซี่ให้ร้าน เช่น `AG-7K3Q9P` สุ่ม) · `taxIdHash?` (HMAC-SHA256 คีย์แพลตฟอร์ม ของเลขภาษีนิติบุคคล — ไว้ "ยืนยันว่าตรง" เมื่อเอเจนซี่เองกรอก · **ห้ามเก็บเลขบัตรประชาชนบุคคล**) · `status` | `@@unique([publicCode])` · `@@unique([taxIdHash])` (partial `WHERE taxIdHash IS NOT NULL` · SQL มือ) |
| «AgentUser» | **global** | ผู้ใช้ฝั่งเอเจนซี่: `identityId` · `displayName` · `role` (`OWNER` `ADMIN` `SALES` `ACCOUNTING`) · `status` · `lastLoginAt?` — **ไม่ใช้ตาราง `User`** (`User.email` บังคับ+unique `core.prisma:107`) · (แก้รอบ 3 · N-7) วิธีล็อกอินแยกตาราง «AgentLogin» (ผู้ใช้หนึ่งคนมีได้หลายวิธี) | `@@index([identityId])` |
| «AgentLogin» (แก้รอบ 3 · N-7) | **global** | `agentUserId` · `kind` (`EMAIL` `LINE`) · `providerId` (EMAIL = `"email"` · LINE = **LINE provider/channel id** ที่ออก userId นั้น — LINE userId ต่างกันต่อ provider: ล็อกอินผ่าน OA ของร้าน A กับร้าน B ได้คนละ id) · `subject` (อีเมล normalize หรือ LINE userId) · `verifiedAt` · `lastUsedAt?` | `@@unique([kind, providerId, subject])` · `@@index([agentUserId])` · เพิ่มวิธีล็อกอินใหม่ให้ตัวเอง = ต้องล็อกอินด้วยวิธีเดิมก่อน (ผูกบัญชี) |
| «AgentSession» | **global** | `agentUserId` · `tokenHash` · `activeAgentAccountId?` (ร้านที่กำลังใช้) · `expiresAt` · `idleExpiresAt` · `revokedAt?` · `ipHash?` `uaHash?` | `@@unique([tokenHash])` · `@@index([agentUserId])` · `@@index([expiresAt])` |
| «AgentLoginCode» | **global** | `target` (อีเมลหรือ LINE userId แบบแฮช) · `codeHash` · `attempts` · `expiresAt` · `usedAt?` | `@@index([target, expiresAt])` |
| «AgentTier» | tenant | `code` · `name` · `sortOrder` | `@@unique([tenantId, code])` |
| «AgentAccount» | tenant | `identityId` · `code` (PTD) · `status` (`INVITED` `PENDING` `ACTIVE` `SUSPENDED` `CLOSED`) · `tierId?` · `partyId` · `crmCompanyId?` · `accountContactId?` · `unitIds String[]` · **ข้อมูลภาษี/เงินของร้านนี้**: `legalName` · `payeeType` (`TH_JURISTIC` `TH_PERSON` `FOREIGN`) · `taxIdEnc?` `taxIdLast4?` (กล่องปิด · บุคคล = เลขบัตร) · `branchCode?` · `country` · `treaty Bool?` · `vatRegistered Bool` (มติ 8) · `bankAccount Json?` (กล่องปิด) · `contact Json?` · `licenceNo?` `licenceExpiry?` · `approvedById?` `approvedAt?` | `@@unique([tenantId, code])` · `@@unique([tenantId, identityId])` |
| «AgentAccountMember» (เดิม «AgentUser» ต่อร้าน · เปลี่ยนชื่อ) | tenant | `agentAccountId` · `agentUserId` · `role` · `active` · `addedByAgentUserId` — (แก้รอบ 3 · N-7) **สร้างได้เฉพาะฝั่งเอเจนซี่**: แถวแรกเมื่อ `AgentUser` OWNER/ADMIN ของเอเจนซี่ "รับคำเชิญ" บัญชี `INVITED` · ผู้ใช้ถัดไปเพิ่มโดย OWNER/ADMIN ของเอเจนซี่เท่านั้น · **ร้านเพิ่ม/แก้สมาชิกของเอเจนซี่ไม่ได้** (ร้านทำได้แค่ระงับทั้งบัญชี) | `@@unique([agentAccountId, agentUserId])` |
| «AgentContract» | tenant | `agentAccountId` · `version` · `validFrom` `validTo?` · `fileId?` · `signedAt?` `signEvidence Json?` · `termsSnapshot Json` (ค่าตั้งชั้น AGENT ที่ resolve ตอนเซ็น) | `@@unique([agentAccountId, version])` |
| «AgentRateCard» | tenant | `ownerKind` (`TIER` `AGENT`) · `tierId?` `agentAccountId?` · `name` · `status` · `validFrom?` `validTo?` · `version` | `@@index([tenantId, ownerKind])` · CHECK มีเจ้าของ 1 ชนิด |
| «AgentRate» | tenant | `rateCardId` · `productKind` (ตรวจกับ `PRODUCT_KINDS`) · `productId` · `optionId?` `paxTypeId?` `cabinTypeId?` · `mode` (`COMMISSION_PCT` `COMMISSION_FIXED` `NET` `MARKUP`) · `valueBp?` `valueMinor?` `currency` · `minSellMinor?` · `markupCapBp?` · ช่วงจอง/เดินทาง · `priority` | SQL มือ NND (rateCardId, productKind, productId, optionId, paxTypeId, cabinTypeId, bookFrom, travelFrom) · `@@index([rateCardId])` · `@@index([tenantId, productKind, productId])` |
| «AgentRequest» | tenant | `agentAccountId` · `kind` (`BOOKING` `PRICE_OVERRIDE` `CREDIT_INCREASE` `ALLOTMENT`) · `payload Json` · `holdId?` · `status` · `expiresAt` · `approvalId?` | `@@index([tenantId, status, expiresAt])` |
| «AgentLink» | tenant | `agentAccountId` · `code` (ใน `?a=`) · `salesUserId?` · `productId?` · `active` | `@@unique([tenantId, code])` |
| «AgentApiKey» | tenant | `agentAccountId` · `keyHash` · `last4` · `scopes String[]` · `revokedAt?` | `@@unique([keyHash])` |
| «AgentAllotment» | tenant | `agentAccountId` · `productKind` · `slotId` · `qty` `used` `held` · **`returnedToPublic Int @default(0)`** (ที่นั่งที่ยกเลิกแล้วคืนสาธารณะ · แก้รอบ 2 M-1) · `releaseAt?` · `releasedAt?` `releasedQty?` · `blockId?` | `@@unique([agentAccountId, productKind, slotId])` · **`@@index([productKind, slotId])`** (M-10e) · SQL มือ partial `("releaseAt") WHERE "releasedAt" IS NULL` · CHECK `used + held + returnedToPublic <= qty` |
| «AgentStopSell» (M-15 A1.4) | tenant | `agentAccountId?` (null = ทุกเอเจนซี่) · `productKind` `slotId?` `productId?` · `channel?` · `from` `to?` · `reason` | `@@index([tenantId, productKind, slotId])` |
| «AgentLedgerEntry» | tenant | ต่อท้ายอย่างเดียว §I: `agentAccountId` · `seq` · `kind` · `amountSatang` (มีเครื่องหมาย) · `currency` (CHECK = `THB` ในรุ่นแรก · มติ 9) · `bookingKind?` `bookingId?` · `statementId?` · `commissionId?` · `entitledAt?` `settledAt?` `dueAt?` · `refEntryId?` · `idempotencyKey` · `actorId` | `@@unique([agentAccountId, seq])` · `@@unique([tenantId, idempotencyKey])` · `@@index([agentAccountId, statementId])` · trigger SQL มือ: ปฏิเสธ UPDATE/DELETE (ยกเว้นตั้ง `statementId` จาก null ครั้งเดียว) |
| «AgentBalance» | tenant | PK `agentAccountId` · `balanceSatang` · `lastSeq` · `version` (บาทเท่านั้น · มติ 9) | — |
| «AgentStatement» | tenant | `agentAccountId` · `code` · `periodKey` · `periodFrom` `periodTo` · `status` (`DRAFT` `ISSUED` `PARTIAL` `PAID` `VOID`) · ยอดสรุปตามภาพ 13ง (`salesSatang` `passThroughSatang` `commissionSatang` `commissionVatSatang` `whtSatang` `cancelledSatang` `paidDuringPeriodSatang` `totalSatang`) · `billingNoteDocId?` · `whtCertDocId?` · `receiveUnitId` (หน่วยที่รับเงิน · M-13) · `dueAt` | `@@unique([agentAccountId, periodKey])` · `@@unique([tenantId, code])` |
| «AgentCommission» | tenant | `agentAccountId` · `bookingKind` `bookingId` · `baseSatang` `rateBp?` `commissionSatang` · `vatSatang` · `whtRateBp` `whtSatang` · `currency` `fxRateMicros?` · `status` (`PENDING` `EARNED` `SETTLING` `SETTLED` `CLAWED_BACK` `VOID` · แก้รอบ 2 m-4) · `earnedAt?` `settledAt?` · `settleMode` (`PAYOUT` `NETTED`) · `runId?` · `whtCertDocId?` | `@@unique([bookingKind, bookingId, agentAccountId])` · `@@index([agentAccountId, status, earnedAt])` |
| «AgentCommissionRun» | tenant | `code` · `cutoffAt` · `status` · ยอดรวม · `paidAt?` | `@@unique([tenantId, code])` |
| «AgentWebhook» (A2.4 · M-15) | tenant | `agentAccountId` · `url` · `secretBox` · `events String[]` (เฉพาะ event ที่มี `agentAccountId` ของตัวเอง) · `active` | `@@index([agentAccountId])` |
| «AgentMediaAsset» (A2.4 · M-15) | tenant | `productKind?` `productId?` · `fileId` (สาธารณะ) · `title Json` | `@@index([tenantId, productId])` |
| **ผู้ให้บริการ** (แนะนำ: migration ของใบ S1.1 เอง · L-25) | | | |
| «Supplier» | tenant | `partyId` · `accountContactId?` · `payeeType` · `peerLinkId?` · `status` — **ไม่มี `linkedTenantId` อิสระ** (แก้รอบ 2) | `@@index([tenantId, status])` |
| «SupplierPeerLink» (มติ 5) | **global** | `supplierTenantId` · `buyerTenantId` · `status` (`PROPOSED` `ACTIVE` `REVOKED`) · `proposedByTenantId` · `supplierAcceptedAt?` `supplierAcceptedById?` · `buyerAcceptedAt?` `buyerAcceptedById?` · `revokedAt?` `revokedByTenantId?` · `productIds String[]` (ที่ผู้ให้บริการเปิดให้เห็น) · `agentAccountId` (บัญชีเอเจนซี่ที่ฝั่งผู้ให้บริการสร้างให้ร้านผู้ซื้อ) | `@@unique([supplierTenantId, buyerTenantId])` · ทั้งสองร้านอ่านแถวได้ เฉพาะแถวที่ตนเป็นฝ่าย · เพิกถอนได้ทั้งสองฝ่าย |
| «SupplierCost» | unit | `supplierId` · `productId` (TripProduct sourceKind SUPPLIER) · `optionId?` `paxTypeId?` · `mode` (`NET` `PCT_OF_RETAIL`) · `valueMinor?` `valueBp?` · `currency` · ช่วงวัน | SQL มือ NND (supplierId, productId, optionId, paxTypeId, travelFrom) · `@@index([supplierId, productId])` |
| «SupplierRequest» | unit | `bookingId` · `supplierId` · `channel` (`EMAIL` `LINE` `LINK` `PEER`) · `status` §G.2 · `responseTokenHash` · `sentAt?` `respondBy` `respondedAt?` · `confirmationRef?` · `attempts` | `@@index([status, respondBy])` · `@@unique([responseTokenHash])` |
| «SupplierPayable» | unit | `supplierId` · `bookingId` · `amountSatang` · `dueAt` · `status` (`ACCRUED` `BILLED` `PAID` `VOID`) · `accountDocId?` · `idempotencyKey` | `@@unique([tenantId, idempotencyKey])` · `@@index([supplierId, status, dueAt])` |
| «GroupQuoteRequest» | unit | (S1.6) `productId` · `requester Json` · `status` · `crmDealId?` · `quotationDocId?` · `bookingId?` · `contractFileId?` | `@@index([tenantId, status])` |

### B.3 K1.1 — migration «ticket v2» (แก้รอบ 2 · M-10a M-10d)
| ตาราง/คอลัมน์ | คอลัมน์หลัก | unique / index |
|---|---|---|
| «TicketSession» | `eventId` · `startsAt` `endsAt?` · `localDate` · `status` (`OPEN` `CLOSED` `CANCELLED`) · ตัวนับ `capacity` `sold` `held` `reserved` · `cutoffAt?` · `version` | `@@unique([eventId, startsAt])` · `@@index([tenantId, unitId, localDate])` |
| «TicketChannelQuota» | `sessionId` · `ticketTypeId?` (null = ทุกประเภท) · `channel` (`"*"` = ทุกช่องทาง) · `quota` `sold` `held` | SQL มือ NND (sessionId, ticketTypeId, channel) · `@@index([sessionId])` · แถว `(type, "*")` = **โควตาต่อประเภทของรอบ** (แทน `TicketType.quota/sold` ระดับอีเวนต์ · L-12) |
| «TicketBatch» | `agentAccountId` · `ticketTypeId` · `sessionId?` · `qty` `issued` `returned` · `consignment Bool` · `returnBy?` · `status` | `@@index([tenantId, agentAccountId])` |
| «TicketHold» | แบบ `TripHold` (`sessionId` · `lines Json` · `idempotencyKey` · `expiresAt` · `status`) | `@@unique([tenantId, idempotencyKey])` · SQL มือ partial `("expiresAt") WHERE status='ACTIVE'` |
| «TicketScan» | `admissionId` · `gateId` · `deviceId` · `scannedAt` · `receivedAt` · `result` (`FIRST` `REENTRY` `DUPLICATE` `INVALID`) | `@@index([admissionId, scannedAt])` |
| `TicketOrder` + | `sessionId?` · `agentAccountId?` · `batchId?` · `holdId?` · `basketId?` · `policySnapshot Json?` (null = ออเดอร์เก่า) · `publicTokenHash?` · `code?` (เลขใหม่ §K — `orderNo` เดิมคง) · `currency` default THB | `@@index([sessionId, status])` |
| `TicketAdmission` + | `sessionId?` · `validFrom?` `validTo?` (ตั๋วไม่ระบุวัน) · `maxEntries Int @default(1)` · `entries Int @default(0)` · `holderName?` · `transferredFromId?` · `batchId?` | `@@index([sessionId, status])` |
| `TicketEvent` + · `TicketType` + | `nameEn?` (M-15 ชื่ออังกฤษ) | — |

**ลำดับขึ้นระบบที่ปลอดภัยกับโค้ดที่กำลังรัน:**
1. migration A (เพิ่มอย่างเดียว): ตาราง/คอลัมน์ใหม่ + backfill เริ่มต้น — ทุก `TicketEvent` → `TicketSession` 1 แถว (`capacity = Σ type.quota` · **`sold = Σ type.sold` ซึ่งรวมออเดอร์ `PENDING` เดิม** · `held = 0`) + `TicketChannelQuota(type,"*")` ต่อประเภท · `sessionId` ของออเดอร์/ตั๋วเดิม · idempotent (`ON CONFLICT DO NOTHING`)
2. ดีพลอยโค้ด K1.1 (ตัดที่ผ่านรอบ · `TicketType.sold` หยุดเดิน)
3. **งาน reconcile หลังดีพลอย** «ticket.reconcileSessions» (รันครั้งเดียว + รันซ้ำได้): ต่อรอบ ล็อกแถวรอบ (`FOR UPDATE`) → คำนวณ `sold` ใหม่จากออเดอร์จริง (`PENDING` + `PAID` ที่ไม่ใช่ CANCELLED · ตั๋วไม่ VOID) และ `held` จาก `TicketHold ACTIVE` → UPDATE · ล็อกแถวโควตาตามลำดับ §D.5 แล้วทำแบบเดียวกัน — แก้ส่วนต่างที่เกิดจากโค้ดเก่าเพิ่ม `TicketType.sold` ระหว่าง migration กับดีพลอย
   - (แก้รอบ 3 · N-3) reconcile **ผูก `sessionId` ให้ออเดอร์/ตั๋วที่โค้ดเก่าสร้างในช่วงระหว่าง migration กับดีพลอย** (`sessionId IS NULL` ของอีเวนต์นั้น · รอบเดียวของอีเวนต์ที่ backfill สร้าง) ก่อนนับ `sold` ใหม่
   - `TicketSession.reconciledAt DateTime?` (คอลัมน์ใน migration A · null ทุกแถวที่ backfill) · **โค้ด K1.1 ปฏิเสธการขาย/ถือบนรอบที่ `reconciledAt IS NULL`** ด้วย `BUSY` ("ระบบกำลังปรับยอด ลองอีกครั้ง") · reconcile ตั้ง `reconciledAt = now()` ในธุรกรรมเดียวกับการนับใหม่ (ล็อกแถวรอบ) · รอบที่สร้างใหม่หลังดีพลอยตั้ง `reconciledAt` ทันที
   - ตัวอย่างที่ต้องผ่าน (ผลตรวจ N-3): โควตา 100 ขายแล้ว 99 ตอน migration · โค้ดเก่าขายอีก 1 · หลังดีพลอยขายไม่ได้จน reconcile ⇒ sold = 100 ⇒ ขายเพิ่มได้ 0 (ไม่เกิด 101)
4. ข้อสอบเทียบก่อน/หลัง: Σ ที่นั่งขายแล้วต่ออีเวนต์ก่อน K1.1 = Σ `sold` ของรอบหลัง reconcile · ร้านตั๋วเดิมไม่เปลี่ยนพฤติกรรม (L-46)
- ออเดอร์ `PENDING` แบบเดิม (ไม่มี `TicketHold`) นับเป็น `sold` ไม่ใช่ `held` — ข้อสอบ §D.3 ของตั๋วใช้สูตร `sold = Σ ตั๋วไม่ VOID ของออเดอร์ PENDING+PAID` (ไม่ใช่ "PAID เท่านั้น")

### B.4 L1.1 — migration «liveaboard» + L1.9 — migration «trip_folio» (แก้รอบ 2 · มติ 10)
| ตาราง | คอลัมน์หลัก | unique / index |
|---|---|---|
| «Vessel» | unit · `name` `code` · `lengthM?` · `maxGuests` · `licenceCapacity?` · `status` · `photos Json` | `@@unique([unitId, code])` |
| «VesselDeckPlanVersion» | `vesselId` · `version` · `status` (`DRAFT` `PUBLISHED` `RETIRED`) · `effectiveFrom` @db.Date · `publishedAt?` `publishedById?` · `impactReport Json?` | `@@unique([vesselId, version])` |
| «VesselDeck» | `versionId` · `name` · `sortOrder` · `areas Json` (ลานดำน้ำ/ห้องอาหาร — ป้าย ไม่ขาย) · `backgroundFileId?` | `@@index([versionId])` |
| «VesselCabinType» | unit · `name Json` · `description Json?` · `basePriceMinor?` `currency` | `@@index([tenantId, unitId])` |
| «VesselCabin» | `versionId` · `deckId` · `code` (M1 D1…) · `cabinTypeId` · `layout Json` `{x,y,w,h}` · `bedType` · `ensuite` · `sellPerBerth` · `photos Json` | `@@unique([versionId, code])` |
| «VesselBerth» | `cabinId` · `code` · `sortKey` · `bedKind` · `sellable` | `@@unique([cabinId, code])` |
| «CabinAssignment» | ต่อรอบ: `departureId` · `tripUnitId` · `passengerId` · `assignedById` · `active` | SQL มือ partial unique `(tripUnitId) WHERE active` · `@@index([departureId])` |
| «TripFolio» (L1.9) | unit · `bookingId` · `status` (`OPEN` `SETTLED` `VOID`) · `balanceSatang` (cache) · `settledAccountDocId?` `settledSaleId?` · `settledAt?` | SQL มือ partial unique `(bookingId) WHERE status='OPEN'` |
| «TripFolioItem» (L1.9) | รูปเดียวกับ `HotelFolioItem` (`hotel.prisma:412`): `folioId` · `type` · `description` · `qty` · `unitAmountSatang` · `amountSatang` · `businessDate` · `refType?` `refId?` (เช่น `PosSale`) · `voidedAt?` · `reversalOfId?` | `@@index([folioId, businessDate])` · `@@index([tenantId, unitId, refType, refId])` |
- รอบ Liveaboard จด `TripDeparture.deckPlanVersionId` ตอนสร้าง · `TripUnit` ของรอบสร้างจากเตียง `sellable` ของเวอร์ชันนั้น · ชื่อ/รูป/คำบรรยายเปลี่ยนได้ทันที (TA §11) · เผยแพร่เวอร์ชันใหม่ = ตัวตรวจผลกระทบคืนรายการจองที่ทับเตียงที่ถูกลบ/ลด → บันทึกไม่ได้จนย้ายเคบิน (นี่ไม่ใช่การบล็อกกฎหมาย — เป็นความถูกต้องของข้อมูล)
- **ทำไมไม่ใช้ `HotelFolio`**: `HotelFolio.reservationId String @unique` + relation บังคับไป `HotelReservation` (`hotel.prisma:396–397`) — การจองทริปไม่มีแถวโรงแรม · ทำให้ nullable = แตะตารางและชนิดของโรงแรม (ไม่ add-only) ⇒ **เบี่ยงจากถ้อยคำในแบบ (TA §1 · §4.3 "ใช้ `HotelFolio`")** ผู้คุมบันทึกใน TRIPS-OWNER-QUESTIONS (OQ11) · หน้าจอ/การลงบิลจาก POS ใช้แบบแผนเดียวกับโรงแรม (§H.6)
- (L1.2 · M-15) เผยแพร่ผังเวอร์ชันใหม่ที่มีผลกับรอบที่มีอยู่: ฟังก์ชัน «repointDepartures(versionId, fromDate)» ใน tx ต่อรอบ: ล็อกรอบ → สร้าง/ปิด `TripUnit` ตามเวอร์ชันใหม่ (เตียงที่มีคนจองต้องย้ายก่อน — ตัวตรวจผลกระทบ) → ปรับ `capacity` ด้วยคำสั่ง (8) §D.1

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
export type SellCtx = { tenantId: string; unitId: string /* หน่วยของหน้าจอง (สิทธิ์/ค่าตั้งของหน้า) */; channel: SellChannel; actor: SellActor; now?: Date; locale?: "th" | "en" };
export type Attribution = { agentCode?: string; staffCode?: string; linkId?: string; source?: string };

export type PaxQty = { paxTypeId: string; qty: number };
export type LineRequest = {
  productKind: ProductKind;
  unitId: string;              // (แก้รอบ 2 · M-15) หน่วยของสินค้าบรรทัดนี้ — ตะกร้าข้ามหน่วยได้
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
  pay: { method: "PAY_NOW" | "PAY_LATER" | "WALLET" | "CREDIT"; tender?: "PROMPTPAY" | "CARD" | "SLIP" | "CASH" };   // (แก้รอบ 3 · m-1) ค่าเดียวกับ `TripBooking.payMethod` · ผู้เก็บเงินไม่ส่งมา — มาจาก `agency.money.collector` (A10) ที่ resolve แล้ว
  note?: string;
};
export type BookingRef = { productKind: ProductKind; bookingId: string; code: string; status: string; publicToken: string; dues: DueSpec[] };
export type CancelRequest = { bookingId: string; mode: "QUOTE" | "EXECUTE"; reason: string; reasonKind?: "CUSTOMER" | "EXTERNAL" | "MIN_NOT_MET" | "SHOP_FAULT"; choice?: "MONEY" | "CREDIT" | "MOVE_DATE"; moveToSlotId?: string; idempotencyKey: string };   // (แก้รอบ 3 · m-1) ค่าเดียวกับ `TripRefundRequest`
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
  // (แก้รอบ 2 · B-2) ใช้โดย platform/basket.ts เท่านั้น — ทำงานใน tx ของผู้เรียก ไม่ commit เอง · สองเฟสตาม §D.5
  capacityRowsOf(ctx: SellCtx, line: LineRequest | { holdId: string }): Promise<CapacityRowRef[]>;   // อ่านไม่ล็อก: แถวเฟส 1 ที่บรรทัดนี้ต้องใช้
  reserveInTx(tx: unknown, ctx: SellCtx, rows: CapacityRowRef[], intent: ReserveIntent): Promise<SellResult<Reservation>>; // เฟส 1 เท่านั้น (ล็อก+ตัวนับ)
  finalizeInTx(tx: unknown, ctx: SellCtx, reservations: Reservation[], req: (HoldRequest | ConfirmRequest) & { basketId: string }): Promise<SellResult<{ holds?: Hold; bookings?: BookingRef[]; ledger: LedgerDraft[] }>>; // เฟส 2 ชั้น 2a–2e · สมุดเอเจนซี่คืนเป็น draft ให้ตะกร้า post ครั้งเดียว (2f)
}
export type CapacityRowRef = { layer: "1a" | "1b" | "1c"; table: string; id: string; sortKey: string };   // ตะกร้าเรียงทั้งหมดตาม (layer, kindIndex, table, sortKey, id)
export type ReserveIntent = { op: "HOLD" | "CONVERT" | "RELEASE" | "MOVE"; qtyPublic: number; qtyAllot: number; allotmentId?: string; unitIds?: string[] };
export type Reservation = { kind: ProductKind; slotId: string; qtyPublic: number; qtyAllot: number; unitIds: string[]; allotmentId?: string };
export type LedgerDraft = { agentAccountId: string; kind: string; amountSatang: number; idempotencyKey: string; refs: Record<string, string> };
export type RequestHash = string;   // (แก้รอบ 2 · m-9) ชนิดเท่านั้น — ตัวคำนวณ (canonical JSON → sha256 ด้วย node:crypto) อยู่ «src/lib/platform/sellables.ts» (server)
```

**กติกา**
1. หน้าจอง · พอร์ทัล · ช่องทาง · API · แชท AI เรียก **ผ่าน `sellableFor(kind)` หรือ `basket.*` เท่านั้น** (ข้อสอบไล่ import: `src/app/book/**` `src/app/agent/**` `src/app/api/v1/{trips,ticket,agency}/**` ไม่ import `trips/booking` `ticket/service` ตรง)
2. `quote()` ไม่เขียนฐาน · `quoteId` = fingerprint · `hold()`/`confirm()` คำนวณใหม่ทุกครั้ง ถ้า fingerprint ไม่ตรง ⇒ `PRICE_CHANGED` พร้อม quote ใหม่ใน `details` (ไม่เดินต่อเงียบ ๆ)
3. **กันซ้ำ**: `hold`/`confirm`/`cancel(EXECUTE)` บังคับ `idempotencyKey` `[A-Za-z0-9_-]{8,100}` · เก็บที่ `TripHold.idempotencyKey` / `SellBasket.idempotencyKey` / `TripRefundRequest` (คีย์ `cancel:<bookingId>:<key>`) คู่กับ `requestHash` · คีย์เดิม+แฮชเดิม = คืนผลเดิม (`duplicated`) · คีย์เดิม+แฮชต่าง = `IDEMPOTENCY_CONFLICT` · namespace (แก้รอบ 2 · m-8): ผู้เรียกสาธารณะ `pub:<basketTokenHash>:<key>` (token ตะกร้า/หน้าจอง — ไม่ใช่ IP+UA) · เอเจนซี่ `ag:<agentAccountId>:<key>` · พนักงาน `st:<userId>:<key>` (กันชนข้ามผู้เรียก)
4. **ตะกร้าหลายชนิด (G24)**: ทุก `confirm` เกิดในตะกร้าเสมอ (ตะกร้าชนิดเดียว = กรณีปกติของรุ่นแรก) · (แก้รอบ 2 · B-2) `basketConfirm` เปิด tx เดียว → ชั้น 0 (`SellBasket` + advisory เพดานถือ) → รวม `capacityRowsOf` ของทุกบรรทัดทุกชนิด → เรียงตาม §D.5 → `reserveInTx` ครบทุกแถวก่อน → `finalizeInTx` ของทุกชนิดตาม `PRODUCT_KINDS` → `postEntries` ของสมุดเอเจนซี่ครั้งเดียว · ชนิดใดล้ม = rollback ทั้งตะกร้า · เงินของตะกร้ารวมงวดตามบรรทัดของแต่ละการจอง (การจองแยกแถวต่อชนิด · ผูกด้วย `basketId`) · UI รุ่นแรกส่งชนิดเดียว แต่ข้อสอบ T0.6 ต้องมีตะกร้า TRIP+TICKET 1 ข้อ (หลัง K1.1)
5. ผลปฏิเสธคืนเป็นข้อมูล (ไม่ throw) · ข้อผิดพลาดไม่คาดคิด = throw (ชั้น API แปลงเป็น 500) · `messageTh` ไม่มีข้อมูลการจองของคนอื่น
6. `availability.publicLeft` = เลขจริงเสมอ (R2 · ห้ามปั้น) · หน้าจองตัดสินเองว่าจะแสดง "เหลือ N" เมื่อ N ≤ ค่าตั้ง «trips.public.showLeftAtOrBelow»
7. `HOTEL` อยู่ในทะเบียนเพื่อให้ `AgentRate.productKind` และตะกร้ารองรับในอนาคต · `sellableFor("HOTEL")` = `KIND_NOT_SUPPORTED` จนมีใบต่อ (เฟส 2)

---

## D. ความจุ ที่ว่าง และการล็อก — เจ้าของ T0.4 (trips) · A1.4 (โควตา) · L1.4 (เตียง) · K1.1 (ตั๋ว) — (แก้รอบ 2 ทั้งหมวด · มติ 2 · 4 · ผลตรวจ B-2 M-1 M-2 M-3 m-5 m-6 m-7)

### D.0 กติกาทุกคำสั่งตัวนับ
1. ทุกการเปลี่ยนตัวนับ = **`UPDATE … WHERE <เงื่อนไขทั้งหมด> RETURNING …` คำสั่งเดียวต่อแถว** (`reference_atomic_counter_single_statement`)
2. **ทุกคำสั่งตรวจจำนวนแถวที่คืน** — 0 แถว (หรือน้อยกว่าที่ขอ) ⇒ `throw new CapacityAbort("<รหัส>")` ⇒ rollback ทั้ง tx · ผู้เรียกแปลงเป็น `SellResult` ตามตาราง: รอบ → `SOLD_OUT`/`SLOT_CLOSED`/`CUTOFF_PASSED` (อ่านแถวหลังล้มเพื่อแยกเหตุ) · โควตา → `INSUFFICIENT_ALLOTMENT` · เตียง → `BERTH_TAKEN` · ถือที่ → `HOLD_EXPIRED` · ตัวนับที่ต้องไม่ติดลบ (`held >= n` · `reserved >= n` · `sold >= n`) → `STATE_CONFLICT` (= ข้อมูลไม่คงที่ · ลง `logOps` ERROR) — **ไม่มีคำสั่งตัวนับใดที่ผลลัพธ์ 0 แถวถูกปล่อยผ่าน**
3. ค่าที่ใช้ตัดสินสาขา (เช่น `AgentAllotment.releasedAt`) **อ่านหลังได้ล็อกแถวรอบแล้วเท่านั้น**
4. ทุกเส้นทางที่เปลี่ยนจำนวนที่ถือของ hold **CAS แถว hold นั้นก่อน** แล้วใช้ตัวเลขที่ `RETURNING` ได้จากแถว hold มาปรับตัวนับ (ไม่ใช้ตัวเลขจากผู้เรียก)

### D.1 คำสั่ง (ทัวร์/ตั๋ว · ลำดับในแต่ละข้อ = ลำดับล็อก §D.5)
```sql
-- (1) ถือที่สาธารณะ
UPDATE "TripDeparture" SET "held" = "held" + $n, "version" = "version" + 1, "updatedAt" = now()
 WHERE "id" = $slot AND "tenantId" = $tenant AND "status" IN ('OPEN','GUARANTEED')
   AND ("cutoffAt" IS NULL OR "cutoffAt" > $now)
   AND "sold" + "held" + "reserved" + $n <= "capacity"
RETURNING "capacity" - "sold" - "held" - "reserved" AS "publicLeft";               -- 0 แถว ⇒ SOLD_OUT/SLOT_CLOSED/CUTOFF_PASSED

-- (2) ถือจากโควตาเอเจนซี่: แถวรอบก่อน (เฟส 1a) แล้วแถวโควตา (เฟส 1b)
UPDATE "TripDeparture" SET "held" = "held" + $n, "reserved" = "reserved" - $n, "version" = "version" + 1
 WHERE "id" = $slot AND "tenantId" = $tenant AND "status" IN ('OPEN','GUARANTEED') AND "reserved" >= $n
   AND ("cutoffAt" IS NULL OR "cutoffAt" > $now) RETURNING "version";                -- 0 แถว ⇒ INSUFFICIENT_ALLOTMENT
UPDATE "AgentAllotment" SET "held" = "held" + $n
 WHERE "id" = $allot AND "agentAccountId" = $agent AND "releasedAt" IS NULL
   AND "used" + "held" + "returnedToPublic" + $n <= "qty" RETURNING "qty" - "used" - "held" - "returnedToPublic" AS "allotLeft"; -- 0 แถว ⇒ INSUFFICIENT_ALLOTMENT
-- ขอเกินโควตา + agency.quota.freeSale (A20) ⇒ n = nAllot + nPublic เรียก (2) ด้วย nAllot แล้ว (1) ด้วย nPublic (แถวรอบเดียวกันถูกล็อกแล้ว)

-- (3) ถือ → ขาย: CAS แถว hold ก่อน (มติ 4 · M-3) แล้วจึงตัวนับ — แต่ลำดับล็อกต้องเป็น รอบ → โควตา → เตียง → hold
--     ⇒ ขั้นจริง: (3a) SELECT … FROM "TripDeparture" WHERE id=$slot FOR UPDATE  (เฟส 1a)
--                (3b) [มีโควตา] SELECT … FROM "AgentAllotment" WHERE id=$allot FOR UPDATE  (เฟส 1b)
--                (3c) [มีเตียง] SELECT … FROM "TripUnit" WHERE "holdId"=$hold ORDER BY "sortKey","id" FOR UPDATE (เฟส 1c)
--                (3d) CAS hold (เฟส 2a):
UPDATE "TripHold" SET "status" = 'CONVERTED', "updatedAt" = now()
 WHERE "id" = $hold AND "tenantId" = $tenant AND "status" = 'ACTIVE' AND "expiresAt" > $now
RETURNING "qtyPublic", "qtyAllot", "allotmentId", "unitIds";                         -- 0 แถว ⇒ HOLD_EXPIRED
--                (3e) ใช้ตัวเลขที่คืนจาก (3d):
UPDATE "TripDeparture" SET "held" = "held" - ($qp + $qa), "sold" = "sold" + ($qp + $qa), "version" = "version" + 1
 WHERE "id" = $slot AND "held" >= ($qp + $qa) RETURNING "sold";                     -- 0 แถว ⇒ STATE_CONFLICT
UPDATE "AgentAllotment" SET "held" = "held" - $qa, "used" = "used" + $qa WHERE "id" = $allot AND "held" >= $qa;  -- เมื่อ qa>0 · 0 แถว ⇒ STATE_CONFLICT
UPDATE "TripUnit" SET "status" = 'SOLD', "bookingItemId" = … WHERE "holdId" = $hold AND "status" = 'HELD';      -- จำนวน = |unitIds| ไม่งั้น STATE_CONFLICT
-- (แถวที่ล็อกไว้แล้วในเฟส 1 — การ UPDATE ภายหลังในเฟส 2 ไม่ใช่การขอล็อกใหม่ จึงไม่ขัดกฎ §D.5)

-- (4) ปล่อยที่ถือ (หมดเวลา/ยกเลิกก่อนขาย/ร้านปฏิเสธ): ล็อกรอบ (+โควตา +เตียง) → CAS hold ACTIVE→EXPIRED|RELEASED RETURNING qtyPublic, qtyAllot → อ่าน releasedAt ของโควตา (หลังล็อก)
--   โควตายังไม่คืน ($allotOpen):
UPDATE "TripDeparture" SET "held" = "held" - ($qp + $qa), "reserved" = "reserved" + $qa WHERE "id" = $slot AND "held" >= ($qp + $qa);
UPDATE "AgentAllotment" SET "held" = "held" - $qa WHERE "id" = $allot AND "held" >= $qa;
--   โควตาคืนแล้ว (ที่ส่วนนี้ไม่ได้อยู่ใน releasedQty เพราะตอนคืนยังถืออยู่ ⇒ กลับสาธารณะ):
UPDATE "TripDeparture" SET "held" = "held" - ($qp + $qa) WHERE "id" = $slot AND "held" >= ($qp + $qa);
UPDATE "AgentAllotment" SET "held" = "held" - $qa, "returnedToPublic" = "returnedToPublic" + $qa WHERE "id" = $allot AND "held" >= $qa;
--   เตียง: ที่มาจากโควตาที่ยังไม่คืน → ALLOTTED (คง allotmentId) · อื่น → FREE (allotmentId = NULL) · จำนวนแถว = |unitIds|
--   ทุกคำสั่ง 0 แถว ⇒ STATE_CONFLICT (D.0)

-- (5) ยกเลิกหลังขาย ต่อบรรทัด TripBookingItem (allotmentId ของบรรทัดบอกที่มา · แก้รอบ 2 M-1):
--   (5a) ที่นั่งสาธารณะ:     sold − n                                  (WHERE sold >= n)
--   (5b) ที่นั่งจากโควตา + returnCancelledToQuota (ใหม่ · L-41) = จริง + โควตายังไม่คืน:
--          รอบ: sold − n, reserved + n · โควตา: used − n                (WHERE used >= n)
--   (5c) ที่นั่งจากโควตา + (ค่าตั้ง = เท็จ หรือ โควตาคืนแล้ว):
--          รอบ: sold − n (ที่กลับสาธารณะ) · โควตา: used − n, returnedToPublic + n
--   ⇒ Σ(qty − used − held − returnedToPublic) ของโควตาที่ยังไม่คืน = reserved เสมอ (ข้อสอบคงที่ D.3)
--   เตียง: SOLD → ALLOTTED (5b) / FREE (5a, 5c) · ปลด bookingItemId

-- (6) คืนโควตาตามวัน (job · ต่อรอบ): ล็อกรอบ → ล็อกโควตา (id เรียง) → ล็อกเตียงของโควตา
UPDATE "AgentAllotment" SET "releasedAt" = $now, "releasedQty" = "qty" - "used" - "held" - "returnedToPublic"
 WHERE "id" = $allot AND "releasedAt" IS NULL AND "releaseAt" <= $now RETURNING "releasedQty";   -- 0 แถว = มีคนคืนไปแล้ว (ข้ามได้ — ไม่ใช่ข้อผิดพลาด เพราะเป็นงานซ้ำ)
UPDATE "TripDeparture" SET "reserved" = "reserved" - $releasedQty WHERE "id" = $slot AND "reserved" >= $releasedQty;  -- 0 แถว ⇒ STATE_CONFLICT (ไม่ปล่อยผ่าน · M-1)
UPDATE "TripUnit" SET "status" = 'FREE', "allotmentId" = NULL WHERE "allotmentId" = $allot AND "status" = 'ALLOTTED';  -- Liveaboard: จำนวน = releasedQty (เตียง=ที่) ไม่งั้น STATE_CONFLICT (M-2)

-- (7) สร้าง/เพิ่มโควตา q: ล็อกรอบ → UPDATE รอบ reserved + q WHERE sold+held+reserved+q <= capacity (0 แถว ⇒ SOLD_OUT)
--     → INSERT/UPDATE AgentAllotment (qty + q) → Liveaboard: UPDATE TripUnit SET status='ALLOTTED', allotmentId=$a WHERE id = ANY($units) AND status='FREE' (จำนวน = q)
--     ลดโควตา = กลับด้าน (เฉพาะส่วนที่ยังว่างในโควตา)
-- (8) ลดความจุ: UPDATE capacity = $new WHERE sold+held+reserved <= $new · 0 แถว ⇒ คืนรายการจอง/โควตาที่กระทบ (ไม่บล็อกร้าน — ร้านตัดสินย้าย/ยกเลิก)
-- (9) ปิดเคบินชั่วคราว (m-5): ล็อกรอบ → ล็อกเตียงของเคบิน (sortKey,id) → UPDATE TripUnit SET status='BLOCKED' WHERE … AND status='FREE' (จำนวนต้องครบ) → capacity − k (คำสั่ง (8))
```
- ตั๋ว (K1.1) ใช้รูปเดียวกันบน `TicketSession` (ยอดรวม) แล้ว `TicketChannelQuota` ตามลำดับ (`type,"*"`) → (`type,channel`) → (`null,channel`) — ทุกแถวคำสั่งเดียว + ตรวจจำนวนแถว · แถวที่ไม่มี = ไม่จำกัดชั้นนั้น · `createOrder` เดิมย้ายไปตัดที่ผ่าน «quota.ts» (L-12)

### D.2 Liveaboard: แถวต่อเตียง (L1.4 · แก้รอบ 2 M-2)
- **ถือผ่านโควตา** (ข้อ 2): เลือกได้เฉพาะ `status='ALLOTTED' AND allotmentId=$allot` · **ถือสาธารณะ** (ข้อ 1): เฉพาะ `status='FREE'` — ห้ามผสม
```sql
SELECT "id" FROM "TripUnit" WHERE "departureId" = $slot AND "id" = ANY($unitIds) ORDER BY "sortKey","id" FOR UPDATE;   -- เฟส 1c
UPDATE "TripUnit" SET "status" = 'HELD', "holdId" = $hold, "version" = "version" + 1
 WHERE "departureId" = $slot AND "id" = ANY($unitIds)
   AND (($path = 'PUBLIC' AND "status" = 'FREE') OR ($path = 'ALLOT' AND "status" = 'ALLOTTED' AND "allotmentId" = $allot))
RETURNING "id";                                                                     -- จำนวน ≠ ที่ขอ ⇒ BERTH_TAKEN
```
  `$hold` = id ที่สร้างไว้ล่วงหน้า (cuid ฝั่งแอป) · แถว `TripHold` INSERT ในเฟส 2a ด้วย id นั้น
- ข้อสอบคงที่ต่อรอบ Liveaboard: `count(TripUnit ALLOTTED) = reserved` · `count(HELD) = held` · `count(SOLD) = sold` · `count(FREE)+count(BLOCKED)…` สอดคล้อง `capacity`
- ถือเคบินหลายวันของเอเจนซี่ = `TripHold.purpose AGENT_HOLD` · `expiresAt` ตาม `agency.hold.duration` (A16) · ต่ออายุ = CAS `UPDATE "TripHold" SET "expiresAt"=$new WHERE id=$h AND status='ACTIVE' AND "expiresAt" > $now` (ถ้าค่าตั้งยอม)
- แชร์ห้องตามเพศ (R6 · `trips.pax.cabinSharing` T31 · m-6): ตอนจัด `CabinAssignment` **ล็อกทุก `TripUnit` ของเคบินนั้น** (sortKey, id) ก่อนอ่านเพศของผู้อยู่ร่วม · "ไม่ระบุ" → คิวร้านยืนยัน

### D.3 สูตรที่ว่าง (R2)
- **สาธารณะ** `publicLeft = capacity − sold − held − reserved` · `reserved = Σ (qty − used − held − returnedToPublic)` ของ `AgentAllotment` ที่ `releasedAt IS NULL`
- **เอเจนซี่** `agentLeft = allotLeft(agent) + (agency.quota.freeSale ? publicLeft : 0)` · หยุดขาย (`AgentStopSell` · `TripDeparture.stopSell`) ⇒ 0
- ข้อสอบคงที่ (ทุกใบที่แตะตัวนับ · ยกเว้นตั๋วเดิม §B.3): `sold = Σ qty ของ TripBookingItem(SEAT/BERTH, active)` ของการจองสถานะ CONFIRMED/PART_PAID/PAID/TRAVELLED/NO_SHOW (**ไม่รวม HOLD/PENDING** — ที่ของสองสถานะนี้อยู่ใน `held`) · `held = Σ qtyPublic+qtyAllot ของ TripHold ACTIVE` · `reserved` ตามสูตรบน · ยิงพร้อมกัน 50 คำขอขายเกินไม่ได้ (MP §5 ก)

### D.4 ตัวกวาดที่ถือหมดเวลา (T0.4 · `trips.expireHolds` ทุก 1 นาที · K1.1 `ticket.expireHolds`)
1. อ่านรายการครบกำหนด **ไม่ล็อก** (ใช้ดัชนีบางส่วน B.0): `SELECT id, "departureId" FROM "TripHold" WHERE status='ACTIVE' AND "expiresAt" <= $now ORDER BY "departureId", id LIMIT 200`
2. ต่อรอบ (tx ละรอบ): เฟส 1 ล็อกรอบ → โควตาที่เกี่ยว (id) → เตียงของ hold เหล่านั้น · เฟส 2 CAS hold `UPDATE "TripHold" SET status='EXPIRED' WHERE id = ANY($ids) AND status='ACTIVE' AND "expiresAt" <= $now RETURNING …` → คืนตัวนับตามแถวที่ CAS ได้จริง (ข้อ 4) → การจองที่ผูก (`TripHold.bookingId`) สถานะ `HOLD` **หรือ `PENDING`** → `EXPIRED` (CAS · id เรียง) → `SupplierRequest`/`AgentRequest` ที่ผูก → `EXPIRED` → outbox
3. **เวลาหมดของ hold** (M-3 · มติ 4 · แก้รอบ 3 N-9): ตั้งตอนสร้างจาก `purpose` — `SHOP_CONFIRM` = «trips.sell.shopConfirmHours» · `AGENT_REQUEST` = `agency.quota.requestResponseHours` (A19) · `SUPPLIER_REQUEST` = `respondBy` («trips.supplier.respondHours») + (`autoCancelOnTimeout` เท็จ ⇒ + «trips.supplier.shopDecisionHours») · `PAYMENT` **ไม่มีเอเจนซี่** = `trips.sell.holdMinutes` (T5) · `PAYMENT` **มี `agentAccountId`** (เอเจนซี่ PAY_NOW · G.0) และ `AGENT_HOLD` = `agency.hold.duration` (A16) · `WAITLIST_OFFER` = `trips.sell.waitlistHoldMinutes` (T9) · ไม่มีที่อื่นเก็บเวลาหมด
4. รับเงินหลังหมดเวลา (W1.4 · ภาพ 07): consumer สลิปเห็นการจอง `EXPIRED` → ลองถือใหม่ (D.1 ข้อ 1) ใน tx ใหม่ · ได้ = เดินต่อ · ไม่ได้ = คืนเงินอัตโนมัติ + `trips.booking.paid_after_expiry`
5. ข้อมูลส่วนบุคคลของการจอง `EXPIRED` ที่ไม่มีเงินเข้า: ลบชื่อ/เบอร์/อีเมลผู้จองหลัง «trips.pdpa.abandonedRetentionDays» (m-14) — job `trips.pdpaPurge` ตั้ง `piiPurgedAt`

### D.5 ลำดับล็อกสองเฟส (แก้รอบ 2 · มติ 2 · ผลตรวจ B-2)
**กฎ:** ในธุรกรรมเดียว ล็อกทุกแถวที่ต้องใช้ตามลำดับชั้นข้างล่าง · **ห้ามขอล็อกแถวชั้น k หลังจากถือแถวชั้นที่มากกว่า k แล้ว** (ทั้งธุรกรรม ไม่ใช่ต่อบรรทัด) · ภายในชั้นเรียงตามคีย์ที่ระบุ · ตะกร้าทำเฟส 1 ของ **ทุกบรรทัดทุกชนิด** ให้เสร็จก่อนเริ่มเฟส 2 ของบรรทัดใด
| ชั้น | แถว | เรียงภายในด้วย |
|---|---|---|
| 0 | `SellBasket` (FOR UPDATE) · `pg_advisory_xact_lock(hashtext('trips-holdcap:'||<capKey>))` สำหรับนับเพดานถือ (G26 · A17 · X10 · m-7) — capKey ดู §D.6 (แก้รอบ 3) | basketId · แล้ว capKey (ข้อความเรียง) |
| **เฟส 1** 1a | แถวรอบ: `TripDeparture` แล้ว `TicketSession` | (ลำดับชนิดใน `PRODUCT_KINDS`, id) |
| 1b | ตัวนับย่อย: `AgentAllotment` แล้ว `TicketChannelQuota` | (ตาราง, id) |
| 1c | เตียง `TripUnit` · `TripResourceUse` (ตอนแก้รอบ) | (departureId, sortKey, id) |
| **เฟส 2** 2a | `TripHold` / `TicketHold` (INSERT ใหม่ หรือ CAS) | id |
| 2b | `TripBooking` / `TicketOrder` / `TripRefundRequest` / `TripFolio` (ลูกของการจอง) | bookingId |
| 2c | `SellCounter` | (series, period) |
| 2d | `TripPaymentDue` · `TripMoneyEvent` (insert) | (bookingId, seq) |
| 2e | `AgentCommission` | id |
| 2f | `AgentBalance` → insert `AgentLedgerEntry` | agentAccountId |
| 2g | `SupplierRequest` · `SupplierPayable` | id |
| 2h | `emitOutbox` (insert) | — |
- **อินเทอร์เฟซ (นิยามเดียว · แก้รอบ 3 N-8)**: (1) `capacityRowsOf(ctx, line)` ของทุกบรรทัดคืน `CapacityRowRef[]` (อ่านไม่ล็อก) → (2) ตะกร้ารวมเป็นรายการเดียวแล้ว **เรียงครั้งเดียวทั้งตะกร้า** ตาม (layer, kindIndex, table, sortKey, id) → (3) เรียก `reserveInTx(tx, ctx, [row], intent)` **ทีละหนึ่งแถว** ตามลำดับนั้น — แต่ละครั้งรันเฉพาะคำสั่ง §D.1 ของแถวนั้นด้วย intent ของบรรทัดเจ้าของแถว (เช่น ถือจากโควตา (2): ครั้งแรก = คำสั่งบนแถวรอบ · ครั้งหลัง (หลังแถวรอบอื่น ๆ ที่เรียงก่อน) = คำสั่งบนแถวโควตา) · ผลสะสมเป็น `Reservation` ต่อบรรทัด → (4) `finalizeInTx` ของทุกชนิด (ตาม `PRODUCT_KINDS`) ทำชั้น 2a–2e → (5) `postEntries` ของสมุดเอเจนซี่ครั้งเดียว (2f) · `TicketChannelQuota` เรียงตาม id ในชั้น 1b ได้ (ลำดับความหมาย type→channel ไม่จำเป็น เพราะทุกการเข้าถึงต้องผ่านแถว `TicketSession` ชั้น 1a ก่อนเสมอ)
- แถวที่ต้องรู้จากการอ่านก่อน (ยกเลิก/ย้าย/ปิดทริป): อ่าน **ไม่ล็อก** เพื่อรู้ชุดแถว → ล็อกตามลำดับ → **อ่านซ้ำและตรวจ `version`/สถานะ** · ถ้าชุดแถวเปลี่ยน (เช่น การจองถูกย้ายรอบระหว่างนั้น) = rollback แล้วเริ่มใหม่ (สูงสุด 3 ครั้ง ⇒ `BUSY`)
- **บัญชี/POS อยู่นอก tx ของ trips เสมอ** (claim สถานะใน tx → เรียกบัญชีด้วยคีย์กันซ้ำหลัง commit → ล้ม = `TripMoneyEvent.postingStatus='UNPOSTED'` เข้าคิวลองซ้ำ ไม่คืนสถานะ)

**ไล่ทุกเส้นทางกับลำดับนี้ (ไม่มีวงจร — ทุกเส้นขอล็อกตามลำดับชั้นเดียวกันเสมอ ⇒ กราฟรอคอยเป็นลำดับย่อยของลำดับรวม จึงไม่มีวง)**
| เส้นทาง | ชั้นที่ล็อก ตามลำดับ |
|---|---|
| ถือที่ (ตะกร้า) | 0 → 1a(ทุกรอบของตะกร้า) → 1b → 1c → 2a(INSERT) → 2h |
| ยืนยัน/รับเงินงวดแรก (consumer สลิป) | 1a → 1b → 1c → 2a(CAS) → 2b → 2c → 2d → 2e(PENDING ใหม่) → 2f(ถ้าเอเจนซี่) → 2g(ถ้าผู้ให้บริการ) → 2h |
| รับเงินงวดถัดไป | 2b → 2d → 2h (ไม่แตะเฟส 1) |
| ตัวกวาดหมดเวลา | 1a → 1b → 1c → 2a(CAS) → 2b → 2g(คำขอที่ผูก) → 2h |
| ยกเลิก (คืนเงิน G.3 EXECUTING) | อ่านไม่ล็อก → 1a → 1b(โควตาของบรรทัด) → 1c → 2b(การจอง+คำขอคืน) → 2d → 2e → 2f → 2g → 2h |
| ย้ายรอบ D1→D2 | 1a(min(D1,D2) แล้ว max) → 1b → 1c(เตียงของทั้งสองรอบ เรียง departureId) → 2a → 2b → 2d → 2h |
| คืนโควตา (job) | 1a → 1b → 1c → 2h |
| สร้าง/ลดโควตา · ลดความจุ · ปิดเคบิน | 1a → 1b → 1c → 2h |
| ร้านยกเลิกรอบ (T1.6) | 1a → 1b(ทุกโควตาของรอบ) → 1c → 2a(ทุก hold ของรอบ CAS) → 2b(ทุกการจอง เรียง id) → 2d → 2e → 2f(ทุกเอเจนซี่ เรียง) → 2g → 2h |
| ปิดทริป (T1.5) | 1a (FOR UPDATE · เปลี่ยนสถานะรอบ) → 2b(ทุกการจอง เรียง) → 2d → 2e → 2f(เรียง) → 2h · บัญชีรับรู้รายได้หลัง commit |
| ใบแจ้งยอด (job/A1.6) | 2f(AgentBalance ของเอเจนซี่นั้น) → (UPDATE `statementId` ของรายการในสมุด — ลูกของหัวสมุด) → 2h · ไม่แตะเฟส 1/2b |
| รอบจ่ายคอมฯ | 2e(คอมฯ ที่เลือก เรียง id) → 2f(เรียง) → 2h |
| ผู้ให้บริการยืนยัน (S1.2) | 1a → 1b → 1c → 2a(CAS) → 2b → 2d → 2e → 2f → 2g → 2h |
| จัดเคบิน/แชร์ห้อง | 1c(ทุกเตียงของเคบิน) → 2b(CabinAssignment = ลูกการจอง) |
- ข้อสอบ X (บังคับ): ลำดับสลับของผลตรวจ B-2 ทุกตัว — ตะกร้า [TRIP(D)+TICKET(S)] ของเอเจนซี่ X ∥ ออเดอร์ตั๋วเอเจนซี่ X บน S · ตะกร้า [D1, D2] ∥ จองเดี่ยว D2 ของเอเจนซี่เดียวกัน · ยกเลิก ∥ ตัวกวาด ∥ คืนโควตา ∥ ยืนยัน บนรอบเดียว 50 รอบ ⇒ ไม่มี `40P01` + ค่าคงที่ D.2/D.3 ถูก


### D.6 เพดานถือที่พร้อมกัน (แก้รอบ 3 · N-11)
- **ใครนับ**: เอเจนซี่ = `capKey = agent:<agentAccountId>` นับ `TripHold` ที่ `agentAccountId` ตรง · สาธารณะ = ตอนถือยังไม่รู้เบอร์/LINE ⇒ `capKey = basket:<basketTokenHash>` (ต่อเบราว์เซอร์/LIFF session) และ **ตรวจซ้ำตอนกรอกผู้จอง** (confirm) ด้วย `capKey = contact:<แฮชเบอร์ normalize หรือ LINE userId>` — เกิน = `HOLD_LIMIT` ที่ confirm (ที่ถืออยู่ปล่อยตามปกติ) · `TripHold.capKeyHash` จดทุกแถวเพื่อนับ
- **นับเฉพาะ** `status = 'ACTIVE' AND "expiresAt" > now()` (แถวที่หมดเวลาแต่ตัวกวาดยังไม่ถึง ไม่นับ)
- **เส้นทางที่นับ**: ถือที่สาธารณะ · เอเจนซี่ (`PAYMENT` ที่มีเอเจนซี่ · `AGENT_HOLD` · `AGENT_REQUEST`) · ต่ออายุ `AGENT_HOLD` · **ไม่นับ**: `WAITLIST_OFFER` (ระบบสร้าง · แต่ยังขอ advisory lock ของ capKey ของผู้รอคิวเพื่อเรียงกับการถือของคนเดียวกัน) · ย้ายรอบ (ปล่อยแล้วถือแทนในการจองเดิม = ยอดสุทธิไม่เพิ่ม · ไม่ขอ lock) · พนักงานหน้าร้าน (`SHOP_CONFIRM`/ถือแทนลูกค้าที่เคาน์เตอร์)
- นับและ INSERT hold อยู่ใต้ advisory lock เดียวกัน (ชั้น 0 ก่อนเฟส 1) ⇒ เกินเพดานพร้อมกันไม่ได้

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
- 122 คีย์ (แก้รอบ 2/3 · m-2): trips `T1–T70` (70 · T55 `trips.license.fields` มีอยู่ — TRIPS-DEFAULTS บรรทัด 125 · T43 `trips.consumer.withdraw7Days` ใช้ที่หน้าจองแสดงสิทธิ์เลิกสัญญา) · ข้อความ T70 `trips.msg.<kind>` · agency `A1–A37` (37) · ticket `K1–K15` (15) · คำเตือน `W01–W46` · ป้ายนักบัญชี 16 คีย์ (§5.1) · ป้ายหน่วยงาน 10 คีย์ (§5.2) — ใบ T0.1/A1.1/K1.1 ลงทะเบียนตามนั้นทุกตัว (ชั้น "SHOP" ในไฟล์นั้น = ชั้น `UNIT`) · คีย์เพิ่มของสัญญา = ภาคผนวก ก (X1–X28)
- คีย์ที่สัญญานี้อ้าง (ตัวอย่าง · ⓢ = จดลง snapshot §F — **รายการจริงที่ทะเบียนต้องลง = §N.3** · แก้รอบ 3):
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

- **คีย์ที่สัญญานี้ต้องการแต่ TRIPS-DEFAULTS ยังไม่มี** — (แก้รอบ 2) ตารางเต็มพร้อมค่าเริ่มที่เสนอ = **ภาคผนวก ก ของ `ledger/TRIPS-DEFAULTS.md`** (รวมคีย์จาก m-14 · VAT คอมฯ · เครดิต/โบนัส · ยืนยันร้าน) · ตารางนี้คือดัชนี:
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
| «agency.quota.requestFirst» (X24) · «agency.quota.returnCancelledToQuota» (X25) | bool · X24: U·AT·A·P · X25: U·AT·A (แก้รอบ 3 · N-10 ตรงกับภาคผนวก) | §D.1 · §G.1 | A1.4 |
| «agency.msg.<ชนิด>» · «ticket.msg.<ชนิด>» (template ต่อข้อความ · trips มีแล้ว = T70) | template · U·P | `notifyCustomer` อ่าน `${domain}.msg.${messageKey}` (`notify-customer.ts:183`) (แก้รอบ 2 · C-9) | A2.2 · K1.3 |
| «trips.sell.shopConfirmHours» · «trips.supplier.shopDecisionHours» | int ชม. · U·P | §D.4 ข้อ 3 (เวลาหมดของ hold PENDING · M-3) | T0.6 · S1.2 |
| «trips.pay.overdueGraceHours» | int · U·P | §G.1 | T0.7 |
| «trips.ops.noShowFixHours» | int · U | §G.1 | T1.5 |
| «trips.cancel.manualEditApprovalSatang» | money · U (ภาพ 15: 2,000) | §G.3 | T0.7 |
| «trips.cancel.creditBonusPct» · «trips.cancel.creditValidityMonths» · «trips.cancel.moveFreeWithinDays» | percent · int · int · U·P (ภาพ 15: 20 · 12 · 90 · เครดิตปิดในรุ่นแรก) | §G.3 | T0.7 · X.2 |
| «trips.public.otpValidMinutes» · «trips.public.holdCapPerContact» | int · U | §J.3.2 · §D.5 ชั้น 0 | W1.3 · T0.4 |
| «trips.pdpa.abandonedRetentionDays» | days · U | §D.4 ข้อ 5 (m-14) | T0.8 |
| «agency.comm.vatMode» (X26) | enum `NONE`/`EXCLUSIVE`/`INCLUSIVE` · U·AT·A · ⚖️ | §H.4 (มติ 8) · (แก้รอบ 3 · N-10) ค่าเริ่มของ def = `NONE` (เครื่องยนต์ให้ได้แค่ค่าแม่แบบ) · **ตัดสินตอนใช้**: ถ้า resolve ได้ `source` = `TEMPLATE`/`FALLBACK` (ร้านไม่ได้ตั้ง) และ `AgentAccount.vatRegistered = true` ⇒ ใช้ `EXCLUSIVE` · ผลจดลง snapshot | A1.3 |
| «trips.cash.varianceApprovalSatang» (X28 · แก้รอบ 3) | money · U | §H.0 เงินสดหน้าร้าน | T1.3 |
| `trips.cancel.refundForm` (T23) **ค่าเริ่มเปลี่ยน** → `MONEY` | — | §G.3 (มติ 7) | T0.7 |

### E.5 ตัวตรวจกฎหมาย = `OK` / `WARN` เท่านั้น · ข้อตัดสินจาก P0.2
1. **ไฟล์** «src/lib/core/settings/legal/th-tour-2569.ts» (ชื่อตาม P0.2) · (แก้รอบ 2 · C-12) ตัวประเมินของไฟล์นี้ **ไม่คืน BLOCK ในทุกกรณี** — rule ไม่รู้จัก/ข้อมูลเข้าผิดรูป = `WARN` รหัส `INVALID_INPUT_WARN` · `setSettings` ของสามโดเมนนี้ไม่เรียก `modeOf` (`service.ts:745` บังคับ STRICT เมื่อ unitId null — ทุกแถว AGENT/AGENT_TIER) · rule id = รหัส `W01`–`W46` ของ TRIPS-DEFAULTS §4 (ข้อความไทยตามตารางนั้น) · ผล `{ level: "OK" | "WARN"; code; messageTh; citation; severity: "NORMAL" | "HIGH" | "HIGHEST"; pendingReview?: true }`
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
- ปัดเศษ (แก้รอบ 3 · N-10/M-e): **ยอดเงิน** ต่อบรรทัด half-up เป็นสตางค์ · ผลรวมยอด = Σ บรรทัด · **VAT คิดต่อเอกสาร** = round(Σ บรรทัด VATable ที่รวม VAT × rate/(10000+rate)) ครั้งเดียว (§H.2) · `vatSatang` ต่อบรรทัดเป็นการปันเพื่อรายงาน (บรรทัดสุดท้ายรับเศษ) · สกุลต่างประเทศ: ราคาตั้งต่อสกุล (ไม่แปลงสด · MP ข้อ 13) · ยอดบาท = round(minor × `fxRateMicros` / 1e6) ต่อบรรทัด · อัตราจาก «trips.fx.rates» (effectiveFrom ≤ เวลาจอง)

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
    unitMinor: number; amountMinor: number; amountSatang: number; vatSatang: number;   // (แก้รอบ 2 · m-15) VAT ปันต่อบรรทัด (รายงาน) · ยอด VAT ของเอกสาร = ต่อเอกสาร (§M M-e)
    agentDiscountSatang: number;                // Q12/A24 ส่วนลดจากคอมฯ ของเอเจนซี่
    costSatang?: number;                        // S1.1 ภายหลัง · ไม่บังคับในรุ่นแรก
    commissionable: boolean; discountable: boolean; passThrough: boolean; taxKind: "VAT7" | "EXEMPT" | "NONE";
    priceSource: "RETAIL" | "SEASON" | "DEPARTURE" | "RULE" | "TIER" | "CONTRACT" | "PROMO" | "MANUAL";
    priceTrace: { step: string; refId?: string; amountMinor: number }[];
  }[];
  totals: { grossSatang: number; discountSatang: number; passThroughSatang: number; vatBaseSatang: number; vatSatang: number; payableSatang: number };
  commission: null | {
    agentAccountId: string; mode: "COMMISSION_PCT" | "COMMISSION_FIXED" | "NET" | "MARKUP";
    baseSatang: number; rateBp: number | null; commissionSatang: number;
    collectMode: "SHOP_COLLECTS" | "AGENT_COLLECTS"; sellerOfRecord: "SHOP_PRINCIPAL" | "AGENT_RESELLS";   // (แก้รอบ 2 · m-1 enum ตาม A10/A5)
    vatMode: "NONE" | "EXCLUSIVE" | "INCLUSIVE"; agencyVatRegistered: boolean; commissionVatSatang: number;   // (แก้รอบ 2 · H.4)
    earnedAt: "AFTER_TRAVEL" | "ON_CONFIRM"; clawbackRule: string;   // A21 · A23 — ยกเลิกบางส่วน: คอมฯ = rate × ฐาน commissionable ที่เหลือ (ปันตามบรรทัด)
    wht: { applies: boolean; payerType: string; payeeType: string; mode: "RATE" | "PROGRESSIVE_50_1" | "NONE_FOREIGN" | "NONE";
           rateBp: number | null; eWht: boolean; whtSatang: number | null; grossUp: boolean; remitter: "SHOP" | "AGENT_ON_BEHALF" | "NONE" };
    agentActualSaleSatang: number | null;
    remitToShopSatang: number; agentEarnsSatang: number; currency: "THB";   // (แก้รอบ 2 · มติ 9) บาทเท่านั้น
  };
  cancelLadder: { daysBefore: number; refundBp: number }[];   // จาก trips/agency/ticket ที่ชนะ (มีชั้นใดเป็นที่มาใน policy.*.sources) — ใช้กับเหตุ CUSTOMER
  cancelMinimumLadder: { daysBefore: number; refundBp: number }[] | null; // ขั้นต่ำตามประกาศ 2563 ณ วันจอง (trips เท่านั้น · ไม่ใช่ ticket — P0.2 C5) ใช้แสดง W01
  shopCancelRefundBpByReason: { EXTERNAL: number; MIN_NOT_MET: number; SHOP_FAULT: number };   // (แก้รอบ 2 · m-1 คีย์ตาม T21)
  refundCredit: { bonusPct: number; validityMonths: number; moveFreeWithinDays: number } | null;   // ภาพ 15 · null ในรุ่นแรก (มติ 7)
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

### G.0 สถานะเริ่มต้นตาม ผู้เก็บเงิน × วิธีจ่ายของเอเจนซี่ (แก้รอบ 2 · ผลตรวจ M-13)
| ผู้เก็บเงิน (A10) | วิธีจ่าย (A11) | สถานะแรก | ที่นั่ง | สมุดเอเจนซี่ตอนยืนยัน | ช่องรับเงิน |
|---|---|---|---|---|---|
| ลูกค้าตรง (ไม่มีเอเจนซี่) | จ่ายตอนจอง (T13 > 0) | `HOLD` | held (hold `PAYMENT`) | — | สลิป/พร้อมเพย์ของงวด (`TRIP_DUE`) |
| ลูกค้าตรง | จ่ายทีหลัง (ร้านยอม · หน้าร้าน) | `CONFIRMED` | sold | — | งวดตามตาราง |
| `SHOP_COLLECTS` (ลิงก์เอเจนซี่) | ใดก็ได้ (ลูกค้าจ่ายร้าน) | ตามแถวลูกค้าตรง | ตามแถวบน | `AgentCommission PENDING` (ไม่มีรายการเงิน) | ลูกค้าจ่าย `TRIP_DUE` |
| `AGENT_COLLECTS` | `PAY_NOW` (ค่าเริ่ม) | `HOLD` | held (hold `PAYMENT` · เวลา = `agency.hold.duration` A16) | — (ยังไม่ลง) | เอเจนซี่จ่ายต่อการจอง: สลิป `AGENCY`/`AGENT_CHARGE` refId = bookingId → เมื่อเข้า: `CONFIRMED`/`PAID` + ลงสมุด `CHARGE`/`COMMISSION_NETTED`/`WHT_GROSSUP` + `PAYMENT` คู่กัน |
| `AGENT_COLLECTS` | `WALLET` | `CONFIRMED` (ถ้ายอดกระเป๋าพอ · ไม่พอ = `HOLD` รอเติม) | sold | `CHARGE` … ตัดจากยอดกระเป๋า (ยอดสมุดติดลบ = เครดิตของเอเจนซี่) | เติมกระเป๋า = สลิป `AGENCY`/`AGENT_TOPUP` |
| `AGENT_COLLECTS` | `CREDIT` | `CONFIRMED` (วงเงินผ่าน · ไม่ผ่าน = A14 `BLOCK_NEW` ⇒ `CREDIT_LIMIT` · `WARN_ONLY` ⇒ เดินต่อ+คำเตือน) | sold | `CHARGE` … ค้างจนใบแจ้งยอด | ชำระใบแจ้งยอด `AGENCY`/`AGENT_STATEMENT` · **หน่วยรับเงิน = `AgentStatement.receiveUnitId`** (ค่าเริ่ม: หน่วยที่มียอดมากสุดในใบ · ร้านเปลี่ยนได้) |
- ทุกแถว + คำขอต้องอนุมัติก่อน (`trips.sell.confirmMode SHOP_CONFIRMS` · «agency.quota.requestFirst» · สินค้าผู้ให้บริการ) ⇒ สถานะแรก `PENDING` ที่นั่ง held (hold `SHOP_CONFIRM`/`AGENT_REQUEST`/`SUPPLIER_REQUEST`) แล้วเมื่ออนุมัติจึงไปตามตาราง

### G.1 การจอง (`TripBooking.status` · `TicketOrder` ใช้ชุดย่อย) — (แก้รอบ 2: เวลาหมดอยู่ที่ `TripHold.expiresAt` เท่านั้น · ชื่อ enum ตาม TRIPS-DEFAULTS)
| จาก → ถึง | เมื่อ | ผู้กระทำ |
|---|---|---|
| (ใหม่) → `HOLD` / `PENDING` / `CONFIRMED` | ตาม G.0 | PUBLIC · AGENT · STAFF |
| `HOLD` → `CONFIRMED`/`PART_PAID`/`PAID` | เงินเข้า (D.1 ข้อ 3 · CAS hold นั้น) | SYSTEM · STAFF |
| `HOLD`/`PENDING` → `EXPIRED` | hold หมดเวลา (§D.4) — **PENDING ก็หมดได้** ตามเวลาตอบคำขอ | SYSTEM |
| `HOLD`/`PENDING` → `CANCELLED` | ผู้จองยกเลิกก่อนจ่าย · ร้าน/ผู้ให้บริการ/ร้านปฏิเสธคำขอเอเจนซี่ (D.1 ข้อ 4) | PUBLIC(OTP) · AGENT · STAFF · SYSTEM |
| `PENDING` → `HOLD` / `CONFIRMED` | อนุมัติ: hold เดิม **CAS เปลี่ยน purpose + expiresAt ใหม่** (PAYMENT) หรือแปลงเป็นขาย (D.1 ข้อ 3) | STAFF · SYSTEM(supplier/peer) |
| `CONFIRMED` → `PART_PAID` → `PAID` | รับเงินงวด | SYSTEM · STAFF |
| `CONFIRMED`/`PART_PAID` → `CANCELLED` (เหตุ `OVERDUE`) | `trips.pay.overdueAction = AUTO_RELEASE` (T17 · ค่าเริ่ม `NOTIFY_SHOP` = แจ้งร้านเท่านั้น) เลยกำหนด + «trips.pay.overdueGraceHours» → คำขอคืนเงิน G.3 แบบ SYSTEM | SYSTEM |
| `CONFIRMED`/`PART_PAID`/`PAID` → `CANCELLED` | คำขอคืนเงิน G.3 `DONE` · ร้านยกเลิกรอบ (T1.6) | STAFF · SYSTEM |
| `CONFIRMED`/`PART_PAID`/`PAID` → `TRAVELLED` | ปิดทริป (T1.5 · หรือ «trips.ops.autoCloseHoursAfterEnd») — ยอดค้าง = ลูกหนี้ | STAFF(ไกด์) · SYSTEM |
| `CONFIRMED`/`PART_PAID`/`PAID` → `NO_SHOW` | ปิดทริปแล้วไม่มีใครในการจองเช็กอิน (ร้านยืนยัน) · เงินที่รับแล้ว = ริบตาม snapshot (H.2 แถว "ไม่มา") | STAFF |
| `NO_SHOW` → `TRAVELLED` | แก้ผิดภายใน «trips.ops.noShowFixHours» · กลับรายการริบด้วยคีย์เดิม | STAFF (`trips.booking.fix`) |
| เปลี่ยนรอบ/แก้คน | ไม่เปลี่ยนสถานะ · ลำดับล็อก D.5 "ย้ายรอบ" · snapshot ใหม่ | STAFF · PUBLIC(OTP ถ้า snapshot ยอม) · AGENT(สิทธิ์) |
- สถานะจบ: `EXPIRED` `CANCELLED` `TRAVELLED` `NO_SHOW` (ยกเว้นแถวแก้ผิด)
- การจองผ่านเอเจนซี่ (R4): หน้า "การจองของฉัน" ของลูกค้า **ไม่มี** ปุ่มเลื่อน/ยกเลิก · ร้านยกเลิกรอบ → ทางเลือก (T22 `MOVE_DATE` `CREDIT` `REFUND_100`) ส่งที่เอเจนซี่
- ตั๋ว: enum `TicketOrderStatus` เดิมคงไว้ · ถือ/หมดอายุอยู่ที่ «TicketHold»

### G.2 คำขอไปผู้ให้บริการ (`SupplierRequest.status` · S1.2)
`DRAFT → SENT → (VIEWED) → CONFIRMED | DECLINED | EXPIRED` · `SENT/VIEWED → CANCELLED` · `EXPIRED → SENT` (ส่งใหม่ — ต้อง CAS ต่ออายุ hold ได้ก่อน ไม่งั้นส่งใหม่ไม่ได้)
- ผู้กระทำ: SYSTEM ส่ง · ผู้ให้บริการกดผ่านลิงก์ token «/sp/[token]» (ไม่ล็อกอิน) หรือ PEER (S1.5 · ต้องมี `SupplierPeerLink ACTIVE` และสินค้าอยู่ใน `productIds`) · STAFF บันทึกแทนพร้อมหลักฐาน
- `CONFIRMED` ⇒ การจอง `PENDING → HOLD/CONFIRMED` + `SupplierPayable(ACCRUED)` · `DECLINED` ⇒ ปล่อยที่ (D.1 ข้อ 4) + คืนเงินถ้ามี · `EXPIRED` (respondBy) ⇒ «trips.supplier.autoCancelOnTimeout» จริง = เหมือน DECLINED · เท็จ = เข้าคิวร้าน (hold ยังอยู่จนหมด `shopDecisionHours` — D.4 ข้อ 3)

### G.3 คำขอคืนเงิน (`TripRefundRequest.status` · T0.7 · ภาพ 15) — (แก้รอบ 2 · มติ 7 · ผลตรวจ M-12)
`REQUESTED → QUOTED` (คำนวณจาก snapshot ทันที) `→ APPROVED | REJECTED | WITHDRAWN` · `APPROVED → EXECUTING → DONE | FAILED` · `FAILED → EXECUTING` (คีย์เดิม)
- **ระหว่าง REQUESTED–APPROVED ที่นั่งยังไม่ปล่อย** และวอเชอร์ถูกระงับ (ภาพ 15 "ที่นั่ง 3 ที่ยังไม่ปล่อยจนกว่าจะอนุมัติ") · `DONE` ⇒ ปล่อยที่ (D.1 ข้อ 5) + เสนอรายการรอ (`trips.sell.waitlistHoldMinutes` T9)
- **สูตร (ต้องได้ตัวเลขภาพ 15):** ต่อบรรทัดของ snapshot
  - บรรทัดที่ **ไม่ใช่เก็บแทน** (ค่าทริป · รายการเสริม): คืน = round(ยอด × refundBp ของขั้นที่ตรงจำนวนวันก่อนเดินทาง ตาม `cancelLadder` · เหตุ `CUSTOMER`) · เหตุ `EXTERNAL`/`MIN_NOT_MET`/`SHOP_FAULT` ใช้ `shopCancelRefundBpByReason` (ค่าเริ่ม 100%)
  - บรรทัด **เก็บแทน**: ยังไม่ได้จ่ายออก (ไม่มี `TripPassThroughEvidence` ของการจอง/รอบนั้น) = **คืนเต็ม** · จ่ายออกแล้ว = คืนตามที่ผู้รับปลายทาง (อุทยาน) คืนได้ (ค่าเริ่ม 0 + คำเตือน) 
  - หัก `deductions` (ค่าใช้จ่ายจริงพร้อมหลักฐาน · T24 · W04)
  - ภาพ 15: ค่าทริป 9,450 × 50% = 4,725 · กล้อง 500 × 50% = 250 · อุทยาน 1,500 ยังไม่ซื้อ = 1,500 ⇒ **คืน 6,475 · ร้านเก็บ 4,975**
- **ทางเลือก** (T23 · T22): `MONEY` · `CREDIT` (เครดิตร้าน = ยอดคืน + โบนัส «trips.cancel.creditBonusPct» × ส่วนที่ร้านเก็บ · อายุ «trips.cancel.creditValidityMonths» — ภาพ 15: 6,475 + 20% × 4,975 = **7,470** · 12 เดือน) · `MOVE_DATE` (ไม่มีค่าใช้จ่ายถ้าเลือกวันใหม่ภายใน «trips.cancel.moveFreeWithinDays» = 90 ในภาพ)
  - **รุ่นแรก (มติ 7): รูปแบบคืน = เงินเท่านั้น** — ค่าเริ่ม `trips.cancel.refundForm` ใน TRIPS-DEFAULTS ต้องเปลี่ยนจาก `CUSTOMER_CHOOSES_MONEY_OR_CREDIT` เป็น `MONEY` (ภาคผนวก ก) · `CREDIT` + โบนัสเป็นค่าตั้งที่ **ปิดอยู่และซ่อน** จนกว่ามีทางออกเครดิตร้าน (STORE_CREDIT ผ่าน giftcard/member facade จากเอกสารบัญชี ไม่ผ่าน POS) — ใบ **X.2** เป็นผู้เพิ่ม · `MOVE_DATE` ใช้ได้รุ่นแรก
- **แก้ยอดมือ**: ต้องมีเหตุผล + สิทธิ์ · ต่างจากที่ระบบคิดเกิน «trips.cancel.manualEditApprovalSatang» (ภาพ: ฿2,000) ⇒ approval core (`entityType` «trips.refund») — คนละคีย์กับ «trips.cancel.autoApproveUpTo» (อนุมัติอัตโนมัติเมื่อผลตรงตาราง)
- ผู้ยื่น: ลูกค้า (OTP · การจองตรง) · เอเจนซี่ · STAFF · SYSTEM (ร้านยกเลิกรอบ เลยเวลาเลือกของ T22 = คืนอัตโนมัติ)
- การจองผ่านเอเจนซี่ (ภาพ 15 ท้าย): เอเจนซี่เก็บเงิน ⇒ ไม่โอนคืนลูกค้า · ลงสมุด `CHARGE_REVERSAL` ตามยอดเน็ตที่คืน + คอมฯ ส่วนที่คืนถูกดึงกลับในงวดเดียวกัน (I.1) · ร้านเก็บเงินผ่านลิงก์ ⇒ ร้านคืนลูกค้า + คอมฯ ลดตามสัดส่วน (`commissionable` ที่เหลือ × rate)

---

## H. เงิน — เจ้าของ T0.7 (ลูกค้า) · A1.5–A1.7 (เอเจนซี่) · S1.3 (ผู้ให้บริการ) · L1.8–L1.9 (Liveaboard) — (แก้รอบ 2 ทั้งหมวด · มติ 1 · 3 · 6 · 7 · 8 · 9 · 10 · ผลตรวจ B-1 B-3 C-1–C-4 C-11 M-6 M-8 m-11–m-13)

หลัก R1: เงินลูกค้าเข้าบัญชีร้านตรง (พร้อมเพย์ของร้าน `receiverFor` · เกตเวย์ของร้านจากศูนย์เชื่อมต่อ) · กระเป๋าเอเจนซี่ = ยอดในสมุด §I · ⚖️ = บรรทัดที่ติดป้าย **"ตรวจกับนักบัญชีของร้าน"** (ค่าเริ่มที่ร้านปรับได้ · TRIPS-DEFAULTS §5.1)

### H.0 เส้นทางเงิน: บัญชี V2 vs POS (มติ 1)
| เส้นทาง | ผ่าน | เหตุผล |
|---|---|---|
| ทุกการรับเงินของการจองทัวร์/Liveaboard (มัดจำ · งวด · จ่ายเต็ม · จ่ายแยกคน) · หน้าร้าน (T1.3) · พร้อมเพย์/สลิป/บัตร | **บัญชี V2** — «applyTripReceipt» | ต้องแยกบรรทัดเก็บแทนเป็นหนี้สินนอกฐาน VAT — POS ทำไม่ได้: `CreateSaleInput.lines` ไม่มีชนิดภาษีต่อบรรทัด (`pos/service.ts:98–117`) · VAT ต่อระบบ POS (`posVatRateBp` `:645,952`) · และ `applyExternalSale` ลงเป็นรายได้ |
| ปิดทริป (รับรู้รายได้) · คืนเงิน/ใบลดหนี้ · ค่ายกเลิก · เงินเก็บแทนจ่ายออก | บัญชี V2 | ต่อเนื่องจากข้างบน |
| เอเจนซี่ (ยอดยืนยัน · รับยอดส่ง · หักกลบคอมฯ · WHT · 50 ทวิ · ใบแจ้งยอด) · คอมฯ ลิงก์ · ผู้ให้บริการ | บัญชี V2 | ไม่มีใน POS |
| บิลบนเรือ (บาร์ · ไนตร็อกซ์ · ของที่ระลึก) | **POS ไม่แก้** → «TripFolio» | ขายเต็ม VAT · แบบเดียวกับลงห้องโรงแรม (§H.6) |
| ตั๋ว (`TicketOrder`) ที่ทุกบรรทัด VAT7 | **POS เดิม** (`ticket/service.ts` `markPaid` → `pos.createSale`) | ใช้ได้วันนี้ไม่ต้องแก้ · ตั๋วที่มีบรรทัดเก็บแทน/ขายผ่านเอเจนซี่เก็บเงิน = เส้นบัญชี V2 แบบทัวร์ |
- **ผลต่อใบ T1.3 "ขายหน้าร้าน"** (แก้รอบ 3 · N-4): จอหน้าร้านสร้างการจอง (ผ่าน sellable) แล้วรับเงินเป็น **ใบเสร็จของบัญชี V2** (`tender` = `CASH` · `PROMPTPAY` · `CARD`) — ไม่เปิดบิล POS · ใบภายหลังเปลี่ยนเป็น POS ได้ถ้าเจ้าของอนุญาต (OQ9) · **เงินสดหน้าร้านของ trips**:
  - บัญชีเงิน = `AccountFinance` ชนิด `CASH` ต่อหน่วย TRIPS ชื่อ "เงินสดหน้าร้าน (ทริป) — <หน่วย>" ผูกด้วย mapping «TRIPS_COUNTER_CASH:<unitId>» (สร้าง lazy ตอนรับเงินสดครั้งแรก) · ขา Dr ของเงินสดใน «applyTripReceipt» = บัญชีนี้ (`financeLedgerId(financeAccountId)` `gl.ts:100`)
  - **ห้ามใช้ลิ้นชัก POS**: เงินสดของ trips อยู่ซอง/ลิ้นชักแยก — ถ้าเข้าลิ้นชัก POS ปิดกะ POS จะเกินทุกวัน · จอหน้าร้านแสดงแถบถาวร "เงินสดการจองเก็บแยก ไม่ใส่ลิ้นชัก POS" + ยอดเงินสดที่ต้องมีวันนี้ + แยกตาม tender + ปุ่ม "ปิดยอดเงินสดวันนี้"
  - ปิดยอดรายวัน = ตาราง «TripCashClose» (unit · `businessDate` · `expectedSatang` (Σ เงินสดรับ − คืนเงินสด ของวัน) · `countedSatang` · `varianceSatang` · `countedById` · `varianceEntryId?` · `transferId?` · unique (unitId, businessDate)) · ส่วนต่าง ≠ 0 = JV Dr/Cr «TRIPS_CASH_VARIANCE» คู่บัญชีเงินสดนี้ (สิทธิ์ `trips.cash.close` · เกิน «trips.cash.varianceApprovalSatang» = approval) · ส่งมอบเงิน = `AccountFinanceTransfer` จากบัญชีนี้ไปเงินสดหลัก/ธนาคาร (`account_gl.prisma:330`) · วันที่ยังไม่ปิดยอด = เตือนเจ้าของวันถัดไป
- ไม่มีสมุดบัญชีผูกหน่วย TRIPS: การจองและการรับเงินยังเกิดได้ (`TripMoneyEvent.postingStatus = UNPOSTED` + คิวบนจอ "เอกสารเงินรอออก") · ออกเอกสารย้อนเมื่อผูกสมุด (คีย์เดิม) · T1.9 ตัวช่วยเปิดร้านผูกสมุดให้ในขั้น "รับเงิน" (แก้ C-11 — ไม่ใช่ `NO_POS`)
- เลขเอกสาร = เลขจริงของโมดูลบัญชี (`nextDocNo` ตามชนิดเอกสาร/สมุด · `account/service.ts:1245`) · `RC-6911-0588` ในภาพ = ตัวอย่างการแสดงผล

### H.1 ฟังก์ชันใหม่ใน facade บัญชี (`src/lib/modules/account/index.ts` · overload/ฟังก์ชันเพิ่มแบบ DORM D.2 — ทางเดิมไม่เปลี่ยน · ทุกตัว idempotent ต่อคีย์ · ผูกสมุดด้วย (tenantId, unitId))
| ฟังก์ชัน | ใบเจ้าของ | เอกสาร | รายการบัญชี (Dr / Cr) |
|---|---|---|---|
| «applyTripReceipt»({tenantId, unitId, bookingId, dueId, tender, paidAt, lines[{description, amountSatang, kind: "VATABLE"\|"PASS_THROUGH"}], customer, customerWhtSatang?, idempotencyKey: `trips-rcv:<dueId>:<slipId\|seq>`}) | T0.7 | (แก้รอบ 3 · N-2) `TAX_INVOICE` ชื่อ "ใบเสร็จรับเงิน/ใบกำกับภาษี" (อย่างย่อ/เต็มรูปตาม T37) **เป็นเอกสารภายนอกที่ยอดหัวเอกสารกำหนดมา และไม่โพสต์อัตโนมัติ** (แบบ `upsertExternalSaleDocument` — `account/index.ts:385–404`) — ดูกติกาใต้ตาราง | **JV ของตัวเอง** (แบบ `postExternalDepositReceipt` + ขาเก็บแทน): Dr เงินตาม tender (`financeLedgerId`) = รวม − ภาษีที่ลูกค้าหัก · Dr `WHT_ASSET` ภาษีถูกหัก (T41 · ⚖️ LA) / Cr `DEPOSIT_RECEIVED` ฐานก่อน VAT · Cr `VAT_OUTPUT` VAT (จุดภาษี = รับเงิน · T36) · Cr «TRIPS_PASS_THROUGH» (หนี้สิน · ⚖️ U2) |
| «recogniseTripRevenue»({bookingId, closedAt, key `trips-rev:<bookingId>`}) | T1.5 | — (JV) | Dr 2110 ฐานที่รับไว้ / Cr 4030 รายได้ค่าบริการ · ยอดที่ยังไม่รับ: Dr 1100 ลูกหนี้ / Cr 4030 + Cr 2210 VAT ยังไม่ถึงกำหนด (แปลงเป็น 2200 ตอนรับเงิน) |
| «applyTripPassThroughPayout»({evidenceId, key}) | T1.5/T0.7 | รายการจ่าย + แนบหลักฐาน (`TripPassThroughEvidence`) | Dr «TRIPS_PASS_THROUGH» / Cr 1000/1010 |
| «applyTripRefund»({requestId, refunded[{VATABLE\|PASS_THROUGH, amount}], retained, tender, key `trips-ref:<requestId>`}) | T0.7 | `CREDIT_NOTE` อ้างใบรับเดิม (T40) สำหรับส่วนที่คืน · ส่วนที่ร้านเก็บตาม T38/T39 | คืน: Dr 2110 ฐาน · Dr 2200 VAT · Dr «TRIPS_PASS_THROUGH» เก็บแทน / Cr เงิน · เก็บ (T39 `NO_AUTO_CREDIT_NOTE` ค่าเริ่ม ⚖️ U3): Dr 2110 ฐานส่วนที่เก็บ / Cr **«TRIPS_CANCEL_INCOME» รายได้ค่ายกเลิก»** (VAT ที่นำส่งคงไว้) · T39 `CREDIT_NOTE_PLUS_DAMAGES_RECEIPT`: ใบลดหนี้เต็ม + "ใบรับเงินค่าเสียหาย" ไม่มี VAT (T38 `DAMAGES_NO_VAT_NO_WHT`) Dr 2110 + Dr 2200 / Cr «TRIPS_CANCEL_INCOME» เต็มยอด |
| «postAgencyCharge»({bookingId, key `ag-chg:<bookingId>`}) | A1.5 | — (JV · ยังไม่มีเอกสารภาษี) | ดู H.2 แถว "ยืนยัน" |
| «applyAgencyRemittance»({agentAccountId, statementId?, bookingIds[], amountSatang, tender, key}) | A1.5/A1.6 | `TAX_INVOICE`/`RECEIPT` เต็มรูป (T37 `FULL_ONLY` ผ่านเอเจนซี่) ต่อการจองที่ครอบคลุม (เรียงวันยืนยัน) ⚖️ U1 | ดู H.2 แถว "รับยอดส่ง" |
| «issueAgentWhtCert»({agentAccountId, settledAt, whtSatang, baseSatang, key}) | A1.6/A1.7 | `WHT_CERT` ฝั่ง **ผู้จ่าย = ร้าน** (ร้านหักภาษีค่านายหน้าของเอเจนซี่ · ห่อ `issueWhtCert` `account/wht.ts:310` · ภ.ง.ด.53/3 ผ่าน `pnd`) | ไม่มี JV เพิ่ม (2130 ลงแล้วตอนหักกลบ/จ่าย) |
| «postAgencyStatement»({statementId}) | A1.6 | `BILLING_NOTE` "ใบแจ้งยอด" (ไม่ใช่เอกสารภาษี · บรรทัดตามภาพ 13ง) | Dr «WHT_PENDING» / Cr 2130 ของคอมฯ ที่หักกลบในงวด (H.3) |
| «accrueAgentCommission» · «payAgentCommission» | A1.7 | ใบสำคัญจ่าย + `WHT_CERT` | ดู H.3 |
| «postSupplierBill» · «paySupplier» | S1.3 | `PURCHASE`/`EXPENSE` อ้างใบกำกับของผู้ให้บริการ | Dr «SUPPLIER_COST» ต้นทุนบริการจากผู้ให้บริการ» (+ Dr 1150 ภาษีซื้อ) / Cr 2100 เจ้าหนี้ · จ่ายล่วงหน้าก่อนเดินทาง: Dr 1130 / Cr เงิน แล้วตัดตอนปิดทริป · WHT ถ้าเป็นค่าบริการ ⚖️ |
| «applyTripFolioSettlement» | L1.9 | ห่อ `reverseRoomChargePosting`/`restoreRoomChargePosting` (`account/index.ts:2546,2549`) แบบโรงแรม | §H.6 |
- **(แก้รอบ 3 · N-2) ทำไมไม่ใช้การโพสต์มาตรฐานของ `DEPOSIT_RECEIPT`**: `gl.ts:667–676` ลง Cr `DEPOSIT_RECEIVED` = ยอดรวม − VAT ⇒ เงินเก็บแทนจะไปอยู่ 2110 และไม่สนบัญชีรายบรรทัด · ใบลดหนี้อ้าง `DEPOSIT_RECEIPT` ถูกปฏิเสธ (`account/service.ts:1929–1930`) ⇒ เอกสารของ trips ทุกใบ (`TAX_INVOICE` ตอนรับเงิน · `CREDIT_NOTE` ตอนคืน · `RECEIPT` "ใบรับเงินค่าเสียหาย") สร้างเป็น **เอกสารภายนอก `source TRIPS` ยอดกำหนดมา ไม่คำนวณใหม่ ไม่โพสต์อัตโนมัติ** + JV ของฟังก์ชัน trips เอง (คีย์กันซ้ำเดียวกับเอกสาร)
- **หัวเอกสาร**: `subTotal` = ฐาน VAT ของบรรทัด VATable เท่านั้น (9,299.07) · `vatAmount` = VAT ต่อเอกสาร (650.93) · ยอดเก็บแทนเก็บในคอลัมน์ใหม่ «AccountDocument.passThroughSatang Int @default(0)» (add-only · T0.7) · `grandTotal` = subTotal − ส่วนลด + VAT + passThrough (11,450) · บรรทัด VATable รวมเป็น **บรรทัดเดียวหรือหลายบรรทัดที่ VAT ไม่ถูกคำนวณใหม่** (ข้อสอบ: VAT ที่พิมพ์ = VAT หัวเอกสาร = ขา `VAT_OUTPUT` ของ JV) · บรรทัดเก็บแทน `vatRateBp = 0` พร้อมป้าย "เก็บแทน · ไม่อยู่ในฐานภาษี"
- **ภ.พ.30 / รายงานภาษีขาย**: รายงานรวม VAT จากขา GL ของเอกสาร และฐาน = `subTotal − discountAmount` (`account/reports.ts:550–564`) ⇒ เก็บแทนไม่ขึ้นทั้งเป็นฐานและเป็น "ยอดขายยกเว้น" (ไม่มีขา VAT และไม่อยู่ใน `subTotal`) · ⚖️ U2 ถ้านักบัญชีต้องการแสดงเป็นรายการนอกฐานแยก = รายงานเสริมของ trips (ยอด «TRIPS_PASS_THROUGH» ต่อเดือน)
- **ไม่อยู่ในมุมมองมัดจำค้าง/ลูกหนี้ค้าง**: เอกสารเหล่านี้ไม่ใช่ `DEPOSIT_RECEIPT` จึงไม่ถูกเสนอให้ "หักมัดจำ" ในใบเสร็จ/ใบแจ้งหนี้อื่น (`gl.ts:650–652` · `service.ts:219–223`) · สถานะ = ชำระแล้ว · T0.7 เพิ่มตัวกรอง `source <> 'TRIPS'` ในรายการเอกสารที่ "แปลง/หักมัดจำได้" และในแดชบอร์ดยอดขายที่นับจากเอกสาร (กำไรขาดทุนอ่านจาก GL ถูกอยู่แล้ว — รายได้รับรู้ตอนปิดทริป)
- **(แก้รอบ 3 · N-6) งวดบัญชีปิด**: โมดูลบัญชีปฏิเสธการโพสต์ลงงวด `CLOSED` (`assertPeriodOpen` `gl.ts:171–176`) และช่วงล็อกของสมุด (`assertNotLockedTx` · `service.ts:8413`) — กติกาของ trips: **JV** ใช้วันที่ลงบัญชี = วันแรกของงวดเปิดถัดไป ด้วยตัวช่วยเดิม `resolveOpenDate` (`gl.ts:205–217` · แบบเดียวกับ `reverseFor`) และจด "วันที่เกิดเหตุ <วัน> · เลขจอง" ใน memo · **เอกสารภาษี** (ใบกำกับ/ใบลดหนี้/ใบรับค่าเสียหาย) ลงวันที่ = วันที่ออกจริง (ไม่ย้อนเข้างวดปิด · อ้างวันเกิดเหตุในหมายเหตุ) · งวดปิดจึง **ไม่ใช่เหตุให้ลองซ้ำ** · คิว `UNPOSTED` ลองซ้ำเฉพาะข้อผิดพลาดชั่วคราว (สูงสุด 10 ครั้ง · ถอยเวลา 5 นาที→6 ชม.) แล้วเป็น `FAILED_NEEDS_ACTION` (ขึ้นจอ "เอกสารเงินรอออก" + `logOps` WARN · หยุดลอง) · ไม่มีสมุด/ไม่มีบัญชีตั้ง (`ACCOUNT_SETUP`) = รอจนร้านแก้ ไม่นับครั้ง
- **(แก้รอบ 3 · N-1) บัญชีใหม่อ้างด้วย "คีย์การลงบัญชีอัตโนมัติ" (`AccountMapping.key`) — ห้ามฝังรหัสบัญชีในโค้ด** · สร้างแบบ lazy ในธุรกรรมเดียวกับรายการแรก ตามแบบ `ensureTenantDepositLedgerInTx` ของหอ (`src/lib/modules/account/gl.ts:2193–2223`: อ่าน mapping → ไม่มีก็หารหัสว่างในช่วงที่กำหนด (`TENANT_DEPOSIT_CODES` 2140–2149 `:2176`) → `accountLedger.createMany(skipDuplicates)` → ตรวจชนิด/ชื่อ → `accountMapping.createMany` → อ่านซ้ำ · ช่วงเต็ม = ปฏิเสธ `ACCOUNT_SETUP` ให้ร้านผูกเองที่หน้าการลงบัญชีอัตโนมัติ) · ⚠️ รอบ 2 เขียนรหัส 2140/4040 ซึ่งชนจริง: 2140–2149 = เงินประกันผู้เช่าของหอ · 4040 = "รายได้ค่าเช่าอุปกรณ์" ในผังนำเข้า (`account/import-shared.ts:114`)
  | คีย์ | ชนิด | ชื่อเริ่มต้น | ช่วงรหัสที่หาว่าง (ข้อเสนอ · ⚖️) |
  |---|---|---|---|
  | «TRIPS_PASS_THROUGH» | LIABILITY | เงินรับแทน (ค่าอุทยาน ฯลฯ) | 2160–2169 |
  | «AGENCY_ADVANCE» | LIABILITY | เงินรับล่วงหน้า-เอเจนซี่ (กระเป๋า · L-52) | 2170–2179 |
  | «WHT_PENDING» | LIABILITY | ภาษีหัก ณ ที่จ่ายรอถึงวันจ่าย | 2180–2189 |
  | «COMMISSION_PAYABLE» | LIABILITY | ค่าคอมมิชชันค้างจ่าย | 2190–2199 |
  | «COMMISSION_PREPAID» | ASSET | ค่าคอมมิชชันจ่ายล่วงหน้า (รอตัดจ่าย) | 1180–1189 |
  | «TRIPS_CANCEL_INCOME» | INCOME | รายได้ค่ายกเลิก/ค่าเสียหาย | 4060–4069 |
  | «SUPPLIER_COST» | COGS | ต้นทุนบริการจากผู้ให้บริการ | 5110–5119 |
  | «AGENT_COMMISSION_EXP» | EXPENSE | ค่าคอมมิชชันตัวแทน | 6530–6539 |
  | «TRIPS_CASH_VARIANCE» | EXPENSE | เงินสดหน้าร้านขาด/เกิน (N-4) | 6540–6549 |
  ช่วงข้างบนตรวจแล้วว่าไม่อยู่ในผังเริ่ม (`account/coa.ts`) และไม่ใช่ช่วงของหอ · T0.7 ตรวจกับผังนำเข้า (`import-shared.ts`) อีกครั้งก่อนลงรหัส · ถ้าร้านมีรหัสในช่วงอยู่แล้ว = ข้ามไปรหัสว่างถัดไป · บัญชีเดิมอ้างด้วยคีย์มาตรฐานที่มีอยู่: `AR` (1100) · `DEPOSIT_PAID` (1130) · `VAT_INPUT` (1150) · `VAT_INPUT_UNDUE` (1155) · `WHT_ASSET` (1160) · `AP` (2100) · `DEPOSIT_RECEIVED` (2110) · `WHT_PAYABLE` (2130) · `VAT_OUTPUT` (2200) · `VAT_OUTPUT_UNDUE` (2210) · `INCOME_SERVICE` (4030) (`account/coa.ts:89–117`) · รหัสในตัวอย่างของเอกสารนี้ = รหัสของผังเริ่มเพื่ออ่านง่ายเท่านั้น
- enum: `AccountDocSource` + `TRIPS` `AGENCY` `SUPPLIER` (B.0 ข้อ 2 · `account.prisma:100` ยังไม่มี) · `recordExternalPayment`/`createExternalCreditNote` เดิมเป็นของหอเท่านั้น (`DormChannel` · `dormBook` `account/index.ts:1926,1948`) ⇒ trips ใช้ฟังก์ชันของตัวเองข้างบน ไม่เรียกของหอ (แก้ C-3)

### H.2 ลูกค้าจ่ายร้านตรง — ตัวอย่างใบเสร็จภาพ 13ค (ต้องได้ตัวเลขนี้)
- TR-6911-0142: ค่าทริป 2 × 3,500 + 2,450 = 9,450 · กล้อง 500 ⇒ **VATable 9,950** (ราคารวม VAT · T34) · ค่าอุทยาน 2 × 600 + 300 = **1,500 เก็บแทน**
- VAT คิดต่อเอกสาร (ส่วนรวม VAT ของบรรทัด VATable) = round(9,950 × 7/107) = **650.93** · ฐาน = 9,950 − 650.93 = **9,299.07** · เก็บแทน 1,500 นอกฐาน · รวม **11,450**
- JV ตอนรับ: Dr 1010 11,450 / Cr 2110 9,299.07 · Cr 2200 650.93 · Cr «TRIPS_PASS_THROUGH» 1,500 · ปิดทริป: Dr 2110 9,299.07 / Cr 4030 9,299.07 · จ่ายค่าอุทยาน: Dr «TRIPS_PASS_THROUGH» 1,500 / Cr 1010 1,500
- **งวดไหนมีเก็บแทน** (B-1): ตาม `trips.pay.depositBase` (T14 · ค่าเริ่ม `TRIP_ONLY`): มัดจำ = % ของบรรทัด VATable เท่านั้น · เก็บแทนทั้งหมดอยู่ในงวดสุดท้าย · ภาพ 03: มัดจำ 30% × 65,800 = 19,740 (VATable ล้วน) · งวด 2 = 46,060 VATable + 3,600 เก็บแทน = 49,660 · `ALL_LINES` = แบ่งตามสัดส่วนทุกงวด — `TripPaymentDue.vatableSatang/passThroughSatang` จดตอนสร้างงวด
- ไม่มา (NO_SHOW): เงินที่รับแล้วฝั่ง VATable = เก็บตาม snapshot (ลงแบบ "ร้านเก็บ" ของ «applyTripRefund» ยอดคืน 0) · เก็บแทนที่ยังไม่จ่ายออก = คืนลูกค้า (ค่าเริ่ม · ภาพ 15 หลักเดียวกัน)
- คืนเงินภาพ 15 (TR-6912-0188 · จ่ายครบ 11,450 · ขั้น 50%): คืน VATable 4,975 ⇒ ใบลดหนี้ ฐาน 4,649.53 + VAT 325.47 · คืนเก็บแทน 1,500 · รวมโอนคืน **6,475** · JV: Dr 2110 4,649.53 · Dr 2200 325.47 · Dr «TRIPS_PASS_THROUGH» 1,500 / Cr 1010 6,475 · ร้านเก็บ 4,975 (T39 ค่าเริ่ม): Dr 2110 4,649.54 / Cr «TRIPS_CANCEL_INCOME» 4,649.54 (VAT 325.46 คงนำส่ง) ⚖️

### H.3 การจองผ่านเอเจนซี่ — ชุดรายการบัญชีครบสองโหมด (มติ 3 · ผลตรวจ B-3)
สัญลักษณ์ต่อการจอง b: **G** = ราคาปลีกบรรทัด VATable (รวม VAT) · **V** = VAT ใน G · **P** = เก็บแทน · **C** = คอมฯ ก่อน VAT · **Vc** = VAT ของคอมฯ (0 ถ้าเอเจนซี่ไม่จด VAT) · **W** = ภาษีหัก ณ ที่จ่ายของคอมฯ (คิดจาก C ก่อน VAT · ตาราง A26 · 0 ถ้าไม่หัก)
**ก. เอเจนซี่เก็บเงิน (`AGENT_COLLECTS` · ค่าเริ่ม Q2/A10)**
| จังหวะ | เอกสาร (ใครออก) | รายการบัญชีของร้าน |
|---|---|---|
| ยืนยัน (ที่นั่ง sold) | ไม่มีเอกสารภาษี · วอเชอร์เอเจนซี่ | «postAgencyCharge»: Dr 1100 ลูกหนี้-เอเจนซี่ (G + P − C − Vc + W) · Dr «COMMISSION_PREPAID» คอมฯ จ่ายล่วงหน้า C · Dr 1155 ภาษีซื้อรอใบกำกับ Vc ⚖️ / Cr 2110 (G − V) · Cr 2210 V · Cr «TRIPS_PASS_THROUGH» P · Cr **«WHT_PENDING» ภาษีหัก ณ ที่จ่ายรอถึงวันจ่าย»** W |
| หักกลบคอมฯ (= วันจ่ายคอมฯ ตาม L3 · `settledAt`) — CREDIT: วันออกใบแจ้งยอด · PAY_NOW/WALLET: วันรับยอดส่ง | ร้านออก **50 ทวิ ให้เอเจนซี่** («issueAgentWhtCert» · ผู้จ่าย = ร้าน) | Dr «WHT_PENDING» W / Cr 2130 W (ภาษีค้างนำส่ง · ภ.ง.ด.53/3 เดือนของ `settledAt`) ⚖️ U1 |
| รับยอดส่ง R = G + P − C − Vc + W | ร้านออกใบกำกับ/ใบเสร็จเต็มรูปของการจองที่ครอบคลุม (ในนามลูกค้า ส่งผ่านเอเจนซี่ — SHOP_PRINCIPAL) · เอเจนซี่ออกใบกำกับค่าคอมฯ ให้ร้าน (ถ้าจด VAT) | «applyAgencyRemittance»: Dr เงิน R / Cr 1100 R · Dr 2210 V / Cr 2200 V (จุดภาษีของบริการ) ⚖️ U1 · รับใบกำกับคอมฯ: Dr 1150 / Cr 1155 Vc |
| ปิดทริป | — | «recogniseTripRevenue»: Dr 2110 (G − V) / Cr 4030 · Dr «AGENT_COMMISSION_EXP» C / Cr «COMMISSION_PREPAID» C |
| ยกเลิกก่อนเดินทาง หลังหักกลบแล้ว (คืนลูกค้าเต็ม) | ใบลดหนี้ถ้าออกใบกำกับแล้ว (T40) · ไม่ออก 50 ทวิ ฉบับใหม่ | กลับ «postAgencyCharge» ทั้งชุด (Dr 2110 · Dr 2210/2200 · Dr «TRIPS_PASS_THROUGH» · Dr «WHT_PENDING» (ยังไม่ถึงวันจ่าย) หรือ Dr 2130 (หักกลบแล้ว · ยังไม่ยื่นเดือนนั้น — ยื่นแล้ว = ปรับเดือนถัดไป ⚖️) / Cr «COMMISSION_PREPAID» · Cr 1155/1150 · Cr 1100) · สมุด `CANCELLATION` = −(G + P − C − Vc + W) (ภาพ 13ง "ยกเลิก/คืน −7,181.50") |
| ยกเลิกมีค่ายกเลิก (แก้รอบ 3 · N-5) | ส่วนคืน: ใบลดหนี้ถ้าออกใบกำกับแล้ว · ส่วนที่ร้านเก็บ: ยังไม่ออกใบกำกับ (ยังไม่รับยอดส่ง) ⇒ "ใบรับเงินค่าเสียหาย" ตาม T38 · ออกแล้ว ⇒ ไม่ออกใบลดหนี้ตาม T39 | ให้ r = สัดส่วนที่คืนของแต่ละบรรทัด (ตามขั้นบันได) · k = ส่วนที่ร้านเก็บ · **ส่วนคืน**: กลับ «postAgencyCharge» ตามสัดส่วน r (Dr `DEPOSIT_RECEIVED` · Dr `VAT_OUTPUT_UNDUE` (หรือ `VAT_OUTPUT` + ใบลดหนี้ ถ้ารับยอดส่งแล้ว) · Dr «TRIPS_PASS_THROUGH» (เก็บแทนยังไม่จ่ายออก = คืนเต็ม) · Dr «WHT_PENDING»/`WHT_PAYABLE` ส่วนของ r / Cr «COMMISSION_PREPAID» C·r · Cr `VAT_INPUT_UNDUE` Vc·r · Cr `AR` สุทธิ) · **ส่วนเก็บ (k)**: ยังไม่รับยอดส่ง (VAT ยังอยู่ `VAT_OUTPUT_UNDUE`) + T38 `DAMAGES_NO_VAT_NO_WHT` ⇒ Dr `DEPOSIT_RECEIVED` (G_k − V_k) · Dr `VAT_OUTPUT_UNDUE` V_k / Cr «TRIPS_CANCEL_INCOME» G_k (ไม่มี VAT · ⚖️) · รับยอดส่งแล้ว (VAT อยู่ `VAT_OUTPUT`) + T39 `NO_AUTO_CREDIT_NOTE` ⇒ Dr `DEPOSIT_RECEIVED` / Cr «TRIPS_CANCEL_INCOME» (G_k − V_k) · VAT คงไว้ · **คอมฯ ของส่วนเก็บ** (C·k ใน «COMMISSION_PREPAID»): A23 `clawbackOnCancel` = จริง (ค่าเริ่ม) ⇒ ดึงคืน Dr `AR` / Cr «COMMISSION_PREPAID» (+ Vc·k) และ WHT ส่วนนั้นกลับแบบส่วนคืน · เท็จ ⇒ Dr «AGENT_COMMISSION_EXP» / Cr «COMMISSION_PREPAID» ณ วันยกเลิก (เอเจนซี่ได้คอมฯ ส่วนนี้) · **สมุด: แถวเดียว `CANCELLATION`** = −(ยอดที่เอเจนซี่ไม่ต้องส่งแล้ว) = −[(G_r + P_r) − C_r − Vc_r + W_r] (+ ส่วนคอมฯ ของ k ถ้าดึงคืน: + (C_k + Vc_k − W_k)) — **ไม่มีแถว `CANCEL_FEE` แยก** (ส่วนเก็บคงอยู่ใน CHARGE เดิม) |
| ยกเลิกหลังเดินทาง / ดึงคอมฯ กลับหลังได้สิทธิ์ | ใบลดหนี้ | Dr 4030 / Cr 1100 · Dr 1100 / Cr «AGENT_COMMISSION_EXP» (คอมฯ ดึงกลับ) · สมุด `COMMISSION_CLAWBACK` |
- (แก้รอบ 3 · N-5) **โหมด `AGENT_RESELLS` (A5 "เอเจนซี่ซื้อมาขายไปในนามตัวเอง") ซ่อนในรุ่นแรก**: ตัวเลือกนี้ไม่แสดงในจอค่าตั้ง/สัญญา · def ของ A5 ยังมีค่านี้ใน enum (ตาม TRIPS-DEFAULTS) แต่ `setSettings` ปฏิเสธค่า `AGENT_RESELLS` ด้วย `VALIDATION` "ยังไม่เปิดใช้ในรุ่นนี้" (ไม่ใช่การบล็อกกฎหมาย — ยังไม่มีชุดรายการบัญชี) ⇒ W13 ไม่เกิดในรุ่นแรก · เปิดได้เมื่อมีใบที่เขียนชุดบัญชี (ร้านขายให้เอเจนซี่ = ใบกำกับถึงเอเจนซี่ตามราคาเน็ต · ไม่มีคอมฯ/WHT ค่านายหน้า)

**ข. ร้านเก็บเงิน (`SHOP_COLLECTS` · ลิงก์เอเจนซี่)**
| จังหวะ | เอกสาร | รายการบัญชี |
|---|---|---|
| ลูกค้าจ่าย | ใบเสร็จ/ใบกำกับของร้าน (H.2) | «applyTripReceipt» |
| ปิดทริป (`agency.comm.earnedAt` A21 = `AFTER_TRAVEL` · ค่าเริ่ม) | — | «recogniseTripRevenue» + «accrueAgentCommission»: Dr «AGENT_COMMISSION_EXP» C · Dr 1155 Vc / Cr «COMMISSION_PAYABLE» (C + Vc) · สมุด `COMMISSION_EARNED` · A21 = `ON_CONFIRM` ⇒ ทำตอนยืนยัน แต่ลง Dr «COMMISSION_PREPAID» แทน «AGENT_COMMISSION_EXP» แล้วตัดตอนปิดทริป |
| รอบจ่ายคอมฯ | ร้านออก 50 ทวิ ให้เอเจนซี่ (วันจ่าย) · เอเจนซี่ออกใบกำกับค่าคอมฯ | «payAgentCommission»: Dr «COMMISSION_PAYABLE» (C + Vc) / Cr เงิน (C + Vc − W) · Cr 2130 W · Dr 1150 / Cr 1155 Vc · สมุด `COMMISSION_PAID` + `WHT_WITHHELD` |
| ยกเลิกหลังได้สิทธิ์ ก่อนจ่าย | — | Dr «COMMISSION_PAYABLE» / Cr «AGENT_COMMISSION_EXP» (+ Cr 1155) · `AgentCommission VOID`/`CLAWED_BACK` |
| ยกเลิกหลังจ่ายแล้ว | — | Dr 1100 ลูกหนี้-เอเจนซี่ / Cr «AGENT_COMMISSION_EXP» (+ Cr 1150) · หักในรอบจ่ายถัดไป · WHT ที่หักไปแล้ว ⚖️ |

**ตัวเลขยืนยัน (ฟิกซ์เจอร์):** เอเจนซี่ PTD (ไม่จด VAT · Vc = 0) 2 ผู้ใหญ่เกาะราชา: G = 7,000 · P = 1,200 · C = 15% × 7,000 = 1,050 · W = 3% × 1,050 = 31.50 ⇒ ส่งร้าน **7,181.50** · ใบแจ้งยอด ST-6911-PTD-1: 101,700 + 11,400 − 15,255 + 457.65 − 7,181.50 − 5,000 = **86,121.15** (§I.3)

### H.4 VAT ของค่าคอมมิชชัน (มติ 8 · ผลตรวจ M-6) ⚖️
- ค่าตั้งใหม่ «agency.comm.vatMode» (enum `NONE` · `EXCLUSIVE` · `INCLUSIVE` · ชั้น SHOP·AGENT · ป้ายนักบัญชี) — **ค่าเริ่ม: `NONE` เว้นแต่ `AgentAccount.vatRegistered = true` ⇒ `EXCLUSIVE`**
- `EXCLUSIVE`: C = rate × ฐาน · Vc = round(7% × C) · W = round(whtRate × C) · ส่งร้าน = G + P − C − Vc + W — ตัวอย่าง C 1,050 ⇒ Vc 73.50 · W 31.50 · ส่งร้าน 8,200 − 1,050 − 73.50 + 31.50 = **7,108.00**
- `INCLUSIVE`: Cᵢ = rate × ฐาน (รวม VAT) · C = round(Cᵢ × 100/107) · Vc = Cᵢ − C · W = round(whtRate × C) · ส่งร้าน = G + P − Cᵢ + W — ตัวอย่าง Cᵢ 1,050 ⇒ C 981.31 · Vc 68.69 · W 29.44 · ส่งร้าน **7,179.44**
- `NONE`: Vc = 0 ⇒ 7,181.50 (ฟิกซ์เจอร์ README ใช้กรณีนี้ — ต้องระบุ `vatRegistered=false` ในฟิกซ์เจอร์)
- จดใน snapshot (`commission.vatMode` `commissionVatSatang` `agencyVatRegistered`) · สมุดมีรายการ `COMMISSION_VAT` (§I.1)

### H.5 หลายสกุลเงิน + จ่ายแยกคน (เฉพาะ Liveaboard)
- ราคาตั้งต่อสกุล · การจองจด `currency` + `fxRateMicros` (อัตรา ณ วันจอง · MP ข้อ 13) · **ทุกเอกสารบัญชีเป็นบาท** · ⚖️ กฎหมาย VAT แปลงสกุล ณ วันที่ความรับผิดเกิด (แต่ละใบรับ) — ค่าเริ่มใช้อัตราที่ล็อก + ป้ายนักบัญชีที่ T4 และ «trips.fx.rates» (m-12)
- **คอมฯ และสมุดเอเจนซี่เป็นบาทเท่านั้นในรุ่นแรก** (มติ 9): A22 ค่าเริ่ม `THB_AT_BOOKING_RATE` ใช้ได้ · `BOOKING_CURRENCY` **ซ่อน/ปิด** (เหตุ: ต้องมีสมุดหลายสกุลและหัวสมุด PK (agent, currency) + ลำดับล็อกต่อสกุล — เลื่อนไปรอบถัดไป · ผู้คุมบันทึก)
- จ่ายแยกคน (L1.8): `TripPaymentDue.kind = PASSENGER_SHARE` ต่อผู้เดินทาง · ลิงก์จ่ายต่อคน · ใบรับต่อคน = «applyTripReceipt» ต่องวดต่อคน (ไม่มีเพดาน 3 ใบ — ไม่ผ่าน POS · m-11 ไม่เกิด)

### H.6 บิลบนเรือ «TripFolio» (L1.9 · มติ 10)
- แบบเดียวกับโรงแรม (`hotel/room-charge.ts` · ไม่แก้ POS): พนักงานบนเรือขายที่ POS แบบ "ลงบัญชีห้อง" (`ROOM_CHARGE` · reference = เลขจองหรือรหัสเคบิน) → consumer ของ `pos.sale.paid` ฝั่ง trips «trips/onboard-bill.onPosSalePaidTripCharge» หาการจองที่กำลังเดินทาง (สถานะ CONFIRMED/PART_PAID/PAID · รอบอยู่ระหว่าง startsAt–endsAt) → `TripFolioItem POS_CHARGE` · หาไม่เจอ = คิว "ยังไม่ผูก" + event
- ⚠️ consumer ของโรงแรม (`outbox-consumers.ts:1519–1526` → `onPosSalePaidRoomCharge`) จะเห็นบิลเดียวกันและเข้าคิว unmatched ของโรงแรม ⇒ ต้องตัดสิทธิ์: บิลที่ POS ผูกกับหน่วย TRIPS หรือ reference ขึ้นต้น prefix ของ trips — **แตะโมดูลโรงแรม** (ไม่ใช่ POS) → รายการ "ต้องขออนุญาต" (L-50)
- ปิดบิลวันสุดท้าย: แบบ `hotel/checkout.ts` — บิลปิด POS (`createSale` · ขายเต็ม VAT) + `reverseRoomChargePosting` ของบิลลงห้องที่รวมแล้ว (รายได้รับรู้ครั้งเดียว) · `TripFolio.status SETTLED`
- POS ที่โค้ดใหม่ใช้ (มติ 12): `createSale` · `afterSaleCommitted` · `voidSale` · `saleStatusByKey` · `posSystemForSale` · `PosSaleError` · ชนิด `CreateSaleInput` — **มีครบบน facade `pos/index.ts:10–38`** · ไม่ใช้ `moduleTakeDeposit`/`moduleRefundDeposit`/`moduleDepositForBill`/`moduleForfeitDeposit` (ไม่อยู่บน facade — แก้ C-1) · ไม่ใช้ `parseTaxInvoiceBuyer` (ไม่อยู่บน facade · ข้อมูลผู้ซื้อใบกำกับเต็มรูปเก็บฝั่งบัญชี)
- กะ POS (m-13): บิลบนเรือขายที่เครื่อง POS ตามกะปกติ · ปิดบิล folio ล้ม `SHIFT_REQUIRED` = คืนข้อผิดพลาดให้พนักงานเปิดกะ (แบบโรงแรม) ไม่มีคิวลองซ้ำอัตโนมัติ

### H.7 ผู้ให้บริการ (S1.3 · ร้านเป็นเอเจนซี่เอง G1)
- ยืนยันการจองสินค้า `sourceKind SUPPLIER` → `SupplierPayable(ACCRUED)` (ไม่มี JV) · ต้นทุนจาก `SupplierCost` จดใน snapshot `lines[].costSatang?` (**ไม่บังคับในรุ่นแรก** · m-15)
- ปิดทริปหรือรับใบแจ้งหนี้ของผู้ให้บริการ (อันที่มาก่อน) → «postSupplierBill» · จ่าย → «paySupplier» · จ่ายล่วงหน้าตามเงื่อนไขผู้ให้บริการ = 1130 แล้วตัด
- ลูกค้ายกเลิก → `SupplierPayable VOID` หรือค่าปรับของผู้ให้บริการ (จดใน snapshot) · กำไรต่อการจอง = (G − V) − ต้นทุนก่อน VAT − C

### H.8 ค่าคงที่ของเงิน (ข้อสอบ 🔴)
- ต่อการจอง: Σ `TripMoneyEvent RECEIVED` − Σ `REFUNDED` = Σ ยอดเอกสารรับเงินบัญชีของคีย์ `trips-rcv:*` − Σ ใบลดหนี้ `trips-ref:*`
- `«TRIPS_PASS_THROUGH»` ของการจอง = Σ เก็บแทนที่รับ − คืน − จ่ายออก ≥ 0 · ไม่มีเก็บแทนในฐาน VAT/ฐานคอมฯ/ส่วนลด
- `2110` ของการจองเป็น 0 หลังปิดทริป (รับรู้หมด) หรือหลังยกเลิก (คืน+เก็บ)
- ยอดสมุดเอเจนซี่ = ยอดลูกหนี้ 1100 ของคู่ค้าเอเจนซี่ในสมุดบัญชี (เทียบรายวัน · ต่างกัน = แจ้ง ops)
- ทุกฟังก์ชันเงินกันซ้ำด้วยคีย์ (ยิงซ้ำ/ซ้อน = ลงครั้งเดียว · X4)

---

## I. สมุดบัญชีเอเจนซี่ (ต่อท้ายอย่างเดียว · บาทเท่านั้น) — เจ้าของ A1.5 (+ A1.6 ใบแจ้งยอด · A1.7 รอบคอมฯ) — (แก้รอบ 2 · มติ 3 · 6 · 8 · 9)

### I.1 ชนิดรายการ (เครื่องหมาย: **บวก = เอเจนซี่ค้างร้าน** · ลบ = ร้านค้างเอเจนซี่/เอเจนซี่มีเครดิต) · บรรทัดใบแจ้งยอด (ภาพ 13ง)
| kind | เครื่องหมาย | เกิดเมื่อ | บรรทัดในใบแจ้งยอด | อ้างอิงบังคับ |
|---|---|---|---|---|
| `CHARGE` | + G | ยืนยัน (ที่นั่ง sold) แบบเอเจนซี่เก็บเงิน | "ราคาขาย N การจองที่ยืนยัน" | bookingKind+bookingId |
| `CHARGE_PASS_THROUGH` | + P | คู่กับ CHARGE | "ค่าอุทยานเก็บแทน" | bookingId |
| `COMMISSION_NETTED` | − C | คู่กับ CHARGE (settleMode NETTED) | "หัก คอมมิชชัน" | commissionId |
| `COMMISSION_VAT` | − Vc | คู่กับ CHARGE เมื่อ vatMode ≠ NONE (H.4) | "หัก VAT คอมมิชชัน" (ไม่แสดงเมื่อ 0) | commissionId |
| `WHT_GROSSUP` | + W | คู่กับ CHARGE (ยอดที่เอเจนซี่ต้องบวกส่ง) · `settledAt` ตั้งตอนหักกลบ | "บวก ภาษีหัก ณ ที่จ่าย" | commissionId · whtCertDocId (ตอนหักกลบ) |
| `CANCELLATION` | −(สุทธิของการจองที่ยกเลิก) | ยกเลิก: กลับ CHARGE+PASS_THROUGH−NETTED−VAT+GROSSUP ของส่วนที่คืน (ตาม snapshot) | "ยกเลิก / คืน N การจอง" | refEntryIds · requestId |
| ~~`CANCEL_FEE`~~ | — | (แก้รอบ 3 · N-5) **ยกเลิกชนิดนี้** — ค่ายกเลิกของการจองที่เอเจนซี่เก็บเงินแสดงเป็น "ส่วนที่ไม่ได้กลับ" ใน `CANCELLATION` แถวเดียว (§H.3 ก) | — | — |
| `PAYMENT` | − | เอเจนซี่จ่ายเงิน | "ชำระแล้วระหว่างงวด" | accountDocId · slipId |
| `WALLET_TOPUP` | − | เติมกระเป๋า | "ชำระแล้วระหว่างงวด" | accountDocId |
| `COMMISSION_EARNED` | − | ปิดทริป (ร้านเก็บเงิน · ร้านค้างคอมฯ) | (พอร์ทัลแสดง "คอมฯ ที่จะได้รับ") | commissionId · `entitledAt` |
| `COMMISSION_PAID` | + | รอบจ่ายคอมฯ | — | runId · `settledAt` |
| `WHT_WITHHELD` | + | ร้านหักตอนจ่ายคอมฯ (ร้านเก็บเงิน) | — | runId · whtCertDocId |
| `COMMISSION_CLAWBACK` | + | ยกเลิกหลังได้สิทธิ์ | รวมใน "ยกเลิก / คืน" | commissionId |
| `ADJUSTMENT` | ± | ปรับมือ (approval บังคับ) | "ปรับปรุง" | approvalId · เหตุผล |
| `REFUND_TO_AGENT` | + | ร้านคืนยอดกระเป๋า/ยอดเกินให้เอเจนซี่ | — | accountDocId |

### I.2 ค่าคงที่
1. ไม่มี UPDATE/DELETE (trigger ปฏิเสธ · ยกเว้นตั้ง `statementId` จาก null ครั้งเดียว) · แก้ = รายการกลับ
2. เขียนผ่าน «agency/ledger.ts» `postEntries(tx, entriesByAgent)` ฟังก์ชันเดียว · ล็อกหัวสมุดเรียง `agentAccountId` (ชั้น 2f · §D.5) · seq = lastSeq+1… (ไม่ขาด) · ตะกร้าเรียกครั้งเดียวท้ายเฟส 2
3. `balanceSatang = Σ amountSatang` · ทุกรายการมี `idempotencyKey` (`charge:<bookingId>` · `pt:<bookingId>` · `net:<commissionId>` · `wht:<commissionId>` · `cxl:<requestId>` · `pay:<slipId|docId>`)
4. **สกุล = บาทเท่านั้น** (มติ 9 · `currency` CHECK `'THB'`) · การจอง USD/EUR ลงสมุดด้วยยอดบาทที่ล็อก ณ วันจอง
5. วงเงิน (ตอนยืนยัน · หลังล็อกหัวสมุด): `exposure = balance + Σ ยอดส่งร้านของการจอง HOLD/PENDING ของเอเจนซี่` เทียบ `agency.money.creditLimit` (A13) → `agency.money.overLimitAction` (A14: `BLOCK_NEW` ⇒ `CREDIT_LIMIT` · `WARN_ONLY` ⇒ เดินต่อ+คำเตือน) · ค้างเกิน `agency.money.creditTermDays` (A12) ใช้ A14 เหมือนกัน · WALLET: ยอดหลังตัด ≤ 0
6. สองวันของคอมฯ (L3): `entitledAt` (A21 `AFTER_TRAVEL` = ปิดทริป · `ON_CONFIRM` = ยืนยัน) กับ `settledAt` (หักกลบ/จ่ายจริง) · เดือนภาษี WHT = เดือนของ `settledAt`
7. ยอดสมุด = ยอดลูกหนี้ 1100 ของเอเจนซี่ในสมุดบัญชี (§H.8)

### I.3 ใบแจ้งยอด (A1.6 · มติ 6 — ภาพ 13ง ที่เจ้าของอนุมัติคือสัญญา)
```ts
generateStatement(ctx, { agentAccountId, periodKey }) → { statementId, created: boolean }   // idempotent ต่อ (agentAccountId, periodKey)
issueStatement(actor, ctx, statementId) → { billingNoteDocId, whtCertDocId?, code }        // DRAFT → ISSUED
recordStatementPayment(ctx, { statementId, amountSatang, slipId? , idempotencyKey })        // → «applyAgencyRemittance» + สมุด PAYMENT
```
- **ขอบเขต (มติ 6):** รายการในสมุดที่ `statementId IS NULL` และเกิดในงวด — คือ **การจองที่ยืนยันในงวด** (รวมที่เดินทางในอนาคต เช่น LB-7002-0029) + ยกเลิก/คืน + ปรับปรุง + ชำระในงวด · ยอดยกมาจากงวดก่อน (ถ้ามี) แสดงบรรทัดแรก · ตรงกับฟิกซ์เจอร์ `STATEMENT_ST_PTD_1` (`scripts/trips-fixture.mts:252` · 31 การจอง · ยกเลิก 2 = 7,181.50 · ชำระ 5,000) ⇒ **86,121.15** · ค่าตั้ง «agency.money.statementScope» จึงไม่ต้องมี (ลบจากภาคผนวก · L-11 ปิด)
- **การรับรู้รายได้แยกจากใบแจ้งยอด**: ใบแจ้งยอดไม่ลงรายได้ · ยอดของทริปที่ยังไม่เดินทางอยู่ที่ 1100 คู่กับ 2110/2210 (H.3) จนปิดทริป
- **เอกสารตอนออกใบแจ้งยอด**: `BILLING_NOTE` "ใบแจ้งยอด" (ไม่ใช่เอกสารภาษี) + `WHT_CERT` 50 ทวิ ที่ร้านออกให้เอเจนซี่สำหรับคอมฯ ที่หักกลบในงวด (ภาพ 13ง "แนบ หนังสือรับรองหักภาษี ณ ที่จ่าย ฿457.65") · **ตอนรับชำระ**: ใบเสร็จ/ใบกำกับเต็มรูป (H.3 «applyAgencyRemittance») · **ตอนปิดทริป**: JV รับรู้รายได้ + ตัดคอมฯ จ่ายล่วงหน้า
- ⚖️ 50 ทวิ ของงวดที่มีการยกเลิก: ภาพแสดง 457.65 (3% ของคอมฯ ทั้ง 31 การจอง) ทั้งที่ 2 การจองถูกยกเลิกในงวดเดียวกัน (WHT ส่วนนั้นถูกกลับใน CANCELLATION) — ค่าเริ่ม: 50 ทวิ = WHT สุทธิหลังกลับรายการ (= 457.65 − 31.50 × จำนวนที่ยกเลิก ถ้าเป็น 2 ผู้ใหญ่) · ฟิกซ์เจอร์/ภาพต้องยืนยัน (L-51)
- ผูก `statementId` ในธุรกรรมเดียวกับสร้างใบ (ล็อกหัวสมุดก่อน) · ใบที่ออกแล้วแก้ไม่ได้ · ยอดบนใบ = Σ รายการ (ไม่คำนวณใหม่) · หน่วยรับเงิน = `receiveUnitId` (G.0)
- เลข `ST-<YYMM>-<รหัสเอเจนซี่>-<n>` §K

### I.4 รอบจ่ายคอมมิชชัน (A1.7 · ร้านเก็บเงินเท่านั้น)
```ts
previewCommissionRun(ctx, { cutoffAt, agentAccountIds? }) → rows[]   // EARNED · PAYOUT · earnedAt ≤ cutoff
createCommissionRun(actor, ctx, { cutoffAt, idempotencyKey }) → runId // CAS EARNED → SETTLING (ชั้น 2e เรียง id)
payCommissionRun(actor, ctx, { runId, paidAt, perAgent: {agentAccountId, financeAccountId}[] }) // «payAgentCommission» + «issueAgentWhtCert» + สมุด
```
- WHT ต่อเอเจนซี่ต่อการจ่าย ตาม `agency.wht.ruleByPayee` (A26) ด้วยข้อมูลภาษีของ `AgentAccount` ร้านนี้ (ไม่ใช่ของ `AgentIdentity`) · เกณฑ์ A27 · บุคคลธรรมดา = ม.50(1) ไม่คำนวณอัตโนมัติ (W10) · ต่างประเทศ = ไม่หัก + ยืนยัน (W08)
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

- (แก้รอบ 2 · M-9) งานข้ามร้านทุกตัวอยู่ในไฟล์ "ทางเข้าข้ามร้าน" ไฟล์เดียวต่อโมดูล (§A.4): `trips/jobs.ts` · `ticket/jobs.ts` · `agency/jobs.ts` · `supplier/public.ts` · ส่วนอื่นใช้ `tenantDb`
- เพิ่ม: `trips.postingRetry` (5 นาที · ส่งเอกสารเงิน `UNPOSTED` ซ้ำด้วยคีย์เดิม · T0.7) · `ticket.reconcileSessions` (ครั้งเดียวหลังดีพลอย K1.1 · รันซ้ำได้ · §B.3)

### J.3 route สาธารณะ · ตัวตน · token (แก้รอบ 2 · มติ 5 · 11 · ผลตรวจ M-5 m-8 m-16)
| route | ใคร | หมายเหตุ | ใบ |
|---|---|---|---|
| «/book/[shop]» · «/book/[shop]/t/[productSlug]» (ทัวร์/Liveaboard) · «/book/[shop]/e/[eventId]» (ตั๋ว) | สาธารณะ | `[shop]` = `Tenant.slug` · แยกส่วน `t`/`e` กันชื่อชนกันระหว่างชนิด (m-16) · `?a=<AgentLink.code>` `?s=` `?d=` `?lang=` · LIFF = route เดียวกัน + `?liff=1` · ฝัง = iframe จาก `embed.js` | W1.1 · W1.2 · K1.3 · W2.1 |
| «/book/[shop]/my/[token]» · «/pay/[token]» · «/form/[token]» | ผู้ถือลิงก์ | ดู/จ่าย/กรอก · แก้/ยกเลิก/ดูเอกสาร PDPA = OTP | W1.3 · T0.7 · T0.8 · L1.8 |
| «/book/embed.js» | สคริปต์ | ตรวจ `Origin` กับ «trips.public.embedDomains» · CSP `frame-ancestors` | W3.1 |
| «/agent/[shop]/…» · «/agent/login» | เอเจนซี่ | §J.3.1 | A1.2 · A2.x |
| «/sp/[token]» | ผู้ให้บริการ | ยืนยัน/ปฏิเสธคำขอจอง | S1.2 |
| «/api/v1/trips» «/ticket» «/agency» | คีย์ API | ผ่าน sellable · webhook | X.1 · A2.4 |

**J.3.1 ล็อกอินและ session ของเอเจนซี่ (มติ 5 · M-5)** — ต้องผ่านผู้ตรวจความปลอดภัยก่อน A1.2
- ตัวตน = «AgentUser» ระดับแพลตฟอร์ม (อีเมลหรือ LINE) — **ไม่ใช้ `User`/`Membership`/`Session` ของ `/app`** · เข้าระบบ: อีเมล → รหัสใช้ครั้งเดียว («AgentLoginCode» · แฮช · หมดอายุ · จำกัดครั้ง) · LINE → LINE Login ของ OA ร้าน (ศูนย์เชื่อมต่อ) ได้ `lineUserId`
- session = «AgentSession» (token สุ่ม ≥ 128 บิต เก็บแฮช · คุกกี้ชื่อของตัวเอง `shark_agent` · `HttpOnly` `Secure` `SameSite=Lax` · path `/agent` · ไม่ใช้คุกกี้ของ `/app` หรือ `shark_portal`) · หมดอายุสัมบูรณ์ + ไม่ใช้งาน · เพิกถอนได้
- ขอบเขตทุกคำขอ: `session.activeAgentAccountId` ต้องเป็น `AgentAccount` ของร้าน `[shop]` ที่ `status ACTIVE` และมี `AgentAccountMember(agentUserId) active` · ทุกคิวรีของพอร์ทัลกรองด้วย `agentAccountId` (เห็นเฉพาะการจองของตัวเอง · MP §5 ง)
- เชิญ/ผูก: ร้านเชิญด้วยอีเมล/ลิงก์ หรือเอเจนซี่ให้ `AgentIdentity.publicCode` แก่ร้าน · **ร้านค้นตาราง `AgentIdentity` ด้วยข้อมูลส่วนบุคคล/เลขภาษีไม่ได้** · ยืนยันเลขภาษีตรงกันได้เฉพาะเมื่อเอเจนซี่กรอกเอง (เทียบ `taxIdHash`)
- `AgentIdentity` แก้ได้เฉพาะ `AgentUser` role `OWNER` ของเอเจนซี่นั้น (ชื่อแสดง/รหัส) · ข้อมูลภาษี/เงินแก้ที่ `AgentAccount` ของแต่ละร้าน โดยร้านนั้น (หรือเอเจนซี่เสนอแก้ → ร้านอนุมัติ) · ร้านไม่เห็น/แก้ `AgentAccount` ของร้านอื่น (scope `tenant`)

**J.3.2 กติกา token** (เดิม + m-8)
- token ในลิงก์ = สุ่ม ≥ 128 บิต · ฐานเก็บแฮช · ลิงก์ที่หมดอายุใช้ `signLink` ซ้อน · ค้นด้วย token ผูก tenant ของ `[shop]` เสมอ
- แก้/ยกเลิก/ดูเอกสาร = OTP เบอร์ (`CustomerOtp`) หรือ LINE userId ที่ผูกการจอง · ยืนยันแล้วอยู่ได้ «trips.public.otpValidMinutes»
- **namespace กันซ้ำของสาธารณะ = token ตะกร้า/session ของหน้าจอง** (`pub:<basketTokenHash>:<key>` — ไม่ใช่แฮช IP+UA) เพื่อให้ลองซ้ำหลังเปลี่ยนเครือข่ายได้ผลเดิม (m-8) · `clientKey` (IP+UA) ใช้กับ rate limit เท่านั้น
- QR ออฟไลน์ = payload เซ็น HMAC · กุญแจตรวจต่อร้านแจกให้เครื่องไกด์/ประตูตอนออนไลน์ · หมุนได้ (ตาราง «GateSigningKey» ใน migration K1.1: `tenantId` · `kid` · `secretBox` · `activeFrom` · `retiredAt?` · M-15)

**rate limit** (`checkRateLimitDb` `rate-limit-db.ts:38`) — `trips:hold:<shop>:<clientKey>` · `trips:otp:<bookingId>` · `trips:token:<clientKey>` · `agent:login:<target>` · `agent:api:<keyId>` · `sp:token:<clientKey>` · เพดาน = «trips.public.rateLimits» (พื้นใน schema · L-22) · เพดานถือพร้อมกันต่อเอเจนซี่/ผู้ติดต่อนับใต้ advisory lock ชั้น 0 (§D.5 · m-7)

### J.4 PDPA และการตลาด (T0.8 · L1.6 · แก้รอบ 2 · มติ 13 · 14 · ผลตรวจ C-7 M-11)
- ไฟล์ส่วนตัว = `uploadFile(visibility "private")` (`storage/service.ts:209`) · ลิงก์ = `privateFileUrl(fileId, viewer, ttlSec ≤ 900)` (`private-links.ts:95` — ลำดับอาร์กิวเมนต์ถูกต้อง) · DTO ห้ามมี URL CDN ถาวร (X10)
- **ผู้ดูชนิดใหม่ใน route `api/files/[id]`** (ปัจจุบันรับแค่ `STAFF` · `CUSTOMER` (`CustomerSession`) · `PORTAL` — `src/app/api/files/[id]/route.ts:94–138`): เพิ่ม `AGENT` (จาก `AgentSession` · ตรวจว่าไฟล์เป็นของการจองของ `activeAgentAccountId` และค่าตั้ง A34/A35 ยอม) และ `LINK_CUSTOMER` (จาก token การจอง + OTP ผ่านแล้ว · ผูก `bookingId`) — แตะ route ชั้นแพลตฟอร์ม ⇒ ใบ T0.8 (LINK_CUSTOMER) · A2.2 (AGENT) · ตรวจเข้ม + ผู้ตรวจความปลอดภัย · จนกว่าจะมี: เอเจนซี่และลูกค้าไม่ล็อกอิน **เปิดไฟล์ไม่ได้** (อัปโหลดได้ · แสดงสถานะ "ส่งแล้ว")
- ทุกการเปิด = แถว `TripDocView` ใน tx เดียวกับออกลิงก์ · จอแสดงปิดบังตาม «trips.pdpa.maskOnScreen»
- เลขเอกสารเก็บเข้ารหัส + `docLast4` · แบบฟอร์มสุขภาพ: เฉพาะสินค้าใน T62 · ช่องยินยอมแยก · เอเจนซี่ไม่เห็นโดยค่าเริ่ม (A34) · ร้านเห็นเฉพาะผู้มีสิทธิ์ `trips.passenger.health`
- `retainUntil` จาก T61 · งาน `trips.pdpaPurge` ลบไฟล์จริง + เคลียร์ช่องเข้ารหัส + `deletedAt` · และลบข้อมูลผู้จองของการจอง EXPIRED ที่ไม่มีเงินเข้า (D.4 ข้อ 5)
- **ลูกค้าของเอเจนซี่ไม่เข้าการตลาดของร้าน (R3 · A31 · กลไกที่ทำได้กับโค้ดจริง)** — สำหรับการจองที่ `marketingEligible = false`:
  1. trips **ไม่เรียก** `member.findOrCreate` และ `member.setConsent` (`member/index.ts:184,246`) — ไม่มี Member ⇒ ไม่เข้า segment/แคมเปญ/journey ของสมาชิก
  2. Party ของผู้จอง/ผู้เดินทางยังสร้างผ่าน `party.safeFindOrCreate` (ใช้ให้บริการ) แต่ **ตัวโหลดแถวของสะพาน CRM** สำหรับ event `trips.booking.*` (แถวใน `SPECS` ของ `src/lib/platform/crm-bridges/business.ts:46` · ชั้น platform อ่านผ่าน facade trips «bookingForCrm(id)») คืน `partyId = null` ⇒ `onBusinessEvent` จบโดยไม่สร้างกิจกรรม CRM (`business.ts:133–140`) — โมดูล member/CRM ไม่อ่านตาราง trips
  3. ร้านกับเอเจนซี่เปลี่ยนในสัญญาได้ (A31 ชั้น AGENT) → การจองหลังจากนั้น `marketingEligible = true`
  4. ข้อสอบ X.2: การจองผ่านเอเจนซี่ (เอเจนซี่เก็บเงิน) ไม่สร้าง Member · ไม่มีความยินยอมการตลาด · ไม่มีกิจกรรม CRM · แต่ใบรายชื่อ/วอเชอร์ทำงาน
- ข้อความบริการตาม `agency.crm.whoMessagesCustomer` (A32 · R5) ตรวจใน «trips/notify.ts» ก่อน `notifyCustomer`

---

## K. เลขเอกสาร — เจ้าของ T0.6 («trips/numbering.ts») · K1.1 (ตั๋ว) · A1.6 (ใบแจ้งยอด)

| ชุด | รูป | ตัวอย่างในภาพ | งวด | ตัวนับ |
|---|---|---|---|---|
| ทัวร์ | `TR-<YY พ.ศ.><MM>-<NNNN>` | TR-6911-0142 · TR-6912-0188 | เดือนของ **วันเดินทาง** (เวลาร้าน) | «SellCounter»(series "TR", period "6911") ต่อ tenant (แก้รอบ 2 · m-10) |
| Liveaboard | `LB-<YYMM>-<NNNN>` | LB-7002-0031 · LB-7002-0029 | เดือนออกเรือ | series "LB" |
| ตั๋ว | `TK-<YYMM>-<NNNN>` | TK-6911-0318 | เดือนเข้าชม (ตั๋วไม่ระบุวัน = เดือนที่ขาย) | series "TK" · คอลัมน์ใหม่ `TicketOrder.code` (`orderNo` เดิมคง) |
| ใบแจ้งยอด | `ST-<YYMM>-<รหัสเอเจนซี่>-<n>` | ST-6911-PTD-1 | เดือนสิ้นงวด | series `"ST:<agentCode>"` |
| รอบคอมฯ | `CR-<YYMM>-<NN>` | — | เดือนตัดยอด | series "CR" |
| ใบเสร็จ/ใบกำกับ/ใบลดหนี้ | **ไม่ใช่ของ trips** (แก้รอบ 2) | RC-6911-0588 | — | เลขจริง = เลขเอกสารของ **โมดูลบัญชี** (`nextDocNo` ตามชนิด/สมุด · `account/service.ts:1245`) จาก «applyTripReceipt»/«applyTripRefund» · ภาพ = ตัวอย่างการแสดงผล (L-14) · บิลบนเรือ = `PosSale.receiptNo` |

**จองเลขแบบอะตอม** (คำสั่งเดียว · ใน tx ของการจอง · ลำดับล็อก §D.5 ข้อ 7 · แบบ `pos/deposit.ts:508`)
```sql
INSERT INTO "SellCounter" ("id","tenantId","series","period","seq") VALUES ($id, $tenant, $series, $period, 1)
ON CONFLICT ("tenantId","series","period") DO UPDATE SET "seq" = "SellCounter"."seq" + 1
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
| L-2 | ทะเบียนค่าตั้งผูกตัวตรวจกฎหมายกับ `TH_RENTAL_2568_RULES` ตายตัว (`registry.ts:11,139,196` · `types.ts:9`) · `evaluateLegal` คืน BLOCK เมื่อ rule ไม่รู้จัก/ข้อมูลเข้าผิดรูป และ `modeOf` บังคับ STRICT เมื่อ `unitId` null (`service.ts:745`) — ทุกแถวชั้น AGENT/AGENT_TIER | ขัด §E.5 (แก้รอบ 2 · C-12) | **ตัดสิน**: «legal/index.ts» ทะเบียนรวม + «legal/th-tour-2569.ts» (`maxLevel: "WARN"`) · ตัวประเมินของ th-tour **คืน WARN (`INVALID_INPUT_WARN`) ไม่ใช่ BLOCK เมื่อข้อมูลเข้าผิดรูป/ไม่รู้จัก** · ขยาย union `LegalRuleId` · ไม่เรียก `modeOf` กับโดเมนนี้ (ไม่มีโหมด) · ข้อสอบ: แถว AGENT ที่ข้อมูลเข้าผิดรูป ⇒ บันทึกได้ + WARN | T0.1 |
| L-3 | `SettingDomain` · `SCOPE_KINDS` · `ScopeRefs` · `REF_FIELD` · `SUPPORTED_SCOPES` · `locateMany` · `entitiesOfUnit` ปิดตายตัว (`types.ts:15,32,48` · `service.ts:84–98,205,281`) | ต้องแก้ core | T0.1 เพิ่ม 5 scope + 3 domain ทีเดียว (ชนิด) · locate เพิ่มโดยใบที่สร้างตาราง (§E.1) · **`chainProblem` ไม่เพิ่มกฎ** (แก้รอบ 2 m-3 · สอดคล้อง L-30) | T0.1 |
| L-4 | `refsFor()`/`snapshotPolicy({scope,scopeId})` คืน null เมื่อ entity ไม่มี unitId (`service.ts:429,481`) — AGENT/AGENT_TIER เป็นระดับร้าน | ขัดการใช้ AGENT | ผู้เรียกส่ง `ScopeRefs` เต็มเสมอ · ไม่แก้ `refsFor` | A1.1 |
| L-5 | `snapshotPolicy` อ่านด้วย `prisma` นอก tx | สังเกต | เรียกก่อนเปิด tx จอง · ยอมรับช่วงเวลาเล็กที่ค่าตั้งอาจเปลี่ยนระหว่าง quote→confirm (snapshot = ค่า ณ `at`) | T0.5 |
| L-6 | `enum UnitType` ไม่มี TRIPS (`core.prisma:63`) · `SettingUnitType` = HOTEL/DORM/BOOKING/POS | ต้องเพิ่ม | `ALTER TYPE "UnitType" ADD VALUE 'TRIPS'` ใน T0.1 · ตั๋วใช้หน่วย `TICKET` เดิม · ร้านดำน้ำที่ขายทั้งคู่ = 2 หน่วย | T0.1 |
| L-7 | `notifyCustomer` รับ domain แค่ `booking`/`rooms` (`notify-customer.ts:35,182`) | ต้องขยาย | เพิ่ม `trips`/`ticket`/`agency` (ข้อความ = `<domain>.msg.<ชนิด>`) · ใบ T1.8 แก้ไฟล์ platform (ตรวจเข้ม) | T1.8 |
| L-8 | `PaymentSlip.domain` = BOOKING/DORM/HOTEL และ `SLIP_DOMAIN_REF` 1 refType ต่อ domain (ประกาศที่ `payment/slip-shared.ts:76` · ใช้ที่ `slip-verify.ts:219`) | ต้องขยาย (แก้รอบ 2 C-10) | `SLIP_DOMAIN_REF` เป็น **รายการ** ต่อ domain: `TRIPS → [TRIP_DUE]` · `TICKET → [TICKET_ORDER]` · `AGENCY → [AGENT_CHARGE, AGENT_TOPUP, AGENT_STATEMENT]` · หน่วยรับเงินของใบแจ้งยอด = `AgentStatement.receiveUnitId` | T0.7 |
| L-9 | POS: เก็บแทนนอกฐาน VAT ทำไม่ได้ (ไม่มีภาษีต่อบรรทัด `pos/service.ts:98–117` · VAT ต่อระบบ `:645,952` · ลงเป็นรายได้) · มัดจำ ≤ 3 ใบ/บิล (`:354–359`) · คืนมัดจำทั้งก้อน · มัดจำ→เครดิตไม่ได้ · ฟังก์ชันมัดจำไม่อยู่บน facade | **ปิดด้วยมติ 1** (แก้รอบ 2 · B-1 C-1 C-2) | trips **ไม่ใช้ POS** รับเงินการจอง — เอกสารเงินทั้งหมดผ่านบัญชี V2 (§H.0/H.1) · POS เฉพาะบิลบนเรือ + ตั๋ว VAT ทั้งใบ · ถ้าเจ้าของอนุญาตแก้ POS ภายหลัง (OQ9) ใบใหม่ย้ายหน้าร้าน (T1.3) ไป POS ได้ | — |
| L-10 | facade บัญชีขาดฟังก์ชันของ trips/agency/supplier · `AccountDocSource` ไม่มี TRIPS/AGENCY/SUPPLIER (`account.prisma:100`) · `recordExternalPayment`/`createExternalCreditNote` เป็นของหอเท่านั้น (`account/index.ts:1926,1948`) · `issueWhtCert` ไม่อยู่บน facade | ขาดของ (แก้รอบ 2 · C-3 C-4 M-8 B-3) | รายการเต็มใน §A.4/§H.1 พร้อมใบเจ้าของ · enum ผ่าน migration ย่อยก่อนโค้ด · ผังบัญชีใหม่ lazy + ⚖️ | T0.7 |
| L-11 | ใบแจ้งยอดมีอะไร | **ปิดด้วยมติ 6** | การจองที่ยืนยันในงวด + ยกเลิก/ปรับปรุง/ชำระ (= ภาพ 13ง · ฟิกซ์เจอร์ 86,121.15) · รายได้รับรู้ตอนปิดทริปแยกต่างหาก (§I.3 §H.3) | — |
| L-12 | ตั๋ว: ตัวนับจริงอยู่ที่ `TicketType.quota/sold` ระดับอีเวนต์ (`ticket.prisma:64`) · แผนมีแค่ 3 ตาราง ไม่มีตัวนับต่อรอบ×ประเภท | ขาดของ | ใช้ `TicketChannelQuota(type,"*")` เป็นโควตาต่อประเภทของรอบ · `createOrder`/`cancelOrder` เดิมเปลี่ยนไปตัดที่รอบใน K1.1 · `TicketType.sold` หยุดเดิน (คงอ่าน) | K1.1 |
| L-13 | เลขตั๋ว | **ตัดสิน** (ผู้ตรวจเห็นด้วยทางเลือก 1) | ออเดอร์ใหม่ได้ `code` `TK-YYMM-NNNN` จาก `SellCounter` · `orderNo` เดิมคง · รหัสตั๋วรายใบ `TK-` + 10 ตัวคงเดิม (`checkIn` ค้นตรงตัวเฉพาะตั๋วรายใบ) | K1.1 |
| L-14 | `RC-6911-0588` ในภาพ 13 ไม่ใช่รูปเลขของ POS (`YYYYMM-NNNN` `pos/service.ts:1013`) หรือบัญชี | ภาพ≠โค้ด | trips ไม่ออกเลข RC · แสดงเลขเอกสารบัญชีจริง (มติ 1) · ข้อสอบภาพคู่ไม่เทียบเลขนี้ | T0.7 |
| L-15 | งวดของเลขจอง: ภาพบอกนัย "เดือนเดินทาง" (LB-7002 จองก่อน พ.ย. สำหรับ ก.พ.) | อนุมาน | ใช้เดือนเดินทาง (พ.ศ. 2 หลัก) · เลื่อนวันไม่เปลี่ยนเลข | T0.6 |
| L-16 | fitness F5 | **แก้รอบ 2** (C-5 C-6 M-9) | F5 นับไฟล์ที่ import `prisma` ไม่ใช่ SQL ดิบ · งบ 50 → 54 (ไฟล์ทางเข้าข้ามร้าน 4 ไฟล์ · §A.4) · ตัวนับใช้ `tenantDb(...).$queryRaw` | T0.4 · K1.1 · A1.1 · S1.1 |
| L-17 | `ALLOWED_EDGES` ต้องเพิ่ม ~20 เส้น (§A.3) · ทิศ trips→agency ทำให้ agency เรียกข้อมูลสินค้าไม่ได้ตรง | ต้องเคาะ | ตาม §A.3 · พอร์ทัลเอเจนซี่อ่านสินค้าผ่าน «platform/sellables.ts» (`availability`/`quote`) | P0.3 ปิด |
| L-18 | ล็อกอินเอเจนซี่ | **ปิดด้วยมติ 5** (แก้รอบ 2 · C-8 M-5) | «AgentUser» + «AgentSession» + «AgentLoginCode» ระดับแพลตฟอร์ม (ไม่ใช้ `User` — `User.email` บังคับ `core.prisma:107`) · คุกกี้ `shark_agent` · ผู้ตรวจความปลอดภัยก่อน A1.2 (§J.3.1) | A1.1 · A1.2 |
| L-19 | พอร์ทัลบริษัท CRM (`/b/[slug]`) มีระบบล็อกอิน B2B อยู่แล้ว | ทางเลือก | ไม่ใช้ร่วม (บทบาท/ขอบเขตต่างกัน · F2.3 ผูกโฟลเดอร์) · อาจยืมส่วน OTP | A1.2 |
| L-20 | `LINK_PURPOSES` ของ `ChatLinkCode` ปิด 3 ค่า (`chat/link-code.ts:20`) | ต้องขยาย | + `TRIP_BOOKING` · `AGENT_ACCOUNT` (ผูก LINE ผู้จอง/เอเจนซี่) | W2.1 |
| L-21 | โควตาเคบิน Liveaboard | **แก้รอบ 2** (M-2) | ถือผ่านโควตาเลือกได้เฉพาะเตียง ALLOTTED ของโควตานั้น · สาธารณะเฉพาะ FREE · (6) คืนเตียงเป็น FREE ใน tx เดียวกับคืนโควตา · (7) ตั้ง ALLOTTED · ข้อสอบ `count(ALLOTTED) = reserved` | L1.4 · L1.12 |
| L-22 | rate limit / เพดานความปลอดภัย เป็น "ค่าคงที่ในโค้ด" ไหม (มติรอบ 4 ห้ามค่าคงที่) | ขัดกันเชิงหลัก | เป็นค่าตั้ง แต่ zod schema มีพื้นขั้นต่ำ (ร้านเข้มขึ้นได้ ลดต่ำกว่าพื้นไม่ได้) · พื้นอยู่ใน defs (ไม่ใช่ในโค้ดธุรกิจ) | W1.1 |
| L-23 | ค่าธรรมเนียมยกเลิก/ริบจากมัดจำที่ออกใบกำกับ (VAT) ไปแล้ว · §13.1 L4: ไม่ออกใบลดหนี้อัตโนมัติ (T39 ร้านเลือก) · `trips.tax.cancelFeeVat` (T38) | ภาษี (U3 ยังไม่ยืนยัน) | ค่าเริ่ม T39 ตาม TRIPS-DEFAULTS: บิลค่าธรรมเนียมใช้มัดจำ ไม่ออก CN ส่วน VAT · เลือก "ออกใบลดหนี้" ได้ · ป้าย 🧾 | T0.7 |
| L-24 | การจองถือที่ตอนจ่าย/รออนุมัติ | **ตัดสินพร้อมเงื่อนไข** (แก้รอบ 2 · M-3 m-14) | แถวการจองเกิดที่ `HOLD`/`PENDING` · เวลาหมดแหล่งเดียว `TripHold.expiresAt` (ตาม purpose) · ข้อสอบ "sold" ไม่นับ HOLD/PENDING · ลบข้อมูลผู้จองของ EXPIRED ที่ไม่มีเงินตาม «trips.pdpa.abandonedRetentionDays» | T0.6 |
| L-25 | ตารางผู้ให้บริการอยู่ migration ไหน | ผู้ตรวจแนะนำ S1.1 | **migration ของ S1.1 เอง** («supplier.prisma») — A1.1 เล็กลง · `SupplierPeerLink` อยู่ด้วย | S1.1 |
| L-26 | "ตารางค่าอุทยาน" เป็นค่าตั้ง (LG `trips.parkFee.table` (T45)) หรือข้อมูล | ตีความ | ค่าตั้งชนิด table + effectiveDated (ชั้น U·V·P) ตาม LG §8.1 | T0.5 |
| L-27 | ช่วงอายุเด็กอยู่ทั้งในค่าตั้ง (`trips.pax.childAgeBand` T27) และ `TripPaxType.ageMin/Max` | ซ้ำ | `TripPaxType` null = อ่านค่าตั้ง · ตั้งที่ประเภทคน = ทับ | T0.2 |
| L-28 | `HOTEL` ในทะเบียนชนิดสินค้า แต่โรงแรมไม่ implement sellable ใน RUN นี้ | ขอบเขต | ประกาศจองไว้ · `AgentRate.productKind = HOTEL` บันทึกได้แต่ใช้ไม่ได้ (คำเตือน) — หรือปฏิเสธจนเฟส 2 (เสนอ: ปฏิเสธ) | A1.3 |
| L-29 | ระดับเอเจนซี่เป็นตาราง (`AgentTier`) หรือข้อความ | ต้องเคาะ | ตาราง ต่อร้าน (scope AGENT_TIER ต้องมีแถวให้ locate) | A1.1 |
| L-30 | ลำดับชั้น: P0.2 วาง PRODUCT หลัง AGENT ในบางคีย์ (A5 A16 A18 A19 A20) ขัดลำดับปริยาย §E.2 | ตัดสินแล้ว | ยอมรับ chain ต่อคีย์ตาม TRIPS-DEFAULTS · ไม่เพิ่มกฎบังคับลำดับใน `chainProblem` · ผลรวมเอเจนซี่×สินค้าเฉพาะ = `AgentRate` / `AgentAllotment` | T0.1 |
| L-31 | ทะเบียนห้าม snapshot kind เดียวมีคีย์หลายโดเมน (`registry.ts:151`) | ขัด "snapshot เดียว" | 3 kind แล้วห่อ (§F.2) | T0.5 |
| L-32 | `ticket` ไม่มี facade · `ticket/service.ts` ล้วง `pos/service` | หนี้เดิม | K1.1 สร้าง `ticket/index.ts` · โค้ดใหม่ใช้ facade POS · ของเดิมไม่ย้าย (ไม่ขยายขอบเขต) | K1.1 |
| L-33 | `TicketOrder.publicToken` / `HotelReservation.publicToken` เก็บ cuid ดิบ | แบบเดิมอ่อนกว่า | ของใหม่เก็บแฮช (§J.3) · ของเดิมไม่แตะ | W1.1 |
| L-34 | สถานะตั๋วเป็น Prisma enum (`TicketOrderStatus`) | ข้อจำกัด | ไม่เพิ่มค่า enum · สถานะถือ/หมดอายุของตั๋วอยู่ที่ `TicketHold` | K1.1 |
| L-35 | **บิลบนเรือ** | **ปิดด้วยมติ 10** | «TripFolio»/«TripFolioItem» รูปเดียวกับ `HotelFolio` (`HotelFolio.reservationId` FK บังคับ `hotel.prisma:396–397`) · เบี่ยงจากถ้อยคำ TA §1/§4.3 (ผู้คุมลง OQ11) · หน้าจอ+ลงบิลจาก POS แบบโรงแรม (§H.6) | L1.9 |
| L-36 | `PosSale.sourceModule` ใหม่ | แก้รอบ 2 | trips ใช้ POS เฉพาะบิลปิด folio (`sourceModule "TRIPS_FOLIO"`) · L1.9 ตรวจรายงาน POS กับค่าใหม่ | L1.9 |
| L-37 | P0.2 (b): `setSettings` บังคับเหตุผล ≥ 10 ตัวอักษรเมื่อรับคำเตือน (`service.ts:943`) · WARN ของหอมีสายอนุมัติเจ้าของ | ตัดสินแล้ว | โดเมน trips/agency/ticket: คงการรับทราบ (`ackLegalWarn`) · **ไม่บังคับเหตุผล** · ไม่มีสายอนุมัติ · หอ/จองคิวเดิมทุกไบต์ (§E.5 ข้อ 3) | T0.1 |
| L-38 | ภาพ 04ก/05 (฿86,300) กับ 13ง (฿86,121.15) ตัวเลขชุดต่างกัน | ภาพไม่ตรงกัน | ฟิกซ์เจอร์ QC ใช้ชุด 13ง (มติรอบ 5) · ข้อสอบภาพคู่ 04ก/05 ยกเว้นตัวเลขยอดรวม | A2.1 |
| L-39 | ตั๋วไม่ระบุวัน (open-dated) ไม่มีรอบ — ตัดที่จากไหน | ช่องว่าง | สร้าง `TicketSession` เสมือนต่อ "ช่วงใช้ได้" (เช่น รายเดือน) ที่ capacity = โควตาขายล่วงหน้า · เข้าประตูไม่ตัดที่ | K1.2 |
| L-40 | `trips→agency` ใน tx: การจองเรียก `agency.postEntries`/`claimAllotment` ใน tx ของ trips ⇒ facade agency ต้องรับ `tx` | รูปแบบ | ฟังก์ชัน `*InTx(tx, …)` ใน facade agency (แบบ `queue/service.issueTicketTx`) · ไม่มี `$transaction` ซ้อน | A1.4 · A1.5 |
| L-41 | คีย์ที่สัญญาเพิ่ม | แก้รอบ 2 (+ m-14) | อยู่ใน **ภาคผนวก ก ของ `ledger/TRIPS-DEFAULTS.md`** (ชื่อ · ชนิด · ชั้น · ค่าเริ่มที่เสนอ · ป้าย) | T0.4 |
| L-42 | ข้อความแจ้งเตือน | **แก้รอบ 2** (C-9: T70 `trips.msg.<kind>` มีแล้ว) | คงชื่อ T69 `trips.msg.enabled` · สงวนชนิดข้อความชื่อ `enabled` (`notifyCustomer` ปฏิเสธ def ที่ไม่ใช่ template อยู่แล้ว `notify-customer.ts:184–185`) · เพิ่ม `agency.msg.<kind>` · `ticket.msg.<kind>` (ภาคผนวก ก) | T1.8 · K1.3 · A2.2 |
| L-43 | P0.2 C9: ค่าอุทยาน ฿600/฿300 ของร้านตัวอย่างไม่ตรงตารางทางการ T45 ⇒ ฟิกซ์เจอร์จะเรียก W05 ทุกการจอง | ฟิกซ์เจอร์ | ฟิกซ์เจอร์ P0.1 เพิ่มแถว "เกาะราชา" ของร้านใน T45 (ร้านแก้ตารางได้) · ข้อสอบ W05 ใช้กรณีแยก | T0.7 |
| L-44 | `trips.tax.vatRegistered` (T33) เป็นค่าตั้ง แต่สถานะจด VAT จริงอยู่ที่สมุดบัญชี (`vatConfigOf` `account/index.ts:50`) | สองแหล่ง | ค่าเริ่มของ T33 = อ่านจากสมุดที่ผูกหน่วย (ไม่มีสมุด = ค่าแม่แบบ) · ต่างกัน = WARN · เอกสารเงินจริงใช้ค่าของสมุดเสมอ | T0.7 |
| L-45 | ตารางยกเลิกขั้นต่ำ (ประกาศ 2563) ใช้กับ trips เท่านั้น ไม่ใช่ตั๋วเข้าชม (P0.2 C5) · ตารางภาพ 03 เข้มกว่าขั้นต่ำ | ตัดสินแล้ว | W01 ทำงานบนโดเมน trips (รวม LIVEABOARD) · ticket ใช้ K5 ไม่มีคำเตือนขั้นต่ำ · ภาพ 03 = ค่าร้านสมมติ จอค่าตั้งแสดง W01 | T0.7 |
| L-46 | P0.2 (c): ticket `_fallback` ต้องเป็นพฤติกรรม MVP เดิม แต่ K1.1 เปลี่ยน createOrder ไปตัดที่ตามรอบ (L-12) | ตัดสินแล้ว | `_fallback` ของ ticket: ไม่มีถือที่หมดเวลา · ไม่ปิดรับ · ไม่คืนเงินอัตโนมัติ · ช่องทางเดียวจากที่ว่างรวม (§E.5 ข้อ 8) · ตัวนับย้ายไปรอบ default ที่ backfill แต่ผลต่อร้านเดิมเท่าเดิม (ข้อสอบเทียบก่อน/หลัง) | K1.1 |
| L-47 | กลุ่มดำน้ำ (G8 · T49 อัตราผู้ควบคุม 1:4 / 1:2 · T50 กล้อง) ไม่มีตารางใน migration ใดของสัญญานี้ | ขาดตาราง | ใบ L1.10 เพิ่ม «TripDiveGroup» + «TripDiveGroupMember» (migration ย่อย add-only · ตรวจเข้ม) · W ตามอัตราเป็นคำเตือนตอนจัดกลุ่ม | L1.10 |
| L-48 | §13.1 L13 คำขอลบข้อมูลต้องเสร็จใน 90 วัน + ROPA อัตโนมัติ (T64 T65) — ไม่อยู่ในใบใดของแผนโดยตรง | ขอบเขต | `TripPdpaRequest` ใน migration T0.1 · คิวคำขอ + ROPA ร่างอยู่ในใบ T0.8 | T0.8 |
| L-49 | TA §13.1 อ้าง "ข้อสอบจากกฎ 52 ข้อ" แต่ LG §11 มี 47 แถว (P0.2 C7) | ตัวเลขเอกสาร | ใช้ 47 + คู่ W01–W46 · ผู้คุมแก้ข้อความใน TA/MP | — |
| L-50 | consumer `pos.sale.paid` ของโรงแรม (`outbox-consumers.ts:1519–1526` → `hotel/room-charge.ts`) จะจับบิล ROOM_CHARGE ของเรือเป็น "ยังไม่ผูกห้อง" | แตะโมดูลโรงแรม (แก้รอบ 2) | ให้ consumer โรงแรมข้ามบิลที่ POS ผูกหน่วย TRIPS หรือ reference ตรงรูปเลขจองของ trips (แก้ไฟล์โรงแรม 1 จุด · ตรวจเข้ม · `qc-hotel-*` เขียวเท่าเดิม) — **ขออนุญาตผู้คุม SVC/เจ้าของ** · ระหว่างนี้: บิลบนเรือใช้ POS ที่ไม่ผูกหน่วย HOTEL ใด และ reference ขึ้นต้น `LB-` (consumer โรงแรมหาไม่เจอ = คิว unmatched ของโรงแรม ⇒ ยังรบกวน) | L1.9 |
| L-51 | ใบแจ้งยอดภาพ 13ง: 50 ทวิ ฿457.65 = 3% ของคอมฯ ทั้ง 31 การจอง ทั้งที่ 2 การจองถูกยกเลิกในงวดเดียวกัน | ภาพ/ฟิกซ์เจอร์ vs ภาษี | ค่าเริ่ม: บรรทัด "บวก ภาษีหัก" แสดงตามภาพ (Σ WHT_GROSSUP) · **50 ทวิ = WHT สุทธิหลังกลับรายการของงวด** · ⚖️ นักบัญชียืนยัน · ฟิกซ์เจอร์เพิ่มค่าคาด `whtCertSatang` | A1.6 |
| L-52 | กระเป๋าเอเจนซี่ (WALLET): รับเงินล่วงหน้าค่าบริการ — จุดภาษี VAT ตอนรับหรือตอนตัดใช้ | ภาษี (U1) | ค่าเริ่ม: เติมกระเป๋า = "ใบรับเงินล่วงหน้า" ไม่มี VAT (Dr เงิน / Cr «AGENCY_ADVANCE» เงินรับล่วงหน้า-เอเจนซี่») · ตัดใช้ตอนยืนยัน = จุดรับเงินของการจองนั้น (ใบกำกับออกตอนนั้น) · ⚖️ | A1.5 |
| L-53 | ใบกำกับเมื่อเอเจนซี่เก็บเงิน (SHOP_PRINCIPAL): ออกในนามลูกค้าส่งผ่านเอเจนซี่ ตอนร้านรับยอดส่ง หรือตอนเอเจนซี่รับเงินจากลูกค้า | ภาษี (U1 · LG §10 ข้อ 1) | ค่าเริ่ม: ตอนร้านรับยอดส่ง (ร้านไม่รู้วันที่เอเจนซี่รับ) · เต็มรูป (T37) · ⚖️ | A1.5 |
| L-54 | ตาราง/คีย์ที่ผู้สร้างจะต้องเดา (M-15) | แก้รอบ 2 | เพิ่มแล้วใน §B: `TripVehicleRun` (T1.4) · `TripImportBatch` (T1.10/S1.4) · `TripLinkStat` (W1.1/A1.8) · `AgentStopSell` + `TripDeparture.stopSell` (A1.4) · `AgentWebhook` `AgentMediaAsset` (A2.4) · `GateSigningKey` (K1.5) · `repointDepartures` (L1.2) · `nameEn` ตั๋ว · `SellBasket.unitIds` · ที่เหลือให้ใบสั่งของใบนั้นเขียน: โดเมนร้านเอง (W3.2 — ใช้ระบบโดเมนของ `pages`?) · พักเดี่ยวจ่ายเพิ่ม/เหมาเคบิน (L1.4 — บรรทัด `CABIN`/`FEE` + ตัวนับเป็น "ที่" ไม่ใช่คน) · ช่องทาง OTA = `AgentAccount` ชนิด OTA + แผนที่สินค้าแบบ `ChannelRateMap` (C1.1) | ต่อใบ |
| L-55 | หน้าร้าน T1.3 รับเงินสดเป็นใบเสร็จบัญชี ⇒ ไม่อยู่ในกะ/ลิ้นชัก POS | **ปิดด้วย §H.0 (แก้รอบ 3 · N-4)** | บัญชีเงินสด trips ต่อหน่วย + ปิดยอดรายวัน «TripCashClose» + JV ส่วนต่าง + โอนส่งมอบ · ห้ามใช้ลิ้นชัก POS (แจ้งเจ้าของใน L.1 P-1) | T1.3 |
| L-56 | ตะกร้า 2 หน่วย (TRIP หน่วย TRIPS + TICKET หน่วย TICKET) แต่ `SellCtx.unitId` เดียว | แก้รอบ 2 (M-15) | `LineRequest` มี `unitId` ต่อบรรทัด · `SellCtx.unitId` = หน่วยของหน้าจอง (ใช้กับสิทธิ์/ค่าตั้งของหน้า) · `SellBasket.unitIds` | T0.6 |
| L-57 | ยอดสมุดเอเจนซี่ = ลูกหนี้ 1100 ของเอเจนซี่ (H.8) ต้องการให้บัญชีแยกลูกหนี้ต่อผู้ติดต่อ | ตรวจตอนสร้าง | ผูก `AgentAccount.accountContactId` ตอนอนุมัติ · ไม่มีสมุด = ข้ามการเทียบ (UNPOSTED) | A1.5 |

### L.1 ต้องขออนุญาตเจ้าของ (แก้รอบ 2 · มติ 12 — ไม่สมมติว่าได้)
| # | เรื่อง | แตะอะไร | ถ้าไม่อนุญาต (ค่าปลอดภัยที่สัญญาใช้อยู่) |
|---|---|---|---|
| P-1 | ย้ายการรับเงินของการจอง/หน้าร้านไป POS: `lines[].taxKind` + เงินเก็บแทนเป็นหนี้สินใน `createSale`/`moduleTakeDeposit` · ส่งออกฟังก์ชันมัดจำบน `pos/index.ts` · เพดานมัดจำต่อบิล | **POS** (OQ9) | เอกสารเงินผ่านบัญชี V2 ทั้งหมด (§H) · หน้าร้านไม่อยู่ในกะ POS (L-55) · **เงินสดหน้าร้านของ trips อยู่นอกลิ้นชัก POS** (บัญชีเงินสดแยก + ปิดยอดรายวัน §H.0 · N-4) |
| P-2 | ข้ามบิลลงห้องของเรือใน consumer โรงแรม | โมดูลโรงแรม (RUN SVC) | ใช้ POS แยกที่ไม่ผูกหน่วย HOTEL · ยอมรับคิว unmatched ของโรงแรม (L-50) |
| P-3 | เบี่ยงจากแบบ: «TripFolio» แทน `HotelFolio` | ถ้อยคำแบบที่อนุมัติแล้ว (OQ11) | — (ผู้คุมใช้ค่าปลอดภัยนี้แล้ว) |
| P-4 | เพิ่มผู้ดู `AGENT` และ `LINK_CUSTOMER` ใน `api/files/[id]` | route ไฟล์ส่วนตัวชั้นแพลตฟอร์ม (ของ CRM C0.4) | เอเจนซี่/ลูกค้าไม่ล็อกอินอัปโหลดได้แต่เปิดดูไฟล์ไม่ได้ |
| P-5 | คอมฯ สกุลของการจอง (R7 `BOOKING_CURRENCY`) | สมุดหลายสกุล | ปิด/เลื่อน (มติ 9) |
| P-6 | URL `/book/<shop>` `/agent/<shop>` (OQ8) | ภาพ/README | ใช้ตามนี้ (มติ 11) |
| P-7 | ค่าเริ่ม `trips.cancel.refundForm` เปลี่ยนจาก `CUSTOMER_CHOOSES_MONEY_OR_CREDIT` เป็น `MONEY` จนมีเครดิตร้าน (X.2) | ค่าเริ่มที่ P0.2 เสนอ | ใช้ `MONEY` (มติ 7) |

---

## M. ข้อแย้งผู้ตรวจรอบ 1 (แก้รอบ 2 · เก็บข้อความของสัญญาไว้ พร้อมหลักฐาน)

| # | ผลตรวจ | ข้อแย้ง | หลักฐาน |
|---|---|---|---|
| M-a | M-9: "พอร์ทัลเอเจนซี่และใบแจ้งยอดที่ข้ามหน่วยของร้านเดียวต้องวนต่อหน่วยหรือใช้ `prisma` ดิบ" | **เห็นด้วยบางส่วน**: ตาราง agency ทั้งหมดเป็นแกน `tenant` ⇒ `tenantDb({tenantId})` ใช้ได้โดยไม่มี unitId · ที่ต้องวนต่อหน่วยมีเฉพาะการอ่านตาราง trips (แกน `unit`) — ใบแจ้งยอดสร้างจากสมุด (แกน tenant) จึงไม่ต้อง `prisma` ดิบ | `src/lib/core/db.ts:63–68` (`filterFor` โยนเฉพาะ `d.axis === "unit"` ที่ไม่มี unitId) |
| M-b | C-6: "«quota.ts» ใหม่ที่ import `prisma` = F5 +1" | ข้อเท็จจริงถูก แต่สัญญากำหนดให้ตัวนับใช้ `tenantDb(ctx).$queryRaw` ⇒ «quota.ts» **ไม่ import `prisma`** = +0 · F5 +1 ของตั๋วมาจาก «ticket/jobs.ts» (ตัวกวาดข้ามร้าน) แทน | `db.ts:88–89` (`tenantDb` = `prisma.$extends(...)` มี `$queryRaw`) · `scripts/fitness.mts:617–618` (regex นับเฉพาะ `import { … prisma … } from "@/lib/core/db"`) |
| M-c | M-12(v): "แปลงมัดจำเป็นเครดิตทำไม่ได้ถ้าไม่แก้ POS เพราะ POS ปฏิเสธ DEPOSIT บนบิล MEMBER" | ไม่เกี่ยวแล้ว: มติ 1 ให้มัดจำของ trips เป็นเอกสารบัญชี ไม่ใช่ `PosDeposit` ⇒ ทางเครดิตร้าน (X.2) ออกเครดิตจากเอกสารคืนเงินของบัญชีผ่าน giftcard/member facade ไม่ผ่าน `createSale` · ข้อจำกัดของ POS ที่อ้างถูกต้องแต่ไม่อยู่บนเส้นทางนี้ | `pos/service.ts:358` (ข้อจำกัดอยู่ใน `createSale` เท่านั้น) · §H.0 |
| M-d | m-11: "จ่ายแยกคน > 3 ใบ ⇒ หลายบิลปิดต่อการจอง และผ่อนค่าคงที่ ≤ 1 บิลปิด" | ไม่เกิดแล้ว: ปิดทริปเป็น JV ของบัญชี («recogniseTripRevenue») ไม่ใช่บิล POS ที่ใช้มัดจำ ⇒ ไม่มีเพดาน 3 ใบ · ค่าคงที่ใหม่อยู่ที่ §H.8 | `pos/service.ts:354–359` ใช้กับ `createSale` เท่านั้น · §H.1 |
| M-e | §3 ตารางคำนวณ: VAT ของใบเสร็จคิด "ต่อบรรทัด half-up" (457.94 + 160.28 + 32.71) | สัญญาคิด **ต่อเอกสาร** (round(Σ VATable × 7/107)) เพราะเอกสารรับเงินของบัญชีรับ VAT ยอดเดียว · ภาพนี้ได้ 650.93 เท่ากันทั้งสองวิธี แต่กรณีอื่นอาจต่าง 0.01 ⇒ ข้อสอบยึดวิธีต่อเอกสาร · `TripBookingItem.vatSatang` เป็นการปันส่วนเพื่อรายงาน | `account/index.ts:356–375` (`applyExternalDepositReceipt` รับ `vatSatang` เดียวต่อเอกสาร) |
| M-f | B-1 ข้อเสนอ (b): "แยกงวดที่จ่ายเป็นใบรับมัดจำ POS (ส่วน VAT) + รายการเก็บแทนของบัญชี" | ไม่ใช้ตามมติ 1 (เอกสารเงินของ trips ทั้งหมดผ่านบัญชี) — เหตุผลเพิ่ม: ใบรับมัดจำ POS + เอกสารบัญชีอีกใบ = ลูกค้าได้ 2 เอกสารต่อการจ่ายครั้งเดียว ไม่ตรงภาพ 13ค ที่เป็นใบเดียว 11,450 | ภาพ `design-trips/13-documents.body.html` ส่วน ค (ใบเดียวมีบรรทัดเก็บแทน) |

---

## N. สิ่งที่ใบสั่ง T0.1/T0.5 ต้องกำหนด — ค่าที่เสนอ (แก้รอบ 3 · ผลตรวจรอบ 2 §3e)
ผู้คุมคัดลงใบสั่ง (เปลี่ยนได้ก่อนเขียนข้อสอบ) · ทุกค่าเป็นข้อความ + `CHECK … IN (…)` SQL มือ (§B.0)

### N.1 รายการค่าสถานะ
| คอลัมน์ | ค่า (ลำดับ = วงจร) |
|---|---|
| `TripPaymentDue.status` | `OPEN` · `PARTLY_PAID` · `PAID` · `OVERDUE` · `WAIVED` · `CANCELLED` |
| `TripPassenger.formStatus` | `NOT_REQUIRED` · `PENDING` · `SUBMITTED` · `VERIFIED` · `NEEDS_FIX` |
| `TripPdpaRequest.kind` · `.status` | `ACCESS` · `RECTIFY` · `ERASE` · `OBJECT` · `PORTABILITY` ‖ `RECEIVED` · `IN_PROGRESS` · `DONE` · `REJECTED` (เลย `dueAt` = แจ้งเตือน ไม่ใช่สถานะ) |
| `TripWaitlist.status` | `WAITING` · `OFFERED` · `ACCEPTED` · `DECLINED` · `EXPIRED` · `CANCELLED` |
| `TripSeason.status` · `TripProduct.status` | `ACTIVE` · `ARCHIVED` ‖ `DRAFT` · `ACTIVE` · `ARCHIVED` |
| `TripHold.purpose` · `.status` | ตาม §B.1 |
| `TripMoneyEvent.postingStatus` | `POSTED` · `UNPOSTED` · `FAILED_NEEDS_ACTION` |
| `TripCheckin.result` · `TicketScan.result` | `FIRST` · `DUPLICATE` ‖ `FIRST` · `REENTRY` · `DUPLICATE` · `INVALID` |

### N.2 รูป JSON (zod ใน «trips/json-schemas.ts» บริสุทธิ์ · ใบ T0.1)
```ts
TripSchedule.rule       = { kind: "DAILY" } | { kind: "WEEKLY"; weekdays: (0|1|2|3|4|5|6)[] /* 0 = อาทิตย์ */ } | { kind: "DATES"; dates: string[] /* YYYY-MM-DD */ }
TripSchedule.exceptions = { date: string; action: "SKIP" | "OVERRIDE"; departTimeMin?: number; capacity?: number; minPax?: number | null }[]
TripPriceRule.params    = { appliesTo?: { optionIds?: string[]; paxTypeCodes?: string[]; channels?: SellChannel[] } } & (
    { kind: "EARLY_BIRD";  minDaysBefore: number; discountBp?: number; discountMinor?: number }
  | { kind: "LAST_MINUTE"; maxHoursBefore: number; discountBp?: number; discountMinor?: number }
  | { kind: "GROUP_TIER";  tiers: { minPax: number; discountBp: number }[] }            // เรียง minPax น้อย→มาก
  | { kind: "FREE_LEADER"; everyPaid: number; freeQty: number; paxTypeCode: string }   // เช่น 10 จ่าย 1 ฟรี
  | { kind: "BLACKOUT";    dates: string[]; ranges: { from: string; to: string }[] }   // ปิดใช้ราคา/โปรในวันเหล่านี้
  | { kind: "PROMO_CODE";  code: string; discountBp?: number; discountMinor?: number; maxUses?: number; perContact?: number; validFrom?: string; validTo?: string })
TripDeparture.stopSell  = null | { channels: SellChannel[] /* [] = ทุกช่องทาง */; agentAccountIds?: string[]; reason: string; until?: string /* ISO */ }
TripDeparture.insurance = null | { insurer: string; policyNo: string; sumDeathSatang: number; sumMedicalSatang: number; coversDeepDive: boolean; fileId?: string }
```

### N.3 คีย์ที่จดลง snapshot (แทนเครื่องหมาย ⓢ "ตัวอย่าง" ใน §E.4 · ทะเบียนลง `snapshots` ของแต่ละโดเมน)
- **`"trips.booking"`** (defs/trips): `trips.general.currencies` (T3) · `trips.fx.rateSource` (T4) · `trips.fx.rates` (X5) · `trips.pay.depositPct` `depositBase` `balanceDueDaysBefore` `overdueAction` (T13–T15 · T17) · `trips.pay.overdueGraceHours` (X11) · `trips.cancel.ladder` `shopCancelRefund` `shopCancelOptions` `refundForm` `deductions` `nameChangeFree` `changeDateFee` (T20–T26) · `trips.cancel.creditBonusPct` `creditValidityMonths` `moveFreeWithinDays` (X14–X16) · `trips.pax.childAgeBand` `childPricePct` (T27–T28) · `trips.tax.vatRegistered` `priceIncludesVat` `vatRate` `invoiceOnEachPayment` `invoiceForm` `cancelFeeVat` `forfeitAfterInvoice` `refundCreditNote` `corporateCustomerWht` (T33–T41) · `trips.consumer.withdraw7Days` (T43) · `trips.line.defaults` (T44) · `trips.parkFee.table` `ageBands` `exemptFlags` `countMode` (T45–T48)
- **`"agency.booking"`** (defs/agency · เฉพาะการจองที่มีเอเจนซี่): `agency.tier.table` (A1) · `agency.price.defaultModel` `sellerOfRecord` `minResalePrice` `hidePriceOnVoucher` (A4 A5 A7 A8) · `agency.cancel.policySource` (A9) · `agency.money.collector` `paymentMethod` `creditTermDays` (A10–A12) · `agency.comm.earnedAt` `currency` `clawbackOnCancel` `discountFromCommission` (A21–A24) · `agency.comm.vatMode` (X26 · จดค่าที่ตัดสินแล้ว) · `agency.wht.payerType` `ruleByPayee` `minPerContract` `eWht` `grossUpOnNetRemit` `remitter` (A25–A30) · `agency.crm.addToShopMarketing` `whoMessagesCustomer` `customerContactRoute` (A31–A33) · `agency.quota.returnCancelledToQuota` (X25)
- **`"ticket.order"`** (defs/ticket): `ticket.change.session` `ticket.cancel.refund` `ticket.cancel.venueCancelRefundPct` `ticket.tax.vatMode` `ticket.tax.invoiceForm` `ticket.tax.resellerBase` `ticket.consumer.withdraw7Days` (K4–K9 · K15)
- ไม่จด: เวลาถือที่/ปิดรับ/ข้อความ/จอ/PDPA (ใช้ ณ เวลาทำงาน ไม่ใช่สัญญากับลูกค้า)

### N.4 หน่วยที่ค่าตั้งใช้ได้ (`SettingDef.unitTypes` · `SettingUnitType` + `"TRIPS"` `"TICKET"`)
- defs/trips → `["TRIPS"]` · defs/ticket → `["TICKET"]` · defs/agency → `["TRIPS", "TICKET"]` (ชั้นเอเจนซี่ใช้ร่วม) · แม่แบบ `DIVE_SHOP` `DAY_TOUR` `LIVEABOARD` ผูกหน่วย TRIPS · `ATTRACTION` ผูกหน่วย TICKET

### N.5 ใครเพิ่มคำเตือนระดับ (severity) และป้ายนักบัญชี (reviewHint) ในจอค่าตั้ง
- **T0.1** (ตรวจเข้ม · แตะชิ้นกลางของ R0.3/R0.4): ชนิด `SettingDef.reviewHint` `reviewAuthorityTh` + ผลกฎหมาย `severity` (`types.ts`) · ตัวตรวจทะเบียน (`registry.ts`) · การแสดงผลใน `src/lib/core/settings/form.ts` + `src/components/settings/SettingsForm.tsx` (ป้าย "ตรวจกับนักบัญชีของร้าน" / "ยังไม่ยืนยันกับ <หน่วยงาน>" · เรียงคำเตือนตาม severity · กล่องรับทราบไม่บังคับเหตุผลในสามโดเมนนี้) · ข้อสอบหอ/จองคิวเดิมเขียวเท่าเดิม
- T1.1 · A1.3 · K1.2 (จอค่าตั้งของแต่ละโดเมน) **ใช้** ของที่ T0.1 ทำ ไม่แก้ฟอร์มกลางเอง
