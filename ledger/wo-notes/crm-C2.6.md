# WO C2.6 — Web tracking (ลิงก์/QR · pixel · shark.js + ความยินยอม · identify · ฟอร์ม spam guard/UTM/assign/score · purge)

> RUN "CRM v2" · builder `/root/projects/shark-crm-c20` (QC2) · รวมทรีหลัก `session/crm` · builder รอบ 1: 24 ก.ย. 12:20–15:30 UTC (opus 2 ตัว — ตัวแรกถูกโควตาตัด) · ผู้ตรวจของผู้คุมงาน 15:40 · **รอบ 2: 21:25–22:20 (opus · ต่อจากไฟล์ที่ตัวก่อนทิ้งไว้แบบคอมไพล์ไม่ผ่าน)** · ผู้คุมงาน **Fable 5.1** · รับงาน 25 ก.ย. 2569
> สัญญา: CRM-RUN §2 C2.6 · brief C2.6 (addendum 1–13 · Addendum B 1–7 · ruling 24 ก.ย. · ruling round 2) · พิมพ์เขียว §5.8 · ภาพ 11 · 16
> ข้อสอบ: `scripts/qc-crm-c2.6.mts` (**87 ข้อ** = 81 + ORACLE-EDIT 6 ข้อ S9 · S0 7 · S1–S8 38 · S9 6 · U 5 · X1 4 · X3 5 · X4 2 · X5 1 · X6 3 · X7 10 · X8 3 · X9 2 · CLEAN) **+ headless `qc-crm-c2.6-web.mts` (35 ข้อ = 34 + S1.3 · chromium บน build จริง · ORACLE-EDIT 25 ก.ย.: `__name` shim · UA เดสก์ท็อป + ตัวคุมบวก bot · X4.1 ตามมติ ticket ครั้งเดียว · S6.5 ตัดสินจากผลของ chromium)** · แก้หลัง commit: **ใช่ (`locEq` Location percent-encode · S2 consent fixture · S9)**

## 1. ไฟล์ที่แตะ (33 ไฟล์ · +4,176/−131)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `crm/tracking.ts` (~1,300) · `tracking-shared.ts` · `tracking-actions.ts` | ใหม่ | ลิงก์ (สร้าง/แก้/ลบ/สถิติ/QR · `LINK_CODE_RE` · `/l/<code>` 302 ไปเฉพาะ URL ที่เก็บ (percent-encode) · unknown/inactive/expired ตอบเหมือนกัน · `sd_u` HttpOnly Path-scoped · v1 redirect ไม่นับ) · ตั๋ว identify AES-GCM (tenant/system-bound · jti ใช้ครั้งเดียว · 15 นาที) · `collect`/`recordConsent` (CORS origin ตรงตัว · 204 · limiter hash · body cap ก่อนอ่าน `readCappedBody`) · ความจริง consent ฝั่ง server · `identify` (ผูก session ย้อนหลัง 180 วันเฉพาะ visitor เดิม · WEB activity 1/วันไทย · `crm.web.identified`) · `trackerScript` (`window.sd` · แบนเนอร์ `data-sd` · decline = cookie เดียว · endpoint absolute · อ่าน `sd_ct` เอง · clean URL ฝั่ง client 5 utm) · purge (v1 ด้วย) · settings jsonb คำสั่งเดียว (`bumpConsentVersion` คำสั่งเดียว) · `saveFormTarget` (ชื่อสงวน = VALIDATION) |
| `forms/spam-guard.ts` · `forms/crm-source.ts` · `forms/service.ts` (`submitPublicFormGuarded` · `submitPublicForm` เดิมไม่เปลี่ยนพฤติกรรม) · `forms/index.ts` | ใหม่/แก้ | honeypot `_sd_hp` + start token `_sd_st` (namespace · nonce ครั้งเดียว · 2 ชม. · HMAC `form-start:v1:`) · ปฏิเสธชื่อสงวน · honeypot กินโควตา · `FormSubmission.ip` = hash · UTM/pageUrl/referrer clean · crm-source = dynamic facade (C1.8-S0.3) |
| `crm-bridges/forms.ts` (เจ้าของใหม่) · `contacts.ts` (`ruleId`/`fields`) | แก้ | crmSystemId · assignRuleId → C2.3 · score on submit (CrmScoreLog + atomic) · createCompanyFromField · identify จาก session ที่ยินยอม · **ส่ง `locale` + `fields` เข้า `leadFromBridge` (ปิดหนี้ B2/B3 ของ C2.3)** |
| routes `l/[code]` · `t/s/[script]` · `t/e` · `t/consent` · hunk ใน `t/c/[token]` (ticket) · `src/proxy.ts` (ถอด X-Frame-Options เฉพาะ `/f`) · `(store)/f/[token]/{page,actions,PublicForm}` | ใหม่/แก้ | หน้าฟอร์ม honeypot มองไม่เห็นจริง · token hidden · ปฏิเสธ inline ไทย · action อ่านคุกกี้ `sd_vid` ฝั่ง server เอง (ไม่รับ visitorId จากผู้เรียก · ไม่มี `?v=`) |
| pages `settings/tracking` · `settings/forms` · `components/crm/tracking/**` · contact-360 timeline mount · `nav.ts` · `crm/index.ts` · `layout.tsx` · `outbox-consumers.ts` · `webhooks/labels.ts` · `gen-crm-api-docs.mts` + docs | ใหม่/แก้ | UI (mockup 11/16) · เตือนชื่อสงวนบนจอ · QR innerHTML มี assert `isBareSvg` |
| `crm-ui-inventory.json` (+41) · `visual-crm.mts` (spec "2.6" สร้างลิงก์/session/ฟอร์มผ่าน facade คืนสภาพ) | แก้ | |

## 2. migration / seed / backfill — ไม่มี (ตาราง `CrmTrackedLink/Click/WebSession/WebEvent` + คอลัมน์ FormDef/FormSubmission จาก C2.0)

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด · เคยแดง | ✅ | 73/81 (fixture ผิด 2) → 87/87 หลัง ORACLE-EDIT + รอบ 2 |
| D2 | เขียวเมื่อผู้คุมงานรันเอง | ✅ | `qc-crm-c2.6` **87/87** · headless **35/35** (`c26-web2.log`) |
| D3 | กลุ่ม X | ✅ | §4 |
| D4 | regression | ✅ | §5 — 25 ชุดเขียว |
| D5 | typecheck · fitness ×2 | ✅ | typecheck exit 0 · fitness 32/32 · noenv 32/32 |
| D6 | build | ✅ | BUILD+serve exit 0 |
| D7 | ภาพ + PARITY | ✅ | §6 (Fable ดูเอง) |
| D8 | testid + ทะเบียน | ✅ | +41 แถว · F14.1/F14.2 · `crm-forms-reserved-*` เป็น `<p>` ไม่ต้องลงทะเบียน |
| D9 | ผู้ตรวจอิสระ | ✅ | ผู้ตรวจของผู้คุมงาน (opus อ่านอย่างเดียว): (a)–(k) ยืนยัน (ticket แข็งกว่าที่ขอ) · **BLOCKER 1** (ชื่อ honeypot ชนฟิลด์ร้าน) + SHOULD-FIX 4 + NOTE 13 → รอบ 2 แก้ครบ (`shark-crm-c20/.qc-shots/c26-r2/`) |
| D10 | เอกสาร/ทะเบียน | ✅ | `crm.web.identified` ทะเบียนเดียว + consumer · docs regen (payload `crm.web.*`) |
| D11 | wo-notes + คืนสภาพ | ✅ | `qc-member-m1.9` 26/26 |
| D12 | push → deploy | ⏳ | รอเจ้าของ push (เติม hash + dpl หลัง deploy) |

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | ids / เหตุผล |
|---|---|---|
| X1 | ใช้ | `X1.1–X1.4` (siteKey/ฟอร์ม/ลิงก์ scoped · crmSystemId ตรวจกับ tenant ก่อนเขียน) |
| X2 | N-A | REST/AI tracking → C2.11 |
| X3 | ใช้ | `X3.1–X3.5` (คลิก 10 ทาง unique/total · collect ขนาน · consent version ขนาน) |
| X4 | ใช้ | `X4.1–X4.2` + `S9.3` (identify ซ้ำ = ครั้งเดียว) |
| X5 | ใช้ | `X5.1` (purge ซ้อน) |
| X6 | ใช้ | `X6.1–X6.3` (URL/ชื่อลิงก์ · payload cap · HTML) |
| X7 | ใช้ | `X7.1–X7.10` + `S9.4` (`/l` `/t/e` `/t/consent` `/f`: unknown เหมือนกัน · limiter hash · CORS · 413 ก่อนอ่าน) |
| X8 | ใช้ | `X8.1–X8.3` (cookie ระบุตัวตนไม่มี · payload/event ไม่มี PII · decline = 0 แถว) |
| X9 | ใช้ | `X9.1–X9.2` (ลบลิงก์/ฟอร์ม audit) |
| X10 | N-A | ไม่มีไฟล์/secret (siteKey สาธารณะ) |
| ร้าน uiVersion 1 | ใช้ | `U.1–U.5` (redirect ไม่นับ · collect 204 ไม่เขียน · purge ทำ · ฟอร์ม v1 เดิม) |

## 5. ผลข้อสอบ
**unit `crm-c26c27-verify` (QC1 seed ใหม่ · 24 ก.ย. 22:40–23:35 UTC · ALLDONE):**
- `migrate diff (must be empty)`: exit=0 · `-`
- `reseed member`: exit=0 · `-`
- `qc-member-m1.1`: exit=1 · `{"total":28,"passed":27,"findings":[{"id":"M1.1-S4.2","sev":"CRITICAL"}]}`
- `seed crm #1`: exit=0 · `-`
- `seed crm #2`: exit=0 · `-`
- `DRAIN`: exit=0 · `{"total":4,"passed":4,"findings":[]}`
- `gen-crm-api-docs (early)`: exit=0 · `-`
- `qc-crm-c2.6`: exit=0 · `{"total":87,"passed":87,"findings":[]}`
- `qc-crm-c2.7`: exit=0 · `{"total":63,"passed":63,"findings":[]}`
- `qc-crm-c2.1`: exit=0 · `{"total":84,"passed":84,"findings":[]}`
- `qc-crm-c2.2`: exit=0 · `{"total":73,"passed":73,"findings":[]}`
- `qc-crm-c2.3`: exit=0 · `{"total":80,"passed":80,"findings":[]}`
- `qc-crm-c2.4`: exit=0 · `{"total":91,"passed":91,"findings":[]}`
- `qc-crm-c2.5`: exit=0 · `{"total":105,"passed":105,"findings":[]}`
- `qc-crm-c0.5`: exit=0 · `{"total":50,"passed":50,"findings":[],"unproven":[],"info":{"leaseStyle":"row le`
- `qc-crm-c1.2b`: exit=0 · `{"total":93,"passed":93,"findings":[]}`
- `qc-crm-c1.4`: exit=0 · `{"total":110,"passed":110,"findings":[]}`
- `qc-crm-c1.5`: exit=0 · `{"total":103,"passed":103,"findings":[]}`
- `qc-crm-c1.6`: exit=0 · `{"total":79,"passed":79,"findings":[],"skippedChecks":[]}`
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
- `qc-member-fix-s3`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `qc-chat-core-v2`: exit=0 · `{"total":47,"passed":47,"findings":[]}`
- `qc-nav-functions`: exit=0 · `-`
- `probe-uiversion-gate (no env)`: exit=0 · `{"total":14,"passed":14,"findings":[]}`
- `gen-crm-api-docs`: exit=0 · `-`
- `typecheck`: exit=0 · `-`
- `fitness`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `fitness-noenv`: exit=0 · `{"total":32,"passed":32,"findings":[]}`
- `BUILD+serve`: exit=0 · `-`
- `shots 2.6`: exit=0 · `{"wo":"2.6","user":"owner","shots":[".qc-shots/crm/2.6/crm-tracking-owner-deskto`
- `shots 2.7`: exit=0 · `{"wo":"2.7","user":"owner","shots":[".qc-shots/crm/2.7/pos-register-deal-select-`
- `qc-crm-c2.6-web (headless)`: exit=1 · `{"total":21,"passed":15,"findings":[{"id":"C2.6W-S1.1","sev":"CRITICAL"},{"id":"`
- `serve stop`: exit=0 · `-`
- `qc-member-m1.9`: exit=0 · `{"total":26,"passed":26,"findings":[]}`

สรุป: `qc-crm-c2.6` **87/87** · `qc-crm-c2.7` **63/63** · ถอยหลัง 25 ชุดเขียวทั้งหมด · `qc-member-m1.1` 27/28 (S4.2 = fitness F13.11 docs stale ตอนต้นสคริปต์ก่อน regen — fitness ปลายทาง 32/32 · ลำดับสคริปต์ ไม่ใช่โค้ด) · `qc-crm-c2.6-web` รอบแรก 15/21+FATAL = บั๊กข้อสอบ 4 เรื่อง (`__name` esbuild · UA HeadlessChrome เป็น bot · X4.1 ขัดมติ ticket ครั้งเดียว · console ของ OOPIF) → ORACLE-EDIT (+S1.3 ตัวคุมบวก bot · W9) → รอบสอง (unit `crm-c26-web2` 23:58 UTC · ผู้คุมงานรันเอง): **`qc-crm-c2.6-web` 35/35** · m1.9 26/26

## 6. ภาพ (D7)
spec "2.6" (สร้างลิงก์ 2 · session/consent/identify · ฟอร์ม 1 ผ่าน facade · คืนสภาพ settings byte-exact) · owner
| หน้า | mockup | ภาพจริง | จอ | overflow | จุดต่างที่เห็นเอง |
|---|---|---|---|---|---|
| `/settings/tracking`: เปิดใช้ · โดเมนที่อนุญาต · ข้อความ consent + เวอร์ชัน + ตัวอย่างแบนเนอร์ · retention · โค้ดฝัง shark.js · สถิติ 30 วัน · ลิงก์ติดตาม (สร้าง/QR/ปิด/ลบ · คลิก/คน) | 11 (ครึ่งซ้ายล่าง+ขวาล่าง) | `.qc-shots/crm/2.6/crm-tracking-owner-*` · `crm-tracking-preview-*` · `crm-link-qr-*` | 1440/390 | ไม่มี | mockup รวมทุกอย่างในหน้าเดียว · ของจริงแยก 2 หน้าตาม brief (`/settings/tracking` + `/settings/forms`) · สวิตช์ pixel/คลิกอีเมลอยู่หน้าอีเมล (C2.5) · บล็อก "กล่องอีเมลร้าน" อยู่ C2.5 |
| `/settings/forms`: ต่อฟอร์ม → ระบบ CRM/กฎมอบหมาย/คะแนน/บริษัทจากช่อง/กันสแปม/utm + โค้ดฝัง iframe + เตือนชื่อสงวน | 11 (ขวาบน) | `crm-forms-owner-*` | 1440/390 | ไม่มี | toggle "แจ้ง LINE ผู้ดูแลที่ถูกมอบหมาย" ของ mockup = แจ้งเตือน C2.10 |
| contact 360 บล็อกการเข้าชมเว็บ | 16 | `crm-contact360-web-owner-*` | 1440/390 | ไม่มี | — |
- `PARITY: ผ่าน` (Fable 25 ก.ย.)

## 7. ข้อแย้ง / มติ
- addendum 1–13 + B1–7 CONFIRMED (24 ก.ย.) · ORACLE-EDIT: `locEq` (Location เป็น ByteString ต้อง percent-encode) · fixture S2 consent · **ruling round 2**: B1 ชื่อสงวน · S1 `?v=`+payload visitorId · S2 ticket ครั้งเดียว 15 นาที · S3 body cap ก่อนอ่าน · S4 nonce/honeypot นับ · N7/N8/N10/N12 → ORACLE-EDIT S9.1–S9.6 (81→87)
- builder รอบ 1 พบ/แก้ regression จริง 3 (c1.8-S0.3 · c1.11-S2.4 คอมเมนต์ `*/` · nav S5) + tracker endpoint absolute/clean ฝั่ง client · รอบ 2 พบรูที่สองของ S1 (action รับ visitorId) และ S3 ยังไม่ทำ · ไบต์ดิบ 0x00 ใน regex `tracking.ts` แก้เป็น escape (ของ `deals.ts` เดิมยังอยู่)
- ผลข้างเคียงตามมติ S1: ฟอร์มที่ฝัง iframe ข้ามโดเมน**ไม่ผูกการเข้าชม** (`webSessionId=null`) — ทิศทางปลอดภัย

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| purge ลงทะเบียนเป็นงานรายวัน | R-A | C2.10 |
| REST/AI ของ tracking | X2 | C2.11 |
| path ของ URL อาจมี PII (เก็บ path เต็ม) · session inheritance บนเบราว์เซอร์ร่วม · revoke ไม่ต้อง auth | PDPA handover | C3.9 |
| XFF ตัวแรกเชื่อได้ตาม public-lane เดิม · cache script 5 นาทีหลัง bump version | ทั้งแพลตฟอร์ม | C5 |
| ไบต์ดิบใน regex ของ `deals.ts` (C1.5) | ไฟล์เดิม | C5 |

## 9. คืนสภาพ QC — `qc-c26-*` · CLEAN · `qc-member-m1.9` 26/26
