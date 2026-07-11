# ระบบ 11 — Meeting (แชทภายในองค์กร — ออกแบบให้เหมือน Slack)

> 🔄 REWRITE ตามความต้องการเจ้าของ 2026-07-11: **"ออกแบบให้เหมือน Slack ใช้ภายในองค์กร"** — override สเปคฉบับก่อนหน้า (ฉบับ tenant-scoped + นัดประชุม/RSVP) ทั้งไฟล์
> ยึด: `../BLUEPRINT_SYSTEMS.md` (FINAL — "ทุกอย่างคือระบบ") · `_CONVENTIONS.md` · ทะเบียน `src/lib/systems.ts` (`MEETING`, kind: feature)
> scope: **system** — Meeting 1 ชุด = `AppSystem` 1 แถว (**MeetingWorkspace = AppSystem**) — ทุกตารางมี `systemId` (_CONVENTIONS §1 ที่เขียนว่า tenant ถูก override โดย BLUEPRINT_SYSTEMS §5)
> คู่แฝดคนละตัว: ระบบ 10 Chat = แชทกับ**ลูกค้า** — คนละ inbox คนละ data model **ห้ามปนกันเด็ดขาด** (ตารางเทียบ §1.4)

---

## 1. ภาพรวม + ขอบเขต

### 1.1 ทำอะไร (v1)

Meeting คือ **Slack ฉบับ SME ไทย ภายในองค์กร** — workspace สื่อสารของทีมงาน ใช้ identity `User`/`Membership` เดิมของแพลตฟอร์ม ไม่ต้องสมัครอะไรเพิ่ม:

- **Workspace** = ระบบ Meeting 1 ชุด (`AppSystem` type `MEETING`) — องค์กรส่วนใหญ่สร้าง 1 ชุดใช้ร่วมกันทั้งบริษัท แต่**สร้างหลายชุดได้** (เช่นแยก workspace ทีมครัวกับทีมออฟฟิศ) ตามหลัก "ทุกอย่างคือระบบ"
- **Channel แบบ Slack**: `#public` (ทุกคน browse + join เองได้), `🔒 private` (invite เท่านั้น มองไม่เห็นจากคนนอก), **DM 1:1**, **Group DM** (3–9 คน) — เปิด workspace ปุ๊บมี **`#general` อัตโนมัติ** ที่ทุกคน join และออกไม่ได้
- **Threads** — ตอบเป็นเธรดใต้ข้อความ (หัวใจของ Slack): เธรดไม่รกหน้าห้อง, มีจอ "เธรดของฉัน", ติดตาม/เลิกติดตามเธรดได้
- Mention `@user` / `@channel` / `@here`, **emoji reactions**, **pin** ต่อ channel, **saved items** (bookmark ส่วนตัว), แก้ไข (ป้าย "แก้ไขแล้ว") / ลบข้อความ (tombstone), **markdown พื้นฐาน + code block**, **link preview** (ลิงก์ภายในระบบอื่น + OG ภายนอก)
- **ค้นหา** ข้อความ / ไฟล์ / คน (Postgres FTS + `pg_trgm` สำหรับไทย) เฉพาะ channel ที่ตนเป็นสมาชิก + quick switcher (Cmd/Ctrl+K)
- ไฟล์แนบผ่าน upload service กลาง + **แกลเลอรีไฟล์ต่อ channel**, typing indicator, **presence** (online/away/offline), unread badge ต่อ channel + เส้นคั่น **"จุดที่อ่านล่าสุด"**
- **Integration ขาเข้า — จุด "ทุกระบบเชื่อมถึงกัน"**: ระบบ business/feature อื่นในองค์กร post แจ้งเตือนเข้า channel ที่เลือก เช่น "🔔 มีจองใหม่ คุณสมชาย พรุ่งนี้ 14:00" จากระบบจองคิว, "🧾 ปิดบิล 1,250.-" จาก POS (§3.12, §8.2)
- Realtime **SSE** ทั้งหมด (ข้อความ/typing/presence/badge), ประวัติเก็บ**ถาวร** (ไม่มี retention purge — ต่างจาก Chat)

### 1.2 ไม่ทำอะไร (v1) — ประกาศชัดกันหลง

| เรื่อง | สถานะ | หมายเหตุ |
|---|---|---|
| **Huddle / voice / video call ในตัว** | 🔜 **ระบุชัด: v1 ไม่มีโดยเจตนา** — ใช้วิธีแปะลิงก์ Google Meet/Zoom ในห้อง ระบบ render เป็น "การ์ดสาย 📞 + ปุ่มเข้าร่วม" ให้ (§3.13) | โครงรองรับ: `MeetingMessage.embeds` kind `CALL_LINK` — เพิ่ม huddle ภายหลังไม่แก้ schema |
| Workflow builder (form/อนุมัติ/automation ในแชท) | 🔜 | ต่อยอดจากโครง `MeetingIntegration` |
| App directory / bot ภายนอก / slash command | 🔜 | v1 มีเฉพาะ integration ขาเข้าจากระบบใน SHARK ด้วยกัน |
| Web push notification | 🔜 | v1 มี in-app (SSE + badge) + EMAIL digest ผ่าน contract 2.5 |
| นัดประชุม + RSVP (ของสเปคเดิม) | 🔜 | ตัดออกจาก v1 — โฟกัส Slack core ก่อน; ระหว่างนี้โพสต์นัดเป็นข้อความ + แปะลิงก์ Meet |
| Export transcript / compliance tools | 🔜 | |
| Guest ภายนอก / ลูกค้าเข้า workspace | ❌ ตลอดไป | ลูกค้า = ระบบ 10 Chat เท่านั้น |
| ส่งข้อความหาลูกค้า / bridge ไประบบ 10 | ❌ | ห้ามทุกชั้น |

### 1.3 Scope แบบ "ระบบ" (BLUEPRINT_SYSTEMS)

- Meeting เป็น **feature system** → เก็บเป็น `AppSystem` (type `MEETING`) — **workspace ก็คือแถว AppSystem นั้นเอง** ไม่มีตาราง workspace แยก (ชื่อ workspace = `AppSystem.name`, ตั้งค่า = `AppSystem.settings.meeting.*`)
- **ทุกตารางของระบบนี้มี `tenantId + systemId`** — unique = `@@unique([systemId, ...])` · องค์กรที่มี 2 workspace = ข้อมูลแยกขาดกันโดย `systemId`
- **สมาชิก workspace = ทีมงาน** (`User` ที่มี `Membership` ของ tenant) — **ไม่ใช่ลูกค้า/Member** เด็ดขาด
- การเชื่อมกับระบบอื่น (integration ขาเข้า §3.12) เป็น **opt-in ผ่านตาราง link ของระบบนี้เอง** (`MeetingIntegration`) ตาม BLUEPRINT_SYSTEMS §3 — ไม่เชื่อม = Meeting ทำงาน standalone ครบทุกฟีเจอร์

### 1.4 ความต่างจาก Chat (ระบบ 10) — ห้ามปน

| | **11 Meeting** | **10 Chat** |
|---|---|---|
| คู่สนทนา | staff ↔ staff (User ใน tenant) | ลูกค้า ↔ ทีมร้าน |
| หน่วยข้อมูล | `MeetingChannel` ถาวร ไม่มีสถานะงาน/SLA | `ChatConversation` มี OPEN/PENDING/RESOLVED + SLA |
| scope | system (`systemId` ของ AppSystem MEETING) | system (AppSystem CHAT) |
| ตาราง | prefix `Meeting*` | prefix `Chat*` |
| Retention | **ถาวร** | purge ตาม setting |
| UI / SSE | `/app/sys/[systemId]` · `/api/meeting/[systemId]/stream` | `/app/sys/[systemId]` (ของ CHAT) · `/api/chat/.../stream` |

จุดเชื่อมเดียวที่อนุญาต: วาง**ลิงก์** conversation ลูกค้าใน Meeting → preview แบบ title-only ("💬 แชทลูกค้า #a1b2") ไม่ leak เนื้อหา — คนกดต้องมีสิทธิ์ระบบ Chat เองถึงเปิดอ่านได้

---

## 2. Persona & User Stories

| Persona | เกี่ยวข้องอย่างไร |
|---|---|
| **Owner** | สร้าง workspace, เป็น workspace OWNER, ตั้งค่า/integration, เห็นทุก channel PUBLIC |
| **Manager** | มักได้ workspace ADMIN, สร้าง channel ทีมตน, ดูแล channel ที่ตนเป็น channel admin, ต่อ integration |
| **Staff** | สมาชิก workspace: คุยใน channel, เปิดเธรด, DM, react, ค้นหา, save ข้อความ |
| **Customer** | ❌ ไม่เกี่ยวข้องเด็ดขาด |

User stories หลัก:

1. **Owner:** "ฉันเปิดระบบ Meeting ปุ๊บ ทีมทุกคนอยู่ใน `#general` ทันที ฉันโพสต์ 'ปรับเวลาเปิดร้านช่วงสงกรานต์' แล้วปักหมุดไว้ — ใครเข้ามาใหม่ก็เห็นใน pins"
2. **Manager:** "ฉันสร้าง `#แม่บ้าน-โรงแรม-a` เป็น public channel — น้องใหม่กด browse channels แล้ว join เองได้ ไม่ต้องเชิญทีละคน ส่วน `#เงินเดือน` ฉันตั้งเป็น 🔒 private เฉพาะฝ่ายบุคคล"
3. **Staff:** "ใน `#จัดซื้อ` มีคนถามราคา ฉัน**ตอบในเธรด**ใต้ข้อความนั้น — คุยกัน 20 ข้อความก็ไม่รกหน้าห้อง คนที่เกี่ยวติดตามเธรดได้ badge เอง"
4. **Staff:** "หัวหน้า `@เมย์` ฉันในเธรด ฉันได้ badge เด้ง กดจากจอ 'เธรดของฉัน' ไปตอบต่อได้เลย เสร็จแล้วฉันกด 👍 react แทนการพิมพ์ 'รับทราบ'"
5. **Manager:** "ฉันต่อ integration: ระบบจองคิวสาขา A → post เข้า `#จอง-สาขา-a` ทุกครั้งที่มีจองใหม่/ยกเลิก — ทีมเห็นพร้อมกันไม่ต้องเปิดจอจอง"
6. **Staff:** "ฉันค้น 'รหัสตู้เซฟ' เจอข้อความปีที่แล้วใน channel ที่ฉันอยู่ — ห้อง private ที่ฉันไม่ได้อยู่ ค้นไม่เจอ · ฉันค้นชื่อไฟล์ 'ใบเสนอราคา' เจอในแท็บไฟล์"
7. **Staff:** "ฉันวางลิงก์การ์ด Kanban 'ซ่อมแอร์ 204' — ขึ้นเป็นการ์ดชื่องาน/คอลัมน์/ผู้รับผิดชอบในแชทเลย"
8. **Staff (มือถือ):** "เปิดจากมือถือ: จอแรกเป็นรายการ channel ตัวหนา = ยังไม่อ่าน แตะเข้าห้อง แตะข้อความเปิดเธรดเต็มจอ พิมพ์ลื่นเหมือน LINE"
9. **Owner:** "จะประชุมด่วน ฉันแปะลิงก์ Google Meet ใน `#general` — ขึ้นเป็นการ์ด 📞 ปุ่ม 'เข้าร่วม' ทุกคนกดเข้าได้เลย (v1 ยังไม่มี huddle ในตัว)"

---

## 3. ฟังก์ชันทั้งหมด (MVP ✅ / Phase ถัดไป 🔜)

### 3.1 Workspace (= AppSystem)
- ✅ สร้างจาก `/app/settings/systems` เหมือนระบบอื่น (ตั้งชื่อ เช่น "ทีมสยามดำน้ำ") — สร้างได้หลายชุด
- ✅ ตอนสร้าง: auto-สร้าง `#general` (isDefault) + เพิ่ม staff ทุกคนที่มี Membership เป็น `MeetingWorkspaceMember` (ผู้สร้าง = workspace OWNER, ที่เหลือ MEMBER)
- ✅ setting `autoAddNewStaff` (default `true`): staff ใหม่ของ tenant → เข้า workspace + `#general` อัตโนมัติ — ปิดได้สำหรับ workspace เฉพาะทีม (แล้วเชิญมือ)
- ✅ จัดการสมาชิก workspace: เชิญ/ถอด/เปลี่ยน role (OWNER/ADMIN/MEMBER) — ถอดจาก workspace = leftAt ทุก channel ในนั้น
- ✅ settings: ชื่อ, `editWindowMinutes` (0 = แก้ข้อความได้ตลอด — default), `fileQuotaMb` (ตามแผน tenant), integration list
- 🔜 custom emoji ต่อ workspace, workspace icon

### 3.2 Channels แบบ Slack
- ✅ 4 ประเภท: `PUBLIC` (# — staff ใน workspace browse + join เองได้) · `PRIVATE` (🔒 — invite เท่านั้น คนนอกมองไม่เห็นแม้รู้ชื่อ) · `DM` (1:1) · `GROUP_DM` (3–9 คน)
- ✅ channel มี **name + topic + description** (topic = บรรทัดสั้นบน header แบบ Slack, แก้ได้โดยสมาชิก; description = อธิบายยาว) — ชื่อไทย/อังกฤษได้ ห้ามซ้ำใน workspace
- ✅ `#general` default: auto-join สมาชิก workspace ทุกคน, **leave/archive ไม่ได้**, เปลี่ยนชื่อได้
- ✅ `postingPolicy` ต่อ channel: `EVERYONE` (default) / `ADMINS_ONLY` — ทำ "ห้องประกาศ" แบบ Slack (ไม่มี type แยก)
- ✅ ผูกหน่วยธุรกิจ (`unitId?` optional) + `autoJoinByUnit`: staff ที่มี unitAccess หน่วยนั้น join อัตโนมัติ (sync เมื่อ unitAccess เปลี่ยน §7.7)
- ✅ Browse channels: directory ของ PUBLIC channel ทั้งหมด (ชื่อ+topic+จำนวนสมาชิก+ปุ่ม join)
- ✅ DM: find-or-create จากคู่ userId (`dmKey` กันซ้ำ) — ปิด/ลบไม่ได้ แค่ซ่อนจาก sidebar · Group DM: สร้างใหม่ต่อชุดคน, แปลงเป็น private channel ได้ 🔜
- ✅ จัดการ: เปลี่ยนชื่อ/topic/description, เปลี่ยน PUBLIC↔PRIVATE (PRIVATE→PUBLIC ต้อง channel admin + เตือนชัด), archive (read-only, ยังค้นเจอ, unarchive ได้), เชิญ/ถอดสมาชิก
- ✅ **ลบ channel = archive เท่านั้นใน v1** (ประวัติถาวร) — hard delete 🔜 พร้อมเครื่องมือ compliance (§11.3)
- 🔜 section จัดกลุ่ม channel ใน sidebar เอง, channel ข้าม workspace (ไม่มีแผน)

### 3.3 ข้อความ + Markdown + แก้/ลบ
- ✅ ตัวอักษร ≤ 8,000, **markdown พื้นฐาน**: `*หนา*` `_เอียง_` `~ขีดฆ่า~` `` `inline code` `` — ` ```code block``` ` (monospace + ปุ่ม copy), `> quote`, bullet/numbered list, ลิงก์ auto-detect
- ✅ แก้ไขข้อความตัวเอง (ตาม `editWindowMinutes`, default ไม่จำกัด) → ป้าย "แก้ไขแล้ว" + `editedAt`; re-parse mentions/embeds (§11.5)
- ✅ ลบข้อความตัวเอง = soft delete → tombstone "ข้อความถูกลบ" (ไฟล์แนบลบจาก storage จริง); channel admin ลบของคนอื่นได้ (ลง AuditLog)
- ✅ System message (เข้า/ออก/เปลี่ยนชื่อ channel/pin) แบบเส้นกลางจอ · Integration message (การ์ดจากระบบอื่น §3.12)
- ✅ idempotency ด้วย `clientMessageId` (retry/สองแท็บไม่เบิ้ล)
- 🔜 forward ข้อความข้าม channel, voice note, scheduled send

### 3.4 Threads (หัวใจ Slack)
- ✅ ทุกข้อความใน channel เปิดเธรดได้: reply ผูก `threadRootId` → **ไม่แสดงใน main pane** (root แสดงแถบ "💬 n ตอบกลับ · ล่าสุด 5 นาทีก่อน" + avatar ผู้ตอบ)
- ✅ **Thread pane ขวา** (desktop) / เต็มจอ (mobile): root + replies เรียงเวลา, composer ของเธรดเอง
- ✅ checkbox **"ส่งเข้าห้องด้วย"** (also send to channel) — reply โผล่ทั้งเธรดและ main pane แบบ Slack
- ✅ **ติดตามเธรดอัตโนมัติ** เมื่อ: เป็นคนโพสต์ root / ตอบในเธรด / ถูก mention ในเธรด — เลิกติดตามได้; เธรดที่ติดตามมีข้อความใหม่ → badge
- ✅ จอ **"เธรดของฉัน"** รวมเธรดที่ติดตามทุก channel เรียง activity ล่าสุด + unread ต่อเธรด
- ✅ กติกา: เธรดซ้อนเธรดไม่ได้ (reply ของ reply ผูก root เดิม), root ถูกลบ → tombstone แต่เธรดยังเปิดอ่าน/ตอบได้ (§11.1)
- 🔜 สรุปเธรดด้วย AI

### 3.5 Mentions
- ✅ `@user` — autocomplete จากสมาชิก channel; ผู้ถูก mention ได้ badge + notification (+ auto-follow ถ้าอยู่ในเธรด)
- ✅ `@channel` — แจ้งสมาชิก channel ทุกคน; channel > 20 คน จำกัดเฉพาะ channel admin/workspace ADMIN (กัน spam, ฝ่าฝืน → 403 + ข้อความอธิบาย)
- ✅ `@here` — แจ้งเฉพาะสมาชิกที่ **online อยู่ขณะนั้น** (presence §3.10); จำกัดเหมือน `@channel`
- ✅ แตกเป็นแถว `MeetingMention` รายคน ณ เวลาโพสต์ (badge query ถูก ไม่ scan Json) — คน join ทีหลังไม่ได้ mention ย้อนหลัง; mention คนนอก channel = render ตัวหนังสือเฉย ๆ ไม่แจ้งเตือน ไม่เชิญ
- 🔜 user group (`@ทีมครัว`)

### 3.6 Emoji Reactions
- ✅ react ด้วย emoji มาตรฐาน (picker + แถบ quick react 6 ตัวยอดนิยม) — หลาย emoji ต่อข้อความ, กดซ้ำ = ถอน (toggle idempotent)
- ✅ แสดงเป็นชิปใต้ข้อความ `👍 3` — hover/แตะเห็นรายชื่อคนกด; react ได้ทั้งใน main pane และเธรด
- ✅ คนโพสต์ root ได้แจ้งเตือนแบบเบา (in-app เท่านั้น ไม่มี email)
- 🔜 custom emoji

### 3.7 Pins + Saved items
- ✅ **Pin** (ระดับ channel): สมาชิกใด pin ได้ ใน channel ≤ 20 คน, ห้องใหญ่ = channel admin — สูงสุด 100/channel; แผง "📌 ปักหมุด" ต่อ channel; pin/unpin เกิด system message
- ✅ **Saved items** (bookmark **ส่วนตัว** — ไม่มีใครเห็น): กด 🔖 save ข้อความไหนก็ได้ที่อ่านได้ → จอ "รายการที่บันทึก" รวมทุก channel เรียงเวลา save + กด jump กลับบริบท
- ✅ ข้อความถูกลบ → หลุดจาก pins, saved item แสดง tombstone

### 3.8 ไฟล์แนบ + แกลเลอรีต่อ channel
- ✅ อัปโหลดผ่าน **upload service กลาง** (presigned, prefix `meeting/{systemId}/`): รูป ≤ 10MB, ไฟล์ ≤ 25MB, สูงสุด 10 ไฟล์/ข้อความ, whitelist MIME ชุดเดียวกับ Chat
- ✅ รูปแสดง inline (lightbox + ดาวน์โหลด), ไฟล์แสดงการ์ด ชื่อ+ขนาด+ไอคอนชนิด
- ✅ **แท็บ "ไฟล์" ต่อ channel** (gallery): grid รูป + list ไฟล์ กรองชนิด/ผู้ส่ง/เดือน กดแล้ว jump ไปข้อความต้นทาง
- ✅ โควตารวมต่อ tenant (แผนฟรี 2GB) — เกิน → 422 แนะนำลบไฟล์เก่า/อัปเกรด; ลบข้อความ → ลบไฟล์จาก storage จริง
- 🔜 preview PDF/Office ในตัว, ค้นในเนื้อไฟล์ (OCR/parse)

### 3.9 ค้นหา (ข้อความ / ไฟล์ / คน)
- ✅ **ข้อความ**: Postgres `tsvector` (simple) + **`pg_trgm`** สำหรับไทย (substring match ≥ 3 ตัวอักษร — ไทยไม่ตัดคำใน v1, 🔜 thai tokenizer) — **เฉพาะ channel ที่ user เป็นสมาชิก** (`leftAt IS NULL`) บังคับที่ service layer
- ✅ ตัวกรอง: `in:#channel` `from:@คน` `has:file` ช่วงวันที่ — ผลลัพธ์ highlight คำค้น + ปุ่ม "ดูในห้อง" (jump พร้อม context สองทิศ)
- ✅ **ไฟล์**: ค้นชื่อไฟล์ (trgm บน `fileName`) ใน channel ที่เป็นสมาชิก
- ✅ **คน**: ค้นชื่อ/อีเมล staff ใน workspace → เปิดโปรไฟล์ย่อ + ปุ่ม DM
- ✅ Quick switcher (Cmd/Ctrl+K): กระโดดไป channel/DM/คน
- 🔜 ค้นในเนื้อไฟล์แนบ

### 3.10 Unread / Read divider / Typing / Presence
- ✅ **Unread ต่อ channel**: ชื่อ channel ใน sidebar **ตัวหนา** = มีข้อความยังไม่อ่าน, **badge เลข = mention/DM** (แบบ Slack: เลขเฉพาะ mention+DM, ห้องธรรมดาแค่หนา)
- ✅ เส้นคั่นแดง **"ยังไม่ได้อ่าน"** ณ ตำแหน่ง `lastReadMessageId` เมื่อเปิดห้อง + ปุ่ม "ข้ามไปล่าสุด"; mark read เมื่อเลื่อนถึงล่าสุด (sync ทุกแท็บผ่าน SSE)
- ✅ unread แยกต่อเธรดที่ติดตาม (จอ "เธรดของฉัน")
- ✅ **Typing indicator** ต่อ channel/เธรด (ephemeral TTL 5 วิ ไม่ลง DB)
- ✅ **Presence**: `ONLINE` (SSE ต่ออยู่ + interact < 10 นาที) / `AWAY` (ต่ออยู่แต่ idle) / `OFFLINE` — จุดสถานะข้าง avatar ทุกจุด; เก็บ in-memory ที่ SSE hub + broadcast แบบ throttle (ไม่ลง DB)
- 🔜 custom status text ("🏖 ลาพักร้อน"), ตั้ง away มือ, Do Not Disturb ตามเวลา

### 3.11 Notification (contract 2.5)
- ✅ ระดับต่อ channel ต่อคน: `ALL` / `MENTIONS` (default อัตโนมัติเมื่อ channel > 20 คน) / `MUTED` (🔕)
- ✅ in-app realtime เสมอ (SSE + badge) · **EMAIL digest**: ถูก mention / DM ใหม่ / เธรดที่ติดตามมีตอบ + **offline > 10 นาที** → รวมส่ง 1 ฉบับ/15 นาที/user
- ✅ ทุก template = `TRANSACTIONAL` (ภายในทีม ไม่ติด consent gate): `meeting.mentioned` · `meeting.dm_new` · `meeting.thread_reply` · `meeting.channel_invited`
- 🔜 Web Push (service worker) — ต่อจาก notify กลาง ไม่แก้ schema

### 3.12 Integration ขาเข้า — "ทุกระบบเชื่อมถึงกัน" ⭐
- ✅ workspace ADMIN สร้าง **subscription**: เลือกแหล่ง (ระบบ business เช่น "จองคิวสาขา A" หรือระบบ feature เช่น "POS ร้าน B") + เลือก event ที่สนใจ + เลือก channel ปลายทาง
- ✅ Event ที่รองรับ v1 (จาก registry กลาง CORE_API.md — ผ่าน outbox, ไม่ยิงตรง): `booking.appointment.created` / `booking.appointment.canceled` · `pos.sale.paid` / `pos.sale.refunded` · `queue.ticket.called` 🔜 · `ticket.order.paid` 🔜 · `kanban.card.moved` 🔜 — เพิ่ม event ใหม่ = เพิ่มใน registry + template การ์ด ไม่แตะ core
- ✅ โพสต์เป็นข้อความ type `INTEGRATION`: การ์ดสรุป (icon ระบบ + หัวข้อ + fields สั้น + ลิงก์ "เปิดในระบบ...") — **สรุปเท่านั้น ไม่ leak รายละเอียดเกิน template**; คนกดลิงก์ต้องมีสิทธิ์ระบบต้นทางเอง
- ✅ react/ตอบเธรดใต้ integration message ได้ (คุยงานต่อจากเหตุการณ์จริง — นี่คือคุณค่าหลัก)
- ✅ เปิด/ปิด/ลบ subscription ได้ทุกเมื่อ; channel ถูก archive → subscription ปิดอัตโนมัติ + แจ้งผู้สร้าง (§11.9)
- 🔜 integration ขาออก (ส่งข้อความไปสั่งงานระบบอื่น), webhook ภายนอก, workflow builder

### 3.13 Call link (แทน huddle ใน v1)
- ✅ วางลิงก์ `meet.google.com` / `zoom.us` / `teams.microsoft.com` → render **การ์ดสาย 📞** (ชื่อ provider + ปุ่ม "เข้าร่วม" เปิดแท็บใหม่)
- 🔜 **Huddle ในตัว** (เสียง/จอ ผ่าน WebRTC) — ยืนยัน: ไม่มีใน v1

### 3.14 มือถือ
- ✅ Responsive เต็มรูป — **drawer 2 ชั้น**: ชั้น 1 = sidebar (channels/DMs), ชั้น 2 = ห้อง เต็มจอ; แตะข้อความ → เธรดเต็มจอ (back กลับห้อง); แผงสมาชิก/pins/ไฟล์ = bottom sheet; composer sticky เหนือคีย์บอร์ด; แนบรูปจากกล้อง/แกลเลอรี
- 🔜 web push บนมือถือ (มากับ 3.11)

---

## 4. Data Model (Prisma)

> ทุกตาราง `tenantId + systemId` (system-scoped) — **MeetingWorkspace = AppSystem** ไม่มีตารางแยก · ประวัติ**ถาวร** ไม่มี retention purge · ลบข้อความ = soft delete tombstone · id cuid, `createdAt/updatedAt` ครบ · `userId` = String อ้าง `User` กลาง (ไม่ประกาศ FK ข้ามโดเมน — ตรวจ Membership ที่ service layer)

```prisma
// ───────────────────────── enums ─────────────────────────

enum MeetingWorkspaceRole {
  OWNER   // ผู้สร้าง workspace — โอนได้
  ADMIN   // จัดการสมาชิก/channel ทุกห้อง/integration/settings
  MEMBER
}

enum MeetingChannelType {
  PUBLIC     // # — browse + join เองได้
  PRIVATE    // 🔒 — invite เท่านั้น
  DM         // 1:1
  GROUP_DM   // 3–9 คน
}

enum MeetingChannelRole {
  ADMIN   // จัดการ channel: เชิญ/ถอด/เปลี่ยนชื่อ/archive/ลบข้อความคนอื่น/pin ห้องใหญ่
  MEMBER
}

enum MeetingPostingPolicy {
  EVERYONE
  ADMINS_ONLY   // "ห้องประกาศ" แบบ Slack
}

enum MeetingNotifyLevel {
  ALL
  MENTIONS
  MUTED
}

enum MeetingMessageType {
  TEXT          // รวมข้อความมีไฟล์แนบ
  SYSTEM        // เข้า/ออก/เปลี่ยนชื่อ/pin — meta ระบุ
  INTEGRATION   // การ์ดจากระบบอื่น — meta { integrationId, event, payload }
}

enum MeetingMentionKind {
  USER
  CHANNEL   // @channel
  HERE      // @here
}

enum MeetingIntegrationSource {
  BUSINESS_UNIT   // ระบบ business (BusinessUnit)
  APP_SYSTEM      // ระบบ feature (AppSystem)
}

// ─────────────────── Workspace member ───────────────────
// workspace = AppSystem (type MEETING) — ตารางนี้คือทะเบียนสมาชิก + role ระดับ workspace

model MeetingWorkspaceMember {
  id        String               @id @default(cuid())
  tenantId  String
  systemId  String               // AppSystem.id ของ workspace
  userId    String
  role      MeetingWorkspaceRole @default(MEMBER)
  invitedByUserId String?
  joinedAt  DateTime             @default(now())
  leftAt    DateTime?            // ออก/ถูกถอดจาก workspace (ประวัติคงไว้)
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt

  @@unique([systemId, userId])
  @@index([tenantId, userId, leftAt])   // workspace list ของ user
  @@index([systemId, role, leftAt])
}

// ───────────────────────── Channel ─────────────────────────

model MeetingChannel {
  id             String               @id @default(cuid())
  tenantId       String
  systemId       String
  type           MeetingChannelType
  name           String?              // PUBLIC/PRIVATE; DM/GROUP_DM = null (UI ประกอบชื่อจากสมาชิก)
  topic          String?              // บรรทัดสั้นบน header (Slack topic)
  description    String?
  postingPolicy  MeetingPostingPolicy @default(EVERYONE)
  unitId         String?              // ผูกระบบ business (optional)
  autoJoinByUnit Boolean              @default(false)
  isDefault      Boolean              @default(false) // #general — leave/archive ไม่ได้
  dmKey          String?              // DM/GROUP_DM: sha256(sorted userIds join ":") — กันสร้างซ้ำ
  createdByUserId String
  lastMessageAt  DateTime?            // เรียง sidebar
  archivedAt     DateTime?            // read-only, ยังค้นเจอ, unarchive ได้
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  members      MeetingChannelMember[]
  messages     MeetingMessage[]
  readStates   MeetingReadState[]
  pins         MeetingPin[]
  files        MeetingFile[]
  integrations MeetingIntegration[]

  @@unique([systemId, dmKey])          // DM ชุดคนเดิม = ห้องเดิมเสมอ
  @@unique([systemId, name])           // ชื่อ channel ไม่ซ้ำใน workspace (null ไม่ติด)
  @@index([tenantId, systemId, type, archivedAt])
  @@index([systemId, unitId])
  @@index([systemId, lastMessageAt(sort: Desc)])
}

model MeetingChannelMember {
  id          String              @id @default(cuid())
  tenantId    String
  systemId    String
  channelId   String
  channel     MeetingChannel      @relation(fields: [channelId], references: [id])
  userId      String
  role        MeetingChannelRole  @default(MEMBER)
  notifyLevel MeetingNotifyLevel  @default(ALL)
  autoJoined  Boolean             @default(false) // จาก autoJoinByUnit/#general — sync ถอนได้ (§7.7)
  hiddenAt    DateTime?           // ซ่อน DM จาก sidebar (ไม่ใช่ออกจากห้อง)
  joinedAt    DateTime            @default(now())
  leftAt      DateTime?           // ออกจาก channel (แถวคงไว้ — re-join ล้าง leftAt)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  @@unique([channelId, userId])
  @@index([systemId, userId, leftAt])   // channel list ของ user
  @@index([channelId, leftAt])
}

// ───────────────────────── Message ─────────────────────────

model MeetingMessage {
  id                String             @id @default(cuid())
  tenantId          String
  systemId          String
  channelId         String
  channel           MeetingChannel     @relation(fields: [channelId], references: [id])
  senderUserId      String             // SYSTEM/INTEGRATION = "system"
  type              MeetingMessageType @default(TEXT)
  body              String?            @db.Text   // markdown subset (§3.3)
  // ค้นหา: raw migration เพิ่ม generated tsvector + GIN + pg_trgm (ท้าย schema)

  // ── Threads ──
  threadRootId      String?            // null = ข้อความ main pane; มีค่า = reply ในเธรด (ผูก root เสมอ ไม่ซ้อนชั้น)
  threadRoot        MeetingMessage?    @relation("MeetingThread", fields: [threadRootId], references: [id])
  threadReplies     MeetingMessage[]   @relation("MeetingThread")
  replyCount        Int                @default(0)  // denormalized บน root — update ใน tx เดียวกับ insert reply
  lastReplyAt       DateTime?          // denormalized บน root
  alsoSentToChannel Boolean            @default(false) // reply ที่ติ๊ก "ส่งเข้าห้องด้วย" → โชว์ใน main pane ด้วย

  mentions          Json               @default("[]")  // ["usr_x"] | ["@channel"] | ["@here"] — ใช้ render highlight
  embeds            Json?              // [{kind:'KANBAN_CARD'|'INTERNAL_LINK'|'OG_LINK'|'CALL_LINK', ...snapshot, refreshedAt}]
  clientMessageId   String?            // idempotency จาก client
  editedAt          DateTime?
  deletedAt         DateTime?          // soft delete → tombstone (body=null, ไฟล์ลบจาก storage)
  deletedByUserId   String?
  meta              Json?              // SYSTEM: {action,...} / INTEGRATION: {integrationId, event, refType, refId, url}
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  attachments MeetingFile[]
  reactions   MeetingReaction[]
  mentionRows MeetingMention[]
  pin         MeetingPin?
  savedBy     MeetingSavedItem[]
  follows     MeetingThreadFollow[]    @relation("MeetingThreadFollowRoot")

  @@unique([channelId, clientMessageId])
  @@index([channelId, threadRootId, createdAt, id])  // main pane (threadRootId IS NULL) + เธรด — ordering หลัก
  @@index([threadRootId, createdAt, id])
  @@index([tenantId, systemId, createdAt])
}
// Raw migration แนบท้าย (นอก Prisma):
//   ALTER TABLE "MeetingMessage" ADD COLUMN search tsvector
//     GENERATED ALWAYS AS (to_tsvector('simple', coalesce(body,''))) STORED;
//   CREATE INDEX meeting_msg_search ON "MeetingMessage" USING GIN (search);
//   CREATE INDEX meeting_msg_trgm   ON "MeetingMessage" USING GIN (body gin_trgm_ops);
//   CREATE INDEX meeting_file_trgm  ON "MeetingFile"    USING GIN ("fileName" gin_trgm_ops);

// ───────────────── Reaction / Pin / Saved ─────────────────

model MeetingReaction {
  id        String         @id @default(cuid())
  tenantId  String
  systemId  String
  messageId String
  message   MeetingMessage @relation(fields: [messageId], references: [id])
  userId    String
  emoji     String         // unicode emoji เช่น "👍"
  createdAt DateTime       @default(now())

  @@unique([messageId, userId, emoji])   // toggle idempotent — กดซ้ำ = ลบแถว
  @@index([messageId])
  @@index([systemId, userId])
}

model MeetingPin {
  id             String         @id @default(cuid())
  tenantId       String
  systemId       String
  channelId      String
  channel        MeetingChannel @relation(fields: [channelId], references: [id])
  messageId      String         @unique   // 1 ข้อความ pin ได้ครั้งเดียว
  message        MeetingMessage @relation(fields: [messageId], references: [id])
  pinnedByUserId String
  createdAt      DateTime       @default(now())

  @@index([channelId, createdAt(sort: Desc)])
}

model MeetingSavedItem {
  id        String         @id @default(cuid())
  tenantId  String
  systemId  String
  userId    String         // ส่วนตัว — เจ้าของเห็นคนเดียว
  messageId String
  message   MeetingMessage @relation(fields: [messageId], references: [id])
  createdAt DateTime       @default(now())

  @@unique([userId, messageId])
  @@index([systemId, userId, createdAt(sort: Desc)])
}

// ───────────────────────── File ─────────────────────────
// upload ก่อน (ได้ fileId) แล้วผูก messageId ตอนส่ง — gallery query ด้วย channelId ตรง ๆ

model MeetingFile {
  id             String          @id @default(cuid())
  tenantId       String
  systemId       String
  channelId      String
  channel        MeetingChannel  @relation(fields: [channelId], references: [id])
  messageId      String?         // null = อัปโหลดค้าง (GC ลบใน 24 ชม.ถ้าไม่ถูกผูก)
  message        MeetingMessage? @relation(fields: [messageId], references: [id])
  uploaderUserId String
  storageKey     String          // prefix meeting/{systemId}/
  url            String
  fileName       String
  mimeType       String
  sizeBytes      Int
  width          Int?
  height         Int?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@index([channelId, createdAt(sort: Desc)])   // gallery ต่อ channel
  @@index([messageId])
  @@index([tenantId, systemId, createdAt])      // storage report / GC
}

// ─────────────── Read state / Thread follow ───────────────
// แยกจาก ChannelMember เพราะเป็นตาราง hot-write (update ทุกครั้งที่อ่าน) — ไม่ lock แถว membership

model MeetingReadState {
  id                String         @id @default(cuid())
  tenantId          String
  systemId          String
  channelId         String
  channel           MeetingChannel @relation(fields: [channelId], references: [id])
  userId            String
  lastReadMessageId String?
  lastReadAt        DateTime?
  updatedAt         DateTime       @updatedAt
  createdAt         DateTime       @default(now())

  @@unique([channelId, userId])
  @@index([systemId, userId])
}

model MeetingThreadFollow {
  id                String         @id @default(cuid())
  tenantId          String
  systemId          String
  threadRootId      String
  threadRoot        MeetingMessage @relation("MeetingThreadFollowRoot", fields: [threadRootId], references: [id])
  userId            String
  following         Boolean        @default(true)  // false = เลิกติดตาม (กันถูก auto-follow ซ้ำ)
  lastReadMessageId String?
  lastReadAt        DateTime?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  @@unique([threadRootId, userId])
  @@index([systemId, userId, following])   // จอ "เธรดของฉัน"
}

// ───────────────────────── Mention ─────────────────────────
// mention inbox — badge/"@ ค้าง" query ถูก (ไม่ scan Json); @channel/@here แตกรายคน ณ เวลาโพสต์

model MeetingMention {
  id              String             @id @default(cuid())
  tenantId        String
  systemId        String
  channelId       String
  messageId       String
  message         MeetingMessage     @relation(fields: [messageId], references: [id])
  mentionedUserId String
  kind            MeetingMentionKind @default(USER)
  readAt          DateTime?          // เซ็ตเมื่อ user อ่านถึงข้อความนี้
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  @@unique([messageId, mentionedUserId])
  @@index([systemId, mentionedUserId, readAt])   // badge mention ค้าง
}

// ───────────── Integration ขาเข้า (link ระบบอื่น) ─────────────
// ตาราง link ของระบบนี้เอง (BLUEPRINT_SYSTEMS §3) — opt-in, ถอดได้ทุกเมื่อ

model MeetingIntegration {
  id              String                   @id @default(cuid())
  tenantId        String
  systemId        String                   // workspace ปลายทาง
  channelId       String
  channel         MeetingChannel           @relation(fields: [channelId], references: [id])
  name            String                   // "จองใหม่ สาขา A → #จอง-สาขา-a"
  sourceType      MeetingIntegrationSource
  sourceUnitId    String?                  // BUSINESS_UNIT
  sourceSystemId  String?                  // APP_SYSTEM (เช่น POS ชุดที่เลือก)
  events          Json                     // ["booking.appointment.created", ...] จาก registry กลาง
  enabled         Boolean                  @default(true)
  createdByUserId String
  createdAt       DateTime                 @default(now())
  updatedAt       DateTime                 @updatedAt

  @@index([tenantId, enabled])
  @@index([sourceUnitId, enabled])     // dispatcher lookup ตอน event เข้า
  @@index([sourceSystemId, enabled])
  @@index([systemId, channelId])
}
```

**หมายเหตุ schema / Ordering / Pagination:**
- **Ordering ทางการ**: เรียงด้วย `(createdAt ASC, id ASC)` — `id` (cuid) เป็น tiebreaker กัน createdAt ชนกันใน ms เดียว; index หลัก `[channelId, threadRootId, createdAt, id]` รองรับทั้ง main pane (`threadRootId IS NULL OR alsoSentToChannel = true`) และเธรด
- **Pagination = keyset cursor สองทิศ**: `cursor = base64(createdAt.toISOString() + "|" + id)`, `direction: before|after`, `limit ≤ 50` — เปิดห้อง = ดึง `before` จากล่าสุด; jump จาก search/pin/saved = ดึงรอบ anchor ทั้งสองทิศ; **ห้าม OFFSET**
- `replyCount/lastReplyAt` denormalize บน root — update ใน **transaction เดียว** กับ insert reply (กัน drift)
- ไม่มีตาราง presence — presence เป็น ephemeral in-memory ที่ SSE hub (§8.4)
- ไม่มีตาราง/ FK ใด ๆ ไปยัง `Chat*` — บังคับด้วย convention + code review (§11.11)
- read state ต่อ channel = แถวเดียวต่อคน (ไม่ทำ per-message receipt — ห้องใหญ่บวม); "อ่านแล้ว n คน" ไม่มีใน channel (Slack ก็ไม่มี) — มีเฉพาะ DM/GROUP_DM (เทียบ `lastReadMessageId`)

---

## 5. API Endpoints

> base: `/api/meeting/[systemId]/...` — ทุกเส้นตรวจ (1) session staff + Membership สด (2) `can(user, { tenantId, module:'MEETING', action })` (3) **เป็นสมาชิก workspace** (`MeetingWorkspaceMember.leftAt IS NULL`) (4) เส้นระดับ channel: เป็นสมาชิก channel — ลูกค้า/guest/session storefront ไม่มีทางเข้า ทุก id ข้าม tenant/system → 404

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ |
|---|---|---|---|---|
| 1 | `GET /bootstrap` | เปิดแอป: channels ของฉัน (เรียง lastMessageAt + unread/mention count), workspace members ย่อ, settings | — | `meeting.use` |
| 2 | `GET /channels?directory=1` | browse PUBLIC channels (ชื่อ+topic+สมาชิก n คน) | — | `meeting.use` |
| 3 | `POST /channels` | สร้าง PUBLIC/PRIVATE channel | `{ type, name, topic?, description?, postingPolicy?, unitId?, autoJoinByUnit?, memberUserIds? }` | `meeting.create_channel` |
| 4 | `POST /dm` | find-or-create DM/GROUP_DM | `{ userIds }` (รวมตัวเอง 2=DM, 3–9=GROUP_DM) | `meeting.use` |
| 5 | `GET /channels/:id` | รายละเอียด channel + สมาชิก + pins/files count | — | สมาชิก (PUBLIC: workspace member ใดดู meta ได้) |
| 6 | `PATCH /channels/:id` | แก้ name/topic/description/postingPolicy/visibility/unitId/autoJoinByUnit/archive/unarchive | ฟิลด์ที่แก้ | channel ADMIN (topic: สมาชิกใดก็ได้; `isDefault` archive ไม่ได้) |
| 7 | `POST /channels/:id/join` | join PUBLIC เอง | — | `meeting.use` |
| 8 | `POST /channels/:id/members` | เชิญสมาชิก | `{ userIds }` | PUBLIC: สมาชิกใดก็เชิญได้ · PRIVATE: channel ADMIN |
| 9 | `DELETE /channels/:id/members/:userId` | ถอด/ออกเอง (set leftAt; `#general` ออกไม่ได้ → 409) | — | channel ADMIN หรือเจ้าตัว |
| 10 | `PATCH /channels/:id/members/:userId` | เปลี่ยน role/notifyLevel/hidden | `{ role?, notifyLevel?, hiddenAt? }` | role: channel ADMIN · notify/hidden: เจ้าตัว |
| 11 | `GET /channels/:id/messages` | ข้อความ main pane (keyset cursor สองทิศ §4) | `cursor?, direction?, limit≤50, anchorId?` | สมาชิก |
| 12 | `POST /channels/:id/messages` | ส่งข้อความ (main หรือเธรดผ่าน `threadRootId`) | `{ body?, fileIds?, threadRootId?, alsoSentToChannel?, clientMessageId }` — server parse mentions/embeds | สมาชิก (+ `postingPolicy` check ใน main pane; เธรดตอบได้เสมอ) |
| 13 | `GET /messages/:id/thread` | root + replies (cursor) + follow state | `cursor?, direction?, limit` | สมาชิก channel |
| 14 | `PATCH /messages/:id` | แก้ข้อความตัวเอง (ตาม editWindow) — re-parse mentions/embeds | `{ body }` | ผู้ส่ง |
| 15 | `DELETE /messages/:id` | soft delete → tombstone | — | ผู้ส่ง หรือ channel ADMIN |
| 16 | `PUT /messages/:id/reactions/:emoji` · `DELETE ...` | react / ถอน (toggle idempotent) | — | สมาชิก channel |
| 17 | `POST /messages/:id/pin` · `DELETE .../pin` | pin/unpin (เกิน 100/channel → 409) | — | สมาชิก (channel >20 คน: ADMIN) |
| 18 | `GET /channels/:id/pins` | list ปักหมุด | — | สมาชิก |
| 19 | `PUT /messages/:id/save` · `DELETE .../save` | save/unsave (ส่วนตัว) | — | อ่านข้อความนั้นได้ |
| 20 | `GET /saved` | รายการที่บันทึก (ทุก channel ที่ยังเป็นสมาชิก) | `cursor?` | `meeting.use` |
| 21 | `PUT /messages/:id/follow` · `DELETE .../follow` | ติดตาม/เลิกติดตามเธรด | — | สมาชิก channel |
| 22 | `GET /threads` | "เธรดของฉัน" — เธรดที่ติดตาม เรียง lastReplyAt + unread | `cursor?` | `meeting.use` |
| 23 | `POST /uploads` | presigned upload (สร้าง `MeetingFile` messageId=null) | `{ channelId, fileName, mimeType, sizeBytes }` → ตรวจ quota | สมาชิก channel |
| 24 | `GET /channels/:id/files` | แกลเลอรีไฟล์ต่อ channel | `kind?, uploaderUserId?, month?, cursor?` | สมาชิก |
| 25 | `GET /search` | ค้นหา `scope: messages\|files\|people` (FTS+trgm, filter in:/from:/has:) — เฉพาะ channel ที่เป็นสมาชิก | `q, scope, channelId?, senderUserId?, hasFile?, from?, to?, cursor?` | `meeting.use` |
| 26 | `POST /channels/:id/read` | mark read: update ReadState + เคลียร์ mention ≤ ข้อความนั้น | `{ lastReadMessageId }` | สมาชิก |
| 27 | `POST /threads/:rootId/read` | mark read เธรด (ThreadFollow) | `{ lastReadMessageId }` | ผู้ติดตาม |
| 28 | `POST /channels/:id/typing` | typing ephemeral (TTL 5 วิ; `threadRootId?` ระบุเธรด) | `{ threadRootId? }` | สมาชิก |
| 29 | `GET /stream` | **SSE** ต่อ user ทั้ง workspace (resume ด้วย Last-Event-ID) — events §8.4 | — | `meeting.use` |
| 30 | `GET /unread-count` | badge poll fallback `{ channels: n, mentions: n, threads: n }` | — | `meeting.use` |
| 31 | `GET /members` · `POST /members` · `PATCH /members/:userId` · `DELETE /members/:userId` | จัดการสมาชิก workspace (เชิญ staff / เปลี่ยน role / ถอด) | `{ userIds }` / `{ role }` | อ่าน: `meeting.use` · เขียน: workspace ADMIN |
| 32 | `GET /integrations` · `POST /integrations` · `PATCH /integrations/:id` · `DELETE /integrations/:id` | จัดการ subscription ระบบอื่น → channel | `{ name, channelId, sourceType, sourceUnitId?/sourceSystemId?, events[] }` | workspace ADMIN (`meeting.manage_integrations`) |
| 33 | `GET /link-preview` | resolve ลิงก์ → embed payload (ใช้ตอน compose) | `url` | `meeting.use` |

---

## 6. UI Screens

> TH/EN · B&W minimal · mobile-first · empty/loading/error ครบทุกจอ · เข้าจาก `/app/sys/[systemId]` (การ์ดระบบ Meeting ใน `/app`)

### 6.1 `/app/sys/[systemId]` — จอหลักแบบ Slack: **sidebar + main pane + thread pane**

**Sidebar (ซ้าย):**
- หัว: ชื่อ workspace + ปุ่ม ⌄ (settings/สมาชิก/integrations — ตาม role) + ปุ่มเขียนใหม่ ✏️ (DM/channel ใหม่)
- ช่องค้นหา + quick switcher (Cmd/Ctrl+K)
- ลิงก์ยืน 3 แถว: **💬 เธรดของฉัน** (badge unread) · **🔖 รายการที่บันทึก** · **@ Mentions ค้าง**
- section **Channels**: `#ชื่อ` (PRIVATE = 🔒) — **ตัวหนา = unread, badge เลขดำ = mention**, 🔕 = MUTED · ท้าย section: "+ เพิ่ม channel" (สร้าง/Browse)
- section **Direct messages**: ชื่อคู่สนทนา + จุด presence (● online / ◐ away / ○ offline) + badge เลข (DM นับทุกข้อความ)
- ลาก order ไม่ได้ใน v1 (เรียง: unread ก่อน แล้ว lastMessageAt) — custom section 🔜

**Main pane (กลาง):**
- header: `#ชื่อ` + topic (คลิกแก้) + จำนวนสมาชิก (กด = แผงสมาชิก) + 📌 pins + 📁 ไฟล์ + ⋯ (ตั้งค่า channel/แจ้งเตือน/archive/ออก)
- เธรดข้อความ: จัดกลุ่มตามวัน (เส้นคั่น "วันนี้ / เมื่อวาน / 12 ก.ค."), **เส้นแดง "ยังไม่ได้อ่าน"** ณ lastRead + ปุ่มลอย "ข้ามไปล่าสุด"
- ข้อความ: avatar + ชื่อ + เวลา; ข้อความติดกันของคนเดิมภายใน 5 นาที = compact (ไม่ซ้ำ avatar แบบ Slack); render markdown/code block (ปุ่ม copy); mention = พื้นเทาอ่อน+ตัวหนา; ป้าย "แก้ไขแล้ว"; tombstone "ข้อความถูกลบ"
- ใต้ข้อความ: ชิป reactions `👍 3` + ปุ่ม ➕ react · แถบเธรด "💬 5 ตอบกลับ — ล่าสุด 10 นาทีก่อน" + avatar ผู้ตอบ (กด = เปิด thread pane)
- embeds: การ์ด Kanban (กรอบ hairline: ชื่องาน/คอลัมน์/ผู้รับ/due + ปุ่ม refresh) · การ์ด integration (icon ระบบ + สรุป + ลิงก์) · การ์ดสาย 📞 + ปุ่มเข้าร่วม · OG preview (title+domain+รูปย่อ)
- hover/long-press เมนู: react ด่วน 6 ตัว · ตอบในเธรด · save 🔖 · pin · แก้ไข · ลบ · คัดลอกลิงก์ข้อความ
- composer: textarea + toolbar ย่อ (B/I/code/code block) + แนบไฟล์ (chip ก่อนส่ง สูงสุด 10) + `@` autocomplete + emoji picker + Enter ส่ง / Shift+Enter ขึ้นบรรทัด
- `postingPolicy: ADMINS_ONLY` และไม่ใช่ admin → banner "channel นี้โพสต์ได้เฉพาะผู้ดูแล" แทน composer (ตอบในเธรดได้)
- archived → banner "channel นี้ถูกเก็บถาวร — อ่านอย่างเดียว" + ปุ่ม unarchive (admin)

**Thread pane (ขวา — เปิดเมื่อกดเธรด):**
- header "เธรด — #ชื่อchannel" + ปุ่มติดตาม/เลิกติดตาม + ✕
- root ด้านบน (ย่อ) + replies เรียงเวลา + composer ของเธรด + checkbox "ส่งเข้าห้องด้วย"
- desktop กว้าง ≥ 1200px แสดง 3 pane พร้อมกัน; แคบกว่า = thread pane ทับ main

### 6.2 จอรอง (route ลูกของ `/app/sys/[systemId]`)
- `/threads` — เธรดของฉัน: list การ์ดเธรด (channel, root ย่อ, n ตอบกลับ, unread หนา) กด = เปิดเธรด
- `/saved` — รายการที่บันทึก: list ข้อความ + ปุ่ม "ดูในห้อง"
- `/search?q=` — ผลค้นหา 3 แท็บ: ข้อความ / ไฟล์ / คน + แถบ filter (in:/from:/has:/วันที่) + highlight + jump
- `/browse` — directory PUBLIC channels + ปุ่ม join
- `/settings` (workspace ADMIN) — ชื่อ, autoAddNewStaff, editWindow, สมาชิก workspace (role), **Integrations** (list + สร้าง: เลือกระบบต้นทาง → เลือก events → เลือก channel), insights (§10)

### 6.3 Mobile behavior — **drawer 2 ชั้น**
- ชั้น 1 = sidebar เต็มจอ (จอแรก) → แตะ channel = ชั้น 2 ห้องเต็มจอ (back กลับ) → แตะเธรด = เธรดเต็มจอ (back กลับห้อง)
- แผงสมาชิก/pins/ไฟล์/react picker = bottom sheet · composer sticky เหนือคีย์บอร์ด · แนบรูปจากกล้อง/แกลเลอรี · swipe ข้อความ = ตอบในเธรด
- quick switcher = ปุ่ม 🔍 บน header · badge/typing/presence realtime เท่ากับ desktop

### 6.4 จุดแสดงผลนอกระบบ
- `/app` การ์ดระบบ Meeting: badge = mention+DM ค้าง (เลข) หรือจุด unread — **แยกต่อ workspace** ถ้ามีหลายชุด
- sidebar dashboard เมนู Meeting: badge รวมทุก workspace ที่ user เป็นสมาชิก

---

## 7. Business Flows

### 7.1 เปิดระบบ Meeting (สร้าง workspace)
1. Owner ที่ `/app/settings/systems` เลือก Meeting → ตั้งชื่อ → สร้าง `AppSystem { type: MEETING }`
2. Service ต่อเนื่อง (transaction): insert `MeetingWorkspaceMember` ให้ staff ทุกคนที่มี Membership (ผู้สร้าง = OWNER) + สร้าง `#general { isDefault: true, type: PUBLIC }` + `MeetingChannelMember` ทุกคน (`autoJoined: true`) + system message "ยินดีต้อนรับสู่ workspace"
3. staff ใหม่ภายหลัง (Membership ใหม่) + `autoAddNewStaff: true` → hook `membership.created` → เพิ่มเข้า workspace + `#general`
   - **Failure:** ไม่มีสิทธิ์สร้างระบบ → 403 · สร้าง 2 workspace ชื่อซ้ำ = อนุญาต (AppSystem.name ไม่ unique — id ต่างกัน)

### 7.2 ส่งข้อความ + mention + embed
1. Staff พิมพ์ "@เมย์ ดูงานนี้ /app/sys/kb1/cards/c9 ```js\ncode\n```" → `POST /channels/:id/messages { body, clientMessageId }`
2. Server (transaction): ตรวจสมาชิก + ไม่ archived + postingPolicy → parse mentions (`@เมย์` → usr_may) → parse ลิงก์: ภายใน (Kanban → `kanban.getCardPreview` §8.3, อื่น → title-only) / ภายนอก (OG unfurl ผ่าน proxy กัน SSRF §11.8) / call link → insert message + `MeetingMention` + update `channel.lastMessageAt`
3. SSE `message.new` ถึงสมาชิก channel → sidebar หนา/badge ตาม notifyLevel; usr_may offline > 10 นาที → email digest (throttle 1/15 นาที)
   - **Failure:** retry ส่งซ้ำ → `@@unique(channelId, clientMessageId)` คืนข้อความเดิม · การ์ด Kanban ไม่มีสิทธิ์/ลบ → embed fallback ลิงก์เปล่า ไม่ leak ชื่องาน

### 7.3 เธรด: ตอบ + ติดตาม + unread
1. Staff กด "ตอบในเธรด" บนข้อความ m1 → thread pane → ส่ง reply → `POST messages { threadRootId: m1, alsoSentToChannel: false }`
2. Server transaction: insert reply + update root `{ replyCount: +1, lastReplyAt }` + **auto-follow**: upsert `MeetingThreadFollow` ให้ผู้ตอบ + ผู้โพสต์ root + ผู้ถูก mention (ข้ามคนที่เคยกดเลิกติดตาม `following: false`)
3. SSE `thread.reply` → ผู้ติดตามได้ badge ที่ "เธรดของฉัน" (ไม่ทำห้องหนา — reply ไม่โผล่ main pane) · ติ๊ก "ส่งเข้าห้องด้วย" → โผล่ทั้งคู่ + ห้องหนา
4. mark read เธรด → `POST /threads/:rootId/read`
   - **Failure:** reply ใส่ root ที่เป็น reply → 422 "ตอบซ้อนเธรดไม่ได้" (client ส่ง root จริงเสมอ) · root ถูกลบ → ตอบต่อได้ (root = tombstone)

### 7.4 @channel ในห้องใหญ่
- ≤ 20 คน: ใครก็ใช้ `@channel/@here` ได้ · > 20 คน: เฉพาะ channel ADMIN / workspace ADMIN — ฝ่าฝืน → 403 "channel นี้จำกัด @channel เฉพาะผู้ดูแล"
- แตก `MeetingMention` รายคน (`kind: CHANNEL|HERE`) — `@here` กรองเฉพาะ user ที่ presence ONLINE ขณะโพสต์; สมาชิก > 200 คน → fan-out ใน background job

### 7.5 Reaction / Pin / Save
- react: `PUT /messages/:id/reactions/👍` → upsert (unique constraint กัน race กดพร้อมกัน) → SSE `message.updated` → ชิปอัปเดตสด; กดซ้ำผ่าน DELETE → ถอน
- pin: ตรวจ limit 100 ใน transaction (count + insert; unique `messageId` กัน pin ซ้ำ) → system message "📌 ปักหมุดโดย เมย์"
- save: upsert เงียบ ไม่มี SSE ถึงคนอื่น (ส่วนตัว)

### 7.6 Integration: จองใหม่ → post เข้า channel
1. Workspace ADMIN สร้าง subscription: source = ระบบจองคิว "สาขา A" (BUSINESS_UNIT), events `["booking.appointment.created"]`, channel `#จอง-สาขา-a`
2. ระบบจองเกิดจองใหม่ → emit event เข้า **outbox กลาง** (ตามที่ระบบจองทำอยู่แล้ว — Meeting ไม่ต้องให้ระบบต้นทางรู้จัก)
3. Consumer ของ Meeting อ่าน outbox → หา `MeetingIntegration` ที่ match (`sourceUnitId + event + enabled`) → render template การ์ด (ชื่อลูกค้า(ย่อ), เวลา, ลิงก์ "เปิดในระบบจอง") → insert `MeetingMessage { type: INTEGRATION, senderUserId: "system" }` → SSE ปกติ
4. ทีมกด react/เปิดเธรดคุยต่อใต้การ์ดได้
   - **Failure:** channel ถูก archive → set `enabled: false` + notify ผู้สร้าง · ระบบต้นทางถูกลบ/ถอด link → subscription ปิดอัตโนมัติ · consumer ล้ม → retry ผ่าน outbox (idempotent ด้วย `clientMessageId = "intg:" + integrationId + ":" + eventId`)

### 7.7 Sync สมาชิกอัตโนมัติ
- hook `membership.created` → autoAddNewStaff → เข้า workspace + `#general` (§7.1)
- hook `membership.unitAccessChanged(userId)` → channel `autoJoinByUnit: true`: ได้สิทธิ์ → insert member (`autoJoined: true`); เสียสิทธิ์ → เฉพาะแถว `autoJoined: true` set `leftAt` (invite มือไม่โดนถอน)
- hook `membership.removed` → set `leftAt` ทุก channel + workspace ทุก workspace ของ tenant + ตัด SSE ทันที — ข้อความ/ไฟล์เก่าอยู่ครบ ชื่อยัง render ได้ (§11.4)

### 7.8 Read state + badge
- เลื่อนถึงล่าสุด → `POST /channels/:id/read { lastReadMessageId }` → upsert ReadState + เคลียร์ `MeetingMention.readAt` ≤ ข้อความนั้น → SSE `read` กลับหา user เอง (ทุกแท็บ sync) + `badge`
- Badge รวม = channels ที่ `lastMessageAt > lastReadAt` (unread) + mentions `readAt IS NULL` + threads ติดตามที่ `lastReplyAt > follow.lastReadAt` — คำนวณฝั่ง server, poll fallback 60 วิ

---

## 8. Integration (contracts `_CONVENTIONS` §2 — เพิ่ม `systemId` ใน context ตาม BLUEPRINT_SYSTEMS §5)

### 8.1 Notification — contract 2.5 (จุดเดียว ไม่ส่งเอง)
```
notify({ tenantId, to: { userId }, channel: 'WEB'|'EMAIL', template:
  'meeting.mentioned' | 'meeting.dm_new' | 'meeting.thread_reply' | 'meeting.channel_invited',
  data: { systemId, workspaceName, channelId, channelName, preview, url } })
```
- ทุก template = **`TRANSACTIONAL`** (ภายในทีม — ไม่ติด consent gate)
- throttle ฝั่ง Meeting: EMAIL รวม ≤ 1 ฉบับ/15 นาที/user (mention+DM+thread รวมเป็น digest) · `MUTED` = ไม่ notify ทุกชนิด · `MENTIONS` = เฉพาะ mention/DM/เธรดที่ติดตาม

### 8.2 Event ขาเข้า (integration §3.12) — ผ่าน outbox กลาง
- Meeting เป็น **consumer** ของ event registry กลาง (`<module>.<entity>.<pastTense>` — CORE_API.md) — ระบบต้นทาง**ไม่ต้องรู้จัก Meeting** (decoupled ผ่าน outbox ตาม _CONVENTIONS §2.8)
- v1 template การ์ด: `booking.appointment.created/canceled`, `pos.sale.paid/refunded` — payload การ์ดใช้ข้อมูลย่อจาก event เท่านั้น (ไม่ query ระบบต้นทางเพิ่ม, ไม่ leak เกิน template)
- idempotent: `clientMessageId = "intg:{integrationId}:{eventId}"`

### 8.3 Kanban (ระบบ 13) — read-only preview
```
kanban.getCardPreview(tenantId, systemId /*ของ Kanban*/, cardId)
  → { cardId, title, boardName, columnName, assigneeName?, dueDate?, labels[] } | null
```
- เรียกตอนโพสต์/กด refresh เท่านั้น (snapshot ใน `embeds` — ไม่ subscribe) · บอร์ดที่ผู้โพสต์ไม่มีสิทธิ์ → null → fallback ลิงก์เปล่า · เปิดหน้าเต็มตรวจสิทธิ์ Kanban ปกติ

### 8.4 SSE + Presence (infra กลาง)
- **Topic (scheme กลาง + systemId):** `t:{tenantId}:meeting:{systemId}:{topic}` — events: `message.new`, `message.updated` (แก้/ลบ/react/pin), `thread.reply`, `channel.updated`, `member.updated`, `typing`, `presence`, `read`, `badge`
- Presence กลางจาก SSE hub (user มี stream = ONLINE, idle > 10 นาที = AWAY) — แชร์ infra กับ Chat ได้ **แต่ namespace แยกเด็ดขาด** (`...:meeting:...` vs `...:chat:...`)
- resume ด้วย `Last-Event-ID` + reconnect banner ฝั่ง UI

### 8.5 User/Membership (แกนกลาง)
- ชื่อ/avatar staff อ่านสดจาก `User`+`Membership` — Meeting ไม่ copy เก็บ
- subscribe hooks: `membership.created` / `membership.unitAccessChanged` / `membership.removed` (§7.7)

### 8.6 AuditLog กลาง
บันทึก: สร้าง/archive channel, เปลี่ยน visibility/postingPolicy, ถอดสมาชิก (workspace+channel), ลบข้อความโดยคนที่ไม่ใช่ผู้ส่ง, workspace ADMIN เข้าห้อง PRIVATE ด้วย `meeting.admin`, สร้าง/แก้/ลบ integration — who/what/when/before/after

### 8.7 สิ่งที่ไม่ integrate (by design)
- ❌ ระบบ 10 Chat (ห้ามทุกชั้น — ลิงก์ preview title-only เท่านั้น)
- ❌ Point/POS/Account ขาออก — Meeting ไม่มีธุรกรรมเงิน/แต้ม (รับ event ขาเข้ามาแสดงอย่างเดียว)

---

## 9. Permissions

3 ชั้น: **module action** (RBAC กลาง) → **workspace role** (`MeetingWorkspaceMember.role`) → **channel role** (`MeetingChannelMember.role`) — การมองเห็นจริงคุมด้วย "การเป็นสมาชิก channel" เสมอ

### 9.1 Module actions (RBAC กลาง — `meeting.*`)

| Action | คำอธิบาย | OWNER | MANAGER | STAFF | Custom |
|---|---|---|---|---|---|
| `meeting.use` | เข้า workspace ที่เป็นสมาชิก, คุย, เธรด, react, save, ค้นหา, DM | ✅ | ✅ | ✅ (default) | ✅ ปิดได้รายคน |
| `meeting.create_channel` | สร้าง PUBLIC/PRIVATE channel | ✅ | ✅ | ✅ (default — ปิดได้) | ✅ |
| `meeting.manage_workspace` | จัดการสมาชิก workspace/settings/integrations (คู่กับ workspace role ADMIN) | ✅ | ✅ | ❌ | ✅ |
| `meeting.admin` | ฉุกเฉินระดับ tenant: เข้า/จัดการ channel ใด ๆ ทุก workspace แม้ไม่เป็นสมาชิก | ✅ | ❌ (default) | ❌ | ✅ |

### 9.2 Workspace role

| ความสามารถ | OWNER | ADMIN | MEMBER |
|---|---|---|---|
| เชิญ/ถอดสมาชิก workspace, เปลี่ยน role (ADMIN↓) | ✅ | ✅ | ❌ |
| แก้ settings + integrations | ✅ | ✅ | ❌ |
| โอน OWNER / archive workspace (= archive AppSystem) | ✅ | ❌ | ❌ |
| จัดการ channel ใดก็ได้ใน workspace (เท่า channel ADMIN) | ✅ | ✅ | ❌ |

### 9.3 Channel role + กติกา
- channel **ADMIN** (ผู้สร้าง + ผู้ที่ถูกตั้ง): เชิญ/ถอด, แก้ชื่อ/policy, archive, pin ห้องใหญ่, ลบข้อความคนอื่น, ใช้ `@channel` ห้องใหญ่
- ห้อง PRIVATE: คนนอกมองไม่เห็นใน directory/search/แม้รู้ id — รวมถึง OWNER; จำเป็นจริงใช้ `meeting.admin` → **AuditLog + system message "เจ้าของร้านเข้าร่วมห้อง"** (โปร่งใสต่อทีม)
- DM: 2 คนเท่านั้น เชิญเพิ่มไม่ได้ (สร้าง GROUP_DM ใหม่), ไม่มี channel ADMIN
- ทุกเส้น search/SSE/badge/files: บังคับ filter "สมาชิก channel (`leftAt IS NULL`)" ที่ service layer

---

## 10. Reports & Metrics

> เครื่องมือภายใน — เน้น adoption **ไม่ทำ per-user surveillance** (ห้ามมี message count รายคน / เวลาออนไลน์รายคน — ระบุใน spec กัน dev เผลอทำ)

| รายงาน/Metric | นิยาม | ใครเห็น |
|---|---|---|
| **Adoption รายสัปดาห์** | active user (ส่ง ≥ 1 ข้อความ/สัปดาห์) ÷ สมาชิก workspace, ข้อความ/วัน (กราฟ 30 วัน) | workspace OWNER/ADMIN |
| **Channel active** | channels เรียงตามข้อความ 7 วัน + channel เงียบ > 30 วัน (ชวน archive) | workspace OWNER/ADMIN |
| **Thread adoption** | % ข้อความที่คุยต่อในเธรด (สุขภาพการใช้แบบ Slack) | workspace OWNER/ADMIN |
| **Integration feed** | จำนวนการ์ด integration/วัน ต่อ subscription (ดู noise) | workspace ADMIN |
| **Storage** | พื้นที่ไฟล์รวมของ workspace (MB) เทียบ quota tenant | workspace OWNER/ADMIN |
| Export transcript | 🔜 พร้อมเครื่องมือ compliance | |

หน้า `/app/sys/[systemId]/settings#insights`: การ์ด 5 ใบ (active users, ข้อความ/วัน, thread %, channel เงียบ, storage) — ตัวเลขรวมเท่านั้น

---

## 11. Edge Cases & Rules

1. **ลบ/แก้ root ที่มีเธรด** — แก้ root: เธรดไม่กระทบ (root ในหน้าเธรดอัปเดตตาม + ป้ายแก้ไขแล้ว) · ลบ root: tombstone แต่ `replyCount/lastReplyAt` คงไว้ **เธรดยังเปิดอ่าน/ตอบได้** (แบบ Slack) — แถบเธรดใต้ tombstone ยังแสดง
2. **ลบ reply สุดท้ายของเธรด** — recompute `replyCount/lastReplyAt` ใน tx เดียวกับ soft delete; เธรด count เหลือ 0 → แถบเธรดหาย (follow rows คงไว้เฉย ๆ)
3. **ลบ channel** — v1 = archive เท่านั้น (read-only + ค้นเจอ + integration ปิดอัตโนมัติ); `#general` archive ไม่ได้ (409); hard delete 🔜 (ต้อง archive ≥ 7 วันก่อน + workspace OWNER + พิมพ์ชื่อยืนยัน + AuditLog)
4. **สมาชิกออกจาก tenant (Membership removed)** — ตัด SSE ทันที, ทุก API 403 ใน request ถัดไป, `leftAt` ทุก channel/workspace; ข้อความ/ไฟล์/reaction เก่าอยู่ครบ (ประวัติถาวร) ชื่อ render จาก User ได้แม้พ้นสภาพ; DM กับคนที่ออก → อ่านย้อนได้ ส่งเพิ่มไม่ได้ (banner "สมาชิกออกจากองค์กรแล้ว")
5. **แก้ข้อความแล้ว mentions เปลี่ยน** — เพิ่มคนใหม่ = แจ้งเตือนเฉพาะคนใหม่; ถอนคน = ลบแถว mention ที่ยัง unread; **ห้ามใช้แก้ไขดึงคนเข้าห้อง PRIVATE** (mention คนนอกห้อง = ตัวหนังสือเฉย ๆ)
6. **DM ซ้ำ / ส่งซ้ำ** — `dmKey = sha256(sorted userIds)` + `@@unique([systemId, dmKey])` → find-or-create idempotent (ยิงพร้อม 10 request = 1 ห้อง) · `@@unique([channelId, clientMessageId])` กันข้อความเบิ้ล
7. **@channel spam + fan-out** — จำกัดตาม §7.4; GROUP_DM cap 9 คน; CHANNEL ไม่ cap แต่ mention fan-out > 200 สมาชิกทำใน background job; `@here` นับ presence ณ เวลาโพสต์เท่านั้น
8. **OG unfurl ภายนอก — SSRF** — fetch ผ่าน proxy กลางเท่านั้น: block private IP/redirect ไป private, timeout 5 วิ, cache ต่อ URL 1 ชม., ขนาด response ≤ 1MB; ลิงก์ภายใน (`/app/...`) ไม่ยิง HTTP — resolve ตรงจาก service
9. **Integration ปลายทางหาย** — channel archived / ระบบต้นทางถูก archive/ลบ → `enabled: false` + notify ผู้สร้าง; event ไม่ match subscription ใด = ทิ้งเงียบ (ไม่ error); consumer idempotent ผ่าน `clientMessageId`
10. **หลาย workspace** — ทุก query ผูก `systemId`; badge/search/quick switcher แยกต่อ workspace; user ถูกถอดจาก workspace หนึ่ง ไม่กระทบอีกชุด
11. **ห้ามปนกับ Chat** — ไม่มี FK/JOIN/import ข้าม `Meeting*` ↔ `Chat*`; SSE hub infra ร่วมได้แต่ topic แยก namespace; reviewer ต้อง reject PR ที่ฝ่าฝืน
12. **การค้นหาภาษาไทย** — v1 trigram (`pg_trgm`) เพราะ tsvector 'simple' ตัดคำไทยไม่ได้ → substring match ≥ 3 ตัวอักษร; ระบุ limitation ใน release note; 🔜 thai tokenizer
13. **Ordering race** — ข้อความ createdAt ชนกัน ms เดียว → tiebreak ด้วย id; client แทรกข้อความจาก SSE ตามกติกา `(createdAt, id)` เดียวกับ server กัน jump
14. **ไฟล์ค้าง (อัปโหลดแล้วไม่ส่ง)** — `MeetingFile.messageId IS NULL` เกิน 24 ชม. → GC ลบ storage + แถว; โควตานับเฉพาะไฟล์ที่ผูกข้อความแล้ว + ไฟล์ค้าง < 24 ชม.
15. **editWindow หมดพอดีตอนกดแก้** — ตรวจฝั่ง server เป็นหลัก → 422 "หมดเวลาแก้ไข" (client แสดง inline ตาม feedback validation)

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Functional**
- [ ] สร้าง workspace → `#general` + สมาชิกทุกคนอัตโนมัติ; staff ใหม่เข้าเองเมื่อ `autoAddNewStaff`; สร้าง workspace ชุดที่ 2 → ข้อมูลแยกขาด (`systemId`)
- [ ] Channel ครบ 4 ประเภท; DM find-or-create ยิงพร้อม 10 request → 1 ห้อง; PRIVATE มองไม่เห็นจากคนนอกทุกช่องทาง (directory/search/id ตรง)
- [ ] `postingPolicy: ADMINS_ONLY`: MEMBER โพสต์ main → 403 แต่ตอบเธรดได้; `#general` leave/archive → 409
- [ ] **Threads**: reply ไม่โผล่ main pane, แถบ "n ตอบกลับ" ถูกต้อง, "ส่งเข้าห้องด้วย" โผล่ทั้งคู่, auto-follow (โพสต์/ตอบ/ถูก mention), เลิกติดตามแล้วไม่ถูก follow ซ้ำ, จอ "เธรดของฉัน" unread ถูก, ลบ root → เธรดยังตอบได้
- [ ] Mentions: `@user` badge+email digest (offline>10 นาที, throttle 15 นาที); `@channel` ห้อง >20 โดย MEMBER → 403; `@here` เฉพาะคน online; mention คนนอกห้อง → เงียบ
- [ ] Reactions: react/ถอน toggle idempotent (กดรัว ๆ ไม่เบิ้ล), รายชื่อคนกดถูก, realtime ทุก client
- [ ] Pins ≤ 100 (เกิน → 409) + Saved items ส่วนตัว (คนอื่นมองไม่เห็น) + jump กลับบริบทถูกตำแหน่ง
- [ ] แก้ไข: ป้าย "แก้ไขแล้ว" + editWindow enforce ฝั่ง server; ลบ → tombstone + ไฟล์หายจาก storage + หลุดจาก pins
- [ ] Markdown/code block render ถูก + ปุ่ม copy; ลิงก์ Meet → การ์ดสาย; OG unfurl ไม่ยิง private IP (ทดสอบ `http://169.254.169.254`)
- [ ] Search: ข้อความ/ไฟล์/คน — เจอเฉพาะ channel ที่เป็นสมาชิก (user 2 คนคนละห้องทดสอบไขว้), ไทย ≥ 3 ตัวอักษรเจอ, filter in:/from:/has: ทำงาน, jump พร้อม context
- [ ] Read: เส้น "ยังไม่ได้อ่าน" ถูกตำแหน่ง, sidebar หนา/badge เลข (mention+DM เท่านั้น) ตรง, sync ทุกแท็บผ่าน SSE + poll fallback
- [ ] Presence: online/away/offline เปลี่ยนตามจริง; typing แสดงใน channel และเธรดแยกกัน
- [ ] Integration: จองใหม่จริงในระบบจอง → การ์ดโผล่ channel ที่เลือกภายในไม่กี่วินาที; รัน consumer ซ้ำ → ไม่เบิ้ล; archive channel → subscription ปิด + แจ้งผู้สร้าง
- [ ] Pagination: เปิดห้อง/เลื่อนย้อน/jump anchor — ลำดับ `(createdAt, id)` ไม่มีข้อความหาย/ซ้ำ

**Isolation & Security**
- [ ] ทุก endpoint ด้วย id ของ tenant อื่น / workspace อื่น → 404/403 (รวม search, stream, uploads, files, integrations, link-preview)
- [ ] ลูกค้า/guest (session storefront) เรียกทุกเส้น → 401/403; user ที่ไม่ใช่สมาชิก workspace → 403 แม้มี `meeting.use`
- [ ] `meeting.admin` เข้าห้อง PRIVATE → AuditLog + system message ทุกครั้ง
- [ ] ถอด Membership → SSE หลุดทันที + API 403 ใน request ถัดไป; ถอดจาก workspace เดียว → อีก workspace ใช้ได้ปกติ
- [ ] ไม่มี import/FK/JOIN ระหว่าง `Meeting*` กับ `Chat*` (ตรวจ schema + grep module boundary)
- [ ] Integration card ไม่ leak ข้อมูลเกิน template; ลิงก์ในการ์ดเปิดโดยคนไม่มีสิทธิ์ระบบต้นทาง → 403 ที่ระบบนั้น
- [ ] AuditLog ครบทุกรายการใน §8.6

**i18n & UI**
- [ ] ทุก string TH/EN รวม email digest, system message, tombstone, banner ทุกใบ
- [ ] Desktop ≥ 1200px = 3 pane (sidebar/main/thread); mobile ≤ 390px = drawer 2 ชั้น + เธรดเต็มจอ + bottom sheet + composer sticky
- [ ] Empty/loading/error ครบ: workspace ใหม่, channel ว่าง ("ทักทายทีมของคุณได้เลย 👋"), search ไม่เจอ, SSE reconnect banner
- [ ] B&W minimal: unread หนา/badge/เส้นยังไม่ได้อ่าน/การ์ด ใช้น้ำหนัก+เส้น ไม่พึ่งสี; ไม่มี jargon (ใช้ "ห้อง/channel", "เธรด", "ปักหมุด", "บันทึกไว้")
