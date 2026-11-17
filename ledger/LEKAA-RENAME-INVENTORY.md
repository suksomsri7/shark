# LEKAA RENAME — inventory "Shark" → เลขา / Lekaa (17 พ.ย. 2569)

เจ้าของสั่ง: ผู้ช่วย AI / แอปที่ผู้ใช้หรือลูกค้าของร้านเห็นว่า "Shark" → ข้อความไทย **เลขา** · อังกฤษ **Lekaa** ·
"Lekaa" ในประโยคไทยก็เปลี่ยนเป็น เลขา · แบรนด์แพลตฟอร์ม SHARK / shark.in.th และของเชิงเทคนิค **คงไว้**

วิธีนับ: `grep -rIn -E 'Shark|Lekaa'` (ตรงตัวพิมพ์) ใน `src/ apps/mobile/ prisma/ docs/ scripts/` (ไม่รวม node_modules) ·
แยกบรรทัดในคอมเมนต์ออก · ตัดตัวระบุเชิงเทคนิค (`X-Shark-*`, `SharkApp`, `SharkTopBar`, `SharkCustomer`, `SharkSettings`,
`SharkSection`, `verifySharkSignature`, `outsideShark`, `Lekaa*`/`useLekaa*`/`LEKAA_*`, `not_lekaa`) ·
+ ตรวจ `SHARK` ตัวใหญ่ที่อยู่ใกล้คำ AI/ผู้ช่วย/แอป เพิ่ม · ไม่มีคำทับศัพท์ ชาร์ค/ชาร์ก ในโค้ด

## ก่อนแก้ (b0bb477fb)

| พื้นที่ | บรรทัดที่มี Shark | บรรทัดที่มี Lekaa | บรรทัดโค้ด (ไม่ใช่คอมเมนต์ · ไม่ใช่ตัวระบุ) |
|---|---|---|---|
| `src/` (เว็บ + เซิร์ฟเวอร์) | 139 | ~60 | 15 |
| `apps/mobile/` (แอป + qc) | 303 | ~190 | 330 (ส่วนใหญ่ fixture/ผลรอบเก่าใน qc/) |
| `prisma/` | 5 | 0 | 2 (`@default("Shark")` + migration) |
| `docs/` | 94 | 0 | 33 |
| `scripts/` (QC) | 144 | ~5 | 42 |

## เปลี่ยนแล้ว (นับเป็นสตริง)

| พื้นที่ | คอมมิต | ไฟล์ · จำนวน |
|---|---|---|
| แอป i18n | c5ba2ab0e + 3d7d3541d | `src/i18n/th.ts` 22 · `en.ts` 9 · `cal-th.ts` 2 · `locales/th.json` 7 (InfoPlist ไทย) · ชื่อเลขาปริยาย `DEFAULT_SECRETARY_NAME` "Shark"→"เลขา" + `secretaryNameOf` (อ่านชื่อปริยายเดิมเป็นชื่อใหม่) ใน `src/api/secretary.ts` · `onboarding/name.tsx` · `settings/secretary.tsx` · `i18n/index.ts` (ยุบ "เลขา เลขา" · อังกฤษชื่อปริยายแสดง "Lekaa") |
| เว็บ | 57e2cecfa | `src/app/use-app/page.tsx` 2 (ไทย "แอปเลขา" · อังกฤษคง Lekaa) |
| เซิร์ฟเวอร์ + prompt | 3b0d235b6 | `ai/secretary/chat-send.ts` 2 (ชื่อผู้ส่ง "เลขา (ผู้ช่วย AI)" · บรรทัดลงท้าย) · `chat/after-hours.ts` 5 (disclosure ปริยาย · ตัวอย่างใน error · เหตุ unknown · push ส่งต่อคน · note การใช้เครดิต) + อ่านทน disclosure ปริยายเดิม · `ai/secretary/identity.ts` ชื่อปริยาย + อ่านทนชื่อ "Shark" · `secretary.ts` ใส่ชื่อปริยายเองตอนสร้างแถว · `ai/persona.ts` 1 · `ai/tools.ts` 2 · `ai/proposals.ts` 1 · `team-chat/notify.ts` 1 · `team-chat/service.ts` 1 · สคริปต์ `scripts/lekaa-rename-db.mts` |
| QC / fixture / เอกสาร | 07a3deed5 | ข้อสอบ 7 ไฟล์ (s1.12 s1.22 s1.2 s3a.1 s1.6 sec-real b27-chat-ai) · fixture แอป 33 ไฟล์ (131 จุด: ชื่อเลขา · disclosure · ลงชื่อ · พรีวิว) · สเปก qc-sec-specs 3 · `sec-ui-inventory.json` 3 · `docs/legal/secretary-ai-disclosure.md` 11 · `docs/modules/31-secretary.md` ~25 |

## คงไว้ (keep)

**เชิงเทคนิค** (ไม่แตะ): ส่วนหัว `X-Shark-System/Event/Event-Id/Signature/Signature-V2/Timestamp/Widget/Guest` (~60 จุดใน src/lib/modules/*/api, webhooks, developers pages, openapi) ·
UA `SharkApp` `SharkTopBar` `SharkCustomer` (`src/proxy.ts:33`, `src/lib/ui/use-in-app.ts`, `IssueReportSheet.tsx:47`, `issue-actions.ts:21`, `sys/[id]/page.tsx:67`, `apps/mobile/app/(app)/index.tsx:188`) ·
ตัวระบุ `SharkSettings` `SharkSection` `verifySharkSignature` `outsideShark` `askShark` (`customers/[id]/info.tsx:200`, `qc/buttons-sec.json:5079`) คีย์ i18n `cust.info.askShark`/`inShark` ·
`LekaaFab*` `LekaaLoader` `LekaaLogo` `useLekaa*` `LEKAA_*` `not_lekaa` · `handleSharkWebhook` ในตัวอย่างโค้ด docs/api + gen-*-api-docs ·
`prisma/schema/secretary.prisma:227 @default("Shark")` + `migrations/20261227000000_secretary_a/migration.sql:227` (ห้าม migration — โค้ดใส่ชื่อเองแล้ว) · `scripts/qc-sec-s1.1.mts:82` (ตรวจสคีมาคอลัมน์ ซึ่งไม่เปลี่ยน) ·
`scripts/pending/**` (โดเมน shark.in.th) · ค่าคงที่ `LEGACY_*` / สคริปต์ย้ายค่า (ต้องอ้างคำเดิม) · คอมเมนต์ประวัติในโค้ด (~160 บรรทัด)

**แบรนด์แพลตฟอร์ม**: `apps/mobile/src/i18n/th.ts:935` "ในระบบ SHARK" / `en.ts:933` "In SHARK" · "SHARK" ใน persona headline (`identity.ts` "บนแพลตฟอร์ม SHARK (shark.in.th)", `persona.ts:149`, `interview.ts:26`) · `support-ai.ts:16` · `tools.ts` "แจ้งทีมงาน SHARK" · `hotel-mail.ts:116` · CRM "กล่อง SHARK" · `src/app/manifest.ts:6` · หน้า marketing support/terms · "ไม่ส่งข้อมูลลูกค้าออกนอก SHARK" · "SHARK HUB" ใน docs/legal

**ผลรอบเก่า**: `apps/mobile/qc/shots-sec/**` (104 บรรทัด — summary/result ของรอบตรวจที่ผ่านมา ไม่ใช่ข้อสอบ)

**Lekaa ที่ถูกแล้ว** (อังกฤษ): `apps/mobile/locales/en.json` · `en.ts` · `cal-en.ts` · `use-app` บรรทัดอังกฤษ · `app.json:3` ชื่อแอป

## กำกวม — รอเจ้าของตัดสิน (ไม่ได้แก้)

| ไฟล์:บรรทัด | สตริง | เหตุ |
|---|---|---|
| `src/components/app-shell/Topbar.tsx:133-134` | aria-label/title `"SHARK AI"` | ปุ่ม AI บนเว็บ — ชื่อผู้ช่วย หรือ "AI ของ SHARK"? |
| `src/app/(marketing)/privacy/page.tsx:48` | "เพื่อปรับปรุงคุณภาพของเลขา SHARK …" | "เลขาของ SHARK" (แบรนด์) — คงไว้ |
| `src/app/app/sys/[id]/account/documents/inbox/page.tsx:171` | "ถ่ายรูปบิลผ่านแอป SHARK แล้วอัปโหลด" | แอปมือถือ (ตอนนี้ชื่อ Lekaa) vs แบรนด์ |
| `src/app/(marketing)/account-deletion/page.tsx:45,48,68,71` | "ในแอป SHARK" / "เปิดแอป SHARK" | เหมือนข้างบน (หน้า legal/สโตร์) |
| `src/app/developers/kanban/page.tsx:511` | "กดยืนยันในแอป SHARK ก่อน" | เหมือนข้างบน |
| `src/app/developers/account/page.tsx:419` | "…SHARK app before anything changes" | เหมือนข้างบน |
| `src/components/branding/BrandingSettings.tsx:427` | "ใช้ธีมนี้กับแอปมือถือ SHARK HUB" | ชื่อแอปเดิม SHARK HUB |
| `src/messages/en/pos.json:681` | "notified on the SHARK approvals page" | หน้าอนุมัติ (ในแอปเลขา?) vs แพลตฟอร์ม |
| `apps/mobile/app.json:61,62,75` | "Lekaa ใช้ปฏิทิน…" / "Lekaa ไม่ได้ใช้…" / "Lekaa ใช้รายชื่อ…" | ข้อความขอสิทธิ์ภาษาไทยใน app.json (สั่งห้ามแตะ app.json) — เครื่องภาษาไทยใช้ `locales/th.json` ที่แก้แล้ว |
| `apps/mobile/src/i18n/cal-th.ts:160` | "เปิดได้ที่ การตั้งค่า › Lekaa › ปฏิทิน" | เส้นทางในแอปตั้งค่า iOS แสดงชื่อแอปจริง "Lekaa" — ถ้าเปลี่ยนจะหาไม่เจอ |
| `apps/mobile/app/login.tsx:273` | ตัวอักษร "Lekaa" ใต้โลโก้หน้าเข้าสู่ระบบ | เวิร์ดมาร์ก/โลโก้ (ทุกภาษา) |
| `apps/mobile/RELEASE-NOTES-2.0.md:10,15,29,30,40,48,49` | "เลขา AI \"Shark\"…" / "Shark drafts replies…" | บันทึกรุ่น 2.0 สำหรับสโตร์ (metadata · ส่งไปแล้ว) |

**แก้แล้วแต่ขอให้ดู**: ข้อความชวนดาวน์โหลดตอนนี้เขียน "แอปเลขา" (ชื่อบน App Store คือ "Lekaa"): `th.ts` team.add.shareMsg / team.menu.addSub / team.add.notFound ·
`src/app/use-app/page.tsx` · push `team-chat/notify.ts` "เพิ่มคุณเข้าทีมในแอปเลขา" · ชื่อเลขาปริยายที่เก็บในฐาน = "เลขา" (คำไทย) — จอภาษาอังกฤษแสดง "Lekaa" เฉพาะผ่านแม่แบบ `{name}`; ช่องแก้ชื่อในตั้งค่าแสดง "เลขา"

## ข้อมูลในฐาน

คอลัมน์ที่อาจเก็บคำเดิม: `AiSecretary.name` ("Shark" จากค่าปริยาย/หน้าตั้งชื่อครั้งแรก) · `AiSettings.aiDisclosure` (ข้อความปริยายเดิม) — ย้ายด้วย `scripts/lekaa-rename-db.mts` (dry-run ปริยาย · `--apply` เขียน) ·
ประวัติที่ไม่แตะ: `ChatMessage.senderName`/`body` (ข้อความที่ส่งถึงลูกค้าแล้ว) · `ChatConversation.lastMessagePreview` · `AiCreditTxn.note`
โค้ดอ่านทนแล้ว: `identityOf` (ชื่อ "Shark" = ปริยายใหม่) · `afterHoursSettings.cleanDisclosure` (disclosure ปริยายเดิม = ปริยายใหม่) · แอป `secretaryNameOf`
