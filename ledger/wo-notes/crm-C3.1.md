# WO C3.1 — รายงาน 8 แท็บ · งานส่งออก CSV · ส่งรายงานทางอีเมลตามกำหนด (ร่างของ builder)

> RUN "CRM v2" · builder `/root/projects/shark-crm-c23` (QC3) · 26 ก.ย. 2569
> สัญญา: CRM-RUN §2 C3.1 · brief C3.1 + addendum 1–15 (ruling 26 ก.ย. CONFIRMED ทั้งหมด) · R-E.6/R-E.7/R-E.8/R-E.14 · blueprint §5.9 · ภาพ 09
> ข้อสอบ: `scripts/qc-crm-c3.1.mts` (56 ข้อ) — **ยังไม่ได้รันบน QC3** (ดู §0)

## 0. สภาพเครื่อง
รอบแรก Prisma client ใน overlay upper ของ c23 เก่า (ไม่มีโมเดล C3.0) ⇒ ทุกสคริปต์ที่แตะฐานตายตอน import · ผู้คุมงาน generate ใหม่ใน upper ของ c23 แล้ว (lower ไม่ถูกแตะ)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `crm/reports.ts` | ใหม่ | 8 แท็บ (SQL ล้วน · bigint→number) · `getReport` ตัวแจกงาน · `startExport/runExportJobs/getExport` (CrmImportJob REPORT_EXPORT + lease `FOR UPDATE SKIP LOCKED`) · `listSchedules/saveSchedule/deleteSchedule` (jsonb_set คำสั่งเดียวบน `settings.crm.reportSchedules`) · `runScheduled` (lease ต่อ (ตาราง, ช่องเวลาไทย) ในแถว `OpsAlertState` · ต่อผู้รับ 1 ฉบับ/ช่อง · คำนวณด้วยขอบเขตของผู้รับ) |
| `crm/reports-shared.ts` | ใหม่ | REPORT_TABS/LABEL/SHORT/TITLE · ความถี่ · DTO · ReportsError · ตัวช่วยวันไทย (ใช้ `thaiDayKey/thaiDayStartMs` ของ activities-shared) · `reportSlotOf` |
| `crm/index.ts` | แก้ | บล็อก `// CRM C3.1 ▸ … ◂` — `export * as reports` |
| `platform/minute-jobs.ts` | แก้ | `crm.reports.scheduled` (ชื่อ/รอบเดิม) ได้ตัวงาน `reports.runScheduled` · งานใหม่ `crm.reports.exports` (ทุกนาที) |
| `crm/nav.ts` | แก้ | CRM_NAV `reports` (`/crm/reports` · ready · C3.1) |
| `app/.../crm/reports/page.tsx` · `[tab]/page.tsx` · `reports-actions.ts` | ใหม่ | หน้า 8 แท็บ (ภาพรวม = page.tsx ส่ง tab overview เข้าตัวเดียวกัน) · ด่าน CRM → v2 → `crm.report.view` → 404 · action ส่งออก/ตั้งเวลา (assertCrmV2) |
| `components/crm/reports/*` | ใหม่ | ReportsView (ภาพ 09: หัว · แท็บ · ตัวกรอง · การ์ด forecast+แท่งซ้อน · funnel · ยอดต่อคน · เหตุผลแพ้ · ที่มา/ROI) · ReportFilterBar · ReportExportButton (BOM + text/csv) · ReportScheduleButton (หน้าต่าง) · types |
| `scripts/crm-ui-inventory.json` | แก้ | +15 แถว wo C3.1 |
| `app/app/layout.tsx` | แก้ (บล็อกเดียว · มติผู้คุมงานข้อ 1) | ลิงก์ drawer `/crm/reports` หลัง `crm.report.view` (ในประตู v2) |
| `marketing/campaign-costs.ts` · `marketing/index.ts` | ใหม่/แก้ (มติข้อ 4) | `campaignCostsByIds(tenantId, ids)` อ่านอย่างเดียว · ≤ 500 id · groupBy Σ costSatang · คืน `Map<id, {name, costSatang}>` (ชื่อใช้เป็นป้ายแถวแคมเปญ) · CRM โหลด facade แบบ lazy |
| `scripts/fitness.mts` | แก้ (มติข้อ 4) | ALLOWED_EDGES `crm→marketing` — "C3.1 sources/ROI reads campaign cost" |

## 2. migration / seed / backfill — ไม่มี (R-E.6 ตารางเวลาอยู่ใน settings · export ใช้ CrmImportJob เดิม)

## 3. มติผู้คุมงาน (26 ก.ย. 2569)
1. layout.tsx: เพิ่มบล็อก C3.1 (ลิงก์รายงาน หลัง `crm.report.view`) — `qc-nav-functions` 11/11
2. ช่องเวลาไม่ผูก `createdAt` ของตาราง — **รับตามแบบ**: รอบแรกหลังบันทึกส่งช่องปัจจุบันได้ทันที (ตามส่งครั้งเดียว) · ถ้าผูก ข้อสอบที่ใช้นาฬิกาสังเคราะห์ ต.ค./พ.ย. 2569 จะเน่าเมื่อรันหลังวันนั้น
3. `REPORT_TAB_LABEL` มีอักษรไทย + `REPORT_TAB_SHORT` = ข้อความภาพ 09 บนแถบแท็บ — รับ
4. ต้นทุนแคมเปญ **ผ่าน facade การตลาด** (`campaignCostsByIds`) + ALLOWED_EDGES `crm→marketing` — ไม่มี SQL ตรงบน MktCampaign/CampaignVariantStat ใน CRM แล้ว
5. CSV เก็บใน `CrmImportJob.result` (เพดาน 5 MB) — รับ (X10.1: ไม่มี URL ไม่มีไฟล์)
6. action ส่งออกเรียก `runExportJobs` ทันที (งบ 8 วินาที) — รับ · **ตัวรันในคำขอใช้ lease ตัวเดียวกับงานรายนาที** (`UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)` → RUNNING + leaseUntil 15 นาที · DONE เขียนแบบมีเงื่อนไข lease ยังเป็นของเรา) ⇒ งานรายนาทีกับคำขอหยิบแถวเดียวกันไม่ได้ (พิสูจน์ด้วย S3.2: runExportJobs ซ้อน 4 ทาง Σdone = 1)
- อื่น ๆ: โควตา = null (ตัวยึดที่ C3.2) · คอมมิชชัน = Σ CrmCommission ที่ไม่ใช่ REVERSED/REJECTED

## 4. หลักฐาน (QC3)
- ข้อสอบ `qc-crm-c3.1` 55/56 → ORACLE-EDIT C3.1-X8.1 (ชื่อดีล fixture `ดีลสมาชิก <TAG>` มีชื่อสมาชิก `สมาชิก <TAG>` เป็นสตริงย่อย) · สำเนาข้อสอบที่เปลี่ยนแค่ชื่อดีล = 56/56
- lease (`.qc-shots/c31/probe-evidence.log`): 2 รอบนาฬิกาเดียวกันพร้อมกัน → 1 ฉบับ ({sent 1} + {skipped 1}) · +30 วิ ×3 → 0 · ตายหลังจอง: +5/+14 นาที ถูกกัน (lease 18:15Z) · +16 นาที ส่ง 1 · +17 นาที 0 · A ตื่นมาล้ม → ไม่แตะ done · +18 นาที 0 ⇒ รวม 1 ฉบับ
- จำนวนคิวรี overview บน seed: OWNER 2 · thana (STAFF · TEAM) 7 (เพดาน 12)
- X6: `=HYPERLINK(` (hex 3d…) → `"'=HYPERLINK(""…` (hex 22 27 3d…) · utm `@SUM(` → `'@SUM(` (`probe-x6.log`)
- regressions (QC3): c2.10 41/41 · fix-s4 30/30 · c1.3 89/89 · c0.2 27/27 · nav 11/11 · c1.11 66/66 (รันด้วย `iso.sh env CRM_V2_SWITCH=all` ตาม wo-notes C1.11 — ไม่ตั้ง = S6.x/S7.1 แดงเพราะหน้าสลับซ่อน · S6.10 เคยแดงเพราะหน้า /crm/reports ส่งต่อด่าน → แก้ให้เรียก requireCrmV2Page เอง) · m3.8 17/18 (S11.2 = ภาพหน้าจอสมาชิก ไม่ได้ถ่ายใน c23 · ไม่เกี่ยวใบนี้) · fitness 32/32 ×2
- typecheck: ผ่าน (exit 0) กับ client เก่า ก่อนเพิ่ม facade การตลาด/ด่านหน้า /crm/reports · รอบสุดท้ายตามกติกาใหม่ (`iso.sh with-gate-lock.sh` · heap 4096) = **heap เต็ม** (Mark-Compact 4023 MB · exit 134) หลังผู้คุมงาน generate client ที่มีโมเดล C3.0 (index.d.ts 21 MB) — รอผู้คุมงานตัดสินเรื่อง heap/รันแทน (`.qc-shots/c31/typecheck-final.log`)

## 5. รีวิวอิสระ (26 ก.ย. · 0 BLOCKER · 5 SHOULD-FIX · 10 NOTE) — แก้ตามมติผู้คุมงาน
| ข้อ | แก้อย่างไร | ที่ |
|---|---|---|
| S1 คิวรายวันอดร้านท้ายคิว | คิวเรียง "ธง done เก่าสุดก่อน" (ไม่เคยส่ง = ก่อนสุด) + แฮช (id, วันไทย) หมุนลำดับเมื่อเท่ากัน · ไม่เรียงตาม id อีก · งานใหม่ `crm.reports.sweep` (hourly · 60 นาที) ตัวงานเดียวกัน `runScheduled` — lease ต่อ (ตาราง, ช่อง) + done/sent ⇒ ซ้อนปลอดภัย · `crm.reports.scheduled` ชื่อ/รอบเดิม | `reports.ts` runScheduled (queue.sort ~1222) · `minute-jobs.ts` ~330 |
| S2 คีย์ API ส่งออก | `startExport`/`getExport` ปฏิเสธ `isApiActor` = FORBIDDEN ไทย · งานเก็บ `requesterKind: "USER"` + `requesterId` · getExport เทียบทั้งคู่ · **C3.8 (REST) ต้องสร้าง actor จากคีย์ใหม่ตอนรันและผูกงานกับ ApiKey.id ก่อนเปิดส่งออกทาง REST** | `reports.ts` ~851 · ~965 · ~975 |
| S3 MANAGER จำกัดสาขาเห็นกิจกรรมกำพร้าสาขาอื่น | ALL+จำกัดสาขา: เงื่อนไขเดียวกับ `visibility.activityClause` (มีดีล → ทีมดีล · ไม่มีดีล มีผู้ติดต่อ → ทีมผู้ติดต่อ · กำพร้า → ยกเว้นแถวที่ `visibleWhere(ACTIVITY)` ซ่อน · เพดาน 5,000 แบบ visibility) — ไม่เขียนกฎชุดที่สอง | `reports.ts` reportScope ~186 · activityScope |
| S4 แท็บ "รายงาน" เป็นลิงก์ตาย | `CrmNavEntry.perm` + `crmNavItems(systemId, can?)` กรองด้วย `(k) => crmCan(actor, k)` · ไม่ส่ง `can` = ซ่อนหมวดที่มี perm (fail closed) · หน้าแรก CRM (`home.tsx:75`) ส่ง `can` แล้ว · **หน้าอื่น 34 หน้าไม่ได้ส่ง ⇒ แท็บรายงานไม่ขึ้นที่นั่น (drawer ยังมี)** — ผู้คุมงานเลือกได้ว่าจะไล่ส่ง `can` ทุกหน้าในใบ C3.x ที่แตะหน้านั้น | `nav.ts` ~21/39/115 |
| S5 ผู้รับที่รับไม่ได้ | หน้าต่างเสนอเฉพาะพนักงานที่ `crmCan(toMemberActor(m), "crm.report.view")` · `saveSchedule` ปฏิเสธ VALIDATION ไทย | `[tab]/page.tsx` ~166 · `reports.ts` ~1063 |
| N1 ระดับรายงาน | `widest(resolve(REPORT), crmCan(report.team) ⇒ TEAM, crmCan(report.all) ⇒ ALL)` — ค่าปริยายของ crmCan (MANAGER = ALL) ตรงกับประตูตารางเวลา | `reports.ts` ~156 |
| N2 scores ใช้ตัวกรอง pipeline | รับตามเดิม (withOpenDeal/withWonDeal ผูกดีลของ pipeline ที่กรอง · จำนวน/คะแนนเฉลี่ยของผู้ติดต่อไม่ผูก) | — |
| N3 ที่มา LIMIT รวม | `ORDER BY leads DESC LIMIT 200` ต่อมิติ (ที่มา · แคมเปญ · ลิงก์) | `reports.ts` ~96 + sourcesOf |
| N4 คอมมิชชัน | งวดตาม `periodKey` "YYYY-MM" (ค.ศ. · ธรรมเนียม C3.3) ระหว่างเดือนไทยของ from/to · LEFT JOIN ดีล (ดีลเก็บถาวร/ลบแล้วยังนับ) · ขอบเขต = ตัวผู้รับค่าคอม | `reports.ts` commissionBase ~333 |
| N6 งานส่งออก | คอมเมนต์ตรงโค้ด (error ที่จับได้ทุกชนิด = FAILED ทันที · ตายไม่ถึง catch = lease หมดแล้วหยิบใหม่) · lease ของแต่ละการจอง = now ของรอบ + เวลาจริงที่ผ่านไป | `reports.ts` ~917 · ~950 |
| N7 สถานะตาราง | คีย์ `crm.report.schedule:<tenantId>:<systemId>:<sid>:…` · deleteSchedule ลบของตารางนั้น · ตัวกรองใช้ไม่ได้แล้ว = OpsEvent WARN (รหัสล้วน) ครั้งเดียวต่อช่อง (ธง `…:warn`) | `reports.ts` ~1130 · ~1299 |
| N8 BOM | เขียนเป็น escape `\uFEFF` ทั้งสองที่ (ไม่มีอักขระล่องหนในซอร์ส) | `reports.ts` ~1179 · `ReportExportButton.tsx:15` |
| N9 expected.json | ไม่แตะ (ผู้คุมงานจัดการ) | — |

หลักฐานรีวิว (`.qc-shots/c31/probe-review.log`, ร้านทิ้ง `qc-c31r-*` ลบครบ): S1 รอบรายวันถูกตัดงบหลัง 1 ฉบับ [1,0,0,0] → sweep +1 ชม. [1,1,1,1] → sweep +2 ชม. [1,1,1,1] (ไม่ซ้ำ) · S2 API = FORBIDDEN · S3 OWNER 2 / MANAGER[u1] 1 · S5 VALIDATION · N7 WARN 2 ครั้งใน 2 ช่อง · สถานะเหลือ 0 หลังลบตาราง

## 8. หนี้ (ส่งต่อ C3.9)
- N5: ล้าง CSV ของงานส่งออกเก่า (`CrmImportJob.result` kind REPORT_EXPORT) ตามอายุ — ยังไม่มีงานล้าง
- N10: ร้านที่ถูกระงับ/ปิด (Tenant SUSPENDED/CLOSED) ยังถูกงาน `crm.reports.*` หยิบ — ต้องกรองสถานะร้านในงานตามเวลา

## ผู้คุมงาน (Fable 5.1 · 26 ก.ย. 2569) — รับงาน
| # | ผล | หลักฐาน |
|---|---|---|
| D1 | ✅ | ข้อสอบ 56 ข้อเขียนก่อน (c12a) · SKIPPED/RED-for-right-reason ก่อนโค้ด · ruling 15 ข้อ |
| D2 | ✅ | `qc-crm-c3.1` **56/56 ×2** QC1 seed ใหม่ (`c31-verify.log`) · 56/56 QC3 (builder) |
| D3 | ✅ | ORACLE-EDIT 1 = X8.1 (ชื่อดีล `ดีลสมาชิก <TAG>` มีชื่อสมาชิก needle PII เป็น substring — ผู้คุมงานพิสูจน์เองจากบรรทัด 1127/1136/1264) |
| D4 | ✅ | ถอยหลัง QC1 (`c31-verify.log` 36 ขั้น exit 0): c2.10 · c1.3 · c0.2 · c0.5 · c1.7 · c1.11 · c2.1 · c2.5 · c2.11 · c2.7 · c3.0 · fix-s4 · marketing · v1 · pages · cron · nav 11/11 · uiversion probe · m3.10 · m1.9 26/26 — แดงเดียว m3.8 S11.2 = ภาพสมาชิก (ENV ไม่ใช่ของใบนี้) |
| D5/D6 | ✅ | typecheck 5120 exit 0 · fitness 32/32 ×2 · build+serve ผ่าน |
| D7 | ✅ | ภาพ 17 ใบ `.qc-shots/crm/3.1/` (owner 9 · manager 8 · 1440/390) ผู้คุมงานเปิดดูเองเทียบ mockup 09: แท็บ 8 · ตัวกรอง 3 · KPI 8 การ์ด · ตาราง forecast/funnel/ยอดต่อคน/เหตุผลแพ้/ที่มา · โมดัลตั้งเวลา (แท็บ·ความถี่·วัน·ผู้รับเฉพาะคนมีสิทธิ์) ตรงแบบ · แท่ง forecast ดำเต็ม = seed มีเฉพาะยอดปิด (ข้อมูล) · มือถือไม่ล้น · ร้าน v1 probe 14/14 |
| D8–D11 | ✅ | ผู้ตรวจอ่านอย่างเดียว: BLOCKER 0 · SHOULD-FIX 5 + NOTE 6 แก้ครบ (หลักฐาน `.qc-shots/c31/probe-review.log`: งานรายวันโดนตัดงบ → sweep รายชั่วโมงเติมครบไม่ซ้ำ · API key FORBIDDEN · สาขา · VALIDATION ผู้รับ · คีย์สถานะมี tenant/system) · lease จริง: overlap 1 เมล · crash-after-claim retry ครั้งเดียวที่ +16 นาที · overview 2/7 round trips |
| D12 | ⏳ | รอ push (เจ้าของกด) |
หนี้ (C3.9): purge CSV export ใน `CrmImportJob.result` · tenant SUSPENDED ใน job · S4 ร้อย `can` ให้ `crmNavItems` ทุกหน้า (C4)
