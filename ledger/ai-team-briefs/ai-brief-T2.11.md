# T2.11 — Menu C4 · notification settings C7 · approvers & people C8 (Opus · app lane + 2 small routes)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-C6, R-C12, R-E C24 first. Contract: AI-TEAM-RUN §2 T2.11. Mockups `airy-c.jpg` pages 4, 7, 8 (+ dark). HTML:
- C4: avatar · "คุณสุข · เจ้าของ · 3 กิจการ" · section "กิจการนี้ · The Bean Café": 📦 แพ็กและการใช้งาน (ฟรี · 62%) · 📚 ความรู้ของร้าน (18 รายการ) · 👥 ผู้อนุมัติ & คนในทีม (3 คน) · 🗂 บันทึกการกระทำ · 🔔 การแจ้งเตือน · section "ทั่วไป": 🧾 ใบเสร็จ & ใบกำกับภาษี · 🌐 ภาษาแอป ไทย · 💬 ช่วยเหลือ · "ออกจากระบบ".
- C7: "การแจ้งเตือน · The Bean Café · ตั้งแยกได้ทุกกิจการ" · "แจ้งเมื่อ" rows (⏳ มีงานรออนุมัติ ทันที · 🙋 พนักงานติดปัญหา ทันที · ✅ งานเสร็จ สรุปวันละครั้ง 18:00 · 📦 โควตาใกล้หมด 80%/95% · 📈 รายงานทีมประจำสัปดาห์ ทุกจันทร์ 09:00) · ช่องทาง pills ในแอป/LINE/อีเมล · ห้ามรบกวน 22:00–07:00 + segmented งานด่วนรอเช้า/งานด่วนแจ้งเลย.
- C8: list (ส คุณสุข (คุณ) เจ้าของ · อนุมัติได้ทุกอย่าง · น คุณนิด ผู้จัดการร้าน · ใบเสนอราคา · โพสต์ · สั่งของ ≤ ฿20,000 · บ คุณบอม บัญชี · งานบัญชีเท่านั้น ≤ ฿50,000) · "กฎการอนุมัติ" 3 rows (💸 เกิน ฿20,000 ต้องให้เจ้าของอนุมัติ · ⏰ ไม่มีใครอนุมัติใน 4 ชม. … · 🛑 ยกเลิกงานที่ AI ทำไปแล้ว เฉพาะ…) · "＋ เชิญคนในทีม".

## Verified facts
- Menu today lives in the web (drawer hidden); logout = 2-step in `DrawerBody`; help screen exists (`qc-mobile-help`) — reuse route.
- Push: `PushDevice` + `sendPushToUser(userId, msg, {tenantId})`; `AppNotification` has no type/link → prefs are a new table `AiNotifyPref` (T1.1) read/written by two new routes (server part of this WO): `GET/PUT /api/mobile/team/notify-prefs` (zod `{ events: { pendingApproval: "now"|"off", blocked: "now"|"off", done: { mode: "daily", hour }|"off", quota: { at: [80,95] }|"off", weekly: { weekday, hour }|"off" }, channels: ("APP"|"LINE"|"EMAIL")[], dnd: { from, to, urgent: "wait"|"now" } }`) and `GET /api/mobile/team/people` (members with accepted membership: name initial, role label, approval capabilities derived from `ApprovalPolicy` steps + money threshold + `ai.action.undo` holders; rules rows from the policy (`thresholdSatang`, `APPROVAL_STALE_HOURS`, undo holders)).
- Senders (T1.9 reminders, T3.3 quota, T4.x) consult `AiNotifyPref` via `shouldNotify(userId, tenantId, event, now)` (helper in `src/lib/ai/team/notify.ts`, created here).

## Deliverables
App: `src/components/team/MenuSheet.tsx` (from `ProfileMenuButton`), `app/(app)/settings/{notifications,people}.tsx`; disabled rows "เร็ว ๆ นี้" (ใบเสร็จ), ภาษาแอป read-only "ไทย", ช่วยเหลือ → existing help, "เปิดเว็บหลังร้าน" → `/web`, invite → `/web?path=/app/settings/team` (verify the real path). Server: the two routes + `notify.ts` + `AiNotifyPref` CRUD in `src/lib/ai/team/notify.ts`.
testIDs `menu-<k>`, `menu-logout`, `notif-event-<k>`, `notif-channel-<k>`, `notif-dnd-from/to`, `notif-dnd-urgent-<k>`, `notif-save`, `people-row-<id>`, `people-rule-<k>`, `people-invite`.

## Files you own
App files above; server: `src/lib/ai/team/notify.ts`, `src/app/api/mobile/team/{notify-prefs,people}/route.ts`, docs hunk, inventory, fixtures `t2.11.json`, i18n.

## Acceptance (oracle `qc-ai-t2.11`)
S1 pairs ×3 light/dark · S2 prefs load/save, DND validation · S3 people derived from seed policy · S4 disabled rows don't navigate · S5 logout 2-step · S6 push `data.link` → route · S7 testIDs/i18n · typecheck · residue · S8 (server) X1 + zod + `shouldNotify` respects DND/off. Regressions `qc-push` `qc-mobile-app`.
