# K3.9 — อีเมลเข้าบอร์ด + push รายคน · โน้ตผู้ทำ

> สถานะ: **ข้อสอบ 12/13 (แดงเฉพาะ S4.2 = ภาพ ซึ่ง Fable เป็นคนถ่าย) · tsc 0 · fitness 23/23 ทั้งแบบมี env และไม่มี env · regressions 11 ชุดเขียว**
> เครื่อง: worktree `/root/projects/shark-kanban` branch `session/kanban` · migration `kanban_v2_u` (additive) ลง QC แล้ว
> ⚠️ ไม่ได้รัน `next build` / ไม่ได้ commit ตามกติกาเครื่อง — Fable build + ถ่าย spec `"3.9"` ตอนรับงาน

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `prisma/schema/kanban.prisma` | `KanbanBoard.emailKey String?` + `@@index([emailKey])` (ค้นด้วยกุญแจล้วน — อีเมลขาเข้ายังไม่รู้ร้าน) |
| `prisma/migrations/20261011000000_kanban_v2_u/migration.sql` **(ใหม่)** | ADD COLUMN + `KanbanBoard_emailKey_idx` + **partial unique** `KanbanBoard_tenantId_emailKey_key … WHERE "emailKey" IS NOT NULL` (เขียนมือ แบบเดียวกับ `KanbanCard_tenantId_sourceKey_key` ของ K3.1) · additive ล้วน ไม่มี DROP/ALTER TYPE |
| `src/lib/modules/kanban/boards-email.ts` **(ใหม่)** | `ensureEmailKey` / `rotateEmailKey` / `getBoardEmailKey` (ADMIN ของบอร์ด) · `findBoardByEmailKey` · `boardEmailKeyFromRecipients` · `boardEmailAddress` · `isBoardEmailKey` · กุญแจ base32 8 ตัวจาก `crypto.getRandomValues` (rejection sampling · ไม่มี `Math.random`) |
| `src/lib/modules/kanban/service.ts` | re-export ของข้างบนผ่าน facade (ข้อสอบ import `kanban/boards` → fallback `kanban/service`) |
| `src/lib/modules/kanban/activity-text.ts` | ประโยคไทยของ `BOARD_UPDATED {emailKeyRotated/emailKeyCreated}` + `FIELD_TH.emailKey` |
| `src/lib/platform/kanban-email-in.ts` **(ใหม่)** | `ingestInboundEmail(payload, deps?)` — composition root · เขียนบอร์ดผ่าน facade `links.createCardFromExternal` เท่านั้น |
| `src/app/api/email/inbound/route.ts` **(ใหม่)** | `POST` 503/401/413 → normalize (Resend `data{}` / Cloudflare flat) → `ingestInboundEmail` → 200 `{ok, created}` · `GET` health |
| `src/lib/env.ts` | `EMAIL_INBOUND_SECRET` (default `""` = ปิดบริการ) + `emailInboundSecret` |
| `src/lib/core/push.ts` | **`sendPushToUsers(tenantId, userIds, msg, {post})`** ใหม่ + `deliverBatch` คืน `okIndexes` (รู้ว่าใบไหนถึงจริง) · `MAX_PUSH_USERS = 500` |
| `src/lib/modules/kanban/notify.ts` | แยก `deliverInAppAndEmail` (ไม่ push) + **`notifyKanbanUsers`** (จุดเดียวที่โมดูลแจ้งเตือน · push ครั้งเดียวท้ายรอบ) · `notifyKanbanUser` = เปลือกบาง (`strict`) · `notifyWatchers` ใช้ตัวใหม่ |
| `src/lib/modules/kanban/reminders.ts` | 2 ลูป (ใกล้ถึงกำหนด/เลยกำหนด) → `notifyKanbanUsers` ครั้งเดียวต่อการ์ด |
| `src/lib/modules/kanban/automation.ts` | การกระทำ `notify` → `notifyKanbanUsers({ strict: true })` (คงพฤติกรรมเดิม: เขียนใบไม่ได้ = กฎรอบนั้นล้ม) |
| `src/lib/modules/kanban/actions.ts` | `ensureEmailKeyAction` / `rotateEmailKeyAction` (คีย์ `kanban.board.member.manage`) |
| `src/components/kanban/BoardEmailIn.tsx` **(ใหม่)** | บล็อก `board-email-in`: ที่อยู่ + ปุ่มคัดลอก + "สร้างที่อยู่ใหม่ (ของเก่าใช้ไม่ได้)" + คำเตือนเรื่องคนที่เห็นที่อยู่ |
| `src/app/app/sys/[id]/kanban/b/[boardId]/settings/[tab]/page.tsx` | แท็บ "ทั่วไป" กลายเป็น async — โหลด `getBoardEmailKey` + สวิตช์ แล้ววาง `<BoardEmailIn>` ต่อท้าย |
| `src/components/kanban/IntegrationsSettings.tsx` | ย้าย `cardFromEmail` จากบล็อก "เร็ว ๆ นี้" มาเป็นสวิตช์จริงตัวที่ 7 (`board: false` + note ว่าที่อยู่อยู่ที่ตั้งค่าบอร์ด) · ลบบล็อก `SOON` ทิ้ง |
| `scripts/visual-kanban.mts` | spec `"3.9"` 3 ภาพ + บล็อกเตรียมข้อมูล (`KB39`) + คืนสภาพใน `restoreSeed()` |

**ไม่ได้แตะ**: `scripts/qc-kanban-k3.9.mts` (ข้อสอบ) · `scripts/fitness.mts` (ไม่ต้องเพิ่มเส้น — ตัวรับอีเมลอยู่นอก `src/lib/modules/**`) · `.env` ของ prod

---

## 2. ผลข้อสอบ K3.9

```
JSON_SUMMARY {"total":13,"passed":12,"findings":["K3.9-S4.2"]}
FINDINGS: CRITICAL 0 · MAJOR 1 · MINOR 0
```

เขียวทั้งหมด: `S1.1 S1.2 S1.3 S2.1 S2.2 S2.3 S2.4 S2.5 S3.1 S3.2 S3.3 S4.1`
แดงข้อเดียว: **`S4.2` = ภาพจริงใน `.qc-shots/kanban/3.9`** — builder ห้ามรัน build/ถ่ายภาพเอง (กติกาเครื่อง) ⇒ ข้อนี้จะเขียวเมื่อ Fable ถ่าย spec `"3.9"`

**ไม่มีข้อแย้งข้อสอบ** — ข้อสอบตรงกับสัญญาทุกข้อ

## 3. tsc / fitness / regressions

| อะไร | ผล |
|---|---|
| `tsc --noEmit -p tsconfig.json` | **0 error** |
| `fitness.mts` (มี env QC) | **23/23** |
| `fitness.mts` (ไม่มี env เลย — `env -u DATABASE_URL …`) | **23/23** |
| `qc-kanban-k2.11` (เตือน/push) | 30/30 |
| `qc-kanban-k2.10` (watch/notify) | 22/22 |
| `qc-kanban-k2.9` (automation notify) | 26/26 (รันซ้ำหลังใส่ `strict: true` ก็ 26/26) |
| `qc-kanban-k3.3` (bridges/integrations) | 15/15 |
| `qc-kanban-k3.1` | 20/20 |
| `qc-kanban-k1.12` (notify §7.4) | 18/18 |
| `qc-chat-push-badge` | 48/48 |
| `qc-kanban-k1.8` (ตัวส่ง push รายคน) | 18/18 |
| `qc-kanban-notify` | 12/12 |
| `qc-chat-notify-v2` (เฝ้า `push.ts` ว่ามีตัวเลือกผู้รับ) | 30/30 |
| `qc-kanban-k1.1` (cardNoSeq) | 30/30 **หลังคืน `cardNoSeq`** (ดู §6) |

---

## 4. spec `"3.9"` — ภาพที่เขียนไว้ให้ Fable ถ่าย (ยังไม่รันเอง)

บล็อกเตรียมข้อมูลใน `visual-kanban.mts` (`WO === "3.9"`) เปิดที่อยู่อีเมลจริงของบอร์ด "ซ่อมบำรุงอุปกรณ์"
(`ensureEmailKey`) → เปิดสวิตช์ `cardFromEmail` → **ยิงอีเมล 1 ฉบับผ่าน `ingestInboundEmail` จริง**
(ไม่มีไฟล์แนบ — ที่เก็บไฟล์ปิดอยู่บน QC) ⇒ ภาพที่ 3 เป็นผลของเส้นเต็มทอด ไม่ใช่การ์ดที่วางมือ

| ชื่อภาพ | อุปกรณ์ | เห็นอะไร |
|---|---|---|
| `board-email-in` | desktop | ตั้งค่าบอร์ด › ทั่วไป — บล็อก "อีเมลเข้าบอร์ด" พร้อมที่อยู่ `งาน+{key}@shark.in.th` + ปุ่มคัดลอก + "สร้างที่อยู่ใหม่ (ของเก่าใช้ไม่ได้)" + คำอธิบาย หัวข้อ/เนื้อหา/ไฟล์แนบ |
| `integrations-email-switch` | desktop | ตั้งค่าบอร์ดงาน › การเชื่อมต่อ — สวิตช์ "การ์ดจากอีเมล" **ติ๊กอยู่จริง** (K3.3 เคยเป็น "เร็ว ๆ นี้") |
| `email-card-on-board` | desktop | บอร์ดซ่อมบำรุง — การ์ด "ขอใบเสนอราคาทริปดำน้ำสิมิลัน…" พร้อมชิปที่มา "จากอีเมล" |

คืนสภาพใน `restoreSeed()`: ลบการ์ดที่เกิด · คืน `emailKey` เดิม (`null`) · คืน `cardNoSeq` · คืน `AppSystem.settings`

---

## 5. 🔴 prod ยังใช้ไม่ได้จนกว่าเจ้าของจะตั้งค่า 3 อย่าง (ต้องอยู่ใน handover)

โค้ดพร้อมทั้งเส้น แต่ **ยังไม่มีผู้ให้บริการอีเมลขาเข้า** ⇒ วันนี้ที่อยู่ `งาน+{key}@shark.in.th` ที่จอโชว์
ยังไม่มีอะไรมารับ · ต้องทำตามลำดับนี้:

1. **DNS ของ `shark.in.th`** — เพิ่ม MX ชี้ไปผู้ให้บริการที่เลือก
   (Cloudflare Email Routing = ฟรี · Resend Inbound = อยู่ในบัญชีเดิมที่ใช้ส่งอีเมลอยู่แล้ว)
   ⚠️ ถ้าโดเมนนี้รับเมลปกติของกิจการอยู่ ต้องคุยเรื่อง MX ก่อน — เปลี่ยนผิดคือเมลบริษัทหาย
   (ทางเลี่ยง: ใช้ซับโดเมน เช่น `tasks.shark.in.th` แล้วแก้ `BOARD_EMAIL_DOMAIN` ใน `boards-email.ts` ที่เดียว)
2. **ตั้ง env `EMAIL_INBOUND_SECRET`** บน Vercel (สุ่มยาว ≥ 32 ตัว) — **ไม่ตั้ง = route ตอบ 503 ปิดสนิท** (fail-closed ตั้งใจ)
3. **ตั้ง webhook ของผู้ให้บริการ** ให้ POST มาที่ `https://shark.in.th/api/email/inbound`
   พร้อม header `X-Inbound-Secret: <ค่าเดียวกับ env>` · route รับรูป payload ของ Resend (ห่อใน `data`)
   และของ Cloudflare Email Worker (แบน ๆ ที่ราก) ได้ทั้งคู่โดยไม่ต้องแก้โค้ด

จากนั้นในแอป: ตั้งค่าบอร์ดงาน › การเชื่อมต่อ → เปิด "การ์ดจากอีเมล" (ปริยายปิด ตาม D6) ·
แล้วแต่ละบอร์ด: ตั้งค่าบอร์ด › ทั่วไป → "เปิดที่อยู่อีเมลของบอร์ด"

**ไฟล์แนบบน prod**: ต้องมี `SHARK_BUNNY_*` ครบ (มีอยู่แล้ว) — ถ้าไม่ครบ การ์ดยังเกิด แต่ไฟล์แนบถูกข้ามเงียบ ๆ (ตั้งใจ: งานสำคัญกว่าไฟล์)

---

## 6. หนี้ / ข้อจำกัด / ที่ตัดสินใจเอง

1. **ไม่ตรวจไบต์หัวไฟล์ (magic bytes) ของไฟล์แนบจากอีเมล** — ตรวจแค่ "ชนิดที่ประกาศต้องอยู่ใน `ALLOWED_UPLOAD_TYPES`" + ขนาด ≤ 10MB + จำนวน ≤ 20
   · เหตุผล: เส้นทางนี้เหมือน `copyExternalAttachments` ของ K3.2 (ไฟล์จากแชท) ที่ไม่ sniff เช่นกัน · ไฟล์ถูกเก็บบน CDN และเสิร์ฟตามนามสกุลของชนิดที่ประกาศ ไม่มีการเรนเดอร์ inline
   · **และข้อสอบ S2.2 ส่งไฟล์ตัวอย่างที่ประกาศ `application/pdf` แต่เนื้อคือสตริง `"PDF"` 3 ไบต์** ⇒ ถ้าใส่ด่าน magic bytes แบบ `attachments.ts` ข้อนี้จะแดงทันที · ถ้าอยากได้ด่านนั้นจริง ต้องแก้ fixture ในข้อสอบก่อน (Fable ตัดสิน)
2. **`FileAsset` ซ้ำ 1 แถวต่อไฟล์เมื่อใช้ตัวอัปโหลดจริง** — `storage.uploadFile` สร้าง `FileAsset` เอง แล้ว `links.copyExternalAttachments` สร้างอีกแถวที่ชี้ `cdnUrl` เดียวกัน (ไฟล์จริงมีชิ้นเดียว) · ไม่กระทบผู้ใช้ · แก้ได้ตอนมีประตู "แนบไฟล์ที่อัปแล้ว" ใน facade
3. **ไม่มี REST op / AI tool ของ K3.9** — สัญญาไม่ได้สั่ง และ F13.4 บังคับว่าทุก op ต้องมีข้อสอบ ⇒ เพิ่มพร้อมข้อสอบตอน K3.F ถ้าต้องการ (`boards.emailKey.ensure/rotate`, `integrations.get/set` ที่ค้างจาก K3.2)
4. **`emailKey` ไม่ซ้ำทั้งระบบ** ถูกบังคับ **ในโค้ด** (`freshKey()` สุ่มใหม่ถ้าชน · `findBoardByEmailKey` ปฏิเสธถ้าเจอ > 1 ใบ) เพราะดัชนี unique เป็น `(tenantId, emailKey)` ตามสัญญา — ถ้าวันหน้าอยากให้ DB บังคับเอง ต้องเพิ่ม unique บน `emailKey` ล้วน (จะทำให้ข้อสอบ S1.1 ที่นับดัชนี unique = 1 แดง)
5. **ประวัติกิจกรรมไม่จดตัวกุญแจ** (จดแค่ `emailKeyRotated/emailKeyCreated`) — ประวัติบอร์ดคนอ่านได้ถึงระดับ VIEWER ⇒ จดกุญแจไว้ = ที่อยู่ที่เพิ่งหมุนหนีไปโผล่ให้คนกลุ่มเดิมอ่านอยู่ดี
6. **หมุนกุญแจไม่มีช่วงผ่อนผัน** — ของเก่าตายทันที (คอลัมน์เดียว) · ตั้งใจ: คนกดปุ่มนี้คือคนที่รู้ว่าที่อยู่หลุด
7. **การเปลี่ยนพฤติกรรม push (ต้องรู้ตอนอ่าน log)**: ผู้เรียกหลายคนยิง push **รอบเดียว** แล้ว ⇒ จำนวนคำขอไป Expo ลดลงมาก และข้อความ `logOps` เปลี่ยนรูปเป็น "…(ร้าน {tenantId} · {n} คน)" แทน "…(ผู้ใช้ {userId})" · `sendPushToUser` เดิม **ยังอยู่ครบ** (ข้อสอบ K1.8-S1.2 เฝ้าอยู่ + comments.ts/notifyCardAssigned ใช้ผ่าน `notifyKanbanUser`)
8. **ความหมายของ `skipped`** ใน `sendPushToUsers` = จำนวน **คน** ที่ไม่ได้รับอะไรเลย (ทั้งที่ไม่มีเครื่อง และที่ยิงแล้ว Expo ปฏิเสธ) ⇒ `users.sent.length + skipped` = จำนวนคนที่ถูกขอให้แจ้งเสมอ · เขียนไว้ในคอมเมนต์ของฟังก์ชันแล้ว
9. **`cardNoSeq` ของบอร์ด QC**: ข้อสอบ K3.9 สร้างการ์ด 2 ใบต่อรอบแล้วลบทิ้ง แต่ **ไม่คืน `cardNoSeq`** ⇒ `qc-kanban-k1.1 S2.5` ("cardNoSeq = cardNo สูงสุด") แดงหลังรัน · builder คืนให้แล้วด้วย SQL เดียวกับ cleanup ของ k1.1 เอง (`cardNoSeq = MAX(cardNo)` ของทุกบอร์ดในร้าน QC) แล้วรัน k1.1 ซ้ำ = **30/30** · ถ้าจะกันถาวร ต้องเพิ่มบรรทัดคืน `cardNoSeq` ใน `finally` ของข้อสอบ K3.9 (Fable แก้)
10. **สวิตช์ "การ์ดจากอีเมล" ไม่มีช่องเลือกบอร์ดปลายทาง** — ปลายทางมาจากที่อยู่ที่อีเมลถูกส่งไป (ของแต่ละบอร์ด) ⇒ ให้เลือกซ้ำอีกที่จะเป็นค่าที่ขัดกันเอง · `integrations.cardFromEmail.boardId` ยังอยู่ในสคีมา (ไม่ได้ใช้ · ไม่ลบเพื่อไม่แตะ K3.2/K3.3)

---

## 7. คืนสภาพข้อมูล QC (ยืนยันด้วยการอ่าน DB หลังรันทุกอย่าง)

```
งานร้าน — สาขาป่าตอง: emailKey=null seq=24   (การ์ด 24)
ซ่อมบำรุงอุปกรณ์    : emailKey=null seq=11   (การ์ด 11)
บอร์ดลับสาขากะตะ    : emailKey=null seq=3    (การ์ด 3)
การ์ด ACTIVE รวม 38 · sourceType EMAIL 0 · PushDevice qc-k39 0 · FileAsset qc-k39 0
AppSystem.settings.integrations = null (เท่าเดิมก่อนรัน)
```

migration `kanban_v2_u` **ยังไม่ลง prod** (ลง QC ด้วย `prisma migrate deploy` แล้ว) — prod จะได้ตอน Vercel build ตามกติกาข้อ 5
