# SECRETARY-RUN — กติกาเหล็ก · สถานะสด · บันทึกเหตุการณ์ (RUN "เลขา AI" · แอป native + หลังบ้าน)

> สถานะ RUN: **▶️ เดินเครื่อง 4 พ.ย. 2026 ~09:3xZ (เจ้าของสั่ง "เริ่มทำงานได้")** · เดิม ⏸ 3 พ.ย. 15:0xZ รอ weekly reset · เปิด 3 พ.ย. 14:3xZ (เจ้าของตอบคำถาม Q1–Q10 ครบ · เปิดก่อน SVC 100% เพราะข้อที่เหลือของ SVC รอของจากเจ้าของ)
> แผน/ใบงาน = `ledger/SECRETARY-MASTER-PLAN.md` · แบบ+มติ = `ledger/DESIGN-SECRETARY.md` · ภาพ = `ledger/design-secretary/` · กติกาเลน = `ledger/secretary-briefs/sec-brief-COMMON.md` · จุดต่อ = `ledger/SECRETARY-RESUME.md` · prompt = `ledger/SECRETARY-KICKOFF-PROMPT.md`
> ไฟล์นี้ = ที่เดียวที่ผู้คุมแก้สถานะ (§3) และจดเหตุการณ์/มติเทคนิค (§4)

---

## 1. กติกาเหล็ก (ละเมิด = ตีกลับทั้งใบ)
1. ทรีผู้คุม `/root/projects/shark-sec` · branch `session/secretary` ตัดจาก `session/svc` @ e59e5707 (= main a84bca2b + POS v2 940e3aca + SVC v2) · เลน `/root/projects/shark-sec-{b,c,d}` branch `wip/sec-<wo>` · **ห้าม push main · ห้าม deploy · ห้าม EAS/OTA/สโตร์** จนเจ้าของสั่งต่อครั้ง
2. ฐานข้อมูล = ฐาน QC ของ RUN นี้เท่านั้น (`.env.qc-sec` ผ่าน `scripts/qc-sec.sh` · ล็อก `/tmp/shark-gate-sec.lock`) · ห้ามอ่าน/แก้/source `.env` (production) · ห้าม `CI=1`
3. ทุก tsx/tsc/build/qc ผ่าน `bash scripts/iso.sh …` · เพดาน 3 เลนรวมทุกงานบนเครื่อง (เลน 3 เบา) · ห้ามลบ/กวาด `/tmp` · ห้ามแก้สคริปต์ที่ unit กำลังรัน
4. migration เฉพาะ S1.1 (`secretary_a`) เพิ่มอย่างเดียว · core.prisma FROZEN (เบอร์โทร = `UserPhone` ตารางแยก)
5. ด่าน 12 ข้อ + กลุ่ม X + 14 ขั้น = `AI-TEAM-MASTER-PLAN.md` §3–§5 · ตรวจเบาต่อใบ + ด่านเต็มต่อชุด merge = `SVC-RUN.md` §1.4 · **หน่วยงาน = ชุดงาน (batch) ตามแผน §4** (oracle/builder/review/merge ครั้งเดียวต่อชุด) · ตรวจเข้ม 2 reviewer เฉพาะ S1-2 S1-4 S1-5 S1-6 S1-11 S1-13 S1-15 · diff < 150 บรรทัด ผู้คุมตรวจเอง · หน้า layout ล้วนใช้ Sonnet (รายชื่อใน §4)
6. ผู้คุมเขียนข้อสอบ oracle ก่อน (`scripts/qc-sec-<wo>.mts`) · builder ห้ามแก้ข้อสอบ · ORACLE-EDIT โดยผู้คุมเท่านั้น · ผู้คุมเขียนเอกสาร/ใบสั่ง/wo-notes เอง
7. โมเดล: `SHARK_AI_MOCK=1` ทุกใบ · ของจริงเฉพาะ S3a.1 (ผู้คุมรัน · คีย์ shark เท่านั้น)
8. Telegram เฉพาะ `📊 SEC · N% (x/48) · <wo> ✅` หลังปิดใบ + จุดตรวจ CP0–CP5 · ระหว่างพักห้าม tg รายชั่วโมง
9. ภาพ: 1 ภาพคู่ MOCKUP|RENDER ต่อหน้าที่อนุมัติ × สว่าง/มืด · ผู้คุมเปิดดูเองแล้วเขียน `PARITY: ผ่าน/ตีกลับ` · ห้ามรับใบ UI จากคำบรรยาย

## 2. สัญญาต่อใบ (ผู้คุมเติมตอนออกข้อสอบ · ย่อ: ชื่อฟังก์ชัน · ข้อสอบ S-group · จำนวนข้อ)
_(เติมเมื่อถึงใบ)_

## 3. สถานะสด (ผู้คุมแก้ทุกครั้งที่ปิดใบ) — 11/58 (41 ชุด) · 19%

| ใบ | สถานะ | commit | หมายเหตุ |
|---|---|---|---|
| S0.1 | ✅ | 4 พ.ย. ~11:4xZ | REVIEW-SECRETARY-DESIGN-2026-11-04.md (≈230 ชื่อยืนยัน · 38/38 หน้า · K1–K20 · Q1–Q10) → `sec-brief-RESOLUTIONS.md` (f92f3466) · แก้แผน §3 note + คีย์ `chat.message.send` + OTP SMS |
| S0.2 | ✅ | 4 พ.ย. ~12:1xZ | merge 5973db2e (wip/sec-s0.2 e5705e2e) · oracle 30/30 ×3 (ผู้คุมรันเอง forced ×2 + unforced) · ภาพคู่ C3 สว่าง/มืด ตรงแบบ (ผู้คุมดูเอง) · จอ 1.0 /sessions 0 px ต่าง · /login ต่างเฉพาะ orb แอนิเมชัน · light-check โดยผู้คุม (ไม่ใช่ชุดตรวจเข้ม) · มติ R-UI1–UI3 (สเกล 0.73 · Feather · theme-store) |
| S0.3 | ✅ | 4 พ.ย. ~14:4xZ | merge (wip/sec-s0.3 c38d910a) · oracle 52/53 ×3 (D4.3 typecheck SKIP — ผู้คุมรันเองรวมตอน S1.1) · docs/modules/31-secretary.md 460 บรรทัด · SECRETARY-API.md 72 เส้นทาง · seed idempotent (รอบ 2 เขียน 0) · light-check ผู้คุม · oracle `qc-sec-s0.3.mts` (f92f3466 · unforced SKIP · forced 4/29 แดงถูกเหตุผล) · docs/modules/31-secretary.md + docs/api/SECRETARY-API.md + seed-secretary-qc |
| S0.4 | ✅ | 4 พ.ย. ~14:4xZ | pack.ts (FREE_PACK · countsAsJob · quotaMessage · nextResetBangkok · monthKeyBangkok · SECRETARY_LAUNCH_AT) unit ครบใน oracle D3 · pack.ts FREE_PACK 100 งาน/กิจการ/เดือน |
| S1.1 | ✅ | 4 พ.ย. ~15:2xZ | merge (wip/sec-s1.1 fd5922d5) · oracle 66/66 ×3 (ผู้คุมรันเอง) · migration `20261227000000_secretary_a` (16 ตาราง · 28 ดัชนี · 6 FK Cascade · additive) ลง QC แล้ว · baseline `sec-baseline-85751098.txt` 60/60 (qc-mobile-app รันซ้ำหลัง ORACLE-EDIT APP-6.1) · core.prisma +2 back-relation (R-S1.1a) · drift ไม่มี DROP · oracle `qc-sec-s1.1.mts` (4c8709be · 65 ข้อ · unforced SKIP · forced บนฐานเดิม 6/65 แดงถูกเหตุผล) · 🎯 migration secretary_a |
| S1.2 | ✅ | 4 พ.ย. ~16:2xZ | merge (wip/sec-s1.2 1be8df6d) · oracle 28/28 ×3 (ORACLE-EDIT R-2 regex) · regression 6 ชุดเท่า baseline · identity.ts (pure) + secretary.ts · persona snapshot เดิมตรงทุกไบต์ · ใบ S1-2 (S1.2+S1.3) + oracle `qc-sec-s1.2.mts` เขียนแล้ว 4 พ.ย. (unforced SKIP · forced บนฐานเดิม P-1 snapshot ผ่าน · แดง P-2/3/5 ถูกเหตุผล) · รอ S1.1 merge → เลน c · เลขาผูกผู้ใช้ |
| S1.3 | ✅ | 4 พ.ย. ~16:2xZ | **S1.3b ✅** merge (wip/sec-s1.3b 2b0b1fd1 · oracle 13/13 ×2) ปิดช่องรีวิว C/D: อ่านข้ามโมดูลเคารพ OFF · unmapped fail-closed · route คีย์ API ส่ง access · setAccess โหลด membership · แผนตรวจระดับก่อน claim · CRM door · identity bidi/grapheme · หนี้: setAccessAsPlatform ยังไม่มีผู้เรียก (S2.16) · customer_points ยังถูกยื่นเมื่อ point OFF · access-rules.ts (pure) + access.ts · toolVerdict/toolsOfferedTo รับ access · HAND_TOOL_MODULE (27 โมดูล) · ด่านใน executeProposal/runKind (dynamic import กันวงกลม) · หนี้: route คีย์ API ภายนอกยังไม่ส่ง access · propose_plan ปล่อยขั้นของระบบ OFF ไปตกตอนรัน · รวมในชุด S1-2 · 🎯 สิทธิ์ต่อกิจการ×ระบบ |
| S1.4 | ✅ | 4 พ.ย. ~18:0xZ | merge (wip/sec-s1.4 33cfaf47) · oracle 28/28 ×3 (ORACLE-EDIT fixture tenantId) · S1.2 ยังเขียวหลัง merge · regression 9 ชุดเท่า baseline · rooms.ts 329 บรรทัด · ConvSight +memberOf/tenantRooms · roomSightFor/canSeeConversationById · rejectPlan room-aware · 🎯 ห้อง = งาน |
| S1.5 | ✅ | 4 พ.ย. ~20:0xZ | merge (wip/sec-s1.5 d1e0ed19) · oracle 16/16 ×3 · regression 6 ชุดเท่า baseline · worker.ts 279 บรรทัด · minute job `secretary.roomJobs` (crm-cron VPS + outbox hook) · รวม hotfix `secretaryOf().catch` · หนี้: รูปแนบในคิว (ไม่มีคอลัมน์ → secretary_b) · ข้อความ 2 อันในห้องเดียวรันพร้อมกันได้ · docs §6 ห้องปิด · 🎯 คิวเบื้องหลัง |
| S1.6 | ✅ | | รอบ 2 72c1ca3b (เลน b) · oracle 16/16 ×3 · s1.4 28/28 · s1.5 · s1.9 · s1.3b · qc-ai-proposals/plan/mobile-chat เท่า baseline · merge 2edcef81 → session/secretary · ผู้ตรวจ E/F ปิดตาม §J · deviation รับ: rejectPlan ใช้ R-S1.6a · roomPushRecipients ตัด starter ที่ถูกถอน |
| S1.7 | 🔍 | | รอบ 2 580d64d3 · oracle 27/27 ×3 (ผู้คุม) · regressions เท่า baseline (qc-ai-actions CRASH มีใน baseline) · **รอผู้ตรวจ re-check รอบ 2** · builder รอบ 2 (ตัวใหม่) เลน c เริ่ม ~23:4xZ · oracle 27 ข้อ (31ac2f7e) · built 5fbf0b8f · oracle 22/22 ×3 · **ผู้ตรวจ G/H: MERGE-AFTER-FIX** (แผนข้ามด่านอนุมัติ · undo ใช้สิทธิ์ผิด+ทับของคนย้ายทีหลัง · taxId/lineId หลุดเข้า log · member.points ไม่นับเงิน · gate ไม่ fail-closed) → §K + oracle รอบ 2 · builder เลน c รอบ 2 |
| S1.8 | 🔁 | | รอบ 2 ร่วม S1.7 · รวมในชุด S1-6 · actions.ts 334 บรรทัด · UNDOABLE 5 kinds · 🎯 บันทึก + ย้อน 24 ชม. |
| S1.9 | ✅ | | built 9a46aef3 (เลน d) · ORACLE-EDIT s1.9-R-4 (a1dc3572: เทียบจำนวนห้องก่อน/หลัง — รอบ R-3 งาน DAILY ของ owner เปิดห้อง 3 โดยชอบ) · 10/10 ×3 · qc-ai-schedule 8/8 · merge ad938ac6 · หนี้: channels ['room'] ยัง push (worker.ts นอกใบ → S1.23) · runRoomJobs limit 1 รันงานเก่าสุดในคิว · MONTHLY วัน 29–31 ไม่รันเดือนสั้น (ตามสัญญา isDue) |
| S1.10 | ✍️ | | ใบ S1-8 (S1.10+S1.15) + oracle `qc-sec-s1.10.mts` (6000cfb1) พร้อม · ตีกลับ + สอน |
| S1.11 | ✍️ | | ใบ S1-9 (S1.11+S1.16) + oracle `qc-sec-s1.11.mts` (15 ข้อ: digest เทียบ SQL · suggestions · inbox 2 ร้าน) พร้อม · ข้อเสนอ + กล่องรวม |
| S1.12 | 🔨 | | builder Opus เลน d `wip/sec-s1.12` @cd37937d เริ่ม 5 พ.ย. ~00:5xZ · ใบ S1-10 + oracle `qc-sec-s1.12.mts` (14 ข้อ) พร้อม (tool send_customer_message · kind chat.send · sendReply clientMessageId) · เครื่องมือที่ขาด (chat.send) |
| S1.13 | 🔨 | | builder Opus เลน b `wip/sec-s1.13` @31ac2f7e เริ่ม 4 พ.ย. ~23:4xZ · ใบ S1-11 + oracle `qc-sec-s1.13.mts` พร้อม (canRunAi · ensureWallet ไม่ GRANT ร้านใหม่ · quotaStatus · GET usage ไม่เขียน) · 🎯 โควตางาน |
| S1.15 | ✍️ | | รวมในชุด S1-8 · 🎯 วงจรเรียนรู้ |
| S1.16 | ✍️ | | รวมในชุด S1-9 · ข้อมูลสดรายวัน |
| S1.17 | ✅ | | built 998129a2 (เลน d) · oracle 10/10 ×3 · s1.5/s1.6/s1.9 + qc-support/mobile-help/push/chat-push-badge/notify-v2 เท่าเดิม · merge cd37937d · deviation รับ: push.ts รับ tickets หลายรูป · ASSIGNED กรองเฉพาะ inbox · หนี้: channels ['room'] ยัง push (scheduled.ts) · ai.room.member_added ยังไม่ emit · support_open_case ใช้ 'ai-assistant' (tools.ts) · pref ร้าน tenantId null ซ้ำได้ใต้ concurrent |
| S1.19 | ✅ | 4 พ.ย. ~21:1xZ | merge (wip/sec-s1.19 b52e0a48) · รอบ 1 รีวิว 2 คน BLOCK (CRITICAL อีเมลไม่ยืนยัน) → รอบ 2 ตาม RESOLUTIONS §H · oracle 26/26 ×3 (ORACLE-EDIT Q-3 · R2-Q-2 · R2-ENV) · regression 5 ชุดเท่า baseline · placeholder `<เบอร์>@phone.shark.in.th` + prefs.pendingEmail · normalizeThaiMobile · mock ถูกเมินใน production · 503 เมื่อไม่มีผู้ให้บริการ · deviation รับ: resendAfterSec คงที่ 60 ใน route (กันรั่ว) · otp_used · หนี้: S1.19b ยืนยันอีเมล · index PhoneOtp(ip,createdAt) → secretary_b · step-up เปลี่ยนเบอร์ · 🎯 SMS OTP เบอร์ = ID (รอคีย์ SMS จากเจ้าของ · โหมด mock ก่อน) |
| S1.20 | ✅ | 4 พ.ย. ~19:2xZ | merge (wip/sec-s1.20 59333ba5) · oracle 19/19 ×3 · regression 6 ชุดเท่า baseline · raw fetch Messages API · `AI_PROVIDER=anthropic` + `SHARK_ANTHROPIC_KEY` (เจ้าของตั้งตอน S3a.2) · หนี้: pricing sonnet 5 คิด 3/15 (จริง 2/10) · cache token คิดเต็ม · ยังไม่เคยยิง API จริง · Anthropic ตรง (รอคีย์ shark จากเจ้าของ · mock ก่อน) |
| S1.21 | ✍️ | | ใบ S1-15 (S1.21+S1.24) + oracle `qc-sec-s1.21.mts` (ee9db7ca) พร้อม · 🎯 แชทลูกค้า API มือถือ |
| S1.22 | ✍️ | | ใบ S1-16 `sec-brief-S1.22.md` (customer-context · after-hours · migration secretary_b 3 คอลัมน์ AiSettings) · oracle ยังไม่มี · 🎯 สะพานเลขา↔ห้องลูกค้า |
| S1.23 | ✅ | | รวมในชุด S1-12 · notify.ts (prefs · badge · กันสแปม per-process) · merge cd37937d |
| S1.24 | ✍️ | | รวมในชุด S1-15 · 🎯 ผู้ดูแล · เรียกช่วย · กฎรับเรื่อง · เข้าเวร |
| S1.25 | ✍️ | | ใบ S1-17 + oracle `qc-sec-s1.25.mts` (15 ข้อ) พร้อม (createTenantFromApp · StaffInvite · levels ปิด/ดู/ใช้งาน) · 🎯 กิจการ/เชิญ/สิทธิ์ต่อคน API |
| S1.14 | ✍️ | | ใบ S1-18 `sec-brief-S1.14.md` (ตารางเส้นทาง + sec-real-path.mts) · oracle ยังไม่มี · 🎯 API ชุดเดียว + เส้นทางจริง 3 เส้น (ปิด S1) |
| S2.1 | ⬜ | | โครงแอป |
| S2.2 | ⬜ | | A1 C3 |
| S2.3 | ⬜ | | A2 |
| S2.4 | ⬜ | | A3 A4 A5 C4 |
| S2.5 | ⬜ | | A6 A7 |
| S2.6 | ⬜ | | A8 push |
| S2.7 | ⬜ | | B1 B2 B8 |
| S2.8 | ⬜ | | B3 B4 B5 |
| S2.9 | ⬜ | | B6 B7 |
| S2.10 | ⬜ | | D1 D2 D3 |
| S2.11 | ⬜ | | C1 |
| S2.12 | ⬜ | | 🎯 สมัคร/เข้า (SMS OTP) |
| S2.15 | ⬜ | | H1 H2 |
| S2.16 | ⬜ | | H3 H4 backoffice |
| S2.17 | ⬜ | | K1 รายการลูกค้า |
| S2.18 | ⬜ | | 🎯 K2 ห้องแชทลูกค้า |
| S2.19 | ⬜ | | K3 K4 K5 |
| S2.20 | ⬜ | | แถบบนใหม่ + push + ภาพคู่ K |
| S2.13 | ⬜ | | โหมดมืด 30 หน้า |
| S2.14 | ⬜ | | ปิด S2 ต่อ API จริง |
| S3a.1 | ⬜ | | 🎯 ข้อสอบรวม + นักล่า + โมเดลจริง |
| S3a.2 | ⬜ | | ขึ้น prod (รอเจ้าของ) |
| S3a.3 | ⬜ | | 🎯 TestFlight/Internal (รอเจ้าของ) |
| S3a.4 | ⬜ | | รับผลทดสอบ |
| S3b.1 | ⬜ | | เอกสาร/ข้อตกลง |
| S3b.2 | ⬜ | | ภาพสโตร์ |
| S3b.3 | ⬜ | | ยื่นสโตร์ (รอเจ้าของ) |

## 4. บันทึกเหตุการณ์ · มติเทคนิค
- **3 พ.ย. ~14:3xZ** เปิด RUN · worktree `/root/projects/shark-sec` @ e59e5707 · node_modules bind rw จาก shark-svc (SVC พัก 98% · `prisma generate` จะเขียนลง node_modules ร่วม — SVC ต้อง generate ใหม่ถ้ากลับมา) · คัดลอก DESIGN/MASTER-PLAN/ภาพ (jpg 4.1 MB) เข้า ledger · spawn ผู้สำรวจ S0.1
- มติ: ฐาน QC เลขา = Neon branch ใหม่ `wo-sec-qc` ลูกของ `wo-svc-qc` (มี POS v2 + SVC v2 schema) — ดู §4 ถัดไปเรื่องเพดาน 10 branch
- **3 พ.ย. ~15:0xZ ⏸** เจ้าของสั่งพักก่อนเริ่มใบแรก (รอ weekly reset) · หยุดผู้สำรวจ S0.1 (ยังไม่ได้เขียนไฟล์) · baseline ปล่อยรันต่อ (ไม่ใช้โควตา) · Neon: ลบ `wo-crm-qc3` (CRM จบแล้ว) เพื่อให้มีที่สร้าง `wo-sec-qc`
- **3 พ.ย. ~15:3xZ** baseline บน `wo-sec-qc` (2c2062c7): migrate up to date · 60 ชุด (`qc-ai-*` 26 + mobile/approval/chat) exit=0 ไม่มี failed → `ledger/qc-baseline/sec-baseline-2c2062c7.txt`
- **4 พ.ย.** มติ 14 (เจ้าของ "ทำ · เต็ม · ก่อน TestFlight"): แชทลูกค้ารวมในแอป → ชุด ฉ K1–K4 + แถบบนใหม่ (ซ้าย เลขา·ลูกค้า·ทีม / ขวา ?·+) · แผน +7 ใบ (S1.21–S1.23 · S2.17–S2.20) = 55 ใบ ≈240 ชม. · ถึง TestFlight ≈16–18 วัน · ภาพทุกชุด re-render แล้ว (แถบบนเปลี่ยนทุกหน้า)
- **4 พ.ย.** มติ 15 (เจ้าของ "ทำ"): ผู้ดูแล + เรียกคนช่วย + กฎรับเรื่องอัตโนมัติ/เข้าเวร → K5 + แก้ K1–K3 D1 (ป้ายสิทธิ์แชทต่อคน · ตอบคำถาม "ยามเห็นแชทไหม" = ไม่เห็นถ้าไม่ให้สิทธิ์ `chat.conversation.read`) · +S1.24 → 56 ใบ ≈248 ชม.
- **4 พ.ย.** มติ 16 (เจ้าของ "ปรับปรุงตามที่แนะนำทั้งหมด"): เติม G1–G5 (+S1.25 S2.21–S2.23) · ตัด S1.18/TOPIC/A8 box/A7 รายเดือน/K2 แปล/B7 ย่อ/digest table · S1/S2 เป็น SMS · ไม่มีไมค์ · สี 3 โซน · **41 ชุดงาน** (§4 แผน) · ข้อสอบ UI ร่วม `qc-sec-ui.mts` (ทำใน S0.2) · Sonnet หน้า layout · ตรวจเข้มเฉพาะ 7 ชุด · เส้นทางจริงตอนปิด S1 → 58 ใบ ≈254 ชม. · TestFlight ≈15–16 วัน
- **4 พ.ย. ~09:3xZ ▶️** เจ้าของสั่งเริ่ม · spawn ผู้สำรวจ S0.1 (รอบ 2) · oracle S0.2 → เลน b
- ของที่รอเจ้าของ (ไม่บล็อกโค้ด เพราะ mock ก่อน): คีย์ SMS provider (S1.19) · คีย์ Anthropic "shark" (S1.20) · ยืนยัน Play Console (S3a.3) · W40 POS_DEVICE_KEY (S3a.2)
- **4 พ.ย. ~11:4xZ–12:2xZ** รับ S0.1 → RESOLUTIONS (R-K1…K20 · Q1–Q10 ค่าปริยายทั้งหมด + Q9 editProposal/Q10 account-delete+moduleLevel) · 5 ข้อสำคัญ: K1 สิทธิ์ห้องฝังในรหัส→ขยาย ConvSight · K7 canSpend/GRANT→canRunAi · K8 ไม่มี cron รายนาที→ตอบใน request+after() · K11 เชิญ→StaffInvite · K16 dorm ไม่มี→booking refund · รับ S0.2 (merge 5973db2e) · ff เลน c → spawn builder S0-3 · เลน b → `wip/sec-s1.1`
- **4 พ.ย. ~12:5xZ** oracle S1.1 (4c8709be) → spawn builder S1.1 เลน b · **remount เลน b node_modules เป็น rw** (`mount -o remount,bind,rw /root/projects/shark-sec-b/node_modules`) เพราะ `prisma generate` ต้องเขียน `.pnpm/@prisma+client…/.prisma` (bind จาก shark-svc · ro เดิม) — คืนเป็น ro หลัง merge S1.1 (`mount -o remount,bind,ro …`) · ผลข้างเคียง: client ที่ generate ใหม่ใช้ร่วมทุกทรี (shark-svc/shark-sec/เลน c) — โค้ดเก่าไม่อ้างโมเดลใหม่จึงไม่พัง · SVC กลับมาเมื่อไรต้อง generate ใหม่เอง
- **4 พ.ย. ~13:3xZ ⚠️ เหตุการณ์ node_modules ร่วม:** เลน b (S1.1) รัน `prisma generate` ⇒ client ร่วมรู้จัก 16 โมเดลใหม่ แต่ทรีผู้คุม/เลน c ยังไม่มี scope.ts ⇒ `db.ts` โยน `[scope] 16 model ยังไม่ได้ลงทะเบียน` ตอน boot (fitness pre-commit แดง · seed/oracle ของเลน c รันไม่ได้) → **pre-merge** 3 commit แรกของ S1.1 (schema+migration+scope · 74e42223) เข้า `session/secretary` = 69542c20 (oracle/baseline ของ S1.1 ยังรันต่อบนเลน b · merge จริงภายหลัง) · แจ้ง S0-3 ff เลน c · บทเรียน: **ใบที่แก้ schema ต้องเป็นใบเดียวที่รันในช่วงนั้น หรือ merge schema+scope ทันทีที่ commit** (จดใน COMMON A.7)
- **4 พ.ย.** ผู้คุมเขียนล่วงหน้า: ใบ S1-2 + oracle `qc-sec-s1.2.mts` (3f1e94c4) · ใบ S1-3 (S1.4) + oracle `qc-sec-s1.4.mts` (d4cbb6ce) · ถาม builder S1.1 เรื่องชื่อ migration `20261227000000` (อนาคต) → ให้เปลี่ยนเป็น timestamp จริง + แก้แถว `_prisma_migrations` บน QC
- **4 พ.ย. ~14:1xZ** รับรายงาน S1.1 รอบแรก 53/65 → ORACLE-EDIT (ผู้คุม): I-* ตัด quote ของ indexdef · M-4/M-5 + chat.prisma/core.prisma · **M-6 ยกเว้น core FROZEN เฉพาะ back-relation 2 บรรทัดบน User** (`secretary AiSecretary?` · `userPhone UserPhone?` — กัน `pnpm drift` DROP FK · ไม่มี SQL) · B-1 เทียบ finished_at จริง (ชื่อโฟลเดอร์ 20261227 ต่อจาก svc_b17 20261226 ยอมรับ · ใบถัดไปต้อง > นี้) · ยอมรับ deviation `tenantId` บน AiRoomMember/AiRoomJob · **qc-mobile-app APP-6.1** แดงเพราะ S0.2 ทำ theme.ts เป็น shim (หลุดจาก S0-2 — ผู้คุมไม่ได้รัน qc-mobile-app ตอนรับ) → ORACLE-EDIT อ่าน theme/light.ts ด้วย · แก้ TS1501 (regex flag s · target ES2017) ใน qc-sec-s0.2/qc-sec-ui · oracle S1.1 บนทรีผู้คุม 64/65 (เหลือ B-1 รอ baseline ของเลน b)
- **4 พ.ย. ~14:4xZ** รับ S0-3 (merge) · แก้ doc §4 ที่เขียนว่า "ไม่มี FK" (SQL มี FK Cascade จริง) · เลน c ว่าง → `wip/sec-s1.2` สำหรับชุด S1-2 (เริ่มได้ก่อน S1.1 ปิดสมบูรณ์ เพราะ schema pre-merge แล้ว)
- **4 พ.ย. ~15:2xZ** รับ S1.1 (merge) · เลน b remount ro คืน · เลน b → `wip/sec-s1.4` ชุด S1-3 · เขียนใบ+oracle S1-4 (S1.5 worker · R-K8b ราง minute-jobs) ล่วงหน้า
- **4 พ.ย. ~16:2xZ** รับ S1-2 (merge) · หนี้จด (นักล่า S3a.1 ตรวจ): (1) `/api/v1/ai/tools/*` (คีย์ API) ไม่ส่ง access level (2) ข้อเสนอจากปุ่ม CRM ออกก่อนด่านระดับ (3) `propose_plan` รับขั้นของระบบ OFF (ตกตอนรัน) · เลน c ว่าง → ใบถัดไป S1-13 (S1.19 SMS OTP)
- **4 พ.ย. ~17:4xZ** เปิดเลน d `/root/projects/shark-sec-d` (worktree · node_modules bind ro จาก shark-svc · .env.qc-sec) สำหรับใบอิสระ S1.20 — เลนรวม 3 (b/c/d) ตามเพดาน · S1.4 รอบสอง (rejectPlan) กำลังปิดบนเลน b
- **4 พ.ย. ~18:0xZ** รับ S1.4 (merge) · เลน b → `wip/sec-s1.5` ชุด S1-4 (คิวเบื้องหลัง) · ถัดไปเมื่อเลนว่าง: S1-5 (S1.6) · S1-6 (S1.7+S1.8)
- **4 พ.ย. ~19:2xZ** รับ S1.20 (merge · light-check) · รีวิว S1.19 (A ความปลอดภัย · B สัญญา) ⇒ BLOCK → RESOLUTIONS §H · รีวิวย้อนหลัง S1-2 (C สิทธิ์ · D regression) ⇒ FIX-NOW: `upcoming_schedule`/`financial_summary`/`growth_recommendations`/`customer_points` อ่านข้ามโมดูลที่ OFF · `secretaryOf` ต้อง .catch · FIX-LATER ก่อน S1.14: route คีย์ API ส่ง access · setAccess โหลด membership เอง · แผนตรวจระดับทุกขั้นก่อน claim · ประตู CRM · → ออกใบ **S1.3b** (เลน d) 
- **4 พ.ย. ~20:0xZ** รับ S1.5 (merge) · ORACLE-EDIT s0.3 ชื่อฟังก์ชัน (getAccess/roomSightFor) · ใบ S1-2b (S1.3b) + oracle → เลน d · เลน b → `wip/sec-s1.6` ชุด S1-5
- **4 พ.ย. ~21:1xZ** รับ S1.19 รอบ 2 (merge) · เลน c → `wip/sec-s1.7` ชุด S1-6 (S1.7+S1.8 · 2 ผู้ตรวจ)
- **4 พ.ย. ~22:2xZ** รับ S1.3b (merge) · S1.6 เสร็จ (14/14) → ORACLE-EDIT s1.4 G-3 (seeHistory) · spawn ผู้ตรวจ 2 คน S1.6 · เลน d → `wip/sec-s1.9` ชุด S1-7 · ใบ S1-12 (S1.17+S1.23) + oracle เขียนแล้ว
- **4 พ.ย. ~23:0xZ** รีวิว S1.6 (E สิทธิ์ · F สัญญา) ⇒ แก้รอบ 2 (§J) · ใบ S1-15 (S1.21+S1.24) เขียนแล้ว · เตรียมครบถึง S1-15 — เหลือ S1.11+S1.16 · S1.22 · S1.25 · S1.14 ที่ยังไม่มีใบ

- **4 พ.ย. ~23:2xZ** S1.9 ✅ (ORACLE-EDIT R-4 ของผู้คุมผิดเอง) merge ad938ac6 · S1.6 รอบ 2 ✅ merge 2edcef81 · ผู้ตรวจ G/H ชุด S1-6 → MERGE-AFTER-FIX 4 MAJOR ร่วม (แผนข้ามด่าน R-K4 · undo สิทธิ์/สถานะเก่า · PII ใน log · kind-class) → §K รอบ 2 · tip 2edcef81 · **15/58 (26%)**
- **4 พ.ย. ~23:4xZ** §K + oracle s1.7 รอบ 2 (27 ข้อ · 31ac2f7e) · spawn 3 เลน: c=S1-6 รอบ 2 · b=S1-11 (S1.13) · d=S1-12 (S1.17+S1.23)
- **5 พ.ย. ~00:1xZ** ใบครบทั้ง S1: S1-9 S1-10 S1-16 S1-17 S1-18 เขียนแล้ว (oracle ตามมาเมื่อเลนใกล้ว่าง · ลำดับ spawn: S1-10 → S1-9 → S1-15 → S1-16 → S1-17 → S1-18)
- **5 พ.ย. ~00:5xZ** S1.17+S1.23 ✅ merge cd37937d · เลน d → S1-10 (S1.12) · S1-6 รอบ 2 27/27 รอ re-check · **15/58 (26%)**
