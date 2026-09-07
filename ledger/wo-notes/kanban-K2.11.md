# K2.11 — ติดตาม (watch) + แจ้งเตือนตาม §7.4 + ความถี่อีเมล + cron เตือน/เลยกำหนด + อีเมลสรุป

> ผู้ทำ: Opus (builder) · เริ่ม 7 ก.ย. 2026 · สัญญา: `ledger/KANBAN-RUN.md` §K2.11 · oracle `scripts/qc-kanban-k2.11.mts` (30 ข้อ)

## 1. ทำอะไรไปบ้าง (ตามลำดับ)
1. **ไมเกรชัน `kanban_v2_p`** (additive ล้วน · อ่าน SQL ด้วยตาแล้ว): `enum KanbanWatchTargetType` · `KanbanWatcher` (unique(targetType,targetId,userId) + index(tenantId,systemId,userId)) · `KanbanDigestSent` (unique(tenantId,userId,periodKey)) · `AppNotification.emailedAt` (nullable) → `prisma migrate deploy` บน QC + `prisma generate` (ไม่ได้รัน `prisma format`)
2. **`scope.ts`**: `KanbanWatcher: sys()` · `KanbanDigestSent: tenant`
3. **`core/user-preferences.ts`**: เพิ่ม `kanbanEmailMode` (OFF|HOURLY|INSTANT · ปริยาย HOURLY) + `kanbanDigest` (OFF|DAILY|WEEKLY · ปริยาย DAILY) · ค่าแปลก → ปริยาย · patch ไม่ทับคีย์อื่น (ตัวเดิม `setUserPreferences` merge อยู่แล้ว)
4. **`kanban/watch.ts`** (ใหม่): `watch/unwatch/isWatching/listWatchers/resolveWatchersForCard/myWatched` + ตัวช่วยจอ `boardWatchState`/`cardWatchState`/`requireActor` + `notifiableWatchersForCard`
5. **`kanban/notify.ts`**: `KanbanNotifyInput` เพิ่ม `push?` / `emailedAt?` · `notifyKanbanUserByPreference` (INSTANT/HOURLY/OFF) · `notifyWatchers` (push เฉพาะ COMMENT) · `shortenForNotice`
6. **จุดเรียก 3 ที่**: `comments.ts#addComment` (excludeUserIds = mentions) · `moves.ts#moveCard` (เฉพาะข้ามคอลัมน์) · `cards.ts#archiveCard` — ทั้งหมดนอก tx · best-effort
7. **`kanban/reminders.ts`** (ใหม่): `sweepDueSoonReminders(now)` (claim ต่อใบด้วย `reminderSentAt` · outbox `kanban.card.due_soon`) · `sweepOverdue(now)` (คีย์รายวันไทย · D20 = ผู้รับผิดชอบ + ADMIN ที่ถูกเชิญชัด · ไม่ push)
8. **`kanban/digest.ts`** (ใหม่): `sweepKanbanEmailHourly(now, deps)` · `sweepKanbanDigest(now, deps)` — `deps.sendEmail` ฉีดได้
9. **cron**: `hourly/route.ts` + `runDailyCron` (try/catch แยก · คืนค่าใน JSON) · ไม่แตะ `vercel.json`
10. **UI**: `CardBack` (กลุ่ม "ติดตาม" testid `card-watch`) · `Column` (เมนู ⋯ `column-watch`) · `BoardHeader` (เมนู ⋯ `board-watch`) · `MyTasks` (`my-watched` ใช้ข้อมูลจริง) · `NotifyPrefs.tsx` (`notify-prefs`) ในหน้า `/kanban/settings`
11. **actions**: `watchAction` · `unwatchAction` · `setKanbanNotifyPrefsAction`
12. **ภาพ**: spec `"2.11"` ใน `scripts/visual-kanban.mts` (5 สเปค · เตรียม/คืนแถวติดตามของเจ้าของร้านเอง)

## 2. ผลด่าน (ตัวเลขจริง)

> ⚠️ container รีสตาร์ทระหว่าง builder รัน build+regressions พร้อมกัน (15:45) — Fable เก็บงานต่อเอง: build QC server → ภาพ spec 2.11 6 ใบ (failures 0) → fitness 23/23 → oracle **30/30** → regressions k1.8/k1.4/k1.13/k2.7/k2.9/k2.10/notify/nav เขียว
| ด่าน | ผล |
|---|---|
| oracle `qc-kanban-k2.11.mts` | (เติมหลังถ่ายภาพ) |
| typecheck `tsc --noEmit` | 0 error |
| fitness | 23/23 (Fable รันหลัง container รีสตาร์ท) |
| regressions | (เติม) |

## 3. Deviation / การตัดสินใจที่ต่างจากสัญญาเล็กน้อย (พร้อมเหตุผล)
1. **`moveCardSideways` ตรวจ `direction` แล้ว** (`moves.ts`): ของเดิมตีความค่าที่ไม่ใช่ `"left"` ว่าเป็น `"right"` เงียบ ๆ ⇒ ผู้เรียกที่ลืมส่ง/ส่งค่าเพี้ยนจะ "ย้ายการ์ดจริง" โดยไม่มีใครสั่ง (และตั้งแต่ WO นี้ = ผู้ติดตามได้ใบแจ้งเตือนจากคำสั่งที่ไม่มีอยู่จริง) → เพิ่มด่าน `fail("NOT_FOUND")` เมื่อ direction ไม่ใช่ left/right · ผู้เรียกในระบบทั้งหมด (`actions.moveCardSidewaysAction`, `service.moveCardSideways`) ส่งค่าชัดอยู่แล้ว ⇒ ไม่มีพฤติกรรมเดิมที่พัง
2. **ด่าน "มองเห็นบอร์ดไหม" แยกเป็น 2 ชั้น**: `resolveWatchersForCard` = "ใครสนใจการ์ดใบนี้" (ผู้รับผิดชอบนับด้วยเสมอ ตาม S2.4) · `notifiableWatchersForCard` = "ใครควรได้ใบจริง" (กรองคนที่เปิดบอร์ดไม่ได้ตอนนี้ออก) แล้ว `notifyWatchers` ใช้ตัวหลัง — เพราะ `setCardAssignees` มอบหมายพนักงานคนไหนของร้านก็ได้โดยไม่ต้องเป็นสมาชิกบอร์ด ⇒ ถ้าไม่กรอง ข่าวของบอร์ด PRIVATE (ชื่อการ์ด/ความเห็น) จะหลุดถึงคนนอกบอร์ด และลิงก์ในใบก็พาเขาไป 404 อยู่ดี · ใบ "ได้รับมอบหมายงาน" ยังส่งถึงเขาเหมือนเดิม (พฤติกรรมเดิมของ `notifyCardAssigned` ไม่ถูกแตะ)
3. **"สรุปรายชั่วโมง" กวาดเฉพาะใบของบอร์ดงาน** (`body` มี `/kanban/` = ลิงก์ลึกที่ทุกใบของโมดูลนี้มีเสมอ): `AppNotification` เป็นตารางกลางของทั้งแพลตฟอร์ม (ขาย/สต็อก/อนุมัติเขียนลงที่เดียวกัน) — ค่าที่ผู้ใช้ตั้งในหน้า "บอร์ดงาน" ต้องไม่ไปสั่งอีเมลของโมดูลที่เขาไม่เคยเปิด (ยืนยันด้วยข้อมูลจริงบน QC: มีใบ "ลูกค้าจ่ายแล้ว (พร้อมเพย์)" ของอีกร้านค้างอยู่ในหน้าต่าง 24 ชม.)
4. **`notifyKanbanUser` ประทับ `emailedAt` เองเมื่อ `email: true`** (mention/assign ที่ส่งทันที) — ไม่งั้นรอบสรุปรายชั่วโมงจะเก็บใบเดิมไปส่งซ้ำอีกฉบับ
5. **เมนู ⋯ ของคอลัมน์เปิดให้ทุกบทบาทแล้ว** (เดิม `canEdit` เท่านั้น) เพราะ "ติดตามคอลัมน์" เป็นของส่วนตัวที่ VIEWER ต้องทำได้ · รายการที่แก้งานจริงยังกันด้วย `canEdit`/`isAdmin` ทีละรายการเหมือนเดิม
6. **`เลื่อนกำหนดส่ง → ล้าง `reminderSentAt`** ใน `updateCardFields` (เดิมล้างเฉพาะตอน `dueAt = null`) — ตาม S5.3 และตามความหมายของฟิลด์ ("เตือนของรอบเดิมไปแล้ว")
