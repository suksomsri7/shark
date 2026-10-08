# T2.9 — Hiring wizard B1–B6 + quick hire D3 (Opus · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A11, R-C7 first. Contract: AI-TEAM-RUN §2 T2.9. Mockups `airy-b.jpg` pages 1–6, `airy-d.jpg` page 3 (+ dark). HTML elements per page:
- B1 "ขั้น 1 จาก 4" · title "ตำแหน่ง" + hint · search "ค้นหาตำแหน่ง เช่น ตอบแชท" · category pills ทั้งหมด/ขาย/บริการ/บัญชี/การตลาด · 5 template cards (title · one-line skills) · "＋ สร้างตำแหน่งเอง" · "ถัดไป".
- B2 "ขั้น 2 จาก 4" · "ตัวตน · คุณเอกจะพูดและวางตัวอย่างไร" · name input · เพศ (ผู้ชาย/ผู้หญิง/ไม่ระบุ) · น้ำเสียง (สุภาพ/เป็นกันเอง/ทางการ) · อารมณ์ขัน (ไม่มี/นิดหน่อย/ขี้เล่น) · ความยาวคำตอบ (สั้น/กลาง/ละเอียด) · ภาษา (ไทย/English/中文/+ เพิ่ม) · 💬 ตัวอย่างการพูด card (live) · "ถัดไป".
- B3 "ขั้น 3 จาก 4" · "คู่มือการทำงาน" + hint · 6 cards (🎯 หน้าที่หลัก · ⛔ สิ่งที่ห้ามทำ (+2) · 🙋 เมื่อไหร่ต้องถามคุณ · 🪜 ขั้นตอนทำงาน · ⭐ ตัวอย่างงานที่ดี · 📏 ตัวชี้วัด) · 🎙 พูดอธิบายเอง · 📎 แนบเอกสาร SOP · "ถัดไป".
- B4 editor for "สิ่งที่ห้ามทำ": drag rows ⋮⋮ with − · "＋ เพิ่มข้อ" · "แนะนำจากร้านแบบเดียวกัน" chips (+ ห้ามรับคืนสินค้าเอง …) · "ถ้าลูกค้าขอสิ่งที่ห้าม ให้ตอบว่า" textarea · 🔔 switch "แจ้งคุณทันทีเมื่อลูกค้าขอ" · "บันทึก".
- B5 "ขั้น 4 จาก 4" · "สิทธิ์ & โควตา" · per system row (👥 CRM · 🧾 บัญชี · 📋 บอร์ดงาน · 💬 แชทลูกค้า) segmented ปิด/ดูอย่างเดียว/ร่าง+รออนุมัติ/ทำเองได้ · "เวลาทำงาน ตลอด 24 ชม." · slider "ใช้โควตาได้สูงสุด 25% ต่อเดือน" · note "ไม่มีค่าจ้างเพิ่ม · จ้างได้ไม่จำกัด · ใช้โควตาแพ็กของร้าน" · "จ้างคุณเอก".
- B6 success: ✨ · "คุณเอกเริ่มงานแล้ว" · 3 stats (ระบบที่เข้าได้ · หัวข้อคู่มือ · โควตาสูงสุด) · "ลองสั่งงานแรก" 3 rows · buttons "กลับหน้าทีม" / "สั่งงานแรก".
- D3 quick hire "ขั้น 2 จาก 3": recommended card "แอดมินตอบแชท · แนะนำ" with signal · "ตั้งค่าจากแม่แบบให้แล้ว" rows (🙂 น้องมะลิ · 📖 คู่มือ 6 หัวข้อ · 🔐 แชทลูกค้า ร่าง+รออนุมัติ) each with "แก้" · "ตำแหน่งอื่น" rows · buttons "ปรับละเอียด" / "จ้างเลย".

## Data / API
`GET positions` (+ `recommend`) · `POST persona/sample-speech { persona, positionKey }` · `GET employees/[id]/access` groups (`accessGroupsForUi`) — for a not-yet-hired employee the groups come from `GET positions` (template `skills` + `accessGroups` list in the positions DTO; add to T1.10 addendum) · hire sequence: `POST employees` → `PUT employees/[id]/access` → `POST employees/[id]/manual { source: HIRE }`; on any failure after create → `POST employees/[id]/terminate { confirm, reason: "hire_rollback" }` (API allows terminating a just-created employee without proposals; note) · draft `POST manual/draft` · attachment via existing private upload route (find the mobile-usable upload endpoint used by chat image attach; if only image upload exists, SOP attach = "เร็ว ๆ นี้" disabled + note).

## Deliverables
`app/(app)/hire/{index,persona,manual,manual-[section],access,done}.tsx` + `quick.tsx` (D3) · `src/lib/hire-draft.ts` (zustand-free simple store + AsyncStorage persistence key `shark_hire_draft`) · components `TemplateCard`, `PersonaPicker`, `SampleSpeechCard`, `ManualSectionCard`, `ListEditor` (drag via existing gesture handler), `AccessLevelRow` (AUTO disabled with `team.auto.locked`), `QuotaCapSlider`.
testIDs per element (`hire-step-<n>-next`, `hire-template-<key>`, `hire-custom`, `hire-name`, `hire-gender-<k>`, `hire-tone-<k>`, `hire-humor-<k>`, `hire-length-<k>`, `hire-lang-<k>`, `hire-sample`, `hire-manual-<section>`, `hire-manual-item-<i>-remove`, `hire-manual-add`, `hire-manual-suggest-<i>`, `hire-manual-reply`, `hire-manual-notify`, `hire-manual-save`, `hire-voice`, `hire-attach`, `hire-access-<group>-<level>`, `hire-hours`, `hire-cap`, `hire-submit`, `done-stat-<k>`, `done-task-<i>`, `done-team`, `done-first`, `quick-reco`, `quick-edit-<k>`, `quick-other-<key>`, `quick-detail`, `quick-hire`).

## Acceptance (oracle `qc-ai-t2.9`)
S1 pairs 7 light + B2/B5 dark · S2 B1 search/category/custom · S3 B2 debounce → one API call, text changes · S4 B3→B4 editing state · S5 B5 AUTO disabled, cap bounds 5–100 · S6 hire sequence + rollback on access failure (fixture 500) · S7 B6 stats · S8 D3 quick = 3 calls with template defaults; detail → B1 · S9 draft persists across reload · S10 testIDs/i18n · typecheck · residue. Regression T2.2.

## Controller rulings
- Custom position (`custom`): skips template skills (all OFF by default) and empty manual; the user must set at least one skill ≥ READ to hire.
- Language "+ เพิ่ม" offers ja only (v2 list).
