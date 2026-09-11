คุณคือ builder ของ WO **M3.11** ระบบสมาชิก v2 (SHARK) — LIFF onboarding `/m/[slug]/join` 3 ขั้น (ที่มา `?src=` · OTP · ฟิลด์ customerEditable+required · ผู้แนะนำ `?ref=` · ความยินยอม 4 ช่อง · นโยบาย) + `/join/done` (บัตร + QR + แต้มต้อนรับ) · แอปพนักงาน Expo 3 จอ (ค้น/สแกน QR · สรุป+ปุ่ม 4 · ประทับ PIN) ผ่าน `/api/mobile/member/{search,scan,summary,stamp}` (mobile session) · สะพาน push device ใน `/m/[slug]/layout.tsx` · ภาพ 29 · 28 · **ไม่มี migration · ห้ามบิลด์แอป/OTA/eas**

อ่านก่อนเริ่ม (ตามลำดับ):
1. `ledger/member-briefs/member-builder-common.md` — กติกาตายตัว + วิธีส่งมอบ
2. `ledger/MEMBER-RUN.md` §0.1 · §2 M3.11 · §4 (มติล่าสุด)
3. **ข้อสอบ `scripts/qc-member-m3.11.mts` = สัญญาฉบับเต็ม** (หัวไฟล์ = 3 ขั้น LIFF · testid web + testID แอป · API มือถือ · QC render · สะพาน push) — อ่านทุกข้อ
4. `ledger/wo-notes/member-M3.10.md` (join.ts + REST join lane — **ใช้ service นี้ ห้ามเขียนตรรกะสมัครซ้ำ**) · `member-M2.9.md` (customer-session · /m/[slug]/* แบบแผน · บัตร QR token HMAC) · `member-M1.8.md` (AcquisitionLink hit) · `member-M3.5.md` (referrals.attach) · `member-M3.6.md` (PUSH ใช้ MemberPushDevice) · `member-M3.2.md` (MemberPushDevice)
5. แอปมือถือ: `apps/mobile/` (Expo Router · ดู `apps/mobile/qc/shoot-ipad.mjs` เป็นแบบ QC render web export + puppeteer · memory: QC เรนเดอร์จอแอป RN ดูได้โดยไม่ build) · `src/app/api/mobile/*` เดิม (requireMobile)
6. ภาพ `ledger/design-member/29-liff-onboarding.png` (3 ขั้น) · `28-staff-mobile.png` (3 จอพนักงาน) · บัตรแบบ `09-mobile-liff.png` — มือถือ ≤ 390 เป็นหลัก · `MemberIcon` ในเว็บ · ห้าม hex (เว็บ) · แอปใช้ธีม/คอมโพเนนต์เดิมของ apps/mobile

ขอบเขตไฟล์: `src/app/m/[slug]/join/{page.tsx, done/page.tsx}` · `src/components/member/JoinFlow*.tsx` · `src/lib/modules/member/join-actions.ts` · Edit เฉพาะจุด `src/app/m/[slug]/layout.tsx` (m-push-bridge) · `src/app/api/mobile/member/{search,scan,summary,stamp}/route.ts` · `apps/mobile/app/(app)/member/{index,[customerId],stamp}.tsx` + ทางเข้า Drawer "สมาชิก" (Edit เฉพาะจุด) · `apps/mobile/qc/shoot-member.mjs` (ผู้คุมงานจะรัน · builder เขียนให้รันได้)
- ห้ามเปลี่ยน `apps/mobile/app.json` version/runtimeVersion · ห้าม `eas build` / `eas update` (กินโควตา · ต้องรอเจ้าของสั่ง)
- `expo-camera`: ถ้ายังไม่มีในแอป ให้ตรวจ package.json ของ apps/mobile ก่อน — ถ้าต้องติดตั้งใหม่ บันทึกในข้อตัดสิน (เพิ่ม native module = ต้องบิลด์ใหม่ก่อนใช้จริง → ทำจอให้ fallback เป็นช่องกรอกโค้ดเมื่อไม่มีกล้อง)
- API มือถือเรียก facade member/stamp/point เท่านั้น · `assertCan` สิทธิ์ member.customer.read / member.loyalty.stamp · error JSON ไทย

regressions ต้องผ่านเท่าเดิม: `qc-member-m2.9` 22/22 · `m3.10` · `m1.8` · `m3.5` · `m2.3` · ชุด mobile API เดิมที่ใช้ QC env · `apps/mobile` tsc (ถ้ามี script) · fitness 2 โหมด · grep 'use client' ก่อนส่งมอบ

ส่งมอบตาม common.md (wo-notes `ledger/wo-notes/member-M3.11.md` · ตอบสั้น: ไฟล์ · ผลข้อสอบ x/y · ข้อค้าง+เหตุผล) · ห้าม build/commit/push · ห้ามรัน suite ที่ชี้ `.env` (ทุก qc-*.mts มีด่านหยุดเองแล้ว — เจอ "🔴 หยุด!" ให้ export env ของ `.env.qc`)
