# WO C3.5 — พอร์ทัลลูกค้าองค์กร B2B `/b/[slug]/*` (DRAFT ของ builder)

> RUN "CRM v2" · worktree `/root/projects/shark-crm-c110` (detached HEAD `684828d0`) · QC2 (`ep-cool-shadow`) · 26 ก.ย. 2569 · builder: Opus
> สัญญา: `ledger/CRM-RUN.md` §2 C3.5 · `ledger/crm-briefs/crm-brief-C3.5.md` (addendum 1–17 + ruling) · COMMON · RESOLUTIONS (R-C.5 · R-C.10 · R-D · R-E.2 · R-E.13 · R-E.14)
> ข้อสอบ: `scripts/qc-crm-c3.5.mts` (67 ข้อ · **ไม่แก้**) · ผล QC2: **67/67** (`.qc-shots/c35/oracle-1.log`)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/crm/portal.ts` | ใหม่ | บริการทั้งหมด: ร้าน (`portalShopBySlug`) · ตัวตน (acceptInvite · requestOtp · verifyOtp · loginWithLine · switchCompany · logout · requirePortal) · ลูกค้า (home/myCompanies/me/frameData · quotations+respond · invoices+payLink+uploadSlip · receipts · documents/getRecord/requestRecordChange · requests · contacts) · พนักงาน (invite · revoke · listAccess · listCompanyRequests · decideRequest · get/savePortalSettings) · ระบบ (eraseContact · onApprovalDecided · onPortalEvent) |
| `src/lib/modules/crm/portal-shared.ts` | ใหม่ | บริสุทธิ์: `PORTAL_BASE_PATH = "/b"` (ตัวเดียว) + `portalPath` · `parsePortalSettings` · บทบาท/ชนิดคำขอ/ป้าย · `portalProgressOf` (R-E.13) · `quotationExpired` (วันไทย) · DTO · `PortalError` |
| `src/lib/modules/crm/portal-actions.ts` | ใหม่ | server actions พนักงาน (assertCrmV2 → assertCanCrm `crm.portal.manage`) |
| `src/lib/modules/crm/portal-session.ts` | ใหม่ | ปิดหนี้ของ `visual-crm.mts`: ส่งต่อ `mintPortalSession` (รหัส = `CrmPortalAccess.id`) |
| `src/lib/modules/crm/api/portal-lane.ts` | ใหม่ | เลน REST ลูกค้า `/api/v1/crm/portal/*` (16 op · ทะเบียนแยก `PORTAL_OPS` ไม่อยู่ใน `CRM_OPS`) · ด่าน = token `cp_` เท่านั้น · เพดานต่อ access |
| `src/lib/modules/crm/api/dispatch.ts` · `config.ts` | แก้ (บล็อก C3.5) | `/portal/*` → เลนพอร์ทัล · token `cp_` บน op ของร้าน = 403 |
| `src/lib/platform/crm-bridges/portal.ts` (+ index) | ใหม่ | R-D: ตัวรับ 3 event → กิจกรรม PORTAL (ประตู uiVersion/bridgesEnabled) |
| `src/lib/modules/member/customer-session.ts` | แก้ (บล็อก C3.5 + ตัวช่วยร่วม) | ผิว session: `PORTAL_TOKEN_PREFIX "cp_"` · `isPortalToken` · `portalCookieName` · `mintPortalSession` · `getPortalSession` · `revokePortalSession` · `revokeAllPortalSessions` · `requestPortalOtp` · `verifyPortalOtp` · `hitPortalInviteLimit` · `requirePortalSession` · `portalTokenFromCookies` — OTP/limiter แยกเป็นตัวช่วยร่วม (`otpTargetOf · hitOtpAskBuckets · createOtpRow · sendOtpMailOffPath · openOtp · failOtp`) ที่ `requestOtp/verifyOtp` ของสมาชิกเรียกด้วย **พฤติกรรมเดิมทุกตัวอักษร** |
| `src/lib/modules/member/index.ts` | แก้ (บล็อก C3.5) | ส่งออกผิว session พอร์ทัลผ่าน facade |
| `src/lib/modules/member/fields.ts` | แก้ (C3.5) | engine ฟิลด์: `portalVisible/portalEditable` ใน createField/updateField (วัตถุกำหนดเองเท่านั้น · แก้ได้ต้องเห็นได้ · อ่อนไหว = แก้ผ่านพอร์ทัลไม่ได้) — **ไม่เพิ่มใน FieldDef DTO** (golden C1.2a-G1.x ต้องเท่าเดิมทุกไบต์ · ลองแล้วแดง 4 ข้อ → ถอยออก) |
| `src/lib/modules/account/service.ts` | แก้ (บล็อก C3.5) | 🔴 **ข้อ 14**: `setQuotationResponse` → `updateMany … status='AWAITING_ACCEPT'` ใน tx · event/audit เฉพาะผู้ชนะ · `alsoEmit` (event ของผู้เรียกใน tx เดียวกัน) |
| `src/lib/modules/account/index.ts` | แก้ (บล็อก C3.5) | `respondQuotation` รับ `reason` (ลง audit ของเอกสาร) + `alsoEmit` · `listPortalDocs` · `firstReceiveFinanceId` · `attachPrivateFileToDoc` |
| `src/lib/storage/private-links.ts` · `src/app/api/files/[id]/route.ts` | แก้ (C3.5) | ผู้ดูชนิด `PORTAL` (= `PortalSession.id`) · route อ่านคุกกี้ `shark_portal` · ถังเพดานของ PORTAL มี tenantId |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/approval-effects.ts` | แก้ (บล็อก C3.5) | consumer 3 ตัว · ป้าย 3 ตัว · ผลอนุมัติ `crm.portal_request` |
| `src/lib/modules/crm/index.ts` · `nav.ts` · `src/app/app/layout.tsx` | แก้ (บล็อก C3.5) | facade `portal` + ค่าคงที่/ชนิด · เมนูลึก + drawer "พอร์ทัลลูกค้า" (crm.portal.manage) |
| `src/app/b/[slug]/**` | ใหม่ | layout (branding · 404 · viewport) · 11 หน้า + `auth/line/route.ts` + `actions.ts` + `_page.ts` |
| `src/components/crm/portal/*` | ใหม่ | PortalFrame (เปลือก 430 px → lg เดสก์ท็อป + เมนูพอร์ทัลเอง) · PortalLoginForm · PortalClientBits · CrmPortalBlock/CrmPortalAccessPanel (บริษัท 360) · PortalSettingsForm |
| `src/app/app/sys/[id]/crm/companies/[companyId]/page.tsx` | แก้ (บล็อก C3.5) | บล็อกพอร์ทัลในแถบขวา |
| `src/app/app/sys/[id]/crm/settings/portal/page.tsx` | ใหม่ | ตั้งค่าพอร์ทัล (เปิด/วิธีเข้า/บอร์ดรับเรื่อง/showDeals) |
| `scripts/crm-ui-inventory.json` | แก้ | +53 แถว wo C3.5 |
| `scripts/gen-crm-api-docs.mts` + `docs/api/CRM-API.md` | แก้ | สาขา payload 3 event (ไม่ตก `teamId, change`) + regen |
| `scripts/fitness.mts` | แก้ (คอมเมนต์) | อธิบาย 4 เส้นที่ C3.5 ใช้ (ไม่เพิ่มเส้น) |
| `scripts/visual-crm.mts` | แก้ (หนี้ C3.5) | กวาดซาก `PortalSession/CustomerSession` ของรอบที่ถูก kill (UA + เกิดก่อน 1 ชม.) |

## 2. migration / seed
- ไม่มี migration (ตาราง/ธงมากับ `crm_v2_c` · S0.4 ✅) · seed ไม่เปลี่ยน (`*-expected.json` ถูกเขียนใหม่ตอน reseed QC2 — ไม่ commit)

## 3. หลักฐานที่ผู้คุมงานสั่ง
1. **race ของบัญชี** (`.qc-shots/c35/race-prefix.log` · `race-postfix.log` · สคริปต์ `race-evidence.mts`): accept∥reject (3+3 ต่อรอบ) × 12 รอบผ่าน `account.respondQuotation` ตรง
   - ก่อนแก้ (`git checkout -- service.ts`): **11/12 รอบ commit ทั้งคู่** (event `[false,true]` · okCalls 6/6 · audit 6)
   - หลังแก้: **12/12 รอบ ผู้ชนะ 1** (event 1 · okCalls 1/6 · audit 1)
   - ข้อสอบเต็มบนโค้ดบัญชีเดิม (`oracle-prefix-control.log`): X3.2 ❌ `events=true,false status=REJECTED` (+ S2.2/X7.5/X8.2/X3.1 ❌ เพราะ event พอร์ทัลมากับ `alsoEmit`) ⇒ ฝั่งพอร์ทัล **ไม่มีล็อกของตัวเอง** · X3.2 เขียวจากการแก้ในบัญชีเท่านั้น
2. **revoke ทันที** (`evidence-2-5.log`): 11:11:36.443 home OK → 11:11:36.727 revoke (sessionsRevoked=1) → 11:11:36.738 home เดิม = UNAUTHORIZED · getPortalSession = null
3. **token เชิญไม่มีข้อความธรรมดา**: ค้น `row::text LIKE %token%` ทั้งตาราง (ทุกร้าน) CrmPortalAccess · PortalSession · CrmPortalRequest · AuditLog · OutboxEvent · OpsEvent · CrmActivity · CustomerOtp · ChatRateBucket = 0 ทุกตาราง · hash ถูกล้างหลังรับคำเชิญ
4. **limiter ร่วม**: ถัง `customer-otp:target:<tenant>:EMAIL:<email>` 0 → พอร์ทัล 1 → สมาชิก 2 → พอร์ทัล 3 → ครั้งที่ 4 `CustomerRateLimitError(RATE_LIMITED)`
5. **PDPA**: ก่อน `{access 1, sessions 2, requests 2}` → `eraseContact` คืน `{1,2,2}` → หลัง `{0,0,0}` · token เก่าตาย

## 4. ถ่ายภาพ (ข้ามในใบนี้ — ต้อง build) · วิธีให้ผู้คุมงาน
1. เตรียมร้าน QC (เปิดพอร์ทัล + สิทธิ์ของผู้ติดต่อ seed คนแรกที่มีอีเมล · อีเมลเชิญไม่ออกนอกเครื่อง):
   `bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx .qc-shots/c35/portal-visual-prep.mts` → พิมพ์ `customer:<accessId>`
   (เท่ากับ: `crm.portal.savePortalSettings(ctx, owner, {enabled:true,…})` + `crm.portal.invite(ctx, owner, {companyId, contactId, role:"APPROVE"})` + ตั้ง acceptedAt)
2. `pnpm exec tsx scripts/visual-crm.mts 3.5 --user customer:<accessId>` — ตัวออก session = `src/lib/modules/crm/portal-session.ts#mintPortalSession(<accessId>)` (token `cp_…` · tokenHash = sha256 ดิบ ⇒ finally ของสคริปต์ลบแถวได้) · 🔴 `SPECS["3.5"]` ยังไม่มีในสคริปต์ (ผู้คุมงานเป็นเจ้าของ spec) — หน้า: `/b/<slug>/login` (ไม่มี session) · `/b/<slug>` · `/quotations` · `/invoices` · `/documents` · `/requests` · `/contacts` ที่ 390 และ 1440
3. คืนสภาพ: `… portal-visual-prep.mts --undo`

## 5. มติทางเทคนิค
- ✅ (มติผู้คุมงาน: X1.3 ชนะ addendum ข้อ 6) `home().companies` = `[{id, name}]` แต่ **ชื่อของบริษัทอื่น = ""** — addendum ข้อ 6 ให้มีชื่อ แต่ X1.3 ห้ามชื่อบริษัท B ในทุก list ของ session บริษัท A (คนเดียวกันมีสิทธิ์ทั้งสองบริษัท) ⇒ ชื่อไปทาง `myCompanies(token)` ของตัวสลับแยก
- เลน REST พอร์ทัลเป็น **ทะเบียนแยก** (ไม่อยู่ใน `CRM_OPS`) บน dispatch ของแกนตัวเดียวกัน — คีย์ร้านเข้าไม่ได้ · คู่มือ/OpenAPI/tool ของคีย์ร้านไม่เปลี่ยน (C3.8 เปิด op พนักงานของพอร์ทัลเอง)
- crm → member ผ่าน **facade ที่สอง `member/session-facade.ts`** (re-export ผิว session ล้วน · รอบ 2 ตามมติผู้คุมงาน) — facade หลักแบบค่าลาก wallet→giftcard→pos→outbox-consumers→บัญชี ทำให้ `crm/api` โหลดแล้วเกิด TDZ `VISIBLE_DOC_TYPES` (F10.1 แดงจริง) · ด่านใหม่ fitness **F2.4**: ฝั่ง CRM/พอร์ทัลแตะสมาชิกได้แค่ `member` หรือ `member/session-facade`
- ใบ OTP ของพอร์ทัลมี id ขึ้นต้น `po_` (customerId = null) ⇒ ใบของสมาชิกยืนยันเป็นพอร์ทัลไม่ได้และกลับกัน · ใช้ใบแบบมีเงื่อนไข `usedAt IS NULL`
- รับคำเชิญ: นับถัง `customer-otp:verify:ip:<ip>` ทุกครั้ง (10/15 นาที) ก่อนแตะอะไร · claim = `updateMany where inviteTokenHash=hash` · หน้า `/invite/[token]` ไม่ใช้ลิงก์เองตอนเปิด (ตัวสแกนลิงก์) ต้องกดปุ่ม
- `crm.portal.quote.responded` ยิงใน tx ของบัญชี (`alsoEmit`) ⇒ มีเฉพาะคำตอบที่ชนะ · `crm.portal.viewed` = createMany skipDuplicates
- บทบาท: VIEW (ดู) · PAY (+ชำระ/สลิป) · APPROVE (+ตอบใบเสนอราคา) · ADMIN · ไม่ระบุตอนเชิญ = VIEW (ค่าเริ่มต้น schema) — ฟอร์มพนักงานตั้งต้น APPROVE
- PROFILE_CHANGE ที่อนุมัติ = เขียนค่าเฉพาะฟิลด์ TEXT/LONG_TEXT (ชนิดอื่นอนุมัติได้แต่พนักงานแก้เอง) · ฟิลด์ `sensitive` ไม่แสดงในพอร์ทัล
- กรอบ 430 px ที่มือถือ · lg ขยายเป็นเลย์เอาต์เดสก์ท็อปตามภาพ 12 (ค) (เมนูพอร์ทัลเอง ไม่ใช่เมนูพนักงาน)

## 6. (ย้ายไป §8)

## 7. ผลข้อสอบ (QC2 · log `.qc-shots/c35/`)
| ชุด | ผล | log |
|---|---|---|
| qc-crm-c3.5 | **67/67** (รอบแรก + รอบหลังแก้ C1.3-S0.3) | `oracle-1.log` · `reg2-qc-crm-c3.5.log` |
| qc-member-m2.9 | 21/22 — S5.2 = ภาพหน้าจอ (ต้องมี server/ภาพ visual) | `reg-qc-member-m2.9.log` |
| qc-member-m3.11 | 11/15 — S3.2 ภาพ · S4.1/S5.1 ยิง HTTP `127.0.0.1:3215` (ไม่มี server) · ERR ตามมาจาก S5.1 | `reg-qc-member-m3.11.log` |
| qc-member-fix-s1 · qc-pages · qc-payment | 28/28 · 31/31 · 16/16 | `reg-*.log` |
| qc-acc-v2-promptpay · qc-acc-v2-attachments | 84/84 · 66/66 (หลัง `seed-acc-v2-qc` บน QC2 — เฉลยเดิมชี้ร้านที่ไม่มีใน QC2) | `reg3-*.log` |
| qc-crm-c0.4 · c1.8 · c3.0 · c0.2 · c1.10 · c2.11 · c1.11 (CRM_V2_SWITCH=all) | 72/72 · 81/81 · 33/33 · 27/27 · 66/66 · 47/47 · 66/66 | `reg-*.log` |
| qc-crm-c1.3 | 89/89 (รอบแรก 88 — portal.ts อ่าน CrmCompany ตรง → ย้ายไป `companies.companyRefsInTx`/แถวสิทธิ์) | `reg2-qc-crm-c1.3.log` |
| qc-crm-c2.7 | 63/63 (รอบแรก 60/63 S3.2/S9.3/S9.4 — ลำดับ event ที่ createdAt เท่ากัน · รันซ้ำเขียว) | `reg2-qc-crm-c2.7.log` |
| qc-crm-c1.2a · c1.2b · qc-member-m1.4 · m1.9 | 91/91 · 93/93 · 37/37 · 26/26 | `reg3/reg2/reg-*.log` |
| qc-member-m1.3 | 11/14 — S3.x = ภาพหน้าจอ | `reg2-qc-member-m1.3.log` |
| qc-nav-functions | exit 0 | `reg-qc-nav-functions.log` |
| fitness (มี env · ไม่มี env) | 32/32 · 32/32 | `fitness-env.log` · `fitness-noenv.log` |
| typecheck (2 รอบ) | exit 0 · exit 0 | `typecheck-1.log` · `typecheck-2.log` |

## 8. หนี้ (DEFERRED — ผู้คุมงานรับแล้ว 26 ก.ย.)
- PDF ใบเสนอราคา/ใบแจ้งหนี้ในพอร์ทัล + "ขอใบกำกับเต็มรูป" จากใบเสร็จ → C3.9 / เจ้าของ
- LINE push คำเชิญ → ยังไม่มี gateway
- สวิตช์ `portalVisible/portalEditable` ของฟิลด์ใน Field Designer (engine รับแล้ว · UI ยัง) → C3.7/C4
- เทมเพลตแจ้งพนักงานเมื่อมี event ของพอร์ทัล → C3.6–C3.9 (ทะเบียนเทมเพลตไม่ตายตัวแล้ว — C3.3 เพิ่มตัวที่ 11)
- 🔁 **PDPA ทั้งกระบวน = C3.9** (`portal.eraseContact` เป็นเพียงส่วนของพอร์ทัล: ลบสิทธิ์/session/คำขอ + ยกเลิกคำขออนุมัติที่ค้าง + ล้างข้อความการ์ด)
- คีย์ event `account.quotation.responded#<docId>#<accepted>` จะชนกันถ้าวันหนึ่งใบเสนอราคากลับไป AWAITING_ACCEPT ได้ (ตอนนี้ไม่มีทางนั้น) — ต้องเติม "รอบ" ในคีย์เมื่อเปิดทางนั้น
- IP ดิบใน `CustomerOtp.ip` (ทั้งเลนสมาชิก — ไม่ใช่ของใบนี้) → ควรเก็บเป็น HMAC แบบ `portalIpHash`
- XFF: ใช้ค่าแรกของ `x-forwarded-for` เป็น IP ทุกเส้น (ทั้งแพลตฟอร์ม · เลนสมาชิกด้วย) — ต้องตั้งค่าตัวเชื่อ proxy ที่ edge ก่อนเชื่อค่า
- ไคลเอนต์คีย์ API เปิด `/api/account-files/<id>` ไม่ได้ (ต้องมี session พนักงาน) → C3.8 (ลิงก์ลงนามสำหรับคีย์)
- PDPA: ประวัติ/ความเห็นของการ์ดที่เปิดจากคำขอพอร์ทัลยังไม่ถูกล้าง → C3.9
- ความเป็นเจ้าของตาราง: `PortalSession` เป็นตารางของโมดูลสมาชิก (ตัวตน) แต่ CRM เขียนตรงที่ `crm/portal-identity.ts` (เพิกถอน) และ `eraseContact` (ลบ) — ควรย้ายเป็นฟังก์ชันของ `member/session-facade` ในใบถัดไป
- finding ของเลนสมาชิก: `/m/[slug]/auth/line` ยังไม่มีด่าน content-type/same-origin/nonce/iss/aud-บังคับ (ไม่ใช่ helper บรรทัดเดียว — ไม่แตะในใบนี้ตามมติ)

## 9. รอบ 2 (มติผู้คุมงาน 26 ก.ย. — ข้อที่ไม่รับ ปิดแล้ว)
1. **facade สมาชิก**: `src/lib/modules/member/session-facade.ts` (ใหม่ · re-export ล้วน) · `crm/portal.ts` · `crm/portal-session.ts` · `crm/api/portal-lane.ts` · `crm/api/config.ts` · `app/b/[slug]/{actions.ts,auth/line/route.ts}` · `app/api/files/[id]/route.ts` (บรรทัด PORTAL) เปลี่ยนมา import ไฟล์นี้ · `scripts/fitness.mts` ด่าน **F2.4** (+ คอมเมนต์ ALLOWED_EDGES) · F2.3/F10.1 เขียว
2. **สลิปในหน้าบัญชีเปิดได้**: `account/attachment-shared.ts` `viewableAttachmentUrl()` (ไฟล์ส่วนตัว → `/api/account-files/<attachmentId>`) ใช้ที่ `attachment.ts` (listAttachmentsPaged · getAttachmentRow) · `doc-detail.ts` · `contact-profile.ts` · `DocEditorPage.tsx` · route ใหม่ `src/app/api/account-files/[id]/route.ts`: session พนักงาน → เพดาน → แถวของร้าน + ระบบ ACCOUNT → `account.doc.view`/`account.document.manage` → FileAsset ของร้าน → 302 ไป `privateFileUrl(asset, {kind:"STAFF", id:user})` (ลงนามตอนกด ⇒ ไม่มีลิงก์หมดอายุค้างจอ) · หลักฐาน `r2-account-files-probe.log`: OWNER 302 + HMAC ผ่านเฉพาะ {STAFF, owner} · STAFF ไม่มีสิทธิ์ 404 · ร้านอื่น 404 · ไม่มี session → login · id รูป path 404
3. **งานกวาด** `crm.portal.sessions.sweep` (ทะเบียน C0.5 `platform/minute-jobs.ts` บล็อก C3.5): hourly + ตัวงานเช็คช่อง 03:xx ไทย (`portal.portalSweepSlot`) → `portal.sweepSessions` → `member/customer-session.ts#sweepPortalSessions` (DELETE คำสั่งเดียว: หมดอายุ หรือ ถูกเพิกถอน เกิน 30 วัน) · probe `r2-sweep-probe.log`: 02:30 ไทย ไม่ลบ · 2 รอบซ้อนที่ 03:10 ไทย → เหลือ [active, expired-5d, revoked-2d] (ลบ expired-31d/revoked-31d) · รอบซ้อนตรงบริการ = ลบ 0+0 · PASS

## 10. รอบ 3 — ผลตรวจความปลอดภัย (มติผู้คุมงาน · ทำครบทุกข้อ) · หลักฐาน `.qc-shots/c35/r3-probes.log`
| ข้อ | ที่ | ทำอะไร | หลักฐาน |
|---|---|---|---|
| S1 | `crm/portal.ts` `portalWriteGate` (createRequest · requestRecordChange · uploadSlip · payLink) | ถัง `crm:portal:write:<tenant>:<access>` 30/นาที ที่ชั้นบริการ (หน้าเว็บ+REST ใช้ร่วม) · สลิป `crm:portal:slip:…` 10/ชม. · สลิปเฉพาะใบ AWAITING_PAYMENT/PARTIAL · ชนิดไฟล์จากไบต์หัว (png/jpg/pdf) ต้องตรงกับที่ประกาศ | 15 เว็บ + 15 REST สลับกันผ่านครบ · ครั้งที่ 31 (เว็บ) RATE_LIMITED · 32 (REST) 429 · สร้าง 30 |
| S2 | `createRequest` · `cleanPayload` · `applyProfileChange` | รับแค่ ISSUE/DOCUMENT_REQUEST/CONTACT_CHANGE · คีย์สงวน (reason/lineUserId/recordId/fieldKey/value/origin/title/body) ถูกทิ้ง · ตอนอนุมัติตรวจซ้ำ object.portalVisible · field.portalVisible+portalEditable · !sensitive · แม่ = บริษัทของคำขอ | ปลอม PROFILE_CHANGE → VALIDATION · ปลอมผูก LINE → payload เหลือ {phone,title} อนุมัติแล้ว applied=false lineUserId=null · คำขอแก้จริง "เดิม"→"ใหม่" หลังอนุมัติ |
| S3 | `decideRequest` | มีสายอนุมัติ ⇒ อนุมัติตรง = FORBIDDEN (ชี้ไปกล่องคำขออนุมัติ) · ไม่อนุมัติ = ยกเลิกผ่านเครื่องยนต์อนุมัติก่อน (`cancelRequest` ต้องสำเร็จ) | approve → FORBIDDEN · reject → REJECTED · ApprovalRequest → CANCELLED |
| S4 | `crm/portal-identity.ts` (ใหม่) + `contacts.ts` (updateContactCore · mergeContacts บล็อก C3.5) · `account/index.ts` `respondQuotation({portal})` | ไม่มีคอลัมน์ JSON บน CrmPortalAccess ⇒ ทางถอยตามมติ: อีเมล/เบอร์/lineUserId เปลี่ยน หรือรวมผู้ติดต่อ ⇒ เพิกถอน session + ล้าง acceptedAt/คำเชิญ (ต้องเชิญใหม่) ใน tx เดียวกัน + audit `crm.portal.identity.reset` · audit ตอบใบเสนอราคามี accessId/contactId | session ตายทันที · OTP ไปอีเมลใหม่ → ปฏิเสธ · เชิญใหม่แล้วเข้าได้ |
| S5 | `app/b/[slug]/auth/line/route.ts` · `actions.ts#portalLineNonceAction` · `PortalLoginForm` | เพดาน → `portalShopBySlug` (404 ก่อนแตะ LINE) → content-type JSON (415) → same-origin (Origin host / Sec-Fetch-Site · 403) → nonce ใช้ครั้งเดียว (คุกกี้ httpOnly 10 นาทีที่ server action ตั้งตอนกด — หน้า RSC ตั้งคุกกี้ไม่ได้) → verify: aud บังคับ = channel · iss = https://access.line.me · token ที่มี claim nonce ส่งให้ LINE ตรวจ (LIFF ใส่ nonce เองไม่ได้ ⇒ nonce ข้อนี้ผูกคำขอกับเบราว์เซอร์) · หน้าเชิญไม่มีปุ่ม LINE แล้ว (claim ก่อน → `location.replace` ไปหน้าไม่มี token) | slug ไม่มี 404 · text/plain ข้ามเว็บ 415 · JSON ข้ามเว็บ 403 · ไม่มีคุกกี้ nonce 401 (ยังไม่ยิง LINE เลย) · aud ผิด 401 · iss ผิด 401 |
| S6 | `accessesOfContacts` · `listAccess` | ยังไม่รับคำเชิญ ⇒ OTP/LINE ได้เฉพาะ `inviteExpiresAt > now` · หมด = ข้อความเดียวกับไม่รู้จัก · สถานะพนักงาน EXPIRED "ต้องเชิญใหม่" | คำเชิญหมด → CUSTOMER_AUTH ข้อความเดียวกับอีเมลแปลกหน้า · staff status EXPIRED |
| S7 | `onApprovalDecided` | ต้องมี requestId + `approvalRequestId` ตรงเป๊ะ + ระบบยังเปิดพอร์ทัล (uiVersion 2 + enabled) | oracle S5.4 / X4.1 ผ่าน |
| S8 | `eraseContact` | ยกเลิกคำขออนุมัติที่ค้าง (เครื่องยนต์อนุมัติ) · การ์ดที่เปิดจากคำขอ → หัวข้อ "ลบตามคำขอ PDPA" คำอธิบายว่าง (sourceKey คงไว้) · คืน approvalsCancelled/cardsRedacted | oracle X8.3 ผ่าน |
| หมายเหตุ | ต่าง ๆ | LINE_IDENTITY อนุมัติ = ผูก lineUserId แบบมีด่าน (เฉพาะ payload `origin` ฝั่งเซิร์ฟเวอร์ · ผู้ติดต่อยังไม่มี LINE · ไม่ชนคนอื่น) · รับคำเชิญถังของตัวเอง `portal-invite:<tenant>:<ip>` · `switchCompany(…, {revokeCurrent:true})` (หน้าเว็บใช้) · `take` ทุก findMany ที่เป็นรายการ · รายชื่อบอร์ดในตั้งค่า = บอร์ดที่พนักงานมองเห็น (`kanban/links.visibleBoardOptions`) + เปิดการ์ดเฉพาะบอร์ด ACTIVE · ipHash เกลือคงที่ตัวเดียว `portalIpHash` (session + ผู้ลงนาม) · กุญแจ < 32 = พอร์ทัลไม่เปิด (WARN ops ไทย) · `requirePortal` ผูกร้าน+ระบบ CRM · `portalSweepSlot` ใช้ `thaiDayStartMs` | switch(revokeCurrent) ใบเดิมตาย |

- **ด่านสถิต mintPortalSession ไม่อยู่ในทะเบียน REST/AI**: `grep -rn "mintPortalSession" src/lib/modules/crm/api src/lib/ai src/lib/api src/lib/modules/member/api src/app/api` = 0 บรรทัด · ไฟล์ที่มีชื่อนี้: `crm/portal.ts` (re-export ให้ข้อสอบ) · `crm/portal-session.ts` (visual-crm) · `member/{customer-session,index,session-facade}.ts` เท่านั้น
- **ORACLE-CONFLICT (รายงาน ไม่แก้)**: มติ "switchCompany เพิกถอนใบเดิมในบริการ" ขัด C3.5-S1.5/S4.4 (`const rSw = await call(F.switchCompany, tA, coB.id, meta()); const tB = …` แล้วใช้ `tA` ต่อทั้งไฟล์ · S4.4 "the session on coA still gets NOT_FOUND for RB") — ถ้าเพิกถอนเป็นค่าเริ่มต้น `tA` ตายหลัง S1.5 ⇒ S2–S7/X แทบทุกข้อแดงแบบลูกโซ่ · ทำเป็นตัวเลือก `revokeCurrent` (หน้าเว็บส่ง true เสมอ) · ถ้าผู้คุมงานต้องการค่าเริ่มต้น = เพิกถอน ต้อง ORACLE-EDIT S1.5: หลังพิสูจน์การสลับ ให้ข้อสอบออก session อิสระของ coA/coB เอง (`F.mint(accW)` / `F.mint(accWB)`) แทนการถือ `tA` เดิม (S4.4/S6.1 ใช้ทั้ง tA และ tB พร้อมกัน)

### ผลรอบ 3 (QC2 · `.qc-shots/c35/r3-*` · `r3b-*` = หลังย้ายตัวเขียน lineUserId เข้า contacts.ts)
qc-crm-c3.5 67/67 (r3 + r3b) · qc-member-fix-s1 28/28 · qc-member-m2.9 21/22 (S5.2 = ภาพ) · qc-crm-c0.4 72/72 · qc-crm-c1.4 110/110 (r3 แดง S0.8
เพราะ portal.ts เขียน `CrmContact.lineUserId` → ย้ายเป็น `contacts.ts#bindPortalLineUserIdInTx` บล็อก C3.5 → r3b เขียว) · qc-crm-c1.8 81/81 ·
qc-approval 16/16 · -edit 12/12 · -wiring 7/7 · qc-kanban-k2.3 15/17 (S3.2 ตัวลาก timeline + S3.6 ภาพ — ไฟล์บอร์ดงานไม่ถูกแตะในใบนี้ = หนี้เดิม) ·
qc-nav-functions exit 0 · qc-crm-c0.2 27/27 · qc-crm-c0.5 50/50 · fitness 33/33 ทั้งสองโหมด · typecheck exit 0 · probes `r3-probes.log`/`r3b-probes.log`

## 11. รอบ 4 — ผลตรวจความปลอดภัยรอบสอง (มติผู้คุมงาน · ทำครบ) · หลักฐาน `.qc-shots/c35/r4-probes.log`
| ข้อ | ที่ | ทำอะไร | หลักฐาน |
|---|---|---|---|
| SF1 | `member/customer-session.ts#portalAccessUsable` + `crm/portal.ts#usableAccessWhere` (switchCompany · myCompanies · home) | สิทธิ์ใช้ได้ = รับคำเชิญแล้ว หรือคำเชิญยังไม่หมด — ทุกทาง (mint · อ่าน session · REST · สลับบริษัท · รายการบริษัท) | ล้างสิทธิ์ B → myCompanies [A,B]→[A] · สลับไป B = NOT_FOUND · session เดิมของ B = null · mint B ปฏิเสธ |
| SF2 | `loginWithLine` ทางไม่มีลิงก์เชิญ | หลัง mint ตั้ง acceptedAt + ล้าง hash (แบบ verifyOtp) | เข้าด้วย LINE ครั้งแรก = accepted · 8 วันต่อมา (คำเชิญหมด) ยังเข้าได้ |
| SF3 | `member/fields.ts` (ใหม่ `checkRecordValues` — ขั้นตรวจ 1–2 ของ `setRecordValues` แยกออกมาไม่เปลี่ยนตรรกะ) · `requestRecordChange` · `applyProfileChange` | ตรวจตอนสร้างคำขอด้วย engine (ชนิด/maxLength/pattern/ต้องกรอก/ค่าซ้ำ · เพดานตามฟิลด์ · FILE/LOOKUP ไม่รับ) · อนุมัติ = `setFieldValues(…, tx)` (ล็อก · ประวัติ · updatedById = ผู้ตัดสิน — สายอนุมัติใช้ผู้ตัดสินคนสุดท้าย) | 2000 ตัวอักษรบน maxLength 20 → VALIDATION · อนุมัติ → "คุณใหม่" updatedById=staff · ประวัติ 1 แถว เดิม→คุณใหม่ โดย staff |
| SF4 | `switchCompany` (ก่อน mint) · `respondQuotation` (เฉพาะครั้งที่จะเปลี่ยนสถานะจริง) | ถังเขียน 30/นาทีของสิทธิ์ | 30 ครั้งผ่าน · ครั้งที่ 31 RATE_LIMITED |
| SF5 | `decideRequest` · `createRequestInternal` | ชนิดที่ต้องผ่านสายแต่ยังไม่มีใบ → ยื่นใหม่ก่อน · ตัดสินตรงได้เฉพาะ `autoApproved` · ยื่นล้ม = ops WARN + CONFLICT (ไม่กลืนเงียบ — ตอนสร้างก็ WARN) | ไม่มีสาย → อนุมัติตรง APPROVED · เพิ่มสายทีหลัง → ยื่นใหม่ได้ใบ → อนุมัติตรง FORBIDDEN (ชี้กล่องคำขออนุมัติ) |
| ตารางสิทธิ์ | `portal-shared.ts` (`portalCanChangeData` + ป้าย) · บริการ (createRequest CONTACT_CHANGE · requestRecordChange · getRecord.editable) · หน้า requests/contacts | VIEW อ่าน+แจ้งเรื่อง/ขอเอกสาร · PAY +ชำระ/สลิป · APPROVE +ตอบใบเสนอราคา/ขอแก้ข้อมูล/ขอเปลี่ยนผู้ติดต่อ · ADMIN = APPROVE (จัดการผู้ติดต่ออื่น = งานพนักงาน) | ตาราง 4×8 ใน log ตรงตามมติทุกช่อง |
| หมายเหตุ | ต่าง ๆ | คุกกี้ nonce LINE → `__Host-shark_portal_ln` (กติกา APP_ENV) เก็บ `<exp>.<HMAC(nonce\|slug\|exp)>` ผูก slug หมดอายุฝั่งเซิร์ฟเวอร์ (`portal.lineNonceIssue/Verify`) · `mintPortalSession` ออกจาก namespace `crm.portal` (เหลือ `portal-session.ts` สำหรับสคริปต์ถ่ายภาพ) · F2.4 จับ import สัมพัทธ์ (`../member/…`) ด้วย — F2.1 จับเฉพาะรูป `@/…` (ทดสอบด้วยการใส่ import สัมพัทธ์ชั่วคราว → F2.4 แดง แล้วถอดออก) · `onApprovalDecided` เมื่อพอร์ทัลปิด = คง PENDING + ops WARN (id ล้วน) · `invite` ปฏิเสธถ้าระบบนี้ไม่ใช่ระบบพอร์ทัลของร้าน (VALIDATION ไทย) · สรุปของ op REST `requests.create` + ป้าย payload ในคู่มือแก้แล้ว + regen | |

- **ORACLE-CONFLICT (รายงาน ไม่แก้ข้อสอบ)**: มติ "ลบทางลิงก์เชิญของ `loginWithLine` (ตายแล้ว)" ขัด **C3.5-S1.4** — ข้อสอบเรียก
  `F.loginWithLine(slugA, { lineUserId, email: hank.email, inviteToken: tokH }, meta())` และ `F.loginWithLine(slugA, { lineUserId, email: "someone-else…", phone, inviteToken: tokK }, meta())`
  แล้วต้องการ `{ pendingApproval: true, requestId }` + คำขอ PENDING 1 ใบของ kim (ตัวตน LINE ไม่ตรงผู้ติดต่อใดเลย ⇒ ไม่มีลิงก์เชิญ = ไม่มีทางรู้ว่าเป็นผู้ติดต่อคนไหน)
  ⇒ ถ้าลบ ทางไม่มีลิงก์หา kim ไม่เจอ = โยน error · S1.4 แดง · **จึงคงทางนี้ไว้** แต่เข้าจากเว็บไม่ได้แล้ว (route `auth/line` ไม่ส่ง `inviteToken` ตั้งแต่รอบ 3 ·
  หน้าเชิญไม่มีปุ่ม LINE) · มีด่านถังรับคำเชิญต่อ IP + hash/หมดอายุ/ร้าน · ถ้าผู้คุมงานยืนยันลบ ต้อง ORACLE-EDIT S1.4 (เปลี่ยนเป็น: LINE ไม่ตรง ⇒ ปฏิเสธไทย ไม่มีคำขอ)

## 12. รอบ 5 — ผลตรวจรอบสาม (มติผู้คุมงาน · ทำครบ) · หลักฐาน `.qc-shots/c35/r5-probes.log`
- **nonce LINE ใช้ครั้งเดียวจริง**: ลบคุกกี้ด้วย `jar.set(name, "", {...customerCookieOptions(req.headers), maxAge: 0})` (route + `portalLogoutAction` — `delete` เปล่า ๆ บน `__Host-` ไม่มี Secure ถูกเบราว์เซอร์ปฏิเสธ) ·
  ด่านจริง = `portal.lineNonceConsume` → จองถัง `portal-line-nonce:<sha256(คุกกี้)>` เพดาน 1/10 นาที (`checkRateLimitDb`) · ยอมนาฬิกาคลาด 60 วินาที ·
  probe: ครั้งแรกถึง LINE 1 ครั้ง · ส่งคุกกี้+nonce เดิมซ้ำ → 401 ก่อนถึง LINE · nonce ของ slug หนึ่งใช้กับอีก slug ไม่ได้
- **คำขอค้าง PENDING** (`decideRequest`): มีใบอนุมัติ ⇒ อ่านสถานะก่อน — APPROVED/REJECTED = ปรับตามผลของสายผ่าน `onApprovalDecided` (CONFLICT บอกพนักงาน) ·
  CANCELLED/หาย = ปฏิเสธตรงได้ อนุมัติไม่ได้ ไม่ยื่นซ้ำ · PENDING = อนุมัติต้องไปกล่องคำขออนุมัติ / ปฏิเสธ = ยกเลิกผ่านเครื่องยนต์ก่อน ·
  ไม่มีใบ ⇒ ยื่นใหม่เฉพาะตอน "อนุมัติ" ในนาม `crm-portal:<contactId>` (ไม่ใช่พนักงาน) · probe: ใบถูกยกเลิก → อนุมัติ FORBIDDEN · ปฏิเสธ REJECTED · ใบอนุมัติ 1 ใบ (ไม่ยื่นซ้ำ) ·
  ใบ APPROVED แต่คำขอค้าง → พนักงานกดปฏิเสธ = CONFLICT + คำขอกลายเป็น APPROVED
- **พอร์ทัลปิดตอนผลอนุมัติมาถึง**: `onApprovalDecided` คง PENDING + ops WARN แล้ว **โยน `PortalRetryableError`** ⇒ ขั้นแรกของ consumer `approval.request.*` ล้ม ⇒
  ตัวระบายคิวส่งใหม่ตามนโยบายเดิม (attempts++ · หน่วง 2^n นาที · ครบ 5 = FAILED ให้คนดู · แจ้งเตือน/automation ของ event นั้นรอไปด้วย — ถูกต้องตามกติกา `crmFirst`) ·
  ถ้าคิวหมดรอบแล้ว พนักงานกดตัดสินที่หน้าบริษัท = ปรับตามสถานะใบอนุมัติ (ข้อบน)
- **ค่าซ้ำ**: `fields.checkRecordValues(…, { skipUnique: true })` ใช้เฉพาะ `requestRecordChange` (ทาง `setRecordValues` เดิมไม่เปลี่ยน) ⇒ ลูกค้าถามไม่ได้ว่าค่าไหนมีคนใช้ ·
  ตอนอนุมัติ `setFieldValues` ยังตรวจค่าซ้ำ และทางพนักงานตัดสินเอง (strict) แจ้งเป็น VALIDATION ไทย + ไม่อนุมัติ (ไม่ใช่ 500) · probe: ค่าที่มีคนใช้กับค่าว่าง ได้คำตอบรูปเดียวกัน ·
  อนุมัติตัวที่ซ้ำ → VALIDATION "มีรายการอื่นใช้ค่า …" · คำขอคง PENDING · ไม่มีค่าถูกเขียน
- หมายเหตุ: `mintPortalSession` ออกจาก `member/index.ts` (เหลือ `session-facade.ts` + `crm/portal-session.ts`) · ถังสลับบริษัท `crm:portal:switch:<tenant>:<contactId>` (ต่อผู้ติดต่อ) ·
  สลับเข้าสิทธิ์ที่ยังไม่รับคำเชิญ (คำเชิญยังไม่หมด) = รับคำเชิญ · `recordFields` มี `take` · รายการบริษัทของหน้าแรกกรองบริษัทที่ถูกเก็บ/ถูกรวมแบบ `myCompanies`
