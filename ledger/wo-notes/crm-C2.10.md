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
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ✅ | unit `crm-c210c211-verify` (QC1) — §5 |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ✅ | §5 — 48 ชุดเขียว (member ภาพ = ENV ถ่ายแล้วใน unit เสริม) |
| D5 | typecheck · fitness ×2 | ✅ | typecheck exit 0 · fitness 32/32 ×2 |
| D6 | build | ✅ | BUILD+serve exit 0 · c2.6-web 35/35 |
| D7 | ภาพ + PARITY | ✅ | §7 |
| D8 | testid + ทะเบียน | ✅ | 21 แถว wo C2.10 · F14.1/F14.2 |
| D9 | ผู้ตรวจอิสระ | ✅ | read-only (opus): BLOCKER A1 ยิงซ้ำ live↔cron เมื่อ days กฎ≠stage · A2 body 400 ตัดลิงก์ · MAJOR B1–B5 · MINOR 9 · parity 5 — แก้ครบ (B1 รับเป็นข้อจำกัด) · เห็นพ้อง ORACLE-EDIT 3 ข้อ |
| D10 | เอกสาร/ทะเบียน | ✅ | event 2 ตัวมี consumer+ป้าย · docs regen (+2 webhook events) · งาน 7 ตัวใน `crm-cron.mts` |
| D11 | wo-notes + คืนสภาพ | ✅ | `qc-member-m1.9` 26/26 ×2 |
| D12 | push → deploy | ✅ | เจ้าของสั่ง push · `session/crm` + `main` 0d638f15..`581428f1` (26 ก.ย. ~04:05 UTC · ไม่มี migration ในช่วง) · deploy ใหม่ขึ้นจริง 04:10:25 UTC (`dpl_8aHf55…` → `dpl_EG93Xo…` ใน header `Link` ของ `/`) · smoke `/` `/login` `/api/health` 200 · health `db:true outboxPending:0` · prod `uiVersion` 1 ทุกร้าน |

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
**unit `crm-c210c211-verify` (QC1 seed ใหม่ · 25 ก.ย. 12:00–14:40 UTC · ALLDONE · main tree `a2b547ca`):**
- `migrate diff (must be empty)`: exit=0 · `-`
- `gen-crm-api-docs (early · before m1.1)`: exit=0 · `-`
- `reseed member`: exit=0 · `-`
- `qc-member-m1.1`: exit=0 · `{"total":28,"passed":28,"findings":[]}`
- `seed crm #1`: exit=0 · `-`
- `seed crm #2`: exit=0 · `-`
- `DRAIN`: exit=0 · `{"total":4,"passed":4,"findings":[]}`
- `qc-crm-c2.10`: exit=0 · `{"total":41,"passed":41,"findings":[]}`
- `qc-crm-c2.11`: exit=0 · `{"total":47,"passed":47,"findings":[]}`
- `qc-crm-c2.10`: exit=0 · `{"total":41,"passed":41,"findings":[]}`
- `qc-crm-c2.11`: exit=0 · `{"total":47,"passed":47,"findings":[]}`
- `qc-crm-c1.10`: exit=0 · `{"total":66,"passed":66,"findings":[]}`
- `qc-crm-c2.1`: exit=0 · `{"total":84,"passed":84,"findings":[]}`
- `qc-crm-c2.2`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-c2.3`: exit=0 · `{"total":80,"passed":80,"findings":[]}`
- `qc-crm-c2.4`: exit=0 · `{"total":91,"passed":91,"findings":[]}`
- `qc-crm-c2.5`: exit=0 · `{"total":105,"passed":105,"findings":[]}`
- `qc-crm-c2.6`: exit=0 · `{"total":87,"passed":87,"findings":[]}`
- `qc-crm-c2.7`: exit=0 · `{"total":63,"passed":63,"findings":[]}`
- `qc-crm-c2.8`: exit=0 · `{"total":54,"passed":54,"findings":[]}`
- `qc-crm-c2.9`: exit=0 · `{"total":52,"passed":52,"findings":[]}`
- `qc-crm-c0.5`: exit=0 · `{"total":50,"passed":50,"findings":[],"unproven":[],"info":{"leaseStyle":"row lease (re-run at +16m)","dueMode`
- `qc-crm-c1.2b`: exit=0 · `{"total":93,"passed":93,"findings":[]}`
- `qc-crm-c1.4`: exit=0 · `{"total":110,"passed":110,"findings":[]}`
- `qc-crm-c1.5`: exit=0 · `{"total":103,"passed":103,"findings":[]}`
- `qc-crm-c1.6`: exit=0 · `{"total":79,"passed":79,"findings":[],"skippedChecks":[]}`
- `qc-crm-c1.7`: exit=0 · `{"total":57,"passed":57,"findings":[]}`
- `qc-crm-c1.8`: exit=0 · `{"total":81,"passed":81,"findings":[]}`
- `qc-crm-c1.11`: exit=0 · `{"total":66,"passed":66,"findings":[]}`
- `qc-crm-c2.0`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-v1`: exit=0 · `{"total":17,"passed":17,"findings":[]}`
- `qc-crm-c0.2`: exit=0 · `{"total":27,"passed":27,"findings":[]}`
- `qc-form`: exit=0 · `{"total":10,"passed":10,"findings":[]}`
- `qc-forms-notify`: exit=0 · `-`
- `qc-public-links`: exit=0 · `{"total":11,"passed":11,"findings":[]}`
- `qc-pages`: exit=0 · `{"total":31,"passed":31,"findings":[]}`
- `qc-pos-register`: exit=0 · `{"total":42,"passed":42,"findings":[]}`
- `qc-pos-account`: exit=0 · `{"total":16,"passed":16,"findings":[]}`
- `qc-acc-v2-payments`: exit=0 · `-`
- `qc-account-api-write-payments`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `qc-account-api-keys`: exit=0 · `{"total":51,"passed":51,"findings":[]}`
- `qc-webhook`: exit=0 · `{"total":15,"passed":15,"findings":[]}`
- `qc-kanban-notify`: exit=0 · `-`
- `qc-push`: exit=0 · `-`
- `qc-cron`: exit=0 · `{"total":4,"passed":4,"findings":[]}`
- `qc-member-fix-s3`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `qc-member-m3.3`: exit=1 · `{"total":32,"passed":30,"findings":[{"id":"M3.3-S9.2","sev":"CRITICAL"},{"id":"M3.3-S9.3","sev":"CRITICAL"}]}`
- `qc-member-m3.6`: exit=1 · `{"total":19,"passed":18,"findings":[{"id":"M3.6-S8.3","sev":"CRITICAL"}]}`
- `qc-member-m3.7`: exit=1 · `{"total":23,"passed":22,"findings":[{"id":"M3.7-S6.2","sev":"CRITICAL"}]}`
- `qc-chat-core-v2`: exit=0 · `{"total":47,"passed":47,"findings":[]}`
- `qc-ticket-money`: exit=0 · `{"total":6,"passed":6,"findings":[]}`
- `qc-rental`: exit=0 · `{"total":11,"passed":11,"findings":[]}`
- `qc-school`: exit=0 · `{"total":7,"passed":7,"findings":[]}`
- `qc-hotel-money`: exit=0 · `{"total":5,"passed":5,"findings":[]}`
- `qc-clinic`: exit=0 · `{"total":8,"passed":8,"findings":[]}`
- `qc-queue-public`: exit=0 · `{"total":20,"passed":20,"findings":[]}`
- `qc-shop`: exit=0 · `{"total":15,"passed":15,"findings":[]}`
- `qc-booking-race`: exit=0 · `{"total":8,"passed":8,"findings":[]}`
- `qc-nav-functions`: exit=0 · `-`
- `probe-uiversion-gate (no env)`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `gen-crm-api-docs`: exit=0 · `-`
- `typecheck`: exit=0 · `-`
- `fitness`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `fitness-noenv`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `BUILD+serve`: exit=0 · `-`
- `shots 2.10 (owner)`: exit=0 · `{"wo":"2.10","user":"owner","shots":[".qc-shots/crm/2.10/crm-home-stale-owner-desktop.png",".qc-shots/crm/2.10`
- `shots 2.10 (manager)`: exit=1 · `{"wo":"2.10","user":"manager","shots":[".qc-shots/crm/2.10/crm-home-stale-manager-desktop.png",".qc-shots/crm/`
- `shots 2.11 (owner)`: exit=2 · `{"wo":"2.11","user":"owner","shots":[".qc-shots/crm/2.11/crm-settings-api-c211-owner-desktop.png"],"failures":`
- `qc-member-m3.10 (server up)`: exit=1 · `{"total":21,"passed":20,"findings":[{"id":"M3.10-S4.3","sev":"CRITICAL"}]}`
- `qc-crm-c2.6-web (headless)`: exit=0 · `{"total":35,"passed":35,"findings":[]}`
- `serve stop`: exit=0 · `-`
- `qc-member-m1.9`: exit=0 · `{"total":26,"passed":26,"findings":[]}`

- แดงที่ไม่ใช่โค้ด: `qc-member-m3.3` S9.2/S9.3 · `qc-member-m3.6` S8.3 · `qc-member-m3.7` S6.2 · `qc-member-m3.10` S4.3 = ข้อภาพที่อ่านไฟล์ summary ของ visual-member (ไม่มีใน seed) — ข้อฟังก์ชันผ่านหมด · `shots 2.10 (manager)` = spec คาดแท็บร้านทั้งที่ผู้จัดการใน seed ไม่มี `crm.settings.manage` (แก้ spec) · `shots 2.11` = selector ที่มีจุดไม่ได้ quote (แก้ spec) → ปิดทั้งหมดใน unit `crm-member-shots-c2close` (ด้านล่าง)

**unit `crm-member-shots-c2close` (QC1 · เซิร์ฟเวอร์จาก .next เดิม):** visual-member 3.3/3.6/3.7/3.10 ถ่ายครบ (ทุกหน้า 200 · ไม่ล้น · ไม่มี element หาย) → `qc-member-m3.7` **23/23** · `qc-member-m3.10` **21/21** · `qc-member-m3.3` 31/32 (S9.2 ขาดภาพผู้ใช้ `noperm` 404) · `qc-member-m3.6` 18/19 (S8.3 ขาดภาพ `thana` 403) — สองข้อนี้ต้องถ่ายผู้ใช้เพิ่มของ RUN สมาชิก ไม่เกี่ยวโค้ด (หน้าแจ้งเตือนสมาชิกหลังยก quiet-hours ออก = 200 ไม่ล้น) · shots 2.10 manager (spec แก้) exit 0 · shots 2.11 owner 3 ใบ (spec 1 คาด testid ของ event ที่อยู่ในฟอร์ม "เพิ่ม URL" → แก้ spec แล้ว · ภาพครบ) · `qc-member-m1.9` 26/26


## 6. ข้อจำกัดที่รับ / ติดตาม
- ใบที่ผู้ใช้ปิด "ในแอป" แต่ถูกเลื่อนตาม quiet hours ยังโผล่ในรายการแจ้งเตือน (สถานะอ่านแล้ว) — `listNotifications` ไม่กรอง `readAt` · candidate **C3.0**: คอลัมน์ additive บน AppNotification (`dedupeKey` · `deferredUntil` · `channels`)
- lookback ของ fanout 36 ชม. (crontab ดับนานกว่านั้น = ใบที่เลื่อนไว้ไม่ถูกส่ง) · เพดาน digest 1000+ (ไม่ได้ probe) · เทมเพลต 9/10 ยังไม่มีตัวยิง (ใบหลัง) · `overdueSweep` ยิง event แต่ยังไม่แจ้งใคร (digest งานวันนี้ = ใบหลัง)
- หลังรีเซ็ต worktree: `expected-member-qc.json` เป็นของ QC1 ⇒ member suites บน QC2/QC3 ตายที่ fixture — รันบน QC1 เท่านั้น (หรือ reseed ก่อนเปิดเลน)
## 7. PARITY (Fable ดูเอง)
- **PARITY: ผ่าน** — `.qc-shots/crm/2.10/crm-home-stale-owner-{desktop,mobile}.png` vs `ledger/design-crm/01-crm-home.png` การ์ด "ดีลที่ต้องดู": ⚠ หัว + "นิ่งเกินกำหนด" + "ดูทั้งหมด →" ✅ · ป้าย "นิ่ง 25 วัน" สีเหลือง (25 < 2×14 ตามกติกา 3 สี) ✅ · ชื่อดีล + บริษัท · ฿มูลค่า ✅ · ปุ่ม "ดู" ✅ · 4 แถวคู่กับ "งานของฉันวันนี้" ✅ · มือถือ 390 ไม่ล้น · KPI แถวบน/leaderboard = C1.11 ไม่ใช่ใบนี้
- หน้าตั้งค่าแจ้งเตือน (ไม่มี mockup): ของร้าน 10 เรื่อง × 3 ช่องทาง + ช่วงห้ามรบกวน + เวลาสรุป · "ของฉัน" สำหรับผู้ไม่มี `crm.settings.manage` (ผู้จัดการใน seed) · เรียบร้อยทั้งเดสก์ท็อป/มือถือ
