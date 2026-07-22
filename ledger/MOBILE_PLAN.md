# SHARK AI App — แผนงาน Mobile (เริ่ม 2026-07-22 · Fable คุม QC · Opus Builder)

> คอนเซ็ปต์: แอป iOS/Android (Expo) = "พนักงาน AI อีกคน" · Hybrid: **Native = login/DNA/drawer/session/chat/push · WebView = /app ระบบงาน 14 ระบบ** (one-time code 60 วิ แลก cookie)

## การตัดสินใจเจ้าของ (ครบ — อย่าถามซ้ำ)
1. บังคับ login ทันทีเมื่อเปิดแอป · social LINE/Google/Facebook/Apple — ลำดับทำจริง: **Google+Apple+OTP(ปุ่มเล็ก สำรอง/review) → LINE (รอ creds) → FB (Meta review) ท้ายสุด**
2. login ครั้งแรก → DNA Wizard สร้างกิจการแรกทันที
3. Drawer: ชื่อกิจการ + dropdown ทุกกิจการ + ปุ่มเพิ่มกิจการ→DNA · ไม่มี icon X
4. หน้ารวม Session สไตล์ Claude Code Remote Control: หลาย session · สไลด์ซ้าย=แก้ชื่อ/ลบ · unread สีต่าง · notification เมื่อ AI เสร็จ
5. Session ผูกกิจการ active เท่านั้น ห้ามข้าม (DB กันแล้ว tenantDb)
6. Help Center: เอาออกจาก Top Bar → แจ้งปัญหาผ่าน AI session (AI สรุปเคส→SupportCase→admin ตอบกลับเข้า session เดิม + "อย่าปิด session นี้")
7. KB auto-capture ระหว่างคุย (ต่อยอด AiMemory → KbArticle)
8. icon = orb วงแหวนน้ำเงิน CSS ตัวจริง (assets-mobile/ เสร็จแล้ว) · dev account ใช้ร่วม siamdive · bundle ID ใหม่ th.in.shark.ai

## Phase 0 — /api/mobile/* (ชั้นบางครอบ logic เดิม **ห้าม fork**) ← กำลังทำ
| WO | ขอบเขต | คนทำ | Oracle |
|---|---|---|---|
| M-01 | schema: `AiConversation.lastReadAt+deletedAt` · `PushDevice` · `SupportCase.conversationId` | **Fable** | migrate deploy prod + generate |
| M-02 | `src/lib/mobile/auth.ts` — Bearer reuse ตาราง Session (issueMobileToken/requireMobile+X-Tenant-Id ตรวจ membership) | **Fable** (core) | ใน qc-mobile-auth |
| M-10 | routes: auth/{otp,verify,logout} · me · tenants(list/create→DNA) · push/register · webview-session+exchange | Builder A (Opus) | qc-mobile-auth.mts |
| M-11 | routes: conversations CRUD+read/unread · chat/send **SSE** (wrap sendMessage + สถานะ tool) · proposals/plans confirm(confirm2x)/reject · dna/{questions,answers,apply} | Builder B (Opus) | qc-mobile-chat.mts |
| M-20 | ตรวจรับ+merge+gates+deploy READY+smoke prod | **Fable** | ทุกชุดด้านล่าง |

**สัญญา auth mobile**: `POST auth/otp {email}` → 200 (rate limit เดิม requestLogin) · `POST auth/verify {email,code}` → `{token,user}` (Bearer อายุเท่า Session 30/90 วัน) · ทุก endpoint หลัง login: header `Authorization: Bearer` + `X-Tenant-Id` → requireMobile ตรวจ membership ทุก request (stateless ไม่ใช้ cookie) · `webview-session` → `{code}` อายุ 60 วิ ใช้ครั้งเดียว (AuthToken purpose ใหม่) · `webview-exchange?code=` → set cookie เดิม (createSession) → redirect /app — **ห้าม token ใน URL**

## QC Gates (บังคับทุกรอบ — อย่าลืม)
1. Fable อ่านโค้ด Builder ทุกไฟล์ก่อน merge (ไม่ merge ตาบอด)
2. `set -o pipefail && pnpm typecheck` ก่อน push ทุกครั้ง (รวม push ของกลาง)
3. `pnpm fitness` 14/14 — mobile routes ต้องผ่าน F5/F6 (ใช้ service/assertCan ไม่ raw prisma นอกเหตุ)
4. oracle ใหม่: qc-mobile-auth + qc-mobile-chat (contract-first เขียนก่อน Builder เริ่ม)
5. regression: qc-ai 17/17 · qc-ai-phase-a/b1/b2 · qc-help-v2 (แตะ SupportCase) · cpa 107/107 ถ้าแตะเงิน
6. migration → `pnpm exec prisma migrate deploy` บน prod เอง (Vercel ไม่รันให้)
7. deploy ยืนยันจาก Vercel API state=READY (ไม่ใช่ curl 200)
8. smoke prod จริง: curl ทุก endpoint (401 ไม่มี token · 200 ครบ flow OTP→chat)
9. Builder ≤2 · ห้าม typecheck/build เอง · worktree แยก · **ห้าม prisma generate ใน worktree** (client แชร์ node_modules — generate จาก schema main โดย Fable เท่านั้น)

## Phase 1 — Expo App MVP (ถัดไป)
โครง: `apps/mobile` (repo เดียวกัน แยกโฟลเดอร์ ไม่แตะ Next build) · Expo Router
จอ: Login(OTP ก่อน→social) → DNA Wizard native (QUESTIONS JSON) → Drawer(กิจการ+เพิ่ม) → Session list (สไตล์ Claude Remote: unread จุดสี+สไลด์ซ้าย rename/delete) → Chat (bubble+การ์ด proposal+แนบรูป+👍👎+SSE) → WebView ระบบงาน
QC Phase 1: Maestro E2E flow หลัก + QC gate ก่อน TestFlight (enumerate ทุกจอ) · build ผ่าน EAS เท่านั้น (org @siamdive · ห้าม build บน VPS)

## Phase 2 — Push (Expo Push + PushDevice) · unread สีต่าง · **Help ผ่าน AI**: tool `support_open_case` ผูก conversationId → admin ตอบ backoffice → bridge กลับห้องเดิม + push
## Phase 3 — KB auto-capture (แยก memory สั้น vs KbArticle ถาวร + chip "บันทึกแล้ว") · social login ครบ 4
## Phase 4 — polish: voice/haptics/AiUsageWindow (เครดิต 2 ชั้นแบบ Claude)

## Security checklist (ทุก phase)
SecureStore เก็บ token (ห้าม AsyncStorage) · revoke ผ่าน Session เดิม · membership check ทุก request · webview code ใช้ครั้งเดียว 60 วิ · proposal ใช้ assertCan สิทธิ์คนกด · rate limit OTP เดิม · upload ≤2MB+MIME · ปุ่มลบบัญชี (PENDING_DELETE มีแล้ว) + demo account สำหรับ store review · push token ลบตอน logout · ไม่มี secret ฝั่งแอป
