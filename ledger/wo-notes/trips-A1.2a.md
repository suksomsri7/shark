# trips-A1.2a — ทะเบียนเอเจนซี่ · ล็อกอินอีเมล · session · ประตูต่อร้าน (รายงานผู้สร้าง · 13 พ.ย. 2569 · เลน l2 · ยังไม่ commit)

- ไฟล์ใหม่: `agency/accounts-core.ts` (300) · `agency/tokens.ts` (120) · `agency/accounts.ts` (1176) · `agency/agent-side.ts` (36) · `platform/agent-auth.ts` (585)
- ต่อท้าย: `agency/entry.ts` (+378) · `agency/index.ts` (+40) · `core/permissions.ts` (+7) · `outbox-consumers.ts` (+4) · `automation/labels.ts` (+4) · `platform/minute-jobs.ts` (+8) · CC §J.3.1/§J.3.2 (§5.8 ตรงตัว)
- ผล: ข้อสอบ a1.2 129/132 (M-1 M-5 P-8 = แย้งข้อสอบข้อเดียว) · fitness 54/54 ×2 (F17.1 ✅ · F5.1 = 52) · typecheck 0 · regression ดูรายงานผู้สร้างในแชต

## แย้งข้อสอบ
- **M-1** (ลาก M-5 · P-8): `Y = { …, agentUserId: String(v.agentUserId) }` อ่าน agentUserId จากผลของ `verifyAgentLoginCode` แต่ใบสั่ง §5.1 สั่ง "ไม่คืน agentUserId" และ A-3 ตรวจ `!("agentUserId" in v)` ⇒ Y.agentUserId = "undefined" · M-1 อ่านผู้ใช้ไม่เจอ · M-5 เพิ่มสมาชิก "undefined" ⇒ NOT_FOUND · P-8 Y ไม่ได้เป็นสมาชิกร้าน B
  เสนอแก้ M-1: `Y = { email: ey, token: String(v.token), agentUserId: String(R(await AU("resolveAgentSession")(String(v.token))).agentUserId), identityId: x.identityId, publicCode: x.publicCode };` · C-8 `createdUserIds.push(String(o.agentUserId))` ไม่มีผล (ไม่ต้องแก้)

## ตัดสินเองเมื่อใบสั่งเงียบ
- `AGENT_AUTH_LIMITS` นิยามที่ `accounts-core.ts` ชุดเดียว · `agent-auth.ts` ส่งออกตัวเดียวกัน (accounts.ts import platform ไม่ได้)
- ถังต่อรหัส (verifyPerCode): ตัวจำกัดล้ม ⇒ RATE_LIMITED (fail closed · A-15) · เกินเพดาน ⇒ INVALID_CODE (ล้มทุกแบบของรหัส = ข้อความเดียว §5.3 · C-6 ต้องได้ INVALID_CODE ทั้ง 20)
- ลำดับถังขอรหัส: เครื่อง → IP → อีเมล 15 นาที → อีเมลรายวัน (ถังที่ไม่ผ่านไม่นับถังถัดไป) · ยืนยันรหัสต้องมี ip ด้วย (NO_CLIENT)
- WHERE ของคำสั่งนับครั้งมี `target` ⇒ อีเมลผิดไม่กินครั้ง · หาเจ้าของล้ม (INVITE_INVALID/LOGIN_UNAVAILABLE) ⇒ tx ถอย ⇒ รหัสยังใช้ได้ (นับครั้งไปแล้ว 1)
- ตัวห่อ token (agentApply ฯลฯ) ตัดสิน session ด้วยนาฬิกาจริง · meta.now ใช้กับกติกาธุรกิจ/ถังเท่านั้น
- token เชิญอยู่ใน fragment ของลิงก์ (`/agent/<slug>/invite#<token>` · `/agent/join#<token>`) — ไม่ขึ้น log ของเซิร์ฟเวอร์/Referer
- คำเชิญด้วยรหัสก็มี `inviteExpiresAt` (14 วัน) · เพดานคำเชิญค้างนับเฉพาะที่ยังไม่หมด (null = ไม่หมด)
- รหัสร้านของแถวใหม่ (`code`) = สุ่ม 6 ตัวจากตัวอักษรรหัสสาธารณะ (ไม่ซ้ำในร้าน) · ร้านตั้งเองตอนอนุมัติ/เชิญ/แก้ (`^[A-Z0-9][A-Z0-9_-]{1,15}$`)
- เพดาน PENDING ค้างใช้กับแถวใหม่ทุกแถว (รวมร้านที่อนุมัติอัตโนมัติ)
- บทบาทสมาชิกต้องไม่สูงกว่าบทบาทผู้ใช้ในตัวตน (VALIDATION ROLE_ABOVE_USER) · ปิดผู้ใช้ไม่แตะแถวสมาชิก · ลบผู้ใช้ ⇒ สมาชิก inactive + audit `agency.member.remove`
- selectAgentAccount ยอม ACTIVE/PENDING (สมาชิก active) และ INVITED (OWNER/ADMIN) · ไม่ยอม SUSPENDED/CLOSED · myAgentAccounts แสดงทุกสถานะที่ผู้ใช้เป็นสมาชิก active
- audit ฝั่งร้าน after มี `actorKind SHOP` · invite เก็บ `idem` = คีย์ของร้าน (รูป `[A-Za-z0-9_-]{8,90}`) + `body` = sha256 ของคำขอที่ normalize (แบบ T0.6)
- รับคำเชิญอีเมล ⇒ approvedAt = now · approvedById null (การเชิญของร้าน = การอนุมัติ · ผู้เชิญอยู่ใน audit invite)

## หนี้ (A1.2b / ผู้คุม)
- สมัครพร้อมกันจากตัวตนเดียว (C-1) สร้าง Party ชื่ออย่างเดียวได้หลายแถว (Party นอก tx ตามใบสั่ง) — ใช้แค่แถวเดียว ที่เหลือกำพร้า
- ไม่มีเพดานการเชิญเพื่อน/จดหมายเชิญ (ไม่มีค่าใน §5.0) · ไม่มีงานเตือนใบอนุญาต · แม่แบบจดหมายเชิญเป็นร่าง (`agentShopInviteMail` `agentTeammateInviteMail`)
- fitness "agent-side import ได้เฉพาะ agent-auth" ยังเป็นแค่ข้อสอบ S-12 · ตัวช่วย *InTx ของ entry.ts import ตรงได้จากทุกที่ในเซิร์ฟเวอร์
- ผูก CRM สำเร็จยังไม่เคยรัน (ข้อสอบมีแต่ CRM_NOT_AVAILABLE) — probe ไม่ได้ทำ

## ยังไม่ได้ตรวจ
- ส่งอีเมลจริง (sendEmailRich นอกเส้นทางคำขอ) · ผูก CRM สำเร็จ/CRM_PARTY_MISMATCH · ไม่มี INTEGRATIONS_CREDENTIALS_KEY ตอนกรอกเลขภาษี · ไม่มี SESSION_SECRET ในฟังก์ชันอื่นนอก A-12 · งานกวาดผ่านตัวรัน minute-jobs จริง

---

# r2 — รอบแก้ตามมติ §10 (13 พ.ย. 2569 · เลน l2 · ยังไม่ commit · ไม่มี migration/schema/generate/build)

- ไฟล์ที่แก้: `agency/accounts-core.ts` · `agency/accounts.ts` · `agency/entry.ts` (เฉพาะบล็อก A1.2a) · `agency/tokens.ts` · `agency/agent-side.ts` · `agency/index.ts` (+1 ชื่อ) · `platform/agent-auth.ts` · `ledger/TRIPS-CORE-CONTRACT.md` (+1 บรรทัด ข้อ 7) · ไฟล์นี้
- ผล: ข้อสอบ a1.2 **114/132** (แดง 18 = พฤติกรรมที่มติสั่งเปลี่ยน 16 + S-6/S-7 จากไฟล์ probe ของผู้ล่าใน `scripts/`) · สำเนาข้อสอบที่ใส่ข้อเสนอแก้ (ด้านล่าง) = **132/132** · a1.1 121/125 (แดง S-9 S-10 S-13 X1-4 = ชุดที่ G-2 ยอมอยู่แล้ว) · fitness 54/54 ×2 (F17.1 ✅ · F5.1 = 52) · typecheck: `src/` 0 · เหลือ 6 ข้อใน `scripts/probe-trips-a1.2-hunt-{1,2,3,4}.mts` (ไฟล์ของผู้ล่า — import ลงท้าย `.mts` + `Rec` ไม่ประกาศ)
- log ทั้งหมด: `/tmp/claude-0/-root/df41f48a-2ba2-512c-8df1-75b7db31f4a8/scratchpad/a1.2-r2/` (`oracle-1.log` · `oracle-patched-1.log` · `oracle-proposed-edits.diff` · `hunt-1…4.log` · `hunt-2b.log` · `hunt-ops.log` · `r2-probe-1.log` · `fitness-*.log` · `a1.1.log`)

## ต่อข้อของมติ §10
1. **ปิดถาวรติดจริง** — เหตุ STICKY (`REJECTED`/`CLOSED_BY_SHOP`) **ค้างใน `statusReason` ตลอดช่วง PENDING** ของใบสมัครซ้ำ (คอลัมน์เดิม · DTO แสดง `closeReason` เฉพาะ CLOSED) ⇒ สมัครซ้ำเป็น `REAPPLY` เสมอ ไม่มี `REAPPLY_AUTO` (`accounts.ts:507–517` · คงเหตุ `:538`) · ถอน ⇒ CLOSED พร้อมเหตุเดิม (`accounts.ts:644` · `closeReasonKeepingSticky` `accounts-core.ts:83`) · ปิดตัวตนจากใบสมัครซ้ำ ⇒ เหตุเดิมเช่นกัน (`entry.ts:620`) · ร้านอนุมัติ ⇒ ล้าง (`accounts.ts:890`)
2. **token เชิญเพื่อนใช้ครั้งเดียว** — `n` = jti · ตอนรับ INSERT แถว `AgentLoginCode` id `tmj_<แฮช tm-jti>` (PK กันซ้ำ · `ON CONFLICT DO NOTHING` · `usedAt = now` · `expiresAt` = อายุ token ⇒ งานกวาดเดิมเก็บ) ใต้ `agency.identity.v1` (`tokens.ts:83` · `entry.ts:403` · `agent-auth.ts:284`) · ตรวจ **ก่อน** ดูว่าอีเมลมีล็อกอิน ⇒ ลบ/ปิดผู้ถูกเชิญแล้ว token เดิม = `INVITE_INVALID` · tx ถอย = ยังไม่นับว่าใช้
3. **เพดานจดหมายเชิญ** — 4 คีย์ใหม่ใน `AGENT_AUTH_LIMITS` (`accounts-core.ts:190–193`): `teammateInvitePerInviter` 5/ชม. · `teammateInvitePerIdentity` 20/วัน (`agent-auth.ts:596`) · `shopInviteMailPerTarget` 3/วัน ต่อ (ร้าน, อีเมล) · `shopInviteMailPerShop` 50/วัน (`accounts.ts:938` · เชิญ `:1003` · ออกใหม่ `:1063`) · ทุกถัง fail closed · นับก่อนสร้าง Party/แถว
4. **หัวเรื่องไม่มีรหัส** (`accounts-core.ts:401`) · `sendEmailRich` ทางสำรอง (ไม่มี `RESEND_API_KEY`) พิมพ์หัวเรื่องลง console จริง (`core/email.ts:131–133`) ⇒ ไม่มีผู้ให้บริการ = **ไม่เรียกตัวส่ง** · ops WARN `{kind, ref, reason: NO_MAIL_PROVIDER}` · ผลรูปเดิม — ทั้งจดหมายรหัส/เชิญเพื่อน (`agent-auth.ts:173`) และจดหมายเชิญของร้าน (`accounts.ts:248`)
5. **อนุมัติ/ปฏิเสธต้องส่ง `expectedUpdatedAt`** (`accounts.ts:850–859` · ตรวจ `:874` · CAS มี `updatedAt`) — ไม่ส่ง = `VALIDATION` · ไม่ตรง = ไม่เขียน (รหัส — ดู "ตัดสินเอง" ข้อ ก)
6. **login แข่ง disable** — tx ยืนยันรหัส: ล็อก `agency.login.v1` (อีเมล) → `agency.identity.v1` → **อ่านสถานะผู้ใช้ใหม่ใต้ล็อก** → แถวรหัส → session (`agent-auth.ts:271–311` · จุดล็อก `:291`)
7. **นาฬิกา** — `resolveAgentSession` `agentScope` `selectAgentAccount` `myAgentAccounts` `logoutAllAgentSessions` ใช้นาฬิกาจริง (`agent-auth.ts:425, 446, 482, 498, 516`) เท่ากับตัวห่ออื่น · พารามิเตอร์ `meta` ของ 5 ตัวนี้คงตามลายเซ็น §5.1 แต่ไม่มีผล · หมายเหตุสัญญา `TRIPS-CORE-CONTRACT.md:963`
8. **CRM อ่านล้ม** — เฉพาะ `CompaniesError` รหัส `NOT_FOUND`/`FORBIDDEN` = `NOT_FOUND` · อื่น = ops ERROR (ชื่อ/รหัส/stack) + `BUSY reason CRM_READ` (`accounts.ts:1224, 1246`) — **ยังไม่เคยรัน** (ร้าน QC ไม่มี CRM)
9. **Party กำพร้า** — หนี้ (ดูข้างล่าง) · r2 ลดได้ส่วนหนึ่ง: ถังจดหมายเชิญและการเล่นซ้ำใบสมัครตัดก่อนสร้าง Party
10. **เพดานใต้ล็อก** — PENDING: นับ+แทรกใต้ `agency.account.v1` คีย์ `pending:<tenantId>` (`accounts.ts:542`) · เชิญด้วยรหัส: เพดานนับ **ข้ามร้าน** จึงล็อกที่ระดับตัวตน (`agency.identity.v1` → `account.v1` → `invite.v1` · `accounts.ts:1012–1024` · นับใน tx `entry.ts:336`) — ล็อกระดับร้านอย่างเดียวกันสองร้านแข่งกันไม่ได้ (ดู "ตัดสินเอง" ข้อ ค)
11. **สมัครซ้ำล้างเงื่อนไขการค้า** — `tierId` = ค่าเริ่มต้นของร้านเมื่อ ACTIVE ทันที / ว่างเมื่อ PENDING (ร้านตั้งตอนอนุมัติ) · `unitIds` ว่าง · คง `code` · CRM · ธนาคาร (`accounts.ts:549`)
12. **สมาชิกที่ผู้ใช้ถูกปิด** — DTO `members[].active` และ `memberCount` = แถวสมาชิก active **และ** ผู้ใช้ ACTIVE (`accounts.ts:746` · `entry.ts:351`) · ร้านถอดได้ด้วย `removeAgentAccountMember` ใหม่บน facade (`accounts.ts:1297`) · ฝั่งเอเจนซี่ถอด (role null) ผู้ใช้ DISABLED ได้ (`entry.ts:654`) — ดู "ตัดสินเอง" ข้อ ข
13. **RV-F13** — ก) รหัสสาธารณะ trim+ตัวใหญ่ (`accounts.ts:974`) ข) เปลี่ยน `payeeType` ขณะมีเลขภาษีเก็บอยู่ต้องส่ง `taxId` มาด้วย (หรือ null) ไม่งั้น `VALIDATION reason TAX_ID_REQUIRED` (`:1139`) ค) ร้านแก้ผู้ติดต่อ ⇒ `consentVersion/consentAt` = null · `source SHOP` (`:1178`) ง) หน่วยต้อง ACTIVE (`:376`) จ) unique ชนใน verify: รหัสสาธารณะ ⇒ เลือกรหัสว่างก่อนแทรก (`entry.ts:375`) + ลองทั้ง tx ใหม่ · ล็อกอิน ⇒ `LOGIN_UNAVAILABLE` · อื่น ⇒ ops (`agent-auth.ts:368–376`)
14. **หนีการพัก (H-F3) — ทำได้บางส่วน** · คอลัมน์ที่มี: `AgentAccount.contact.email` (Json ของร้าน) ⇒ ใบสมัครที่อีเมลผู้ติดต่อตรงกับบัญชีอื่นของร้านเดียวกันที่ SUSPENDED / CLOSED เหตุ STICKY / PENDING ที่เหตุ STICKY ค้าง / CLOSED `IDENTITY_CLOSED` ที่ `suspendedAt` ไม่ null ⇒ PENDING เสมอ (`accounts.ts:437–461` · ใช้ `:509`) · ไม่อ่านตาราง global · **ยังหนีได้**: ช่องอีเมลผู้ติดต่อไม่บังคับ — ไม่กรอก (หรือบัญชีเก่าไม่เคยกรอก) = ไม่มีอะไรให้เทียบ · probe ของผู้ล่า `hunt-1 [T3]` ไม่กรอกอีเมลผู้ติดต่อ ⇒ **ยังขึ้น 🐞** · ไม่มีคอลัมน์ฝั่งร้านที่เก็บอีเมลล็อกอิน (หรือแฮช) ของผู้สมัคร ⇒ ส่วนนี้เป็นหนี้ (ดูข้างล่าง)
15. **cursor ผูกร้าน** — หาแถว cursor ด้วย `tenantId` ของร้าน · ไม่พบ = หน้าว่าง · เลื่อนหน้าด้วย (createdAt, id) ไม่ใช้ cursor ของ Prisma (`accounts.ts:783–788`)
16. **ถัง IP** — `canonicalAgentIp` (`accounts-core.ts:289`): IPv4 รูปเดียว · IPv6 ขยายเต็ม ถัง = /64 · `::ffff:a.b.c.d` = IPv4 · ผิดรูป = `NO_CLIENT` (`agent-auth.ts:141`)
17. **อีเมล/`codeId`** — `cleanAgentEmailInput` ด่านเดียวทั้งสองฝั่ง ปฏิเสธ (ไม่ตัดทิ้ง) C0/C1/DEL/zero-width/bidi/BOM/soft hyphen/surrogate เดี่ยว (`accounts-core.ts:240` · `agent-auth.ts:196` · `accounts.ts` `normEmail`) · `codeId` ต้องตรง `^alc_[0-9a-f]{24}$` ก่อนถังต่อรหัส/ฐาน (`agent-auth.ts:346` ⇒ `INVALID_CODE`) · id ทุกตัวที่บริการรับ = `^[A-Za-z0-9_-]{1,64}$` (`accounts-core.ts:208`)
18. **deadlock** — ล็อกต่ออีเมล `agency.login.v1` ก่อนแตะแถวรหัส (`agent-auth.ts:274`) · `pgErrorCode` ตัวเดียว (`accounts-core.ts:308`) อ่าน SQLSTATE ใต้ P2010 ก่อนรหัส Prisma แทน `pgCodeOf` ทั้ง 3 ไฟล์ · ลองใหม่สูงสุด 3 รอบ (`agent-auth.ts` verify · `entry.ts:429` `teamTx` · `accounts.ts:212` `runTx`) แล้ว `BUSY LOCK` ไม่ใช่ ERROR
19. **ถังสมัครของร้าน** — ลำดับ: ถังตัวตน → ร้านมีจริง → แถวเดิม (PENDING = replayed · ACTIVE/BAD_STATE ตอบเลย) → เพดาน PENDING → **ถังร้าน** → ค่าตั้ง (`accounts.ts:476–493`)
20. **N1–N9** — N1 = ข้อ 16 · N2 = ข้อ 15 · N3 `after.body` เป็นแฮชมีกุญแจ ป้าย `idem` (`accounts.ts:984`) · N7 รวม `pgCodeOf` · ลบ `void opts` · N8 เชิญด้วยรหัสอ่านซ้ำว่าตัวตนยัง ACTIVE ใต้ล็อกตัวตน (`accounts.ts:1022`) · ที่เหลือ = หนี้

## ข้อสงสัย 7 ข้อของผู้ล่า
1 `meta.now` — แก้ตามข้อ 7 (`meta.deps` ยังรับทุกฟังก์ชัน — ต้องเป็น fitness ของผู้คุม) · 2 login แข่ง erase/close — ปิดด้วยล็อกข้อ 6 · 3 `pgCodeOf` — จริง แก้ตามข้อ 18 · 4 เชิญด้วยรหัสปฏิเสธไม่ได้/20 ร้านบล็อก — จริงตามแบบ ไม่แก้ (หนี้) · 5 `addAgentLogin` ไม่พิสูจน์กล่องจดหมาย — เข้าไม่ถึงในใบนี้ (หนี้ A1.2b) · 6 หน้าต่างคงที่ 2×50 ครั้งคร่อมขอบวัน — จริงตามตัวจำกัดกลาง ไม่แก้ (หนี้) · 7 รับคำเชิญด้วยอีเมลไม่ตรงแล้วถอน ทิ้งแถวผูกคนแปลกหน้า — จริง ไม่แก้ (หนี้)

## ตัดสินเองเมื่อมติเงียบ/กำกวม
- ก) ข้อ 5 เขียน `STATE_CONFLICT` แต่ `AGENCY_ERROR_CODES` (§3 · ข้อสอบตรึง) ไม่มีรหัสนี้ ⇒ ตอบ **`STALE` + `reason: "STATE_CONFLICT"`** (รหัสเดียวกับ CAS `updatedAt` ของแก้โปรไฟล์) · ถ้าผู้คุมต้องการรหัสใหม่ = เพิ่ม 1 ค่าใน `AGENCY_ERROR_CODES` + ข้อความ + แก้ 2 จุด (`accounts.ts:874` และกิ่งใน tx)
- ข) ข้อ 12 "ร้านถอดสมาชิกได้" ⇒ เพิ่ม `removeAgentAccountMember(ctx, { agentAccountId, memberId })` สิทธิ์ `agency.account.edit` + ไม่จำกัดสาขา · **ถอดได้เฉพาะสมาชิกที่ผู้ใช้ใช้งานไม่ได้แล้ว** (ยังใช้ได้ = `BAD_STATE`) · audit `agency.member.remove` actorType USER · ไม่แตะตาราง global
- ค) ข้อ 10 เชิญด้วยรหัสใช้ล็อกระดับตัวตน ไม่ใช่ระดับร้าน (เหตุผลในข้อ 10)
- ง) ข้อ 7: แถว session ยังประทับเวลาด้วย `meta.now` ตอนสร้าง (ช่องทดสอบ) — การตัดสินว่า token ใช้ได้ไหมใช้นาฬิกาจริงเสมอ
- จ) ข้อ 1: ถอนใบสมัครซ้ำของแถว STICKY แล้วถอนซ้ำ = `BAD_STATE` (แยกจากแถวที่ร้านปิดเองไม่ได้) · ช่วงรอ 7 วันนับใหม่จากตอนถอน
- ฉ) ข้อ 17: `codeId` ผิดรูป = `INVALID_CODE` (ไม่ใช่ VALIDATION) · ไม่ใช่สตริง/ยาวเกิน 64 = `VALIDATION` เหมือนเดิม
- ช) ข้อ 3: ไม่ได้ทำ "คำเชิญอีเมลที่เปิดอยู่ได้ใบเดียวต่ออีเมลต่อร้าน" (RV-F3 เสนอ · มติไม่ได้สั่ง) — เพดาน 3/วันครอบแทน

## แย้งข้อสอบ (ผู้สร้างไม่ได้แก้ · ข้อเสนอแบบรันได้ = `scratchpad/a1.2-r2/oracle-proposed-edits.diff` · รันแล้ว 132/132)
- **K-8** — เพิ่ม 4 คีย์ข้อ 3 ใน `EXPECTED_LIMITS`
- **SH-3 SH-4 SH-5 SH-6 SH-10 SH-11 IN-9 C-3** (+ ลูกโซ่ SH-7 SH-8 P-11) — อนุมัติ/ปฏิเสธไม่ส่ง `expectedUpdatedAt` ⇒ `VALIDATION` · เสนอ: ตัวช่วย `shop` เติม `updatedAt` ปัจจุบันของแถวให้เมื่อไม่ส่ง + C-3 ส่งค่าเดียวกันทั้งสองฝั่ง
- **A-11** — ส่ง `now` อนาคตให้ `resolveAgentSession` · เสนอ: เลื่อน `idleExpiresAt`/`expiresAt` ของแถวด้วย SQL แล้วคืนค่า + ตรวจว่า `now` ของผู้เรียกไม่มีผล
- **M-10 M-13 C-8** — ตัวตน X เชิญเพื่อนเกิน 5 ครั้ง/ชม. ⇒ `RATE_LIMITED` · เสนอ: ข้อที่ไม่ได้สอบเพดานใช้ `deps.rateLimit` ที่ผ่านเสมอ
- **S-6 S-7** — ไม่เกี่ยวกับ r2: ไฟล์ `scripts/probe-trips-a1.2-hunt-*.mts` (ผู้คุม commit ใน `d1f3cc2c9`) นับเป็นไฟล์นอกขอบเขต · เสนอ: ยกเว้นชื่อนี้
- probe ของผู้ล่าที่ขึ้น 🐞 เพราะพฤติกรรมที่มติสั่ง (ไม่ใช่บั๊ก): `hunt-1 [T4b]` (approve ไม่ส่ง `expectedUpdatedAt` = VALIDATION) · `hunt-4 [V5]` (จำลองเวลาด้วย `meta.now` ซึ่งไม่มีผลกับ session แล้ว) · `hunt-3 [R9b]` (ข้อผิดของ probe เดิม + approve ไม่ส่งค่า) · `hunt-2` หยุดที่ L2c เพราะ `reqCode` ปฏิเสธอีเมล zero-width (ตัว lib โยน) — L2c…L10 รันผ่านสำเนาชั่วคราวที่ครอบ try/catch (`hunt-2b.log`)
- ข้อที่ข้อสอบยังไม่มี (ผู้เขียนข้อสอบ): T-1 T-2 T-3 T-4 T-5 T-6 ของ CODE-REVIEW + ข้อ 11–15 — probe ชั่วคราวของผู้สร้างรันผ่านครบ 16 ข้อ (`r2-probe-1.log` · ไฟล์ลบแล้ว)

## หนี้
- **ข้อ 14 ส่วนที่เหลือ**: ผู้สมัครที่ไม่กรอกอีเมลผู้ติดต่อ หรือใช้อีเมลอื่น ยังหนีการพัก/ปิดด้วยการปิดตัวตนแล้วสมัครใหม่ได้ที่ร้านอนุมัติอัตโนมัติ · ทางปิดต้องมติ: (1) เก็บแท็ก HMAC ของ **อีเมลล็อกอิน** ผู้สมัครในแถวบัญชีตอนสมัคร (ต้องอ่านล็อกอินของผู้กระทำเอง = ตาราง global ซึ่งข้อ 14 ห้าม · และต้องมีคอลัมน์/คีย์ใน `contact`) หรือ (2) บังคับอีเมลผู้ติดต่อ = อีเมลล็อกอินที่ยืนยันแล้ว · อีเมลอื่นทั้งหมดกันไม่ได้ตราบที่สมัครเอง + อนุมัติอัตโนมัติยังเปิด (ควรอยู่ใน §19)
- **ข้อ 9**: Party ชื่ออย่างเดียวกำพร้า — สมัครพร้อมกันจากตัวตนเดียว · คำขอที่ถูกปฏิเสธใน tx หลังสร้าง Party (ชนเพดาน/แข่ง) · คำเชิญอีเมลทุกใบสร้าง Party ใหม่
- N4/ข้อสงสัย 4: `RATE_LIMITED 3600` ของเพดานคำเชิญด้วยรหัสบอกร้านว่าเอเจนซี่มีคำเชิญค้าง ≥ 20 · เอเจนซี่ปฏิเสธคำเชิญด้วยรหัสไม่ได้
- N5: ช่วงรอนับจาก `updatedAt` — เลิกผูก CRM บนแถว CLOSED เลื่อนช่วงรอ · N6: เพดาน 20 session อาจเป็น 21 ถ้าผู้ใช้มีอีเมลล็อกอินสองตัวเข้าพร้อมกัน · N8: OWNER ที่เพิ่งเลื่อนขั้นไม่ถูกเพิ่มเป็นสมาชิกบัญชีเดิม · ไม่มีเพดานผู้ใช้ต่อตัวตน · N9: `myAgentAccounts` LIMIT 500
- V4 ของผู้ล่า: ADMIN เชิญ ADMIN ใหม่ได้ (§4) แต่ปิด/ลดไม่ได้ (§9) — ใบสั่งขัดกันเอง รอผู้คุม
- แถว `tmj_*` ในตารางรหัส: ข้อสอบ/probe ไม่ได้ลบ (งานกวาดเก็บหลังหมดอายุ + 1 วัน) — รอบนี้ลบของคืนนี้ออกจากฐาน QC แล้ว 47 แถว · ตัว cleanup ของข้อสอบควรลบ `id LIKE 'tmj\_%'` ที่สร้างในรัน
- ถังที่ตัวจำกัดจำลอง **โยน** (ไม่ใช่ตอบไม่มี count) ยังเป็น `BUSY UNEXPECTED` + ops ERROR (`hunt-2 [L9]`) — ตัวจำกัดจริงไม่โยน
- หนี้ r1 ที่ยังอยู่: fitness "agent-side import ได้เฉพาะ agent-auth" · แม่แบบจดหมายเชิญเป็นร่าง · ไม่มีงานเตือนใบอนุญาต

## ยังไม่ได้ตรวจ (r2)
- ข้อ 8 ทั้งข้อ (CRM อ่านล้ม/สำเร็จ/`CRM_PARTY_MISMATCH`) — ร้าน QC ไม่มี CRM
- ส่งอีเมลจริงเมื่อมี `RESEND_API_KEY` (ทางที่ตรวจคือทาง "ไม่มีผู้ให้บริการ" เท่านั้น)
- ข้อ 13 จ: รหัสสาธารณะชนจริง / ล็อกอินชนพร้อมกัน — อ่านโค้ด + ทดสอบ `pgErrorCode` ด้วยรูป error จำลอง ไม่ได้ทำให้ชนจริง
- ข้อ 18 การลองใหม่ของ `teamTx`/`runTx` เมื่อ deadlock จริง — ไม่มี deadlock เกิดในรัน (R1–R5 ของผู้ล่า 0 ครั้ง)
- ข้อ 6 ลำดับ "login ชนะ disable" — 4 รอบที่รัน disable ชนะทุกรอบ (ไม่มี session ค้างของผู้ใช้ DISABLED)
- อายุ session ครบเส้น (เลื่อน idle ทุก 60 ชม. ถึงวันที่ 30) — `hunt-4 [V5]` จำลองด้วย `meta.now` ไม่ได้แล้ว · ตรวจแค่หมด idle/หมดสัมบูรณ์ด้วยการเลื่อนแถว (A-11 ฉบับเสนอ)
- eslint (เลนนี้ไม่มีคำสั่ง) · build · งานกวาดผ่านตัวรัน minute-jobs จริง
