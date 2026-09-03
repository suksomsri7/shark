# WO-CV13 — LINE ส่งข้อความเสียงแบบ async (ปิด D31 ทาง ข) · Fable สั่ง 2 ก.ย. 2026 · สาย M (Opus 5)

อ่านก่อน: `CLAUDE.md` · `ledger/PLAN-CHAT-V2.md` §10 (D29/D30/D31) + §11 · `scripts/voice-transcode-worker.mts` ·
`src/lib/modules/chat/{adapter,line,service}.ts` (sendReply บรรทัด ~1250–1500) · `bubble.tsx` deliveryMark ·
`inbox-actions.ts` ThreadMessage · `outbox-consumers.ts` (กติกา consumer) · ข้อสอบต้นแบบ `scripts/qc-chat-core-v2.mts` (fake prisma in-memory) และ `scripts/qc-chat-v2-voice.mts`

## เป้า (ต้องครบทุกข้อ ไม่ครบ = ยังไม่เสร็จ)
ทีมกดไมค์ในห้อง LINE → อัด WAV → ส่ง → **ฟองขึ้นสถานะ "กำลังแปลงไฟล์เพื่อส่งเข้า LINE" (นาฬิกา) ห้ามขึ้น ✓** →
worker บน VPS (ทุก 1 นาที) แปลง wav→m4a แล้ว **ส่งเข้า LINE เอง** → SENT (✓) หรือ FAILED (✗ + ปุ่มส่งซ้ำ)

เงื่อนไข D31 ที่บังคับ: (1) cron ถี่ 1 นาที (2) สถานะฟองต้องตรงความจริง ห้าม ✓ ก่อนถึง (3) ถ้าเพิ่ม outbox event type ใหม่ **ต้องลงทะเบียน consumer** ใน `src/lib/outbox-consumers.ts` (ข้อสอบ CP-6 สแกน — แนะนำ: ไม่ต้องเพิ่ม type ใหม่ ใช้ `chat.message.sent` เดิม + ChatConversationEvent/OpsEvent)

## งาน
### M1 adapter
- `adapter.ts`: `OutboundMessage` เพิ่ม `type: "AUDIO"` + `audioUrl` + `durationMs` (additive)
- `line.ts`: `sendMessage` รองรับ AUDIO → `{ type: "audio", originalContentUrl: audioUrl, duration: durationMs }`
  (LINE รับเฉพาะ https + m4a + duration เป็น ms) · `capabilities.audio: true` · แก้คอมเมนต์หัว capabilities ให้ตรงความจริงใหม่ (ลบย่อหน้า "ยังไม่ตัดสิน")
- `buildOutboundMessages` ใน service.ts: ไฟล์แนบ audio ที่มี `durationMs` → AUDIO outbound · ไฟล์ audio ไม่มี durationMs → ลิงก์ข้อความเหมือนเดิม

### M2 sendReply (service.ts)
- ห้อง LINE (ทั่วไป: ช่องทางที่ `canSendAudio` = true และไม่ใช่ WEBCHAT) + `isVoice`:
  - ไฟล์เป็น **wav** (`audio/wav`, `audio/x-wav`) → สร้างแถว `deliveryStatus: "PENDING"` + `meta.pendingReason = "TRANSCODE"` · **ไม่เรียก adapter** · emit `chat.message.sent` ตามเดิม · คืน `{ok:true, messageId}`
  - ไฟล์เป็น m4a (`audio/mp4`, `audio/x-m4a`) → ส่งทันทีผ่าน adapter เป็น AUDIO (เส้นเดิม)
- 🔴 refactor ให้ "ยิง adapter + อัปเดต SENT/FAILED + TOKEN_EXPIRED + logEvent DELIVERY_FAILED" เป็น helper เดียว (เช่น `deliverOut(...)`) ที่ทั้ง sendReply และ M3 ใช้ร่วม — **ห้าม fork ตรรกะส่ง** (fitness มีด่านกันโค้ดซ้ำ)
- ห้าม: เปลี่ยนพฤติกรรม WEBCHAT/โน้ตภายใน/รูป/ไฟล์ · ห้ามแตะ composer.tsx / inbox-client.tsx / room-actions.ts / หน้า settings (สาย N ถืออยู่ในอีก worktree)

### M3 ตัวส่งที่ค้าง `deliverPendingVoice({ limit })` (export จาก service.ts · เรียกได้จากสคริปต์นอก Next)
- หา ChatMessage: `direction OUT · type AUDIO · deliveryStatus PENDING · isInternal false · meta.pendingReason TRANSCODE`
  - ไฟล์แนบ AUDIO เป็น m4a แล้ว → ส่งผ่าน helper จาก M2 → SENT (externalMessageId) / FAILED (deliveryError)
  - ยังเป็น wav และแถวอายุ > 30 นาที → FAILED `TRANSCODE_TIMEOUT` (ฟองขึ้น ✗ + ปุ่มส่งซ้ำ; retrySendAction เดิมใช้ได้ — ถ้าส่งซ้ำตอนไฟล์เป็น m4a แล้วจะส่งทันที)
  - ยังเป็น wav อายุไม่ถึง → ข้าม
- 🔒 **S1 ความปลอดภัย**: URL เสียงที่ส่งให้ LINE ต้องขึ้นต้นด้วย `SHARK_BUNNY_CDN` ของเราเท่านั้น — URL อื่น → FAILED `AUDIO_URL_NOT_CDN` (ไฟล์แนบเข้ามาทาง API v1 จากระบบภายนอกได้ ห้ามให้ LINE/worker ไปดึงที่อื่น)
- หลัง SENT: `publishChat(tenantId, systemId, EV_CHAT_NEW, { conversationId, kind: "outbound" })` best-effort (ไม่มี ABLY = no-op · polling เห็นเอง)
- เรียกจาก 2 ที่: (ก) ท้าย `scripts/voice-transcode-worker.mts` หลังลูปแปลง (dynamic import service) (ข) `src/lib/platform/cron.ts` รายชั่วโมง best-effort (ตาข่ายเผื่อ VPS ตาย — ส่งได้เฉพาะแถวที่เป็น m4a แล้ว)

### M4 worker (`scripts/voice-transcode-worker.mts`)
- 🔒 **S2**: query เพิ่ม `kind: "AUDIO"` และ `url: { startsWith: CDN + "/" }` — (1) wav ที่แนบเป็น "ไฟล์เอกสาร" ต้องไม่ถูกแปลง/เปลี่ยนชื่อเงียบ ๆ (2) กัน SSRF: worker fetch `r.url` จาก DB — แถวที่ระบบภายนอกยัด url ภายใน (169.254.x / localhost) เข้ามาต้องไม่ถูกดึงจาก VPS
- หลังลูป: เรียก `deliverPendingVoice` แล้ว log สรุป "ส่งเข้า LINE สำเร็จ n · ล้ม n"
- crontab บน VPS: เปลี่ยนบรรทัด worker จาก `*/5` เป็น `* * * * *` เท่านั้น (ใช้ `crontab -l | sed ... | crontab -` · ห้ามแตะบรรทัดอื่น · แสดง diff ก่อน/หลังในรายงาน) · flock เดิมกันซ้อนอยู่แล้ว

### M5 ฟอง (bubble.tsx + inbox-actions.ts)
- `ThreadMessage` เพิ่ม `pendingReason: string | null` (จาก meta) · mapping ใน inbox-actions
- `deliveryMark`: PENDING + pendingReason TRANSCODE → icon `clock` · title "กำลังแปลงไฟล์เสียงเพื่อส่งเข้า LINE (ไม่เกิน 1–2 นาที)" · `read:false` · ห้ามคืน check
- ปุ่มไมค์ในห้อง LINE ต้องกดได้แล้ว: ตามเส้น `voice.canSendAudio` / `capabilityReason` จาก composer ← inbox-client ← server ให้ครบ (อ่านอย่างเดียวถ้าอยู่ในไฟล์ของสาย N — ถ้าต้องแก้ไฟล์เหล่านั้น **หยุดแล้วรายงาน** อย่าแก้)

### M6 ข้อสอบ (additive · ห้ามลบ/แก้ข้อเดิม) — `scripts/qc-chat-v2-voice.mts` เพิ่มหมวด VO-11
ใช้ harness fake prisma แบบ `qc-chat-core-v2.mts` (ศึกษาก่อน) · stub `fetch` จับ payload ที่ยิง LINE
- VO-11.1 LINE `capabilities.audio === true` + sendMessage AUDIO → body มี `type:"audio"`, `originalContentUrl`, `duration`
- VO-11.2 sendReply เสียง wav ห้อง LINE → PENDING + meta.pendingReason=TRANSCODE + **ไม่ยิง fetch** + ยังมี outbox `chat.message.sent`
- VO-11.3 sendReply เสียง m4a ห้อง LINE → ยิง audio ทันที → SENT + externalMessageId
- VO-11.4 deliverPendingVoice: m4a → SENT · wav อายุน้อย → ไม่แตะ · wav อายุ >30 นาที → FAILED TRANSCODE_TIMEOUT
- VO-11.5 adapter โยน → FAILED + deliveryError + ChatConversationEvent DELIVERY_FAILED · TOKEN_EXPIRED → connection ERROR
- VO-11.6 S1: url นอก CDN → FAILED AUDIO_URL_NOT_CDN ไม่ยิง fetch
- VO-11.7 deliveryMark(PENDING, TRANSCODE) → icon clock + title มีคำว่า LINE · ไม่ใช่ check
- VO-11.8 (static) worker มี `kind: "AUDIO"` + `startsWith` CDN + เรียก deliverPendingVoice · line.ts ไม่มีข้อความ "ยังไม่ตัดสิน"
- **fail-before**: รันข้อสอบใหม่ก่อนแก้โค้ด → ต้องแดง · หลังแก้ → เขียว · ใส่ผลทั้งสองรอบในรายงาน
- ข้อเดิม VO-4.x/VO-10.x ต้องยังเขียว (ห้ามลดจำนวนข้อ)

### M7 เอกสาร
- `ledger/PLAN-CHAT-V2.md`: D31 → ✅ พร้อมสรุปวิธี · เพิ่ม §12 WO-CV13 ตาราง M1–M7 สภาพจริง · **ห้ามแตะ RESUME.md** (Fable เขียนเอง)

## ด่านก่อนส่งรายงาน (รันตามลำดับ · ผ่าน with-gate-lock อยู่แล้วเมื่อใช้ pnpm script)
`pnpm typecheck` → `pnpm fitness` → `pnpm qc:all chat` (ทุกชุดที่ชื่อมี chat) → `pnpm qc:all outbox platform` (ถ้ามี)
ห้ามรัน `pnpm build` / `pnpm qc:all` เต็ม (Fable รันเอง) · ห้าม git commit/push (Fable ตรวจ diff แล้ว commit เอง) · ห้าม deploy

## รายงาน (ภาษาไทย) ต้องมี
ไฟล์ที่แตะ · ผลด่านทุกตัวเป็นตัวเลข · fail-before/after ของ VO-11 · diff crontab · สิ่งที่ตัดสินใจเองนอกใบสั่ง · ของที่ทำไม่ได้พร้อมเหตุผล
