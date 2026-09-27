# WO C3.9 — PDPA (ลบ/ส่งออก) · อายุเก็บ + งานล้าง · ลิงก์ลงนาม · เพดานอัตราสาธารณะ · เพดานทุกตัว + เตือน 80 % · ข้อสอบเจาะ (DRAFT ของ builder)

> RUN "CRM v2" · worktree `/root/projects/shark-crm-c23` (detached HEAD `82653840` = C3.0–C3.2 · C3.5 · C3.6 · C3.7) · QC3 (`ep-weathered-river`) · 26 ก.ย. 2569 · builder: Opus
> สัญญา: `ledger/CRM-RUN.md` §2 C3.9 · `crm-brief-C3.6-C3.9.md` C3.9 + addendum (ยืนยันทั้งหมดโดยมติผู้คุมงาน C3.8+C3.9) · COMMON · RESOLUTIONS (R-E.10 · R-E.14 · R-C.8)
> ข้อสอบ: `scripts/qc-crm-c3.9.mts` (36 ข้อ · ไม่ได้แตะ) · ก่อนสร้าง (`--force-run`) 15/36 (`.qc-shots/c39/baseline.log`) → **36/36** (`run-1.log` · `run-2.log`)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/crm/privacy.ts` | ใหม่ | `eraseContact` · `onMemberErased` · `exportContact` · `exportTenant` · `runExportJobs` · `getExport` · `listMyExports` · `purgeExports` · `retentionLeads` · `purge` · `retentionSettings` |
| `src/lib/modules/crm/privacy-shared.ts` | ใหม่ | `CRM_ERASED_NAME` ("ลบตามคำขอ PDPA") · `CRM_EXPORT_KIND` · `PrivacyError` · DTO |
| `src/lib/modules/crm/privacy-actions.ts` | ใหม่ ("use server") | erase/export ของคน · ส่งออกทั้งระบบ · บันทึกอายุเก็บ (assertCanCrm + assertCrmV2) |
| `src/lib/modules/crm/limits.ts` · `limits-shared.ts` | ใหม่ | `CRM_LIMITS` 19 คีย์ · `CRM_LIMIT_WARN_RATIO` · `crmLimits/crmUsage/assertCrmLimit/noteCrmUsage/perParentCap/limitStatus/sweepWarnings` · `CRM_PARAM_CAPS` · `CRM_HARD_CAPS` · `CrmLimitError` (LIMIT) |
| `src/lib/modules/crm/index.ts` | แก้ (บล็อก C3.9) | `export * as privacy` · `export * as limits` |
| `src/lib/outbox-consumers.ts` · `src/lib/webhooks/labels.ts` | แก้ (บล็อก C3.9) | `member.erased` → `crm.privacy.onMemberErased` ผ่าน facade (ล้ม = event ล้ม = retry · ไม่ใช่สะพาน ⇒ ไม่มีประตู uiVersion โดยเจตนา) · `crm.contact.erased` · ป้าย 2 ตัว |
| `src/lib/modules/member/privacy.ts` · `member/index.ts` | แก้ (บล็อก C3.9) | `eraseMember` ยิง `member.erased` {customerId, partyId} (คู่กับ member.updated เดิม) · `eraseMemberById` บน facade |
| `src/lib/modules/member/customer-session.ts` | แก้ (บล็อก C3.9) | ถัง `portal-invite:<tenant>:<sha256(ip)>` (ไม่มี IP ดิบ) |
| `src/lib/platform/minute-jobs.ts` | แก้ (บล็อก C3.9) | `crm.purge.exports` · `crm.retention.leads` (1440 · daily) · ส่งออกทั้งระบบขี่ `crm.reports.exports` |
| `src/lib/modules/crm/settings.ts` | แก้ (บล็อก C3.9) | `crmRetentionOf` · `setCrmRetentionKeys` (jsonb ซ้อน 2 ชั้นคำสั่งเดียว) |
| create paths | แก้ (บล็อก C3.9) | `assertCrmLimit(ctx,key,1,tx)` ใน tx ของ insert: pipelines (create/restore) · contacts (`insertContactInTx` ตัวเขียนเดียว) · companies (createCore/createInTx) · sequences · trackedLinks · scoreRules · assignmentRules · openDeals · activeEnrollments · emailsPerDay · emailTemplates · ต่อแม่ (ขั้น/บรรทัด/ขั้นลำดับ/ฟิลด์) · objectsWarn (เตือนอย่างเดียว) · automation (`crmRunLimit` อ่านจาก limits) |
| เพดานตายตัว | แก้ | `CRM_EMAIL_BULK_MAX` · `CRM_VIEW_PER_USER_MAX` · quotas `LIST_MAX` · portal `PORTAL_WRITE_LIMIT` · `SEQ_BULK_MAX` · `ASSIGN_MAX_OPEN_MAX` · `DEAL_BULK_MAX` · `CONTACT_BULK_MAX` · `CONTACT_IMPORT_MAX_ROWS` = `CRM_HARD_CAPS.*` (ค่าเดิมทุกตัว) |
| `src/lib/modules/crm/contacts.ts` | แก้ (บล็อก C3.9) | `anonymizeContactInTx` — คอลัมน์ที่มีกฎของ CrmContact เขียนได้แต่ในบริการผู้ติดต่อ (C1.4-S0.8) |
| `src/lib/modules/crm/emails.ts` · `calls.ts` | แก้ (บล็อก C3.9) | `purgeBodies` / `purgeRecordings` จองแถวก่อนลบไฟล์ (X5 — เดิมซ้อนกันนับ 2 และลบไฟล์ 2 ครั้ง) |
| `src/lib/modules/crm/api/http-errors.ts` · `*-actions.ts` 6 ไฟล์ | แก้ | LIMIT → 409 state_conflict · action คืนข้อความไทยของเพดาน |
| `src/app/(store)/f/[token]/actions-shared.ts` · `actions.ts` · `PublicForm.tsx` | ใหม่/แก้ | ย้าย `type PublicFormActionResult` ออกจากไฟล์ "use server" (X8.2) |
| `src/app/app/sys/[id]/crm/contacts/_components/ContactPrivacyBlock.tsx` + หน้า 360 | ใหม่/แก้ | ปุ่มส่งออก/ลบ (danger confirm) ตามคีย์ |
| `src/app/app/sys/[id]/crm/settings/_components/PrivacySettings.tsx` + หน้า settings | ใหม่/แก้ | อายุเก็บ · ส่งออกทั้งระบบ · แถบเพดาน 19 แถว |
| `scripts/crm-ui-inventory.json` | แก้ | +13 แถว `wo: "C3.9"` |
| `docs/api/CRM-API.md` · `docs/api/MEMBER-API.md` | regen | generator (event ใหม่ 2 ตัว) |

## 2. ตัดสินใจของ builder (ให้ผู้คุมงานยืนยัน)
1. **ลบแบบ RETENTION ไม่ลบเนื้ออีเมล/ไฟล์เสียง** (ปิดคำที่ระบุตัวในเนื้อ/หัวข้อแทน) — ทั้งสองมีนาฬิกาอายุเก็บของตัวเอง; ข้อสอบ S3.1 บังคับ (lead ที่ถูกลบตามอายุต้องคงเนื้ออีเมลใหม่ `nm.bodyText`) และกันงานสองตัวแย่งลบไฟล์เดียวกันตอนรอบซ้อน (S3.2) · REQUEST/MEMBER ลบเนื้อ+ไฟล์ครบ
2. **ลบ lead ตามอายุเฉพาะระบบ uiVersion 2** (R-E.14) — ลบย้อนไม่ได้ ห้ามแตะร้านที่ยังไม่เปิด v2 · ไฟล์ส่งออก/อีเมล/เว็บครอบทุกระบบเหมือนเดิม · ⚠️ รอบแรกบน prod ของร้าน v2 จะลบ lead ที่เกินอายุทันทีโดยไม่มีคำเตือนก่อน (ข้อสอบ S3.1 ต้องการลบในรอบเดียวกับที่เตือน) → เสนอ C6 เตือนล่วงหน้าก่อนเปิดงาน
3. ธง "เตือนแล้ว" ผูกร้าน (ไม่ใช้ `OpsAlertState` ที่ไม่มี tenantId): เพดาน = แถว OpsEvent `crm.limits` ที่มี `detail.flag` ใต้ advisory lock · lead = AuditLog `crm.retention.warned` (after.anchor) ใต้ advisory lock ต่อระบบ · ธงเพดานมี **ค่าเพดาน** อยู่ในกุญแจ (ขยายเพดานแล้วใกล้อีก = เตือนใหม่ — S6.3 ทำให้ pipelines ข้าม 80 % ก่อน S6.4 ในเดือนเดียวกัน)
4. `settings.crm.retention.*` ซ้อนใต้ `retention` ⇒ ใช้ตัวเขียนใหม่ `setCrmRetentionKeys` (แบบ `setCrmRecordingDays`) แทน `setCrmSettingsKey` ที่เขียนได้แต่คีย์ชั้นบน
5. `member.erased` consumer = ขั้นแรกที่ retry ได้ (ไม่ใช่ของแถมใต้ compose) — การลบตามกฎหมายที่ล้มแล้วกลายเป็น WARN = ข้อมูลค้างเงียบ
6. ไฟล์ส่งออกเก็บเป็น `text/plain` (ALLOWED_TYPES ของ C0.4 ไม่มี csv/json — ไม่แตะที่เก็บกลาง) ⇒ ดาวน์โหลดได้นามสกุล .txt
7. Party: ไม่มีผู้ถืออื่น (ไม่นับสมาชิกที่ผูกคู่/ปิดแล้ว · ผู้ติดต่อที่ลบแล้ว) = ล้างตัวตน · มี = ตัดการผูก `partyId = null`
8. ค่า sensitive ในไฟล์ส่งออก: OWNER เท่านั้น (MANAGER/STAFF/คีย์ = ตัดทิ้ง)

## 3. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| `qc-crm-c2.6-web` ไม่ได้รัน | ต้อง production build + serve (ห้าม next build ในใบนี้) | ผู้คุมงาน |
| ภาพหน้าจอ D7 | ผู้คุมงานถ่าย (ตามคำสั่ง) | ผู้คุมงาน |
| webhookEndpoints / webEventsPerMonth เตือนอย่างเดียว | ปลายทางฮุคเป็นบริการกลาง (ไม่ใช่ CRM) · นับ web event ต่อคำขอหนักเกินงบ 50 ms ⇒ งานรายวันเตือนที่ 80 % | C5/C6 |
| นำเข้าผู้ติดต่อ: ด่านเพดานต่อแถว (ล็อก+นับ) | ทางเขียนเดียวต้องปลอดภัยก่อน · อาจช้าเมื่อนำเข้าหมื่นแถว | C5.1 (วัดผล) |
| ถัง OTP ของสมาชิก `customer-otp:ip:<ip>` ยังเก็บ IP ดิบ | เลนสมาชิก (มติผู้คุมงาน) | เลนสมาชิก |
| RETENTION รอบแรกไม่มีคำเตือนก่อน | ดูข้อ 2.2 | C6.1 |
| คอลัมน์ `refType`/`refId` บน `AppNotification` (กรองแจ้งเตือนที่ต้องปิดชื่อตามผู้ติดต่อ/ดีล/กิจกรรมแทนการค้นข้อความ) | ต้องมี migration — มติผู้คุมงานรอบ 2: ตอนนี้กรองด้วยคำระบุตัวแบบเต็มเท่านั้น | ใบ migration ถัดไป |
| ตัวเก็บตกรายวันของ `followUp` ที่ FAILED (event `crm.contact.erased` ล้มครบ 5 รอบ ⇒ อ่านแถว audit ที่ followUp ยังค้างแล้วทำซ้ำ) | รีวิวรอบ 2 N2 | C6 |
| ดัชนี `AuditLog(tenantId, action, targetId)` สำหรับธง "ลบแล้ว"/"เตือนแล้ว" (วันนี้ใช้ดัชนี `action` เดิม) | ต้องมี migration — รีวิวรอบ 2 N6 | ใบ migration ถัดไป |
| รอบแรกของงานอายุเก็บ lead บน prod (leadMonths ค่าเริ่มต้น 24) ลบ lead ที่เกินอายุทันที | เจ้าของร้านต้องตัดสินก่อนเปิด v2 — รีวิวรอบ 2 N7 | C6.1 |
| `crm.contact.erased` พกเฉพาะ `contactId` ของผู้ติดต่อหลัก — คนในสายที่ถูกรวมเข้ามาไม่มี event ของตัวเอง (อยู่ใน `after.mergedIds` ของแถว audit) | ข้อสอบ C3.9-S1.4 ตรึงชุดคีย์ payload — รีวิวรอบ 2 N8 | บันทึกไว้ (ผู้รับเว็บฮุคลบตามด้วย contactId หลัก) |

## 4. ผลรัน (QC3 · log ใน `.qc-shots/c39/`)
- `qc-crm-c3.9` 36/36 ×3 (`run-1.log` · `r2-qc-crm-c3.9.log` · `run-final.log`)
- regressions: member-fix-s1 28/28 · member-m1.4 37/37 · c2.5 105/105 · c2.4 91/91 · c2.6 87/87 · c2.2 73/73 · c3.1 56/56 · c3.2 47/47 · c3.5 67/67 · c1.4 110/110 (รอบ 2) · c0.4 72/72 · c0.5 50/50 · c0.2 27/27 (รอบ 2) · qc-form 10/10 · qc-nav-functions ผ่าน 11 · c1.11 66/66 (รอบ 2 · ต้องรันด้วย `CRM_V2_SWITCH=all` — .env.qc/.env.qc3 ไม่มีค่านี้ ⇒ รันเปล่าแดง S6.x/S7.1 ไม่เกี่ยวใบนี้)
- typecheck สะอาด · fitness 33/33 ทั้งมี env และ `env -u DATABASE_URL`
- หลักฐาน `probe-c39-evidence.mts` → `r3-probe.log`: สแกน PII ทั้งร้าน ก่อน 12 จุด → หลัง 0 (control คนที่ 2 ยัง 12) · ดีล 2/฿10,000 · รับชำระ 2/฿5,000 เท่าเดิม · ลบพร้อมกัน 10 ทาง = erased:true 1 · audit 1 · event 1 (payload contactId/systemId/partyId) · purge ซ้อน 2 รอบ Σ = 3 (3 ฉบับ · รอบสอง 0) · pipelines เพดาน 6: เตือนที่ 5/6 (OWNER 2 คน ได้คนละ 1 · OpsEvent 1) · 6/6 ไม่เตือนซ้ำ · 7/6 = LIMIT
- ข้อมูลชั่วคราว: ไม่มี (tenant ของ probe/ข้อสอบถูกลบ · แถวธง OpsAlertState 10 แถวจากรอบแรกของ build ลบแล้วด้วย `cleanup-flags.mts`)

## § รอบ 2 — แก้ตามผลรีวิวอิสระ (NOT MERGEABLE · 3 BLOCKER · 5 SHOULD-FIX · NOTES) · 27 ก.ย. 2569

### BLOCKER
| # | แก้อะไร | ที่ไหน |
|---|---|---|
| B1(ก) | `CrmFileLink` ของผู้ติดต่อ (CONTACT) + เรคคอร์ดของเขา (RECORD) + กิจกรรมของเขา (ACTIVITY) ถูกลบใน tx · วัตถุไฟล์ลบหลัง commit · ชื่อไฟล์อยู่ในชุดส่งออก (`CrmFileLink`) | `privacy.ts:389` (ลบ) · `privacy.ts:580` (ส่งออก) · `privacy-shared.ts` ป้ายตาราง |
| B1(ข) | ไฟล์ของฟิลด์ชนิดไฟล์ (`valueFileId`) ถูกเก็บลบ **ทุกชนิดการลบ** (รวม RETENTION) + ค่า sensitive ที่อ้าง Party ด้วย | `privacy.ts:372` |
| B2 | ลบทั้งสายผู้ติดต่อที่ถูกรวมเข้ามา (`mergedIntoId` ซ้อน ≤ 20 ชั้น · ล็อกเรียง id) ใน tx เดียว · คำระบุตัวของทุกคนในสายเข้าชุดปิดข้อความ · แถว audit `crm.contact.erase` ต่อคนในสาย (ธง) | `privacy.ts:246` `mergedChain` · `:273` · ทุกคิวรีใช้ `ids` |
| B3 | งานหลัง commit ทั้งหมด (วัตถุไฟล์ · ยกเลิกคำขออนุมัติพอร์ทัล · ลบสมาชิก) = `completeErasure` อ่านงานจาก `after.followUp` ของแถว audit (id ล้วน) — ตัวรับ `crm.contact.erased` เป็น `crmFirst` (ล้ม = event ล้ม = ส่งใหม่) · ล้ม = OpsEvent WARN (id ล้วน) · แถวพอร์ทัลลบใน tx (`portal.eraseContactInTx`) · ทางซ่อมในโพรเซสของผู้แพ้ถูกถอด · `eraseMember` ล็อกแถวลูกค้า + อ่านสถานะใหม่ใต้ล็อก (สองทางพร้อมกันไม่ชนกุญแจ outbox) · action ตอบ ok + "ลบแล้ว · กำลังล้างข้อมูลที่เชื่อมโยง" เมื่อ followUp PENDING | `privacy.ts:217` `:466` `:497` · `outbox-consumers.ts:1202` · `portal.ts:1384` · `member/privacy.ts:1304` · `privacy-actions.ts` · `ContactPrivacyBlock.tsx` |

🔴 **ข้อสอบที่ตรึงผลแบบทันที (ไม่ได้แก้ข้อสอบ — ขอมติ)**: `C3.9-S1.2` (ไฟล์ FileAsset = 0 และ `deps.del` ถูกเรียกด้วย path ทั้งสอง **ก่อน** eraseContact คืนค่า — ข้อสอบไม่ drain outbox) · `C3.9-S1.6` (สมาชิกถูกลบ + `member.erased` 1 ทันทีหลัง eraseContact) ⇒ ยังเรียก `completeErasure` **หนึ่งครั้งแบบ best-effort** ในคำขอของผู้ชนะ (ล้ม = PENDING ไม่ใช่ error) · ทางที่รับประกันคือตัวรับ event · `C3.9-S1.4` ตรึงชุดคีย์ payload (`contactId/systemId/partyId/customerId`) ⇒ `fileIds` อยู่ในแถว audit (`after.followUp`) ไม่ใช่ใน payload

### SHOULD-FIX
| # | แก้อะไร | ที่ไหน |
|---|---|---|
| S1 | คำระบุตัว = ชื่อเต็ม (`name` + `joinName(first,last)`) · เบอร์ · อีเมล · LINE id · อีเมลเก่า (+ เบอร์/อีเมลของ Party) — เลิกใช้ชื่อ/นามสกุลแยกท่อน · AiProposal: ชนิด `crm%` ที่เอ่ยคำระบุตัว หรือทุกชนิดที่พก id ของคนนี้ · 🔴 AppNotification **ไม่มีคอลัมน์ refType/refId** (ต้อง migration) ⇒ ขอบเขต = ข้อความที่มีคำระบุตัวแบบเต็มเท่านั้น (และ `C3.9-S1.3` บังคับให้แจ้งเตือนที่ไม่มีการอ้างอิงแต่เอ่ยชื่อ+เบอร์ถูกล้าง) | `privacy.ts:158` `:355` `:360` |
| S2 | ธง "ลบแล้ว" = แถว AuditLog `crm.contact.erase` อ่านใต้ FOR UPDATE เดียวกัน (ชื่อเป็นป้ายแสดงผล) · ชื่อสงวนถูกปฏิเสธในตัวเขียนผู้ติดต่อทุกทาง (สร้าง/นำเข้า/ฟอร์ม/แชท/อีเมล = `insertContactInTx` · แก้ไข · รวม) · กู้คืนผู้ติดต่อที่ถูกลบไม่ได้ · งานอายุเก็บ/ตัวรับ member.erased/party ไม่อ่านชื่ออีก | `privacy.ts:143` · `contacts.ts:699 · 953 · 1864 · 2705` · `contacts-shared.ts:296` · `contacts.ts` mutate (restore) |
| S3 | purgeRecordings ลบไฟล์ไม่สำเร็จ = คืนเฉพาะตัวชี้ไฟล์ (ไม่คืนข้อความถอดเสียง) และคืนเฉพาะเมื่อผู้ติดต่อยังไม่ถูกลบ · ถูกลบแล้ว = OpsEvent WARN (id ล้วน) | `calls.ts:811` |
| S4 | (ก) ลดอายุเก็บ lead / เปิดจาก 0 = ติ๊กยืนยัน + พิมพ์ "ลดอายุเก็บ" (action ตอบ CONFIRM_REQUIRED ถ้าไม่ครบ · audit before/after) (ข) คิวรีเตือนตัดคนที่เตือนแล้ว (วันที่ไม่เคลื่อนไหวเดียวกัน) + วนจนเงียบ (deadline/signal) (ค) ลบล้ม = OpsEvent WARN (id ล้วน) + ข้าม id นั้นทั้งรอบ | `privacy-actions.ts` `saveRetentionAction` · `PrivacySettings.tsx` · `privacy.ts:945` `:1000` |
| S5 | `applyBusinessTemplate` สร้าง pipeline ผ่าน `assertCrmLimit` ใน tx เดียวกัน | `templates.ts:138` |

### NOTES
- ตัวนับผู้ถือ Party ตัวเดียว `party.countPartyHolders` (17 ตาราง: บัญชี · นัด · แชท · CRM ผู้ติดต่อ/บริษัท · ที่พัก · สมาชิก · คิว · เช่า · เรียน · คลินิก ×2 · บัตรงาน · ร้านค้าออนไลน์ · HR · ผู้ขาย · การ์ด PARTY) ใช้ทั้ง `eraseMember` และ `eraseContact` — `party/index.ts:262` · `member/privacy.ts:1291`
- จดหมาย QUEUED ของคนที่ถูกลบ → FAILED + ล้างเนื้อ/ไฟล์แนบใน tx เดียวกัน — `privacy.ts:306`
- `onMemberErased` วนจนเงียบ (ตัดคนที่ลบแล้วด้วยแถว audit · ข้ามคนที่ล้ม) · ล้าม = throw (ส่งใหม่) — `privacy.ts:508`
- `purge()` ส่ง `systemIds` ต่อให้ `purgeRecordings` (เพิ่มตัวเลือก) — `calls.ts:783`
- `runExportJobs` ปิดงานได้เฉพาะเมื่อ lease ยังเป็นของรอบนี้ — `privacy.ts:802`
- เพดาน: ผู้ติดต่อ/บริษัทที่เก็บถาวรหรือถูกรวม และดีลเปิดที่เก็บถาวร **ไม่กินเพดาน** (ไม่มีข้อสอบตรึงความหมายเดิม — C3.9 36/36) — `limits.ts:126` · กู้คืนผู้ติดต่อ/บริษัท · เปิดดีลกลับ (`deals.ts:845`) · `sequences.resume` (`sequences.ts:787`) ผ่านด่าน
- หน้า /crm/settings ไม่นับ web event/เดือน (หลักล้านแถว) ทุกครั้งที่เปิด — แสดง "ประเมินรายวัน" + ป้ายใกล้เต็มจากคำเตือนของงานรายวัน — `limits.ts:290` · `limits-shared.ts` `CRM_LIMIT_DAILY_ONLY`
- ถัง portal-invite ใช้ HMAC `portalIpHash` (กุญแจ `portal-ip:v1:<SESSION_SECRET>`) — `customer-session.ts:795`
- คู่มือ MEMBER-API: คำอธิบาย `member.erased` — `scripts/gen-member-api-docs.mts` + regen docs
- `scripts/crm-expected.json` / `member-expected.json` คืนจาก git (สำเนาของ QC3 เก็บไว้ที่ `.qc-shots/c39/qc3-*-expected.json`)

### หลักฐาน (`.qc-shots/c39/`)
- `probe-c39-r2.mts` → `r2-probe-b123.log`: B1 ก่อน = ลิงก์ 2 · FileAsset 3 (ขอบเขตรอบ 1 ไม่แตะ) → หลัง = 0 · 0 · ลบวัตถุครบ 3 path · ชุดส่งออกมีชื่อไฟล์ 2 · B2 ก่อน = PII ของคนที่ถูกรวม 2 ชั้นอยู่ใน Party/CrmContact/AppNotification (เงื่อนไขรอบ 1 แตะแค่ 1 แถว) → หลัง = 0 ทุกคน · audit 3 แถว · B3 ที่เก็บล่มระหว่างลบ ⇒ eraseContact ตอบ erased:true + followUp PENDING (ไม่ใช่ error) · commit แล้ว · งานค้างบันทึกใน audit · OpsEvent WARN id ล้วน · ผู้แพ้ไม่ทำอะไร · ตัวรับ `crm.contact.erased` (ที่เก็บจริงของ QC3) ok · ทำซ้ำ 2 + พร้อมกัน 2 ok · ไฟล์ 0 · ลบ path ครั้งเดียว · สมาชิก CLOSED · member.erased 1 · audit 1 · event 1 · S2 ชื่อสงวน ⇒ VALIDATION
- ผลรันรอบ 2 (QC3 · `r2b-progress.log` · log ต่อชุด `r2b-<ชุด>.log`): `qc-crm-c3.9` 36/36 ×2 · member-fix-s1 28/28 · member-m1.4 37/37 · c2.5 105/105 · c2.4 91/91 · c2.6 87/87 · c2.2 73/73 · c3.1 56/56 · c3.2 47/47 · c3.5 67/67 · c1.4 110/110 · c0.4 72/72 · c0.5 50/50 · c0.2 27/27 · qc-form 10/10 · qc-nav-functions ผ่าน · c1.11 66/66 (`CRM_V2_SWITCH=all`) · typecheck สะอาด (`r2-typecheck-1.log` — หลังการแก้โค้ดชุดสุดท้าย)
- fitness 33/33 ทั้ง `pnpm fitness` และ `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` (`r2-fitness-env.log` · `r2-fitness-noenv.log`) · expected json ทั้งสองไฟล์คืนจาก git แล้ว

### มติผู้คุมงานรอบ 2
- (1) ยอมรับ: เรียก `completeErasure` ทันทีแบบ best-effort ในคำขอของผู้ชนะ · ตัวรับ `crm.contact.erased` เป็นทางรับประกัน · ไม่มี ORACLE-EDIT
- (2) ยอมรับ: AppNotification กรองด้วยคำระบุตัวแบบเต็มเท่านั้น · refType/refId ลงตารางหนี้ (§3)

## § รอบ 3 — MERGEABLE AFTER SHOULD-FIX (รีวิวอิสระรอบ 2) · 27 ก.ย. 2569
| # | แก้อะไร | ที่ไหน |
|---|---|---|
| SF1 | `CrmLimitError` จาก `insertContactInTx` ถูกแปลงเป็น `ContactsError` code `LIMIT` ใน `mapError` ของบริการผู้ติดต่อ ⇒ สะพานฟอร์ม (crmFirst) เห็นเป็นข้อผิดพลาดถาวร: WARN (id ล้วน) แล้วจบ (ไม่ส่งซ้ำ 5 รอบจน FAILED · ขั้น `rest` ยังวิ่ง) · ไล่ทางสร้างอื่น: แชท (ของแถมใต้ compose = WARN ไม่ retry) · อีเมลขาเข้า (`.catch(() => null)`) · ข้อเสนอ AI (`createContactFromLegacy` → createCore → mapError ⇒ ข้อความไทยของเพดาน) · พอร์ทัล (ไม่สร้างผู้ติดต่อ) · บริษัทจากช่องฟอร์ม (try/catch WARN อยู่แล้ว) | `contacts.ts:300` · `contacts-shared.ts:134` (`LIMIT`) · `crm-bridges/forms.ts:129` |
| SF2 | ชื่อแทนของระบบ (`CONTACT_NAME_PLACEHOLDER` "ไม่ระบุชื่อ" — ตัวเดียวที่ `contacts.ts` ใช้ 5 จุด — + คำเรียกทั่วไป) ไม่ถูกใช้เป็นคำระบุตัว · ชื่อที่ทุกคำเป็นคำแทนชื่อ = ไม่ใช่ชื่อจริง | `contacts-shared.ts:298` · `privacy.ts:162` |
| N1 | ลำดับห่อ `crmFirst(first, withAutomation(…))` ทั้ง `member.erased` และ `crm.contact.erased` | `outbox-consumers.ts:1198` |
| N3 | สายที่ถูกรวมเกินเพดาน (20 ชั้น / 1,000 แถว) = WARN (id ล้วน) ไม่ตัดเงียบ | `privacy.ts:254` `:289` |
| N4 | คืนตัวชี้ไฟล์เสียงในคำสั่งเดียว `UPDATE … WHERE … AND NOT EXISTS (erase audit)` · คืนไม่ได้ = WARN | `calls.ts:817` |
| N5 | สมาชิกถูกลบคู่กันเฉพาะ source REQUEST — RETENTION/MEMBER ส่ง `memberCustomerIds = []` (ตัวนับ Party ก็ไม่ยกเว้นสมาชิกให้ RETENTION) | `privacy.ts:301` |
| N2 · N6 · N7 · N8 | ลงตารางหนี้ §3 (ไม่มีโค้ด) | §3 |
- ผลรันรอบ 3 (QC3 · `r3-progress.log` · `r3-<ชุด>.log`): `qc-crm-c3.9` 36/36 ×2 · qc-form 10/10 · c1.4 110/110 · c2.4 91/91 · c1.11 66/66 (`CRM_V2_SWITCH=all`) · typecheck สะอาด (`r3-typecheck.log`) · fitness 33/33 ทั้งมี env และ `env -u DATABASE_URL -u DIRECT_URL` · expected json ไม่ถูกแก้

## § รอบ 4 — regression ของตัวรันต้นไม้หลัก: `qc-crm-c1.3` S0.3 (ห้ามอ่าน CrmCompany นอก companies*.ts / where.ts)
| แก้อะไร | ที่ไหน |
|---|---|
| ตัวอ่านบริษัทของ PDPA/เพดานย้ายเข้าบริการบริษัท: `countForLimit(db, ctx)` (รับ tx ของผู้เรียก — limits.ts นับใต้ advisory lock เดิมใน tx เดียวกับ insert) · `listForExport(ctx, actor, take)` (companyWhere ของผู้ขอ) | `companies.ts:2283` `:2287` |
| `limits.ts` นับบริษัทผ่าน `companies.countForLimit(db, sys)` | `limits.ts:131` |
| `privacy.ts` ไฟล์ส่งออกทั้งระบบอ่านบริษัทผ่าน `companiesSvc.listForExport` (เลิก import `companyWhere`) | `privacy.ts:710` |
| กวาดไฟล์ใหม่ของใบนี้หาคิวรีตรงอื่นที่ข้อสอบพี่น้องตรึง: ไม่มี `crmCompany.*` นอก companies*.ts · การเขียนคอลัมน์ที่มีกฎของ CrmContact อยู่ใน `contacts.ts#anonymizeContactInTx` (C1.4-S0.8) · ไม่มีการเขียน CrmDeal ใน privacy/limits (C1.5-S0.8) · ไม่มีการเขียน CrmCompany นอก companies*.ts (C1.6-S0.6) | — |

ผล (QC3 · `r4-progress.log` · `r4-<ชุด>.log`): qc-crm-c1.3 89/89 (×2) · c1.2a 91/91 · c1.4 110/110 · c1.5 103/103 · c1.6 79/79 · qc-crm-c3.9 36/36 (×2) · typecheck สะอาด (`r4-typecheck-2.log` — รอบแรกแดงที่ชนิด ctx ของ `listForExport` แก้แล้ว · ชุดข้อสอบรันด้วย tsx ไม่กระทบ) · fitness 33/33 ทั้งมี env และ `env -u DATABASE_URL -u DIRECT_URL`
- `scripts/crm-expected.json` · `member-expected.json` · `acc-v2-expected.json` ถูกเขียนใหม่โดย seed ของ QC3 (generatedAt 2026-09-27T03:24Z · ไม่ใช่ชุดของใบนี้) — คืนจาก git แล้ว · สำเนาอยู่ที่ `.qc-shots/c39/qc3-*-expected-r4.json`

## ผู้คุมงาน (Fable 5.1 · 27 ก.ย. 2569) — รับงาน
| # | ผล | หลักฐาน |
|---|---|---|
| D1 | ✅ | ข้อสอบ 36 ข้อเขียนก่อน (c23 · `82653840`) · ruling addendum ครบ · ไม่มี ORACLE-EDIT |
| D2 | ✅ | `qc-crm-c3.9` **36/36 ×2** QC1 seed ใหม่ (`c39-verify.log`) + 36/36 ในยูนิต c34 หลังรอบ 4 · 36/36 ×2 ทุกรอบบน QC3 |
| D3 | ✅ | ไม่มี ORACLE-EDIT · มติผู้คุมงาน 6+2 ข้อจดใน RUN §4 (completeErasure best-effort + consumer รับประกัน · AppNotification ไม่มี ref = หนี้ migration) |
| D4 | ✅ | ถอยหลัง QC1 (`c39-verify.log` 51 ขั้น + `c34-verify.log`): form 10 · fix-s1 28 · m1.4 37 · c1.4 110 · c2.4 91 · c2.5 105 · c2.6 87 · c2.2 73 · c3.1 56 · c3.2 47 · c3.5 67 · c3.6 29 · c0.4 72 · c0.5 50 · c0.2 27 · c1.11 66 · c1.5 103 · c2.7 79 · c3.3 90 (หลัง C3.3-fix) · **c1.3 89 (หลังรอบ 4)** · c1.8 · c2.1 · c2.10 · c2.11 · c1.10 · c1.2a · c1.9 · c1.6 · c2.9 · c3.0 · pages · systems · chat · attachments · v1 · cron · nav · แดงที่รู้จัก: m2.9/m3.11 (ENV/ภาพ) · c3.7 ภาพ · k2.3 หนี้ kanban |
| D5/D6 | ✅ | typecheck 5120 exit 0 · fitness 33/33 ×2 · build ผ่าน (part B `c34-verify-b.log`) |
| D7 | ✅ | ภาพ `.qc-shots/crm/3.9/` owner 6 ใบ (ตั้งค่า: อายุเก็บ · ส่งออก CSV/JSON · เพดาน 19 คีย์แถบ % · ผู้ติดต่อ 360: บล็อก PDPA ส่งออก/ลบ + แผงยืนยัน เหตุผล ≥5 + ติ๊กย้อนกลับไม่ได้) ผู้คุมงานดูเอง · thana ไม่มีบล็อก (STAFF ไม่มีคีย์ — ตามแบบ · สเปคแก้) · ไม่มี mockup เฉพาะ (ใบนี้ไม่มีภาพในชุด 17) |
| D8–D11 | ✅ | ผู้ตรวจอิสระ 2 รอบ (BLOCKER 3 + SHOULD-FIX 5 + NOTE 12 → รอบ 2 SHOULD-FIX 2 + NOTE 9 → รอบ 3 ปิด) + รอบ 4 regression static · หลักฐาน before/after `.qc-shots/c39/r2-probe-b123.log` |
| D12 | ⏳ | รอ push (เจ้าของกด) — `a0d9d531` + `a06a796b` + `a9523b59` |
หนี้: N2 ตัวเก็บตก followUp FAILED (C6) · N6 index (tenantId, action, targetId) บน AuditLog · N7 รอบแรก retention prod (C6.1 เจ้าของ) · AppNotification refType/refId (migration) · N8 payload มีแค่ contactId หลัก
