# M3.8 — รายงานสมาชิก · โน้ตผู้ทำ

> builder: Opus 5 · 11 ก.ย. 2569 · worktree `shark-member` (โหมดขนานกับ M3.7) · ข้อสอบ `scripts/qc-member-m3.8.mts` (ไม่ถูกแตะ) · **ไม่มี migration**

## 1. ไฟล์ที่ส่งมอบ

**เอนจิน / ไฟล์บริสุทธิ์ / action (ใหม่)**
- `src/lib/modules/member/reports.ts` — `overview` · `rfm` · `tiers` · `points` · `promotions` · `sources` · `cohort` · `exportCsv` · `getReportSchedule` · `setReportSchedule` · `runScheduledReports` (+ ชนิด `ReportEmailRequest`/`ReportEmailSender`)
- `src/lib/modules/member/reports-shared.ts` — ไฟล์บริสุทธิ์: แท็บ 7 + ป้ายไทย · ทะเบียน RFM 9 กลุ่ม (key/label/description) · `quintileScores` · `rfmSegmentOf` · รูปคืนค่าทุกรายงาน · `ReportSchedule` + ค่าปริยาย · `ReportActionResult` · ตัวช่วยเดือน/วันไทย (`thaiMonthKey` `thaiDateKey` `thaiHour` `monthKeysBack` `thaiMonthStart` `addMonthKey`) · ตัวจัดรูปเงิน/ตัวเลข
- `src/lib/modules/member/reports-actions.ts` (`"use server"` · export เฉพาะ async function) — `exportReportCsvAction` (member.report.view) · `saveReportScheduleAction` (member.settings.manage) · ด่าน `assertCan` ตรง ๆ เมื่อไม่มีคีย์

**หน้าจอ (ใหม่)**
- `src/app/app/sys/[id]/member/reports/page.tsx` — `?tab=overview|rfm|tiers|points|promotions|sources|cohort` · requireTenant + `member.report.view` (ไม่มี = 404) · ปุ่มตั้งเวลาเห็นเฉพาะคนที่มี `member.settings.manage`
- `src/components/member/ReportTabs.tsx` (server) · `ReportOverview.tsx` (KPI 6 + กราฟแท่ง div `ReportBars`) · `ReportRfmGrid.tsx` (กริด 3×3 + ตารางสรุปแท็บ RFM) · `ReportCards.tsx` (การ์ดระดับ/แต้ม/โปรโมชัน + โหมด `detailed` ของแท็บตัวเอง) · `ReportTables.tsx` (ช่องทางที่มา · cohort) · `ReportActions.tsx` (**client เดียว** — ส่งออก CSV + โมดัลตั้งเวลา · import เฉพาะ `reports-shared` + `reports-actions` · grep แล้ว)

**Edit เฉพาะจุด (อ่านใหม่ก่อนแก้ทุกครั้ง · ไม่แตะบรรทัดของ M3.7)**
- `src/lib/modules/member/journeys.ts` — **additive**: export ใหม่ `journeyReportRows(ctx, actor, { days, now })` + ชนิด `JourneyReportRow` (เรียก `computeStats` เดิม · อ่านอย่างเดียว ไม่เขียนแคช `journeyStats` · รับ `now`) — `journeyStats` เดิมไม่แตะ · m3.3 32/32
- `src/lib/modules/member/index.ts` — ท้ายไฟล์: `reportOverview` `reportRfm` `reportTiers` `reportPoints` `reportPromotions` `reportSources` `reportCohort` `exportReportCsv` (= exportCsv) `getReportSchedule` `setReportSchedule` `runScheduledReports` + ชนิด
- `src/lib/modules/member/nav.ts` — `reports` → `ready` (ตัด `wo`) · drawer + แถบแท็บซ่อนหมวดนี้จากคนที่ไม่มี `member.report.view` (ไม่งั้นธนาเห็นแท็บที่กดแล้ว 404)
- `src/lib/platform/cron.ts` — step `memberReportsEmail(now)` (dynamic import `member/reports` แบบเดียวกับ `notificationsDue`)
- `src/app/api/cron/hourly/route.ts` — เรียก `memberReportsEmail` ทุกชั่วโมง · field `memberReportsSent`

## 2. ผลการทดสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m3.8` (ตัวจริง ไม่แตะ) | **0/1 → M3.8-ERR** — ข้อสอบตายที่บรรทัด 64 ก่อนถึงข้อแรก (บั๊กข้อสอบ §3.1) |
| สำเนาชั่วคราวที่ลบ `netSatang: true` ออกจาก select บรรทัด 64 **จุดเดียว** (`scripts/.qc38-local.mts` · ลบแล้ว) | **16/18** ×2 รอบ — เหลือ S11.2 (ภาพ) + S11.3 (PARITY) ของผู้คุมงาน · perf S10.1 วัดเอง: overview 24 ms · rfm 21 ms · cohort 11 ms · promotions 21 ms (เพดาน 800) |
| `pnpm exec tsc --noEmit` | ✅ 0 error |
| `fitness.mts` มี env / ไม่มี env | ⚠️ 25/26 · 25/26 — ตกข้อเดียว **F2.1 `member→account` จาก `member/history.ts` ของ M3.7** (งานค้างของอีกใบ · ไฟล์ของใบนี้ไม่มี import ข้ามโมดูลใหม่: reports.ts import เฉพาะไฟล์ในโมดูลสมาชิก + `core/email`/`core/origin` แบบ dynamic) |
| `qc-member-m3.3` | ✅ 32/32 |
| `qc-member-m3.2` | ✅ 27/27 |
| `qc-member-m3.1` | ✅ 20/20 |
| `qc-member-m1.8` | ✅ 15/15 |
| `qc-member-m2.1` | ✅ 30/30 (รอบแรก 29/30 — S2.1 ตกที่ "ไม่มี PointLedger ของสมาชิกคนที่ 1 ใน 60 วินาทีล่าสุด" เพราะ QC run ของอีกใบเขียนแต้ม REFERRAL 11:33:42 UTC พอดี · รันซ้ำผ่าน · ใบนี้ไม่แตะ point/) |
| `qc-member-m1.3` (nav 9 หมวด · แตะ nav.ts) | ✅ 14/14 |
| `qc-nav-functions` | ✅ 11/11 |
| grep `'use client'` | client ใหม่ตัวเดียว `ReportActions.tsx` → react · next/navigation · MemberIcon · reports-actions ("use server") · reports-shared (บริสุทธิ์) |
| ของค้างบน QC | ไม่มี — journey ชั่วคราวที่สร้างลองแถวโปรโมชันถูกลบใน finally (MEMBER_JOURNEY เหลือ 0) · schedule ถูกข้อสอบคืนค่าเดิม |

## 3. ข้อแย้งข้อสอบ (หลักฐาน) — ผู้คุมงานตัดสิน

### 3.1 🔴 บรรทัด 64 select `netSatang` ซึ่ง `PosSale` ไม่มี ⇒ ข้อสอบตายก่อนข้อแรกทุกครั้ง
```
Unknown field `netSatang` for select statement on model `PosSale`. Available options are marked with ?.
    at async <anonymous> (scripts/qc-member-m3.8.mts:64:17)
  ❌ [M3.8-ERR] ข้อสอบรันจนจบ
🔴 M3.8: 0/1
```
`prisma/schema/pos.prisma` model PosSale มีแค่ `subtotalSatang` `discountSatang` `vatSatang` `grandTotalSatang` (ไม่มี net) · ใบนี้ห้าม migration · ตัว `amt()` ของข้อสอบ fallback เป็น `grandTotalSatang` อยู่แล้ว ⇒ **แก้ที่เสนอ**: ลบ `netSatang: true, ` ออกจาก select บรรทัด 64 (ไม่ต้องแตะที่อื่น) — สำเนาที่แก้จุดนี้จุดเดียวได้ 16/18

## 4. ข้อตัดสินของ builder (จุดที่สัญญาไม่ชัด)

1. **ยอดเงิน = `grandTotalSatang`** (PosSale ไม่มี net — ดู §3.1) · หน้าต่าง `months` ของ overview = `round(months × 365 / 12)` วัน (12 → 365 ตรงข้อสอบ)
2. **สมาชิก = `Customer` ของระบบนี้ที่ status ≠ MERGED** ทุกรายงาน · นับจำนวน/สมาชิกใหม่ตามเดือนไม่กรอง `createdAt ≤ now` (seed มีคนสมัครวันที่ในอนาคต 2026-09-23 — ข้อสอบนับเข้าเดือนนี้) · ส่วน "บิล" ไม่นับ `createdAt > now` ตามสัญญา
3. **ไม่มี N+1 / ไม่ส่งรายชื่อ id ยาวเข้า SQL**: บิลรวมด้วย `posSale.groupBy(memberId)` คำสั่งเดียว (กรอง memberId ไม่ว่าง แล้วคัดสมาชิกของระบบในหน่วยความจำ) · แต้มคงค้างผ่าน relation `pointBalance.customer` · แต้มรายเดือน/ cohort จัดกลุ่มเดือนไทยด้วย `$queryRaw` คำสั่งเดียว (`createdAt + 7 ชม.` · พารามิเตอร์เวลาส่ง ISO แล้วแปลง `AT TIME ZONE 'UTC'` เอง ไม่ขึ้นกับ TimeZone ของ session)
4. **active90d** = มีบิล PAID ใน [now−90, now] **หรือ** `lastActivityAt` ในช่วงเดียวกัน
5. **RFM**: ป้าย `label` ใช้ชื่อตามภาพ/หัวข้อสอบ (Champions … Lost — ภาพ 25 เป็นอังกฤษ) · คำอธิบายไทยอยู่ `description` · ผัง 3×3 + เฉดสีเป็นเรื่องหน้าจอ (อยู่ใน `ReportRfmGrid.tsx` · หมึก `--color-ink` ผสมขาว — ไม่มี hex) · คะแนนควินไทล์ + กติกาจัดกลุ่มตามหัวข้อสอบเป๊ะ (`reports-shared.ts`)
6. **tiers**: ทุกระดับที่ยังไม่ archive (+ ระดับที่ archive แต่ยังมีคน) เรียง `sortOrder` · คนที่ `tierDefId` ว่าง/ชี้ระดับนอกระบบ รวมเป็นแถว "ยังไม่มีระดับ" (ผลรวมต้องเท่าจำนวนสมาชิกเสมอ — QC ไม่มีแถวนี้) · `avgSpend12mSatang` = ยอดบิล PAID 365 วันของคนในระดับ ÷ จำนวนคนในระดับ (ปัดลง · คิดสด ไม่ใช้แคช `spent12mSatang`)
7. **points**: มูลค่าแต้ม = `PointSettings.burnRateSatang` (ร้านไม่มีแถว = 10 ตามค่าปริยาย schema · อ่านอย่างเดียว ไม่สร้างแถวแบบ `getSettings`)
8. **promotions**:
   - **ROI ของรายงาน = ยอดที่เกิด ÷ ต้นทุน (เท่า)** ตามหัวข้อสอบ `totals.roi = sale/cost` + ภาพ 25 ("31.6×") · ต้นทุน 0 = `null` ("—") — ⚠️ ต่างจากหน้า journey (`(sale−cost)/cost`) และหน้าแคมเปญ (`(sale−cost)/max(cost,1)`) · หน้าจอรายงานใส่ "×" กำกับ + บรรทัดอธิบาย
   - journey: ตัวเลขชุดเดียวกับ journeyStats ในหน้าต่าง `days` (ปริยาย 90) + **ต้นทุนแต้ม GIVE_POINTS = แต้ม × burnRateSatang** (PointLedger refType JOURNEY → refId = AutomationRun.id → ruleId) ⇒ **ปิดหนี้ M3.3 ข้อ 6 ที่รายงาน** (journeys.ts ไม่ต้องรู้มูลค่าแต้ม) · `pointsCostSatang` แยกให้เห็นในแถว
   - แคมเปญ: โมดูลสมาชิก import การตลาดไม่ได้ (F2 ไม่มีเส้น member→marketing) ⇒ อ่านผลที่ `campaignStats` บันทึกไว้ใน `CampaignVariantStat` (อัปเดตตอนส่ง/ยกเลิก/มีคนใช้สิทธิ์/เปิดหน้า) + จำนวนคนกลุ่มเทียบจาก `MktRecipient` · ผลสะสม**ตลอดอายุแคมเปญ** (ข้อสอบนับทุกใบของระบบ ไม่กรองช่วง) · ยอด/ต้นทุน/ใช้สิทธิ์รวมทุก variant แบบ `listCampaignsV2`
   - `upliftPct` = % ใช้สิทธิ์ของคนที่ได้รับ − % ของกลุ่มเทียบ (ทศนิยม 1) · ไม่มีกลุ่มเทียบ = `null`
9. **sources**: นับตาม `Customer.source` (ช่องทางที่บันทึกตอนสมัคร) ของคนที่สมัครใน [now−90, now] ตามข้อสอบ — ต่างฐานจาก M1.8 `reportBySource` (first-touch attribution) · `firstPurchases` = คนกลุ่มนั้นที่มีบิล PAID แล้ว ≥ 1 ใบ · `costPerMemberSatang` = ค่าใช้จ่ายของลิงก์ที่มา (AcquisitionLink.costSatang) ช่องทางเดียวกันที่สร้างในช่วง ÷ จำนวนคน · ป้ายที่ไม่มีอักษรไทย (LINE OA/LIFF/CRM/API) เติม "ช่องทาง " นำหน้า · source ว่าง = "ไม่ระบุช่องทาง"
10. **cohort**: สมาชิกที่สมัครเดือนไทย M · `retained[k]` สำหรับเดือน M+k ที่ไม่เลยเดือนของ now (k < months) · กลุ่มว่าง = 0
11. **CSV**: BOM + `\r\n` · เงินเป็นบาททศนิยม 2 (ไม่มีจุลภาคหลักพัน) · ค่าที่มี `,` `"` ขึ้นบรรทัด ครอบ `"` · overview = หัวข้อ/ค่า 10 แถว + แถวหัว "เดือน,สมาชิกใหม่ต่อเดือน (คน)" + 12 เดือน · rfm = หัว + 9 แถวพอดี · tab ไม่รู้จัก = MemberInputError ไทย
12. **schedule** (`settings.member.reports.schedule`): อีเมลตัดช่องว่าง/ตัวพิมพ์เล็ก/ไม่ซ้ำ ≤ 5 · hour ว่าง = คงค่าเดิม · tabs ต้อง ⊆ 7 และ ≥ 1 · เปิดส่งต้องมีอีเมล ≥ 1 · `getReportSchedule(ctx)` ไม่ตรวจสิทธิ์ (ตามลายเซ็นในสัญญา) — หน้าจอเรียกเฉพาะคนที่มี settings.manage
13. **runScheduledReports**: ค้นเฉพาะระบบที่ `schedule.enabled = true` ด้วย JSON path filter · ส่งเมื่อชั่วโมงไทย ≥ hour และ lastSentDate ≠ วันไทย · **จองวันก่อนส่งด้วย compare-and-set บน `AppSystem.updatedAt`** (cron ซ้อน/รีทรายไม่ส่งซ้ำ) · ส่งพัง = คืน lastSentDate เดิมให้รอบถัดไปลองใหม่ · actor ของ cron = OWNER ระบบ (สิทธิ์ตรวจแล้วตอนบันทึก) · คืน `{ sent, skipped, failed }`
14. **อีเมลจริง**: ผ่าน `core/email.sendEmail` (dynamic import) ทีละผู้รับ · ตัวส่งเดิมยังไม่รองรับไฟล์แนบ ⇒ เนื้อความ = KPI สรุป + ชื่อไฟล์ CSV + ลิงก์หน้ารายงาน (ข้อสอบฉีด `deps.email` ได้ attachments CSV ครบ)
15. **สิทธิ์/หน้าจอ**: รายงานเป็นระดับร้าน (ไม่กรองสาขาของผู้ดู — `member.report.view` เป็นคีย์ระดับผู้จัดการ · สัญญาไม่ได้ระบุ) · แท็บภาพรวม = แดชบอร์ดภาพ 25 · แท็บอื่นโหลดเฉพาะรายงานของแท็บนั้นเป็นตารางเต็ม · การ์ดโปรโมชันบนภาพรวมโชว์ journey 5 อันดับยอดสูงสุด ("ROI ต่อ journey" ตามภาพ)

## 5. หนี้ / เรื่องที่ยังค้าง

1. `core/email.sendEmail` ส่งได้แค่ข้อความ — ควรเพิ่ม `attachments` (Resend รองรับ `attachments: [{ filename, content(base64) }]`) แล้วสลับ `defaultEmailSender` ใน `reports.ts` ให้แนบ CSV จริง (จุดเดียว)
2. `journeys.computeStats` ไม่มีขอบบน `≤ now` ของ run/บิล ⇒ `promotions({ now: อดีต })` ยังนับของหลัง now (now ปัจจุบันไม่มีผล) — แก้ได้ใน computeStats แต่ใบนี้เลือกไม่แตะของเดิม
3. ต้นทุน voucher ของแคมเปญมาจาก `marketing.collectStats` ซึ่งใช้ `voucher.value` ทุกชนิด — voucher แบบ PERCENT ถูกนับเป็น "10 สตางค์" (ค่า %) แทนส่วนลดจริง (บั๊กเดิม M3.2 · รายงานรับค่าต่อ)
4. ROI 3 นิยามในระบบ (รายงาน = เท่า · journey = กำไรต่อทุน · แคมเปญ = กำไรต่อทุน กันหารศูนย์) — ควรรวมเป็นนิยามเดียวหรือใส่หน่วยทุกหน้า
5. REST/AI op ของรายงาน (`reports.*`) → M3.10
6. ร้านที่มีระบบ MEMBER > 1,000 ระบบที่เปิดส่งพร้อมกัน — `runScheduledReports` หยิบรอบละ 1,000 (ส่วนเกินได้รอบชั่วโมงถัดไป)

## 6. ข้อมูลสำหรับถ่ายภาพ (harness 3.8 มีสเปคแล้ว · ไม่ต้องเตรียมข้อมูลเพิ่ม)

- ตัวเลขบน QC ตอนนี้ (owner · now 11 ก.ย.): สมาชิก 60 (+7 เดือนนี้) · ยอดขาย 12 เดือน ฿1.3M (100% ของยอดร้าน) · เฉลี่ย/คน ฿21,500 · อัตรารักษา 100% · แต้มคงค้าง 53,420 (≈ ฿5,342 หนี้สิน) · ต้นทุนโปรโมชันเดือนนี้ ฿0 · สมาชิกใหม่ 12 เดือน 4/4/5/4/4/5/4/4/5/4/4/7
- RFM บน seed: มีแค่ **Loyal 36 · At risk 24** (seed ทุกคนมี 2 บิล ⇒ F = 5 ทุกคน · R แยก 3 ระดับ) ช่องอื่น 0 — กริดยังครบ 9 ช่องตามภาพ
- ระดับ: สมาชิก 29 · Silver 16 · Gold 10 · Platinum 5 (ชิปสี SLATE/BLUE/AMBER/PURPLE) · แต้ม: มีแค่เดือน ก.ย. (53,420 ออก) ⇒ แท่ง 5 เดือนแรกเป็นเส้นฐาน
- โปรโมชัน: QC **ไม่มี journey/แคมเปญ** ⇒ การ์ดขึ้นข้อความว่าง "ยังไม่มี journey ในระบบนี้ — ไปหน้า Journey อัตโนมัติ" (ไม่ใส่ข้อมูลปลอม) · ถ้าอยากเห็นแถวตามภาพ ให้รัน TMP33 (journey สำเร็จรูป 6 เส้น) ก่อนถ่าย — ตัวเลขจะเป็น ฿0 / ROI "—"
- ช่องทางที่มา: หน้าร้าน 14 คน (90 วัน) · cohort 6 เดือน (เม.ย.–ก.ย. 69)
- โมดัลตั้งเวลา: ปุ่มสวิตช์ "เปิดอยู่/ปิดอยู่" · อีเมลผู้รับ (textarea) · เวลาที่ส่ง 00:00–23:00 น. · เช็กบ็อกซ์แท็บ 7 · ยกเลิก (btn-ghost) / บันทึก (btn-primary)
- จุดที่รู้ตัวว่าต่างจาก mockup: มีแถบ `MemberTabs` ของโมดูลใต้หัวหน้า (ทุกหน้าสมาชิกมี) เหนือแถบแท็บรายงาน · ปุ่มหัว 2 ปุ่มเป็น `btn btn-ghost` มีไอคอน `out`/`mail` · ไอคอน KPI ใช้ `MemberIcon` ที่มีอยู่ (users/card/chart/restore/star/tag) · ป้าย hint ใต้ KPI "ต้นทุนโปรโมชัน" = "voucher + แต้มที่แจก"
- มือถือ: KPI 1 คอลัมน์ · กราฟ/RFM ซ้อนกัน · การ์ดล่าง 1 คอลัมน์ · ตารางอยู่ใน `overflow-x-auto` (ไม่ดันหน้ากว้าง) · แถบแท็บเลื่อนแนวนอน

### ตรวจภาพ
_(ผู้คุมงาน Opus 5 · 11 ก.ย. ~13:30 UTC · build QC รวม 3.7+3.8 · เปิดดูทุกภาพเทียบ mockup ด้วยตาแล้ว)_
- **reports-owner desktop (ภาพ 25)**: ตรง — หัว "รายงานสมาชิก" + ส่งออก CSV + ตั้งเวลาส่งอีเมลรายงาน · แท็บ 7 (ภาพรวม · RFM · ระดับ · แต้ม · โปรโมชัน · ช่องทางที่มา · Cohort) · KPI 6 (สมาชิกทั้งหมด · ยอดขายสมาชิก 12 เดือน · เฉลี่ย/คน · อัตรารักษาลูกค้า · แต้มคงค้าง ≈ หนี้สิน · ต้นทุนโปรโมชันเดือนนี้) · กราฟแท่งสมาชิกใหม่ 12 เดือน (div · เดือนล่าสุดสีดำ) · RFM 3×3 เฉดดำ→เทา (Champions … Lost) · การ์ดระดับ (ชิปสีระดับ · จำนวน · ยอดเฉลี่ย · แต้มคงค้าง) · การ์ดแต้ม 6 เดือน (ออก/ใช้/หมดอายุ) + กล่องหนี้สินแต้ม · การ์ดโปรโมชัน ROI ต่อ journey
- ต่างจาก mockup (ยอมรับ): การ์ดโปรโมชันว่าง "ยังไม่มี journey ในระบบนี้ — ไปหน้า Journey อัตโนมัติ" เพราะร้าน QC ไม่มี journey ตอนถ่าย (ลิงก์ชี้หน้าจริง) · RFM บน seed มีแค่ Loyal 36 / At risk 24 (ข้อมูล seed) · กล่องหนี้สินแต้มเพิ่มใต้กราฟแต้ม (สัญญา §8)
- **reports-rfm/cohort/schedule-owner**: แท็บ RFM ตาราง + คำอธิบายกลุ่ม · Cohort ตาราง % รายเดือน · โมดัลตั้งเวลา (อีเมล · ชั่วโมง · แท็บ · สวิตช์)
- **reports-noperm**: 404 (ไม่มี member.report.view · แท็บรายงานถูกซ่อนจากเมนูของคนไม่มีสิทธิ์)
- **PARITY: ผ่าน**
