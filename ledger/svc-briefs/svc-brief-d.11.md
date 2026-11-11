# ใบสั่ง D.11 — เตือน · ทวง · ค่าปรับ (หอ) · ตรวจ **เข้ม (เงิน + กฎหมาย สคบ.)**

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.11 · แบบ: `ledger/DESIGN-DORM-HOTEL.md` A8 + §3 (แถว "ค่าปรับจ่ายช้า" · "ข้อห้าม") + §8 แถวอนุมัติ ("ลดค่าปรับ") · ภาคผนวก ก หอ #31–39 · ภาพอ้างอิง `ledger/design-dorm/06-slip-payments.png` (การ์ด "ค้างจาก ต.ค. ฿10,200.40 · 106 · 305 · ส่งเตือนแล้ว 3 ครั้ง" + ปุ่ม "ทวงที่ยังไม่จ่าย") · `01-floorplan.png` ("ทวง / นัดจ่าย") · `17-settings-policies.png` (การ์ดค่าปรับ · เตือน/ทวง — ทำแล้วใน D.13)
> สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §1.6 (snapshot — ค่าปรับอ่านจากสัญญา) §1.7 (ตัวตรวจกฎหมาย) §4.4 (`notifyCustomer` ประตูเดียว · `ServiceMessageLog` unique (tenantId, dedupeKey)) §7 (event) §8 (`dorm.latefee.waive`)
> ส่งต่อจากใบก่อน (อ่านก่อนเขียน): **D.8** ใบสั่ง §3.3 (ช่อง `LATE_FEE` · บรรทัดมือ `meta.manual/src`) §3.7 (ใบลด/เพิ่มหนี้ ref `DormBillAdjust`) §9 มติ 8 · `/root/svc-runs/fix/d8.md` (บทเรียน: จองบิล · ref idempotent · CAS · งานตามเวลา backoff/ไม่แย่งคิวข้ามร้าน · **F14** ใบเพิ่มหนี้ค่าปรับต้องผ่านเพดาน · **F15** เพดานกันพิมพ์ผิด "≤ ค่าเช่า 1 เดือน" ต้องย้ายเข้า settings · **m7** เพดานเมื่อ `capPerBill` null) · **D.3** `/root/svc-runs/fix/d3.md` (บิล VAT · ห้ามแตะทางใบกำกับ) · **D.13** (`dormAccess().money` · ตารางสิทธิ์ "ยกเว้นค่าปรับ" ผู้ดูแล = ขออนุมัติ) · **R0.7** `notifyCustomer` (เวลาเงียบ · OA ต่อหน่วย · QUOTA · dedupe) · **R0.3** (TEMPLATE_NO_THREAT · ข้อเสนอใน AuditLog + approval-effects)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.11.mts» — `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.11.mts` (ห้ามครอบ timeout · ห้าม kill — ล้างข้อมูลอยู่ใน finally · G รันหลังล้าง) · `--no-regression` ข้ามหมวด G ระหว่างทำ · SKIP ที่ยอมได้ระหว่างทำ = V-1 (ไม่มี QC_BASE) · Q-* (svcqc ยังไม่มีฉาก D.13) · G-* (`--no-regression`) — ผู้คุมรันครบก่อนรับ
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/**`** · เลน l2 · temp ขึ้นต้น `svc-d11-` · รายงานต่อข้อ (id → ผล)
> **ไม่มี migration** — สถานะทั้งหมดอยู่ในตารางเดิม (มติ 1) · ขาดคอลัมน์ = หยุดถามผู้คุม (ห้ามเพิ่มเอง)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | | ทำอะไร |
|---|---|---|
| «src/lib/modules/dorm/latefee.ts» | ใหม่ (server) | §3 ค่าปรับอัตโนมัติ (สูตร/เพดาน/สมุดค่าปรับ) · §4 ยกเว้น + ผลอนุมัติ — ผ่าน `tenantDb` (ห้าม `import { prisma }` · F5.1) · สูตรเรียก `lateFee` ของ D.1 · เพดานกฎหมายผ่าน `evaluateLegal("LATE_FEE_CAP")` · ใบลดหนี้ผ่านทางเดียวกับ `adjustSentBill` (ฟังก์ชันภายใน billing.ts ที่ export ภายในโมดูลได้) |
| «src/lib/modules/dorm/dunning.ts» | ใหม่ (server) | §5 เตือน/ทวง/งานตามเวลา · §6 นัดจ่าย · §7 จอค้างชำระ (โมเดล) · §8 หนังสือบอกเลิก · §9 event `dorm.bill.overdue` — ข้อความผ่าน `notifyCustomer` (`@/lib/platform/notify-customer`) เท่านั้น |
| `src/lib/modules/dorm/billing.ts` | แก้ (**เฉพาะ 4 จุด** · คอมเมนต์ `// SVC D.11`) | (ก) ตอนคำนวณบิล DRAFT/HELD เรียก §3 ใส่ค่าปรับอัตโนมัติในบรรทัด `LATE_FEE` เดิม (meta `auto`) (ข) `deps.legalParams` ของ `prepareBillRun` ส่งต่อถึง §3 (ค) `lateFeeCheck` (บรรทัดมือ/ใบเพิ่มหนี้): เพดานกันพิมพ์ผิดอ่านค่าตั้ง `rooms.lateFee.guardRentBp` แทน "ค่าเช่า 1 เดือน" ตายตัว + Σ รวมค่าปรับอัตโนมัติในบิลเดียวกัน (ง) ตัวอย่างบิล/พิมพ์: บรรทัดค่าปรับอัตโนมัติมี `detail` "<เดือนย่อ> <พ.ศ.> ช้า N วัน" — พฤติกรรมอื่นของ D.8/D.3 ห้ามเปลี่ยน |
| `src/lib/modules/dorm/index.ts` | แก้ | บล็อก export ของใบนี้ต่อท้าย (บล็อกใบอื่นห้ามแตะ) |
| `src/lib/core/settings/defs/rooms.ts` | แก้ (เพิ่มอย่างเดียว · บล็อก `// SVC D.11`) | def ใหม่ 5 ตัว §2.2 + เพิ่มเข้า `PENDING_LEGAL_REVIEW_KEYS` ตาม §2.2 |
| `src/lib/core/permissions.ts` | แก้ 1 บรรทัด | เอา `dorm.latefee.waive` ออกจาก `planned` (มีโค้ดเรียกจริงแล้ว) |
| `src/lib/modules/approval/labels.ts` · `src/lib/modules/approval/actions.ts` | แก้ (เพิ่ม 1 บรรทัดต่อไฟล์) | entityType `dorm.latefee.waive` ป้าย "ยกเว้นค่าปรับจ่ายช้า (หอพัก)" + allowlist สร้างสายอนุมัติ (แบบ D.5) |
| `src/lib/approval-effects.ts` | แก้ (เพิ่มกิ่ง) | `dorm.latefee.waive` อนุมัติ ⇒ `(await import("@/lib/modules/dorm")).applyLateFeeWaiverApproval(...)` · ปฏิเสธ = ไม่ทำอะไร |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` (+ `webhooks/labels.ts` ถ้าไม่ได้จาก spread) | แก้ | event `dorm.bill.overdue` (consumer `withAutomation(async () => {})` · ป้ายไทย) — **ห้ามลง `dorm.bill.paid/partially_paid` (D.10)** |
| `src/lib/platform/minute-jobs.ts` | แก้ | งาน `dorm.dunning` ทุก 5 นาที (import facade ตอนรัน) §5.4 |
| `scripts/fitness.mts` | แก้เฉพาะ `ALLOWED_EDGES` ที่ใช้จริง | คอมเมนต์ `// SVC D.11` |
| «src/components/dorm/OverdueScreen.tsx» | ใหม่ `'use client'` | จอ §7.2 |
| «src/app/app/u/[unitSlug]/dorm/overdue/page.tsx» | ใหม่ (server) | §7.2 |
| «src/app/app/u/[unitSlug]/dorm/overdue/actions.ts» | ใหม่ `"use server"` | §7.3 |
| «src/app/app/u/[unitSlug]/dorm/overdue/[leaseId]/notice/page.tsx» | ใหม่ (server) | หนังสือบอกเลิกพิมพ์ §8 |
| «scripts/svc-qc-overdue-scene.mts» | ใหม่ | ฉากภาพ §10 |

ผู้คุมแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อกท้าย "SVC D.11" (`SQC_VISUAL_SPECS["d.11"]` = `/dorm/overdue` · `SQC_DORM_OVERDUE_SCENE`)

ห้าม: migration · แก้ `calc.ts` `law.ts` `utility.ts` `meter.ts` `lease.ts` `account-bridge.ts` `tax-invoice.ts` `home.ts` (D.13) · แตะ `account/*` (ใช้ facade: `docLinkInfo` `listDocPayments` `docPaymentLedger` `createExternalCreditNote` ผ่านทาง billing.ts — ขาดอะไรเขียนคำขอใน wo-notes) · แตะ `platform/notify-customer.ts` · ส่ง LINE/SMS ทางอื่นนอก `notifyCustomer` · **ฟังก์ชัน/ปุ่ม/ข้อความ ตัดน้ำไฟ ล็อกห้อง ยึดของ เข้าห้อง** · ค่าปรับทบต้น · `any` · `getDay()/getDate()/getMonth()` ดิบ (ใช้ `bkkYmd`/`bkkParts`) · ยิงเงินขนาน (`Promise.all` ครอบใบลดหนี้)

## 2. ศัพท์ · มติ
### 2.1 ศัพท์
- **บิลต้นทาง (S)** = `DormBill` ที่ส่งแล้ว (`accountDocumentId` ไม่ null · สถานะ SENT/PARTIALLY_PAID/PAID) — ค่าปรับเกิดจากบิลต้นทาง
- **บิลปลายทาง (T)** = บิลของสัญญาเดียวกันในรอบที่ `periodKey > S.periodKey` ที่ค่าปรับของ S ไปลง (ลงในบิลที่คำนวณอยู่: DRAFT/HELD เท่านั้น — บิลที่ส่งแล้วไม่ถูกคำนวณใหม่ตาม D.8)
- **ยอดเงินต้นค้าง (principal)** ของ S ณ วัน d = `max(0, ยอดใบแจ้งหนี้ − Σใบลดหนี้ที่มีผล − Σรับชำระที่ไม่ถูกยกเลิกและ paidAt (วันไทย) ≤ d − ยอด LATE_FEE (gross) ในบิล S)` — **รับชำระตัดเงินต้นก่อนค่าปรับ** · ข้อมูลจากบัญชี (`docLinkInfo` + `listDocPayments` + `docPaymentLedger`) **ไม่ใช่** `DormBill.paidSatang/status` (D.10 ยังไม่มา)
- **วันจ่ายครบ (paidDate)** = วันไทยแรกที่ principal = 0 · ยังไม่ครบ ⇒ null
- **วันอ้างอิง (asOf)** = วันออกของรอบปลายทาง (`DormBillRun.issueDate` = วันไทยของ `deps.now` ตอนเตรียม) — เตรียมรอบ DRAFT ใหม่วันอื่น ⇒ asOf ใหม่ (ค่าปรับเปลี่ยนได้ · นับ `changed`)
- **วันสาย** `daysLate` = `(paidDate ?? asOf) − dueDate` (วัน · ≥ 0) · `chargeableDays = max(0, daysLate − graceDays)`

### 2.2 ค่าตั้งใหม่ (ทะเบียนค่าตั้ง · ไม่มีค่าตายตัวในโค้ด)
| คีย์ | ชนิด | ค่าเริ่ม | ชั้น | หมายเหตุ |
|---|---|---|---|---|
| `rooms.lateFee.autoCharge` | bool | `true` | UNIT | ปิด ⇒ ไม่มีค่าปรับอัตโนมัติ (บรรทัดมือ D.8 ยังใช้ได้) · sensitivity MONEY |
| `rooms.lateFee.guardRentBp` | percent (int bp) nullable 0–100,000 | `10_000` (= ค่าเช่า 1 เดือน) | UNIT | **ปิดหนี้ F15/m7**: เพดานกันพิมพ์ผิดเมื่อสัญญาไม่มี `capPerBill` และไม่มีเพดานกฎหมาย · null = ไม่จำกัด · ownerOnly · MONEY · PENDING |
| `rooms.notify.promiseMaxDays` | days 1–90 | `30` | UNIT | นัดจ่ายได้ไกลสุดกี่วันจากวันนี้ |
| `rooms.lease.terminationNoticeDays` | days 15–180 | `30` | UNIT | วันมีผลของหนังสือบอกเลิก = วันออกหนังสือ + ค่านี้ · PENDING (ป.พ.พ. ม.560 ≥ 15 วัน — J3) |
| `rooms.msg.terminationNotice` | template (ผ่าน `tpl(...)` · `TEMPLATE_NO_THREAT`) | ข้อความสุภาพระบบ | UNIT | ตัวแปร `tenantName roomNo unitName landlordName overdueAmount overduePeriods noticeDate effectiveDate` · ไม่มีคำขู่ |
ค่าที่มีอยู่แล้วที่ใบนี้ใช้: `rooms.lateFee.*` (**อ่านจาก `lease.policySnapshot.values`** — CC §1.6) · `rooms.lateFee.waiverApproval` (ค่าปัจจุบันของหน่วย) · `rooms.notify.reminderBeforeDays` `[2, 0]` · `rooms.notify.dunningAfterDays` `[3, 7, 14]` · `rooms.msg.reminder` · `rooms.msg.dunning` · `messaging.quietHours` (#39) · `rooms.vat.taxKinds.LATE_FEE` (ค่าเริ่ม NONE)

### 2.3 มติผู้เขียนข้อสอบ (ส่งผู้คุม · J3/J4)
1. **ไม่มี migration**: ค่าปรับที่ลงบิล = `DormBill.lines` บรรทัด `LATE_FEE` (meta `auto` = JSON) · การยกเว้น = `AuditLog` action `dorm.latefee.waived` (targetType `DormBill` · targetId = บิลต้นทาง) แบบเดียวกับข้อเสนอ R0.3 · คำขออนุมัติ = `ApprovalRequest` entityType `dorm.latefee.waive` entityId = บิลต้นทาง · นัดจ่าย = `AuditLog` `dorm.bill.promise` (แถวล่าสุดชนะ) · ข้อความ = `ServiceMessageLog` · ⚠️ คำถามผู้คุม Q1: อยากได้ตาราง `DormLateFee`/`DormDunning` ในรอบ migration ถัดไปไหม
2. **ค่าปรับคิดจาก snapshot สัญญา** (kind · amount · percentBp · capPerBill · graceDays) — แก้ค่าตั้งหลังทำสัญญาไม่มีผล
3. **ไม่ทบต้น (ป.พ.พ. ม.655 · ค่าปลอดภัย)**: ฐานคิดคือเงินต้นค้างเท่านั้น · ยอดค่าปรับในบิลใดไม่เคยก่อค่าปรับ · บิลที่ค้างเฉพาะค่าปรับ (principal = 0) ⇒ ไม่มีค่าปรับ · PERCENT คิดจากเงินต้นค้าง ณ สิ้นวันผ่อนผัน (`dueDate + graceDays`) ครั้งเดียว
4. **เพดานที่มีผล E(สัญญา)** = ค่าน้อยสุดของที่ไม่ null ใน {`capPerBill` ของ snapshot · `lateFeeCapSatang` ของพารามิเตอร์กฎหมาย (`evaluateLegal("LATE_FEE_CAP")` + `deps.legalParams`)} · ทั้งคู่ null ⇒ `floor(lease.rentSatang × guardRentBp / 10,000)` (ค่าปัจจุบันของหน่วย · null = ไม่จำกัด) · ใช้ 2 ชั้นพร้อมกัน: **ต่อบิลต้นทาง** Σ ค่าปรับอัตโนมัติของ S ทุกบิล ≤ E · **ต่อบิลปลายทาง** Σ `LATE_FEE` (อัตโนมัติ + มือ) ≤ E — ค่าปรับอัตโนมัติ **ตัดให้พอดีเพดาน (clamp)** ไม่บล็อกบิล · ส่วนที่ตัดตามเพดานบิลปลายทางยังลงบิลถัดไปได้ (ภายในเพดานต่อ S) · บรรทัดมือ/ใบเพิ่มหนี้เกิน ⇒ `LATE_FEE_OVER_CAP` (D.8 เดิม)
5. **ค่าปรับลงบิลปลายทางทีละส่วน**: ส่วนที่ลงแล้วไม่ย้อนแก้ · ยังไม่จ่ายตอนเตรียมรอบ ⇒ คิดถึง asOf · จ่ายทีหลัง ⇒ ส่วนเพิ่มลงรอบถัดไป (Σ ≤ E) · สัญญาไม่มีบิลปลายทาง (ENDED/ย้ายออก) ⇒ ไม่ลง (หนี้ D.12 ใบย้ายออก)
6. **ค่าปรับอัตโนมัติเฉพาะบิลที่ออกใบแจ้งหนี้จริง** (`accountDocumentId`) — บิลยกมา/นำเข้าที่ไม่มีใบ ⇒ ไม่มีค่าปรับอัตโนมัติ (ใส่มือได้) แต่ยังเตือน/ทวงได้ (ยอดจาก `totalSatang − paidSatang`)
7. **ยกเว้นทั้งก้อนต่อบิลต้นทาง** (ไม่มียกเว้นบางส่วน · ลดค่าปรับบางส่วน = ใบลดหนี้มือ D.8) · ยกเว้นแล้วถอนไม่ได้ · ถูกปฏิเสธแล้วยื่นซ้ำไม่ได้ (`ALREADY_REJECTED`)
8. **ผลของการยกเว้นตามสถานะ**: ยังไม่ลงบิล ⇒ ไม่เกิดอีก · อยู่ในบิล DRAFT/HELD ⇒ คำนวณบิลนั้นใหม่ทันที (บรรทัดหาย) · อยู่ในบิลที่ส่งแล้ว ⇒ **ใบลดหนี้** ต่อบิลปลายทาง (ref `DormBillAdjust` / `<targetBillId>:waive:<sourceBillId>` · บรรทัด `LATE_FEE` ยอดที่ลงไว้) — `DormBill.lines/totalSatang` ไม่เปลี่ยน (ไม่แก้ทับ) · บิลปลายทางจ่ายครบแล้ว (ใบลดหนี้เกินคงค้าง) ⇒ `ALREADY_PAID` ไม่บันทึกการยกเว้น (คืนเงิน = D.12/บัญชี)
9. **สิทธิ์ยกเว้น** (`rooms.lateFee.waiverApproval` ค่าปัจจุบัน): เจ้าของ (Membership สด) ⇒ ยกเว้นได้ทุกโหมด · `OWNER_ONLY` ⇒ คนอื่น `OWNER_ONLY` · `MANAGER_DIRECT` ⇒ ผู้ถือ `dorm.latefee.waive` ยกเว้นได้เลย · ผู้ไม่ถือ (แต่มี `dorm.bill.run` หรือ `dorm.bill.send`) ⇒ ยื่นขอ · `OWNER_APPROVAL` (ค่าเริ่ม) ⇒ ไม่ใช่เจ้าของ = ยื่นขอเสมอ · ยื่นขอต้องมีนโยบายอนุมัติที่มีขั้น OWNER (ไม่มี ⇒ `NEEDS_APPROVAL` ไม่มีคำขอเกิด · ไม่อนุมัติอัตโนมัติ) · ผลอนุมัติใช้ได้เมื่อผู้ตัดสินขั้นสุดท้ายเป็นเจ้าของสด
10. **เตือน/ทวงหยุดเมื่อยอดค้างทั้งใบ = 0** · ทวงเฉพาะสัญญา ACTIVE/NOTICE (ENDED/CANCELLED ⇒ ไม่ทวงอัตโนมัติ · ทวงมือได้) · ไม่ทวงระหว่างนัดจ่าย (วันนี้ ≤ วันนัด) · **ไม่รัวส่งย้อนหลัง**: เตือนก่อนครบส่งเฉพาะวันนั้น (พลาดแล้วข้าม) · ทวงหลังเลยส่งเฉพาะขั้นล่าสุดที่ถึง (ขั้นก่อนหน้าที่พลาดไม่ส่ง)
11. **ข้อความผ่านแม่แบบเท่านั้น** + ตัวตรวจคำต้องห้ามบนข้อความที่ render แล้วก่อนส่งทุกครั้ง (`findForbiddenTerms`/`TEMPLATE_NO_THREAT`) — แม่แบบที่หลุดเข้าฐาน (เขียนตรง/ค่าเก่า) ⇒ ไม่ส่ง + audit `dorm.dunning.template_blocked` วันละครั้งต่อหน่วย · ไม่มีข้อความอิสระ/AI ร่าง (API.2 เลื่อน)
12. **ค่าปรับ VAT** = `rooms.vat.taxKinds.LATE_FEE` (ค่าเริ่ม NONE) — J4

## 3. ค่าปรับอัตโนมัติ (latefee.ts + จุดเกี่ยวใน billing.ts)
```ts
export type LateFeeCtx = { tenantId: string; actorUserId: string };
type Money = number; // สตางค์
type Fail = { ok: false; code: string; reason: string };   // reason ไทยไม่ว่าง ไม่โทษผู้ใช้ ไม่มีข้อความ Prisma · ห้าม throw
type WaiverStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "APPLIED";
type LateFeeLedgerItem = {
  sourceBillId: string; periodKey: string; dueDate: string; paidDate: string | null; asOf: string;
  principalSatang: Money; principalOutstandingSatang: Money; daysLate: number; chargeableDays: number;
  accruedSatang: Money;            // ตามสูตรของ snapshot ถึง paidDate ?? asOf (ก่อนเพดาน)
  capSatang: Money | null;         // E ของมติ 4
  dueSatang: Money;                // min(accrued, cap) · ยกเว้นแล้ว = 0
  chargedSatang: Money;            // Σ ที่ลงบิล (ไม่ VOID) แล้ว
  charges: { billId: string; periodKey: string; status: string; amountSatang: Money }[];
  waiver: { status: WaiverStatus; requestId: string | null };
  policy: { kind: "NONE" | "PER_DAY" | "ONCE" | "PERCENT"; amountSatang: number; percentBp: number | null; capPerBillSatang: number | null; graceDays: number };
};
lateFeeLedger(ctx, { unitId: string; leaseId: string }, deps?: { now?: Date; legalParams?: Record<string, unknown> })
→ Promise<{ unitId: string; leaseId: string; asOf: string; items: LateFeeLedgerItem[]; totalDueSatang: Money; totalChargedSatang: Money } | null>
```
- items = บิลต้นทางของสัญญาที่เคยเลยกำหนด (daysLate ≥ 1 ตอนจ่ายครบหรือ ณ asOf) เรียงงวด · asOf = วันไทยของ `deps.now` (ค่าเริ่มวันนี้)
- **ในรอบบิล** (billing.ts จุด ก): บิล DRAFT/HELD ของสัญญา L ในรอบ P ⇒ ต่อบิลต้นทาง S ของ L ที่ `S.periodKey < P` (เรียงงวด) และไม่ถูกยกเว้น และ `autoCharge` เปิด: `amount = min(dueSatang(asOf = issueDate ของรอบ P) − chargedSatang(บิลอื่น ไม่นับบิลนี้), ที่ว่างของเพดานบิลปลายทาง)` > 0 ⇒ เข้ารายการ `auto`
  - บรรทัด `LATE_FEE` เดียว (ยอด = มือ + อัตโนมัติ ผ่าน `buildDormBill` `lateFeeSatang`) · `meta.auto` = JSON string ของ `[{ sourceBillId, periodKey, daysLate, chargeableDays, amountSatang, asOf, capped: 0|1 }]` · `meta.manual/src` ของ D.8 คงเดิม
  - ลำดับ/ล็อก: คำนวณค่าปรับของสัญญาใต้ advisory lock ต่อสัญญา `dorm.latefee:<leaseId>` (ชุดเดียวกับการยกเว้น §4) ⇒ เตรียมรอบซ้อน/ยกเว้นพร้อมกัน ไม่ลงซ้ำ ไม่เด้งกลับ
- `prepareBillRun(ctx, input, deps?: { now?: Date; legalParams?: Record<string, unknown> })` — `legalParams` ส่งเป็น `ctx.params` ของ `evaluateLegal` (ทางข้อสอบ/ที่ปรึกษา · production ไม่ส่ง = ค่าเริ่มแพลตฟอร์ม)
- `billRunModel.kpi.lateFeeSatang` = Σ `LATE_FEE` จริง · `getBill().lines` บรรทัด `LATE_FEE` อัตโนมัติ `detail` มี "<เดือนย่อ> <พ.ศ.>" + "ช้า N วัน" (เช่น "ต.ค. 2569 ช้า 4 วัน")
- **บรรทัดมือ** (`setBillExtraLines` · `adjustSentBill` DEBIT `LATE_FEE`): เพดาน = E ของมติ 4 (เพดานกันพิมพ์ผิดจาก `rooms.lateFee.guardRentBp` — ไม่มี "ค่าเช่า 1 เดือน" ตายตัวในโค้ด) · Σ รวมค่าปรับอัตโนมัติที่อยู่ในบิลนั้น ⇒ เกิน `LATE_FEE_OVER_CAP` ไม่มีอะไรเปลี่ยน

## 4. ยกเว้นค่าปรับ (latefee.ts)
```ts
waiveLateFee(ctx, { unitId: string; sourceBillId: string; reason: string }, deps?: { now?: Date })
→ Promise<{ ok: true; status: "WAIVED" | "PENDING_APPROVAL"; created: boolean; requestId: string | null;
            creditNotes: { billId: string; docId: string; amountSatang: Money }[] } | Fail>
applyLateFeeWaiverApproval(input: { tenantId: string; requestId: string; sourceBillId: string })
→ Promise<{ status: "APPLIED" | "ALREADY" | "SKIPPED" | "INVALID"; reason?: string }>
```
- ตรวจ: หน่วย DORM ของร้าน + บิลของหน่วย + Membership สด มี `dorm.view` และ (`dorm.latefee.waive` หรือ `dorm.bill.run` หรือ `dorm.bill.send`) ไม่ผ่าน ⇒ `NOT_FOUND` · เหตุผล < 10 ตัวอักษรจริง (`isValidOutOfScopeReason` เกณฑ์เดียวกัน) ⇒ `REASON_REQUIRED` · บิลไม่เคยเลยกำหนด (จ่ายครบภายในวันครบ หรือยังไม่ถึงวันครบ) ⇒ `NOT_OVERDUE` · `OWNER_ONLY` · `NEEDS_APPROVAL` · `ALREADY_REJECTED` · `ALREADY_PAID` (มติ 8)
- ยกเว้นซ้ำ (มี `dorm.latefee.waived` แล้ว) ⇒ `{ ok: true, status: "WAIVED", created: false }` ไม่มีเอกสาร/audit ใหม่ · ยื่นขอซ้ำ ⇒ requestId เดิม `created: false`
- ยกเว้นจริง (ใน tx ใต้ล็อกสัญญา): audit `dorm.latefee.waived` (after: `{ unitId, leaseId, sourceBillId, reason, approvalId, amountSatang, creditNoteDocIds }`) → บิลปลายทาง DRAFT/HELD คำนวณใหม่ (ยอดรอบอัปเดต) → บิลปลายทางที่ส่งแล้ว ⇒ ใบลดหนี้ (มติ 8 · ทีละใบ · idempotent ต่อ ref) + audit `dorm.bill.adjusted` ของ D.8
- ยื่นขอ: audit `dorm.latefee.waive.requested` (after มี reason) + `submitForApproval({ entityType: "dorm.latefee.waive", entityId: sourceBillId, unitId, requestedById })`
- `applyLateFeeWaiverApproval`: คำขอ APPROVED + ผู้ตัดสินขั้นสุดท้ายเป็นเจ้าของสดของร้าน ⇒ ยกเว้นในนามผู้ตัดสิน (เหตุผล = ของคำขอ) · ซ้ำ ⇒ `ALREADY` · ยังไม่อนุมัติ/ปฏิเสธ ⇒ `SKIPPED` · ไม่ throw
- งานตามเวลา §5.4 กวาดคำขอ APPROVED ที่ยังไม่มี `dorm.latefee.waived` ⇒ เรียก `applyLateFeeWaiverApproval` (ทางสำรองเมื่อ outbox ล้ม)

## 5. เตือน · ทวง (dunning.ts)
### 5.1 บิลที่อยู่ในข่าย
บิลของหน่วย DORM ที่ส่งแล้ว (มีใบ) หรือบิลยกมาที่สถานะ SENT/PARTIALLY_PAID ไม่มีใบ (มติ 6) · ยอดค้างทั้งใบ > 0 (มีใบ = จากบัญชี · ไม่มีใบ = `totalSatang − paidSatang`) · ผู้เช่า = `partyId` ของบิล
### 5.2 ตาราง (ค่าตั้งปัจจุบันของหน่วย · วันไทย)
- **เตือนก่อนครบ**: ทุก d ใน `reminderBeforeDays` ⇒ วันที่ `dueDate − d` เท่านั้น · `messageKey "reminder"` · dedupeKey `rooms:reminder:<billId>:<d>`
- **ทวงหลังเลย**: ขั้น k = ค่ามากสุดใน `dunningAfterDays` ที่ ≤ daysLate (daysLate ≥ 1) ⇒ ส่งขั้น k ถ้ายังไม่เคยส่ง (มติ 10) · `messageKey "dunning"` · dedupeKey `rooms:dunning:<billId>:<k>` · ข้ามเมื่อ: สัญญาไม่ ACTIVE/NOTICE · วันนี้ ≤ วันนัดจ่าย
- vars: `tenantName roomNo unitName period ("ต.ค. 2569") amount (ยอดค้าง "฿5,486.00") dueDate ("5 พ.ย. 2569") payLink daysLate` · `notifyCustomer(ctx, { unitId, domain: "rooms", messageKey, partyId, vars, dedupeKey, at: now })` — เวลาเงียบ/OA/ยินยอม/QUOTA/dedupe = ของ R0.7 (SKIPPED_QUIET ⇒ รอบหลังในวันเดียวกันส่งต่อด้วยคีย์เดิม)
- ก่อนเรียก: render แม่แบบ (`renderTemplate`) แล้วตรวจคำต้องห้าม (มติ 11) ⇒ พบ = ไม่เรียก `notifyCustomer` · ไม่มีแถว `ServiceMessageLog`
### 5.3 ทวงมือ
```ts
sendDunningNow(ctx, { unitId: string; billId: string }, deps?: { now?: Date })
→ Promise<{ ok: true; status: "SENT" | "SKIPPED_CONSENT" | "SKIPPED_QUIET" | "NO_CHANNEL" | "FAILED" | "SENDING"; channel: "LINE" | "SMS" | "NONE"; duplicate: boolean } | Fail>
```
- สิทธิ์ `dorm.bill.send` (ไม่มี ⇒ `NOT_FOUND`) · บิลยังไม่เลยกำหนด/ค้าง 0 ⇒ `NOT_OVERDUE` · แม่แบบผิด ⇒ `TEMPLATE_BLOCKED` · dedupeKey `rooms:dunning:<billId>:m<YYYYMMDD>` (วันละครั้งต่อบิล · กดซ้ำ = `duplicate: true`) · ไม่ข้ามเวลาเงียบ · สัญญาสถานะใดก็ได้
### 5.4 งานตามเวลา (`minute-jobs` ชื่อ `dorm.dunning` · ทุก 5 นาที)
```ts
runDormDunningJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number })
→ Promise<{ reminders: number; dunning: number; overdueEvents: number; waiversApplied: number; failedUnits: number }>
```
- ทำ: §4 คำขออนุมัติค้าง → §9 event → §5.2 เตือน/ทวง · นับเฉพาะของใหม่ในรอบนี้
- **ข้ามร้านไม่แย่งคิว** (บทเรียน D.8 F4/F19): ไล่หน่วยตามลำดับที่ยุติธรรม (หน่วยที่ล้มล่าสุด/ทำนานสุดไปท้าย) · ต่อหน่วยไม่เกิน 200 บิลต่อรอบ · หน่วยหนึ่งพัง (throw/แม่แบบผิด) ⇒ จดแล้วไปหน่วยถัดไป (`failedUnits`) · เคารพ `budgetMs`
- **ซ้อนกัน 2 รอบ / หลายโพรเซส (X5)** = ข้อความ 1 แถวต่อคีย์ · event 1 ต่อบิล · ใบลดหนี้ยกเว้น 1 ต่อบิลปลายทาง · ไม่มี throw · `opts.tenantId` จำกัดร้าน (ข้อสอบ)

## 6. นัดจ่าย (dunning.ts)
```ts
setPaymentPromise(ctx, { unitId: string; billId: string; promiseDate: string | null; note?: string | null }, deps?: { now?: Date })
→ Promise<{ ok: true; promiseDate: string | null } | Fail>
```
- สิทธิ์ `dorm.bill.send` · บิลต้องมียอดค้าง > 0 (ไม่งั้น `NOT_OVERDUE`) · `promiseDate` YYYY-MM-DD ที่ ≥ วันนี้ไทย และ ≤ วันนี้ + `promiseMaxDays` ⇒ ไม่งั้น `INVALID_INPUT` · null = ยกเลิก · บันทึก audit `dorm.bill.promise` (after `{ billId, promiseDate, note }`) · มีผลกับ "ทวง" เท่านั้น (ไม่หยุดค่าปรับ)

## 7. จอ "ค้างชำระ · ทวง · ค่าปรับ"
### 7.1 โมเดล
```ts
overdueModel(ctx, { unitId: string }, deps?: { now?: Date }) → Promise<OverdueModel | null>   // ต้อง dorm.view + money (dormAccess) ไม่งั้น null
type OverdueModel = {
  unitId: string; unitName: string; asOf: string;
  kpi: { count: number; outstandingSatang: Money; lateFeeDueSatang: Money; promised: number };
  rows: { billId: string; leaseId: string; roomNumber: string; tenantName: string; periodKey: string; dueDate: string; daysLate: number;
          outstandingSatang: Money; principalOutstandingSatang: Money; hasDoc: boolean;
          lateFee: { dueSatang: Money; chargedSatang: Money; waiver: WaiverStatus };
          dunning: { count: number /* แถวทวงที่จบแล้วทุกสถานะ */; delivered: number /* SENT */; lastAt: string | null };
          promiseDate: string | null }[];       // บิลที่ daysLate ≥ 1 และค้าง > 0 · เรียงเลขห้องแล้วงวด
  can: { dun: boolean; waive: boolean; requestWaive: boolean; promise: boolean; notice: boolean };
};
```
### 7.2 จอ (ภาพอ้างอิง 06 การ์ด "ค้างจาก ต.ค." + ตาราง · ไม่มีจออนุมัติเฉพาะของใบนี้ — มติ Q2 ผู้คุม)
- «page.tsx» server: `requireUnit` · DORM · `dormAccess(<membership>, unit.id)` ต้อง `.board` และ `.money` ไม่งั้น `notFound()` · `overdueModel` ผ่าน facade · ส่ง `<OverdueScreen model unitSlug actions={{ dun, waive, promise }} />`
- «OverdueScreen.tsx» `'use client'` บรรทัดแรก · default export · ไม่ import prisma/โมดูล server/actions/`next/*` (เฉพาะ `import type`) · ลิงก์ `<a>` · `renderToStaticMarkup` ได้
- DOM (ข้อสอบ U ผูก): ตัวห่อ `data-overdue` + `data-as-of` · หัว "ค้างชำระ" · KPI `data-overdue-kpi="count|outstanding|lateFee"` (เงินรูป "฿10,200.40") · แถว `data-overdue-row="<เลขห้อง>"` + `data-period` + `data-days-late` · เซลล์ `data-col="outstanding|lateFee|dunning|promise"` · ทวง: "ส่งเตือนแล้ว N ครั้ง" (N = delivered) · ยกเว้นแล้ว "ยกเว้นแล้ว" · รออนุมัติ "รออนุมัติ" · ปุ่ม `data-dunning-send="<billId>"` (can.dun) · `data-latefee-waive="<billId>"` (can.waive) หรือ `data-latefee-request="<billId>"` (can.requestWaive) · `data-promise="<billId>"` (can.promise) · ลิงก์ `data-notice="<leaseId>"` `<a href=".../dorm/overdue/<leaseId>/notice">` (can.notice) · **ไม่มีคำต้องห้าม สคบ. · ไม่มีเบอร์โทร** · ไม่มีปุ่มใดเกี่ยวกับน้ำไฟ/ห้อง
### 7.3 actions.ts (`"use server"` · export async function เท่านั้น)
`sendDunningNowAction` `waiveLateFeeAction` `setPaymentPromiseAction` — ทุกตัว `requireUnit` + DORM · ร้าน/ผู้กระทำจาก session (ไม่รับ `tenantId`/`actorUserId` จาก input)

## 8. หนังสือบอกเลิกสัญญาจากแม่แบบ (พิมพ์เท่านั้น · ไม่ส่ง)
```ts
terminationNotice(ctx, { unitId: string; leaseId: string }, deps?: { now?: Date })
→ Promise<{ ok: true; textTh: string; noticeDate: string; effectiveDate: string; overdue: { billId: string; periodKey: string; outstandingSatang: Money }[]; totalOutstandingSatang: Money } | Fail>
```
- สิทธิ์ `dorm.lease.manage` + money ⇒ ไม่งั้น `NOT_FOUND` · ไม่มีบิลเลยกำหนดค้าง ⇒ `NOT_OVERDUE` · `effectiveDate = noticeDate + terminationNoticeDays` · render `rooms.msg.terminationNotice` แล้วตรวจคำต้องห้าม ⇒ พบ `LEGAL_BLOCK` · audit `dorm.lease.termination_notice` (ids + วันที่) · หน้า «notice/page.tsx» ด่านเดียวกับหน้า + พิมพ์ A4

## 9. event `dorm.bill.overdue`
- ครั้งเดียวต่อบิล เมื่อ daysLate ≥ 1 และค้าง > 0 (งานตามเวลา) · `emitOutbox` `idempotencyKey = "dorm.bill.overdue:<billId>"` · `unitId` ของแถว = หน่วย
- payload **ตรง 7 คีย์** `{ unitId, billId, leaseId, periodKey, dueDate, outstandingSatang, daysLate }` — ไม่มีชื่อ/เบอร์/อีเมล

## 10. ฉากภาพ «scripts/svc-qc-overdue-scene.mts»
- `loadSvcQcEnv("svc-qc-overdue-scene")` · ต้องมีฉาก D.13 (บิลค้างงวด PP ห้อง 106 · 305 ตาม `SQC_DORM_HOME_SCENE.prevUnpaid`) · ร้าน svcqc หอ
- ใส่ `ServiceMessageLog` สถานะ SENT ของขั้น `SQC_DORM_OVERDUE_SCENE.steps` (3 · 7 · 14) ให้ทั้ง 2 บิล (dedupeKey ตาม §5.2 · ⇒ "ส่งเตือนแล้ว 3 ครั้ง") · ไม่ส่งข้อความจริง
- idempotent `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` (รันซ้ำ 0/0/0) · `--clear` ลบเฉพาะแถวของฉาก

## 11. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.11.mts»
S โครงสร้าง 15 · PC positive control 6 · W ยกเว้น/อนุมัติ 12 · F ค่าปรับรอบ พ.ย. 12 · N เงิน/GL 3 · R ค่าปรับรอบ ธ.ค. (ส่วนเพิ่ม · ไม่ทบต้น · เพดาน 2 ชั้น) 6 · M บรรทัดมือ/เพดานกันพิมพ์ผิด 4 · D เตือน/ทวง 13 · O event 2 · T หนังสือบอกเลิก 3 · J งานรอบบิลซ้อน 2 · U จอ 5 · X ข้ามร้าน/สิทธิ์สด 7 · Q ฉาก 3 · V ภาพ 1 · Z ล้าง 1 · G regression 5 = **100 ข้อ** · ฟังก์ชันขาด = FAIL ไม่ใช่ SKIP · สถานะสะสม (ข้อหลังใช้ผลข้อก่อน)
- ฉากเงิน (ร้าน A · หน่วยไม่มีน้ำไฟ · สัญญา 16 ห้อง ค่าห้อง 450,000 + ส่วนกลาง 30,000): รอบ ต.ค. (ครบ 5 ต.ค.) ส่งผ่าน D.8 → รับชำระผ่าน `recordExternalPayment` (paidAt) → รอบ พ.ย. (เตรียม 25 ต.ค.) → รอบ ธ.ค. (เตรียม 26 พ.ย.) · ห้อง 101 จ่ายช้า 4 วันผ่อนผัน 0 ⇒ **฿200** (README "ปรับช้า ต.ค. 4 วัน") · ตัวเลขคาดหวังเทียบ `lateFee`/`buildDormBill` ของ D.1
- ฉากงานรอบบิลซ้อน (ร้าน B · J): รอบ ต.ค. ส่งแล้ว ค้าง 2 ห้อง ⇒ `runDormBillingJobs` 25 ต.ค. ซ้อน 3 ทาง ⇒ ค่าปรับลงบิล พ.ย. ครั้งเดียว (⚠️ ด่านน้ำไฟ D.7 จำกัดงวด ≤ เดือนหน้าตามนาฬิกาจริง ⇒ ฉากที่เตรียมรอบงวดน้ำไฟเกินเดือนหน้าจริงจะติด `UTILITY_GATE_BLOCKED`)
- ฉากข้อความ (ร้าน C): รอบ ธ.ค. ครบ 5 ธ.ค. · งาน 3 ธ.ค. (เตือน 2 วัน) · 5 ธ.ค. 00:30 (เงียบ) → 08:05 · 6 ธ.ค. (event) · 8 ธ.ค. (ทวง +3) · 20 ธ.ค. (+14 เท่านั้น) · นัดจ่าย · สัญญาจบ · แม่แบบมีคำต้องห้าม
- positive control (เขียวก่อนมีงาน): PC-1 `lateFee` D.1 · PC-2 `evaluateLegal LATE_FEE_CAP` + params · PC-3 รอบ ต.ค. ผ่าน D.8 บนหน่วยไม่มีน้ำไฟ · PC-4 `recordExternalPayment` paidAt ถึงสมุด · PC-5 `notifyCustomer` dedupe · PC-6 เครื่องยนต์ค่าตั้งบล็อกแม่แบบ "ตัดไฟ"

## 12. regression · X · ส่งต่อ · หนี้
- G (หลังล้างข้อมูล): `qc-svc-d.8 --no-regression` · `qc-svc-d.3 --no-regression` · `qc-svc-d.2` · `qc-svc-d.13 --no-regression` · `qc-svc-smoke` · typecheck (ISO_MEM=9000M · heap 7168) · fitness 2 โหมด
  - ⚠️ d.8 **S-7** ("ไม่ลง dorm.bill.overdue ล่วงหน้า") แดงโดยตั้งใจหลังใบนี้ ⇒ G-1 ยอมเฉพาะ S-7 · **ขอ ORACLE-EDIT d.8 S-7** (ตรวจ overdue เฉพาะก่อนมี `dunning.ts` แบบ S-6)
- X: X1 (X-*) · X3 (F-12 W-4 W-7) · X4 (approval-effects ซ้ำ = `ALREADY`) · X5 (J-1 J-2 D-2 D-6 W-9) · X8 (O-2 payload · ไม่มีเบอร์ในจอ) · X9 (ยกเว้น: เหตุผล + อนุมัติ + audit) · ไม่เกี่ยว: X6 (ไม่มีนำเข้า/CSV) · X7 (ไม่มี endpoint สาธารณะ) · X10 (ไม่มีไฟล์)
- ส่งต่อ: **D.9** ลิงก์จ่าย/พอร์ทัลใน `payLink` + `notifyCustomer` ของบิล · **D.10** `DormBill.paidSatang/status` (ตอนนี้อ่านบัญชีตรง) · **D.12** ค่าปรับค้างของสัญญาที่ไม่มีบิลปลายทาง (มติ 5) + คืนเงินกรณี `ALREADY_PAID` · **D.13** ลิงก์ "ค้างจ่าย → ทวง" ในหน้าแรก/แท็บหอ ชี้ `/dorm/overdue` (ใบนี้ไม่แตะ home/แท็บ) · **D.19** รายงานจ่ายช้าซ้ำ · **API.2** AI ร่างข้อความทวง
- หนี้ที่รู้: ยกเว้นบางส่วนไม่มี (มติ 7) · สถานะเก็บใน AuditLog (มติ 1 · Q1) · ทวงทาง SMS ยังไม่มี (S.1)

- ข้อที่เขียวก่อนมีงาน (ต้องคงเขียว): PC-1..6 · S-14 · R-5 · R-6 · M-1 · N-3 · D-12 · J-2 · Z-1 (R-5/R-6/D-12/J-2 เป็นข้อ invariant — เขียวแบบว่างก่อนมีค่าปรับ · มีความหมายเมื่อ F/R เขียว)

## มติผู้คุม (30 ต.ค.)
- Q1: ไม่มี migration ในใบนี้ (migration ทำได้เฉพาะ R0.1/B.0/D.0) · ตาราง DormLateFee/DormDunning เป็นข้อเสนอรอบ migration ถัดไป (หนี้)
- Q2: ยอมรับภาพ 06 (การ์ด "ค้างจาก ต.ค." + ตาราง) เป็นแบบอ้างอิง PARITY ของ /dorm/overdue · ถ่ายภาพจริงให้เจ้าของดูตอนปิดเฟส
- ORACLE-EDIT d.8 S-7 แล้ว (dorm.bill.overdue เป็นของ D.11 เมื่อมี dunning.ts)
- หนี้ D.13: ลิงก์ "ค้างจ่าย → ทวง" หน้าแรก/แท็บหอ ชี้ /dorm/overdue (ทำตอน D.13 ต่อ/ปิดเฟส)
- คำถามกฎหมาย/บัญชี §12 ลง ledger/wo-notes/svc-legal-questions.md แล้ว
