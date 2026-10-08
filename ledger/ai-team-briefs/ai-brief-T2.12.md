# T2.12 — First-run D1/D2 + approver view D8 (Opus · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A5, R-C6 first. Contract: AI-TEAM-RUN §2 T2.12. Mockups `airy-d.jpg` pages 1, 2, 8 (+ dark D8). HTML:
- D1: hero "ทีมพนักงาน AI ของร้านคุณ · สั่งงานด้วยการพิมพ์หรือพูด คุณแค่ตรวจและอนุมัติ" · 3 value rows (⚡ เริ่มงานได้ทันที · 🧠 ความรู้อยู่กับร้าน · ✅ คุณคุมทุกอย่าง) · CTA "เริ่มใช้ฟรี" (+ sub-line about the free pack **without a task count**) · "มีบัญชี SHARK แล้ว · เข้าสู่ระบบ".
- D2 "ขั้น 1 จาก 3": ชื่อกิจการ input · ประเภท pills (คาเฟ่·ร้านอาหาร / ค้าปลีก / บริการ / ที่พัก·ท่องเที่ยว / อื่น ๆ) · "เชื่อมต่อ" rows (💬 LINE OA ✓ เชื่อมแล้ว · 📘 Facebook·Instagram เชื่อม · 📦 สินค้า & ราคา เพิ่ม) · "ข้ามได้ · เชื่อมเพิ่มทีหลังในเมนู" · "ถัดไป".
- D8: header "The Bean Café · คุณนิด · ผู้อนุมัติ · วันนี้อนุมัติ 12 · ตีกลับ 1" · tabs รอตรวจ 3 / ตรวจแล้ว / สั่งงาน AI · cards with ✓/⚠ lines (✓ ราคาส่ง · ส่วนลดอยู่ในนโยบาย / ⚠ แพงกว่าครั้งก่อน 12% / ⚠ เสนอคูปองชดเชย ฿50) · buttons ดู / ตีกลับ / อนุมัติและ… · footer "เกิน ฿20,000 ระบบส่งต่อให้เจ้าของอัตโนมัติ".

## Verified facts
- Login/OTP flow `app/login.tsx`; tenant creation `app/dna.tsx` (`POST tenants` + DNA interview + apply); `Gate` routes no-tenant users to `/dna`. D1 is shown **before** login when the app has no token (replaces the plain login landing only when a build flag `AI_TEAM_ONBOARDING=1` — default on for v2 builds; 1.0 users never see it because they have tokens).
- Connections (LINE/FB/products) are web pages — open in `/web?path=…` (R-C6); the real paths: find `/app/settings/chat` (LINE/FB connect) and inventory import page; write them in notes.
- `viewerRole` from `GET /api/mobile/me` (T1.10): APPROVER when not OWNER and can confirm money/customer kinds.

## Deliverables
`app/onboarding/{index,business}.tsx` (D1, D2 — D2 collects name + type → `POST tenants { name }` then stores type in `AiSettings.businessType`? **no new column** → pass `type` to the DNA facts if the DNA interview supports a "business type" fact, else keep it client-side for template recommendation only and note) → `/hire/quick` (D3) → `/` · `app/(app)/inbox/approver.tsx` or a mode of the inbox screen: when `viewerRole === "APPROVER"` the home route renders the approver view (tabs รอตรวจ = inbox rows of this tenant, ตรวจแล้ว = `GET inbox?decided=1&today=1` (addendum to T1.10: `decided` listing from `AiActionLog`), สั่งงาน AI = the normal team list) · ✓/⚠ lines from `riskTags` (✓ when none) · footer from `GET people` rules (threshold).
testIDs `onb-cta`, `onb-login`, `onb-name`, `onb-type-<k>`, `onb-connect-<k>`, `onb-skip`, `onb-next`, `appr-tab-<k>`, `appr-card-<id>`, `appr-view/reject/approve-<id>`.

## Acceptance (oracle `qc-ai-t2.12`)
S1 pairs D1/D2/D8 (+ dark D8) · S2 D1 has no digit followed by "งาน" (static grep on i18n keys used) · S3 D2 → POST tenants, skip → D3 · S4 D8 only for APPROVER; OWNER sees A1 · S5 ตรวจแล้ว tab = today's decided fixture · S6 ⚠ from riskTags · S7 connect rows open `/web` with the right path · S8 testIDs/i18n · typecheck · residue · S9 login screenshots unchanged. Regression `qc-mobile-auth`, T2.8.
