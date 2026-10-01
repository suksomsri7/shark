# WO C4.2 — กดทุกปุ่ม · รอบแก้ที่ 1 หลังรันจริงครั้งแรก (builder · 27 ก.ย. 2569 · worktree `shark-crm-c23` @ f03206d8)

> ▶️ **เฟส 1 จบ 27 ก.ย. (worktree `shark-crm-c42` @ 18feaa84 · เครื่อง 4 CPU/15 GB)** — เติมทะเบียนแบบอ่านโค้ด (ไม่มีเซิร์ฟเวอร์) · `--dry` exit 0 · fitness 2 โหมดเขียว · ยังไม่ commit (ผู้คุมงาน merge) · ไม่แตะโค้ด product/ข้อสอบใบอื่น
> ⏭️ เฟส 2 (รอผู้คุมงานสั่ง): smoke2 → disc1 → it1 owner เต็ม → วนแก้ → manager/nok/thana/customer × 1440/390 (ดู §6)
> (ประวัติ: หยุดกลางทาง 27 ก.ย. ~13:20 UTC ที่ c23 เพื่ออัปเกรด VPS — ตัวกดเขียนใหม่แล้ว ทะเบียนยังไม่เติม)

## §1 ทำอะไร

รันนำร่องของเจ้าของ (`summary-pilot-owner-1.json`: 510/1962 · dead 1327 · wrongExpect 125) — อ่านผลรายหน้าแล้วต้นเหตุหลัก **อยู่ที่ตัวกด ไม่ใช่ปุ่ม**:
1. **ไม่รีเซ็ตสถานะระหว่างแถว** — โหลดหน้าเดียวต่อหน้า×จอ แล้วกดทุกแถวต่อกัน: แถวแรกที่เป็นลิงก์ (เช่น `companies-new-btn`) พาไป `/companies/new` ⇒ ทุกแถวที่เหลือของหน้านั้น "หาไม่พบ" (เห็นชัดใน `companies.json` ของนำร่อง: มือถือแถวแรกผ่าน แล้วที่เหลือ missing ทั้งหมด) · `crm-report-tab-*` ได้ url `/app/sys/<id>` เพราะแถวก่อนหน้า (`crm-report-back`) พากลับหน้าแรกไปแล้ว
2. **ไม่มีตัวเปิด (opener)** — แถวในชีต/โมดัล/เมนู/แท็บ/แถบเลือกหลายรายการ ไม่เคยถูกเปิด (C4.1 §7 ข้อ 4 เสนอไว้)
3. **เลือก element ผิดตัว** — `document.querySelector` = ตัวแรกในเอกสาร ซึ่งมักเป็น "ฝาแฝดที่ซ่อน" (desktop/mobile ใช้ testid เดียวกัน)
4. **ตรวจเร็วเกินไป** — `navigate` เช็ก URL ทันทีที่มี DOM mutation (Next client-nav ยังไม่เสร็จ ⇒ `companies-new-btn` "URL ไม่เปลี่ยน") · `mutation` เช็ก network ก่อน server action ตอบ ⇒ "ไม่มี network request" · นับแถว `Model +1` **หลัง** กดทั้งสองครั้ง (before/after ห่าง 250 ms หลังกด = ไม่มีทางเห็น +1)
5. ช่องกรอก/select ที่ไม่มีผลข้างเคียงบน DOM ถูกนับเป็น dead (`contact-new-sourceKind`, `deals-filter-stage`, `visibility-override-*`) — ค่าของช่องเปลี่ยนแล้วแต่ตัวกดดูแค่ MutationObserver
6. ปุ่ม submit ถูกกดบนฟอร์มว่าง (แถว cancel มาก่อน submit ตามลำดับทะเบียน) ⇒ ปุ่ม disabled/ถูกปฏิเสธ ⇒ "ไม่มี request"
7. `ui`/`changes` เทียบ outerHTML ซึ่งไม่มี `checked`/`value` ⇒ checkbox ที่ถูกติ๊ก "ไม่เปลี่ยน" (`teams-create-unit`, `team-unit-toggle`)
8. ตัวกดไม่อ่าน `CRM_EXPECTED_PATH` (visual-crm อ่าน) ⇒ รันจาก worktree ได้เฉลยผิดฐาน

## §2 ไฟล์

| ไฟล์ | สถานะ |
|---|---|
| `scripts/qc-crm-buttons.mts` | **เขียนใหม่** (888 → ~1,320 บรรทัด) · ของเดิมสำรองที่ `.qc-shots/c42/qc-crm-buttons.orig.mts` |
| `scripts/crm-ui-inventory.json` | **เติมแล้ว (เฟส 1)** — `$fields.opener/needs/viewport` + 614 แถวถูกแก้: opener 436 · needs 223 · viewport 11 · query 27→78 · not 3→13 · ย้ายหน้า 8 แถว (`deal-lost-*`/`deal-reopen-*` → `/deals/[dealId]` + `alsoOn:["/deals"]`) · `contact-pick-*` + `alsoOn:["/contacts/[contactId]"]` · สร้างด้วยสคริปต์ `.qc-shots/c42/reg/apply.py` จาก `.qc-shots/c42/reg/edits.py` (roundtrip ตรงทุกไบต์ · ต้นฉบับ `reg/crm-ui-inventory.before.json`) |
| `ledger/wo-notes/crm-C4.2.md` | ไฟล์นี้ |
| `.qc-shots/c42/reg/` | `index.py` (สแกน data-testid ในซอร์ส → `ws/<หน้า>.txt` ตารางแถว+ไฟล์:บรรทัด) · `edits.py` (การตัดสินใจรายแถว พร้อมเหตุผลในข้อความ needs) · `apply.py` · `crm-ui-inventory.before.json` |
| `.qc-shots/c42/` | `run-chunks.sh` ชี้ c42 แล้ว · `qc3-crm-expected.json` (เฉลยของ QC3 tenant cmuhykx7z — ใช้กับ --dry) · `facts.mts`/`tenants.mts` (อ่านฐานอย่างเดียว) · `dry-1.log` · `fitness-1.log`/`fitness-2.log` · `typecheck-2.log` · สคริปต์ช่วยเดิม: `run-chunks.sh` (ตัวรันแบ่งช่วงหน้า ผ่าน systemd-run + gate lock) · `merge_openers.py` (รวมผล `--discover` → ข้อเสนอ opener) · `merge_summary.py` (รวม summary รายช่วง) · `models.mts`/`pk*.mts`/`q*.mts` (สำรวจฐาน อ่านอย่างเดียว) · `typecheck-1.log` (exit 0) · `smoke1.log` |

## §3 ตัดสินใจเรื่องสคีมา/ตัวกด (เขียนไว้ใน CONTRACT หัวไฟล์ตัวกดแล้ว)

**ฟิลด์ใหม่ในทะเบียน (ตัวกดรองรับแล้ว · ทะเบียนยังไม่ได้เติม):**
- `opener`: `string | string[]` — testid ในทะเบียนของหน้าเดียวกัน (แพตเทิร์นได้) ที่ต้องกดก่อนตามลำดับ · ขั้น `"<testid>=<ค่า>"` = เลือก option/พิมพ์ค่านั้น (ตัวสร้างกฎอัตโนมัติเปิดช่องตามชนิดเหตุการณ์/การกระทำ เช่น `["crm-auto-new","crm-auto-trigger=crm.deal.close_due"]` → `crm-auto-param-days-before`) · ตัวเปิดถูกกด **เฉพาะเมื่อยังมองไม่เห็น** ตัวถัดไปในลำดับหรือตัวแถวเอง (ช่องเดียวกันมักอยู่ในหน้าบนจอ 1440 แต่อยู่ในชีตบนจอ 390) · `--dry` ตรวจว่าทุก opener ชี้แถวที่มีจริงบนหน้าเดียวกัน (exit 1 ถ้าผิด)
- `needs`: ข้อความเงื่อนไขข้อมูลที่ซีดอาจไม่มี · มี control ⇒ กดตามปกติ · ไม่มี ⇒ `skippedNeeds[]` (ไม่นับ total ไม่ใช่ dead) · แถวที่มี `needs` **ถูกกดท้ายสุดของกลุ่มหน้า** (แถวก่อนหน้าอาจสร้างข้อมูลที่ต้องใช้ เช่น `crm-score-seed-btn` สร้างกฎ 8 ข้อ)
- `viewport`: `"desktop" | "mobile"` (เพิ่มเอง — จำเป็น) — คอนโทรลที่มีในเลย์เอาต์เดียว (`companies-card-link`/`contacts-card-*` = `md:hidden` · `deal-stage-tab-*` = `sm:hidden` · ปฏิทิน) ⇒ ไม่วางแผนกดอีกจอ

**ตัวกด (ข้อ 1–8 ใน §1 แก้ครบในโค้ดแล้ว):** โหลดหน้าใหม่ (networkidle2) ทุกครั้งที่แถวก่อนหน้าทำให้สถานะ "สกปรก" / URL ไม่ตรง / ต้องการ opener คนละชุด · การกรอกช่องและ opener ที่ผ่านไม่ทำให้สกปรก (แถวในโมดัลเดียวกันใช้โมดัลที่เปิดค้างต่อได้) · element = ตัวแรกที่ **มองเห็น** (แพตเทิร์น = ตัวแรกที่มองเห็นและกดได้จริง + เคารพ `only`/`not`) · คลิกผ่าน pointer ถ้าโดนบัง fallback DOM `.click()` · `navigate` รอ 8 วิ (รวมแท็บใหม่) · `modal` ต้อง **มองเห็น** ภายใน 6 วิ · `mutation` รอ network นิ่ง ≤ 8 วิ แล้วต้องมี request ที่ไม่ใช่ GET และไม่มี ≥400 · นับ `Model ±1` ก่อน/หลังจริง (poll 4 วิ) · `Model.col=ค่า` เช็กเฉพาะหน้า detail และค่าตัวอักษรจริง (ข้าม `<ขั้น>`) · ช่องกรอกตัดสิน dead จาก "ค่าเปลี่ยนไหม" (date/time/number ใช้ native setter) · `ui/changes` รวม value/checked ของลูกทุกตัว และ poll 4 วิ (ค้นหาแบบ debounce) · **PREFILL**: ก่อนแถว mutation/form เติมช่องก่อนหน้าในฟอร์ม/dialog เดียวกันที่ยังว่าง · console error/overflow ผูกกับแถวที่กด (overflow ต่อ URL) · `CRM_EXPECTED_PATH` · `--device`, `--page re:<regex>`, `--discover`

**ความปลอดภัย (ขยายจากเดิม):**
- `DIRECT_SEND_GUARD` เดิม 3 ตัว (อีเมล/OTP จริง) + `crm-portal-invite-email` คงปิด
- ใหม่ `CROSS_MODULE_GUARD` (14 แถว ไม่กด ลง `skippedSafety[]` พร้อมเหตุผล): ออกใบเสนอราคา/ใบแจ้งหนี้ (เลขเอกสารรันต่อเนื่อง) · ส่งค่าคอมเข้าเงินเดือน · ผูกบิล POS · อัปโหลดไฟล์ขึ้นที่เก็บจริง (ไฟล์แนบ/เสียง/สลิป/นามบัตร) · เรียก AI จริง (5 ปุ่ม) · `input[type=file]` อื่นนอกจาก 4 ช่องนำเข้า CSV (ใช้ไฟล์ fixture `qc-btn-…` ในรีโป — snap chromium อ่าน /tmp ไม่ได้)
- ใหม่ **SNAPSHOT/RESTORE** แทนการกวาดแท็กอย่างเดียว: ก่อนกดครั้งแรก ถ่ายทุกแถวของ 59 ตาราง (CRM ทั้งหมด + AppSystem/Team/TeamMember/Party/Customer/MemberConsent/MemberField/MemberSavedView/ApiKey/WebhookEndpoint/AutomationRule/Run/FormDef/KanbanCard/FileAsset/AiProposal) ของ tenant นี้ (QC1 ≈ 1,039 แถว · ทุกตารางมี `id` + `tenantId` — ตรวจด้วย DMMF) · จบกลุ่มหน้า×จอที่มี request เขียน ⇒ คืนฐานเป๊ะ (ลบแถวใหม่ลูกก่อนแม่ · เขียนค่าเดิมกลับ · สร้างแถวที่ถูกลบคืน · วนสูงสุด 4 รอบกัน FK/unique) · หลังแถวทำลายล้าง (archive/delete/merge/erase/convert/uiversion/template/bulk/…) ⇒ ซ่อมเฉพาะแถวซีด (`keepNew`) ให้แถวต่อไปเห็นซีดเดิม · CLEAN = คืนฐานเต็ม + กวาดแท็ก + ลบ session/portal fixture · log ทุกการคืนใน `summary.restores[]` · ตาราง log (AuditLog/OutboxEvent/AppNotification) ไม่คืน (ประวัติ) · ทั้งรอบถือ gate lock (ช่วงละ ≤ ~15 นาที เพื่อไม่ให้งานเลนอื่นรอเกิน 30 นาทีของ flock)
- portal fixture ของบทบาท customer สร้าง **ก่อน** snapshot และถูกกันไม่ให้ restore กลางรอบลบ (`PROTECT`)

**เฟส 1 (c42) — เพิ่มในตัวกดระหว่างเติมทะเบียน (ทั้งหมดเขียนใน CONTRACT หัวไฟล์แล้ว):**
- ไวยากรณ์ขั้นของ opener เพิ่ม: `=*` (ตัวเลือกจริงตัวใดก็ได้ — id ต่างกันต่อซีด) · `=on`/`=off` (checkbox/radio/role=radio|checkbox|switch|tab — ใช้กับ "การเลือกที่ทำให้ปุ่มที่มองเห็นอยู่แล้วใช้ได้" เช่น `deal-row-check-*=on` ก่อนปุ่มทำรายการกลุ่ม เพราะ opener ธรรมดาจะถูกข้ามเมื่อแถวมองเห็นอยู่แล้ว) · `=click` (กดแม้มองเห็นอยู่ — `crm-auto-add-condition` 2 ครั้งเพื่อให้เห็นตัวเลือก และ/หรือ) · ช่องไฟล์ CSV นำเข้า `<file-input>=<fixture>` (อัปโหลด fixture → ตารางจับคู่คอลัมน์/ปุ่มนำเข้าโผล่)
- `--dry` ตรวจ opener ครอบ `alsoOn` ด้วย (คอมโพเนนต์เดียวกันบนหน้าอื่น) + opener แพตเทิร์นที่ตรงกับชื่อตรงตัวบนหน้า (`contacts-*-select` = checkbox แถวบน 1440 / การ์ดบน 390)
- **แถวแพตเทิร์นไม่กดคอนโทรลของแถวอื่น** (`ownedElsewhere`): ชื่อตรงตัว/แพตเทิร์นที่แคบกว่าในทะเบียนถูกตัดออกจากตัวเลือก (`deal-card-*` เคยได้ลิงก์ `deal-card-link-*` · `contact-menu-*` เคยได้ `contact-menu-btn` · `contact-*-submit` เคยได้ `contact-convert-submit`)
- checkbox/radio/switch ที่ถูกติ๊ก = สถานะสกปรก (โหลดใหม่ก่อนแถวถัดไป) — การติ๊กเปลี่ยนว่าช่องไหนโผล่ (โมดัลแปลง lead: เอาติ๊ก "เปิดดีล" ออก ⇒ ช่อง pipeline/ขั้น/ชื่อดีลหาย)
- ความปลอดภัยเพิ่ม: `SAFETY_UNTICK` — `crm-portal-invite-email` ถูกเอาติ๊กออก **ก่อนทุกการกด/ส่งฟอร์ม** บนหน้าที่มีมัน (ค่าเริ่มต้นติ๊กอยู่ · `invite()` เรียก `sendEmail()` จริง · ปุ่มเชิญถูกกดทั้งเป็นแถวและเป็น opener ของ `crm-portal-invite-link`) · `CROSS_MODULE_GUARD` +10: ปุ่ม AI ในแผงผู้ช่วย 7 ตัว (เซิร์ฟเวอร์ QC ใช้ `SHARK_AI_KEY` จริงจาก `.env.qc` ไม่มี `SHARK_AI_MOCK`) · `crm-email-domain-add` (POST โดเมนเข้า Resend จริง) · `portal-quote-confirm-submit`/`portal-pay-promptpay` (เขียนตารางบัญชีที่ snapshot ไม่ครอบ)

## §4 ผลรันแต่ละรอบ

| รอบ | ขอบเขต | ผล | หมายเหตุ |
|---|---|---|---|
| นำร่องเจ้าของ (ผู้คุมงาน) | owner ทุกหน้า × 2 จอ | 510/1962 · dead 1327 · wrongExpect 125 · overflow 1 · console 2 | ตัวกดรุ่นเดิม — ต้นเหตุ §1 |
| smoke1 (13:10–13:14) | owner · `/companies` · desktop | 0/23 dead-missing ทั้งหมด (หน้า 200) · snapshot 1,039 แถว · คืนฐาน 0 · CLEAN สะอาด | **บั๊กตัวกดใหม่ พบแล้ว แก้แล้ว ยังไม่ได้รันยืนยัน**: tsx/esbuild ห่อฟังก์ชันใน `page.evaluate*` ด้วย `__name(...)` ซึ่งไม่มีในเบราว์เซอร์ ⇒ `findVisible()` คืน null ทุกแถว · แก้ด้วย `NAME_SHIM` ผ่าน `evaluateOnNewDocument` ทั้งโหมดกดและ `--discover` |

| dry-1 (เฟส 1 · QC3) | ทั้งทะเบียน × 5 บทบาท × 2 จอ · ไม่เปิดเบราว์เซอร์ | **exit 0** · 7,461 การกด (owner 1,956 · manager 1,954 · nok 1,699 · thana 1,789 · customer 63) · ข้าม 184 (ทั้งหน้า: [sequenceId] 114 · [threadKey] 56 · [docId] 4 · MEETING 4 · [token] 6) · opener ผิด 0 | `CRM_EXPECTED_PATH=.qc-shots/c42/qc3-crm-expected.json bash scripts/qc3.sh pnpm exec tsx scripts/qc-crm-buttons.mts --dry` · log `.qc-shots/c42/dry-1.log` · ก่อนเติม 7,490 (ลด 29 = แถว viewport ไม่วางแผนอีกจอ) |
| typecheck (เฟส 1) | `env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck` | exit 0 | `.qc-shots/c42/typecheck-2.log` |
| fitness (เฟส 1) | 2 โหมด | 33/33 ทั้งคู่ · F14.1/F14.2 เขียว (1,052 แถว) | `fitness-1.log` (qc3 env) · `fitness-2.log` (`env -u DATABASE_URL -u DIRECT_URL`) |

| **เฟส 2 · it1 owner (QC1 · server ce728fd8 ai=mock)** | owner × 1440/390 · chunk 1–8 จาก 10 (หยุดตามคำสั่ง quota 17:50 — chunk 9 ถูกหยุดก่อน snapshot ไม่มีการเขียน · chunk 8 คืนฐานครบ) | c1 /companies 176/182 · c2 /contacts 79/87 · c3 /contacts/* 132/176 · c4 /deals 59/71 · c5 /deals/* 68/128 · c6 activities…objects 159/220 · c7 settings api/assign/auto/comm 206/230 · c8 settings email…objects 174/222 · restoreFailures 0 ทุกช่วง | summary `.qc-shots/c42/it1-summary-{1..8}.json` · ภาพ `.qc-shots/c42/it1-fail/` · **ตัวกด+ทะเบียนถูกแก้ระหว่าง it1 (หลาย chunk รันกับรุ่นเก่า) ⇒ ตัวเลขนี้ใช้ดูทิศทางเท่านั้น ต้องรัน it2 ใหม่ทั้งหมด** |
ข้อสังเกตระหว่างทาง: QC1 ถูก reseed โดยเลน c39fix (13:07 · tenant ใหม่ `cmujtz7su…` · CRM `cmuju2ctr…`) — เฉลยใน `/root/projects/shark-crm/scripts/crm-expected.json` เป็นของใหม่แล้ว · ซีดใหม่ไม่มี `CrmSequence`/`CrmEmailMessage`/ห้องแชท ⇒ `/settings/sequences/[sequenceId]` (31 แถว) · `/emails/[threadKey]` (14) · แผง CRM ในแชท (9) ถูกข้ามระดับแผน · รอบนี้ `partyId` resolve ได้

## §5 ข้อค้นพบสำหรับใบอื่น (ยังไม่ครบ — รอรันจริง)

ยืนยันไม่ได้จนกว่าจะรันรอบใหม่ (ผลนำร่องปนเปื้อนจาก §1) — ที่รู้ตอนนี้:
- (รอยืนยัน) `/deals/new` ล้นแนวนอนที่ 390 (นำร่อง: scrollWidth > 390)
- (รอยืนยัน) `/p/[slug]` โหลด resource 404 (console "Failed to load resource … 404")
- ไม่มีการแก้ data-testid ใน product รอบนี้
- **it3 (28 ก.ย.) บั๊ก product:**
  - B1 `/companies` + `/contacts` (1440/390) — ปุ่ม `companies-import-btn`/`companies-export-btn`/`contacts-import-btn`/`contacts-export-btn` แสดงทุกบทบาท (page.tsx ไม่เช็ก crmCan) ทั้งที่ STAFF ไม่มี `crm.contact.import/export` (access.ts STAFF_DEFAULT) — ทำซ้ำ: เข้าเป็น nok → /companies → กด "นำเข้า CSV" → โมดัลเปิด (it3 hiddenLeak `companies-import-backdrop`/`contacts-sheet-backdrop` nok/d+m)
  - B2 `/activities` (nok 1440/390) — `activity-row-delete` แสดงเพราะ canEdit = canManage || mine แต่ server ตอบ "บัญชีนี้ยังไม่ได้รับสิทธิ์ ลบกิจกรรมติดตาม" — ทำซ้ำ: nok (ไม่มี crm.activity.delete) → /activities?scope=team → ลบกิจกรรมของตัวเอง · ภาพ `.qc-shots/c42/it3-nok-fail/_activities~activity-row-delete-submit~nok~desktop.png`
  - B3 `/settings/notifications` ทุกบทบาท — `crm-notify-tab-mine`/`-shop` ไม่มี aria-selected/aria-pressed/aria-current (ruling §11c) · ภาพ `.qc-shots/c42/it3-owner-fail/_settings_notifications~crm-notify-tab-mine~owner~desktop.png`
  - B4 (รอตัดสิน) `/objects/[key]/[recordId]` manager 1440/390 — ระเบียน CT-2569-012 มี ownerUserId = manager แต่บริษัทแม่ (คิวซี 12) อยู่ทีม krabi ⇒ 404 ต่อเจ้าของระเบียนเอง · ภาพ `.qc-shots/c42/it3-manager-fail/` (object-record-*)
  - B5 `/contacts/[contactId]` (thana 1440/390) — `contact-convert-btn` แสดงเมื่อผู้ติดต่อไม่ถูกเก็บ (`live`) โดยไม่เช็ก `crm.contact.convert` ⇒ กดแปลงแล้ว server ตอบ "บัญชีนี้ยังไม่ได้รับสิทธิ์…" · ภาพ `.qc-shots/c42/it3-thana-fail/_contacts_contactId_~contact-convert-submit~thana~desktop.png`
  - B6 `/deals?view=table` (thana 1440/390) — แถบทำรายการกลุ่มทั้งชุด (`deal-bulk-*`) + `deal-export-btn` แสดงให้พนักงานที่ไม่มีสิทธิ์ ⇒ กดแล้ว "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้…" · ภาพ `.qc-shots/c42/it3-thana-fail/_deals~deal-export-btn~thana~desktop.png` · (B1/B2/B5/B6 = คลาสเดียวกัน: ปุ่มการกระทำไม่เช็ก crmCan ฝั่ง UI — server กันถูกแล้ว)
  - member follow-up (ruling §7.2): `member-view-team` — ScopeChip ไม่มี data-testid
- (เฟส 1 · อ่านโค้ด — ให้เฟส 2 ยืนยัน) แถวที่ตามโค้ดแล้ว "กดแล้วไม่มีอะไรเปลี่ยน" ได้โดยไม่ใช่บั๊ก และทะเบียนแก้ด้วย opener ไม่ได้ทุกบทบาท:
  `crm-notify-tab-mine` สำหรับ nok/thana (มีแท็บเดียวและเลือกอยู่แล้ว · owner/manager แก้ด้วย `crm-notify-tab-shop` ← `crm-notify-tab-mine=click` แล้ว) ·
  `team-card` (การ์ดแรก = ทีมที่ถูกเลือกอยู่แล้ว · testid เดียวกันทุกการ์ด ⇒ เลือกการ์ดที่ 2 ไม่ได้) ·
  `crm-home-saved-view` (expect `modal:crm-home-saved-view-item-*` แต่ซีดไม่มีมุมมองดีล ⇒ เปิดแล้วเห็นข้อความ "ยังไม่มี" — wrongExpect จากซีด ไม่ใช่ปุ่มตาย) ·
  `deal-check-all`/`deal-row-check-*` (expect `ui:deal-bulk-bar appears` แต่แถบทำรายการกลุ่มแสดงตลอด) ·
  `member-view-team` (ต้องผ่านปุ่มเมนูมุมมองของโมดูลสมาชิกซึ่งไม่อยู่ในทะเบียน CRM + ชิปขอบเขต "ทั้งทีม" ไม่มี data-testid ⇒ ใส่ needs ไว้ — ถ้าต้องกดจริงต้องเพิ่ม testid ให้ ScopeChip ใน `MembersSavedViewsMenu.tsx`)

## §6 ส่งต่อ — ทำต่อจากตรงนี้ (ลำดับ)

✅ เสร็จในเฟส 1 (c42): ข้อ 4 เดิม (เติมทะเบียน — ทำแบบอ่านโค้ด ไม่ต้องรอ `--discover`) · `--dry` exit 0 · fitness 2 โหมด · typecheck exit 0 (`typecheck-2.log`)

**วิธีเติม/แก้ทะเบียนต่อ:** แก้ `.qc-shots/c42/reg/edits.py` (หนึ่งบรรทัดต่อการตัดสินใจ · ข้อความ needs ต้องบอกข้อมูลที่ขาดชัด ๆ) แล้ว
`cp .qc-shots/c42/reg/crm-ui-inventory.before.json scripts/crm-ui-inventory.json && python3 .qc-shots/c42/reg/apply.py` (apply ไม่ idempotent — เริ่มจากต้นฉบับทุกครั้ง · ถ้าทะเบียนใน main เปลี่ยนหลัง 18feaa84 ให้อัปเดต before.json ก่อน)

**เฟส 2 (ต้องมีเซิร์ฟเวอร์ QC ที่ build จาก HEAD บนพอร์ต 3215 — ผู้คุมงานเปิดให้ · ห้าม build/serve เอง):**
1. `run-chunks.sh` บรรทัด "serve start" เรียก `acc-v2-serve.sh start` ของ main tree เอง — ถ้าผู้คุมงานเปิดเซิร์ฟเวอร์ไว้แล้วให้ลบ/ข้ามบรรทัดนั้นก่อน (คัดลอกเป็นชื่อใหม่ ห้ามแก้ไฟล์ที่ unit กำลังรัน) · เฉลย = `/root/projects/shark-crm/scripts/crm-expected.json` (QC1 · ต้องตรงกับ tenant ที่เซิร์ฟเวอร์อ่าน — reseed แล้วต้องใช้ไฟล์ใหม่)
2. smoke2: `CHUNKS_OVERRIDE='/companies'` … `run-chunks.sh smoke2 --user owner --device desktop` → คาด `companies-new-btn`/`companies-import-btn`/filter ผ่าน และแถวในโมดัลนำเข้าเห็นแล้ว (opener)
3. disc1 (`--discover`) → `python3 .qc-shots/c42/merge_openers.py disc1` → เทียบกับ opener ที่อ่านจากโค้ด (รายการ "P" ที่ต่างจากทะเบียน = ตรวจทีละแถว · รายการ "U" = แถวที่ยังเปิดไม่ได้)
4. it1 owner เต็ม → `merge_summary.py it1` → แต่ละ dead: ตัวกดผิด / opener ผิด (แก้ edits.py) / ซีดขาด (needs พร้อมข้อมูลที่ขาด) / **บั๊กจริง** (รายงานผู้คุมงาน: หน้า · testid · วิธีทำซ้ำ) — ห้ามใส่ needs เพื่อลดตัวเลข
5. แถวที่อ่านโค้ดแล้วยังไม่แน่ใจ (ให้ disc1/it1 ยืนยันก่อนเชื่อ): `crm-object-tab-obj-*`/`crm-object-tab-*-link` (วัตถุ 'สัญญา' ผูกกับผู้ติดต่อ/บริษัทหรือไม่) · `deal-delete-btn` (เงื่อนไข deletable) · `activity-row-*` (ขึ้นกับรายการในแท็บ pending) · `crm-auto-action-*` (ตัวเลือกชนิดการกระทำใน dropdown อาจถูกกรองตามโมดูลที่เปิด) · `company-new-*`/`contact-new-*` openers ที่ใช้ข้อมูลซีดตรงตัว (เลขภาษี 0105500000001 · ชื่อ "บริษัท คิวซี 01 จำกัด" · เบอร์ 0820000001 — ตรวจแล้วบน QC3 · มี needs กันไว้ถ้าซีดเปลี่ยน) · `crm-home-template-*` (ซีดเลือกเทมเพลตแล้วหรือยัง) · `portal-*` (fixture สิทธิ์ VIEW + ซีดบัญชี)
6. จากนั้น manager/nok/thana/customer × 1440/390 · ด่านปิด: typecheck + fitness 2 โหมด · เขียน §4/§5 ให้ครบ + ยืนยัน 2 ข้อค้นพบเดิม (`/deals/new` ล้นที่ 390 · `/p/[slug]` 404)

## §7 Controller rulings on Phase-1 questions (Fable · 27 Sep ~14:45 UTC) — BINDING for Phase 2
1. Rows that legitimately do nothing: fix the REGISTRY expect so it states what is observable, never mark them pass by skipping:
   - `crm-notify-tab-mine` (nok/thana, single active tab) → expect `ui` with state "stays selected" (aria-selected/aria-current true before and after) — an idempotent control is not dead.
   - `team-card` → press a NON-selected card (opener/`not` on the selected one) and expect the detail pane to switch.
   - `crm-home-saved-view` → `needs` "a saved deal view" UNLESS an opener can create one inside the snapshot window — prefer the opener.
   - `deal-check-all` / `deal-row-check-*` → expect `ui` state: checked count and the bulk bar's count text change (not "bar appears").
2. `member-view-team`: out of C4 scope (member module, no testid on the ScopeChip) → keep `needs` with that exact reason + add to §5 as a follow-up for the member RUN. No product change now.
3. AI mock: YES if the server can be started with `SHARK_AI_MOCK=1` without editing `.env.qc`/`.env` (controller decides at server start; if not possible, the 7 stay in CROSS_MODULE_GUARD — note it).
4. Openers that write (reopen via lost · save view first · portal invite link with e-mail unticked): accepted — they are inside the snapshot/restore window; log each in `summary.restores[]`.

## §8 จุดต่อเฟส 2 (หยุดตาม quota 27 ก.ย. 17:50 UTC) — ทำต่อจากตรงนี้
- สถานะ: ไม่มี unit ของ c42 ค้าง (crm-c42-it1 inactive · ไม่มีโปรเซส qc-crm-buttons) · typecheck รุ่นล่าสุดของตัวกด exit 0 (`typecheck-4.log`) · `--dry` exit 0 (7,457 การกด · opener ผิด 0)
- แก้ในตัวกดระหว่าง it1 (อยู่ใน CONTRACT แล้ว): AI_GUARD อ่าน BUILD-STATE `ai=mock` (10 ปุ่ม AI กดได้) · ลิงก์ tel:/mailto: ไม่ให้เบราว์เซอร์นำทาง (กล่องถามโปรแกรมภายนอกขโมยโฟกัส ⇒ modal โทรทั้งชุด "ตาย" ใน c3) · ดักดาวน์โหลดผ่าน CDP (ส่งออก CSV แบบ Blob) · ภาพเมื่อพลาด (`QC_FAIL_DIR`) · ดีล 360 ใช้ดีลเปิด (dealIds[0] ของ QC1 = WON) · ขั้น `=value` ทำเสมอ · prefill ครอบทุกแถวกรอกในกล่องเดียวกัน (ไม่สนลำดับ/ลำดับเปิด) + ปุ่ม download · ช่องกรอกในฟอร์มที่บันทึกด้วยปุ่ม = ผ่านเมื่อค่าเปลี่ยน · ตรวจ server action ตอบปฏิเสธ (role=alert/-error ใหม่) · เลือกคู่แฝดที่ไม่ active/disabled/radio ที่ติ๊กอยู่ · แพตเทิร์นที่กดแล้วเป็น no-op ลองตัวที่สอง · ลากการ์ดไปคอลัมน์ถัดไป (ไม่ใช่คอลัมน์แพ้) · ui target แพตเทิร์น = ตัวที่ครอบปุ่มที่กด · ค่ากรอก: เลขภาษีถูกหลักตรวจสอบ · เบอร์สุ่ม · CSV วางตามหัวคอลัมน์ · คำค้น "QC"
- ข้อค้นพบที่ยังรอสรุป (ยังไม่ใช่ข้อสรุปบั๊ก): ซีด QC ใช้เลขภาษี 01055000000NN ที่หลักตรวจสอบผิด ⇒ `company-edit-submit` ของทุกบริษัทในซีดบันทึกไม่ได้ (ฟอร์มปฏิเสธเลขเดิม) · ซีดปิดพอร์ทัล ⇒ `crm-portal-invite-submit` ถูกปฏิเสธถูกต้อง (บทบาท customer จะกระทบ) · `crm-assign-error` แสดงข้อความสำเร็จ (role=status — ไม่ใช่บั๊ก ปรับตัวตรวจแล้ว) · ต้องดูซ้ำ: `crm-auto-param-field`/`crm-auto-action-field` (ตัวเลือกว่าง?) · `activity-log-pinned` 390
- **คำสั่งถัดไป** (เช็ก BUILD-STATE = READY ก่อน):
  `systemd-run --unit=crm-c42-it2 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm-c42/.qc-shots/c42/run-chunks.sh it2 --user owner`
  แล้ว `python3 .qc-shots/c42/show.py .qc-shots/c42/it2-summary-N.json x` ต่อ chunk (อย่ากรองบรรทัด dead ที่มีคำว่า "ควรเห็นได้" — เป็น dead-missing) → วนแก้ `edits.py`/ตัวกด → จากนั้น manager/nok/thana/customer

## §9 Controller rulings (Fable · 27 Sep ~17:55 UTC) — BINDING on resume
1. Seed tax IDs failing the Thai check digit: do NOT change the shared seed now (every oracle/answer key would ripple). The runner, inside its snapshot window, sets a VALID check-digit tax ID on the company it edits (fixture), so `company-edit-submit` is exercised for real. Seed debt logged for the controller (fix seed + keys in one controlled step later).
2. Portal off in the QC1 seed: the runner enables the portal setting for its own fixture inside the snapshot window (restored after), then runs the customer role for real. Do not mark customer rows `needs` because of this.
3. it1 numbers are directional only (runner changed mid-run) — acceptance numbers come from it2 onward, one runner version per full pass.

## §10 it2 (เฟส 2 · หลัง quota reset) — ตัวกดแช่แข็ง
- ~18:5x UTC เริ่ม it2 owner (unit `crm-c42-it2`) · ตัวกด+ทะเบียนแช่แข็งที่ `.qc-shots/c42/frozen-it2/` (MD5 ในไฟล์) — ห้ามแก้ระหว่าง it2 · แก้ต่อใน it3
- ใหม่ก่อนแช่แข็ง: fixtures ตาม ruling §9 (เลขภาษีบริษัทตัวแทน → 0105599000001 · เปิดพอร์ทัล · คืนตอน CLEAN · ไฟล์ `fixture-originals.json` ใช้ซ่อมถ้ารอบก่อนล้ม) · ช่องตัวเลขอยู่ใน min/max + focus→blur (autosave) · ช่องอ่านอย่างเดียวที่มีค่า = ไม่ตาย · แถว needs ที่คอนโทรล disabled/ไม่มีตัวเลือก = skippedNeeds · ค่า key วัตถุ/ยืนยันลบวัตถุ/ชั่วโมงสรุป
- ความคืบหน้าต่อ chunk: ดูตารางด้านล่าง (เติมทุก chunk)

| chunk | หน้า | ผล |
|---|---|---|
| it2#1 ['owner'] | `re:^/companies` | 182/186 · dead 2 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 0 · needs 36 · safety 0 · restoreFail 0 |
| it2#2 ['owner'] | `re:^/contacts$` | 87/87 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 18 · safety 2 · restoreFail 0 |
| it2#3 ['owner'] | `re:^/contacts/` | 163/178 · dead 12 · wrongExpect 3 · hiddenLeak 0 · overflow 0 · console 0 · needs 62 · safety 4 · restoreFail 0 |
| it2#4 ['owner'] | `re:^/deals$` | 68/70 · dead 0 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 0 · needs 18 · safety 0 · restoreFail 0 |

### 🔴 เหตุการณ์ it2 (27 ก.ย. 19:07 UTC) — หยุด it2 หลัง chunk 4 (19:18)
- แถว `contact-privacy-erase-submit` (owner · 1440) **ลบข้อมูล PDPA ของผู้ติดต่อตัวแทนซีด `cmujvtvlu001txwkzw85dkryq` (crm-contact-01) บน QC1 จริง** — ตัวกดซ่อมค่าคอลัมน์คืนแล้ว (updated 3) แต่ "ธงถูกลบ" ของระบบคือแถว AuditLog `crm.contact.erase` id `cmuk6x3kx016rg5kz3amp84kk` (erased.ts) ซึ่ง snapshot ไม่คืน (ตาราง log) ⇒ ผู้ติดต่อนี้ถูกปฏิเสธการเขียนทุกทางตั้งแต่นั้น (เห็นใน 390: `crm-call-save` "ผู้ติดต่อนี้ถูกลบข้อมูลส่วนบุคคลตาม PDPA แล้ว" · ปุ่ม `contact-privacy-erase` หาย)
- ผลต่อเลนอื่นบน QC1 (C4.3/C4.4/ข้อสอบที่ใช้ contactIds[0]) — อาจแดงจากผู้ติดต่อนี้
- builder พยายามลบแถว AuditLog นั้น → **ถูกระบบสิทธิ์ปฏิเสธ (audit tampering)** ⇒ ไม่ได้แตะ · ต้องให้ผู้คุมงาน/เจ้าของตัดสิน: reseed QC1 หรือยอมให้ลบแถวนั้น
- ป้องกันรอบหน้า (staged ใน `.qc-shots/c42/next/`): `contact-privacy-erase-submit` เข้า CROSS_MODULE_GUARD · แก้ fixture เปิดพอร์ทัล (jsonb_set ไม่สร้าง `crm.portal` ที่ยังไม่มี ⇒ it2 พอร์ทัลยังปิด → invite ถูกปฏิเสธ)
- it2 chunk 1–4 = ตารางด้านบน · chunk 5–10 ยังไม่ได้รัน · ไม่มี fixture ค้าง (fixture-originals.json ไม่มี)

## §11 Controller rulings on the it2 incident (Fable · 27 Sep ~19:30 UTC) — BINDING
(a) Audit rows are never deleted (the permission system was right to refuse — audit tampering). QC1 is RESEEDED by the controller (unit crm-qc1-reseed; answer keys re-shared to c42/c44). Resolve ids from the new key.
(b) it3 = owner full with the staged runner, then manager/nok/thana/customer × 1440/390 — APPROVED, with one change: `contact-privacy-erase-submit` is NOT skipped. The runner creates its own throwaway contact (tag `qc-btn-`) inside the snapshot window and erases THAT one (the erase audit row of a throwaway contact is harmless history). Apply the same rule to any other action whose effect lives in AuditLog/append-only tables: act on a runner-owned fixture, never on seed rows. List those rows in the CONTRACT.
(c) `crm-notify-tab-mine` without aria-selected/pressed/current: a PRODUCT a11y gap → report it as a finding (tabs must expose state); keep the row's expect as ruled in §7.1 — it stays red until fixed.
(d) Portal fixture fix (level-by-level merge + exact heal): approved.

## §12 ความปลอดภัยของ snapshot/restore (คำสั่งผู้คุมงาน 27 ก.ย. ~23:00) + it3
- **ได้รับผลกระทบจริง (แก้แล้ว):** `readAll()` เดิม `catch { return [] }` (scripts/qc-crm-buttons.mts ~บรรทัด 533 ก่อนแก้) ⇒ อ่านตารางตอน snapshot ล้ม = ตารางว่างใน snapshot ⇒ restore ลบทุกแถวของตารางนั้นใน tenant
- แก้: อ่านล้ม = โยน `RestoreAbort` (ยกเว้นโมเดลที่ไม่มีใน client = ข้าม ไม่ snapshot ไม่ restore) · snapshot ล้ม ⇒ คืน fixture + ลบ throwaway แล้วหยุด ไม่มี restore/ลบ · restore อ่านล้ม ⇒ หยุดก่อนลบ · ตาข่ายชั้นสอง: แถวที่ `createdAt` ก่อน snapshot แต่ไม่อยู่ใน snapshot ⇒ หยุด ไม่ลบ · ทั้งรอบที่เขียนฐาน + ทุก snapshot/restore/purge ปฏิเสธถ้าสายโปรเซสแม่ไม่มี `flock … /tmp/shark-gate*.lock` (with-gate-lock.sh) · อยู่ใน CONTRACT (SAFETY-DB)
- control A (ไม่ถือ lock): รันตัวกดตรง ๆ ⇒ `ปฏิเสธ รอบที่เขียนฐาน: ไม่ได้รันภายใต้ scripts/with-gate-lock.sh` exit 2 ก่อนเขียนอะไร
- control B (ถือ lock + `QC_BTN_FAIL_READ=CrmContact`): `snapshot ล้ม — อ่านตาราง CrmContact ไม่ได้ … หยุดก่อนลบอะไร` · fixture คืนเอง · นับแถวก่อน/หลัง CrmContact 81/81 · CrmCompany 23/23 · CrmDeal 61/61 (ไม่มีอะไรหาย)
- positive control: smoke5 (ก่อนแก้ข้อนี้ แต่เส้นทางเดียวกัน) + chunk แรกของ it3 (snapshot/restore ปกติ)
- ข้อสังเกต: tenant QC1 ถูกเลนอื่นเขียนระหว่าง chunk (เช่น 23:07 เลน journeys ตั้ง portal เปิด) — แต่ละ chunk มี snapshot ของตัวเอง · fixture คืน "ค่าที่เจอตอนเริ่ม chunk" ตรงตัว
- it3: ตัวกด/ทะเบียน/run-chunks แช่แข็งที่ `.qc-shots/c42/frozen-it3/` (MD5) · unit `crm-c42-it3` รัน `it3-all.sh` = owner → manager → nok → thana → customer (ตรวจ MD5 ก่อนทุกบทบาท) · 13 chunk ต่อบทบาท · run-chunks เขียนแถว checkpoint ลงตารางด้านล่างเองหลังทุก chunk

| chunk | หน้า | ผล |
|---|---|---|
| it3-owner#1 ['owner'] | `re:^/companies` | 190/190 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 32 · safety 0 · restoreFail 0 |

### 🔎 "สร้างคืน 10" หลังกลุ่ม `/companies/new desktop` (it3-owner#1) — ต้นเหตุ (ตรวจ 27 ก.ย. 23:3x · อ่านอย่างเดียว)
- **ไม่ใช่แถวซีด และไม่ใช่เส้นทางของ product** — ทั้ง 10 แถวคือแถวที่เลน C4.4 journey **US3** สร้างเวลา 23:16:56–23:17:08 (ก่อน snapshot ของ chunk นี้ · US3 ถือ lock ตั้งแต่ 23:08:59 แล้วปล่อย): CrmCompany `cmukfuec50001xnkzq74fg8tu` · CrmContact `cmukfueql0004xnkz56lke8rp` · CrmCompanyContact `cmukfuexm0008xnkzhp8ht8pp` · CrmDeal `cmukfuf6w000bxnkzstsuwa7f` · CrmDealLine ×3 `cmukfuf89000d/e/f…` · CrmActivity `cmukfupmh000nxnkz3nn6oz3q` · Party `cmukfue9i0000xnkzsfxcmjai` · PortalSession `cmukfung801dhg5kz4dzlzzb9`
- **ใครลบ:** 23:19:28 `iso-624276` = `pnpm exec tsx scripts/visual-crm.mts --clean` (worktree c44) **รันโดยไม่ผ่าน scripts/with-gate-lock.sh** ขณะ chunk นี้ถือ lock (กลุ่ม /companies/new desktop 23:18:58–23:20:1x) · `cleanAll` ลบตาม manifest `created.json` เท่านั้น (ไม่แตะแถวที่ไม่ใช่ของ journey) — ตรวจโค้ด `scripts/crm-journeys/lib.mts` cleanAll แล้ว
- **ผล:** restore ของ chunk นี้ (ถูกต้องตามสัญญา: แถวใน snapshot ที่หายไป = สร้างคืน) **ชุบชีวิตแถว US3 ทั้ง 10 แถว** ⇒ ตอนนี้ยังอยู่บน QC1 และ manifest ของ US3 ถูกเขียนทับแล้ว (23:27) ⇒ `--clean` รอบหน้าจะไม่ลบ = แถวกำพร้าของ C4.4
- ขาอื่นในช่วงนั้น: 23:18:02/08 `c44-diag-us3-portal.mts` (ไม่ผ่าน lock เช่นกัน · ไม่ได้ตรวจว่าเขียนหรือไม่) · เลน C4.3 ใช้ QC3 (`qc3.sh` lock แยก) ไม่เกี่ยว
- ข้อเสนอ: C4.4 ต้องรัน `--clean` (และสคริปต์ diag ที่เขียนฐาน) ผ่าน `scripts/with-gate-lock.sh` · ลบ 10 แถวข้างบนผ่าน C4.4 (เป็นแถวของมัน) · ตัวกด C4.2 ไม่ต้องแก้ (restore ทำตามสัญญา — ปัญหาคือการเขียนนอก lock)
| it3-owner#2 ['owner'] | `re:^/contacts$` | 87/87 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 18 · safety 2 · restoreFail 0 |
| it3-owner#3 ['owner'] | `re:^/contacts/\[` | 120/120 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 50 · safety 6 · restoreFail 0 |

### it3 หยุดกลางทาง 23:40:30 — ต้นเหตุ + ต่อรอบ (28 ก.ย. 00:3x)
- **ต้นเหตุ:** ไม่ใช่ lock timeout — 23:40 `BUILD-STATE` = `BUILDING c432` (เลนอื่นสั่ง build · ตัวกำกับค้างหลัง container restart) ⇒ run-chunks รุ่นแช่แข็ง `SKIP` ทุก chunk ที่เหลือใน 1 วินาที (owner #4–13 + manager/nok/thana/customer ทั้งหมด) แล้ว unit จบ "สำเร็จ" · ตัวกด/ทะเบียนไม่เกี่ยว
- **แก้ run-chunks.sh** (ตัวกด+ทะเบียน MD5 เดิม · แช่แข็ง run-chunks ใหม่ใน `frozen-it3/MD5` · รุ่นเก่า `frozen-it3/run-chunks.it3a.sh`): ไม่ READY/เซิร์ฟเวอร์ล่ม ⇒ **รอ** (เช็กทุก 30 วิ ≤ 4 ชม. · บันทึก WAIT เมื่อสถานะเปลี่ยน) · ตัวกดไม่ได้เริ่ม (lock รอหมดเวลา — ไม่มีหัว log) ⇒ **ลองใหม่** ≤ 6 ครั้ง · `APPEND=1`/`START_CHUNK=N` ต่อรอบเดิมได้
- ต่อรอบ: unit `crm-c42-it3b` = `it3-rest.sh` (owner #4–13 ต่อท้าย log เดิม → manager → nok → thana → customer) · ตรวจ MD5 ก่อนทุกบทบาท
| it3-owner#4 ['owner'] | `re:^/contacts/(new|duplicates|import)` | 62/64 · dead 0 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 0 · needs 4 · safety 0 · restoreFail 0 |
| it3-owner#5 ['owner'] | `re:^/deals$` | 68/70 · dead 0 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 0 · needs 18 · safety 0 · restoreFail 0 |
| it3-owner#6 ['owner'] | `re:^/deals/\[` | 64/98 · dead 32 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 0 · needs 4 · safety 4 · restoreFail 0 |
| it3-owner#7 ['owner'] | `re:^/deals/new` | 26/28 · dead 2 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 2 · safety 0 · restoreFail 0 |
| it3-owner#8 ['owner'] | `re:^/(activities|calendar|commissions|pipelines)` | 101/106 · dead 1 · wrongExpect 4 · hiddenLeak 0 · overflow 0 · console 0 · needs 20 · safety 0 · restoreFail 0 |
| it3-owner#9 ['owner'] | `re:^/(reports|emails|objects)` | 106/108 · dead 0 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 0 · needs 20 · safety 0 · restoreFail 0 |
| it3-owner#10 ['owner'] | `re:^/settings/(api|assignment|automation|commissions)` | 216/218 · dead 0 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 0 · needs 30 · safety 2 · restoreFail 0 |

### §12 checkpoint (quota 81% · 28 ก.ย. ~01:45 UTC)
- unit `crm-c42-it3b` (`.qc-shots/c42/it3-rest.sh`) ยังรันอยู่ — owner #1–#10 เสร็จ (#10 settings api/assign/auto/comm 216/218) · chunk 11 **รอ** เพราะ BUILD-STATE = BUILDING (เลน c432) — ตัวรันรอเอง ไม่ข้าม · จากนั้น manager/nok/thana/customer ตาม it3-rest.sh (ตัวกดแช่แข็ง MD5 `frozen-it3/MD5`)
- ถัดไปเมื่อกลับมา: ดู `systemctl status crm-c42-it3b` + `tail .qc-shots/c42/it3-*.log` · แถว checkpoint ต่อ chunk อยู่ท้าย §12 (ckpt.py) · ถ้า unit จบแล้ว: สรุปทุก `it3-<role>-summary-N.json` ด้วย `python3 .qc-shots/c42/merge_summary.py it3-<role>` แล้วทำ handback
| it3-owner#11 ['owner'] | `re:^/settings/(email|forms|holidays|integrations|lost-reasons|notifications|objects)` | 194/202 · dead 0 · wrongExpect 8 · hiddenLeak 0 · overflow 0 · console 0 · needs 26 · safety 4 · restoreFail 0 |
| it3-owner#12 ['owner'] | `re:^/settings($|/(pipelines|portal|quotas|scoring|sequences|stages|tracking|visibility))` | 200/224 · dead 9 · wrongExpect 15 · hiddenLeak 0 · overflow 0 · console 0 · needs 18 · safety 0 · restoreFail 0 |
| it3-owner#13 ['owner'] | `re:^/(app|p|b|u)/` | 85/133 · dead 38 · wrongExpect 10 · hiddenLeak 0 · overflow 0 · console 2 · needs 43 · safety 4 · restoreFail 0 |

### §12 checkpoint (quota 81% · 28 ก.ย. 02:27 UTC — หยุดตามคำสั่ง)
- it3 owner ครบ 13/13 chunk (แถวด้านบน) · unit `crm-c42-it3b` (`.qc-shots/c42/it3-rest.sh`) **ยังรันต่อ** = บทบาท manager (log `.qc-shots/c42/it3-manager.log`) แล้ว nok/thana/customer ตามสคริปต์ · ตัวกดยังแช่แข็ง (MD5 `.qc-shots/c42/it3-md5.log`)
- ยังไม่ได้วิเคราะห์ owner #6 (/deals/[ 32 dead) · #12 · #13 (/app|p|b|u 38 dead) และยังไม่ได้ตอบคำถามผู้คุมงานเรื่อง 10 แถวที่ถูกสร้างคืนหลัง /companies/new desktop
- ต่อเมื่อกลับมา: `systemctl status crm-c42-it3b` · `tail .qc-shots/c42/it3-*.log` · `python3 .qc-shots/c42/ckpt.py it3-<role> <n>` ต่อ chunk ที่ยังไม่มีแถว · `python3 .qc-shots/c42/show.py .qc-shots/c42/it3-owner-summary-6.json x` (เริ่มวิเคราะห์ที่ #6/#13)

### Controller note (28 Sep ~02:30 UTC)
- The "10 re-created rows" question is CLOSED: they were C4.4 US3 journey rows deleted by C4.4's `--clean` run WITHOUT the gate lock during it3-owner#1 (your §12 analysis). C4.4 now runs everything under the lock + deleted its orphans by id. No runner change needed.
- it3 owner done 13/13 (weak: #6 /deals/[…] 64/98 · #12 settings 200/224 · #13 /app|p|b|u 85/133) · manager→nok→thana→customer running in crm-c42-it3b. Resume after the quota reset: analyse owner #6/#13/#12 first.
| it3-manager#1 ['manager'] | `re:^/companies` | 190/190 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 32 · safety 0 · restoreFail 0 |
| it3-manager#2 ['manager'] | `re:^/contacts$` | 87/87 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 18 · safety 2 · restoreFail 0 |
| it3-manager#3 ['manager'] | `re:^/contacts/\[` | 110/110 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 60 · safety 6 · restoreFail 0 |
| it3-manager#4 ['manager'] | `re:^/contacts/(new|duplicates|import)` | 62/64 · dead 0 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 0 · needs 4 · safety 0 · restoreFail 0 |
| it3-manager#5 ['manager'] | `re:^/deals$` | 68/70 · dead 0 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 0 · needs 18 · safety 0 · restoreFail 0 |
| it3-manager#6 ['manager'] | `re:^/deals/\[` | 30/96 · dead 64 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 0 · needs 6 · safety 4 · restoreFail 0 |
| it3-manager#7 ['manager'] | `re:^/deals/new` | 26/28 · dead 2 · wrongExpect 0 · hiddenLeak 0 · overflow 1 · console 0 · needs 2 · safety 0 · restoreFail 0 |
| it3-manager#8 ['manager'] | `re:^/(activities|calendar|commissions|pipelines)` | 106/110 · dead 0 · wrongExpect 4 · hiddenLeak 0 · overflow 0 · console 0 · needs 16 · safety 0 · restoreFail 0 |
| it3-manager#9 ['manager'] | `re:^/(reports|emails|objects)` | 104/110 · dead 6 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 2 · needs 18 · safety 0 · restoreFail 0 |
| it3-manager#10 ['manager'] | `re:^/settings/(api|assignment|automation|commissions)` | 218/218 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 2 · needs 28 · safety 2 · restoreFail 0 |
| it3-manager#11 ['manager'] | `re:^/settings/(email|forms|holidays|integrations|lost-reasons|notifications|objects)` | 208/210 · dead 0 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 8 · needs 18 · safety 4 · restoreFail 0 |
| it3-manager#12 ['manager'] | `re:^/settings($|/(pipelines|portal|quotas|scoring|sequences|stages|tracking|visibility))` | 230/238 · dead 3 · wrongExpect 5 · hiddenLeak 0 · overflow 0 · console 8 · needs 4 · safety 0 · restoreFail 0 |
| it3-manager#13 ['manager'] | `re:^/(app|p|b|u)/` | 97/135 · dead 30 · wrongExpect 8 · hiddenLeak 0 · overflow 0 · console 4 · needs 41 · safety 4 · restoreFail 0 |
| it3-nok#1 ['nok'] | `re:^/companies` | 54/70 · dead 14 · wrongExpect 0 · hiddenLeak 2 · overflow 0 · console 8 · needs 24 · safety 0 · restoreFail 0 |
| it3-nok#2 ['nok'] | `re:^/contacts$` | 44/48 · dead 2 · wrongExpect 0 · hiddenLeak 2 · overflow 0 · console 0 · needs 22 · safety 2 · restoreFail 0 |
| it3-nok#3 ['nok'] | `re:^/contacts/\[` | 18/112 · dead 94 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 2 · needs 60 · safety 0 · restoreFail 0 |
| it3-nok#4 ['nok'] | `re:^/contacts/(new|duplicates|import)` | 60/66 · dead 2 · wrongExpect 4 · hiddenLeak 0 · overflow 0 · console 4 · needs 2 · safety 0 · restoreFail 0 |
| it3-nok#5 ['nok'] | `re:^/deals$` | 66/70 · dead 0 · wrongExpect 4 · hiddenLeak 0 · overflow 0 · console 0 · needs 18 · safety 0 · restoreFail 0 |
| it3-nok#6 ['nok'] | `re:^/deals/\[` | 0/86 · dead 86 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 2 · needs 6 · safety 0 · restoreFail 0 |
| it3-nok#7 ['nok'] | `re:^/deals/new` | 26/28 · dead 2 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 2 · safety 0 · restoreFail 0 |
| it3-nok#8 ['nok'] | `re:^/(activities|calendar|commissions|pipelines)` | 100/108 · dead 2 · wrongExpect 6 · hiddenLeak 0 · overflow 0 · console 0 · needs 18 · safety 0 · restoreFail 0 |
| it3-nok#9 ['nok'] | `re:^/(reports|emails|objects)` | 60/102 · dead 42 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 16 · needs 26 · safety 0 · restoreFail 0 |
| it3-nok#10 ['nok'] | `re:^/settings/(api|assignment|automation|commissions)` | 250/250 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 8 · needs 0 · safety 0 · restoreFail 0 |
| it3-nok#11 ['nok'] | `re:^/settings/(email|forms|holidays|integrations|lost-reasons|notifications|objects)` | 218/220 · dead 0 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 12 · needs 0 · safety 0 · restoreFail 0 |
| it3-nok#12 ['nok'] | `re:^/settings($|/(pipelines|portal|quotas|scoring|sequences|stages|tracking|visibility))` | 178/178 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 14 · needs 0 · safety 0 · restoreFail 0 |
| it3-nok#13 ['nok'] | `re:^/(app|p|b|u)/` | 134/156 · dead 22 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 6 · needs 24 · safety 0 · restoreFail 0 |

## §13 วิเคราะห์ it3 (28 ก.ย. ~04:40–05:00 UTC · owner/manager/nok เสร็จ · thana/customer กำลังรันใน crm-c42-it3b)
**ตัวกด (แก้ใน it4 · staged ที่ `.qc-shots/c42/next4/` ยังไม่แตะ scripts/ จนกว่า it3 จบ):**
- R1 ตัวเปิดที่เขียนแบบทำลายล้าง (`MAKE_LOST` = deal-lost-confirm เป็นตัวเปิดของแถว reopen) ไม่ได้ซ่อมซีดหลังแถว ⇒ ดีลค้าง "แพ้" ทั้งกลุ่ม ⇒ owner #6 32 dead · manager #6 64 dead (deal-lost-btn/lines/value/delete ทั้งหมด) — แก้: ซ่อม keepNew ก่อนแถวถัดไปเมื่อ chain เขียนผ่านตัวเปิดทำลายล้าง
- R2 เอนทิตีเดียวกันทุกบทบาท: nok/thana เปิดดีล/ผู้ติดต่อ/บริษัทของคนอื่น ⇒ HTTP 404 (nok #3 94 dead · #6 86 · #1 14) — แก้: ต่อบทบาทใช้ดีลเปิด/ผู้ติดต่อ/บริษัทที่ตัวเองดูแล · ระเบียนวัตถุที่บริษัทแม่อยู่ในทีมตัวเอง (manager/nok/thana)
- R3 `/p/[slug]` ใช้ slug ร้านแทน Page.slug ⇒ 404 ทุกแถว (+console 404) — แก้: หา Page ที่วาง widget CRM · ไม่มี = ข้ามทั้งหน้าระดับแผน
- R4 ค่ากรอกซ้ำทั้งรอบ (`qc-btn-<run>`) ⇒ เหตุผลแพ้/คีย์วัตถุ/ผู้ติดต่อชนกับที่แถวก่อนหน้าสร้าง (lr-new 5→5 · object-add-create · contact-new-submit) — แก้: ค่าไม่ซ้ำต่อการกรอก · ช่องตัวเลข pct/prob/split/quota-deals/stale ได้ตัวเลข · ช่องโดเมน `*-domain-input` · `*-lower-text` = "ลดอายุเก็บ"
- R5 แพตเทิร์นหลาย `*` (`st-req-*-*`) ไม่เคยจับ (suffix เป็น "-*" ตามตัวอักษร) · ลิงก์ `#anchor` เทียบ path ไม่ใช่ hash (crm-home-ai-risk) · console "Failed to load resource 404" ไม่บอก URL + หน้า 404 ที่ทุกแถว hiddenFor (บทบาทถูกกันถูกต้อง) ถูกนับเป็น console error — แก้ทั้งหมดแล้วใน next4
**ทะเบียน (it4 · staged `.qc-shots/c42/next4/crm-ui-inventory.json` จาก reg/edits.py · diff = 25 แถว):** needs ที่ขาด (ดีลของผู้ใช้บนหน้าแรก owner/manager=0 · v1 switch link · stages-create-link · บอร์ดงาน 0 · party ไม่มีดีล · ทีมเก็บถาวร · พนักงานนอกทีม · ผู้ติดต่อ ≥2 บริษัท) · ตัวเปิดที่ขาด (visibility entity=DEAL · st-name ก่อน st-save · retention export-days · team-unit-toggle) · expect ผิด (crm-home-search พิมพ์ไม่นำทาง · crm-link-qr-close = disappears) · import/export buttons hiddenFor nok,thana (สิทธิ์ STAFF ไม่มี import/export)
**ต้องให้ผู้คุมงานตัดสิน:** ซีด QC1 ให้ nok/thana สิทธิ์ CRM แบบระบุชัด 8/11 คีย์ (ไม่มี crm.deal.update · crm.company.* · crm.record.read · crm.activity.delete · crm.report.view …) แต่ทะเบียนใส่ nok/thana ใน roles ของแถวเหล่านั้นตามชุด STAFF_DEFAULT ⇒ ผล nok/thana ส่วนใหญ่เป็น "ทะเบียน≠ซีด" ไม่ใช่บั๊ก — เลือก (a) ซีดให้ STAFF_DEFAULT หรือ (b) ทะเบียนย้าย nok/thana ไป hiddenFor ตามสิทธิ์ซีด
**บั๊ก product ที่พบ (ดู §5):** B1 ปุ่มนำเข้า/ส่งออก CSV แสดงให้พนักงานที่ไม่มีสิทธิ์ · B2 ปุ่มลบกิจกรรมแสดงให้เจ้าของกิจกรรมที่ไม่มีสิทธิ์ลบ · B3 แท็บการแจ้งเตือนไม่ประกาศสถานะเลือก (a11y · ruling §11c) · B4 (รอตัดสิน) เจ้าของระเบียนเปิดระเบียนตัวเองไม่ได้เมื่อบริษัทแม่อยู่นอกทีม
| it3-thana#1 ['thana'] | `re:^/companies` | 54/70 · dead 14 · wrongExpect 0 · hiddenLeak 2 · overflow 0 · console 8 · needs 24 · safety 0 · restoreFail 0 |
| it3-thana#2 ['thana'] | `re:^/contacts$` | 48/52 · dead 2 · wrongExpect 0 · hiddenLeak 2 · overflow 0 · console 0 · needs 18 · safety 2 · restoreFail 0 |
| it3-thana#3 ['thana'] | `re:^/contacts/\[` | 102/106 · dead 2 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 0 · needs 62 · safety 4 · restoreFail 0 |
| it3-thana#4 ['thana'] | `re:^/contacts/(new|duplicates|import)` | 60/66 · dead 2 · wrongExpect 4 · hiddenLeak 0 · overflow 0 · console 4 · needs 2 · safety 0 · restoreFail 0 |
| it3-thana#5 ['thana'] | `re:^/deals$` | 66/70 · dead 0 · wrongExpect 4 · hiddenLeak 0 · overflow 0 · console 0 · needs 18 · safety 0 · restoreFail 0 |
| it3-thana#6 ['thana'] | `re:^/deals/\[` | 38/102 · dead 60 · wrongExpect 4 · hiddenLeak 0 · overflow 0 · console 0 · needs 4 · safety 0 · restoreFail 0 |
| it3-thana#7 ['thana'] | `re:^/deals/new` | 26/28 · dead 2 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 2 · safety 0 · restoreFail 0 |
| it3-thana#8 ['thana'] | `re:^/(activities|calendar|commissions|pipelines)` | 106/112 · dead 0 · wrongExpect 6 · hiddenLeak 0 · overflow 0 · console 0 · needs 14 · safety 0 · restoreFail 0 |
| it3-thana#9 ['thana'] | `re:^/(reports|emails|objects)` | 60/102 · dead 42 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 16 · needs 26 · safety 0 · restoreFail 0 |
| it3-thana#10 ['thana'] | `re:^/settings/(api|assignment|automation|commissions)` | 250/250 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 8 · needs 0 · safety 0 · restoreFail 0 |
| it3-thana#11 ['thana'] | `re:^/settings/(email|forms|holidays|integrations|lost-reasons|notifications|objects)` | 230/232 · dead 0 · wrongExpect 2 · hiddenLeak 0 · overflow 0 · console 14 · needs 0 · safety 0 · restoreFail 0 |
| it3-thana#12 ['thana'] | `re:^/settings($|/(pipelines|portal|quotas|scoring|sequences|stages|tracking|visibility))` | 248/286 · dead 38 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 20 · needs 8 · safety 0 · restoreFail 0 |
| it3-thana#13 ['thana'] | `re:^/(app|p|b|u)/` | 136/156 · dead 20 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 4 · needs 24 · safety 0 · restoreFail 0 |
| it3-customer#1 ['customer'] | `re:^/companies` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#2 ['customer'] | `re:^/contacts$` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#3 ['customer'] | `re:^/contacts/\[` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#4 ['customer'] | `re:^/contacts/(new|duplicates|import)` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#5 ['customer'] | `re:^/deals$` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#6 ['customer'] | `re:^/deals/\[` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#7 ['customer'] | `re:^/deals/new` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#8 ['customer'] | `re:^/(activities|calendar|commissions|pipelines)` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#9 ['customer'] | `re:^/(reports|emails|objects)` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#10 ['customer'] | `re:^/settings/(api|assignment|automation|commissions)` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#11 ['customer'] | `re:^/settings/(email|forms|holidays|integrations|lost-reasons|notifications|objects)` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#12 ['customer'] | `re:^/settings($|/(pipelines|portal|quotas|scoring|sequences|stages|tracking|visibility))` | 0/0 · dead 0 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 0 · safety 0 · restoreFail 0 |
| it3-customer#13 ['customer'] | `re:^/(app|p|b|u)/` | 9/33 · dead 24 · wrongExpect 0 · hiddenLeak 0 · overflow 0 · console 0 · needs 28 · safety 2 · restoreFail 0 |

## §14 it3 จบ (unit crm-c42-it3b ALLDONE 07:34 UTC) · สรุปต่อบทบาท × จอ + it4 staged (28 ก.ย. ~09:50 UTC)
| บทบาท | passed/total | dead d/m | wrongExpect d/m | hiddenLeak d/m | overflow | console d/m | needs d/m | restoreFail |
|---|---|---|---|---|---|---|---|---|
| owner | 1519/1648 | 40/42 | 23/24 | 0/0 | 0 | 1/1 | 142/143 | 0 |
| manager | 1536/1666 | 52/53 | 12/13 | 0/0 | 0/1 (about:blank หลัง history.back = ตัวกด R7) | 12/12 | 132/133 | 0 |
| nok | 1208/1494 | 133/133 | 7/9 | 2/2 (B1) | 0 | 36/36 | 101/101 | 0 |
| thana | 1424/1632 | 91/91 | 10/12 | 2/2 (B1) | 0 | 37/37 | 101/101 | 0 |
| customer | 9/33 | 13/11 | 0 | 0 | 0 | 0 | 14/14 | 0 |
- customer: ตัวกด R6 — แถว `portal-logout` (กลุ่ม /b/[slug] 390 รันก่อน) เพิกถอน session ของตัวกดเอง (แถว session ถูก PROTECT ⇒ restore ไม่คืน) ⇒ ทุกหน้าหลังจากนั้นเป็นหน้าเข้าสู่ระบบ (24 dead) · `portal-login-tab-email` = แท็บค่าเริ่มต้น (ทะเบียน: opener `portal-login-tab-line=click`)
- ข้อค้นพบเดิมจากนำร่อง: `/deals/new` ล้น 390 **ไม่ยืนยัน** (ไม่มี overflow บน URL ของแอปในทุกบทบาท — ตัวเดียวคือ about:blank) · `/p/[slug]` 404 = ตัวกด (R3 slug ผิด) ไม่ใช่ product
- nok/thana dead ส่วนใหญ่ = R2 (เอนทิตีของคนอื่น ⇒ 404) + "ทะเบียน≠สิทธิ์ซีด" (sequences/objects/reports ที่ซีดไม่ให้คีย์) — รอผู้คุมงานตัดสิน (§13)
- **it4 staged และติดตั้งใน scripts/ แล้ว (it3 จบแล้ว · รุ่น it3 อยู่ที่ frozen-it3/):** ตัวกด R1–R7 · ทะเบียน `next4/crm-ui-inventory.json` (REG_PATH=… apply.py จาก edits.py) · MD5 ตัวกด 11792eff… ทะเบียน befece71… · `--dry` exit 0 (7,433 · opener ผิด 0) · typecheck exit 0 (`typecheck-it4.log`) · fitness 33/33 ทั้ง 2 โหมด (`fitness-it4-{1,2}.log`)
- **ยังไม่รัน it4** — รอผู้คุมงาน rebuild เซิร์ฟเวอร์ 3215 จาก main HEAD · คำสั่งเมื่อได้ไฟเขียว: แช่แข็ง (`mkdir frozen-it4; cp scripts/qc-crm-buttons.mts scripts/crm-ui-inventory.json .qc-shots/c42/run-chunks.sh frozen-it4/; md5sum … > frozen-it4/MD5`) แล้วรัน `it3-all.sh` แบบเดียวกันด้วย label it4

## §15 Controller rulings on it3 (28 Sep ~10:30 UTC) — BINDING
- nok/thana permissions: **(b)** — the registry follows the REAL permission model: for each row, `hiddenFor` includes a STAFF role whenever that role lacks the crm key that gates the control (derive from the seed memberships, not by hand). The product must HIDE such controls (B1/B2/B5/B6 are product bugs → work order **C4.2-fix**); until fixed they stay red as hiddenLeak/wrongExpect — never mark them passed.
- B4 record owner 404 when the parent company is in another team: product bug — the record's `ownerUserId` always sees own record (same as deals' OWN rule) → C4.2-fix.
- B3 a11y tabs (aria-selected) → C4.2-fix.
- it4: run after the controller rebuilds 3215 from main HEAD (message will say GO). Runner R1–R7 fixes approved.

## it4 (1 Oct) — HANDOFF CHECKPOINT (1 Oct ~04:30 UTC · worktree `shark-crm-c42b` @ 46f952cc · session ended by controller mid-run)

**State in one line:** ported + registry swept + persona fixtures written + smoke run green; FULL run `run2` is STILL RUNNING (unit left alone to finish); 9 oracle fixes found during run2 are STAGED (not yet in `scripts/`); run3 (final full pass) NOT started; handback/acceptance numbers NOT final.

### Done (in `scripts/` — frozen = exactly what run2 runs · MD5 runner `48dce828…` · registry `c1807837…` in `/tmp/c42b-logs/run2.md5`)
1. **Port of it4 (14cfb52f, base 18feaa84):** `scripts/qc-crm-buttons.mts` + this file applied as a patch (byte-identical to 14cfb52f — main's copies were unchanged since 18feaa84). Registry merged row-by-row/field-by-field with `scripts/pending/c42b/merge-it4-registry.py` (3-way: 819 it4 field edits applied · 11 HEAD-only rows kept · 8 rows moved `/deals`→`/deals/[dealId]` with HEAD's edits carried · 0 conflicts · HEAD's `hiddenFor` never overwritten).
2. **Registry sweep (§15 real permissions):** `scripts/pending/c42b/registry-sweep.mts` — persona keys = QC1 Membership → product `toMemberActor` → product `crmCan`; PAGE_GATES (every CRM page's `crmCan→notFound` / visibility READ_KEY, cited file:line) + CONTROL_GATES (cited; from a 3-agent code audit of ~290 rows). Applied: **roles→hiddenFor 252 · unclaimed→hiddenFor 161 · hiddenFor→roles 0** (log `scripts/pending/c42b/registry-sweep.last.txt`; re-run = 0 changes). Pages: `/companies` 40 · `/companies/[companyId]` 102 · `/companies/new` 34 · `/emails/[threadKey]` 22 · `/objects/[key]` 60 + record 6 · `/settings/sequences/[sequenceId]` 56 · `/settings/{pipelines,stages,lost-reasons}` nok 41 · `/contacts` crm-seq-bulk* 14 · `/contacts/[contactId]` 18 (crm-seq-enroll* · contact-conn-company-link · contact-edit-move-deals · crm-object-tab-obj-*) · `/activities` activity-row-company-link 2 · home crm-ai-proposal-* 10 · `deal-company-link` 2 · `deals-empty-create-pipeline`/`deal-new-create-pipeline` (crm.settings.manage — **manager too**) 6.
3. **Registry rows:** 10 lines-editor rows (`deal-line(s)-*`) `query: "tab=lines"` · `deal-title-save` opener `deal-title-input=*` · `deal-line-remove-*` expect `deal-lines-editor` changes.
4. **Runner (no vacuous checks):** persona picks through the PRODUCT's `where.ts` (`dealWhere/contactWhere/companyWhere` with the real actor) `qc-crm-buttons.mts:312` (+ `actorOf` :267, proof list `PICKS` printed + `summary.picks`) · deal-WITH-lines fixture `LINES_DEALS`/`createLinesDeals` :510-511 (clone of the persona's picked deal + 2 lines, admitted by `dealWhere`, deleted in CLEAN) · `tab=lines` rows open it (`pageUrl`) · **VACUITY GUARD** :1682 (hidden "passes" on a ≥400 page while the group expects visible rows ⇒ bucket `vacuous`) · `PAGE_STATUS` :1697 (`summary.pageStatus`) · `--dry` validates `query` pairs/placeholders/tab=lines + page placeholders :601 (positive control: injected bad query/opener/tab=lines ⇒ exit 1) · safety-net cleanup :1897 · `0n`→`BigInt(0)` · typecheck exit 0 (`/tmp/c42b-logs/typecheck-2.log`) · `--dry` exit 0 (8,263 presses · 0 opener problems).
5. **Vacuity proof (QC1, printed every run):** owner/manager → deal `cmuk7vvns00e1…` · contact `cmuk7vevb001t…` · company `cmuk7veeo000q…` (shared picks, owner=thana, admitted by the product filters — role ALL); **nok** → OWN deal `cmuk7vzgq00gt…` · OWN contact `cmuk7vltw007d…` (team krabi, TEAM policy, admitted by `dealWhere`/`contactWhere`) · company `cmuk7vel8001a…` = own record, `companyWhere` empty (no crm.company.read) ⇒ page must 404 by the key; **thana** → OWN deal/contact (= the shared picks, owner=thana) · own company (key-blocked). Lines deal: nok's clone of its own deal, owner/manager/thana a clone of thana's — `dealWhere` admits both.

### Runs
| run | unit | what | result |
|---|---|---|---|
| run1 (smoke) | `crm-c42b-run1` (done) | nok + owner · `/deals/[dealId]` · 1440+390 | nok **92/92** (lines tab 200 · 10/10 hidden real) · owner 95/98 (title-save 390 · line-remove ×2 → fixed in registry before run2) · lines deal deleted · final restore 0/0/0 |
| run2 (FULL) | **`crm-c42b-run2` — RUNNING at handoff** (owner chunk 11 of 13 at 04:25) | owner → manager → nok → thana (13 chunks) → customer (portal chunk) | partial — see tally |
| dbg1 | `crm-c42b-dbg1` (done) | STAGED runner/registry · owner 390 · `/deals/[` + `/contacts/[` | title-save still dead (→ fix S3) · convert-done/opt-out now pass · consent ×2 still red (→ fix S5) |

**Tally so far — run2 owner chunks 1–10 (`summarize.py`):** pressed 1135 · passed 1094 · dead d/m 13/14 · leak 0/0 · fail(wrongExpect) d/m 4/10 · vacuous 0 · needs d/m 95/95 · safety 14 · console 2 · overflow 0 · restoreFail 0 · fatal 0. Per chunk: companies 190/190 · contacts 99/99 · contacts/[ 120/130 · contacts/new… 64/64 · deals 68/70 · deals/[ 97/98 · deals/new 28/28 · activities… 104/108 · reports|emails|objects 106/128 · settings api… 218/220. Every non-pass above is classified below (all RUNNER/fixture, none product so far). manager/nok/thana/customer: not yet run at handoff.

### Staged, NOT yet in `scripts/` (copies: `scripts/pending/c42b/next/{qc-crm-buttons.mts,crm-ui-inventory.json}` · `--dry` exit 0 · NOT typechecked)
- S1 convert repair = FULL restore (`FULL_REPAIR_RE`) — keepNew kept the convert's Customer ⇒ seed contact read as member-linked (owner 390 consent/opt-out ×4).
- S2 registry: `contact-convert-company-taxid/-role` opener `contact-convert-btn`; `contact-convert-done` opener `[contact-convert-btn, contact-convert-company-taxid=0105599000001, contact-convert-submit=click]` (reuse of the fixture company) — dbg1: pass.
- S3 `clickEl` centres + hit-tests, DOM click when covered (sticky header on 390 ⇒ `deal-title-save` "dead") — not yet verified.
- S4 `reveal()`: plain steps after a `=value` step are always pressed (≤4 s wait, fail loudly) — `activity-log-target-option` was skipped (activity-log-form/-submit ×4).
- S5 **OUTBOX SETTLE** before every restore (≤15 s for PENDING OutboxEvent of the tenant): AuditLog proof 04:08:47 `crm.contact.member.link via member.created` 2 s after convert ⇒ async consumer linked the seed contact to the Customer the repair had just deleted ⇒ consent rows "ผูกกับสมาชิกที่ไม่พบ". QC1 is clean (group/CLEAN restores ran later; contact `memberCustomerId` null — `facts2.mts`).
- S6 e-mail thread fixture per persona contact (`THREADS`) + no orphan fallback — QC1's only thread (3 msgs, 28 Sep 05:25) belongs to deleted contact `cmukszrsq…` ⇒ 404 is correct (owner `/emails/[threadKey]` 20 dead in run2 = runner).
- S7 `object-record-archive-btn` opener `object-record-archive-btn=click` (two-step arm button, RecordForm.tsx:264-275) + `--dry` accepts `<self>=click`.
- S8 `inputmode=decimal|numeric` text ⇒ number (`crm-commission-rule-min` typed text ⇒ refused ×2).
- S9 deal board: drop on the VISIBLE part of the target column (390 `deal-card-*`); second-match retry for `*` ui/changes; registry `deal-stage-tab-*` expect `deal-stage-tabs` changes. Plus debug env `QC_BTN_SHOTS`/`QC_BTN_REGISTRY`, cwd-based imports, dead detail shows `disabled`/prefill.

### Product findings so far (for C4.2-fix · none fixed here)
- **F1** `/companies` list + nav tab not gated by `crm.company.read` — `src/app/app/sys/[id]/crm/companies/page.tsx:48-56` (only create/import/export gated) · `src/lib/modules/crm/nav.ts:30` (no `perm`, unlike emails :36 / reports :39). Repro: log in as nok (no company keys) → tab "บริษัท" → page renders filters + "ยังไม่มีบริษัทที่บัญชีนี้มองเห็น". Registry now claims hiddenFor nok/thana ⇒ expect hiddenLeak on the filter rows in nok/thana chunk 1 (product, not registry).
- **F2** (a11y, ruling §11c class) `deal-stage-tab-*` marks the active stage only by inline style — no `aria-current`/`aria-pressed` — `src/app/app/sys/[id]/crm/deals/_components/DealBoard.tsx:184-191`. Repro: 390 → /deals → stage tabs: no exposed selected state.
- Data observation (not product): QC1 has 3 orphan `CrmEmailMessage` (thread `bcbc2add…`, contact `cmukszrsq0000amkzbz8gremx` deleted) from a 28 Sep 05:25 journey — owner of that cleanup should remove them.

### Next commands (in order)
1. Wait for run2: `systemctl status crm-c42b-run2` · `cat /tmp/c42b-logs/run2.status` (ends `RUN2-ALLDONE`, writes `/tmp/c42b-logs/counts-after-run2.json`). Logs: `/tmp/c42b-logs/run2-<role>.log` · summaries `/tmp/c42b-logs/run2-<role>-summary-<N>.json` · fail shots `.qc-shots/c42b/run2-<role>-fail/` · copy of /tmp logs at handoff: `.qc-shots/c42b/logs-snapshot/` (ignored by git — **/tmp may not survive the machine move: copy again after run2**).
2. Tally/triage: `python3 scripts/pending/c42b/summarize.py "/tmp/c42b-logs/run2-*-summary-*.json"` and `… --list dead|wrongExpect|hiddenLeak|vacuous|consoleErrors|overflow|skippedNeeds [--user nok]`. Restore proof: diff `counts-before-run2.json` vs `counts-after-run2.json` (tables + qc-btn tags + live qc-btn sessions + portal settings + company0.taxId; other lanes write QC1 too — attribute diffs by createdAt).
3. Promote staged fixes: `cp scripts/pending/c42b/next/qc-crm-buttons.mts scripts/ && cp scripts/pending/c42b/next/crm-ui-inventory.json scripts/` (the staged registry = current registry + S2/S7/S9 rows; re-check with `pnpm exec tsx scripts/pending/c42b/registry-sweep.mts` → must print 0 changes) → `pnpm exec tsx scripts/qc-crm-buttons.mts --dry` (exit 0) → typecheck `env NODE_OPTIONS=--max-old-space-size=5120 ISO_MEM=6G bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck`.
4. Add the run2 manager/nok/thana/customer fixes the same way, then run3 = final full pass: `sed 's/run2/run3/g' /tmp/c42b-logs/run2.sh > /tmp/c42b-logs/run3.sh && bash -n /tmp/c42b-logs/run3.sh && systemd-run --unit=crm-c42b-run3 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /tmp/c42b-logs/run3.sh` (needs `/tmp/c42b-logs/run-chunks.sh` — copy is in `.qc-shots/c42b/logs-snapshot/`).
5. Classify every non-pass per §15 → append final tallies/findings under "## it4 (1 Oct)" → one commit `WIP C4.2 it4 (ported runner · registry sweep · persona fixtures · real run) — NOT for main as-is`. No push.

## it4 (1 Oct) — PHASE A (lane resumed after machine move · worktree `shark-crm-c42b` @ 1cc85e31)
### Checkpoint A1 (1 Oct ~05:05 UTC)
- run2 still running (owner done 04:52 · manager running · unit stops itself before nok — md5 changed by controller). **manager chunk 1 `/companies` FATAL at 04:53** (`ConnectionClosedError` in `newPage` after 1 of 16 groups — browser died; summary-1 = 17 rows only) ⇒ manager `/companies` must be re-covered (debug run / run3).
- Promotion of S1–S9 into `scripts/` is DEFERRED until `crm-c42b-run2` is inactive: every chunk is a fresh `tsx scripts/qc-crm-buttons.mts`, so copying now would change what the remaining manager chunks run (run2 must stay one frozen version).
- owner run2 complete: 13/13 chunks, 1764 pressed · 1690 passed · 74 non-pass (46 dead + 28 wrongExpect) + 2 console · 0 leak/vacuous/overflow/restoreFail/fatal. All 74 classified (table in "Owner triage" below) — 0 PRODUCT.
- New fixes N1–N10 written into the STAGED copies (`scripts/pending/c42b/next/`) on top of S1–S9; registry edits are a script (`scripts/pending/c42b/it4a-registry-edits.py`, idempotent, 12 field changes). Staged `--dry` exit 0 (8,259 presses · opener problems 0). Not yet typechecked / not yet debug-run.

### Owner triage — run2 (complete, 13 chunks) · 74 non-pass + 2 console · every one classified
| chunk | rows (d=1440 · m=390) | n | class | cause (evidence) | fix |
|---|---|---|---|---|---|
| 3 `/contacts/[` | contact-convert-company-role/-taxid/-done d+m | 6 dead | REGISTRY | fields exist only after `contact-convert-btn` opens the dialog | S2 (dbg1 pass) |
| 3 | contact-consent-grant/-revoke · contact-optout-toggle · contact-tracking-optout-toggle m | 4 wE | RUNNER | convert repair kept the new Customer (keepNew) + async `member.created` consumer linked the seed contact to it 2 s after the repair (AuditLog 04:08:47) | S1 + S5 |
| 5 `/deals` | deal-card-* m · deal-stage-tab-* m | 2 wE | RUNNER | 390 drop landed off-screen · first tab = active one (no aria, F2) | S9 |
| 6 `/deals/[` | deal-title-save m | 1 dead | RUNNER | pointer click hit the sticky header | S3 |
| 8 `/activities` | activity-log-form/-submit d+m | 4 wE | RUNNER | `activity-log-target-option` skipped (submit always visible) ⇒ "เลือกผู้ติดต่อ…ก่อน" | S4 |
| 9 `/emails/[threadKey]` | 10 rows d+m + 2 console 404 | 20 dead | FIXTURE | only QC1 thread belongs to a deleted contact ⇒ 404 is correct | S6 |
| 9 `/objects/[key]/[recordId]` | object-record-archive-btn d+m | 2 wE | REGISTRY | two-step arm button (RecordForm.tsx:264-275) | S7 |
| 10 `/settings/commissions` | crm-commission-rule-save d+m | 2 wE | RUNNER | text typed into `inputmode=decimal` min field | S8 |
| 12 `/settings` | crm-retention-save d+m | 2 dead | RUNNER | export days typed 100→101, product allows 1–90 (PrivacySettings.tsx client check) — no request | N1 `export-days` → 30 |
| 12 `/settings/sequences/[id]` | crm-seq-save d+m | 2 dead | REGISTRY | button is inside `{editSteps && …}` (SequenceEditor.tsx:224-262) — opener `crm-seq-steps-toggle` missing | N2 |
| 12 | crm-seq-stats-version d+m | 2 dead | FIXTURE | options = versions 1..seq.version (sequences.ts:1011); QC1 has NO seed sequence — the page ran on a journey leftover `qc-jrn-us5…` (v1) | N3 runner-owned 2-version sequence |
| 12 `/settings/quotas` | crm-quota-deals-* m | 1 dead | REGISTRY | column `hidden … sm:table-cell` (QuotaManager.tsx:149) — desktop-only by design | N4 viewport desktop |
| 12 `/settings/pipelines` | pl-archive-submit d+m | 2 wE | FIXTURE | both QC1 pipelines hold open deals (40/15) ⇒ product refuses by design (pipelines.ts:309) | N5 empty pipeline + PREFER |
| 12 `/settings/sequences` | crm-seq-new-form/-submit d+m | 4 wE | RUNNER+REGISTRY | first-step fields (StepFields on the list page, SequenceListView.tsx:84) are registry rows of `[sequenceId]` only ⇒ never prefilled ⇒ client refusal | N6 `alsoOn` + prefill uses alsoOn rows |
| 12 `/settings/stages` | st-delete-* d+m | 2 wE | FIXTURE | every default-pipeline stage holds deals ⇒ refused by design (pipelines.ts:406); refusal text is not role=alert/*-error | N5 empty stage + PREFER |
| 13 `/app/settings/teams` | team-member-remove-cancel d+m | 2 dead | RUNNER | teams made by `teams-create-*` survive the group (keepNew) and become the SELECTED team (no members) | N7 full repair after teams-create |
| 13 | team-member-add-form/-submit d+m | 4 wE | REGISTRY | `team-member-add-select` is a `ui` row ⇒ never prefilled ⇒ "เลือกพนักงาน" | N7 opener `team-member-add-select=*` |
| 13 `/app/sys/[id]` (CRM home) | crm-home-source-row-* d+m | 2 dead | FIXTURE (time-rot) | box counts contacts created in the CURRENT month (home-data.ts:335); seed is from Sept, today 1 Oct | N8 lead created now |
| 13 | crm-home-saved-view d+m | 2 wE | FIXTURE | 0 deal saved views ⇒ chip opens "ยังไม่มีมุมมอง" (HomeFilters.tsx:98) | N10 view per owner/manager |
| 13 `/app/sys/[id]?c=` (CHAT) | crm-panel-log-activity + -activity-type/-title/-submit d+m | 8 dead | RUNNER+FIXTURE | resolver matched room by phone; product links by PARTY (crm-panel-actions.ts:81-98, `logActivity: !!brief.contact`); QC1 has 0 linked rooms | N9 linked room per persona + `[unlinkedConversationId]` for create-lead |

### N-fixes (it4-A, staged in `scripts/pending/c42b/next/`, registry via `it4a-registry-edits.py`)
N1 fillValueFor `*-export-days` = 30 · N2 crm-seq-save opener · N3/N5/N8/N9/N10 `createExtraFixtures` (runner-owned rows created BEFORE the snapshot only when a selected row needs them; deleted in CLEAN + safety net; `PREFER_IDS` makes `*` rows press the fixture, never a seed row) · N4 viewport · N6 alsoOn + prefill · N7 `FULL_REPAIR_RE` += `^teams-create-(form|submit)` (`repairsAfter`) + opener · N9 `crm-panel-create-lead` query `c=[unlinkedConversationId]` (new placeholder, a room whose party has no CRM contact) · `run-chunks.sh` (copy in `scripts/pending/c42b/`): browser crash mid-chunk ⇒ redo the chunk once (`-crash.json` kept, not tallied) · `merge-main-rows.py <commit>` = 3-way merge of main's new registry rows (C5.4-E) — dry against session/crm 516d9b0c: 0 rows/0 conflicts; positive control vs 18feaa84: 135 field changes detected.

### Checkpoint A2 (1 Oct ~05:45 UTC)
- staged runner typechecked: `typecheck-3.log` exit 0 (tsconfig includes `**/*.mts` ⇒ `scripts/pending/c42b/next/*.mts` covered) · staged registry sweep (`SWEEP_REG=…next/…`) = 0 changes · staged `--dry` exit 0.
- manager chunks 1–7 triaged: #1 FATAL (browser died after group 1; `companies-import-backdrop` dead in that group, no shot — ENV/RUNNER, re-cover in dbg2) · #3 convert ×6 = S2 · #5 board ×2 = S9 · #6 **33 dead = RUNNER (new N11)**: `deal-owner-select` (select → first other owner) handed the open deal to a user outside the manager's teams ⇒ `dealWhere` hides it ⇒ every later row 404 (rows after it: forecast/next-step/menu/delete/call/AI) — product correct. Fix N11 `OWNERSHIP_RE` (`deal-owner-select`, `company-owner-submit`) ⇒ keepNew repair right after the row. deal-title-save m = S3.
- prepared (not launched): `scripts/pending/c42b/run3.sh` (+ `run-chunks.sh` copy with crash-redo) · `scripts/pending/c42b/dbg2.sh` (13 targeted steps on the PROMOTED runner, counts before/after).

### Checkpoint A3 (resumed · 1 Oct ~06:55 UTC · previous lane agent killed by a container restart ~06:40)
- Found on disk: run2 ENDED (`run2.status`: owner rc=0 04:52 · manager rc=0 06:21 · stopped before nok because the controller altered `run2.md5`) · manager summaries 1–13 present · `counts-after-run2.json` NOT written (unit stopped before its last line) · dbg2 NOT launched (no `/tmp/c42b-logs/dbg2*`) · staged fixes NOT promoted (`scripts/` still = run2 frozen md5 48dce828/c1807837; staged next/ = 85b7d7b2/76ac3a40) · staged registry already carries the it4a sweep change (`registry-sweep.it4a.txt`: `crm-emails-tab-unmatched` manager roles→hiddenFor, emails.ts:2359-2370) · `run3.sh` / `run-chunks.sh` (crash-redo) / `dbg2.sh` / `merge-main-rows.py` / `it4a-registry-edits.py` / facts5–7 exist, untracked.
- Unrelated dirty files in the worktree (`scripts/*-expected.json`, `scripts/fixtures/acc-v2/*`) are NOT this lane's and are never committed.
- Next: counts-after-run2 + restore proof · manager triage chunks 8–13 · promote · dbg2 · merge-main-rows 288cca97.

### Checkpoint A4 (1 Oct ~07:10 UTC)
- **Restore proof run2:** `counts-after-run2.json` (06:48) vs `counts-before-run2.json` (02:46) — every table count, qc-btn tag counts, live qc-btn sessions, portal settings and company0.taxId IDENTICAL (only `_at` differs) · restoreFail 0 in all 26 summaries. /tmp logs copied again to `.qc-shots/c42b/logs-snapshot/`.
- **Promoted** S1–S9 + N1–N11 into `scripts/` (runner 85b7d7b2 → + E fixture below · registry 76ac3a40 → + E rows). `it4a-registry-edits.py` = 0 changes on the promoted registry · sweep 0 changes · `--dry` exit 0 (8,259 → 8,283 presses with E · opener problems 0).
- **Main rows (C5.4-E 288cca97):** `merge-main-rows.py 288cca97` dry: +3 rows · 0 field changes · 0 removed · 0 conflicts (batch C 1b524af3 touched no registry row) → applied. E-only rows (NOT in the old :3215 build): `/companies/[companyId]` `company-lifecycle-correct` · `-confirm` · `-cancel` (owner/manager · hiddenFor nok/thana). Wiring added (no expectation changed): opener `company-lifecycle-correct` for confirm/cancel (Company360Actions.tsx@288cca97 `CompanyLifecycleCorrect`: sheet only after the button) · runner fixture `lifecycleCompanyId` = runner-owned live CUSTOMER company with NO won deal (every QC1 CUSTOMER company holds 1 WON deal — `facts8.mts` — and setCompanyLifecycle refuses then, companies.ts@288cca97:1004-1005 `COMPANY_HAS_WON_DEAL_MSG`; button shown only for CUSTOMER, page.tsx@288cca97:175) — same owner/team as the shared pick, admitted by `companyWhere` (printed in PICKS), deleted in CLEAN + safety net · `STATE_FLIP_RE` repairs after `-confirm` (company becomes PROSPECT ⇒ the cancel row's opener vanishes). merge script: a row the lane only EXTENDED (extra field) no longer counts as a conflict (re-run = 0/0).
- typecheck of the promoted runner queued behind the gate lock (`typecheck-4.log`) · :3215 being rebuilt by the controller (`crm-rebuild-e`, 061cf35f = src 288cca97) ⇒ dbg2 waits for `BUILD-STATE READY … 061cf35f` (guard added to dbg2.sh) · dbg2 gained steps `e-lifecycle-owner` · `n11-mgr-deal` · `mgr-emails`.

### Manager triage — run2 (13 chunks · chunk 1 FATAL) · 91 non-pass + 2 console · every one classified
| chunk | rows (d=1440 · m=390) | n | class | cause (evidence) | fix |
|---|---|---|---|---|---|
| 1 `/companies` | companies-import-backdrop d (+ 15 groups never run) | 1 dead + FATAL | ENV/RUNNER | Chrome died (`ConnectionClosedError` in newPage after group 1) — no product signal | run-chunks crash-redo · dbg2 `mgr-companies` |
| 3 `/contacts/[` | contact-convert-company-role/-taxid/-done d+m | 6 dead | REGISTRY | dialog fields exist only after `contact-convert-btn` | S2 |
| 5 `/deals` | deal-card-* m · deal-stage-tab-* m | 2 wE | RUNNER | 390 drop off-screen · first tab = active (F2) | S9 |
| 6 `/deals/[` | 32 rows after `deal-owner-select` (forecast/next-step/menu ×8/AI ×4/call) d+m | 32 dead | RUNNER | owner select handed the deal outside manager's teams ⇒ `dealWhere` hides it ⇒ 404 (product correct) | N11 |
| 6 | deal-title-save m | 1 dead | RUNNER | sticky header covered the click | S3 |
| 8 `/activities` | activity-log-form/-submit d+m | 4 wE | RUNNER | target option skipped | S4 |
| 9 `/emails` | crm-emails-tab-unmatched d+m | 2 dead | REGISTRY | tab rendered only when `listThreads({unmatched})` passes `assertUnmatchedGate` — non-owner needs whole-shop unitAccess + CONTACT ALL (emails.ts:2359-2370 · emails/page.tsx:48-49); QC1 manager is unit-scoped | sweep it4a: manager → hiddenFor |
| 9 `/emails/[threadKey]` | 10 rows d+m + 2 console 404 | 20 dead | FIXTURE | only QC1 thread belongs to a deleted contact ⇒ 404 correct | S6 |
| 9 `/objects/[key]/[recordId]` | object-record-archive-btn d+m | 2 wE | REGISTRY | two-step arm button | S7 |
| 10, 11 | — | 0 | — | 218/218 · 224/224 | — |
| 12 `/settings/sequences/[id]` | crm-seq-save d+m · crm-seq-stats-version d+m | 4 dead | REGISTRY / FIXTURE | opener missing · one version only | N2 · N3 |
| 12 `/settings/quotas` | crm-quota-deals-* m | 1 dead | REGISTRY | desktop-only column | N4 |
| 12 `/settings/sequences` | crm-seq-new-form/-submit d+m | 4 wE | RUNNER+REGISTRY | first-step fields never prefilled | N6 |
| 13 `/app/sys/[id]` | crm-home-source-row-* d+m | 2 dead | FIXTURE (time-rot) | current-month count | N8 |
| 13 | crm-panel-log-activity + type/title/submit d+m | 8 dead | RUNNER+FIXTURE | no linked chat room | N9 |
| 13 | crm-home-saved-view d+m | 2 wE | FIXTURE | 0 saved views | N10 |
Manager tally (run2): pressed 1617 · passed 1526 · dead 38/39 · wrongExpect 6/8 · hiddenLeak 0 · vacuous 0 · overflow 0 · console 2 (= the S6 404) · restoreFail 0 · fatal 1 (chunk 1). **0 PRODUCT** in manager. nok/thana/customer NOT run in run2 (unit stopped by the controller before nok).
- **Commit layout (fitness F14.2):** the lane base (46f952cc) has no E source ⇒ the 3 E rows are "ghost rows" for the pre-commit fitness here. Committed `scripts/crm-ui-inventory.json` = registry WITHOUT the E rows (md5 76ac3a40 = staged it4-A registry); the E-merged registry (what dbg2/run3 run against the 061cf35f build) is committed as `scripts/pending/c42b/next/crm-ui-inventory.json` and is the WORKING copy of `scripts/crm-ui-inventory.json` (uncommitted delta = exactly 3 rows + 2 openers). On main (E present) copy next → scripts; fitness then sees real testids.

### Checkpoint A5 (1 Oct ~07:05 UTC)
- typecheck of the promoted runner (c79ee4c4, incl. E fixture) **exit 0** (`typecheck-4.log` 06:59, ran after the last runner edit 06:51) · :3215 READY `be48ab61` (controller: src = 288cca97 · C + E · label differs only by ledger commits; E is an ancestor, 0 src/registry diff 288cca97..be48ab61).
- **dbg2 launched** `crm-c42b-dbg2` (16 steps, md5 runner c79ee4c4 / registry 5a8aa973 = with E rows) — status `/tmp/c42b-logs/dbg2.status`, log `dbg2.log`, per-step `dbg2-summary-<step>.json`.
- run3.sh: logs BUILD-STATE at start (run-chunks already waits per chunk for READY + server up) — NOT launched.

### dbg2 findings so far (staged in `scripts/pending/c42b/next/` + `it4a-registry-edits.py` — NOT promoted while dbg2 runs: dbg2 md5-freezes scripts/)
| step | result | non-pass | class | cause (evidence) | fix (staged) |
|---|---|---|---|---|---|
| s3-title · s5-consent · s4-activities · s7-objects · s8-commissions · s6-email-nok | 49/49 · 65/65 · 80/80 · 27/27 · 44/44 · 14/14 | — | — | S3 · S1+S5 (outbox settle seen working) · S4 · S7 · S8 · S6 verified | — |
| s9-board (owner 390) | 34/35 | deal-card-* wE | RUNNER | drag grabbed the card centre = title LINK on 390; board ignores pointerdown on `a/button/input` (usePointerBoardDrag.ts onCardPointerDown `el.closest("button, a, input, textarea, select")`) ⇒ click opened the deal (fail shot = Deal 360) | D3 grab a non-interactive point of the card (elementFromPoint scan) |
| s6-email-owner | 12/18 | crm-email-attach-contact-q/-go d+m dead · crm-email-template d+m dead | FIXTURE | attach block renders only for a thread with no contact (`emails/[threadKey]/page.tsx:83 canAttach: !contactId`) — S6 thread is contact-linked · QC1 has 0 CrmEmailTemplate ⇒ select has only "— ไม่ใช้แม่แบบ —" (page.tsx:85, EmailComposer.tsx:160) | D4 company-linked no-contact thread (`attachThreadKey`, visible via company — emails.ts rowVisibleFilter) for `crm-email-attach-contact-*` · D5 runner-owned active template |
| n-settings | not run | — | RUNNER (dbg script) | dbg2 splits steps on `|`, the page regex contains `|` ⇒ `--user /(pipelines` refused | dbg3.sh uses `;` |
| n-teams | 40/42 | teams-show-archived d+m wE | FIXTURE | QC1 has no archived team (row `needs` says so); TeamsManager.tsx:46 `teams.filter((t) => showArchived || !t.archived)` — run2 passed only on a teams-create leftover that N7 now repairs | D6 runner-owned archived Team |
| n-home-chat-owner | 81/85 | crm-panel-log-activity + 3 m dead | REGISTRY | the chat context column is `hidden … lg:flex` "ซ่อนต่ำกว่า lg ตามแบบร่าง" (inbox-client.tsx:2118-2120) — other crm-panel rows were masked as skippedNeeds on 390 | D1 all `crm-panel-*` viewport desktop |
| n-home-chat-nok | 48/52 | crm-panel-log-activity + 3 d dead | REGISTRY | room page shows the inbox only when canReadChat (sys/[id]/page.tsx:63 · chat/guard.ts:39-42 `chat.conversation.read`); QC1 nok/thana evaluate FALSE (facts9.mts) ⇒ refusal card | D2 §15(b): crm-panel-* nok/thana roles→hiddenFor |
| mgr-companies (re-cover of run2 manager chunk 1 FATAL) | 196/196 | — | — | incl. the 3 C5.4-E lifecycle rows on the live E build (fixture admitted by companyWhere · confirm wrote + STATE_FLIP repair) | — |
| e-lifecycle-owner (`/companies/[`) | 118/118 | — | — | E rows owner d+m pass on the live build | — |
| n11-mgr-deal (`/deals/[` manager) | 98/98 | — | — | N11 verified (run2: 33 dead) | — |
| mgr-emails (manager 1440) | 18/21 | attach-contact-q/-go · template dead | FIXTURE | same as s6-email-owner | D4 · D5 |
**dbg2 restore proof:** restoreFail 0 in every step · `counts-before-dbg2` = `counts-after-dbg2` = `counts-after-run2` (all tables, tags, sessions, portal, taxId).

### Checkpoint A6 (1 Oct ~09:45 UTC)
- dbg2 DONE (07:00–09:32). Promoted D1–D6 into `scripts/` (runner 2f83a576 · registry b35c337c with E rows): it4a edits 45 field changes (re-run 0) · sweep 0 changes · merge-main-rows 288cca97 0/0 · `--dry` exit 0 (8,247 presses: −36 = crm-panel-* no longer claimed on 390 and nok/thana now hidden-checks) · typecheck exit 0 (`typecheck-5.log`).
- **dbg3 launched** `crm-c42b-dbg3` (7 steps: s9-board · s6-email-owner · n-settings · n-teams · n-home-chat-owner · n-home-chat-nok · mgr-emails) on :3215 READY be48ab61.

### dbg3 (1 Oct 09:38–11:12 UTC · promoted runner 2f83a576 · registry b35c337c · :3215 be48ab61 = src 288cca97)
| step | result |
|---|---|
| s9-board owner 390 (D3) | 35/35 |
| s6-email-owner d+m (D4 no-contact thread · D5 template) | 20/20 (picks: emailThreadNoContact · emailTemplate) |
| n-settings owner d+m (N1–N6 — never ran in dbg2) | 169/169 |
| n-teams owner d+m (N7 · D6 archived team) | 42/42 |
| n-home-chat-owner 1440 (N8–N10 · D1) | 44/44 |
| n-home-chat-nok 1440 (D2 hidden by chat gate) | 57/57 |
| mgr-emails manager 1440 (D4 · D5 · it4a unmatched tab) | 22/22 |
**Restore proof dbg3:** restoreFail 0 every step · `counts-before-dbg3` = `counts-after-dbg3` = `counts-before-run2` baseline (0 diffs). dbg2+dbg3 cover every run2 owner/manager non-pass class; all classified non-passes now pass or are covered by a verified fix.

## it4 PHASE A — FINAL (1 Oct ~11:20 UTC)
**Tallies run2 (frozen pre-fix runner 48dce828 / registry c1807837 · build 46f952cc):**
| role | pressed | passed | dead d/m | wrongExpect d/m | hiddenLeak | vacuous | console | overflow | restoreFail | fatal |
|---|---|---|---|---|---|---|---|---|---|---|
| owner | 1764 | 1690 | 22/24 | 11/17 | 0 | 0 | 2 | 0 | 0 | 0 |
| manager | 1617 | 1526 | 38/39 | 6/8 | 0 | 0 | 2 | 0 | 0 | 1 (chunk 1 browser crash) |
| nok · thana · customer | not run in run2 (controller stopped the unit before nok) | | | | | | | | | |
**Classification of the 165 owner+manager non-passes:** RUNNER 65 (owner 21 · manager 44 incl. N11 32 + FATAL 1; S1/S3/S4/S5/S8/S9/N1/N6/N7/N11 — N6 is runner+registry) · REGISTRY 28 (owner 15 · manager 13; S2/S7/N2/N4/N7-opener/unmatched-tab) · FIXTURE 72 (owner 38 · manager 34; S6/N3/N5/N8/N9/N10 — N9 is runner+fixture) · **PRODUCT 0**. Targeted re-runs on the E build: dbg2 944 presses (owner 550/563 · manager 312/315 · nok 62/66 — the 20 non-passes became D1–D6) · dbg3 389/389 (owner 310 · manager 22 · nok 57) · restoreFail 0 throughout.
**Promoted fixes (in `scripts/`):** S1–S9 · N1–N11 · E-rows wiring (lifecycle fixture + opener + STATE_FLIP repair) · D1 crm-panel desktop-only (inbox-client.tsx:2118-2120) · D2 crm-panel hiddenFor nok/thana (chat.conversation.read gate, sys/[id]/page.tsx:63) · D3 drag grab point (usePointerBoardDrag onCardPointerDown) · D4 no-contact thread for attach-contact rows (emails/[threadKey]/page.tsx:83) · D5 e-mail template fixture (page.tsx:85) · D6 archived-team fixture (TeamsManager.tsx:46). Sweep 0 · it4a edits idempotent (0) · `--dry` exit 0 (8,247 presses · opener problems 0) · typecheck exit 0 (`typecheck-5.log`).
**Main rows:** C5.4-E 288cca97 → +3 rows (company-lifecycle-correct · -confirm · -cancel) merged, verified on the live E build (owner 118/118 `/companies/[` · manager 196/196 `/companies`). session/crm head now 83c500f5 (C5.4-D2 8cf86985: emails.ts/sequences.ts/b actions — backend only) → `merge-main-rows.py 83c500f5` = 0 rows/0 changes/0 conflicts; :3215 (be48ab61) does not contain D2 — no registry impact, controller decides whether run3 needs a rebuild.
**Commit layout:** committed `scripts/crm-ui-inventory.json` = registry WITHOUT the 3 E rows (lane src 46f952cc lacks E ⇒ pre-commit F14.2 "ghost rows"); the full registry run by dbg3/run3 = `scripts/pending/c42b/next/crm-ui-inventory.json` (= working copy, md5 b35c337c). On main: `cp scripts/pending/c42b/next/{qc-crm-buttons.mts,crm-ui-inventory.json} scripts/`.
**PRODUCT findings (for C4.2-fix · none fixed here):**
- F1 `/companies` list + nav tab not gated by `crm.company.read` — companies/page.tsx:48-56 · nav.ts:30 (repro above). Will show as hiddenLeak in nok/thana chunk 1 of run3.
- F2 (a11y) `deal-stage-tab-*` active stage only by inline style, no aria-current/aria-pressed — DealBoard.tsx:184-191.
- No new product finding in owner/manager. Observation (not a bug, design question): on < lg the chat room has no CRM panel at all (context column hidden "ตามแบบร่าง", inbox-client.tsx:2118) while the member card still shows on 390 — staff on phones cannot log a CRM activity from chat.
- Data note: 3 orphan `CrmEmailMessage` (thread bcbc2add…) from a 28 Sep journey remain in QC1.
**Ready for run3: YES** — `scripts/pending/c42b/run3.sh` (owner → manager → nok → thana → customer, md5 freeze, counts before/after, run-chunks waits for READY + crash-redo once). NOT launched.
