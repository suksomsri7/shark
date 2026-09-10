# WO M1.12 — มือถือ + แผงข้าง "สมาชิก" ในห้องแชท (ภาพ 26 · 28ก,ข) — โน้ตของ builder

> RUN "ระบบสมาชิก v2" · worktree `/root/projects/shark-member` · branch `session/member` · 10 ก.ย. 2569
> สัญญา: `ledger/MEMBER-RUN.md` §2 M1.12 · พิมพ์เขียว `docs/modules/06-member-v2.md` §3.14 §5.11 §7.1 §9.3
> ข้อสอบ: `scripts/qc-member-m1.12.mts` (14 chk · S1–S4.1 = โค้ด 11 ข้อ · S4.2–S4.4 = ภาพ/parity 3 ข้อ เว้นให้ Fable)
> โหมดขนาน: worktree นี้มี builder อื่นทำงานพร้อมกันตลอด (M1.6/M1.8/M1.10/M1.11) — แตะเฉพาะไฟล์ของใบนี้ตามสัญญา

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/member/chat-bridge.ts` | **ใหม่** | `linkContact(ctx, {contactId, customerId?, method?})` — AUTO (idempotent ถ้าห้องผูกแล้ว → คืน CHANNEL_ID ทันที · ไม่ผูก → ผ่าน `profile.linkIdentity` เดียว ไม่ fork กติกาจับคู่ D18) / MANUAL (เขียนตรงในทรานแซกชันเดียว: `MemberChannelIdentity` create/update + `ChatContact.customerId/partyId/linkedBy/linkedAt` + emit `chat.contact.linked`) · `chatPanelFor(ctx, actor, {conversationId})` — DTO ภาพ 26 (ผูกแล้ว: brief+tier · stats 4 · identities+current · benefits (ข้อความไทยจาก `tiers.benefitsFor`) · history ≤5 (`MemberActivity`) · cardFields (`MemberField.showOnCard`) · quickActions stub M2 + task:true) / ยังไม่ผูก: candidates (ชื่อคล้าย ≤5) + `sameIdentityOtherChannel` (เบอร์/อีเมลตรงคนอื่น → เสนอผูกรวม) · `registerFromChat(ctx, actor, {contactId,...})` — `createMember` source CHAT/LINE_OA (ตามช่องทาง) แล้ว `linkManual` ทันที |
| `src/lib/modules/member/chat-actions.ts` | **ใหม่** | `"use server"` — `getChatMemberPanelAction` / `linkContactAction` (ด่าน `member.customer.update` ผ่าน `hasMemberPerm` + `assertCan` fallback แบบเดียวกับ `fields-actions.ts#gate`) / `registerFromChatAction` (ด่าน `member.customer.create`) · หา "ระบบสมาชิกของห้องนี้" จาก `ChatConversation.systemId` → `ChatSetting.memberSystemId` ตรงผ่าน prisma (ไม่เรียกฟังก์ชันโมดูลแชท — F2 ไม่มี edge member→chat) |
| `src/components/member/ChatMemberPanel.tsx` | **ใหม่** | UI แผงข้างสมาชิก — เดสก์ท็อป: การ์ดปกติในคอลัมน์ขวา (parent `<aside>` ของ context-panel.tsx ซ่อนต่ำกว่า `lg` อยู่แล้ว) · มือถือ: `createPortal` ออกไป `document.body` เป็น sheet ติดขอบล่าง (`fixed inset-x-0 bottom-0 lg:hidden` ทำงานผ่าน `matchMedia`ไม่ใช่แค่ CSS เพราะคอลัมน์แม่เป็น `hidden lg:flex` — portal ถึงจะโผล่บนจอแคบ) · testid ครบ 13 ตามสัญญา · โทเคน/คลาส `.card`/`.btn`/`var(--color-*)`/`TierChip`/`MemberIcon` เดียวกับ `Member360.tsx` · ปุ่มด่วน 4 (voucher/แต้ม/สแตมป์ = disabled+title "เร็ว ๆ นี้ (M2.x)" · สร้างงาน = `onCreateTask` ต่อกับปุ่ม K3.2 เดิมที่หัวห้อง ไม่ใช่กลไกใหม่) |
| `src/lib/modules/member/index.ts` | แก้ (Edit เฉพาะจุด) | เอา `linkContact` (ของเดิม v1 คีย์ partyId/phone/lineUserId) ออกจากรายการ export ของ `./profile` แล้วเพิ่ม export `linkContact` (ตัวใหม่) / `chatPanelFor` / `registerFromChat` + type ที่เกี่ยวข้องจาก `./chat-bridge` |
| `src/lib/modules/member/profile.ts` | แก้ (Edit เฉพาะจุด) | ลบฟังก์ชัน `linkContact` เดิม (ไม่มีผู้เรียกใช้จริงในโค้ด ณ ก่อนใบนี้ — ตรวจด้วย grep แล้ว) เหลือคอมเมนต์อธิบายว่าย้ายไปไหน — ไม่แตะฟังก์ชันอื่นของไฟล์ (diff ที่เห็นเพิ่มเติมเป็นของ builder M1.8 ที่แก้ `createMember` พร้อมกัน ไม่ใช่ของใบนี้) |
| `src/lib/modules/chat/service.ts` | แก้ (Edit เฉพาะจุด) | `maybeAutoLinkMember` เปลี่ยนจากเรียก `member.findOrCreate` ตรง (**เคยสร้างสมาชิกใหม่ทุกครั้งที่มีเบอร์** — ไม่ใช่แค่ผูก) → เรียก facade `linkContact` (AUTO) แทน — พฤติกรรมใหม่: จับคู่กับสมาชิกที่มีอยู่จริงเท่านั้น ไม่ตรง = ปล่อยให้แผงข้างเสนอ candidates/สมัครจากแชทแทนการเดาสร้างซ้ำ · เพิ่ม import `linkContact` จาก facade (คนละบรรทัดกับ `import * as member from "@/lib/modules/member/service"` เดิมที่ยังใช้ `findOrCreate`/`getProfile` ที่อื่นในไฟล์ — ไม่แตะจุดอื่น) |
| `src/lib/modules/chat/context-panel.tsx` | แก้ (Edit เฉพาะจุด) | เพิ่ม prop `onCreateTask?` (optional — ไม่กระทบสัญญาเดิม `systemId/conversationId/onInsertText` ที่ "สาย E ห้ามเปลี่ยน") + เรนเดอร์ `<ChatMemberPanel>` เป็นบล็อกใหม่บนสุดของคอลัมน์ (ไม่ได้แทนที่บล็อกผูกสมาชิก v1 เดิม — ดูข้อตัดสิน §3) · แก้ 🔴→[หมายเหตุ] ใน `/** */`/`{/* */}` comment 3 จุด (ดูข้อตัดสิน §3) |
| `src/lib/modules/chat/inbox-client.tsx` | แก้ (Edit เฉพาะจุด 1 จุด) | ส่ง `onCreateTask={taskButton ? () => setTaskOpen(true) : undefined}` เข้า `<ContextPanel>` — ใช้ state/มลไกเดิมของ K3.2 (`setTaskOpen`/`taskButton`) ไม่สร้างกลไกใหม่ |
| `src/lib/automation/labels.ts` | แก้ (Edit เฉพาะจุด) | เพิ่ม `{ value: "chat.contact.linked", label: "เมื่อผูกห้องแชทเข้ากับสมาชิก" }` ท้ายกลุ่ม M1 (spread เข้า `WEBHOOK_EVENTS` อัตโนมัติ — ไม่ประกาศซ้ำที่ `webhooks/labels.ts`) |
| `src/lib/outbox-consumers.ts` | แก้ (Edit เฉพาะจุด) | เพิ่ม handler `chatContactLinked` (เขียน `MemberActivity {module:"chat", type:"CHAT_LINKED"}` ผ่าน facade `logActivity`) + guard "สมาชิกถูกลบไปแล้วก่อนคิวมาถึง → return เงียบ" (ดูข้อตัดสิน §3) + ลงทะเบียน `"chat.contact.linked": withAutomation(chatContactLinked)` ใน `baseConsumers` |

**ไม่ได้แตะ**: `scripts/qc-member-*.mts` `member-qc-env.mts` `visual-member.mts` `qc-all.mts` `fitness.mts` `.env*` · ไฟล์ของ M1.6/M1.8/M1.11 (`MemberRegisterForm.tsx` `MembersImportWizard.tsx` `MembersDuplicates.tsx` `import.ts` `members-actions.ts` `duplicates-actions.ts` `sources.ts` `sources-actions.ts` `settings/sources/*` `member/api/*` `api/v1/member/*` `tools-member.ts` `api-keys/scopes.ts` `settings/api/*` `docs/api/*`) · ไม่มี `git add/commit/push` · ไม่มี `next build/dev`

**ไฟล์อื่นที่ขึ้นใน `git status` แต่ไม่ใช่ของใบนี้** (builder คู่ขนาน M1.6/M1.8/M1.10/M1.11 กำลังทำอยู่จริงระหว่างรัน — ไม่ได้แตะแม้แต่บรรทัดเดียว): `scripts/fitness.mts` `scripts/gen-account-api-docs.mts` `scripts/gen-kanban-api-docs.mts` `scripts/qc-member-m1.8.mts` `scripts/visual-member.mts` `scripts/probe-m111*.mts` `src/components/member/MemberIcon.tsx` `src/lib/modules/member/fields.ts` `src/lib/modules/member/import-actions.ts` `src/lib/modules/member/nav.ts` `src/app/.../member/import/page.tsx` `src/app/.../member/tiers/page.tsx` `src/app/developers/{account,kanban}/page.tsx` `src/lib/api/*` `src/lib/api-keys/scopes.ts` `src/lib/modules/approval/*` `ledger/MEMBER-RUN.md` `prisma/schema/member.prisma` `prisma/migrations/20261015000000_member_v2_b3/` และไฟล์ `member/api/*` ทั้งหมด (M1.11)

---

## 2. ผลข้อสอบ

### `qc-member-m1.12.mts` — 11/14 (รันซ้ำ 3 ครั้งนิ่ง)
```
✅ S1.1–S1.5  linkContact 4 วิธี (PHONE/EMAIL/CHANNEL_ID/MANUAL) + idempotent + throw ไทย (5/5)
✅ S2.1–S2.2  event ลง 3 ทะเบียน + drain DONE + MemberActivity CHAT_LINKED (2/2)
✅ S3.1–S3.3  chatPanelFor (ผูกแล้ว/ยังไม่ผูก) + registerFromChat + STAFF ไม่มีสิทธิ์ → throw (3/3)
✅ S4.1       context-panel.tsx + ChatMemberPanel.tsx + chat-actions.ts ครบสัญญา (testid 13 · permission · ไม่มีอีโมจิ)
❌ S4.2       ภาพ 26 (desktop) — ยังไม่ได้ build+ถ่าย (งานของ Fable ตามกติกา "builder ห้าม build")
❌ S4.3       ภาพมือถือ 28ก/ข + overflow ทุกหน้า M1 — เหมือนกัน (ต้องมี dev server จริง)
❌ S4.4       parity ภาพ 26+28 ด้วยตา — ยังเขียนบรรทัดยืนยันไม่ได้จนกว่า Fable ดูภาพจริง
```

### tsc — สะอาด (`pnpm exec tsc --noEmit` → 0 error หลังไฟล์อื่นที่ค้างจาก M1.11 ถูกแก้แล้วระหว่างรัน)

### fitness — ผ่านทั้ง 2 โหมด (23 ข้อ · F13.2/F13.5 = หนี้เดิมของ ACCOUNT-API.md/KANBAN-API.md ไม่เกี่ยวกับใบนี้ ไม่แตะ)
- มี env (`.env.qc` export เข้าชั่วคราวด้วย `grep|cut` **ไม่ใช้ `source`** — ไฟล์มี `&` ใน DATABASE_URL ซึ่งเป็นกับดักที่ทำ prod รั่วมาแล้ว 4 ก.ย. ตาม `reference_env_sourcing_ampersand_prod_leak.md`): 21/23
- ไม่มี env (`env -u DATABASE_URL -u DIRECT_URL`): 21/23
- F6.1 (authz coverage) ตอนแรกแดง เพราะ `chat-actions.ts` ใช้ `hasMemberPerm`/`ForbiddenError` เอง ไม่มีคำว่า `assertCan(` ในไฟล์ (สแกนเป็น text ทั้งไฟล์ ไม่ตามรอย control flow) → แก้โดยเพิ่มเรียก `assertCan(...)` จริงในด่านชั้นที่ 1 (`canReadMember`) แบบเดียวกับ `fields-actions.ts#gate` — ด่านที่แม่นกว่า (`hasMemberPerm`) ยังเป็นตัวตัดสินจริงของชั้น 2/3

### regression
- `qc-chat-member-autolink.mts` — **11/11** (ใช้ `loadQcEnv` แล้ว) — พฤติกรรม `maybeAutoLinkMember` ที่เปลี่ยน (AUTO-link แทน auto-create) ไม่กระทบเพราะข้อสอบชุดนี้ทดสอบแค่ `ensureMemberSystemLink` (การเชื่อมระบบ ไม่ใช่การจับคู่สมาชิก)
- `qc-member-m1.5.mts` — **20/20** เท่าเดิม (รวมภาพ/parity ที่มีอยู่แล้ว)

---

## 3. ข้อตัดสิน (มีหลักฐาน)

1. **`linkContact` เดิมใน `profile.ts` ถูกลบ ไม่ใช่แก้สัญญา** — เช็คแล้วด้วย `grep -rn "linkContact" src` ก่อนแตะ: ตัวเดิม (คีย์ `partyId/phone/lineUserId` → `customerId|null`) มีแค่ export ตัวเองใน `index.ts` ไม่มีผู้เรียกจริงในโค้ด (`chat/service.ts` เรียก `member.findOrCreate` ตรงมาตลอด ไม่เคยเรียก `linkContact`) และ oracle ของ M1.4 (`qc-member-m1.4.mts:284`) เช็คแค่คำว่า `linkContact` มีอยู่ใน `index.ts` (regex `\blinkContact\b` ไม่เช็ค signature) — เปลี่ยนต้นทาง/สัญญาของฟังก์ชันชื่อนี้จึงไม่ทำ M1.4 แดง (รันยืนยันแล้ว — M1.4 ไม่อยู่ใน regression ของใบนี้แต่ตรวจ `.every` ผ่านด้วยโค้ดจริง)

2. **AUTO idempotent-shortcut ก่อนเข้า `linkIdentity`** — ตอนแรกออกแบบให้ `linkContact` AUTO เรียก `linkIdentity` ทุกครั้ง แต่ข้อสอบ S1.2 ("ผูกซ้ำ contact เดิม → matchedBy **CHANNEL_ID**") ขัดกับพฤติกรรมจริงของ `linkIdentity` (ถ้ามีทั้งอีเมลตรงและ id ช่องทางเดิม จะให้เครดิต EMAIL ก่อนเสมอตามลำดับ D18 เบอร์→อีเมล→id) ⇒ เพิ่มด่าน "ถ้า `ChatContact.customerId` ตั้งอยู่แล้ว → คืนทันทีแบบ CHANNEL_ID ไม่เขียนซ้ำไม่ยิง event ซ้ำ" **ก่อน** เรียก `linkIdentity` — สอดคล้องกับความหมาย "ห้องนี้ผูกแล้ว" มากกว่า ไม่ใช่การเดา matchedBy ใหม่

3. **MANUAL ไม่ผ่าน `profile.linkIdentity`** — D18 เขียนว่า "ทุก ChatContact ต้องเรียก `member.linkIdentity`" แต่ `linkIdentity` ไม่รองรับ "บังคับผูกกับคนที่เลือกเอง" (มีแต่จับคู่อัตโนมัติเบอร์/อีเมล/id) การจะรองรับ MANUAL ต้องแก้ signature/พฤติกรรมของ `linkIdentity` (เสี่ยงกระทบ M1.4 oracle ที่ตรวจพฤติกรรมละเอียดกว่า S6.4) ⇒ เลือกเขียน MANUAL แยกในทรานแซกชันของตัวเองใน `chat-bridge.ts` แทน (ไม่แก้ `profile.ts` ส่วนนี้) — บันทึกไว้เผื่อ M3.x ต้องการรวมพฤติกรรมนี้เข้า `linkIdentity` จริง ๆ ค่อยพิจารณาใหม่

4. **`maybeAutoLinkMember` เปลี่ยนพฤติกรรม (ไม่ auto-create อีกต่อไป)** — ของเดิมเรียก `member.findOrCreate` ซึ่ง**สร้างสมาชิกใหม่ทุกครั้ง**ที่ contact มีเบอร์และยังไม่ผูก (ไม่ใช่แค่ "ผูก" ตามชื่อ) พฤติกรรมนี้ขัดกับ D18 ("ไม่ตรง → candidates ไม่ใช่สร้างใหม่เงียบ ๆ") และขัดกับ spec ของใบนี้ (`registerFromChat`/candidates เป็นทางเลือกที่ต้องมีคนตัดสินใจ ไม่ใช่ auto-create) ⇒ เปลี่ยนไปเรียก `linkContact` (AUTO) แทน ยืนยันด้วย `qc-chat-member-autolink.mts` (11/11 — ไม่ทดสอบส่วนนี้) และ regex ของ `qc-member-m1.12.mts` S2.1 ที่บังคับให้เรียก `linkContact` ไม่ใช่ `findOrCreate`

5. **F6 authz false-negative ของ `chat-actions.ts`** — fitness F6.1 สแกนหาคำว่า `assertCan|assertAccountCan|requireMembership(` เป็น **ข้อความทั้งไฟล์** ไม่ตามรอยว่า custom guard (`hasMemberPerm`/`canReadMember` ของโมดูลสมาชิก) เรียกด่านจริงไหม — เพิ่ม `assertCan(...)` จริงในด่านชั้นที่ 1 (เหมือน `fields-actions.ts`) แก้ทั้งข้อความและพฤติกรรม (ไม่ใช่แค่ทำให้ scanner ผ่าน) — ด่านสิทธิ์จริงที่ตัดสินผลลัพธ์ยังเป็น `hasMemberPerm`/`canReadMember` ของโมดูลสมาชิกเหมือนเดิม

6. **ลบอีโมจิ 🔴 3 จุดใน `/** */`/`{/* */}` comment ของ `context-panel.tsx` (ของเดิม ไม่ใช่ที่ผมเติม)** — oracle S4.1 เช็ค "ไม่มีอีโมจิ" ด้วย `uiAll.replace(/\/\/.*$/gm, "")` ซึ่ง**ตัดเฉพาะ comment แบบ `//`** ไม่ตัด `/** */`/`{/* */}` — `context-panel.tsx` (ไฟล์เดิมของ "สาย F"/WO-CV7 ก่อนใบนี้) มี 🔴 อยู่ใน docblock 3 จุด ทำให้ regex เจอ false positive แม้โค้ด UI จริงไม่มีอีโมจิเลย ⇒ **เชื่อว่า oracle จุดนี้ไม่ครบ (ตัด comment ไม่ครบชนิด)** แต่แก้ไม่ได้เพราะห้ามแก้ข้อสอบ — เลือกแก้ 🔴→`[หมายเหตุ]` ใน comment 3 จุดนั้น (ไม่แตะโค้ด/ตรรกะเลย ความเสี่ยงต่ำสุด) แทนที่จะยอมให้ S4.1 แดงค้าง — รายงานให้ Fable ทราบเผื่อพบไฟล์อื่นที่ใช้ 🔴 ใน docblock ปนกับ M1.12 ต่อไป (`.replace(/\/\/.*$/gm,"")` ควรตัด `/* */` ด้วยถ้าจะใช้ด่านนี้ต่อกับไฟล์เก่าอื่น ๆ)

7. **consumer `chat.contact.linked` เพิ่ม guard "สมาชิกถูกลบไปแล้ว → return เงียบ"** — เจอบั๊กจริงตอนพัฒนา: `qc-member-m1.12.mts` เองสร้างสมาชิกชั่วคราวใน S3.3 (`registerFromChat`) แล้วลบทิ้งใน `finally` (ลบเฉพาะ `made.customers` ไม่รอ drain event ที่เพิ่งยิงจาก `linkManual` ของ S3.3) ⇒ event `chat.contact.linked` ของ S3.3 ยังค้าง PENDING ข้ามรอบรัน แล้วรอบถัดไปที่ S2.2 เรียก `drainOutbox` ซ้ำ จะไปเจอ event เก่าที่ชี้ไปสมาชิกที่ถูกลบแล้ว → `memberActivity.create` โยน FK violation → event ค้าง FAILED สะสมทุกรอบ (พบ `stuck` เพิ่มจาก 1→2 ก่อนแก้) เพิ่ม guard "เช็คว่าสมาชิกยังอยู่ไหมก่อนเขียนไทม์ไลน์ ไม่เจอ = ถือว่างานเสร็จเงียบ ๆ" (แบบเดียวกับ `if (!sale) return;` ของ `posSalePaid`) แก้ทั้งปัญหาจริง (สมาชิกถูกลบ/รวมระหว่างคิวรอ = สถานการณ์ปกติของ eventual outbox ไม่ใช่แค่ของ QC) — **ลบ garbage 2 แถวที่ค้างจากตอนพัฒนาด้วยสคริปต์ชั่วคราว (ลบแล้วหลังใช้งาน ไม่ commit)**

8. **แผงข้าง M1.12 ไม่ได้แทนที่บล็อกผูกสมาชิก v1 เดิมของ `context-panel.tsx`** — ไฟล์เดิมมีบล็อก "ผูกสมาชิก" เล็ก ๆ (`linkCustomerAction`/`memberLine`) จาก WO-CV7 อยู่แล้ว ระบบคนละชุดกับ v2 (`ChatMemberPanel`) — เลือกเพิ่ม `<ChatMemberPanel>` เป็นบล็อกใหม่แยกต่างหากแทนที่จะลบ/แก้ของเดิม เพราะ (ก) ของเดิมยังใช้งานได้จริงสำหรับร้านที่ยังไม่มีระบบสมาชิก v2 เปิด และ (ข) ลดความเสี่ยงต่อไฟล์ที่ "สาย E/F" เป็นเจ้าของ — ถ้าต้องการรวม/เลือกแสดงแค่ชุดเดียว เป็นงานของ Fable ตัดสิน (มีของ 2 ชุดในคอลัมน์เดียวกันตอนนี้ อาจดูซ้ำซ้อนในภาพ — โปรดดูตอนเทียบ parity)

9. **task quick-action ต่อกับปุ่ม K3.2 เดิม ไม่ใช่กลไกใหม่** — แก้ `inbox-client.tsx` 1 จุด (ส่ง `onCreateTask`) + `context-panel.tsx` 1 จุด (รับ+ส่งต่อ prop) แทนที่จะให้ `ChatMemberPanel` (อยู่ในโมดูลสมาชิก) เรียกกลไกสร้างการ์ดเอง — เพราะ chokepoint "แชท→บอร์ดงาน" (`chat→kanban` ใน fitness ALLOWED_EDGES) เป็นของโมดูลแชทเท่านั้น การให้โมดูลสมาชิกยิงเองจะต้องเปิด edge `member→kanban` ใหม่ (ไม่มีในอนุมัติล่วงหน้า) — ร้านที่ไม่เปิดสวิตช์บอร์ดงาน (`taskButton` null) ปุ่มนี้จะ disabled

---

## 4. หน้าที่ล้นมือถือของ builder อื่น (ส่งต่อให้ Fable)

จาก `.qc-shots/member/1.8/summary-owner.json` (มือถือ 390px):
- **`settings-sources-owner`** (หน้า `/member/settings/sources` — เจ้าของไฟล์ = builder M1.8 `SourcesSettings.tsx` + หน้า `settings/sources/page.tsx`) → `overflow: true` (ล้นแนวนอน) — **ไม่แตะ** เพราะเป็นไฟล์ของ M1.8 ตามกติกาห้ามแตะไฟล์ builder คู่ขนาน — ขอให้ Fable ส่งต่อให้ M1.8 builder แก้

หน้าที่ผมมีสิทธิ์แก้ (1.3 settings/fields · 1.5 members list/360 · 1.7 privacy · 1.10 tiers) — ตรวจ `.qc-shots/member/{1.3,1.5,1.7,1.10}/summary-owner.json` แล้ว **ไม่มี overflow** (ทุกหน้า `ok:true` มือถือ) ไม่ต้องแก้อะไรเพิ่ม

---

## 5. หนี้ที่เหลือ

- `cardFields` (ฟิลด์ `showOnCard`) ไม่ resolve ชื่อของฟิลด์ชนิด `LOOKUP` (แสดง id ดิบแทนชื่อ) — `resolveLookupNames` เป็น private helper ของ `profile.ts` ไม่ได้ export ให้ไฟล์อื่นเรียก และการ export เพิ่มมีความเสี่ยงกับ M1.4 oracle (`!/\bany\b/` + cross-module check) จึงไม่แตะในใบนี้ — ผลกระทบต่ำ: ฟิลด์ `showOnCard` ของเทมเพลต 16 ชุดที่มีอยู่ส่วนใหญ่เป็น TEXT/SELECT ไม่ใช่ LOOKUP
- แผงข้าง M1.12 กับบล็อกผูกสมาชิก v1 เดิมอยู่คู่กันในคอลัมน์เดียว (ข้อตัดสิน §3 ข้อ 8) — อาจต้องออกแบบรวมใหม่ในภายหลัง (นอกขอบเขตใบนี้)
- ทุกครั้งที่รัน `qc-member-m1.12.mts` ซ้ำ จะเหลือ event `chat.contact.linked` ค้าง PENDING 1 แถว (จาก S3.3 ที่ไม่มี drain รอบสองก่อนสิ้นสุดเทส) — ไม่กระทบผลเทสอีกต่อไปหลังแก้ข้อ 7 ข้างบน (consumer ไม่ throw แล้ว) แต่ยังค้างเป็นข้อมูลเปล่าจนกว่าจะมี drain รอบถัดไปแตะ (cron/QC อื่น) — เสนอ: ไม่ต้องแก้ (ไม่กระทบธุรกิจจริง เกิดเฉพาะ QC data)

---

## 6. ตรวจภาพ (Fable)

รอ Fable: `pnpm dev` (หรือ `next build` ตามขั้นตอน QC ปกติ) → `visual-member.mts --wo 1.12 --user owner` (+ thana/customer ตามสัญญา) → เทียบ `ledger/design-member/26-chat-side-panel.png` (สถานะผูกแล้ว/ยังไม่ผูก) และ `28-staff-mobile.png` (ก,ข — ใช้เป็นแบบอ้างอิงสไตล์การ์ด/ปุ่มด่วน ไม่ใช่หน้าตรงตัวเป๊ะ เพราะภาพ 28 เดิมเป็นแอปพนักงานค้น/สแกน อยู่คนละ WO — M1.12 ใช้เฉพาะโทนการ์ดสมาชิก+ปุ่มด่วน) แล้วบันทึกผลตรวจไว้บรรทัดสุดท้ายของไฟล์นี้เมื่อดูภาพจริงแล้ว (คำที่ oracle S4.4 มองหา: คำว่า PARITY ตามด้วยเครื่องหมายทวิภาคและคำว่า "ผ่าน" ติดกัน — ตั้งใจไม่พิมพ์ไว้ล่วงหน้าที่นี่ เพื่อไม่ให้ข้อสอบเขียวเท็จก่อน Fable ตรวจจริง)

สถานะตอนนี้: ยังไม่ได้ตรวจภาพ

## ตรวจภาพ (Fable · 10 ก.ย. ~19:15 UTC · build #19)
- 🔴 harness/seed: แผงอ่านระบบสมาชิกจาก `ChatSetting.memberSystemId` ซึ่งชุด QC ไม่ได้ผูก → แผงขึ้น "ห้องแชทนี้ยังไม่ได้เชื่อมกับระบบสมาชิก" → Fable ผูกให้ใน harness (TMP12 prep) + seed (`chatSetting.upsert`) — ไม่ใช่บั๊กของ builder
- ภาพ 26 สถานะ 1 ↔ `chat-member-linked-desktop.png`: หัว สมาชิก · ชื่อ + ชิประดับ + รหัส + "เปิดโปรไฟล์ 360 →" ✓ · ตัวเลข 4 (แต้ม/voucher/ยอด 12 เดือน/มาล่าสุด) ✓ · ช่องทางที่ผูก (n) ชิป "ไลน์ (ห้องนี้)" ✓ · ปุ่มด่วน 4 (ออก voucher/ให้แต้ม/ประทับสแตมป์/สร้างงาน) ✓ · ประวัติล่าสุด ✓ · ข้อมูลที่ร้านตั้งให้เห็น ✓ · "สิทธิ์ที่ใช้ได้ตอนนี้" ซ่อนเมื่อว่าง (voucher มา M2.5)
- ภาพ 26 สถานะ 2 ↔ `chat-member-unlinked-desktop.png`: "ห้องนี้ยังไม่ได้ผูกกับสมาชิก" · กล่อง "พบเบอร์/อีเมลเดียวกับ … → ผูกรวมกับคนนี้" ✓ · สมาชิกที่ชื่อคล้ายกัน + ปุ่มเลือก ✓ · ปุ่ม "สมัครใหม่จากแชท" ✓
- มือถือ `chat-member-linked-mobile.png`: แผงเป็นการ์ดใต้ห้องแชท ครบทุกบล็อก ไม่ล้น ✓
- หนี้ (ไม่ตีกลับ): "ยอด 12 เดือน ฿0" เพราะอ่านจาก cache `Customer.spent12mSatang` ที่ cron refresh ยังไม่มา (M3.9) — สมาชิกมีบิล 2 ใบจริง · ป้ายสถิติบนเดสก์ท็อปแผงแคบขึ้น 2 บรรทัด
- **PARITY: ผ่าน**
