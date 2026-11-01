# SDS — หอพัก / อพาร์ตเมนต์ (DORM) · AS-BUILT V2

> as of `266b4c4a` (เลน `shark-svc-l4` · 1 พ.ย. 2569 · SVC D.20 ส่วนเอกสาร) — โค้ดหอล่าสุด `936bd20d` (หนี้ D.15) · สร้างจากโค้ด: model · event · facade · สิทธิ์ · เงิน · ข้อสอบ
> คู่กับแผน `ledger/SVC-MASTER-PLAN.md` (D.0–D.20) · สัญญากลาง `ledger/SVC-CORE-CONTRACT.md` · ใบสั่งต่อใบ `ledger/svc-briefs/svc-brief-d.*.md` · คำถามกฎหมาย/บัญชี `ledger/wo-notes/svc-legal-questions.md` · ชุด UAT `ledger/wo-notes/svc-uat-u2-dorm.md` (U2) · `ledger/wo-notes/svc-uat-u4-dorm-d2.md` (U4)
> ตัวเลขนับจากโค้ดวันนี้: model 13 (`prisma/schema/dorm.prisma`) · คีย์ outbox `dorm.*` ที่มีตัวรับ 15 · export ของ facade 317 ชื่อ (ค่า 175 + type 142) · คีย์สิทธิ์ 16 · งานรายนาที 9 · ค่าตั้ง `rooms.*` 112 คีย์ (ไม่นับ `rooms.hotel.*` = 89) · ตัวตรวจกฎหมาย 12 ข้อ · ข้อสอบ `qc-svc-d.*` 19 ชุด + probe 14 ไฟล์
> 🔴 **ยังไม่ใช้กับลูกค้าจริง** จนกว่าที่ปรึกษากฎหมายตรวจ (J3 · `ledger/SVC-MASTER-PLAN.md` §7) — G2 (D.15) ยัง ⬜

## 1. หน้าที่ · ชั้น · ไฟล์
- **หอพักรายเดือน**: ผู้เช่า/สัญญา/เงินประกัน → จดมิเตอร์ → ค่าน้ำไฟตามกฎหมาย สคบ. 2568 → รอบบิลรายเดือน → ส่ง LINE/พอร์ทัล → ตรวจสลิป/รับเงิน → ใบเสร็จ → GL บัญชี V2 · เตือน/ทวง/ค่าปรับ · ย้ายออก/คืนประกัน · แจ้งซ่อม · ประกาศ · พัสดุ · รายงาน
- Layer 3 · scope = unit (BusinessUnit ชนิด `DORM` · `prisma/schema/core.prisma`) · ทุกแถวผูก `tenantId` + `unitId` (ลงทะเบียน `src/lib/core/scope.ts` เป็น `unit` ยกเว้น `DormAuthorityTariff` = ตารางรัฐใช้ร่วม) · อ่าน/เขียนผ่าน `tenantDb` เท่านั้น · id ข้ามโมดูล (party/file/doc/card/approval) = String หลวม ไม่มี FK · เงิน = สตางค์ Int (`*Satang` + CHECK ≥ 0 ใน migration)
- ห้อง/อาคาร/ประเภทห้อง/การครอบครอง ใช้แกนห้องร่วมกับโรงแรม (`HotelRoom` · `RoomBuilding` · `HotelRoomType` · `RoomOccupancy` — `src/lib/modules/rooms/*` · R0.8/R0.9) · สลิปใช้ `PaymentSlip` กลาง (`prisma/schema/payment.prisma` domain `DORM` refType `DORM_BILL`) · รหัสผูก LINE ใช้ `ChatLinkCode` (`prisma/schema/chat.prisma` purpose `DORM_LEASE`) · เอกสารบัญชีติดแหล่ง `AccountDocSource.DORM` (`prisma/schema/account.prisma`)
- **โค้ดโมดูล** `src/lib/modules/dorm/` (30 ไฟล์):

| ไฟล์ | หน้าที่ (ใบ) |
|---|---|
| `calc.ts` | สูตรเงินที่เดียว · pure · สตางค์ล้วน (D.1) |
| `access.ts` · `lease-access.ts` · `moveout-access.ts` · `scope.ts` | ด่านสิทธิ์ pure + ขอบเขตอาคาร (D.5 · D.6 · D.12 · D.13 · D.15) |
| `lease.ts` · `lease-change.ts` | สัญญา · เงินจอง · ลงชื่อ · เข้าอยู่ · ย้ายห้อง · ต่อสัญญา (D.5 · D.12) |
| `meter.ts` · `meter-queue.ts` · `meter-ai.ts` | มิเตอร์ · จดมือถือ+คิวออฟไลน์ · AI อ่านรูป (D.6 · D.14) |
| `utility.ts` · `law.ts` | ค่าน้ำไฟทุกโหมด + ตัวตรวจรายเดือน · โหมดกฎหมาย (D.7) |
| `billing.ts` · `balance.ts` · `account-bridge.ts` · `tax-invoice.ts` | รอบบิล · ยอดค้างนิยามเดียว · บรรทัดเอกสาร · ใบกำกับเต็มรูป (D.8 · D.10 · D.2 · D.3) |
| `latefee.ts` · `dunning.ts` | ค่าปรับ · ยกเว้น · เตือน/ทวง · หนังสือบอกเลิก (D.11) |
| `moveout.ts` | ย้ายออก · ตรวจห้อง · ใบสรุป · คืนประกัน (D.12) |
| `portal.ts` | ตัวอ่านฝั่งผู้เช่าให้ชั้น platform (D.9) |
| `import.ts` · `import-parse.ts` · `import-ai.ts` | นำเข้า Excel/CSV (D.4) |
| `home.ts` · `policy.ts` | หน้าแรกหอ/KPI · นโยบาย/ชุดสิทธิ์ (D.13) |
| `repair.ts` · `announce.ts` · `parcel.ts` · `report.ts` | แจ้งซ่อม · ประกาศ · พัสดุ · รายงาน (D.16 · D.17 · D.18 · D.19) |
| `index.ts` | facade (§4) |

- **ชั้น platform** (ใช้หอ + บัญชี + สลิป + แชทพร้อมกัน): `src/lib/platform/dorm-pay.ts` (ตรวจสลิป/รับเงิน D.10) · `src/lib/platform/dorm-line.ts` (รหัสผูกห้อง · postback · rich menu · ส่งบิล D.9) · `src/lib/platform/dorm-portal.ts` (พอร์ทัลลิงก์เซ็น D.9) · `src/lib/platform/dorm-announce.ts` (ส่งประกาศ/หน้าประกาศ D.17) · `src/lib/platform/dorm-richmenu-image.ts` (รูปเมนู 6 ช่อง) · สะพานบอร์ดงาน `src/lib/platform/kanban-bridges.ts` (`onDormRepairCreated` · `onDormRepairDone` · `sweepDormRepairCards`) · route postback `src/lib/platform/postback-routes.ts` (prefix `dorm.`)
- **หน้าพนักงาน** `src/app/app/u/[unitSlug]/dorm/**` (layout ตรวจ `unit.type === "DORM"` · แท็บตามสิทธิ์ `src/components/dorm/dorm-home-shared.ts`: ผังห้อง · ผู้เช่า/สัญญา · จดมิเตอร์ · ตั้งค่า · บิล/รับเงิน):
  `/dorm` (หน้าแรก+ผัง) · `/dorm/tenants` · `/dorm/tenants/new` · `/dorm/tenants/[leaseId]/print` · `/dorm/tenants/[leaseId]/line` · `/dorm/tenants/import` (+ `template/route.ts`) · `/dorm/meter` · `/dorm/billing` · `/dorm/billing/[billId]/print` · `/dorm/billing/[billId]/tax-invoice` · `/dorm/payments` · `/dorm/overdue` · `/dorm/overdue/[leaseId]/notice` · `/dorm/moveout` · `/dorm/repairs` · `/dorm/repairs/[repairId]` · `/dorm/announce` · `/dorm/parcels` · `/dorm/reports` · `/dorm/settings` · `/dorm/settings/utility` — จอ client อยู่ `src/components/dorm/*` · ทางเข้าจากหน้าหน่วย `src/app/app/u/[unitSlug]/page.tsx` (เปิดระบบหอพัก · จดมิเตอร์ · พัสดุ · แจ้งซ่อม · รายงาน · ตั้งค่าหอ)
- **หน้าผู้เช่า (สาธารณะ · ไม่มี session · ลิงก์เซ็น `signLink` purpose `dorm.portal` subject = สัญญา — `src/lib/core/signed-link.ts`)**: `src/app/(store)/d/[token]/page.tsx` (บิล/จ่าย QR/แนบสลิป) · `.../receipt` · `.../lease` · `.../news` · `.../repair` · `.../f/[fileId]/route.ts` (ไฟล์สัญญา) · `src/app/(store)/dp/[token]/page.tsx` (QR รับพัสดุ) — ทุกทางเข้า: rate limit → ลายเซ็น → สัญญา live → ของในสัญญานี้ · ล้ม = 404 เนื้อเดียวกัน (X7) · `/d` ระดับบนเป็นจอลูกค้า POS (`src/app/(store)/d/page.tsx`) อยู่ร่วมเส้นทาง
- **LINE ขาเข้า**: `src/app/api/chat/webhook/[connectionId]/route.ts` → `onDormPostback` · `onDormLinked` · `onLineImage` (`dorm-line.ts`)
- schema: `prisma/schema/dorm.prisma` · migration `prisma/migrations/20261223000000_svc_d` (12 ตาราง + CHECK/partial index มือ) · `prisma/migrations/20261224000000_svc_d4` (`DormImportBatch`) · ข้อควรระวัง deploy `ledger/wo-notes/svc-deploy-checklist.md`

## 2. Models (13 · `prisma/schema/dorm.prisma`)
| model | หน้าที่ | ผู้เขียน (grep `create/update*` + SQL ดิบ) |
|---|---|---|
| `DormLease` | สัญญาเช่า (DRAFT/ACTIVE/NOTICE/ENDED/CANCELLED) · ค่าห้อง/ส่วนกลาง/ประกัน/ล่วงหน้า/เงินจอง · ลงชื่อ · รูปเข้าอยู่ · `policySnapshot` (dueDay/ค่าปรับ ล็อกตอนทำ) · FK `HotelRoom` Restrict | `lease.ts` · `lease-change.ts` · `moveout.ts` · `import.ts` |
| `DormMeter` | มิเตอร์ไฟ/น้ำ ROOM/MAIN (MAIN ต่ออาคาร) · หลักหน้าปัด (rollover) · เปลี่ยนตัว `replacedById` · unique ห้อง×ชนิดที่ใช้งาน | `meter.ts` · `import.ts` |
| `DormMeterReading` | เลขต่องวด (PERIOD/MOVE_IN/MOVE_OUT/REPLACE) · source MANUAL/AI/IOT/IMPORT · `aiValue` · ป้ายผิดปกติ · ยืนยัน · unique มิเตอร์×งวด (PERIOD) | `meter.ts` · `lease.ts` · `lease-change.ts` · `moveout.ts` · `import.ts` |
| `DormUtilityRate` | บิลการไฟฟ้า/ประปารายเดือนต่อ (หน่วย, อาคาร\|null, ชนิด, งวด) · ยอด/หน่วย/อัตรา · `legalCheck` (การยอมรับ) | `utility.ts` |
| `DormAuthorityTariff` | ตารางอัตรา กฟภ./กฟน./ประปา มีวันมีผล (global · ไม่มี tenantId) | ไม่มีผู้เขียนในแอป (อ่านใน `utility.ts#authorityTariffFor`) |
| `DormBillRun` | รอบบิล 1 รอบ/หน่วย/งวด (DRAFT/REVIEW/SENT/CLOSED) · ตั้งเวลาส่ง · `progress` (ทำเป็นชุด) | `billing.ts` |
| `DormBill` | บิล 1 สัญญา × 1 งวด (DRAFT/HELD/SENT/PARTIALLY_PAID/PAID/VOID) · `lines` snapshot · VAT · paid/carried · `accountDocumentId` unique · `policySnapshot` (รวม claim `dormPay`) | `billing.ts` · `src/lib/platform/dorm-pay.ts` (UPDATE ดิบ 5 จุด) |
| `DormMoveOut` | แจ้งย้ายออก 1 แถว/สัญญา (NOTICE/INSPECTED/SETTLED/REFUNDED/CANCELLED) · ผลตรวจ/หัก/คืน · `refundDueAt` · `approvalId` | `moveout.ts` |
| `DormRepair` | แจ้งซ่อม (OPEN/IN_PROGRESS/DONE/CANCELLED) · หมวด · อนุญาตเข้าห้อง · การ์ดบอร์ด · คะแนน 1–5 | `repair.ts` (INSERT/UPDATE ดิบ) |
| `DormAnnouncement` | ประกาศ ALL/BUILDING/FLOOR/ROOM · `publishedAt` | `announce.ts` |
| `DormAnnouncementRead` | อ่านแล้ว unique ประกาศ×Party | `announce.ts` |
| `DormParcel` | พัสดุ (WAITING/PICKED_UP/RETURNED) · รูป · ลายเซ็น · ตัวนับเตือน | `parcel.ts` (INSERT/UPDATE ดิบ) |
| `DormImportBatch` | ชุดนำเข้า (DRAFT/CREATING/CREATED/UNDOING/UNDONE) · unique หน่วย×hash ไฟล์ · CAS status+version + claimToken | `import.ts` (สร้าง/เปลี่ยนสถานะ) · `lease.ts` · `meter.ts` (ต่ออายุ claim ระหว่างนำเข้าเท่านั้น) |

ไม่มีตารางสลิป/รหัสผูก/ใบย้ายออกแยก (ใช้ของกลาง §1) · ข้อเสนอ AI อ่านมิเตอร์เก็บใน AuditLog action `dorm.meter.ai.proposed` (`meter.ts#METER_AI_ACTION` · ไม่มี migration) · ยกเว้นค่าปรับ = AuditLog `dorm.latefee.waived` (`latefee.ts`)

## 3. Outbox events `dorm.*` (15 · ตัวรับใน `src/lib/outbox-consumers.ts` ห่อ `withAutomation`)
payload เป็น id/ยอดล้วน ไม่มีชื่อ/เบอร์ (X8) · ป้ายภาษาไทยใน `src/lib/automation/labels.ts`
| คีย์ | ผู้ผลิต | ตัวรับ |
|---|---|---|
| `dorm.meter.flagged` | `meter.ts` | no-op (พักบิล/การ์ดทำใน service) |
| `dorm.lease.signed` | `lease.ts#signLease` | no-op |
| `dorm.billrun.sent` | `billing.ts#sendBillRun` (ต่อบิล) | `dorm-line.ts#onDormBillSent` ส่งบิลถึงผู้เช่าผ่าน notifyCustomer |
| `dorm.bill.overdue` | `dunning.ts#runDormDunningJobs` (ครั้งเดียวต่อบิล) | no-op (ข้อความทวงส่งใน dunning) |
| `dorm.bill.paid` · `dorm.bill.partially_paid` | `src/lib/platform/dorm-pay.ts` | no-op |
| `dorm.parcel.received` | `parcel.ts` | `onParcelReceived` แจ้ง LINE |
| `dorm.parcel.picked_up` | `parcel.ts` | no-op |
| `dorm.announcement.published` | `announce.ts#publishDormAnnouncement` | `dorm-announce.ts#onDormAnnouncementPublished` ส่ง LINE |
| `dorm.repair.created` | `repair.ts` | `kanban-bridges.ts#onDormRepairCreated` (การ์ด `dorm.repair#<id>`) |
| `dorm.repair.done` | `repair.ts` | `onRepairDone` (LINE ซ่อมเสร็จ) + `onDormRepairDone` (ย้ายการ์ด) |
| `dorm.moveout.settled` · `dorm.deposit.refund_due` | `moveout.ts` | no-op |
| `dorm.lease.renewed` | `lease-change.ts` | no-op |
| `dorm.lease.ended` | `lease-change.ts` · `moveout.ts` | no-op |

event กลางที่หอรับ: `payment.slip.approved` → `dorm-pay.ts#onDormSlipApproved` (คู่กับมัดจำจองคิว · `bothMain`) · ผลอนุมัติ `dorm.latefee.waive` → `applyLateFeeWaiverApproval` (`src/lib/approval-effects.ts`) · คำขออนุมัติหักประกัน entity `dorm.moveout.deduction` (`moveout.ts`)
**งานรายนาที 9** (`src/lib/platform/minute-jobs.ts`): `dorm.billing` (ส่งตามเวลาตั้ง) · `dorm.dunning` · `dorm.line` (ส่งบิลซ้ำ) · `dorm.parcel` · `dorm.announce` · `dorm.chatSlipSweep` · `dorm.repair` · `dorm.repair.cards` · `dorm.moveout`

## 4. Facade `src/lib/modules/dorm/index.ts` (ค่า 175 · type 142 — แบ่งเป็นบล็อกต่อใบ)
ผู้เรียกนอกโมดูลใช้ไฟล์นี้เท่านั้น · `createLease`/`moveIn` ห่อเป็นรุ่น 2 อาร์กิวเมนต์ (X17: อาร์กิวเมนต์ภายในของงานนำเข้าไม่ออกนอกโมดูล)
- **มิเตอร์ D.6/D.14** (`meter.ts` · `meter-queue.ts` · `meter-ai.ts`): `createMeter` · `listMeters` · `submitReadings` · `confirmReading` · `replaceMeter` · `meterWalk` · `meterFlags` · `heldRooms` · `periodUsage` · `previewReading` · `enqueueReading` · `nextBatch` · `settleBatch` · `proposeMeterReading` · `meterProposals` · `meterAiStatus` · `defaultMeterReader`
- **ค่าน้ำไฟ/กฎหมาย D.7** (`utility.ts` · `law.ts`): `recordAuthorityBill` · `utilityCharges` · `utilityBillingGate` · `acceptUtilityLegalWarn` · `authorityTariffFor` · `parseBahtToSatang` · `setDormLegalMode` · `dormLawModel`
- **สัญญา D.5** (`lease.ts` · `lease-access.ts`): `findTenantCandidates` · `receiveBookingFee` · `signLease` · `addLeaseFiles` · `leaseFileLinks` · `getLease` · `listLeases` · `leaseContract` · `cancelLease` · `updateLeaseOccupants` · `createLease` · `moveIn` · `leaseAccess`
- **รอบบิล D.8** (`billing.ts`): `prepareBillRun` · `setBillExtraLines` · `releaseHeldBill` · `scheduleBillRun` · `sendBillRun` · `adjustSentBill` · `billRunModel` · `getBill` · `billRunCsv` · `meterEstimates` · `runDormBillingJobs`
- **หน้าแรก/นโยบาย/ขอบเขต D.13** (`home.ts` · `scope.ts` · `policy.ts` · `access.ts`): `dormHomeModel` · `dormBuildingScope` · `dormVisibleRoomsFor` · `loadDormPolicySettings` · `applyDormRolePreset` · `setDormBuildingAssignment` · `dormAccess` · `DORM_ROLE_ROWS` · `DORM_ROLE_COLUMNS` · `dormPresetPermissions`
- **ใบกำกับ D.3** (`tax-invoice.ts`): `billTaxInvoice` · `issueBillTaxInvoice` · `reissueBillTaxInvoice`
- **ค่าปรับ/ทวง D.11** (`latefee.ts` · `dunning.ts`): `lateFeeLedger` · `waiveLateFee` · `applyLateFeeWaiverApproval` · `runDormDunningJobs` · `sendDunningNow` · `setPaymentPromise` · `overdueModel` · `terminationNotice`
- **ตัวอ่านพอร์ทัล D.9** (`portal.ts`): `portalLiveLease` · `portalLiveLeasesOfParty` · `portalCanonicalParty` · `portalLeaseOfUnit` · `portalBillVisible` · `portalLeaseBills` · `portalBillForSend` · `portalBillLiveState` · `portalSlipKeyExists` · `portalPartyName` · `portalFileAssets` · `portalActiveUnitIds` · `dormStaffGate` · `portalPeriodLabel` · `portalDateLabel` · `portalBaht`
- **ยอดค้าง D.10** (`balance.ts`): `billBalances` · `billPaidSatang`
- **ย้ายออก/ย้ายห้อง/ต่อสัญญา D.12** (`moveout.ts` · `lease-change.ts` · `moveout-access.ts`): `giveMoveOutNotice` · `cancelMoveOut` · `addMoveOutFiles` · `recordMoveOutInspection` · `moveOutSummary` · `moveOutModel` · `sendMoveOutSummary` · `reopenMoveOutSummary` · `settleMoveOut` · `runDormMoveOutJobs` · `transferRoom` · `renewLease` · `depositLeaseIdOf` · `leaseChangeModel` · `moveOutAccess`
- **นำเข้า D.4** (`import.ts` · `import-parse.ts` · `import-ai.ts`): `uploadImport` · `guessColumns` · `previewImport` · `createImport` · `undoImport` · `getImport` · `listImports` · `importIssuesCsv` · `parseImportFile` · `neutralizeCell` · `parseThaiDate` · `parseMoneySatang` · `headerGuess` · `importTemplateCsv` · `IMPORT_FIELDS` · `defaultColumnGuesser`
- **พัสดุ D.18** (`parcel.ts`): `receiveParcel` · `listParcels` · `pickupParcel` · `returnParcel` · `parcelPickupUrl` · `sendParcelNotice` · `onParcelReceived` · `runDormParcelJobs` · `loadParcelPickup` · `parcelsForLeases` · `parcelRoomsFor` + ค่าคงที่ `PARCEL_PICKUP_PURPOSE` `PARCEL_RATE` `PARCEL_NF_REASON`
- **ประกาศ D.17** (`announce.ts`): `createDormAnnouncement` · `updateDormAnnouncement` · `previewDormAnnouncement` · `publishDormAnnouncement` · `dormAnnouncementStats` · `dormAnnounceModel` · `announceStaffGate` · `announceForSend` · `announceRecipients` · `announceTemplate` · `announceSendBlocked` · `announceStampLogParty` · `announceVisibleForLease` · `announceMarkRead` · `announceDateLabel` · `announceResendCandidates` · `announceAuditOnce` + `ANNOUNCE_BLOCKED_ACTION` `ANNOUNCE_IDLE_ACTION`
- **แจ้งซ่อม D.16** (`repair.ts`): `repairTicketNo` · `submitPortalRepair` · `loadPortalRepairs` · `ratePortalRepair` · `repairPortalUrl` · `listDormRepairs` · `dormRepairJob` · `completeDormRepair` · `linkRepairCard` · `applyRepairCardState` · `sendRepairDoneNotice` · `onRepairDone` · `runDormRepairJobs` + `REPAIR_SOURCE_PREFIX` `REPAIR_RATE` `REPAIR_NF_REASON`
- **รายงาน D.19** (`report.ts`): `dormAgingReport` · `dormOccupancyReport` · `dormRevenueReport` · `dormReportModel` · `dormReportCsv` + `DORM_REPORT_NF_REASON` `DORM_REVENUE_TYPES`
- ตัวรับเงิน/สลิปไม่อยู่ใน facade นี้ — อยู่ `src/lib/platform/dorm-pay.ts` (`reviewDormSlip` · `resolveHeldSlip` · `recordDormPayment` · `voidDormReceipt` · `dormBillReceipts` · `dormPaymentsModel` · `stashChatSlip` · `attachChatSlip` · `dismissChatSlip` · `sweepExpiredChatSlips` · `onDormSlipApproved`)

## 5. สิทธิ์ · ขอบเขต
- **คีย์ 16** (`src/lib/core/permissions.ts` module `dorm`): `dorm.view` · `dorm.meter.read` · `dorm.bill.run` · `dorm.lease.manage` · `dorm.bill.send` · `dorm.import` · `dorm.slip.review` · `dorm.payment.manual` · `dorm.latefee.waive` · `dorm.moveout.manage` · `dorm.deposit.deduct.approve` · `dorm.repair.manage` · `dorm.announce` · `dorm.parcel.manage` · `dorm.settings.edit` · `dorm.settings.legal` — `planned` ยังมี `dorm.settings.legal` (การเปลี่ยนโหมดกฎหมายตรวจ "เจ้าของสด" ใน `law.ts#setDormLegalMode` · ไม่ได้อ่านคีย์นี้)
- OWNER ผ่านทุกอย่าง · MANAGER ผ่านในหน่วยที่คุม (`evaluate` ของ `src/lib/core/rbac.ts`) · STAFF ต้องถือคีย์ — ยกเว้น `dorm.deposit.deduct.approve` ที่ต้อง **ถือคีย์จริง** (ผู้จัดการไม่ได้เพราะคุมหน่วย · `moveout-access.ts` R7)
- deciders pure: `access.ts#dormAccess` → `{ board (dorm.view) · meter (dorm.meter.read) · money (คีย์เงินตัวใดก็ได้ของ bill.run/bill.send/slip.review/payment.manual) · lease · settings }` · `lease-access.ts#leaseAccess` → `{ view, manage }` · `moveout-access.ts#moveOutAccess` → `{ manage, approve, lease }` · "คนจดมิเตอร์เห็นแค่หน้าจด" (ถือ `dorm.meter.read` อย่างเดียว ⇒ แท็บจดมิเตอร์อย่างเดียว)
- **ชุดสิทธิ์ตามบทบาท** (หน้า 17 · `DORM_ROLE_ROWS` 11 แถว × คอลัมน์ เจ้าของ/ผู้ดูแล/ช่าง/บัญชี · `applyDormRolePreset`): ผู้ดูแล = บิล/สลิป/มิเตอร์/ดูผัง/สัญญา+ย้ายออก/ซ่อม/ประกาศ+พัสดุ (หักประกัน · ยกเว้นค่าปรับ = ยื่นขอ REQUEST) · ช่าง = มิเตอร์ + ซ่อม · บัญชี = บิล/สลิป/ดูผัง · ตั้งค่า/นำเข้า/โหมดกฎหมาย = เจ้าของ
- **ขอบเขตอาคาร** (`scope.ts`): ค่าตั้ง `rooms.access.managerScope` = `BUILDING` ⇒ ทุกบทบาทที่ไม่ใช่ OWNER (รวม MANAGER) เห็นเฉพาะอาคารใน `rooms.access.buildingAssignments[membershipId]` · ไม่มีรายการ ⇒ ไม่เห็นห้องใด (fail closed) · `dormBuildingScope` / `dormVisibleRoomsFor` (อ่าน Membership สดทุกครั้ง ไม่เชื่อ role ที่ผู้เรียกส่ง) · `dormActorScope` = ด่านเดียวกันสำหรับทางเขียนของ service (D.15 ปิดหนี้ FG-3: submit/confirm/replace/walk/flags ของมิเตอร์ · `936bd20d`) · ตั้งรายการที่หน้านโยบาย `setDormBuildingAssignment` (`src/app/app/u/[unitSlug]/dorm/settings/scope-actions.ts`)
- **ข้ามร้าน/ข้ามอาคาร/id เดา/สิทธิ์ไม่พอ ⇒ NOT_FOUND เหตุผลเดียวกัน** (X1) — เช่น `MOVEOUT_NF_REASON` (`moveout-access.ts`) · `REPAIR_NF_REASON` · `PARCEL_NF_REASON` · `DORM_REPORT_NF_REASON` · `DORM_PAY_NF` (`dorm-pay.ts` Z3: ผู้ดูแลถูกจำกัดอาคาร = บิลนอกขอบเขตไม่พบ) · หน้า = `notFound()`
- ตัวตนผู้เช่าทาง LINE: ผูก Party ได้จาก **รหัสผูกห้องที่พนักงานออก** เท่านั้น (`issueDormLinkCode` · `resolveDormParty`) — ห้ามเดาจากเบอร์/ชื่อ/ชื่อผู้โอน

## 6. เงิน · บัญชี
- **สูตร** (`calc.ts` pure · half-up สตางค์ · อัตราต้นทุนจริงปัดลง · VAT ต่อบรรทัดสูตรเดียวกับ `account/totals.ts`): ค่าห้อง/เศษวัน · ค่าน้ำไฟ · เฉลี่ยมิเตอร์รวม · ค่าปรับ · คืนประกัน
- **กฎหมาย** `src/lib/core/settings/legal/th-rental-2568.ts`: โหมด `STRICT`/`WARN`/`OUT_OF_SCOPE` (ค่าเริ่ม `rooms.legal.mode` = STRICT) · ตัวตรวจ 12 ข้อ `UTIL_FIXED_RATE_LE_COST` `UTIL_TOTAL_LE_BILL` `UTIL_FLAT_LE_COST` `UTIL_NO_MINIMUM` `DEPOSIT_ADVANCE_LIMIT` `DEPOSIT_ADVANCE_MONTHS_LIMIT` `DEPOSIT_RETURN_DAYS` `TEMPLATE_NO_THREAT` `CONTRACT_MANDATORY_CLAUSES` `DEDUCTION_EVIDENCE` `RENT_LOCKED_IN_LEASE` `LATE_FEE_CAP` (`evaluateLegal`) · `findForbiddenTerms` (คำขู่ ตัดไฟ/ตัดน้ำ/ล็อกห้อง/evict ฯลฯ — บล็อกทุกโหมด) · `MANDATORY_CLAUSES` · `legalScope` (≥ 3 ห้อง · ไม่ใช่หอนักศึกษา/โรงแรม) · หน้าโหมด `/dorm/settings/utility` (`law.ts` · เจ้าของเท่านั้น · นอกขอบเขตต้องเหตุผล ≥ 10 ตัว + หลักฐานไฟล์)
- **ค่าน้ำไฟ** (`utility.ts`): โหมดต่อชนิด `rooms.utility.{elec,water}.method` = `ACTUAL_COST` (ค่าเริ่ม) / `TARIFF` / `FIXED_RATE` / `FLAT` · ใส่บิลการไฟฟ้า/ประปา `recordAuthorityBill` (ไม่ถูกบล็อก · บันทึกข้อเท็จจริง) · ด่านออกบิล `utilityBillingGate` (STRICT ไม่รู้ต้นทุน = บล็อก · มิเตอร์รวม: ส่วนห้องว่างผู้ให้เช่าแบก · ผสมมิเตอร์ห้อง+รวม = บล็อก) · WARN ยอมรับได้ด้วย `acceptUtilityLegalWarn` (ผูก fingerprint+รุ่นบิล)
- **รอบบิล** (`billing.ts`): `prepareBillRun` (สูตร D.1 + น้ำไฟ D.7 + มิเตอร์ D.6 · พักบิลห้องที่มิเตอร์ผิดปกติ HELD) → ตรวจ (`billRunModel` · `setBillExtraLines` · `releaseHeldBill`) → `sendBillRun` / `scheduleBillRun` (งาน `dorm.billing`) · ส่ง = ออกใบแจ้งหนี้ทีละใบผ่าน `createExternalInvoice` (idempotent ref `DormBill/<leaseId>:<periodKey>`) + ลิงก์จ่าย `createPaymentRequestForDoc` + SENT + event ใน tx เดียว · แก้หลังส่ง `adjustSentBill` = ใบลด/เพิ่มหนี้ (`createExternalCreditNote` / `createExternalDebitNote`) · CSV `billRunCsv` · กติกาเงินจากสัญญาอ่าน `lease.policySnapshot` · วิธีคิดน้ำไฟ/VAT ณ ตอนออกจดลง `DormBill.policySnapshot`
- **บรรทัดเอกสาร** (`account-bridge.ts#dormBillInvoiceLines` pure): 1 บรรทัดบิล = 1 บรรทัดเอกสาร qty 1 × amountSatang · บรรทัดมิเตอร์แสดงหน่วย × บาท/หน่วย
- **ยอดค้างนิยามเดียว** (`balance.ts#billBalances`): จากบัญชี ณ ตอนเรียก (grandTotal − รับชำระไม่ยกเลิก (+WHT) − ใบลดหนี้) · ใช้ทุกจอ (พอร์ทัล · สลิป · ทวง · รายงาน)
- **รับเงิน** (`src/lib/platform/dorm-pay.ts`): สลิปจากพอร์ทัล (`submitPortalSlip`) / รูปในแชท (`stashChatSlip` → แนบอัตโนมัติเมื่อมีบิลเปิดใบเดียว · กำกวม = ให้เลือก) → ตรวจสลิปกลาง R0.6 → ป้าย `PAYER_NAME` `SHORT` `OVER` `DUPLICATE` `AFTER_PAID` `BILL_VOID` `NO_INVOICE` `OTHER` → พนักงาน `reviewDormSlip` (APPROVE · PARTIAL_CARRY · ASK_MORE · REJECT) · รับมือ `recordDormPayment` (เงินสด/โอน · `dorm.payment.manual`) · ลงเงิน `recordExternalPayment` + ใบเสร็จ `issueDormReceipt` (RC) · ยกเลิกใบเสร็จ `voidDormReceipt` → `voidDormReceiptDoc` (กลับรายการ ไม่ลบแถว) · claim CAS ต่อบิล (หนึ่งบิลลงเงินได้ทีละทาง) + แผนลงเงินจดบนบิลก่อนลง (ตายกลางทาง = ทำต่อได้ผลเดิม) · จ่ายบางส่วนตามค่าตั้ง `rooms.payment.partial` (ค่าเริ่ม `ALLOW_CARRY_FORWARD`) · ยอดยก = ป้าย `carriedSatang` ไม่ย้ายลูกหนี้
- **GL**: สมุดบัญชีของหอ = ระบบบัญชีที่ผูกหน่วยหอ **เล่มเดียว** (`dormUnitBookId` ใน `src/lib/modules/account/index.ts` · ไม่ผูก = `NOT_LINKED` · ผูก > 1 = `AMBIGUOUS_LINK`) · เงินประกันเป็นหนี้สิน บัญชีกลุ่ม 2140 (`TENANT_DEPOSIT_CODES` ใน `src/lib/modules/account/gl.ts`) ผ่าน `postSecurityDepositInTx` / `settleSecurityDepositInTx` / `reverseSecurityDepositReceiptInTx` · รับเกินลง 2110 (J4 ค้าง) · ทุกเส้นเงินผ่าน facade บัญชี (`src/lib/modules/account`) — หอไม่เขียนตารางบัญชีเอง
- **ใบกำกับเต็มรูป ม.86/4** (`tax-invoice.ts`): เฉพาะหอจด VAT (`rooms.vat.registered` ค่าเริ่ม false) · `issueBillTaxInvoice` / `reissueBillTaxInvoice` (ยกเลิก = ออกฉบับใหม่แทน · วันที่ตาม `rooms.vat.reissueDate`) · หน้า `/dorm/billing/[billId]/tax-invoice` (`?copy=1` สำเนา)
- **ค่าปรับ** (`latefee.ts`): สูตร D.1 · ฐาน = เงินต้นค้างจากบัญชี · เพดาน = min(capPerBill ของสัญญา, LATE_FEE_CAP) · ว่างทั้งคู่ ⇒ เพดานกันพิมพ์ผิด `rooms.lateFee.guardRentBp` · ลงบิลงวดถัดไปเป็นบรรทัด `LATE_FEE` meta.auto · ยกเว้น `waiveLateFee` (ผู้ไม่ใช่เจ้าของ ⇒ งานอนุมัติ `dorm.latefee.waive` ค่าเริ่ม `rooms.lateFee.waiverApproval` = OWNER_APPROVAL) · บิลที่ส่งแล้ว ⇒ ใบลดหนี้
- **เตือน/ทวง** (`dunning.ts`): ข้อความผ่าน `notifyCustomer` (`src/lib/platform/notify-customer.ts` · เวลาเงียบ · OA ต่อหน่วย · ยินยอม · QUOTA · dedupe) เท่านั้น · ตรวจคำต้องห้ามบนข้อความที่ render แล้วทุกครั้ง · ค่าเริ่ม เตือนก่อน `[2, 0]` วัน · ทวงหลัง `[3, 7, 14]` วัน · นัดจ่าย `setPaymentPromise` · หนังสือบอกเลิก `terminationNotice` (หน้า `/dorm/overdue/[leaseId]/notice`)
- **คืนประกัน** (`moveout.ts`): ใบสรุป = ค่าน้ำไฟเลขวันออก + หักตามผลตรวจ (DAMAGE + หลักฐาน — DEDUCTION_EVIDENCE) · หักเกิน `rooms.deposit.approvalThreshold` (ค่าเริ่ม 200,000 สตางค์) โดยผู้ไม่ถือคีย์อนุมัติ ⇒ งานอนุมัติ `dorm.moveout.deduction` · คืนภายใน `rooms.deposit.returnDays` (ค่าเริ่ม 7 · J3 ข้อ 1) · งาน `dorm.moveout` นับถอยหลัง

## 7. มิเตอร์ · AI อ่านมิเตอร์
- `meter.ts`: `createMeter` · `submitReadings` (ทีละห้อง · ตรวจขอบเขตอาคารผู้กระทำ `dormActorScope`) · ผิดปกติ `HIGH`/`LOW`/`BACKWARDS`/`VACANT_USAGE` ตามค่าตั้ง `rooms.meter.anomaly` (ค่าเริ่ม ±50% จากเฉลี่ย 3 งวด · ห้องว่าง > 5 หน่วย · ถอยหลัง) ⇒ event `dorm.meter.flagged` + พักบิล (`heldRooms`) · ยืนยัน `confirmReading` · เปลี่ยนมิเตอร์ `replaceMeter` (เลข REPLACE) · rollover ตามหลักหน้าปัด (`digits`) · จอเดินจด `meterWalk` / รายการผิดปกติ `meterFlags` (`/dorm/meter?view=flags`)
- **ออฟไลน์** `meter-queue.ts` (pure · ใช้ใน `src/components/dorm/MeterWalk.tsx`): `enqueueReading` → `nextBatch` → `settleBatch` (จดตอนไม่มีเน็ตแล้วส่งทีหลัง)
- **AI** `meter-ai.ts` (D.14 · ระบบเสนอ คนยืนยัน): `proposeMeterReading` อ่านรูป → ข้อเสนอเก็บ AuditLog (ไม่มีรูป/ชื่อ/เบอร์) · ความมั่นใจต่ำกว่า `rooms.meter.aiMinConfidence` (ค่าเริ่ม 80) ⇒ ต้องคนยืนยัน · เปิด/ปิด `rooms.meter.aiRead` (ค่าเริ่ม **เปิด** · หักเครดิต AI ต่อครั้ง ผ่าน `src/lib/ai/credit.ts` ref กันหักซ้ำ — คำถามเจ้าของ 31 ต.ค.) · บังคับรูป `rooms.meter.requirePhoto` (ค่าเริ่ม ELEC)

## 8. นำเข้า Excel/CSV (D.4)
- ขั้น: `uploadImport` (CSV/XLSX · เพดาน `rooms.import.maxRows` 1000 แถว · `rooms.import.maxFileBytes` 2 MB) → `guessColumns` (ตัวเดา `import-ai.ts#defaultColumnGuesser` + `headerGuess`) → `previewImport` (ปัญหาต่อแถว READY/WARN/MUST_FIX) → `createImport` (เทียบ `previewHash` · STALE_PREVIEW) → `undoImport` (ภายใน `rooms.import.undoDays` ค่าเริ่ม 0 = ภายในวันที่นำเข้า · เฉพาะเมื่อยังไม่ออกบิลของสัญญาที่นำเข้า) · แม่แบบ `/dorm/tenants/import/template` (`importTemplateCsv`)
- ช่อง 16 (`IMPORT_FIELDS` ใน `import-parse.ts`): เลขห้อง · อาคาร · ชั้น · ประเภทห้อง · ชื่อผู้เช่า · เบอร์โทร · เลขบัตรประชาชน · วันเริ่มสัญญา · ระยะสัญญา (เดือน) · ค่าห้อง/เดือน · เงินประกันที่ถือไว้ · ค่าเช่าล่วงหน้า · เลขมิเตอร์ไฟล่าสุด · เลขมิเตอร์น้ำล่าสุด · ยอดค้างยกมา · บันทึกของห้อง
- สร้างจริง: อาคาร (`roomBuilding`) · ประเภทห้อง (`hotelRoomType`) · ห้อง (`hotelRoom`) · สัญญา+ประกันยกมาผ่าน `createLease` + `moveIn` ของ D.5 (JV เดียวกับ D.5) · มิเตอร์+เลขผ่าน `createMeter` + `submitReadings` (source IMPORT) · **ยอดค้างยกมาไม่ออกใบแจ้งหนี้** (ปัญหา `ARREARS_NOT_IMPORTED` · จดไว้อย่างเดียว · มติ D.4)
- ความปลอดภัย: เซลล์สูตรถูกทำให้เป็นกลาง (`neutralizeCell`) · ผลสะท้อนกลับปิดเบอร์/เลขบัตร · CAS + claimToken + advisory lock `dorm.import:<unitId>` · ตัวตรวจกฎหมายประกันเกินเพดาน (`DEPOSIT_LEGAL` = MUST_FIX ใน STRICT) · สิทธิ์ `dorm.import` + `dorm.lease.manage` + เห็นทุกอาคาร

## 9. ฝั่งผู้เช่า · ซ่อม · ประกาศ · พัสดุ · รายงาน · ย้ายออก
- **พอร์ทัล/LINE (D.9)**: ลิงก์เซ็นต่อสัญญา (`dorm-portal.ts#portalUrl` · อายุ `rooms.notify.portalLinkDays` ค่าเริ่ม 35 วัน) · หน้าบิล QR พร้อมเพย์ยอดค้างสด + แนบสลิป · ใบเสร็จ · สัญญา/เอกสาร (ไม่มีบัตร/ลายเซ็น) · ผูก LINE ด้วยรหัสผูกห้อง (หน้า `/dorm/tenants/[leaseId]/line` · `issueDormLinkCodeAction` · อายุ `rooms.notify.linkCodeDays` 30 วัน) · rich menu 6 ช่อง (บิลของฉัน · แจ้งซ่อม · ประกาศ · สัญญา/เอกสาร · พัสดุ · ติดต่อหอ — `dorm-richmenu-image.ts` · `syncDormRichMenu`) · ส่งบิลซ้ำเมื่อ FAILED (งาน `dorm.line` ≤ 3 ครั้ง/บิล/3 วัน)
- **แจ้งซ่อม (D.16)**: ผู้เช่าแจ้งที่ `/d/<token>/repair` (หมวดจาก `rooms.repair.categories` · อนุญาตเข้าห้อง · เวลาสะดวก) → event → การ์ดบอร์ดงาน sourceKey `dorm.repair#<id>` (บอร์ดตามหมวด · ไม่มีบอร์ด = รอตัวกวาด `dorm.repair.cards`) · การ์ดขยับ ⇒ สถานะ (`applyRepairCardState`) · ช่างปิดงานที่ `/dorm/repairs/[repairId]` (`completeDormRepair`) ⇒ LINE ซ่อมเสร็จครั้งเดียว ⇒ ผู้เช่าให้คะแนน 1–5 (`ratePortalRepair`) · ใครจ่าย = `rooms.repair.payer` (ค่าเริ่ม `DORM`) · หนี้: เก็บค่าซ่อมในบิล · คลิป · นัดเวลา
- **ประกาศ (D.17)**: หน้า `/dorm/announce` (ปุ่มบนหน้าแรกหอสำหรับผู้ถือ `dorm.announce`) · กลุ่ม ALL/BUILDING/FLOOR/ROOM · ตัวอย่าง → เผยแพร่ (CAS publishedAt) → LINE (`rooms.notify.announceLine` ค่าเริ่มเปิด · เวลาเงียบไม่ข้าม · dedupe ต่อคน) · หน้าผู้เช่า `/d/<token>/news` (เห็นย้อน `rooms.notify.announcePortalDays` 30 วัน) · นับอ่านจาก action ฝั่งเบราว์เซอร์เท่านั้น (GET ไม่นับ) · ตัวตรวจคำต้องห้ามก่อนส่งทุกครั้ง (พบ = ไม่ส่ง ไม่มีแถว log) · ส่งซ้ำ `resendAnnouncementAction`
- **พัสดุ (D.18)**: ปิดอยู่โดยปริยาย (`rooms.parcel.enabled` = false) · รับ+รูป (`receiveParcel`) ⇒ LINE แจ้ง ⇒ ผู้เช่าเปิด `/dp/<token>` แสดง QR ⇒ พนักงานสแกน/เซ็นรับ (`pickupParcel` · ลิงก์ใช้ครั้งเดียว) · ตีกลับ `returnParcel` · เตือนค้างเกิน `rooms.parcel.holdDays` (14 วัน) ครั้งเดียวต่อรอบ (งาน `dorm.parcel`)
- **รายงาน (D.19)**: `/dorm/reports` ต้อง `dorm.view` + คีย์เงิน · ลูกหนี้ตามอายุ (`dormAgingReport` · คิดจาก GL ของบิลโดยตรง) · อัตราเข้าพักรายเดือน · รายได้แยกประเภท (`DORM_REVENUE_TYPES`) · ช่วง `?range=` · CSV กันสูตร (`dormReportCsv` · เพดาน `rooms.report.exportMaxRows` 5000 · `rooms.report.maxMonths` 24) · ส่วนลึก (ต้นทุนส่วนต่างน้ำไฟ · จ่ายช้าซ้ำ · แนวโน้ม) = ใบเลื่อน RP.2
- **ย้ายออก/ย้ายห้อง/ต่อสัญญา (D.12)**: หน้า `/dorm/moveout?lease=<id>` (ทางเข้าจากหน้าผู้เช่า: ต่อสัญญา `#renew` · ย้ายห้อง `#transfer` · ย้ายออก) · แจ้งล่วงหน้า `rooms.moveout.noticeDays` 30 วัน (สั้นกว่า = audit `dorm.moveout.short_notice`) · ตรวจห้องตาม `rooms.moveout.checklist` + รูปเข้าอยู่เทียบ · ใบสรุป → ส่งผู้เช่า (`sendMoveOutSummary` · แช่แข็ง) → เปิดแก้ (`reopenMoveOutSummary`) → ปิดประกัน (`settleMoveOut`) · `transferRoom` · `renewLease`

## 10. ค่าตั้ง (`src/lib/core/settings/defs/rooms.ts` · domain `rooms` ใช้ร่วมกับโรงแรม)
112 คีย์ (`rooms.hotel.*` 23 = ของโรงแรม) · หน้าแก้: `/dorm/settings` (การ์ดนโยบาย/ข้อความ/สิทธิ์ · `loadDormPolicySettings` · ป้าย "ปรับจากแม่แบบ N ข้อ") · `/dorm/settings/utility` (ค่าน้ำไฟ · กฎหมาย · VAT) · แม่แบบตามประเภทกิจการ `rooms.general.businessType` (APARTMENT · STUDENT_DORM · SMALL_HOTEL · SERVICED_APT)
| กลุ่ม | คีย์ (ค่าเริ่ม `_fallback`) |
|---|---|
| กฎหมาย/ทั่วไป | `rooms.legal.mode` (STRICT) · `rooms.legal.outOfScopeReason` · `rooms.legal.outOfScopeEvidence` · `rooms.money.rounding` · `rooms.locale.docLanguage` |
| ค่าห้อง/น้ำไฟ | `rooms.rent.*` · `rooms.utility.{elec,water}.{metering,method,fixedRate,flat,tariffRef}` (method ACTUAL_COST) · `rooms.utility.minimum` · `rooms.utility.sharedBasis` · `rooms.utility.tariffTable` |
| มิเตอร์ | `rooms.meter.readDay` (25) · `rooms.meter.anomaly` · `rooms.meter.aiRead` (true) · `rooms.meter.requirePhoto` (ELEC) · `rooms.meter.aiMinConfidence` (80) |
| VAT/ภาษี | `rooms.vat.registered` (false) · `rooms.vat.pricesIncludeVat` · `rooms.vat.taxKinds` · `rooms.vat.reissueDate` · `rooms.tax.withholdingCorporateBp` |
| รอบบิล | `rooms.billing.issueDay` (25) · `rooms.billing.dueDay` (5) · `rooms.billing.rentTiming` (ADVANCE) · `rooms.billing.utilityTiming` (ARREARS) · `rooms.billing.prorate` · `rooms.billing.autoSend` (false) · `rooms.billing.sendChannels` (LINE · SMS · PRINT) |
| ค่าปรับ/แจ้งเตือน | `rooms.lateFee.{kind (PER_DAY),amount,percentBp,capPerBill,graceDays (3),waiverApproval (OWNER_APPROVAL),autoCharge (true),guardRentBp}` · `rooms.notify.{reminderBeforeDays [2,0],dunningAfterDays [3,7,14],promiseMaxDays,portalLinkDays (35),linkCodeDays (30),richMenu (true),announceLine (true),announcePortalDays (30)}` |
| สัญญา/ประกัน/ย้ายออก | `rooms.lease.{defaultMonths (12),advanceMonths,reservationMonths,reservationAppliesTo,contractTemplate,extraClauses,signMethod (ON_SCREEN),moveInPhotosMin (6),terminationNoticeDays (30)}` · `rooms.deposit.{months (2 · SERVICED_APT 1),returnDays (7),approvalThreshold (200,000 สตางค์),damageCatalog}` · `rooms.moveout.{noticeDays (30),checklist}` · `rooms.services.{catalog,extraOccupantFee}` |
| รับเงิน | `rooms.payment.{partial (ALLOW_CARRY_FORWARD),afterPaidSlip,notifyReceipt,slipAutoAttach (true),chatSlipKeepDays (30)}` |
| ซ่อม/พัสดุ/สิทธิ์ | `rooms.repair.{categories,payer (DORM)}` · `rooms.access.roomEntry` · `rooms.parcel.{enabled (false),holdDays (14)}` · `rooms.access.{managerScope (UNIT),buildingAssignments}` |
| นำเข้า/รายงาน | `rooms.import.{maxRows (1000),maxFileBytes (2,000,000),undoDays (0)}` · `rooms.report.{exportMaxRows (5000),maxMonths (24)}` |

พร้อมเพย์/ตรวจสลิป/LINE OA ตั้งที่ศูนย์เชื่อมต่อ `/app/settings/integrations` (R0.5) · ข้อความแม่แบบอยู่ domain `messaging` (การ์ดข้อความในหน้า `/dorm/settings`)

## 11. ข้อสอบที่คุมแต่ละส่วน
| ส่วน | ข้อสอบ | probe (ผู้ตรวจ) |
|---|---|---|
| migration svc_d · 12 ตาราง + DORM | `scripts/qc-svc-d.0.mts` | — |
| กฎหมาย สคบ. 2568 + สูตรเงิน (pure) | `scripts/qc-svc-d.1.mts` | — |
| facade บัญชีหอ | `scripts/qc-svc-d.2.mts` | — |
| VAT + ใบกำกับ | `scripts/qc-svc-d.3.mts` | `scripts/probe-d3-b.mts` |
| นำเข้า Excel | `scripts/qc-svc-d.4.mts` | `scripts/probe-d4-b.mts` |
| ผู้เช่า · สัญญา · ประกัน | `scripts/qc-svc-d.5.mts` | — |
| มิเตอร์ + จดมือถือ | `scripts/qc-svc-d.6.mts` | — |
| ค่าน้ำไฟ + หน้ากฎหมาย/VAT | `scripts/qc-svc-d.7.mts` | — |
| รอบบิล (+perf) | `scripts/qc-svc-d.8.mts` | `scripts/probe-d8-b.mts` · `scripts/probe-d8-b2.mts` |
| LINE ผู้เช่า + พอร์ทัล | `scripts/qc-svc-d.9.mts` | `scripts/probe-d9-b.mts` |
| ตรวจสลิป/รับเงิน | `scripts/qc-svc-d.10.mts` | `scripts/probe-d10-b.mts` |
| เตือน · ทวง · ค่าปรับ | `scripts/qc-svc-d.11.mts` | `scripts/probe-d11-b.mts` |
| ย้ายออก · ย้ายห้อง · ต่อสัญญา | `scripts/qc-svc-d.12.mts` | `scripts/probe-d12-b.mts` |
| ผังห้อง + KPI · นโยบาย/สิทธิ์ · ขอบเขตอาคาร | `scripts/qc-svc-d.13.mts` | `scripts/probe-d13-b.mts` |
| AI อ่านมิเตอร์ | `scripts/qc-svc-d.14.mts` | `scripts/probe-d14-b.mts` |
| แจ้งซ่อม → บอร์ดงาน | `scripts/qc-svc-d.16.mts` (+ `scripts/qc-kanban-k3.3.mts` · `scripts/qc-kanban-k3.4.mts`) | `scripts/probe-d16-b.mts` |
| ประกาศ | `scripts/qc-svc-d.17.mts` | `scripts/probe-d17-b.mts` |
| พัสดุ | `scripts/qc-svc-d.18.mts` | `scripts/probe-d18-b.mts` |
| รายงาน | `scripts/qc-svc-d.19.mts` | `scripts/probe-d19-b.mts` |

ไม่มี `qc-svc-d.15` / `qc-svc-d.20` (ใบปิดของผู้คุม = ด่านเต็ม G2/G3) · ฉาก QC หอ: `scripts/svc-qc-dorm-rebuild.mts` (ล้าง+สร้างทั้งสายตามลำดับ roomboard → lease → meter → meter-ai → utility → billing → dorm-home → overdue → payments → portal → repair → parcel → report → moveout) · ค่าฉาก `scripts/svc-qc-data.mts` · นำเข้าแยกร้าน B `scripts/svc-qc-import-scene.mts` · ภาพ `scripts/visual-svc.mts`

## 12. หนี้ที่รู้ (ณ `266b4c4a`)
**ด่าน/การใช้จริง**
- 🔴 **J3 ยังไม่ได้ผลที่ปรึกษากฎหมาย** — หอห้ามใช้กับลูกค้าจริง (`ledger/SVC-MASTER-PLAN.md` §7) · ชุดคำถาม `ledger/wo-notes/svc-legal-questions.md` (J3 ข้อ 1–21 · J4 · J5) — ค่าปลอดภัยที่ใช้: คืนประกัน 7 วัน · STRICT บล็อกเมื่อยังไม่มีบิลการไฟฟ้า · มิเตอร์รวมผู้ให้เช่าแบกห้องว่าง · คำขู่บล็อกทุกโหมด · "ตัดไฟ/ตัดน้ำ" ในประกาศซ่อมบำรุงถูกบล็อก (แนะนำ "ไฟฟ้าดับชั่วคราว")
- D.15 (G2) ⬜ · D.20 (G3) ⬜ (`ledger/SVC-RUN.md` §3) · หนี้ D.15 เดิม (ขอบเขตอาคารใน submitReadings FG-3 · ช่องกรอก `rooms.access.buildingAssignments` ในฟอร์มกลาง) ปิดแล้ว `936bd20d` ยืนยันด่าน Y 1 พ.ย.
- C.1 ตัวต่อตรวจสลิปเจ้าแรกยังไม่ทำ (รอชื่อเจ้า+คีย์ J2) ⇒ หอขึ้นด้วยตรวจสลิปแบบมือ (ระบบยังตรวจยอด/ซ้ำ/ผู้รับ)
- deploy: migration `svc_d` · `svc_d4` + unique `AccountDocument_taxinvoice_source_uniq` ต้องตรวจ prod (D.3) · ห้ามรับ DROP INDEX `DormUtilityRate_unitId_buildingId_kind_periodKey_key` (`ledger/wo-notes/svc-deploy-checklist.md`) · J6

**ต่อใบ** (จาก `ledger/SVC-RUN.md` §3.2/§4)
- D.1: settleDeposit ยังไม่ถอด VAT (ใบย้ายออก) · เศษวัน DIV_30 เดือน ก.พ. (ค่าตั้ง)
- D.2: ล็อกเงินระดับร้าน ⇒ D.8 ออกบิลทีละใบ (N2)
- D.4: ยอดค้างยกมาไม่ออกใบ · N3/X16 (`/root/svc-runs/fix/d4.md`)
- D.7: หนี้ `/root/svc-runs/fix/d7.md`
- D.10: ป้ายปุ่ม "ลงเงินอีกครั้ง" · `OUTBOX_MAX_ATTEMPTS` ซ้ำสองที่ · REFUND_DUE open ไม่อยู่ใต้ claim (LOW)
- D.11: เพดานเตือน hardcode (L7)
- D.14: ref USAGE ชน namespace TOPUP/GRANT · ตัวอ่าน AI ใน tx ถือ connection · AuditLog เป็นที่เก็บข้อเสนอ
- D.16: เก็บค่าซ่อมในบิล · คลิป · นัดเวลา (ยังไม่มี)
- D.17: แท็บประกาศไม่มีในแถบหอ (เข้าจากปุ่มหน้าแรก · d.13 K-6) · ประกาศหยุดกลางรอบต้องกดส่งซ้ำเอง · stamp partyId ลง ServiceMessageLog นอก notifyCustomer
- D.18: ถอด QR กล้อง · ไฟล์ลายเซ็นสำรอง · QUOTA ครั้งแรกเรียกซ้ำ 1 ครั้ง · J3/J5 ระยะเก็บรูปฉลาก
- ทางเข้าหน้า: `/dorm/billing` และ `/dorm/tenants/import` ไม่มีลิงก์จากแท็บ/หน้าแรก (เข้าด้วย URL ตรง) · `/dorm/payments` → `/dorm/overdue` · `/dorm/tenants` → `/dorm/moveout`
- สิทธิ์: `dorm.settings.legal` ยังอยู่ `planned` ใน `src/lib/core/permissions.ts` ทั้งที่โหมดกฎหมายเปิดใช้แล้ว (ตรวจเจ้าของสด ไม่ใช่คีย์)

**คำถามเจ้าของ/นอกโมดูล** (`ledger/SVC-OWNER-QUESTIONS.md`)
- AI อ่านมิเตอร์ค่าเริ่ม "เปิด" (หักเครดิตทุกครั้งที่กดให้ AI อ่าน)
- บั๊กรายงานลูกหนี้บัญชี V2 (`outstandingByContacts` / `agingReport` ไม่นับใบลด/เพิ่มหนี้) — รายงานหอ D.19 ไม่โดน (คิดจาก GL ของบิล)
