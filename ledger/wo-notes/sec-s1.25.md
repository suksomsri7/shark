# WO S1.25 — กิจการจากแอป · เชิญพนักงานด้วยเบอร์ (StaffInvite) · ระดับสิทธิ์ ปิด/ดู/ใช้งาน + แชท 3 ระดับ · ระงับ/เอาออก — ชุด S1-17

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-d` branch `wip/sec-s1.25` (ฐาน e40fbba3 — ff จาก acda8970 หลังผู้คุม reset · 2 commit ledger/oracle เท่านั้น) · 2026-11-04 · builder: ตัวแทนเลน d
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.25.md` (+ COMMON + RESOLUTIONS R-K11 R-K14 R-K9 §H R-S1.19a–h · §C Q8/Q10 · §K R-S1.8e)
> docs `docs/modules/31-secretary.md` §5.22 · §5.23 (ตารางนิยามระดับ)
> ข้อสอบ: `scripts/qc-sec-s1.25.mts` (15 ข้อ · commit test: a81f47ac · **แก้หลัง commit: ไม่**)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/mobile/tenants.ts` | แก้ | แยก `createTenantTx` (tx เดิม · `createTenantForUser` พฤติกรรมเดิม) · `TENANT_TYPES` · `createTenantFromApp` (เพดาน 3 ร้านใน tx + advisory lock ต่อผู้ใช้ · `createSystemAutoLink` ต่อระบบ · `startRoom` ห้องแรก best-effort lazy) | ไม่ |
| `src/lib/staff/invite.ts` | ใหม่ | `inviteStaff` `listInvites` `listStaffAccessWithInvites` `cancelInvite` `resendInvite` `previewInvite` `claimInvitesForPhone` `acceptInviteByCode` | ไม่ |
| `src/lib/staff/levels.ts` | ใหม่ | `levelOfModule` `permissionsForLevel` `CHAT_LEVELS` `setStaffLevels` `suspendStaff` `removeStaff` `staffViewOf` | ไม่ |
| `src/lib/staff/service.ts` | แก้ 1 คำ | `export` ให้ `checkNoEscalation` (คำเชิญใช้ตัวตรวจชุดเดียวกับ updateStaffAccess) | ไม่ |
| `src/lib/core/phone-auth.ts` | แก้ (เพิ่ม) | helper `claimStaffInvites` (lazy · catch → logOps ไม่มีเบอร์) + 3 hook: หลัง `signupWithPhone` สำเร็จ · หลัง `linkPhoneToUser` สำเร็จ · หลัง `consumePhoneOtp` สำเร็จ (= ล็อกอิน OTP) | ไม่ |
| `docs/modules/31-secretary.md` | แก้ | §5.22 · §5.23 เขียนใหม่ตามของจริง + ตารางระดับ | — |

## 2. migration / seed / backfill
- ไม่มี · ไม่แตะ `prisma/` · ไม่รัน `prisma generate` (StaffInvite/UserPhone มีจาก S1.1)

## 3. การตัดสินใจ / ส่วนที่ต่างจากใบ (ให้ผู้คุมชี้ขาด)
1. **MANAGER เชิญได้เฉพาะ STAFF** — `canAssignRole(MANAGER, MANAGER)` = true แต่ I-2 ต้องการ ok:false ⇒ กติกาคำเชิญเข้มกว่า: OWNER เชิญ MANAGER/STAFF · MANAGER เชิญ/ส่งซ้ำ/ยกเลิกเฉพาะใบ STAFF (`bad_role`)
2. **ตอนรับ ตรวจซ้ำกับสิทธิ์ปัจจุบันของผู้เชิญ** (role/สาขา/validatePermissionInput/checkNoEscalation) — ผู้เชิญถูกถอนหรือลดบทบาท ⇒ ใบใช้ไม่ได้ (tx ย้อน · ใบค้าง · logOps)
3. `claimInvitesForPhone` รับเฉพาะเมื่อ `UserPhone(userId).phone === phone` และ `verifiedAt ≠ null` (กันผู้เรียกส่งเบอร์คนอื่น)
4. throttle ไม่มีคอลัมน์ใหม่: เวลาส่งล่าสุด = `expiresAt − 7 วัน` · เพดาน 20 ใบค้าง ⇒ reason `throttled` (ใน union ไม่มีเหตุผลแยก) ข้อความไทยต่างกัน
5. `unitIds` ไม่ส่ง ⇒ `[]` (fail-closed แบบ grantStaffAccess) · `["*"]` = ทุกสาขา — หน้าจอ S2.22 ต้องส่งเอง
6. ชื่อผู้ถูกเชิญว่าง ⇒ "พนักงานใหม่" (union ไม่มี bad_name) · ยาวเกิน 60 ตัด
7. dev ไม่มีผู้ให้บริการ SMS ⇒ สร้างแถว `sms:"unavailable"` (คืนลิงก์ให้ผู้เชิญส่งเอง) · production ไม่มี ⇒ `sms_unavailable` ไม่สร้างแถว · ส่งล้ม ⇒ แถวคงอยู่ `sms:"unavailable"`
8. hash รหัส = `sha256("staff-invite:"+code)` ไม่มี pepper (phone-auth `hashCode` ก็ไม่มี pepper และผูกเบอร์ ⇒ ใช้กับการค้นด้วยรหัสอย่างเดียวไม่ได้) — รหัส 40 บิต · การรับยังต้องมีเบอร์ที่ยืนยันตรงใบ
9. ปิดเลขกลาง: `maskContactValue` ไม่อยู่บน facade CRM ⇒ ใช้ `crmApi.maskPiiDeep({phone})` (facade · lazy import เฉพาะใน list/preview — ทาง claim ไม่ลาก CRM) ผล = `xxxxxxxx001`
10. "รอรับคำเชิญ" แยกเป็น `listStaffAccessWithInvites(ctx)` ใน invite.ts (ไม่ใช่ service.ts — กันวง import service↔invite) · `listStaffAccess` เดิมไม่เปลี่ยน
11. ระดับ: คีย์อ่อนไหวถูกตัดจาก VIEW ด้วย (เช่น `hr.payroll.read`) · USE คงคีย์อ่อนไหวที่เคยให้รายคีย์ · แชท (R-S1.25a หลัง merge fd85925c): VIEW = read+markRead · REPLY = read+markRead+send+setStatus · NONE/VIEW ถอนคีย์แชททั้งโมดูล · REPLY ถอนแค่ `chat.*` · `staffViewOf` อ่านแชทจาก read/send · `staffViewOf` OWNER/MANAGER = USE ทุกโมดูล + REPLY
12. `setStaffLevels/suspendStaff/removeStaff` ผู้สั่งต้องเป็น OWNER/MANAGER (อ่านจาก DB · เข้มกว่า `settings.staff.write`) · MANAGER แตะแถว OWNER ไม่ได้ (revokeStaffAccess เดิมไม่ตรวจข้อนี้)
13. ไม่มี event ใหม่ (`staff.invite.accepted` ใน docs เดิม ไม่อยู่ในใบ) · แจ้งผู้เชิญ = `AppNotification(recipientUserId)` + `notifyUser(…,"inbox",{link:"/staff"}, {assigneeUserId: ผู้เชิญ})`
14. ห้องแรก: ข้อความใช้ป้ายไทยของประเภท (เช่น "ร้านค้า") แทนคีย์ `retail`

## 4. ใครได้/เสียสิทธิ์อะไร
- ได้: ผู้ถูกเชิญได้ Membership ตามใบเมื่อยืนยันเบอร์ (OTP signup/login/link หรือรหัสลิงก์) · ผู้ใช้สร้างร้านจากแอปได้ ≤ 3 ร้าน
- เสีย: ไม่มีทางเดิมใดเปลี่ยน · `removeStaff` ถอน AiRoomMember ของคนนั้นในร้าน
- ทางเรียกโมเดลใหม่: ไม่มี (startRoom แค่นับงาน + สร้างห้อง · ไม่เรียกโมเดล)

## 5. ผลข้อสอบ
คำสั่ง: `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env [QC_FORCE=1] SHARK_AI_MOCK=1 SMS_PROVIDER=mock pnpm exec tsx scripts/<suite>.mts`
- `qc-sec-s1.25` forced #1 (18:06Z) / forced #2 (18:07Z) / unforced (18:08Z): `JSON_SUMMARY {"total":15,"passed":15,"failed":[],"skipped":[],"findings":[]}` exit=0 ×3 · residue: finally ของข้อสอบลบครบ (รอบแรกก่อนแก้ 2 จุดเล็ก 18:02Z ก็ 15/15)
- regression (หลังแก้ · เทียบ clean tree ที่รันก่อนแตะโค้ด 17:53–17:58Z เพราะไม่อยู่ใน `sec-baseline-85751098.txt`):
  - `qc-sec-s1.19` forced 26/26 (clean 26/26) · `qc-sec-s1.4` forced 28/28 (clean 28/28) · `qc-sec-s1.17` forced 10/10 (clean 10/10)
  - `qc-account-deletion` 18/18 (clean 18/18) · `qc-onboarding-drip` 6/6 (clean 6/6)
  - `qc-member-m3.11` `{"total":1,"passed":0,"findings":[{"id":"M3.11-ERR"}]}` exit=1 — **เท่า clean tree** (TypeError `actorOf` อ่าน role ของ null = ฐาน QC เลขาไม่มีชุดข้อมูลสมาชิก M3 · ไม่เกี่ยวใบนี้)
  - `qc-chat-staff-perms` 49/49 · `qc-mobile-auth` exit=0 (= baseline file)
- typecheck: tsconfig แคบ (`tsconfig.s125.json` ชั่วคราว ไม่ commit · ไฟล์ที่แตะ 5 ไฟล์ + กราฟที่ import) `tsc rc=0` 0 error · ไม่ได้รัน `pnpm typecheck` ทั้งรีโป
- fitness: มี env `{"total":53,"passed":53}` · `env -u DATABASE_URL -u DIRECT_URL` `{"total":53,"passed":53}` (+ D-1/D-2 ในข้อสอบ ×3)

## 6. ต่อจากนี้ / หนี้
- route มือถือ/เว็บ (`POST api/mobile/tenants` แบบใหม่ · `/i/<code>` · หน้าพนักงาน) = S2.21/S2.22 — previewInvite/acceptInviteByCode ต้องมี rate-limit ที่ route (รหัส 40 บิต)
- คีย์เก่าที่ทะเบียนไม่รู้จัก (เช่น `kanban.card.read`) ลบผ่านระดับ OFF ไม่ได้ — `mergePermissions` ของ updateStaffAccess คงไว้โดยตั้งใจ ⇒ `levelOfModule` ยังอ่านโมดูลนั้นเป็น VIEW หลังตั้ง OFF (ต้องมีทางล้างคีย์เก่าแยก ถ้าผู้คุมต้องการ)
- ORACLE-EDIT: ไม่มี

## 7. รอบ R-S1.25a (merge fd85925c · ORACLE-EDIT L-3 ของผู้คุม)
- `CHAT_LEVELS` VIEW = read+markRead · REPLY = read+markRead+send+setStatus (ไม่มี assign/customer.link) · docs §5.23 แก้ตาม
- tsc แคบ rc=0 · `qc-sec-s1.25` forced 18:28Z / forced 18:28Z / unforced 18:29Z: `{"total":15,"passed":15,"failed":[],"skipped":[],"findings":[]}` exit=0 ×3 (D-1/D-2 fitness ในข้อสอบผ่าน)
- regression ไม่รันซ้ำ: รอบนี้แก้แค่ `levels.ts` (มีแต่ข้อสอบ s1.25 ที่ import) + merge มีแต่ ledger/oracle

## 8. รอบ 2 — รีวิว O/P (RESOLUTIONS §P · merge a4340c3c · ข้อสอบ 19 ข้อ)
| มติ | สถานะ | ที่ไหน |
|---|---|---|
| R-S1.25b auto-join เฉพาะ signup | CLOSED | phone-auth: ถอด hook login/link (เหลือ signup) · invite.ts `pendingInvitesForUser` `acceptInvite` (เบอร์ verified ต้องตรง · ตรวจเบอร์ก่อนบอกสถานะ) |
| R-S1.25c rate-limit ไม่ขึ้นกับแถว | CLOSED + ต่าง 1 ข้อ | `inviteRateOk` → `checkRateLimitDbMany` 3 ถัง/วัน: ร้าน+เบอร์ 5 · ร้าน 50 · **ผู้เชิญต่อร้าน** 30 (ไม่ใช่ข้ามร้าน — ถังข้ามร้านของ `qcs125-owner` จะเต็มเมื่อรันข้อสอบ 3 รอบ/วัน (~12 ใบ/รอบ) · ข้ามร้านยังติดเพดานร้าน 50 × ร้านที่เป็นสมาชิก) · ส่งซ้ำนับ · ยกเลิกไม่คืน · ชื่อถังเก็บ hash เบอร์ |
| R-S1.25d MANAGER → STAFF เท่านั้น · ห้ามฟื้นคนถูกถอนที่สูงกว่า | CLOSED | levels `gate` (target STAFF · role ใหม่ STAFF) · invite `canManageInviteRole` · `revokedOutranks` ใน invite (forbidden) และ claim (ใบหมดอายุ) |
| R-S1.25e `isSensitiveKey` + payroll | CLOSED + เพิ่ม | levels.ts รายการ §P ทั้งหมด + เพิ่ม `.slip.review` `approval.policy.` `systems.` (ชี้ขาดได้) · service.ts `checkNoEscalation`: `hr.payroll.*` ต้อง `canViewPayroll(actor)` (มีผลกับ updateStaffAccess เดิมด้วย — MANAGER แจกคีย์เงินเดือนไม่ได้แล้ว) |
| R-S1.25f คีย์ `_…` คงทุกระดับ | CLOSED | `isLimitKey` (ส่วนใดขึ้นต้น `_`) — คงใน permissionsForLevel/permissionsForChat · ไม่นับใน levelOfModule (ต่างจากใบรอบแรก "ตัวเลข > 0 = USE" ซึ่งขัดกับ f) |
| R-S1.25g `levelsAvailableFor` + ตาราง | CLOSED | levels.ts · docs §5.23 ตาราง 41 โมดูล (สร้างจากโค้ด) · setStaffLevels ปฏิเสธระดับที่ไม่มี · chat = `[]` |
| R-S1.25h levels.chat / staffViewOf / REPLY 4 คีย์ | CLOSED | setStaffLevels ปฏิเสธ `levels.chat` · staffViewOf ไม่มี chat · REPLY = `chat.*` หรือครบ 4 · VIEW = มี read |
| R-S1.25i ใบหมดอายุเมื่อ re-check ไม่ผ่าน · reason แยก · ล็อกร้าน | CLOSED | `expireAndNotify` · `pending_cap` · resend `not_found`/`accepted` · advisory lock `staff-invite:<tenant>` |
| R-S1.25j push/SMS/tenants/listStaffAccess | CLOSED | `detachPushDevices` ใน suspend/remove · SMS "SHARK: " + `smsSafe` (URL/โดเมน/เลข ≥4 · ≤40 ตัว) · tenants: try/catch ต่อระบบ + logOps · `export TenantRuleError` · type lower-case · เพดานนับ OWNER ที่ถูกระงับ · `listStaffAccess(tenantId, {includeInvites:true})` (overload · ปริยายเดิม) แทน `listStaffAccessWithInvites` (ลบ) |
- ผลรอบ 2: `qc-sec-s1.25` forced 18:52Z / forced 18:53Z / unforced 18:55Z `{"total":19,"passed":19,"failed":[],"skipped":[],"findings":[]}` exit=0 ×3 · s1.19 26/26 · s1.4 28/28 · s1.17 10/10 (forced) · chat-staff-perms 49/49 · mobile-auth exit 0 · account-deletion 18/18 · onboarding-drip 6/6 · fitness 53/53 ×2 · tsc แคบ (5 ไฟล์ + กราฟ) rc=0
- หมายเหตุ QC: ถัง `ChatRateBucket` `staff-invite:*` ของข้อสอบไม่ถูกลบโดย cleanup (ร้านใหม่ทุกรอบ ⇒ ไม่ชนกัน · ถังผู้เชิญผูก tenantId)

## 9. re-check P.2 (N1–N5 · merge bb0c5230)
- N1 SENSITIVE_PARTS + 16 รายการ P.2 + เพิ่มเอง `.cheque.` `.enrollment.pay` (MUST_NOT ของ L-6 มี `account.cheque.clear/bounce` `school.enrollment.pay` ที่รายการ P.2 ไม่ครอบ) · ตาราง §5.23 สร้างใหม่ (`system` USE → OFF)
- N2 `inviteRateOk` fail-closed (ครบ 3 ถัง · count เป็นตัวเลขทุกถัง) · N3 resend ทั้งก้อนใต้ล็อกร้าน (+ pending_cap เมื่อส่งซ้ำใบหมดอายุ) · N4 `smsSafe` `\p{Nd}{4,}`/u + แปลง `。．｡ [.] (.) (dot) [dot]` เป็นจุด + โดเมนมีช่องว่างรอบจุด · N5 ล้าง PushDevice.tenantId ใน `revokeStaffAccess` (service.ts) · removeStaff ล้างซ้ำเผื่อถูกถอนไปก่อน
- ผล P.2: s1.25 forced 19:18Z/19:19Z + unforced 19:20Z 19/19 ×3 · s1.19 26/26 · s1.4 28/28 · chat-staff-perms 49/49 · account-deletion 18/18 · fitness 53/53 ×2 · tsc แคบ rc=0
