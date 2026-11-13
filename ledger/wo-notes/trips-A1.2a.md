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
