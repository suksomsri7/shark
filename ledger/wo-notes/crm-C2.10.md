# WO C2.10 — ดีลนิ่ง · แจ้งเตือนพนักงาน · ชุดงาน cron ของ CRM

> RUN "CRM v2" · builder `/root/projects/shark-crm-c20` (QC2) · builder 2 รอบ (opus · รอบ 1 = ของครบ + ORACLE-EDIT 3 · รอบ 2 = BLOCKER/MAJOR/parity จากผู้ตรวจอิสระ) · ผู้ตรวจอิสระ read-only (opus) · Fable ถอนตัวกรอง v1 จากงานล้างข้อมูล (มติ C2.6 ข้อ 7)
> สัญญา: CRM-RUN §2 C2.10 · brief C2.10 (addendum 1–21 · ruling 24 ก.ย. · มติรอบแก้ 25 ก.ย. 1–9) · blueprint §7.4/§7.5 · mockup 01 "ดีลที่ต้องดู" · R-C.1 ไม่มี migration (`CrmUserPref` มีตั้งแต่ C2.0) · R-E.12 ไม่มี LINE ถึงพนักงาน · R-E.14 gate-first
> ข้อสอบ: `scripts/qc-crm-c2.10.mts` (**41 ข้อ** = 40 + S1.6 · S0 4 · S1 6 · S2 2 · S3 6 · S4 3 · S5 2 · U 3 · X1 3 · X4 2 · X5 2 · X7 2 · X8 3 · X9 2 · CLEAN · FATAL) · ORACLE-EDIT 4: S4.1 ชื่องานจริง `crm.activity.remind`/`crm.email.scheduled` · S1.4 นับต่อดีล (fixture มี 4 ดีลเข้าเกณฑ์) · S3.5 ดีลอยู่ทีม + เทียบกับหัวหน้าทีม (visibility TEAM) · **S1.6 ใหม่** static `TRIGGER_MATCH_KEYS` มี `days`

## 1. ไฟล์ที่แตะ (24 ไฟล์ src · +2,345/−63 · + inventory 21 แถว · visual spec "2.10")
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `crm/notifications.ts` (+655) · `notifications-shared.ts` (+346) | ใหม่ | `notifyStaff` (ผู้รับกรอง `canSee`/สมาชิกยังอยู่ · ช่องทาง = ร้าน override ด้วยผู้ใช้ · quiet hours ผู้ใช้ชนะร้าน · เลื่อนไม่ทิ้ง · dedupe 5 ส่วน (ผู้รับ·เทมเพลต·refType·refId·วันไทย) ผ่านลิงก์ `?n=&nd=&r=` ใน body + `pg_advisory_xact_lock` ใน tx เดียว · งบ body = 400−link−3) · `deliverOutbound` แยกล้มชั่วคราว/ถาวร · ประทับ `emailedAt` หลังส่งสำเร็จ · `runFanout` รายชั่วโมง (จอง `emailedAt IS NULL` แบบ atomic · lookback 36 ชม. · คืนการจองเมื่อล้มชั่วคราว) · ตั้งค่าร้าน/เทมเพลต 10 คีย์ × IN_APP/PUSH/EMAIL · `getMyPrefs/setMyPrefs` (ตั้งให้คนอื่นไม่ได้) · `CrmNotifyDeps` ฉีดตัวส่ง · member facade โหลด dynamic (วงจร account→crm→member) |
| `core/quiet-hours.ts` (+78) · `member/notifications.ts` (−27) | ใหม่/แก้ | **ยก** `parseHM/inQuietWindow/nextQuietEnd` ออกจาก member (ลบสำเนาส่วนตัว · member import ตัวกลาง · ค่าเท่าเดิม 4 กรณีรวมข้ามเที่ยงคืน) |
| `crm/deals.ts` (+188) | แก้ | `markStale` รายวัน: `staleDays` ต่อ stage → `settings.crm.staleDaysDefault` (14) · คีย์ `crm.deal.stale#<days>#<dealId>#<anchor>` = คีย์ poller C2.1 (ธง = คีย์) · `pg_advisory_xact_lock` ต่อดีล · ปัก `stalledAt` (C1.5/C1.11 ใช้ได้จริงแล้ว) · digest วันละใบต่อผู้รับ (เจ้าของ + LEAD ตาม `dealWhere`) · เพดาน 1000+ |
| `crm/automation.ts` (+26/−6) | แก้ | `TRIGGER_MATCH_KEYS = ["band","days"]` + `matchValue()` (ของเดิม `str()` คืน "" กับตัวเลข = match ตลอด) ⇒ event สด `days:7` ไม่ยิงกฎ `days:14` (กฎนั้นรอ cron วันที่ 14) — spell เดียว = 1 run ต่อกฎ |
| `crm/activities.ts` (+80) · `crm/companies.ts` (+75) · `crm/tracking.ts` · `crm/emails.ts` | แก้ | `overdueSweep` รายชั่วโมง (คีย์ `crm.activity.overdue#<id>` = C2.1) · `recomputeCachesSweep` หมุนเวียน (`updatedAt asc` + ประทับหลังซ่อม · batch 200) · `purgeWeb`/`purgeBodies` รับ `deadline/signal` + `systemIds` (**ไม่กรอง v1** — หน้าที่ตามกฎหมาย มติ C2.6 ข้อ 7 · `C2.6-U.5`) |
| `platform/minute-jobs.ts` (+96) | แก้ | งานใหม่ 7: `crm.deals.stale` (daily) · `crm.notify.fanout` (hourly) · `crm.activities.overdue` (hourly) · `crm.companies.cache` · `crm.purge.web` · `crm.purge.email` (+recordings) · `crm.reports.scheduled` (no-op รอ C3.1) — ทุกตัว lease/best-effort · เวลา 06:00/04:00/02:00 ไทย → daily (C6.1 crontab เหมือน C2.8) |
| `crm/settings.ts` (+80) | แก้ | `jsonb_set` คำสั่งเดียว (ซ้อน 4 ชั้นสำหรับ `templates.<key>.channels`) · `staleDaysDefault` |
| `automation/labels.ts` (+14) · `outbox-consumers.ts` (+8) · `crm/index.ts` · `nav.ts` · `app/layout.tsx` | แก้ | ป้าย+consumer `crm.deal.stale`/`crm.activity.overdue` (ประกาศครั้งเดียว) · facade `notifications` · เมนู `settings-notifications` หลัง `crm.settings.manage` (ในประตู v2) |
| `settings/notifications/{page,actions}` · `components/crm/notifications/*` | ใหม่ | หน้าตั้งค่าแจ้งเตือน (เทมเพลต 10 × 3 ช่องทาง · quiet hours ร้าน · digest) + ตั้งค่าของฉัน · 390 ไม่มีความกว้างตายตัว · inventory 19 แถว |
| `crm/brief.ts` · `crm/home.tsx` (+99) · `CrmHomeView.tsx` | แก้ | การ์ด "ดีลที่ต้องดู" (mockup 01): ⚠ หัว · 4 แถว + "ดูทั้งหมด" (`/crm/deals?stale=1`) · ป้าย 3 สี (แดง ≥2×เกณฑ์ · เหลือง ≥เกณฑ์ · เทา) · บริษัท · ฿มูลค่า · ปุ่ม "ดู" · testid `crm-home-stale-list/row-*/row-view-*/all` (+2 แถว inventory) |

## 2. migration / seed / backfill — ไม่มี (R-C.1) · ไม่มี catch-up ดีลนิ่งก่อน v2

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด · เคยแดง | ✅ | 5/40 → 29 → 37 (ORACLE-EDIT 3) → 40/40 → 41/41 ×2 (รอบแก้) |
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ⏳ | QC2 หลังถอนตัวกรอง v1 (`.qc-shots/c210-r2/*-fable.log`) · QC1 unit รวม C2.10+C2.11 — §5 |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ⏳ | builder: c2.1 (S6.2 ENV) · c1.5 · c1.11 · c2.4 · c2.8 · c2.6 · c2.5 · c0.5 · c1.6 · c1.7 · c2.2 · v1 · kanban-notify · push · cron · nav เขียว · member suites ต้อง QC1 — §5 |
| D5 | typecheck · fitness ×2 | ⏳ | builder เขียว · unit |
| D6 | build | ⏳ | unit |
| D7 | ภาพ + PARITY | ⏳ | spec "2.10" 3 หน้า · mockup 01 (Fable ดูเอง) |
| D8 | testid + ทะเบียน | ✅ | 21 แถว wo C2.10 · F14.1/F14.2 |
| D9 | ผู้ตรวจอิสระ | ✅ | read-only (opus): BLOCKER A1 ยิงซ้ำ live↔cron เมื่อ days กฎ≠stage · A2 body 400 ตัดลิงก์ · MAJOR B1–B5 · MINOR 9 · parity 5 — แก้ครบ (B1 รับเป็นข้อจำกัด) · เห็นพ้อง ORACLE-EDIT 3 ข้อ |
| D10 | เอกสาร/ทะเบียน | ✅ | event 2 ตัวมี consumer+ป้าย · docs regen (+2 webhook events) · งาน 7 ตัวใน `crm-cron.mts` |
| D11 | wo-notes + คืนสภาพ | ⏳ | `qc-member-m1.9` ใน unit |
| D12 | push → deploy | ⏳ | รอเจ้าของ push |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 | ใช้ | `X1.1–X1.3` (ผู้รับกรองด้วย visibility · ข้ามร้าน/ระบบ · สมาชิกที่ถูกถอด) |
| X2 | N-A | REST → C2.11 (`notifications.prefs.*`) |
| X3 | N-A | ตัวนับร่วมไม่มี (dedupe ด้วย advisory lock + ค้นหาใน tx) |
| X4 | ใช้ | `X4.1–X4.2` (ส่งซ้ำ/ขนาน = ใบเดียว · digest วันละใบ) |
| X5 | ใช้ | `X5.1–X5.2` (งานซ้อนกัน → ครั้งเดียว · ตายหลังจอง → รอบหลังเก็บ) |
| X6 | N-A | ไม่ใช่เงิน |
| X7 | ใช้ | `X7.1–X7.2` (cron secret เป็นประตู · ไม่มี route ใหม่ · ไม่ใส่ rate limit ตามมติ) |
| X8 | ใช้ | `X8.1–X8.3` (เนื้อหา id+จำนวน+ลิงก์ · push ≤180 · ไม่มีเบอร์/อีเมล) |
| X9 | ใช้ | `X9.1–X9.2` (audit ตั้งค่าร้าน/เทมเพลต) |
| X10 | N-A | ไม่มี |
| ร้าน uiVersion 1 | ใช้ | `U.1–U.3` (งานสร้างของไม่เขียน · ตั้งค่าปฏิเสธ · เมนูไม่ขึ้น) · **งานล้างข้อมูลครอบ v1 โดยเจตนา** (C2.6 ข้อ 7) |

## 5. ผลข้อสอบ
_(รอ QC2 confirmation + unit รวม C2.10+C2.11 บน QC1)_

## 6. ข้อจำกัดที่รับ / ติดตาม
- ใบที่ผู้ใช้ปิด "ในแอป" แต่ถูกเลื่อนตาม quiet hours ยังโผล่ในรายการแจ้งเตือน (สถานะอ่านแล้ว) — `listNotifications` ไม่กรอง `readAt` · candidate **C3.0**: คอลัมน์ additive บน AppNotification (`dedupeKey` · `deferredUntil` · `channels`)
- lookback ของ fanout 36 ชม. (crontab ดับนานกว่านั้น = ใบที่เลื่อนไว้ไม่ถูกส่ง) · เพดาน digest 1000+ (ไม่ได้ probe) · เทมเพลต 9/10 ยังไม่มีตัวยิง (ใบหลัง) · `overdueSweep` ยิง event แต่ยังไม่แจ้งใคร (digest งานวันนี้ = ใบหลัง)
- หลังรีเซ็ต worktree: `expected-member-qc.json` เป็นของ QC1 ⇒ member suites บน QC2/QC3 ตายที่ fixture — รันบน QC1 เท่านั้น (หรือ reseed ก่อนเปิดเลน)
