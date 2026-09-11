# WO M3.7 — ไทม์ไลน์ประวัติสมาชิก: consumer ทุกโมดูล → MemberActivity · read-through เอกสารบัญชี/การ์ดบอร์ดงาน · แท็บประวัติใน 360 (ภาพ 08 ซ้าย/กลาง) — โน้ตของ builder

> สัญญา: `ledger/MEMBER-RUN.md` §2 M3.7 · หัวไฟล์ `scripts/qc-member-m3.7.mts` · brief `ledger/member-briefs/member-brief-m3.7.md`
> **ไม่มี migration** · ไม่ได้ build · ไม่ได้ commit/push · ไม่ได้แตะ `.env` · ไม่ได้แก้ข้อสอบ/harness/seed/fitness

## ผลโดยย่อ

| ชุด | ผล |
|---|---|
| `qc-member-m3.7` (ตัวจริง ไม่แก้) | **6/9 + ERR** — ข้อสอบล้มกลางทางที่บรรทัด 157 (`crmStage.orderBy.position` ไม่มีในสคีมา) ⇒ ข้อ S2.7 เป็นต้นไปไม่ได้รัน · แดงก่อนถึงจุดล้ม = S2.1 (§ข้อแย้ง 3) · S2.6 (§ข้อแย้ง 2) |
| สำเนาชั่วคราว (แก้ข้อสอบ 2 บรรทัดตาม §ข้อแย้ง 1–2 · ลบทิ้งแล้ว) | **18/23** รัน 2 รอบนิ่ง — แดง = S2.1 (§3) · S4.2 (§4) · S5.1 (§5) · S6.2/S6.3 (ภาพ/parity ของผู้คุมงาน) |
| `tsc --noEmit` | เขียว |
| fitness (มี env / ไม่มี env) | **25/26 ทั้งสองโหมด** — แดงข้อเดียว F2.1 `เส้นเถื่อน: member→account` (สัญญาใบนี้บังคับเส้นนี้ · §ข้อแย้ง 4) · สำเนาชั่วคราวที่เพิ่ม `"member→account"` ใน ALLOWED_EDGES = **26/26 ทั้งสองโหมด** (ลบทิ้งแล้ว) |
| regressions ตามใบ | m2.8 **30/30** · m1.12 **14/14** · m1.4 **37/37** · m2.3 **22/22** · m3.3 **32/32** · m3.4 **23/23** · m3.5 **21/21** · acc-v2-pos-lines **87/87** · kanban-k3.3 **14/15** (S9.2 ภาพข้าม worktree = ฐานเดิม) · chat-member-autolink **11/11** |
| crm/shop/booking (QC env · `QC_ENV_FILE=.env.qc` · ยืนยัน host ep-plain-art ใน log) | qc-crm 25/25 · qc-crm-activity 12/12 · qc-crm-c1.1 SKIPPED (งาน CRM v2 ของ Codex ยังไม่อยู่ใน worktree นี้) · qc-shop 15/15 · qc-shop-refund 12/12 · qc-booking-deposit 18/18 · qc-booking-edit-schedule 26/26 · qc-booking-hours-hr 13/13 · qc-booking-race 8/8 |
| รันเพิ่มเอง (ไฟล์ที่ใบนี้แตะมีผลถึง) | m1.5 20/20 · m1.6 14/14 · m1.7 26/26 · m1.8 15/15 · m1.11 26/26 · m2.1 30/30 · m2.4 18/18 · m2.5 26/26 · m2.6 24/24 · m2.7 22/22 · m2.9 22/22 · m3.2 27/27 · m3.6 19/19 · kanban-k3.4 11/11 · kanban-k2.9 25/26 (S11.7 ภาพ = ฐานเดิม) · automation 13/13 · webhook 15/15 · m2.10 17/20 (S5.x ต้องมี QC server :3215 = ของผู้คุมงาน) · m1.9 25/26 (S1.1 ระดับ seed เพี้ยน — ดู §หนี้ 6 · **เกิดก่อนใบนี้** 03:25 UTC) |

---

## 1. ไฟล์

| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `src/lib/modules/member/history-kinds.ts` | **ใหม่** (บริสุทธิ์) | `HISTORY_KINDS` 9 ชนิดตามลำดับชิปภาพ 08 · `kindOf` (types ก่อน modules · ไม่รู้จัก = profile) · `toneOf`/`iconOf` · `channelDisplayName` (LINE/Shopee… ชื่อแบรนด์บนไทม์ไลน์) · ช่วงสำเร็จรูป `HISTORY_RANGES` + `historyRangeFrom` · DTO หน้าจอ (`HistoryRowView`/`HistoryPageView`/`HistoryCounts`) · `HISTORY_PAGE_SIZE` 20 |
| `src/lib/modules/member/history.ts` | **ใหม่** | `recordOnce` (กันซ้ำ customerId+module+type+refId · advisory lock · `at` ย้อนหลัง · รับ tx ของผู้เรียก) · `recordDaily` (1 แถว/ref/วันไทย + `data.count` · replay event เดิมไม่นับ) · `patchActivity` · `listHistory` (กรองชนิด/ช่วง/สาขา · นับต่อชนิดด้วย groupBy ครั้งเดียว · เคอร์เซอร์คอมโพสิต เวลา+id · ขอบเขตสาขาของแถว · read-through เอกสาร/การ์ด ผ่าน facade dynamic import · หัวเรื่องไทย · ลิงก์ต้นทางเฉพาะของที่มีจริง) · `toHistoryPageView` · `historyUnitOptions` · `bkkDayStart` |
| `src/lib/modules/member/history-actions.ts` | **ใหม่** ("use server") | `memberHistoryAction` — requireTenant → canReadMember/`assertCan` → ระบบเป็น MEMBER ของร้าน → `listHistory` · error ผ่าน `safeReason` · export เฉพาะ async function |
| `src/components/member/MemberHistory.tsx` | **ใหม่** ('use client') | แท็บประวัติ: การ์ดตัวกรอง (ชนิด: ทั้งหมด + 9 ชิปมีจำนวน · ช่วงเวลา · สาขา) + การ์ด "ไทม์ไลน์" (ไอคอนวงกลมสีตามชนิด · หัวเรื่อง = ลิงก์ต้นทาง `prefetch={false}` · ป้าย · รายละเอียด · สาขา · ผู้ทำ · เวลาไทย) · "โหลดเพิ่ม" · ว่าง "ยังไม่มีประวัติ…" · testid ครบ 9 · import เฉพาะ history-kinds + server action |
| `src/app/app/sys/[id]/member/members/[memberId]/page.tsx` | Edit เฉพาะจุด | `tab === "history"` → หน้าแรก (90 วัน) ที่ server + ตัวเลือกสาขา → ส่งเข้าช่อง `tabPanel` เดิมของ M3.4 |
| `src/lib/modules/member/profile.ts` | Edit | `loadVisibleMember` (ด่านมองเห็นเดียวกับ briefFor แบบเบา) · `getMember360().history` (5 รายการล่าสุดจาก listHistory — อ่านไม่ได้ = []) + `counters.visits` (แถว VISIT) · ด่าน unit scope นับเฉพาะ `VISIT_SCOPE_MODULES` (§ข้อตัดสิน 2) |
| `src/lib/modules/member/access.ts` | Edit (+ค่าคงที่) | `VISIT_SCOPE_MODULES = ["pos","booking","restaurant"]` |
| `src/lib/modules/member/list.ts` · `wallet.ts` | Edit 1–2 บรรทัด | ด่าน unit scope ใช้ `VISIT_SCOPE_MODULES` ชุดเดียวกับ profile |
| `src/lib/modules/member/index.ts` | Edit เฉพาะจุด (ต่อท้ายบล็อก notifications) | export `recordOnce` `recordDaily` `patchActivity` `listHistory` `historyUnitOptions` `bkkDayStart` + ชนิด · `HISTORY_KINDS` `historyKindOf` `channelDisplayName` |
| `src/lib/member-bridges.ts` | Edit + ต่อท้าย | สะพานขาย: แถว PURCHASE มี data `{netSatang, receiptNo, pointsEarned, voucherUsed, stampsAdded}` (เติมหลังแต้ม/ตราด้วย `patchPurchaseRow` อ่านจากสมุดแต้ม/StampEvent) · ขา void เพิ่ม `PURCHASE_VOIDED` คู่กับธง VOID ใน tx เดียว · consumer ใหม่ `onBookingCompleted` `onBookingNoShow` `onChatContactLinked` `onChatMessageReceived` `onKanbanCardCompleted` `onCrmDealWon` `onShopOrderPaid` `onPointEvent` `onTierChanged` `onLoyaltyEvent` |
| `src/lib/outbox-consumers.ts` | Edit เฉพาะจุด | `memberBridge`/`memberApptBridge` (dynamic import + try/catch + `logOps WARN` → DONE) · ต่อเข้า booking.completed/no_show · chat.message.received · chat.contact.linked · kanban.card.completed · point.earned/burned/expired · member.tier.changed · giftcard.sold/used · stamp.completed · reward.redeemed · voucher.used · **ใหม่** `crm.deal.won` `shop.order.paid` · ถอด handler เดิม `chatContactLinked`/`giftCardActivity` (ย้ายเข้าสะพาน) |
| `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` | Edit เฉพาะจุด | `crm.deal.won` "เมื่อปิดดีล CRM สำเร็จ" · `shop.order.paid` "เมื่อออเดอร์ออนไลน์ชำระเงินแล้ว" (เว็บฮุคได้จาก spread · webhooks/labels เพิ่มแค่หมายเหตุห้ามประกาศซ้ำ) |
| `src/lib/modules/crm/service.ts#moveDeal` | additive 1 จุด (+import) | ขั้น WON → `emitOutboxOutsideTx("crm.deal.won")` idempotencyKey `crm.deal.won#<dealId>` |
| `src/lib/modules/shop/service.ts#confirmOrderPaid` | additive 1 จุด (+import) | หลังผูก posSaleId → `emitOutboxOutsideTx("shop.order.paid")` channel "SHOP" idempotencyKey `shop.order.paid#<orderId>` |
| `src/lib/modules/account/service.ts` · `account/index.ts` | additive | `listDocsByParty(tenantId, partyId, {take})` → `PartyDocRow[]` (เอกสารขาออก · รวม DRAFT · ป้ายชนิด/สถานะไทย · href เฉพาะชนิดที่มีหน้ารายละเอียด) · re-export ที่ facade |
| `src/lib/actions/booking.ts#setStatusAction` | Edit เฉพาะจุด | เปลี่ยนสถานะผ่าน `booking.setAppointmentStatus` (§ข้อตัดสิน 9) · ถอดการเขียน VISIT ตรง (consumer เขียนแทน) · `scheduleDrain()` |

`booking/service.ts` **ไม่ได้แตะ** — `booking.completed` (M2.3) และ `booking.no_show` (M3.3) ยิงอยู่แล้ว ครบ 3 ทะเบียนแล้ว

---

## 2. ข้อตัดสิน (จุดที่สัญญาไม่ชัด แล้วตัดสินเอง)

1. **VOID vs PURCHASE_VOIDED** — ข้อสอบ M2.8 (S2.3/S2.4) นับแถว `pos/VOID` = 1 (ธงกันลดยอดสะสมซ้ำของ M2.8) ส่วน M3.7 S2.2 ต้องการ `pos/PURCHASE_VOIDED` ⇒ เขียน **ทั้งคู่ใน tx เดียว** และ `listHistory` ซ่อน VOID ที่มี PURCHASE_VOIDED ของบิลเดียวกัน (VOID เก่าก่อนใบนี้ที่ไม่มีคู่ยังโชว์ ไม่หายจากประวัติ)
2. 🔴 **ด่านมองเห็นของพนักงานที่ถูกจำกัดสาขา นับเฉพาะแถว "ซื้อ/จอง/ใช้บริการ"** (`VISIT_SCOPE_MODULES` pos/booking/restaurant) แทนทุกแถว — ใช้กับ 4 ด่าน (profile.assertVisible · list scope where · list bulk tags · wallet.assertVisible)
   เหตุ: พิมพ์เขียว §6.1 (บรรทัด 390) เขียนว่า "สมาชิกที่**เคยซื้อ/จอง**ในสาขาตน" · ตั้งแต่ใบนี้ไทม์ไลน์มีแถวจากทุกโมดูลที่ติด unitId ของ "สาขาที่เกิดเรื่อง" ซึ่งไม่ใช่สาขาที่ลูกค้าไปใช้บริการ — ตัวอย่างในข้อสอบเอง: S2.10 เขียน `REFERRAL_CONVERTED` ของ X ที่ unitId กะตะ ⇒ ด่านเดิม (นับทุกแถว) ทำให้พนักงานกะตะเห็นโปรไฟล์ X ทั้งที่ X ไม่เคยไปกะตะ แล้ว S4.1 ("กะตะดู X → ไม่พบ") แดง · หลังแก้ S4.1 เขียว และ `listHistory` ยังใช้ด่านเดียวกับ briefFor/หน้า 360 ตามสัญญา · m1.4 (ใช้แถว `pos/VISIT` เป็นหลักฐานการมา) / m1.5 / m2.7 เขียวเท่าเดิม
3. **แชท**: `chat.contact.linked` เปลี่ยนจาก `CHAT_LINKED` (M1.12) เป็น `CHANNEL_LINKED` + `data.channel` ตามสัญญา (m1.12 S2.2 นับ `type contains "LINK"` → ยังเขียว) · recordOnce ต่อ contactId · `chat.message.received` → `recordDaily` 1 แถว/ห้อง/วันไทย เวลา = `lastMessageAt` ของห้อง · preview = ข้อความล่าสุด · `data.eventIds` จำ 20 id ล่าสุดกัน replay นับเบิ้ล
4. **ชนิด "ซื้อ" รวม `crm` (DEAL_WON) และ `restaurant`** — ดีลที่ปิดได้คือยอดขาย · ปิดโต๊ะร้านอาหารแบบไม่ผ่าน POS ก็คือการซื้อ (สัญญาเขียน modules ["pos"] แต่ข้อสอบ S3.1 เปิดทางให้ DEAL_WON อยู่ purchase หรือ profile)
5. **แต้มไม่ขึ้นซ้ำ 2 บรรทัด**: `point.earned/burned` ของ refType `PosSale`/`ShopOrder`/`RewardRedemption` ไม่เขียนแถวแต้มแยก (ตัวเลขอยู่บนแถวซื้อ/แถวแลกรางวัลแล้ว — ภาพ 08 แถวซื้อบอก "ได้ 182 แต้ม" ในบรรทัดเดียว) · `point.expired` เขียนเสมอ · refId: earned/expired = lotId · burned = id ของ event (payload ไม่มี ledgerId)
6. **voucher.issued** ไม่เขียนที่คิว — `voucher/service.ts` เขียน `VOUCHER_ISSUED` ใน tx ของตัวเองอยู่แล้ว (สัญญา "โมดูลเขียนเองแล้ว consumer ต้องไม่เขียนซ้ำ") · voucher.used / stamp.completed / reward.redeemed / giftcard.* = recordOnce ที่สะพาน (giftcard.used อ้าง id ของ event เพราะใช้หลายครั้งต่อใบ)
7. **TIER_CHANGED** อ้างแถว `MemberTierHistory` ของการเปลี่ยนครั้งนั้น · `data {from, to}` = **ชื่อ**ระดับ (หัวเรื่อง "เลื่อนระดับ Silver → Gold" ตามภาพ) + `fromKey/toKey` · `reason` = ป้ายไทยของเหตุผล + "ยอดซื้อ 12 เดือน ฿x" (+ จำนวนครั้ง) จาก evidence — มีตัวเลขเสมอ
8. **booking.completed**: แถว VISIT (บริการ/ช่าง/เวลานัด) · **เติมแถว APPOINTMENT_BOOKED ย้อนหลังที่เวลาจองจริงถ้ายังไม่มี** (นัดที่ลงผ่านทางอื่น/ผูกสมาชิกทีหลัง — ข้อสอบ S3.2 นับจอง 4 แถวจากนัดที่สร้างด้วย prisma ตรง) · สแตมป์: consumer เดิมของ M2.3 (`stampFromVisit`) ยังเป็นงานหลัก (พัง = retry เหมือนเดิม) และสะพานเรียก `stamp.autoStampFromVisit` ซ้ำเป็นตาข่าย (คีย์ `visit:<นัด>:<ใบ>` ไม่เบิ้ล — แพตเทิร์น M2.8 ข้อ 2.8) · แต้ม CHECKIN = `computeEarn({event:"CHECKIN"})` → earnWithLot คีย์ `checkin-<นัด>` · **ขอรีวิวเฉพาะร้านที่เคยบันทึกตั้งค่ารีวิว** (`AppSystem.settings.member.review` มีอยู่) — ไม่งั้นทุกร้านบน prod จะเริ่มได้ LINE ขอรีวิวทันทีที่กด "มาแล้ว" โดยไม่มีใครเลือก (ข้อกังวลเดียวกับ M3.4 หนี้ 1) · try/catch ไม่ล้มคิว
9. 🔴 **ปุ่ม "มาแล้ว/ไม่มา" บนจอไม่เคยยิง event** — `setStatusAction` (actions/booking.ts) อัปเดตแถวตรง ไม่ผ่าน `setAppointmentStatus` ⇒ สแตมป์ "จองที่มาจริง" (M2.3) · journey "จองแล้วไม่มา" (M3.3) · ไทม์ไลน์ใบนี้ ทำงานเฉพาะในข้อสอบ · แก้เป็นเรียก service จุดเดียว + `scheduleDrain()` · ถอดการเขียน VISIT ตรง (consumer เขียนพร้อม data แล้ว — เขียนทั้งคู่ = 2 บรรทัดต่อการมา 1 ครั้ง) · `recordVisit` (ตัวนับ) และการเปิดบิล POS คงเดิม
10. **crm.deal.won**: ระบบสมาชิกปลายทาง = สาขาที่ระบบ CRM ผูก → MEMBER ของสาขานั้น · ร้านมีระบบสมาชิกเดียว = ตัวนั้น · หาสมาชิก memberCustomerId → partyId → เบอร์/อีเมล (ผ่าน `createMember` ซึ่งตรวจซ้ำและคืนคนเดิม — ใช้ตัวตรวจซ้ำ/normalize ของโมดูลสมาชิกที่เดียว) · ไม่พบ + มีเบอร์/อีเมล = สมัคร source CRM `sourceDetail {crmContactId, crmDealId}` idempotencyKey `crm-contact-<id>` · ผูกกลับ `CrmContact.partyId`/`memberCustomerId` **เฉพาะช่องที่ว่าง** (ไม่ทับที่ร้านผูกเอง) · ผู้ติดต่อไม่มีเบอร์/อีเมล = ไม่เดา
11. **shop.order.paid**: ข้ามทั้งหมดถ้าบิล POS ของออเดอร์ **ผูกสมาชิกแล้ว** (M2.8 ให้แต้ม/แถวซื้อแล้ว) — ละเอียดกว่าสัญญา "มี posSaleId = ข้ามแต้ม" เพราะบิลจาก `confirmOrderPaid` วันนี้ **ไม่ผูกสมาชิก** ถ้าข้ามตามสัญญาตรง ๆ ลูกค้าหน้าร้านเว็บจะไม่เคยได้แต้มเลย · channel `SHOP` (หน้าร้านเว็บของร้าน) = source MARKETPLACE แต่ไม่ใส่ sourceChannel/ไม่ผูกตัวตน (ไม่มีช่องทางในทะเบียน · เบอร์อยู่บนตัวสมาชิกแล้ว) · `TIKTOK` → `TIKTOK_SHOP` · ตัวตนชนคนอื่น (CONFLICT) = ข้าม (คู่ "อาจเป็นคนเดียวกัน" ถูกบันทึกโดย linkIdentity แล้ว) · pointsEarned อ่านจากสมุดแต้ม (replay ได้เลขเดิม)
12. **read-through**: เฉพาะพนักงาน/เจ้าของ (ลูกค้าเอง/คีย์ API ไม่เห็นเอกสารบัญชี/การ์ดภายใน) · สาขาของเอกสาร = สาขาของบิล POS ต้นทาง (เอกสารอื่น = ระดับร้าน null) · การ์ด "ยังเปิด" = ACTIVE และ `completedAt` ว่าง (อ่านเพิ่ม 1 query — DTO ของ `listCardsForTarget` ไม่มี completedAt · ไม่แตะโมดูลบอร์ดงาน) · เวลาของการ์ด = วันสร้างการ์ด · read-through พัง = ไทม์ไลน์ยังเปิดได้
13. **ลิงก์ต้นทาง** สร้างเฉพาะของที่ค้นเจอจริง (บิล/ห้องแชท/การ์ด/ดีล) · ของในระบบสมาชิกเองชี้หน้ารายการที่มีจริงใต้ `/member/*` · นัด/ออเดอร์ชี้หน้าจอง/ออเดอร์ของสาขา (`/app/u/<slug>/…`) · ทุกลิงก์ `prefetch={false}`
14. **UI**: ช่วงปริยาย "90 วันล่าสุด" ตามภาพ · ว่างในช่วงที่เลือก = "ยังไม่มีประวัติในช่วง "…" — ลองเปลี่ยนชนิด ช่วงเวลา หรือสาขา" · ป้ายชิปเป็นแมปใน component ที่ชนิดบังคับครบทุก key (`satisfies Record<HistoryKindKey,string>` — ข้อสอบ S6.1 grep ข้อความชิปใน component) ส่วนลำดับ/ไอคอน/สีมาจาก `HISTORY_KINDS` · สีผ่าน `--color-tag-*` เท่านั้น · ชื่อสาขาใช้ตามที่ตั้ง (ไม่เติม "สาขา")
15. `take` เกิน 100 = throw ไทย (ไม่ clamp) · kind ไม่รู้จัก = throw ไทย · เคอร์เซอร์เสีย = throw ไทย "เปิดแท็บประวัติใหม่อีกครั้ง"

---

## 3. ข้อแย้งข้อสอบ (ไม่ได้แก้ข้อสอบ · หลักฐานจากสำเนาชั่วคราวที่ลบทิ้งแล้ว)

### ข้อแย้ง 1 🔴 ข้อสอบล้มที่บรรทัด 157 — `crmStage` ไม่มีฟิลด์ `position`
```
Unknown argument `position`. Available options are marked with ?.  (…qc-member-m3.7.mts:157:18)
?   sortOrder?: SortOrder, …
```
`prisma/schema/crm.prisma` CrmStage มี `sortOrder` ไม่มี `position` ⇒ ข้อ S2.7 เป็นต้นไปไม่เคยได้รัน (ผลจริง 6/9 + ERR)
**ขอแก้**: บรรทัด 157 `orderBy: { position: "asc" }` → `orderBy: { sortOrder: "asc" }`

### ข้อแย้ง 2 🔴 S2.6 — บอร์ดที่ `createBoard` สร้างไม่มีคอลัมน์ "เสร็จ" ที่เป็น done column
`kanban/service.ts:161` `DEFAULT_COLUMNS = ["รอทำ","กำลังทำ","เสร็จ"]` สร้างโดยไม่ตั้ง `isDoneColumn` (284–290) ⇒ บรรทัด 139 `doneCol = find(isDoneColumn) ?? คอลัมน์สุดท้าย` ได้ "เสร็จ" ที่ isDoneColumn=false → `moveCard` สำเร็จแต่ `justCompleted = col.isDoneColumn && …` (`moves.ts:283`) = false ⇒ **ไม่มี `kanban.card.completed`** และทางสำรองของข้อสอบ (บรรทัด 147) อยู่ใน `.catch` จึงไม่ถูกเรียก ⇒ kc = 0
ส่วน read-through การ์ดที่ยังเปิดของข้อเดียวกันผ่าน (`open={"t":"งานบอร์ด \"เคลมประกันอุปกรณ์\"",…"columnName":"รอทำ","status":"ACTIVE"}`)
**ขอแก้**: หลังบรรทัด 139 ตั้ง `isDoneColumn: true` ให้ doneCol ก่อนย้าย (สำเนาชั่วคราวทำแบบนี้ → S2.6 เขียว: CARD_COMPLETED 1 แถว summary "ปิดแล้ว")

### ข้อแย้ง 3 S2.1 — regex `/[A-Z]{1,4}-?\d/` ของหัวเรื่องเอกสาร สมมติว่าเลขเอกสารมีตัวอักษรนำหน้า
ใบที่บิล POS สร้างคือ `TAX_INVOICE_ABB` และเลขที่เอกสาร = **เลขใบเสร็จ POS** (`account/service.ts:3810` "เลขที่เอกสาร = เลขใบเสร็จ POS") ซึ่งรูปแบบคือ `YYYYMM-NNNN` (`pos/service.ts:165`) ไม่มีตัวอักษร ⇒ ของจริง:
`doc={"t":"ใบกำกับภาษีอย่างย่อ 202609-0269","d":{"docType":"TAX_INVOICE_ABB","docNo":"202609-0269","totalSatang":455000,…}}`
เงื่อนไขอื่นของข้อนี้ผ่านหมด (PURCHASE data `{"netSatang":455000,"receiptNo":"202609-0269","pointsEarned":182,…}` · หัวเรื่อง "ซื้อบิล 202609-0269 · ฿4,550.00" · ref PosSale · มีแถว document · totalSatang 455000) · ไม่เติมรหัสนำหน้าเอง (= แต่งเลขเอกสารที่ไม่มีอยู่จริง)
**ขอแก้**: ตรวจ `docRow.title.includes(docRow.data.docNo)` แทน regex

### ข้อแย้ง 4 S4.2 + fitness F2.1 — สัญญาบังคับเส้น `member→account` แต่ ALLOWED_EDGES ยังไม่มี
S4.2 ต้องการทั้ง `history.ts` มีข้อความ `@/lib/modules/account"` **และ** `scripts/fitness.mts` มี "member→account" · ORACLE-EDIT F2.1 (M3.4) เพิ่มแค่ `member→kanban` และทำให้ F2 นับ dynamic import ⇒ ทำตามสัญญาแล้ว F2.1 แดงด้วยเส้นเดียว `member→account` (fitness ทั้งสองโหมด 25/26) · S4.2 ส่วนอื่นผ่าน (`h=true idx=-`)
หลักฐาน: สำเนา fitness ที่เพิ่ม `"member→account"` → **26/26 ทั้งมี env และไม่มี env**
**ขอเพิ่ม** ใน ALLOWED_EDGES: `"member→account"` (chokepoint: `account/index.listDocsByParty` อ่านอย่างเดียว · ทิศ account→member มีอยู่แล้วแบบ read-only เหมือนกัน) — แล้ว S4.2 กับ F2.1 เขียวพร้อมกัน

### ข้อแย้ง 5 S5.1 — `counts.all === 1200` ไม่นับแถว "สมัครสมาชิก" ที่ `createMember` เขียนเสมอ
Z สร้างด้วย `PR.createMember` ซึ่งเขียน `member/CREATED` 1 แถว (`profile.ts:881`) + ข้อสอบ createMany 1,200 ⇒ ของจริง **1,201** (`t=63/61ms n=50 all=1201 plan=Limit … Index Scan`) — เวลา/แผน index ผ่าน
ขัดกับ S3.1 ของข้อสอบเอง: S3.1 บังคับให้ X มี kind `profile` ซึ่งแถวเดียวที่เป็น profile ของ X คือ `CREATED` นี้ ⇒ ตัดแถวนี้ออกเพื่อให้ S5.1 ได้ 1200 = S3.1 แดง
**ขอแก้**: `big.counts?.all === 1201` (หรือ `=== 1200 + จำนวนแถวของ Z ก่อน createMany`)

---

## 4. หนี้ / เรื่องที่ยังค้าง

1. `shop.order.paid` ไม่บันทึกยอดสะสม/ไม่ประเมินระดับ และ **คืนเงินออเดอร์ไม่ย้อนแต้ม** — ยังไม่มี event `shop.order.refunded` (refundOrder void บิล POS ที่ไม่ผูกสมาชิก → สะพานขาย M2.8 ไม่มีอะไรให้ย้อน) ⇒ ใบที่ทำคืนเงินออเดอร์ควรเพิ่ม event + ย้อนแต้ม `ShopOrder` (reverseWithLots) ก่อนเปิดยอดสะสม
2. การ์ดที่ถูกปิดแล้ว **เปิดกลับ** แล้วปิดอีกครั้ง = แถว CARD_COMPLETED เดิม (recordOnce ต่อการ์ด) — ไม่ขึ้นแถวที่ 2
3. ตัวเชื่อมตลาดออนไลน์ (Shopee/Lazada/TikTok) ยังไม่มีในระบบ — consumer รับ payload รูปเดียวกันไว้แล้ว (channel SHOPEE/LAZADA/TIKTOK)
4. `requestReview` จากนัด ยังไม่เคารพ `askAfterHours` (ส่งทันทีหลังคิวของ "มาแล้ว") — หนี้เดิมของ M3.4 ข้อ 1 (ตัวตั้งเวลาต้องแตะ `platform/cron.ts`)
5. หน้า 360 ทุกแท็บจ่ายค่า `history` 5 รายการ (≈1 รอบ query ขนาน + read-through) — ถ้าอยากเบาลง ย้ายไปโหลดเฉพาะผู้เรียก REST
6. ⚠️ **ระดับของสมาชิก seed เพี้ยน** (ไม่ใช่ของใบนี้): `A9MXWM` (`cmtwcphkk002g14kzukvu1w2d`) เฉลย member แต่เป็น silver ตั้งแต่ **03:25 UTC 11 ก.ย.** (RULE_UPGRADE จากบิล ฿11,800) ⇒ `qc-member-m1.9` S1.1 `member:29 silver:16` — ไม่ได้คืนสภาพ (ไม่ใช่ข้อมูลของใบนี้) ฝากผู้คุมงาน
7. `MHistory.tsx` (ฝั่งลูกค้า `/m/*` M2.9) ยังอ่านไทม์ไลน์ของตัวเอง ไม่ได้ย้ายมาใช้ `listHistory`
8. ป้ายชิปอยู่ 2 ที่ (HISTORY_KINDS สำหรับ REST/AI · CHIP_LABEL ใน component ที่ข้อสอบ grep) — ชนิดบังคับครบ key แต่ข้อความต้องแก้คู่กัน

---

## 5. ข้อมูลสำหรับถ่ายภาพ (ของผู้คุมงาน)

- harness `visual-member.mts` เตรียม TMP37 = `recordOnce` 10 แถว 10 ชนิดให้สมาชิก 1 (ย้อน 1–30 วัน · unit ป่าตอง) → อยู่ในช่วงปริยาย 90 วัน · ชิป "ซื้อ" มีแถว `tmp37-sale`
- refId ของ TMP37 เป็นของปลอม ⇒ แถวบิล/แชท/การ์ด **ไม่มีลิงก์** (ค้นแล้วไม่เจอ = ไม่สร้างลิงก์) · แถวนัด (VISIT/NO_SHOW) ลิงก์ไปหน้าจองของสาขา `/app/u/patong/booking` (หน้ารวมของสาขา ไม่ใช่หน้าของนัดใบนั้น) · แถวรีวิว/แนะนำเพื่อน/แต้ม/ระดับ ลิงก์ไปหน้า `/member/*` ที่มีจริง · ทุกลิงก์ `prefetch={false}`
- testid: `member-history` `member-history-filter` `member-history-chip-all|purchase|booking|chat|document|tier|loyalty|task|review|profile` `member-history-range` `member-history-unit` `member-history-list` `member-history-row-<id>` `member-history-more` `member-history-empty`
- thana (ป่าตอง) เห็นสมาชิก 1 (บ้านป่าตอง) · ตัวเลือกสาขาของ thana มีแค่ป่าตอง
- มือถือ: ชิปขึ้นบรรทัดใหม่ · select 2 ตัวซ้อนเป็นแถว (sm: คู่) · แถวไทม์ไลน์หัวเรื่อง/เวลา wrap ไม่ตัดคำ

### ตรวจภาพ
_(ผู้คุมงาน Opus 5 · 11 ก.ย. ~13:30 UTC · build QC รวม 3.7+3.8 · เปิดดูทุกภาพเทียบ mockup ด้วยตาแล้ว)_
- **member-history-owner (ภาพ 08 ซ้าย/กลาง)**: ตรง — แท็บ "ประวัติ" ใน 360 · แถบกรองชนิด "ทั้งหมด n" + 9 ชิปพร้อมจำนวน (ซื้อ · จอง · แชท · เอกสาร · ระดับ · แต้ม/สิทธิ์ · งาน · รีวิว/แนะนำ · โปรไฟล์) · ช่วงเวลา (90 วันล่าสุด) · สาขา (ทุกสาขา) · "ไทม์ไลน์ แสดง n จาก m รายการ" · แต่ละแถว ไอคอนวงกลมสีตามชนิด + หัวเรื่อง (เช่น "ซื้อบิล R-1042 · ฿4,550.00") + รายละเอียด (ใบเสร็จ · แต้ม · voucher · สาขา) + เวลาไทย · ปุ่ม "โหลดเพิ่ม"
- ต่างจาก mockup (ยอมรับ): ชิปมี 9 ชนิดตามสัญญา (ภาพมี 8) และขึ้นบรรทัดใหม่ · แถบขวาเป็นแถบมาตรฐานของ 360 (การ์ดรีวิว/แนะนำเพื่อนอยู่ในแท็บของตัวเองตาม M3.4/M3.5 — ภาพ 08 เป็นภาพรวม 3 ส่วน)
- ⚠️ ข้อมูล QC: สมาชิก 1 (5RVMTN) มีแถว "แนะนำเพื่อนสมัครสมาชิกแล้ว/สำเร็จ" + "ได้ 300 แต้ม (แนะนำเพื่อน)" ค้างสะสมจากการรัน m3.5/harness 3.5 หลายรอบ (cleanup ของข้อสอบลบ referral แต่ไม่ลบ MemberActivity/ledger ฝั่งผู้แนะนำ) → หนี้ M3.F: เก็บกวาด + reseed ก่อน qc:all · ไม่ใช่บั๊ก UI
- **member-history-thana**: เห็นประวัติของสมาชิกสาขาตัวเอง · ไม่เห็นแถวที่ติดสาขากะตะ (ตาม S4.1)
- **member-history-filter-owner**: เลือกชิปแล้วรายการกรองตามชนิด · จำนวนบนชิปคงที่
- **PARITY: ผ่าน**
